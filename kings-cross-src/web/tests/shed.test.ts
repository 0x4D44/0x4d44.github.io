import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { CLOCK_TOWER_HEIGHT, SHED_LENGTH, SHED_SPAN_WIDTH, shedLayout, shedToWorld, stationBuilding, worldToShed } from '../../core/station.ts';
import { shedRoofY } from '../src/furniture.ts';
import { SHADOW_CASTERS } from '../src/lighting.ts';
import { material } from '../src/materials.ts';
import { buildShed, buildTower, eastArcadeU, NORTH_PIER, ribLanding, spineLowerOpenings, spineUpperOpenings, valleyTop, buildWesternRange, gableBars, GABLE_GLASS_FROM, glazedHalfAngle, GLAZED_STRIP_WIDTH, GLASS_OPACITY, glazingOpacity, lunetteBars, MEMBER_SIZE, RIB_SPACING, ribMembers, ribPositions, ROOF_SKIN, roofOpacity, SPINE_WALL, spineOpenings, TOWER_SIZE, valleyCut, vaultBand, vaultPoint, WESTERN_RANGE, WESTERN_RANGE_DEPTH_BEFORE, westernArches, westernBays, westernBlock, westernWindows, XRAY_OPACITY } from '../src/shed.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
const close = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
/** Geometry is stored as float32, good to about 4e-6 at 50 m: compare it to 0.1 mm. */
const EPS = 1e-4;
const positions = (g: THREE.BufferGeometry): THREE.BufferAttribute => g.getAttribute('position') as THREE.BufferAttribute;
const byName = (root: THREE.Object3D, name: string): THREE.Mesh => {
  const o = root.getObjectByName(name);
  assert.ok(o, `no object named ${name}`);
  return o as THREE.Mesh;
};
const bbox = (m: THREE.Mesh): THREE.Box3 => {
  m.geometry.computeBoundingBox();
  return m.geometry.boundingBox as THREE.Box3;
};

test('vaultPoint: angle 0 is the west springing, pi the east, pi/2 the crown', () => {
  const [w, wy] = vaultPoint(20, 5.6, 16, 0);
  const [e, ey] = vaultPoint(20, 5.6, 16, Math.PI);
  const [c, cy] = vaultPoint(20, 5.6, 16, Math.PI / 2);
  close(w, 4); close(wy, 5.6);
  close(e, 36); close(ey, 5.6);
  close(c, 20); close(cy, 21.6);
});

test('the glazed strip is the 29 m wide band along the crown: about 72% of the vault, as measured in R-lighting-materials-b (27.4 to 30.2 m)', () => {
  close(2 * R * Math.sin(glazedHalfAngle()), GLAZED_STRIP_WIDTH, 1e-9);
  assert.equal(GLAZED_STRIP_WIDTH, 29);
  const share = (2 * glazedHalfAngle()) / Math.PI;
  assert.ok(share > 0.66 && share < 0.78, `the glass covers ${(100 * share).toFixed(0)}% of the arc, the photograph's 72% plus or minus 6%`);
});

test('valleyCut: a roof skin wider than the arch stops on the valley line, above the springing and below the crown', () => {
  const rs = R + ROOF_SKIN;
  const cut = valleyCut(rs);
  const uc = 52.1; // the east vault: its west springing is on the valley line u = uc - R
  close(vaultPoint(uc, 5.64, rs, cut)[0], uc - R, 1e-9);
  close(vaultPoint(uc, 5.64, rs, Math.PI - cut)[0], uc + R, 1e-9); // and the mirror at the other end
  const rise = rs * Math.sin(cut);
  assert.ok(rise > 1 && rise < 5, `the valley girder is ${rise.toFixed(2)} m deep`);
  assert.equal(valleyCut(R), 0, 'a skin exactly the arch radius needs no cut');
});

test('vaultBand: vertices on the circle, normals outward and agreeing with the winding, UVs in metres', () => {
  const uc = 20;
  const sp = 5.6;
  const r = 16.3;
  const a0 = 0.4;
  const a1 = 1.2;
  const length = 30;
  const steps = 8;
  const g = vaultBand(uc, sp, r, a0, a1, length, steps);
  const p = positions(g);
  const n = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  assert.equal(p.count, 2 * (steps + 1));
  for (let i = 0; i < p.count; i++) {
    close(Math.hypot(p.getX(i) - uc, p.getY(i) - sp), r, EPS);
    assert.ok([0, -length].some((z) => Math.abs(p.getZ(i) - z) < EPS), 'z is 0 or -length');
    close(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)), 1, EPS);
    const out = (p.getX(i) - uc) * n.getX(i) + (p.getY(i) - sp) * n.getY(i);
    assert.ok(out > 0.999 * r, `vertex ${i}: normal points into the vault`);
  }
  // each triangle's winding gives the stored normal: a front face seen from outside
  const index = g.getIndex() as THREE.BufferAttribute;
  for (let t = 0; t < index.count; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, index.getX(t + k))) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const face = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    const stored = new THREE.Vector3().fromBufferAttribute(n, index.getX(t));
    assert.ok(face.dot(stored) > 0.95, `triangle ${t / 3} faces the wrong way`);
  }
  const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
  const vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
  close(Math.max(...us) - Math.min(...us), r * (a1 - a0), EPS); // metres of arc
  close(Math.max(...vs) - Math.min(...vs), length, EPS); // metres along the shed
});

test('ribMembers: a Warren truss of 65 members between the two booms, symmetric about the crown', () => {
  const sp = 5.6388;
  const ms = ribMembers(sp);
  assert.equal(ms.length, 65);
  assert.equal(ms.filter((m) => m.kind === 'boom').length, 32);
  const rt = R + 0.1;
  const rb = R - 1.3;
  let sx = 0;
  for (const m of ms) {
    const d = Math.hypot(m.c[0], m.c[1] - sp);
    // chord midpoints sit a little inside the circle through their end nodes
    assert.ok(d >= rb * Math.cos(Math.PI / 32) - 1e-9 && d <= rt + 1e-9, `member at ${d.toFixed(2)} m from the axis is outside the truss`);
    assert.ok(m.c[1] >= sp - 1e-9, 'no member below the springing');
    sx += m.c[0];
  }
  close(sx, 0, 1e-9);
  // the depth of the truss, top boom to bottom boom, is 1.4 m
  const tops = ms.filter((m) => m.kind === 'boom').map((m) => Math.hypot(m.c[0], m.c[1] - sp));
  close(Math.max(...tops) - Math.min(...tops), 1.4, 0.05);
});

