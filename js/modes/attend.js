import { AUDIO } from '../config.js';
import { audioContext, bell, outputBus, playList, reverb } from '../audio.js';
import { choiceSetting, LEVEL, tapFeedback } from './shared.js';
import { loadModeState, saveModeState } from '../storage.js';
import { between, count, smoothstep } from '../util.js';

const ID = 'attend';

// Adrian Wells' Attention Training Technique: one sound at a time, quick switches, then all at once.
// focus(seconds): when each sound comes into focus within a phase. ALL = every sound.
const ALL = -1;
const PHASES = [
  { label: 'Selective', minutes: 5, focus: (s) => shuffled(SOURCES.length).map((f, i) => ({ at: (i * s) / SOURCES.length, focus: f })) },
  { label: 'Switching', minutes: 5, focus: (s) => switches(s) },
  { label: 'Divided', minutes: 2, focus: () => [{ at: 0, focus: ALL }] },
];
const FULL_MIN = PHASES.reduce((sum, ph) => sum + ph.minutes, 0);
const LENGTHS = [0.5, 1, 1.5]; // of the full length

const CUE = {
  leadS: 2.5,        // a phase's first cue waits for the phase chime
  switchS: [5, 10],  // Switching: seconds on each sound, random within
  fadeS: 0.6,        // the markers' move to a new focus
  all: 'All four',
  voice: { rate: 0.9, volume: 1 },
};

// A slip is one sound briefly off pitch. Tap when the sound in focus slips (any sound, in Divided).
const SLIP = {
  settleS: 2,       // none this soon after a cue: time to move attention
  jitterS: 3,       // up to this much more, so a segment's first slip is not predictable
  windowS: 2.5,     // a tap this long after a slip starts answers it
  gapS: [4, 12],    // quiet time between one slip's window and the next, random within
  targetShare: 0.5, // chance a slip outside Divided falls on the sound in focus
};

const cents = (c) => 2 ** (c / 1200);

// A sine gliding from hz[0] to hz[1], then dying away.
function chirp(dest, at, { hz, glideS, decayS, attackS, gain }, ratio) {
  const ctx = audioContext();
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.frequency.setValueAtTime(hz[0] * ratio, at);
  osc.frequency.exponentialRampToValueAtTime(hz[1] * ratio, at + glideS);
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + attackS);
  env.gain.exponentialRampToValueAtTime(0.0001, at + attackS + decayS);
  osc.connect(env).connect(dest);
  osc.start(at);
  osc.stop(at + attackS + decayS);
}

function randomTimes(gapS, totalS) {
  const list = [];
  for (let t = between(gapS); t < totalS; t += between(gapS)) list.push(t);
  return list;
}

// The four sounds, in u_focus order (the shader puts their markers left, right, below, above).
// pan: -1 left .. 1 right. slipCents: a slip at full size. Each keeps one pitch from event
// to event, so a slip stands out. times(totalS): event times; a continuous sound has none.
// start(dest, at) returns play(at, cents), which plays an event or bends a continuous sound.
const SOURCES = [
  {
    word: 'Clock', pan: -0.7, slipCents: 300,
    tick: { periodS: 1, hz: 2200, gain: 0.07, decay: 0.05, attack: 0.001, partials: [[1, 1], [1.47, 0.5], [2.09, 0.3]] },
    times(totalS) {
      return Array.from({ length: Math.floor(totalS / this.tick.periodS) }, (_, i) => (i + 1) * this.tick.periodS);
    },
    start(dest) {
      return { play: (at, c) => bell(dest, { ...this.tick, hz: this.tick.hz * cents(c), at }) };
    },
  },
  {
    word: 'Water', pan: 0.7, slipCents: 300,
    gapS: [0.5, 2],
    drop: { hz: [700, 1300], glideS: 0.04, decayS: 0.15, attackS: 0.003, gain: 0.12 },
    times(totalS) {
      return randomTimes(this.gapS, totalS);
    },
    start(dest) {
      return { play: (at, c) => chirp(dest, at, this.drop, cents(c)) };
    },
  },
  {
    word: 'Hum', pan: 0, slipCents: 60,
    hz: 131,
    harmonics: [[1, 0.03], [2, 0.022], [3, 0.012]], // [harmonic, gain]; phone speakers mostly play 2 and 3
    bendS: 0.2,
    holdS: 0.6,
    start(dest, at) {
      const ctx = audioContext();
      const bend = ctx.createConstantSource(); // cents, added to every harmonic
      const oscs = this.harmonics.map(([harmonic, g]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = this.hz * harmonic;
        gain.gain.value = g;
        bend.connect(osc.detune);
        osc.connect(gain).connect(dest);
        return osc;
      });
      const nodes = [bend, ...oscs];
      for (const n of nodes) n.start(at);
      return {
        play: (t, c) => {
          bend.offset.setValueAtTime(0, t);
          bend.offset.linearRampToValueAtTime(c, t + this.bendS);
          bend.offset.setValueAtTime(c, t + this.bendS + this.holdS);
          bend.offset.linearRampToValueAtTime(0, t + 2 * this.bendS + this.holdS);
        },
        stop: (end) => nodes.forEach((n) => n.stop(end)),
      };
    },
  },
  {
    word: 'Bird', pan: -0.3, slipCents: 300,
    gapS: [4, 9],
    // A two-note call, the same each time. offsetS: from the start of the call.
    notes: [
      { offsetS: 0, hz: [4000, 3700], glideS: 0.15, decayS: 0.25, attackS: AUDIO.attackS, gain: 0.05 },
      { offsetS: 0.35, hz: [3300, 3200], glideS: 0.2, decayS: 0.3, attackS: AUDIO.attackS, gain: 0.05 },
    ],
    far: { cutoffHz: 5000, reverbS: 3, dry: 0.5, wet: 0.6 }, // softened and mostly room: far off
    times(totalS) {
      return randomTimes(this.gapS, totalS);
    },
    start(dest) {
      const ctx = audioContext();
      const input = ctx.createBiquadFilter();
      input.type = 'lowpass';
      input.frequency.value = this.far.cutoffHz;
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      dry.gain.value = this.far.dry;
      wet.gain.value = this.far.wet;
      input.connect(dry).connect(dest);
      input.connect(reverb(this.far.reverbS)).connect(wet).connect(dest);
      return { play: (at, c) => this.notes.forEach((n) => chirp(input, at + n.offsetS, n, cents(c))) };
    },
  },
];

