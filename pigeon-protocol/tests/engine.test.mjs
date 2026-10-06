// Run with: node pigeon-protocol/tests/engine.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { constant, sensible, polite, cubicish, aimd, plusOne } from './strategies.mjs';
const E = createRequire(import.meta.url)('../engine.js');
const L = (id) => E.LEVELS.find((l) => l.id === id);
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok - ' + name); }
const SEEDS = 200;
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
  for (let w = 1; w <= 12; w++) { const run = E.createRun(L(1), 3); const rec = E.playRound(run, w); assert.equal(rec.lost, 0); assert.equal(rec.delivered, w); }
});

test('capacity overflow loses birds (at least the excess)', () => {
  for (const w of [13, 16, 20, 24]) {
    const run = E.createRun(L(1), 3); const rec = E.playRound(run, w);
    assert.ok(rec.lostCrowd >= w - 12, 'w=' + w); assert.ok(rec.delivered <= 12); assert.equal(rec.lostHawk, 0);
  }
});

test('collapse emerges: goodput at 2x capacity is below goodput at capacity', () => {
  const lv = free(Object.assign({}, L(1), { scrolls: 4000 }));
  const goodput = (w) => { let d = 0; for (let s = 0; s < 40; s++) d += E.playRound(E.createRun(lv, s), w).delivered; return d / 40; };
  const atC = goodput(12), over = goodput(24);
  assert.equal(atC, 12); assert.ok(over < atC); assert.ok(over <= 0.5 * atC);
});

test('collapse over a whole run: flooding delivers far less per bird than steady flying', () => {
  const lv = free(L(1));
  const flood = E.runPolicy(lv, 1, constant(24)), steady = E.runPolicy(lv, 1, constant(12));
  assert.ok(flood.sent > steady.sent && flood.lost > 10 * steady.lost);
  assert.ok(flood.delivered / flood.sent < 0.5 * steady.delivered / steady.sent);
  assert.ok(flood.round > steady.round);
});

test('hawk loss is independent of load (about p per bird, even when under capacity)', () => {
  let sent = 0, lostHawk = 0, lostCrowd = 0;
  for (let s = 0; s < 400; s++) { const r = E.createRun(L(2), s); const rec = E.playRound(r, 5); sent += rec.w; lostHawk += rec.lostHawk; lostCrowd += rec.lostCrowd; }
  assert.equal(lostCrowd, 0); assert.ok(Math.abs(lostHawk / sent - 0.1) < 0.025, 'hawk rate ' + lostHawk / sent);
});

