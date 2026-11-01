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
import { planContents, planBuilding, contentStats, PAPER_CAP, FINDS_PER_BUILDING, lotOf } from '../js/interiors/contents.js';
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
