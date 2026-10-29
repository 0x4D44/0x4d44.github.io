// A2: the BUILT shell in Node (no GPU): sane meshes, a closed shell (rays from every room hit something), live door leaves and their events.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-build.test.mjs      (ARCH_LOTS=T00,T01 limits the shell test)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { testLots, planAll } from './arch-lib.mjs';
import { buildBuilding } from '../js/arch/index.js';
import { SWING_T } from '../js/arch/doors.js';

const lots = testLots();
const only = process.env.ARCH_LOTS ? process.env.ARCH_LOTS.split(',') : null;
// street 0.4 m under the sills with no plinth margin: the entry steps are built too
const { ctx, bps } = planAll(lots, undefined, true, 0.4, 0);
for (const bp of bps) buildBuilding(ctx, bp);
ctx.scene.updateMatrixWorld(true);

const extMeshes = (bp) => ctx.batch.groups.get(bp.id + '.ext').meshes;
const allMeshes = (bp) => {
  const out = [];
  for (const sfx of ['.ext', '.int']) ctx.batch.object(bp.id + sfx).traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
};

test('every building builds finite, bounded geometry: one mesh per material, sane triangle counts', () => {
  const problems = [];
  for (const bp of bps) {
    const g = ctx.batch.groups.get(bp.id + '.ext');
    if (!g || !g.meshes.length) { problems.push(`${bp.id}: no .ext meshes`); continue; }
    let tris = 0;
    const keys = new Set();
    for (const m of g.meshes) {
      const pos = m.geometry.attributes.position.array, idx = m.geometry.index;
      if (!idx) { problems.push(`${bp.id}: ${m.userData.matKey} has no index`); continue; }
      tris += idx.count / 3;
      for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) { problems.push(`${bp.id}: NaN in ${m.userData.matKey}`); break; }
      for (let i = 0; i < idx.count; i++) if (idx.array[i] >= pos.length / 3) { problems.push(`${bp.id}: index out of range in ${m.userData.matKey}`); break; }
      if (keys.has(m.userData.matKey)) problems.push(`${bp.id}: two meshes share material ${m.userData.matKey}`);
      keys.add(m.userData.matKey);
    }
    if (g.meshes.length > 26) problems.push(`${bp.id}: ${g.meshes.length} meshes (draw-call budget)`);
    if (tris < 100 || tris > 45000) problems.push(`${bp.id} (${bp.lot.kind}): ${tris} triangles`);
  }
  assert.deepEqual(problems, []);
});

/** Directions: a Fibonacci sphere plus the 14 axis/diagonal rays (the typical places for a gap: straight up, straight along a wall). */
function directions(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.399963229728653;
    out.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  for (const v of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]]) out.push(new THREE.Vector3(...v).normalize());
  // tilt the whole set by an irrational amount: a ray aimed exactly at a wall corner or a shared quad edge can slip between two triangles
  const e = new THREE.Euler(0.0713, 0.1371, 0.0293);
  return out.map((v) => v.applyEuler(e));
}

test('the shell is closed: a ray from inside any enclosed room always hits wall, floor, ceiling, glass or door leaf', { timeout: 300000 }, () => {
  const dirs = directions(26), rc = new THREE.Raycaster(), problems = [];
  rc.far = 120;
  for (const bp of bps) {
    if (only && !only.includes(bp.id)) continue;
    const meshes = allMeshes(bp);
    for (const m of meshes) { try { m.material.side = THREE.DoubleSide; } catch { /* plain object material */ } }
    let rays = 0, leaks = [];
    for (const r of bp.rooms) {
      if (r.outdoor) continue;
      if (bp.shell.openTop && r.floor >= bp.shell.F - 1) continue;           // obra negra: the open deck, its stair head and the sky above are open by design
      const cx = (r.rect.x0 + r.rect.x1) / 2, cz = (r.rect.z0 + r.rect.z1) / 2;
      // the stair cores are long and thin: sample their ends too
      const spots = [[cx, cz], [r.rect.x0 + 0.35, r.rect.z0 + 0.35], [r.rect.x1 - 0.35, r.rect.z1 - 0.35]];
      for (const [x, z] of spots) {
        const w = bp.frame.toWorld(x, r.y + 1.2, z), o = new THREE.Vector3(w[0], w[1], w[2]);
        for (const d of dirs) {
          if (bp.shell.openTop && d.y > 0 && (r.type === 'landing' || r.type === 'stairwell')) continue;     // the stair climbs into open sky
          rays++;
          rc.set(o, d);
          if (!rc.intersectObjects(meshes, false).length) {
            const far = [...Array(600).keys()].map((i) => bp.frame.toLocal(o.x + d.x * i * 0.1, o.y + d.y * i * 0.1, o.z + d.z * i * 0.1)).find((p) => p[0] < bp.shell.outer.x0 - 0.3 || p[0] > bp.shell.outer.x1 + 0.3 || p[2] < bp.shell.outer.z0 - 0.3 || p[2] > bp.shell.outer.z1 + 0.3 || p[1] > bp.shell.F * bp.shell.fh + 4);
            leaks.push(`${r.id} (${r.type}) from local ${x.toFixed(1)},${(r.y + 1.2).toFixed(1)},${z.toFixed(1)} dir ${d.x.toFixed(2)},${d.y.toFixed(2)},${d.z.toFixed(2)} leaves at ${far ? far.map((v) => v.toFixed(1)).join(',') : '?'}`);
          }
        }
      }
    }
    if (leaks.length) problems.push(`${bp.id} (${bp.lot.kind}): ${leaks.length}/${rays} rays escape, e.g. ${leaks[0]}`);
  }
  assert.deepEqual(problems, []);
});

