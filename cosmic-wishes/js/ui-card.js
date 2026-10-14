// The wish card: reading a wish, twinkling, replying privately, connecting stars, owner tools.
import { ctx, starLink, sealedLink } from './ctx.js';
import { CATS, esc, fmtDate, fmtDateTime, countdown, timeAgo } from './util.js';
import { starInfo } from './info.js';
import { $, toast, copyText, openModal } from './ui-core.js';
import { requireAuth } from './ui-auth.js';

let cur = null, cdTimer = null;
const el = () => $('#card');

export function initCard() {
  el().addEventListener('click', onClick);
}
export function currentCard() { return cur; }

export function closeCard() {
  clearInterval(cdTimer); cur = null;
  const c = el(); c.hidden = true; c.innerHTML = '';
  document.body.classList.remove('card-open');
  if (ctx.sky) { ctx.sky.selectedId = null; ctx.sky.pulseId = null; }
}

export async function openStarCard(star, opts = {}) {
  clearInterval(cdTimer);
  const me = cur = { star, opts, text: opts.text, twinkled: false, replying: false, marked: false };
  ctx.sky.selectedId = star.id;
  ctx.sky.pulseId = opts.forYou ? star.id : null;
  document.body.classList.add('card-open');
  el().hidden = false;
  render();
  if (!star.gen && star.kind !== 'sealed' && me.text === undefined) {
    try { me.text = await ctx.store.getText(star.id); } catch (e) { console.warn(e); me.text = null; }
    if (cur === me) render();
  }
  if (ctx.user) {
    try { me.twinkled = await ctx.store.myTwinkle(star.id); } catch { /* ignore */ }
    if (cur === me) render();
  }
}

export function refreshCard() { if (cur) render(); }

function view() {
  const { star, opts } = cur;
  const info = starInfo(star);
  const isOwner = !!ctx.user && star.ownerUid === ctx.user.uid;
  const sealed = star.kind === 'sealed';
  let name = info.name, forName = info.forName, text = null, state = 'ok', code = null, ownerUid = star.ownerUid;
  if (star.gen) text = info.text;
  else if (!sealed) text = cur.text === undefined ? undefined : (cur.text == null ? '(This wish could not be loaded.)' : cur.text);
  else {
    const doc = opts.sealedDoc || (isOwner ? ctx.mine.sealed.find(s => s.starId === star.id) : null);
    if (doc) { text = doc.text; name = doc.ownerName || name; forName = doc.forName; code = doc.code; ownerUid = doc.ownerUid || ownerUid; }
    else if (opts.locked || (star.unlockAt && star.unlockAt > Date.now())) state = 'locked';
    else state = 'sealed';
  }
  return { info, isOwner, sealed, name, forName, text, state, code, ownerUid };
}

