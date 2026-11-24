import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import * as shed from '../src/shed.ts';
import { GROUND_Y } from '../src/world.ts';

// Round 23 (front-piers-round-2 score, section 5): A3 deeper, darker reveal returns, a lit soffit over each opening's head and a lighter interior foot;
// A1 the piers' caps as stepped cornices, the screen's cornice stopping at the piers' masses; A2 the spandrel frame's painted shadow line, and a
// string course across the piers' masses at the springing.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const X0 = layout.spine - SHED_SPAN_WIDTH, X1 = layout.spine + SHED_SPAN_WIDTH, FW = 2 * SHED_SPAN_WIDTH, sp = layout.springing;
const bay = (FW - shed.TOWER_SIZE) / 6;
const doors = [...[0, 1, 2].map(i => X0 + (i + 0.5) * bay), ...[2, 1, 0].map(i => X0 + FW - (i + 0.5) * bay)];
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const S = shed as unknown as Record<string, unknown>;
const front = group.getObjectByName('shed-front') as THREE.Mesh;
const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh;
const frontTop = Math.max(...front.geometry.getAttribute('position').array.filter((_, i) => i % 3 === 1));
const coped = frontTop + 0.3;
const masonry = ['shed-front', 'shed-brick', 'shed-stone'].map(n => group.getObjectByName(n)!);
const ray = (o: [number, number, number], d: [number, number, number], targets: THREE.Object3D[]): { x: number; y: number; z: number; name: string; mat: number } | null => {
  const origin = group.localToWorld(new THREE.Vector3(...o)), dir = new THREE.Vector3(...d).transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(origin, dir, 0, 40).intersectObjects(targets, true)[0];
  if (!h) return null;
  const p = group.worldToLocal(h.point.clone());
  return { x: p.x, y: p.y, z: p.z, name: h.object.name, mat: h.face?.materialIndex ?? -1 };
};
const zAt = (x: number, y: number) => ray([x, y, 10], [0, 0, -1], masonry);
const D = S.PORCH_DEPTH as { glass: number; gradient: readonly [number, number] };
const P = S.FRONT_PIERS as { rise: number; cap: number; width: number; out: number };
const entryFoot = GROUND_Y + shed.SOUTH_FRONT_ARCADES.footAboveGround, entryR = shed.SOUTH_FRONT_ARCADES.openingWidth / 2;

test('A3: each opening\'s glass stands 0.7 m or more back, its reveal\'s dark returns running all the way to it', () => {
  assert.ok(D.glass >= 0.7 && D.glass <= 0.9, `PORCH_DEPTH.glass ${D.glass}`);
  for (const x of doors) for (const sd of [-1, 1]) {
    const r = ray([x, entryFoot + 1.0, -D.glass + 0.32], [sd, 0, 0], [infill]); // just in front of the jambs' frames, 0.3 m deep
    assert.ok(r && Math.abs(Math.abs(r.x - x) - entryR) < 0.05 && r.mat === 1, `the ${sd > 0 ? 'east' : 'west'} return dark near the glass (${r?.name} ${r?.mat} at ${r?.x.toFixed(2)})`);
  }
});

test('A3: a pale soffit, glowing warm by night, closes each opening\'s head over the glass behind the fascia', () => {
  const mats = infill.material as THREE.MeshLambertMaterial[];
  const soffit = mats[5];
  assert.ok(soffit, 'a sixth material, the soffits\'');
  const hsl = { h: 0, s: 0, l: 0 };
  soffit.color.getHSL(hsl);
  assert.ok(hsl.l > 0.6, `pale (${hsl.l.toFixed(2)})`);
  assert.ok(typeof soffit.onBeforeCompile === 'function' && soffit.customProgramCacheKey().includes('soffit'), 'with its own night glow');
  for (const x of doors) {
    const up = ray([x + 0.3, entryFoot + 2.9, -0.5], [0, 1, 0], [infill]);
    assert.ok(up && up.mat === 5 && Math.abs(up.y - (GROUND_Y + shed.FRONT_CANOPY.top - shed.FRONT_CANOPY.sheet - 0.02 - shed.PORCH_INFILL.sign)) < 0.02, `the soffit over x ${x.toFixed(1)}: ${up?.mat} at ${up?.y.toFixed(2)}`);
  }
});

test('A3: the interior\'s foot is light enough for the figures to read against it', () => {
  assert.ok(D.gradient[0] >= 0.7 && D.gradient[1] - D.gradient[0] >= 0.2, `gradient ${D.gradient}`);
});

test('A1: each pier\'s cap is a plain stone coping 0.3-0.5 m deep overhanging the mass 0.2-0.3 m', () => {
  // re-pinned round 23b (front-piers-round-3 score, section 5: the round-23 three-tier cornice read too grand; R-kx-front-a/b show a plain coping, ASSUMED)
  assert.ok(P.cap >= 0.3 && P.cap <= 0.5, `cap ${P.cap}`);
  const top = coped + P.rise;
  for (const sd of [-1, 1]) {
    const x = (sd < 0 ? X0 : X1) + sd * 2.5;
    assert.ok(zAt(x, top + P.cap - 0.05) && !zAt(x, top + P.cap + 0.05), 'its top P.cap over the mass');
    const under = ray([x, coped, P.out + 0.15], [0, 1, 0], masonry), past = ray([x, coped, P.out + 0.35], [0, 1, 0], masonry);
    assert.ok(under && under.name === 'shed-stone' && Math.abs(under.y - top) < 0.02, `its soffit at ${under?.y.toFixed(2)}, 0.15 m in front of the mass`);
    assert.ok(!past, 'and nothing overhangs 0.35 m out');
  }
});

