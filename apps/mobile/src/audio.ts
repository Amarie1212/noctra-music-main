// Audio playback engine for mobile (pure Web Audio / HTMLAudioElement)
// Replaces the Electron AudioEngine component from desktop.

type AudioEventMap = {
  timeupdate: number;
  duration: number;
  ended: void;
  play: void;
  pause: void;
  error: string;
};

type Listener<T> = (data: T) => void;

class AudioManager {
  private el: HTMLAudioElement;
  private listeners = new Map<string, Set<Listener<any>>>();

  constructor() {
    this.el = new Audio();
    this.el.preload = 'auto';

    this.el.addEventListener('timeupdate', () => this.emit('timeupdate', this.el.currentTime));
    this.el.addEventListener('durationchange', () => this.emit('duration', this.el.duration || 0));
    this.el.addEventListener('ended', () => this.emit('ended', undefined));
    this.el.addEventListener('play', () => this.emit('play', undefined));
    this.el.addEventListener('pause', () => this.emit('pause', undefined));
    this.el.addEventListener('error', () => this.emit('error', this.el.error?.message ?? 'Playback error'));
  }

  on<K extends keyof AudioEventMap>(event: K, cb: Listener<AudioEventMap[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  private emit<K extends keyof AudioEventMap>(event: K, data: AudioEventMap[K]) {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  async play(url: string): Promise<void> {
    this.el.src = url;
    await this.el.play();
  }

  async resume(): Promise<void> {
    await this.el.play();
  }

  pause(): void { this.el.pause(); }
  seekTo(seconds: number): void { this.el.currentTime = seconds; }
  setVolume(v: number): void { this.el.volume = Math.max(0, Math.min(1, v)); }

  get currentTime(): number { return this.el.currentTime; }
  get duration(): number { return this.el.duration || 0; }
  get paused(): boolean { return this.el.paused; }
  get volume(): number { return this.el.volume; }
}

export const audioManager = new AudioManager();
