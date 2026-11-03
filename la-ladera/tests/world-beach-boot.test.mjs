// THE BEACH IN THE BOOT (A5, js/world/beach.js, dev/FEATURE-BEACH.md section 6): in the real page the ground of the coast and every collider of the front are part of the world, and the SEA and
// the library's PROPS are the later sectors, the ones that load after the playable milestone so they do not add to the boot. Four boots, each with its own question:
//   ?lazy=1            the gate is open, the rail and the fixtures' colliders stand; neither the sea nor the props are built by the boot: each is one unit of the staged queue (ids `sea` and
//                      `beachprops`), each finishes without failing, each is warmed through LateWarm (its programs are made off the frame, not inside one), the sea is the only sea in the
//                      scene and every prop of the plan is an instance
//   ?lazy=1, furnished the props' files start after the packs the interiors are waiting for (the furniture, the clothes, the goods) have ended; the sea does not wait for anything
//   ?lazy=0 (eager)    both are built by the boot itself (they are in the scene at the milestone, there is no queue)
//   ?skip=coast        the beach is left as it was: the gate is shut, there is no rail, no fixture, no sea and no props, and the library is never asked for
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
  return JSON.stringify({
    beach: c.world?.beach ? { live: c.world.beach.live, sea: c.world.beach.sea, props: c.world.beach.props } : null,
    gate: walls.filter((w) => w.id === 'coast.gate').map((w) => w.on === false ? 'open' : 'shut'),
    rails: walls.filter((w) => w.id === 'coast.rail').length, railsPlanned: c.plan.coast.rails.length,
    fixtures: walls.filter((w) => w.id === 'prop' && w.z1 > 100 && w.z2 > 100).length,
    fixturesPlanned: c.world?.beach?.fixtures ? c.world.beachFront.solids.reduce((n, s) => n + (s.kind === 'rect' && Math.min(s.w, s.d) >= 2 ? 4 : 1), 0) + c.world.beachFront.lamps.length : 0,
    props: pg ? { shown: pg.visible, batches: pg.children.length, placed: ps?.placed, skipped: ps?.skipped, planned: c.world.beachFront.items.length, files: pl?.files, failed: pl?.failed, tris: ps?.triangles } : null,
    library: c.assets.names('beach-prop').length, warmedProps: trace ? trace.filter((t) => t.root === 'props.beachprops').length : null,
    waters: waters.length, shown: waters.length > 0 && waters.every((o) => o.visible), meshes: waters.reduce((n, g) => { g.traverse((o) => { if (o.isMesh) n++; }); return n; }, 0),
    worldSea: !!c.world?.sea && c.world.sea.group === waters[0],
    queue: c.staged ? c.staged.log.map((u) => ({ id: u.id, failed: u.failed })) : null, units: c.staged ? [...c.staged.units.keys()] : null,
    warmed: trace ? trace.filter((t) => t.root === 'water').length : null,
    errors: c.errors.map((e) => e.stage + ': ' + e.message),
  });
})()`;
const read = async (page) => JSON.parse(await page.eval(PROBE));

test('?lazy=1: the gate is open and the front is solid; the sea and the props join the staged queue, are warmed off the frame, and the sea is the only one', async () => {
  const page = await b.open('la-ladera/index.html?autostart&manual&lazy=1&warmtrace&skip=people,furnish');
  await page.eval('__ladera.settle({ timeout: 300000 }).then(() => true)', 320000);
  const r = await read(page);
  assert.deepEqual(r.beach, { live: true, sea: 'staged', props: 'staged' }, 'the boot leaves the sea and the props to the queue');
  assert.deepEqual(r.gate, ['open'], 'the plot\'s south gate is open');
  assert.ok(r.railsPlanned > 0 && r.rails === r.railsPlanned, `the deck's rail stands (${r.rails} of ${r.railsPlanned} runs)`);
  assert.ok(r.fixturesPlanned > 150 && r.fixtures === r.fixturesPlanned, `every collider of the front stands from the first frame (${r.fixtures} of ${r.fixturesPlanned} walls)`);
  assert.ok(r.units.includes('sea') && r.units.includes('beachprops'), `the sea and the props are units of the queue (${r.units})`);
  assert.deepEqual(r.queue.filter((u) => u.id === 'sea' || u.id === 'beachprops').sort((p, q) => p.id.localeCompare(q.id)), [{ id: 'beachprops', failed: false }, { id: 'sea', failed: false }], 'both finished, and neither failed');
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
  assert.deepEqual(r.errors, [], 'no error');
});

