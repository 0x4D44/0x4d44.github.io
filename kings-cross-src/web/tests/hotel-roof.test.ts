import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { greatNorthernHotelPlan, OSM_IDS } from '../../core/landmarks.ts';
import type { HotelPlan } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import { pointInPolygon } from '../../core/station.ts';
import { hotelGeometry } from '../src/landmarks.ts';
import type { Key } from '../src/landmarks.ts';
import { Batch } from '../src/materials.ts';
import type { PartMap, V3 } from '../src/materials.ts';

const ASSUMED_DORMER_INSET = 0.34; // a dormer's face stands this far up the slope
const ASSUMED_DORMER_HEIGHT = 1.5 + 0.7; // wall and pediment: its ridge meets the roof this much higher, back at ASSUMED_DORMER_INSET + this / (the roof's rise) up the slope
const ASSUMED_STACK_CAP_HEIGHT = 0.26;
const ASSUMED_STACK_REACH = 3.8; // m along the facade from a stack site's bay to the far side of the lower companion beside it
const ASSUMED_DORMER_STACK_GAP = 0.12;
const ASSUMED_DORMER_WINDOW_SILL = 0.18;
/** the dormers' bays: two in three of each face (the middle of each three is left bare), and none on a bay too narrow for one */
const dormerBays = (face: { bays: readonly { width: number }[] }): number => face.bays.filter((b, i) => i % 3 !== 1 && b.width > 2.4).length;
const GEOMETRY_EPSILON = 1e-4; // 0.1 mm: permits Float32 BufferGeometry vertex rounding.

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const plan = greatNorthernHotelPlan(data);
const building = data.buildings.find(b => b.id === OSM_IDS.greatNorthernHotel)!;

