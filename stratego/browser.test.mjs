import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class Cdp {
  constructor(url) {
    this.url = url;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws = null;
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', event => {
      const packet = JSON.parse(String(event.data));
      if (packet.id) {
        const pending = this.pending.get(packet.id);
        if (!pending) return;
        this.pending.delete(packet.id);
        if (packet.error) pending.reject(new Error(`${pending.method}: ${packet.error.message}`));
        else pending.resolve(packet.result || {});
        return;
      }
      for (const handler of this.listeners.get(packet.method) || []) handler(packet.params || {});
    });
    this.ws.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('Chrome DevTools connection closed'));
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    const handlers = this.listeners.get(method) || [];
    handlers.push(handler);
    this.listeners.set(method, handlers);
  }

  close() {
    if (this.ws && this.ws.readyState < 2) this.ws.close();
  }
}

async function poll(fn, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) { last = error; }
    await sleep(50);
  }
  throw new Error(`${label} timed out${last ? `: ${last.message}` : ''}`);
}

async function evaluate(cdp, expression, awaitPromise = true) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: false });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'evaluation failed');
  return result.result?.value;
}

function safeInline(source) {
  return source.replaceAll('</script', '<\\/script');
}

let assetPromise;
async function assets() {
  if (!assetPromise) assetPromise = Promise.all([
    readFile(join(here, 'index.html'), 'utf8'),
    readFile(join(here, 'styles.css'), 'utf8'),
    readFile(join(here, 'stratego-core.js'), 'utf8'),
    readFile(join(here, 'stratego-ai.js'), 'utf8'),
    readFile(join(here, 'app.js'), 'utf8'),
  ]).then(([html, css, core, ai, app]) => ({ html, css, core, ai, app }));
  return assetPromise;
}

async function loadPage(cdp, { demo = false, storage = {} } = {}) {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await poll(() => evaluate(cdp, 'document.readyState === "complete"'), 'blank document');
  const source = await assets();
  const storageJson = JSON.stringify(storage).replaceAll('<', '\\u003c');
  const prelude = `
    window.__STRATEGO_TEST__ = true;
    window.__STRATEGO_TEST_DEMO__ = ${demo ? 'true' : 'false'};
    (() => {
      const values = new Map(Object.entries(${storageJson}));
      const mock = {
        getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
        setItem(key, value) { values.set(String(key), String(value)); },
        removeItem(key) { values.delete(String(key)); },
        clear() { values.clear(); },
        key(index) { return [...values.keys()][index] ?? null; },
        get length() { return values.size; },
      };
      Object.defineProperty(window, 'localStorage', { configurable: true, value: mock });
    })();`;
  let html = source.html
    .replace('<link rel="stylesheet" href="styles.css" />', `<style>${source.css}</style>`)
    .replace('<script src="stratego-core.js"></script>', `<script>${safeInline(source.core)}</script>`)
    .replace('<script src="stratego-ai.js"></script>', `<script>${safeInline(source.ai)}</script>`)
    .replace('<script src="app.js"></script>', `<script>${safeInline(source.app)}</script>`)
    .replace('<script defer src="/almanac-back.js"></script>', '<script>(()=>{const node=document.createElement("a");node.id="almanac-test-back";node.href="/";node.textContent="Almanac";node.style.cssText="position:fixed;top:10px;left:10px;z-index:2147483647";document.body.appendChild(node);})();</script>')
    .replace('</head>', `<script>${safeInline(prelude)}</script></head>`);

  const tree = await cdp.send('Page.getFrameTree');
  const frameId = tree.frameTree.frame.id;
  await cdp.send('Page.setDocumentContent', { frameId, html });
  await poll(() => evaluate(cdp, 'document.readyState === "complete" && !!window.StrategoApp && !!window.StrategoCore'), 'Stratego application');
  await sleep(150);
}

async function setViewport(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 600, screenWidth: width, screenHeight: height });
  await sleep(90);
}

async function takeScreenshot(cdp, path) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(data, 'base64'));
}

// Resolve a browser the same way the repo's other browser tests do: a platform
// candidate list with CHROME_PATH as the override. Hard-coding a single Unix
// path made this suite abort on Windows before a single test ran.
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try { await readFile(candidate); return candidate; } catch { /* try next */ }
  }
  return null;
}

