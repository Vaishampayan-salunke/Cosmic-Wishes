// Profile drawer: my wishes (history), wishes friends sent me, "open a wish" box, alerts, account.
import { ctx, sealedLink, starLink } from './ctx.js';
import { CATS, esc, fmtDate, fmtDateTime, timeAgo, parseWishInput, fmtCode } from './util.js';
import { starInfo } from './info.js';
import { openModal, $, $$, toast, copyText } from './ui-core.js';
import { requireAuth } from './ui-auth.js';

let drawer = null, tab = 'wishes';

export function isProfileOpen() { return !!drawer && !drawer.closed; }
export function closeProfile() { if (drawer) drawer.close(); }

export async function openProfile(which = 'wishes') {
  if (drawer && !drawer.closed) drawer.close();
  tab = which;
  const m = drawer = openModal(`<div id="pf-root"></div>`, { drawer: true, onClose: () => { drawer = null; } });
  renderShell();
  if (ctx.user) { try { await ctx.A.refreshMine(); } catch { /* ignore */ } }
  if (drawer === m) renderTab();
}

export function refreshProfile() { if (isProfileOpen()) { renderShell(); renderTab(); } }

const unreadCount = () => ctx.inbox.received.filter(i => !i.read).length;

function renderShell() {
  const root = $('#pf-root', drawer.el); const u = ctx.user;
  const tabs = u
    ? [['wishes', 'Wishes'], ['received', 'Received'], ['open', 'Open'], ['alerts', 'Alerts' + (unreadCount() ? ` (${unreadCount()})` : '')], ['me', 'Me']]
    : [['open', 'Open a wish']];
  if (!u && tab !== 'open') tab = 'open';
  root.innerHTML = `
    <div class="drawer-head"><div class="avatar">${u ? esc((u.name || '?')[0].toUpperCase()) : '✦'}</div>
      <div class="who"><b>${u ? esc(u.name) : 'Welcome, stargazer'}</b><span>${u ? esc(u.email || 'Signed in') : 'Sign in to keep your wishes together'}</span></div>
      ${u ? '' : '<button class="btn primary small" id="pf-signin">Sign in</button>'}
      <button class="icon-btn" id="pf-close" aria-label="Close">✕</button></div>
    <div class="tabs" id="pf-tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="drawer-body" id="pf-body"></div>`;
  $('#pf-close', root).addEventListener('click', () => drawer.close());
  const si = $('#pf-signin', root); if (si) si.addEventListener('click', async () => { const user = await requireAuth('to see your profile'); if (user) openProfile('wishes'); });
  $$('#pf-tabs button', root).forEach(b => b.addEventListener('click', () => { tab = b.dataset.t; renderShell(); renderTab(); }));
}

function renderTab() {
  const body = $('#pf-body', drawer.el); if (!body) return;
  ({ wishes: tWishes, received: tReceived, open: tOpen, alerts: tAlerts, me: tMe }[tab] || tWishes)(body);
}

const empty = (icon, msg) => `<div class="empty"><b>${icon}</b>${msg}</div>`;

