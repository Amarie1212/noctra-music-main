import { useRef, useState, useDeferredValue, useMemo } from 'react';
import { useLibraryStore, usePlayerStore, useToastStore, hasFileUrl } from '../store';
import type { Track } from '@music/core';
import { formatDuration } from '@music/core';

export default function LibraryView() {
  const tracks = useLibraryStore(s => s.tracks);
  const isLoading = useLibraryStore(s => s.isLoading);
  const addingCount = useLibraryStore(s => s.addingCount);
  const addFiles = useLibraryStore(s => s.addFiles);
  const sort = useLibraryStore(s => s.sort);
  const setSort = useLibraryStore(s => s.setSort);

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    if (!deferredSearch.trim()) return tracks;
    const q = deferredSearch.toLowerCase();
    return tracks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
    );
  }, [tracks, deferredSearch]);

  const handleAddFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*,.mp3,.flac,.aac,.ogg,.wav,.m4a,.opus,.wma,.aiff';
    input.onchange = () => {
      if (!input.files?.length) return;
      addFiles(Array.from(input.files));
    };
    input.click();
  };

  const handleAddFolder = () => {
    const input = document.createElement('input') as HTMLInputElement & { webkitdirectory: boolean };
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.onchange = () => {
      if (!input.files?.length) return;
      const audioFiles = Array.from(input.files).filter(f => f.type.startsWith('audio/') || /\.(mp3|flac|ogg|wav|aac|m4a|opus|wma|aiff)$/i.test(f.name));
      if (audioFiles.length) addFiles(audioFiles);
    };
    input.click();
  };

  return (
    <div className="view-wrapper">
      {/* Header */}
      <div className="view-header">
        <h1 className="view-title">Library</h1>
        <div className="view-header-actions">
          <button className="btn-icon" onClick={handleAddFiles} title="Tambah lagu">＋</button>
          <button className="btn-icon" onClick={handleAddFolder} title="Tambah folder">📁</button>
        </div>
      </div>

      {/* Search + Sort */}
      {tracks.length > 0 && (
        <div className="library-toolbar">
          <input
            className="search-input"
            placeholder="Cari lagu, artis, album..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="sort-select"
            value={sort}
            onChange={e => setSort(e.target.value as any)}
          >
            <option value="date-added">Terbaru</option>
            <option value="name-asc">Nama A–Z</option>
            <option value="name-desc">Nama Z–A</option>
          </select>
        </div>
      )}

      {/* Adding progress */}
      {addingCount > 0 && (
        <div className="adding-progress">
          <div className="adding-spinner" />
          Menambahkan {addingCount} lagu...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && tracks.length === 0 && addingCount === 0 && (
        <div className="empty-state">
          <div className="empty-icon">♪</div>
          <h2 className="empty-title">Library Kosong</h2>
          <p className="empty-desc">Tambahkan musik dari storage HP kamu</p>
          <div className="empty-actions">
            <button className="btn-accent" onClick={handleAddFiles}>+ Pilih Lagu</button>
            <button className="btn-secondary" onClick={handleAddFolder}>📁 Pilih Folder</button>
          </div>
          <p className="empty-note">
            ⚠️ Lagu perlu ditambahkan ulang setiap sesi browser.<br/>
            Gunakan APK (via GitHub Actions) untuk akses permanen.
          </p>
        </div>
      )}

      {/* Track list */}
      {filtered.length > 0 && (
        <div className="list-container">
          <div className="list-stats">{filtered.length} lagu</div>
          {filtered.map((track, i) => (
            <TrackItem key={track.id} track={track} index={i} queue={filtered} />
          ))}
        </div>
      )}

      {/* No search results */}
      {tracks.length > 0 && filtered.length === 0 && deferredSearch && (
        <div className="empty-state">
          <p>Tidak ada hasil untuk "<strong>{deferredSearch}</strong>"</p>
        </div>
      )}
    </div>
  );
}

function TrackItem({ track, queue }: { track: Track; index: number; queue: Track[] }) {
  const playTrack = usePlayerStore(s => s.playTrack);
  const currentTrackId = usePlayerStore(s => s.currentTrackId);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const removeTrack = useLibraryStore(s => s.removeTrack);
  const addToast = useToastStore(s => s.addToast);
  const [menuOpen, setMenuOpen] = useState(false);

  const isCurrent = currentTrackId === track.id;
  const fileAvailable = hasFileUrl(track.id);

  const handlePlay = () => {
    if (!fileAvailable) {
      addToast('Tambahkan ulang file ini untuk memutarnya');
      return;
    }
    playTrack(track.id, queue.map(t => t.id));
  };

  return (
    <div className={`track-item ${isCurrent ? 'active' : ''}`} onClick={handlePlay}>
      {/* Artwork */}
      <div className="track-art">
        {track.artworkData
          ? <img src={track.artworkData} alt="" className="track-art-img" />
          : <span className="track-art-icon">{isCurrent && isPlaying ? '▶' : '♪'}</span>
        }
      </div>

      {/* Info */}
      <div className="track-info">
        <span className={`track-title ${!fileAvailable ? 'unavailable' : ''}`}>{track.title}</span>
        <span className="track-sub">{track.artist} · {track.album}</span>
      </div>

      {/* Duration */}
      <span className="track-duration">{formatDuration(track.duration)}</span>

      {/* Context menu */}
      <button
        className="track-menu-btn"
        onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
      >⋮</button>
      {menuOpen && (
        <div className="track-menu" onClick={e => e.stopPropagation()}>
          <button onClick={() => { removeTrack(track.id); setMenuOpen(false); }}>Hapus dari Library</button>
        </div>
      )}
    </div>
  );
}
