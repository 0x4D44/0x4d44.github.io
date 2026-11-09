// Offline GPU evidence from frozen WH inputs. Importing this module never starts Chrome.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdir, mkdtemp, open, readFile, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureScratchOutput } from './area-coverage.mjs';
import { cdpPipe, manualFrames } from './signal-capture.mjs';
import { inspectStationPixels, waitForGpu } from './station-capture.mjs';
import { cleanupCaptureBrowser, createCaptureLifetime } from './capture-runtime.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (base, file) => { const r = path.relative(base, file); return r === '' || r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r); };
const privateWrite = async (file, body) => { const handle = await open(file, 'wx', 0o600); try { await handle.writeFile(body); } finally { await handle.close(); } };

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.slice(2), value = argv[i + 1];
    if (!argv[i]?.startsWith('--') || !['dist', 'anchors', 'recording', 'out', 'chrome'].includes(key) || !value || value.startsWith('--') || options[key]) throw new Error('usage: stpancras-capture.mjs --dist <dist> --anchors <private WH anchors> --recording <private WH ndjson> --out <worktree/.scratch/dir> [--chrome <path>]');
    options[key] = path.resolve(value);
  }
  if (!['dist', 'anchors', 'recording', 'out'].every(k => options[k])) throw new Error('--dist, --anchors, --recording and --out required');
  return options;
}

export function validateInputs(anchors, rows) {
  if (anchors?.area !== 'WH' || !Array.isArray(anchors.anchors) || !anchors.anchors.some(a => a.kind === 'platform' && /^[1-4]$/.test(a.platform))) throw new Error('WH MML platform anchors required');
  if (!rows.length || rows.some(r => r.e?.area !== 'WH' || !Number.isFinite(r.t))) throw new Error('nonempty WH-only recording required');
  const date = new Date(rows[0].t).toISOString().slice(0, 10).replaceAll('-', '');
  if (rows.some(r => new Date(r.t).toISOString().slice(0, 10).replaceAll('-', '') !== date)) throw new Error('recording must contain one UTC date');
  return date;
}

/** A description must actually occur at a platform in the frozen observations. */
export function recordedPlatformEvidence(rows, anchors) {
  const berths = new Set(anchors.anchors.filter(a => a.kind === 'platform' && /^[1-4]$/.test(a.platform)).map(a => a.berth));
  return rows.flatMap(r => {
    const e = r.e;
    const pairs = e.kind === 'snapshot' ? Object.entries(e.berths ?? {}) : e.kind === 'step' ? [[e.from, e.descr], [e.to, e.descr]] : e.kind === 'interpose' ? [[e.to, e.descr]] : [];
    return pairs.filter(([berth, descr]) => berths.has(berth) && typeof descr === 'string' && descr.trim() && descr !== '****')
      .map(([berth, description]) => ({ berth, description, timeMs: r.t, kind: e.kind }));
  });
}

export function acceptRealTrain(view, anchors, observations, timeMs) {
  if (!view || !Number.isFinite(timeMs) || view.opacity < .95 || !Number.isFinite(view.opacity) || view.state === 'fading' || view.unmappedBerth ||
    !Number.isFinite(view.occupiedLengthM) || view.occupiedLengthM < 20 || !Array.isArray(view.leading?.point) || view.leading.point.length !== 2 || view.leading.point.some(v => !Number.isFinite(v))) return false;
  return anchors.anchors.some(a => a.kind === 'platform' && /^[1-4]$/.test(a.platform) && [view.lastBerth, view.targetBerth].includes(a.berth) &&
    observations.some(o => o.berth === a.berth && o.description === view.description && o.timeMs <= timeMs));
}

