"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron = require("electron");
var import_path = require("path");
var import_promises = require("fs/promises");
var import_fs = require("fs");
var import_crypto = require("crypto");
var import_music_metadata = require("music-metadata");
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_electron_updater = require("electron-updater");

// ../../packages/core/src/index.ts
var EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1e3, 2e3, 4e3, 8e3, 16e3];
var DEFAULT_SETTINGS = {
  theme: "system",
  language: "system",
  closeAction: "exit",
  accentColor: "#94a3b8",
  eq: {
    enabled: false,
    presetName: "Flat",
    bands: EQ_FREQUENCIES.map((f) => ({ frequency: f, gain: 0 }))
  },
  lastVolume: 0.5,
  crossfadeDuration: 0,
  showVisualizer: true,
  playerLayout: "spotlight",
  libraryViewMode: "list",
  startupTab: "songs",
  lastLibraryTab: "songs"
};
function generateId() {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// electron/main.ts
import_electron.protocol.registerSchemesAsPrivileged([
  { scheme: "media", privileges: { stream: true, bypassCSP: true, secure: true, supportFetchAPI: true } }
]);
var mainWindow = null;
var tray = null;
var trayMenuWindow = null;
var updaterReady = false;
var isQuitting = false;
var trayMenuMode = null;
var trayMenuCloseTimer = null;
var updaterState = {
  status: "idle",
  currentVersion: import_electron.app.getVersion()
};
function setUpdaterState(next) {
  updaterState = {
    ...updaterState,
    ...next,
    currentVersion: next.currentVersion ?? updaterState.currentVersion ?? import_electron.app.getVersion()
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updates:status", updaterState);
  }
}
function initAutoUpdater() {
  if (updaterReady) return;
  updaterReady = true;
  import_electron_updater.autoUpdater.autoDownload = false;
  import_electron_updater.autoUpdater.autoInstallOnAppQuit = true;
  import_electron_updater.autoUpdater.on("checking-for-update", () => {
    setUpdaterState({
      status: "checking",
      currentVersion: import_electron.app.getVersion(),
      progress: void 0,
      message: void 0
    });
  });
  import_electron_updater.autoUpdater.on("update-available", (info) => {
    setUpdaterState({
      status: "available",
      currentVersion: import_electron.app.getVersion(),
      latestVersion: info.version,
      progress: void 0,
      message: info.releaseName || void 0
    });
  });
  import_electron_updater.autoUpdater.on("update-not-available", (info) => {
    setUpdaterState({
      status: "up_to_date",
      currentVersion: import_electron.app.getVersion(),
      latestVersion: info.version,
      progress: void 0,
      message: void 0
    });
  });
  import_electron_updater.autoUpdater.on("download-progress", (progress) => {
    setUpdaterState({
      status: "downloading",
      progress: Math.max(0, Math.min(100, Math.round(progress.percent || 0))),
      message: void 0
    });
  });
  import_electron_updater.autoUpdater.on("update-downloaded", (info) => {
    setUpdaterState({
      status: "downloaded",
      latestVersion: info.version,
      progress: 100,
      message: void 0
    });
  });
  import_electron_updater.autoUpdater.on("error", (error) => {
    setUpdaterState({
      status: "error",
      progress: void 0,
      message: error == null ? "Unknown updater error" : String(error.message || error)
    });
  });
}
var userDataPath;
var dbPath;
var db;
var firstRunMarkerPath;
function ensurePlaylistArtworkColumn() {
  try {
    const playlistCols = db.prepare("PRAGMA table_info(playlists)").all().map((r) => r.name);
    if (!playlistCols.includes("coverArt")) {
      db.prepare("ALTER TABLE playlists ADD COLUMN coverArt TEXT").run();
    }
    if (!playlistCols.includes("artworkData")) {
      db.prepare("ALTER TABLE playlists ADD COLUMN artworkData TEXT").run();
    }
    const trackCols = db.prepare("PRAGMA table_info(tracks)").all().map((r) => r.name);
    if (!trackCols.includes("artworkPath")) {
      db.prepare("ALTER TABLE tracks ADD COLUMN artworkPath TEXT").run();
    }
  } catch {
  }
}
function initDb() {
  userDataPath = import_electron.app.getPath("userData");
  dbPath = (0, import_path.join)(userDataPath, "music.db");
  firstRunMarkerPath = (0, import_path.join)(userDataPath, ".first-run-complete");
  db = new import_better_sqlite3.default(dbPath);
  db.pragma("journal_mode = WAL");
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
  ensurePlaylistArtworkColumn();
  setTimeout(migrateTrackArtwork, 250);
}
function migrateTrackArtwork() {
  try {
    const tracksWithBase64 = db.prepare("SELECT id, filePath, artworkData FROM tracks WHERE artworkPath IS NULL AND artworkData IS NOT NULL LIMIT 1000").all();
    if (tracksWithBase64.length === 0) return;
    const thumbsDir = (0, import_path.join)(userDataPath, "thumbnails");
    if (!(0, import_fs.existsSync)(thumbsDir)) (0, import_fs.mkdirSync)(thumbsDir, { recursive: true });
    const update = db.prepare("UPDATE tracks SET artworkPath = ? WHERE id = ?");
    for (const track of tracksWithBase64) {
      try {
        if (!track.artworkData || !track.artworkData.startsWith("data:")) continue;
        const parts = track.artworkData.split(",");
        const base64Data = parts[1];
        if (!base64Data) continue;
        const hash = (0, import_crypto.createHash)("md5").update(track.filePath).digest("hex");
        const match = track.artworkData.match(/data:image\/([^;]+);/);
        const ext = (match ? match[1] : "jpg").replace("jpeg", "jpg");
        const dest = (0, import_path.join)(thumbsDir, `${hash}.${ext}`);
        if (!(0, import_fs.existsSync)(dest)) {
          (0, import_fs.writeFileSync)(dest, Buffer.from(base64Data, "base64"));
        }
        update.run(dest, track.id);
      } catch (e) {
      }
    }
    if (tracksWithBase64.length === 1e3) {
      setTimeout(migrateTrackArtwork, 250);
    }
  } catch (err) {
    console.error("Artwork migration error:", err);
  }
}
function getSettings() {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("app");
  if (row) return JSON.parse(row.value);
  return DEFAULT_SETTINGS;
}
function saveSettings(s) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("app", JSON.stringify(s));
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
function sendTrayPlayerCommand(command) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("tray:player-command", command);
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
  menu.webContents.executeJavaScript("document.body.classList.add('closing')").catch(() => void 0);
  trayMenuCloseTimer = setTimeout(() => {
    if (!menu.isDestroyed()) menu.close();
    if (trayMenuWindow === menu) {
      trayMenuWindow = null;
      trayMenuMode = null;
    }
    trayMenuCloseTimer = null;
  }, 180);
}
function createTrayMenu(mode = "left") {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    if (trayMenuMode === mode) {
      closeTrayMenu();
      return;
    }
    closeTrayMenu(false);
  }
  trayMenuMode = mode;
  const MENU_W = mode === "right" ? 140 : 320;
  const MENU_H = mode === "right" ? 76 : 228;
  trayMenuWindow = new import_electron.BrowserWindow({
    width: MENU_W,
    height: MENU_H,
    frame: false,
    backgroundColor: "#00000000",
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  let x, y;
  const { screen } = require("electron");
  if (tray) {
    const trayBounds = tray.getBounds();
    const activeDisplay = screen.getDisplayMatching(trayBounds);
    const { width: sw, height: sh, x: sx, y: sy } = activeDisplay.workArea;
    x = Math.round(trayBounds.x + trayBounds.width / 2 - MENU_W / 2);
    y = Math.round(trayBounds.y - MENU_H - 4);
    if (y < sy) {
      y = Math.round(trayBounds.y + trayBounds.height + 4);
    }
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
  const menuHtml = (0, import_path.join)(__dirname, "tray-menu.html");
  console.log("Loading tray menu from:", menuHtml);
  const menuWindow = trayMenuWindow;
  trayMenuWindow.loadFile(menuHtml, { search: `mode=${mode}` }).catch((err) => {
    console.error("Failed to load tray menu HTML:", err);
  });
  trayMenuWindow.once("ready-to-show", () => {
    if (!trayMenuWindow) return;
    trayMenuWindow.show();
    trayMenuWindow.focus();
    trayMenuWindow.setAlwaysOnTop(true, "screen-saver");
  });
  trayMenuWindow.on("blur", () => {
    closeTrayMenu();
  });
  trayMenuWindow.on("closed", () => {
    if (trayMenuWindow === menuWindow) {
      trayMenuWindow = null;
      trayMenuMode = null;
    }
  });
}
function createTray() {
  if (tray) return tray;
  const trayIconPath = [
    (0, import_path.join)(process.resourcesPath, "build", "icon.png"),
    (0, import_path.join)(import_electron.app.getAppPath(), "build", "icon.png"),
    (0, import_path.join)(__dirname, "../build/icon.png")
  ].find((candidate) => (0, import_fs.existsSync)(candidate));
  const trayIconBase = trayIconPath ? import_electron.nativeImage.createFromPath(trayIconPath) : import_electron.nativeImage.createEmpty();
  const trayIcon = trayIconBase.isEmpty() ? trayIconBase : trayIconBase.resize({
    width: process.platform === "win32" ? 20 : 22,
    height: process.platform === "win32" ? 20 : 22,
    quality: "best"
  });
  tray = new import_electron.Tray(trayIcon);
  tray.setIgnoreDoubleClickEvents(true);
  tray.setToolTip("NOCTRA");
  tray.on("click", () => createTrayMenu("left"));
  tray.on("right-click", () => createTrayMenu("left"));
  return tray;
}
function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  createTray();
  mainWindow.setSkipTaskbar(true);
  mainWindow.hide();
}
function consumeFirstRunState() {
  const isFirstRun = !(0, import_fs.existsSync)(firstRunMarkerPath);
  if (isFirstRun) {
    try {
      (0, import_fs.writeFileSync)(firstRunMarkerPath, String(Date.now()));
    } catch {
    }
  }
  return isFirstRun;
}
function createWindow() {
  mainWindow = new import_electron.BrowserWindow({
    width: 1200,
    height: 740,
    minWidth: 940,
    minHeight: 700,
    show: false,
    backgroundColor: "#000000",
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: false,
    webPreferences: {
      preload: (0, import_path.join)(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  if (!import_electron.app.isPackaged) {
    const url = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
    console.log("Loading Dev URL:", url);
    mainWindow.loadURL(url);
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.key.toLowerCase() === "f12" || input.control && input.shift && input.key.toLowerCase() === "i" || input.control && input.shift && input.key.toLowerCase() === "c") {
        event.preventDefault();
      }
    });
    mainWindow.webContents.on("context-menu", (event) => {
      event.preventDefault();
    });
  } else {
    mainWindow.loadFile((0, import_path.join)(__dirname, "../dist-renderer/index.html"));
  }
  const sendMaximizeState = () => {
    if (!mainWindow) return;
    mainWindow.webContents.send("window:maximize-changed", mainWindow.isMaximized());
  };
  mainWindow.on("maximize", sendMaximizeState);
  mainWindow.on("unmaximize", sendMaximizeState);
  mainWindow.on("enter-full-screen", sendMaximizeState);
  mainWindow.on("leave-full-screen", sendMaximizeState);
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    const settings = getSettings();
    if (settings.closeAction === "tray") {
      event.preventDefault();
      hideToTray();
    } else {
      isQuitting = true;
    }
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
import_electron.app.whenReady().then(() => {
  import_electron.protocol.registerFileProtocol("media", (request, callback) => {
    const filePath = decodeURIComponent(request.url.replace("media:///", ""));
    callback({ path: filePath });
  });
  console.log("UserData:", import_electron.app.getPath("userData"));
  initDb();
  console.log("DB initialized");
  createWindow();
  if (mainWindow) {
    mainWindow.webContents.on("did-fail-load", (e, code, desc) => {
      console.error("Window failed to load:", code, desc);
    });
    mainWindow.webContents.on("dom-ready", () => {
      console.log("DOM Ready");
      mainWindow?.webContents.send("updates:status", updaterState);
    });
  }
  import_electron.app.on("activate", () => {
    if (!mainWindow) createWindow();
    else restoreMainWindow();
  });
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron.app.quit();
});
import_electron.app.on("will-quit", () => {
  closeTrayMenu(false);
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
import_electron.app.on("before-quit", () => {
  isQuitting = true;
});
import_electron.ipcMain.on("window:minimize", () => mainWindow?.minimize());
import_electron.ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
import_electron.ipcMain.on("window:close", () => mainWindow?.close());
var lastPlayerState = null;
import_electron.ipcMain.on("player:state-sync", (_event, state) => {
  lastPlayerState = state;
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.webContents.send("tray:update-state", state);
  }
});
import_electron.ipcMain.on("tray-menu:open", () => {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.close();
    trayMenuWindow = null;
  }
  restoreMainWindow();
});
import_electron.ipcMain.on("tray-menu:command", (_event, command) => {
  sendTrayPlayerCommand(command);
});
import_electron.ipcMain.on("tray-menu:get-state", (event) => {
  event.reply("tray:update-state", lastPlayerState);
});
import_electron.ipcMain.on("tray-menu:close", () => {
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.close();
    trayMenuWindow = null;
  }
});
import_electron.ipcMain.on("tray-menu:exit", () => {
  isQuitting = true;
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.destroy();
    trayMenuWindow = null;
  }
  tray?.destroy();
  tray = null;
  mainWindow?.destroy();
  import_electron.app.quit();
});
import_electron.ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized() ?? false);
import_electron.ipcMain.handle("app:getVersion", () => import_electron.app.getVersion());
import_electron.ipcMain.handle("app:consumeFirstRun", () => consumeFirstRunState());
import_electron.ipcMain.handle("updates:getState", () => updaterState);
import_electron.ipcMain.handle("updates:check", async () => {
  if (!import_electron.app.isPackaged) {
    setUpdaterState({
      status: "unsupported",
      currentVersion: import_electron.app.getVersion(),
      latestVersion: void 0,
      progress: void 0,
      message: "Updater works after packaged build and release publish."
    });
    return updaterState;
  }
  initAutoUpdater();
  await import_electron_updater.autoUpdater.checkForUpdates();
  return updaterState;
});
import_electron.ipcMain.handle("updates:download", async () => {
  if (!import_electron.app.isPackaged) {
    setUpdaterState({
      status: "unsupported",
      message: "Updater works after packaged build and release publish."
    });
    return updaterState;
  }
  initAutoUpdater();
  await import_electron_updater.autoUpdater.downloadUpdate();
  return updaterState;
});
import_electron.ipcMain.handle("updates:install", async () => {
  if (updaterState.status === "downloaded") {
    setImmediate(() => import_electron_updater.autoUpdater.quitAndInstall(false, true));
    return true;
  }
  return false;
});
import_electron.ipcMain.handle("dialog:openFiles", async () => {
  const res = await import_electron.dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Audio", extensions: ["mp3", "flac", "wav", "ogg", "aac", "m4a", "opus", "wma", "aiff"] }]
  });
  return res.canceled ? [] : res.filePaths;
});
import_electron.ipcMain.handle("dialog:openImages", async () => {
  const res = await import_electron.dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{
      name: "Images",
      extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "avif", "ico", "tif", "tiff"]
    }]
  });
  return res.canceled ? [] : res.filePaths;
});
import_electron.ipcMain.handle("dialog:openJson", async () => {
  const res = await import_electron.dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  return res.canceled ? [] : res.filePaths;
});
import_electron.ipcMain.handle("dialog:saveJson", async (_, { defaultFileName }) => {
  const res = await import_electron.dialog.showSaveDialog({
    defaultPath: defaultFileName || "playlists-export.json",
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  return res.canceled ? null : res.filePath || null;
});
import_electron.ipcMain.handle("dialog:openFolder", async () => {
  const res = await import_electron.dialog.showOpenDialog({ properties: ["openDirectory", "multiSelections"] });
  return res.canceled ? [] : res.filePaths;
});
import_electron.ipcMain.handle("file:readAsBase64", async (_, filePath) => {
  try {
    const buf = await (0, import_promises.readFile)(filePath);
    return buf.toString("base64");
  } catch {
    return null;
  }
});
import_electron.ipcMain.handle("file:readText", async (_, filePath) => {
  try {
    return await (0, import_promises.readFile)(filePath, "utf8");
  } catch {
    return null;
  }
});
import_electron.ipcMain.handle("file:writeText", async (_, { filePath, content }) => {
  try {
    await (0, import_promises.writeFile)(filePath, content, "utf8");
    return true;
  } catch {
    return false;
  }
});
var FOLDER_COVER_NAMES = /* @__PURE__ */ new Set(["cover", "folder", "albumart", "front", "album"]);
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "webp"]);
async function findFolderArtwork(filePath) {
  const separatorIndex = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const folderPath = separatorIndex >= 0 ? filePath.slice(0, separatorIndex) : ".";
  try {
    const entries = await (0, import_promises.readdir)(folderPath, { withFileTypes: true });
    const image = entries.filter((entry) => entry.isFile()).map((entry) => {
      const dotIndex = entry.name.lastIndexOf(".");
      const name = dotIndex >= 0 ? entry.name.slice(0, dotIndex).toLowerCase() : entry.name.toLowerCase();
      const extension = dotIndex >= 0 ? entry.name.slice(dotIndex + 1).toLowerCase() : "";
      return { entry, name, extension };
    }).find((item) => FOLDER_COVER_NAMES.has(item.name) && IMAGE_EXTENSIONS.has(item.extension));
    if (!image) return void 0;
    const format = image.extension === "jpg" || image.extension === "jpeg" ? "image/jpeg" : `image/${image.extension}`;
    return { data: await (0, import_promises.readFile)((0, import_path.join)(folderPath, image.entry.name)), format };
  } catch {
    return void 0;
  }
}
import_electron.ipcMain.handle("metadata:parse", async (_, filePath) => {
  try {
    const s = await (0, import_promises.stat)(filePath);
    const meta = await (0, import_music_metadata.parseFile)(filePath, { duration: true, skipCovers: false });
    const common = meta.common;
    let artworkData;
    let artworkPath;
    const picture = common.picture?.[0];
    const folderArtwork = picture ? void 0 : await findFolderArtwork(filePath);
    if (picture || folderArtwork) {
      const artworkBuffer = picture?.data || folderArtwork.data;
      const artworkFormat = picture?.format || folderArtwork.format;
      try {
        const thumbsDir = (0, import_path.join)(userDataPath, "thumbnails");
        await (0, import_promises.mkdir)(thumbsDir, { recursive: true });
        const hash = (0, import_crypto.createHash)("md5").update(filePath).digest("hex");
        const ext = artworkFormat.split("/").pop() || "jpg";
        const dest = (0, import_path.join)(thumbsDir, `${hash}.${ext}`);
        if (!(0, import_fs.existsSync)(dest)) {
          await (0, import_promises.writeFile)(dest, artworkBuffer);
        }
        artworkPath = dest;
      } catch (e) {
        artworkData = `data:${artworkFormat};base64,${artworkBuffer.toString("base64")}`;
      }
    }
    return {
      title: common.title || filePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || "Unknown",
      artist: common.artist || common.albumartist || "Unknown Artist",
      album: common.album || "Unknown Album",
      genre: (common.genre || ["Unknown"])[0],
      duration: meta.format.duration || 0,
      artworkData,
      artworkPath,
      year: common.year,
      trackNumber: common.track?.no || void 0,
      format: meta.format.container || "Unknown",
      size: s.size
    };
  } catch (e) {
    console.error("metadata parse error", e);
    return {};
  }
});
var AUDIO_EXTS = /* @__PURE__ */ new Set(["mp3", "flac", "wav", "ogg", "aac", "m4a", "opus", "wma", "aiff", "ape"]);
async function scanFolder(folderPath) {
  const results = [];
  async function walk(dir) {
    try {
      const entries = await (0, import_promises.readdir)(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = (0, import_path.join)(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else {
          const ext = e.name.split(".").pop()?.toLowerCase();
          if (ext && AUDIO_EXTS.has(ext)) results.push(full);
        }
      }
    } catch {
    }
  }
  await walk(folderPath);
  return results;
}
import_electron.ipcMain.handle("folder:scan", async (_, folderPath) => {
  return await scanFolder(folderPath);
});
import_electron.ipcMain.handle("library:getAll", () => {
  const tracks = db.prepare("SELECT * FROM tracks ORDER BY addedAt DESC").all();
  return tracks.map((t) => {
    if (t.artworkPath) delete t.artworkData;
    return t;
  });
});
import_electron.ipcMain.handle("library:addTracks", (_, tracks) => {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO tracks
    (id, title, artist, album, genre, duration, filePath, artworkData, artworkPath, year, trackNumber, format, size, addedAt, playCount)
    VALUES
    (@id, @title, @artist, @album, @genre, @duration, @filePath, @artworkData, @artworkPath, @year, @trackNumber, @format, @size, @addedAt, @playCount)
  `);
  const insertMany = db.transaction((ts) => {
    for (const t of ts) insert.run(t);
  });
  insertMany(tracks);
});
import_electron.ipcMain.handle("library:removeTrack", (_, id) => {
  db.prepare("DELETE FROM tracks WHERE id = ?").run(id);
  db.prepare("DELETE FROM playlist_tracks WHERE trackId = ?").run(id);
});
import_electron.ipcMain.handle("library:clearAll", () => {
  const clearLibrary = db.transaction(() => {
    db.prepare("DELETE FROM playlist_tracks").run();
    db.prepare("DELETE FROM tracks").run();
  });
  clearLibrary();
});
import_electron.ipcMain.handle("library:updateTrack", (_, track) => {
  const existing = db.prepare("SELECT * FROM tracks WHERE id = ?").get(track.id);
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
import_electron.ipcMain.handle("library:updateArtwork", (_, { id, artworkData }) => {
  db.prepare("UPDATE tracks SET artworkData = ? WHERE id = ?").run(artworkData, id);
  return true;
});
import_electron.ipcMain.handle("library:setArtworkFromFile", async (_, { id, filePath }) => {
  try {
    const buf = await (0, import_promises.readFile)(filePath);
    const format = filePath.split(".").pop()?.toLowerCase() || "jpeg";
    const artworkData = `data:image/${format};base64,${buf.toString("base64")}`;
    db.prepare("UPDATE tracks SET artworkData = ? WHERE id = ?").run(artworkData, id);
    return artworkData;
  } catch (e) {
    console.error("Failed to set artwork from file", e);
    return null;
  }
});
import_electron.ipcMain.handle("library:updatePlayCount", (_, id) => {
  db.prepare("UPDATE tracks SET playCount = playCount + 1, lastPlayedAt = ? WHERE id = ?").run(Date.now(), id);
});
import_electron.ipcMain.handle("library:search", (_, query) => {
  const q = `%${query}%`;
  return db.prepare("SELECT * FROM tracks WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? OR genre LIKE ? ORDER BY title").all(q, q, q, q);
});
import_electron.ipcMain.handle("playlists:getAll", () => {
  const pl = db.prepare("SELECT * FROM playlists ORDER BY updatedAt DESC").all();
  return pl.map((p) => ({
    ...p,
    trackIds: db.prepare("SELECT trackId FROM playlist_tracks WHERE playlistId = ? ORDER BY position").all(p.id).map((r) => r.trackId)
  }));
});
import_electron.ipcMain.handle("playlists:create", (_, name) => {
  const id = generateId();
  const now = Date.now();
  db.prepare("INSERT INTO playlists (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)").run(id, name, now, now);
  return id;
});
import_electron.ipcMain.handle("playlists:updateArtwork", (_, { id, artworkData }) => {
  try {
    db.prepare("UPDATE playlists SET artworkData = ?, updatedAt = ? WHERE id = ?").run(artworkData, Date.now(), id);
  } catch (e) {
    if (String(e?.message || "").includes("no such column: artworkData")) {
      ensurePlaylistArtworkColumn();
      db.prepare("UPDATE playlists SET artworkData = ?, updatedAt = ? WHERE id = ?").run(artworkData, Date.now(), id);
      return;
    }
    throw e;
  }
});
import_electron.ipcMain.handle("playlists:setCoverFromFile", async (_, { id, filePath }) => {
  ensurePlaylistArtworkColumn();
  const coversDir = (0, import_path.join)(userDataPath, "covers");
  await (0, import_promises.mkdir)(coversDir, { recursive: true });
  const extRaw = filePath.split(".").pop()?.toLowerCase() ?? "img";
  const safeExt = extRaw.replace(/[^a-z0-9]+/g, "").slice(0, 8) || "img";
  const destPath = (0, import_path.join)(coversDir, `${id}.${safeExt}`);
  await (0, import_promises.copyFile)(filePath, destPath);
  db.prepare("UPDATE playlists SET coverArt = ?, artworkData = NULL, updatedAt = ? WHERE id = ?").run(destPath, Date.now(), id);
  return destPath;
});
import_electron.ipcMain.handle("playlists:rename", (_, { id, name }) => {
  db.prepare("UPDATE playlists SET name = ?, updatedAt = ? WHERE id = ?").run(name, Date.now(), id);
});
import_electron.ipcMain.handle("playlists:delete", (_, id) => {
  db.prepare("DELETE FROM playlists WHERE id = ?").run(id);
  db.prepare("DELETE FROM playlist_tracks WHERE playlistId = ?").run(id);
});
import_electron.ipcMain.handle("playlists:addTrack", (_, { playlistId, trackId }) => {
  const max = db.prepare("SELECT MAX(position) as m FROM playlist_tracks WHERE playlistId = ?").get(playlistId)?.m ?? -1;
  db.prepare("INSERT OR IGNORE INTO playlist_tracks (playlistId, trackId, position) VALUES (?, ?, ?)").run(playlistId, trackId, max + 1);
  db.prepare("UPDATE playlists SET updatedAt = ? WHERE id = ?").run(Date.now(), playlistId);
});
import_electron.ipcMain.handle("playlists:addTracks", (_, { playlistId, trackIds }) => {
  const uniqueTrackIds = [...new Set(trackIds)];
  const max = db.prepare("SELECT MAX(position) as m FROM playlist_tracks WHERE playlistId = ?").get(playlistId)?.m ?? -1;
  const insert = db.prepare("INSERT OR IGNORE INTO playlist_tracks (playlistId, trackId, position) VALUES (?, ?, ?)");
  const tx = db.transaction(() => {
    uniqueTrackIds.forEach((trackId, index) => {
      insert.run(playlistId, trackId, max + index + 1);
    });
    db.prepare("UPDATE playlists SET updatedAt = ? WHERE id = ?").run(Date.now(), playlistId);
  });
  tx();
});
import_electron.ipcMain.handle("playlists:removeTrack", (_, { playlistId, trackId }) => {
  db.prepare("DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?").run(playlistId, trackId);
});
import_electron.ipcMain.handle("playlists:removeTracks", (_, { playlistId, trackIds }) => {
  const del = db.prepare("DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?");
  const tx = db.transaction(() => {
    trackIds.forEach((tid) => del.run(playlistId, tid));
    db.prepare("UPDATE playlists SET updatedAt = ? WHERE id = ?").run(Date.now(), playlistId);
  });
  tx();
});
import_electron.ipcMain.handle("playlists:reorder", (_, { playlistId, trackIds }) => {
  const update = db.prepare("UPDATE playlist_tracks SET position = ? WHERE playlistId = ? AND trackId = ?");
  const tx = db.transaction(() => {
    trackIds.forEach((tid, i) => update.run(i, playlistId, tid));
  });
  tx();
});
import_electron.ipcMain.handle("settings:get", () => getSettings());
import_electron.ipcMain.handle("settings:save", (_, settings) => saveSettings(settings));
import_electron.ipcMain.handle("lyrics:fetchOnline", async (_, { title, artist, album, duration }) => {
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (album) params.set("album_name", album);
    if (duration) params.set("duration", String(Math.round(duration)));
    const res = await fetch(`https://lrclib.net/api/get?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.syncedLyrics || data.plainLyrics || null;
  } catch {
    return null;
  }
});
import_electron.ipcMain.handle("lyrics:loadLocal", async (_, filePath) => {
  const lrcPath = filePath.replace(/\.[^/.]+$/, ".lrc");
  if (!(0, import_fs.existsSync)(lrcPath)) return null;
  try {
    return await (0, import_promises.readFile)(lrcPath, "utf-8");
  } catch {
    return null;
  }
});
import_electron.ipcMain.handle("lyrics:saveLocal", async (_, { filePath, content }) => {
  const lrcPath = filePath.replace(/\.[^/.]+$/, ".lrc");
  try {
    await (0, import_promises.writeFile)(lrcPath, content, "utf-8");
    return true;
  } catch {
    return false;
  }
});
import_electron.ipcMain.on("theme:set", (_, mode) => {
  if (mode === "light") {
    import_electron.nativeTheme.themeSource = "light";
  } else if (mode === "system") {
    import_electron.nativeTheme.themeSource = "system";
  } else {
    import_electron.nativeTheme.themeSource = "dark";
  }
});
