// The JS heap across boots (owner: A1). Review R2c-014: "heap 968-1025 MB after a same-tab reload".
// What was measured (.scratch/a1/r8/probe_heap.mjs, CDP Runtime.getHeapUsage; the numbers are in dev/progress/A1.md): it is NOT a leak. After a forced major GC the live heap
// is 82 MB on the first boot and on every same-tab reload; the 480-610 MB peak of a first boot and the ~1.06 GB peak of a reload are garbage that V8 has not collected yet
// (a boot allocates ~12 GB of short-lived objects, ~1.6 GB of it the growth of the mesh builders' arrays, and a reload starts on top of the previous page's uncollected heap).
// This test guards the two things that CAN regress for real: the live set (someone keeps a boot-time structure alive, or a page-wide cache grows with every boot) and the
// size of a first boot's peak (a new stage that holds hundreds of MB at once).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-heap.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

const MB = 1048576, mb = (x) => Math.round(x / MB);
const LIVE_MAX = 130, PEAK_MAX = 900;                                 // measured: 82 live, 480-610 peak
let b, page; const boots = [];

const HOOK = `(() => {
  const T = window.__heap = { peak: 0 };
  setInterval(() => { const u = performance.memory?.usedJSHeapSize ?? 0; if (u > T.peak) T.peak = u; }, 50);
})()`;

before(async () => {
  b = await launch({ width: 1280, height: 720 });
  page = b.page;
  await page.send('HeapProfiler.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  for (let i = 0; i < 3; i++) {                                       // the first boot, then two reloads in the same tab
    await page.goto(`${b.baseUrl}/la-ladera/index.html?manual`, { ready: true });
    const peak = await page.eval('window.__heap.peak');
    await page.send('HeapProfiler.collectGarbage', {}, 120000);
    const live = (await page.send('Runtime.getHeapUsage')).usedSize;
    boots.push({ peak: mb(peak), live: mb(live) });
  }
});
after(async () => { await b?.close(); });

test('the live heap after a major GC is small: the barrio itself costs ~80 MB of JS objects', () => {
  for (const [i, x] of boots.entries()) assert.ok(x.live <= LIVE_MAX, `boot ${i + 1}: ${x.live} MB live after a GC (budget ${LIVE_MAX}): ${JSON.stringify(boots)}`);
});

test('and it does not grow from one boot to the next in the same tab (no leak across reloads)', () => {
  assert.ok(boots[1].live <= boots[0].live + 20 && boots[2].live <= boots[0].live + 20, `live heap per boot: ${boots.map((x) => x.live).join(', ')} MB`);
});

test('the first boot never holds more than a budget at once (the peak is garbage waiting for V8, but a stage that keeps hundreds of MB shows here)', () => {
  assert.ok(boots[0].peak <= PEAK_MAX, `first boot peaked at ${boots[0].peak} MB (budget ${PEAK_MAX}; measured 480-610): ${JSON.stringify(boots)}`);
});

test('nothing in the console', () => {
  const s = page.summary();
  assert.deepEqual([s.errors, s.netErrors, s.consoleErrors, s.consoleWarnings], [[], [], [], []]);
});
