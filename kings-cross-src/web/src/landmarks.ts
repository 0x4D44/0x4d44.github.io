// The buildings around King's Cross from the numbers in core/landmarks.ts: the Great Northern Hotel, the St Pancras (Midland Grand) Hotel and the Barlow shed.
// Procedural, on materials.ts's textures, in world coordinates (x east, y up, z south) on y = 0, then raised onto its seat (`liftParts`); UVs in METRES. No DOM
// needed. Wiring (main.ts): `addLandmarks(scene, data, { terrain })` once; pass LANDMARK_OSM_IDS to buildingPrisms().
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { barlowSection, FIGURES, landmarkPlans, landmarkSeats, pointInPolygon, polygonEdges, REPLACED_BUILDING_IDS, towerSquare } from '../../core/landmarks.ts';
import type { BarlowPlan, BayPosition, Edge, HotelFaceKind, HotelPlan, LandmarkName, LandmarkPlans, MidlandPlan, Seat, TowerPlan } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import type { Terrain } from '../../core/terrain.ts';
import { mergeParts, material, part, TEXTURES } from './materials.ts';
import type { Batch, PartMap, V2, V3 } from './materials.ts';

export { towerSquare };

/** The OSM building ids this module replaces: leave them out of buildingPrisms(). */
export const LANDMARK_OSM_IDS: readonly number[] = REPLACED_BUILDING_IDS;

// ---- the mesh builder: every wall, roof and band goes into a `Batch` (materials.ts), one per material per building (`part`), merged by `mergeParts`

const UP: V3 = [0, 1, 0];

// ---- materials ---------------------------------------------------------------------------------

export type Key = 'brick' | 'brickRed' | 'stone' | 'slate' | 'sash' | 'sashArch' | 'pane' | 'roofGlass' | 'rib' | 'lining' | 'metal' | 'clock';

export interface MaterialSet {
  table: Record<Key, THREE.Material>;
  /** the materials (and textures) this set made itself, to dispose; the shared ones from materials.ts are not ours */
  owned: (THREE.Material | THREE.Texture)[];
}

