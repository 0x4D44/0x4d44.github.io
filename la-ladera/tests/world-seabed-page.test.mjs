// THE SEABED IN THE BOOT (A5, js/world/beach.js lateSeabed + js/world/seabed.js): in the real page the seagrass and the coral patch are one more late unit of the beach (id `seabed`, after the sea, one atlas, one mesh,
// one draw call), built hidden, warmed off the frame (LateWarm) and shown once their one program is made. Four questions, six boots (each of the last two is put to a lazy and an eager one):
//   ?lazy=1            `seabed` is a unit of the staged queue, it starts once the sea has risen, ends without failing, is warmed through LateWarm, and is shown: exactly one `props.seabed` group of one mesh, the
//                      counters (ctx.world.seabed) say what it holds, it costs one draw call and its triangles, the atlas came down once and was baked (ten mip levels), and the console has no error
//   ?lazy=0 (eager)    the boot builds it itself (it is in the scene at the milestone, there is no queue)
//   ?skip=coast        no sea, so no unit, no group, no counters, and the atlas is never asked for
//   the atlas fails    the browser refuses the file (lazy and eager): the unit ends without failing, ctx.errors says why, nothing is drawn, the boot and the rest of the beach carry on
// Quiet box: the browser comes only from tests/chrome.mjs (headless, simulated pointer lock). ?manual: no animation loop. The pages skip the people and the furnishing (the seabed does not care).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-seabed-page.test.mjs
// Every assertion has a deliberately broken page selected by SDP_SABOTAGE=<id>|all (or several, comma apart), and must then FAIL:
//   dup      a second `props.seabed` group in the scene               twomesh   a second mesh in the group                           hidden    the group left hidden
//   console  a console error                                          nowarm    a boot that does not trace LateWarm                 coastoff  `?skip=coast` that does not skip it
//   okatlas  an atlas that does come, in the page that must fail to load it
// and, by hand, the unit's `needs: ['sea']` taken out of beach.js (the unit starts with the sea, not after it).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

// The harness gives a page 60 s to load (tests/chrome.mjs Page.goto: LADERA_LOAD_MS). On a box with every core busy a renderer is held for longer than that, and the wait fails whatever the test holds: this file once lost its
// fourth test to `timeout waiting for: document.readyState === "complete"` in a whole-set run (354 s against 140 to 170 s), and dev/FEATURE-LAZY.md section 10 counts six other page runs lost the same way.
// Six pages boot here, so each is given four minutes to load; a caller's own LADERA_LOAD_MS wins.
process.env.LADERA_LOAD_MS ||= '240000';

const SABS = new Set((process.env.SDP_SABOTAGE ?? '').split(',').filter(Boolean));
const on = (...ids) => SABS.has('all') || ids.some((id) => SABS.has(id));

let b;
before(async () => { b = await launch({ width: 960, height: 540 }); });
after(async () => { await b?.close(); });

