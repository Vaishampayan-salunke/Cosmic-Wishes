// DOM helpers: element builder, toasts, modals.
import { esc } from './util.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function html(str) { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstElementChild; }

export function toast(msg, kind = '', ms = 4200) {
  const el = html(`<div class="toast ${kind}" role="status">${esc(msg)}</div>`);
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, ms);
}

const stack = [];
export function openModal(inner, { onClose, drawer = false } = {}) {
  const root = $('#modal-root');
  const wrap = html(drawer
    ? `<div class="drawer-wrap"><div class="drawer-back"></div><div class="drawer" role="dialog" aria-modal="true"></div></div>`
    : `<div class="backdrop"><div class="modal" role="dialog" aria-modal="true"><button class="icon-btn modal-x" aria-label="Close">✕</button></div></div>`);
  const box = drawer ? $('.drawer', wrap) : $('.modal', wrap);
  if (typeof inner === 'string') box.insertAdjacentHTML('beforeend', inner); else box.appendChild(inner);
  root.appendChild(wrap);
  root.style.pointerEvents = 'auto';
  const m = { el: box, wrap, closed: false, close() {
    if (m.closed) return; m.closed = true; wrap.remove();
    const i = stack.indexOf(m); if (i >= 0) stack.splice(i, 1);
    if (!stack.length) root.style.pointerEvents = 'none';
    onClose && onClose();
  } };
  stack.push(m);
  const x = $('.modal-x', wrap); if (x) x.addEventListener('click', () => m.close());
  if (drawer) $('.drawer-back', wrap).addEventListener('click', () => m.close());
  else wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) m._bd = true; });
  wrap.addEventListener('click', (e) => { if (!drawer && e.target === wrap && m._bd) m.close(); m._bd = false; });
  setTimeout(() => { const f = box.querySelector('[autofocus],input,textarea,button.primary'); f && f.focus && f.focus({ preventScroll: true }); }, 60);
  return m;
}
export function closeAllModals() { [...stack].forEach(m => m.close()); }
export function topModal() { return stack[stack.length - 1] || null; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });

export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
  ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ } ta.remove(); return ok;
}