test('ribPositions: every 6.1 m from half a bay in, all inside the shed length, 40 ribs for 800 ft', () => {
  const ps = ribPositions(SHED_LENGTH);
  assert.equal(ps.length, 40);
  close(ps[0] as number, RIB_SPACING / 2, 1e-9);
  for (let i = 1; i < ps.length; i++) close((ps[i] as number) - (ps[i - 1] as number), RIB_SPACING, 1e-9);
  assert.ok((ps[ps.length - 1] as number) < SHED_LENGTH);
});

test('the glazing bars of a great window all lie inside the half disc and above the springing', () => {
  const uc = 20.1;
  const sp = 5.6388;
  const bars = lunetteBars(uc, sp);
  assert.equal(bars.filter((b) => b.kind === 'mullion').length, 19);
  assert.equal(bars.filter((b) => b.kind === 'transom').length, 2);
  assert.equal(bars.filter((b) => b.kind === 'ring').length, 20);
  for (const b of bars) {
    const cos = Math.cos(b.rotZ);
    const sin = Math.sin(b.rotZ);
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [-0.5, 0.5]) {
        const x = b.c[0] + sx * b.s[0] * cos - sy * b.s[1] * sin;
        const y = b.c[1] + sx * b.s[0] * sin + sy * b.s[1] * cos;
        assert.ok(Math.hypot(x - uc, y - sp) <= R + 1e-9, `${b.kind} corner pokes out of the arch`);
        // the ring's first and last bars meet the sill at the springing and dip half a bar width into it
        assert.ok(y >= sp - 0.05, `${b.kind} corner is below the springing`);
      }
    }
  }
});

test('the gable bars start at the glass line: nothing below it', () => {
  const bars = gableBars(20.1, 5.6388, GABLE_GLASS_FROM);
  const full = lunetteBars(20.1, 5.6388).filter((b) => b.kind === 'mullion');
  assert.ok(bars.length > 20);
  for (const b of bars) {
    if (b.kind === 'mullion') {
      assert.ok(b.c[1] - b.s[1] / 2 >= GABLE_GLASS_FROM - 1e-9, 'mullion starts below the glass line');
      // trimmed from below only: it still reaches the top of the same bar in the great window
      const original = full.find((f) => Math.abs(f.c[0] - b.c[0]) < 1e-9) as (typeof full)[number];
      close(b.c[1] + b.s[1] / 2, original.c[1] + original.s[1] / 2, 1e-9);
    } else assert.ok(b.c[1] > GABLE_GLASS_FROM, `${b.kind} is below the glass line`);
  }
});

test('roofOpacity: solid inside the shed, thinning to the x-ray value as the camera pulls back', () => {
  const l = { width: 72, length: 244, crown: 21.6, spine: 36 }; // the spine at the middle, as the layout had it before 2026-11-24, so the pins below hold
  assert.equal(roofOpacity([36, 8, -100], l), 1, 'inside the shed');
  assert.ok(roofOpacity([-10, 3, -100], l) > 0.99, 'close to the roof it stays solid');
  close(roofOpacity([900, 600, 500], l), XRAY_OPACITY, 1e-12);
  let last = 1;
  for (let d = 0; d <= 400; d += 20) {
    const o = roofOpacity([36, 21.6 + 40 + d, -100], l); // above the roof, backing off
    assert.ok(o <= last + 1e-12, `opacity rose at ${d} m`);
    assert.ok(o >= XRAY_OPACITY - 1e-12 && o <= 1);
    last = o;
  }
  assert.equal(roofOpacity([900, 600, 500], l, 'solid'), 1);
  assert.equal(roofOpacity([36, 8, -100], l, 'xray'), XRAY_OPACITY);
});

test('glazingOpacity: a bright panel under a solid roof, the see-through tint at the x-ray roof, rising between, clamped outside', () => {
  close(glazingOpacity(1), GLASS_OPACITY.near, 1e-12);
  close(glazingOpacity(XRAY_OPACITY), GLASS_OPACITY.far, 1e-12);
  assert.ok(GLASS_OPACITY.near > 0.9, 'inside, the glazing reads as a daylit panel');
  assert.ok(GLASS_OPACITY.far < 0.5, 'from far off the trains and platforms show through it');
  let last = -1;
  for (let o = XRAY_OPACITY; o <= 1 + 1e-9; o += 0.05) {
    const g = glazingOpacity(o);
    assert.ok(g >= last - 1e-12, `glazing opacity fell at roof opacity ${o}`);
    last = g;
  }
  assert.equal(glazingOpacity(0), GLASS_OPACITY.far);
  assert.equal(glazingOpacity(2), GLASS_OPACITY.near);
});

test('the roof glazing follows the roof cladding: bright from inside the shed, the see-through tint from far off', () => {
  const group = buildShed(layout);
  group.updateMatrixWorld(true);
  const clad = byName(group, 'shed-roof-cladding');
  const glass = byName(group, 'shed-roof-glass');
  const mat = glass.material as THREE.Material;
  assert.equal(mat.transparent, true);
  assert.equal(mat.depthWrite, false, 'glazing must not hide what is behind it');
  assert.notEqual(mat, material('shedGlass'), 'its opacity is its own: the shared material is only the template');
  const look = (p: [number, number, number]): number => {
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(...p);
    clad.onBeforeRender({} as never, {} as never, cam, {} as never, {} as never, {} as never);
    return mat.opacity;
  };
  close(look([layout.width / 2, 8, -100]), GLASS_OPACITY.near, 1e-9);
  close(look([900, 600, 500]), GLASS_OPACITY.far, 1e-9);
  assert.equal(material('shedGlass').opacity, 1, 'the shared material is never changed');
});

test('ribMembers: slender sections, as the restored shed has (the first build\'s 0.38 x 0.30 booms read as heavy girders)', () => {
  const ms = ribMembers(5.6388);
  for (const m of ms) {
    const [depth, across] = m.kind === 'boom' ? MEMBER_SIZE.boom : MEMBER_SIZE.web;
    close(m.s[1], depth, 1e-12);
    close(m.s[2], across, 1e-12);
  }
  assert.ok(MEMBER_SIZE.boom[0] <= 0.3 && MEMBER_SIZE.boom[1] <= 0.25, 'booms are no more than 0.30 x 0.25 m');
  assert.ok(MEMBER_SIZE.web[0] <= 0.12 && MEMBER_SIZE.web[1] <= 0.1, 'webs are no more than 0.12 x 0.10 m');
});

