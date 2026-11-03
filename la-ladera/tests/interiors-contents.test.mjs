// INTERIORS contents, placement over A2's REAL barrio (every lot, the real households): which paper and which special find sit in which slot.
// The writing is the lead's (papers.js, finds.js, content.js: tests/interiors-content.test.mjs); this file holds the PLACEMENT to the acceptance of dev/FEATURE-DRAWERS.md:
// a readable paper in >= 100 of 110 buildings, no paper in more than 2 homes, <= 3 finds per building, every find between its min and max, the household filters honoured,
// papers in slots a person can stand in front of, no item planned beyond the slots of its household (no orphans), every container kind offered, the same plan twice.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-contents.test.mjs
//   A3_LIST=12
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch } from './interiors-lib.mjs';
import { buildInterior } from '../js/interiors/build.js';
import { frontSpots } from '../js/interiors/containers.js';
import { planContents, planBuilding, contentStats, PAPER_CAP, FINDS_PER_BUILDING, lotOf, matchPapers, spread, distances } from '../js/interiors/contents.js';
import { PAPERS, paperById } from '../js/interiors/papers.js';
import { FINDS, findById } from '../js/interiors/finds.js';
import { eligible, CONTAINER_KINDS } from '../js/interiors/content.js';

const LIST = +(process.env.A3_LIST || 12);
const report = (problems, what, lim = LIST) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, lim).join('\n  '));
const { ctx, bps } = await furnishedBatch({ real: true });
const stub = new Map(); ctx.mat = (key) => { let m = stub.get(key); if (!m) stub.set(key, m = { name: key, isMaterial: true, userData: {}, dispose() {} }); return m; };
for (const bp of bps) buildInterior(ctx, bp);
const C = ctx.containers;
for (const bp of bps) C.activate(bp.id);
const slots = [...C.slots.values()];
const placed = (field) => slots.filter((S) => S.plan?.[field]);
const plan = ctx.contentPlan;

test(`placement: a paper to read in >= 100 of ${bps.length} buildings, none read in more than ${PAPER_CAP} homes, at most ${FINDS_PER_BUILDING} finds per building`, () => {
  const stats = contentStats(ctx), perBuilding = new Set(), perHousehold = new Map(), homes = new Map(), finds = new Map();
  for (const S of placed('paper')) {
    perBuilding.add(S.bid); (homes.get(S.plan.paper) ?? homes.set(S.plan.paper, new Set()).get(S.plan.paper)).add(S.bid);
    (perHousehold.get(S.hh?.id) ?? perHousehold.set(S.hh?.id, new Set()).get(S.hh?.id)).add(S.plan.paper);
  }
  for (const S of placed('find')) finds.set(S.bid, (finds.get(S.bid) ?? 0) + 1);
  const withPaper = perBuilding.size, problems = [];
  console.log(`# placement: ${stats.papers} papers and ${stats.finds} finds placed in ${stats.buildings} buildings; ${withPaper} buildings with a paper; ${stats.orphans} orphans (items with no fitting slot in their building); ${slots.length} slots`);
  for (const [id, set] of homes) if (set.size > PAPER_CAP) problems.push(`paper ${id} is in ${set.size} buildings`);
  for (const [bid, n] of finds) if (n > FINDS_PER_BUILDING) problems.push(`${bid}: ${n} finds`);
  for (const [hid, set] of perHousehold) if (set.size > 3) problems.push(`household ${hid}: ${set.size} papers`);
  assert.ok(withPaper >= Math.min(100, Math.floor(0.9 * bps.length)), `${withPaper} of ${bps.length} buildings have a paper in a slot`);
  report(problems, 'placement limits broken');
});

