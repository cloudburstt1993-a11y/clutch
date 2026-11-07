#!/usr/bin/env python3
r"""
Clutch - controller mods for Windows (engine + command line)
=============================================================
Reads your real controller (Xbox, PlayStation, Switch Pro, 8BitDo, most generic pads),
applies the mods in your profile, and feeds games a virtual Xbox 360 controller (ViGEmBus).

Most people use the desktop app (app.py / Clutch.exe). This file is the engine and also
runs on its own from the command line:

  python clutch.py                 run with the browser control panel
  python clutch.py --list          list detected controllers
  python clutch.py --test          live view of input and mapped output (no virtual pad)
  python clutch.py --profile Shooter --config other.jsonc --no-panel --no-crosshair
"""

import argparse
import collections
import copy
import functools
import ctypes
import json
import math
import os
import queue
import re
import secrets
import shutil
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Keep reading the controller while a game (not this console) has focus.
os.environ.setdefault("SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS", "1")
os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
# Let SDL read motion sensors (gyro) from PlayStation pads over Bluetooth.
os.environ.setdefault("SDL_JOYSTICK_HIDAPI_PS4_RUMBLE", "1")
os.environ.setdefault("SDL_JOYSTICK_HIDAPI_PS5_RUMBLE", "1")

IS_WINDOWS = sys.platform == "win32"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
APP_NAME = "Clutch"
VERSION = "12.3"
# Where one-click updates come from: your GitHub "owner/repo". Set this before building; kids can't change it.
UPDATE_REPO = "cloudburstt1993-a11y/clutch"

# --------------------------------------------------------------------------------------
# Names
# --------------------------------------------------------------------------------------
# SDL GameController button indices (stable SDL2 enum). Works for Xbox/PS/Switch/etc.
SDL_BUTTONS = {
    "a": 0, "b": 1, "x": 2, "y": 3, "back": 4, "guide": 5, "start": 6,
    "l3": 7, "r3": 8, "lb": 9, "rb": 10,
    "dpad_up": 11, "dpad_down": 12, "dpad_left": 13, "dpad_right": 14,
    "misc1": 15, "paddle1": 16, "paddle2": 17, "paddle3": 18, "paddle4": 19, "touchpad": 20,
}
XBOX_BUTTONS = ("a", "b", "x", "y", "lb", "rb", "back", "start", "guide", "l3", "r3",
                "dpad_up", "dpad_down", "dpad_left", "dpad_right")
XBOX_SET = frozenset(XBOX_BUTTONS)
TRIGGERS = ("lt", "rt")
STICK_DIRS = tuple(f"{s}_{d}" for s in ("ls", "rs") for d in ("up", "down", "left", "right"))
STICK_DIR_SET = frozenset(STICK_DIRS)
TOUCH_ZONES = ("tp_left", "tp_right", "tp_tl", "tp_tr", "tp_bl", "tp_br")  # touchpad clicked in a zone
ALL_INPUTS = tuple(SDL_BUTTONS) + TRIGGERS + STICK_DIRS + TOUCH_ZONES
ALL_INPUT_SET = frozenset(ALL_INPUTS)
MOUSE_TARGETS = ("left", "right", "middle", "x1", "x2",
                 "wheel_up", "wheel_down", "wheel_left", "wheel_right")


def default_target(name):
    """What an input does when the profile doesn't remap it."""
    if name in XBOX_SET or name in TRIGGERS or name == "touchpad":
        return name  # touchpad only reaches games in PlayStation mode
    return None  # paddles, touchpad, stick directions etc. do nothing unless mapped


# --------------------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------------------
def listify(v):
    if v is None or v is False:
        return []
    if isinstance(v, (list, tuple)):
        return [x for x in v if x]
    return [v] if v else []


def clamp(v, lo=-1.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def deep_merge(base, over):
    out = copy.deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def strip_json_comments(text):
    """Allow // and /* */ comments and trailing commas in the config (JSONC)."""
    out, i, n, in_str = [], 0, len(text), False
    while i < n:
        c = text[i]
        if in_str:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if c == '"':
                in_str = False
            i += 1
        elif c == '"':
            in_str = True
            out.append(c)
            i += 1
        elif c == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] != "\n":
                i += 1
        elif c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append("\n" * text.count("\n", i, j))  # keep line numbers for error messages
            i = j
        else:
            out.append(c)
            i += 1
    cleaned = "".join(out)
    return re.sub(r",(\s*[}\]])", r"\1", cleaned)


def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.loads(strip_json_comments(f.read()))


def num(v, default):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float(default)


# --------------------------------------------------------------------------------------
# Analog processing
# --------------------------------------------------------------------------------------
def process_stick(x, y, c):
    """Radial deadzone + curve + sensitivity. Input/output: -1..1, +y = up."""
    if c.get("invert_x"):
        x = -x
    if c.get("invert_y"):
        y = -y
    mag = math.hypot(x, y)
    inner = num(c.get("deadzone"), 0.08)
    outer = num(c.get("outer_deadzone"), 0.02)
    if mag <= inner or mag <= 1e-9:
        return 0.0, 0.0
    span = max(1e-6, (1.0 - outer) - inner)
    n = min(1.0, (mag - inner) / span)
    n = n ** max(0.05, num(c.get("curve"), 1.0))
    anti = clamp(num(c.get("anti_deadzone"), 0.0), 0.0, 0.99)
    n = anti + (1.0 - anti) * n
    n = min(1.0, n * num(c.get("sensitivity"), 1.0))
    k = n / mag
    ox = clamp(x * k * num(c.get("x_scale"), 1.0))
    oy = clamp(y * k * num(c.get("y_scale"), 1.0))
    return ox, oy


def process_trigger(v, c):
    """Deadzone / max travel / curve / hair trigger. 0..1."""
    dz = clamp(num(c.get("deadzone"), 0.02), 0.0, 0.95)
    if v <= dz:
        return 0.0
    if c.get("hair_trigger"):
        return 1.0
    mx = clamp(num(c.get("max"), 1.0), dz + 0.01, 1.0)
    v = min(1.0, (v - dz) / (mx - dz))
    return v ** max(0.05, num(c.get("curve"), 1.0))


# --------------------------------------------------------------------------------------
# State containers
# --------------------------------------------------------------------------------------
# --------------------------------------------------------------------------------------
# Online-safe mode: while one of these is in front, ban-risk automation (turbo, macros, button combos
# on one press, recoil pull) is switched off so it can't get an account banned.
# --------------------------------------------------------------------------------------
ONLINE_GAMES = {
    "fortniteclient-win64-shipping.exe": "Fortnite", "r5apex.exe": "Apex Legends", "r5apex_dx12.exe": "Apex Legends",
    "cod.exe": "Call of Duty", "modernwarfare.exe": "Call of Duty: Modern Warfare", "cs2.exe": "Counter-Strike 2",
    "overwatch.exe": "Overwatch 2", "valorant-win64-shipping.exe": "Valorant", "destiny2.exe": "Destiny 2",
    "haloinfinite.exe": "Halo Infinite", "marvel-win64-shipping.exe": "Marvel Rivals", "discovery.exe": "The Finals",
    "rocketleague.exe": "Rocket League", "robloxplayerbeta.exe": "Roblox", "tslgame.exe": "PUBG",
    "rainbowsix.exe": "Rainbow Six Siege", "rainbowsix_be.exe": "Rainbow Six Siege", "tf_win64.exe": "Team Fortress 2",
    "bf2042.exe": "Battlefield 2042", "gta5.exe": "GTA V", "gta5_enhanced.exe": "GTA V", "fc25.exe": "EA Sports FC 25",
}
ONLINE_PACKS = ("fortnite", "apex", "cod", "halo", "shooter", "rocket", "roblox",  # games My games matched to these
                "overwatch", "rivals", "destiny", "finals", "siege", "battlefield", "pubg", "helldivers", "warframe",
                "fc", "nba2k", "madden", "fallguys", "amongus", "brawlhalla", "gta", "seaofthieves")


def online_safe_profile(p):
    """A copy of a resolved profile with the ban-risk automation taken out: turbo (rapid fire), macros
    (slide cancel, quick scope, jump shot...), several actions on one press (drop shot) and recoil pull."""
    p = copy.deepcopy(p)

    def clean(rm):
        out = {}
        for k, v in (rm or {}).items():
            if isinstance(v, list):
                v = [x for x in v if not (isinstance(x, str) and x.startswith("macro:"))][:1]
                if not v:
                    continue
                v = v[0]
            if isinstance(v, str) and v.startswith("macro:"):
                continue
            out[k] = v
        return out
    if isinstance(p.get("remap"), dict):
        p["remap"] = clean(p["remap"])
    sh = p.get("shift")
    if isinstance(sh, dict):
        if isinstance(sh.get("remap"), dict):
            sh["remap"] = clean(sh["remap"])
        sh.pop("turbo", None)
    p.pop("turbo", None)
    p.pop("macros", None)
    if isinstance(p.get("stick_mods"), list):
        p["stick_mods"] = [m for m in p["stick_mods"] if isinstance(m, dict)
                           and not (num(m.get("add_x"), 0) or num(m.get("add_y"), 0) or num(m.get("wiggle"), 0))]
    return p


class RawState:
    __slots__ = ("buttons", "lx", "ly", "rx", "ry", "lt", "rt", "gx", "gy", "gz", "has_gyro", "touch", "tx", "ty")

    def __init__(self):
        self.buttons = set()
        self.lx = self.ly = self.rx = self.ry = 0.0
        self.lt = self.rt = 0.0
        self.gx = self.gy = self.gz = 0.0   # gyro, radians/second (pitch, yaw, roll)
        self.has_gyro = False
        self.touch = False                  # a finger is on the touchpad (DualSense / DS4)
        self.tx = self.ty = 0.5             # finger position 0..1 (left->right, top->bottom)


class Output:
    __slots__ = ("buttons", "keys", "mouse", "lt", "rt", "lx", "ly", "rx", "ry",
                 "mouse_dx", "mouse_dy", "stick_push")

    def __init__(self):
        self.buttons = set()
        self.keys = set()
        self.mouse = set()
        self.lt = self.rt = 0.0
        self.lx = self.ly = self.rx = self.ry = 0.0
        self.mouse_dx = self.mouse_dy = 0
        self.stick_push = []  # (side, dx, dy) from buttons mapped to stick directions


# --------------------------------------------------------------------------------------
# Macros
# --------------------------------------------------------------------------------------
class Macro:
    """A compiled timeline of target presses/releases and stick overrides.

    Step formats (in "steps"):
      {"tap": "a"}                         press for 50 ms, then 30 ms gap  (ms / gap to change)
      {"tap": ["a", "key:space"], "ms": 80}
      {"down": "rt"}  /  {"up": "rt"}      press / release and keep going
      {"wait": 120}                         pause in ms
      {"stick": "left", "x": 0, "y": 1, "ms": 300}   push a stick (omit ms = until macro ends)
    Modes: once (runs fully on press), hold (runs while held, releases on let-go),
           repeat (loops while held), toggle (press to start looping, press again to stop)
    """

    def __init__(self, name, cfg, warn):
        self.name = name
        cfg = cfg or {}
        self.mode = str(cfg.get("mode", "once")).lower()
        if self.mode not in ("once", "hold", "repeat", "toggle"):
            warn(f"macro '{name}': unknown mode '{self.mode}', using 'once'")
            self.mode = "once"
        self.timeline, self.length = self._compile(cfg.get("steps") or [], warn)
        self.prev_trigger = False
        self.toggled = False
        self.running = False
        self.start = 0.0
        self.idx = 0
        self.held = set()
        self.sticks = {}

    def _compile(self, steps, warn):
        tl, t = [], 0.0
        for s in steps:
            if not isinstance(s, dict):
                warn(f"macro '{self.name}': bad step {s!r}")
                continue
            if "wait" in s:
                t += max(0.0, num(s["wait"], 0)) / 1000.0
            elif "tap" in s:
                tg = [x for x in listify(s["tap"]) if not str(x).startswith("macro:")]
                tl.append((t, "down", tg))
                t += max(1.0, num(s.get("ms"), 50)) / 1000.0
                tl.append((t, "up", tg))
                t += max(0.0, num(s.get("gap"), 30)) / 1000.0
            elif "down" in s:
                tl.append((t, "down", [x for x in listify(s["down"]) if not str(x).startswith("macro:")]))
            elif "up" in s:
                tl.append((t, "up", listify(s["up"])))
            elif "stick" in s:
                side = str(s["stick"]).lower()
                if side not in ("left", "right"):
                    warn(f"macro '{self.name}': stick must be 'left' or 'right'")
                    continue
                xy = (clamp(num(s.get("x"), 0)), clamp(num(s.get("y"), 0)))
                tl.append((t, "stick", (side, xy)))
                if "ms" in s:
                    t += max(0.0, num(s["ms"], 0)) / 1000.0
                    tl.append((t, "stick", (side, None)))
            else:
                warn(f"macro '{self.name}': unknown step {s!r}")
        return tl, t

    def _begin(self, now):
        self.running, self.start, self.idx = True, now, 0
        self.held, self.sticks = set(), {}

    def stop(self):
        self.running = False
        self.held, self.sticks = set(), {}

    def _advance(self, now):
        el = now - self.start
        tl = self.timeline
        while self.idx < len(tl) and tl[self.idx][0] <= el:
            _, kind, arg = tl[self.idx]
            self.idx += 1
            if kind == "down":
                self.held.update(arg)
            elif kind == "up":
                self.held.difference_update(arg)
            else:
                side, xy = arg
                if xy is None:
                    self.sticks.pop(side, None)
                else:
                    self.sticks[side] = xy
        return self.idx >= len(tl) and el >= self.length

    def update(self, now, trig):
        rising = trig and not self.prev_trigger
        self.prev_trigger = trig
        m = self.mode
        if m == "toggle":
            if rising:
                self.toggled = not self.toggled
            if not self.toggled:
                if self.running:
                    self.stop()
                return
        elif m in ("repeat", "hold") and not trig:
            if self.running:
                self.stop()
            return

        if not self.running:
            if m in ("repeat", "toggle") or (rising and m in ("once", "hold")):
                self._begin(now)
        if self.running and self._advance(now):
            if m in ("repeat", "toggle") and self.length > 0.001:
                self._begin(now)  # held set cleared -> one-frame release between loops
            elif m == "once":
                self.stop()
            # hold: keep final state until the button is released


class Modifier:
    """Tracks a hold-button so a quick solo tap can still be passed through."""

    def __init__(self):
        self.down = False
        self.since = 0.0
        self.used = False

    def update(self, held, other_pressed, now, tap_s):
        tapped = False
        if held:
            if not self.down:
                self.down, self.since, self.used = True, now, False
            if other_pressed:
                self.used = True
        elif self.down:
            self.down = False
            tapped = (not self.used) and (now - self.since) <= tap_s
        return tapped


