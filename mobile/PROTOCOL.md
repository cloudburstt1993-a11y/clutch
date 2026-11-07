# Clutch box Bluetooth protocol (v1)

How the Clutch phone app talks to the Clutch console box (Pico 2 W / Pico W) over Bluetooth Low Energy.
The app's demo box (`www/js/demobox.js`) implements the box side of this exactly, so the app can be
built and tested before the firmware exists.

## GATT

| What | UUID | Properties |
| --- | --- | --- |
| Clutch service | `c1a7c000-5a1e-4b7e-9c2d-0b5e7c1a7c00` | primary, advertised |
| RX (phone → box) | `c1a7c001-5a1e-4b7e-9c2d-0b5e7c1a7c00` | write, write without response |
| TX (box → phone) | `c1a7c002-5a1e-4b7e-9c2d-0b5e7c1a7c00` | notify |

The box advertises the service UUID and a name like `Clutch-7F3A` (last 4 hex digits of its MAC).

## Framing

Every message is one JSON object, UTF-8, followed by a newline (`\n`). JSON never contains a raw
newline, so the receiver buffers bytes and splits on `\n`.

A message bigger than one packet is split into chunks of at most **180 bytes** (fits the default
Android/iOS MTU after negotiation; the box should request MTU 247). Chunks are written in order with
write-with-response, so they arrive in order. The box sends notifications the same way.

## Phone → box

Every request may carry `"id"` (a number). The box echoes it in the reply so the app can match them.

| op | fields | reply |
| --- | --- | --- |
| `hello` | `app` (app version) | `hello` event |
| `get_config` | | `config` event |
| `get_state` | | `state` event |
| `set_config` | `config` (whole config object, see below) | `ok` or `error` |
| `set_profile` | `name` | `ok`, then a `state` event |
| `mods` | `on` (bool) | `ok`, then a `state` event |
| `live` | `on` (bool) | `ok`; while on, `live` events about 20 times a second |
| `rename` | `name` (1–20 chars) | `ok` (new name is used after the next restart) |
| `console` | `mode`: `auto`, `xbox`, `playstation`, `switch`, `pc` | `ok`, then `state` |
| `ping` | | `pong` |

## Box → phone

| ev | fields |
| --- | --- |
| `hello` | `proto` (1), `fw` (firmware version), `name`, `model` (`pico2w`, `picow`, `demo`), `features` (list, see below) |
| `config` | `config` |
| `state` | `profile`, `mods` (bool), `controller` (name or null), `console` (mode in use), `online_safe` (bool), `battery` (optional) |
| `live` | `b` (list of buttons held), `lx ly rx ry` (-1..1), `lt rt` (0..1), `out` (same shape, after mods) |
| `ok` | `op`, `id` |
| `error` | `op`, `id`, `message` (short, kid-friendly) |
| `pong` | |

`features` lets the app hide what this box can't do yet, e.g. `["remap","sticks","triggers","turbo","stick_mods","macros","shift"]`.
Power-ups that need anything outside the list are not shown.

## Config object

Same profile format as Clutch for PC (`config.jsonc`), minus the PC-only parts, so the engine
can be ported 1:1:

```json
{
  "active_profile": "Fortnite",
  "profiles": { "Everyday": { ... }, "Fortnite": { "extends": "Everyday", "pack": "fortnite", ... } },
  "online_safe": { "enabled": true },
  "parent": { "pin": "<sha-256 hex of the PIN>", "hide_risky": false },
  "console": "auto"
}
```

The box must:
- save the config in flash and keep using it with no phone around;
- apply `extends` the same way the PC engine does (deep merge, child wins);
- when `online_safe.enabled` is true, run profiles through the same filter as `online_safe_profile()`
  in `clutch.py` (no turbo, macros, macro remaps, multi-target remaps, or stick mods with
  `add_x`/`add_y`/`wiggle`). A console box can't tell online from offline games, so ban-risk
  power-ups only run when a parent switches online-safe mode off;
- ignore keys it doesn't know.

Ask for `get_config` after connecting; keep the app's copy as the source of truth and send the whole
config back with `set_config` after each change (configs are a few KB).