interface Tri { p: [V3, V3, V3] }
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
function triangles(m: Batch): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const k = [m.indices[i], m.indices[i + 1], m.indices[i + 2]] as [number, number, number];
    const v = (j: number): V3 => [m.positions[j * 3] as number, m.positions[j * 3 + 1] as number, m.positions[j * 3 + 2] as number];
    out.push({ p: [v(k[0]), v(k[1]), v(k[2])] });
  }
  return out;
}
const all = (parts: PartMap<Key>, key: Key): Tri[] => triangles(parts[key] as Batch);
/** a horizontal triangle that faces up: the top of a corbel course or a cap */
const top = (t: Tri): boolean => Math.abs(t.p[0][1] - t.p[1][1]) < 1e-9 && Math.abs(t.p[0][1] - t.p[2][1]) < 1e-9 && (t.p[1][2] - t.p[0][2]) * (t.p[2][0] - t.p[0][0]) - (t.p[1][0] - t.p[0][0]) * (t.p[2][2] - t.p[0][2]) > 0;
const signature = (t: Tri): string => JSON.stringify(t.p);
function roofFacetCoordinates(edgeIndex: number, p: V3): { t: number; inset: number } | undefined {
  const a = plan.outline[edgeIndex]!, b = plan.outline[(edgeIndex + 1) % plan.outline.length]!;
  const ra = plan.roof.ring[edgeIndex]!, rb = plan.roof.ring[(edgeIndex + 1) % plan.outline.length]!;
  let t = 0.5, inset = 0.8;
  for (let i = 0; i < 10; i++) {
    const x0 = a[0] + (b[0] - a[0]) * t, z0 = a[1] + (b[1] - a[1]) * t;
    const x1 = ra[0] + (rb[0] - ra[0]) * t, z1 = ra[1] + (rb[1] - ra[1]) * t;
    const x = x0 + (x1 - x0) * inset, z = z0 + (z1 - z0) * inset;
    const dt: [number, number] = [(1 - inset) * (b[0] - a[0]) + inset * (rb[0] - ra[0]), (1 - inset) * (b[1] - a[1]) + inset * (rb[1] - ra[1])];
    const df: [number, number] = [(1 - t) * (ra[0] - a[0]) + t * (rb[0] - b[0]), (1 - t) * (ra[1] - a[1]) + t * (rb[1] - b[1])];
    const det = dt[0] * df[1] - df[0] * dt[1];
    if (Math.abs(det) < 1e-10) return undefined;
    const ex = x - p[0], ez = z - p[2];
    t -= (ex * df[1] - ez * df[0]) / det;
    inset -= (dt[0] * ez - dt[1] * ex) / det;
  }
  return { t, inset };
}
test('Great Northern Hotel: assumed pedimented dormers and slab stacks use the existing material batches', () => {
  const full = hotelGeometry(plan);
  const bare = hotelGeometry({ ...plan, faces: [] });
  const dormers = plan.faces.reduce((n, face) => n + dormerBays(face), 0);
  const atticSashes = all(full, 'sash').filter(t => t.p.every(v => v[1] > plan.eaves));
  // [HE-GNH] confirms plural dormers, but not their count. hist-a: over about two bays in three, in pairs: ASSUMED.
  assert.equal(atticSashes.length, dormers * 2, 'each assumed attic dormer has one drawn sash quad');
  assert.ok(dormers < plan.faces.reduce((n, face) => n + face.bays.length, 0) * 0.7 && dormers > 20, `${dormers} dormers: two bays in three, not one to every bay`);

  const baselineSlate = new Set(all(bare, 'slate').map(signature));
  const addedSlate = all(full, 'slate').filter(t => !baselineSlate.has(signature(t)));
  assert.ok(addedSlate.length > 0, 'the dormers have drawn slate roofs and cheeks');
  const pediments = all(full, 'stone').filter(t => t.p.every(v => v[1] >= plan.eaves - 1e-7 && v[1] <= plan.ridge + 1e-7));
  assert.ok(pediments.some(t => {
    const ys = t.p.map(v => v[1]).sort((a, b) => b - a);
    return (ys[0] as number) - (ys[1] as number) > 0.35 && (ys[1] as number) - (ys[2] as number) > 0.35;
  }), 'stone pediments have a raised gable apex');
  assert.ok(all(full, 'stone').some(t => t.p.every(v => v[1] > plan.ridge)), 'stone chimney stacks rise above the real roof ridge');
  const stone = all(full, 'stone');
  const stackTopY = Math.max(...stone.flatMap(t => t.p.map(v => v[1])));
  const capBottomY = stackTopY - ASSUMED_STACK_CAP_HEIGHT;
  const capSides = stone.filter(t => t.p.some(v => Math.abs(v[1] - stackTopY) < 1e-6) && t.p.some(v => Math.abs(v[1] - capBottomY) < 1e-6));
  assert.ok(capSides.length > 0, 'the chimney cap is a thin slab at shaft-top height');
  assert.ok(capSides.every(t => Math.max(...t.p.map(v => v[1])) - Math.min(...t.p.map(v => v[1])) <= ASSUMED_STACK_CAP_HEIGHT + 1e-6), 'cap walls remain slab-thin');

  // Read the cap vertices back from the drawn geometry and invert their OSM roof facet. The
  // ASSUMED cap front must be beyond the dormer rear with a small visible roof gap.
  const capTops = stone.filter(t => t.p[0][1] > plan.ridge && top(t));
  assert.ok(capTops.length >= 18 * 2, 'every stack has a corbel course and a cap with horizontal top triangles');
  for (const t of capTops) for (const v of t.p) {
    let best: { inset: number; roofRun: number } | undefined;
    let bestAlong = Infinity;
    for (const face of plan.faces.filter(f => f.bays.length >= 8)) for (const bay of face.bays) {
      const a = plan.outline[bay.edge]!, b = plan.outline[(bay.edge + 1) % plan.outline.length]!, ra = plan.roof.ring[bay.edge]!, rb = plan.roof.ring[(bay.edge + 1) % plan.outline.length]!;
      const edgeLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const coord = roofFacetCoordinates(bay.edge, v);
      if (!coord) continue;
      const edgeT = ((bay.at[0] - a[0]) * (b[0] - a[0]) + (bay.at[1] - a[1]) * (b[1] - a[1])) / (edgeLength * edgeLength);
      const along = Math.abs(coord.t - edgeT) * edgeLength;
      if (along < bestAlong) {
        const roofRun = (Math.hypot(ra[0] - a[0], ra[1] - a[1]) + Math.hypot(rb[0] - b[0], rb[1] - b[1])) / 2;
        bestAlong = along;
        best = { inset: coord.inset, roofRun };
      }
    }
    assert.ok(best && bestAlong < ASSUMED_STACK_REACH, `chimney top vertex maps to a long OSM roof bay, within the reach of the stack and its companion (${bestAlong} m)`);
    const minimumInset = ASSUMED_DORMER_INSET + ASSUMED_DORMER_HEIGHT / (plan.ridge - plan.eaves) + ASSUMED_DORMER_STACK_GAP / best!.roofRun;
    assert.ok(best!.inset > minimumInset - GEOMETRY_EPSILON, `chimney caps clear the dormer roof run in the actual geometry (${best!.inset} <= ${minimumInset}; nearest bay ${bestAlong} m)`);
  }
  assert.deepEqual(Object.keys(full).sort(), ['brick', 'brickRed', 'sash', 'slate', 'stone'], 'roof details share the existing material batches: the hotel’s four, and the clay of the pots (the ground floor is square-headed: no arched sash)');
});

