// The track: a ballast bed, concrete sleepers and two rails for every track in the station zone,
// and the old cheap lines beyond it. One call, `buildTrack(data, layout)`, returns ONE group that
// replaces main.ts's ballast ribbons, twin-rail lines and tunnel lines. A second call,
// `buildBufferStops(data, layout)`, returns ONE InstancedMesh (one draw call) of the shed's nine
// buffer stops, a red beam with chevrons on two posts, two buffers and a foundation, and replaces
// main.ts's red boxes; see BUFFER_STOP (every figure there is ASSUMED).
//
// LEVELS (metres; x east, z south, y up). The rail head top is RAIL_TOP = 0: the trains' wheels
// touch there and the signals assume it. The ground is GROUND_Y = -0.2 (web/src/world.ts), so the
// whole bed has to fit in the 0.2 m between them:
//     rail head top    0.00   RAIL_TOP
//     rail foot / sleeper top  -0.10   SLEEPER_TOP   (rail 0.10 m tall: a vertically compressed section)
//     ballast surface  -0.14   BALLAST_TOP   (slopes down to the ground at its edges)
//     ground           -0.20   GROUND_Y
//
// WHAT IS DRAWN, AND THE DRAW CALLS (five for the whole group):
//   track-ballast   ONE mesh, the 'ballast' material, UVs in metres (the planar world x, z, so
//                   neighbouring strips tile into each other and overlaps never flicker): a
//                   trapezoid strip under every in-zone track, plus the cheap flat ribbon under
//                   every track beyond the zone;
//   track-sleepers  ONE InstancedMesh, the 'concrete' material, the top and the two long sides (no
//                   bottom, no ends: 6 triangles each, SLEEPER_TRIANGLES);
//   track-rails     ONE merged mesh, two rails per track, vertex colours (light steel head top, rust
//                   below), the 113A-like section in RAIL_PROFILE;
//   track-lines     the old 1 px twin-rail lines in one LineSegments (vertex colours, main and siding):
//                   they ARE the track beyond the zone, and along the zone's rails they float 4 mm over
//                   the head and are discarded within 90 m of the camera, because the 3D head (0.072 m)
//                   is under a pixel beyond about 60 m and the overview would lose its rails;
//   track-tunnel    the tunnel lines, exactly as before (TUNNEL_DEPTH, 0x5b6b86, opacity 0.7).
// Sleepers also fade into the ballast's average colour between 110 and 260 m from the camera: at
// 0.65 m apart they are a pixel or two beyond that, and the rows turn to moire.
//
// THE ZONE (STATION_ZONE) is a box in the shed's own frame, tested per centre-line segment (its
// midpoint). On the 2026 OSM extract it holds 131 segments, 4.5 km, all of them ways tagged
// ref=ECM1 (King's Cross's own tracks, shed to the tunnel mouths); every Thameslink, St Pancras,
// Moorgate and Great Northern Route way has no node in it (tests/track.test.ts proves both).
//
// FIGURES. Only what a source backs is stated as fact; the rest says ASSUMED.
//   gauge 1.435 m between inner faces, head 0.072 m: core/station.ts (GAUGE, RAIL_HEAD_WIDTH).
//   rail height 0.10 m, ballast top -0.14 m, sleeper 2.6 x 0.25 m: the brief for this module.
//     (A real 113A rail is about 0.159 m tall, 70 mm head, 140 mm foot, 20 mm web: recalled, not
//     re-checked. Here the height is compressed to fit the 0.2 m the ground leaves.)
//   sleeper spacing 0.65 m: SOURCED, second-hand. Rail Engineer, "Strategic sleepers" (Mungo Stacy, 16
//     January 2014, https://www.railengineer.co.uk/strategic-sleepers/), counting Network Rail's sleepers
//     on "a sleeper every 650mm". That is a magazine's working figure for the network, not the standard's
//     clause (NR/L2/TRK/2102 and NR/SP/TRK/030 cover the sleepers; neither could be opened), and the brief
//     said about 0.6 m, which the same search found as the commonest axis spacing in Europe (snippet only).
//   ballast: top 3.4 m wide (sleeper 2.6 m plus a 0.4 m shoulder each side), shoulders sloping 1:2
//     down to the ground: ASSUMED.
//   sleeper thickness 0.05 m modelled (only the top 0.04 m shows above the ballast): ASSUMED.
//   rail section proportions (head 0.030 deep, web 0.020 thick, foot 0.14 wide): ASSUMED, see RAIL_PROFILE.
//
// Other deliberate choices: sleepers sit at SLEEPER_SPACING along the centre line starting half a
// spacing in, carried across the nodes of a chain, so no sleeper lands on a way's end node and
// two ways meeting there do not double up; each sleeper is nudged down by up to 4 mm and tinted a
// little, by a fixed pseudo-random sequence, so crossing sleepers at junctions never z-fight and
// the rows do not look stamped.
import * as THREE from 'three';
import { railSegments, ribbonTriangles, twinRails } from '../../core/scene.ts';
import type { Pt } from '../../core/geo.ts';
import type { KxData } from '../../core/osm.ts';
import { GAUGE, RAIL_HEAD_WIDTH, shedBufferStops, worldToShed } from '../../core/station.ts';
import type { ShedLayout } from '../../core/station.ts';
import { Batch, material, rgb, rng, TEXTURES } from './materials.ts';
import type { Rgb, V2, V3 } from './materials.ts';
import { GROUND_Y } from './world.ts';