test('the ironwork is dark grey steel, as in R-lighting-materials-a2 and -b, and the roof is lined with pale boarding: dark ribs and frames stand against bright glazing and a pale lining', () => {
  // The first build painted the ironwork light (so the undersides would not go black); the references show it dark: the lunette frames in a2, and the ribs
  // as dark silhouettes against the bright glazing in b. The small emissive term keeps an underside a dark grey, not black.
  const group = buildShed(layout);
  const luminance = (m: THREE.Material): number => {
    const c = (m as THREE.MeshLambertMaterial).color;
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };
  const lining = luminance(material('lining'));
  // re-pinned 2026-11-24 (the spine wall rebuilt from R-kx-shed-interior-c): the valley's grey fascia and its painted frame are gone, replaced by the
  // spine wall's brick up to the valley (R-c shows brick there); the ribs and bars keep every check, and the brick is checked below
  for (const name of ['shed-ribs', 'shed-front-bars', 'shed-gable-bars']) {
    const m = byName(group, name).material as THREE.MeshLambertMaterial;
    assert.equal(m, material('ribPaint'), `${name} is painted like the ribs`);
    assert.ok(luminance(m) > 0.02 && luminance(m) <= luminance(material('steel')), `${name}: dark steel, no lighter than the station's steel and not black: luminance ${luminance(m).toFixed(3)}`);
    assert.ok(8 * luminance(m) < lining, `${name} is at least eight times darker than the lining it stands against`);
    assert.ok(m.emissive.r + m.emissive.g + m.emissive.b < 0.2, `${name}'s lift is a floor, not a glow`);
  }
  assert.ok(!group.getObjectByName('shed-valley-girder'), 'no grey fascia in the valley: R-c shows brick');
  assert.equal(byName(group, 'shed-spine').material, material('brickFoot'), 'the valley is the spine wall\'s brick');
  for (const [name, key] of [['shed-roof-lining', 'lining']] as const) {
    const m = byName(group, name).material as THREE.MeshLambertMaterial;
    assert.equal(m, material(key), name);
    assert.ok(luminance(m) > 0.6, `${name}: luminance ${luminance(m).toFixed(2)}`);
    assert.ok(m.emissive.r + m.emissive.g + m.emissive.b > 0.5, `${name} glows a little (the light comes from above, so an underside would be black)`);
    // grey-white, not cream (R-lighting-materials-b): the paint's red does not beat its blue by more than a few per cent
    assert.ok(m.emissive.r < m.emissive.b * 1.06 && m.color.r < m.color.b * 1.08, `${name} is a neutral light grey: emissive ${m.emissive.getHexString()}, colour ${m.color.getHexString()}`);
  }
  assert.equal((byName(group, 'shed-roof-lining').material as THREE.Material).side, THREE.BackSide, 'the lining is seen from inside');
});

// Re-pinned 2026-11-24 (the spine wall rebuilt from R-kx-shed-interior-c, which shows brick up to the gutter, not a fascia): this test pinned the
// grey board-lined fascia that closed the valley from the springing to the skins. The same closure is now the wall's brick: it spans the same
// height (springing to where the skins meet, EPS), on the same line, and nothing of it faces down between the springing and the valley except the
// heads of its openings; the ribs' rhythm is the wall's piers and corbels (tested below), not a painted frame.
test('buildShed: the valley is closed by the spine wall\'s brick, from the springing up to where the skins meet, the length of the shed', () => {
  const group = buildShed(layout);
  const valley = layout.spine;
  const wall = byName(group, 'shed-spine');
  const p = positions(wall.geometry);
  const top = layout.springing + (R + ROOF_SKIN) * Math.sin(valleyCut(R + ROOF_SKIN));
  close(valleyTop(layout.springing), top, 1e-12);
  let yMax = -Infinity, zMin = Infinity, zMax = -Infinity, xMin = Infinity, xMax = -Infinity;
  for (let i = 0; i < p.count; i++) {
    if (-p.getZ(i) > layout.length + EPS) continue; // the north pier
    if (Math.abs(p.getX(i) - valley) > SPINE_WALL.thick / 2 + EPS) continue;
    yMax = Math.max(yMax, p.getY(i)); zMin = Math.min(zMin, p.getZ(i)); zMax = Math.max(zMax, p.getZ(i));
    xMin = Math.min(xMin, p.getX(i)); xMax = Math.max(xMax, p.getX(i));
  }
  close(yMax, top, EPS);
  close((xMin + xMax) / 2, valley, EPS);
  close(zMin, -layout.length, EPS);
  close(zMax, 0, EPS);
  assert.ok(2 * (xMax - valley) >= 0.5, 'no thinner than the fascia it replaces');
  // the wall's top is closed (seen from above when the roof is x-rayed): one quad the length of the shed at the valley's height, facing up
  const nor = wall.geometry.getAttribute('normal');
  let tops = 0;
  for (let i = 0; i < p.count; i++) if (nor.getY(i) > 0.99 && Math.abs(p.getY(i) - top) < EPS) tops++;
  assert.ok(tops >= 4, `${tops} vertices of the wall's top`);
});

test('the Western Range runs between the two OSM footprint corners that bound it', () => {
  const station = stationBuilding(data);
  assert.ok(station);
  const corners = (station as NonNullable<typeof station>).pts.map((p) => worldToShed(layout, p));
  // its north end is where the concourse arc of the footprint ends, v = 141.5 at u = -55.5
  assert.ok(corners.some((q) => Math.abs(q.v - WESTERN_RANGE.v1) < 0.3 && q.u < -50), `no footprint corner at v = ${WESTERN_RANGE.v1}`);
  // its south end is the footprint's inner corner beside the front, v = 8.1 at u = -7.5
  assert.ok(corners.some((q) => Math.abs(q.v - WESTERN_RANGE.v0) < 0.3 && q.u > -10 && q.u < -5), `no footprint corner at v = ${WESTERN_RANGE.v0}`);
  assert.ok(WESTERN_RANGE.storey * WESTERN_RANGE.storeys < layout.crown, 'the eaves are below the arch crown');
});

