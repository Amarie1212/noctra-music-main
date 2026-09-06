import type { Track, Playlist, AppSettings } from '@music/core';
import { DEFAULT_SETTINGS, generateId } from '@music/core';
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'noctra-mobile-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('tracks')) {
          db.createObjectStore('tracks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  }
  return dbPromise;
}

// In-memory audio URL resolver
const audioBlobMap = new Map<string, string>();
const fileMap = new Map<string, File>();

export function registerAudioFile(id: string, file: File): string {
  fileMap.set(id, file);
  fileMap.set(file.name, file);
  const url = URL.createObjectURL(file);
  audioBlobMap.set(id, url);
  audioBlobMap.set(file.name, url);
  return url;
}

export function resolveAudioUrl(id: string, path: string): string {
  if (path.startsWith('blob:') || path.startsWith('data:') || path.startsWith('http')) {
    return path;
  }
  return audioBlobMap.get(id) || audioBlobMap.get(path) || path;
}

// Helper to convert uint8 to base64
function uint8ToBase64(buf: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buf.byteLength; i++) binary += String.fromCharCode(buf[i]);
  return window.btoa(binary);
}

// Parse metadata in browser using music-metadata
async function parseAudioMetadata(file: File): Promise<Partial<Track>> {
  try {
    const { parseBlob } = await import('music-metadata');
    const meta = await parseBlob(file, { skipCovers: false, duration: true });
    let artworkData: string | undefined;
    const pic = meta.common.picture?.[0];
    if (pic) {
      artworkData = `data:${pic.format};base64,${uint8ToBase64(pic.data)}`;
    }
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    return {
      title: meta.common.title?.trim() || cleanName,
      artist: meta.common.artist?.trim() || 'Unknown Artist',
      album: meta.common.album?.trim() || 'Unknown Album',
      genre: meta.common.genre?.[0]?.trim() || 'Unknown',
      duration: meta.format.duration || 0,
      year: meta.common.year,
      trackNumber: meta.common.track?.no ?? undefined,
      format: meta.format.container || file.type || 'audio/mp3',
      size: file.size,
      artworkData,
    };
  } catch {
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    return {
      title: cleanName,
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      genre: 'Unknown',
      duration: 0,
      format: file.type || 'audio/mp3',
      size: file.size,
    };
  }
}

