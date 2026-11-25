import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { buildingNightMaterialsOf, material } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
import { GROUND_Y } from '../src/world.ts';
import { DAY_EXPOSURE } from '../../core/daylight.ts';
import { acesFilmic, toSrgb } from './aces.ts';

// Arcade round 2 (the A2 round's score, A3): by day the lower arcade's returns (the porch rings' returns and soffits, the openings' brick reveals) take
// the great arches' contact shade, night unchanged; and the figures and barriers behind the glass are the interior's own tone at their spot, darker,
// wherever they stand (the interior runs 5-37 sRGB across its gradient and vignette on the GPU).
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const A = shed.SOUTH_FRONT_ARCADES, O = shed.PORCH_ORDERS, T = shed.PORCH_TONES, D = shed.PORCH_DEPTH;
const S = shed as unknown as { PORCH_RETURN_SHADE: { back: number; face: number }; FRONT_ORDER_SHADE: number; FRONT_RETURN: number };
const entryFoot = GROUND_Y + A.footAboveGround, entryR = A.openingWidth / 2, spring = entryFoot + A.jambHeight, crown = spring + A.archRise;
const centres = shed.southFrontArcadeCentres(4 * R, shed.TOWER_SIZE).map(x => x + layout.spine - 2 * R).filter(c => Math.abs(c - layout.spine) > shed.TOWER_SIZE);
const named = (n: string): THREE.Mesh => group.getObjectByName(n) as THREE.Mesh;
const porch = named('shed-front-porch-arches'), front = named('shed-front'), infill = named('shed-front-infill');
const hits = (o: [number, number, number], d: [number, number, number], targets: THREE.Object3D[], far = 10): THREE.Intersection[] =>
  new THREE.Raycaster(group.localToWorld(new THREE.Vector3(...o)), new THREE.Vector3(...d).transformDirection(group.matrixWorld), 0, far).intersectObjects(targets, false);
const shadeAt = (h: THREE.Intersection): number => ((h.object as THREE.Mesh).geometry.getAttribute('color') as THREE.BufferAttribute).getX(h.face!.a);
/** round 2b: the vertex colour interpolated at the hit (the rings' returns are graded across their depth) */
const shadeIn = (h: THREE.Intersection): number => {
  const m = h.object as THREE.Mesh, pos = m.geometry.getAttribute('position') as THREE.BufferAttribute, col = m.geometry.getAttribute('color') as THREE.BufferAttribute, f = h.face!;
  const v = [f.a, f.b, f.c].map(i => new THREE.Vector3().fromBufferAttribute(pos, i)), p = m.worldToLocal(h.point.clone());
  const bc = new THREE.Triangle(v[0], v[1], v[2]).getBarycoord(p, new THREE.Vector3())!;
  return bc.x * col.getX(f.a) + bc.y * col.getX(f.b) + bc.z * col.getX(f.c);
};
const show = (l: number): number => 255 * toSrgb(acesFilmic([l, l, l], DAY_EXPOSURE))[1];
const inv = (t: number): number => { let l = 1e-6; while (show(l) < t) l *= 1.002; return l; };

test('A3 round 2b: the porch rings\' returns and soffits are graded shadowed brick by day, darker at the wall than at the face, their faces the brick; at night the brick as before', () => {
  // re-pinned round 2b (the GPU: at the great arches' 0.275 the rings' returns read 3-9 on brick at 33-36, an ink line): graded `back` to `face`, which
  // on the ACES curve puts a return that reads 21-26 unshaded at 15-22 at the wall and 20 or more at the face, 0.55-0.7 of the brick beside it
  const P = S.PORCH_RETURN_SHADE;
  assert.ok(P.back >= 0.7 && P.back <= 0.9 && P.face > P.back && P.face <= 1, `PORCH_RETURN_SHADE ${JSON.stringify(P)}`);
  for (const b of [21, 26]) {
    const at = show(P.back * inv(b)), out = show(P.face * inv(b));
    assert.ok(at >= 15 && at <= 22 && out >= 20, `a return ${b} unshaded: ${at.toFixed(1)} at the wall, ${out.toFixed(1)} at the face`);
  }
  const day = porch.material as THREE.MeshLambertMaterial[], night = [buildingNightMaterialsOf(porch)!.night].flat() as THREE.MeshLambertMaterial[];
  assert.ok(day[0]!.vertexColors && !night[0]!.vertexColors && night[0] === material('brickFoot'), 'the day rings take the vertex colour, the night ones are the brick');
  for (const c of centres) {
    // the inner ring's soffit over the crown, met from under the head; its outer order's return over the crown, met from just above the inner one's face
    const soffit = hits([c, entryFoot + 1.0, O.step / 2], [-1, 0, 0], [porch], entryR + 0.2)[0]; // the inner order's soffit down the west jamb, under the canopy
    const grade = (z: number, depth: number): number => P.back + ((P.face - P.back) * z) / depth;
    // re-pinned round 2c (the GPU: the graded soffit lost its brick speckle, darker than BASE): the inner ring's soffit unshaded; the returns graded
    assert.ok(soffit && soffit.face!.materialIndex === 0 && Math.abs(shadeIn(soffit) - 1) < 1e-4, `the soffit at x ${c.toFixed(1)}: ${soffit && shadeAt(soffit)} mat ${soffit?.face?.materialIndex} n ${soffit?.face?.normal.toArray()} at ${soffit && group.worldToLocal(soffit.point.clone()).toArray().map(v => v.toFixed(2))}`);
    for (const z of [O.step * 1.15, O.step * 1.85]) {
      const ret = hits([c, crown + O.depth / 2, z], [0, 1, 0], [porch], 2)[0];
      assert.ok(ret && Math.abs(shadeIn(ret) - grade(z, 2 * O.step)) < 1e-4, `the outer order's return at x ${c.toFixed(1)}, z ${z.toFixed(2)}: ${ret && shadeIn(ret)}`);
    }
    // the outer ring's outer return over the crown, met from above, graded too
    for (const z of [O.step * 0.3, O.step * 1.7]) {
      const out = hits([c, crown + 2 * O.depth + 0.3, z], [0, -1, 0], [porch], 1)[0];
      assert.ok(out && Math.abs(shadeIn(out) - grade(z, 2 * O.step)) < 1e-4, `the outer return at x ${c.toFixed(1)}, z ${z.toFixed(2)}: ${out && shadeIn(out)}`);
    }
    for (const k of [0.5, 1.5]) {
      const face = hits([c, crown + O.depth * k, 5], [0, 0, -1], [porch])[0];
      assert.ok(face && face.face!.materialIndex === 0 && shadeAt(face) === 1, `order ${k - 0.5}'s face at x ${c.toFixed(1)} unshaded: ${face && shadeAt(face)}`);
    }
  }
  const tris = porch.geometry.getAttribute('position').count / 3;
  assert.equal(tris, 2660, `no new triangle: ${tris}`);
});

