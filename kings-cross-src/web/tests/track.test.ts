// The track's contract: sleepers every SLEEPER_SPACING along the centre line and square to it, the
// rails one gauge apart with the head top at RAIL_TOP, nothing below the ground, UVs in metres, the
// station zone holding King's Cross's own tracks and nothing of St Pancras, and the group building
// from the real OSM data in Node (materials.ts hands back flat-coloured materials without a document).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import type { KxData } from '../../core/osm.ts';
import { railShapes } from '../../core/curves.ts';
import { railSegments, TUNNEL_DEPTH, twinRails } from '../../core/scene.ts';
import { GAUGE, RAIL_HEAD_WIDTH, shedBufferStops, shedLayout, worldToShed } from '../../core/station.ts';
import { TEXTURES } from '../src/materials.ts';
import {
  BALLAST_SLOPE,
  BALLAST_TOP,
  BALLAST_TOP_WIDTH,
  beamFaceBands,
  BUFFER_REACH,
  buildBufferStops,
  buildTrack,
  inStationZone,
  polygonArea,
  RAIL_HEIGHT,
  RAIL_TOP,
  SLEEPER_LENGTH,
  SLEEPER_SPACING,
  SLEEPER_TOP,
  SLEEPER_TRIANGLES,
  SLEEPER_WIDTH,
  sleeperPlacements,
  splitByZone,
  STATION_ZONE,
  trackChains,
} from '../src/track.ts';
import { addTerrain, GROUND_Y } from '../src/world.ts';
import { trackSegments } from '../src/furniture.ts';
import { approachEnvelope } from '../../core/landmarks.ts';
import { addPortals, portalHole } from '../src/portals.ts';
import { tunnelMouths } from '../../core/landmarks.ts';
import { terrainFromFunction } from '../../core/terrain.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
/** The track group's triangle budget (60,000 on the OSM chords; the curves' pieces cost 44,000 more): see the buildTrack test. */
const TRIS_BUDGET = 100_000;

const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

// ---- helpers -------------------------------------------------------------------------------------

/** A flat shed frame: heading 0, origin (0, 0), so u = x and v = -z. */
const FLAT = { origin: [0, 0] as Pt, heading: 0, width: 72 };

/** One flat segment [x1,y1,z1,x2,y2,z2] on the ground plane. */
const seg = (x1: number, z1: number, x2: number, z2: number): number[] => [x1, 0, z1, x2, 0, z2];

/** Flat segments along a polyline of (x, z) points. */
function segmentsOf(...pts: Pt[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push(...seg((pts[i] as Pt)[0], (pts[i] as Pt)[1], (pts[i + 1] as Pt)[0], (pts[i + 1] as Pt)[1]));
  return out;
}

/** KxData for polylines of (x, z) points, each a 'main' way. */
function waysOf(...ways: Pt[][]): Pick<KxData, 'nodes' | 'rails'> {
  const nodes: KxData['nodes'] = [];
  const rails: KxData['rails'] = [];
  let id = 1;
  for (const way of ways) {
    const ids = way.map((p) => {
      nodes.push([id, p[0], p[1]]);
      return id++;
    });
    rails.push({ id: 1000 + rails.length, nodes: ids, service: 'main', tunnel: false, bridge: false, layer: 0 });
  }
  return { nodes, rails };
}

const mesh = (g: THREE.Group, name: string): THREE.Mesh => {
  const m = g.getObjectByName(name);
  assert.ok(m, `the group has no ${name}`);
  return m as THREE.Mesh;
};
const boxOf = (geometry: THREE.BufferGeometry): THREE.Box3 => new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute);

function vertices(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const p = geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i));
  return out;
}

/** Sorted cluster means of values that lie within `tol` of each other (float32 positions are never exactly equal). */
function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && v - (last[last.length - 1] as number) <= tol) last.push(v);
    else out.push([v]);
  }
  return out.map((c) => c.reduce((s, x) => s + x, 0) / c.length);
}

interface Tri {
  p: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  stored: THREE.Vector3;
  geometric: THREE.Vector3;
}
/** Every non-degenerate triangle: its corners, the normal stored on its first vertex, and the normal its winding gives. */
function triangles(geometry: THREE.BufferGeometry): Tri[] {
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  const index = geometry.index;
  const count = index ? index.count : pos.count;
  const out: Tri[] = [];
  for (let i = 0; i + 2 < count; i += 3) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k)) as [number, number, number];
    const p = ids.map((j) => new THREE.Vector3().fromBufferAttribute(pos, j)) as Tri['p'];
    const geometric = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
    if (geometric.length() < 1e-12) continue;
    out.push({ p, stored: new THREE.Vector3().fromBufferAttribute(nor, ids[0]), geometric: geometric.normalize() });
  }
  return out;
}

/** Arc length along a polyline to the foot of the perpendicular from `p`, and how far off the line `p` is. */
function onPolyline(pts: Pt[], p: Pt): { s: number; off: number; dir: Pt } {
  let best = { s: 0, off: Infinity, dir: [0, 0] as Pt };
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i] as Pt;
    const [bx, bz] = pts[i + 1] as Pt;
    const l = Math.hypot(bx - ax, bz - az);
    const t = Math.max(0, Math.min(l, ((p[0] - ax) * (bx - ax) + (p[1] - az) * (bz - az)) / l));
    const off = Math.hypot(p[0] - (ax + ((bx - ax) / l) * t), p[1] - (az + ((bz - az) / l) * t));
    if (off < best.off) best = { s: acc + t, off, dir: [(bx - ax) / l, (bz - az) / l] };
    acc += l;
  }
  return best;
}

/** The centre line buildTrack draws for one way (core/curves.ts): its smooth curve's points, node to node. */
function drawnLine(pts: Pt[]): Pt[] {
  const ways = waysOf(pts);
  const m = railSegments(ways, railShapes(ways)).main;
  const out: Pt[] = [[m[0] as number, m[2] as number]];
  for (let i = 0; i + 5 < m.length; i += 6) out.push([m[i + 3] as number, m[i + 5] as number]);
  return out;
}

// ---- figures -------------------------------------------------------------------------------------

test('track: the levels stack up from the ground to the rail head, with the figures the brief gives', () => {
  assert.equal(RAIL_TOP, 0);
  near(RAIL_HEIGHT, 0.1, 1e-12, 'rail height');
  near(SLEEPER_TOP, RAIL_TOP - RAIL_HEIGHT, 1e-12, 'sleeper top is the rail foot level');
  assert.ok(GROUND_Y < BALLAST_TOP && BALLAST_TOP < SLEEPER_TOP && SLEEPER_TOP < RAIL_TOP, 'ground < ballast < sleeper top < rail head');
  near(BALLAST_TOP, -0.14, 1e-12, 'ballast surface');
  near(SLEEPER_LENGTH, 2.6, 1e-12, 'sleeper length');
  near(SLEEPER_WIDTH, 0.25, 1e-12, 'sleeper width');
  // the spacing is ASSUMED: guard against a slip of units rather than pin the guess
  assert.ok(SLEEPER_SPACING >= 0.55 && SLEEPER_SPACING <= 0.7, `sleeper spacing ${SLEEPER_SPACING} is not a plausible 0.55-0.70 m`);
  assert.ok(BALLAST_TOP_WIDTH > SLEEPER_LENGTH, 'the ballast top is wider than the sleeper');
});