const GROUP = `(() => { const c = __ladera.ctx; return c.scene.children.find((o) => o.name === 'props.seabed'); })()`;
/** What the page holds, read in the page (the public surface: __ladera.ctx). */
const PROBE = `(() => {
  const L = window.__ladera, c = L.ctx, groups = [];
  c.scene.traverse((o) => { if (o.name === 'props.seabed') groups.push(o); });
  const g = groups[0], meshes = []; if (g) g.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const m = meshes[0], mat = m?.material, trace = c.lateWarm?.trace ?? null, qlog = c.staged ? c.staged.log : null;
  return JSON.stringify({
    beach: c.world?.beach ? { live: c.world.beach.live, sea: c.world.beach.sea, seabed: c.world.beach.seabed } : null,
    groups: groups.length, children: g ? g.children.length : 0, meshes: meshes.length, shown: g ? g.visible : null, inScene: g ? g.parent === c.scene : null,
    tris: m ? m.geometry.index.count / 3 : null, material: mat ? { alphaTest: mat.alphaTest, transparent: mat.transparent, side: mat.side, map: !!mat.map, mips: mat.map?.mipmaps?.length ?? 0 } : null,
    world: c.world?.seabed ?? null, handle: c.seabed ? { grass: c.seabed.plan.stats.grass, reef: c.seabed.plan.stats.reef } : null,
    warmed: trace ? trace.filter((t) => t.root === 'props.seabed').length : null,
    queue: qlog ? qlog.map((u) => ({ id: u.id, failed: u.failed, start: u.start, end: u.end })) : null, units: c.staged ? [...c.staged.units.keys()] : null,
    waters: c.scene.children.filter((o) => o.name === 'water').length,
    errors: c.errors.map((e) => e.stage + ': ' + e.message),
  });
})()`;
/** The group's cost: one frame from the air over the meadow with it shown, and one with it hidden (calls and triangles the renderer counts, every pass of the frame). */
const COST = `(() => {
  const L = window.__ladera, c = L.ctx, g = ${GROUP};
  L.teleport(2.7, 150, { y: c.plan.heightAt(2.7, 150) + 25, yaw: Math.PI, pitch: -0.75 }); L.step(3); L.render();
  const read = () => { L.render(); const s = L.state(); return [s.drawCalls, s.triangles]; };
  const was = g.visible; g.visible = true; const shown = read(); g.visible = false; const hidden = read(); g.visible = was;
  return JSON.stringify({ shown, hidden, calls: shown[0] - hidden[0], tris: shown[1] - hidden[1] });
})()`;
const read = async (page) => JSON.parse(await page.eval(PROBE));
const asked = (page) => [...page.reqs.values()].filter((u) => /seagrass_coral\.png/.test(u)).length;
async function sabotage(page) {
  if (on('dup')) await page.eval(`(() => { const c = __ladera.ctx, g = ${GROUP}; if (g) c.scene.add(g.clone()); })()`);
  if (on('twomesh')) await page.eval(`(() => { const g = ${GROUP}; if (g) g.add(g.children[0].clone()); })()`);
  if (on('hidden')) await page.eval(`(() => { const g = ${GROUP}; if (g) g.visible = false; })()`);
  if (on('console')) await page.eval(`console.error('seabed sabotage: a console error')`);
}
/** What a page that has the seabed must show, lazy or eager. */
function assertSeabed(r, how) {
  assert.equal(r.groups, 1, `${how}: exactly one props.seabed group in the scene (${r.groups})`);
  assert.equal(r.children, 1, `${how}: of one child`); assert.equal(r.meshes, 1, `${how}: which is one mesh (${r.meshes})`);
  assert.equal(r.inScene, true, `${how}: a child of the scene`); assert.equal(r.shown, true, `${how}: shown`);
  const w = r.world;
  assert.ok(w && w.grass >= 250 && w.grass <= 380 && w.reef === 28 && w.calls === 1 && w.tris === (w.grass + w.reef) * 4 && w.tris <= 1800 && w.failed.length === 0, `${how}: ctx.world.seabed says what it holds (${JSON.stringify(w)})`);
  assert.deepEqual(r.handle, { grass: w.grass, reef: w.reef }, `${how}: and ctx.seabed is the plan of it`);
  assert.equal(r.tris, w.tris, `${how}: the mesh holds the triangles it says (${r.tris})`);
  assert.deepEqual(r.material, { alphaTest: 0.5, transparent: false, side: 2, map: true, mips: 10 }, `${how}: a cut-out of the opaque pass, double sided, with the atlas baked to ten mip levels`);
  assert.ok(r.errors.length === 0, `${how}: no error in ctx.errors (${r.errors})`);
}
function assertQuiet(page, how) {
  const s = page.summary();
  assert.deepEqual(s.errors, [], `${how}: no exception in the page`); assert.deepEqual(s.consoleErrors, [], `${how}: no console error`); assert.deepEqual(s.netErrors, [], `${how}: no request failed`);
}

test('?lazy=1: `seabed` is a unit of the queue, starts after the sea has risen, ends without failing, is warmed off the frame, and shows one group of one mesh that costs one draw call', async () => {
  const asks0 = asked(b.page);
  const page = await b.open(`la-ladera/index.html?autostart&manual&lazy=1${on('nowarm') ? '' : '&warmtrace'}&skip=people,furnish`);
  await page.eval('__ladera.settle({ timeout: 300000 }).then(() => true)', 320000);
  await sabotage(page);
  const r = await read(page);
  assert.deepEqual(r.beach, { live: true, sea: 'staged', seabed: 'staged' }, 'the boot leaves the seabed to the queue');
  assert.ok(r.units.includes('seabed'), `the seabed is a unit of the queue (${r.units})`);
  const q = (id) => r.queue.find((u) => u.id === id);
  assert.ok(q('seabed') && q('sea') && q('seabed').failed === false && q('sea').failed === false, `the sea and the seabed finished, and neither failed (${JSON.stringify(r.queue.filter((u) => ['sea', 'seabed'].includes(u.id)))})`);
  assert.ok(q('seabed').start >= q('sea').end, `the seabed starts (${q('seabed').start} ms) after the sea has risen (${q('sea').end} ms): the unit needs the sea, so no plant is ever seen without the water over it`);
  assert.equal(r.waters, 1, 'one sea');
  assertSeabed(r, 'lazy');
  assert.ok(r.warmed >= 1, `LateWarm made the seabed's program off the frame (${r.warmed} of its meshes were warmed)`);
  const cost = JSON.parse(await page.eval(COST));
  assert.equal(cost.calls, 1, `the seabed costs one draw call in a frame (${cost.shown[0]} calls with it, ${cost.hidden[0]} without)`);
  assert.equal(cost.tris, r.world.tris, `and its triangles (${cost.tris} of ${r.world.tris})`);
  assert.equal(asked(page) - asks0, 1, 'the atlas came down once');
  assertQuiet(page, 'lazy');
});

