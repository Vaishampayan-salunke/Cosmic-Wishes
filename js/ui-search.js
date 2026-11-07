// Search & filter: by name / words / category / "my stars". Matching stars stay bright, the rest dim.
import { ctx } from './ctx.js';
import { CATS, CAT_KEYS, esc } from './util.js';
import { starInfo } from './info.js';
import { $, $$ } from './ui-core.js';

let hay = null, hayCount = 0, activeCats = new Set(), mineOnly = false, query = '', open = false;

export function initSearch() {
  const chips = $('#search-cats');
  chips.innerHTML = CAT_KEYS.map(k => `<button type="button" class="cat-chip" data-k="${k}" style="--c:${CATS[k].rgb}"><i></i>${CATS[k].label}</button>`).join('');
  chips.addEventListener('click', (e) => { const b = e.target.closest('.cat-chip'); if (!b) return; activeCats.has(b.dataset.k) ? activeCats.delete(b.dataset.k) : activeCats.add(b.dataset.k); run(); });
  $('#search-input').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); run(); });
  $('#search-mine').addEventListener('change', async (e) => {
    if (e.target.checked && !ctx.user) { e.target.checked = false; const u = await ctx.A.requireAuth('to see your stars'); if (!u) return; e.target.checked = true; }
    mineOnly = e.target.checked; run();
  });
  $('#search-close').addEventListener('click', closeSearch);
  $('#search-results').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (!b) return; ctx.A.focusStar(b.dataset.id, { open: true }); if (matchMedia('(max-width:760px)').matches) closeSearch(false); });
  $('#filter-chip').addEventListener('click', (e) => { if (e.target.closest('.x')) clearFilter(); });
}

export function isSearchOpen() { return open; }
export function toggleSearch() { open ? closeSearch() : openSearch(); }
export function openSearch() {
  open = true; $('#search-panel').hidden = false; $('#t-search').classList.add('on');
  buildHay(); run(); setTimeout(() => $('#search-input').focus(), 50);
}
export function closeSearch(keepFilter = true) {
  open = false; $('#search-panel').hidden = true; $('#t-search').classList.remove('on');
  if (!keepFilter) clearFilter(); else updateChip();
}
export function clearFilter() {
  activeCats = new Set(); mineOnly = false; query = '';
  $('#search-input').value = ''; $('#search-mine').checked = false;
  ctx.sky.setFilter(null); updateChip(); if (open) run();
}

// Lazily index every star's searchable text (generated text is computed, not stored).
function buildHay() {
  const stars = ctx.sky.stars;
  if (hay && hayCount === stars.length) return;
  hay = new Array(stars.length); hayCount = stars.length;
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i], info = starInfo(s);
    hay[i] = `${info.preview} ${info.forName || ''} ${CATS[s.cat].label}`.toLowerCase();
  }
}

function run() {
  buildHay();
  $$('#search-cats .cat-chip').forEach(b => b.classList.toggle('on', activeCats.has(b.dataset.k)));
  const stars = ctx.sky.stars, ids = new Set(), results = [];
  const filtering = query || activeCats.size || mineOnly;
  if (filtering) {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i]; if (s.removed) continue;
      if (activeCats.size && !activeCats.has(s.cat)) continue;
      if (mineOnly && (!ctx.user || s.ownerUid !== ctx.user.uid)) continue;
      if (query && !hay[i].includes(query)) continue;
      ids.add(s.id); if (results.length < 40) results.push(s);
    }
    ctx.sky.setFilter({ ids: query ? ids : null, cats: activeCats, mine: mineOnly && ctx.user ? ctx.user.uid : null });
  } else ctx.sky.setFilter(null);
  $('#search-count').textContent = filtering ? `${ids.size.toLocaleString()} match${ids.size === 1 ? '' : 'es'}` : 'Type to search the whole sky';
  $('#search-results').innerHTML = results.map(s => {
    const info = starInfo(s);
    return `<li><button data-id="${esc(s.id)}"><span class="r-ico">${CATS[s.cat].icon}</span><span><span class="r-name">${esc(info.name)}</span><span class="r-text" style="display:-webkit-box">${esc(info.preview || (s.kind === 'sealed' ? '🔒 Sealed wish' : ''))}</span></span></button></li>`;
  }).join('');
  updateChip();
}

function updateChip() {
  const chip = $('#filter-chip'), f = ctx.sky.filter;
  if (!f) { chip.hidden = true; return; }
  const parts = [];
  if (query) parts.push(`“${esc(query)}”`);
  if (activeCats.size) parts.push([...activeCats].map(k => CATS[k].label).join(', '));
  if (mineOnly) parts.push('my stars');
  chip.hidden = open; // while the panel is open the panel itself shows the state
  chip.innerHTML = `<span>Showing ${parts.join(' · ')}</span><button class="x" aria-label="Clear filter">✕</button>`;
}
