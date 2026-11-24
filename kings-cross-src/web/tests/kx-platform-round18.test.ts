import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { shedLayout, worldToShed } from '../../core/station.ts';
import * as furniture from '../src/furniture.ts';
import * as materials from '../src/materials.ts';

// Round 18 (platform-round-5 score, sections 3 and 5): the coping's night floor under the shed's roof only, and the joint jog at the tops/strip boundary.
const data = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData;
const layout = shedLayout(data);
const F = furniture as unknown as Record<string, unknown>;
const cameras = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-station-cameras.json', import.meta.url), 'utf8')) as Record<string, { pos: number[]; target: number[]; fov?: number }>;
const fakeShader = () => ({
  uniforms: {} as Record<string, unknown>,
  vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
  fragmentShader: '#include <common>\nvoid main() {\n#include <color_fragment>\n#include <emissivemap_fragment>\n}',
});

test('B4: after dark the coping floor lights the strips under the shed\'s roof only: the suburban, throat and other stations\' strips get none', () => {
  const under = F.underShedRoof as ((l: typeof layout, p: [number, number]) => boolean) | undefined;
  assert.ok(under, 'underShedRoof');
  const strips = furniture.buildPlatforms(data, layout).getObjectByName('platform-edges') as THREE.Mesh;
  const p = strips.geometry.getAttribute('position'), cover = strips.geometry.getAttribute('kxCover');
  assert.ok(cover, 'the strips carry their cover');
  let inside = 0, outside = 0;
  for (let i = 0; i < p.count; i += 1) {
    const at: [number, number] = [p.getX(i), p.getZ(i)];
    // a vertex on the roof's end line belongs to both pieces: judge it a hair to either side by its piece's other corners (the piece is a quad, 4 vertices)
    const tri = Math.floor(i / 4) * 4, mid: [number, number] = [0, 0];
    for (let k = tri; k < tri + 4; k++) { mid[0] += p.getX(k) / 4; mid[1] += p.getZ(k) / 4; }
    const want: number = under(layout, mid) ? 1 : 0;
    assert.equal(cover.getX(i), want, `strip vertex (${at[0].toFixed(1)}, ${at[1].toFixed(1)}): cover ${cover.getX(i)}, under the roof ${want}`);
    if (want) inside++; else outside++;
    // and no vertex of a lit piece lies past the roof's ends (a long quad over an end is cut there, not lit or left dark whole)
    const sv = worldToShed(layout, at).v;
    if (want) assert.ok(sv > -1e-3 && sv < layout.length + 1e-3, `a lit strip vertex at shed v ${sv.toFixed(2)}, past the roof (0 to ${layout.length.toFixed(2)})`);
    else if (cover.getX(i) === 0 && Math.abs(worldToShed(layout, mid).u - layout.width / 2) < layout.width / 2) assert.ok(sv < 1e-3 || sv > layout.length - 1e-3, `an unlit strip vertex at shed v ${sv.toFixed(2)}, under the roof`);
  }
  assert.ok(inside >= 24 && outside > 100, `${inside} vertices under the roof, ${outside} outside`);
  // the suburban platform 9 (its camera) and the throat beyond the roof's north end get no floor
  const sub = cameras['suburban-p9']!.pos;
  let subStrip = 0;
  for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) - sub[0]!, p.getZ(i) - sub[2]!) < 12) { subStrip++; assert.equal(cover.getX(i), 0, 'a suburban platform\'s strip'); }
  assert.ok(subStrip > 0, 'strips by the suburban platforms');
  // the shader: the floor scaled by the cover and by the coping's own texel (its joints read), and the other stations' strip material has none
  const m = materials.material('platformEdgeStripShed') as THREE.MeshLambertMaterial;
  const shader = fakeShader();
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  assert.match(shader.vertexShader, /attribute float kxCover;[\s\S]*vKxCover = kxCover;/);
  assert.match(shader.fragmentShader, /\* diffuseColor\.rgb \/ vec3\([^)]*\) \* vKxCover \* uWinNight/);
  assert.ok(shader.fragmentShader.includes('#include <color_fragment>'), 'the chunk other patches anchor on kept');
  assert.equal(materials.COPING_PAINT, 0xd4d4ce, 'the coping band\'s paint (paintPlatformEdge)');
  assert.ok(!(materials.material('platformEdgeStrip') as THREE.Material).customProgramCacheKey().includes('coping-night'), 'Waverley\'s and Perth\'s strips: no floor');
});

