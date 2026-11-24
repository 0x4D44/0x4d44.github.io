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

test('A1: each pier\'s cap is a stepped stone cornice about 0.9 m deep, its corona overhanging 0.5 m', () => {
  assert.ok(P.cap >= 0.8 && P.cap <= 1.0, `cap ${P.cap}`);
  const top = coped + P.rise;
  for (const sd of [-1, 1]) {
    const x = (sd < 0 ? X0 : X1) + sd * 2.5;
    assert.ok(zAt(x, top + P.cap - 0.05) && !zAt(x, top + P.cap + 0.05), 'its top P.cap over the mass');
    const bed = ray([x, coped, P.out + 0.1], [0, 1, 0], masonry), corona = ray([x, coped, P.out + 0.4], [0, 1, 0], masonry);
    assert.ok(bed && Math.abs(bed.y - top) < 0.02, `a bed course's soffit at ${bed?.y.toFixed(2)}`);
    assert.ok(corona && corona.name === 'shed-stone' && corona.y > top + 0.2 && corona.y < top + 0.4, `the corona's soffit higher, at ${corona?.y.toFixed(2)}`);
    const down = ray([x, top + 5, P.out + 0.4], [0, -1, 0], masonry);
    assert.ok(down && down.y < top + P.cap - 0.2, `and the blocking course set back over it (${down?.y.toFixed(2)})`);
  }
});

test('A1: the screen\'s cornice stops at the piers\' masses; A2: a string course runs across them at the springing', () => {
  for (const sd of [-1, 1]) {
    const x = (sd < 0 ? X0 : X1) + sd * (P.width - 2.0);
    const c = zAt(x, frontTop - 0.45);
    assert.ok(c && Math.abs(c.z - P.out) < 0.02, `the mass's face at the cornice's height (${c?.z.toFixed(2)})`);
    const s = zAt(x, sp - 0.6), above = zAt(x, sp + 1.5);
    assert.ok(s && above && s.name === 'shed-stone' && s.z - above.z >= 0.15, `a stone string ${s?.z.toFixed(2)} over the mass ${above?.z.toFixed(2)}`);
  }
});

test('A2: the spandrel frame\'s shadow line is dark: a strip on the panel under the band and inside each side strip', () => {
  const T = S.FRONT_TYMPANUM as { band: number; strip: number; shade: number };
  const yBand = frontTop - 0.9 - 0.25 - 0.25 - 0.1 - T.band;
  for (const [xa, xb] of [[X0 + 1.0, layout.spine - shed.TOWER_SIZE / 2], [layout.spine + shed.TOWER_SIZE / 2, X1 - 1.0]] as const) {
    const under = ray([xa + 2.5, yBand - T.shade / 2, 10], [0, 0, -1], [...masonry, infill]);
    assert.ok(under && under.name === 'shed-front-infill' && under.mat === 1, `under the band: ${under?.name}`);
    const lower = ray([xa + 2.5, yBand - T.shade - 0.3, 10], [0, 0, -1], [...masonry, infill]);
    assert.ok(lower && lower.name !== 'shed-front-infill', 'and the panel itself below it');
    for (const x of [xa + T.strip + T.shade / 2, xb - T.strip - T.shade / 2]) {
      const side = ray([x, yBand - 1.0, 10], [0, 0, -1], [...masonry, infill]);
      assert.ok(side && side.name === 'shed-front-infill', `inside the side strip at x ${x.toFixed(1)}: ${side?.name}`);
    }
  }
});