# --------------------------------------------------------------------------------------
# The mapping engine (pure logic: RawState in -> Output out)
# --------------------------------------------------------------------------------------
class Engine:
    def __init__(self, config, profile=None, log=print):
        self.log = log
        self._warned = set()
        self.prev_pressed = set()
        self.consumed = set()
        self.last_t = None
        self.events = []
        self.hold_mod = Modifier()
        self.menu = None  # in-game quick menu: {'items': [(kind, value)], 'sel': i, 'since': t}
        self.menu_allowed = True  # off for co-op players 2-4 and when the overlay can't draw it
        self.online_safe = False  # True while an online game is in front (online-safe mode)
        self._tp_last, self._tp_acc, self._tp_zone = None, [0.0, 0.0], None
        self.gyro_bias, self._still, self._gyro_ema = (0.0, 0.0, 0.0), 0.0, (0.0, 0.0, 0.0)
        self.shift_mod = Modifier()
        self.active = None
        self.enabled = True            # master on/off switch ("mods off" = plain passthrough)
        self.crosshair_on = False
        self.recording = None          # list of (t, "down"/"up", input) while recording a macro
        self.record_t0 = 0.0
        self.last_active = set()
        self.last_gyro = (0.0, 0.0)
        self.press_count = {}
        self.mod_since = {}
        self.last_proc = {"lx": 0.0, "ly": 0.0, "rx": 0.0, "ry": 0.0, "lt": 0.0, "rt": 0.0}
        self.load(config, profile)

    # ---- config / profiles ----
    def _warn(self, msg):
        if msg not in self._warned:
            self._warned.add(msg)
            self.log(f"  [warning] {msg}")

    def load(self, config, profile=None):
        self._warned = set()
        self.cfg = config
        self.crosshair_on = bool((config.get("crosshair") or {}).get("enabled", False))
        profs = config.get("profiles")
        if not isinstance(profs, dict) or not profs:
            profs = {"default": {}}
            config["profiles"] = profs
        self.profile_names = list(profs)
        cur = profile or self.active or config.get("start_profile")
        if cur not in profs:
            if cur:
                self._warn(f"profile '{cur}' not found, using '{self.profile_names[0]}'")
            cur = self.profile_names[0]
        self.set_profile(cur, announce=(cur != self.active))

    def _resolve(self, name, seen=None):
        profs = self.cfg["profiles"]
        seen = seen if seen is not None else set()
        if name in seen:
            self._warn(f"profile inheritance loop at '{name}'")
            return {}
        seen.add(name)
        p = profs.get(name) or {}
        own = {k: v for k, v in p.items() if k != "extends"}
        parent = p.get("extends")
        if parent:
            if parent in profs:
                return deep_merge(self._resolve(parent, seen), own)
            self._warn(f"profile '{name}' extends unknown profile '{parent}'")
        return copy.deepcopy(own)

    def set_profile(self, name, announce=True):
        self.active = name
        self.p = self._resolve(name)
        macro_cfgs = deep_merge(self.cfg.get("macros") or {}, self.p.get("macros") or {})
        if self.online_safe:
            self.p, macro_cfgs = online_safe_profile(self.p), {}
        self.macros = {n: Macro(n, c, self._warn) for n, c in macro_cfgs.items()}
        self.toggle_state = {}
        self.turbo_start = {}
        self.pulses = []
        self.mouse_acc = [0.0, 0.0]
        self._tp_last = self._tp_zone = None
        self._validate()
        if isinstance(self.p.get("crosshair_on"), bool):   # profile can force the crosshair on/off
            self.crosshair_on = self.p["crosshair_on"]
        if announce:
            self.events.append(("profile", name))

    def _gyro_autocal(self, raw, dt, cal):
        """When the controller lies still (on a desk, not while aiming), slowly learn the gyro's drift.
        Readings are judged against the saved calibration, not the learned bias, so slow aiming isn't learned."""
        x, y, z = raw.gx - num(cal.get("x"), 0), raw.gy - num(cal.get("y"), 0), raw.gz - num(cal.get("z"), 0)
        e = self._gyro_ema
        k = min(1.0, dt * 4.0)
        self._gyro_ema = e = (e[0] + (x - e[0]) * k, e[1] + (y - e[1]) * k, e[2] + (z - e[2]) * k)
        busy = raw.buttons or raw.lt > 0.1 or raw.rt > 0.1 or abs(raw.lx) + abs(raw.ly) + abs(raw.rx) + abs(raw.ry) > 0.3
        calm = max(abs(e[0]), abs(e[1]), abs(e[2])) < 0.015 and max(abs(x - e[0]), abs(y - e[1]), abs(z - e[2])) < 0.02
        self._still = self._still + dt if (calm and not busy) else 0.0
        if self._still > 3.0:  # really still for 3 s: drift toward the average, never more than ~0.9 deg/s
            b, k2, cap = self.gyro_bias, min(1.0, dt * 0.5), 0.015
            self.gyro_bias = tuple(clamp(b[i] + (e[i] - b[i]) * k2, -cap, cap) for i in range(3))

    def _open_menu(self, now=0.0):
        items = [("profile", n) for n in self.profile_names] + [("mods", None), ("crosshair", None)]
        sel = self.profile_names.index(self.active) if self.active in self.profile_names else 0
        self.menu = {"items": items, "sel": sel, "since": now}
        # stop anything running so nothing is left half-pressed or fires all at once afterwards
        for m in self.macros.values():
            m.running, m.toggled, m.held, m.sticks = False, False, set(), {}
        self.turbo_start = {}
        self.pulses = []
        self.hold_mod.used = True  # letting go of Guide must not also tap Guide
        self.events.append(("menu", "open"))

    def cancel_menu(self):
        """Drop the menu without doing anything (controller unplugged, etc.)."""
        if self.menu is not None:
            self.menu = None
            self.events.append(("menu", "close"))

    def _close_menu(self, pressed, apply):
        m, self.menu = self.menu, None
        self.consumed |= pressed
        self.events.append(("menu", "close"))
        if not (apply and m):
            return
        kind, val = m["items"][m["sel"]]
        if kind == "profile":
            if val != self.active and val in self.profile_names:
                self.set_profile(val)
        elif kind == "mods":
            self.set_enabled(not self.enabled)
        elif kind == "crosshair":
            self.crosshair_on = not self.crosshair_on
            self.events.append(("crosshair", self.crosshair_on))

    def preview_menu(self):
        """(rows, sel) for a menu as it would open now, without opening it (for the app's preview)."""
        names = list(self.profile_names)
        m = {"items": [("profile", n) for n in names] + [("mods", None), ("crosshair", None)], "sel": 0}
        cur = names.index(self.active) if self.active in names else 0
        return self.menu_rows(m), (cur + 1) % len(m["items"])

    def menu_rows(self, menu=None):
        """Labels for the quick menu as (label, color, is_current, kind)."""
        menu = menu or self.menu
        if not menu:
            return []
        rows = []
        for kind, val in menu["items"]:
            if kind == "profile":
                c = (self._resolve(val) or {}).get("color") or "#3ec6ff"
                rows.append((val, c, val == self.active, "profile"))
            elif kind == "mods":
                rows.append(("Turn mods off" if self.enabled else "Turn mods on", "#ffd23f", False, "action"))
            else:
                rows.append(("Hide crosshair" if self.crosshair_on else "Show crosshair", "#3ee6a0", False, "action"))
        return rows

    def cycle_profile(self, delta):
        names = self.profile_names
        i = names.index(self.active) if self.active in names else 0
        self.set_profile(names[(i + delta) % len(names)])

    def _validate(self):
        p = self.p
        maps = [("remap", p.get("remap") or {})]
        sh = p.get("shift") or {}
        maps.append(("shift.remap", sh.get("remap") or {}))
        for label, m in maps:
            for k in m:
                if k not in ALL_INPUT_SET:
                    self._warn(f"[{self.active}] {label}: unknown input '{k}'")
        for k in list(p.get("turbo") or {}) + list(p.get("toggle") or []):
            if k not in ALL_INPUT_SET:
                self._warn(f"[{self.active}] turbo/toggle: unknown input '{k}'")
        if sh.get("button") and sh["button"] not in ALL_INPUT_SET:
            self._warn(f"[{self.active}] shift.button: unknown input '{sh['button']}'")

    # ---- output helpers ----
    def _emit(self, t, out):
        if not t or not isinstance(t, str):
            return
        t = t.strip().lower()
        if t in XBOX_SET or t == "touchpad":
            out.buttons.add(t)
        elif t == "lt":
            out.lt = 1.0
        elif t == "rt":
            out.rt = 1.0
        elif t in STICK_DIR_SET:
            side = "left" if t.startswith("ls") else "right"
            d = t[3:]
            dx = 1.0 if d == "right" else -1.0 if d == "left" else 0.0
            dy = 1.0 if d == "up" else -1.0 if d == "down" else 0.0
            out.stick_push.append((side, dx, dy))
        elif t.startswith("key:"):
            if t[4:]:
                out.keys.add(t[4:])
        elif t.startswith("mouse:"):
            b = t[6:]
            if b in MOUSE_TARGETS:
                out.mouse.add(b)
            else:
                self._warn(f"unknown mouse target '{t}' (use {', '.join(MOUSE_TARGETS)})")
        elif t.startswith("macro:") or t == "none":
            pass
        else:
            self._warn(f"unknown target '{t}'")

    # ---- main per-frame step ----
    def step(self, raw, now):
        dt = 0.0 if self.last_t is None else clamp(now - self.last_t, 0.0, 0.1)
        self.last_t = now
        cfg, p = self.cfg, self.p
        out = Output()

        sticks = p.get("sticks") or {}
        lcfg, rcfg = sticks.get("left") or {}, sticks.get("right") or {}
        lx, ly = process_stick(raw.lx, raw.ly, lcfg)
        rx, ry = process_stick(raw.rx, raw.ry, rcfg)
        tcfg = p.get("triggers") or {}
        lt = process_trigger(raw.lt, tcfg.get("left") or {})
        rt = process_trigger(raw.rt, tcfg.get("right") or {})
        self.last_proc = {"lx": lx, "ly": ly, "rx": rx, "ry": ry, "lt": lt, "rt": rt}

        # Build the full set of "pressed" digital inputs
        pressed = set(raw.buttons)
        tp = p.get("touchpad") if isinstance(p.get("touchpad"), dict) else {}
        tpmode = str(tp.get("mode", "button"))
        if "touchpad" in pressed and tpmode in ("zones2", "zones4"):
            pressed.discard("touchpad")  # the click becomes a zone you can map like any button
            if self._tp_zone is None:  # pick the zone when the click starts; sliding doesn't change it
                if tpmode == "zones2":
                    self._tp_zone = "tp_left" if raw.tx < 0.5 else "tp_right"
                else:
                    self._tp_zone = ("tp_t" if raw.ty < 0.5 else "tp_b") + ("l" if raw.tx < 0.5 else "r")
            pressed.add(self._tp_zone)
        else:
            self._tp_zone = None
            if tpmode == "mouse":
                pressed.discard("touchpad")
        thr = num(p.get("trigger_threshold"), 0.3)
        if lt > 0 and lt >= thr:
            pressed.add("lt")
        if rt > 0 and rt >= thr:
            pressed.add("rt")
        for pre, x, y, c in (("ls", lx, ly, lcfg), ("rs", rx, ry, rcfg)):
            bt = num(c.get("button_threshold"), 0.5)
            if y >= bt:
                pressed.add(pre + "_up")
            if y <= -bt:
                pressed.add(pre + "_down")
            if x >= bt:
                pressed.add(pre + "_right")
            if x <= -bt:
                pressed.add(pre + "_left")

        rising = pressed - self.prev_pressed
        self.prev_pressed = pressed
        for n in rising:
            if n in SDL_BUTTONS or n in TRIGGERS:
                self.press_count[n] = self.press_count.get(n, 0) + 1
        self.consumed &= pressed

        # ---- macro recording (from the real controller) ----
        rec_list = self.recording  # local ref: the panel thread may stop recording at any time
        if rec_list is not None and len(rec_list) < 400:
            rec = {n for n in pressed if n in XBOX_SET or n in TRIGGERS}
            prev = getattr(self, "_rec_prev", set())
            for n in sorted(rec - prev):
                rec_list.append((now - self.record_t0, "down", n))
            for n in sorted(prev - rec):
                rec_list.append((now - self.record_t0, "up", n))
            self._rec_prev = rec

        # ---- global combos: hold X + press a button ----
        ps = cfg.get("profile_switch") or {}
        hold = ps.get("hold")
        if hold:
            held = hold in pressed
            qm = cfg.get("quick_menu") or {}
            if self.menu is not None:
                # ---- quick menu is open: the game gets nothing until it closes ----
                self.hold_mod.used = True
                items, sel = self.menu["items"], self.menu["sel"]
                # a Guide shortcut pressed a little slowly still does its job
                combo = None
                for key, dflt in (("next", None), ("prev", None), ("toggle_mods", "back"), ("toggle_crosshair", "r3")):
                    b = ps.get(key, dflt)
                    if b and b in rising and b not in ("dpad_up", "dpad_down", "a", "b"):
                        combo = key
                if combo or now - self.menu.get("since", now) > 8.0:  # 8 s: Xbox pads power off if Guide is held
                    self._close_menu(pressed, apply=False)
                    if combo == "next":
                        self.cycle_profile(1)
                    elif combo == "prev":
                        self.cycle_profile(-1)
                    elif combo == "toggle_mods":
                        self.set_enabled(not self.enabled)
                    elif combo == "toggle_crosshair":
                        self.crosshair_on = not self.crosshair_on
                        self.events.append(("crosshair", self.crosshair_on))
                    self.consumed |= pressed
                    return out
                move = 0
                for up in ("dpad_up", "ls_up"):
                    if up in rising:
                        move -= 1
                for dn in ("dpad_down", "ls_down"):
                    if dn in rising:
                        move += 1
                if move:
                    self.menu["sel"] = (sel + move) % len(items)
                    self.events.append(("menu", "move"))
                if "b" in rising:
                    self._close_menu(pressed, apply=False)
                elif "a" in rising or not held:
                    self._close_menu(pressed, apply=True)
                self.consumed |= pressed
                self.last_active = set()
                self.pulses = []
                return out
            elif (held and self.menu_allowed and qm.get("enabled", True) and not self.hold_mod.used and self.hold_mod.down
                  and not (pressed - {hold}) and now - self.hold_mod.since >= num(qm.get("hold_ms"), 450) / 1000):
                self._open_menu(now)
                self.consumed |= pressed
                return out
            if held:
                actions = (("next", None), ("prev", None),
                           ("toggle_mods", "back"), ("toggle_crosshair", "r3"))
                for key, dflt in actions:
                    b = ps.get(key, dflt)
                    if b and b in rising and b not in self.consumed:
                        self.consumed.add(b)
                        if key == "next":
                            self.cycle_profile(1)
                        elif key == "prev":
                            self.cycle_profile(-1)
                        elif key == "toggle_mods":
                            self.set_enabled(not self.enabled)
                        else:
                            self.crosshair_on = not self.crosshair_on
                            self.events.append(("crosshair", self.crosshair_on))
                p = self.p
            if self.hold_mod.update(held, bool(rising - {hold}), now, num(ps.get("tap_ms"), 300) / 1000):
                base = p.get("remap") or {}
                tgt = base[hold] if hold in base else default_target(hold)
                self.pulses.append((now + 0.06, listify(tgt)))

        effective = pressed - self.consumed
        if hold:
            effective.discard(hold)

        # ---- mods switched off: plain controller passthrough ----
        if not self.enabled:
            self.pulses = [(end, tl) for end, tl in self.pulses if end > now]
            out.buttons = {b for b in effective if b in XBOX_SET or b == "touchpad"}
            for _, tl in self.pulses:
                for t in tl:
                    if t in XBOX_SET or t == "touchpad":
                        out.buttons.add(t)
            out.lt, out.rt = raw.lt, raw.rt
            out.lx, out.ly, out.rx, out.ry = raw.lx, raw.ly, raw.rx, raw.ry
            self.last_active = set(effective)
            return out

        # ---- shift layer ----
        remap = dict(p.get("remap") or {})
        shift = p.get("shift") or {}
        sb = shift.get("button")
        shift_sticks = {}
        if sb:
            sheld = sb in effective
            if self.shift_mod.update(sheld, bool((rising & effective) - {sb}), now,
                                     num(shift.get("tap_ms"), 250) / 1000):
                if shift.get("tap"):
                    self.pulses.append((now + 0.06, listify(shift["tap"])))
            effective.discard(sb)
            if sheld:
                remap.update(shift.get("remap") or {})
                shift_sticks = shift.get("sticks") or {}
        eff_rising = rising & effective

        def targets_of(n):
            return listify(remap[n]) if n in remap else listify(default_target(n))

        # ---- toggles ----
        toggles = set(p.get("toggle") or [])
        for n in toggles & eff_rising:
            self.toggle_state[n] = not self.toggle_state.get(n, False)
        active = set(effective)
        for n in toggles:
            if self.toggle_state.get(n):
                active.add(n)
            else:
                active.discard(n)

        self.pulses = [(end, tl) for end, tl in self.pulses if end > now]

        # ---- macros (triggered by any active input mapped to "macro:<name>") ----
        macro_trig = set()
        sources = [targets_of(n) for n in active] + [tl for _, tl in self.pulses]
        for tl in sources:
            for t in tl:
                if isinstance(t, str) and t.lower().startswith("macro:"):
                    macro_trig.add(t[6:].strip())
        for name in macro_trig - set(self.macros):
            self._warn(f"unknown macro '{name}'")
        for name, m in self.macros.items():
            m.update(now, name in macro_trig)

        # ---- turbo ----
        turbo = p.get("turbo") or {}
        on = set()
        for n in active:
            tc = turbo.get(n)
            if tc is None or tc is False:
                on.add(n)
                continue
            if isinstance(tc, dict):
                rate, duty = num(tc.get("rate_hz"), 10), num(tc.get("duty"), 0.5)
            elif tc is True:
                rate, duty = 10.0, 0.5
            else:
                rate, duty = num(tc, 10), 0.5
            st = self.turbo_start.setdefault(n, now)
            if rate <= 0 or ((now - st) * rate) % 1.0 < duty:
                on.add(n)
        for n in list(self.turbo_start):
            if n not in active:
                del self.turbo_start[n]

        # ---- resolve inputs -> targets ----
        # A trigger that still sends itself keeps its analog value; extra targets fire digitally.
        passthru = {trg: trg in targets_of(trg) and trg not in toggles and not turbo.get(trg)
                    for trg in TRIGGERS}
        for n in on:
            for t in targets_of(n):
                if passthru.get(n) and t == n:
                    continue  # analog trigger handled below
                self._emit(t, out)
        for _, tl in self.pulses:
            for t in tl:
                self._emit(t, out)
        overrides = {}
        for m in self.macros.values():
            if m.running:
                for t in m.held:
                    self._emit(t, out)
                overrides.update(m.sticks)
        if passthru["lt"]:
            out.lt = max(out.lt, lt)
        if passthru["rt"]:
            out.rt = max(out.rt, rt)

        # ---- sticks -> outputs ----
        for x, y, c, side in ((lx, ly, lcfg, "left"), (rx, ry, rcfg, "right")):
            if shift_sticks.get(side):
                c = dict(c, **shift_sticks[side])  # e.g. mouse mode while holding the shift button
            dest = str(c.get("output", side) or "none").lower()
            if dest == "left":
                out.lx += x
                out.ly += y
            elif dest == "right":
                out.rx += x
                out.ry += y
            elif dest == "mouse":
                spd = num(c.get("mouse_speed"), 1500)
                self.mouse_acc[0] += x * spd * dt
                self.mouse_acc[1] -= y * spd * dt
            elif dest != "none":
                self._warn(f"stick output '{dest}' unknown (use left/right/mouse/none)")
        for side, dx, dy in out.stick_push:
            if side == "left":
                out.lx += dx
                out.ly += dy
            else:
                out.rx += dx
                out.ry += dy
        # ---- touchpad as a laptop-style mouse ----
        if tpmode == "mouse":
            if raw.touch and self._tp_last is not None:
                sp = num(tp.get("speed"), 1.0) * 1400
                self.mouse_acc[0] += (raw.tx - self._tp_last[0]) * sp
                self.mouse_acc[1] += (raw.ty - self._tp_last[1]) * sp * 0.55  # the pad is wider than tall
            self._tp_last = (raw.tx, raw.ty) if raw.touch else None
            if "touchpad" in raw.buttons:
                out.mouse.add("left")
        # ---- gyro aiming (motion controls) ----
        self.last_gyro = (0.0, 0.0)
        g = p.get("gyro") or {}
        if raw.has_gyro:
            cal = cfg.get("gyro_cal") or {}
            if g.get("auto_cal", True):
                self._gyro_autocal(raw, dt, cal)
            bx, by, bz = self.gyro_bias
            deg = 57.29578
            pitch = (raw.gx - num(cal.get("x"), 0) - bx) * deg
            yaw = -(raw.gy - num(cal.get("y"), 0) - by) * deg
            roll = -(raw.gz - num(cal.get("z"), 0) - bz) * deg
            axis = str(g.get("horizontal", "yaw"))
            hz = roll if axis == "roll" else (yaw + roll) if axis == "both" else yaw
            vt = pitch
            if math.hypot(hz, vt) < num(g.get("deadband"), 1.0):
                hz = vt = 0.0
            if g.get("invert_x"):
                hz = -hz
            if g.get("invert_y"):
                vt = -vt
            self.last_gyro = (hz, vt)
            act = str(g.get("activate", "always"))
            live = bool(g.get("enabled")) and (act == "always" or (act == "aiming" and "lt" in active)
                                               or (act == "hold" and g.get("button") in active))
            if live and (hz or vt):
                sens = num(g.get("sensitivity"), 1.0)
                if str(g.get("output", "stick")) == "mouse":
                    ppd = num(g.get("mouse_px_per_deg"), 18) * sens
                    self.mouse_acc[0] += hz * ppd * dt
                    self.mouse_acc[1] -= vt * ppd * dt
                else:
                    full = max(10.0, num(g.get("full_speed_dps"), 240))
                    sx, sy = hz * sens / full, vt * sens / full
                    mag = math.hypot(sx, sy)
                    if mag > 0:
                        anti = clamp(num(g.get("anti_deadzone"), 0.12), 0.0, 0.9)
                        k = (anti + (1 - anti) * min(1.0, mag)) / mag
                        out.rx += sx * k
                        out.ry += sy * k

        # ---- conditional stick tweaks: aim slowdown, recoil control, ... ----
        for i, sm in enumerate(p.get("stick_mods") or []):
            if not isinstance(sm, dict):
                continue
            conds = listify(sm.get("while"))
            key = sm.get("id") or i
            if conds and all(c in active for c in conds):
                since = self.mod_since.setdefault(key, now)
                if (now - since) * 1000 < num(sm.get("delay_ms"), 0):
                    continue
                sc = num(sm.get("scale"), 1.0)
                ax, ay = num(sm.get("add_x"), 0.0), num(sm.get("add_y"), 0.0)
                wig = clamp(num(sm.get("wiggle"), 0.0), 0.0, 0.4)
                if wig:  # aim assist booster: tiny automatic stick motion so the game's own aim assist keeps engaging
                    ph = 2 * math.pi * clamp(num(sm.get("hz"), 12), 2, 30) * (now - since)
                    if str(sm.get("pattern", "circle")) == "shake":
                        ax += wig * math.sin(ph)
                    else:
                        ax += wig * math.cos(ph)
                        ay += wig * math.sin(ph)
                if str(sm.get("stick", "right")).lower() == "left":
                    out.lx, out.ly = out.lx * sc + ax, out.ly * sc + ay
                else:
                    out.rx, out.ry = out.rx * sc + ax, out.ry * sc + ay
            else:
                self.mod_since.pop(key, None)
        self.last_active = active

        out.lx, out.ly, out.rx, out.ry = clamp(out.lx), clamp(out.ly), clamp(out.rx), clamp(out.ry)
        if "left" in overrides:
            out.lx, out.ly = overrides["left"]
        if "right" in overrides:
            out.rx, out.ry = overrides["right"]

        out.mouse_dx = int(self.mouse_acc[0])
        out.mouse_dy = int(self.mouse_acc[1])
        self.mouse_acc[0] -= out.mouse_dx
        self.mouse_acc[1] -= out.mouse_dy
        return out

    def set_online_safe(self, on):
        """Switch ban-risk automation off (on=True) or back on, keeping the same profile."""
        on = bool(on)
        if on != self.online_safe:
            self.online_safe = on
            keep = self.crosshair_on
            self.set_profile(self.active, announce=False)
            self.crosshair_on = keep
            return True
        return False

    def set_enabled(self, on):
        on = bool(on)
        if on != self.enabled:
            self.enabled = on
            for m in self.macros.values():
                m.stop()
            self.toggle_state = {}
            self.events.append(("enabled", on))

    def start_recording(self, now):
        self.record_t0 = now
        self._rec_prev = set()
        self.recording = []

    def stop_recording(self, now):
        """Turn the recorded presses into macro steps."""
        events, self.recording = self.recording or [], None
        held = set()
        for _, kind, n in events:
            if kind == "down":
                held.add(n)
            else:
                held.discard(n)
        events = list(events) + [(now - self.record_t0, "up", n) for n in sorted(held)]
        steps, last_t = [], None
        for t, kind, n in events:
            if last_t is not None:
                gap = int(round((t - last_t) * 1000))
                if gap >= 5:
                    steps.append({"wait": gap})
            last_t = t
            if steps and kind in steps[-1] and isinstance(steps[-1][kind], list):
                steps[-1][kind].append(n)
            else:
                steps.append({kind: [n]})
        for st in steps:
            for k in ("down", "up"):
                if k in st and len(st[k]) == 1:
                    st[k] = st[k][0]
        return steps

    def rumble_scale(self):
        r = self.p.get("rumble", 1.0)
        if r is True:
            return 1.0
        if r is False or r is None:
            return 0.0
        return clamp(num(r, 1.0), 0.0, 1.0)


# --------------------------------------------------------------------------------------
# Physical controller (pygame / SDL2)
# --------------------------------------------------------------------------------------
def init_pygame():
    try:
        import pygame
    except ImportError:
        sys.exit("pygame is not installed. Run setup.bat (or: pip install pygame-ce vgamepad)")
    pygame.display.init()   # needed for the event queue (no window is opened)
    pygame.joystick.init()
    try:
        from pygame._sdl2 import controller as sdlc
        sdlc.init()
    except Exception:
        sdlc = None
    return pygame, sdlc


class SDLExtras:
    """Direct calls into pygame's own copy of SDL2 for things pygame doesn't expose (motion sensors)."""
    GYRO = 2

    def __init__(self):
        self.lib = None
        try:
            import glob
            import pygame
            d = os.path.dirname(pygame.__file__)
            up = os.path.dirname(d)
            for pat in (os.path.join(d, "SDL2.dll"), os.path.join(up, "pygame*.libs", "SDL2*.dll"),
                        os.path.join(d, "libSDL2*.so*"), os.path.join(up, "pygame*.libs", "libSDL2-*.so*"),
                        os.path.join(d, ".dylibs", "libSDL2*.dylib")):
                for c in sorted(glob.glob(pat)):
                    if any(x in os.path.basename(c).lower() for x in ("mixer", "ttf", "image")):
                        continue
                    self.lib = ctypes.CDLL(c)
                    break
                if self.lib:
                    break
            if self.lib:
                L = self.lib
                L.SDL_GameControllerFromInstanceID.restype = ctypes.c_void_p
                L.SDL_GameControllerFromInstanceID.argtypes = [ctypes.c_int32]
                L.SDL_GameControllerHasSensor.argtypes = [ctypes.c_void_p, ctypes.c_int]
                L.SDL_GameControllerSetSensorEnabled.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
                L.SDL_GameControllerGetSensorData.argtypes = [ctypes.c_void_p, ctypes.c_int,
                                                              ctypes.POINTER(ctypes.c_float), ctypes.c_int]
                for fn, args, res in (  # newer calls (SDL 2.0.14+); missing ones just switch the feature off
                        ("SDL_GameControllerGetNumTouchpads", [ctypes.c_void_p], ctypes.c_int),
                        ("SDL_GameControllerGetTouchpadFinger", [ctypes.c_void_p, ctypes.c_int, ctypes.c_int,
                                                                 ctypes.POINTER(ctypes.c_uint8), ctypes.POINTER(ctypes.c_float),
                                                                 ctypes.POINTER(ctypes.c_float), ctypes.POINTER(ctypes.c_float)], ctypes.c_int),
                        ("SDL_GameControllerSendEffect", [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int], ctypes.c_int),
                        ("SDL_GameControllerGetSerial", [ctypes.c_void_p], ctypes.c_char_p),
                        ("SDL_GameControllerGetType", [ctypes.c_void_p], ctypes.c_int)):
                    try:
                        f = getattr(L, fn)
                        f.argtypes, f.restype = args, res
                    except AttributeError:
                        pass
        except Exception:
            self.lib = None

    def gc_for(self, instance_id):
        try:
            return self.lib.SDL_GameControllerFromInstanceID(int(instance_id)) if self.lib else None
        except Exception:
            return None

    def has(self, fn):
        return bool(self.lib) and hasattr(self.lib, fn)

    def serial(self, gc):
        try:
            v = self.lib.SDL_GameControllerGetSerial(gc) if gc and self.has("SDL_GameControllerGetSerial") else None
            return v.decode("utf-8", "replace").strip() if v else None
        except Exception:
            return None

    def ctype(self, gc):
        try:
            return int(self.lib.SDL_GameControllerGetType(gc)) if gc and self.has("SDL_GameControllerGetType") else 0
        except Exception:
            return 0

    def touch(self, gc, st, x, y, pr):
        """Returns (down, x, y) for the first finger on the first touchpad, or None if there's no touchpad."""
        try:
            if self.lib.SDL_GameControllerGetTouchpadFinger(gc, 0, 0, ctypes.byref(st), ctypes.byref(x),
                                                            ctypes.byref(y), ctypes.byref(pr)) == 0:
                return bool(st.value), x.value, y.value
        except Exception:
            pass
        return None

    def send_effect(self, gc, data):
        try:
            buf = (ctypes.c_uint8 * len(data))(*data)
            return self.lib.SDL_GameControllerSendEffect(gc, buf, len(data)) == 0
        except Exception:
            return False

    def enable_gyro(self, instance_id):
        """Returns the SDL controller pointer if it has a gyro (now switched on), else None."""
        if not self.lib:
            return None
        try:
            gc = self.lib.SDL_GameControllerFromInstanceID(int(instance_id))
            if gc and self.lib.SDL_GameControllerHasSensor(gc, self.GYRO):
                if self.lib.SDL_GameControllerSetSensorEnabled(gc, self.GYRO, 1) == 0:
                    return gc
        except Exception:
            pass
        return None

    def read_gyro(self, gc, buf):
        return self.lib.SDL_GameControllerGetSensorData(gc, self.GYRO, buf, 3) == 0


_SDLX = None


def sdl_extras():
    global _SDLX
    if _SDLX is None:
        _SDLX = SDLExtras()
    return _SDLX