export function createMaterials(): MaterialSet {
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const own = <T extends THREE.Material | THREE.Texture>(x: T): T => {
    owned.push(x);
    return x;
  };
  // hist-c: a gilt ring round a cream dial, black Roman numerals and hands, a gilt rosette; colours ASSUMED.
  let clockMap: THREE.CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const hand = (a: number, len: number, width: number): void => {
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(128 - Math.sin(a) * 14, 128 + Math.cos(a) * 14);
      g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len);
      g.stroke();
    };
    g.fillStyle = '#c9a23c';
    g.beginPath();
    g.arc(128, 128, 126, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#efe8d2';
    g.beginPath();
    g.arc(128, 128, 106, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#1d1b18';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#1d1b18';
    g.font = 'bold 26px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((label, i) => g.fillText(label, 128 + Math.sin((i * Math.PI) / 6) * 80, 128 - Math.cos((i * Math.PI) / 6) * 80));
    g.fillStyle = '#c9a23c';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.ellipse(128 + Math.sin((i * Math.PI) / 4) * 15, 128 - Math.cos((i * Math.PI) / 4) * 15, 7, 13, (i * Math.PI) / 4, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#1d1b18';
    hand(2.4, 52, 8);
    hand(5.9, 78, 5);
    clockMap = own(new THREE.CanvasTexture(c));
    clockMap.colorSpace = THREE.SRGBColorSpace;
  }
  const clock = own(new THREE.MeshBasicMaterial({ map: clockMap, color: clockMap ? 0xffffff : 0xe9e2cc, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  // The shared materials belong to the lighting rig, so each tinted look is a clone. At the noon rig (?time=2026-06-21T12:00:00+01:00&weather=clear) the library's brick and
  // stone render at 0.84 and 0.72 of the luminance of hist-a and hist-b, hues right: the gains lift them level.
  const tint = (name: Parameters<typeof material>[0], [r, g, b]: [number, number, number], emissive?: number): THREE.MeshLambertMaterial => {
    const m = own((material(name) as THREE.MeshLambertMaterial).clone());
    m.color.setRGB(r, g, b);
    if (emissive !== undefined) m.emissive.set(emissive);
    return m;
  };
  const [brickGain, stoneGain, slateGain] = [1.5, 1.75, 2.2];
  // hist-e: the extension's panels and girders, light grey against the white frame; the shade is ASSUMED, the emissive lifts the undersides
  const metal = own(new THREE.MeshLambertMaterial({ color: 0xa9b0b7, emissive: 0x30353a }));
  // hist-b: the Midland's brick is a light terracotta red (sunlit about 0xbd8263), not the library's deep crimson: the shared brick texture times (1.1, 0.55, 0.78); ASSUMED
  const brickRed = tint('brickRed', [1.1 * brickGain, 0.55 * brickGain, 0.78 * brickGain]);
  // hist-a, hist-b: the dressings are creamier and paler than the library's grey ashlar (about 0xdcd3be in daylight against its 0xc8c0aa); ASSUMED
  const stone = tint('stone', [1.25 * stoneGain, 1.2 * stoneGain, 1.15 * stoneGain]);
  // hist-a: the hotel's stock brick, a golden buff: a wall of it reads 0x786449, where (1, 0.96, 0.92) x 1.5 rendered 0x6d604a at the noon rig
  const brick = tint('brick', [1.15 * brickGain, 1.05 * brickGain, 0.88 * brickGain]);
  // hist-d: the glazing is silver-grey and bright, the ribs pale blue-grey (hist-d2: dark only in shadow); the library's glass is its pane texture (light sky blue, mean
  // 0xaec3d3) times 0x73879a, still blue: times 0xd4beaf it comes out neutral at twice the light. Shades ASSUMED. hist-a, hist-b: the slate is lighter and greyer than the library's
  // blue-grey (sunlit about 0x8f8d93 and 0x6b727b against its 0x434950 at the noon rig): a neutral colour of 2.2 renders as 0x666e78.
  const roofGlass = tint('shedGlass', [1.24, 0.95, 0.84], 0xd4beaf);
  const rib = tint('ribPaint', [0.62, 0.68, 0.76], 0x2c333b);
  const slate = tint('slateBothSides', [slateGain, slateGain, slateGain]);
  return {
    table: {
      brick,
      brickRed,
      stone,
      slate,
      sash: material('sash'),
      sashArch: material('sashArch'),
      pane: material('pane'),
      roofGlass, // the key keeps its name for the render order
      rib,
      lining: material('lining'), // pale boarding under the slate, seen from inside (hist-d)
      metal,
      clock,
    },
    owned,
  };
}

// ---- facade building blocks --------------------------------------------------------------------

/** Vertical wall strips around an outline, outward normals; u runs along the perimeter and v up, in metres. */
export function addWalls(m: Batch, outline: readonly Pt[], y0: number, y1: number): void {
  let s = 0;
  for (const e of polygonEdges(outline)) {
    const s0 = s;
    const s1 = s + e.length;
    s = s1;
    m.quadUV([e.a[0], y0, e.a[1]], [e.b[0], y0, e.b[1]], [e.b[0], y1, e.b[1]], [e.a[0], y1, e.a[1]], [[s0, y0], [s1, y0], [s1, y1], [s0, y1]], [e.normal[0], 0, e.normal[1]]);
  }
}

/**
 * A sloped roof from the eaves outline (y0) up to a ring (y1), and a flat cap on the ring; u along the eaves, v up the slope, in metres. A ring of
 * one repeated point makes a pyramid (no cap). With `runs` (each facet's horizontal run, for a ring parallel to the eaves) every facet is a flat
 * trapezoid whose UVs unfold true to scale; without, v is the length from each eaves corner to its ring corner.
 */
export function addRoof(m: Batch, outline: readonly Pt[], ring: readonly Pt[], y0: number, y1: number, cap = true, runs?: readonly number[]): void {
  const n = outline.length;
  const rise = y1 - y0;
  const slope = (i: number): number => Math.hypot((ring[i] as Pt)[0] - (outline[i] as Pt)[0], (ring[i] as Pt)[1] - (outline[i] as Pt)[1], rise);
  let s = 0;
  for (const e of polygonEdges(outline)) {
    const s0 = s;
    const s1 = s + e.length;
    s = s1;
    const j = (e.i + 1) % n;
    const a = outline[e.i] as Pt;
    const b = outline[j] as Pt;
    const ra = ring[e.i] as Pt;
    const rb = ring[j] as Pt;
    let uvs: [V2, V2, V2, V2] = [[s0, 0], [s1, 0], [s1, slope(j)], [s0, slope(e.i)]];
    if (runs) {
      // the facet's own plane: u along the eaves (a ring corner leans in along the edge by its offset from the eaves corner), v up the slant
      const v = Math.hypot(runs[e.i] as number, rise);
      uvs = [[s0, 0], [s1, 0], [s1 + (rb[0] - b[0]) * e.dir[0] + (rb[1] - b[1]) * e.dir[1], v], [s0 + (ra[0] - a[0]) * e.dir[0] + (ra[1] - a[1]) * e.dir[1], v]];
    }
    const hint: V3 = [e.normal[0], 1, e.normal[1]];
    if (Math.hypot(ra[0] - rb[0], ra[1] - rb[1]) < 1e-9) m.tri([a[0], y0, a[1]], [b[0], y0, b[1]], [rb[0], y1, rb[1]], [uvs[0], uvs[1], uvs[2]], hint);
    else m.quadUV([a[0], y0, a[1]], [b[0], y0, b[1]], [rb[0], y1, rb[1]], [ra[0], y1, ra[1]], uvs, hint);
  }
  if (!cap) return;
  const tris = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
  for (const [a, b, c] of tris as [number, number, number][]) {
    const p = (k: number): V3 => [(ring[k] as Pt)[0], y1, (ring[k] as Pt)[1]];
    const uv = (k: number): V2 => [(ring[k] as Pt)[0], (ring[k] as Pt)[1]];
    m.tri(p(a), p(b), p(c), [uv(a), uv(b), uv(c)], UP);
  }
}

/** A length of edge: where a band is drawn. s0 is the perimeter distance at `a`, so the stone's courses carry round corners. */
export interface Seg {
  a: Pt;
  b: Pt;
  normal: Pt;
  s0: number;
}

/** The parts of the polygon's edges outside every `cutter` (convex quads: tower footprints), as segments: bands are cut where a tower stands in front of the wall. */
export function segmentsOutside(edges: readonly Edge[], cutters: readonly (readonly Pt[])[]): Seg[] {
  const out: Seg[] = [];
  let s = 0;
  for (const e of edges) {
    let spans: [number, number][] = [[0, e.length]];
    for (const q of cutters) {
      // the interval of the edge inside the convex quad q: clip against each side
      const area = q.reduce((acc, p, i) => acc + p[0] * (q[(i + 1) % q.length] as Pt)[1] - (q[(i + 1) % q.length] as Pt)[0] * p[1], 0);
      const sign = area >= 0 ? 1 : -1;
      let lo = 0;
      let hi = e.length;
      for (let i = 0; i < q.length; i++) {
        const p = q[i] as Pt;
        const r = q[(i + 1) % q.length] as Pt;
        // inward normal of side p->r (inside is where the signed distance is >= 0)
        const nx = -(r[1] - p[1]) * sign;
        const nz = (r[0] - p[0]) * sign;
        const nl = Math.hypot(nx, nz) || 1;
        const d0 = ((e.a[0] - p[0]) * nx + (e.a[1] - p[1]) * nz) / nl;
        const d1 = (e.dir[0] * nx + e.dir[1] * nz) / nl;
        if (Math.abs(d1) < 1e-12) {
          if (d0 < 0) {
            lo = 1;
            hi = 0;
          }
        } else {
          const t = -d0 / d1;
          if (d1 > 0) lo = Math.max(lo, t);
          else hi = Math.min(hi, t);
        }
      }
      if (lo < hi) {
        const next: [number, number][] = [];
        for (const [a, b] of spans) {
          if (hi <= a || lo >= b) next.push([a, b]);
          else {
            if (lo > a) next.push([a, lo]);
            if (hi < b) next.push([hi, b]);
          }
        }
        spans = next;
      }
    }
    for (const [a, b] of spans) {
      if (b - a < 0.05) continue;
      out.push({ a: [e.a[0] + e.dir[0] * a, e.a[1] + e.dir[1] * a], b: [e.a[0] + e.dir[0] * b, e.a[1] + e.dir[1] * b], normal: e.normal, s0: s + a });
    }
    s += e.length;
  }
  return out;
}

/**
 * A band (string course or cornice) standing `out` metres proud of the wall, `h` tall, from y. Stone UVs in metres. Where a segment ends at the start of its
 * neighbour's and the turn is slight (under 60 degrees: a facet join) the two fronts are mitred: both end at the one corner, where their lines `out` from their walls
 * cross, so the band runs on as one without a step; a building's own corner keeps each segment's front square to its wall.
 */
export function addBand(m: Batch, segs: readonly Seg[], y: number, h: number, out: number): void {
  const front = (p: Pt, sg: Seg, nb: Seg | undefined, joint: Pt | undefined): V3 => {
    let [x, z] = sg.normal;
    if (nb && joint && Math.hypot(joint[0] - p[0], joint[1] - p[1]) < 1e-6) {
      const c = x * nb.normal[0] + z * nb.normal[1];
      if (c > 0.5) [x, z] = [(x + nb.normal[0]) / (1 + c), (z + nb.normal[1]) / (1 + c)];
    }
    return [p[0] + x * out, y, p[1] + z * out];
  };
  segs.forEach((sg, i) => {
    const prev = segs[(i + segs.length - 1) % segs.length];
    const next = segs[(i + 1) % segs.length];
    const l = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]);
    const n3: V3 = [sg.normal[0], 0, sg.normal[1]];
    const ao = front(sg.a, sg, prev, prev?.b);
    const bo = front(sg.b, sg, next, next?.a);
    const up = (v: V3, dy: number): V3 => [v[0], v[1] + dy, v[2]];
    const s0 = sg.s0;
    const s1 = sg.s0 + l;
    // a mitred end stands a little along the wall from the segment's end: the UVs follow it, so they stay in metres
    const along = (v: V3): number => s0 + ((v[0] - sg.a[0]) * (sg.b[0] - sg.a[0]) + (v[2] - sg.a[1]) * (sg.b[1] - sg.a[1])) / l;
    const [u0, u1] = [along(ao), along(bo)];
    m.quadUV(ao, bo, up(bo, h), up(ao, h), [[u0, y], [u1, y], [u1, y + h], [u0, y + h]], n3);
    m.quadUV(up(ao, h), up(bo, h), [sg.b[0], y + h, sg.b[1]], [sg.a[0], y + h, sg.a[1]], [[u0, 0], [u1, 0], [s1, out], [s0, out]], UP);
    m.quadUV([sg.a[0], y, sg.a[1]], [sg.b[0], y, sg.b[1]], bo, ao, [[s0, 0], [s1, 0], [u1, out], [u0, out]], [0, -1, 0]);
  });
}

export type Head = 'flat' | 'round' | 'pointed';

/** The outline of a window, as convex (x across, y up) points from the bottom-left corner; `w` wide, `h` tall. */
export function windowOutline(w: number, h: number, head: Head): [number, number][] {
  const hw = w / 2;
  if (head === 'flat') return [[-hw, 0], [hw, 0], [hw, h], [-hw, h]];
  if (head === 'round') {
    const spring = Math.max(0, h - hw);
    const pts: [number, number][] = [[-hw, 0], [hw, 0], [hw, spring]];
    for (let k = 1; k < 8; k++) {
      const a = (Math.PI * k) / 8;
      pts.push([Math.cos(a) * hw, spring + Math.sin(a) * hw]);
    }
    pts.push([-hw, spring]);
    return pts;
  }
  // pointed: two arcs of radius w meeting at the apex (an equilateral arch), whose head is w sin 60 = 0.866 w tall
  const spring = Math.max(0, h - w * Math.sin(Math.PI / 3));
  const pts: [number, number][] = [[-hw, 0], [hw, 0], [hw, spring]];
  for (let k = 1; k <= 3; k++) {
    const a = (Math.PI / 3) * (k / 3);
    pts.push([-hw + w * Math.cos(a), spring + w * Math.sin(a)]);
  }
  for (let k = 1; k <= 3; k++) {
    const a = Math.PI - (Math.PI / 3) * (1 - k / 3);
    pts.push([hw + w * Math.cos(a), spring + w * Math.sin(a)]);
  }
  pts.push([-hw, spring]);
  return pts;
}

interface Placed {
  at: Pt;
  dir: Pt;
  normal: Pt;
}

/** The point `x` across and `y` up from placement `p`'s middle, `lift` off its wall. */
const onWall = (p: Placed, x: number, y: number, lift = 0): V3 => [p.at[0] + p.dir[0] * x + p.normal[0] * lift, y, p.at[1] + p.dir[1] * x + p.normal[1] * lift];
/** `p` moved `x` along its wall and `lift` off it. */
const shift = (p: Placed, x: number, lift = 0): Placed => {
  const [a, , b] = onWall(p, x, 0, lift);
  return { at: [a, b], dir: p.dir, normal: p.normal };
};
/** The turn about y that lays a box's x axis along `d`. */
const yaw = (d: Pt): number => Math.atan2(-d[1], d[0]);

/** A flat window shape stood `lift` metres off the wall at `at` (bottom centre), facing `normal`; `textured` gives it stone UVs in metres. */
export function addWindow(m: Batch, p: Placed, y: number, w: number, h: number, head: Head, lift: number, textured = false): void {
  const pts = windowOutline(w, h, head).map(([x, yy]) => onWall(p, x, y + yy, lift));
  const along = (q: V3): number => (q[0] - p.at[0]) * p.dir[0] + (q[2] - p.at[1]) * p.dir[1];
  m.fan(pts, [p.normal[0], 0, p.normal[1]], textured ? (q) => [along(q), q[1]] : undefined);
}

/** One window with its stone surround: the surround is `margin` bigger all round and a hair behind the glass. */
export function addFramedWindow(parts: PartMap<Key>, p: Placed, y: number, w: number, h: number, head: Head, margin: number): void {
  addWindow(part(parts, 'stone'), p, y - margin, w + 2 * margin, h + margin * (head === 'flat' ? 1.6 : 1.3), head, 0.05, true);
  addWindow(part(parts, 'pane'), p, y, w, h, head, 0.1);
}

/** A sash window from the shared texture (surround, glass and bars drawn in it): a w x h quad, UVs spanning the whole texture. */
export function addSash(parts: PartMap<Key>, key: 'sash' | 'sashArch', p: Placed, y: number, w: number, h: number, lift = 0.08): void {
  const [tw, th] = TEXTURES[key === 'sash' ? 'window' : 'windowArch'].tile;
  const hw = w / 2;
  const q = (x: number, yy: number): V3 => onWall(p, x, y + yy, lift);
  part(parts, key).quadUV(q(-hw, 0), q(hw, 0), q(hw, h), q(-hw, h), [[0, 0], [tw, 0], [tw, th], [0, th]], [p.normal[0], 0, p.normal[1]]);
}

// ---- the Great Northern Hotel ------------------------------------------------------------------

const CORNICE_HEIGHT = 0.7; // ASSUMED
const CORNICE_OUT = 1.0; // hist-a: a heavy modillion cornice stands well out from the wall; the depth is ASSUMED
const SASH_HEIGHT = 2.4; // ASSUMED
const ADVANCE = 0.4; // [HE-GNH] the sixth and thirteenth bays are "slightly advanced": hist-a shows each block about this far out (ASSUMED)
/**
 * The bays that stand ADVANCE out, by face, counting from 0. [HE-GNH]: on the main front "sixth and thirteenth bays slightly advanced with tripartite windows and stucco
 * dressings", on "the southern return 5 windows with slightly advanced central bay", and "Road facade similar". hist-a shows each advanced block three window bays wide,
 * framed by full-height cream pilasters, the sixth bay (cream, tripartite) its middle one: the blocks are those three bays (ASSUMED). The road (rear) front takes the
 * main front's blocks at the same thirds of its length (ASSUMED), the north-west end the return's central bay (ASSUMED: "the north-west end matches").
 */
export const HOTEL_ADVANCED: Record<HotelFaceKind, readonly number[]> = { main: [4, 5, 6, 11, 12, 13], rear: [5, 6, 7, 14, 15, 16], return: [2], end: [2] };
/** hist-a: tall round-headed openings in cream archivolts on the ground floor (a sill 0.6 m up, 1.6 x 3.2 m; sizes ASSUMED, scaled from the photograph's storey). */
export const ARCH = { sill: 0.6, width: 1.6, height: 3.2 } as const;
const PILASTER = 1.0; // hist-a: the cream pilasters are about this wide at most (ASSUMED); each gives way to the light of the bay beside it

// [HE-GNH](https://historicengland.org.uk/listing/the-list/list-entry/1113244?section=official-list-entry): "Slate roof with pedimented dormers." Sizes and the one-per-bay count are ASSUMED; places follow the facade bays and the eaves/ridge ring.
const GNH_DORMER_INSET = 0.34; // ASSUMED fraction up the roof slope
const GNH_DORMER_REAR_INSET = 0.68; // ASSUMED dormer roof run
const GNH_DORMER_WIDTH = 1.8; // ASSUMED maximum width
const GNH_DORMER_WALL_HEIGHT = 1.35; // ASSUMED
const GNH_DORMER_PEDIMENT_RISE = 0.65; // ASSUMED
const GNH_DORMER_WINDOW_SILL = 0.18; // ASSUMED
const GNH_DORMER_WINDOW_WIDTH = 1.05; // ASSUMED
const GNH_DORMER_WINDOW_HEIGHT = 1.15; // ASSUMED
const GNH_DORMER_REAR_CLEARANCE = 0.04; // ASSUMED: the slate cheeks meet the main roof

// [HE-GNH](https://historicengland.org.uk/listing/the-list/list-entry/1113244?section=official-list-entry) also records "Prominent slab chimney-stacks";
// hist-a shows eight or nine in the hotel's brick with pale slab caps, each about a dormer wide. ASSUMED: eight on each long slope, over its middle.
const GNH_CHIMNEY_COUNT_PER_LONG_SLOPE = 8; // ASSUMED
const GNH_CHIMNEY_WIDTH = 1.5; // ASSUMED shaft width along a facade bay
const GNH_CHIMNEY_DEPTH = 0.8; // ASSUMED depth across the roof slope
const GNH_CHIMNEY_CAP_WIDTH = 1.75; // ASSUMED slab cap width
const GNH_CHIMNEY_CAP_DEPTH = 1.0; // ASSUMED slab cap depth
const GNH_CHIMNEY_HEIGHT = 3.2; // ASSUMED stack height, scaled from hist-a (a stack stands about one and a half dormers tall)
const GNH_CHIMNEY_CAP_HEIGHT = 0.14; // ASSUMED slab cap thickness
const GNH_ROOF_DETAIL_GAP = 0.12; // ASSUMED clear roof run between dormer backs and chimney-cap fronts

/** A point on one actual roof facet; `inset` interpolates the matching OSM eaves and roof-ring edges. */
function hotelRoofPoint(plan: HotelPlan, edgeIndex: number, t: number, inset: number): V3 {
  const j = (edgeIndex + 1) % plan.outline.length;
  const a = plan.outline[edgeIndex] as Pt, b = plan.outline[j] as Pt;
  const ra = plan.roof.ring[edgeIndex] as Pt, rb = plan.roof.ring[j] as Pt;
  const x0 = a[0] + (b[0] - a[0]) * t, z0 = a[1] + (b[1] - a[1]) * t;
  const x1 = ra[0] + (rb[0] - ra[0]) * t, z1 = ra[1] + (rb[1] - ra[1]) * t;
  const x = x0 + (x1 - x0) * inset, z = z0 + (z1 - z0) * inset;
  const p: Pt = [x, z], rise = plan.ridge - plan.eaves;
  const height = (u: Pt, v: Pt, w: Pt, yu: number, yv: number, yw: number): number | undefined => {
    const uvx = v[0] - u[0], uvz = v[1] - u[1], uwx = w[0] - u[0], uwz = w[1] - u[1];
    const px = p[0] - u[0], pz = p[1] - u[1], d = uvx * uwz - uvz * uwx;
    if (Math.abs(d) < 1e-10) return undefined;
    const q = (px * uwz - pz * uwx) / d, r = (uvx * pz - uvz * px) / d;
    return q >= -1e-8 && r >= -1e-8 && q + r <= 1 + 1e-8 ? yu + q * (yv - yu) + r * (yw - yu) : undefined;
  };
  const y = height(a, b, rb, plan.eaves, plan.eaves, plan.eaves + rise) ?? height(a, rb, ra, plan.eaves, plan.eaves + rise, plan.eaves + rise);
  return [x, y ?? plan.eaves + rise * inset, z];
}

function bayParameter(plan: HotelPlan, bay: BayPosition): { edgeLength: number; t: number; roofRun: number } {
  const a = plan.outline[bay.edge] as Pt, b = plan.outline[(bay.edge + 1) % plan.outline.length] as Pt;
  const ra = plan.roof.ring[bay.edge] as Pt, rb = plan.roof.ring[(bay.edge + 1) % plan.outline.length] as Pt;
  const dx = b[0] - a[0], dz = b[1] - a[1], edgeLength = Math.hypot(dx, dz);
  const t = ((bay.at[0] - a[0]) * dx + (bay.at[1] - a[1]) * dz) / (edgeLength * edgeLength);
  const roofRun = (Math.hypot(ra[0] - a[0], ra[1] - a[1]) + Math.hypot(rb[0] - b[0], rb[1] - b[1])) / 2;
  return { edgeLength, t, roofRun };
}

function addHotelDormer(parts: PartMap<Key>, plan: HotelPlan, bay: BayPosition): void {
  const { edgeLength, t } = bayParameter(plan, bay);
  const width = Math.min(GNH_DORMER_WIDTH, bay.width * 0.55);
  const dt = width / (2 * edgeLength);
  const left = hotelRoofPoint(plan, bay.edge, t - dt, GNH_DORMER_INSET);
  const right = hotelRoofPoint(plan, bay.edge, t + dt, GNH_DORMER_INSET);
  const centre = hotelRoofPoint(plan, bay.edge, t, GNH_DORMER_INSET);
  const shoulderLeft: V3 = [left[0], centre[1] + GNH_DORMER_WALL_HEIGHT, left[2]];
  const shoulderRight: V3 = [right[0], centre[1] + GNH_DORMER_WALL_HEIGHT, right[2]];
  const apex: V3 = [centre[0], centre[1] + GNH_DORMER_WALL_HEIGHT + GNH_DORMER_PEDIMENT_RISE, centre[2]];
  const faceNormal: V3 = [bay.normal[0], 0, bay.normal[1]];
  part(parts, 'stone').fan([left, right, shoulderRight, apex, shoulderLeft], faceNormal, p => [p[0], p[1]]);
  addSash(parts, 'sash', { at: [centre[0], centre[2]], dir: bay.dir, normal: bay.normal }, centre[1] + GNH_DORMER_WINDOW_SILL, GNH_DORMER_WINDOW_WIDTH, GNH_DORMER_WINDOW_HEIGHT);

  const backLeft = hotelRoofPoint(plan, bay.edge, t - dt, GNH_DORMER_REAR_INSET);
  const backRight = hotelRoofPoint(plan, bay.edge, t + dt, GNH_DORMER_REAR_INSET);
  const backCentre = hotelRoofPoint(plan, bay.edge, t, GNH_DORMER_REAR_INSET);
  const rearTopLeft: V3 = [backLeft[0], backLeft[1] + GNH_DORMER_REAR_CLEARANCE, backLeft[2]];
  const rearTopRight: V3 = [backRight[0], backRight[1] + GNH_DORMER_REAR_CLEARANCE, backRight[2]];
  const rearApex: V3 = [backCentre[0], backCentre[1] + GNH_DORMER_REAR_CLEARANCE, backCentre[2]];
  const slate = part(parts, 'slate');
  const depth = Math.hypot(backCentre[0] - centre[0], backCentre[2] - centre[2]);
  const uv: [number, number][] = [[0, 0], [depth, 0], [depth, GNH_DORMER_WALL_HEIGHT], [0, GNH_DORMER_WALL_HEIGHT]];
  slate.quadUV(left, backLeft, rearTopLeft, shoulderLeft, uv as [[number, number], [number, number], [number, number], [number, number]], faceNormal);
  slate.quadUV(right, shoulderRight, rearTopRight, backRight, uv as [[number, number], [number, number], [number, number], [number, number]], [-faceNormal[0], 0, -faceNormal[2]]);
  const roofUv: [[number, number], [number, number], [number, number], [number, number]] = [[0, 0], [width / 2, 0], [width / 2, depth], [0, depth]];
  slate.quadUV(apex, shoulderLeft, rearTopLeft, rearApex, roofUv, UP);
  slate.quadUV(apex, rearApex, rearTopRight, shoulderRight, roofUv, UP);
}

function hotelChimneyBays(plan: HotelPlan): BayPosition[] {
  const n = GNH_CHIMNEY_COUNT_PER_LONG_SLOPE;
  return plan.faces.filter(face => face.bays.length >= 8).flatMap(face => Array.from({ length: n }, (_, i) => face.bays[Math.floor(2.5 + (i * (face.bays.length - 6)) / (n - 1))] as BayPosition));
}

function addHotelChimney(parts: PartMap<Key>, plan: HotelPlan, bay: BayPosition): void {
  const { edgeLength, t, roofRun } = bayParameter(plan, bay);
  const capHalfInset = GNH_CHIMNEY_CAP_DEPTH / (2 * roofRun);
  const inset = Math.min(1 - capHalfInset - 0.02, GNH_DORMER_REAR_INSET + capHalfInset + GNH_ROOF_DETAIL_GAP / roofRun);
  const df = GNH_CHIMNEY_DEPTH / (2 * roofRun);
  const shaftCorners = [
    hotelRoofPoint(plan, bay.edge, t - GNH_CHIMNEY_WIDTH / (2 * edgeLength), inset - df),
    hotelRoofPoint(plan, bay.edge, t + GNH_CHIMNEY_WIDTH / (2 * edgeLength), inset - df),
    hotelRoofPoint(plan, bay.edge, t + GNH_CHIMNEY_WIDTH / (2 * edgeLength), inset + df),
    hotelRoofPoint(plan, bay.edge, t - GNH_CHIMNEY_WIDTH / (2 * edgeLength), inset + df),
  ];
  const centre = hotelRoofPoint(plan, bay.edge, t, inset);
  const shaftTopY = centre[1] + GNH_CHIMNEY_HEIGHT - GNH_CHIMNEY_CAP_HEIGHT;
  const shaftTop = shaftCorners.map(([x, , z]): V3 => [x, shaftTopY, z]);
  const capRoofCorners = [
    hotelRoofPoint(plan, bay.edge, t - GNH_CHIMNEY_CAP_WIDTH / (2 * edgeLength), inset - capHalfInset),
    hotelRoofPoint(plan, bay.edge, t + GNH_CHIMNEY_CAP_WIDTH / (2 * edgeLength), inset - capHalfInset),
    hotelRoofPoint(plan, bay.edge, t + GNH_CHIMNEY_CAP_WIDTH / (2 * edgeLength), inset + capHalfInset),
    hotelRoofPoint(plan, bay.edge, t - GNH_CHIMNEY_CAP_WIDTH / (2 * edgeLength), inset + capHalfInset),
  ];
  // The lower lip sits at shaft-top height, not on the roof; only the narrow shaft feet touch slate.
  const capBase = capRoofCorners.map(([x, , z]): V3 => [x, shaftTopY, z]);
  const capTopY = shaftTopY + GNH_CHIMNEY_CAP_HEIGHT;
  const capTop = capBase.map(([x, , z]): V3 => [x, capTopY, z]);
  const stone = part(parts, 'stone');
  const sides: V3[] = [[bay.normal[0], 0, bay.normal[1]], [bay.dir[0], 0, bay.dir[1]], [-bay.normal[0], 0, -bay.normal[1]], [-bay.dir[0], 0, -bay.dir[1]]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const [a, b] = [shaftCorners[i] as V3, shaftCorners[j] as V3];
    const w = Math.hypot(b[0] - a[0], b[2] - a[2]);
    part(parts, 'brick').quadUV(a, b, shaftTop[j] as V3, shaftTop[i] as V3, [[0, a[1]], [w, b[1]], [w, shaftTopY], [0, shaftTopY]], sides[i] as V3);
    stone.quadUV(capBase[i] as V3, capBase[j] as V3, capTop[j] as V3, capTop[i] as V3, undefined, sides[i] as V3);
  }
  stone.quadUV(capBase[0] as V3, capBase[1] as V3, capBase[2] as V3, capBase[3] as V3, undefined, [0, -1, 0]);
  stone.quadUV(capTop[0] as V3, capTop[1] as V3, capTop[2] as V3, capTop[3] as V3, undefined, UP);
}

function addHotelRoofDetails(parts: PartMap<Key>, plan: HotelPlan): void {
  for (const face of plan.faces) for (const bay of face.bays) addHotelDormer(parts, plan, bay);
  for (const bay of hotelChimneyBays(plan)) addHotelChimney(parts, plan, bay);
}

export function hotelGeometry(plan: HotelPlan): PartMap<Key> {
  const parts: PartMap<Key> = {};
  const stone = part(parts, 'stone');
  // hist-a: the ground floor is pale stucco, cream piers between tall arched openings, up to its string course (the scorer: "a pale stucco base with tall openings"); the brick begins there
  const stucco = plan.groundStorey - 0.12;
  addWalls(part(parts, 'brick'), plan.outline, stucco, plan.eaves);
  addWalls(stone, plan.outline, 0, stucco);
  const segs = segmentsOutside(polygonEdges(plan.outline), []);
  const top = plan.eaves - CORNICE_HEIGHT;
  // hist-a: a stucco string course over the ground floor and a sill course under each upper row (the first has the ground floor's); sizes ASSUMED.
  // [HE-GNH]: "Plain stucco bands at 1st, 2nd, and 3rd floor levels"
  const courses: [number, number, number][] = [[plan.groundStorey - 0.12, 0.28, 0.1]];
  for (let s = 2; s < plan.storeys; s++) courses.push([plan.groundStorey + (s - 1) * plan.upperStorey + 0.2, 0.3, 0.1]);
  addBand(stone, segs, 0, 1, 0.06); // hist-a: the ground floor stands on a stucco base about a metre high (ASSUMED)
  addBand(stone, segs, top, CORNICE_HEIGHT, CORNICE_OUT); // modillion cornice [HE-GNH]
  for (const c of courses) addBand(stone, segs, ...c);
  addRoof(part(parts, 'slate'), plan.outline, plan.roof.ring, plan.eaves, plan.ridge);
  addHotelRoofDetails(parts, plan);

  const f = FIGURES.gnh;
  const [tw] = TEXTURES.window.tile;
  const { sill, width: aw, height: ah } = ARCH;
  const crown = sill + ah;
  const bays = plan.faces.flatMap(face => face.bays);
  const openings = bays.map(({ at, dir, normal }) => [-aw / 2, aw / 2, aw / 2, -aw / 2].map((x, i) => [at[0] + dir[0] * x + normal[0] * (i < 2 ? -1 : 1), at[1] + dir[1] * x + normal[1] * (i < 2 ? -1 : 1)] as Pt));
  addBand(stone, segmentsOutside(polygonEdges(plan.outline), openings), crown - aw / 2 - 0.08, 0.16, 0.14); // [HE-GNH] continuous imposts; profile is ASSUMED
  const blocks: Seg[] = []; // the faces of the advanced blocks, which the courses cross
  for (const face of plan.faces) {
    const adv = HOTEL_ADVANCED[face.kind];
    face.bays.forEach((bay, index) => {
      const rotY = yaw(bay.dir);
      const on = adv.includes(index);
      const lift = on ? ADVANCE : 0;
      stone.box(onWall(bay, 0, crown + 0.1, 0.2), [0.5, 0.45, 0.12], { rotY }); // [HE-GNH] keystone dimensions are ASSUMED
      // ground floor: round-headed openings [HE-GNH], each in a cream archivolt 0.25 m wide (hist-a)
      addWindow(stone, bay, sill - 0.1, Math.min(aw + 0.5, bay.width - 0.1), ah + 0.3, 'round', 0.04, true);
      addSash(parts, 'sashArch', bay, sill, aw, ah);
      // the ends of the run of advanced bays it is in, and of the face: a pilaster stands there
      const ends = [-1, 1].map(k => !face.bays[index + k] || adv.includes(index + k) !== on);
      const centre = on && ends[0] === ends[1];
      const wide = [0, 0] as [number, number];
      ends.forEach((end, i) => {
        const k = i ? 1 : -1;
        const next = face.bays[index + k];
        // hist-a: full-height cream pilasters 0.14 m proud of the wall at the ends of a face, and of the block at both sides of an advanced one: a metre wide at most (ASSUMED),
        // reaching 0.3 m into the block's end bay (no nearer the middle than the outer light of a bay of three, 1.2 m) and no nearer than 0.8 m to the light of the bay beside it
        const [s0, s1] = !next ? [Math.max(bay.width / 2 - 1, 0.8), bay.width / 2] : end && on ? [Math.max(bay.width / 2 - 0.3, centre ? 1.2 : 0), Math.min(bay.width / 2 + PILASTER, (bay.width + next.width) / 2 - 0.8)] : [0, 0];
        if (s1 - s0 < 0.3) return;
        const d = (next ? lift : 0) + 0.14;
        stone.box(onWall(bay, ((s0 + s1) / 2) * k, (1 + top) / 2, d / 2), [s1 - s0, top - 1, d], { rotY, skip: ['+y', '-y', '+z'] });
        if (next) wide[i] = s1 - bay.width / 2;
      });
      if (on) {
        // the block: brick from the first floor to the cornice, its middle bay cream (hist-a), its courses carried across it, the cornice broken forward over it and its pilasters
        part(parts, centre ? 'stone' : 'brick').box(onWall(bay, 0, (f.groundStorey + top) / 2, (ADVANCE - 0.15) / 2), [bay.width, top - f.groundStorey, ADVANCE + 0.15], { rotY, skip: ['+y'] });
        const [a, b] = [-bay.width / 2, bay.width / 2].map((x): Pt => [onWall(bay, x, 0, ADVANCE)[0], onWall(bay, x, 0, ADVANCE)[2]]);
        blocks.push({ a: a as Pt, b: b as Pt, normal: bay.normal, s0: 0 });
        stone.box(onWall(bay, (wide[1] - wide[0]) / 2, plan.eaves - CORNICE_HEIGHT / 2, CORNICE_OUT + ADVANCE / 2 - 0.005), [bay.width + wide[0] + wide[1], CORNICE_HEIGHT, ADVANCE + 0.01], { rotY, skip: ['+z'] });
      }
      for (let s = 1; s < f.storeys; s++) {
        // sashes 2.4 m tall (the shared texture is 2.6 m, squeezed a little) so the top row clears the cornice
        const base = f.groundStorey + (s - 1) * f.upperStorey + 0.5;
        if (centre) {
          for (const k of [-1, 0, 1]) addSash(parts, 'sash', shift(bay, k * 0.8), base, 0.75, SASH_HEIGHT, ADVANCE + 0.08);
        } else {
          addWindow(stone, bay, base - 0.1, Math.min(tw + 0.5, bay.width - 0.1), SASH_HEIGHT + 0.15, 'flat', lift + 0.04, true); // hist-a: a cream stucco architrave round every light, 0.25 m wide (ASSUMED)
          addSash(parts, 'sash', bay, base, tw, SASH_HEIGHT, lift + 0.08);
        }
      }
    });
  }
  for (const c of courses) addBand(stone, blocks, ...c);
  return parts;
}

// ---- the St Pancras Renaissance (Midland Grand) Hotel: what is not a published figure is drawn from refs/historic-neighbours/, its size ASSUMED by
// scaling: hist-b the front from Euston Road, hist-c the clock tower, hist-e the roof from the air

/** A square ring about `c`: `half` from the middle to each side, its sides along `along` and `out`. */
function squareAbout(c: Pt, along: Pt, out: Pt, half: number): Pt[] {
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => [c[0] + (along[0] * a + out[0] * b) * half, c[1] + (along[1] * a + out[1] * b) * half] as Pt);
}

/** The head of a pointed opening `w` wide, right jamb to left: two arcs springing at `spring`, `grow` m outside the opening; x across from the middle, y up from the sill. `round`: a semicircle (hist-b: the ground arches). */
export function headArc(w: number, spring: number, grow: number, steps = 3, round = false): [number, number][] {
  const hw = w / 2;
  const r = round ? hw + grow : w + grow;
  const end = round ? Math.PI / 2 : Math.acos(hw / r);
  const c = round ? 0 : -hw;
  const right: [number, number][] = [];
  const left: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const a = (end * k) / steps;
    right.push([c + r * Math.cos(a), spring + r * Math.sin(a)]);
    left.push([-c - r * Math.cos(a), spring + r * Math.sin(a)]);
  }
  return [...right, ...left.reverse().slice(1)];
}