export function verifyBrowserPlan(actual, plan, anchors) {
  const real = actual?.state?.trains?.find(v => v.id === plan.train.id), group = actual?.groupState;
  if (!actual?.state?.ready || actual.state.area !== 'WH' || actual.state.error || actual.timeMs !== plan.timeMs || actual.simulationTimeMs !== plan.timeMs ||
    !acceptRealTrain(real, anchors, plan.observations, actual.timeMs) || real.description !== plan.train.description ||
    !Number.isFinite(real.lengthM) || Math.abs(real.lengthM - plan.train.lengthM) > 1e-6 ||
    group?.kind !== 'emr222x5' || group.allocation !== 'assumed fleet' || !Number.isFinite(group.length) || Math.abs(group.length - real.lengthM) > 1e-6 ||
    real.leading.point.some((v, i) => Math.abs(v - plan.train.leading.point[i]) > .05)) throw new Error('browser replay, clock, assumed fleet or formation disagrees with real WH capture plan');
  return real;
}

/** Only the two fixed WH endpoints can ever return private feed data. */
export function frozenRelayResponse(url, frozen) {
  const u = new URL(url, 'http://127.0.0.1');
  if (u.pathname !== '/relay' && !u.pathname.startsWith('/relay/')) return null;
  const keys = [...u.searchParams.keys()];
  if (u.searchParams.getAll('area').length === 1 && u.searchParams.get('area') === 'WH') {
    if (u.pathname === '/relay/anchors' && keys.length === 1) return { status: 200, type: 'application/json', body: frozen.anchors };
    if (u.pathname === '/relay/recording' && keys.length === 2 && u.searchParams.getAll('date').length === 1 && u.searchParams.get('date') === frozen.date) return { status: 200, type: 'application/x-ndjson', body: frozen.recording };
  }
  return { status: 404, type: 'text/plain', body: 'offline WH capture: endpoint unavailable' };
}

export async function firstPlatformPlan(rows, anchors, data) {
  const { createMmlMotion, createMmlReplay } = await import('../web/src/stpancras-live.ts');
  const observations = recordedPlatformEvidence(rows, anchors);
  if (!observations.length) throw new Error('unavailable: no observed WH platform train in recording');
  const session = createMmlMotion(data, anchors), replay = createMmlReplay(rows, session.sink, 1);
  // Event-local seeks avoid scanning an entire recording at video frame frequency.
  const times = [...new Set(observations.flatMap(o => [o.timeMs, o.timeMs + 1000, o.timeMs + 10000]))].filter(t => t <= rows.at(-1).t).sort((a, b) => a - b);
  for (const timeMs of times) {
    replay.frame(0, timeMs);
    const train = session.motion.trains().find(v => acceptRealTrain(v, anchors, observations, timeMs));
    if (train) {
      const canonical = createMmlMotion(data, anchors), direct = createMmlReplay(rows, canonical.sink, 1);
      direct.frame(0, timeMs);
      const actual = canonical.motion.trains().find(v => v.description === train.description && acceptRealTrain(v, anchors, observations, timeMs));
      if (actual) return { timeMs, train: structuredClone(actual), observations: observations.filter(o => o.description === actual.description && o.timeMs <= timeMs) };
    }
  }
  throw new Error('unavailable: no usable replayed WH platform train; no manufactured capture');
}

