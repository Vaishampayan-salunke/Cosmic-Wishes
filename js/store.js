// Picks the data layer: Firebase when keys are present, otherwise the in-browser demo store.
export async function createStore(CONFIG, firebaseEnabled) {
  if (firebaseEnabled) {
    try {
      const mod = await import('./store-firebase.js');
      return await mod.default(CONFIG);
    } catch (e) {
      console.error('[cosmic] Firebase failed to load — falling back to demo mode.', e);
      const local = await (await import('./store-local.js')).default();
      local.fallbackReason = e && e.message ? e.message : String(e);
      return local;
    }
  }
  return (await import('./store-local.js')).default();
}
