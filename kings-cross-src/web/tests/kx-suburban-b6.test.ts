// Shed interior B6 (the platform 9-10 canopies; shed-gap-scan-1, B6). (a) suburban-p9-south: R-kx-shed-interior-f looks south to the buffers and
// the frozen suburban-p9 north, so the partner turned B6's view to the photograph's: a new fixed camera on platform 9 looking south, B6's official
// view, with suburban-p9 kept as its context. (b) The outer wall: R-f's tall yellow-stock wall with pilasters beside the canopy, which the model
// lacked (the landscraper's timber face stood there): a station-owned wall the length of platform 10's canopy, past its outer track and the OLE
// masts, in the shed's brick, casting no sun shadow, colliding with no city building.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { landscraperPlan } from '../../core/kxcentral.ts';
import { tunnelMouths } from '../../core/landmarks.ts';
import { olePlan } from '../../core/ole.ts';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { pointInPolygon, SHED_SPAN_WIDTH, shedLayout, stationBuilding, stationPlatforms } from '../../core/station.ts';
// @ts-expect-error the evidence tool is plain JavaScript
import { ELEMENT_VIEWS, stationCameras, VIEW_ROLES } from '../../tools/evidence.mjs';
import * as furniture from '../src/furniture.ts';
import { SHADOW_CASTERS } from '../src/lighting.ts';
import { material } from '../src/materials.ts';
import { inStationZone } from '../src/track.ts';

type Pt = [number, number];
type Cam = { pos: number[]; target: number[]; fov?: number; near?: number; source: string };
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const ASPECT = 1.6; // the capture's aspect (evidence.mjs)
const F = furniture as unknown as Record<string, unknown>;
const plan = furniture.furniturePlan(data, layout);
const wallPlan = F.suburbanWallPlan as ((p: Pick<furniture.FurniturePlan, 'canopies'>) => { face: Pt[]; back: Pt[]; pilasters: { x: number; z: number; rotY: number }[]; y0: number; y1: number } | null) | undefined;
const W = F.SUBURBAN_WALL as Record<string, number>;

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
const ringDist = (p: Pt, ring: readonly Pt[]): number => Math.min(...ring.map((a, i) => segDist(p, a, ring[(i + 1) % ring.length] as Pt)));
const lineDist = (p: Pt, line: readonly Pt[]): number => Math.min(...line.slice(1).map((b, i) => segDist(p, line[i] as Pt, b)));
/** Points every `step` m along a polyline. */
function along(line: readonly Pt[], step = 0.5): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as Pt, b = line[i + 1] as Pt, n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
function lens(cam: Cam): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(cam.fov ?? 50, ASPECT, cam.near ?? 0.1, 20000);
  c.position.set(...(cam.pos as [number, number, number]));
  c.lookAt(...(cam.target as [number, number, number]));
  c.updateMatrixWorld(true);
  return c;
}
function onScreen(cam: Cam, p: [number, number, number]): { x: number; y: number; front: boolean } {
  const v = new THREE.Vector3(...p).project(lens(cam));
  return { x: v.x, y: v.y, front: v.z < 1 };
}
const inFrame = (s: { x: number; y: number; front: boolean }) => s.front && Math.abs(s.x) < 0.95 && Math.abs(s.y) < 0.95;

