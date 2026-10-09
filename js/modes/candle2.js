import { rounds, CANDLE_SCENE } from './flame.js';
import { loadModeState, saveModeState } from '../storage.js';

const ID = 'candle2';

// What a change can do to the flame, as a full-size candleScene shift:
// [lean, length, brightness, blue base]. Each change goes one way or the other.
const KINDS = [
  [0.9, 0, 0, 0],
  [0, 0.3, 0, 0],
  [0, 0, 0.3, 0],
  [0, 0, 0, 1],
];

// Seconds. Slow ramps keep every change smooth (photosensitivity).
const CHANGE = {
  riseS: 1.5,
  holdS: 2.5,
  fallS: 1.5,
  graceS: 1.5,      // a tap this long after a change fades still counts
  gapS: [4, 18],    // quiet time between one change's window and the next, random within
  firstS: [3, 15],  // quiet time at the start of each gaze, random within
};
const SHOWN_S = CHANGE.riseS + CHANGE.holdS + CHANGE.fallS;
const WINDOW_S = SHOWN_S + CHANGE.graceS;

// Change size: shrinks when one is caught, grows three times as much when one is missed,
// so it settles where about 3 in 4 are caught. Kept between sessions.
const LEVEL = { start: 1, min: 0.03, max: 1, caught: 0.9, missed: 0.9 ** -3 };

const TAP_VIBRATE_MS = 12; // confirms the tap landed, not whether it caught anything

const between = ([lo, hi]) => lo + Math.random() * (hi - lo);
const smoothstep = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const envelope = (x) => smoothstep(0, CHANGE.riseS, x) * (1 - smoothstep(SHOWN_S - CHANGE.fallS, SHOWN_S, x));

let level = LEVEL.start;
let changes = [];
let extraTaps = 0;

// Changes at random times, only while eyes are open, each finishing before the gaze ends.
function schedule(values) {
  const list = [];
  let start = 0;
  for (const phase of rounds.plan(values)) {
    const end = start + phase.seconds;
    if (phase.visible) {
      for (let at = start + between(CHANGE.firstS); at + WINDOW_S <= end; at += WINDOW_S + between(CHANGE.gapS)) {
        list.push({ at, kind: Math.floor(Math.random() * KINDS.length), sign: Math.random() < 0.5 ? -1 : 1, size: null, caughtAt: null, done: false });
      }
    }
    start = end;
  }
  return list;
}

// Fixes each change's size as it starts and scores each one whose window has closed.
function advance(t) {
  for (const c of changes) {
    if (c.size === null && t >= c.at) c.size = level;
    if (!c.done && t >= c.at + WINDOW_S) {
      c.done = true;
      level = Math.min(LEVEL.max, level * LEVEL.missed);
    }
  }
}

function shift(t) {
  advance(t);
  const c = changes.find((ch) => ch.size !== null && t < ch.at + SHOWN_S);
  if (!c) return [0, 0, 0, 0];
  const k = c.sign * c.size * envelope(t - c.at);
  return KINDS[c.kind].map((v) => v * k);
}

function summary() {
  const scored = changes.filter((c) => c.done);
  const caught = scored.filter((c) => c.caughtAt !== null);
  const noticeS = caught.length ? caught.reduce((sum, c) => sum + c.caughtAt - c.at, 0) / caught.length : null;
  const record = { changes: scored.length, caught: caught.length, extraTaps, noticeS, level };
  if (!scored.length) return { record };
  const extra = extraTaps ? `, ${extraTaps} extra tap${extraTaps === 1 ? '' : 's'}` : '';
  const notice = noticeS === null ? '' : `, ${noticeS.toFixed(1)} s to notice`;
  return { record, text: `Caught ${caught.length} of ${scored.length}${extra}${notice}. Next changes: ${Math.round(level * 100)}% size.` };
}

export default {
  id: ID,
  name: 'Candle V2',
  blurb: 'Rest your gaze on one small part of the flame, like the blue base or the tip. Now and then the flame shifts a little: it leans, or its height, brightness or blue changes. Tap when you notice. Shifts get subtler as you catch them. Hold the screen for the timer. At the chime, close your eyes until the next.',
  settings: rounds.settings,
  plan: rounds.plan,
  task: {
    start(values) {
      level = loadModeState(ID)?.level ?? LEVEL.start;
      changes = schedule(values);
      extraTaps = 0;
    },
    tap(t) {
      navigator.vibrate?.(TAP_VIBRATE_MS);
      advance(t);
      const c = changes.find((ch) => ch.size !== null && !ch.done);
      if (!c) {
        extraTaps++;
        return;
      }
      c.caughtAt = t;
      c.done = true;
      level = Math.max(LEVEL.min, level * LEVEL.caught);
    },
    // Changes still showing when a session ends early are left out.
    stop(t) {
      advance(t);
      saveModeState(ID, { level });
      const outcome = summary();
      changes = []; // the scene keeps drawing on the home screen
      return outcome;
    },
  },
  uniforms: (_, t) => ({ u_shift: shift(t) }),
  fragment: `
uniform vec4 u_shift;
${CANDLE_SCENE}
void main() {
  gl_FragColor = finish(candleScene(screenUV(), u_time, u_shift));
}
`,
};
