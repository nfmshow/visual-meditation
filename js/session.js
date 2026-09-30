import { playCue } from './audio.js';

// Runs a list of phases: { label, seconds, visible }.
// Cues on each transition: 'close' into a hidden phase, 'open' into a visible one, 'end' after the last.
export function runSession(phases, { onPhase, onDone }) {
  let index = 0;
  let phaseStart = 0;
  let doneSeconds = 0;
  let timer = 0;
  let finished = false;

  const phaseElapsed = () => (performance.now() - phaseStart) / 1000;

  function enter(i) {
    index = i;
    phaseStart = performance.now();
    onPhase(phases[i]);
    timer = setTimeout(() => {
      doneSeconds += phases[i].seconds;
      const next = phases[i + 1];
      playCue(next ? (next.visible ? 'open' : 'close') : 'end');
      if (next) enter(i + 1);
      else finish(doneSeconds);
    }, phases[i].seconds * 1000);
  }

  function finish(seconds) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    onDone(Math.round(seconds));
  }

  enter(0);

  return {
    stop: () => finish(doneSeconds + phaseElapsed()),
    status: () => ({
      phase: phases[index],
      remaining: Math.max(0, phases[index].seconds - phaseElapsed()),
    }),
  };
}
