import { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu, Tray, protocol, nativeImage } from 'electron';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { readFile, readdir, stat, writeFile, mkdir, copyFile } from 'fs/promises';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { parseFile } from 'music-metadata';
import Database from 'better-sqlite3';
import { autoUpdater } from 'electron-updater';
import type { Track, Playlist, AppSettings, AppTheme } from '@music/core';
import { generateId, DEFAULT_SETTINGS } from '@music/core';

// ─── Protocol Registration ──────────────────────────────────────────────────
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { stream: true, bypassCSP: true, secure: true, supportFetchAPI: true } }
]);

// ─── Window & Tray ───────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayMenuWindow: BrowserWindow | null = null;
let updaterReady = false;
let isQuitting = false;

type TrayPlayerCommand = 'toggle-play' | 'next-track' | 'previous-track' | 'toggle-shuffle' | 'toggle-repeat';
let trayMenuMode: 'left' | 'right' | null = null;
let trayMenuCloseTimer: ReturnType<typeof setTimeout> | null = null;

type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'unsupported'
  | 'error';

type UpdaterState = {
  status: UpdaterStatus;
  currentVersion: string;
  latestVersion?: string;
  progress?: number;
  message?: string;
};

let updaterState: UpdaterState = {
  status: 'idle',
  currentVersion: app.getVersion(),
};

function setUpdaterState(next: Partial<UpdaterState>) {
  updaterState = {
    ...updaterState,
    ...next,
    currentVersion: next.currentVersion ?? updaterState.currentVersion ?? app.getVersion(),
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updates:status', updaterState);
  }
}

function initAutoUpdater() {
  if (updaterReady) return;
  updaterReady = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdaterState({
      status: 'checking',
      currentVersion: app.getVersion(),
      progress: undefined,
      message: undefined,
    });
  });

  autoUpdater.on('update-available', info => {
    setUpdaterState({
      status: 'available',
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      progress: undefined,
      message: info.releaseName || undefined,
    });
  });

  autoUpdater.on('update-not-available', info => {
    setUpdaterState({
      status: 'up_to_date',
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      progress: undefined,
      message: undefined,
    });
  });

  autoUpdater.on('download-progress', progress => {
    setUpdaterState({
      status: 'downloading',
      progress: Math.max(0, Math.min(100, Math.round(progress.percent || 0))),
      message: undefined,
    });
  });

  autoUpdater.on('update-downloaded', info => {
    setUpdaterState({
      status: 'downloaded',
      latestVersion: info.version,
      progress: 100,
      message: undefined,
    });
  });

  autoUpdater.on('error', error => {
    setUpdaterState({
      status: 'error',
      progress: undefined,
      message: error == null ? 'Unknown updater error' : String(error.message || error),
    });
  });
}

// ─── Database setup ──────────────────────────────────────────────────────────
let userDataPath: string;
let dbPath: string;
let db: Database.Database;
let firstRunMarkerPath: string;

function ensurePlaylistArtworkColumn() {
  try {
    const playlistCols = (db.prepare('PRAGMA table_info(playlists)').all() as any[]).map(r => r.name);
    if (!playlistCols.includes('coverArt')) {
      db.prepare('ALTER TABLE playlists ADD COLUMN coverArt TEXT').run();
    }
    if (!playlistCols.includes('artworkData')) {
      db.prepare('ALTER TABLE playlists ADD COLUMN artworkData TEXT').run();
    }

    const trackCols = (db.prepare('PRAGMA table_info(tracks)').all() as any[]).map(r => r.name);
    if (!trackCols.includes('artworkPath')) {
      db.prepare('ALTER TABLE tracks ADD COLUMN artworkPath TEXT').run();
    }
  } catch {
    // ignore
  }
}

