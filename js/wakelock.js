let sentinel = null;
let wanted = false;

async function acquire() {
  if (!('wakeLock' in navigator) || sentinel) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch {}
}

// The browser drops the lock when the page is hidden; take it back on return.
document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') acquire();
});

export function keepAwake() {
  wanted = true;
  acquire();
}

export function allowSleep() {
  wanted = false;
  sentinel?.release();
  sentinel = null;
}
