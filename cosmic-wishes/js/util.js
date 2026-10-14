// Shared helpers + category definitions. No DOM access at import time (also used by the worker).

export const CATS = {
  love:       { key: 'love',       label: 'Love',       icon: '❤️', rgb: '255,90,126',  color: '#ff5a7e', kind: 'star',   object: 'Pink-red star' },
  dreams:     { key: 'dreams',     label: 'Dreams',     icon: '💫', rgb: '255,209,102', color: '#ffd166', kind: 'star',   object: 'Gold star' },
  career:     { key: 'career',     label: 'Career',     icon: '💼', rgb: '255,176,64',  color: '#ffb040', kind: 'star',   object: 'Amber-gold star' },
  health:     { key: 'health',     label: 'Health',     icon: '🌿', rgb: '91,227,140',  color: '#5be38c', kind: 'planet', object: 'Green planet' },
  travel:     { key: 'travel',     label: 'Travel',     icon: '✈️', rgb: '77,163,255',  color: '#4da3ff', kind: 'ring',   object: 'Blue ringed planet' },
  friendship: { key: 'friendship', label: 'Friendship', icon: '🤝', rgb: '180,140,255', color: '#b48cff', kind: 'star',   object: 'Violet star' },
  other:      { key: 'other',      label: 'Other',      icon: '✨', rgb: '240,244,255', color: '#f0f4ff', kind: 'star',   object: 'White star' },
};
export const CAT_KEYS = Object.keys(CATS);

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 32-char alphabet (no 0/O/1/I) -> 16 chars = 80 bits, unguessable.
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function genCode(len = 16) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  let s = '';
  for (const b of a) s += CODE_ALPHABET[b % 32]; // 256 % 32 === 0, so no modulo bias
  return s;
}
export function fmtCode(c) { return (c.match(/.{1,4}/g) || [c]).join('-'); }

// Accepts a full link, a "?w=CODE" fragment, or a bare code (with or without dashes).
// Returns { code, starId } | { starId } | null
export function parseWishInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let code = null, starId = null;
  const w = s.match(/[?&]w=([A-Za-z0-9-]+)/);
  const st = s.match(/[?&]s=([A-Za-z0-9_-]+)/);
  if (w) code = w[1];
  if (st) starId = st[1];
  if (!code && !starId) code = s;
  if (code) {
    const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (clean.length === 16 && [...clean].every(ch => CODE_ALPHABET.includes(ch))) code = clean;
    else code = null;
  }
  if (!code && !starId) return null;
  const out = {};
  if (code) out.code = code;
  if (starId) out.starId = starId;
  return out;
}

export function fmtDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDateTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function toLocalInput(ms) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}
export function timeAgo(ms) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.round(h / 24); if (d < 30) return d + 'd ago';
  return fmtDate(ms);
}
export function countdown(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function containsBlocked(text, words) {
  if (!words || !words.length) return false;
  const re = new RegExp('\\b(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'i');
  return re.test(text);
}
