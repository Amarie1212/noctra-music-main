import { create } from 'zustand';
import type { Track, Playlist, PlayerState, AppSettings, LibrarySort, AppTheme } from '@music/core';
import { DEFAULT_SETTINGS, generateId } from '@music/core';

const SETTINGS_CACHE_KEY = 'music.settings.cache';
const METADATA_PARSE_CONCURRENCY = 6;

function readCachedSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeCachedSettings(settings: AppSettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write errors.
  }
}

const INITIAL_SETTINGS = readCachedSettings();

// ─── Library Store ────────────────────────────────────────────────────────────
interface LibraryStore {
  tracks: Track[];
  isLoading: boolean;
  sort: LibrarySort;
  libraryTab: 'songs' | 'albums' | 'artists' | 'folders' | 'playlists';
  viewMode: 'list' | 'grid';
  loadTracks: () => Promise<void>;
  setSort: (s: LibrarySort) => void;
  setLibraryTab: (t: 'songs' | 'albums' | 'artists' | 'folders' | 'playlists') => void;
  setViewMode: (v: 'list' | 'grid') => void;
  addFiles: (paths: string[]) => Promise<void>;
  addFolder: (folderPath: string) => Promise<void>;
  addFolders: (folderPaths: string[]) => Promise<void>;
  clearAll: () => Promise<void>;
  removeTrack: (id: string) => Promise<void>;
  updateTrack: (track: { id: string; title?: string; artist?: string; album?: string; genre?: string; year?: number; trackNumber?: number }) => Promise<boolean>;
  updateArtwork: (id: string, artworkData: string) => Promise<boolean>;
  setArtworkFromFile: (id: string, filePath: string) => Promise<string | null>;
  searchTracks: (q: string) => Promise<Track[]>;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  tracks: [],
  isLoading: false,
  sort: 'name-asc',
  libraryTab: (INITIAL_SETTINGS.startupTab as any) || (INITIAL_SETTINGS.lastLibraryTab as any) || 'songs',
  viewMode: INITIAL_SETTINGS.libraryViewMode || 'list',

  loadTracks: async () => {
    set({ isLoading: true });
    let tracks = await window.api.library.getAll() as Track[];
    
    // Apply initial sort
    const { sort } = get();
    tracks = sortTracks(tracks, sort);
    
    set({ tracks, isLoading: false });
  },

  setSort: (sort: LibrarySort) => {
    const sorted = sortTracks(get().tracks, sort);
    set({ tracks: sorted, sort });
  },

  setLibraryTab: (libraryTab) => {
    set({ libraryTab });
    useSettingsStore.getState().saveSettings({ lastLibraryTab: libraryTab });
  },
  
  setViewMode: (viewMode) => {
    set({ viewMode });
    useSettingsStore.getState().saveSettings({ libraryViewMode: viewMode });
  },

  addFiles: async (paths) => {
    const { tracks } = get();
    const existingPaths = new Set(tracks.map(t => t.filePath));
    const newPaths = paths.filter(p => !existingPaths.has(p));
    if (!newPaths.length) return;

    const newTracks = await mapWithConcurrency(newPaths, METADATA_PARSE_CONCURRENCY, async filePath => {
      const meta = await window.api.metadata.parse(filePath);
      return {
        id: generateId(),
        filePath,
        title: meta.title || filePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') || 'Unknown',
        artist: meta.artist || 'Unknown Artist',
        album: meta.album || 'Unknown Album',
        genre: meta.genre || 'Unknown',
        duration: meta.duration || 0,
        artworkData: meta.artworkData,
        artworkPath: meta.artworkPath,
        year: meta.year,
        trackNumber: meta.trackNumber,
        format: meta.format || 'Unknown',
        size: meta.size || 0,
        addedAt: Date.now(),
        playCount: 0,
      } as Track;
    });

    if (!newTracks.length) return;

    await window.api.library.addTracks(newTracks);
    const updated = [...newTracks, ...get().tracks];
    set({ tracks: sortTracks(updated, get().sort) });
  },

