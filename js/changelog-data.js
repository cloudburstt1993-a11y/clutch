/* ==========================================================================
   CLUTCH — changelog-data.js
   Releases and dev posts. The admin CMS can add or override entries by id via
   Clutch.store('cms.posts'); changelog.js merges the two lists (CMS first).
   type: 'release' | 'news'. date: 'YYYY-MM-DD' or 'YYYY-MM' or '' (unknown).
   Do not invent past version numbers or dates here; GitHub is the source of
   truth for release history.
   ========================================================================== */
window.CLUTCH_POSTS = [
  {
    id: 'latest-release',
    type: 'release',
    title: 'Latest release',
    date: '',
    author: 'Founder',
    body: `
<p>Release notes for every Clutch build, including version numbers, dates and what changed, live on GitHub next to the installer. That way the notes and the download can never drift apart.</p>
<p><a class="btn btn-primary btn-sm" data-releases href="#" target="_blank" rel="noopener">Open the releases page</a></p>
<p class="dim" style="font-size:.9rem">The download button on this site always points at the latest release. If you are on an older build, run the installer again over the top; your profiles and settings stay put.</p>`
  },
  {
    id: 'hello-from-the-founder',
    type: 'news',
    title: 'Hello from the founder',
    date: '2026-11',
    author: 'Founder',
    body: `
<p>Hi. I build Clutch, and I want to tell you where it came from.</p>
<p>My kids wanted controller mods. The kind of thing their friends talked about: hair triggers, a steadier stick, a profile for each game. Everything I found either meant pasting scripts from a forum, paying a monthly fee, or trusting something I would not have let them run on a PC I cared about. So I built the thing I wished existed: a Windows app where you tap a power-up and it just works, with controls a parent can actually set.</p>
<p>That is still the whole idea. Pay once. No scripts, no coding. Online-safe mode on by default, because I do not want anyone's kid losing an account over a setting they did not understand.</p>
<p>What is next: the <a href="console-kit">Clutch Console Kit</a>, a small box that brings Clutch to consoles and is set up from a phone. It is in development, and the waitlist is open. I will post progress here as it happens, honestly, including the parts that are slow.</p>
<p>If you have a question, a bug or an idea, the <a href="community">forum</a> is where to talk. I read it, I answer there, and once a month there is a pinned "Talk to the founder" thread where anything goes.</p>
<p>Thanks for being here this early.</p>`
  }
];
