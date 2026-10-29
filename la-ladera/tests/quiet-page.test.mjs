// Pages opened through tests/chrome.mjs can neither clip the person's real cursor (pointer lock) nor talk through their speakers (speech):
// quiet-init.js swaps in page-only twins. Every page script below checks the shim's marker FIRST and returns without touching the API when it is
// missing, so a broken harness fails these tests instead of locking the desktop mouse or speaking out loud.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/quiet-page.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

const DOC = (n) => 'data:text/html,' + encodeURIComponent(`<!doctype html><title>quiet ${n}</title><canvas id=c width=32 height=32></canvas>`);
const GUARD = `if (!Element.prototype.requestPointerLock.__quiet || !SpeechSynthesis.prototype.speak.__quiet) return 'shim missing: not calling the real API';`;
let b, p;
before(async () => { b = await launch({ width: 480, height: 270 }); p = b.page; await p.goto(DOC(1), { ready: false }); });
after(async () => { await b?.close(); });

test('pointer lock is simulated in the page: element, events and promise as in a real lock, nothing asked of the OS', async () => {
  const r = await p.eval(`(async () => {
    ${GUARD}
    const c = document.getElementById('c'), ev = [], wait = () => new Promise((r) => setTimeout(r, 30));
    document.addEventListener('pointerlockchange', () => ev.push(document.pointerLockElement ? document.pointerLockElement.id : 'none'));
    const before = document.pointerLockElement;
    const res = c.requestPointerLock({ unadjustedMovement: true });            // the game's own call shape
    const isPromise = typeof res?.then === 'function';
    await res; await wait();
    const during = document.pointerLockElement?.id ?? null;
    c.requestPointerLock(); await wait();                                       // already locked here: no second event
    document.exitPointerLock(); await wait();
    return { before, isPromise, during, after: document.pointerLockElement, ev, locks: window.__quiet.locks };
  })()`);
  assert.deepEqual(r, { before: null, isPromise: true, during: 'c', after: null, ev: ['c', 'none'], locks: 1 });
});

test('locking an element that is not in the document fails like a real browser (pointerlockerror, rejected promise)', async () => {
  const r = await p.eval(`(async () => {
    ${GUARD}
    let err = null, rejected = null; document.addEventListener('pointerlockerror', () => { err = true; });
    try { await document.createElement('div').requestPointerLock(); rejected = false; } catch (e) { rejected = e.name; }
    await new Promise((r) => setTimeout(r, 30));
    return { err, rejected, locked: document.pointerLockElement };
  })()`);
  assert.deepEqual(r, { err: true, rejected: 'InvalidStateError', locked: null });
});

test('speech is recorded and timed in the page, never voiced: start/end fire, state flips, the line is readable as data', async () => {
  const r = await p.eval(`(async () => {
    ${GUARD}
    window.__quiet.spoken.length = 0;
    const u = new SpeechSynthesisUtterance('Buenas tardes, vecino.'); u.lang = 'es-CO'; u.rate = 2;
    const ev = [], done = new Promise((res) => u.addEventListener('end', res));
    u.onstart = () => ev.push('start'); u.onend = () => ev.push('end');
    speechSynthesis.speak(u);
    const queued = speechSynthesis.pending;
    await done;
    return { ev, queued, after: [speechSynthesis.speaking, speechSynthesis.pending], spoken: window.__quiet.spoken.map((s) => [s.text, s.lang, s.rate]) };
  })()`);
  assert.deepEqual(r, { ev: ['start', 'end'], queued: true, after: [false, false], spoken: [['Buenas tardes, vecino.', 'es-CO', 2]] });
});

test('cancel() flushes the speaking and queued lines with "canceled", and a later line still plays', async () => {
  const r = await p.eval(`(async () => {
    ${GUARD}
    window.__quiet.spoken.length = 0;
    const log = [], mk = (t) => { const u = new SpeechSynthesisUtterance(t); u.onstart = () => log.push(t + ':start'); u.onend = () => log.push(t + ':end'); u.onerror = (e) => log.push(t + ':' + e.error); return u; };
    const c = mk('tres');
    speechSynthesis.speak(mk('uno')); speechSynthesis.speak(mk('dos'));
    await new Promise((r) => setTimeout(r, 20));                                // uno is speaking, dos is queued
    speechSynthesis.cancel();
    const idle = [speechSynthesis.speaking, speechSynthesis.pending];
    speechSynthesis.speak(c);
    await new Promise((r) => c.addEventListener('end', r));
    return { log, idle };
  })()`);
  assert.deepEqual(r, { log: ['uno:start', 'uno:canceled', 'dos:canceled', 'tres:start', 'tres:end'], idle: [false, false] });
});

test('the shim is installed in every later document, not just the first', async () => {
  await p.goto(DOC(2), { ready: false });
  assert.deepEqual(await p.eval('[!!Element.prototype.requestPointerLock.__quiet, !!SpeechSynthesis.prototype.speak.__quiet, document.title, window.__quiet.spoken.length]'),
    [true, true, 'quiet 2', 0]);
});
