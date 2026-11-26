// B2 round 3 (b2-valley-round-2 score, section 5): (1) from above the valley gutter read as one flat dark strip with a single kerb line: both brick kerbs
// now stand over the skins, and the lead on the sole is its own pale grey; (2) from inside the spine-side rib feet were hard to read: a dark iron shoe on
// every corbel cap under every rib, on each face of the spine wall, and a camera (spine-feet-p4) up along the wall's east face from platform 4.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { pointInPolygon, shedLayout, shedToWorld, stationPlatforms, worldToShed } from '../../core/station.ts';
import { material, TEXTURES } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
// @ts-expect-error the evidence tool is plain JavaScript
import { ELEMENT_VIEWS, stationCameras } from '../../tools/evidence.mjs';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const sp = layout.springing, L = layout.length, spine = layout.spine;
const half = shed.SPINE_WALL.thick / 2, top = shed.valleyTop(sp), landing = shed.ribLanding(sp);
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const named = (n: string): THREE.Object3D => { const o = group.getObjectByName(n); assert.ok(o, n); return o; };
/** Every hit, nearest first, of a ray from the shed-frame point `from` (u, y, v) along the shed-frame direction `dir`. */
const cast = (from: [number, number, number], dir: [number, number, number], targets: THREE.Object3D[], far = 60): THREE.Intersection[] => {
  const o = group.localToWorld(new THREE.Vector3(from[0], from[1], -from[2])), d = new THREE.Vector3(dir[0], dir[1], -dir[2]).normalize().transformDirection(group.matrixWorld);
  return new THREE.Raycaster(o, d, 0, far).intersectObjects(targets, false);
};
const localY = (h: THREE.Intersection): number => group.worldToLocal(h.point.clone()).y;
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

test('B2 round 3: both kerbs of the valley gutter stand over the skins\' landing, each with a top and a face either side, about 2 px wide in roof-above', () => {
  const [gw] = shed.ROOF_EXTERIOR.valleyGutter, up = shed.ROOF_EXTERIOR.valleyKerbUp, kerb = half - gw / 2;
  assert.ok(up >= 0.1 && up <= 0.3, `the kerbs stand ${up} m over the skins`);
  assert.ok(kerb >= 0.15 && gw >= 0.6, `each kerb ${kerb.toFixed(2)} m wide, the gutter ${gw} m`);
  const brick = named('shed-spine');
  for (const v of [10, L / 2, L - 10]) for (const s of [-1, 1] as const) {
    const side = s < 0 ? 'west' : 'east';
    // its top: a ray down on the kerb's middle
    const k = cast([spine + s * (half - kerb / 2), sp + 30, v], [0, -1, 0], [brick])[0];
    assert.ok(k && Math.abs(localY(k) - (top + up)) < 0.01, `${side} kerb's top at ${k ? (localY(k) - top).toFixed(3) : 'nothing'} over the skins, wanted ${up}`);
    // its face over the slate: from 3 m out over the vault, level, half way up the upstand, toward the spine; it stands on the wall's face
    const out = cast([spine + s * (half + 3), top + up / 2, v], [-s, 0, 0], [brick])[0];
    assert.ok(out && Math.abs(group.worldToLocal(out.point.clone()).x - (spine + s * half)) < 0.01, `${side} kerb's outer face at ${out ? (group.worldToLocal(out.point.clone()).x - spine).toFixed(3) : 'nothing'}`);
    // its face into the gutter: from the gutter's middle, over the skins, toward the kerb
    const inner = cast([spine, top + up / 2, v], [s, 0, 0], [brick])[0];
    assert.ok(inner && Math.abs(group.worldToLocal(inner.point.clone()).x - (spine + s * gw / 2)) < 0.01, `${side} kerb's inner face at ${inner ? (group.worldToLocal(inner.point.clone()).x - spine).toFixed(3) : 'nothing'}`);
  }
});

