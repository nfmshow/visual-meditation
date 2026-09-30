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