TRIGGER_FEELS = {  # DualSense adaptive trigger effects: 11 bytes each
    "off":    [0x05, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "soft":   [0x01, 30, 70, 0, 0, 0, 0, 0, 0, 0, 0],    # light resistance the whole way
    "firm":   [0x01, 0, 170, 0, 0, 0, 0, 0, 0, 0, 0],    # heavy resistance the whole way
    "click":  [0x02, 70, 140, 200, 0, 0, 0, 0, 0, 0, 0],  # a wall halfway, then it gives (like a gun)
    "bow":    [0x02, 30, 200, 120, 0, 0, 0, 0, 0, 0, 0],  # tension that builds while you pull
    "brake":  [0x02, 120, 220, 255, 0, 0, 0, 0, 0, 0, 0],  # stiff near the bottom, like a car brake
    "pulse":  [0x06, 15, 63, 128, 0, 0, 0, 0, 0, 0, 0],  # buzzes as you pull (rapid fire feel)
}


class SDLControllerPad:
    """Uses SDL's GameController API: consistent layout for Xbox, PS, Switch, generic."""
    backend = "SDL GameController"

    def __init__(self, pg, sdlc, index):
        self.c = sdlc.Controller(index)
        self.j = pg.joystick.Joystick(index)
        self.instance_id = self.j.get_instance_id()
        try:
            self.name = sdlc.name_forindex(index) or self.j.get_name()
        except Exception:
            self.name = self.j.get_name()
        x = sdl_extras()
        self.gyro_gc = x.enable_gyro(self.instance_id)
        self.has_gyro = bool(self.gyro_gc)
        self._gbuf = (ctypes.c_float * 3)()
        self.gc = x.gc_for(self.instance_id)
        self.serial = x.serial(self.gc)
        self.ctype = x.ctype(self.gc)  # 7 = DualSense (PS5)
        try:
            guid = self.j.get_guid()
        except Exception:
            guid = ""
        self.guid = guid
        # what Clutch remembers this controller by (serial if it has one, else its model)
        self.key = ("sn:" + self.serial) if self.serial else ("model:" + (guid or self.name))
        self.has_touch = bool(self.gc and x.has("SDL_GameControllerGetTouchpadFinger")
                              and x.lib.SDL_GameControllerGetNumTouchpads(self.gc) > 0)
        self._tst, self._tx, self._ty, self._tp = ctypes.c_uint8(), ctypes.c_float(), ctypes.c_float(), ctypes.c_float()
        self.has_trigger_fx = bool(self.gc and self.ctype == 7 and x.has("SDL_GameControllerSendEffect"))
        self.valid = []
        for n, i in SDL_BUTTONS.items():
            try:
                self.c.get_button(i)
                self.valid.append((n, i))
            except Exception:
                pass

    def attached(self):
        try:
            return bool(self.c.attached())
        except Exception:
            return False

    def read(self, raw):
        g, a = self.c.get_button, self.c.get_axis
        raw.buttons = {n for n, i in self.valid if g(i)}
        raw.lx = clamp(a(0) / 32767.0)
        raw.ly = clamp(-a(1) / 32767.0)
        raw.rx = clamp(a(2) / 32767.0)
        raw.ry = clamp(-a(3) / 32767.0)
        raw.lt = clamp(a(4) / 32767.0, 0.0, 1.0)
        raw.rt = clamp(a(5) / 32767.0, 0.0, 1.0)
        if self.has_touch:
            t = sdl_extras().touch(self.gc, self._tst, self._tx, self._ty, self._tp)
            if t:
                raw.touch, raw.tx, raw.ty = t
        raw.has_gyro = False
        if self.gyro_gc and sdl_extras().read_gyro(self.gyro_gc, self._gbuf):
            raw.gx, raw.gy, raw.gz = self._gbuf[0], self._gbuf[1], self._gbuf[2]
            raw.has_gyro = True

    def battery(self):
        try:
            return str(self.j.get_power_level())
        except Exception:
            return "unknown"

    def rumble(self, lo, hi, ms):
        try:
            self.c.rumble(lo, hi, int(ms))
        except Exception:
            pass

    def stop_rumble(self):
        try:
            self.c.stop_rumble()
        except Exception:
            pass

    def set_trigger_feel(self, left, right):
        """DualSense adaptive triggers. left/right are 11-byte effect blocks (see TRIGGER_FEELS)."""
        if not self.has_trigger_fx:
            return False
        data = [0] * 47  # SDL's DS5 effects state
        data[0] = 0x04 | 0x08  # change right + left trigger effects only (rumble and lights untouched)
        data[10:21] = right
        data[21:32] = left
        return sdl_extras().send_effect(self.gc, data)

    def set_led(self, color):
        """Returns False if this controller has no light."""
        try:
            return self.c.set_led(color) is not False  # PlayStation light bar etc.
        except Exception:
            return True

    def close(self):
        for f in (self.stop_rumble, self.c.quit, self.j.quit):
            try:
                f()
            except Exception:
                pass


class JoystickPad:
    """Fallback for when SDL doesn't recognise the pad as a game controller.
    Assumes Xbox/XInput layout; other pads may be mapped oddly (use --test to check)."""
    backend = "raw joystick (Xbox layout assumed)"
    BTN = {"a": 0, "b": 1, "x": 2, "y": 3, "lb": 4, "rb": 5, "back": 6, "start": 7,
           "l3": 8, "r3": 9, "guide": 10}

    def __init__(self, pg, index):
        self.j = pg.joystick.Joystick(index)
        self.j.init()
        self.instance_id = self.j.get_instance_id()
        self.name = self.j.get_name()

    def attached(self):
        return True  # removal is detected via JOYDEVICEREMOVED events

    def read(self, raw):
        j = self.j
        nb, na = j.get_numbuttons(), j.get_numaxes()
        b = {n for n, i in self.BTN.items() if i < nb and j.get_button(i)}
        if j.get_numhats() > 0:
            hx, hy = j.get_hat(0)
            if hy > 0: b.add("dpad_up")
            if hy < 0: b.add("dpad_down")
            if hx < 0: b.add("dpad_left")
            if hx > 0: b.add("dpad_right")
        raw.buttons = b

        def ax(i):
            return j.get_axis(i) if i < na else 0.0
        raw.lx, raw.ly = clamp(ax(0)), clamp(-ax(1))
        raw.rx, raw.ry = clamp(ax(2)), clamp(-ax(3))
        raw.lt = clamp((ax(4) + 1) / 2, 0.0, 1.0) if na > 4 else 0.0
        raw.rt = clamp((ax(5) + 1) / 2, 0.0, 1.0) if na > 5 else 0.0

    def battery(self):
        try:
            return str(self.j.get_power_level())
        except Exception:
            return "unknown"

    def rumble(self, lo, hi, ms):
        try:
            self.j.rumble(lo, hi, int(ms))
        except Exception:
            pass

    def stop_rumble(self):
        try:
            self.j.stop_rumble()
        except Exception:
            pass

    def close(self):
        try:
            self.stop_rumble()
            self.j.quit()
        except Exception:
            pass


def list_pads(pg, sdlc):
    pads = []
    for i in range(pg.joystick.get_count()):
        try:
            j = pg.joystick.Joystick(i)
            name, iid = j.get_name(), j.get_instance_id()
        except Exception:
            name, iid = "?", None
        is_gc = False
        if sdlc:
            try:
                is_gc = bool(sdlc.is_controller(i))
            except Exception:
                pass
        pads.append((i, name, is_gc, iid))
    return pads


def open_pad(pg, sdlc, cfg, exclude=(), first_free=False):
    """Open a physical controller. `exclude` = instance ids already in use (or Clutch's own virtual pads)."""
    pads = [x for x in list_pads(pg, sdlc) if x[3] not in exclude]
    filt = str(cfg.get("controller_name") or "").lower()
    if filt and not first_free:
        pads = [x for x in pads if filt in x[1].lower()]
    idx = 0 if first_free else int(num(cfg.get("controller_index"), 0))
    if idx >= len(pads):
        return None
    i, _name, is_gc, _iid = pads[idx]
    if is_gc and sdlc:
        try:
            return SDLControllerPad(pg, sdlc, i)
        except Exception:
            pass
    return JoystickPad(pg, i)


# --------------------------------------------------------------------------------------
# Virtual Xbox 360 controller (ViGEmBus via vgamepad)
# --------------------------------------------------------------------------------------
class VirtualPad:
    def __init__(self):
        try:
            import vgamepad as vg
        except Exception as e:
            raise RuntimeError(
                "Couldn't load vgamepad / ViGEmBus. Run setup.bat, and if ViGEmBus never "
                "installed, get it from github.com/nefarius/ViGEmBus/releases.\n  Details: " + str(e))
        X = vg.XUSB_BUTTON
        self.map = {
            "a": X.XUSB_GAMEPAD_A, "b": X.XUSB_GAMEPAD_B, "x": X.XUSB_GAMEPAD_X, "y": X.XUSB_GAMEPAD_Y,
            "lb": X.XUSB_GAMEPAD_LEFT_SHOULDER, "rb": X.XUSB_GAMEPAD_RIGHT_SHOULDER,
            "back": X.XUSB_GAMEPAD_BACK, "start": X.XUSB_GAMEPAD_START, "guide": X.XUSB_GAMEPAD_GUIDE,
            "l3": X.XUSB_GAMEPAD_LEFT_THUMB, "r3": X.XUSB_GAMEPAD_RIGHT_THUMB,
            "dpad_up": X.XUSB_GAMEPAD_DPAD_UP, "dpad_down": X.XUSB_GAMEPAD_DPAD_DOWN,
            "dpad_left": X.XUSB_GAMEPAD_DPAD_LEFT, "dpad_right": X.XUSB_GAMEPAD_DPAD_RIGHT,
        }
        self.pad = vg.VX360Gamepad()
        self.kind = "xbox"
        self.lightbar = None
        self.large = 0.0
        self.small = 0.0
        self._cb = self._notify  # keep a reference alive
        try:
            self.pad.register_notification(callback_function=self._cb)
        except Exception:
            pass
        self.prev_buttons = set()
        self.prev_sig = None

    def _notify(self, client, target, large_motor, small_motor, led_number, user_data):
        self.large = large_motor / 255.0
        self.small = small_motor / 255.0

    def send(self, out):
        buttons = {b for b in out.buttons if b in self.map}
        sig = (frozenset(buttons), round(out.lt, 4), round(out.rt, 4),
               round(out.lx, 4), round(out.ly, 4), round(out.rx, 4), round(out.ry, 4))
        if sig == self.prev_sig:
            return
        self.prev_sig = sig
        for b in buttons - self.prev_buttons:
            self.pad.press_button(button=self.map[b])
        for b in self.prev_buttons - buttons:
            self.pad.release_button(button=self.map[b])
        self.prev_buttons = buttons
        self.pad.left_trigger_float(value_float=out.lt)
        self.pad.right_trigger_float(value_float=out.rt)
        self.pad.left_joystick_float(x_value_float=out.lx, y_value_float=out.ly)
        self.pad.right_joystick_float(x_value_float=out.rx, y_value_float=out.ry)
        self.pad.update()

    def close(self):
        try:
            self.pad.reset()
            self.pad.update()
        except Exception:
            pass
        try:
            del self.pad
        except Exception:
            pass


class VirtualDS4Pad:
    """Virtual DualShock 4 (PlayStation mode): for PS Remote Play / PlayStation Plus on PC and
    games that want a PlayStation controller."""

    def __init__(self):
        try:
            import vgamepad as vg
        except Exception as e:
            raise RuntimeError(
                "Couldn't load vgamepad / ViGEmBus. Install the ViGEmBus driver from the Setup check page.\n"
                "  Details: " + str(e))
        B, S, D = vg.DS4_BUTTONS, vg.DS4_SPECIAL_BUTTONS, vg.DS4_DPAD_DIRECTIONS
        self.map = {
            "a": B.DS4_BUTTON_CROSS, "b": B.DS4_BUTTON_CIRCLE, "x": B.DS4_BUTTON_SQUARE, "y": B.DS4_BUTTON_TRIANGLE,
            "lb": B.DS4_BUTTON_SHOULDER_LEFT, "rb": B.DS4_BUTTON_SHOULDER_RIGHT,
            "back": B.DS4_BUTTON_SHARE, "start": B.DS4_BUTTON_OPTIONS,
            "l3": B.DS4_BUTTON_THUMB_LEFT, "r3": B.DS4_BUTTON_THUMB_RIGHT,
        }
        self.special = {"guide": S.DS4_SPECIAL_BUTTON_PS, "touchpad": S.DS4_SPECIAL_BUTTON_TOUCHPAD}
        self.trig_bits = (B.DS4_BUTTON_TRIGGER_LEFT, B.DS4_BUTTON_TRIGGER_RIGHT)
        self.dirs = {  # (up, down, left, right) -> hat value
            (1, 0, 0, 0): D.DS4_BUTTON_DPAD_NORTH, (0, 1, 0, 0): D.DS4_BUTTON_DPAD_SOUTH,
            (0, 0, 1, 0): D.DS4_BUTTON_DPAD_WEST, (0, 0, 0, 1): D.DS4_BUTTON_DPAD_EAST,
            (1, 0, 1, 0): D.DS4_BUTTON_DPAD_NORTHWEST, (1, 0, 0, 1): D.DS4_BUTTON_DPAD_NORTHEAST,
            (0, 1, 1, 0): D.DS4_BUTTON_DPAD_SOUTHWEST, (0, 1, 0, 1): D.DS4_BUTTON_DPAD_SOUTHEAST,
        }
        self.dpad_none = D.DS4_BUTTON_DPAD_NONE
        self.pad = vg.VDS4Gamepad()
        self.kind = "playstation"
        self.large = self.small = 0.0
        self.lightbar = None
        self._cb = self._notify
        try:
            self.pad.register_notification(callback_function=self._cb)
        except Exception:
            pass
        self.prev_sig = None

    def _notify(self, client, target, large_motor, small_motor, lightbar_color, user_data):
        self.large = large_motor / 255.0
        self.small = small_motor / 255.0
        try:
            self.lightbar = (lightbar_color.Red, lightbar_color.Green, lightbar_color.Blue)
        except Exception:
            pass

    def send(self, out):
        b = out.buttons
        sig = (frozenset(b), round(out.lt, 4), round(out.rt, 4),
               round(out.lx, 4), round(out.ly, 4), round(out.rx, 4), round(out.ry, 4))
        if sig == self.prev_sig:
            return
        self.prev_sig = sig
        p = self.pad
        p.report.wButtons = 0
        p.report.bSpecial = 0
        for name, bit in self.map.items():
            if name in b:
                p.press_button(button=bit)
        for name, bit in self.special.items():
            if name in b:
                p.press_special_button(special_button=bit)
        if out.lt > 0.1:
            p.press_button(button=self.trig_bits[0])
        if out.rt > 0.1:
            p.press_button(button=self.trig_bits[1])
        u, d, l, r = ("dpad_up" in b, "dpad_down" in b, "dpad_left" in b, "dpad_right" in b)
        if u and d:
            u = d = False
        if l and r:
            l = r = False
        p.directional_pad(direction=self.dirs.get((int(u), int(d), int(l), int(r)), self.dpad_none))
        p.left_trigger_float(value_float=out.lt)
        p.right_trigger_float(value_float=out.rt)
        p.left_joystick_float(x_value_float=out.lx, y_value_float=-out.ly)   # DS4: y grows downward
        p.right_joystick_float(x_value_float=out.rx, y_value_float=-out.ry)
        p.update()

    def close(self):
        try:
            self.pad.reset()
            self.pad.update()
        except Exception:
            pass
        try:
            del self.pad
        except Exception:
            pass


def make_virtual_pad(kind):
    return VirtualDS4Pad() if kind == "playstation" else VirtualPad()


OUTPUT_LABEL = {"xbox": "Xbox controller", "playstation": "PlayStation controller"}


# --------------------------------------------------------------------------------------
# Keyboard / mouse output (Windows SendInput, scancodes so games see it)
# --------------------------------------------------------------------------------------
def _build_vk():
    vk = {c: ord(c.upper()) for c in "abcdefghijklmnopqrstuvwxyz"}
    vk.update({d: ord(d) for d in "0123456789"})
    vk.update({f"f{i}": 0x6F + i for i in range(1, 25)})
    vk.update({f"num{i}": 0x60 + i for i in range(10)})
    vk.update({
        "space": 0x20, "enter": 0x0D, "return": 0x0D, "esc": 0x1B, "escape": 0x1B, "tab": 0x09,
        "backspace": 0x08, "capslock": 0x14,
        "shift": 0xA0, "lshift": 0xA0, "rshift": 0xA1, "ctrl": 0xA2, "lctrl": 0xA2, "rctrl": 0xA3,
        "alt": 0xA4, "lalt": 0xA4, "ralt": 0xA5, "win": 0x5B, "lwin": 0x5B, "rwin": 0x5C, "menu": 0x5D,
        "up": 0x26, "down": 0x28, "left": 0x25, "right": 0x27,
        "insert": 0x2D, "delete": 0x2E, "del": 0x2E, "home": 0x24, "end": 0x23,
        "pageup": 0x21, "pagedown": 0x22, "pgup": 0x21, "pgdn": 0x22,
        "printscreen": 0x2C, "scrolllock": 0x91, "pause": 0x13, "numlock": 0x90,
        "minus": 0xBD, "-": 0xBD, "equals": 0xBB, "=": 0xBB, "[": 0xDB, "lbracket": 0xDB,
        "]": 0xDD, "rbracket": 0xDD, "\\": 0xDC, "backslash": 0xDC, ";": 0xBA, "semicolon": 0xBA,
        "'": 0xDE, "quote": 0xDE, ",": 0xBC, "comma": 0xBC, ".": 0xBE, "period": 0xBE,
        "/": 0xBF, "slash": 0xBF, "`": 0xC0, "grave": 0xC0, "tilde": 0xC0,
        "multiply": 0x6A, "add": 0x6B, "subtract": 0x6D, "decimal": 0x6E, "divide": 0x6F,
        "volume_up": 0xAF, "volume_down": 0xAE, "mute": 0xAD, "next_track": 0xB0,
        "prev_track": 0xB1, "media_stop": 0xB2, "play_pause": 0xB3,
    })
    return vk


VK = _build_vk()
EXTENDED_VK = {0xA3, 0xA5, 0x5B, 0x5C, 0x5D, 0x26, 0x28, 0x25, 0x27, 0x2D, 0x2E, 0x24, 0x23,
               0x21, 0x22, 0x2C, 0x90, 0x6F}
MEDIA_VK = {0xAF, 0xAE, 0xAD, 0xB0, 0xB1, 0xB2, 0xB3}


class KeyMouseOut:
    def __init__(self, warn=print):
        self.warn = warn
        self.ok = IS_WINDOWS
        self.down = []          # VKs currently held, in press order
        self.prev_combos = []   # combo strings held last frame, in order
        self.prev_mouse = set()
        if not self.ok:
            return
        from ctypes import wintypes

        class KEYBDINPUT(ctypes.Structure):
            _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                        ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_size_t)]

        class MOUSEINPUT(ctypes.Structure):
            _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                        ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
                        ("dwExtraInfo", ctypes.c_size_t)]

        class HARDWAREINPUT(ctypes.Structure):
            _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD), ("wParamH", wintypes.WORD)]

        class _U(ctypes.Union):
            _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]

        class INPUT(ctypes.Structure):
            _fields_ = [("type", wintypes.DWORD), ("u", _U)]

        self.INPUT = INPUT
        self.user32 = ctypes.WinDLL("user32", use_last_error=True)
        self.user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
        self.user32.SendInput.restype = wintypes.UINT
        self.user32.MapVirtualKeyW.argtypes = [wintypes.UINT, wintypes.UINT]
        self.user32.MapVirtualKeyW.restype = wintypes.UINT

    def _send(self, inp):
        self.user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(self.INPUT))

    def _key(self, vk, up):
        inp = self.INPUT()
        inp.type = 1  # INPUT_KEYBOARD
        if vk in MEDIA_VK:
            inp.u.ki.wVk = vk
            inp.u.ki.dwFlags = 0x0002 if up else 0
        else:
            inp.u.ki.wScan = 0x37 if vk == 0x2C else self.user32.MapVirtualKeyW(vk, 0)  # Print Screen = E0 37
            flags = 0x0008  # KEYEVENTF_SCANCODE
            if vk in EXTENDED_VK:
                flags |= 0x0001
            if up:
                flags |= 0x0002
            inp.u.ki.dwFlags = flags
        self._send(inp)

    def _mouse(self, flags, data=0, dx=0, dy=0):
        inp = self.INPUT()
        inp.type = 0  # INPUT_MOUSE
        inp.u.mi.dx, inp.u.mi.dy = dx, dy
        inp.u.mi.mouseData = data & 0xFFFFFFFF
        inp.u.mi.dwFlags = flags
        self._send(inp)

    def _parse(self, combo):
        vks = []
        for part in combo.split("+"):
            part = part.strip()
            if not part:
                continue
            v = VK.get(part)
            if v is None:
                self.warn(f"  [warning] unknown key '{part}' in 'key:{combo}'")
            else:
                vks.append(v)
        return vks

    MOUSE_FLAGS = {"left": (0x0002, 0x0004, 0), "right": (0x0008, 0x0010, 0),
                   "middle": (0x0020, 0x0040, 0), "x1": (0x0080, 0x0100, 1), "x2": (0x0080, 0x0100, 2)}
    WHEEL = {"wheel_up": (0x0800, 120), "wheel_down": (0x0800, -120),
             "wheel_right": (0x1000, 120), "wheel_left": (0x1000, -120)}

    def apply(self, out):
        if not self.ok:
            return
        # keys (with combo ordering: modifiers first as written, release in reverse)
        keys = out.keys
        combos = [c for c in self.prev_combos if c in keys] + sorted(k for k in keys if k not in self.prev_combos)
        self.prev_combos = combos
        want = []
        for c in combos:
            for v in self._parse(c):
                if v not in want:
                    want.append(v)
        for v in reversed(self.down):
            if v not in want:
                self._key(v, True)
        self.down = [v for v in self.down if v in want]
        for v in want:
            if v not in self.down:
                self._key(v, False)
                self.down.append(v)
        # mouse buttons / wheel
        m = out.mouse
        for b in m - self.prev_mouse:
            if b in self.MOUSE_FLAGS:
                dn, _, data = self.MOUSE_FLAGS[b]
                self._mouse(dn, data)
            elif b in self.WHEEL:
                fl, data = self.WHEEL[b]
                self._mouse(fl, data)
        for b in self.prev_mouse - m:
            if b in self.MOUSE_FLAGS:
                _, upf, data = self.MOUSE_FLAGS[b]
                self._mouse(upf, data)
        self.prev_mouse = set(m)
        if out.mouse_dx or out.mouse_dy:
            self._mouse(0x0001, 0, out.mouse_dx, out.mouse_dy)

    def release_all(self):
        if self.ok:
            self.apply(Output())


# --------------------------------------------------------------------------------------
# Foreground app detection (for auto_profiles)
# --------------------------------------------------------------------------------------
class ForegroundWatcher:
    def __init__(self):
        self.ok = IS_WINDOWS
        self.own = False
        if not self.ok:
            return
        from ctypes import wintypes
        self.u = ctypes.WinDLL("user32", use_last_error=True)
        self.k = ctypes.WinDLL("kernel32", use_last_error=True)
        self.u.GetForegroundWindow.restype = wintypes.HWND
        self.u.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
        self.k.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        self.k.OpenProcess.restype = wintypes.HANDLE
        self.k.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD,
                                                      wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
        self.k.CloseHandle.argtypes = [wintypes.HANDLE]
        self.wt = wintypes
        self.own = False  # True while one of Clutch's own windows is in front

    def refresh_own(self):
        """Cheap check (no process lookup) for whether a Clutch window is in front. Called ~50x a second
        so controller navigation and the key/mouse mute switch over together."""
        if not self.ok:
            return False
        try:
            hwnd = self.u.GetForegroundWindow()
            if hwnd != getattr(self, "_own_hwnd", None):
                self._own_hwnd = hwnd
                pid = self.wt.DWORD()
                if hwnd:
                    self.u.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                self.own = bool(hwnd) and pid.value == os.getpid()
        except Exception:
            self.own = False
        return self.own

    def exe(self):
        if not self.ok:
            return ""
        try:
            hwnd = self.u.GetForegroundWindow()
            if not hwnd:
                self.own = False
                return ""
            pid = self.wt.DWORD()
            self.u.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            self.own = pid.value == os.getpid()
            h = self.k.OpenProcess(0x1000, False, pid.value)  # PROCESS_QUERY_LIMITED_INFORMATION
            if not h:
                return ""
            try:
                buf = ctypes.create_unicode_buffer(1024)
                size = self.wt.DWORD(1024)
                if self.k.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
                    return os.path.basename(buf.value).lower()
            finally:
                self.k.CloseHandle(h)
        except Exception:
            pass
        return ""


class AutoProfiles:
    def __init__(self):
        self.watch = ForegroundWatcher()
        self.last_exe = None
        self.auto_on = False
        self.before = None
        self.recent = []  # recently focused programs, shown in the control panel

    def check(self, engine):
        if not self.watch.ok:
            return
        exe = self.watch.exe()
        if exe == self.last_exe or not exe:
            return
        self.last_exe = exe
        if exe in self.recent:
            self.recent.remove(exe)
        self.recent.insert(0, exe)
        del self.recent[12:]
        rules = {str(k).lower(): v for k, v in (engine.cfg.get("auto_profiles") or {}).items()}
        if not rules:
            return
        target = rules.get(exe)
        if target and target in engine.profile_names:
            if not self.auto_on:
                self.before = engine.active
            self.auto_on = True
            if engine.active != target:
                engine.set_profile(target)
        elif self.auto_on:
            self.auto_on = False
            if self.before in engine.profile_names and engine.active != self.before:
                engine.set_profile(self.before)


# --------------------------------------------------------------------------------------
# Paths (script mode vs installed app) and Windows helpers
# --------------------------------------------------------------------------------------
FROZEN = bool(getattr(sys, "frozen", False))
RESOURCE_DIR = getattr(sys, "_MEIPASS", SCRIPT_DIR)
DATA_DIR = (os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), APP_NAME)
            if FROZEN else SCRIPT_DIR)


def resource(*parts):
    return os.path.join(RESOURCE_DIR, *parts)


def default_config_path():
    os.makedirs(DATA_DIR, exist_ok=True)
    return os.path.join(DATA_DIR, "config.jsonc")


def set_dpi_aware():
    """So the crosshair lands on the true screen center on scaled (125%/150%) displays."""
    if not IS_WINDOWS:
        return
    try:
        if ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4)):
            return
    except Exception:
        pass
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def svc_exists(name):
    if not IS_WINDOWS:
        return None
    import winreg
    try:
        winreg.CloseKey(winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Services" + "\\" + name))
        return True
    except OSError:
        return False


def find_hidhide(exe):
    base = os.environ.get("ProgramFiles", r"C:\Program Files")
    for p in (os.path.join(base, "Nefarius Software Solutions", "HidHide", exe),
              os.path.join(base, "Nefarius Software Solutions", "HidHide", "x64", exe)):
        if os.path.exists(p):
            return p
    return None


# --------------------------------------------------------------------------------------
# One-click HidHide: install it, let Clutch through, hide only the real controller
# --------------------------------------------------------------------------------------
def guid_vid_pid(guid):
    """SDL joystick GUID (32 hex chars) -> (vendor id, product id), or None."""
    try:
        b = bytes.fromhex(str(guid or ""))
    except ValueError:
        return None
    if len(b) != 16:
        return None
    vid, pid = b[4] | (b[5] << 8), b[8] | (b[9] << 8)
    return (vid, pid) if vid else None


def hidhide_hiding(cli, vid=None, pid=None, run=None):
    """Is HidHide actually hiding this controller from games? Returns (state, reason):
    True = hidden, False = games can see it (reason says why), None = couldn't tell (never warn on a guess)."""
    import subprocess
    run = run or (lambda args: subprocess.run([cli] + args, capture_output=True, text=True, timeout=5,
                                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)))
    try:
        r = run(["--cloak-state"])
        txt = ((r.stdout or "") + " " + (r.stderr or "")).lower()
        if r.returncode == 0 and txt.strip():
            if any(w in txt for w in ("off", "false", "inactive", "disabled")):
                return False, "cloak_off"
    except Exception:
        return None, None
    if not vid:
        return None, None
    try:
        r = run(["--dev-list"])
        if r.returncode != 0:
            return None, None
        txt = (r.stdout or "").lower().replace("\\\\", "\\")
    except Exception:
        return None, None
    # USB: "VID_054C&PID_0CE6". Bluetooth: "_VID&0002054c_PID&0ce6" (a 4-digit source prefix before the id).
    pat = re.compile(rf"vid[_&](?:[0-9a-f]{{4}})?{vid:04x}[&_]pid[_&]{pid:04x}")
    return (True, None) if pat.search(txt) else (False, "not_hidden")


def hidhide_targets(cli_json, vid, pid):
    """From `HidHideCLI --dev-gaming` output, the device paths of the real controller with this vendor/product id.
    Virtual controllers (ViGEm, software devices) are never returned, so games keep seeing Clutch's."""
    try:
        data = json.loads(cli_json) if isinstance(cli_json, str) else cli_json
    except ValueError:
        return []
    found = []

    def walk(o, name=None):
        if isinstance(o, dict):
            name = o.get("friendlyName") or name
            if o.get("deviceInstancePath"):
                found.append((o, name))
            for v in o.values():
                walk(v, name)
        elif isinstance(o, list):
            for v in o:
                walk(v, name)
    walk(data)
    rx = re.compile(r"VID[_&](?:0002|0001)?%04X[_&]PID[_&]%04X" % (vid, pid), re.I)
    out, seen = [], set()
    for dev, name in found:
        paths = " ".join(str(dev.get(k) or "") for k in ("deviceInstancePath", "baseContainerDeviceInstancePath", "symbolicLink"))
        if re.search(r"ROOT\\|VIGEM|^SWD\\|\\SWD\\", paths, re.I):
            continue  # a virtual device, possibly Clutch's own
        if not rx.search(paths):
            continue
        p = dev["deviceInstancePath"]
        if p not in seen:
            seen.add(p)
            out.append((p, dev.get("product") or dev.get("description") or name or "Controller"))
    return out