test('door leaves: one per swing door and shutter, two aim targets each, E toggles the collider and the events', () => {
  const doors = bps.flatMap((bp) => bp.doors.filter((d) => d.kind !== 'arch'));
  assert.equal(ctx.archDoors.size, doors.length);
  const events = [];
  ctx.events.on('door:toggle', (e) => events.push(e));
  const swing = doors.find((d) => d.kind === 'exterior'), shutter = doors.find((d) => d.kind === 'shutter');
  assert.ok(swing && shutter, 'a swing door and a shutter exist in the test lots');
  for (const d of [swing, shutter]) {
    const out = ctx.interact.items.get(`door:${d.id}:out`), inn = ctx.interact.items.get(`door:${d.id}:in`);
    assert.ok(out && inn, `${d.id}: both targets registered`);
    assert.equal(out.kind, 'door');
    assert.equal(out.ignoreDoor, d.id);
    assert.ok(out.aim <= 0.5 && out.radius >= 2.4, 'generous aim');
    assert.match(out.prompt(), /^Abrir (puerta|persiana)$/);
    assert.equal(ctx.physics.doorOpen(d.id), false);
    out.use();
    assert.equal(ctx.physics.doorOpen(d.id), true, `${d.id}: collider opened by E`);
    assert.match(inn.prompt(), /^Cerrar (puerta|persiana)$/, 'prompt follows the state on both targets');
    const ev = events.at(-1);
    assert.deepEqual([ev.doorId, ev.open, ev.by], [d.id, true, 'player']);
    inn.use();
    assert.equal(ctx.physics.doorOpen(d.id), false, `${d.id}: closed again by E`);
  }
});

test('door leaves swing in 0.35 s, follow door:request from NPCs, and report when they settle', () => {
  const sys = ctx.systems.find((s) => s.name === 'arch-doors');
  assert.ok(sys, 'the arch-doors system is registered');
  const d = bps.flatMap((bp) => bp.doors).find((q) => q.kind === 'exterior'), st = ctx.archDoors.get(d.id);
  const events = [];
  ctx.events.on('door:toggle', (e) => { if (e.doorId === d.id) events.push(e); });
  const closedAngle = st.pivot.rotation.y;
  assert.equal(Math.abs(closedAngle - st.phi0) < 1e-9, true);
  ctx.events.emit('door:request', { doorId: d.id, open: true, by: 'npc' });
  assert.equal(ctx.physics.doorOpen(d.id), true, 'collider follows the request at once');
  assert.equal(events.length, 0, 'nothing reported while the leaf is still swinging');
  const dt = 1 / 60;
  let t = 0;
  for (; t < 1 && events.length === 0; t += dt) sys.fn(dt);
  assert.ok(t >= SWING_T - 2 * dt && t <= SWING_T + 3 * dt, `settled after ${t.toFixed(3)} s`);
  assert.deepEqual([events[0].open, events[0].by], [true, 'npc']);
  assert.ok(Math.abs(Math.abs(st.pivot.rotation.y - st.phi0) - Math.PI / 2) < 0.05, 'the leaf ends a quarter turn from the wall plane');
  ctx.events.emit('door:request', { doorId: d.id, open: true, by: 'npc' });
  sys.fn(dt);
  assert.equal(events.length, 1, 'a request for the state the door is already in is ignored');
  ctx.events.emit('door:request', { doorId: d.id, open: false, by: 'npc' });
  for (let i = 0; i < 40; i++) sys.fn(dt);
  assert.equal(events.at(-1).open, false);
  assert.ok(Math.abs(st.pivot.rotation.y - st.phi0) < 1e-6, 'closed leaf is back on the wall plane');
  // a collider flipped by anyone else (A4's navigation) swings the leaf too
  ctx.physics.setDoor(d.id, true);
  for (let i = 0; i < 40; i++) sys.fn(dt);
  assert.ok(Math.abs(Math.abs(st.pivot.rotation.y - st.phi0) - Math.PI / 2) < 0.05);
  ctx.physics.setDoor(d.id, false);
  for (let i = 0; i < 40; i++) sys.fn(dt);
});

