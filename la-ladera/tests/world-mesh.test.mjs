// The built world under node: terrain + retaining walls + every prop module (flora, poles, vehicles, dress, signs, hill, life) on plan P1.
// What it guards: a clean build, the discovery list (>= 24, the lead's gate), the closed perimeter, every nav edge walkable WITH the prop colliders,
// determinism, and a draw budget. Each check that can silently go vacuous has a TEETH test next to it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-mesh.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext } from '../js/core/ctx.js';
import { Physics, wallsRect } from '../js/core/physics.js';
import { CONFIG } from '../js/core/config.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { fitNav } from '../js/world/navfit.js';
import { settle } from '../js/world/discover.js';
import { FACE_DROP, cornerShape, guardTop } from '../js/world/walls.js';
import { towerPlan, TOWER } from '../js/world/tower.js';
import { vistaSites, farHouses, houseParts, houseFaces, windowCorners, LANE } from '../js/world/vista.js';
import { makeKit, SPAWN_FAN, inSpawnFan } from '../js/world/kit.js';
import { MeshBuilder } from '../js/core/mesh.js';
import { tube, card, V } from '../js/world/mk.js';
import { eucalyptus, agave, banana } from '../js/world/flora.js';
import { moto, bicycle, rubbish, SIZE } from '../js/world/vehicles.js';
import { lineQuad } from '../js/world/surfaces.js';
import { HALF } from '../js/world/field.js';
import { footprint, pointInPoly, project, gapBetween } from '../js/world/geom.js';
import { lotWalls, walk, badAttributes, wedgeStats, fieldGrid, SEED } from './world-lib.mjs';

async function build(seed = SEED, glow = null) {
  const ctx = createContext({ seed, headless: true });
  ctx.plan = generatePlan(ctx);
  ctx.physics.setTerrain(ctx.plan.heightAt);
  if (glow) ctx.glow = glow;                                       // the engine's glow registry, which headless contexts do not have: a recorder
  await buildWorld(ctx);
  await buildProps(ctx);
  ctx.batch.flushAll();
  return ctx;
}
const glowLog = { list: [], add(g) { this.list.push(g); return g; } };
const A = await build(SEED, glowLog), B = await build();
const W = A.world, plan = A.plan;

/** Real kernel over the plan: terrain, the lot blocks the shells will add, and every collider the world and the props built (optionally minus some ids). */
function physicsOf(ctx, { skip = [] } = {}) {
  const ph = new Physics();
  ph.setTerrain(ctx.plan.heightAt);
  ph.addWalls(lotWalls(ctx.plan));
  for (const w of ctx.physics.walls) if (!skip.includes(w.id)) ph.addWall(w);
  return ph;
}
const pushedBy = (ph, x, z, y = plan.heightAt(x, z)) => {
  const s = { x, y, z, vy: 0, onGround: true };
  ph.move(s, 0.001, 0, 1 / 60);
  return Math.hypot(s.x - x, s.z - z);
};

test('the build is clean: no module error, no unknown material, every group flushed', () => {
  assert.deepEqual(A.errors, []);
  assert.equal(A.matlib?.missing?.size ?? 0, 0, `unknown materials: ${[...(A.matlib?.missing ?? [])].join(', ')}`);
  for (const k of ['signs', 'hill', 'life', 'poles', 'flora', 'dress', 'vehicles', 'boundary', 'vista', 'murals', 'arrival']) assert.ok(k in (W.propTimes ?? {}), `props step ${k} ran`);
  const order = Object.keys(W.propTimes);                              // the paintings' street ground is claimed before anything is parked, planted or stood on it
  for (const later of ['poles', 'vehicles', 'dress', 'signs', 'flora']) assert.ok(order.indexOf('murals') < order.indexOf(later) && order.indexOf('arrival') < order.indexOf(later), `the murals and the arrival fan are claimed before ${later}: ${order.join(' ')}`);
});

