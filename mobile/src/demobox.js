// A pretend Clutch box that runs inside the app. It speaks the real protocol (PROTOCOL.md), keeps its
// config in local storage, and makes up controller input so the live test has something to show.
// It also runs a small version of the mod engine, so switching power-ups on changes the "after mods" view.
const isObj = o => o && typeof o === "object" && !Array.isArray(o);
const clone = o => JSON.parse(JSON.stringify(o));
const merge = (a, b) => { const out = clone(a || {}); for (const [k, v] of Object.entries(b || {})) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : clone(v); return out; };
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
const listify = v => v == null || v === false ? [] : Array.isArray(v) ? v : [v];

export const DEFAULT_CONFIG = {
  active_profile: "Everyday",
  profiles: {
    Everyday: { emoji: "🎮", color: "#3ec6ff", sticks: { left: { deadzone: .08 }, right: { deadzone: .08 } } },
  },
  online_safe: { enabled: true },
  parent: {},
  console: "auto",
};
const KEY = "clutch_demo_box";

function resolve(cfg, name, seen = new Set()){
  const p = (cfg.profiles || {})[name] || {};
  if (seen.has(name)) return {};
  seen.add(name);
  const own = clone(p); delete own.extends;
  return p.extends && cfg.profiles[p.extends] ? merge(resolve(cfg, p.extends, seen), own) : own;
}
function onlineSafe(p){
  p = clone(p);
  const bad = t => listify(t).some(x => String(x).startsWith("macro:")) || (Array.isArray(t) && t.length > 1);
  for (const r of [p.remap, p.shift && p.shift.remap]) if (isObj(r)) for (const k of Object.keys(r)) if (bad(r[k])) r[k] = Array.isArray(r[k]) ? r[k][0] : k;
  delete p.turbo; delete p.macros; if (p.shift) delete p.shift.turbo;
  if (Array.isArray(p.stick_mods)) p.stick_mods = p.stick_mods.filter(m => !(num(m.add_x, 0) || num(m.add_y, 0) || num(m.wiggle, 0)));
  return p;
}