test('B2 round 3: the gutter\'s lead is its own pale lead grey, well lighter than the slate and the ribs\' paint, not the outside structure\'s dark', () => {
  const bars = named('shed-roof-bars') as THREE.Mesh, base = (bars.material as THREE.MeshLambertMaterial).color;
  const colours = bars.geometry.getAttribute('color');
  assert.ok(colours, 'the outside structure carries vertex colours');
  for (const v of [10, L / 2, L - 10]) {
    const h = cast([spine, sp + 30, v], [0, -1, 0], [bars])[0];
    assert.ok(h && h.face && Math.abs(localY(h) - (top - shed.ROOF_EXTERIOR.valleyGutter[1])) < 0.05, `the lead at ${h ? localY(h).toFixed(2) : 'nothing'}`);
    const lead = new THREE.Color(colours.getX(h.face.a), colours.getY(h.face.a), colours.getZ(h.face.a)).multiply(base);
    const want = new THREE.Color(shed.ROOF_EXTERIOR.leadColour);
    assert.ok(Math.abs(lead.r - want.r) < 0.01 && Math.abs(lead.g - want.g) < 0.01 && Math.abs(lead.b - want.b) < 0.01, `the lead drawn #${lead.getHexString()}, wanted #${want.getHexString()}`);
    assert.ok(lum(lead) > 1.6 * lum(new THREE.Color(TEXTURES.slate.average)), `the lead ${lum(lead).toFixed(3)} against the slate's ${lum(new THREE.Color(TEXTURES.slate.average)).toFixed(3)}`);
    assert.ok(lum(lead) > 2.5 * lum(base), `the lead ${lum(lead).toFixed(3)} against the ribs' paint ${lum(base).toFixed(3)}`);
  }
});

test('B2 round 3: under every rib, on each face of the spine wall, a stone corbel and on its cap a dark iron shoe the rib lands in', () => {
  const { tall, clear } = shed.RIB_SHOE, { corbel } = shed.SPINE_WALL;
  // re-pinned 2026-11-26 (B2 round 4): the shoes are their own mesh (shed-rib-shoes, darker iron), so the shoe rays look at the ribs and the shoes together
  const ribs = [named('shed-ribs'), named('shed-rib-shoes')], stone = named('shed-spine-stone');
  const ribPos = shed.ribPositions(L);
  for (const v of ribPos) for (const s of [-1, 1] as const) {
    const where = `${s < 0 ? 'west' : 'east'} face, rib at v ${v.toFixed(2)}`;
    for (const off of [clear + 0.03, 0.25, corbel.out - 0.03]) {
      // the cap: stone at the landing, off the face as far as the cap reaches
      const c = cast([spine + s * (half + off), landing + 0.01, v], [0, -1, 0], [stone])[0];
      assert.ok(c && Math.abs(localY(c) - landing) < 0.005, `${where}: the corbel's cap at ${off.toFixed(2)} m off the face, ${c ? localY(c).toFixed(3) : 'nothing'}`);
      // the shoe: a level iron top `tall` over the cap, at the same place
      const shoe = cast([spine + s * (half + off), landing + tall + 0.05, v], [0, -1, 0], ribs)[0];
      assert.ok(shoe && shoe.face && shoe.face.normal.y > 0.99 && Math.abs(localY(shoe) - (landing + tall)) < 0.005, `${where}: the shoe's top at ${off.toFixed(2)} m off the face, ${shoe ? localY(shoe).toFixed(3) : 'nothing'}`);
    }
    // the shoe stops at the cap's edge: nothing of it beyond
    const beyond = cast([spine + s * (half + corbel.out + 0.02), landing + tall - 0.02, v], [0, -1, 0], ribs).filter(h => localY(h) > landing - 0.01);
    assert.deepEqual(beyond.filter(h => h.face && h.face.normal.y > 0.99).map(localY), [], `${where}: a shoe's top beyond the cap`);
  }
  // the shoe in the ribs' dark paint against the corbel's pale stone
  const iron = (material('ribPaint') as THREE.MeshLambertMaterial).color, cap = (material('stoneDressing') as THREE.MeshLambertMaterial).color;
  assert.ok(lum(cap) > 3 * lum(iron), `the stone ${lum(cap).toFixed(3)} against the iron ${lum(iron).toFixed(3)}`);
});

