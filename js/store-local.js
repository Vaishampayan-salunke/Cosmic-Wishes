// DEMO-MODE data layer. Same interface as store-firebase.js, but everything lives in this browser's
// localStorage. It lets the site run (and be tested) before Firebase keys are added.
import { genCode, hashStr } from './util.js';

const KEY = 'cw_local_db_v1', SESSION = 'cw_local_session_v1';
const fresh = () => ({ stars: {}, texts: {}, sealed: {}, boosts: {}, by: {}, cons: {}, inbox: {}, received: {}, reports: {}, users: {} });
const rid = (p) => p + genCode(14).toLowerCase();

export default async function createLocalStore() {
  let db; const load = () => { try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return fresh(); } };
  db = load();
  let uid = localStorage.getItem(SESSION) || null;
  const subs = { auth: new Set(), stars: new Set(), boosts: new Set(), cons: new Set(), inbox: new Set() };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { throw Object.assign(new Error('Browser storage is full.'), { code: 'quota' }); } emitAll(); };
  const me = () => (uid && db.users[uid]) ? { uid, name: db.users[uid].name, email: db.users[uid].email } : null;
  const err = (code, message) => Object.assign(new Error(message || code), { code });
  const needAuth = () => { const u = me(); if (!u) throw err('auth', 'Please sign in first.'); return u; };

  const emitAuth = () => subs.auth.forEach(cb => cb(me()));
  const emitStars = () => subs.stars.forEach(cb => cb(Object.values(db.stars).map(s => ({ ...s }))));
  const emitBoosts = () => subs.boosts.forEach(cb => cb({ ...db.boosts }));
  const emitCons = () => subs.cons.forEach(cb => cb(Object.values(db.cons).map(c => ({ ...c }))));
  const inboxFor = () => {
    const u = me(); if (!u) return { received: [], sent: [] };
    const all = Object.values(db.inbox);
    return { received: all.filter(i => i.toUid === u.uid).sort((a, b) => b.createdAt - a.createdAt), sent: all.filter(i => i.fromUid === u.uid).sort((a, b) => b.createdAt - a.createdAt) };
  };
  const emitInbox = () => subs.inbox.forEach(cb => cb(inboxFor()));
  function emitAll() { emitStars(); emitBoosts(); emitCons(); emitInbox(); }

  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { db = load(); emitAll(); }
    if (e.key === SESSION) { uid = localStorage.getItem(SESSION); emitAuth(); emitInbox(); }
  });

  const setSession = (id) => { uid = id; if (id) localStorage.setItem(SESSION, id); else localStorage.removeItem(SESSION); emitAuth(); emitInbox(); };

  return {
    mode: 'local',
    // ── auth ──
    onAuth(cb) { subs.auth.add(cb); cb(me()); return () => subs.auth.delete(cb); },
    async signInGoogle() { throw err('unsupported', 'Google sign-in needs Firebase. Use email in demo mode.'); },
    async signUp(email, pw, name) {
      email = String(email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw err('bad-email', 'Please enter a valid email.');
      if (String(pw || '').length < 6) throw err('weak-password', 'Password must be at least 6 characters.');
      if (Object.values(db.users).some(u => u.email === email)) throw err('email-in-use', 'That email already has an account — sign in instead.');
      const id = 'u_' + genCode(10).toLowerCase();
      db.users[id] = { uid: id, email, name: (name || '').trim() || email.split('@')[0], pw: hashStr(pw) };
      save(); setSession(id); return me();
    },
    async signIn(email, pw) {
      email = String(email || '').trim().toLowerCase();
      const u = Object.values(db.users).find(x => x.email === email);
      if (!u || u.pw !== hashStr(pw || '')) throw err('bad-credentials', 'Wrong email or password.');
      setSession(u.uid); return me();
    },
    async signOut() { setSession(null); },
    async setName(name) { const u = needAuth(); db.users[u.uid].name = name.trim() || u.name; save(); emitAuth(); },

    // ── live data ──
    subscribeStars(cb) { subs.stars.add(cb); cb(Object.values(db.stars).map(s => ({ ...s }))); return () => subs.stars.delete(cb); },
    subscribeBoosts(cb) { subs.boosts.add(cb); cb({ ...db.boosts }); return () => subs.boosts.delete(cb); },
    subscribeConstellations(cb) { subs.cons.add(cb); cb(Object.values(db.cons).map(c => ({ ...c }))); return () => subs.cons.delete(cb); },
    subscribeInbox(cb) { subs.inbox.add(cb); cb(inboxFor()); return () => subs.inbox.delete(cb); },

    // ── wishes ──
    async createWish(d) {
      const u = needAuth(); const id = rid('s_'), now = Date.now();
      const sealed = !!d.sealed, kind = sealed ? 'sealed' : 'public';
      const star = {
        id, ownerUid: u.uid, name: '', forName: sealed ? '' : (d.forName || ''), cat: d.cat, x: d.x, y: d.y, size: d.size, kind,
        preview: sealed ? '' : d.text.slice(0, 140), unlockAt: d.unlockAt || null, granted: false, removed: false, createdAt: now, updatedAt: now,
      };
      let code = null;
      db.stars[id] = star;
      if (sealed) { code = genCode(); db.sealed[code] = { code, starId: id, ownerUid: u.uid, ownerName: d.name, forName: d.forName || '', cat: d.cat, text: d.text, unlockAt: d.unlockAt || null, createdAt: now }; }
      else db.texts[id] = { text: d.text, ownerUid: u.uid };
      save();
      return { star: { ...star }, code };
    },
    async getStar(id) { const s = db.stars[id]; return s ? { ...s } : null; },
    async getText(id) { const t = db.texts[id]; return t ? t.text : null; },
    async getSealed(code) {
      const d = db.sealed[code]; if (!d) throw err('not-found');
      const u = me();
      if (d.unlockAt && d.unlockAt > Date.now() && !(u && u.uid === d.ownerUid)) throw err('locked');
      return { ...d };
    },
    async listMine() {
      const u = needAuth();
      return {
        stars: Object.values(db.stars).filter(s => s.ownerUid === u.uid && !s.removed).map(s => ({ ...s })),
        sealed: Object.values(db.sealed).filter(s => s.ownerUid === u.uid).map(s => ({ ...s })),
      };
    },
    async twinkle(starId) {
      const u = needAuth(); db.by[starId] = db.by[starId] || {};
      if (db.by[starId][u.uid]) throw err('already', 'You already sent a twinkle to this star.');
      db.by[starId][u.uid] = 1; db.boosts[starId] = (db.boosts[starId] || 0) + 1; save(); return db.boosts[starId];
    },
    async myTwinkle(starId) { const u = me(); return !!(u && db.by[starId] && db.by[starId][u.uid]); },
    async setGranted(starId, v) {
      const u = needAuth(); const s = db.stars[starId]; if (!s || s.ownerUid !== u.uid) throw err('denied');
      s.granted = !!v; s.updatedAt = Date.now(); save();
    },
    async deleteWish(starId, code) {
      const u = needAuth(); const s = db.stars[starId]; if (!s || s.ownerUid !== u.uid) throw err('denied');
      s.removed = true; s.preview = ''; s.updatedAt = Date.now(); delete db.texts[starId]; if (code) delete db.sealed[code]; save();
    },
    async addConstellation(a, b, name) {
      const u = needAuth(); const id = rid('c_'), now = Date.now();
      db.cons[id] = { id, a, b, name: (name || '').trim().slice(0, 60), ownerUid: u.uid, createdAt: now, updatedAt: now }; save();
    },

    // ── private replies & notifications ──
    async sendReply({ toUid, starId, text, cat }) {
      const u = needAuth(); const id = rid('i_');
      db.inbox[id] = { id, type: 'reply', toUid, fromUid: u.uid, fromName: u.name, starId, text, cat, read: false, createdAt: Date.now() }; save();
    },
    async noteOpened({ toUid, starId, code }) {
      const u = me(); if (!u || u.uid === toUid) return;
      const id = `open_${code}_${u.uid}`; if (db.inbox[id]) return;
      db.inbox[id] = { id, type: 'opened', toUid, fromUid: u.uid, fromName: u.name, starId, text: '', cat: '', read: false, createdAt: Date.now() }; save();
    },
    async markRead(ids) { const u = needAuth(); for (const id of [].concat(ids)) { const i = db.inbox[id]; if (i && i.toUid === u.uid) i.read = true; } save(); },
    async recordReceived({ code, starId, ownerName, forName }) {
      const u = me(); if (!u) return; const id = `${u.uid}_${code}`; if (db.received[id]) return;
      db.received[id] = { id, uid: u.uid, code, starId, ownerName, forName: forName || '', createdAt: Date.now() }; save();
    },
    async listReceived() { const u = me(); if (!u) return []; return Object.values(db.received).filter(r => r.uid === u.uid).sort((a, b) => b.createdAt - a.createdAt); },
    async report(starId, reason) { const u = needAuth(); const id = rid('r_'); db.reports[id] = { id, starId, reason, by: u.uid, createdAt: Date.now() }; save(); },
  };
}