test('no mesh of the world has a NaN or infinite position, normal, uv or colour (one NaN normal under a cart umbrella blanked three quarters of every aerial view through the bloom blur)', () => {
  assert.deepEqual(badAttributes(A.scene), []);
  const T = A.THREE, g = new T.BufferGeometry(), root = new T.Group();       // TEETH: the check does see a poisoned normal
  g.setAttribute('position', new T.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  g.setAttribute('normal', new T.BufferAttribute(new Float32Array([0, 0, 1, NaN, NaN, NaN, 0, 0, 1]), 3));
  root.add(new T.Mesh(g)); root.children[0].name = 'poisoned';
  assert.equal(badAttributes(root).length, 1);
});

const REQUIRED = [
  'cruz', 'mirador', 'telescopio', 'telefono', 'virgen', 'escalinata', 'cancha', 'parada', 'faroles', 'almendros', 'capilla', 'eucaliptos', 'cables', 'carrito',   // the first 14
  'condor', 'fiesta', 'cerro', 'arco', 'placas', 'rayuela',                                                                                                  // signs.js
  'huerta', 'espantapajaros', 'cruzcamino',                                                                                                                   // hill.js
  'palomas', 'perro', 'guardian', 'gallinas', 'columpio', 'cometa', 'balon', 'soldadura',                                                                    // life.js
];

test('discoveries: at least 24 (the lead\'s gate), each with Spanish name, English line, valid kind and a spot inside the plot', () => {
  const items = [...A.discover.items.values()];
  assert.ok(items.length >= 24, `${items.length} discoveries registered, the gate is 24`);
  assert.equal(new Set(items.map((d) => d.id)).size, items.length, 'ids are unique');
  const KINDS = ['vista', 'mirador', 'shrine', 'object', 'story', 'nature', 'mural', 'hidden'], bad = [];
  for (const d of items) {
    if (!d.name || !d.en || d.name === d.en || d.en.length < 25) bad.push(`${d.id}: needs a Spanish name and an English line`);
    if (!KINDS.includes(d.kind)) bad.push(`${d.id}: kind ${d.kind}`);
    if (![d.x, d.y, d.z, d.radius].every(Number.isFinite) || Math.abs(d.x) > HALF - 1 || Math.abs(d.z) > HALF - 1) bad.push(`${d.id}: bad position ${d.x},${d.z}`);
    else if (Math.abs(d.y - plan.heightAt(d.x, d.z) - (d.id === 'w.torre' ? TOWER.deck : 0)) > 4.5) bad.push(`${d.id}: y ${d.y} is ${(d.y - plan.heightAt(d.x, d.z)).toFixed(1)} m from the ground`);   // (the tower's deck stands one tower high)
  }
  assert.deepEqual(bad, []);
  const have = new Set(items.map((d) => d.id));
  assert.deepEqual(REQUIRED.filter((id) => !have.has('w.' + id)), [], 'every planned discovery exists');
});

test('discoveries the world placed itself stand on free ground: outside every lot, not inside a collider', () => {
  const ph = physicsOf(A), fps = plan.lots.map((l) => footprint(l, 0.1)), bad = [];
  for (const d of W.extra) {
    const id = 'w.' + d.id, it = A.discover.items.get(id);
    if (!it) { bad.push(`${id} was not registered`); continue; }
    if (fps.some((f) => pointInPoly(f, it.x, it.z))) bad.push(`${id} lies inside a lot`);
    const p = pushedBy(ph, it.x, it.z, it.y);
    if (p > 0.2) bad.push(`${id} at ${it.x},${it.z} is pushed ${p.toFixed(2)} m by a collider`);
  }
  assert.deepEqual(bad, []);
});

test('TEETH: a point on a lot wall counts as "pushed by a collider"', () => {
  const lot = plan.lots[3], x = lot.x + (lot.d / 2) * Math.sin(lot.rotY), z = lot.z + (lot.d / 2) * Math.cos(lot.rotY);
  assert.ok(pushedBy(physicsOf(A), x, z, plan.heightAt(x, z) + 0.3) > 0.2);
});

test('the signage and the living props all got a place (counts, not just "no error")', () => {
  assert.equal(W.signs.murals, 3, 'three murals on straight tall walls');
  assert.equal(W.signs.boards, 2, 'both faces of the gate arch');
  assert.ok(W.signs.plaques >= 12, `${W.signs.plaques} of ${plan.streets.length} street plaques`);
  assert.equal(W.signs.hopscotch, 1);
  assert.ok(W.hill.beds === 4 && W.hill.rocks >= 40 && W.hill.cross === 1 && W.hill.lines >= 1, JSON.stringify(W.hill));
  assert.deepEqual(W.life, { pigeons: 7, crows: 3, dogs: 2, hens: 6, swing: 1, kite: 1, ball: 1, welding: 1 });
  assert.ok(W.huerta && W.scarecrow && W.roadCross && W.henPen && W.hopscotch, 'features recorded for the people / tests');
  assert.ok(W.vehicles.busetas === 1 && W.vehicleList.some((v) => v.kind === 'buseta'), 'the buseta found a stretch of road (the bus-stop story needs one)');
  assert.ok(W.vehicles.cars >= 5 && W.vehicles.motos >= 20 && W.vehicles.carts >= 1, JSON.stringify(W.vehicles));
});

test('narrow colliders are solid: a walker 7 cm inside a parked moto or bike walks out, and the kit draws such a prop as ONE thick wall, never a hollow ring (TEETH: a ring of tall walls holds the same walker, a wide rectangle keeps its ring)', () => {
  const walkOut = (ph, x, z, y, dx, dz) => { const s = { x, y, z, vy: 0, onGround: true }; for (let i = 0; i < 60; i++) ph.move(s, dx * 0.038, dz * 0.038, 1 / 60); return Math.hypot(s.x - x, s.z - z); };
  const small = W.vehicleList.filter((v) => v.kind === 'moto' || v.kind === 'bike'), ph = physicsOf(A), trapped = [];
  assert.ok(small.length >= 25, `${small.length} motos and bikes`);
  for (const v of small) {
    const lx = Math.cos(v.ry), lz = -Math.sin(v.ry), half = (v.kind === 'moto' ? 0.62 : 0.5) / 2 - 0.07, y = plan.heightAt(v.x, v.z);       // local x is the narrow side
    const best = Math.max(...[1, -1].map((side) => walkOut(ph, v.x + lx * half * side, v.z + lz * half * side, y, lx * side, lz * side)));
    if (best < 0.3) trapped.push(`${v.kind} at ${v.x},${v.z}`);
  }
  assert.deepEqual(trapped, []);
  // The kernel now puts a walker that stands inside ANY wall zone straight out (A1's _escape), so the old four-wall moto outline no longer holds anyone and the walk-out
  // above cannot tell the two shapes apart; what it can still catch is a kernel or collider regression. The shape itself is asserted directly, and the probe is shown able to fail.
  const at = (build) => { const P = new Physics(); P.setTerrain(() => 0); build(P); return P; };
  const ring = (top) => at((P) => P.addWalls(wallsRect(0, 0, 0.62, 1.95, 0, -0.4, top, 0.05, { id: 'prop' })));
  const kitRect = (w, d) => at((P) => makeKit({ physics: P }, { heightAt: () => 0 }, null).rect(0, 0, w, d, 0, 1.0, 0));
  assert.ok(walkOut(ring(2.5), 0.24, 0, 0, 1, 0) < 0.1, 'TEETH: a ring of walls no kernel crosses (2.5 m) holds the walker, so the walk-out probe can fail');
  assert.equal(kitRect(0.62, 1.95).stats().walls, 1, 'a moto is ONE thick wall (a stadium)');
  assert.equal(kitRect(0.5, 1.7).stats().walls, 1, 'so is a bike');
  assert.equal(kitRect(1.2, 1.95).stats().walls, 4, 'TEETH: a wider rectangle (a kiosk) keeps its four-wall outline, so the count above can fail');
  assert.ok(walkOut(kitRect(0.62, 1.95), 0.24, 0, 0, 1, 0) > 0.3, 'the solid collider lets the walker out');
});

test('cars, taxis and the buseta are solid blocks: nothing stands free inside one (TEETH: the four-wall outline leaves its middle open, and a taxi parked below a slope held a walker there for good)', () => {
  const big = W.vehicleList.filter((v) => v.kind === 'car' || v.kind === 'taxi' || v.kind === 'buseta'), ph = physicsOf(A);
  assert.ok(big.length >= 7 && big.some((v) => v.kind === 'buseta') && big.some((v) => v.kind === 'taxi'), `${big.length} cars, taxis and busetas`);
  const free = big.filter((v) => pushedBy(ph, v.x, v.z) < 0.5).map((v) => `${v.kind} at ${v.x},${v.z}`);
  assert.deepEqual(free, [], 'a walker put in the middle of a parked vehicle is pushed out');
  const old = new Physics(), now = new Physics();                                          // the same outline both ways, on flat ground
  old.setTerrain(() => 0); now.setTerrain(() => 0);
  old.addWalls(wallsRect(0, 0, 1.75, 3.9, 0.6, -0.4, 1.5, 0.05, { id: 'prop' }));
  makeKit({ physics: now }, { heightAt: () => 0 }, null).rect(0, 0, 1.75, 3.9, 0.6, 1.5, 0, 0.05, true);
  assert.ok(pushedBy(old, 0, 0, 0) < 0.1, 'TEETH: the old outline leaves the middle of the car free');
  assert.ok(pushedBy(now, 0, 0, 0) > 0.5, 'the solid block pushes a walker out of the middle');
});

test('the arrival view: no prop in the 5 m x 60 degree cone ahead of the spawn, no vehicle, bin or sack in the fan the first frame shows, and the first frame has a dog asleep and a washing line (TEETH: a moto two metres ahead is found, and without the claim the first world had one)', () => {
  const sp = plan.spawn, fanOf = (depth, deg) => ({ depth, half: (deg * Math.PI) / 180 }), SZ = { ...SIZE, taxi: SIZE.car, rubbish: [0.5, 0.5], cylinders: [0.6, 0.6] };
  const found = (world, walls, fan) => {                                    // what of the props stands in the fan: vehicles and clutter by footprint, colliders by their segment
    const out = [];
    for (const v of world.vehicleList) {
      const [w, d] = SZ[v.kind] ?? [1, 1], c = Math.cos(v.ry), s = Math.sin(v.ry);
      const hit = [-w / 2, 0, w / 2].some((lx) => [-d / 2, -d / 4, 0, d / 4, d / 2].some((lz) => inSpawnFan(plan, v.x + lx * c + lz * s, v.z - lx * s + lz * c, 0, fan)));
      if (hit) out.push(`${v.kind} at ${v.x},${v.z}`);
    }
    for (const w of walls) {
      if (w.id !== 'prop') continue;
      const n = Math.max(1, Math.ceil(Math.hypot(w.x2 - w.x1, w.z2 - w.z1) / 0.25));
      for (let i = 0; i <= n; i++) if (inSpawnFan(plan, w.x1 + ((w.x2 - w.x1) * i) / n, w.z1 + ((w.z2 - w.z1) * i) / n, w.t, fan)) { out.push(`prop collider at ${w.x1.toFixed(1)},${w.z1.toFixed(1)}`); break; }
    }
    return out;
  };
  assert.deepEqual(found(W, A.physics.walls, fanOf(5, 30)), [], 'a 5 m cone of 60 degrees ahead of the spawn is free of props');
  assert.deepEqual(found(W, [], SPAWN_FAN), [], 'no vehicle, bin, sack, cylinder or cart stands in the whole fan the world keeps clear (the sleeping dog is the one thing that may)');
  assert.ok(W.arrivalClaims >= 40, `${W.arrivalClaims} discs taken`);
  const ahead = { vehicleList: [{ kind: 'moto', x: sp.x, z: sp.z - 2.5, ry: 1.6 }] };
  assert.equal(found(ahead, [], fanOf(5, 30)).length, 1, 'TEETH: a moto two and a half metres ahead is found');
  assert.equal(found({ vehicleList: [] }, [{ id: 'prop', x1: sp.x, z1: sp.z - 3, x2: sp.x + 0.5, z2: sp.z - 3, t: 0.3 }], fanOf(5, 30)).length, 1, 'TEETH: so is a collider');
  const dog = A.discover.items.get('w.perro');
  assert.ok(dog && inSpawnFan(plan, dog.x, dog.z, 0) && Math.hypot(dog.x - sp.x, dog.z - sp.z) >= 5.5, 'a dog sleeps in the view, at least 5.5 m up the street');
  assert.ok(W.poles.heroLines >= 1, 'a washing line hangs across the Paseo in the first frame');
});

test('street detail: trench patches, manhole covers and gratings along the streets with a pavement, none across the mouth of a path or a side street (TEETH: the check finds one dropped in a mouth)', () => {
  const D = W.streetDetail, mouth = (it, m) => (plan._joiners.get(it.st) ?? []).some((j) => project(j._d.pts, j._d.cum, it.x, it.z).d <= j.width / 2 + m);
  assert.ok(D && D.patches.length >= 8 && D.manholes.length >= 5 && D.gratings.length >= 4, `${D?.patches.length} patches, ${D?.manholes.length} manholes, ${D?.gratings.length} gratings`);
  const streets = new Set(plan.streets.filter((s) => s.sidewalk).map((s) => s.id));
  for (const kind of ['patches', 'manholes', 'gratings']) {
    assert.ok(D[kind].every((it) => streets.has(it.st)), `${kind}: only on a street or road with a pavement`);
    assert.deepEqual(D[kind].filter((it) => mouth(it, 1.0)), [], `${kind}: none across a mouth`);
  }
  const s2 = plan.streets.find((s) => s.id === 'S2'), at = { st: 'S2', x: -6.5, z: s2._d.pts[0][1] };         // the Paseo opens onto the Comercio at x = -6.5
  assert.ok(mouth(at, 1.0), 'TEETH: a cover set down in the mouth of the Paseo is flagged');
  for (const kind of ['patches', 'manholes', 'gratings']) assert.ok(D[kind].some((it) => it.st === 'S2' && inSpawnFan(plan, it.x, it.z, 0)), `${kind}: the carriageway in the first frame is worked`);
});

const rimGap = (h) => Math.max(Math.abs(h.x) - HALF, Math.abs(h.z) - HALF);
const onRoad = (h) => h.z > HALF - 3 && project(plan._far.road.pts, plan._far.road.cum, h.x, h.z).d < 16;

test('vista: the far land has its houses (clear of the rim and of the road that leaves), a church, four towers, a TV mast, and one glow per lit window and beacon', () => {
  const V = W.vista, sites = vistaSites(plan), houses = farHouses(plan);
  assert.ok(V.houses === houses.length && V.houses >= 900 && V.houses <= 2600, `${V.houses} far houses`);
  assert.deepEqual([V.towers, V.church], [4, 1]);
  const bad = [];
  for (const h of houses) {
    if (rimGap(h) < 12) bad.push(`house ${h.x.toFixed(0)},${h.z.toFixed(0)} is ${rimGap(h).toFixed(1)} m from the rim`);
    if (onRoad(h)) bad.push(`house ${h.x.toFixed(0)},${h.z.toFixed(0)} stands on the road`);
    if (!([h.x, h.y, h.z, h.w, h.d, h.h, h.ry].every(Number.isFinite) && h.h >= 3 && h.w >= 5 && h.d >= 5)) bad.push(`bad house ${JSON.stringify(h)}`);
  }
  assert.deepEqual(bad.slice(0, 5), []);
  for (const s of [sites.church, ...sites.towers]) assert.equal(houses.filter((h) => Math.hypot(h.x - s.x, h.z - s.z) < s.r).length, 0, `the landmark at ${s.x.toFixed(0)},${s.z.toFixed(0)} keeps its ground`);
  const lights = glowLog.list.filter((g) => g.src !== 'edgewall'), beacons = lights.filter((g) => g.blink > 0);      // the lit windows of the rim's houses (edgewall.js) are not the vista's
  assert.equal(lights.length, V.lights, 'every light of the vista reached ctx.glow');
  assert.equal(beacons.length, 3);
  assert.ok(beacons.every((g) => g.color === 0xff2418 && g.size >= 8 && g.x === V.mast.x && g.z === V.mast.z) && new Set(beacons.map((g) => g.y)).size === 3, 'three red beacons up the mast');
  assert.ok(lights.every((g) => [g.x, g.y, g.z, g.size, g.intensity].every(Number.isFinite) && (g.blink > 0 || (g.on >= 0 && g.on <= 1))), 'every light is a finite point with a dusk order');
  assert.ok(lights.length - beacons.length >= 800, `${lights.length - beacons.length} lit windows`);
  let meshes = 0; A.scene.traverse((o) => { if (o.isMesh && o.name.startsWith('world.vista:')) { meshes++; assert.equal(o.castShadow, false, `${o.name} casts no shadow`); } });
  assert.ok(meshes >= 5 && meshes <= 14, `${meshes} vista meshes: one per material`);
});

test('vista: wherever the built-up map says "build", the rim margin and the road clearance still hold (TEETH: without them houses reach the wall and the road)', () => {
  const flat = { density: () => 1, max: 1e6 }, every = farHouses(plan, flat), loose = farHouses(plan, { ...flat, margin: 0, roadClear: 0 });
  assert.ok(every.length > 2600, `${every.length} houses on a map that is built up everywhere`);
  assert.equal(every.filter((h) => rimGap(h) < 12 || onRoad(h)).length, 0);
  assert.ok(loose.some((h) => rimGap(h) < 12) && loose.some(onRoad), 'the checks above can fail');
});

/** Everything wrong with the windows, doors and roof items of one far house; [] when it is all on its walls and its roof. */
function partsProblems(h, p, far) {
  const out = [], faces = houseFaces(h), top = h.y + h.h, tag = `house ${h.x.toFixed(0)},${h.z.toFixed(0)}`;
  const hw = (h.w + 0.3) / 2, hd = (h.d + 0.3) / 2, roof = top + 0.245;
  const quads = [...p.windows.map((w) => ({ ...w, kind: 'window' })), ...p.doors.map((w) => ({ ...w, kind: 'door' }))];
  for (const q of quads) {
    const f = faces[q.face];
    if (!f || q.nx !== f.nx || q.nz !== f.nz) { out.push(`${tag}: a ${q.kind} faces the wrong way for face ${q.face}`); continue; }
    if ((q.face === 1 && h.party?.right) || (q.face === 3 && h.party?.left)) out.push(`${tag}: a ${q.kind} on a party wall (face ${q.face})`);
    const dx = q.x - h.x, dz = q.z - h.z, off = dx * f.nx + dz * f.nz - f.half, along = dx * f.tx + dz * f.tz, ground = far(q.x + q.nx * 0.5, q.z + q.nz * 0.5), bottom = q.y - q.h / 2;
    if (Math.abs(off - 0.04) > 0.002) out.push(`${tag}: a ${q.kind} stands ${off.toFixed(3)} m off face ${q.face}`);
    if (Math.abs(along) > f.len / 2 - 0.3) out.push(`${tag}: a ${q.kind} reaches the corner of face ${q.face}`);
    if (q.kind === 'window' && bottom < ground + 0.25 - 1e-6) out.push(`${tag}: a window is buried by the slope`);
    if (q.kind === 'door' && Math.abs(bottom - ground) > 0.5 + 1e-6) out.push(`${tag}: a door ${(bottom - ground).toFixed(2)} m from the ground`);
    if (q.y + q.h / 2 > top - 0.25 + 1e-6) out.push(`${tag}: a ${q.kind} reaches the roof`);
    const [A0, B0, C0, D0] = windowCorners(q), u = [0, 1, 2].map((k) => C0[k] - A0[k]), v = [0, 1, 2].map((k) => D0[k] - B0[k]);          // the normal MeshBuilder.quad derives
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if ((n[0] * q.nx + n[2] * q.nz) / (Math.hypot(...n) || 1) < 0.99) out.push(`${tag}: a ${q.kind} is wound to face into the house`);
  }
  for (let i = 0; i < quads.length; i++) for (let j = i + 1; j < quads.length; j++) {
    const a = quads[i], b = quads[j];
    if (a.face !== b.face || Math.abs(a.y - b.y) >= (a.h + b.h) / 2) continue;                                    // other wall, or another storey
    const f = faces[a.face], ua = (a.x - h.x) * f.tx + (a.z - h.z) * f.tz, ub = (b.x - h.x) * f.tx + (b.z - h.z) * f.tz;
    if (Math.abs(ua - ub) < (a.w + b.w) / 2 + 0.15) out.push(`${tag}: two openings overlap on face ${a.face}`);
  }
  for (const q of p.boxes) {
    if (Math.abs(q.lx) + q.sx / 2 > hw + 1e-6 || Math.abs(q.lz) + q.sz / 2 > hd + 1e-6) out.push(`${tag}: a roof box (${q.mat}) hangs over the edge`);
    if (q.y < roof || q.y > roof + 0.01 || q.sy > 3) out.push(`${tag}: a roof box is not standing on the roof (y ${q.y.toFixed(2)}, roof ${roof.toFixed(2)})`);
    if (q.sy === 0.5 && Math.abs(q.lx) > hw - 0.2 && (q.lx > 0 ? h.party?.right : h.party?.left)) out.push(`${tag}: a parapet stands on a party side, over the neighbour's roof`);
  }
  for (const t of p.tanks) if (Math.abs(t.lx) + t.r > hw + 1e-6 || Math.abs(t.lz) + t.r > hd + 1e-6 || t.y < roof || t.y > roof + 0.01) out.push(`${tag}: a tank is off the roof`);
  return out;
}

test('vista: the near far-houses are dressed: windows and doors on their walls, a tank, a stair hut, a parapet or rebar on the roof; every one on its face, above the ground, facing out, none overlapping, none beyond 200 m (TEETH: a window off its wall, buried, reversed or overlapping is found)', () => {
  const houses = farHouses(plan), far = plan._far, V = W.vista, bad = [];
  let windows = 0, doors = 0, items = 0, near = 0, nearDressed = 0, lit = 0;
  for (const h of houses) {
    const p = houseParts(plan, h, far), gapOf = Math.max(Math.abs(h.x), Math.abs(h.z)) - HALF;
    bad.push(...partsProblems(h, p, far));
    windows += p.windows.length; doors += p.doors.length; items += p.boxes.length + p.tanks.length;
    if (gapOf > 200) assert.equal(p.windows.length + p.doors.length + p.boxes.length + p.tanks.length, 0, 'beyond 200 m from the rim nothing is added');
    if (gapOf < 120) { near++; if (p.windows.length >= 3) nearDressed++; }
    if (p.windows.length) lit++;
  }
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} problems`);
  assert.ok(near > 100 && nearDressed >= 0.9 * near, `${nearDressed} of ${near} houses within 120 m of the rim wear 3 windows or more`);
  assert.ok(windows > 5000 && doors > 250 && items > 800 && lit > 350, `${windows} windows, ${doors} doors, ${items} roof items on ${lit} houses`);
  assert.deepEqual([V.windows, V.doors, V.roofItems], [windows, doors, items], 'the build drew what the pure function says');
  assert.deepEqual([B.world.vista.windows, B.world.vista.doors, B.world.vista.roofItems], [V.windows, V.doors, V.roofItems], 'a second build of the seed dresses the houses the same');
  let glass = null; A.scene.traverse((o) => { if (o.isMesh && o.name === 'world.vista:glass_dark') glass = o; });
  assert.ok(glass && glass.geometry.index.count / 3 >= 2 * windows, `the glass mesh holds ${glass && glass.geometry.index.count / 3} triangles for ${windows} windows`);
  // TEETH: the check does see each fault
  const h0 = houses.find((h) => houseParts(plan, h, far).windows.length > 8 && houseParts(plan, h, far).doors.length), p0 = houseParts(plan, h0, far), f0 = houseFaces(h0)[p0.windows[0].face];
  const moved = { ...p0, windows: [{ ...p0.windows[0], x: p0.windows[0].x + f0.nx * 1.0, z: p0.windows[0].z + f0.nz * 1.0 }, ...p0.windows.slice(1)] };
  assert.ok(partsProblems(h0, moved, far).some((m) => /off face/.test(m)), 'TEETH: a window a metre off its wall');
  const sunk = { ...p0, windows: [{ ...p0.windows[0], y: far(p0.windows[0].x, p0.windows[0].z) - 2 }, ...p0.windows.slice(1)] };
  assert.ok(partsProblems(h0, sunk, far).some((m) => /buried/.test(m)), 'TEETH: a window under the ground');
  const turned = { ...p0, windows: [{ ...p0.windows[0], nx: -p0.windows[0].nx, nz: -p0.windows[0].nz }, ...p0.windows.slice(1)] };
  assert.ok(partsProblems(h0, turned, far).some((m) => /wrong way/.test(m)), 'TEETH: a window on the wrong side');
  const twin = { ...p0, windows: [...p0.windows, { ...p0.windows[0] }] };
  assert.ok(partsProblems(h0, twin, far).some((m) => /overlap/.test(m)), 'TEETH: two windows on one spot');
  const floating = { ...p0, boxes: [{ mat: 'plaster_rough', lx: 0, lz: 0, y: h0.y + h0.h + 4, sx: 1, sy: 1, sz: 1, col: [1, 1, 1] }] };
  assert.ok(partsProblems(h0, floating, far).some((m) => /not standing on the roof/.test(m)), 'TEETH: a roof box in the air');
  const hp = houses.find((h) => h.party.right && h.party.left), open = { ...hp, party: { left: false, right: false } };
  assert.ok(partsProblems(hp, houseParts(plan, open, far), far).some((m) => /party wall/.test(m)), 'TEETH: a house dressed as if it stood alone has windows on its party walls');
  const alone = (h) => ({ ...h, party: { left: false, right: false } }), hq = houses.find((h) => houseParts(plan, alone(h), far).boxes.some((q) => q.sy === 0.5 && Math.abs(q.lx) > (h.w + 0.3) / 2 - 0.2 && (q.lx > 0 ? h.party.right : h.party.left)));
  assert.ok(hq && partsProblems(hq, houseParts(plan, alone(hq), far), far).some((m) => /parapet stands on a party side/.test(m)), 'TEETH: a flat roof dressed as if it stood alone has a parapet over the neighbour');
});

/** Everything wrong with the rows of far houses: not touching, not on one contour, turning too fast, party flags, overlapping another row, or standing in another row's lane. */
function rowProblems(rows, far) {
  const out = [], tag = (h) => `house ${h.x.toFixed(0)},${h.z.toFixed(0)}`, feet = (h) => footprint({ x: h.x, z: h.z, rotY: h.ry, w: h.w, d: h.d });
  for (const r of rows) r.forEach((h, k) => {
    if (h.party.left !== (k > 0) || h.party.right !== (k < r.length - 1)) out.push(`${tag(h)}: party flags ${JSON.stringify(h.party)} at place ${k} of ${r.length}`);
    if (k === 0) return;
    const p = r[k - 1], dx = h.x - p.x, dz = h.z - p.z, along = dx * Math.cos(p.ry) - dz * Math.sin(p.ry), across = dx * Math.sin(p.ry) + dz * Math.cos(p.ry);
    if (Math.abs(along - (p.w + h.w) / 2) > 0.02) out.push(`${tag(h)}: ${along.toFixed(2)} m along the row from the last house, which is ${((p.w + h.w) / 2).toFixed(2)} m wide to its middle`);
    if (Math.abs(across) > 3.2) out.push(`${tag(h)}: ${across.toFixed(1)} m off the line of the row`);
    if (Math.abs(far(h.x, h.z) - far(r[0].x, r[0].z)) > 2.2) out.push(`${tag(h)}: ${Math.abs(far(h.x, h.z) - far(r[0].x, r[0].z)).toFixed(1)} m above or below the contour of its row`);
    if (h.d !== p.d || Math.abs(Math.atan2(Math.sin(h.ry - p.ry), Math.cos(h.ry - p.ry))) > 0.02) out.push(`${tag(h)}: another depth or turned ${(h.ry - p.ry).toFixed(2)} rad from the last house`);
    const apart = gapBetween(feet(p), feet(h));
    if (apart > 0.05) out.push(`${tag(h)}: ${apart.toFixed(2)} m clear of the house before it, not wall to wall`);
  });
  const all = rows.flat(), fp = all.map(feet);
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
    const A = all[a], B = all[b];
    if (A.row === B.row || Math.hypot(A.x - B.x, A.z - B.z) > 40) continue;
    if (gapBetween(fp[a], fp[b]) <= 0) out.push(`${tag(A)} overlaps ${tag(B)} of another row`);
    for (const [H, G, g] of [[A, B, fp[b]], [B, A, fp[a]]]) {                                    // the lane in front of H: nobody else's wall stands in it
      const c = Math.cos(H.ry), s = Math.sin(H.ry);
      for (const lx of [-H.w / 4, H.w / 4]) { const lz = H.d / 2 + LANE / 2; if (pointInPoly(g, H.x + lx * c + lz * s, H.z - lx * s + lz * c)) out.push(`${tag(G)} stands in the lane of ${tag(H)}`); }
    }
  }
  return out;
}

test('vista: the far houses stand in rows that follow the contours, wall to wall, a lane in front of each row, none alone, the floors varying along a row (R1-D15, "dice thrown on a lawn"; TEETH: a house off its row, a row of two, a house over a lane, a house with the wrong party flags are found)', () => {
  const houses = farHouses(plan), far = plan._far, byRow = new Map();
  for (const h of houses) (byRow.get(h.row) ?? byRow.set(h.row, []).get(h.row)).push(h);
  const rows = [...byRow.values()].map((r) => r.sort((a, b) => a.k - b.k));
  assert.ok(rows.length >= 150 && Math.min(...rows.map((r) => r.length)) >= 3, `${rows.length} rows, the shortest of ${Math.min(...rows.map((r) => r.length))} houses`);
  assert.ok(houses.filter((h) => h.party.left || h.party.right).length === houses.length, 'every house shares a wall with a neighbour');
  const bad = rowProblems(rows, far);
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} problems`);
  const varied = rows.filter((r) => new Set(r.map((h) => h.floors)).size >= 2).length;
  assert.ok(varied >= 0.6 * rows.length, `${varied} of ${rows.length} rows have more than one height`);
  const mean = rows.reduce((m, r) => m + r.length, 0) / rows.length;
  assert.ok(mean >= 4 && mean <= 9, `${mean.toFixed(1)} houses to a row`);
  // TEETH: the check sees each fault
  const r0 = rows.find((r) => r.length >= 4), moved = r0.map((h, k) => (k === 1 ? { ...h, x: h.x + 12 * Math.cos(h.ry), z: h.z - 12 * Math.sin(h.ry) } : h));
  assert.ok(rowProblems([moved], far).some((m) => /along the row/.test(m)), 'TEETH: a house twelve metres off its row');
  assert.ok(rowProblems([r0.map((h, k) => (k === 2 ? { ...h, z: h.z + 6 * Math.cos(h.ry), x: h.x + 6 * Math.sin(h.ry) } : h))], far).some((m) => /off the line/.test(m)), 'TEETH: a house stepped six metres downhill');
  assert.ok(rowProblems([r0.map((h, k) => ({ ...h, party: { left: false, right: false } }))], far).some((m) => /party flags/.test(m)), 'TEETH: a row whose houses do not share walls');
  const other = rows.find((r) => r !== r0 && r.length >= 3), H = other[1], c = Math.cos(H.ry), s = Math.sin(H.ry), lz = H.d / 2 + LANE / 2;
  const intruder = { ...r0[1], row: 'x', k: 0, x: H.x + lz * s, z: H.z + lz * c, ry: H.ry, party: { left: false, right: false } };
  assert.ok(rowProblems([other, [intruder]], far).some((m) => /lane|overlaps/.test(m)), 'TEETH: a house standing in the street in front of a row');
});

