// Deterministic randomness for NIGHTSHIFT (mulberry32). Screenshot staging
// needs repeatability: the same seed always yields the same patrol jitter and
// chip sparkle. Live play seeds from the clock; ?shot= scenes pass a seed.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick one element of an array using the given rng.
export function pick(rng, array) {
  return array[Math.floor(rng() * array.length)];
}

// A float in [min, max) — handy for spawn jitter and sparkle offsets.
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

// Numeric helpers shared by the world simulation and the renderer.
export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

// Shortest signed turn from angle `from` toward `to`, wrapped to (-PI, PI].
export function angleDelta(from, to) {
  const twoPi = Math.PI * 2;
  let d = (to - from) % twoPi;
  if (d > Math.PI) d -= twoPi;
  if (d <= -Math.PI) d += twoPi;
  return d;
}
