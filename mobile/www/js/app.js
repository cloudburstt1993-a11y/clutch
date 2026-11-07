"use strict";
/* Clutch phone app: connects to a Clutch console box (or the demo box) and edits its profiles.
   Power-ups and game packs come from the PC app (catalog.gen.js), filtered to what a box can run. */
const APP_VERSION = "0.1.0";
const PC_LINK = "https://github.com/cloudburstt1993-a11y/clutch/releases/latest";
const L = window.ClutchLink;
const $ = s => document.querySelector(s);

/* ---------------------------------------------------------------- tiny DOM helper */
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})){
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const emo = e => h("span", {class:"emo", "aria-hidden":"true"}, e);
function swtch(on, onchange, label){
  const b = h("button", {class:"sw", role:"switch", "aria-checked":String(!!on), "aria-label":label, type:"button"});
  b.addEventListener("click", e => { e.stopPropagation(); const nv = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", String(nv)); onchange(nv); });
  return b;
}
const store = (k, v) => { try { localStorage.setItem("clutch_" + k, JSON.stringify(v)); } catch (e){} };
const recall = (k, d) => { try { const v = localStorage.getItem("clutch_" + k); return v == null ? d : JSON.parse(v); } catch (e){ return d; } };

/* names that depend on the console the box is talking to */
const PS_NAME = {a:"Cross", b:"Circle", x:"Square", y:"Triangle", lb:"L1", rb:"R1", lt:"L2", rt:"R2", back:"Share", start:"Options", guide:"PS", l3:"L3", r3:"R3"};
const NS_NAME = {a:"B", b:"A", x:"Y", y:"X", lb:"L", rb:"R", lt:"ZL", rt:"ZR", back:"Minus", start:"Plus", guide:"Home", l3:"L-stick", r3:"R-stick"};
const consoleMode = () => (STATE && STATE.console) || "xbox";
const outName = b => (consoleMode() === "playstation" && PS_NAME[b]) || (consoleMode() === "switch" && NS_NAME[b]) || SHORT[b] || b;
function curKid(){ return null; }

/* ---------------------------------------------------------------- app state */
let link = null, BOX = null, view = "home", connecting = null, connErr = "", lost = false;
let LIVE = null, liveOn = false, profFilter = "all", packCat = "", packQ = "";

function normalize(c){
  c = (c && typeof c === "object") ? c : {};
  if (!c.profiles || typeof c.profiles !== "object" || !Object.keys(c.profiles).length) c.profiles = {Everyday:{emoji:"🎮", color:"#3ec6ff"}};
  if (!c.profiles[c.active_profile]) c.active_profile = Object.keys(c.profiles)[0];
  c.online_safe = Object.assign({enabled:true}, c.online_safe || {});
  c.parent = c.parent || {};
  c.console = c.console || "auto";
  return c;
}
const onlineSafe = () => !CFG.online_safe || CFG.online_safe.enabled !== false;
const profNames = () => Object.keys(CFG.profiles);
const pEmoji = n => resolve(n).emoji || "🎮";
const pColor = n => resolve(n).color || "#3ec6ff";
function uniqueName(base){ let n = base, i = 2; while (CFG.profiles[n]) n = `${base} ${i++}`; return n; }

/* ---------------------------------------------------------------- saving to the box */
let saving = null;
function changed(){
  clearTimeout(changed.t);
  changed.t = setTimeout(async () => {
    if (!link) return;
    try { saving = link.request("set_config", {config: CFG}); await saving; }
    catch (e){ toast("⚠️ " + e.message); }
    finally { saving = null; }
  }, 350);
}
async function send(op, fields){
  if (!link) return;
  try { return await link.request(op, fields); } catch (e){ toast("⚠️ " + e.message); throw e; }
}

/* ---------------------------------------------------------------- toast + sheets */
function toast(msg, undoSnap){
  const t = $("#toast");
  t.replaceChildren(h("span", {}, msg));
  if (undoSnap) t.append(h("button", {class:"btn small cyan", onclick: () => { CFG = JSON.parse(undoSnap); changed(); renderAll(); t.classList.remove("show"); toast("↩️ Undone"); }}, "Undo"));
  t.classList.add("show"); clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), undoSnap ? 4500 : 2600);
}
const snap = () => JSON.stringify(CFG);
let sheetDone = null;
function openSheet(...kids){
  const s = $("#sheet");
  s.replaceChildren(h("div", {class:"grab"}), ...kids);
  $("#sheetWrap").hidden = false;
  const f = s.querySelector("input,select,button.primary"); if (f) setTimeout(() => f.focus(), 60);
  return new Promise(r => { sheetDone = r; });
}
function closeSheet(v){ $("#sheetWrap").hidden = true; const d = sheetDone; sheetDone = null; if (d) d(v); }
$("#sheetBg").addEventListener("click", () => closeSheet(null));
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheetWrap").hidden) closeSheet(null); });
function confirmSheet(title, text, yes, danger){
  return openSheet(h("h2", {}, title), h("p", {class:"muted", style:"margin:10px 0 20px"}, text),
    h("div", {class:"stack"}, h("button", {class:"btn block " + (danger ? "" : "primary"), style: danger ? "background:var(--red);border-color:var(--red);color:#2a0000" : "", onclick: () => closeSheet(true)}, yes),
      h("button", {class:"btn block ghost", onclick: () => closeSheet(false)}, "Cancel")));
}
function askText(title, text, value, placeholder, okLabel){
  const inp = h("input", {type:"text", value: value || "", placeholder: placeholder || "", maxlength:"24", "aria-label":title});
  inp.addEventListener("keydown", e => { if (e.key === "Enter") closeSheet(inp.value.trim()); });
  return openSheet(h("h2", {}, title), text ? h("p", {class:"muted", style:"margin:8px 0 0"}, text) : null,
    h("div", {style:"margin:16px 0"}, inp),
    h("div", {class:"stack"}, h("button", {class:"btn block primary", onclick: () => closeSheet(inp.value.trim())}, okLabel || "Save"),
      h("button", {class:"btn block ghost", onclick: () => closeSheet(null)}, "Cancel")));
}
async function sha(s){
  if (crypto && crypto.subtle){ const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join(""); }
  let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0; return "x" + x;
}
function askPin(title){
  const inp = h("input", {type:"password", inputmode:"numeric", pattern:"[0-9]*", maxlength:"8", autocomplete:"off", "aria-label":"PIN", style:"font-size:28px;letter-spacing:.3em;text-align:center"});
  inp.addEventListener("keydown", e => { if (e.key === "Enter") closeSheet(inp.value.trim()); });
  return openSheet(h("h2", {}, title), h("div", {style:"margin:16px 0"}, inp),
    h("div", {class:"stack"}, h("button", {class:"btn block primary", onclick: () => closeSheet(inp.value.trim())}, "OK"),
      h("button", {class:"btn block ghost", onclick: () => closeSheet(null)}, "Cancel")));
}
async function parentOk(){
  if (!CFG.parent.pin) return true;
  const pin = await askPin("Parent PIN");
  if (!pin) return false;
  if (await sha(pin) !== CFG.parent.pin){ toast("That PIN isn't right"); return false; }
  return true;
}

/* ---------------------------------------------------------------- connecting */
async function connect(kind, deviceId){
  connecting = kind; connErr = ""; renderAll();
  const l = L.makeLink(kind);
  try {
    const dev = await l.connect(deviceId);
    const hello = await l.request("hello", {app: APP_VERSION});
    const conf = await l.request("get_config");
    const st = await l.request("get_state");
    l.on(onMsg);
    link = l; BOX = hello; CFG = normalize(conf.config); STATE = st; lost = false;
    store("last", {kind, id: dev.id, name: hello.name});
    connecting = null; view = "home"; renderAll();
    toast(kind === "demo" ? "🧪 Demo box connected" : `✅ Connected to ${hello.name}`);
  } catch (e){
    connecting = null; connErr = e.message || String(e); renderAll();
    try { await l.disconnect(); } catch (_){}
  }
}
function onMsg(m){
  if (m.ev === "state"){ const p = STATE && STATE.profile; STATE = Object.assign({}, m); delete STATE.id; if (view === "home" || p !== STATE.profile) renderAll(); else renderTop(); }
  else if (m.ev === "live"){ LIVE = m; drawLive(); }
  else if (m.ev === "_disconnected" && m.reason !== "user"){
    link = null; liveOn = false; lost = true; renderAll(); toast("🔌 Lost the connection to your box");
  }
}
async function disconnect(){ const l = link; link = null; STATE = null; liveOn = false; if (l) await l.disconnect(); renderAll(); }

/* ---------------------------------------------------------------- navigation */
const TABS = [["home","🏠","Home"],["profiles","🎮","Profiles"],["packs","🧩","Game packs"],["test","🕹️","Test"],["more","⚙️","More"]];
function go(v, opts){
  view = v;
  if (opts && opts.profile) curProfile = opts.profile;
  renderAll(); window.scrollTo(0, 0);
}
function renderTabs(){
  const nav = $("#tabs");
  nav.hidden = !link;
  if (!link) return;
  const cur = view === "profile" ? "profiles" : view;
  nav.replaceChildren(...TABS.map(([id, e, label]) =>
    h("button", {class:"tab", "aria-current": cur === id ? "page" : null, onclick: () => go(id)}, emo(e), label)));
}
function renderAll(){
  const app = $("#app");
  const v = h("div", {class:"wrap"});
  if (!link) renderConnect(v);
  else ({home:renderHome, profiles:renderProfiles, profile:renderProfile, packs:renderPacks, test:renderTest, more:renderMore}[view] || renderHome)(v);
  app.replaceChildren(v);
  renderTabs();
  syncLive();
}
function topBar(){
  const demo = link && link.kind === "demo";
  return h("div", {class:"top", id:"top"},
    h("img", {src:"icon.png", alt:""}),
    h("div", {class:"who"}, h("b", {}, BOX ? BOX.name : "Clutch"),
      h("span", {class:"help"}, h("span", {class:"dot" + (demo ? " demo" : "")}), demo ? "Demo box" : "Connected",
        STATE && STATE.controller ? ` with ${STATE.controller}` : "")));
}
function renderTop(){ const t = $("#top"); if (t) t.replaceWith(topBar()); }

/* ---------------------------------------------------------------- connect screen */
function renderConnect(v){
  const last = recall("last", null);
  const can = L.bleAvailable();
  v.append(h("div", {class:"hero"},
    h("img", {src:"icon.png", alt:""}),
    h("h1", {}, "Clutch"),
    h("p", {class:"muted", style:"margin-top:8px"}, lost ? "Lost the connection to your box." : "Connect to your Clutch box to set up your mods.")));
  v.append(h("div", {class:"steps"},
    h("div", {class:"step"}, h("span", {class:"n"}, "1"), h("span", {}, "Plug your Clutch box into the console, and your controller into the box.")),
    h("div", {class:"step"}, h("span", {class:"n"}, "2"), h("span", {}, "Turn on Bluetooth on this phone.")),
    h("div", {class:"step"}, h("span", {class:"n"}, "3"), h("span", {}, "Tap Find my box and pick your Clutch from the list."))));
  if (connErr) v.append(h("div", {class:"banner bad", style:"margin-bottom:14px"}, connErr));
  if (!can) v.append(h("div", {class:"banner info", style:"margin-bottom:14px"}, "This browser can't use Bluetooth. Use the Clutch app on Android, or Chrome on Android or a computer. You can still try the demo box."));
  const busy = k => connecting === k ? [h("span", {class:"spin"}), " Connecting…"] : null;
  const stack = h("div", {class:"stack"});
  if (last && last.kind === "ble" && can && L.platform() !== "web")
    stack.append(h("button", {class:"btn block primary", disabled: !!connecting, onclick: () => connect("ble", last.id)}, busy("ble") || `Reconnect to ${last.name || "my box"}`));
  stack.append(
    h("button", {class:"btn block " + (last && last.kind === "ble" && L.platform() !== "web" ? "" : "primary"), disabled: !!connecting || !can, onclick: () => connect("ble")},
      (busy("ble") && !(last && last.kind === "ble")) || [emo("📡"), " Find my box"]),
    h("button", {class:"btn block ghost", disabled: !!connecting, onclick: () => connect("demo")}, busy("demo") || [emo("🧪"), " Try the demo box"]));
  v.append(stack);
  v.append(h("p", {class:"help", style:"margin-top:22px;text-align:center"}, "No box yet? The demo box works just like the real one, so you can set up your profiles now."));
}

/* ---------------------------------------------------------------- home */
function renderHome(v){
  v.append(topBar());
  const demo = link.kind === "demo";
  if (demo) v.append(h("div", {class:"banner info", style:"margin-bottom:14px"}, "🧪 This is the demo box. Everything works, but nothing goes to a real console. Your profiles stay on this phone."));
  const on = !STATE || STATE.mods !== false;
  v.append(h("button", {class:"power" + (on ? " on" : ""), onclick: async () => { try { await send("mods", {on: !on}); } catch (e){} }},
    h("div", {class:"grow", style:"flex:1"}, h("div", {class:"big"}, on ? h("span", {class:"grad"}, "Mods on") : "Mods off"),
      h("div", {class:"help", style:"margin-top:4px"}, on ? "Your power-ups are working." : "Your controller works like normal, with no mods.")),
    h("span", {class:"sw", role:"switch", "aria-checked":String(on), "aria-label":"Mods"})));
  if (!onlineSafe()) v.append(h("div", {class:"banner", style:"margin-top:14px"}, "⚠️ Online-safe mode is off, so ban-risk power-ups like rapid fire run in every game, online too."));
  if (STATE && !STATE.controller && !demo) v.append(h("div", {class:"banner info", style:"margin-top:14px"}, "🔌 No controller yet. Plug your controller into the Clutch box."));
  v.append(h("div", {class:"section"}, h("h2", {}, "Playing with"), h("button", {class:"linkbtn", onclick: () => go("profiles")}, "Edit")));
  const active = STATE ? STATE.profile : CFG.active_profile;
  v.append(h("div", {class:"plist"}, profNames().map(n => {
    const isOn = n === active;
    return h("button", {class:"prof" + (isOn ? " on" : ""), style:`--pc:${pColor(n)}`, "aria-pressed":String(isOn),
      onclick: async () => { if (isOn) return go("profile", {profile:n}); CFG.active_profile = n; try { await send("set_profile", {name:n}); toast(`${pEmoji(n)} Now playing with ${n}`); } catch (e){} }},
      h("span", {class:"badge"}, emo(pEmoji(n))),
      h("span", {class:"grow"}, h("span", {class:"title"}, n), h("span", {class:"help", style:"display:block"}, puSummary(n))),
      isOn ? h("span", {class:"tag"}, "Playing") : null);
  })));
  v.append(h("div", {class:"stack", style:"margin-top:14px"},
    h("button", {class:"btn block", onclick: () => go("packs")}, emo("🧩"), " Add a game pack"),
    h("button", {class:"btn block", onclick: () => go("test")}, emo("🕹️"), " Test my controller")));
}
function puSummary(n){
  puProfile = n;
  const on = POWERUPS.filter(pu => CONSOLE_PU.has(pu.id) && puOn(pu, resolve(n)));
  const pk = resolve(n).pack && PACKS.find(p => p.id === resolve(n).pack);
  const bits = [];
  if (pk) bits.push(pk.name + " pack");
  if (on.length) bits.push(on.length === 1 ? on[0].title : `${on.length} power-ups`);
  return bits.join(", ") || "No power-ups yet";
}

/* ---------------------------------------------------------------- profiles */
function renderProfiles(v){
  v.append(h("div", {class:"section", style:"margin-top:6px"}, h("h1", {}, "Profiles")));
  v.append(h("p", {class:"muted", style:"margin-bottom:14px"}, "Each profile is a set of mods. Make one for each game, or for each kid."));
  const active = STATE ? STATE.profile : CFG.active_profile;
  v.append(h("div", {class:"plist"}, profNames().map(n =>
    h("button", {class:"prof" + (n === active ? " on" : ""), style:`--pc:${pColor(n)}`, onclick: () => go("profile", {profile:n})},
      h("span", {class:"badge"}, emo(pEmoji(n))),
      h("span", {class:"grow"}, h("span", {class:"title"}, n), h("span", {class:"help", style:"display:block"}, puSummary(n))),
      n === active ? h("span", {class:"tag"}, "Playing") : h("span", {class:"muted"}, "›")))));
  v.append(h("div", {class:"stack", style:"margin-top:14px"},
    h("button", {class:"btn block primary", onclick: newProfile}, "＋ New profile"),
    h("button", {class:"btn block", onclick: () => go("packs")}, emo("🧩"), " Start from a game pack")));
}
const EMOJIS = ["🎮","🎯","🏎️","⚽","🧱","🐉","🚀","👾","🔥","⭐","🦊","🐸"];
async function newProfile(){
  const name = await askText("New profile", "Give it a name, like a game or who it's for.", "", "Name", "Make it");
  if (!name) return;
  if (CFG.profiles[name]){ toast("There's already a profile called that"); return; }
  const before = snap();
  CFG.profiles[name] = Object.assign(CFG.profiles.Everyday && name !== "Everyday" ? {extends:"Everyday"} : {}, {emoji: EMOJIS[profNames().length % EMOJIS.length]});
  changed(); toast(`${CFG.profiles[name].emoji} Made ${name}`, before); go("profile", {profile:name});
}

const CATS = () => PU_CATS.filter(c => POWERUPS.some(pu => pu.cat === c && CONSOLE_PU.has(pu.id)));
function renderProfile(v){
  const n = curProfile;
  if (!n || !CFG.profiles[n]){ go("profiles"); return; }
  puProfile = n;
  const r = resolve(n), active = (STATE ? STATE.profile : CFG.active_profile) === n;
  v.append(h("button", {class:"linkbtn", onclick: () => go("profiles")}, "‹ Profiles"));
  v.append(h("div", {class:"row", style:"margin:8px 0 14px"},
    h("button", {class:"badge", style:"width:64px;height:64px;font-size:36px;border:0", "aria-label":"Change icon", onclick: () => pickEmoji(n)}, emo(pEmoji(n))),
    h("div", {class:"grow"}, h("h1", {style:"font-size:36px;overflow-wrap:anywhere"}, n),
      r.pack ? h("span", {class:"help"}, "From the " + ((PACKS.find(p => p.id === r.pack) || {}).name || r.pack) + " pack") : null)));
  v.append(h("div", {class:"row", style:"gap:8px;flex-wrap:wrap"},
    active ? h("span", {class:"btn small", style:"background:var(--cyan);color:#032433;border-color:var(--cyan)"}, "✓ Playing now")
      : h("button", {class:"btn small primary", onclick: async () => { CFG.active_profile = n; try { await send("set_profile", {name:n}); toast(`${pEmoji(n)} Now playing with ${n}`); renderAll(); } catch (e){} }}, "Play with this"),
    h("button", {class:"btn small", onclick: () => renameProfile(n)}, "Rename"),
    profNames().length > 1 ? h("button", {class:"btn small ghost", onclick: () => deleteProfile(n)}, "Delete") : null));
  if (onlineSafe()) v.append(h("p", {class:"help", style:"margin-top:14px"}, "🛡️ Online-safe mode is on, so power-ups marked ⚠️ stay paused. A parent can change that in More."));
  v.append(h("div", {class:"section"}, h("h2", {}, "Power-ups")));
  v.append(h("div", {class:"chips"}, [["all","All"],["on","✅ Turned on"], ...CATS().map(c => [c, c])].map(([k, l]) =>
    h("button", {class:"chip", "aria-pressed":String(profFilter === k), onclick: () => { profFilter = k; renderAll(); }}, l))));
  const list = POWERUPS.filter(pu => CONSOLE_PU.has(pu.id) && !(pu.risk && hideRisky()))
    .filter(pu => profFilter === "all" || (profFilter === "on" ? puOn(pu, r) : pu.cat === profFilter))
    .sort((a, b) => PU_CATS.indexOf(a.cat) - PU_CATS.indexOf(b.cat) || (a.risk ? 1 : 0) - (b.risk ? 1 : 0));
  if (!list.length) v.append(h("div", {class:"banner info"}, profFilter === "on" ? "Nothing's switched on yet. Pick a power-up from All." : "Nothing here."));
  v.append(h("div", {class:"stack"}, list.map(pu => puCard(pu, r))));
  if (hideRisky()) v.append(h("p", {class:"help", style:"margin-top:16px"}, "🔒 Ban-risk power-ups are hidden by a parent setting."));
}
function puCard(pu, r){
  const cur = puOn(pu, r), on = !!cur;
  const card = h("div", {class:"pu" + (on ? " on" : "")});
  card.append(h("div", {class:"row", style:"align-items:flex-start"},
    h("span", {class:"badge"}, emo(pu.emoji)),
    h("div", {class:"txt"}, h("span", {class:"title"}, pu.title), h("p", {}, pu.text),
      pu.risk ? h("span", {class:"risk"}, onlineSafe() ? "⚠️ Paused: online-safe mode is on" : "⚠️ Can get you banned online") : null),
    swtch(on, nv => {
      const before = snap();
      if (nv){ applyPU(pu); toast(`${pu.emoji} ${pu.title} is on`, before); } else { pu.remove(); toast(`${pu.title} is off`, before); }
      changed(); renderAll();
    }, pu.title)));
  if (on && pu.params && pu.params.length){
    const box = h("div", {class:"params"});
    const vals = Object.assign(puDefaults(pu), cur);
    for (const pr of pu.params){
      const update = nv => { vals[pr.key] = nv; pu.remove(); pu.apply(vals); changed(); };
      if (pr.type === "range"){
        const out = h("output", {}, pr.fmt ? pr.fmt(vals[pr.key]) : vals[pr.key]);
        const rg = h("input", {type:"range", min:pr.min, max:pr.max, step:pr.step, value: vals[pr.key], "aria-label":pr.label});
        rg.addEventListener("input", () => { out.textContent = pr.fmt ? pr.fmt(+rg.value) : rg.value; update(+rg.value); });
        box.append(h("div", {class:"prm"}, h("label", {}, h("span", {}, pr.label), out), rg));
      } else {
        const opts = (typeof pr.opts === "function" ? pr.opts() : pr.opts) || [];
        const s = h("select", {"aria-label":pr.label}, opts.map(([k, l]) => h("option", {value:k}, l)));
        s.value = String(vals[pr.key]);
        s.addEventListener("change", () => { update(s.value); renderAll(); });
        box.append(h("div", {class:"prm"}, h("label", {}, h("span", {}, pr.label)), s));
      }
    }
    card.append(box);
  }
  return card;
}
async function pickEmoji(n){
  const pick = await openSheet(h("h2", {}, "Pick an icon"),
    h("div", {style:"display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:16px 0"},
      EMOJIS.map(e => h("button", {class:"btn", style:"font-size:26px;padding:8px", onclick: () => closeSheet(e)}, emo(e)))),
    h("button", {class:"btn block ghost", onclick: () => closeSheet(null)}, "Cancel"));
  if (!pick) return;
  CFG.profiles[n].emoji = pick; changed(); renderAll();
}
async function renameProfile(n){
  const name = await askText("Rename profile", null, n, "Name", "Rename");
  if (!name || name === n) return;
  if (CFG.profiles[name]){ toast("There's already a profile called that"); return; }
  const before = snap();
  const ps = {};
  for (const [k, p] of Object.entries(CFG.profiles)){ if (p.extends === n) p.extends = name; ps[k === n ? name : k] = p; }
  CFG.profiles = ps;
  if (CFG.active_profile === n) CFG.active_profile = name;
  if (STATE && STATE.profile === n) STATE.profile = name;
  curProfile = name; changed(); toast(`Renamed to ${name}`, before); renderAll();
}
async function deleteProfile(n){
  if (!(await confirmSheet(`Delete ${n}?`, "Its power-ups go with it. You can undo right after.", "Delete", true))) return;
  const before = snap(), gone = CFG.profiles[n];
  for (const p of Object.values(CFG.profiles)) if (p.extends === n){ if (gone.extends) p.extends = gone.extends; else delete p.extends; }
  delete CFG.profiles[n];
  if (CFG.active_profile === n || (STATE && STATE.profile === n)){
    CFG.active_profile = profNames()[0];
    try { await send("set_profile", {name: CFG.active_profile}); } catch (e){}
  }
  changed(); toast(`Deleted ${n}`, before); go("profiles");
}

/* ---------------------------------------------------------------- game packs */
const boxPacks = () => PACKS.filter(pk => CONSOLE_PACKS.has(pk.id));
const packProfile = id => profNames().find(n => CFG.profiles[n].pack === id);
function addPack(pk){
  const have = packProfile(pk.id); if (have) return have;
  const name = uniqueName(pk.name);
  CFG.profiles[name] = Object.assign(CFG.profiles.Everyday ? {extends:"Everyday"} : {}, {emoji:pk.emoji, color:pk.color, pack:pk.id}, pk.make());
  return name;
}
function renderPacks(v){
  v.append(h("div", {class:"section", style:"margin-top:6px"}, h("h1", {}, "Game packs")));
  v.append(h("p", {class:"muted", style:"margin-bottom:12px"}, "Ready-made setups for popular games. Add one and it's done."));
  const cats = PACK_CATS.filter(c => boxPacks().some(p => p.cat === c));
  v.append(h("div", {class:"chips"}, ["", ...cats].map(c =>
    h("button", {class:"chip", "aria-pressed":String(packCat === c), onclick: () => { packCat = c; renderAll(); }}, c || `All ${boxPacks().length}`))));
  const q = h("input", {type:"search", placeholder:"🔎 Search games", value: packQ, "aria-label":"Search games", style:"margin:4px 0 14px"});
  q.addEventListener("input", () => { packQ = q.value.trim().toLowerCase(); drawPacks(list); });
  const list = h("div", {class:"stack"});
  v.append(q, list);
  drawPacks(list);
}
function drawPacks(list){
  const shown = boxPacks().filter(pk => (!packCat || pk.cat === packCat) && (!packQ || (pk.name + " " + pk.text).toLowerCase().includes(packQ)));
  list.replaceChildren(...(shown.length ? shown.map(pk => {
    const have = packProfile(pk.id);
    return h("div", {class:"pack", style:`--pc:${pk.color}`},
      h("div", {class:"row"}, h("span", {class:"badge"}, emo(pk.emoji)), h("div", {class:"grow"}, h("span", {class:"title"}, pk.name), h("span", {class:"help", style:"display:block"}, pk.cat))),
      h("p", {class:"muted", style:"margin-top:10px;font-size:15px"}, pk.text),
      h("ul", {}, (pk.bullets || []).map(b => h("li", {}, b))),
      h("div", {class:"foot"}, have
        ? [h("button", {class:"btn small", onclick: () => go("profile", {profile:have})}, "Open " + have)]
        : h("button", {class:"btn small primary", onclick: () => { const before = snap(); const n = addPack(pk); changed(); toast(`${pk.emoji} Added ${n}`, before); go("profile", {profile:n}); }}, "Add this pack")));
  }) : [h("div", {class:"banner info"}, "No packs match that. Try another word, or use the Any shooter pack.")]));
}

/* ---------------------------------------------------------------- live test */
function syncLive(){
  const want = !!link && view === "test";
  if (want === liveOn) return;
  liveOn = want; LIVE = null;
  if (link) link.request("live", {on: want}).catch(() => {});
}
const BTN_LIST = ["a","b","x","y","lb","rb","back","start","l3","r3","dpad_up","dpad_down","dpad_left","dpad_right"];
function renderTest(v){
  v.append(h("div", {class:"section", style:"margin-top:6px"}, h("h1", {}, "Test")));
  v.append(h("p", {class:"muted", style:"margin-bottom:14px"}, "Press buttons and move the sticks. The grey dot is your controller, the blue dot is what the console gets after your mods."));
  const stick = id => h("div", {}, h("div", {class:"stick", id}, h("i", {class:"raw"}), h("i", {class:"out"})), h("p", {class:"help", style:"text-align:center;margin-top:6px"}, id === "ls" ? "Left stick" : "Right stick"));
  v.append(h("div", {class:"card"},
    h("div", {class:"pad"}, stick("ls"), stick("rs")),
    h("div", {class:"pad", style:"margin-top:14px"},
      h("div", {}, h("p", {class:"help"}, outName("lt")), h("div", {class:"trig", id:"lt"}, h("b"))),
      h("div", {}, h("p", {class:"help"}, outName("rt")), h("div", {class:"trig", id:"rt"}, h("b")))),
    h("p", {class:"help", style:"margin:14px 0 6px"}, "Buttons the console gets"),
    h("div", {class:"btns", id:"btns"}, BTN_LIST.map(b => h("span", {"data-b":b}, outName(b))))));
  v.append(h("p", {class:"help", style:"margin-top:12px", id:"liveNote"}, "Waiting for your box…"));
  drawLive();
}
function drawLive(){
  if (view !== "test" || !LIVE) return;
  const o = LIVE.out || LIVE;
  const put = (id, cls, x, y) => { const el = document.querySelector(`#${id} i.${cls}`); if (el) el.style.transform = `translate(${x * 160}%, ${y * 160}%)`; };
  put("ls", "raw", LIVE.lx, LIVE.ly); put("rs", "raw", LIVE.rx, LIVE.ry);
  put("ls", "out", o.lx, o.ly); put("rs", "out", o.rx, o.ry);
  for (const k of ["lt", "rt"]){ const el = document.querySelector(`#${k} b`); if (el) el.style.width = Math.round((o[k] || 0) * 100) + "%"; }
  const held = new Set(o.b || []);
  document.querySelectorAll("#btns span").forEach(s => s.classList.toggle("on", held.has(s.dataset.b)));
  const n = $("#liveNote"); if (n) n.textContent = STATE && STATE.mods === false ? "Mods are off, so both dots match." : "Live from your box.";
}

/* ---------------------------------------------------------------- more */
const CONSOLES = [["auto","Auto"],["xbox","Xbox"],["playstation","PlayStation"],["switch","Switch"],["pc","PC"]];
function renderMore(v){
  v.append(h("div", {class:"section", style:"margin-top:6px"}, h("h1", {}, "More")));
  // console
  v.append(h("div", {class:"section"}, h("h2", {}, "Console")));
  v.append(h("p", {class:"help", style:"margin-bottom:10px"}, "Auto works it out by itself. Pick one if your console doesn't see the box."));
  v.append(h("div", {class:"seg"}, CONSOLES.map(([k, l]) => h("button", {"aria-pressed":String((CFG.console || "auto") === k), onclick: async () => {
    CFG.console = k; renderAll(); try { await send("console", {mode:k}); toast(`🎮 Console set to ${l}`); } catch (e){}
  }}, l))));
  // parents
  v.append(h("div", {class:"section"}, h("h2", {}, "Parent controls")));
  v.append(h("div", {class:"card stack"},
    h("div", {class:"row"}, h("div", {class:"grow"}, h("span", {class:"title"}, "🛡️ Online-safe mode"),
      h("p", {class:"help"}, "Keeps ban-risk power-ups (rapid fire, macros, recoil control, aim assist booster) paused. A console box can't tell online games from offline ones, so with this on they never run.")),
      swtch(onlineSafe(), async nv => {
        if (!nv){
          if (!(await parentOk())){ renderAll(); return; }
          if (!(await confirmSheet("Turn off online-safe mode?", "Ban-risk power-ups will run in every game, including online ones like Fortnite and Call of Duty. Game companies ban accounts for this.", "Turn it off", true))){ renderAll(); return; }
        }
        CFG.online_safe.enabled = nv; changed(); renderAll(); toast(nv ? "🛡️ Online-safe mode is on" : "⚠️ Online-safe mode is off");
      }, "Online-safe mode")),
    h("div", {class:"row"}, h("div", {class:"grow"}, h("span", {class:"title"}, "🔒 Hide ban-risk power-ups"),
      h("p", {class:"help"}, "Removes them from the list completely and switches them off everywhere.")),
      swtch(!!CFG.parent.hide_risky, async nv => {
        if (!nv && !(await parentOk())){ renderAll(); return; }
        CFG.parent.hide_risky = nv;
        if (nv) for (const n of profNames()){ puProfile = n; for (const pu of POWERUPS) if (pu.risk && puOn(pu, resolve(n))) try { pu.remove(); } catch (e){} }
        changed(); renderAll(); toast(nv ? "🔒 Ban-risk power-ups hidden" : "Ban-risk power-ups are showing again");
      }, "Hide ban-risk power-ups")),
    h("div", {class:"row"}, h("div", {class:"grow"}, h("span", {class:"title"}, "🔑 Parent PIN"),
      h("p", {class:"help"}, CFG.parent.pin ? "Set. Kids need it to change the settings above." : "Not set. Anyone can change the settings above.")),
      h("button", {class:"btn small", onclick: setPin}, CFG.parent.pin ? "Change" : "Set PIN"))));
  // box
  v.append(h("div", {class:"section"}, h("h2", {}, "Your box")));
  v.append(h("div", {class:"card stack"},
    h("div", {class:"row"}, h("span", {class:"grow muted"}, "Name"), h("b", {}, BOX.name)),
    h("div", {class:"row"}, h("span", {class:"grow muted"}, "Firmware"), h("b", {}, BOX.fw || "?")),
    h("div", {class:"row"}, h("span", {class:"grow muted"}, "Controller"), h("b", {}, (STATE && STATE.controller) || "None plugged in")),
    link.kind !== "demo" ? h("button", {class:"btn block", onclick: renameBox}, "Rename box") : null,
    h("button", {class:"btn block ghost", onclick: async () => { await disconnect(); }}, link.kind === "demo" ? "Close the demo box" : "Disconnect")));
  v.append(h("div", {class:"section"}, h("h2", {}, "About")));
  v.append(h("div", {class:"card stack"},
    h("div", {class:"row"}, h("span", {class:"grow muted"}, "Clutch app"), h("b", {}, APP_VERSION)),
    h("a", {class:"btn block", href: PC_LINK, target:"_blank", rel:"noopener"}, emo("💻"), " Get Clutch for PC")));
}
async function setPin(){
  if (CFG.parent.pin && !(await parentOk())) return;
  const a = await askPin(CFG.parent.pin ? "New PIN (leave empty to remove)" : "Pick a PIN (4 to 8 numbers)");
  if (a === null) return;
  if (a === "" && CFG.parent.pin){ delete CFG.parent.pin; changed(); renderAll(); toast("PIN removed"); return; }
  if (!/^\d{4,8}$/.test(a)){ toast("Use 4 to 8 numbers"); return; }
  const b = await askPin("Type it again");
  if (a !== b){ toast("Those didn't match"); return; }
  CFG.parent.pin = await sha(a); changed(); renderAll(); toast("🔑 Parent PIN set");
}
async function renameBox(){
  const n = await askText("Rename your box", "Shows up when you search for your box. Takes effect after the box restarts.", BOX.name, "Clutch-…", "Rename");
  if (!n) return;
  try { await send("rename", {name: n.slice(0, 20)}); BOX.name = n.slice(0, 20); renderAll(); toast("Renamed. Restart the box to see it."); } catch (e){}
}

/* ---------------------------------------------------------------- start */
renderAll();
(function autoConnect(){
  const last = recall("last", null);
  if (!last) return;
  if (last.kind === "demo") connect("demo");
  else if (last.kind === "ble" && L.platform() !== "web") connect("ble", last.id);
})();
