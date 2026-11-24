import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { shedLayout } from '../../core/station.ts';
import * as furniture from '../src/furniture.ts';
import * as materials from '../src/materials.ts';
import * as night from '../src/night.ts';
import { buildPlatformClock } from '../src/shed.ts';

// Round 17 (platform-round-4 score, sections 3 and 5): the strips' slab joints carried on from the tops' (no jog), the coping a pale line after dark, the
// number blades bigger, clear above the pole clocks' and totems' heads and lit after dark, and a camera on one furniture group.
const data = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData;
const layout = shedLayout(data);
const F = furniture as unknown as Record<string, unknown>, M = materials as unknown as Record<string, unknown>;
const fakeShader = () => ({ uniforms: {} as Record<string, unknown>, vertexShader: '', fragmentShader: '#include <common>\nvoid main() {\n#include <emissivemap_fragment>\n}' });

test('B4: every top\'s joints keep one phase (v is the world\'s -z), and the edge strips inside the shed carry the same phase across them: no jog', () => {
  const g = furniture.buildPlatforms(data, layout);
  const read = (name: string) => { const m = g.getObjectByName(name) as THREE.Mesh; return { p: m.geometry.getAttribute('position'), uv: m.geometry.getAttribute('uv') }; };
  const tops = read('platform-tops');
  for (let i = 0; i < tops.p.count; i++) assert.ok(Math.abs(tops.uv.getY(i) + tops.p.getZ(i)) < 1e-4, 'a top\'s v is -z');
  const strips = read('platform-edges'), joint = materials.PLATFORM_JOINT;
  let inShed = 0, off = 0;
  for (let i = 0; i < strips.p.count; i++) {
    const z = strips.p.getZ(i);
    const x = strips.p.getX(i);
    if (z > -15 || z < -250 || x < 0 || x > 90) continue; // the shed's platforms (0-8); elsewhere (St Pancras's, the throat's angled ends) edges keep their own run
    inShed++;
    const d = ((strips.uv.getY(i) + z) % joint + joint) % joint;
    if (Math.min(d, joint - d) > 1e-4) off++;
  }
  assert.ok(inShed >= 24 && off === 0, `${off} of ${inShed} strip corners in the shed off the tops' joint phase`);
});

test('B4: after dark only, the coping band holds about lit concrete\'s light; by day the strip is as it was', () => {
  const spec = M.COPING_NIGHT as { floor: number; band: number } | undefined;
  assert.ok(spec, 'COPING_NIGHT');
  const c = new THREE.Color(spec.floor), lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear
  // re-pinned (round 17, second pass, the lead's capture: 0x2c2c29, about 0.025 linear, did not show): a clearly paler line, still not a glow strip
  assert.ok(lum > 0.06 && lum < 0.14, `a pale line, not a glow strip: ${lum.toFixed(3)} linear`);
  const m = materials.material('platformEdgeStrip') as THREE.MeshLambertMaterial;
  assert.ok(m.customProgramCacheKey().includes('coping-night'), 'its own program');
  const shader = fakeShader();
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  assert.equal(shader.uniforms.uWinNight, materials.windowNight, 'driven by windowNight, 0 by day');
  const u = spec.band / materials.TEXTURES.platformEdge.tile[0];
  assert.ok(shader.fragmentShader.includes(`vMapUv.x < ${u}`) && /\* uWinNight/.test(shader.fragmentShader), 'on the coping band only, scaled by the night');
  assert.equal(m.emissive.getHex(), 0, 'no light of its own by day');
});

