// P1 station (perth-station.ts, perth-station-structure.ts): the roof's footprint, the island building's trace, the footbridges and the
// clearances the rubric (gfx-rubrics/perth-station.md) asks for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { buildPerthScene, stationOutline } from '../src/perth-scene.ts';
import { PERTH_BAY_NOTCH, PERTH_CANOPY_SPLIT, PERTH_ISLAND_BUILDING, PERTH_SHED_NORTH, PERTH_STATION, inRing, perthRoofRings, perthStationBatches, perthStationPlan, ringDistance, toLocal, toWorld } from '../src/perth-station-structure.ts';
import { cleanRing } from '../src/waverley-mesh.ts';

const data = unpackWaverleyScene(JSON.parse(readFileSync(new URL('../src/data/perth-scene.json', import.meta.url), 'utf8')));
const outline = stationOutline(data)!.outer;
const plan = perthStationPlan(data, outline);
const batches = perthStationBatches(plan);
const rails: [Pt, Pt][] = data.rails.flatMap(r => r.path.slice(1).map((p, i): [Pt, Pt] => [r.path[i], p]))
  .filter(([a, b]) => [a, b].some(p => p[0] > -260 && p[0] < 140 && p[1] > -420 && p[1] < 220));
const segDist = (p: Pt, a: Pt, b: Pt): number => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
const railDistance = (p: Pt): number => Math.min(...rails.map(([a, b]) => segDist(p, a, b)));
const onPlatform = (p: Pt): boolean => data.platforms.some(q => inRing(p, cleanRing(q.path)));

test('the track frame is a rotation: local and back is the identity', () => {
  for (const p of [[10, -20], [-150, 30], [0, 0]] as Pt[]) { const q = toWorld(toLocal(p)); assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9); }
});

test('the roof is the OSM station outline: the bay notch closed (proposed), the Dundee canopies split off, nothing else added', () => {
  const ring = cleanRing(outline), near = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < .2;
  for (const p of [...PERTH_BAY_NOTCH, ...PERTH_CANOPY_SPLIT]) assert.ok(ring.some(q => near(p, q)), `outline corner ${p}`);
  const {roof, canopy} = perthRoofRings(outline);
  assert.equal(roof.length + canopy.length - 2, ring.length - PERTH_BAY_NOTCH.length, 'every other outline corner is in exactly one ring');
  // Every glazed vertex is inside the outline, or inside the closed bay notch, within 5 cm.
  const notch = PERTH_BAY_NOTCH as Pt[], g = batches.glass.positions;
  for (let i = 0; i < g.length; i += 3) {
    const p: Pt = [g[i], g[i + 2]];
    assert.ok(inRing(p, ring) || inRing(p, notch) || ringDistance(p, ring) < .05 || ringDistance(p, notch) < .05, `glazing at ${p} outside the station outline`);
  }
});

test('the island building is the gap OSM leaves between platforms 4, 5 and 7: every corner a mapped vertex, none on a track', () => {
  const vertices = [...data.platforms.flatMap(p => p.path), ...outline];
  for (const p of PERTH_ISLAND_BUILDING) assert.ok(vertices.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < .2), `corner ${p} is an OSM vertex`);
  // As drawn, it stops at the shed line (lead ruling 12:21): each corner is a traced one, or on the shed line, and none lies north of it.
  for (const p of plan.island) {
    const x = toLocal(p)[0];
    assert.ok(x >= PERTH_SHED_NORTH - 1e-6, `corner ${p} south of the shed line`);
    assert.ok(Math.abs(x - PERTH_SHED_NORTH) < 1e-6 || PERTH_ISLAND_BUILDING.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < .2), `corner ${p} traced or on the shed line`);
    assert.ok(railDistance(p) > 2.5, `corner ${p} clear of the tracks`);
  }
  // Tite's block (lead ruling 12:24): on platform 3's east side, clear of every track and of every footbridge deck, stair and tower.
  assert.ok(plan.tite, 'Tite block drawn');
  for (const p of plan.tite!.ring) assert.ok(railDistance(p) > 2.5, `Tite corner ${p} clear of the tracks`);
  const tl = plan.local.tite, [tx0, tx1] = [Math.min(...tl.map(p => p[0])), Math.max(...tl.map(p => p[0]))], [tz0, tz1] = [Math.min(...tl.map(p => p[1])), Math.max(...tl.map(p => p[1]))];
  for (const r of plan.clear) assert.ok(r[1] < tx0 || r[0] > tx1 || r[3] < tz0 || r[2] > tz1, `bridge footprint ${r} clear of the Tite block`);
  for (const p of plan.roof) assert.ok(toLocal(p)[0] >= PERTH_SHED_NORTH - 1e-6, `roof corner ${p} stops at the shed line`);
});