function shuffled(n) {
  const list = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// A random sound other than skip.
function other(skip) {
  const f = Math.floor(Math.random() * (SOURCES.length - 1));
  return skip === null || f < skip ? f : f + 1;
}

function switches(seconds) {
  const list = [];
  for (let at = 0, focus = null; at < seconds; at += between(CUE.switchS)) {
    focus = other(focus);
    list.push({ at, focus });
  }
  return list;
}

const plan = ({ length }) => PHASES.map((ph) => ({ label: ph.label, seconds: ph.minutes * 60 * LENGTHS[length], visible: true }));

// The whole session, laid out at the start: segments (one focus each, back to back from
// the first cue to the end), each sound's events, and the slips among them. Times in session seconds.
function build(values) {
  const segments = [];
  let phaseStart = 0;
  plan(values).forEach((phase, p) => {
    const span = phase.seconds - CUE.leadS;
    for (const { at, focus } of PHASES[p].focus(span)) {
      const weights = SOURCES.map((_, i) => (focus === ALL || focus === i ? 1 : 0));
      segments.push({ start: phaseStart + CUE.leadS + at, focus, weights, phase: p });
    }
    phaseStart += phase.seconds;
  });
  const totalS = phaseStart;
  segments.forEach((seg, i) => (seg.end = segments[i + 1]?.start ?? totalS));

  const events = SOURCES.map((s, i) => (s.times?.(totalS) ?? []).map((at) => ({ at, source: i, slip: null })));
  const slips = [];
  if (values.check) {
    let next = 0;
    for (const seg of segments) {
      for (let at = Math.max(next, seg.start + SLIP.settleS + Math.random() * SLIP.jitterS); ; at = next) {
        const source = seg.focus === ALL ? Math.floor(Math.random() * SOURCES.length)
          : Math.random() < SLIP.targetShare ? seg.focus : other(seg.focus);
        const continuous = !SOURCES[source].times; // slips right away; others at their next event
        const event = continuous ? { at, source, slip: null } : events[source].find((e) => e.at >= at);
        if (!event || event.at + SLIP.windowS > seg.end) break;
        if (continuous) events[source].push(event);
        event.slip = {
          at: event.at, source, phase: seg.phase,
          target: seg.focus === ALL || seg.focus === source,
          sign: Math.random() < 0.5 ? -1 : 1,
          cents: null, // set as it is scheduled, from the level then
          caught: false, done: false,
        };
        slips.push(event.slip);
        next = event.at + SLIP.windowS + between(SLIP.gapS);
      }
    }
  }
  const cues = segments.map((seg) => ({ at: seg.start, cue: seg.focus === ALL ? CUE.all : SOURCES[seg.focus].word }));
  return { segments, slips, check: Boolean(values.check), events: [...events.flat(), ...cues].sort((a, b) => a.at - b.at) };
}

let run = null; // the session in progress
let level = LEVEL.start; // slip size, kept between sessions
let leaks = 0; // taps on a slip of a sound out of focus
let extraTaps = 0;

// How much each sound is in focus at t, easing from the previous segment's focus.
function focusAt(t) {
  const i = run ? run.segments.findLastIndex((seg) => seg.start <= t) : -1;
  if (i < 0) return SOURCES.map(() => 0);
  const k = smoothstep(0, CUE.fadeS, t - run.segments[i].start);
  const from = run.segments[i - 1]?.weights ?? SOURCES.map(() => 0);
  return run.segments[i].weights.map((w, j) => from[j] + (w - from[j]) * k);
}

// Scores each slip whose window has closed. A missed slip of the sound in focus makes slips bigger.
function advance(t) {
  for (const s of run.slips) {
    if (s.cents !== null && !s.done && t >= s.at + SLIP.windowS) {
      s.done = true;
      if (s.target) level = LEVEL.missed(level);
    }
  }
}

function say(text) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  Object.assign(utterance, CUE.voice);
  speechSynthesis.speak(utterance);
}