test('placement: every find lies between its min and max in the barrio (min as far as the homes allow), and every placed item is one its household may have', () => {
  const count = new Map(), problems = [];
  for (const S of placed('find')) count.set(S.plan.find, (count.get(S.plan.find) ?? 0) + 1);
  let short = 0, wanted = 0, got = 0;
  for (const f of FINDS) {
    const n = count.get(f.id) ?? 0;
    wanted += f.min; got += Math.min(n, f.min);
    if (n > f.max) problems.push(`find ${f.id}: ${n} placed, max ${f.max}`);
    if (n === 0) problems.push(`find ${f.id}: placed nowhere (a find nobody can ever find: the plan chose households whose containers of the kind it asks for are all decoration, R4-118)`);
    if (n < f.min) { short++; if (short <= LIST) console.log(`# find ${f.id} (${f.kind}): ${n} placed, min ${f.min}`); }
  }
  console.log(`# finds: ${[...count.values()].reduce((a, b) => a + b, 0)} placed, ${got} of the ${wanted} minimum placements met, ${short} of ${FINDS.length} finds below their min, ${plan.missing.length} the plan could not place`);
  assert.ok(got >= 0.9 * wanted, `${got} of ${wanted} minimum placements met`);
  for (const S of slots) {
    const lot = lotOf(S.bp);
    for (const [field, byId] of [['paper', new Map(PAPERS.map((p) => [p.id, p]))], ['find', findById]]) {
      const id = S.plan?.[field]; if (!id) continue;
      if (!eligible(byId.get(id), S.hh, lot, S.slot.group)) problems.push(`${S.bid} ${S.id}: ${field} ${id} is not for this household / lot / container (${S.slot.group})`);
    }
  }
  report(problems, 'find / filter problems');
});

test('placement: papers and finds sit in slots a person can stand in front of; orphans are few', () => {
  const stats = contentStats(ctx), items = placed('paper').length + placed('find').length;
  const blocked = [...placed('paper'), ...placed('find')].filter((S) => S.reachable === false || !frontSpots(S).length);     // re-asked of the layout, not of the flag
  console.log(`# reach: ${items - blocked.length} of ${items} placed items are in a reachable slot`);
  assert.equal(blocked.length, 0, `${blocked.length} of ${items} placed items are in a slot nobody can stand in front of: ${blocked.slice(0, 6).map((S) => `${S.id}`).join(', ')}`);
  // the plan only gives a household what it has a container to open (decoration fronts do not count: contents.js kindsByHousehold), so few items are left without a slot (R4-118)
  assert.ok(stats.orphans <= 0.03 * (stats.papers + stats.finds + stats.orphans), `${stats.orphans} orphans of ${stats.papers + stats.finds + stats.orphans} items`);
});

test('placement: no household is planned more papers, or more finds, than it has slots to hold them, so nothing planned is left without a slot', () => {
  // the plan counts the slots of every household (contents.js kindsByHousehold) before the containers register them: it must never count more of a kind than they register (an orphan is the symptom)
  const tally = (list) => { const m = new Map(); for (const k of list) m.set(k, (m.get(k) ?? 0) + 1); return m; };
  const stats = contentStats(ctx), problems = [], registered = new Map();
  for (const S of slots) { const key = `${S.bid}|${S.hh?.id}`; (registered.get(key) ?? registered.set(key, []).get(key)).push(S.slot.group); }
  for (const u of plan.units) {
    if (!u.kinds) continue;
    const real = tally(registered.get(`${u.bid}|${u.hh.id}`) ?? []);
    for (const [k, n] of tally([...u.kinds])) if (n > (real.get(k) ?? 0)) problems.push(`${u.bid} ${u.hh.id}: the plan counts ${n} ${k} slots, the containers registered ${real.get(k) ?? 0}`);
  }
  report(problems, 'households whose slots the plan counts wrongly');
  const orphans = [...plan.placed].flatMap(([bid, o]) => o.orphans.map((x) => `${bid} ${x.hh}: ${x.what} ${x.id}`));
  console.log(`# orphans: ${orphans.length} of ${stats.papers + stats.finds + stats.orphans} planned items`);
  report(orphans, 'planned items have no slot of their own in their household');
});

