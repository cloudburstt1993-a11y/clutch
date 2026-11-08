# Clutch ⚡🎮

Controller mods for Windows. Clutch reads your real controller (Xbox, PlayStation, Switch Pro, 8BitDo and most others), adds whatever mods you switch on, and passes the result to games as a virtual Xbox controller. It runs in the system tray and has a big **Mods on / off** switch.

---

## Install

### Option A: build the installer once, then install anywhere (recommended)
1. On any Windows PC, install **Python 3.12 or 3.13** from python.org. Tick **"Add python.exe to PATH"** during setup.
2. Double-click **`build_installer.bat`**. It installs the build tools, builds `Clutch.exe`, and makes **`installer_output\Clutch-Setup-12.4.exe`**. If Inno Setup is missing, it installs that through winget automatically.
3. Run `Clutch-Setup-12.4.exe` on each PC that will use Clutch. The installer:
   - installs Clutch with a Start-menu entry and, if you choose, a desktop shortcut
   - installs the **ViGEmBus** virtual-controller driver if that PC doesn't have it yet
   - can set Clutch to start in the background with Windows

Kids' PCs don't need Python. Only the PC you build on does.

### Option B: run straight from this folder
Run `setup.bat` once, then `run_app.bat` each time you want to open Clutch.

### After installing (one time per PC)
Open Clutch and go to **🔧 Setup check**. It shows what's missing, and each item has a button to fix it:
- **HidHide:** click *Set it up for me*. Clutch downloads the official HidHide installer, checks it's signed by its developer (Nefarius), and then, after one Windows "allow changes" prompt, installs it, lets Clutch through, and hides the real controller (matched by its USB ID; Clutch's own virtual controller is never hidden). Restart the PC once when it says so. Already have HidHide? The button is *Hide it for me*; *Stop hiding* undoes it. You can still do it by hand: *Open HidHide* → Devices tab → tick the controller → tick **Enable device hiding**. This stops games from seeing the real controller next to the modded one, which would otherwise cause double inputs.
- **Steam games:** turn off Steam Input for each game (right-click the game → Properties → Controller → Disable Steam Input).

---

## Using it

| Where | What it does |
|---|---|
| **Mods on / off** (top right) | Turns every mod off at once. With mods off, the controller works like normal. |
| **🏠 Home** | Where Clutch opens: the profile you're playing with, a big Mods on/off switch, your live controller, quick switches for favorite power-ups, and one-tap profile cards. |
| **⚡ Power-ups** | One-click mods with on/off switches, plus **Combos** that switch on several at once. |
| **🏹 Aim Lab** | Aim practice with your real controller and mods, with best scores and one-tap tips. |
| **🎯 Crosshair** | Design a crosshair that sits in the middle of the screen over any game, with a live preview. |
| **Profiles** | Each profile is one set of mods, with its own emoji and color. Click a profile to see the live controller diagram and change any button, stick, trigger or macro. |
| **🎬 Macros** (in a profile) | Build button combos step by step, or press **Start recording** and play the combo on the controller. |
| **🕹️ My games** | Clutch looks through Steam, Epic Games, GOG, the Xbox app, Minecraft Java and Roblox and lists the games on this PC, with Steam cover art. Tap **Set up** (or **Set up all**) and each game gets a matching profile that switches on by itself when the game opens. Any other game can be given any profile from its card. |
| **🧩 Game packs** (bottom of My games) | 48 ready-made profiles in 7 categories (Shooters, Action and adventure, Building and survival, Racing and sports, Party and fighting, Platformers, Keyboard games) with search. Includes Fortnite, Minecraft Java and Bedrock, Roblox, Rocket League, Apex, Call of Duty, Halo, Overwatch 2, Marvel Rivals, Destiny 2, The Finals, Rainbow Six Siege, Battlefield, PUBG, Helldivers 2, Warframe, GTA V, Red Dead 2, Elden Ring, Hogwarts Legacy, Cyberpunk 2077, Sea of Thieves, Terraria, Stardew Valley, Palworld, No Man's Sky, EA Sports FC, NBA 2K, Madden, F1, Forza, Need for Speed, Fall Guys, Street Fighter 6, Mortal Kombat, Tekken, Brawlhalla, Among Us (keyboard game), Hollow Knight, Celeste and more. Packs only change feel (deadzones, curves, hair triggers, steady aim, trigger feel); none use rapid fire, macros or recoil control. My games matches installed games to the right pack. |
| **❓ Help** | Controller shortcut cheat sheet and answers to common problems. |
| **⚙️ Settings** | Controller shortcuts, switch profiles by game, pop-ups over games, start with Windows, **👪 parent controls** (hide ban-risk power-ups behind a PIN), **⏪ go back in time** (restore an automatic backup), Xbox or PlayStation controller type. |

