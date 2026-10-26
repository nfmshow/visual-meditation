export const DAY_MS = 86_400_000;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function smoothstep(a, b, x) {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
}

// Random number within [lo, hi].
export const between = ([lo, hi]) => lo + Math.random() * (hi - lo);

// '1 tap', '3 taps'.
export const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
