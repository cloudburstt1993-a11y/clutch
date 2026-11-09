/* ==========================================================================
   CLUTCH — community.js
   Single-page forum. Hash routes (plain names, hash-safe):
     #home · #c-<category> · #t-<threadId> · #new-<category> · #requests
     #u-<username-slug> · #rules
   All data goes through ClutchDB (see community-data.js).
   ========================================================================== */
(function () {
  'use strict';
  const { esc, toast, openModal, closeModal } = window.Clutch;
  const DB = window.ClutchDB;
  const F = window.ClutchForum;
  const CATS = window.CLUTCH_SEED.categories;
  const app = document.getElementById('app');
  const ui = { reqSort: 'votes', reqStatus: 'All', showReqForm: false };

  /* ------------------------------ data access ---------------------------- */
  const threads = () => DB.get('threads') || [];
  const posts = () => DB.get('posts') || [];
  const requests = () => DB.get('requests') || [];
  const settings = () => DB.get('settings') || {};
  const cat = (slug) => CATS.find(c => c.slug === slug);
  const me = () => F.syncSession();
  const isDevUser = (name) => F.isFounder(F.user(name));
  const visiblePosts = (tid, viewer) => posts().filter(p => p.thread === tid && (!p.pending || (viewer && (viewer.username === p.author || F.isMod(viewer)))));
  const threadReplies = (tid) => posts().filter(p => p.thread === tid && !p.pending).length - 1;
  const lastPost = (tid) => posts().filter(p => p.thread === tid && !p.pending).sort((a, b) => b.created.localeCompare(a.created))[0];
  const catThreads = (slug) => threads().filter(t => t.cat === slug && !t.removed);
  const hasPostedBefore = (name) => posts().some(p => p.author === name && !p.pending);
  const nextParam = () => encodeURIComponent('community.html' + location.hash);
  const loginLink = (txt) => `<a href="account.html?next=${nextParam()}">${txt || 'Log in or create an account'}</a>`;

  /* ------------------------------ small views ----------------------------- */
  const crumbs = (items) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="#home">Forum</a>${items.map(([h, l]) => `<span class="sep" aria-hidden="true">›</span>${h ? `<a href="${h}">${esc(l)}</a>` : `<span>${esc(l)}</span>`}`).join('')}</nav>`;
  const userLink = (name) => { const u = F.user(name); return u ? `<a href="#u-${F.slug(u.username)}">${esc(u.username)}</a>` : `<span class="dim">${esc(name || 'deleted account')}</span>`; };
  const devBadge = () => `<span class="badge badge-violet">DEV</span>`;
  const pinBadge = () => `<span class="badge badge-yellow">PINNED</span>`;
  const STATUS_CLASS = { 'Shipped': 'badge-ok', 'In progress': 'badge-cyan', 'Planned': 'badge-violet', 'Open': 'badge-dim' };
  const statusBadge = (s) => `<span class="badge ${STATUS_CLASS[s] || 'badge-dim'}">${esc(s)}</span>`;

  function threadRow(t) {
    const dev = isDevUser(t.author), c = cat(t.cat), n = threadReplies(t.id), lp = lastPost(t.id);
    return `<a class="panel panel-hover thread-row ${dev ? 'is-dev' : ''} ${t.pinned ? 'is-pinned' : ''}" href="#t-${esc(t.id)}">
      ${F.avatar(F.user(t.author))}
      <div>
        <div class="title">${t.pinned ? pinBadge() : ''}${dev ? devBadge() : ''}<span>${esc(t.title)}</span></div>
        <div class="meta">${esc(t.author || 'deleted account')} · ${c ? esc(c.name) : ''} · ${F.timeEl(t.created)}${lp && lp.id !== t.id ? ` · last reply ${F.ago(lp.created)}` : ''}</div>
      </div>
      <div class="replies">${n} ${n === 1 ? 'reply' : 'replies'}</div>
    </a>`;
  }

  /* ------------------------------ routes --------------------------------- */
  function renderHome() {
    const s = me();
    const list = CATS.filter(c => !(s && s.hideOffTopic && c.slug === 'off-topic')).map(c => {
      let count, latest;
      if (c.slug === 'feature-requests') {
        const r = requests().slice().sort((a, b) => b.created.localeCompare(a.created));
        count = `<span class="stat">${r.length}</span><small>requests</small>`;
        latest = r[0] ? `Latest: ${esc(r[0].title)} ${statusBadge(r[0].status)}` : '';
      } else {
        const ts = catThreads(c.slug).sort((a, b) => b.created.localeCompare(a.created));
        count = `<span class="stat">${ts.length}</span><small>${ts.length === 1 ? 'thread' : 'threads'}</small>`;
        latest = ts[0] ? `Latest: ${esc(ts[0].title)} · ${F.ago(ts[0].created)}` : 'No threads yet';
      }
      return `<a class="panel panel-hover cat-row" href="${c.href || '#c-' + c.slug}">
        ${window.Clutch.pxIcon(c.icon)}
        <div><h3>${esc(c.name)}${c.founderOnly ? ' <span class="badge badge-dim">founder posts</span>' : ''}</h3><p>${esc(c.blurb)}</p><div class="latest">${latest}</div></div>
        <div class="count">${count}</div>
      </a>`;
    }).join('');
    app.innerHTML = `
      <div class="forum-head" style="margin-top:1.5rem">
        <div><p class="eyebrow">COMMUNITY</p><h1>Share packs. Fix setups. <span class="grad-text">Talk to the founder.</span></h1><p>Pick a category. Pinned Dev posts have a violet edge.</p></div>
        <div class="row">${s ? `<span class="muted">Hi, <a href="#u-${F.slug(s.username)}">${esc(s.username)}</a></span>` : `<a class="btn btn-ghost btn-sm" href="account.html?next=${nextParam()}">Log in</a>`}<a class="btn btn-ghost btn-sm" href="#rules">Rules</a></div>
      </div>
      <div class="cat-list">${list}</div>`;
  }

  function renderCategory(slug) {
    const c = cat(slug); if (!c) return renderMissing('That category doesn’t exist.');
    if (c.href) { location.hash = c.href; return; }
    const s = me();
    const ts = catThreads(slug).sort((a, b) => (b.pinned - a.pinned) || b.created.localeCompare(a.created));
    const canStart = s && (!c.founderOnly || F.isFounder(s)) && !(settings().lockOffTopic && slug === 'off-topic' && !F.isMod(s));
    let cta;
    if (c.founderOnly && !(s && F.isFounder(s))) cta = `<span class="dim">Only the founder starts threads here. Anyone can reply.</span>`;
    else if (settings().lockOffTopic && slug === 'off-topic' && !(s && F.isMod(s))) cta = `<span class="dim">Off-Topic is locked right now.</span>`;
    else if (!s) cta = `<span class="inline-login">${loginLink()} to start a thread.</span>`;
    else cta = `<a class="btn btn-primary btn-sm" href="#new-${esc(slug)}">New thread</a>`;
    app.innerHTML = `${crumbs([[null, c.name]])}
      <div class="forum-head"><div><h1>${esc(c.name)}</h1><p>${esc(c.blurb)}</p></div><div>${cta}</div></div>
      <div class="thread-list">${ts.length ? ts.map(threadRow).join('') : `<div class="panel empty">No threads here yet.${canStart ? ' Start the first one.' : ''}</div>`}</div>`;
  }

  function renderThread(id) {
    const t = threads().find(x => x.id === id && !x.removed); if (!t) return renderMissing('That thread was removed or never existed.');
    const s = me(), c = cat(t.cat);
    const list = visiblePosts(t.id, s).sort((a, b) => a.created.localeCompare(b.created));
    const postHtml = list.map((p, i) => {
      const u = F.user(p.author), dev = isDevUser(p.author), removed = !!p.removed;
      return `<article class="panel post ${dev ? 'is-dev' : ''} ${i === 0 ? 'is-op' : ''} ${removed ? 'is-removed' : ''} ${p.pending ? 'is-pending' : ''}" id="post-${esc(p.id)}">
        ${F.avatar(u)}
        <div>
          <div class="who"><span class="name">${userLink(p.author)}</span>${dev ? devBadge() : ''}${u ? F.badges(u.badges.filter(b => b !== 'Founder')) : ''}<span>· ${F.timeEl(p.created)}</span>${p.pending ? '<span class="badge badge-dim">awaiting approval</span>' : ''}</div>
          <div class="body">${removed ? '<p>[removed by a moderator]</p>' : F.textToHtml(p.body)}</div>
          <div class="actions"><button class="btn btn-ghost btn-sm" data-act="report" data-post="${esc(p.id)}" aria-label="Report this post by ${esc(p.author)}">${window.Clutch.pxIcon('flag', 'ico')} Report</button></div>
        </div>
      </article>`;
    }).join('');
    app.innerHTML = `${crumbs([[`#c-${esc(t.cat)}`, c ? c.name : t.cat], [null, t.title]])}
      <div class="forum-head"><div><div class="row" style="gap:8px;margin-bottom:.4rem">${t.pinned ? pinBadge() : ''}${isDevUser(t.author) ? devBadge() : ''}</div><h1 class="wrap-any" style="font-size:clamp(1.8rem,5vw,3rem)">${esc(t.title)}</h1><p>Started by ${userLink(t.author)} · ${F.timeEl(t.created)}</p></div></div>
      <div class="posts">${postHtml}</div>
      ${replyBox(t, s)}`;
  }

  function replyBox(t, s) {
    const block = F.postBlock(s);
    if (block === 'login') return `<div class="panel reply-box"><p class="inline-login" style="margin:0">${loginLink()} to reply. Accounts are for ages 13 and up.</p></div>`;
    if (block) return `<div class="panel reply-box locked"><p style="margin:0">${esc(block)}</p></div>`;
    if (settings().lockOffTopic && t.cat === 'off-topic' && !F.isMod(s)) return `<div class="panel reply-box locked"><p style="margin:0">Off-Topic is locked right now. You can read, but not reply.</p></div>`;
    return `<form class="panel reply-box" data-reply="${esc(t.id)}" novalidate>
      <h3 style="margin-top:0">Reply as ${esc(s.username)}</h3>
      <div class="field"><label for="reply-body">Your reply</label><textarea id="reply-body" name="body" required maxlength="4000" placeholder="Be kind. No personal info."></textarea><span class="hint">Posts are public and filtered for personal info and language. ${settings().approveFirst && !hasPostedBefore(s.username) ? 'Your first post waits for a moderator to approve it.' : ''}</span></div>
      <p class="form-status" aria-live="polite" id="reply-status"></p>
      <div class="row"><button class="btn btn-primary" type="submit">Post reply</button><a class="btn btn-ghost" href="#rules">Rules</a></div>
    </form>`;
  }

  function renderNewThread(slug) {
    const c = cat(slug); if (!c || c.href) return renderMissing('You can’t start a thread there.');
    const s = me(), block = F.postBlock(s);
    let body;
    if (block === 'login') body = `<div class="panel"><p style="margin:0">${loginLink()} to start a thread.</p></div>`;
    else if (block) body = `<div class="panel locked"><p style="margin:0">${esc(block)}</p></div>`;
    else if (c.founderOnly && !F.isFounder(s)) body = `<div class="panel locked"><p style="margin:0">Only the founder can start threads in Announcements. You can reply to any of them.</p></div>`;
    else if (settings().lockOffTopic && slug === 'off-topic' && !F.isMod(s)) body = `<div class="panel locked"><p style="margin:0">Off-Topic is locked right now.</p></div>`;
    else body = `<form class="panel" data-new-thread novalidate>
      <div class="field"><label for="nt-cat">Category</label><select id="nt-cat" name="cat">${CATS.filter(x => !x.href && (!x.founderOnly || F.isFounder(s)) && !(settings().lockOffTopic && x.slug === 'off-topic' && !F.isMod(s))).map(x => `<option value="${x.slug}" ${x.slug === slug ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="nt-title">Title</label><input id="nt-title" name="title" required maxlength="120" placeholder="Say what it’s about in one line"></div>
      <div class="field"><label for="nt-body">Post</label><textarea id="nt-body" name="body" required maxlength="6000" placeholder="Details, steps, settings. No personal info, no photos."></textarea><span class="hint">Words only. Posts are public and filtered. ${settings().approveFirst && !hasPostedBefore(s.username) ? 'Your first post waits for a moderator to approve it.' : ''}</span></div>
      <p class="form-status" aria-live="polite" id="nt-status"></p>
      <div class="row"><button class="btn btn-primary" type="submit">Post thread</button><a class="btn btn-ghost" href="#c-${esc(slug)}">Cancel</a></div>
    </form>`;
    app.innerHTML = `${crumbs([[`#c-${esc(slug)}`, c.name], [null, 'New thread']])}<div class="forum-head"><div><h1>New thread</h1><p>in ${esc(c.name)}</p></div></div>${body}`;
  }

  function renderRequests() {
    const s = me();
    let list = requests().slice();
    if (ui.reqStatus !== 'All') list = list.filter(r => r.status === ui.reqStatus);
    const count = (r) => r.votes + (r.voters || []).length;
    list.sort(ui.reqSort === 'votes' ? (a, b) => count(b) - count(a) : (a, b) => b.created.localeCompare(a.created));
    const block = F.postBlock(s);
    const rows = list.map(r => {
      const voted = s && (r.voters || []).includes(s.username);
      return `<article class="panel req-row" id="req-${esc(r.id)}">
        <button class="vote" data-act="vote" data-req="${esc(r.id)}" aria-pressed="${voted ? 'true' : 'false'}" ${s ? '' : 'disabled'} aria-label="${voted ? 'Remove your vote' : 'Upvote'} ${esc(r.title)}, ${count(r)} votes" ${s ? '' : 'title="Log in to vote"'}><span class="arrow" aria-hidden="true">▲</span><span class="n">${count(r)}</span></button>
        <div><div class="top"><h3>${esc(r.title)}</h3>${statusBadge(r.status)}</div><p>${esc(r.body)}</p><div class="meta">${userLink(r.author)} · ${F.timeEl(r.created)}</div></div>
      </article>`;
    }).join('');
    const pills = ['All', 'Open', 'Planned', 'In progress', 'Shipped'].map(st => `<button type="button" data-act="req-status" data-status="${st}" aria-pressed="${ui.reqStatus === st}">${st}</button>`).join('');
    let form = '';
    if (ui.showReqForm) {
      if (block === 'login') form = `<div class="panel" style="margin-top:1rem"><p style="margin:0">${loginLink()} to add a request.</p></div>`;
      else if (block) form = `<div class="panel locked" style="margin-top:1rem"><p style="margin:0">${esc(block)}</p></div>`;
      else form = `<form class="panel" data-new-request novalidate style="margin-top:1rem">
        <h3 style="margin-top:0">New request</h3>
        <div class="field"><label for="rq-title">What should Clutch do?</label><input id="rq-title" name="title" required maxlength="90" placeholder="One line, like a headline"></div>
        <div class="field"><label for="rq-body">Why it helps</label><textarea id="rq-body" name="body" required maxlength="1000" placeholder="A sentence or two. What problem does it fix?"></textarea></div>
        <p class="form-status" aria-live="polite" id="rq-status"></p>
        <div class="row"><button class="btn btn-primary" type="submit">Add request</button><button class="btn btn-ghost" type="button" data-act="toggle-req-form">Cancel</button></div>
      </form>`;
    }
    app.innerHTML = `${crumbs([[null, 'Feature Requests']])}
      <div class="forum-head"><div><h1>Feature requests</h1><p>Vote for what you want next. One vote per person per request; tap again to take it back.</p></div><button class="btn btn-primary btn-sm" type="button" data-act="toggle-req-form" aria-expanded="${ui.showReqForm}">New request</button></div>
      ${!s ? `<p class="dim" style="margin:-.5rem 0 1rem">${loginLink('Log in')} to vote and add requests.</p>` : ''}
      ${form}
      <div class="req-toolbar">
        <div class="pill-nav" role="group" aria-label="Filter by status">${pills}</div>
        <label class="row" style="gap:8px"><span class="muted">Sort</span><select class="sort-select" data-act="req-sort" aria-label="Sort requests"><option value="votes" ${ui.reqSort === 'votes' ? 'selected' : ''}>Most votes</option><option value="newest" ${ui.reqSort === 'newest' ? 'selected' : ''}>Newest</option></select></label>
      </div>
      <div class="req-list">${rows || '<div class="panel empty">Nothing with that status yet.</div>'}</div>`;
  }

  function renderProfile(sl) {
    const u = F.userBySlug(sl); if (!u) return renderMissing('No one by that name here.');
    const ts = threads().filter(t => t.author === u.username && !t.removed).sort((a, b) => b.created.localeCompare(a.created));
    const n = posts().filter(p => p.author === u.username && !p.removed && !p.pending).length;
    const st = F.userStatus(u.username);
    app.innerHTML = `${crumbs([[null, u.username]])}
      <div class="panel profile-card">${F.avatar(u, 'avatar-lg')}<div><h1 class="wrap-any">${esc(u.username)}</h1><div class="row" style="gap:6px">${F.badges(u.badges)}</div><p class="dim" style="margin:.6rem 0 0">Joined ${esc(F.fmtMonth(u.joined))} · ${n} ${n === 1 ? 'post' : 'posts'}${st.state !== 'ok' ? ` · <span style="color:var(--warn)">${esc(st.label)}</span>` : ''}</p></div></div>
      <p class="dim" style="font-size:.9rem;margin:1rem 0 2rem">Profiles show a username, a pixel avatar and badges. Never a real name, photo or location.</p>
      <h2 style="font-size:1.6rem">Threads by ${esc(u.username)}</h2>
      <div class="thread-list">${ts.length ? ts.map(threadRow).join('') : '<div class="panel empty">No threads yet.</div>'}</div>`;
  }

  function renderRules() {
    app.innerHTML = `${crumbs([[null, 'Rules']])}
      <div class="forum-head"><div><h1>Forum rules, short version</h1><p>The full Community Guidelines are on their own page.</p></div></div>
      <div class="panel">
        <ul class="checks pink">
          <li>Be kind. Disagree with the idea, not the person.</li>
          <li>Usernames only. Never share real names, phone numbers, addresses, emails, photos or social links, yours or anyone else’s.</li>
          <li>No private messages exist here. Everything is public, on purpose.</li>
          <li>No selling or trading.</li>
          <li>No cheating talk in online games.</li>
          <li>13 and up. Younger kids can use the app with a parent’s help, but not the forum.</li>
          <li>See something off? Use Report on the post. A moderator will look.</li>
        </ul>
        <div class="row"><a class="btn btn-primary" href="guidelines.html">Read the full Community Guidelines</a><a class="btn btn-ghost" href="#home">Back to the forum</a></div>
      </div>`;
  }

  function renderMissing(msg) {
    app.innerHTML = `${crumbs([[null, 'Not found']])}<div class="panel empty"><p>${esc(msg)}</p><a class="btn btn-ghost" href="#home">Back to the forum</a></div>`;
  }

  function route() {
    const h = (location.hash || '#home').slice(1);
    let m;
    if (h === '' || h === 'home') renderHome();
    else if ((m = h.match(/^c-([a-z0-9-]+)$/))) renderCategory(m[1]);
    else if ((m = h.match(/^t-([a-z0-9]+)$/i))) renderThread(m[1]);
    else if ((m = h.match(/^new-([a-z0-9-]+)$/))) renderNewThread(m[1]);
    else if (h === 'requests') renderRequests();
    else if ((m = h.match(/^u-([a-z0-9-]+)$/))) renderProfile(m[1]);
    else if (h === 'rules') renderRules();
    else renderMissing('That page doesn’t exist.');
    if (!/^t-/.test(h) || !document.querySelector('.posts')) window.scrollTo(0, 0);
  }

  /* ------------------------------ actions -------------------------------- */
  function setStatus(id, msg, ok) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.style.color = ok ? 'var(--ok)' : 'var(--danger)'; } }

  function submitReply(form) {
    const s = me(), tid = form.dataset.reply;
    if (F.postBlock(s)) { route(); return; }
    const body = form.body.value.trim();
    const err = F.checkPost(body); if (err) { setStatus('reply-status', err); form.body.focus(); return; }
    const pending = !!settings().approveFirst && !hasPostedBefore(s.username) && !F.isMod(s);
    const p = { id: F.uid('p'), thread: tid, author: s.username, body, created: new Date().toISOString(), pending };
    DB.set('posts', [...posts(), p]);
    toast(pending ? 'Posted. A moderator will approve it soon.' : 'Reply posted');
    route();
    const el = document.getElementById('post-' + p.id); if (el) el.scrollIntoView({ block: 'center' });
  }

  function submitThread(form) {
    const s = me(); if (F.postBlock(s)) { route(); return; }
    const c = cat(form.cat.value); if (!c || c.href) return;
    if (c.founderOnly && !F.isFounder(s)) { setStatus('nt-status', 'Only the founder can post in Announcements.'); return; }
    if (settings().lockOffTopic && c.slug === 'off-topic' && !F.isMod(s)) { setStatus('nt-status', 'Off-Topic is locked right now.'); return; }
    const title = form.title.value.trim(), body = form.body.value.trim();
    if (!title) { setStatus('nt-status', 'Give it a title.'); form.title.focus(); return; }
    let err = F.checkPost(title); if (err) { setStatus('nt-status', 'Title: ' + err); form.title.focus(); return; }
    err = F.checkPost(body); if (err) { setStatus('nt-status', err); form.body.focus(); return; }
    const pending = !!settings().approveFirst && !hasPostedBefore(s.username) && !F.isMod(s);
    const t = { id: F.uid('t'), cat: c.slug, title, author: s.username, created: new Date().toISOString(), pinned: false };
    DB.set('threads', [...threads(), t]);
    DB.set('posts', [...posts(), { id: F.uid('p'), thread: t.id, author: s.username, body, created: t.created, pending }]);
    toast(pending ? 'Posted. A moderator will approve it soon.' : 'Thread posted');
    location.hash = '#t-' + t.id;
  }

  function submitRequest(form) {
    const s = me(); if (F.postBlock(s)) { route(); return; }
    const title = form.title.value.trim(), body = form.body.value.trim();
    if (!title) { setStatus('rq-status', 'Give it a title.'); form.title.focus(); return; }
    let err = F.checkPost(title); if (err) { setStatus('rq-status', err); return; }
    err = F.checkPost(body); if (err) { setStatus('rq-status', err); return; }
    const r = { id: F.uid('r'), title, body, author: s.username, status: 'Open', votes: 0, voters: [s.username], created: new Date().toISOString() };
    DB.set('requests', [...requests(), r]);
    ui.showReqForm = false; ui.reqSort = 'newest'; ui.reqStatus = 'All';
    toast('Request added. You voted for it.');
    renderRequests();
  }

  function toggleVote(id) {
    const s = me(); if (!s) { toast('Log in to vote'); return; }
    const all = requests(); const r = all.find(x => x.id === id); if (!r) return;
    r.voters = r.voters || [];
    const i = r.voters.indexOf(s.username);
    if (i >= 0) r.voters.splice(i, 1); else r.voters.push(s.username);
    DB.set('requests', all);
    renderRequests();
    const b = document.querySelector(`[data-act="vote"][data-req="${CSS.escape(id)}"]`); if (b) b.focus();
  }

  function openReport(postId) {
    const p = posts().find(x => x.id === postId); if (!p) return;
    const s = me();
    openModal(`
      <h3 id="modal-title">Report this post</h3>
      <p class="muted" style="font-size:.95rem">By ${esc(p.author)}: “${esc(p.body.slice(0, 120))}${p.body.length > 120 ? '…' : ''}”</p>
      <form id="report-form" novalidate>
        <div class="field"><label for="rp-reason">Why are you reporting it?</label>
          <select id="rp-reason" name="reason" required>
            <option value="Personal info">Shares personal info (names, numbers, addresses, links)</option>
            <option value="Unkind or bullying">Unkind, bullying or hateful</option>
            <option value="Spam or selling">Spam, selling or trading</option>
            <option value="Online games rule">Breaks the online games rule</option>
            <option value="Wrong category">Wrong category or off topic</option>
            <option value="Something else">Something else</option>
          </select></div>
        <div class="field"><label for="rp-note">Anything else? <span class="dim">(optional)</span></label><textarea id="rp-note" name="note" maxlength="500" style="min-height:90px"></textarea></div>
        <div class="row"><button class="btn btn-primary" type="submit">Send report</button><button class="btn btn-ghost" type="button" id="modal-close">Cancel</button></div>
      </form>`);
    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('report-form').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      const rep = { id: F.uid('rep'), postId: p.id, threadId: p.thread, reportedUser: p.author, reporter: s ? s.username : 'guest', reason: f.reason.value, note: f.note.value.trim(), at: new Date().toISOString(), status: 'open' };
      DB.set('reports', [...(DB.get('reports') || []), rep]);
      closeModal();
      toast('Reported. A moderator will look.');
    });
  }

  /* ------------------------------ wiring --------------------------------- */
  app.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || !app.contains(el)) return;
    const act = el.dataset.act;
    if (act === 'report') openReport(el.dataset.post);
    else if (act === 'vote') toggleVote(el.dataset.req);
    else if (act === 'req-status') { ui.reqStatus = el.dataset.status; renderRequests(); const b = document.querySelector(`[data-act="req-status"][data-status="${CSS.escape(ui.reqStatus)}"]`); if (b) b.focus(); }
    else if (act === 'toggle-req-form') { ui.showReqForm = !ui.showReqForm; renderRequests(); const f = document.getElementById('rq-title'); if (f) f.focus(); }
  });
  app.addEventListener('change', e => {
    const el = e.target.closest('[data-act="req-sort"]'); if (!el) return;
    ui.reqSort = el.value; renderRequests(); const s2 = document.querySelector('[data-act="req-sort"]'); if (s2) s2.focus();
  });
  app.addEventListener('submit', e => {
    const f = e.target;
    if (f.matches('[data-reply]')) { e.preventDefault(); submitReply(f); }
    else if (f.matches('[data-new-thread]')) { e.preventDefault(); submitThread(f); }
    else if (f.matches('[data-new-request]')) { e.preventDefault(); submitRequest(f); }
  });

  // Discord button only when a URL is configured (CLUTCH_CONFIG first, then the admin Settings store).
  (function discord() {
    const url = (window.CLUTCH_CONFIG && window.CLUTCH_CONFIG.DISCORD_URL) || settings().discordUrl || '';
    const slot = document.getElementById('discord-slot');
    if (slot && /^https:\/\/(discord\.gg|discord\.com)\//i.test(url)) slot.innerHTML = `<a class="btn btn-ghost btn-sm" href="${esc(url)}" rel="noopener">${window.Clutch.pxIcon('chat', 'ico')} Discord</a>`;
  })();

  window.addEventListener('hashchange', route);
  route();
})();