test('B4: the same slab joint meets itself at the tops/strip boundary, in world z (under 1 cm) and on the screen from platform-eye (under half a pixel)', () => {
  const g = furniture.buildPlatforms(data, layout);
  const read = (name: string) => { const m = g.getObjectByName(name) as THREE.Mesh; return { p: m.geometry.getAttribute('position'), uv: m.geometry.getAttribute('uv') }; };
  const tops = read('platform-tops'), strips = read('platform-edges'), J = materials.PLATFORM_JOINT;
  const cam = cameras['platform-eye']!;
  // the strip quad (four vertices a quad) whose inner edge (u > 1 m, the tops' side) runs past the camera, nearest it across: that edge's two corners
  let edge: [number, number][] = [], bestD = Infinity;
  for (let q = 0; q + 4 <= strips.p.count; q += 4) {
    const inner = [q, q + 1, q + 2, q + 3].filter((i) => strips.uv.getX(i) > 1);
    if (inner.length !== 2) continue;
    const [i0, i1] = inner as [number, number];
    const z0 = strips.p.getZ(i0), z1 = strips.p.getZ(i1), zc = cam.pos[2]! - 6;
    if ((z0 - zc) * (z1 - zc) >= 0) continue;
    const d = Math.abs((strips.p.getX(i0) + strips.p.getX(i1)) / 2 - cam.pos[0]!);
    if (d < bestD) { bestD = d; edge = [i0, i1].map((i): [number, number] => [i, 0]); }
  }
  assert.ok(edge.length === 2 && bestD < 10, `a strip's inner edge ${bestD.toFixed(1)} m across from the camera`);
  const [i0, i1] = edge.map((e) => e[0]) as [number, number];
  const yStrip = strips.p.getY(i0);
  // along the inner edge: x, and the strip's v, as linear in z; the tops' v at the same point (v = -z on every top; checked on its own corners)
  const lin = (f0: number, f1: number) => (z: number) => f0 + ((f1 - f0) * (z - strips.p.getZ(i0))) / (strips.p.getZ(i1) - strips.p.getZ(i0));
  const xAt = lin(strips.p.getX(i0), strips.p.getX(i1)), vStrip = lin(strips.uv.getY(i0), strips.uv.getY(i1));
  for (let i = 0; i < tops.p.count; i += 97) assert.ok(Math.abs(tops.uv.getY(i) + tops.p.getZ(i)) < 1e-4, 'a top\'s v is -z');
  const camera = new THREE.PerspectiveCamera(cam.fov ?? 50, 1280 / 800, 0.1, 9000);
  camera.position.set(cam.pos[0]!, cam.pos[1]!, cam.pos[2]!);
  camera.lookAt(cam.target[0]!, cam.target[1]!, cam.target[2]!);
  camera.updateMatrixWorld();
  let worst = 0, worstZ = 0, seen = 0;
  for (let n = 0; n < 12; n++) {
    const zt = -(Math.ceil(-(cam.pos[2]! - 1) / J) * J + n * J); // the tops' joints (v = 0 mod J), 1 m and more ahead of the eye
    // the same joint on the strip: where the strip's v, at the inner edge, comes to the same value (solved on the edge's line)
    const want = -zt, z0 = strips.p.getZ(i0), zs = z0 + ((want - vStrip(z0)) * (strips.p.getZ(i1) - z0)) / (vStrip(strips.p.getZ(i1)) - vStrip(z0));
    worstZ = Math.max(worstZ, Math.abs(zs - zt));
    const x = xAt(zt);
    const s = new THREE.Vector3(x, yStrip, zs).project(camera), t = new THREE.Vector3(x, PLATFORM_HEIGHT, zt).project(camera);
    if (Math.abs(s.y) > 1) continue; // below the frame
    seen++;
    worst = Math.max(worst, Math.abs(s.y - t.y) * 400);
    if (process.env.PF6) console.log('joint', n, zt.toFixed(3), (zs - zt).toExponential(2), x.toFixed(2), yStrip, (Math.abs(s.y - t.y) * 400).toFixed(3), s.y.toFixed(3));
  }
  assert.ok(seen >= 8, `${seen} joints in the frame`);
  assert.ok(worstZ < 0.01, `the joint's z on the strip and on the top differ by ${(worstZ * 100).toFixed(2)} cm`);
  assert.ok(worst < 0.5, `the same joint drawn on the strip and on the top steps ${worst.toFixed(2)} px on the 800 px high platform-eye frame`);
});

test('B5: no blade post crosses either face (it stops at the panel\'s foot), and the trolley point\'s trolleys are wire frames, not a solid slab', () => {
  const geo = F.extraGeometry as (e: { kind: string; label: string }, part?: string) => THREE.BufferGeometry;
  const B = F.BLADE as { top: number; size: number };
  const body = geo({ kind: 'blade', label: '6 7' }, 'body');
  body.computeBoundingBox();
  assert.ok(body.boundingBox!.max.y <= B.top - B.size + 1e-6, `the post reaches ${body.boundingBox!.max.y.toFixed(2)} m, the panel's foot is ${(B.top - B.size).toFixed(2)} m`);
  const all = geo({ kind: 'blade', label: '6 7' });
  all.computeBoundingBox();
  assert.ok(all.boundingBox!.min.y <= 1e-6, 'and it still stands on the platform: post and panel meet');
  // the trolleys: every box in front of the board (z > 0.2) is thin in at least two of its three sizes (a wire), and there are TROLLEY.n of them
  const T = F.TROLLEY as { n: number } | undefined;
  assert.ok(T && T.n >= 3 && T.n <= 4, 'three or four nested trolleys');
  const g = geo({ kind: 'trolley', label: '1' }), p = g.getAttribute('position'), idx = g.index!;
  // a solid slab shows as a broad face; a wire's faces are all slivers (2 x TROLLEY.wire across): no triangle in front of the board over 0.03 m^2
  const A = new THREE.Vector3(), Bv = new THREE.Vector3(), C = new THREE.Vector3();
  let front = 0;
  for (let i = 0; i < idx.count; i += 3) {
    A.fromBufferAttribute(p, idx.getX(i)); Bv.fromBufferAttribute(p, idx.getX(i + 1)); C.fromBufferAttribute(p, idx.getX(i + 2));
    if (Math.min(A.z, Bv.z, C.z) < 0.2) continue;
    front++;
    const area = Bv.clone().sub(A).cross(C.clone().sub(A)).length() / 2;
    assert.ok(area < 0.03, `a ${area.toFixed(3)} m^2 face in front of the board: a slab, not wire`);
  }
  assert.ok(front >= 4 * 9 * 8, `${front} wire faces in front of the board: ${T.n} trolleys`);
});
