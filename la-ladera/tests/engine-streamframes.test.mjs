// STREAMING MUST NOT COST THE PLAYER FRAMES (A1; `?lazy=1`, dev/FEATURE-LAZY.md). The boot ends at the playable milestone; the interiors, the people and the packs stream in behind it while the game is
// played. This measures that window in the REAL animation loop (no ?manual): a recorder installed before the first script logs every animation frame's start time and, per frame, the milliseconds of
// streaming work it spent (ctx.streamMs, read at the end of ctx.render, before the engine resets it for the next frame: core/budget.js). The streaming window (the milestone to `settled`) is compared with a
// STEADY window of the same page afterwards, so the machine's own frame cost cancels out: what streaming adds is the difference.
// Quiet box: headless Chrome from tests/chrome.mjs, low priority; the thresholds are for a machine whose steady frame is 10-35 ms and leave room for the other work it is doing.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-streamframes.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

const STEADY_MS = 8000, GRACE_MS = 1500;
const RECORDER = `
  window.__fm = { t: [], sp: [], long: [], on: false, tReady: 0, tSettled: 0 };
  (function loop(t) { if (window.__fm.on) window.__fm.t.push(t); requestAnimationFrame(loop); })(0);
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (window.__fm.on) window.__fm.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ entryTypes: ['longtask'] });
  (function hook() { const c = window.__ladera && window.__ladera.ctx; if (!c || !c.render) return requestAnimationFrame(hook); if (c.__hooked) return; c.__hooked = true;
    const rd = c.render;
    c.render = function () { const t = performance.now(); try { return rd.call(this); } finally { if (window.__fm.on) window.__fm.sp.push([Math.round(t), +(c.streamMs ?? 0).toFixed(2), +(performance.now() - t).toFixed(2)]); } };
  })();`;

const stat = (gaps) => {
  const s = [...gaps].sort((x, y) => x - y), at = (q) => (s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN);
  return { n: gaps.length, median: at(0.5), p95: at(0.95), p99: at(0.99), max: s.length ? s[s.length - 1] : NaN, over50: gaps.filter((g) => g > 50).length, over100: gaps.filter((g) => g > 100).length, over250: gaps.filter((g) => g > 250).length };
};
const spendStat = (rows) => {
  const v = rows.map((x) => x[1]).sort((x, y) => x - y), at = (q) => (v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : NaN);
  return { n: v.length, p50: at(0.5), p95: at(0.95), max: v.length ? v[v.length - 1] : NaN, over30: v.filter((x) => x > 30).length, over60: v.filter((x) => x > 60).length };
};

let b, W = null;
before(async () => {
  b = await launch({ width: 960, height: 540 });
  await b.page.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
  const p = await b.open('la-ladera/index.html?autostart&lazy=1&quality=medium');
  await p.eval('(() => { window.__fm.on = true; window.__fm.tReady = performance.now(); window.__ladera.settled.then(() => { window.__fm.tSettled = performance.now(); }); return true; })()');
  await p.eval('window.__ladera.settled.then(() => true)', 600000);
  await new Promise((r) => setTimeout(r, GRACE_MS + STEADY_MS + 500));
  const fm = await p.eval('(() => { window.__fm.on = false; return { t: window.__fm.t, sp: window.__fm.sp, long: window.__fm.long, tReady: window.__fm.tReady, tSettled: window.__fm.tSettled }; })()');
  const gapsIn = (a, z) => { const g = []; for (let i = 1; i < fm.t.length; i++) if (fm.t[i - 1] >= a && fm.t[i] <= z) g.push(fm.t[i] - fm.t[i - 1]); return g; };
  const spIn = (a, z) => fm.sp.filter((x) => x[0] >= a && x[0] <= z);
  const A = fm.tReady, S = Math.max(fm.tSettled, A), Z = S + GRACE_MS, Y = Z + STEADY_MS;
  W = { ms: S - A, stream: stat(gapsIn(A, S)), steady: stat(gapsIn(Z, Y)), spend: spendStat(spIn(A, S)), spendSteady: spendStat(spIn(Z, Y)), long: fm.long.filter((x) => x[0] >= A && x[0] <= S && x[1] >= 50).length,
    state: await p.eval('(() => { const s = __ladera.state(); return { errors: s.errors, npcs: s.npcs, sealed: __ladera.ctx.interiors.sealed, built: __ladera.ctx.interiors.built, late: __ladera.ctx.interiors.stats.late, maxStepMs: __ladera.ctx.interiors.stats.maxStepMs }; })()') };
  console.log('streaming window', JSON.stringify(W));
});
after(async () => { await b?.close(); });

test('the window is long enough to mean something and the barrio did settle without an error', () => {
  assert.ok(W.ms > 6000, `streaming took ${Math.round(W.ms)} ms`);
  assert.ok(W.stream.n > 150, `${W.stream.n} frames were drawn while it streamed`);
  assert.ok(W.steady.n > 100, `${W.steady.n} frames in the steady window`);
  assert.equal(W.state.errors, 0); assert.equal(W.state.sealed, true); assert.equal(W.state.built, true); assert.ok(W.state.npcs > 50, `${W.state.npcs} people`);
  assert.equal(W.state.late, 0, 'a player who stands still is never found in a house that is not made');
});

test('the streaming work of a frame is a slice, never a whole interior: the frame\'s own account (core/budget.js)', () => {
  const s = W.spend;
  assert.ok(s.p50 <= 8, `median streaming spend of a frame ${s.p50.toFixed(1)} ms (the budget is 4)`);
  assert.ok(s.p95 <= 20, `95th percentile ${s.p95.toFixed(1)} ms`);
  assert.ok(s.over60 <= 3, `${s.over60} frames spent more than 60 ms on streaming (a room's furnisher is 25-80 ms: the one step a slice cannot cut)`);
  assert.ok(s.max <= 200, `the worst frame spent ${s.max.toFixed(0)} ms on streaming (a whole interior in one call is 150-400 ms and more)`);
  assert.ok(W.state.maxStepMs <= 200, `the longest single step the interiors took: ${W.state.maxStepMs.toFixed(0)} ms`);
});

test('the player\'s frames while it streams are the steady frames plus the budget: median, tail and the count of long frames', () => {
  const a = W.stream, c = W.steady;
  assert.ok(a.median <= c.median + 8, `median frame ${a.median.toFixed(1)} ms while streaming against ${c.median.toFixed(1)} ms steady`);
  assert.ok(a.p95 <= c.p95 + 25, `95th percentile ${a.p95.toFixed(1)} ms against ${c.p95.toFixed(1)} steady`);
  assert.ok(a.over100 <= Math.max(6, Math.ceil(a.n * 0.01)), `${a.over100} frames over 100 ms of ${a.n} (steady: ${c.over100})`);
  assert.ok(a.over250 === 0, `${a.over250} frames over 250 ms (the worst was ${a.max.toFixed(0)} ms)`);
  assert.ok(W.long <= 40, `${W.long} long tasks of 50 ms or more while it streamed`);
});