/** the triangles that share corners, in groups: a quad, or a gable's face and the border round it */
function groups(tris: Tri[]): Tri[][] {
  const key = (v: V3): string => v.map(c => c.toFixed(4)).join(',');
  const parent = tris.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i] as number)));
  const owner = new Map<string, number>();
  tris.forEach((t, i) => t.p.forEach(v => { const o = owner.get(key(v)); if (o === undefined) owner.set(key(v), i); else parent[root(i)] = root(o); }));
  const out = new Map<number, Tri[]>();
  tris.forEach((t, i) => out.set(root(i), [...(out.get(root(i)) ?? []), t]));
  return [...out.values()];
}

test('Great Northern Hotel [hist-a, HE R6]: a dormer over two bays in three, none over the middle bay of each three or a bay under 2.4 m, each a stone gable 2.2 m wide (0.65 of a narrower bay), 1.5 m to its shoulders and 2.2 m to its apex, with a sash 1.1 x 1.25 m', () => {
  const full = hotelGeometry(plan);
  const sashes = groups(all(full, 'sash').filter(t => t.p.every(v => v[1] > plan.eaves)));
  const gables = groups(all(full, 'stone').filter(t => t.p.every(v => v[1] >= plan.eaves - 0.01 && v[1] < plan.ridge)));
  const centre = (g: Tri[]): V3 => { const vs = g.flatMap(t => t.p); return [0, 1, 2].map(k => (Math.max(...vs.map(v => v[k] as number)) + Math.min(...vs.map(v => v[k] as number))) / 2) as V3; };
  const spread = (g: Tri[], k: number): number => { const vs = g.flatMap(t => t.p.map(v => v[k] as number)); return Math.max(...vs) - Math.min(...vs); };
  let n = 0;
  for (const face of plan.faces) face.bays.forEach((bay, i) => {
    // on the bay's own roof facet (the quad from its eaves edge to the ridge ring), within half its width along it
    const [e, f, r, q0] = [plan.outline[bay.edge]!, plan.outline[(bay.edge + 1) % plan.outline.length]!, plan.roof.ring[(bay.edge + 1) % plan.outline.length]!, plan.roof.ring[bay.edge]!];
    const mine = sashes.filter(q => { const c = centre(q); return pointInPolygon([c[0], c[2]], [e, f, r, q0]) && Math.abs((c[0] - bay.at[0]) * bay.dir[0] + (c[2] - bay.at[1]) * bay.dir[1]) < bay.width / 2; });
    assert.equal(mine.length, i % 3 !== 1 && bay.width > 2.4 ? 1 : 0, `${face.kind} bay ${i} (${bay.width.toFixed(2)} m): a dormer unless it is the middle of three or too narrow`);
    for (const q of mine) {
      n++;
      assert.equal(q.length, 2, 'a sash is one quad');
      const [along, up] = [Math.hypot(spread(q, 0), spread(q, 2)), spread(q, 1)];
      assert.ok(Math.abs(along - 1.1) < 1e-4 && Math.abs(up - 1.25) < 1e-4, `the sash is 1.1 x 1.25 m (${along.toFixed(3)} x ${up.toFixed(3)})`);
      // its gable is the stone group that holds the sash's middle: the face with its border (0.14 m round the sides, 0.24 over the apex)
      const c = centre(q);
      const gable = gables.filter(g => [0, 1, 2].every(k => Math.abs(centre(g)[k] as number - (c[k] as number)) <= spread(g, k) / 2 + 0.05));
      assert.equal(gable.length, 1, 'the sash stands on one gable');
      const g = gable[0] as Tri[];
      close(spread(g, 1), ASSUMED_DORMER_HEIGHT + 1.7 * 0.14, 1e-3, 'a gable 2.2 m to its apex, and the border over it');
      close(Math.hypot(spread(g, 0), spread(g, 2)), Math.min(2.2, bay.width * 0.65) + 0.28, 1e-3, 'a gable 2.2 m wide (0.65 of a narrower bay), and the border at its sides');
      const feet = Math.min(...g.flatMap(t => t.p.map(v => v[1])));
      const shoulders = [...new Set(g.flatMap(t => t.p.map(v => v[1].toFixed(4))))].map(Number).sort((a, b) => a - b);
      assert.ok(shoulders.some(y => Math.abs(y - (feet + 1.5)) < 1e-3), 'its shoulders are 1.5 m over its feet');
      close(Math.min(...q.flatMap(t => t.p.map(v => v[1]))) - feet, ASSUMED_DORMER_WINDOW_SILL, 1e-3, 'the sash stands 0.18 m over the gable\'s feet');
    }
  });
  assert.equal(n, plan.faces.reduce((m, f) => m + dormerBays(f), 0), 'every dormer was checked');
});

