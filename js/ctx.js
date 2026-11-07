// Tiny shared state object so UI modules don't import each other in circles.
export const ctx = {
  cfg: null, store: null, sky: null, audio: null,
  user: null,
  mine: { stars: [], sealed: [] },        // my launched wishes (with sealed text + codes)
  inbox: { received: [], sent: [] },      // private replies / "opened" notices
  received: [],                           // wishes friends sent me
  A: {},                                  // actions registered by app.js (requireAuth, openStar, flyToStar, …)
};

export function baseUrl() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}
export function starLink(id) { return `${baseUrl()}?s=${encodeURIComponent(id)}`; }
export function sealedLink(code, starId) { return `${baseUrl()}?w=${code}&s=${encodeURIComponent(starId)}`; }