async function launchChrome() {
  const binary = await findChrome();
  if (!binary) throw new Error('no Chrome/Chromium found; set CHROME_PATH');
  const profile = await mkdtemp(join(tmpdir(), 'stratego-chrome-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(binary, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-default-apps', '--disable-extensions',
    '--disable-features=Translate,MediaRouter,OptimizationHints', '--disable-sync', '--metrics-recording-only',
    '--mute-audio', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });

  const target = await poll(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) return null;
    const list = await response.json();
    return list.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
  }, 'Chromium DevTools endpoint', 15000);

  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');

  return {
    cdp,
    async close() {
      cdp.close();
      // Negative-pid group signals are POSIX-only; on Windows the detached
      // child must be torn down through taskkill or it outlives the run.
      const stop = force => {
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(child.pid), '/T', ...(force ? ['/F'] : [])],
              { stdio: 'ignore' });
          } else {
            process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
          }
        } catch (_) { /* already gone */ }
      };
      stop(false);
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(800)]);
      if (child.exitCode === null) stop(true);
      // Windows keeps a lock on the crashpad metrics file for a moment after
      // the browser dies. A stranded temp profile is not a test failure, so
      // retry briefly and then let the OS reap it.
      for (let attempt = 0; attempt < 5; attempt++) {
        try { await rm(profile, { recursive: true, force: true }); return; }
        catch { await sleep(200); }
      }
    },
  };
}

let browser;
const severe = [];

test.before(async () => {
  browser = await launchChrome();
  browser.cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => severe.push(exceptionDetails.exception?.description || exceptionDetails.text || 'uncaught exception'));
  browser.cdp.on('Log.entryAdded', ({ entry }) => { if (entry.level === 'error') severe.push(`${entry.source}: ${entry.text}`); });
  await loadPage(browser.cdp, { demo: true });
});

test.after(async () => { if (browser) await browser.close(); });

test('demo renders the full battlefield without concealed-rank DOM leakage', async () => {
  const facts = await evaluate(browser.cdp, `(() => {
    const view = StrategoApp.publicState();
    const enemyNodes = [...document.querySelectorAll('.cell[data-owner="blue"]')];
    const rankWords = ['marshal','general','colonel','major','captain','lieutenant','sergeant','miner','scout','spy','bomb','flag'];
    const leaks = enemyNodes.filter(node => rankWords.some(word => node.outerHTML.toLowerCase().includes(word)));
    return {
      cells: document.querySelectorAll('.cell').length,
      pieces: document.querySelectorAll('.piece').length,
      faces: document.querySelectorAll('.piece-face').length,
      red: Object.values(view.pieces).filter(piece => piece.color === 'red').length,
      blue: Object.values(view.pieces).filter(piece => piece.color === 'blue').length,
      hiddenBlue: Object.values(view.pieces).filter(piece => piece.color === 'blue' && piece.type === null).length,
      leaks: leaks.length,
      backButton: !!document.getElementById('almanac-test-back'),
    };
  })()`);
  assert.deepEqual(facts, { cells: 100, pieces: 80, faces: 40, red: 40, blue: 40, hiddenBlue: 40, leaks: 0, backButton: true });
});

test('all target viewport widths fit without horizontal overflow', async () => {
  for (const [width, height] of [[1280, 900], [1081, 900], [1080, 900], [768, 900], [390, 844], [320, 720]]) {
    await setViewport(browser.cdp, width, height);
    const bounds = await evaluate(browser.cdp, `({ viewport: innerWidth, document: document.documentElement.scrollWidth, titleRight: document.querySelector('.box-lid').getBoundingClientRect().right, boardRight: document.querySelector('.board-frame').getBoundingClientRect().right })`);
    assert.ok(bounds.document <= bounds.viewport + 1, `${width}px layout overflows: ${JSON.stringify(bounds)}`);
    assert.ok(bounds.titleRight <= bounds.viewport + 1, `${width}px masthead escapes viewport`);
    assert.ok(bounds.boardRight <= bounds.viewport + 1, `${width}px board escapes viewport`);
  }
});

test('keyboard traversal includes impassable lake cells safely', async () => {
  await setViewport(browser.cdp, 1280, 900);
  const result = await evaluate(browser.cdp, `(() => {
    const lake = document.querySelector('.cell[data-lake="true"]');
    lake.tabIndex = 0; lake.focus();
    const before = document.activeElement.dataset.row + ',' + document.activeElement.dataset.col;
    lake.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const after = document.activeElement.dataset.row + ',' + document.activeElement.dataset.col;
    return { before, after, disabled: lake.getAttribute('aria-disabled'), tag: lake.tagName };
  })()`);
  assert.equal(result.disabled, 'true');
  assert.equal(result.tag, 'BUTTON');
  assert.notEqual(result.after, result.before);
});