test('B6 suburban-p9-south: on platform 9 under its canopy, eye 1.6 m, looking south along it toward the buffers, turned west toward the outer wall', () => {
  const cams = stationCameras() as Record<string, Cam>;
  const cam = cams['suburban-p9-south'];
  assert.ok(cam, 'suburban-p9-south exists');
  assert.ok(cams['suburban-p9'], 'suburban-p9 is kept');
  assert.ok((ELEMENT_VIEWS as Record<string, string[]>)['shed-interior']!.includes('suburban-p9-south'), 'a shed-interior view');
  assert.match(cam.source, /\(shed-f-suburban-platforms-2022\.jpg\)/, 'framed from R-f');
  const roles = VIEW_ROLES as Record<string, { element: string; criterion: string; role: string }>;
  assert.deepEqual({ ...roles['suburban-p9-south'] }, { ...roles['suburban-p9-south'], element: 'shed-interior', criterion: 'B6', role: 'official' });
  assert.deepEqual({ ...roles['suburban-p9'] }, { ...roles['suburban-p9'], element: 'shed-interior', criterion: 'B6', role: 'context' });
  const foot: Pt = [cam.pos[0]!, cam.pos[2]!];
  const p9 = stationPlatforms(data).get('9')!.pts as Pt[];
  assert.ok(pointInPolygon(foot, p9), 'on platform 9');
  assert.ok(Math.abs(cam.pos[1]! - (PLATFORM_HEIGHT + 1.6)) < 1e-9 && Math.abs(cam.target[1]! - cam.pos[1]!) < 1e-9, 'eye 1.6 m over the platform, looking level');
  const c9 = plan.canopies.find((c) => c.ref === '9')!;
  assert.ok(pointInPolygon(foot, [...c9.left, ...[...c9.right].reverse()]), 'under platform 9\'s canopy');
  // south: the platform's south end (its buffer end, the vertex of greatest z) is ahead and in the frame, its north end behind
  const south = p9.reduce((a, b) => (b[1] > a[1] ? b : a)), north = p9.reduce((a, b) => (b[1] < a[1] ? b : a));
  const s = onScreen(cam, [south[0], PLATFORM_HEIGHT, south[1]]);
  assert.ok(inFrame(s), `the platform's south end is in the frame (${s.x.toFixed(2)}, ${s.y.toFixed(2)})`);
  assert.ok(s.x < 0, 'and left of the middle, as R-f\'s tracks vanish left of it');
  assert.ok(!onScreen(cam, [north[0], PLATFORM_HEIGHT, north[1]]).front, 'the north end is behind the eye');
  // the turn off the platform's line: between 8 and 25 degrees, to the west (the right, looking south)
  const dir: Pt = [cam.target[0]! - foot[0], cam.target[2]! - foot[1]];
  const ahead: Pt = [south[0] - foot[0], south[1] - foot[1]];
  // positive when the aim lies on the west (right, looking south) side of the line: the left-hand normal of `ahead` points west here
  const turn = -Math.atan2(dir[0] * ahead[1] - dir[1] * ahead[0], dir[0] * ahead[0] + dir[1] * ahead[1]) * 180 / Math.PI;
  assert.ok(-ahead[1] < 0 && ahead[0] < 0, 'the line runs south-south-west, so its left-hand normal (-z, x) points west');
  assert.ok(turn > 8 && turn < 25, `turned ${turn.toFixed(1)} degrees off the line to the buffer end, toward the west`);
});

