// LAZY INTERIORS (A1, js/interiors/lazy.js, `?lazy=1`) in the REAL page: nothing here calls ensure() or drain() except where the test is about exactly that. The boot ends at the playable
// milestone with no interior made; the interiors come as the player nears them (in slices of a frame, the nearest first), a door waits for its house, a teleport lands in a furnished room, and
// once everything is made the barrio is the one an eager boot makes. The eager boot stays the default (`?lazy=1` is the only way in).
// Quiet box: the browser comes only from tests/chrome.mjs (headless, simulated pointer lock, speech recorded). ?manual: no animation loop, every frame is a step() here.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-lazy-page.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

let b, page, lazyFinal = null, lazyContents = null;
const kit = (expr, timeout) => page.eval(`(async () => JSON.stringify(await (async () => { const K = window.__k; ${expr} })()))()`, timeout).then(JSON.parse);

/** Runs IN the page once: the little kit every test below uses (all through the public surface: __ladera, ctx.interiors, ctx.interact). */
function installKit() {
  const L = window.__ladera, c = L.ctx, K = window.__k = {};
  K.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Step frames (real time passes between them, so links and downloads finish) until pred() or `max` frames. Returns the frames used, or -1 when pred never held. */
  K.until = async (pred, max = 8000) => { for (let i = 0; i < max; i++) { if (pred()) return i; L.step(1); if (i % 2 === 0) await K.sleep(2); } return pred() ? max : -1; };
  K.gap = (bp, x, z) => { const q = bp.bounds; return Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.z0 - z, 0, z - q.z1)); };
  K.under = (x, z, pad = 2) => [...c.buildings.values()].find((bp) => x >= bp.bounds.x0 - pad && x <= bp.bounds.x1 + pad && z >= bp.bounds.z0 - pad && z <= bp.bounds.z1 + pad);
  /** A spot on open ground `d` metres (footprint to spot) from the building, on the side away from the other buildings, or null. */
  K.spotAt = (bp, d) => {
    const q = bp.bounds, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, r = Math.hypot(q.x1 - q.x0, q.z1 - q.z0) / 2;
    for (let a = 0; a < 16; a++) {
      const th = a * Math.PI / 8, x = cx + Math.cos(th) * (r + d), z = cz + Math.sin(th) * (r + d);
      if (!K.under(x, z) && K.gap(bp, x, z) > d - 3 && K.gap(bp, x, z) < d + 6) return [x, z];
    }
    return null;
  };
  /** Of the buildings that are not ready, the one farthest from the player that has an entrance. */
  K.farthest = (skip = []) => { const p = c.player.s; return [...c.buildings.values()].filter((bp) => bp.entrances?.length && !c.interiors.ready(bp.id) && !skip.includes(bp.id)).sort((a, z) => K.gap(z, p.x, p.z) - K.gap(a, p.x, p.z))[0]; };
  K.doorOf = (bid) => [...c.interact.items.values()].find((it) => it.kind === 'door' && it.building === bid && /:out$/.test(it.id));
  /** Interior groups that have any geometry in them (the groups exist, empty, from the plan on). */
  K.made = () => [...c.batch.groups].filter(([k, g]) => k.endsWith('.int') && c.buildings.has(k.slice(0, -4)) && g.meshes.length > 0).length;
  /** The furniture's interact items (`int:`), as a count and a hash of their ids (the seat items carry the running number of an anchor: `sita57`, which follows the order the data was made in; that number is not
   *  part of the comparison). The containers' (`cont:`) are made when the player goes into a house, so they are the walking's, not the barrio's (what they hold is compared by K.contents). */
  K.itemSig = () => {
    const ids = [...c.interact.items.keys()].filter((id) => /^int:/.test(id)).map((id) => id.replace(/sita\d+$/, 'sita')).sort();
    let h = 2166136261; for (const id of ids) for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ids.length + ':' + h.toString(16);
  };
  /** The counts a settled barrio is compared by. */
  K.world = () => {
    const st = L.state();
    return { buildings: st.buildings, furniture: [...c.buildings.values()].reduce((n, bp) => n + (bp.furniture?.length ?? 0), 0), anchors: st.anchors, lights: st.lights, discoveries: st.discoveries, npcs: st.npcs,
      errors: st.errors, items: K.itemSig(), made: K.made(), sealed: c.interiors?.sealed ?? null, built: c.interiors?.built ?? null, late: c.interiors?.stats.late ?? null, pending: c.staged?.pending.length ?? null };
  };
  /** The contents plan and the drawers (contents.js): wakes the containers of every building (a page whose data has sealed), then digests the plan (the papers and finds of every household), the slot every one
   *  was pinned to, and what makeContents puts in every slot. The eager page's answer is the one the lazy page's has to be (the plan reads every building's furniture: a wake before the seal made it from a bare barrio). */
  K.contents = async () => {
    const { makeContents, contentStats } = await import('/la-ladera/js/interiors/contents.js'), C = c.containers;
    for (const bid of [...C.pending.keys()]) C.activate(bid);
    const plan = c.contentPlan; if (!plan) return null;
    const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
    const units = plan.units.map((u) => `${u.bid}|${u.hh.id}|${u.papers.join(',')}|${u.finds.join(',')}`), slots = [];
    for (const list of C.byBuilding.values()) for (const S of list) slots.push(`${S.id}|${S.plan?.paper ?? '-'}|${S.plan?.find ?? '-'}|${hash(JSON.stringify(makeContents(c, S)))}`);
    slots.sort();
    const st = contentStats(c), out = { buildings: C.byBuilding.size, slots: slots.length, households: units.length, plan: hash(units.join('\n')), pins: hash(slots.map((s) => s.split('|').slice(0, 3).join('|')).join('\n')),
      drawers: hash(slots.join('\n')), orphans: st.orphans, planned: st.planned, pinned: { papers: st.papers, finds: st.finds } };
    for (const id of [...C.byBuilding.keys()]) C.deactivate(id);
    return out;
  };
  return true;
}