test('?lazy=1 with the furnishing on: the props\' files wait for the packs the interiors are waiting for, and the sea does not', async () => {
  const page = await b.open('la-ladera/index.html?autostart&manual&lazy=1&skip=people');
  await page.eval('__ladera.settle({ timeout: 600000 }).then(() => true)', 620000);
  const log = JSON.parse(await page.eval('JSON.stringify(__ladera.ctx.staged.log.map((u) => [u.id, u.start, u.end, u.failed]))'));
  const at = (id) => log.find((u) => u[0] === id);
  assert.ok(at('interior-packs') && at('beachprops') && at('sea'), `the queue holds the packs, the props and the sea (${log.map((u) => u[0])})`);
  assert.equal(at('beachprops')[3], false, 'the props did not fail');
  assert.ok(at('beachprops')[1] >= at('interior-packs')[2], `the props' files start (${at('beachprops')[1]} ms) after the packs have ended (${at('interior-packs')[2]} ms)`);
  assert.ok(at('sea')[1] < at('interior-packs')[2], `the sea does not wait for them: it started at ${at('sea')[1]} ms, the packs ended at ${at('interior-packs')[2]} ms`);
});

test('eager (?lazy=0): the boot builds the sea and the props itself, and there is no queue to wait for', async () => {
  const page = await b.open('la-ladera/index.html?autostart&manual&lazy=0&skip=people,furnish,warm');
  const r = await read(page);
  assert.deepEqual(r.beach, { live: true, sea: 'inline', props: 'inline' });
  assert.deepEqual(r.gate, ['open']);
  assert.ok(r.railsPlanned > 0 && r.rails === r.railsPlanned, 'the rail stands');
  assert.ok(r.fixturesPlanned > 150 && r.fixtures === r.fixturesPlanned, `the front's colliders stand (${r.fixtures} of ${r.fixturesPlanned})`);
  assert.equal(r.waters, 1, 'the sea is in the scene at the milestone');
  assert.equal(r.meshes, 3);
  assert.ok(r.shown && r.worldSea);
  assert.ok(r.props && r.props.shown && r.props.placed === r.props.planned && r.props.skipped === 0, 'every prop of the plan is in the scene at the milestone, shown');
  assert.equal(r.queue, null, 'no staged queue in an eager boot');
  assert.deepEqual(r.errors, [], 'no error');
});

test('?skip=coast: the beach is left as it was (a shut gate, no rail, no fixture, no sea, no props, the library never asked for), lazy or not', async () => {
  for (const q of ['lazy=1', 'lazy=0']) {
    const page = await b.open(`la-ladera/index.html?autostart&manual&${q}&skip=people,furnish,warm,coast`);
    await page.eval('__ladera.settle({ timeout: 300000 }).then(() => true)', 320000);
    const r = await read(page);
    assert.deepEqual(r.beach, { live: false, sea: 'none', props: 'none' }, q);
    assert.deepEqual(r.gate, ['shut'], `${q}: the plot's south wall stands`);
    assert.equal(r.rails, 0, `${q}: no rail`); assert.equal(r.fixtures, 0, `${q}: no fixture collider`);
    assert.equal(r.waters, 0, `${q}: no sea`);
    assert.equal(r.props, null, `${q}: no props`); assert.equal(r.library, 0, `${q}: the library was never asked for`);
    assert.ok(!r.units?.includes('sea') && !r.units?.includes('beachprops'), `${q}: neither unit`);
    assert.deepEqual(r.errors, [], `${q}: no error`);
  }
});