// ---- sleepers ------------------------------------------------------------------------------------

test('sleepers: exactly SLEEPER_SPACING apart along a straight segment, the first half a spacing in, about length / spacing of them', () => {
  const len = 50;
  const s = sleeperPlacements(segmentsOf([10, -20], [10, -20 - len]));
  assert.ok(Math.abs(s.length - len / SLEEPER_SPACING) <= 1, `${s.length} sleepers for ${len} m`);
  near(s[0]?.z ?? NaN, -20 - SLEEPER_SPACING / 2, 1e-9, 'the first sleeper is half a spacing from the end');
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1] as { x: number; z: number };
    const b = s[i] as { x: number; z: number };
    near(Math.hypot(b.x - a.x, b.z - a.z), SLEEPER_SPACING, 1e-9, `gap ${i}`);
  }
  // a different spacing is honoured
  assert.equal(sleeperPlacements(segmentsOf([0, 0], [0, -10]), 1).length, 10);
});

test('sleepers: the spacing carries across the node between two segments, straight or bent, so none is doubled or missing there', () => {
  // a node in a straight line changes nothing
  const straight = sleeperPlacements(segmentsOf([0, 0], [0, -17.3], [0, -40]));
  const single = sleeperPlacements(segmentsOf([0, 0], [0, -40]));
  assert.equal(straight.length, single.length);
  straight.forEach((p, i) => near(p.z, (single[i] as { z: number }).z, 1e-9, `sleeper ${i} z`));
  // bent 25 degrees at the node: the path distance between neighbours stays SLEEPER_SPACING, the pair across the node included
  const a = (25 * Math.PI) / 180;
  const bend: Pt[] = [[0, 0], [0, -17.3], [Math.sin(a) * 22.7, -17.3 - Math.cos(a) * 22.7]];
  const s = sleeperPlacements(segmentsOf(...bend));
  assert.ok(s.length > 40);
  let across = 0;
  for (let i = 1; i < s.length; i++) {
    const p = onPolyline(bend, [(s[i - 1] as { x: number }).x, (s[i - 1] as { z: number }).z]);
    const q = onPolyline(bend, [(s[i] as { x: number }).x, (s[i] as { z: number }).z]);
    near(p.off, 0, 1e-9, `sleeper ${i - 1} is on the centre line`);
    near(q.s - p.s, SLEEPER_SPACING, 1e-9, `path gap ${i}`);
    if (p.s < 17.3 && q.s > 17.3) across++;
  }
  assert.equal(across, 1, 'exactly one pair straddles the node');
  // listed backwards, or out of order, a way of three segments is still one chain with the same number of sleepers
  const [ab, bc, cd] = [seg(0, 0, 0, -10), seg(0, -10, 0, -25), seg(0, -25, 0, -40)];
  const forward = sleeperPlacements([...ab, ...bc, ...cd]);
  assert.equal(sleeperPlacements([...cd, ...ab, ...bc]).length, forward.length);
  assert.equal(sleeperPlacements([...seg(0, -40, 0, -25), ...seg(0, -25, 0, -10), ...seg(0, -10, 0, 0)]).length, forward.length);
  assert.equal(trackChains([...cd, ...ab, ...bc]).length, 1);
});

test('sleepers: a segment listed twice counts once, and a junction or a sharp corner ends a chain instead of being smoothed over', () => {
  const once = sleeperPlacements(segmentsOf([0, 0], [0, -30]));
  const twice = sleeperPlacements([...segmentsOf([0, 0], [0, -30]), ...segmentsOf([0, -30], [0, 0])]);
  assert.equal(twice.length, once.length, 'a duplicated segment doubles nothing');
  // a right-angle turn is two chains; a gentle 20 degree one is one
  assert.equal(trackChains(segmentsOf([0, 0], [0, -20], [20, -20])).length, 2);
  const gentle = trackChains(segmentsOf([0, 0], [0, -20], [Math.sin(0.35) * 20, -20 - Math.cos(0.35) * 20]));
  assert.equal(gentle.length, 1);
  assert.equal(gentle[0]?.length, 3);
  // a T junction: three segments meeting at one node make three chains
  const tee = [...segmentsOf([0, 0], [0, -20]), ...segmentsOf([0, -20], [0, -40]), ...segmentsOf([0, -20], [15, -35])];
  assert.equal(trackChains(tee).length, 3);
});

test('sleepers: each is square to the line and on it, in the placements and in the instance matrices', () => {
  const pts: Pt[] = [[5, -20], [65, -80], [90, -90]];
  const s = sleeperPlacements(segmentsOf(...pts));
  assert.ok(s.length > 100);
  for (const p of s) {
    const { off, dir } = onPolyline(pts, [p.x, p.z]);
    near(off, 0, 1e-9, 'on the centre line');
    // the sleeper's long axis in its own frame is +x: turned by yaw about y it is (cos yaw, -sin yaw)
    near(Math.cos(p.yaw) * dir[0] - Math.sin(p.yaw) * dir[1], 0, 1e-9, 'long axis is square to the line');
    near(Math.sin(p.yaw) * dir[0] + Math.cos(p.yaw) * dir[1], 1, 1e-9, 'short axis runs along the line');
  }
  // buildTrack lays them along the drawn curve (core/curves.ts), not the chords: on it and square to it
  const line = drawnLine(pts);
  const sleepers = mesh(buildTrack(waysOf(pts), FLAT), 'track-sleepers') as unknown as THREE.InstancedMesh;
  assert.equal(sleepers.count, sleeperPlacements(segmentsOf(...line)).length);
  const m = new THREE.Matrix4();
  for (let i = 0; i < sleepers.count; i++) {
    sleepers.getMatrixAt(i, m);
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    const axis = new THREE.Vector3(1, 0, 0).transformDirection(m);
    const { off, dir } = onPolyline(line, [pos.x, pos.z]);
    near(off, 0, 1e-4, `instance ${i} on the line`);
    near(axis.x * dir[0] + axis.z * dir[1], 0, 1e-6, `instance ${i} square to the line`);
    assert.ok(pos.y <= 1e-9 && pos.y >= -0.004 - 1e-9, `instance ${i} drop ${pos.y} is within the 4 mm jitter`);
  }
});

test('sleepers: a sleeper is 2.6 x 0.25 m, its top at SLEEPER_TOP, with a top and two long sides, no bottom and no ends (6 triangles, not 10)', () => {
  const sleepers = mesh(buildTrack(waysOf([[10, -20], [10, -60]]), FLAT), 'track-sleepers');
  const box = boxOf(sleepers.geometry);
  near(box.max.x - box.min.x, SLEEPER_LENGTH, 1e-6, 'length');
  near(box.max.z - box.min.z, SLEEPER_WIDTH, 1e-6, 'width');
  near(box.max.y, SLEEPER_TOP, 1e-6, 'top');
  assert.ok(box.min.y >= GROUND_Y, 'does not reach below the ground');
  const t = triangles(sleepers.geometry);
  assert.equal(t.length, SLEEPER_TRIANGLES, 'three faces of two triangles');
  assert.equal(SLEEPER_TRIANGLES, 6);
  assert.ok(t.every((x) => x.stored.y >= -1e-9), 'no face looks down');
  assert.ok(t.every((x) => Math.abs(x.stored.x) < 1e-9), 'no end face: nothing looks along the sleeper');
  assert.equal(t.filter((x) => x.stored.y > 0.999).length, 2, 'the top is one quad');
  assert.equal(t.filter((x) => x.stored.z > 0.999).length + t.filter((x) => x.stored.z < -0.999).length, 4, 'the two long sides, a quad each');
  assert.ok(t.every((x) => x.geometric.dot(x.stored) > 0.999), 'wound outward');
});

