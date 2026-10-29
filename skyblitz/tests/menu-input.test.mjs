// E-03: a key or pad button pressed in a menu / the pause screen is never a flight input. Real key events and a faked pad in headless Chrome.
// Run: node skyblitz/tests/menu-input.test.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { launchChrome } from './tools/chrome.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/\\/g, '/').replace(/^\/+/, '');
    const f = p.endsWith('/') || !p ? p + 'index.html' : p; const data = await readFile(join(root, f));
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = await launchChrome({ width: 1280, height: 720 });
let failed = 0;
try {
  const page = await chrome.newPage();
  const GAME = `http://127.0.0.1:${port}/skyblitz/?manual=1&autostart=1&mute=1&bots=0&course=sunrise&seed=3`;
  const boot = async (live) => {
    await page.goto(live ? GAME.replace('manual=1&', 'debug=1&') : GAME);
    await page.waitFor('!!(window.__sky && window.__sky.ready && window.__sky.game.race && window.__sky.game.player)', { timeout: 100000 });
    await page.eval(`(() => { const g = __sky.game; g.race.items.give(g.player, 'turbo3', 3); if (g.manual) __sky.step(400); })()`);
    if (live) { await page.waitFor("__sky.game.race.state === 'racing'", { timeout: 60000 }); await page.eval(`__sky.game.race.items.give(__sky.game.player, 'turbo3', 3)`); }
  };
  const held = () => page.eval(`(() => { const p = __sky.game.player; return { item: p.item ? p.item.type + ':' + p.item.count : null, heat: +p.heat.toFixed(3), paused: __sky.game.paused }; })()`);
  const pause = async () => { await page.key('Escape'); await delay(250); assert.equal((await held()).paused, true, 'Escape pauses'); };
  const fakePad = () => page.eval(`(() => { window.__pad = { connected: true, id: 'Fake Pad', index: 0, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; navigator.getGamepads = () => [window.__pad]; })()`);
  const check = async (name, fn) => { try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message); } };

  await check('Enter on RESUME does not fire the held item', async () => {
    await boot(); const before = await held(); assert.ok(before.item, 'an item is held: ' + JSON.stringify(before));
    await pause(); await page.key('Enter'); await delay(300);
    assert.equal((await held()).paused, false, 'Enter on RESUME resumes');
    await page.eval('__sky.step(30)');
    assert.equal((await held()).item, before.item, 'the item is still held after resuming');
  });

  await check('Space on RESUME does not fire the cannon', async () => {
    await boot(); await pause(); await page.key('Space'); await delay(300);
    assert.equal((await held()).paused, false, 'Space resumes');
    await page.eval('__sky.step(30)');
    assert.equal((await held()).heat, 0, 'no cannon shot');
  });

  await check('keys pressed while paused are not latched for the resume', async () => {
    await boot(); const before = await held();
    await pause(); await page.key('KeyF'); await page.key('KeyF'); await delay(200);
    assert.equal((await held()).paused, true, 'F does not unpause'); await page.key('Enter'); await delay(250); assert.equal((await held()).paused, false);
    await page.eval('__sky.step(30)');
    assert.equal((await held()).item, before.item, 'F pressed under the pause menu did nothing');
  });

  await check('faked pad: A on RESUME does not fire the held item', async () => {
    await boot(true); await fakePad(); await delay(200); const before = await held();
    await pause(); await page.eval(`__pad.buttons[0] = { pressed: true, value: 1 }`); await delay(250);
    assert.equal((await held()).paused, false, 'A resumes');
    await delay(1200);
    assert.equal((await held()).item, before.item, 'the item is still held (A is still down)');
    await page.eval(`__pad.buttons[0] = { pressed: false, value: 0 }`);
  });
} finally { await chrome.close(); server.close(); }
if (failed) { console.log(failed + ' failed'); process.exit(1); }
console.log('menu-input: all ok');