/** The stone moulding round a window group's arch and jambs (hist-c): it keeps the red blocks of the arch from vanishing into the red wall. */
const MOULDING = 0.08;

/** A ring of voussoirs round a pointed head, stone and red brick in turn (hist-b, hist-c), with a thin stone moulding outside; the halves mirror each other, so the apex is a pair of pale blocks. `t` thick, `lift` off the wall. */
function addVoussoirs(parts: PartMap<Key>, p: Placed, y: number, w: number, spring: number, t: number, lift: number, steps = 3, round = false): void {
  const rings = [0, t, t + MOULDING].map((g) => headArc(w, spring, g, steps, round));
  const q = ([x, v]: readonly [number, number]): V3 => onWall(p, x, y + v, lift);
  const face: V3 = [p.normal[0], 0, p.normal[1]];
  const n = 2 * steps;
  const block = (r0: readonly [number, number][], r1: readonly [number, number][], k: number, key: Key): void => {
    const a = r0[k] as [number, number];
    const b = r0[k + 1] as [number, number];
    const c = r1[k + 1] as [number, number];
    const d = r1[k] as [number, number];
    part(parts, key).quadUV(q(a), q(b), q(c), q(d), [a, b, c, d], face);
  };
  for (let k = 0; k < n; k++) {
    block(rings[0] as [number, number][], rings[1] as [number, number][], k, Math.min(k, n - 1 - k) % 2 ? 'brickRed' : 'stone');
    block(rings[1] as [number, number][], rings[2] as [number, number][], k, 'stone');
  }
}

