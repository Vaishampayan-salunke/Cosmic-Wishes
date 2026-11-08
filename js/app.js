// Bootstrap + glue: wires the data layer, the sky engine and every UI module together.
import { CONFIG, FIREBASE_ENABLED } from './config.js';
import { ctx, starLink } from './ctx.js';
import { createStore } from './store.js';
import { Sky } from './sky.js';
import { AudioFX } from './audio.js';
import { generateInBackground } from './generator.js';
import { CATS, esc, hashStr, mulberry32, fmtDate } from './util.js';
import { BODIES } from './world.js';
import { starInfo } from './info.js';
import { CURATED } from './curated.js';
import { $, toast, openModal, closeAllModals, topModal } from './ui-core.js';
import { requireAuth } from './ui-auth.js';
import { openCreate, openSuccess } from './ui-create.js';
import { initCard, openStarCard, openBodyCard, closeCard, refreshCard, currentCard } from './ui-card.js';
import { openProfile, refreshProfile, isProfileOpen } from './ui-profile.js';
import { initSearch, toggleSearch, closeSearch, isSearchOpen } from './ui-search.js';

ctx.cfg = CONFIG;
document.title = `${CONFIG.APP_NAME} — ${CONFIG.TAGLINE.replace(/\.$/, '')}`;

const params = new URLSearchParams(location.search);
const linkW = params.get('w'), linkS = params.get('s');
const hasLink = !!(linkW || linkS);

let genResolve; const genReady = new Promise(r => { genResolve = r; });
const cons = new Map();
let unsubInbox = null, seenInbox = null, landingUp = !hasLink;

async function boot() {
  if (hasLink) $('#landing').classList.add('gone');
  ctx.audio = new AudioFX();
  ctx.audio.onChange = () => { const on = ctx.audio.enabled && ctx.audio.unlocked; const b = $('#t-sound'); b.textContent = on ? '🔊' : '🔇'; b.classList.toggle('on', on); };
  const unlock = () => ctx.audio.unlock();
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { once: true, capture: true }));
  ctx.audio.onChange();

  ctx.store = await createStore(CONFIG, FIREBASE_ENABLED);
  ctx.A = { requireAuth, openProfile, afterLaunch, afterReply, focusStar, openByCode, refreshMine, startConnect, reopen };

  const canvas = $('#sky');
  ctx.sky = new Sky(canvas, {
    onHover, onTap,
    onWishStreak: (s) => { const chip = $('#catch-chip'); if (s && !landingUp) { chip.innerHTML = `✨ <span>A wish is falling — tap to catch it</span>`; chip.hidden = false; } else chip.hidden = true; },
    onCatch: (s) => { ctx.audio.catchSound(); focusStar(s.id, { open: true }); },
    onArrive: (sh) => { sh.star ? ctx.audio.chime() : ctx.audio.soft(); },
    onTimelapse: onTimelapse,
  });
  const sky = ctx.sky;
  sky.cam.z = sky.homeZoom();
  if (landingUp) { sky.cam.x = -950; sky.cam.y = 180; }   // keep the Sun beside the headline, not behind it
  sky.setIdle(landingUp);
  sky.wishStreaks = !landingUp;

  initCard(); initSearch(); wireHud();

  // Setup problem banner: only appears when Firebase is missing or broken (never in normal use).
  const showProblem = (pr) => {
    const b = $('#setup-banner'); if (!pr) { b.hidden = true; return; }
    b.innerHTML = `<b>Wishes can't be saved right now.</b> ${esc(pr.message)} <button type="button" class="x" aria-label="Hide">✕</button>`;
    b.hidden = false; b.querySelector('.x').onclick = () => { b.hidden = true; };
  };
  if (ctx.store.problem) showProblem(ctx.store.problem);
  window.addEventListener('cw-problem', (e) => showProblem(e.detail));

  // live data
  ctx.store.subscribeStars((items) => { sky.upsertMany(items); scheduleCounter(); });
  ctx.store.subscribeBoosts((m) => sky.setBoosts(m));
  ctx.store.subscribeConstellations((list) => {
    list.forEach(c => {
      // the real record replaces the instant local copy we drew while it was saving
      for (const [k, v] of cons) if (k.startsWith('tmp_') && ((v.a === c.a && v.b === c.b) || (v.a === c.b && v.b === c.a))) cons.delete(k);
      cons.set(c.id, c);
    });
    sky.setConstellations([...cons.values()]);
  });
  ctx.store.onAuth(onAuth);

  // the pre-existing sky (generated in a worker, never hard-coded)
  generateInBackground(CONFIG.GENERATED_WISHES).then((arr) => {
    sky.setGenerated(arr);
    sky.setCurated(CURATED);
    $('#loading-line').classList.add('done');
    $('#landing-count').textContent = (arr.count + CURATED.length).toLocaleString();
    computeWotd(); scheduleCounter(); genResolve();
  });

  if (linkW) openByCode(linkW, linkS);
  else if (linkS) focusStar(linkS, { open: true, fetch: true });
}