test('buildShed: the published dimensions, in the shed frame', () => {
  const group = buildShed(layout);
  const W = layout.width;
  const L = layout.length;
  close(L, SHED_LENGTH, 1e-9);
  // the glazed strip crowns the vault: skin on the 71 ft crown, the full 800 ft long
  const glass = bbox(byName(group, 'shed-roof-glass'));
  close(glass.max.y, layout.crown + ROOF_SKIN, EPS);
  close(glass.min.z, -L, EPS);
  close(glass.max.z, 0, EPS);
  // the front stands 2.4 m above the crowns, across the two vaults (re-pinned 2026-11-24, signed off: the front spans only the two vaults,
  // centred on the spine; it spanned the whole width W before, aisles included)
  const front = bbox(byName(group, 'shed-front'));
  close(front.max.y, layout.crown + 2.4, EPS);
  close(front.max.x - front.min.x, 2 * SHED_SPAN_WIDTH, EPS);
  close(byName(group, 'shed-front').position.x + (front.min.x + front.max.x) / 2, layout.spine, EPS);
  assert.ok(W > 2 * SHED_SPAN_WIDTH, 'the east aisle lies beyond it');
  // 40 ribs on each of the two vaults
  assert.equal((byName(group, 'shed-ribs') as unknown as THREE.InstancedMesh).count, 2 * ribPositions(L).length);
  // the tower stands on the spine, just in front of the front plane
  const tower = group.getObjectByName('clock-tower') as THREE.Object3D;
  close(tower.position.x, layout.spine, EPS); // re-pinned 2026-11-24: the tower is on the spine, which is no longer W / 2
  close(tower.position.z, TOWER_SIZE / 2 + 0.15, EPS);
});

test('buildShed: every mesh has finite positions and the roof skin never crosses the valley line', () => {
  const group = buildShed(layout);
  const sp = layout.springing;
  const valley = layout.spine; // re-pinned 2026-11-24: the valley is the layout's spine (it was aisle + 2R, which equals it only with even aisles)
  let meshes = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const p = positions(m.geometry);
    for (let i = 0; i < p.count * 3; i++) assert.ok(Number.isFinite(p.array[i]), `${m.name}: NaN in positions`);
  });
  assert.ok(meshes >= 20, `only ${meshes} meshes`);
  const clad = positions(byName(group, 'shed-roof-cladding').geometry);
  const west = layout.spine - R; // re-pinned 2026-11-24: the vault centres are a half span either side of the spine
  const east = layout.spine + R;
  const rs = R + ROOF_SKIN;
  let onWest = 0;
  let onEast = 0;
  for (let i = 0; i < clad.count; i++) {
    const x = clad.getX(i);
    const y = clad.getY(i);
    if (Math.abs(Math.hypot(x - west, y - sp) - rs) < EPS) { onWest++; assert.ok(x <= valley + EPS, `west skin reaches ${(x - valley).toFixed(2)} m past the valley line`); }
    if (Math.abs(Math.hypot(x - east, y - sp) - rs) < EPS) { onEast++; assert.ok(x >= valley - EPS, `east skin reaches ${(valley - x).toFixed(2)} m past the valley line`); }
  }
  assert.ok(onWest > 20 && onEast > 20);
  // the spine wall closes the gap from the springing to where the skins start (re-pinned 2026-11-24: it was the valley girder, the grey fascia
  // that R-kx-shed-interior-c does not show; the wall reaches from below the springing, so its bottom is checked as under it)
  const wp = positions(byName(group, 'shed-spine').geometry);
  const girder = new THREE.Box3();
  for (let i = 0; i < wp.count; i++) if (-wp.getZ(i) <= layout.length + EPS && Math.abs(wp.getX(i) - valley) <= SPINE_WALL.thick / 2 + EPS) girder.expandByPoint(new THREE.Vector3(wp.getX(i), wp.getY(i), wp.getZ(i)));
  assert.ok(girder.min.y <= sp + EPS);
  close(girder.max.y, sp + rs * Math.sin(valleyCut(rs)), EPS);
  close((girder.min.x + girder.max.x) / 2, valley, EPS);
  close(girder.min.z, -layout.length, EPS);
});

test('buildShed: the front has its two great windows, glazed and barred, and no glass inside the gable below the trains', () => {
  const group = buildShed(layout);
  const front = positions(byName(group, 'shed-front-glass').geometry);
  let hi = -Infinity;
  for (let i = 0; i < front.count; i++) hi = Math.max(hi, front.getY(i));
  close(hi, layout.springing + R - 0.02, 0.01);
  const gable = positions(byName(group, 'shed-gable-glass').geometry);
  let lo = Infinity;
  for (let i = 0; i < gable.count; i++) lo = Math.min(lo, gable.getY(i));
  close(lo, GABLE_GLASS_FROM, EPS);
  assert.ok(lo > 8, 'the open arch below the gable glass clears a train');
});

test('buildShed: the front\'s great windows look out south and the gables\' look out north, in the winding and in the stored normals: the glass mirrors the sky on its front face alone (round six, E4), so that face must be the outside', () => {
  const group = buildShed(layout);
  /** the sum over the triangles of the z of their winding's normal (twice the area, signed), and the z the vertices store */
  const facing = (name: string): { winding: number; stored: number[] } => {
    const g = byName(group, name).geometry;
    const p = positions(g);
    const index = g.getIndex() as THREE.BufferAttribute;
    const normal = g.getAttribute('normal') as THREE.BufferAttribute;
    const at = (i: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(p, index.getX(i));
    let winding = 0;
    for (let i = 0; i < index.count; i += 3) winding += new THREE.Vector3().subVectors(at(i + 1), at(i)).cross(new THREE.Vector3().subVectors(at(i + 2), at(i))).z;
    const stored = new Set<number>();
    for (let i = 0; i < normal.count; i++) stored.add(Math.round(normal.getZ(i) * 1e6) / 1e6);
    return { winding, stored: [...stored] };
  };
  const front = facing('shed-front-glass');
  assert.ok(front.winding > 100, `the front's glass is wound to face south: ${front.winding}`);
  assert.deepEqual(front.stored, [1], 'and stores +z for its normals');
  const gable = facing('shed-gable-glass');
  assert.ok(gable.winding < -100, `the gables' glass is wound to face north: ${gable.winding}`);
  assert.deepEqual(gable.stored, [-1], 'and stores -z for its normals');
});

test('buildTower: 112 ft overall including the vane, a clock on each of the four faces looking outward', () => {
  const tower = buildTower(30);
  let top = 0;
  tower.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.geometry instanceof THREE.CircleGeometry || m.geometry instanceof THREE.RingGeometry) return;
    m.geometry.computeBoundingBox();
    top = Math.max(top, (m.geometry.boundingBox as THREE.Box3).max.y);
  });
  close(top, CLOCK_TOWER_HEIGHT, EPS);
  const clocks: THREE.Mesh[] = [];
  tower.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry instanceof THREE.CircleGeometry) clocks.push(o as THREE.Mesh); });
  assert.equal(clocks.length, 4);
  const faces = clocks.map((c) => {
    const n = new THREE.Vector3(0, 0, 1).applyEuler(c.rotation);
    // a clock faces away from the tower's axis
    return n.x * c.position.x + n.z * c.position.z;
  });
  for (const f of faces) assert.ok(f > TOWER_SIZE / 2, 'a clock faces into the tower');
});

