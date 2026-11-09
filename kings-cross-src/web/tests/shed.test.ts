import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { CLOCK_TOWER_HEIGHT, SHED_LENGTH, SHED_SPAN_WIDTH, shedLayout, stationBuilding, worldToShed } from '../../core/station.ts';
import { shedRoofY } from '../src/furniture.ts';
import { material } from '../src/materials.ts';
import { buildShed, buildTower, buildWesternRange, gableBars, GABLE_GLASS_FROM, glazedHalfAngle, GLAZED_STRIP_WIDTH, GLASS_OPACITY, glazingOpacity, lunetteBars, MEMBER_SIZE, RIB_SPACING, ribMembers, ribPositions, ROOF_SKIN, roofOpacity, TOWER_SIZE, valleyCut, VALLEY_HALF, vaultBand, vaultPoint, WESTERN_RANGE, XRAY_OPACITY } from '../src/shed.ts';

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

test('the glazed strip is the 9 m wide band along the crown', () => {
  close(2 * R * Math.sin(glazedHalfAngle()), GLAZED_STRIP_WIDTH, 1e-9);
  assert.equal(GLAZED_STRIP_WIDTH, 9);
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
  const l = { width: 72, length: 244, crown: 21.6 };
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

test('the ironwork is painted light and the roof is lined with pale boarding, both far lighter than the first build\'s near-black steel and dark lining', () => {
  const group = buildShed(layout);
  const luminance = (m: THREE.Material): number => {
    const c = (m as THREE.MeshLambertMaterial).color;
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };
  const oldSteel = luminance(material('steel'));
  for (const name of ['shed-ribs', 'shed-front-bars', 'shed-gable-bars', 'shed-valley-frame']) {
    const m = byName(group, name).material as THREE.Material;
    assert.equal(m, material('ribPaint'), `${name} is painted like the ribs`);
    assert.ok(luminance(m) > 0.5 && luminance(m) > 6 * oldSteel, `${name}: luminance ${luminance(m).toFixed(2)}`);
  }
  for (const [name, key] of [['shed-roof-lining', 'lining'], ['shed-valley-girder', 'valleyLining']] as const) {
    const m = byName(group, name).material as THREE.MeshLambertMaterial;
    assert.equal(m, material(key), name);
    assert.ok(luminance(m) > 0.6, `${name}: luminance ${luminance(m).toFixed(2)}`);
    assert.ok(m.emissive.r + m.emissive.g + m.emissive.b > 0.5, `${name} glows a little (the light comes from above, so an underside would be black)`);
  }
  assert.equal((byName(group, 'shed-roof-lining').material as THREE.Material).side, THREE.BackSide, 'the lining is seen from inside');
});

test('buildShed: the valley is a thin board-lined fascia, not a slab: its faces look along the shed or down, and a frame stands at every rib', () => {
  const group = buildShed(layout);
  const valley = layout.aisle + 2 * R;
  const fascia = byName(group, 'shed-valley-girder');
  const b = bbox(fascia);
  close(b.min.x, valley - VALLEY_HALF, EPS);
  close(b.max.x, valley + VALLEY_HALF, EPS);
  assert.ok(2 * VALLEY_HALF <= 0.5, 'no thicker than the slab it replaces');
  assert.equal((fascia.geometry.index as THREE.BufferAttribute).count / 3, 6, 'two vertical faces and a soffit, two triangles each');
  const nor = fascia.geometry.getAttribute('normal');
  let sides = 0;
  let soffits = 0;
  for (let i = 0; i < nor.count; i++) {
    assert.ok(nor.getY(i) < 0.5, 'nothing faces up: the top is the roof skins');
    if (Math.abs(nor.getX(i)) > 0.99) sides++;
    else if (nor.getY(i) < -0.99) soffits++;
  }
  assert.equal(sides, 8, 'a quad on each side');
  assert.equal(soffits, 4, 'and a soffit under it');
  // the boards run along the shed: on the vertical faces UV u is the height and v the distance north, so
  // the texture's long axis (the boards) follows the length, not the 3 m of height
  const uv = fascia.geometry.getAttribute('uv');
  let umax = 0;
  let vmax = 0;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(nor.getX(i)) < 0.99) continue;
    umax = Math.max(umax, uv.getX(i));
    vmax = Math.max(vmax, uv.getY(i));
  }
  close(vmax, layout.length, 1e-3);
  close(umax, layout.springing + (R + ROOF_SKIN) * Math.sin(valleyCut(R + ROOF_SKIN)), 1e-3);
  // a pilaster at every rib on both sides, and a rail along each foot (4 faces of 2 triangles each)
  const frame = byName(group, 'shed-valley-frame');
  assert.equal((frame.geometry.index as THREE.BufferAttribute).count / 3, 2 * (ribPositions(layout.length).length * 8 + 8));
  const fb = bbox(frame);
  assert.ok(fb.min.x < valley - VALLEY_HALF && fb.max.x > valley + VALLEY_HALF, 'the frame stands proud of the fascia on both sides');
  assert.ok(fb.min.y >= layout.springing - EPS && fb.max.y <= layout.springing + (R + ROOF_SKIN) * Math.sin(valleyCut(R + ROOF_SKIN)) + EPS, 'and within its height');
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
  // the front stands 2.4 m above the crowns, the full width of the shed
  const front = bbox(byName(group, 'shed-front'));
  close(front.max.y, layout.crown + 2.4, EPS);
  close(front.max.x - front.min.x, W, EPS);
  // 40 ribs on each of the two vaults
  assert.equal((byName(group, 'shed-ribs') as unknown as THREE.InstancedMesh).count, 2 * ribPositions(L).length);
  // the tower stands on the spine, just in front of the front plane
  const tower = group.getObjectByName('clock-tower') as THREE.Object3D;
  close(tower.position.x, W / 2, EPS);
  close(tower.position.z, TOWER_SIZE / 2 + 0.15, EPS);
});