// ---- the zone ------------------------------------------------------------------------------------

/** The OSM nodes of a way, in the world frame and in the shed's. */
function wayNodes(id: number): { u: number; v: number; x: number; z: number }[] {
  const way = data.rails.find((r) => r.id === id);
  assert.ok(way, `OSM way ${id} is in the extract`);
  return way.nodes.map((n) => {
    const node = data.nodes.find((q) => q[0] === n);
    assert.ok(node, `node ${n}`);
    return { ...worldToShed(layout, [node[1], node[2]]), x: node[1], z: node[2] };
  });
}

test('zone: the shed tracks, the platform 9/10 tracks and the throat are in it; the Thameslink and St Pancras ways are not', () => {
  // King's Cross's own (ref ECM1): platform tracks under the shed, the platform 9/10 track at u -47..-22
  for (const id of [751608037, 68287389, 200526794, 1390691719, 1196927515]) {
    for (const p of wayNodes(id)) assert.ok(inStationZone(layout, p.x, p.z), `way ${id} node at u ${p.u.toFixed(1)}, v ${p.v.toFixed(1)} should be in the zone`);
  }
  // Thameslink TRL1 (110558315 is the nearest to the shed: u -105..-83, v -44..-1), St Pancras SPC1 and the others
  for (const id of [110558315, 10338918, 3648973, 10338979, 1063787328]) {
    for (const p of wayNodes(id)) assert.ok(!inStationZone(layout, p.x, p.z), `way ${id} node at u ${p.u.toFixed(1)}, v ${p.v.toFixed(1)} must be outside the zone`);
  }
  // on the whole extract: a surface way with a node in the zone is tagged ref=ECM1, King's Cross's own line
  const inside = new Set<number>();
  for (const [id, x, z] of data.nodes) if (inStationZone(layout, x, z)) inside.add(id);
  assert.ok(inside.size > 100, `${inside.size} nodes in the zone`);
  for (const r of data.rails) {
    if (r.tunnel || !r.nodes.some((n) => inside.has(n))) continue;
    assert.equal(r.ref, 'ECM1', `way ${r.id} (${r.ref ?? 'no ref'}, ${r.service}) has a node in the zone`);
  }
});

test('zone: its edges are where STATION_ZONE says, in the shed frame', () => {
  const w = layout.width;
  const at = (u: number, v: number): boolean => {
    const x = layout.origin[0] + u * Math.cos(layout.heading) + v * Math.sin(layout.heading);
    const z = layout.origin[1] + u * Math.sin(layout.heading) - v * Math.cos(layout.heading);
    return inStationZone(layout, x, z);
  };
  assert.ok(at(STATION_ZONE.uWest + 0.5, 100) && !at(STATION_ZONE.uWest - 0.5, 100), 'west edge');
  assert.ok(at(w + STATION_ZONE.uEastBeyondShed - 0.5, 100) && !at(w + STATION_ZONE.uEastBeyondShed + 0.5, 100), 'east edge');
  assert.ok(at(30, STATION_ZONE.vSouth + 0.5) && !at(30, STATION_ZONE.vSouth - 0.5), 'south edge');
  assert.ok(at(30, STATION_ZONE.vNorth - 0.5) && !at(30, STATION_ZONE.vNorth + 0.5), 'north edge');
  // the zone clears the platform 9/10 track (u -47) and the buffer stops (v 12), and stops short of the Thameslink ways (u -105)
  assert.ok(STATION_ZONE.uWest < -47 && STATION_ZONE.uWest > -105);
  assert.ok(STATION_ZONE.vSouth < 12);
});

test('zone: splitByZone sends a segment by its midpoint, and loses nothing', () => {
  const all = [...seg(10, -50, 10, -80), ...seg(-300, -50, -300, -80), ...seg(10, -80, -300, -80)];
  const { near: n, far: f } = splitByZone(all, FLAT);
  assert.deepEqual(n, seg(10, -50, 10, -80));
  assert.equal(n.length + f.length, all.length);
  assert.deepEqual(f.slice(0, 6), seg(-300, -50, -300, -80));
});

test('zone: on the real extract it holds about 131 main segments, 4.5 km, and no sidings', () => {
  const rails = railSegments(data);
  const main = splitByZone(rails.main, layout);
  const siding = splitByZone(rails.siding, layout);
  let length = 0;
  for (let i = 0; i + 5 < main.near.length; i += 6) length += Math.hypot((main.near[i + 3] as number) - (main.near[i] as number), (main.near[i + 5] as number) - (main.near[i + 2] as number));
  assert.ok(main.near.length / 6 >= 120 && main.near.length / 6 <= 140, `${main.near.length / 6} segments`);
  assert.ok(length > 4300 && length < 4800, `${length.toFixed(0)} m`);
  assert.equal(siding.near.length, 0);
  assert.equal(main.near.length + main.far.length, rails.main.length);
});

