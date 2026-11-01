// INTERIORS (A3) in the REAL page: nothing here calls activate() or open() by hand. The player walks into a real building, the 4 Hz scan wakes its containers,
// the crosshair finds a wardrobe front, E opens it, E on a paper opens the reader, Esc closes only the reader, E on a special find marks it, the journal counts it,
// walking away closes everything. (The node tests reach the slots through activate(); a world-versus-building-coordinates slip in the scan hid there for a while.)
// Quiet box: the browser comes only from tests/chrome.mjs (headless, simulated pointer lock, speech recorded).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-page.test.mjs
//   A3_TRIES=24 buildings tried when looking for a slot with a given content
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';
import { INSPECT, BINDINGS } from '../js/interiors/inspect_data.js';
import { GOODS_CATALOG } from '../js/interiors/goods-catalog.js';
import { FINDS } from '../js/interiors/finds.js';
import { GLINT } from '../js/interiors/glint.js';

const TRIES = +(process.env.A3_TRIES || 24);
let b, page;
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/** Runs IN the page once: the little kit every test below uses (all of it through the public surface: __ladera, ctx.containers, ctx.interact). */
function installKit() {
  const L = window.__ladera, c = L.ctx, A3 = window.__a3 = {};
  const C = () => c.containers;
  A3.look = () => { c.interact.update(c.camera.position, c.camera.getWorldDirection(new c.THREE.Vector3())); return c.interact.target; };
  /** Stand where a person could (0.55 to 1.3 m in front of the slot), look at `at` (default: the middle of the slot's front) and step two frames: the spot when the crosshair is on `want`. */
  A3.aim = async (sid, want, at) => {
    const { frontSpots } = await import('/la-ladera/js/interiors/containers.js');
    const S = C().slots.get(sid), room = S.bp.rooms.find((r) => r.id === S.rec.room), p = at ?? S.pos, r = S.slot.rect, cx = (r.x0 + r.x1) / 2;
    let spots = frontSpots(S);
    if (!spots.length) spots = [1.0, 0.85, 1.15, 0.7].flatMap((d) => [0, -0.25, 0.25].map((s) => S.loc.bl(cx + s, S.slot.zf + d)));       // no layout to ask: try the same ring by hand
    for (const [bx, bz] of spots) {
      const [x, y, z] = S.bp.frame.toWorld(bx, room?.y ?? 0, bz);
      L.teleport(x, z, { y }); L.lookAt(p[0], p[1], p[2]); L.step(2);
      const t = A3.look();
      if (t && t.id === (want ?? 'cont:' + sid)) return [x, y, z];
    }
    return null;
  };
  /** The first building (id order, at most `limit`) with a reachable slot that passes `pred` and that the crosshair can be put on: { bid, sid, spot } or null. */
  A3.find = async (pred, skip = [], limit = 24) => {
    let n = 0;
    for (const bp of c.buildings.values()) {
      if (skip.includes(bp.id) || !C().pending.has(bp.id)) continue;
      if (n++ >= limit) break;
      L.enter(bp.id); L.step(70);
      for (const S of C().byBuilding.get(bp.id) ?? []) {
        if (!S.reachable || !pred(S)) continue;
        const spot = await A3.aim(S.id);
        if (spot) return { bid: bp.id, sid: S.id, spot };
      }
    }
    return null;
  };
  A3.key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  A3.prompt = () => document.getElementById('prompt')?.innerText ?? '';
  A3.slotInfo = (sid) => { const S = C().slots.get(sid); return S ? { state: S.state, objs: S.objs?.length ?? 0, kind: S.slot.kind, name: S.rec.name, bid: S.bid, plan: S.plan, group: [...(c.interact.groups.get('cont:' + sid) ?? [])].length } : null; };
  return true;
}
const kit = (expr) => page.eval(`(async () => JSON.stringify(await (async () => { ${expr} })()))()`).then(JSON.parse);
const state = () => kit(`const s = __ladera.state(); return { mode: __ladera.ctx.mode, building: s.building, indoors: s.indoors, target: s.target, drawCalls: s.drawCalls, triangles: s.triangles, errors: s.errors, reader: s.reader };`);

before(async () => {
  b = await launch({ width: 960, height: 540 });
  page = await b.open('la-ladera/index.html?autostart&manual');
  await page.eval('__ladera.setHour(10)');
  await page.fn(installKit);
});
after(async () => { await b?.close(); });