function initDb() {
  userDataPath = app.getPath('userData');
  dbPath = join(userDataPath, 'music.db');
  firstRunMarkerPath = join(userDataPath, '.first-run-complete');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT, artist TEXT, album TEXT, genre TEXT,
      duration REAL, filePath TEXT UNIQUE, artworkData TEXT, artworkPath TEXT,
      year INTEGER, trackNumber INTEGER, format TEXT,
      size INTEGER, addedAt INTEGER, lastPlayedAt INTEGER, playCount INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL, description TEXT, coverArt TEXT, artworkData TEXT,
      createdAt INTEGER, updatedAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlistId TEXT, trackId TEXT, position INTEGER,
      PRIMARY KEY (playlistId, trackId)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT
    );
  `);

  // Lightweight schema migrations for existing users.
  ensurePlaylistArtworkColumn();
  
  // Background migration for RAM optimization: move base64 artwork to files.
  setTimeout(migrateTrackArtwork, 250);
}

function migrateTrackArtwork() {
  try {
    const tracksWithBase64 = db.prepare('SELECT id, filePath, artworkData FROM tracks WHERE artworkPath IS NULL AND artworkData IS NOT NULL LIMIT 1000').all() as any[];
    if (tracksWithBase64.length === 0) return;

    const thumbsDir = join(userDataPath, 'thumbnails');
    if (!existsSync(thumbsDir)) mkdirSync(thumbsDir, { recursive: true });

    const update = db.prepare('UPDATE tracks SET artworkPath = ? WHERE id = ?');
    
    for (const track of tracksWithBase64) {
      try {
        if (!track.artworkData || !track.artworkData.startsWith('data:')) continue;
        const parts = track.artworkData.split(',');
        const base64Data = parts[1];
        if (!base64Data) continue;
        
        const hash = createHash('md5').update(track.filePath).digest('hex');
        const match = track.artworkData.match(/data:image\/([^;]+);/);
        const ext = (match ? match[1] : 'jpg').replace('jpeg', 'jpg');
        const dest = join(thumbsDir, `${hash}.${ext}`);
        
        if (!existsSync(dest)) {
          writeFileSync(dest, Buffer.from(base64Data, 'base64'));
        }
        update.run(dest, track.id);
      } catch (e) {
        // Silently skip corrupted records
      }
    }
    
    // Continue in chunks to avoid blocking the thread too much
    if (tracksWithBase64.length === 1000) {
      setTimeout(migrateTrackArtwork, 250);
    }
  } catch (err) {
    console.error('Artwork migration error:', err);
  }
}

// ─── Settings helpers ─────────────────────────────────────────────────────────
function getSettings(): AppSettings {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app') as any;
  if (row) return JSON.parse(row.value);
  return DEFAULT_SETTINGS;
}

function saveSettings(s: AppSettings) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('app', JSON.stringify(s));
}

function restoreMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setSkipTaskbar(false);
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.moveTop();
  mainWindow.focus();
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }, 32);
}

function sendTrayPlayerCommand(command: TrayPlayerCommand) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('tray:player-command', command);
}

function closeTrayMenu(animated = true) {
  const menu = trayMenuWindow;
  if (trayMenuCloseTimer) {
    clearTimeout(trayMenuCloseTimer);
    trayMenuCloseTimer = null;
  }
  if (!menu || menu.isDestroyed()) return;

  if (!animated) {
    trayMenuWindow = null;
    trayMenuMode = null;
    menu.close();
    return;
  }

  menu.webContents.executeJavaScript("document.body.classList.add('closing')").catch(() => undefined);
  trayMenuCloseTimer = setTimeout(() => {
    if (!menu.isDestroyed()) menu.close();
    if (trayMenuWindow === menu) {
      trayMenuWindow = null;
      trayMenuMode = null;
    }
    trayMenuCloseTimer = null;
  }, 180);
}

function createTrayMenu(mode: 'left' | 'right' = 'left') {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    if (trayMenuMode === mode) {
      closeTrayMenu();
      return;
    }
    closeTrayMenu(false);
  }
  trayMenuMode = mode;

  const MENU_W = mode === 'right' ? 140 : 320;
  const MENU_H = mode === 'right' ? 76 : 228;

  trayMenuWindow = new BrowserWindow({
    width: MENU_W,
    height: MENU_H,
    frame: false,
    backgroundColor: '#00000000',
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Position relative to tray icon
  let x: number, y: number;
  const { screen } = require('electron');
  
  if (tray) {
    const trayBounds = tray.getBounds();
    const activeDisplay = screen.getDisplayMatching(trayBounds);
    const { width: sw, height: sh, x: sx, y: sy } = activeDisplay.workArea;

    // Center horizontally above the tray icon
    x = Math.round(trayBounds.x + (trayBounds.width / 2) - (MENU_W / 2));
    // Determine vertically (default bottom taskbar)
    y = Math.round(trayBounds.y - MENU_H - 4);

    // Safety checks for other taskbar positions
    if (y < sy) {
      // Taskbar is at the top
      y = Math.round(trayBounds.y + trayBounds.height + 4);
    }
    
    // Boundary checks
    if (x + MENU_W > sw + sx) x = Math.round(sw + sx - MENU_W - 8);
    if (x < sx) x = Math.round(sx + 8);
    if (y + MENU_H > sh + sy) y = Math.round(sh + sy - MENU_H - 8);

    trayMenuWindow.setPosition(x, y);
  } else {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: sw, height: sh, x: sx, y: sy } = primaryDisplay.workArea;
    x = Math.round(sw + sx - MENU_W - 8);
    y = Math.round(sh + sy - MENU_H - 8);
    trayMenuWindow.setPosition(x, y);
  }

  const menuHtml = join(__dirname, 'tray-menu.html');
  console.log('Loading tray menu from:', menuHtml);
  const menuWindow = trayMenuWindow;

  trayMenuWindow.loadFile(menuHtml, { search: `mode=${mode}` }).catch(err => {
    console.error('Failed to load tray menu HTML:', err);
  });

  trayMenuWindow.once('ready-to-show', () => {
    if (!trayMenuWindow) return;
    trayMenuWindow.show();
    trayMenuWindow.focus();
    // Ensure it's truly on top
    trayMenuWindow.setAlwaysOnTop(true, 'screen-saver');
  });

  trayMenuWindow.on('blur', () => {
    closeTrayMenu();
  });
  
  trayMenuWindow.on('closed', () => {
    if (trayMenuWindow === menuWindow) {
      trayMenuWindow = null;
      trayMenuMode = null;
    }
  });
}

function createTray() {
  if (tray) return tray;
  const trayIconPath = [
    join(process.resourcesPath, 'build', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
    join(__dirname, '../build/icon.png'),
  ].find(candidate => existsSync(candidate));
  const trayIconBase = trayIconPath ? nativeImage.createFromPath(trayIconPath) : nativeImage.createEmpty();
  const trayIcon = trayIconBase.isEmpty()
    ? trayIconBase
    : trayIconBase.resize({
        width: process.platform === 'win32' ? 20 : 22,
        height: process.platform === 'win32' ? 20 : 22,
        quality: 'best',
      });
  tray = new Tray(trayIcon);
  tray.setIgnoreDoubleClickEvents(true);
  tray.setToolTip('NOCTRA');
  tray.on('click', () => createTrayMenu('left'));
  tray.on('right-click', () => createTrayMenu('left'));
  return tray;
}

function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  createTray();
  mainWindow.setSkipTaskbar(true);
  mainWindow.hide();
}

function consumeFirstRunState() {
  const isFirstRun = !existsSync(firstRunMarkerPath);
  if (isFirstRun) {
    try {
      writeFileSync(firstRunMarkerPath, String(Date.now()));
    } catch {
      // ignore marker write errors
    }
  }
  return isFirstRun;
}

// ─── Create window ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 740,
    minWidth: 940,
    minHeight: 700,
    show: false,
    backgroundColor: '#000000',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  if (!app.isPackaged) {
    const url = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
    console.log('Loading Dev URL:', url);
    mainWindow.loadURL(url);
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
    
    // Disable developer tools keyboard shortcuts
    mainWindow.webContents.on('before-input-event', (event, input) => {
      // Disable F12, Ctrl+Shift+I, Ctrl+Shift+C
      if (
        input.key.toLowerCase() === 'f12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.control && input.shift && input.key.toLowerCase() === 'c')
      ) {
        event.preventDefault();
      }
    });
    
    // Disable right-click context menu
    mainWindow.webContents.on('context-menu', event => {
      event.preventDefault();
    });
  } else {
    mainWindow.loadFile(join(__dirname, '../dist-renderer/index.html'));
  }

  const sendMaximizeState = () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('window:maximize-changed', mainWindow.isMaximized());
  };

  mainWindow.on('maximize', sendMaximizeState);
  mainWindow.on('unmaximize', sendMaximizeState);
  mainWindow.on('enter-full-screen', sendMaximizeState);
  mainWindow.on('leave-full-screen', sendMaximizeState);
  mainWindow.on('close', event => {
    if (isQuitting) return;
    const settings = getSettings();
    if (settings.closeAction === 'tray') {
      event.preventDefault();
      hideToTray();
    } else {
      isQuitting = true;
    }
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Register custom protocol to serve local files
  (protocol as any).registerFileProtocol('media', (request: any, callback: any) => {
    const filePath = decodeURIComponent(request.url.replace('media:///', ''));
    callback({ path: filePath });
  });

  console.log('UserData:', app.getPath('userData'));
  initDb();
  console.log('DB initialized');
  createWindow();

  if (mainWindow) {
    mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
      console.error('Window failed to load:', code, desc);
    });
    mainWindow.webContents.on('dom-ready', () => {
      console.log('DOM Ready');
      mainWindow?.webContents.send('updates:status', updaterState);
    });
  }

  app.on('activate', () => {
    if (!mainWindow) createWindow();
    else restoreMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  closeTrayMenu(false);
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

// ─── IPC: Window Controls ─────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// ─── IPC: Tray Menu ───────────────────────────────────────────────────────────
let lastPlayerState: any = null;

ipcMain.on('player:state-sync', (_event, state) => {
  lastPlayerState = state;
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.webContents.send('tray:update-state', state);
  }
});

ipcMain.on('tray-menu:open', () => {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) { trayMenuWindow.close(); trayMenuWindow = null; }
  restoreMainWindow();
});

ipcMain.on('tray-menu:command', (_event, command: TrayPlayerCommand) => {
  sendTrayPlayerCommand(command);
});

ipcMain.on('tray-menu:get-state', (event) => {
  event.reply('tray:update-state', lastPlayerState);
});

ipcMain.on('tray-menu:close', () => {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.close();
    trayMenuWindow = null;
  }
});

ipcMain.on('tray-menu:exit', () => {
  isQuitting = true;
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) { trayMenuWindow.destroy(); trayMenuWindow = null; }
  tray?.destroy();
  tray = null;
  mainWindow?.destroy();
  app.quit();
});
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:consumeFirstRun', () => consumeFirstRunState());
ipcMain.handle('updates:getState', () => updaterState);
ipcMain.handle('updates:check', async () => {
  if (!app.isPackaged) {
    setUpdaterState({
      status: 'unsupported',
      currentVersion: app.getVersion(),
      latestVersion: undefined,
      progress: undefined,
      message: 'Updater works after packaged build and release publish.',
    });
    return updaterState;
  }

  initAutoUpdater();
  await autoUpdater.checkForUpdates();
  return updaterState;
});
ipcMain.handle('updates:download', async () => {
  if (!app.isPackaged) {
    setUpdaterState({
      status: 'unsupported',
      message: 'Updater works after packaged build and release publish.',
    });
    return updaterState;
  }

  initAutoUpdater();
  await autoUpdater.downloadUpdate();
  return updaterState;
});
ipcMain.handle('updates:install', async () => {
  if (updaterState.status === 'downloaded') {
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return true;
  }
  return false;
});

// ─── IPC: Files ──────────────────────────────────────────────────────────────
ipcMain.handle('dialog:openFiles', async () => {
  const res = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3','flac','wav','ogg','aac','m4a','opus','wma','aiff'] }],
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('dialog:openImages', async () => {
  const res = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{
      name: 'Images',
      extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif', 'ico', 'tif', 'tiff'],
    }],
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('dialog:openJson', async () => {
  const res = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('dialog:saveJson', async (_, { defaultFileName }: { defaultFileName?: string }) => {
  const res = await dialog.showSaveDialog({
    defaultPath: defaultFileName || 'playlists-export.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  return res.canceled ? null : res.filePath || null;
});

ipcMain.handle('dialog:openFolder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('file:readAsBase64', async (_, filePath: string) => {
  try {
    const buf = await readFile(filePath);
    return buf.toString('base64');
  } catch { return null; }
});

ipcMain.handle('file:readText', async (_, filePath: string) => {
  try {
    return await readFile(filePath, 'utf8');
  } catch { return null; }
});

ipcMain.handle('file:writeText', async (_, { filePath, content }: { filePath: string; content: string }) => {
  try {
    await writeFile(filePath, content, 'utf8');
    return true;
  } catch { return false; }
});

// ─── IPC: Metadata ────────────────────────────────────────────────────────────
const FOLDER_COVER_NAMES = new Set(['cover', 'folder', 'albumart', 'front', 'album']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

async function findFolderArtwork(filePath: string) {
  const separatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const folderPath = separatorIndex >= 0 ? filePath.slice(0, separatorIndex) : '.';
  try {
    const entries = await readdir(folderPath, { withFileTypes: true });
    const image = entries
      .filter(entry => entry.isFile())
      .map(entry => {
        const dotIndex = entry.name.lastIndexOf('.');
        const name = dotIndex >= 0 ? entry.name.slice(0, dotIndex).toLowerCase() : entry.name.toLowerCase();
        const extension = dotIndex >= 0 ? entry.name.slice(dotIndex + 1).toLowerCase() : '';
        return { entry, name, extension };
      })
      .find(item => FOLDER_COVER_NAMES.has(item.name) && IMAGE_EXTENSIONS.has(item.extension));
    if (!image) return undefined;
    const format = image.extension === 'jpg' || image.extension === 'jpeg' ? 'image/jpeg' : `image/${image.extension}`;
    return { data: await readFile(join(folderPath, image.entry.name)), format };
  } catch {
    return undefined;
  }
}

ipcMain.handle('metadata:parse', async (_, filePath: string): Promise<Partial<Track>> => {
  try {
    const s = await stat(filePath);
    const meta = await parseFile(filePath, { duration: true, skipCovers: false });
    const common = meta.common;

    let artworkData: string | undefined;
    let artworkPath: string | undefined;

    const picture = common.picture?.[0];
    const folderArtwork = picture ? undefined : await findFolderArtwork(filePath);
    if (picture || folderArtwork) {
      const artworkBuffer = picture?.data || folderArtwork!.data;
      const artworkFormat = picture?.format || folderArtwork!.format;
      
      // Memory Optimization: Save as file instead of holding massive Base64 strings if library grows.
      try {
        const thumbsDir = join(userDataPath, 'thumbnails');
        await mkdir(thumbsDir, { recursive: true });
        
        // Hash the file path to get a stable thumbnail name
        const hash = createHash('md5').update(filePath).digest('hex');
        const ext = artworkFormat.split('/').pop() || 'jpg';
        const dest = join(thumbsDir, `${hash}.${ext}`);
        
        if (!existsSync(dest)) {
          await writeFile(dest, artworkBuffer);
        }
        artworkPath = dest;
      } catch (e) {
        // Fallback to Base64 only if FS fails
        artworkData = `data:${artworkFormat};base64,${artworkBuffer.toString('base64')}`;
      }
    }

    return {
      title: common.title || filePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') || 'Unknown',
      artist: common.artist || common.albumartist || 'Unknown Artist',
      album: common.album || 'Unknown Album',
      genre: (common.genre || ['Unknown'])[0],
      duration: meta.format.duration || 0,
      artworkData,
      artworkPath,
      year: common.year,
      trackNumber: common.track?.no || undefined,
      format: meta.format.container || 'Unknown',
      size: s.size,
    };
  } catch(e) {
    console.error('metadata parse error', e);
    return {};
  }
});

// Scan folder recursively for audio files
const AUDIO_EXTS = new Set(['mp3','flac','wav','ogg','aac','m4a','opus','wma','aiff','ape']);

async function scanFolder(folderPath: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else {
          const ext = e.name.split('.').pop()?.toLowerCase();
          if (ext && AUDIO_EXTS.has(ext)) results.push(full);
        }
      }
    } catch { /* skip inaccessible dirs */ }
  }
  await walk(folderPath);
  return results;
}

ipcMain.handle('folder:scan', async (_, folderPath: string) => {
  return await scanFolder(folderPath);
});

// ─── IPC: Library (SQLite) ────────────────────────────────────────────────────
ipcMain.handle('library:getAll', () => {
  const tracks = db.prepare('SELECT * FROM tracks ORDER BY addedAt DESC').all() as (Track & { artworkPath?: string })[];
  // Massive memory optimization: don't load huge base64 strings into JS heap if we have a file path.
  return tracks.map(t => {
    if (t.artworkPath) delete t.artworkData;
    return t;
  });
});

ipcMain.handle('library:addTracks', (_, tracks: Track[]) => {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO tracks
    (id, title, artist, album, genre, duration, filePath, artworkData, artworkPath, year, trackNumber, format, size, addedAt, playCount)
    VALUES
    (@id, @title, @artist, @album, @genre, @duration, @filePath, @artworkData, @artworkPath, @year, @trackNumber, @format, @size, @addedAt, @playCount)
  `);
  const insertMany = db.transaction((ts: Track[]) => {
    for (const t of ts) insert.run(t);
  });
  insertMany(tracks);
});

