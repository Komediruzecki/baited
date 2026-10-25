/** A small seeded random source (mulberry32), so a sound's variation can be replayed in tests and offline renders. */
export interface Rng {
  /** 0 (inclusive) to 1 (exclusive). */
  next(): number
  /** a (inclusive) to b (exclusive). */
  range(a: number, b: number): number
  /** 0 to n - 1. */
  int(n: number): number
  /** -1 or 1. */
  sign(): number
  pick<T>(items: readonly T[]): T
}

export function createRng(seed = 0x5eed_c0de): Rng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (n) => Math.max(0, Math.min(n - 1, Math.floor(next() * n))),
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: <T>(items: readonly T[]): T => items[Math.max(0, Math.min(items.length - 1, Math.floor(next() * items.length)))] as T,
  }
}

/** A stable 32-bit hash of a string, for per-texture seeds. */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
