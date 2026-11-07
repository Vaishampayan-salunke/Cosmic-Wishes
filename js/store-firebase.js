// LIVE data layer on Firebase (Auth + Firestore, free Spark plan). Same interface as store-local.js.
//
// Read-quota friendly design: star stubs, twinkle counts and constellations are synced INCREMENTALLY —
// each visitor caches what they have in localStorage and only downloads documents changed since their last visit.
// Full wish text for public wishes lives in `texts/{id}` and is fetched only when a star is opened;
// sealed wishes live in `sealed/{code}` where `code` is an unguessable 80-bit secret (the private link).
import { genCode } from './util.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, updateProfile, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, onSnapshot,
  query, where, serverTimestamp, increment, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const FRIENDLY = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email — create one instead.',
  'auth/email-already-in-use': 'That email already has an account — sign in instead.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email.',
  'auth/popup-closed-by-user': 'Sign-in window was closed.',
  'auth/cancelled-popup-request': 'Sign-in window was closed.',
  'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and try again.',
  'auth/unauthorized-domain': 'This website address is not authorised in Firebase yet (Authentication → Settings → Authorized domains).',
  'auth/operation-not-allowed': 'This sign-in method is not enabled in the Firebase console yet.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network problem. Check your connection and try again.',
};
const wrapAuth = (e) => Object.assign(new Error(FRIENDLY[e.code] || e.message || 'Something went wrong.'), { code: e.code });
const err = (code, message) => Object.assign(new Error(message || code), { code });

