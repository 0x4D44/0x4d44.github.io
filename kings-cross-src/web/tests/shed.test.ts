import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { CLOCK_TOWER_HEIGHT, SHED_LENGTH, SHED_SPAN_WIDTH, shedLayout, shedToWorld, stationBuilding, worldToShed } from '../../core/station.ts';
import { shedRoofY } from '../src/furniture.ts';
import { createSunShadow, SHADOW_CASTERS } from '../src/lighting.ts';
import { ARCADE_FRAME, ARCADE_GLASS, material, PANE_UV, TEXTURES, windowNight } from '../src/materials.ts';
import { westArcadeOpenings, WEST_GLAZING } from '../src/shed.ts';
import { buildShed, buildTower, EAST_ARCADE, eastArcadeOpenings, eastArcadeU, NORTH_PIER, RIB_FOOT, ribLanding, spineLowerOpenings, spineUpperOpenings, valleyTop, buildWesternRange, gableBars, GABLE_GLASS_FROM, glazedHalfAngle, GLAZED_STRIP_WIDTH, GLASS_OPACITY, glazingOpacity, lunetteBars, MEMBER_SIZE, RIB_SPACING, ribMembers, ribPositions, ROOF_SKIN, roofOpacity, SPINE_WALL, spineOpenings, TOWER_SIZE, valleyCut, vaultBand, vaultPoint, WESTERN_RANGE, WESTERN_RANGE_DEPTH_BEFORE, westernArches, westernBays, westernBlock, westernWindows, XRAY_OPACITY } from '../src/shed.ts';

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

