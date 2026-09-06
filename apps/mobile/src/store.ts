import { create } from 'zustand';
import type { Track, Playlist, AppSettings } from '@music/core';
import { DEFAULT_SETTINGS, generateId } from '@music/core';
import { db } from './db';
import { audioManager } from './audio';

// ── File URL Map (session-only, cleared on reload) ────────────────────────────
// Maps trackId → Object URL created from the user's local File
const fileUrlMap = new Map<string, string>();

export function setFileUrl(trackId: string, url: string) { fileUrlMap.set(trackId, url); }
export function getFileUrl(trackId: string) { return fileUrlMap.get(trackId); }
export function hasFileUrl(trackId: string) { return fileUrlMap.has(trackId); }

// ── Helpers ───────────────────────────────────────────────────────────────────
function uint8ToBase64(buf: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buf.byteLength; i++) binary += String.fromCharCode(buf[i]);
  return window.btoa(binary);
}

async function parseFileMeta(file: File): Promise<Partial<Track>> {
  try {
    // Dynamic import to avoid bundling issues; music-metadata supports parseBlob in v10+
    const { parseBlob } = await import('music-metadata');
    const meta = await parseBlob(file, { skipCovers: false, duration: true });
    let artworkData: string | undefined;
    const pic = meta.common.picture?.[0];
    if (pic) {
      artworkData = `data:${pic.format};base64,${uint8ToBase64(pic.data)}`;
    }
    return {
      title: meta.common.title?.trim() || stripExt(file.name),
      artist: meta.common.artist?.trim() || 'Unknown Artist',
      album: meta.common.album?.trim() || 'Unknown Album',
      genre: meta.common.genre?.[0]?.trim() || 'Unknown',
      duration: meta.format.duration || 0,
      year: meta.common.year,
      trackNumber: meta.common.track?.no ?? undefined,
      format: meta.format.container || file.type || 'Unknown',
      artworkData,
    };
  } catch {
    return {
      title: stripExt(file.name),
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      genre: 'Unknown',
      duration: 0,
      format: file.type || 'Unknown',
    };
  }
}

function stripExt(name: string) {
  return name.replace(/\.[^/.]+$/, '');
}

// ── Library Store ─────────────────────────────────────────────────────────────
interface LibraryStore {
  tracks: Track[];
  isLoading: boolean;
  sort: 'name-asc' | 'name-desc' | 'date-added';
  addingCount: number;

  loadTracks: () => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  removeTrack: (id: string) => void;
  clearAll: () => void;
  setSort: (s: LibraryStore['sort']) => void;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  tracks: [],
  isLoading: false,
  sort: 'date-added',
  addingCount: 0,

  loadTracks: async () => {
    set({ isLoading: true });
    const tracks = await db.getAllTracks();
    set({ tracks: sortBy(tracks, 'date-added'), isLoading: false });
  },

  addFiles: async (files) => {
    set(s => ({ addingCount: s.addingCount + files.length }));
    const newTracks: Track[] = [];
    for (const file of files) {
      const existing = get().tracks.find(t => t.title === stripExt(file.name) && t.size === file.size);
      if (existing) { set(s => ({ addingCount: s.addingCount - 1 })); continue; }

      const meta = await parseFileMeta(file);
      const id = generateId();
      const url = URL.createObjectURL(file);
      setFileUrl(id, url);

      const track: Track = {
        id,
        filePath: file.name,
        title: meta.title || stripExt(file.name),
        artist: meta.artist || 'Unknown Artist',
        album: meta.album || 'Unknown Album',
        genre: meta.genre || 'Unknown',
        duration: meta.duration || 0,
        artworkData: meta.artworkData,
        year: meta.year,
        trackNumber: meta.trackNumber,
        format: meta.format || 'Unknown',
        size: file.size,
        addedAt: Date.now(),
        playCount: 0,
      };
      newTracks.push(track);
      set(s => ({ addingCount: s.addingCount - 1 }));
    }
    if (!newTracks.length) return;
    await db.addTracks(newTracks);
    set(s => ({ tracks: sortBy([...newTracks, ...s.tracks], s.sort) }));
  },

  removeTrack: (id) => {
    const url = fileUrlMap.get(id);
    if (url) { URL.revokeObjectURL(url); fileUrlMap.delete(id); }
    db.removeTrack(id);
    set(s => ({ tracks: s.tracks.filter(t => t.id !== id) }));
  },

  clearAll: () => {
    fileUrlMap.forEach(url => URL.revokeObjectURL(url));
    fileUrlMap.clear();
    db.clearTracks();
    set({ tracks: [] });
  },

  setSort: (sort) => {
    set(s => ({ sort, tracks: sortBy(s.tracks, sort) }));
  },
}));

function sortBy(tracks: Track[], sort: LibraryStore['sort']): Track[] {
  const copy = [...tracks];
  if (sort === 'name-asc') return copy.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'name-desc') return copy.sort((a, b) => b.title.localeCompare(a.title));
  return copy.sort((a, b) => b.addedAt - a.addedAt);
}

// ── Playlist Store ────────────────────────────────────────────────────────────
interface PlaylistStore {
  playlists: Playlist[];
  loadPlaylists: () => Promise<void>;
  createPlaylist: (name: string) => Promise<string>;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (playlistId: string, trackId: string) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
}