/** The vertical triangles of a mesh: { v: its three corners, n: its horizontal unit normal [x, z], area }, from the positions and the winding alone. */
function wallTris(mesh) {
  const P = mesh.geometry.attributes.position, I = mesh.geometry.index, out = [];
  for (let t = 0; t < I.count; t += 3) {
    const v = [0, 1, 2].map((k) => { const i = I.getX(t + k); return [P.getX(i), P.getY(i), P.getZ(i)]; });
    const a = [0, 1, 2].map((k) => v[1][k] - v[0][k]), c = [0, 1, 2].map((k) => v[2][k] - v[0][k]);
    const n = [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]], l = Math.hypot(...n);
    if (l > 1e-9 && Math.abs(n[1]) < 0.01 * l) out.push({ v, n: [n[0] / l, n[2] / l], area: l / 2 });
  }
  return out;
}

/** For every side a house shares with its neighbour in the row: the wall drawn on that plane, facing out of this house, above the neighbour's roof, against the wall that should show there (the taller roof minus the lower one, times the depth). */
function partyWallProblems(rows, tris) {
  const out = []; let bands = 0;
  for (const r of rows) r.forEach((h, k) => {
    for (const e of [1, -1]) {
      const nb = r[k + e];
      if (!nb || !(e > 0 ? h.party.right : h.party.left)) continue;
      const c = Math.cos(h.ry), s = Math.sin(h.ry), px = h.x + e * (h.w / 2) * c, pz = h.z - e * (h.w / 2) * s, nx = e * c, nz = -e * s;
      const slab = (q) => (rimGap(q) > 200 ? 0 : 0.25), y0 = nb.y + nb.h + slab(nb), rise = h.y + h.h + slab(h) - y0, want = rise > 0.05 ? rise * h.d : 0;    // (a house beyond 200 m has no roof slab)
      let got = 0, hidden = 0;
      for (const t of tris) {
        if (t.n[0] * nx + t.n[1] * nz < 0.99) continue;
        if (!t.v.every(([x, y, z]) => Math.abs((x - px) * nx + (z - pz) * nz) < 0.002 && Math.abs((x - h.x) * s + (z - h.z) * c) < h.d / 2 + 0.002)) continue;
        if (t.v.every(([, y]) => y > y0 - 0.002)) got += t.area; else hidden += t.area;                       // above the lower roof, or a face the neighbour hides (wasted triangles)
      }
      if (want) bands++;
      if (Math.abs(got - want) > 0.01 * want + 0.01) out.push(`house ${h.x.toFixed(0)},${h.z.toFixed(0)}: ${got.toFixed(2)} m2 of its party wall (side ${e}) shows above the neighbour's roof, ${want.toFixed(2)} wanted`);
      if (hidden > 0.001) out.push(`house ${h.x.toFixed(0)},${h.z.toFixed(0)}: ${hidden.toFixed(2)} m2 of its party wall (side ${e}) is drawn inside the neighbour`);
    }
  });
  return { out, bands };
}

test('vista: where houses of a row share a wall, the taller one still draws the part of it above the lower roof: no see-through gap in a row (R1-D15; TEETH: a lower or a taller neighbour than the one drawn is found)', () => {
  const byRow = new Map();
  for (const h of farHouses(plan)) (byRow.get(h.row) ?? byRow.set(h.row, []).get(h.row)).push(h);
  const rows = [...byRow.values()].map((r) => r.sort((a, b) => a.k - b.k));
  let mesh = null; A.scene.traverse((o) => { if (o.isMesh && o.name === 'world.vista:plaster_rough') mesh = o; });
  assert.ok(mesh, 'the vista has its wall mesh');
  const tris = wallTris(mesh), { out, bands } = partyWallProblems(rows, tris);
  assert.deepEqual(out.slice(0, 5), [], `${out.length} problems`);
  assert.ok(bands >= 250, `${bands} party walls stand taller than a neighbour's roof`);
  const taller = (q, i) => i + 1 < q.length && q[i].y + q[i].h > q[i + 1].y + q[i + 1].h + 0.05, r = rows.find((q) => q.some((h, i) => taller(q, i))), k = r.findIndex((h, i) => taller(r, i)) + 1;   // house k - 1 stands taller than its right-hand neighbour k
  const lowered = r.map((h, i) => (i === k ? { ...h, h: h.h - 3 } : h)), raised = r.map((h, i) => (i === k ? { ...h, h: h.h + 6 } : h));
  assert.ok(partyWallProblems([lowered], tris).out.length > 0, 'TEETH: a neighbour 3 m lower than drawn leaves a wall the mesh does not have');
  assert.ok(partyWallProblems([raised], tris).out.length > 0, 'TEETH: a neighbour taller than drawn would hide a wall the mesh still draws');
});