// ───────────── landing / HUD wiring ─────────────
function hideLanding() {
  if (!landingUp) return; landingUp = false;
  $('#landing').classList.add('gone');
  ctx.sky.setIdle(false); ctx.sky.wishStreaks = true;
  ctx.sky.flyTo(0, 0, ctx.sky.homeZoom(), 1.6);
}
function wireHud() {
  const sky = ctx.sky;
  $('#landing-explore').addEventListener('click', hideLanding);
  $('#landing-make').addEventListener('click', () => { hideLanding(); openCreate(); });
  $('#cta').addEventListener('click', () => { hideLanding(); openCreate(); });
  $('#brand').addEventListener('click', () => { closeCard(); sky.homeView(); });
  $('#z-in').addEventListener('click', () => sky.zoomBy(1.6));
  $('#z-out').addEventListener('click', () => sky.zoomBy(1 / 1.6));
  $('#z-uni').addEventListener('click', () => { hideLanding(); sky.universeView(); });
  $('#z-home').addEventListener('click', () => { sky.homeView(); });
  $('#t-search').addEventListener('click', () => { hideLanding(); toggleSearch(); });
  $('#t-sound').addEventListener('click', async () => { await ctx.audio.setEnabled(!(ctx.audio.enabled && ctx.audio.unlocked)); ctx.audio.onChange(); });
  $('#t-wotd').addEventListener('click', () => { hideLanding(); if (!sky.wotdId) return toast('Still summoning the stars…'); toast('★ Wish of the day', '', 2200); focusStar(sky.wotdId, { open: true }); });
  $('#t-timelapse').addEventListener('click', () => { hideLanding(); startTimelapse(); });
  $('#tl-close').addEventListener('click', stopTimelapse);
  $('#tl-play').addEventListener('click', () => { if (!sky.tl) return; if (sky.tl.p >= 1) sky.seekTimelapse(0); sky.pauseTimelapse(sky.tl.p >= 1 ? true : undefined); $('#tl-play').textContent = sky.tl.playing ? '⏸' : '▶'; });
  $('#tl-range').addEventListener('input', (e) => { if (!sky.tl) return; sky.seekTimelapse(+e.target.value / 1000); sky.pauseTimelapse(false); $('#tl-play').textContent = '▶'; });
  $('#t-bell').addEventListener('click', async () => { hideLanding(); if (!ctx.user) { const u = await requireAuth('to see your notifications'); if (!u) return; } openProfile('alerts'); });
  $('#t-profile').addEventListener('click', () => { hideLanding(); openProfile(ctx.user ? 'wishes' : 'open'); });
  $('#catch-chip').addEventListener('click', () => sky.catchStreak());
  document.addEventListener('keydown', (e) => {
    if (e.target.matches && e.target.matches('input,textarea')) return;
    if (e.key === 'Escape' && !topModal()) {
      if (sky.connectFrom) return cancelConnect();
      if (sky.tl) return stopTimelapse();
      if (isSearchOpen()) return closeSearch();
      if (currentCard() || !$('#card').hidden) return closeCard();
    }
    if (e.key === '+' || e.key === '=') sky.zoomBy(1.4);
    if (e.key === '-') sky.zoomBy(1 / 1.4);
  });
}

