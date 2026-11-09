/* ==========================================================================
   CLUTCH — account.js
   Routes (plain hash names): #login · #signup · #overview · #licenses
   #downloads · #profile · #forum
   Session shape (shared with community.js / admin.js):
     { username, avatar, badges, dob_ok: true, role: 'member'|'founder'|'mod', hideOffTopic?, emailReplies? }
   Prototype: any password is accepted and nothing is sent anywhere.
   ========================================================================== */
(function () {
  'use strict';
  const { esc, toast, openModal, closeModal } = window.Clutch;
  const C = window.CLUTCH_CONFIG || {};
  const DB = window.ClutchDB;
  const F = window.ClutchForum;
  const app = document.getElementById('app');
  const ui = { ageOk: false, signupMsg: '' };   // age-gate result lives only on this page, never stored
  const me = () => F.syncSession();
  const next = () => F.safeNext(F.qs('next'));

  /* ------------------------------ session helpers ------------------------ */
  function startSession(u) {
    DB.set('session', { username: u.username, avatar: u.avatar, badges: u.badges, dob_ok: true, role: u.role || 'member', hideOffTopic: !!u.hideOffTopic, emailReplies: !!u.emailReplies });
    F.decorateHeader();
    const n = next(); if (n) { location.href = n; return; }
    location.hash = '#overview';
  }
  function logout() { DB.remove('session'); toast('Logged out'); const a = document.querySelector('.nav-cta a[href="account.html"]'); if (a) a.textContent = 'Log in'; location.hash = '#login'; route(); }
  function setStatus(id, msg, ok) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.style.color = ok ? 'var(--ok)' : 'var(--danger)'; } }

  /* ------------------------------ auth views ----------------------------- */
  const authTabs = (which) => `<div class="pill-nav auth-tabs" role="tablist" aria-label="Log in or create account"><a href="#login" ${which === 'login' ? 'aria-current="page"' : ''}>Log in</a><a href="#signup" ${which === 'signup' ? 'aria-current="page"' : ''}>Create account</a></div>`;
  const protoLine = () => `<div class="proto-line"><span><strong>Prototype:</strong> demo control, not part of the real site.</span><button type="button" class="btn btn-ghost btn-sm" data-act="founder-login">Log in as founder (Dillon)</button><span>Sets the Founder role so Announcements and the <a href="admin.html">admin dashboard</a> can be demoed.</span></div>`;

  function renderLogin() {
    app.innerHTML = `<div class="auth-wrap">
      <div class="page-head" style="padding-bottom:1rem"><p class="eyebrow">ACCOUNT</p><h1>Log in</h1><p class="muted">For the forum, your license key and downloads. Accounts are for ages 13 and up.</p></div>
      ${authTabs('login')}
      <form class="panel" data-login novalidate>
        <div class="field"><label for="li-user">Username</label><input id="li-user" name="username" autocomplete="username" required maxlength="20" placeholder="pixelpenny"></div>
        <div class="field"><label for="li-pass">Password</label><input id="li-pass" name="password" type="password" autocomplete="current-password" required placeholder="••••••••"><span class="hint dim">Prototype: any password is accepted and nothing is sent anywhere. Real sign-in comes with the backend.</span></div>
        <p class="form-status" aria-live="polite" id="li-status"></p>
        <div class="row"><button class="btn btn-primary" type="submit">Log in</button><a class="btn btn-ghost" href="#signup">Create account</a></div>
      </form>
      ${protoLine()}
    </div>`;
  }

  function renderSignup() {
    const y = new Date().getFullYear();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    let body;
    if (!ui.ageOk) {
      body = `<form class="panel" data-age-gate novalidate>
        <h3 style="margin-top:0">First, when were you born?</h3>
        <p class="muted" style="font-size:.95rem">Clutch community accounts are for ages 13 and up. We use this only to check your age and we don’t store it.</p>
        <div class="age-row">
          <div class="field"><label for="ag-month">Birth month</label><select id="ag-month" name="month" required><option value="">Month</option>${months.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select></div>
          <div class="field"><label for="ag-year">Birth year</label><select id="ag-year" name="year" required><option value="">Year</option>${Array.from({ length: 100 }, (_, i) => `<option value="${y - i}">${y - i}</option>`).join('')}</select></div>
        </div>
        <p class="form-status" aria-live="polite" id="ag-status"></p>
        <div class="row"><button class="btn btn-primary" type="submit">Continue</button><a class="btn btn-ghost" href="#login">I have an account</a></div>
      </form>
      ${ui.signupMsg ? `<div class="notice notice-pink" role="alert"><p>${esc(ui.signupMsg)}</p><p><a href="download.html">Download Clutch</a> · <a href="parents.html">For parents</a></p></div>` : ''}`;
    } else {
      body = `<form class="panel" data-signup novalidate>
        <div class="notice notice-ok" style="margin-top:0"><p>Age check passed. Now pick how you’ll appear.</p></div>
        <div class="field"><label for="su-user">Username</label><input id="su-user" name="username" autocomplete="off" required minlength="3" maxlength="20" placeholder="pixelpenny"><span class="hint">Pick a username, not your real name. Letters, numbers, dots, dashes and underscores.</span></div>
        <div class="field"><label for="su-email">Email</label><input id="su-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"><span class="hint">Shown to no one. Only for password resets and, if you turn it on, reply notifications.</span></div>
        <div class="field"><label for="su-pass">Password</label><input id="su-pass" name="password" type="password" autocomplete="new-password" required minlength="6" placeholder="At least 6 characters"><span class="hint dim">Prototype: not stored or sent anywhere.</span></div>
        <fieldset class="field" style="border:0;padding:0;margin:0 0 1rem"><legend style="font-weight:600;font-size:.95rem;margin-bottom:6px">Pick a pixel avatar</legend>
          <div class="avatar-grid">${Array.from({ length: window.Clutch.AVATARS }, (_, i) => `<label class="avatar-tile"><input type="radio" name="avatar" value="${i}" class="sr-only" ${i === 0 ? 'checked' : ''}>${window.Clutch.pxAvatar(i)}</label>`).join('')}</div>
          <span class="hint">Preset avatars only. No photo uploads, ever.</span></fieldset>
        <label class="check" style="margin-bottom:1rem"><input type="checkbox" name="agree" required> <span>I’ve read and agree to the <a href="guidelines.html">Community Guidelines</a>: be kind, no personal info, no selling or trading, no private messages.</span></label>
        <p class="form-status" aria-live="polite" id="su-status"></p>
        <div class="row"><button class="btn btn-primary" type="submit">Create account</button><a class="btn btn-ghost" href="#login">Cancel</a></div>
      </form>`;
    }
    app.innerHTML = `<div class="auth-wrap">
      <div class="page-head" style="padding-bottom:1rem"><p class="eyebrow">ACCOUNT</p><h1>Create account</h1><p class="muted">Usernames only. We never show real names, photos or locations.</p></div>
      ${authTabs('signup')}${body}
    </div>`;
  }

  /* ------------------------------ logged-in shell ------------------------ */
  const SECTIONS = [['overview', 'Overview'], ['licenses', 'Licenses'], ['downloads', 'Downloads'], ['profile', 'Profile'], ['forum', 'Forum settings']];
  function shell(section, inner) {
    const s = me();
    app.innerHTML = `<div class="page-head" style="padding-bottom:1.25rem"><div class="row between"><div><p class="eyebrow">ACCOUNT</p><h1 style="font-size:clamp(2rem,6vw,3.4rem)">Hi, <span class="grad-text wrap-any">${esc(s.username)}</span></h1></div><button type="button" class="btn btn-ghost btn-sm" data-act="logout">Log out</button></div></div>
    <div class="two-col">
      <nav class="side-nav" aria-label="Account sections">${SECTIONS.map(([k, l]) => `<a href="#${k}" ${k === section ? 'aria-current="page" class="active"' : ''}>${l}</a>`).join('')}${F.isMod(s) ? `<a href="admin.html">Admin dashboard →</a>` : ''}</nav>
      <div>${inner}</div>
    </div>
    ${protoLine()}`;
  }

  function renderOverview() {
    const s = me(), u = F.user(s.username) || s;
    const lic = DB.get('licenses') || [];
    const st = F.userStatus(s.username);
    shell('overview', `<div class="panel me-card">${F.avatar(u, 'avatar-lg')}<div><h1>${esc(s.username)}</h1><div class="row" style="gap:6px">${F.badges(u.badges)}</div><p class="dim" style="margin:.6rem 0 0">Joined ${esc(F.fmtMonth(u.joined))} · ${esc(s.role)}${st.state !== 'ok' ? ` · <span style="color:var(--warn)">${esc(st.label)}</span>` : ''}</p></div></div>
      <div class="grid grid-2" style="margin-top:1.25rem">
        <div class="panel"><h3>Licenses</h3><p class="muted">${lic.length ? `${lic.length} license${lic.length > 1 ? 's' : ''} on this account.` : 'No license yet. Free works without one.'}</p><a class="btn btn-ghost btn-sm" href="#licenses">Open licenses</a></div>
        <div class="panel"><h3>Forum</h3><p class="muted">Post as ${esc(s.username)} with your pixel avatar. No real names, ever.</p><a class="btn btn-ghost btn-sm" href="community.html">Go to the forum</a></div>
      </div>`);
  }

  function renderLicenses() {
    const lic = DB.get('licenses') || [];
    let inner;
    if (!lic.length) {
      inner = `<div class="panel center" style="padding:2.5rem 1.5rem"><p class="eyebrow">NO LICENSE YET</p><h3>Free is free. Pro is one payment.</h3><p class="muted">Clutch Free works with no key at all. Pro unlocks all 48 packs, Aim Lab, the crosshair, macros and family controls for $19.99, once.</p><div class="row" style="justify-content:center"><button class="btn btn-primary" data-buy="pro">Get Pro</button><a class="btn btn-ghost" href="pricing.html">Compare plans</a></div></div>`;
    } else {
      inner = lic.map((l, i) => `<div class="panel lic" style="margin-bottom:1rem">
        <div class="row between"><h3 style="margin:0">${esc(l.plan)}</h3>${l.test ? '<span class="badge badge-dim">test mode</span>' : ''}</div>
        <div class="row-k"><span class="key" id="key-${i}">${esc(l.key)}</span><button type="button" class="btn btn-ghost btn-sm" data-act="copy-key" data-i="${i}">Copy key</button></div>
        <p class="muted" style="margin:0">Activations: <strong>${l.used} of ${l.activations}</strong> PCs in use · bought ${esc(F.fmtDate(l.bought))}</p>
        <div class="row"><button type="button" class="btn btn-ghost btn-sm" data-act="deactivate" data-i="${i}" ${l.used > 0 ? '' : 'disabled'}>Deactivate a PC</button><button type="button" class="btn btn-ghost btn-sm" data-act="activate" data-i="${i}" ${l.used < l.activations ? '' : 'disabled'}>Activate this PC (demo)</button></div>
        <p class="hint dim" style="margin:0">Paste the key in the app under Settings → License. Deactivate a PC you no longer use to free up a slot.</p>
      </div>`).join('');
    }
    shell('licenses', `<h2 style="font-size:1.8rem">Licenses</h2>${inner}`);
  }

  function renderDownloads() {
    shell('downloads', `<h2 style="font-size:1.8rem">Downloads</h2>
      <div class="panel"><h3>Clutch for Windows</h3><p class="muted">Windows 10 and 11. Free to start; your license key unlocks Pro inside the app.</p>
        <div class="row"><a class="btn btn-primary" data-download href="${esc(C.DOWNLOAD_URL || '#')}">${window.Clutch.pxIcon('download', 'ico')} Download installer</a><a class="btn btn-ghost" data-releases href="${esc(C.RELEASES_URL || '#')}" rel="noopener">All releases</a></div>
        <p class="dim" style="font-size:.9rem;margin:1rem 0 0">Windows may show “Windows protected your PC” until the app is code-signed. Click More info, then Run anyway. <a href="download.html">Setup guide</a></p></div>`);
  }

  function renderProfile() {
    const s = me(), u = F.user(s.username) || s;
    shell('profile', `<h2 style="font-size:1.8rem">Profile</h2>
      <div class="panel"><div class="me-card">${F.avatar(u, 'avatar-lg')}<div><h1 style="font-size:2rem">${esc(s.username)}</h1><div class="row" style="gap:6px">${F.badges(u.badges)}</div><p class="dim" style="margin:.5rem 0 0">Usernames can’t be changed in the prototype.</p></div></div></div>
      <form class="panel" data-avatar style="margin-top:1rem"><fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:600;margin-bottom:8px">Change avatar</legend>
        <div class="avatar-grid">${Array.from({ length: window.Clutch.AVATARS }, (_, i) => `<label class="avatar-tile"><input type="radio" name="avatar" value="${i}" class="sr-only" ${i === u.avatar ? 'checked' : ''}>${window.Clutch.pxAvatar(i)}</label>`).join('')}</div></fieldset>
        <div class="row" style="margin-top:1rem"><button class="btn btn-primary btn-sm" type="submit">Save avatar</button></div></form>
      <p class="dim" style="margin-top:1rem">We never show real names, photos or locations. There are no fields for them, on purpose.</p>`);
  }

  function renderForum() {
    const s = me();
    shell('forum', `<h2 style="font-size:1.8rem">Forum settings</h2>
      <div class="panel">
        <div class="toggle"><label for="tg-ot">Hide Off-Topic<span class="hint">Takes the Off-Topic category off your forum home.</span></label><span class="switch"><input type="checkbox" id="tg-ot" data-act="toggle" data-key="hideOffTopic" ${s.hideOffTopic ? 'checked' : ''}><span></span></span></div>
        <div class="toggle"><label for="tg-em">Email me when someone replies<span class="hint">Prototype toggle. Email sending arrives with the backend.</span></label><span class="switch"><input type="checkbox" id="tg-em" data-act="toggle" data-key="emailReplies" ${s.emailReplies ? 'checked' : ''}><span></span></span></div>
      </div>
      <div class="panel" style="margin-top:1rem"><h3>Need a hand?</h3><p class="muted">Someone bothering you or breaking the rules? Report the post, or tell us directly.</p><a class="btn btn-ghost btn-sm" href="support.html">Report a problem with a user</a></div>
      <div class="panel danger-zone" style="margin-top:1rem"><h3>Delete my account</h3><p class="muted">Removes your account and your local data from this browser. Your posts show as “deleted account”. This can’t be undone.</p><button type="button" class="btn btn-danger btn-sm" data-act="delete-account">Delete my account</button></div>`);
  }

  /* ------------------------------ routing -------------------------------- */
  function route() {
    const s = me();
    let h = (location.hash || '').slice(1);
    if (!s) { if (h !== 'signup') h = 'login'; }
    else if (h === 'login' || h === 'signup' || !SECTIONS.some(([k]) => k === h)) h = 'overview';
    ({ login: renderLogin, signup: renderSignup, overview: renderOverview, licenses: renderLicenses, downloads: renderDownloads, profile: renderProfile, forum: renderForum })[h]();
    window.scrollTo(0, 0);
  }

  /* ------------------------------ actions -------------------------------- */
  function doLogin(form) {
    const name = form.username.value.trim();
    if (!name) { setStatus('li-status', 'Type your username.'); return; }
    if (!form.password.value) { setStatus('li-status', 'Type a password (any password works in the prototype).'); return; }
    const u = F.user(name);
    if (!u) { setStatus('li-status', 'No account with that username. Check the spelling or create one.'); return; }
    toast(`Welcome back, ${u.username}`);
    startSession(u);
  }

  function doAgeGate(form) {
    const m = +form.month.value, y = +form.year.value;
    if (!m || !y) { setStatus('ag-status', 'Pick both your birth month and year.'); return; }
    const now = new Date();
    let age = now.getFullYear() - y; if (now.getMonth() + 1 < m) age -= 1;
    if (age < 13) {
      ui.ageOk = false; ui.signupMsg = 'Clutch community accounts are for ages 13 and up. You can still use the app with a parent’s help.';
      renderSignup(); const al = app.querySelector('[role=alert]'); if (al) al.focus && al.focus();
      return;   // nothing created, nothing stored
    }
    ui.ageOk = true; ui.signupMsg = ''; renderSignup(); const f = document.getElementById('su-user'); if (f) f.focus();
  }

  function doSignup(form) {
    const name = form.username.value.trim(), email = form.email.value.trim(), pass = form.password.value, avatar = +(form.avatar.value || 0);
    if (!/^[A-Za-z0-9._-]{3,20}$/.test(name)) { setStatus('su-status', 'Usernames are 3–20 characters: letters, numbers, dots, dashes or underscores.'); form.username.focus(); return; }
    if (F.user(name)) { setStatus('su-status', 'That username is taken. Try another.'); form.username.focus(); return; }
    const bad = F.checkPost(name, { profanity: true }); if (bad) { setStatus('su-status', 'Pick a different username. That one has a word we don’t allow.'); form.username.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setStatus('su-status', 'That email doesn’t look right.'); form.email.focus(); return; }
    if (pass.length < 6) { setStatus('su-status', 'Password needs at least 6 characters.'); form.password.focus(); return; }
    if (!form.agree.checked) { setStatus('su-status', 'Please agree to the Community Guidelines first.'); form.agree.focus(); return; }
    const d = new Date(), joined = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const u = { username: name, avatar, badges: ['Early supporter'], role: 'member', joined, email };   // email is never rendered anywhere
    F.saveUser(u);
    ui.ageOk = false;
    toast('Account created. Welcome!');
    startSession(u);
  }

  function copyKey(i) {
    const lic = DB.get('licenses') || []; const l = lic[i]; if (!l) return;
    const el = document.getElementById('key-' + i);
    try { navigator.clipboard.writeText(l.key).then(() => toast('Key copied'), () => selectFallback(el)); }
    catch (e) { selectFallback(el); }
  }
  function selectFallback(el) {
    if (!el) return;
    const r = document.createRange(); r.selectNodeContents(el); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    toast('Key selected. Press Ctrl+C (or Cmd+C) to copy.');
  }
  function changeActivation(i, delta) {
    const lic = DB.get('licenses') || []; const l = lic[i]; if (!l) return;
    l.used = Math.min(l.activations, Math.max(0, (l.used || 0) + delta)); DB.set('licenses', lic);
    toast(delta < 0 ? 'A PC was deactivated. The slot is free.' : 'This PC is activated (demo).');
    renderLicenses();
  }
  function saveAvatar(form) {
    const s = me(); const u = F.user(s.username); if (!u) return;
    u.avatar = +(form.avatar.value || 0); F.saveUser(u); DB.set('session', { ...s, avatar: u.avatar });
    toast('Avatar saved'); renderProfile();
  }
  function setToggle(key, val) {
    const s = me(); DB.set('session', { ...s, [key]: val });
    const u = F.user(s.username); if (u) { u[key] = val; F.saveUser(u); }
    toast(val ? 'On' : 'Off');
  }
  function confirmDelete() {
    openModal(`<h3 id="modal-title">Delete your account?</h3><p class="muted">This removes your account and your local data from this browser. Your posts stay but show as “deleted account”. There’s no undo.</p>
      <div class="row"><button class="btn btn-danger" id="del-yes">Yes, delete it</button><button class="btn btn-ghost" id="modal-close">Keep my account</button></div>`);
    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('del-yes').onclick = () => {
      const s = me(); if (!s) return;
      DB.set('users', F.users().filter(u => u.username !== s.username));
      DB.set('posts', (DB.get('posts') || []).map(p => p.author === s.username ? { ...p, author: null } : p));
      DB.set('threads', (DB.get('threads') || []).map(t => t.author === s.username ? { ...t, author: null } : t));
      DB.set('requests', (DB.get('requests') || []).map(r => ({ ...r, author: r.author === s.username ? null : r.author, voters: (r.voters || []).filter(v => v !== s.username) })));
      DB.remove('session');
      closeModal(); toast('Your account was deleted.');
      ui.ageOk = false; location.hash = '#login'; route();
    };
  }
  function founderLogin() {
    let u = F.user('Dillon');
    if (!u) { u = { username: 'Dillon', avatar: 0, badges: ['Founder'], role: 'founder', joined: '2026-08' }; }
    u.role = 'founder'; if (!u.badges.includes('Founder')) u.badges.unshift('Founder'); F.saveUser(u);
    toast('Prototype: logged in as founder'); startSession(u);
  }

  /* ------------------------------ wiring --------------------------------- */
  app.addEventListener('submit', e => {
    const f = e.target; e.preventDefault();
    if (f.matches('[data-login]')) doLogin(f);
    else if (f.matches('[data-age-gate]')) doAgeGate(f);
    else if (f.matches('[data-signup]')) doSignup(f);
    else if (f.matches('[data-avatar]')) saveAvatar(f);
  });
  app.addEventListener('click', e => {
    const buy = e.target.closest('[data-buy]'); if (buy) { e.preventDefault(); window.Clutch.checkout(buy.dataset.buy); return; }
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act;
    if (a === 'logout') logout();
    else if (a === 'copy-key') copyKey(+el.dataset.i);
    else if (a === 'deactivate') changeActivation(+el.dataset.i, -1);
    else if (a === 'activate') changeActivation(+el.dataset.i, +1);
    else if (a === 'delete-account') confirmDelete();
    else if (a === 'founder-login') founderLogin();
  });
  app.addEventListener('change', e => {
    const el = e.target.closest('[data-act="toggle"]'); if (el) setToggle(el.dataset.key, el.checked);
  });
  function init() {
    // Re-render after a test-mode purchase closes so the new key shows up.
    const mb = document.getElementById('modal');
    if (mb) new MutationObserver(() => { if (!mb.classList.contains('open') && location.hash === '#licenses' && me()) renderLicenses(); }).observe(mb, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('hashchange', route);
    route();
  }
  // Render after site.js has built the shell so data-buy/data-download aren't double-bound.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
