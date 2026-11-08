// Tunnel portals: where the East Coast Main Line's rails go into the Gasworks Tunnel (south and north
// ends) and the Copenhagen Tunnel (south end). Each mouth is a brick face wall with a semicircular arch
// for every bore, dressed with a stone voussoir ring and a cornice [WP-GAS] ("portals decorated with a
// cornice and voussoir"), a short dark recess behind each arch, and retaining walls on either side that
// follow the open tracks out of the cutting. Over the tunnel itself runs a low earth bank, so trains
// (which the model draws at ground level even underground) disappear into it instead of running on over
// the top of the tunnel.
//
// The numbers come from core/landmarks.ts (mouth positions are OSM nodes, so a portal stands exactly where
// OSM's rails change from open to `tunnel`). Sizes of the arches and walls are ASSUMED (see FIGURES.tunnel
// and the constants below); nothing in OSM gives them.
//
// Geometry is built in world coordinates and merged per material (four meshes in all).
//
// Wiring (main.ts):   const portals = addPortals(scene, data);   // once; `addPortals(scene, data, { cover: false })` leaves out the earth bank
import * as THREE from 'three';
import { approachEnvelope, archOpening, FIGURES, tunnelCover, tunnelMouths } from '../../core/landmarks.ts';
import type { ArchOpening, Cover, EnvelopeStation, Mouth } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import { material, mergeParts, part } from './materials.ts';
import type { Batch, PartMap, V2, V3 } from './materials.ts';

export type PortalKey = 'brick' | 'stone' | 'earth' | 'tube';

/** ASSUMED sizes: nothing published gives them for these portals. */
export const PORTAL = {
  voussoir: 0.75, // dressed-stone ring round each arch, metres
  cornice: { height: 0.7, out: 0.45 }, // the stone cornice along the top of the face
  recess: 8, // depth of the dark recess behind each arch (visual: the bank hides the rest)
  wallThickness: 0.9,
  // retaining walls: out from the face's end, following the rails, tapering from the parapet to a low end
  wing: { reach: 75, step: 15, clearance: 2.5, endHeight: 0.8 },
  // earth bank: the ridge is higher than a train (up to about 3.9 m), flat across the tunnel's nodes plus `pad` each side
  cover: { ridge: 4.6, pad: 3, ramp: [8, 24] as [number, number], taper: 40 },
  arcSteps: 14,
} as const;

type Pt = [number, number];
interface Frame {
  origin: Pt;
  axis: Pt;
  across: Pt;
}
/** World position of (u across, w along the axis into the tunnel, y up) in a frame. */
const at = (f: Frame, u: number, w: number, y: number): V3 => [f.origin[0] + f.across[0] * u + f.axis[0] * w, y, f.origin[1] + f.across[1] * u + f.axis[1] * w];
const dir = (f: Frame, u: number, w: number, y: number): V3 => [f.across[0] * u + f.axis[0] * w, y, f.across[1] * u + f.axis[1] * w];
const plus = (p: V3, v: V3): V3 => [p[0] + v[0], p[1] + v[1], p[2] + v[2]];
const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
const length = (v: V3): number => Math.hypot(v[0], v[1], v[2]);

/** An oriented box from corner `o` with edge vectors U, V, W; UVs in metres on each face. */
export function addBox(m: Batch, o: V3, U: V3, V: V3, W: V3): void {
  const face = (p: V3, a: V3, b: V3, out: V3): void => {
    const p1 = plus(p, a);
    const p2 = plus(p1, b);
    const p3 = plus(p, b);
    m.quadUV(p, p1, p2, p3, [[0, 0], [length(a), 0], [length(a), length(b)], [0, length(b)]], out);
  };
  face(o, U, V, neg(W));
  face(plus(o, W), U, V, W);
  face(o, U, W, neg(V));
  face(plus(o, V), U, W, V);
  face(o, V, W, neg(U));
  face(plus(o, U), V, W, U);
}