// ───────────── hover / tap ─────────────
function onHover(star, x, y, body) {
  const tt = $('#tooltip');
  if (!star && !body) { tt.hidden = true; return; }
  if (body) tt.innerHTML = `<div class="tt-name">${esc(BODIES[body].label)}</div><div class="tt-hint">Tap to learn more</div>`;
  else {
    const info = starInfo(star), cat = CATS[star.cat];
    const sealed = star.kind === 'sealed';
    const lockedTxt = sealed ? (star.unlockAt && star.unlockAt > Date.now() ? '🍾 A message in a bottle' : '🔒 A sealed wish') : '';
    tt.innerHTML = `<div class="tt-name"><span>${cat.icon}</span>${esc(info.name)}${info.forName ? ` <span style="font-weight:400;color:var(--muted)">→ ${esc(info.forName)}</span>` : ''}</div>
      <div class="tt-text">${esc(lockedTxt || info.preview || '…')}</div><div class="tt-hint">${esc(cat.label)} · tap to open</div>`;
  }
  tt.hidden = false;
  const w = tt.offsetWidth, h = tt.offsetHeight;
  tt.style.left = Math.min(innerWidth - w - 10, x + 16) + 'px';
  tt.style.top = Math.max(10, Math.min(innerHeight - h - 10, y + 16)) + 'px';
}

function onTap(item) {
  $('#tooltip').hidden = true;
  const sky = ctx.sky;
  if (sky.connectFrom) { if (item && item.type === 'star') finishConnect(item.star); return; }
  if (landingUp) return;
  if (!item) { if (!$('#card').hidden) closeCard(); return; }
  if (item.type === 'body') { closeCard(); openBodyCard(item.key); const b = BODIES[item.key]; focusPoint(b.x, b.y, Math.max(sky.cam.z, item.key === 'sun' ? 0.6 : 1.1)); return; }
  const s = item.star; openStarCard(s); focusPoint(s.x, s.y, Math.max(sky.cam.z, 0.9));
}

// move the camera so the target sits above the bottom-sheet on phones
function focusPoint(x, y, z, dur = 1.0) {
  const mobile = matchMedia('(max-width:760px)').matches;
  ctx.sky.flyTo(x, y + (mobile ? (ctx.sky.H * 0.2) / z : 0), z, dur);
}

// ───────────── actions registered for UI modules ─────────────
async function ensureStar(id) {
  await genReady;
  let s = ctx.sky.byId.get(id);
  if (!s && id && !id.startsWith('g')) {
    try { const stub = await ctx.store.getStar(id); if (stub) { ctx.sky.upsertMany([stub]); s = ctx.sky.byId.get(id); } } catch (e) { console.warn(e); }
  }
  return s && !s.removed ? s : null;
}

async function focusStar(id, { open = false, fetch = true } = {}) {
  hideLanding();
  const s = await ensureStar(id);
  if (!s) { toast('That star is not in the sky any more — it may have been deleted.', 'err'); return null; }
  focusPoint(s.x, s.y, Math.max(1.1, ctx.sky.cam.z));
  if (open) openStarCard(s);
  return s;
}

async function openByCode(code, starHint) {
  hideLanding(); await genReady;
  let doc;
  try { doc = await ctx.store.getSealed(code); } catch (e) {
    if (e.code === 'locked') {
      const s = starHint ? await ensureStar(starHint) : null;
      if (s) { focusPoint(s.x, s.y, 1.2); openStarCard(s, { locked: true, forYou: true, code, unlockAt: s.unlockAt }); }
      else toast('This bottle is still sealed — come back after it opens 🍾');
      return;
    }
    if (e.code === 'not-found') return toast("We couldn't find a wish for that link or code. Check it and try again.", 'err');
    return toast(e.message || 'Could not open that wish.', 'err');
  }
  const s = await ensureStar(doc.starId);
  if (!s) return toast('That wish has been deleted by its sender.', 'err');
  const isOwner = !!ctx.user && doc.ownerUid === ctx.user.uid;
  focusPoint(s.x, s.y, 1.25, 1.6);
  openStarCard(s, { sealedDoc: doc, code, forYou: !isOwner });
  if (!isOwner) { if (ctx.user) recordOpen(doc, s); else toast('Tip: sign in to reply and keep this wish in your profile 💌', '', 6000); }
}
async function recordOpen(doc, s) {
  try {
    await ctx.store.recordReceived({ code: doc.code, starId: s.id, ownerName: doc.ownerName, forName: doc.forName });
    await ctx.store.noteOpened({ toUid: doc.ownerUid, starId: s.id, code: doc.code });
    ctx.received = await ctx.store.listReceived(); if (isProfileOpen()) refreshProfile();
  } catch (e) { console.warn(e); }
}
function reopen(star, opts) { if (opts && opts.code) openByCode(opts.code, star.id); else openStarCard(star, { ...opts, locked: false }); }

