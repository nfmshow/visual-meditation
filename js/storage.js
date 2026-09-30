import { STORAGE_KEYS, LOG } from './config.js';
import { clamp, DAY_MS } from './util.js';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export const loadModeId = () => read(STORAGE_KEYS.mode, null);
export const saveModeId = (id) => write(STORAGE_KEYS.mode, id);

export function loadSettings(mode) {
  const saved = read(STORAGE_KEYS.settings, {})[mode.id] ?? {};
  return Object.fromEntries(mode.settings.map((d) => [
    d.key,
    Number.isFinite(saved[d.key]) ? clamp(saved[d.key], d.min, d.max) : d.default,
  ]));
}

export function saveSettings(modeId, values) {
  const all = read(STORAGE_KEYS.settings, {});
  all[modeId] = values;
  write(STORAGE_KEYS.settings, all);
}

export function logSession(modeId, seconds) {
  if (seconds < LOG.minSeconds) return;
  const log = read(STORAGE_KEYS.log, []);
  log.push({ at: new Date().toISOString(), mode: modeId, seconds });
  write(STORAGE_KEYS.log, log.slice(-LOG.maxEntries));
}

export function recentSummary() {
  const since = Date.now() - LOG.summaryDays * DAY_MS;
  const recent = read(STORAGE_KEYS.log, []).filter((e) => Date.parse(e.at) >= since);
  const seconds = recent.reduce((sum, e) => sum + e.seconds, 0);
  return { sessions: recent.length, minutes: Math.round(seconds / 60) };
}
