/* -- Remembered panel sizes ------------------------------------------
 * Sizes live in memory and are mirrored to localStorage, so they survive a
 * reload. Storage can be missing or throw (private windows, blocked site
 * data); every access is guarded and the in-memory value still works.
 */

const PREFIX = 'archon.panel.';
const cache = new Map<string, number>();
const listeners = new Set<() => void>();

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export function readSize(key: string, fallback: number): number {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  let size = fallback;
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    const parsed = raw == null ? NaN : Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) size = parsed;
  } catch {
    // storage unavailable: keep the fallback
  }
  cache.set(key, size);
  return size;
}

export function writeSize(key: string, size: number): void {
  const rounded = Math.round(size);
  if (cache.get(key) === rounded) return;
  cache.set(key, rounded);
  try {
    globalThis.localStorage?.setItem(PREFIX + key, String(rounded));
  } catch {
    // storage unavailable: the size still applies for this session
  }
  listeners.forEach(fn => fn());
}

export function clearSize(key: string): void {
  cache.delete(key);
  try {
    globalThis.localStorage?.removeItem(PREFIX + key);
  } catch {
    // storage unavailable
  }
  listeners.forEach(fn => fn());
}

export function subscribeSizes(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