test('a real public game move advances the authoritative state', async () => {
  await loadPage(browser.cdp, { demo: true });
  const result = await evaluate(browser.cdp, `(() => {
    const before = StrategoApp.getState();
    const move = StrategoCore.allLegalMoves(before, 'red').find(candidate => !candidate.attack);
    StrategoApp.clickCell(move.from.row, move.from.col);
    StrategoApp.clickCell(move.to.row, move.to.col);
    const after = StrategoApp.getState();
    return { before: before.moveNumber, after: after.moveNumber, current: after.current, fromEmpty: after.board[StrategoCore.boardIndex(move.from.row, move.from.col)] === null };
  })()`);
  assert.deepEqual(result, { before: 0, after: 1, current: 'blue', fromEmpty: true });
});

test('setup click-to-swap changes formation without changing the manifest', async () => {
  await loadPage(browser.cdp);
  await poll(() => evaluate(browser.cdp, 'document.getElementById("campaign-dialog").open'), 'campaign dialog');
  await evaluate(browser.cdp, `(() => { document.querySelector('input[name="mode"][value="solo"]').checked = true; document.getElementById('campaign-start').click(); })()`);
  const result = await evaluate(browser.cdp, `(() => {
    const before = StrategoApp.getState();
    const pieces = Object.values(before.pieces).filter(piece => piece.color === 'red' && piece.alive).slice(0, 2);
    const first = { row: pieces[0].row, col: pieces[0].col, id: pieces[0].id };
    const second = { row: pieces[1].row, col: pieces[1].col, id: pieces[1].id };
    StrategoApp.clickCell(first.row, first.col); StrategoApp.clickCell(second.row, second.col);
    const after = StrategoApp.getState();
    return { firstMoved: after.pieces[first.id].row === second.row && after.pieces[first.id].col === second.col, secondMoved: after.pieces[second.id].row === first.row && after.pieces[second.id].col === first.col, count: Object.values(after.pieces).filter(piece => piece.color === 'red').length, valid: StrategoCore.assertValidState(after) };
  })()`);
  assert.deepEqual(result, { firstMoved: true, secondMoved: true, count: 40, valid: true });
});

test('restoring hot-seat play locks privacy before constructing rank faces', async () => {
  await loadPage(browser.cdp, { demo: true });
  const saved = await evaluate(browser.cdp, `(() => {
    let state = StrategoCore.createState({ seed: 9064, mode: 'hotseat' });
    state = StrategoCore.deployFormation(state, 'red', 'fortress', 1);
    state = StrategoCore.deployFormation(state, 'blue', 'feint', 2);
    state = StrategoCore.beginGame(state);
    return StrategoCore.serialiseState(state);
  })()`);
  await loadPage(browser.cdp, { storage: { '0x4d44.stratego.v1': saved } });
  await poll(() => evaluate(browser.cdp, 'document.getElementById("campaign-dialog").open && !document.getElementById("continue-button").hidden'), 'stored campaign prompt');
  const result = await evaluate(browser.cdp, `(async () => {
    const board = document.getElementById('board'); let transientFaces = 0;
    const observer = new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) transientFaces += node.matches?.('.piece-face') ? 1 : node.querySelectorAll?.('.piece-face').length || 0; });
    observer.observe(board, { childList: true, subtree: true });
    document.getElementById('continue-button').click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observer.disconnect();
    return { locked: StrategoApp.privacyLocked(), shutterHidden: document.getElementById('privacy-shutter').hidden, faces: document.querySelectorAll('.piece-face').length, pieces: document.querySelectorAll('.piece').length, transientFaces };
  })()`);
  assert.deepEqual(result, { locked: true, shutterHidden: false, faces: 0, pieces: 80, transientFaces: 0 });
});

test('desktop and mobile screenshots can be retained for visual review', async () => {
  const directory = process.env.STRATEGO_SCREENSHOT_DIR;
  if (!directory) return;
  await loadPage(browser.cdp, { demo: true });
  await setViewport(browser.cdp, 1280, 900); await takeScreenshot(browser.cdp, join(directory, 'stratego-desktop.png'));
  await setViewport(browser.cdp, 390, 844); await takeScreenshot(browser.cdp, join(directory, 'stratego-mobile.png'));
});

test('browser session has no severe console or runtime failures', () => { assert.deepEqual(severe, []); });
