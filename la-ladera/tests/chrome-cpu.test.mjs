// tests/chrome.mjs `cpuBetween` and `launch().cpuSampler`: the CPU the page's main thread used between two readings of the clock. It is what tells a call that WORKED for 300 ms from one that was HELD for 3.7 s (a renderer at idle
// priority on a box whose cores are all busy does no work for seconds while the clock runs on): interiors-lazy-page test 2 holds the CPU of a call to its ceiling, not the clock. The first four tests are pure (the arithmetic on
// samples); the last one launches a browser on a blank page and checks what the sampler reads: work, a wait, and the work of another thread of the same renderer.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/chrome-cpu.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpuBetween, launch } from './chrome.mjs';

const S = (...p) => p.map(([t, cpu]) => ({ t, cpu }));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} (wanted ${b})`);

test('a stretch the thread worked through is all CPU; one it was held through is none, however long the clock ran', () => {
  // the clock in ms, the CPU in seconds: working 0-1000 (1 s of CPU in 1 s), held 1000-4700 (none in 3.7 s), working again 4700-5000
  const s = S([0, 0], [500, 0.5], [1000, 1.0], [2000, 1.0], [3000, 1.0], [4700, 1.0], [5000, 1.3]);
  near(cpuBetween(s, 0, 1000), 1000, 'a second of work');
  near(cpuBetween(s, 1000, 4700), 0, 'a call of 3.7 s that did no work');
  near(cpuBetween(s, 4700, 5000), 300, 'work again');
  near(cpuBetween(s, 500, 5000), 800, 'work and the hold and work: only the work counts');
});

test('between two samples the CPU is read along a straight line', () => {
  const s = S([1000, 2.0], [1100, 2.1], [1200, 2.1], [1300, 2.3]);
  // 1050 is half way along the first step (2.05 s of CPU so far), 1250 half way along the last (2.2 s): 150 ms between them
  near(cpuBetween(s, 1050, 1250), 150, 'from the middle of one step to the middle of another');
  near(cpuBetween(s, 1100, 1200), 0, 'across a step in which the thread did nothing');
});

test('a time outside the samples counts as the nearest one: no CPU is made up past either end', () => {
  const s = S([1000, 2.0], [1100, 2.1], [1200, 2.3]);
  near(cpuBetween(s, 0, 900), 0, 'before the first sample');
  near(cpuBetween(s, 1300, 9000), 0, 'after the last');
  near(cpuBetween(s, 0, 9000), 300, 'the whole run');
});

test('fewer than two samples cannot say: null, and the caller falls back on the clock', () => {
  assert.equal(cpuBetween([], 0, 100), null);
  assert.equal(cpuBetween(undefined, 0, 100), null);
  assert.equal(cpuBetween(S([5, 1]), 0, 100), null);
});

test('the sampler reads the main thread: a loop is CPU, a wait is none, and a Worker\'s loop is none', async () => {
  // A fixed loop costs the same CPU however long the box holds the thread (a spin of the clock costs what it is let have), so this holds on a busy box. 2e8 steps are about 150 ms of CPU.
  // The Worker is the point: a renderer's other threads (V8's collectors and compilers, the compositor) work while the main thread waits, and the process's own count (SystemInfo.getProcessInfo) adds them in.
  const b = await launch({ width: 400, height: 300 });
  try {
    const page = b.page, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await page.eval('globalThis.burn = (n) => { let x = 1; for (let i = 0; i < n; i++) x = (Math.imul(x, 1664525) + 1013904223) | 0; return x; }');
    const timed = (body) => page.eval(`(async () => { const at = performance.timeOrigin + performance.now(); ${body}; return JSON.stringify({ at, ms: performance.timeOrigin + performance.now() - at }); })()`, 60000).then(JSON.parse);
    const sampler = b.cpuSampler(25);
    await sleep(200);
    const loop = await timed('burn(2e8)'); await sleep(100);
    const wait = await timed('await new Promise((r) => setTimeout(r, 300))'); await sleep(100);
    const worker = await timed(`await new Promise((r) => { const w = new Worker(URL.createObjectURL(new Blob(['let x = 1; for (let i = 0; i < 2e8; i++) x = (Math.imul(x, 1664525) + 1013904223) | 0; postMessage(x)']))); w.onmessage = () => r(1); })`);
    await sleep(200);
    const samples = await sampler.stop();
    const cpu = (r) => cpuBetween(samples, r.at, r.at + r.ms);
    assert.ok(samples.length > 10, `${samples.length} samples of the thread's CPU`);
    assert.ok(cpu(loop) >= 100, `a loop of 2e8 steps (${loop.ms.toFixed(0)} ms of the clock) read ${cpu(loop)?.toFixed(0)} ms of CPU: it is about 150`);
    assert.ok(cpu(wait) <= 40, `a wait of ${wait.ms.toFixed(0)} ms read ${cpu(wait)?.toFixed(0)} ms of CPU`);
    assert.ok(cpu(worker) <= 60, `a Worker's loop (${worker.ms.toFixed(0)} ms of the clock, about 150 ms of CPU on its own thread) read ${cpu(worker)?.toFixed(0)} ms: the main thread did none of it`);
  } finally { await b.close(); }
});