test('B5: the blades are big, their panels clear above every pole clock\'s and totem\'s head, far from the lamp standards, and lit from within after dark', () => {
  const B = F.BLADE as { top: number; size: number; digit: number; clear: number; night: number } | undefined;
  assert.ok(B, 'BLADE');
  assert.ok(B.digit >= 0.6 && B.size >= 0.95, `numerals ${B.digit} m on a ${B.size} m panel, to read at 30-60 m`);
  const heads = Math.max(furniture.FIGURES.clockHeight, furniture.FIGURES.totemHeight);
  assert.ok(B.top - B.size >= heads + 0.3, `the panel's foot ${(B.top - B.size).toFixed(2)} m clear of the heads' top ${heads} m`);
  const blade = (F.extraGeometry as (e: { kind: string; label: string }, part?: string) => THREE.BufferGeometry)({ kind: 'blade', label: '6 7' }, 'face');
  blade.computeBoundingBox();
  assert.ok(blade.boundingBox!.min.y >= heads + 0.3 - 1e-6, 'the face geometry as declared');
  const plan = furniture.furniturePlan(data, layout);
  const blades = (plan as unknown as { extras: { kind: string; x: number; z: number }[] }).extras.filter((e) => e.kind === 'blade');
  for (const b of blades) for (const l of plan.lamps) assert.ok(Math.hypot(l.x - b.x, l.z - b.z) > 8, 'no lamp standard\'s head beside a blade');
  const g = furniture.buildFurniture(data, layout);
  const faces = g.getObjectByName('platform-blades') as THREE.Mesh;
  assert.ok(faces && !faces.castShadow, 'the faces their own mesh, casting nothing');
  const mat = faces.material as THREE.MeshLambertMaterial, shader = fakeShader();
  mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  assert.equal(shader.uniforms.uWinNight, materials.windowNight);
  assert.ok(/vColor\.rgb \* [0-9.]+ \* uWinNight/.test(shader.fragmentShader), 'lit from within, in their own colours, after dark');
  assert.ok(B.night >= 0.3 && B.night <= 0.7, 'pale, not blinding');
});

test('B5: a platform-furniture camera frames one group (blade, bins, trolley point) from 8-12 m at eye height', () => {
  const cams = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-station-cameras.json', import.meta.url), 'utf8')) as Record<string, { pos: number[]; target: number[]; fov?: number }>;
  const cam = cams['platform-furniture'];
  assert.ok(cam, 'the camera');
  const plan = furniture.furniturePlan(data, layout) as unknown as { extras: { kind: string; label: string; x: number; z: number }[] };
  const eye = new THREE.Vector3(...cam.pos), dir = new THREE.Vector3(...cam.target).sub(eye).normalize();
  const near = plan.extras.find((e) => Math.hypot(e.x - eye.x, e.z - eye.z) < 13);
  assert.ok(near, 'furniture near the camera');
  const group = plan.extras.filter((e) => e.label === near.label);
  assert.deepEqual(group.map((e) => e.kind).sort(), ['bins', 'blade', 'trolley']);
  const mid = new THREE.Vector3(group.reduce((s, e) => s + e.x, 0) / 3, eye.y, group.reduce((s, e) => s + e.z, 0) / 3);
  const d = Math.hypot(mid.x - eye.x, mid.z - eye.z);
  assert.ok(d >= 8 && d <= 12 && Math.abs(eye.y - 2.5) < 0.01, `${d.toFixed(1)} m from the group, at eye height`);
  for (const e of group) {
    const to = new THREE.Vector3(e.x, eye.y, e.z).sub(eye).setY(0).normalize(), flat = dir.clone().setY(0).normalize();
    assert.ok(Math.acos(Math.min(1, to.dot(flat))) < ((cam.fov ?? 50) / 2) * (Math.PI / 180) * 0.8, `the ${e.kind} in frame`);
  }
});

