// "Make a wish" form, the launch, and the success / share sheet.
import { ctx, starLink, sealedLink } from './ctx.js';
import { CATS, CAT_KEYS, esc, fmtDateTime, toLocalInput, fmtCode, containsBlocked } from './util.js';
import { openModal, $, $$, toast, copyText } from './ui-core.js';
import { requireAuth } from './ui-auth.js';

const MAX_BYTES = 900000; // Firestore documents are capped at 1 MiB

export function openCreate(prefill = {}) {
  const d = { name: ctx.user ? ctx.user.name : '', text: '', cat: 'dreams', type: 'public', forName: '', sealed: true, unlockAt: null, ...prefill };
  const tomorrow = new Date(Date.now() + 86400000); tomorrow.setHours(9, 0, 0, 0);
  const m = openModal(`
    <h2>Make a wish</h2>
    <p class="sub">It will streak across the sky and settle among everyone else's dreams.</p>
    <label class="field"><span>Your wish</span><textarea class="textarea" id="cw-text" placeholder="Write anything you hope for — there is no length limit."></textarea></label>
    <div class="field"><span>Category — decides your star</span>
      <div class="cat-chips" id="cw-cats">${CAT_KEYS.map(k => `<button type="button" class="cat-chip" data-k="${k}" style="--c:${CATS[k].rgb}"><i></i>${CATS[k].label}</button>`).join('')}</div>
      <div class="cat-hint" id="cw-hint"></div></div>
    <div class="field"><span>Who is it for?</span>
      <div class="seg" id="cw-type">
        <button type="button" data-t="public">🌍 Everyone<small>public sky</small></button>
        <button type="button" data-t="friend">💌 A friend<small>private link</small></button>
        <button type="button" data-t="capsule">🍾 Time capsule<small>opens on a date</small></button>
      </div></div>
    <div id="cw-friend" hidden>
      <label class="field"><span id="cw-for-label">Friend's name</span><input class="input" id="cw-for" maxlength="60" placeholder="Who will read this?"></label>
      <label class="check" id="cw-sealed-row" style="margin:-4px 0 16px"><input type="checkbox" id="cw-sealed"> <span>Keep it sealed — only people with your link can read it</span></label>
    </div>
    <label class="field" id="cw-capsule" hidden><span>Opens on</span><input class="input" id="cw-date" type="datetime-local"></label>
    <div class="cat-hint" id="cw-anon" style="margin:-2px 0 14px"></div>
    <div class="error" id="cw-err" role="alert"></div>
    <div class="actions"><button class="btn ghost" id="cw-cancel" type="button">Cancel</button><button class="btn primary" id="cw-go" type="button">✦ Launch my wish</button></div>
  `);
  const el = m.el;
  $('#cw-text', el).value = d.text; $('#cw-for', el).value = d.forName;
  $('#cw-sealed', el).checked = d.sealed;
  const dateEl = $('#cw-date', el); dateEl.min = toLocalInput(Date.now() + 60000); dateEl.value = toLocalInput(d.unlockAt || tomorrow.getTime());

  const sealedNow = () => d.type === 'capsule' || (d.type === 'friend' && $('#cw-sealed', el).checked);
  const sync = () => {
    $('#cw-anon', el).textContent = sealedNow()
      ? '💌 Only the person with your private link can read this — and only they will see your name on it. The sky just shows an anonymous sealed star.'
      : '🕶️ Anonymous: your name is never shown on a star. Only you can find your own star again (Profile → View in sky).';
    $$('#cw-cats .cat-chip', el).forEach(b => b.classList.toggle('on', b.dataset.k === d.cat));
    $('#cw-hint', el).textContent = `Your wish will glow as a ${CATS[d.cat].object.toLowerCase()}.`;
    $$('#cw-type button', el).forEach(b => b.classList.toggle('on', b.dataset.t === d.type));
    $('#cw-friend', el).hidden = d.type === 'public';
    $('#cw-capsule', el).hidden = d.type !== 'capsule';
    $('#cw-sealed-row', el).hidden = d.type !== 'friend';
    $('#cw-for-label', el).textContent = d.type === 'capsule' ? "Who is it for? (optional — leave empty for yourself)" : "Friend's name";
  };
  $$('#cw-cats .cat-chip', el).forEach(b => b.addEventListener('click', () => { d.cat = b.dataset.k; sync(); }));
  $$('#cw-type button', el).forEach(b => b.addEventListener('click', () => { d.type = b.dataset.t; sync(); }));
  $('#cw-sealed', el).addEventListener('change', sync);
  $('#cw-cancel', el).addEventListener('click', () => m.close());
  sync();
  setTimeout(() => $('#cw-text', el).focus(), 80);

  const err = (t) => { $('#cw-err', el).textContent = t || ''; };
  $('#cw-go', el).addEventListener('click', async () => {
    err('');
    const text = $('#cw-text', el).value.trim(), forName = $('#cw-for', el).value.trim();
    const sealedBox = $('#cw-sealed', el).checked;
    if (!text) return err('Write your wish first — even a few words is enough ✨');
    const isSealed = sealedNow();
    if (d.type === 'friend' && !forName) return err("Add your friend's name.");
    let unlockAt = null;
    if (d.type === 'capsule') {
      unlockAt = new Date(dateEl.value).getTime();
      if (!unlockAt || unlockAt < Date.now() + 30000) return err('Pick a date and time in the future for the bottle to open.');
    }
    const sealed = d.type === 'capsule' || (d.type === 'friend' && sealedBox);
    if (new Blob([text]).size > MAX_BYTES) return err('That wish is longer than the sky can carry (about 900 KB of text). Please trim it a little.');
    if (!sealed && containsBlocked(`${forName} ${text}`, ctx.cfg.BLOCKED_WORDS)) return err('Please keep the public sky kind — remove the harsh words and try again. (Sealed wishes to a friend can say anything.)');
    const cd = (ctx.cfg.POST_COOLDOWN_SECONDS || 0) * 1000;
    let last = 0; try { last = +localStorage.getItem('cw_last_launch') || 0; } catch { /* ignore */ }
    if (cd && Date.now() - last < cd) return err(`Let the last star settle first — try again in ${Math.ceil((cd - (Date.now() - last)) / 1000)}s.`);

    if (ctx.store.problem) return err(ctx.store.problem.message);
    const user = await requireAuth('to launch your wish');
    if (!user) return;
    const name = (user.name || '').trim() || 'A friend';   // your account name — only ever shown to the friend who opens your private link
    const btn = $('#cw-go', el); btn.disabled = true; btn.textContent = 'Launching…';
    try {
      const spot = ctx.sky.pickSpot();
      const res = await ctx.store.createWish({
        name, text, cat: d.cat, type: d.type, forName, sealed, unlockAt, x: spot.x, y: spot.y, size: 0.8 + Math.random() * 0.7,
      });
      try { localStorage.setItem('cw_last_launch', String(Date.now())); } catch { /* ignore */ }
      m.close();
      ctx.A.afterLaunch(res, { type: d.type, sealed, forName, unlockAt, name });
    } catch (e) {
      console.error(e);
      btn.disabled = false; btn.textContent = '✦ Launch my wish';
      err(e.code === 'permission-denied' ? 'The sky said no (permissions). Publish the Firestore rules from the README (Firestore Database → Rules → Publish), then try again.' : (e.message || 'Could not launch — please try again.'));
    }
  });
  return m;
}

