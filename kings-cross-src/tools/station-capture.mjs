// Offline, deterministic station-switch evidence. Never proxies a relay upstream.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cdpPipe, manualFrames } from './signal-capture.mjs';
import { cleanupCaptureBrowser, createCaptureLifetime } from './capture-runtime.mjs';
import { readPng } from './axis01-pixels.mjs';

/** A CDP metrics acknowledgement precedes the browser resize task. Render only after it settles. */
export async function synchronizeCaptureViewport({ width, height, setMetrics, probe, render, previous,
  now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 5000 }) {
  await setMetrics(width, height);
  const deadline = now() + timeoutMs;
  let stable = 0, observed;
  do {
    observed = await probe();
    const changed = previous && (previous.viewportWidth !== width || previous.viewportHeight !== height);
    const ready = observed.viewportWidth === width && observed.viewportHeight === height &&
      observed.cssWidth === width && observed.cssHeight === height &&
      observed.canvasWidth === Math.round(width * observed.pixelRatio) && observed.canvasHeight === Math.round(height * observed.pixelRatio) &&
      observed.bufferWidth === observed.canvasWidth && observed.bufferHeight === observed.canvasHeight &&
      (!changed || observed.resizeSerial > previous.resizeSerial);
    stable = ready ? stable + 1 : 0;
    if (stable === 2) { await render(); return observed; }
    await sleep(25);
  } while (now() < deadline);
  throw Object.assign(new Error('capture resize did not synchronize viewport, CSS and drawing buffer'), { details: observed });
}

/** Exclude DOM panels before judging canvas pixels; labels cannot rescue an empty WebGL frame. */
export function inspectStationPixels(bytes, { canvas, excluded = [], placeholder = false }) {
  const image = readPng(bytes), rect = canvas ?? { left: 0, top: 0, right: image.width, bottom: image.height };
  let samples = 0, nonblack = 0, expected = 0;
  const sums = [0, 0, 0], squares = [0, 0, 0];
  for (let y = Math.max(0, Math.ceil(rect.top)); y < Math.min(image.height, rect.bottom); y++) {
    for (let x = Math.max(0, Math.ceil(rect.left)); x < Math.min(image.width, rect.right); x++) {
      if (excluded.some(r => x >= r.left && x < r.right && y >= r.top && y < r.bottom)) continue;
      const index = (y * image.width + x) * image.channels;
      const colour = [image.pixels[index], image.pixels[index + 1], image.pixels[index + 2]];
      samples++; if (Math.max(...colour) > 32) nonblack++;
      if (colour.every((value, channel) => Math.abs(value - [51, 68, 88][channel]) <= 3)) expected++;
      colour.forEach((value, channel) => { sums[channel] += value; squares[channel] += value * value; });
    }
  }
  const variance = samples ? sums.reduce((sum, value, channel) => sum + Math.max(0, squares[channel] / samples - (value / samples) ** 2), 0) / 3 : 0;
  const standardDeviation = Math.sqrt(variance), nonblackFraction = samples ? nonblack / samples : 0, expectedBackgroundFraction = samples ? expected / samples : 0;
  const clear = samples >= 100 && nonblackFraction >= .02 && (placeholder ? expectedBackgroundFraction >= .95 : standardDeviation >= 2);
  return { clear, reason: clear ? null : 'PNG canvas is black or blank after excluding DOM overlays', samples, nonblackFraction, standardDeviation, expectedBackgroundFraction, placeholder, canvas: rect, excluded, viewport: [image.width, image.height] };
}

