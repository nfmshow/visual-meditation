import { VIDEO } from './config.js';
import { saveFile, loadFile } from './files.js';
import { loadModeState, saveModeState } from './storage.js';
import { clamp } from './util.js';

// A video picked once from the device and kept in browser storage, so it is never downloaded.
// Muted; the renderer draws it as a texture. Each session plays a random stretch of it.
// key: the owning mode's id, for its stored file and its last start.
export function createVideoSource(key) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  let name = null;
  let busy = null;   // status text while loading or saving
  let note = '';     // why the last pick failed, or a caveat about it
  let loading = null;
  let url = null;
  let fadeFrom = 0;  // video time the current fade-in starts from
  let active = false; // meant to be playing

  const source = {
    element: video,
    onchange: () => {},
    get ready() { return name !== null; },
    get busy() { return busy !== null; },
    status: () => busy ?? name,
    note: () => note,
  };
  const changed = () => source.onchange();

  // Resolves once a frame has decoded, so a pick the browser cannot play is refused up front.
  function opens(src) {
    const probe = document.createElement('video');
    probe.muted = true;
    probe.preload = 'auto';
    return new Promise((resolve) => {
      const done = (ok) => {
        clearTimeout(timer);
        probe.removeAttribute('src');
        probe.load();
        resolve(ok);
      };
      const timer = setTimeout(() => done(false), VIDEO.probeMs);
      probe.onloadeddata = () => done(true);
      probe.onerror = () => done(false);
      probe.src = src;
    });
  }

  function use(blob, fileName) {
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    video.src = url;
    name = fileName;
    fadeFrom = 0;
  }

  // Start of a stretch `seconds` long, away from the last session's when there is room.
  function pickStart(seconds) {
    const room = Math.max(0, video.duration - seconds - VIDEO.fadeS);
    const last = loadModeState(key)?.lastStart;
    let start = 0;
    for (let i = 0; i < VIDEO.picks; i++) {
      start = Math.random() * room;
      if (!Number.isFinite(last) || Math.abs(start - last) >= seconds) break;
    }
    saveModeState(key, { lastStart: start });
    return start;
  }

  // Loops with a dip to black, in case a session outlasts the video.
  video.onended = () => {
    video.currentTime = fadeFrom = 0;
    if (active) source.play();
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && active) source.play();
  });

  // The stored video, once per page load.
  source.load = () => {
    loading ??= (async () => {
      busy = 'Loading…';
      changed();
      try {
        const saved = await loadFile(key);
        if (saved) use(saved.blob, saved.name);
      } catch {}
      busy = null;
      changed();
    })();
    return loading;
  };

  source.choose = async (file) => {
    busy = 'Checking…';
    note = '';
    changed();
    const probeUrl = URL.createObjectURL(file);
    const ok = await opens(probeUrl);
    URL.revokeObjectURL(probeUrl);
    if (!ok) {
      busy = null;
      note = 'This browser cannot play that video. An MP4 usually works.';
      changed();
      return;
    }
    busy = 'Saving…';
    changed();
    try {
      await saveFile(key, file);
    } catch {
      note = 'Not enough space to keep it, so it will need choosing again next time.';
    }
    use(file, file.name);
    busy = null;
    changed();
  };

  // Seeks to a new random stretch, fading in from black.
  source.cue = (seconds) => {
    if (!source.ready) return;
    const seek = () => {
      if (!Number.isFinite(video.duration)) return; // length unknown: play from where it is
      video.currentTime = fadeFrom = pickStart(seconds);
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
  };

  // Call from the tap that starts a session: some browsers only play video after a tap.
  source.begin = (seconds) => {
    if (video.currentTime + seconds > video.duration) source.cue(seconds);
    source.play();
  };

  source.play = () => {
    active = true;
    if (source.ready) video.play().catch(() => {});
  };

  source.pause = () => {
    active = false;
    video.pause();
  };

  // On the home screen: plays the stretch the next session starts from.
  source.show = async (seconds) => {
    active = true;
    await source.load();
    if (!active) return; // hidden while loading
    source.cue(seconds);
    source.play();
  };

  source.hide = source.pause;

  // 0..1: dark while seeking, fading in after a seek and out before the end.
  source.fade = () => {
    if (video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return 0;
    const t = video.currentTime;
    return clamp(Math.min(t - fadeFrom, video.duration - t) / VIDEO.fadeS, 0, 1);
  };

  // Pixels; [0, 0] while none is chosen. Before its size is known it reads [1, 1], drawn dark by fade().
  source.size = () => (source.ready ? [video.videoWidth || 1, video.videoHeight || 1] : [0, 0]);

  return source;
}
