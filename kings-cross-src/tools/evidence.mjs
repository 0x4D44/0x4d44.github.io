// Evidence pack for the scoring rubric: fixed-camera screenshots of the built page plus the
// numbers the rubric names (bundle size, frame rate, console errors, sideways overflow).
//
//   node tools/evidence.mjs --dist <built dir> --out <output dir> [--chrome <path>]
//
// Needs Chrome. It serves the repo root (for /almanac-back.js) and mounts the built dir at
// /kings-cross/. Nothing is written outside --out. Software WebGL is used, so the frame rate
// is a floor, not Arthur's laptop; the report says which renderer drew it.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const dist = path.resolve(flag('--dist', path.join(repoRoot, 'kings-cross')));
const out = path.resolve(flag('--out', path.join(repoRoot, '.scratch', 'evidence')));

// Fixed cameras: the same views every round, so the scorer compares like with like.
// Positions are metres in the model frame (x east, y up, z south); see core/geo.ts.
// The tracks fan out NORTH (more negative z) from the shed, so the useful viewpoints sit
// north of the platform ends and look south into the platforms.
export const CAMERAS = {
  overview: { pos: [290, 380, 200], target: [40, 0, -220] },
  top: { pos: [40, 900, -200], target: [40, 0, -220] },
  'platform-heads': { pos: [45, 3.5, -340], target: [35, 2, -250] },
  'platforms-high': { pos: [45, 40, -400], target: [35, 0, -260] },
  'north-approach': { pos: [10, 25, -620], target: [40, 0, -330] },
};
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };

const CHROME = [flag('--chrome'), process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
let chromeBin = null;
for (const c of CHROME) {
  try {
    await stat(c);
    chromeBin = c;
    break;
  } catch {
    // next
  }
}
if (!chromeBin) {
  console.error('evidence: no Chrome found; set CHROME_PATH');
  process.exit(2);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const serve = (root) => async (rel) => {
  const p = path.resolve(root, rel);
  if (!p.startsWith(root)) return null;
  try {
    return { body: await readFile(p), type: MIME[path.extname(p)] ?? 'application/octet-stream' };
  } catch {
    return null;
  }
};
const fromDist = serve(dist);
const fromRoot = serve(repoRoot);
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const hit = p.startsWith('/kings-cross/') ? await fromDist(p.slice('/kings-cross/'.length) || 'index.html') : p === '/almanac-back.js' ? await fromRoot('almanac-back.js') : null;
  if (!hit) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': hit.type }).end(hit.body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const probe = createServer();
await new Promise((r) => probe.listen(0, '127.0.0.1', r));
const debugPort = probe.address().port;
await new Promise((r) => probe.close(r));
const profile = await mkdtemp(path.join(os.tmpdir(), 'kx-evidence-'));
const chrome = spawn(
  chromeBin,
  ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-sandbox', '--no-first-run', '--mute-audio', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'],
  { detached: true, stdio: 'ignore' },
);
const cleanup = async () => {
  try {
    process.kill(-chrome.pid, 'SIGKILL');
  } catch {
    // gone
  }
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
};
process.on('exit', () => {
  try {
    process.kill(-chrome.pid, 'SIGKILL');
  } catch {
    // gone
  }
});

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 300 && !wsUrl; i++) {
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json()).webSocketDebuggerUrl;
  } catch {
    await delay(100);
  }
}
if (!wsUrl) {
  await cleanup();
  throw new Error('Chrome did not expose a debugging endpoint');
}
const sock = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  sock.onopen = res;
  sock.onerror = rej;
});
let nextId = 0;
const pending = new Map();
const consoleErrors = [];
sock.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    return m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(`exception: ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ''}`.trim());
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`.trim());
};
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++nextId;
    pending.set(id, { res, rej });
    sock.send(JSON.stringify({ id, method, params, sessionId }));
  });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (method, params) => send(method, params, sessionId);
await S('Page.enable');
await S('Runtime.enable');
await S('Log.enable');
const evaluate = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`evaluate failed: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
  return r.result.value;
};

await mkdir(out, { recursive: true });
const report = { when: new Date().toISOString(), chrome: chromeBin, screenshots: [], viewports: {}, consoleErrors: [] };

try {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    await S('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vpName === 'phone' });
    await S('Page.navigate', { url: `${base}/kings-cross/` });
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) {
      await delay(100);
      ready = await evaluate('!!(window.__kx && window.__kx.ready)').catch(() => false);
    }
    if (!ready) throw new Error(`page did not become ready at ${vpName}`);
    const info = await evaluate(`(() => {
      const gl = window.__kx.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        status: document.getElementById('status').textContent,
        backPill: !![...document.documentElement.querySelectorAll('*')].find(e => e.shadowRoot && e.shadowRoot.querySelector('a')),
      };
    })()`);
    const cameras = vpName === 'desktop' ? Object.keys(CAMERAS) : ['overview', 'platform-heads'];
    for (const name of cameras) {
      const c = CAMERAS[name];
      await evaluate(`(() => { const k = window.__kx; k.camera.position.set(${c.pos}); k.controls.target.set(${c.target}); k.controls.update(); return true; })()`);
      await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
      const shot = await S('Page.captureScreenshot', { format: 'png' });
      const file = `${vpName}-${name}.png`;
      await writeFile(path.join(out, file), Buffer.from(shot.data, 'base64'));
      report.screenshots.push(file);
    }
    const fps = await evaluate(`new Promise((resolve) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(tick); })`);
    report.viewports[vpName] = { ...vp, ...info, fps: Math.round(fps * 10) / 10 };
  }
} finally {
  report.consoleErrors = consoleErrors;
  await cleanup();
}

// Bundle size: every file the page loads, raw and gzipped.
async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}
let raw = 0;
let gz = 0;
const files = [];
for (const f of await walk(dist)) {
  const buf = await readFile(f);
  const g = gzipSync(buf).length;
  raw += buf.length;
  gz += g;
  files.push({ file: path.relative(dist, f), bytes: buf.length, gzip: g });
}
report.bundle = { totalBytes: raw, totalGzipBytes: gz, budgetGzipBytes: 2 * 1024 * 1024, files };
report.note = 'Software WebGL (SwiftShader) unless the renderer says otherwise: fps here is a floor, not a laptop measurement.';
await writeFile(path.join(out, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ out, screenshots: report.screenshots.length, viewports: report.viewports, bundleGzipKB: Math.round(gz / 1024), consoleErrors: report.consoleErrors }, null, 2));
process.exit(0);
