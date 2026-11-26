// Shed interior B6, round 2 (b6-round-1 score, section 5). (1) One roof: canopy 9 across the 9-10 track, over canopy 10 and the outer track to the wall,
// trusses bearing on paired columns just in front of the wall with knee braces; from suburban-p9-south no sky between the canopies and the Platform 37
// landscraper hidden above the wall. (2) The wall reaches the roof plane. (3) A dark plinth, deeper pilasters with shaded sides. (4) After dark canopy
// 10's pendants wash the wall. And the north end turns in a return. No new shadow caster, no new draw: the roof's sheet joins canopy-steel's sheet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { landscraperPlan } from '../../core/kxcentral.ts';
import { tunnelMouths } from '../../core/landmarks.ts';
import { olePlan } from '../../core/ole.ts';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
// @ts-expect-error the evidence tool is plain JavaScript
import { stationCameras } from '../../tools/evidence.mjs';
import * as furniture from '../src/furniture.ts';
import { SHADOW_CASTERS } from '../src/lighting.ts';
import { material } from '../src/materials.ts';
import { inStationZone } from '../src/track.ts';
import { GROUND_Y } from '../src/world.ts';

type Pt = [number, number];
type Cam = { pos: number[]; target: number[]; fov?: number };
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const F = furniture as unknown as Record<string, unknown>;
const group = furniture.buildFurniture(data, layout);
const plan = group.userData.plan as furniture.FurniturePlan;
type WallPlan = { face: Pt[]; back: Pt[]; ts: number[]; edge: Pt[]; inner: Pt[]; ret: { at: number; dir: Pt }; y0: number; y1: number };
const w = (F.suburbanWallPlan as (p: unknown) => WallPlan)(plan);
const W = F.SUBURBAN_WALL as Record<string, number>;
const wall = (F.buildSuburbanWall as (p: unknown) => THREE.Mesh)(plan);
const part = (name: string): THREE.Mesh => group.getObjectByName(name) as THREE.Mesh;
const c9 = plan.canopies.find((c) => c.ref === '9')!, c10 = plan.canopies.find((c) => c.ref === '10')!;
const cam = (stationCameras() as Record<string, Cam>)['suburban-p9-south']!;

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
const lineDist = (p: Pt, line: readonly Pt[]): number => Math.min(...line.slice(1).map((b, i) => segDist(p, line[i] as Pt, b)));
/** The point on a sampled line at `t` (straight between samples), as furniture.ts lineAt. */
function at(ts: readonly number[], line: readonly Pt[], t: number): Pt {
  let i = 0;
  while (i + 2 < ts.length && t > (ts[i + 1] as number)) i++;
  const t0 = ts[i] as number, t1 = ts[i + 1] as number, k = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  const a = line[i] as Pt, b = line[i + 1] as Pt;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}
const nearest = (line: readonly Pt[], p: Pt): Pt => {
  let best: Pt = line[0] as Pt, bd = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as Pt, b = line[i + 1] as Pt, dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
    const q: Pt = [a[0] + dx * t, a[1] + dz * t], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
};
const roof = [part('canopy-glass'), part('canopy-steel')];
const ray = new THREE.Raycaster();