def hidhide_setup_job(job_path):
    """Runs elevated (one Windows prompt): install HidHide if needed, allow Clutch, hide the real controller."""
    import subprocess
    res = {"ok": False, "hidden": [], "restart": False}
    nowin = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        with open(job_path, "r", encoding="utf-8") as f:
            job = json.load(f)
        inst = job.get("installer")
        if inst and not find_hidhide("HidHideCLI.exe"):
            # The job file lives in the user's temp folder, so check again here with admin rights: copy the installer
            # somewhere a normal user can't change it, and only run it if it's still signed by HidHide's maker.
            import shutil, tempfile
            safe_root = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "Temp")
            safe = os.path.join(tempfile.mkdtemp(prefix="clutch-hh-", dir=safe_root if os.path.isdir(safe_root) else None),
                                "HidHide-Setup.exe")
            shutil.copyfile(inst, safe)
            status, _, subject = _signer(safe, subject=True)
            if status != "Valid" or "nefarius" not in (subject or "").lower():
                raise RuntimeError("The HidHide installer isn't signed by its maker, so Clutch didn't run it.")
            inst = safe
            r = subprocess.run([inst, "/quiet", "/norestart"], timeout=900)
            res["restart"] = r.returncode in (1641, 3010)
            if r.returncode not in (0, 1641, 3010):
                raise RuntimeError(f"The HidHide installer stopped (code {r.returncode}).")
        cli = find_hidhide("HidHideCLI.exe")
        if not cli:
            raise RuntimeError("HidHide didn't install. Try the manual download.")

        def run(args):
            return subprocess.run([cli] + args, capture_output=True, text=True, timeout=60, creationflags=nowin)
        for app in job.get("apps") or []:
            run(["--app-reg", app])
        if job.get("vid"):
            for path, name in hidhide_targets(run(["--dev-gaming"]).stdout, int(job["vid"]), int(job["pid"])):
                if run(["--dev-hide", path]).returncode == 0:
                    res["hidden"].append(name)
        if job.get("undo"):
            run(["--cloak-off"])
        else:
            run(["--cloak-on"])
        res["ok"] = True
    except Exception as e:
        res["error"] = str(e)[:300]
    # Write INTO the file Clutch made beforehand, so it keeps Clutch as its owner. A file this admin process
    # creates itself would be owned by Administrators, and the normal Clutch couldn't read it (Errno 13).
    out = job_path + ".result"
    with open(out, "r+" if os.path.exists(out) else "w", encoding="utf-8") as f:
        f.seek(0); f.write(json.dumps(res)); f.truncate()
    return res


def latest_hidhide_installer(folder):
    """Downloads the newest official HidHide installer and checks it's signed by Nefarius."""
    import urllib.request
    req = urllib.request.Request("https://api.github.com/repos/nefarius/HidHide/releases/latest",
                                 headers={"Accept": "application/vnd.github+json", "User-Agent": f"{APP_NAME}-setup"})
    with urllib.request.urlopen(req, timeout=15) as r:
        rel = json.loads(r.read(400_000).decode("utf-8", "replace"))
    asset = next((a for a in rel.get("assets") or [] if str(a.get("name", "")).lower().endswith(".exe")
                  and "x64" in str(a.get("name", "")).lower()), None) or \
        next((a for a in rel.get("assets") or [] if str(a.get("name", "")).lower().endswith(".exe")), None)
    url = (asset or {}).get("browser_download_url") or ""
    if not url.startswith("https://github.com/nefarius/HidHide/"):
        raise ValueError("Couldn't find the HidHide installer on GitHub.")
    path = os.path.join(folder, "HidHide-Setup.exe")
    req = urllib.request.Request(url, headers={"User-Agent": f"{APP_NAME}-setup"})
    with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
        while True:
            chunk = r.read(256 * 1024)
            if not chunk:
                break
            f.write(chunk)
            if f.tell() > 100 * 1024 * 1024:
                raise ValueError("The HidHide download is much bigger than expected.")
    status, _, subject = _signer(path, subject=True)
    if status != "Valid" or "nefarius" not in (subject or "").lower():
        os.remove(path)
        raise ValueError("The HidHide download isn't signed by its maker, so Clutch didn't run it.")
    return path


def find_vigem_msi():
    rel = ("vgamepad", "win", "vigem", "install", "x64", "ViGEmBusSetup_x64.msi")
    cands = [resource(*rel)]
    try:
        import importlib.util
        spec = importlib.util.find_spec("vgamepad")
        if spec and spec.submodule_search_locations:
            cands.append(os.path.join(list(spec.submodule_search_locations)[0], *rel[1:]))
    except Exception:
        pass
    return next((c for c in cands if os.path.exists(c)), None)


def app_exe_paths():
    """The program(s) HidHide must allow to see the real controller."""
    if FROZEN:
        return [sys.executable]
    exe = sys.executable
    paths = [exe]
    w = os.path.join(os.path.dirname(exe), "pythonw.exe")
    if os.path.exists(w):
        paths.append(w)
    return paths


AUTOSTART_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"


def autostart_command():
    if FROZEN:
        return f'"{sys.executable}" --background'
    w = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    py = w if os.path.exists(w) else sys.executable
    return f'"{py}" "{os.path.join(SCRIPT_DIR, "app.py")}" --background'


def get_autostart():
    if not IS_WINDOWS:
        return None
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, AUTOSTART_KEY) as k:
            winreg.QueryValueEx(k, APP_NAME)
            return True
    except OSError:
        return False


def set_autostart(on):
    if not IS_WINDOWS:
        return False
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, AUTOSTART_KEY, 0, winreg.KEY_SET_VALUE) as k:
        if on:
            winreg.SetValueEx(k, APP_NAME, 0, winreg.REG_SZ, autostart_command())
        else:
            try:
                winreg.DeleteValue(k, APP_NAME)
            except OSError:
                pass
    return True


def parse_version(v):
    """'v10.2.1' -> (10, 2, 1); '10.0' and '10.0.0' are the same. Pre-releases ('10.1-beta') -> None."""
    v = str(v or "").strip().lstrip("vV")
    if "-" in v or "+" in v:
        return None
    nums = [int(n) for n in re.findall(r"\d+", v)[:4]] or [0]
    return tuple((nums + [0, 0, 0])[:max(3, len(nums))])


def check_github_release(repo, timeout=8.0):
    """Latest release of owner/name on GitHub: {latest, newer, page, download, notes, sha256}."""
    import urllib.request
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo or ""):
        raise ValueError("The update source should look like owner/repo.")
    req = urllib.request.Request(f"https://api.github.com/repos/{repo}/releases/latest",
                                 headers={"Accept": "application/vnd.github+json", "User-Agent": f"{APP_NAME}-updater"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read(400_000).decode("utf-8", "replace"))
    tag = data.get("tag_name") or data.get("name") or ""
    asset = next((a for a in data.get("assets") or [] if str(a.get("name", "")).lower().endswith(".exe")), None)
    digest = str((asset or {}).get("digest") or "")
    tv = parse_version(tag)
    return {"latest": tag.lstrip("vV"), "newer": tv is not None and tv > parse_version(VERSION),
            "page": data.get("html_url"), "download": asset.get("browser_download_url") if asset else None,
            "size": asset.get("size") if asset else None, "notes": str(data.get("body") or "")[:1200],
            "sha256": digest[7:] if digest.startswith("sha256:") else None}


def _signer(path, subject=False):
    """(status, thumbprint[, subject]) of a file's Authenticode signature, via PowerShell."""
    import subprocess
    ps = ("$s = Get-AuthenticodeSignature -LiteralPath $env:CLUTCH_SIGCHECK; "
          "Write-Output $s.Status; if ($s.SignerCertificate) { Write-Output $s.SignerCertificate.Thumbprint; "
          "Write-Output $s.SignerCertificate.Subject }")
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], capture_output=True, text=True,
                           timeout=30, env=dict(os.environ, CLUTCH_SIGCHECK=path),
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        lines = [x.strip() for x in r.stdout.splitlines() if x.strip()]
        out = ((lines[0] if lines else "Unknown"), (lines[1] if len(lines) > 1 else None))
        return out + ((lines[2] if len(lines) > 2 else ""),) if subject else out
    except Exception:
        return ("Unknown", None, "") if subject else ("Unknown", None)


def same_signer(installer):
    """If this Clutch is code-signed, an update must be signed by the same certificate. Unsigned builds skip this."""
    if not FROZEN:
        return True
    status, mine = _signer(sys.executable)
    if status != "Valid" or not mine:
        return True
    status2, theirs = _signer(installer)
    return status2 == "Valid" and theirs == mine


def fullscreen_game_running():
    """True when a game is in exclusive full screen (overlays like the crosshair can't draw over it)."""
    if not IS_WINDOWS:
        return False
    try:
        st = ctypes.c_int(0)
        if ctypes.windll.shell32.SHQueryUserNotificationState(ctypes.byref(st)) == 0:
            return st.value == 3  # QUNS_RUNNING_D3D_FULL_SCREEN
    except Exception:
        pass
    return False


def desktop_dir():
    if IS_WINDOWS:
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as k:
                p = os.path.expandvars(winreg.QueryValueEx(k, "Desktop")[0])
                if p and os.path.isdir(p):
                    return p
        except OSError:
            pass
    p = os.path.join(os.path.expanduser("~"), "Desktop")
    return p if os.path.isdir(p) else documents_dir()


def documents_dir():
    """The user's Documents folder (follows OneDrive / moved folders on Windows)."""
    if IS_WINDOWS:
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as k:
                p = os.path.expandvars(winreg.QueryValueEx(k, "Personal")[0])
                if p and os.path.isdir(p):
                    return p
        except OSError:
            pass
    p = os.path.join(os.path.expanduser("~"), "Documents")
    return p if os.path.isdir(p) else os.path.expanduser("~")