/**
 * The face wall's outline in (across, up) metres: the ground line with a notch for every arch, then up the
 * right end, back along the parapet and down the left end. Counter-clockwise, so it can be triangulated
 * without holes (an arch that reaches the ground is a notch, not a hole).
 */
export function faceOutline(openings: readonly ArchOpening[], halfWidth: number, top: number, steps = PORTAL.arcSteps): [number, number][] {
  const out: [number, number][] = [[-halfWidth, 0]];
  for (const o of [...openings].sort((a, b) => a.lateral - b.lateral)) {
    out.push([o.lateral - o.halfWidth, 0]);
    for (let k = 0; k <= steps; k++) {
      const a = Math.PI - (Math.PI * k) / steps;
      out.push([o.lateral + o.halfWidth * Math.cos(a), o.spring + o.halfWidth * Math.sin(a)]);
    }
    out.push([o.lateral + o.halfWidth, 0]);
  }
  out.push([halfWidth, 0], [halfWidth, top], [-halfWidth, top]);
  return out;
}

export interface WingPoint {
  /** across the face, metres (negative on the left) */
  u: number;
  /** metres back from the face along the approach */
  d: number;
  /** height of the wall top */
  h: number;
}

/**
 * One retaining wall's path: it starts at the face's end, follows the outermost open rail on its side
 * (never closer than `clearance`, never narrowing, so it cannot cross a rail) and tapers from the parapet
 * to a low end. `sign` is -1 for the left (negative across) side.
 */
export function wingPath(sign: -1 | 1, halfWidth: number, top: number, envelope: readonly EnvelopeStation[]): WingPoint[] {
  const reach = PORTAL.wing.reach;
  let u = sign * halfWidth;
  const path: WingPoint[] = [];
  for (const s of envelope) {
    if (s.d > reach) continue;
    const edge = sign < 0 ? s.lo : s.hi;
    if (edge !== null) u = sign < 0 ? Math.min(u, edge - PORTAL.wing.clearance) : Math.max(u, edge + PORTAL.wing.clearance);
    path.push({ u, d: s.d, h: Math.max(PORTAL.wing.endHeight, top - ((top - PORTAL.wing.endHeight) * s.d) / reach) });
  }
  return path;
}

