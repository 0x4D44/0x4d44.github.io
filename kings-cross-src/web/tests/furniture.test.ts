// The contract of web/src/furniture.ts: the platform slabs (heights, outward walls, UVs in metres),
// the edge strips (only on long track-facing runs, 1.6 m wide, inboard), and every rule that places
// furniture and canopies (inside the outline, behind the safety line, spaced as designed, no platform
// 11). Pure geometry on the real OSM data: no WebGL, no DOM (materials.ts then returns flat colours).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { PLATFORM_REFS, pointInPolygon, polygonArea, SHED_PLATFORM_REFS, SHED_SPAN_WIDTH, shedLayout, stationPlatforms, worldToShed } from '../../core/station.ts';
import { material, texelsPerMetre, TEXTURES } from '../src/materials.ts';
import { GROUND_Y } from '../src/world.ts';
import {
  bandAt,
  buildFurniture,
  buildPlatforms,
  classifyEdges,
  crossSection,
  distanceToEdges,
  FIGURES,
  furniturePlan,
  platformFrame,
  shedRoofY,
  stripChains,
  surfacePlatforms,
  trackSegments,
} from '../src/furniture.ts';
import type { Placement, TrackSegment } from '../src/furniture.ts';
import { EAST_ARCADE, eastArcadeU, NORTH_PIER, spineOpenings, SPINE_WALL, westernPassages } from '../src/shed.ts';
// Re-pinned 2026-11-24 (shed realignment, signed off): the vault centres are the spine -/+ R (aisle + R and aisle + 3R before, the same points while the aisles were even), the valley is the spine, and there is no west aisle, so a probe of 'the aisle' stands in the east aisle.

const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const tracks = trackSegments(data);
const surface = surfacePlatforms(data);
const outlines = surface.map((p) => p.pts);
const kx = stationPlatforms(data);
const platforms = buildPlatforms(data, layout);
const furniture = buildFurniture(data, layout);
const plan = furniturePlan(data, layout);

type V3 = [number, number, number];
interface Tri {
  p: [V3, V3, V3];
  uv: [number, number][];
  n: V3;
}
function tris(mesh: THREE.Mesh): Tri[] {
  const pos = mesh.geometry.getAttribute('position');
  const uv = mesh.geometry.getAttribute('uv');
  const nor = mesh.geometry.getAttribute('normal');
  // the shared builder (materials.ts Batch) makes indexed geometry: the corners of triangle t are index[3t..3t+2]
  const index = mesh.geometry.index;
  const count = index ? index.count : pos.count;
  const out: Tri[] = [];
  for (let i = 0; i + 2 < count; i += 3) {
    const v = (k: number): number => (index ? index.getX(i + k) : i + k);
    const at = (k: number): V3 => [pos.getX(v(k)), pos.getY(v(k)), pos.getZ(v(k))];
    out.push({ p: [at(0), at(1), at(2)], uv: [0, 1, 2].map((k) => [uv.getX(v(k)), uv.getY(v(k))] as [number, number]), n: [nor.getX(v(0)), nor.getY(v(0)), nor.getZ(v(0))] });
  }
  return out;
}
const part = (g: THREE.Group, name: string): THREE.Mesh => {
  const m = g.getObjectByName(name);
  assert.ok(m, `no ${name} in ${g.name}`);
  return m as THREE.Mesh;
};
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const geometricNormal = (p: [V3, V3, V3]): V3 => cross(sub(p[1], p[0]), sub(p[2], p[0]));
const triArea = (p: [V3, V3, V3]): number => Math.hypot(...geometricNormal(p)) / 2;
const centroidXZ = (p: [V3, V3, V3]): Pt => [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][2] + p[1][2] + p[2][2]) / 3];

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}
/** Distance from p to the infinite line through a and b. */
function lineDistance(p: Pt, a: Pt, b: Pt): number {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / l;
}
const boundaryDistance = (p: Pt, pts: readonly Pt[]): number => Math.min(...pts.map((a, i) => segmentDistance(p, a, pts[(i + 1) % pts.length] as Pt)));
const edgesOf = (pts: Pt[]) =>
  classifyEdges(
    pts,
    outlines.filter((o) => o !== pts),
    layout,
    tracks,
  );
const refs = [...kx.keys()];
const placements = (): Placement[] => [...plan.lamps, ...plan.benches, ...plan.helpPoints, ...plan.totems, ...plan.canopies.flatMap((c) => c.columns)];
const outline = (ref: string): Pt[] => (kx.get(ref) as { pts: Pt[] }).pts;

// ---------------------------------------------------------------------------------------------
// synthetic platforms: the classification rules one at a time

const L = { origin: [0, 0] as Pt, heading: 0, width: 72, length: 244 }; // heading 0: u = x, v = -z
const rect = (x0: number, x1: number, z0: number, z1: number, cw = false): Pt[] => {
  const r: Pt[] = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  return cw ? r.reverse() : r;
};
const rail = (x: number): TrackSegment => [[x, -400], [x, 0]];
const verticalEdge = <E extends { a: Pt; b: Pt }>(edges: E[], x: number): E => edges.find((e) => e.a[0] === x && e.b[0] === x) as E;

test('edge classification: a long edge with a rail beside it is a track edge, whichever way the outline winds', () => {
  for (const cw of [false, true]) {
    const edges = classifyEdges(rect(20, 25, -200, -20, cw), [], L, [rail(18.3)]);
    assert.equal(verticalEdge(edges, 20).kind, 'track', `west edge, cw=${cw}`);
    for (const e of edges) {
      const mid: Pt = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
      assert.ok(pointInPolygon([mid[0] + e.inward[0] * 0.1, mid[1] + e.inward[1] * 0.1], rect(20, 25, -200, -20)), `inward normal of edge ${e.index}, cw=${cw}`);
    }
  }
});

