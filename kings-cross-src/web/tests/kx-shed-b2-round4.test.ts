// B2 round 4 (b2-valley-round-3 score, section 5): (1) from roof-above the gutter must read as two kerb lines either side of a visibly lighter lead sole: the
// kerb tops a warm brick, their faces into the gutter dark, the lead lighter than both; (2) from the platforms the rib shoes read as the ribs' blue-grey: they are
// now their own darker iron, and larger, so each rib visibly lands on its corbel's top face.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { shedLayout } from '../../core/station.ts';
import { TEXTURES } from '../src/materials.ts';
import * as shed from '../src/shed.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const sp = layout.springing, L = layout.length, spine = layout.spine;
const half = shed.SPINE_WALL.thick / 2, top = shed.valleyTop(sp), landing = shed.ribLanding(sp);
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const named = (n: string): THREE.Object3D => { const o = group.getObjectByName(n); assert.ok(o, n); return o; };
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
/** The first hit of a ray from the shed-frame point `from` (u, y, v) along the shed-frame direction `dir`. */
const cast = (from: [number, number, number], dir: [number, number, number], targets: THREE.Object3D[]): THREE.Intersection | undefined => {
  const o = group.localToWorld(new THREE.Vector3(from[0], from[1], -from[2])), d = new THREE.Vector3(dir[0], dir[1], -dir[2]).normalize().transformDirection(group.matrixWorld);
  return new THREE.Raycaster(o, d, 0, 60).intersectObjects(targets, false)[0];
};
/** The colour drawn at a hit: the material's colour (in Node a textured material is its texture's average colour) times the face's vertex colour. */
const drawn = (h: THREE.Intersection): THREE.Color => {
  const m = h.object as THREE.Mesh, mat = m.material as THREE.MeshLambertMaterial, c = mat.color.clone(), col = m.geometry.getAttribute('color');
  if (mat.vertexColors && col && h.face) c.multiply(new THREE.Color(col.getX(h.face.a), col.getY(h.face.a), col.getZ(h.face.a)));
  return c;
};

test('B2 round 4: from above, warm brick kerb tops, dark kerb faces into the gutter and a lead sole lighter than both, by stated margins', () => {
  const brick = named('shed-spine'), bars = named('shed-roof-bars'), [gw] = shed.ROOF_EXTERIOR.valleyGutter, kerb = half - gw / 2, up = shed.ROOF_EXTERIOR.valleyKerbUp;
  const avg = TEXTURES.brick.average, slate = lum(new THREE.Color(TEXTURES.slate.average));
  for (const v of [10, L / 2, L - 10]) {
    const leadHit = cast([spine, sp + 30, v], [0, -1, 0], [bars]);
    assert.ok(leadHit, 'the lead');
    const lead = lum(drawn(leadHit));
    for (const s of [-1, 1] as const) {
      const side = s < 0 ? 'west' : 'east';
      const t = cast([spine + s * (half - kerb / 2), sp + 30, v], [0, -1, 0], [brick]), f = cast([spine, top + up / 2, v], [s, 0, 0], [brick]);
      assert.ok(t && f, `${side} kerb's top and face`);
      const topC = drawn(t), faceC = drawn(f), kt = lum(topC), kf = lum(faceC);
      assert.ok(topC.r > 1.8 * topC.b && topC.r > topC.g, `${side} kerb's top is a warm brick (#${topC.getHexString()})`);
      assert.ok(lead > 2 * kt, `the lead ${lead.toFixed(3)} at least twice the ${side} kerb's top ${kt.toFixed(3)}`);
      assert.ok(kt > 2 * kf, `${side} kerb's top ${kt.toFixed(3)} at least twice its face into the gutter ${kf.toFixed(3)}`);
      assert.ok(kt > 1.5 * slate, `${side} kerb's top ${kt.toFixed(3)} at least 1.5 times the slate ${slate.toFixed(3)}`);
    }
    assert.ok(lead > 4 * slate, `the lead ${lead.toFixed(3)} at least four times the slate ${slate.toFixed(3)}`);
  }
  // the rest of the spine's brick keeps the plain brick: no tint off the kerbs (the gutter's sole under the lead, and the wall's east face)
  const sole = cast([spine, sp + 30, L / 2], [0, -1, 0], [brick]), face = cast([spine + half + 3, landing - 1, L / 2], [-1, 0, 0], [brick]);
  assert.ok(sole && face, 'the gutter\'s sole and the wall\'s face');
  for (const h of [sole, face]) assert.equal(drawn(h).getHex(), new THREE.Color(avg).getHex(), `the brick's own at y ${h.point.y.toFixed(2)}`);
});

test('B2 round 4: each rib\'s shoes are their own iron, at most half as light as the ribs\' day paint and glow, and larger, on the corbel\'s cap', () => {
  const ribs = named('shed-ribs') as THREE.InstancedMesh, shoes = named('shed-rib-shoes') as THREE.InstancedMesh;
  const rib = ribs.material as THREE.MeshLambertMaterial, iron = shoes.material as THREE.MeshLambertMaterial;
  assert.ok(lum(iron.color) <= 0.5 * lum(rib.color), `the shoe ${lum(iron.color).toFixed(4)} against the rib's day paint ${lum(rib.color).toFixed(4)}`);
  assert.ok(lum(iron.emissive) <= 0.5 * lum(rib.emissive), `the shoe's glow ${lum(iron.emissive).toFixed(4)} against the rib's ${lum(rib.emissive).toFixed(4)}`);
  // the same hue: a dark blue-grey, not a new paint
  const hue = (c: THREE.Color): number => c.getHSL({ h: 0, s: 0, l: 0 }).h;
  assert.ok(Math.abs(hue(iron.color) - hue(rib.color)) < 0.01, 'the ribs\' hue');
  assert.equal(shoes.count, ribs.count, 'a shoe pair under every rib');
  const m = new THREE.Matrix4(), n = new THREE.Matrix4();
  for (let i = 0; i < ribs.count; i++) { ribs.getMatrixAt(i, m); shoes.getMatrixAt(i, n); assert.ok(m.equals(n), `rib ${i}'s shoes stand where it does`); }
  const { tall, wide } = shed.RIB_SHOE, cap = shed.SPINE_WALL.corbel.steps[0];
  assert.ok(tall >= 0.4 && wide >= 0.4 && wide <= cap[0], `the shoe ${tall} m tall, ${wide} m wide, on a cap ${cap[0]} m wide`);
  shoes.geometry.computeBoundingBox();
  const b = shoes.geometry.boundingBox!;
  assert.ok(Math.abs(b.min.y - landing) < 1e-6 && Math.abs(b.max.y - (landing + tall)) < 1e-6 && Math.abs(b.max.z - b.min.z - wide) < 1e-6, 'from the cap up, the shoe\'s size');
});