ipcMain.handle('library:removeTrack', (_, id: string) => {
  db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
  db.prepare('DELETE FROM playlist_tracks WHERE trackId = ?').run(id);
});

ipcMain.handle('library:clearAll', () => {
  const clearLibrary = db.transaction(() => {
    db.prepare('DELETE FROM playlist_tracks').run();
    db.prepare('DELETE FROM tracks').run();
  });
  clearLibrary();
});

ipcMain.handle('library:updateTrack', (_, track: { id: string; title?: string; artist?: string; album?: string; genre?: string; year?: number; trackNumber?: number }) => {
  const existing = db.prepare('SELECT * FROM tracks WHERE id = ?').get(track.id) as Track | undefined;
  if (!existing) return false;
  
  db.prepare(`
    UPDATE tracks SET 
      title = COALESCE(?, title),
      artist = COALESCE(?, artist),
      album = COALESCE(?, album),
      genre = COALESCE(?, genre),
      year = COALESCE(?, year),
      trackNumber = COALESCE(?, trackNumber)
    WHERE id = ?
  `).run(
    track.title ?? null,
    track.artist ?? null,
    track.album ?? null,
    track.genre ?? null,
    track.year ?? null,
    track.trackNumber ?? null,
    track.id
  );
  return true;
});

ipcMain.handle('library:updateArtwork', (_, { id, artworkData }: { id: string, artworkData: string }) => {
  db.prepare('UPDATE tracks SET artworkData = ? WHERE id = ?').run(artworkData, id);
  return true;
});