test('the scan wakes the containers of the building the player stands in, with nobody calling activate(), and drops them when the player is far away', async () => {
  const r = await kit(`
    const L = __ladera, c = L.ctx, C = c.containers, ids = [...C.pending.keys()];
    const before = { slots: C.slots.size, active: [...C.pending.values()].filter((e) => e.active).length, activations: C.activations };
    const bid = ids[0]; L.enter(bid); L.step(70);
    const here = { building: c.player.building, mine: C.byBuilding.get(bid)?.length ?? 0, slots: C.slots.size, activeNow: [...C.pending.values()].filter((e) => e.active).map((e) => e.bp.id) };
    // the farthest building with containers from this one whose containers are within the wake distance of where the player arrives: the chapel's only cabinets (the sacristy desk and
    // filing cabinet) stand 10.3 m behind its door, so they wake as the player walks up the nave, not at the door (ACTIVATE 10 m); a building like that is skipped, not tested
    const p = c.player.s, cands = [...C.pending.values()].map((e) => ({ id: e.bp.id, d: Math.hypot(e.cx - p.x, e.cz - p.z) })).sort((a, b) => b.d - a.d);
    let far = null; const skipped = [];
    for (const cd of cands) {
      L.enter(cd.id); L.step(70);
      const e = C.pending.get(cd.id), q = c.player.s;
      if (Math.hypot(q.x - e.cx, q.z - e.cz) - e.r < 9) { far = cd; break; }
      skipped.push(cd.id);
    }
    const there = { building: c.player.building, mineGone: !C.byBuilding.has(bid), farMine: C.byBuilding.get(far.id)?.length ?? 0, groups: [...c.interact.groups.keys()].filter((k) => k.startsWith('cont:')).length,
      awake: [...C.pending.values()].filter((e) => e.active).length };
    return { pending: ids.length, before, bid, here, far, skipped, there, mode: c.mode };`);
  assert.ok(r.skipped.length <= 2, `${r.skipped.length} far buildings skipped (${r.skipped}): the wake distance and the plans have drifted apart`);
  assert.equal(r.mode, 'play');
  assert.ok(r.pending >= 80, `${r.pending} buildings with containers`);
  assert.deepEqual([r.before.slots, r.before.active, r.before.activations], [0, 0, 0], 'something was activated before the player went anywhere');
  assert.equal(r.here.building, r.bid, 'the player is not in the building');
  assert.ok(r.here.mine > 0, `building ${r.bid}: ${r.here.mine} slots after 70 frames inside it (the scan never woke it)`);
  assert.ok(r.here.activeNow.length < r.pending / 3, `${r.here.activeNow.length} of ${r.pending} buildings are awake: the circle is not where the building is`);
  assert.ok(r.far.d > 60, `the far building is only ${r.far.d.toFixed(0)} m away`);
  assert.equal(r.there.building, r.far.id);
  assert.ok(r.there.farMine > 0, `the far building ${r.far.id} did not wake`);
  assert.equal(r.there.mineGone, true, `${r.bid} stays awake 60+ m behind the player`);
  assert.equal(r.there.groups, r.there.awake, `${r.there.groups} container target groups in the kernel for ${r.there.awake} awake buildings (one each)`);   // a neighbour inside the 16 m hold is awake too
  assert.ok(r.there.awake >= 1 && r.there.awake <= 3, `${r.there.awake} buildings awake around ${r.far.id}`);
});

test('a wardrobe: the crosshair finds its front, the prompt offers to open it, E swings the doors, the things inside are targets, E opens nothing twice', async () => {
  const f = await kit(`return await __a3.find((S) => /^wardrobe/.test(S.rec.name), [], ${TRIES});`);
  assert.ok(f, `no wardrobe in ${TRIES} buildings could be aimed at`);
  const L = (e) => kit(`const L = __ladera, c = L.ctx, C = c.containers, S = C.slots.get(${JSON.stringify(f.sid)}); ${e}`);
  const closed = await L(`L.render(); const s = L.state(); return { st: __a3.slotInfo(S.id), prompt: __a3.prompt(), target: c.interact.target?.id, dc: s.drawCalls, tris: s.triangles };`);
  assert.equal(closed.target, 'cont:' + f.sid);
  assert.equal(closed.st.state, 'closed');
  assert.match(closed.prompt, /Abrir/, `the prompt under the crosshair says ${JSON.stringify(closed.prompt)}`);
  await page.key('KeyE');
  const open = await L(`L.step(40); L.render(); const s = L.state(); const gh = S.leaves.map((lf) => lf.ghost?.group), ev = [];
    return { st: __a3.slotInfo(S.id), dc: s.drawCalls, tris: s.triangles, ghostVisible: gh.every((g) => g && g.visible), ghostMeshes: gh.reduce((n, g) => n + g.children.filter((m) => m.isMesh).length, 0),
      contentMeshes: S.contentGroup ? S.contentGroup.children.filter((m) => m.isMesh).length : -1, prompt: __a3.prompt(),
      contentKeys: S.contentGroup ? S.contentGroup.children.filter((m) => m.isMesh).map((m) => m.userData.matKey) : [], models: [...new Set(S.objs.filter((o) => o.model).map((o) => o.model.key))] };`);
  assert.equal(open.st.state, 'open', 'E did not open the wardrobe');
  assert.ok(open.st.objs >= 3, `${open.st.objs} things inside a wardrobe`);
  assert.equal(open.st.group, open.st.objs, 'one kernel target per thing inside');
  assert.ok(open.ghostVisible && open.ghostMeshes >= 1, 'no moving door in the scene');
  // The stand-ins fold into at most 3 meshes, as ever. A close-inspection model (inspect.js) brings the materials of its own (a watch is gold, glass and paper), and an open
  // drawer pays for those and nothing else: at most the draw calls the manifest records for each distinct model inside, one mesh per material, only while it is open.
  const own = open.contentKeys.filter((k) => /^inspect_/.test(k)), bound = open.models.reduce((n, k) => n + INSPECT[k].calls, 0);
  assert.ok(open.contentMeshes >= 1 && open.contentMeshes - own.length <= 3, `${open.contentMeshes - own.length} meshes for the stand-ins (budget: 3): ${open.contentKeys}`);
  assert.ok(own.length <= bound, `${own.length} model meshes inside, the models inside (${open.models}) record ${bound} draw calls`);
  assert.ok(open.dc - closed.dc <= 6 + own.length, `opening cost ${open.dc - closed.dc} draw calls (${closed.dc} -> ${open.dc}, ${own.length} of them models)`);
  console.log(`# wardrobe ${f.sid} in ${f.bid}: ${open.st.objs} things, draw calls ${closed.dc} -> ${open.dc} (ghost ${open.ghostMeshes} meshes, contents ${open.contentMeshes}), triangles ${closed.tris} -> ${open.tris}`);
  // aim at the things inside, one after the other, and examine the first PLAIN one that can be reached: a bilingual line (a find or a paper has a test of its own, and E on one is counted:
  // the new bedroom of L02 holds the medalla_campeon first of all, and marking it here made the find test below see two)
  const ex = await L(`const found = [];
    for (let k = 0; k < S.targets.length && !found.length; k++) { if (S.objs[k]?.find || S.objs[k]?.paper) continue; const t = S.targets[k], spot = await __a3.aim(S.id, 'cont:' + S.id + ':' + k, [t.x, t.y, t.z]); if (spot) found.push(k); }
    if (!found.length) return { aimed: false, targets: S.targets.length };
    const p = __a3.prompt(); __a3.key('KeyE'); L.step(2);
    const sub = document.getElementById('subtitle'); return { aimed: true, k: found[0], prompt: p, subtitle: sub?.innerText ?? '', on: sub?.classList.contains('on') };`);
  assert.equal(ex.aimed, true, `none of the ${ex.targets} things inside could be put under the crosshair`);
  assert.match(ex.prompt, /Examinar|Leer|Ver/, `the prompt on a thing inside says ${JSON.stringify(ex.prompt)}`);
  assert.ok(ex.on && ex.subtitle.length > 8, 'E on a thing inside says nothing');
  await L(`c.containers.close(S.id, true); L.step(2); return 1;`);
});

