// Minimal Chrome-over-CDP harness for the plan-to-build tests. No dependencies: node built-ins, Node 22+ global WebSocket and fetch.
// Windows-safe: OS-assigned debug port, pid-tree kill to reap the renderers, static server with a JavaScript MIME type for .mjs.
// Quiet by construction: headless only, every child spawned windowsHide with ignored stdio, every Chrome process swept down to idle priority,
// pointer lock stubbed before any page script. Nothing here draws a window, takes focus or touches the real mouse or keyboard.
import { lower } from "./lowprio.mjs";               // first: lowest CPU priority for this process and its children, windowsHide on every spawn
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { rmSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromePath } from "./chrome.mjs";

export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Where scratch (Chrome profiles) goes: PTB_TMP when the runner set one (it removes the whole folder even after killing a hung suite), else os.tmpdir().
export const scratchRoot = () => process.env.PTB_TMP || tmpdir();

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".mp4": "video/mp4", ".txt": "text/plain",
};

export async function freePort() {
  return new Promise((res, rej) => {
    const s = createNetServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
    s.on("error", rej);
  });
}

// Kills a process and everything it started. Only ever called with a pid this process started itself.
export function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    try { spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch { /* already gone */ }
  } else {
    try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ } }
  }
}

// Static file server rooted at `root`. `extra` maps an exact pathname to a body that is served instead of the file. Returns { base, close }.
export async function serve(root, extra = {}) {
  const ROOT = resolve(root);
  const server = createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://local").pathname);
    if (Object.prototype.hasOwnProperty.call(extra, p)) { res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" }).end(extra[p]); return; }
    const path = resolve(ROOT, (p.endsWith("/") ? `${p}index.html` : p).replace(/^[/\\]+/, ""));
    if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    let body;
    try { body = await readFile(path); } catch { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}

// Chromes this process started, so an exit (or Ctrl+C) in the middle of a test still reaps them and their profile folders.
const LIVE = new Set();
let hooked = false;
function hookExit() {
  if (hooked) return; hooked = true;
  const sweep = () => { for (const h of LIVE) { killTree(h.pid); try { rmSync(h.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* best effort */ } } LIVE.clear(); };
  process.on("exit", sweep);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { sweep(); process.exit(130); });
}

export async function launch({ width = 1600, height = 900, headless = true, args = [], userDataParent } = {}) {
  if (typeof WebSocket === "undefined") throw new Error(`these tests need Node 22 or newer (they use its global WebSocket); this is ${process.version}`);
  hookExit();
  const CHROME = chromePath();
  const port = await freePort();
  const profile = await mkdtemp(join(userDataParent || scratchRoot(), "cdp-"));
  const flags = [
    headless ? "--headless=new" : "",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    "--no-first-run", "--no-default-browser-check", "--mute-audio",
    "--disable-background-networking", "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--autoplay-policy=no-user-gesture-required",
    ...args, "about:blank",
  ].filter(Boolean);
  // cwd = the scratch folder: the browser never stands in the folder the test was started from
  const chrome = spawn(CHROME, flags, { stdio: "ignore", windowsHide: true, detached: process.platform !== "win32", cwd: dirname(profile) });
  let spawnErr = null;
  chrome.on("error", (e) => { spawnErr = e; });
  const handle = { pid: chrome.pid, profile };
  LIVE.add(handle);
  let wsUrl;
  for (let i = 0; i < 300 && !spawnErr; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; break; }
    catch { await delay(100); }
  }
  if (!wsUrl) {
    killTree(chrome.pid); LIVE.delete(handle);
    await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {});
    throw new Error(spawnErr ? `could not start Chrome (${CHROME}): ${spawnErr.message}` : "Chrome did not expose a debugging endpoint");
  }
  const sock = new WebSocket(wsUrl);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  let msgId = 0;
  const pending = new Map();
  const listeners = new Set();
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method) for (const l of listeners) l(m);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++msgId; pending.set(id, { res, rej });
    sock.send(JSON.stringify({ id, method, params, sessionId }));
  });
  // Every Chrome process (browser, GPU, renderers, utility) goes to the lowest priority; the sweep catches ones that start later.
  const prio = {};
  const sweep = async () => {
    try {
      const r = await send("SystemInfo.getProcessInfo");
      for (const p of r.processInfo) prio[p.id] = lower(p.id);
      prio[chrome.pid] = lower(chrome.pid);
    } catch { /* browser already closing */ }
  };
  await sweep();
  const sweeper = setInterval(sweep, 1000); sweeper.unref();

  // opts.init    script source to run before any page script (e.g. delete an API to test the fallback)
  // opts.blocked URL patterns that fail to load (Network.setBlockedURLs)
  // opts.hold    { pattern, ms }: requests matching `pattern` are held for `ms` before they go out (a slow link)
  async function newPage(url = "about:blank", opts = {}) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const S = (method, params) => send(method, params, sessionId);
    const logs = [];
    const onEvt = (m) => {
      if (m.sessionId !== sessionId) return;
      if (m.method === "Runtime.consoleAPICalled") {
        const text = m.params.args.map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(" ");
        logs.push({ type: m.params.type, text });
      } else if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        logs.push({ type: "exception", text: `${d.text} ${d.exception?.description || ""} @${d.url || ""}:${d.lineNumber}:${d.columnNumber}` });
      } else if (m.method === "Log.entryAdded") {
        logs.push({ type: "log." + m.params.entry.level, text: `${m.params.entry.text} ${m.params.entry.url || ""}` });
      } else if (m.method === "Network.loadingFailed") {
        logs.push({ type: "netfail", text: `${m.params.errorText} ${m.params.requestId}` });
      }
    };
    listeners.add(onEvt);
    await S("Page.enable"); await S("Runtime.enable"); await S("Log.enable"); await S("Network.enable");
    // Headless=new still honours requestPointerLock and clips the real cursor: no test page may take it.
    await S("Page.addScriptToEvaluateOnNewDocument", { source: "Element.prototype.requestPointerLock=function(){};document.exitPointerLock=function(){};" + (opts.init || "") });
    if (opts.blocked) await S("Network.setBlockedURLs", { urls: opts.blocked });
    if (opts.hold) {
      await S("Fetch.enable", { patterns: [{ urlPattern: opts.hold.pattern, requestStage: "Request" }] });
      const onPause = (m) => {
        if (m.sessionId !== sessionId || m.method !== "Fetch.requestPaused") return;
        setTimeout(() => send("Fetch.continueRequest", { requestId: m.params.requestId }, sessionId).catch(() => {}), opts.hold.ms);
      };
      listeners.add(onPause);
    }
    await S("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    const page = {
      logs, S,
      goto: async (u) => {
        await S("Page.navigate", { url: u });
        for (let i = 0; i < 400; i++) {
          const r = await S("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }).catch(() => null);
          if (r && r.result.value === "complete") break;
          await delay(100);
        }
      },
      eval: async (expression, { awaitPromise = true, timeout = 120000 } = {}) => {
        const r = await S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise, timeout });
        if (r.exceptionDetails) {
          const d = r.exceptionDetails;
          throw new Error(`eval failed: ${d.exception?.description || d.text} (line ${d.lineNumber}:${d.columnNumber})`);
        }
        return r.result.value;
      },
      screenshot: async (file, clip) => {
        const r = await S("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, Buffer.from(r.data, "base64"));
        return file;
      },
      resize: (w, h, dpr = 1, mobile = false) => S("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile }),
      close: async () => { listeners.delete(onEvt); await send("Target.closeTarget", { targetId }).catch(() => {}); },
    };
    if (url !== "about:blank") await page.goto(url);
    return page;
  }

  async function close() {
    clearInterval(sweeper);
    try { sock.close(); } catch { /* closing anyway */ }
    killTree(chrome.pid);
    LIVE.delete(handle);
    await delay(300);
    await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {});
  }
  return { newPage, send, close, port, prio, pid: chrome.pid };
}