before(async () => {
  b = await launch({ width: 960, height: 540 });
  page = await b.open('la-ladera/index.html?autostart&manual&lazy=1');
  await page.eval('__ladera.setHour(10)');
  await page.fn(installKit);
});
after(async () => { await b?.close(); });

test('at the milestone no interior is made (only the chapel\'s furniture, which its shell draws), and the queue is waiting behind the milestone', async () => {
  const r = await kit(`
    const L = __ladera, c = L.ctx, m = c.interiors, s = m.summary();
    const sealed = [...c.buildings.values()].filter((bp) => bp.furniture?.length).map((bp) => bp.id);
    return { total: s.total, data: s.data, meshes: s.meshes, shown: s.shown, sealed: s.sealed, built: s.built, furnished: sealed.length, made: K.made(),
      pending: c.staged.pending.map((u) => u.id), units: [...c.staged.units.keys()], progress: c.staged.progress, stream: !!document.getElementById('stream'), errors: L.state().errors, kinds: sealed.map((id) => c.buildings.get(id).lot?.kind) };`);
  assert.equal(r.total, 109); assert.equal(r.meshes, 0, 'no interior has any meshes yet'); assert.equal(r.shown, 0);
  assert.ok(r.data <= 2, `${r.data} buildings furnished at the milestone (the chapel's shell needs its altar): ${r.kinds}`);
  assert.deepEqual(r.kinds.filter((k) => k !== 'chapel'), [], 'and nothing else');
  assert.equal(r.sealed, false); assert.equal(r.built, false);
  assert.equal(r.made, 0, 'no interior group holds any geometry yet');
  // (the packs are 120-350 ms of download, so a slow first look at the page can find them done already: they are asserted as UNITS of the queue; what cannot be done yet is what waits for the data pass)
  for (const id of ['interior-packs', 'people-pack', 'inspect-pack', 'textures']) assert.ok(r.units.includes(id), `${id} is a unit of the queue behind the milestone: ${r.units}`);
  for (const id of ['interiors-data', 'interiors', 'people']) assert.ok(r.pending.includes(id), `${id} has not happened at the milestone: pending ${r.pending}`);
  assert.equal(r.stream, true, 'and the page shows the small progress cue while they come');
  assert.equal(r.errors, 0);
});