function tWishes(body) {
  const stars = [...ctx.mine.stars].sort((a, b) => b.t - a.t || (b.createdAt || 0) - (a.createdAt || 0));
  if (!stars.length) { body.innerHTML = empty('🌠', 'You have not launched a wish yet.<br>Your history will live here.'); return; }
  body.innerHTML = `<ul class="list">${stars.map(s => {
    const doc = ctx.mine.sealed.find(x => x.starId === s.id), cat = CATS[s.cat];
    const text = doc ? doc.text : (s.preview || '');
    const forName = doc ? doc.forName : s.forName;
    const replies = ctx.inbox.received.filter(i => i.type === 'reply' && i.starId === s.id).length;
    const tw = ctx.sky.boost.get(s.id) || 0;
    const title = s.kind === 'sealed' ? (s.unlockAt && s.unlockAt > Date.now() ? `🍾 Bottle${forName ? ' for ' + esc(forName) : ''}` : `🔒 Sealed wish${forName ? ' for ' + esc(forName) : ''}`) : (forName ? `For ${esc(forName)}` : 'Public wish');
    return `<li class="item" data-id="${esc(s.id)}"><div class="item-top"><div class="item-ico">${cat.icon}</div>
      <div class="item-main"><div class="item-title">${title}</div><div class="item-sub">${esc(text)}</div>
      <div class="item-meta"><span>${esc(fmtDate(s.createdAt || s.t))}</span>${s.unlockAt && s.unlockAt > Date.now() ? `<span>opens ${esc(fmtDateTime(s.unlockAt))}</span>` : ''}${tw ? `<span>✨ ${tw}</span>` : ''}${replies ? `<span>💌 ${replies} repl${replies === 1 ? 'y' : 'ies'}</span>` : ''}${s.granted ? '<span style="color:#ffd479">✅ came true</span>' : ''}</div></div></div>
      <div class="item-actions"><button class="btn ghost small" data-a="view">View in sky</button>
      <button class="btn ghost small" data-a="link">Copy link</button>
      <button class="btn ghost small" data-a="granted">${s.granted ? 'Undo came true' : '🌟 Came true'}</button></div></li>`;
  }).join('')}</ul>`;
  body.onclick = async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return; const id = b.closest('.item').dataset.id, s = ctx.mine.stars.find(x => x.id === id); if (!s) return;
    if (b.dataset.a === 'view') { drawer.close(); ctx.A.focusStar(id, { open: true }); }
    if (b.dataset.a === 'link') {
      const doc = ctx.mine.sealed.find(x => x.starId === id);
      const ok = await copyText(doc ? sealedLink(doc.code, id) : starLink(id)); toast(ok ? 'Link copied ✨' : 'Could not copy.', ok ? 'ok' : 'err');
    }
    if (b.dataset.a === 'granted') {
      try { const next = !s.granted; await ctx.store.setGranted(id, next); s.granted = next; ctx.sky.upsert({ id, granted: next }); if (next) { ctx.audio.chime(); ctx.sky.burst(s.x, s.y, '255,212,121', 60); } renderTab(); } catch (er) { toast(er.message, 'err'); }
    }
  };
}

function tReceived(body) {
  const list = ctx.received;
  if (!list.length) { body.innerHTML = empty('💌', 'Wishes your friends send you will appear here after you open their link.'); return; }
  body.innerHTML = `<ul class="list">${list.map(r => `<li class="item" data-code="${esc(r.code)}" data-star="${esc(r.starId)}"><div class="item-top"><div class="item-ico">💌</div>
    <div class="item-main"><div class="item-title">From ${esc(r.ownerName || 'a friend')}</div><div class="item-meta"><span>${esc(fmtDate(r.createdAt))}</span><span>${esc(fmtCode(r.code))}</span></div></div></div>
    <div class="item-actions"><button class="btn primary small" data-a="open">Open wish</button></div></li>`).join('')}</ul>`;
  body.onclick = (e) => { const b = e.target.closest('[data-a=open]'); if (!b) return; const it = b.closest('.item'); drawer.close(); ctx.A.openByCode(it.dataset.code, it.dataset.star); };
}

function tOpen(body) {
  body.innerHTML = `<p class="sub" style="color:var(--muted);line-height:1.55;margin-bottom:16px">A friend sent you a wish? Paste their link — or just the code — and it will open in the sky.</p>
    <label class="field"><span>Link or code</span><input class="input" id="oc-input" placeholder="https://…/?w=ABCD…   or   ABCD-EFGH-IJKL-MNOP" autocomplete="off" spellcheck="false"></label>
    <div class="error" id="oc-err"></div>
    <button class="btn primary" id="oc-go" style="width:100%">✦ Open the wish</button>`;
  const go = () => {
    const p = parseWishInput($('#oc-input', body).value);
    if (!p || (!p.code && !p.starId)) return ($('#oc-err', body).textContent = "That doesn't look like a wish link or code. Check it and try again.");
    drawer.close(); if (p.code) ctx.A.openByCode(p.code, p.starId); else ctx.A.focusStar(p.starId, { open: true, fetch: true });
  };
  $('#oc-go', body).addEventListener('click', go);
  $('#oc-input', body).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  body.onclick = null;
}

