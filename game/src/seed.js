// Seeded randomness: the same seed builds the same Vesper Bay, street by street.
// Mulberry32 is small, fast and stable across browsers, which is all a city needs.



export function hashSeed(input) {
  let h = 2166136261 >>> 0;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = (typeof seed === 'number' ? seed >>> 0 : hashSeed(seed)) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const api = {
    next,
    float: (min = 0, max = 1) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length) % list.length],
    chance: (probability) => next() < probability,
    sign: () => (next() < 0.5 ? -1 : 1),
    range: (min, max) => min + next() * (max - min),
    shuffle: (list) => {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },

    bell: () => (next() + next() + next()) / 1.5 - 1,
    fork: (label) => makeRng((a ^ hashSeed(label)) >>> 0),
  };
  return api;
}

export function makeNoise2D(seed) {
  const rng = makeRng(seed);
  const table = new Float32Array(256 * 256);
  for (let i = 0; i < table.length; i += 1) table[i] = rng.next();
  const at = (x, y) => table[(((y & 255) << 8) | (x & 255)) >>> 0];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
  };
}