/** A flat `n`-sided disc (eight by default) of `r` on the wall at (x across, y up) from the placement's middle: a round light. */
function addDisc(m: Batch, p: Placed, x: number, y: number, r: number, lift: number, n = 8): void {
  const pts = Array.from({ length: n }, (_, k): V3 => {
    const a = (k * 2 * Math.PI) / n;
    return onWall(p, x + r * Math.cos(a), y + r * Math.sin(a), lift);
  });
  m.fan(pts, [p.normal[0], 0, p.normal[1]], (q) => [(q[0] - p.at[0]) * p.dir[0] + (q[2] - p.at[1]) * p.dir[1], q[1]]);
}

/** Two lancets under one pointed relieving arch of polychrome voussoirs, a stone shaft between, an oculus above and a sill below: the Euston Road front's window group (hist-b, hist-c). `W` is the arch's opening, `h` its height; sizes ASSUMED. */
export function addTwin(parts: PartMap<Key>, p: Placed, y: number, W: number, h: number): void {
  const stone = part(parts, 'stone');
  const pane = part(parts, 'pane');
  const t = 0.3;
  const spring = Math.max(0, h - W * Math.sin(Math.PI / 3));
  addWindow(stone, p, y, W, h, 'pointed', 0.05, true);
  const lw = (W - 0.6) / 2; // two lancets with a 0.6 m stone shaft between, so that the pair reads as a pair across the street
  for (const s of [-1, 1]) {
    const x = s * (lw / 2 + 0.3);
    addWindow(pane, shift(p, x), y, lw, h - 0.9, 'pointed', 0.1);
  }
  addDisc(pane, p, 0, y + h - 0.45, 0.27, 0.1);
  addVoussoirs(parts, p, y, W, spring, t, 0.05, 5);
  addJambs(parts, p, y, W, spring, t);
  stone.box(onWall(p, 0, y - 0.1, 0.2), [W + 0.6, 0.2, 0.5], { rotY: yaw(p.dir), skip: ['-y'] });
}

/** The jambs of an arch `W` wide with a ring `t` thick: its courses carried down to the sill (the course under the springing is brick, the next stone, and so on), and its moulding. */
function addJambs(parts: PartMap<Key>, p: Placed, y: number, W: number, spring: number, t: number): void {
  const nb = spring > 0.3 ? Math.max(1, Math.round(spring / 0.65)) : 0;
  const face: V3 = [p.normal[0], 0, p.normal[1]];
  const q = (x: number, v: number): V3 => onWall(p, x, y + v, 0.05);
  for (const s of [-1, 1]) {
    for (let k = 0; k < nb; k++) {
      const v0 = (spring * k) / nb;
      const v1 = (spring * (k + 1)) / nb;
      part(parts, (nb - 1 - k) % 2 === 0 ? 'brickRed' : 'stone').quadUV(q(s * (W / 2), v0), q(s * (W / 2 + t), v0), q(s * (W / 2 + t), v1), q(s * (W / 2), v1), [[0, v0], [t, v0], [t, v1], [0, v1]], face);
    }
    if (nb) part(parts, 'stone').quadUV(q(s * (W / 2 + t), 0), q(s * (W / 2 + t + MOULDING), 0), q(s * (W / 2 + t + MOULDING), spring), q(s * (W / 2 + t), spring), [[0, 0], [MOULDING, 0], [MOULDING, spring], [0, spring]], face);
  }
}

/** A round-headed opening in a ring of red and stone voussoirs, on jambs of red and stone courses (hist-b: the ground storey's arcade); sizes ASSUMED. */
export function addArch(parts: PartMap<Key>, p: Placed, y: number, w: number, h: number): void {
  addWindow(part(parts, 'pane'), p, y, w, h, 'round', 0.1);
  addVoussoirs(parts, p, y, w, h - w / 2, 0.22, 0.05, 3, true);
  addJambs(parts, p, y, w, h - w / 2, 0.22);
}