test('B5: the platform clock\'s night dial is neutral white (no blue cast), at DIAL_GLOW\'s brightness capped as before; the tower keeps DIAL_GLOW', () => {
  const N = night as unknown as Record<string, unknown>, neutral = N.DIAL_GLOW_NEUTRAL as [number, number, number] | undefined;
  assert.ok(neutral, 'DIAL_GLOW_NEUTRAL');
  const clock = buildPlatformClock(layout.length);
  clock.updateMatrixWorld(true);
  const lights = night.createDialLights();
  assert.equal(lights.scan(clock), 2);
  lights.setLevel(1);
  const glows: THREE.Mesh[] = [];
  clock.traverse((o) => { if (o.name === 'clock-dial-glow') glows.push(o as THREE.Mesh); });
  for (const g of glows) {
    const c = (g.material as THREE.MeshBasicMaterial).color;
    assert.ok(Math.abs(c.r - c.b) < 1e-6 && Math.abs(c.g - c.b) < 1e-6, `neutral: ${c.toArray().map((n) => n.toFixed(3))}`);
    assert.ok(c.r > 0.4 && c.r <= 0.75, 'and still capped');
  }
  const tower = new THREE.Group(), face = new THREE.Mesh(new THREE.CircleGeometry(1, 8), new THREE.MeshLambertMaterial());
  tower.add(face);
  tower.userData.clockDials = [{ centre: [0, 0, 0], normal: [0, 0, 1], up: [0, 1, 0], radius: 1 }];
  const own = night.createDialLights();
  own.scan(tower);
  own.setLevel(1);
  assert.deepEqual(((tower.getObjectByName('clock-dial-glow') as THREE.Mesh).material as THREE.MeshBasicMaterial).color.toArray(), new THREE.Color().setRGB(...night.DIAL_GLOW).toArray());
});

test('B5: each blade face reads true from its own side: digits left to right, glyphs unmirrored ("6" lights its lower-left stroke, "7" does not)', () => {
  const B = F.BLADE as { top: number; size: number; digit: number; pitch: number; stroke: number };
  const geo = F.extraGeometry as (e: { kind: string; label: string }, part?: string) => THREE.BufferGeometry;
  const sw = B.digit * 0.58, t = B.stroke, y0 = B.top - B.size / 2 - B.digit / 2;
  // a stroke's inner foot corner: (x0 + t, y0) is the lower-left stroke's alone (e), (x1 - t, y0) the lower-right's (c), in the face's own right axis
  const has = (g: THREE.BufferGeometry, side: number, r: number): boolean => {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (side * p.getZ(i) > 0.031 && Math.abs(side * p.getX(i) - r) < 1e-6 && Math.abs(p.getY(i) - y0) < 1e-6) return true;
    return false;
  };
  const seven = geo({ kind: 'blade', label: '7' }, 'face'), pair = geo({ kind: 'blade', label: '6 7' }, 'face');
  for (const side of [1, -1]) { // +z face: seen from +z its right is +x; -z face: its right is -x
    assert.ok(!has(seven, side, -sw / 2 + t) && has(seven, side, sw / 2 - t), `"7" unmirrored on the ${side > 0 ? '+z' : '-z'} face: its foot on the right`);
    assert.ok(has(pair, side, -B.pitch / 2 - sw / 2 + t), `"6 7": the left digit is the 6 (lower-left lit) on the ${side > 0 ? '+z' : '-z'} face`);
    assert.ok(!has(pair, side, B.pitch / 2 - sw / 2 + t), `and the right digit the 7 on the ${side > 0 ? '+z' : '-z'} face`);
  }
});

test('B5: the bins are about 1.0 m tall and 0.5 m wide each, as paired platform bins (ASSUMED)', () => {
  const g = (F.extraGeometry as (e: { kind: string; label: string }) => THREE.BufferGeometry)({ kind: 'bins', label: '1' });
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  assert.ok(bb.max.y >= 0.95 && bb.max.y <= 1.05, `${bb.max.y.toFixed(2)} m tall`);
  assert.ok(bb.max.x - bb.min.x >= 0.9 && bb.max.x - bb.min.x <= 1.12, `the pair ${(bb.max.x - bb.min.x).toFixed(2)} m wide: two of about 0.5 m`);
  assert.ok(bb.max.z - bb.min.z <= 0.65, `${(bb.max.z - bb.min.z).toFixed(2)} m deep`);
});
