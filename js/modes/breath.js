import { audioContext, noiseBuffer, outputBus, repeat } from '../audio.js';
import { choiceSetting, lengthSetting, singlePhase } from './shared.js';

// Seconds per segment. Resonance (~5.5 breaths a minute) has the best evidence for calming.
const PATTERNS = [
  { name: 'Resonance', in: 5.5, holdIn: 0, out: 5.5, holdOut: 0 },
  { name: 'Calm', in: 4, holdIn: 0, out: 6, holdOut: 0 },
  { name: 'Box', in: 4, holdIn: 4, out: 4, holdOut: 4 },
  { name: '4-7-8', in: 4, holdIn: 7, out: 8, holdOut: 0 },
];

// Breath sound: brown noise that swells and brightens with the lungs.
const SOUND = { gain: [0.03, 0.16], cutoffHz: [250, 1200], rampSteps: 12, noiseS: 4 };

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const cycleLength = (pt) => pt.in + pt.holdIn + pt.out + pt.holdOut;

// 0 = empty, 1 = full. Drives both the visual and the sound.
function breathAt(pt, t) {
  let x = t % cycleLength(pt);
  if (x < pt.in) return ease(x / pt.in);
  x -= pt.in;
  if (x < pt.holdIn) return 1;
  x -= pt.holdIn;
  if (x < pt.out) return 1 - ease(x / pt.out);
  return 0;
}

// Eased ramp built from short linear steps (curves cannot share endpoints safely).
function rampEased(param, [lo, hi], from, to, at, seconds) {
  for (let k = 1; k <= SOUND.rampSteps; k++) {
    const b = from + (to - from) * ease(k / SOUND.rampSteps);
    param.linearRampToValueAtTime(lo + (hi - lo) * b, at + (seconds * k) / SOUND.rampSteps);
  }
}

let stopSound = null;

export default {
  id: 'breath',
  name: 'Breath',
  blurb: 'Breathe in as the light grows, out as it shrinks. Eyes open or closed; the sound follows the same rhythm.',
  settings: [
    choiceSetting('pattern', 'Pattern', PATTERNS.map((pt) => pt.name)),
    choiceSetting('sound', 'Sound', ['Off', 'On'], 1),
    lengthSetting(5),
  ],
  plan: singlePhase('Breathing'),
  uniforms: ({ pattern }, t) => ({ u_breath: breathAt(PATTERNS[pattern], t) }),
  sound: {
    start({ pattern, sound }) {
      const ctx = audioContext();
      if (!ctx || !sound) return;
      const pt = PATTERNS[pattern];
      const bus = outputBus();
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(SOUND.noiseS);
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const env = ctx.createGain();
      source.connect(filter).connect(env).connect(bus.node);
      const start = ctx.currentTime;
      source.start(start);
      const stopRepeat = repeat(start, cycleLength(pt), (_, at) => {
        for (const [param, range] of [[env.gain, SOUND.gain], [filter.frequency, SOUND.cutoffHz]]) {
          if (at === start) param.setValueAtTime(range[0], at);
          let seg = at;
          rampEased(param, range, 0, 1, seg, pt.in);
          seg += pt.in + pt.holdIn;
          param.linearRampToValueAtTime(range[1], seg);
          rampEased(param, range, 1, 0, seg, pt.out);
          seg += pt.out + pt.holdOut;
          param.linearRampToValueAtTime(range[0], seg);
        }
      });
      stopSound = () => {
        stopRepeat();
        bus.close();
        source.stop(ctx.currentTime + 2);
      };
    },
    stop() {
      stopSound?.();
      stopSound = null;
    },
  },
  fragment: `
uniform float u_breath;

const float R_EMPTY = 0.07;
const float R_FULL  = 0.2;
const vec3 CORE  = vec3(1.0, 0.85, 0.65);
const vec3 EDGE  = vec3(0.35, 0.6, 0.9);
const vec3 GUIDE = vec3(0.5, 0.55, 0.6);

void main() {
  vec2 p = screenUV();
  float px = 1.0 / u_resolution.y;
  float b = u_breath;
  float radius = mix(R_EMPTY, R_FULL, b);
  float r = length(p);

  // Soft orb: warm centre fading to a cool rim, with a glow outside. No hard edge.
  float fall = r / radius;
  float body = smoothstep(1.15, 0.6, fall);
  vec3 orb = mix(CORE, EDGE, smoothstep(0.0, 1.1, fall)) * body * (0.45 + 0.25 * b);
  vec3 glow = EDGE * exp(-max(r - radius, 0.0) * 12.0) * (0.1 + 0.1 * b) * (1.0 - body);

  // Faint rings marking empty and full, so you can see where the breath is heading.
  vec2 g = (vec2(r) - vec2(R_FULL, R_EMPTY)) / (1.5 * px);
  float guide = exp(-g.x * g.x) + exp(-g.y * g.y);

  vec3 col = orb + glow + GUIDE * guide * 0.08;
  gl_FragColor = finish(col);
}
`,
};
