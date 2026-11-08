// Picks the data layer. Real data lives in Firebase. If Firebase is missing/broken we do NOT fall back to
// a hidden browser-only store (that made wishes look saved but invisible to everyone else) — we say so loudly.
// The in-browser demo store is only used on purpose: open the site with ?demo=1.
export async function createStore(CONFIG, firebaseEnabled) {
  let demo = false;
  try { demo = new URLSearchParams(location.search).get('demo') === '1' || localStorage.getItem('cw_demo') === '1'; } catch { /* ignore */ }
  if (demo) return (await import('./store-local.js')).default();

  const offline = async (problem) => (await import('./store-offline.js')).default(problem);
  if (!firebaseEnabled) {
    return offline({ code: 'no-config', message: 'Firebase keys are missing in js/config.js, so wishes cannot be saved. Paste your Firebase web config there, redeploy, and reload.' });
  }
  let store;
  try {
    store = await (await import('./store-firebase.js')).default(CONFIG);
  } catch (e) {
    console.error('Firebase failed to start', e);
    return offline({ code: 'load-failed', message: `Firebase could not start (${e.message || e}). Check the keys in js/config.js and your internet connection.` });
  }
  // check in the background so the sky opens instantly; a problem shows the red banner
  store.health().then((h) => {
    if (!h.ok) { store.problem = h; console.error('Firebase health check failed', h); window.dispatchEvent(new CustomEvent('cw-problem', { detail: h })); }
  }).catch((e) => console.warn(e));
  return store;
}