test('a house the player comes near is made before they reach it, in slices, the nearest first (and no step was a whole interior)', async (t) => {
  const r = await kit(`
    const L = __ladera, c = L.ctx, m = c.interiors; await m.whenPacks();
    const T = K.farthest(); if (!T) return { skip: 'no far building' };
    const spot = K.spotAt(T, 45); if (!spot) return { skip: 'no open ground by ' + T.id };
    const seq = [], dseq = []; const off = c.events.on('interiors:ready', (e) => seq.push(e.id)), off2 = c.events.on('interiors:data', (e) => dseq.push(e.id));
    const ensured0 = m.stats.ensured, late0 = m.stats.late, slices0 = m.stats.slices;
    L.teleport(spot[0], spot[1]); const p0 = { ...c.player.s };
    const nearB = [...c.buildings.values()].filter((bp) => K.gap(bp, spot[0], spot[1]) <= m.o.NEAR_M), near = new Set(nearB.map((bp) => bp.id));
    const was = [...near].filter((id) => m.ready(id)), when = new Map();
    const calls = []; let frames = -1;
    for (let i = 0; i < 8000 && when.size < near.size; i++) {
      const t0 = performance.now(); L.step(1); calls.push(performance.now() - t0); if (i % 2 === 0) await K.sleep(2); frames = i;
      for (const id of near) if (!when.has(id) && m.ready(id)) when.set(id, i);
    }
    for (let i = 0; i < 400; i++) { L.step(1); if (i % 2 === 0) await K.sleep(2); }                          // (and a little longer: what comes next is outside the radius)
    off(); off2();
    const p1 = c.player.s, moved = Math.hypot(p1.x - p0.x, p1.z - p0.z), gT = K.gap(T, spot[0], spot[1]);
    const nearer = nearB.filter((bp) => K.gap(bp, spot[0], spot[1]) < gT - 0.01).map((bp) => bp.id);
    const behind = nearer.filter((id) => !was.includes(id) && when.get(id) > when.get(T.id) + 90);              // a nearer building made long after T (the warm-up may reorder a little; not by 1.5 s)
    // the order of the DATA pass: every building of the radius whose data was not done comes before the first one outside it
    const di = (list) => list.map((id) => dseq.indexOf(id)).filter((i) => i >= 0), dNear = di([...near]), dFar = dseq.map((id, i) => [id, i]).filter(([id]) => !near.has(id)).map(([, i]) => i);
    calls.sort((a, z) => a - z);
    return { T: T.id, gap: gT, ready: m.ready(T.id), frames, moved, ensured: m.stats.ensured - ensured0, late: m.stats.late - late0, nearN: near.size, wasN: was.length, built: when.size, nearerN: nearer.length, behind,
      dataNear: dNear.length, dataFar: dFar.length, lastNearData: dNear.length ? Math.max(...dNear) : -1, firstFarData: dFar.length ? Math.min(...dFar) : -1,
      readyFar: seq.filter((id) => !near.has(id)).length, callMax: +calls[calls.length - 1].toFixed(1), callP95: +calls[Math.floor(calls.length * 0.95)].toFixed(1),
      maxStepMs: +m.stats.maxStepMs.toFixed(1), slices: m.stats.slices - slices0, errors: L.state().errors };`, 240000);
  if (r.skip) return t.skip(r.skip);                                                                                       // (the barrio has no such spot: nothing to say)
  assert.ok(r.gap > 35 && r.gap < 55, `the player stands ${r.gap.toFixed(0)} m from ${r.T}`);
  assert.equal(r.ready, true, `${r.T} is made and warm after ${r.frames} frames with the player standing still`);
  assert.equal(r.moved < 0.5, true, 'the player did not move: it was built ahead of them');
  assert.equal(r.ensured, 0, 'nothing was made in one call (ensure) for a player who only stood near');
  assert.equal(r.late, 0, 'the safety net (the player in a house that was not made) did not fire');
  assert.equal(r.built, r.nearN, `every building within the radius is made and warm (${r.built} of ${r.nearN}; ${r.wasN} were before the teleport)`);
  assert.deepEqual(r.behind, [], 'no building nearer than the target was made long after it');
  assert.ok(r.dataFar > 0, 'the far data pass went on once the radius was done');
  assert.ok(r.lastNearData < r.firstFarData, `the nearest first: the last building of the radius was furnished as number ${r.lastNearData} (${r.dataNear} of them), the first outside it as number ${r.firstFarData} (${r.dataFar} of them)`);
  assert.equal(r.readyFar, 0, 'no interior outside the radius was drawn while the pass over the data was still going on');
  assert.ok(r.slices > 20, `${r.slices} slices of a frame did it`);
  assert.ok(r.callMax < 250, `no call of a frame took ${r.callMax} ms (a whole interior in one call is 150-400 ms and more); p95 ${r.callP95} ms`);
  assert.equal(r.errors, 0);
});