test('B6 round 2 one roof: from canopy 9 across the 9-10 track and platform 10 to the wall, glazed in canopy 10\'s strips, its sheet in canopy-steel', () => {
  const nine = lineDist(c9.left[3]!, c10.left) < lineDist(c9.right[3]!, c10.left) ? c9.left : c9.right;
  let checked = 0, glazed = 0;
  const tA = w.ts[0]!, tB = w.ts.at(-1)!;
  for (let t = tA + 0.5; t < tB - 0.5; t += 1.7) {
    const inner = at(w.ts, w.inner, t), outer = at(w.ts, w.edge, t), face = at(w.ts, w.face, t), n9 = nearest(nine, inner);
    const beside = lineDist(inner, nine) < 8 && Math.hypot(n9[0] - nine[0]![0], n9[1] - nine[0]![1]) > 0.1 && Math.hypot(n9[0] - nine.at(-1)![0], n9[1] - nine.at(-1)![1]) > 0.1;
    // the outer track: from canopy 10's edge to 0.1 m off the wall's face; the 9-10 track where canopy 9 runs beside canopy 10
    const spans: [Pt, Pt][] = [[outer, face], ...(beside ? [[inner, n9] as [Pt, Pt]] : [])];
    for (const [a, b] of spans) {
      for (const k of [0.02, 0.25, 0.5, 0.75, 0.98]) {
        const x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k;
        if (lineDist([x, z], w.face) < 0.1) continue;
        // the roof's skin (glass or sheet) in the roof's plane over the point; steel under it is passed through
        ray.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, 1, 0));
        const hit = ray.intersectObjects(roof, false).find((h) => Math.abs(h.point.y - (c10.roofY - 0.05)) < 1e-3);
        assert.ok(hit, `roof over (${x.toFixed(1)}, ${z.toFixed(1)}) at t ${t.toFixed(1)}: open sky`);
        checked++;
        if (hit!.object.name === 'canopy-glass') glazed++;
      }
    }
  }
  assert.ok(checked > 300, `${checked} points under the roof`);
  assert.ok(glazed > checked * 0.15 && glazed < checked * 0.6, `${glazed} of ${checked} under glass: canopy 10's strips carried across`);
  // the roof meets the wall: the outer strip's edge lies on the face, under the coping
  const pos = part('canopy-steel').geometry.getAttribute('position');
  let onFace = 0;
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - (c10.roofY - 0.05)) < 1e-6 && lineDist([pos.getX(i), pos.getZ(i)], w.face) < 0.01) onFace++;
  assert.ok(onFace >= 20, `${onFace} roof corners on the wall's face`);
  assert.ok(w.y1 > c10.roofY + 0.5, 'the wall stands above the roof plane');
});

test('B6 round 2 from suburban-p9-south: no sky between canopies 9 and 10, and the landscraper does not show above the wall', () => {
  const c = new THREE.PerspectiveCamera(cam.fov ?? 50, 1.6, 0.1, 9000);
  c.position.set(...(cam.pos as [number, number, number])); c.lookAt(...(cam.target as [number, number, number])); c.updateMatrixWorld(true);
  const occluders = [...roof, wall];
  const blocked = (p: THREE.Vector3): boolean => {
    ray.set(c.position, p.clone().sub(c.position).normalize());
    const hit = ray.intersectObjects(occluders, false)[0];
    return !!hit && hit.distance < p.distanceTo(c.position) - 0.01;
  };
  // the sky over the 9-10 track: points 3 m above the roof over its middle, wherever canopy 9 runs beside canopy 10 and in the frame
  const nine = lineDist(c9.left[3]!, c10.left) < lineDist(c9.right[3]!, c10.left) ? c9.left : c9.right;
  let sky = 0;
  for (let t = w.ts[0]! + 1; t < w.ts.at(-1)! - 1; t += 2) {
    const inner = at(w.ts, w.inner, t), n9 = nearest(nine, inner), m = new THREE.Vector3((inner[0] + n9[0]) / 2, c10.roofY + 3, (inner[1] + n9[1]) / 2);
    const s = m.clone().project(c);
    if (s.z >= 1 || Math.abs(s.x) > 1 || Math.abs(s.y) > 1 || lineDist(inner, nine) > 8) continue;
    sky++;
    assert.ok(blocked(m), `sky over the 9-10 track at (${m.x.toFixed(1)}, ${m.z.toFixed(1)}) shows`);
  }
  assert.ok(sky >= 10, `${sky} points of the 9-10 track's sky in the frame`);
  // the landscraper's faces, 6 to 30 m up, wherever they stand alongside the roof (north of its south end) and in the frame
  const south = Math.max(w.face[0]![1], w.face.at(-1)![1]);
  const ls = landscraperPlan(data).outline as Pt[];
  let seen = 0;
  for (let i = 0; i < ls.length; i++) {
    const a = ls[i]!, b = ls[(i + 1) % ls.length]!;
    for (let k = 0; k <= 30; k++) for (const y of [6, 10, 18, 30]) {
      const p = new THREE.Vector3(a[0] + ((b[0] - a[0]) * k) / 30, y, a[1] + ((b[1] - a[1]) * k) / 30), s = p.clone().project(c);
      if (p.z > south || s.z >= 1 || Math.abs(s.x) > 1 || Math.abs(s.y) > 1) continue;
      seen++;
      assert.ok(blocked(p), `the landscraper at (${p.x.toFixed(1)}, ${y}, ${p.z.toFixed(1)}) shows (screen ${s.x.toFixed(2)}, ${s.y.toFixed(2)})`);
    }
  }
  assert.ok(seen >= 40, `${seen} points of the landscraper in the frame`);
});