**Controller shortcuts** (they work during a game): hold **Guide** (the Xbox / PS / Home button) and press:
- **D-pad → / ←**: next / previous profile (the controller buzzes)
- **Back**: mods on / off
- **R3**: crosshair on / off

Tapping Guide by itself still does its normal job. Closing the window keeps Clutch running in the tray. Right-click the tray icon to switch profiles, toggle mods or the crosshair, or quit.

**🕹️ Drive Clutch with your controller:** with the Clutch window in front, the D-pad or left stick moves around, **A** picks, **B** goes back or closes a pop-up, **LB / RB** flip between pages, left/right changes sliders and lists, and the right stick scrolls. A hint bar shows the buttons (with PlayStation symbols on a PlayStation controller). While Clutch is in front, mods don't press keys or move the mouse, so nothing happens twice. On the Controller test page buttons are being tested, so hold **B** to leave. Turn it off in Settings → Controls and comfort.

**12.4 fixes:** Xbox-style controllers (including GameSir pads in PC/XInput mode) are now read through XInput inside Clutch (`SDL_JOYSTICK_RAWINPUT=0`, `SDL_JOYSTICK_WGI=0`). SDL's Raw Input and Windows.Gaming.Input paths open the device from a Windows system process, so once HidHide hid the controller, Clutch lost it too even though Clutch was allowed. Home now offers **Let Clutch see it** when no controller shows and HidHide's hiding is on. Device-ID parsing no longer mistakes name-hash GUIDs for vendor/product IDs, and a real pad plugged in at the moment Clutch makes its virtual pad is no longer mistaken for Clutch's own.

**🌀 Aim assist booster (12.3, ⚠️ ban risk):** in Power-ups → Shooters. While you aim (or aim and fire), Clutch adds a small automatic circle or side-to-side motion to the right stick (Light/Medium/Strong = 0.10/0.15/0.22 of full tilt, 6–20 times a second) so the game's own aim assist keeps engaging. It's a `stick_mods` entry with `wiggle`, `hz` and `pattern`. Online-safe mode removes it in online games, and "Hide ban-risk power-ups" hides it. Clutch never reads the screen or aims for you.

**12.2 fixes:** one-click hiding no longer stops with "Permission denied" (the admin helper now writes into a result file Clutch made, so Clutch can read it, and if it still can't, Clutch asks HidHide directly). Setup check shows the controller's ID (VID:PID) and flags pads that share the virtual Xbox 360 ID (045E:028E), such as some GameSir controllers in PC mode. Those must be ticked in HidHide by hand. After hiding, unplug and replug the controller and restart the game.

**🔂 Double-press check (12.1):** if a game can see both the real controller and Clutch's virtual one, each press counts twice (Fortnite skips a weapon slot, menus jump two items). Clutch checks HidHide every 20 seconds (installed, switched on, and this controller in its hidden list). When it's sure games can see both, Home shows a warning with **Fix it for me**, and a one-time pop-up appears over online games. If it can't tell, it stays quiet.

**🎯 "How does it feel?" (12.0):** profiles made from a game pack show a small card at the top: *Feels great*, *Aim's too slow / too fast* (right-stick sensitivity ×1.15 / ×0.87, or mouse speed for keyboard-and-mouse packs), *Too jumpy* (curve +0.2 up to 2.4, and a slightly steadier aim-down-sights slowdown) and *It drifts* (deadzones +0.03 up to 0.3). Each tap nudges the profile a little and the toast has Undo.

**🧪 Welcome tour test (12.0):** the last step asks you to pull RT, push the right stick to the edge and hold the quick-menu button, and ticks each one off live, so you know everything works before playing.

**🛡️ Online-safe mode (Settings, on by default):** while an online game is the window in front (Fortnite, Call of Duty, Apex, Roblox, Rocket League, Valorant, Overwatch and more, plus any shooter My games finds and any program you add), Clutch pauses the ban-risk automation: turbo/rapid fire, macros (slide cancel, quick scope, jump shot), one button doing several things (drop shot) and recoil pull. Everything else (remaps, curves, deadzones, steady aim, gyro, crosshair, trigger feel) keeps working, and a pop-up says what's paused. Switching to an offline game brings them back. Turning it off, or changing the game list, needs the parent PIN if one is set. Loading a setup file never changes it.

**👪 Family mode (Settings → Family):** add each player with a name, icon, color, starting profile, look, and their own "hide ban-risk power-ups" switch. Pick who's playing from the chip in the top bar (Clutch asks at start-up). A profile can *belong to* one player, so each kid only sees their own plus the shared ones, and *Give a copy to* hands a sibling a copy. Stats track playtime per player per day. Aim Lab bests, the daily leaderboard and themes are per player.

**🎮 Controllers remember their owner:** in Settings → Family → Controllers, set who a controller belongs to and which profile it starts with. Clutch recognises it by serial number. Controllers without one, like most Xbox pads, are recognised by model.

**🛡️ Parent controls:** quiet hours turn mods off overnight (the controller still works), a daily-time reminder appears once today's time is used up (it doesn't lock anything), and there's a playtime-this-week chart on the Stats page.