function render() {
  if (!cur) return;
  const { star, opts } = cur, v = view(), cat = CATS[star.cat];
  const boost = ctx.sky.boost.get(star.id) || 0;
  const replies = v.isOwner ? ctx.inbox.received.filter(i => i.type === 'reply' && i.starId === star.id) : [];
  const mine = ctx.user ? ctx.inbox.sent.filter(i => i.type === 'reply' && i.starId === star.id) : [];
  let bodyHtml = '';
  if (v.state === 'ok') {
    bodyHtml = v.text === undefined ? `<div class="card-text skeleton">Reading the stars…</div>` : `<div class="card-text" id="card-text">${esc(v.text)}</div>`;
  } else if (v.state === 'locked') {
    const when = star.unlockAt || opts.unlockAt;
    bodyHtml = `<div class="lock-box"><div class="big">🍾</div><b>A message in a bottle</b>
      ${when ? `<div class="cd" data-unlock="${when}">${countdown(when - Date.now())}</div><div class="muted" style="font-size:13px">It opens on ${esc(fmtDateTime(when))}.<br>Come back then — nobody can read it sooner.</div>` : `<div class="muted" style="font-size:13px;margin-top:6px">It isn't open yet. Come back later.</div>`}</div>`;
  } else {
    bodyHtml = `<div class="lock-box"><div class="big">🔒</div><b>A sealed wish</b><div class="muted" style="font-size:13px;margin:6px 0 12px;line-height:1.5">Only someone holding its private link can read it.</div>
      <button class="btn ghost small" data-act="openbox">I have a link or code</button></div>`;
  }
  const meta = [];
  meta.push(`<span>🗓 ${esc(fmtDate(star.t))}</span>`);
  if (star.granted) meta.push('<span style="color:#ffd479">✅ Came true</span>');
  if (v.sealed) meta.push('<span>🔒 Sealed</span>');
  if (star.gen) meta.push('<span>From the early sky</span>');
  if (boost) meta.push(`<span>✨ ${boost} twinkle${boost === 1 ? '' : 's'}</span>`);

  const acts = [];
  const readable = v.state === 'ok';
  if (!v.isOwner) acts.push(`<button class="btn ${cur.twinkled ? 'ghost' : 'primary'} small" data-act="twinkle" ${cur.twinkled ? 'disabled' : ''}>${cur.twinkled ? '✨ Twinkled' : '✨ Twinkle'}</button>`);
  if (v.ownerUid && !v.isOwner && readable && !star.gen) acts.push(`<button class="btn ghost small" data-act="reply">💌 Reply privately</button>`);
  acts.push(`<button class="btn ghost small" data-act="connect">🔗 Connect</button>`);
  if (!v.sealed || v.isOwner) acts.push(`<button class="btn ghost small" data-act="share">${v.sealed ? '🔗 Copy private link' : 'Share'}</button>`);
  if (v.isOwner) {
    acts.push(`<button class="btn ghost small" data-act="granted">${star.granted ? 'Undo "came true"' : '🌟 Mark as came true'}</button>`);
    acts.push(`<button class="btn danger small" data-act="delete">Delete</button>`);
  } else if (!star.gen && v.ownerUid && readable) acts.push(`<button class="btn ghost small" data-act="report">Report</button>`);

  el().innerHTML = `
    <div class="card-head"><div class="orb ${cat.kind === 'star' ? '' : 'planet'}" style="--c:${cat.rgb}"></div>
      <div class="card-title"><div class="card-cat" style="--c:${cat.rgb}">${esc(cat.label)} · ${esc(cat.object)}</div>
      <div class="card-by">${esc(v.name)}${v.forName ? ` <small>→ for ${esc(v.forName)}</small>` : ''}</div></div>
      <button class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    ${opts.forYou && v.state === 'ok' ? `<div class="card-banner">💌 A wish was launched for you by <b>${esc(v.name)}</b></div>` : ''}
    ${bodyHtml}
    <div class="card-meta">${meta.join('')}</div>
    <div class="card-actions">${acts.join('')}</div>
    ${cur.replying ? `<div class="card-section"><h4>Your private reply</h4>
      <textarea class="textarea" id="reply-text" style="min-height:96px" placeholder="Only ${esc(v.name)} will ever see this."></textarea>
      <div class="actions"><button class="btn ghost small" data-act="cancel-reply">Cancel</button><button class="btn primary small" data-act="send-reply">💫 Launch reply star</button></div></div>` : ''}
    ${replies.length ? `<div class="card-section"><h4>💌 Private replies to your wish (only you can see these)</h4>${replies.map(r => `<div class="reply-item"><small>${esc(r.fromName)} · ${esc(timeAgo(r.createdAt))}</small>${esc(r.text)}</div>`).join('')}</div>` : ''}
    ${mine.length ? `<div class="card-section"><h4>Your replies</h4>${mine.map(r => `<div class="reply-item"><small>You · ${esc(timeAgo(r.createdAt))}</small>${esc(r.text)}</div>`).join('')}</div>` : ''}`;

  clearInterval(cdTimer);
  const cd = el().querySelector('[data-unlock]');
  if (cd) {
    const me = cur;
    cdTimer = setInterval(() => {
      const left = +cd.dataset.unlock - Date.now();
      if (left <= 0) { clearInterval(cdTimer); toast('The bottle just opened ✨', 'ok'); ctx.A.reopen(me.star, me.opts); } else cd.textContent = countdown(left);
    }, 1000);
  }
  if (v.isOwner && !cur.marked) {
    const unread = ctx.inbox.received.filter(i => i.starId === star.id && !i.read).map(i => i.id);
    if (unread.length) { cur.marked = true; ctx.store.markRead(unread).catch(() => {}); }
  }
}

