import { audioContext, bell, outputBus, repeat, reverb } from '../audio.js';
import { lengthSetting, singlePhase } from './shared.js';

const BOWL = {
  hz: 196,
  gain: 0.28,
  decayS: 22,
  beatHz: 1.3,
  attackS: 0.006,
  // [frequency ratio, relative gain, decay scale]: measured-ish singing bowl partials.
  partials: [[1, 1, 1], [2.71, 0.45, 0.6], [5.15, 0.2, 0.35], [8.43, 0.08, 0.2]],
  leadS: 1.5, // first strike waits this long after Begin
  reverbS: 4,
  wet: 0.4,
};

let stopSound = null;

export default {
  id: 'bowl',
  name: 'Bowl',
  blurb: 'Close your eyes. Follow each strike of the bowl until the sound has completely gone, then rest until the next.',
  settings: [
    { key: 'interval', label: 'Every', type: 'duration', min: 20, max: 120, step: 10, default: 40 },
    lengthSetting(10),
  ],
  plan: singlePhase('Listening'),
  uniforms: ({ interval }) => ({ u_interval: interval, u_lead: BOWL.leadS, u_decay: BOWL.decayS }),
  sound: {
    start({ interval }) {
      const ctx = audioContext();
      if (!ctx) return;
      const bus = outputBus();
      const dry = ctx.createGain();
      const room = reverb(BOWL.reverbS);
      const wet = ctx.createGain();
      wet.gain.value = BOWL.wet;
      dry.connect(bus.node);
      dry.connect(room).connect(wet).connect(bus.node);
      const stopRepeat = repeat(ctx.currentTime + BOWL.leadS, interval, (_, at) => bell(dry, {
        hz: BOWL.hz, at, gain: BOWL.gain, decay: BOWL.decayS,
        partials: BOWL.partials, attack: BOWL.attackS, beatHz: BOWL.beatHz,
      }));
      stopSound = () => {
        stopRepeat();
        bus.close();
      };
    },
    stop() {
      stopSound?.();
      stopSound = null;
    },
  },
  fragment: `
uniform float u_interval;
uniform float u_lead;
uniform float u_decay;

const float RING_SPEED = 0.03; // screen heights per second
const vec3 TONE = vec3(1.0, 0.78, 0.45);

// Dim on purpose: this mode is meant for closed eyes.
void main() {
  vec2 p = screenUV();
  float r = length(p);
  float age = mod(max(u_time - u_lead, 0.0), u_interval);
  float struck = step(u_lead, u_time);
  float fade = exp(-age / (u_decay * 0.35)) * struck;

  float front = age * RING_SPEED;
  float x = (r - front) / 0.012;
  float ring = exp(-x * x) * fade;
  float centre = exp(-r * 22.0) * (0.35 + 0.65 * fade); // a resting point for open eyes

  vec3 col = TONE * (ring * 0.25 + centre * 0.2);
  gl_FragColor = finish(col);
}
`,
};