test('B6 outer wall: the length of platform 10\'s canopy, on its outer side, past the outer track and the OLE masts, clear of every city building', () => {
  assert.ok(wallPlan && W, 'suburbanWallPlan and SUBURBAN_WALL');
  const w = wallPlan(plan)!;
  assert.ok(w, 'a wall');
  const c10 = plan.canopies.find((c) => c.ref === '10')!;
  assert.equal(w.face.length, c10.left.length, 'one face point per canopy sample');
  assert.equal(w.back.length, w.face.length);
  const p10 = stationPlatforms(data).get('10')!.pts as Pt[], p9 = stationPlatforms(data).get('9')!.pts as Pt[];
  // on the outer side: every face point farther from platform 9 than platform 10's own far edge, and outside platform 10
  for (const p of along(w.face)) {
    assert.ok(!pointInPolygon(p, p10), 'not on the platform');
    const d = ringDist(p, p10);
    assert.ok(d > W.fromEdge! - 0.15 && d < W.fromEdge! + 0.6, `the face ${d.toFixed(2)} m from platform 10 (fromEdge ${W.fromEdge})`);
    assert.ok(ringDist(p, p9) > d + 3, 'beyond platform 10 from platform 9: the outer side');
  }
  // the canopy's length: each end of the face square across from the canopy's end beams
  for (const [i, k] of [[0, 0], [w.face.length - 1, c10.left.length - 1]] as const) {
    const end = [c10.left[k] as Pt, c10.right[k] as Pt];
    const ax: Pt = [end[1][0] - end[0][0], end[1][1] - end[0][1]], l = Math.hypot(...ax);
    const off = Math.abs(((w.face[i] as Pt)[0] - end[0][0]) * ax[1] / l - ((w.face[i] as Pt)[1] - end[0][1]) * ax[0] / l);
    assert.ok(off < 0.5, `wall end ${i} on the line of the canopy's end beam (${off.toFixed(2)} m off it)`);
  }
  // thickness, and the height: the coping above the canopy's roof, the foot on the ground
  for (let i = 0; i < w.face.length; i++) assert.ok(Math.abs(Math.hypot((w.back[i] as Pt)[0] - (w.face[i] as Pt)[0], (w.back[i] as Pt)[1] - (w.face[i] as Pt)[1]) - W.thickness!) < 0.05, 'the wall\'s thickness');
  assert.ok(w.y1 >= c10.roofY + 1 && w.y1 < c10.roofY + 3, `the coping at ${w.y1}, over the roof at ${c10.roofY}`);
  assert.ok(w.y0 <= 0, 'from the ground');
  // pilasters every 7.5 m along the whole face, standing out on the track side
  const length = w.face.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - (w.face[i] as Pt)[0], p[1] - (w.face[i] as Pt)[1]), 0);
  assert.equal(w.pilasters.length, Math.floor((length - W.pilasterWidth!) / W.pilasterSpacing!) + 1);
  assert.ok(w.pilasters.length >= 20, `${w.pilasters.length} pilasters`);
  for (const p of w.pilasters) {
    const d = lineDist([p.x, p.z], w.face);
    assert.ok(Math.abs(d - (W.pilasterProud! - 0.05) / 2) < 0.02 && lineDist([p.x, p.z], w.back) > d, 'a pilaster on the face');
    assert.ok(!pointInPolygon([p.x, p.z], [...w.face, ...[...w.back].reverse()]), 'out of it, toward the tracks');
  }
  // past the outer track: 3 m and more from every rail's centre line, along the face and the pilasters' faces
  const nodes = new Map(data.nodes.map((n) => [n[0], [n[1], n[2]] as Pt]));
  const rails: [Pt, Pt][] = [];
  for (const r of data.rails) { const pts = r.nodes.map((id) => nodes.get(id)).filter((p): p is Pt => !!p); for (let i = 0; i + 1 < pts.length; i++) rails.push([pts[i]!, pts[i + 1]!]); }
  const nearestRail = (p: Pt) => Math.min(...rails.map(([a, b]) => segDist(p, a, b)));
  let railMin = Infinity;
  for (const p of along(w.face, 1)) railMin = Math.min(railMin, nearestRail(p));
  assert.ok(railMin >= 3, `the face ${railMin.toFixed(2)} m from the nearest rail`);
  // behind the OLE portals' outer masts: no mast (0.3 m square) within 0.3 m of a pilaster's face or inside the wall
  const ole = olePlan({ data, layout, mouths: tunnelMouths(data).map((m) => m.origin), inZone: (x, z) => inStationZone(layout, x, z), roofY: (u) => furniture.shedRoofY(layout, u),
    arches: [-1, 0].map((k) => [layout.spine + k * SHED_SPAN_WIDTH, layout.spine + (k + 1) * SHED_SPAN_WIDTH] as [number, number]) });
  let masts = 0;
  for (const m of ole.lines.flatMap((l) => l.masts)) {
    const d = lineDist(m as Pt, w.face), inside = lineDist(m as Pt, w.back) < d;
    if (d > 6) continue;
    masts++;
    assert.ok(!inside && d - 0.15 - W.pilasterProud! >= 0.3, `an OLE mast at (${m[0].toFixed(1)}, ${m[1].toFixed(1)}) ${d.toFixed(2)} m in front of the face`);
  }
  assert.ok(masts >= 3, `${masts} masts stand along the wall`);
  // clear of the landscraper (the face it stood in for) and of every OSM building the city draws (the station's own outline is hidden)
  const station = stationBuilding(data)!.id;
  const outline = [...w.face, ...[...w.back].reverse()];
  for (const b of data.buildings) {
    if (b.id === station) continue;
    for (const p of along(outline, 1)) assert.ok(!pointInPolygon(p, b.pts as Pt[]) && ringDist(p, b.pts as Pt[]) > 1, `building ${b.id} (${b.name ?? ''}) is within 1 m of the wall`);
  }
  const ls = landscraperPlan(data).outline;
  const lsMin = Math.min(...along(w.back, 1).map((p) => ringDist(p, ls)));
  assert.ok(lsMin > 1.5, `the landscraper ${lsMin.toFixed(2)} m behind the wall`);
  assert.equal(wallPlan({ canopies: plan.canopies.filter((c) => c.ref !== '10') }), null, 'no canopy on 10, no wall');
});

