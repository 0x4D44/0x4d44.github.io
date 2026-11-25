import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { material } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
import { GROUND_Y } from '../src/world.ts';
import { DAY_EXPOSURE, NIGHT_EXPOSURE } from '../../core/daylight.ts';
import { acesFilmic, toSrgb, type V3 } from './aces.ts';
import { Glsl } from './glsl.ts';

// Arcade round 1 (A3, the lower arcade under the front canopy; bay heights, pitch and widths unchanged): the arches turned in two stepped brick orders
// down to the paving, no stone pier base; a dark-framed fanlight in each head (a transom at the springing, one centre mullion); the canopy's soffit
// lifted and its lamps linear strips; the figures and barriers a lit mid tone, not the frames' black.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const A = shed.SOUTH_FRONT_ARCADES, O = shed.PORCH_ORDERS, F = shed.PORCH_FANLIGHT, T = shed.PORCH_TONES;
const entryFoot = GROUND_Y + A.footAboveGround, entryR = A.openingWidth / 2, spring = entryFoot + A.jambHeight, crown = spring + A.archRise;
const centres = shed.southFrontArcadeCentres(4 * R, shed.TOWER_SIZE).map(x => x + layout.spine - 2 * R);
const named = (n: string): THREE.Mesh => group.getObjectByName(n) as THREE.Mesh;
const porch = named('shed-front-porch-arches'), infill = named('shed-front-infill');
const masonry = ['shed-front', 'shed-brick', 'shed-stone', 'shed-front-porch-arches'].map(named);
const first = (x: number, y: number, targets: THREE.Object3D[]): { z: number; name: string; mat: number } | null => {
  const o = group.localToWorld(new THREE.Vector3(x, y, 10)), d = new THREE.Vector3(0, 0, -1).transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(o, d, 0, 30).intersectObjects(targets, false)[0];
  return h ? { z: group.worldToLocal(h.point.clone()).z, name: h.object.name, mat: h.face?.materialIndex ?? -1 } : null;
};
const zFront = -shed.PORCH_DEPTH.glass + shed.PORCH_DEPTH.frame;
const srgb = (c: THREE.Color): number[] => { const s = c.clone().convertLinearToSRGB(); return [s.r, s.g, s.b].map(v => Math.round(v * 255)); };
const hexRgb = (h: number): number[] => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const near = (a: number[], b: number[], tol: number): boolean => a.every((v, i) => Math.abs(v - b[i]!) <= tol);

test('A3: each porch arch is turned in two brick orders, each 0.23 m on the face, the inner 0.11 m proud of the wall and the outer 0.11 m prouder, over the head and down the jambs', () => {
  assert.deepEqual([O.orders, O.depth, O.step], [2, 0.23, 0.11]);
  assert.equal((porch.material as THREE.Material[])[0], material('brickFoot'), 'the rings in the wall\'s brick');
  assert.ok(!(porch.material as THREE.Material[]).includes(material('stoneFoot')) && !(porch.material as THREE.Material[]).includes(material('stone')), 'no stone voussoirs');
  for (const c of centres) {
    for (const [y, x] of [[crown, c], [spring - 0.4, c - entryR]] as const) { // over the crown (up) and on the west jamb (out), above the plinth
      const at = (d: number): { z: number; name: string; mat: number } | null => first(x === c ? x : x - d, x === c ? y + d : y, masonry);
      const inner = at(O.depth / 2), outer = at(O.depth * 1.5), past = at(O.depth * 2 + 0.06);
      assert.ok(inner && inner.name === porch.name && inner.mat === 0 && Math.abs(inner.z - O.step) < 0.01, `inner order at ${c.toFixed(1)}: ${inner?.name} ${inner?.z.toFixed(3)}`);
      assert.ok(outer && outer.name === porch.name && outer.mat === 0 && Math.abs(outer.z - 2 * O.step) < 0.01, `outer order at ${c.toFixed(1)}: ${outer?.name} ${outer?.z.toFixed(3)}`);
      assert.ok(past && past.name !== porch.name, `no order past 2 x 0.23 m: ${past?.name} ${past?.z.toFixed(3)}`); // the wall, or the end pier's face strip by the outermost jambs
    }
  }
  const tris = porch.geometry.groups.find(g => g.materialIndex === 0)!.count / 3;
  assert.ok(tris <= 2700, `the orders ${tris} triangles in the shadow pass (the stone ring's were 2,328)`);
});

