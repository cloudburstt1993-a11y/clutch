/* ==========================================================================
   CLUTCH — admin.js
   Founder / moderator dashboard. Gated on session.role (founder | mod).
   Tabs (plain hash names): #overview · #mod-queue · #users · #requests
   #settings · #cms  (CMS sub-views: #cms-guides · #cms-posts)
   All data is local to this browser through ClutchDB (prototype).
   ========================================================================== */
(function () {
  'use strict';
  const { esc, toast, openModal, closeModal } = window.Clutch;
  const DB = window.ClutchDB;
  const F = window.ClutchForum;
  const app = document.getElementById('app');
  const ui = { cmsKind: 'guides', editing: null };   // editing: { kind, item, isCopy }

  const me = () => F.syncSession();
  const threads = () => DB.get('threads') || [];
  const posts = () => DB.get('posts') || [];
  const requests = () => DB.get('requests') || [];
  const reports = () => DB.get('reports') || [];
  const settings = () => ({ profanity: true, approveFirst: false, lockOffTopic: false, discordUrl: '', ...(DB.get('settings') || {}) });
  const STATUSES = ['Open', 'Planned', 'In progress', 'Shipped'];
  const STATUS_CLASS = { 'Shipped': 'badge-ok', 'In progress': 'badge-cyan', 'Planned': 'badge-violet', 'Open': 'badge-dim' };
  const statusBadge = (s) => `<span class="badge ${STATUS_CLASS[s] || 'badge-dim'}">${esc(s)}</span>`;
  const excerpt = (t, n) => { t = String(t || ''); return esc(t.slice(0, n || 160)) + (t.length > (n || 160) ? '…' : ''); };

  /* ------------------------------ shell ---------------------------------- */
  const TABS = [['overview', 'Overview'], ['mod-queue', 'Moderation queue'], ['users', 'Users'], ['requests', 'Feature requests'], ['settings', 'Settings'], ['cms', 'CMS']];
  function shell(tab, inner) {
    const s = me();
    const openCount = reports().filter(r => r.status === 'open').length + posts().filter(p => p.pending).length;
    app.innerHTML = `<div class="admin-head"><div><p class="eyebrow">ADMIN</p><h1>Dashboard</h1><p>Signed in as <strong>${esc(s.username)}</strong> (${esc(s.role)}). <a href="community">Open the forum</a></p></div><span class="badge badge-dim">Prototype · local data</span></div>
      <nav class="pill-nav" id="tabs" aria-label="Admin sections">${TABS.map(([k, l]) => `<a href="#${k}" ${k === tab ? 'aria-current="page"' : ''}>${l}${k === 'mod-queue' && openCount ? ` (${openCount})` : ''}</a>`).join('')}</nav>
      <div id="tab-body">${inner}</div>`;
  }

  function renderLocked() {
    const s = me();
    app.innerHTML = `<div class="panel locked-panel">${window.Clutch.pxIcon('lock', 'px-lg')}<h1 style="font-size:2.2rem;margin-top:1rem">Moderators only</h1>
      <p class="muted">${s ? `You’re logged in as <strong>${esc(s.username)}</strong>, but this dashboard is for the founder and moderators.` : 'Log in with a founder or moderator account to open the dashboard.'}</p>
      <div class="row" style="justify-content:center"><a class="btn btn-primary" href="account?next=admin">${s ? 'Switch account' : 'Log in'}</a><a class="btn btn-ghost" href="community">Back to the forum</a></div>
      <p class="dim" style="font-size:.9rem;margin-top:1.5rem">Prototype: on the account page, use “Log in as founder (Dillon)” at the bottom to demo this dashboard.</p></div>`;
  }

  /* ------------------------------ Overview ------------------------------- */
  function renderOverview() {
    const r = reports(), p = posts(), t = threads(), q = requests(), out = DB.get('outbox') || [], lic = DB.get('licenses') || [], users = F.users(), mod = F.moderation();
    const by = (arr, k) => arr.reduce((m, x) => { m[x[k]] = (m[x[k]] || 0) + 1; return m; }, {});
    const outBy = by(out, 'type'), reqBy = by(q, 'status');
    const card = (n, lbl, sub) => `<div class="panel stat-card"><span class="stat">${n}</span><span class="lbl">${lbl}</span>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
    shell('overview', `<h2 style="font-size:1.5rem;margin-top:1rem">Live data from this browser (prototype)</h2>
      <p class="muted">Everything below comes from localStorage on this device. Point ClutchDB at a backend and these become real.</p>
      <div class="stat-grid">
        ${card(r.filter(x => x.status === 'open').length, 'Open reports', `${r.length} total · <a href="#mod-queue">queue</a>`)}
        ${card(p.filter(x => x.pending).length, 'Posts awaiting approval', settings().approveFirst ? 'first-post approval is on' : 'first-post approval is off')}
        ${card(t.filter(x => !x.removed).length, 'Threads', `${p.filter(x => !x.removed).length} posts`)}
        ${card(users.length, 'Users', `${Object.keys(mod.muted || {}).length} muted · ${(mod.banned || []).length} banned`)}
        ${card(q.length, 'Feature requests', STATUSES.map(s => `${reqBy[s] || 0} ${s.toLowerCase()}`).join(' · '))}
        ${card(outBy.waitlist || 0, 'Waitlist sign-ups', 'demo outbox (no FORM_ENDPOINT set)')}
        ${card((outBy.support || 0) + (outBy.report || 0), 'Support submissions', `${outBy.support || 0} support · ${outBy.report || 0} report form`)}
        ${card(lic.length, 'Licenses issued', lic.length ? `${lic.filter(l => l.test).length} in test mode` : 'none yet')}
      </div>
      <div class="panel" style="margin-top:1.25rem"><div class="row between"><div><h3 style="margin:0 0 .2em">Export all data (JSON)</h3><p class="muted" style="margin:0">Users, threads, posts, requests, reports, settings, CMS, outbox and licenses, so this prototype content can be migrated to a backend later.</p></div><button type="button" class="btn btn-ghost" data-act="export">Show export</button></div></div>`);
  }

  function showExport() {
    const json = JSON.stringify(DB.dump(), null, 2);
    openModal(`<h3 id="modal-title">Export (JSON)</h3><p class="muted" style="font-size:.95rem">Copy this and save it as <code>clutch-export.json</code>. Downloads are blocked in this viewer, so it’s copy-paste.</p>
      <textarea class="export-box" id="export-box" readonly aria-label="Exported JSON">${esc(json)}</textarea>
      <div class="row" style="margin-top:1rem"><button class="btn btn-primary" id="export-copy">Copy to clipboard</button><button class="btn btn-ghost" id="modal-close">Close</button></div>
      <p class="form-status" id="export-status" aria-live="polite"></p>`);
    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('export-copy').onclick = () => {
      const box = document.getElementById('export-box'), st = document.getElementById('export-status');
      const fallback = () => { box.focus(); box.select(); st.textContent = 'Selected. Press Ctrl+C (or Cmd+C) to copy.'; };
      try { navigator.clipboard.writeText(json).then(() => { st.textContent = 'Copied.'; st.style.color = 'var(--ok)'; }, fallback); } catch (e) { fallback(); }
    };
  }

  /* ------------------------------ Moderation queue ----------------------- */
  function renderQueue() {
    const open = reports().filter(r => r.status === 'open').sort((a, b) => b.at.localeCompare(a.at));
    const done = reports().filter(r => r.status !== 'open').sort((a, b) => b.at.localeCompare(a.at));
    const pending = posts().filter(p => p.pending).sort((a, b) => a.created.localeCompare(b.created));
    const item = (r) => {
      const p = posts().find(x => x.id === r.postId); const t = p && threads().find(x => x.id === p.thread);
      const who = r.reportedUser || (p && p.author) || 'unknown';
      const st = F.userStatus(who);
      return `<article class="panel queue-item">
        <div class="row between"><div><strong>${esc(r.reason)}</strong> <span class="meta">· reported by ${esc(r.reporter)} · ${F.timeEl(r.at)}</span></div>${p && p.removed ? '<span class="badge badge-dim">post removed</span>' : ''}</div>
        <div class="excerpt">${p ? (p.removed ? '<em>[removed by a moderator]</em>' : excerpt(p.body, 240)) : '<em>Post no longer exists.</em>'}</div>
        <div class="meta">Post by <strong>${esc(who)}</strong>${st.state !== 'ok' ? ` (${esc(st.label)})` : ''}${t ? ` in <a href="community#t-${esc(t.id)}">${esc(t.title)}</a>` : ''}${r.note ? ` · Note: “${esc(r.note)}”` : ''}</div>
        <div class="acts">
          <button class="btn btn-ghost btn-sm" data-act="dismiss" data-id="${esc(r.id)}">Dismiss</button>
          ${p && !p.removed ? `<button class="btn btn-warn btn-sm" data-act="remove-post" data-id="${esc(r.id)}" data-post="${esc(p.id)}">Remove post</button>` : ''}
          <button class="btn btn-warn btn-sm" data-act="mute" data-user="${esc(who)}" data-days="7" data-id="${esc(r.id)}">Mute 7 days</button>
          <button class="btn btn-warn btn-sm" data-act="mute" data-user="${esc(who)}" data-days="30" data-id="${esc(r.id)}">Mute 30 days</button>
          <button class="btn btn-danger btn-sm" data-act="ban" data-user="${esc(who)}" data-id="${esc(r.id)}">Ban user</button>
        </div></article>`;
    };
    const pend = (p) => { const t = threads().find(x => x.id === p.thread); return `<article class="panel queue-item is-pending">
        <div class="row between"><div><strong>First post awaiting approval</strong> <span class="meta">· by ${esc(p.author)} · ${F.timeEl(p.created)}</span></div></div>
        <div class="excerpt">${excerpt(p.body, 240)}</div>
        <div class="meta">${t ? `In <a href="community#t-${esc(t.id)}">${esc(t.title)}</a>` : ''}</div>
        <div class="acts"><button class="btn btn-primary btn-sm" data-act="approve" data-post="${esc(p.id)}">Approve</button><button class="btn btn-warn btn-sm" data-act="reject" data-post="${esc(p.id)}">Remove</button></div></article>`; };
    shell('mod-queue', `<h2 style="font-size:1.5rem;margin-top:1rem">Moderation queue</h2>
      ${pending.length ? `<h3 style="font-size:1.1rem">Awaiting approval (${pending.length})</h3><div class="list-gap" style="margin-bottom:1.5rem">${pending.map(pend).join('')}</div>` : ''}
      <h3 style="font-size:1.1rem">Open reports (${open.length})</h3>
      <div class="list-gap">${open.length ? open.map(item).join('') : '<div class="panel center dim" style="padding:2rem">Nothing waiting. Nice.</div>'}</div>
      ${done.length ? `<details style="margin-top:1.5rem"><summary>Resolved reports (${done.length})</summary><div class="body"><ul style="padding-left:1.1rem;margin:0">${done.map(r => `<li><strong>${esc(r.reason)}</strong> on a post by ${esc(r.reportedUser || '?')} · ${esc(r.status)}${r.action ? ` (${esc(r.action)})` : ''} · ${F.fmtDate(r.at)}</li>`).join('')}</ul></div></details>` : ''}`);
  }
  function resolveReport(id, status, action) { DB.set('reports', reports().map(r => r.id === id ? { ...r, status, action, resolvedAt: new Date().toISOString() } : r)); }
  function removePost(postId) { DB.set('posts', posts().map(p => p.id === postId ? { ...p, removed: true, pending: false } : p)); }
  function approvePost(postId) { DB.set('posts', posts().map(p => p.id === postId ? { ...p, pending: false } : p)); }
  function muteUser(name, days) { const m = F.moderation(); m.muted = m.muted || {}; m.muted[name] = new Date(Date.now() + days * 86400000).toISOString(); DB.set('moderation', m); }
  function unmuteUser(name) { const m = F.moderation(); if (m.muted) delete m.muted[name]; DB.set('moderation', m); }
  function banUser(name) { const m = F.moderation(); m.banned = Array.from(new Set([...(m.banned || []), name])); DB.set('moderation', m); }
  function unbanUser(name) { const m = F.moderation(); m.banned = (m.banned || []).filter(x => x !== name); DB.set('moderation', m); }
  function confirmThen(title, body, label, fn) {
    openModal(`<h3 id="modal-title">${title}</h3><p class="muted">${body}</p><div class="row"><button class="btn btn-danger" id="cf-yes">${label}</button><button class="btn btn-ghost" id="modal-close">Cancel</button></div>`);
    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('cf-yes').onclick = () => { closeModal(); fn(); };
  }

  /* ------------------------------ Users ---------------------------------- */
  function renderUsers() {
    const rows = F.users().slice().sort((a, b) => a.username.localeCompare(b.username)).map(u => {
      const st = F.userStatus(u.username), founder = F.isFounder(u);
      const grant = (b) => `<button class="btn btn-ghost btn-sm" data-act="badge" data-user="${esc(u.username)}" data-badge="${b}">${u.badges.includes(b) ? 'Remove' : 'Grant'} ${b}</button>`;
      return `<tr><td><span class="uname">${esc(u.username)}</span><br><span class="dim" style="font-size:.85rem">joined ${esc(F.fmtMonth(u.joined))} · ${esc(u.role)}</span></td>
        <td data-label="Badges"><div class="row" style="gap:4px">${F.badges(u.badges) || '<span class="dim">none</span>'}</div></td>
        <td data-label="Status" class="status-${st.state}">${esc(st.label)}</td>
        <td><div class="acts">${grant('Helper')}${grant('Beta tester')}${founder ? '' : `${st.state === 'muted' ? `<button class="btn btn-ghost btn-sm" data-act="unmute" data-user="${esc(u.username)}">Unmute</button>` : `<button class="btn btn-warn btn-sm" data-act="mute" data-user="${esc(u.username)}" data-days="7">Mute 7d</button>`}${st.state === 'banned' ? `<button class="btn btn-ghost btn-sm" data-act="unban" data-user="${esc(u.username)}">Unban</button>` : `<button class="btn btn-danger btn-sm" data-act="ban" data-user="${esc(u.username)}">Ban</button>`}`}</div></td></tr>`;
    }).join('');
    shell('users', `<h2 style="font-size:1.5rem;margin-top:1rem">Users (${F.users().length})</h2><p class="muted">Usernames only; no real names or emails are shown here either.</p>
      <div class="table-wrap panel" style="padding:.25rem .5rem"><table class="table users-table"><thead><tr><th>Username</th><th>Badges</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  function toggleBadge(name, b) { const u = F.user(name); if (!u) return; u.badges = u.badges.includes(b) ? u.badges.filter(x => x !== b) : [...u.badges, b]; F.saveUser(u); }

  /* ------------------------------ Feature requests ----------------------- */
  function renderRequests() {
    const list = requests().slice().sort((a, b) => (b.votes + (b.voters || []).length) - (a.votes + (a.voters || []).length));
    shell('requests', `<h2 style="font-size:1.5rem;margin-top:1rem">Feature requests</h2><p class="muted">Change a status and the board updates for everyone (in this browser).</p>
      <div class="list-gap">${list.map(r => `<div class="panel req-admin"><div><h3>${esc(r.title)} ${statusBadge(r.status)}</h3><div class="m">${r.votes + (r.voters || []).length} votes · ${esc(r.author || 'deleted account')} · ${F.fmtDate(r.created)}</div></div>
        <label class="row" style="gap:8px"><span class="sr-only">Status for ${esc(r.title)}</span><select class="sel" data-act="req-status" data-id="${esc(r.id)}">${STATUSES.map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>`).join('')}</div>`);
  }

  /* ------------------------------ Settings ------------------------------- */
  function renderSettings() {
    const s = settings(), isF = F.isFounder(me());
    const tog = (key, label, hint) => `<div class="toggle"><label for="st-${key}">${label}<span class="hint">${hint}</span></label><span class="switch"><input type="checkbox" id="st-${key}" data-act="setting" data-key="${key}" ${s[key] ? 'checked' : ''}><span></span></span></div>`;
    shell('settings', `<h2 style="font-size:1.5rem;margin-top:1rem">Settings</h2>
      <div class="panel">
        ${tog('profanity', 'Profanity filter', 'On by default and recommended to stay on: this is a 13+ community with younger players around. The personal-info checks (phone numbers, emails, addresses, social links) are always on.')}
        ${tog('approveFirst', 'Require moderator approval for a new account’s first post', 'New members’ first post waits in the queue. Good for slowing down spam.')}
        ${tog('lockOffTopic', 'Lock Off-Topic', 'Nobody except moderators can post in Off-Topic while this is on.')}
      </div>
      <form class="panel" data-discord style="margin-top:1rem"><h3>Discord link</h3><p class="muted">Optional. The forum stays the main home. When set, a Discord button shows at the top of the community page. Prototype: saved in this browser; for the live site set <code>CLUTCH_CONFIG.DISCORD_URL</code> in js/site.js.</p>
        <div class="field"><label for="st-discord">Invite URL</label><input id="st-discord" name="discordUrl" type="url" placeholder="https://discord.gg/…" value="${esc(s.discordUrl)}"></div>
        <div class="row"><button class="btn btn-primary btn-sm" type="submit">Save link</button>${s.discordUrl ? '<button class="btn btn-ghost btn-sm" type="button" data-act="clear-discord">Remove link</button>' : ''}</div></form>
      ${isF ? `<form class="panel" data-announce style="margin-top:1rem"><h3>Post an announcement</h3><p class="muted">Creates a Dev thread in Announcements. Founder only.</p>
        <div class="field"><label for="an-title">Title</label><input id="an-title" name="title" required maxlength="120"></div>
        <div class="field"><label for="an-body">Body</label><textarea id="an-body" name="body" required maxlength="6000"></textarea></div>
        <label class="check" style="margin-bottom:1rem"><input type="checkbox" name="pinned" checked> <span>Pin it to the top</span></label>
        <p class="form-status" id="an-status" aria-live="polite"></p>
        <div class="row"><button class="btn btn-primary btn-sm" type="submit">Post announcement</button></div></form>` : '<div class="panel" style="margin-top:1rem"><p class="dim" style="margin:0">Announcements are posted by the founder.</p></div>'}`);
  }
  function saveSetting(key, val) { DB.set('settings', { ...settings(), [key]: val }); toast(val ? 'On' : 'Off'); }

  /* ------------------------------ CMS ------------------------------------ */
  const GUIDE_DEFAULTS = () => (window.CLUTCH_GUIDES || []).map(g => ({ ...g, _static: true }));
  const POST_DEFAULTS = () => (window.CLUTCH_POSTS || []).map(p => ({ ...p, _static: true }));
  const cmsGuides = () => DB.get('cms.guides') || [];
  const cmsPosts = () => DB.get('cms.posts') || [];

  function renderCms() {
    const kind = ui.cmsKind;
    const sub = `<div class="pill-nav" role="group" aria-label="Content type" style="margin:0 0 1rem"><button type="button" data-act="cms-kind" data-kind="guides" aria-pressed="${kind === 'guides'}">Guides</button><button type="button" data-act="cms-kind" data-kind="posts" aria-pressed="${kind === 'posts'}">Changelog &amp; news</button></div>`;
    const custom = kind === 'guides' ? cmsGuides() : cmsPosts();
    const defaults = kind === 'guides' ? GUIDE_DEFAULTS() : POST_DEFAULTS();
    const keyOf = (x) => kind === 'guides' ? x.slug : x.id;
    const overridden = new Set(custom.map(keyOf));
    const row = (x, isStatic) => `<div class="panel cms-row"><div><div class="t">${esc(x.title)}</div><div class="m">${kind === 'guides' ? esc(x.category || '') : esc(x.type || '') + (x.version ? ' · ' + esc(x.version) : '')}${x.date || x.updated ? ' · ' + esc(x.date || x.updated) : ''} · <code>${esc(keyOf(x))}</code>${isStatic ? (overridden.has(keyOf(x)) ? ' · <span class="badge badge-dim">overridden</span>' : '') : ' · <span class="badge badge-cyan">CMS</span>'}</div></div>
      <div class="acts">${isStatic ? `<button class="btn btn-ghost btn-sm" data-act="cms-edit" data-key="${esc(keyOf(x))}" data-static="1">Edit as copy</button>` : `<button class="btn btn-ghost btn-sm" data-act="cms-edit" data-key="${esc(keyOf(x))}">Edit</button><button class="btn btn-danger btn-sm" data-act="cms-delete" data-key="${esc(keyOf(x))}">Delete</button>`}</div></div>`;
    const list = `<div class="row between" style="margin-bottom:.75rem"><h3 style="margin:0;font-size:1.15rem">${kind === 'guides' ? 'Guides' : 'Posts'}</h3><button class="btn btn-primary btn-sm" data-act="cms-new">New ${kind === 'guides' ? 'guide' : 'post'}</button></div>
      <div class="cms-list">${custom.map(x => row(x, false)).join('')}${defaults.length ? `<p class="dim" style="margin:.75rem 0 .25rem;font-size:.9rem">Built-in defaults (read-only, from js/${kind === 'guides' ? 'guides' : 'changelog'}-data.js). “Edit as copy” makes a CMS version that overrides it by ${kind === 'guides' ? 'slug' : 'id'}.</p>` : ''}${defaults.map(x => row(x, true)).join('')}</div>`;
    shell('cms', `<h2 style="font-size:1.5rem;margin-top:1rem">Content</h2><p class="muted">Edits save to this browser’s <code>cms.guides</code> / <code>cms.posts</code> stores, which the Guides and Changelog pages merge in (CMS wins).</p>${sub}
      <div class="cms-layout"><div>${list}</div><div id="cms-editor">${ui.editing ? editorHtml() : '<div class="panel center dim" style="padding:2rem">Pick an item to edit, or make a new one.</div>'}</div></div>`);
    if (ui.editing) { updatePreview(); if (window.innerWidth < 900) { const ed = document.getElementById('cms-editor'); if (ed) ed.scrollIntoView({ block: 'start' }); } }
  }
  function editorHtml() {
    const { kind, item, isCopy } = ui.editing;
    const common = `<p class="form-status" id="cms-status" aria-live="polite"></p><div class="row"><button class="btn btn-primary btn-sm" type="submit">Save</button><button class="btn btn-ghost btn-sm" type="button" data-act="cms-cancel">Cancel</button></div>`;
    if (kind === 'guides') return `<form class="panel" data-cms-form novalidate><h3 style="margin-top:0">${isCopy ? 'Edit as copy' : item.slug ? 'Edit guide' : 'New guide'}</h3>
      <div class="field"><label for="g-title">Title</label><input id="g-title" name="title" required value="${esc(item.title || '')}"></div>
      <div class="field"><label for="g-slug">Slug</label><input id="g-slug" name="slug" required pattern="[a-z0-9-]+" value="${esc(item.slug || '')}" ${item._static || (!isCopy && item.slug) ? 'readonly' : ''}><span class="hint">Letters, digits, hyphens. Same slug as a built-in guide overrides it.</span></div>
      <div class="field"><label for="g-cat">Category</label><input id="g-cat" name="category" list="g-cats" value="${esc(item.category || '')}"><datalist id="g-cats">${(window.CLUTCH_GUIDE_CATEGORIES || []).map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field"><label for="g-summary">Summary</label><input id="g-summary" name="summary" value="${esc(item.summary || '')}"></div>
      <div class="field"><label for="g-body">Body</label><textarea id="g-body" name="body" data-preview style="min-height:220px">${esc(item.body || '')}</textarea><span class="hint">Simple HTML or markdown-lite: **bold**, blank line = new paragraph, [text](https://…) = link. Ban-risk notes use <code>&lt;div class="ban-note"&gt;⚠️ …&lt;/div&gt;</code>.</span></div>
      ${common}</form>
      <div class="panel preview" style="margin-top:1rem"><p class="eyebrow">LIVE PREVIEW</p><h3 id="pv-title">${esc(item.title || '')}</h3><div class="body" id="pv-body"></div></div>`;
    return `<form class="panel" data-cms-form novalidate><h3 style="margin-top:0">${isCopy ? 'Edit as copy' : item.id ? 'Edit post' : 'New post'}</h3>
      <div class="field"><label for="p-type">Type</label><select id="p-type" name="type"><option value="release" ${item.type === 'release' ? 'selected' : ''}>Release</option><option value="news" ${item.type === 'news' ? 'selected' : ''}>News / dev post</option></select></div>
      <div class="field"><label for="p-title">Title</label><input id="p-title" name="title" required value="${esc(item.title || '')}"></div>
      <div class="field"><label for="p-id">Id</label><input id="p-id" name="id" required pattern="[a-z0-9-]+" value="${esc(item.id || '')}" ${item._static || (!isCopy && item.id) ? 'readonly' : ''}><span class="hint">Letters, digits, hyphens. Same id as a built-in post overrides it.</span></div>
      <div class="grid grid-2"><div class="field"><label for="p-version">Version</label><input id="p-version" name="version" placeholder="e.g. 1.4.0" value="${esc(item.version || '')}"></div><div class="field"><label for="p-date">Date</label><input id="p-date" name="date" type="date" value="${esc(item.date || '')}"></div></div>
      <div class="field"><label for="p-body">Body</label><textarea id="p-body" name="body" data-preview style="min-height:220px">${esc(item.src || item.body || '')}</textarea><span class="hint">Markdown-lite: **bold**, blank line = new paragraph, [text](https://…) = link. Simple HTML also works.</span></div>
      ${common}</form>
      <div class="panel preview" style="margin-top:1rem"><p class="eyebrow">LIVE PREVIEW</p><div class="row" style="gap:8px;margin-bottom:.5rem"><span class="badge ${item.type === 'news' ? 'badge-violet' : 'badge-cyan'}" id="pv-type">${item.type === 'news' ? 'DEV' : 'RELEASE'}</span><span class="badge badge-dim" id="pv-version">${esc(item.version || '')}</span></div><h3 id="pv-title">${esc(item.title || '')}</h3><div class="body" id="pv-body"></div></div>`;
  }
  // Body text may be HTML (from the data files) or markdown-lite. If it has tags, trust it as HTML authored by a mod; otherwise render markdown-lite.
  function renderBody(src) { return /<[a-z][\s\S]*>/i.test(src) ? src : F.mdLite(src); }
  function updatePreview() {
    const f = document.querySelector('[data-cms-form]'); if (!f) return;
    const body = document.getElementById('pv-body'), title = document.getElementById('pv-title');
    if (body) body.innerHTML = renderBody(f.body.value);
    if (title) title.textContent = f.title.value;
    const v = document.getElementById('pv-version'); if (v && f.version) v.textContent = f.version.value;
    const ty = document.getElementById('pv-type'); if (ty && f.type) { ty.textContent = f.type.value === 'news' ? 'DEV' : 'RELEASE'; ty.className = 'badge ' + (f.type.value === 'news' ? 'badge-violet' : 'badge-cyan'); }
  }
  function cmsEdit(key, isStatic) {
    const kind = ui.cmsKind;
    const src = isStatic ? (kind === 'guides' ? GUIDE_DEFAULTS() : POST_DEFAULTS()) : (kind === 'guides' ? cmsGuides() : cmsPosts());
    const item = src.find(x => (kind === 'guides' ? x.slug : x.id) === key); if (!item) return;
    ui.editing = { kind, item: { ...item }, isCopy: !!isStatic }; renderCms(); const t = document.querySelector('[data-cms-form] input'); if (t) t.focus();
  }
  function cmsSave(form) {
    const kind = ui.editing.kind, st = document.getElementById('cms-status');
    const title = form.title.value.trim(), body = form.body.value;
    if (!title) { st.textContent = 'Give it a title.'; st.style.color = 'var(--danger)'; return; }
    if (kind === 'guides') {
      const slug = form.slug.value.trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(slug)) { st.textContent = 'Slug: letters, digits and hyphens only.'; st.style.color = 'var(--danger)'; return; }
      const d = new Date();
      const g = { slug, title, category: form.category.value.trim() || 'Getting started', summary: form.summary.value.trim(), updated: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, body: renderBody(body), src: body, fromCms: true };
      DB.set('cms.guides', [...cmsGuides().filter(x => x.slug !== slug), g]);
    } else {
      const id = form.id.value.trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(id)) { st.textContent = 'Id: letters, digits and hyphens only.'; st.style.color = 'var(--danger)'; return; }
      const p = { id, type: form.type.value, title, version: form.version.value.trim(), date: form.date.value, author: 'Founder', body: renderBody(body), src: body, fromCms: true };
      DB.set('cms.posts', [...cmsPosts().filter(x => x.id !== id), p]);
    }
    ui.editing = null; toast('Saved'); renderCms();
  }
  function cmsDelete(key) {
    const kind = ui.cmsKind;
    confirmThen('Delete this item?', 'The CMS copy is removed. If a built-in default has the same key it shows again.', 'Delete', () => {
      if (kind === 'guides') DB.set('cms.guides', cmsGuides().filter(x => x.slug !== key)); else DB.set('cms.posts', cmsPosts().filter(x => x.id !== key));
      ui.editing = null; toast('Deleted'); renderCms();
    });
  }

  /* ------------------------------ routing -------------------------------- */
  function route() {
    const s = me();
    if (!F.isMod(s)) { renderLocked(); return; }
    let h = (location.hash || '#overview').slice(1);
    if (h === 'cms-guides') { ui.cmsKind = 'guides'; h = 'cms'; } else if (h === 'cms-posts') { ui.cmsKind = 'posts'; h = 'cms'; }
    const fn = { overview: renderOverview, 'mod-queue': renderQueue, users: renderUsers, requests: renderRequests, settings: renderSettings, cms: renderCms }[h] || renderOverview;
    fn(); window.scrollTo(0, 0);
  }
  const rerender = () => route();

  /* ------------------------------ wiring --------------------------------- */
  app.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act, id = el.dataset.id, user = el.dataset.user;
    if (a === 'export') showExport();
    else if (a === 'dismiss') { resolveReport(id, 'dismissed'); toast('Report dismissed'); rerender(); }
    else if (a === 'remove-post') { removePost(el.dataset.post); if (id) resolveReport(id, 'actioned', 'post removed'); toast('Post removed. It now shows “[removed by a moderator]”.'); rerender(); }
    else if (a === 'approve') { approvePost(el.dataset.post); toast('Post approved'); rerender(); }
    else if (a === 'reject') { removePost(el.dataset.post); toast('Post removed'); rerender(); }
    else if (a === 'mute') { muteUser(user, +el.dataset.days); if (id) resolveReport(id, 'actioned', `muted ${el.dataset.days} days`); toast(`${user} muted for ${el.dataset.days} days`); rerender(); }
    else if (a === 'unmute') { unmuteUser(user); toast(`${user} unmuted`); rerender(); }
    else if (a === 'ban') confirmThen(`Ban ${esc(user)}?`, 'They can still read the forum but can’t post, reply, vote or add requests. You can unban from the Users tab.', 'Ban user', () => { banUser(user); if (id) resolveReport(id, 'actioned', 'user banned'); toast(`${user} banned`); rerender(); });
    else if (a === 'unban') { unbanUser(user); toast(`${user} unbanned`); rerender(); }
    else if (a === 'badge') { toggleBadge(user, el.dataset.badge); toast('Badges updated'); rerender(); }
    else if (a === 'clear-discord') { DB.set('settings', { ...settings(), discordUrl: '' }); toast('Discord link removed'); rerender(); }
    else if (a === 'cms-kind') { ui.cmsKind = el.dataset.kind; ui.editing = null; renderCms(); }
    else if (a === 'cms-new') { ui.editing = { kind: ui.cmsKind, item: ui.cmsKind === 'guides' ? { category: 'Getting started' } : { type: 'news' }, isCopy: false }; renderCms(); const t = document.querySelector('[data-cms-form] input'); if (t) t.focus(); }
    else if (a === 'cms-edit') cmsEdit(el.dataset.key, !!el.dataset.static);
    else if (a === 'cms-delete') cmsDelete(el.dataset.key);
    else if (a === 'cms-cancel') { ui.editing = null; renderCms(); }
  });
  app.addEventListener('change', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    if (el.dataset.act === 'setting') saveSetting(el.dataset.key, el.checked);
    else if (el.dataset.act === 'req-status') { DB.set('requests', requests().map(r => r.id === el.dataset.id ? { ...r, status: el.value } : r)); toast(`Status: ${el.value}`); renderRequests(); const s2 = document.querySelector(`[data-act="req-status"][data-id="${CSS.escape(el.dataset.id)}"]`); if (s2) s2.focus(); }
  });
  app.addEventListener('input', e => { if (e.target.closest('[data-cms-form]')) updatePreview(); });
  app.addEventListener('submit', e => {
    const f = e.target; e.preventDefault();
    if (f.matches('[data-discord]')) {
      const v = f.discordUrl.value.trim();
      if (v && !/^https:\/\/(discord\.gg|discord\.com)\//i.test(v)) { toast('Use a https://discord.gg/… or https://discord.com/… link'); return; }
      DB.set('settings', { ...settings(), discordUrl: v }); toast(v ? 'Discord link saved' : 'Discord link removed'); rerender();
    } else if (f.matches('[data-announce]')) {
      const s = me(); if (!F.isFounder(s)) return;
      const title = f.title.value.trim(), body = f.body.value.trim(), st = document.getElementById('an-status');
      if (!title || !body) { st.textContent = 'Title and body are both needed.'; st.style.color = 'var(--danger)'; return; }
      const err = F.checkPost(body) || F.checkPost(title); if (err) { st.textContent = err; st.style.color = 'var(--danger)'; return; }
      const t = { id: F.uid('t'), cat: 'announcements', title, author: s.username, created: new Date().toISOString(), pinned: f.pinned.checked };
      DB.set('threads', [...threads(), t]); DB.set('posts', [...posts(), { id: F.uid('p'), thread: t.id, author: s.username, body, created: t.created }]);
      toast('Announcement posted'); f.reset(); st.textContent = `Posted. View it in the forum: community#t-${t.id}`; st.style.color = 'var(--ok)';
    } else if (f.matches('[data-cms-form]')) cmsSave(f);
  });

  window.addEventListener('hashchange', route);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', route); else route();
})();
