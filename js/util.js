export const DAY_MS = 86_400_000;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