function tAlerts(body) {
  const list = ctx.inbox.received, sent = ctx.inbox.sent.filter(i => i.type === 'reply');
  if (!list.length && !sent.length) { body.innerHTML = empty('🔔', 'No notifications yet.<br>When a friend replies to your wish, you will see it here.'); return; }
  const row = (i) => {
    const s = ctx.sky.byId.get(i.starId), info = s ? starInfo(s) : null;
    const isReply = i.type === 'reply';
    const title = isReply ? `💌 <b>${esc(i.fromName || 'Someone')}</b> replied to your wish` : `👀 <b>${esc(i.fromName || 'Someone')}</b> opened your sealed wish`;
    return `<li class="item ${i.read ? '' : 'unread'}" data-id="${esc(i.id)}" data-star="${esc(i.starId)}"><div class="item-top"><div class="item-main"><div class="item-title">${title}</div>
      ${isReply ? `<div class="item-sub">${esc(i.text)}</div>` : ''}<div class="item-meta"><span>${esc(timeAgo(i.createdAt))}</span>${info && info.preview ? `<span>on "${esc(info.preview.slice(0, 40))}…"</span>` : ''}</div></div></div>
      <div class="item-actions"><button class="btn ghost small" data-a="view">View star</button></div></li>`;
  };
  body.innerHTML = `${unreadCount() ? '<div class="actions" style="margin:0 0 10px"><button class="btn ghost small" id="al-read">Mark all read</button></div>' : ''}
    <ul class="list">${list.map(row).join('')}</ul>
    ${sent.length ? `<h4 style="margin:20px 0 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Replies you sent</h4><ul class="list">${sent.map(i => `<li class="item"><div class="item-sub">${esc(i.text)}</div><div class="item-meta"><span>${esc(timeAgo(i.createdAt))}</span></div></li>`).join('')}</ul>` : ''}`;
  const mr = $('#al-read', body); if (mr) mr.addEventListener('click', async () => { try { await ctx.store.markRead(list.filter(i => !i.read).map(i => i.id)); } catch (e) { toast(e.message, 'err'); } });
  body.onclick = async (e) => {
    const b = e.target.closest('[data-a=view]'); if (!b) return; const it = b.closest('.item');
    ctx.store.markRead([it.dataset.id]).catch(() => {}); drawer.close(); ctx.A.focusStar(it.dataset.star, { open: true, fetch: true });
  };
}

function tMe(body) {
  body.innerHTML = `<label class="field"><span>Display name</span><input class="input" id="me-name" maxlength="60" value="${esc(ctx.user.name)}"></label>
    <div class="actions" style="justify-content:flex-start"><button class="btn primary small" id="me-save">Save name</button></div>
    <div class="divider">account</div>
    <p class="muted" style="font-size:13px;margin-bottom:12px">${ctx.store.mode === 'local' ? 'Demo mode — your data lives only in this browser.' : 'Signed in as ' + esc(ctx.user.email || '')}</p>
    <button class="btn danger" id="me-out">Sign out</button>`;
  $('#me-save', body).addEventListener('click', async () => { try { await ctx.store.setName($('#me-name', body).value); toast('Name updated ✨', 'ok'); } catch (e) { toast(e.message, 'err'); } });
  $('#me-out', body).addEventListener('click', async () => { await ctx.store.signOut(); drawer.close(); toast('Signed out. See you among the stars ✨'); });
  body.onclick = null;
}
