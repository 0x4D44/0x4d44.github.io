import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { buildingNightMaterialsOf, material } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
import { GROUND_Y } from '../src/world.ts';

// Round 24 (front-piers-round-3b score, section 5): A2 the spandrel panels recessed behind the wall's face, the cornice's painted shadow line lifted at night,
// the front's night wash on soffits; A3 the porch soffit in the dressings' tone and inside the sign band, the dark return carried round each head, and the
// voussoirs and canopy lit at night.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const X0 = layout.spine - SHED_SPAN_WIDTH, X1 = layout.spine + SHED_SPAN_WIDTH, FW = 2 * SHED_SPAN_WIDTH;
const bay = (FW - shed.TOWER_SIZE) / 6;
const doors = [...[0, 1, 2].map(i => X0 + (i + 0.5) * bay), ...[2, 1, 0].map(i => X0 + FW - (i + 0.5) * bay)];
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const S = shed as unknown as Record<string, unknown>;
const front = group.getObjectByName('shed-front') as THREE.Mesh;
const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh;
const frontTop = Math.max(...front.geometry.getAttribute('position').array.filter((_, i) => i % 3 === 1));
const masonry = ['shed-front', 'shed-brick', 'shed-stone'].map(n => group.getObjectByName(n)!);
const ray = (o: [number, number, number], d: [number, number, number], targets: THREE.Object3D[]): { x: number; y: number; z: number; name: string; mat: number } | null => {
  const origin = group.localToWorld(new THREE.Vector3(...o)), dir = new THREE.Vector3(...d).transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(origin, dir, 0, 40).intersectObjects(targets, true)[0];
  if (!h) return null;
  const p = group.worldToLocal(h.point.clone());
  return { x: p.x, y: p.y, z: p.z, name: h.object.name, mat: h.face?.materialIndex ?? -1 };
};
const T = S.FRONT_TYMPANUM as { out: number; band: number; strip: number; recess: number };
const A = shed.SOUTH_FRONT_ARCADES, entryFoot = GROUND_Y + A.footAboveGround, entryR = A.openingWidth / 2;
const halfAt = (y: number): number => entryR * Math.sqrt(Math.max(0, 1 - ((y - entryFoot - A.jambHeight) / A.archRise) ** 2));
const s1 = GROUND_Y + shed.FRONT_CANOPY.top - shed.FRONT_CANOPY.sheet - 0.02, s0 = s1 - shed.PORCH_INFILL.sign;
const mats = infill.material as THREE.MeshLambertMaterial[];

test('A2: each spandrel\'s panel is recessed 0.15-0.25 m behind the wall\'s face, inside its frame, and closed behind', () => {
  assert.ok(T.recess >= 0.15 && T.recess <= 0.25, `FRONT_TYMPANUM.recess ${T.recess}`);
  const yBand = frontTop - 0.9 - 0.25 - 0.25 - 0.1 - T.band;
  for (const xa of [X0 + 1.0, layout.spine + shed.TOWER_SIZE / 2]) for (const [x, y] of [[xa + 2.5, yBand - 1.0], [xa + T.strip + 0.3, yBand - 2.0]] as const) {
    const h = ray([x, y, 10], [0, 0, -1], masonry);
    assert.ok(h && h.name === 'shed-front' && Math.abs(h.z + T.recess) < 0.02, `the panel at x ${x.toFixed(1)}, y ${y.toFixed(1)}: ${h?.name} ${h?.z.toFixed(2)}`);
    const back = ray([x, y, -6], [0, 0, 1], masonry);
    assert.ok(back && Math.abs(back.z + 1.2) < 0.02, `closed from inside (${back?.z.toFixed(2)})`);
  }
  // and the wall's face round the frame is not recessed: the face strip of the end pier and the wall beside the tower above the band's top
  const wall = ray([X0 + 3, frontTop - 0.9 - 0.25 - 0.25 - 0.05, 10], [0, 0, -1], [...masonry, infill]);
  assert.ok(wall && wall.z > -0.01, `the wall above the band at its face (${wall?.name} ${wall?.z.toFixed(2)})`);
});

test('A2: the cornice\'s painted shadow line and soffits are charcoal by day but lifted at night to the floodlit wall, in a material of their own', () => {
  const shade = mats[6];
  assert.ok(shade && shade.customProgramCacheKey().includes('shade'), 'a seventh infill material, with its own night lift');
  const hsl = { h: 0, s: 0, l: 0 }; shade.color.getHSL(hsl);
  assert.ok(hsl.l < 0.2, 'charcoal by day');
  const N = S.FRONT_NIGHT as Record<string, readonly [number, number]>;
  const [c, g] = N.shade!; const lift = new THREE.Color(c).multiplyScalar(g);
  assert.ok(lift.r > 0.03 && lift.r < 0.15 && lift.r >= lift.b, `a warm night value near the wall's (${lift.r.toFixed(3)})`);
  const yb = frontTop - 0.9 - shed.FRONT_RELIEF.bedMould.height;
  const line = ray([X0 + 2, yb - 0.1, 5], [0, 0, -1], [...masonry, infill]);
  assert.ok(line && line.name === 'shed-front-infill' && line.mat === 6, `the shadow line (${line?.name} ${line?.mat})`);
  const up = ray([X0 + 2, yb - 0.5, 0.2], [0, 1, 0], [infill]);
  assert.ok(up && up.mat === 6, 'the bed mould\'s soffit too');
});