test('edge classification: a seam with another outline, a shed wall, a bare edge and an end are not track edges', () => {
  const a = rect(20, 25, -200, -20);
  const b = rect(25, 30, -200, -20);
  const island = classifyEdges(a, [b], L, [rail(18.3), rail(31.7)]);
  assert.equal(verticalEdge(island, 25).kind, 'shared', 'the seam between the two halves of an island');
  assert.equal(verticalEdge(island, 20).kind, 'track');
  assert.deepEqual(island.filter((e) => e.a[1] === e.b[1]).map((e) => e.kind), ['end', 'end'], 'the short ends');
  const bare = classifyEdges(rect(40, 45, -200, -20), [], L, [rail(38.3)]);
  assert.equal(verticalEdge(bare, 40).kind, 'track');
  assert.equal(verticalEdge(bare, 45).kind, 'open', 'no rail beside it');
  const noRails = classifyEdges(rect(40, 45, -200, -20), [], L, undefined);
  assert.equal(verticalEdge(noRails, 45).kind, 'track', 'with no rail data every long edge stays a track edge');
  const wall = classifyEdges(rect(0.5, 5, -200, -20), [], L, [rail(-1.2), rail(6.7)]);
  assert.equal(verticalEdge(wall, 0.5).kind, 'wall', 'within 2.5 m of the shed wall, rail or no rail');
  assert.equal(verticalEdge(wall, 5).kind, 'track');
  const past = classifyEdges(rect(0.5, 5, -300, -250), [], L, [rail(-1.2)]);
  assert.equal(verticalEdge(past, 0.5).kind, 'track', 'beyond the shed\'s length the wall is no longer there');
});

test('edge strips: a run under 12 m gets none; a bend is mitred so the strip is 1.6 m from both edges', () => {
  assert.deepEqual(stripChains(classifyEdges(rect(20, 25, -60, -52), [], L, [rail(18.3)])), [], 'an 8 m platform edge is too short');
  const poly: Pt[] = [[20, -20], [27, -20], [27, -200], [-10, -200], [20, -110]]; // the west edge bends at (20, -110)
  const bend = (a: Pt, b: Pt, d: number): TrackSegment => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n: Pt = [(a[1] - b[1]) / l, (b[0] - a[0]) / l]; // left of a->b: toward -x here, outside the polygon
    return [[a[0] + n[0] * d, a[1] + n[1] * d], [b[0] + n[0] * d, b[1] + n[1] * d]];
  };
  const edges = classifyEdges(poly, [], L, [bend([-10, -200], [20, -110], 1.7), bend([20, -110], [20, -20], 1.7)]);
  const chains = stripChains(edges);
  assert.equal(chains.length, 1);
  const chain = chains[0] as (typeof chains)[number];
  assert.equal(chain.edges.length, 2);
  assert.equal(chain.inner.length, 3);
  const [p3, p4, p0] = chain.outer as [Pt, Pt, Pt];
  const mid = chain.inner[1] as Pt;
  near(lineDistance(mid, p3, p4), FIGURES.stripWidth, 1e-9, 'the mitre point from the first edge');
  near(lineDistance(mid, p4, p0), FIGURES.stripWidth, 1e-9, 'the mitre point from the second edge');
  near(lineDistance(chain.inner[0] as Pt, p3, p4), FIGURES.stripWidth, 1e-9, 'the first inner end');
  near(lineDistance(chain.inner[2] as Pt, p4, p0), FIGURES.stripWidth, 1e-9, 'the last inner end');
  assert.ok(chain.s[2] > chain.s[1] && chain.s[1] > 0, 'distance along the strip grows');
});

test('crossSection and bandAt: the safety line, with its slack, is kept from a track edge and the margin from any other edge', () => {
  const pts = rect(40, 45, -200, -20);
  const sec = crossSection(pts, [0, -1], 100) as NonNullable<ReturnType<typeof crossSection>>;
  assert.ok(sec);
  near(sec.hi - sec.lo, 5, 1e-9, 'the section is the platform width');
  assert.equal(crossSection(pts, [0, -1], 300), null, 'past the end of the platform there is none');
  const f = platformFrame('x', pts, [], L, [rail(38.3)]);
  near(f.axis[1], -1, 1e-9, 'the axis points north');
  const half = 0.25;
  const band = bandAt(f, 100, half) as NonNullable<ReturnType<typeof bandAt>>;
  assert.ok(band);
  // n = (-axis.z, axis.x) = (1, 0): s = x. The rail is on the west (track), the east edge is bare
  near(band.s0, 40 + FIGURES.safetyLine + FIGURES.safetySlack + half, 1e-9, 'west bound: safety line + slack + half the item');
  near(band.s1, 45 - FIGURES.otherMargin - half, 1e-9, 'east bound: margin + half the item');
  assert.ok(band.loTrack && !band.hiTrack);
  const both = platformFrame('x', pts, [], L, [rail(38.3), rail(46.7)]);
  assert.equal(bandAt(both, 100, 1.2), null, 'two safety lines leave no room for a 2.4 m item on a 5 m platform');
  assert.ok(bandAt(both, 100, 0.25), 'but a bench fits');
});

// ---------------------------------------------------------------------------------------------
// the platform meshes

test('buildPlatforms: three meshes with the shared materials, and a strip material with a polygon offset', () => {
  assert.deepEqual(platforms.children.map((c) => c.name), ['platform-tops', 'platform-walls', 'platform-edges']);
  assert.equal(part(platforms, 'platform-tops').material, material('asphalt'));
  assert.equal(part(platforms, 'platform-walls').material, material('concrete'));
  const strip = part(platforms, 'platform-edges').material as THREE.MeshLambertMaterial;
  const edge = material('platformEdge') as THREE.MeshLambertMaterial;
  assert.notEqual(strip, edge, 'cloned, so the shared material keeps no polygon offset');
  assert.equal(edge.polygonOffset, false);
  assert.equal(strip.polygonOffset, true);
  assert.ok(strip.polygonOffsetFactor < 0 && strip.polygonOffsetUnits < 0, 'pulled toward the camera');
  assert.equal(strip.map, edge.map, 'the same texture');
  assert.equal(platforms.userData.platforms, surface.length);
});

test('platforms: the tops sit at PLATFORM_HEIGHT, the walls run from the ground to it, the strips a hair above', () => {
  const tops = tris(part(platforms, 'platform-tops'));
  assert.ok(tops.length > 100);
  for (const t of tops) for (const v of t.p) near(v[1], PLATFORM_HEIGHT, 1e-6, 'a top vertex');
  const ys = tris(part(platforms, 'platform-walls')).flatMap((t) => t.p.map((v) => v[1]));
  near(Math.min(...ys), GROUND_Y, 1e-6, 'the bottom of the walls');
  near(Math.max(...ys), PLATFORM_HEIGHT, 1e-6, 'the top of the walls');
  const lifts = tris(part(platforms, 'platform-edges')).flatMap((t) => t.p.map((v) => v[1] - PLATFORM_HEIGHT));
  assert.ok(lifts.length > 100);
  for (const lift of lifts) assert.ok(lift > 0 && lift <= 0.05, `a strip vertex is ${lift} m above the surface`);
  near(FIGURES.stripLift, lifts[0] as number, 1e-6, 'the lift is the documented one');
});