test('A3: the piers between the openings are brick down to the paving: no pale stone base', () => {
  const stone = named('shed-stone');
  for (let i = 0; i + 1 < centres.length; i++) {
    const x = (centres[i]! + centres[i + 1]!) / 2;
    if (Math.abs(x - layout.spine) < shed.TOWER_SIZE) continue; // the tower stands in front of the middle pier
    for (const y of [GROUND_Y + 0.2, GROUND_Y + 0.7, GROUND_Y + 1.3]) {
      const h = first(x, y, masonry);
      assert.ok(h && h.name !== stone.name, `the pier at x ${x.toFixed(1)}, ${(y - GROUND_Y).toFixed(1)} m up: ${h?.name}`);
    }
  }
  const pos = stone.geometry.getAttribute('position'), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const inArcade = v.x > centres[0]! - entryR && v.x < centres[centres.length - 1]! + entryR && v.z > -0.05 && v.z < 1; // inside the end piers' face strips
    assert.ok(!(inArcade && v.y < GROUND_Y + 1.5), `a stone vertex at the arcade's foot: ${v.x.toFixed(2)}, ${(v.y - GROUND_Y).toFixed(2)}`);
  }
});

test('A3: each arch head is a dark-framed fanlight: a transom at the springing and one centre mullion, bars 0.08 m, the screen\'s mullions and the doors under it', () => {
  assert.equal(F.bar, 0.08);
  const frames = (infill.material as THREE.MeshLambertMaterial[])[1]!;
  assert.ok(Math.max(...srgb(frames.color)) <= 0x33, `charcoal frames: ${srgb(frames.color)}`);
  const hit = (x: number, y: number): { z: number; mat: number } | null => first(x, y, [infill]);
  const isBar = (h: { z: number; mat: number } | null): boolean => !!h && h.mat === 1 && Math.abs(h.z - zFront) < 0.01;
  const run = (along: (t: number) => [number, number], from: number, to: number): number => {
    let n = 0;
    for (let t = from; t <= to + 1e-9; t += 0.005) if (isBar(hit(...along(t)))) n++;
    return n * 0.005;
  };
  for (const c of centres) {
    // the transom: at the springing across the opening, 0.08 m deep
    for (const dx of [-2.7, -1.4, 1.0, 2.7]) assert.ok(isBar(hit(c + dx, spring)), `the transom at the springing, x ${dx}`);
    const tw = run(t => [c + 1.0, spring + t], -0.2, 0.2);
    assert.ok(tw >= 0.07 && tw <= 0.095, `the transom ${tw.toFixed(3)} m`);
    // the centre mullion from it to the crown, the only bar in the head between them
    for (const y of [spring + 0.3, spring + 0.9, crown - 0.3]) assert.ok(isBar(hit(c, y)), `the centre mullion at ${(y - spring).toFixed(1)} m over the springing`);
    const mw = run(t => [c + t, spring + 0.5], -0.2, 0.2);
    assert.ok(mw >= 0.07 && mw <= 0.095, `the centre mullion ${mw.toFixed(3)} m`);
    let others = 0;
    for (let dx = -entryR + 0.25; dx <= entryR - 0.25; dx += 0.01) if (Math.abs(dx) > 0.1 && isBar(hit(c + dx, spring + 0.5))) others++;
    assert.equal(others, 0, 'no other bar across the head');
    // its frame round the head, on the arch line
    for (const deg of [20, 45, 70, 110, 135, 160]) {
      const t = (deg * Math.PI) / 180, h = hit(c - (entryR - F.bar / 2) * Math.cos(t), spring + (A.archRise - F.bar / 2) * Math.sin(t));
      assert.ok(isBar(h), `the head frame on the arch line at ${deg} deg: ${h?.mat} ${h?.z.toFixed(2)}`);
    }
    // the doors' leaves stop under the transom (they ran to 2.15 m, over the springing)
    const dw = (2 * entryR) / shed.PORCH_INFILL.bays;
    for (const sd of [-1, 1]) { const h = hit(c + sd * (dw / 2 - 0.06), spring + F.bar); assert.ok(!h || h.mat !== 1, `a leaf over the transom at ${sd}: ${h?.mat} ${h?.z.toFixed(2)}`); }
  }
});

