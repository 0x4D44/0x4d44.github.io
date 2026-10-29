// Reusable headless-Chrome harness for Aotearoa Rally (static server + CDP over Node's WebSocket).
//   const h = await openGame({ width: 960, height: 540, query: "nomenu=1&stage=waitomo&quality=low" });
//   await h.waitForReady(); await h.evalAsync("window.__AR__.state()"); await h.screenshot("x.png"); await h.close();
// Everything is torn down (Chrome killed, server closed, profile removed) on close() and on failure.

import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { readFile, stat, mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, normalize, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { lowerPriority } from "./lowprio.mjs";

export const GAME_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(GAME_ROOT, "..");

const MIME = {
  ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".wasm": "application/wasm", ".ogg": "audio/ogg", ".mp3": "audio/mpeg",
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  const cands = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  return cands.find((p) => existsSync(p)) || null;
}

/** Serve `root` over HTTP. `/almanac-back.js` falls back to the repository root copy. Returns { url, close }. */
export async function serve(root = GAME_ROOT) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      let file = normalize(join(root, p));
      if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403).end(); return; }
      if (p === "/almanac-back.js" && !existsSync(file)) file = join(REPO_ROOT, "almanac-back.js");
      const s = await stat(file).catch(() => null);
      if (!s || !s.isFile()) { res.writeHead(404, { "content-type": "text/plain" }).end("not found"); return; }
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store", "content-length": body.length });
      res.end(body);
    } catch (e) {
      res.writeHead(500).end(String(e && e.message));
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}

async function freePort() {
  const s = createNetServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return port;
}

const CHROME_FLAGS = [
  "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--hide-scrollbars",
  "--autoplay-policy=no-user-gesture-required", "--no-sandbox", "--no-first-run", "--no-default-browser-check", "--mute-audio",
  "--disable-background-networking", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
];

/**
 * Open the game in headless Chrome.
 * @param {{width?:number,height?:number,dpr?:number,mobile?:boolean,query?:string,path?:string,root?:string,extraFlags?:string[],timeoutMs?:number}} o
 */