ipcMain.handle('library:setArtworkFromFile', async (_, { id, filePath }: { id: string, filePath: string }) => {
  try {
    const buf = await readFile(filePath);
    const format = filePath.split('.').pop()?.toLowerCase() || 'jpeg';
    const artworkData = `data:image/${format};base64,${buf.toString('base64')}`;
    db.prepare('UPDATE tracks SET artworkData = ? WHERE id = ?').run(artworkData, id);
    return artworkData;
  } catch (e) {
    console.error('Failed to set artwork from file', e);
    return null;
  }
});

ipcMain.handle('library:updatePlayCount', (_, id: string) => {
  db.prepare('UPDATE tracks SET playCount = playCount + 1, lastPlayedAt = ? WHERE id = ?').run(Date.now(), id);
});

ipcMain.handle('library:search', (_, query: string) => {
  const q = `%${query}%`;
  return db.prepare('SELECT * FROM tracks WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? OR genre LIKE ? ORDER BY title').all(q, q, q, q);
});

// ─── IPC: Playlists ───────────────────────────────────────────────────────────
ipcMain.handle('playlists:getAll', () => {
  const pl = db.prepare('SELECT * FROM playlists ORDER BY updatedAt DESC').all() as Playlist[];
  return pl.map((p: any) => ({
    ...p,
    trackIds: (db.prepare('SELECT trackId FROM playlist_tracks WHERE playlistId = ? ORDER BY position').all(p.id) as any[]).map((r: any) => r.trackId),
  }));
});