test('two footbridges: the north lattice bridge to platforms 4, 3 and 1, the south lift bridge to 4/5, 2/3 and 1, each deck over the trains and the canopy', () => {
  assert.deepEqual(plan.bridges.map(b => b.id), ['north', 'south']);
  assert.deepEqual(plan.bridges[0].landings.map(l => l.refs.join('/')), ['4', '3', '1']);
  assert.deepEqual(plan.bridges[1].landings.map(l => l.refs.join('/')), ['4/5', '2/3', '1']);
  assert.ok(plan.bridges[1].landings.filter(l => l.tower).length >= 2, 'lift towers on the islands');
  for (const b of plan.bridges) {
    const underside = b.deck - (b.kind === 'lattice' ? .5 : 1);
    assert.ok(underside > 4.8 && underside > PERTH_STATION.canopy.top + .3, `${b.id} deck underside ${underside}`);
  }
});

test('clearances: columns, posts, stairs and towers stand on platforms, clear of every track; nothing low stands over a track', () => {
  const S = plan.structure, w = (p: Pt) => toWorld(p);
  const points: [string, Pt, number][] = [
    ...S.columns.map((c): [string, Pt, number] => [`column ${c.ref}`, w([c.x, c.z]), 1.6 + .33]),
    ...plan.canopyColumns.map((c): [string, Pt, number] => ['canopy column', w(c), 1.6 + .1]),
    ...plan.bridges.flatMap(b => b.posts.map((p): [string, Pt, number] => [`${b.id} post`, w(p), 1.6 + .15])),
    ...plan.bridges.flatMap(b => b.landings.flatMap(l => {
      const [x0, x1, z0, z1] = l.stair, n: Pt = [-l.dir[1], l.dir[0]], h = PERTH_STATION.stair.width / 2;
      const ends = [l.start, [l.start[0] + l.dir[0] * l.length, l.start[1] + l.dir[1] * l.length] as Pt];
      void x0; void x1; void z0; void z1;
      const corners = ends.flatMap(e => [[e[0] + n[0] * h, e[1] + n[1] * h], [e[0] - n[0] * h, e[1] - n[1] * h]] as Pt[]);
      const tower = l.tower ? [-1, 1].flatMap(a => [-1, 1].map(c => [l.tower!.c[0] + a * 1.6 * l.tower!.dir[0] - c * 1.6 * l.tower!.dir[1], l.tower!.c[1] + a * 1.6 * l.tower!.dir[1] + c * 1.6 * l.tower!.dir[0]] as Pt)) : [];
      return [...corners, ...tower].map((p): [string, Pt, number] => [`${b.id} stair/tower ${l.refs.join('/')}`, w(p), 1.6]);
    })),
  ];
  assert.ok(S.columns.length > 30 && plan.canopyColumns.length > 5, `${S.columns.length} columns, ${plan.canopyColumns.length} canopy columns`);
  for (const [what, p, clear] of points) {
    assert.ok(onPlatform(p), `${what} at ${p.map(v => v.toFixed(1))} on a platform`);
    assert.ok(railDistance(p) >= clear, `${what} at ${p.map(v => v.toFixed(1))} is ${railDistance(p).toFixed(2)} m from a track`);
  }
  // Everything this element draws below the 4.8 m train envelope stands 1.6 m or more from every track's centreline.
  for (const [name, b] of [['ironwork', batches.ironwork], ['fittings', batches.fittings]] as const) {
    const pos = b.positions;
    for (let i = 0; i < pos.length; i += 3) if (pos[i + 1] < 4.8 && pos[i + 1] > .05) {
      const p: Pt = [pos[i], pos[i + 2]], d = railDistance(p);
      assert.ok(d >= 1.6, `${name} vertex at ${p.map(v => v.toFixed(1))}, y ${pos[i + 1].toFixed(2)}, is ${d.toFixed(2)} m from a track`);
    }
  }
});

test('the roof toggle hides the whole station roof: glazing, strips and ironwork are in the roof part, the bridges are not', () => {
  const scene = buildPerthScene({ lighting: false });
  try {
    for (const name of ['perth-station-roof', 'perth-roof-strips', 'perth-roof-ironwork']) assert.equal(scene.group.getObjectByName(name)?.parent, scene.parts.roof, name);
    for (const name of ['perth-island-building', 'perth-columns-bridges-furniture']) assert.equal(scene.group.getObjectByName(name)?.parent, scene.parts.platforms, name);
    const ironwork = scene.group.getObjectByName('perth-roof-ironwork') as THREE.Mesh; ironwork.geometry.computeBoundingBox();
    assert.ok(ironwork.geometry.boundingBox!.min.y > 4.8, 'the roof ironwork stays over the train envelope');
  } finally { scene.dispose(); }
});
