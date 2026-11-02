// R1-103, the second half ("a few more variations: roof rack, a taxi, a van"): some of the road's cars wear a roof rack (and some carry a load on it), the road always has at least two taxis and two racked
// cars, and a second van and a second pickup stand on it in paint of their own, each laid on the ground. The hatchbacks' roofs are measured here on the real models, so a re-exported model fails these
// tests and not as a rack hung in the air; the real world is built headless and its vehicles read back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createContext } from '../js/core/ctx.js';
import { VehicleLibrary, vehicleMatrix } from '../js/world/vehicle-library.js';
import { car, ROOF, RACK_LOADS, RACK_SHARE, ROAD_MIN, rackFor, roadRole } from '../js/world/vehicles.js';
import { WHEEL_SPREAD } from '../js/world/vehicle-placement.js';
import { OCC } from '../js/world/occupancy.js';
import { project } from '../js/world/geom.js';
import { buildData, loadVehiclesFromDisk, readAssetJson } from './headless.mjs';

async function loaded() {
  const ctx = createContext({ headless: true });
  await ctx.assets.init(readAssetJson);
  await loadVehiclesFromDisk(ctx);
  return ctx;
}

/** The model's top surface at (x, z): the highest point of any triangle above 1.1 m that covers it (null where the model has nothing there). */
function topOf(ctx, key) {
  const tris = [];
  for (const p of ctx.assets.parts(key)) {
    const pos = p.geometry.attributes.position, idx = p.geometry.index, n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const a = [0, 1, 2].map((k) => { const v = idx ? idx.getX(i + k) : i + k; return [pos.getX(v), pos.getY(v), pos.getZ(v)]; });
      if (Math.max(a[0][1], a[1][1], a[2][1]) >= 1.1) tris.push(a);
    }
  }
  return (px, pz) => {
    let best = null;
    for (const [A, B, C] of tris) {
      const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]); if (Math.abs(d) < 1e-9) continue;
      const l1 = ((B[2] - C[2]) * (px - C[0]) + (C[0] - B[0]) * (pz - C[2])) / d, l2 = ((C[2] - A[2]) * (px - C[0]) + (A[0] - C[0]) * (pz - C[2])) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const y = l1 * A[1] + l2 * B[1] + l3 * C[1]; if (best == null || y > best) best = y;
    }
    return best;
  };
}

let uid = 0;
/** Draw one car with `o` at a posed spot into fresh builders, and read what was drawn back in the car's own frame: `rack` (the group of its own the racks go in) and `body` (the group the sign goes in). */
function drawn(ctx, x, y, z, ry, pitch, o) {
  const lb = ctx.batch.builder('rack-test:' + ++uid), main = ctx.batch.builder('body-test:' + uid), K = { ctx, b: () => lb };
  const key = car(K, main, x, y, z, ry, pitch, o), inv = vehicleMatrix(x, y, z, ry, pitch).invert();
  const read = (b) => { const pts = []; for (const [mat, acc] of b.accs) for (let i = 0; i < acc.pos.length; i += 3) pts.push({ mat, p: new THREE.Vector3(acc.pos[i], acc.pos[i + 1], acc.pos[i + 2]).applyMatrix4(inv) }); return pts; };
  return { key, rack: read(lb), body: read(main), main };
}

test('the roofs the racks stand on are the models\' own: flat at the height given, as long and as wide as given, and not flat beyond', async () => {
  const ctx = await loaded();
  for (const key of ['vehicle_hatchback_a', 'vehicle_hatchback_b']) {
    const top = topOf(ctx, key), r = ROOF[key];
    assert.ok(Math.abs(ctx.assets.meta(key).bounds.max[1] - r.y) < 0.012, `${key}: the roof is the highest point of the model (${r.y} against ${ctx.assets.meta(key).bounds.max[1]})`);
    for (let x = -r.hw + 0.05; x <= r.hw - 0.05 + 1e-9; x += 0.1) for (let z = r.z0 + 0.05; z <= r.z1 - 0.05 + 1e-9; z += 0.1) {
      assert.ok(Math.abs(top(x, z) - r.y) < 0.012, `${key}: the roof at (${x.toFixed(2)}, ${z.toFixed(2)}) is ${top(x, z)}, not ${r.y}`);
    }
    for (const z of [r.z0 - 0.15, r.z1 + 0.15]) assert.ok(top(0, z) < r.y - 0.03, `${key}: the roof is not flat at z ${z.toFixed(2)} (${top(0, z)}), so the rack does not run on past it`);
  }
});

