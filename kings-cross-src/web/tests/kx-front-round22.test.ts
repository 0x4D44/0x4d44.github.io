import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import * as shed from '../src/shed.ts';
import { GROUND_Y } from '../src/world.ts';

// Round 22 (front-piers-round-1 score, section 5): A1 the end piers as broad masses over the parapet, forward of the screen, under a cap, and the tower's
// parapet steps coped like the parapet; A2 the great arches' orders run down onto the springing course at the front's ends, and the spandrel frame reads.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const X0 = layout.spine - SHED_SPAN_WIDTH, X1 = layout.spine + SHED_SPAN_WIDTH, sp = layout.springing;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const S = shed as unknown as Record<string, unknown>;
const front = group.getObjectByName('shed-front') as THREE.Mesh;
const frontTop = Math.max(...front.geometry.getAttribute('position').array.filter((_, i) => i % 3 === 1));
const coped = frontTop + 0.3;
const masonry = ['shed-front', 'shed-brick', 'shed-stone'].map(n => group.getObjectByName(n)!);
const ray = (o: [number, number, number], d: [number, number, number]): { x: number; y: number; z: number; name: string } | null => {
  const origin = group.localToWorld(new THREE.Vector3(...o)), dir = new THREE.Vector3(...d).transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(origin, dir, 0, 40).intersectObjects(masonry, true)[0];
  if (!h) return null;
  const p = group.worldToLocal(h.point.clone());
  return { x: p.x, y: p.y, z: p.z, name: h.object.name };
};
const zAt = (x: number, y: number) => ray([x, y, 10], [0, 0, -1]);
const P = S.FRONT_PIERS as { rise: number; cap: number; step: number; stepRun: number; width: number; out: number } | undefined;

test('A1: each end pier is a mass about 5-6 m wide, 2.5-3 m over the coping under a cap, standing forward of the screen so its return reads', () => {
  assert.ok(P && P.rise >= 2.5 && P.rise <= 3.2 && P.width >= 4.5 && P.width <= 6.5 && P.out >= 0.5, 'FRONT_PIERS: a mass (ASSUMED from R-kx-front-a/b)');
  for (const sd of [-1, 1]) {
    const end = sd < 0 ? X0 : X1, y = coped + P.rise * 0.5;
    // its width over the parapet: every 0.1 m across, where a ray finds masonry at that height
    const hits: number[] = [];
    for (let x = end - 10; x <= end + 10; x += 0.1) if (zAt(x, y)) hits.push(x);
    const span = hits.length ? hits[hits.length - 1]! - hits[0]! : 0;
    assert.ok(span >= 4.5 && span <= 6.5, `the ${sd < 0 ? 'west' : 'east'} pier is ${span.toFixed(1)} m wide over the parapet`);
    const top = zAt(end + sd * 2.5, coped + P.rise - 0.2), over = zAt(end + sd * 2.5, coped + P.rise + P.cap + 0.3);
    assert.ok(top && !over, 'it rises P.rise over the coping, its cap the top');
    // the mass stands forward of the screen, from the ground up: a ray along the front, in front of the screen's face, meets its return
    for (const yy of [GROUND_Y + 2.5, sp - 3, coped + 1]) {
      const r = ray([end + sd * 12, yy, P.out / 2], [-sd, 0, 0]);
      assert.ok(r && Math.abs(r.x - (end + sd * (P.width - 1.0))) < 0.05, `its return at y ${yy.toFixed(1)}: ${r?.name} at x ${r?.x.toFixed(2)}`);
    }
    const face = zAt(end + sd * (P.width - 2.0), sp - 3);
    assert.ok(face && Math.abs(face.z - P.out) < 0.02, `its face ${face?.z.toFixed(2)} m proud of the screen`);
    // the cap overhangs the mass's face: a ray up in front of it meets the cap's soffit at the mass's top
    const up = ray([end + sd * (P.width - 2.0), coped, P.out + 0.1], [0, 1, 0]);
    assert.ok(up && up.name === 'shed-stone' && Math.abs(up.y - (coped + P.rise)) < 0.02, `a cap's soffit at ${up?.y.toFixed(2)}`);
  }
});

