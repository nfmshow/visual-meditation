import { AUDIO, CUES } from './config.js';

let ctx = null;

// Call from a user gesture (iOS will not start audio otherwise).
export function unlockAudio() {
  // iOS 17+: play through the silent switch.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
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

export function playCue(name) {
  const pattern = CUES.vibrate[name];
  if (pattern) navigator.vibrate?.(pattern);
  if (!ctx) return;
  if (ctx.state !== 'running') ctx.resume();
  const t0 = ctx.currentTime;
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

// Brown noise: soft, low, ocean-like.
export function noiseBuffer(seconds) {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
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