// ---------------------------------------------------------------------------------------------
// figures

/** The rail head top, metres: the datum the trains and signals are built to. */
export const RAIL_TOP = 0;
/** Rail height, head top to foot bottom: the brief's 0.10 m (a real 113A is about 0.159 m). */
export const RAIL_HEIGHT = 0.1;
/** The sleeper top, where the rail foot sits. */
export const SLEEPER_TOP = RAIL_TOP - RAIL_HEIGHT;
/** Ballast surface level: the brief's -0.14 m. */
export const BALLAST_TOP = -0.14;
/** Width of the flat ballast top, metres: sleeper plus a 0.4 m shoulder each side. ASSUMED. */
export const BALLAST_TOP_WIDTH = 3.4;
/** Ballast shoulder slope, metres of run per metre of fall: 1:2. ASSUMED. */
export const BALLAST_SLOPE = 2;
/** Concrete monoblock sleeper, metres: 2.6 long across the track, 0.25 along it (the brief). */
export const SLEEPER_LENGTH = 2.6;
export const SLEEPER_WIDTH = 0.25;
/** Modelled thickness below the sleeper top (the ballast hides most of it). ASSUMED. */
export const SLEEPER_THICKNESS = 0.05;
/** Centre to centre along the track, metres: 650 mm, Rail Engineer's figure for Network Rail (see the header); the brief said about 0.6 m. */
export const SLEEPER_SPACING = 0.65;
/** A chain of segments is cut where the track turns by more than this at a node (radians). */
const MAX_KINK = (30 * Math.PI) / 180;
/** Up to this much (metres) of random drop per sleeper, so overlapping sleepers never share a plane. */
const SLEEPER_JITTER = 0.004;
/**
 * Sleepers are 0.65 m apart, so beyond about 200 m they are a pixel or two and the rows turn to
 * moire. They fade into the ballast's average colour between these two distances (metres from the
 * camera), done in the fragment shader. ASSUMED, tuned by eye at the evidence cameras.
 */
const SLEEPER_FADE = [110, 260] as const;
/**
 * The 3D rail head is 0.072 m wide: under a pixel beyond about 60 m. So the old 1 px lines are also
 * drawn along the zone's rails, floating LINE_LIFT above the head, and only farther than
 * LINE_NEAR_CUTOFF metres from the camera (nearer, the real rail shows and the line would only be
 * a scratch on it). ASSUMED, tuned by eye.
 */
const LINE_LIFT = 0.004;
const LINE_NEAR_CUTOFF = 90;

/** The tunnel lines, exactly as main.ts drew them. */
const TUNNEL_COLOUR = 0x5b6b86;
const TUNNEL_OPACITY = 0.7;
/** The cheap lines and ribbons beyond the zone, as main.ts drew them (main and siding differ). */
const FAR_MAIN_COLOUR = 0xd5dae2;
const FAR_SIDING_COLOUR = 0x9a9486;
const FAR_MAIN_WIDTH = 3.2;
const FAR_SIDING_WIDTH = 3.0;

// ---------------------------------------------------------------------------------------------
// the station zone

/**
 * The box (shed frame: u east across the shed, v north along it, metres from the south-west corner
 * of the shed floor) inside which the proper track is drawn. Measured on the 2026 OSM extract:
 *   west  : the platform 9 and 10 tracks reach u = -47; the nearest Thameslink way (OSM 110558315,
 *           ref TRL1) is at u <= -105 in this v range, so -60 keeps the first and is 45 m clear of
 *           the second (the nearest node of any non-ECM1 way is 38 m outside the box);
 *   east  : the shed's east wall plus 35 m (nothing is there until u = 200);
 *   south : the buffer stops stand at v = 12..24, so -10 is clear of them;
 *   north : the tunnel mouths are at v = 447 (the surface track ends there), so 520 is past them.
 */
export const STATION_ZONE = { uWest: -60, uEastBeyondShed: 35, vSouth: -10, vNorth: 520 } as const;

type ZoneLayout = Pick<ShedLayout, 'origin' | 'heading' | 'width'>;

/** Is the world point (x, z) inside the station zone? */
export function inStationZone(layout: ZoneLayout, x: number, z: number): boolean {
  const { u, v } = worldToShed(layout, [x, z]);
  return u >= STATION_ZONE.uWest && u <= layout.width + STATION_ZONE.uEastBeyondShed && v >= STATION_ZONE.vSouth && v <= STATION_ZONE.vNorth;
}

/** Split flat centre-line segments by the zone: a segment belongs to `near` when its midpoint is inside. */
export function splitByZone(segments: number[], layout: ZoneLayout): { near: number[]; far: number[] } {
  const near: number[] = [];
  const far: number[] = [];
  for (let i = 0; i + 5 < segments.length; i += 6) {
    const inside = inStationZone(layout, ((segments[i] as number) + (segments[i + 3] as number)) / 2, ((segments[i + 2] as number) + (segments[i + 5] as number)) / 2);
    (inside ? near : far).push(...segments.slice(i, i + 6));
  }
  return { near, far };
}

