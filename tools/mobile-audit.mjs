// Mobile-layout oracle for almanac documents.
//
// Drives headless Chrome over the DevTools Protocol so we get a TRUE narrow
// viewport. `chrome --headless=new --window-size=390,844` does NOT: it clamps
// innerWidth to a 500px minimum and merely crops the screenshot, which looks
// exactly like overflow but isn't (see lessons_learnt.md, 2026-07-02).
// Emulation.setDeviceMetricsOverride is the only honest way to get 390px.
//
// It reports, at a given width: document-level horizontal overflow (ignoring
// content that legitimately scrolls inside an overflow-x:auto container),
// multi-column grids whose tracks are too narrow to read, and interactive
// elements below the 44px touch target. It refuses to report numbers for a page
// that never booted — a blank screen otherwise scores a perfect "0px overflow".
//
// Usage:
//   node tools/mobile-audit.mjs <slug> [flags]
//     --width=390      CSS viewport width to emulate
//     --height=844     CSS viewport height
//     --shot=out.png   write a screenshot
//     --maxH=1500      cap screenshot height (readable crop; 2x DPR if ≤2000)
//     --clipAt=sim     start the screenshot at element #sim's offsetTop
//     --eval='<js>'    run an expression in the page and print it (diagnostics)
//   CHROME_PATH env var overrides Chrome discovery.
//
// Exit: 0 = no overflow, 1 = overflow found, 2 = harness timeout,
//       3 = page did not boot.
//
// DC documents pull React from unpkg; when that host is unreachable this fulfils
// it from the vendored UMD so the page still boots offline. See lessons_learnt
// (2026-07-11) for the two flake traps this harness had to close.

import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--')) ?? 'cruise-propulsion';
const width = Number(args.find((a) => a.startsWith('--width='))?.split('=')[1] ?? 390);
const height = Number(args.find((a) => a.startsWith('--height='))?.split('=')[1] ?? 844);
const shot = args.find((a) => a.startsWith('--shot='))?.split('=')[1];
// Cap the captured height (CSS px) — a readable crop of the top instead of a
// 16000px full-page thumbnail. deviceScaleFactor stays 2 when capped so the
// crop is legible.
const maxH = Number(args.find((a) => a.startsWith('--maxH='))?.split('=')[1] ?? 0);
// Capture starting at a named element (its offsetTop) instead of page top —
// lets us screenshot a section deep in a 16000px document.
const clipAt = args.find((a) => a.startsWith('--clipAt='))?.split('=')[1];
const root = resolve(import.meta.dirname, '..');

const CHROME = process.env.CHROME_PATH
  ?? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => existsSync(p))
  ?? 'chrome';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
};