test('buildWesternRange: three storeys of brick west of the shed wall, between its OSM limits', () => {
  const range = buildWesternRange();
  const brick = bbox(byName(range, 'range-brick'));
  const { v0, v1, depth, storey, storeys, roofRise } = WESTERN_RANGE;
  assert.ok(brick.max.x <= 0 && brick.min.x >= -depth - 0.1, 'the Range stands west of the shed wall');
  close(brick.min.z, -v1, EPS);
  close(brick.max.z, -v0, EPS);
  close(brick.max.y, storey * storeys + 0.5 + roofRise, EPS); // its gable ends rise to the ridge
  const slate = bbox(byName(range, 'range-roof'));
  assert.ok(slate.max.y > brick.max.y - EPS);
  // The Range's concourse face (R-a, R-ab, R-b): a brick centre of ten bays about the funnel with six large windows on its first and top storeys (round 5, C4: fewer, larger
  // windows, not one to a bay), a tall round-headed opening under each and in every ground-floor bay north of it, and nothing above those openings either side (the concourse's
  // curtain wall hangs there). The east face, over the shed's aisle roof, keeps its top-storey window in every bay. Arup Journal 2/2012 p27 fig4/p29 locates five southern bays; the built JMP photograph shows the neighbouring
  // public/shop interfaces. Their station-frame alignment/widths remain ASSUMED, independently pinned here.
  const bays = Math.floor((v1 - v0) / WESTERN_RANGE.bay);
  assert.equal(bays, 39);
  const margin = (v1 - v0 - bays * WESTERN_RANGE.bay) / 2;
  const allLowerCentres = Array.from({ length: bays }, (_, i) => v0 + margin + (i + 0.5) * WESTERN_RANGE.bay);
  assert.deepEqual(westernBays().map(v => v.toFixed(3)), allLowerCentres.map(v => v.toFixed(3)), 'a whole number of 3.4 m bays, centred in the OSM length');
  assert.deepEqual(range.children.map(c => c.name).sort(), ['range-brick', 'range-public-frames', 'range-public-glazing', 'range-roof', 'range-stone', 'range-windows'], 'six meshes, six draw calls');
  const sash = positions(byName(range, 'range-windows').geometry);
  const decals = Array.from({ length: sash.count / 4 }, (_, i) => {
    const z = [0, 1, 2, 3].map(k => sash.getZ(i * 4 + k)), y = [0, 1, 2, 3].map(k => sash.getY(i * 4 + k));
    return { west: sash.getX(i * 4) < -0.5, v: -(Math.min(...z) + Math.max(...z)) / 2, foot: Math.min(...y), wide: Math.max(...z) - Math.min(...z), tall: Math.max(...y) - Math.min(...y) };
  });
  assert.deepEqual(decals.filter(d => !d.west).map(d => d.v.toFixed(3)), allLowerCentres.map(v => v.toFixed(3)), 'a window in every bay on the east face');
  assert.ok(decals.filter(d => !d.west).every(d => Math.abs(d.foot - 9.1) < EPS), 'on the top storey only, the one over the shed roof');
  // ten bays centred 0.25 m south of the funnel's axis (v 72.85, where concourse-fitout.test.ts pins the funnel): v 56.1 to 90.1, 34 m, and six windows dividing it evenly
  assert.equal(allLowerCentres.filter(v => v > 56.1 && v < 90.1).length, 10);
  assert.deepEqual(westernBlock().map(v => +v.toFixed(3)), [56.1, 90.1], 'the brick centre runs from bay edge to bay edge');
  const windows = Array.from({ length: 6 }, (_, i) => 56.1 + (34 * (i + 0.5)) / 6);
  assert.deepEqual(westernWindows().map(v => v.toFixed(3)), windows.map(v => v.toFixed(3)), 'six windows, a sixth of the brick centre each: larger than a bay');
  const west = decals.filter(d => d.west);
  // round 7 (C4): beside the brick centre the top storey of every bay has a window of its own, 1.2 x 2.4 m, a little smaller than the centre's sashes (29 bays: 14 south of it, 15 north)
  const flankBays = allLowerCentres.filter(v => v < 56.1 || v > 90.1), flank = west.filter(d => Math.abs(d.wide - 1.2) < EPS && Math.abs(d.tall - 2.4) < EPS);
  assert.equal(flankBays.length, 14 + 15, 'fourteen bays south of the brick centre and fifteen north of it');
  assert.equal(west.length, 6 + 12 + flankBays.length, 'a top-storey sash over each of the six windows, the three lights of each of the four between the arched ends on the first floor, and a window in the top storey of each bay beside the centre: none on the ground floor');
  assert.deepEqual(flank.map(d => d.v.toFixed(3)).sort(), flankBays.map(v => v.toFixed(3)).sort(), 'one window 1.2 x 2.4 m in the middle of every bay beside the brick centre, and none in front of it');
  assert.ok(flank.every(d => Math.abs(d.foot - 8.95) < EPS), 'on the top storey, a window foot 8.95 m up, as the centre\'s sashes');
  for (const v of windows) assert.ok(west.some(d => Math.abs(d.v - v) < EPS && Math.abs(d.foot - 8.95) < EPS && Math.abs(d.wide - 1.9) < EPS && Math.abs(d.tall - 2.9) < EPS), `a 1.9 x 2.9 m sash on the top storey at v ${v.toFixed(2)}`);
  for (const v of windows.slice(1, 5)) for (const k of [-1.2, 0, 1.2]) assert.ok(west.some(d => Math.abs(d.v - (v + k)) < EPS && Math.abs(d.foot - 4.75) < EPS && Math.abs(d.wide - 1) < EPS && Math.abs(d.tall - 2.8) < EPS), `a 1 x 2.8 m light on the first floor at v ${(v + k).toFixed(2)}`);
  // The gateline's five bays and the two shops replace ground-floor openings; every other opening wears a pane in the public glazing (R-b)
  const publicIntervals = [
    ...[12.1, 20.1, 28.1, 36.1, 44.1].map(v => [v - 3.3, v + 3.3]),
    ...[52.1, 56.1].map(v => [v - 1.4, v + 1.4]),
  ];
  // An opening is lost to an interface where its 1.4 m central span overlaps it.
  const open = (v: number): boolean => !publicIntervals.some(([a, b]) => v + 0.7 > a! && v - 0.7 < b!);
  const beyond = allLowerCentres.filter(v => v > 90.1);
  assert.equal(beyond.length, 15);
  assert.ok(windows.every(open) && beyond.every(open), 'no window and no bay north of the brick centre stands over the gateline or a shop');
  assert.deepEqual(westernArches().map(v => v.toFixed(3)), [...windows, ...beyond].map(v => v.toFixed(3)), 'an opening under each of the six windows and in every bay north of the brick centre: 21');
  assert.deepEqual(westernArches().filter(v => v > 90.1).map(v => v.toFixed(3)), beyond.map(v => v.toFixed(3)), 'every northern bay has one');
});