test('curves: in the station zone the drawn track has no visible angle where it runs on, every OSM node is still on it, and a turnout branch leaves along its through route', () => {
  // the joints of the drawn pieces along every chain, and at every junction the sharpest fork (a branch's first piece
  // against the nearest other branch's, both leaving the node): the OSM chords turned by up to 5.5 degrees at a node
  // and forked at up to 7.7 degrees; the curves (core/curves.ts) by under a degree
  const deg = (r: number): number => (r * 180) / Math.PI;
  const measure = (segments: number[]): { joint: number; fork: number; junctions: number } => {
    let joint = 0;
    for (const c of trackChains(segments)) {
      for (let i = 1; i + 1 < c.length; i++) {
        const [a, b, d] = [c[i - 1] as Pt, c[i] as Pt, c[i + 1] as Pt];
        const ux = b[0] - a[0], uz = b[1] - a[1], vx = d[0] - b[0], vz = d[1] - b[1];
        joint = Math.max(joint, deg(Math.acos(Math.min(1, (ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz))))));
      }
    }
    const leaving = new Map<string, Pt[]>();
    for (let i = 0; i + 5 < segments.length; i += 6) {
      const a: Pt = [segments[i] as number, segments[i + 2] as number];
      const b: Pt = [segments[i + 3] as number, segments[i + 5] as number];
      for (const [p, q] of [[a, b], [b, a]] as const) {
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const list = leaving.get(`${p[0]},${p[1]}`) ?? [];
        list.push([(q[0] - p[0]) / l, (q[1] - p[1]) / l]);
        leaving.set(`${p[0]},${p[1]}`, list);
      }
    }
    let fork = 0;
    let junctions = 0;
    for (const dirs of leaving.values()) {
      if (dirs.length < 3) continue;
      junctions++;
      for (const u of dirs) {
        let nearest = 180;
        for (const v of dirs) if (v !== u) nearest = Math.min(nearest, deg(Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1]))));
        if (nearest < 25) fork = Math.max(fork, nearest); // a diamond crossing's routes cross at more: not a fork
      }
    }
    return { joint, fork, junctions };
  };
  const ecml = { nodes: data.nodes, rails: data.rails.filter((r) => !r.tunnel || r.ref === 'ECM1') };
  const chords = measure(splitByZone(railSegments(ecml).main, layout).near);
  const curves = measure(splitByZone(railSegments(ecml, railShapes(data)).main, layout).near);
  assert.ok(chords.joint > 5 && chords.fork > 7, `the chords: joints to ${chords.joint.toFixed(2)}, forks to ${chords.fork.toFixed(2)} degrees`);
  assert.equal(curves.junctions, chords.junctions, 'the same junctions');
  assert.ok(curves.junctions >= 10, `${curves.junctions} junctions`);
  assert.ok(curves.joint < 1, `a drawn joint turns ${curves.joint.toFixed(2)} degrees`);
  assert.ok(curves.fork < 1, `a turnout branch leaves ${curves.fork.toFixed(2)} degrees off its through route`);
  // every OSM node of the zone's track is a vertex of the drawn track, exactly where OSM puts it
  const near = splitByZone(railSegments(ecml, railShapes(data)).main, layout).near;
  const vertices = new Set<string>();
  for (let i = 0; i + 2 < near.length; i += 3) vertices.add(`${near[i]},${near[i + 2]}`);
  const zoneNodes = new Set(splitByZone(railSegments(ecml).main, layout).near.flatMap((v, i, a) => (i % 3 === 0 ? [`${v},${a[i + 2]}`] : [])));
  assert.ok(zoneNodes.size > 100);
  for (const n of zoneNodes) assert.ok(vertices.has(n), `OSM node ${n} is on the drawn track`);
});

// ---- the group -----------------------------------------------------------------------------------

test('buildTrack: builds from the real data in Node as five meshes, one sleeper per spacing along 4.5 km, within the triangle budget', () => {
  const g = buildTrack(data, layout);
  assert.equal(g.name, 'track');
  assert.deepEqual(g.children.map((c) => c.name).sort(), ['track-ballast', 'track-lines', 'track-rails', 'track-sleepers', 'track-tunnel']);
  assert.ok(g.children.length <= 6, 'draw calls');
  const drawn = railSegments({ nodes: data.nodes, rails: data.rails.filter((r) => !r.tunnel || r.ref === 'ECM1') }, railShapes(data));
  const chains = trackChains(splitByZone(drawn.main, layout).near);
  let length = 0;
  for (const c of chains) for (let i = 0; i + 1 < c.length; i++) length += Math.hypot((c[i + 1] as Pt)[0] - (c[i] as Pt)[0], (c[i + 1] as Pt)[1] - (c[i] as Pt)[1]);
  const sleepers = mesh(g, 'track-sleepers') as unknown as THREE.InstancedMesh;
  assert.equal(sleepers.count, g.userData.sleepers);
  assert.equal(g.userData.chains, chains.length);
  assert.ok(Math.abs(sleepers.count - length / SLEEPER_SPACING) <= chains.length / 2 + 1, `${sleepers.count} sleepers for ${length.toFixed(0)} m (${(length / SLEEPER_SPACING).toFixed(0)} expected)`);
  assert.ok(sleepers.count > 6000 && sleepers.count < 8000, `${sleepers.count} sleepers`);
  let tris = sleepers.count * ((sleepers.geometry.index?.count ?? 0) / 3);
  assert.equal(tris, sleepers.count * SLEEPER_TRIANGLES, 'a sleeper is SLEEPER_TRIANGLES triangles');
  for (const name of ['track-ballast', 'track-rails']) tris += (mesh(g, name).geometry.index?.count ?? 0) / 3;
  // measured on the 2026 extract: 6978 sleepers; 78,554 triangles with 10-triangle sleepers, 50,642 with 6 on the
  // OSM chords; 95,072 on core/curves.ts's short pieces (half a degree a joint), all the extra in the rails and the bed
  assert.ok(tris < TRIS_BUDGET, `${tris} triangles`);
  // the library's materials: the ballast itself, the sleepers its concrete (tinted per instance, fading with distance)
  assert.equal((mesh(g, 'track-ballast').material as THREE.Material).name, 'ballast');
  assert.equal((sleepers.material as THREE.MeshLambertMaterial).color.getHex(), 0x8e8e8a);
  assert.ok(sleepers.instanceColor, 'sleepers are tinted per instance');
});

test('attributes: only the ballast carries UVs (the planar metres), only the rails and the buffer stops carry vertex colours', () => {
  const g = buildTrack(waysOf([[10, -20], [10, -60]]), FLAT);
  const ballast = mesh(g, 'track-ballast').geometry;
  assert.ok(ballast.getAttribute('uv'), 'the ballast is textured');
  assert.equal(ballast.getAttribute('color'), undefined);
  for (const name of ['track-rails', 'track-sleepers']) assert.equal(mesh(g, name).geometry.getAttribute('uv'), undefined, `${name} wears no texture, so builds no UVs`);
  assert.ok(mesh(g, 'track-rails').geometry.getAttribute('color'), 'rails are painted per vertex');
  assert.equal(mesh(g, 'track-sleepers').geometry.getAttribute('color'), undefined, 'sleepers are tinted per instance');
  const stops = buildBufferStops(data, layout);
  const stop = (stops.children[0] as THREE.Mesh).geometry;
  assert.ok(stop.getAttribute('color'), 'the buffer stop is painted per vertex');
  assert.equal(stop.getAttribute('uv'), undefined, 'and wears no texture');
});

test('rails: the inner faces are one GAUGE apart, measured on the built geometry, and the head top is RAIL_TOP', () => {
  const rails = mesh(buildTrack(waysOf([[10, -20], [10, -120]]), FLAT), 'track-rails');
  // the head top corners are the vertices at y = 0: four lateral positions across the two rails
  const top = vertices(rails.geometry).filter((p) => Math.abs(p.y - RAIL_TOP) < 1e-9);
  const xs = cluster(top.map((p) => p.x - 10), 1e-4);
  assert.equal(xs.length, 4, `head-top corners at ${xs.join(', ')}`);
  near((xs[2] as number) - (xs[1] as number), GAUGE, 1e-5, 'inner faces');
  near((xs[1] as number) - (xs[0] as number), RAIL_HEAD_WIDTH, 1e-5, 'left head width');
  near((xs[3] as number) - (xs[2] as number), RAIL_HEAD_WIDTH, 1e-5, 'right head width');
  near((xs[0] as number) + (xs[3] as number), 0, 1e-5, 'symmetric about the centre line');
  const box = boxOf(rails.geometry);
  near(box.max.y, RAIL_TOP, 1e-6, 'rail head top');
  near(box.min.y, SLEEPER_TOP, 1e-6, 'rail foot on the sleeper top');
  near(box.max.y - box.min.y, RAIL_HEIGHT, 1e-6, 'rail height');
});