test('a rack stands on the roof by its feet and reaches no wider than the roof, on a slope and turned, for every load and on both designs', async () => {
  const ctx = await loaded();
  for (const [x, z, want] of [[10, 1, 'vehicle_hatchback_a'], [10, 0, 'vehicle_hatchback_b']]) for (const load of RACK_LOADS) for (const zinc of [false, true]) {
    const d = drawn(ctx, x, 5, z, 0.9, 0.07, { hex: 0xb8222a, rack: { load, tarp: 1, zinc } }), r = ROOF[d.key];
    assert.equal(d.key, want);
    assert.ok(d.rack.length > 0, `${load}: the rack was drawn into the group of its own`);
    const ys = d.rack.map((q) => q.p.y), xs = d.rack.map((q) => q.p.x), zs = d.rack.map((q) => q.p.z);
    assert.ok(Math.abs(Math.min(...ys) - r.y) < 0.004, `${d.key} ${load}: the feet touch the roof (lowest point ${Math.min(...ys).toFixed(3)} against ${r.y})`);
    assert.ok(Math.max(...ys) < r.y + (load === 'bare' ? 0.11 : 0.52), `${d.key} ${load}: no taller than its load (${Math.max(...ys).toFixed(3)})`);
    assert.ok(Math.max(...xs.map(Math.abs)) <= r.hw + 0.02, `${d.key} ${load}: within the roof's width (${Math.max(...xs.map(Math.abs)).toFixed(3)})`);
    const over = load === 'ladder' ? 1.1 : load === 'planks' ? 1.6 : load === 'bundle' ? 0.1 : 0;
    assert.ok(Math.min(...zs) >= r.z0 - over - 0.01 && Math.max(...zs) <= r.z1 + over + 0.01, `${d.key} ${load}: runs on past the roof by no more than ${over} m (${Math.min(...zs).toFixed(2)} .. ${Math.max(...zs).toFixed(2)})`);
    if (load !== 'bare') assert.ok(Math.max(...ys) > r.y + 0.12, `${d.key} ${load}: something is tied on`);
    assert.equal(d.main.accs.size, 0, `${load}: nothing but the rack is drawn for a car that is no taxi (the body is the library's)`);
  }
});

test('a taxi\'s sign sits on the roof, not above it, and a taxi without a rack draws none', async () => {
  const ctx = await loaded();
  for (const [x, z] of [[10, 1], [10, 0]]) {
    const d = drawn(ctx, x, 5, z, 0.4, 0.03, { hex: 0xf2c21b, taxi: true }), r = ROOF[d.key], sign = d.body.filter((q) => q.mat === 'light_roof').map((q) => q.p.y);
    assert.ok(sign.length, 'the sign is drawn');
    assert.ok(Math.abs(Math.min(...sign) - r.y) < 0.004, `${d.key}: the sign's underside is the roof (${Math.min(...sign).toFixed(3)} against ${r.y})`);
    assert.equal(d.rack.length, 0, 'no rack');
  }
});

test('the car drawn without the library takes a rack on its own box roof as well', async () => {
  const ctx = createContext({ headless: true });
  await ctx.assets.init(readAssetJson);
  ctx.vehicleLibrary = new VehicleLibrary(ctx);
  assert.equal(ctx.vehicleLibrary.types.size, 0);
  const d = drawn(ctx, 0, 0, 0, 0.3, 0.05, { hex: 0xb8222a, rack: { load: 'ladder', tarp: 0, zinc: false } });
  assert.equal(d.key, undefined, 'the procedural body');
  assert.ok(d.main.tris > 1200, 'and the car is the procedural one');
  assert.ok(d.rack.length > 0 && Math.abs(Math.min(...d.rack.map((q) => q.p.y)) - ROOF.procedural.y) < 0.004, 'its rack stands on its roof');
});

