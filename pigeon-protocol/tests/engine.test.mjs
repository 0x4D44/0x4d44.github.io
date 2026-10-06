// Run with: node pigeon-protocol/tests/engine.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { constant, sensible, polite, cubicish, aimd, aiad, mimd, plusOne, ramp, allRamps, tokenRamp, allTokenRamps } from './strategies.mjs';
const E = createRequire(import.meta.url)('../engine.js');
const L = (id) => E.LEVELS.find((l) => l.id === id);
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok - ' + name); }
const SEEDS = 200;
const STATIC1 = Object.assign({}, L(1), { jitter: null });   // level 1 with the Gap pinned at 12, for the mechanics tests
const starsOver = (lv, mk, seeds = SEEDS) => { const c = [0, 0, 0, 0]; for (let s = 0; s < seeds; s++) c[E.starsFor(E.runPolicy(lv, lv.seed + s, mk()))]++; return c.map((x) => x / seeds); };
const frac = (c, min) => c.slice(min).reduce((a, b) => a + b, 0);
const free = (lv) => Object.assign({}, lv, { deadline: 60, loft: 9999 });

test('determinism: same seed, same history; different seed, different history', () => {
  const a = E.runPolicy(L(5), 77, sensible()), b = E.runPolicy(L(5), 77, sensible()), c = E.runPolicy(L(5), 78, sensible());
  const strip = (r) => JSON.stringify(r.history.map((h) => [h.w, h.delivered, h.lostCrowd, h.lostHawk, h.rivalW]));
  assert.equal(strip(a), strip(b)); assert.notEqual(strip(a), strip(c));
  assert.equal(E.mulberry32(5)(), E.mulberry32(5)());
});

test('under capacity, with no hawks, nothing is lost', () => {
  for (let w = 1; w <= 12; w++) { const run = E.createRun(STATIC1, 3); const rec = E.playRound(run, w); assert.equal(rec.lost, 0); assert.equal(rec.delivered, w); }
});

test('capacity overflow loses birds (at least the excess)', () => {
  for (const w of [13, 16, 20, 24]) {
    const run = E.createRun(STATIC1, 3); const rec = E.playRound(run, w);
    assert.ok(rec.lostCrowd >= w - 12, 'w=' + w); assert.ok(rec.delivered <= 12); assert.equal(rec.lostHawk, 0);
  }
});

test('collapse emerges: goodput at 2x capacity is below goodput at capacity', () => {
  const lv = free(Object.assign({}, STATIC1, { scrolls: 4000 }));
  const goodput = (w) => { let d = 0; for (let s = 0; s < 40; s++) d += E.playRound(E.createRun(lv, s), w).delivered; return d / 40; };
  const atC = goodput(12), over = goodput(24);
  assert.equal(atC, 12); assert.ok(over < atC); assert.ok(over <= 0.5 * atC);
});

test('collapse over a whole run: flooding delivers far less per bird than steady flying', () => {
  const lv = free(STATIC1);
  const flood = E.runPolicy(lv, 1, constant(24)), steady = E.runPolicy(lv, 1, constant(12));
  assert.ok(flood.sent > steady.sent && flood.lost > 10 * steady.lost);
  assert.ok(flood.delivered / flood.sent < 0.5 * steady.delivered / steady.sent);
  assert.ok(flood.round > steady.round);
});

test('hawk loss is independent of load (about p per bird, even when under capacity)', () => {
  let sent = 0, lostHawk = 0, lostCrowd = 0;
  for (let s = 0; s < 400; s++) { const r = E.createRun(Object.assign({}, L(2), { jitter: null }), s); const rec = E.playRound(r, 5); sent += rec.w; lostHawk += rec.lostHawk; lostCrowd += rec.lostCrowd; }
  assert.equal(lostCrowd, 0); assert.ok(Math.abs(lostHawk / sent - 0.1) < 0.025, 'hawk rate ' + lostHawk / sent);
});