test('rails: the gauge holds round a bend (the rails are mitred, not butted)', () => {
  // the 25 degree bend is drawn as the curve's short pieces (core/curves.ts), each joint mitred: every head-top
  // corner is exactly half a gauge (inner) or half a gauge plus a head (outer) from the drawn centre line. Butted
  // pieces would put the corners at the joints off by d(1 - cos joint): 0.03 mm at a half-degree joint, which the
  // float32 positions (7.6e-6 m apart out here) still resolve.
  const a = (25 * Math.PI) / 180;
  const pts: Pt[] = [[10, -20], [10, -60], [10 + Math.sin(a) * 40, -60 - Math.cos(a) * 40]];
  const line = drawnLine(pts);
  assert.ok(line.length > 40, `${line.length} points: the bend is smoothed`);
  const rails = mesh(buildTrack(waysOf(pts), FLAT), 'track-rails');
  const top = vertices(rails.geometry).filter((p) => Math.abs(p.y - RAIL_TOP) < 1e-9 && p.z < -21 && p.z > -95);
  assert.ok(top.length > 4 * 40, `${top.length} head-top corners`);
  let worst = 0;
  for (const p of top) {
    const { off } = onPolyline(line, [p.x, p.z]);
    worst = Math.max(worst, Math.min(Math.abs(off - GAUGE / 2), Math.abs(off - GAUGE / 2 - RAIL_HEAD_WIDTH)));
  }
  near(worst, 0, 1.5e-5, 'a head-top corner off its lateral offset from the centre line (m)');
});

test('faces: every triangle of the ballast, rails and sleepers is wound the way its normal says; the ballast faces up', () => {
  const g = buildTrack(data, layout);
  for (const name of ['track-ballast', 'track-rails', 'track-sleepers']) {
    const t = triangles(mesh(g, name).geometry);
    assert.ok(t.length > 0, `${name} has triangles`);
    let worst = 1;
    for (const x of t) worst = Math.min(worst, x.geometric.dot(x.stored));
    assert.ok(worst > 0.9, `${name}: a triangle's winding opposes its normal (cos ${worst.toFixed(3)})`);
  }
  assert.ok(triangles(mesh(g, 'track-ballast').geometry).every((x) => x.geometric.y > 0.4), 'every ballast triangle faces up, so none is culled from above');
  const tops = triangles(mesh(g, 'track-rails').geometry).filter((x) => x.p.every((p) => Math.abs(p.y - RAIL_TOP) < 1e-6));
  assert.ok(tops.length > 100 && tops.every((x) => x.geometric.y > 0.99), 'the head tops face up');
});

// ---- ballast -------------------------------------------------------------------------------------

test('ballast: UVs are in metres: across a straight bed the UV span equals the world span on both axes', () => {
  const bed = mesh(buildTrack(waysOf([[0, -50], [100, -50]]), FLAT), 'track-ballast');
  const p = bed.geometry.getAttribute('position');
  const uv = bed.geometry.getAttribute('uv');
  assert.equal(uv.count, p.count);
  const box = boxOf(bed.geometry);
  const span = (axis: 0 | 1): number => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      const x = axis === 0 ? uv.getX(i) : uv.getY(i);
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    return hi - lo;
  };
  near(span(0), box.max.x - box.min.x, 1e-4, 'u span against the world x span');
  near(span(1), box.max.z - box.min.z, 1e-4, 'v span against the world z span');
  near(box.max.x - box.min.x, 100, 1e-4, 'the bed is as long as the track');
  near(box.max.z - box.min.z, BALLAST_TOP_WIDTH + 2 * (BALLAST_TOP - GROUND_Y) * BALLAST_SLOPE, 1e-4, 'the bed is the top width plus both shoulders wide');
  // the density that implies: the ballast texture is 2 m a tile at 256 px, 128 texels per metre
  near(TEXTURES.ballast.px[0] / TEXTURES.ballast.tile[0], 128, 1e-9, 'texels per metre of the ballast texture');
});

test('ballast: the top is at BALLAST_TOP, the shoulders fall to the ground, and nothing in the bed, sleepers or rails is below the ground', () => {
  const g = buildTrack(data, layout);
  const bed = boxOf(mesh(g, 'track-ballast').geometry);
  near(bed.max.y, BALLAST_TOP, 1e-6, 'ballast top');
  near(bed.min.y, GROUND_Y, 1e-6, 'the shoulders meet the ground');
  for (const name of ['track-ballast', 'track-rails']) {
    assert.ok(boxOf(mesh(g, name).geometry).min.y >= GROUND_Y - 1e-6, `${name} reaches below the ground at ${GROUND_Y}`);
  }
  const sleepers = mesh(g, 'track-sleepers') as unknown as THREE.InstancedMesh;
  const m = new THREE.Matrix4();
  let lowest = 0;
  for (let i = 0; i < sleepers.count; i++) {
    sleepers.getMatrixAt(i, m);
    lowest = Math.min(lowest, new THREE.Vector3().setFromMatrixPosition(m).y);
  }
  assert.ok(lowest + boxOf(sleepers.geometry).min.y >= GROUND_Y, `a sleeper reaches y = ${lowest + boxOf(sleepers.geometry).min.y}, below the ground`);
});

// ---- the lines -----------------------------------------------------------------------------------

test('lines: beyond the zone twin rails, along the zone a lifted copy, and modelled ECML tunnel lines at train level', () => {
  const shapes = railShapes(data);
  const rails = railSegments({ nodes: data.nodes, rails: data.rails.filter((r) => !r.tunnel || r.ref === 'ECM1') }, shapes);
  const g = buildTrack(data, layout);
  const lines = mesh(g, 'track-lines');
  const pos = lines.geometry.getAttribute('position');
  const cut = lines.geometry.getAttribute('cutoff');
  const col = lines.geometry.getAttribute('color');
  const farMain = twinRails(splitByZone(rails.main, layout).far);
  const farSiding = twinRails(splitByZone(rails.siding, layout).far);
  const nFar = (farMain.length + farSiding.length) / 3;
  assert.ok(nFar > 1000);
  for (let i = 0; i < nFar; i++) assert.equal(cut.getX(i), 0, `vertex ${i} is a far line`);
  const expected = [...farMain, ...farSiding];
  for (let i = 0; i < expected.length; i++) near(pos.array[i] as number, expected[i] as number, 1e-3, `far line coordinate ${i}`);
  near(col.getX(0), new THREE.Color(0xd5dae2).r, 1e-6, 'far main line colour');
  near(col.getX(farMain.length / 3 + 1), new THREE.Color(0x9a9486).r, 1e-6, 'far siding line colour');
  assert.ok(pos.count > nFar, 'the zone has lines too');
  for (let i = nFar; i < pos.count; i++) {
    assert.ok(cut.getX(i) > 0, `vertex ${i} is a zone line and carries a cutoff`);
    assert.ok(pos.getY(i) > RAIL_TOP && pos.getY(i) < RAIL_TOP + 0.01, 'floats a few mm over the head');
  }
  const tunnel = mesh(g, 'track-tunnel') as unknown as THREE.LineSegments;
  const mat = tunnel.material as THREE.LineBasicMaterial;
  assert.equal(mat.color.getHex(), 0x5b6b86);
  assert.equal(mat.opacity, 0.7);
  assert.equal(mat.transparent, true);
  const tp = tunnel.geometry.getAttribute('position');
  const modelled = railSegments({ nodes: data.nodes, rails: data.rails.filter(r => r.ref === 'ECM1') }, shapes).tunnel;
  assert.equal(tp.count * 3, modelled.length);
  for (let i = 0; i < modelled.length; i++) near(tp.array[i] as number, modelled[i] as number, 1e-3, `tunnel coordinate ${i}`);
  assert.ok(vertices(tunnel.geometry).every((p) => p.y === TUNNEL_DEPTH), 'the tunnel lines stay at TUNNEL_DEPTH');
});