/** The brick face, stone dressings, dark recesses and retaining walls of one mouth. */
export function mouthParts(mouth: Mouth, envelope: readonly EnvelopeStation[]): PartMap<PortalKey> {
  const parts: PartMap<PortalKey> = {};
  const f: Frame = { origin: mouth.origin, axis: mouth.axis, across: mouth.across };
  const H = mouth.halfWidth;
  const top = FIGURES.tunnel.parapet;
  const openings = mouth.bores.map(archOpening);
  const toward: V3 = dir(f, 0, -1, 0); // out of the tunnel, toward a viewer on the approach
  const brick = part(parts, 'brick');
  const stone = part(parts, 'stone');
  const tube = part(parts, 'tube');

  // the face wall
  const outline = faceOutline(openings, H, top);
  const tris = THREE.ShapeUtils.triangulateShape(outline.map(([u, y]) => new THREE.Vector2(u, y)), []) as number[][];
  for (const t of tris) {
    const [pa, pb, pc] = (t as [number, number, number]).map((k) => outline[k] as [number, number]) as [[number, number], [number, number], [number, number]];
    brick.tri(at(f, pa[0], 0, pa[1]), at(f, pb[0], 0, pb[1]), at(f, pc[0], 0, pc[1]), [[pa[0] + H, pa[1]], [pb[0] + H, pb[1]], [pc[0] + H, pc[1]]], toward);
  }

  // the cornice along the top of the face
  addBox(stone, at(f, -H - 0.35, -PORTAL.cornice.out, top - PORTAL.cornice.height + 0.25), dir(f, 2 * H + 0.7, 0, 0), dir(f, 0, 0, PORTAL.cornice.height), dir(f, 0, PORTAL.cornice.out + 0.25, 0));

  for (const o of openings) {
    // voussoirs: a ring of stone round the head and a strip up each jamb, a hand's breadth proud of the face
    const w = -0.12;
    const ring = (a0: number, a1: number): void => {
      const p = (a: number, r: number): V3 => at(f, o.lateral + r * Math.cos(a), w, o.spring + r * Math.sin(a));
      const ri = o.halfWidth;
      const ro = o.halfWidth + PORTAL.voussoir;
      const uv = (a: number, r: number): V2 => [o.lateral + r * Math.cos(a) + H, o.spring + r * Math.sin(a)];
      stone.quadUV(p(a0, ri), p(a1, ri), p(a1, ro), p(a0, ro), [uv(a0, ri), uv(a1, ri), uv(a1, ro), uv(a0, ro)], toward);
    };
    for (let k = 0; k < PORTAL.arcSteps; k++) ring(Math.PI - (Math.PI * k) / PORTAL.arcSteps, Math.PI - (Math.PI * (k + 1)) / PORTAL.arcSteps);
    for (const side of [-1, 1]) {
      const u0 = o.lateral + side * o.halfWidth;
      const u1 = u0 + side * PORTAL.voussoir;
      stone.quadUV(at(f, u0, w, 0), at(f, u1, w, 0), at(f, u1, w, o.spring), at(f, u0, w, o.spring), [[u0 + H, 0], [u1 + H, 0], [u1 + H, o.spring], [u0 + H, o.spring]], toward);
    }

    // the recess: the arch's own outline run back PORTAL.recess metres, faces turned in, and a dark end
    const prof: [number, number][] = [[o.lateral - o.halfWidth, 0]];
    for (let k = 0; k <= PORTAL.arcSteps; k++) {
      const a = Math.PI - (Math.PI * k) / PORTAL.arcSteps;
      prof.push([o.lateral + o.halfWidth * Math.cos(a), o.spring + o.halfWidth * Math.sin(a)]);
    }
    prof.push([o.lateral + o.halfWidth, 0]);
    for (let i = 0; i + 1 < prof.length; i++) {
      const a = prof[i] as [number, number];
      const b = prof[i + 1] as [number, number];
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const inward = dir(f, o.lateral - mid[0], 0, o.spring - mid[1]); // toward the bore's centre line
      tube.quadUV(at(f, a[0], 0, a[1]), at(f, b[0], 0, b[1]), at(f, b[0], PORTAL.recess, b[1]), at(f, a[0], PORTAL.recess, a[1]), undefined, inward);
    }
    const first = prof[0] as [number, number];
    const last = prof[prof.length - 1] as [number, number];
    tube.quadUV(at(f, first[0], 0, 0.01), at(f, last[0], 0, 0.01), at(f, last[0], PORTAL.recess, 0.01), at(f, first[0], PORTAL.recess, 0.01), undefined, [0, 1, 0]);
    tube.fan(prof.map(([u, y]) => at(f, u, PORTAL.recess, y)), toward);
  }

  // retaining walls
  const side = (sign: -1 | 1): void => {
    const path = wingPath(sign, H, top, envelope);
    const inner = dir(f, -sign, 0, 0);
    const outer = dir(f, sign, 0, 0);
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i] as { u: number; d: number; h: number };
      const b = path[i + 1] as { u: number; d: number; h: number };
      const run = Math.hypot(b.d - a.d, b.u - a.u);
      const s0 = a.d;
      const s1 = a.d + run;
      const t = PORTAL.wallThickness;
      const ua = a.u + sign * t;
      const ub = b.u + sign * t;
      // inner face (toward the tracks), outer face, and the sloping top
      brick.quadUV(at(f, a.u, -a.d, 0), at(f, b.u, -b.d, 0), at(f, b.u, -b.d, b.h), at(f, a.u, -a.d, a.h), [[s0, 0], [s1, 0], [s1, b.h], [s0, a.h]], inner);
      brick.quadUV(at(f, ua, -a.d, 0), at(f, ub, -b.d, 0), at(f, ub, -b.d, b.h), at(f, ua, -a.d, a.h), [[s0, 0], [s1, 0], [s1, b.h], [s0, a.h]], outer);
      stone.quadUV(at(f, a.u, -a.d, a.h), at(f, b.u, -b.d, b.h), at(f, ub, -b.d, b.h), at(f, ua, -a.d, a.h), [[s0, 0], [s1, 0], [s1, t], [s0, t]], [0, 1, 0]);
    }
    const end = path[path.length - 1] as { u: number; d: number; h: number };
    brick.quadUV(at(f, end.u, -end.d, 0), at(f, end.u + sign * PORTAL.wallThickness, -end.d, 0), at(f, end.u + sign * PORTAL.wallThickness, -end.d, end.h), at(f, end.u, -end.d, end.h), [[0, 0], [PORTAL.wallThickness, 0], [PORTAL.wallThickness, end.h], [0, end.h]], toward);
    // and the end of the wall at the face: closed by the face wall's own end
    brick.quadUV(at(f, sign * H, 0, 0), at(f, sign * H + sign * PORTAL.wallThickness, 0, 0), at(f, sign * H + sign * PORTAL.wallThickness, 0, top), at(f, sign * H, 0, top), [[0, 0], [PORTAL.wallThickness, 0], [PORTAL.wallThickness, top], [0, top]], dir(f, 0, 1, 0));
  };
  side(-1);
  side(1);
  return parts;
}

