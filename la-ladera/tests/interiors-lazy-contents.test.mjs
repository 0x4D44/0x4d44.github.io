// LAZY INTERIORS and the CONTENTS PLAN (js/interiors/lazy.js `?lazy=1`, js/interiors/contents.js planContents, js/interiors/containers.js activate).
// The plan is ONE for the whole barrio and it reads the furnished slots of EVERY household (kindsByHousehold): an unfurnished household is planned without a limit. A lazy boot furnishes the
// buildings one by one behind the milestone, so a container that woke early (a player who walks into a house in the first seconds) made the plan while most of the barrio was bare: the drawers then
// held other things than an eager boot's (a paper or a find with no slot of its own, or lying in another slot). Containers wake once the data pass has sealed (`ctx.interiors.sealed`), and the
// barrio is then the eager one, drawer for drawer.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-lazy-contents.test.mjs
//   PLAN_SABOTAGE=early   the manager is not on ctx (the containers cannot see that the data is not sealed): the plan is made at the first wake and the comparison must fail
// What is compared with the eager boot (a failing test names the sections and the first differences):
//   units   the plan: the papers and the finds of every household of every building
//   pins    the slot every paper and every find was pinned to (planBuilding)
//   drawers what makeContents puts in every slot (positions, kinds, colours: a digest of the whole list)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildData } from './headless.mjs';
import { InteriorManager } from '../js/interiors/lazy.js';
import { finishBuilding } from '../js/interiors/index.js';
import { buildInterior } from '../js/interiors/build.js';
import { makeContents, contentStats } from '../js/interiors/contents.js';

const SABOTAGE = process.env.PLAN_SABOTAGE ?? '';
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);
const stub = new Map();
const matStub = (key) => { let m = stub.get(key); if (!m) stub.set(key, m = { name: key, isMaterial: true, userData: {}, dispose() {} }); return m; };

/** Wake the containers of every building (the page does it as the player walks about) and digest what the plan and the drawers hold. */
function contentsDigest(ctx) {
  const C = ctx.containers;
  for (const bid of [...C.pending.keys()]) C.activate(bid);
  const plan = ctx.contentPlan; assert.ok(plan, 'the containers made no plan');
  const units = new Map(plan.units.map((u) => [`${u.bid}|${u.hh.id}`, `${u.papers.join(',')}|${u.finds.join(',')}`]));
  const slots = new Map();
  for (const list of C.byBuilding.values()) for (const S of list) slots.set(S.id, { group: S.slot.group, pin: `${S.plan?.paper ?? '-'}/${S.plan?.find ?? '-'}`, drawer: sha(JSON.stringify(makeContents(ctx, S))) });
  const orphans = [...plan.placed].reduce((n, [, o]) => n + o.orphans.length, 0), stats = contentStats(ctx);
  return { units, slots, orphans, planned: stats.planned, pinned: { papers: stats.papers, finds: stats.finds }, buildings: C.byBuilding.size };
}
/** The sections of `b` that differ from `a`, with the first few differences of each. */
function differences(a, b) {
  const out = [], unit = [], pin = [], drawer = [];
  for (const [k, v] of a.units) if (b.units.get(k) !== v) unit.push(`${k}: eager [${v}], lazy [${b.units.get(k)}]`);
  for (const [k, v] of a.slots) {
    const w = b.slots.get(k);
    if (!w) { pin.push(`${k}: not in the lazy barrio`); continue; }
    if (w.pin !== v.pin) pin.push(`${k} (${v.group}): eager ${v.pin}, lazy ${w.pin}`);
    if (w.drawer !== v.drawer) drawer.push(`${k} (${v.group})`);
  }
  for (const k of b.slots.keys()) if (!a.slots.has(k)) pin.push(`${k}: only in the lazy barrio`);
  for (const [name, list] of [['households planned differently', unit], ['slots pinned differently', pin], ['drawers holding other things', drawer]]) if (list.length) out.push(`${list.length} ${name}, first: ${list.slice(0, 3).join(' | ')}`);
  if (a.orphans !== b.orphans) out.push(`orphans: eager ${a.orphans}, lazy ${b.orphans} (planned items with no slot of their own)`);
  return out;
}