test('a diary: E opens the sheet, the world waits, Esc closes ONLY the reader (the cupboard stays open), reading it is counted', async () => {
  const f = await kit(`return await __a3.find((S) => S.plan?.paper, [], ${TRIES});`);
  assert.ok(f, `no slot with a paper in ${TRIES} buildings could be aimed at`);
  const L = (e) => kit(`const L = __ladera, c = L.ctx, C = c.containers, S = C.slots.get(${JSON.stringify(f.sid)}); ${e}`);
  await page.key('KeyE');
  const k = await L(`L.step(40); const k = S.objs.findIndex((o) => o.paper); if (k < 0) return { k }; const t = S.targets[k], spot = await __a3.aim(S.id, 'cont:' + S.id + ':' + k, [t.x, t.y, t.z]); return { k, spot, prompt: __a3.prompt(), paper: S.objs[k].paper.id ?? S.objs[k].paper, state: S.state };`);
  assert.equal(k.state, 'open');
  assert.ok(k.k >= 0 && k.spot, `the paper (${k.paper}) is inside but not under the crosshair from any spot`);
  assert.match(k.prompt, /(^|\n)(Leer|Ver) /, `the prompt on the paper says ${JSON.stringify(k.prompt)}`);
  const ev = await L(`window.__a3.ev = []; for (const n of ['paper:read', 'reader:open', 'reader:close']) c.events.on(n, (p) => window.__a3.ev.push(n)); return 1;`);
  await page.key('KeyE'); await tick(80);
  const rd = await kit(`const c = __ladera.ctx, q = (s) => document.querySelector(s); return { mode: c.mode, running: c.running, open: c.reader.isOpen, title: document.getElementById('paneltitle')?.textContent, es: q('#panel .rd-text.es')?.innerText ?? '', en: q('#panel .rd-text.en')?.innerText ?? '', papers: c.collection.counts().papers, ev: window.__a3.ev };`);
  assert.equal(rd.open, true, 'E on the paper opened no reader');
  assert.deepEqual([rd.mode, rd.running], ['panel', false], 'the world should wait behind the sheet');
  assert.ok(rd.title && rd.es.length > 20 && rd.en.length > 20, `the sheet is empty: ${JSON.stringify({ t: rd.title, es: rd.es.slice(0, 30), en: rd.en.slice(0, 30) })}`);
  assert.equal(rd.papers, 1, 'reading it was not counted');
  assert.ok(rd.ev.includes('paper:read') && rd.ev.includes('reader:open'), `events ${rd.ev}`);
  await page.key('Escape'); await tick(80);
  const after = await kit(`const c = __ladera.ctx, S = c.containers.slots.get(${JSON.stringify(f.sid)}); return { mode: c.mode, open: c.reader.isOpen, state: S.state, pauseShown: !document.getElementById('pause').classList.contains('hidden') };`);
  assert.deepEqual([after.open, after.mode, after.pauseShown], [false, 'play', false], 'Esc should close only the sheet and give the game back');
  assert.equal(after.state, 'open', 'closing the reader closed the cupboard too');
  console.log(`# paper ${k.paper} in ${f.sid}: "${rd.title}" -> ${rd.es.slice(0, 60).replace(/\n/g, ' ')}...`);
});