async function refreshMine() {
  if (!ctx.user) { ctx.mine = { stars: [], sealed: [] }; return; }
  try { ctx.mine = await ctx.store.listMine(); } catch (e) { console.warn(e); }
  refreshCard(); if (isProfileOpen()) refreshProfile();
}

function afterLaunch(res, info) {
  const sky = ctx.sky, star = sky.upsert(res.star);
  star.sealed = res.star.kind === 'sealed';
  refreshMine(); scheduleCounter();
  focusPoint(star.x, star.y, Math.max(0.9, Math.min(sky.cam.z, 1.2)), 1.2);
  setTimeout(() => {
    ctx.audio.whoosh();
    sky.shoot({ to: { x: star.x, y: star.y }, rgb: CATS[star.cat].rgb, star, onArrive: () => setTimeout(() => openSuccess(res, info), 1000) });
  }, 450);
}
function afterReply(star) {
  const sky = ctx.sky; ctx.audio.whoosh();
  sky.shoot({ to: { x: star.x, y: star.y }, rgb: CATS[star.cat].rgb, dur: 1.7, onArrive: () => toast('Your reply star reached them 💫 — only they can see it.', 'ok') });
}

// ───────────── constellations ─────────────
function startConnect(star) {
  const b = $('#connect-banner'); ctx.sky.connectFrom = star;
  b.innerHTML = `🔗 <span>Tap another star to join it with this one</span><button class="x" id="cn-cancel" aria-label="Cancel">✕</button>`;
  b.hidden = false; $('#cn-cancel').addEventListener('click', cancelConnect);
}
function cancelConnect() { ctx.sky.connectFrom = null; $('#connect-banner').hidden = true; }
async function finishConnect(b) {
  const a = ctx.sky.connectFrom; if (!a) return;
  if (b.id === a.id) return toast('Pick a different star to connect to.');
  if ([...cons.values()].some(c => (c.a === a.id && c.b === b.id) || (c.a === b.id && c.b === a.id))) { cancelConnect(); return toast('Those two stars are already connected ✨'); }
  const u = await requireAuth('to draw a constellation'); if (!u) return;
  const m = openModal(`<h2>Name your constellation</h2><p class="sub">Two stars, one line, everyone can see it. A name is optional.</p>
    <label class="field"><span>Name</span><input class="input" id="cn-name" maxlength="60" placeholder="e.g. The Hopeful Twins"></label>
    <div class="actions"><button class="btn ghost" id="cn-no">Cancel</button><button class="btn primary" id="cn-yes">🔗 Connect stars</button></div>`);
  $('#cn-no', m.el).addEventListener('click', () => { m.close(); });
  $('#cn-yes', m.el).addEventListener('click', async () => {
    const name = $('#cn-name', m.el).value.trim();
    try {
      await ctx.store.addConstellation(a.id, b.id, name);
      const tmp = { id: 'tmp_' + Date.now(), a: a.id, b: b.id, name, ownerUid: u.uid };
      if (![...cons.values()].some(c => (c.a === a.id && c.b === b.id) || (c.a === b.id && c.b === a.id))) { cons.set(tmp.id, tmp); ctx.sky.setConstellations([...cons.values()]); }
      ctx.audio.chime(); m.close(); cancelConnect(); toast('Constellation drawn ✨', 'ok');
    } catch (e) { toast(e.code === 'permission-denied' ? 'Blocked by permissions — check the Firestore rules.' : (e.message || 'Could not connect.'), 'err'); }
  });
}

