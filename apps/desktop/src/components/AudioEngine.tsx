import { useEffect, useRef } from 'react';
import { usePlayerStore, useSettingsStore } from '../store';
import { useLibraryStore } from '../store';
import { createTranslator } from '../i18n';

// Guard: track which <audio> elements have already been wired into an AudioContext.
// This prevents the "HTMLMediaElement already connected to a different MediaSource"
// InvalidStateError if the component ever mounts more than once (e.g. HMR, StrictMode).
const connectedAudioElements = new WeakSet<HTMLAudioElement>();


/**
 * AudioEngine: headless component that manages the <audio> element,
 * connects it to the EQ Web Audio API, and drives the player store.
 */
export default function AudioEngine() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const gainRef = useRef<GainNode | null>(null);

  const setAudioRef = usePlayerStore(s => s.setAudioRef);
  const currentTrackId = usePlayerStore(s => s.currentTrackId);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const volume = usePlayerStore(s => s.volume);
  const isMuted = usePlayerStore(s => s.isMuted);
  const position = usePlayerStore(s => s.position);
  const duration = usePlayerStore(s => s.duration);
  const repeat = usePlayerStore(s => s.repeat);
  const shuffle = usePlayerStore(s => s.shuffle);
  const skipNext = usePlayerStore(s => s.skipNext);
  const setPosition = usePlayerStore(s => s.setPosition);
  const setDuration = usePlayerStore(s => s.setDuration);
  const setIsPlaying = usePlayerStore(s => s.setIsPlaying);

  const tracks = useLibraryStore(s => s.tracks);
  const eq = useSettingsStore(s => s.settings.eq);
  const theme = useSettingsStore(s => s.settings.theme);
  const language = useSettingsStore(s => s.settings.language);

  // Register audio element with store
  useEffect(() => {
    if (audioRef.current) setAudioRef(audioRef.current);
  }, []);

  // Setup Web Audio API context + filters — runs ONCE only.
  // Do NOT add volume/isMuted here; that caused AudioContext to be torn down
  // and recreated on every volume change, triggering the
  // "HTMLMediaElement already connected to a different MediaSource" error.
  useEffect(() => {
    const audio = audioRef.current;
    // Guard: if this audio element is already wired, do nothing.
    if (!audio || ctxRef.current || connectedAudioElements.has(audio)) return;

    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    (window as any).analyser = analyser; // Expose for Visualizer

    const source = ctx.createMediaElementSource(audio);
    connectedAudioElements.add(audio); // Mark as connected
    sourceRef.current = source;

    // 10-band EQ filters
    const freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const filters = freqs.map(freq => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.4;
      filter.gain.value = 0;
      return filter;
    });
    filtersRef.current = filters;

    const gain = ctx.createGain();
    gain.gain.value = 1; // Initial volume applied separately below
    gainRef.current = gain;

    // Chain: source → analyser → filters → gain → destination
    source.connect(analyser);
    let prev: AudioNode = analyser;
    for (const f of filters) { prev.connect(f); prev = f; }
    prev.connect(gain);
    gain.connect(ctx.destination);

    return () => {
      // 🚨 CRITICAL: Prevent Memory Leaks! 🚨
      // AudioContext max limits are ~6 per browser tab. If we don't close it, it leaks easily.
      try {
        source.disconnect();
        analyser.disconnect();
        filters.forEach(f => f.disconnect());
        gain.disconnect();
        void ctx.close();
      } catch (e) {
        // ignore errors on cleanup
      }
      ctxRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
      filtersRef.current = [];
      gainRef.current = null;
      delete (window as any).analyser;
    };
  }, []); // ← empty array: setup runs once, cleanup on unmount only

  // Apply EQ changes
  useEffect(() => {
    if (!filtersRef.current.length) return;
    filtersRef.current.forEach((f, i) => {
      f.gain.value = eq.enabled ? (eq.bands[i]?.gain ?? 0) : 0;
    });
  }, [eq]);

  // Load track when currentTrackId changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrackId) return;
    const track = tracks.find(t => t.id === currentTrackId);
    if (!track) return;

    // Resume AudioContext (browser policy)
    ctxRef.current?.resume();

    // Use forward slashes and ensure robust comparison
    const normalizedPath = track.filePath.replace(/\\/g, '/');
    const newSrc = `media:///${normalizedPath}`;
    
    // Check if truly different to avoid reset to 0
    const currentSrc = decodeURIComponent(audio.src).replace(/\\/g, '/');
    const isSame = currentSrc === newSrc || 
                   currentSrc === new URL(newSrc, window.location.href).href.replace(/\\/g, '/') ||
                   currentSrc.endsWith(normalizedPath);

    if (!isSame) {
      console.log('AudioEngine: src changing', { from: currentSrc, to: newSrc });
      audio.src = newSrc;
      audio.load();
    }
    
    if (isPlaying && audio.paused) {
      audio.play().catch(() => {});
    }
  }, [currentTrackId, isPlaying, tracks]);

  // Sync isPlaying
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [isPlaying]);

  // Sync state to Electron for Tray Menu
  useEffect(() => {
    const api = window.api as any;
    if (!api?.player) return;
    const track = tracks.find(t => t.id === currentTrackId);
    
    // Get computed theme values
    const root = document.documentElement;
    const accent = getComputedStyle(root).getPropertyValue('--accent').trim();
    const surface = getComputedStyle(root).getPropertyValue('--surface-color').trim();
    const panel = getComputedStyle(root).getPropertyValue('--panel-bg').trim();
    const textPrimary = getComputedStyle(root).getPropertyValue('--text-primary').trim();
    const textSecondary = getComputedStyle(root).getPropertyValue('--text-secondary').trim();
    const border = getComputedStyle(root).getPropertyValue('--glass-border').trim();
    const resolvedTheme = root.getAttribute('data-theme') || 'dark';
    
    // Get translations for tray
    const t = createTranslator(language);
    
    api.player.syncState({
      title: track?.title || '',
      artist: track?.artist || '',
      position,
      duration,
      isPlaying: isPlaying,
      shuffle,
      repeat,
      accent: accent || '#a08cff',
      surface: surface || 'rgba(15,15,18,0.85)',
      panel,
      textPrimary,
      textSecondary,
      border: border || 'rgba(255,255,255,0.12)',
      theme: resolvedTheme,
      labels: {
        nowPlaying: t('trayNowPlaying'),
        paused: t('trayPaused'),
        open: t('trayOpen'),
        exit: t('trayExit')
      }
    });
  }, [currentTrackId, isPlaying, position, duration, shuffle, repeat, tracks, theme, language]);

  // Volume
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Keep media element at full volume and control loudness from gain node
    // so the slider stays responsive while using the Web Audio graph.
    audio.volume = 1;
    audio.muted = false;

    const normalizedVolume = isMuted ? 0 : volume;
    if (gainRef.current) {
      gainRef.current.gain.value = normalizedVolume;
    }
  }, [volume, isMuted]);

  return (
    <audio
      ref={audioRef}
      onTimeUpdate={e => setPosition((e.target as HTMLAudioElement).currentTime)}
      onDurationChange={e => setDuration((e.target as HTMLAudioElement).duration)}
      onLoadedMetadata={e => setDuration((e.target as HTMLAudioElement).duration)}
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
      onEnded={() => {
        if (repeat === 'one') {
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
          }
        } else skipNext();
      }}
      style={{ display: 'none' }}
    />
  );
}