test('Great Northern Hotel: roof details sit on the drawn OSM-derived roof without changing the hotel footprint', () => {
  assert.deepEqual(plan.outline, building.pts, 'the hotel plan remains the OSM footprint');
  const full = hotelGeometry(plan), bare = hotelGeometry({ ...plan, faces: [] });
  const atticSashes = all(full, 'sash').filter(t => t.p.every(v => v[1] > plan.eaves));
  const baselineSlate = new Set(all(bare, 'slate').map(signature));
  const addedSlate = all(full, 'slate').filter(t => !baselineSlate.has(signature(t)));
  const atticStone = all(full, 'stone').filter(t => t.p.some(v => v[1] > plan.eaves));
  const atticBrick = all(full, 'brick').filter(t => t.p.some(v => v[1] > plan.eaves)); // the stacks' shafts: the only brick above the eaves
  const atticPots = full.brickRed ? all(full, 'brickRed') : []; // the pots on them: the hotel has no other red brick
  const detail = [...atticSashes, ...addedSlate, ...atticStone, ...atticBrick, ...atticPots];
  let closest = Infinity, highest = -Infinity;
  const roof = new THREE.Mesh((bare.slate as Batch).build(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  roof.updateMatrixWorld(true);
  for (const t of detail) for (const v of t.p) {
    assert.ok(pointInPolygon([v[0], v[2]], plan.outline), `roof detail stays over the hotel footprint at ${v[0]},${v[2]}`);
    const ray = new THREE.Raycaster(new THREE.Vector3(v[0], Math.max(v[1], plan.ridge) + 10, v[2]), new THREE.Vector3(0, -1, 0), 0, 100);
    const hit = ray.intersectObject(roof)[0];
    assert.ok(hit, `roof detail has a real slate surface below it at ${v[0]},${v[2]}`);
    const clearance = v[1] - hit.point.y;
    assert.ok(clearance >= -GEOMETRY_EPSILON, `roof detail does not intersect its roof surface (clearance ${clearance})`);
    closest = Math.min(closest, clearance);
    highest = Math.max(highest, clearance);
  }
  assert.ok(closest < GEOMETRY_EPSILON, `roof details touch the roof rather than float (${closest} m nearest clearance)`);
  assert.ok(highest > 1, `roof details rise visibly above the roof (${highest} m maximum clearance)`);

  // The gable feet are where each assumed dormer contacts the slope; a vertical ray confirms the
  // support is the actual triangulated slate mesh, not a hand-computed point or a second proxy.
  const gableTriangles = all(full, 'stone').filter(t => t.p.every(v => v[1] >= plan.eaves && v[1] < plan.ridge));
  const feet = new Map<string, V3>();
  for (const t of gableTriangles) for (const v of t.p) {
    const ray = new THREE.Raycaster(new THREE.Vector3(v[0], plan.ridge + 10, v[2]), new THREE.Vector3(0, -1, 0), 0, 100);
    const hit = ray.intersectObject(roof)[0];
    const sashFoot = atticSashes.some(sash => {
      const bottom = Math.min(...sash.p.map(p => p[1]));
      const nearBottom = sash.p.filter(p => Math.abs(p[1] - bottom) < GEOMETRY_EPSILON);
      return bottom - v[1] > 0 && bottom - v[1] < ASSUMED_DORMER_WINDOW_SILL + 0.1 && nearBottom.some(p => Math.hypot(p[0] - v[0], p[2] - v[2]) < 0.75);
    });
    if (sashFoot && hit && Math.abs(v[1] - hit.point.y) < GEOMETRY_EPSILON) feet.set(`${v[0].toFixed(5)},${v[2].toFixed(5)}`, v);
  }
  const dormers = plan.faces.reduce((n, face) => n + dormerBays(face), 0);
  assert.equal(feet.size, dormers * 4, 'the feet of each assumed pediment, its face and its stone border on both sides, contact its roof slope');
  for (const foot of feet.values()) {
    const ray = new THREE.Raycaster(new THREE.Vector3(foot[0], foot[1] + 0.08, foot[2]), new THREE.Vector3(0, -1, 0), 0, 0.2);
    const hit = ray.intersectObject(roof)[0];
    assert.ok(hit, `slate roof is directly under dormer foot ${foot[0]},${foot[2]}`);
    assert.ok(Math.abs(hit.point.y - foot[1]) < GEOMETRY_EPSILON, `ray reaches the roof at the pediment foot height ${foot[1]}`);
  }

  // A ray through a drawn high slab top must hit the stone stack above the continuous roof shell.
  const stoneTriangles = all(full, 'stone');
  const stackTopY = Math.max(...stoneTriangles.flatMap(t => t.p.map(v => v[1])));
  const stackTop = stoneTriangles.find(t => t.p.every(v => Math.abs(v[1] - stackTopY) < GEOMETRY_EPSILON));
  assert.ok(stackTop, 'a high chimney cap triangle exists');
  const centre: V3 = [stackTop.p.reduce((s, v) => s + v[0], 0) / 3, stackTop.p.reduce((s, v) => s + v[1], 0) / 3, stackTop.p.reduce((s, v) => s + v[2], 0) / 3];
  const stone = new THREE.Mesh((full.stone as Batch).build(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  stone.updateMatrixWorld(true);
  const capRay = new THREE.Raycaster(new THREE.Vector3(centre[0], centre[1] + 1, centre[2]), new THREE.Vector3(0, -1, 0), 0, 2);
  const capHit = capRay.intersectObject(stone)[0];
  assert.ok(capHit && Math.abs(capHit.point.y - centre[1]) < GEOMETRY_EPSILON, 'the stack top is real ray-intersectable geometry');
  assert.ok(centre[1] > plan.ridge, 'the chimney silhouette clears the roof ridge');
});
