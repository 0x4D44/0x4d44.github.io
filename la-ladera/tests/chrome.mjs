// Zero-dependency headless-Chrome driver for La Ladera (CDP over Node 22's global WebSocket).
//
//   import { launch } from './chrome.mjs';
//   const b = await launch({ width: 1280, height: 720 });          // starts a static server for the repo + Chrome
//   const p = await b.open('la-ladera/index.html?autostart&manual'); // navigates and waits for __ladera.ready
//   console.log(await p.eval('__ladera.state()'));
//   await p.canvasShot('out.jpg', { w: 1280 });                      // WebGL canvas via __ladera.shot (no HUD)
//   await p.pageShot('out.png');                                     // full page via CDP (HUD + overlays)
//   await b.close();                                                 // ALWAYS close (kills only our own Chrome tree)
//
// Windows notes (see lessons_learnt): Chrome's renderer children outlive chrome.kill(); we use an OS-assigned free
// debug port and `taskkill /T /F /PID` on our own pid only. Never blanket-kill chrome.exe: the user's real Chrome runs.
//
// Quiet by construction (the person at the desk must never see or feel the tests): ALWAYS `--headless=new` (there is no headed mode here
// on purpose), every child is spawned with `windowsHide: true`, and the whole process tree runs below-normal priority (./nice.mjs;
// Chrome and its GPU/renderer processes inherit it from this process). Pages also get ./quiet-init.js before any script of their own: pointer lock
// is simulated in the page (real lock makes Windows ClipCursor() the person's mouse into the invisible window) and speech is recorded, never voiced.
import './nice.mjs';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createNet } from 'node:net';
import { mkdtemp, readFile, rm, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, dirname, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { memGate } from './memgate.mjs';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2',
  '.txt': 'text/plain', '.ico': 'image/x-icon',
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  const c = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const p = c.find((x) => x && existsSync(x));
  if (!p) throw new Error('Chrome not found; set CHROME_PATH');
  return p;
}