test('A3: the canopy\'s soffit about #3a3f45 (its downward faces), its top and fascia the steel; the lamps linear strips about 1.2 x 0.15 m', () => {
  assert.equal(T.soffit, 0x3a3f45);
  const steel = (porch.material as THREE.MeshLambertMaterial[])[1]!;
  const def = String(steel.defines?.KX_SOFFIT ?? '');
  const m = /vec3\(([\d.]+), ([\d.]+), ([\d.]+)\)/.exec(def);
  assert.ok(m, `KX_SOFFIT: ${def}`);
  assert.ok(near(srgb(new THREE.Color(+m[1]!, +m[2]!, +m[3]!)), hexRgb(0x3a3f45), 2), `the soffit ${srgb(new THREE.Color(+m[1]!, +m[2]!, +m[3]!))}`);
  assert.ok(Math.max(...srgb(steel.color)) <= 0x30, 'the canopy\'s steel itself still charcoal');
  const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  steel.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const f = s.fragmentShader, at = f.indexOf('#ifdef KX_SOFFIT\n');
  assert.ok(at > f.indexOf('#include <emissivemap_fragment>') && at < f.indexOf('#include <lights_lambert_fragment>'), 'the soffit\'s switch before the lighting');
  assert.ok(s.vertexShader.includes('vFrontNy = normal.y;') && s.vertexShader.includes('vFrontXZ = position.xz;'));
  // round 1b (GPU: the soffit 5/5/6 by day): run the switch on the CPU, its defines substituted, for a face turned down or up, by day and at night
  let block = f.slice(at, f.indexOf('#endif\n#endif', at)).split('\n').filter(l => !l.startsWith('#')).join('\n');
  for (const k of Object.keys(steel.defines!).sort((a, b) => b.length - a.length)) block = block.split(k).join(String(steel.defines![k]));
  const g = new Glsl('');
  const run = (ny: number, x: number, z: number, night: number): { diffuse: number[]; light: V3 } => {
    const env = { vars: { diffuseColor: [0.02, 0.02, 0.02, 1], totalEmissiveRadiance: [0, 0, 0], vFrontNy: ny, vFrontXZ: [x, z], uWinNight: night } };
    g.run(block, env);
    return { diffuse: env.vars.diffuseColor as number[], light: env.vars.totalEmissiveRadiance as unknown as V3 };
  };
  const shown = (l: V3, e: number): number[] => toSrgb(acesFilmic(l, e)).map(v => Math.round(v * 255));
  const lampX = layout.spine - 2 * R + 0.9 + 5 * shed.FRONT_CANOPY.lightPitch, [rowA, rowB] = shed.FRONT_CANOPY.lightRows.map(r => r * shed.FRONT_CANOPY.depth) as [number, number];
  const midX = lampX + shed.FRONT_CANOPY.lightPitch / 2, midZ = (rowA + rowB) / 2;
  const day = shown(run(-1, midX, midZ, 0).light, DAY_EXPOSURE);
  assert.ok(day.every(v => v >= 40 && v <= 60), `by day the soffit's bounce alone shows ${day} at the clear day's exposure`);
  assert.ok(near(srgb(new THREE.Color(...run(-1, midX, midZ, 0).diffuse.slice(0, 3) as [number, number, number])), hexRgb(0x3a3f45), 2), 'its diffuse the soffit tone');
  const top = run(1, lampX, rowA, 0);
  assert.ok(top.light.every(v => v === 0) && top.diffuse[0] === 0.02, 'the top and the fascia\'s face neither tinted nor lifted');
  const away = run(-1, midX, midZ, 1).light;
  assert.ok(away.every(v => v < 1e-3), `at night away from the lamps nothing is added (the soffit as before): ${away.map(v => v.toFixed(4))}`);
  const pool = shown(run(-1, lampX + 0.3, rowB, 1).light, NIGHT_EXPOSURE), edge = shown(run(-1, lampX, rowA + 1.2, 1).light, NIGHT_EXPOSURE);
  assert.ok(pool[0]! >= 70 && pool[0]! > pool[2]! + 20, `a warm pool round a lamp at night: ${pool}`);
  assert.ok(edge[0]! < pool[0]! / 2, `falling off within about a metre: ${edge}`);
  const between = shown(run(-1, lampX + shed.FRONT_CANOPY.lightPitch / 2, rowA, 1).light, NIGHT_EXPOSURE);
  assert.ok(between[0]! < 0.7 * pool[0]!, `the pools on the lamps, darker between them: ${between}`);
  assert.ok(run(1, lampX, rowA, 1).light.every(v => v === 0), 'no pool on the canopy\'s top');
  // the lamps
  assert.deepEqual([...shed.FRONT_CANOPY.lamp], [1.2, 0.15, 0.12]);
  const grp = infill.geometry.groups.find(g => g.materialIndex === 3)!, pos = infill.geometry.getAttribute('position'), idx = infill.geometry.index;
  const row = shed.FRONT_CANOPY.depth * shed.FRONT_CANOPY.lightRows[0];
  const pts: THREE.Vector3[] = [];
  for (let i = grp.start; i < grp.start + grp.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i));
  const x0 = Math.min(...pts.filter(p => Math.abs(p.z - row) < 0.5).map(p => p.x));
  const one = new THREE.Box3().setFromPoints(pts.filter(p => Math.abs(p.z - row) < 0.5 && p.x < x0 + 1.5));
  const size = one.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 1.2) < 0.02 && Math.abs(size.y - 0.15) < 0.02 && Math.abs(size.z - 0.12) < 0.02, `a lamp ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m`);
});

