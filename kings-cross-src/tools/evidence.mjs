// Evidence pack for the scoring rubric: fixed-camera screenshots of the built page plus the
// numbers the rubric names (bundle size, frame rate, console errors, sideways overflow).
//
//   node tools/evidence.mjs --dist <built dir> --out <output dir> [--chrome <path>] [--gpu]
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
import { PLATFORM_HEIGHT } from '../core/scene.ts';
import { platformReport, pointInPolygon, shedLayout, stationPlatforms } from '../core/station.ts';
import { trainLayout } from '../core/train.ts';

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
  overview: { pos: [260, 220, 90], target: [45, 5, -140] },
  // Measuring views: far away with a narrow lens, so they are close to orthographic and the 10 m
  // grid reads true. They load the page with ?grid=1&bare=1 (no buildings, no fog).
  // (A larger near plane keeps depth precision at that distance; with 0.5 m the grid z-fights the ground.)
  top: { pos: [40, 3000, -139], target: [40, 0, -140], grid: true, fov: 12, near: 100 },
  side: { pos: [1500, 70, -135], target: [45, 70, -135], grid: true, fov: 7, near: 100 },
  'shed-interior': { pos: [48, 7.5, -16], target: [52, 6, -160] },
  concourse: { pos: [-70, 2.2, -35], target: [-18, 10, -95] },
  'platform-heads': { pos: [50, 3, -352], target: [52, 6, -250] },
  'platforms-high': { pos: [50, 45, -420], target: [45, 0, -255] },
  'south-front': { pos: [45, 34, 150], target: [45, 14, -12] },
  'north-approach': { pos: [20, 28, -560], target: [45, 3, -330] },
};
// The standing trains (?trains=demo) get their cameras from where the page put them, not from
// fixed numbers: window.__kx.trains gives each train's nose position and heading, and the camera
// is placed relative to those. `at(t, s, off, y)` is the point s metres north of the nose, off
// metres east of the track, y metres up; north and east are the shed's (see shedToWorld).
export const TRAIN_CAMERA_NAMES = ['train-closeup', 'train-side', 'train-nose', 'train-pantograph', 'train-lumo', 'train-hull'];
function trainCameras(trains) {
  const platforms = [...stationPlatforms(kx).values()];
  const groundAt = (x, z) => (platforms.some((p) => pointInPolygon([x, z], p.pts)) ? PLATFORM_HEIGHT : 0);
  const at = (t, s, off, y) => [t.nose[0] + Math.sin(t.h) * s + Math.cos(t.h) * off, y, t.nose[2] - Math.cos(t.h) * s + Math.sin(t.h) * off];
  // Stand `off` metres from the track on whichever side has a platform (east first), eyes `eye` metres above it.
  const stand = (t, s, off, eye) => {
    for (const sign of [1, -1]) {
      const p = at(t, s, sign * off, 0);
      const g = groundAt(p[0], p[2]);
      if (g > 0) return [p[0], g + eye, p[2]];
    }
    const p = at(t, s, off, 0);
    return [p[0], eye, p[2]];
  };
  const find = (kind) => {
    const t = trains.find((x) => x.kind === kind);
    if (!t) throw new Error(`no ${kind} train in window.__kx.trains`);
    return t;
  };
  const half = 1.35; // half the body width, only to say "3 m from the side of the coach"
  const cams = {};
  const l9 = find('lner9');
  const cars = trainLayout('lner9').cars;
  // a coach of the nine-car train, 3 m from its side, at standing eye height, on its first door and the windows beside it
  const coach = cars[1];
  cams['train-closeup'] = { pos: stand(l9, coach.start + 4.2, half + 3, 1.6), target: at(l9, coach.start + 4.2, 0, 2.2), fov: 50, near: 0.1 };
  // the whole train from far to the west, over the shed's wall and the neighbouring blocks (hidden for this shot)
  const len = trainLayout('lner9').length;
  const vfov = 7;
  const dist = (len / 2 / (Math.tan((vfov / 2) * (Math.PI / 180)) * (VIEWPORTS.desktop.width / VIEWPORTS.desktop.height))) * 1.08;
  cams['train-side'] = { pos: at(l9, len / 2, -dist, 8), target: at(l9, len / 2, 0, 2), fov: vfov, near: 100, hideScenery: true };
  cams['train-nose'] = { pos: stand(l9, -7, 9.8, 1.7), target: at(l9, 0.6, 0, 1.9), fov: 50, near: 0.1 };
  const dptf = cars[cars.length - 1];
  const pz = (dptf.pantograph[0] + dptf.pantograph[1]) / 2;
  cams['train-pantograph'] = { pos: at(l9, pz - 2.2, 5.5, 8.9), target: at(l9, pz, 0, 3.9), fov: 50, near: 0.1 };
  for (const [name, kind] of [['train-lumo', 'lumo5'], ['train-hull', 'hull5']]) {
    const t = find(kind);
    cams[name] = { pos: stand(t, 6.5, half + 5, 1.6), target: at(t, 6.5, 0, 2.0), fov: 50, near: 0.1 };
  }
  return cams;
}