/** A chimney stack on the crown: a brick shaft, a stone corbel course and cap, a clay pot (hist-b, hist-e). Sizes ASSUMED, about a dormer wide. */
function addStack(parts: PartMap<Key>, c: Pt, dir: Pt, y: number, h: number): void {
  const rotY = yaw(dir);
  const brick = part(parts, 'brickRed');
  const stone = part(parts, 'stone');
  brick.box([c[0], y + h / 2, c[1]], [1.4, h, 0.95], { rotY, skip: ['-y'] });
  stone.box([c[0], y + h - 0.5, c[1]], [1.7, 0.2, 1.25], { rotY, skip: ['-y'] });
  stone.box([c[0], y + h + 0.13, c[1]], [1.85, 0.26, 1.4], { rotY });
  brick.box([c[0], y + h + 0.6, c[1]], [0.55, 0.7, 0.55], { rotY, skip: ['-y'] });
}

/** A four-sided spike (or a frustum, if `half1` is more than 0): the cap of a turret, a finial. Stripes alternate when given two materials. */
function addSpike(m: Batch, c: Pt, along: Pt, out: Pt, half0: number, y0: number, y1: number, half1 = 0): void {
  const r = half0 - half1;
  addRoof(m, squareAbout(c, along, out, half0), squareAbout(c, along, out, half1), y0, y1, false, [r, r, r, r]);
}

/**
 * A gabled projection on a pitched roof: `base` is the middle of its face where it meets the roof, `w` half its width, `h` its height to the apex, `hs` to
 * the shoulders (0: a triangle); the roof rises `slope` m to the metre going back, so the sides run back h / slope to meet it. The stone-bordered face
 * looks out along `normal`; `p` > 0 stands it that far in front of the roof's foot (a bay out of the wall).
 */
function addGable(parts: PartMap<Key>, base: V3, dir: Pt, normal: Pt, slope: number, w: number, h: number, hs: number, face: Key, p = 0): void {
  const slate = part(parts, 'slate');
  const stone = part(parts, 'stone');
  const q = (u: number, back: number, v: number): V3 => [base[0] + dir[0] * u - normal[0] * back, base[1] + v, base[2] + dir[1] * u - normal[1] * back];
  const out: V3 = [normal[0], 0, normal[1]];
  // the face, and round it (in the same plane, not behind it: nothing to fight over) a stone border up the sides and along the rakes
  const b = 0.14;
  const shape: V2[] = hs > 0 ? [[-w, 0], [w, 0], [w, hs], [0, h], [-w, hs]] : [[-w, 0], [w, 0], [0, h]];
  const border: V2[] = hs > 0 ? [[-w - b, 0], [w + b, 0], [w + b, hs], [0, h + 1.7 * b], [-w - b, hs]] : [[-w - b, 0], [w + b, 0], [0, h + 1.7 * b]];
  part(parts, face).poly(shape.map(([u, v]) => q(u, 0, v)), shape.map(([u, v]): V2 => [u, base[1] + v]), { normal: out });
  for (let k = 1; k < shape.length; k++) {
    const k1 = (k + 1) % shape.length;
    const corners = [border[k], border[k1], shape[k1], shape[k]] as [V2, V2, V2, V2];
    stone.quadUV(...(corners.map(([u, v]) => q(u, 0, v)) as [V3, V3, V3, V3]), corners, out);
  }
  for (const sign of [-1, 1]) {
    const span = Math.hypot(w, h - hs);
    if (hs > 0) {
      slate.tri(q(sign * w, 0, 0), q(sign * w, 0, hs), q(sign * w, hs / slope, hs), [[0, 0], [0, hs], [hs / slope, hs]], [sign * dir[0], 0, sign * dir[1]]);
      slate.quadUV(q(sign * w, 0, hs), q(0, 0, h), q(0, h / slope, h), q(sign * w, hs / slope, hs), [[0, 0], [span, 0], [span, h / slope], [0, hs / slope]], UP);
    } else if (p > 0) slate.quadUV(q(sign * w, 0, 0), q(0, 0, h), q(0, p + h / slope, h), q(sign * w, p, 0), [[0, 0], [span, 0], [span, p + h / slope], [0, p]], UP);
    else slate.tri(q(sign * w, 0, 0), q(0, 0, h), q(0, h / slope, h), [[0, 0], [span, 0], [span, h / slope]], UP);
  }
}

const PAVILION_OUT = 0.5; // ASSUMED, hist-b: how far a gabled bay stands out of the front (the footprint tests keep every vertex, its windows' sills too, within a metre of the walls)
/** hist-b: the front's gabled bays, each two window bays wide: the first bay of each, along the front (ASSUMED: three, over the two long runs). */
export const PAVILIONS: readonly number[] = [10, 14, 17];
const pavilionHalf = (b: BayPosition): number => b.width / 2 - 0.2;

/**
 * hist-b, hist-e: a gabled bay (`b`: its middle and width, two window bays) out of the front and through the cornice. ASSUMED, scaled from those photographs:
 * a stone entrance block to the first string course under a corbelled porch hood, brick above to the eaves, a steep brick gable 9 m higher with a stone border,
 * twin lancet and finial, two spirelets at its feet, the cornice and string courses carried round its front, slate cheeks back to the roof. Returns the wall it
 * stands on, which the parapet there gives up.
 */
function addPavilion(parts: PartMap<Key>, b: BayPosition, eaves: number, slope: number): Pt[] {
  const [P, y0, hp, w] = [PAVILION_OUT, 6, 9, pavilionHalf(b)];
  const brick = part(parts, 'brickRed');
  const stone = part(parts, 'stone');
  const q = (u: number, d: number, y: number): V3 => onWall(b, u, y, d);
  const at = (u: number, d: number): Pt => [q(u, d, 0)[0], q(u, d, 0)[2]];
  const rotY = yaw(b.dir);
  const wall = (m: Batch, [a, z]: readonly [number, number], u0: number, u1: number, d0: number, d1: number, hint: V3): void => {
    const l = Math.hypot(u1 - u0, d1 - d0);
    m.quadUV(q(u0, d0, a), q(u1, d1, a), q(u1, d1, z), q(u0, d0, z), [[0, a], [l, a], [l, z], [0, z]], hint);
  };
  // hist-b: the ground-storey block under the first string course is pale stone, the storeys above red brick
  for (const [m, span] of [[stone, [0, y0]], [brick, [y0, eaves]]] as const) {
    wall(m, span, -w, w, P, P, [b.normal[0], 0, b.normal[1]]);
    for (const s of [-1, 1]) wall(m, span, s * w, s * w, 0, P, [s * b.dir[0], 0, s * b.dir[1]]);
  }
  stone.box(q(0, (P + 0.4) / 2, y0 - 0.45), [2 * w + 0.4, 0.9, P + 0.4], { rotY, skip: ['+z'] }); // the porch hood over the entrances: corbels out from the first floor
  stone.box(q(0, (P + 0.3) / 2, eaves - 0.5), [2 * w + 0.6, 1, P + 0.3], { rotY, skip: ['+z', '-y'] });
  for (const y of [11.5, 17]) stone.box(q(0, (P + 0.12) / 2, y + 0.175), [2 * w + 0.24, 0.35, P + 0.12], { rotY, skip: ['+z'] });
  addGable(parts, q(0, P, eaves), b.dir, b.normal, slope, w, hp, 0, 'brickRed', P);
  addTwin(parts, shift(b, 0, P), eaves + 0.8, 2.6, 4.2);
  addSpike(stone, at(0, P), b.dir, b.normal, 0.15, eaves + hp, eaves + hp + 1.4);
  for (const s of [-1, 1]) addTurret(parts, at(s * w, P - 0.3), b.dir, b.normal, eaves + 0.9, 0.5, 3.5, 9); // hist-b: slender striped spirelets at the gable's feet break the skyline (ASSUMED sizes)
  return [[-w, -0.2], [w, -0.2], [w, 0.5], [-w, 0.5]].map(([u, d]) => at(u as number, d as number));
}

/** The roof of the Midland Grand: what a gable or a stack needs to stand on it. */
interface RoofFrame {
  plan: MidlandPlan;
  edges: Edge[];
  rise: number;
}

/** The point `d` m in from the eaves line of facet i and `s` m along it from the facet's first corner: on the facet, so its height follows the pitch. */
function onRoof(r: RoofFrame, i: number, s: number, d: number): V3 {
  const e = r.edges[i] as Edge;
  return [e.a[0] + e.dir[0] * s - e.normal[0] * d, r.plan.eaves + (r.rise * d) / (r.plan.roof.runs[i] as number), e.a[1] + e.dir[1] * s - e.normal[1] * d];
}

/** The stretch of facet i, along its eaves from its first corner, that is still the facet at every depth from d0 to d1 (hip lines lean in at a corner that turns away, out at a re-entrant one). */
function facetSpan(r: RoofFrame, i: number, d0: number, d1: number): [number, number] {
  const e = r.edges[i] as Edge;
  const n = r.plan.outline.length;
  const run = r.plan.roof.runs[i] as number;
  const ra = r.plan.roof.ring[i] as Pt;
  const rb = r.plan.roof.ring[(i + 1) % n] as Pt;
  const lo = ((ra[0] - e.a[0]) * e.dir[0] + (ra[1] - e.a[1]) * e.dir[1]) / run;
  const hi = ((rb[0] - e.b[0]) * e.dir[0] + (rb[1] - e.b[1]) * e.dir[1]) / run;
  return [Math.max(lo * d0, lo * d1), e.length + Math.min(hi * d0, hi * d1)];
}

/** One turret: a shaft of stone and red-brick courses, then a banded spirelet (hist-c: the clock tower's four corner turrets are striped). */
function addTurret(parts: PartMap<Key>, c: Pt, along: Pt, out: Pt, y0: number, half: number, shaft: number, cap: number): void {
  const courses = 4;
  for (let k = 0; k < courses; k++) addWalls(part(parts, k % 2 ? 'brickRed' : 'stone'), squareAbout(c, along, out, half), y0 + (shaft * k) / courses, y0 + (shaft * (k + 1)) / courses);
  const stripes = 3;
  for (let k = 0; k < stripes; k++) addSpike(part(parts, k % 2 ? 'brickRed' : 'stone'), c, along, out, half * (1 - k / stripes), y0 + shaft + (cap * k) / stripes, y0 + shaft + (cap * (k + 1)) / stripes, half * (1 - (k + 1) / stripes));
}

/**
 * Where a tower `H` tall's stages end: shaft, belfry, corbel table, wall head (the roof begins), roof top (the lantern stands), lantern top; the needle
 * runs on to `H`. ASSUMED, from hist-b (wall head at 0.69 H, so the spire is 31%; lantern 0.82 to 0.86 H) and hist-c (a belfry about 8 m tall), H being 76 m [WP-MGH].
 */
export function towerStages(H: number): { shaft: number; belfry: number; corbel: number; wall: number; roof: number; lantern: number } {
  const belfry = H * 0.6;
  return { shaft: H * 0.5, belfry, corbel: belfry + 1.8, wall: H * 0.69, roof: H * 0.82, lantern: H * 0.86 };
}

/**
 * The window groups of the facade's upper storeys, by base and height (hist-b): the first floor's are the tallest, the top storey's the shortest, under the cornice;
 * sizes ASSUMED. The towers carry the same rows while they are part of the facade.
 */
export const ROWS = [[6.9, 4.0], [12.4, 3.4], [17.9, 2.6]] as const;

/**
 * A tower on a square plan, by stages (ASSUMED, scaled from hist-c on the 76 m clock tower): a brick shaft of window rows then lancets, a belfry of
 * paired arches (the west tower: an arcade), a three-step corbel table, the clock stage (a dial and a brick gable on each face, [HE-STP] "gabled clocks
 * on each face"), four striped corner turrets, a steep slate roof, a lantern and a needle; a pointed portal at the foot of the front.
 */
