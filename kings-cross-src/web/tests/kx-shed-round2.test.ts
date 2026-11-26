import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { buildingNightMaterialsOf, material } from '../src/materials.ts';
import { SHADOW_CASTERS } from '../src/lighting.ts';
import * as shed from '../src/shed.ts';

// Round S2 (shed-round-1 score): B1 the haunch rings in the ribs' foot panels clear of every web member, the ribs lighter by day; B3 the imposts paler,
// deeper and bracketed, still short of every opening.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2, sp = layout.springing, L = layout.length;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const S = shed as unknown as Record<string, unknown>;
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const segDist = (p: [number, number], a: [number, number], b: [number, number]): number => {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const ends = (m: { c: readonly number[]; s: readonly number[]; rotZ: number }): [[number, number], [number, number]] => {
  const h = m.s[0]! / 2, c = Math.cos(m.rotZ), s = Math.sin(m.rotZ);
  return [[m.c[0]! - h * c, m.c[1]! - h * s], [m.c[0]! + h * c, m.c[1]! + h * s]];
};

test('B1: each haunch ring sits low in its rib\'s foot panel, between the booms, and no web member crosses its disc', () => {
  const H = S.HAUNCH_RING as { radius: number; tube: number }, rho = H.radius + H.tube;
  const members = shed.ribMembers(sp), webs = members.filter(m => m.kind === 'web'), booms = members.filter(m => m.kind === 'boom');
  for (const c of shed.haunchRingCentres(sp)) {
    assert.ok(c[1] - sp > rho + 0.1 && c[1] - sp < 2.5, `${(c[1] - sp).toFixed(2)} m over the springing`);
    for (const w of webs) { const [a, b] = ends(w); const d = segDist(c, a, b) - shed.MEMBER_SIZE.web[0] / 2; assert.ok(d > rho, `a web member ${d.toFixed(2)} m from the ring's centre at ${c[0].toFixed(2)}, inside its disc (${rho})`); }
    for (const w of booms) { const [a, b] = ends(w); const d = segDist(c, a, b) - shed.MEMBER_SIZE.boom[0] / 2; assert.ok(d > rho - 0.02, `a boom ${d.toFixed(2)} m from the ring's centre, into it`); }
    const rr = Math.hypot(c[0], c[1] - sp);
    assert.ok(rr > R - 1.3 && rr < R + 0.1, `between the booms (${rr.toFixed(2)} from the vault's centre)`);
  }
  assert.ok(2 * rho >= 0.8, `${(2 * rho).toFixed(2)} m across`);
});

test('B1: the ribs and rings 2-2.5 times ribPaint by day, ribPaint at night, still three times darker than the lining', () => {
  const lift = S.RIB_DAY_LIFT as number, paint = material('ribPaint') as THREE.MeshLambertMaterial;
  assert.ok(lift >= 2 && lift <= 2.5, `lift ${lift}`);
  for (const name of ['shed-ribs', 'shed-haunch-rings']) {
    const o = group.getObjectByName(name) as THREE.Mesh, day = o.material as THREE.MeshLambertMaterial;
    assert.ok(Math.abs(lum(day.color) / lum(paint.color) - lift) < 0.01, `${name}: ${(lum(day.color) / lum(paint.color)).toFixed(2)}`);
    // relaxed round S5 from eight times (partner decision 2026-11-25: photos R-a and R-b show mid blue-grey ribs; the pin was written to stop wash-out,
    // not to set colour): three times darker than the lining still forbids a washed-out rib; kx-shed-rib-tone pins the tone they draw
    assert.ok(3 * lum(day.color) < lum((material('lining') as THREE.MeshLambertMaterial).color), `${name} against the lining`);
    assert.equal(buildingNightMaterialsOf(o)?.night, paint);
  }
});

test('B3: each impost 0.25-0.35 m proud in a paler cream than the dressings, a stepped bracket under it, all of it on its pier, not a caster', () => {
  const I = S.ARCADE_IMPOST as { tall: number; out: number; margin: number; along: number; steps: readonly (readonly [number, number])[] };
  assert.ok(I.out >= 0.25 && I.out <= 0.35 && I.steps.length >= 2, JSON.stringify(I));
  for (let k = 1; k < I.steps.length; k++) assert.ok(I.steps[k]![1] < I.steps[k - 1]![1] && I.steps[0]![1] < I.out, 'each step back under the one over it');
  const mesh = group.getObjectByName('shed-arcade-imposts') as THREE.Mesh;
  assert.ok(mesh && !SHADOW_CASTERS.has('shed-arcade-imposts'), 'their own mesh, not a caster');
  const imp = mesh.material as THREE.MeshLambertMaterial, dress = material('stoneDressing') as THREE.MeshLambertMaterial;
  assert.ok(lum(imp.color) > 1.1 * lum(dress.color), `paler than the dressings: ${lum(imp.color).toFixed(3)} against ${lum(dress.color).toFixed(3)}`);
  const opens = shed.eastArcadeOpenings(L), eastFace = shed.eastArcadeU(layout) - shed.SPINE_WALL.thick / 2, westFace = shed.WEST_ARCADE.depth;
  const ray = (o: [number, number, number], d: [number, number, number]): THREE.Intersection | undefined => {
    const origin = group.localToWorld(new THREE.Vector3(...o)), dir = new THREE.Vector3(...d).transformDirection(group.matrixWorld);
    return new THREE.Raycaster(origin, dir, 0, 3).intersectObject(mesh, false)[0];
  };
  let n = 0;
  for (const [face, dir] of [[eastFace, -1], [westFace, 1]] as const) {
    for (let i = 0; i + 1 < opens.length; i++) {
      const a = opens[i]!, b = opens[i + 1]!, y = Math.min(a.jamb, b.jamb), mid = (a.vc + a.r + b.vc - b.r) / 2;
      if (b.vc - b.r - (a.vc + a.r) < 2 * I.margin + 0.2) continue;
      let top = y - I.tall;
      for (const [yy, want] of [[y - I.tall / 2, I.out], ...I.steps.map(([h, o]) => { const r = [top - h / 2, o] as const; top -= h; return r; })] as const) {
        const h = ray([face + dir * 3, yy, -mid], [-dir, 0, 0]);
        const proud = h ? (group.worldToLocal(h.point.clone()).x - face) * dir : NaN;
        assert.ok(Math.abs(proud - want) < 0.01, `at v ${mid.toFixed(1)}, ${(yy - y).toFixed(2)} under the springing, ${dir < 0 ? 'east' : 'west'}: ${proud.toFixed(2)} proud, wanted ${want}`);
      }
      n++;
    }
  }
  assert.ok(n >= 4);
  // nothing of them over an opening's span (with its margin), at any height: every vertex on a pier
  const pos = mesh.geometry.getAttribute('position');
  for (let k = 0; k < pos.count; k++) {
    const v = -pos.getZ(k);
    for (const { vc, r } of opens) assert.ok(Math.abs(v - vc) >= r + I.margin - 1e-6, `an impost vertex at v ${v.toFixed(2)} over the opening ${vc.toFixed(1)} +- ${r.toFixed(1)}`);
  }
});

test('B1 (round S2b): no haunch ring cuts into any wall or masonry, on either side of either vault; the rings on the arcades\' feet, none on the spine\'s', () => {
  const H = S.HAUNCH_RING as { radius: number; tube: number }, out = H.radius + 2 * H.tube; // the ring's outer edge, and a tube's radius more clear
  const masonry = ['shed-brick', 'shed-spine', 'shed-east-arcade', 'shed-west-arcade', 'shed-spine-stone', 'shed-stone', 'shed-arcade-imposts']
    .map(n => group.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
  assert.ok(masonry.length >= 6, `${masonry.length} masonry meshes`);
  const rings = group.getObjectByName('shed-haunch-rings') as THREE.InstancedMesh, ribs = group.getObjectByName('shed-ribs') as THREE.InstancedMesh;
  const m = new THREE.Matrix4(), c = new THREE.Vector3();
  const zs = new Set<number>(), sides = new Set<string>();
  for (let i = 0; i < ribs.count; i++) { ribs.getMatrixAt(i, m); zs.add(c.setFromMatrixPosition(m).z); }
  const sorted = [...zs].sort((a, b) => a - b), pick = new Set([sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]].map(z => Math.round(z! * 100)));
  let checked = 0;
  for (let i = 0; i < rings.count; i++) {
    rings.getMatrixAt(i, m); c.setFromMatrixPosition(m);
    sides.add(c.x < layout.spine ? (c.x < layout.spine - R ? 'west vault, west foot' : 'west vault, spine foot') : (c.x > layout.spine + R ? 'east vault, east foot' : 'east vault, spine foot'));
    if (!pick.has(Math.round(c.z * 100))) continue;
    checked++;
    for (let k = 0; k < 24; k++) {
      const a = (2 * Math.PI * k) / 24, d = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
      const o = group.localToWorld(c.clone()), e = group.localToWorld(c.clone().addScaledVector(d, out));
      const dw = e.clone().sub(o).normalize();
      for (const [from, dir] of [[o, dw], [e, dw.clone().negate()]] as const) {
        const h = new THREE.Raycaster(from, dir, 0, out).intersectObjects(masonry, false)[0];
        assert.ok(!h, `the ring at (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(1)}) meets ${h?.object.name} ${h?.distance.toFixed(2)} m along ${(a * 180 / Math.PI).toFixed(0)} deg`);
      }
    }
  }
  assert.ok(checked >= 6, `${checked} rings checked`);
  assert.deepEqual([...sides].sort(), ['east vault, east foot', 'west vault, west foot'], 'on the arcades\' feet only');
});