test('the roof outside (rubric A5, R-kx-front-e): the glazed crown 72% +-6% of the arc, slate flanks darker than the glass, rib caps every rib, crown bars every 2.7 m of arc, gutters', async () => {
  const { ROOF_EXTERIOR, crownBarAngles } = await import('../src/shed.ts') as typeof import('../src/shed.ts') & { ROOF_EXTERIOR: { barPitch: number; ribCap: readonly number[]; gutter: readonly number[] }; crownBarAngles: () => number[] };
  assert.ok(ROOF_EXTERIOR && typeof crownBarAngles === 'function', 'the roof outside has a spec (ROOF_EXTERIOR, crownBarAngles)');
  const rs = SHED_SPAN_WIDTH / 2 + ROOF_SKIN;
  const phi = glazedHalfAngle();
  const cut = valleyCut(rs);
  const share = (2 * phi) / (Math.PI - cut);
  assert.ok(share > 0.66 && share < 0.78, `glazed share of the skin's arc ${share.toFixed(3)}, 0.72 +-0.06`);
  const group = buildShed(layout);
  const lum = (m: THREE.Material): number => { const c = (m as THREE.MeshLambertMaterial).color; return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
  const clad = lum(byName(group, 'shed-roof-cladding').material as THREE.Material), glass = lum(byName(group, 'shed-roof-glass').material as THREE.Material);
  assert.ok(2 * clad < glass, `slate flanks (${clad.toFixed(3)}) at most half the glass's tone (${glass.toFixed(3)})`);
  // the crown's bars: evenly 2.7 m of arc apart, inside the glazed strip, at least ten a vault
  assert.equal(ROOF_EXTERIOR.barPitch, 2.7);
  const angles = crownBarAngles();
  assert.ok(angles.length >= 10, `${angles.length} crown bars a vault`);
  for (let i = 1; i < angles.length; i++) close(rs * (angles[i]! - angles[i - 1]!), ROOF_EXTERIOR.barPitch, 1e-9);
  for (const a of angles) assert.ok(Math.abs(a - Math.PI / 2) < phi, `bar at ${a.toFixed(3)} rad is on the glass`);
  // the mesh: dark like the ribs, its vertices on or just outside the skin, a cap over every rib on both vaults
  const bars = byName(group, 'shed-roof-bars');
  const m = bars.material as THREE.MeshLambertMaterial;
  assert.ok(lum(m) <= lum(material('ribPaint')) + 1e-9 && m.emissive.r + m.emissive.g + m.emissive.b < 0.2, 'dark steel, no glow');
  assert.equal(m.transparent, true, 'it thins with the cladding');
  const p = bars.geometry.getAttribute('position');
  const crownZ: number[] = [];
  let gutterW = 0, gutterE = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.min(Math.hypot(x - (layout.spine - SHED_SPAN_WIDTH / 2), y - layout.springing), Math.hypot(x - (layout.spine + SHED_SPAN_WIDTH / 2), y - layout.springing));
    if (y > layout.springing + 2 && Math.abs(x - layout.spine) > 1) assert.ok(r > rs - 0.05 && r < rs + 0.4, `vertex ${i} off the skin (r ${r.toFixed(2)})`);
    if (y > layout.crown - 1) crownZ.push(z);
    if (x < layout.spine - SHED_SPAN_WIDTH - 0.6) gutterW++; // past the rib caps' feet (0.48 m out): only the gutter reaches there
    if (x > layout.spine + SHED_SPAN_WIDTH + 0.6) gutterE++;
  }
  const capped = ribPositions(layout.length).filter(v => crownZ.some(z => Math.abs(Math.abs(z + v) - ROOF_EXTERIOR.ribCap[0]! / 2) < 1e-3));
  assert.equal(capped.length, ribPositions(layout.length).length, `a cap over every rib at the crown (${capped.length})`);
  assert.ok(gutterW > 0 && gutterE > 0, 'an eaves gutter outside each outer springing');
  // x-ray changes its opacity only, as for the cladding
  group.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(900, 600, 500);
  byName(group, 'shed-roof-cladding').onBeforeRender({} as never, {} as never, cam, {} as never, {} as never, {} as never);
  close(m.opacity, (byName(group, 'shed-roof-cladding').material as THREE.Material).opacity, 1e-12);
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
  // Re-pinned 2026-11-24 (scorer of shed-arcade-round-4, B2: the dressings read as the front's dull brown stone; R-c and R-a show them pale): the
  // shed's own pale stone, not the front's stoneFoot. The same equality, to the new material (see the pale-stone test below).
  assert.equal(stone.material, material('stoneDressing'));
  assert.ok(!SHADOW_CASTERS.has('shed-spine-stone'), 'not a sun-shadow caster');
  const half = SPINE_WALL.thick / 2;
  // the rib's foot runs from its outer boom at the springing line to its inner boom RIB_FOOT inside it (ribMembers): the corbel reaches under it.
  // Re-pinned 2026-11-24 (the corbels re-measured from R-kx-shed-interior-c, the rib's foot drawn in onto the cap): the probe was 1.3 m out,
  // where the untapered inner boom landed; it is now where the tapered one lands, at the same tolerance.
  const faces: [number, number][] = [[layout.spine, -1], [layout.spine, 1], [eastArcadeU(layout), -1]];
  for (const [u, side] of faces) {
    for (const v of ribPositions(layout.length)) {
      for (const d of [half + 0.1, RIB_FOOT]) {
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

// Scorer of 2026-11-24 (shed-arcade-round-3): at platform eye the corbels read as heavy two-step boxes with dark undersides, standing well proud of
// the wall; R-kx-shed-interior-c and -a show small, pale, stepped stone brackets. Measured in memory from R-c at three corbels against their own
// rib bays (SPINE_WALL): the cap 0.43-0.47 m wide and 0.30-0.33 m tall, the lowest course 0.25-0.27 m wide, 0.9-1.08 m in all, the cap about
// 0.3-0.5 m proud. Bands: the measured range widened by 15%.
test('the corbels are R-c\'s: three or more stone courses, each narrower and less proud than the one above, sized as measured', () => {
  const { steps, height, wide, out } = SPINE_WALL.corbel;
  const within = (x: number, lo: number, hi: number, what: string): void => assert.ok(x >= lo * 0.85 && x <= hi * 1.15, `${what} ${x} m, measured ${lo}-${hi}`);
  assert.ok(steps.length >= 3, `${steps.length} courses`);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i]![0] < steps[i - 1]![0], `course ${i} is narrower than the one above`);
    assert.ok(steps[i]![2] < steps[i - 1]![2], `course ${i} is less proud than the one above`);
  }
  within(steps[0]![0], 0.43, 0.47, 'the cap\'s width');
  within(steps[0]![1], 0.30, 0.33, 'the cap\'s height');
  within(steps[0]![2], 0.3, 0.5, 'the cap\'s projection');
  within(steps[steps.length - 1]![0], 0.25, 0.27, 'the lowest course\'s width');
  const tall = steps.reduce((a, s) => a + s[1], 0);
  within(tall, 0.9, 1.08, 'the corbel\'s height');
  close(height, tall, 1e-9);
  close(wide, steps[0]![0], 1e-9);
  close(out, steps[0]![2], 1e-9);
  // the built corbels: proud by the cap's projection and no more, at every rib on every face the ribs land on
  const g = shedWorld(), stone = byName(g, 'shed-spine-stone'), sp = layout.springing, half = SPINE_WALL.thick / 2;
  for (const [u, side] of [[layout.spine, -1], [layout.spine, 1], [eastArcadeU(layout), -1]] as const) {
    for (const v of ribPositions(layout.length)) {
      assert.ok(down(g, stone, u + side * (half + out - 0.03), v, sp), `the cap at u ${u.toFixed(1)} side ${side}, v ${v.toFixed(1)}`);
      assert.ok(!down(g, stone, u + side * (half + out + 0.03), v, sp), `a corbel prouder than its cap at u ${u.toFixed(1)} side ${side}, v ${v.toFixed(1)}`);
    }
  }
});

test('the rib lands on its corbel: the foot of its inner boom stands on the cap, over it and touching it', () => {
  const sp = layout.springing, half = SPINE_WALL.thick / 2;
  // the lowest corner of the rib's members by its west foot, in the vault's frame (u from the springing line, inward)
  let low = Infinity, at = 0;
  for (const m of ribMembers(sp)) {
    const c = Math.cos(m.rotZ), s = Math.sin(m.rotZ);
    for (const a of [-0.5, 0.5]) for (const b of [-0.5, 0.5]) {
      const u = m.c[0] + a * m.s[0] * c - b * m.s[1] * s + R, y = m.c[1] + a * m.s[0] * s + b * m.s[1] * c;
      if (u > half && u < R / 2 && y < low) { low = y; at = u; }
    }
  }
  assert.ok(Math.abs(low - ribLanding(sp)) <= 0.01, `the rib's foot is ${(low - ribLanding(sp)).toFixed(3)} m over the corbel`);
  assert.ok(at >= half && at <= half + SPINE_WALL.corbel.out, `the rib's foot lands ${at.toFixed(2)} m from the wall's line, the cap ${half}-${half + SPINE_WALL.corbel.out}`);
  // the inner boom's foot is on the cap, inside its projection
  assert.ok(RIB_FOOT + MEMBER_SIZE.boom[0] / 2 <= half + SPINE_WALL.corbel.out + 1e-9 && RIB_FOOT - MEMBER_SIZE.boom[0] / 2 >= half, `the inner boom at ${RIB_FOOT} m`);
});

// Scorer of 2026-11-24 (shed-arcade-round-3, B3): from platform 1 (the evidence camera platform-eye-p1-north, tools/evidence.mjs, eye 1.6 m over
// the platform at the OSM polygon's midpoint, looking north) the east arcade's paired 1.5 m openings in a 1.0 m wall read blind; R-kx-shed-interior-a
// shows the east side's lower arcade open to the trains beyond. Of the bays the camera sees from 10 to 30 m ahead, in all but one a line of sight
// from the eye through the arcade reaches platform 0's floor beyond it, 0.9 m out from its east face (the envelope of platform 0's train is 1.84 m
// out). The farthest closes: seen that obliquely the 1.0 m reveal hides any opening narrower than about a seventh of its distance.
test('from platform 1\'s eye, platform 0\'s floor shows through the east arcade in all but the farthest of the bays 10-30 m ahead (R-kx-shed-interior-a)', () => {
  assert.ok(EAST_ARCADE.opening / RIB_SPACING >= 0.6 * 0.8 && EAST_ARCADE.opening / RIB_SPACING <= 0.6 * 1.2, 'about 0.6 of the bay, as measured');
  const g = shedWorld(), x = eastArcadeU(layout), half = SPINE_WALL.thick / 2;
  const eye = worldToShed(layout, [67.66190476190475, -206.35238095238097]), ey = 0.9 + 1.6;
  assert.ok(x - half - eye.u > 4 && x - half - eye.u < 8, `the eye ${(x - half - eye.u).toFixed(2)} m west of the arcade`);
  const uT = x + half + 0.9, yT = 0.9;
  const clear = (vAt: number): boolean => {
    // the line from the eye to the floor point beyond the arcade that crosses the wall's line at v = vAt
    const vT = eye.v + (vAt - eye.v) * (uT - eye.u) / (x - eye.u);
    const [x0, z0] = shedToWorld(layout, eye.u, eye.v), [x1, z1] = shedToWorld(layout, uT, vT);
    const from = new THREE.Vector3(x0, ey, z0), dir = new THREE.Vector3(x1, yT, z1).sub(from);
    const far = dir.length();
    return new THREE.Raycaster(from, dir.normalize(), 0, far - 0.05).intersectObject(g, true).length === 0;
  };
  const bays = spineOpenings(layout.length).filter(v => v - eye.v >= 10 && v - eye.v <= 30);
  assert.ok(bays.length >= 3, `${bays.length} bays ahead`);
  const blind = bays.filter(v => { for (let d = -RIB_SPACING / 2; d <= RIB_SPACING / 2; d += 0.1) if (clear(v + d)) return false; return true; });
  assert.ok(bays.length - blind.length >= bays.length - 1, `blind bays (m ahead): ${blind.map(v => (v - eye.v).toFixed(1)).join(', ')} of ${bays.length}`);
  // and the vault's springing is still carried: a pier under every rib, the openings crowned under the band
  for (const { jamb, r } of eastArcadeOpenings(layout.length)) assert.ok(jamb + r < ribLanding(layout.springing) - SPINE_WALL.band, 'crowned under the band');
  assert.ok(RIB_SPACING - EAST_ARCADE.opening >= 2 * SPINE_WALL.corbel.wide, 'a pier under each rib at least twice the corbel\'s width');
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

// Scorer of 2026-11-24 (shed-arcade-round-4, B2): the corbels and the band read as dull brown stone (the front's stoneFoot); R-kx-shed-interior-c and
// -a show them near-white. Sampled in memory (medians, sRGB): shed-c's band (186, 180, 161) and (171, 162, 143), shed-a's band (205, 200, 176) and a
// bracket (215, 207, 183); their mean (194, 187, 166). The dressings take a stone of their own, within 12 levels a channel of that mean and at least
// 25 levels of luminance lighter than stoneFoot (the front's stone, which other buildings keep), with stoneFoot's contact shade and floodlight.
test('the arcades\' bands and corbels are a pale stone of their own, as sampled from R-c and R-a, lighter than the front\'s stone and lit as it is after dark', () => {
  const pale = material('stoneDressing') as THREE.MeshLambertMaterial, front = material('stoneFoot') as THREE.MeshLambertMaterial;
  assert.notEqual(pale, front, 'a material of its own');
  // the colour in sRGB bytes (Node draws no texture, so a material's colour is its average: TEXTURES.stone.average for the front's)
  const srgb = (m: THREE.MeshLambertMaterial): number[] => { const h = m.color.getHex(); return [h >> 16, (h >> 8) & 255, h & 255]; };
  const [a, b] = [srgb(pale), srgb(front)];
  const lum = (c: number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  const sampled = [194, 187, 166];
  sampled.forEach((x, i) => assert.ok(Math.abs(a[i]! - x) <= 12, `channel ${i}: ${a[i]} against the photographs' ${x}`));
  assert.ok(lum(a) - lum(b) >= 25, `luminance ${lum(a).toFixed(1)} against stoneFoot's ${lum(b).toFixed(1)}`);
  assert.deepEqual(pale.defines, front.defines, 'the front stone\'s contact shade and floodlight: it takes the night as the shed\'s stone did');
  assert.equal(front.color.getHex(), 0xa99a7c, 'the front\'s stone is unchanged');
  const g = shedWorld();
  assert.equal(byName(g, 'shed-spine-stone').material, pale, 'the spine\'s, the east arcade\'s and the west arcade\'s dressings');
  assert.equal(byName(g, 'shed-stone').material, front, 'the front\'s and the walls\' copings keep the front\'s stone');
});

// Scorer of 2026-11-24 (shed-arcade-round-4, B3): from platform 8 the west wall read as a low wall with generic windows; R-kx-shed-interior-a shows the
// side walls as round-arched arcades, the vault's ribs on corbels. The west arcade (shed.ts WEST_ARCADE) takes the east arcade's arches (one a bay,
// 3.6 m, 0.59 of the bay: MEASURED in shed-a 0.55-0.6 +-20%, so 0.44-0.72 here), from the wall's line 0.5 m into the shed, its face where the spine's
// stands from its springing line.
test('the west wall\'s inner face is an arcade: a round-headed arch in every rib bay within the measured span, a pier under every rib, a corbel under every rib on its face (R-kx-shed-interior-a)', () => {
  const g = shedWorld(), wall = byName(g, 'shed-west-arcade'), stone = byName(g, 'shed-spine-stone'), sp = layout.springing;
  assert.equal(wall.material, material('brickFoot'));
  assert.ok(!SHADOW_CASTERS.has('shed-west-arcade'), 'not a sun-shadow caster');
  const box = bbox(wall);
  close(box.min.x, 0, 1e-5);
  const depth = box.max.x;
  close(depth, SPINE_WALL.thick / 2, 1e-5); // its face stands from the springing line as the spine's does
  const opens = eastArcadeOpenings(layout.length);
  assert.equal(opens.length, ribPositions(layout.length).length - 1, 'one arch a bay');
  const passage = (v: number): boolean => v > 8 && v < 48; // the Western Concourse's gateline (shed.ts westernCuts): piers hung from its head
  // a ray from the shed westward into the arcade at (v, y), as one sees it from platform 8 (its back face is the wall's): is there brick?
  const solidAt = (v: number, y: number): boolean => {
    const [x0, z0] = shedToWorld(layout, depth + 0.5, v), [x1, z1] = shedToWorld(layout, 0, v);
    return new THREE.Raycaster(new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize(), 0, 0.5 + depth / 2).intersectObject(wall, false).length > 0;
  };
  let bays = 0;
  for (const { vc, r, jamb } of opens) {
    const span = 2 * r;
    assert.ok(span / RIB_SPACING >= 0.44 && span / RIB_SPACING <= 0.72, `span ${span} m, ${(span / RIB_SPACING).toFixed(2)} of the bay`);
    // open below the head across its span, round-headed: open just under the circle, brick just over it, at the crown and at 45 degrees
    for (const d of [0, r * Math.SQRT1_2, -r * Math.SQRT1_2]) {
      const head = jamb + Math.sqrt(r * r - d * d);
      assert.ok(!solidAt(vc + d, head - 0.08), `open under the head at v ${(vc + d).toFixed(2)}`);
      assert.ok(solidAt(vc + d, head + 0.08), `brick over the head at v ${(vc + d).toFixed(2)}, y ${(head + 0.08).toFixed(2)}`);
    }
    // re-pinned 2026-11-24 from y 1.5 (open at the platform): since shed-arcade-round-6 the arches are windows over a brick base (the test below), so open over its sill
    const y = WEST_GLAZING.sill + 0.3;
    assert.ok(!solidAt(vc, y) && !solidAt(vc - r + 0.05, y) && !solidAt(vc + r - 0.05, y), `open over the sill at v ${vc.toFixed(1)}`);
    bays++;
  }
  for (const v of ribPositions(layout.length)) {
    assert.ok(solidAt(v, passage(v) ? 4.0 : 1.5), `a pier under the rib at v ${v.toFixed(1)}`);
    // the rib's foot lands on a corbel on the arcade's face, as on the spine's
    for (const d of [depth + 0.1, RIB_FOOT]) {
      const hit = down(g, stone, d, v, sp);
      assert.ok(hit, `no corbel ${d.toFixed(2)} m out at v ${v.toFixed(1)}`);
      close(hit.point.y, ribLanding(sp), 1e-3);
    }
    assert.ok(!down(g, stone, depth + SPINE_WALL.corbel.out + 0.03, v, sp), `a corbel prouder than its cap at v ${v.toFixed(1)}`);
  }
  assert.ok(bays >= 39, `${bays} bays`);
  // the gateline passages stay open through the wall and the arcade, and the arches elsewhere are glazed (the test below), not sash windows
  // (shed.ts WESTERN_GATES: five 6.6 m passages, centres v0 + 4 + 8i; the piers over them hung from their 3.6 m head), across their whole width
  for (const c of [12.1, 20.1, 28.1, 36.1, 44.1]) for (let v = c - 3.2; v <= c + 3.2; v += 0.4) {
    const [x0, z0] = shedToWorld(layout, -1.2, v), [x1, z1] = shedToWorld(layout, 1.2, v);
    const hits = new THREE.Raycaster(new THREE.Vector3(x0, 1.5, z0), new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize(), 0, 2.4).intersectObject(g, true);
    assert.equal(hits.length, 0, `the passage at v ${v.toFixed(1)} is open`);
  }
  const panes = byName(g, 'shed-west-arcade-panes');
  assert.equal(panes.material, material('arcadeGlass')); // re-pinned 2026-11-24 from the dark 'pane': the scorer of shed-arcade-round-5 read the arches as holes; glazed now
  const windows = bbox(byName(g, 'shed-windows'));
  assert.ok(windows.min.x > layout.width - 1, 'no generic windows left on the west wall');
});

// Scorer of 2026-11-24 (shed-arcade-round-4, platform-eye-p1-north): through the nearest east-arcade arches, the dark underside of the east aisle's
// slate roof showed as a pointed dark wedge in the top of each round arch. A line of sight from the eye through the top of each arch 4-30 m ahead
// (at the arcade's east face, 0.1 m under the crown) meets the aisle's pale ceiling within 15 m beyond the arcade.
test('from platform 1\'s eye, the top of each near east-arcade arch shows the east aisle\'s pale ceiling, not the slate\'s dark underside', () => {
  const g = shedWorld(), x = eastArcadeU(layout), half = SPINE_WALL.thick / 2;
  const eye = worldToShed(layout, [67.66190476190475, -206.35238095238097]), ey = 0.9 + 1.6;
  const [ex, ez] = shedToWorld(layout, eye.u, eye.v);
  const from = new THREE.Vector3(ex, ey, ez);
  const near = eastArcadeOpenings(layout.length).filter(o => o.vc - eye.v >= 4 && o.vc - eye.v <= 30);
  assert.ok(near.length >= 4, `${near.length} arches`);
  for (const { vc, r, jamb } of near) {
    const [px, pz] = shedToWorld(layout, x + half, vc);
    const to = new THREE.Vector3(px, jamb + r - 0.1, pz), dir = to.clone().sub(from), d0 = dir.length();
    const hit = new THREE.Raycaster(from, dir.normalize(), d0 + 1e-3, d0 + 15).intersectObject(g, true)[0];
    assert.ok(hit, `nothing within 15 m beyond the arch at ${(vc - eye.v).toFixed(1)} m ahead`);
    assert.equal(hit.object.name, 'shed-aisle-ceiling', `at ${(vc - eye.v).toFixed(1)} m ahead`);
    assert.equal((hit.object as THREE.Mesh).material, material('valleyLining'), 'the vaults\' pale lining');
  }
});

// Scorer of 2026-11-24 (shed-arcade-round-5, B3): every west arch rendered a uniform near-black fill (mean about (4, 6, 10), the library's dark 'pane'), no panes or
// frames, holes by day and dark at night. R-kx-shed-interior-c shows the lower arches glazed: frames, a transom on the springing, four lights under it (MEASURED in
// memory, rough: shed.ts WEST_GLAZING), grey glass by day, lit rooms at dusk. The glass (materials.ts ARCADE_GLASS) is at least 120 of luminance (sRGB bytes) in its
// own colour and 60 in its daylight sheen (the dark pane: 42 and 0), and after dark each arch is a lit pane of its own (litPane, its number in its UVs).
test('the west arcade\'s arches are glazed: grey glass by day, lit after dark, in a frame with a transom on the springing, mullions under it and a fanlight\'s bars (R-kx-shed-interior-c)', () => {
  const g = shedWorld(), panes = byName(g, 'shed-west-arcade-panes'), bars = byName(g, 'shed-west-arcade-bars');
  const glass = panes.material as THREE.MeshLambertMaterial;
  assert.equal(glass, material('arcadeGlass'));
  // re-pinned 2026-11-24 from the shed's dark 'ribPaint': the scorer of round 7a could not see the bars against the dark glass; pale paint now (the test below)
  assert.equal(bars.material, material('arcadeFrame'), 'the glazing\'s pale paint');
  // re-pinned 2026-11-24 from colour >= 120 and sheen >= 60 (pale glass): the scorer of shed-arcade-round-6 read that glass as self-lit, brighter than the brick;
  // its day tone is now held by the test 'the west arcade's glass is dark by day' below
  const lum = (hex: number): number => 0.2126 * (hex >> 16) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255);
  assert.ok(lum(glass.color.getHex()) >= 42, `the glass's colour ${lum(glass.color.getHex()).toFixed(0)}: grey, not the dark pane's 42`);
  assert.ok(lum(glass.emissive.getHex()) > 0, `its daylight sheen ${lum(glass.emissive.getHex()).toFixed(0)}: some reflection, not none`);
  // after dark: the lit-pane path, most of the arches lit
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  glass.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  assert.ok(shader.fragmentShader.includes(`winPaneLit( vWinUv, wSpan, uWinNight, ${ARCADE_GLASS.share} )`), 'lit as a window after dark');
  assert.ok(ARCADE_GLASS.share >= 0.7, 'most of the arches lit, as shed-c at dusk');
  assert.ok('uWinNight' in shader.uniforms, 'by the night\'s window uniform');
  // every vertex of the glass is a window's (v under -0.5), each arch a number of its own
  const uv = panes.geometry.getAttribute('uv') as THREE.BufferAttribute, pos = positions(panes.geometry);
  const ids = new Set<number>();
  for (let i = 0; i < uv.count; i++) {
    const v = uv.getY(i), u = uv.getX(i), id = Math.floor(u), f = u - id;
    if (!(v <= -1 + 1e-4 && v >= -2 - 1e-4 && f >= PANE_UV.margin - 1e-4 && f <= 1 - PANE_UV.margin + 1e-4)) assert.fail(`vertex ${i}: uv (${u.toFixed(3)}, ${v.toFixed(3)})`);
    ids.add(id);
  }
  assert.ok(ids.size >= 30, `${ids.size} arches with a number`);
  assert.ok(pos.count > 0);
  // the frame and bars, on rays from the shed westward onto the arch: bar or glass first
  const depth = 0.5, first = (v: number, y: number): string => {
    const [x0, z0] = shedToWorld(layout, depth + 0.5, v), [x1, z1] = shedToWorld(layout, -0.1, v);
    const hit = new THREE.Raycaster(new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize(), 0, 1.2).intersectObjects([panes, bars], false)[0];
    return hit ? hit.object.name : 'none';
  };
  const { lights, frame, bar } = WEST_GLAZING;
  assert.ok(lights >= 3 && lights <= 5, 'four lights, as measured, +-1');
  let glazed = 0;
  for (const { vc, r, jamb } of westArcadeOpenings(layout.length)) {
    if ([12.1, 20.1, 28.1, 36.1, 44.1].some(c => vc + r > c - 3.3 && vc - r < c + 3.3)) continue; // the gateline passages (shed.ts WESTERN_GATES)
    const pane = (v: number, y: number): void => assert.equal(first(v, y), 'shed-west-arcade-panes', `glass at v ${v.toFixed(2)}, y ${y.toFixed(2)}`);
    const barAt = (v: number, y: number, what: string): void => assert.equal(first(v, y), 'shed-west-arcade-bars', `${what} at v ${v.toFixed(2)}, y ${y.toFixed(2)}`);
    barAt(vc - r + frame / 2, 1.8, 'the frame'); barAt(vc + r - frame / 2, 1.8, 'the frame');
    barAt(vc - r / 4, jamb, 'the transom'); barAt(vc + r / 4, jamb, 'the transom');
    for (let i = 1; i < lights; i++) barAt(vc - r + (2 * r * i) / lights, 1.8, 'a mullion');
    barAt(vc, jamb + r / 2, 'the fanlight\'s centre bar');
    barAt(vc, jamb + r - frame / 2, 'the frame over the crown');
    for (let i = 0; i < lights; i++) pane(vc - r + (2 * r * (i + 0.5)) / lights, 1.8);
    pane(vc - r / 4, jamb + bar + 0.1); pane(vc + r / 4, jamb + bar + 0.1);
    glazed++;
  }
  assert.ok(glazed >= 30, `${glazed} arches glazed`);
});

// Scorer of 2026-11-24 (shed-arcade-round-6, B3 and A6): by day the west arcade's glass rendered a flat pale (138, 150, 160), brighter than the shaded brick
// (80, 65, 40), and the sun's shadows stopped at it; shed-a and front-d show the openings darker than the brick (materials.ts ARCADE_GLASS: sampled there).
// The glass's colour is 60-90 of luminance (sRGB bytes) and at most 0.65 of the brick's average; its sheen (unshadowed light) 5-20, and in linear light at most
// 0.15 of its colour, so a shadow that takes the sun off it shows; and it takes the sun's shadow (lighting.ts: lit and not transparent).
test('the west arcade\'s glass is dark by day, darker than the brick, and takes the sun\'s shadow', () => {
  const g = shedWorld(), panes = byName(g, 'shed-west-arcade-panes'), glass = panes.material as THREE.MeshLambertMaterial;
  const lum = (hex: number): number => 0.2126 * (hex >> 16) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255);
  const c = lum(glass.color.getHex()), e = lum(glass.emissive.getHex()), brick = lum(TEXTURES.brick.average);
  assert.ok(c >= 60 && c <= 90, `the glass's colour ${c.toFixed(0)}, wanted 60-90`);
  assert.ok(c <= 0.65 * brick, `the glass's colour ${c.toFixed(0)} against the brick's ${brick.toFixed(0)}`);
  assert.ok(e >= 5 && e <= 20, `its sheen ${e.toFixed(0)}, wanted 5-20`);
  const linear = (k: THREE.Color): number => 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b;
  const share = linear(glass.emissive) / linear(glass.color);
  assert.ok(share <= 0.15, `its sheen ${share.toFixed(2)} of its colour in linear light`);
  const scene = new THREE.Scene();
  scene.add(g);
  createSunShadow(scene, new THREE.DirectionalLight()).tag();
  assert.equal(panes.receiveShadow, true, 'the glass takes the sun\'s shadow');
  assert.equal(byName(g, 'shed-west-arcade').receiveShadow, true, 'as the brick round it does');
});

// Scorer of 2026-11-24 (shed-arcade-round-7a, B3): the frames and bars, in the shed's dark rib paint, peaked at L 44 against the glass at 33 by day, and after dark
// the unlit glass rendered (2, 3, 6), a black hole with the bars lost (the sheen is a daylight stand-in the atmosphere dims). shed-c shows the bars pale.
// By day the bars' colour is at least 80 of luminance (sRGB bytes) over the glass's and twice it; after dark (windowNight) the unlit glass's own light is held at a
// floor of 12-22 (only where its UVs are a window's, per channel, so a lit pane is as it was) and the bars' at least 20 over that floor.
test('the west arcade\'s bars read pale against the glass by day and after dark, and the unlit glass after dark keeps a reflection, not black (R-kx-shed-interior-c)', () => {
  const g = shedWorld(), glass = byName(g, 'shed-west-arcade-panes').material as THREE.MeshLambertMaterial, bars = byName(g, 'shed-west-arcade-bars').material as THREE.MeshLambertMaterial;
  const lum = (hex: number): number => 0.2126 * (hex >> 16) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255);
  const gc = lum(glass.color.getHex()), bc = lum(bars.color.getHex());
  assert.ok(bc >= gc + 80 && bc >= 2 * gc, `by day: bars ${bc.toFixed(0)} against glass ${gc.toFixed(0)}`);
  assert.ok(bc <= 215, `bars ${bc.toFixed(0)}: pale, not white`);
  const compile = (m: THREE.Material): { uniforms: Record<string, THREE.IUniform>; fragmentShader: string } => {
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
    return shader;
  };
  const floorOf = (m: THREE.Material, hex: number, only: boolean): void => {
    const { uniforms, fragmentShader } = compile(m), c = new THREE.Color(hex);
    assert.equal(uniforms.uWinNight, windowNight, `${m.name}: by the night's window uniform`);
    const want = `${only ? 'if ( vWinUv.y < -0.5 ) ' : ''}totalEmissiveRadiance = max( totalEmissiveRadiance, vec3( ${c.r}, ${c.g}, ${c.b} ) * uWinNight );`;
    assert.ok(fragmentShader.includes(want), `${m.name}: no night floor`);
    assert.ok(fragmentShader.indexOf(want) > fragmentShader.indexOf('#include <emissivemap_fragment>'), `${m.name}: the floor after the emissive is made`);
  };
  const gf = lum(ARCADE_GLASS.night), bf = lum(ARCADE_FRAME.night);
  assert.ok(gf >= 12 && gf <= 22, `the unlit glass's night floor ${gf.toFixed(0)}, wanted 12-22`);
  assert.ok(bf >= gf + 20, `after dark: bars ${bf.toFixed(0)} against glass ${gf.toFixed(0)}`);
  floorOf(glass, ARCADE_GLASS.night, true);
  floorOf(bars, ARCADE_FRAME.night, false);
  assert.equal(compile(glass).fragmentShader.includes(`winPaneLit( vWinUv, wSpan, uWinNight, ${ARCADE_GLASS.share} )`), true, 'still lit as a window after dark');
  assert.equal(glass.customProgramCacheKey(), 'arcadeGlass', 'a program of its own: the other lit panes keep theirs');
  assert.equal(material('pane').customProgramCacheKey?.() === 'arcadeGlass', false);
});

// Scorer of 2026-11-24 (shed-arcade-round-6, B3): the glass ran from the platform to the head, a tall glazed door in each arch; shed-c shows the lower arches as
// windows over a brick base (shed.ts WEST_GLAZING.sill, MEASURED there about 1.75 m, 0.85 m over the platform: held at 0.55-1.15 m over it). In every arch
// that is not a gateline passage, a ray from the shed meets brick under the sill and glass or its bars over it; no glass is under the sill.
test('the west arcade\'s arches are windows over a brick base, not glazed doors; the gateline passages stay open (R-kx-shed-interior-c)', () => {
  const g = shedWorld(), wall = byName(g, 'shed-west-arcade'), panes = byName(g, 'shed-west-arcade-panes'), bars = byName(g, 'shed-west-arcade-bars');
  const { sill } = WEST_GLAZING;
  assert.ok(sill - 0.9 >= 0.55 && sill - 0.9 <= 1.15, `the sill ${(sill - 0.9).toFixed(2)} m over the platform`);
  const first = (v: number, y: number): string => {
    const [x0, z0] = shedToWorld(layout, 1.0, v), [x1, z1] = shedToWorld(layout, -0.1, v);
    const hit = new THREE.Raycaster(new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize(), 0, 1.1).intersectObjects([wall, panes, bars], false)[0];
    return hit ? hit.object.name : 'none';
  };
  let windows = 0;
  for (const { vc, r } of westArcadeOpenings(layout.length)) {
    if ([12.1, 20.1, 28.1, 36.1, 44.1].some(c => vc + r > c - 3.3 && vc - r < c + 3.3)) continue; // the gateline passages: the arcade test above holds them open
    for (const v of [vc - 0.7 * r, vc - 0.1, vc + 0.7 * r]) {
      for (const y of [1.0, sill - 0.1]) assert.equal(first(v, y), 'shed-west-arcade', `brick under the sill at v ${v.toFixed(2)}, y ${y.toFixed(2)}`);
      assert.notEqual(first(v, sill + 0.15), 'shed-west-arcade', `glazed over the sill at v ${v.toFixed(2)}`);
    }
    windows++;
  }
  assert.ok(windows >= 30, `${windows} windows`);
  assert.ok(bbox(panes).min.y >= sill - 1e-6, `glass down to y ${bbox(panes).min.y.toFixed(2)}, under the sill`);
});

// Scorer of 2026-11-24 (shed-arcade-round-5, platform-eye-p1-north): a pointed wedge, pale by day, in the top of the nearest east-arcade opening. The heads are
// round on the west face (sampled below); the point was parallax: through the full 1.0 m of the wall a head shows only where its two faces' semicircles overlap,
// and they meet in a cusp under the head's crown (in the arch 12 m ahead, on the evidence camera's screen, 15% of the head's height under it). Over the springing
// the east arcade is now a ring EAST_ARCADE.ring deep, so the opening seen through a head is near enough the head's own outline: on that camera's screen (fov 50,
// aspect 1.6), through the nearest arch wholly in its frame (8-15 m ahead: the one 12.1 m ahead), the top of the clear view turns by no more than 30 degrees from
// one screen column to the next in the head's top fifth (an apex of 150 degrees or more; the 1.0 m head's cusp turned 86) and reaches within 4% of the head's screen
// height of its crown (the 1.0 m head's stopped 14% under it). The arch 18 m ahead still turns 47 degrees (a lens 0.4 of the ring deep at that angle): not held here.
test('from platform 1\'s eye the view through the near east-arcade heads is round-topped, not pointed; the heads are round on the west face', () => {
  const g = shedWorld(), wall = byName(g, 'shed-east-arcade'), x = eastArcadeU(layout), half = SPINE_WALL.thick / 2;
  // the heads are round: open just inside the circle, brick just outside it, on the west face, every 15 degrees
  for (const { vc, r, jamb } of eastArcadeOpenings(layout.length).slice(2, 6)) for (let k = 0; k <= 12; k++) {
    const a = (Math.PI * k) / 12;
    const solid = (rr: number): boolean => {
      const v = vc - rr * Math.cos(a), y = jamb + rr * Math.sin(a);
      const [x0, z0] = shedToWorld(layout, x - half - 0.3, v), [x1, z1] = shedToWorld(layout, x - half + 0.1, v);
      return new THREE.Raycaster(new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize(), 0, 0.4).intersectObject(wall, false).length > 0;
    };
    assert.ok(!solid(r - 0.05) && solid(r + 0.05), `the head at v ${vc.toFixed(1)}, ${(15 * k)} degrees`);
  }
  const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 1000);
  cam.position.set(67.66190476190475, 2.5, -206.35238095238097);
  cam.lookAt(68.7832388299945, 2.5, -246.33666048706488);
  cam.updateMatrixWorld(true);
  const eye = worldToShed(layout, [67.66190476190475, -206.35238095238097]);
  const rc = new THREE.Raycaster();
  const clear = (sx: number, sy: number): boolean => { rc.setFromCamera(new THREE.Vector2(sx, sy), cam); return rc.intersectObject(wall, false).length === 0; };
  const near = eastArcadeOpenings(layout.length).filter(o => o.vc - eye.v >= 8 && o.vc - eye.v <= 15);
  assert.ok(near.length >= 1, `${near.length} arches`);
  for (const { vc, r, jamb } of near) {
    // the head's screen box, from the west face's semicircle
    const pts = Array.from({ length: 25 }, (_, k) => { const a = (Math.PI * k) / 24, [px, pz] = shedToWorld(layout, x - half, vc - r * Math.cos(a)); return new THREE.Vector3(px, jamb + r * Math.sin(a), pz).project(cam); });
    const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)), y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
    // the top of the clear view in each screen column
    const cols = 160, step = ((x1 - x0) * 1.6) / cols, tops: [number, number][] = [];
    for (let i = 0; i <= cols; i++) {
      const sx = x0 + ((x1 - x0) * i) / cols;
      let lo = NaN;
      for (let j = 0; j <= 80; j++) { const sy = y1 - ((y1 - y0) * j) / 80; if (clear(sx, sy)) { lo = sy; break; } }
      if (Number.isNaN(lo)) continue;
      let hi = lo + (y1 - y0) / 80; // not clear
      for (let n = 0; n < 20; n++) { const m = (lo + hi) / 2; if (clear(sx, m)) lo = m; else hi = m; }
      if (lo > y0 + 0.02 * (y1 - y0)) tops.push([sx * 1.6, lo]); // screen units, square
    }
    assert.ok(tops.length >= 8, `the arch ${(vc - eye.v).toFixed(1)} m ahead: ${tops.length} clear columns`);
    const ahead = (vc - eye.v).toFixed(1), H = y1 - y0;
    // the west face's semicircle on the screen: its highest point in a column
    const ring = Array.from({ length: 193 }, (_, k) => { const a = (Math.PI * k) / 192, [px, pz] = shedToWorld(layout, x - half, vc - r * Math.cos(a)); const q = new THREE.Vector3(px, jamb + r * Math.sin(a), pz).project(cam); return [q.x * 1.6, q.y] as const; });
    const outline = (sx: number): number => {
      let best = -Infinity;
      for (let k = 0; k + 1 < ring.length; k++) { const [ax, ay] = ring[k]!, [bx, by] = ring[k + 1]!; if ((ax - sx) * (bx - sx) <= 0 && ax !== bx) best = Math.max(best, ay + ((by - ay) * (sx - ax)) / (bx - ax)); }
      return best;
    };
    // no point at the top: in the top fifth of the head, the clear view's top turns from one column to the next by at most 30 degrees (an apex of 150 degrees or
    // more; the head's own outline turns by about a degree a column there, and a cusp turns it all at once)
    const turn = (ys: (sx: number) => number): number => {
      let worst = 0;
      for (let i = 0; i + 2 < tops.length; i++) {
        const [a, b, c] = [tops[i]!, tops[i + 1]!, tops[i + 2]!];
        if (Math.min(a[1], b[1], c[1]) < y0 + 0.8 * H || c[0] - a[0] > 2.5 * step) continue; // the top fifth, three neighbouring columns
        worst = Math.max(worst, (Math.abs(Math.atan((ys(c[0]) - ys(b[0])) / (c[0] - b[0])) - Math.atan((ys(b[0]) - ys(a[0])) / (b[0] - a[0]))) * 180) / Math.PI);
      }
      return worst;
    };
    const at = new Map(tops.map(([sx, y]) => [sx, y]));
    const own = turn(outline), seen = turn(sx => at.get(sx)!);
    assert.ok(seen <= 30, `the arch ${ahead} m ahead: the clear view's top turns ${seen.toFixed(0)} degrees in a column at its sharpest (its outline ${own.toFixed(1)})`);
    // and it reaches the head's crown
    const top = Math.max(...tops.map(t => t[1]));
    assert.ok(y1 - top <= 0.04 * H, `the arch ${ahead} m ahead: the clear view stops ${((100 * (y1 - top)) / H).toFixed(0)}% of the head's height under its crown`);
  }
});