function addTower(parts: PartMap<Key>, t: TowerPlan, plan: MidlandPlan): void {
  const h = t.side / 2;
  const H = t.height;
  const brick = part(parts, 'brickRed');
  const stone = part(parts, 'stone');
  const slate = part(parts, 'slate');
  const clockTower = t.name === 'clock';
  const { shaft: sT, belfry: bT, corbel: tT, wall: wH, roof: rT, lantern: lT } = towerStages(H);
  const sq = (half: number): Pt[] => squareAbout(t.centre, t.along, t.out, half);
  const ring = (half: number): Seg[] => segmentsOutside(polygonEdges(sq(half)), []);
  // the four faces, each looking out with its `dir` running to the viewer's right: front, back, then the sides
  const facesAt = (half: number): Placed[] => ([[t.out, t.along], [t.along, t.out]] as const).flatMap(([n, d]) => [1, -1].map((s): Placed => ({ at: [t.centre[0] + n[0] * half * s, t.centre[1] + n[1] * half * s], dir: [d[0] * s, d[1] * s], normal: [n[0] * s, n[1] * s] })));
  const faces = facesAt(h);

  // the shaft and the belfry: brick, string courses at the facade's levels and then every 9 m
  addWalls(brick, sq(h), 0, bT);
  for (const y of [6.0, 11.5, 17.0, 28.0, 37.0, 46.0]) if (y < sT - 1.5) addBand(stone, ring(h), y, 0.4, 0.2);
  addBand(stone, ring(h), sT, 0.5, 0.45); // hist-c: the belfry stands on a balcony, a slab 0.45 m out (ASSUMED)
  // windows: the facade's rows in pairs while the tower is part of it, then single lancets; faces turned toward the hotel are bare below the eaves
  for (const f of faces) {
    const inside = pointInPolygon([f.at[0] + f.normal[0], f.at[1] + f.normal[1]], plan.outline);
    for (const [y, wh] of ROWS) if (!inside) addTwin(parts, f, y, 2.4, wh);
    for (const y of [22, 31.5]) if (y + 3.6 < sT - 1.5) addFramedWindow(parts, f, y, 1.3, 3.6, 'pointed', 0.22);
  }
  // the entrance: a pointed portal in the front face (the grand entrance is at the foot of the west tower [HE-STP]); its surround stops short of the ground, off the OSM outline
  addFramedWindow(parts, faces[0] as Placed, 0.5, 3.8, 4.9, 'pointed', 0.3);
  // the belfry: a pair of pointed arches, each over two lancets and a shaft, on each face (the west tower: three round ones)
  for (const f of faces) {
    if (clockTower) for (const dx of [-1.8, 1.8]) addTwin(parts, shift(f, dx), sT + 0.9, 2.5, bT - sT - 2.4); // hist-c: two tall groups from the balcony to the corbels, their lancets about 4.3 m; sizes ASSUMED
    else for (const dx of [-2.6, 0, 2.6]) addFramedWindow(parts, shift(f, dx, 0.05), sT + 1.0, 1.5, bT - sT - 3.0, 'round', 0.18);
  }
  // the corbel table: three steps, each a little farther out
  for (let k = 0; k < 3; k++) addBand(stone, ring(h), bT + 0.6 * k, 0.6, 0.25 + 0.2 * k);
  // and under it a row of corbels, as far out as the first step, in front of a dark recess (hist-c: the table is a deep machicolation, dense with corbels); their size and spacing are ASSUMED
  const nc = Math.round((2 * h) / 0.9);
  addBand(part(parts, 'pane'), ring(h), bT - 0.9, 0.9, 0.04);
  for (const f of faces) {
    for (let k = 0; k < nc; k++) stone.box(onWall(f, ((k + 0.5) * 2 * h) / nc - h, bT - 0.45, 0.05), [0.5, 0.9, 0.4], { rotY: yaw(f.dir), skip: ['+y'] });
  }
  // the clock stage
  const grow = 0.5;
  addWalls(brick, sq(h + grow), tT, wH);
  const stage = facesAt(h + grow);
  // hist-c, hist-b: a hip over the clock stage down to the gables, then a steep slate pyramid (about 73 deg) between the turrets, a lantern, a needle; sizes ASSUMED
  const P = h + grow;
  const [rb, g, lant] = [3.3, 4.3, 1.7]; // the steep roof's base (a little over half the stage's width), the gables' height, half the lantern's side
  const top = clockTower ? rT : lT;
  const roofSlope = g / (P - rb);
  if (clockTower) {
    const cy = (tT + wH) / 2;
    for (const f of stage) {
      // the dial in a ring of stone (hist-c: a gilt ring and a cream dial 4.2 m across, ASSUMED from the tower's width)
      const q = (x: number, y: number): V3 => onWall(f, x, y, 0.14);
      const face: V3 = [f.normal[0], 0, f.normal[1]];
      const half = 2.1;
      addDisc(stone, f, 0, cy, 2.5, 0.1, 24); // the stone ring round the dial
      // u runs left to right as a viewer outside sees it; dir points to the viewer's left on the front and back faces and to the right on the sides
      const left = f.dir[0] * f.normal[1] - f.dir[1] * f.normal[0] < 0 ? half : -half;
      part(parts, 'clock').quadUV(q(left, cy - half), q(-left, cy - half), q(-left, cy + half), q(left, cy + half), [[0, 0], [1, 0], [1, 1], [0, 1]], face);
      // the gable over the dial, brick with a stone border and a rosette in it, its sides running back into the roof
      const gw = h - 1.0;
      addGable(parts, [f.at[0], wH, f.at[1]], f.dir, f.normal, roofSlope, gw, g, 0, 'brickRed');
      addDisc(stone, f, 0, wH + 1.9, 0.45, 0.12);
    }
  }
  // the turrets stand on the corners of the clock stage
  for (const c of sq(h + grow - 0.75)) addTurret(parts, c, t.along, t.out, wH, 0.65, 3.0, 3.6);
  // the roof; the clock tower's open lantern (dark lights between mullions, a pinnacle on each corner) and then the needle and its rod
  addRoof(slate, sq(P), sq(rb), wH, wH + g, false, [P - rb, P - rb, P - rb, P - rb]);
  addRoof(slate, sq(rb), sq(lant), wH + g, top, false, [rb - lant, rb - lant, rb - lant, rb - lant]);
  if (clockTower) {
    addWalls(part(parts, 'pane'), sq(lant - 0.12), rT + 0.4, lT - 0.4);
    for (const f of facesAt(lant)) for (const dx of [-0.55, 0.55]) stone.box(onWall(f, dx, (rT + lT) / 2), [0.2, lT - rT - 0.8, 0.2], { rotY: yaw(f.dir), skip: ['-y', '+y'] });
    addBand(stone, ring(lant), rT, 0.4, 0.1);
    addBand(stone, ring(lant), lT - 0.4, 0.4, 0.2);
    for (const c of sq(lant)) addSpike(stone, c, t.along, t.out, 0.22, rT, lT + 0.9);
    // hist-b, hist-c: a lucarne on each face of the spire, a stone gablet 1.2 m wide and 2.6 m to its apex over a pointed light, its foot 0.9 m up the slope; sizes ASSUMED
    const yb = wH + g + 0.9;
    const slope = (rT - wH - g) / (rb - lant);
    for (const f of facesAt(rb - (yb - wH - g) / slope)) {
      addGable(parts, [f.at[0], yb, f.at[1]], f.dir, f.normal, slope, 0.6, 2.6, 1.5, 'stone');
      addFramedWindow(parts, f, yb + 0.25, 0.7, 1.5, 'pointed', 0.1);
    }
  }
  addSpike(slate, t.centre, t.along, t.out, lant - 0.3, lT, H - 1.8);
  addSpike(slate, t.centre, t.along, t.out, 0.08, H - 1.8, H);
}