**🏹 Trigger feel (DualSense, Profile → Triggers):** Soft, Heavy, Click (gun), Bow, Brake or Buzz resistance on each trigger. It's sent only to the controller, so it's ban-safe. It switches off when mods are off and when Clutch closes. The Forza pack uses Brake/Soft.

**🖐️ Touchpad (PlayStation, Profile → Buttons):** keep it as one button, split it into 2 halves or 4 corners (new mappable inputs `tp_left`, `tp_right`, `tp_tl`, `tp_tr`, `tp_bl`, `tp_br`), or use it as a laptop touchpad (drag moves the mouse, click = left click).

**🌀 Gyro auto-calibration:** while the controller sits still, Clutch slowly learns gyro drift so aim doesn't creep. On by default; *Fix drift by itself* on the gyro card.

**🔥 Streaks and 🗓️ daily challenge:** play 5+ minutes a day to build a streak. Aim Lab's *Daily challenge* gives everyone the same target layout each day, with a family leaderboard. **🎛️ Tune my aim** plays 3 short rounds with different aim curves and keeps the best.

**More game packs:** Apex Legends, Call of Duty, Halo and Forza, matched automatically by My games.

**📺 Streaming overlay (Settings):** turn it on, then add the URL to OBS/Streamlabs as a Browser Source (600 × 260, transparent). It shows live buttons, sticks and triggers (PlayStation symbols on PlayStation pads) plus the current profile and player. It uses its own read-only key, separate from the app's.

**🔄 Updates (Settings → Updates):** before building, set `UPDATE_REPO = "owner/repo"` near the top of `clutch.py` (the GitHub repo you publish releases to). It's built in, so nobody can point Clutch at a different source from the app or from a setup file. Clutch checks at start-up (at most every 6 hours) and on *Check now*; pre-release tags like `v10.1-beta` are ignored. *Install update* downloads the release's `.exe` into a fresh temp folder, checks GitHub's SHA-256, and, if your Clutch is code-signed, requires the same signing certificate. It then runs the installer silently: Windows asks for a parent's OK, Clutch closes cleanly, the installer updates it and starts it again. To publish: make a GitHub Release tagged like `v10.1` with `Clutch-Setup-10.1.exe` attached. The installer version always comes from `VERSION` in `clutch.py`.

**📎 Help file:** Help → *Make a help file* puts a zip on the Desktop with the log, settings, stats and a PC/controller summary.

