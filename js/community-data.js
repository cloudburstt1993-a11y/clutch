/* ==========================================================================
   CLUTCH — community-data.js
   Shared by community.html, account.html and admin.html.
   1. ClutchDB  — storage adapter (localStorage today, API later)
   2. CLUTCH_SEED — demo content the prototype starts with
   3. ClutchForum — small shared helpers (filter, users, time, badges)
   ========================================================================== */

/* ------------------------------ 1. ADAPTER -------------------------------
   Every page reads and writes through ClutchDB, never localStorage directly.
   SWAP THESE FOR API CALLS: point get/set at Supabase (or any backend) and
   the pages keep working. Keys used: session, users, threads, posts,
   requests, reports, moderation, settings, cms.guides, cms.posts, licenses,
   outbox.                                                                  */
window.ClutchDB = {
  get(key) { return window.Clutch.store(key); },               // -> value or null
  set(key, val) { return window.Clutch.store(key, val); },     // -> val
  remove(key) { try { localStorage.removeItem('clutch.' + key); } catch (e) { /* ignore */ } },
  // Seeds any store that is still empty. Safe to call on every page load.
  init() {
    const S = window.CLUTCH_SEED;
    ['users', 'threads', 'posts', 'requests'].forEach(k => { if (!this.get(k)) this.set(k, S[k]); });
    if (!this.get('reports')) this.set('reports', []);
    if (!this.get('moderation')) this.set('moderation', { muted: {}, banned: [] });
    if (!this.get('settings')) this.set('settings', { profanity: true, approveFirst: false, lockOffTopic: false, discordUrl: '' });
    // CMS overrides live in flat keys so guides.js / changelog.js can merge them by slug / id.
    if (!this.get('cms.guides')) this.set('cms.guides', []);
    if (!this.get('cms.posts')) this.set('cms.posts', []);
    if (!this.get('seedVersion')) this.set('seedVersion', S.version);
  },
  // Everything under the clutch.* prefix, for Export / migration.
  dump() {
    const out = {};
    try { Object.keys(localStorage).filter(k => k.startsWith('clutch.')).forEach(k => { out[k.slice(7)] = JSON.parse(localStorage.getItem(k)); }); } catch (e) { /* ignore */ }
    return out;
  }
};