/** `pavilions`: which front bays stand out as gabled bays (they have no dormers of their own; the dormer tests pass none, to test the dormers on every bay). */
export function midlandGeometry(plan: MidlandPlan, pavilions: readonly number[] = PAVILIONS): PartMap<Key> {
  const parts: PartMap<Key> = {};
  const stone = part(parts, 'stone');
  const slate = part(parts, 'slate');
  const edges = polygonEdges(plan.outline);
  addWalls(part(parts, 'brickRed'), plan.outline, 0, plan.eaves);
  // the towers stand in front of the wall: stop the bands and windows where they stand
  const cutters = plan.towers.map((t) => towerSquare(t, 0.45));
  const segs = segmentsOutside(edges, cutters);
  const frame: RoofFrame = { plan, edges, rise: plan.ridge - plan.eaves };
  const pairs = pavilions.flatMap((i) => (plan.front.bays[i] && plan.front.bays[i + 1]?.edge === plan.front.bays[i]?.edge ? [[plan.front.bays[i], plan.front.bays[i + 1]] as [BayPosition, BayPosition]] : []));
  const pavs = pairs.flat();
  const feet = pairs.map(([a, b]) => addPavilion(parts, { ...a, at: [(a.at[0] + b.at[0]) / 2, (a.at[1] + b.at[1]) / 2], width: a.width + b.width }, plan.eaves, frame.rise / (plan.roof.runs[a.edge] as number)));
  for (const [y, h] of [[0, 0.9], [6, 0.35], [11.5, 0.35], [17, 0.35]] as const) addBand(stone, segs, y, h, 0.12); // a stone base under the ground storey [hist-b], then the first three string courses
  addBand(stone, segs, plan.eaves - 1.0, 1.0, 0.6); // the cornice
  addBand(stone, segmentsOutside(edges, [...cutters, ...feet]), plan.eaves, 0.9, 0.35); // the parapet in front of the gutter: not where a gabled bay's cheeks start
  addRoof(slate, plan.outline, plan.roof.ring, plan.eaves, plan.ridge, true, plan.roof.runs);

  // windows: four storeys, round-headed at the bottom and pairs of pointed lancets above; the front and the curved wing in bays, the rest evenly
  const rows = [{ y: 1.0, h: 3.9, head: 'round' as Head }, ...ROWS.map(([y, h]) => ({ y, h, head: 'pointed' as Head }))];
  // hist-b: a continuous stone sill course under each upper row, below the groups' own sills; the first floor's is its balcony, standing 0.4 m out; sizes ASSUMED
  rows.slice(1).forEach((row, i) => addBand(stone, segs, row.y - 0.45, 0.25, i ? 0.14 : 0.4));
  const covered = (p: Pt): boolean => cutters.some((q) => pointInQuad(p, q));
  const dress = (bays: readonly BayPosition[], rich: boolean): void => {
    for (const bay of bays) {
      if (covered(bay.at)) continue;
      const w = Math.max(1.0, Math.min(1.7, bay.width * 0.32));
      // a gabled bay's upper lights stand out with its front, and its arch is the entrance (hist-b): wider and taller, its sill off the ground like the portal's
      const out = pavs.includes(bay) ? PAVILION_OUT : 0;
      const up = shift(bay, 0, out);
      for (const row of rows) {
        if (rich && row.head === 'pointed') addTwin(parts, up, row.y, Math.max(1.6, Math.min(2.5, bay.width * 0.46)), row.h);
        else if (row.head === 'round') addArch(parts, up, out ? 0.5 : row.y, out ? 2.4 : w, out ? 4.2 : row.h);
        else addFramedWindow(parts, up, row.y, w, row.h, row.head, 0.22);
      }
    }
  };
  dress(plan.front.bays, true);
  dress(plan.wing.bays, true);
  const dressed = new Set<number>([...plan.front.edges, ...plan.wing.edges].map((e) => e.i));
  for (const e of edges) {
    if (dressed.has(e.i) || e.length < 6) continue;
    const n = Math.max(1, Math.round(e.length / 5.2));
    const bays: BayPosition[] = [];
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      bays.push({ edge: e.i, at: [e.a[0] + e.dir[0] * e.length * t, e.a[1] + e.dir[1] * e.length * t], dir: e.dir, normal: e.normal, width: e.length / n });
    }
    dress(bays, false);
  }

  // HE 1342037 (https://historicengland.org.uk/listing/the-list/list-entry/1342037): two roof storeys with gabled dormers; hist-b, hist-c, hist-e show slate gables
  // with pale borders and lights, a storey tall in a lower row above the cornice and a smaller upper row set back; roof photograph:
  // https://www.blackheath.org/events/2026/3/26/walk-amp-talk-st-pancras-and-somerstown. ASSUMED: one of each row to a bay (the upper over two bays in
  // three), sizes and places; on the bay's own facet, never inside a tower's envelope; a gabled bay is its own lower row.
  [...plan.front.bays, ...plan.wing.bays].forEach((bay, n) => {
    const i = bay.edge;
    const e = edges[i] as Edge;
    const run = plan.roof.runs[i] as number;
    const slope = frame.rise / run;
    const s0 = (bay.at[0] - e.a[0]) * e.dir[0] + (bay.at[1] - e.a[1]) * e.dir[1];
    for (const f of [0.08, 0.62]) {
      const lower = f < 0.3;
      if (pavs.includes(bay) ? lower : !lower && n % 3 === 2) continue;
      const h = lower ? 5 : 3.6;
      const d = run * f;
      const back = h / slope;
      if (d + back > run - 0.15) continue; // its back must stop short of the crown
      // as wide as asked, or as the facet between its hips allows, or as keeps it wholly in its own bay when slid along the facet past a hip
      const [from, to] = facetSpan(frame, i, d, d + back);
      const half = bay.width / 2;
      const ww = Math.min(Math.min(1.7, bay.width * 0.3) * (lower ? 1 : 0.75), (to - from) / 2 - 0.15, (half - s0 + to - 0.16) / 2, (half + s0 - from - 0.16) / 2);
      if (ww < 0.5) continue;
      const s = Math.min(Math.max(s0, from + 0.15 + ww), to - 0.15 - ww);
      if (Math.abs(s - s0) + ww > bay.width / 2) continue;
      const mid = onRoof(frame, i, s, d);
      // inflate by the full reach of the dormer, not just its centre: no edge can cross a tower
      if (plan.towers.some((t) => pointInQuad([mid[0], mid[2]], towerSquare(t, Math.hypot(ww, back) + 0.45)))) continue;
      const hs = h * 0.58;
      addGable(parts, mid, e.dir, e.normal, slope, ww, h, hs, 'slate');
      addFramedWindow(parts, { at: [mid[0] + e.normal[0] * 0.05, mid[2] + e.normal[1] * 0.05], dir: e.dir, normal: e.normal }, mid[1] + 0.2, ww * 0.95, hs * 0.8, 'pointed', 0.1);
      addSpike(stone, [mid[0] + e.normal[0] * 0.05, mid[2] + e.normal[1] * 0.05], e.dir, e.normal, 0.14, mid[1] + h + 0.1, mid[1] + h + 0.8);
    }
  });
  // hist-b, hist-c, hist-e: clusters of three big corbelled brick stacks along the crown, 8.4 m tall, rising well above the cresting (the scorer: about twice the round-3 height);
  // a cluster only where all three stand wholly on the crown, clear of the towers. Sizes and spacing ASSUMED.
  for (const e of edges) {
    const ra = plan.roof.ring[e.i] as Pt;
    const rb = plan.roof.ring[(e.i + 1) % plan.outline.length] as Pt;
    const l = Math.hypot(rb[0] - ra[0], rb[1] - ra[1]);
    if (l < 8) continue;
    const n = Math.max(1, Math.round(l / 11));
    for (let k = 0; k < n; k++) {
      const cluster = [-2, 0, 2].map((o): Pt => {
        const s = ((k + 0.5) / n) * l + o;
        return [ra[0] + e.dir[0] * s - e.normal[0] * 1.2, ra[1] + e.dir[1] * s - e.normal[1] * 1.2];
      });
      const stands = (c: Pt): boolean => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]): Pt => [c[0] + e.dir[0] * (a as number) + e.normal[0] * (b as number) * 0.75, c[1] + e.dir[1] * (a as number) + e.normal[1] * (b as number) * 0.75]).every((p) => pointInPolygon(p, plan.roof.ring) && !plan.towers.some((t) => pointInQuad(p, towerSquare(t, 1.6))));
      if (cluster.every(stands)) for (const c of cluster) addStack(parts, c, e.dir, plan.ridge - 0.3, 8.4);
    }
  }
  // hist-b, hist-e: iron cresting along the crown; a plain strip 0.7 m tall stands for its piercing (ASSUMED), cut at the towers
  for (const { a, b } of segmentsOutside(polygonEdges(plan.roof.ring), cutters)) part(parts, 'pane').box([(a[0] + b[0]) / 2, plan.ridge + 0.35, (a[1] + b[1]) / 2], [Math.hypot(b[0] - a[0], b[1] - a[1]), 0.7, 0.1], { rotY: Math.atan2(a[1] - b[1], b[0] - a[0]), skip: ['-y'] });
  for (const t of plan.towers) addTower(parts, t, plan);
  return parts;
}

/** Point in a convex quad (either winding). */
export function pointInQuad(p: Pt, q: readonly Pt[]): boolean {
  let pos = 0;
  let neg = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i] as Pt;
    const b = q[(i + 1) % q.length] as Pt;
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (c > 0) pos++;
    else if (c < 0) neg++;
  }
  return pos === 0 || neg === 0;
}

// ---- the Barlow train shed ---------------------------------------------------------------------

/** a point of the shed's cross-section: across (u), up (y) */
type P2 = [number, number];

/**
 * The Barlow shed [WP-STP] to its 689 ft gable, then the 2007 extension [NSC-EXT] to the end of the OSM outline. Shed: slate on the outer quarters over pale
 * boarding (hist-d), glass on the middle half, a pale steel lattice rib at each of the 24 rib positions and the glazed end screen (hist-d2), brick side walls and
 * south end. Extension: not the arch: a 22 m transition of glass pyramids on plate girders, then saw-tooth bays, pale slopes over dark glazed risers (hist-e).
 * Section sizes and heights are ASSUMED, scaled from those photographs.
 */
