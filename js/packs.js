/* ==========================================================================
   CLUTCH — packs.js
   Searchable, filterable grid of the 48 game packs. Reads window.CLUTCH_PACKS.
   Hash routing uses plain names only (#shooters, #racing ...).
   ========================================================================== */
(function () {
  'use strict';
  const PACKS = window.CLUTCH_PACKS || [];
  const K = window.Clutch;
  const CATS = ['Shooters', 'Racing', 'Sports', 'Building', 'Fighting', 'Action & adventure'];
  const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // Plain-name hash only (#shooters). Sandboxed viewers may refuse history calls; ignore if so.
  function setHash(name) { try { history.replaceState(null, '', name ? '#' + name : location.pathname + location.search); } catch (e) { /* no-op */ } }

  const grid = document.getElementById('pack-grid');
  const filters = document.getElementById('pack-filters');
  const search = document.getElementById('pack-search');
  const count = document.getElementById('pack-count');
  const empty = document.getElementById('pack-empty');
  const clear = document.getElementById('pack-clear');
  if (!grid || !filters || !search) return;

  let cat = 'All';
  let q = '';

  /* ------------------------------ Filters ------------------------------- */
  function renderFilters() {
    const items = [['All', PACKS.length]].concat(CATS.map(c => [c, PACKS.filter(p => p.category === c).length]));
    filters.innerHTML = items.map(([c, n]) =>
      `<button type="button" data-cat="${K.esc(c)}" aria-pressed="${c === cat}">${K.esc(c)}<small>${n}</small></button>`
    ).join('');
    filters.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      cat = b.dataset.cat;
      filters.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      setHash(cat === 'All' ? '' : slug(cat));
      render();
    }));
  }

  /* ------------------------------- Grid --------------------------------- */
  function matches(p) {
    if (cat !== 'All' && p.category !== cat) return false;
    if (!q) return true;
    const hay = [p.name, p.category, p.blurb, p.tier === 'free' ? 'free starter' : 'pro'].concat(p.tunes).join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }
  function card(p) {
    const badge = p.tier === 'free' ? '<span class="badge badge-dim">FREE</span>' : '<span class="badge badge-violet">PRO</span>';
    return `<button type="button" class="pack-card" data-id="${K.esc(p.id)}" aria-label="${K.esc(p.name)}, ${p.tier === 'free' ? 'free starter pack' : 'Pro pack'}">
      <span class="emo" aria-hidden="true">${p.emoji}</span>
      <span><span class="name">${K.esc(p.name)} ${badge}</span><span class="cat" style="display:block">${K.esc(p.category)}</span></span>
    </button>`;
  }
  function render() {
    const list = PACKS.filter(matches);
    grid.innerHTML = list.map(card).join('');
    grid.querySelectorAll('.pack-card').forEach(b => b.addEventListener('click', () => open(b.dataset.id)));
    count.innerHTML = `Showing <b>${list.length}</b> of ${PACKS.length} packs${cat !== 'All' ? ' in ' + K.esc(cat) : ''}`;
    empty.classList.toggle('show', list.length === 0);
  }

  /* ------------------------------- Modal -------------------------------- */
  function open(id) {
    const p = PACKS.find(x => x.id === id); if (!p) return;
    const pro = p.tier === 'pro';
    K.openModal(`
      <div class="row" style="gap:14px;align-items:flex-start">
        <span class="modal-emo" aria-hidden="true">${p.emoji}</span>
        <div style="flex:1;min-width:0">
          <p class="eyebrow" style="margin-bottom:.4rem">${K.esc(p.category.toUpperCase())}</p>
          <h3 id="modal-title" style="margin-bottom:.3rem">${K.esc(p.name)}</h3>
          ${pro ? '<span class="badge badge-violet">PRO</span>' : '<span class="badge badge-dim">FREE STARTER PACK</span>'}
        </div>
      </div>
      <p class="muted" style="margin-top:1rem">${K.esc(p.blurb)}</p>
      <h4 style="margin:1rem 0 .25rem">What it tunes</h4>
      <ul class="tunes">${p.tunes.map(t => `<li>${K.esc(t)}</li>`).join('')}</ul>
      <p class="dim" style="font-size:.88rem">Pick it from the pack wall in Clutch, or switch to it mid-game from the quick menu. Online-safe mode stays on by default.</p>
      <div class="row" style="margin-top:1.2rem">
        ${pro
          ? '<button class="btn btn-primary" id="pack-buy" data-buy="pro">Get Pro · $19.99</button>'
          : '<a class="btn btn-primary" href="download">' + K.pxIcon('download', 'ico') + ' Download free</a>'}
        <button class="btn btn-ghost" id="pack-close">Close</button>
      </div>`);
    const close = document.getElementById('pack-close'); if (close) close.onclick = K.closeModal;
    const buy = document.getElementById('pack-buy'); if (buy) buy.onclick = () => K.checkout('pro');
  }

  /* ------------------------------- Events ------------------------------- */
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = search.value.trim().toLowerCase(); render(); }, 80); });
  if (clear) clear.addEventListener('click', () => {
    q = ''; search.value = ''; cat = 'All';
    filters.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.cat === 'All')));
    setHash('');
    render(); search.focus();
  });

  /* ------------------------------- Boot --------------------------------- */
  const h = (location.hash || '').replace('#', '');
  if (h) { const found = CATS.find(c => slug(c) === h); if (found) cat = found; }
  renderFilters();
  render();
})();