export async function openGame(o = {}) {
  const { width = 960, height = 540, dpr = 1, mobile = false, query = "", path = "/index.html", root = GAME_ROOT, extraFlags = [] } = o;
  const chromeBin = findChrome();
  if (!chromeBin) throw new Error("Chrome not found. Set CHROME_PATH.");
  const srv = await serve(root);
  const port = await freePort();
  const profile = await mkdtemp(join(tmpdir(), "ar-chrome-"));
  // Headless only, no window of any kind (windowsHide), low priority (this process is already low, so Chrome inherits it).
  const chrome = spawn(chromeBin, [...CHROME_FLAGS, ...extraFlags, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true, detached: process.platform !== "win32" });
  lowerPriority(chrome.pid);
  let sock = null, closed = false;
  const consoleErrs = [];
  const logs = [];
  const killChrome = () => {
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(chrome.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      else process.kill(-chrome.pid, "SIGKILL");
    } catch { /* already gone */ }
  };
  const close = async () => {
    if (closed) return;
    closed = true;
    try { sock && sock.close(); } catch { /* */ }
    killChrome();
    await srv.close().catch(() => {});
    await delay(150);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  };
  try {
    let wsUrl = null;
    for (let i = 0; i < 300 && !wsUrl; i++) {
      try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await delay(100); }
    }
    if (!wsUrl) throw new Error("Chrome did not expose a debugging endpoint");
    sock = new WebSocket(wsUrl);
    await new Promise((res, rej) => { sock.onopen = res; sock.onerror = () => rej(new Error("websocket error")); });
    let id = 0;
    const pending = new Map();
    const listeners = [];
    sock.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method) for (const l of listeners) l(m);
    };
    const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); sock.send(JSON.stringify({ id: i, method, params, sessionId })); });
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const S = (method, params) => send(method, params, sessionId);
    listeners.push((m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === "Runtime.exceptionThrown") consoleErrs.push("exception: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
      else if (m.method === "Runtime.consoleAPICalled") {
        const text = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
        logs.push(`${m.params.type}: ${text}`);
        if (m.params.type === "error" || m.params.type === "assert") consoleErrs.push("console." + m.params.type + ": " + text);
      } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") consoleErrs.push("log: " + m.params.entry.text + " " + (m.params.entry.url || ""));
    });
    await S("Page.enable");
    // Headless=new Chrome still honours requestPointerLock and would clip the REAL cursor: stub it before any page script runs.
    await S("Page.addScriptToEvaluateOnNewDocument", { source: "try{Element.prototype.requestPointerLock=function(){};document.exitPointerLock=function(){};}catch(e){}window.__AR_TEST__=true;" });
    await S("Runtime.enable");
    await S("Log.enable");
    await S("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
    if (mobile) await S("Emulation.setTouchEmulationEnabled", { enabled: true });

    // Chromium lifts its GPU and foreground renderer processes above the class they inherited; put every Chrome process back down.
    const lowerAll = async () => {
      try { for (const p of (await send("SystemInfo.getProcessInfo")).processInfo) lowerPriority(p.id); } catch { /* best effort */ }
    };

    const evalRaw = async (expression, awaitPromise = true) => {
      const r = await S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
      if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const api = {
      url: srv.url,
      consoleErrors: () => consoleErrs.slice(),
      logs: () => logs.slice(),
      eval: (expr) => evalRaw(expr, false),
      /** Evaluate an expression (may return a Promise); resolves to its JSON value. */
      evalAsync: (expr) => evalRaw(expr, true),
      call: (fn, ...args) => evalRaw(`(${fn.toString()})(...${JSON.stringify(args)})`, true),
      async goto(q = query) {
        await S("Page.navigate", { url: `${srv.url}${path}${q ? "?" + q : ""}` });
        await delay(100);
      },
      async setViewport(w, h, d = dpr, m = mobile) {
        await S("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: d, mobile: m });
        await delay(120);
      },
      async waitFor(expr, timeoutMs = 60000, every = 100) {
        const t0 = Date.now();
        let last;
        while (Date.now() - t0 < timeoutMs) {
          try { last = await evalRaw(expr, true); if (last) return last; } catch { /* page not ready */ }
          await delay(every);
        }
        throw new Error(`waitFor timed out (${timeoutMs} ms): ${expr}`);
      },
      /** Wait until window.__AR__.ready resolves. */
      async waitForReady(timeoutMs = 90000) {
        await api.waitFor("!!(window.__AR__ && window.__AR__.ready)", timeoutMs);
        await evalRaw("window.__AR__.ready.then(() => true)", true);
        await lowerAll();
        return true;
      },
      async screenshot(file, { format = "png", quality = 90 } = {}) {
        const r = await S("Page.captureScreenshot", { format, ...(format === "jpeg" ? { quality } : {}), fromSurface: true });
        await mkdir(dirname(resolve(file)), { recursive: true });
        await writeFile(file, Buffer.from(r.data, "base64"));
        return file;
      },
      /** Mean luma (0..255) of the centre of the WebGL canvas, read page-side after two animation frames (0 = black frame). */
      luma: () => evalRaw(`(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const c = document.querySelector("canvas"); if (!c) return -1;
        const w = 48, h = 27, t = document.createElement("canvas"); t.width = w; t.height = h;
        const x = t.getContext("2d"); x.drawImage(c, 0, 0, w, h);
        const d = x.getImageData(w >> 2, h >> 2, w >> 1, h >> 1).data; let s = 0;
        for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
        return Math.round(s / (d.length / 4) / 3);
      })()`, true),
      /** Horizontal overflow in px (0 = none). */
      overflowX: () => evalRaw("document.documentElement.scrollWidth - document.documentElement.clientWidth", false),
      sleep: delay,
      /** Raw DevTools call on the page session, for diagnostics (e.g. Profiler.start / Profiler.stop). */
      cdp: (method, params) => S(method, params),
      /**
       * A REAL key event through CDP (goes through the browser's input pipeline, unlike a synthetic dispatchEvent).
       * code: "KeyA", "Escape", "Comma"...  Holds for holdMs, then releases.
       */
      async keyPress(code, { holdMs = 60 } = {}) {
        await api.keyDown(code);
        await delay(holdMs);
        await api.keyUp(code);
      },
      async keyDown(code) {
        const k = keyInfo(code);
        await S("Input.dispatchKeyEvent", { type: "keyDown", code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, text: k.text });
      },
      async keyUp(code) {
        const k = keyInfo(code);
        await S("Input.dispatchKeyEvent", { type: "keyUp", code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
      },
      close,
    };
    await api.goto(query);
    await lowerAll();
    return api;
  } catch (e) {
    await close();
    throw e;
  }
}

const KEYS = { Escape: ["Escape", 27], Enter: ["Enter", 13, "\r"], Space: [" ", 32, " "], Backspace: ["Backspace", 8], ArrowUp: ["ArrowUp", 38], ArrowDown: ["ArrowDown", 40], ArrowLeft: ["ArrowLeft", 37], ArrowRight: ["ArrowRight", 39], Comma: [",", 188, ","], Period: [".", 190, "."], ShiftLeft: ["Shift", 16], ControlLeft: ["Control", 17] };
function keyInfo(code) {
  if (KEYS[code]) return { key: KEYS[code][0], vk: KEYS[code][1], text: KEYS[code][2] };
  const m = /^Key([A-Z])$/.exec(code);
  if (m) return { key: m[1].toLowerCase(), vk: m[1].charCodeAt(0), text: m[1].toLowerCase() };
  throw new Error("keyInfo: unknown key code " + code);
}

/** Run fn(h) and always tear down. */
export async function withGame(o, fn) {
  const h = await openGame(o);
  try { return await fn(h); } finally { await h.close(); }
}