test('the Range can be left out', () => {
  assert.equal(buildShed(layout, { range: false }).getObjectByName('western-range'), undefined);
  assert.ok(buildShed(layout).getObjectByName('western-range'));
});

test('the roof the platform furniture hangs from (shedRoofY) is this shed\'s arch: its crown over each arch centre, the springing over the aisles and at the valley', () => {
  const sp = layout.springing;
  for (const k of [-1, 1]) {
    const uc = layout.spine + k * R; // re-pinned 2026-11-24: the vault centres from the spine (they were aisle + R and aisle + 3R)
    close(shedRoofY(layout, uc), layout.crown, 1e-9);
    close(shedRoofY(layout, uc - R), sp, 1e-9);
    close(shedRoofY(layout, uc + R), sp, 1e-9);
    // a point on the arch is on the circle the ribs are drawn on: between the radii of the lower and the upper boom
    const booms = ribMembers(sp).filter((m) => m.kind === 'boom').map((m) => Math.hypot(m.c[0], m.c[1] - sp));
    for (const d of [-12, -7, -2.5, 0, 4, 9, 14]) {
      const r = Math.hypot(d, shedRoofY(layout, uc + d) - sp);
      assert.ok(r > Math.min(...booms) && r < Math.max(...booms), `at ${d} m from the axis the roof is ${r.toFixed(2)} m from the arch centre, outside the truss ${Math.min(...booms).toFixed(2)}-${Math.max(...booms).toFixed(2)}`);
    }
  }
  close(shedRoofY(layout, layout.width - layout.aisleEast / 2), sp, 1e-9); // over the east aisle (re-pinned 2026-11-24: there is no west aisle now)
});

// The shed realignment of 2026-11-24 (wrk_docs/2026.11.23 - KXLIVE - Shed realignment and centre arcade design.md, signed off): the arcaded
// spine wall stands under the valley, its top at the springing, where both vaults spring; every figure of the wall is ASSUMED (SPINE_WALL).
// Re-pinned 2026-11-24 (the spine wall rebuilt from R-kx-shed-interior-c): the wall's top was the springing, under a grey fascia; R-c shows the
// brick going on up to the gutter, so its top is now where the skins meet (valleyTop), at the same tolerance. The vaults still spring from its line.
test('buildShed: the spine wall meets the springing: it stands up to the valley, both vaults spring from its line, each still 105 ft across', () => {
  const group = buildShed(layout);
  // the wall is its own mesh, the shed's brick, and casts no sun shadow (lead follow-up 2026-11-24: the shadow pass has no room for it)
  const brick = byName(group, 'shed-spine');
  assert.equal(brick.material, material('brickFoot'), 'the brick of the shed');
  assert.ok(!SHADOW_CASTERS.has('shed-spine'), 'not a sun-shadow caster');
  const p = positions(brick.geometry);
  const sp = layout.springing, half = SPINE_WALL.thick / 2;
  let top = -Infinity, foot = Infinity, n = 0, xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    if (Math.abs(x - layout.spine) > half + 1e-4) continue; // float32 positions
    n++;
    top = Math.max(top, p.getY(i)); foot = Math.min(foot, p.getY(i));
    xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); zMin = Math.min(zMin, p.getZ(i)); zMax = Math.max(zMax, p.getZ(i));
  }
  assert.ok(n > 1000, `${n} brick vertices on the spine line`);
  close(top, valleyTop(sp), 1e-6); // the design asks 1e-9; the drawn positions are float32, good to about 5e-7 m at this height
  assert.ok(foot < 0, 'from the ground');
  close(xMin, layout.spine - half, 1e-5); // float32 positions: 32.504 is stored as 32.5040016
  close(xMax, layout.spine + half, 1e-5);
  close(zMax, 0, 1e-5);
  close(zMin, -layout.length, 1e-4);
  // the vaults: the ribs are instanced on the two vault axes, a half span either side of the spine
  const ribs = byName(group, 'shed-ribs') as unknown as THREE.InstancedMesh;
  const axes = new Set<string>();
  const m = new THREE.Matrix4(), t = new THREE.Vector3();
  for (let i = 0; i < ribs.count; i++) { ribs.getMatrixAt(i, m); t.setFromMatrixPosition(m); axes.add(t.x.toFixed(9)); }
  const [west, east] = [...axes].map(Number).sort((a, b) => a - b) as [number, number];
  assert.equal(axes.size, 2);
  // (the instance matrices are float32: 16.002 is stored to about 1e-6)
  close(west + R, layout.spine, 1e-5); // the west vault's east springing
  close(east - R, layout.spine, 1e-5); // the east vault's west springing
  close(2 * R, SHED_SPAN_WIDTH, 1e-12);
  close(west - R, 0, 1e-5); // and the west vault springs from the west wall: no west aisle
  // the wall runs on up through the springing to the valley, centred on the spine (re-pinned 2026-11-24: it was the fascia standing on the wall at
  // the springing, centred on it, at 1e-6)
  close((xMin + xMax) / 2, layout.spine, 1e-6);
  assert.ok(foot < sp - 1e-6 && top > sp + 1e-6, 'through the springing');
  // one round-headed opening in every rib bay: the openings sit between the ribs, so a pier stands under each
  const opens = spineOpenings(layout.length), ribV = ribPositions(layout.length);
  assert.equal(opens.length, ribV.length - 1);
  for (const v of opens) assert.ok(ribV.every(r => Math.abs(r - v) >= SPINE_WALL.opening / 2 + 0.5), `the opening at v ${v} clears every rib's pier`);
  assert.ok(SPINE_WALL.crown < sp && Math.abs(SPINE_WALL.jamb + SPINE_WALL.opening / 2 - SPINE_WALL.crown) < 1e-9, 'a semicircular head, under the springing');
});