test('racks are dealt by the place of the car: a share of them, every load, none twice while there are loads left, and a made-up rack carries something', () => {
  let racked = 0, n = 0; const seen = new Set();
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
    const r = rackFor(i * 3.7 - 60, j * 2.9 - 55); n++;
    if (r) { racked++; seen.add(r.load); assert.ok(RACK_LOADS.includes(r.load) && Number.isInteger(r.tarp) && typeof r.zinc === 'boolean'); }
  }
  const share = (100 * racked) / n;
  assert.ok(Math.abs(share - RACK_SHARE) < 6, `${share.toFixed(1)} per cent of cars wear a rack (the target is ${RACK_SHARE})`);
  assert.deepEqual([...seen].sort(), [...RACK_LOADS].sort(), 'every load is dealt');
  assert.deepEqual(rackFor(-13.51, -20.24, true), rackFor(-13.51, -20.24, true), 'a hash, not a random stream');
  for (let i = 0; i < 40; i++) assert.notEqual(rackFor(i * 7.1, i * 3.3 - 5, true).load, 'bare', 'a made-up rack is loaded');
  const used = new Set();
  for (let i = 0; i < 3; i++) { const r = rackFor(i * 7.1, i * 3.3 - 5, true, used); assert.ok(!used.has(r.load), `${r.load} dealt twice`); used.add(r.load); }
  assert.ok(RACK_LOADS.includes(rackFor(1, 2, true, used).load), 'a fourth is a repeat, and still a rack');
});

test('a road of seven cars always ends with at least two taxis and two racked cars, whatever the dice gave it, and no taxi carries a rack', () => {
  let state = 12345; const rnd = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const taxiCounts = [], rackCounts = []; let both = 0;
  for (let road = 0; road < 400; road++) {
    let taxis = 0, racks = 0; const used = new Set(), loads = [];
    for (let placed = 0; placed < 7; placed++) {
      const x = rnd() * 200 - 100, z = rnd() * 200 - 100, role = roadRole({ x, z, remaining: 7 - placed, taxis, racks, used, taxi: rnd() < 0.18 });
      if (role.taxi) { taxis++; if (role.rack) both++; }
      if (role.rack) { racks++; used.add(role.rack.load); loads.push(role.rack.load); }
    }
    taxiCounts.push(taxis); rackCounts.push(racks);
    if (racks <= 4) assert.equal(new Set(loads).size, loads.length, `road ${road}: loads ${loads}`);
  }
  assert.ok(Math.min(...taxiCounts) >= ROAD_MIN.taxis, `fewest taxis ${Math.min(...taxiCounts)}`);
  assert.ok(Math.min(...rackCounts) >= ROAD_MIN.racks, `fewest racks ${Math.min(...rackCounts)}`);
  assert.equal(both, 0, 'a taxi has no rack');
  assert.ok(taxiCounts.reduce((a, b) => a + b) / 400 < 3.6, 'taxis stay a minority');
  // a road that already has what it needs keeps its dice
  assert.deepEqual(roadRole({ x: 1, z: 2, remaining: 1, taxis: 2, racks: 2, taxi: false, used: new Set() }), { taxi: false, rack: rackFor(1, 2, false) });
  assert.equal(roadRole({ x: 1, z: 2, remaining: 5, taxis: 2, racks: 2, taxi: true, used: new Set() }).taxi, true);
});

test('every design gives its wheel points: one per named wheel, on the floor the model stands on', async () => {
  const ctx = await loaded();
  assert.equal(ctx.vehicleLibrary.types.size, 10);
  for (const [key, type] of ctx.vehicleLibrary.types) {
    assert.equal(type.wheels.length, type.meta.wheels.length, `${key}: a point for each of ${type.meta.wheels.join(' ')}`);
    for (const [wx, wy, wz] of type.wheels) assert.ok(Math.abs(wy) < 0.01 && Math.abs(wx) < type.meta.size[0] / 2 && Math.abs(wz) < type.meta.size[2] / 2, `${key}: wheel point ${wx} ${wy} ${wz}`);
  }
  const lib = ctx.vehicleLibrary, flat = () => 0;
  assert.ok(lib.wheelGaps('vehicle_pickup', 0, 0, 0, 0.7, 0, flat).every((g) => Math.abs(g) < 0.01), 'a pickup standing on flat ground has all four wheels on it');
  assert.ok(lib.wheelGaps('vehicle_pickup', 0, 0.3, 0, 0.7, 0, flat).every((g) => Math.abs(g - 0.3) < 0.01), 'TEETH: held 0.3 m up, all four are 0.3 m above it');
  const tilt = lib.wheelGaps('vehicle_pickup', 0, 0, 0, 0, 0, (x) => 0.2 * x);
  assert.ok(Math.max(...tilt) - Math.min(...tilt) > 0.25, 'TEETH: across a sloped ground the four wheels disagree');
  assert.deepEqual(lib.wheelGaps('nothing', 0, 0, 0, 0, 0, flat), []);
});