// Install mock window.api
export function initMobileApiBridge() {
  (window as any).__resolveTrackAudioUrl = resolveAudioUrl;

  window.api = {
    window: {
      minimize: () => {},
      maximize: () => {},
      close: () => {},
      isMaximized: () => Promise.resolve(false),
      getVersion: () => Promise.resolve('1.0.0-mobile'),
      consumeFirstRun: () => Promise.resolve(false),
      onMaximizeChange: () => () => {},
      onTrayPlayerCommand: () => () => {},
    },

    dialog: {
      openFiles: async () => {
        return new Promise<string[]>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.accept = 'audio/*,.mp3,.flac,.aac,.ogg,.wav,.m4a,.opus';
          input.onchange = async () => {
            if (!input.files?.length) return resolve([]);
            const files = Array.from(input.files);
            const tracksToAdd: Track[] = [];
            const paths: string[] = [];

            for (const file of files) {
              const id = generateId();
              const blobUrl = registerAudioFile(id, file);
              const meta = await parseAudioMetadata(file);
              const track: Track = {
                id,
                filePath: blobUrl,
                title: meta.title || file.name,
                artist: meta.artist || 'Unknown Artist',
                album: meta.album || 'Unknown Album',
                genre: meta.genre || 'Unknown',
                duration: meta.duration || 0,
                artworkData: meta.artworkData,
                year: meta.year,
                trackNumber: meta.trackNumber,
                format: meta.format || 'audio',
                size: file.size,
                addedAt: Date.now(),
                playCount: 0,
              };
              tracksToAdd.push(track);
              paths.push(blobUrl);
            }

            if (tracksToAdd.length) {
              await window.api.library.addTracks(tracksToAdd);
            }
            resolve(paths);
          };
          input.click();
        });
      },

      openFolder: async () => {
        return new Promise<string[]>((resolve) => {
          const input = document.createElement('input') as HTMLInputElement & { webkitdirectory: boolean };
          input.type = 'file';
          input.webkitdirectory = true;
          input.multiple = true;
          input.onchange = async () => {
            if (!input.files?.length) return resolve([]);
            const audioFiles = Array.from(input.files).filter(f =>
              f.type.startsWith('audio/') || /\.(mp3|flac|ogg|wav|aac|m4a|opus)$/i.test(f.name)
            );
            const tracksToAdd: Track[] = [];
            const paths: string[] = [];

            for (const file of audioFiles) {
              const id = generateId();
              const blobUrl = registerAudioFile(id, file);
              const meta = await parseAudioMetadata(file);
              const track: Track = {
                id,
                filePath: blobUrl,
                title: meta.title || file.name,
                artist: meta.artist || 'Unknown Artist',
                album: meta.album || 'Unknown Album',
                genre: meta.genre || 'Unknown',
                duration: meta.duration || 0,
                artworkData: meta.artworkData,
                year: meta.year,
                trackNumber: meta.trackNumber,
                format: meta.format || 'audio',
                size: file.size,
                addedAt: Date.now(),
                playCount: 0,
              };
              tracksToAdd.push(track);
              paths.push(blobUrl);
            }

            if (tracksToAdd.length) {
              await window.api.library.addTracks(tracksToAdd);
            }
            resolve(paths);
          };
          input.click();
        });
      },

      openImages: async () => {
        return new Promise<string[]>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = () => {
            if (!input.files?.length) return resolve([]);
            const file = input.files[0];
            const reader = new FileReader();
            reader.onload = () => resolve([String(reader.result)]);
            reader.readAsDataURL(file);
          };
          input.click();
        });
      },

      openJson: async () => {
        return new Promise<string[]>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json,application/json';
          input.onchange = () => {
            if (!input.files?.length) return resolve([]);
            const file = input.files[0];
            const reader = new FileReader();
            reader.onload = () => {
              (window as any).__lastReadJson = String(reader.result);
              resolve([file.name]);
            };
            reader.readAsText(file);
          };
          input.click();
        });
      },

      saveJson: async (defaultFileName = 'export.json') => {
        (window as any).__pendingSaveFilename = defaultFileName;
        return defaultFileName;
      },
    },

    file: {
      readAsBase64: async (path: string) => {
        return audioBlobMap.get(path) || null;
      },
      readText: async () => {
        return (window as any).__lastReadJson || null;
      },
      writeText: async (filePath: string, content: string) => {
        try {
          const blob = new Blob([content], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filePath || 'export.json';
          a.click();
          URL.revokeObjectURL(url);
          return true;
        } catch {
          return false;
        }
      },
    },

    metadata: {
      parse: async (filePath: string) => {
        return {
          title: filePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Song',
          artist: 'Unknown Artist',
          album: 'Unknown Album',
        };
      },
    },

    folder: {
      scan: async () => {
        return [];
      },
    },

    library: {
      getAll: async () => {
        const db = await getDB();
        return (await db.getAll('tracks')) as Track[];
      },
      addTracks: async (tracks: Track[]) => {
        const db = await getDB();
        const tx = db.transaction('tracks', 'readwrite');
        await Promise.all([...tracks.map(t => tx.store.put(t)), tx.done]);
      },
      removeTrack: async (id: string) => {
        const db = await getDB();
        await db.delete('tracks', id);
      },
      clearAll: async () => {
        const db = await getDB();
        await db.clear('tracks');
      },
      updateTrack: async (track) => {
        const db = await getDB();
        const existing = await db.get('tracks', track.id) as Track | undefined;
        if (existing) {
          await db.put('tracks', { ...existing, ...track });
          return true;
        }
        return false;
      },
      updateArtwork: async (id: string, artworkData: string) => {
        const db = await getDB();
        const existing = await db.get('tracks', id) as Track | undefined;
        if (existing) {
          await db.put('tracks', { ...existing, artworkData });
          return true;
        }
        return false;
      },
      setArtworkFromFile: async (id: string, filePath: string) => {
        const db = await getDB();
        const existing = await db.get('tracks', id) as Track | undefined;
        if (existing) {
          await db.put('tracks', { ...existing, artworkData: filePath });
          return filePath;
        }
        return null;
      },
      updatePlayCount: async (id: string) => {
        const db = await getDB();
        const existing = await db.get('tracks', id) as Track | undefined;
        if (existing) {
          await db.put('tracks', {
            ...existing,
            playCount: (existing.playCount || 0) + 1,
            lastPlayedAt: Date.now(),
          });
        }
      },
      search: async (q: string) => {
        const db = await getDB();
        const all = await db.getAll('tracks') as Track[];
        const lower = q.toLowerCase();
        return all.filter(t =>
          t.title.toLowerCase().includes(lower) ||
          t.artist.toLowerCase().includes(lower) ||
          t.album.toLowerCase().includes(lower)
        );
      },
    },

    playlists: {
      getAll: async () => {
        const db = await getDB();
        return (await db.getAll('playlists')) as Playlist[];
      },
      create: async (name: string) => {
        const db = await getDB();
        const id = generateId();
        const pl: Playlist = { id, name, trackIds: [], createdAt: Date.now(), updatedAt: Date.now() };
        await db.put('playlists', pl);
        return id;
      },
      rename: async (id: string, name: string) => {
        const db = await getDB();
        const pl = await db.get('playlists', id) as Playlist | undefined;
        if (pl) await db.put('playlists', { ...pl, name, updatedAt: Date.now() });
      },
      delete: async (id: string) => {
        const db = await getDB();
        await db.delete('playlists', id);
      },
      addTrack: async (playlistId: string, trackId: string) => {
        const db = await getDB();
        const pl = await db.get('playlists', playlistId) as Playlist | undefined;
        if (pl && !pl.trackIds.includes(trackId)) {
          await db.put('playlists', { ...pl, trackIds: [...pl.trackIds, trackId], updatedAt: Date.now() });
        }
      },
      addTracks: async (playlistId: string, trackIds: string[]) => {
        const db = await getDB();
        const pl = await db.get('playlists', playlistId) as Playlist | undefined;
        if (pl) {
          const next = [...new Set([...pl.trackIds, ...trackIds])];
          await db.put('playlists', { ...pl, trackIds: next, updatedAt: Date.now() });
        }
      },
      removeTrack: async (playlistId: string, trackId: string) => {
        const db = await getDB();
        const pl = await db.get('playlists', playlistId) as Playlist | undefined;
        if (pl) {
          await db.put('playlists', { ...pl, trackIds: pl.trackIds.filter(id => id !== trackId), updatedAt: Date.now() });
        }
      },
      removeTracks: async (playlistId: string, trackIds: string[]) => {
        const db = await getDB();
        const pl = await db.get('playlists', playlistId) as Playlist | undefined;
        if (pl) {
          const set = new Set(trackIds);
          await db.put('playlists', { ...pl, trackIds: pl.trackIds.filter(id => !set.has(id)), updatedAt: Date.now() });
        }
      },
      reorder: async (playlistId: string, trackIds: string[]) => {
        const db = await getDB();
        const pl = await db.get('playlists', playlistId) as Playlist | undefined;
        if (pl) {
          await db.put('playlists', { ...pl, trackIds, updatedAt: Date.now() });
        }
      },
      updateArtwork: async (id: string, artworkData: string) => {
        const db = await getDB();
        const pl = await db.get('playlists', id) as Playlist | undefined;
        if (pl) {
          await db.put('playlists', { ...pl, artworkData, updatedAt: Date.now() });
        }
      },
      setCoverFromFile: async (id: string, filePath: string) => {
        const db = await getDB();
        const pl = await db.get('playlists', id) as Playlist | undefined;
        if (pl) {
          await db.put('playlists', { ...pl, coverArt: filePath, updatedAt: Date.now() });
        }
        return filePath;
      },
    },

    settings: {
      get: async () => {
        const db = await getDB();
        const saved = await db.get('settings', 'config') as Partial<AppSettings> | undefined;
        return { ...DEFAULT_SETTINGS, ...(saved || {}) };
      },
      save: async (settings: AppSettings) => {
        const db = await getDB();
        await db.put('settings', settings, 'config');
      },
    },

    lyrics: {
      fetchOnline: async () => null,
      loadLocal: async () => null,
      saveLocal: async () => false,
    },

    theme: {
      set: (mode) => {
        document.documentElement.setAttribute('data-theme', mode);
      },
    },

    updates: {
      getState: async () => ({ status: 'up_to_date', currentVersion: '1.0.0-mobile' }),
      check: async () => ({ status: 'up_to_date', currentVersion: '1.0.0-mobile' }),
      download: async () => ({ status: 'up_to_date', currentVersion: '1.0.0-mobile' }),
      install: async () => false,
      onStatusChange: () => () => {},
    },
  };
}
