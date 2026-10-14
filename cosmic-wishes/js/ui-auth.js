// Sign-in / create-account modal. requireAuth() resolves with the user (or null if dismissed).
import { ctx } from './ctx.js';
import { esc } from './util.js';
import { openModal, $, toast } from './ui-core.js';

export function requireAuth(reason = 'to continue') {
  if (ctx.user) return Promise.resolve(ctx.user);
  return new Promise((resolve) => {
    let done = false, mode = 'signup';
    const google = ctx.store.mode === 'firebase';
    const m = openModal(`
      <h2 id="au-title">Join the sky</h2>
      <p class="sub" id="au-sub">Create a free account ${esc(reason)}. It keeps your wishes together and lets friends reply to you.</p>
      <div class="tabs" role="tablist"><button data-m="signup" class="on">Create account</button><button data-m="signin">Sign in</button></div>
      ${google ? `<button class="btn ghost" id="au-google" style="width:100%">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
        Continue with Google</button><div class="divider">or with email</div>` : ''}
      <form id="au-form" novalidate>
        <label class="field" id="au-name-f"><span>Your name</span><input class="input" id="au-name" autocomplete="name" placeholder="What should we call you?"></label>
        <label class="field"><span>Email</span><input class="input" id="au-email" type="email" autocomplete="email" placeholder="you@example.com"></label>
        <label class="field"><span>Password</span><input class="input" id="au-pw" type="password" autocomplete="current-password" placeholder="At least 6 characters"></label>
        <div class="error" id="au-err"></div>
        <button class="btn primary" id="au-go" type="submit" style="width:100%">Create account</button>
      </form>
      ${ctx.store.mode === 'local' ? `<p class="sub" style="margin:14px 0 0;font-size:12px">Demo mode: accounts live only in this browser.</p>` : ''}
    `, { onClose: () => { if (!done) resolve(null); } });
    const el = m.el;
    const setMode = (mm) => {
      mode = mm;
      el.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.m === mm));
      $('#au-name-f', el).hidden = mm !== 'signup';
      $('#au-go', el).textContent = mm === 'signup' ? 'Create account' : 'Sign in';
      $('#au-title', el).textContent = mm === 'signup' ? 'Join the sky' : 'Welcome back';
      $('#au-pw', el).autocomplete = mm === 'signup' ? 'new-password' : 'current-password';
      $('#au-err', el).textContent = '';
    };
    el.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
    const finish = (u) => { done = true; ctx.user = u; m.close(); toast(`Welcome, ${u.name} ✨`, 'ok'); resolve(u); };
    const fail = (e, btn) => { $('#au-err', el).textContent = e.message || 'Something went wrong.'; if (btn) btn.disabled = false; };
    $('#au-form', el).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = $('#au-go', el); btn.disabled = true; $('#au-err', el).textContent = '';
      const email = $('#au-email', el).value, pw = $('#au-pw', el).value, name = $('#au-name', el).value;
      try { finish(mode === 'signup' ? await ctx.store.signUp(email, pw, name) : await ctx.store.signIn(email, pw)); } catch (e) { fail(e, btn); }
    });
    const g = $('#au-google', el);
    if (g) g.addEventListener('click', async () => { try { finish(await ctx.store.signInGoogle()); } catch (e) { fail(e); } });
    setMode('signup');
  });
}
