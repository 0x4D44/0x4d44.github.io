import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, SHED_VALLEY_WIDTH, SHED_VAULT_RADIUS, shedLayout, shedVaultCentres } from '../../core/station.ts';
import { shedRoofY } from '../src/furniture.ts';
import { SHADOW_CASTERS } from '../src/lighting.ts';
import * as shed from '../src/shed.ts';

// B2 (rubric-shed-interior, partner-approved 2026-11-25): the two vaults spring from the opposite faces of the spine wall, SHED_VALLEY_WIDTH apart,
// a valley gutter between them sunk into the wall's top, where until now both skins met on one line over the wall's middle.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const sp = layout.springing, L = layout.length, spine = layout.spine;
const R = SHED_VAULT_RADIUS, half = shed.SPINE_WALL.thick / 2;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const named = (n: string): THREE.Object3D => { const o = group.getObjectByName(n); assert.ok(o, n); return o; };
const down = (u: number, v: number, targets: THREE.Object3D[]): THREE.Intersection[] => {
  const origin = group.localToWorld(new THREE.Vector3(u, sp + 30, -v)), dir = new THREE.Vector3(0, -1, 0).transformDirection(group.matrixWorld);
  return new THREE.Raycaster(origin, dir, 0, 60).intersectObjects(targets, false);
};
const localY = (h: THREE.Intersection): number => group.worldToLocal(h.point.clone()).y;

test('B2: each vault springs from its own face of the spine wall, the valley as wide as the wall, the outer springings where they were', () => {
  assert.equal(SHED_VALLEY_WIDTH, shed.SPINE_WALL.thick, 'the vaults stand on the wall\'s two faces');
  const [w, e] = shedVaultCentres(layout);
  assert.ok(Math.abs(w! + R - (spine - half)) < 1e-9 && Math.abs(e! - R - (spine + half)) < 1e-9, 'the inner springings on the faces');
  assert.ok(Math.abs(w! - R - (spine - SHED_SPAN_WIDTH)) < 1e-9 && Math.abs(e! + R - (spine + SHED_SPAN_WIDTH)) < 1e-9, 'the outer springings on the outer walls\' lines');
  assert.ok(SHED_SPAN_WIDTH / 2 - R > 0.2 && SHED_SPAN_WIDTH / 2 - R < 0.3, `each span ${(2 * R).toFixed(3)} m, ${(SHED_SPAN_WIDTH - 2 * R).toFixed(3)} m less`);
});

test('B2: nothing of either vault\'s skin over the valley: the slate, the lining and the glass stop on the wall\'s faces, at the valley\'s height', () => {
  const skins = ['shed-roof-cladding', 'shed-roof-lining', 'shed-roof-glass'].map(named);
  for (const v of [5, L / 2, L - 5]) for (const du of [-0.45, -0.3, 0, 0.3, 0.45]) {
    const h = down(spine + du, v, skins);
    assert.equal(h.length, 0, `a skin over the valley at u ${du} from the spine, v ${v.toFixed(0)}: ${h[0]?.object.name} at ${h[0] ? localY(h[0]).toFixed(2) : ''}`);
  }
  // each skin's edge on the spine side lies on its face of the wall, at the valley's height
  const top = shed.valleyTop(sp);
  for (const name of ['shed-roof-cladding', 'shed-roof-lining']) {
    const pos = (named(name) as THREE.Mesh).geometry.getAttribute('position');
    let west = -Infinity, east = Infinity;
    for (let k = 0; k < pos.count; k++) {
      const u = pos.getX(k);
      if (u < spine && u > west) west = u;
      if (u > spine && u < east) east = u;
    }
    assert.ok(Math.abs(west - (spine - half)) < 0.03 && Math.abs(east - (spine + half)) < 0.03, `${name}: its edges at ${(west - spine).toFixed(3)} and ${(east - spine).toFixed(3)} from the spine`);
    for (let k = 0; k < pos.count; k++) if (Math.abs(Math.abs(pos.getX(k) - spine) - half) < 0.03) assert.ok(Math.abs(pos.getY(k) - top) < 0.03, `${name}: an edge vertex at ${pos.getY(k).toFixed(2)}, the valley at ${top.toFixed(2)}`);
  }
});

test('B2: a valley gutter sunk into the wall\'s top between the two skins, its sole lead-dark, the wall\'s brick up to the skins on both faces', () => {
  const [gw, gd] = shed.ROOF_EXTERIOR.valleyGutter, top = shed.valleyTop(sp);
  assert.ok(gw >= 0.6 && gw < 2 * half && gd >= 0.2 && gd <= 0.5, `${gw} x ${gd}`);
  const brick = named('shed-spine'), bars = named('shed-roof-bars');
  for (const v of [10, L / 2]) {
    // the sole: brick under the lead, both at the gutter's depth under the skins' landing
    const b = down(spine, v, [brick])[0], lead = down(spine, v, [bars])[0];
    assert.ok(b && Math.abs(localY(b) - (top - gd)) < 0.02, `the brick sole at ${b ? localY(b).toFixed(2) : 'nothing'}, wanted ${(top - gd).toFixed(2)}`);
    assert.ok(lead && localY(lead) > top - gd && localY(lead) < top - gd + 0.05, `the lead at ${lead ? localY(lead).toFixed(2) : 'nothing'}`);
    // the kerbs either side, their tops at the skins' landing
    for (const s of [-1, 1]) {
      const k = down(spine + s * (half - (half - gw / 2) / 2), v, [brick])[0];
      assert.ok(k && Math.abs(localY(k) - top) < 0.02, `the kerb at ${k ? localY(k).toFixed(2) : 'nothing'}, wanted ${top.toFixed(2)}`);
    }
  }
  assert.ok(!SHADOW_CASTERS.has('shed-spine') && !SHADOW_CASTERS.has('shed-roof-bars'), 'the gutter casts no sun shadow');
});