/** Which houses have no roof: a face that looks up, over the middle of the house, at the top of its wall (beyond 200 m) or of its roof slab (nearer). `ups` = the up-facing horizontal triangles, as corner triples. */
function lidProblems(houses, ups) {
  const out = [], cell = (x, z) => `${Math.floor(x / 16)},${Math.floor(z / 16)}`, grid = new Map();
  for (const t of ups) { const k = cell((t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3); (grid.get(k) ?? grid.set(k, []).get(k)).push(t); }
  for (const h of houses) {
    const y = h.y + h.h + (rimGap(h) > 200 ? 0 : 0.25), cx = Math.floor(h.x / 16), cz = Math.floor(h.z / 16);
    let found = false;
    for (let a = cx - 1; a <= cx + 1 && !found; a++) for (let b = cz - 1; b <= cz + 1 && !found; b++) {
      for (const t of grid.get(`${a},${b}`) ?? []) {
        if (Math.abs(t[0][1] - y) > 0.003) continue;
        const d = (p, q) => (p[0] - h.x) * (q[2] - h.z) - (q[0] - h.x) * (p[2] - h.z), s = [d(t[0], t[1]), d(t[1], t[2]), d(t[2], t[0])];
        if (s.every((v) => v >= -1e-9) || s.every((v) => v <= 1e-9)) { found = true; break; }
      }
    }
    if (!found) out.push(`house ${h.x.toFixed(0)},${h.z.toFixed(0)} has no roof at y ${y.toFixed(2)}`);
  }
  return out;
}

test('vista: every far house is roofed: a face looks up over its middle at the top of its wall (or of its roof slab within 200 m) (TEETH: a roof at another height, or none, is found)', () => {
  const houses = farHouses(plan), ups = [];
  A.scene.traverse((o) => {
    if (!o.isMesh || !o.name.startsWith('world.vista:')) return;
    const P = o.geometry.attributes.position, I = o.geometry.index;
    for (let t = 0; t < I.count; t += 3) {
      const v = [0, 1, 2].map((k) => { const i = I.getX(t + k); return [P.getX(i), P.getY(i), P.getZ(i)]; });
      if (v.every((p) => Math.abs(p[1] - v[0][1]) < 1e-6) && (v[1][2] - v[0][2]) * (v[2][0] - v[0][0]) - (v[1][0] - v[0][0]) * (v[2][2] - v[0][2]) > 0) ups.push(v);
    }
  });
  const bad = lidProblems(houses, ups);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} houses without a roof`);
  const near = houses.find((h) => rimGap(h) < 150), far = houses.find((h) => rimGap(h) > 300);
  for (const h of [near, far]) {
    assert.equal(lidProblems([h], ups).length, 0, 'the house has its roof');
    assert.equal(lidProblems([{ ...h, h: h.h + 1 }], ups).length, 1, 'TEETH: a roof a metre higher than drawn is found');
    assert.equal(lidProblems([h], []).length, 1, 'TEETH: no roof in the mesh at all is found');
  }
});

test('the chalk hopscotch lies above the plaza paving (the paving tops out at plaza y + 0.02, its border band at + 0.028: chalk under it is invisible)', () => {
  const P2 = plan.plazas.find((q) => q.id === 'P2'), hop = W.hopscotch, sign = A.mat('world_sign'), ys = [];
  A.scene.updateMatrixWorld(true);
  A.scene.traverse((o) => {
    if (!o.isMesh || o.material !== sign) return;
    const p = o.geometry.getAttribute('position'), v = new A.THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (Math.abs(v.x - hop.x) < 1.4 && Math.abs(v.z - hop.z) < 0.7 && Math.abs(v.y - P2.y) < 0.2) ys.push(v.y); }
  });
  assert.equal(ys.length, 4, 'the chalk quad is in the scene');
  assert.ok(Math.min(...ys) >= P2.y + 0.028 + 0.004, `chalk at y ${Math.min(...ys).toFixed(3)} over a plaza whose border band is at ${(P2.y + 0.028).toFixed(3)}`);
});

/**
 * Triangles of every mesh that uses `mat` whose centre lies inside box [x0,x1] x [z0,z1], as { nx, ny, nz: the geometric normal (index order = the culling side),
 * y, top: lowest and highest vertex, x, z: centre, p: the three corners [x, y, z], uv: their [u, v] (if the mesh has them) }.
 */
function trianglesOn(ctx, mat, [x0, x1, z0, z1]) {
  const T = ctx.THREE, out = [], a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), e1 = new T.Vector3(), e2 = new T.Vector3();
  ctx.scene.updateMatrixWorld(true);
  ctx.scene.traverse((o) => {
    if (!o.isMesh || o.material !== mat) return;
    const p = o.geometry.getAttribute('position'), uv = o.geometry.getAttribute('uv'), ix = o.geometry.index, n = ix ? ix.count : p.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const [i0, i1, i2] = ix ? [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)] : [i, i + 1, i + 2];
      a.fromBufferAttribute(p, i0).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(p, i1).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(p, i2).applyMatrix4(o.matrixWorld);
      const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3;
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2).normalize();
      out.push({ nx: e1.x, ny: e1.y, nz: e1.z, y: Math.min(a.y, b.y, c.y), top: Math.max(a.y, b.y, c.y), x, z, p: [a.toArray(), b.toArray(), c.toArray()], uv: uv ? [i0, i1, i2].map((k) => [uv.getX(k), uv.getY(k)]) : null });
    }
  });
  return out;
}

test('the cancha is marked and hooped: lines, centre circle and spots face up above the floor; two hoops with the rim at 3.05 m (TEETH: the first winding faced the ground and the lines were culled)', () => {
  const pl = plan.plazas.find((q) => q.kind === 'court'), box = [pl.cx - pl.w / 2, pl.cx + pl.w / 2, pl.cz - pl.d / 2, pl.cz + pl.d / 2];
  const tris = trianglesOn(A, A.mat('road_line_white'), box);
  assert.ok(tris.length >= 150, `${tris.length} line triangles on the court (rectangle, halfway, centre circle, two penalty arcs, three spots)`);
  assert.equal(tris.filter((t) => t.ny < 0.99).length, 0, 'every court line triangle faces up, or the ground culls it');
  assert.ok(tris.every((t) => t.y > pl.y + 0.02 && t.y < pl.y + 0.06), 'the lines sit just above the floor top (plaza y + 0.02)');
  const ring = tris.filter((t) => Math.abs(Math.hypot(t.x - pl.cx, t.z - pl.cz) - 2.6) < 0.08);
  assert.ok(ring.length >= 60, `${ring.length} triangles on the 2.6 m centre circle`);
  assert.equal(W.court.hoops, 2); assert.equal(W.dress.hoops, 2);
  const rims = trianglesOn(A, A.mat('plastic_bin'), box), nets = trianglesOn(A, A.mat('fence_mesh'), box), rimY = pl.y + 3.05;
  for (const s of [-1, 1]) {                                                                        // a ring of tube segments 22.5 cm out from the rim centre, level at 3.05 m, with a net hanging 42 cm under it
    const d = pl.w / 2 - 1.325, cx = pl.cx + s * d * Math.cos(pl.ry), cz = pl.cz - s * d * Math.sin(pl.ry), r = (t) => Math.hypot(t.x - cx, t.z - cz);
    const ring = rims.filter((t) => Math.abs(r(t) - 0.225) < 0.03 && t.top - t.y < 0.04 && Math.abs(t.y - rimY) < 0.02), net = nets.filter((t) => r(t) < 0.25 && t.y > rimY - 0.43 && t.top < rimY + 0.01);
    assert.ok(ring.length >= 80, `end ${s}: ${ring.length} rim triangles at 3.05 m`);
    assert.ok(net.length >= 24, `end ${s}: ${net.length} net triangles under the rim`);
  }
  // TEETH: the facing check does see a triangle that faces the ground, and lineQuad hands `quad` its corners counter-clockwise seen from above
  const T = A.THREE, g = new T.BufferGeometry(), root = new T.Group(), normalY = [];
  g.setAttribute('position', new T.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), 3));
  root.add(new T.Mesh(g, A.mat('road_line_white')));
  assert.ok(trianglesOn({ THREE: T, scene: root }, A.mat('road_line_white'), [-1, 2, -1, 2]).every((t) => t.ny < -0.99));
  lineQuad({ quad: (m, a, b, c, d) => normalY.push((c[2] - a[2]) * (d[0] - b[0]) - (c[0] - a[0]) * (d[2] - b[2])) }, 'm', 0, 0, 4, 0, 0.1, 0);   // y of cross(c - a, d - b), the quad's normal
  assert.ok(normalY.length === 1 && normalY[0] > 0.5, `lineQuad normal y ${normalY[0]}`);
});

test('no wedge of earth stands in front of a retaining wall: each box is as thick as its ramp and the terrain mesh lies on the lower ground inside it (TEETH: the raw height field leaves cones up to 3 m tall)', () => {
  const carve = W.masks.carve, got = wedgeStats(plan, W.wallRuns, W.grid, carve), raw = wedgeStats(plan, W.wallRuns, fieldGrid(plan, carve), carve);
  assert.ok(W.wallRuns.length > 300 && W.wallCorners.length > 80, `${W.wallRuns.length} runs, ${W.wallCorners.length} corners`);
  assert.ok(got.inner.over / got.inner.n < 0.015 && got.inner.max < 1.5, `along the runs: ${got.inner.over} of ${got.inner.n} samples have a wedge over 10 cm, the tallest ${got.inner.max.toFixed(2)} m`);
  assert.ok(got.over / got.n < 0.04, `with the run ends: ${got.over} of ${got.n}`);
  assert.ok(raw.inner.over / raw.inner.n > 0.1 && raw.inner.max > 2, `the same measure on the unlowered lattice must fail (${raw.inner.over} of ${raw.inner.n}, ${raw.inner.max.toFixed(2)} m)`);
  // the box reaches the end of the ramp: beyond W the field no longer falls or rises steeply (a second ramp across a level bench is another wall's)
  let open = 0, narrow = 0, n = 0;
  for (const r of W.wallRuns) for (const s of r.S) {
    const steep = (w) => { const h = (u) => plan.heightAt(s.x + s.nx * u, s.z + s.nz * u); return Math.abs(h(w + 0.5) - h(w)) > 0.35; };
    n++;
    if (s.W < 4.9 && steep(s.W)) open++;
    if (steep(r.B)) narrow++;                                                                // TEETH: a box only as thick as the nominal band leaves far more of them
  }
  assert.ok(open / n < 0.04, `${open} of ${n} samples still stand on a steep ramp where the box ends`);
  assert.ok(narrow / n > 0.1, `the nominal band would leave ${narrow} of ${n}: the measure must see the old boxes`);
});

/** Every triangle of the retaining-wall group: { mat, ny: where its index order faces, w: its narrowest altitude (2 x area over its longest edge), col: its mean vertex colour }. */
function wallTriangles(root) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = (a) => Math.hypot(a[0], a[1], a[2]), out = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.name.startsWith('world.walls:')) return;
    const P = o.geometry.attributes.position, C = o.geometry.attributes.color, I = o.geometry.index;
    for (let t = 0; t < I.count; t += 3) {
      const ids = [0, 1, 2].map((k) => I.getX(t + k)), v = ids.map((i) => [P.getX(i), P.getY(i), P.getZ(i)]), e1 = sub(v[1], v[0]), e2 = sub(v[2], v[0]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], a2 = len(n) || 1;
      out.push({ mat: o.name.slice('world.walls:'.length), ny: n[1] / a2, w: a2 / (Math.max(len(e1), len(e2), len(sub(v[2], v[1]))) || 1), col: [0, 1, 2].map((c) => ids.reduce((s, i) => s + [C.getX(i), C.getY(i), C.getZ(i)][c], 0) / 3) });
    }
  });
  return out;
}
/** The mean vertex colour of every mesh whose name starts with `prefix` and ends with `suffix`. */
function meanTone(root, prefix, suffix) {
  const sum = [0, 0, 0]; let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.name.startsWith(prefix) || !o.name.endsWith(suffix)) return;
    const C = o.geometry.attributes.color;
    for (let i = 0; i < C.count; i++) { sum[0] += C.getX(i); sum[1] += C.getY(i); sum[2] += C.getZ(i); n++; }
  });
  return sum.map((s) => s / n);
}
const FACE_OR_EARTH = ['stone_wall', 'concrete_formwork', 'brick_clay_hollow', 'concrete_bare', 'ground_dirt'];
/** What is wrong with the look of the wall triangles `tris` against the terrain's own dirt tone `tone` (R1-D10, D16): a face that is not built of something, a concrete cap, earth of another colour. */
function wallLookProblems(tris, tone) {
  const out = [], mats = [...new Set(tris.map((t) => t.mat))].filter((m) => !FACE_OR_EARTH.includes(m));
  for (const m of mats) out.push(`${m} on a retaining wall: a face is rubble, board-marked concrete or hollow brick, the cap is earth`);
  const fat = tris.filter((t) => t.mat === 'concrete_bare' && t.ny > 0.9 && t.w > 0.25);
  if (fat.length) out.push(`${fat.length} concrete triangles that face up are wider than a coping (0.25 m): a slab of concrete on top of the wall`);
  const earth = tris.filter((t) => t.mat === 'ground_dirt'), mean = [0, 1, 2].map((c) => earth.reduce((s, t) => s + t.col[c], 0) / (earth.length || 1));
  if (mean.some((m, c) => Math.abs(m - tone[c]) > 0.08)) out.push(`the earth beside the walls is ${mean.map((m) => m.toFixed(2))} where the terrain's dirt is ${tone.map((m) => m.toFixed(2))}: it shows as a patch`);
  return out;
}

test('retaining walls read as walls, not wedges of fill: a face of rubble, formwork concrete or hollow brick, never a sand plaster slab; the cap is earth in the terrain\'s own tone under a narrow concrete coping (R1-D10, D16; TEETH: each of the three old faults is found)', () => {
  const tris = wallTriangles(A.scene), tone = meanTone(A.scene, 'world.terrain.', ':ground_dirt');
  assert.ok(tone.every(Number.isFinite) && tone[1] > 1.1, `the terrain's dirt tone ${tone}`);
  assert.deepEqual(wallLookProblems(tris, tone), []);
  const coping = tris.filter((t) => t.mat === 'concrete_bare' && t.ny > 0.9), cap = tris.filter((t) => t.mat === 'ground_dirt' && t.ny > 0.9);
  assert.ok(coping.length > 3000 && cap.length > 6000, `${coping.length} coping and ${cap.length} earth triangles face up: the check has something to look at`);
  const faces = new Set(tris.filter((t) => Math.abs(t.ny) < 0.1).map((t) => t.mat));
  assert.ok(['stone_wall', 'concrete_formwork', 'brick_clay_hollow'].every((m) => faces.has(m)), `the faces: ${[...faces]}`);
  assert.equal(wallLookProblems([...tris, { mat: 'plaster_rough#c9b79a', ny: 0, w: 1, col: [1, 1, 1] }], tone).length, 1, 'TEETH: a sand plaster face is found');
  assert.equal(wallLookProblems([...tris, { mat: 'concrete_bare', ny: 1, w: 0.9, col: [1, 1, 1] }], tone).length, 1, 'TEETH: a concrete slab for a cap is found');
  assert.equal(wallLookProblems(tris.map((t) => (t.mat === 'ground_dirt' ? { ...t, col: [0.86, 0.84, 0.8] } : t)), tone).length, 1, 'TEETH: the old dark red earth is found');
});

/**
 * Walk at the box of every tall retaining wall (a face of FACE_DROP and more) from the structure's side (the street, plaza or pad) and from the far side (the hill above a cut, the
 * low ground below a fill), and at the square behind every tall convex corner: 90 frames of 5 cm from 1.2 m out (1.5 m for a corner). A walker that ends more than 5 cm inside the
 * box stands under the cap with his eye below it, looking out through a face that is culled from behind at the lowered lattice's steep strip (R1-D07). A start inside a wall or on
 * ground that is not that side's level is no walk: it is counted in `skipped`, so the test cannot go vacuous.
 */
function boxWalks(ph, step = 2) {
  const H = plan.heightAt, out = { skipped: 0, total: {}, bad: {} };
  const tally = (key, bad) => { out.total[key] = (out.total[key] ?? 0) + 1; if (bad) out.bad[key] = (out.bad[key] ?? 0) + 1; };
  const go = (sx, sz, ux, uz, level) => {
    const sy = H(sx, sz);
    if (Math.abs(sy - level) > 0.6 || ph._overlaps(sx, sz, sy, 0.3, 1.78)) { out.skipped++; return null; }
    const s = { x: sx, y: sy, z: sz, vy: 0, onGround: true };
    for (let k = 0; k < 90; k++) ph.move(s, ux * 0.05, uz * 0.05, 1 / 60);
    return s;
  };
  for (const run of W.wallRuns) {
    if (run.tall < FACE_DROP) continue;
    const kind = run.sign > 0 ? 'cut' : 'fill';
    for (let i = 0; i + 1 < run.S.length; i += step) {
      const p = run.S[i], q = run.S[i + 1];
      const lo = Math.min(Math.abs(p.outer - p.inner), Math.abs(q.outer - q.inner));
      if (lo < FACE_DROP / 2) continue;
      const lead = lo < FACE_DROP ? '-in' : '';                                                    // the lower ramp that leads into the tall stretch: closed too, or a walker slips in by its end
      const x = (p.x + q.x) / 2, z = (p.z + q.z) / 2, nl = Math.hypot(p.nx + q.nx, p.nz + q.nz) || 1, ux = (p.nx + q.nx) / nl, uz = (p.nz + q.nz) / nl, d = (p.W + q.W) / 2;
      const near = go(x - ux * 1.2, z - uz * 1.2, ux, uz, (p.inner + q.inner) / 2);
      if (near) tally(kind + '/structure' + lead, (near.x - x) * ux + (near.z - z) * uz > 0.05);
      const far = go(x + ux * (d + 1.2), z + uz * (d + 1.2), -ux, -uz, (p.outer + q.outer) / 2);
      if (far) tally(kind + '/far' + lead, (far.x - x) * ux + (far.z - z) * uz < d - 0.05);
    }
  }
  for (const c of W.wallCorners) {
    const a = c.A, b = c.B;
    if (Math.abs(a.outer - a.inner) < FACE_DROP || Math.abs(b.outer - b.inner) < FACE_DROP) continue;
    const { C, P1, P2, P3 } = cornerShape(c), det = a.nx * b.nz - a.nz * b.nx, level = (a.outer + b.outer) / 2;
    for (const [P, Q, n] of [[P1, P2, [a.nx, a.nz]], [P3, P2, [b.nx, b.nz]]]) {                                      // the square's two outer sides: straight at the middle of each from 1.2 m out
      const mx = (P[0] + Q[0]) / 2, mz = (P[1] + Q[1]) / 2, s = go(mx + n[0] * 1.2, mz + n[1] * 1.2, -n[0], -n[1], level);
      if (!s) continue;
      const ex = s.x - C[0], ez = s.z - C[1], u = (ex * b.nz - ez * b.nx) / det, v = (a.nx * ez - a.nz * ex) / det;     // the square's own axes: along A's normal and along B's
      tally((c.sign > 0 ? 'cut' : 'fill') + '/corner', u > 0.1 && u < a.W - 0.1 && v > 0.1 && v < b.W - 0.1);
    }
  }
  return out;
}

test('nobody can stand inside a tall retaining wall: walkers from the street, the pad or the plaza, from the hill above a cut and from the low ground below a fill, and at every tall corner, are stopped at the face (TEETH: with every guard collider removed most of them walk in)', () => {
  const got = boxWalks(physicsOf(A)), raw = boxWalks(physicsOf(A, { skip: ['guard'] }));
  const n = (o, k) => o.total[k] ?? 0, frac = (o, k) => (o.bad[k] ?? 0) / Math.max(1, n(o, k));
  assert.ok(W.walls.faces > 1500, `the world holds ${W.walls.faces} face colliders`);
  for (const k of ['cut/structure', 'cut/far', 'fill/structure', 'fill/far']) assert.ok(n(got, k) > 250, `${k}: only ${n(got, k)} walks (the rest start inside a wall): ${JSON.stringify(got.total)}`);
  assert.ok(n(got, 'cut/corner') + n(got, 'fill/corner') > 30, `corner walks: ${JSON.stringify(got.total)}`);
  assert.ok(['cut/far-in', 'fill/far-in', 'cut/structure-in', 'fill/structure-in'].reduce((s, k) => s + n(got, k), 0) > 100, `lead-in walks: ${JSON.stringify(got.total)}`);
  for (const k of Object.keys(got.total)) assert.ok(frac(got, k) < 0.03, `${k}: ${got.bad[k] ?? 0} of ${n(got, k)} walkers end inside the box`);
  assert.ok(frac(raw, 'cut/far') > 0.5 && frac(raw, 'fill/far') > 0.3 && frac(raw, 'fill/structure') > 0.1 && frac(raw, 'cut/structure') > 0.02, `TEETH, without the guards: ${JSON.stringify(raw.bad)} of ${JSON.stringify(raw.total)}`);
  assert.ok(frac(raw, 'cut/corner') + frac(raw, 'fill/corner') > 0.1, `TEETH: a diagonal walk reaches the square behind a corner when nothing stops it: ${JSON.stringify(raw.bad)}`);
});

/** The tower's own data walked with the real kernel: walls and floors of the world (optionally minus those `skipWall` / `skipFloor` name). */
function towerKernel(ctx, skipWall = () => false, skipFloor = () => false) {
  const ph = new Physics();
  ph.setTerrain(ctx.plan.heightAt);
  ph.addWalls(lotWalls(ctx.plan));
  for (const w of ctx.physics.walls) if (!skipWall(w)) ph.addWall(w);
  for (const f of ctx.physics.floors) if (!skipFloor(f)) ph.addFloor(f);
  return ph;
}

test('the viewpoint tower: the kernel climbs all four flights to a deck 8 m above the plaza and back down, nobody leaves the stair over a rail or into the core, no edge of the deck lets a walker off, the discovery stands on the deck (TEETH: without the floors the stair is a wall, without the walls the walker falls)', () => {
  const T = W.tower;
  assert.ok(T, 'the tower was built');
  const P = towerPlan(T.x, T.z, T.y0), { c, R, deckY } = P, STEP = 0.05;
  const surface = (x, z) => {                                                   // the height of the stair, a landing or the deck under (x, z); null off them
    let best = null;
    for (const f of P.floors) {
      const xs = f.pts.map((p) => p[0]), zs = f.pts.map((p) => p[1]);
      if (x < Math.min(...xs) - 0.05 || x > Math.max(...xs) + 0.05 || z < Math.min(...zs) - 0.05 || z > Math.max(...zs) + 0.05) continue;
      const y = f.y + f.a * (x - f.px) + f.b * (z - f.pz);
      if (best === null || y > best) best = y;
    }
    return best;
  };
  const onTower = (s) => { const y = surface(s.x, s.z); return y !== null && Math.abs(s.y - y) < 0.2; };
  const goto = (ph, s, x, z) => { for (let k = 0; k < 400; k++) { const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz); if (d < 0.06) return true; const st = Math.min(STEP, d); ph.move(s, (dx / d) * st, (dz / d) * st, 1 / 60); } return false; };
  const push = (ph, s, ux, uz, n) => { for (let k = 0; k < n; k++) ph.move(s, ux * STEP, uz * STEP, 1 / 60); };
  const standing = (ph, x, z) => ({ x, z, y: surface(x, z) ?? ph.groundAt(x, z, 1e3), vy: 0, onGround: true });
  const same = (a, b) => a.x1 === b.x1 && a.z1 === b.z1 && a.x2 === b.x2 && a.z2 === b.z2 && a.y0 === b.y0 && a.y1 === b.y1;
  const parapet = (w) => P.walls.some((p) => same(p, w) && p.y0 >= deckY - 0.01), core = (w) => P.walls.some((p) => same(p, w) && Math.abs(p.y1 - deckY) < 1e-6), rim = (w) => P.walls.some((p) => same(p, w) && p.y1 > deckY + 0.5 && p.y0 < deckY - 1);
  const tower = (f) => /^tower\./.test(f.id);
  // a walk up: the real kernel along the lane waypoints, each reached, each on the surface the plan describes, the last on the deck
  const climb = (ph) => {
    const s = standing(ph, T.entry[0], T.entry[1]), trail = [];
    for (const [x, z] of P.route) { const ok = goto(ph, s, x, z); trail.push({ x, z, ok, dy: surface(x, z) === null ? 0 : s.y - surface(x, z) }); if (!ok) break; }
    return { s, trail };
  };
  const up = climb(towerKernel(A));
  assert.ok(up.trail.length === P.route.length && up.trail.every((t) => t.ok && Math.abs(t.dy) < 0.25), `the climb: ${JSON.stringify(up.trail.filter((t) => !t.ok || Math.abs(t.dy) >= 0.25))}`);
  assert.ok(Math.abs(up.s.y - deckY) < 0.3 && Math.hypot(up.s.x - T.x, up.s.z - T.z) < 0.2, `the walker ends on the deck: y ${up.s.y.toFixed(2)} of ${deckY.toFixed(2)}`);
  const mir = plan.landmarks.find((l) => l.id === 'mirador'), plazaY = plan.heightAt(mir.x, mir.z);
  assert.ok(deckY - plazaY >= 7.5 && deckY - T.y0 >= TOWER.deck - 0.01, `the deck stands ${(deckY - plazaY).toFixed(2)} m over the viewpoint plaza (${plazaY.toFixed(2)}) and ${(deckY - T.y0).toFixed(2)} over its own foot`);
  // and back down along the same lane to the entry
  const ph = towerKernel(A), s = standing(ph, T.x, T.z);
  for (const [x, z] of [...P.route].reverse()) assert.ok(goto(ph, s, x, z), `the descent reaches (${x.toFixed(2)}, ${z.toFixed(2)})`);
  assert.ok(Math.abs(s.y - ph.groundAt(T.entry[0], T.entry[1], 1e3)) < 0.3, `the descent ends on the ground: ${s.y.toFixed(2)}`);
  // the stair holds a walker: from each waypoint past the foot (the first two lanes of flight A stay 1.3 m or more from its low end), in eight directions for 3 m, he is still standing ON the stair, a landing or the deck (not over the rail, not inside the core)
  const holds = (k) => {
    let n = 0, bad = 0;
    for (let i = 2; i < P.route.length; i++) for (let a = 0; a < 8; a++) {
      const s2 = standing(k, P.route[i][0], P.route[i][1]), t = (a / 8) * Math.PI * 2;
      push(k, s2, Math.cos(t), Math.sin(t), 60); n++; if (!onTower(s2)) bad++;
    }
    return { n, bad };
  };
  const stair = holds(ph);
  assert.ok(stair.n === (P.route.length - 2) * 8 && stair.bad === 0, `the stair: ${stair.bad} of ${stair.n} walks leave it`);
  // the deck holds a walker: from the middle in sixteen directions, 6.5 m, and he is still up there (a fall onto a lower flight would stand on the tower too)
  const edges = (k) => {
    let bad = 0, n = 0;
    for (let a = 0; a < 16; a++) { const s2 = standing(k, T.x, T.z), t = (a / 16) * Math.PI * 2; push(k, s2, Math.cos(t), Math.sin(t), 130); n++; if (!onTower(s2) || s2.y < deckY - 0.3) bad++; }
    return { n, bad };
  };
  const deck = edges(ph);
  assert.ok(deck.n === 16 && deck.bad === 0, `the deck: ${deck.bad} of ${deck.n} walks end off it`);
  // TEETH: each part of the tower's physics is needed; without it the same walks fail
  const noFloors = climb(towerKernel(A, () => false, tower));
  assert.ok(noFloors.trail.length < P.route.length || noFloors.trail.some((t) => !t.ok || Math.abs(t.dy) >= 0.25) || Math.abs(noFloors.s.y - deckY) > 1, 'TEETH: without the floors the climb must fail');
  const noParapet = edges(towerKernel(A, parapet)), noCore = holds(towerKernel(A, core)), noRim = holds(towerKernel(A, rim));
  assert.ok(noParapet.bad >= 6, `TEETH: without the deck parapet ${noParapet.bad} of ${noParapet.n} walks fall off`);
  assert.ok(noCore.bad >= 4, `TEETH: without the core walls ${noCore.bad} of ${noCore.n} walks drop into the core`);
  assert.ok(noRim.bad >= 10, `TEETH: without the outer wall ${noRim.bad} of ${noRim.n} walks step over the rail`);
  for (const f of P.floors) assert.ok(A.physics.floors.some((q) => q.id === f.id), `floor ${f.id} is registered in the world`);
  for (const w of P.walls) assert.ok(A.physics.walls.some((q) => same(q, w)), `the wall (${w.x1.toFixed(1)}, ${w.z1.toFixed(1)}) to (${w.x2.toFixed(1)}, ${w.z2.toFixed(1)}) is registered in the world`);
  // nothing else of the world stands on the tower, and what grows around it keeps off the stair
  const inRing = (x, z) => Math.abs(x - T.x) < R + 0.3 && Math.abs(z - T.z) < R + 0.3;
  const strays = A.physics.walls.filter((w) => (w.id === 'prop' || w.id === 'guard') && !P.walls.some((p) => same(p, w)) && (inRing(w.x1, w.z1) || inRing(w.x2, w.z2)));
  assert.deepEqual(strays.map((w) => `${w.id} (${w.x1.toFixed(1)}, ${w.z1.toFixed(1)})`), [], 'no other collider stands on the tower or in its stair');
  assert.ok(W.occ.overlaps(T.x, T.z, 0.3) && P.route.every(([x, z]) => W.occ.overlaps(x, z, 0.3)), 'the tower\'s ground is claimed, so no prop is dropped on the stair');
  const d = [...A.discover.items.values()].find((q) => q.id === 'w.torre');
  assert.ok(d && d.kind === 'mirador' && Math.abs(d.y - deckY) < 0.01 && d.name && d.en, `the tower discovery: ${JSON.stringify(d)}`);
  assert.ok(Math.hypot(d.x - T.x, d.z - T.z) < c, 'the discovery is over the deck');
});