  addFolder: async (folderPath) => {
    const paths = await window.api.folder.scan(folderPath);
    if (!paths.length) return;
    await get().addFiles(paths);
  },

  addFolders: async (folderPaths) => {
    if (!folderPaths.length) return;
    const scanned = await Promise.all(folderPaths.map(folderPath => window.api.folder.scan(folderPath)));
    const allPaths = [...new Set(scanned.flat())];
    if (!allPaths.length) return;
    await get().addFiles(allPaths);
  },

  clearAll: async () => {
    await window.api.library.clearAll();
    set({ tracks: [] });
    usePlaylistStore.setState(state => ({
      playlists: state.playlists.map(playlist => ({ ...playlist, trackIds: [] })),
    }));
  },

  removeTrack: async (id) => {
    await window.api.library.removeTrack(id);
    set(s => ({ tracks: s.tracks.filter(t => t.id !== id) }));
  },

  updateTrack: async (track) => {
    const ok = await window.api.library.updateTrack(track);
    if (ok) {
      set(s => ({
        tracks: s.tracks.map(t => t.id === track.id ? { ...t, ...track } : t)
      }));
    }
    return ok;
  },

  updateArtwork: async (id, artworkData) => {
    const ok = await window.api.library.updateArtwork(id, artworkData);
    if (ok) {
      set(s => ({
        tracks: s.tracks.map(t => t.id === id ? { ...t, artworkData } : t)
      }));
    }
    return ok;
  },

  setArtworkFromFile: async (id, filePath) => {
    const artworkData = await window.api.library.setArtworkFromFile(id, filePath);
    if (artworkData) {
      set(s => ({
        tracks: s.tracks.map(t => t.id === id ? { ...t, artworkData } : t)
      }));
    }
    return artworkData;
  },

  searchTracks: async (q) => {
    if (!q.trim()) return get().tracks;
    const tracks = await window.api.library.search(q) as Track[];
    return sortTracks(tracks, get().sort);
  },
}));

function sortTracks(tracks: Track[], sort: LibrarySort): Track[] {
  const result = [...tracks];
  switch (sort) {
    case 'name-asc':
      return result.sort((a, b) => compareText(a.title, b.title));
    case 'name-desc':
      return result.sort((a, b) => compareText(b.title, a.title));
    case 'date-added':
      return result.sort((a, b) => b.addedAt - a.addedAt || compareText(a.title, b.title));
    case 'last-played':
      return result.sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0) || compareText(a.title, b.title));
    case 'year':
      return result.sort((a, b) => (b.year || 0) - (a.year || 0) || compareText(a.title, b.title));
    default:
      return result;
  }
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

// ─── Grouping Helpers ────────────────────────────────────────────────────────
export function groupTracksBy(tracks: Track[], key: 'artist' | 'album' | 'folder'): Record<string, Track[]> {
  const groups: Record<string, Track[]> = {};
  for (const t of tracks) {
    let groupKey = 'Unknown';
    if (key === 'folder') {
      const parts = t.filePath.split(/[\\/]/);
      groupKey = parts.length > 1 ? parts[parts.length - 2] : 'Root';
    } else {
      groupKey = t[key] || 'Unknown';
    }
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(t);
  }
  return groups;
}

// ─── Playlist Store ───────────────────────────────────────────────────────────
interface PlaylistStore {
  playlists: Playlist[];
  loadPlaylists: () => Promise<void>;
  createPlaylist: (name: string) => Promise<string>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  removeTracksFromPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  reorderPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  updatePlaylistArtwork: (id: string, artworkData: string) => Promise<void>;
  setPlaylistCoverFromFile: (id: string, filePath: string) => Promise<void>;
}

