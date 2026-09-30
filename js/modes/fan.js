import { AUDIO } from '../config.js';
import { audioContext, followCurve, noiseSource, outputBus, playCue, repeat } from '../audio.js';
import { choiceSetting, lengthSetting, singlePhase } from './shared.js';

const SPEEDS = [
  { name: 'Low', bladeHz: 38, humHz: 98, cutoffHz: 1600, gain: 0.5 },
  { name: 'Medium', bladeHz: 52, humHz: 110, cutoffHz: 2400, gain: 0.65 },
  { name: 'High', bladeHz: 66, humHz: 124, cutoffHz: 3400, gain: 0.8 },
];

// Seconds between "switch detail" tones; 0 = off.
const PROMPTS = [{ name: 'Off', s: 0 }, { name: '1 min', s: 60 }, { name: '2 min', s: 120 }, { name: '3 min', s: 180 }];

const FAN = {
  sweepS: 24,        // one full oscillation, left to right and back
  panWidth: 0.8,
  awayCutoff: 0.5,   // brightness and loudness scale while the fan points away
  awayGain: 0.6,
  bladeDepth: 0.18,  // amplitude flutter from the blades
  hum: [[1, 0.02], [2, 0.014], [3, 0.007]], // [harmonic, gain]; phone speakers mostly play 2 and 3
  rumbleHz: 300,
  rumbleGain: 0.35,
};

const mix = (a, b, k) => a + (b - a) * k;
// -1 left .. 1 right, and how directly the fan faces you (1 = straight on).
const sweepAt = (t) => Math.sin((2 * Math.PI * t) / FAN.sweepS);
const facingAt = (t) => 1 - sweepAt(t) ** 2;

let stopSound = null;

export default {
  id: 'fan',
  name: 'Fan',
  blurb: 'Pick one detail of the fan and stay with it: the low hum, the highest hiss, the flutter of the blades, where the sound is. When you drift, pick one again. At a soft tone, switch to a new detail. Headphones help.',
  settings: [
    choiceSetting('speed', 'Speed', SPEEDS.map((sp) => sp.name), 1),
    choiceSetting('oscillate', 'Oscillate', ['Off', 'On'], 1),
    choiceSetting('prompt', 'Switch detail', PROMPTS.map((pr) => pr.name), 2),
    lengthSetting(10),
  ],
  plan: singlePhase('Listening'),
  uniforms: ({ oscillate }, t) => ({
    u_sweep: oscillate ? sweepAt(t) : 0,
    u_facing: oscillate ? facingAt(t) : 1,
  }),
  sound: {
    start({ speed, oscillate, prompt }) {
      const ctx = audioContext();
      if (!ctx) return;
      const sp = SPEEDS[speed];
      const t0 = ctx.currentTime;
      const bus = outputBus();
      const pan = ctx.createStereoPanner();
      const level = ctx.createGain(); // louder when the fan faces you
      level.connect(pan).connect(bus.node);

      const lowpass = (hz) => {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = hz;
        return f;
      };
      const gain = (v) => {
        const g = ctx.createGain();
        g.gain.value = v;
        return g;
      };

      // Air: pink noise, lowpassed, with a flutter at the blade rate.
      const air = noiseSource('pink');
      const tone = lowpass(sp.cutoffHz);
      const flutter = gain(1 - FAN.bladeDepth);
      const blades = ctx.createOscillator();
      blades.frequency.value = sp.bladeHz;
      blades.connect(gain(FAN.bladeDepth)).connect(flutter.gain);
      air.connect(tone).connect(flutter).connect(gain(sp.gain)).connect(level);

      // Rumble of the housing, and the motor's hum.
      const rumble = noiseSource('brown');
      rumble.connect(lowpass(FAN.rumbleHz)).connect(gain(FAN.rumbleGain * sp.gain)).connect(level);
      const hums = FAN.hum.map(([harmonic, g]) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = sp.humHz * harmonic;
        osc.connect(gain(g)).connect(level);
        return osc;
      });

      const sources = [air, blades, rumble, ...hums];
      for (const s of sources) s.start(t0);

      const stops = [];
      if (oscillate) {
        pan.pan.setValueAtTime(0, t0);
        tone.frequency.setValueAtTime(sp.cutoffHz, t0);
        level.gain.setValueAtTime(1, t0);
        stops.push(repeat(t0, FAN.sweepS, (_, at) => {
          const tAt = (x) => x * FAN.sweepS;
          followCurve(pan.pan, (x) => sweepAt(tAt(x)) * FAN.panWidth, at, FAN.sweepS);
          followCurve(tone.frequency, (x) => sp.cutoffHz * mix(FAN.awayCutoff, 1, facingAt(tAt(x))), at, FAN.sweepS);
          followCurve(level.gain, (x) => mix(FAN.awayGain, 1, facingAt(tAt(x))), at, FAN.sweepS);
        }));
      }
      const every = PROMPTS[prompt].s;
      if (every) stops.push(repeat(t0 + every, every, (_, at) => playCue('nudge', at)));

      stopSound = () => {
        for (const stop of stops) stop();
        bus.close();
        for (const s of sources) s.stop(ctx.currentTime + AUDIO.fadeOutS);
      };
    },
    stop() {
      stopSound?.();
      stopSound = null;
    },
  },
  fragment: `
uniform float u_sweep;
uniform float u_facing;

const float SWEEP_X = 0.16; // screen heights either side of centre
const vec3 AIR = vec3(0.75, 0.85, 1.0);

// A dim glow that sits where the sound is. Mostly for closed eyes, so kept faint.
void main() {
  vec2 p = screenUV();
  vec2 c = vec2(u_sweep * SWEEP_X, 0.0);
  float r = length(p - c);
  float drift = 0.9 + 0.2 * fbm(p * 5.0 + vec2(0.0, u_time * 0.2)); // slow airflow texture
  float glow = (exp(-r * 14.0) * (0.1 + 0.14 * u_facing) + exp(-r * 4.0) * 0.03 * u_facing) * drift;
  float y = p.y / 0.002;
  float track = exp(-y * y) * smoothstep(SWEEP_X + 0.03, SWEEP_X, abs(p.x)) * 0.04; // the sweep's range
  gl_FragColor = finish(AIR * (glow + track));
}
`,
};