export class DemoBox {
  constructor(out){
    this.out = out; this.name = "Clutch-DEMO"; this.live = false; this.timer = null; this.t0 = Date.now(); this.mods = true;
    try { this.cfg = JSON.parse(localStorage.getItem(KEY)) || clone(DEFAULT_CONFIG); } catch (e){ this.cfg = clone(DEFAULT_CONFIG); }
    this.buf = "";
  }
  async start(){ await new Promise(r => setTimeout(r, 700)); }   // feels like connecting
  stop(){ clearInterval(this.timer); this.timer = null; this.live = false; }
  save(){ try { localStorage.setItem(KEY, JSON.stringify(this.cfg)); } catch (e){} }
  send(msg){
    const text = JSON.stringify(msg) + "\n";
    // deliver in 180-byte pieces like the real box, a moment later
    for (let i = 0; i < text.length; i += 180){ const part = text.slice(i, i + 180); setTimeout(() => this.out(part), 15); }
  }
  state(){
    return { ev: "state", profile: this.cfg.active_profile, mods: this.mods, controller: "Demo controller",
             console: this.cfg.console === "auto" ? "xbox" : this.cfg.console, online_safe: !this.cfg.online_safe || this.cfg.online_safe.enabled !== false };
  }
  receive(text){
    this.buf += text;
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0){
      const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
      let m; try { m = JSON.parse(line); } catch (e){ continue; }
      setTimeout(() => this.handle(m), 40 + Math.random() * 60);
    }
  }
  handle(m){
    const ok = () => this.send({ ev: "ok", op: m.op, id: m.id });
    const err = msg => this.send({ ev: "error", op: m.op, id: m.id, message: msg });
    switch (m.op){
      case "hello": return this.send({ ev: "hello", id: m.id, proto: 1, fw: "0.1.0-demo", name: this.name, model: "demo",
        features: ["remap", "sticks", "triggers", "turbo", "stick_mods", "macros", "shift"] });
      case "get_config": return this.send({ ev: "config", id: m.id, config: this.cfg });
      case "get_state": return this.send({ ...this.state(), id: m.id });
      case "set_config":
        if (!isObj(m.config) || !isObj(m.config.profiles) || !Object.keys(m.config.profiles).length) return err("That config is missing its profiles.");
        this.cfg = m.config;
        if (!this.cfg.profiles[this.cfg.active_profile]) this.cfg.active_profile = Object.keys(this.cfg.profiles)[0];
        this.save(); ok(); return this.send(this.state());
      case "set_profile":
        if (!this.cfg.profiles[m.name]) return err("The box doesn't have that profile.");
        this.cfg.active_profile = m.name; this.save(); ok(); return this.send(this.state());
      case "mods": this.mods = !!m.on; ok(); return this.send(this.state());
      case "console": this.cfg.console = m.mode || "auto"; this.save(); ok(); return this.send(this.state());
      case "rename": this.name = String(m.name || "").slice(0, 20) || this.name; return ok();
      case "live":
        this.live = !!m.on; clearInterval(this.timer);
        if (this.live) this.timer = setInterval(() => this.tick(), 50);
        return ok();
      case "ping": return this.send({ ev: "pong", id: m.id });
      default: return err("The box doesn't know that command yet.");
    }
  }
  /* ---- pretend controller + tiny engine */
  fake(t){
    const s = t % 8;  // 8-second loop
    const b = [];
    const raw = { lx: .9 * Math.cos(t * 1.3), ly: .9 * Math.sin(t * 1.3), rx: .55 * Math.sin(t * 2.1), ry: .4 * Math.cos(t * 1.7), lt: 0, rt: 0 };
    if (s > 2 && s < 4.5) raw.lt = 1;
    if (s > 3 && s < 4.3) raw.rt = Math.min(1, (s - 3) * 3);
    if (s > 5 && s < 5.4) b.push("a");
    if (s > 6 && s < 6.3) b.push("rb");
    if (s > 7 && s < 7.2) b.push("x");
    return { raw, b };
  }
  engine(raw, held, t){
    let p = resolve(this.cfg, this.cfg.active_profile);
    if (!this.cfg.online_safe || this.cfg.online_safe.enabled !== false) p = onlineSafe(p);
    const o = { ...raw };
    const stick = (x, y, g = {}) => {
      if (g.invert_y) y = -y;
      if (g.invert_x) x = -x;
      const mag = Math.hypot(x, y), dz = num(g.deadzone, .08);
      if (mag <= dz) return [0, 0];
      const k = Math.pow(Math.min(1, (mag - dz) / (1 - dz)), num(g.curve, 1)) * num(g.sensitivity, 1);
      const anti = num(g.anti_deadzone, 0), m2 = anti + (1 - anti) * k;
      return [clamp(x / mag * m2), clamp(y / mag * m2 * num(g.y_scale, 1))];
    };
    const sk = p.sticks || {};
    [o.lx, o.ly] = stick(raw.lx, raw.ly, sk.left);
    [o.rx, o.ry] = stick(raw.rx, raw.ry, sk.right);
    if (p.swap_sticks) [o.lx, o.ly, o.rx, o.ry] = [o.rx, o.ry, o.lx, o.ly];
    const tg = p.triggers || {};
    for (const side of ["left", "right"]){
      const k = side === "left" ? "lt" : "rt", g = tg[side] || {};
      let v = raw[k];
      if (g.hair_trigger) v = v > num(g.hair_threshold, .1) ? 1 : 0;
      else { const dz = num(g.deadzone, 0), mx = num(g.max, 1); v = v <= dz ? 0 : Math.min(1, (v - dz) / Math.max(.01, mx - dz)); }
      o[k] = v;
    }
    const active = new Set(held); if (raw.lt > .5) active.add("lt"); if (raw.rt > .5) active.add("rt");
    for (const sm of p.stick_mods || []){
      const conds = listify(sm.while);
      if (!conds.length || !conds.every(c => active.has(c))) continue;
      const sc = num(sm.scale, 1); let ax = num(sm.add_x, 0), ay = num(sm.add_y, 0);
      const w = num(sm.wiggle, 0);
      if (w){ const ph = 2 * Math.PI * num(sm.hz, 12) * t; ax += w * Math.cos(ph); if (sm.pattern !== "shake") ay += w * Math.sin(ph); }
      if (sm.stick === "left"){ o.lx = clamp(o.lx * sc + ax); o.ly = clamp(o.ly * sc + ay); }
      else { o.rx = clamp(o.rx * sc + ax); o.ry = clamp(o.ry * sc + ay); }
    }
    let outB = new Set();
    const remap = p.remap || {};
    for (const b of held){
      const tgt = remap[b];
      if (tgt === undefined) outB.add(b);
      else for (const x of listify(tgt)) if (x !== "none" && !String(x).startsWith("macro:")) outB.add(x);
    }
    for (const [b, cfg] of Object.entries(p.turbo || {})){
      const hz = typeof cfg === "number" ? cfg : num(cfg && cfg.rate_hz, 12);
      if (active.has(b) && (Math.floor(t * hz * 2) % 2)){ if (b === "rt") o.rt = 0; else if (b === "lt") o.lt = 0; else outB.delete(b); }
    }
    return { b: [...outB], ...o };
  }
  tick(){
    const t = (Date.now() - this.t0) / 1000;
    const { raw, b } = this.fake(t);
    const r2 = v => Math.round(v * 100) / 100;
    const round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v : r2(v)]));
    const out = this.mods ? this.engine(raw, b, t) : { b, ...raw };
    this.send({ ev: "live", b, ...round(raw), out: round(out) });
  }
}
