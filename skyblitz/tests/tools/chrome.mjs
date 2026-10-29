// Minimal dependency-free Chrome DevTools driver for headless GPU playtests (Node >= 22).
//   import { launchChrome } from "./chrome.mjs";
//   const chrome = await launchChrome({ width: 1280, height: 720 });
//   const page = await chrome.newPage();
//   await page.goto("http://127.0.0.1:8100/skyblitz/?debug=1&manual=1");
//   await page.waitFor("window.__sky && window.__sky.ready");
//   await page.eval("__sky.step(120)");
//   await page.screenshot("out.png");
//   await chrome.close();
// Windows-safe: picks a free OS port, uses a throwaway profile, kills the whole process tree on close.
// Env: CHROME_PATH to override the browser; SKY_GL=swiftshader to force software GL; SKY_PRIORITY (see lowprio.mjs).
// House rule for every test and tool: headless only (no window, no console, no desktop input) and below-normal priority.
import { lowerPriority } from "./lowprio.mjs";
import { spawn, spawnSync } from "node:child_process";
import { accessSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const list = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const p of list) { try { accessSync(p); return p; } catch { /* next */ } }
  throw new Error("No Chrome found; set CHROME_PATH");
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  });
}

const KEYS = {
  ArrowLeft: [37, "ArrowLeft"], ArrowUp: [38, "ArrowUp"], ArrowRight: [39, "ArrowRight"], ArrowDown: [40, "ArrowDown"],
  Space: [32, " "], Enter: [13, "Enter"], Escape: [27, "Escape"], Tab: [9, "Tab"], Backspace: [8, "Backspace"],
  ShiftLeft: [16, "Shift"], ShiftRight: [16, "Shift"], ControlLeft: [17, "Control"], ControlRight: [17, "Control"],
  AltLeft: [18, "Alt"], PageUp: [33, "PageUp"], PageDown: [34, "PageDown"], Home: [36, "Home"], End: [35, "End"],
};
function keyInfo(name) {
  if (KEYS[name]) return { code: name, key: KEYS[name][1], vk: KEYS[name][0] };
  let m;
  if ((m = /^Key([A-Z])$/.exec(name))) return { code: name, key: m[1].toLowerCase(), vk: m[1].charCodeAt(0) };
  if ((m = /^Digit(\d)$/.exec(name))) return { code: name, key: m[1], vk: m[1].charCodeAt(0) };
  if (name.length === 1) return { code: "Key" + name.toUpperCase(), key: name, vk: name.toUpperCase().charCodeAt(0) };
  return { code: name, key: name, vk: 0 };
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(`${m.error.message || JSON.stringify(m.error)}`)) : res(m.result);
      } else if (m.method) for (const l of this.listeners) l(m);
    };
  }
  send(method, params = {}, sessionId) {
    return new Promise((res, rej) => {
      const id = ++this.id; this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  on(fn) { this.listeners.push(fn); }
}

export class Page {
  constructor(cdp, sessionId, targetId) {
    this.cdp = cdp; this.sid = sessionId; this.targetId = targetId; this.logs = [];
    cdp.on((m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === "Runtime.consoleAPICalled") {
        const text = m.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ");
        this.logs.push({ type: m.params.type, text });
      } else if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        this.logs.push({ type: "exception", text: `${d.exception?.description || d.text} @ ${d.url || ""}:${d.lineNumber}` });
      } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
        this.logs.push({ type: "log-error", text: `${m.params.entry.text} ${m.params.entry.url || ""}` });
      }
    });
  }
  s(method, params) { return this.cdp.send(method, params, this.sid); }
  async init(width, height, dpr = 1) {
    await this.s("Page.enable"); await this.s("Runtime.enable"); await this.s("Log.enable");
    await this.setViewport(width, height, { dpr });
  }
  setViewport(width, height, { dpr = 1, mobile = false } = {}) {
    return this.s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
  }
  async goto(url, { timeout = 45000 } = {}) {
    this.logs.length = 0;
    await this.s("Page.navigate", { url });
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await this.eval('document.readyState === "complete"').catch(() => false)) return;
      await delay(80);
    }
    throw new Error("page load timeout: " + url);
  }
  async eval(expression, { awaitPromise = true } = {}) {
    const r = await this.s("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async waitFor(expression, { timeout = 30000, interval = 100 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      let v = false;
      try { v = await this.eval(expression); } catch { /* retry */ }
      if (v) return v;
      await delay(interval);
    }
    throw new Error("waitFor timeout: " + expression);
  }
  async screenshot(file, { format = "png", quality = 90, clip } = {}) {
    const r = await this.s("Page.captureScreenshot", { format, quality: format === "jpeg" ? quality : undefined, clip, captureBeyondViewport: false });
    writeFileSync(file, Buffer.from(r.data, "base64"));
    return file;
  }
  async key(name, { type = "press", hold = 40 } = {}) {
    const k = keyInfo(name);
    const ev = (t) => this.s("Input.dispatchKeyEvent", {
      type: t, key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
      text: t === "keyDown" && k.key.length === 1 ? k.key : undefined,
    });
    if (type === "down") return ev("keyDown");
    if (type === "up") return ev("keyUp");
    await ev("keyDown"); await delay(hold); await ev("keyUp");
  }
  async mouse(type, x, y, button = "left") {
    return this.s("Input.dispatchMouseEvent", { type, x, y, button, buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  }
  async click(x, y) { await this.mouse("mouseMoved", x, y); await this.mouse("mousePressed", x, y); await this.mouse("mouseReleased", x, y); }
  errors() { return this.logs.filter((l) => l.type === "error" || l.type === "exception" || l.type === "log-error"); }
  async close() { try { await this.cdp.send("Target.closeTarget", { targetId: this.targetId }); } catch { /* gone */ } }
}

export async function launchChrome({ width = 1280, height = 720, dpr = 1, headless = true, args = [] } = {}) {
  if (!headless) throw new Error("headed Chrome is not allowed: all testing is headless so it never opens a window or takes focus");
  const bin = findChrome();
  const port = await freePort();
  const profile = await mkdtemp(join(tmpdir(), "sky-chrome-"));
  const flags = [
    "--headless=new",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    "--no-first-run", "--no-default-browser-check", "--mute-audio", "--autoplay-policy=no-user-gesture-required",
    "--ignore-gpu-blocklist", "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows", "--disable-features=CalculateNativeWinOcclusion",
    process.env.SKY_GL === "swiftshader" ? "--use-angle=swiftshader" : null,
    process.env.SKY_GL === "swiftshader" ? "--enable-unsafe-swiftshader" : null,
    ...args, "about:blank",
  ].filter(Boolean);
  const proc = spawn(bin, flags, { stdio: "ignore", windowsHide: true });
  lowerPriority(proc.pid);                           // the browser root; its renderer / GPU children inherit from it
  let wsUrl;
  for (let i = 0; i < 200 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await delay(100); }
  }
  if (!wsUrl) { proc.kill(); throw new Error("Chrome did not expose a debugging endpoint"); }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new Cdp(ws);
  const pages = [];
  // Chrome re-prices its own children (GPU above normal, visible renderers normal), so pull every one of them down to the house level.
  const lowerTree = async () => { try { for (const p of (await cdp.send("SystemInfo.getProcessInfo")).processInfo) lowerPriority(p.id); } catch { /* closing */ } };
  const keepLow = setInterval(lowerTree, 2000); keepLow.unref();
  const api = {
    cdp, pid: proc.pid,
    async newPage() {
      const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
      const page = new Page(cdp, sessionId, targetId);
      await page.init(width, height, dpr);
      pages.push(page);
      await lowerTree();
      return page;
    },
    async close() {
      clearInterval(keepLow);
      try { ws.close(); } catch { /* ignore */ }
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      else { try { process.kill(-proc.pid, "SIGKILL"); } catch { proc.kill("SIGKILL"); } }
      await delay(150);
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };
  return api;
}