test('walking into a closed swing door opens it after 0.25 s; sliding along it, standing, or a shutter does not', () => {
  const sys = ctx.systems.find((s) => s.name === 'arch-doors');
  const bp = bps.find((b) => b.doors.some((q) => q.kind === 'exterior' && q.floor === 0));
  const d = bp.doors.find((q) => q.kind === 'exterior' && q.floor === 0), st = ctx.archDoors.get(d.id), g = st.geo;
  const dt = 1 / 60;
  ctx.physics.setDoor(d.id, false);
  const ow = bp.frame.dir(-d.nx, -d.nz);                                    // world direction from the door to the street
  // a player standing 0.35 m in front of the door on its outer side, held by it: speed 0, velocity pressing into the door
  const into = { x: -ow[0], z: -ow[1] }, along = { x: g.tx, z: g.tz };
  const stand = (k) => ({ x: g.cx + ow[0] * 0.35 + g.tx * k, y: g.y, z: g.cz + ow[1] * 0.35 + g.tz * k });
  const player = (vel, speed) => ({ s: { ...stand(0), vy: 0, onGround: true, blocked: false }, vx: vel.x * 2.3, vz: vel.z * 2.3, speed, locked: false, yaw: 0 });
  const run = (p, secs) => { ctx.player = p; ctx.archPush = null; for (let t = 0; t < secs; t += dt) sys.fn(dt); };
  run(player(into, 0.4), 0.5);
  assert.equal(ctx.physics.doorOpen(d.id), false, 'a player still moving (speed 0.4 m/s) is not pushing');
  run(player(along, 0), 0.5);
  assert.equal(ctx.physics.doorOpen(d.id), false, 'pressing along the wall is not pushing into the door');
  run(player({ x: 0, z: 0 }, 0), 0.5);
  assert.equal(ctx.physics.doorOpen(d.id), false, 'standing still is not pushing');
  const off = player(into, 0); off.s = { ...off.s, ...stand(d.w / 2 + 0.4) };
  run(off, 0.5);
  assert.equal(ctx.physics.doorOpen(d.id), false, 'beside the opening is not pushing into the door');
  run(player(into, 0), 0.2);
  assert.equal(ctx.physics.doorOpen(d.id), false, 'not before 0.25 s');
  run(player(into, 0), 0.3);
  assert.equal(ctx.physics.doorOpen(d.id), true, 'held against the door for 0.25 s: it opens');
  ctx.physics.setDoor(d.id, false);
  for (let i = 0; i < 40; i++) sys.fn(dt);
  const sbp = bps.find((b) => b.doors.some((q) => q.kind === 'shutter')), sh = sbp.doors.find((q) => q.kind === 'shutter'), sg = ctx.archDoors.get(sh.id).geo;
  const sow = sbp.frame.dir(-sh.nx, -sh.nz);
  const sp = { s: { x: sg.cx + sow[0] * 0.35, y: sg.y, z: sg.cz + sow[1] * 0.35, vy: 0, onGround: true }, vx: -sow[0] * 2.3, vz: -sow[1] * 2.3, speed: 0, locked: false, yaw: 0 };
  run(sp, 1);
  assert.equal(ctx.physics.doorOpen(sh.id), false, 'a shop shutter does not give way to a shove');
  ctx.player = null;
});
