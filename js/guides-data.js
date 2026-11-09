/* ==========================================================================
   CLUTCH — guides-data.js
   Help center content. The admin CMS can add or override entries by slug via
   Clutch.store('cms.guides'); guides.js merges the two lists.
   Body is an HTML string. Keep steps generic for Windows 10/11.
   ========================================================================== */
window.CLUTCH_GUIDE_CATEGORIES = [
  'Getting started',
  'Fixes',
  'Steam & launchers',
  'Power-ups explained',
  'Family controls',
  'Account & license'
];

window.CLUTCH_GUIDES = [

  /* ----------------------------- Getting started ------------------------ */
  {
    slug: 'setup-in-3-steps',
    title: 'Setup in 3 steps',
    category: 'Getting started',
    summary: 'Download, plug in, tap a power-up. You can be playing in about a minute.',
    updated: '2026-11',
    body: `
<ol>
  <li><strong>Download and install.</strong> Get the Windows installer from the <a href="download.html">download page</a> and run it. Clutch runs on Windows 10 and 11. If Windows shows a blue box that says "Windows protected your PC", that is expected until the app is code-signed. <a href="#windows-protected-your-pc">Here is what to click.</a></li>
  <li><strong>Plug in your controller.</strong> USB or Bluetooth, whichever you have. Clutch finds Xbox, PlayStation, Switch Pro, GameSir and most other controllers on its own. When the controller card lights up in Clutch, you are connected. Having trouble? See <a href="#connect-controllers">Connecting your controller</a>.</li>
  <li><strong>Pick a game pack and tap a power-up.</strong> Choose the pack that matches the kind of game you are about to play, tap a power-up such as Hair triggers, then launch your game. That is it. No scripts, no coding.</li>
</ol>
<p>During install, Clutch also sets up <strong>HidHide</strong>, a small open-source driver that hides your physical controller so games only see Clutch's virtual one. Windows may ask you to approve the driver. Say yes. Without it, games can see two controllers at once and inputs get doubled. <a href="#hidhide-two-controllers">More on HidHide.</a></p>
<p><strong>Playing through Steam?</strong> Steam has its own controller layer called Steam Input. Clutch works best when only one layer is in charge. <a href="#steam-input">Read the Steam Input guide</a> before your first match.</p>
<p><strong>Setting up for your kids?</strong> Make a <a href="#profiles-for-every-kid">profile for each kid</a>, set a <a href="#parent-pin">parent PIN</a>, and leave <a href="#online-safe-mode">Online-safe mode</a> on. It is on by default.</p>`
  },

  {
    slug: 'connect-controllers',
    title: 'Connecting Xbox, PlayStation, Switch Pro and GameSir controllers',
    category: 'Getting started',
    summary: 'Wired and Bluetooth steps for each kind of controller, plus what to do when Windows cannot find it.',
    updated: '2026-11',
    body: `
<p>A USB cable is the most reliable way to connect any controller and has the lowest input delay. Bluetooth works well too; the steps below cover both. Connect one controller at a time the first time so you can tell which card in Clutch is which.</p>
<h3>Xbox controllers</h3>
<ol>
  <li><strong>Wired:</strong> plug in with a USB cable. Windows recognizes it right away.</li>
  <li><strong>Bluetooth:</strong> hold the small Pair button on the top edge until the Xbox button flashes fast.</li>
  <li>On your PC, open Settings → Bluetooth &amp; devices → Add device → Bluetooth, and choose "Xbox Wireless Controller".</li>
</ol>
<h3>PlayStation controllers (DualShock 4 and DualSense)</h3>
<ol>
  <li><strong>Wired:</strong> plug in with a USB cable. Windows sees it as a generic controller, and Clutch takes it from there.</li>
  <li><strong>Bluetooth:</strong> with the controller off, hold the Share button (Create on DualSense) and the PS button together until the light bar flashes.</li>
  <li>Add it in Settings → Bluetooth &amp; devices → Add device → Bluetooth. It shows up as "Wireless Controller".</li>
</ol>
<h3>Switch Pro controller</h3>
<ol>
  <li><strong>Wired:</strong> a USB-C cable works. Some older cables are charge-only, so try another if nothing happens.</li>
  <li><strong>Bluetooth:</strong> hold the tiny Sync button on the top edge next to the USB-C port until the player lights run back and forth.</li>
  <li>Add "Pro Controller" from Settings → Bluetooth &amp; devices → Add device → Bluetooth.</li>
</ol>
<h3>GameSir controllers</h3>
<ol>
  <li>Most GameSir models have a mode switch or a button combo to pick a mode. Choose the <strong>Xbox / XInput</strong> mode for PC. The exact combo is printed in the manual that came with your controller.</li>
  <li>If your model came with a USB dongle, use the dongle rather than Bluetooth for the lowest delay.</li>
  <li>Wired always works: plug in and you are done.</li>
</ol>
<h3>Windows cannot find it?</h3>
<ul>
  <li>Charge the controller or swap batteries. Low battery is the most common cause of a failed pairing.</li>
  <li>If it paired before, remove it from the Bluetooth device list and pair again from scratch.</li>
  <li>Try a different USB port, ideally one on the back of a desktop PC.</li>
  <li>Make sure only one program is trying to talk to the controller. Close other controller tools and check the <a href="#steam-input">Steam Input guide</a>.</li>
  <li>Still stuck? Ask in the forum's <a href="community.html">Help &amp; Setup</a> category or <a href="support.html">contact support</a> and tell us which controller you have.</li>
</ul>`
  },

  {
    slug: 'quick-menu',
    title: 'Using the in-game quick menu',
    category: 'Getting started',
    summary: 'Hold a button to switch profiles mid-match without alt-tabbing out of your game.',
    updated: '2026-11',
    body: `
<p>The quick menu is a small overlay that opens on top of your game so you can switch profiles without leaving the match. Hold the quick-menu button on your controller and it appears. Let go and it closes.</p>
<ol>
  <li><strong>Pick a button you do not use mid-game.</strong> You choose the quick-menu button in Clutch. The share, capture or screenshot button is a good choice because most games ignore it.</li>
  <li><strong>Hold it while playing.</strong> The quick menu shows your profiles and which game pack is active.</li>
  <li><strong>Move with the stick or d-pad, confirm with the face button shown.</strong> The switch happens instantly. Your game keeps running underneath.</li>
</ol>
<p><strong>Good uses:</strong> one profile for building and another for fighting in the same game, a racing profile with smooth steering and a menu profile with it off, or a "practice" profile with the crosshair overlay on and a "match" profile with it off.</p>
<p><strong>Quick menu not appearing?</strong> Some games that run in exclusive full-screen mode block overlays. Switch the game to borderless window mode in its video settings. Also check that Clutch is running in the background and your controller card shows as connected.</p>
<p>Kids can switch profiles from the quick menu, but settings a parent has locked behind the <a href="#parent-pin">parent PIN</a> stay locked.</p>`
  },

  /* ---------------------------------- Fixes ----------------------------- */
  {
    slug: 'windows-protected-your-pc',
    title: 'The "Windows protected your PC" warning',
    category: 'Fixes',
    summary: 'What the blue SmartScreen box means, why it appears for Clutch right now, and the two clicks to get past it.',
    updated: '2026-11',
    body: `
<p>When you run the Clutch installer for the first time, Windows may show a blue box titled <strong>"Windows protected your PC"</strong>. This is Microsoft SmartScreen. It appears for any new app that has not yet built up a download history or been signed with a code-signing certificate. Clutch is working on code signing; until then, this box is expected.</p>
<h3>How to continue</h3>
<ol>
  <li>In the blue box, click the small <strong>More info</strong> link under the message. It is easy to miss.</li>
  <li>A <strong>Run anyway</strong> button appears at the bottom. Click it.</li>
  <li>Windows may then ask "Do you want to allow this app to make changes to your device?" Click <strong>Yes</strong>. The installer needs this to set up the HidHide driver.</li>
</ol>
<h3>Only run installers from the official source</h3>
<p>Because the warning is normal, it is extra important to download Clutch only from the <a href="download.html">download page</a> on this site or from the official <a data-releases href="#">GitHub releases page</a>. If you got the installer anywhere else, delete it and download it again from one of those two places.</p>
<h3>No "More info" link?</h3>
<p>If the box has no More info link, SmartScreen is being managed by a policy on your PC, which is common on school or work computers. Ask whoever manages the computer. If a separate antivirus program removed the file, restore it from the antivirus quarantine and add an exception for the Clutch install folder.</p>
<p>If you are a parent and want to check before approving: the HidHide driver is a well-known open-source project, and every Clutch release is published on the official GitHub releases page, so you can see exactly what you are installing.</p>`
  },

  {
    slug: 'hidhide-two-controllers',
    title: 'HidHide: why Clutch uses it and how to fix "two controllers showing"',
    category: 'Fixes',
    summary: 'HidHide hides your physical controller so games only see the Clutch virtual one. Here is how to check it is working.',
    updated: '2026-11',
    body: `
<h3>Why Clutch needs HidHide</h3>
<p>Clutch reads your physical controller, applies your power-ups and game pack, and sends the result to the game through a <strong>virtual controller</strong>. The problem is that Windows would normally show the game both controllers: the real one and the virtual one. Games then pick the wrong one, or read both and double every input.</p>
<p><strong>HidHide</strong> is a real, open-source Windows driver that solves this. It hides selected devices from every program except the ones on its allow-list. Clutch is on the allow-list, so it can still read your real controller, while games only see Clutch's virtual controller. Clutch sets HidHide up for you during install.</p>
<h3>Signs HidHide is not doing its job</h3>
<ul>
  <li>A game's controller settings list two controllers.</li>
  <li>Presses register twice, or menus jump two items at a time. See <a href="#double-press-fix">the double-press fix</a>.</li>
  <li>Your power-ups do nothing in the game even though Clutch shows them on.</li>
</ul>
<h3>Fix it</h3>
<ol>
  <li><strong>Check in Clutch.</strong> Open Clutch's settings and look at the HidHide status. If it says the driver is missing, reinstall Clutch, approve the driver prompt from Windows, then restart your PC.</li>
  <li><strong>Open the HidHide Configuration Client.</strong> It is installed alongside the driver and shows up in the Start menu. On the <strong>Devices</strong> tab, make sure your physical controller is ticked (hidden). On the <strong>Applications</strong> tab, make sure Clutch's program is listed as allowed. Make sure device hiding is switched on at the bottom.</li>
  <li><strong>Restart the game.</strong> Hiding applies when a game starts. A game that was already open will keep seeing the old list until you relaunch it.</li>
  <li><strong>Check what Windows sees.</strong> Press <kbd>Win</kbd> + <kbd>R</kbd>, type <code>joy.cpl</code> and press Enter. This window is not on the allow-list, so it shows exactly what a game sees. You want one controller listed: the virtual one. If you see two, go back to step 2.</li>
  <li><strong>Using Steam?</strong> Steam Input can act like a third controller layer. <a href="#steam-input">Turn it off for the game or let Clutch handle it.</a></li>
</ol>
<p>If you uninstall Clutch, HidHide can be removed from Windows Settings → Apps like any other program. Unhide your controller first so it works normally afterwards.</p>`
  },

  {
    slug: 'double-press-fix',
    title: 'Double-press / double-input fix',
    category: 'Fixes',
    summary: 'One tap counts as two, menus skip, your character jumps twice. Three causes and how to rule each one out.',
    updated: '2026-11',
    body: `
<p>Double inputs almost always mean the game is hearing your controller twice. Work through these in order; most people are fixed at step 1.</p>
<ol>
  <li><strong>The game sees both controllers.</strong> This is the usual cause. HidHide should be hiding your physical controller so only the Clutch virtual one is visible. Press <kbd>Win</kbd> + <kbd>R</kbd>, type <code>joy.cpl</code>, press Enter. If two controllers are listed, follow <a href="#hidhide-two-controllers">the HidHide guide</a>.</li>
  <li><strong>Steam Input is also translating your controller.</strong> If the game runs through Steam, Steam can add its own layer on top of Clutch's virtual controller. Right-click the game in your Steam library → Properties → Controller → set it to <strong>Disable Steam Input</strong>, then restart the game. <a href="#steam-input">Full Steam Input guide.</a></li>
  <li><strong>Another controller tool is running.</strong> Other remapping programs, gamepad-to-keyboard tools and some controller makers' own apps all do the same job as Clutch. Close them, or set them to exit when Clutch starts. Two tools at once means two virtual controllers.</li>
</ol>
<h3>Still doubling?</h3>
<ul>
  <li>Unplug the controller, restart the game, plug the controller back in.</li>
  <li>If it only happens with one power-up on, turn that power-up off and tell us which one in the forum's <a href="community.html">Help &amp; Setup</a> category.</li>
  <li>Check for a sticky or worn button by testing the controller in <code>joy.cpl</code> with Clutch closed. If it doubles there too, the controller itself is the problem.</li>
</ul>`
  },

  /* --------------------------- Steam & launchers ------------------------ */
  {
    slug: 'steam-input',
    title: 'Steam Input: turn it off per game or let Clutch handle it',
    category: 'Steam & launchers',
    summary: 'Steam has its own controller layer. Pick one layer so they do not fight. Also covers other launchers.',
    updated: '2026-11',
    body: `
<p><strong>Steam Input</strong> is Steam's built-in controller system. It can remap buttons and translate your controller for games that do not support it. That is useful on its own, but when Clutch is also running, you have two systems translating the same controller. Symptoms are doubled inputs, power-ups that seem to do nothing, or a game that reacts to the wrong stick.</p>
<p>The simple rule: <strong>pick one layer per game</strong>. For most games we recommend letting Clutch handle it and turning Steam Input off for that game.</p>
<h3>Option A: turn Steam Input off for one game</h3>
<ol>
  <li>In your Steam library, right-click the game and choose <strong>Properties</strong>.</li>
  <li>Open the <strong>Controller</strong> tab on the left.</li>
  <li>Change the dropdown from "Use default settings" to <strong>Disable Steam Input</strong>.</li>
  <li>Close the window and start the game. Clutch's virtual controller now reaches the game directly.</li>
</ol>
<h3>Option B: turn it off everywhere</h3>
<ol>
  <li>Open Steam → <strong>Settings</strong> → <strong>Controller</strong>.</li>
  <li>Turn off the toggles for Xbox, PlayStation, Switch Pro and generic controller support.</li>
  <li>You can still re-enable Steam Input per game from the Properties window if a specific game needs it.</li>
</ol>
<h3>Option C: let Steam Input stay on for a game that needs it</h3>
<p>A few older games only work with controllers through Steam Input. For those, leave Steam Input on and pause Clutch for that game, so only one layer is translating. Do not run both.</p>
<h3>Other launchers</h3>
<p>Epic Games, the EA app, Ubisoft Connect, the Xbox app on PC and GOG do not have a controller layer like Steam's. Games from those launchers read the Clutch virtual controller directly, so there is nothing to switch off. If a game from one of those launchers also appears in Steam (added as a non-Steam game), the Steam Input rules above apply when you launch it from Steam.</p>
<p><strong>Tip:</strong> after any change, fully quit and relaunch the game. Controller layers are picked up at launch.</p>`
  },

  /* -------------------------- Power-ups explained ----------------------- */
  {
    slug: 'hair-triggers',
    title: 'Hair triggers explained',
    category: 'Power-ups explained',
    summary: 'Fire the instant you touch the trigger instead of pulling it all the way down.',
    updated: '2026-11',
    body: `
<p>Your controller's triggers are analog: they report how far you have pulled them, from barely touching to fully pressed. Most games only count a shot or a brake once the trigger passes a point well into its travel, which means a small delay between your finger moving and the game reacting.</p>
<p><strong>Hair triggers</strong> move that point to the very top of the travel. The lightest touch counts as fully pressed, so the game reacts the moment you do.</p>
<h3>When it helps</h3>
<ul>
  <li>Shooters where you fire with the trigger and want the shortest tap-to-shot time.</li>
  <li>Racing games where you want the brake or boost to bite instantly.</li>
  <li>Any game where you find yourself hammering the trigger.</li>
</ul>
<h3>When to leave it off</h3>
<ul>
  <li>Racing games where you use partial throttle or brake to control slides. Hair triggers remove the in-between, so a gentle squeeze becomes full brake.</li>
  <li>Games that use trigger pressure for something gradual, like a bow draw or a camera zoom.</li>
</ul>
<p>Hair triggers can be set for the left trigger, the right trigger, or both. If you only want it on your firing hand, leave the other one alone. <a href="#how-does-it-feel">"How does it feel?"</a> auto-tuning can also set this for you.</p>
<p>Hair triggers are included in Clutch Free and do not change how the game sees your controller; it simply reports the trigger as fully pulled sooner. Online-safe mode leaves it on.</p>`
  },

  {
    slug: 'smooth-aim',
    title: 'Smooth aim explained',
    category: 'Power-ups explained',
    summary: 'Takes the jitter out of your stick so small, careful movements stay small and careful.',
    updated: '2026-11',
    body: `
<p>Analog sticks are a little noisy. Even when your thumb is steady, the stick reports tiny wobbles, and worn sticks wobble more. Those wobbles show up as a shaky crosshair or a camera that twitches when you try to make a fine adjustment.</p>
<p><strong>Smooth aim</strong> evens out that noise. It blends each stick reading with the ones just before it, so sudden tiny jumps are rounded off while deliberate movements go through unchanged. The result is a crosshair that moves like your thumb does, not like the stick's wiring does.</p>
<h3>What it is good for</h3>
<ul>
  <li>Tracking a moving target without the crosshair shimmering.</li>
  <li>Camera control in third-person and adventure games.</li>
  <li>Controllers that have started to drift or feel scratchy. Smooth aim is not a repair, but it hides a lot.</li>
</ul>
<h3>Trade-off</h3>
<p>More smoothing means a touch more delay before a very fast flick lands exactly where you pointed. Clutch's default is light enough that most people do not notice. If you play a very twitchy shooter and find flicks land short, turn the strength down or pair it with <a href="#steady-aim">Steady aim</a> instead.</p>
<p>Smooth aim only changes how your own stick input is shaped before the game sees it. It does not look at the game or move your aim for you.</p>`
  },

  {
    slug: 'steady-aim',
    title: 'Steady aim explained',
    category: 'Power-ups explained',
    summary: 'Keeps your crosshair from drifting when you stop moving the stick.',
    updated: '2026-11',
    body: `
<p>When you let go of the stick, it should return to the exact center and report "no movement". In practice many sticks settle slightly off-center, and the game reads that as a slow, constant push. Your crosshair creeps across the screen on its own. People call this stick drift.</p>
<p><strong>Steady aim</strong> adds a small zone around the center where the stick is treated as still. Inside that zone, nothing moves. Step outside it and your aim responds normally. Clutch shapes the edge of the zone so there is no sudden jump when you start moving.</p>
<h3>When it helps</h3>
<ul>
  <li>Your crosshair or camera slowly slides when your thumb is off the stick.</li>
  <li>You find yourself constantly correcting tiny movements you did not make.</li>
  <li>An older controller you are not ready to replace.</li>
</ul>
<h3>Setting the size</h3>
<p>Bigger zone, more stillness, but also a slightly larger dead area before the stick responds. Start small and increase it until the drift stops. <a href="#how-does-it-feel">"How does it feel?"</a> auto-tuning will suggest a size for you based on how your controller actually behaves.</p>
<p>Steady aim and <a href="#smooth-aim">Smooth aim</a> fix different problems and work well together: Steady aim handles the stick at rest, Smooth aim handles the stick in motion.</p>`
  },

  {
    slug: 'how-does-it-feel',
    title: '"How does it feel?" auto-tuning explained',
    category: 'Power-ups explained',
    summary: 'Play for a minute, answer one question, and Clutch tunes your settings for you.',
    updated: '2026-11',
    body: `
<p>Sliders are hard. A number like "deadzone 0.12" does not mean anything until you feel it. Auto-tuning replaces the numbers with a question you can actually answer.</p>
<h3>How it works</h3>
<ol>
  <li>Start auto-tuning in Clutch and play your game normally for about a minute.</li>
  <li>Clutch watches how your sticks and triggers actually behave: how far off-center they rest, how much they jitter, how hard you press.</li>
  <li>When the minute is up, Clutch asks one plain question: <strong>"How does it feel?"</strong> Pick an answer like "too twitchy", "too sluggish" or "drifts when I let go".</li>
  <li>Clutch adjusts the related settings, such as Smooth aim strength, Steady aim size and trigger points, and saves them to your profile. Play another minute and answer again if you want to keep refining.</li>
</ol>
<h3>Tips</h3>
<ul>
  <li>Run it once per controller. A new or different controller rests and jitters differently.</li>
  <li>Run it per profile if you play very different kinds of games. A racing profile and a shooter profile want different answers.</li>
  <li>You can always open the power-up afterwards and nudge the setting by hand. Auto-tuning gives you a good starting point, not a locked setting.</li>
</ul>
<p>Auto-tuning only reads your controller. It does not read the game, the screen or anything else on your PC.</p>`
  },

  {
    slug: 'crosshair-overlay',
    title: 'Crosshair overlay',
    category: 'Power-ups explained',
    summary: 'Pick a shape and color. It sits on top of any game, in the center of your screen.',
    updated: '2026-11',
    body: `
<p>The crosshair overlay draws a small marker in the exact center of your screen, on top of whatever game is running. It is handy in games that hide the crosshair when you are not aiming down sights, or that use a crosshair that is hard to see against the map.</p>
<h3>Setting it up</h3>
<ol>
  <li>Open the Crosshair power-up in Clutch and turn it on.</li>
  <li>Pick a shape (dot, cross, circle and more) and a color. Pick one that stands out against the games you play most; a bright color on a dark map, a dark outline on a bright one.</li>
  <li>Set the size. Smaller is more precise; bigger is easier to find in a hurry.</li>
  <li>Use the <a href="#quick-menu">quick menu</a> to flip between a profile with the crosshair on and one with it off.</li>
</ol>
<h3>Not showing?</h3>
<p>Games running in exclusive full-screen mode can hide overlays. Switch the game to borderless window mode in its video settings. Also check that the game is running on the same monitor Clutch is set to draw on.</p>
<p>The crosshair is a fixed picture in the middle of the screen. It does not move, track anything, or read the game. It is included with Clutch Pro.</p>`
  },

  {
    slug: 'aim-lab-practice',
    title: 'Aim Lab practice',
    category: 'Power-ups explained',
    summary: 'Warm up and track your progress without leaving Clutch.',
    updated: '2026-11',
    body: `
<p>Built-in Aim Lab practice gives you a quick place to warm up before a session and to see whether a settings change actually helped. It runs inside Clutch, so there is nothing else to install.</p>
<h3>Using it</h3>
<ol>
  <li>Open Aim Lab practice from Clutch and pick a drill. Drills are short, usually a minute or two.</li>
  <li>Play the drill with the same profile you are about to use in your game, so the practice matches the real thing.</li>
  <li>Your score is saved to your profile, so each kid in the family has their own history.</li>
</ol>
<h3>Using it to test settings</h3>
<p>Run a drill, change one thing (turn Smooth aim up, make the Steady aim zone smaller), then run the same drill again. If your score goes up and it feels better, keep it. If not, change it back. One change at a time is the whole trick.</p>
<p>Practice scores are stored on your PC with your profile. Aim Lab practice is included with Clutch Pro.</p>`
  },

  {
    slug: 'advanced-mods-online',
    title: 'Advanced mods and online games',
    category: 'Power-ups explained',
    summary: 'What the advanced mods do, why each one is a ban risk online, and how Online-safe mode handles them.',
    updated: '2026-11',
    body: `
<p>Clutch includes a small set of advanced mods meant for single-player and offline play. This page explains what each one does so you can make an informed choice. <strong>None of these should be used in an online game.</strong> Game publishers treat automated inputs as a rules violation, and accounts have been banned for it. No tool can promise zero risk.</p>
<p><strong>Online-safe mode is on by default</strong> and pauses every mod listed here whenever Clutch detects an online game. Parents can lock that setting behind the <a href="#parent-pin">parent PIN</a>. Read <a href="#online-safe-mode">how Online-safe mode works</a>.</p>

<h3>Rapid fire</h3>
<p>Turns one held press into repeated presses. In an offline game it saves your thumb on weapons that require a tap per shot.</p>
<p class="ban-note">⚠️ Ban-risk: using this in an online game can get an account banned. Online-safe mode pauses it in online games by default.</p>

<h3>Recoil control</h3>
<p>Adds a steady downward nudge to the aim stick while you fire, to offset a weapon's kick. It has to be tuned per game and per weapon, which is why it lives in the advanced section.</p>
<p class="ban-note">⚠️ Ban-risk: using this in an online game can get an account banned. Online-safe mode pauses it in online games by default.</p>

<h3>Aim assist booster</h3>
<p>Adds a small constant wobble to the aim stick so a game's built-in aim assist thinks you are always slightly moving. It only does anything in games that already have aim assist, and it is the most likely of these to trip detection.</p>
<p class="ban-note">⚠️ Ban-risk: using this in an online game can get an account banned. Online-safe mode pauses it in online games by default.</p>

<h3>Micro strafe</h3>
<p>Adds tiny automatic left-right movement to the move stick while you aim, to make a standing character harder to hit.</p>
<p class="ban-note">⚠️ Ban-risk: using this in an online game can get an account banned. Online-safe mode pauses it in online games by default.</p>

<h3>Rapid crouch</h3>
<p>Repeats the crouch button while you hold it. Used in offline play to practice movement patterns.</p>
<p class="ban-note">⚠️ Ban-risk: using this in an online game can get an account banned. Online-safe mode pauses it in online games by default.</p>

<h3>Our position</h3>
<p>Clutch's everyday power-ups (hair triggers, smooth aim, steady aim, the crosshair, game packs, profiles) shape your own input and are what the app is about. The advanced mods exist for offline play and are off by default. If you are under 18, talk to a parent before turning any of them on. Breaking a game's rules is your responsibility, not the game's and not ours; see the <a href="terms.html#acceptable-use">Terms</a>.</p>`
  },

  /* ----------------------------- Family controls ------------------------ */
  {
    slug: 'profiles-for-every-kid',
    title: 'Profiles for every kid',
    category: 'Family controls',
    summary: 'Each kid gets their own settings, packs and practice scores. Switching is one tap.',
    updated: '2026-11',
    body: `
<p>A profile is a complete set of Clutch settings: which power-ups are on, how they are tuned, which game pack is active, the crosshair, and Aim Lab practice history. Clutch lets you make one for each kid (and one for yourself) so nobody overwrites anyone else's settings.</p>
<h3>Making profiles</h3>
<ol>
  <li>In Clutch, open Profiles and add a new one. Give it the kid's name or nickname and pick a pixel avatar.</li>
  <li>Set it up the way that kid plays: their favorite game pack, their power-ups, and run <a href="#how-does-it-feel">"How does it feel?"</a> once with their controller in their hands.</li>
  <li>Repeat for each kid. Switch between profiles from the Clutch window or from the <a href="#quick-menu">in-game quick menu</a>.</li>
</ol>
<h3>Profiles and family controls</h3>
<ul>
  <li><a href="#quiet-hours-break-reminders">Quiet hours and break reminders</a> can be set per profile, so a younger kid can have an earlier cut-off than an older one.</li>
  <li>The <a href="#parent-pin">parent PIN</a> protects settings on all profiles. Kids can switch profiles and pick packs, but cannot change what you have locked.</li>
  <li><a href="#online-safe-mode">Online-safe mode</a> applies to every profile and is on by default.</li>
</ul>
<h3>Family plan and multiple PCs</h3>
<p>Profiles are stored on the PC where you made them. With the Family plan (3 PC activations) you can set up profiles on up to three PCs. Each PC holds its own set of profiles. If you want the same profile on two PCs, set it up on both.</p>`
  },

  {
    slug: 'parent-pin',
    title: 'Parent PIN',
    category: 'Family controls',
    summary: 'Lock the settings that matter. Kids pick packs and power-ups; parents hold the key.',
    updated: '2026-11',
    body: `
<p>The parent PIN is a four-digit code that protects Clutch's family settings. With a PIN set, kids can still use Clutch normally (switch profiles, pick game packs, tap the everyday power-ups) but cannot change the protected settings without the code.</p>
<h3>What the PIN protects</h3>
<ul>
  <li><a href="#online-safe-mode">Online-safe mode</a>: turning it off requires the PIN.</li>
  <li>The advanced mods section: turning any of them on requires the PIN.</li>
  <li><a href="#quiet-hours-break-reminders">Quiet hours and break reminders</a>: changing or skipping them requires the PIN.</li>
  <li>Deleting profiles and changing the PIN itself.</li>
</ul>
<h3>Setting it up</h3>
<ol>
  <li>Open Family controls in Clutch and choose Set parent PIN.</li>
  <li>Pick four digits your kids will not guess. Avoid birthdays and 1234.</li>
  <li>Enter it twice to confirm. Protected settings now show a lock.</li>
</ol>
<h3>Forgot the PIN?</h3>
<p>If the PIN is lost, <a href="support.html">contact support</a> from the account that bought Clutch. We verify the purchase before resetting anything, so a kid can't reset it on their own.</p>
<p>The parent PIN is part of family controls, included with Clutch Pro and Family.</p>`
  },

  {
    slug: 'quiet-hours-break-reminders',
    title: 'Quiet hours and break reminders',
    category: 'Family controls',
    summary: 'Set the hours Clutch is off, and get a gentle "take five" on a schedule.',
    updated: '2026-11',
    body: `
<p>Two small tools for keeping game time healthy. Both are set per profile and protected by the <a href="#parent-pin">parent PIN</a>.</p>
<h3>Quiet hours</h3>
<p>Quiet hours are the times when Clutch's power-ups are switched off. During quiet hours the controller still works as a plain controller, so a kid can finish a save or play with the family, but the upgrades pause. Pick a start and end time for school nights and a different one for weekends if you like.</p>
<ol>
  <li>Open Family controls → Quiet hours and choose a profile.</li>
  <li>Set the window, for example 9:00 pm to 7:00 am on school nights.</li>
  <li>Clutch shows a short countdown before quiet hours start so nobody is surprised mid-match.</li>
</ol>
<h3>Break reminders</h3>
<p>Break reminders show a friendly message on screen at an interval you choose, such as every 45 minutes: "Take five. Stretch, drink some water." The reminder does not stop the game or disconnect the controller; it is a nudge, not a wall. Kids dismiss it with a button press and keep playing.</p>
<h3>Why they are gentle on purpose</h3>
<p>Clutch is not a lockdown tool and does not pretend to be. Windows and your console already have full screen-time controls if you need hard limits. Quiet hours and break reminders are there to make the habit easier to keep, with the kid in the loop.</p>
<p>Both tools are part of family controls, included with Clutch Pro and Family.</p>`
  },

  {
    slug: 'online-safe-mode',
    title: 'Online-safe mode: what it pauses and why',
    category: 'Family controls',
    summary: 'On by default. Pauses ban-risk mods when you are in an online game so accounts stay in good standing.',
    updated: '2026-11',
    body: `
<p>Most game publishers treat automated or scripted inputs in online play as breaking the rules, and they ban accounts for it. Online-safe mode is Clutch's answer: it keeps the advanced mods off whenever you are in an online game, automatically, so a kid cannot flip one on by accident during a match.</p>
<h3>What it pauses</h3>
<p>The advanced mods: button repeaters, automatic aim-stick nudges and movement repeaters. Clutch pauses all of them the moment it detects an online game and turns them back on, if they were on, when you return to offline play. The full list and what each one does is in <a href="#advanced-mods-online">Advanced mods and online games</a>.</p>
<h3>What it leaves alone</h3>
<p>Everything that just shapes your own input: hair triggers, smooth aim, steady aim, remaps, stick and trigger tuning, game packs, profiles, the crosshair overlay, Aim Lab practice and the quick menu. These stay on.</p>
<h3>How it knows a game is online</h3>
<p>Clutch keeps a list of known online games and game modes and watches which game is in focus. If a game is not on the list, Clutch treats it as online to be safe. You can mark a game as offline-only in Clutch if you know it is, but that setting is protected by the <a href="#parent-pin">parent PIN</a>.</p>
<h3>Can it promise no bans?</h3>
<p>No. No tool can promise zero risk, and we will not pretend otherwise. What Online-safe mode does is make the risky things off by default in the places where they are risky, and make turning them on a deliberate, PIN-protected choice. Breaking a game's rules is always the player's responsibility; see the <a href="terms.html#acceptable-use">Terms</a>.</p>
<p>Online-safe mode is on in every plan, including Free. Turning it off requires the parent PIN on Pro and Family.</p>`
  },

  /* ---------------------------- Account & license ----------------------- */
  {
    slug: 'license-key-new-pc',
    title: 'Entering your license key and moving to a new PC',
    category: 'Account & license',
    summary: 'Where your key is, how to activate, and how to move Pro or Family to a different computer.',
    updated: '2026-11',
    body: `
<h3>Where your key is</h3>
<p>When a parent or guardian buys Clutch Pro or Family, the license key is emailed to the address used at checkout and also shown on the <a href="account.html">account page</a>. It looks like <code>CLUTCH-XXXXX-XXXXX-XXXXX</code>. Keep the email; it is your proof of purchase.</p>
<h3>Entering the key</h3>
<ol>
  <li>Install Clutch from the <a href="download.html">download page</a> if you have not already.</li>
  <li>Open Clutch → Settings → License.</li>
  <li>Paste the key and choose Activate. All 48 game packs, Aim Lab practice, the crosshair overlay, macros and family controls switch on right away. No restart needed.</li>
</ol>
<h3>Activations</h3>
<ul>
  <li><strong>Pro</strong>: 1 PC at a time.</li>
  <li><strong>Family</strong>: 3 PCs at a time.</li>
</ul>
<h3>Moving to a new PC</h3>
<ol>
  <li>On the old PC, open Settings → License and choose <strong>Deactivate</strong>. This frees up the activation.</li>
  <li>On the new PC, install Clutch and enter the same key.</li>
  <li>Profiles live on the PC, so set them up again on the new one, or copy your Clutch settings folder across if you are comfortable doing that.</li>
</ol>
<h3>Old PC died or was wiped?</h3>
<p>If you cannot deactivate from the old PC, use the <a href="account.html">account page</a> to see your activations and release one, or <a href="support.html">contact support</a> with the email you bought with and we will free it up.</p>
<h3>Refunds</h3>
<p>Clutch has a 14-day refund policy. Ask through <a href="support.html">support</a> within 14 days of purchase; the license is deactivated when the refund goes through. Details are in the <a href="refunds.html">refund policy</a>. If you are under 18, ask a parent or guardian to send purchase or refund questions.</p>`
  }
];
