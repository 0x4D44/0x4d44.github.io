// THE BEACH IN THE BOOT (A5, js/world/beach.js, dev/FEATURE-BEACH.md section 6): in the real page the ground of the coast is part of the world, and the SEA is the second sector, the one that
// loads after the playable milestone so it does not add to the boot. Three boots, each with its own question:
//   ?lazy=1            the gate is open and the rail stands; the sea is NOT built by the boot: it is one unit of the staged queue (id `sea`), it finishes, it is warmed through LateWarm (its three
//                      programs are made off the frame, not inside one) and it is the only sea in the scene
//   ?lazy=0 (eager)    the sea is built by the boot itself (it is in the scene at the milestone, there is no queue)
//   ?skip=coast        the beach is left as it was: the gate is shut, there is no rail and no sea
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
  return JSON.stringify({
    beach: c.world?.beach ? { live: c.world.beach.live, sea: c.world.beach.sea } : null,
    gate: walls.filter((w) => w.id === 'coast.gate').map((w) => w.on === false ? 'open' : 'shut'),
    rails: walls.filter((w) => w.id === 'coast.rail').length, railsPlanned: c.plan.coast.rails.length,
    waters: waters.length, shown: waters.length > 0 && waters.every((o) => o.visible), meshes: waters.reduce((n, g) => { g.traverse((o) => { if (o.isMesh) n++; }); return n; }, 0),
    worldSea: !!c.world?.sea && c.world.sea.group === waters[0],
    queue: c.staged ? c.staged.log.map((u) => ({ id: u.id, failed: u.failed })) : null, units: c.staged ? [...c.staged.units.keys()] : null,
    warmed: trace ? trace.filter((t) => t.root === 'water').length : null,
    errors: c.errors.map((e) => e.stage + ': ' + e.message),
  });
})()`;
const read = async (page) => JSON.parse(await page.eval(PROBE));

test('?lazy=1: the gate is open and the rail stands; the sea joins the staged queue, is warmed off the frame, and is the only one', async () => {
  const page = await b.open('la-ladera/index.html?autostart&manual&lazy=1&warmtrace&skip=people,furnish');
  await page.eval('__ladera.settle({ timeout: 300000 }).then(() => true)', 320000);
  const r = await read(page);
  assert.deepEqual(r.beach, { live: true, sea: 'staged' }, 'the boot leaves the sea to the queue');
  assert.deepEqual(r.gate, ['open'], 'the plot\'s south gate is open');
  assert.ok(r.railsPlanned > 0 && r.rails === r.railsPlanned, `the deck's rail stands (${r.rails} of ${r.railsPlanned} runs)`);
  assert.ok(r.units.includes('sea'), `the sea is a unit of the queue (${r.units})`);
  assert.deepEqual(r.queue.filter((u) => u.id === 'sea'), [{ id: 'sea', failed: false }], 'the unit finished, and did not fail');
  assert.equal(r.waters, 1, 'one sea in the scene');
  assert.equal(r.meshes, 3, 'near, mid and far mesh');
  assert.ok(r.shown && r.worldSea, 'the sea is shown and ctx.world.sea is it');
  assert.ok(r.warmed >= 3, `LateWarm made the sea's programs off the frame (${r.warmed} of its meshes were warmed)`);
  assert.deepEqual(r.errors, [], 'no error');
});

test('eager (?lazy=0): the boot builds the sea itself, and there is no queue to wait for', async () => {
  const page = await b.open('la-ladera/index.html?autostart&manual&lazy=0&skip=people,furnish,warm');
  const r = await read(page);
  assert.deepEqual(r.beach, { live: true, sea: 'inline' });
  assert.deepEqual(r.gate, ['open']);
  assert.ok(r.railsPlanned > 0 && r.rails === r.railsPlanned, 'the rail stands');
  assert.equal(r.waters, 1, 'the sea is in the scene at the milestone');
  assert.equal(r.meshes, 3);
  assert.ok(r.shown && r.worldSea);
  assert.equal(r.queue, null, 'no staged queue in an eager boot');
  assert.deepEqual(r.errors, [], 'no error');
});

test('?skip=coast: the beach is left as it was (a shut gate, no rail, no sea), lazy or not', async () => {
  for (const q of ['lazy=1', 'lazy=0']) {
    const page = await b.open(`la-ladera/index.html?autostart&manual&${q}&skip=people,furnish,warm,coast`);
    await page.eval('__ladera.settle({ timeout: 300000 }).then(() => true)', 320000);
    const r = await read(page);
    assert.deepEqual(r.beach, { live: false, sea: 'none' }, q);
    assert.deepEqual(r.gate, ['shut'], `${q}: the plot's south wall stands`);
    assert.equal(r.rails, 0, `${q}: no rail`);
    assert.equal(r.waters, 0, `${q}: no sea`);
    assert.ok(!r.units?.includes('sea'), `${q}: no sea unit`);
    assert.deepEqual(r.errors, [], `${q}: no error`);
  }
});
