import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { buildingNightMaterialsOf, material } from '../src/materials.ts';
import { SHADOW_CASTERS } from '../src/lighting.ts';
import * as shed from '../src/shed.ts';

// Round S1 (shed-gap-scan-1): B3 the north screens' grid without its ring and the lattice girder under it, the arcades' impost stones; B1 the haunch rings.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2, sp = layout.springing, L = layout.length;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const S = shed as unknown as Record<string, unknown>;
const centres = [layout.spine - R, layout.spine + R];
const hits = (o: [number, number, number], d: [number, number, number], targets: THREE.Object3D[], far = 80): THREE.Intersection[] => {
  const origin = group.localToWorld(new THREE.Vector3(...o)), dir = new THREE.Vector3(...d).normalize().transformDirection(group.matrixWorld);
  return new THREE.Raycaster(origin, dir, 0, far).intersectObjects(targets, true);
};
const local = (h: THREE.Intersection): THREE.Vector3 => group.worldToLocal(h.point.clone());

test('B3: the north screens are a mullion and transom grid, no ring bar crossing the glass', () => {
  for (const uc of centres) {
    const bars = shed.gableBars(uc, sp, shed.GABLE_GLASS_FROM);
    assert.ok(bars.length > 10 && bars.every(b => b.kind !== 'ring'), `${bars.filter(b => b.kind === 'ring').length} ring bars`);
  }
  // and in the mesh: along the old ring (0.62 r), between the mullions, nothing of the bars
  const gb = group.getObjectByName('shed-gable-bars')!;
  for (const uc of centres) for (const a of [0.3, 0.45, 0.55, 0.7]) {
    const x = uc - 0.62 * R * Math.cos(a * Math.PI), y = sp + 0.62 * R * Math.sin(a * Math.PI);
    const along = hits([x, y, -L + 3], [0, 0, -1], [gb], 6).filter(h => Math.abs(local(h).y - y) < 0.05);
    const nearMullion = Math.abs(((x - uc) / 1.6) - Math.round((x - uc) / 1.6)) * 1.6 < 0.2, nearTransom = [1 / 3, 2 / 3].some(f => Math.abs(y - sp - R * f) < 0.2);
    if (!nearMullion && !nearTransom) assert.equal(along.length, 0, `a bar at ${(x - uc).toFixed(1)}, ${(y - sp).toFixed(1)} on the old ring`);
  }
});

test('B3: a lattice girder 2.2-2.6 m deep spans the foot of each north screen under its glass, diagonals between its chords, not a shadow caster', () => {
  const G = S.GABLE_GIRDER as { depth: number; panel: number; chord: readonly [number, number] };
  // re-pinned round F12 (front-round-11b score, A6: front-d's truss is about 2.5 m deep; kx-front-round32 pins the new figures): was 1.2-1.8 m
  assert.ok(G.depth >= 2.2 && G.depth <= 2.6, `depth ${G.depth}`);
  const gb = group.getObjectByName('shed-gable-bars')!;
  assert.ok(!SHADOW_CASTERS.has('shed-gable-bars'), 'the bars do not cast');
  for (const uc of centres) {
    const y0 = shed.GABLE_GLASS_FROM - G.depth;
    const half = Math.sqrt(R * R - (y0 - sp) ** 2) - 0.5;
    // a ray along the girder's middle meets a diagonal every panel
    const mid = hits([uc - half, shed.GABLE_GLASS_FROM - G.depth / 2, -L], [1, 0, 0], [gb], 2 * half).length;
    assert.ok(mid >= (2 * half) / G.panel - 2, `${mid} diagonals across x ${uc.toFixed(1)}`);
    // its bottom chord, seen from the platforms, under the middle
    const chord = hits([uc + 0.3, y0 - 3, -L + 0.0001], [0, 1, 0], [gb], 3.5)[0];
    // re-pinned round F12: the chord's underside is half its own height (G.chord[0], now 0.3 m) below its centre line, where it was a fixed 0.1 m
    assert.ok(chord && Math.abs(local(chord).y - (y0 - G.chord[0] / 2)) < 0.05, `the bottom chord over x ${uc.toFixed(1)}: ${chord && local(chord).y.toFixed(2)}`);
  }
});