export const usePlaylistStore = create<PlaylistStore>((set, get) => ({
  playlists: [],

  loadPlaylists: async () => {
    const playlists = await window.api.playlists.getAll() as Playlist[];
    set({ playlists });
  },

  createPlaylist: async (name) => {
    const id = await window.api.playlists.create(name) as string;
    const pl: Playlist = { id, name, trackIds: [], createdAt: Date.now(), updatedAt: Date.now() };
    set(s => ({ playlists: [pl, ...s.playlists] }));
    return id;
  },

  renamePlaylist: async (id, name) => {
    await window.api.playlists.rename(id, name);
    set(s => ({ playlists: s.playlists.map(p => p.id === id ? { ...p, name } : p) }));
  },

  deletePlaylist: async (id) => {
    await window.api.playlists.delete(id);
    set(s => ({ playlists: s.playlists.filter(p => p.id !== id) }));
  },

  addTrackToPlaylist: async (playlistId, trackId) => {
    await window.api.playlists.addTrack(playlistId, trackId);
    set(s => ({
      playlists: s.playlists.map(p =>
        p.id === playlistId && !p.trackIds.includes(trackId)
          ? { ...p, trackIds: [...p.trackIds, trackId] }
          : p
      ),
    }));
  },

  addTracksToPlaylist: async (playlistId, trackIds) => {
    const uniqueTrackIds = [...new Set(trackIds)];
    await window.api.playlists.addTracks(playlistId, uniqueTrackIds);
    set(s => ({
      playlists: s.playlists.map(p => {
        if (p.id !== playlistId) return p;
        const existing = new Set(p.trackIds);
        return {
          ...p,
          trackIds: [...p.trackIds, ...uniqueTrackIds.filter(id => !existing.has(id))],
        };
      }),
    }));
  },

  removeTrackFromPlaylist: async (playlistId, trackId) => {
    await window.api.playlists.removeTrack(playlistId, trackId);
    set(s => ({
      playlists: s.playlists.map(p =>
        p.id === playlistId
          ? { ...p, trackIds: p.trackIds.filter(id => id !== trackId) }
          : p
      ),
    }));
  },

  removeTracksFromPlaylist: async (playlistId, trackIds) => {
    await window.api.playlists.removeTracks(playlistId, trackIds);
    set(s => ({
      playlists: s.playlists.map(p => {
        if (p.id !== playlistId) return p;
        const targetSet = new Set(trackIds);
        return {
          ...p,
          trackIds: p.trackIds.filter(id => !targetSet.has(id)),
        };
      }),
    }));
  },

  reorderPlaylist: async (playlistId, trackIds) => {
    await window.api.playlists.reorder(playlistId, trackIds);
    set(s => ({
      playlists: s.playlists.map(p => p.id === playlistId ? { ...p, trackIds } : p),
    }));
  },

  updatePlaylistArtwork: async (id, artworkData) => {
    await window.api.playlists.updateArtwork(id, artworkData);
    set(s => ({
      playlists: s.playlists.map(p => p.id === id ? { ...p, artworkData } : p),
    }));
  },

  setPlaylistCoverFromFile: async (id, filePath) => {
    const coverArt = await window.api.playlists.setCoverFromFile(id, filePath);
    set(s => ({
      playlists: s.playlists.map(p => p.id === id ? { ...p, coverArt, artworkData: undefined } : p),
    }));
  },
}));