// ---------------------------------------------------------------------------------------------
// chains and sleepers (pure: no three.js)

/**
 * Stitch flat [x1,y1,z1,x2,y2,z2,...] segments into chains of points. Two segments join where they
 * share an end point and nothing else does (a node of degree two) and the track turns there by at
 * most MAX_KINK; at a junction (three or more segments) or a sharp kink a chain ends. A segment
 * listed twice counts once. This is how the spacing and the rails are carried across the nodes of
 * one OSM way, and across the joint of two ways. y is ignored: the surface track is all at RAIL_TOP.
 */
export function trackChains(segments: number[]): Pt[][] {
  const index = new Map<string, number>();
  const pts: Pt[] = [];
  const node = (x: number, z: number): number => {
    const key = `${x},${z}`;
    let i = index.get(key);
    if (i === undefined) {
      i = pts.length;
      index.set(key, i);
      pts.push([x, z]);
    }
    return i;
  };
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i + 5 < segments.length; i += 6) {
    const a = node(segments[i] as number, segments[i + 2] as number);
    const b = node(segments[i + 3] as number, segments[i + 5] as number);
    if (a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([a, b]);
  }
  const at: number[][] = pts.map(() => []);
  edges.forEach(([a, b], e) => {
    (at[a] as number[]).push(e);
    (at[b] as number[]).push(e);
  });
  const straight = (p: Pt, q: Pt, r: Pt): boolean => {
    const ax = q[0] - p[0];
    const az = q[1] - p[1];
    const bx = r[0] - q[0];
    const bz = r[1] - q[1];
    return (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz)) >= Math.cos(MAX_KINK);
  };
  const used = edges.map(() => false);
  const chains: Pt[][] = [];
  for (let e0 = 0; e0 < edges.length; e0++) {
    if (used[e0]) continue;
    used[e0] = true;
    const ids = [...(edges[e0] as [number, number])];
    for (let pass = 0; pass < 2; pass++) {
      // grow the chain at its end, then turn it round and grow what was its start
      for (;;) {
        const last = ids[ids.length - 1] as number;
        const here = at[last] as number[];
        if (here.length !== 2) break;
        const next = here.find((e) => !used[e]);
        if (next === undefined) break;
        const [a, b] = edges[next] as [number, number];
        const onward = a === last ? b : a;
        if (!straight(pts[ids[ids.length - 2] as number] as Pt, pts[last] as Pt, pts[onward] as Pt)) break;
        used[next] = true;
        ids.push(onward);
      }
      ids.reverse();
    }
    chains.push(ids.map((i) => pts[i] as Pt));
  }
  return chains;
}

export interface SleeperPlacement {
  x: number;
  z: number;
  /** rotation about +y that takes the sleeper's own frame (long axis +x, short axis +z) square to the track: atan2(dx, dz) */
  yaw: number;
}

/** Sleepers every `spacing` metres along one chain, the first half a spacing in, the spacing carried across its nodes. */
function sleepersAlong(chain: Pt[], spacing: number): SleeperPlacement[] {
  const out: SleeperPlacement[] = [];
  let k = 0;
  let start = 0; // arc length at the start of the current segment
  for (let i = 0; i + 1 < chain.length; i++) {
    const [ax, az] = chain[i] as Pt;
    const [bx, bz] = chain[i + 1] as Pt;
    const length = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / length;
    const dz = (bz - az) / length;
    for (;;) {
      const s = (k + 0.5) * spacing - start;
      if (s >= length) break;
      out.push({ x: ax + dx * s, z: az + dz * s, yaw: Math.atan2(dx, dz) });
      k++;
    }
    start += length;
  }
  return out;
}

/**
 * Where the sleepers go: one every `spacing` metres along every chain of the flat centre-line
 * segments (the buckets of core/scene.ts `railSegments`), each square to the local direction. The
 * spacing is carried across the nodes of a chain, so a node never doubles or gaps a sleeper.
 */
export function sleeperPlacements(segments: number[], spacing = SLEEPER_SPACING): SleeperPlacement[] {
  const out: SleeperPlacement[] = [];
  for (const chain of trackChains(segments)) for (const s of sleepersAlong(chain, spacing)) out.push(s);
  return out;
}

// ---------------------------------------------------------------------------------------------
// mesh building

// Everything here is built on the shared `Batch` (materials.ts): flat shading, one normal per face, each
// face wound to look along the normal given. The rails and the buffer stops carry a colour per vertex
// (`colored`); only the ballast wears a texture, and its UVs are the planar world metres (x, z), so the
// sleepers, rails and stops carry no UVs at all (`uv: false`).

/** UVs that are the planar world metres (x, z): the 'ballast' material's contract. */
const planar = (pts: readonly V3[]): V2[] => pts.map((p) => [p[0], p[2]]);