// ───────────── time-lapse ─────────────
function startTimelapse() {
  closeCard(); closeSearch(true); cancelConnect();
  document.body.classList.add('timelapse');
  ['#cta', '#zoomctl', '#counter'].forEach(s => { $(s).style.display = 'none'; });
  $('#tl-bar').hidden = false; $('#tl-play').textContent = '⏸'; $('#tl-range').value = 0;
  ctx.sky.startTimelapse(); toast('Watching the sky fill with wishes…', '', 2600);
}
function stopTimelapse() {
  ctx.sky.stopTimelapse(); $('#tl-bar').hidden = true; document.body.classList.remove('timelapse');
  ['#cta', '#zoomctl', '#counter'].forEach(s => { $(s).style.display = ''; });
  ctx.sky.homeView();
}
function onTimelapse(t) {
  if (t.done) { $('#tl-play').textContent = '▶'; $('#tl-range').value = 1000; return; }
  $('#tl-date').textContent = fmtDate(t.date); $('#tl-range').value = Math.round(t.p * 1000);
  $('#tl-play').textContent = t.playing ? '⏸' : '▶';
}

// ───────────── wish of the day ─────────────
function computeWotd() {
  const sky = ctx.sky, day = new Date().toISOString().slice(0, 10), r = mulberry32(hashStr('wotd' + day));
  const real = sky.real.filter(s => !s.removed && s.kind !== 'sealed').sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
  const useReal = real.length > 0 && r() < 0.5;
  const pool = useReal ? real : null;
  const n = pool ? pool.length : (sky.generatedCount || 0); if (!n) return;
  const k = Math.floor(r() * n);
  sky.wotdId = pool ? pool[k].id : 'g' + k;
}

// ───────────── auth, inbox, counter ─────────────
function onAuth(u) {
  const prev = ctx.user; ctx.user = u;
  const pb = $('#t-profile');
  pb.textContent = u ? (u.name || '?')[0].toUpperCase() : '👤'; pb.classList.toggle('signed', !!u);
  if (unsubInbox) { unsubInbox(); unsubInbox = null; }
  seenInbox = null;
  if (u) {
    unsubInbox = ctx.store.subscribeInbox(onInbox);
    refreshMine();
    ctx.store.listReceived().then(r => { ctx.received = r; if (isProfileOpen()) refreshProfile(); }).catch(() => {});
    const c = currentCard();
    if (c && c.opts.sealedDoc && c.opts.forYou) recordOpen(c.opts.sealedDoc, c.star);
  } else {
    ctx.mine = { stars: [], sealed: [] }; ctx.inbox = { received: [], sent: [] }; ctx.received = [];
    onInbox({ received: [], sent: [] });
  }
  if (!!prev !== !!u || (prev && u && prev.uid !== u.uid)) { refreshCard(); refreshProfile(); }
}

function onInbox(data) {
  ctx.inbox = data;
  const unread = data.received.filter(i => !i.read);
  const badge = $('#bell-badge'); badge.hidden = !unread.length; badge.textContent = unread.length > 9 ? '9+' : unread.length;
  const counts = new Map();
  data.received.filter(i => i.type === 'reply').forEach(i => counts.set(i.starId, (counts.get(i.starId) || 0) + 1));
  ctx.sky.setReplyCounts(counts);
  if (seenInbox) {
    const fresh = unread.filter(i => !seenInbox.has(i.id));
    if (fresh.length) {
      const i = fresh[0];
      toast(i.type === 'reply' ? `💌 ${i.fromName || 'Someone'} replied to your wish` : `👀 ${i.fromName || 'Someone'} opened your sealed wish`, 'ok', 6000);
      ctx.audio.soft();
    }
  }
  seenInbox = new Set(data.received.map(i => i.id));
  refreshCard(); refreshProfile();
}

let counterTimer = null;
function scheduleCounter() {
  clearTimeout(counterTimer);
  counterTimer = setTimeout(() => {
    const n = ctx.sky.count(); $('#counter').innerHTML = `<b>${n.toLocaleString()}</b> wishes in the sky`;
  }, 120);
}

// debugging / testing handle
window.__cw = ctx;

boot().catch((e) => { console.error(e); toast('Something went wrong starting the sky: ' + (e.message || e), 'err', 9000); });