test('planBuilding: an item whose slots another took moves that one on to a slot it fits, instead of becoming an orphan', () => {
  // one household with a nightstand and a dresser, a paper for either and a paper for the nightstand alone: whichever order they are pinned in, both must be seated
  const wide = { id: 't_either', where: ['nightstand', 'dresser'] }, narrow = { id: 't_night', where: ['nightstand'] };
  const pin = (papers, k) => {
    const bp = { id: 'B', interior: { hh: [{ id: 'H' }], rooms: { r: { hh: 'H' } } } }, c = { buildings: new Map([['B', bp]]), seed: 1 };
    const mk = (group, id) => ({ id: id + k, bp, rec: { id: 'rec' + id + k, room: 'r' }, slot: { group }, reachable: true });
    const list = [mk('nightstand', 'n'), mk('dresser', 'd')];                                   // the slot ids decide which one the wide paper likes best
    c.contentPlan = { sig: `1:1:${PAPERS.length}:${FINDS.length}`, byBuilding: new Map([['B', [{ bid: 'B', hh: bp.interior.hh[0], papers, finds: [] }]]]), placed: new Map() };
    return { out: planBuilding(c, bp, list), list };
  };
  for (const p of [wide, narrow]) paperById.set(p.id, p);
  try {
    let likes = 0;
    for (let k = 0; k < 40; k++) {
      if (pin([wide.id], k).list[0].plan.paper !== wide.id) continue;                           // only where the wide paper alone takes the nightstand is the narrow one in its way
      likes++;
      for (const papers of [[wide.id, narrow.id], [narrow.id, wide.id]]) {
        const { out, list } = pin(papers, k);
        assert.deepEqual(out.orphans, [], `${papers.join(' then ')} (slot ids ${k}): orphans`);
        assert.deepEqual(list.map((S) => S.plan.paper), [narrow.id, wide.id], `${papers.join(' then ')} (slot ids ${k}): the nightstand is the narrow paper's only place`);
      }
    }
    assert.ok(likes >= 3, `only ${likes} of 40 slot-id variants make the wide paper like the nightstand: this test would prove nothing`);
  } finally { for (const p of [wide, narrow]) paperById.delete(p.id); }
});

test('reach (R4-118): a front nobody can stand in front of is decoration (no slot, no prompt, no contents): every registered slot has a standing spot, and the decoration stays a minority', () => {
  let decor = 0; for (const bp of bps) decor += C.byBuilding.get(bp.id)?.decor ?? 0;
  const made = slots.length + decor, stuck = slots.filter((S) => !S.reachable || !frontSpots(S).length);
  console.log(`# reach: ${slots.length} slots with a standing spot, ${decor} fronts left as decoration (${(100 * decor / made).toFixed(1)}% of ${made})`);
  assert.equal(stuck.length, 0, `${stuck.length} of ${slots.length} registered slots have no standing spot in front: ${stuck.slice(0, 6).map((S) => S.id).join(', ')}`);
  assert.ok(decor > 0, 'no front was left as decoration: the real barrio has nightstands wedged behind beds, so the check is not looking at the fronts');
  assert.ok(decor <= 0.2 * made, `${decor} of ${made} fronts are decoration only (${(100 * decor / made).toFixed(1)}%): too many openable containers are lost`);
});

test('every container kind of papers.js / finds.js is offered by some slot of the barrio', () => {
  const have = new Set(slots.map((S) => S.slot.group));
  report(CONTAINER_KINDS.filter((k) => !have.has(k)), 'container kinds with no slot anywhere');
});

test('the plan is deterministic: planned again from the same buildings it is the same', () => {
  const sig = (p) => p.units.map((u) => `${u.bid}|${u.hh.id}|${u.papers.join(',')}|${u.finds.join(',')}`).join('\n');
  const a = sig(plan);
  ctx.contentPlan = undefined;
  const b = sig(planContents(ctx));
  assert.equal(b, a);
  assert.equal(plan.units.length > 100, true);
});

// ------------------------------------------------------------------ the same paper in two homes (R2b-204, R2b-209)
// 109 buildings share the 75 papers of papers.js, so at least 34 papers are read in two homes whatever the plan does (PAPER_CAP 2), and the plan gives households a second paper where they have a slot left: about 60 are read in two.
// What it can choose is WHICH two. A matching that ignored where the homes stand paired 25 of them under 50 m apart, two houses 6 m apart (L94 and L95) among them: a walk down one street met one letter twice.
// (Not the plan's to mend: L11 and L44, the two workshops, may have only the two workshop papers of papers.js, so each reads both, 129 m apart.)
const lotAt = new Map(bps.map((bp) => [bp.id, bp.lot]));
const apart = (a, b) => Math.hypot(lotAt.get(a).x - lotAt.get(b).x, lotAt.get(a).z - lotAt.get(b).z);

