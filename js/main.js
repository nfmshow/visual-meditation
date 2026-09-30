import { MODES } from './modes/index.js';
import { TIMING, LOG } from './config.js';
import { createRenderer } from './renderer.js';
import { runSession } from './session.js';
import { unlockAudio } from './audio.js';
import { keepAwake, allowSleep } from './wakelock.js';
import * as store from './storage.js';
import { clamp, formatClock } from './util.js';
import { formatSetting } from './modes/shared.js';
import { APP } from './app-settings.js';

const $ = (id) => document.getElementById(id);
const els = {
  canvas: $('scene'), home: $('home'), modes: $('modes'), blurb: $('blurb'),
  settings: $('settings'), start: $('start'), summary: $('summary'),
  hud: $('hud'), phase: $('phase'), remaining: $('remaining'), end: $('end'), error: $('error'),
};

const root = document.documentElement.style;
root.setProperty('--canvas-fade', `${TIMING.canvasFadeMs}ms`);
root.setProperty('--scene-lift-ms', `${TIMING.sceneLiftMs}ms`);

// ?mode=<id> opens a mode directly (bookmarkable).
const findMode = (id) => MODES.find((m) => m.id === id);
let mode = findMode(new URLSearchParams(location.search).get('mode')) ?? findMode(store.loadModeId()) ?? MODES[0];
let values = store.loadSettings(mode);
const appValues = store.loadSettings(APP);
let session = null;
let fadeTimer = 0;
let hudTimer = 0;
let hudTick = 0;

let renderer;
try {
  renderer = createRenderer(els.canvas);
  renderer.setMode(mode, values);
  renderer.start();
} catch (err) {
  els.error.textContent = err.message;
  els.error.hidden = false;
  els.start.disabled = true;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// onChange runs after values[def.key] changes.
function stepper(def, values, onChange) {
  const row = el('div', 'stepper');
  const minus = el('button', null, '−');
  const out = el('output');
  const plus = el('button', null, '+');
  minus.setAttribute('aria-label', `Less ${def.label.toLowerCase()}`);
  plus.setAttribute('aria-label', `More ${def.label.toLowerCase()}`);
  const show = () => {
    out.textContent = formatSetting(def, values[def.key]);
    minus.disabled = values[def.key] <= def.min;
    plus.disabled = values[def.key] >= def.max;
  };
  const change = (dir) => {
    values[def.key] = clamp(values[def.key] + dir * def.step, def.min, def.max);
    onChange();
    show();
  };
  minus.onclick = () => change(-1);
  plus.onclick = () => change(1);
  show();
  row.append(el('span', null, def.label), minus, out, plus);
  return row;
}

function selectMode(next) {
  mode = next;
  values = store.loadSettings(mode);
  store.saveModeId(mode.id);
  renderer?.setMode(mode, values);
  renderHome();
}

function renderHome() {
  els.modes.hidden = MODES.length < 2;
  els.modes.replaceChildren(...MODES.map((m) => {
    const b = el('button', null, m.name);
    b.setAttribute('aria-pressed', String(m === mode));
    b.onclick = () => {
      selectMode(m);
      b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    };
    return b;
  }));
  els.blurb.textContent = mode.blurb;
  const saveMode = () => {
    store.saveSettings(mode.id, values);
    renderer?.setMode(mode, values);
  };
  const saveApp = () => store.saveSettings(APP.id, appValues);
  els.settings.replaceChildren(
    ...mode.settings.map((def) => stepper(def, values, saveMode)),
    ...APP.settings.filter((def) => def.shown()).map((def) => stepper(def, appValues, saveApp)),
  );
  const { sessions, minutes } = store.recentSummary();
  els.summary.textContent = sessions
    ? `Last ${LOG.summaryDays} days: ${sessions} session${sessions === 1 ? '' : 's'}, ${minutes} min`
    : '';
}

function setScene(visible) {
  clearTimeout(fadeTimer);
  if (visible) {
    renderer.start();
    els.canvas.classList.remove('dark');
  } else {
    els.canvas.classList.add('dark');
    fadeTimer = setTimeout(() => renderer.stop(), TIMING.canvasFadeMs); // save battery while eyes are closed
  }
}

function updateHud() {
  const { phase, remaining } = session.status();
  els.phase.textContent = phase.label;
  els.remaining.textContent = formatClock(Math.ceil(remaining));
}

function showHud() {
  els.hud.hidden = false;
  updateHud();
  clearInterval(hudTick);
  hudTick = setInterval(updateHud, TIMING.hudTickMs);
  clearTimeout(hudTimer);
  hudTimer = setTimeout(hideHud, TIMING.hudHideMs);
}

function hideHud() {
  els.hud.hidden = true;
  clearInterval(hudTick);
  clearTimeout(hudTimer);
}

function begin() {
  unlockAudio(appValues);
  keepAwake();
  renderer.resetClock();
  mode.sound?.start(values);
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {});
  els.home.classList.add('hidden');
  document.body.classList.add('in-session');
  session = runSession(mode.plan(values), {
    onPhase: (phase) => {
      setScene(phase.visible);
      if (!els.hud.hidden) updateHud();
    },
    onDone: finish,
  });
}

function finish(seconds) {
  session = null;
  mode.sound?.stop();
  hideHud();
  allowSleep();
  if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
  store.logSession(mode.id, seconds);
  setScene(true);
  document.body.classList.remove('in-session');
  els.home.classList.remove('hidden');
  renderHome();
}

els.start.onclick = (e) => {
  e.stopPropagation(); // the tap that starts a session should not also open the HUD
  begin();
};
els.end.onclick = () => session?.stop();
document.addEventListener('click', (e) => {
  if (!session || e.target === els.end) return;
  if (els.hud.hidden) showHud();
  else hideHud();
});

// Lift the scene so its centre sits in the space above the home panel.
new ResizeObserver(([entry]) => {
  root.setProperty('--home-lift', `${entry.borderBoxSize[0].blockSize / 2}px`);
}).observe(els.home);

renderHome();
els.modes.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