test('A3: the figures and barriers behind the glass are a lit mid tone, warm after dark below the interior, not the frames\' black', () => {
  const mats = infill.material as THREE.MeshLambertMaterial[], fig = mats[7]!, frames = mats[1]!, interior = mats[4]!;
  assert.ok(fig && fig.customProgramCacheKey().includes('figures'), 'the figures\' own material, the infill\'s eighth');
  assert.ok(near(srgb(fig.color), hexRgb(T.figure), 1), `the figures ${srgb(fig.color)}`);
  const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  assert.ok(lum(fig.color) >= 2 * lum(frames.color) && lum(fig.color) <= lum(interior.color), 'lighter than the frames, no lighter than the interior');
  const dayFig = toSrgb(acesFilmic([fig.emissive.r, fig.emissive.g, fig.emissive.b], DAY_EXPOSURE)).map(v => Math.round(v * 255)); // round 1b: not black by day behind the glass
  assert.ok(Math.max(...dayFig) >= 35 && Math.max(...dayFig) <= 50, `the figures' own lift by day ${dayFig}`);
  const glow = fig.userData.nightGlow as THREE.Color, inGlow = interior.userData.nightGlow as THREE.Color;
  assert.ok(glow && lum(glow) > 0.25 * lum(inGlow) && lum(glow) < 0.75 * lum(inGlow), 'a warm glow after dark, below the interior\'s');
  const D = shed.PORCH_DEPTH;
  for (const c of centres) {
    const f = first(c - 0.35 * entryR, entryFoot + 0.3 + D.figure[1] * 0.5, [infill]);
    assert.ok(f && f.mat === 7, `a figure at x ${c.toFixed(1)}: ${f?.mat}`);
    const bx = c - entryR + (0.5 * 2 * entryR) / D.barriers, b = first(bx, entryFoot + 0.3 + D.barrier[1] * 0.4, [infill]);
    assert.ok(b && b.mat === 7, `a barrier at x ${bx.toFixed(1)}: ${b?.mat}`);
  }
});