export function barlowGeometry(plan: BarlowPlan, steps = 24): PartMap<Key> {
  const parts: PartMap<Key> = {};
  const c = Math.cos(plan.heading);
  const s = Math.sin(plan.heading);
  // frame: u across (east), v along (north); world = origin + u*(c, s) + v*(s, -c)
  const at = (u: number, v: number, y: number): V3 => [plan.origin[0] + u * c + v * s, y, plan.origin[1] + u * s - v * c];
  const dir = (u: number, y: number, v = 0): V3 => [u * c + v * s, y, u * s - v * c]; // the same turn, for a direction
  const F = FIGURES.barlow;
  const L = plan.barlowLength;
  const margin = (plan.width - plan.span) / 2;
  const section = barlowSection(steps, plan.span, plan.rise).map((p) => ({ ...p, x: p.x + margin }));
  const sec = (k: number): (typeof section)[number] => section[k] as (typeof section)[number];
  // metres along the arch from the west foot (for the UVs), and the outward normal of each strip (the section runs west to east)
  const arc: number[] = [0];
  const out: P2[] = [];
  for (let k = 1; k < section.length; k++) {
    const dx = sec(k).x - sec(k - 1).x;
    const dy = sec(k).y - sec(k - 1).y;
    const l = Math.hypot(dx, dy);
    arc.push((arc[k - 1] as number) + l);
    out.push([-dy / l, dx / l]);
  }
  /** node k of the section, `d` metres inside the roof along the mean of its two strips' normals */
  const into = (k: number, d: number): P2 => {
    const a = out[Math.max(k - 1, 0)] as P2;
    const b = out[Math.min(k, steps - 1)] as P2;
    const m = Math.hypot(a[0] + b[0], a[1] + b[1]);
    return [sec(k).x - ((a[0] + b[0]) / m) * d, sec(k).y - ((a[1] + b[1]) / m) * d];
  };
  const slate = part(parts, 'slate');
  const lining = part(parts, 'lining');
  const glass = part(parts, 'roofGlass');
  const rib = part(parts, 'rib');
  const pane = part(parts, 'pane');
  const metal = part(parts, 'metal');
  const brick = part(parts, 'brickRed');
  // a flat piece seen from either side (a plate, a roof slope, a riser): both faces, `n` being one way it faces
  const sheet = (m: Batch, pts: V3[], n: V3): void => {
    for (const k of [1, -1]) m.poly(pts, undefined, { facing: [n[0] * k, n[1] * k, n[2] * k] });
  };

  // ---- the shed: one strip of shell to each segment of the arch, from the south wall to the gable
  const glassFrom = (1 - F.glassFraction) / 2;
  const strip = (m: Batch, k: number, d: number, uv: [V2, V2, V2, V2], f = 1): void => {
    const n = out[k] as P2;
    const e = (i: number, v: number): V3 => at(sec(i).x - n[0] * d, v, Math.max(0, sec(i).y - n[1] * d));
    m.quadUV(e(k, 0), e(k + 1, 0), e(k + 1, L), e(k, L), uv, dir(n[0] * f, n[1] * f));
  };
  for (let k = 0; k < steps; k++) {
    const [a0, a1] = [arc[k] as number, arc[k + 1] as number];
    const across: [V2, V2, V2, V2] = [[a0, 0], [a1, 0], [a1, L], [a0, L]]; // glass panes and boards: u across the strip, v along it
    const along: [V2, V2, V2, V2] = [[0, a0], [0, a1], [L, a1], [L, a0]]; // slate and brick: u along the shed, v up the slope
    const tm = (sec(k).t + sec(k + 1).t) / 2;
    if (tm > glassFrom && tm < 1 - glassFrom) strip(glass, k, 0, across);
    else if (k % (steps - 1) === 0) {
      strip(brick, k, 0, along); // hist-d2, hist-e: the shed's side walls are red brick, outside and in; the springing strip of the arch stands for the wall
      strip(brick, k, 0, along, -1);
    } else {
      strip(slate, k, 0, along);
      strip(lining, k, 0.08, across); // painted boarding just under it: the shared lining is seen from inside only (hist-d)
    }
  }
  // hist-d2: Gothic arcading on the brick side walls, seen from inside between the ribs: two pointed arches to a bay (at 0.27 and 0.73 of it), each a stone surround
  // 3.3 x 6.1 m from 0.85 m up the wall round a dark recess 2.6 x 5.6 m from 1.2 m, standing 0.03 and 0.06 m inside it. Sizes ASSUMED.
  const stone = part(parts, 'stone');
  for (const k of [0, steps - 1]) {
    const [lo, hi] = k ? [sec(steps), sec(steps - 1)] : [sec(0), sec(1)];
    const n = out[k] as P2;
    const l = Math.hypot(hi.x - lo.x, hi.y - lo.y);
    for (let i = 1; i < plan.ribs.length; i++) {
      for (const f of [0.27, 0.73]) {
        const v = (plan.ribs[i - 1] as number) * (1 - f) + (plan.ribs[i] as number) * f;
        for (const [m, w, h, base, d] of [[stone, 3.3, 6.1, 0.85, 0.03], [pane, 2.6, 5.6, 1.2, 0.06]] as const) {
          const o = windowOutline(w, h, 'pointed').slice(0, -1); // its last point repeats the one before
          const pt =([x, y]: [number, number]): V3 => at(lo.x + ((hi.x - lo.x) / l) * (base + y) - n[0] * d, v + x, Math.max(0, lo.y + ((hi.y - lo.y) / l) * (base + y) - n[1] * d));
          m.poly(o.map(pt), o, { facing: dir(-n[0], -n[1]) });
        }
      }
    }
  }
  // the ribs: two chords and an X-braced lattice 2.6 m deep (hist-d, hist-d2: deep girders that read as a dense web over the whole arch); a bar is a ribbon of width w and
  // thickness 2t along the shed, with an underside if a chord. Members ASSUMED, scaled from hist-d2: chords 0.3 x 0.4 m, lattice 0.24 x 0.2 m.
  const bar = (v: number, a: P2, b: P2, w: number, t: number, under = false): void => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n: P2 = [(-(b[1] - a[1]) / l) * (w / 2), ((b[0] - a[0]) / l) * (w / 2)];
    const e = (p: P2, m: number, dv: number): V3 => at(p[0] + m * n[0], v + dv, Math.max(0, p[1] + m * n[1])); // the feet stand on the platform
    for (const m of [-1, 1]) rib.quadUV(e(a, -1, m * t), e(b, -1, m * t), e(b, 1, m * t), e(a, 1, m * t), undefined, dir(0, 0, m));
    if (under) rib.quadUV(e(a, -1, -t), e(b, -1, -t), e(b, -1, t), e(a, -1, t), undefined, dir(-n[0], -n[1]));
  };
  const top = section.map((_, k) => into(k, 0.25));
  const bot = section.map((_, k) => into(k, 2.45));
  const mid = (a: P2, b: P2): P2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (const v of plan.ribs) {
    for (let k = 0; k < steps; k++) {
      const [t0, t1, b0, b1] = [top[k], top[k + 1], bot[k], bot[k + 1]] as P2[];
      bar(v, t0, t1, 0.3, 0.2, true);
      bar(v, b0, b1, 0.3, 0.2, true);
      // the lattice: a vertical at each node and two crossing diagonals (an X) between the chords
      for (const [a, b] of [[t0, mid(b0, b1)], [mid(b0, b1), t1], [b0, mid(t0, t1)], [mid(t0, t1), b1], [t0, b0]] as const) bar(v, a, b, 0.24, 0.1);
    }
    bar(v, top[steps] as P2, bot[steps] as P2, 0.24, 0.1);
  }
  // a purlin under the roof at every node of the arch, along the whole shed: the lines that run away down the vault in hist-d
  for (let k = 0; k <= steps; k++) {
    const p = into(k, 0.14);
    rib.box(at(p[0], L / 2, Math.max(0.08, p[1])), [0.2, 0.16, L], { rotY: -plan.heading, skip: ['+y', '+z', '-z'] });
  }
  // the end screen: glazing in a white iron grid from the transition roof's foot up to the arch; panes about 3.6 m (hist-d2: about 14 across), so the shared glazing is stretched 4x along, 2x up
  const gable: P2[] = [];
  for (let k = 0; k <= steps; k++) {
    const p = sec(k);
    const q = sec(Math.min(k + 1, steps));
    if (p.y >= F.screenFoot) gable.push([p.x, p.y]);
    if ((p.y < F.screenFoot) !== (q.y < F.screenFoot)) gable.push([p.x + ((F.screenFoot - p.y) / (q.y - p.y)) * (q.x - p.x), F.screenFoot]);
  }
  glass.fan(gable.map((p) => at(p[0], L, p[1])), dir(0, 0, 1), (p) => [((p[0] - plan.origin[0]) * c + (p[2] - plan.origin[1]) * s) / 4, p[1] / 2]);
  // hist-d2: a strong grid of white iron in the screen, a mullion at the middle and every 3.6 m (a pane) either side up to the arch and a transom at each pane's height, bars
  // 0.3 m wide standing a hand's breadth inside the glass (ASSUMED sizes)
  const archY = (u: number): number => {
    let k = 0;
    while (k < steps - 1 && sec(k + 1).x < u) k++;
    return sec(k).y + ((u - sec(k).x) / (sec(k + 1).x - sec(k).x)) * (sec(k + 1).y - sec(k).y);
  };
  const archX = (y: number): number => {
    let k = 0;
    while (sec(k + 1).y <= y) k++;
    return sec(k).x + ((y - sec(k).y) / (sec(k + 1).y - sec(k).y)) * (sec(k + 1).x - sec(k).x);
  };
  const mid2 = margin + plan.span / 2;
  for (let j = -9; j <= 9; j++) {
    const u = mid2 + 3.6 * j;
    const head = Math.min(archY(u - 0.15), archY(u + 0.15)) - 0.1; // both corners of its head stay inside the arch
    if (head > F.screenFoot + 1) bar(L - 0.15, [u, F.screenFoot], [u, head], 0.3, 0.05);
  }
  for (let y = F.screenFoot + 3.6; y < plan.rise - 1; y += 3.6) bar(L - 0.15, [archX(y + 0.15) + 0.1, y], [2 * mid2 - archX(y + 0.15) - 0.1, y], 0.3, 0.05);

  // ---- the extension [NSC-EXT], wall to wall like the shed: no ribs, no arch
  const W = plan.width;
  const y0 = F.screenFoot; // the top of the transition's plate girders, where it meets the screen
  const lo = y0 - F.girder; // ASSUMED: the saw-tooth's low edge is level with the girders' underside
  const vT = L + F.transition;
  const [cu, cv] = [W / 12, F.transition / 4]; // the transition: pyramids of glass 6.2 x 5.5 m on a grillage of girders
  for (let j = 0; j <= 4; j++) sheet(metal, [at(0, L + j * cv, lo), at(W, L + j * cv, lo), at(W, L + j * cv, y0), at(0, L + j * cv, y0)], dir(0, 0, 1));
  for (let i = 0; i <= 12; i++) sheet(metal, [at(i * cu, L, lo), at(i * cu, vT, lo), at(i * cu, vT, y0), at(i * cu, L, y0)], dir(1, 0));
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 4; j++) {
      const apex = at((i + 0.5) * cu, L + (j + 0.5) * cv, y0 + F.pyramid);
      const base = [at(i * cu, L + j * cv, y0), at((i + 1) * cu, L + j * cv, y0), at((i + 1) * cu, L + (j + 1) * cv, y0), at(i * cu, L + (j + 1) * cv, y0)];
      base.forEach((p, n) => glass.tri(p, base[(n + 1) % 4] as V3, apex, [[0, 0], [cu, 0], [cu / 2, cv]], UP));
    }
  }
  // the main roof: 14 teeth, each climbing a truss depth to the north, where a dark glazed riser drops back; a fascia closes each side
  const tooth = plan.bay / F.teeth;
  for (let i = 0; i < F.bays * F.teeth; i++) {
    const [v0, v1, hi] = [vT + i * tooth, vT + (i + 1) * tooth, lo + F.truss];
    sheet(metal, [at(0, v0, lo), at(W, v0, lo), at(W, v1, hi), at(0, v1, hi)], UP);
    sheet(pane, [at(0, v1, hi), at(W, v1, hi), at(W, v1, lo), at(0, v1, lo)], dir(0, 0, 1));
    for (const u of [0, W]) sheet(metal, [at(u, v0, lo - 1.2), at(u, v1, lo - 1.2), at(u, v1, hi), at(u, v0, lo)], dir(1, 0));
  }
  // the south wall: the shed's end, brick, behind the hotel; u across the wall from its west foot, v up
  const wall = section.map((p): V3 => at(p.x, 0.15, p.y)); // the arch, foot to foot
  const foot0 = wall[0] as V3;
  const south: V3 = [-s, 0, c]; // facing south, away from the shed
  const centre = at(plan.width / 2, 0.15, 0);
  brick.fan([centre, ...wall], south, (p) => [(p[0] - foot0[0]) * c + (p[2] - foot0[2]) * s, p[1]]);
  // hist-e: a row of tall brick stacks stands along the Pancras Road (east) wall's top, about every 14 m; the spacing and 3.6 m height are ASSUMED from it.
  // Wholly outside the shell: 0.7 m out clears the wall, which is 0.2 m out at the foot.
  const eave = sec(steps - 1);
  for (let i = 0, n = Math.round(L / 14); i < n; i++) {
    const p = at(eave.x + 0.7, ((i + 0.5) * L) / n, 0);
    addStack(parts, [p[0], p[2]], [s, -c], eave.y - 0.5, 3.6);
  }
  return parts;
}

// ---- standing on the ground --------------------------------------------------------------------

/** How many vertices each part of a structure holds at this moment: where `liftParts` starts from, to raise only what was added since. */
export function partMarks<K extends string>(parts: PartMap<K>): Partial<Record<K, number>> {
  const marks: Partial<Record<K, number>> = {};
  for (const k of Object.keys(parts) as K[]) marks[k] = parts[k]?.positions.length ?? 0;
  return marks;
}

/** Raise a structure by `dy` metres: the y of every vertex its parts hold (past `from`, if given), and nothing else (normals and UVs stay as built). A shift of nothing leaves it byte for byte as built. */
export function liftParts<K extends string>(parts: PartMap<K>, dy: number, from: Partial<Record<K, number>> = {}): void {
  if (dy === 0) return;
  for (const k of Object.keys(parts) as K[]) {
    const p = parts[k]?.positions;
    if (!p) continue;
    for (let i = (from[k] ?? 0) + 1; i < p.length; i += 3) p[i] = (p[i] as number) + dy;
  }
}

/** The parts of the three buildings, built on y = 0; with `seats` each is raised to its own (`landmarkSeats`), so its lowest wall vertex is on the lowest ground under it. */
export function landmarkGeometry(plans: LandmarkPlans, seats?: Readonly<Record<LandmarkName, Seat>>): PartMap<Key>[] {
  const built: Record<LandmarkName, PartMap<Key>> = { hotel: hotelGeometry(plans.hotel), midland: midlandGeometry(plans.midland), barlow: barlowGeometry(plans.barlow) };
  if (seats) for (const name of Object.keys(built) as LandmarkName[]) liftParts(built[name], seats[name].y);
  return [built.hotel, built.midland, built.barlow];
}

// ---- assembly ----------------------------------------------------------------------------------

export interface Landmarks {
  group: THREE.Group;
  /** OSM building ids replaced: pass to buildingPrisms() as the exclusion set */
  excludeIds: readonly number[];
  stats: { meshes: number; triangles: number; materials: number };
  /** where each building stands on the terrain; only when a `terrain` was given */
  seats?: Record<LandmarkName, Seat>;
  dispose(): void;
}

export interface LandmarkOptions {
  /** the ground (core/terrain.ts): each building stands with its base at the lowest ground under its footprint; without it they stand on y = 0 */
  terrain?: Terrain;
}

/** Add the landmark buildings to the scene; pass `landmarks.excludeIds` to buildingPrisms() so the generic OSM boxes are not drawn too. With `opts.terrain` they are seated on it. */
export function addLandmarks(scene: THREE.Scene, data: KxData, opts: LandmarkOptions = {}): Landmarks {
  const set = createMaterials();
  const plans = landmarkPlans(data);
  const seats = opts.terrain ? landmarkSeats(plans, opts.terrain) : undefined;
  const { group, triangles } = mergeParts<Key>(landmarkGeometry(plans, seats), set.table, 'landmarks', { roofGlass: 2 });
  scene.add(group);
  const geometries: THREE.BufferGeometry[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) geometries.push(o.geometry);
  });
  return {
    group,
    excludeIds: LANDMARK_OSM_IDS,
    stats: { meshes: group.children.length, triangles, materials: Object.keys(set.table).length },
    ...(seats ? { seats } : {}),
    dispose(): void {
      scene.remove(group);
      for (const g of geometries) g.dispose();
      for (const o of set.owned) o.dispose();
    },
  };
}
