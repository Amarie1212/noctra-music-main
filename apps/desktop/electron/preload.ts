import { contextBridge, ipcRenderer } from 'electron';

// Expose a safe, typed API from the main process to the renderer
contextBridge.exposeInMainWorld('api', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
    consumeFirstRun: () => ipcRenderer.invoke('app:consumeFirstRun') as Promise<boolean>,
    onMaximizeChange: (cb: (isMaximized: boolean) => void) => {
      const listener = (_event: unknown, value: boolean) => cb(Boolean(value));
      ipcRenderer.on('window:maximize-changed', listener);
      return () => ipcRenderer.removeListener('window:maximize-changed', listener);
    },
    onTrayPlayerCommand: (cb: (command: 'toggle-play' | 'next-track' | 'previous-track' | 'toggle-shuffle' | 'toggle-repeat') => void) => {
      const listener = (_event: unknown, value: 'toggle-play' | 'next-track' | 'previous-track' | 'toggle-shuffle' | 'toggle-repeat') => cb(value);
      ipcRenderer.on('tray:player-command', listener);
      return () => ipcRenderer.removeListener('tray:player-command', listener);
    },
  },

  // Dialog
  dialog: {
    openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
    openImages: () => ipcRenderer.invoke('dialog:openImages'),
    openJson: () => ipcRenderer.invoke('dialog:openJson'),
    saveJson: (defaultFileName?: string) => ipcRenderer.invoke('dialog:saveJson', { defaultFileName }),
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  },

  // File utilities
  file: {
    readAsBase64: (path: string) => ipcRenderer.invoke('file:readAsBase64', path),
    readText: (path: string) => ipcRenderer.invoke('file:readText', path),
    writeText: (filePath: string, content: string) => ipcRenderer.invoke('file:writeText', { filePath, content }),
  },

  // Metadata
  metadata: {
    parse: (filePath: string) => ipcRenderer.invoke('metadata:parse', filePath),
  },

  // Folder scan
  folder: {
    scan: (folderPath: string) => ipcRenderer.invoke('folder:scan', folderPath),
  },

  // Library
  library: {
    getAll: () => ipcRenderer.invoke('library:getAll'),
    addTracks: (tracks: any[]) => ipcRenderer.invoke('library:addTracks', tracks),
    removeTrack: (id: string) => ipcRenderer.invoke('library:removeTrack', id),
    clearAll: () => ipcRenderer.invoke('library:clearAll'),
    updateTrack: (track: { id: string; title?: string; artist?: string; album?: string; genre?: string; year?: number; trackNumber?: number }) => ipcRenderer.invoke('library:updateTrack', track),
    updateArtwork: (id: string, artworkData: string) => ipcRenderer.invoke('library:updateArtwork', { id, artworkData }),
    setArtworkFromFile: (id: string, filePath: string) => ipcRenderer.invoke('library:setArtworkFromFile', { id, filePath }),
    updatePlayCount: (id: string) => ipcRenderer.invoke('library:updatePlayCount', id),
    search: (query: string) => ipcRenderer.invoke('library:search', query),
  },

  // Playlists
  playlists: {
    getAll: () => ipcRenderer.invoke('playlists:getAll'),
    create: (name: string) => ipcRenderer.invoke('playlists:create', name),
    rename: (id: string, name: string) => ipcRenderer.invoke('playlists:rename', { id, name }),
    delete: (id: string) => ipcRenderer.invoke('playlists:delete', id),
    addTrack: (playlistId: string, trackId: string) => ipcRenderer.invoke('playlists:addTrack', { playlistId, trackId }),
    addTracks: (playlistId: string, trackIds: string[]) => ipcRenderer.invoke('playlists:addTracks', { playlistId, trackIds }),
    removeTrack: (playlistId: string, trackId: string) => ipcRenderer.invoke('playlists:removeTrack', { playlistId, trackId }),
    removeTracks: (playlistId: string, trackIds: string[]) => ipcRenderer.invoke('playlists:removeTracks', { playlistId, trackIds }),
    reorder: (playlistId: string, trackIds: string[]) => ipcRenderer.invoke('playlists:reorder', { playlistId, trackIds }),
    updateArtwork: (id: string, artworkData: string) => ipcRenderer.invoke('playlists:updateArtwork', { id, artworkData }),
    setCoverFromFile: (id: string, filePath: string) => ipcRenderer.invoke('playlists:setCoverFromFile', { id, filePath }),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings: any) => ipcRenderer.invoke('settings:save', settings),
  },

  // Lyrics
  lyrics: {
    fetchOnline: (args: { title: string, artist: string, album?: string, duration?: number }) =>
      ipcRenderer.invoke('lyrics:fetchOnline', args),
    loadLocal: (filePath: string) => ipcRenderer.invoke('lyrics:loadLocal', filePath),
    saveLocal: (filePath: string, content: string) => ipcRenderer.invoke('lyrics:saveLocal', { filePath, content }),
  },

  // Theme
  theme: {
    set: (mode: any) => ipcRenderer.send('theme:set', mode),
  },

  updates: {
    getState: () => ipcRenderer.invoke('updates:getState') as Promise<{
      status: 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'downloaded' | 'unsupported' | 'error';
      currentVersion: string;
      latestVersion?: string;
      progress?: number;
      message?: string;
    }>,
    check: () => ipcRenderer.invoke('updates:check') as Promise<{
      status: 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'downloaded' | 'unsupported' | 'error';
      currentVersion: string;
      latestVersion?: string;
      progress?: number;
      message?: string;
    }>,
    download: () => ipcRenderer.invoke('updates:download') as Promise<{
      status: 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'downloaded' | 'unsupported' | 'error';
      currentVersion: string;
      latestVersion?: string;
      progress?: number;
      message?: string;
    }>,
    install: () => ipcRenderer.invoke('updates:install') as Promise<boolean>,
    onStatusChange: (
      cb: (state: {
        status: 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'downloaded' | 'unsupported' | 'error';
        currentVersion: string;
        latestVersion?: string;
        progress?: number;
        message?: string;
      }) => void,
    ) => {
      const listener = (_event: unknown, value: {
        status: 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'downloaded' | 'unsupported' | 'error';
        currentVersion: string;
        latestVersion?: string;
        progress?: number;
        message?: string;
      }) => cb(value);
      ipcRenderer.on('updates:status', listener);
      return () => ipcRenderer.removeListener('updates:status', listener);
    },
  },

  // Player sync for tray
  player: {
    syncState: (state: { title: string; artist: string; isPlaying: boolean }) =>
      ipcRenderer.send('player:state-sync', state),
  },
});