async function freePort() {
  return new Promise((res, rej) => { const s = createNet(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
}

/** Static server over `root` (default: the repo root) on an OS-assigned port. */
export async function serve(root = REPO) {
  const srv = createServer(async (req, res) => {
    try {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let p = resolve(root, '.' + (u.endsWith('/') ? u + 'index.html' : u));
      if (!normalize(p).startsWith(normalize(root))) { res.writeHead(403).end(); return; }
      const st = await stat(p).catch(() => null);
      if (st?.isDirectory()) p = join(p, 'index.html');
      const body = await readFile(p);
      res.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store', 'content-length': body.length }).end(body);
    } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('404'); }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { port: srv.address().port, close: () => new Promise((r) => srv.close(r)) };
}

class Page {
  constructor(b, sessionId) {
    this.b = b; this.sid = sessionId; this.logs = []; this.errors = []; this.netErrors = []; this.reqs = new Map();
    b.listeners.set(sessionId, (m) => this._event(m));
  }
  send(method, params = {}, timeout = 120000) { return this.b.send(method, params, this.sid, timeout); }
  _event(m) {
    const p = m.params;
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = p.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
      this.logs.push(`[${p.type}] ${text}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails; this.errors.push(`${d.text} ${d.exception?.description ?? ''} @${d.url ?? ''}:${d.lineNumber ?? ''}`.trim());
    } else if (m.method === 'Log.entryAdded') {
      this.logs.push(`[${p.entry.level}] ${p.entry.text} ${p.entry.url ?? ''}`);
    } else if (m.method === 'Network.responseReceived') {
      if (p.response.status >= 400) this.netErrors.push(`${p.response.status} ${p.response.url}`);
    } else if (m.method === 'Network.loadingFailed') {
      if (!p.canceled) this.netErrors.push(`FAILED ${p.errorText} ${this.reqs.get(p.requestId) ?? ''}`);
    } else if (m.method === 'Network.requestWillBeSent') this.reqs.set(p.requestId, p.request.url);
  }
  async enable() { for (const d of ['Page', 'Runtime', 'Log', 'Network']) await this.send(d + '.enable'); }
  async viewport(w, h, mobile = false) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }); }

  /** Evaluate an expression (string) in the page; awaits promises; throws on exception. */
  async eval(expr, timeout) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, timeout ?? 180000);
    if (r.exceptionDetails) throw new Error('page eval failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text) + '\n  in: ' + expr.slice(0, 200));
    return r.result.value;
  }
  async fn(f, ...args) { return this.eval(`(${f.toString()})(...${JSON.stringify(args)})`); }
  async waitFor(expr, timeout = 120000, step = 150) {
    const t0 = Date.now();
    for (;;) {
      let v = null; try { v = await this.eval(expr, 15000); } catch { /* page busy or navigating */ }
      if (v) return v;
      if (Date.now() - t0 > timeout) throw new Error('timeout waiting for: ' + expr);
      await delay(step);
    }
  }
  /** Navigate and wait for the game to finish booting (window.__ladera.ready). */
  async goto(url, { ready = true, timeout = 240000 } = {}) {
    this.logs.length = this.errors.length = this.netErrors.length = 0;
    await this.send('Page.navigate', { url });
    await this.b.nice?.();                      // a navigation can start a new renderer: lower it too
    await this.waitFor('document.readyState === "complete"', 60000);
    if (ready) {
      await this.waitFor('!!window.__ladera && !!window.__ladera.ready', 60000);
      const r = await this.send('Runtime.evaluate', { expression: 'window.__ladera.ready.then(() => true, (e) => String(e))', awaitPromise: true, returnByValue: true }, timeout);
      if (r.result.value !== true) throw new Error('boot failed: ' + JSON.stringify(r.result.value ?? r.exceptionDetails));
    }
    return this;
  }
  /** WebGL canvas capture through __ladera.shot (deterministic; excludes HUD). Saves a JPEG and returns the path. */
  async canvasShot(path, o = {}) {
    const url = await this.eval(`window.__ladera.shot(${JSON.stringify(o)})`, 180000);
    await mkdir(dirname(resolve(path)), { recursive: true });
    await writeFile(path, Buffer.from(url.split(',')[1], 'base64'));
    return path;
  }
  /** Whole-page screenshot via the compositor (includes HUD / overlays). */
  async pageShot(path) {
    const r = await this.send('Page.captureScreenshot', { format: path.endsWith('.jpg') ? 'jpeg' : 'png', quality: 90 }, 180000);
    await mkdir(dirname(resolve(path)), { recursive: true });
    await writeFile(path, Buffer.from(r.data, 'base64'));
    return path;
  }
  async key(code, down = true) { await this.eval(`window.dispatchEvent(new KeyboardEvent(${JSON.stringify(down ? 'keydown' : 'keyup')}, { code: ${JSON.stringify(code)}, bubbles: true }))`); }
  summary() { return { errors: this.errors, netErrors: this.netErrors, consoleErrors: this.logs.filter((l) => /^\[(error|assert)\]/.test(l)), consoleWarnings: this.logs.filter((l) => /^\[(warning|warn)\]/.test(l)) }; }
}

/**
 * Start a static server + headless Chrome. Options: width, height, gpu ('auto' | 'swiftshader' | 'gpu'), root, args.
 * Returns { open(path), page, close(), baseUrl, renderer }. There is no headed mode: `headless:false` throws.
 */
export async function launch(o = {}) {
  if (o.headless === false) throw new Error('chrome.mjs is headless-only: a visible browser window steals the user\'s focus');
  if (o.memGate !== false) await memGate(o.minFreeGB ?? 5, 180);   // shared box: wait for commit headroom before another Chrome
  const srv = await serve(o.root ?? REPO);
  const port = await freePort();
  const profile = await mkdtemp(join(tmpdir(), 'ladera-chrome-'));
  const gpu = o.gpu ?? 'auto';
  const args = [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio', '--hide-scrollbars', '--disable-background-networking',
    '--disable-features=Translate,MediaRouter', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
    `--window-size=${o.width ?? 1280},${o.height ?? 720}`,
    ...(gpu === 'swiftshader' ? ['--use-angle=swiftshader', '--use-gl=angle'] : gpu === 'gpu' ? ['--use-angle=d3d11'] : []),
    ...(process.platform === 'linux' ? ['--no-sandbox'] : []), ...(o.args ?? []), 'about:blank',
  ].filter(Boolean);
  const chrome = spawn(findChrome(), args, { stdio: 'ignore', windowsHide: true, detached: process.platform !== 'win32' });
  const b = { listeners: new Map(), pending: new Map(), id: 0, srv, chrome, profile, baseUrl: `http://127.0.0.1:${srv.port}` };

  let wsUrl;
  for (let i = 0; i < 300 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await delay(100); }
  }
  if (!wsUrl) { await killTree(chrome); await srv.close(); throw new Error('Chrome did not expose a debugging endpoint'); }
  const sock = new WebSocket(wsUrl);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = () => rej(new Error('CDP socket error')); });
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && b.pending.has(m.id)) { const { res, rej, t } = b.pending.get(m.id); clearTimeout(t); b.pending.delete(m.id); m.error ? rej(new Error(`${m.error.message} (${JSON.stringify(m.error.data ?? '')})`)) : res(m.result); }
    else if (m.method && m.sessionId) b.listeners.get(m.sessionId)?.(m);
  };
  b.send = (method, params = {}, sessionId, timeout = 120000) => new Promise((res, rej) => {
    const id = ++b.id; const t = setTimeout(() => { b.pending.delete(id); rej(new Error(`CDP timeout: ${method}`)); }, timeout);
    b.pending.set(id, { res, rej, t }); sock.send(JSON.stringify({ id, method, params, sessionId }));
  });

  // Chromium sets its own priorities (GPU process above normal, foreground renderers normal), so inheriting below-normal from this process is not
  // enough: ask the browser which processes it has (SystemInfo.getProcessInfo) and lower each one. Re-applied on a timer and after navigations.
  let closed = false;
  b.nice = async () => {
    const want = { idle: os.constants.priority.PRIORITY_LOW, below: os.constants.priority.PRIORITY_BELOW_NORMAL }[String(process.env.LADERA_PRIO ?? 'below').toLowerCase()];
    if (closed || want === undefined) return;
    try {
      const info = await b.send('SystemInfo.getProcessInfo', {}, undefined, 5000);
      for (const p of info.processInfo ?? []) { try { if (os.getPriority(p.id) < want) os.setPriority(p.id, want); } catch { /* exited or not ours to change */ } }
    } catch { /* browser busy or closing */ }
  };
  const niceTimer = setInterval(() => b.nice(), 2500); niceTimer.unref();

  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  const page = new Page(b, sessionId); await page.enable();
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: await readFile(new URL('./quiet-init.js', import.meta.url), 'utf8') });   // every later document, every frame
  await page.viewport(o.width ?? 1280, o.height ?? 720);
  await b.nice();

  const out = {
    page, baseUrl: b.baseUrl,
    /** Open a repo-relative path (e.g. 'la-ladera/index.html?autostart&manual') and wait for boot. */
    open: async (path, opts) => { await page.goto(`${b.baseUrl}/${path.replace(/^\//, '')}`, opts); return page; },
    /** WebGL renderer string (tells you whether you got the GPU or SwiftShader). */
    renderer: async () => page.eval(`(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); if (!g) return 'no webgl'; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); })()`),
    close: async () => {
      closed = true; clearInterval(niceTimer);
      try { sock.close(); } catch { /* ignore */ }
      await killTree(chrome); await srv.close();
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    },
  };
  return out;
}

async function killTree(proc) {
  if (!proc?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else { try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* gone */ } }
  await delay(300);
}