/** Every vertex on a face of the tower's core: [height over the tower's foot, luminance of its colour]. */
function towerFaceTones(T, ctx) {
  const c = TOWER.core / 2, out = [];
  ctx.scene.traverse((o) => {
    if (!o.isMesh || !o.name.startsWith('props.') || !o.name.endsWith(':concrete_formwork')) return;
    const P = o.geometry.attributes.position, C = o.geometry.attributes.color;
    for (let i = 0; i < P.count; i++) {
      const dx = Math.abs(P.getX(i) - T.x), dz = Math.abs(P.getZ(i) - T.z);
      if ((Math.abs(dx - c) < 0.01 && dz <= c + 0.01) || (Math.abs(dz - c) < 0.01 && dx <= c + 0.01)) out.push([P.getY(i) - T.y0, 0.2126 * C.getX(i) + 0.7152 * C.getY(i) + 0.0722 * C.getZ(i)]);
    }
  });
  return out;
}
/** What is wrong with the weathering of a wall seen as [height, tone] vertices: the wall above the foot does not vary (no streaks, no blotches: a flat clean grey), or the foot is no darker than the wall above it (no damp). */
function weatheringProblems(v) {
  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1), up = v.filter(([y]) => y > 4 && y < 9).map(([, t]) => t), out = [];
  const sd = Math.sqrt(mean(up.map((t) => (t - mean(up)) ** 2)));
  if (!(sd > 0.04)) out.push(`the wall between 4 and 9 m varies by only ${sd.toFixed(3)}: a flat clean grey`);
  const foot = mean(v.filter(([y]) => y > 0.1 && y < 1.0).map(([, t]) => t));
  if (!(foot < mean(up) * 0.88)) out.push(`the foot (${foot.toFixed(2)}) is no darker than the wall above it (${mean(up).toFixed(2)}): no damp`);
  return out;
}

test('the viewpoint tower is weathered and named (R1-D18): rain streaks, blotches and a damp foot on the core, a MIRADOR board at eye height on the face the plaza sees (TEETH: a flat grey wall, a dry foot and a missing board are each found)', () => {
  const T = W.tower, mir = plan.landmarks.find((l) => l.id === 'mirador'), c = TOWER.core / 2, S = T.sign;
  const tones = towerFaceTones(T, A);
  assert.ok(tones.length > 1500, `${tones.length} vertices on the four faces of the core`);
  assert.deepEqual(weatheringProblems(tones), []);
  assert.equal(weatheringProblems(tones.map(([y]) => [y, 0.9])).length, 2, 'TEETH: a flat grey wall fails on both counts');
  assert.equal(weatheringProblems(tones.map(([y, t]) => [y, y < 1.0 ? t / 0.75 : t])).length, 1, 'TEETH: a foot as bright as the wall fails on the damp alone');
  const board = (tris) => {
    const out = [];
    if (tris.length !== 2) return [`${tris.length} triangles for the board (one quad is two)`];
    const ys = tris.flatMap((t) => t.p.map((q) => q[1])), zs = tris.flatMap((t) => t.p.map((q) => q[2])), plazaY = plan.heightAt(mir.x, mir.z);
    if (!tris.every((t) => Math.sign(t.nx) === S.side && Math.abs(t.nx) > 0.99)) out.push('the board does not face away from the tower');
    if (Math.sign(mir.x - T.x) !== S.side) out.push('it hangs on the face turned away from the viewpoint plaza');
    const bh = Math.max(...ys) - Math.min(...ys), bw = Math.max(...zs) - Math.min(...zs);
    if (Math.abs(bh - S.h) > 0.02 || Math.abs(bw - S.w) > 0.02) out.push('its size is not the one it was planned with');
    if (bw < 1.6 || bh < 0.45 || Math.abs(bw / bh - 480 / 128) > 0.4) out.push(`the board is ${bw.toFixed(2)} x ${bh.toFixed(2)} m: too small to read from the plaza, or not the 480 : 128 of the painted region (the lettering would be squeezed)`);
    const lo = Math.min(...ys);                                                              // seen from the plaza: over its 1.1 m balustrade, and no higher than an eye finds it (unless the wall below the stair's first flight runs out first)
    if (lo < Math.min(plazaY + 1.3, S.ceil) - 1e-6 || lo > plazaY + 2.3) out.push(`its foot is ${(lo - plazaY).toFixed(2)} m over the viewpoint plaza: the balustrade hides it, or it hangs out of sight`);
    if (Math.abs(Math.abs(S.x - T.x) - (c + TOWER.arm) - 0.034) > 0.005) out.push('it does not stand against the outer face of the stair block');
    return out;
  };
  const tris = trianglesOn(A, A.mat('world_sign'), [S.x - 0.3, S.x + 0.3, S.z - 2, S.z + 2]);
  assert.deepEqual(board(tris), []);
  assert.ok(board([]).length > 0, 'TEETH: no board at all is found');
  assert.ok(board(tris.map((t) => ({ ...t, nx: -t.nx }))).length > 0, 'TEETH: a board that faces into the tower is found');
});

test('no pocket is left inside a tall retaining wall: every spot between its face line and its cap line, and across each tall corner square, lies inside a collider zone (TEETH: without the guard colliders nearly all of them are free, and without the fill lines a wide box keeps a free channel)', () => {
  const ph = physicsOf(A), raw = physicsOf(A, { skip: ['guard'] }), free = (k, x, z) => !k._overlaps(x, z, plan.heightAt(x, z), 0.3, 1.78);          // a standing circle touches no collider zone
  let n = 0, open = 0, wide = 0, wideOpen = 0, rawFree = 0, squares = 0, squareOpen = 0;
  for (const run of W.wallRuns) {
    if (run.tall < FACE_DROP) continue;
    for (let i = 0; i + 1 < run.S.length; i++) {
      const p = run.S[i], q = run.S[i + 1];
      if (Math.abs(p.outer - p.inner) < FACE_DROP / 2 || Math.abs(q.outer - q.inner) < FACE_DROP / 2) continue;
      const x = (p.x + q.x) / 2, z = (p.z + q.z) / 2, nx = (p.nx + q.nx) / 2, nz = (p.nz + q.nz) / 2, nl = Math.hypot(nx, nz) || 1, Wd = (p.W + q.W) / 2;
      for (let d = 0.15; d <= Wd - 0.14; d += 0.15) {
        const px = x + (nx / nl) * d, pz = z + (nz / nl) * d;
        n++; if (free(ph, px, pz)) open++; if (free(raw, px, pz)) rawFree++;
        if (Wd > 1.2) { wide++; if (free(ph, px, pz)) wideOpen++; }
      }
    }
  }
  for (const c of W.wallCorners) {
    if (Math.abs(c.A.outer - c.A.inner) < FACE_DROP || Math.abs(c.B.outer - c.B.inner) < FACE_DROP) continue;
    const a = c.A, b = c.B;
    for (const u of [0.2, 0.5, 0.8]) for (const v of [0.2, 0.5, 0.8]) {                                      // the square's own axes: along A's normal and along B's, each as far as that run's box is thick
      const x = a.x + a.nx * a.W * u + b.nx * b.W * v, z = a.z + a.nz * a.W * u + b.nz * b.W * v;
      squares++; if (free(ph, x, z)) squareOpen++;
    }
  }
  assert.ok(n > 3000 && wide > 300 && squares > 100, `${n} samples, ${wide} in a box wider than 1.2 m, ${squares} in corner squares`);
  assert.ok(open / n < 0.01, `${open} of ${n} spots between the face lines are free ground a walker could stand on`);
  assert.ok(wideOpen / wide < 0.01, `${wideOpen} of ${wide} spots in the wide boxes are free`);
  assert.ok(squareOpen / squares < 0.03, `${squareOpen} of ${squares} spots of the corner squares are free`);
  assert.ok(rawFree / n > 0.5, `TEETH: without the guards ${rawFree} of ${n} spots are free`);
  assert.ok(W.walls.fills > 100, `${W.walls.fills} fill lines`);
});

/**
 * A guard line must not be jumped (or walked) over. A wall blocks a walker whose feet are more than 0.4 m under its top (physics.js WALL_CLEAR); a jump lifts the feet 0.66 m, and at a sprint flies 3.67 m. So the
 * highest a walker can be over a guard line, from any ground within that reach (the ground plus the arc's lift at that distance), plus 0.4 m, must stay under the line's top. The old top read only the two samples
 * at each end of the run's stretch: at a street cut beside a lot's plinth it stood 0.37 m above the plinth, A2's partial world (stuck.mjs --lots, cell 0.3) had the walker cross it at 19.9 m, and it was wedged in a
 * sliver ringed by 24 overlapping lines: STUCK at (14.7, -1.5, y 16.8).
 */
const PLY = CONFIG.PLAYER, LIFT = PLY.jump ** 2 / (2 * PLY.gravity), REACH = (2 * PLY.jump * PLY.sprint) / PLY.gravity, APEX_AT = (PLY.sprint * PLY.jump) / PLY.gravity;
const lift = (d) => { if (d <= APEX_AT) return LIFT; const t = d / PLY.sprint; return Math.max(0, PLY.jump * t - 0.5 * PLY.gravity * t * t); };   // slow enough to be at the apex over the line, or the sprint's arc
/** The highest the feet can be over the wall's line: plan.heightAt on a 0.25 m grid within REACH of it, plus the lift of an arc that started that far from the line. */
function jumpTop(w) {
  const H = plan.heightAt, ux = w.x2 - w.x1, uz = w.z2 - w.z1, l2 = ux * ux + uz * uz, S = 0.25;
  let top = -Infinity;
  for (let x = Math.floor((Math.min(w.x1, w.x2) - REACH) / S) * S; x <= Math.max(w.x1, w.x2) + REACH; x += S) {
    for (let z = Math.floor((Math.min(w.z1, w.z2) - REACH) / S) * S; z <= Math.max(w.z1, w.z2) + REACH; z += S) {
      const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - w.x1) * ux + (z - w.z1) * uz) / l2)) : 0, d = Math.hypot(x - w.x1 - ux * u, z - w.z1 - uz * u);
      if (d <= REACH) top = Math.max(top, H(x, z) + lift(d));
    }
  }
  return top;
}
const jumpable = (list) => list.filter((w) => w.y1 - 0.4 < jumpTop(w) + 0.05);

test('no guard line can be jumped or walked over: each stands 0.4 m above the highest a jump from the ground within a sprint of it lifts the feet (TEETH: lines 1 m lower are found, and so is a line a curb high)', () => {
  const guards = A.physics.walls.filter((w) => w.id === 'guard');
  assert.ok(guards.length > 4000, `${guards.length} guard lines`);
  const bad = jumpable(guards), at = (w) => `(${w.x1.toFixed(1)}, ${w.z1.toFixed(1)}) top ${w.y1.toFixed(2)} vs ${jumpTop(w).toFixed(2)} + 0.4`;
  assert.equal(bad.length, 0, `${bad.length} of ${guards.length} guard lines are low enough for a jump to clear them, the first ${bad.slice(0, 4).map(at).join('; ')}`);
  const lowered = jumpable(guards.map((w) => ({ ...w, y1: w.y1 - 1 })));
  assert.ok(lowered.length > guards.length * 0.2, `TEETH: lines 1 m lower: ${lowered.length} of ${guards.length} found`);
  const g0 = guards[0];
  assert.equal(jumpable([{ ...g0, y1: plan.heightAt(g0.x1, g0.z1) + 0.37 }]).length, 1, 'TEETH: a line 0.37 m above the ground (a curb a walker steps over) is found');
});

test('guardTop on made-up ground: flat, a block of high ground 0.5 m beside the box, a ledge at the end of a sprint jump, and one past it (the top clears the highest feet a jump can have; ground out of reach is no business of it)', () => {
  const box = [[0, 0], [1, 0], [1, 4], [0, 4]], need = (ground, d) => ground + lift(d) + 0.4 + 0.05;
  assert.ok(guardTop(() => 5, box) >= need(5, 0), `flat ground: ${guardTop(() => 5, box)}`);
  assert.ok(guardTop((x, z) => (x > 1.4 && x < 2.1 && z > 1 && z < 3 ? 8 : 5), box) >= need(8, 0.5), 'a block 0.5 m beside the box and no ground that high further out: a walker slow enough is at the apex over the line');
  assert.ok(guardTop((x) => (x > 4.6 ? 20 : 5), box) >= need(20, 3.62), 'a ledge 3.62 m from the box: the edge of a sprint jump');
  assert.ok(guardTop((x) => (x > 5.2 ? 20 : 5), box) < 12, 'a ledge 4.2 m away is out of any jump\'s reach');
});

/** A mural triangle hangs right when it faces the street (a level normal along (ox, oz)), its u grows toward the viewer's right (oz, -ox) and its v grows upward. */
function hangsRight(t, ox, oz) {
  if (Math.abs(t.ny) > 0.05 || t.nx * ox + t.nz * oz < 0.95) return false;
  const mean = (a) => (a[0] + a[1] + a[2]) / 3, cov = (a, b) => [0, 1, 2].reduce((sum, k) => sum + (a[k] - mean(a)) * (b[k] - mean(b)), 0);
  return cov(t.p.map((q) => q[0] * oz - q[2] * ox), t.uv.map((q) => q[0])) > 0 && cov(t.p.map((q) => q[1]), t.uv.map((q) => q[1])) > 0;
}

/**
 * The wall faces of the world that rise above height y within `reach` m ahead of (x, z) along the unit vector (ox, oz): what would hide a painting hung there. A cut wall's
 * face stands on its street edge, a fill wall's at the foot of its ramp; the lot pads above a street carry fill walls 0 to 0.4 m in front of the street wall's face.
 */
function facesAhead(x, z, ox, oz, y, reach = 1.0) {
  const hits = [], cross = (ax, az, bx, bz) => ax * bz - az * bx;
  for (const run of W.wallRuns) {
    const cut = run.sign > 0, at = (s) => [s.x + s.nx * (cut ? 0 : s.W), s.z + s.nz * (cut ? 0 : s.W)];
    for (let i = 0; i + 1 < run.S.length; i++) {
      const a = run.S[i], b = run.S[i + 1], [ax, az] = at(a), [bx, bz] = at(b), ex = bx - ax, ez = bz - az, den = cross(ox, oz, ex, ez);
      if (Math.abs(den) < 1e-9) continue;
      const t = cross(ax - x, az - z, ex, ez) / den, u = cross(ax - x, az - z, ox, oz) / den;
      if (t < 0.005 || t > reach || u < 0 || u > 1) continue;
      const top = (cut ? a.outer + (b.outer - a.outer) * u : a.inner + (b.inner - a.inner) * u) + 0.02;
      if (top > y) hits.push(run);
    }
  }
  return hits;
}