export default async function createFirebaseStore(cfg) {
  const app = initializeApp(cfg.firebase);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  const pid = cfg.firebase.projectId;
  const ms = (v) => (v && typeof v.toMillis === 'function') ? v.toMillis() : (typeof v === 'number' ? v : null);
  const dd = (snap) => snap.data({ serverTimestamps: 'estimate' });
  const authSubs = new Set();
  const curUser = () => auth.currentUser;
  const me = () => { const u = curUser(); return u ? { uid: u.uid, name: u.displayName || (u.email || '').split('@')[0] || 'Stargazer', email: u.email || '' } : null; };
  const needAuth = () => { const u = me(); if (!u) throw err('auth', 'Please sign in first.'); return u; };
  const emitAuth = () => authSubs.forEach(cb => cb(me()));
  onAuthStateChanged(auth, emitAuth);

  const stubOf = (id, d) => ({
    id, ownerUid: d.ownerUid, name: '', forName: d.forName || '', cat: d.cat, x: d.x, y: d.y, size: d.size, kind: d.kind,
    preview: d.preview || '', unlockAt: ms(d.unlockAt), granted: !!d.granted, removed: !!d.removed, createdAt: ms(d.createdAt), updatedAt: ms(d.updatedAt),
  });

  // generic incremental synchroniser with a localStorage cache
  function incremental(colName, mapFn, onItems) {
    const KEY = `cw_c_${colName}_${pid}_v1`;
    let cache = { last: 0, items: {} };
    try { const raw = JSON.parse(localStorage.getItem(KEY)); if (raw && raw.items) cache = raw; } catch { /* ignore */ }
    let timer = null;
    const persist = () => { clearTimeout(timer); timer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* quota: fine */ } }, 1500); };
    const first = Object.values(cache.items);
    if (first.length) onItems(first);
    const since = Timestamp.fromMillis(Math.max(0, (cache.last || 0) - 60000));
    const q = query(collection(db, colName), where('updatedAt', '>', since));
    return onSnapshot(q, (snap) => {
      const out = [];
      snap.docChanges().forEach((ch) => {
        if (ch.type === 'removed') return;
        const item = mapFn(ch.doc.id, dd(ch.doc));
        out.push(item); cache.items[item.id] = item;
        if (!ch.doc.metadata.hasPendingWrites && item.updatedAt) cache.last = Math.max(cache.last || 0, item.updatedAt);
      });
      if (out.length) { onItems(out); persist(); }
    }, (e) => console.warn(`[cosmic] ${colName} sync failed:`, e.code || e.message));
  }

  return {
    mode: 'firebase',

    // ── auth ──
    onAuth(cb) { authSubs.add(cb); cb(me()); return () => authSubs.delete(cb); },
    async signInGoogle() { try { await signInWithPopup(auth, new GoogleAuthProvider()); return me(); } catch (e) { throw wrapAuth(e); } },
    async signUp(email, pw, name) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, String(email || '').trim(), pw);
        await updateProfile(cred.user, { displayName: (name || '').trim() || String(email).split('@')[0] });
        emitAuth(); return me();
      } catch (e) { throw wrapAuth(e); }
    },
    async signIn(email, pw) { try { await signInWithEmailAndPassword(auth, String(email || '').trim(), pw); return me(); } catch (e) { throw wrapAuth(e); } },
    async signOut() { await signOut(auth); },
    async setName(name) { const u = curUser(); if (!u) throw err('auth'); await updateProfile(u, { displayName: name.trim() || u.displayName }); emitAuth(); },

    // ── live data ──
    subscribeStars(cb) { return incremental('stars', stubOf, cb); },
    subscribeBoosts(cb) {
      return incremental('boosts', (id, d) => ({ id, count: d.count || 0, updatedAt: ms(d.updatedAt) }), (items) => {
        const o = {}; items.forEach(i => { o[i.id] = i.count; }); cb(o);
      });
    },
    subscribeConstellations(cb) {
      return incremental('constellations', (id, d) => ({ id, a: d.a, b: d.b, name: d.name || '', ownerUid: d.ownerUid, createdAt: ms(d.createdAt), updatedAt: ms(d.updatedAt) }), cb);
    },
    subscribeInbox(cb) {
      const u = me(); if (!u) { cb({ received: [], sent: [] }); return () => {}; }
      const rec = new Map(), sent = new Map();
      const map = (id, d) => ({ id, type: d.type, toUid: d.toUid, fromUid: d.fromUid, fromName: d.fromName || '', starId: d.starId, text: d.text || '', cat: d.cat || '', read: !!d.read, createdAt: ms(d.createdAt) || Date.now() });
      const push = () => cb({
        received: [...rec.values()].sort((a, b) => b.createdAt - a.createdAt),
        sent: [...sent.values()].sort((a, b) => b.createdAt - a.createdAt),
      });
      const un1 = onSnapshot(query(collection(db, 'inbox'), where('toUid', '==', u.uid)), (s) => { s.forEach(x => rec.set(x.id, map(x.id, dd(x)))); push(); }, (e) => console.warn('[cosmic] inbox(to):', e.code));
      const un2 = onSnapshot(query(collection(db, 'inbox'), where('fromUid', '==', u.uid)), (s) => { s.forEach(x => sent.set(x.id, map(x.id, dd(x)))); push(); }, (e) => console.warn('[cosmic] inbox(from):', e.code));
      return () => { un1(); un2(); };
    },

    // ── wishes ──
    async createWish(d) {
      const u = needAuth();
      const id = doc(collection(db, 'stars')).id;
      const sealed = !!d.sealed, kind = sealed ? 'sealed' : 'public';
      const unlock = d.unlockAt ? Timestamp.fromMillis(d.unlockAt) : null;
      const batch = writeBatch(db);
      batch.set(doc(db, 'stars', id), {
        ownerUid: u.uid, name: '', forName: sealed ? '' : (d.forName || ''), cat: d.cat, x: d.x, y: d.y, size: d.size, kind,
        preview: sealed ? '' : d.text.slice(0, 140), unlockAt: unlock, granted: false, removed: false,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      let code = null;
      if (sealed) {
        code = genCode();
        batch.set(doc(db, 'sealed', code), { starId: id, ownerUid: u.uid, ownerName: d.name, forName: d.forName || '', cat: d.cat, text: d.text, unlockAt: unlock, createdAt: serverTimestamp() });
      } else {
        batch.set(doc(db, 'texts', id), { ownerUid: u.uid, text: d.text });
      }
      await batch.commit();
      const now = Date.now();
      return {
        code,
        star: { id, ownerUid: u.uid, name: '', forName: sealed ? '' : (d.forName || ''), cat: d.cat, x: d.x, y: d.y, size: d.size, kind, preview: sealed ? '' : d.text.slice(0, 140), unlockAt: d.unlockAt || null, granted: false, removed: false, createdAt: now, updatedAt: now },
      };
    },
    async getStar(id) { const s = await getDoc(doc(db, 'stars', id)); return s.exists() ? stubOf(s.id, dd(s)) : null; },
    async getText(id) { const s = await getDoc(doc(db, 'texts', id)); return s.exists() ? dd(s).text : null; },
    async getSealed(code) {
      let s;
      try { s = await getDoc(doc(db, 'sealed', code)); } catch (e) { if (e.code === 'permission-denied') throw err('locked'); throw e; }
      if (!s.exists()) throw err('not-found');
      const d = dd(s);
      return { code, starId: d.starId, ownerUid: d.ownerUid, ownerName: d.ownerName, forName: d.forName || '', cat: d.cat, text: d.text, unlockAt: ms(d.unlockAt), createdAt: ms(d.createdAt) };
    },
    async listMine() {
      const u = needAuth();
      const [a, b] = await Promise.all([
        getDocs(query(collection(db, 'stars'), where('ownerUid', '==', u.uid))),
        getDocs(query(collection(db, 'sealed'), where('ownerUid', '==', u.uid))),
      ]);
      const stars = [], sealed = [];
      a.forEach(x => { const s = stubOf(x.id, dd(x)); if (!s.removed) stars.push(s); });
      b.forEach(x => { const d = dd(x); sealed.push({ code: x.id, starId: d.starId, ownerUid: d.ownerUid, ownerName: d.ownerName, forName: d.forName || '', cat: d.cat, text: d.text, unlockAt: ms(d.unlockAt), createdAt: ms(d.createdAt) }); });
      return { stars, sealed };
    },
    async twinkle(starId) {
      const u = needAuth();
      const batch = writeBatch(db);
      batch.set(doc(db, 'boosts', starId, 'by', u.uid), { createdAt: serverTimestamp() });
      batch.set(doc(db, 'boosts', starId), { count: increment(1), updatedAt: serverTimestamp() }, { merge: true });
      try { await batch.commit(); } catch (e) { if (e.code === 'permission-denied') throw err('already', 'You already sent a twinkle to this star.'); throw e; }
    },
    async myTwinkle(starId) { const u = me(); if (!u) return false; try { return (await getDoc(doc(db, 'boosts', starId, 'by', u.uid))).exists(); } catch { return false; } },
    async setGranted(starId, v) { needAuth(); await updateDoc(doc(db, 'stars', starId), { granted: !!v, updatedAt: serverTimestamp() }); },
    async deleteWish(starId, code) {
      needAuth();
      const batch = writeBatch(db);
      batch.update(doc(db, 'stars', starId), { removed: true, preview: '', updatedAt: serverTimestamp() });
      if (code) batch.delete(doc(db, 'sealed', code)); else batch.delete(doc(db, 'texts', starId));
      await batch.commit();
    },
    async addConstellation(a, b, name) {
      const u = needAuth();
      await setDoc(doc(collection(db, 'constellations')), { a, b, name: (name || '').trim().slice(0, 60), ownerUid: u.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    },

    // ── private replies & notifications ──
    async sendReply({ toUid, starId, text, cat }) {
      const u = needAuth();
      await setDoc(doc(collection(db, 'inbox')), { type: 'reply', toUid, fromUid: u.uid, fromName: u.name, starId, text, cat: cat || '', read: false, createdAt: serverTimestamp() });
    },
    async noteOpened({ toUid, starId, code }) {
      const u = me(); if (!u || u.uid === toUid) return;
      try { await setDoc(doc(db, 'inbox', `open_${code}_${u.uid}`), { type: 'opened', toUid, fromUid: u.uid, fromName: u.name, starId, text: '', cat: '', read: false, createdAt: serverTimestamp() }); } catch { /* already noted */ }
    },
    async markRead(ids) {
      needAuth(); const batch = writeBatch(db);
      for (const id of [].concat(ids)) batch.update(doc(db, 'inbox', id), { read: true });
      await batch.commit();
    },
    async recordReceived({ code, starId, ownerName, forName }) {
      const u = me(); if (!u) return;
      try { await setDoc(doc(db, 'received', `${u.uid}_${code}`), { uid: u.uid, code, starId, ownerName: ownerName || '', forName: forName || '', createdAt: serverTimestamp() }); } catch { /* already saved */ }
    },
    async listReceived() {
      const u = me(); if (!u) return [];
      const s = await getDocs(query(collection(db, 'received'), where('uid', '==', u.uid)));
      const out = []; s.forEach(x => { const d = dd(x); out.push({ id: x.id, uid: d.uid, code: d.code, starId: d.starId, ownerName: d.ownerName, forName: d.forName, createdAt: ms(d.createdAt) || Date.now() }); });
      return out.sort((a, b) => b.createdAt - a.createdAt);
    },
    async report(starId, reason) { const u = needAuth(); await setDoc(doc(collection(db, 'reports')), { starId, reason, by: u.uid, createdAt: serverTimestamp() }); },
  };
}