/** The shared 'steel' material, cloned, to take its colour from the vertices of the mesh that wears it. */
function vertexPainted(name: string): THREE.MeshLambertMaterial {
  const m = (material('steel') as THREE.MeshLambertMaterial).clone();
  m.color.set(0xffffff);
  m.vertexColors = true;
  m.name = name;
  return m;
}

/**
 * A station along a chain: its point, and the "miter" side vector there. A point at lateral offset
 * d from the centre line is (x + mx*d, z + mz*d): at a bend the offset curve stays exactly d from
 * both segments, so the rails keep their gauge round a corner and the bed has no gap or overlap.
 * Side is (-dz, dx), to the right of the direction of travel as seen on the map (north up).
 */
interface Station {
  x: number;
  z: number;
  mx: number;
  mz: number;
}

function stations(chain: Pt[]): { stations: Station[]; sides: Pt[] } {
  const sides: Pt[] = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    const [ax, az] = chain[i] as Pt;
    const [bx, bz] = chain[i + 1] as Pt;
    const l = Math.hypot(bx - ax, bz - az);
    sides.push([-(bz - az) / l, (bx - ax) / l]);
  }
  const out: Station[] = chain.map(([x, z], i) => {
    const before = sides[i - 1];
    const after = sides[i];
    if (!before) return { x, z, mx: (after as Pt)[0], mz: (after as Pt)[1] };
    if (!after) return { x, z, mx: before[0], mz: before[1] };
    const k = 1 + before[0] * after[0] + before[1] * after[1];
    return { x, z, mx: (before[0] + after[0]) / k, mz: (before[1] + after[1]) / k };
  });
  return { stations: out, sides };
}

/** The profile edges of a cross-section: from (lateral a, height a) to (lateral b, height b), its outward normal, its colour. */
interface ProfileEdge {
  a: readonly [number, number];
  b: readonly [number, number];
  n: readonly [number, number];
  color?: Rgb;
}

/**
 * Extrude a cross-section along a chain: for every segment, one quad per profile edge. `centre` is
 * the lateral offset of the section's own origin from the centre line.
 */
