/// <reference types="vite/client" />

// Type declarations for the window.api bridge exposed by preload.ts
declare global {
  interface Window {
    api: {
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        isMaximized: () => Promise<boolean>;
        getVersion: () => Promise<string>;
        consumeFirstRun: () => Promise<boolean>;
        onMaximizeChange: (cb: (isMaximized: boolean) => void) => () => void;
        onTrayPlayerCommand: (cb: (command: 'toggle-play' | 'next-track' | 'previous-track' | 'toggle-shuffle' | 'toggle-repeat') => void) => () => void;
      };
      dialog: {
        openFiles: () => Promise<string[]>;
        openImages: () => Promise<string[]>;
        openJson: () => Promise<string[]>;
        saveJson: (defaultFileName?: string) => Promise<string | null>;
        openFolder: () => Promise<string[]>;
      };
      file: {
        readAsBase64: (path: string) => Promise<string | null>;
        readText: (path: string) => Promise<string | null>;
        writeText: (filePath: string, content: string) => Promise<boolean>;
      };
      metadata: {
        parse: (filePath: string) => Promise<Partial<import('@music/core').Track>>;
      };
      folder: {
        scan: (folderPath: string) => Promise<string[]>;
      };
      library: {
        getAll: () => Promise<import('@music/core').Track[]>;
        addTracks: (tracks: import('@music/core').Track[]) => Promise<void>;
        removeTrack: (id: string) => Promise<void>;
        clearAll: () => Promise<void>;
        updateTrack: (track: { id: string; title?: string; artist?: string; album?: string; genre?: string; year?: number; trackNumber?: number }) => Promise<boolean>;
        updateArtwork: (id: string, artworkData: string) => Promise<boolean>;
        setArtworkFromFile: (id: string, filePath: string) => Promise<string | null>;
        updatePlayCount: (id: string) => Promise<void>;
        search: (query: string) => Promise<import('@music/core').Track[]>;
      };
      playlists: {
        getAll: () => Promise<import('@music/core').Playlist[]>;
        create: (name: string) => Promise<string>;
        rename: (id: string, name: string) => Promise<void>;
        delete: (id: string) => Promise<void>;
        addTrack: (playlistId: string, trackId: string) => Promise<void>;
        addTracks: (playlistId: string, trackIds: string[]) => Promise<void>;
        removeTrack: (playlistId: string, trackId: string) => Promise<void>;
        removeTracks: (playlistId: string, trackIds: string[]) => Promise<void>;
        reorder: (playlistId: string, trackIds: string[]) => Promise<void>;
        updateArtwork: (id: string, artworkData: string) => Promise<void>;
        setCoverFromFile: (id: string, filePath: string) => Promise<string>;
      };
      settings: {
        get: () => Promise<import('@music/core').AppSettings>;
        save: (settings: import('@music/core').AppSettings) => Promise<void>;
      };
      lyrics: {
        fetchOnline: (args: { title: string; artist: string; album?: string; duration?: number }) => Promise<string | null>;
        loadLocal: (filePath: string) => Promise<string | null>;
        saveLocal: (filePath: string, content: string) => Promise<boolean>;
      };
      theme: {
        set: (mode: 'dark' | 'light' | 'system') => void;
      };
      updates: {
        getState: () => Promise<{
          status: 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'downloaded' | 'unsupported' | 'error';
          currentVersion: string;
          latestVersion?: string;
          progress?: number;
          message?: string;
        }>;
        check: () => Promise<{
          status: 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'downloaded' | 'unsupported' | 'error';
          currentVersion: string;
          latestVersion?: string;
          progress?: number;
          message?: string;
        }>;
        download: () => Promise<{
          status: 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'downloaded' | 'unsupported' | 'error';
          currentVersion: string;
          latestVersion?: string;
          progress?: number;
          message?: string;
        }>;
        install: () => Promise<boolean>;
        onStatusChange: (cb: (state: {
          status: 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'downloaded' | 'unsupported' | 'error';
          currentVersion: string;
          latestVersion?: string;
          progress?: number;
          message?: string;
        }) => void) => () => void;
      };
    };
  }
}

declare module '*.png' {
  const source: string;
  export default source;
}

export {};
