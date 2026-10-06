// Run with: node pigeon-protocol/tests/engine.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const E = createRequire(import.meta.url)('../engine.js');
const L = (id) => E.LEVELS.find((l) => l.id === id);
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok - ' + name); }

// A sensible human: slow start, back off on crowding (not on hawks), then hold and probe gently.
function sensible(back = 0.8, every = 3) {
  let ssdone = false, hold = 0;
  return (run, last) => {
    if (!last) return 2;
    if (last.lostCrowd > 0) { ssdone = true; hold = 0; return Math.max(2, Math.floor(last.w * back)); }
    if (!ssdone) return last.w * 2;
    hold++;
    return hold % every === 0 ? last.w + 1 : last.w;
  };
}
const constant = (w) => () => w;
const free = (lv) => Object.assign({}, lv, { deadline: 60, loft: 9999 });

test('determinism: same seed, same history; different seed, different history', () => {
  const a = E.runPolicy(L(5), 77, sensible()), b = E.runPolicy(L(5), 77, sensible()), c = E.runPolicy(L(5), 78, sensible());
  const strip = (r) => JSON.stringify(r.history.map((h) => [h.w, h.delivered, h.lostCrowd, h.lostHawk, h.rivalW]));
  assert.equal(strip(a), strip(b));
  assert.notEqual(strip(a), strip(c));
  assert.equal(E.mulberry32(5)(), E.mulberry32(5)());
});

test('under capacity, with no hawks, nothing is lost', () => {
  for (let w = 1; w <= 12; w++) {
    const run = E.createRun(L(1), 3); const rec = E.playRound(run, w);
    assert.equal(rec.lost, 0); assert.equal(rec.delivered, w);
  }
});

test('capacity overflow loses birds (at least the excess)', () => {
  for (const w of [13, 16, 20, 24]) {
    const run = E.createRun(L(1), 3); const rec = E.playRound(run, w);
    assert.ok(rec.lostCrowd >= w - 12, 'w=' + w);
    assert.ok(rec.delivered <= 12);
    assert.equal(rec.lostHawk, 0);
  }
});

test('collapse emerges: goodput at 2x capacity is below goodput at capacity', () => {
  const lv = free(Object.assign({}, L(1), { scrolls: 4000 }));
  const goodput = (w) => { let d = 0, N = 40; for (let s = 0; s < N; s++) { const r = E.createRun(lv, s); d += E.playRound(r, w).delivered; } return d / N; };
  const atC = goodput(12), over = goodput(24), way = goodput(24);
  assert.equal(atC, 12);
  assert.ok(over < atC, 'goodput ' + over + ' vs ' + atC);
  assert.ok(over <= 0.5 * atC);
  // ...while birds flown rise.
  assert.ok(24 > 12 && way < atC);
});

test('collapse emerges over a whole run: flooding delivers far less per bird than steady flying', () => {
  const lv = free(L(1));
  const flood = E.runPolicy(lv, 1, constant(24)), steady = E.runPolicy(lv, 1, constant(12));
  assert.ok(flood.sent > steady.sent && flood.lost > 10 * steady.lost);
  assert.ok(flood.delivered / flood.sent < 0.5 * steady.delivered / steady.sent);
  assert.ok(flood.round > steady.round);
});

