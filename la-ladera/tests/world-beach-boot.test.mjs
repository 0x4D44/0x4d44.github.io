// THE BEACH IN THE BOOT (A5, js/world/beach.js, dev/FEATURE-BEACH.md section 6): in the real page the ground of the coast and every collider of the front and of the pier are part of the world, and the
// SEA, the library's PROPS and the watersports library's PIECES (the pier's kit, the boats, the buoys, the raft) are the later sectors, the ones that load after the playable milestone so they do not add
// to the boot. Four boots, each with its own question:
//   ?lazy=1            the gate is open, the rail, the fixtures' and the pier's colliders stand; neither the sea nor the props nor the pieces are built by the boot: each is one unit of the staged
//                      queue (ids `sea`, `beachprops` and `waterprops`), each finishes without failing, each is warmed through LateWarm (its programs are made off the frame, not inside one), the sea is the only
//                      sea in the scene, every prop of the plan is an instance, and so is every piece of the sea's plan
//   ?lazy=1, furnished the props' files start after the packs the interiors are waiting for (the furniture, the clothes, the goods) have ended; the sea does not wait for anything, and the pieces wait for the sea
//   ?lazy=0 (eager)    all three are built by the boot itself (they are in the scene at the milestone, there is no queue)
//   ?skip=coast        the beach is left as it was: the gate is shut, there is no rail, no fixture, no pier, no sea, no props and no pieces, and neither library is ever asked for
// Quiet box: the browser comes only from tests/chrome.mjs (headless, simulated pointer lock). ?manual: no animation loop. The pages skip the people and the furnishing (the beach does not care).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-beach-boot.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

let b;
before(async () => { b = await launch({ width: 960, height: 540 }); });
after(async () => { await b?.close(); });

/** What the page holds, read in the page (the public surface: __ladera.ctx). */
const PROBE = `(() => {
  const L = window.__ladera, c = L.ctx, walls = c.physics.walls, waters = c.scene.children.filter((o) => o.name === 'water');
  const trace = c.lateWarm?.trace ?? null;
  const pg = c.scene.children.find((o) => o.name === 'props.beachprops'), ps = c.world?.beachprops, pl = c.world?.beachpropsLoad;
  const WG = ['props.watersports', 'props.seafloat', 'props.searopes'], wg = WG.map((n) => c.scene.children.find((o) => o.name === n)), wp = c.world?.waterprops, wl = c.world?.watersportsLoad, sp = c.world?.beachSea;
  const near = (k, l) => Math.abs(k.x - l.x) < 0.01 && Math.abs(k.y - l.y) < 0.01 && Math.abs(k.z - l.z) < 0.01;
  return JSON.stringify({
    beach: c.world?.beach ? { live: c.world.beach.live, sea: c.world.beach.sea, props: c.world.beach.props, waterprops: c.world.beach.waterprops } : null,
    pier: sp ? { walls: walls.filter((w) => /^(pier|raft|boat)[.]/.test(w.id)).length, wallsPlanned: sp.walls.length, floors: c.physics.floors.filter((f) => /^(pier|raft)[.]/.test(f.id)).length, floorsPlanned: sp.floors.length, reported: c.world.beach.pier?.colliders ?? null } : null,
    pieces: wp ? { shown: wg.map((g) => !!g?.visible), batches: wg.map((g) => g ? g.children.length : 0), placed: wp.placed, skipped: wp.skipped, planned: sp.items.length, files: wl?.files, failed: wl?.failed, floaters: wp.floaters,
      ropes: wp.ropes, ropesPlanned: sp.ropes.length, lamps: sp.lamps.length, lit: sp.lamps.filter((l) => c.lights.list.some((k) => k.kind === 'street' && near(k, l.light))).length, systems: c.systems.filter((s) => s.name === 'seafloat-pose').length } : null,
    libraryWater: c.assets.names('watersports').length, warmedWater: trace ? trace.filter((t) => WG.includes(t.root)).length : null,
    gate: walls.filter((w) => w.id === 'coast.gate').map((w) => w.on === false ? 'open' : 'shut'),
    rails: walls.filter((w) => w.id === 'coast.rail').length, railsPlanned: c.plan.coast.rails.length,
    fixtures: walls.filter((w) => w.id === 'prop' && w.z1 > 100 && w.z2 > 100).length,
    fixturesPlanned: c.world?.beach?.fixtures ? c.world.beachFront.solids.reduce((n, s) => n + (s.kind === 'rect' && Math.min(s.w, s.d) >= 2 ? 4 : 1), 0) + c.world.beachFront.lamps.length : 0,
    props: pg ? { shown: pg.visible, batches: pg.children.length, placed: ps?.placed, skipped: ps?.skipped, planned: c.world.beachFront.items.length + (c.world.beachFront.groynes?.length ?? 0), files: pl?.files, failed: pl?.failed, tris: ps?.triangles } : null,
    library: c.assets.names('beach-prop').length, warmedProps: trace ? trace.filter((t) => t.root === 'props.beachprops').length : null,
    waters: waters.length, shown: waters.length > 0 && waters.every((o) => o.visible), meshes: waters.reduce((n, g) => { g.traverse((o) => { if (o.isMesh) n++; }); return n; }, 0),
    worldSea: !!c.world?.sea && c.world.sea.group === waters[0],
    queue: c.staged ? c.staged.log.map((u) => ({ id: u.id, failed: u.failed })) : null, units: c.staged ? [...c.staged.units.keys()] : null,
    warmed: trace ? trace.filter((t) => t.root === 'water').length : null,
    errors: c.errors.map((e) => e.stage + ': ' + e.message),
  });
})()`;
const read = async (page) => JSON.parse(await page.eval(PROBE));