// ─── Player Store ─────────────────────────────────────────────────────────────
interface PlayerStore extends PlayerState {
  audioRef: HTMLAudioElement | null;
  isNowPlayingOpen: boolean;
  isNowPlayingVisible: boolean;
  setAudioRef: (a: HTMLAudioElement) => void;
  playTrack: (trackId: string, queue?: string[]) => void;
  togglePlay: () => void;
  setIsPlaying: (value: boolean) => void;
  setNowPlayingOpen: (open: boolean) => void;
  seekTo: (s: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setPosition: (s: number) => void;
  setDuration: (s: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setQueue: (ids: string[], index?: number) => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  audioRef: null,
  currentTrackId: null,
  isPlaying: false,
  volume: INITIAL_SETTINGS.lastVolume ?? 0.5,
  isMuted: (INITIAL_SETTINGS.lastVolume ?? 0.5) === 0,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  queue: [],
  queueIndex: 0,
  isNowPlayingOpen: true,
  isNowPlayingVisible: true,

  setAudioRef: (a) => {
    const { volume, isMuted } = get();
    a.volume = 1;
    a.muted = false;
    set({ audioRef: a, volume, isMuted });
  },

  playTrack: (trackId, queue) => {
    const { audioRef } = get();
    const libraryTracks = useLibraryStore.getState().tracks;
    const q = queue ?? (get().queue.length ? get().queue : libraryTracks.map(track => track.id));
    const idx = q.indexOf(trackId);
    set({
      currentTrackId: trackId,
      isPlaying: true,
      queue: q,
      queueIndex: idx >= 0 ? idx : 0,
      position: 0,
      // Ensure the player slides open when a track starts.
      isNowPlayingOpen: true,
      isNowPlayingVisible: true,
    });
    window.api.library.updatePlayCount(trackId).catch(() => {});
  },

  togglePlay: () => {
    const { isPlaying, audioRef } = get();
    if (!audioRef) return;
    if (isPlaying) audioRef.pause();
    else audioRef.play().catch(() => {});
    set({ isPlaying: !isPlaying });
  },

  setIsPlaying: (value) => set({ isPlaying: value }),

  setNowPlayingOpen: (() => {
    let closeTimer: number | undefined;
    return (open: boolean) => {
      if (closeTimer) {
        window.clearTimeout(closeTimer);
        closeTimer = undefined;
      }

      if (open) {
        set({ isNowPlayingOpen: true, isNowPlayingVisible: true });
        return;
      }

      // Start closing animation: keep the pane in layout while it slides out,
      // then collapse it to free space for the library (one layout change).
      set({ isNowPlayingOpen: false, isNowPlayingVisible: true });
      closeTimer = window.setTimeout(() => {
        set({ isNowPlayingVisible: false });
        closeTimer = undefined;
      }, 220);
    };
  })(),

  seekTo: (s) => {
    const { audioRef } = get();
    if (audioRef) audioRef.currentTime = s;
    set({ position: s });
  },

  setVolume: (v) => {
    const { audioRef } = get();
    const nextVolume = Math.max(0, Math.min(1, v));
    if (audioRef) {
      audioRef.volume = 1;
      audioRef.muted = false;
    }
    useSettingsStore.getState().saveSettings({ lastVolume: nextVolume });
    set({ volume: nextVolume, isMuted: nextVolume === 0 });
  },

  toggleMute: () => {
    const { audioRef, isMuted, volume } = get();
    if (!audioRef) return;
    if (isMuted) {
      audioRef.volume = 1;
      audioRef.muted = false;
      set({ isMuted: false });
    } else {
      audioRef.volume = 1;
      audioRef.muted = false;
      set({ isMuted: true });
    }
  },

  setPosition: (s) => set({ position: s }),
  setDuration: (s) => set({ duration: s }),

  skipNext: () => {
    const { queue, queueIndex, shuffle, repeat } = get();
    if (!queue.length) return;
    let next: number;
    if (shuffle) next = Math.floor(Math.random() * queue.length);
    else if (queueIndex < queue.length - 1) next = queueIndex + 1;
    else if (repeat === 'all') next = 0;
    else return;
    get().playTrack(queue[next], queue);
  },

  skipPrev: () => {
    const { queue, queueIndex, position } = get();
    if (position > 3) { get().seekTo(0); return; }
    if (queueIndex > 0) get().playTrack(queue[queueIndex - 1], queue);
    else get().seekTo(0);
  },

  toggleShuffle: () => set(s => ({ shuffle: !s.shuffle })),

  toggleRepeat: () => set(s => ({
    repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
  })),

  setQueue: (ids, index = 0) => set({ queue: ids, queueIndex: index }),
}));

// ─── Settings Store ───────────────────────────────────────────────────────────
interface SettingsStore {
  settings: AppSettings;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (partial: Partial<AppSettings>) => Promise<void>;
}

function resolveTheme(theme: AppTheme): Exclude<AppTheme, 'system'> {
  if (theme !== 'system') return theme;
  const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'graphite' : 'light';
}

let themeTransitionTimer: number | undefined;

