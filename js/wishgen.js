// Seeded generator for the pre-existing sky. Nothing here is a hard-coded list of wishes:
// every star's position, category, author and text are *computed* from its index, so every
// visitor sees the exact same sky. Pure ES module — runs in a Web Worker or on the main thread.
import { mulberry32, CAT_KEYS } from './util.js';
import { WORLD, inExclusion } from './world.js';

const gauss = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

// Galaxy-like distribution: spiral arms + halo + a dense core cluster.
export function samplePos(rng, maxR = WORLD.R) {
  const r = rng();
  let x, y;
  if (r < 0.58) {
    const arm = Math.floor(rng() * 4);
    const rad = 360 + Math.pow(rng(), 0.85) * (maxR - 420);
    const ang = arm * Math.PI / 2 + rad * 0.0017 + gauss(rng) * 0.2;
    x = Math.cos(ang) * rad; y = Math.sin(ang) * rad;
  } else if (r < 0.88) {
    const rad = Math.sqrt(rng()) * maxR, ang = rng() * Math.PI * 2;
    x = Math.cos(ang) * rad; y = Math.sin(ang) * rad;
  } else {
    const rad = 300 + Math.abs(gauss(rng)) * 520, ang = rng() * Math.PI * 2;
    x = Math.cos(ang) * rad; y = Math.sin(ang) * rad;
  }
  return { x, y, ok: Math.hypot(x, y) <= maxR };
}

const WEIGHTS = { love: 22, dreams: 20, career: 14, health: 12, travel: 13, friendship: 11, other: 8 };
const CAT_POOL = [];
CAT_KEYS.forEach((k, i) => { for (let n = 0; n < WEIGHTS[k]; n++) CAT_POOL.push(i); });

const CELL = 40;
function nearestDist(grid, x, y) {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  let best = 999;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const pts = grid.get((cx + i) * 100000 + (cy + j));
    if (!pts) continue;
    for (let k = 0; k < pts.length; k += 2) {
      const d = Math.hypot(pts[k] - x, pts[k + 1] - y);
      if (d < best) best = d;
    }
  }
  return best;
}

const T0 = Date.UTC(2025, 0, 1), T1 = Date.UTC(2026, 8, 25);

export function generateAll(count) {
  const rng = mulberry32(0xC0511C);
  const x = new Float32Array(count), y = new Float32Array(count), size = new Float32Array(count);
  const t = new Float64Array(count), cat = new Uint8Array(count);
  const grid = new Map();
  for (let i = 0; i < count; i++) {
    let bx = 0, by = 0, bd = -1, tries = 0;
    while (bd < 0 && tries < 60) {
      for (let k = 0; k < 7; k++) {
        tries++;
        const p = samplePos(rng);
        if (!p.ok || inExclusion(p.x, p.y, 12)) continue;
        const d = nearestDist(grid, p.x, p.y);
        if (d > bd) { bd = d; bx = p.x; by = p.y; }
        if (d > 34) break;
      }
    }
    if (bd < 0) { bx = 900 + rng() * 300; by = 900 + rng() * 300; }
    x[i] = bx; y[i] = by;
    const key = Math.floor(bx / CELL) * 100000 + Math.floor(by / CELL);
    let arr = grid.get(key); if (!arr) grid.set(key, arr = []);
    arr.push(bx, by);
    cat[i] = CAT_POOL[Math.floor(rng() * CAT_POOL.length)];
    size[i] = 0.75 + rng() * 0.75;
    t[i] = T0 + rng() * (T1 - T0);
  }
  return { count, x, y, size, t, cat };
}

// ───────────────────────── text generation (computed on demand) ─────────────────────────
const FIRST = ['Aarav','Ananya','Vihaan','Diya','Aditya','Isha','Rohan','Meera','Kabir','Saanvi','Arjun','Priya','Neha','Rahul','Sneha','Karan','Pooja','Vikram','Aisha','Zoya','Imran','Fatima','Sofia','Lucas','Emma','Liam','Olivia','Noah','Mia','Ethan','Chloe','Mateo','Lucia','Hugo','Camille','Yuki','Haruto','Sakura','Mei','Wei','Jin','Min-jun','Seo-yeon','Amara','Kwame','Zainab','Omar','Layla','Elena','Dmitri','Anya','Ivan','Sven','Freya','Astrid','Ciara','Declan','Isabella','Giovanni','Valentina','Pedro','Camila','Diego','Ximena','Tariq','Noor','Hana','Ravi','Tanvi','Aryan','Kavya','Ishaan','Riya','Dev','Tara','Nikhil','Anika','Yash','Shreya','Harsh','Pranav','Mira','Sahil','Naina','Varun','Trisha','Om','Jiya','Reyansh','Aadhya','Krish','Myra','Atharv','Siya','Leo','Nora','Theo','Ada','Felix','Ines','Malik','Sana'];
const ANON = ['A quiet dreamer', 'Anonymous stargazer', 'Someone under the same sky', 'A night owl', 'A hopeful heart', 'Wandering soul'];