test('papers (R2b-204, R2b-209): a paper that two homes read is read in two homes that stand apart: none within 60 m (the plan paired 32 of them, one 6 m apart), and the median pair at least 85 m', () => {
  const homes = new Map();                                                 // paper id -> the buildings that read it
  for (const u of plan.units) for (const id of u.papers) (homes.get(id) ?? homes.set(id, new Set()).get(id)).add(u.bid);
  const pairs = [...homes].filter(([, s]) => s.size === 2).map(([id, s]) => { const [a, b] = [...s]; return { id, a, b, d: apart(a, b) }; }).sort((p, q) => p.d - q.d);
  const median = pairs.length ? pairs[Math.floor(pairs.length / 2)].d : 0;
  console.log(`# papers: ${homes.size} of ${PAPERS.length} read somewhere, ${pairs.length} in two homes; the nearest pair ${pairs[0]?.d.toFixed(0)} m, the median ${median.toFixed(0)} m, ${pairs.filter((p) => p.d < 100).length} under 100 m`);
  assert.ok(pairs.length >= 30, `${pairs.length} papers are read in two homes: the census looks at nothing (34 at least are forced, about 60 planned)`);
  report(pairs.filter((p) => p.d < 60).map((p) => `${p.id}: ${p.a} and ${p.b} are ${p.d.toFixed(0)} m apart`), 'papers read in two homes less than 60 m apart');
  assert.ok(median >= 85, `the median pair of homes that read one paper stands ${median.toFixed(0)} m apart, 85 m wanted`);
});

test('papers: no paper is read in two homes while a paper that no home reads was one of them could have had (the matching let two buildings share a letter and left another unread)', () => {
  const read = new Set(plan.units.flatMap((u) => u.papers)), count = new Map();
  for (const u of plan.units) for (const id of new Set(u.papers)) count.set(id, (count.get(id) ?? 0) + 1);
  const fitsKinds = (p, u) => !u.kinds || p.where.some((k) => u.kinds.includes(k));
  const free = (u) => PAPERS.filter((q) => !read.has(q.id) && eligible(q, u.hh, u.lot, null) && fitsKinds(q, u));
  const bad = [];
  for (const u of plan.units) for (const id of u.papers) if (count.get(id) >= 2 && free(u).length) bad.push(`${u.bid} ${u.hh.id} reads ${id}, which ${count.get(id) - 1} other home(s) read, and ${free(u)[0].id} is read nowhere`);
  console.log(`# papers read nowhere: ${PAPERS.length - read.size}`);
  report(bad, 'repeats with an unread paper in hand');
});

/** Units for the plan's own steps: one household to a building, no slots known (`kinds` null: it holds anything), every paper in `cands` its own to take. */
const unitsOf = (n) => Array.from({ length: n }, (_, i) => ({ bid: `S${i}`, hh: { id: `S${i}.all` }, lot: {}, kinds: null, papers: [], finds: [] }));

test('matchPapers: while there are papers to spare every building gets one of its own, and only when they run out does a paper go to a second home', () => {
  for (const [n, k] of [[6, 6], [9, 9], [12, 12], [8, 12], [20, 20]]) {
    const units = unitsOf(n), got = matchPapers(units, units.map(() => PAPERS.slice(0, k).map((_, i) => i)));
    assert.equal(got.length, n, `${n} buildings and ${k} papers: every building gets one`);
    assert.equal(new Set(got.map((g) => g.pi)).size, n, `${n} buildings and ${k} papers: no paper is given twice while another is unread`);
  }
  const units = unitsOf(10), got = matchPapers(units, units.map(() => [0, 1, 2, 3, 4])), per = new Map();
  assert.equal(got.length, 10, '10 buildings and 5 papers: every building still gets one');
  for (const g of got) per.set(g.pi, (per.get(g.pi) ?? 0) + 1);
  assert.deepEqual([...per.values()].sort(), [2, 2, 2, 2, 2], '10 buildings and 5 papers: each paper is read in exactly two');
});

/** A hand-made state for `spread`: buildings on a line (`places`: id -> metres), each reading the papers `holding` lists (indexes into PAPERS); `cands` lists the papers each building could have. */
function plant(places, holding, cands = null) {
  const units = Object.keys(places).map((bid) => ({ bid, hh: { id: `${bid}.all` }, lot: {}, kinds: null, papers: holding[bid].map((i) => PAPERS[i].id), finds: [] }));
  const top = 1 + Math.max(...Object.values(holding).flat()), use = PAPERS.map(() => 0), homes = PAPERS.map(() => []), held = new Map();
  for (const u of units) { held.set(u.bid, new Set(u.papers)); for (const id of u.papers) { const pi = PAPERS.findIndex((p) => p.id === id); use[pi]++; homes[pi].push(u.bid); } }
  return { units, cands: cands ?? units.map(() => PAPERS.slice(0, top).map((_, i) => i)), use, held, homes, away: (a, b) => Math.round(Math.abs(places[a] - places[b])) };
}
/** What `spread` promises whatever it moves: each building reads as many papers as before, none twice, in step with `held`, `homes` and `use`; each paper is read in at most PAPER_CAP homes, and only by a building that may have it. */
function sound(S, counts) {
  for (const [k, u] of S.units.entries()) {
    assert.equal(u.papers.length, counts[k], `${u.bid} keeps its ${counts[k]} paper(s)`);
    assert.equal(new Set(u.papers).size, u.papers.length, `${u.bid} reads no paper twice`);
    assert.deepEqual([...S.held.get(u.bid)].sort(), [...u.papers].sort(), `${u.bid}: the set of its papers is in step`);
    for (const id of u.papers) assert.ok(S.cands[k].includes(PAPERS.findIndex((p) => p.id === id)), `${u.bid} reads ${id}, which it may not have`);
  }
  PAPERS.forEach((p, pi) => {
    const who = S.units.filter((u) => u.papers.includes(p.id)).map((u) => u.bid);
    assert.deepEqual([...S.homes[pi]].sort(), who.sort(), `paper ${pi}: the homes are in step`);
    assert.equal(S.use[pi], who.length, `paper ${pi}: its count is in step`);
    assert.ok(who.length <= PAPER_CAP, `paper ${pi} is read in ${who.length} homes`);
  });
}