async function fingerprintTree(dir, captured) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('dist symlinks are not accepted');
    if (entry.isDirectory()) result.push(...await fingerprintTree(file, captured));
    else if (entry.isFile()) { const bytes = await readFile(file); captured.set(file, bytes); result.push({ file, bytes: bytes.length, sha256: hash(bytes) }); }
  }
  return result.sort((a, b) => a.file.localeCompare(b.file));
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv), out = await ensureScratchOutput(options.out);
  const [anchorBytes, recordingBytes, dataBytes] = await Promise.all([readFile(options.anchors), readFile(options.recording), readFile(path.join(ROOT, 'kings-cross-src/web/src/data/kx-track.json'))]);
  const end = recordingBytes.lastIndexOf(10) + 1, complete = recordingBytes.subarray(0, end);
  const { parseRecording } = await import('../web/src/feed.ts');
  const anchors = JSON.parse(anchorBytes), rows = parseRecording(complete.toString('utf8')), date = validateInputs(anchors, rows);
  const frozen = { anchors: anchorBytes, recording: complete, date }, dist = await realpath(options.dist), captured = new Map();
  const report = { private: true, shots: [], errors: [], attempts: [], assumptions: ['Train description and position use frozen WH observations plus provisional private platform anchors.', 'EMR 222 five-car appearance is assumed fleet; individual allocation is unavailable.', 'Camera visibility uses actual scene geometry; no roof or building is hidden.'], inputs: {
    anchors: { source: options.anchors, bytes: anchorBytes.length, sha256: hash(anchorBytes) },
    recording: { source: options.recording, capturedBytes: recordingBytes.length, bytes: complete.length, sha256: hash(complete), ignoredTailBytes: recordingBytes.length - end },
    geometry: { bytes: dataBytes.length, sha256: hash(dataBytes) }, dist: await fingerprintTree(dist, captured) } };
  await mkdir(path.join(out, 'inputs'), { mode: 0o700 });
  await privateWrite(path.join(out, 'inputs/anchors.json'), anchorBytes);
  await privateWrite(path.join(out, 'inputs/recording.ndjson'), complete);
  let chrome, cdp, profile, server, lifetime;
  try {
    report.plan = await firstPlatformPlan(rows, anchors, JSON.parse(dataBytes));
    const chromePath = options.chrome ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    await access(chromePath);
    await waitForGpu();
    lifetime = createCaptureLifetime({ timeoutMs: 300000 });
    server = createServer(async (req, res) => {
      try {
        if (req.method !== 'GET') { res.writeHead(405).end(); return; }
        const response = frozenRelayResponse(req.url, frozen);
        if (response) { res.writeHead(response.status, { 'content-type': response.type, 'cache-control': 'no-store' }).end(response.body); return; }
        const u = new URL(req.url, 'http://127.0.0.1');
        const special = { '/capture/three.core.js': path.join(ROOT, 'kings-cross-src/node_modules/three/build/three.core.js'), '/capture/train-framing.mjs': path.join(ROOT, 'kings-cross-src/tools/train-framing.mjs'), '/almanac-back.js': path.join(ROOT, 'almanac-back.js') };
        let file = special[u.pathname];
        if (['/kings-cross', '/kings-cross/'].includes(u.pathname)) file = path.join(dist, 'index.html');
        else if (u.pathname.startsWith('/kings-cross/')) {
          file = await realpath(path.resolve(dist, decodeURIComponent(u.pathname.slice('/kings-cross/'.length))));
          if (!within(dist, file)) throw new Error('path escape');
        }
        if (!file) { res.writeHead(404).end(); return; }
        const type = /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(captured.get(file) ?? await readFile(file));
      } catch { res.writeHead(404).end(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    profile = await mkdtemp(path.join(out, 'chrome-'));
    chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-breakpad', '--disable-crash-reporter', '--noerrdialogs', '--use-mock-keychain', '--password-store=basic', '--no-proxy-server', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu-rasterization', 'about:blank'], { detached: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
    lifetime.attach(chrome); cdp = cdpPipe(chrome);
    chrome.stderr.setEncoding('utf8'); chrome.stderr.on('data', bytes => { report.chromeStderr = ((report.chromeStderr ?? '') + bytes).slice(-12000); });
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => { lifetime.check(); return cdp.send(method, params, sessionId); };
    const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${manualFrames.toString()})();` });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/kings-cross/?trains=replay&date=${date}&station=st-pancras&speed=1&board=0&tooltip=0` });
    const deadline = Date.now() + 90000;
    while (!await evaluate('!!window.__kx?.stPancras')) { if (Date.now() > deadline) throw new Error('St Pancras runtime startup timeout'); await new Promise(resolve => setTimeout(resolve, 100)); }
    await evaluate(`(async()=>{const k=window.__kx;await k.cityLoaded;await k.stations.select('st-pancras',false);window.__signalFrame(0);await k.stPancras.load();window.__captureT=await import('/capture/three.core.js');window.__captureF=await import('/capture/train-framing.mjs');})()`);
    while (!await evaluate('window.__kx.stPancras.state().ready')) {
      const error = await evaluate('window.__kx.stPancras.state().error');
      if (error || Date.now() > deadline) throw new Error(error ?? 'WH replay load timeout');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    report.renderer = await evaluate("(()=>{const g=window.__kx.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)})()");
    if (!/Metal/i.test(report.renderer) || /SwiftShader|llvmpipe|software/i.test(report.renderer)) throw new Error(`real Metal GPU required: ${report.renderer}`);
    const actual = await evaluate(`(()=>{const k=window.__kx;k.stPancras.frame(0,true,${report.plan.timeMs});k.scene.updateMatrixWorld(true);k.renderer.render(k.scene,k.camera);const g=k.stPancras.group.children.find(g=>g.userData.id===${report.plan.train.id});return {timeMs:k.stPancras.timeMs(),simulationTimeMs:k.simulationTimeMs,state:k.stPancras.state(),groupState:g?.userData};})()`);
    const real = verifyBrowserPlan(actual, report.plan, anchors);
    report.actual = actual;
    const shot = async (name, visibility = null) => {
      const dimensions = await evaluate(`(()=>{const k=window.__kx;const r=k.renderer.domElement.getBoundingClientRect();return {canvas:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},excluded:[{left:0,top:0,right:109,bottom:41},...[...document.body.children].filter(e=>e.id!=='app'&&!['SCRIPT','STYLE'].includes(e.tagName)).flatMap(e=>e.matches('.mml-train-labels,.station-placeholder')?[...e.children]:[e]).map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height).map(r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom}))]};})()`);
      const png = await send('Page.captureScreenshot', { format: 'png' }), bytes = Buffer.from(png.data, 'base64'), pixels = inspectStationPixels(bytes, dimensions);
      if (!pixels.clear) throw new Error(`${name}: blank canvas`);
      await privateWrite(path.join(out, `${name}.png`), bytes);
      report.shots.push({ name, sha256: hash(bytes), timeMs: actual.timeMs, train: real, visibility, pixels,
        camera: await evaluate('({position:window.__kx.camera.position.toArray(),target:window.__kx.controls.target.toArray()})') });
    };
    await shot('01-st-pancras-overview');
    // Low platform-side detail cameras stay beneath the roof. Try each actual coach
    // on both sides; every accepted sample must raycast to its own rendered body.
    let clear = false;
    for (let index = 0; index < 5 && !clear; index++) for (const side of [1, -1]) {
      const view = await evaluate(`(()=>{const k=window.__kx,T=window.__captureT,F=window.__captureF,g=k.stPancras.group.children.find(g=>g.userData.id===${real.id}),coach=g?.getObjectByName('car-${index}');if(!coach?.visible)return {failure:'coach not visible'};try{const box=F.trainBounds(T,coach);const shell=coach.getObjectByName('body-shell');shell.geometry.computeBoundingBox();const z=shell.geometry.boundingBox.getCenter(new T.Vector3()).z;const view=F.detailCamera(T,k.scene,k.camera,k.controls,coach,k.parts.terrain,[0,1.85,z],${side});let draws=0;coach.traverse(o=>{if(o.isMesh)o.onAfterRender=()=>draws++;});k.renderer.render(k.scene,k.camera);return {...view,draws};}catch(e){return {failure:e.message,details:e.details??null};}})()`);
      report.attempts.push({ coach: index, side, ...view });
      if (view.failure || !view.draws || !view.visibility?.clear) continue;
      await shot('02-recorded-wh-train-detail', view); clear = true; break;
    }
    if (!clear) throw new Error('unavailable: recorded WH train is occluded in every platform-side detail camera; no manufactured capture');
  } catch (error) { report.errors.push(error.stack ?? error.message); }
  finally {
    cdp?.close(); report.cleanup = await cleanupCaptureBrowser(chrome, profile); lifetime?.dispose();
    server?.closeAllConnections(); if (server?.listening) await new Promise(resolve => server.close(resolve));
    await privateWrite(path.join(out, 'stpancras-captures.json'), JSON.stringify(report, null, 2) + '\n');
  }
  if (report.errors.length) throw new Error(report.errors[0]);
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`stpancras-capture: ${error.message}`); process.exitCode = 1; });