test('a special find: E marks it (toast, discovery, shelf counter kept current BEFORE the mark), the journal shows Hallazgos n de m and the four shelves', async () => {
  const f = await kit(`return await __a3.find((S) => S.plan?.find, [], ${TRIES});`);
  assert.ok(f, `no slot with a find in ${TRIES} buildings could be aimed at`);
  const L = (e) => kit(`const L = __ladera, c = L.ctx, C = c.containers, S = C.slots.get(${JSON.stringify(f.sid)}); ${e}`);
  await L(`window.__a3.mark = null; c.events.on('discover', (d) => { if (d.kind === 'hallazgo' && !window.__a3.mark) window.__a3.mark = { id: d.id, kind: d.kind, name: d.name, building: d.building, collection: d.collection, counts: JSON.parse(JSON.stringify(c.collection.counts())) }; }); return 1;`);
  await page.key('KeyE');
  const k = await L(`L.step(40); const k = S.objs.findIndex((o) => o.find); if (k < 0) return { k }; const t = S.targets[k], spot = await __a3.aim(S.id, 'cont:' + S.id + ':' + k, [t.x, t.y, t.z]); return { k, spot, prompt: __a3.prompt(), find: S.objs[k].find, state: S.state };`);
  assert.equal(k.state, 'open');
  assert.ok(k.k >= 0 && k.spot, `the find (${k.find}) is inside but not under the crosshair from any spot`);
  const before = await kit(`const c = __ladera.ctx; return { found: c.discover.count, total: c.discover.total, discFinds: c.discover.finds, finds: JSON.parse(JSON.stringify(c.collection.counts())) };`);
  await page.key('KeyE'); await tick(60);
  const r = await kit(`const L = __ladera, c = L.ctx, t = document.getElementById('toast'), counts = c.collection.counts(), m = window.__a3.mark; L.step(3);
    return { mark: m, prompt: __a3.prompt(), lot: m ? c.buildings.get(m.building)?.lot?.name ?? null : null, counts: JSON.parse(JSON.stringify(counts)), found: c.discover.count, total: c.discover.total, toast: t?.innerText ?? '', toastOn: t?.classList.contains('on'), hasFound: m ? c.discover.found.has(m.id) : false, finds: L.state().finds };`);
  assert.ok(r.mark, 'E on the find marked no discovery');
  assert.equal(r.mark.kind, 'hallazgo');
  const word = (p) => String(p).replace(/^E(\s+|(?=[A-Z]))/, '');                                           // the HUD shows the key, a line break, then the prompt (no line break once E has held the find up: the HUD is hidden then)
  assert.equal(word(k.prompt), 'Examinar', 'before it is picked up the prompt does not give the find away');
  assert.ok(word(r.prompt).startsWith('Examinar · ') && word(r.prompt).length > 14, `once found, the prompt gives its name: ${JSON.stringify(r.prompt)}`);
  assert.ok(r.lot && r.mark.name.endsWith(` · ${r.lot}`), `the title of the find says where it was found: ${JSON.stringify(r.mark.name)} (lot ${JSON.stringify(r.lot)})`);       // eight houses hold a morrocota
  assert.equal(r.found, before.found, `the world's "N de M" moved (${before.found} -> ${r.found} of ${r.total}): a find is counted by ctx.discover.finds, not by it`);
  assert.equal(r.finds, before.discFinds + 1, 'ctx.discover.finds did not move');
  assert.ok(r.hasFound, 'the discovery is not in ctx.discover.found');
  assert.equal(r.counts.finds, before.finds.finds + 1);
  const shelf = Object.entries(r.mark.counts.byCollection).find(([, n]) => n > 0);
  assert.ok(shelf, `byCollection was still all zero when the discovery was marked: ${JSON.stringify(r.mark.counts.byCollection)}`);
  assert.equal(r.mark.counts.finds, r.counts.finds, 'the collection was updated after the mark, not before');
  assert.ok(r.toastOn && /hallazgo/i.test(r.toast), `toast ${JSON.stringify(r.toast)}`);                  // the tag is set in capitals by the stylesheet
  // the journal: 'Papeles y hallazgos'
  const j = await kit(`const c = __ladera.ctx; c.flow.openPanel('journal'); const tab = document.querySelector('#panel .jtab[data-tab=papers]'); tab?.click();
    const q = [...document.querySelectorAll('#panel .jhead strong')].map((e) => e.textContent), shelves = [...document.querySelectorAll('#panel .jshelf')].map((e) => ({ shelf: e.querySelector('b')?.textContent, n: e.querySelector('span')?.textContent }));
    const out = { head: q, shelves, finds: [...document.querySelectorAll('#panel .jitem.find b')].map((e) => e.textContent) }; c.flow.closePanel(); return out;`);
  assert.match(j.head[1] ?? '', /^Hallazgos 1 de \d+$/, `journal head ${JSON.stringify(j.head)}`);
  assert.deepEqual(j.shelves.map((s) => s.shelf), ['Monedas de oro', 'Relojes', 'Joyas', 'Rarezas']);
  assert.equal(j.shelves.filter((s) => !s.n.startsWith('0 de')).length, 1, `exactly one shelf moved: ${JSON.stringify(j.shelves)}`);
  assert.equal(j.finds.length, 1);
  console.log(`# find ${k.find} in ${f.sid}: toast ${JSON.stringify(r.toast.replace(/\n/g, ' | '))}; journal ${j.head.join(' / ')}; shelves ${j.shelves.map((s) => s.shelf + ' ' + s.n).join(', ')}`);
});

test('walking out of the DOOR closes everything that was open (the building stays awake a few metres away), going far puts it to sleep, no target is left behind; no console or game error', async () => {
  const r = await kit(`const L = __ladera, c = L.ctx, C = c.containers, open = C.openSlots().map((s) => s.id), bid = C.openSlots()[0]?.bid ?? c.player.building, there = C.pending.get(bid), bp = c.buildings.get(bid), e = bp.entrances?.[0];
    const groups = () => [...c.interact.groups.keys()].filter((k) => k.startsWith('cont:' + bid + '.'));
    const inside = { building: c.player.building, openNow: C.openSlots().length, groups: groups().length };
    if (e) {                                                                                           // a teleport is quiet (no enter / exit events): open the door and WALK out, so the engine itself says player:exit
      c.physics.setDoor(e.doorId, true);
      L.teleport(e.inside[0], e.inside[2], { y: e.inside[1], yaw: (e.yawIn ?? 0) + Math.PI }); L.step(2);
      L.walk(1, 0, 2.5);
    }
    const door = { building: c.player.building, openNow: C.openSlots().length, awake: C.byBuilding.has(bid), groups: groups().length, hasDoor: !!e };
    const away = [...C.pending.values()].filter((x) => Math.hypot(x.cx - there.cx, x.cz - there.cz) > 60).map((x) => x.bp.id)[0];
    L.enter(away); L.step(30);
    return { open, bid, away, inside, door, openNow: C.openSlots().length, objectGroups: groups(), still: C.byBuilding.has(bid), where: L.state().building, errors: L.errors().map((x) => x.message ?? String(x)) };`);
  assert.ok(r.open.length >= 1, 'nothing was left open by the earlier tests (the test is vacuous)');
  assert.equal(r.inside.building, r.bid, 'the player is not inside the building with the open cupboard');
  assert.ok(r.inside.openNow >= 1 && r.inside.groups >= 1, `${JSON.stringify(r.inside)}: nothing open / registered before leaving`);
  assert.ok(r.door.hasDoor, `${r.bid} has no entrance to walk out of`);
  assert.notEqual(r.door.building, r.bid, 'the teleport to the door left the player inside');
  assert.equal(r.door.openNow, 0, `${r.door.openNow} containers stay open at the door of ${r.bid} (player:exit closes them, not only the distance)`);
  assert.equal(r.door.groups, 0, 'the things inside stay registered at the door');
  assert.equal(r.where, r.away);
  assert.equal(r.openNow, 0, `${r.openNow} containers still open after walking out of ${r.bid}`);
  assert.equal(r.still, false, `${r.bid} stays awake 60+ m behind the player`);
  assert.deepEqual(r.objectGroups, [], 'the things inside stay registered');
  assert.deepEqual(r.errors, [], 'the game logged errors');
  const sum = page.summary();
  assert.deepEqual([sum.errors, sum.netErrors, sum.consoleErrors], [[], [], []]);
});

