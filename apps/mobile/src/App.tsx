import { useEffect, useRef, useState } from 'react';
import { useLibraryStore, usePlayerStore, usePlaylistStore, useSettingsStore } from './store';
import AudioEngine from './components/AudioEngine';
import ToastContainer from './components/ToastContainer';
import MainHeader from './components/MainHeader';
import NowPlayingPane from './components/NowPlayingPane';
import LibraryPane from './components/LibraryPane';
import { markPerfEnd, markPerfStart, scheduleMemorySnapshot } from './perf';

export type Page = 'home' | 'library' | 'playlists' | 'playlist-detail' | 'settings';

export default function App() {
  const loadTracks = useLibraryStore(s => s.loadTracks);
  const isLibraryLoading = useLibraryStore(s => s.isLoading);
  const trackCount = useLibraryStore(s => s.tracks.length);
  const loadPlaylists = usePlaylistStore(s => s.loadPlaylists);
  const playlistCount = usePlaylistStore(s => s.playlists.length);
  const loadSettings = useSettingsStore(s => s.loadSettings);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const skipNext = usePlayerStore(s => s.skipNext);
  const skipPrev = usePlayerStore(s => s.skipPrev);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const toggleRepeat = usePlayerStore(s => s.toggleRepeat);
  const currentTrackId = usePlayerStore(s => s.currentTrackId);
  const startupSawLoadingRef = useRef(false);
  const startupLoggedRef = useRef(false);
  const [isStartupReady, setIsStartupReady] = useState(false);
  const [hasMinSplashElapsed, setHasMinSplashElapsed] = useState(false);
  const [isAppVisible, setIsAppVisible] = useState(false);
  const [isDashboardIntroActive, setIsDashboardIntroActive] = useState(false);
  const [mobileTab, setMobileTab] = useState<'player' | 'library'>('player');

  useEffect(() => {
    markPerfStart('app-startup');
    void Promise.allSettled([loadSettings(), loadTracks(), loadPlaylists()]).then(() => {
      setIsStartupReady(true);
    });
  }, [loadPlaylists, loadSettings, loadTracks]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHasMinSplashElapsed(true);
      setIsStartupReady(true);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isStartupReady || !hasMinSplashElapsed) return;
    const timer = window.setTimeout(() => {
      const bootSplash = document.getElementById('boot-splash');
      if (bootSplash) {
        bootSplash.classList.add('is-hiding');
        window.setTimeout(() => {
          bootSplash.remove();
          setIsAppVisible(true);
          setIsDashboardIntroActive(true);
        }, 760);
        return;
      }
      setIsAppVisible(true);
      setIsDashboardIntroActive(true);
    }, 340);

    return () => window.clearTimeout(timer);
  }, [hasMinSplashElapsed, isStartupReady]);

  useEffect(() => {
    if (!isDashboardIntroActive) return;
    const timer = window.setTimeout(() => {
      setIsDashboardIntroActive(false);
    }, 1100);

    return () => window.clearTimeout(timer);
  }, [isDashboardIntroActive]);

  useEffect(() => {
    if (isLibraryLoading) {
      startupSawLoadingRef.current = true;
      return;
    }
    if (!startupSawLoadingRef.current || startupLoggedRef.current) return;
    startupLoggedRef.current = true;
    const meta = { tracks: trackCount, playlists: playlistCount };
    markPerfEnd('app-startup', meta);
    scheduleMemorySnapshot('app-startup-memory', meta);
  }, [isLibraryLoading, playlistCount, trackCount]);

  // When a track starts playing, open player tab on mobile
  useEffect(() => {
    if (!window.api?.window?.onTrayPlayerCommand) return;
    return window.api.window.onTrayPlayerCommand(command => {
      if (command === 'toggle-play') {
        togglePlay();
        return;
      }
      if (command === 'next-track') {
        skipNext();
        return;
      }
      if (command === 'previous-track') {
        skipPrev();
        return;
      }
      if (command === 'toggle-shuffle') {
        toggleShuffle();
        return;
      }
      if (command === 'toggle-repeat') {
        toggleRepeat();
      }
    });
  }, [skipNext, skipPrev, togglePlay, toggleRepeat, toggleShuffle]);

  useEffect(() => {
    if (currentTrackId) {
      setMobileTab('player');
    }
  }, [currentTrackId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        const isInput =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('input, textarea, [contenteditable="true"]');

        if (isInput) return;

        e.preventDefault();
        togglePlay();
        return;
      }

      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('input, textarea, [contenteditable="true"]');
      if (isInput) return;

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        skipNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skipPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [skipNext, skipPrev, togglePlay]);

  return (
    <div className={`app-root${isAppVisible ? ' startup-app-visible' : ' startup-app-hidden'}${isDashboardIntroActive ? ' startup-dashboard-intro' : ''}`}>
      <AudioEngine />
      <MainHeader />

      <div className={`app-container has-active-track ${mobileTab === 'player' ? 'show-player' : 'show-library'}`}>
        <NowPlayingPane />
        <LibraryPane />
      </div>

      {/* Floating mobile view switcher */}
      <nav className="mobile-view-nav" aria-label="Mobile View Navigation">
        <button
          type="button"
          className={`mobile-view-btn ${mobileTab === 'player' ? 'active' : ''}`}
          onClick={() => setMobileTab('player')}
        >
          <span>🎵</span>
          <span>Now Playing</span>
        </button>
        <button
          type="button"
          className={`mobile-view-btn ${mobileTab === 'library' ? 'active' : ''}`}
          onClick={() => setMobileTab('library')}
        >
          <span>📚</span>
          <span>Library</span>
        </button>
      </nav>

      <ToastContainer />
    </div>
  );
}