test('the murals: 3 m and taller, on the tall street walls under the cap and in front of every wall face that stands before the street wall, every triangle facing the street with u running left to right (TEETH: a mirrored, upside-down or back-wound quad, or a painting behind a lot wall, fails the check)', () => {
  const list = W.muralList, mat = A.mat('world_mural');
  assert.deepEqual(list.map((m) => m.id), ['condor', 'fiesta', 'cerro']);
  assert.equal(W.signs.murals, 3);
  assert.ok(list[0].w >= 5.99 && list[1].w >= 5.99, `the two main paintings are 6 m wide or more: ${list.map((m) => m.w.toFixed(2))}`);
  for (const m of list) {
    assert.ok(m.run.sign > 0 && m.run.tall >= 3.4 && /^(street|plaza)/.test(m.run.src), `${m.id}: mural wall ${m.run.src} tall ${m.run.tall}`);
    assert.ok(W.muralRuns.has(m.run), `${m.id}: its wall is marked, so the flora hangs no vine on it`);
    assert.ok(m.h >= 3 && m.w >= 3.6 && m.w <= 8.01 && m.w / m.h <= 2.2001, `${m.id}: ${m.w.toFixed(2)} x ${m.h.toFixed(2)} m`);
    for (const p of m.pts) {
      const s = m.run.S.reduce((best, q) => (Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z) ? q : best));
      assert.ok(p.y + m.h <= p.cap - 0.02 && p.y + m.h <= s.outer + 0.1 && p.y >= s.inner + 0.2, `${m.id}: under the cap (${(p.cap - p.y - m.h).toFixed(2)} m to spare) and above the ground`);
      const into = (p.x - s.x) * s.nx + (p.z - s.z) * s.nz;                                 // along the street wall's outward normal: negative = in front of its face, on the street side
      assert.ok(into < 0 && into > -1.3 && p.front >= 0 && p.front <= 1.2, `${m.id}: ${into.toFixed(3)} m from the street wall face, ${p.front.toFixed(2)} m of lot wall in front of it`);
      for (const r of p.hit ?? []) assert.ok(W.muralRuns.has(r), `${m.id}: a lot wall it hangs in front of is marked too`);
      assert.deepEqual(facesAhead(p.x, p.z, -p.nx, -p.nz, p.y + 0.05), [], `${m.id}: no wall face stands in front of the painting`);
    }
    const hidden = m.pts.filter((p) => facesAhead(p.x + p.nx * 0.5, p.z + p.nz * 0.5, -p.nx, -p.nz, p.y + 0.05).length > 0);
    assert.equal(hidden.length, m.pts.length, `TEETH: half a metre closer to the wall, every point of ${m.id} is behind a face`);
    const pokes = [];                                                                       // and BETWEEN the points: a corner of a lot wall used to stand through the paint (the condor's seam)
    for (let i = 0; i + 1 < m.pts.length; i++) {
      const p = m.pts[i], q = m.pts[i + 1];
      for (let f = 0.05; f < 1; f += 0.1) {
        const nx = p.nx + (q.nx - p.nx) * f, nz = p.nz + (q.nz - p.nz) * f, l = Math.hypot(nx, nz) || 1;
        const x = p.x + (q.x - p.x) * f + (nx / l) * 0.01, z = p.z + (q.z - p.z) * f + (nz / l) * 0.01;     // 1 cm behind the paint, looking at the street: a face found is within 5 mm of it, or in front
        if (facesAhead(x, z, -nx / l, -nz / l, p.y + 0.05).length) pokes.push(`${i}+${f.toFixed(2)}`);
      }
    }
    assert.deepEqual(pokes, [], `${m.id}: no wall face touches or stands in front of the paint anywhere between its points`);
    const xs = m.pts.map((p) => p.x), zs = m.pts.map((p) => p.z);
    const tris = trianglesOn(A, mat, [Math.min(...xs) - 0.02, Math.max(...xs) + 0.02, Math.min(...zs) - 0.02, Math.max(...zs) + 0.02]);
    assert.equal(tris.length, 2 * (m.pts.length - 1), `${m.id}: two triangles per step along the wall`);
    assert.equal(tris.filter((t) => !hangsRight(t, m.ox, m.oz)).length, 0, `${m.id}: every triangle faces the street, left to right`);
    assert.ok(Math.max(...tris.map((t) => t.top)) - Math.min(...tris.map((t) => t.y)) >= m.h, `${m.id}: the quads stand ${m.h.toFixed(2)} m tall`);
    const spot = W.extra.find((e) => e.id === m.id);
    assert.ok(spot && W.occ.overlaps(spot.x, spot.z, 0.3), `${m.id}: the viewer's spot lies inside the ground the painting claimed before the poles and trees came`);
  }
  const good = trianglesOn(A, mat, [-98, 98, -98, 98])[0], own = list.find((m) => hangsRight(good, m.ox, m.oz));      // inside the rim: the paintings on the rim's own houses (edgewall.js) face the plot, not a street
  assert.ok(own, 'a mural triangle hangs right on its mural');
  for (const bad of [{ ...good, uv: good.uv.map(([u, v]) => [1 - u, v]) }, { ...good, uv: good.uv.map(([u, v]) => [u, 1 - v]) }, { ...good, nx: -good.nx, nz: -good.nz }]) assert.equal(hangsRight(bad, own.ox, own.oz), false);
});

test('no vine hangs over a painting: the flora leaves the street wall and the lot walls in front of it bare (TEETH: the world does hold plenty of vine cards, and a painting\'s box without the marking would hold some)', () => {
  const list = W.muralList, cards = A.mat('foliage_low');
  assert.ok(list.some((m) => m.pts.some((p) => p.hit?.length)), 'at least one painting hangs in front of a lot wall, or this test does not see the lot-wall case');
  const upright = (box) => trianglesOn(A, cards, box).filter((t) => t.top - t.y > 0.4);                // a vine card hangs 0.6 m and more from a crest; a grass tuft is low and small
  assert.ok(upright([-1e3, 1e3, -1e3, 1e3]).length > 100, 'the world has vine cards (and the filter sees them)');
  for (const m of list) {
    const xs = m.pts.map((p) => p.x), zs = m.pts.map((p) => p.z), y0 = Math.min(...m.pts.map((p) => p.y)), y1 = Math.max(...m.pts.map((p) => p.y)) + m.h;
    const over = upright([Math.min(...xs) - 0.8, Math.max(...xs) + 0.8, Math.min(...zs) - 0.8, Math.max(...zs) + 0.8]).filter((t) => t.top > y0 + 1.2 && t.y < y1);
    assert.equal(over.length, 0, `${m.id}: ${over.length} vine cards over the painting`);
  }
});

test('determinism: two builds of one seed agree on vehicles, discoveries, cables and geometry; another seed differs', async () => {
  const sig = (c) => JSON.stringify([c.world.vehicleList, c.world.extra, c.world.cableSpans.length, c.world.poleList, c.batch.stats(), c.physics.stats()]);
  assert.equal(sig(A), sig(B));
  assert.ok(A.world.vehicleList.length > 40, 'a real vehicle list, not an empty one');
  const C = await build(SEED + 1);
  assert.notEqual(JSON.stringify(C.world.vehicleList), JSON.stringify(A.world.vehicleList), 'TEETH: a different seed must change the list');
});

test('perimeter: nobody walks out of the plot from any edge (TEETH: without the perimeter walls most walks do)', () => {
  const real = physicsOf(A), bare = physicsOf(A, { skip: ['perimeter'] });
  const out = (ph, x, z, dx, dz) => {
    const s = { x, y: plan.heightAt(x, z), z, vy: 0, onGround: true };
    for (let i = 0; i < 300; i++) ph.move(s, dx * 0.07, dz * 0.07, 1 / 60);
    return s;
  };
  let walks = 0, escapedBare = 0; const escaped = [];
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    for (let k = 0; k < 24; k++) {
      const t = -88 + k * 7.65, x = dx ? (dx > 0 ? HALF - 3 : -HALF + 3) : t, z = dz ? (dz > 0 ? HALF - 3 : -HALF + 3) : t;
      walks++;
      const s = out(real, x, z, dx, dz);
      if (Math.abs(s.x) > HALF - 0.3 || Math.abs(s.z) > HALF - 0.3) escaped.push(`${x.toFixed(0)},${z.toFixed(0)} -> ${s.x.toFixed(1)},${s.z.toFixed(1)}`);
      const b = out(bare, x, z, dx, dz);
      if (Math.abs(b.x) > HALF + 0.5 || Math.abs(b.z) > HALF + 0.5) escapedBare++;
    }
  }
  assert.deepEqual(escaped, [], `${escaped.length} of ${walks} walks left the plot`);
  assert.ok(escapedBare >= walks * 0.5, `TEETH: only ${escapedBare} of ${walks} walks leave once the perimeter walls are removed`);
});

/** Connected components (as a count) over the nodes inside the perimeter, for a list of id-pair edges. */
function components(nodes, edges) {
  const lim = HALF - 0.6, inside = nodes.filter((n) => Math.max(Math.abs(n.x), Math.abs(n.z)) <= lim), parent = new Map(inside.map((n) => [n.id, n.id]));
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  for (const [a, b] of edges) if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b));
  return new Set(inside.map((n) => find(n.id))).size;
}

test('nav fit: the edges a prop blocks are dropped without splitting the graph; every edge that remains walks both ways WITH the prop colliders', () => {
  const fit = W.navFit, nav = plan.nav, byId = new Map(nav.nodes.map((n) => [n.id, n]));
  const props = A.physics.walls.filter((w) => w.id === 'prop').length;
  assert.ok(props > 300, `${props} prop colliders: the check would be vacuous without them`);
  assert.ok(fit && fit.checked > 400 && fit.candidates > 20, `navfit looked at ${fit?.checked} edges, ${fit?.candidates} near a prop`);
  assert.deepEqual(fit.stranded, [], 'a blocked edge that is the only link is a defect: move the prop');
  assert.ok(fit.dropped.length >= 1 && fit.dropped.length <= 16, `${fit.dropped.length} edges dropped for a prop (more than a handful means a prop module ignores navDist)`);
  assert.ok(fit.outside.length <= 4, `${fit.outside.length} edges lead out of the plot`);
  assert.equal(components(nav.nodes, nav.edges), components(nav.nodes, [...nav.edges, ...fit.dropped]), 'dropping edges must not split the graph');
  const ph = physicsOf(A), bad = [];                                                                       // an independent kernel, built here
  for (const [ia, ib] of nav.edges) {
    const a = byId.get(ia), b = byId.get(ib);
    for (const [p, q] of [[a, b], [b, a]]) { const r = walk(ph, p, q); if (!r.ok) bad.push(`${p.id}(${p.kind} ${p.x},${p.z}) -> ${q.id}(${q.kind} ${q.x},${q.z}): ${r.reason} at ${r.at}`); }
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} blocked walks of ${nav.edges.length * 2}`);
});

test('TEETH: a prop collider across a nav edge is found by the same walk', () => {
  const byId = new Map(plan.nav.nodes.map((n) => [n.id, n]));
  const edge = plan.nav.edges.find(([a, b]) => byId.get(a).kind === 'street' && byId.get(b).kind === 'street' && Math.hypot(byId.get(a).x - byId.get(b).x, byId.get(a).z - byId.get(b).z) > 2.5);
  const a = byId.get(edge[0]), b = byId.get(edge[1]), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ph = physicsOf(A);
  const nx = -(b.z - a.z), nz = b.x - a.x, l = Math.hypot(nx, nz);
  ph.addWall({ x1: mx - (nx / l) * 3, z1: mz - (nz / l) * 3, x2: mx + (nx / l) * 3, z2: mz + (nz / l) * 3, t: 0.2, y0: -5, y1: 60, id: 'prop' });
  assert.equal(walk(ph, a, b).ok, false);
});

test('TEETH: fitNav drops a blocked edge that has another way round, and keeps (reports) one that is the only link', () => {
  const nodes = plan.nav.nodes, byId = new Map(nodes.map((n) => [n.id, n])), edges = plan.nav.edges;
  const deg = new Map(); for (const [a, b] of edges) { deg.set(a, (deg.get(a) ?? 0) + 1); deg.set(b, (deg.get(b) ?? 0) + 1); }
  const inside = ([a, b]) => [a, b].every((id) => Math.max(Math.abs(byId.get(id).x), Math.abs(byId.get(id).z)) < HALF - 3) && Math.hypot(byId.get(a).x - byId.get(b).x, byId.get(a).z - byId.get(b).z) > 2.5;
  const loop = edges.find((e) => inside(e) && deg.get(e[0]) >= 2 && deg.get(e[1]) >= 2 && components(nodes, edges.filter((x) => x !== e)) === components(nodes, edges));
  const leaf = edges.find((e) => inside(e) && (deg.get(e[0]) === 1 || deg.get(e[1]) === 1));
  assert.ok(loop && leaf, 'the plan has a loop edge and a dead-end edge to test with');
  const across = (e) => { const a = byId.get(e[0]), b = byId.get(e[1]), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, nx = -(b.z - a.z), nz = b.x - a.x, l = Math.hypot(nx, nz); return { x1: mx - (nx / l) * 2.5, z1: mz - (nz / l) * 2.5, x2: mx + (nx / l) * 2.5, z2: mz + (nz / l) * 2.5, t: 0.2, y0: -50, y1: 90, id: 'prop' }; };
  const ctx = { plan: { ...plan, nav: { nodes, edges: edges.slice() } }, physics: { walls: [...A.physics.walls, across(loop), across(leaf)] } };
  const fit = fitNav(ctx);
  const has = (list, e) => list.some(([a, b]) => (a === e[0] && b === e[1]) || (a === e[1] && b === e[0]));
  assert.ok(has(fit.dropped, loop), 'the blocked loop edge is dropped');
  assert.ok(!has(ctx.plan.nav.edges, loop), '... and gone from plan.nav');
  assert.ok(has(fit.stranded, leaf) && has(ctx.plan.nav.edges, leaf), 'the blocked dead-end edge is reported and kept');
  assert.equal(components(nodes, ctx.plan.nav.edges), components(nodes, edges), 'the graph is still whole');
});

test('settle: a discovery that sits inside its own object is moved beside it (TEETH: the post itself is not a free spot)', () => {
  const K = makeKit(A, plan, W.occ), post = A.physics.walls.find((w) => w.id === 'prop' && w.x1 === w.x2 && w.z1 === w.z2 && w.t >= 0.1 && Math.abs(w.x1) < 80 && Math.abs(w.z1) < 80);
  assert.ok(post, 'a round prop collider (a post) to stand on');
  const ph = physicsOf(A);
  assert.ok(pushedBy(ph, post.x1, post.z1, plan.heightAt(post.x1, post.z1)) > 0.05, 'the post pushes a walker standing on it');
  const [x, z] = settle(K, post.x1, post.z1), d = Math.hypot(x - post.x1, z - post.z1);
  assert.ok(d > 0.3 && d <= 3.0, `moved ${d.toFixed(2)} m`);
  assert.ok(pushedBy(ph, x, z, plan.heightAt(x, z)) < 0.05, 'and the new spot is free');
});

/** The linear luminance of the average colour (sRGB '#rrggbb') the texture manifest records for a swatch: a vertex tint times this is the brightness a trunk is drawn at. */
function swatchLuminance(name) {
  const hex = JSON.parse(readFileSync(new URL('../assets/textures/manifest.json', import.meta.url), 'utf8')).textures[name].avg;
  const [r, g, b] = [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test('a eucalyptus is a curved, mottled trunk with a dark foot and a tuft on every limb (TEETH: the first one was a straight pale pole with one crown, a white lamp post with a tuft on top, R1-012)', () => {
  const lum = (c, i) => 0.2126 * c[3 * i] + 0.7152 * c[3 * i + 1] + 0.0722 * c[3 * i + 2], mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1), swatch = swatchLuminance('bark_eucalyptus');
  const measure = (tree, i) => {                                                                       // build one tree alone (h 14 m) and read its bark and leaf accumulators
    const b = new MeshBuilder(), K = { b: () => b, H: () => 0, post() {}, occ: { take() {} }, atlas: null };
    tree(K, 0, 0, { rng: A.rng.fork('euca-test:' + i), h: 14 });
    const bark = b.accs.get('bark_euca') ?? { pos: [], col: [] }, n = bark.pos.length / 3, rings = [], low = [], high = [], all = [];
    let cur = null;
    for (const i of [...Array(n).keys()].filter((v) => bark.pos[3 * v + 1] < 7.6).sort((p, q) => bark.pos[3 * p + 1] - bark.pos[3 * q + 1])) {   // the trunk below the lowest limb (8.1 m), ring by ring
      const y = bark.pos[3 * i + 1], l = lum(bark.col, i);
      all.push(l); if (y < 0.6) low.push(l); else if (y > 1.8) high.push(l);
      if (!cur || y - cur.last > 0.5) rings.push(cur = { v: [] });
      cur.v.push(i); cur.last = y;
    }
    const c = rings.map((r) => [0, 1, 2].map((k) => mean(r.v.map((i) => bark.pos[3 * i + k]))));
    let bend = 0;                                                                                       // the furthest a ring centre strays from the straight line through the first and the last
    if (c.length >= 3) {
      const a = c[0], d = c[c.length - 1].map((v, k) => v - a[k]), L2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
      for (const p of c.slice(1, -1)) { const f = p.reduce((s, v, k) => s + (v - a[k]) * d[k], 0) / L2; bend = Math.max(bend, Math.hypot(...p.map((v, k) => v - a[k] - f * d[k]))); }
    }
    return { rings: rings.length, lum: mean(all) * swatch, foot: mean(low) / mean(high), bend, cards: (b.accs.get('foliage')?.pos.length ?? 0) / 12, col: bark.col.join() };      // the tint times the swatch's own brightness
  };
  const good = (t) => t.rings >= 4 && t.lum < 0.3 && t.foot < 0.7 && t.bend > 0.05 && t.cards >= 30, trees = [0, 1, 2, 3, 4, 5].map((i) => measure(eucalyptus, i));
  for (const t of trees) {
    assert.ok(t.rings >= 4, `${t.rings} rings of bark below the limbs: the trunk is a chain of short tubes, not one pole`);
    assert.ok(t.lum < 0.3, `mean bark luminance ${t.lum.toFixed(2)} (the pole drawn on the swatch is ${(0.97 * swatch).toFixed(2)}, the first pole alone was 0.53)`);
    assert.ok(t.foot < 0.7, `the foot is ${t.foot.toFixed(2)} of the upper trunk's brightness`);
    assert.ok(t.bend > 0.05, `the trunk strays ${t.bend.toFixed(3)} m from a straight line`);
    assert.ok(t.cards >= 30, `${t.cards} leaf cards: one crown and a tuft on each of the limbs`);
  }
  assert.ok(new Set(trees.map((t) => t.col)).size > 1, 'the bark is not the same pattern on every tree');
  // TEETH: the first tree, rebuilt here (one straight tube, one crown of 17 cards), fails the same measure
  const pole = measure((K, x, z) => { tube(K.b(), 'bark_euca', [0, -0.3, 0], [0.4, 14, 0.2], 0.2, 0.08, 7, { col: [1, 0.97, 0.93] }); }, 0);
  assert.ok(!good(pole) && pole.rings < 4 && pole.lum > 0.3 && !(pole.foot < 0.7) && pole.cards < 30, JSON.stringify({ ...pole, col: '' }));
});