function summary() {
  const scored = run.slips.filter((s) => s.target && s.done);
  const record = {
    slips: scored.length,
    caught: scored.filter((s) => s.caught).length,
    byPhase: PHASES.map((_, p) => {
      const of = scored.filter((s) => s.phase === p);
      return [of.filter((s) => s.caught).length, of.length];
    }),
    leaks, extraTaps, level,
  };
  if (!scored.length) return { record };
  const caught = record.byPhase.filter(([, of]) => of).map(([c, of], p) => `${PHASES[p].label.toLowerCase()} ${c} of ${of}`);
  const misses = [leaks && `${count(leaks, 'tap')} on other sounds`, extraTaps && count(extraTaps, 'extra tap')].filter(Boolean);
  const extra = misses.length ? ` ${misses.join(', ')}.` : '';
  return { record, text: `Caught: ${caught.join(', ')}.${extra} Next slips: ${Math.round(level * 100)}% size.` };
}

let stopSound = null;

export default {
  id: ID,
  name: 'Attend',
  blurb: 'Eyes open on the dot. Four sounds play: a clock on the left, water on the right, a hum in the middle, a bird far off. A voice names one: give it your full attention. When a thought or another sound pulls you, go back to it. One sound at a time, then quick switches, then all four at once. With Check on, now and then a sound slips in pitch: tap only when the sound you are on slips. Slips get subtler as you catch them. Hold the screen for the timer. Headphones help.',
  settings: [
    choiceSetting('length', 'Length', LENGTHS.map((k) => `${FULL_MIN * k} min`), 1),
    choiceSetting('check', 'Check', ['Off', 'On'], 1),
  ],
  plan,
  uniforms: (_, t) => ({ u_focus: focusAt(t) }),
  sound: {
    // Lays out the session too: main.js starts the sound before the task.
    start(values) {
      run = build(values);
      level = loadModeState(ID)?.level ?? LEVEL.start;
      leaks = 0;
      extraTaps = 0;
      const ctx = audioContext();
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const bus = outputBus();
      const voices = SOURCES.map((s) => {
        const pan = ctx.createStereoPanner();
        pan.pan.value = s.pan;
        pan.connect(bus.node);
        return s.start(pan, t0);
      });
      const timers = new Set();
      const stopList = playList(t0, run.events, (e, when) => {
        if (e.cue) {
          const id = setTimeout(() => {
            timers.delete(id);
            say(e.cue);
          }, (when - ctx.currentTime) * 1000);
          timers.add(id);
          return;
        }
        let c = 0;
        if (e.slip) {
          advance(ctx.currentTime - t0);
          c = e.slip.sign * level * SOURCES[e.source].slipCents;
          e.slip.cents = c;
        }
        voices[e.source].play(when, c);
      });
      stopSound = () => {
        stopList();
        for (const id of timers) clearTimeout(id);
        if ('speechSynthesis' in window) speechSynthesis.cancel();
        bus.close();
        for (const v of voices) v.stop?.(ctx.currentTime + AUDIO.fadeOutS);
      };
    },
    stop() {
      stopSound?.();
      stopSound = null;
      run = null;
    },
  },
  task: {
    on: ({ check }) => Boolean(check),
    start() {}, // set up in sound.start
    tap(t) {
      tapFeedback();
      advance(t);
      const s = run.slips.find((sl) => sl.cents !== null && !sl.done && t >= sl.at);
      if (!s) {
        extraTaps++;
        return;
      }
      s.done = true;
      if (!s.target) {
        leaks++;
        return;
      }
      s.caught = true;
      level = LEVEL.caught(level);
    },
    // Slips still open when a session ends early are left out.
    stop(t) {
      if (!run?.check) return undefined;
      advance(t);
      saveModeState(ID, { level });
      return summary();
    },
  },
  fragment: `
uniform vec4 u_focus; // clock, water, hum, bird: 1 = in focus

const float MARK_R = 0.11; // screen heights from the dot
const float MARK_SIZE = 0.006;
const vec3 TONE = vec3(1.0, 0.78, 0.45);

float spot(vec2 p, vec2 c, float r) {
  vec2 d = (p - c) / r;
  return exp(-dot(d, d));
}

// A dot to rest the eyes on, and a faint marker on the side of each sound
// that brightens slowly while it is in focus.
void main() {
  vec2 p = screenUV();
  float centre = spot(p, vec2(0.0), 0.007) * 0.5 + exp(-length(p) * 18.0) * 0.04;
  vec4 marks = vec4(
    spot(p, vec2(-MARK_R, 0.0), MARK_SIZE),
    spot(p, vec2(MARK_R, 0.0), MARK_SIZE),
    spot(p, vec2(0.0, -MARK_R), MARK_SIZE),
    spot(p, vec2(0.0, MARK_R), MARK_SIZE));
  gl_FragColor = finish(TONE * (centre + dot(marks, 0.06 + 0.3 * u_focus)));
}
`,
};