/** The eager boot: every building furnished, then every interior made; the world is dropped and only its digest kept. */
const eager = await (async () => {
  const w = await buildData(); w.ctx.mat = matStub;
  for (const bp of w.buildings) buildInterior(w.ctx, bp);
  return contentsDigest(w.ctx);
})();

/** A `?lazy=1` world as the page has it at the milestone (main.js: planned, the shells' finishes, the chapel's furniture, the shells' colliders; the manager is on ctx), with the packs in. */
async function lazyWorld() {
  const w = await buildData({ furnish: false, colliders: false }), { ctx } = w; ctx.mat = matStub;
  const mgr = new InteriorManager(ctx, { meshes: true }); if (SABOTAGE !== 'early') ctx.interiors = mgr;
  mgr.setPacks(true);
  for (const bp of ctx.buildings.values()) { finishBuilding(ctx, bp); if (bp.lot?.kind === 'chapel') mgr.ensureData(bp.id); }
  mgr.addShellColliders();
  return { ctx, mgr, bps: [...ctx.buildings.values()] };
}

test('the eager boot is what it was: everything is furnished before a container wakes, so the plan knows every household\'s slots (no item left without a slot)', () => {
  assert.ok(eager.buildings > 100, `${eager.buildings} buildings with openable fronts`);
  assert.ok(eager.slots.size > 1000, `${eager.slots.size} slots`);
  assert.equal(eager.orphans, 0, 'orphans in the eager plan');
  assert.ok(eager.planned.papers > 100 && eager.planned.finds > 100, `${eager.planned.papers} papers and ${eager.planned.finds} finds planned`);
});

test('a container that is near a player at the very start waits for the data pass, and the plan made once it has sealed is the eager plan, household for household and drawer for drawer', async () => {
  const { ctx, mgr, bps } = await lazyWorld();
  const B = bps.filter((bp) => bp.entrances?.length)[40] ?? bps[40];                  // a building in the middle of the barrio
  const bx = B.bounds; ctx.player = { s: { x: (bx.x0 + bx.x1) / 2, y: 0, z: (bx.z0 + bx.z1) / 2 } };
  for (let n = 0; !mgr.ready(B.id); n++) { mgr.pump(0); assert.ok(n < 1e6, 'the building by the player was never made'); }   // the nearest first: its interior is the first one made
  const C = ctx.containers, e = C.pending.get(B.id), p = ctx.player.s;
  assert.ok(e, `${B.id} has openable fronts (this test is about them)`);
  assert.ok(Math.hypot(p.x - e.cx, p.z - e.cz) - e.r < 10 && e.group.obj.visible !== false, 'the player is within reach of its fronts and its interior is shown: only the data pass can keep them asleep');
  const furnished = mgr.nData;
  assert.equal(mgr.sealed, false); assert.ok(furnished < 20, `${furnished} of ${bps.length} buildings furnished: most of the barrio is still bare`);
  C.scan();
  // (booleans and numbers only: a failed assert.equal on the plan itself would try to print the whole barrio)
  assert.equal(C.byBuilding.size, 0, `a container woke with ${furnished} of ${bps.length} buildings furnished, before the data pass sealed`);
  assert.equal(!!ctx.contentPlan, false, `the contents plan was made with ${furnished} of ${bps.length} buildings furnished: it plans the unfurnished ones without a limit, so the drawers differ from the eager boot's`);
  mgr.drain();                                                                       // the rest of the barrio is made
  assert.equal(mgr.sealed, true);
  C.scan();
  assert.equal(C.byBuilding.has(B.id) && !!ctx.contentPlan, true, 'the containers wake once the data has sealed');
  const lazy = contentsDigest(ctx);
  assert.equal(lazy.buildings, eager.buildings, 'every building with openable fronts has woken, as in the eager boot');
  assert.deepEqual(differences(eager, lazy), [], 'the lazy barrio differs from the eager one');
  assert.equal(ctx.errors.length, 0, ctx.errors.map((x) => x.message).join('\n'));
});

if (SABOTAGE) test(`PLAN_SABOTAGE=${SABOTAGE} is active`, () => { assert.equal(SABOTAGE, 'early'); });
