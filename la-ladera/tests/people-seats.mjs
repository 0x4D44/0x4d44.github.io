#!/usr/bin/env node
// Page test for the seated legs (R1-D13: the elder on the bench floated). Headless Chrome, the game's own people library and the real skinned meshes:
//  A. every one of the 30 characters on every seat the brain uses (bench 0.49, pew 0.45, school desk 0.43), in two sit clips: the lowest vertex of the body (the sole) before and after
//     js/people/legs.js plantFeet, against the model the Node tests use (seatFloatM / plantedFloatM), and the pelvis must not move;
//  B. the barrio itself: people the brain sits on the benches (do_bench, as it does in the day), looked at one by one: the lowest vertex of each seated person against the ground the
//     physics gives under it - within 5 cm for an adult, 10 cm for a child - and world.js has recorded the same figure on the person (n.floatM).
//   node la-ladera/tests/people-seats.mjs [--q "autostart&manual&hour=16"] [--slug la-ladera]      (exit code 1 on a failed check)
import { launch } from './chrome.mjs';

const a = process.argv.slice(2), flag = (n, d) => { const i = a.indexOf('--' + n); return i < 0 ? d : a[i + 1]; };
const q = flag('q', 'autostart&manual&hour=16'), slug = flag('slug', 'la-ladera');                  // 16:00: the children are out of school
const b = await launch({ width: 960, height: 540 });
let code = 0; const fails = [];
const cm = (v) => (v * 100).toFixed(1) + ' cm';
try {
  const p = await b.open(`${slug}/index.html?${q}`);
  await p.eval('__ladera.step(300)');                                                       // five seconds of life

  // ---- A: all characters x all seats, on the real meshes
  const A = JSON.parse(await p.eval(`(async () => {
    const W = __ladera.ctx.people._world, lib = W.lib, THREE = await import('three'), legs = await import('./js/people/legs.js'), v = new THREE.Vector3(), rows = [];
    for (const id of lib.ids()) {
      const meta = lib.info(id);
      for (const [kind, sitH] of [['bench', 0.49], ['pew', 0.45], ['desk', 0.43]]) for (const clip of ['sit_idle', 'sit_phone']) {
        const it = lib.instantiate(id); lib.play(it, clip, { fade: 0, time: 0 }); it.mixer.update(0);
        it.root.position.set(0, (sitH - legs.SEAT_TOP) - (meta.seatRootDropM ?? 0), 0); it.root.updateMatrixWorld(true);
        const lowest = () => { it.root.updateMatrixWorld(true); it.mesh.skeleton.update(); let lo = 1e9; const pos = it.mesh.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { it.mesh.getVertexPosition(i, v); v.applyMatrix4(it.mesh.matrixWorld); if (v.y < lo) lo = v.y; } return lo; };
        const hips0 = it.bones.hips.getWorldPosition(new THREE.Vector3()), before = lowest(), left = legs.plantFeet(lib, it, 0), after = lowest(), hips1 = it.bones.hips.getWorldPosition(new THREE.Vector3());
        rows.push({ id, kind, clip, h: meta.heightM, before, after, left, hip: hips1.distanceTo(hips0), mb: legs.seatFloatM(meta, sitH), ma: legs.plantedFloatM(meta, sitH), budget: legs.floatBudget(meta) });
        it.mixer.stopAllAction(); it.mixer.uncacheRoot(it.obj);
      }
    }
    return JSON.stringify(rows);
  })()`));
  let worstAdult = -9, worstChild = -9, deepest = 9, worstModel = 0, floated = 0;
  for (const r of A) {
    const tag = `${r.id} on the ${r.kind} (${r.clip})`;
    if (r.after > r.budget + 0.003) fails.push(`A: ${tag}: soles ${cm(r.after)} above the floor, budget ${cm(r.budget)}`);
    if (r.after < -0.02) fails.push(`A: ${tag}: soles ${cm(-r.after)} in the floor`);
    if (r.hip > 1e-6) fails.push(`A: ${tag}: the pelvis moved ${r.hip} m`);
    if (Math.abs(r.before - r.mb) > 0.006) fails.push(`A: ${tag}: the model says ${cm(r.mb)} before planting, the mesh ${cm(r.before)}`);
    if (Math.abs(r.after - r.ma) > 0.006) fails.push(`A: ${tag}: the model says ${cm(r.ma)} after planting, the mesh ${cm(r.after)}`);
    worstModel = Math.max(worstModel, Math.abs(r.before - r.mb), Math.abs(r.after - r.ma)); deepest = Math.min(deepest, r.after);
    if (r.h < 1.4) worstChild = Math.max(worstChild, r.after); else worstAdult = Math.max(worstAdult, r.after);
    if (r.before > r.budget) floated++;
  }
  if (A.length !== 30 * 3 * 2) fails.push(`A: ${A.length} poses, expected ${30 * 3 * 2}`);
  if (floated < 60) fails.push(`A: only ${floated} of ${A.length} poses floated before planting: the check is not looking at the problem`);

  // ---- B: people sat on the benches by the brain, in the barrio
  const sample = JSON.parse(await p.eval(`(() => {
    const W = __ladera.ctx.people._world, perChar = new Map(), done = [], rank = (n) => (/^[bg]_/.test(n.charId) ? 0 : /^(w_elder|w_beata|m_elder|m_abuelo)$/.test(n.charId) ? 1 : 2);
    for (const n of [...W.npcs].sort((x, y) => rank(x) - rank(y))) {                          // children and elders first: they are the ones whose legs are short
      if (n.away || (perChar.get(n.charId) ?? 0) >= 2 || done.length >= 18) continue;
      if (W.brain.do_bench(n, { instant: true }) && n.sitH != null) { done.push({ id: n.id, char: n.charId, sitH: n.sitH }); perChar.set(n.charId, (perChar.get(n.charId) ?? 0) + 1); }
    }
    const outdoors = W.spots.list('bench').filter((s) => s.src === 'poi');
    return JSON.stringify({ done, benches: outdoors.length, usable: outdoors.filter((s) => !s.cut).length });
  })()`));
  const seated = sample.done;
  // The brain sits nobody on a bench it cannot walk to (spots.js screen), so the sample asked for is four in seven of the benches it can use: 8 of 14 now that world/courtside.js lays the way to the
  // court's three benches outside the fence (6 of 11 while it did not). Never fewer than four poses: a check that looks at nothing is no check.
  const need = Math.max(4, Math.floor(sample.usable * 4 / 7));
  if (seated.length < need) fails.push(`B: the brain seated only ${seated.length} people on benches (${need} wanted: ${sample.usable} of ${sample.benches} benches are usable)`);
  if (!seated.some((s) => /^[bg]_/.test(s.char))) fails.push(`B: no child among the people the brain seated (${seated.map((s) => s.char).join(' ')}): ${q} has them out of sight?`);
  if (!seated.some((s) => /^(w_elder|w_beata|m_elder|m_abuelo)$/.test(s.char))) fails.push(`B: no elder among the people the brain seated (${seated.map((s) => s.char).join(' ')})`);
  const rowsB = [];
  for (const s of seated) {
    const look = JSON.parse(await p.eval(`JSON.stringify(__ladera.lookAtNpc(${JSON.stringify(s.id)}, { dist: 2.4 }))`));
    await p.eval('__ladera.step(40)');                                                      // two thirds of a second: the clip has faded in and the mixer has run
    const m = JSON.parse(await p.eval(`(async () => {
      const L = __ladera, ctx = L.ctx, W = ctx.people._world, n = W.byId.get(${JSON.stringify(s.id)}), v = n.view, THREE = await import('three'), t = new THREE.Vector3();
      if (!v) return JSON.stringify({ noView: true });
      v.root.updateMatrixWorld(true); v.mesh.skeleton.update();
      let lo = 1e9, lx = 0, lz = 0; const pos = v.mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { v.mesh.getVertexPosition(i, t); t.applyMatrix4(v.mesh.matrixWorld); if (t.y < lo) { lo = t.y; lx = t.x; lz = t.z; } }
      const ground = ctx.physics.groundAt(lx, lz, n.st.y + 0.6);
      return JSON.stringify({ clip: n.clipName, seated: n.sitH != null, visible: n.visible, lo, ground, stY: n.st.y, floatM: n.floatM, h: v.meta.heightM, ry: n.ry });
    })()`));
    rowsB.push({ ...s, ...m, ok: look.ok });
  }
  let bWorst = -9, bWorstChild = -9;
  for (const r of rowsB) {
    const tag = `${r.id} (${r.char}) on the bench`;
    if (r.noView) { fails.push(`B: ${tag}: no view to measure (lookAtNpc ok=${r.ok})`); continue; }
    if (!r.visible || !r.seated || !/^sit/.test(r.clip ?? '')) { fails.push(`B: ${tag}: visible ${r.visible}, seated ${r.seated}, clip ${r.clip}`); continue; }
    const budget = r.h < 1.4 ? 0.10 : 0.05, fl = r.lo - r.ground;
    if (fl > budget + 0.01) fails.push(`B: ${tag}: soles ${cm(fl)} above the ground, budget ${cm(budget)}`);
    if (fl < -0.03) fails.push(`B: ${tag}: soles ${cm(-fl)} in the ground`);
    if (!Number.isFinite(r.floatM)) fails.push(`B: ${tag}: world.js recorded no float on the person (${r.floatM})`);
    else if (Math.abs(r.floatM - fl) > 0.02) fails.push(`B: ${tag}: world.js says ${cm(r.floatM)}, the mesh over the ground ${cm(fl)}`);
    if (r.h < 1.4) bWorstChild = Math.max(bWorstChild, fl); else bWorst = Math.max(bWorst, fl);
  }
  const standing = JSON.parse(await p.eval(`JSON.stringify(__ladera.ctx.people._world.npcs.filter((n) => n.sitH == null && n.view).slice(0, 6).map((n) => n.floatM))`));
  if (standing.some((f) => f != null)) fails.push(`B: a standing person has a float recorded: ${JSON.stringify(standing)}`);

  const sm = p.summary(); if (sm.errors.length || sm.consoleErrors.length || sm.consoleWarnings.length) fails.push(`console: ${JSON.stringify([...sm.errors, ...sm.consoleErrors, ...sm.consoleWarnings]).slice(0, 400)}`);
  console.log(JSON.stringify({
    q, poses: A.length, floatedBefore: floated, worstAdult: cm(worstAdult), worstChild: cm(worstChild), deepestSink: cm(-deepest), worstModelError: cm(worstModel),
    benches: `${sample.usable} usable of ${sample.benches}`, wanted: need, seatedInBarrio: rowsB.length, barrioWorstAdult: cm(bWorst), barrioWorstChild: cm(bWorstChild), chars: rowsB.map((r) => `${r.char} ${cm((r.lo ?? 0) - (r.ground ?? 0))}`), fails,
  }, null, 1));
  if (fails.length) code = 1;
} catch (e) { console.error(e); code = 1; }
await b.close();
process.exit(code);
