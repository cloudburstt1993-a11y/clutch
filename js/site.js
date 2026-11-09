/* ==========================================================================
   CLUTCH — site.js
   Shared shell (header/footer), pixel icons, arcade buttons, store + forms.
   ========================================================================== */

/* ------------------------------ CONFIG ----------------------------------
   Fill these in to go live. Everything works in demo mode while empty.      */
window.CLUTCH_CONFIG = {
  // Lemon Squeezy checkout links (Settings > Products > Share). Test-mode links work as-is.
  // Paddle or Stripe Payment Links also work here; the overlay is skipped for those.
  STORE: {
    pro:    '',   // e.g. 'https://clutch.lemonsqueezy.com/checkout/buy/xxxxxxxx'
    family: '',   // e.g. 'https://clutch.lemonsqueezy.com/checkout/buy/yyyyyyyy'
  },
  // Google Apps Script web app URL (same pattern as the MTF/HAAS/APS lead scripts).
  // Receives waitlist, support, and report submissions as JSON.
  FORM_ENDPOINT: '',
  DISCORD_URL: '',             // optional; forum stays the main home
  SITE_URL: 'https://clutchmods.vercel.app',
  DOWNLOAD_URL: 'https://github.com/cloudburstt1993-a11y/clutch/releases/latest/download/Clutch-Setup.exe',
  RELEASES_URL: 'https://github.com/cloudburstt1993-a11y/clutch/releases',
  SUPPORT_EMAIL: 'support@clutchmods.app',   // placeholder — change before launch
};

