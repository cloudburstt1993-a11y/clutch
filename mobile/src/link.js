// Talks to a Clutch box over Bluetooth LE (Android app or Chrome) or to the built-in demo box.
// Protocol: see ../PROTOCOL.md. Messages are JSON + "\n", split into chunks of up to 180 bytes.
import { BleClient } from "@capacitor-community/bluetooth-le";
import { Capacitor } from "@capacitor/core";
import { DemoBox } from "./demobox.js";

export const SERVICE = "c1a7c000-5a1e-4b7e-9c2d-0b5e7c1a7c00";
export const RX = "c1a7c001-5a1e-4b7e-9c2d-0b5e7c1a7c00";
export const TX = "c1a7c002-5a1e-4b7e-9c2d-0b5e7c1a7c00";
const enc = new TextEncoder(), dec = new TextDecoder();

class Link {
  constructor(){ this.handlers = new Set(); this.nextId = 1; this.waiting = new Map(); this.buf = ""; this.kind = null; }
  on(fn){ this.handlers.add(fn); return () => this.handlers.delete(fn); }
  emit(msg){ for (const fn of this.handlers) try { fn(msg); } catch (e){ console.error(e); } }
  _incoming(text){
    this.buf += text;
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0){
      const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
      if (!line.trim()) continue;
      let msg; try { msg = JSON.parse(line); } catch (e){ continue; }
      if (msg.id != null && this.waiting.has(msg.id)){
        const w = this.waiting.get(msg.id); this.waiting.delete(msg.id); clearTimeout(w.t);
        msg.ev === "error" ? w.reject(new Error(msg.message || "The box said no.")) : w.resolve(msg);
      }
      this.emit(msg);
    }
  }
  request(op, fields = {}, timeout = 6000){
    const id = this.nextId++;
    const p = new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.waiting.delete(id); reject(new Error("The box didn't answer. Is it plugged in and close by?")); }, timeout);
      this.waiting.set(id, { resolve, reject, t });
    });
    return this.send({ op, id, ...fields }).then(() => p);
  }
  _lost(reason){
    for (const w of this.waiting.values()){ clearTimeout(w.t); w.reject(new Error("Lost the connection to your box.")); }
    this.waiting.clear(); this.buf = "";
    this.emit({ ev: "_disconnected", reason });
  }
}

/* ---- the demo box, running inside the app */
class DemoLink extends Link {
  constructor(){ super(); this.kind = "demo"; this.box = new DemoBox(text => this._incoming(text)); }
  async connect(){ await this.box.start(); return { name: this.box.name, id: "demo" }; }
  async send(msg){ this.box.receive(JSON.stringify(msg) + "\n"); }
  async disconnect(){ this.box.stop(); this._lost("user"); }
}

/* ---- a real box over Bluetooth LE */
let bleReady = null;
function initBle(){
  if (!bleReady) bleReady = BleClient.initialize({ androidNeverForLocation: true }).catch(e => { bleReady = null; throw e; });
  return bleReady;
}
function friendly(e){
  const m = String(e && (e.message || e)).toLowerCase();
  if (m.includes("cancel") || m.includes("user")) return "No box picked.";
  if (m.includes("not supported") || m.includes("unavailable") || m.includes("bluetooth adapter") || m.includes("not available"))
    return "This browser can't use Bluetooth. Use the Clutch app on Android, or Chrome on Android or a computer.";
  if (m.includes("disabled") || m.includes("turned off") || m.includes("not enabled")) return "Bluetooth is off. Turn it on and try again.";
  if (m.includes("permission") || m.includes("denied")) return "Clutch needs permission to use Bluetooth. Allow “Nearby devices” for Clutch in your phone's settings.";
  return "Couldn't connect to the box. Make sure it's plugged in, then try again.";
}
class BleLink extends Link {
  constructor(){ super(); this.kind = "ble"; this.deviceId = null; this.chunk = 20; }
  async connect(deviceId){
    try {
      await initBle();
      if (Capacitor.getPlatform() === "android"){
        const on = await BleClient.isEnabled().catch(() => true);
        if (!on){ try { await BleClient.requestEnable(); } catch (e){ throw new Error("Bluetooth is off"); } }
      }
      let device;
      if (deviceId && Capacitor.isNativePlatform()) device = { deviceId, name: null };
      else device = await BleClient.requestDevice({ services: [SERVICE], optionalServices: [SERVICE] });
      this.deviceId = device.deviceId;
      await BleClient.connect(device.deviceId, () => this._lost("box"), { timeout: 12000 });
      try { const mtu = await BleClient.getMtu(device.deviceId); this.chunk = Math.max(20, Math.min(180, (mtu || 23) - 3)); } catch (e){ this.chunk = 20; }
      await BleClient.startNotifications(device.deviceId, SERVICE, TX, v => this._incoming(dec.decode(v.buffer ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : v)));
      return { name: device.name, id: device.deviceId };
    } catch (e){
      if (this.deviceId) try { await BleClient.disconnect(this.deviceId); } catch (_){}
      const err = new Error(friendly(e)); err.raw = e; throw err;
    }
  }
  async send(msg){
    const bytes = enc.encode(JSON.stringify(msg) + "\n");
    for (let i = 0; i < bytes.length; i += this.chunk){
      const part = bytes.slice(i, i + this.chunk);
      await BleClient.write(this.deviceId, SERVICE, RX, new DataView(part.buffer));
    }
  }
  async disconnect(){
    const id = this.deviceId; this.deviceId = null;
    if (id) try { await BleClient.disconnect(id); } catch (e){}
    this._lost("user");
  }
}

export function bleAvailable(){
  if (Capacitor.isNativePlatform()) return true;
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}
export function makeLink(kind){ return kind === "demo" ? new DemoLink() : new BleLink(); }
export const platform = () => Capacitor.getPlatform();