test('A1: the parapet\'s step either side of the tower is coped like the parapet, 0.3 m deep and 0.4 m proud', () => {
  assert.ok(P);
  for (const sd of [-1, 1]) {
    const x = layout.spine + sd * (shed.TOWER_SIZE / 2 + P.stepRun / 2);
    const down = ray([x, coped + 5, 0.3], [0, -1, 0]);
    assert.ok(down && down.name === 'shed-stone' && Math.abs(down.y - (coped + P.step + 0.3)) < 0.02, `the step's coping at ${down?.y.toFixed(2)}, 0.3 m in front of the screen`);
    const under = ray([x, coped + P.step - 0.05, 0.3], [0, 1, 0]);
    assert.ok(under && Math.abs(under.y - (coped + P.step)) < 0.02, 'with a soffit over the step\'s face');
  }
});

test('A2: at the front\'s ends each order of the great arch runs down onto the springing course, standing on the impost', () => {
  const F = shed.FRONT_RELIEF;
  for (const sd of [-1, 1]) {
    const end = sd < 0 ? X0 : X1;
    for (let i = 0; i < F.orders; i++) {
      const x = end + sd * (i + 0.5) * F.orderWidth;
      const foot = zAt(x, sp + F.impost.height + 0.15);
      assert.ok(foot && foot.name === 'shed-front' && Math.abs(foot.z - (i + 1) * F.orderStep) < 0.02, `order ${i}'s foot at x ${x.toFixed(2)}: ${foot?.name} ${foot?.z.toFixed(2)}`);
      const imp = zAt(x, sp + F.impost.height / 2);
      assert.ok(imp && imp.name === 'shed-stone' && imp.z > (i + 1) * F.orderStep, 'on the impost');
      const course = zAt(x, sp - F.springing.height / 2);
      assert.ok(course && Math.abs(course.z - F.springing.out) < 0.02, 'and the springing course under it');
    }
  }
});

test('A2: the spandrel\'s frame stands at least 0.25 m proud of its panel, so its shadow line reads square-on', () => {
  const T = S.FRONT_TYMPANUM as { out: number; band: number };
  const yBandMid = frontTop - 0.9 - 0.25 - 0.25 - 0.1 - T.band / 2;
  for (const xa of [X0 + 1.0, layout.spine + shed.TOWER_SIZE / 2]) {
    const band = zAt(xa + 2.5, yBandMid), panel = zAt(xa + 2.5, yBandMid - T.band / 2 - 1.0);
    assert.ok(band && panel && band.z - panel.z >= 0.25, `the band ${band?.z.toFixed(2)} over the panel ${panel?.z.toFixed(2)}`);
  }
});

test('A3: the concourse behind each porch\'s glass grows brighter from its floor to the figures\' heads, and is darker at its ceiling', () => {
  const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh;
  const mats = infill.material as THREE.MeshLambertMaterial[], interior = mats[4]!;
  const map = interior.map as THREE.DataTexture | null;
  assert.ok(map, 'the interior plane carries a gradient map');
  const { data, height } = map.image as { data: Uint8Array; height: number };
  // re-pinned round 26 (front-round-5 score, A3: the openings did not read as voids): the map two-dimensional, darker at its sides and over its top
  // (PORCH_DEPTH.vignette), so its centre column is read here, rising to 0.85 of its height (the figures' heads) and darker above
  const w = (map.image as { width: number }).width, at = (row: number): number => data[(row * w + Math.floor(w / 2)) * 4]! / 255, head = Math.floor(0.85 * (height - 1));
  assert.ok(at(head) - at(0) >= 0.2 && at(head) >= 0.9, // re-pinned round 23: the foot lightened from 0.5 to 0.75, which dimmed the figures (score fp2)
    `darker at its floor (${at(0).toFixed(2)}) than at the figures' heads (${at(head).toFixed(2)})`);
  for (let i = 1; i <= head; i++) assert.ok(at(i) >= at(i - 1), 'rising up to the figures\' heads');
  assert.ok(at(height - 1) < at(head), 'and darker at its ceiling');
  // the plane's v runs from its foot (0) to its top (1), so the map's rows run up it
  const g = infill.geometry, grp = g.groups.find(q => q.materialIndex === 4)!, idx = g.index, pos = g.getAttribute('position'), uv = g.getAttribute('uv');
  let lowV = 0, highV = 0, lowY = Infinity, highY = -Infinity;
  for (let k = grp.start; k < grp.start + grp.count; k++) {
    const v = idx ? idx.getX(k) : k, y = pos.getY(v);
    if (y < lowY) { lowY = y; lowV = uv.getY(v); }
    if (y > highY) { highY = y; highV = uv.getY(v); }
  }
  assert.ok(lowV < 0.01 && highV > 0.99, `v ${lowV} at its foot, ${highV} at its top`);
});