test('lost scrolls are retransmitted first, and flagged as second attempts', () => {
  const run = E.createRun(STATIC1, 3); const r1 = E.playRound(run, 20);
  assert.ok(r1.lost > 0);
  const lostScrolls = r1.birds.filter((b) => b.fate !== 'ok').map((b) => b.scroll).sort((a, b) => a - b);
  const r2 = E.playRound(run, lostScrolls.length);
  assert.deepEqual(r2.birds.map((b) => b.scroll).sort((a, b) => a - b), lostScrolls);
  assert.ok(r2.birds.every((b) => b.attempt === 1)); assert.equal(r2.retx, lostScrolls.length);
});

test('never more scrolls delivered than exist; a delivered scroll is never flown twice', () => {
  const run = E.runPolicy(L(2), 9, sensible());
  assert.ok(run.delivered <= run.level.scrolls);
  const seen = new Set();
  for (const h of run.history) for (const b of h.birds) if (b.owner === 'you' && b.fate === 'ok') { assert.ok(!seen.has(b.scroll)); seen.add(b.scroll); }
});

test('Reno: slow start doubles, loss halves, then +1 per round', () => {
  const r = E.createReno(1); const seq = [r.w];
  for (const loss of [false, false, false, true, false, false, false]) seq.push(E.renoNext(r, loss));
  assert.deepEqual(seq, [1, 2, 4, 8, 4, 5, 6, 7]);
});

test('Reno completes every level given time; flies levels 1 and 6 in time', () => {
  for (const lv of E.LEVELS) assert.ok(E.renoReference(lv, lv.seed).won, lv.name);
  for (const id of [1, 6]) assert.ok(E.renoReference(L(id), L(id).seed).inTime, 'Reno in time on level ' + id);
});

test('textbook Reno (halve on any loss, +1 otherwise) finishes levels 1, 3 and 4 with at least 2 stars on >= 70% of seeds', () => {
  const rows = [];
  for (const id of [1, 3, 4]) { const c = starsOver(L(id), () => E.renoPolicy(1)); rows.push('L' + id + ' ' + Math.round(frac(c, 2) * 100) + '%'); assert.ok(frac(c, 2) >= 0.7, 'Reno on level ' + id + ': ' + frac(c, 2)); }
  console.log('   Reno 2+ stars: ' + rows.join(', '));
});

test('Reno stalls under hawks (it mistakes loss for congestion); a hold-on-stray-loss rule does not', () => {
  assert.ok(frac(starsOver(L(2), () => E.renoPolicy(1)), 1) <= 0.1, 'Reno almost never finishes Hawk Season in time');
  assert.ok(frac(starsOver(L(2), sensible), 1) >= 0.8);
});

test('each attempt gets its own weather, but the canonical schedule is untouched', () => {
  const lv = L(4), a = E.createRun(lv, 1), b = E.createRun(lv, 2), c = E.createRun(lv, 3);
  const key = (r) => JSON.stringify(r.capSched);
  assert.ok(new Set([key(a), key(b), key(c)]).size > 1);
  assert.deepEqual(lv.cap, [[1, 14], [3, 7], [8, 23], [11, 9], [13, 20]]);
  assert.equal(E.createRun(L(1), 1).capSched[0][1] >= 10 && E.createRun(L(1), 1).capSched[0][1] <= 14, true);
  const seenCaps = new Set(); for (let s = 0; s < 40; s++) seenCaps.add(E.createRun(L(1), s).capSched[0][1]); assert.ok(seenCaps.size >= 4, 'level 1 Gap varies per attempt');
  assert.deepEqual(E.createRun(L(6), 1).capSched, L(6).cap);
});

test('rival flock: exists only on its schedule, adapts, digs in when squeezed, and a bully is punished', () => {
  const lv = L(3), run = E.runPolicy(lv, 5, polite());
  assert.equal(run.history[0].rivalW, 0);
  assert.ok(run.history[1].rivalW > 0 && run.history[1].rivalOn);
  assert.equal(run.history[lv.rival.to].rivalW, 0);
  assert.ok(run.history.some((h) => h.rivalLost > 0));
  const bully = E.runPolicy(lv, 5, constant(24));
  assert.ok(bully.history.some((h) => h.rivalDugIn), 'the rival digs in when squeezed twice running');
  assert.ok(!bully.won && bully.endReason === 'loft');
  assert.ok(bully.delivered / bully.sent < 0.65);
});

