import { useEffect, useState } from 'react';
import { useLibraryStore, usePlaylistStore, usePlayerStore, useSettingsStore, useToastStore } from './store';
import LibraryView from './components/LibraryView';
import MiniPlayer from './components/MiniPlayer';
import PlayerSheet from './components/PlayerSheet';
import BottomNav from './components/BottomNav';

export type Tab = 'library' | 'playlists' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const [playerOpen, setPlayerOpen] = useState(false);
  const loadTracks = useLibraryStore(s => s.loadTracks);
  const loadPlaylists = usePlaylistStore(s => s.loadPlaylists);
  const loadSettings = useSettingsStore(s => s.loadSettings);
  const currentTrackId = usePlayerStore(s => s.currentTrackId);
  const toasts = useToastStore(s => s.toasts);

  useEffect(() => {
    void Promise.allSettled([loadSettings(), loadTracks(), loadPlaylists()]);
  }, [loadSettings, loadTracks, loadPlaylists]);

  return (
    <div className="app-root">
      {/* Page content */}
      <main className="main-content">
        {activeTab === 'library' && <LibraryView />}
        {activeTab === 'playlists' && <PlaylistsView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* Bottom bar: mini player + nav */}
      <div className="bottom-bar">
        {currentTrackId && <MiniPlayer onExpand={() => setPlayerOpen(true)} />}
        <BottomNav active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Full-screen player overlay */}
      <PlayerSheet isOpen={playerOpen} onClose={() => setPlayerOpen(false)} />

      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast">{t.message}</div>
        ))}
      </div>
    </div>
  );
}

// ── Inline simple views ───────────────────────────────────────────────────────
function PlaylistsView() {
  const playlists = usePlaylistStore(s => s.playlists);
  const createPlaylist = usePlaylistStore(s => s.createPlaylist);
  const [name, setName] = useState('');

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await createPlaylist(trimmed);
    setName('');
  };

  return (
    <div className="view-wrapper">
      <div className="view-header">
        <h1 className="view-title">Playlists</h1>
      </div>
      <div className="create-playlist-row">
        <input
          className="create-playlist-input"
          placeholder="Nama playlist baru..."
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button className="btn-accent" onClick={handleCreate}>+</button>
      </div>
      {playlists.length === 0 && (
        <div className="empty-state">
          <p>Belum ada playlist</p>
        </div>
      )}
      <div className="list-container">
        {playlists.map(pl => (
          <div key={pl.id} className="list-item">
            <div className="list-item-art playlist-art">♬</div>
            <div className="list-item-info">
              <span className="list-item-title">{pl.name}</span>
              <span className="list-item-sub">{pl.trackIds.length} lagu</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsView() {
  const { settings, saveSettings } = useSettingsStore();
  const clearAll = useLibraryStore(s => s.clearAll);

  return (
    <div className="view-wrapper">
      <div className="view-header">
        <h1 className="view-title">Pengaturan</h1>
      </div>
      <div className="settings-list">
        <div className="settings-group">
          <div className="settings-label">Tema</div>
          <div className="settings-options">
            {(['graphite', 'dark', 'light', 'midnight'] as const).map(theme => (
              <button
                key={theme}
                className={`settings-chip ${settings.theme === theme ? 'active' : ''}`}
                onClick={() => saveSettings({ theme })}
              >
                {theme}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-group">
          <div className="settings-label">Accent Color</div>
          <input
            type="color"
            value={settings.accentColor}
            onChange={e => saveSettings({ accentColor: e.target.value })}
            className="color-picker"
          />
        </div>
        <div className="settings-group settings-danger">
          <button
            className="btn-danger"
            onClick={() => {
              if (window.confirm('Hapus semua lagu dari library?')) clearAll();
            }}
          >
            🗑 Hapus Semua Library
          </button>
        </div>
      </div>
    </div>
  );
}