test('B6 round 2 trusses: across both tracks at each of canopy 10\'s trusses, bearing on paired columns just in front of the wall, with knee braces, clear of the OLE masts', () => {
  const web = part('canopy-lattice').geometry.getAttribute('position');
  const yb = c10.columnTopY;
  const verts: [number, number, number][] = [];
  for (let i = 0; i < web.count; i++) verts.push([web.getX(i), web.getY(i), web.getZ(i)]);
  const ole = olePlan({ data, layout, mouths: tunnelMouths(data).map((m) => m.origin), inZone: (x, z) => inStationZone(layout, x, z), roofY: (u) => furniture.shedRoofY(layout, u),
    arches: [-1, 0].map((k) => [layout.spine + k * SHED_SPAN_WIDTH, layout.spine + (k + 1) * SHED_SPAN_WIDTH] as [number, number]) });
  const masts = ole.lines.flatMap((l) => l.masts) as Pt[];
  assert.equal(c10.crossBeams.length, c10.columns.length + 2);
  let pairs = 0, inner = 0;
  const nine = lineDist(c9.left[3]!, c10.left) < lineDist(c9.right[3]!, c10.left) ? c9.left : c9.right;
  for (const [k, [l, r]] of c10.crossBeams.entries()) {
    const outer = lineDist(l, w.face) < lineDist(r, w.face) ? l : r;
    const f = nearest(w.face, outer), len = Math.hypot(outer[0] - f[0], outer[1] - f[1]);
    const ux: Pt = [(outer[0] - f[0]) / len, (outer[1] - f[1]) / len], along: Pt = [-ux[1], ux[0]];
    const col: Pt = [f[0] + ux[0] * W.columnOut!, f[1] + ux[1] * W.columnOut!];
    assert.ok(W.columnOut! - 0.125 > W.pilasterProud!, 'a column stands clear of the pilasters');
    // just in front of the wall: no more than a quarter metre between a column's back and a pilaster's front
    assert.ok(W.columnOut! - 0.125 - W.pilasterProud! <= 0.25, `a column ${(W.columnOut! - 0.125 - W.pilasterProud!).toFixed(2)} m off the pilasters`);
    // a pair under each truss over a column of canopy 10; the two end trusses bear on the wall
    for (const s of k >= 2 ? [-1, 1] : []) {
      const cx = col[0] + along[0] * (W.columnPair! / 2) * s, cz = col[1] + along[1] * (W.columnPair! / 2) * s;
      const near = (y: number, r = 0.2) => verts.some((v) => Math.abs(v[1] - y) < 0.05 && Math.hypot(v[0] - cx, v[2] - cz) < r);
      assert.ok(near(GROUND_Y) && near(yb - 0.4), `a column from the ground to the trusses at (${cx.toFixed(1)}, ${cz.toFixed(1)})`);
      // its knee braces: from 1.4 m under the truss out to the bottom chord (1 m toward the tracks) and along the wall (1 m)
      const reach = (dx: number, dz: number, y: number) => verts.some((v) => Math.abs(v[1] - y) < 0.1 && Math.hypot(v[0] - (cx + dx), v[2] - (cz + dz)) < 0.15);
      assert.ok(reach(ux[0], ux[1], yb + 0.02) && reach(along[0] * s, along[1] * s, yb - 0.4), `knee braces at (${cx.toFixed(1)}, ${cz.toFixed(1)})`);
      pairs += 0.5;
      for (const m of masts) assert.ok(Math.hypot(m[0] - cx, m[1] - cz) - 0.15 - 0.125 * Math.SQRT2 >= 0.3, `a column ${Math.hypot(m[0] - cx, m[1] - cz).toFixed(2)} m from an OLE mast`);
    }
    // the truss's chords run from canopy 10's edge to the wall: a bottom chord vertex at both ends
    const chord = (p: Pt) => verts.some((v) => Math.abs(v[1] - (yb + 0.075)) < 0.1 && Math.hypot(v[0] - p[0], v[2] - p[1]) < 0.3);
    assert.ok(chord(outer) && chord([f[0] + ux[0] * 0.05, f[1] + ux[1] * 0.05]), 'an outer truss from canopy 10 to the wall');
    // and an inner one across the 9-10 track to canopy 9's edge, where canopy 9 runs beside: its diagonals cross the track's middle
    const innerEnd = outer === l ? r : l, n9 = nearest(nine, innerEnd);
    const beside = Math.hypot(n9[0] - nine[0]![0], n9[1] - nine[0]![1]) > 0.1 && Math.hypot(n9[0] - nine.at(-1)![0], n9[1] - nine.at(-1)![1]) > 0.1;
    if (beside) { inner++; assert.ok(chord(n9) && verts.some((v) => v[1] > yb + 0.2 && v[1] < c10.roofY - 0.2 && Math.hypot(v[0] - (innerEnd[0] + n9[0]) / 2, v[2] - (innerEnd[1] + n9[1]) / 2) < 1.2), `an inner truss to canopy 9 at (${n9[0].toFixed(1)}, ${n9[1].toFixed(1)})`); }
  }
  assert.ok(inner >= 8, `${inner} inner trusses across the 9-10 track`);
  assert.equal(pairs, c10.columns.length, 'a pair of wall columns for each of canopy 10\'s columns');
  // no new caster, no new draw: the furniture's meshes are those of round 1, the lattice and the glass still cast nothing, the sheet's group grows by a few hundred triangles
  assert.deepEqual(group.children.map((o) => o.name).filter((n) => n.startsWith('canopy')), ['canopy-glass', 'canopy-steel', 'canopy-lattice']);
  assert.ok(!SHADOW_CASTERS.has('canopy-lattice') && !SHADOW_CASTERS.has('canopy-glass') && SHADOW_CASTERS.has('canopy-steel'));
  const groups = part('canopy-steel').geometry.groups;
  assert.equal(groups.length, 2, 'steel and sheet');
  assert.ok(groups[1]!.count / 3 <= 250, `${groups[1]!.count / 3} sheet triangles in the shadow pass`);
});