test('shaders: the sleeper fade and the line cutoff patch the stock three.js shaders (they would silently do nothing if a chunk were renamed)', () => {
  const g = buildTrack(data, layout);
  const patch = (m: THREE.Material, shader: { vertexShader: string; fragmentShader: string }): void => {
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
  };
  const lambert = { vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  patch(mesh(g, 'track-sleepers').material as THREE.Material, lambert);
  assert.match(lambert.fragmentShader, /diffuseColor\.rgb = mix\( diffuseColor\.rgb, vec3\(/);
  assert.match(lambert.fragmentShader, /smoothstep\( 110\.0, 260\.0, length\( vViewPosition \) \)/);
  assert.ok(lambert.fragmentShader.indexOf('#include <lights_lambert_pars_fragment>') < lambert.fragmentShader.indexOf('diffuseColor.rgb = mix('), 'vViewPosition is declared by then');
  const basic = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  patch(mesh(g, 'track-lines').material as THREE.Material, basic);
  assert.match(basic.vertexShader, /attribute float cutoff;/);
  assert.match(basic.vertexShader, /vDistance = - mvPosition\.z;/);
  assert.match(basic.fragmentShader, /if \( vDistance < vCutoff \) discard;/);
});

// ---- buffer stops --------------------------------------------------------------------------------

const stopsMesh = (g: THREE.Group): THREE.InstancedMesh => {
  const m = g.getObjectByName('buffer-stops-mesh');
  assert.ok(m instanceof THREE.InstancedMesh, 'the group holds the instanced mesh');
  return m;
};

/** Where instance i's matrix puts a point given in the stop's own frame (x across, y up, -z north). */
function stopPoint(m: THREE.InstancedMesh, i: number, local: [number, number, number]): THREE.Vector3 {
  const matrix = new THREE.Matrix4();
  m.getMatrixAt(i, matrix);
  return new THREE.Vector3(local[0], local[1], local[2]).applyMatrix4(matrix);
}

test('buffer stops: ONE instanced mesh, an instance on each of the shed\'s nine OSM stops and on none of the others', () => {
  const stops = shedBufferStops(data, layout);
  assert.equal(stops.length, 9, 'one stop per terminating track of platforms 0-8');
  assert.ok(data.buffers.length > stops.length, 'the extract also holds stops outside the shed, which are not ours to draw');
  const g = buildBufferStops(data, layout);
  assert.equal(g.children.length, 1, 'one draw call');
  const m = stopsMesh(g);
  assert.equal(m.count, 9);
  const used = new Set<number>();
  for (let i = 0; i < m.count; i++) {
    const o = stopPoint(m, i, [0, 0, 0]);
    const k = stops.findIndex((s) => Math.hypot(s.x - o.x, s.z - o.z) < 1e-3);
    assert.ok(k >= 0, `instance ${i} at (${o.x}, ${o.z}) is on no shed stop`);
    used.add(k);
    near(o.y, RAIL_TOP, 1e-9, `instance ${i} stands at the rail head level`);
  }
  assert.equal(used.size, 9, 'each stop has exactly one instance');
  assert.deepEqual([...(g.userData.stops as number[])].sort(), stops.map((s) => s.id).sort(), 'userData names the stops');
  assert.equal(buildBufferStops({ buffers: [] }, layout).children.length, 0, 'no buffers, nothing to draw');
});

test('buffer stops: turned with the shed (north is +v, east is +u), and the rails end at the beam\'s face', () => {
  const rails = vertices(mesh(buildTrack(data, layout), 'track-rails').geometry);
  const m = stopsMesh(buildBufferStops(data, layout));
  const inverse = new THREE.Matrix4();
  for (let i = 0; i < m.count; i++) {
    const at = worldToShed(layout, [stopPoint(m, i, [0, 0, 0]).x, stopPoint(m, i, [0, 0, 0]).z]);
    const north = stopPoint(m, i, [0, 0, -1]);
    const n = worldToShed(layout, [north.x, north.z]);
    near(n.u - at.u, 0, 1e-4, `stop ${i}: its north keeps u`);
    near(n.v - at.v, 1, 1e-4, `stop ${i}: its north is the shed's north`);
    const east = stopPoint(m, i, [1, 0, 0]);
    const e = worldToShed(layout, [east.x, east.z]);
    near(e.u - at.u, 1, 1e-4, `stop ${i}: its east is the shed's east`);
    near(e.v - at.v, 0, 1e-4, `stop ${i}: its east keeps v`);
    // in the stop's own frame its track's rails end at z = 0 (within the rails' skew from the shed's axis, 1.6 degrees at most)
    m.getMatrixAt(i, inverse);
    inverse.invert();
    const local = rails.map((p) => p.clone().applyMatrix4(inverse)).filter((p) => Math.abs(p.x) < 1.2 && Math.abs(p.z) < 6);
    assert.ok(local.length >= 8, `stop ${i}: its track's rails are found (${local.length} vertices)`);
    near(Math.max(...local.map((p) => p.z)), 0, 0.05, `stop ${i}: the rails end at the beam's face`);
  }
});

test('buffer stops: beam 2.4 x 0.5 m centred 1.0 m up on two posts 1.753 m apart, round buffers reaching 0.63 m north, a foundation 2.9 m across on the ground', () => {
  const geometry = stopsMesh(buildBufferStops(data, layout)).geometry;
  const v = vertices(geometry);
  const box = boxOf(geometry);
  near(box.min.x, -1.45, 1e-6, 'foundation, west edge');
  near(box.max.x, 1.45, 1e-6, 'foundation, east edge');
  near(box.min.y, GROUND_Y, 1e-6, 'the foundation stands on the ground and nothing is below it');
  near(box.max.y, 1.25, 1e-6, 'the beam is the highest part');
  near(box.min.z, -0.63, 1e-6, 'the buffers reach 0.63 m north of the track end');
  near(box.max.z, 0.9, 1e-6, 'the foundation is 0.9 m deep behind it');
  near(BUFFER_REACH, 0.63, 1e-9, 'BUFFER_REACH');
  // the beam's north face: the vertices on the plane z = 0 above the posts
  const face = v.filter((p) => Math.abs(p.z) < 1e-9 && p.y > 0.7);
  near(Math.max(...face.map((p) => p.x)) - Math.min(...face.map((p) => p.x)), 2.4, 1e-6, 'beam width');
  near(Math.min(...face.map((p) => p.y)), 0.75, 1e-6, 'beam underside');
  near(Math.max(...face.map((p) => p.y)), 1.25, 1e-6, 'beam top');
  // the posts: 0.22 m square, one behind each buffer, from the foundation up to the beam
  const posts = v.filter((p) => p.z > 0.03 && p.z < 0.27);
  assert.deepEqual(cluster(posts.map((p) => p.x), 1e-5).map((x) => Math.round(x * 1e4) / 1e4), [-0.9865, -0.7665, 0.7665, 0.9865], 'two posts, 1.753 m between their centres');
  near(Math.min(...posts.map((p) => p.y)), 0.08, 1e-6, 'the posts stand on the foundation');
  near(Math.max(...posts.map((p) => p.y)), 0.75, 1e-6, 'the posts reach the beam');
  // the buffers: a round head, ram and barrel about an axis 1.0 m over the rail head, one behind each head
  const radiiAt = (side: number, z: number): number[] =>
    v.filter((p) => Math.sign(p.x) === side && Math.abs(p.z - z) < 1e-6).map((p) => Math.hypot(p.x - side * 0.8765, p.y - 1.0));
  for (const side of [-1, 1]) {
    const head = v.filter((p) => Math.sign(p.x) === side && Math.abs(p.z + 0.63) < 1e-6);
    assert.ok(head.length >= 12, `buffer ${side}: the head has vertices (${head.length})`);
    near(head.reduce((s, p) => s + p.x, 0) / head.length, side * 0.8765, 1e-5, `buffer ${side}: axis across`);
    near(head.reduce((s, p) => s + p.y, 0) / head.length, 1.0, 1e-5, `buffer ${side}: axis height`);
    const head_r = radiiAt(side, -0.63);
    near(Math.max(...head_r), 0.19, 1e-5, `buffer ${side}: head radius`);
    assert.ok(head_r.filter((r) => r > 0.18).length >= 12, `buffer ${side}: the head is a ring of at least 12 vertices at its radius`);
    near(Math.max(...radiiAt(side, -0.34)), 0.13, 1e-5, `buffer ${side}: barrel radius`);
    near(Math.min(...radiiAt(side, -0.58).filter((r) => r > 0.01)), 0.085, 1e-5, `buffer ${side}: ram radius`);
  }
});

test('buffer stops: every triangle is wound the way its normal says, the beam face looks north and is covered exactly once, a colour per vertex', () => {
  const g = buildBufferStops(data, layout);
  const m = stopsMesh(g);
  const t = triangles(m.geometry);
  assert.ok(t.length >= 200 && t.length <= 400, `a stop is ${t.length} triangles`);
  let worst = 1;
  for (const x of t) worst = Math.min(worst, x.geometric.dot(x.stored));
  assert.ok(worst > 0.9, `a triangle's winding opposes its normal (cos ${worst.toFixed(3)})`);
  const face = t.filter((x) => x.p.every((p) => Math.abs(p.z) < 1e-9 && p.y > 0.7));
  assert.ok(face.length >= 20, `the face is ${face.length} triangles`);
  assert.ok(face.every((x) => x.geometric.z < -0.99), 'the beam face looks north');
  const area = face.reduce((s, x) => s + new THREE.Vector3().subVectors(x.p[1], x.p[0]).cross(new THREE.Vector3().subVectors(x.p[2], x.p[0])).length() / 2, 0);
  near(area, 2.4 * 0.5, 1e-5, 'the bands cover the beam face exactly once: no gaps, no overlap');
  assert.equal(m.geometry.getAttribute('color').count, m.geometry.getAttribute('position').count, 'a colour for every vertex');
  assert.equal((m.material as THREE.MeshLambertMaterial).vertexColors, true, 'the material reads them');
});

test('buffer stops: the chevron bands tile the beam face exactly, red and white alternating, and the built geometry mirrors them to the other half', () => {
  const bands = beamFaceBands();
  const contains = (poly: readonly (readonly [number, number])[], x: number, y: number): boolean => {
    const sides = poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length] as readonly [number, number];
      return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    });
    return sides.every((s) => s >= 0) || sides.every((s) => s <= 0);
  };
  const geometry = stopsMesh(buildBufferStops(data, layout)).geometry;
  const pos = geometry.getAttribute('position');
  const colours = geometry.getAttribute('color');
  const index = geometry.index as THREE.BufferAttribute;
  /** The green channel (red is about 0.02, white about 0.84) of the built face triangle that holds (x, y). */
  const faceGreen = (x: number, y: number): number => {
    for (let i = 0; i + 2 < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)] as [number, number, number];
      const p = ids.map((j) => [pos.getX(j), pos.getY(j), pos.getZ(j)] as [number, number, number]);
      if (!p.every((q) => Math.abs(q[2]) < 1e-9 && q[1] > 0.7)) continue;
      if (contains(p.map((q) => [q[0], q[1]] as const), x, y)) return colours.getY(ids[0]);
    }
    throw new Error(`no face triangle holds (${x}, ${y})`);
  };
  let white = 0;
  let red = 0;
  for (let ix = 0; ix < 48; ix++) {
    for (let iy = 0; iy < 20; iy++) {
      const x = ((ix + 0.37) / 48) * 1.2;
      const y = 0.75 + ((iy + 0.61) / 20) * 0.5;
      const owners = bands.filter((b) => contains(b.poly, x, y));
      assert.equal(owners.length, 1, `(${x.toFixed(3)}, ${y.toFixed(3)}) lies in ${owners.length} bands`);
      const isWhite = (owners[0] as { white: boolean }).white;
      if (isWhite) white++;
      else red++;
      for (const side of [1, -1]) assert.equal(faceGreen(side * x, y) > 0.4, isWhite, `the built face at (${(side * x).toFixed(3)}, ${y.toFixed(3)})`);
    }
  }
  assert.ok(white > 200 && red > 200, `both colours are well represented (${white} white, ${red} red of 960 samples)`);
  near(bands.reduce((s, b) => s + polygonArea(b.poly), 0), 1.2 * 0.5, 1e-9, 'the bands add up to half the face');
  assert.ok(bands.every((b) => b.poly.every(([x, y]) => x >= -1e-9 && x <= 1.2 + 1e-9 && y >= 0.75 - 1e-9 && y <= 1.25 + 1e-9)), 'every band lies inside the half face');
});