(function () {
  'use strict';
  const C = window.CLUTCH_CONFIG;
  const page = document.body.dataset.page || '';

  /* ---------------------------- Pixel icons ----------------------------- */
  // Each icon is a 12x12 grid. Letters map to palette colors; '.' is empty.
  const PAL = { p: '#FF5FA2', v: '#7C5CFF', c: '#3EC6FF', y: '#FFD23F', w: '#F1F4FF', d: '#1A2447', g: '#4ADE80', k: '#0D1328' };
  const ICONS = {
    controller: [
      '............',
      '...vvvvvv...',
      '..vvvvvvvv..',
      '.vvwvvvvvyv.',
      '.vwwwvvvyvyv',
      '.vvwvvvvvyv.',
      '.vvvvvvvvvv.',
      '.vvvv..vvvv.',
      '.vvv....vvv.',
      '..vv....vv..',
      '............',
      '............'],
    bolt: [
      '......yy....',
      '.....yyy....',
      '....yyy.....',
      '...yyy......',
      '..yyyyyyy...',
      '.yyyyyyyy...',
      '.....yyy....',
      '....yyy.....',
      '...yyy......',
      '..yy........',
      '.y..........',
      '............'],
    target: [
      '....cccc....',
      '..cc....cc..',
      '.c..cccc..c.',
      '.c.c....c.c.',
      'c.c..pp..c.c',
      'c.c.pppp.c.c',
      'c.c.pppp.c.c',
      'c.c..pp..c.c',
      '.c.c....c.c.',
      '.c..cccc..c.',
      '..cc....cc..',
      '....cccc....'],
    shield: [
      '.gggggggggg.',
      'gggggggggggg',
      'gggggggggggg',
      'ggggg..ggggg',
      'gggg.ww.gggg',
      'ggg.wwww.ggg',
      'gggg.ww.gggg',
      '.ggggggggg..',
      '.gggggggggg.',
      '..gggggggg..',
      '...gggggg...',
      '....gggg....'],
    lock: [
      '....yyyy....',
      '...yy..yy...',
      '...y....y...',
      '...y....y...',
      '.yyyyyyyyyy.',
      '.yyyyyyyyyy.',
      '.yyyy..yyyy.',
      '.yyyy..yyyy.',
      '.yyyyy.yyyy.',
      '.yyyyyyyyyy.',
      '.yyyyyyyyyy.',
      '............'],
    clock: [
      '....wwww....',
      '..ww....ww..',
      '.w........w.',
      '.w....c...w.',
      'w.....c....w',
      'w.....c....w',
      'w.....cccc.w',
      'w..........w',
      '.w........w.',
      '.w........w.',
      '..ww....ww..',
      '....wwww....'],
    family: [
      '............',
      '..pp....cc..',
      '..pp....cc..',
      '.pppp..cccc.',
      '.pppp..cccc.',
      '..pp.yy.cc..',
      '..pp.yy.cc..',
      '.ppppyyycccc',
      '.ppppyyycccc',
      '..pp.yy.cc..',
      '..pp.yy.cc..',
      '............'],
    download: [
      '.....cc.....',
      '.....cc.....',
      '.....cc.....',
      '.....cc.....',
      '..cc.cc.cc..',
      '...cccccc...',
      '....cccc....',
      '.....cc.....',
      '............',
      'wwwwwwwwwwww',
      'w..........w',
      'wwwwwwwwwwww'],
    chat: [
      '.pppppppppp.',
      'pppppppppppp',
      'pp.pp.pp.ppp',
      'pppppppppppp',
      'pp.pp.pp.ppp',
      'pppppppppppp',
      '.pppppppppp.',
      '..pppp......',
      '..ppp.......',
      '..pp........',
      '..p.........',
      '............'],
    star: [
      '.....yy.....',
      '.....yy.....',
      '....yyyy....',
      '....yyyy....',
      'yyyyyyyyyyyy',
      '.yyyyyyyyyy.',
      '..yyyyyyyy..',
      '...yyyyyy...',
      '...yy..yy...',
      '..yy....yy..',
      '.y........y.',
      '............'],
    box: [
      '............',
      '.vvvvvvvvvv.',
      'vvvvvvvvvvvv',
      'vvvvvvvvvvvv',
      'v.cccccccc.v',
      'v.c......c.v',
      'v.c.yy.y.c.v',
      'v.c......c.v',
      'v.cccccccc.v',
      'vvvvvvvvvvvv',
      '.vvvvvvvvvv.',
      '............'],
    gear: [
      '....ww.ww...',
      '...wwwwwww..',
      '.wwwwwwwwww.',
      '.www.....www',
      'www..ccc..ww',
      '.ww.ccccc.ww',
      '.ww.ccccc.ww',
      'www..ccc..ww',
      '.www.....www',
      '.wwwwwwwwww.',
      '...wwwwwww..',
      '....ww.ww...'],
    flag: [
      '.w..........',
      '.w.pppppp...',
      '.w.pppppppp.',
      '.w.pppppppp.',
      '.w.pppppppp.',
      '.w.pppppp...',
      '.w..........',
      '.w..........',
      '.w..........',
      '.w..........',
      '.w..........',
      '.w..........'],
    crown: [
      '............',
      'y....yy....y',
      'y...yyyy...y',
      'yy..yyyy..yy',
      'yyy.yyyy.yyy',
      'yyyyyyyyyyyy',
      'yyyyyyyyyyyy',
      'yyyyyyyyyyyy',
      'y.yyyyyyyy.y',
      'yyyyyyyyyyyy',
      '............',
      '............'],
    heart: [
      '............',
      '..pp....pp..',
      '.pppp..pppp.',
      'pppppppppppp',
      'pppppppppppp',
      'pppppppppppp',
      '.pppppppppp.',
      '..pppppppp..',
      '...pppppp...',
      '....pppp....',
      '.....pp.....',
      '............'],
    wand: [
      '.........yy.',
      '........yyyy',
      '.......yyy..',
      '......ccc...',
      '.....ccc....',
      '....ccc.....',
      '...ccc......',
      '..ccc.......',
      '.ccc........',
      'ccc.........',
      'cc..........',
      '............'],
    eye: [
      '............',
      '............',
      '....wwww....',
      '..ww....ww..',
      '.w...cc...w.',
      'w...cccc...w',
      'w...cccc...w',
      '.w...cc...w.',
      '..ww....ww..',
      '....wwww....',
      '............',
      '............'],
    menu: [
      '............',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      '............',
      '............',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      '............',
      '............',
      'wwwwwwwwwwww',
      'wwwwwwwwwwww',
      '............'],
    phone: [
      '...cccccc...',
      '..cccccccc..',
      '..cc....cc..',
      '..cc....cc..',
      '..cc....cc..',
      '..cc....cc..',
      '..cc....cc..',
      '..cc....cc..',
      '..cccccccc..',
      '..ccc..ccc..',
      '..cccccccc..',
      '...cccccc...'],
    windows: [
      '............',
      '.wwwww.wwwww',
      '.wwwww.wwwww',
      '.wwwww.wwwww',
      '.wwwww.wwwww',
      '............',
      '.wwwww.wwwww',
      '.wwwww.wwwww',
      '.wwwww.wwwww',
      '.wwwww.wwwww',
      '............',
      '............'],
  };
  function pxIcon(name, cls) {
    const map = ICONS[name] || ICONS.star;
    let rects = '';
    map.forEach((row, y) => { [...row].forEach((ch, x) => { if (ch !== '.') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${PAL[ch] || PAL.w}"/>`; }); });
    return `<svg class="px ${cls || ''}" viewBox="0 0 12 12" aria-hidden="true" focusable="false">${rects}</svg>`;
  }
  // Preset retro pixel avatars (8x8), used for forum profiles. No photos.
  const AVATARS = [
    ['..pppp..', '.pppppp.', 'pp.pp.pp', 'pppppppp', 'pp....pp', 'ppp..ppp', '.pppppp.', '..p..p..'],
    ['..cccc..', '.c....c.', 'c.c..c.c', 'c......c', 'c.cccc.c', 'c......c', '.c....c.', '..cccc..'],
    ['.vvvvvv.', 'vvvvvvvv', 'v.v..v.v', 'vvvvvvvv', 'vv.vv.vv', 'vvv..vvv', '.vvvvvv.', '.v....v.'],
    ['...yy...', '..yyyy..', '.yyyyyy.', 'yy.yy.yy', 'yyyyyyyy', '.y.yy.y.', '..yyyy..', '.y....y.'],
    ['gg....gg', '.gggggg.', 'gg.gg.gg', 'gggggggg', 'g.gggg.g', 'gg....gg', '.gggggg.', 'g.g..g.g'],
    ['..wwww..', '.w.ww.w.', 'wwwwwwww', 'w.wwww.w', 'wwwwwwww', '.ww..ww.', '..wwww..', '.w.ww.w.'],
    ['.pp..pp.', 'pppppppp', 'pp.pp.pp', 'pppppppp', '.pppppp.', 'p.pppp.p', 'p......p', '.p....p.'],
    ['cc.cc.cc', '.cccccc.', 'c.c..c.c', 'cccccccc', 'cc....cc', '.cccccc.', '..c..c..', '.cc..cc.'],
  ];
  function pxAvatar(i, cls) {
    const map = AVATARS[Math.abs(i | 0) % AVATARS.length];
    let rects = `<rect width="8" height="8" fill="#0D1328"/>`;
    map.forEach((row, y) => { [...row].forEach((ch, x) => { if (ch !== '.') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${PAL[ch] || PAL.w}"/>`; }); });
    return `<svg class="avatar ${cls || ''}" viewBox="0 0 8 8" role="img" aria-label="Pixel avatar ${(i | 0) % AVATARS.length + 1}">${rects}</svg>`;
  }
  const LOGO = `<svg class="logo" viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#FF5FA2"/><stop offset=".5" stop-color="#7C5CFF"/><stop offset="1" stop-color="#3EC6FF"/></linearGradient></defs>${ICONS.controller.map((row, y) => [...row].map((ch, x) => ch === '.' ? '' : `<rect x="${x}" y="${y}" width="1" height="1" fill="${ch === 'y' ? '#FFD23F' : ch === 'w' ? '#F1F4FF' : 'url(#lg)'}"/>`).join('')).join('')}</svg>`;

  /* ----------------------------- Header/Footer -------------------------- */
  const NAV = [
    ['features', 'Features', 'features'],
    ['packs', 'Game packs', 'packs'],
    ['parents', 'For parents', 'parents'],
    ['pricing', 'Pricing', 'pricing'],
    ['console-kit', 'Console Kit', 'console-kit'],
    ['guides', 'Guides', 'guides'],
    ['community', 'Community', 'community'],
  ];
  function header() {
    const links = NAV.map(([href, label, key]) => `<li><a href="${href}" ${page === key ? 'aria-current="page"' : ''}>${label}</a></li>`).join('');
    return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="container nav" id="nav">
  <a class="brand" href="/" aria-label="Clutch home">${LOGO}<span>CLUTCH</span></a>
  <button class="nav-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Menu"><span></span><span></span><span></span></button>
  <ul class="nav-links" id="nav-links">${links}<li class="show-m"><a href="changelog" ${page === 'changelog' ? 'aria-current="page"' : ''}>Changelog</a></li><li class="show-m"><a href="support" ${page === 'support' ? 'aria-current="page"' : ''}>Support</a></li></ul>
  <div class="nav-cta">
    <a class="btn btn-ghost btn-sm hide-m" href="account" ${page === 'account' ? 'aria-current="page"' : ''}>Log in</a>
    <a class="btn btn-primary btn-sm" href="download">${pxIcon('download', 'ico')} Download</a>
  </div>
</div></header>`;
  }
  function footer() {
    return `<footer class="site-footer"><div class="container">
  <div class="footer-grid">
    <div>
      <a class="brand" href="/" aria-label="Clutch home">${LOGO}<span>CLUTCH</span></a>
      <p style="margin-top:.8rem">Your controller. Super-powered. A Windows PC app that upgrades any game controller, no scripts or coding.</p>
      <p class="pixel" style="color:var(--yellow)">PAY ONCE. NO SUBSCRIPTION.</p>
    </div>
    <div><h4>Product</h4><ul>
      <li><a href="features">Features</a></li><li><a href="packs">Game packs</a></li><li><a href="pricing">Pricing</a></li>
      <li><a href="console-kit">Console Kit <span class="tag">soon</span></a></li><li><a href="download">Download</a></li><li><a href="changelog">Changelog</a></li></ul></div>
    <div><h4>Help</h4><ul>
      <li><a href="guides">Guides &amp; help center</a></li><li><a href="parents">For parents</a></li><li><a href="support">Support</a></li>
      <li><a href="community">Community forum</a></li><li><a href="account">Account</a></li></ul></div>
    <div><h4>Legal</h4><ul>
      <li><a href="terms">Terms of Service</a></li><li><a href="privacy">Privacy Policy</a></li>
      <li><a href="refunds">Refund Policy</a></li><li><a href="guidelines">Community Guidelines</a></li></ul></div>
  </div>
  <div class="footer-bottom">
    <span>© ${new Date().getFullYear()} Clutch. Works with Xbox, PlayStation, Switch Pro, GameSir and other controllers. Platform names belong to their owners; Clutch is not affiliated with them.</span>
    <span>Community is 13+. No private messages. <a href="guidelines">Rules</a></span>
  </div>
</div></footer>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="modal-backdrop" id="modal" aria-hidden="true"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" id="modal-box"></div></div>`;
  }

  /* ------------------------------ UI utils ------------------------------ */
  let toastT;
  function toast(msg) {
    const t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function openModal(html) {
    const b = document.getElementById('modal'), box = document.getElementById('modal-box');
    box.innerHTML = html; b.classList.add('open'); b.setAttribute('aria-hidden', 'false');
    const f = box.querySelector('input,button,select,textarea,a'); if (f) f.focus();
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    const b = document.getElementById('modal'); if (!b) return;
    b.classList.remove('open'); b.setAttribute('aria-hidden', 'true'); document.body.style.overflow = '';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function store(key, val) {
    try { if (val === undefined) return JSON.parse(localStorage.getItem('clutch.' + key) || 'null'); localStorage.setItem('clutch.' + key, JSON.stringify(val)); return val; }
    catch (e) { return val === undefined ? null : val; }
  }
  function money(n) { return '$' + n.toFixed(2); }

  /* ------------------------------ Forms --------------------------------- */
  // Posts JSON as text/plain to the Apps Script endpoint (no CORS preflight).
  async function submitForm(form, type, onDone) {
    const status = form.querySelector('.form-status');
    const btn = form.querySelector('[type=submit]');
    const data = Object.fromEntries(new FormData(form).entries());
    if (data._gotcha) return;                           // honeypot
    data.type = type; data.source = 'Website'; data.page = location.pathname;
    if (btn) { btn.disabled = true; btn.classList.add('pressed'); }
    if (status) status.textContent = 'Sending…';
    try {
      if (C.FORM_ENDPOINT) {
        await fetch(C.FORM_ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(data) });
      } else {
        const q = store('outbox') || []; q.push({ ...data, at: new Date().toISOString() }); store('outbox', q);
        await new Promise(r => setTimeout(r, 500));
      }
      if (status) { status.textContent = C.FORM_ENDPOINT ? 'Sent. Thanks!' : 'Saved (demo mode). Connect FORM_ENDPOINT in js/site.js to send for real.'; status.style.color = 'var(--ok)'; }
      form.reset(); if (onDone) onDone(data);
    } catch (err) {
      if (status) { status.textContent = 'That didn’t send. Check your connection and try again.'; status.style.color = 'var(--danger)'; }
    } finally { if (btn) { btn.disabled = false; btn.classList.remove('pressed'); } }
  }

  /* ------------------------------ Store --------------------------------- */
  const PLANS = {
    free:   { name: 'Clutch Free',  price: 0,     activations: 1 },
    pro:    { name: 'Clutch Pro',   price: 19.99, activations: 1 },
    family: { name: 'Clutch Family', price: 29.99, activations: 3 },
  };
  function licenseKey() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const g = () => Array.from({ length: 5 }, () => a[Math.floor(Math.random() * a.length)]).join('');
    return `CLUTCH-${g()}-${g()}-${g()}`;
  }
  function checkout(planId) {
    const plan = PLANS[planId]; if (!plan) return;
    if (planId === 'free') { location.href = 'download'; return; }
    const url = C.STORE[planId];
    openModal(`
      <div class="row between"><h3 id="modal-title">Buy ${esc(plan.name)}</h3><span class="price">${money(plan.price)}</span></div>
      <p class="muted">One-time purchase. ${plan.activations} PC activation${plan.activations > 1 ? 's' : ''}. Pay once, no subscription. 14-day refund policy.</p>
      <div class="notice notice-pink"><p><strong>Parent or guardian purchase.</strong> Buyers must be 18 or older. Clutch is used by kids and teens, so a parent or guardian completes checkout and receives the license key.</p></div>
      <label class="check"><input type="checkbox" id="age-ok"> <span>I am 18 or older and I am buying this for myself or for a child in my care.</span></label>
      <div class="row" style="margin-top:1.2rem">
        ${url
          ? `<a class="btn btn-primary" id="go-pay" aria-disabled="true" href="${esc(url)}" target="_blank" rel="noopener" ${/lemonsqueezy/.test(url) ? 'data-lemonsqueezy' : ''}>Continue to secure checkout</a>`
          : `<button class="btn btn-primary" id="go-pay" disabled>Continue (test mode)</button>`}
        <button class="btn btn-ghost" id="modal-close">Cancel</button>
      </div>
      <p class="dim" style="font-size:.85rem;margin-top:1rem;margin-bottom:0">${url ? 'Checkout is handled by our merchant of record, which collects sales tax or VAT where required. Your key arrives by email and in your account.' : 'Test mode: no payment is taken. A demo license key is issued so you can see the account flow. Add your Lemon Squeezy or Paddle checkout link in <code>js/site.js</code> to go live.'}</p>`);
    const ok = document.getElementById('age-ok'), go = document.getElementById('go-pay');
    ok.addEventListener('change', () => { if (url) go.setAttribute('aria-disabled', String(!ok.checked)); else go.disabled = !ok.checked; });
    document.getElementById('modal-close').onclick = closeModal;
    go.onclick = (e) => {
      if (url) {
        if (go.getAttribute('aria-disabled') === 'true') { e.preventDefault(); toast('Please confirm you are 18 or older first'); return; }
        // Lemon Squeezy overlay when lemon.js is loaded; otherwise the link opens checkout in a new tab.
        if (window.LemonSqueezy && /lemonsqueezy/.test(url)) { e.preventDefault(); closeModal(); window.LemonSqueezy.Url.Open(url); }
        return;
      }
      const key = licenseKey();
      const lic = store('licenses') || [];
      lic.push({ plan: plan.name, key, activations: plan.activations, used: 0, bought: new Date().toISOString(), test: true });
      store('licenses', lic);
      openModal(`
        <h3 id="modal-title">You’re in. <span class="grad-text">Clutch ${esc(plan.name.replace('Clutch ', ''))}</span> unlocked</h3>
        <p class="muted">Test-mode purchase. Here is your demo license key:</p>
        <p class="pixel-lg" style="color:var(--yellow);word-break:break-all">${key}</p>
        <ol class="muted" style="padding-left:1.2rem"><li>Install Clutch from the <a href="download">download page</a>.</li><li>Open Settings → License and paste the key.</li><li>All 48 packs, Aim Lab, crosshair, macros and family controls switch on.</li></ol>
        <div class="row"><a class="btn btn-primary" href="account">Open my account</a><button class="btn btn-ghost" id="modal-close">Close</button></div>`);
      document.getElementById('modal-close').onclick = closeModal;
      toast('Demo license key saved to your account');
    };
  }

  /* ------------------------------ Boot ---------------------------------- */
  function initShell() {
    const h = document.getElementById('site-header'); if (h) h.outerHTML = header();
    const f = document.getElementById('site-footer'); if (f) f.outerHTML = footer();
    const nav = document.getElementById('nav');
    const tog = nav && nav.querySelector('.nav-toggle');
    if (tog) tog.addEventListener('click', () => { const open = nav.classList.toggle('open'); tog.setAttribute('aria-expanded', String(open)); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); if (nav) { nav.classList.remove('open'); if (tog) tog.setAttribute('aria-expanded', 'false'); } } });
    const mb = document.getElementById('modal'); if (mb) mb.addEventListener('click', e => { if (e.target === mb) closeModal(); });

    // Inline icons: <i data-icon="bolt"></i>
    document.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = pxIcon(el.dataset.icon, el.className); });
    document.querySelectorAll('[data-avatar]').forEach(el => { el.outerHTML = pxAvatar(+el.dataset.avatar, el.className); });
    // Buttons that buy: <button data-buy="pro">
    document.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); checkout(b.dataset.buy); }));
    // Download links
    document.querySelectorAll('[data-download]').forEach(a => { a.href = C.DOWNLOAD_URL; });
    document.querySelectorAll('[data-releases]').forEach(a => { a.href = C.RELEASES_URL; });
    document.querySelectorAll('[data-form]').forEach(form => form.addEventListener('submit', e => { e.preventDefault(); submitForm(form, form.dataset.form); }));

    // Hero boot sequence (one orchestrated page-load moment)
    const hero = document.querySelector('.hero.booting');
    if (hero) {
      const bar = hero.querySelectorAll('.loadbar i');
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || !bar.length) { hero.classList.remove('booting'); hero.classList.add('booted'); bar.forEach(b => b.classList.add('on')); }
      else {
        let i = 0; const t = setInterval(() => { if (i < bar.length) bar[i++].classList.add('on'); else { clearInterval(t); hero.classList.remove('booting'); hero.classList.add('booted'); } }, 55);
      }
    }
    // Load Lemon Squeezy overlay only if a store link is configured.
    if (Object.values(C.STORE).some(u => /lemonsqueezy/.test(u))) {
      const s = document.createElement('script'); s.src = 'https://app.lemonsqueezy.com/js/lemon.js'; s.defer = true; s.onload = () => window.createLemonSqueezy && window.createLemonSqueezy(); document.head.appendChild(s);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initShell); else initShell();

  window.Clutch = { pxIcon, pxAvatar, toast, openModal, closeModal, esc, store, submitForm, checkout, PLANS, money, licenseKey, AVATARS: AVATARS.length };
})();