test('B6 round 2 wall detail: a dark plinth, deeper pilasters with shaded sides, a return at the north end clear of the landscraper', () => {
  assert.ok(W.pilasterProud! >= 0.4, 'deep pilasters');
  const g = wall.geometry, pos = g.getAttribute('position'), col = g.getAttribute('color'), nor = g.getAttribute('normal');
  assert.ok(col, 'vertex colours');
  let plinth = 0, sides = 0, lit = 0;
  for (let i = 0; i < pos.count; i++) {
    const p: Pt = [pos.getX(i), pos.getZ(i)], y = pos.getY(i), c = col.getX(i);
    const faceward = lineDist(p, w.face) < 0.02 && lineDist(p, w.back) > W.thickness! - 0.05;
    if (!faceward) continue;
    // a vertex on the face: below the plinth's top (and not on the band above it) the plinth's shade, above it the wall's own
    if (y < W.plinthTop! - 1e-6) { assert.ok(Math.abs(c - W.plinthShade!) < 1e-6, `the plinth at y ${y.toFixed(2)}: ${c}`); plinth++; }
    else if (y > W.plinthTop! + 1e-6) { assert.equal(c, 1, `the face at y ${y.toFixed(2)}`); lit++; }
  }
  assert.ok(plinth > 100 && lit > 100, `${plinth} plinth and ${lit} face vertices`);
  assert.ok(W.plinthShade! < 0.6 && W.plinthTop! > PLATFORM_HEIGHT, 'a dark band from the foot to over the platforms');
  // the pilasters' sides: vertical faces whose normal runs along the wall, out of the face, shaded
  for (let i = 0; i < pos.count; i++) {
    const p: Pt = [pos.getX(i), pos.getZ(i)], n: Pt = [nor.getX(i), nor.getZ(i)], f = nearest(w.face, p), d = lineDist(p, w.face);
    const out = d > 0.12 && lineDist(p, w.back) > d && d < W.pilasterProud! + 0.01; // out of the face past the coping's 0.1 m overhang, no further than a pilaster
    const k = w.face.findIndex((q, j) => j + 1 < w.face.length && segDist(f, q, w.face[j + 1]!) < 1e-6), a = w.face[k]!, b = w.face[k + 1]!;
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1]), alongN = Math.abs((n[0] * (b[0] - a[0]) + n[1] * (b[1] - a[1])) / tl);
    if (out && alongN > 0.99 && Math.abs(nor.getY(i)) < 1e-6) { sides++; assert.ok(col.getX(i) <= W.sideShade! + 1e-6, `a pilaster's side in shade: ${col.getX(i)}`); }
  }
  assert.ok(sides >= 23 * 2 * 4, `${sides} vertices of pilasters' sides`);
  // the return: at the north end (the smaller z), running away from the tracks for its length, clear of the landscraper
  const end = w.face[w.ret.at]!, other = w.face[w.ret.at === 0 ? w.face.length - 1 : 0]!;
  assert.ok(end[1] < other[1], 'at the north end');
  const tip: Pt = [end[0] + w.ret.dir[0] * W.returnLength!, end[1] + w.ret.dir[1] * W.returnLength!];
  assert.ok(lineDist(tip, w.face) > W.returnLength! - 0.1 && lineDist(tip, w.back) < lineDist(tip, w.face), 'away from the tracks');
  let reach = 0;
  // how far the wall's top reaches from the end, away from the tracks (without a return: the thickness and the coping's overhang)
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - w.y1) < 1e-6 && Math.hypot(pos.getX(i) - end[0], pos.getZ(i) - end[1]) < W.returnLength! + 1) reach = Math.max(reach, (pos.getX(i) - end[0]) * w.ret.dir[0] + (pos.getZ(i) - end[1]) * w.ret.dir[1]);
  assert.ok(reach > W.returnLength! - 0.01 && reach < W.returnLength! + W.thickness! + 0.2, `the return's top reaches ${reach.toFixed(2)} m from the end`);
  // the return is roofed: straight down onto its middle, an upward face at the wall's top
  const mid = (w.ret.at === 0 ? w.face[1]! : w.face[w.face.length - 2]!), back: Pt = [mid[0] - end[0], mid[1] - end[1]], bl = Math.hypot(back[0], back[1]);
  const over = new THREE.Vector3(end[0] + w.ret.dir[0] * W.returnLength! / 2 + (back[0] / bl) * W.thickness! / 2, w.y1 + 1, end[1] + w.ret.dir[1] * W.returnLength! / 2 + (back[1] / bl) * W.thickness! / 2);
  const down = new THREE.Raycaster(over, new THREE.Vector3(0, -1, 0)).intersectObject(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
  assert.ok(down.length > 0 && Math.abs(down[0]!.point.y - w.y1) < 1e-4 && down[0]!.face!.normal.y > 0.99, `the return's top: ${down.map((h) => h.point.y.toFixed(2)).join(', ')}`);
  // every vertex of the wall, its return among them, clear of the landscraper's outline by half a metre and outside it (the real geometry, not the plan's figure)
  const ls = landscraperPlan(data).outline as Pt[];
  const inside = (p: Pt) => ls.reduce((o, a, i) => { const b = ls[(i + 1) % ls.length]!; return (a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + ((p[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]) ? !o : o; }, false);
  let lsGap = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const p: Pt = [pos.getX(i), pos.getZ(i)];
    assert.ok(!inside(p), `a wall vertex inside the landscraper at (${p[0].toFixed(1)}, ${p[1].toFixed(1)})`);
    lsGap = Math.min(lsGap, ...ls.map((q, j) => segDist(p, q, ls[(j + 1) % ls.length]!)));
  }
  assert.ok(lsGap > 0.5, `the wall ${lsGap.toFixed(2)} m from the landscraper`);
});

