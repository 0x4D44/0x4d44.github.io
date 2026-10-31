// INTERIORS (A3) in the REAL page: nothing here calls activate() or open() by hand. The player walks into a real building, the 4 Hz scan wakes its containers,
// the crosshair finds a wardrobe front, E opens it, E on a paper opens the reader, Esc closes only the reader, E on a special find marks it, the journal counts it,
// walking away closes everything. (The node tests reach the slots through activate(); a world-versus-building-coordinates slip in the scan hid there for a while.)
// Quiet box: the browser comes only from tests/chrome.mjs (headless, simulated pointer lock, speech recorded).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-page.test.mjs
//   A3_TRIES=24 buildings tried when looking for a slot with a given content
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

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
      contentMeshes: S.contentGroup ? S.contentGroup.children.filter((m) => m.isMesh).length : -1, prompt: __a3.prompt() };`);
  assert.equal(open.st.state, 'open', 'E did not open the wardrobe');
  assert.ok(open.st.objs >= 3, `${open.st.objs} things inside a wardrobe`);
  assert.equal(open.st.group, open.st.objs, 'one kernel target per thing inside');
  assert.ok(open.ghostVisible && open.ghostMeshes >= 1, 'no moving door in the scene');
  assert.ok(open.contentMeshes >= 1 && open.contentMeshes <= 3, `${open.contentMeshes} meshes for the contents (budget: 3)`);
  assert.ok(open.dc - closed.dc <= 6, `opening cost ${open.dc - closed.dc} draw calls (${closed.dc} -> ${open.dc})`);
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
  const word = (p) => String(p).replace(/^E\s+/, '');                                                       // the HUD shows the key, a line break, then the prompt
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