test('hawk loss is independent of load (about p per bird, even when under capacity)', () => {
  let sent = 0, lostHawk = 0, lostCrowd = 0;
  for (let s = 0; s < 400; s++) { const r = E.createRun(L(2), s); const rec = E.playRound(r, 5); sent += rec.w; lostHawk += rec.lostHawk; lostCrowd += rec.lostCrowd; }
  assert.equal(lostCrowd, 0);
  assert.ok(Math.abs(lostHawk / sent - 0.1) < 0.025, 'hawk rate ' + lostHawk / sent);
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

test('Reno completes every level given time, and the shipped levels that suit it in time', () => {
  for (const lv of E.LEVELS) {
    const ref = E.renoReference(lv, lv.seed);
    assert.ok(ref.won, lv.name + ' should be completable by Reno eventually');
  }
  for (const id of [1, 4, 6]) assert.ok(E.renoReference(L(id), L(id).seed).inTime, 'Reno in time on level ' + id);
});

test('Reno stalls under hawks (it mistakes loss for congestion)', () => {
  const ref = E.renoReference(L(2), L(2).seed);
  const smart = E.runPolicy(L(2), L(2).seed, sensible());
  assert.ok(ref.rounds > smart.round + 3, 'reno ' + ref.rounds + ' vs ' + smart.round);
});

test('rival flock exists, adapts, and a greedy player wrecks both', () => {
  const run = E.runPolicy(L(3), 5, sensible());
  assert.ok(run.history[0].rivalW > 0);
  assert.ok(run.history.some((h) => h.rivalLost > 0));
  const greedy = E.runPolicy(L(3), 5, constant(24));
  assert.ok(greedy.history.every((h) => h.delivered + h.rivalDelivered <= h.cap));
  assert.ok(greedy.history.some((h) => h.rivalLost > 0));
  assert.ok(greedy.delivered / greedy.sent < 0.65);
  assert.ok(!greedy.won && greedy.endReason === 'loft');
});

test('capacity schedule changes mid-run (Storm Front)', () => {
  const caps = E.runPolicy(L(4), 1, sensible()).history.map((h) => h.cap);
  assert.deepEqual([caps[0], caps[5], caps[9]], [14, 7, 18]);
});

test('end conditions: deadline, loft and delivery', () => {
  assert.equal(E.runPolicy(L(1), 1, constant(1)).endReason, 'deadline');
  assert.equal(E.runPolicy(L(1), 1, constant(24)).endReason, 'loft');
  assert.equal(E.runPolicy(L(1), 1, constant(12)).endReason, 'delivered');
  assert.throws(() => { const r = E.runPolicy(L(1), 1, constant(12)); E.playRound(r, 3); });
});

test('star thresholds are ordered and Reno never beats its own bar', () => {
  for (const lv of E.LEVELS.filter((l) => l.stars)) {
    assert.ok(lv.stars.three.rounds <= lv.stars.two.rounds && lv.stars.three.lost <= lv.stars.two.lost);
    assert.ok(lv.stars.two.rounds <= lv.deadline);
    let renoThree = 0;
    for (let s = 0; s < 40; s++) renoThree += E.starsFor(E.runPolicy(lv, lv.seed + s, E.renoPolicy(1))) === 3 ? 1 : 0;
    assert.ok(renoThree <= 4, lv.name + ': the bird-brain should rarely earn 3 stars (' + renoThree + '/40)');
    assert.ok(E.starsFor(E.runPolicy(lv, lv.seed, E.renoPolicy(1))) <= 2, lv.name + ': Reno on the canonical seed');
  }
  for (const id of [1, 4]) {
    const reno = E.runPolicy(L(id), L(id).seed, E.renoPolicy(1));
    assert.equal(E.starsFor(reno), 2, 'Reno earns exactly 2 stars on level ' + id);
  }
});

test('a sensible human reaches 3 stars most of the time on every ranked level; floods earn none', () => {
  for (const lv of E.LEVELS.filter((l) => l.stars)) {
    let three = 0, won = 0; const N = 40;
    for (let s = 0; s < N; s++) { const run = E.runPolicy(lv, lv.seed + s, lv.id === 5 ? sensible(0.85, 2) : sensible()); if (run.won) won++; if (E.starsFor(run) === 3) three++; }
    assert.ok(three / N >= (lv.id === 5 ? 0.3 : 0.5), lv.name + ': three-star rate ' + three + '/' + N);
    assert.ok(won / N >= (lv.id === 5 ? 0.6 : 0.8), lv.name + ': win rate ' + won + '/' + N);
    assert.equal(E.starsFor(E.runPolicy(lv, lv.seed, constant(24))), 0);
  }
});

console.log('\n' + n + ' tests passed');
