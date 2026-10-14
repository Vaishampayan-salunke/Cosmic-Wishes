// World geometry shared by the generator, the sky engine and placement logic.
export const WORLD = { R: 4200 };

// Celestial bodies. `excl` is the keep-out radius: no wish is ever placed inside it.
export const BODIES = {
  sun:       { key: 'sun',       label: 'The Sun',     x: 0,     y: 0,    r: 100, excl: 270 },
  moon:      { key: 'moon',      label: 'The Moon',    x: 780,   y: -430, r: 46,  excl: 160 },
  blackhole: { key: 'blackhole', label: 'Black Hole',  x: -1850, y: 1150, r: 34,  excl: 230 },
};

export function inExclusion(x, y, pad = 0) {
  for (const k in BODIES) {
    const b = BODIES[k];
    const dx = x - b.x, dy = y - b.y;
    const r = b.excl + pad;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}