function extrude(m: Batch, chain: Pt[], profile: readonly ProfileEdge[], centre: number, planarUV = false): void {
  const { stations: st, sides } = stations(chain);
  for (let i = 0; i + 1 < st.length; i++) {
    const s0 = st[i] as Station;
    const s1 = st[i + 1] as Station;
    const side = sides[i] as Pt;
    const at = (s: Station, edge: readonly [number, number]): V3 => [s.x + s.mx * (centre + edge[0]), edge[1], s.z + s.mz * (centre + edge[0])];
    for (const e of profile) {
      const normal: V3 = [side[0] * e.n[0], e.n[1], side[1] * e.n[0]];
      const corners = [at(s0, e.a), at(s0, e.b), at(s1, e.b), at(s1, e.a)];
      m.poly(corners, planarUV ? planar(corners) : undefined, { normal, ...(e.color ? { color: e.color } : {}) });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// the ballast bed

const BED_RUN = (BALLAST_TOP - GROUND_Y) * BALLAST_SLOPE;
const BED_HALF = BALLAST_TOP_WIDTH / 2;

/** The bed's cross-section, left to right: shoulder up from the ground, the flat top, shoulder down. Normals face up and out. */
const BED_PROFILE: readonly ProfileEdge[] = (() => {
  const pts: [number, number][] = [[-(BED_HALF + BED_RUN), GROUND_Y], [-BED_HALF, BALLAST_TOP], [BED_HALF, BALLAST_TOP], [BED_HALF + BED_RUN, GROUND_Y]];
  const edges: ProfileEdge[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as [number, number];
    const b = pts[i + 1] as [number, number];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    edges.push({ a, b, n: [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] });
  }
  return edges;
})();

/** The cheap bed beyond the zone: main.ts's flat ribbons, lifted to BALLAST_TOP, wound to face up (the old ones faced down and were culled). */
function addFarBallast(m: Batch, segments: number[], width: number): void {
  const t = ribbonTriangles(segments, width, BALLAST_TOP);
  for (let i = 0; i + 8 < t.length; i += 9) {
    const p = (k: number): V3 => [t[i + 3 * k] as number, t[i + 3 * k + 1] as number, t[i + 3 * k + 2] as number];
    m.poly([p(0), p(1), p(2)], planar([p(0), p(1), p(2)]), { normal: [0, 1, 0] });
  }
}

// ---------------------------------------------------------------------------------------------
// the rails

const HEAD = RAIL_HEAD_WIDTH / 2;
/**
 * The rail section, right half, from the top outer corner of the head down the outside to the foot
 * bottom; (lateral from the rail's centre line, height above the head top). ASSUMED proportions,
 * the 0.10 m compression of a 113A: head 0.030 deep with its underside sloping into a 0.020 thick
 * web, a foot 0.14 wide (see the header). The head width is RAIL_HEAD_WIDTH.
 */
const RAIL_HALF: readonly (readonly [number, number])[] = [
  [HEAD, RAIL_TOP], // head top, outer corner
  [HEAD, RAIL_TOP - 0.014], // end of the vertical head side
  [0.01, RAIL_TOP - 0.03], // head underside meets the web
  [0.01, RAIL_TOP - 0.072], // foot of the web
  [0.07, RAIL_TOP - 0.09], // foot top, sloping out to the edge
  [0.07, SLEEPER_TOP], // foot edge down to the sleeper
];

const HEAD_TOP_COLOUR = rgb(0xc4c9d1);
const HEAD_SIDE_COLOUR = rgb(0x8a8079);
const RUST_COLOUR = rgb(0x6c4634);

/**
 * The closed section, counter-clockwise (lateral to the right, up above): over the top from right
 * to left, down the left half, along the bottom (not drawn: the foot sits on the sleeper), up the
 * right half. Each drawn edge carries its outward normal, (dy, -dx) of its direction, and its colour.
 */
const RAIL_PROFILE: readonly ProfileEdge[] = (() => {
  const right = RAIL_HALF;
  const left = RAIL_HALF.map(([l, y]) => [-l, y] as const);
  const loop = [right[0] as readonly [number, number], ...left, ...[...right].reverse().slice(0, -1)];
  const edges: ProfileEdge[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i] as readonly [number, number];
    const b = loop[(i + 1) % loop.length] as readonly [number, number];
    if (a[1] === SLEEPER_TOP && b[1] === SLEEPER_TOP) continue; // the foot bottom
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const color = a[1] === RAIL_TOP && b[1] === RAIL_TOP ? HEAD_TOP_COLOUR : Math.abs(a[0]) === HEAD && Math.abs(b[0]) === HEAD ? HEAD_SIDE_COLOUR : RUST_COLOUR;
    edges.push({ a, b, n: [(b[1] - a[1]) / l, -(b[0] - a[0]) / l], color });
  }
  return edges;
})();

/** Lateral offset of each rail's centre line from the track's centre line: half the gauge plus half a head. */
const RAIL_CENTRE = GAUGE / 2 + RAIL_HEAD_WIDTH / 2;

// ---------------------------------------------------------------------------------------------
// sleepers

/** Triangles in one sleeper: the top and the two long sides, two each. */
export const SLEEPER_TRIANGLES = 6;

/**
 * One concrete sleeper: the top and the two long sides, no bottom and no ends; long axis along x, short
 * along z, top at SLEEPER_TOP. The ends were dropped (10 triangles became 6): each is 0.25 m wide and shows
 * at most 0.04 m above the ballast, 1.3 m either side of the centre line, so nothing visible is lost, and
 * the sleepers are the biggest triangle bill in the group (one every 0.65 m along 4.5 km, always drawn).
 */
function sleeperGeometry(): THREE.BufferGeometry {
  const hx = SLEEPER_LENGTH / 2;
  const hz = SLEEPER_WIDTH / 2;
  const top = SLEEPER_TOP;
  const low = SLEEPER_TOP - SLEEPER_THICKNESS;
  const m = new Batch({ uv: false });
  m.poly([[-hx, top, -hz], [hx, top, -hz], [hx, top, hz], [-hx, top, hz]], undefined, { normal: [0, 1, 0] });
  m.poly([[-hx, low, hz], [hx, low, hz], [hx, top, hz], [-hx, top, hz]], undefined, { normal: [0, 0, 1] });
  m.poly([[hx, low, -hz], [-hx, low, -hz], [-hx, top, -hz], [hx, top, -hz]], undefined, { normal: [0, 0, -1] });
  return m.build();
}

/** The shared 'concrete' material, cloned, with its base colour fading into the ballast's average with distance. */
function sleeperMaterial(): THREE.Material {
  const m = (material('concrete') as THREE.MeshLambertMaterial).clone();
  m.name = 'sleeper';
  const bed = new THREE.Color(TEXTURES.ballast.average);
  const colour = `vec3( ${bed.r.toFixed(5)}, ${bed.g.toFixed(5)}, ${bed.b.toFixed(5)} )`;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, ${colour}, smoothstep( ${SLEEPER_FADE[0].toFixed(1)}, ${SLEEPER_FADE[1].toFixed(1)}, length( vViewPosition ) ) );`,
    );
  };
  m.customProgramCacheKey = () => 'track-sleeper-fade';
  return m;
}

function sleeperMesh(placements: SleeperPlacement[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(sleeperGeometry(), sleeperMaterial(), placements.length);
  const random = rng(20261108);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  placements.forEach((p, i) => {
    dummy.position.set(p.x, -random() * SLEEPER_JITTER, p.z);
    dummy.rotation.y = p.yaw;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, tint.setScalar(0.88 + random() * 0.16));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = 'track-sleepers';
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// the group

/** The tunnel lines, exactly as main.ts drew them. */
function tunnelLines(positions: number[]): THREE.LineSegments {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: TUNNEL_COLOUR, transparent: true, opacity: TUNNEL_OPACITY }));
  lines.name = 'track-tunnel';
  return lines;
}

/**
 * The twin-rail lines in one LineSegments: vertex colours, and a per-vertex `cutoff` distance
 * (metres from the camera) inside which the vertex's line is discarded: 0 for the lines that ARE the
 * track beyond the zone, LINE_NEAR_CUTOFF for the ones laid along the zone's 3D rails.
 */
function railLines(parts: { positions: number[]; colour: number; cutoff: number }[]): THREE.LineSegments {
  const positions: number[] = [];
  const colors: number[] = [];
  const cutoffs: number[] = [];
  const c = new THREE.Color();
  for (const part of parts) {
    c.set(part.colour);
    for (let i = 0; i + 2 < part.positions.length; i += 3) {
      positions.push(part.positions[i] as number, part.positions[i + 1] as number, part.positions[i + 2] as number);
      colors.push(c.r, c.g, c.b);
      cutoffs.push(part.cutoff);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('cutoff', new THREE.Float32BufferAttribute(cutoffs, 1));
  const m = new THREE.LineBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float cutoff;\nvarying float vCutoff;\nvarying float vDistance;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvCutoff = cutoff;\n\tvDistance = - mvPosition.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCutoff;\nvarying float vDistance;')
      .replace('#include <logdepthbuf_fragment>', 'if ( vDistance < vCutoff ) discard;\n\t#include <logdepthbuf_fragment>');
  };
  m.customProgramCacheKey = () => 'track-line-cutoff';
  const lines = new THREE.LineSegments(g, m);
  lines.name = 'track-lines';
  return lines;
}

/** The layout fields the track needs: where the shed is, to place the zone. */
export type TrackLayout = ZoneLayout;

/**
 * The whole track as one group (five draw calls). Replaces, in main.ts, from `const rails = railSegments(data)`
 * through `scene.add(lines(rails.tunnel, 0x5b6b86, 0.7))` — keep `rails` itself if the camera framing
 * (`bounds(rails.main)`) still wants it. `userData` carries the counts: sleepers, chains, near and far segments.
 */
export function buildTrack(data: Pick<KxData, 'nodes' | 'rails'>, layout: TrackLayout): THREE.Group {
  const rails = railSegments(data);
  const main = splitByZone(rails.main, layout);
  const siding = splitByZone(rails.siding, layout);

  const bed = new Batch();
  const steel = new Batch({ colored: true, uv: false });
  const placements: SleeperPlacement[] = [];
  let chains = 0;
  for (const near of [main.near, siding.near]) {
    for (const chain of trackChains(near)) {
      chains++;
      extrude(bed, chain, BED_PROFILE, 0, true);
      for (const side of [-1, 1]) extrude(steel, chain, RAIL_PROFILE, side * RAIL_CENTRE);
      for (const s of sleepersAlong(chain, SLEEPER_SPACING)) placements.push(s);
    }
  }
  addFarBallast(bed, main.far, FAR_MAIN_WIDTH);
  addFarBallast(bed, siding.far, FAR_SIDING_WIDTH);

  const group = new THREE.Group();
  group.name = 'track';
  if (bed.triangles) {
    const mesh = new THREE.Mesh(bed.build(), material('ballast'));
    mesh.name = 'track-ballast';
    group.add(mesh);
  }
  if (placements.length) group.add(sleeperMesh(placements));
  if (steel.triangles) {
    const mesh = new THREE.Mesh(steel.build(), vertexPainted('rail'));
    mesh.name = 'track-rails';
    group.add(mesh);
  }

  // the lines: beyond the zone they are the track; inside it they carry the rails off into the distance
  const lift = (positions: number[]): number[] => positions.map((v, i) => (i % 3 === 1 ? v + LINE_LIFT : v));
  const lines = railLines([
    { positions: twinRails(main.far), colour: FAR_MAIN_COLOUR, cutoff: 0 },
    { positions: twinRails(siding.far), colour: FAR_SIDING_COLOUR, cutoff: 0 },
    { positions: lift(twinRails(main.near)), colour: FAR_MAIN_COLOUR, cutoff: LINE_NEAR_CUTOFF },
    { positions: lift(twinRails(siding.near)), colour: FAR_SIDING_COLOUR, cutoff: LINE_NEAR_CUTOFF },
  ]);
  if (lines.geometry.getAttribute('position').count) group.add(lines);
  if (rails.tunnel.length) group.add(tunnelLines(rails.tunnel));

  group.userData = { sleepers: placements.length, chains, nearSegments: (main.near.length + siding.near.length) / 6, farSegments: (main.far.length + siding.far.length) / 6 };
  return group;
}

// ---------------------------------------------------------------------------------------------
// buffer stops

/**
 * A buffer stop in its own frame: x across the track, y up from the rail head, z along it with -z
 * towards the trains (north, once turned by -heading like the shed). The origin is the OSM node,
 * which is exactly where the rails end (measured: all nine shed stops are 0.00 m from a chain end),
 * so everything solid stands behind it (+z) and only the two buffers reach out in front.
 * Nothing here is sourced from the real stops: every figure is ASSUMED, from the brief (a beam about
 * 2.4 m wide and 0.5 m tall on two posts, two round buffers facing north) and from the standard
 * vehicle buffer spacing of 1.753 m (5 ft 9 in; recalled, not checked), with the beam's centre at
 * about 1.0 m over the rail head.
 */
export const BUFFER_STOP = {
  beamWidth: 2.4,
  beamHeight: 0.5,
  beamDepth: 0.3,
  /** height of the beam's centre, and of the buffers' axes, over the rail head */
  beamCentre: 1.0,
  /** the two buffers' centres are this far apart; a post stands behind each */
  bufferSpacing: 1.753,
  postSize: 0.22,
  /** the foundation block under the beam: across, along (behind the track end), and its top over the rail head */
  baseWidth: 2.9,
  baseDepth: 0.9,
  baseTop: 0.08,
  /** each buffer: the barrel's radius and length out of the beam, the ram's, and the round head's */
  barrelRadius: 0.13,
  barrelLength: 0.34,
  ramRadius: 0.085,
  ramLength: 0.24,
  headRadius: 0.19,
  headThickness: 0.05,
  /** the chevron bands on the beam's face: each band's width across, and how far it runs outward over the face's height */
  stripeWidth: 0.2,
  stripeRun: 0.5,
} as const;

/** How far in front of the track end (metres, -z) the buffers' heads reach. */
export const BUFFER_REACH = BUFFER_STOP.barrelLength + BUFFER_STOP.ramLength + BUFFER_STOP.headThickness;

const STOP_RED = rgb(0xb3261e);
const STOP_WHITE = rgb(0xf2ecd2);
const STOP_DARK = rgb(0x39424c);
const STOP_RAM = rgb(0x8d949c);
const STOP_CONCRETE = rgb(0x8e8e8a);

/** Clip a convex polygon in the (x, y) plane to one side of the line x = limit (Sutherland-Hodgman, one edge). */
function clipX(poly: [number, number][], limit: number, keep: 'below' | 'above'): [number, number][] {
  const inside = (p: [number, number]): boolean => (keep === 'below' ? p[0] <= limit : p[0] >= limit);
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as [number, number];
    const b = poly[(i + 1) % poly.length] as [number, number];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) out.push([limit, a[1] + ((limit - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]);
  }
  return out;
}

/**
 * The beam's north face as chevron bands, for its right half only (x from 0 to the beam's end; the
 * left half is the mirror image, which turns the slanted bands into chevrons). The bands tile the face
 * exactly, red and white alternating, so nothing is drawn over anything else and nothing can flicker.
 * Each polygon is (x, y) with y over the rail head.
 */
export function beamFaceBands(): { poly: [number, number][]; white: boolean }[] {
  const B = BUFFER_STOP;
  const half = B.beamWidth / 2;
  const top = B.beamCentre + B.beamHeight / 2;
  const bottom = B.beamCentre - B.beamHeight / 2;
  const bands: { poly: [number, number][]; white: boolean }[] = [];
  // band j lies between two lines slanting outward by stripeRun as they go down, one through
  // x = j * stripeWidth at the top and the next through x = (j + 1) * stripeWidth
  for (let j = -Math.ceil(B.stripeRun / B.stripeWidth); j * B.stripeWidth < half; j++) {
    const x0 = j * B.stripeWidth;
    const x1 = x0 + B.stripeWidth;
    const slanted: [number, number][] = [[x0, top], [x1, top], [x1 + B.stripeRun, bottom], [x0 + B.stripeRun, bottom]];
    const poly = clipX(clipX(slanted, 0, 'above'), half, 'below');
    if (poly.length >= 3 && polygonArea(poly) > 1e-9) bands.push({ poly, white: Math.abs(j) % 2 === 0 });
  }
  return bands;
}

/** Area of a simple polygon (shoelace), always positive. */
export function polygonArea(poly: readonly (readonly [number, number])[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as readonly [number, number];
    const b = poly[(i + 1) % poly.length] as readonly [number, number];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

/** A box of axis-aligned limits, flat-coloured: four sides and the top (or not); the bottom is never drawn. */
function pushBox(m: Batch, [x0, x1]: readonly [number, number], [y0, y1]: readonly [number, number], [z0, z1]: readonly [number, number], color: Rgb, top = true): void {
  m.box([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [x1 - x0, y1 - y0, z1 - z0], { color, skip: top ? ['-y'] : ['-y', '+y'] });
}

/**
 * A cylinder along z from zBack to zFront (zFront is nearer the trains, so smaller z), smooth-shaded
 * round its side, with the end caps asked for. Its centre line is (cx, cy).
 */
function pushCylinderZ(m: Batch, cx: number, cy: number, zBack: number, zFront: number, radius: number, color: Rgb, caps: { back: boolean; front: boolean }, sides = 12): void {
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * 2 * Math.PI;
    const a1 = ((i + 1) / sides) * 2 * Math.PI;
    const ring = (a: number, z: number): V3 => [cx + radius * Math.cos(a), cy + radius * Math.sin(a), z];
    const n0: V3 = [Math.cos(a0), Math.sin(a0), 0];
    const n1: V3 = [Math.cos(a1), Math.sin(a1), 0];
    // the side is smooth-shaded: a normal per corner, and the winding turns to face outward
    m.poly([ring(a0, zBack), ring(a1, zBack), ring(a1, zFront), ring(a0, zFront)], undefined, { normals: [n0, n1, n1, n0], color });
    if (caps.front) m.poly([[cx, cy, zFront], ring(a0, zFront), ring(a1, zFront)], undefined, { normal: [0, 0, -1], color });
    if (caps.back) m.poly([[cx, cy, zBack], ring(a0, zBack), ring(a1, zBack)], undefined, { normal: [0, 0, 1], color });
  }
}

/** One buffer stop in its own frame, flat-coloured vertices: foundation, two posts, the red beam with its chevrons, two buffers. */
function bufferStopGeometry(): THREE.BufferGeometry {
  const B = BUFFER_STOP;
  const m = new Batch({ colored: true, uv: false });
  const half = B.beamWidth / 2;
  const beamTop = B.beamCentre + B.beamHeight / 2;
  const beamBottom = B.beamCentre - B.beamHeight / 2;
  const post = B.bufferSpacing / 2;
  // the foundation, on the ground behind the track end
  pushBox(m, [-B.baseWidth / 2, B.baseWidth / 2], [GROUND_Y, B.baseTop], [0, B.baseDepth], STOP_CONCRETE);
  // a post behind each buffer, from the foundation up to the beam
  for (const x of [-post, post]) pushBox(m, [x - B.postSize / 2, x + B.postSize / 2], [B.baseTop, beamBottom], [(B.beamDepth - B.postSize) / 2, (B.beamDepth + B.postSize) / 2], STOP_DARK, false);
  // the beam: red top, back, ends and underside; its north face is the chevron bands
  const red = { color: STOP_RED };
  m.poly([[-half, beamTop, 0], [half, beamTop, 0], [half, beamTop, B.beamDepth], [-half, beamTop, B.beamDepth]], undefined, { normal: [0, 1, 0], ...red });
  m.poly([[-half, beamBottom, 0], [half, beamBottom, 0], [half, beamBottom, B.beamDepth], [-half, beamBottom, B.beamDepth]], undefined, { normal: [0, -1, 0], ...red });
  m.poly([[-half, beamBottom, B.beamDepth], [half, beamBottom, B.beamDepth], [half, beamTop, B.beamDepth], [-half, beamTop, B.beamDepth]], undefined, { normal: [0, 0, 1], ...red });
  m.poly([[half, beamBottom, 0], [half, beamBottom, B.beamDepth], [half, beamTop, B.beamDepth], [half, beamTop, 0]], undefined, { normal: [1, 0, 0], ...red });
  m.poly([[-half, beamBottom, 0], [-half, beamBottom, B.beamDepth], [-half, beamTop, B.beamDepth], [-half, beamTop, 0]], undefined, { normal: [-1, 0, 0], ...red });
  for (const band of beamFaceBands()) {
    const color = band.white ? STOP_WHITE : STOP_RED;
    for (const sign of [1, -1]) {
      const at = (p: [number, number]): V3 => [sign * p[0], p[1], 0];
      // a triangle at a time, as before (the fan of a band, one normal: the beam's north face)
      for (let i = 1; i + 1 < band.poly.length; i++) m.poly([at(band.poly[0] as [number, number]), at(band.poly[i] as [number, number]), at(band.poly[i + 1] as [number, number])], undefined, { normal: [0, 0, -1], color });
    }
  }
  // the buffers: a barrel out of the beam's face, a thinner ram, a round head
  for (const x of [-post, post]) {
    const barrelEnd = -B.barrelLength;
    const ramEnd = barrelEnd - B.ramLength;
    pushCylinderZ(m, x, B.beamCentre, 0, barrelEnd, B.barrelRadius, STOP_DARK, { back: false, front: true });
    pushCylinderZ(m, x, B.beamCentre, barrelEnd, ramEnd, B.ramRadius, STOP_RAM, { back: false, front: false });
    pushCylinderZ(m, x, B.beamCentre, ramEnd, ramEnd - B.headThickness, B.headRadius, STOP_DARK, { back: true, front: true });
  }
  return m.build();
}

/**
 * The buffer stops at the south ends of the shed's tracks (core/station.ts `shedBufferStops`: one per
 * terminating track) as ONE InstancedMesh, one draw call: a red beam with chevrons on two posts, two
 * buffers facing north, a foundation block. Replaces the red boxes in main.ts, the loop
 * `for (const b of shedBufferStops(data, layout)) { ... scene.add(stop); }` (nine draw calls today).
 */
export function buildBufferStops(data: Pick<KxData, 'buffers'>, layout: TrackLayout): THREE.Group {
  const stops = shedBufferStops(data, layout);
  const group = new THREE.Group();
  group.name = 'buffer-stops';
  if (!stops.length) return group;
  const mesh = new THREE.InstancedMesh(bufferStopGeometry(), vertexPainted('buffer-stop'), stops.length);
  const dummy = new THREE.Object3D();
  stops.forEach((b, i) => {
    dummy.position.set(b.x, RAIL_TOP, b.z);
    dummy.rotation.y = -layout.heading;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = 'buffer-stops-mesh';
  group.add(mesh);
  group.userData = { stops: stops.map((b) => b.id) };
  return group;
}