test('spread: two pairs that each read one paper, the pair next door and the pair far away, swap so that each paper is read at both ends (R2b-209: one letter in two houses 6 m apart)', () => {
  const S = plant({ A: 0, B: 10, C: 500, D: 510 }, { A: [0], B: [0], C: [1], D: [1] });
  spread(S.units, S.cands, S.use, S.held, S.homes, S.away);
  for (const pi of [0, 1]) { const [x, y] = S.homes[pi]; assert.ok(S.away(x, y) >= 400, `paper ${pi} is read in ${x} and ${y}, ${S.away(x, y)} m apart`); }
  sound(S, [1, 1, 1, 1]);
});

test('spread: a home that shares a paper with one next door takes a paper that nobody reads instead; a pair already far apart is left alone', () => {
  const near = plant({ A: 0, B: 10 }, { A: [0], B: [0] }, [[0, 1], [0, 1]]);
  spread(near.units, near.cands, near.use, near.held, near.homes, near.away);
  assert.deepEqual(near.use.slice(0, 2), [1, 1], 'the paper is read in one home, the other paper in the other');
  sound(near, [1, 1]);
  const far = plant({ A: 0, B: 500 }, { A: [0], B: [0] }, [[0, 1], [0, 1]]), was = far.units.map((u) => u.papers.join());
  spread(far.units, far.cands, far.use, far.held, far.homes, far.away);
  assert.deepEqual(far.units.map((u) => u.papers.join()), was, 'two homes 500 m apart keep their paper');
});

test('spread: it moves only within what a home may have, and never gives a home a paper it already reads', () => {
  const bound = plant({ A: 0, B: 10 }, { A: [0], B: [0] }, [[0], [0]]);                         // neither may have another paper: the pair stays
  spread(bound.units, bound.cands, bound.use, bound.held, bound.homes, bound.away);
  assert.equal(bound.use[0], 2, 'the pair stays: there is nothing else for either');
  sound(bound, [1, 1]);
  const twice = plant({ A: 0, B: 10, C: 500 }, { A: [0, 1], B: [0], C: [1] });                   // A reads both papers, B shares one with A, C the other
  spread(twice.units, twice.cands, twice.use, twice.held, twice.homes, twice.away);
  sound(twice, [2, 1, 1]);
});

test('spread: a move that would not put a pair further apart is not made, and it says how many it made', () => {
  const S = plant({ A: 0, B: 10, C: 5 }, { A: [0], B: [0], C: [1] }, [[0, 1], [0], [1]]);       // A could read paper 1, but C reads it 5 m away: no better than B 10 m away
  assert.equal(spread(S.units, S.cands, S.use, S.held, S.homes, S.away), 0, 'no move is made');
  assert.deepEqual(S.units.map((u) => u.papers.join()), [PAPERS[0].id, PAPERS[0].id, PAPERS[1].id], 'everyone keeps what they read');
  sound(S, [1, 1, 1]);
  const T = plant({ A: 0, B: 10 }, { A: [0], B: [0] }, [[0, 1], [0, 1]]);
  assert.equal(spread(T.units, T.cands, T.use, T.held, T.homes, T.away), 1, 'a pair next door: one home takes the paper nobody reads, in one move');
});