test('A1: the screen\'s cornice and corona end inside the piers\' masses; A2: a string course runs across them at the springing, proud of the mass', () => {
  const F = shed.FRONT_RELIEF;
  for (const sd of [-1, 1]) {
    const end = sd < 0 ? X0 : X1, x = end + sd * (P.width - 2.0);
    const c = zAt(x, frontTop - 0.45);
    assert.ok(c && Math.abs(c.z - P.out) < 0.02, `the mass's face at the cornice's height (${c?.z.toFixed(2)})`);
    // just inside the mass's inner side, where the corona's end is: the mass's face is foremost, so no end face shows in front of it
    for (const y of [frontTop - F.corona.height / 2, frontTop - 0.45]) {
      const h = zAt(end + sd * (1.2 + 0.05), y);
      assert.ok(h && Math.abs(h.z - P.out) < 0.02, `the mass's face, not the cornice's end, at y ${y.toFixed(2)}: ${h?.z.toFixed(2)}`);
    }
    const s = zAt(x, sp - 0.3), above = zAt(x, sp + 1.5);
    assert.ok(s && above && s.name === 'shed-stone' && s.z - above.z >= 0.15 && s.z >= F.springing.out + 0.15, `a stone string ${s?.z.toFixed(2)} over the mass ${above?.z.toFixed(2)}`);
  }
});

test('A2: the spandrel frame\'s shadow line is the band\'s own: it stands 0.45 m or more proud with a soffit, and nothing is painted on the panel', () => {
  const T = S.FRONT_TYMPANUM as { out: number; band: number; strip: number };
  assert.ok(T.out >= 0.45 && T.out <= 0.6, `FRONT_TYMPANUM.out ${T.out}`);
  const yBand = frontTop - 0.9 - 0.25 - 0.25 - 0.1 - T.band;
  for (const [xa, xb] of [[X0 + 1.0, layout.spine - shed.TOWER_SIZE / 2], [layout.spine + shed.TOWER_SIZE / 2, X1 - 1.0]] as const) {
    const soffit = ray([xa + 2.5, yBand - 1.0, T.out - 0.05], [0, 1, 0], masonry);
    assert.ok(soffit && Math.abs(soffit.y - yBand) < 0.02, `the band's soffit at ${soffit?.y.toFixed(2)}`);
    for (const [x, y] of [[xa + 2.5, yBand - 0.15], [xa + T.strip + 0.15, yBand - 1.0], [xb - T.strip - 0.15, yBand - 1.0]] as const) {
      const h = ray([x, y, 10], [0, 0, -1], [...masonry, infill]);
      assert.ok(h && h.name !== 'shed-front-infill', `the panel's brick at x ${x.toFixed(1)}, not a painted line (${h?.name})`);
    }
  }
});

test('A3: a porch-close camera at eye height under the canopy sees one opening\'s soffit, sign band, doors and reveal', () => {
  const cams = JSON.parse(readFileSync(new URL('../../tools/tests/frozen-station-cameras.json', import.meta.url), 'utf8')) as Record<string, { pos: number[]; target: number[]; fov?: number }>;
  const cam = cams['porch-close'];
  assert.ok(cam, 'porch-close is frozen');
  const eye = group.worldToLocal(new THREE.Vector3(...cam.pos)), aim = group.worldToLocal(new THREE.Vector3(...cam.target));
  assert.ok(Math.abs(eye.y - (GROUND_Y + 1.7)) < 0.05 && eye.z > 2 && eye.z < shed.FRONT_CANOPY.depth, `eye 1.7 m up, under the canopy (${eye.z.toFixed(2)} m out)`);
  const x = doors[1]!, s0 = GROUND_Y + shed.FRONT_CANOPY.top - shed.FRONT_CANOPY.sheet - 0.02 - shed.PORCH_INFILL.sign;
  assert.ok(Math.abs(aim.x - x) < 0.5, 'aimed at the middle opening under the west great arch');
  const lens = new THREE.PerspectiveCamera(cam.fov ?? 50, 1.6, 0.1, 100);
  lens.position.copy(eye); lens.lookAt(aim); lens.updateMatrixWorld(true);
  const all: THREE.Object3D[] = []; group.traverse(o => { if ((o as THREE.Mesh).isMesh) all.push(o); });
  const sees = (p: THREE.Vector3, name: string, mat?: number): void => {
    const ndc = p.clone().project(lens);
    assert.ok(Math.abs(ndc.x) < 0.95 && Math.abs(ndc.y) < 0.95 && ndc.z < 1, `${name} in frame (${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)})`);
    const we = group.localToWorld(eye.clone()), d = group.localToWorld(p.clone()).sub(we), h = new THREE.Raycaster(we, d.clone().normalize(), 0, d.length() + 0.05).intersectObjects(all, true)[0];
    assert.ok(h && h.object.name === 'shed-front-infill' && (mat === undefined || h.face?.materialIndex === mat) && h.distance > d.length() - 0.05, `${name} is not hidden (${h?.object.name} ${h?.face?.materialIndex} at ${h?.distance.toFixed(2)} of ${d.length().toFixed(2)})`);
  };
  sees(new THREE.Vector3(x + 0.3, s0 - 0.004, -0.5), 'the head soffit', 5);
  sees(new THREE.Vector3(x + 0.8, (s0 + s0 + shed.PORCH_INFILL.sign) / 2, -0.15), 'the sign band', 2);
  sees(new THREE.Vector3(x, entryFoot + 1.6, -D.glass + 0.145), 'the doors\' meeting stile', 1);
  sees(new THREE.Vector3(x + entryR - 0.003, entryFoot + 1.2, -D.glass / 2), 'the east reveal\'s dark return', 1);
});