test('capacity schedule changes mid-run (Storm Front), canonical caps visible with jitter off', () => {
  const lv = Object.assign({}, L(4), { jitter: null });
  const caps = E.runPolicy(lv, 1, sensible()).history.map((h) => h.cap);
  assert.deepEqual([caps[0], caps[3], caps[8], caps[11], caps[13]], [14, 7, 23, 9, 20]);
});

test('end conditions: deadline, loft and delivery', () => {
  assert.equal(E.runPolicy(STATIC1, 1, constant(1)).endReason, 'deadline');
  assert.equal(E.runPolicy(STATIC1, 1, constant(24)).endReason, 'loft');
  assert.equal(E.runPolicy(STATIC1, 1, constant(12)).endReason, 'delivered');
  assert.throws(() => { const r = E.runPolicy(STATIC1, 1, constant(12)); E.playRound(r, 3); });
});

test('star thresholds are ordered, fit inside the deadline, and demand adaptation', () => {
  for (const lv of E.LEVELS.filter((l) => l.stars)) {
    assert.ok(lv.stars.three.rounds <= lv.stars.two.rounds && lv.stars.three.lost <= lv.stars.two.lost, lv.name);
    assert.ok(lv.stars.two.rounds <= lv.deadline, lv.name);
    assert.ok(lv.stars.three.adapt && lv.stars.two.adapt, lv.name + ' needs the adapt rule');
    if (lv.rival) assert.ok(lv.stars.three.share < lv.stars.two.share && lv.stars.three.minShare > 0);
  }
});

test('adaptedOf: only a flock that shrinks after a loss has adapted', () => {
  const run = E.createRun(STATIC1, 3); E.playRound(run, 20); assert.equal(E.adaptedOf(run), false);
  E.playRound(run, 8); assert.equal(E.adaptedOf(run), true);
  const grow = E.runPolicy(STATIC1, 3, plusOne()); assert.equal(E.adaptedOf(grow), false);
  const flat = E.runPolicy(STATIC1, 3, constant(12)); assert.equal(E.adaptedOf(flat), false);
});

test('no flat flock earns 3 stars on any ranked level, and none earns 2 (adaptation is required)', () => {
  const table = [];
  for (const id of [1, 2, 3, 4, 5]) {
    let w3 = 0, w2 = 0;
    for (let k = 1; k <= 24; k++) { const c = starsOver(L(id), () => constant(k)); w3 = Math.max(w3, c[3]); w2 = Math.max(w2, c[2] + c[3]); }
    table.push('L' + id + ' best flat: 3-star ' + Math.round(w3 * 100) + '%, 2+ ' + Math.round(w2 * 100) + '%');
    assert.ok(w3 <= 0.05, 'level ' + id + ' flat 3 stars ' + w3); assert.ok(w2 <= 0.03, 'level ' + id + ' flat 2 stars ' + w2);
  }
  console.log('   ' + table.join('; '));
});

test('no blind open-loop ramp (start, step, cap: all combinations) earns 50% 3 stars on any level (L1: under 25%)', () => {
  const worst = {};
  for (const id of [1, 2, 3, 4, 5]) {
    let w3 = 0, w2 = 0;
    for (const g of allRamps()) { const c = starsOver(L(id), () => ramp(g.start, g.step, g.cap), 16); w3 = Math.max(w3, c[3]); w2 = Math.max(w2, c[2] + c[3]); }
    worst[id] = [w3, w2]; assert.ok(w3 < (id === 1 ? 0.25 : 0.5), 'level ' + id + ' ramp 3 stars ' + w3); assert.ok(w2 <= 0.1, 'level ' + id + ' ramp 2 stars ' + w2);
  }
  console.log('   best blind ramp 3-star / 2+: ' + Object.entries(worst).map(([k, v]) => 'L' + k + ' ' + Math.round(v[0] * 100) + '/' + Math.round(v[1] * 100)).join(', '));
});