test('a stocked shop: the goods library and its label atlas are loaded, every shop is stocked and drawn as LODs with the atlas decoded, and the counter of a stocked shop still takes the crosshair and E', async () => {
  const keys = Object.keys(GOODS_CATALOG).length;
  const pre = await kit(`
    const c = __ladera.ctx, g = c.goodsAssets, shops = [...c.buildings.values()].filter((bp) => bp.goods?.length);
    const lods = []; c.scene.traverse((o) => { if (o.isLOD && o.userData.goods) lods.push(o); });
    const labelled = []; for (const lod of lods) for (const lv of lod.levels) lv.object.traverse((m) => { if (m.isMesh && m.material?.map) { const i = m.material.map.image; labelled.push(i?.naturalWidth ?? i?.width ?? 0); } });
    return { atlas: g?.atlasReady, keys: g?.keys?.length, missing: g?.missing?.length, shops: shops.length, goods: shops.reduce((n, bp) => n + bp.goods.length, 0), lods: lods.length,
      rooms: shops.reduce((n, bp) => n + new Set(bp.goods.map((x) => x.room)).size, 0), drawn: shops.reduce((n, bp) => n + (bp.interior.stats?.goods?.drawn ?? 0), 0), labelled: labelled.length, undecoded: labelled.filter((w) => !(w > 0)).length };`);
  assert.deepEqual([pre.atlas, pre.keys, pre.missing], [true, keys, 0], `the goods library did not load in the page: ${JSON.stringify(pre)}`);
  assert.ok(pre.shops >= 20 && pre.goods >= 1000, `${pre.shops} stocked shops, ${pre.goods} articles`);
  assert.equal(pre.drawn, pre.goods, 'a planned article is not drawn');
  assert.equal(pre.lods, pre.rooms, 'one LOD per stocked room');
  assert.ok(pre.labelled > 0 && pre.undecoded === 0, `${pre.labelled} label meshes, ${pre.undecoded} without a decoded atlas`);
  // The counter of a stocked shop, from the customer's side: the crosshair finds it (its cash drawer, or the counter itself: "Mirar el mostrador" has the higher priority from most spots), the
  // stock on and in it takes no target of its own and hides none, E answers, and the LOD levels follow the distance.
  const f = await kit(`
    const L = __ladera, c = L.ctx, C = c.containers, { frontSpots } = await import('/la-ladera/js/interiors/containers.js');
    for (const bp of c.buildings.values()) {
      if (!bp.goods?.length || !C.pending.has(bp.id)) continue;
      L.enter(bp.id); L.step(70);
      for (const S of C.byBuilding.get(bp.id) ?? []) {
        if (!/^(shop_counter|pharmacy_counter|cafe_counter)/.test(S.rec.name) || !S.reachable) continue;
        const room = S.bp.rooms.find((r) => r.id === S.rec.room), p = S.pos;
        for (const [bx, bz] of frontSpots(S)) {
          const [x, y, z] = S.bp.frame.toWorld(bx, room?.y ?? 0, bz);
          L.teleport(x, z, { y }); L.lookAt(p[0], p[1], p[2]); L.step(2);
          const t = __a3.look();
          if (t && (t.id === 'cont:' + S.id || t.id === 'int:' + S.rec.id)) return { bid: bp.id, sid: S.id, target: t.id };
        }
      }
    }
    return null;`);
  assert.ok(f, 'no counter of a stocked shop could be put under the crosshair');
  const L = (e) => kit(`const L = __ladera, c = L.ctx, C = c.containers, S = C.slots.get(${JSON.stringify(f.sid)}), bp = c.buildings.get(${JSON.stringify(f.bid)}); ${e}`);
  const closed = await L(`L.render(); const s = L.state(); const lods = []; c.scene.traverse((o) => { if (o.isLOD && o.name.startsWith(bp.id + '.goods.')) lods.push(o); });
    const p = new c.THREE.Vector3(), q = new c.THREE.Vector3(), seen = lods.map((o) => { o.getWorldPosition(p); c.camera.getWorldPosition(q); return { d: p.distanceTo(q), levels: o.levels.map((lv) => lv.object.visible) }; });
    return { target: __a3.look()?.id, prompt: __a3.prompt(), goods: bp.goods.length, drawn: bp.interior.stats.goods.drawn, lods: lods.length, seen, dc: s.drawCalls, tris: s.triangles };`);
  assert.equal(closed.target, f.target, 'the crosshair no longer finds the counter of a stocked shop');
  assert.match(closed.prompt, /Abrir|Mirar/, `the prompt under the crosshair says ${JSON.stringify(closed.prompt)}`);
  assert.ok(closed.lods >= 1 && closed.drawn === closed.goods, `${closed.lods} LODs, ${closed.drawn} of ${closed.goods} articles drawn in the shop`);
  for (const s of closed.seen) {                                                                      // the LOD levels follow the distance: near below 8 m, the cheaper stock to 22 m
    if (s.d < 7.5) assert.deepEqual(s.levels, [true, false, false], `goods ${s.d.toFixed(1)} m away: ${s.levels}`);
    else if (s.d > 8.5 && s.d < 21) assert.deepEqual(s.levels, [false, true, false], `goods ${s.d.toFixed(1)} m away: ${s.levels}`);
  }
  await page.key('KeyE');
  const after = await L(`L.step(40); L.render(); const s = L.state(), sub = document.getElementById('subtitle'); return { opened: C.slots.get(S.id)?.state === 'open', said: sub?.classList.contains('on') ? sub.innerText.length : 0, dc: s.drawCalls, errors: L.errors().length };`);
  assert.ok(after.opened || after.said > 8, 'E on the counter of a stocked shop does nothing');
  assert.equal(after.errors, 0);
  console.log(`# stocked shop ${f.bid} (${closed.goods} articles in ${closed.lods} LOD${closed.lods > 1 ? 's' : ''}): the crosshair finds ${f.target}, E ${after.opened ? 'opens the drawer' : 'makes the counter speak'}; draw calls ${closed.dc} -> ${after.dc}, triangles ${closed.tris}; whole world ${pre.goods} articles in ${pre.shops} shops`);
  await L(`C.close(S.id, true); L.step(2); return 1;`);
});