export function openSuccess(res, info) {
  const star = res.star, cat = CATS[star.cat], rgb = cat.rgb;
  const sealed = !!res.code;
  const link = sealed ? sealedLink(res.code, star.id) : starLink(star.id);
  let title = 'Your star is born ✨', body = `Your wish is now glowing as a ${cat.object.toLowerCase()}. Anyone can find it — share the link so people can fly straight to it.`;
  let shareMsg = `I just launched a wish into the sky ✨ ${link}`;
  if (info.type === 'friend' && sealed) {
    title = `Your wish for ${esc(info.forName)} is on its way 💌`;
    body = `It's <b>sealed</b>: the sky shows a star, but only someone with this private link can read it. Send it to ${esc(info.forName)} — they can also paste it under <b>Profile → Open a wish</b>.`;
    shareMsg = `${info.name} launched a wish into the stars for you ✨ Open it: ${link}`;
  } else if (info.type === 'friend') {
    title = `Your wish for ${esc(info.forName)} is glowing ✨`;
    body = `It's public in the sky and labelled "for ${esc(info.forName)}". Send them the link so they can fly straight to it.`;
    shareMsg = `A wish was launched into the stars for you ✨ ${link}`;
  } else if (info.type === 'capsule') {
    title = 'Your message in a bottle is floating 🍾';
    body = `It stays sealed until <b>${esc(fmtDateTime(info.unlockAt))}</b> — nobody can read it before then, not even with the link. ${info.forName ? `Send the link to ${esc(info.forName)}.` : 'Keep the link to open it yourself.'}`;
    shareMsg = `${info.name} sealed a message in a bottle for you ✨ It opens ${fmtDateTime(info.unlockAt)}: ${link}`;
  }
  const m = openModal(`
    <div class="center"><div class="success-orb" style="--c:${rgb}"></div></div>
    <h2 class="center">${title}</h2>
    <p class="sub center">${body}</p>
    <div class="copy-row"><input class="input" id="sx-link" readonly value="${esc(link)}"><button class="btn ghost" id="sx-copy">Copy</button></div>
    ${sealed ? `<p class="sub center" style="margin-bottom:12px">Or share just the code: <span class="code-pill">${fmtCode(res.code)}</span></p>` : ''}
    <div class="share-row">
      <button class="btn primary" id="sx-share">Send to a friend</button>
      <a class="btn ghost" id="sx-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(shareMsg)}">WhatsApp</a>
    </div>
    <div class="actions" style="justify-content:space-between;margin-top:16px">
      <button class="btn ghost small" id="sx-another">Make another wish</button>
      <button class="btn ghost small" id="sx-view">View my star</button>
    </div>`);
  const el = m.el;
  $('#sx-copy', el).addEventListener('click', async () => { const ok = await copyText(link); toast(ok ? 'Link copied ✨' : 'Copy failed — select the link and copy it manually.', ok ? 'ok' : 'err'); });
  $('#sx-link', el).addEventListener('focus', (e) => e.target.select());
  $('#sx-share', el).addEventListener('click', async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Cosmic Wishes', text: shareMsg, url: link }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    const ok = await copyText(shareMsg); toast(ok ? 'Message + link copied — paste it to your friend ✨' : 'Copy the link above and send it to your friend.', ok ? 'ok' : '');
  });
  $('#sx-another', el).addEventListener('click', () => { m.close(); openCreate(); });
  $('#sx-view', el).addEventListener('click', () => { m.close(); ctx.A.focusStar(star.id, { open: true }); });
  return m;
}