test('platforms: every outline is triangulated exactly (the areas add up) and every top faces up', () => {
  const tops = tris(part(platforms, 'platform-tops'));
  const area = tops.reduce((s, t) => s + triArea(t.p), 0);
  const expected = surface.reduce((s, p) => s + polygonArea(p.pts), 0);
  near(area, expected, expected * 1e-6, 'the total area of the tops');
  for (const t of tops) {
    assert.ok(geometricNormal(t.p)[1] > 0, 'a top triangle is wound upward');
    assert.deepEqual(t.n, [0, 1, 0]);
  }
});

test('platforms: top UVs are in metres (u = x, v = -z): their span is the world span, so the asphalt is neither stretched nor squeezed', () => {
  const tops = tris(part(platforms, 'platform-tops'));
  for (const t of tops) {
    for (let k = 0; k < 3; k++) {
      near(t.uv[k]![0], t.p[k]![0], 1e-6, 'u is the east coordinate');
      near(t.uv[k]![1], -t.p[k]![2], 1e-6, 'v is the north coordinate');
    }
    const span = (vals: number[]): number => Math.max(...vals) - Math.min(...vals);
    near(span(t.uv.map((q) => q[0])), span(t.p.map((q) => q[0])), 1e-6, 'u span equals the x span');
    near(span(t.uv.map((q) => q[1])), span(t.p.map((q) => q[2])), 1e-6, 'v span equals the z span');
  }
  // one asphalt tile covers `tile` metres and carries `px` texels, as materials.ts promises
  const [tx, ty] = texelsPerMetre(TEXTURES.asphalt);
  assert.equal(tx, ty, 'square texels');
  assert.ok(tx >= TEXTURES.asphalt.density[0] && tx <= TEXTURES.asphalt.density[1], `${tx} texels per metre`);
});

test('platforms: every wall faces away from its platform, and no wall stands on a seam between two outlines', () => {
  const walls = tris(part(platforms, 'platform-walls'));
  assert.ok(walls.length > 100);
  for (const t of walls) {
    const c = centroidXZ(t.p);
    const g = geometricNormal(t.p);
    assert.ok(dot3(g, t.n) > 0.999 * Math.hypot(...g), 'the winding agrees with the stored normal');
    assert.equal(t.n[1], 0, 'a wall is vertical');
    const owner = surface.find((p) => boundaryDistance(c, p.pts) < 1e-3);
    assert.ok(owner, `a wall at ${c} is on no outline`);
    assert.ok(!pointInPolygon([c[0] + t.n[0] * 0.1, c[1] + t.n[2] * 0.1], (owner as { pts: Pt[] }).pts), 'just outside the wall is outside the platform');
    assert.ok(pointInPolygon([c[0] - t.n[0] * 0.1, c[1] - t.n[2] * 0.1], (owner as { pts: Pt[] }).pts), 'just inside is inside');
  }
  let seams = 0;
  for (const p of surface) {
    for (const e of edgesOf(p.pts)) {
      if (e.kind !== 'shared') continue;
      seams++;
      for (const t of walls) assert.ok(segmentDistance(centroidXZ(t.p), e.a, e.b) > 1e-3, `a wall on the seam at ${e.a}`);
    }
  }
  assert.ok(seams >= 20, `only ${seams} seams found: the islands should be two outlines each`);
});