test('the realignment took the Range\'s depth, not its concourse face: the face, and the concourse built against it, stand where they stood', () => {
  close(WESTERN_RANGE.depth + layout.westShift, WESTERN_RANGE_DEPTH_BEFORE, 1e-12);
  assert.ok(layout.westShift > 2 && layout.westShift < 2.1, `the west wall moved ${layout.westShift} m west`);
});

// Scorer hold of 2026-11-24 (score-arcade-1, B3 and B7): the east aisle, 10.25 m wide since the realignment, showed the sky through a roof with no
// underside, and the east vault's east edge stood on nothing. A ray straight up from a platform eye must meet a face turned towards it.
const shedWorld = (): THREE.Group => {
  const g = buildShed(layout);
  g.updateMatrixWorld(true);
  return g;
};
const solidMat = (m: THREE.Material): boolean => !(m.transparent && m.opacity < 0.9);
const upHit = (g: THREE.Object3D, u: number, v: number, y: number): THREE.Intersection | undefined => {
  const [x, z] = shedToWorld(layout, u, v);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 1, 0), 0, 100);
  return ray.intersectObject(g, true)[0];
};

test('buildShed: the east aisle\'s roof is closed from below over its full width and length, a solid roof under the springing', () => {
  const g = shedWorld(), eye = 0.9 + 1.7, a = eastArcadeU(layout) + SPINE_WALL.thick / 2;
  let n = 0;
  for (let u = a + 0.25; u < layout.width - 0.05; u += 0.95) {
    for (let v = 2; v < layout.length - 1; v += 12.5) {
      const hit = upHit(g, u, v, eye);
      assert.ok(hit, `open sky over the east aisle at (${u.toFixed(2)}, ${v})`);
      const mats = Array.isArray((hit.object as THREE.Mesh).material) ? ((hit.object as THREE.Mesh).material as THREE.Material[]) : [(hit.object as THREE.Mesh).material as THREE.Material];
      assert.ok(mats.every(solidMat), `at (${u.toFixed(2)}, ${v}) the first thing overhead is ${hit.object.name}, see-through`);
      assert.ok(hit.point.y <= layout.springing + 1e-3, `at (${u.toFixed(2)}, ${v}) the roof is ${hit.point.y.toFixed(2)} m up, over the springing`);
      n++;
    }
  }
  assert.ok(n > 150, `${n} rays`);
});

test('buildShed: nowhere across the shed, west wall to east wall, does a ray straight up from the platforms see the sky', () => {
  const g = shedWorld();
  for (let u = 0.05; u < layout.width; u += 0.73) {
    for (let v = 3; v < layout.length - 1; v += 40) assert.ok(upHit(g, u, v, 2.6), `open sky at (${u.toFixed(2)}, ${v})`);
  }
});

test('buildShed: the east vault\'s east springing stands on the east arcade, a wall of the spine wall\'s pattern from ground to springing the length of the shed', () => {
  const g = buildShed(layout);
  const wall = byName(g, 'shed-east-arcade');
  assert.equal(wall.material, material('brickFoot'), 'the brick of the shed');
  assert.ok(!SHADOW_CASTERS.has('shed-east-arcade'), 'not a sun-shadow caster: the pass has no room for it');
  const e = eastArcadeU(layout), half = SPINE_WALL.thick / 2;
  close(e, layout.spine + 2 * R, 1e-12); // the east vault's east springing
  const p = positions(wall.geometry);
  let top = -Infinity, foot = Infinity, xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < p.count; i++) {
    top = Math.max(top, p.getY(i)); foot = Math.min(foot, p.getY(i));
    xMin = Math.min(xMin, p.getX(i)); xMax = Math.max(xMax, p.getX(i)); zMin = Math.min(zMin, p.getZ(i)); zMax = Math.max(zMax, p.getZ(i));
  }
  close(top, layout.springing, 1e-6); // float32 positions
  assert.ok(foot < 0, 'from the ground');
  close(xMin, e - half, 1e-5);
  close(xMax, e + half, 1e-5);
  close(zMax, 0, 1e-5);
  close(zMin, -layout.length, 1e-4);
  // the east vault's ribs land on it: their east feet are on its line
  const ribs = byName(g, 'shed-ribs') as unknown as THREE.InstancedMesh;
  const m = new THREE.Matrix4(), t = new THREE.Vector3();
  let east = -Infinity;
  for (let i = 0; i < ribs.count; i++) { ribs.getMatrixAt(i, m); t.setFromMatrixPosition(m); east = Math.max(east, t.x); }
  close(east + R, e, 1e-5);
  // a pier under every rib: a ray along the wall's thickness at mid-height, at each rib, meets brick
  g.updateMatrixWorld(true);
  for (const v of ribPositions(layout.length)) {
    for (const y of [2, layout.springing - 0.3]) {
      const [x0, z0] = shedToWorld(layout, e - 3, v), [x1, z1] = shedToWorld(layout, e + 3, v);
      const dir = new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize();
      const hit = new THREE.Raycaster(new THREE.Vector3(x0, y, z0), dir, 0, 6).intersectObject(wall, false)[0];
      assert.ok(hit, `no pier under the rib at v ${v.toFixed(1)}, y ${y}`);
      close(hit.distance, 3 - half, 1e-3);
    }
  }
});

// The spine wall rebuilt 2026-11-24 from the photographs (SPINE_WALL, NORTH_PIER: measured in memory from R-kx-shed-interior-c, -a, -d and
// R-kx-front-d; the scorers of score-arcade-2 read the first build as a squat viaduct under a grey fascia). Rays across the wall in the shed frame.
const across = (g: THREE.Object3D, mesh: THREE.Object3D, u: number, v: number, y: number, reach = 3): THREE.Intersection | undefined => {
  const [x0, z0] = shedToWorld(layout, u - reach, v), [x1, z1] = shedToWorld(layout, u + reach, v);
  const dir = new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize();
  g.updateMatrixWorld(true);
  return new THREE.Raycaster(new THREE.Vector3(x0, y, z0), dir, 0, 2 * reach).intersectObject(mesh, false)[0];
};
const down = (g: THREE.Object3D, mesh: THREE.Object3D, u: number, v: number, y: number, reach = 2): THREE.Intersection | undefined => {
  const [x, z] = shedToWorld(layout, u, v);
  g.updateMatrixWorld(true);
  return new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0), 0, reach).intersectObject(mesh, true)[0];
};