export const usePlaylistStore = create<PlaylistStore>((set, get) => ({
  playlists: [],

  loadPlaylists: async () => {
    set({ playlists: await db.getAllPlaylists() });
  },

  createPlaylist: async (name) => {
    const playlist: Playlist = { id: generateId(), name, trackIds: [], createdAt: Date.now(), updatedAt: Date.now() };
    await db.putPlaylist(playlist);
    set(s => ({ playlists: [playlist, ...s.playlists] }));
    return playlist.id;
  },

  deletePlaylist: (id) => {
    db.deletePlaylist(id);
    set(s => ({ playlists: s.playlists.filter(p => p.id !== id) }));
  },

  addTrackToPlaylist: (playlistId, trackId) => {
    const updated = get().playlists.map(p => {
      if (p.id !== playlistId || p.trackIds.includes(trackId)) return p;
      const next = { ...p, trackIds: [...p.trackIds, trackId], updatedAt: Date.now() };
      db.putPlaylist(next);
      return next;
    });
    set({ playlists: updated });
  },

  removeTrackFromPlaylist: (playlistId, trackId) => {
    const updated = get().playlists.map(p => {
      if (p.id !== playlistId) return p;
      const next = { ...p, trackIds: p.trackIds.filter(id => id !== trackId), updatedAt: Date.now() };
      db.putPlaylist(next);
      return next;
    });
    set({ playlists: updated });
  },
}));

// ── Player Store ──────────────────────────────────────────────────────────────
interface PlayerStore {
  currentTrackId: string | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
  queue: string[];
  queueIndex: number;

  playTrack: (trackId: string, queue?: string[]) => void;
  togglePlay: () => void;
  seekTo: (s: number) => void;
  setVolume: (v: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  _setPosition: (s: number) => void;
  _setDuration: (s: number) => void;
  _setIsPlaying: (v: boolean) => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  // Wire audio events into store
  audioManager.on('timeupdate', pos => get()._setPosition(pos));
  audioManager.on('duration', dur => get()._setDuration(dur));
  audioManager.on('play', () => get()._setIsPlaying(true));
  audioManager.on('pause', () => get()._setIsPlaying(false));
  audioManager.on('ended', () => get().skipNext());

  return {
    currentTrackId: null,
    isPlaying: false,
    position: 0,
    duration: 0,
    volume: 0.8,
    shuffle: false,
    repeat: 'off',
    queue: [],
    queueIndex: 0,

    playTrack: (trackId, queue) => {
      const url = getFileUrl(trackId);
      if (!url) {
        useToastStore.getState().addToast('File tidak tersedia. Tambahkan ulang lagu dari storage.');
        return;
      }
      const libraryTracks = useLibraryStore.getState().tracks;
      const q = queue ?? libraryTracks.map(t => t.id);
      const idx = q.indexOf(trackId);
      set({ currentTrackId: trackId, queue: q, queueIndex: idx >= 0 ? idx : 0, position: 0 });
      audioManager.play(url).catch(() => {
        useToastStore.getState().addToast('Gagal memutar lagu.');
      });
      db.updateTrack({ id: trackId, lastPlayedAt: Date.now(), playCount: 0 });
    },

    togglePlay: () => {
      if (audioManager.paused) audioManager.resume().catch(() => {});
      else audioManager.pause();
    },

    seekTo: (s) => {
      audioManager.seekTo(s);
      set({ position: s });
    },

    setVolume: (v) => {
      audioManager.setVolume(v);
      set({ volume: v });
      db.saveSettings({ lastVolume: v });
    },

    skipNext: () => {
      const { queue, queueIndex, shuffle, repeat } = get();
      if (!queue.length) return;
      let next: number;
      if (shuffle) next = Math.floor(Math.random() * queue.length);
      else if (queueIndex < queue.length - 1) next = queueIndex + 1;
      else if (repeat === 'all') next = 0;
      else { set({ isPlaying: false }); return; }
      get().playTrack(queue[next], queue);
    },

    skipPrev: () => {
      const { queue, queueIndex, position } = get();
      if (position > 3) { get().seekTo(0); return; }
      if (queueIndex > 0) get().playTrack(queue[queueIndex - 1], queue);
      else get().seekTo(0);
    },

    toggleShuffle: () => set(s => ({ shuffle: !s.shuffle })),
    toggleRepeat: () => set(s => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),

    _setPosition: (position) => set({ position }),
    _setDuration: (duration) => set({ duration }),
    _setIsPlaying: (isPlaying) => set({ isPlaying }),
  };
});

// ── Settings Store ────────────────────────────────────────────────────────────
interface SettingsStore {
  settings: AppSettings;
  loadSettings: () => Promise<void>;
  saveSettings: (partial: Partial<AppSettings>) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,

  loadSettings: async () => {
    const saved = await db.getSettings();
    set({ settings: saved });
    applyTheme(saved);
  },

  saveSettings: (partial) => {
    const merged = { ...get().settings, ...partial };
    set({ settings: merged });
    db.saveSettings(merged);
    applyTheme(merged);
  },
}));

function applyTheme(settings: AppSettings) {
  document.documentElement.style.setProperty('--accent', settings.accentColor);
}

// ── Toast Store ───────────────────────────────────────────────────────────────
interface ToastStore {
  toasts: { id: string; message: string }[];
  addToast: (msg: string) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message) => {
    const id = generateId();
    set(s => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3000);
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
