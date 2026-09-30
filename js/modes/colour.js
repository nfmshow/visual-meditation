import { choiceSetting, lengthSetting, singlePhase } from './shared.js';

// Colour stops, visited in order and looping. Kept dim so a full screen is easy on the eyes.
const PALETTES = [
  { name: 'Warm', stops: [[0.55, 0.25, 0.08], [0.5, 0.16, 0.2], [0.6, 0.32, 0.2], [0.45, 0.12, 0.06]] },
  { name: 'Cool', stops: [[0.08, 0.32, 0.36], [0.1, 0.18, 0.45], [0.26, 0.16, 0.42], [0.1, 0.36, 0.28]] },
  { name: 'Spectrum', stops: [[0.5, 0.12, 0.12], [0.55, 0.35, 0.08], [0.14, 0.4, 0.2], [0.12, 0.2, 0.5], [0.35, 0.14, 0.45]] },
];

const STOP_S = 40; // seconds from one colour to the next

const ease = (x) => x * x * (3 - 2 * x);

function colourAt(stops, t) {
  const x = t / STOP_S;
  const i = Math.floor(x) % stops.length;
  const from = stops[i];
  const to = stops[(i + 1) % stops.length];
  const k = ease(x % 1);
  return from.map((v, c) => v + (to[c] - v) * k);
}

export default {
  id: 'colour',
  name: 'Colour',
  blurb: 'A field of colour that shifts slowly. Soften your gaze and let the edges of the screen disappear.',
  settings: [choiceSetting('palette', 'Palette', PALETTES.map((pt) => pt.name)), lengthSetting(10)],
  plan: singlePhase('Watching'),
  uniforms: ({ palette }, t) => ({ u_colour: colourAt(PALETTES[palette].stops, t) }),
  fragment: `
uniform vec3 u_colour;

void main() {
  vec2 p = screenUV();
  gl_FragColor = dither(u_colour * (1.0 - 0.12 * dot(p, p))); // barely-there falloff for depth
}
`,
};
