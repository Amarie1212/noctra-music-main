import { openDB, type IDBPDatabase } from 'idb';
import type { Track, Playlist, AppSettings } from '@music/core';
import { DEFAULT_SETTINGS } from '@music/core';

const DB_NAME = 'noctra-mobile';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('tracks')) {
        const ts = database.createObjectStore('tracks', { keyPath: 'id' });
        ts.createIndex('addedAt', 'addedAt');
        ts.createIndex('title', 'title');
      }
      if (!database.objectStoreNames.contains('playlists')) {
        database.createObjectStore('playlists', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings');
      }
    },
  });
  return dbInstance;
}

export const db = {
  // ── Tracks ──────────────────────────────────────────────
  async getAllTracks(): Promise<Track[]> {
    return (await getDB()).getAll('tracks');
  },
  async addTracks(tracks: Track[]): Promise<void> {
    const database = await getDB();
    const tx = database.transaction('tracks', 'readwrite');
    await Promise.all([...tracks.map(t => tx.store.put(t)), tx.done]);
  },
  async removeTrack(id: string): Promise<void> {
    (await getDB()).delete('tracks', id);
  },
  async updateTrack(partial: Partial<Track> & { id: string }): Promise<void> {
    const database = await getDB();
    const existing = await database.get('tracks', partial.id) as Track | undefined;
    if (existing) await database.put('tracks', { ...existing, ...partial });
  },
  async clearTracks(): Promise<void> {
    (await getDB()).clear('tracks');
  },

  // ── Playlists ────────────────────────────────────────────
  async getAllPlaylists(): Promise<Playlist[]> {
    return (await getDB()).getAll('playlists');
  },
  async putPlaylist(playlist: Playlist): Promise<void> {
    (await getDB()).put('playlists', playlist);
  },
  async deletePlaylist(id: string): Promise<void> {
    (await getDB()).delete('playlists', id);
  },

  // ── Settings ─────────────────────────────────────────────
  async getSettings(): Promise<AppSettings> {
    const database = await getDB();
    const saved = await database.get('settings', 'app') as Partial<AppSettings> | undefined;
    return { ...DEFAULT_SETTINGS, ...(saved || {}) };
  },
  async saveSettings(partial: Partial<AppSettings>): Promise<void> {
    const database = await getDB();
    const existing = await database.get('settings', 'app') as Partial<AppSettings> | undefined;
    await database.put('settings', { ...(existing || {}), ...partial }, 'app');
  },
};
