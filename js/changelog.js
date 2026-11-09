/* ==========================================================================
   CLUTCH — changelog.js
   Releases + dev posts with a filter. Routes: "#" = all, "#releases",
   "#news", or "#post-id" to jump to one post (plain slugs only).
   ========================================================================== */
(function () {
  'use strict';
  const K = window.Clutch, esc = K.esc, C = window.CLUTCH_CONFIG;

  /* ------------------------------ Data ---------------------------------- */
  const cms = (K.store('cms.posts') || []).filter(p => p && p.id && p.title).map(p => Object.assign({}, p, { fromCms: true }));
  const seen = new Set();
  const posts = cms.concat(window.CLUTCH_POSTS || []).filter(p => {
    if (seen.has(p.id)) return false; seen.add(p.id); return true;
  });

  const FILTERS = [['all', 'All'], ['release', 'Releases'], ['news', 'Dev posts']];
  const HASH_TO_FILTER = { releases: 'release', news: 'news', all: 'all' };
  let filter = 'all';

  const $ = id => document.getElementById(id);
  const nav = $('post-filter'), feed = $('post-feed'), countEl = $('post-count');

  function hashName() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    return /^[a-z0-9-]+$/i.test(h) ? h : '';
  }
  function dateLabel(d) {
    if (!d) return 'See GitHub for dates';
    const parts = String(d).split('-').map(Number);
    if (parts.length >= 3 && parts.every(Boolean)) return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    if (parts.length === 2 && parts.every(Boolean)) return new Date(parts[0], parts[1] - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    return esc(d);
  }

  function renderNav() {
    nav.innerHTML = FILTERS.map(([key, label]) => {
      const n = key === 'all' ? posts.length : posts.filter(p => p.type === key).length;
      return `<button type="button" data-filter="${key}" aria-pressed="${filter === key}">${label} <span class="count">${n}</span></button>`;
    }).join('');
  }
  nav.addEventListener('click', e => {
    const b = e.target.closest('[data-filter]'); if (!b) return;
    filter = b.dataset.filter;
    const h = filter === 'release' ? 'releases' : filter === 'news' ? 'news' : '';
    history.replaceState(null, '', location.pathname + location.search + (h ? '#' + h : ''));
    render();
  });

  function postCard(p) {
    const isNews = p.type === 'news';
    return `
    <article class="panel post ${isNews ? 'post-news' : 'post-release'}" id="${esc(p.id)}">
      <header class="post-head">
        ${isNews ? K.pxAvatar(0, '') : `<div class="icon-box release-ico">${K.pxIcon('download', '')}</div>`}
        <div class="post-meta">
          <div class="row" style="gap:8px">
            ${isNews ? '<span class="badge badge-violet">DEV</span>' : '<span class="badge badge-cyan">RELEASE</span>'}
            ${p.version ? `<span class="badge badge-dim">${esc(p.version)}</span>` : ''}
            ${p.fromCms ? '<span class="badge badge-dim">CMS</span>' : ''}
          </div>
          <h2 class="post-title">${esc(p.title)}</h2>
          <p class="dim post-by"><time>${dateLabel(p.date)}</time> · ${esc(p.author || 'Founder')}</p>
        </div>
      </header>
      <div class="post-body">${p.body || ''}</div>
      <footer class="post-foot">
        <a class="dim" href="#${esc(p.id)}">Link to this post</a>
      </footer>
    </article>`;
  }

  function render() {
    renderNav();
    const hits = posts.filter(p => filter === 'all' || p.type === filter);
    countEl.textContent = `${hits.length} ${filter === 'release' ? 'release' : filter === 'news' ? 'dev post' : 'post'}${hits.length === 1 ? '' : 's'}`;
    if (!hits.length) {
      feed.innerHTML = `<div class="panel center" style="padding:2rem"><p class="pixel" style="color:var(--pink)">NOTHING HERE YET</p><p class="muted" style="margin:0">Nothing in this list yet. Check back soon, or follow releases on GitHub.</p></div>`;
      return;
    }
    feed.innerHTML = hits.map(postCard).join('');
    feed.querySelectorAll('[data-releases]').forEach(a => { a.href = C.RELEASES_URL; });
    feed.querySelectorAll('[data-download]').forEach(a => { a.href = C.DOWNLOAD_URL; });
    feed.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = K.pxIcon(el.dataset.icon, el.className); });
    feed.querySelectorAll('[data-avatar]').forEach(el => { el.outerHTML = K.pxAvatar(+el.dataset.avatar, el.className); });
  }

  function route() {
    const h = hashName();
    if (Object.prototype.hasOwnProperty.call(HASH_TO_FILTER, h)) { filter = HASH_TO_FILTER[h]; render(); return; }
    if (h && posts.some(p => p.id === h)) {
      filter = 'all'; render();
      const el = document.getElementById(h);
      if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('post-target'); }
      return;
    }
    render();
  }
  window.addEventListener('hashchange', route);
  route();
})();
