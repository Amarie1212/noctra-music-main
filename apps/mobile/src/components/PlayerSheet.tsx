import { useEffect, useRef, useState } from 'react';
import { useLibraryStore, usePlayerStore } from '../store';
import { formatDuration } from '@music/core';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function PlayerSheet({ isOpen, onClose }: Props) {
  const currentTrackId = usePlayerStore(s => s.currentTrackId);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const position = usePlayerStore(s => s.position);
  const duration = usePlayerStore(s => s.duration);
  const shuffle = usePlayerStore(s => s.shuffle);
  const repeat = usePlayerStore(s => s.repeat);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const seekTo = usePlayerStore(s => s.seekTo);
  const skipNext = usePlayerStore(s => s.skipNext);
  const skipPrev = usePlayerStore(s => s.skipPrev);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const toggleRepeat = usePlayerStore(s => s.toggleRepeat);
  const tracks = useLibraryStore(s => s.tracks);
  const track = tracks.find(t => t.id === currentTrackId);

  // Swipe-to-close
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = true;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    dragCurrentY.current = delta;
    if (delta > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  };
  const handleTouchEnd = () => {
    isDragging.current = false;
    if (dragCurrentY.current > 120) {
      onClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }
    dragCurrentY.current = 0;
  };

  // Seek bar local state
  const [localPos, setLocalPos] = useState(position);
  const [seeking, setSeeking] = useState(false);
  useEffect(() => { if (!seeking) setLocalPos(position); }, [position, seeking]);

  const progress = duration > 0 ? (localPos / duration) * 100 : 0;
  const artwork = track?.artworkData;

  return (
    <div className={`player-sheet ${isOpen ? 'open' : ''}`} ref={sheetRef}>
      {/* Drag handle */}
      <div
        className="player-sheet-handle-area"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="player-sheet-handle" />
        <button className="player-sheet-close" onClick={onClose}>∨</button>
      </div>

      {/* Artwork */}
      <div className="player-artwork-wrap">
        <div className={`player-artwork ${isPlaying ? 'playing' : ''}`}>
          {artwork
            ? <img src={artwork} alt="" className="player-artwork-img" />
            : <div className="player-artwork-fallback">♪</div>
          }
        </div>
      </div>

      {/* Track info */}
      <div className="player-info">
        <h2 className="player-title">{track?.title || 'Tidak ada lagu'}</h2>
        <p className="player-artist">{track?.artist || '–'}</p>
      </div>

      {/* Seek bar */}
      <div className="player-seekbar-wrap">
        <input
          type="range"
          className="player-seekbar"
          min={0}
          max={duration || 1}
          value={localPos}
          style={{ '--progress': `${progress}%` } as React.CSSProperties}
          onChange={e => setLocalPos(Number(e.target.value))}
          onMouseDown={() => setSeeking(true)}
          onTouchStart={() => setSeeking(true)}
          onMouseUp={() => { setSeeking(false); seekTo(localPos); }}
          onTouchEnd={() => { setSeeking(false); seekTo(localPos); }}
        />
        <div className="player-times">
          <span>{formatDuration(localPos)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="player-controls">
        <button className={`ctrl-btn small ${shuffle ? 'active' : ''}`} onClick={toggleShuffle}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
            <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
            <line x1="4" y1="4" x2="9" y2="9"/>
          </svg>
        </button>
        <button className="ctrl-btn" onClick={skipPrev}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>
          </svg>
        </button>
        <button className="ctrl-btn play-btn" onClick={togglePlay}>
          {isPlaying
            ? <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            : <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          }
        </button>
        <button className="ctrl-btn" onClick={skipNext}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
          </svg>
        </button>
        <button className={`ctrl-btn small ${repeat !== 'off' ? 'active' : ''}`} onClick={toggleRepeat}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9"/>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <polyline points="7 23 3 19 7 15"/>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            {repeat === 'one' && <text x="9" y="14" fontSize="8" fill="currentColor" stroke="none">1</text>}
          </svg>
        </button>
      </div>
    </div>
  );
}
