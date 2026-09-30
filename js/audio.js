import { AUDIO, CUES } from './config.js';

let ctx = null;

// Call from a user gesture (iOS will not start audio otherwise).
export function unlockAudio({ silent }) {
  try { if (navigator.audioSession) navigator.audioSession.type = AUDIO.sessionTypes[silent]; } catch {}
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!ctx && Ctx) ctx = new Ctx();
  if (ctx && ctx.state !== 'running') ctx.resume();
  return ctx;
}

export const audioContext = () => ctx;

// Struck metal. partials: [frequency ratio, relative gain, decay scale].
// beatHz splits each partial into a detuned pair, which gives a bowl its slow shimmer.
export function bell(dest, { hz, at, gain, decay, partials, attack = AUDIO.attackS, beatHz = 0 }) {
  const offsets = beatHz ? [-beatHz / 2, beatHz / 2] : [0];
  for (const [ratio, rel, decayScale = 1] of partials) {
    for (const offset of offsets) {
      const end = at + attack + decay * decayScale;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.value = hz * ratio + offset;
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime((gain * rel) / offsets.length, at + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(env).connect(dest);
      osc.start(at);
      osc.stop(end);
    }
  }
}

// at: audio-clock time to play (default now). Vibration is always immediate.
export function playCue(name, at) {
  const pattern = CUES.vibrate[name];
  if (pattern) navigator.vibrate?.(pattern);
  if (!ctx) return;
  if (ctx.state !== 'running') ctx.resume();
  const t0 = at ?? ctx.currentTime;
  for (const note of CUES.notes[name]) {
    bell(ctx.destination, { hz: note.hz, at: t0 + note.at, gain: CUES.gain, decay: CUES.decayS, partials: CUES.partials });
  }
}

// Calls schedule(i, when) for each repeat i, always one period ahead of the audio clock.
// Returns a function that stops scheduling.
export function repeat(start, period, schedule) {
  let i = 0;
  const tick = () => {
    while (start + i * period < ctx.currentTime + period + AUDIO.lookaheadS) {
      schedule(i, start + i * period);
      i++;
    }
  };
  tick();
  const id = setInterval(tick, AUDIO.tickMs);
  return () => clearInterval(id);
}

// Moves param along curve(x), x from 0 to 1, over seconds starting at `at`,
// in short linear steps (value curves cannot safely share endpoints).
export function followCurve(param, curve, at, seconds) {
  const steps = Math.max(AUDIO.curveMinSteps, Math.ceil(seconds * AUDIO.curveStepsPerS));
  for (let k = 1; k <= steps; k++) param.linearRampToValueAtTime(curve(k / steps), at + (seconds * k) / steps);
}

// A gain node wired to the speakers, with a fade-out-and-disconnect for stopping.
export function outputBus(gain = 1) {
  const bus = ctx.createGain();
  bus.gain.value = gain;
  bus.connect(ctx.destination);
  return {
    node: bus,
    close() {
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setTargetAtTime(0, ctx.currentTime, AUDIO.fadeOutS / 4);
      setTimeout(() => bus.disconnect(), AUDIO.fadeOutS * 1000);
    },
  };
}

// Looping noise source, not yet started.
export function noiseSource(colour) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(AUDIO.noiseS, colour);
  source.loop = true;
  return source;
}

// brown: soft, low, ocean-like. pink: even and airy, like a fan.
export function noiseBuffer(seconds, colour = 'brown') {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const next = colour === 'pink' ? pinkNoise() : brownNoise();
  for (let i = 0; i < length; i++) data[i] = next();
  return buffer;
}

function brownNoise() {
  let last = 0;
  return () => {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    return last * 3.5;
  };
}

// Paul Kellet's filter.
function pinkNoise() {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const out = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
    return out;
  };
}

// Convolution reverb from a decaying noise impulse.
export function reverb(seconds) {
  const length = Math.round(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  const node = ctx.createConvolver();
  node.buffer = impulse;
  return node;
}