export const GPU_HOLD = '/Users/md/worktrees/0x4d44.github.io/20261109-TSK-HUM-kings-cross-round-5-pack-and-scorer/.scratch/gpu-hold';
export async function waitForGpu({ hold = GPU_HOLD, exists = async p => { try { await access(p); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), timeoutMs = 1200000, log = console.log } = {}) {
  const deadline = now() + timeoutMs;
  while (await exists(hold)) {
    if (now() >= deadline) throw new Error(`GPU hold did not clear: ${hold}`);
    log(`GPU held by peer; waiting: ${hold}`);
    await sleep(Math.min(30000, deadline - now()));
  }
}
export function verifyMemoryReturn(baseline, current) {
  for (const key of ['geometries', 'textures']) {
    if (!Number.isFinite(baseline?.[key]) || !Number.isFinite(current?.[key])) throw new Error(`missing GPU memory counter: ${key}`);
    if (current[key] > baseline[key]) throw new Error(`GPU ${key} retained after station return: ${baseline[key]} -> ${current[key]}`);
  }
  return true;
}
export function verifyViewport(view) {
  if (view.canvases !== 1 || view.overflowX > 1 || view.overflowY > 1 || view.covered.length) throw new Error(`station viewport invariant failed: ${JSON.stringify(view)}`);
  return true;
}
export async function main(args = process.argv.slice(2)) {
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--dist', '--out', '--chrome'].includes(args[i]) || !args[i + 1] || options.has(args[i])) throw new Error('usage: station-capture.mjs --dist <built dist> --out <worktree/.scratch/a40-shots> [--chrome <path>]');
    options.set(args[i], args[i + 1]);
  }
  if (!options.has('--dist') || !options.has('--out')) throw new Error('--dist and --out required');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const scratch = await realpath(path.join(root, '.scratch'));
  const dist = await realpath(path.resolve(options.get('--dist'))), out = path.resolve(options.get('--out'));
  const inside = p => { const relative = path.relative(scratch, p); return relative === '' || !relative.startsWith('..') && !path.isAbsolute(relative); };
  if (!inside(out)) throw new Error('--out must be in worktree .scratch');
  let ancestor = out;
  for (;;) { try { if (!inside(await realpath(ancestor))) throw new Error('output symlink escapes .scratch'); break; } catch (error) { if (error.code !== 'ENOENT') throw error; ancestor = path.dirname(ancestor); } }
  await mkdir(out, { recursive: true });
  const chromePath = options.get('--chrome') ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  await access(chromePath);
  await waitForGpu(); // Check immediately before creating any GPU process.
  const lifetime = createCaptureLifetime({ timeoutMs: 600000 });
  let chrome, cdp, profile, server, cleanup;
  const report = { shots: [], switches: [], errors: [], clock: [], memory: [] };
  try {
    server = createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname === '/relay' || u.pathname.startsWith('/relay/')) { res.writeHead(404).end('offline capture: relay disabled'); return; }
        if (u.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
        let file;
        if (u.pathname === '/almanac-back.js') file = path.join(root, 'almanac-back.js');
        else if (u.pathname === '/kings-cross/' || u.pathname === '/kings-cross') file = path.join(dist, 'index.html');
        else if (u.pathname.startsWith('/kings-cross/')) {
          file = await realpath(path.resolve(dist, decodeURIComponent(u.pathname.slice('/kings-cross/'.length))));
          if (!file.startsWith(dist + path.sep)) throw new Error('path escape');
        }
        if (!file) { res.writeHead(404).end(); return; }
        const bytes = await readFile(file), type = /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(bytes);
      } catch { res.writeHead(404).end(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    profile = await mkdtemp(path.join(out, 'chrome-'));
    chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-breakpad', '--disable-crash-reporter', '--noerrdialogs', '--use-mock-keychain', '--password-store=basic', '--no-proxy-server', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu-rasterization', 'about:blank'], { detached: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
    chrome.stderr.setEncoding('utf8'); chrome.stderr.on('data', bytes => { report.chromeStderr = ((report.chromeStderr ?? '') + bytes).slice(-16000); });
    chrome.once('error', error => { report.chromeSpawnError = error.message; });
    lifetime.attach(chrome); cdp = cdpPipe(chrome);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => { lifetime.check(); return cdp.send(method, params, sessionId); };
    const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${manualFrames.toString()})();window.__captureResizeSerial=0;window.addEventListener('resize',()=>window.__captureResizeSerial++);` });
    const metrics = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await metrics(1440, 1000);
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/kings-cross/?trains=demo` });
    const end = Date.now() + 90000;
    while (!await evaluate('!!window.__kx?.stations')) { if (Date.now() >= end) throw new Error('station runtime startup timeout'); await new Promise(r => setTimeout(r, 100)); }
    await evaluate('window.__kx.cityLoaded');
    await evaluate('window.__captureTime=performance.now();window.__signalFrame(window.__captureTime)');
    report.renderer = await evaluate("(()=>{const g=window.__kx.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)})()");
    if (!/Metal/i.test(report.renderer) || /SwiftShader|llvmpipe|software/i.test(report.renderer)) throw new Error(`real Metal GPU required: ${report.renderer}`);
    const inspect = () => evaluate(`(()=>{const k=window.__kx,d=document.documentElement;return {url:location.href,resources:performance.getEntriesByType('resource').map(r=>r.name),pixels:{canvas:JSON.parse(JSON.stringify(k.renderer.domElement.getBoundingClientRect())),excluded:[{left:0,top:0,right:109,bottom:41},...[...document.body.children].filter(e=>e.id!=='app'&&!['SCRIPT','STYLE'].includes(e.tagName)).flatMap(e=>e.matches('.station-placeholder')?[...e.children]:[e]).map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0).map(r=>({left:r.left-2,top:r.top-2,right:r.right+2,bottom:r.bottom+2}))]},state:k.stations.state(),memory:{...k.renderer.info.memory},clock:{feed:{...k.feed},simulation:k.simulationTimeMs??null},camera:{position:k.camera.position.toArray(),target:k.controls.target.toArray()},text:document.body.innerText,viewport:{canvases:document.querySelectorAll('canvas').length,overflowX:d.scrollWidth-d.clientWidth,overflowY:d.scrollHeight-d.clientHeight,covered:[...document.querySelectorAll('a,button,input,select,[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left<109&&r.right>0&&r.top<41&&r.bottom>0}).map(e=>e.textContent)},buttons:[...document.querySelectorAll('button')].map(e=>({text:e.textContent,pressed:e.getAttribute('aria-pressed'),rect:JSON.parse(JSON.stringify(e.getBoundingClientRect()))}))}})()`);
    const frame = async delta => { const before = await inspect(); await evaluate(`window.__captureTime+=${delta};window.__signalFrame(window.__captureTime)`); const after = await inspect(); report.clock.push({ delta, before: before.clock, after: after.clock }); if (Number.isFinite(before.clock.simulation) && Number.isFinite(after.clock.simulation) && Math.abs(after.clock.simulation - before.clock.simulation - delta) > 1e-5) throw new Error('manual frame delta did not advance simulation clock exactly'); };
    const shot = async name => {
      await frame(0); // A same-time render preserves the clock and repaints any freshly resized buffer.
      const observed = await inspect(), png = await send('Page.captureScreenshot', { format: 'png' }), bytes = Buffer.from(png.data, 'base64');
      await writeFile(path.join(out, name + '.png'), bytes);
      const pixels = inspectStationPixels(bytes, { ...observed.pixels, placeholder: observed.state.selected === 'edinburgh-waverley' });
      report.shots.push({ name, ...observed, pixels });
      await writeFile(path.join(out, name + '.json'), JSON.stringify({ name, ...observed, pixels }, null, 2) + '\n');
      verifyViewport(observed.viewport);
      if (!pixels.clear) throw Object.assign(new Error(`${name}: ${pixels.reason}`), { details: pixels });
      return observed;
    };
    const select = async id => {
      const before = await inspect();
      await evaluate(`window.__kx.stations.select(${JSON.stringify(id)})`);
      const after = await inspect();
      if (before.clock.feed.timeMs !== after.clock.feed.timeMs) throw new Error('station select changed UTC feed clock without a manual frame');
      if (new URL(after.url).searchParams.get('station') !== id) throw new Error('station selection did not update bookmark'); report.switches.push({ id, before: before.state, after: after.state });
    };
    await shot('01-kings-cross');
    await select('st-pancras'); await frame(900); const mid = await shot('02-london-flight'); if (mid.state.phase !== 'flying') throw new Error(`expected London midflight, observed ${mid.state.phase}`); await frame(2000); const stp = await shot('03-st-pancras'); if (stp.state.selected !== 'st-pancras' || stp.state.phase !== 'ready') throw new Error('St Pancras endpoint not ready'); if (!/view only/i.test(stp.state.message) || !/not (?:yet )?enabled/i.test(stp.state.message)) throw new Error('St Pancras lacks honest view-only/no-live-trains labels');
    await select('edinburgh-waverley'); await frame(700); const waverley = await shot('04-waverley-placeholder');
    if (!/not (?:yet )?(?:built|available)|placeholder|planned|unavailable|not modelled|not modeled|not loaded/i.test(waverley.text)) throw new Error('Waverley lacks an honest unavailable label');
    await select('kings-cross'); await frame(2100);
    report.cancellations = [];
    for (const id of ['st-pancras', 'kings-cross']) {
      await select(id); await frame(450);
      await evaluate("window.__kx.controls.dispatchEvent({type:'start'})");
      const stopped = await inspect(); await frame(150); const later = await inspect();
      if (stopped.camera.position.some((v, i) => Math.abs(v - later.camera.position[i]) > 1e-7) || stopped.camera.target.some((v, i) => Math.abs(v - later.camera.target[i]) > 1e-7)) throw new Error('camera resumed after user cancelled station flight');
      report.cancellations.push({ id, stopped: stopped.camera, later: later.camera });
    }
    await select('st-pancras'); await frame(2100); await select('kings-cross'); await frame(2100);
    const baseline = await inspect(); report.memory.push({ name: 'warm-kings-cross', ...baseline.memory });
    for (let n = 0; n < 3; n++) for (const id of ['st-pancras', 'edinburgh-waverley', 'kings-cross']) { await select(id); await frame(2100); const current = await inspect(); report.memory.push({ cycle: n, id, ...current.memory }); if (id === 'kings-cross') verifyMemoryReturn(baseline.memory, current.memory); }
    const probeSize = () => evaluate(`new Promise(resolve=>setTimeout(()=>{const k=window.__kx,c=k.renderer.domElement,g=k.renderer.getContext();resolve({viewportWidth:innerWidth,viewportHeight:innerHeight,cssWidth:c.clientWidth,cssHeight:c.clientHeight,canvasWidth:c.width,canvasHeight:c.height,bufferWidth:g.drawingBufferWidth,bufferHeight:g.drawingBufferHeight,pixelRatio:k.renderer.getPixelRatio(),resizeSerial:window.__captureResizeSerial})},0))`);
    report.mobileResize = await synchronizeCaptureViewport({ width: 390, height: 844, previous: await probeSize(), setMetrics: metrics, probe: probeSize, render: () => frame(0) });
    await frame(16); await shot('05-mobile-kings-cross');
    await select('st-pancras'); await frame(2100); await shot('06-mobile-st-pancras');
    await select('edinburgh-waverley'); await frame(2100); await shot('07-mobile-waverley');
    report.final = await inspect();
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await select('kings-cross'); const reduced = await inspect();
    if (reduced.state.phase !== 'ready') throw new Error('reduced motion station switch did not settle immediately');
    await frame(0); report.reducedMotion = await inspect();
    report.lazyResources = [...new Set(report.shots.flatMap(shot => shot.resources))].filter(url => !report.shots[0].resources.includes(url));
  } catch (error) { report.errors.push(error.stack ?? error.message); if (error.details) report.failureDetails = error.details; process.exitCode = 1; }
  finally {
    cdp?.close(); cleanup = await cleanupCaptureBrowser(chrome, profile); lifetime.dispose();
    server?.closeAllConnections(); if (server?.listening) await new Promise(resolve => server.close(resolve));
    report.chromeExit = { code: chrome?.exitCode, signal: chrome?.signalCode }; report.cleanup = cleanup; await writeFile(path.join(out, 'captures.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({ out, shots: report.shots.length, errors: report.errors, renderer: report.renderer, cleanup }));
  if (report.errors.length) throw new Error(report.errors[0]);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