test('a door of a house that is not made waits for it, says so after a moment, and opens the moment the house is ready; a second press while it waits does not open it twice', async (t) => {
  const r = await kit(`
    const L = __ladera, c = L.ctx, m = c.interiors; await m.whenPacks();
    const B = K.farthest(); if (!B) return { skip: 'no far building' };
    const door = K.doorOf(B.id); if (!door) return { skip: 'no door interact item for ' + B.id };
    const toasts = []; const toast0 = c.ui.toast; c.ui.toast = (s, ms) => { toasts.push(s); return toast0?.call(c.ui, s, ms); };
    m.setPacks(false);                                                                                       // the packs the meshes are drawn from are still on their way
    const before = door.prompt(), notReady = !m.ready(B.id);
    c.interact.target = door; const taken = c.interact.use(), again = c.interact.use();
    for (let i = 0; i < 60; i++) { L.step(1); await K.sleep(10); }                                          // 0.6 s: past the 400 ms after which it says so
    const waiting = { prompt: door.prompt(), held: door.held, toasts: [...toasts], ready: m.ready(B.id) };
    m.setPacks(true);
    const frames = await K.until(() => m.ready(B.id) && !door.held, 8000);
    await K.sleep(20); L.step(2);
    const after = { prompt: door.prompt(), held: door.held, ready: m.ready(B.id), frames };
    // a door of a house that IS ready opens at once
    const R = [...c.buildings.values()].find((bp) => bp.id !== B.id && m.ready(bp.id) && K.doorOf(bp.id));
    let direct = null; if (R) { const d2 = K.doorOf(R.id), p0 = d2.prompt(); c.interact.target = d2; const t2 = c.interact.use(); direct = { taken: t2, before: p0, after: d2.prompt() }; }
    c.ui.toast = toast0;
    return { B: B.id, before, notReady, taken, again, waiting, after, direct, errors: L.state().errors };`);
  if (r.skip) return t.skip(r.skip);
  assert.equal(r.notReady, true, `${r.B} was not ready`);
  assert.match(r.before, /^Abrir/); assert.equal(r.taken, true, 'the press was taken (the caller does nothing more)'); assert.equal(r.again, true, 'a second press is taken too');
  assert.equal(r.waiting.held, true); assert.match(r.waiting.prompt, /^Abrir/, 'the door has not opened onto a house that is not there');
  assert.ok(r.waiting.toasts.some((t) => /Un momento/.test(t)), `it said so: ${JSON.stringify(r.waiting.toasts)}`);
  assert.equal(r.waiting.ready, false);
  assert.equal(r.after.ready, true, `the house was made (${r.after.frames} frames after the packs came)`);
  assert.equal(r.after.held, false); assert.match(r.after.prompt, /^Cerrar/, 'the door opened the moment the house was ready, once (two presses, one opening)');
  if (r.direct) { assert.equal(r.direct.taken, true); assert.match(r.direct.before, /^Abrir/); assert.match(r.direct.after, /^Cerrar/, 'a house that is ready: the door opens at the press'); }
  assert.equal(r.errors, 0);
});