type Cam = { pos: number[]; target: number[]; fov?: number; near?: number; source: string };
const ASPECT = 1.6; // the capture's aspect (evidence.mjs, the western-range lens note)
test('B2 round 3 spine-feet-p4: from platform 4 beside the spine wall, up along its east face, the ribs\' feet on their corbels in the frame and in plain sight', () => {
  const cam = (stationCameras() as Record<string, Cam>)['spine-feet-p4'];
  assert.ok(cam, 'spine-feet-p4 exists');
  assert.ok((ELEMENT_VIEWS as Record<string, string[]>)['shed-interior']!.includes('spine-feet-p4'), 'a shed-interior view');
  assert.match(cam.source, /\([a-z0-9-]+\.jpg\)/, 'it names its reference photograph');
  const foot = worldToShed(layout, [cam.pos[0]!, cam.pos[2]!]), aim = worldToShed(layout, [cam.target[0]!, cam.target[2]!]);
  assert.ok(pointInPolygon([cam.pos[0]!, cam.pos[2]!], stationPlatforms(data).get('4')!.pts), `on platform 4 (u ${foot.u.toFixed(1)}, v ${foot.v.toFixed(1)})`);
  assert.ok(Math.abs(cam.pos[1]! - PLATFORM_HEIGHT - 1.6) < 1e-9, 'eye 1.6 m over the platform');
  const off = foot.u - (spine + half);
  assert.ok(off > 1.5 && off < 3.5, `${off.toFixed(2)} m east of the wall's east face`);
  assert.ok(aim.v > foot.v + 8 && Math.abs(aim.u - (spine + half)) < 0.5, 'aimed north along the wall at its face');
  assert.ok(cam.target[1]! > sp - 0.5, 'and up at the springing');
  const c = new THREE.PerspectiveCamera(cam.fov ?? 50, ASPECT, cam.near ?? 0.1, 20000);
  c.position.set(...(cam.pos as [number, number, number])); c.lookAt(...(cam.target as [number, number, number])); c.updateMatrixWorld(true);
  const opaque: THREE.Object3D[] = [];
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh && !['shed-roof-glass', 'shed-roof-bars'].includes(o.name)) opaque.push(o); });
  const eye = new THREE.Vector3(...(cam.pos as [number, number, number]));
  let seen = 0;
  for (const v of shed.ribPositions(L).filter(v => v > foot.v + 4 && v < foot.v + 30)) {
    // the shoe's crown-side face, half way up, and the cap's front under it
    for (const [y, u, want] of [[landing + shed.RIB_SHOE.tall / 2, spine + half + shed.RIB_FOOT_SPINE + shed.MEMBER_SIZE.boom[0] / 2 - 0.005, 'shed-ribs'], [landing - 0.15, spine + half + shed.SPINE_WALL.corbel.out, 'shed-spine-stone']] as const) {
      const [x, z] = shedToWorld(layout, u, v), p = new THREE.Vector3(x, y, z), ndc = p.clone().project(c);
      assert.ok(ndc.z < 1 && Math.abs(ndc.x) < 0.95 && Math.abs(ndc.y) < 0.95, `${want} under the rib at v ${v.toFixed(1)} is in the frame (${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)})`);
      // (the rib's own inner boom, where it rises out of the shoe, may stand a little in front of the shoe's face: still the rib's foot)
      const d = p.distanceTo(eye), hit = new THREE.Raycaster(eye, p.clone().sub(eye).normalize(), 0, d + 0.05).intersectObjects(opaque, false)[0];
      assert.ok(hit && hit.object.name === want && hit.distance > d - 0.3, `${want} under the rib at v ${v.toFixed(1)} is in plain sight (first hit ${hit?.object.name} at ${hit?.distance.toFixed(2)} of ${d.toFixed(2)})`);
      seen++;
    }
  }
  assert.ok(seen >= 6, `${seen / 2} ribs' feet seen`);
});
