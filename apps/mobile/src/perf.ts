type PerfSample = {
  label: string;
  durationMs?: number;
  usedJSHeapSizeMB?: number;
  totalJSHeapSizeMB?: number;
  timestamp: number;
  meta?: Record<string, unknown>;
};

type PerfWindow = Window & typeof globalThis & {
  __musicPerf?: PerfSample[];
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

const MAX_SAMPLES = 80;

function isPerfEnabled() {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('music.perf-debug') === '1';
  } catch {
    return false;
  }
}

function pushSample(sample: PerfSample) {
  if (!isPerfEnabled() || typeof window === 'undefined') return;
  const perfWindow = window as PerfWindow;
  const next = [...(perfWindow.__musicPerf || []), sample];
  perfWindow.__musicPerf = next.slice(-MAX_SAMPLES);
}

export function markPerfStart(label: string) {
  if (!isPerfEnabled() || typeof performance === 'undefined') return;
  performance.mark(`${label}:start`);
}

export function markPerfEnd(label: string, meta?: Record<string, unknown>) {
  if (!isPerfEnabled() || typeof performance === 'undefined') return;

  const startMark = `${label}:start`;
  const endMark = `${label}:end`;
  const measureName = `${label}:measure`;

  performance.mark(endMark);
  try {
    performance.measure(measureName, startMark, endMark);
    const entries = performance.getEntriesByName(measureName);
    const durationMs = entries[entries.length - 1]?.duration;
    pushSample({
      label,
      durationMs,
      timestamp: Date.now(),
      meta,
    });
    if (durationMs != null) {
      console.info(`[perf] ${label}: ${durationMs.toFixed(1)}ms`, meta || {});
    }
  } catch {
    // Ignore incomplete measurements.
  } finally {
    performance.clearMarks(startMark);
    performance.clearMarks(endMark);
    performance.clearMeasures(measureName);
  }
}

export function logMemorySnapshot(label: string, meta?: Record<string, unknown>) {
  if (!isPerfEnabled() || typeof performance === 'undefined' || typeof window === 'undefined') return;
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
  }).memory;
  if (!memory) return;

  const usedJSHeapSizeMB = Number((memory.usedJSHeapSize / 1024 / 1024).toFixed(1));
  const totalJSHeapSizeMB = Number((memory.totalJSHeapSize / 1024 / 1024).toFixed(1));
  pushSample({
    label,
    usedJSHeapSizeMB,
    totalJSHeapSizeMB,
    timestamp: Date.now(),
    meta,
  });
  console.info(`[perf] ${label}: ${usedJSHeapSizeMB}/${totalJSHeapSizeMB} MB`, meta || {});
}

export function scheduleMemorySnapshot(label: string, meta?: Record<string, unknown>) {
  if (!isPerfEnabled() || typeof window === 'undefined') return;
  const perfWindow = window as PerfWindow;
  if (perfWindow.requestIdleCallback) {
    perfWindow.requestIdleCallback(() => logMemorySnapshot(label, meta), { timeout: 900 });
    return;
  }
  window.setTimeout(() => logMemorySnapshot(label, meta), 80);
}

export function scheduleAfterFirstPaint(callback: () => void) {
  if (typeof window === 'undefined') {
    callback();
    return () => {};
  }

  const perfWindow = window as PerfWindow;
  if (perfWindow.requestIdleCallback) {
    const idleId = perfWindow.requestIdleCallback(callback, { timeout: 300 });
    return () => {
      if (perfWindow.cancelIdleCallback) perfWindow.cancelIdleCallback(idleId);
    };
  }

  const rafId = window.requestAnimationFrame(() => window.setTimeout(callback, 0));
  return () => window.cancelAnimationFrame(rafId);
}