test('the TV screens show a picture (D28: the screen was one flat emissive colour, a white octagon): all four screen materials carry a match as their emissive map, the glass maps the whole picture, a tube set has its own', async () => {
  const r = await kit(`
    const c = __ladera.ctx, mats = {}, meshes = { flat: 0, tube: 0, bad: [] };
    for (const k of ['tv_screen_a', 'tv_screen_b', 'tv_screen_crt_a', 'tv_screen_crt_b']) {
      const m = c.matlib.cache.get(k), im = m?.emissiveMap?.image; let st = null;
      if (im) {
        const W = im.width, H = im.height, d = im.getContext('2d').getImageData(0, 0, W, H).data, lum = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) lum[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255;
        let sum = 0, rim = 0, rimN = 0, bright = 0, max = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = lum[y * W + x]; sum += v; max = Math.max(max, v); if (v > 0.9) bright++; if (x < 6 || y < 6 || x >= W - 6 || y >= H - 6) { rim += v; rimN++; } }
        const mean = sum / (W * H); let ss = 0; for (const v of lum) ss += (v - mean) ** 2;
        st = { mean, sd: Math.sqrt(ss / (W * H)), max, bright: bright / (W * H), rim: rim / rimN };
      }
      mats[k] = { has: !!m, st };
    }
    c.scene.traverse((o) => {
      if (!o.isMesh || !/^tv_screen/.test(o.userData?.matKey ?? '')) return;
      const uv = o.geometry.attributes.uv; let u0 = 9, u1 = -9, v0 = 9, v1 = -9;
      for (let i = 0; i < uv.count; i++) { u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i)); v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i)); }
      meshes[/crt/.test(o.userData.matKey) ? 'tube' : 'flat']++;
      if (!(u0 < 0.001 && u1 > 0.999 && v0 < 0.001 && v1 > 0.999)) meshes.bad.push(o.name + ' u ' + u0.toFixed(2) + '..' + u1.toFixed(2) + ' v ' + v0.toFixed(2) + '..' + v1.toFixed(2));
    });
    return { mats, meshes };`);
  for (const [k, m] of Object.entries(r.mats)) {
    assert.ok(m.has && m.st, `${k} has no picture (emissive map)`);
    assert.ok(m.st.sd >= 0.15 && m.st.sd <= 0.45, `${k}: the picture is ${m.st.sd < 0.15 ? 'flat' : 'a slab of black and white'} (spread ${m.st.sd.toFixed(2)})`);
    assert.ok(m.st.mean >= 0.2 && m.st.mean <= 0.6, `${k}: mean brightness ${m.st.mean.toFixed(2)}`);
    assert.ok(m.st.bright < 0.1, `${k}: ${(100 * m.st.bright).toFixed(0)}% of the picture is white (it washes out to a white screen)`);
    if (/crt/.test(k)) assert.ok(m.st.rim < 0.05, `${k}: the rim of the glass is ${m.st.rim.toFixed(2)} bright (the polygon of the glass shows)`);       // the tube's glass is a cap of a sphere: the picture fades to black round it
  }
  assert.ok(r.meshes.flat >= 30 && r.meshes.tube >= 10, `${r.meshes.flat} flat-panel and ${r.meshes.tube} tube screens in the barrio`);
  assert.deepEqual(r.meshes.bad, [], 'a screen whose UVs do not cover the picture');
  console.log(`# tv: ${r.meshes.flat} flat-panel and ${r.meshes.tube} tube screen meshes; ${Object.entries(r.mats).map(([k, m]) => `${k} mean ${m.st.mean.toFixed(2)} spread ${m.st.sd.toFixed(2)} white ${(100 * m.st.bright).toFixed(1)}% rim ${m.st.rim.toFixed(2)}`).join('; ')}`);
});

test('every find is under the crosshair from the first spot a person would stand at (R4-208, R4-206: of 162 finds 40 were not, 16 from no spot at all): the finds of the first buildings, looked at from the first of the slot\'s front spots', async () => {
  const r = await kit(`
    const L = __ladera, c = L.ctx, C = c.containers, { frontSpots } = await import('/la-ladera/js/interiors/containers.js'), out = []; let n = 0;
    for (const bp of c.buildings.values()) {
      if (!C.pending.has(bp.id)) continue;
      if (n++ >= ${TRIES}) break;
      L.enter(bp.id); L.step(70);
      for (const S of C.byBuilding.get(bp.id) ?? []) {
        if (!S.plan?.find) continue;
        const room = S.bp.rooms.find((q) => q.id === S.rec.room), sps = frontSpots(S);
        if (!sps.length) { out.push({ sid: S.id, name: S.rec.name, nospot: true }); continue; }
        if (S.state === 'closed') C.open(S.id);
        L.step(40);
        const k = S.objs.findIndex((o) => o.find);
        if (k < 0) { out.push({ sid: S.id, name: S.rec.name, nofind: true }); C.close(S.id, true); continue; }
        const t = S.targets[k], [x, y, z] = S.bp.frame.toWorld(sps[0][0], room.y, sps[0][1]);
        L.teleport(x, z, { y }); L.step(2); L.lookAt(t.x, t.y, t.z); L.step(2);
        const got = __a3.look()?.id ?? null;
        out.push({ sid: S.id, name: S.rec.name, kind: S.slot.kind, find: S.objs[k].find, ok: got === 'cont:' + S.id + ':' + k, got });
        C.close(S.id, true); L.step(2);
      }
    }
    return out;`);
  const bad = r.filter((x) => !x.ok);
  assert.ok(r.length >= 8, `only ${r.length} finds in the first ${TRIES} buildings`);
  assert.deepEqual(bad.map((x) => `${x.sid} ${x.name} ${x.kind}: ${x.find ?? ''} ${x.nospot ? 'no front spot' : x.nofind ? 'the find is not inside' : `the crosshair is on ${x.got}`}`), [], 'a find that the first spot does not show');
  console.log(`# finds seen from the first front spot: ${r.length - bad.length} of ${r.length} in ${TRIES} buildings`);
});

