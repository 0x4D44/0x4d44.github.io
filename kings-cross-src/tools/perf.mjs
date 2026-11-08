// Round 9 replay performance capture: two fixed cameras, 60 seconds each by default.
//
//   node tools/perf.mjs [--dist <built dir>] [--out <output dir>] [--seconds 60]
//                       [--chrome <path>] [--relay http://127.0.0.1:8787]
//
// Uses headless Chrome with ANGLE Metal requested, then records the WebGL renderer string so a
// SwiftShader fallback cannot be mistaken for a real-GPU result. Replay data comes only from the
// already-running relay. The local server serves the almanac back button, the built page, and a
// same-origin /relay proxy. No recording data or screenshots are copied out of the browser.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const dist = path.resolve(flag('--dist', path.join(repoRoot, '.scratch', 'perf-dist')));
const out = path.resolve(flag('--out', path.join(repoRoot, '.scratch', 'perf-round9')));
const seconds = Number(flag('--seconds', '60'));
const relayBase = new URL(flag('--relay', 'http://127.0.0.1:8787'));
const replayDate = '20261107';
const replaySpeed = 30;
const viewport = { width: 1280, height: 800 };
const cameras = {
  overview: { pos: [260, 220, 90], target: [45, 5, -140] },
  shed: { pos: [48, 7.5, -16], target: [52, 6, -160] },
};

if (!Number.isFinite(seconds) || seconds < 1 || seconds > 300) {
  throw new Error('--seconds must be between 1 and 300');
}
if (relayBase.protocol !== 'http:' && relayBase.protocol !== 'https:') {
  throw new Error('--relay must use http or https');
}
if (relayBase.username || relayBase.password) throw new Error('--relay must not contain credentials');
await stat(dist).catch(() => { throw new Error(`built page not found at ${dist}; build it before running perf`); });
await mkdir(out, { recursive: true });