test('B2: the ribs\' inner booms land on the spine\'s corbel caps, the vaults\' crowns on their own axes', () => {
  const { corbel } = shed.SPINE_WALL;
  // the spine foot of a west rib (the east vault's are the same truss turned about the vertical): the inner boom's foot node on the cap
  const members = shed.ribMembers(sp, R, 16, [shed.RIB_FOOT, shed.RIB_FOOT_SPINE]);
  const ends = members.filter(m => m.kind === 'boom').flatMap(m => [-1, 1].map(s => [m.c[0] + s * Math.cos(m.rotZ) * m.s[0] / 2, m.c[1] + s * Math.sin(m.rotZ) * m.s[0] / 2] as const));
  const inner = ends.filter(([u, y]) => u > 0 && u < R - 0.1 && y < sp + 0.1).map(([u]) => u);
  assert.ok(inner.length > 0 && inner.every(u => R - u > shed.MEMBER_SIZE.boom[0] / 2 && R - u < corbel.out), `the inner boom's foot ${inner.map(u => (R - u).toFixed(2))} m off the face, the cap ${corbel.out} m out`);
  const ribs = named('shed-ribs') as THREE.InstancedMesh, pos = ribs.geometry.getAttribute('position'), m = new THREE.Matrix4(), p = new THREE.Vector3();
  const feet = [0, 0];
  for (let i = 0; i < ribs.count; i++) {
    ribs.getMatrixAt(i, m);
    for (let k = 0; k < pos.count; k++) {
      p.fromBufferAttribute(pos, k).applyMatrix4(m);
      const off = Math.abs(p.x - spine);
      // nothing of a rib low by the spine stands off the wall's face further than its corbel's cap carries it
      if (p.y < sp - 0.06 && off < 3) { assert.ok(off > half && off < half + corbel.out + 1e-6, `a rib foot vertex ${(off - half).toFixed(2)} m off the spine's face`); feet[p.x < spine ? 0 : 1]!++; }
    }
  }
  assert.ok(feet[0]! > 0 && feet[1]! > 0, `the spine feet found: ${feet}`);
  // the crowns
  for (const uc of shedVaultCentres(layout)) assert.ok(Math.abs(shedRoofY(layout, uc) - (sp + R)) < 1e-6, `the roof's crown over u ${uc.toFixed(2)}`);
  assert.equal(shedRoofY(layout, spine), sp, 'over the wall, the springing');
});

test('B2 round 2: no platform eye sees sky through the gap between a vault\'s spine-side lining and the wall\'s face (the round-1 seam)', async () => {
  const { PLATFORM_HEIGHT } = await import('../../core/scene.ts');
  const top = shed.valleyTop(sp), seeThrough = new Set(['shed-roof-glass', 'shed-roof-bars']);
  const opaque: THREE.Object3D[] = [];
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh && !seeThrough.has(o.name)) opaque.push(o); });
  const misses: string[] = [];
  // the lining (R + ROOF_SKIN - 0.02) stops 2 cm off the wall's face, under the slate's edge (R + ROOF_SKIN) on the face: the cavity between them opens
  // downward there, and a sight-line through it passes over the kerb and the gutter onto the far vault's outside (its glass, or the slate's outer face).
  // Aim at a point in that cavity just above the kerb's top, from eyes 1.6 m above the platforms beside the wall.
  for (const v of [6.1 * 5, 6.1 * 20, 6.1 * 35]) for (const s of [-1, 1] as const) for (const du of [3, 8, 14]) for (const into of [0.005, 0.01]) {
    const eye = group.localToWorld(new THREE.Vector3(spine + s * (half + du), PLATFORM_HEIGHT + 1.6, -v));
    const aim = group.localToWorld(new THREE.Vector3(spine + s * (half + into), top + 0.002, -v));
    const d = aim.distanceTo(eye), hit = new THREE.Raycaster(eye, aim.clone().sub(eye).normalize(), 0, d - 1e-3).intersectObjects(opaque, false)[0];
    if (!hit) misses.push(`v ${v.toFixed(1)} ${s < 0 ? 'west' : 'east'} eye ${du} m off the face, aim ${into} m off it`);
  }
  assert.deepEqual(misses, [], `sky through the spine-side gutter gap: ${misses.length} sight-lines`);
});