test('buildShed: every mesh has finite positions and the roof skin never crosses the valley line', () => {
  const group = buildShed(layout);
  const sp = layout.springing;
  const valley = layout.aisle + 2 * R;
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
  const west = layout.aisle + R;
  const east = layout.aisle + 3 * R;
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
  // the valley girder closes the gap from the springing to where the skins start
  const girder = bbox(byName(group, 'shed-valley-girder'));
  close(girder.min.y, sp, EPS);
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
  // Upper sash floors stay complete; only the documented southern gateline and adjoining
  // public frontage replace ground-floor sash. Arup Journal 2/2012 p27 fig4/p29 locates
  // five southern bays; built JMP photograph shows the neighbouring public/shop interfaces.
  // Their station-frame alignment/widths remain ASSUMED, independently pinned here.
  const bays = Math.floor((v1 - v0) / WESTERN_RANGE.bay);
  assert.equal(bays, 39);
  assert.equal(positions(byName(range, 'range-windows').geometry).count / 4, 3 * bays);
  const margin = (v1 - v0 - bays * WESTERN_RANGE.bay) / 2;
  const allLowerCentres = Array.from({ length: bays }, (_, i) => v0 + margin + (i + 0.5) * WESTERN_RANGE.bay);
  const publicIntervals = [
    ...[12.1, 20.1, 28.1, 36.1, 44.1].map(v => [v - 3.3, v + 3.3]),
    ...[52.1, 56.1].map(v => [v - 1.4, v + 1.4]),
  ];
  // Each original sash spans 1.4m along the wall; remove it only where that span overlaps an interface.
  const retained = allLowerCentres.filter(v => !publicIntervals.some(([a, b]) => v + 0.7 > a! && v - 0.7 < b!));
  const arched = positions(byName(range, 'range-windows-arched').geometry);
  assert.equal(arched.count / 4, retained.length, 'only ground-floor sash overlapping public intervals is replaced');
  const actual = Array.from({ length: arched.count / 4 }, (_, i) =>
    -[0, 1, 2, 3].reduce((sum, k) => sum + arched.getZ(i * 4 + k), 0) / 4);
  for (let i = 0; i < retained.length; i++) close(actual[i]!, retained[i]!, EPS);
  const northernLimit = Math.max(...publicIntervals.map(([, end]) => end!)) + 0.7;
  assert.deepEqual(actual.filter(v => v >= northernLimit).map(v => v.toFixed(3)),
    allLowerCentres.filter(v => v >= northernLimit).map(v => v.toFixed(3)), 'every northern lower sash remains');
});

test('the Range can be left out', () => {
  assert.equal(buildShed(layout, { range: false }).getObjectByName('western-range'), undefined);
  assert.ok(buildShed(layout).getObjectByName('western-range'));
});

test('the roof the platform furniture hangs from (shedRoofY) is this shed\'s arch: its crown over each arch centre, the springing over the aisles and at the valley', () => {
  const sp = layout.springing;
  for (const k of [1, 3]) {
    const uc = layout.aisle + k * R;
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
  close(shedRoofY(layout, layout.aisle / 2), sp, 1e-9); // over the west aisle
});