ipcMain.handle('playlists:create', (_, name: string) => {
  const id = generateId();
  const now = Date.now();
  db.prepare('INSERT INTO playlists (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)').run(id, name, now, now);
  return id;
});

ipcMain.handle('playlists:updateArtwork', (_, { id, artworkData }: { id: string, artworkData: string }) => {
  try {
    db.prepare('UPDATE playlists SET artworkData = ?, updatedAt = ? WHERE id = ?').run(artworkData, Date.now(), id);
  } catch (e) {
    // If user DB predates `artworkData`, add it and retry once.
    if (String((e as any)?.message || '').includes('no such column: artworkData')) {
      ensurePlaylistArtworkColumn();
      db.prepare('UPDATE playlists SET artworkData = ?, updatedAt = ? WHERE id = ?').run(artworkData, Date.now(), id);
      return;
    }
    throw e;
  }
});

ipcMain.handle('playlists:setCoverFromFile', async (_, { id, filePath }: { id: string, filePath: string }) => {
  ensurePlaylistArtworkColumn();

  const coversDir = join(userDataPath, 'covers');
  await mkdir(coversDir, { recursive: true });

  const extRaw = filePath.split('.').pop()?.toLowerCase() ?? 'img';
  const safeExt = extRaw.replace(/[^a-z0-9]+/g, '').slice(0, 8) || 'img';
  const destPath = join(coversDir, `${id}.${safeExt}`);

  await copyFile(filePath, destPath);

  // Store absolute path so renderer can load via media:/// protocol.
  db.prepare('UPDATE playlists SET coverArt = ?, artworkData = NULL, updatedAt = ? WHERE id = ?')
    .run(destPath, Date.now(), id);

  return destPath;
});