test('B6 outer wall mesh: one draw in the shed\'s stock brick, no shadow caster, a few hundred triangles, its face toward the tracks seen from suburban-p9-south', () => {
  const build = F.buildSuburbanWall as ((p: Pick<furniture.FurniturePlan, 'canopies'>) => THREE.Mesh | null) | undefined;
  assert.ok(build, 'buildSuburbanWall');
  const mesh = build(furniture.buildFurniture(data, layout).userData.plan) as THREE.Mesh;
  assert.ok(mesh instanceof THREE.Mesh && mesh.name === 'suburban-wall', 'suburban-wall');
  assert.equal(build({ canopies: [] }), null, 'no canopies, no wall');
  // the page and the tools' station scene both put it in the scene beside the furniture
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), tools = readFileSync(new URL('../../tools/station-scene.mjs', import.meta.url), 'utf8');
  assert.match(main, /const suburbanWall = buildSuburbanWall\(furniture\.userData\.plan\);[^\n]*\n\s*if \(suburbanWall\) scene\.add\(suburbanWall\);/, 'the page adds the wall');
  assert.match(tools, /suburbanWall = buildSuburbanWall\(furniture\.userData\.plan\);\n\s*scene\.add\([^\n]*furniture, \.\.\.\(suburbanWall \? \[suburbanWall\] : \[\]\)\)/, 'the tools\' station scene adds the wall');
  assert.equal(mesh.material, material('brick'), 'the shared stock brick');
  assert.ok(!SHADOW_CASTERS.has('suburban-wall') && !mesh.castShadow, 'not a sun shadow caster');
  assert.ok(mesh.geometry.getAttribute('uv'), 'UVs (metres) for the brick');
  const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute('position').count) / 3;
  assert.ok(tris > 100 && tris <= 400, `${tris} triangles`);
  const w = wallPlan!(plan)!;
  const box = new THREE.Box3().setFromObject(mesh);
  assert.ok(Math.abs(box.max.y - w.y1) < 1e-6 && Math.abs(box.min.y - w.y0) < 1e-6, 'from the foot to the coping');
  // from the B6 camera, rays to the face (between pilasters, at several heights) hit the wall's front, the side facing the tracks
  const cam = (stationCameras() as Record<string, Cam>)['suburban-p9-south']!;
  const eye = new THREE.Vector3(...(cam.pos as [number, number, number]));
  const ray = new THREE.Raycaster();
  let seen = 0;
  // the stretch south of the eye (the face runs in the canopy's order, south end first)
  const a = w.face[0] as Pt, b = w.face[1] as Pt;
  for (const k of [0.3, 0.45, 0.6]) {
    for (const y of [2, 4, 7]) {
      const p = new THREE.Vector3(a[0] + (b[0] - a[0]) * k, y, a[1] + (b[1] - a[1]) * k);
      ray.set(eye, p.clone().sub(eye).normalize());
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(hit && hit.face, `a ray to (${p.x.toFixed(1)}, ${y}, ${p.z.toFixed(1)}) hits the wall`);
      assert.ok(hit.face!.normal.dot(ray.ray.direction) < 0, 'its front face');
      if (inFrame(onScreen(cam, [p.x, p.y, p.z]))) { seen++; assert.ok(onScreen(cam, [p.x, p.y, p.z]).x > 0, 'the wall on the right of the frame, as in R-f'); }
    }
  }
  assert.equal(seen, 9, `${seen} of the wall's 9 sample points in the B6 frame`);
});