// --- static server -----------------------------------------------------------
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/${slug}/`;

// --- chrome + CDP ------------------------------------------------------------
// Stage tracing + a hard watchdog: a CDP script that stalls (chrome never
// reports its port, a load event that never fires) would otherwise hang the
// harness forever with zero output.
let stage = 'start';
const trace = (s) => { stage = s; process.stderr.write(`[audit] ${s}\n`); };
// chrome.kill() only kills the launcher on Windows; the renderer/GPU children
// survive, hold their debug port, and poison later runs. Kill the whole tree —
// and ONLY our own pid tree, never every chrome.exe on the box (the user's real
// browser is almost certainly running).
let killChrome = () => {};
const watchdog = setTimeout(() => {
  console.error(`\n!! mobile-audit timed out while: ${stage}`);
  killChrome();
  process.exit(2);
}, 90_000);
watchdog.unref?.();

trace('launching chrome');
const profile = await mkdtemp(join(tmpdir(), 'mobile-audit-'));
// Take a port the OS says is free. A derived port (e.g. 9333 + pid % 400) can
// collide with a leaked Chrome from an earlier run: /json/version then answers
// from the STALE browser, we drive that instead of ours, and the run fails in
// bizarre, non-reproducible ways.
const debugPort = await new Promise((res) => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => res(port));
  });
});
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

killChrome = () => {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-chrome.pid, 'SIGKILL');
    }
  } catch { /* already gone */ }
};
process.on('exit', killChrome);

// Poll the HTTP endpoint rather than sniffing stderr for the ws:// line —
// Chrome's stderr is block-buffered on Windows and the line may never arrive.
trace(`waiting for CDP on :${debugPort}`);
const wsUrl = await (async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('chrome never opened its debug port');
})();

trace('connecting websocket');
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params, sessionId }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);

await S('Page.enable');
await S('Runtime.enable');
await S('Log.enable');

// Surface page errors — a blank render is otherwise indistinguishable from a
// page that legitimately has no overflow.
const pageErrors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    pageErrors.push(`EXCEPTION: ${d.exception?.description ?? d.text} @ ${d.url ?? '?'}:${d.lineNumber}`);
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    pageErrors.push(`${m.params.entry.source}: ${m.params.entry.text} @ ${m.params.entry.url ?? '?'}`);
  }
  // A runtime that catches its own failure and console.errors it would
  // otherwise be invisible here — and a silently-blank page reports a
  // reassuring "0px overflow".
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    const text = m.params.args
      .map((a) => a.description ?? a.value ?? a.preview?.description ?? JSON.stringify(a.preview ?? ''))
      .join(' ');
    pageErrors.push(`console.${m.params.type}: ${text}`);
  }
});
// The honest narrow viewport.
await S('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 2, mobile: true,
  screenOrientation: { angle: 0, type: 'portraitPrimary' },
});
await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

// The DC runtime pulls React 18.3.1 UMD from unpkg at runtime, which this
// sandbox cannot reach — the page would render blank and then honestly report
// "no overflow". support.js's loadReactUmd() short-circuits when window.React
// and window.ReactDOM already exist, so evaluate the vendored UMD (from
// broadband-speed-checker, kept byte-stable by .gitattributes) on the new
// document before any page script runs. unpkg is then never touched, and we
// sidestep the SRI check entirely.
for (const f of ['react.production.min.js', 'react-dom.production.min.js']) {
  const src = await readFile(join(root, 'broadband-speed-checker/vendor', f), 'utf8');
  await S('Page.addScriptToEvaluateOnNewDocument', { source: src });
}
// Anything else off-box (fonts are fine; block stray CDN calls so a network
// stall can't be mistaken for a layout result).
await S('Fetch.enable', { patterns: [{ urlPattern: 'https://unpkg.com/*' }] });
ws.addEventListener('message', async (e) => {
  const m = JSON.parse(e.data);
  if (m.method !== 'Fetch.requestPaused') return;
  await S('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
});

trace(`navigating to ${url}`);
const loaded = new Promise((r) => {
  const h = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Page.loadEventFired') {
      ws.removeEventListener('message', h);
      r();
    }
  };
  ws.addEventListener('message', h);
  // The page runs a perpetual rAF loop; if the load event is ever missed we
  // still want a measurement rather than a hang.
  setTimeout(r, 20_000);
});
await S('Page.navigate', { url });
await loaded;
// GUARD: a page that never booted reports a serene "0px overflow, 0 crushed
// grids, 0 small touch targets" — a perfect score for a blank screen. That is
// the single most dangerous failure mode of this whole harness, so assert the
// app is actually up before believing any number it gives us.
//
// POLL, don't sample once: the DC boot chain (inject React UMD → compile a
// large template → first paint) can take well over 2s under machine load, so a
// fixed-delay check races the compiler and emits false "did not boot" verdicts
// that look exactly like a real regression. Waiting for the ready CONDITION
// instead of a fixed time makes the result independent of load — the whole
// point of a trustworthy oracle.
trace('waiting for boot');
const readyExpr = `JSON.stringify({
  react: typeof window.React,
  registry: Object.keys(window.__dcRegistry || {}).length,
  elements: document.querySelectorAll('*').length,
})`;
let b = { react: 'undefined', registry: 0, elements: 0 };
const bootDeadline = 30_000;
for (let waited = 0; waited < bootDeadline; waited += 250) {
  const r = await S('Runtime.evaluate', { returnByValue: true, expression: readyExpr });
  b = JSON.parse(r.result.value);
  if (b.react === 'object' && b.registry > 0 && b.elements >= 100) break;
  await new Promise((r) => setTimeout(r, 250));
}
if (b.react !== 'object' || b.registry === 0 || b.elements < 100) {
  console.error(`\n!! PAGE DID NOT BOOT within ${bootDeadline / 1000}s — refusing to report layout numbers.`);
  console.error(`   React=${b.react}  dcRegistry=${b.registry} components  elements=${b.elements}`);
  if (pageErrors.length) {
    console.error('   page errors:');
    for (const e of [...new Set(pageErrors)].slice(0, 8)) console.error(`     ${e}`);
  } else {
    console.error('   (no page errors — the DC template compiler failed silently)');
  }
  clearTimeout(watchdog);
  ws.close(); killChrome(); server.close();
  process.exit(3);
}
// Booted. Let one more frame settle so canvas/late layout stabilises.
await new Promise((r) => setTimeout(r, 400));
trace('measuring');

// --- the measurement ---------------------------------------------------------
const probe = `(() => {
  const vw = document.documentElement.clientWidth;
  const overflow = Math.max(
    document.documentElement.scrollWidth,
    document.body ? document.body.scrollWidth : 0,
  ) - vw;

  // Every element whose box crosses the right viewport edge, keeping only the
  // OUTERMOST offender in each chain (a wide parent drags its children along;
  // reporting the children is noise).
  //
  // Crucially, IGNORE anything living inside an overflow-x:auto/scroll/hidden
  // ancestor: this document deliberately puts a 820px-min table and a 1000px
  // single-line diagram inside scrolling cards. Those are wide by design and
  // never widen the page. Only overflow that actually reaches the document is a
  // bug.
  const escapesToDocument = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return false;
    }
    return true;
  };
  const wide = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (getComputedStyle(el).position === 'fixed') continue;
    if (!escapesToDocument(el)) continue;
    wide.push(el);
  }
  const outermost = wide.filter((el) => !wide.some((o) => o !== el && o.contains(el)));

  // Layout that "fits" can still be unusable: a 5-across grid on a 390px phone
  // gives every cell ~60px. Flag multi-column grids whose tracks are too narrow
  // to read, and cells whose text is wider than the cell.
  const crushed = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display !== 'grid') continue;
    const tracks = cs.gridTemplateColumns.split(' ').filter(Boolean).map(parseFloat);
    if (tracks.length < 2 || tracks.some(Number.isNaN)) continue;
    const narrowest = Math.min(...tracks);
    if (narrowest >= 150) continue;
    crushed.push({
      id: el.id || null,
      cls: typeof el.className === 'string' ? el.className.slice(0, 30) : null,
      cols: tracks.length,
      narrowest: Math.round(narrowest),
      text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 50),
    });
  }

  const describe = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      cls: el.className && typeof el.className === 'string' ? el.className.slice(0, 40) : null,
      text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60),
      left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
      overhang: Math.round(r.right - vw),
      display: cs.display,
      gridCols: cs.gridTemplateColumns,
      minWidth: cs.minWidth,
      whiteSpace: cs.whiteSpace,
    };
  };

  // Touch-target audit: interactive things smaller than 44x44 CSS px.
  const small = [...document.querySelectorAll('a,button,input,select,summary,[role=button]')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 24))
    .map(({ el, r }) => ({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || el.getAttribute('aria-label') || el.type || '').trim().slice(0, 30),
      w: Math.round(r.width), h: Math.round(r.height),
    }));

  return JSON.stringify({
    vw, innerWidth: window.innerWidth, overflow,
    elementCount: document.querySelectorAll('*').length,
    // scrollHeight, not getBoundingClientRect().height — body is height:auto so
    // its border box reads as the viewport height, which would clip the
    // full-page screenshot to one screen.
    bodyHeight: Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0,
    ),
    docScrollWidth: document.documentElement.scrollWidth,
    offenders: outermost.map(describe).sort((a, b) => b.overhang - a.overhang),
    crushed: crushed.sort((a, b) => a.narrowest - b.narrowest),
    smallTargets: small,
    smallTargetCount: small.length,
  }, null, 2);
})()`;

// --eval='<js>' — run an arbitrary expression in the page and dump it. Escape
// hatch for diagnosing why a page rendered the way it did.
const evalExpr = args.find((a) => a.startsWith('--eval='))?.slice(7);
if (evalExpr) {
  const r = await S('Runtime.evaluate', { expression: evalExpr, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails ?? r, null, 2));
  clearTimeout(watchdog);
  ws.close(); killChrome(); server.close();
  process.exit(0);
}

const { result } = await S('Runtime.evaluate', { expression: probe, returnByValue: true });
const data = JSON.parse(result.value);
trace('reporting');

if (pageErrors.length) {
  console.log(`--- ${pageErrors.length} page error(s) ---`);
  for (const e of [...new Set(pageErrors)].slice(0, 10)) console.log(`  ${e}`);
  console.log('');
}
// A page that rendered nothing reports "no overflow" — which is a lie, not a pass.
if (data.elementCount < 30 || data.bodyHeight < 400) {
  console.log(`!! PAGE DID NOT RENDER (${data.elementCount} elements, body ${data.bodyHeight}px tall)`);
  console.log('   Measurements below are meaningless.\n');
}
// NB: compare against documentElement.clientWidth (the initial containing
// block), not window.innerWidth — under mobile emulation Chrome widens the
// VISUAL viewport to the content, so innerWidth reads back larger than the
// emulated width whenever the page overflows. That is a symptom, not a failure
// of the override.
console.log(`viewport ${width}x${height}  layoutWidth=${data.vw}  scrollWidth=${data.docScrollWidth}`);
console.log(`elements=${data.elementCount}  bodyHeight=${data.bodyHeight}`);
if (data.vw !== width) {
  console.log(`!! viewport override failed (clientWidth ${data.vw} != ${width})`);
}
console.log(`horizontal overflow: ${data.overflow}px`);
console.log(`crushed grids (<150px tracks): ${data.crushed.length}`);
console.log(`sub-44px touch targets: ${data.smallTargetCount}`);
console.log('');
if (data.crushed.length) {
  console.log('--- grids too narrow to read ---');
  for (const c of data.crushed) {
    console.log(`  ${c.cols} cols, narrowest ${c.narrowest}px  ${c.id ? '#' + c.id : '.' + c.cls}`);
    if (c.text) console.log(`           "${c.text}"`);
  }
  console.log('');
}
if (data.offenders.length) {
  console.log(`--- ${data.offenders.length} outermost overflowing element(s) ---`);
  for (const o of data.offenders) {
    console.log(
      `  +${o.overhang}px  <${o.tag}${o.id ? '#' + o.id : ''}>  w=${o.width} [${o.left}..${o.right}]  ` +
      `display=${o.display}${o.gridCols !== 'none' ? ` cols="${o.gridCols}"` : ''}` +
      `${o.minWidth !== '0px' ? ` min-width=${o.minWidth}` : ''}`,
    );
    if (o.text) console.log(`           "${o.text}"`);
  }
}
if (data.smallTargets.length) {
  console.log(`\n--- small touch targets ---`);
  for (const t of data.smallTargets.slice(0, 20)) {
    console.log(`  <${t.tag}> ${t.w}x${t.h}  "${t.text}"`);
  }
}

// Screenshot last, and defensively: the report above is already printed, so a
// slow full-page capture must never cost us the measurement. This document is
// ~16000px tall — at 2x DPR that is a 12k×… PNG that can take a minute to
// encode. Drop to 1x for the capture, and race it against its own timeout so a
// stall degrades to "no image", not a killed run.
if (shot) {
  trace('screenshotting');
  let clipY = 0;
  if (clipAt) {
    const r = await S('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{const e=document.getElementById(${JSON.stringify(clipAt)});return e?Math.round(e.getBoundingClientRect().top+window.scrollY):0})()`,
    });
    clipY = r.result.value || 0;
  }
  const clipH = Math.min(maxH || data.bodyHeight || height, 16_000);
  // A short capped crop can afford 2x DPR (legible); a full-page shot cannot.
  const dpr = maxH && maxH <= 2000 ? 2 : 1;
  await S('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: dpr, mobile: true,
    screenOrientation: { angle: 0, type: 'portraitPrimary' },
  });
  try {
    const png = await Promise.race([
      S('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: clipY, width, height: clipH, scale: 1 },
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('screenshot timed out')), 45_000)),
    ]);
    await writeFile(shot, Buffer.from(png.data, 'base64'));
    console.log(`\nscreenshot: ${shot} (${width}x${clipH})`);
  } catch (err) {
    console.log(`\n(screenshot skipped: ${err.message})`);
  }
}

clearTimeout(watchdog);
ws.close();
killChrome();
server.close();
process.exit(data.overflow > 1 ? 1 : 0);