test('tunnel rails meet the surface railhead and live train wheel datum without a mouth step', () => {
  const fixture: Pick<KxData, 'nodes' | 'rails'> = {
    nodes: [[1, 10, -40], [2, 10, -80], [3, 10, -220], [4, 10, -260]],
    rails: [
      { id: 1, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 },
      { id: 2, nodes: [2, 3], ref: 'ECM1', service: 'main', tunnel: true, bridge: false, layer: -1 },
      { id: 3, nodes: [3, 4], service: 'main', tunnel: false, bridge: false, layer: 0 },
    ],
  };
  const group = buildTrack(fixture, FLAT);
  group.updateMatrixWorld(true);
  const line = group.getObjectByName('track-tunnel') as THREE.LineSegments;
  assert.ok(line?.isLineSegments);
  const points = vertices(line.geometry);
  assert.ok(points.length >= 2);
  for (const p of points) near(p.y, RAIL_TOP, 1e-9, 'tunnel track shares train wheels’ y=0 contact plane');
  assert.equal(RAIL_TOP, 0);
  const surface = mesh(group, 'track-rails');
  near(boxOf(surface.geometry).max.y, 0, 1e-9, 'surface railhead y=0');
  assert.deepEqual(points[0]?.toArray(), [10, 0, -80]);
  assert.deepEqual(points.at(-1)?.toArray(), [10, 0, -220]);
  const material = line.material as THREE.LineBasicMaterial;
  assert.equal(material.depthTest, true, 'terrain must occlude tunnel strokes');
  assert.equal(line.renderOrder, 0, 'tunnel strokes must not be a screen overlay');
});