const OPEN = ['', '', '', '', '', 'Dear universe — ', 'Tonight, ', 'One day: ', 'If a star is listening — ', 'Quietly, ', 'Please — ', 'Somewhere out there, ', 'Shooting star, ', 'Before I sleep: '];
const CLOSE = ['', '', '', '', ' Thank you, stars.', " That's all I ask.", ' Please let it come true.', ' I believe it will.', ' Just once.', " I'll keep trying.", ' Even if it takes years.', ' 🌙', ' ✨', ' Hold on to it.', ' Slowly, but surely.'];

const FILL = {
  place: ['Kyoto','Lisbon','Ladakh','Iceland','Santorini','Paris','Bali','Patagonia','Kerala','the Swiss Alps','New Zealand','Marrakech','Istanbul','Machu Picchu','Banff','the Maldives','Rajasthan','Norway','Hampi','Seoul','Cape Town','Prague','Vietnam','Scotland','Tokyo','Goa','Sikkim','Greece'],
  goal: ['opening a tiny bookshop by the sea','performing on a big stage','building an app that helps a million people','becoming a pilot','learning to paint like the old masters','running a marathon','starting an animation studio','making my own film','owning a little house with a garden','speaking on a TED stage','going to space someday','living in a treehouse for a year','learning five languages','teaching kids to code','winning a national hackathon','writing a song that people sing','building a school in my village','starting a café that never closes'],
  role: ['software engineer','doctor','designer','teacher','data scientist','chartered accountant','game developer','researcher','entrepreneur','journalist','architect','pilot','chef','civil servant','machine learning engineer','photographer','lawyer','product manager'],
  exam: ['GATE','UPSC','CAT','JEE','NEET','GRE','my board exams','my semester exams','the final interview round','the coding test','my viva','the entrance test'],
  person: ['my person','the one I keep thinking about','my crush','someone special','the one far away'],
  friend: ['my best friend','my roommate','my oldest friend','my college gang','my school squad','my hostel family'],
  age: ['25','30','21','28','35'],
  dist: ['5 km','10 km','a half marathon','a full marathon'],
};