test('?lazy=1: the gate is open and the front and the pier are solid; the sea, the props and the pieces join the staged queue, are warmed off the frame, and the sea is the only one', async () => {
  const page = await b.open('la-ladera/index.html?autostart&manual&lazy=1&warmtrace&skip=people,furnish');
  await page.eval('__ladera.settle({ timeout: 300000 }).then(() => true)', 320000);
  const r = await read(page);
  assert.deepEqual(r.beach, { live: true, sea: 'staged', props: 'staged', waterprops: 'staged' }, 'the boot leaves the sea, the props and the pieces to the queue');
  assert.deepEqual(r.gate, ['open'], 'the plot\'s south gate is open');
  assert.ok(r.railsPlanned > 0 && r.rails === r.railsPlanned, `the deck's rail stands (${r.rails} of ${r.railsPlanned} runs)`);
  assert.ok(r.fixturesPlanned > 150 && r.fixtures === r.fixturesPlanned, `every collider of the front stands from the first frame (${r.fixtures} of ${r.fixturesPlanned} walls)`);
  assert.ok(r.pier.wallsPlanned > 60 && r.pier.walls === r.pier.wallsPlanned && r.pier.floorsPlanned === 2 && r.pier.floors === 2, `the pier's, the raft's and the boats' colliders stand (${r.pier.walls} of ${r.pier.wallsPlanned} walls, ${r.pier.floors} floors)`);
  assert.equal(r.pier.reported, r.pier.walls + r.pier.floors, 'and ctx.world.beach.pier says how many');
  assert.ok(['sea', 'beachprops', 'waterprops'].every((id) => r.units.includes(id)), `the sea, the props and the pieces are units of the queue (${r.units})`);
  assert.deepEqual(r.queue.filter((u) => ['sea', 'beachprops', 'waterprops'].includes(u.id)).sort((p, q) => p.id.localeCompare(q.id)), [{ id: 'beachprops', failed: false }, { id: 'sea', failed: false }, { id: 'waterprops', failed: false }], 'all three finished, and none failed');
  assert.equal(r.waters, 1, 'one sea in the scene');
  assert.equal(r.meshes, 3, 'near, mid and far mesh');
  assert.ok(r.shown && r.worldSea, 'the sea is shown and ctx.world.sea is it');
  assert.ok(r.warmed >= 3, `LateWarm made the sea's programs off the frame (${r.warmed} of its meshes were warmed)`);
  assert.ok(r.props && r.props.shown, 'the props are in the scene and shown');
  assert.ok(r.props.planned > 300 && r.props.placed === r.props.planned && r.props.skipped === 0, `every prop of the plan is an instance (${r.props.placed} of ${r.props.planned}, ${r.props.skipped} skipped)`);
  assert.deepEqual(r.props.failed, [], 'none of the three files failed'); assert.equal(r.props.files, 3);
  assert.ok(r.props.batches > 100 && r.props.batches < 250, `${r.props.batches} instanced meshes`);
  assert.equal(r.library, 97, 'the library\'s 97 props are in the registry only because the sector asked for them');
  assert.ok(r.warmedProps >= 2, `LateWarm made the props' programs (the atlas and its cut-out twin) off the frame (${r.warmedProps} of its meshes were warmed)`);
  // the sea's pieces: three groups (the fixed ones, the floaters, the mooring lines), every piece of the plan an instance, two files, shown, warmed, lit, and one system that poses them
  assert.deepEqual(r.pieces.shown, [true, true, true], 'the pieces\' three groups are shown');
  assert.ok(r.pieces.planned > 300 && r.pieces.placed === r.pieces.planned && r.pieces.skipped === 0, `every piece of the sea's plan is an instance (${r.pieces.placed} of ${r.pieces.planned}, ${r.pieces.skipped} skipped)`);
  assert.deepEqual(r.pieces.failed, [], 'neither of the two files failed'); assert.equal(r.pieces.files, 2, 'the pier\'s and the boats\' files came down, the boards\' stayed on disk');
  assert.ok(r.pieces.batches[0] > 60 && r.pieces.batches[0] < 160 && r.pieces.batches[1] > 20 && r.pieces.batches[1] < 80 && r.pieces.batches[2] === r.pieces.ropesPlanned, `${r.pieces.batches} instanced meshes, and a mesh a line`);
  assert.ok(r.pieces.floaters > 80 && r.pieces.ropes === 3 && r.pieces.systems === 1, `${r.pieces.floaters} floaters on the swell by one system, ${r.pieces.ropes} mooring lines`);
  assert.equal(r.pieces.lamps, 10); assert.equal(r.pieces.lit, r.pieces.lamps, 'every lamp of the pier has its light');
  assert.equal(r.libraryWater, 82, 'the watersports library\'s 41 designs and their low twins are in the registry only because the sector asked for them');
  assert.ok(r.warmedWater >= 3, `LateWarm made the pieces' programs off the frame (${r.warmedWater} of their meshes were warmed)`);
  assert.deepEqual(r.errors, [], 'no error');
});