ipcMain.handle('playlists:rename', (_, { id, name }: { id: string, name: string }) => {
  db.prepare('UPDATE playlists SET name = ?, updatedAt = ? WHERE id = ?').run(name, Date.now(), id);
});

ipcMain.handle('playlists:delete', (_, id: string) => {
  db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
  db.prepare('DELETE FROM playlist_tracks WHERE playlistId = ?').run(id);
});

ipcMain.handle('playlists:addTrack', (_, { playlistId, trackId }: { playlistId: string, trackId: string }) => {
  const max = (db.prepare('SELECT MAX(position) as m FROM playlist_tracks WHERE playlistId = ?').get(playlistId) as any)?.m ?? -1;
  db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlistId, trackId, position) VALUES (?, ?, ?)').run(playlistId, trackId, max + 1);
  db.prepare('UPDATE playlists SET updatedAt = ? WHERE id = ?').run(Date.now(), playlistId);
});

ipcMain.handle('playlists:addTracks', (_, { playlistId, trackIds }: { playlistId: string, trackIds: string[] }) => {
  const uniqueTrackIds = [...new Set(trackIds)];
  const max = (db.prepare('SELECT MAX(position) as m FROM playlist_tracks WHERE playlistId = ?').get(playlistId) as any)?.m ?? -1;
  const insert = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlistId, trackId, position) VALUES (?, ?, ?)');

  const tx = db.transaction(() => {
    uniqueTrackIds.forEach((trackId, index) => {
      insert.run(playlistId, trackId, max + index + 1);
    });
    db.prepare('UPDATE playlists SET updatedAt = ? WHERE id = ?').run(Date.now(), playlistId);
  });

  tx();
});