/* ------------------------------ 2. SEED ---------------------------------- */
(function () {
  // Fixed dates so the forum reads the same for everyone (site "today" is Nov 2026).
  const d = (s) => new Date(s).toISOString();

  const categories = [
    { slug: 'announcements', name: 'Announcements', blurb: 'News from the founder. Only the founder can start threads here; anyone can reply.', icon: 'flag', founderOnly: true },
    { slug: 'help-setup', name: 'Help & Setup', blurb: 'Stuck? Ask here. Double-press fixes, HidHide, Steam Input, controllers that won’t show up.', icon: 'gear' },
    { slug: 'profile-pack-sharing', name: 'Profile & Pack Sharing', blurb: 'Post your settings and borrow other people’s.', icon: 'controller' },
    { slug: 'feature-requests', name: 'Feature Requests', blurb: 'Vote on what gets built next. Statuses: Planned, In progress, Shipped.', icon: 'star', href: '#requests' },
    { slug: 'show-your-setup', name: 'Show Your Setup', blurb: 'Describe your desk, your controllers and how you have Clutch set up. Words only, no photos.', icon: 'eye' },
    { slug: 'console-kit-beta', name: 'Console Kit Beta', blurb: 'Coming soon. Beta news and questions. Waitlist members get first invites.', icon: 'box' },
    { slug: 'off-topic', name: 'Off-Topic', blurb: 'Everything else, as long as it’s kind.', icon: 'chat' },
  ];

  // Usernames only. Pixel avatars 0–7. Never real names or photos.
  const users = [
    { username: 'Dillon', avatar: 0, badges: ['Founder'], role: 'founder', joined: '2026-08' },
    { username: 'pixelpenny', avatar: 3, badges: ['Early supporter', 'Helper'], role: 'member', joined: '2026-09' },
    { username: 'turbo_tay', avatar: 5, badges: ['Early supporter', 'Pro'], role: 'member', joined: '2026-09' },
    { username: 'nova.k', avatar: 1, badges: ['Early supporter'], role: 'member', joined: '2026-09' },
    { username: 'gridlock_gus', avatar: 6, badges: ['Pro', 'Beta tester'], role: 'member', joined: '2026-10' },
    { username: 'mossy_mitts', avatar: 2, badges: ['Early supporter'], role: 'member', joined: '2026-10' },
    { username: 'byte_bunny', avatar: 7, badges: ['Helper'], role: 'member', joined: '2026-10' },
  ];

  const threads = [
    { id: '1', cat: 'announcements', title: 'Welcome to Clutch: start here', author: 'Dillon', created: d('2026-09-02T16:00:00Z'), pinned: true },
    { id: '2', cat: 'announcements', title: 'Talk to the founder: November Q&A', author: 'Dillon', created: d('2026-11-01T15:00:00Z'), pinned: true },
    { id: '3', cat: 'help-setup', title: 'Double-press on A button: the HidHide fix that worked', author: 'nova.k', created: d('2026-10-12T22:10:00Z') },
    { id: '4', cat: 'help-setup', title: 'Steam Input on or off?', author: 'mossy_mitts', created: d('2026-10-20T01:30:00Z') },
    { id: '5', cat: 'help-setup', title: 'Controller shows up twice in the game menu', author: 'byte_bunny', created: d('2026-11-03T20:05:00Z') },
    { id: '6', cat: 'profile-pack-sharing', title: 'My racing pack settings (smooth steering, hair brake)', author: 'turbo_tay', created: d('2026-10-15T19:40:00Z') },
    { id: '7', cat: 'profile-pack-sharing', title: 'Battle royale shooter pack: my steady aim numbers', author: 'pixelpenny', created: d('2026-10-28T23:15:00Z') },
    { id: '8', cat: 'show-your-setup', title: 'Desk setup: two controllers, one PC, zero cable mess', author: 'gridlock_gus', created: d('2026-10-24T18:00:00Z') },
    { id: '9', cat: 'show-your-setup', title: 'Setting up a profile for my little brother', author: 'nova.k', created: d('2026-11-05T21:20:00Z') },
    { id: '10', cat: 'console-kit-beta', title: 'Beta sign-ups will open to waitlist members first', author: 'Dillon', created: d('2026-10-30T17:00:00Z') },
    { id: '11', cat: 'off-topic', title: 'What are you playing this weekend?', author: 'mossy_mitts', created: d('2026-11-06T22:00:00Z') },
    { id: '12', cat: 'off-topic', title: 'Favorite controller color?', author: 'byte_bunny', created: d('2026-10-18T15:30:00Z') },
  ];

  // The first post in each thread is the thread body. Posts by the founder are shown as Dev.
  const posts = [
    // thread 1 Welcome
    { id: 'p1', thread: '1', author: 'Dillon', created: d('2026-09-02T16:00:00Z'), body: 'Hi, I’m Dillon. I built Clutch for my kids, then their friends wanted it, and here we are.\n\nThis forum is where you share your settings, get help with setup, and tell me what to build next. A few things to know:\n\n• Be kind. Everyone here was new once.\n• Usernames only. No real names, phone numbers, addresses or photos.\n• No selling or trading.\n• Also, no cheating talk in online games.\n• See something off? Hit Report. A moderator will look.\n\nStuck? Post in Help & Setup. Proud of your desk? Show Your Setup is yours. Have fun.' },
    { id: 'p2', thread: '1', author: 'pixelpenny', created: d('2026-09-02T18:12:00Z'), body: 'Hi! Happy to help anyone with setup questions. I’ve been through most of the weird controller issues already.' },
    { id: 'p3', thread: '1', author: 'turbo_tay', created: d('2026-09-03T01:40:00Z'), body: 'My little sister picked the pink avatar before I could. Great start.' },
    { id: 'p4', thread: '1', author: 'Dillon', created: d('2026-09-03T14:05:00Z'), body: 'Ha, that sounds about right. Welcome, both of you.' },

    // thread 2 November Q&A
    { id: 'p5', thread: '2', author: 'Dillon', created: d('2026-11-01T15:00:00Z'), body: 'Ask me anything about Clutch this month. I read every question and answer in this thread, and my replies get a Dev tag so they’re easy to spot.\n\nBug reports are welcome too, but Help & Setup usually gets you a faster answer because everyone there can chip in.' },
    { id: 'p6', thread: '2', author: 'pixelpenny', created: d('2026-11-01T17:22:00Z'), body: 'Will there be a way to share a whole profile with a friend, not just type out the settings?' },
    { id: 'p7', thread: '2', author: 'Dillon', created: d('2026-11-01T19:00:00Z'), body: 'Yes. “Export/import profiles as a file” is In progress on the request board. You’ll save a profile to a file and send it however you like, and the other person imports it.' },
    { id: 'p8', thread: '2', author: 'turbo_tay', created: d('2026-11-02T02:10:00Z'), body: 'Any chance of a light theme? The purple is nice but my brother wants light mode.' },
    { id: 'p9', thread: '2', author: 'Dillon', created: d('2026-11-02T15:30:00Z'), body: 'It’s on the board as Open. Vote for it if you want it, I’m watching the votes.' },
    { id: 'p10', thread: '2', author: 'gridlock_gus', created: d('2026-11-04T20:45:00Z'), body: 'When does Console Kit testing start?' },
    { id: 'p11', thread: '2', author: 'Dillon', created: d('2026-11-04T22:00:00Z'), body: 'No date yet, and I won’t guess one. Waitlist members get the first invites. There’s a thread in Console Kit Beta with everything I can say so far.' },

    // thread 3 HidHide fix
    { id: 'p12', thread: '3', author: 'nova.k', created: d('2026-10-12T22:10:00Z'), body: 'My A button was registering twice in every game. Turns out the game could see both my real controller and the Clutch virtual one, so every press counted twice.\n\nThe fix:\n1. Open HidHide.\n2. Make sure Clutch is on the allowed apps list.\n3. Hide your physical controller.\n4. Restart the game.\n\nOne press, one action. Hope this saves someone an evening.' },
    { id: 'p13', thread: '3', author: 'byte_bunny', created: d('2026-10-13T00:30:00Z'), body: 'This fixed it for me too. Took one restart.' },
    { id: 'p14', thread: '3', author: 'Dillon', created: d('2026-10-13T15:10:00Z'), body: 'Thanks for writing this up so clearly. I’ve added it to the Guides page under “HidHide and double-press fixes” so it’s easier to find.' },
    { id: 'p15', thread: '3', author: 'mossy_mitts', created: d('2026-10-21T19:50:00Z'), body: 'Mine kept double pressing until I unplugged and replugged the controller after hiding it. Then it was fine.' },

    // thread 4 Steam Input
    { id: 'p16', thread: '4', author: 'mossy_mitts', created: d('2026-10-20T01:30:00Z'), body: 'Some games feel fine with Steam Input on, others seem to fight with Clutch. Which do you use?' },
    { id: 'p17', thread: '4', author: 'turbo_tay', created: d('2026-10-20T02:15:00Z'), body: 'Off for me. Clutch handles everything, and Steam Input on top of it felt like two people steering.' },
    { id: 'p18', thread: '4', author: 'Dillon', created: d('2026-10-20T14:40:00Z'), body: 'Short answer: off, for any game you run with Clutch. Steam Input and Clutch both try to translate your controller, and two translators get messy.\n\nRight-click the game in Steam → Properties → Controller → Disable Steam Input. There’s a step-by-step on the Guides page.' },
    { id: 'p19', thread: '4', author: 'pixelpenny', created: d('2026-10-20T21:00:00Z'), body: 'I leave it on only for the odd game that refuses to see a controller any other way, and I turn Clutch’s power-ups off for those.' },

    // thread 5 Controller twice
    { id: 'p20', thread: '5', author: 'byte_bunny', created: d('2026-11-03T20:05:00Z'), body: 'The game lists “Controller 1” and “Controller 2” and only one of them does anything. Is that normal?' },
    { id: 'p21', thread: '5', author: 'nova.k', created: d('2026-11-03T20:40:00Z'), body: 'Same cause as the double-press thing. It can see your real controller and the Clutch one. Follow the HidHide steps in my thread and it goes back to one.' },
    { id: 'p22', thread: '5', author: 'byte_bunny', created: d('2026-11-03T22:10:00Z'), body: 'That did it. Thanks!' },

    // thread 6 Racing pack
    { id: 'p23', thread: '6', author: 'turbo_tay', created: d('2026-10-15T19:40:00Z'), body: 'Racing pack, then a couple of tweaks:\n\n• Smooth aim on the left stick (it’s steering here), one notch up.\n• Hair trigger on the brake.\n• Normal pull on the throttle.\n\nThe hair brake means a tap slows me down right away, and smooth steering stops the car twitching on straights.' },
    { id: 'p24', thread: '6', author: 'gridlock_gus', created: d('2026-10-15T21:00:00Z'), body: 'Hair brake is the one. I tried it on the throttle too and that was way too jumpy.' },
    { id: 'p25', thread: '6', author: 'Dillon', created: d('2026-10-16T14:20:00Z'), body: 'Good write-up. This is close to what the Racing pack does out of the box, so if anyone wants this feel: pick Racing, then bump smooth aim one notch.' },
    { id: 'p26', thread: '6', author: 'mossy_mitts', created: d('2026-10-17T18:05:00Z'), body: 'Does smooth aim make the steering feel slow?' },
    { id: 'p27', thread: '6', author: 'turbo_tay', created: d('2026-10-17T18:30:00Z'), body: 'A tiny bit. One notch is fine. Three felt like driving in syrup.' },

    // thread 7 Shooter pack
    { id: 'p28', thread: '7', author: 'pixelpenny', created: d('2026-10-28T23:15:00Z'), body: 'Battle royale shooter pack, then: steady aim medium, smooth aim low, hair triggers on both. Crosshair is a small cyan dot.\n\nOnline-safe mode is on and I left it on. The pack still feels great.' },
    { id: 'p29', thread: '7', author: 'nova.k', created: d('2026-10-29T00:05:00Z'), body: 'Does Online-safe mode turn any of that off?' },
    { id: 'p30', thread: '7', author: 'pixelpenny', created: d('2026-10-29T00:20:00Z'), body: 'Not these. It pauses the risky power-ups in online games, and hair triggers, smooth aim and steady aim stay on.' },
    { id: 'p31', thread: '7', author: 'Dillon', created: d('2026-10-29T15:00:00Z'), body: 'Right. Online-safe mode pauses the power-ups that online games are most likely to flag. Everything in this post stays on. No tool can promise zero risk, so keep it on in online games.' },

    // thread 8 Desk setup
    { id: 'p32', thread: '8', author: 'gridlock_gus', created: d('2026-10-24T18:00:00Z'), body: 'Describing it since we don’t do photos here:\n\nOne PC under the desk, two controllers on a little wooden stand. One wired, one over Bluetooth. Each has its own Clutch profile so my sister and I don’t mess with each other’s settings. A single USB hub, cables tied behind the monitor arm. Zero cable mess, which took longer than setting up Clutch did.' },
    { id: 'p33', thread: '8', author: 'turbo_tay', created: d('2026-10-24T19:30:00Z'), body: 'The controller stand is the move. Mine live in a pile.' },
    { id: 'p34', thread: '8', author: 'byte_bunny', created: d('2026-10-25T16:00:00Z'), body: 'How do you switch profiles without alt-tabbing? Quick menu?' },
    { id: 'p35', thread: '8', author: 'gridlock_gus', created: d('2026-10-25T16:45:00Z'), body: 'Yep. Hold the quick menu button, pick the profile, done. We each have our own colour so it’s obvious whose is on.' },

    // thread 9 Little brother
    { id: 'p36', thread: '9', author: 'nova.k', created: d('2026-11-05T21:20:00Z'), body: 'Made my little brother his own profile with the starter packs. Parent PIN is on so he can’t change my settings by accident, and quiet hours kick in at bedtime. The whole thing took about five minutes.' },
    { id: 'p37', thread: '9', author: 'Dillon', created: d('2026-11-06T14:10:00Z'), body: 'This is exactly why the per-kid profiles exist. Thanks for sharing it.' },
    { id: 'p38', thread: '9', author: 'pixelpenny', created: d('2026-11-06T17:45:00Z'), body: 'Tip: give his profile a different crosshair colour so you can tell at a glance whose is loaded.' },

    // thread 10 Console Kit beta
    { id: 'p39', thread: '10', author: 'Dillon', created: d('2026-10-30T17:00:00Z'), body: 'When Console Kit beta testing starts, the first invites go to people on the waitlist, in the order they joined.\n\nThere’s no date yet. I’ll post here the moment there is one. You can join the waitlist on the Console Kit page.' },
    { id: 'p40', thread: '10', author: 'gridlock_gus', created: d('2026-10-30T18:20:00Z'), body: 'Joined. Which consoles first?' },
    { id: 'p41', thread: '10', author: 'Dillon', created: d('2026-10-30T19:00:00Z'), body: 'I’ll share that when I can promise it. What I can say now: it’s a plug-in box, you set it up from a phone over Bluetooth, and Pro is included.' },
    { id: 'p42', thread: '10', author: 'byte_bunny', created: d('2026-10-31T15:10:00Z'), body: 'Will beta testers get a badge?' },
    { id: 'p43', thread: '10', author: 'Dillon', created: d('2026-10-31T15:40:00Z'), body: 'Yes. The Beta tester badge, right on your profile.' },

    // thread 11 Weekend
    { id: 'p44', thread: '11', author: 'mossy_mitts', created: d('2026-11-06T22:00:00Z'), body: 'Racing for me. You?' },
    { id: 'p45', thread: '11', author: 'turbo_tay', created: d('2026-11-06T22:30:00Z'), body: 'A building game with my cousin. He builds, I knock things over.' },
    { id: 'p46', thread: '11', author: 'byte_bunny', created: d('2026-11-07T01:15:00Z'), body: 'Sports, then more sports.' },
    { id: 'p47', thread: '11', author: 'nova.k', created: d('2026-11-07T03:00:00Z'), body: 'Aim Lab practice. Does that count?' },

    // thread 12 Colour
    { id: 'p48', thread: '12', author: 'byte_bunny', created: d('2026-10-18T15:30:00Z'), body: 'Mine’s cyan. Fight me (kindly).' },
    { id: 'p49', thread: '12', author: 'pixelpenny', created: d('2026-10-18T16:00:00Z'), body: 'Pink, obviously.' },
    { id: 'p50', thread: '12', author: 'gridlock_gus', created: d('2026-10-18T20:10:00Z'), body: 'Black. It hides the snack fingerprints.' },
  ];

  // Feature requests. `votes` is the starting count; `voters` holds usernames who voted in this browser.
  const requests = [
    { id: 'r1', title: 'Per-game crosshair colors', body: 'Let each game pack remember its own crosshair colour instead of one global colour.', author: 'pixelpenny', status: 'Planned', votes: 23, voters: [], created: d('2026-09-20T18:00:00Z') },
    { id: 'r2', title: 'Export/import profiles as a file', body: 'Save a profile to a file so I can send it to a friend or move it to another PC.', author: 'turbo_tay', status: 'In progress', votes: 31, voters: [], created: d('2026-09-14T20:30:00Z') },
    { id: 'r3', title: 'Quick menu on a long-press', body: 'Open the in-game quick menu by holding a button instead of a combo.', author: 'gridlock_gus', status: 'Shipped', votes: 40, voters: [], created: d('2026-09-05T15:10:00Z') },
    { id: 'r4', title: 'Dark/light theme for the app', body: 'A light theme option for people who play in bright rooms.', author: 'turbo_tay', status: 'Open', votes: 9, voters: [], created: d('2026-11-02T02:20:00Z') },
    { id: 'r5', title: 'Gyro aim on controllers that have it', body: 'Use the motion sensor for fine aiming on controllers that support it.', author: 'nova.k', status: 'Open', votes: 17, voters: [], created: d('2026-10-08T19:00:00Z') },
    { id: 'r6', title: 'Quiet hours per kid profile', body: 'Different quiet hours for each kid, not one schedule for the whole PC.', author: 'mossy_mitts', status: 'Planned', votes: 12, voters: [], created: d('2026-10-22T17:45:00Z') },
    { id: 'r7', title: 'Pack notes: show what each pack changes', body: 'A short list on each pack card of exactly what it sets, so I know before I pick it.', author: 'byte_bunny', status: 'Open', votes: 6, voters: [], created: d('2026-11-04T21:00:00Z') },
    { id: 'r8', title: 'Controller battery warning', body: 'A small warning in the quick menu when the controller battery is low.', author: 'pixelpenny', status: 'Open', votes: 14, voters: [], created: d('2026-09-28T16:30:00Z') },
  ];

  window.CLUTCH_SEED = { version: 1, categories, users, threads, posts, requests };
})();

