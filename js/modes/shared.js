import { formatClock } from '../util.js';

// Setting definitions. Every setting is a number stepped between min and max;
// type only changes how it is shown.
export const lengthSetting = (def) => ({
  key: 'minutes', label: 'Length', type: 'minutes', min: 1, max: 60, step: 1, default: def,
});

export const choiceSetting = (key, label, options, def = 0) => ({
  key, label, type: 'choice', options, min: 0, max: options.length - 1, step: 1, default: def,
});

export function formatSetting(def, v) {
  switch (def.type) {
    case 'duration': return formatClock(v);
    case 'minutes': return `${v} min`;
    case 'choice': return def.options[v];
    default: return String(v);
  }
}

// One visible phase lasting the Length setting.
export const singlePhase = (label) => ({ minutes }) => [{ label, seconds: minutes * 60, visible: true }];

// For modes that ask you to catch changes. Change size shrinks when one is caught and grows
// three times as much when one is missed, so it settles where about 3 in 4 are caught.
const STEPS = { start: 1, min: 0.03, max: 1, caught: 0.9, missed: 0.9 ** -3 };
export const LEVEL = {
  start: STEPS.start,
  caught: (v) => Math.max(STEPS.min, v * STEPS.caught),
  missed: (v) => Math.min(STEPS.max, v * STEPS.missed),
};

const TAP_VIBRATE_MS = 12;
// Confirms a tap landed, not whether it caught anything.
export const tapFeedback = () => navigator.vibrate?.(TAP_VIBRATE_MS);