test('E on a find that has a model of the library holds it up to the eyes (R4-206: there was no close-up view): 42 cm in front of the camera, 20 cm long, drawn on the screen, the world waits; Esc puts it back and only that, E puts it back too', async () => {
  await kit(`const c = __ladera.ctx; if (c.flow.mode === 'panel') c.flow.closePanel(); __ladera.step(2); return c.mode;`);              // whatever an earlier test left open
  const f = await kit(`
    const L = __ladera, c = L.ctx, C = c.containers, bound = ${JSON.stringify(Object.keys(BINDINGS))}; let n = 0;
    for (const bp of c.buildings.values()) {
      if (!C.pending.has(bp.id)) continue;
      if (n++ >= ${TRIES}) break;
      L.enter(bp.id); L.step(70);
      for (const S of C.byBuilding.get(bp.id) ?? []) {
        if (!S.reachable || !S.plan?.find || !bound.includes(S.plan.find)) continue;
        C.open(S.id); L.step(40);
        const k = S.objs.findIndex((o) => o.find && o.model);
        if (k >= 0) { const t = S.targets[k], spot = await __a3.aim(S.id, 'cont:' + S.id + ':' + k, [t.x, t.y, t.z]); if (spot) return { bid: bp.id, sid: S.id, k, spot, find: S.objs[k].find, model: S.objs[k].model.key }; }
        C.close(S.id, true); L.step(2);
      }
    }
    return null;`);
  assert.ok(f, `no slot with a find that has a model could be aimed at in ${TRIES} buildings`);
  const L = (e) => kit(`const L = __ladera, c = L.ctx, C = c.containers, S = C.slots.get(${JSON.stringify(f.sid)}); ${e}`);
  const pix = `const pix = async (w = 320, h = 180) => { const img = new Image(); img.src = L.shot({ w, h }); await img.decode(); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };`;
  await L(`${pix} L.step(3); window.__a3.pix0 = await pix(); return 1;`);
  await page.key('KeyE'); await tick(120);
  const h = await L(`${pix}
    const g = c.holdup.group, cam = c.camera, fwd = cam.getWorldDirection(new c.THREE.Vector3()), to = g ? g.position.clone().sub(cam.position) : null, ndc = g ? g.position.clone().project(cam) : null;
    const after = await pix(), before = window.__a3.pix0, W = 320, H = 180; let s = 0, n = 0;
    for (let y = Math.round(H * 0.3); y < Math.round(H * 0.7); y++) for (let x = Math.round(W * 0.3); x < Math.round(W * 0.7); x++) { const i = (y * W + x) * 4; s += Math.abs(after[i] - before[i]) + Math.abs(after[i + 1] - before[i + 1]) + Math.abs(after[i + 2] - before[i + 2]); n += 3; }
    const box = g ? new c.THREE.Box3().setFromObject(g, true).getSize(new c.THREE.Vector3()) : null, q = (sel) => document.querySelector(sel)?.textContent ?? '';
    return { mode: c.mode, running: c.running, current: c.flow.current, open: c.holdup.isOpen, inScene: !!g && c.scene.children.includes(g), along: to ? to.dot(fwd) : null, dist: to?.length() ?? null, ndc: ndc && [ndc.x, ndc.y],
      long: box ? Math.max(box.x, box.y, box.z) : null, diff: s / n, name: q('#panel .hd-name'), react: q('#panel .hd-react'), hint: q('#panel .hd-hint'), tag: q('#panel .hd-tag'), lot: S.bp.lot?.name ?? null, nameStyle: (() => { const e = document.querySelector('#panel .hd-name'), s = e && getComputedStyle(e); return s ? [s.fontSize, s.textTransform] : null; })(), state: S.state, found: c.discover.found.has('find:' + ${JSON.stringify(f.find)} + ':' + S.bid) };`);
  const rec = FINDS.find((x) => x.id === f.find);
  assert.equal(h.open, true, `E on the ${f.find} (model ${f.model}) did not hold it up: ${JSON.stringify({ mode: h.mode, current: h.current })}`);
  assert.deepEqual([h.mode, h.running, h.current], ['panel', false, 'holdup'], 'the world should wait while it is held');
  assert.ok(h.found, 'the find is found as before (the toast and the discovery are the old ones)');
  assert.ok(h.inScene, 'the thing is in the scene');
  assert.ok(Math.abs(h.along - 0.42) < 0.03 && h.dist > 0.38 && h.dist < 0.48, `it hangs ${h.along} m in front of the eyes (${h.dist} m away)`);
  assert.ok(Math.abs(h.ndc[0]) < 0.12 && Math.abs(h.ndc[1]) < 0.12, `it is in the middle of the screen (${h.ndc})`);
  assert.ok(h.long > 0.15 && h.long < 0.205, `it is ${h.long} m long to the eye`);
  assert.ok(h.lot && h.name.startsWith(`${rec.name.es} · ${h.lot}`) && h.react.length > 3 && /Esc/.test(h.hint) && /^Hallazgo · .+ [1-9]\d* de [1-9]\d*$/.test(h.tag), `the caption says what the toast says (the HUD is hidden while it is held): ${JSON.stringify([h.tag, h.name, h.react, h.hint])}`);
  assert.deepEqual(h.nameStyle, ['22px', 'none'], 'the name is set in the caption\'s own type (the panel\'s `#panelbody h3` rule would make it small pale capitals)');
  console.log(`# ${f.find} (${f.model}) in ${f.sid}: held ${h.dist.toFixed(2)} m away, ${h.long.toFixed(3)} m long, the middle of the screen changed by ${h.diff.toFixed(1)} of 255; caption ${JSON.stringify(h.name + ' | ' + h.react)}`);
  assert.ok(h.diff > 12, `the thing is not drawn: the middle of the screen changed by only ${h.diff.toFixed(1)} of 255`);
  await page.key('Escape'); await tick(80);
  const e1 = await L(`return { mode: c.mode, running: c.running, current: c.flow.current, open: c.holdup.isOpen, group: !!c.holdup.group, inScene: c.scene.children.some((q) => q.name === 'holdup'), state: S.state, pauseShown: !document.getElementById('pause').classList.contains('hidden'), panelShown: !document.getElementById('panel').classList.contains('hidden') };`);
  assert.deepEqual([e1.mode, e1.current, e1.open, e1.group, e1.inScene, e1.pauseShown], ['play', null, false, false, false, false], 'Esc puts the thing back and gives the game back (no pause menu)');
  assert.equal(e1.state, 'open', 'Esc closed only the hold-up: the drawer stays open');
  await L(`L.step(3); return 1;`); await page.key('KeyE'); await tick(80);
  const again = await L(`return { open: c.holdup.isOpen, mode: c.mode };`);
  assert.deepEqual([again.open, again.mode], [true, 'panel'], 'E on the find again holds it up again');
  await page.key('KeyE'); await tick(80);
  const e2 = await L(`return { mode: c.mode, open: c.holdup.isOpen, inScene: c.scene.children.some((q) => q.name === 'holdup'), state: S.state, errors: L.state().errors };`);
  assert.deepEqual([e2.mode, e2.open, e2.inScene, e2.state], ['play', false, false, 'open'], 'E, with it held, puts it back');
  assert.ok(!e2.errors?.length, `errors ${JSON.stringify(e2.errors)}`);
  await L(`C.close(S.id, true); L.step(2); return 1;`);
});