test('A3 round 2: the porch openings\' brick reveals in the front carry the great arches\' shade by day; the front\'s night returns unshaded', () => {
  const S2 = S.FRONT_ORDER_SHADE, night = [buildingNightMaterialsOf(front)!.night].flat() as THREE.MeshLambertMaterial[];
  assert.ok(!night[1]!.vertexColors, 'the night wash takes no vertex colour');
  for (const c of centres) for (const [o, d] of [[[c, spring - 1.5, -0.3], [-1, 0, 0]], [[c, spring - 1.5, -0.3], [1, 0, 0]], [[c, spring + 0.1, -0.3], [0, 1, 0]]] as const) {
    const h = hits(o as unknown as [number, number, number], d as unknown as [number, number, number], [front], 4)[0];
    assert.ok(h && h.face!.materialIndex === 1 && Math.abs(shadeAt(h) - S2) < 1e-6, `the reveal at x ${c.toFixed(1)} toward ${d}: ${h?.face?.materialIndex} ${h && shadeAt(h)}`);
  }
});

test('A3 round 2: by day each figure and barrier is the interior\'s tone at its own spot times figureDay, about 0.6 of it in display; at night as before', () => {
  const mats = infill.material as THREE.MeshLambertMaterial[], fig = mats[7]!, interior = mats[4]!;
  // re-pinned arcade round 3: the factor (a contrast floor through knots, two tones) is kx-front-arcade-round3's; here the hall's own tone and map
  assert.ok(fig.map && fig.map === interior.map, 'the figures sample the interior\'s map');
  const vec = (s: string): number[] => s.replace(/vec3\(|\)/g, '').split(',').map(Number);
  const defs = fig.defines as Record<string, string>, dark = Number((interior.defines as Record<string, string>).KX_DAY_DARK);
  const close = (a: number[], b: number[]): boolean => a.every((v, i) => Math.abs(v - b[i]!) < 2e-5);
  assert.ok(close(vec(defs.KX_FIG_DAY!), interior.color.toArray().map(v => v * dark)), `day diffuse ${defs.KX_FIG_DAY}`);
  assert.ok(close(vec(defs.KX_FIG_DAY_EMIT!), interior.emissive.toArray()), `day emissive ${defs.KX_FIG_DAY_EMIT}`);
  assert.ok(close(vec(defs.KX_FIG_NIGHT!), fig.color.toArray()), 'at night their own colour, unmapped');
  assert.ok(new THREE.Color(T.figure).equals(fig.color) && fig.emissive.equals(new THREE.Color(T.figure).multiplyScalar(T.figureLift)), 'their night colour and lift as before');
  // the shader: by day the interior's map times KX_FIG_DAY and KX_FIG_DAY_EMIT, at night their own
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
  fig.onBeforeCompile(sh, undefined as unknown as THREE.WebGLRenderer);
  assert.ok(sh.fragmentShader.includes('vec3 kxHall = texture2D( map, vMapUv ).rgb;')
    && sh.fragmentShader.includes('diffuseColor.rgb = mix( kxK * KX_FIG_DAY * kxHall, KX_FIG_NIGHT, uWinNight )')
    && sh.fragmentShader.includes('totalEmissiveRadiance = mix( kxK * KX_FIG_DAY_EMIT, totalEmissiveRadiance, uWinNight )'), 'the day tone in the shader');
  // each figure's and barrier's UV is the interior plane's behind it, so it samples the interior's tone at its own spot
  let seen = 0;
  for (const c of centres) for (const [x, y] of [[c - 0.35 * entryR, entryFoot + 0.3 + D.figure[1] * 0.5], [c + 0.55 * entryR, entryFoot + 0.3 + D.figure[1] * 0.8], [c - entryR + (0.5 * 2 * entryR) / D.barriers, entryFoot + 0.3 + D.barrier[1] * 0.4]] as const) {
    const hs = hits([x, y, 2], [0, 0, -1], [infill], 6), f = hs.find(h => h.face!.materialIndex === 7), b = hs.find(h => h.face!.materialIndex === 4);
    assert.ok(f && b && f.uv && b.uv && f.uv.distanceTo(b.uv) < 1e-3, `at x ${x.toFixed(2)}: figure uv ${f?.uv?.toArray()} against the interior's ${b?.uv?.toArray()}`);
    seen++;
  }
  assert.ok(seen >= 9);
});
