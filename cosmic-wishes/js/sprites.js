// Everything visual is drawn in code and cached to tiny offscreen canvases — no image files.
import { mulberry32 } from './util.js';

const mk = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export function glowSprite(rgb) {
  const s = 128, c = mk(s), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.07, `rgba(${rgb},0.95)`);
  gr.addColorStop(0.24, `rgba(${rgb},0.36)`);
  gr.addColorStop(0.55, `rgba(${rgb},0.09)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return c;
}

const PALETTES = {
  planet: [
    { hi: '#d9ffe6', mid: '#46e08a', lo: '#12805a', acc: '#b4ffd0', sea: '#2bb8c9' },
    { hi: '#e6ffd0', mid: '#72e85a', lo: '#1f7a2c', acc: '#c8ffa8', sea: '#35bfa0' },
    { hi: '#c8fff4', mid: '#2fe0b0', lo: '#0c6a60', acc: '#a0ffea', sea: '#2294c4' },
  ],
  ring: [
    { hi: '#e4f1ff', mid: '#5cb0ff', lo: '#1e4fb0', acc: '#bfe0ff', ring: '200,228,255' },
    { hi: '#dcf0ff', mid: '#4a9cf5', lo: '#1a46a0', acc: '#b0d4ff', ring: '215,235,255' },
    { hi: '#e4e9ff', mid: '#6d8cff', lo: '#2a3a9a', acc: '#c4d0ff', ring: '196,212,255' },
  ],
};

// Returns { c: canvas(256), R: sphere radius in sprite pixels }
export function planetSprite(kind, variant) {
  const S = 256, C = 128, g0 = mk(S), g = g0.getContext('2d');
  const pal = PALETTES[kind][variant % 3];
  const R = kind === 'ring' ? 56 : 76;
  const rnd = mulberry32(variant * 977 + (kind === 'ring' ? 5 : 11));
  const ring = (front) => {
    g.save(); g.translate(C, C); g.rotate(-0.38);
    const bands = [{ k: 1.55, w: 5, a: 0.5 }, { k: 1.8, w: 10, a: 0.42 }, { k: 2.03, w: 4, a: 0.32 }];
    for (const b of bands) {
      const rx = R * b.k, ry = rx * 0.27;
      g.beginPath();
      if (front) g.ellipse(0, 0, rx, ry, 0, 0, Math.PI); else g.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2);
      g.strokeStyle = `rgba(${pal.ring},${b.a})`; g.lineWidth = b.w; g.stroke();
    }
    g.restore();
  };
  if (kind === 'ring') ring(false);
  // sphere
  g.save();
  g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.clip();
  const base = g.createRadialGradient(C - R * 0.38, C - R * 0.42, R * 0.1, C, C, R * 1.15);
  base.addColorStop(0, pal.hi); base.addColorStop(0.5, pal.mid); base.addColorStop(1, pal.lo);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  if (kind === 'ring') {
    for (let y = -R; y < R; y += 7 + rnd() * 7) {
      g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.12})`;
      g.fillRect(C - R, C + y, R * 2, 3 + rnd() * 5);
      g.fillStyle = `rgba(0,10,60,${0.05 + rnd() * 0.12})`;
      g.fillRect(C - R, C + y + 5, R * 2, 2 + rnd() * 4);
    }
  } else {
    g.fillStyle = pal.sea; g.globalAlpha = 0.28; g.fillRect(0, 0, S, S); g.globalAlpha = 1;
    for (let i = 0; i < 16; i++) {
      g.fillStyle = pal.acc; g.globalAlpha = 0.18 + rnd() * 0.3;
      g.beginPath();
      g.ellipse(C + (rnd() - 0.5) * R * 1.7, C + (rnd() - 0.5) * R * 1.7, R * (0.1 + rnd() * 0.3), R * (0.07 + rnd() * 0.2), rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // soft clouds
    for (let i = 0; i < 7; i++) {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.ellipse(C + (rnd() - 0.5) * R * 1.6, C + (rnd() - 0.5) * R * 1.6, R * 0.34, R * 0.045, rnd() * 0.8, 0, Math.PI * 2); g.fill();
    }
  }
  // night-side shadow
  const sh = g.createRadialGradient(C - R * 0.5, C - R * 0.5, R * 0.55, C + R * 0.2, C + R * 0.2, R * 1.35);
  sh.addColorStop(0, 'rgba(0,0,20,0)'); sh.addColorStop(0.6, 'rgba(0,0,25,0.12)'); sh.addColorStop(1, 'rgba(0,0,25,0.5)');
  g.fillStyle = sh; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const em = g.createRadialGradient(C - R * 0.2, C - R * 0.2, 0, C, C, R);
  em.addColorStop(0, 'rgba(255,255,255,0.22)'); em.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = em; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  g.restore();
  // atmosphere rim
  const rim = g.createRadialGradient(C, C, R * 0.82, C, C, R * 1.2);
  rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(0.45, `${pal.hi}55`); rim.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalCompositeOperation = 'lighter'; g.fillStyle = rim; g.beginPath(); g.arc(C, C, R * 1.2, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
  if (kind === 'ring') ring(true);
  return { c: g0, R };
}

export function nebulaTexture() {
  const S = 1024, c = mk(S), g = c.getContext('2d'), rnd = mulberry32(424242);
  g.globalCompositeOperation = 'lighter';
  const cols = ['110,70,255', '40,150,210', '255,80,150', '70,110,255', '150,60,220'];
  for (let i = 0; i < 16; i++) {
    const x = rnd() * S, y = rnd() * S, r = 160 + rnd() * 300, col = cols[Math.floor(rnd() * cols.length)], a = 0.05 + rnd() * 0.09;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.5, `rgba(${col},${a * 0.4})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  return c;
}

export function starLayer(n, seed, maxR = 1.2) {
  const S = 1024, c = mk(S), g = c.getContext('2d'), rnd = mulberry32(seed);
  const tints = ['255,255,255', '200,220,255', '255,235,210', '220,200,255'];
  for (let i = 0; i < n; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.3 + rnd() * maxR;
    g.fillStyle = `rgba(${tints[Math.floor(rnd() * 4)]},${0.25 + rnd() * 0.65})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return c;
}
