import { formatDuration } from '@music/core';
import { useEffect, useMemo, useState } from 'react';
import { useLibraryStore, usePlayerStore, useSettingsStore } from '../store';
import { getTrackArtworkSrc } from '../artwork';

export default function NowPlayingPane() {
  const currentTrackId = usePlayerStore(s => s.currentTrackId);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const position = usePlayerStore(s => s.position);
  const duration = usePlayerStore(s => s.duration);
  const volume = usePlayerStore(s => s.volume);
  const isMuted = usePlayerStore(s => s.isMuted);
  const shuffle = usePlayerStore(s => s.shuffle);
  const repeat = usePlayerStore(s => s.repeat);
  const queue = usePlayerStore(s => s.queue);
  const queueIndex = usePlayerStore(s => s.queueIndex);

  const togglePlay = usePlayerStore(s => s.togglePlay);
  const seekTo = usePlayerStore(s => s.seekTo);
  const setVolume = usePlayerStore(s => s.setVolume);
  const toggleMute = usePlayerStore(s => s.toggleMute);
  const skipNext = usePlayerStore(s => s.skipNext);
  const skipPrev = usePlayerStore(s => s.skipPrev);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const toggleRepeat = usePlayerStore(s => s.toggleRepeat);
  const tracks = useLibraryStore(s => s.tracks);
  const playerLayout = useSettingsStore(s => s.settings.playerLayout);

  const [localPos, setLocalPos] = useState(position);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) setLocalPos(position);
  }, [position, isDragging]);

  const effectiveVolume = isMuted ? 0 : volume;
  const tracksById = useMemo(() => new Map(tracks.map(trackItem => [trackItem.id, trackItem])), [tracks]);
  const track = currentTrackId ? tracksById.get(currentTrackId) : undefined;
  const artworkSrc = track ? getTrackArtworkSrc(track) : undefined;
  const nextTrackId = queueIndex < queue.length - 1 ? queue[queueIndex + 1] : repeat === 'all' ? queue[0] : undefined;
  const nextTrack = nextTrackId ? tracksById.get(nextTrackId) : undefined;
  const hasTrack = Boolean(track);
  const shouldAnimateRecord = hasTrack && (playerLayout === 'vinyl' || playerLayout === 'cassette');
  useEffect(() => {
    if (!isDragging) return;

    const finishDrag = () => {
      setIsDragging(false);
      seekTo(localPos);
    };

    window.addEventListener('mouseup', finishDrag);
    return () => window.removeEventListener('mouseup', finishDrag);
  }, [isDragging, localPos, seekTo]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setLocalPos(val);
    if (!isDragging) seekTo(val);
  };

  return (
    <aside className={`now-playing-pane layout-${playerLayout}`}>
      <div className="now-playing-pane-inner">
        <div className={`album-art-container ${hasTrack && isPlaying ? 'playing' : ''}`}>
          {playerLayout === 'musicbox' && (
            <>
              <div className="musicbox-speaker left" aria-hidden="true">
                <span></span>
                <span></span>
              </div>
              <div className="musicbox-speaker right" aria-hidden="true">
                <span></span>
                <span></span>
              </div>
            </>
          )}
          <div className={`vinyl-record ${shouldAnimateRecord ? 'spinning' : ''} ${shouldAnimateRecord && !isPlaying ? 'paused' : ''}`}>
            <div className="vinyl-label-outer">
              {artworkSrc ? (
                <img className="vinyl-label-artwork" src={artworkSrc} alt="" decoding="async" draggable={false} />
              ) : (
                <span className="vinyl-label-icon" aria-hidden="true">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="9" r="2.5" />
                    <circle cx="16" cy="7" r="2.5" />
                    <path d="M8 9v6c0 1.5 2 2.5 4 2.5s4-1 4-2.5V7" />
                  </svg>
                </span>
              )}
            </div>
          </div>
          <div className={`tonearm-visual ${hasTrack && isPlaying ? 'active' : ''}`}>
            <svg viewBox="0 0 140 140" fill="none">
              <circle cx="110" cy="30" r="10" fill="#333" />
              <circle cx="110" cy="30" r="4" fill="#666" />
              <path d="M110 30 L40 110" stroke="#444" strokeWidth="6" strokeLinecap="round" />
              <path d="M110 30 L40 110" stroke="#666" strokeWidth="2" strokeLinecap="round" />
              <rect x="30" y="105" width="20" height="12" rx="4" transform="rotate(-45 40 111)" fill="#222" />
              <rect x="32" y="107" width="16" height="8" rx="2" transform="rotate(-45 40 111)" fill="#444" />
            </svg>
          </div>
          {playerLayout === 'musicbox' && (
            <div className={`musicbox-bars ${hasTrack && isPlaying ? 'active' : ''}`} aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>

        <div className={`track-meta ${hasTrack ? '' : 'track-meta-empty'}`}>
          <h2 className="track-title">{track?.title || 'No Song Selected'}</h2>
          <p className="track-artist">{track?.artist || 'Select a song from your library to start playing'}</p>
        </div>

        <div className="player-controls">
          <div className="control-buttons-premium">
            <button className={`btn-box ${shuffle ? 'active' : ''}`} onClick={toggleShuffle} disabled={!hasTrack}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
            </button>

            <button className="btn-box" onClick={skipPrev} disabled={!hasTrack}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
            </button>

            <button className="play-btn-circle" onClick={togglePlay} disabled={!hasTrack}>
              {isPlaying ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              )}
            </button>

            <button className="btn-box" onClick={skipNext} disabled={!hasTrack}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
            </button>

            <button className={`btn-box ${repeat !== 'off' ? 'active' : ''}`} onClick={toggleRepeat} disabled={!hasTrack}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>{repeat === 'one' && <path d="M11 10h1v4"></path>}</svg>
            </button>
          </div>

          <div className="progress-container">
            <div className="seekbar-container" style={{ '--progress-width': `${(localPos / (duration || 1)) * 100}%` } as any}>
              <input
                type="range"
                className="seekbar"
                min={0}
                max={duration || 1}
                value={localPos}
                onChange={handleSeek}
                onMouseDown={() => setIsDragging(true)}
                disabled={!hasTrack}
                style={{ '--progress': `${(localPos / (duration || 1)) * 100}%` } as any}
              />
            </div>
            <div className="progress-meta-row">
              <span className="progress-time-inline">{`${formatDuration(localPos)} - ${formatDuration(duration)}`}</span>
              <div className="volume-control compact">
                <button
                  type="button"
                  className={`volume-icon-btn ${isMuted || volume === 0 ? 'muted' : ''}`}
                  onClick={toggleMute}
                  title={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
                  aria-label={isMuted || volume === 0 ? 'Unmute volume' : 'Mute volume'}
                  disabled={!hasTrack}
                >
                  <span className="volume-icon" aria-hidden="true">
                    {isMuted || volume === 0 ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"></polygon>
                        <line x1="22" y1="9" x2="16" y2="15"></line>
                        <line x1="16" y1="9" x2="22" y2="15"></line>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"></polygon>
                        <path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
                        <path d="M18.5 5.5a9 9 0 0 1 0 13"></path>
                      </svg>
                    )}
                  </span>
                </button>
                <div className="volume-slider-wrapper" style={{ '--volume-width': `${effectiveVolume * 100}%` } as any}>
                  <input
                    type="range"
                    className="volume-slider"
                    min={0}
                    max={1}
                    step={0.01}
                    value={effectiveVolume}
                    onChange={e => setVolume(Number(e.target.value))}
                    disabled={!hasTrack}
                    style={{ '--progress': `${effectiveVolume * 100}%` } as any}
                  />
                </div>
              </div>
            </div>
            {nextTrack && (
              <div className="next-up" title={`Next up: ${nextTrack.title}`}>
                <span className="next-up-label">Next up</span>
                <span className="next-up-title">{nextTrack.title}</span>
                <span className="next-up-artist">{nextTrack.artist}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