// Cameras used on the phone-sized viewport.
const PHONE_CAMERAS = ['overview', 'shed-interior', 'platform-heads'];
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };

const kx = JSON.parse(await readFile(path.join(here, '..', 'web', 'src', 'data', 'kx-track.json'), 'utf8'));

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
  [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-sandbox',
    '--no-first-run',
    '--mute-audio',
    '--ignore-gpu-blocklist',
    // --gpu: use the machine's real graphics (Metal on a Mac) for the frame-rate number.
    // Without it, software GL (SwiftShader) draws the page: fine for screenshots, a floor for fps.
    ...(args.includes('--gpu') ? ['--use-angle=metal', '--enable-gpu-rasterization'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    'about:blank',
  ],
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
const report = {
  when: new Date().toISOString(),
  machine: `${os.type()} ${os.release()}, ${os.cpus()[0]?.model ?? 'unknown cpu'} x${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB`,
  graphics: args.includes('--gpu') ? 'hardware (Metal)' : 'software (SwiftShader)',
  chrome: chromeBin,
  screenshots: [],
  viewports: {},
  consoleErrors: [],
};

try {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    await S('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vpName === 'phone' });
    // Loads per viewport: the plain page; on the desktop also the page with the 10 m measuring grid
    // (?grid=1) and the page with the standing trains (?trains=demo).
    for (const mode of vpName === 'desktop' ? ['plain', 'grid', 'trains'] : ['plain']) {
      const grid = mode === 'grid';
      const trainsMode = mode === 'trains';
      await S('Page.navigate', { url: `${base}/kings-cross/${grid ? '?grid=1&bare=1' : trainsMode ? '?trains=demo' : ''}` });
      let ready = false;
      for (let i = 0; i < 300 && !ready; i++) {
        await delay(100);
        ready = await evaluate('!!(window.__kx && window.__kx.ready)').catch(() => false);
      }
      if (!ready) throw new Error(`page did not become ready at ${vpName} (${mode})`);
      if (mode === 'plain') {
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
        report.viewports[vpName] = { ...vp, ...info };
      }
      let cameras = CAMERAS;
      let wanted = Object.keys(CAMERAS).filter((n) => (vpName === 'desktop' ? !!CAMERAS[n].grid === grid : !grid && PHONE_CAMERAS.includes(n)));
      if (trainsMode) {
        const trains = await evaluate('window.__kx.trains.map((t) => ({ kind: t.kind, nose: t.noseWorld, h: t.headingRad }))');
        cameras = trainCameras(trains);
        wanted = TRAIN_CAMERA_NAMES;
      }
      for (const name of wanted) {
        const c = cameras[name];
        // the side-on view of a whole train looks over the shed and the blocks beside it, so they are hidden for that shot only
        if (trainsMode) await evaluate(`(() => { const p = window.__kx.parts; p.shed.visible = ${!c.hideScenery}; if (p.buildings) p.buildings.visible = ${!c.hideScenery}; return true; })()`);
        await evaluate(`(() => { const k = window.__kx; k.controls.maxDistance = 1e5; k.controls.maxPolarAngle = Math.PI; k.camera.far = 20000; k.camera.near = ${c.near ?? 0.5}; k.camera.fov = ${c.fov ?? 50}; k.camera.updateProjectionMatrix(); k.camera.position.set(${c.pos}); k.controls.target.set(${c.target}); k.controls.update(); return true; })()`);
        await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
        const shot = await S('Page.captureScreenshot', { format: 'png' });
        const file = `${vpName}-${name}${grid ? '-grid' : ''}.png`;
        await writeFile(path.join(out, file), Buffer.from(shot.data, 'base64'));
        report.screenshots.push(file);
      }
      if (mode === 'plain') {
        const fps = await evaluate(`new Promise((resolve) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(tick); })`);
        report.viewports[vpName].fps = Math.round(fps * 10) / 10;
        // Moving camera: an orbit round the station at half a radian a second for 5 s, from the
        // overview position, recording every frame's duration. A steady 60 fps shows as p95 near
        // 16.7 ms and no frames over 20 ms. (Headless Chrome caps animation frames at the display rate.)
        const o = CAMERAS.overview;
        await evaluate(`(() => { const k = window.__kx; k.controls.maxPolarAngle = Math.PI * 0.495; k.camera.near = 0.5; k.camera.fov = 50; k.camera.updateProjectionMatrix(); k.camera.position.set(${o.pos}); k.controls.target.set(${o.target}); k.controls.update(); return true; })()`);
        const motion = await evaluate(`new Promise((resolve) => {
          const k = window.__kx; const c = k.camera, t = k.controls.target;
          const r0 = Math.hypot(c.position.x - t.x, c.position.z - t.z), y0 = c.position.y;
          const a0 = Math.atan2(c.position.z - t.z, c.position.x - t.x);
          const dts = []; let last = performance.now(); const t0 = last;
          const tick = (now) => {
            dts.push(now - last); last = now;
            const a = a0 + ((now - t0) / 1000) * 0.5;
            c.position.set(t.x + r0 * Math.cos(a), y0, t.z + r0 * Math.sin(a));
            if (now - t0 < 5000) requestAnimationFrame(tick);
            else {
              dts.shift();
              const s = [...dts].sort((x, y) => x - y);
              const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
              resolve({ frames: dts.length, seconds: (now - t0) / 1000, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1], over20ms: dts.filter((d) => d > 20).length });
            }
          };
          requestAnimationFrame(tick);
        })`);
        const r1 = (n) => Math.round(n * 10) / 10;
        report.viewports[vpName].motion = { frames: motion.frames, fps: r1(motion.frames / motion.seconds), frameMs: { p50: r1(motion.p50), p95: r1(motion.p95), p99: r1(motion.p99), max: r1(motion.max) }, framesOver20ms: motion.over20ms };
        // time to the first drawn frame, from the start of navigation (ms), on this load
        report.viewports[vpName].firstFrameMs = Math.round(await evaluate('window.__kx.firstFrameMs'));
      }
    }
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

// Geometry the model is drawn from: platform lengths and the shed, from the committed data.
// (tools/fidelity.ts compares these with the raw OpenStreetMap extract.)
report.platforms = platformReport(kx).map((p) => ({ ref: p.ref, osmId: p.osmId, lengthM: Math.round(p.lengthM * 10) / 10, meanWidthM: Math.round(p.meanWidthM * 10) / 10 }));
const shed = shedLayout(kx);
report.shed = { widthM: Math.round(shed.width * 10) / 10, lengthM: Math.round(shed.length * 10) / 10, aisleM: Math.round(shed.aisle * 10) / 10, crownM: Math.round(shed.crown * 10) / 10, headingDeg: Math.round(((shed.heading * 180) / Math.PI) * 100) / 100 };
report.note = 'Software WebGL (SwiftShader) unless the renderer says otherwise: fps here is a floor, not a laptop measurement.';
await writeFile(path.join(out, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ out, screenshots: report.screenshots.length, viewports: report.viewports, bundleGzipKB: Math.round(gz / 1024), consoleErrors: report.consoleErrors }, null, 2));
process.exit(0);