test('an agave is a rosette of real blades and a banana a ringed pseudostem, cream at the foot and green under the crown (TEETH: the first agave was three crossed cards and the banana one plain tube)', () => {
  const stub = (fn, i) => { const b = new MeshBuilder(), K = { b: () => b, H: () => 0, post() {}, occ: { take() {} }, atlas: null }; fn(K, 0, 0, { rng: A.rng.fork('veg-test:' + i) }); return b; };
  const agaveOf = (b) => {
    const acc = b.accs.get('plaster_a') ?? { pos: [], col: [], idx: [] }, n = acc.pos.length / 3;
    let far = 0, top = 0, red = 0, green = 0;
    for (let i = 0; i < n; i++) { far = Math.max(far, Math.hypot(acc.pos[3 * i], acc.pos[3 * i + 2])); top = Math.max(top, acc.pos[3 * i + 1]); red += acc.col[3 * i]; green += acc.col[3 * i + 1]; }
    return { tris: acc.idx.length / 3, far, top, grey: (green - red) / Math.max(1, n), cards: (b.accs.get('foliage_low')?.idx.length ?? 0) / 3 };
  };
  const stemOf = (b) => {
    const acc = b.accs.get('trunk_banana') ?? { pos: [], col: [] }, n = acc.pos.length / 3, ys = new Set();
    let lo = { r: 0, n: 0, rad: 0 }, hi = { r: 0, n: 0, rad: 0 }, dark = Infinity, bright = 0, top = 0;
    for (let i = 0; i < n; i++) top = Math.max(top, acc.pos[3 * i + 1]);
    for (let i = 0; i < n; i++) {
      const y = acc.pos[3 * i + 1], rad = Math.hypot(acc.pos[3 * i], acc.pos[3 * i + 2]), l = acc.col[3 * i] + acc.col[3 * i + 1] + acc.col[3 * i + 2];
      ys.add(y.toFixed(2)); dark = Math.min(dark, l); bright = Math.max(bright, l);
      const part = y < top * 0.3 ? lo : y > top * 0.7 ? hi : null;
      if (part && rad > 0.01) { part.r += acc.col[3 * i]; part.n++; part.rad += rad; }
    }
    return { levels: ys.size, red: [lo.r / Math.max(1, lo.n), hi.r / Math.max(1, hi.n)], rad: [lo.rad / Math.max(1, lo.n), hi.rad / Math.max(1, hi.n)], contrast: dark / Math.max(bright, 1e-6) };
  };
  for (let i = 0; i < 6; i++) {
    const a = agaveOf(stub(agave, i)), s = stemOf(stub(banana, i));
    assert.ok(a.tris >= 100 && a.cards === 0, `agave ${i}: ${a.tris} blade triangles, ${a.cards} cards`);
    assert.ok(a.far > 0.45 && a.top > 0.3, `agave ${i}: the rosette spreads ${a.far.toFixed(2)} m and stands ${a.top.toFixed(2)} m`);
    assert.ok(a.grey > 0.12, `agave ${i}: the blades are grey-green (green minus red ${a.grey.toFixed(2)})`);
    assert.ok(s.levels >= 7, `banana ${i}: ${s.levels} rings of trunk`);
    assert.ok(s.red[0] > s.red[1] + 0.08, `banana ${i}: cream at the foot (${s.red[0].toFixed(2)}), green at the crown (${s.red[1].toFixed(2)})`);
    assert.ok(s.rad[0] > s.rad[1] * 1.3, `banana ${i}: the trunk tapers (${s.rad[0].toFixed(3)} to ${s.rad[1].toFixed(3)})`);
    assert.ok(s.contrast < 0.5, `banana ${i}: dark scars between the rings (${s.contrast.toFixed(2)}; the cream-to-green fade alone is 0.69)`);
  }
  // TEETH: the old ones fail the same measures
  const cards = new MeshBuilder();
  for (let k = 0; k < 3; k++) card(cards, 'foliage_low', [0, 0, 0], [Math.cos(k), 0, -Math.sin(k)], [0, 1, 0], 1.7, 1.3, [0, 0, 1, 1], [1, 1, 1], [0, 1, 0]);
  const oldAgave = agaveOf(cards), pipe = new MeshBuilder();
  tube(pipe, 'trunk_banana', [0, -0.1, 0], [0, 2.2, 0], 0.13, 0.08, 6, { col: [0.55, 0.62, 0.38] });
  const oldBanana = stemOf(pipe);
  assert.ok(oldAgave.tris < 100 && oldAgave.cards === 6, `TEETH: the crossed cards are ${oldAgave.tris} blade triangles and ${oldAgave.cards} cards`);
  assert.ok(oldBanana.levels < 7 && !(oldBanana.red[0] > oldBanana.red[1] + 0.08) && !(oldBanana.contrast < 0.5), `TEETH: the plain tube ${JSON.stringify(oldBanana)}`);
});

test('an agave leaf is curved, channelled and toothed, shaded smooth, and the rosette keeps the stream where it was (R1-D25) (TEETH: the round-4 agave, flat triangles of one normal each, has none of it)', () => {
  const stub = (fn, i) => { const b = new MeshBuilder(), K = { b: () => b, H: () => 0, post() {}, occ: { take() {} }, atlas: null }; const rng = A.rng.fork('agave-r5:' + i); fn(K, 0, 0, { rng }); return { b, rng }; };
  const measure = (b) => {
    const acc = b.accs.get('plaster_a') ?? { pos: [], nor: [], col: [], idx: [] }, tris = acc.idx.length / 3, nd = (p, q) => acc.nor[3 * p] * acc.nor[3 * q] + acc.nor[3 * p + 1] * acc.nor[3 * q + 1] + acc.nor[3 * p + 2] * acc.nor[3 * q + 2];
    let smooth = 0, points = 0, hi = 0, lo = Infinity;
    for (let t = 0; t < tris; t++) {
      const i = acc.idx[3 * t], j = acc.idx[3 * t + 1], k = acc.idx[3 * t + 2];
      if (Math.min(nd(i, j), nd(j, k), nd(i, k)) < 0.999) smooth++;                                                  // the three corners do not share one normal: a rounded surface
      if ([i, j, k].some((v) => acc.col[3 * v + 1] - acc.col[3 * v] < 0.04)) points++;                               // an olive-brown point (green hardly above red): a tooth or the spine at a leaf's tip
    }
    for (let v = 0; v < acc.pos.length / 3; v++) { hi = Math.max(hi, acc.pos[3 * v + 1]); lo = Math.min(lo, acc.pos[3 * v + 1]); }
    return { tris, smooth: smooth / Math.max(1, tris), points, hi, lo };
  };
  for (let i = 0; i < 6; i++) {
    const m = measure(stub(agave, i).b);
    assert.ok(m.tris >= 600 && m.tris <= 900, `agave ${i}: ${m.tris} triangles in the blades (the flat ones had 108; the world's budget allows about 800)`);
    assert.ok(m.smooth > 0.6, `agave ${i}: ${(m.smooth * 100).toFixed(0)}% of the triangles are smooth-shaded (a leaf is curved, not folded)`);
    assert.ok(m.points >= 100, `agave ${i}: ${m.points} triangles with a dark point: the teeth along the margins and the spine at each tip`);
    assert.ok(m.hi > 0.8 && m.lo < 0.02, `agave ${i}: the heart stands ${m.hi.toFixed(2)} m and the outer leaves droop to ${m.lo.toFixed(2)} m`);
  }
  // the flora stream: after an agave the generator stands where the flat blades left it (4 numbers of its own and 54 burnt), so the plants placed after one do not move
  const probe = A.rng.fork('agave-r5:stream'), same = A.rng.fork('agave-r5:stream');
  agave({ b: () => new MeshBuilder(), H: () => 0 }, 0, 0, { rng: probe });
  for (let i = 0; i < 4 + 54; i++) same.next();
  assert.equal(probe.s, same.s, 'an agave takes exactly 58 numbers from the stream, as the flat blades did');
  // TEETH: the round-4 agave, rebuilt (three rings of flat triangles, one normal per triangle, no teeth), fails the same measures
  const old = new MeshBuilder(), orng = A.rng.fork('agave-r5:old'), os = 1.3, orot = orng.range(0, 6.28);
  const lo = [0.3, 0.46, 0.34], hi = [0.5, 0.68, 0.66];
  for (const [n, tilt, len, wid] of [[4, 0.14, 0.62, 0.075], [6, 0.62, 0.86, 0.1], [8, 1.12, 0.98, 0.11]]) {
    for (let i = 0; i < n; i++) {
      const a = orot + (i / n) * Math.PI * 2 + tilt, t = tilt, L = os * len, w = os * wid;
      const dir = [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)], side = [-Math.sin(a), 0, Math.cos(a)];
      const p0 = [dir[0] * 0.05, 0.02, dir[2] * 0.05], pm = V.add(p0, V.mul(dir, L * 0.45)), tip = V.add(V.add(p0, V.mul(dir, L)), [0, -0.1 * L * Math.min(1.2, t), 0]);
      const bl = V.sub(p0, V.mul(side, w * 0.55)), br = V.add(p0, V.mul(side, w * 0.55)), ml = V.sub(pm, V.mul(side, w)), mr = V.add(pm, V.mul(side, w));
      for (const flip of [false, true]) { const T = (p, q, u, c) => (flip ? old.tri('plaster_a', p, u, q, { col: c }) : old.tri('plaster_a', p, q, u, { col: c })); T(bl, br, mr, lo); T(bl, mr, ml, lo); T(ml, mr, tip, hi); }
    }
  }
  const was = measure(old);
  assert.ok(was.tris < 600 && !(was.smooth > 0.6) && was.points < 100, `TEETH: the flat blades are ${was.tris} triangles, ${(was.smooth * 100).toFixed(0)}% smooth, ${was.points} with a point`);
});

test('the rim is planted (R1-D02): trees, a hedge and agaves stand 2 to 6.5 m inside the perimeter wall on all four sides, none on the road, none against the wall (TEETH: the belt is the cause of the count)', () => {
  const sp = W.flora, posts = A.physics.walls.filter((w) => w.id === 'prop' && w.x1 === w.x2 && w.z1 === w.z2 && w.t >= 0.2), side = { n: 0, e: 0, w: 0, s: 0 }, tooClose = [];   // a trunk is a post 0.2 m thick or more (a lamp or a sign post is thinner)
  assert.ok(sp.rim >= 200, `${sp.rim} plants of the belt`);
  for (const p of posts) {
    const gapTo = { n: p.z1 + 99.55, s: 99.55 - p.z1, w: p.x1 + 99.55, e: 99.55 - p.x1 };
    for (const k of Object.keys(side)) if (gapTo[k] > 0.6 && gapTo[k] < 7) { side[k]++; if (gapTo[k] < 1.5) tooClose.push(`${k} ${p.x1.toFixed(1)},${p.z1.toFixed(1)}`); }
  }
  for (const k of Object.keys(side)) assert.ok(side[k] >= 15, `${side[k]} trunks within 7 m of the ${k} wall: ${JSON.stringify(side)}`);
  assert.deepEqual(tooClose, [], 'no trunk leans on the wall');
  const gate = W.gate, atGate = posts.filter((p) => p.z1 > 90 && Math.abs(p.x1 - gate.x) < 4.5);
  assert.deepEqual(atGate.map((p) => `${p.x1.toFixed(1)},${p.z1.toFixed(1)}`), [], 'nothing grows across the entry road');
});