test('the real world: racked cars and taxis along the road, a second van and a second pickup, every vehicle on the ground', async () => {
  const { ctx, plan } = await buildData({ world: true, furnish: false }), lib = ctx.vehicleLibrary, W = ctx.world, list = W.vehicleList;
  const cars = list.filter((v) => v.kind === 'car' || v.kind === 'taxi'), taxis = cars.filter((v) => v.kind === 'taxi'), racked = cars.filter((v) => v.rack);
  assert.ok(taxis.length >= ROAD_MIN.taxis && racked.length >= ROAD_MIN.racks, `${taxis.length} taxis, ${racked.length} racked cars of ${cars.length}`);
  assert.equal(W.vehicles.racks, racked.length); assert.equal(W.vehicles.taxis, taxis.length);
  assert.ok(taxis.every((v) => !v.rack), 'no taxi carries a rack');
  assert.equal(new Set(racked.map((v) => v.rack)).size, Math.min(racked.length, 4), `loads along the road: ${racked.map((v) => v.rack)}`);
  assert.ok(racked.some((v) => v.rack !== 'bare'), 'one of them carries something');
  // the racks hang in a group of their own that casts no shadow, like the library's cars
  const groups = [...ctx.batch.groups.keys()].filter((id) => id.startsWith('props.vehicle-load.'));
  assert.ok(groups.length >= 1 && groups.every((id) => ctx.batch.groups.get(id).cast === false), `rack groups ${groups}: none casts a shadow`);
  // the second van and the second pickup: after the five additions (which keep their spots), in paint of their own, on the road, clear of doors and walking routes
  const additions = lib.records.filter((r) => r.source === 'addition'), variety = lib.records.filter((r) => r.source === 'variety');
  assert.equal(additions.length, 5, 'the five additions are untouched');
  assert.deepEqual(variety.map((r) => r.key).sort(), ['vehicle_colectivo', 'vehicle_pickup']);
  for (const r of variety) {
    const first = additions.find((a) => a.key === r.key), meta = lib.meta(r.key), st = plan.streets.find((s) => s.id === r.street);
    assert.ok(first && Number.isFinite(r.hex) && r.hex !== first.hex, `${r.key}: a second one, in a colour of its own`);
    assert.ok(Math.hypot(first.x - r.x, first.z - r.z) > 5, `${r.key}: not on top of the first`);
    const [w, dd] = meta.footprint, c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 8; j++) {
      const lx = (i / 4 - 0.5) * w, lz = (j / 8 - 0.5) * dd, x = r.x + lx * c + lz * s, z = r.z - lx * s + lz * c;
      assert.ok(project(st._d.pts, st._d.cum, x, z).d <= st.width / 2 - 0.14, `${r.key}: inside the kerb`);
      assert.ok(W.occ.navDist(x, z) >= 0.89, `${r.key}: leaves the walking routes clear`);
      assert.equal(W.occ.at(x, z) & (OCC.DOOR | OCC.STAIR | OCC.LOT | OCC.PLAZA), 0, `${r.key}: no doorway or building`);
    }
    assert.ok(ctx.physics._overlaps(r.x, r.z, r.y, 0.24, 1.64), `${r.key}: solid at its centre`);
    const gaps = lib.wheelGaps(r.key, r.x, r.y, r.z, r.yaw, r.pitch, plan.heightAt);
    assert.equal(gaps.length, 4);
    assert.ok(Math.abs(Math.min(...gaps) - 0.01) < 0.002 && Math.max(...gaps) < 0.011 + WHEEL_SPREAD + 0.002, `${r.key}: laid on the ground (the lowest wheel 1 cm up, none more than ${WHEEL_SPREAD * 100} cm above it), wheels at ${gaps.map((g) => (g * 100).toFixed(1)).join(' ')} cm`);
  }
  // nothing in the library floats or sinks far: the road's cars stand 0 to 6 cm up, the others are within the road's camber
  for (const r of lib.records) {
    const gaps = lib.wheelGaps(r.key, r.x, r.y, r.z, r.yaw, r.pitch, plan.heightAt);
    assert.ok(gaps.every((g) => g > -0.15 && g < 0.1), `${r.key} at ${r.x.toFixed(1)},${r.z.toFixed(1)}: wheels at ${gaps.map((g) => (g * 100).toFixed(1)).join(' ')} cm`);
    if (/hatchback/.test(r.key)) assert.ok(gaps.every((g) => g > -0.005 && g < 0.06), `${r.key}: a road car stands on the road`);
  }
  assert.deepEqual(ctx.errors, []);
});