function applyTheme(settings: AppSettings) {
  const resolvedTheme = resolveTheme(settings.theme);
  // Keep theme changes smooth without permanently animating everything.
  // This is lightweight (CSS-only) and removed shortly after applying.
  const root = document.documentElement;
  root.classList.add('theme-transition');
  window.clearTimeout(themeTransitionTimer);
  themeTransitionTimer = window.setTimeout(() => root.classList.remove('theme-transition'), 260);
  document.documentElement.style.setProperty('--accent', settings.accentColor);
  document.documentElement.setAttribute('data-theme', resolvedTheme);
  document.documentElement.setAttribute('data-theme-source', settings.theme);
  window.api?.theme?.set?.(settings.theme as any);
}

export function applyCachedThemeSnapshot() {
  const cachedSettings = readCachedSettings();
  applyTheme(cachedSettings);
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: INITIAL_SETTINGS,
  loaded: false,

  loadSettings: async () => {
    const savedSettings = await window.api.settings.get() as AppSettings;
    const normalizePlayerLayout = (layout: unknown): AppSettings['playerLayout'] => {
      if (layout === 'poster' || layout === 'vinyl' || layout === 'musicbox' || layout === 'cassette' || layout === 'galleryframe') return layout;
      if (layout === 'cdcase' || layout === 'wavestudio' || layout === 'minitheater' || layout === 'lyricfocus') return 'spotlight';
      if (layout === 'radioconsole' || layout === 'tapemachine') return 'musicbox';
      return 'spotlight';
    };

    let settings = {
      ...DEFAULT_SETTINGS,
      ...savedSettings,
      playerLayout: normalizePlayerLayout(savedSettings?.playerLayout ?? DEFAULT_SETTINGS.playerLayout),
    };

    // Migration: older builds defaulted to 0.8 and made the player feel "full" on first launch.
    // Only adjust when the user appears to still be on the legacy defaults (so we don't overwrite preferences).
    const looksLikeLegacyDefaults =
      (savedSettings?.lastVolume === 0.8) &&
      (savedSettings?.theme ?? 'system') === 'system' &&
      (savedSettings?.language ?? 'system') === 'system' &&
      (savedSettings?.accentColor ?? '#94a3b8') === '#94a3b8' &&
      normalizePlayerLayout(savedSettings?.playerLayout ?? 'spotlight') === 'spotlight' &&
      (savedSettings?.libraryViewMode ?? 'list') === 'list' &&
      (savedSettings?.lastLibraryTab ?? 'songs') === 'songs' &&
      (savedSettings as any)?.startupTab == null;

    if (looksLikeLegacyDefaults || settings.playerLayout !== savedSettings?.playerLayout) {
      settings = { ...settings, lastVolume: looksLikeLegacyDefaults ? 0.5 : settings.lastVolume };
      void window.api.settings.save(settings);
    }
    writeCachedSettings(settings);
    set({ settings, loaded: true });
    
    // Sync LibraryStore
    useLibraryStore.setState({ 
      libraryTab: (settings.startupTab as any) || (settings.lastLibraryTab as any) || 'songs',
      viewMode: settings.libraryViewMode || 'list'
    });
    usePlayerStore.setState({
      volume: settings.lastVolume ?? 0.5,
      isMuted: (settings.lastVolume ?? 0.5) === 0,
    });

    applyTheme(settings);
  },

  saveSettings: async (partial) => {
    const merged = { ...get().settings, ...partial };
    set({ settings: merged });
    writeCachedSettings(merged);
    await window.api.settings.save(merged);
    applyTheme(merged);
  },
}));

// ─── Toast Store ──────────────────────────────────────────────────────────────
interface Toast { id: string; message: string; }
interface ToastStore {
  toasts: Toast[];
  addToast: (msg: string) => void;
  removeToast: (id: string) => void;
}

let lastToastMessage = '';
let lastToastAt = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message) => {
    const now = Date.now();
    if (message === lastToastMessage && now - lastToastAt < 1200) return;
    lastToastMessage = message;
    lastToastAt = now;
    const id = generateId();
    set(s => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3000);
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
