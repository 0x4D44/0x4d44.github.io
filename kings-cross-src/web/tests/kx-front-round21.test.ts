import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import * as shed from '../src/shed.ts';
import { GROUND_Y } from '../src/world.ts';

// Round 21 (front-infill-round-1 score, section 5): A2 the great arches' spandrels as framed recessed panels; A1 the end piers rising over the parapet
// under caps, and the parapet's step at the tower; A3 figures and dark reveal returns in the porch openings.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2, X0 = layout.spine - SHED_SPAN_WIDTH, X1 = layout.spine + SHED_SPAN_WIDTH, FW = 2 * SHED_SPAN_WIDTH;
const bay = (FW - shed.TOWER_SIZE) / 6;
const doors = [...[0, 1, 2].map(i => X0 + (i + 0.5) * bay), ...[2, 1, 0].map(i => X0 + FW - (i + 0.5) * bay)];
const foot = GROUND_Y + 0.2;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const S = shed as unknown as Record<string, unknown>;
const front = group.getObjectByName('shed-front') as THREE.Mesh;
const frontTop = Math.max(...front.geometry.getAttribute('position').array.filter((_, i) => i % 3 === 1));
const ray = (o: [number, number, number], d: [number, number, number], targets: THREE.Object3D[], mats?: number[]): { z: number; x: number; name: string } | null => {
  const origin = group.localToWorld(new THREE.Vector3(...o)), dir = new THREE.Vector3(...d).transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(origin, dir, 0, 30).intersectObjects(targets, true).find(q => !mats || mats.includes(q.face?.materialIndex ?? -1));
  if (!h) return null;
  const p = group.worldToLocal(h.point.clone());
  return { z: p.z, x: p.x, name: h.object.name };
};
const masonry = ['shed-front', 'shed-brick', 'shed-stone'].map(n => group.getObjectByName(n)!);
const zAt = (x: number, y: number) => ray([x, y, 10], [0, 0, -1], masonry);

test('A2: each great arch\'s spandrel is a recessed panel in a brick frame 0.1-0.6 m proud: a band under the cornice and strips at its sides', () => {
  const T = S.FRONT_TYMPANUM as { out: number; band: number; strip: number; recess?: number } | undefined;
  const deep = (T?.out ?? 0) + (T?.recess ?? 0); // re-pinned round 24: the panel itself recessed `recess` behind the wall's face (A2), so the frame stands out + recess over it
  assert.ok(T && T.out >= 0.1 && T.out <= 0.6, 'FRONT_TYMPANUM, 0.1 to 0.6 m'); // re-pinned round 22: 0.15 m read about 1 px square-on, so A2 asked for about 2 px (0.3 m); round 23b: 0.5 m, its own soffit the shadow line (the painted one was black at night)
  const yBandMid = frontTop - 0.9 - 0.25 - 0.25 - 0.1 - T.band / 2;
  for (const [xa, xb] of [[X0 + 1.0, layout.spine - shed.TOWER_SIZE / 2], [layout.spine + shed.TOWER_SIZE / 2, X1 - 1.0]] as const) {
    const xm = xa + 2.5; // over the outer order's foot: the plain spandrel
    const band = zAt(xm, yBandMid), panel = zAt(xm, yBandMid - T.band / 2 - 1.0);
    assert.ok(band && panel && Math.abs(band.z - panel.z - deep) < 0.02, `the band ${band?.z.toFixed(2)} over the panel ${panel?.z.toFixed(2)}`);
    for (const x of [xa + T.strip / 2, xb - T.strip / 2]) {
      const s = zAt(x, yBandMid - T.band / 2 - 0.5), beside = zAt(x + (x < (xa + xb) / 2 ? 1 : -1) * (T.strip + 0.3), yBandMid - T.band / 2 - 0.5);
      assert.ok(s && beside && Math.abs(s.z - beside.z - deep) < 0.02, `a side strip at x ${x.toFixed(1)}: ${s?.z.toFixed(2)} against ${beside?.z.toFixed(2)}`);
    }
  }
});

test('A1: the end piers rise over the parapet\'s coping under caps, and the parapet steps up either side of the tower', () => {
  const P = S.FRONT_PIERS as { rise: number; step: number; stepRun: number } | undefined;
  assert.ok(P && P.rise >= 0.8 && P.rise <= 3.5 && P.step >= 0.3 && P.step <= 1.0, 'FRONT_PIERS'); // re-pinned round 22: the piers as masses, 2.5-3 m over the coping (A1)
  const coped = frontTop + 0.3;
  for (const x of [X0 + 0.5, X1 - 0.5]) {
    const h = zAt(x, coped + P.rise * 0.7);
    assert.ok(h && h.z > -0.1, `the end pier at x ${x.toFixed(1)} stands over the parapet (${h?.z.toFixed(2)})`);
    assert.equal(zAt(x + (x < layout.spine ? 3 : -3), coped + P.rise * 0.7)?.z ?? null, null, 'and the parapet beside it does not reach that high');
  }
  for (const sd of [-1, 1]) {
    const by = zAt(layout.spine + sd * (shed.TOWER_SIZE / 2 + P.stepRun / 2), coped + P.step / 2);
    const away = zAt(layout.spine + sd * (shed.TOWER_SIZE / 2 + 6), coped + P.step / 2); // a short step at the tower (R-kx-front-a), not the whole parapet
    assert.ok(by && by.z > -1.3, `the step at the tower's ${sd > 0 ? 'east' : 'west'} side`);
    assert.ok(!away || away.z < -1.3, 'and beyond it the parapet is at its own height');
  }
});

test('A3: each porch opening shows figures deeper in, and its reveal\'s returns are dark down to the glass', () => {
  const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh;
  const D = S.PORCH_DEPTH as { glass: number; figures: number; figure: readonly [number, number] };
  assert.ok(D.figures >= 1 && D.figures <= 2, 'one or two figures an opening');
  for (const x of doors) {
    const fig = ray([x - 0.35 * 3.4, foot + 0.3 + D.figure[1] * 0.85, 10], [0, 0, -1], [infill], [7]); // re-pinned arcade round 1: the figures' own mid tone (PORCH_TONES), the infill's eighth material
    assert.ok(fig && Math.abs(fig.z + D.glass) < 0.02, `a figure on the plane at x ${x.toFixed(1)}`);
    for (const sd of [-1, 1]) {
      const r = ray([x, foot + 1.0, -0.08], [sd, 0, 0], [infill]); // between the face and the frames' fronts
      assert.ok(r && Math.abs(Math.abs(r.x - x) - 3.4) < 0.05 && r.name === 'shed-front-infill', `the ${sd > 0 ? 'east' : 'west'} return dark (${r?.name} at ${r?.x.toFixed(2)})`);
    }
  }
});