const CORE = {
  love: [
    'I wish to find someone who makes ordinary Tuesdays feel like magic.',
    'May {person} finally see how much they mean to me.',
    'I wish my parents grow old together, healthy and laughing at the same old jokes.',
    'I hope {person} texts me first tonight.',
    'I want a love that feels like home, not a storm.',
    'Let my long-distance love end with us in the same city.',
    'I wish to learn how to love myself the way I love everyone else.',
    'May we always find our way back to each other.',
    'I wish {person} feels the same way I do.',
    "I'd give anything for one more of grandma's hugs.",
    'I wish for a small wedding, a sunset, and every person I love in one place.',
    'May my heart heal, slowly and kindly.',
    "I wish I could say 'I love you' without being afraid.",
    'Let our little family stay together through every season.',
    'I hope {person} knows how proud I am of them.',
    'I wish to be chosen — loudly, openly, every day.',
  ],
  dreams: [
    'I wish to build something that outlives me.',
    'I want to publish my first book before I turn {age}.',
    'May I never stop believing in the strange, wonderful thing I am making.',
    'I dream of {goal}.',
    'Give me the courage to start before I feel ready.',
    'Let this be the year my ideas finally become real.',
    'I hope tomorrow-me is braver than today-me.',
    'I wish to wake up excited about my work every single day.',
    'May all my late nights turn into something beautiful.',
    'One day: {goal}. Please keep the road open for me.',
    'I wish I could show my younger self where I ended up.',
    'I want to try everything at least once and regret nothing.',
    'I wish to be remembered for being kind, not just successful.',
  ],
  career: [
    'I wish to land my first job at a place that believes in me.',
    'Please let this interview go well.',
    'I want to become a {role}.',
    'May my startup survive its first year.',
    'I wish for a promotion that finally matches the work I do.',
    'I hope my results come out in my favour.',
    'Let my placement season end with a great offer.',
    'I wish to crack {exam} in the first attempt.',
    'I want to build a career I am not afraid to wake up to.',
    'May my team ship on time and still be friends afterwards.',
    'I wish to repay my parents for everything they sacrificed.',
    'Let me get through {exam} with a clear head.',
    'I wish to become a {role} someone looks up to.',
    'Please let this project be the one that changes things.',
  ],
  health: [
    'I wish my mother a full, quick recovery.',
    'May my grandfather walk in the garden again.',
    'Let everyone I know be healthy and strong this year.',
    "I wish for peace of mind and a good night's sleep.",
    "I hope my little sister's fever breaks by morning.",
    'Please let the reports come back clear.',
    'I want to feel strong in my own body again.',
    'May my anxiety get a little quieter every day.',
    'I wish to run {dist} without stopping.',
    'I want to eat well, sleep well and laugh more.',
    'Let my dog live a very, very long life.',
    'I wish for more mornings of sunlight and slow walks.',
  ],
  travel: [
    "I wish to see {place} before I'm thirty.",
    'Let me watch the sunrise over {place} with someone I love.',
    'I want to take my parents on their first flight.',
    'I would love to get lost in the streets of {place}.',
    'May my passport run out of pages.',
    'I wish for a road trip with my best friends, windows down, no destination.',
    'I want to see the northern lights at least once.',
    'Take me to the mountains — I want to hear nothing but wind.',
    'I hope to backpack across {place}.',
    'One day I will eat breakfast in {place} and cry from happiness.',
    'I wish for a train window, a cup of chai and nowhere to be.',
  ],
  friendship: [
    'I wish my old friends and I never drift apart.',
    'May I find people who feel like home.',
    'I hope {friend} knows how much their friendship means to me.',
    'Let our group chat never go quiet.',
    'I wish for one more summer with the whole gang.',
    'May I be the kind of friend I always wished I had.',
    'I want to say sorry to someone I hurt.',
    'Please let me make one real friend in my new city.',
    'I wish {friend} gets everything they deserve.',
    'Let us still be laughing at the same jokes when we are old.',
  ],
  other: [
    'I wish the world were a little kinder tomorrow.',
    'May every stray animal find a warm home.',
    'I wish for rain on a hot day and chai at the window.',
    'Let the planet heal, one tree at a time.',
    'I wish for small joys: a good song, a warm meal, an unexpected laugh.',
    'I hope people remember to look up at the sky more often.',
    'I wish I could stop time, just for one afternoon.',
    'May the next generation inherit a cleaner world.',
    'I wish for a quiet mind.',
    'Let this be a good year for everyone reading this.',
    'I wish nobody ate dinner alone tonight.',
  ],
};

function makeName(r) {
  const p = r();
  const first = FIRST[Math.floor(r() * FIRST.length)];
  if (p < 0.42) return first;
  if (p < 0.76) return first + ' ' + String.fromCharCode(65 + Math.floor(r() * 26)) + '.';
  if (p < 0.88) return ANON[Math.floor(r() * ANON.length)];
  return first.toLowerCase() + '_' + (10 + Math.floor(r() * 89));
}

const descCache = new Map();
export function describe(i, catIdx) {
  const key = i * 8 + catIdx;
  const hit = descCache.get(key);
  if (hit) return hit;
  const r = mulberry32(((i + 1) * 2654435761) >>> 0 ^ 0x9e3779b9);
  const pick = a => a[Math.floor(r() * a.length)];
  const cat = CAT_KEYS[catIdx];
  const name = makeName(r);
  let core = pick(CORE[cat]).replace(/\{(\w+)\}/g, (_, k) => pick(FILL[k] || ['…']));
  const open = pick(OPEN);
  if (open.endsWith(', ') && !/^I[ ']/.test(core)) core = core[0].toLowerCase() + core.slice(1);
  const text = (open + core + pick(CLOSE)).replace(/\ba (?=[aeiouAEIOU])/g, 'an ');
  const out = { name, text, cat };
  if (descCache.size > 3000) descCache.clear();
  descCache.set(key, out);
  return out;
}
