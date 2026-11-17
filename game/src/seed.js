// Seeded randomness. One generator per city build keeps every street, tower and streetlight in
// the same place for a given seed, so a screenshot taken today is the same picture tomorrow.

/** A small, fast, deterministic generator (mulberry32) with the helpers the city builders want. */
export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.state = this.seed || 0x9e3779b9;
  }

  /** Next float in [0, 1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max], both ends included. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }

  /** One element of a non-empty array. */
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  /** A fresh generator derived from this one, so sub-builders do not disturb the caller's stream. */
  fork(salt) {
    return new Rng((this.state ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0);
  }
}

/** Turn any seed-ish string (a URL parameter, a save file) into a 32-bit integer seed. */
export function normalizeSeed(value, fallback = 1) {
  if (value === null || value === undefined || value === '') return fallback;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return Math.abs(Math.floor(asNumber)) >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