test('a treasure glints where it lies (R4-206: a speck of colour seen from 1.6 m above reads as nothing): the open slot has a star over the find, a finger above its top and nowhere else, it twinkles between its floor and its full size, and it goes with the slot when that closes', async () => {
  const f = await kit(`
    const L = __ladera, c = L.ctx, C = c.containers; let n = 0;
    for (const bp of c.buildings.values()) {
      if (!C.pending.has(bp.id)) continue;
      if (n++ >= ${TRIES}) break;
      L.enter(bp.id); L.step(70);
      for (const S of C.byBuilding.get(bp.id) ?? []) {
        if (!S.reachable || !S.plan?.find) continue;
        C.open(S.id); L.step(40);
        const k = S.objs.findIndex((o) => o.find && o.glint);
        if (k >= 0) return { bid: bp.id, sid: S.id, k, find: S.objs[k].find };
        C.close(S.id, true); L.step(2);
      }
    }
    return null;`);
  assert.ok(f, `no slot with a glinting find in ${TRIES} buildings`);
  const r = await kit(`
    const L = __ladera, c = L.ctx, C = c.containers, S = C.slots.get(${JSON.stringify(f.sid)}), o = S.objs[${f.k}], t = S.targets[${f.k}], v = new c.THREE.Vector3();
    const sp = S.glints.find((g) => g.sprite.userData.glintOf === o.find)?.sprite;
    if (!sp) return { has: false, n: S.glints.length };
    const shownUp = (obj) => { for (let p = obj; p; p = p.parent) { if (p.visible === false) return false; if (p === c.scene) return true; } return false; };
    const sizes = []; for (let i = 0; i < 120; i++) { L.step(1); sizes.push(sp.scale.x); }
    sp.getWorldPosition(v);
    const out = { has: true, n: S.glints.length, glintObjs: S.objs.filter((q) => q.glint).length, pos: [v.x - t.x, v.y - t.y, v.z - t.z], h: o.h, shown: shownUp(sp), lo: Math.min(...sizes), hi: Math.max(...sizes), additive: sp.material.blending === c.THREE.AdditiveBlending, depthTest: sp.material.depthTest, depthWrite: sp.material.depthWrite };
    C.close(S.id, true); L.step(40); out.shownClosed = shownUp(sp);
    return out;`);
  assert.ok(r.has, `the ${f.find} lies in ${f.sid} with no star over it (${r.n} stars in the slot)`);
  assert.equal(r.n, r.glintObjs, 'one star per glinting thing in the slot');
  assert.ok(r.shown, 'the star is in the scene while the slot is open');
  assert.ok(Math.abs(r.pos[0]) < 0.04 && Math.abs(r.pos[2]) < 0.04, `the star hangs over the find, not beside it: ${r.pos}`);
  const lift = r.pos[1] - r.h / 2;
  assert.ok(Math.abs(lift - GLINT.LIFT) < 0.01 && lift > 0.005 && lift < 0.06, `a finger over the top of the find (it is ${r.h} m tall): ${lift} m above its top`);
  assert.ok(r.lo >= GLINT.SIZE * GLINT.FLOOR - 1e-6 && r.lo < GLINT.SIZE * 0.6 && r.hi <= GLINT.SIZE + 1e-6 && r.hi > GLINT.SIZE * 0.85, `it twinkles between ${r.lo} and ${r.hi} (floor ${GLINT.SIZE * GLINT.FLOOR}, full ${GLINT.SIZE})`);
  assert.ok(r.hi >= 0.1 && r.hi <= 0.3, `a star of ${r.hi} m across: big enough to see from the height of the eyes (a coin is 4 cm), small enough to stay a glint`);
  assert.ok(r.additive && r.depthTest && !r.depthWrite, 'a soft additive star, hidden behind what stands in front of it');
  assert.equal(r.shownClosed, false, 'the star goes with the slot when it closes');
  console.log(`# glint over ${f.find} in ${f.sid}: ${r.pos.map((x) => x.toFixed(3))} from its middle, size ${r.lo.toFixed(3)} to ${r.hi.toFixed(3)}, ${r.n} stars in the slot`);
});