const chromeCandidates = [flag('--chrome'), process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
let chromeBin;
for (const candidate of chromeCandidates) {
  try { await stat(candidate); chromeBin = candidate; break; } catch { /* try next candidate */ }
}
if (!chromeBin) throw new Error('no Chrome found; pass --chrome or set CHROME_PATH');

const MIME = {
  '.css': 'text/css', '.html': 'text/html', '.ico': 'image/x-icon', '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg', '.js': 'text/javascript', '.json': 'application/json', '.map': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};
const safeFile = async (root, pathname) => {
  const decoded = decodeURIComponent(pathname);
  const file = path.resolve(root, `.${decoded.startsWith('/') ? decoded : `/${decoded}`}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return null;
  try { return { body: await readFile(file), type: MIME[path.extname(file)] ?? 'application/octet-stream' }; }
  catch { return null; }
};

let staticServer;
let chrome;
let profile;
let cleanupPromise;
let chromeStdout = '';
let chromeStderr = '';
const consoleErrors = [];
const walk = async (dir) => {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
};
const buildFiles = (await walk(dist)).sort();
const buildEntries = await Promise.all(buildFiles.map(async (file) => {
  const [body, info] = await Promise.all([readFile(file), stat(file)]);
  return { file: path.relative(dist, file), bytes: body.length, sha256: createHash('sha256').update(body).digest('hex'), modifiedAt: info.mtime.toISOString() };
}));
const report = {
  when: new Date().toISOString(),
  machine: `${os.type()} ${os.release()}, ${os.cpus()[0]?.model ?? 'unknown cpu'} x${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB`,
  chrome: chromeBin,
  cdpTransport: 'Chrome remote debugging pipe (file descriptors 3/4)',
  requestedGpu: 'ANGLE Metal (--use-angle=metal --enable-gpu-rasterization)',
  build: {
    dist,
    newestFileTime: buildEntries.reduce((newest, file) => Math.max(newest, Date.parse(file.modifiedAt)), 0),
    totalBytes: buildEntries.reduce((sum, file) => sum + file.bytes, 0),
    files: buildEntries,
  },
  replay: { date: replayDate, speed: replaySpeed, relay: relayBase.origin, warmupSeconds: 2, secondsPerCamera: seconds },
  viewport,
  frameBudgetMs: 1000 / 60,
  cameras: {},
  consoleErrors,
};
report.build.newestFileTime = report.build.newestFileTime ? new Date(report.build.newestFileTime).toISOString() : null;
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const cleanup = () => {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    if (chrome?.pid) {
      try { process.kill(-chrome.pid, 'SIGTERM'); } catch { /* already exited */ }
      await Promise.race([
        new Promise((resolve) => chrome.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* process tree is gone */ }
    }
    if (staticServer?.listening) {
      const closed = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 1500);
        staticServer.close(() => { clearTimeout(timer); resolve(true); });
      });
      if (!await closed) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 1500);
          staticServer.once('close', () => { clearTimeout(timer); resolve(); });
          staticServer.closeAllConnections?.();
        });
      }
    }
    if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
  })();
  return cleanupPromise;
};
process.once('SIGINT', () => { void cleanup().finally(() => process.exit(130)); });
process.once('SIGTERM', () => { void cleanup().finally(() => process.exit(143)); });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rounded = (n, digits = 2) => n == null ? null : Number(n.toFixed(digits));

try {
  staticServer = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/relay' || requestUrl.pathname.startsWith('/relay/')) {
      const target = new URL(relayBase);
      target.pathname = `${target.pathname.replace(/\/$/, '')}${requestUrl.pathname.replace(/^\/relay(?=\/|$)/, '')}` || '/';
      target.search = requestUrl.search;
      const relayRequest = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, {
        method: req.method,
        headers: { host: target.host, accept: req.headers.accept ?? '*/*' },
        timeout: 35_000,
      }, (relayResponse) => {
        res.writeHead(relayResponse.statusCode ?? 502, relayResponse.headers);
        relayResponse.pipe(res);
      });
      relayRequest.on('timeout', () => relayRequest.destroy(new Error('relay request timed out')));
      relayRequest.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('relay unavailable'); });
      req.pipe(relayRequest);
      return;
    }
    let hit = null;
    try {
      if (requestUrl.pathname === '/' || requestUrl.pathname === '/kings-cross' || requestUrl.pathname === '/kings-cross/') {
        hit = await safeFile(dist, '/index.html');
      } else if (requestUrl.pathname === '/almanac-back.js') {
        hit = await safeFile(repoRoot, '/almanac-back.js');
      } else if (requestUrl.pathname.startsWith('/kings-cross/')) {
        hit = await safeFile(dist, requestUrl.pathname.slice('/kings-cross'.length));
      }
    } catch { /* malformed path */ }
    if (!hit) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': hit.type, 'content-length': hit.body.length }).end(hit.body);
  });
  await new Promise((resolve, reject) => {
    staticServer.once('error', reject);
    staticServer.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${staticServer.address().port}`;

  profile = await mkdtemp(path.join(out, 'chrome-profile-'));
  chrome = spawn(chromeBin, [
    '--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`,
    `--disk-cache-dir=${path.join(profile, 'cache')}`,
    '--no-sandbox', '--no-first-run', '--mute-audio', '--ignore-gpu-blocklist', '--enable-logging=stderr',
    '--disable-breakpad', '--disable-crash-reporter', '--noerrdialogs', '--use-mock-keychain', '--password-store=basic',
    '--use-angle=metal', '--enable-gpu-rasterization', 'about:blank',
  ], { detached: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] });
  let chromeSpawnError;
  chrome.stdout.setEncoding('utf8');
  chrome.stdout.on('data', (chunk) => { chromeStdout = `${chromeStdout}${chunk}`.slice(-2000); });
  chrome.stderr.setEncoding('utf8');
  chrome.stderr.on('data', (chunk) => { chromeStderr = `${chromeStderr}${chunk}`.slice(-4000); });
  chrome.once('error', (error) => { chromeSpawnError = error; });
  const pipeWriter = chrome.stdio[3];
  const pipeReader = chrome.stdio[4];
  if (!pipeWriter || !pipeReader) throw new Error('Chrome CDP pipe file descriptors were not created');
  let nextId = 0;
  const pending = new Map();
  const onMessage = (message) => {
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message ?? 'CDP command failed'));
      else item.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      consoleErrors.push(`exception: ${details.text} ${details.exception?.description ?? ''}`.trim());
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(`console.error: ${message.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      consoleErrors.push(`log: ${message.params.entry.text}`);
    }
  };
  let pipeBuffer = '';
  pipeReader.setEncoding('utf8');
  pipeReader.on('data', (chunk) => {
    pipeBuffer += chunk;
    let end;
    while ((end = pipeBuffer.indexOf('\0')) >= 0) {
      const raw = pipeBuffer.slice(0, end);
      pipeBuffer = pipeBuffer.slice(end + 1);
      try { onMessage(JSON.parse(raw)); } catch { /* ignore non-protocol chunks */ }
    }
  });
  pipeReader.on('error', (error) => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
    pending.clear();
  });
  chrome.once('exit', (code, signal) => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(`Chrome exited during CDP (code ${code}, signal ${signal})\n${chromeStdout}${chromeStderr}`)); }
    pending.clear();
  });
  const send = (method, params = {}, sessionId, timeoutMs = 10_000) => new Promise((resolve, reject) => {
    if (chromeSpawnError) { reject(chromeSpawnError); return; }
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    pipeWriter.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
  await send('Browser.getVersion', {}, undefined, 12_000).catch((error) => {
    throw new Error(`${error.message}${chromeStderr ? `\n${chromeStderr}` : ''}`);
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (method, params, timeoutMs) => send(method, params, sessionId, timeoutMs);
  await S('Page.enable');
  await S('Runtime.enable');
  await S('Log.enable');
  await S('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  await S('Page.bringToFront');
  const evaluate = async (expression, timeoutMs = 10_000) => {
    const result = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
    if (result.exceptionDetails) throw new Error(`page evaluation failed: ${result.exceptionDetails.text}`);
    return result.result.value;
  };
  report.chromeVersion = await send('Browser.getVersion');
  report.rafControl = await evaluate(`new Promise((resolve) => {
    const buckets = [0, 0]; let start, frames = 0;
    const frame = (now) => {
      if (start === undefined) start = now;
      const elapsed = now - start;
      if (elapsed >= 2000) {
        const sorted = [...buckets].sort((a, b) => a - b);
        resolve({ durationMs: elapsed, frames, buckets, medianFps: (sorted[0] + sorted[1]) / 2, p5Fps: sorted[0], visibility: document.visibilityState, focused: document.hasFocus() });
        return;
      }
      buckets[Math.min(1, Math.floor(elapsed / 1000))]++;
      frames++;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  })`, 8000);

  for (const [cameraName, camera] of Object.entries(cameras)) {
    const url = `${base}/kings-cross/?trains=replay&date=${replayDate}&speed=${replaySpeed}`;
    await S('Page.navigate', { url });
    const readyDeadline = Date.now() + 35_000;
    let pageState;
    while (Date.now() < readyDeadline) {
      pageState = await evaluate(`(() => {
        const k = window.__kx;
        if (!k?.ready) return null;
        return { firstFrameMs: k.firstFrameMs, mode: k.feed.mode, date: k.feed.date, speed: k.feed.speed, connection: k.feed.connection };
      })()`).catch(() => null);
      if (pageState?.firstFrameMs > 0 && pageState.mode === 'replay' && ['playing', 'recording ended'].includes(pageState.connection)) break;
      await delay(150);
    }
    if (!pageState?.firstFrameMs || pageState.mode !== 'replay' || !['playing', 'recording ended'].includes(pageState.connection)) {
      const connection = pageState?.connection ?? 'page not ready';
      throw new Error(`${cameraName}: replay page did not start within 35 seconds (${connection})`);
    }
    await evaluate(`(() => {
      const k = window.__kx;
      k.controls.maxDistance = 3000;
      k.camera.position.set(${camera.pos.join(',')});
      k.controls.target.set(${camera.target.join(',')});
      k.controls.update();
      return true;
    })()`);
    await evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await evaluate('new Promise((resolve) => setTimeout(resolve, 2000))', 5000);

    const measurement = await evaluate(`(() => new Promise((resolve) => {
      const durationMs = ${seconds * 1000};
      const k = window.__kx;
      const gl = k.renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererString = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const hiddenAtStart = document.visibilityState !== 'visible';
      const focusedAtStart = document.hasFocus();
      const controlFpsMedian = ${report.rafControl.medianFps};
      const startFeedMs = k.feed.timeMs ?? null;
      const dt = [], calls = [], triangles = [], shown = [], trainGroups = [], inMotion = [], moving = [];
      const movingIds = new Set(), startDistance = new Map(), maxTravel = new Map();
      const buckets = Array(Math.ceil(durationMs / 1000)).fill(0);
      let started, last;
      const done = (now) => {
        const quantile = (values, p) => {
          if (!values.length) return null;
          const sorted = [...values].sort((a, b) => a - b);
          return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
        };
        const feedTimeMs = k.feed.timeMs ?? null;
        const sortedBuckets = buckets.slice().sort((a, b) => a - b);
        const frameStats = (values) => ({ p5: quantile(values, 0.05), p50: quantile(values, 0.5), p95: quantile(values, 0.95), p99: quantile(values, 0.99) });
        const fpsMedian = quantile(sortedBuckets, 0.5);
        const fpsP5 = quantile(sortedBuckets, 0.05);
        const deltaP50 = quantile(dt, 0.5), deltaP95 = quantile(dt, 0.95), deltaP99 = quantile(dt, 0.99);
        const hidden = hiddenAtStart || document.visibilityState !== 'visible';
        const oneHzCadence = fpsMedian !== null && fpsMedian <= 2 && deltaP50 !== null && deltaP50 >= 400;
        const throttleReasons = [];
        if (hidden) throttleReasons.push('page hidden');
        if (oneHzCadence) throttleReasons.push('near-1-Hz rAF cadence');
        const movedIds = [...maxTravel.entries()].filter(([, distance]) => distance > 0.5).map(([id]) => id);
        return {
          durationSeconds: (now - started) / 1000,
          frames: dt.length + 1,
          renderer: rendererString,
          realMetal: /metal/i.test(rendererString) && !/swiftshader/i.test(rendererString),
          visibilityAtStart: hiddenAtStart ? 'hidden' : 'visible',
          focusedAtStart,
          visibilityAtEnd: document.visibilityState,
          focusedAtEnd: document.hasFocus(),
          blankPageControlFpsMedian: controlFpsMedian,
          rAFThrottleDetected: throttleReasons.length > 0,
          rAFThrottleReasons: throttleReasons,
          fpsBuckets: buckets,
          fps: { median: fpsMedian, p5: fpsP5, min: Math.min(...buckets), max: Math.max(...buckets) },
          frameMs: { p50: deltaP50, p95: deltaP95, p99: deltaP99, max: Math.max(...dt) },
          frameBudget: { targetFps: 60, budgetMs: 1000 / 60, p95WithinBudget: deltaP95 !== null && deltaP95 <= 1000 / 60, p99WithinBudget: deltaP99 !== null && deltaP99 <= 1000 / 60 },
          rendererCalls: frameStats(calls),
          triangles: frameStats(triangles),
          trainsShown: { min: Math.min(...shown), median: quantile(shown, 0.5), max: Math.max(...shown) },
          trainGroups: { min: Math.min(...trainGroups), median: quantile(trainGroups, 0.5), max: Math.max(...trainGroups) },
          motionTrains: { min: Math.min(...inMotion), median: quantile(inMotion, 0.5), max: Math.max(...inMotion) },
          trainMotion: { movingFrames: moving.filter(Boolean).length, movingTrainIds: [...movingIds], movedTrainIds: movedIds, maxTravelM: Math.max(0, ...maxTravel.values()) },
          replayProgress: { startMs: startFeedMs, endMs: feedTimeMs, advancedMs: startFeedMs === null || feedTimeMs === null ? null : feedTimeMs - startFeedMs, expectedMsAtSpeed: durationMs * ${replaySpeed}, connection: k.feed.connection },
        };
      };
      const frame = (now) => {
        if (started === undefined) { started = now; last = now; }
        const elapsed = now - started;
        if (now > last) dt.push(now - last);
        last = now;
        if (elapsed >= durationMs) { resolve(done(now)); return; }
        buckets[Math.min(buckets.length - 1, Math.floor(elapsed / 1000))]++;
        calls.push(k.renderer.info.render.calls);
        triangles.push(k.renderer.info.render.triangles);
        const trains = k.trains ?? [];
        trainGroups.push(trains.length);
        shown.push(trains.filter((train) => train.group?.visible && train.group.children.some((car) => car.visible)).length);
        const views = k.motionState ?? [];
        inMotion.push(views.length);
        let isMoving = false;
        for (const train of views) {
          if (train.state !== 'fading' && train.speed > 0.1) {
            isMoving = true;
            movingIds.add(train.id);
          }
          if (!startDistance.has(train.id)) startDistance.set(train.id, train.distanceM);
          maxTravel.set(train.id, Math.max(maxTravel.get(train.id) ?? 0, Math.abs(train.distanceM - startDistance.get(train.id))));
        }
        moving.push(isMoving);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }))()`, seconds * 1000 + 20_000);

    const normalized = {
      ...measurement,
      frameBudgetMs: rounded(measurement.frameBudget.budgetMs, 3),
      fps: Object.fromEntries(Object.entries(measurement.fps).map(([key, value]) => [key, rounded(value, 2)])),
      frameMs: Object.fromEntries(Object.entries(measurement.frameMs).map(([key, value]) => [key, rounded(value, 2)])),
      rendererCalls: Object.fromEntries(Object.entries(measurement.rendererCalls).map(([key, value]) => [key, rounded(value, 1)])),
      triangles: Object.fromEntries(Object.entries(measurement.triangles).map(([key, value]) => [key, rounded(value, 1)])),
      trainMotion: { ...measurement.trainMotion, maxTravelM: rounded(measurement.trainMotion.maxTravelM, 2) },
      replayProgress: {
        ...measurement.replayProgress,
        rateRatio: measurement.replayProgress.advancedMs === null ? null : rounded(measurement.replayProgress.advancedMs / measurement.replayProgress.expectedMsAtSpeed, 3),
      },
      frameBudget: { ...measurement.frameBudget, budgetMs: rounded(measurement.frameBudget.budgetMs, 3) },
    };
    normalized.fpsBuckets = measurement.fpsBuckets.map((fps) => rounded(fps, 2));
    report.cameras[cameraName] = normalized;
    console.log(JSON.stringify({ camera: cameraName, fps: normalized.fps, frameMs: normalized.frameMs, renderer: normalized.renderer, replayProgress: normalized.replayProgress, trainMotion: normalized.trainMotion }, null, 2));
  }

  report.consoleErrors = consoleErrors;
  report.success = true;
  const file = path.join(out, `perf-${stamp()}.json`);
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ report: file, out, consoleErrors: report.consoleErrors }, null, 2));
} catch (error) {
  report.consoleErrors = consoleErrors;
  report.success = false;
  report.failure = {
    message: String(error?.message ?? error).slice(0, 6000),
    stack: String(error?.stack ?? '').slice(0, 10_000),
  };
  report.chromeDiagnostics = {
    exitCode: chrome?.exitCode ?? null,
    signalCode: chrome?.signalCode ?? null,
    stdout: chromeStdout.slice(-2000),
    stderr: chromeStderr.slice(-4000),
  };
  const file = path.join(out, `perf-failure-${stamp()}.json`);
  try {
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    console.error(JSON.stringify({ failure: report.failure.message, report: file }, null, 2));
  } catch (writeError) {
    console.error(`Performance capture failed: ${report.failure.message}; failure report write also failed: ${writeError.message}`);
  }
  throw error;
} finally {
  await cleanup();
}