test('eager (?lazy=0): the boot builds the seabed itself, it is in the scene at the milestone, and there is no queue to wait for', async () => {
  const page = await b.open('la-ladera/index.html?autostart&manual&lazy=0&skip=people,furnish,warm');
  await sabotage(page);
  const r = await read(page);
  assert.deepEqual(r.beach, { live: true, sea: 'inline', seabed: 'inline' });
  assert.equal(r.waters, 1, 'the sea is in the scene at the milestone');
  assertSeabed(r, 'eager');
  assert.equal(r.queue, null, 'no staged queue in an eager boot');
  const cost = JSON.parse(await page.eval(COST));
  assert.equal(cost.calls, 1, `the seabed costs one draw call in a frame (${cost.shown[0]} calls with it, ${cost.hidden[0]} without)`);
  assert.equal(cost.tris, r.world.tris, `and its triangles (${cost.tris} of ${r.world.tris})`);
  await page.eval('__ladera.settle({ timeout: 300000 }).then(() => true)', 320000);     // (the page finishes what it has begun before the next boot navigates away: a late message of this page is never counted as the next one's)
  assertQuiet(page, 'eager');
});

test('?skip=coast: no sea, so no unit, no group, no counters, no error, and the atlas is never asked for, lazy or not', async () => {
  for (const q of ['lazy=1', 'lazy=0']) {
    const asks0 = asked(b.page);
    const page = await b.open(`la-ladera/index.html?autostart&manual&${q}&skip=people,furnish,warm${on('coastoff') ? '' : ',coast'}`);
    await page.eval('__ladera.settle({ timeout: 300000 }).then(() => true)', 320000);
    await sabotage(page);
    const r = await read(page);
    assert.deepEqual(r.beach, { live: false, sea: 'none', seabed: 'none' }, `${q}: the beach is not live, and the seabed is not built`);
    assert.equal(r.groups, 0, `${q}: no props.seabed group`); assert.equal(r.world, null, `${q}: no counters`); assert.equal(r.waters, 0, `${q}: no sea`);
    assert.ok(!r.units?.includes('seabed'), `${q}: no unit`);
    assert.deepEqual(r.errors, [], `${q}: no error`);
    assert.equal(asked(page) - asks0, 0, `${q}: the atlas was never asked for`);
    assertQuiet(page, q);
  }
});

test('the atlas does not come (the browser refuses the file): the unit ends without failing, ctx.errors says why, nothing is drawn, the counters say so, and the boot and the sea carry on', async () => {
  for (const q of ['lazy=1', 'lazy=0']) {
    const orig = b.page.b.listeners.get(b.page.sid);
    b.page.b.listeners.set(b.page.sid, (m) => { if (m.method === 'Fetch.requestPaused') { b.page.send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'Failed' }).catch(() => {}); return; } orig(m); });
    if (!on('okatlas')) await b.page.send('Fetch.enable', { patterns: [{ urlPattern: '*seagrass_coral.png*', requestStage: 'Request' }] });
    try {
      const page = await b.open(`la-ladera/index.html?autostart&manual&${q}&skip=people,furnish,warm`);
      await page.eval('__ladera.settle({ timeout: 300000 }).then(() => true)', 320000);
      const r = await read(page);
      assert.equal(r.groups, 0, `${q}: nothing is drawn`);
      assert.deepEqual(r.errors, ['seabed: seabed: cannot load seagrass_coral.png'], `${q}: ctx.errors says why`);
      assert.ok(r.world && r.world.calls === 0 && r.world.tris === 0 && r.world.grass === 0 && r.world.reef === 0 && r.world.failed.length === 1, `${q}: the counters say nothing was drawn (${JSON.stringify(r.world)})`);
      assert.equal(r.handle, null, `${q}: and there is no handle`);
      assert.equal(r.waters, 1, `${q}: the sea is up`);
      if (q === 'lazy=1') assert.ok(r.queue.find((u) => u.id === 'seabed')?.failed === false && r.queue.find((u) => u.id === 'sea')?.failed === false, `${q}: the unit ended without failing (${JSON.stringify(r.queue.filter((u) => u.id === 'seabed'))})`);
      const s = page.summary();
      assert.deepEqual(s.errors, [], `${q}: no exception in the page`);
      assert.ok(s.netErrors.every((e) => /seagrass_coral/.test(e)) && s.netErrors.length >= 1, `${q}: the only request that failed is the atlas's (${s.netErrors})`);
      assert.ok(s.consoleErrors.every((e) => /seagrass_coral|ERR_FAILED/.test(e)), `${q}: the only console error is the browser's own about it (${s.consoleErrors})`);
    } finally { await b.page.send('Fetch.disable').catch(() => {}); b.page.b.listeners.set(b.page.sid, orig); }
  }
});