test('a teleport into a house that is not made lands in a furnished room: the house is made in that call, its containers wake (once the data pass has sealed), its furniture is there, nothing is bare', async (t) => {
  const r = await kit(`
    const L = __ladera, c = L.ctx, m = c.interiors; await m.whenPacks();
    const F = K.farthest(); if (!F) return { skip: 'no far building' };
    const e0 = m.stats.ensured, late0 = m.stats.late, ready0 = m.ready(F.id), furn0 = F.furniture?.length ?? 0;
    const en = F.entrances[0], [ix, iy, iz] = en.inside;
    L.teleport(ix, iz, { y: iy, yaw: en.yawIn ?? 0 }); L.step(3);                                           // (what the first frames in the house show: it is made in that call, warm or not)
    const bp = c.buildings.get(F.id), g = c.batch.groups.get(F.id + '.int'), rec = c.visibility.ints.find((i) => i.bid === F.id), st = L.state();
    L.render();
    const first = { indoors: st.indoors, building: st.building, furniture: bp.furniture?.length ?? 0, meshes: g?.meshes.length ?? 0, visible: g?.obj.visible, on: rec?.on, ready: rec?.ready };
    L.step(70);                                                                                              // (a second of play: the 4 Hz scan has had its turns)
    const early = { sealed: m.sealed, slots: (c.containers.byBuilding.get(F.id) ?? []).length };            // (the containers sleep while the data pass is under way, see the second boot below; they wake once it has sealed)
    const sealedAt = m.sealed ? 0 : await K.until(() => m.sealed, 30000); L.step(70);
    const slots = c.containers.byBuilding.get(F.id) ?? [], woke = { slots: slots.length, reachable: slots.filter((s) => s.reachable).length };
    const frames = await K.until(() => m.ready(F.id), 6000);                                                 // (and it is warm a little later: the room was shown meanwhile)
    return { id: F.id, ready0, furn0, first, early, sealedAt, woke, ready: m.ready(F.id), frames, ensured: m.stats.ensured - e0, late: m.stats.late - late0, errors: L.state().errors };`, 240000);
  if (r.skip) return t.skip(r.skip);
  assert.equal(r.ready0, false, `${r.id} was not made before the teleport`);
  assert.equal(r.ensured, 1, 'made in the call of the teleport (its hook)');
  assert.equal(r.late, 0, 'by the teleport itself: the safety net of the frame had nothing to do');
  assert.equal(r.first.indoors, true); assert.equal(r.first.building, r.id);
  assert.ok(r.first.furniture > 0, `${r.first.furniture} furniture records (${r.furn0} before)`);
  assert.ok(r.first.meshes > 0 && r.first.visible === true && r.first.on === true && r.first.ready === true, `the interior's meshes are in the scene and shown at the first frame (${JSON.stringify(r.first)})`);
  if (!r.early.sealed) assert.equal(r.early.slots, 0, 'no container woke while the data pass was under way');
  assert.ok(r.sealedAt >= 0, 'the data pass sealed');
  assert.ok(r.woke.slots > 0 && r.woke.reachable > 0, `its containers woke once the data had sealed: ${r.woke.slots} slots, ${r.woke.reachable} reachable`);
  assert.equal(r.ready, true, `and it was warm after ${r.frames} frames`);
  assert.equal(r.errors, 0);
});