test('?lazy=1 with the furnishing on: the props\' files wait for the packs the interiors are waiting for, the sea does not, and the pieces wait for the sea', async () => {
  const page = await b.open('la-ladera/index.html?autostart&manual&lazy=1&skip=people');
  await page.eval('__ladera.settle({ timeout: 600000 }).then(() => true)', 620000);
  const log = JSON.parse(await page.eval('JSON.stringify(__ladera.ctx.staged.log.map((u) => [u.id, u.start, u.end, u.failed]))'));
  const at = (id) => log.find((u) => u[0] === id);
  assert.ok(at('interior-packs') && at('beachprops') && at('sea') && at('waterprops'), `the queue holds the packs, the props, the sea and the pieces (${log.map((u) => u[0])})`);
  assert.equal(at('beachprops')[3], false, 'the props did not fail'); assert.equal(at('waterprops')[3], false, 'nor did the pieces');
  assert.ok(at('beachprops')[1] >= at('interior-packs')[2], `the props' files start (${at('beachprops')[1]} ms) after the packs have ended (${at('interior-packs')[2]} ms)`);
  assert.ok(at('sea')[1] < at('interior-packs')[2], `the sea does not wait for them: it started at ${at('sea')[1]} ms, the packs ended at ${at('interior-packs')[2]} ms`);
  assert.ok(at('waterprops')[1] >= at('sea')[2], `the pieces' files start (${at('waterprops')[1]} ms) after the sea has risen (${at('sea')[2]} ms), so a boat's first pose is read from the real surface`);
});