test('B1: a ring in each rib\'s haunch, both feet of every rib, instanced in the ribs\' paint and not a shadow caster', () => {
  const H = S.HAUNCH_RING as { radius: number; tube: number };
  const across = 2 * (H.radius + H.tube);
  // re-pinned round S2 (shed-round-1 score, B1/B3; kx-shed-round2 pins the new figures): the ring in the rib's foot panel, as large as fits between the booms there (0.9 m)
  assert.ok(across >= 0.8 && across <= 1.4 && H.tube * 2 >= 0.08 && H.tube * 2 <= 0.16, `ring ${across} across, section ${2 * H.tube}`);
  const rings = group.getObjectByName('shed-haunch-rings') as THREE.InstancedMesh, ribs = group.getObjectByName('shed-ribs') as THREE.InstancedMesh;
  assert.ok(rings && rings.isInstancedMesh, 'an instanced mesh');
  assert.equal(rings.count, ribs.count, 'one to a rib'); // re-pinned round S2b (shed-round-2 score): the spine's feet carry none, its brick rising above the springing (kx-shed-round2)
  assert.equal(rings.material, ribs.material, 'the ribs\' own paint by day');
  assert.equal(buildingNightMaterialsOf(rings)?.night, material('ribPaint'), 'and at night');
  assert.ok(!rings.castShadow && !SHADOW_CASTERS.has('shed-haunch-rings'), 'not a caster');
  // in the rib's plane, between the booms; re-pinned round S2 (shed-round-1 score, B1/B3; kx-shed-round2 pins the new figures): in the foot panel, so no longer tangent to the vertical over the foot, and lower (1-8 m over the springing)
  const rho = H.radius + H.tube, rb = R - 1.3;
  for (const [u, y] of shed.haunchRingCentres(sp)) {
    assert.ok(Math.hypot(u, y - sp) > rb + rho - 0.05 && Math.hypot(u, y - sp) < R + 0.1, `between the booms (${Math.hypot(u, y - sp).toFixed(2)} from the vault's centre)`);
    assert.ok(y - sp > 1 && y - sp < 8, `${(y - sp).toFixed(2)} m over the springing`);
  }
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Vector3();
  const ribZ = new Set<number>();
  for (let i = 0; i < ribs.count; i++) { ribs.getMatrixAt(i, m); ribZ.add(Math.round(p.setFromMatrixPosition(m).z * 100)); }
  for (let i = 0; i < rings.count; i++) { rings.getMatrixAt(i, m); q.setFromMatrixPosition(m); assert.ok(ribZ.has(Math.round(q.z * 100)), `ring ${i} on a rib's plane`); }
});

