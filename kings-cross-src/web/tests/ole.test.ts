// The OLE on the real OSM data: every King's Cross track in the zone is wired, no mast stands on a
// rail or under the shed, nothing pokes through the roof or the tunnel crown, and the cost stays
// within the brief's budget (<= 6 draw calls, <= 60k triangles). Plus the wire level of detail.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { railShapes, shapeFrom } from '../../core/curves.ts';
import type { Pt } from '../../core/geo.ts';
import type { KxData } from '../../core/osm.ts';
import { tunnelMouths } from '../../core/landmarks.ts';
import { distanceToSegment, OLE } from '../../core/ole.ts';
import type { OlePlan } from '../../core/ole.ts';
import { shedLayout, worldToShed } from '../../core/station.ts';
import { shedRoofY } from '../src/furniture.ts';
import { buildOle, memberTriangles, wireAlpha } from '../src/ole.ts';
import { inStationZone } from '../src/track.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const mouths = tunnelMouths(data);
const ole = buildOle(data, layout, mouths.map(m => m.origin));
const plan = ole.userData.plan as OlePlan;
const pos = new Map<number, Pt>(data.nodes.map(([id, x, z]) => [id, [x, z] as Pt]));
// the track as drawn and run on: every surface segment's curve (core/curves.ts), as its pieces
const shapes = railShapes(data);
const curveOf = (a: number, b: number): Pt[] => shapeFrom(shapes, a, b)!;
const surface = data.rails.filter(r => !r.tunnel).flatMap(r => r.nodes.slice(1).flatMap((n, i) => {
  const c = curveOf(r.nodes[i]!, n);
  return c.slice(1).map((q, k) => [c[k]!, q] as [Pt, Pt]);
}));
const wires = Array.from({ length: plan.wires.length / 6 }, (_, i) => plan.wires.slice(i * 6, i * 6 + 6));

test('ole (real data): two draw calls, within 60k triangles and 6 draws', () => {
  assert.deepEqual(ole.children.map(c => c.name), ['ole-steel', 'ole-wires']);
  assert.equal(ole.userData.drawCalls, 2);
  assert.ok(ole.userData.triangles > 1000 && ole.userData.triangles <= 60000, `${ole.userData.triangles} triangles`);
  const steel = ole.getObjectByName('ole-steel') as THREE.Mesh;
  assert.equal(steel.geometry.getAttribute('position').count / 3, ole.userData.triangles);
  assert.equal(ole.userData.triangles, plan.members.length * 12);
});