/**
 * The earth bank over a tunnel run: flat across the tunnel's own nodes plus `pad` either side, sides at
 * 45 degrees, as high as the face wall at a mouth and ramping down to the ridge height; at the open
 * end of the extract it tapers away.
 */
export function coverParts(cover: Cover): PartMap<PortalKey> {
  const parts: PartMap<PortalKey> = {};
  const earth = part(parts, 'earth');
  const f: Frame = { origin: cover.from, axis: cover.axis, across: cover.across };
  const c = PORTAL.cover;
  const capTop = FIGURES.tunnel.parapet - 0.3;
  const L = cover.length;
  const [r0, r1] = c.ramp;
  // stations along the run: [s, height]
  const stations: [number, number][] = [[0.3, capTop], [r0, capTop], [r1, c.ridge]];
  if (cover.openEnded) stations.push([L - c.taper, c.ridge], [L, 0]);
  else stations.push([L - r1, c.ridge], [L - r0, capTop], [L - 0.3, capTop]);
  const section = (h: number): [number, number][] => [[cover.lo - c.pad - h, 0], [cover.lo - c.pad, h], [cover.hi + c.pad, h], [cover.hi + c.pad + h, 0]];
  for (let i = 0; i + 1 < stations.length; i++) {
    const [sa, ha] = stations[i] as [number, number];
    const [sb, hb] = stations[i + 1] as [number, number];
    const A = section(ha);
    const B = section(hb);
    for (let k = 0; k < 3; k++) {
      const a0 = A[k] as [number, number];
      const a1 = A[k + 1] as [number, number];
      const b0 = B[k] as [number, number];
      const b1 = B[k + 1] as [number, number];
      // outward: the left slope faces -across, the top faces up, the right slope faces +across
      const out: V3 = k === 0 ? dir(f, -1, 0, 1) : k === 1 ? [0, 1, 0] : dir(f, 1, 0, 1);
      earth.quadUV(at(f, a0[0], sa, a0[1]), at(f, a1[0], sa, a1[1]), at(f, b1[0], sb, b1[1]), at(f, b0[0], sb, b0[1]), undefined, out);
    }
  }
  // end caps behind each face wall: the section with a notch for every arch, so the dark recess shows through
  const cap = (s: number, facing: V3, arches: readonly ArchOpening[]): void => {
    const sec = section(capTop);
    const out: [number, number][] = [sec[0] as [number, number]];
    for (const o of [...arches].sort((a, b) => a.lateral - b.lateral)) {
      out.push([o.lateral - o.halfWidth, 0]);
      for (let k = 0; k <= PORTAL.arcSteps; k++) {
        const a = Math.PI - (Math.PI * k) / PORTAL.arcSteps;
        out.push([o.lateral + o.halfWidth * Math.cos(a), o.spring + o.halfWidth * Math.sin(a)]);
      }
      out.push([o.lateral + o.halfWidth, 0]);
    }
    out.push(sec[3] as [number, number], sec[2] as [number, number], sec[1] as [number, number]);
    const tris = THREE.ShapeUtils.triangulateShape(out.map(([u, y]) => new THREE.Vector2(u, y)), []) as number[][];
    for (const t of tris) {
      const [a, b, c] = (t as [number, number, number]).map((k) => out[k] as [number, number]) as [[number, number], [number, number], [number, number]];
      earth.tri(at(f, a[0], s, a[1]), at(f, b[0], s, b[1]), at(f, c[0], s, c[1]), undefined, facing);
    }
  };
  cap(0.3, dir(f, 0, -1, 0), openingsIn(cover, cover.mouths[0]));
  if (!cover.openEnded) cap(L - 0.3, dir(f, 0, 1, 0), openingsIn(cover, cover.mouths[cover.mouths.length - 1]));
  return parts;
}

