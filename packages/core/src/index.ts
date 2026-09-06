// Shared types for the music player
export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number; // in seconds
  filePath: string;
  artworkPath?: string;
  artworkData?: string; // base64
  year?: number;
  trackNumber?: number;
  format: string;
  size: number;
  addedAt: number; // timestamp
  lastPlayedAt?: number;
  playCount: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverArt?: string; // Keep for legacy if needed, or replace
  artworkData?: string; // base64
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PlayerState {
  currentTrackId: string | null;
  isPlaying: boolean;
  volume: number; // 0-1
  isMuted: boolean;
  position: number; // seconds
  duration: number; // seconds
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
  queue: string[]; // track IDs
  queueIndex: number;
}

export interface EQBand {
  frequency: number;
  gain: number; // -12 to +12 dB
}

export interface EQSettings {
  enabled: boolean;
  presetName: string;
  bands: EQBand[];
}

export type AppTheme =
  | 'dark'
  | 'light'
  | 'system'
  | 'midnight'
  | 'forest'
  | 'sunset'
  | 'aqua'
  | 'beach'
  | 'sky'
  | 'gold'
  | 'frost'
  | 'rose'
  | 'ember'
  | 'aurora'
  | 'graphite';

export type LibrarySort = 'name-asc' | 'name-desc' | 'date-added' | 'last-played' | 'year';

export interface AppSettings {
  theme: AppTheme;
  language: 'system' | 'id' | 'en' | 'ja';
  closeAction: 'exit' | 'tray';
  accentColor: string; // hex
  eq: EQSettings;
  lastVolume: number;
  crossfadeDuration: number; // seconds, 0 = disabled
  showVisualizer: boolean;
  playerLayout:
    | 'spotlight'
    | 'poster'
    | 'vinyl'
    | 'musicbox'
    | 'cassette'
    | 'cdcase'
    | 'wavestudio'
    | 'minitheater'
    | 'radioconsole'
    | 'galleryframe'
    | 'tapemachine'
    | 'lyricfocus';
  libraryViewMode: 'list' | 'grid';
  startupTab?: 'songs' | 'albums' | 'artists' | 'folders' | 'playlists';
  lastLibraryTab: 'songs' | 'albums' | 'artists' | 'folders' | 'playlists';
}

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface Lyrics {
  trackId: string;
  lines: LyricLine[];
  source: 'online' | 'local';
}

// EQ Presets
export const EQ_PRESETS: Record<string, number[]> = {
  'Flat':        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost':  [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Bass Cut':    [-6, -5, -4, -2, 0, 0, 0, 0, 0, 0],
  'Rock':        [4, 3, 2, 1, -1, -1, 1, 2, 3, 4],
  'Pop':         [-1, 2, 4, 4, 2, 0, -1, -1, -1, -1],
  'Jazz':        [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
  'Classical':   [4, 3, 2, 1, 0, 0, 1, 2, 3, 4],
  'Electronic':  [5, 4, 1, 0, -2, 2, 1, 2, 4, 5],
  'Vocal':       [-2, -1, 0, 3, 5, 5, 3, 1, 0, -1],
  'Loudness':    [4, 3, 0, 0, -1, 0, 0, 0, 3, 4],
};

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'system',
  closeAction: 'exit',
  accentColor: '#94a3b8',
  eq: {
    enabled: false,
    presetName: 'Flat',
    bands: EQ_FREQUENCIES.map(f => ({ frequency: f, gain: 0 })),
  },
  lastVolume: 0.5,
  crossfadeDuration: 0,
  showVisualizer: true,
  playerLayout: 'spotlight',
  libraryViewMode: 'list',
  startupTab: 'songs',
  lastLibraryTab: 'songs',
};

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}
