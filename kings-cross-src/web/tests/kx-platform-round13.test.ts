import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { shedLayout } from '../../core/station.ts';
import { PAINTERS, TEXTURES } from '../src/materials.ts';
import { SHADOW_CASTERS } from '../src/lighting.ts';
import * as shedModule from '../src/shed.ts';

// Round 13 (rubric shed-interior B4 and B5; R-kx-shed-interior-d, the key, and -a): the platform edge's bands in the right order, and the platform clock
// on its bracket from the arcade wall.
const S = shedModule as unknown as Record<string, unknown>;
const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);

/** Paint `name` into a recording context; the colour a column at x (metres across the tile) is left with by the full-height fills (the bands). */
function bands(name: 'platformEdge' | 'asphalt'): (x: number) => [number, number, number] {
  const spec = TEXTURES[name], [w, h] = spec.px, fills: { x: number; w: number; c: string }[] = [];
  let style = '';
  const g = new Proxy({}, {
    get: (_t, k) => (k === 'fillRect' ? (x: number, y: number, fw: number, fh: number) => { if (y <= 0 && fh >= h) fills.push({ x, w: fw, c: style }); } : k === 'fillStyle' ? style : () => undefined),
    set: (_t, k, value) => { if (k === 'fillStyle') style = String(value); return true; },
  });
  (PAINTERS[name] as (g: unknown, w: number, h: number) => void)(g, w, h);
  const pxm = w / spec.tile[0];
  return (x) => {
    const hit = [...fills].reverse().find((f) => f.x <= x * pxm && x * pxm < f.x + f.w && /^#/.test(f.c));
    assert.ok(hit, `a band at ${x} m`);
    const n = parseInt(hit.c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
}
const sat = ([r, g, b]: number[]): number => (Math.max(r!, g!, b!) - Math.min(r!, g!, b!)) / Math.max(r!, g!, b!, 1);
const lum = ([r, g, b]: number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

test('B4: the edge strip runs coping, a buff tactile strip, a narrow yellow line, then the platform\'s own surface; no dark band, no white line', () => {
  const at = bands('platformEdge'), surface = bands('asphalt')(1);
  const coping = at(0.1), tactile = at(0.4), yellow = at(0.65);
  assert.ok(sat(coping) < 0.1 && lum(coping) > 140, `the coping a pale grey: ${coping}`);
  assert.ok(sat(tactile) > 0.15 && sat(tactile) < 0.45 && lum(tactile) > 140, `the tactile strip buff, not saturated yellow: ${tactile}`);
  assert.ok(sat(yellow) > 0.7 && yellow[0] > 180 && yellow[1] > 140, `a yellow line: ${yellow}`);
  for (const x of [0.75, 1.0, 1.1, 1.3, 1.55]) assert.deepEqual(at(x), surface, `at ${x} m the platform's surface tone, as its tops are painted`);
  const across = [0.62, 0.68].map(at);
  assert.ok(across.every((c) => sat(c) > 0.7), 'the yellow line about 0.1 m wide');
  assert.ok(sat(at(0.58)) < 0.45 && sat(at(0.72)) < 0.1, 'and no wider');
});

test('B5: a two-faced platform clock on a bracket from the west arcade wall, over the platform, its hands from the clocks module; no shadow, two draws', () => {
  const build = S.buildPlatformClock as ((length: number) => THREE.Group) | undefined, spec = S.PLATFORM_CLOCK as { radius: number; y: number; out: number; drum: number; rim: number; arm: number } | undefined;
  assert.ok(build && spec, 'buildPlatformClock and PLATFORM_CLOCK are exported');
  const shed = shedModule.buildShed(layout, { range: false });
  const clock = shed.getObjectByName('shed-platform-clock') as THREE.Group;
  assert.ok(clock, 'in the shed');
  const dials = clock.userData.clockDials as { centre: number[]; normal: number[]; radius: number }[];
  assert.equal(dials.length, 2, 'two faces');
  assert.deepEqual(dials.map((d) => d.normal[2]).sort(), [-1, 1], 'one up the platform, one down it');
  for (const d of dials) assert.ok(d.radius >= 0.4 && d.radius <= 0.8 && d.centre[1]! > 4 && d.centre[1]! < 6.5 && d.centre[0]! > 0.8 && d.centre[0]! < 3, `a dial at ${d.centre}`);
  const meshes: THREE.Mesh[] = [];
  clock.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  assert.equal(meshes.length, 2, 'two draws');
  for (const m of meshes) assert.ok(!SHADOW_CASTERS.has(m.name), `${m.name} casts no shadow`);
  const tris = meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3, 0);
  assert.ok(tris < 1500, `${tris} triangles`);
  // nothing floats: the iron reaches the wall's face (x = 0) and the drum, and the faces sit inside the drum
  const box = (n: string): THREE.Box3 => { const g = meshes.find((m) => m.name === n)!.geometry; g.computeBoundingBox(); return g.boundingBox!; }; // in the shed's frame
  const iron = box('shed-platform-clock-iron'), face = box('shed-platform-clock-faces');
  assert.ok(iron.min.x <= 0.01 && iron.min.x >= -0.1, `the bracket on (and at most 0.1 m into) the wall's face: ${iron.min.x.toFixed(3)}`);
  assert.ok(iron.min.y < face.min.y && iron.max.y > face.max.y + 0.3 && iron.max.x >= face.max.x, 'the drum round the faces, the arm above them');
  assert.ok(face.min.z > iron.min.z && face.max.z < iron.max.z, 'the faces within the drum\'s depth');
  assert.ok(face.max.z - face.min.z > 0.9 * spec.drum, 'a face on each side of the drum');
  // the arm runs from the wall's face out to the hanger over the drum, at its height (the drum's top plus 0.35 m, as built)
  const armY = spec.y + spec.radius + spec.rim + 0.35, pos = meshes.find((m) => m.name === 'shed-platform-clock-iron')!.geometry.getAttribute('position');
  const armX: number[] = [];
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - armY) <= spec.arm / 2 + 1e-6) armX.push(pos.getX(i));
  assert.ok(armX.length && armX.reduce((a, b) => Math.min(a, b)) <= 0.01 && armX.reduce((a, b) => Math.max(a, b)) >= spec.out, `the arm from the wall to the hanger: ${armX.length} vertices at its height`);
});