test('ole (real data): every in-zone electrified surface segment carries a contact wire within the stagger of its centre line', () => {
  // sampled on the curved centre line the rails are drawn on, at every joint of its pieces and a quarter, half and three quarters along
  let checked = 0;
  for (const r of data.rails) {
    if (r.tunnel || r.electrified !== 'contact_line') continue;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = pos.get(r.nodes[i]!)!, b = pos.get(r.nodes[i + 1]!)!;
      if (!inStationZone(layout, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
      const curve = curveOf(r.nodes[i]!, r.nodes[i + 1]!);
      const total = curve.slice(1).reduce((sum, q, k) => sum + Math.hypot(q[0] - curve[k]![0], q[1] - curve[k]![1]), 0);
      const at = (f: number): Pt => { // the point a share f of the way along the curve
        let left = f * total;
        for (let k = 0; k + 1 < curve.length; k++) {
          const p = curve[k]!, q = curve[k + 1]!, l = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (left <= l) return [p[0] + (q[0] - p[0]) * left / l, p[1] + (q[1] - p[1]) * left / l];
          left -= l;
        }
        return curve.at(-1)!;
      };
      const samples = [...curve.slice(1, -1), ...[0.25, 0.5, 0.75].map(at)];
      for (const p of samples) {
        const near = wires.some(w => w[1] === OLE.contactHeight && w[4] === OLE.contactHeight && distanceToSegment(p, [w[0]!, w[2]!], [w[3]!, w[5]!]) <= OLE.stagger + 1e-6);
        assert.ok(near, `no contact wire over ${r.id} at ${p}`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 131 * 3, `${checked} samples`);
});

test('ole (real data): no mast stands on or within the clearance of any rail, and none stands under the shed roof', () => {
  const masts = plan.lines.flatMap(l => l.masts);
  assert.ok(masts.length >= 15, `${masts.length} masts`);
  for (const p of masts) {
    const d = Math.min(...surface.map(([a, b]) => distanceToSegment(p, a, b)));
    assert.ok(d >= OLE.mastClearance - 1e-9, `mast at ${p} is ${d.toFixed(2)} m from a rail`);
    const { u, v } = worldToShed(layout, p);
    assert.ok(!(u >= 0 && u <= layout.width && v >= 0 && v <= layout.length), `mast under the shed at u ${u.toFixed(1)}, v ${v.toFixed(1)}`);
  }
  for (const s of data.signals) for (const p of masts) assert.ok(Math.hypot(p[0] - s.x, p[1] - s.z) >= 1.5);
});

test('ole (real data): under the shed every wire and member stays under the roof; at the Gasworks mouth the catenary passes under the crown', () => {
  let under = 0;
  const points = [...wires.flatMap(w => [[w[0]!, w[1]!, w[2]!], [w[3]!, w[4]!, w[5]!]]), ...plan.members.filter(m => m.kind !== 'tube').flatMap(m => [m.a, m.b])];
  for (const [x, y, z] of points) {
    const { u, v } = worldToShed(layout, [x!, z!]);
    if (u < 0 || u > layout.width || v <= 0 || v >= layout.length) continue;
    under++;
    assert.ok(y! <= shedRoofY(layout, u) - OLE.roofClearance + 1e-6, `${y} m under a ${shedRoofY(layout, u)} m roof at u ${u}`);
  }
  assert.ok(under > 500);
  const south = mouths.find(m => m.id === 'gasworks-south')!;
  let atMouth = 0;
  for (const [x, y, z] of wires.flatMap(w => [[w[0]!, w[1]!, w[2]!], [w[3]!, w[4]!, w[5]!]])) {
    if (Math.hypot(x! - south.origin[0], z! - south.origin[1]) > south.halfWidth) continue;
    atMouth++;
    assert.ok(y! <= OLE.contactHeight + OLE.minSystemHeight + 0.2, `${y} m at the mouth (crown 6.2 m)`);
  }
  assert.ok(atMouth > 0, 'wires reach the mouth');
});

test('ole (real data): the shed carries a cross-span over its arches at every support line, and the wire mesh draws them with the wires', () => {
  const shedLines = plan.lines.filter(l => l.inShed);
  assert.ok(shedLines.length >= 3, `${shedLines.length} support lines under the shed`);
  assert.ok(plan.spanCounts.crossSpans >= shedLines.length, 'at least one arch carries a cross-span at each shed line');
  assert.ok(plan.spanCounts.hangers >= plan.spanCounts.crossSpans, 'every cross-span has a hanger');
  const lines = ole.getObjectByName('ole-wires') as THREE.LineSegments;
  assert.equal(lines.geometry.getAttribute('position').count, (plan.wires.length + plan.spans.length) / 3, 'the cross-spans and hangers are drawn with the wires');
  assert.equal(ole.userData.wireSegments, (plan.wires.length + plan.spans.length) / 6);
});

test('ole (real data): every support line holds every wire that crosses it', () => {
  assert.ok(plan.lines.length >= 9);
  for (const l of plan.lines) {
    for (const c of l.crossings) {
      assert.equal(plan.members.filter(m => m.kind === 'arm' && Math.hypot(m.a[0] - c.wx, m.a[2] - c.wz) < 1e-9).length, 1, `v ${l.v} u ${c.u}`);
    }
  }
});

test('wire level of detail: solid within a few metres, fading with distance, gone far off; members are closed boxes', () => {
  const fov = (60 * Math.PI) / 180;
  assert.equal(wireAlpha(5, fov, 1080), 1);
  assert.ok(wireAlpha(150, fov, 1080) < 1 && wireAlpha(150, fov, 1080) > 0.3);
  assert.ok(wireAlpha(1500, fov, 1080) < 0.1);
  for (let d = 1; d < 1000; d *= 1.5) assert.ok(wireAlpha(d * 1.5, fov, 1080) <= wireAlpha(d, fov, 1080));
  // a pixel is the screen height divided into the view: half the pixels, half the coverage
  assert.ok(Math.abs(wireAlpha(150, fov, 540) * 2 - wireAlpha(150, fov, 1080)) < 1e-9);
  const out: number[] = [];
  memberTriangles({ a: [0, 0, 0], b: [0, 5, 0], size: 0.3, kind: 'mast' }, out);
  assert.equal(out.length, 12 * 9);
  const xs = out.filter((_, i) => i % 3 === 0), ys = out.filter((_, i) => i % 3 === 1), zs = out.filter((_, i) => i % 3 === 2);
  assert.ok(Math.abs(Math.max(...xs) - 0.15) < 1e-9 && Math.abs(Math.min(...ys)) < 1e-9 && Math.abs(Math.max(...ys) - 5) < 1e-9);
  assert.ok(Math.abs(Math.min(...xs) + 0.15) < 1e-9 && Math.abs(Math.max(...zs) - 0.15) < 1e-9 && Math.abs(Math.min(...zs) + 0.15) < 1e-9, 'a square section, size wide each way');
});