async function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'close') return closeCard();
  if (!cur) return;
  const act = b.dataset.act, me = cur, star = me.star, v = view();
  if (act === 'openbox') return ctx.A.openProfile('open');
  if (act === 'connect') { closeCard(); return ctx.A.startConnect(star); }
  if (act === 'share') {
    const link = v.sealed && v.code ? sealedLink(v.code, star.id) : starLink(star.id);
    const ok = await copyText(link); return toast(ok ? 'Link copied ✨' : 'Could not copy — try again.', ok ? 'ok' : 'err');
  }
  if (act === 'twinkle') {
    const u = await requireAuth('to twinkle a star'); if (!u || cur !== me) return;
    try {
      const before = ctx.sky.boost.get(star.id) || 0;
      await ctx.store.twinkle(star.id);
      // the live subscription may already have delivered the new count — never add on top of it
      ctx.sky.boost.set(star.id, Math.max(ctx.sky.boost.get(star.id) || 0, before + 1));
      me.twinkled = true; ctx.audio.twinkle(); ctx.sky.burst(star.x, star.y, CATS[star.cat].rgb, 26);
      if (cur === me) render();
    } catch (er) { if (er.code === 'already') { me.twinkled = true; render(); } toast(er.message || 'Could not twinkle.', 'err'); }
    return;
  }
  if (act === 'reply') { const u = await requireAuth('to reply'); if (!u || cur !== me) return; me.replying = true; render(); $('#reply-text', el()) && $('#reply-text', el()).focus(); return; }
  if (act === 'cancel-reply') { me.replying = false; return render(); }
  if (act === 'send-reply') {
    const t = $('#reply-text', el()).value.trim(); if (!t) return toast('Write a few words first 💫');
    b.disabled = true;
    try {
      await ctx.store.sendReply({ toUid: v.ownerUid, starId: star.id, text: t, cat: star.cat });
      me.replying = false; if (cur === me) render();
      ctx.A.afterReply(star);
    } catch (er) { b.disabled = false; toast(er.code === 'permission-denied' ? 'Reply was blocked by permissions — check the Firestore rules.' : (er.message || 'Could not send your reply.'), 'err'); }
    return;
  }
  if (act === 'granted') {
    try {
      const next = !star.granted; await ctx.store.setGranted(star.id, next);
      star.granted = next; ctx.sky.upsert({ ...star, id: star.id });
      if (next) { ctx.sky.burst(star.x, star.y, '255,212,121', 80); ctx.audio.chime(); toast('Beautiful — your star now wears a golden halo 🌟', 'ok'); }
      ctx.A.refreshMine(); render();
    } catch (er) { toast(er.message || 'Could not update.', 'err'); }
    return;
  }
  if (act === 'delete') {
    const m = openModal(`<h2>Delete this wish?</h2><p class="sub">The star will disappear from the sky for everyone${v.sealed ? ', and its private link will stop working' : ''}. This can't be undone.</p>
      <div class="actions"><button class="btn ghost" id="dl-no">Keep it</button><button class="btn danger" id="dl-yes">Delete wish</button></div>`);
    $('#dl-no', m.el).addEventListener('click', () => m.close());
    $('#dl-yes', m.el).addEventListener('click', async () => {
      try {
        await ctx.store.deleteWish(star.id, v.code);
        star.removed = true; ctx.sky.upsert({ id: star.id, removed: true }); m.close(); closeCard(); ctx.A.refreshMine(); toast('Wish deleted.', 'ok');
      } catch (er) { toast(er.message || 'Could not delete.', 'err'); }
    });
    return;
  }
  if (act === 'report') {
    const u = await requireAuth('to report a wish'); if (!u) return;
    const m = openModal(`<h2>Report this wish</h2><p class="sub">Tell us what's wrong. Reports are private.</p>
      <div class="field"><label class="check" style="margin-bottom:8px"><input type="radio" name="rr" value="harassment" checked> Harassment or hate</label>
      <label class="check" style="margin-bottom:8px"><input type="radio" name="rr" value="sexual"> Sexual or graphic content</label>
      <label class="check" style="margin-bottom:8px"><input type="radio" name="rr" value="spam"> Spam or ads</label>
      <label class="check"><input type="radio" name="rr" value="other"> Something else</label></div>
      <div class="actions"><button class="btn ghost" id="rp-no">Cancel</button><button class="btn primary" id="rp-yes">Send report</button></div>`);
    $('#rp-no', m.el).addEventListener('click', () => m.close());
    $('#rp-yes', m.el).addEventListener('click', async () => {
      const reason = (m.el.querySelector('input[name=rr]:checked') || {}).value || 'other';
      try { await ctx.store.report(star.id, reason); m.close(); toast('Thanks — we will take a look.', 'ok'); } catch (er) { toast(er.message || 'Could not send report.', 'err'); }
    });
  }
}

// ── Sun, Moon, Black hole cards ──
const FACTS = {
  sun: { icon: '☀️', title: 'The Sun', text: 'The warm heart of this sky. Every wish glows in its light — but it is far too bright for any star to settle close, so there is a wide empty circle around it.' },
  moon: { icon: '🌙', title: 'The Moon', text: 'Keeper of quiet wishes. Watch her slowly change phase while you explore — a new moon is the best time to start a wish over.' },
  blackhole: { icon: '🕳️', title: 'The Black Hole', text: 'Small, silent and hungry. Nothing — not even a wish — can drift near it, so we keep every star at a safe distance. Zoom in and watch the dust spiral into the dark.' },
};
export function openBodyCard(key) {
  clearInterval(cdTimer); cur = null;
  const f = FACTS[key]; if (!f) return;
  ctx.sky.selectedId = null;
  document.body.classList.add('card-open'); el().hidden = false;
  el().innerHTML = `<div class="card-head"><div class="orb" style="--c:255,212,121;font-size:24px;display:grid;place-items:center">${f.icon}</div>
    <div class="card-title"><div class="card-cat" style="--c:255,212,121">Cosmic landmark</div><div class="card-by">${f.title}</div></div>
    <button class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="fun-fact">${f.text}</p>`;
}