test('inside a made house the crosshair finds a piece of furniture, and going back out hides the interior again without losing it', async (t) => {
  const r = await kit(`
    const L = __ladera, c = L.ctx, m = c.interiors, C = c.containers;
    const id = c.player.building; if (id == null) return { skip: 'the player is not in a house' };
    const { frontSpots } = await import('/la-ladera/js/interiors/containers.js');
    let hit = null;
    for (const S of C.byBuilding.get(id) ?? []) {
      if (!S.reachable) continue;
      const room = S.bp.rooms.find((r) => r.id === S.rec.room), spots = frontSpots(S);
      for (const [bx, bz] of spots) {
        const [x, y, z] = S.bp.frame.toWorld(bx, room?.y ?? 0, bz);
        L.teleport(x, z, { y }); L.lookAt(S.pos[0], S.pos[1], S.pos[2]); L.step(2);
        c.interact.update(c.camera.position, c.camera.getWorldDirection(new c.THREE.Vector3()));
        if (c.interact.target?.id === 'cont:' + S.id) { hit = { sid: S.id, name: S.rec.name, prompt: c.interact.prompt() }; break; }
      }
      if (hit) break;
    }
    const e = c.buildings.get(id).entrances[0], [ox, oy, oz] = e.outside ?? e.inside;
    L.teleport(ox, oz, { y: oy }); L.step(3);
    const out = { building: c.player.building, indoors: c.player.indoors, ready: m.ready(id) };
    const far = K.spotAt(c.buildings.get(id), 90);
    let hidden = null; if (far) { L.teleport(far[0], far[1]); L.step(4); hidden = c.visibility.ints.find((i) => i.bid === id)?.on === false; }
    return { id, hit, out, hidden, ready: m.ready(id), errors: L.state().errors };`);
  if (r.skip) return t.skip(r.skip);
  assert.ok(r.hit, `no piece of furniture in ${r.id} could be aimed at`);
  assert.match(r.hit.prompt ?? '', /Abrir|Cerrar|Mirar|Revisar|Examinar|\w+/, 'the crosshair offers something');
  assert.equal(r.out.building, null); assert.equal(r.out.indoors, false);
  assert.equal(r.out.ready, true, 'going out does not unmake the house');
  if (r.hidden !== null) assert.equal(r.hidden, true, 'and 90 m away its interior is not drawn');
  assert.equal(r.ready, true); assert.equal(r.errors, 0);
});

test('once everything is made (settle) the barrio is the one an eager boot makes: the same counts of buildings, furniture, anchors, lights and discoveries, no error', async () => {
  await page.eval('window.__ladera.settle({ timeout: 300000 }).then(() => true)', 400000);
  lazyFinal = await kit('return K.world();');
  assert.equal(lazyFinal.sealed, true); assert.equal(lazyFinal.built, true); assert.equal(lazyFinal.pending, 0);
  assert.equal(lazyFinal.errors, 0); assert.ok(lazyFinal.npcs > 50, `${lazyFinal.npcs} people`);
  assert.equal(lazyFinal.made, 109, 'every building has its interior in the scene');
});