test('B3: a cream stone impost on each arcade pier, east and west, its top on the springing line, never over an opening, 0.05-0.1 m proud, not a caster', () => {
  // re-pinned round S1b (platform-eye-p8-south: 0.4 m proud and butting the jambs, the imposts read as shelves crossing the windows): one to a pier, short of
  // the openings by ARCADE_IMPOST.margin, 0.05-0.1 m proud
  const I = S.ARCADE_IMPOST as { tall: number; out: number; margin: number };
  // re-pinned round S2 (shed-round-1 score, B1/B3; kx-shed-round2 pins the new figures): 0.25-0.35 m proud, a bracket under it, in their own paler cream and mesh; still never over an opening
  assert.ok(I.tall >= 0.25 && I.tall <= 0.5 && I.out >= 0.25 && I.out <= 0.35 && I.margin >= 0.1, JSON.stringify(I));
  const stone = group.getObjectByName('shed-arcade-imposts') as THREE.Mesh;
  assert.ok(!SHADOW_CASTERS.has('shed-arcade-imposts'));
  assert.equal(stone.material, material('stoneImpost'), 'the imposts\' cream');
  const opens = shed.eastArcadeOpenings(L);
  const eastFace = shed.eastArcadeU(layout) - shed.SPINE_WALL.thick / 2, westFace = shed.WEST_ARCADE.depth;
  let n = 0;
  for (const [face, dir] of [[eastFace, -1], [westFace, 1]] as const) {
    const ray = (v: number, y: number): THREE.Intersection | undefined => hits([face + dir * 3, y, -v], [-dir, 0, 0], [stone], 3)[0];
    for (let i = 0; i + 1 < opens.length; i++) {
      const a = opens[i]!, b = opens[i + 1]!, y = Math.min(a.jamb, b.jamb) - I.tall / 2;
      if (b.vc - b.r - (a.vc + a.r) < 2 * I.margin + 0.2) continue;
      const h = ray((a.vc + a.r + b.vc - b.r) / 2, y);
      const proud = h ? (local(h).x - face) * dir : NaN;
      assert.ok(proud >= 0.25 - 1e-6 && proud <= 0.35 + 1e-6, `the impost on the pier at v ${((a.vc + b.vc) / 2).toFixed(1)}, ${dir < 0 ? 'east' : 'west'}: ${proud.toFixed(3)} m proud`);
      n++;
    }
    // over every opening's span, at the imposts' height, no stone stands proud of the face
    for (const { vc, r, jamb } of opens) for (let k = 0; k <= 20; k++) {
      const v = vc - r - I.margin / 2 + ((2 * r + I.margin) * k) / 20;
      for (const y of [jamb - 0.05, jamb - I.tall / 2, jamb - I.tall + 0.05, jamb - I.tall - 0.1, jamb - I.tall - 0.3]) { // re-pinned round S2 (shed-round-1 score, B1/B3; kx-shed-round2 pins the new figures): and the bracket's height
        const h = ray(v, y);
        assert.ok(!h || (local(h).x - face) * dir < 0.01, `stone over the opening at v ${v.toFixed(2)} (${vc.toFixed(1)} +- ${r.toFixed(1)}), ${dir < 0 ? 'east' : 'west'}: ${h && ((local(h).x - face) * dir).toFixed(2)} m proud`);
      }
    }
  }
  assert.ok(n >= 4, `${n} imposts`);
});

test('B1: the ribs and haunch rings a lighter blue-grey by day (RIB_DAY_LIFT), ribPaint itself at night; the bars, clock iron and front steel unmoved', () => {
  const lift = S.RIB_DAY_LIFT as number;
  assert.ok(lift >= 1.3 && lift <= 2.5, `lift ${lift}`); // re-pinned round S2 (shed-round-1 score, B1/B3; kx-shed-round2 pins the new figures): 2.0
  const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const paint = material('ribPaint') as THREE.MeshLambertMaterial;
  for (const name of ['shed-ribs', 'shed-haunch-rings']) {
    const o = group.getObjectByName(name) as THREE.Mesh, day = o.material as THREE.MeshLambertMaterial;
    assert.ok(Math.abs(lum(day.color) / lum(paint.color) - lift) < 0.01, `${name} by day: ${(lum(day.color) / lum(paint.color)).toFixed(2)} of ribPaint`);
    assert.ok(day.emissive.equals(paint.emissive) && day.customProgramCacheKey() === paint.customProgramCacheKey(), `${name}: the paint's emissive and program`);
    assert.equal(buildingNightMaterialsOf(o)?.night, paint, `${name} at night: ribPaint`);
  }
  assert.equal(lum(paint.color).toFixed(4), lum(new THREE.Color(0x343b42)).toFixed(4), 'ribPaint itself unchanged');
  for (const name of ['shed-gable-bars', 'shed-front-bars', 'shed-arch-rings']) assert.equal((group.getObjectByName(name) as THREE.Mesh).material, paint, `${name} still in ribPaint`);
});