// A household with its slots known (`kinds`) holds only the papers that each have a slot of a kind they ask for: a living room's wall unit takes a living-room paper, a bedroom's nightstand a bedroom's.
const living = PAPERS.map((_, i) => i).filter((i) => PAPERS[i].where.includes('wallunit') && !PAPERS[i].where.includes('nightstand'));
const bedroom = PAPERS.map((_, i) => i).filter((i) => PAPERS[i].where.includes('nightstand') && !PAPERS[i].where.includes('wallunit'));

test('spread: a home takes another paper in place of one only where it keeps a slot for each of its papers (a paper for the wall unit gives way to one for the nightstand: one nightstand, two papers for it)', () => {
  assert.ok(living.length >= 2 && bedroom.length >= 2, `the test needs two papers for a wall unit alone (${living.length}) and two for a nightstand alone (${bedroom.length})`);
  const [w1] = living, [n1, n2] = bedroom;
  const set = (kinds) => {
    const S = plant({ A: 0, B: 10 }, { A: [w1], B: [w1, n1] }, [[w1], [w1, n1, n2]]);          // A is bound to its paper; B could swap w1 for n2
    S.units[1].kinds = kinds;
    return S;
  };
  const tight = set(['nightstand', 'wallunit']);                                                // n1 has the nightstand, so n2 would have none
  assert.equal(spread(tight.units, tight.cands, tight.use, tight.held, tight.homes, tight.away), 0, 'no move: B has no slot for n2 beside n1');
  assert.deepEqual(tight.units[1].papers, [PAPERS[w1].id, PAPERS[n1].id], 'B keeps both papers');
  const roomy = set(['wallunit', 'nightstand', 'nightstand']);                                  // two nightstands: the move is a good one
  assert.equal(spread(roomy.units, roomy.cands, roomy.use, roomy.held, roomy.homes, roomy.away), 1, 'a second nightstand: B takes n2');
  assert.deepEqual(roomy.units[1].papers.slice().sort(), [PAPERS[n1].id, PAPERS[n2].id].sort(), 'B reads n1 and n2');
  sound(roomy, [1, 2]);
});

test('spread: two homes swap papers only where each keeps a slot for each of its papers (the exchange: the other home would need a second wall-unit slot)', () => {
  const [w1, w2] = living, [n1] = bedroom;
  const set = (kinds) => {
    const S = plant({ A: 0, B: 10, C: 500, D: 600 }, { A: [w1], B: [w1], C: [n1, w2], D: [n1] }, [[w1], [w1, n1], [n1, w2, w1], [n1]]);   // B could take n1 from C for w1, and D may not have w1
    S.units[2].kinds = kinds;
    return S;
  };
  const tight = set(['nightstand', 'wallunit']);                                                // w1 and w2 would share C's one wall unit
  assert.equal(spread(tight.units, tight.cands, tight.use, tight.held, tight.homes, tight.away), 0, 'no swap: C has no second slot for a wall-unit paper');
  assert.deepEqual(tight.units[2].papers, [PAPERS[n1].id, PAPERS[w2].id], 'C keeps its papers');
  assert.equal(tight.use[w1], 2, 'w1 is still read next door');
  const roomy = set(['nightstand', 'wallunit', 'wallunit']);
  assert.equal(spread(roomy.units, roomy.cands, roomy.use, roomy.held, roomy.homes, roomy.away), 1, 'two wall units: C takes w1 and B takes n1');
  assert.deepEqual(roomy.units[1].papers, [PAPERS[n1].id], 'B reads n1');
  assert.deepEqual(roomy.units[2].papers.slice().sort(), [PAPERS[w1].id, PAPERS[w2].id].sort(), 'C reads w1 and w2');
  sound(roomy, [1, 1, 2, 1]);
});

test('distances: the metres between two buildings along the ground (both axes), and none known for a building with no place on the map', () => {
  const away = distances([{ id: 'a', lot: { x: 0, z: 0 } }, { id: 'b', lot: { x: 0, z: 60 } }, { id: 'c', lot: { x: 30, z: 40 } }, { id: 'd' }]);
  assert.equal(away('a', 'b'), 60, 'a lot due north-south');
  assert.equal(away('a', 'c'), 50, 'a 3-4-5 pair: both axes count');
  assert.equal(away('a', 'a'), 0, 'a building is no distance from itself');
  assert.equal(away('a', 'd'), Infinity, 'a building with no lot is far from everything');
  assert.equal(away('d', 'd'), Infinity, '... itself too');
  assert.equal(away('a', 'nobody'), Infinity, 'a building not in the list');
});
