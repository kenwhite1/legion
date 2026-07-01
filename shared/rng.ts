// Deterministic, serialisable PRNG (mulberry32). The engine threads a numeric
// `rngState` through every state so shuffles & draws replay identically on the
// server (authoritative online) and on the client (instant solo), and so the
// unit tests are reproducible.

export interface Rng {
  state: number
  next(): number // float in [0, 1)
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0
  return {
    get state() {
      return s
    },
    set state(v: number) {
      s = v >>> 0
    },
    next() {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

// Fisher-Yates using the supplied rng (mutates a copy, returns it).
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
