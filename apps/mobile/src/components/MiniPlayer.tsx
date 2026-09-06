import { useLibraryStore, usePlayerStore } from '../store';

interface Props {
  onExpand: () => void;
}

export default function MiniPlayer({ onExpand }: Props) {
  const currentTrackId = usePlayerStore(s => s.currentTrackId);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const skipNext = usePlayerStore(s => s.skipNext);
  const tracks = useLibraryStore(s => s.tracks);

  const track = tracks.find(t => t.id === currentTrackId);
  if (!track) return null;

  const artwork = track.artworkData;

  return (
    <div className="mini-player" onClick={onExpand}>
      {/* Artwork */}
      <div className="mini-player-art">
        {artwork
          ? <img src={artwork} alt="" className="mini-player-art-img" />
          : <span className="mini-player-art-icon">♪</span>
        }
      </div>

      {/* Info */}
      <div className="mini-player-info">
        <span className="mini-player-title">{track.title}</span>
        <span className="mini-player-artist">{track.artist}</span>
      </div>

      {/* Controls */}
      <div className="mini-player-controls" onClick={e => e.stopPropagation()}>
        <button className="mini-ctrl-btn" onClick={togglePlay}>
          {isPlaying
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          }
        </button>
        <button className="mini-ctrl-btn" onClick={skipNext}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