test('a remembered capacity schedule (w = canonical cap each round) does not reliably win on retries', () => {
  for (const id of [2, 4, 5]) {
    const lv = L(id); const oracle = () => (run) => Math.max(1, E.capAt(lv, run.round + 1));
    const c = starsOver(lv, oracle); assert.ok(c[3] <= 0.5, 'level ' + id + ' oracle 3 stars ' + c[3]);
  }
});

test('adaptive players who only see sent/arrived reach 3 stars about half to three quarters of the time, never always', () => {
  const rows = [];
  const cases = [['sensible', sensible, [1, 2, 3, 4, 5], 0.45, 0.9], ['polite', polite, [1, 2, 3, 4, 5], 0.4, 0.9], ['cubicish AIMD', cubicish, [1, 2, 3, 4], 0.35, 0.9]];
  for (const [name, mk, ids, lo, hi] of cases) for (const id of ids) {
    const c = starsOver(L(id), mk); rows.push(name + ' L' + id + ': ' + Math.round(c[3] * 100) + '%');
    assert.ok(c[3] >= lo && c[3] <= hi, name + ' on level ' + id + ' earns 3 stars ' + Math.round(c[3] * 100) + '%');
  }
  for (const id of [1, 2, 3, 4, 5]) assert.ok(frac(starsOver(L(id), sensible), 1) >= 0.8, 'sensible should finish level ' + id);
  console.log('   ' + rows.join('; '));
});

test('plain AIMD tolerates levels 3 and 5 (finishes); +1 forever never earns more than 1 star', () => {
  assert.ok(frac(starsOver(L(3), aimd), 1) >= 0.7); assert.ok(frac(starsOver(L(5), aimd), 1) >= 0.3);
  for (const id of [1, 2, 3, 4, 5]) assert.equal(frac(starsOver(L(id), plusOne), 2), 0);
});

test('fairness: a flock that hogs the Gap cannot earn 3 stars on the rival levels; shares are measured only while the rival flies', () => {
  const greedy = () => { let w = 2; return (run, last) => { if (last) w = Math.min(24, last.lost ? Math.max(14, last.w - 1) : last.w + 3); return w; }; };
  for (const id of [3, 5]) assert.ok(starsOver(L(id), greedy)[3] <= 0.05, 'level ' + id);
  const run = E.runPolicy(L(3), 3, polite());
  assert.ok(E.shareOf(run) > 0 && E.shareOf(run) < 1);
  assert.equal(E.shareOf(E.runPolicy(STATIC1, 1, constant(12))), 1);
});

test('responsiveness metric: token cuts do not count, real cuts do, and the last round is ignored', () => {
  const mk = (rows) => ({ history: rows.map(([w, lost, requested], i) => ({ w, lost, requested: requested ?? w, round: i + 1 })) });
  // two bad rounds, each followed by a halving: responsive
  assert.equal(E.adaptedOf(mk([[10, 6], [5, 0], [6, 0], [12, 7], [6, 0]]), 2), true);
  // one bad round followed by a token cut of 1: not responsive
  assert.equal(E.adaptedOf(mk([[10, 6], [9, 0], [10, 0]]), 1), false);
  // never lost enough to count: nothing to respond to
  assert.equal(E.adaptedOf(mk([[10, 1], [11, 0], [12, 1]]), 1), false);
  // the final round is not an event (there is no next time)
  assert.equal(E.responseStats(mk([[10, 0], [10, 8]])).events, 0);
  assert.deepEqual(E.responseStats(mk([[10, 6], [5, 0], [12, 7], [12, 0]])), { events: 2, responded: 1 });
});

