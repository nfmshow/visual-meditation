// Every shared constant lives here.

export const TIMING = {
  sceneLiftMs: 900,   // scene slides up behind the home panel and back
  canvasFadeMs: 1500, // flame fades out/in between gaze and eyes-closed phases
  hudHideMs: 4000,    // session overlay auto-hides after a tap
  hudTickMs: 250,
};

export const RENDER = {
  maxPixelRatio: 1.5, // caps shader cost on high-density phone screens
};

export const AUDIO = {
  attackS: 0.02,
  fadeOutS: 1.5,   // mode sounds fade out over this when a session ends
  lookaheadS: 1,   // scheduled sounds are queued this far past the next repeat
  tickMs: 1000,
  // iOS audio session per 'On silent' option (see js/app-settings.js).
  // playback: plays with the silent switch on, pauses other audio. ambient: mixes with it, obeys the switch.
  sessionTypes: ['playback', 'ambient'],
};

export const CUES = {
  gain: 0.12,
  decayS: 3,
  // [frequency ratio, relative gain]: inharmonic partials give a bell tone.
  partials: [[1, 1], [2.76, 0.3], [5.4, 0.1]],
  notes: {
    close: [{ hz: 392, at: 0 }],
    open: [{ hz: 523.25, at: 0 }],
    end: [{ hz: 523.25, at: 0 }, { hz: 392, at: 0.7 }],
  },
  vibrate: { end: [120, 80, 120] },
};

export const STORAGE_KEYS = {
  mode: 'vm.mode',
  settings: 'vm.settings',
  log: 'vm.log',
};

export const LOG = {
  minSeconds: 30,  // shorter sessions are not logged
  maxEntries: 1000,
  summaryDays: 7,
};