test('only modelled ECML bores rise to the train datum; unrelated underground routes stay hidden', () => {
  const fixture: Pick<KxData, 'nodes' | 'rails'> = {
    nodes: [[1, 10, -80], [2, 10, -220], [3, 30, -80], [4, 30, -220], [5, 50, -80], [6, 50, -220]],
    rails: [
      { id: 1, nodes: [1, 2], ref: 'ECM1', service: 'main', tunnel: true, bridge: false, layer: -1 },
      { id: 2, nodes: [3, 4], ref: 'MCL', service: 'main', tunnel: true, bridge: false, layer: -2 },
      { id: 3, nodes: [5, 6], service: 'main', tunnel: true, bridge: false, layer: -1 },
    ],
  };
  const group = buildTrack(fixture, FLAT);
  const line = group.getObjectByName('track-tunnel') as THREE.LineSegments;
  assert.ok(line?.isLineSegments, 'the modelled bore stays drawn');
  assert.deepEqual(vertices(line.geometry).map(p => p.toArray()), [[10, 0, -80], [10, 0, -220]],
    'routes without modelled portals or rail elevations must not appear across flat ground');
  const unrelated = buildTrack({ ...fixture, rails: fixture.rails.slice(1) }, FLAT);
  assert.equal(unrelated.getObjectByName('track-tunnel'), undefined);
});


test('terrain and flat-mode portal banks hide level tunnel track from overview and in-shed cameras', () => {
  const fixture = {
    nodes: [[1, 10, -40], [2, 10, -80], [3, 10, -220], [4, 10, -260]],
    rails: [
      { id: 1, nodes: [1, 2], ref: 'ECM1', service: 'main', tunnel: false, bridge: false, layer: 0 },
      { id: 2, nodes: [2, 3], ref: 'ECM1', service: 'main', tunnel: true, bridge: false, layer: -1 },
      { id: 3, nodes: [3, 4], ref: 'ECM1', service: 'main', tunnel: false, bridge: false, layer: 0 },
    ],
    buildings: [], platforms: [], signals: [], switches: [], buffers: [],
  } as unknown as KxData;
  for (const mode of ['terrain', 'terrain=0', 'bare']) {
    const scene = new THREE.Scene();
    const track = buildTrack(fixture, FLAT); scene.add(track);
    if (mode === 'terrain') {
      const hill = terrainFromFunction((_, z) => z < -80 && z > -220 ? 8 : GROUND_Y,
        { x0: -64, x1: 64, z0: -320, z1: 0 }, 2);
      const ground = addTerrain(scene, hill, { exclude: portalHole(tunnelMouths(fixture)) }).ground;
      addPortals(scene, fixture, { terrain: ground });
    } else addPortals(scene, fixture); // main.ts retains these banks in both flat modes.
    scene.updateMatrixWorld(true);
    const blockers: THREE.Object3D[] = [];
    scene.traverseVisible(o => { if (o instanceof THREE.Mesh && o.parent !== track) blockers.push(o); });
    for (const camera of [[260, 380, 340], [48, 7.5, -16]]) for (const z of [-110, -150, -190]) {
      const origin = new THREE.Vector3(...camera), target = new THREE.Vector3(10, 0, z);
      const ray = new THREE.Raycaster(origin, target.clone().sub(origin).normalize(), 0, origin.distanceTo(target) - 0.01);
      const hit = ray.intersectObjects(blockers, false)[0];
      assert.ok(hit, `${mode} camera ${camera}: tunnel at ${z} leaks through its cover`);
      assert.match(hit.object.name, /^(terrain-|portals-)/);
      assert.ok(hit.distance < origin.distanceTo(target));
    }
  }
});

test('curves: the trackside readers take the drawn curves: platform edges classify against them and the tunnel cuttings follow them', () => {
  // furniture.ts trackSegments (which platform edges face a rail) is the drawn pieces of every surface track
  const surface = railSegments({ nodes: data.nodes, rails: data.rails.filter((r) => !r.tunnel) }, railShapes(data));
  const drawn = [...surface.main, ...surface.siding];
  const pieces = trackSegments(data)!;
  assert.equal(pieces.length, drawn.length / 6, 'one piece per drawn piece');
  const key = (a: Pt, b: Pt): string => (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? `${a}|${b}` : `${b}|${a}`);
  const want = new Set<string>();
  for (let i = 0; i + 5 < drawn.length; i += 6) want.add(key([drawn[i]!, drawn[i + 2]!], [drawn[i + 3]!, drawn[i + 5]!]));
  for (const [a, b] of pieces) assert.ok(want.has(key(a, b)), `piece ${a} - ${b} is not on the drawn track`);
  // landmarks.ts approachEnvelope (the cutting walls at a tunnel mouth): on a curved approach it measures the curve, not the chord
  const R = 120;
  const nodes: KxData['nodes'] = [];
  for (let k = 0; k <= 3; k++) { const a = (k * 30) / R; nodes.push([k + 1, R * (1 - Math.cos(a)), R * Math.sin(a)]); }
  const way = { nodes, rails: [{ id: 1, nodes: [1, 2, 3, 4], service: 'main' as const, tunnel: false, bridge: false, layer: 0 }] };
  const curve = railSegments(way, railShapes(way)).main;
  const mouth = { origin: [0, 0] as Pt, axis: [0, -1] as Pt, across: [1, 0] as Pt, halfWidth: 40 };
  const env = approachEnvelope(way, mouth, 90, 15, 10);
  // each station holds the rails sampled (every 1.5 m) within half a step of it: its widest is the drawn curve's widest over that window, less what the sampling misses
  const xAt = (z: number): number => {
    for (let i = 0; i + 5 < curve.length; i += 6) {
      const z0 = curve[i + 2]!, z1 = curve[i + 5]!;
      if ((z0 - z) * (z1 - z) <= 0 && z0 !== z1) return curve[i]! + (curve[i + 3]! - curve[i]!) * (z - z0) / (z1 - z0);
    }
    return NaN;
  };
  let checked = 0;
  for (const st of env) {
    if (st.hi === null || st.d < 10 || st.d + 7.5 > 90) continue;
    const x = Math.max(...[...curve.filter((_, i) => i % 3 === 2).map((z, i) => ({ z, x: curve[i * 3]! }))].filter((q) => q.z >= st.d - 7.5 && q.z <= st.d + 7.5).map((q) => q.x), ...[xAt(st.d + 7.5), xAt(st.d - 7.5)].filter(Number.isFinite));
    checked++;
    assert.ok(st.hi <= x + 1e-9 && st.hi > x - 0.3, `at ${st.d} m the envelope reaches ${st.hi.toFixed(2)}, the drawn rail ${x.toFixed(2)}`);
  }
  assert.ok(checked >= 4, `${checked} stations`);
});
