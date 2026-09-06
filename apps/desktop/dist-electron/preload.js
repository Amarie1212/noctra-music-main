"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("api", {
  // Window controls
  window: {
    minimize: () => import_electron.ipcRenderer.send("window:minimize"),
    maximize: () => import_electron.ipcRenderer.send("window:maximize"),
    close: () => import_electron.ipcRenderer.send("window:close"),
    isMaximized: () => import_electron.ipcRenderer.invoke("window:isMaximized"),
    getVersion: () => import_electron.ipcRenderer.invoke("app:getVersion"),
    consumeFirstRun: () => import_electron.ipcRenderer.invoke("app:consumeFirstRun"),
    onMaximizeChange: (cb) => {
      const listener = (_event, value) => cb(Boolean(value));
      import_electron.ipcRenderer.on("window:maximize-changed", listener);
      return () => import_electron.ipcRenderer.removeListener("window:maximize-changed", listener);
    },
    onTrayPlayerCommand: (cb) => {
      const listener = (_event, value) => cb(value);
      import_electron.ipcRenderer.on("tray:player-command", listener);
      return () => import_electron.ipcRenderer.removeListener("tray:player-command", listener);
    }
  },
  // Dialog
  dialog: {
    openFiles: () => import_electron.ipcRenderer.invoke("dialog:openFiles"),
    openImages: () => import_electron.ipcRenderer.invoke("dialog:openImages"),
    openJson: () => import_electron.ipcRenderer.invoke("dialog:openJson"),
    saveJson: (defaultFileName) => import_electron.ipcRenderer.invoke("dialog:saveJson", { defaultFileName }),
    openFolder: () => import_electron.ipcRenderer.invoke("dialog:openFolder")
  },
  // File utilities
  file: {
    readAsBase64: (path) => import_electron.ipcRenderer.invoke("file:readAsBase64", path),
    readText: (path) => import_electron.ipcRenderer.invoke("file:readText", path),
    writeText: (filePath, content) => import_electron.ipcRenderer.invoke("file:writeText", { filePath, content })
  },
  // Metadata
  metadata: {
    parse: (filePath) => import_electron.ipcRenderer.invoke("metadata:parse", filePath)
  },
  // Folder scan
  folder: {
    scan: (folderPath) => import_electron.ipcRenderer.invoke("folder:scan", folderPath)
  },
  // Library
  library: {
    getAll: () => import_electron.ipcRenderer.invoke("library:getAll"),
    addTracks: (tracks) => import_electron.ipcRenderer.invoke("library:addTracks", tracks),
    removeTrack: (id) => import_electron.ipcRenderer.invoke("library:removeTrack", id),
    clearAll: () => import_electron.ipcRenderer.invoke("library:clearAll"),
    updateTrack: (track) => import_electron.ipcRenderer.invoke("library:updateTrack", track),
    updateArtwork: (id, artworkData) => import_electron.ipcRenderer.invoke("library:updateArtwork", { id, artworkData }),
    setArtworkFromFile: (id, filePath) => import_electron.ipcRenderer.invoke("library:setArtworkFromFile", { id, filePath }),
    updatePlayCount: (id) => import_electron.ipcRenderer.invoke("library:updatePlayCount", id),
    search: (query) => import_electron.ipcRenderer.invoke("library:search", query)
  },
  // Playlists
  playlists: {
    getAll: () => import_electron.ipcRenderer.invoke("playlists:getAll"),
    create: (name) => import_electron.ipcRenderer.invoke("playlists:create", name),
    rename: (id, name) => import_electron.ipcRenderer.invoke("playlists:rename", { id, name }),
    delete: (id) => import_electron.ipcRenderer.invoke("playlists:delete", id),
    addTrack: (playlistId, trackId) => import_electron.ipcRenderer.invoke("playlists:addTrack", { playlistId, trackId }),
    addTracks: (playlistId, trackIds) => import_electron.ipcRenderer.invoke("playlists:addTracks", { playlistId, trackIds }),
    removeTrack: (playlistId, trackId) => import_electron.ipcRenderer.invoke("playlists:removeTrack", { playlistId, trackId }),
    removeTracks: (playlistId, trackIds) => import_electron.ipcRenderer.invoke("playlists:removeTracks", { playlistId, trackIds }),
    reorder: (playlistId, trackIds) => import_electron.ipcRenderer.invoke("playlists:reorder", { playlistId, trackIds }),
    updateArtwork: (id, artworkData) => import_electron.ipcRenderer.invoke("playlists:updateArtwork", { id, artworkData }),
    setCoverFromFile: (id, filePath) => import_electron.ipcRenderer.invoke("playlists:setCoverFromFile", { id, filePath })
  },
  // Settings
  settings: {
    get: () => import_electron.ipcRenderer.invoke("settings:get"),
    save: (settings) => import_electron.ipcRenderer.invoke("settings:save", settings)
  },
  // Lyrics
  lyrics: {
    fetchOnline: (args) => import_electron.ipcRenderer.invoke("lyrics:fetchOnline", args),
    loadLocal: (filePath) => import_electron.ipcRenderer.invoke("lyrics:loadLocal", filePath),
    saveLocal: (filePath, content) => import_electron.ipcRenderer.invoke("lyrics:saveLocal", { filePath, content })
  },
  // Theme
  theme: {
    set: (mode) => import_electron.ipcRenderer.send("theme:set", mode)
  },
  updates: {
    getState: () => import_electron.ipcRenderer.invoke("updates:getState"),
    check: () => import_electron.ipcRenderer.invoke("updates:check"),
    download: () => import_electron.ipcRenderer.invoke("updates:download"),
    install: () => import_electron.ipcRenderer.invoke("updates:install"),
    onStatusChange: (cb) => {
      const listener = (_event, value) => cb(value);
      import_electron.ipcRenderer.on("updates:status", listener);
      return () => import_electron.ipcRenderer.removeListener("updates:status", listener);
    }
  },
  // Player sync for tray
  player: {
    syncState: (state) => import_electron.ipcRenderer.send("player:state-sync", state)
  }
});