test('eager (?lazy=0): the boot builds the sea, the props and the pieces itself, and there is no queue to wait for', async () => {
  const page = await b.open('la-ladera/index.html?autostart&manual&lazy=0&skip=people,furnish,warm');
  const r = await read(page);
  assert.deepEqual(r.beach, { live: true, sea: 'inline', props: 'inline', waterprops: 'inline' });
  assert.deepEqual(r.gate, ['open']);
  assert.ok(r.railsPlanned > 0 && r.rails === r.railsPlanned, 'the rail stands');
  assert.ok(r.fixturesPlanned > 150 && r.fixtures === r.fixturesPlanned, `the front's colliders stand (${r.fixtures} of ${r.fixturesPlanned})`);
  assert.ok(r.pier.walls === r.pier.wallsPlanned && r.pier.floors === r.pier.floorsPlanned && r.pier.wallsPlanned > 60, `the pier's colliders stand (${r.pier.walls} of ${r.pier.wallsPlanned})`);
  assert.equal(r.waters, 1, 'the sea is in the scene at the milestone');
  assert.equal(r.meshes, 3);
  assert.ok(r.shown && r.worldSea);
  assert.ok(r.props && r.props.shown && r.props.placed === r.props.planned && r.props.skipped === 0, 'every prop of the plan is in the scene at the milestone, shown');
  assert.ok(r.pieces && r.pieces.shown.every(Boolean) && r.pieces.placed === r.pieces.planned && r.pieces.skipped === 0 && r.pieces.lit === r.pieces.lamps, 'every piece of the sea\'s plan is in the scene at the milestone, shown and lit');
  assert.equal(r.queue, null, 'no staged queue in an eager boot');
  assert.deepEqual(r.errors, [], 'no error');
});

test('?skip=coast: the beach is left as it was (a shut gate, no rail, no fixture, no pier, no sea, no props, no pieces, neither library asked for), lazy or not', async () => {
  for (const q of ['lazy=1', 'lazy=0']) {
    const page = await b.open(`la-ladera/index.html?autostart&manual&${q}&skip=people,furnish,warm,coast`);
    await page.eval('__ladera.settle({ timeout: 300000 }).then(() => true)', 320000);
    const r = await read(page);
    assert.deepEqual(r.beach, { live: false, sea: 'none', props: 'none', waterprops: 'none' }, q);
    assert.deepEqual(r.gate, ['shut'], `${q}: the plot's south wall stands`);
    assert.equal(r.rails, 0, `${q}: no rail`); assert.equal(r.fixtures, 0, `${q}: no fixture collider`);
    assert.equal(r.pier, null, `${q}: no pier (no plan, no collider)`);
    assert.equal(r.waters, 0, `${q}: no sea`);
    assert.equal(r.props, null, `${q}: no props`); assert.equal(r.library, 0, `${q}: the library was never asked for`);
    assert.equal(r.pieces, null, `${q}: no pieces`); assert.equal(r.libraryWater, 0, `${q}: nor the watersports library`);
    assert.ok(!r.units?.includes('sea') && !r.units?.includes('beachprops') && !r.units?.includes('waterprops'), `${q}: no unit`);
    assert.deepEqual(r.errors, [], `${q}: no error`);
  }
});