ipcMain.handle('playlists:removeTrack', (_, { playlistId, trackId }: { playlistId: string, trackId: string }) => {
  db.prepare('DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?').run(playlistId, trackId);
});

ipcMain.handle('playlists:removeTracks', (_, { playlistId, trackIds }: { playlistId: string, trackIds: string[] }) => {
  const del = db.prepare('DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?');
  const tx = db.transaction(() => {
    trackIds.forEach(tid => del.run(playlistId, tid));
    db.prepare('UPDATE playlists SET updatedAt = ? WHERE id = ?').run(Date.now(), playlistId);
  });
  tx();
});

ipcMain.handle('playlists:reorder', (_, { playlistId, trackIds }: { playlistId: string, trackIds: string[] }) => {
  const update = db.prepare('UPDATE playlist_tracks SET position = ? WHERE playlistId = ? AND trackId = ?');
  const tx = db.transaction(() => {
    trackIds.forEach((tid, i) => update.run(i, playlistId, tid));
  });
  tx();
});

// ─── IPC: Settings ────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', () => getSettings());
ipcMain.handle('settings:save', (_, settings: AppSettings) => saveSettings(settings));

// ─── IPC: Lyrics ─────────────────────────────────────────────────────────────
ipcMain.handle('lyrics:fetchOnline', async (_, { title, artist, album, duration }: { title: string, artist: string, album?: string, duration?: number }) => {
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (album) params.set('album_name', album);
    if (duration) params.set('duration', String(Math.round(duration)));
    const res = await fetch(`https://lrclib.net/api/get?${params}`);
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data.syncedLyrics || data.plainLyrics || null;
  } catch { return null; }
});

ipcMain.handle('lyrics:loadLocal', async (_, filePath: string) => {
  const lrcPath = filePath.replace(/\.[^/.]+$/, '.lrc');
  if (!existsSync(lrcPath)) return null;
  try { return await readFile(lrcPath, 'utf-8'); } catch { return null; }
});

ipcMain.handle('lyrics:saveLocal', async (_, { filePath, content }: { filePath: string, content: string }) => {
  const lrcPath = filePath.replace(/\.[^/.]+$/, '.lrc');
  try {
    await writeFile(lrcPath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

// ─── IPC: Theme ───────────────────────────────────────────────────────────────
ipcMain.on('theme:set', (_, mode: AppTheme) => {
  // Map custom themes to dark/light for native OS titlebar overlay
  if (mode === 'light') {
    nativeTheme.themeSource = 'light';
  } else if (mode === 'system') {
    nativeTheme.themeSource = 'system';
  } else {
    nativeTheme.themeSource = 'dark';
  }
});