/** A mouth's arches with their lateral positions measured across the run's own axis (the two frames differ a little in direction, and a far mouth looks back the other way). */
export function openingsIn(cover: Pick<Cover, 'from' | 'across'>, mouth: Mouth | undefined): ArchOpening[] {
  if (!mouth) return [];
  return mouth.bores.map(archOpening).map((o) => {
    const x = mouth.origin[0] + mouth.across[0] * o.lateral - cover.from[0];
    const z = mouth.origin[1] + mouth.across[1] * o.lateral - cover.from[1];
    return { ...o, lateral: x * cover.across[0] + z * cover.across[1] };
  });
}

export interface Portals {
  group: THREE.Group;
  /** the mouths drawn, from core/landmarks.ts tunnelMouths */
  mouths: Mouth[];
  covers: Cover[];
  stats: { meshes: number; triangles: number; mouths: number };
  dispose(): void;
}

export interface PortalOptions {
  /** the earth bank over each tunnel (default true) */
  cover?: boolean;
}

export function addPortals(scene: THREE.Scene, data: KxData, opts: PortalOptions = {}): Portals {
  const mouths = tunnelMouths(data);
  const covers = tunnelCover(data);
  const sets: PartMap<PortalKey>[] = mouths.map((m) => mouthParts(m, approachEnvelope(data, m, PORTAL.wing.reach, PORTAL.wing.step)));
  if (opts.cover !== false) for (const c of covers) sets.push(coverParts(c));
  const owned: THREE.Material[] = [];
  const earth = new THREE.MeshLambertMaterial({ color: 0x3f4a35 }); // ASSUMED: grass-grown embankment, dark under the night sky
  const tube = new THREE.MeshBasicMaterial({ color: 0x090b0e });
  owned.push(earth, tube);
  const table: Record<PortalKey, THREE.Material> = { brick: material('brick'), stone: material('stone'), earth, tube };
  const { group, triangles } = mergeParts<PortalKey>(sets, table, 'portals');
  scene.add(group);
  const geometries: THREE.BufferGeometry[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) geometries.push(o.geometry);
  });
  return {
    group,
    mouths,
    covers,
    stats: { meshes: group.children.length, triangles, mouths: mouths.length },
    dispose(): void {
      scene.remove(group);
      for (const g of geometries) g.dispose();
      for (const m of owned) m.dispose();
    },
  };
}