/* ------------------------------ 3. SHARED HELPERS ------------------------ */
(function () {
  'use strict';
  const DB = window.ClutchDB;
  const esc = (s) => window.Clutch.esc(s);

  // --- Post filter: short, obvious profanity list + personal-info checks. ---
  // Kept deliberately short and mild in source; extend server-side later.
  const BAD_WORDS = ['shit', 'fuck', 'bitch', 'asshole', 'bastard', 'dick', 'piss', 'slut', 'whore', 'retard', 'wtf', 'stfu'];
  const LEET = { a: '[a@4]', e: '[e3]', i: '[i1!|]', o: '[o0]', s: '[s$5]', t: '[t7]', u: '[u\\*]' };
  const BAD_RE = new RegExp('(?:^|[^a-z0-9])(' + BAD_WORDS.map(w => [...w].map(c => LEET[c] || c).join('[\\s._-]*')).join('|') + ')(?=$|[^a-z0-9])', 'i');
  const PI_CHECKS = [
    { re: /(\+?\d[\d\s().-]{7,}\d)/, min: 9, what: 'a phone number' },
    { re: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, what: 'an email address' },
    { re: /\b\d{1,6}\s+(?:[A-Za-z]+\s+){0,3}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|circle|cir|highway|hwy)\b\.?/i, what: 'a street address' },
    { re: /(?:discord\.gg|discord\.com\/invite|instagram\.com|tiktok\.com|snapchat\.com|facebook\.com|fb\.com|twitter\.com|x\.com\/|t\.me\/|wa\.me|whatsapp\.com|twitch\.tv|youtube\.com\/@|onlyfans)/i, what: 'a link to a social network' },
    { re: /\b(?:add me on|dm me on|my (?:snap|insta|discord|tiktok|whatsapp|telegram)(?: is| tag| handle)?)\b/i, what: 'an invitation to chat somewhere private' },
  ];
  // Returns null if OK, or a friendly message explaining what to change.
  function checkPost(text, opts) {
    const settings = DB.get('settings') || {};
    const t = String(text || '');
    if (!t.trim()) return 'Write something first.';
    if ((opts && opts.profanity !== undefined ? opts.profanity : settings.profanity !== false) && BAD_RE.test(t)) {
      return 'That post has a word we don’t allow here. Clutch is a 13+ community with younger players around, so keep it clean and try again.';
    }
    for (const c of PI_CHECKS) {
      const m = t.match(c.re);
      if (m && (!c.min || (m[0].match(/\d/g) || []).length >= c.min)) {
        return `That looks like it includes ${c.what}. For everyone’s safety we don’t allow sharing personal info or off-site contact details. Take it out and try again.`;
      }
    }
    return null;
  }

  // --- Users / session ---
  const users = () => DB.get('users') || [];
  const user = (name) => users().find(u => u.username.toLowerCase() === String(name || '').toLowerCase()) || null;
  function saveUser(u) { const all = users(); const i = all.findIndex(x => x.username.toLowerCase() === u.username.toLowerCase()); if (i < 0) all.push(u); else all[i] = u; DB.set('users', all); return u; }
  function session() { return DB.get('session'); }
  // Keep the session's badges/role in step with the users store (admin may have granted a badge).
  function syncSession() {
    const s = session(); if (!s) return null;
    const u = user(s.username); if (!u) return s;
    const next = { ...s, badges: u.badges, role: u.role, avatar: u.avatar };
    if (JSON.stringify(next) !== JSON.stringify(s)) DB.set('session', next);
    return next;
  }
  const isFounder = (u) => !!u && (u.role === 'founder' || (u.badges || []).includes('Founder'));
  const isMod = (u) => !!u && (u.role === 'founder' || u.role === 'mod');

  // --- Moderation state ---
  function moderation() { return DB.get('moderation') || { muted: {}, banned: [] }; }
  function userStatus(name) {
    const m = moderation();
    if ((m.banned || []).includes(name)) return { state: 'banned', label: 'Banned' };
    const until = (m.muted || {})[name];
    if (until && new Date(until) > new Date()) return { state: 'muted', label: 'Muted until ' + fmtDate(until), until };
    return { state: 'ok', label: 'Active' };
  }
  // Why can't this user post? null = fine.
  function postBlock(u) {
    if (!u) return 'login';
    const st = userStatus(u.username);
    if (st.state === 'banned') return 'Your account has been banned from posting. If you think that’s a mistake, contact support.';
    if (st.state === 'muted') return `You’re muted until ${fmtDate(st.until)}. You can read, but not post, until then.`;
    return null;
  }

  // --- Formatting ---
  const BADGE_CLASS = { 'Founder': 'badge-yellow', 'Early supporter': 'badge-pink', 'Pro': 'badge-cyan', 'Beta tester': 'badge-violet', 'Helper': 'badge-ok' };
  const badge = (b) => `<span class="badge ${BADGE_CLASS[b] || 'badge-dim'}">${esc(b)}</span>`;
  const badges = (list) => (list || []).map(badge).join(' ');
  const avatar = (u, cls) => window.Clutch.pxAvatar(u ? u.avatar : 0, cls);
  function ago(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
    return fmtDate(iso);
  }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } }
  function fmtMonth(ym) { const [y, m] = String(ym || '').split('-'); const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return (names[+m - 1] || '') + ' ' + (y || ''); }
  const timeEl = (iso) => `<time datetime="${esc(iso)}" title="${esc(new Date(iso).toLocaleString())}">${esc(ago(iso))}</time>`;
  // Plain text → safe HTML with paragraphs and line breaks (forum posts).
  function textToHtml(t) { return esc(t).split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join(''); }
  // Markdown-lite for CMS posts: **bold**, [text](https://…), line breaks. Everything escaped first.
  function mdLite(t) {
    let h = esc(t);
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|[a-z0-9./#?=_-]+\.html[^)\s]*)\)/gi, (m, txt, url) => `<a href="${url}">${txt}</a>`);
    return h.split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  }
  const uid = (p) => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); // letters+digits only (safe in hash routes)
  // Username -> hash-safe slug (letters, digits, hyphens). Lookup with userBySlug.
  const slug = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const userBySlug = (sl) => users().find(u => slug(u.username) === sl) || null;
  function qs(name) { return new URLSearchParams(location.search).get(name); }
  // Only allow same-site relative targets for ?next=
  function safeNext(v) { return v && /^[a-z0-9-]+\.html(?:[?#].*)?$/i.test(v) ? v : null; }

  // Header tweak: show "My account" when logged in (header itself lives in site.js).
  function decorateHeader() {
    const s = session(); if (!s) return;
    const a = document.querySelector('.nav-cta a[href="account.html"]'); if (a) a.textContent = 'My account';
  }

  window.ClutchForum = { checkPost, users, user, saveUser, session, syncSession, isFounder, isMod, moderation, userStatus, postBlock, badge, badges, avatar, ago, fmtDate, fmtMonth, timeEl, textToHtml, mdLite, uid, slug, userBySlug, qs, safeNext, decorateHeader, BADGE_CLASS, BAD_WORDS };
  DB.init();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorateHeader); else decorateHeader();
})();
