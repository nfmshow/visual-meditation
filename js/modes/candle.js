import { rounds, CANDLE_SCENE } from './flame.js';

// Trataka: gaze at the flame, then close your eyes and hold the afterimage.
export default {
  id: 'candle',
  name: 'Candle',
  blurb: rounds.blurb,
  settings: rounds.settings,
  plan: rounds.plan,
  fragment: `
${CANDLE_SCENE}
void main() {
  gl_FragColor = finish(candleScene(screenUV(), u_time, vec4(0.0)));
}
`,
};