test('a second lazy boot, the player in a house in its first seconds: no container wakes until the data pass has sealed (the contents plan reads every building\'s furniture), and settled, every drawer holds what the eager boot\'s holds', async (t) => {
  page = await b.open('la-ladera/index.html?autostart&manual&lazy=1');                  // (a boot of its own: the player walks into a house at once, which the near-radius test above must not have seen)
  await page.eval('__ladera.setHour(10)');
  await page.fn(installKit);
  const r = await kit(`
    const L = __ladera, c = L.ctx, m = c.interiors; await m.whenPacks();
    const p = { ...c.player.s }, cands = [...c.buildings.values()].filter((bp) => bp.entrances?.length).sort((a, z) => K.gap(a, p.x, p.z) - K.gap(z, p.x, p.z));
    let B = null;
    for (const bp of cands.slice(0, 12)) {                                                                   // (the nearest house with openable furniture: it is made in the call of the teleport)
      const en = bp.entrances[0], [ix, iy, iz] = en.inside;
      L.teleport(ix, iz, { y: iy, yaw: en.yawIn ?? 0 }); L.step(2);
      if (c.containers?.pending.has(bp.id)) { B = bp; break; }
    }
    if (!B) return { skip: 'no near building with openable furniture' };
    L.step(70);                                                                                              // (a second of play: the 4 Hz scan has had its turns)
    const C = c.containers, e = C.pending.get(B.id), q = c.player.s;
    return { id: B.id, sealed: m.sealed, furnished: m.summary().data, near: Math.hypot(q.x - e.cx, q.z - e.cz) - e.r < 10 && e.group.obj.visible !== false, woke: C.byBuilding.size, activations: C.activations,
      plan: c.contentPlan !== undefined, errors: L.state().errors };`, 120000);
  if (r.skip) return t.skip(r.skip);
  await page.eval('window.__ladera.settle({ timeout: 300000 }).then(() => true)', 400000);
  lazyContents = await kit('return await K.contents();', 240000);                       // (every building's containers woken: the plan, the pins and the drawers; the eager page is asked the same below)
  assert.equal(r.sealed, false, `the data pass had sealed already (${r.furnished} buildings furnished): there is nothing to hold back, and this test proves nothing`);
  assert.ok(r.furnished < 20, `${r.furnished} of 109 buildings furnished: most of the barrio is still bare`);
  assert.equal(r.near, true, `the player is within reach of the fronts of ${r.id} and its interior is shown: only the data pass keeps its containers asleep`);
  assert.equal(r.woke, 0, `a container woke with ${r.furnished} of 109 buildings furnished`);
  assert.equal(r.activations, 0);
  assert.equal(r.plan, false, `the contents plan was made with ${r.furnished} of 109 buildings furnished: it plans the unfurnished ones without a limit, so the drawers differ from the eager boot's`);
  assert.equal(r.errors, 0);
  assert.ok(lazyContents && lazyContents.buildings > 100, `${lazyContents?.buildings} buildings with openable furniture woke once settled`);
  assert.equal(lazyContents.orphans, 0, 'a paper or a find planned with no slot of its own');
});

test('the eager boot is the default and is unchanged: no queue, no manager, every interior made before the milestone, the same world the lazy boot settles to', async () => {
  page = await b.open('la-ladera/index.html?autostart&manual&lazy=0');                  // (`lazy=0` says it outright: LADERA_LAZY=1 turns every page that does not name `lazy=` into a lazy one)
  await page.fn(installKit);
  const e = await kit(`
    return { ...K.world(), staged: __ladera.ctx.staged === undefined, interiors: __ladera.ctx.interiors === undefined };`);
  assert.equal(e.staged, true, 'no ctx.staged'); assert.equal(e.interiors, true, 'no ctx.interiors');
  assert.equal(e.made, 109, 'every interior is in the scene at the milestone');
  assert.equal(e.errors, 0);
  assert.ok(lazyFinal, 'the lazy boot settled in the test before');
  for (const k of ['buildings', 'furniture', 'anchors', 'lights', 'npcs', 'made', 'items']) assert.equal(lazyFinal[k], e[k], `${k}: lazy ${lazyFinal[k]} and eager ${e[k]}`);
  assert.equal(lazyFinal.discoveries[1], e.discoveries[1], 'the total of discoveries (what the walking before it has found is not part of it)');
  // the contents plan reads every building's furniture, so what the drawers hold is the same only if no container woke before the data pass sealed (the second lazy boot above holds that back)
  const ec = await kit('return await K.contents();', 240000);
  assert.ok(lazyContents, 'the second lazy boot settled and woke its containers in the test before');
  assert.deepEqual(lazyContents, ec, 'the plan, the slots every paper and find lie in and what every drawer holds: the lazy barrio differs from the eager one');
});