test('B6 round 2 night: canopy 10\'s pendants wash the wall warm, brightest behind each lamp; by day nothing; the shared brick untouched', () => {
  const g = wall.geometry, pos = g.getAttribute('position'), wash = g.getAttribute('kxWash');
  assert.ok(wash && wash.count === pos.count, 'a wash per vertex');
  const lamps = plan.lamps.filter((l) => l.overhead && l.ref === '10');
  assert.ok(lamps.length >= 15, `${lamps.length} pendants on canopy 10`);
  const ly = PLATFORM_HEIGHT + furniture.FIGURES.lampHeight - 0.14;
  const wl = (F.wallLamps as (p: unknown, w: unknown) => { x: number; y: number; z: number; d: number }[])(plan, w);
  assert.equal(wl.length, lamps.length);
  for (const l of wl) assert.ok(l.y === ly && Math.abs(l.d - lineDist([l.x, l.z], w.face)) < 1e-6 && l.d > 5, 'each lamp at its glass, its distance from the face');
  const washAt = (p: [number, number, number]) => (F.wallWash as (l: unknown[], p: number[]) => number)(wl, p);
  // the attribute is the function at each vertex
  for (let i = 0; i < pos.count; i += 37) assert.ok(Math.abs(wash.getX(i) - washAt([pos.getX(i), pos.getY(i), pos.getZ(i)])) < 1e-5);
  // behind a lamp (the face's nearest point, at the lamp's height) against midway between two lamps, and at the foot: a gradient
  let behind = 0, between = 0, foot = 0;
  const mid = lamps.slice(3, -3);
  for (let i = 0; i + 1 < mid.length; i++) {
    const a = mid[i]!, b = mid[i + 1]!, fa = nearest(w.face, [a.x, a.z]), fm = nearest(w.face, [(a.x + b.x) / 2, (a.z + b.z) / 2]);
    behind += washAt([fa[0], ly, fa[1]]); between += washAt([fm[0], ly, fm[1]]); foot += washAt([fa[0], GROUND_Y, fa[1]]);
  }
  behind /= mid.length - 1; between /= mid.length - 1; foot /= mid.length - 1;
  assert.ok(behind > 0.6 && between < behind - 0.1 && foot < behind - 0.2, `behind a lamp ${behind.toFixed(2)}, between two ${between.toFixed(2)}, at the foot ${foot.toFixed(2)}`);
  // the material: the wash only after dark (uWinNight), warm, on the brick's own colour; its own program; the shared brick has no such patch
  const m = wall.material as THREE.MeshLambertMaterial;
  const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}', fragmentShader: '#include <common>\nvoid main() {\n#include <emissivemap_fragment>\n}' };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  assert.match(shader.vertexShader, /attribute float kxWash;[\s\S]*vKxWash = kxWash;/);
  assert.match(shader.fragmentShader, /totalEmissiveRadiance \+= vec3\( ([\d.]+), ([\d.]+), ([\d.]+) \) \* diffuseColor\.rgb \* vKxWash \* uWinNight;/);
  const [r, gg, bb] = (shader.fragmentShader.match(/vec3\( ([\d.]+), ([\d.]+), ([\d.]+) \)/)!.slice(1).map(Number)) as [number, number, number];
  assert.ok(r > gg && gg > bb && bb > 0 && r <= 0.6, 'warm, and not a glare');
  assert.ok(shader.uniforms.uWinNight && 'value' in shader.uniforms.uWinNight, 'the shared after-dark uniform');
  assert.equal(m.customProgramCacheKey(), 'suburban-wall-wash');
  const brick = material('brick') as THREE.MeshLambertMaterial;
  assert.notEqual(brick.customProgramCacheKey(), 'suburban-wall-wash');
  assert.ok(!brick.vertexColors, 'the shared brick is not changed');
});