test('edge strips: laid only on long runs of track-facing edges, never on a shed wall, a seam or a bare edge', () => {
  const perRef = new Map<string, number>();
  for (const p of surface) {
    const edges = edgesOf(p.pts);
    for (const chain of stripChains(edges)) {
      if (kx.get(p.ref ?? '')?.id === p.id) perRef.set(p.ref ?? '?', (perRef.get(p.ref ?? '?') ?? 0) + 1); // the King's Cross platforms only: St Pancras has refs 1-12 too
      const total = chain.edges.reduce((s, k) => s + (edges[k] as { length: number }).length, 0);
      assert.ok(total >= FIGURES.minTrackRun, `platform ${p.ref}: a strip run of only ${total} m`);
      for (const k of chain.edges) {
        const e = edges[k] as (typeof edges)[number];
        assert.equal(e.kind, 'track', `platform ${p.ref} edge ${k}`);
        for (const pt of [e.a, e.b]) {
          const s = worldToShed(layout, pt);
          if (s.v > -2 && s.v < layout.length + 2) assert.ok(Math.abs(s.u) > 1.5 && Math.abs(s.u - layout.width) > 1.5, `platform ${p.ref}: a strip end at u = ${s.u} on a shed wall`);
        }
      }
    }
  }
  // regression table, from the OSM data: every King's Cross platform has a strip on its track side(s), and
  // only there. P8's west face is a shed wall. P9's reconstructed north extension has
  // an exposed east face beside rail 8, so it now has a second, short strip run.
  const expected: Record<string, number> = { '0': 1, '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '7': 1, '8': 1, '9': 2, '10': 2 };
  for (const ref of PLATFORM_REFS) assert.equal(perRef.get(ref), expected[ref], `strip runs on platform ${ref}`);
  const p8 = surface.find((p) => p.ref === '8' && kx.get('8') === p) as { pts: Pt[] };
  for (const chain of stripChains(edgesOf(p8.pts))) for (const v of chain.outer) assert.ok(worldToShed(layout, v).u > 3, `platform 8 has a strip at u = ${worldToShed(layout, v).u}, on its wall side`);
});

interface StripQuad {
  outer: [Pt, Pt];
  inner: [Pt, Pt];
  /** (u, v) of the two outer corners and of the two inner ones, each pair ordered by v */
  outerUV: [number, number][];
  innerUV: [number, number][];
}

/** The strip mesh as quads: two triangles each, the two corners on the platform edge (u = 0) and the two inboard of it. */
function stripQuads(): StripQuad[] {
  const t = tris(part(platforms, 'platform-edges'));
  assert.equal(t.length % 2, 0);
  const out: StripQuad[] = [];
  for (let i = 0; i < t.length; i += 2) {
    const verts = new Map<string, { p: Pt; uv: [number, number] }>();
    for (const tri of [t[i], t[i + 1]] as Tri[]) tri.p.forEach((q, k) => verts.set(`${q[0]},${q[2]}`, { p: [q[0], q[2]], uv: tri.uv[k] as [number, number] }));
    const vs = [...verts.values()];
    assert.equal(vs.length, 4, 'a strip quad has four distinct corners');
    const o = vs.filter((q) => Math.abs(q.uv[0]) < 1e-6).sort((a, b) => a.uv[1] - b.uv[1]) as [(typeof vs)[number], (typeof vs)[number]];
    const n = vs.filter((q) => Math.abs(q.uv[0]) >= 1e-6).sort((a, b) => a.uv[1] - b.uv[1]) as [(typeof vs)[number], (typeof vs)[number]];
    assert.equal(o.length, 2, 'two corners on the edge (u = 0)');
    assert.equal(n.length, 2, 'two corners inboard of it');
    out.push({ outer: [o[0].p, o[1].p], inner: [n[0].p, n[1].p], outerUV: [o[0].uv, o[1].uv], innerUV: [n[0].uv, n[1].uv] });
  }
  return out;
}
/** On the outline counts as inside: the strip's end corners are cut exactly onto it, and the mesh holds float32 (0.1 mm at 1.4 km out), so allow a millimetre. */
const insideOrOn = (p: Pt, pts: Pt[]): boolean => pointInPolygon(p, pts) || boundaryDistance(p, pts) < 1e-3;

test('edge strips: UVs in metres (u in from the edge, v along it), 1.6 m deep or less, 1.6 m almost everywhere, and inside the platform', () => {
  assert.equal(FIGURES.stripWidth, 1.6, 'the brief asks for a 1.6 m edge strip');
  assert.equal(FIGURES.stripWidth, TEXTURES.platformEdge.tile[0], 'one tile of the platformEdge texture across, so it is drawn at its own scale');
  const quads = stripQuads();
  assert.ok(quads.length >= 40, `${quads.length} strip quads`);
  let full = 0;
  for (const q of quads) {
    const [o0, o1] = q.outer;
    const length = Math.hypot(o1[0] - o0[0], o1[1] - o0[1]);
    const dir: Pt = [(o1[0] - o0[0]) / length, (o1[1] - o0[1]) / length];
    near(q.outerUV[1][1] - q.outerUV[0][1], length, 1e-3, 'v grows by the length of the edge in metres');
    q.inner.forEach((p, k) => {
      const [u, v] = q.innerUV[k] as [number, number];
      near(u, lineDistance(p, o0, o1), 1e-3, 'u is the distance in from the edge, in metres');
      near(v - q.outerUV[0][1], (p[0] - o0[0]) * dir[0] + (p[1] - o0[1]) * dir[1], 1e-3, 'v is the distance along the edge, in metres');
      assert.ok(u > 0.2 && u <= FIGURES.stripWidth + 1e-6, `an inner corner ${u} m in`);
      if (u >= FIGURES.stripWidth - 1e-6) full++;
    });
    const owner = surface.find((p) => boundaryDistance(o0, p.pts) < 1e-3 && boundaryDistance(o1, p.pts) < 1e-3);
    assert.ok(owner, `the strip edge at ${o0} lies on no outline`);
    const c: Pt = [(o0[0] + o1[0] + q.inner[0][0] + q.inner[1][0]) / 4, (o0[1] + o1[1] + q.inner[0][1] + q.inner[1][1]) / 4];
    assert.ok(insideOrOn(c, (owner as { pts: Pt[] }).pts), `the centre of the strip at ${c} is outside its platform`);
    for (const p of q.inner) assert.ok(insideOrOn(p, (owner as { pts: Pt[] }).pts), `an inner corner at ${p} is outside platform ${(owner as { ref?: string }).ref}`);
  }
  assert.ok(full >= 0.95 * quads.length * 2, `only ${full} of ${quads.length * 2} inner corners are the full ${FIGURES.stripWidth} m deep`);
});

test('edge strips: no two strips overlap (their coplanar textures would fight), not even at the tapering tip of platform 10', () => {
  const quads = stripQuads().map((q) => {
    const pts: Pt[] = [q.outer[0], q.outer[1], q.inner[1], q.inner[0]];
    return { pts, samples: [0.1, 0.3, 0.5, 0.7, 0.9].flatMap((a) => [0.1, 0.3, 0.5, 0.7, 0.9].map((b): Pt => [
      (q.outer[0][0] * (1 - a) + q.outer[1][0] * a) * (1 - b) + (q.inner[0][0] * (1 - a) + q.inner[1][0] * a) * b,
      (q.outer[0][1] * (1 - a) + q.outer[1][1] * a) * (1 - b) + (q.inner[0][1] * (1 - a) + q.inner[1][1] * a) * b,
    ])) };
  });
  for (const [i, a] of quads.entries()) {
    for (const [j, b] of quads.entries()) {
      if (i === j) continue;
      for (const s of a.samples) assert.ok(!pointInPolygon(s, b.pts), `strip quads ${i} and ${j} overlap near ${s}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// where things go

test('furniture: platforms 0-10 and no platform 11 anywhere', () => {
  assert.deepEqual([...kx.keys()].sort((a, b) => Number(a) - Number(b)), [...PLATFORM_REFS], 'the King\'s Cross platforms are 0-10');
  const known = new Set<string>(PLATFORM_REFS);
  for (const p of placements()) assert.ok(known.has(p.ref), `a piece of furniture on platform ${p.ref}`);
  for (const c of plan.canopies) assert.ok(known.has(c.ref), `a canopy on platform ${c.ref}`);
  assert.ok(!placements().some((p) => p.ref === '11') && !plan.canopies.some((c) => c.ref === '11'));
  assert.equal(furniture.getObjectByName('platform-11'), undefined);
});

test('furniture: every piece stands inside its own platform outline and keeps the safety line from every track-facing edge', () => {
  const all = placements();
  assert.ok(all.length > 200, `${all.length} pieces`);
  for (const p of all) {
    const pts = outline(p.ref);
    const at: Pt = [p.x, p.z];
    assert.ok(pointInPolygon(at, pts), `a piece on platform ${p.ref} at ${at} is outside it`);
    const d = distanceToEdges(at, edgesOf(pts));
    assert.ok(d >= FIGURES.safetyLine, `a piece on platform ${p.ref} is ${d.toFixed(2)} m from a track-facing edge`);
    assert.ok(d - p.across >= FIGURES.safetyLine - 0.05, `a piece on platform ${p.ref} reaches ${(d - p.across).toFixed(2)} m from a track-facing edge`);
    assert.ok(Number.isFinite(p.rotY));
  }
});

test('furniture: no two pieces on the platform overlap', () => {
  const ground = [...plan.lamps, ...plan.benches, ...plan.helpPoints, ...plan.canopies.flatMap((c) => c.columns)];
  for (const [i, a] of ground.entries()) {
    for (const b of ground.slice(i + 1)) {
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.r + b.r, `two pieces on platform ${a.ref}/${b.ref} overlap near (${a.x.toFixed(1)}, ${a.z.toFixed(1)})`);
    }
  }
});

/** Along-platform coordinates of a platform's pieces, ascending. */
function alongOf(ref: string, list: Placement[]): number[] {
  const f = platformFrame(ref, outline(ref), [], layout);
  return list.filter((p) => p.ref === ref).map((p) => p.x * f.axis[0] + p.z * f.axis[1]).sort((a, b) => a - b);
}
const gaps = (v: number[]): number[] => v.slice(1).map((x, i) => x - (v[i] as number));
/**
 * Pieces sit at slots `spacing` apart, each slid forward by a whole number of steps of maxShift / steps
 * (0 to `steps` of them) to clear what is in the way, so two neighbours are `spacing` plus a difference of two shifts apart.
 */
function assertShiftedSpacing(gap: number, spacing: number, steps: number, what: string): void {
  const step = FIGURES.maxShift / steps;
  const k = (gap - spacing) / step;
  assert.ok(Math.abs(k - Math.round(k)) < 1e-6 && Math.abs(Math.round(k)) <= steps, `${what}: a gap of ${gap} m is not ${spacing} m plus a whole number (at most ${steps}) of ${step} m steps`);
}

test('furniture: lamps stand 24 m apart on platforms 9 and 10, and elsewhere only on the open ends north of the shed', () => {
  for (const ref of ['9', '10']) {
    const ts = alongOf(ref, plan.lamps);
    assert.ok(ts.length >= 5, `platform ${ref} has ${ts.length} lamps`);
    for (const g of gaps(ts)) near(g, FIGURES.lampSpacing, 1e-6, `lamp spacing on ${ref}`);
  }
  for (const l of plan.lamps) {
    const { u, v } = worldToShed(layout, [l.x, l.z]);
    if (l.ref === '9' || l.ref === '10') continue;
    assert.ok(v > layout.length + 3, `a lamp on platform ${l.ref} at v = ${v.toFixed(1)} is under the shed, which lights its own platforms (u = ${u.toFixed(1)})`);
  }
  assert.ok(plan.lamps.some((l) => l.ref !== '9' && l.ref !== '10'), 'the open platform ends have lamps too');
});

test('furniture: benches come in pairs 2.4 m apart facing the same way, at least one pair on every platform', () => {
  for (const ref of PLATFORM_REFS) {
    const list = plan.benches.filter((b) => b.ref === ref);
    assert.ok(list.length >= 4 && list.length % 2 === 0, `platform ${ref} has ${list.length} benches`);
    for (let i = 0; i < list.length; i += 2) {
      const a = list[i] as Placement;
      const b = list[i + 1] as Placement;
      near(Math.hypot(a.x - b.x, a.z - b.z), FIGURES.benchPairGap, 0.15, `the pair on platform ${ref}`);
      near(a.rotY, b.rotY, 1e-9, 'a pair faces the same way');
    }
    const ts = alongOf(ref, list.filter((_, i) => i % 2 === 0));
    for (const g of gaps(ts)) assertShiftedSpacing(g, FIGURES.benchSpacing, 3, `bench pairs on platform ${ref}`);
  }
  // a bench faces the track edge nearest it (checked where there is one track side)
  for (const b of plan.benches) {
    if (b.ref === '9' || b.ref === '10') continue;
    const edges = edgesOf(outline(b.ref)).filter((e) => e.kind === 'track');
    const nearest = edges.reduce((best, e) => (segmentDistance([b.x, b.z], e.a, e.b) < segmentDistance([b.x, b.z], best.a, best.b) ? e : best));
    const front: Pt = [Math.sin(b.rotY), Math.cos(b.rotY)];
    assert.ok(-(front[0] * nearest.inward[0] + front[1] * nearest.inward[1]) > 0.8, `a bench on platform ${b.ref} does not face its track edge`);
  }
});

test('furniture: help points are one slot every 80 m along each platform, between the south and north margins', () => {
  for (const ref of PLATFORM_REFS) {
    const f = platformFrame(ref, outline(ref), [], layout);
    const room = f.tHi - f.tLo - FIGURES.endSouth - FIGURES.endNorth;
    const ts = alongOf(ref, plan.helpPoints);
    const fits = Math.floor(room / FIGURES.helpSpacing);
    assert.ok(ts.length >= Math.max(1, fits) && ts.length <= fits + 1, `platform ${ref} (${room.toFixed(0)} m of room) has ${ts.length} help points, expected ${fits} or ${fits + 1}`);
    for (const g of gaps(ts)) assertShiftedSpacing(g, FIGURES.helpSpacing, 4, `help points on platform ${ref}`);
    for (const t of ts) assert.ok(t >= f.tLo + FIGURES.endSouth - 1e-6 && t <= f.tHi - FIGURES.endNorth + FIGURES.maxShift + 1e-6, `a help point at ${t - f.tLo} m from the south end of platform ${ref}`);
  }
});

// Round 7 scorer (B5, shed-a-north-from-footbridge-2019): no screen hangs under the roof; platform information stands on post-mounted totems.
// Replaces the hanging screens' '30 m apart, roof height above each' test: the totems' measured count and spacing instead.
test('furniture: departure totems stand only on platforms 0-8 under the shed, two or three a platform, 55-115 m apart', () => {
  const shed = new Set<string>(SHED_PLATFORM_REFS);
  for (const s of plan.totems) assert.ok(shed.has(s.ref), `a totem on platform ${s.ref}`);
  for (const ref of SHED_PLATFORM_REFS) {
    const list = plan.totems.filter((s) => s.ref === ref);
    assert.ok(list.length >= 2 && list.length <= 3, `platform ${ref} has ${list.length} totems`);
    for (const g of gaps(alongOf(ref, list))) assert.ok(g >= 55 && g <= 115, `totems ${g.toFixed(1)} m apart on platform ${ref}`);
  }
  for (const s of plan.totems) {
    const { u, v } = worldToShed(layout, [s.x, s.z]);
    assert.ok(v >= FIGURES.totemSouth - 3.1 && v <= layout.length - FIGURES.totemNorth && u > 0 && u < layout.width, `a totem at (${u.toFixed(1)}, ${v.toFixed(1)}) is not under the shed`);
  }
});

test('furniture: every totem stands behind the safety line, clear of every bench, and its whole footprint is on its platform', () => {
  const hw = FIGURES.totemWidth / 2, hd = FIGURES.totemDepth / 2;
  for (const s of plan.totems) {
    const pts = outline(s.ref);
    const d = distanceToEdges([s.x, s.z], classifyEdges(pts, outlines.filter((o) => o !== pts), layout, tracks));
    assert.ok(d >= FIGURES.safetyLine + hw, `a totem on platform ${s.ref} is ${d.toFixed(2)} m from a track edge`);
    const c = Math.cos(s.rotY), n = Math.sin(s.rotY);
    for (const i of [-1, 1]) for (const k of [-1, 1]) assert.ok(pointInPolygon([s.x + c * i * hw + n * k * hd, s.z - n * i * hw + c * k * hd], pts), `a corner of a totem on platform ${s.ref} is off it`);
    for (const b of plan.benches) {
      const gap = Math.hypot(b.x - s.x, b.z - s.z) - b.r - s.r;
      assert.ok(gap >= FIGURES.gap - 1e-9, `a totem on platform ${s.ref} is ${gap.toFixed(2)} m from a bench`);
    }
  }
});

test('furniture: a totem near an arcaded wall stands before a pier, not an opening, and none stands in a gateline passage', () => {
  const ribs = spineOpenings(layout.length); // bay middles
  const hd = FIGURES.totemDepth / 2;
  const blocked = (u: number): [number, number][] => {
    const out: [number, number][] = [];
    if (Math.abs(u - layout.spine) < FIGURES.totemWallReach) for (const m of ribs) for (const c of [m - SPINE_WALL.pitch / 2, m + SPINE_WALL.pitch / 2]) out.push([c - SPINE_WALL.opening / 2, c + SPINE_WALL.opening / 2]);
    if (Math.abs(u - eastArcadeU(layout)) < FIGURES.totemWallReach || u < FIGURES.totemWallReach) for (const m of ribs) out.push([m - EAST_ARCADE.opening / 2, m + EAST_ARCADE.opening / 2]);
    if (u < FIGURES.totemWallReach) out.push(...westernPassages());
    return out;
  };
  let nearWall = 0;
  for (const s of plan.totems) {
    const { u, v } = worldToShed(layout, [s.x, s.z]);
    const spans = blocked(u);
    if (spans.length) nearWall++;
    for (const [lo, hi] of spans) assert.ok(v + hd <= lo || v - hd >= hi, `a totem on platform ${s.ref} at v ${v.toFixed(2)} stands before an opening ${lo.toFixed(2)}-${hi.toFixed(2)}`);
  }
  assert.ok(nearWall >= 6, `${nearWall} totems near an arcaded wall`);
});

test('buildFurniture: no screen in the shed hangs: every one is carried by a totem standing on a platform top, and nothing reaches above it', () => {
  assert.ok(!furniture.getObjectByName('screen-rods'), 'no rods hang from the roof');
  assert.ok(!furniture.getObjectByName('screens'), 'no hung screens');
  const totems = part(furniture, 'totems') as unknown as THREE.InstancedMesh;
  assert.equal(totems.count, plan.totems.length);
  totems.geometry.computeBoundingBox();
  const box = totems.geometry.boundingBox as THREE.Box3;
  near(box.min.y, 0, 1e-9, 'the totem starts at its foot');
  near(box.max.y, FIGURES.totemHeight, 1e-9, 'and is the totem\'s height');
  const m = new THREE.Matrix4();
  plan.totems.forEach((s, i) => {
    totems.getMatrixAt(i, m);
    near(m.elements[13]!, PLATFORM_HEIGHT, 1e-5, `the foot of totem ${i} is on the platform top`);
    assert.ok(pointInPolygon([m.elements[12]!, m.elements[14]!], outline(s.ref)), `totem ${i} stands on platform ${s.ref}`);
  });
  // the screens (group 1) lie within the slab's face, under its header
  const group = totems.geometry.groups[1]!;
  const pos = totems.geometry.getAttribute('position');
  const idx = totems.geometry.index!;
  for (let k = group.start; k < group.start + group.count; k++) {
    const i = idx.getX(k);
    assert.ok(pos.getY(i) > 0.3 && pos.getY(i) <= FIGURES.totemHeight - FIGURES.totemHeader + 1e-9, 'a screen corner within the slab, under the header');
    assert.ok(Math.abs(pos.getX(i)) <= FIGURES.totemWidth / 2, 'within the slab\'s width');
  }
  const inShed = new THREE.Box3().setFromObject(furniture);
  assert.ok(inShed.max.y <= PLATFORM_HEIGHT + Math.max(FIGURES.totemHeight, FIGURES.lampHeight, FIGURES.canopyHeight) + 1e-6, 'nothing hangs above the furniture standing on the platforms');
});

test('night: the totems\' screens glow: an unlit face on both sides of every totem', () => {
  const totems = part(furniture, 'totems') as unknown as THREE.InstancedMesh;
  const mats = totems.material as THREE.Material[];
  assert.ok(Array.isArray(mats) && mats.length === 2);
  const face = mats[1] as THREE.MeshBasicMaterial;
  assert.ok(face instanceof THREE.MeshBasicMaterial, 'the face takes no light: it is as bright at night as by day');
  assert.ok(face.color.getHex() > 0 && face.visible, 'and it is not black');
  const g = totems.geometry.groups[1]!;
  assert.equal(g.count, 12, 'two quads, one a face');
  const nor = totems.geometry.getAttribute('normal'), idx = totems.geometry.index!;
  const zs = new Set<number>();
  for (let k = g.start; k < g.start + g.count; k++) zs.add(Math.sign(nor.getZ(idx.getX(k))));
  assert.ok(zs.size === 2 && zs.has(-1) && zs.has(1), 'facing both ways along the platform');
});

test('shedRoofY: the crown over each arch centre, the springing over the aisles and where the two arches meet', () => {
  const r = SHED_SPAN_WIDTH / 2;
  near(shedRoofY(layout, layout.spine - r), layout.crown, 1e-9, 'west crown');
  near(shedRoofY(layout, layout.spine + r), layout.crown, 1e-9, 'east crown');
  near(shedRoofY(layout, layout.spine), layout.springing, 1e-9, 'the valley between the arches');
  near(shedRoofY(layout, 0), layout.springing, 1e-9, 'the west wall, where the west vault springs (no west aisle since 2026-11-24: the probe was u = 1 in the aisle)');
  near(shedRoofY(layout, layout.width - 1), layout.springing, 1e-9, 'the east aisle');
  assert.ok(shedRoofY(layout, layout.spine - 1.5 * r) > layout.springing && shedRoofY(layout, layout.spine - 1.5 * r) < layout.crown);
});

test('canopies: only on platforms 9 and 10, 5.2 m up, over the platform\'s own outline and nowhere else', () => {
  assert.deepEqual(plan.canopies.map((c) => c.ref).sort(), ['10', '9']);
  for (const c of plan.canopies) {
    near(c.roofY, PLATFORM_HEIGHT + FIGURES.canopyHeight, 1e-9, 'roof height');
    const pts = outline(c.ref);
    for (const pt of [...c.left, ...c.right, ...c.crossBeams.flat()]) {
      assert.ok(pointInPolygon(pt, pts), `canopy ${c.ref} has a beam point over the track side at ${pt}`);
      assert.ok(boundaryDistance(pt, pts) >= FIGURES.canopyInset - 1e-6, `canopy ${c.ref} reaches the platform edge`);
    }
    assert.equal(c.left.length, c.right.length);
    assert.ok(c.left.length >= 4);
    assert.ok(c.columns.length >= 10, `canopy ${c.ref} has ${c.columns.length} columns`);
    for (const g of gaps(alongOf(c.ref, c.columns))) near(g, FIGURES.canopyColumnSpacing, 1e-6, 'column spacing');
  }
  // the built meshes agree: every vertex of the roof and its steel is inside one of the two outlines
  const inside = (x: number, z: number): boolean => ['9', '10'].some((r) => pointInPolygon([x, z], outline(r)));
  for (const name of ['canopy-glass', 'canopy-steel']) {
    const pos = part(furniture, name).geometry.getAttribute('position');
    assert.ok(pos.count > 0);
    for (let i = 0; i < pos.count; i++) assert.ok(inside(pos.getX(i), pos.getZ(i)), `${name} has a vertex at (${pos.getX(i).toFixed(2)}, ${pos.getZ(i).toFixed(2)}) outside platforms 9 and 10`);
  }
  const top = new THREE.Box3().setFromObject(part(furniture, 'canopy-steel'));
  near(top.max.y, PLATFORM_HEIGHT + FIGURES.canopyHeight, 1e-5, 'the highest steel is the roof edge');
  near(top.min.y, PLATFORM_HEIGHT, 1e-6, 'the columns stand on the platform');
});

// ---------------------------------------------------------------------------------------------
// the built meshes

function counts(root: THREE.Object3D): { calls: number; triangles: number } {
  let calls = 0;
  let triangles = 0;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const index = o.geometry.index;
    const n = (index ? index.count : o.geometry.getAttribute('position').count) / 3;
    const instances = o instanceof THREE.InstancedMesh ? o.count : 1;
    if (Array.isArray(o.material)) {
      calls += o.geometry.groups.length;
      triangles += n * instances;
    } else {
      calls += 1;
      triangles += n * instances;
    }
  });
  return { calls, triangles };
}

test('buildFurniture: one instanced mesh per kind, counts as planned', () => {
  const named = (name: string): THREE.InstancedMesh => part(furniture, name) as unknown as THREE.InstancedMesh;
  assert.equal(named('lamps').count, plan.lamps.length);
  assert.equal(named('benches').count, plan.benches.length);
  assert.equal(named('help-points').count, plan.helpPoints.length);
  assert.equal(named('totems').count, plan.totems.length);
  assert.deepEqual(furniture.userData.counts, { lamps: plan.lamps.length, benches: plan.benches.length, helpPoints: plan.helpPoints.length, totems: plan.totems.length, canopies: 2, columns: plan.canopies.reduce((n, c) => n + c.columns.length, 0) });
  // a totem faces along the platform: its two screens are the last group and the same picture shows from both sides
  const totems = named('totems');
  assert.equal(totems.geometry.groups.length, 2);
  assert.ok(Array.isArray(totems.material) && (totems.material as THREE.Material[]).length === 2);
});

test('buildFurniture: the face of a screen is a flat colour where there is no document, and both functions fit the draw-call budget', () => {
  const faces = (part(furniture, 'totems').material as THREE.MeshBasicMaterial[])[1] as THREE.MeshBasicMaterial;
  assert.equal(faces.map, null, 'the canvas is drawn only when there is a document');
  assert.ok(faces.color.getHex() > 0);
  const p = counts(platforms);
  const f = counts(furniture);
  assert.equal(p.calls, 3);
  assert.ok(p.calls + f.calls <= 15, `${p.calls} + ${f.calls} draw calls`);
  assert.ok(p.triangles + f.triangles <= 40000, `${p.triangles} + ${f.triangles} triangles`);
  const box = new THREE.Box3().setFromObject(furniture).union(new THREE.Box3().setFromObject(platforms));
  for (const v of [...box.min.toArray(), ...box.max.toArray()]) assert.ok(Number.isFinite(v), 'a finite bounding box');
  assert.ok(box.max.y <= layout.crown + 1e-6, 'nothing above the shed\'s crown');
  const platformsBox = new THREE.Box3().setFromObject(platforms);
  near(platformsBox.max.y, PLATFORM_HEIGHT + FIGURES.stripLift, 1e-6, 'the platforms reach no higher than their edge strips');
  near(platformsBox.min.y, GROUND_Y, 1e-6, 'and no lower than the ground');
});

test('buildFurniture and buildPlatforms are deterministic: the same data gives the same plan and the same geometry', () => {
  const again = furniturePlan(data, layout);
  assert.deepEqual(again, plan);
  const a = part(buildPlatforms(data, layout), 'platform-edges').geometry.getAttribute('position').array;
  assert.deepEqual([...a], [...part(platforms, 'platform-edges').geometry.getAttribute('position').array]);
});

test('furniture: runs with the platforms alone as well (no rails: every long edge counts as a track edge)', () => {
  const bare = { platforms: data.platforms };
  const g = buildPlatforms(bare, layout);
  assert.equal(g.children.length, 3);
  const p = furniturePlan(bare, layout);
  assert.ok(p.benches.length > 0 && p.canopies.length === 2);
  // with every long edge a track edge the safety line is kept on both sides of platform 9 and 10 too
  for (const piece of [...p.lamps, ...p.benches, ...p.helpPoints, ...p.canopies.flatMap((c) => c.columns)]) {
    const pts = outline(piece.ref);
    const d = distanceToEdges([piece.x, piece.z], classifyEdges(pts, outlines.filter((o) => o !== pts), layout, undefined));
    assert.ok(d >= FIGURES.safetyLine, `platform ${piece.ref}: ${d} m from a track edge`);
  }
});

test('colour: every furniture mesh carries a colour per vertex (the shared builder is told so), and the lamps, benches and help points are more than one colour', () => {
  for (const name of ['lamps', 'benches', 'help-points', 'totems', 'canopy-glass', 'canopy-steel']) {
    const geometry = part(furniture, name).geometry;
    const color = geometry.getAttribute('color');
    assert.ok(color, `${name} has vertex colours`);
    assert.equal(color.count, geometry.getAttribute('position').count, `${name}: one colour per vertex`);
    for (let i = 0; i < color.count * 3; i++) assert.ok(color.array[i] as number >= 0 && (color.array[i] as number) <= 1, `${name}: colour channel in range`);
  }
  for (const name of ['lamps', 'benches', 'help-points', 'totems']) {
    const color = part(furniture, name).geometry.getAttribute('color');
    const seen = new Set<string>();
    for (let i = 0; i < color.count; i++) seen.add(`${color.getX(i).toFixed(3)},${color.getY(i).toFixed(3)},${color.getZ(i).toFixed(3)}`);
    assert.ok(seen.size >= 2, `${name} is painted in at least two colours, not all white`);
  }
});

test('FIGURES: the working figures the titles above quote, written out so a slipped constant cannot pass by agreeing with itself', () => {
  // The other tests measure the build against FIGURES; this one pins FIGURES. All of these are ASSUMED
  // (see the comments in furniture.ts), so a change here is a decision, not a fix: change both together.
  const want = {
    safetyLine: 1.6, stripWidth: 1.6, minTrackRun: 12,
    lampHeight: 4.5, lampSpacing: 24,
    benchLength: 1.8, benchPairGap: 2.4, benchSpacing: 45,
    helpHeight: 1.8, helpSpacing: 80,
    totemWidth: 1.0, totemHeight: 2.5, totemHeader: 0.65, screenWidth: 0.85, screenHeight: 1.1, totemSpacing: 100, totemSouth: 20,
    canopyHeight: 5.2, canopyColumnSpacing: 12,
  };
  for (const [name, value] of Object.entries(want)) assert.equal((FIGURES as Record<string, number>)[name], value, `FIGURES.${name}`);
});

// The shed realignment of 2026-11-24 (signed off): the spine wall stands on the 4/5 island, so the furniture there treats it as a wall.
test('no floor furniture stands within half the spine wall\'s thickness and 0.3 m of its line, its own half-width added, under the shed', () => {
  const keep = SPINE_WALL.thick / 2 + SPINE_WALL.clear;
  assert.equal(keep, 0.8, 'the design\'s inset: half of 1.0 m and 0.3 m');
  let near45 = 0, worst = Infinity;
  // re-pinned (B5 totems): every totem stands on the floor, so all of them keep the inset (the hung screens clear of the wall did before)
  for (const p of [...plan.lamps, ...plan.benches, ...plan.helpPoints, ...plan.totems]) {
    const { u, v } = worldToShed(layout, [p.x, p.z]);
    if (v < 0 || v > layout.length) continue;
    const gap = Math.abs(u - layout.spine) - p.across;
    if (p.ref === '4' || p.ref === '5') { near45++; worst = Math.min(worst, gap); }
    assert.ok(gap >= keep - 1e-6, `a piece on platform ${p.ref} at (${u.toFixed(2)}, ${v.toFixed(1)}), half-width ${p.across}, is ${gap.toFixed(2)} m from the spine line`);
    // scorer hold of 2026-11-24: the east arcade, under the east vault's east springing on platform 0, takes the same inset
    const east = Math.abs(u - eastArcadeU(layout)) - p.across;
    assert.ok(east >= keep - 1e-6, `a piece on platform ${p.ref} at (${u.toFixed(2)}, ${v.toFixed(1)}), half-width ${p.across}, is ${east.toFixed(2)} m from the east arcade's line`);
  }
  assert.ok(near45 >= 10, `${near45} pieces on platforms 4 and 5 under the shed; the closest is ${worst.toFixed(2)} m from the spine`);
  const on0 = [...plan.lamps, ...plan.benches, ...plan.helpPoints].filter((p) => p.ref === '0' && worldToShed(layout, [p.x, p.z]).v > 0 && worldToShed(layout, [p.x, p.z]).v < layout.length).length;
  assert.ok(on0 >= 10, `${on0} floor pieces on platform 0 under the shed`);
});

// 2026-11-24: nothing stands in the north pier's footprint (NORTH_PIER) or its inset. Re-pinned (B5 totems): the screens bracketed off the spine
// wall and the east arcade, and their corbel and wall-face tests, went with the hanging screens; the totems stand before piers instead (tested above).
test('nothing stands at the north pier', () => {
  for (const p of [...plan.lamps, ...plan.benches, ...plan.helpPoints, ...plan.totems]) {
    const { u, v } = worldToShed(layout, [p.x, p.z]);
    if (v < layout.length - NORTH_PIER.south - SPINE_WALL.clear - p.across || v > layout.length + NORTH_PIER.north + SPINE_WALL.clear + p.across) continue;
    assert.ok(Math.abs(u - layout.spine) - p.across >= NORTH_PIER.half + SPINE_WALL.clear, `a piece on platform ${p.ref} at (${u.toFixed(2)}, ${v.toFixed(1)}) stands at the north pier`);
  }
});