test('no blind ramp with a token cut after its first loss reaches 5% 3 stars on any level (cut of 1 or 3 birds)', () => {
  const rows = [];
  for (const id of [1, 2, 3, 4, 5]) {
    let w3 = 0, w2 = 0;
    for (const g of allTokenRamps()) { const c = starsOver(L(id), () => tokenRamp(g.start, g.step, g.cap, g.cut), 40); w3 = Math.max(w3, c[3]); w2 = Math.max(w2, c[2] + c[3]); }
    rows.push('L' + id + ' ' + Math.round(w3 * 100) + '/' + Math.round(w2 * 100));
    assert.ok(w3 <= 0.05, 'level ' + id + ' token ramp 3 stars ' + w3); assert.ok(w2 <= 0.35, 'level ' + id + ' token ramp 2+ stars ' + w2);
  }
  console.log('   best token-cut ramp 3-star / 2+: ' + rows.join(', '));
});

test('additive-decrease (AIAD) and multiplicative-increase (MIMD) flocks do not earn 3 stars the way AIMD does', () => {
  const rows = [];
  for (const id of [1, 2, 3, 4, 5]) { const a = starsOver(L(id), aiad)[3], m = starsOver(L(id), mimd)[3]; rows.push('L' + id + ' AIAD ' + Math.round(a * 100) + '% MIMD ' + Math.round(m * 100) + '%'); assert.ok(a <= 0.1, 'AIAD level ' + id); assert.ok(m <= 0.2, 'MIMD level ' + id); }
  console.log('   ' + rows.join('; '));
});

test('every jittered schedule keeps its weather: distinct rounds, segments of at least two rounds, real dips', () => {
  for (const id of [2, 3, 4, 5]) {
    const lv = L(id);
    for (let seed = 0; seed < 400; seed++) {
      const c = E.createRun(lv, seed).capSched;
      assert.equal(c.length, lv.cap.length);
      for (let i = 1; i < c.length; i++) assert.ok(c[i][0] >= c[i - 1][0] + 2, 'level ' + id + ' seed ' + seed + ': ' + JSON.stringify(c));
      const dip = Math.min.apply(null, c.map((x) => x[1])), top = Math.max.apply(null, c.map((x) => x[1]));
      assert.ok(top - dip >= 8, 'level ' + id + ' seed ' + seed + ' dip too shallow ' + JSON.stringify(c));
    }
  }
});

test('saved progress is sanitised: tampered localStorage cannot break the game', () => {
  const bad = [{ fails: 7 }, { stars: 5 }, { stars: 'x' }, { helped: [] }, null, 'x', 5, [], { stars: { 1: 9, 2: 'x', 3: 2, 99: 3, 1.5: 2 }, fails: { 1: 500, 2: -3 }, helped: { 1: 'yes' }, flock: 12345, fast: 'true' }];
  for (const b of bad) {
    const o = E.sanitizeProgress(b);
    for (const k of ['stars', 'fails', 'helped', 'adapted']) { assert.ok(o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])); for (const [id, v] of Object.entries(o[k])) { assert.ok(+id >= 1 && +id <= 6 && Number.isInteger(+id)); assert.ok(Number.isInteger(v) && v >= 1); } }
    assert.equal(typeof o.flock, 'string'); assert.equal(typeof o.fast, 'boolean');
    for (const v of Object.values(o.stars)) assert.ok(v <= 3); for (const v of Object.values(o.fails)) assert.ok(v <= 99);
  }
  const ok = E.sanitizeProgress({ stars: { 1: 2, 4: 3 }, fails: { 2: 1 }, helped: { 3: 1 }, adapted: { 1: 1 }, flock: 'Hamish Air', fast: true });
  assert.deepEqual(ok, { stars: { 1: 2, 4: 3 }, fails: { 2: 1 }, helped: { 3: 1 }, adapted: { 1: 1 }, flock: 'Hamish Air', fast: true });
  assert.equal(E.sanitizeProgress({ flock: 'x'.repeat(100) }).flock.length, 28);
});

test('floods earn nothing', () => {
  for (const lv of E.LEVELS.filter((l) => l.stars)) assert.equal(E.starsFor(E.runPolicy(lv, lv.seed, constant(24))), 0);
});

console.log('\n' + n + ' tests passed');