test('lost scrolls are retransmitted first, and flagged as second attempts', () => {
  const run = E.createRun(L(1), 3); const r1 = E.playRound(run, 20);
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

test('Reno completes every level given time; flies levels 1 and 6 in time; wins the rival level most of the time', () => {
  for (const lv of E.LEVELS) assert.ok(E.renoReference(lv, lv.seed).won, lv.name);
  for (const id of [1, 6]) assert.ok(E.renoReference(L(id), L(id).seed).inTime, 'Reno in time on level ' + id);
  assert.ok(frac(starsOver(L(3), () => E.renoPolicy(1)), 1) >= 0.7, 'textbook AIMD wins the rival level comfortably');
});

test('Reno stalls under hawks (it mistakes loss for congestion); a hold-on-stray-loss rule does not', () => {
  const lv = L(2);
  assert.ok(frac(starsOver(lv, () => E.renoPolicy(1)), 1) <= 0.1, 'Reno almost never finishes Hawk Season in time');
  assert.ok(frac(starsOver(lv, sensible), 1) >= 0.8);
});

test('rival flock: exists only on its schedule, adapts, digs in when squeezed, and a bully is punished', () => {
  const lv = L(3), run = E.runPolicy(lv, 5, polite());
  assert.equal(run.history[0].rivalW, 0);                                   // not there yet
  assert.ok(run.history[1].rivalW > 0 && run.history[1].rivalOn);           // arrives
  assert.equal(run.history[lv.rival.to].rivalW, 0);                          // and leaves
  assert.ok(run.history.some((h) => h.rivalLost > 0));
  const bully = E.runPolicy(lv, 5, constant(24));
  assert.ok(bully.history.some((h) => h.rivalDugIn), 'the rival digs in when squeezed twice running');
  assert.ok(!bully.won && bully.endReason === 'loft');
  assert.ok(bully.delivered / bully.sent < 0.65);
});

test('capacity schedule changes mid-run (Storm Front)', () => {
  const caps = E.runPolicy(L(4), 1, sensible()).history.map((h) => h.cap);
  assert.deepEqual([caps[0], caps[3], caps[8]], [14, 7, 23]);
});

test('end conditions: deadline, loft and delivery', () => {
  assert.equal(E.runPolicy(L(1), 1, constant(1)).endReason, 'deadline');
  assert.equal(E.runPolicy(L(1), 1, constant(24)).endReason, 'loft');
  assert.equal(E.runPolicy(L(1), 1, constant(12)).endReason, 'delivered');
  assert.throws(() => { const r = E.runPolicy(L(1), 1, constant(12)); E.playRound(r, 3); });
});

test('star thresholds are ordered and fit inside the deadline', () => {
  for (const lv of E.LEVELS.filter((l) => l.stars)) {
    assert.ok(lv.stars.three.rounds <= lv.stars.two.rounds && lv.stars.three.lost <= lv.stars.two.lost, lv.name);
    assert.ok(lv.stars.two.rounds <= lv.deadline, lv.name);
    if (lv.rival) assert.ok(lv.stars.three.share < lv.stars.two.share);
  }
});

test('no flat strategy earns 3 stars on levels 2-5 (adaptation is required)', () => {
  const table = [];
  for (const id of [2, 3, 4, 5]) {
    let worst = 0, worstK = 0;
    for (let k = 1; k <= 24; k++) { const c = starsOver(L(id), () => constant(k)); if (c[3] > worst) { worst = c[3]; worstK = k; } }
    table.push('L' + id + ' best constant 3-star ' + Math.round(worst * 100) + '% (k=' + worstK + ')');
    assert.ok(worst <= 0.05, 'level ' + id + ': a constant window of ' + worstK + ' earns 3 stars ' + Math.round(worst * 100) + '%');
  }
  console.log('   ' + table.join('; '));
});

test('no flat strategy earns 2 stars on the Storm Front or the Big Delivery (at most 3% noise)', () => {
  for (const id of [4, 5]) for (let k = 1; k <= 24; k++) { const c = starsOver(L(id), () => constant(k)); assert.ok(c[2] + c[3] <= 0.03, 'L' + id + ' k=' + k + ' 2+ stars ' + (c[2] + c[3])); }
});

test('adaptive players who only see sent/arrived reach 3 stars most of the time', () => {
  const rows = [];
  for (const [name, mk, ids, min] of [['sensible', sensible, [2, 3, 4], 0.6], ['polite', polite, [2, 3, 5], 0.4], ['cubicish AIMD', cubicish, [2, 3], 0.6]]) {
    for (const id of ids) { const c = starsOver(L(id), mk); rows.push(name + ' L' + id + ': ' + Math.round(c[3] * 100) + '%'); assert.ok(c[3] >= min, name + ' on level ' + id + ' earns 3 stars only ' + Math.round(c[3] * 100) + '%'); }
  }
  for (const id of [2, 3, 4, 5]) assert.ok(frac(starsOver(L(id), sensible), 1) >= 0.8 || id === 5, 'sensible should finish level ' + id);
  assert.ok(frac(starsOver(L(5), sensible), 1) >= 0.7);
  console.log('   ' + rows.join('; '));
});

test('plain AIMD tolerates levels 3 and 5 (finishes); +1 forever never earns 3 stars on level 2 or 4', () => {
  assert.ok(frac(starsOver(L(3), aimd), 1) >= 0.8);
  assert.ok(frac(starsOver(L(5), aimd), 1) >= 0.5);
  for (const id of [2, 4]) assert.equal(starsOver(L(id), plusOne)[3], 0);
});

test('fairness: a flock that hogs the Gap cannot earn 3 stars on the rival levels', () => {
  const greedy = () => { let w = 2; return (run, last) => { if (last) w = Math.min(24, last.lost ? Math.max(14, last.w - 1) : last.w + 3); return w; }; };
  for (const id of [3, 5]) assert.ok(starsOver(L(id), greedy)[3] <= 0.05, 'level ' + id);
  // and share is measured only over rounds the rival was actually flying
  const run = E.runPolicy(L(3), 3, polite());
  assert.ok(E.shareOf(run) > 0 && E.shareOf(run) < 1);
  assert.equal(E.shareOf(E.runPolicy(L(1), 1, constant(12))), 1);
});

test('level 1 teaches by discovery: capacity is a plain static number the UI never needs to reveal; floods earn nothing', () => {
  assert.equal(L(1).cap.length, 1);
  for (const lv of E.LEVELS.filter((l) => l.stars)) assert.equal(E.starsFor(E.runPolicy(lv, lv.seed, constant(24))), 0);
});

console.log('\n' + n + ' tests passed');