test('the spine wall\'s upper storey: a great round-headed opening in every rib bay over the band, crowned as high as the valley allows (R-kx-shed-interior-c)', () => {
  const g = shedWorld(), wall = byName(g, 'shed-spine'), s = layout.spine, sp = layout.springing;
  const top = valleyTop(sp), opens = spineUpperOpenings(layout.length, top);
  assert.equal(opens.length, ribPositions(layout.length).length - 1, 'one a bay');
  // R-c: the span is 0.72-0.76 of the 6.1 m bay (MEASURED), so the piers under the ribs are narrower than the arches
  assert.ok(SPINE_WALL.upperSpan / RIB_SPACING >= 0.7 && SPINE_WALL.upperSpan / RIB_SPACING <= 0.78, `span ${SPINE_WALL.upperSpan}`);
  // R-c puts the crown about 8.6 m over the platform (the scorers read about 8); the model's valley caps it, so it must stand within 1.6 m of that
  // and at least 0.3 m under the valley, with brick over it
  for (const { vc, r, jamb } of opens) {
    const crown = jamb + r;
    assert.ok(crown - 0.9 >= 7.0 && crown - 0.9 <= 8.9, `crown ${(crown - 0.9).toFixed(2)} m over the platform`);
    assert.ok(crown <= top - 0.3, 'brick over the head');
    assert.ok(!across(g, wall, s, vc, crown - 0.1), `open under the crown at v ${vc.toFixed(1)}`);
    assert.ok(across(g, wall, s, vc, crown + 0.15), `brick over the crown at v ${vc.toFixed(1)}`);
    const y = ribLanding(sp) + 0.3;
    for (const side of [-1, 1]) {
      assert.ok(!across(g, wall, s, vc + side * (r - 0.2), y), `open to its jamb at v ${vc.toFixed(1)}`);
      assert.ok(across(g, wall, s, vc + side * (r + 0.2), y), `a pier past its jamb at v ${vc.toFixed(1)}`);
    }
  }
});

test('the spine wall\'s lower storey: two round-headed openings in every rib bay at the platform, a pier between them (R-kx-shed-interior-c)', () => {
  const g = shedWorld(), wall = byName(g, 'shed-spine'), s = layout.spine;
  const opens = spineLowerOpenings(layout.length);
  assert.equal(opens.length, 2 * (ribPositions(layout.length).length - 1));
  assert.ok(SPINE_WALL.opening / RIB_SPACING >= 0.2 && SPINE_WALL.opening / RIB_SPACING <= 0.3, 'each a quarter of the bay, as measured');
  assert.ok(SPINE_WALL.crown < ribLanding(layout.springing) - SPINE_WALL.band, 'crowned under the band');
  for (const v of spineOpenings(layout.length)) assert.ok(across(g, wall, s, v, 2.5), `a pier between the pair at v ${v.toFixed(1)}`);
  for (const { vc } of opens) assert.ok(!across(g, wall, s, vc, 2.5), `open at v ${vc.toFixed(1)}`);
  for (const v of ribPositions(layout.length)) assert.ok(across(g, wall, s, v, 2.5), `a pier under the rib at v ${v.toFixed(1)}`);
});

test('every rib lands on a stone corbel on the wall\'s face at the springing, both faces of the spine and the vault face of the east arcade, over a stone band', () => {
  const g = shedWorld(), stone = byName(g, 'shed-spine-stone'), sp = layout.springing;
  assert.equal(stone.material, material('stoneFoot'));
  assert.ok(!SHADOW_CASTERS.has('shed-spine-stone'), 'not a sun-shadow caster');
  const half = SPINE_WALL.thick / 2;
  // the rib's foot runs from its outer boom at the springing line to its inner boom 1.3 m inside it (ribMembers): the corbel reaches under it
  const faces: [number, number][] = [[layout.spine, -1], [layout.spine, 1], [eastArcadeU(layout), -1]];
  for (const [u, side] of faces) {
    for (const v of ribPositions(layout.length)) {
      for (const d of [half + 0.1, 1.3]) {
        const hit = down(g, stone, u + side * d, v, sp);
        assert.ok(hit, `no corbel ${d} m out at u ${u.toFixed(1)} side ${side}, v ${v.toFixed(1)}`);
        close(hit.point.y, ribLanding(sp), 1e-3);
      }
    }
    // the band runs between the corbels, its top at the ribs' landing
    for (const v of spineOpenings(layout.length).filter((_, i) => i % 5 === 0)) {
      const hit = down(g, stone, u + side * (half + 0.04), v, sp);
      assert.ok(hit, `no band at u ${u.toFixed(1)} side ${side}, v ${v.toFixed(1)}`);
      close(hit.point.y, ribLanding(sp), 1e-3);
    }
  }
  assert.ok(sp - ribLanding(sp) <= 0.15, 'the corbels meet the ribs\' feet');
});

test('a massive brick pier stands at the spine\'s north end under the gables\' valley, rising over them (R-kx-front-d)', () => {
  const g = shedWorld(), wall = byName(g, 'shed-spine'), s = layout.spine, L = layout.length;
  // R-kx-front-d: its face 2.3-4.7 m across (MEASURED); here 2.8 m at the platform
  assert.ok(2 * NORTH_PIER.half >= 2.3 && 2 * NORTH_PIER.half <= 4.7);
  for (const v of [L - NORTH_PIER.south + 0.1, L - 0.5, L + NORTH_PIER.north - 0.1]) {
    for (const y of [1.5, valleyTop(layout.springing) - 0.2]) {
      const hit = across(g, wall, s, v, y, 4);
      assert.ok(hit, `the pier at v ${v.toFixed(1)}, y ${y}`);
      close(hit.distance, 4 - NORTH_PIER.half, 1e-3);
    }
  }
  // it rises over the valley, coped in stone, to about the springing + 5.9 m (MEASURED)
  const top = down(g, g, s, L - 0.5, 20, 20);
  assert.ok(top && top.point.y >= layout.springing + 5.5, `the pier tops out at ${top?.point.y.toFixed(2)}`);
  // and stands proud of the gables' arch rings (0.5 m deep, behind the gable plane)
  const [x0, z0] = shedToWorld(layout, s + NORTH_PIER.upperHalf - 0.1, L + 6), [x1, z1] = shedToWorld(layout, s + NORTH_PIER.upperHalf - 0.1, L);
  const hit = new THREE.Raycaster(new THREE.Vector3(x0, 4, z0), new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize(), 0, 6).intersectObject(wall, false)[0];
  assert.ok(hit && hit.distance < 6 - 0.5 - 1e-3, 'the pier\'s north face stands outside the arch rings');
});
