// The sky engine: one <canvas>, pannable + zoomable, culled with a spatial grid so 10 000+ stars stay smooth.
import { CATS, CAT_KEYS, clamp, lerp, hashStr, mulberry32 } from './util.js';
import { BODIES, WORLD } from './world.js';
import { samplePos } from './wishgen.js';
import { glowSprite, planetSprite, nebulaTexture, starLayer } from './sprites.js';

const CELL = 160, GOFF = 40;
const ZMIN = 0.1, ZMAX = 4.5;
const TAU = Math.PI * 2;
const cellKey = (cx, cy) => (cx + GOFF) * 1000 + (cy + GOFF);
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Sky {
  constructor(canvas, hooks = {}) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.hooks = hooks;
    this.cam = { x: 0, y: 0, z: 0.5 };
    this.W = 0; this.H = 0; this.dpr = 1;
    this.stars = []; this.byId = new Map(); this.grid = new Map(); this.real = [];
    this.boost = new Map(); this.cons = []; this.replyCount = new Map();
    this.filter = null;
    this.parts = []; this.rings = []; this.streaks = []; this.shots = [];
    this.selectedId = null; this.pulseId = null; this.wotdId = null; this.hoverId = null; this.connectFrom = null;
    this.pointer = { x: 0, y: 0, in: false };
    this.tl = null; this.tw = null; this.vel = { x: 0, y: 0 };
    this.idle = false; this.idleBase = { x: 0, y: 0, z: 0.5 };
    this.wishStreaks = false; this.nextDecor = 2; this.nextWish = 14;
    this.t = 0; this.last = 0; this.userMoved = false; this.running = true;

    // sprites
    this.glow = {}; this.planets = {};
    for (const k of CAT_KEYS) {
      this.glow[k] = glowSprite(CATS[k].rgb);
      if (CATS[k].kind !== 'star') this.planets[k] = [0, 1, 2].map(v => planetSprite(CATS[k].kind, v));
    }
    this.white = glowSprite('255,255,255');
    this.nebula = nebulaTexture();
    this.layers = [{ c: starLayer(260, 7, 0.9), par: 0.04 }, { c: starLayer(150, 8, 1.2), par: 0.09 }, { c: starLayer(70, 9, 1.6), par: 0.17 }];

    // decorative bodies
    const r = mulberry32(99);
    this.galaxies = Array.from({ length: 8 }, (_, i) => {
      const a = r() * TAU, d = 3300 + r() * 1100;
      return { x: Math.cos(a) * d, y: Math.sin(a) * d, rot: r() * TAU, a: 150 + r() * 160, b: 40 + r() * 70, hue: ['150,170,255', '255,190,150', '210,160,255', '170,230,255'][i % 4] };
    });
    this.craters = Array.from({ length: 9 }, () => ({ x: (r() - 0.5) * 1.3, y: (r() - 0.5) * 1.3, r: 0.07 + r() * 0.15 }));
    this.bhParts = Array.from({ length: 110 }, () => ({ a: r() * TAU, r: 1.3 + r() * 4.6, s: 0.6 + r() * 0.8 }));

    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { this.last = 0; });
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  // ───────────── data ─────────────
  setGenerated(a) {
    const n = a.count;
    for (let i = 0; i < n; i++) {
      const s = { id: 'g' + i, i, gen: true, x: a.x[i], y: a.y[i], cat: CAT_KEYS[a.cat[i]], size: a.size[i], t: a.t[i], seed: (Math.imul(i + 1, 2654435761)) >>> 0 };
      this.addStar(s);
    }
    this.generatedCount = n;
  }
  // The 65 hand-written public wishes. Deterministic spots so every visitor sees them in the same place.
  setCurated(list) {
    const rng = mulberry32(0xC0FFEE);
    list.forEach((w, i) => {
      let best = null, bd = -1;
      for (let k = 0; k < 80; k++) {
        const p = samplePos(rng, 1700);
        if (!p.ok) continue;
        let ok = true;
        for (const key in BODIES) { const b = BODIES[key]; if (Math.hypot(p.x - b.x, p.y - b.y) < b.excl + 30) ok = false; }
        if (!ok) continue;
        const d = this.nearestStar(p.x, p.y);
        if (d > bd) { bd = d; best = p; }
        if (d > 60) break;
      }
      best = best || { x: 650 + rng() * 400, y: 650 + rng() * 400 };
      const t = Date.UTC(2026, 8, 1) + Math.floor(i * 24 * 3600e3 * 0.4);
      this.addStar({ id: 'c' + i, gen: true, cur: true, text: w.text, x: best.x, y: best.y, cat: w.cat, size: 1.25 + rng() * 0.5, t, seed: (Math.imul(i + 7, 2654435761)) >>> 0 });
    });
    this.curatedCount = list.length;
  }
  addStar(s) {
    const idx = this.stars.length;
    this.stars.push(s); this.byId.set(s.id, s);
    const k = cellKey(Math.floor(s.x / CELL), Math.floor(s.y / CELL));
    let arr = this.grid.get(k); if (!arr) this.grid.set(k, arr = []);
    arr.push(idx);
  }
  upsert(d) {
    const ex = this.byId.get(d.id);
    if (ex) {
      Object.assign(ex, d, { t: d.createdAt || ex.t });
      return ex;
    }
    const s = { ...d, sealed: d.kind === 'sealed', t: d.createdAt || Date.now(), seed: hashStr(d.id) };
    this.addStar(s); this.real.push(s);
    return s;
  }
  upsertMany(list) {
    for (const d of list) {
      const s = this.upsert(d);
      s.sealed = s.kind === 'sealed';
      if (d.removed) { s.removed = true; }
    }
  }
  setBoosts(obj) { for (const k in obj) this.boost.set(k, obj[k]); }
  setConstellations(list) { this.cons = list; }
  setReplyCounts(m) { this.replyCount = m; }
  setFilter(f) { this.filter = f; }
  count() { let n = 0; for (const s of this.stars) if (!s.removed) n++; return n; }
  matches(s) {
    const f = this.filter; if (!f) return true;
    if (f.cats && f.cats.size && !f.cats.has(s.cat)) return false;
    if (f.mine && s.ownerUid !== f.mine) return false;
    if (f.ids && !f.ids.has(s.id)) return false;
    return true;
  }
  visible(s) {
    if (s.hidden || s.removed) return false;
    if (this.tl && s.t > this.tl.cutoff) return false;
    return true;
  }

  // New real wishes get a spot with breathing room, away from the Sun, Moon and Black Hole.
  pickSpot() {
    let best = null, bd = -1;
    for (let k = 0; k < 40; k++) {
      const p = samplePos(Math.random, 2600);
      if (!p.ok || Math.hypot(p.x - BODIES.sun.x, p.y - BODIES.sun.y) < BODIES.sun.excl + 20) continue;
      let ok = true;
      for (const key in BODIES) { const b = BODIES[key]; if (Math.hypot(p.x - b.x, p.y - b.y) < b.excl + 20) ok = false; }
      if (!ok) continue;
      const d = this.nearestStar(p.x, p.y);
      if (d > bd) { bd = d; best = p; }
      if (d > 70) break;
    }
    return best || { x: 700 + Math.random() * 400, y: 700 + Math.random() * 400 };
  }
  nearestStar(x, y) {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); let best = 999;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const cell = this.grid.get(cellKey(cx + i, cy + j)); if (!cell) continue;
      for (const idx of cell) { const s = this.stars[idx]; const d = Math.hypot(s.x - x, s.y - y); if (d < best) best = d; }
    }
    return best;
  }

  // ───────────── camera ─────────────
  resize() {
    const r = this.c.getBoundingClientRect();
    this.W = r.width || innerWidth; this.H = r.height || innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.c.width = Math.round(this.W * this.dpr); this.c.height = Math.round(this.H * this.dpr);
    const g = this.g;
    this.bg = g.createRadialGradient(this.W * 0.5, this.H * 0.42, 0, this.W * 0.5, this.H * 0.42, Math.max(this.W, this.H) * 0.8);
    this.bg.addColorStop(0, '#0b1030'); this.bg.addColorStop(0.55, '#060822'); this.bg.addColorStop(1, '#02030b');
  }
  toScreen(x, y) { return { x: (x - this.cam.x) * this.cam.z + this.W / 2, y: (y - this.cam.y) * this.cam.z + this.H / 2 }; }
  toWorld(sx, sy) { return { x: this.cam.x + (sx - this.W / 2) / this.cam.z, y: this.cam.y + (sy - this.H / 2) / this.cam.z }; }
  screenOf(s) { return this.toScreen(s.x, s.y); }
  clampCam() {
    const L = WORLD.R + 300;
    this.cam.x = clamp(this.cam.x, -L, L); this.cam.y = clamp(this.cam.y, -L, L); this.cam.z = clamp(this.cam.z, ZMIN, ZMAX);
  }
  zoomAt(sx, sy, f) {
    const w = this.toWorld(sx, sy);
    this.cam.z = clamp(this.cam.z * f, ZMIN, ZMAX);
    this.cam.x = w.x - (sx - this.W / 2) / this.cam.z; this.cam.y = w.y - (sy - this.H / 2) / this.cam.z;
    this.clampCam();
  }
  zoomBy(f) { this.tw = null; this.zoomAt(this.W / 2, this.H / 2, f); }
  flyTo(x, y, z, dur = 1.3) {
    this.idle = false;
    this.tw = { sx: this.cam.x, sy: this.cam.y, sz: this.cam.z, ex: x, ey: y, ez: clamp(z, ZMIN, ZMAX), t0: this.t, dur };
  }
  homeZoom() { return clamp(Math.min(this.W, this.H) / 1500, 0.34, 0.9); }
  homeView() { this.flyTo(0, 0, this.homeZoom(), 1.4); }
  universeView() { this.flyTo(0, 0, Math.max(ZMIN, Math.min(this.W, this.H) / 8600), 1.8); }
  setIdle(on) { this.idle = on; this.idleBase = { x: this.cam.x, y: this.cam.y, z: this.cam.z }; }

  // ───────────── input ─────────────
  bindInput() {
    const c = this.c, pts = new Map();
    let drag = null, pinch = null;
    const rel = e => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      const p = rel(e); pts.set(e.pointerId, p);
      this.tw = null; this.idle = false; this.vel = { x: 0, y: 0 };
      if (pts.size === 1) drag = { sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false, t: performance.now() };
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        if (drag) drag.moved = true;
      }
    });
    c.addEventListener('pointermove', e => {
      const p = rel(e); this.pointer = { x: p.x, y: p.y, in: true };
      if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.cam.x -= (mx - pinch.mx) / this.cam.z; this.cam.y -= (my - pinch.my) / this.cam.z;
        if (pinch.d > 0) this.zoomAt(mx, my, d / pinch.d);
        pinch = { d, mx, my }; this.clampCam(); return;
      }
      if (drag && pts.size === 1) {
        const dx = p.x - drag.lx, dy = p.y - drag.ly;
        if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 6) drag.moved = true;
        if (drag.moved) {
          this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z;
          this.vel = { x: -dx / this.cam.z * 60, y: -dy / this.cam.z * 60 }; this.clampCam();
          this.hooks.onHover && this.hooks.onHover(null);
        }
        drag.lx = p.x; drag.ly = p.y;
      } else if (e.pointerType === 'mouse') {
        const s = this.pick(p.x, p.y);
        const body = s ? null : this.pickBody(p.x, p.y);
        const id = s ? s.id : null;
        if (id !== this.hoverId) this.hoverId = id;
        c.style.cursor = (s || body || this.nearStreak(p.x, p.y)) ? 'pointer' : (this.connectFrom ? 'crosshair' : 'grab');
        this.hooks.onHover && this.hooks.onHover(s, p.x, p.y, body);
      }
    });
    const up = e => {
      const p = rel(e); pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (drag && pts.size === 0) {
        const wasTap = !drag.moved && performance.now() - drag.t < 600;
        drag = null;
        if (wasTap) this.handleTap(p.x, p.y);
      } else if (pts.size === 1) { const [only] = [...pts.values()]; drag = { sx: only.x, sy: only.y, lx: only.x, ly: only.y, moved: true, t: 0 }; }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', e => { pts.delete(e.pointerId); drag = null; pinch = null; });
    c.addEventListener('pointerleave', () => { this.pointer.in = false; this.hoverId = null; this.hooks.onHover && this.hooks.onHover(null); });
    c.addEventListener('wheel', e => {
      e.preventDefault(); this.tw = null; this.idle = false;
      const p = rel(e); this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0017)));
    }, { passive: false });
    c.addEventListener('dblclick', e => { const p = rel(e); const w = this.toWorld(p.x, p.y); this.flyTo(w.x, w.y, this.cam.z * 2, 0.7); });
  }

  handleTap(sx, sy) {
    if (this.tryCatch(sx, sy)) return;
    const s = this.pick(sx, sy);
    if (s) return this.hooks.onTap && this.hooks.onTap({ type: 'star', star: s }, sx, sy);
    const body = this.pickBody(sx, sy);
    if (body) return this.hooks.onTap && this.hooks.onTap({ type: 'body', key: body }, sx, sy);
    this.hooks.onTap && this.hooks.onTap(null, sx, sy);
  }

  screenR(s) {
    const z = this.cam.z;
    return CATS[s.cat].kind === 'star' ? Math.max(0.9, 2.5 * s.size * Math.pow(z, 0.55)) : Math.max(2.6, 8.6 * s.size * Math.pow(z, 0.5));
  }
  pick(sx, sy) {
    const z = this.cam.z, w = this.toWorld(sx, sy), reach = 30 / z;
    const x0 = Math.floor((w.x - reach) / CELL), x1 = Math.floor((w.x + reach) / CELL), y0 = Math.floor((w.y - reach) / CELL), y1 = Math.floor((w.y + reach) / CELL);
    let best = null, bd = 1e9;
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const cell = this.grid.get(cellKey(cx, cy)); if (!cell) continue;
      for (const idx of cell) {
        const s = this.stars[idx];
        if (!this.visible(s) || !this.matches(s)) continue;
        const d = Math.hypot((s.x - w.x) * z, (s.y - w.y) * z);
        const hr = Math.max(13, this.screenR(s) * 1.7 + 5);
        if (d < hr && d < bd) { best = s; bd = d; }
      }
    }
    return best;
  }
  pickBody(sx, sy) {
    for (const k in BODIES) {
      const b = BODIES[k], p = this.toScreen(b.x, b.y);
      if (Math.hypot(p.x - sx, p.y - sy) < b.r * this.cam.z * 1.25 + 10) return k;
    }
    return null;
  }

  // ───────────── effects ─────────────
  burst(wx, wy, rgb, n = 90) {
    if (reduceMotion) n = Math.min(n, 25);
    for (let i = 0; i < n && this.parts.length < 900; i++) {
      const a = Math.random() * TAU, sp = 40 + Math.random() * 260;
      this.parts.push({ x: wx, y: wy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, l: 0.7 + Math.random() * 1.1, m: 1.8, s: 1 + Math.random() * 2.4, rgb });
    }
    this.rings.push({ x: wx, y: wy, t0: this.t, rgb });
  }
  // A shooting star that streaks across the screen to a world point. Used for launching wishes and replies.
  shoot({ to, rgb = '255,220,150', star = null, onArrive = null, dur = 2.1 }) {
    const W = this.W, H = this.H;
    const side = Math.random() < 0.5;
    const A = side ? { x: -80, y: H * (0.05 + Math.random() * 0.35) } : { x: W * (0.1 + Math.random() * 0.4), y: -80 };
    const T = this.toScreen(to.x, to.y);
    const mx = (A.x + T.x) / 2, my = (A.y + T.y) / 2, dx = T.x - A.x, dy = T.y - A.y, len = Math.hypot(dx, dy) || 1;
    const C = { x: mx - dy / len * len * 0.28, y: my + dx / len * len * 0.28 };
    this.shots.push({ A, C, to, rgb, star, onArrive, t0: this.t, dur, trail: [] });
    if (star) star.hidden = true;
  }
  updateShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i], p = clamp((this.t - sh.t0) / sh.dur, 0, 1), e = Math.pow(p, 1.5);
      const T = this.toScreen(sh.to.x, sh.to.y), u = 1 - e;
      const hx = u * u * sh.A.x + 2 * u * e * sh.C.x + e * e * T.x, hy = u * u * sh.A.y + 2 * u * e * sh.C.y + e * e * T.y;
      sh.head = { x: hx, y: hy };
      sh.trail.push({ x: hx, y: hy }); if (sh.trail.length > 46) sh.trail.shift();
      const w = this.toWorld(hx, hy);
      if (!reduceMotion) for (let k = 0; k < 2 && this.parts.length < 900; k++) this.parts.push({ x: w.x, y: w.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, l: 0.5 + Math.random() * 0.6, m: 1.1, s: 0.8 + Math.random() * 1.6, rgb: sh.rgb });
      if (p >= 1) {
        this.shots.splice(i, 1);
        this.burst(sh.to.x, sh.to.y, sh.rgb, sh.star ? 110 : 50);
        if (sh.star) { sh.star.hidden = false; sh.star.born = this.t; }
        if (sh.onArrive) sh.onArrive();
        this.hooks.onArrive && this.hooks.onArrive(sh);
      }
    }
  }

  // Random ambient streaks; occasionally one carries a real wish you can catch.
  updateStreaks(dt) {
    this.nextDecor -= dt;
    if (this.nextDecor <= 0 && !reduceMotion) { this.spawnStreak(null); this.nextDecor = 4 + Math.random() * 7; }
    if (this.wishStreaks) {
      this.nextWish -= dt;
      if (this.nextWish <= 0 && !reduceMotion && this.stars.length) {
        let s = null;
        for (let k = 0; k < 14; k++) { const c = this.stars[Math.floor(Math.random() * this.stars.length)]; if (c && !c.removed && !c.sealed && !c.hidden) { s = c; break; } }
        if (s) this.spawnStreak(s);
        this.nextWish = 28 + Math.random() * 22;
      }
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.l -= dt;
      s.trail.push({ x: s.x, y: s.y }); if (s.trail.length > 24) s.trail.shift();
      if (s.l <= 0) { this.streaks.splice(i, 1); if (s.wish && this.hooks.onWishStreak) this.hooks.onWishStreak(null); }
    }
  }
  spawnStreak(wish) {
    const W = this.W, H = this.H, a = 0.35 + Math.random() * 0.5, dir = Math.random() < 0.5 ? 1 : -1;
    const sp = wish ? 290 : 520 + Math.random() * 360;
    const s = { x: dir > 0 ? -60 : W + 60, y: Math.random() * H * 0.55, vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp, l: wish ? 7.5 : 1.6 + Math.random(), trail: [], wish };
    this.streaks.push(s);
    if (wish && this.hooks.onWishStreak) this.hooks.onWishStreak(wish);
  }
  nearStreak(sx, sy) { return this.streaks.find(s => s.wish && Math.hypot(s.x - sx, s.y - sy) < 52); }
  tryCatch(sx, sy) { const s = this.nearStreak(sx, sy); if (s) { this.catchStreak(s); return true; } return false; }
  catchStreak(s) {
    if (!s) s = this.streaks.find(q => q.wish);
    if (!s) return;
    const w = this.toWorld(s.x, s.y); this.burst(w.x, w.y, CATS[s.wish.cat].rgb, 60);
    this.streaks.splice(this.streaks.indexOf(s), 1);
    if (this.hooks.onWishStreak) this.hooks.onWishStreak(null);
    this.hooks.onCatch && this.hooks.onCatch(s.wish);
  }

  // ───────────── time-lapse ─────────────
  startTimelapse() {
    let a = Infinity, b = -Infinity;
    for (const s of this.stars) if (!s.removed) { if (s.t < a) a = s.t; if (s.t > b) b = s.t; }
    this.tl = { p: 0, dur: 22, playing: true, tMin: a, tMax: b, cutoff: a };
    this.universeView();
  }
  pauseTimelapse(v) { if (this.tl) this.tl.playing = v === undefined ? !this.tl.playing : v; }
  seekTimelapse(p) { if (this.tl) { this.tl.p = clamp(p, 0, 1); this.tl.cutoff = this.tl.tMin + this.tl.p * (this.tl.tMax - this.tl.tMin); } }
  stopTimelapse() { this.tl = null; }

  // ───────────── main loop ─────────────
  frame(ts) {
    requestAnimationFrame(this.frame);
    const t = ts / 1000;
    if (document.hidden) { this.last = 0; return; }
    const dt = this.last ? Math.min(0.05, t - this.last) : 0.016;
    this.last = t; this.t = t;
    this.update(dt); this.draw(t);
  }
  update(dt) {
    const cam = this.cam;
    if (this.tw) {
      const w = this.tw, p = clamp((this.t - w.t0) / w.dur, 0, 1), e = ease(p);
      cam.x = lerp(w.sx, w.ex, e); cam.y = lerp(w.sy, w.ey, e);
      cam.z = Math.exp(lerp(Math.log(w.sz), Math.log(w.ez), e));
      if (p >= 1) this.tw = null;
    } else if (this.idle && !reduceMotion) {
      const b = this.idleBase;
      cam.x = b.x + Math.sin(this.t * 0.045) * 420; cam.y = b.y + Math.cos(this.t * 0.037) * 260; cam.z = b.z * (1 + Math.sin(this.t * 0.05) * 0.06);
    } else if (Math.abs(this.vel.x) + Math.abs(this.vel.y) > 1) {
      cam.x += this.vel.x * dt; cam.y += this.vel.y * dt; this.vel.x *= 0.93; this.vel.y *= 0.93; this.clampCam();
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= 0.985; p.l -= dt;
      if (p.l <= 0) this.parts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) if (this.t - this.rings[i].t0 > 1.5) this.rings.splice(i, 1);
    this.updateShots(dt); this.updateStreaks(dt);
    if (this.tl && this.tl.playing) {
      this.tl.p += dt / this.tl.dur;
      if (this.tl.p >= 1) { this.tl.p = 1; this.tl.playing = false; this.hooks.onTimelapse && this.hooks.onTimelapse({ done: true }); }
      this.tl.cutoff = this.tl.tMin + this.tl.p * (this.tl.tMax - this.tl.tMin);
    }
    if (this.tl && this.hooks.onTimelapse && (this._tlTick = (this._tlTick || 0) + dt) > 0.1) { this._tlTick = 0; this.hooks.onTimelapse({ date: this.tl.cutoff, p: this.tl.p, playing: this.tl.playing }); }
  }

  draw(t) {
    const g = this.g, W = this.W, H = this.H, z = this.cam.z, cam = this.cam, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = this.bg; g.fillRect(0, 0, W, H);

    // parallax nebula + star dust layers
    g.globalCompositeOperation = 'lighter';
    this.tile(this.nebula, 0.12, 2.3, 0.9);
    for (const L of this.layers) this.tile(L.c, L.par, 1, 0.9);
    g.globalCompositeOperation = 'source-over';

    this.drawGalaxies(t);
    this.drawBlackHole(t);
    this.drawSun(t);
    this.drawMoon(t);
    this.drawConstellations(t);

    // stars & planets (culled by grid)
    const tl0 = this.toWorld(-40, -40), br0 = this.toWorld(W + 40, H + 40);
    const x0 = Math.floor(tl0.x / CELL), x1 = Math.floor(br0.x / CELL), y0 = Math.floor(tl0.y / CELL), y1 = Math.floor(br0.y / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const cell = this.grid.get(cellKey(cx, cy)); if (!cell) continue;
      for (let k = 0; k < cell.length; k++) this.drawStar(this.stars[cell[k]], t);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    this.drawMarkers(t);
    this.drawFx(t);
  }

  tile(img, par, scale, alpha) {
    const g = this.g, tile = img.width * scale, cam = this.cam;
    const ox = (((-cam.x * cam.z * par) % tile) + tile) % tile, oy = (((-cam.y * cam.z * par) % tile) + tile) % tile;
    g.globalAlpha = alpha;
    for (let x = ox - tile; x < this.W; x += tile) for (let y = oy - tile; y < this.H; y += tile) g.drawImage(img, x, y, tile, tile);
    g.globalAlpha = 1;
  }

  drawGalaxies() {
    const g = this.g, z = this.cam.z;
    g.globalCompositeOperation = 'lighter';
    // galactic core haze
    const c0 = this.toScreen(0, 0), R = 1500 * z;
    if (c0.x > -R && c0.x < this.W + R && c0.y > -R && c0.y < this.H + R) {
      const gr = g.createRadialGradient(c0.x, c0.y, 0, c0.x, c0.y, R);
      gr.addColorStop(0, 'rgba(255,200,130,0.22)'); gr.addColorStop(0.35, 'rgba(255,140,90,0.08)'); gr.addColorStop(1, 'rgba(255,120,80,0)');
      g.fillStyle = gr; g.fillRect(c0.x - R, c0.y - R, R * 2, R * 2);
    }
    for (const q of this.galaxies) {
      const p = this.toScreen(q.x, q.y), a = q.a * z;
      if (p.x < -a || p.x > this.W + a || p.y < -a || p.y > this.H + a) continue;
      g.save(); g.translate(p.x, p.y); g.rotate(q.rot); g.scale(1, q.b / q.a);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, a);
      gr.addColorStop(0, `rgba(${q.hue},0.55)`); gr.addColorStop(0.25, `rgba(${q.hue},0.22)`); gr.addColorStop(1, `rgba(${q.hue},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, a, 0, TAU); g.fill();
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
  }

  drawSun(t) {
    const g = this.g, b = BODIES.sun, z = this.cam.z, p = this.toScreen(b.x, b.y), R = b.r * z;
    if (p.x < -R * 5 || p.x > this.W + R * 5 || p.y < -R * 5 || p.y > this.H + R * 5) return;
    g.globalCompositeOperation = 'lighter';
    const cor = g.createRadialGradient(p.x, p.y, R * 0.7, p.x, p.y, R * 4.4);
    cor.addColorStop(0, 'rgba(255,205,100,0.6)'); cor.addColorStop(0.25, 'rgba(255,140,50,0.22)'); cor.addColorStop(1, 'rgba(255,100,30,0)');
    g.fillStyle = cor; g.beginPath(); g.arc(p.x, p.y, R * 4.4, 0, TAU); g.fill();
    const n = 22;
    for (let k = 0; k < n; k++) {
      const a = k * TAU / n + t * 0.025, len = R * (1.7 + 0.55 * Math.sin(t * 0.9 + k * 1.9)), w = 0.07;
      const gr = g.createLinearGradient(p.x, p.y, p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
      gr.addColorStop(0, 'rgba(255,210,120,0.28)'); gr.addColorStop(1, 'rgba(255,170,60,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(p.x + Math.cos(a - w) * R * 0.9, p.y + Math.sin(a - w) * R * 0.9);
      g.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len); g.lineTo(p.x + Math.cos(a + w) * R * 0.9, p.y + Math.sin(a + w) * R * 0.9); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    const d = g.createRadialGradient(p.x - R * 0.2, p.y - R * 0.2, R * 0.05, p.x, p.y, R);
    d.addColorStop(0, '#fffbe2'); d.addColorStop(0.45, '#ffd45e'); d.addColorStop(0.85, '#ff9a2b'); d.addColorStop(1, '#ff6a12');
    g.fillStyle = d; g.beginPath(); g.arc(p.x, p.y, R, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 6; k++) {
      const a = t * 0.07 + k * 1.1, rr = R * (0.25 + 0.5 * ((k * 37) % 10) / 10);
      g.fillStyle = 'rgba(255,240,170,0.14)'; g.beginPath(); g.ellipse(p.x + Math.cos(a) * rr, p.y + Math.sin(a * 1.3) * rr * 0.8, R * 0.2, R * 0.08, a, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    this.label(b.label, p.x, p.y + R * 1.5 + 14);
  }

  drawMoon(t) {
    const g = this.g, b = BODIES.moon, z = this.cam.z, bob = Math.sin(t * 0.4) * 5, p = this.toScreen(b.x, b.y + bob), R = b.r * z;
    if (p.x < -R * 4 || p.x > this.W + R * 4 || p.y < -R * 4 || p.y > this.H + R * 4) return;
    g.globalCompositeOperation = 'lighter';
    const gl = g.createRadialGradient(p.x, p.y, R * 0.8, p.x, p.y, R * 3);
    gl.addColorStop(0, 'rgba(200,215,255,0.22)'); gl.addColorStop(1, 'rgba(200,215,255,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(p.x, p.y, R * 3, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.save(); g.beginPath(); g.arc(p.x, p.y, R, 0, TAU); g.clip();
    const d = g.createRadialGradient(p.x - R * 0.35, p.y - R * 0.35, R * 0.1, p.x, p.y, R * 1.1);
    d.addColorStop(0, '#f6f8ff'); d.addColorStop(0.6, '#bcc4dc'); d.addColorStop(1, '#6f7898');
    g.fillStyle = d; g.fillRect(p.x - R, p.y - R, R * 2, R * 2);
    for (const c of this.craters) {
      g.fillStyle = 'rgba(70,80,110,0.22)'; g.beginPath(); g.arc(p.x + c.x * R, p.y + c.y * R, c.r * R, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1; g.beginPath(); g.arc(p.x + c.x * R - c.r * R * 0.1, p.y + c.y * R - c.r * R * 0.1, c.r * R, 0, TAU); g.stroke();
    }
    // slowly cycling phase
    const ph = (t / 70) % 1, off = Math.cos(ph * TAU) * R * 1.55;
    g.fillStyle = 'rgba(3,5,18,0.84)'; g.beginPath(); g.arc(p.x + off, p.y, R * 1.02, 0, TAU); g.fill();
    g.restore();
    this.label(b.label, p.x, p.y + R + 16);
  }

  drawBlackHole(t) {
    const g = this.g, b = BODIES.blackhole, z = this.cam.z, p = this.toScreen(b.x, b.y), R = b.r * z;
    if (p.x < -R * 8 || p.x > this.W + R * 8 || p.y < -R * 8 || p.y > this.H + R * 8) return;
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(p.x, p.y, R, p.x, p.y, R * 6);
    halo.addColorStop(0, 'rgba(255,150,60,0.28)'); halo.addColorStop(0.4, 'rgba(160,70,255,0.1)'); halo.addColorStop(1, 'rgba(120,60,255,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(p.x, p.y, R * 6, 0, TAU); g.fill();
    const tilt = -0.28;
    const diskHalf = (front) => {
      g.save(); g.translate(p.x, p.y); g.rotate(tilt); g.scale(1, 0.17);
      let st = 'rgba(255,150,60,0.7)';
      if (g.createConicGradient) {
        const cg = g.createConicGradient(t * 0.6, 0, 0);   // one side brighter, like Doppler beaming
        cg.addColorStop(0, 'rgba(255,236,190,0.95)'); cg.addColorStop(0.2, 'rgba(255,150,50,0.8)'); cg.addColorStop(0.5, 'rgba(170,50,20,0.32)');
        cg.addColorStop(0.8, 'rgba(255,130,40,0.7)'); cg.addColorStop(1, 'rgba(255,236,190,0.95)');
        st = cg;
      }
      g.strokeStyle = st;
      for (const [rr, lw, al] of [[2.7, 0.14, 0.45], [2.25, 0.24, 0.7], [1.85, 0.2, 0.9], [1.5, 0.1, 1]]) {
        g.globalAlpha = (front ? 0.8 : 1) * al; g.lineWidth = R * lw; g.beginPath();
        if (front) g.arc(0, 0, R * rr, 0, Math.PI); else g.arc(0, 0, R * rr, Math.PI, Math.PI * 2);
        g.stroke();
      }
      g.restore(); g.globalAlpha = 1;
    };
    diskHalf(false);
    // the far side of the disk bent up over the top of the horizon, and a fainter arc underneath (gravitational lensing)
    g.save(); g.translate(p.x, p.y); g.rotate(tilt * 0.25); g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,170,90,0.28)'; g.lineWidth = Math.max(2, R * 0.55);
    g.beginPath(); g.arc(0, 0, R * 1.42, Math.PI * 1.04, Math.PI * 1.96); g.stroke();
    g.strokeStyle = 'rgba(255,205,140,0.8)'; g.lineWidth = Math.max(1.2, R * 0.1);
    g.beginPath(); g.arc(0, 0, R * 1.3, Math.PI * 1.06, Math.PI * 1.94); g.stroke();
    g.strokeStyle = 'rgba(255,150,80,0.38)'; g.lineWidth = Math.max(1, R * 0.12);
    g.beginPath(); g.arc(0, 0, R * 1.24, Math.PI * 0.14, Math.PI * 0.86); g.stroke();
    g.restore();
    // infalling dust
    const sz = Math.max(1, 1.4 * Math.sqrt(z) + 0.4);
    for (const q of this.bhParts) {
      q.a += (1.6 / Math.pow(q.r, 1.5)) * q.s * 0.016; q.r -= 0.0016 * q.s;
      if (q.r < 1.12) { q.r = 4 + Math.random() * 2.5; q.a = Math.random() * TAU; }
      const sy = Math.sin(q.a);
      if (sy < 0 && q.r < 1.5) continue;
      const lx = Math.cos(q.a) * q.r * R, ly = sy * q.r * R * 0.2;
      const x = p.x + lx * Math.cos(tilt) - ly * Math.sin(tilt), y = p.y + lx * Math.sin(tilt) + ly * Math.cos(tilt);
      g.fillStyle = `rgba(255,${180 + (q.r < 2 ? 60 : 0)},110,${Math.min(0.9, 1.2 / q.r)})`;
      g.fillRect(x, y, sz, sz);
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000'; g.beginPath(); g.arc(p.x, p.y, R, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,215,160,0.8)'; g.lineWidth = Math.max(0.8, R * 0.05); g.beginPath(); g.arc(p.x, p.y, R * 1.01, 0, TAU); g.stroke();
    g.globalCompositeOperation = 'lighter';
    diskHalf(true);
    g.globalCompositeOperation = 'source-over';
    this.label(b.label, p.x, p.y + R * 2.6 + 12);
  }

  label(txt, x, y) {
    if (this.cam.z < 0.3) return;
    const g = this.g; g.font = '600 10px "DM Sans", system-ui, sans-serif'; g.textAlign = 'center';
    g.globalAlpha = clamp((this.cam.z - 0.3) * 2, 0, 0.7); g.fillStyle = '#cdd6ff';
    g.fillText(txt.toUpperCase().split('').join(' '), x, y); g.globalAlpha = 1;
  }

  drawConstellations(t) {
    if (!this.cons.length && !this.connectFrom) return;
    const g = this.g, z = this.cam.z;
    g.lineWidth = Math.max(0.8, 1.1 * Math.sqrt(z)); g.setLineDash([5, 7]); g.lineDashOffset = -t * 6;
    for (const c of this.cons) {
      const a = this.byId.get(c.a), b = this.byId.get(c.b); if (!a || !b || a.removed || b.removed) continue;
      const pa = this.toScreen(a.x, a.y), pb = this.toScreen(b.x, b.y);
      if ((pa.x < 0 && pb.x < 0) || (pa.x > this.W && pb.x > this.W) || (pa.y < 0 && pb.y < 0) || (pa.y > this.H && pb.y > this.H)) continue;
      g.strokeStyle = 'rgba(170,205,255,0.5)'; g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
    }
    g.setLineDash([]);
    if (z > 0.55) {
      g.font = 'italic 12px Fraunces, Georgia, serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(190,215,255,0.8)';
      for (const c of this.cons) {
        if (!c.name) continue; const a = this.byId.get(c.a), b = this.byId.get(c.b); if (!a || !b) continue;
        const m = this.toScreen((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (m.x > 0 && m.x < this.W && m.y > 0 && m.y < this.H) g.fillText(c.name, m.x, m.y - 6);
      }
    }
    if (this.connectFrom && this.pointer.in) {
      const pa = this.toScreen(this.connectFrom.x, this.connectFrom.y);
      g.strokeStyle = 'rgba(255,225,150,0.7)'; g.setLineDash([3, 6]); g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(this.pointer.x, this.pointer.y); g.stroke(); g.setLineDash([]);
    }
  }

  drawStar(s, t) {
    if (s.hidden || s.removed) return;
    const g = this.g, z = this.cam.z, cat = CATS[s.cat];
    const sx = (s.x - this.cam.x) * z + this.W / 2, sy = (s.y - this.cam.y) * z + this.H / 2;
    if (sx < -60 || sx > this.W + 60 || sy < -60 || sy > this.H + 60) return;
    let pop = 1;
    if (this.tl) {
      const age = (this.tl.cutoff - s.t) / Math.max(1, this.tl.tMax - this.tl.tMin);
      if (age < 0) return;
      if (age < 0.03) pop = easeOutBack(age / 0.03);
    }
    if (s.born !== undefined) {
      const p = (t - s.born) / 0.9;
      if (p < 1) pop = p <= 0 ? 0 : easeOutBack(p); else s.born = undefined;
    }
    if (pop <= 0.01) return;
    const a = this.matches(s) ? 1 : 0.1;
    const bc = this.boost.get(s.id) || 0, bs = 1 + Math.min(Math.sqrt(bc), 8) * 0.14;
    g.globalCompositeOperation = 'lighter';
    if (cat.kind === 'star') {
      const rs = Math.max(0.9, 2.5 * s.size * Math.pow(z, 0.55)) * bs * pop;
      const tw = 0.74 + 0.26 * Math.sin(t * (1.1 + (s.seed % 9) * 0.23) + s.seed);
      const gr = rs * (z < 0.25 ? 4.5 : 7.5) * (bc ? 1 + Math.min(bc, 12) * 0.03 : 1);
      g.globalAlpha = a * tw * 0.92; g.drawImage(this.glow[s.cat], sx - gr, sy - gr, gr * 2, gr * 2);
      if (z >= 0.2) {
        g.globalAlpha = a; g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, rs * 0.55, 0, TAU); g.fill();
        if (rs > 2.3 && z > 0.4) {
          const L = rs * 3.4 * tw; g.globalAlpha = a * 0.5 * tw; g.fillStyle = `rgb(${cat.rgb})`;
          g.fillRect(sx - L, sy - 0.5, L * 2, 1); g.fillRect(sx - 0.5, sy - L, 1, L * 2);
        }
      }
    } else {
      const rp = Math.max(2.6, 8.6 * s.size * Math.pow(z, 0.5)) * bs * pop;
      if (z < 0.3) {   // far away a planet is just a coloured glow — keeps the zoomed-out galaxy clean
        const gr = Math.max(3, rp * 1.9); g.globalAlpha = a * 0.95; g.drawImage(this.glow[s.cat], sx - gr, sy - gr, gr * 2, gr * 2);
      } else {
        g.globalAlpha = a * 0.7; const gr = rp * 3.4; g.drawImage(this.glow[s.cat], sx - gr, sy - gr, gr * 2, gr * 2);
        const spr = this.planets[s.cat][s.seed % 3], k = rp / spr.R;
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = a;
        g.drawImage(spr.c, sx - 128 * k, sy - 128 * k, 256 * k, 256 * k);
      }
    }
    // status overlays
    if (s.granted || s.sealed) {
      const r0 = (cat.kind === 'star' ? Math.max(0.9, 2.5 * s.size * Math.pow(z, 0.55)) : Math.max(2.6, 8.6 * s.size * Math.pow(z, 0.5))) * pop;
      g.globalCompositeOperation = 'lighter';
      if (s.granted) {
        const pr = r0 * (3.4 + 0.5 * Math.sin(t * 2 + s.seed)); g.globalAlpha = a * 0.55; g.drawImage(this.glow.dreams, sx - pr * 2, sy - pr * 2, pr * 4, pr * 4);
        g.globalAlpha = a * (0.55 + 0.3 * Math.sin(t * 2)); g.strokeStyle = '#ffd479'; g.lineWidth = 1.4; g.beginPath(); g.arc(sx, sy, pr, 0, TAU); g.stroke();
      }
      if (s.sealed) {
        g.globalAlpha = a * 0.7; g.strokeStyle = `rgb(${cat.rgb})`; g.lineWidth = 1; g.setLineDash([2, 3]); g.lineDashOffset = -t * 4;
        g.beginPath(); g.arc(sx, sy, r0 * 3 + 2, 0, TAU); g.stroke(); g.setLineDash([]);
      }
    }
  }

  // selection, hover, friend pulse, wish-of-the-day spotlight, reply satellites
  drawMarkers(t) {
    const g = this.g, z = this.cam.z;
    const at = id => { const s = id && this.byId.get(id); if (!s || s.hidden || s.removed) return null; const p = this.toScreen(s.x, s.y); return { s, p, r: this.screenR(s) }; };
    g.globalCompositeOperation = 'lighter';
    const w = at(this.wotdId);
    if (w && (!this.tl)) {
      const R = Math.max(40, w.r * 9);
      const gr = g.createRadialGradient(w.p.x, w.p.y, 0, w.p.x, w.p.y, R * 2.4);
      gr.addColorStop(0, 'rgba(255,240,190,0.42)'); gr.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(w.p.x, w.p.y, R * 2.4, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,225,150,0.7)'; g.lineWidth = 1.2; g.setLineDash([4, 6]); g.lineDashOffset = t * 8;
      g.beginPath(); g.arc(w.p.x, w.p.y, R * (0.55 + 0.04 * Math.sin(t * 2)), 0, TAU); g.stroke(); g.setLineDash([]);
      if (z > 0.3) { g.globalCompositeOperation = 'source-over'; g.font = '600 10px "DM Sans", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffe9a8'; g.fillText('★ WISH OF THE DAY', w.p.x, w.p.y - R * 0.7 - 6); g.globalCompositeOperation = 'lighter'; }
    }
    const pu = at(this.pulseId);
    if (pu) {
      for (let k = 0; k < 3; k++) {
        const ph = ((t * 0.7 + k / 3) % 1), r = (14 + ph * 70) * Math.max(0.8, Math.sqrt(z));
        g.strokeStyle = `rgba(${CATS[pu.s.cat].rgb},${(1 - ph) * 0.85})`; g.lineWidth = 2; g.beginPath(); g.arc(pu.p.x, pu.p.y, r, 0, TAU); g.stroke();
      }
    }
    const sel = at(this.selectedId);
    if (sel) {
      const r = Math.max(16, sel.r * 3.6);
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.3; g.setLineDash([5, 5]); g.lineDashOffset = -t * 10;
      g.beginPath(); g.arc(sel.p.x, sel.p.y, r, 0, TAU); g.stroke(); g.setLineDash([]);
    }
    const ho = at(this.hoverId);
    if (ho && ho.s.id !== this.selectedId) {
      g.strokeStyle = `rgba(${CATS[ho.s.cat].rgb},0.9)`; g.lineWidth = 1.5; g.beginPath(); g.arc(ho.p.x, ho.p.y, Math.max(12, ho.r * 3), 0, TAU); g.stroke();
    }
    // private reply satellites orbiting the owner's stars
    if (this.replyCount.size) {
      for (const [id, n] of this.replyCount) {
        const q = at(id); if (!q) continue;
        const orb = Math.max(16, q.r * 4.2);
        for (let k = 0; k < Math.min(n, 6); k++) {
          const a = t * 0.9 + k * TAU / Math.min(n, 6);
          g.fillStyle = 'rgba(140,230,255,0.95)'; g.beginPath(); g.arc(q.p.x + Math.cos(a) * orb, q.p.y + Math.sin(a) * orb, 2.2, 0, TAU); g.fill();
          g.globalAlpha = 0.35; g.drawImage(this.glow.travel, q.p.x + Math.cos(a) * orb - 9, q.p.y + Math.sin(a) * orb - 9, 18, 18); g.globalAlpha = 1;
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  drawFx(t) {
    const g = this.g, z = this.cam.z;
    g.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const s = this.toScreen(p.x, p.y); const al = clamp(p.l / p.m, 0, 1);
      g.globalAlpha = al; g.fillStyle = `rgb(${p.rgb})`;
      const r = p.s * Math.max(0.8, Math.sqrt(z)); g.beginPath(); g.arc(s.x, s.y, r, 0, TAU); g.fill();
    }
    for (const r of this.rings) {
      const age = this.t - r.t0, s = this.toScreen(r.x, r.y);
      g.globalAlpha = clamp(1 - age / 1.5, 0, 1) * 0.8; g.strokeStyle = `rgb(${r.rgb})`; g.lineWidth = 2.2;
      g.beginPath(); g.arc(s.x, s.y, age * 230 * Math.max(0.7, Math.sqrt(z)), 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
    // launching streaks
    for (const sh of this.shots) this.trail(sh.trail, sh.rgb, 3.4, true);
    for (const st of this.streaks) {
      const rgb = st.wish ? CATS[st.wish.cat].rgb : '210,225,255';
      this.trail(st.trail, rgb, st.wish ? 2.6 : 1.5, !!st.wish, st.wish ? 1 : 0.55);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  trail(pts, rgb, w, head, alpha = 1) {
    if (pts.length < 2) return;
    const g = this.g; g.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const k = i / pts.length;
      g.globalAlpha = k * k * alpha; g.strokeStyle = `rgb(${rgb})`; g.lineWidth = w * k;
      g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke();
    }
    if (head) {
      const h = pts[pts.length - 1]; g.globalAlpha = alpha;
      g.drawImage(this.white, h.x - 22, h.y - 22, 44, 44);
      g.drawImage(this.glow[CAT_KEYS.find(k => CATS[k].rgb === rgb) || 'dreams'], h.x - 30, h.y - 30, 60, 60);
    }
  }
}
