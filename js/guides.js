/* ==========================================================================
   CLUTCH — guides.js
   Searchable help center. Routes: "#" = list, "#slug" = one guide.
   CMS entries (Clutch.store('cms.guides')) override built-ins by slug.
   ========================================================================== */
(function () {
  'use strict';
  const K = window.Clutch;
  const esc = K.esc;

  /* ------------------------------ Data ---------------------------------- */
  const cms = (K.store('cms.guides') || []).filter(g => g && g.slug && g.title).map(g => Object.assign({}, g, { fromCms: true }));
  const seen = new Set();
  const guides = cms.concat(window.CLUTCH_GUIDES || []).filter(g => {
    if (seen.has(g.slug)) return false; seen.add(g.slug); return true;
  });
  const CATS = (window.CLUTCH_GUIDE_CATEGORIES || []).slice();
  guides.forEach(g => { if (g.category && !CATS.includes(g.category)) CATS.push(g.category); });

  /* ------------------------------ State --------------------------------- */
  let cat = 'all';
  let query = '';

  const $ = id => document.getElementById(id);
  const nav = $('cat-nav'), list = $('guide-list'), view = $('guide-view'), listWrap = $('list-view');
  const search = $('guide-search'), countEl = $('result-count');

  function slugFromHash() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    return /^[a-z0-9-]+$/i.test(h) ? h : '';
  }
  function strip(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; }
  function monthLabel(ym) {
    if (!ym) return '';
    const [y, m] = String(ym).split('-').map(Number);
    if (!y || !m) return esc(ym);
    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }
  function catId(c) { return 'cat-' + c.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

  /* ------------------------------ Category nav -------------------------- */
  function renderNav(active) {
    const items = [['all', 'All guides']].concat(CATS.map(c => [c, c]));
    nav.innerHTML = items.map(([key, label]) => {
      const n = key === 'all' ? guides.length : guides.filter(g => g.category === key).length;
      return `<button type="button" data-cat="${esc(key)}" aria-pressed="${(active || cat) === key}">${esc(label)} <span class="count">${n}</span></button>`;
    }).join('');
  }
  nav.addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    cat = b.dataset.cat;
    if (slugFromHash()) { history.pushState(null, '', location.pathname + location.search); }
    route();
  });
  // Side nav on desktop, horizontal pill nav on small screens (same buttons).
  const mq = window.matchMedia('(max-width: 860px)');
  function navClass() { nav.className = mq.matches ? 'pill-nav guides-nav' : 'side-nav guides-nav'; }
  if (mq.addEventListener) mq.addEventListener('change', navClass); else mq.addListener(navClass);
  navClass();

  /* ------------------------------ Search -------------------------------- */
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    if (slugFromHash()) history.pushState(null, '', location.pathname + location.search);
    route();
  });
  search.addEventListener('keydown', e => { if (e.key === 'Escape' && search.value) { search.value = ''; query = ''; route(); } });

  function matches(g) {
    if (cat !== 'all' && g.category !== cat) return false;
    if (!query) return true;
    const hay = (g.title + ' ' + g.summary + ' ' + strip(g.body || '')).toLowerCase();
    return query.split(/\s+/).every(w => hay.includes(w));
  }

  /* ------------------------------ List view ----------------------------- */
  function renderList() {
    const hits = guides.filter(matches);
    const groups = {};
    hits.forEach(g => { (groups[g.category] = groups[g.category] || []).push(g); });
    const order = CATS.filter(c => groups[c]);

    countEl.textContent = query
      ? `${hits.length} guide${hits.length === 1 ? '' : 's'} match "${search.value.trim()}"`
      : (cat === 'all' ? `${hits.length} guides` : `${hits.length} guide${hits.length === 1 ? '' : 's'} in ${cat}`);

    if (!hits.length) {
      list.innerHTML = `<div class="panel empty">
        <p class="pixel" style="color:var(--pink)">NO MATCHES</p>
        <h3>Nothing found for that</h3>
        <p class="muted">Try a shorter word, or ask in the forum. Someone has probably hit the same thing.</p>
        <div class="row"><button type="button" class="btn btn-ghost btn-sm" id="clear-search">Clear search</button><a class="btn btn-primary btn-sm" href="community">Ask in Help &amp; Setup</a><a class="btn btn-ghost btn-sm" href="support">Contact support</a></div>
      </div>`;
      const c = $('clear-search'); if (c) c.onclick = () => { search.value = ''; query = ''; cat = 'all'; route(); search.focus(); };
      return;
    }

    list.innerHTML = order.map(c => `
      <section class="guide-group" aria-labelledby="${catId(c)}">
        <h2 id="${catId(c)}" class="group-title">${esc(c)}</h2>
        <div class="grid grid-2 cards">
          ${groups[c].map(g => `
          <a class="panel panel-hover card" href="#${esc(g.slug)}">
            <span class="tag">${esc(g.category)}</span>
            <h3>${esc(g.title)}</h3>
            <p>${esc(g.summary)}</p>
            <span class="pixel more">READ <span class="arr" aria-hidden="true">→</span></span>
          </a>`).join('')}
        </div>
      </section>`).join('');
  }

  /* ------------------------------ Guide view ---------------------------- */
  function renderGuide(g) {
    const idx = guides.indexOf(g);
    const sameCat = guides.filter(x => x.category === g.category && x !== g);
    const next = sameCat.find(x => guides.indexOf(x) > idx) || sameCat[0];
    view.innerHTML = `
      <a class="back" href="#"><span aria-hidden="true">←</span> Back to all guides</a>
      <article class="guide">
        <p class="eyebrow">${esc(g.category).toUpperCase()}</p>
        <h2 class="guide-title">${esc(g.title)}</h2>
        <p class="lead">${esc(g.summary)}</p>
        <p class="dim meta">${g.updated ? 'Updated ' + monthLabel(g.updated) : ''}${g.fromCms ? ' · From CMS' : ''}</p>
        <div class="guide-body">${g.body || '<p>This guide is being written.</p>'}</div>
        <div class="panel helpful" role="group" aria-labelledby="helpful-q">
          <strong id="helpful-q">Was this helpful?</strong>
          <div class="row">
            <button type="button" class="btn btn-ghost btn-sm" data-helpful="yes">Yes</button>
            <button type="button" class="btn btn-ghost btn-sm" data-helpful="no">Not really</button>
          </div>
          <p class="dim" style="font-size:.9rem;margin:0">Still stuck? Ask in the forum's <a href="community">Help &amp; Setup</a> category or <a href="support">contact support</a>.</p>
        </div>
        ${next ? `<p class="next-up"><span class="dim">Next in ${esc(g.category)}:</span> <a href="#${esc(next.slug)}">${esc(next.title)}</a></p>` : ''}
      </article>`;
    // Dynamic content: resolve data-releases links (site.js only does this at load).
    view.querySelectorAll('[data-releases]').forEach(a => { a.href = window.CLUTCH_CONFIG.RELEASES_URL; a.target = '_blank'; a.rel = 'noopener'; });
    view.querySelectorAll('[data-download]').forEach(a => { a.href = window.CLUTCH_CONFIG.DOWNLOAD_URL; });
    view.querySelectorAll('[data-helpful]').forEach(b => b.addEventListener('click', () => {
      K.toast(b.dataset.helpful === 'yes' ? 'Thanks! Glad it helped.' : 'Thanks. We will make this one clearer.');
      view.querySelectorAll('[data-helpful]').forEach(x => { x.disabled = true; });
      b.classList.add('pressed');
    }));
  }

  /* ------------------------------ Router -------------------------------- */
  function route() {
    const slug = slugFromHash();
    const g = slug && guides.find(x => x.slug === slug);
    if (slug && g) {
      renderNav(g.category);
      listWrap.hidden = true; view.hidden = false;
      renderGuide(g);
      document.title = g.title + ' — Clutch guides';
      countEl.textContent = '';
      const h = view.querySelector('.guide-title'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      window.scrollTo({ top: Math.max(0, document.getElementById('main').offsetTop - 80), behavior: 'auto' });
    } else {
      if (slug && !g) { K.toast('That guide does not exist yet.'); history.replaceState(null, '', location.pathname + location.search); }
      renderNav();
      view.hidden = true; listWrap.hidden = false;
      renderList();
      document.title = 'Guides & help center — Clutch';
    }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);
  route();
})();