def steam_running():
    if not IS_WINDOWS:
        return None
    try:
        import subprocess
        r = subprocess.run(["tasklist", "/FI", "IMAGENAME eq steam.exe", "/NH"], capture_output=True, text=True,
                           timeout=4, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return "steam.exe" in (r.stdout or "").lower()
    except Exception:
        return None


# --------------------------------------------------------------------------------------
# Game finder: looks through Steam, Epic, GOG, the Xbox app, Minecraft and Roblox
# --------------------------------------------------------------------------------------
GAME_PACK_RULES = [  # (pack id, regex on the lower-case game name); specific packs first
    ("rocket", r"rocket league"),
    ("fortnite", r"^fortnite"),
    ("apex", r"apex legends"),
    ("cod", r"call of duty"),
    ("halo", r"\bhalo\b"),
    ("forza", r"forza"),
    ("overwatch", r"overwatch"), ("rivals", r"marvel rivals"), ("destiny", r"destiny 2"), ("finals", r"^the finals"),
    ("siege", r"rainbow six"), ("battlefield", r"battlefield"), ("pubg", r"pubg|playerunknown"), ("helldivers", r"helldivers"),
    ("warframe", r"^warframe"), ("borderlands", r"borderlands"), ("drg", r"deep rock galactic"),
    ("gta", r"grand theft auto|\bgta\b"), ("rdr2", r"red dead redemption"), ("eldenring", r"elden ring"),
    ("hogwarts", r"hogwarts legacy"), ("cyberpunk", r"cyberpunk"), ("spiderman", r"spider-man|spiderman"),
    ("seaofthieves", r"sea of thieves"), ("terraria", r"^terraria"), ("stardew", r"stardew"), ("palworld", r"palworld"),
    ("nms", r"no man.s sky"), ("fc", r"ea sports fc|\bfifa\b"), ("nba2k", r"nba 2k"), ("madden", r"madden"),
    ("f1", r"\bf1\b"), ("nfs", r"need for speed"), ("fallguys", r"fall guys"), ("sf6", r"street fighter"),
    ("mk", r"mortal kombat"), ("tekken", r"tekken"), ("brawlhalla", r"brawlhalla"), ("amongus", r"among us"),
    ("hollowknight", r"hollow knight"), ("celeste", r"^celeste"),
    ("shooter", r"call of duty|apex legends|\bhalo\b|destiny 2|overwatch|counter-strike|battlefield|the finals|"
                r"marvel rivals|borderlands|team fortress|splitgate|titanfall|\bdoom\b|far cry|rainbow six|warframe|"
                r"paladins|deep rock galactic|helldivers|left 4 dead|payday|xdefiant|delta force|gears|"
                r"star wars battlefront|metro exodus|bioshock|sniper elite|crysis|\bprey\b"),
    ("racing", r"forza|\bf1\b|need for speed|assetto corsa|beamng|trackmania|\bdirt\b|\bwrc\b|the crew|\bgrid\b|"
               r"hot wheels|wreckfest|snowrunner|art of rally|horizon chase"),
]
GAME_SKIP = re.compile(r"redistributable|steamworks|proton|runtime|steamvr|dedicated server|soundtrack|\bsdk\b|"
                       r"\btool(s|kit)?\b|wallpaper engine|benchmark|unreal engine|demo$|playtest", re.I)
EXE_SKIP = re.compile(r"crash|unins|setup|redist|dxsetup|launcher|helper|report|install|easyanticheat|eac|battleye|"
                      r"update|prereq|dotnet|cefprocess|webhelper|uploader|diag|config|vrmonitor|7z|python|java\b|"
                      r"cleanup|bugsplat|quicksfv|overlay|activation|register|unitycrash", re.I)
KNOWN_EXES = {  # exact process names for games that don't follow the folder name (first = most likely)
    "rocket league": "rocketleague.exe", "fortnite": "fortniteclient-win64-shipping.exe",
    "apex legends": ("r5apex_dx12.exe", "r5apex.exe"), "counter-strike 2": "cs2.exe", "destiny 2": "destiny2.exe",
    "team fortress 2": "tf_win64.exe", "halo infinite": "haloinfinite.exe", "overwatch": "overwatch.exe",
    "marvel rivals": "marvel-win64-shipping.exe", "the finals": "discovery.exe",
    "halo: the master chief collection": "mcc-win64-shipping.exe", "forza horizon 5": "forzahorizon5.exe",
    "forza horizon 4": "forzahorizon4.exe", "beamng.drive": "beamng.drive.x64.exe",
}


def clean_name(name):
    return re.sub(r"\s+", " ", re.sub(r"[®™©]", "", name or "")).strip()


def known_exes(name):
    v = KNOWN_EXES.get(clean_name(name).lower())
    return list(v) if isinstance(v, tuple) else ([v] if v else [])


def game_pack(name):
    n = (name or "").lower()
    if "minecraft" in n:
        return "minecraft" if "java" in n else "bedrock"
    if "roblox" in n:
        return "roblox"
    for pack, rx in GAME_PACK_RULES:
        if re.search(rx, n):
            return pack
    return None


def _read_text(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def guess_game_exe(folder, name="", max_entries=2500):
    """Best guess at the program a game runs as (the name Windows shows in Task Manager), by looking
    at the .exe files in its folder. Returns (exe, other_likely_exes)."""
    known = known_exes(name)
    found, seen, hits = [], 0, []
    todo = collections.deque([(folder, 0)])
    while todo and seen < max_entries:  # breadth-first, so a huge data folder can't use up the budget
        d, depth = todo.popleft()
        try:
            entries = list(os.scandir(d))
        except OSError:
            continue
        for e in entries:
            seen += 1
            try:
                if e.is_dir(follow_symlinks=False):
                    if depth < 4 and not e.name.startswith((".", "_")) and e.name.lower() not in (
                            "redist", "redistributables", "_commonredist", "directx", "vcredist", "support",
                            "easyanticheat", "battleye", "prereqs", "engine", "localization", "movies", "content",
                            "paks", "data", "assets", "streamingassets", "shadercache", "logs", "saves"):
                        todo.append((e.path, depth + 1))
                elif e.name.lower().endswith(".exe"):
                    low = e.name.lower()
                    if low in known:
                        hits.append(low)
                    elif not EXE_SKIP.search(low[:-4]):
                        found.append((low, e.stat().st_size, depth))
            except OSError:
                continue
    if hits:
        hits.sort(key=known.index)
        return hits[0], hits[1:]
    if known:
        return known[0], known[1:]
    if not found:
        return None, []
    key = re.sub(r"[^a-z0-9]", "", clean_name(name or os.path.basename(folder)).lower())

    def score(f):
        stem = re.sub(r"[^a-z0-9]", "", f[0][:-4])
        shipping = 1 if f[0].endswith("-shipping.exe") else 0  # Unreal: the real game, not the small starter
        alike = 1 if stem and key and (stem in key or key in stem) else 0
        return (shipping, alike, f[1] / 1e9 - f[2] * 0.05)
    return max(found, key=score)[0], []


def _steam_root():
    if IS_WINDOWS:
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as k:
                p = winreg.QueryValueEx(k, "SteamPath")[0]
                if p and os.path.isdir(p):
                    return os.path.normpath(p)
        except OSError:
            pass
        for p in (r"C:\Program Files (x86)\Steam", r"C:\Program Files\Steam"):
            if os.path.isdir(p):
                return p
        return None
    p = os.path.expanduser("~/.local/share/Steam")
    return p if os.path.isdir(p) else None


def _steam_art(root, appid):
    lc = os.path.join(root, "appcache", "librarycache")
    for cand in (os.path.join(lc, f"{appid}_header.jpg"), os.path.join(lc, appid, "header.jpg")):
        if os.path.isfile(cand):
            return cand
    sub = os.path.join(lc, appid)
    if os.path.isdir(sub):  # newer Steam keeps art in hashed sub-folders
        found = {}
        for dp, _, files in os.walk(sub):
            for fn in files:
                found.setdefault(fn.lower(), os.path.join(dp, fn))
        for want in ("header.jpg", "library_hero.jpg", "library_600x900.jpg", "library_capsule.jpg"):
            if want in found:
                return found[want]
    return None


def _fixed_drives():
    if not IS_WINDOWS:
        return []
    try:
        k32 = ctypes.windll.kernel32
        mask = k32.GetLogicalDrives()
        return [f"{chr(65 + i)}:\\" for i in range(26)
                if mask & (1 << i) and k32.GetDriveTypeW(f"{chr(65 + i)}:\\") == 3]  # DRIVE_FIXED
    except Exception:
        return ["C:\\"]


def find_games(roots=None, log=None):
    """Returns a list of installed games: {id, name, source, pack, exe, alt_exes, art}. `roots` overrides
    the standard locations (used by the tests). One broken launcher never hides the others."""
    roots = dict(roots or {})
    env = os.environ
    games, seen = [], set()

    def addg(gid, name, source, folder=None, exe=None, art=None):
        name = clean_name(name)
        if not name or GAME_SKIP.search(name):
            return
        k = name.lower()
        if k in seen:
            return
        seen.add(k)
        alts = []
        if folder and os.path.isdir(folder) and (exe is None or known_exes(name)):
            guess, alts = guess_game_exe(folder, name)
            exe = guess or exe
        games.append({"id": gid, "name": name, "source": source, "pack": game_pack(name),
                      "exe": (os.path.basename(exe).lower() if exe else None),
                      "alt_exes": [a for a in alts if a != exe], "art": art})

    def steam():
        root = roots.get("steam", _steam_root())
        if not (root and os.path.isdir(root)):
            return
        libs = [os.path.join(root, "steamapps")]
        vdf = _read_text(os.path.join(root, "steamapps", "libraryfolders.vdf"))
        for m in re.finditer(r'"path"\s+"([^"]+)"', vdf):
            lib = os.path.join(m.group(1).replace("\\\\", "\\"), "steamapps")
            if os.path.normcase(os.path.normpath(lib)) not in [os.path.normcase(os.path.normpath(x)) for x in libs]:
                libs.append(lib)
        for lib in libs:
            try:
                names = sorted(os.listdir(lib))
            except OSError:
                continue
            for fn in names:
                if not (fn.startswith("appmanifest_") and fn.endswith(".acf")):
                    continue
                acf = dict(re.findall(r'"(appid|name|installdir)"\s+"([^"]*)"', _read_text(os.path.join(lib, fn))))
                appid = acf.get("appid") or fn[12:-4]
                if appid in ("228980", "250820", "1070560", "1391110", "1628350") or not acf.get("installdir"):
                    continue  # redistributables, SteamVR, runtimes, or a half-written manifest
                addg(f"steam:{appid}", acf.get("name"), "Steam", os.path.join(lib, "common", acf["installdir"]),
                     art=_steam_art(root, appid))

    def epic():
        d = roots.get("epic", os.path.join(env.get("PROGRAMDATA", r"C:\ProgramData"),
                                           "Epic", "EpicGamesLauncher", "Data", "Manifests"))
        if not (d and os.path.isdir(d)):
            return
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".item"):
                continue
            try:
                with open(os.path.join(d, fn), "r", encoding="utf-8-sig", errors="replace") as f:
                    it = json.load(f)
            except (OSError, ValueError):
                continue
            if not isinstance(it, dict) or it.get("bIsIncompleteInstall") or (
                    it.get("MainGameAppName") and it.get("MainGameAppName") != it.get("AppName")):
                continue
            cats = [str(c).lower() for c in it.get("AppCategories") or []]
            if cats and "games" not in cats:
                continue
            folder = it.get("InstallLocation")
            launch = it.get("LaunchExecutable")
            exe = None
            if launch and folder:  # trust Epic's exe unless it's a small starter next to a real game
                full = os.path.join(folder, launch)
                try:
                    if os.path.getsize(full) > 1_500_000 or os.path.dirname(launch.replace("/", "\\")):
                        exe = os.path.basename(launch)
                except OSError:
                    exe = os.path.basename(launch)
            addg(f"epic:{it.get('AppName')}", it.get("DisplayName"), "Epic Games", folder, exe=exe)

    def gog():
        if not IS_WINDOWS or "gog" in roots:
            return
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\GOG.com\Games") as k:
            for i in range(winreg.QueryInfoKey(k)[0]):
                try:
                    sub = winreg.EnumKey(k, i)
                    with winreg.OpenKey(k, sub) as g:
                        val = lambda n: winreg.QueryValueEx(g, n)[0]
                        addg("gog:" + sub, val("gameName"), "GOG", val("path"), exe=val("exe"))
                except OSError:
                    continue

    def xbox():
        bases = [roots["xbox"]] if "xbox" in roots else [os.path.join(dr, "XboxGames") for dr in _fixed_drives()]
        for base in bases:
            if not (base and os.path.isdir(base)):
                continue
            try:
                names = sorted(os.listdir(base))
            except OSError:
                continue
            for d in names:
                content = os.path.join(base, d, "Content")
                if d.lower() != "gamesave" and os.path.isdir(content):
                    addg(f"xbox:{d}", d.replace("-", " "), "Xbox app", content)

    def mc_roblox():
        appdata = roots.get("appdata", env.get("APPDATA"))
        if appdata and os.path.isdir(os.path.join(appdata, ".minecraft")):
            addg("minecraft", "Minecraft: Java Edition", "Minecraft Launcher", exe="javaw.exe")
        local = roots.get("localappdata", env.get("LOCALAPPDATA"))
        for base in [os.path.join(local, "Roblox", "Versions") if local else None,
                     roots.get("roblox_pf", r"C:\Program Files (x86)\Roblox\Versions" if IS_WINDOWS else None)]:
            try:
                if base and os.path.isdir(base) and any(
                        os.path.isfile(os.path.join(base, v, "RobloxPlayerBeta.exe")) for v in os.listdir(base)):
                    addg("roblox", "Roblox", "Roblox", exe="robloxplayerbeta.exe")
                    break
            except OSError:
                continue

    for name, fn in (("Steam", steam), ("Epic Games", epic), ("GOG", gog), ("Xbox app", xbox),
                     ("Minecraft/Roblox", mc_roblox)):
        try:
            fn()
        except Exception as e:  # keep going: one odd launcher shouldn't hide the rest
            if log:
                log(f"Game finder: skipped {name} ({e})")

    order = {"minecraft": 0, "roblox": 0, "fortnite": 0, "rocket": 0, "shooter": 1, "racing": 1}
    games.sort(key=lambda g: (order.get(g["pack"], 2), g["name"].lower()))
    return games


def shell_open(target, params=None, elevate=False, hidden=False):
    """ShellExecute: open a file/URL, or run a program (optionally as admin, which shows a UAC prompt)."""
    if not IS_WINDOWS:
        webbrowser.open(target)
        return True
    r = ctypes.windll.shell32.ShellExecuteW(None, "runas" if elevate else "open", target, params, None,
                                            0 if hidden else 1)
    return r > 32


# --------------------------------------------------------------------------------------
# Crosshair overlay
# --------------------------------------------------------------------------------------
CROSSHAIR_DEFAULTS = {
    "enabled": False, "style": "cross", "color": "#3ee6ff", "size": 10, "thickness": 2, "gap": 4,
    "dot": False, "dot_size": 2, "outline": True, "outline_color": "#000000", "outline_width": 1,
    "opacity": 1.0, "show": "always", "offset_x": 0, "offset_y": 0,
}
CROSSHAIR_STYLES = ("cross", "dot", "circle", "t", "x", "chevron", "square")


def crosshair_settings(cfg):
    c = dict(CROSSHAIR_DEFAULTS)
    c.update((cfg or {}).get("crosshair") or {})
    return c


def _hex(c, default=(62, 230, 255)):
    try:
        c = str(c).lstrip("#")
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return default


def render_crosshair(c):
    """Draw the crosshair as an RGBA Pillow image. Center pixel = (half, half). Returns (img, half)."""
    from PIL import Image, ImageDraw
    style = str(c.get("style", "cross")).lower()
    size = int(clamp(num(c.get("size"), 10), 1, 80))
    th = int(clamp(num(c.get("thickness"), 2), 1, 12))
    gap = int(clamp(num(c.get("gap"), 4), 0, 40))
    dot_r = clamp(num(c.get("dot_size"), 2), 1, 12)
    ow = int(clamp(num(c.get("outline_width"), 1), 1, 4)) if c.get("outline") else 0
    color = _hex(c.get("color"))
    ocolor = _hex(c.get("outline_color"), (0, 0, 0))
    S = 4  # supersampling for smooth circles/diagonals
    half = int(size + gap + th + ow + 4)
    W = 2 * half + 1
    img = Image.new("RGBA", (W * S, W * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = half
    pc = (half + 0.5) * S  # pixel-center coordinate in supersampled space

    shapes = []  # (kind, data)
    x0 = cx - (th - 1) // 2
    arms = {
        "up": (x0, cy - gap - size, x0 + th, cy - gap),
        "down": (x0, cy + 1 + gap, x0 + th, cy + 1 + gap + size),
        "left": (cx - gap - size, cy - (th - 1) // 2, cx - gap, cy - (th - 1) // 2 + th),
        "right": (cx + 1 + gap, cy - (th - 1) // 2, cx + 1 + gap + size, cy - (th - 1) // 2 + th),
    }
    if style == "cross":
        shapes += [("rect", arms[k]) for k in ("up", "down", "left", "right")]
    elif style == "t":
        shapes += [("rect", arms[k]) for k in ("down", "left", "right")]
    elif style == "x":
        for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            a, b = gap * 0.7071, (gap + size) * 0.7071
            shapes.append(("line", (sx * a, sy * a, sx * b, sy * b)))
    elif style == "circle":
        shapes.append(("ring", gap + size / 2.0))
    elif style == "chevron":
        shapes.append(("line", (0, gap, -size, gap + size)))
        shapes.append(("line", (0, gap, size, gap + size)))
    elif style == "square":
        r = gap + size / 2.0
        for a, b, e, f in ((-r, -r, r, -r), (r, -r, r, r), (r, r, -r, r), (-r, r, -r, -r)):
            shapes.append(("line", (a, b, e, f)))
    if style == "dot" or c.get("dot"):
        shapes.append(("disc", dot_r if style != "dot" else max(dot_r, th * 0.75)))

    def draw(grow, col):
        for kind, v in shapes:
            if kind == "rect":
                a, b, e, f = v
                d.rectangle([(a - grow) * S, (b - grow) * S, (e + grow) * S - 1, (f + grow) * S - 1], fill=col)
            elif kind == "line":
                a, b, e, f = v
                d.line([(pc + a * S, pc + b * S), (pc + e * S, pc + f * S)], fill=col, width=int((th + 2 * grow) * S))
                for (px, py) in ((a, b), (e, f)):  # rounded caps
                    r = (th / 2.0 + grow) * S
                    d.ellipse([pc + px * S - r, pc + py * S - r, pc + px * S + r, pc + py * S + r], fill=col)
            elif kind == "ring":
                r = v * S
                w = (th + 2 * grow) * S
                d.ellipse([pc - r - w / 2, pc - r - w / 2, pc + r + w / 2, pc + r + w / 2], outline=col, width=int(w))
            elif kind == "disc":
                r = (v + grow) * S
                d.ellipse([pc - r, pc - r, pc + r, pc + r], fill=col)

    if ow:
        draw(ow, ocolor + (255,))
    draw(0, color + (255,))
    img = img.resize((W, W), Image.LANCZOS)
    op = clamp(num(c.get("opacity"), 1.0), 0.05, 1.0)
    if op < 1:
        a = img.getchannel("A").point(lambda v: int(v * op))
        img.putalpha(a)
    return img, half


@functools.lru_cache(maxsize=16)
def _font(size):
    from PIL import ImageFont
    windir = os.environ.get("WINDIR", r"C:\Windows")
    for name in ("bahnschrift.ttf", "segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"):
        for base in (os.path.join(windir, "Fonts"), "/usr/share/fonts/truetype/dejavu"):
            try:
                return ImageFont.truetype(os.path.join(base, name), size)
            except OSError:
                continue
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()


def render_osd(title, sub=None, accent="#3ec6ff"):
    """A rounded pop-up pill shown over games (profile switched, mods off, low battery...)."""
    from PIL import Image, ImageDraw
    ft, fs = _font(30), _font(19)
    tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    tw = tmp.textbbox((0, 0), title, font=ft)[2]
    sw = tmp.textbbox((0, 0), sub, font=fs)[2] if sub else 0
    w = int(max(tw, sw) + 92)
    h = 86 if sub else 64
    img = Image.new("RGBA", (w + 8, h + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([4, 4, w + 3, h + 3], radius=h // 2, fill=(13, 19, 40, 236), outline=_hex(accent) + (255,), width=3)
    cy = 4 + h // 2
    d.ellipse([28, cy - 9, 46, cy + 9], fill=_hex(accent) + (255,))
    if sub:
        d.text((64, 14), title, font=ft, fill=(241, 244, 255, 255))
        d.text((64, 52), sub, font=fs, fill=(170, 182, 214, 255))
    else:
        d.text((64, cy), title, font=ft, fill=(241, 244, 255, 255), anchor="lm")
    return img


def render_menu(rows, sel, accent="#3ec6ff", hint="", title="Quick menu"):
    """The in-game quick menu (hold Guide): a list of profiles and actions, the selected row highlighted."""
    from PIL import Image, ImageDraw
    ft, fr, fh = _font(26), _font(24), _font(17)
    W, RH, VIS = 500, 54, 8
    n = len(rows)
    first = 0 if n <= VIS else int(clamp(sel - VIS // 2, 0, n - VIS))
    shown = rows[first:first + VIS]
    H = 78 + len(shown) * RH + 56
    img = Image.new("RGBA", (W + 8, H + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    acc = _hex(accent)
    d.rounded_rectangle([4, 4, W + 3, H + 3], radius=26, fill=(13, 19, 40, 240), outline=acc + (255,), width=3)
    d.text((32, 24), title, font=ft, fill=(241, 244, 255, 255))
    if first > 0:
        d.text((W - 40, 28), "^", font=ft, fill=(170, 182, 214, 255))
    y = 74
    for i, row in enumerate(shown):
        label, color, current = row[:3]
        idx = first + i
        if len(row) > 3 and row[3] != "profile" and idx > 0 and (len(rows[idx - 1]) < 4 or rows[idx - 1][3] == "profile"):
            d.line([(34, y - 3), (W - 26, y - 3)], fill=(46, 62, 112, 255), width=2)
        if idx == sel:
            d.rounded_rectangle([18, y, W - 12, y + RH - 6], radius=16, fill=acc + (255,))
            txt = (16, 18, 32, 255)
        else:
            txt = (226, 232, 250, 255)
        d.ellipse([35, y + 15, 53, y + 33], fill=_hex(color) + (255,), outline=(16, 18, 32, 255) if idx == sel else None,
                  width=3)
        d.text((68, y + (RH - 6) // 2), label, font=fr, fill=txt, anchor="lm")
        if current:
            d.text((W - 32, y + (RH - 6) // 2), "now", font=fh, fill=txt if idx == sel else (255, 210, 63, 255), anchor="rm")
        y += RH
    if first + VIS < n:
        d.text((W // 2, y - 2), "v", font=fh, fill=(170, 182, 214, 255), anchor="mt")
    d.text((W // 2 + 4, H - 22), hint, font=fh, fill=(170, 182, 214, 255), anchor="mm")
    return img


def menu_hint(pad_name, hold="guide"):
    ps = bool(re.search(r"dualsense|dualshock|playstation|ps[345]", pad_name or "", re.I))
    holdn = {"guide": "PS" if ps else "Guide", "back": "Share" if ps else "Back"}.get(hold, hold.upper())
    return f"Let go of {holdn} to pick  ·  {'Circle' if ps else 'B'} to cancel"


def crosshair_png(c, zoom=1):
    import io
    img, _ = render_crosshair(c)
    if zoom > 1:
        from PIL import Image
        img = img.resize((img.width * zoom, img.height * zoom), Image.NEAREST)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


class CrosshairOverlay:
    """Click-through, always-on-top layered window that draws the crosshair at the screen center."""

    def __init__(self, runner):
        self.runner = runner
        self.stop_evt = threading.Event()
        self.thread = None
        self.error = None

    def start(self):
        if not IS_WINDOWS:
            self.error = "The crosshair overlay only works on Windows."
            return
        self.thread = threading.Thread(target=self._run, name="ClutchCrosshair", daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_evt.set()

    def _run(self):
        try:
            self._loop()
        except Exception as e:  # never take the app down because of the overlay
            self.error = f"Crosshair overlay stopped: {e}"
            self.runner.warn("  [warning] " + self.error)

    def _loop(self):
        from ctypes import wintypes as wt
        user32 = ctypes.WinDLL("user32", use_last_error=True)
        gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        LRESULT = ctypes.c_ssize_t
        WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM)

        class WNDCLASSEXW(ctypes.Structure):
            _fields_ = [("cbSize", wt.UINT), ("style", wt.UINT), ("lpfnWndProc", WNDPROC),
                        ("cbClsExtra", ctypes.c_int), ("cbWndExtra", ctypes.c_int), ("hInstance", wt.HINSTANCE),
                        ("hIcon", wt.HICON), ("hCursor", wt.HANDLE), ("hbrBackground", wt.HBRUSH),
                        ("lpszMenuName", wt.LPCWSTR), ("lpszClassName", wt.LPCWSTR), ("hIconSm", wt.HICON)]

        class BITMAPINFOHEADER(ctypes.Structure):
            _fields_ = [("biSize", wt.DWORD), ("biWidth", wt.LONG), ("biHeight", wt.LONG), ("biPlanes", wt.WORD),
                        ("biBitCount", wt.WORD), ("biCompression", wt.DWORD), ("biSizeImage", wt.DWORD),
                        ("biXPelsPerMeter", wt.LONG), ("biYPelsPerMeter", wt.LONG), ("biClrUsed", wt.DWORD),
                        ("biClrImportant", wt.DWORD)]

        class BLENDFUNCTION(ctypes.Structure):
            _fields_ = [("BlendOp", wt.BYTE), ("BlendFlags", wt.BYTE), ("SourceConstantAlpha", wt.BYTE),
                        ("AlphaFormat", wt.BYTE)]

        user32.DefWindowProcW.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]
        user32.DefWindowProcW.restype = LRESULT
        user32.CreateWindowExW.argtypes = [wt.DWORD, wt.LPCWSTR, wt.LPCWSTR, wt.DWORD, ctypes.c_int, ctypes.c_int,
                                           ctypes.c_int, ctypes.c_int, wt.HWND, wt.HMENU, wt.HINSTANCE, wt.LPVOID]
        user32.CreateWindowExW.restype = wt.HWND
        user32.GetDC.argtypes = [wt.HWND]
        user32.GetDC.restype = wt.HDC
        user32.ReleaseDC.argtypes = [wt.HWND, wt.HDC]
        user32.UpdateLayeredWindow.argtypes = [wt.HWND, wt.HDC, ctypes.POINTER(wt.POINT), ctypes.POINTER(wt.SIZE),
                                               wt.HDC, ctypes.POINTER(wt.POINT), wt.DWORD,
                                               ctypes.POINTER(BLENDFUNCTION), wt.DWORD]
        user32.ShowWindow.argtypes = [wt.HWND, ctypes.c_int]
        user32.SetWindowPos.argtypes = [wt.HWND, wt.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                        wt.UINT]
        user32.PeekMessageW.argtypes = [ctypes.POINTER(wt.MSG), wt.HWND, wt.UINT, wt.UINT, wt.UINT]
        user32.TranslateMessage.argtypes = [ctypes.POINTER(wt.MSG)]
        user32.DispatchMessageW.argtypes = [ctypes.POINTER(wt.MSG)]
        user32.DestroyWindow.argtypes = [wt.HWND]
        gdi32.CreateCompatibleDC.argtypes = [wt.HDC]
        gdi32.CreateCompatibleDC.restype = wt.HDC
        gdi32.CreateDIBSection.argtypes = [wt.HDC, ctypes.c_void_p, wt.UINT, ctypes.POINTER(ctypes.c_void_p),
                                           wt.HANDLE, wt.DWORD]
        gdi32.CreateDIBSection.restype = wt.HBITMAP
        gdi32.SelectObject.argtypes = [wt.HDC, wt.HGDIOBJ]
        gdi32.SelectObject.restype = wt.HGDIOBJ
        gdi32.DeleteObject.argtypes = [wt.HGDIOBJ]
        gdi32.DeleteDC.argtypes = [wt.HDC]
        kernel32.GetModuleHandleW.restype = wt.HMODULE

        def wndproc(h, m, w, l):
            return user32.DefWindowProcW(h, m, w, l)
        self._wndproc = WNDPROC(wndproc)
        hinst = kernel32.GetModuleHandleW(None)
        wc = WNDCLASSEXW()
        wc.cbSize = ctypes.sizeof(WNDCLASSEXW)
        wc.lpfnWndProc = self._wndproc
        wc.hInstance = hinst
        wc.lpszClassName = "ClutchCrosshair"
        user32.RegisterClassExW(ctypes.byref(wc))
        ex = 0x00080000 | 0x00000020 | 0x00000008 | 0x00000080 | 0x08000000  # layered|transparent|topmost|toolwindow|noactivate
        hwnd = user32.CreateWindowExW(ex, "ClutchCrosshair", "Clutch crosshair", 0x80000000, 0, 0, 1, 1,
                                      None, None, hinst, None)
        if not hwnd:
            raise OSError(f"CreateWindowEx failed ({ctypes.get_last_error()})")

        osd_hwnd = user32.CreateWindowExW(ex, "ClutchCrosshair", "Clutch pop-up", 0x80000000, 0, 0, 1, 1,
                                          None, None, hinst, None)

        def push(win, img, x, y, alpha=255):
            from PIL import Image, ImageChops
            r, g, b, a = img.split()
            r, g, b = (ImageChops.multiply(ch, a) for ch in (r, g, b))
            data = Image.merge("RGBA", (b, g, r, a)).tobytes()
            w, h = img.size
            screen = user32.GetDC(None)
            mem = gdi32.CreateCompatibleDC(screen)
            bmi = BITMAPINFOHEADER(40, w, -h, 1, 32, 0, 0, 0, 0, 0, 0)
            bits = ctypes.c_void_p()
            hbmp = gdi32.CreateDIBSection(mem, ctypes.byref(bmi), 0, ctypes.byref(bits), None, 0)
            ctypes.memmove(bits, data, len(data))
            old = gdi32.SelectObject(mem, hbmp)
            user32.UpdateLayeredWindow(win, screen, ctypes.byref(wt.POINT(x, y)), ctypes.byref(wt.SIZE(w, h)), mem,
                                       ctypes.byref(wt.POINT(0, 0)), 0, ctypes.byref(BLENDFUNCTION(0, 0, alpha, 1)), 2)
            gdi32.SelectObject(mem, old)
            gdi32.DeleteObject(hbmp)
            gdi32.DeleteDC(mem)
            user32.ReleaseDC(None, screen)

        def paint(settings):
            img, half = render_crosshair(settings)
            from PIL import Image, ImageChops
            r, g, b, a = img.split()
            r, g, b = (ImageChops.multiply(ch, a) for ch in (r, g, b))  # premultiplied alpha
            data = Image.merge("RGBA", (b, g, r, a)).tobytes()           # BGRA byte order
            w, h = img.size
            sw, sh = user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
            pos = wt.POINT(sw // 2 - half + int(num(settings.get("offset_x"), 0)),
                           sh // 2 - half + int(num(settings.get("offset_y"), 0)))
            screen = user32.GetDC(None)
            mem = gdi32.CreateCompatibleDC(screen)
            bmi = BITMAPINFOHEADER(40, w, -h, 1, 32, 0, 0, 0, 0, 0, 0)
            bits = ctypes.c_void_p()
            hbmp = gdi32.CreateDIBSection(mem, ctypes.byref(bmi), 0, ctypes.byref(bits), None, 0)
            ctypes.memmove(bits, data, len(data))
            old = gdi32.SelectObject(mem, hbmp)
            blend = BLENDFUNCTION(0, 0, 255, 1)
            user32.UpdateLayeredWindow(hwnd, screen, ctypes.byref(pos), ctypes.byref(wt.SIZE(w, h)), mem,
                                       ctypes.byref(wt.POINT(0, 0)), 0, ctypes.byref(blend), 2)
            gdi32.SelectObject(mem, old)
            gdi32.DeleteObject(hbmp)
            gdi32.DeleteDC(mem)
            user32.ReleaseDC(None, screen)
            return (sw, sh)

        user32.RegisterHotKey.argtypes = [wt.HWND, ctypes.c_int, wt.UINT, wt.UINT]
        user32.UnregisterHotKey.argtypes = [wt.HWND, ctypes.c_int]
        hk_ids, hk_sig = {}, None
        HK_ACTIONS = ("toggle_mods", "toggle_crosshair", "next_profile", "prev_profile")

        def register_hotkeys(spec):
            for i in list(hk_ids):
                user32.UnregisterHotKey(None, i)
            hk_ids.clear()
            for n, action in enumerate(HK_ACTIONS, start=1):
                combo = str(spec.get(action) or "").lower().strip()
                if not combo:
                    continue
                mods, vk = 0x4000, None  # MOD_NOREPEAT
                for part in combo.split("+"):
                    part = part.strip()
                    if part in ("ctrl", "lctrl", "rctrl"):
                        mods |= 0x2
                    elif part in ("alt", "lalt", "ralt"):
                        mods |= 0x1
                    elif part in ("shift", "lshift", "rshift"):
                        mods |= 0x4
                    elif part in ("win", "lwin", "rwin"):
                        mods |= 0x8
                    else:
                        vk = VK.get(part)
                if vk and user32.RegisterHotKey(None, n, mods, vk):
                    hk_ids[n] = action
                elif vk:
                    self.runner.warn(f"  [warning] Couldn't use the keyboard shortcut {combo} (another app may own it)")

        msg = wt.MSG()
        shown, last_key, last_top = False, None, 0.0
        osd_img, osd_id, osd_shown, osd_alpha = None, None, False, 0
        try:
            while not self.stop_evt.is_set():
                spec = self.runner.engine.cfg.get("hotkeys") or {}
                sig = json.dumps(spec, sort_keys=True)
                if sig != hk_sig:
                    hk_sig = sig
                    register_hotkeys(spec)
                while user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, 1):
                    if msg.message == 0x0312:  # WM_HOTKEY
                        act = hk_ids.get(int(msg.wParam))
                        if act == "toggle_mods":
                            self.runner.set_enabled(not self.runner.engine.enabled)
                        elif act == "toggle_crosshair":
                            self.runner.toggle_crosshair()
                        elif act in ("next_profile", "prev_profile"):
                            self.runner.panel.commands.put(("next_profile", 1 if act == "next_profile" else -1))
                        continue
                    user32.TranslateMessage(ctypes.byref(msg))
                    user32.DispatchMessageW(ctypes.byref(msg))
                visible, settings = self.runner.crosshair_wanted()
                screen = (user32.GetSystemMetrics(0), user32.GetSystemMetrics(1))
                key = (json.dumps(settings, sort_keys=True), screen)
                if key != last_key:
                    paint(settings)
                    last_key = key
                if visible != shown:
                    user32.ShowWindow(hwnd, 4 if visible else 0)  # SW_SHOWNOACTIVATE / SW_HIDE
                    shown = visible
                now = time.perf_counter()
                if shown and now - last_top > 1.0:  # games like to push themselves on top
                    user32.SetWindowPos(hwnd, wt.HWND(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010)
                    last_top = now

                # --- in-game quick menu (wins over pop-up messages) ---
                mv = self.runner.menu_view
                if osd_hwnd and mv:
                    if mv["id"] != osd_id:
                        osd_id = mv["id"]
                        osd_img = render_menu(mv["rows"], mv["sel"], mv["accent"], mv["hint"])
                        user32.SetWindowPos(osd_hwnd, wt.HWND(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010)
                        push(osd_hwnd, osd_img, screen[0] // 2 - osd_img.width // 2,
                             screen[1] // 2 - osd_img.height // 2, 255)
                        osd_alpha = 255
                    if not osd_shown:
                        user32.ShowWindow(osd_hwnd, 4)
                        osd_shown = True
                    time.sleep(0.008)
                    continue
                # --- pop-up messages ---
                osd = self.runner.osd_msg
                if osd_hwnd and osd and osd["until"] > now:
                    if osd["id"] != osd_id:
                        osd_id = osd["id"]
                        osd_img = render_osd(osd["title"], osd.get("sub"), osd.get("accent", "#3ec6ff"))
                        osd_alpha = -1
                        user32.SetWindowPos(osd_hwnd, wt.HWND(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010)
                    left = osd["until"] - now
                    alpha = 255 if left > 0.35 else int(255 * left / 0.35)
                    if alpha != osd_alpha:
                        osd_alpha = alpha
                        push(osd_hwnd, osd_img, screen[0] // 2 - osd_img.width // 2, int(screen[1] * 0.07), max(alpha, 1))
                    if not osd_shown:
                        user32.ShowWindow(osd_hwnd, 4)
                        osd_shown = True
                elif osd_shown:
                    user32.ShowWindow(osd_hwnd, 0)
                    osd_shown = False
                time.sleep(0.01)
        finally:
            for i in list(hk_ids):
                user32.UnregisterHotKey(None, i)
            user32.DestroyWindow(hwnd)
            if osd_hwnd:
                user32.DestroyWindow(osd_hwnd)


# --------------------------------------------------------------------------------------
# Browser control panel (local only: 127.0.0.1, per-run token)
# --------------------------------------------------------------------------------------
ALLOWED_URLS = ("https://github.com/nefarius/", "https://docs.nefarius.at/", "https://store.steampowered.com/",
                "https://support.xbox.com/", "https://www.xbox.com/", "https://www.playstation.com/",
                "https://remoteplay.dl.playstation.net/", "https://github.com/streetpea/chiaki-ng")


class PanelServer:
    def __init__(self, cfg_path, runner=None):
        self.cfg_path = cfg_path
        self.runner = runner
        self.token = secrets.token_urlsafe(24)
        self.state = {"connected": False}
        self.commands = queue.Queue()
        self.warnings = collections.deque(maxlen=40)
        self.games_cache, self.game_art = None, {}
        self.game_roots = json.loads(os.environ["CLUTCH_GAME_ROOTS"]) if os.environ.get("CLUTCH_GAME_ROOTS") else None
        self.games_lock = threading.Lock()
        self.fast_until = 0.0
        self.httpd = None
        self.port = None

    @property
    def url(self):
        return f"http://127.0.0.1:{self.port}/"

    def start(self, port):
        handler = self._make_handler()
        for p in range(port, port + 10):
            try:
                self.httpd = ThreadingHTTPServer(("127.0.0.1", p), handler)
                self.port = p
                break
            except OSError:
                continue
        if not self.httpd:
            return False
        self.httpd.daemon_threads = True
        threading.Thread(target=self.httpd.serve_forever, name="ClutchPanel", daemon=True).start()
        return True

    def stop(self):
        if self.httpd:
            try:
                self.httpd.shutdown()
                self.httpd.server_close()
            except Exception:
                pass
            self.httpd = None

    def meta(self):
        return {
            "app_name": APP_NAME, "version": VERSION, "config_path": self.cfg_path, "data_dir": DATA_DIR,
            "windows": IS_WINDOWS, "installed": FROZEN, "app_mode": bool(self.runner and self.runner.app_mode),
            "inputs": list(ALL_INPUTS), "xbox_buttons": list(XBOX_BUTTONS), "online_games": ONLINE_GAMES, "online_packs": list(ONLINE_PACKS),
            "triggers": list(TRIGGERS), "stick_dirs": list(STICK_DIRS),
            "mouse": list(MOUSE_TARGETS), "keys": sorted(VK, key=lambda k: (len(k) > 1, k)),
            "crosshair_defaults": CROSSHAIR_DEFAULTS, "crosshair_styles": list(CROSSHAIR_STYLES),
        }

    def read_config(self):
        try:
            return {"config": load_config(self.cfg_path), "mtime": os.path.getmtime(self.cfg_path)}
        except json.JSONDecodeError as e:
            return {"error": f"Your settings file has a mistake on line {e.lineno}, column {e.colno}: {e.msg}. "
                             "Fix it in a text editor and reload this page.",
                    "mtime": os.path.getmtime(self.cfg_path)}

    @property
    def backup_dir(self):
        return os.path.join(os.path.dirname(self.cfg_path) or ".", "backups")

    def snapshot(self, force=False):
        """Copy the current settings into backups/ (at most every 10 minutes unless forced). Keeps 40."""
        if not os.path.exists(self.cfg_path):
            return
        os.makedirs(self.backup_dir, exist_ok=True)
        files = sorted(f for f in os.listdir(self.backup_dir) if f.startswith("settings-") and f.endswith(".jsonc"))
        if files and not force:
            if time.time() - os.path.getmtime(os.path.join(self.backup_dir, files[-1])) < 600:
                return
        shutil.copy2(self.cfg_path, os.path.join(self.backup_dir, time.strftime("settings-%Y%m%d-%H%M%S.jsonc")))
        files = sorted(f for f in os.listdir(self.backup_dir) if f.startswith("settings-") and f.endswith(".jsonc"))
        for f in files[:-40]:
            try:
                os.remove(os.path.join(self.backup_dir, f))
            except OSError:
                pass

    def games(self, refresh=False):
        """Installed games (cached; a scan takes a moment on big libraries)."""
        with self.games_lock:
            if refresh or self.games_cache is None:
                t = time.time()
                try:
                    found = find_games(self.game_roots, log=self.runner.log if self.runner else None)
                except Exception as e:  # never let a weird install break the page
                    if self.runner:
                        self.runner.log(f"Game finder failed: {e}")
                    found = []
                self.game_art = {g["id"]: g.pop("art") for g in found if g.get("art")}
                for g in found:
                    g.pop("art", None)
                    g["has_art"] = g["id"] in self.game_art
                self.games_cache = {"games": found, "scanned": t, "seconds": round(time.time() - t, 2)}
            return self.games_cache

    def prewarm_games(self):
        """Look for games in the background at startup so My games opens instantly."""
        threading.Thread(target=self.games, daemon=True, name="game-finder").start()

    def list_backups(self):
        try:
            files = sorted((f for f in os.listdir(self.backup_dir) if f.startswith("settings-") and f.endswith(".jsonc")),
                           reverse=True)
        except OSError:
            return []
        out = []
        for f in files:
            try:
                ts = time.mktime(time.strptime(f[9:-6], "%Y%m%d-%H%M%S"))
            except ValueError:
                continue
            out.append({"name": f, "time": ts})
        return out

    def restore(self, name):
        if not re.fullmatch(r"settings-\d{8}-\d{6}\.jsonc", str(name)):
            raise ValueError("That backup doesn't exist.")
        src = os.path.join(self.backup_dir, name)
        load_config(src)  # make sure it's valid before using it
        if os.path.join(self.backup_dir, time.strftime("settings-%Y%m%d-%H%M%S.jsonc")) != src:
            self.snapshot(force=True)
        shutil.copy2(src, self.cfg_path)
        os.utime(self.cfg_path, None)
        return os.path.getmtime(self.cfg_path)

    LOCAL_KEYS = ("panel", "controller_index", "controller_name", "gyro_cal",  # belong to this PC
                  "parent", "updates", "overlay", "controllers", "online_safe")  # and parent/stream settings never come from a file  # belong to this PC, never copied over

    def export_setup(self):
        """Save everything (profiles, crosshair, settings, stats badges aside) to a .clutch file in Documents."""
        cfg = load_config(self.cfg_path)
        for k in self.LOCAL_KEYS:
            cfg.pop(k, None)
        text = (f"// {APP_NAME} {VERSION} setup, made {time.strftime('%Y-%m-%d %H:%M')}. "
                f"Open {APP_NAME} on another PC, go to Settings > Copy to another PC, and pick this file.\n"
                + json.dumps({"clutch_setup": 1, "version": VERSION, "config": cfg}, indent=2, ensure_ascii=False))
        downloads = os.path.join(os.path.expanduser("~"), "Downloads")
        last = None
        for folder in (documents_dir(), downloads, DATA_DIR):  # Documents can be locked by Windows Security
            try:
                os.makedirs(folder, exist_ok=True)
                base = os.path.join(folder, time.strftime(f"{APP_NAME} setup %Y-%m-%d"))
                path, n = base + ".clutch", 2
                while os.path.exists(path):
                    path, n = f"{base} ({n}).clutch", n + 1
                with open(path, "w", encoding="utf-8") as f:
                    f.write(text)
                return path
            except OSError as e:
                last = e
        raise ValueError(f"Windows wouldn't let Clutch save the file ({last}).")

    @staticmethod
    def _key_targets(cfg):
        """Every keyboard key or mouse button the setup can press, so the person can check before loading it."""
        found = set()

        def walk(o):
            if isinstance(o, dict):
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
            elif isinstance(o, str) and o.lower().startswith("key:"):
                found.add(o[4:].lower())
        walk(cfg)
        return sorted(found)

    def import_setup(self, text, dry=False):
        """Replace this PC's settings with a .clutch file (or a plain settings file). Backs up first.
        With dry=True only checks it and says what's inside."""
        if not isinstance(text, str) or len(text) > 2_000_000:
            raise ValueError("That file isn't a Clutch setup.")
        try:
            data = json.loads(strip_json_comments(text))
        except (ValueError, RecursionError):
            raise ValueError("That file isn't a Clutch setup.")
        cfg = data.get("config") if isinstance(data, dict) and data.get("clutch_setup") else data
        if not isinstance(cfg, dict) or not isinstance(cfg.get("profiles"), dict) or not cfg["profiles"] \
                or not all(isinstance(v, dict) for v in cfg["profiles"].values()):
            raise ValueError("That file doesn't have any profiles in it.")
        try:  # make sure the engine can actually run it before replacing anything
            test = Engine(copy.deepcopy(cfg), log=lambda *a: None)
            for name in list(test.profile_names):
                test.set_profile(name, announce=False)
                test.step(RawState(), 1.0)
        except Exception as e:
            raise ValueError(f"That setup file is damaged ({type(e).__name__}).")
        if dry:
            return {"profiles": sorted(cfg["profiles"]), "keys": self._key_targets(cfg)}
        try:
            current = load_config(self.cfg_path) if os.path.exists(self.cfg_path) else {}
        except (OSError, ValueError):
            current = {}
        for k in self.LOCAL_KEYS:
            cfg.pop(k, None)
            if k in current:
                cfg[k] = current[k]
        try:
            self.snapshot(force=True)
        except OSError:
            pass
        return self.write_config(cfg), len(cfg["profiles"])

    def write_config(self, cfg):
        if not isinstance(cfg, dict) or not isinstance(cfg.get("profiles"), dict) or not cfg["profiles"]:
            raise ValueError("The config needs at least one profile.")
        try:
            self.snapshot()
        except OSError:
            pass
        backup = os.path.splitext(self.cfg_path)[0] + ".backup.jsonc"
        if not os.path.exists(backup) and os.path.exists(self.cfg_path):
            shutil.copy2(self.cfg_path, backup)
        text = (f"// {APP_NAME} settings - last saved by the control panel "
                + time.strftime("%Y-%m-%d %H:%M:%S") + "\n"
                + f"// Your original file (with its comments) was backed up to {os.path.basename(backup)}\n"
                + json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")
        tmp = self.cfg_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, self.cfg_path)
        return os.path.getmtime(self.cfg_path)

    def _make_handler(self):
        srv = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"  # keep-alive: the panel polls many times a second

            def log_message(self, *a):
                pass

            def _send(self, code, body, ctype="application/json"):
                data = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(data)

            def _guard(self):
                host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
                if host not in ("127.0.0.1", "localhost"):
                    self._send(403, {"error": "Forbidden host"})
                    return False
                return True

            def _authed(self):
                if self.headers.get("X-Panel-Token") != srv.token:
                    self._send(401, {"error": "This page is from an old session. Reload it."})
                    return False
                return True

            def do_GET(self):
                if not self._guard():
                    return
                path, _, query = self.path.partition("?")
                if path in ("/", "/index.html"):
                    try:
                        with open(resource("panel.html"), "r", encoding="utf-8") as f:
                            html = f.read()
                    except OSError:
                        return self._send(500, b"panel.html is missing", "text/plain; charset=utf-8")
                    return self._send(200, html.replace("__PANEL_TOKEN__", srv.token).encode("utf-8"),
                                      "text/html; charset=utf-8")
                if path == "/favicon.ico":
                    try:
                        with open(resource("assets", "clutch.ico"), "rb") as f:
                            return self._send(200, f.read(), "image/x-icon")
                    except OSError:
                        return self._send(204, b"", "image/x-icon")
                if path == "/icon.png":
                    try:
                        with open(resource("assets", "clutch.png"), "rb") as f:
                            return self._send(200, f.read(), "image/png")
                    except OSError:
                        return self._send(404, {"error": "Not found"})
                if path in ("/overlay", "/api/overlay_state"):  # streaming overlay: its own read-only key, no panel token
                    from urllib.parse import parse_qs
                    import hmac
                    ov = (srv.runner.engine.cfg.get("overlay") or {}) if srv.runner else {}
                    k = parse_qs(query).get("key", [""])[0]
                    if not (ov.get("enabled") and ov.get("key") and hmac.compare_digest(str(ov["key"]), k)):
                        return self._send(403, {"error": "Overlay is off"})
                    if path == "/overlay":
                        try:
                            with open(resource("overlay.html"), "rb") as f:
                                return self._send(200, f.read(), "text/html; charset=utf-8")
                        except OSError:
                            return self._send(500, b"overlay.html is missing", "text/plain; charset=utf-8")
                    return self._send(200, srv.runner.overlay_state())
                if path == "/api/hello":  # used by a second copy of the app to find this one
                    return self._send(200, {"app": APP_NAME, "version": VERSION})
                if not self._authed():
                    return
                if path == "/api/state":
                    if "fast=1" in query:  # Aim Lab wants ~60 updates a second for a little while
                        srv.fast_until = time.perf_counter() + 0.5
                    return self._send(200, srv.state)
                if path == "/api/meta":
                    return self._send(200, srv.meta())
                if path == "/api/config":
                    return self._send(200, srv.read_config())
                if path == "/api/stats":
                    return self._send(200, srv.runner.stats_snapshot() if srv.runner else {})
                if path == "/api/backups":
                    return self._send(200, {"backups": srv.list_backups()})
                if path == "/api/health":
                    return self._send(200, srv.runner.health() if srv.runner else {})
                if path == "/api/menu.png" and srv.runner:
                    import io
                    eng, rn = srv.runner.engine, srv.runner
                    rows, sel = eng.preview_menu()
                    img = render_menu(rows, sel, eng.p.get("color") or "#3ec6ff",
                                      menu_hint(rn.pad.name if rn.pad else "", (eng.cfg.get("profile_switch") or {}).get("hold") or "guide"))
                    buf = io.BytesIO()
                    img.save(buf, "PNG")
                    return self._send(200, buf.getvalue(), "image/png")
                if path == "/api/games":
                    return self._send(200, srv.games(refresh="refresh=1" in query))
                if path == "/api/gameart":
                    from urllib.parse import parse_qs
                    art = srv.game_art.get(parse_qs(query).get("id", [""])[0])
                    if art:
                        try:
                            with open(art, "rb") as f:
                                return self._send(200, f.read(), "image/jpeg")
                        except OSError:
                            pass
                    return self._send(404, {"error": "No picture"})
                if path == "/api/crosshair.png":
                    from urllib.parse import parse_qs
                    q = parse_qs(query)
                    try:
                        c = dict(CROSSHAIR_DEFAULTS)
                        c.update(json.loads(q.get("c", ["{}"])[0]))
                        zoom = int(clamp(num(q.get("zoom", ["1"])[0], 1), 1, 8))
                        return self._send(200, crosshair_png(c, zoom), "image/png")
                    except Exception as e:
                        return self._send(400, {"error": str(e)})
                self._send(404, {"error": "Not found"})

            def do_POST(self):
                if not self._guard():
                    return
                path = self.path.split("?", 1)[0]
                if path == "/api/show":  # bring the app window forward (second launch)
                    if srv.runner and srv.runner.on_show:
                        srv.runner.on_show()
                    return self._send(200, {"ok": True})
                if not self._authed():
                    return
                n = int(self.headers.get("Content-Length") or 0)
                if n > 2_000_000:
                    return self._send(413, {"error": "Too large"})
                try:
                    body = json.loads(self.rfile.read(n) or b"{}")
                except ValueError:
                    return self._send(400, {"error": "Bad JSON"})
                if path == "/api/config":
                    try:
                        mtime = srv.write_config(body.get("config"))
                    except ValueError as e:
                        return self._send(400, {"error": str(e)})
                    except OSError as e:
                        return self._send(500, {"error": f"Couldn't write the settings file: {e}"})
                    srv.commands.put(("reload", None))
                    return self._send(200, {"ok": True, "mtime": mtime})
                if path == "/api/profile":
                    if int(num(body.get("player"), 1)) > 1:
                        srv.commands.put(("player_profile", (int(num(body.get("player"), 1)), body.get("name"))))
                        return self._send(200, {"ok": True})
                    srv.commands.put(("profile", body.get("name")))
                    return self._send(200, {"ok": True})
                if path == "/api/restore":
                    try:
                        mtime = srv.restore(body.get("name"))
                    except (ValueError, OSError, json.JSONDecodeError) as e:
                        return self._send(400, {"error": f"Couldn't restore that backup: {e}"})
                    srv.commands.put(("reload", None))
                    return self._send(200, {"ok": True, "mtime": mtime})
                if path == "/api/import":
                    try:
                        if body.get("dry"):
                            return self._send(200, srv.import_setup(body.get("text"), dry=True))
                        mtime, n = srv.import_setup(body.get("text"))
                    except ValueError as e:
                        return self._send(400, {"error": str(e)})
                    except OSError as e:
                        return self._send(500, {"error": f"Couldn't write the settings file: {e}"})
                    except Exception as e:
                        return self._send(400, {"error": f"That file isn't a Clutch setup ({type(e).__name__})."})
                    srv.commands.put(("reload", None))
                    return self._send(200, {"ok": True, "mtime": mtime, "profiles": n})
                if path == "/api/test" and srv.runner:
                    return self._send(200, srv.runner.test_action(body))
                if path == "/api/osd" and srv.runner:
                    srv.runner.osd(str(body.get("title", "Clutch"))[:60], body.get("sub"))
                    return self._send(200, {"ok": True})
                if path == "/api/enabled":
                    srv.commands.put(("enabled", bool(body.get("on"))))
                    return self._send(200, {"ok": True})
                if path == "/api/kid":
                    srv.commands.put(("kid", body.get("id") or None))
                    return self._send(200, {"ok": True})
                if path == "/api/record" and srv.runner:
                    eng = srv.runner.engine
                    if body.get("action") == "start":
                        eng.start_recording(time.perf_counter())
                        return self._send(200, {"ok": True})
                    return self._send(200, {"ok": True, "steps": eng.stop_recording(time.perf_counter())})
                if path == "/api/action" and srv.runner:
                    try:
                        return self._send(200, srv.runner.action(body))
                    except Exception as e:
                        return self._send(400, {"error": str(e)})
                self._send(404, {"error": "Not found"})

        return Handler


# --------------------------------------------------------------------------------------
# The runner: owns the controller, the virtual pad, the panel server and the main loop
# --------------------------------------------------------------------------------------
class PlayerSlot:
    """An extra player (couch co-op): own controller, own engine/profile, own virtual pad."""

    def __init__(self, n, pad, engine):
        self.n, self.pad, self.engine = n, pad, engine
        self.vpad = None
        self.raw, self.out = RawState(), Output()
        self.retry = 0.0
        self.last_rumble, self.last_rumble_t = (0.0, 0.0), 0.0


class ModRunner:
    def __init__(self, cfg_path, profile=None, test_mode=False, app_mode=False, log=print):
        self.cfg_path = cfg_path
        self.test_mode = test_mode
        self.app_mode = app_mode
        self._print = log
        self.panel = PanelServer(cfg_path, self)
        cfg = ensure_config(cfg_path, recover=app_mode, log=log)
        self.engine = Engine(cfg, profile, log=self.warn)
        self.stop_event = threading.Event()
        self.thread = None
        self.pad = self.vpad = self.kmo = None
        self._quiet_out = Output()
        self.taps, self._last_btns = {}, set()
        self._last_led, self._led_hold = None, 0.0
        self._rt_was, self.led_ok = False, True
        self._trig_sent = None              # last DualSense trigger feel sent (left, right)
        self.kid = None                     # who's playing (family mode), set from settings or the controller
        self._quiet_off = False             # True while quiet hours switched mods off
        self._limit_told = None             # day we last showed the daily-time reminder
        self.update = {"state": "idle"}      # update check / download progress
        self.fullscreen_seen = set()        # games seen in exclusive full screen this run
        self._ov_raw = None                 # latest controller reading, for the stream overlay
        self.on_quit = None                 # set by the desktop app: closes Clutch cleanly
        self._last_input = 0.0              # last time the controller was actually used
        self._remembered = set()            # controllers whose saved profile was applied this run
        self.online_game = None             # name of the online game in front (online-safe mode)
        self.setup_job = {}                 # one-click HidHide progress
        self.double = {"risk": False, "reason": None}   # 12.1: can games see the real AND the virtual controller?
        self._double_busy, self._double_next, self._double_warned = False, 0.0, set()
        self.problem = None
        self.notify = None      # callable(title, message), set by the desktop app
        self.on_show = None     # callable(): bring the app window forward
        self.on_change = None   # callable(): profile / on-off / crosshair changed
        self.overlay = None
        self.osd_msg = None          # {"id", "title", "sub", "accent", "until"} for the on-screen pop-up
        self._osd_n = 0
        self.menu_view, self._menu_n = None, 0  # quick menu as shown by the overlay
        self.battery = None
        self.slots = []            # players 2-4 (couch co-op)
        self.own_ids = set()       # SDL instance ids of Clutch's OWN virtual pads (never treat them as players)
        self.pending_own = 0       # virtual pads created that SDL hasn't announced yet
        self.pending_until = 0.0
        self._next_scan = 0.0
        self.stats_path = os.path.join(os.path.dirname(cfg_path) or ".", "stats.json")
        self.stats = self._load_stats()
        self._session = 0.0
        self.auto = AutoProfiles()
        self.cfg_mtime = os.path.getmtime(cfg_path)

    # ---- logging / notifications ----
    def log(self, msg):
        try:
            self._print(msg)
        except Exception:
            pass

    def warn(self, msg):
        self.log(msg)
        self.panel.warnings.append(msg.strip())

    def _notify(self, title, msg):
        if self.notify and self.engine.cfg.get("notifications", True):
            try:
                self.notify(title, msg)
            except Exception:
                pass

    def osd(self, title, sub=None, accent=None, secs=1.8):
        if not self.engine.cfg.get("osd", True):
            return
        self._osd_n += 1
        p = self.engine.p
        self.osd_msg = {"id": self._osd_n, "title": title, "sub": sub, "accent": accent or p.get("color") or "#3ec6ff",
                        "until": time.perf_counter() + secs}

    def _changed(self):
        if self.on_change:
            try:
                self.on_change()
            except Exception:
                pass

    # ---- lifecycle ----
    def start_panel(self, open_browser=None):
        pcfg = self.engine.cfg.get("panel") or {}
        if self.panel.start(int(num(pcfg.get("port"), 8765))):
            self.log(f"Control panel: {self.panel.url}")
            self.panel.prewarm_games()
            if open_browser is None:
                open_browser = pcfg.get("open_browser", True)
            if open_browser:
                try:
                    webbrowser.open(self.panel.url)
                except Exception:
                    pass
            return True
        self.log("Control panel: couldn't open a port (8765-8774 busy)")
        return False

    def start(self):
        self.thread = threading.Thread(target=self._run_safe, name="ClutchEngine", daemon=True)
        self.thread.start()

    def _run_safe(self):
        try:
            self.run()
        except Exception as e:
            self.problem = f"The engine stopped: {e}"
            self.warn("  [warning] " + self.problem)

    def stop(self, timeout=3.0):
        self.stop_event.set()
        if self.thread and self.thread is not threading.current_thread():
            self.thread.join(timeout)
        self.panel.stop()

    def set_enabled(self, on):
        self.panel.commands.put(("enabled", bool(on)))

    def set_profile(self, name):
        self.panel.commands.put(("profile", name))

    def toggle_crosshair(self):
        self.panel.commands.put(("crosshair", None))

    def wanted_output(self, eng=None):
        eng = eng or self.engine
        kind = str(eng.p.get("output") or eng.cfg.get("output") or "xbox").lower()
        return kind if kind in OUTPUT_LABEL else "xbox"

    # ---- what the overlay should show ----
    def crosshair_wanted(self):
        eng = self.engine
        if eng.menu is not None:  # keep the middle of the screen clear for the quick menu
            return False, crosshair_settings(eng.cfg)
        c = crosshair_settings(eng.cfg)
        vis = bool(eng.crosshair_on and eng.enabled)
        aiming = "lt" in eng.last_active
        mode = str(c.get("show", "always"))
        if mode == "aiming":
            vis = vis and aiming
        elif mode == "not_aiming":
            vis = vis and not aiming
        return vis, c

    # ---- setup checks + one-click fixes for the panel ----
    def health(self):
        h = {"windows": IS_WINDOWS, "installed": FROZEN, "exe": app_exe_paths()[0],
             "vigembus": svc_exists("ViGEmBus"), "vigem_msi": bool(find_vigem_msi()),
             "hidhide": svc_exists("HidHide"), "hidhide_client": bool(find_hidhide("HidHideClient.exe")),
             "hidhide_cli": bool(find_hidhide("HidHideCLI.exe")), "hidhide_allowed": None,
             "controller": self.pad.name if self.pad else None, "virtual": bool(self.vpad),
             "controller_id": ("%04X:%04X" % guid_vid_pid(getattr(self.pad, "guid", None))) if self.pad and guid_vid_pid(getattr(self.pad, "guid", None)) else None,
             "controller_lookalike": bool(self.pad) and guid_vid_pid(getattr(self.pad, "guid", None)) in ((0x045E, 0x028E), (0x054C, 0x05C4)),
             "output": self.wanted_output(),
             "problem": self.problem, "autostart": get_autostart(),
             "overlay_error": self.overlay.error if self.overlay else None,
             "steam_running": steam_running()}
        cli = find_hidhide("HidHideCLI.exe")
        if cli:
            try:
                import subprocess
                r = subprocess.run([cli, "--app-list"], capture_output=True, text=True, timeout=5,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                listed = (r.stdout or "").lower()
                h["hidhide_allowed"] = any(os.path.basename(p).lower() in listed for p in app_exe_paths())
            except Exception:
                pass
        return h

    def action(self, body):
        name = body.get("name")
        if name == "install_vigem":
            msi = find_vigem_msi()
            if not msi:
                shell_open("https://github.com/nefarius/ViGEmBus/releases")
                return {"ok": True, "message": "Opened the ViGEmBus download page."}
            shell_open("msiexec.exe", f'/i "{msi}"', elevate=True)
            return {"ok": True, "message": "Follow the installer window. Clutch connects by itself when it's done."}
        if name in ("auto_hide", "hidhide_off"):
            self.start_hidhide_job(undo=name == "hidhide_off")
            return {"ok": True}
        if name == "hidhide_allow":
            cli = find_hidhide("HidHideCLI.exe")
            if not cli:
                raise ValueError("HidHide isn't installed yet.")
            args = " ".join(f'--app-reg "{p}"' for p in app_exe_paths()) + " --cloak-on"
            import subprocess
            try:
                r = subprocess.run(f'"{cli}" {args}', capture_output=True, text=True, timeout=10,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                ok = r.returncode == 0
            except Exception:
                ok = False
            if ok:
                return {"ok": True, "message": "Clutch is now allowed to see your hidden controller."}
            shell_open(cli, args, elevate=True, hidden=True)  # fallback: some setups want admin
            return {"ok": True, "message": "Say Yes to the Windows pop-up. This page updates in a moment to show if it worked."}
        if name == "open_hidhide":
            exe = find_hidhide("HidHideClient.exe")
            if not exe:
                raise ValueError("HidHide isn't installed yet.")
            shell_open(exe)
            return {"ok": True}
        if name == "open_url":
            url = str(body.get("url", ""))
            if not url.startswith(ALLOWED_URLS):
                raise ValueError("That link isn't allowed.")
            shell_open(url)
            return {"ok": True}
        if name == "autostart":
            set_autostart(bool(body.get("on")))
            return {"ok": True, "autostart": get_autostart()}
        if name == "open_folder":
            shell_open(DATA_DIR)
            return {"ok": True}
        if name == "check_updates":
            self.check_updates(force=True)
            return {"ok": True}
        if name == "install_update":
            self.install_update()
            return {"ok": True}
        if name == "help_bundle":
            path = self.help_bundle()
            if IS_WINDOWS:
                import subprocess
                subprocess.Popen(["explorer", "/select,", path], creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            return {"ok": True, "path": path}
        if name == "export_setup":
            path = self.panel.export_setup()  # ValueError -> shown to the person
            if body.get("show") and IS_WINDOWS:
                import subprocess
                subprocess.Popen(["explorer", "/select,", path], creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            return {"ok": True, "path": path}
        if name == "crosshair":
            self.toggle_crosshair()
            return {"ok": True}
        raise ValueError(f"Unknown action {name!r}")

    # ---- main loop ----
    # ---- stats (time played, presses, badges) ----
    def _load_stats(self):
        base = {"since": time.time(), "presses": {}, "profiles": {}, "total_secs": 0.0, "longest_session": 0.0,
                "crosshair_secs": 0.0, "gyro_secs": 0.0, "sessions": 0, "coop_secs": 0.0, "macros_played": 0}
        try:
            with open(self.stats_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                base.update(data)
        except (OSError, ValueError):
            pass
        return base

    def save_stats(self):
        self._merge_presses()
        try:
            tmp = self.stats_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.stats, f)
            os.replace(tmp, self.stats_path)
        except OSError:
            pass

    def _merge_presses(self):
        engines = [self.engine] + [sl.engine for sl in self.slots]
        for eng in engines:
            if eng.press_count:
                pc, eng.press_count = eng.press_count, {}
                for k, v in pc.items():
                    self.stats["presses"][k] = self.stats["presses"].get(k, 0) + v

    def _stats_tick(self, dt, raw):
        st = self.stats
        if time.perf_counter() - self._last_input > 60:  # controller sitting there unused: not playing
            return
        st["total_secs"] += dt
        days = st.setdefault("days", {})
        day = days.setdefault(time.strftime("%Y-%m-%d"), {})
        who = self.kid or "_"
        day[who] = day.get(who, 0.0) + dt
        if len(days) > 120:  # keep about four months
            for old in sorted(days)[:-120]:
                days.pop(old, None)
        prof = st["profiles"]
        prof[self.engine.active] = prof.get(self.engine.active, 0.0) + dt
        before = self._session
        self._session += dt
        st["longest_session"] = max(st["longest_session"], self._session)
        par = self.engine.cfg.get("parent")
        bm = num(par.get("break_minutes"), 0) if isinstance(par, dict) else 0
        if bm > 0 and int(before // (bm * 60)) != int(self._session // (bm * 60)):
            mins = int(self._session // 60)
            played = f"{mins // 60} hour{'s' if mins // 60 != 1 else ''}" if mins % 60 == 0 and mins >= 60 else \
                f"{mins} minute{'s' if mins != 1 else ''}"
            self.osd("Time for a break!", f"You've played for {played}. Stretch, drink some water.",
                     accent="#ffd23f", secs=6.0)
            self._notify("Time for a break!", f"You've played for {played}.")
        if self.crosshair_wanted()[0]:
            st["crosshair_secs"] += dt
        if raw.has_gyro and (self.engine.p.get("gyro") or {}).get("enabled"):
            st["gyro_secs"] += dt
        if self.slots:
            st["coop_secs"] += dt

    def stats_snapshot(self):
        self._merge_presses()
        out = copy.deepcopy(self.stats)
        out["session_secs"] = self._session
        out["profile_count"] = len(self.engine.profile_names)
        return out

    # ---- controller test page ----
    def test_action(self, body):
        self.panel.commands.put(("test", body))
        return {"ok": True}

    # ---- couch co-op ----
    def _expect_own(self, t0):
        self.pending_own += 1
        self.pending_until = t0 + 5.0

    def _used_ids(self):
        ids = set(self.own_ids)
        if self.pad is not None:
            ids.add(self.pad.instance_id)
        ids.update(sl.pad.instance_id for sl in self.slots)
        return ids

    def _drop_slot(self, sl, announce=False):
        if sl.vpad:
            sl.vpad.close()
        sl.pad.close()
        if sl in self.slots:
            self.slots.remove(sl)
        if announce:
            self.log(f"Player {sl.n} controller disconnected.")
            self.osd(f"Player {sl.n} left", "Controller disconnected", accent="#ff6b6b")
        self._changed()

    def _coop(self, pg, sdlc, t0):
        co = self.engine.cfg.get("coop") or {}
        maxp = int(clamp(num(co.get("max_players"), 4), 2, 4)) if co.get("enabled") else 1
        while self.slots and len(self.slots) + 1 > maxp:
            self._drop_slot(self.slots[-1])
        if (maxp > 1 and self.pad is not None and len(self.slots) + 1 < maxp and t0 >= self._next_scan
                and not self.pending_own):
            self._next_scan = t0 + 1.0
            pad = open_pad(pg, sdlc, self.engine.cfg, exclude=self._used_ids(), first_free=True)
            if pad is not None:
                taken = {sl.n for sl in self.slots}
                n = next(k for k in (2, 3, 4) if k not in taken)
                start = (co.get("profiles") or {}).get(str(n))
                eng = Engine(self.engine.cfg, start, log=self.warn)
                eng.events.clear()
                eng.menu_allowed = False  # nothing draws a menu for extra players
                self.slots.append(PlayerSlot(n, pad, eng))
                self.slots.sort(key=lambda x: x.n)
                self.log(f"Player {n}: {pad.name}")
                self.osd(f"Player {n} joined", f"{pad.name} - {eng.active}", accent="#ffd23f")
                self._changed()
        for sl in self.slots:
            want = self.wanted_output(sl.engine)
            if sl.vpad is not None and sl.vpad.kind != want:
                sl.vpad.close()
                sl.vpad = None
            if not self.test_mode and sl.vpad is None and t0 >= sl.retry:
                try:
                    sl.vpad = make_virtual_pad(want)
                    self._expect_own(t0)
                except RuntimeError:
                    sl.retry = t0 + 5.0
            sl.pad.read(sl.raw)
            sl.out = sl.engine.step(sl.raw, t0)
            if sl.vpad:
                sl.vpad.send(sl.out)
            for kind, val in sl.engine.events:
                if kind == "profile":
                    self.osd(f"Player {sl.n}: {val}", "Profile switched")
                elif kind == "enabled":
                    self.osd(f"Player {sl.n}: mods {'on' if val else 'off'}")
            if sl.engine.events:
                sl.engine.events.clear()
                self._changed()
            if sl.vpad:
                cur = (round(sl.vpad.large * sl.engine.rumble_scale(), 3), round(sl.vpad.small * sl.engine.rumble_scale(), 3))
                if cur != sl.last_rumble or (any(cur) and t0 - sl.last_rumble_t > 0.5):
                    if any(cur):
                        sl.pad.rumble(cur[0], cur[1], 1000)
                    else:
                        sl.pad.stop_rumble()
                    sl.last_rumble, sl.last_rumble_t = cur, t0

    def _drop(self):
        self._release_triggers()
        for sl in list(self.slots):
            self._drop_slot(sl)
        if self.kmo:
            self.kmo.release_all()
        if self.vpad:
            self.vpad.close()
            self.vpad = None
        if self.pad:
            self.pad.close()
            self.pad = None

    def overlay_state(self):
        """Just what a stream overlay needs: no settings, no file paths."""
        eng, raw = self.engine, self._ov_raw
        kid = next((k for k in self.kids() if k["id"] == self.kid), None)
        return {"connected": self.pad is not None, "controller": self.pad.name if self.pad else None,
                "profile": eng.active, "emoji": eng.p.get("emoji"), "color": eng.p.get("color"), "enabled": eng.enabled,
                "kid": kid.get("name") if kid and (eng.cfg.get("overlay") or {}).get("show_name") else None,
                "buttons": sorted(raw.buttons) if raw else [], "lx": raw.lx if raw else 0, "ly": raw.ly if raw else 0,
                "rx": raw.rx if raw else 0, "ry": raw.ry if raw else 0, "lt": raw.lt if raw else 0, "rt": raw.rt if raw else 0}

    # ---- 12.0: one-click HidHide ----
    def start_hidhide_job(self, undo=False):
        if not IS_WINDOWS:
            raise ValueError("This only works on Windows.")
        if self.setup_job.get("state") in ("downloading", "waiting"):
            return
        vp = guid_vid_pid(getattr(self.pad, "guid", None)) if self.pad else None
        if not undo and not vp:
            raise ValueError("Plug in your controller first, so Clutch knows which one to hide.")
        # an original Xbox 360 pad or first DualShock 4 looks exactly like Clutch's own virtual controller,
        # so hiding by id could hide the virtual one too: for those, only let Clutch through and ask to tick it by hand
        lookalike = vp in ((0x045E, 0x028E), (0x054C, 0x05C4))
        if lookalike:
            vp = None

        def work():
            import tempfile
            j = self.setup_job
            try:
                folder = tempfile.mkdtemp(prefix="clutch-hidhide-")
                inst = None
                if not undo and not find_hidhide("HidHideCLI.exe"):
                    j.update(state="downloading", message="Downloading HidHide from its official GitHub…")
                    inst = latest_hidhide_installer(folder)
                job = os.path.join(folder, "job.json")
                with open(job, "w", encoding="utf-8") as f:
                    json.dump({"installer": inst, "apps": app_exe_paths(), "undo": undo,
                               "vid": vp[0] if vp else None, "pid": vp[1] if vp else None}, f)
                open(job + ".result", "w").close()  # made by us (so we can read it back); the helper fills it in
                j.update(state="waiting", message="Say Yes to the Windows pop-up…")
                script = [] if FROZEN else [os.path.abspath(sys.argv[0])]
                args = " ".join(f'"{a}"' for a in script + ["--hidhide-setup", job])
                if not shell_open(sys.executable, args, elevate=True, hidden=True):
                    raise ValueError("Windows didn't allow it. A parent needs to click Yes.")
                res, denied = None, 0
                for _ in range(900):  # up to 15 minutes (the installer can take a while)
                    time.sleep(1)
                    try:
                        with open(job + ".result", "r", encoding="utf-8") as f:
                            txt = f.read()
                        if txt.strip():
                            res = json.loads(txt)
                            break
                    except PermissionError:
                        denied += 1
                        if denied >= 8:  # can't read the answer: check HidHide itself instead
                            cli = find_hidhide("HidHideCLI.exe")
                            state = hidhide_hiding(cli, *(vp or (None, None)))[0] if cli else None
                            if undo or state is not None:
                                res = {"ok": True, "hidden": ["Your controller"] if state else [], "checked": True}
                                break
                    except (OSError, ValueError):
                        pass  # still being written
                if res is None:
                    raise ValueError("It took too long. Try again, or use the manual steps.")
                if not res.get("ok"):
                    raise ValueError(res.get("error") or "Something went wrong.")
                if undo:
                    msg = "Your controller isn't hidden any more."
                elif res.get("hidden"):
                    msg = (f"Done! {', '.join(res['hidden'])} is now hidden from games, and Clutch can still see it. "
                           "Unplug the controller and plug it back in (or turn it off and on), then restart your game.")
                elif lookalike:
                    msg = ("Clutch is allowed through HidHide. Your controller looks just like Clutch's virtual one, "
                           "so tick it yourself: Open HidHide, Devices tab, tick your controller.")
                else:
                    msg = "Clutch is allowed through HidHide, but it couldn't find your controller to hide. Use Open HidHide to tick it."
                if res.get("restart"):
                    msg += " Restart the PC to finish."
                j.update(state="done", message=msg, hidden=res.get("hidden") or [], restart=bool(res.get("restart")))
                self._double_next = 0.0  # check again right away
                self.log(f"HidHide setup: {msg}")
            except Exception as e:
                j.update(state="error", message=str(e)[:300])
                self.log(f"HidHide setup failed: {e}")
        self.setup_job = {"state": "starting", "message": "Getting ready…"}
        threading.Thread(target=work, daemon=True, name="hidhide-setup").start()

    # ---- 11.0: online-safe mode ----
    def online_games(self):
        """exe -> name for every program that counts as an online game right now."""
        cfg = self.engine.cfg.get("online_safe") if isinstance(self.engine.cfg.get("online_safe"), dict) else {}
        games = dict(ONLINE_GAMES)
        cache = self.panel.games_cache if self.panel else None
        for g in (cache or {}).get("games", []):
            if g.get("pack") in ONLINE_PACKS:
                for e in [g.get("exe")] + list(g.get("alt_exes") or []):
                    if e:
                        games.setdefault(e, g["name"])
        for e in cfg.get("games") or []:
            if isinstance(e, str) and e.strip():
                games.setdefault(e.strip().lower(), e.strip())
        for e in cfg.get("offline") or []:
            if isinstance(e, str):
                games.pop(e.strip().lower(), None)
        return games

    def _online_tick(self):
        cfg = self.engine.cfg.get("online_safe") if isinstance(self.engine.cfg.get("online_safe"), dict) else {}
        if self.auto.watch.own:
            return  # looking at Clutch itself: keep whatever the game in the background had
        exe = self.auto.last_exe or ""
        game = self.online_games().get(exe) if cfg.get("enabled", True) else None
        engines = [self.engine] + [sl.engine for sl in self.slots]
        changed = [e.set_online_safe(bool(game)) for e in engines]
        if changed[0]:
            self.online_game = game
            risky = self._has_risky()
            if game and risky:
                self.osd("Online-safe mode", f"Rapid fire, macros and recoil control are paused in {game}", accent="#3ee6a0", secs=4)
            elif not game and risky:
                self.osd("Online-safe mode off", "Your ban-risk power-ups are back on", accent="#ffd23f", secs=3)
            self._changed()

    # ---- 12.1: double-input check ----
    def _double_check(self):
        """Background: work out whether games see both controllers (each press then counts twice:
        weapons skip a slot, menus jump two items). Only says "risk" when it's sure."""
        try:
            risk, reason = False, None
            if IS_WINDOWS and self.vpad and self.pad:
                vp = guid_vid_pid(getattr(self.pad, "guid", None))
                if vp in ((0x045E, 0x028E), (0x054C, 0x05C4)):
                    vp = None  # looks like Clutch's own virtual pad: can't tell them apart
                if not svc_exists("HidHide"):
                    risk, reason = True, "no_hidhide"
                else:
                    cli = find_hidhide("HidHideCLI.exe")
                    if cli:
                        state, why = hidhide_hiding(cli, *(vp or (None, None)))
                        if state is False:
                            risk, reason = True, why
            if risk != self.double.get("risk") or reason != self.double.get("reason"):
                self.double = {"risk": risk, "reason": reason}
                self._changed()
        except Exception:
            pass
        finally:
            self._double_busy = False

    def _double_tick(self, now):
        if not IS_WINDOWS:
            return
        if not self.pad or not self.vpad:
            if self.double.get("risk"):
                self.double = {"risk": False, "reason": None}; self._changed()
            return
        if now >= self._double_next and not self._double_busy and not (self.setup_job or {}).get("state") in ("starting", "downloading", "waiting"):
            self._double_next = now + 20.0
            self._double_busy = True
            threading.Thread(target=self._double_check, daemon=True).start()
        exe = self.auto.last_exe or ""
        if self.double.get("risk") and exe and not self.auto.watch.own and exe not in self._double_warned \
                and (exe in self.online_games() or exe in self.fullscreen_seen):
            self._double_warned.add(exe)
            self.osd("Buttons counting twice?", "Your game can see two controllers. Open Clutch and tap “Fix it for me”.", accent="#ffd23f", secs=6)

    def _has_risky(self):
        """Does the current profile use anything online-safe mode switches off?"""
        eng = self.engine
        raw = eng._resolve(eng.active)
        strip = lambda d: {k: v for k, v in d.items() if k != "macros"}  # macros only matter if a button runs them
        return strip(online_safe_profile(raw)) != strip(raw)

    # ---- 6.0: updates, help file, full-screen warning ----
    def check_updates(self, force=False):
        """Ask GitHub (in the background) whether a newer Clutch is out."""
        repo = UPDATE_REPO.strip()
        u = self.update
        if not repo:
            u.update(state="no_source", error=None)
            return u
        if u.get("busy") or (not force and time.time() - u.get("checked", 0) < 6 * 3600 and u.get("repo") == repo):
            return u

        def work():
            try:
                info = check_github_release(repo)
                u.update(info, state="ok", error=None)
            except Exception as e:
                code = getattr(e, "code", None)
                msg = ("Couldn't find any releases at that GitHub address." if code == 404 else
                       "GitHub didn't answer right now. Try again in a little while." if code in (403, 429) else
                       "Couldn't reach GitHub. Check the internet connection." if code is None and not isinstance(e, ValueError) else str(e))
                u.update(state="error", error=msg[:200])
            u.update(busy=False, checked=time.time(), repo=repo)
        u.update(busy=True)
        threading.Thread(target=work, daemon=True, name="update-check").start()
        return u

    def install_update(self):
        """Download the new installer and run it (it closes Clutch, updates, and starts it again)."""
        u = self.update
        url = u.get("download")
        if not (u.get("newer") and url and url.startswith("https://github.com/")):
            raise ValueError("There's no update to install.")
        if u.get("downloading"):
            return u

        def work():
            import hashlib
            import tempfile
            import urllib.request
            try:
                path = os.path.join(tempfile.mkdtemp(prefix="clutch-update-"), "Clutch-Setup.exe")
                h, got = hashlib.sha256(), 0
                req = urllib.request.Request(url, headers={"User-Agent": f"{APP_NAME}-updater"})
                with urllib.request.urlopen(req, timeout=30) as r, open(path, "wb") as f:
                    while True:
                        chunk = r.read(256 * 1024)
                        if not chunk:
                            break
                        got += len(chunk)
                        if got > 400 * 1024 * 1024:
                            raise ValueError("The download is much bigger than expected.")
                        h.update(chunk)
                        f.write(chunk)
                        u["progress"] = round(got / max(1, u.get("size") or got) * 100)
                if u.get("sha256") and h.hexdigest().lower() != u["sha256"].lower():
                    os.remove(path)
                    raise ValueError("The download didn't match GitHub's checksum, so it wasn't installed.")
                if IS_WINDOWS and not same_signer(path):
                    raise ValueError("The download isn't signed by the same publisher as this Clutch, so it wasn't installed.")
                self.log(f"Update downloaded: {path}")
                if IS_WINDOWS:
                    if not shell_open(path, "/SILENT /SUPPRESSMSGBOXES /NORESTART"):
                        raise ValueError("The installer didn't start (it needs a parent to click Yes on the Windows prompt).")
                    u.update(downloading=False, ready=path)
                    self.save_stats()
                    if self.on_quit:  # close cleanly so the installer can replace Clutch, which then starts again
                        threading.Timer(1.5, self.on_quit).start()
                else:
                    u.update(downloading=False, ready=path)
            except Exception as e:
                u.update(downloading=False, error=f"Update failed: {e}"[:200])
        u.update(downloading=True, progress=0, error=None)
        threading.Thread(target=work, daemon=True, name="update-download").start()
        return u

    def help_bundle(self):
        """One zip with everything needed to figure out a problem: log, settings, stats, health."""
        import platform
        import zipfile
        name = time.strftime(f"{APP_NAME} help file %Y-%m-%d %H%M.zip")
        last = None
        for folder in (desktop_dir(), documents_dir(), DATA_DIR):
            path = os.path.join(folder, name)
            try:
                with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
                    for fn in ("clutch.log", "clutch.log.1", "stats.json"):
                        fp = os.path.join(DATA_DIR, fn)
                        if os.path.isfile(fp) and os.path.getsize(fp) < 20 * 1024 * 1024:
                            z.write(fp, fn)
                    try:
                        safe = load_config(self.cfg_path)
                        if isinstance(safe.get("parent"), dict) and safe["parent"].get("pin"):
                            safe["parent"]["pin"] = "(set, hidden)"
                        if isinstance(safe.get("overlay"), dict) and safe["overlay"].get("key"):
                            safe["overlay"]["key"] = "(hidden)"
                        z.writestr("settings.json", json.dumps(safe, indent=2, ensure_ascii=False))
                    except (OSError, ValueError):
                        pass
                    info = {"version": VERSION, "python": sys.version, "os": platform.platform(),
                            "controller": self.pad.name if self.pad else None, "backend": getattr(self.pad, "backend", None),
                            "caps": {"touch": bool(getattr(self.pad, "has_touch", False)),
                                     "trigger_fx": bool(getattr(self.pad, "has_trigger_fx", False)),
                                     "gyro": bool(getattr(self.pad, "has_gyro", False))},
                            "health": self.health(), "warnings": list(self.panel.warnings) if self.panel else [],
                            "profile": self.engine.active, "fullscreen_games": sorted(self.fullscreen_seen)}
                    z.writestr("about-this-pc.json", json.dumps(info, indent=2, default=str))
                return path
            except OSError as e:
                last = e
        raise ValueError(f"Couldn't save the help file ({last}).")

    def _fullscreen_tick(self):
        if not fullscreen_game_running():
            return
        exe = self.auto.last_exe or "a game"
        if exe in self.fullscreen_seen:
            return
        self.fullscreen_seen.add(exe)
        self.log(f"{exe} is running in exclusive full screen; overlays can't show over it")
        if self.crosshair_wanted()[0] or (self.engine.cfg.get("quick_menu") or {}).get("enabled", True):
            self._notify("Switch the game to Borderless", f"{exe} is in full screen, so the crosshair and quick menu can't show. "
                                                           "Pick Borderless or Windowed in its video settings.")
        self._changed()

    # ---- 7.0: DualSense trigger feel, controller memory ----
    def trigger_feel_wanted(self):
        eng = self.engine
        if not eng.enabled:
            return ("off", "off")
        tf = eng.p.get("trigger_feel") if isinstance(eng.p.get("trigger_feel"), dict) else {}
        pick = lambda v: v if v in TRIGGER_FEELS else "off"
        return (pick(tf.get("left", "off")), pick(tf.get("right", "off")))

    def _apply_triggers(self):
        if not getattr(self.pad, "has_trigger_fx", False):
            return
        want = self.trigger_feel_wanted()
        if want != self._trig_sent:
            if self.pad.set_trigger_feel(TRIGGER_FEELS[want[0]], TRIGGER_FEELS[want[1]]):
                self._trig_sent = want

    def _release_triggers(self):
        if self.pad is not None and getattr(self.pad, "has_trigger_fx", False) and self._trig_sent not in (None, ("off", "off")):
            self.pad.set_trigger_feel(TRIGGER_FEELS["off"], TRIGGER_FEELS["off"])
            time.sleep(0.12)  # SDL sends it from a background thread; let it go out before the pad is closed
        self._trig_sent = None

    def _remember_pad(self):
        """A controller Clutch has seen before brings back its kid and profile."""
        key = getattr(self.pad, "key", None)
        entry = (self.engine.cfg.get("controllers") or {}).get(key) if key else None
        if not isinstance(entry, dict) or key in self._remembered:
            return  # a reconnect (battery, Bluetooth hiccup) keeps whatever the kid picked since
        self._remembered.add(key)
        if entry.get("kid"):
            self.set_kid(entry["kid"], announce=False)
        prof = entry.get("profile")
        if prof in self.engine.profile_names and prof != self.engine.active:
            self.engine.set_profile(prof)

    # ---- 8.0: family ----
    def kids(self):
        k = self.engine.cfg.get("kids")
        return [x for x in k if isinstance(x, dict) and x.get("id")] if isinstance(k, list) else []

    def set_kid(self, kid_id, announce=False):
        kids = {k["id"]: k for k in self.kids()}
        if kid_id not in kids:
            kid_id = None
        changed = kid_id != self.kid
        self.kid = kid_id
        if kid_id and changed:
            k = kids[kid_id]
            if k.get("profile") in self.engine.profile_names and k["profile"] != self.engine.active:
                self.engine.set_profile(k["profile"], announce=False)
            if announce:
                self.osd(f"Hi {k.get('name', 'there')}!", f"{self.engine.active} is ready", accent=k.get("color") or "#3ec6ff")
        if changed:
            self._changed()

    @staticmethod
    def _in_window(now_min, start, end):
        return start <= now_min < end if start <= end else (now_min >= start or now_min < end)

    def _family_tick(self):
        """Quiet hours (mods off at night) and a friendly daily-time reminder."""
        par = self.engine.cfg.get("parent")
        par = par if isinstance(par, dict) else {}
        q = par.get("quiet") if isinstance(par.get("quiet"), dict) else {}
        quiet = False
        if q.get("enabled"):
            try:
                hm = lambda v: int(str(v).split(":")[0]) * 60 + int(str(v).split(":")[1])
                lt = time.localtime()
                quiet = self._in_window(lt.tm_hour * 60 + lt.tm_min, hm(q.get("from", "21:30")), hm(q.get("to", "07:00")))
            except (ValueError, IndexError):
                quiet = False
            kids_only = q.get("kids")
            if quiet and isinstance(kids_only, list) and kids_only and self.kid is not None and self.kid not in kids_only:
                quiet = False  # only the listed players (and "just playing") get quiet hours
        if quiet and self.engine.enabled:
            self.engine.set_enabled(False)
            self._quiet_off = True
            self.osd("Quiet hours", f"Mods are off until {q.get('to', '07:00')}. Your controller still works.", accent="#7c5cff", secs=5)
        elif not quiet and self._quiet_off:
            self._quiet_off = False
            self.engine.set_enabled(True)
        lim = num(par.get("daily_minutes"), 0)
        if lim > 0:
            day = time.strftime("%Y-%m-%d")
            played = (self.stats.get("days") or {}).get(day, {}).get(self.kid or "_", 0.0)
            if played >= lim * 60 and self._limit_told != (day, self.kid):
                self._limit_told = (day, self.kid)
                self.osd("That's your time for today", f"You've played {int(lim)} minutes. Time to wrap up!", accent="#ffd23f", secs=7)
                self._notify("That's your time for today", f"{int(lim)} minutes played today.")

    LIGHT_MODES = ("auto", "profile", "breathe", "rainbow", "battery", "off")

    def light_color(self, t):
        """The color the controller's light should be right now, or None to leave it alone."""
        eng = self.engine
        ls = eng.cfg.get("lightbar") or {}
        mode = ls.get("mode", "auto")
        speed = clamp(num(ls.get("speed"), 1.0), 0.2, 4.0)
        p = eng.p
        base = _hex(p.get("led") or p.get("color") or "#3ec6ff")
        game = self.vpad.lightbar if self.vpad is not None and getattr(self.vpad, "lightbar", None) else None
        if mode == "off":
            return (0, 0, 0)
        if mode == "auto":  # old behavior: profile LED if it has one, else whatever the game sets
            return _hex(p["led"]) if p.get("led") else (tuple(game) if game else None)
        if mode == "breathe":
            k = 0.18 + 0.82 * (0.5 + 0.5 * math.sin(t * 2 * math.pi * speed / 3.0))
            return tuple(int(c * k) for c in base)
        if mode == "rainbow":
            import colorsys
            r, g, b = colorsys.hsv_to_rgb((t * speed / 6.0) % 1.0, 1.0, 1.0)
            return (int(r * 255), int(g * 255), int(b * 255))
        if mode == "battery":
            return {"full": (40, 220, 90), "max": (40, 220, 90), "wired": (40, 220, 90), "medium": (255, 200, 30),
                    "low": (255, 110, 20), "empty": (255, 30, 30)}.get(self.battery, (60, 150, 255))
        return base  # profile

    def _make_menu_view(self):
        eng = self.engine
        if eng.menu is None:
            return None
        self._menu_n += 1
        hold = (eng.cfg.get("profile_switch") or {}).get("hold") or "guide"
        return {"id": f"m{self._menu_n}", "rows": eng.menu_rows(), "sel": eng.menu["sel"],
                "accent": eng.p.get("color") or "#3ec6ff", "hint": menu_hint(self.pad.name if self.pad else "", hold)}

    def nav_mute(self):
        """While the Clutch window itself is in front, the controller drives the app, so keys and
        mouse movement from mods are held back (otherwise A could press Space on top of clicking)."""
        return bool(self.app_mode and self.auto.watch.own and self.engine.cfg.get("controller_nav", True))

    def _publish(self, raw, out, connected):
        eng = self.engine
        st = {
            "connected": connected, "test_mode": self.test_mode, "app_mode": self.app_mode,
            "controller": self.pad.name if self.pad else None, "backend": self.pad.backend if self.pad else None,
            "profile": eng.active, "profiles": eng.profile_names, "enabled": eng.enabled,
            "output": self.wanted_output(), "virtual_kind": self.vpad.kind if self.vpad else None,
            "battery": self.battery if self.pad else None,
            "has_gyro": bool(getattr(self.pad, "has_gyro", False)) if self.pad else False,
            "players": [{"n": sl.n, "controller": sl.pad.name, "profile": sl.engine.active, "enabled": sl.engine.enabled,
                         "virtual": bool(sl.vpad)} for sl in self.slots],
            "crosshair_on": eng.crosshair_on, "crosshair_visible": self.crosshair_wanted()[0],
            "aiming": "lt" in eng.last_active, "recording": eng.recording is not None,
            "recorded": len(eng.recording or []), "problem": self.problem,
            "overlay_error": self.overlay.error if self.overlay else None,
            "recent_apps": list(self.auto.recent), "warnings": list(self.panel.warnings),
            "config_mtime": self.cfg_mtime, "nav_mute": self.nav_mute(), "front": bool(self.auto.watch.own),
            "kid": self.kid, "quiet": self._quiet_off,
            "online_safe": {"active": self.engine.online_safe, "game": self.online_game},
            "setup_job": self.setup_job or None, "double_input": self.double, "fullscreen_games": sorted(self.fullscreen_seen),
            "update": {k: v for k, v in self.update.items() if k in ("state", "busy", "latest", "newer", "page", "notes", "error", "downloading", "progress", "ready")},
            "pad_key": getattr(self.pad, "key", None) if self.pad else None,
            "pad_caps": {"touch": bool(getattr(self.pad, "has_touch", False)), "trigger_fx": bool(getattr(self.pad, "has_trigger_fx", False)),
                         "gyro": bool(getattr(self.pad, "has_gyro", False)), "light": self.led_ok} if self.pad else None,
            "menu": {"rows": self.menu_view["rows"], "sel": self.menu_view["sel"]} if self.menu_view else None,
            "light": "#%02x%02x%02x" % tuple(self._last_led) if self._last_led and self.led_ok else None,
        }
        if connected and out is not None:
            st["raw"] = {"buttons": sorted(raw.buttons), "lx": raw.lx, "ly": raw.ly, "rx": raw.rx,
                         "ry": raw.ry, "lt": raw.lt, "rt": raw.rt, "taps": dict(self.taps)}
            st["proc"] = dict(eng.last_proc)
            st["gyro"] = [round(eng.last_gyro[0], 1), round(eng.last_gyro[1], 1)]
            st["gyro_raw"] = [raw.gx, raw.gy, raw.gz] if raw.has_gyro else None
            st["pressed"] = sorted(eng.prev_pressed)
            st["out"] = {"buttons": sorted(out.buttons), "keys": sorted(out.keys), "mouse": sorted(out.mouse),
                         "lt": out.lt, "rt": out.rt, "lx": out.lx, "ly": out.ly, "rx": out.rx, "ry": out.ry}
        self.panel.state = st

    def _reload(self, quiet=False):
        try:
            new_cfg = load_config(self.cfg_path)
        except (OSError, json.JSONDecodeError) as e:
            self.log(f"Settings NOT reloaded: {e}")
            return
        self.panel.warnings.clear()
        before = (self.engine.active, self.engine.crosshair_on)
        self.engine.load(new_cfg)
        for sl in self.slots:
            sl.engine.load(new_cfg)
        self.cfg_mtime = os.path.getmtime(self.cfg_path)
        self._last_led = None  # light show re-sends the color
        self._trig_sent = None
        if self.kid is None or self.kid not in {k["id"] for k in self.kids()}:
            self.kid = self.engine.cfg.get("active_kid") if self.engine.cfg.get("active_kid") in {k["id"] for k in self.kids()} else None
        if not quiet:
            self.log("Settings reloaded.")
        if before != (self.engine.active, self.engine.crosshair_on):
            self._changed()

    def _handle_commands(self):
        eng = self.engine
        while True:
            try:
                kind, val = self.panel.commands.get_nowait()
            except queue.Empty:
                return
            if kind == "reload":
                self._reload(quiet=True)
            elif kind == "profile" and val in eng.profile_names and val != eng.active:
                eng.set_profile(val)
            elif kind == "player_profile":
                n, name = val
                for sl in self.slots:
                    if sl.n == n and name in sl.engine.profile_names:
                        sl.engine.set_profile(name)
            elif kind == "enabled":
                eng.set_enabled(val)
            elif kind == "crosshair":
                eng.crosshair_on = not eng.crosshair_on
                eng.events.append(("crosshair", eng.crosshair_on))
            elif kind == "next_profile":
                eng.cycle_profile(int(val or 1))
            elif kind == "kid":
                self.set_kid(val, announce=True)
            elif kind == "test" and self.pad is not None:
                act = (val or {}).get("action")
                if act == "rumble":
                    self.pad.rumble(clamp(num(val.get("lo"), 1), 0, 1), clamp(num(val.get("hi"), 1), 0, 1),
                                    int(clamp(num(val.get("ms"), 600), 50, 3000)))
                elif act == "led" and hasattr(self.pad, "set_led"):
                    self.pad.set_led(str(val.get("color", "#ffffff")))
                    self._led_hold = time.perf_counter() + 3.0  # let the test color show before light shows resume
                    self._last_led = None

    def run(self):
        pg, sdlc = init_pygame()
        if not self.test_mode:
            self.kmo = KeyMouseOut(warn=self.warn)
        raw, out = RawState(), Output()
        self.set_kid(self.engine.cfg.get("active_kid"))
        self.check_updates()
        timer_set = False
        if IS_WINDOWS:
            try:
                ctypes.windll.winmm.timeBeginPeriod(1)
                timer_set = True
            except Exception:
                pass
        last_rumble, last_rumble_t, buzz_until = (0.0, 0.0), 0.0, 0.0
        last_lightbar = None
        next_cfg = next_auto = next_own = next_light = next_fam = next_quiet = next_state = last_test_print = vpad_retry = next_batt = 0.0
        next_stats = last_stats_t = 0.0
        next_stats_save = time.perf_counter() + 60.0
        problem_logged = None
        try:
            while not self.stop_event.is_set():
                eng = self.engine
                period = 1.0 / clamp(num(eng.cfg.get("poll_hz"), 500), 30, 2000)
                t0 = time.perf_counter()
                self._handle_commands()

                # --- housekeeping that runs with or without a controller ---
                if t0 >= next_cfg:
                    next_cfg = t0 + 1.0
                    try:
                        if os.path.getmtime(self.cfg_path) != self.cfg_mtime:
                            self._reload()
                    except OSError:
                        pass
                if t0 >= next_auto:
                    next_auto = t0 + 0.5
                    self.auto.check(eng)
                    self._online_tick()
                    self._double_tick(t0)
                eng.menu_allowed = bool(self.overlay and self.overlay.thread and not self.overlay.error)
                if t0 >= next_fam:
                    next_fam = t0 + 0.25
                    self._apply_triggers()
                    if t0 >= next_quiet:
                        next_quiet = t0 + 5.0
                        self._family_tick()
                        self._fullscreen_tick()
                if self.app_mode and t0 >= next_own:
                    next_own = t0 + 0.02
                    self.auto.watch.refresh_own()

                # --- device hotplug ---
                lost = False
                if self.pending_own and t0 > self.pending_until:
                    self.pending_own = 0  # SDL never announced it (fine, nothing to ignore)
                for ev in pg.event.get():
                    if ev.type == getattr(pg, "JOYDEVICEADDED", -1) and self.pending_own > 0:
                        try:
                            self.own_ids.add(pg.joystick.Joystick(ev.device_index).get_instance_id())
                            self.pending_own -= 1
                        except Exception:
                            pass
                    elif ev.type == getattr(pg, "JOYDEVICEREMOVED", -1):
                        iid = getattr(ev, "instance_id", None)
                        self.own_ids.discard(iid)
                        if self.pad is not None and iid == self.pad.instance_id:
                            lost = True
                        for sl in list(self.slots):
                            if sl.pad.instance_id == iid:
                                self._drop_slot(sl, announce=True)
                if self.pad is not None and (lost or not self.pad.attached()):
                    eng.cancel_menu()
                    eng.events.clear()
                    self.menu_view = None
                    self.log("Controller disconnected. Waiting for it to come back...")
                    self.osd("Controller disconnected", "Plug it back in", accent="#ff6b6b", secs=2.5)
                    self.battery = None
                    self._notify("Controller disconnected", "Plug it back in and Clutch will pick it up.")
                    self._drop()
                    self._changed()
                    self.stop_event.wait(0.5)
                    continue
                if self.pad is None:
                    self.pad = open_pad(pg, sdlc, eng.cfg, exclude=self._used_ids())
                    if self.pad is None:
                        self._publish(raw, None, False)
                        self.stop_event.wait(0.5)
                        pg.event.pump()
                        continue
                    self.log(f"Controller: {self.pad.name}  [{self.pad.backend}]")
                    self._session = 0.0
                    self.stats["sessions"] = self.stats.get("sessions", 0) + 1
                    last_stats_t = 0.0
                    self.osd("Controller connected", self.pad.name, accent="#3ee6a0")
                    next_batt = 0.0
                    self._last_led, self.led_ok, self._trig_sent = None, True, None
                    eng.gyro_bias, eng._gyro_ema, eng._still = (0.0, 0.0, 0.0), (0.0, 0.0, 0.0), 0.0
                    self._remember_pad()
                    self._changed()
                want = self.wanted_output()
                if self.vpad is not None and self.vpad.kind != want:
                    self.vpad.close()   # profile / setting switched Xbox <-> PlayStation
                    self.vpad = None
                    vpad_retry = 0.0
                    self._notify("Controller type changed", f"Games now see a {OUTPUT_LABEL[want]}.")
                if not self.test_mode and self.vpad is None and t0 >= vpad_retry:
                    try:
                        self.vpad = make_virtual_pad(want)
                        self._expect_own(t0)
                        self.problem = None
                        last_lightbar = None
                        self.log(f"Virtual {OUTPUT_LABEL[want]}: connected")
                    except RuntimeError as e:
                        self.problem = str(e)
                        vpad_retry = t0 + 5.0
                        if problem_logged != self.problem:
                            self.log(self.problem)
                            problem_logged = self.problem

                # --- read -> map -> send ---
                self.pad.read(raw)
                self._ov_raw = raw
                if raw.buttons or raw.lt > 0.15 or raw.rt > 0.15 or abs(raw.lx) + abs(raw.ly) + abs(raw.rx) + abs(raw.ry) > 0.5:
                    self._last_input = t0
                if raw.buttons != self._last_btns:  # count presses so quick taps aren't missed by the app
                    for b in raw.buttons - self._last_btns:
                        self.taps[b] = self.taps.get(b, 0) + 1
                    self._last_btns = set(raw.buttons)
                out = eng.step(raw, t0)
                fired = out.rt > 0.5
                if fired and not self._rt_was:  # count trigger pulls (with mods) for Aim Lab
                    self.taps["out_rt"] = self.taps.get("out_rt", 0) + 1
                self._rt_was = fired
                if self.vpad:
                    self.vpad.send(out)
                if self.kmo:
                    self.kmo.apply(self._quiet_out if self.nav_mute() else out)

                changed = False
                for kind, val in eng.events:
                    if kind == "menu":
                        self.menu_view = self._make_menu_view()
                        if val in ("open", "move"):  # a little buzz so it works even if the menu can't be seen
                            buzz_until = t0 + (0.06 if val == "open" else 0.03)
                        continue
                    changed = True
                    if kind == "profile":
                        self.log(f"Profile: {val}")
                        self.osd(f"{val}", "Profile switched")
                        set_title(f"{APP_NAME} - {val}")
                        buzz_until = t0 + 0.15
                        self._last_led = None
                        self._notify("Profile switched", f"Now using {val}")
                    elif kind == "enabled":
                        self.log("Mods ON" if val else "Mods OFF (plain controller)")
                        self.osd("Mods on" if val else "Mods off", None if val else "Your controller works like normal",
                                 accent="#3ec6ff" if val else "#66739c")
                        buzz_until = t0 + (0.15 if val else 0.35)
                        self._notify("Mods on" if val else "Mods off",
                                     "Your mods are active." if val else "Your controller works like normal.")
                    elif kind == "crosshair":
                        self._notify("Crosshair " + ("on" if val else "off"), "Hold Guide + press R3 to flip it.")
                        self.osd("Crosshair " + ("on" if val else "off"))
                eng.events.clear()
                if changed:
                    self._changed()

                # --- rumble passthrough + feedback buzz ---
                if t0 < buzz_until:
                    self.pad.rumble(0.5, 0.5, 160)
                    last_rumble, last_rumble_t = (0.5, 0.5), t0
                elif self.vpad:
                    s = eng.rumble_scale() if eng.enabled else 1.0
                    cur = (round(self.vpad.large * s, 3), round(self.vpad.small * s, 3))
                    if cur != last_rumble or (any(cur) and t0 - last_rumble_t > 0.5):
                        if any(cur):
                            self.pad.rumble(cur[0], cur[1], 1000)
                        else:
                            self.pad.stop_rumble()
                        last_rumble, last_rumble_t = cur, t0
                elif any(last_rumble):
                    self.pad.stop_rumble()
                    last_rumble = (0.0, 0.0)

                # --- controller light: light shows, profile color, or the game's own color in PlayStation mode ---
                if t0 >= next_light and self.led_ok and hasattr(self.pad, "set_led") and t0 >= self._led_hold:
                    next_light = t0 + 0.1
                    col = self.light_color(t0)
                    if col is not None and col != self._last_led:
                        if self.pad.set_led(col) is False:
                            self.led_ok = False  # this controller has no light
                        self._last_led = col

                # --- battery (checked every 30 s, warn once when it gets low) ---
                if t0 >= next_batt:
                    next_batt = t0 + 30.0
                    b = self.pad.battery() if hasattr(self.pad, "battery") else "unknown"
                    if b in ("low", "empty") and self.battery not in ("low", "empty"):
                        self.osd("Controller battery low", "Charge it soon", accent="#ff6b6b", secs=3.5)
                        self._notify("Controller battery low", "Plug it in to charge soon.")
                    self.battery = b

                self._coop(pg, sdlc, t0)

                if t0 >= next_stats:
                    if last_stats_t:
                        self._stats_tick(min(t0 - last_stats_t, 5.0), raw)
                    last_stats_t = t0
                    next_stats = t0 + 1.0
                if t0 >= next_stats_save:
                    next_stats_save = t0 + 60.0
                    self.save_stats()

                if t0 >= next_state:
                    next_state = t0 + (0.015 if t0 < self.panel.fast_until else 0.033)
                    self._publish(raw, out, True)
                if self.test_mode and t0 - last_test_print > 0.1:
                    last_test_print = t0
                    self.log(f"[{eng.active}] {fmt_raw(raw)}\n           {fmt_out(out)}\n")

                spare = period - (time.perf_counter() - t0)
                if spare > 0:
                    time.sleep(spare)
        finally:
            self.save_stats()
            self._drop()
            if timer_set:
                try:
                    ctypes.windll.winmm.timeEndPeriod(1)
                except Exception:
                    pass
            try:
                pg.quit()
            except Exception:
                pass


# --------------------------------------------------------------------------------------
# Default settings (written on first run)
# --------------------------------------------------------------------------------------
DEFAULT_CONFIG_TEXT = r'''// Clutch settings. Easiest way to change them: the Clutch app / control panel.
// Hand-editing is fine too: // comments and trailing commas are allowed. Reference: README.md
{
  "controller_index": 0,
  "controller_name": "",
  "poll_hz": 500,
  "notifications": true,
  "osd": true,
  // What games see: "xbox" (best for PC games) or "playstation" (PS Remote Play / PS Plus on PC).
  // A profile can override this with its own "output".
  "output": "xbox",
  "panel": { "open_browser": true, "port": 8765 },
  "start_profile": "Everyday",

  // Hold Guide (Xbox / PS / Home button) and press:
  //   D-pad right/left = next/previous profile, Back = mods on/off, R3 = crosshair on/off
  // Online-safe mode: while an online game (Fortnite, Call of Duty, Apex...) is in front, turbo, macros,
  // multi-action buttons and recoil pull are paused so they can't get an account banned
  "online_safe": { "enabled": true, "games": [], "offline": [] },
  // Hold Guide for a moment (without pressing anything else) to open the quick menu over your game
  "quick_menu": { "enabled": true, "hold_ms": 450 },
  // Controller light (PlayStation and some others): auto, profile, breathe, rainbow, battery, off
  "lightbar": { "mode": "auto", "speed": 1.0 },
  "profile_switch": { "hold": "guide", "next": "dpad_right", "prev": "dpad_left",
                      "toggle_mods": "back", "toggle_crosshair": "r3" },

  "auto_profiles": {},

  // Keyboard shortcuts that work anywhere, even in a game.
  "hotkeys": { "toggle_mods": "ctrl+alt+m", "toggle_crosshair": "ctrl+alt+c", "next_profile": "ctrl+alt+right", "prev_profile": "ctrl+alt+left" },

  // Couch co-op: up to 4 controllers, each with its own profile.
  "coop": { "enabled": false, "max_players": 4 },

  "crosshair": {
    "enabled": false, "style": "cross", "color": "#3ee6ff", "size": 10, "thickness": 2, "gap": 4,
    "dot": true, "dot_size": 2, "outline": true, "outline_color": "#000000", "outline_width": 1,
    "opacity": 1.0, "show": "always", "offset_x": 0, "offset_y": 0
  },

  "macros": {
    "double_tap_y": { "mode": "once", "steps": [ { "tap": "y" }, { "tap": "y" } ] }
  },

  "profiles": {
    "Everyday": {
      "emoji": "🎮", "color": "#3ec6ff",
      "sticks":   { "left": { "deadzone": 0.08 }, "right": { "deadzone": 0.08 } },
      "triggers": { "left": { "deadzone": 0.03 }, "right": { "deadzone": 0.03 } },
      "rumble": 1.0,
      "led": "#3ec6ff"
    },
    "Shooter": {
      "extends": "Everyday",
      "emoji": "🎯", "color": "#ff5fa2", "led": "#ff2060", "crosshair_on": true,
      "triggers": { "left": { "hair_trigger": true }, "right": { "hair_trigger": true } },
      "sticks": { "right": { "deadzone": 0.06, "curve": 1.6, "anti_deadzone": 0.1, "y_scale": 0.85 } },
      "stick_mods": [ { "id": "ads_slow", "while": ["lt"], "stick": "right", "scale": 0.7 } ]
    },
    "Arcade": {
      "extends": "Everyday",
      "emoji": "🕹️", "color": "#ffd23f", "led": "#ffb000",
      "turbo": { "x": { "rate_hz": 15, "duty": 0.5 } },
      "sticks": { "left": { "output": "none", "button_threshold": 0.5 } },
      "remap": { "ls_up": "dpad_up", "ls_down": "dpad_down", "ls_left": "dpad_left", "ls_right": "dpad_right" }
    },
    "Desktop": {
      "extends": "Everyday",
      "emoji": "🖱️", "color": "#9b8cff", "led": "#ffffff", "rumble": false,
      "sticks": {
        "left":  { "output": "none" },
        "right": { "output": "mouse", "mouse_speed": 1400, "curve": 1.8 }
      },
      "turbo": { "ls_up": 12, "ls_down": 12, "ls_left": 12, "ls_right": 12 },
      "remap": {
        "a": "mouse:left", "x": "mouse:right", "b": "key:esc", "y": "key:enter",
        "rt": "mouse:left", "lt": "mouse:right", "l3": "mouse:middle",
        "ls_up": "mouse:wheel_up", "ls_down": "mouse:wheel_down",
        "ls_left": "mouse:wheel_left", "ls_right": "mouse:wheel_right",
        "lb": "key:ctrl+shift+tab", "rb": "key:ctrl+tab",
        "dpad_up": "key:up", "dpad_down": "key:down", "dpad_left": "key:left", "dpad_right": "key:right",
        "start": "key:win", "back": "key:alt+tab", "r3": "key:f11"
      }
    }
  }
}
'''


def ensure_config(path, recover=False, log=print):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(DEFAULT_CONFIG_TEXT)
        log(f"Created default settings: {path}")
    try:
        return load_config(path)
    except json.JSONDecodeError as e:
        if not recover:
            sys.exit(f"Settings error in {path}, line {e.lineno} col {e.colno}: {e.msg}")
        broken = path + time.strftime(".broken-%Y%m%d-%H%M%S")
        os.replace(path, broken)
        with open(path, "w", encoding="utf-8") as f:
            f.write(DEFAULT_CONFIG_TEXT)
        log(f"Settings file was damaged; saved it as {broken} and started fresh.")
        return load_config(path)


# --------------------------------------------------------------------------------------
# Display helpers
# --------------------------------------------------------------------------------------
def fmt_raw(raw):
    b = " ".join(sorted(raw.buttons)) or "-"
    return (f"IN  btn[{b}] LS({raw.lx:+.2f},{raw.ly:+.2f}) RS({raw.rx:+.2f},{raw.ry:+.2f}) "
            f"LT {raw.lt:.2f} RT {raw.rt:.2f}")


def fmt_out(out):
    parts = [f"btn[{' '.join(sorted(out.buttons)) or '-'}]",
             f"LS({out.lx:+.2f},{out.ly:+.2f}) RS({out.rx:+.2f},{out.ry:+.2f})",
             f"LT {out.lt:.2f} RT {out.rt:.2f}"]
    if out.keys:
        parts.append("keys[" + " ".join(sorted(out.keys)) + "]")
    if out.mouse:
        parts.append("mouse[" + " ".join(sorted(out.mouse)) + "]")
    if out.mouse_dx or out.mouse_dy:
        parts.append(f"move({out.mouse_dx},{out.mouse_dy})")
    return "OUT " + " ".join(parts)


def set_title(text):
    if IS_WINDOWS and not FROZEN:
        try:
            ctypes.windll.kernel32.SetConsoleTitleW(text)
        except Exception:
            pass


# --------------------------------------------------------------------------------------
# Command line entry point (the desktop app lives in app.py)
# --------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=f"{APP_NAME} - controller remapping & modding (command line)")
    ap.add_argument("--config", default=None, help="path to settings file (.jsonc)")
    ap.add_argument("--profile", help="profile to start in")
    ap.add_argument("--list", action="store_true", help="list detected controllers and exit")
    ap.add_argument("--version", action="version", version=VERSION)
    ap.add_argument("--hidhide-setup", metavar="JOB", help=argparse.SUPPRESS)
    ap.add_argument("--test", action="store_true",
                    help="show live input and mapped output without creating a virtual controller")
    ap.add_argument("--no-panel", action="store_true", help="don't start the browser control panel")
    ap.add_argument("--no-crosshair", action="store_true", help="don't start the crosshair overlay")
    args = ap.parse_args()
    if args.hidhide_setup:  # started elevated by the app's one-click HidHide setup
        hidhide_setup_job(args.hidhide_setup)
        return

    set_dpi_aware()
    cfg_path = os.path.abspath(args.config) if args.config else default_config_path()
    if args.list:
        ensure_config(cfg_path)
        pg, sdlc = init_pygame()
        pg.event.pump()
        time.sleep(0.3)
        pg.event.pump()
        pads = list_pads(pg, sdlc)
        if not pads:
            print("No controllers detected.")
        for i, name, is_gc, _iid in pads:
            print(f"  [{i}] {name}  ({'game controller' if is_gc else 'raw joystick'})")
        return

    print(f"{APP_NAME} v{VERSION}  |  settings: {cfg_path}")
    runner = ModRunner(cfg_path, args.profile, test_mode=args.test)
    if not args.no_panel:
        runner.start_panel()
    if not args.no_crosshair:
        runner.overlay = CrosshairOverlay(runner)
        runner.overlay.start()
    print("Press Ctrl+C to quit.\n")
    try:
        runner.run()
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        if runner.overlay:
            runner.overlay.stop()
        runner.panel.stop()


if __name__ == "__main__":
    main()