test('A2: the front\'s night wash lights a soffit (a face turned down) as well as a face turned out', () => {
  assert.ok((S.FRONT_WASH_SOFFIT as number) >= 0.5, 'FRONT_WASH_SOFFIT');
  const night = buildingNightMaterialsOf(front)?.night as THREE.Material; // the front's wall (FRONT_THICK 1.2 m), its wash shared by the brick and stone dressings
  const shader = { uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.lambert.uniforms), vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
  night.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert.match(shader.fragmentShader, /max\(-vKxWashNormal\.y,0\.0\)/);
});

test('A3: each porch soffit is in the stone dressings\' tone by day and ends within the sign band\'s width', () => {
  const soffit = mats[5]!, stone = material('stoneFoot') as THREE.MeshLambertMaterial;
  for (const k of ['r', 'g', 'b'] as const) assert.ok(Math.abs(soffit.color[k] - stone.color[k]) < 0.03, `the dressings' ${k}`);
  assert.equal(soffit.emissive.getHex(), 0, 'no day glow');
  const fw = 2 * halfAt(s1) - 0.04;
  for (const x of doors) {
    assert.ok(ray([x + fw / 2 - 0.1, s0 - 0.3, -0.5], [0, 1, 0], [infill])?.mat === 5, 'under the band');
    const past = ray([x + fw / 2 + 0.08, s0 - 0.3, -0.5], [0, 1, 0], [infill]);
    assert.ok(!past || past.mat !== 5 || past.y > s0 + 0.01, `not past the band at x ${x.toFixed(1)}`);
  }
});

test('A3: the reveal\'s dark return runs round each opening\'s arched head, back to the glass', () => {
  const crown = entryFoot + A.jambHeight + A.archRise;
  for (const x of doors) for (const dx of [0, entryR * 0.4]) {
    const up = ray([x + dx, s1 + 0.1, -0.4], [0, 1, 0], [infill]);
    assert.ok(up && up.mat === 1 && up.y > s1 && up.y <= crown + 0.01, `the head's return over x ${(x + dx).toFixed(1)}: ${up?.mat} at ${up?.y.toFixed(2)}`);
  }
});

test('A3: the voussoirs are in the floodlit dressing stone and the canopy\'s steel lifts a little at night, on its underside', () => {
  const porch = group.getObjectByName('shed-front-porch-arches') as THREE.Mesh;
  const pm = porch.material as THREE.MeshLambertMaterial[];
  assert.equal(pm[0], material('stoneFoot'), 'the voussoirs floodlit as the front\'s dressings');
  assert.ok(pm[0]!.defines?.FLOOD !== undefined, 'FLOOD');
  assert.ok(pm[1]!.customProgramCacheKey().includes('canopy'), 'the canopy\'s own night lift');
  // re-pinned round 24b (the 0.12 lift lit the canopy a flat tan, as bright as the floodlit stone): dark steel picking up a little spill, a quarter or less
  // of the stone's floodlight (FLOOD.x times its colour), on its underside only, its top dark from above
  const N = S.FRONT_NIGHT as Record<string, readonly [number, number]>;
  const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const stone = pm[0]!, flood = Number(/vec4\(\s*([0-9.]+)/.exec(String(stone.defines?.FLOOD))?.[1]);
  const lift = new THREE.Color(N.canopy![0]).multiplyScalar(N.canopy![1]);
  assert.ok(flood > 0 && lum(lift) <= 0.25 * flood * lum(stone.color), `the canopy's night lift ${lum(lift).toFixed(3)} against the stone's ${(flood * lum(stone.color)).toFixed(3)}`);
  assert.ok(pm[1]!.defines?.KX_GLOW_DOWN !== undefined, 'lit on its underside only');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
  pm[1]!.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert.match(shader.fragmentShader, /#ifdef KX_GLOW_DOWN\nfrontGlowAdd \*= max\( -vFrontNy, 0\.0 \);/);
  const hsl = { h: 0, s: 0, l: 0 }; pm[1]!.color.getHSL(hsl);
  assert.ok(hsl.l < 0.2, 'still charcoal by day');
});