**🖥️ Full-screen warning:** if a game runs in exclusive full screen (where overlays can't draw), Clutch notices and shows how to switch it to Borderless.

**✍️ Code signing (optional):** stops Windows "protected your PC" warnings. Get a code-signing certificate (Azure Trusted Signing or a standard OV certificate), then make a file called `sign.cmd` next to `build_installer.bat` that signs whatever file it's given, for example:
```
@"C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 /a %1
```
With `sign.cmd` present, the build signs `Clutch.exe`, the installer and the uninstaller.

**Setup files and parents:** loading a `.clutch` setup never changes parent controls, the stream overlay, controller assignments or the update source on this PC.

**📋 In-game quick menu:** during a game, hold **Guide** (the PS button on PlayStation) by itself for about half a second. A menu appears over the game with every profile plus *Turn mods on/off* and *Show/Hide crosshair*. Move with the stick or D-pad, let go of Guide (or press A) to pick, press B to cancel. The game gets no input while it's open. A quick tap of Guide still works normally and Guide + D-pad shortcuts still work. Settings → In-game quick menu turns it off or changes how long to hold. Needs the game in Borderless/Windowed mode, like the crosshair.

**🏹 Aim Lab:** a practice range that uses exactly what the game would receive from the right stick (mods, curves, gyro and steady aim included) and pulls RT to shoot. Modes: Flick, Tiny targets, Track. It keeps a best score per mode and profile and after each round suggests fixes (Smooth aim, Hair triggers, a faster speed, or Fix stick drift) with a one-tap button.

**🌈 Controller light** (Settings): Automatic, Profile color, Breathe, Rainbow, Battery (green/yellow/red) or Off, for PlayStation and other controllers with a light.

**📦 Copy to another PC** (Settings): *Save my setup to a file* writes `Clutch setup <date>.clutch` to Documents. On the other PC, *Load a setup file…* (also offered on the welcome screen) replaces the profiles and settings there after backing them up. Per-PC settings (which controller, panel port) stay as they were.

**🔊 Sounds, text size and animations:** Settings → Controls and comfort. Sounds only play in the Clutch window, never in games.

**First run:** a 30-second welcome tour checks the controller, finds the games on the PC and picks the matching packs, then sets them up.

**Pop-ups over games:** when you switch profiles, turn mods off, connect a controller, or the battery gets low, a small message appears at the top of the screen. The battery level also shows in the top bar.

**🌀 Gyro aiming:** with a PlayStation (DualShock 4 / DualSense) or Switch Pro controller, aim by tilting and turning the controller. You can choose when it works (while aiming with LT, all the time, or while holding a button), whether it moves the stick or the mouse, turning or leaning for left/right, sensitivity, and shake filtering. **Calibrate gyro** fixes slow drift. Switch it on with the *Gyro aim* power-up or in a profile's Sticks tab.

**🧪 Controller test:** press every button and spin the sticks to find broken buttons, worn sticks (reach %) and drift. Also tests rumble motors, the light bar and the gyro.

**📊 Stats and badges:** time played, button presses, favorite button, most-played profile, longest session, plus 10 badges to unlock.

**🎨 Themes:** Midnight, Sunset, Ocean, Neon or Forest (Settings → Look).

**⌨️ Keyboard shortcuts:** these work anywhere, even in a game. Defaults: Ctrl+Alt+M mods on/off, Ctrl+Alt+C crosshair, Ctrl+Alt+→ / ← switch profile. Change them in Settings with **Record**.

**↩️ Undo:** power-up switches show an Undo button in the message at the bottom. **➕ Crosshair presets:** 8 ready-made designs. **⏸ Break reminders** (Settings → Parent controls): an on-screen “time for a break” message after 30 minutes to 2 hours of play.

**Per-profile crosshair:** a profile can turn the crosshair on or off when it activates (Shooter turns it on, Minecraft turns it off).

**👫 Couch co-op:** Settings → Couch co-op. Up to 4 controllers play at once, each with its own profile and its own modded virtual controller. Hide every real controller in HidHide. Keyboard and mouse power-ups only apply to Player 1.

**Stick drift:** on any profile's Sticks tab, press **Fix stick drift for me**. Clutch measures the controller and sets the deadzones automatically.

### Power-ups included
- **Shooters:** Hair triggers, Smooth aim, Steady aim (slower aiming while you aim with LT), Toggle aim, Auto sprint, Slide cancel ⚠️, Rapid fire ⚠️, Recoil control ⚠️, Jump shot ⚠️, Drop shot ⚠️, Quick scope ⚠️, Crosshair overlay
- **Shooters (new):** Triggers on bumpers, Quick 180° turn
- **Movement and comfort:** Auto-walk, Fast menu scrolling, No vibration, Bunny hop, Stick drift fix, Short triggers, Swap sticks, Invert look, Nintendo layout, One-hand aim
- **Racing and sports:** Smooth throttle, Precise steering
- **PC and media:** Mouse mode (hold Back for a mouse pointer), Music controls, Clip that! (Xbox Game Bar), Screenshot button, Push-to-talk

Use the filter chips or the search box on the Power-ups page to find one fast. The **✅ Turned on** filter shows what's active in a profile.
- **Combos:** FPS starter, Sniper, Comfy, Max fire ⚠️

⚠️ **About the ⚠️ power-ups:** most online games ban rapid fire, recoil control and macros, and anti-cheat can ban the account. Keep those for single-player, offline or practice. The app marks each one clearly.

### Crosshair overlay tips
- It shows up in games running **borderless** or **windowed**. Games in *exclusive fullscreen* draw over it, so set the game's display mode to Borderless.
- It's a separate see-through window. Clicks pass straight through it to the game.

---


## Testing notes (for tinkerers)
`tests/` isn't shipped, but Clutch was tested by running the real engine against **virtual controllers created inside SDL** (the same library Clutch reads controllers with). That covered buttons, sticks, triggers, controller shortcuts, mods on/off, unplug/replug, and couch co-op, including making sure Clutch never mistakes its own virtual controllers for new players.

## Files
| File | What it is |
|---|---|
| `app.py` | The desktop app (window, tray icon, background mode) |
| `clutch.py` | The engine. Can also run from the command line: `python clutch.py --help` |
| `panel.html` | The control panel interface |
| `overlay.html` | The streaming overlay page (OBS Browser Source) |
| `assets/` | Icons (`make_icon.py` redraws them) |
| `build_installer.bat`, `Clutch.spec`, `installer.iss` | Builds `Clutch.exe` and the installer |
| `setup.bat`, `run_app.bat`, `start.bat`, `test.bat` | Run from source / command line / input test |

Settings are saved in `%APPDATA%\Clutch\config.jsonc`, with automatic backups in `%APPDATA%\Clutch\backups\` and your stats in `stats.json` for the installed app, or next to the scripts when running from source. The panel edits them for you. The first time the panel saves, the original file is copied to `config.backup.jsonc`.

## For tinkerers: settings reference
Top-level extras: `online_safe` (`enabled`, `games`: extra exe names, `offline`: exe names to leave alone), `kids` (list of `{id, name, emoji, color, profile, theme, hide_risky}`), `active_kid`, `controllers` (`{"sn:…": {kid, profile}}`), `overlay` (`enabled`, `key`, `style`, `show_name`), `parent.quiet` (`enabled`, `from`, `to`, `kids`), `parent.daily_minutes`, `quick_menu` (`enabled`, `hold_ms`), `lightbar` (`mode`: auto/profile/breathe/rainbow/battery/off, `speed`), `controller_nav` (true/false), `ui` (`sounds`: true/false, `text`: normal/big/huge, `motion`: auto/full/less), `parent` (`hide_risky`, `pin`, `break_minutes`).

Profiles can use: `owner` (player id), `trigger_feel` (`left`/`right`: off, soft, firm, click, bow, brake, pulse), `touchpad` (`mode`: button, zones2, zones4, mouse; `speed`), `gyro.auto_cal`, `extends`, `emoji`, `color`, `led`, `rumble`, `remap`, `output` (`xbox` / `playstation`), `gyro` (`enabled`, `activate`: always/aiming/hold, `button`, `output`: stick/mouse, `horizontal`: yaw/roll/both, `sensitivity`, `deadband`, `invert_x`, `invert_y`), `turbo`, `toggle`, `shift` (`button`, `tap`, `remap`), `sticks.left/right` (`deadzone`, `outer_deadzone`, `curve`, `sensitivity`, `anti_deadzone`, `x_scale`, `y_scale`, `invert_x`, `invert_y`, `output`: left/right/mouse/none, `mouse_speed`, `button_threshold`), `triggers.left/right` (`deadzone`, `max`, `curve`, `hair_trigger`), `trigger_threshold`, `macros`, `shift.sticks` (e.g. mouse mode while holding the shift button), and `stick_mods`:

```jsonc
"stick_mods": [
  { "id": "ads_slow", "while": ["lt"], "stick": "right", "scale": 0.7 },          // slower aim while aiming
  { "id": "recoil", "while": ["lt", "rt"], "stick": "right", "add_y": -0.2, "delay_ms": 0 }
]
```

Targets: Xbox button names, `lt`/`rt`, `ls_up`…`rs_right`, `key:ctrl+c`, `mouse:left`…`mouse:wheel_down`, `macro:name`, `none`, or a list of several. Macro steps: `{"tap": "a", "ms": 50, "gap": 30}`, `{"down": "rt"}`, `{"up": "rt"}`, `{"wait": 100}`, `{"stick": "left", "x": 0, "y": 1, "ms": 200}`. Macro modes: `once`, `hold`, `repeat`, `toggle`.

## Publishing an update (GitHub)

The install link that always gets the newest version: https://github.com/cloudburstt1993-a11y/clutch/releases/latest/download/Clutch-Setup.exe


1. Change `VERSION` at the top of `clutch.py` (for example to `10.1`) and add a line to `WHATS_NEW` in `panel.html`.
2. Commit and push to `main`.
3. GitHub Actions (`.github/workflows/release.yml`) sees a version that has no release yet, builds `Clutch-Setup-10.1.exe` on a Windows machine, and publishes Release `v10.1`. It takes about 10 minutes; watch the **Actions** tab. Pushes that don't change `VERSION` don't publish anything.
4. Every installed Clutch sees it within 6 hours (or right away with Settings → Updates → *Check now*) and offers **Install update**.

`UPDATE_REPO` in `clutch.py` must point at this repository, and its Releases have to be public for updates to download without a login. The **Run workflow** button on the Actions tab builds a test installer without releasing it.