const PERIM = { plane: HALF - 0.65, in: { s: [0, -1], n: [0, 1], e: [-1, 0], w: [1, 0] } };                // the face of the perimeter wall that looks into the plot lies 0.2 m inside the panels' axis, 99.35 m from the middle
const lumOf = (C, i) => 0.2126 * C.getX(i) + 0.7152 * C.getY(i) + 0.0722 * C.getZ(i);
const normalOf = (p) => { const a = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], b = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]], n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], l = Math.hypot(...n) || 1; return n.map((x) => x / l); };
/** The triangles on the plot-side face of the perimeter wall: { side, dot: how squarely it faces the plot, p: its corners, h: their heights over the ground, L: their luminance }. */
function perimeterFace(ctx) {
  const out = [];
  ctx.scene.traverse((o) => {
    const m = /^props\.boundary\.([snew]):/.exec(o.name);
    if (!o.isMesh || !m) return;
    const side = m[1], across = side === 's' || side === 'n' ? 2 : 0, g = o.geometry, P = g.attributes.position, C = g.attributes.color, I = g.index, n = PERIM.in[side];
    for (let t = 0; t < I.count; t += 3) {
      const ids = [0, 1, 2].map((k) => I.getX(t + k)), p = ids.map((i) => [P.getX(i), P.getY(i), P.getZ(i)]);
      if (!p.every((q) => Math.abs(Math.abs(q[across]) - PERIM.plane) < 0.003)) continue;
      const nr = normalOf(p);
      out.push({ side, dot: nr[0] * n[0] + nr[2] * n[1], p, h: p.map((q) => q[1] - ctx.plan.heightAt(q[0], q[2])), L: ids.map((i) => lumOf(C, i)) });
    }
  });
  return out;
}
/** What is wrong with the inside face of the perimeter wall (R1-D02, a blank stepped screen): a panel without it, a triangle that faces away, no damp foot, no grain along the top. */
function insideProblems(tris, panels) {
  const out = [], mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  if (tris.length < panels * 12) out.push(`${tris.length} triangles on ${panels} panels: some panel has no face looking into the plot (the boxes leave it out)`);
  const away = tris.filter((t) => t.dot < 0.99).length;
  if (away) out.push(`${away} triangles of the face do not face the plot: a hole in the wall from inside`);
  const at = (lo, hi) => tris.flatMap((t) => t.h.map((h, k) => [h, t.L[k]])).filter(([h]) => h > lo && h < hi).map(([, l]) => l);
  const foot = mean(at(0.3, 0.4)), mid = mean(at(0.95, 1.05));
  if (!(foot < mid * 0.85)) out.push(`the foot (${foot.toFixed(2)}) is no darker than the wall a metre up (${mid.toFixed(2)}): no damp`);
  let sum = 0, n = 0;                                                                                  // two vertices of one triangle at one height and a metre or more apart: a row of a panel
  for (const t of tris) for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    if (Math.abs(t.p[a][1] - t.p[b][1]) > 1e-4 || Math.hypot(t.p[a][0] - t.p[b][0], t.p[a][2] - t.p[b][2]) < 0.9) continue;
    sum += Math.abs(t.L[a] - t.L[b]) / ((t.L[a] + t.L[b]) / 2); n++;
  }
  if (!(n > 300 && sum / n > 0.012)) out.push(`along a row of a panel the tone changes by ${(sum / (n || 1) * 100).toFixed(2)} % (${n} pairs): a flat colour, wall after wall`);
  return out;
}
/** The posters and tags pasted on that face: every quad of props.boundary.dress:world_sign, { side, dot, gap: in front of the face, along: its centre, w, y0, y1: heights over the ground }. */
function dressQuads(ctx) {
  const out = [];
  ctx.scene.traverse((o) => {
    if (!o.isMesh || o.name !== 'props.boundary.dress:world_sign') return;
    const P = o.geometry.attributes.position, I = o.geometry.index;
    for (let t = 0; t < I.count; t += 6) {
      const ids = [...new Set([0, 1, 2, 3, 4, 5].map((k) => I.getX(t + k)))], p = ids.map((i) => [P.getX(i), P.getY(i), P.getZ(i)]);
      const xs = p.map((q) => q[0]), zs = p.map((q) => q[2]), onX = Math.max(...zs) - Math.min(...zs) < 1e-4, across = onX ? zs[0] : xs[0];        // a quad on the s or n wall has one z
      const side = onX ? (across > 0 ? 's' : 'n') : (across > 0 ? 'e' : 'w'), a = onX ? xs : zs, cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2, g = ctx.plan.heightAt(cx, cz);
      out.push({ side, dot: normalOf([p[0], p[1], p[2]]).reduce((s, x, k) => s + x * [PERIM.in[side][0], 0, PERIM.in[side][1]][k], 0), gap: PERIM.plane - Math.abs(across), along: (Math.min(...a) + Math.max(...a)) / 2, w: Math.max(...a) - Math.min(...a), y0: Math.min(...p.map((q) => q[1])) - g, y1: Math.max(...p.map((q) => q[1])) - g });
    }
  });
  return out;
}
/** What is wrong with the posters and tags: too few, too alike, behind the face or inside the next wall at a corner, facing away, on the ground or over the crest, the wrong size. */
function dressProblems(quads, stats) {
  const out = [], kinds = new Set(stats.papers);
  if (quads.length !== stats.posters + stats.tags || quads.length < 40) out.push(`${quads.length} quads for ${stats.posters} posters and ${stats.tags} tags (40 and more are wanted)`);
  if (kinds.size < 4 || ![...kinds].some((k) => k.startsWith('tag.')) || ![...kinds].some((k) => k.startsWith('poster.'))) out.push(`${kinds.size} kinds of paper: ${[...kinds]}`);
  const bad = (name, f) => { const c = quads.filter(f).length; if (c) out.push(`${c} papers ${name}`); };
  bad('face away from the plot', (q) => q.dot < 0.99);
  bad('are not a hair in front of the wall (1 cm to 3 cm)', (q) => q.gap < 0.005 || q.gap > 0.03);
  bad('reach the corner, where the next wall buries them', (q) => Math.abs(q.along) + q.w / 2 > PERIM.plane);
  bad('hang lower than a half metre or higher than 2.3 m', (q) => q.y0 < 0.5 || q.y1 > 2.3);
  bad('are neither a poster (0.34 m wide) nor a tag (0.9 m wide)', (q) => Math.abs(q.w - 0.34) > 0.02 && Math.abs(q.w - 0.9) > 0.02);
  return out;
}
/**
 * Bougainvillea hung over the crest (flora.js drape): the upright foliage_low triangles in the 0.6 m before the plot-side face of each wall whose top edge lies 12 cm over the crest of the
 * panel they hang from. { side: triangles }. Shrubs and tufts that stand near the wall have no such top edge.
 */
function perimeterVines(ctx, tris) {
  const out = { s: 0, n: 0, e: 0, w: 0 }, crest = new Map(), alongOf = (side, p) => (side === 's' || side === 'n' ? p[0] : p[2]), panelOf = (a) => Math.floor((a + HALF - 0.2) / 2);
  for (const t of tris) for (const p of t.p) {                                                          // the crest of each panel, read off the vertex at the middle of its top row
    const a = alongOf(t.side, p), f = (a + HALF - 0.2) / 2 - panelOf(a);
    if (Math.abs(f - 0.5) < 0.01) { const k = t.side + panelOf(a); crest.set(k, Math.max(crest.get(k) ?? -Infinity, p[1])); }
  }
  const cards = ctx.mat('foliage_low');
  ctx.scene.traverse((o) => {
    if (!o.isMesh || o.material !== cards) return;
    const P = o.geometry.attributes.position, I = o.geometry.index;
    for (let t = 0; t < I.count; t += 3) {
      const p = [0, 1, 2].map((k) => I.getX(t + k)).map((i) => [P.getX(i), P.getY(i), P.getZ(i)]), x = (p[0][0] + p[1][0] + p[2][0]) / 3, z = (p[0][2] + p[1][2] + p[2][2]) / 3, top = Math.max(...p.map((q) => q[1]));
      const side = Math.abs(z) > Math.abs(x) ? (z > 0 ? 's' : 'n') : (x > 0 ? 'e' : 'w'), across = Math.max(Math.abs(x), Math.abs(z));
      if (!(across > PERIM.plane - 0.6 && across < PERIM.plane - 0.04)) continue;                          // in front of the face, not inside the wall
      const k = panelOf(alongOf(side, [x, 0, z]));
      if ([k - 1, k, k + 1].some((j) => Math.abs(top - ((crest.get(side + j) ?? -Infinity) + 0.12)) < 0.01)) out[side]++;
    }
  });
  return out;
}

test('the perimeter wall is not a blank screen (R1-D02): its face into the plot is toned (a damp foot, blotches), posters and tags are pasted on it, and bougainvillea hangs over its crest (TEETH: a flat face, a face turned away, papers behind or at a corner, a missing face and no vines are each found)', () => {
  const tris = perimeterFace(A), panels = W.boundary.panels;
  assert.ok(panels > 350 && tris.length >= panels * 12, `${tris.length} triangles on the faces of ${panels} panels`);
  assert.deepEqual(insideProblems(tris, panels), []);
  assert.equal(insideProblems(tris.map((t) => ({ ...t, L: t.L.map(() => 0.9) })), panels).length, 2, 'TEETH: a flat colour has neither a damp foot nor any grain');
  assert.equal(insideProblems(tris.map((t) => ({ ...t, L: t.L.map((l, k) => (t.h[k] < 0.5 ? l / 0.7 : l)) })), panels).length, 1, 'TEETH: a foot as bright as the wall fails on the damp alone');
  assert.equal(insideProblems(tris.map((t) => ({ ...t, dot: -t.dot })), panels).length, 1, 'TEETH: a face turned away is found');
  assert.equal(insideProblems(tris.filter((_, k) => k % 2), panels).length, 1, 'TEETH: half the faces gone is found');
  const quads = dressQuads(A);
  assert.deepEqual(dressProblems(quads, W.boundary), []);
  assert.ok(dressProblems([], W.boundary).length > 0, 'TEETH: no papers at all is found');
  assert.equal(dressProblems(quads.map((q) => ({ ...q, dot: -q.dot })), W.boundary).length, 1, 'TEETH: papers facing the wall are found');
  assert.equal(dressProblems(quads.map((q) => ({ ...q, gap: q.gap - 0.1 })), W.boundary).length, 1, 'TEETH: papers inside the wall are found');
  assert.equal(dressProblems(quads.map((q, k) => (k ? q : { ...q, along: Math.sign(q.along) * (PERIM.plane - 0.1) })), W.boundary).length, 1, 'TEETH: one paper at a corner is found');
  assert.equal(dressProblems(quads.map((q) => ({ ...q, y0: q.y0 - 0.7, y1: q.y1 - 0.7 })), W.boundary).length, 1, 'TEETH: papers on the ground are found');
  const vines = perimeterVines(A, tris);
  for (const k of ['s', 'n', 'e', 'w']) assert.ok(vines[k] >= 20, `${vines[k]} vine card triangles hang over the ${k} wall: ${JSON.stringify(vines)}`);
});

/** one prop alone in a MeshBuilder (the kit stub: flat ground, the real THREE for the pose matrix) */
function alone(fn) {
  const b = new MeshBuilder(), K = { ctx: A, b: () => b, H: () => 0, rect() {}, post() {}, occ: { take() {} }, atlas: null };
  fn(K, b);
  return b;
}
const triOf = (acc) => { const t = [], p = acc.pos, I = acc.idx; for (let i = 0; i + 2 < I.length; i += 3) t.push([I[i], I[i + 1], I[i + 2]].map((k) => [p[3 * k], p[3 * k + 1], p[3 * k + 2]])); return t; };

test('a motorbike rolls on round tyres and spoked wheels, with a shaped tank and seat (TEETH: the first one was flat cylinders with a grey disc each and box bodywork, R1-012)', () => {
  const b = alone((K, bb) => moto(K, bb, 0, 0, 0, 0, 0, { hex: 0xb8222a, hex2: 0x1c1c20 })), tyre = b.accs.get('tyre'), chrome = b.accs.get('chrome');
  const front = [0, 0.3, 0.66], rad = (p) => Math.hypot(p[1] - front[1], p[2] - front[2]);
  const ring = new Set(), fp = [];
  for (let i = 0; i < tyre.pos.length; i += 3) { const p = [tyre.pos[i], tyre.pos[i + 1], tyre.pos[i + 2]]; if (Math.hypot(p[1] - front[1], p[2] - front[2]) < 0.31 && p[2] > 0.3) { ring.add(Math.round(rad(p) * 1000)); fp.push(p); } }
  assert.ok(ring.size >= 3, `${ring.size} distinct tyre radii on the front wheel (a rounded tread has the shoulder, the quarter and the crown)`);
  const spokes = triOf(chrome).filter((t) => t.every((p) => rad(p) < 0.2 && Math.abs(p[0]) < 0.08 && p[2] > 0.4)).length;
  assert.ok(spokes >= 100, `${spokes} chrome triangles inside the front rim (hub, rim ring and ten crossed spokes on each face)`);
  assert.ok(b.tris >= 500 && b.tris < 2500, `${b.tris} triangles for the whole bike`);
  const paint = b.accs.get('car_paint'), width = (z0, z1) => { let hw = 0; for (let i = 0; i < paint.pos.length; i += 3) if (paint.pos[i + 2] >= z0 && paint.pos[i + 2] <= z1 && paint.pos[i + 1] >= 0.79) hw = Math.max(hw, Math.abs(paint.pos[i])); return hw; };
  assert.ok(width(0.4, 0.45) < 0.7 * width(0.1, 0.18), `the tank is ${width(0.4, 0.45).toFixed(3)} m half-wide at the steering head and ${width(0.1, 0.18).toFixed(3)} where the knees grip (a teardrop, not a straight tube)`);
  const cycle = alone((K, bb) => bicycle(K, bb, 0, 0, 0, 0, 0, { hex: 0x2b4f7e })), cs = triOf(cycle.accs.get('chrome')).filter((t) => t.every((p) => Math.hypot(p[1] - 0.33, p[2] - 0.55) < 0.3 && Math.abs(p[0]) < 0.06)).length;
  assert.ok(cs >= 150, `${cs} chrome triangles inside the bicycle's front rim (the spokes)`);
  // TEETH: the same measures on a flat wheel (the old one: one cylinder, one hub disc) fail
  const flat = alone((K, bb) => { tube(bb, 'tyre', [-0.045, 0.3, 0.66], [0.045, 0.3, 0.66], 0.3, 0.3, 12, { col: [0.07, 0.07, 0.08] }); tube(bb, 'chrome', [-0.05, 0.3, 0.66], [0.05, 0.3, 0.66], 0.17, 0.17, 8, { col: [0.8, 0.8, 0.8] }); });
  const flatRadii = new Set(); for (let i = 0; i < flat.accs.get('tyre').pos.length; i += 3) flatRadii.add(Math.round(Math.hypot(flat.accs.get('tyre').pos[i + 1] - 0.3, flat.accs.get('tyre').pos[i + 2] - 0.66) * 1000));
  assert.ok(flatRadii.size < 3 && triOf(flat.accs.get('chrome')).length < 100, 'the flat wheel is what the measures reject');
});

test('rubbish sacks are tied bags: closed seams, outward faces, a knot at the neck (TEETH: the old ones were seven-sided cones, and a flipped winding shows nothing)', () => {
  const b = alone((K, bb) => { for (let i = 0; i < 8; i++) rubbish(K, bb, i * 3, 0, A.rng.fork('sack:' + i)); }), acc = b.accs.get('bag');
  const tris = triOf(acc), nor = (k) => [acc.nor[3 * k], acc.nor[3 * k + 1], acc.nor[3 * k + 2]];
  assert.ok(tris.length >= 8 * 3 * 100, `${tris.length} sack triangles in at least 24 sacks`);
  let facing = 0, n = 0;
  for (let i = 0; i + 2 < acc.idx.length; i += 3) {
    const [p, q, r] = [0, 1, 2].map((k) => [acc.pos[3 * acc.idx[i + k]], acc.pos[3 * acc.idx[i + k] + 1], acc.pos[3 * acc.idx[i + k] + 2]]), s = nor(acc.idx[i]);
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]], g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(...g) < 1e-9) continue;                                                                    // a sliver at the closed neck
    n++; if (g[0] * s[0] + g[1] * s[1] + g[2] * s[2] > 0) facing++;
  }
  assert.ok(facing / n > 0.97, `${facing} of ${n} sack triangles wind the way their normal points (the rest would be culled)`);
  const tall = Math.max(...Array.from({ length: acc.pos.length / 3 }, (_, k) => acc.pos[3 * k + 1]));
  assert.ok(tall > 0.25 && tall < 0.9, `the tallest sack top is ${tall.toFixed(2)} m`);
  const lum = (k) => acc.col[3 * k] + acc.col[3 * k + 1] + acc.col[3 * k + 2];
  assert.ok(Array.from({ length: acc.col.length / 3 }, (_, k) => lum(k)).every((l) => l < 3 * 0.8), 'no sack is brighter than a pale bag: a hex read as linear made them mint');
});

test('the sleeping dog is brown, not cream, and shaded round its girth (TEETH: the old coat was sRGB 225 200 163 and read as a white blob in the sun)', () => {
  const dog = A.scene.getObjectByName('dog.perro'), body = dog?.getObjectByName('dog.body'), lum = [], back = [], flank = [];
  assert.ok(dog && body, 'the sleeping dog is in the scene');
  const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  dog.traverse((o) => { const c = o.isMesh && o.geometry.getAttribute('color'); if (c) for (let i = 0; i < c.count; i++) lum.push(0.2126 * c.getX(i) + 0.7152 * c.getY(i) + 0.0722 * c.getZ(i)); });
  body.traverse((o) => {                                                                                    // the front ring of the torso tube (x = 0.2, centre height 0.17, radius 0.17): its top against its sides
    const c = o.isMesh && o.geometry.getAttribute('color'), p = c && o.geometry.getAttribute('position');
    if (c) for (let i = 0; i < c.count; i++) {
      const l = 0.2126 * c.getX(i) + 0.7152 * c.getY(i) + 0.0722 * c.getZ(i), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (Math.abs(x - 0.2) > 0.01 || Math.hypot(y - 0.17, z) > 0.2 || Math.hypot(y - 0.17, z) < 0.12) continue;
      if (y > 0.3) back.push(l); else if (Math.abs(y - 0.17) < 0.05) flank.push(l);
    }
  });
  assert.ok(lum.length > 100 && mean(lum) < 0.52, `${lum.length} dog vertices, mean luminance ${mean(lum).toFixed(2)} (the cream dog was above 0.6)`);
  assert.ok(back.length >= 1 && flank.length >= 2 && mean(flank) - mean(back) > 0.12, `back ${mean(back).toFixed(2)} (${back.length} vertices), flank ${mean(flank).toFixed(2)} (${flank.length}): a dark saddle over paler sides`);
});

test('the far land is ONE mesh (116 tiles of 100-150 m were 54 draw calls in the spawn view: each is wider than the merge span, so nothing fused them)', () => {
  const ids = [...A.batch.groups.keys()].filter((id) => id.startsWith('world.terrain.far'));
  assert.deepEqual(ids, ['world.terrain.far']);
  const ms = A.batch.groups.get('world.terrain.far').meshes;
  assert.equal(ms.length, 1);
  const g = ms[0].geometry; g.computeBoundingBox();
  const bb = g.boundingBox;
  assert.ok(bb.min.x <= -745 && bb.max.x >= 745 && bb.min.z <= -745 && bb.max.z >= 745, `covers +-750 m: ${bb.min.x}..${bb.max.x}, ${bb.min.z}..${bb.max.z}`);
  assert.ok(g.index.count / 3 > 35000 && g.attributes.position.count < 200000, `${g.index.count / 3} triangles, ${g.attributes.position.count} vertices`);
  assert.equal(ms[0].castShadow, false);
});

test('budget: the batched world stays inside the draw and triangle allowance', () => {
  const s = A.batch.stats();
  assert.ok(s.meshes < 1100, `${s.meshes} batched meshes (before the merge pass)`);
  assert.ok(s.tris < 900000, `${s.tris} triangles`);
});
