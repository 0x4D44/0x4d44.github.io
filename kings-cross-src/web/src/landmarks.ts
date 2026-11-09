// The buildings around King's Cross, drawn from the numbers in core/landmarks.ts: the Great Northern
// Hotel's crescent, the St Pancras Renaissance (Midland Grand) Hotel with its two towers, and the
// Barlow train shed beside it. Everything is procedural: geometry is built in code, the textures are
// the shared ones in materials.ts (drawn into a canvas at runtime; no image assets, nothing to license).
//
// All geometry is built in world coordinates (x east, y up, z south), so nothing here is turned or
// moved after the fact, but for one thing: given the terrain, each building is built standing on y = 0 and
// then raised as a whole (`liftParts`) onto its seat, the lowest ground under its footprint
// (core/landmarks.ts `landmarkSeats`). UVs are in METRES, which is what materials.ts asks for (it sets the
// texture repeat to 1 / tile), so brick comes out brick-sized on any wall at any angle.
//
// The geometry builders (`hotelGeometry`, `midlandGeometry`, `barlowGeometry`) need no DOM and are
// tested in web/tests/landmarks.test.ts; only `createMaterials` and `addLandmarks` touch materials.
//
// Wiring (main.ts):
//   const landmarks = addLandmarks(scene, data, { terrain });          // once, after the scene exists (`terrain` is optional)
//   const hidden = new Set([...buildingsUnderStation(...), ...LANDMARK_OSM_IDS]);  // before buildingPrisms(data, hidden)
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { barlowSection, FIGURES, landmarkPlans, landmarkSeats, pointInPolygon, polygonEdges, REPLACED_BUILDING_IDS, towerSquare } from '../../core/landmarks.ts';
import type { BarlowPlan, BayPosition, Edge, HotelPlan, LandmarkName, LandmarkPlans, MidlandPlan, Seat, TowerPlan } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import type { Terrain } from '../../core/terrain.ts';
import { mergeParts, material, part, TEXTURES } from './materials.ts';
import type { Batch, PartMap, V2, V3 } from './materials.ts';

export { towerSquare };

/** The OSM building ids this module replaces: leave them out of buildingPrisms(). */
export const LANDMARK_OSM_IDS: readonly number[] = REPLACED_BUILDING_IDS;

// ---- the mesh builder --------------------------------------------------------------------------
// Every wall, roof and band below goes into a `Batch` from materials.ts (the one mesh builder of the
// station modules), one per material per building (`part`), merged across buildings by `mergeParts`.

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
  // The only material of its own is the clock face: a canvas picture of a dial, drawn here (nothing else uses it). hist-c shows a
  // gilt ring round a cream dial with black Roman numerals, a gilt rosette in the middle and black hands; the colours are ASSUMED from it.
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
    g.lineWidth = 2;
    for (let i = 0; i < 60; i++) {
      const a = (i * Math.PI) / 30;
      g.beginPath();
      g.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100);
      g.lineTo(128 + Math.sin(a) * 105, 128 - Math.cos(a) * 105);
      g.stroke();
    }
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
  // the extension's roof panels (hist-e): light grey, mid-tone against the white-painted frame; the shade is ASSUMED, the emissive lifts the undersides
  const metal = own(new THREE.MeshLambertMaterial({ color: 0xa9b0b7, emissive: 0x30353a }));
  // hist-b: the Midland's brick is a light terracotta red (sunlit about 0xbd8263), not the library's deep crimson (about 0x8e3c2c): the shared
  // brick texture times (1.1, 0.55, 0.78) comes to about 0xa8684f. The shade is ASSUMED.
  const brickRed = own((material('brickRed') as THREE.MeshLambertMaterial).clone());
  brickRed.color.setRGB(1.1, 0.55, 0.78);
  // hist-a, hist-b: the dressings are creamier and paler than the library's grey ashlar (about 0xdcd3be in daylight against its 0xc8c0aa): times (1.25, 1.2, 1.1); ASSUMED
  const stone = own((material('stone') as THREE.MeshLambertMaterial).clone());
  stone.color.setRGB(1.25, 1.2, 1.1);
  return {
    table: {
      brick: material('brick'),
      brickRed,
      stone,
      slate: material('slateBothSides'),
      sash: material('sash'),
      sashArch: material('sashArch'),
      pane: material('pane'),
      roofGlass: material('shedGlass'), // the Barlow shed's milky glazing, bright from inside (hist-d); the key keeps its name for the render order
      rib: material('ribPaint'), // the restored shed's pale ironwork (hist-d)
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
 * A sloped roof from the eaves outline (at y0) up to a ring (at y1), and a flat cap on the ring. u runs
 * along the eaves and v up the slope, in metres. A ring of one repeated point makes a pyramid (no cap).
 * With `runs` (the horizontal run of each facet, for a roof whose ring edges are parallel to its eaves edges: every facet a flat trapezoid)
 * the UVs unfold each facet true to scale, so the slates keep their courses and a brick or stone frustum is not stretched; without, v is the
 * length of the line from each eaves corner to its ring corner. A facet whose ring corners meet is a triangle.
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

/**
 * The parts of the polygon's edges that lie outside every `cutter` (convex quads: tower footprints),
 * as segments. Bands (string courses, cornices) are cut where a tower stands in front of the wall, so
 * they do not poke through the tower's face.
 */
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

/** A band (string course or cornice) standing `out` metres proud of the wall, `h` tall, from y. Stone UVs in metres. */
export function addBand(m: Batch, segs: readonly Seg[], y: number, h: number, out: number): void {
  for (const sg of segs) {
    const l = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]);
    const n3: V3 = [sg.normal[0], 0, sg.normal[1]];
    const ao: V3 = [sg.a[0] + sg.normal[0] * out, y, sg.a[1] + sg.normal[1] * out];
    const bo: V3 = [sg.b[0] + sg.normal[0] * out, y, sg.b[1] + sg.normal[1] * out];
    const up = (v: V3, dy: number): V3 => [v[0], v[1] + dy, v[2]];
    const s0 = sg.s0;
    const s1 = sg.s0 + l;
    m.quadUV(ao, bo, up(bo, h), up(ao, h), [[s0, y], [s1, y], [s1, y + h], [s0, y + h]], n3);
    m.quadUV(up(ao, h), up(bo, h), [sg.b[0], y + h, sg.b[1]], [sg.a[0], y + h, sg.a[1]], [[s0, 0], [s1, 0], [s1, out], [s0, out]], UP);
    m.quadUV([sg.a[0], y, sg.a[1]], [sg.b[0], y, sg.b[1]], bo, ao, [[s0, 0], [s1, 0], [s1, out], [s0, out]], [0, -1, 0]);
  }
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

/** A flat window shape stood `lift` metres off the wall at `at` (bottom centre), facing `normal`; `textured` gives it stone UVs in metres. */
export function addWindow(m: Batch, p: Placed, y: number, w: number, h: number, head: Head, lift: number, textured = false): void {
  const pts = windowOutline(w, h, head).map(([x, yy]): V3 => [p.at[0] + p.dir[0] * x + p.normal[0] * lift, y + yy, p.at[1] + p.dir[1] * x + p.normal[1] * lift]);
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
  const q = (x: number, yy: number): V3 => [p.at[0] + p.dir[0] * x + p.normal[0] * lift, y + yy, p.at[1] + p.dir[1] * x + p.normal[1] * lift];
  part(parts, key).quadUV(q(-hw, 0), q(hw, 0), q(hw, h), q(-hw, h), [[0, 0], [tw, 0], [tw, th], [0, th]], [p.normal[0], 0, p.normal[1]]);
}

// ---- the Great Northern Hotel ------------------------------------------------------------------

const CORNICE_HEIGHT = 0.7; // ASSUMED
const CORNICE_OUT = 0.8; // hist-a: the modillion cornice stands well out from the wall; the depth is ASSUMED
const SASH_HEIGHT = 2.4; // ASSUMED
const ADVANCE = 0.4; // [HE-GNH] the sixth and thirteenth bays are "slightly advanced": hist-a shows each on a stucco box about this far out (ASSUMED)
const ADVANCED = [5, 12]; // their places along the main front, counting from 0

// [HE-GNH](https://historicengland.org.uk/listing/the-list/list-entry/1113244?section=official-list-entry):
// "Slate roof with pedimented dormers." All dimensions and the one-per-bay count below are ASSUMED;
// locations follow the OSM-derived facade bays and the matching eaves/ridge ring.
const GNH_DORMER_INSET = 0.34; // ASSUMED fraction up the roof slope
const GNH_DORMER_REAR_INSET = 0.68; // ASSUMED dormer roof run
const GNH_DORMER_WIDTH = 1.8; // ASSUMED maximum width
const GNH_DORMER_WALL_HEIGHT = 1.35; // ASSUMED
const GNH_DORMER_PEDIMENT_RISE = 0.65; // ASSUMED
const GNH_DORMER_WINDOW_SILL = 0.18; // ASSUMED
const GNH_DORMER_WINDOW_WIDTH = 1.05; // ASSUMED
const GNH_DORMER_WINDOW_HEIGHT = 1.15; // ASSUMED
const GNH_DORMER_REAR_CLEARANCE = 0.04; // ASSUMED: the slate cheeks meet the main roof

// [HE-GNH](https://historicengland.org.uk/listing/the-list/list-entry/1113244?section=official-list-entry)
// also records "Prominent slab chimney-stacks." hist-a shows them in the hotel's own brick, with a pale slab cap, eight or nine along the
// front slope, each about a dormer wide. Count and dimensions are ASSUMED: eight on each long roof slope, spread over its middle,
// selected by bay index and projected onto the OSM roof ring.
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
  addWalls(part(parts, 'brick'), plan.outline, 0, plan.eaves);
  const segs = segmentsOutside(polygonEdges(plan.outline), []);
  addBand(stone, segs, plan.groundStorey - 0.12, 0.28, 0.1); // string course over the ground floor
  addBand(stone, segs, plan.eaves - CORNICE_HEIGHT, CORNICE_HEIGHT, CORNICE_OUT); // modillion cornice [HE-GNH]
  for (let s = 2; s < plan.storeys; s++) addBand(stone, segs, plan.groundStorey + (s - 1) * plan.upperStorey + 0.2, 0.3, 0.1); // hist-a: a stucco sill course under each upper row (the first has the ground floor's); sizes ASSUMED
  addRoof(part(parts, 'slate'), plan.outline, plan.roof.ring, plan.eaves, plan.ridge);
  addHotelRoofDetails(parts, plan);

  const f = FIGURES.gnh;
  const [tw] = TEXTURES.window.tile;
  const [aw, ah] = TEXTURES.windowArch.tile;
  const crown = 0.75 + ah;
  const bays = plan.faces.flatMap(face => face.bays);
  const openings = bays.map(({ at, dir, normal }) => [-aw / 2, aw / 2, aw / 2, -aw / 2].map((x, i) => [at[0] + dir[0] * x + normal[0] * (i < 2 ? -1 : 1), at[1] + dir[1] * x + normal[1] * (i < 2 ? -1 : 1)] as Pt));
  addBand(stone, segmentsOutside(polygonEdges(plan.outline), openings), 0.75 + ah - aw / 2 - 0.08, 0.16, 0.14); // [HE-GNH] continuous imposts; profile is ASSUMED
  for (const face of plan.faces) {
    face.bays.forEach((bay, index) => {
      stone.box([bay.at[0] + bay.normal[0] * 0.2, crown + 0.1, bay.at[1] + bay.normal[1] * 0.2], [0.5, 0.45, 0.12], { rotY: Math.atan2(-bay.dir[1], bay.dir[0]) }); // [HE-GNH] keystone dimensions are ASSUMED
      // ground floor: round-headed openings [HE-GNH]
      addSash(parts, 'sashArch', bay, 0.75, aw, ah);
      // the sixth and thirteenth bays of the main front are tripartite and advanced [HE-GNH]: three narrow lights on a stucco box as wide as the bay (hist-a), from the first floor to the cornice
      const advanced = face.kind === 'main' && ADVANCED.includes(index);
      if (advanced) stone.box([bay.at[0] + (bay.normal[0] * (ADVANCE - 0.15)) / 2, (plan.groundStorey + plan.eaves - CORNICE_HEIGHT) / 2, bay.at[1] + (bay.normal[1] * (ADVANCE - 0.15)) / 2], [bay.width, plan.eaves - CORNICE_HEIGHT - plan.groundStorey, ADVANCE + 0.15], { rotY: Math.atan2(-bay.dir[1], bay.dir[0]), skip: ['+y'] });
      // hist-a: full-height stucco strips, 0.14 m proud, up the outer side of a face's end bays and both sides of an advanced bay, as wide as the lights beside them leave room for (up to 1 m; ASSUMED)
      for (const k of [-1, 1]) {
        const next = face.bays[index + k];
        const [s0, s1] = !next ? [Math.max(bay.width / 2 - 1, 0.8), bay.width / 2] : advanced ? [bay.width / 2, Math.min(bay.width / 2 + 1, (bay.width + next.width) / 2 - 0.8)] : [0, 0];
        if (s1 - s0 < 0.3) continue;
        const m = ((s0 + s1) / 2) * k;
        stone.box([bay.at[0] + bay.dir[0] * m + bay.normal[0] * 0.07, (plan.groundStorey + plan.eaves - CORNICE_HEIGHT) / 2, bay.at[1] + bay.dir[1] * m + bay.normal[1] * 0.07], [s1 - s0, plan.eaves - CORNICE_HEIGHT - plan.groundStorey, 0.14], { rotY: Math.atan2(-bay.dir[1], bay.dir[0]), skip: ['+y', '-y', '+z'] });
      }
      for (let s = 1; s < f.storeys; s++) {
        // sashes 2.4 m tall (the shared texture is 2.6 m, squeezed a little) so the top row clears the cornice
        const base = f.groundStorey + (s - 1) * f.upperStorey + 0.5;
        if (advanced) {
          for (const k of [-1, 0, 1]) {
            const at: Pt = [bay.at[0] + bay.dir[0] * k * 0.8, bay.at[1] + bay.dir[1] * k * 0.8];
            addSash(parts, 'sash', { at, dir: bay.dir, normal: bay.normal }, base, 0.75, SASH_HEIGHT, ADVANCE + 0.08);
          }
        } else addSash(parts, 'sash', bay, base, tw, SASH_HEIGHT);
      }
    });
  }
  return parts;
}

// ---- the St Pancras Renaissance (Midland Grand) Hotel ------------------------------------------
// What is not a published figure is drawn from the reference photographs, with its size ASSUMED by scaling from them:
//   hist-b  the Midland Grand from Euston Road, 2012: the front, the clock tower in its setting, the roof and its chimneys
//   hist-c  the clock tower, 2015: its stages, the dial, the gables, the turrets and the spire
//   hist-e  the roof from the air, 2016: the ridge, the dormers, the stacks
// (refs/historic-neighbours/ in the graphical-fidelity reference set).

/** A square ring about `c`: `half` from the middle to each side, its sides along `along` and `out`. */
function squareAbout(c: Pt, along: Pt, out: Pt, half: number): Pt[] {
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => [c[0] + (along[0] * a + out[0] * b) * half, c[1] + (along[1] * a + out[1] * b) * half] as Pt);
}

/**
 * The head of a pointed opening `w` wide, from the right-hand jamb over the apex to the left-hand one: two arcs springing at `spring`,
 * `grow` metres outside the opening (concentric with its own). x is across from the opening's middle, y up from its sill.
 * `round` makes it the semicircle about the middle of the springing (hist-b: the ground storey's arches).
 */
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

/**
 * A ring of voussoirs round a pointed head, stone and red brick in turn (the polychrome arches of hist-b and hist-c), with a thin stone
 * moulding round the outside of it. The two halves are mirror images (each runs stone, brick, stone ... up from its jamb), so the apex is
 * a pale pair of blocks, never a pale one beside a red one. `t` thick, `lift` off the wall.
 */
function addVoussoirs(parts: PartMap<Key>, p: Placed, y: number, w: number, spring: number, t: number, lift: number, steps = 3, round = false): void {
  const rings = [0, t, t + MOULDING].map((g) => headArc(w, spring, g, steps, round));
  const q = ([x, v]: readonly [number, number]): V3 => [p.at[0] + p.dir[0] * x + p.normal[0] * lift, y + v, p.at[1] + p.dir[1] * x + p.normal[1] * lift];
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

/** A flat eight-sided disc of `r` on the wall at (x across, y up) from the placement's middle: a round light. */
function addDisc(m: Batch, p: Placed, x: number, y: number, r: number, lift: number): void {
  const pts = Array.from({ length: 8 }, (_, k): V3 => {
    const a = (k * Math.PI) / 4;
    return [p.at[0] + p.dir[0] * (x + r * Math.cos(a)) + p.normal[0] * lift, y + r * Math.sin(a), p.at[1] + p.dir[1] * (x + r * Math.cos(a)) + p.normal[1] * lift];
  });
  m.fan(pts, [p.normal[0], 0, p.normal[1]], (q) => [(q[0] - p.at[0]) * p.dir[0] + (q[2] - p.at[1]) * p.dir[1], q[1]]);
}

/**
 * A pair of lancets under one pointed relieving arch of polychrome voussoirs, with a stone shaft between them, an oculus above and a sill
 * below: the window group of the Euston Road front (hist-b, hist-c show paired pointed lights under a pointed head in every bay).
 * `W` is the arch's opening, `h` its height; every size here is ASSUMED, scaled from those photographs.
 */
export function addTwin(parts: PartMap<Key>, p: Placed, y: number, W: number, h: number): void {
  const stone = part(parts, 'stone');
  const pane = part(parts, 'pane');
  const t = 0.22;
  const spring = Math.max(0, h - W * Math.sin(Math.PI / 3));
  addWindow(stone, p, y, W, h, 'pointed', 0.05, true);
  const lw = (W - 0.4) / 2;
  for (const s of [-1, 1]) {
    const x = s * (lw / 2 + 0.2);
    addWindow(pane, { at: [p.at[0] + p.dir[0] * x, p.at[1] + p.dir[1] * x], dir: p.dir, normal: p.normal }, y, lw, h - 0.9, 'pointed', 0.1);
  }
  addDisc(pane, p, 0, y + h - 0.45, 0.27, 0.1);
  addVoussoirs(parts, p, y, W, spring, t, 0.05);
  addJambs(parts, p, y, W, spring, t);
  stone.box([p.at[0] + p.normal[0] * 0.2, y - 0.1, p.at[1] + p.normal[1] * 0.2], [W + 0.6, 0.2, 0.5], { rotY: Math.atan2(-p.dir[1], p.dir[0]), skip: ['-y'] });
}

/** The jambs of an arch `W` wide with a ring `t` thick: its courses carried down to the sill (the course under the springing is brick, the next stone, and so on), and its moulding. */
function addJambs(parts: PartMap<Key>, p: Placed, y: number, W: number, spring: number, t: number): void {
  const nb = spring > 0.3 ? Math.max(1, Math.round(spring / 0.65)) : 0;
  const face: V3 = [p.normal[0], 0, p.normal[1]];
  const q = (x: number, v: number): V3 => [p.at[0] + p.dir[0] * x + p.normal[0] * 0.05, y + v, p.at[1] + p.dir[1] * x + p.normal[1] * 0.05];
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

/** A chimney stack on the crown of the roof: a brick shaft, a stone corbel course and cap, a clay pot (hist-b, hist-e: big corbelled brick stacks in a row along the ridge). Sizes ASSUMED, about a dormer wide. */
function addStack(parts: PartMap<Key>, c: Pt, dir: Pt, y: number, h: number): void {
  const rotY = Math.atan2(-dir[1], dir[0]);
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
 * A gabled projection standing on a pitched roof: `base` is the middle of its face where the face meets the roof, `w` is half its width,
 * `h` its height to the apex and `hs` to the shoulders (0 for a plain triangle); the roof rises `slope` metres to the metre going back, so
 * the sides run back h / slope to meet it. The face (stone-bordered) looks out along `normal`. `p` > 0 stands the face that far in front of the
 * roof's foot (a bay out of the wall): the sides then start `p` back and a plain gable's roof planes are quads.
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
 * hist-b, hist-e: a gabled bay (`b` is its middle and whole width: two window bays) standing out of the front and rising through the cornice, as the Euston
 * Road front's pavilions do. ASSUMED, scaled from those photographs: brick from the first string course (on a porch hood of corbels over the entrances; the footprint stays the wall's)
 * up to the eaves, a steep brick gable 9 m above them with a stone border, a twin lancet and a finial, the cornice and string courses carried round its front,
 * the slate cheeks running back to the roof. Returns the plan of the stretch of wall it stands on, which the parapet there gives up.
 */
function addPavilion(parts: PartMap<Key>, b: BayPosition, eaves: number, slope: number): Pt[] {
  const [P, y0, hp, w] = [PAVILION_OUT, 6, 9, pavilionHalf(b)];
  const brick = part(parts, 'brickRed');
  const stone = part(parts, 'stone');
  const at = (u: number, d: number): Pt => [b.at[0] + b.dir[0] * u + b.normal[0] * d, b.at[1] + b.dir[1] * u + b.normal[1] * d];
  const q = (u: number, d: number, y: number): V3 => [at(u, d)[0], y, at(u, d)[1]];
  const rotY = Math.atan2(-b.dir[1], b.dir[0]);
  const wall = (u0: number, u1: number, d0: number, d1: number, hint: V3): void => {
    const l = Math.hypot(u1 - u0, d1 - d0);
    brick.quadUV(q(u0, d0, y0), q(u1, d1, y0), q(u1, d1, eaves), q(u0, d0, eaves), [[0, y0], [l, y0], [l, eaves], [0, eaves]], hint);
  };
  wall(-w, w, P, P, [b.normal[0], 0, b.normal[1]]);
  for (const s of [-1, 1]) wall(s * w, s * w, 0, P, [s * b.dir[0], 0, s * b.dir[1]]);
  stone.box(q(0, (P + 0.4) / 2, y0 - 0.45), [2 * w + 0.4, 0.9, P + 0.4], { rotY, skip: ['+z'] }); // the porch hood over the entrances: corbels out from the first floor
  stone.box(q(0, (P + 0.3) / 2, eaves - 0.5), [2 * w + 0.6, 1, P + 0.3], { rotY, skip: ['+z', '-y'] });
  for (const y of [11.5, 17]) stone.box(q(0, (P + 0.12) / 2, y + 0.175), [2 * w + 0.24, 0.35, P + 0.12], { rotY, skip: ['+z'] });
  addGable(parts, q(0, P, eaves), b.dir, b.normal, slope, w, hp, 0, 'brickRed', P);
  addTwin(parts, { at: at(0, P), dir: b.dir, normal: b.normal }, eaves + 0.8, 2.6, 4.2);
  addSpike(stone, at(0, P), b.dir, b.normal, 0.15, eaves + hp, eaves + hp + 1.4);
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

/** The stretch of facet i, along its eaves from the facet's first corner, that is still the facet at every depth from d0 to d1: the hip lines lean in at a corner that turns away, out at a re-entrant one. */
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
 * Where a tower's stages end, for a tower `H` tall: the shaft (the facade's rows of windows and then lancets), the belfry, the corbel table
 * above it, the wall head where the roof begins, the roof's top where the lantern stands, and the lantern's top; the needle runs on to `H`.
 * ASSUMED: the fractions are scaled from hist-b (the whole tower, the spire a quarter of its height) and hist-c, taking the clock tower as 82 m (82 +/- 4 m).
 */
export function towerStages(H: number): { shaft: number; belfry: number; corbel: number; wall: number; roof: number; lantern: number } {
  const belfry = H * 0.66;
  return { shaft: H * 0.56, belfry, corbel: belfry + 1.8, wall: H * 0.748, roof: H * 0.862, lantern: H * 0.898 };
}

/**
 * A tower on a square plan, by stages (proportions ASSUMED, scaled from hist-c on the 82 m clock tower): a brick shaft with the facade's
 * window rows and then lancets, a belfry of paired arches (the west tower: an arcade), a three-step corbel table, the clock stage (a dial in
 * a stone ring and a brick gable on each face, [HE-STP] "gabled clocks on each face"), four striped turrets at the corners, a steep slate
 * roof, a lantern and a needle. The entrance is a pointed portal at the foot of the front.
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
  const facesAt = (half: number): Placed[] => [
    { at: [t.centre[0] + t.out[0] * half, t.centre[1] + t.out[1] * half], dir: t.along, normal: t.out },
    { at: [t.centre[0] - t.out[0] * half, t.centre[1] - t.out[1] * half], dir: [-t.along[0], -t.along[1]], normal: [-t.out[0], -t.out[1]] },
    { at: [t.centre[0] + t.along[0] * half, t.centre[1] + t.along[1] * half], dir: t.out, normal: t.along },
    { at: [t.centre[0] - t.along[0] * half, t.centre[1] - t.along[1] * half], dir: [-t.out[0], -t.out[1]], normal: [-t.along[0], -t.along[1]] },
  ];
  const sideAt = (f: Placed, dx: number, lift: number): Placed => ({ at: [f.at[0] + f.dir[0] * dx + f.normal[0] * lift, f.at[1] + f.dir[1] * dx + f.normal[1] * lift], dir: f.dir, normal: f.normal });
  const faces = facesAt(h);

  // the shaft and the belfry: brick, string courses at the facade's levels and then every 9 m
  addWalls(brick, sq(h), 0, bT);
  for (const y of [6.0, 11.5, 17.0, 28.0, 37.0, 46.0]) if (y < sT - 1.5) addBand(stone, ring(h), y, 0.4, 0.2);
  addBand(stone, ring(h), sT, 0.5, 0.25);
  // windows: the facade's rows in pairs while the tower is part of it, then single lancets; faces turned toward the hotel are bare below the eaves
  for (const f of faces) {
    const inside = pointInPolygon([f.at[0] + f.normal[0], f.at[1] + f.normal[1]], plan.outline);
    for (const [y, wh] of [[6.9, 3.4], [12.4, 3.4], [17.9, 3.0]] as const) if (!inside) addTwin(parts, f, y, 2.4, wh);
    for (const y of [27, 36, 45]) if (y + 3.6 < sT - 1.5) addFramedWindow(parts, f, y, 1.3, 3.6, 'pointed', 0.22);
  }
  // the entrance: a pointed portal in the front face (the hotel's grand entrance is at the foot of its west tower [HE-STP]); its surround
  // stops short of the ground, so nothing at ground level stands off the OSM outline (the footprint tests hold the feet to it)
  addFramedWindow(parts, faces[0] as Placed, 0.5, 3.8, 4.9, 'pointed', 0.3);
  // the belfry: paired pointed arches (the west tower: three round ones) on each face
  for (const f of faces) {
    if (clockTower) addTwin(parts, f, sT + 1.2, 5.0, bT - sT - 2.7); // hist-c: the belfry's paired arches fill over half the face
    else for (const dx of [-2.6, 0, 2.6]) addFramedWindow(parts, sideAt(f, dx, 0.05), sT + 1.0, 1.5, bT - sT - 3.0, 'round', 0.18);
  }
  // the corbel table: three steps, each a little farther out
  for (let k = 0; k < 3; k++) addBand(stone, ring(h), bT + 0.6 * k, 0.6, 0.25 + 0.2 * k);
  // and under it a row of corbels, as far out as the first step (hist-c: the table is dense with them); their size and spacing are ASSUMED
  const nc = Math.round((2 * h) / 0.9);
  for (const f of faces) {
    for (let k = 0; k < nc; k++) stone.box([f.at[0] + f.dir[0] * (((k + 0.5) * 2 * h) / nc - h) + f.normal[0] * 0.05, bT - 0.3, f.at[1] + f.dir[1] * (((k + 0.5) * 2 * h) / nc - h) + f.normal[1] * 0.05], [0.5, 0.6, 0.4], { rotY: Math.atan2(-f.dir[1], f.dir[0]), skip: ['+y'] });
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
      const q = (x: number, y: number, lift: number): V3 => [f.at[0] + f.dir[0] * x + f.normal[0] * lift, y, f.at[1] + f.dir[1] * x + f.normal[1] * lift];
      const face: V3 = [f.normal[0], 0, f.normal[1]];
      const half = 2.1;
      for (let k = 0; k < 16; k++) {
        const a0 = (k * Math.PI) / 8;
        const a1 = ((k + 1) * Math.PI) / 8;
        const ring = (a: number, r: number, lift: number): V3 => q(r * Math.cos(a), cy + r * Math.sin(a), lift);
        stone.quadUV(ring(a0, 2.05, 0.1), ring(a1, 2.05, 0.1), ring(a1, 2.5, 0.1), ring(a0, 2.5, 0.1), [[0, 0], [0.6, 0], [0.6, 0.5], [0, 0.5]], face);
      }
      // u runs left to right as a viewer outside sees it; dir points to the viewer's left on the front and back faces and to the right on the sides
      const left = f.dir[0] * f.normal[1] - f.dir[1] * f.normal[0] < 0 ? half : -half;
      part(parts, 'clock').quadUV(q(left, cy - half, 0.14), q(-left, cy - half, 0.14), q(-left, cy + half, 0.14), q(left, cy + half, 0.14), [[0, 0], [1, 0], [1, 1], [0, 1]], face);
      // the gable over the dial, brick with a stone border and a rosette in it, its sides running back into the roof
      const gw = h - 1.0;
      addGable(parts, [f.at[0], wH, f.at[1]], f.dir, f.normal, roofSlope, gw, g, 0, 'brickRed');
      addDisc(stone, f, 0, wH + 1.9, 0.45, 0.12);
    }
  }
  // the turrets stand on the corners of the clock stage
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const c: Pt = [t.centre[0] + (t.along[0] * a + t.out[0] * b) * (h + grow - 0.75), t.centre[1] + (t.along[1] * a + t.out[1] * b) * (h + grow - 0.75)];
    addTurret(parts, c, t.along, t.out, wH, 0.65, 3.0, 3.6);
  }
  // the roof; the clock tower's open lantern (dark lights between mullions, a pinnacle on each corner) and then the needle and its rod
  addRoof(slate, sq(P), sq(rb), wH, wH + g, false, [P - rb, P - rb, P - rb, P - rb]);
  addRoof(slate, sq(rb), sq(lant), wH + g, top, false, [rb - lant, rb - lant, rb - lant, rb - lant]);
  if (clockTower) {
    addWalls(part(parts, 'pane'), sq(lant - 0.12), rT + 0.4, lT - 0.4);
    for (const f of facesAt(lant)) for (const dx of [-0.55, 0.55]) stone.box([sideAt(f, dx, 0).at[0], (rT + lT) / 2, sideAt(f, dx, 0).at[1]], [0.2, lT - rT - 0.8, 0.2], { rotY: Math.atan2(-f.dir[1], f.dir[0]), skip: ['-y', '+y'] });
    addBand(stone, ring(lant), rT, 0.4, 0.1);
    addBand(stone, ring(lant), lT - 0.4, 0.4, 0.2);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) addSpike(stone, [t.centre[0] + (t.along[0] * a + t.out[0] * b) * lant, t.centre[1] + (t.along[1] * a + t.out[1] * b) * lant], t.along, t.out, 0.22, rT, lT + 0.9);
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
  for (const y of [6.0, 11.5, 17.0]) addBand(stone, segs, y, 0.35, 0.12);
  addBand(stone, segs, plan.eaves - 1.0, 1.0, 0.6); // the cornice
  addBand(stone, segmentsOutside(edges, [...cutters, ...feet]), plan.eaves, 0.9, 0.35); // the parapet in front of the gutter: not where a gabled bay's cheeks start
  addRoof(slate, plan.outline, plan.roof.ring, plan.eaves, plan.ridge, true, plan.roof.runs);

  // windows: four storeys, round-headed at the bottom and pairs of pointed lancets above; the front and the curved wing in bays, the rest evenly
  const rows = [{ y: 1.0, h: 3.9, head: 'round' as Head }, { y: 6.9, h: 3.4, head: 'pointed' as Head }, { y: 12.4, h: 3.4, head: 'pointed' as Head }, { y: 17.9, h: 3.0, head: 'pointed' as Head }];
  for (const row of rows.slice(1)) addBand(stone, segs, row.y - 0.45, 0.25, 0.14); // hist-b: a continuous stone sill course under each upper row, below the groups' own sills; sizes ASSUMED
  const covered = (p: Pt): boolean => cutters.some((q) => pointInQuad(p, q));
  const dress = (bays: readonly BayPosition[], rich: boolean): void => {
    for (const bay of bays) {
      if (covered(bay.at)) continue;
      const w = Math.max(1.0, Math.min(1.7, bay.width * 0.32));
      // a gabled bay's upper lights stand out with its front, and its arch is the entrance (hist-b): wider and taller, its sill off the ground like the portal's
      const out = pavs.includes(bay) ? PAVILION_OUT : 0;
      const up: BayPosition = { ...bay, at: [bay.at[0] + bay.normal[0] * out, bay.at[1] + bay.normal[1] * out] };
      for (const row of rows) {
        if (rich && row.head === 'pointed') addTwin(parts, up, row.y, Math.max(1.6, Math.min(2.5, bay.width * 0.46)), row.h);
        else if (row.head === 'round') addArch(parts, bay, out ? 0.5 : row.y, out ? 2.4 : w, out ? 4.2 : row.h);
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

  // HE 1342037: two roof storeys with stacked gabled dormers; hist-b, hist-c and hist-e show them as slate gables with pale borders and
  // pale-framed lights, a storey tall in a lower row just above the cornice and a smaller upper one set back. https://historicengland.org.uk/listing/the-list/list-entry/1342037
  // Public roof photograph: https://www.blackheath.org/events/2026/3/26/walk-amp-talk-st-pancras-and-somerstown
  // ASSUMED: one of each row to a bay, their sizes and places; they stand on the facet of their own bay (they are left to the facet's width where
  // a hip cuts in) and never inside a tower's envelope; a gabled bay is its own lower row, and the upper one is behind it.
  for (const bay of [...plan.front.bays, ...plan.wing.bays]) {
    const i = bay.edge;
    const e = edges[i] as Edge;
    const run = plan.roof.runs[i] as number;
    const slope = frame.rise / run;
    const s0 = (bay.at[0] - e.a[0]) * e.dir[0] + (bay.at[1] - e.a[1]) * e.dir[1];
    for (const f of [0.08, 0.62]) {
      const lower = f < 0.3;
      if (lower && pavs.includes(bay)) continue;
      const h = lower ? 5 : 3.6;
      const d = run * f;
      const back = h / slope;
      if (d + back > run - 0.15) continue; // its back must stop short of the crown
      // as wide as asked, or as the facet is between its hips there, or as lets it keep wholly in its own bay when slid along the facet where a hip cuts in
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
  }
  // chimney stacks in pairs along the crown of the roof, round the whole building, the long side toward the shed too (hist-b, hist-e: a row of big corbelled
  // brick stacks), a pair only where both stand wholly on the crown and clear of the towers
  for (const e of edges) {
    const ra = plan.roof.ring[e.i] as Pt;
    const rb = plan.roof.ring[(e.i + 1) % plan.outline.length] as Pt;
    const l = Math.hypot(rb[0] - ra[0], rb[1] - ra[1]);
    if (l < 8) continue;
    const n = Math.max(1, Math.round(l / 11));
    for (let k = 0; k < n; k++) {
      const pair = [-1, 1].map((o): Pt => {
        const s = ((k + 0.5) / n) * l + o * 1.4;
        return [ra[0] + e.dir[0] * s - e.normal[0] * 1.2, ra[1] + e.dir[1] * s - e.normal[1] * 1.2];
      });
      const stands = (c: Pt): boolean => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]): Pt => [c[0] + e.dir[0] * (a as number) + e.normal[0] * (b as number) * 0.75, c[1] + e.dir[1] * (a as number) + e.normal[1] * (b as number) * 0.75]).every((p) => pointInPolygon(p, plan.roof.ring) && !plan.towers.some((t) => pointInQuad(p, towerSquare(t, 1.6))));
      if (pair.every(stands)) for (const c of pair) addStack(parts, c, e.dir, plan.ridge - 0.3, 4.2);
    }
  }
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
 * The Barlow shed [WP-STP] to its 689 ft gable, then the 2007 extension [NSC-EXT] to the end of the OSM outline.
 * Shed: slate on the outer quarters with pale boarding under it, glass on the middle half, a pale lattice rib at each of the 24
 * rib positions (hist-d), the glazed end screen on the north gable (hist-d2), brick to the south. Extension: not the arch, which
 * [NSC-EXT] rejects: a 22 m transition of glass pyramids on plate girders, then saw-tooth bays, pale slopes over dark glazed
 * risers (hist-e). Section sizes and heights are ASSUMED, scaled from those photographs.
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
  // a flat piece seen from either side (a plate, a roof slope, a riser): both faces, `n` being one way it faces
  const sheet = (m: Batch, pts: V3[], n: V3): void => {
    for (const k of [1, -1]) m.poly(pts, undefined, { facing: [n[0] * k, n[1] * k, n[2] * k] });
  };

  // ---- the shed: one strip of shell to each segment of the arch, from the south wall to the gable
  const glassFrom = (1 - F.glassFraction) / 2;
  const strip = (m: Batch, k: number, d: number, uv: [V2, V2, V2, V2]): void => {
    const n = out[k] as P2;
    const e = (i: number, v: number): V3 => at(sec(i).x - n[0] * d, v, Math.max(0, sec(i).y - n[1] * d));
    m.quadUV(e(k, 0), e(k + 1, 0), e(k + 1, L), e(k, L), uv, dir(n[0], n[1]));
  };
  for (let k = 0; k < steps; k++) {
    const [a0, a1] = [arc[k] as number, arc[k + 1] as number];
    const across: [V2, V2, V2, V2] = [[a0, 0], [a1, 0], [a1, L], [a0, L]]; // glass panes and boards: u across the strip, v along it
    const tm = (sec(k).t + sec(k + 1).t) / 2;
    if (tm > glassFrom && tm < 1 - glassFrom) strip(glass, k, 0, across);
    else {
      strip(slate, k, 0, [[0, a0], [0, a1], [L, a1], [L, a0]]); // slate: u along the shed, v up the slope
      strip(lining, k, 0.08, across); // painted boarding just under it: the shared lining is seen from inside only (hist-d)
    }
  }
  // the ribs: two chords and a Warren lattice between them, 1.4 m deep from the roof (hist-d); a bar is a ribbon of width w and
  // thickness 2t along the shed, with its underside when it is a chord
  const bar = (v: number, a: P2, b: P2, w: number, t: number, under = false): void => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n: P2 = [(-(b[1] - a[1]) / l) * (w / 2), ((b[0] - a[0]) / l) * (w / 2)];
    const e = (p: P2, m: number, dv: number): V3 => at(p[0] + m * n[0], v + dv, Math.max(0, p[1] + m * n[1])); // the feet stand on the platform
    for (const m of [-1, 1]) rib.quadUV(e(a, -1, m * t), e(b, -1, m * t), e(b, 1, m * t), e(a, 1, m * t), undefined, dir(0, 0, m));
    if (under) rib.quadUV(e(a, -1, -t), e(b, -1, -t), e(b, -1, t), e(a, -1, t), undefined, dir(-n[0], -n[1]));
  };
  const top = section.map((_, k) => into(k, 0.18));
  const bot = section.map((_, k) => into(k, 1.32));
  for (const v of plan.ribs) {
    for (let k = 0; k < steps; k++) {
      const [t0, t1, b0, b1] = [top[k], top[k + 1], bot[k], bot[k + 1]] as P2[];
      const mid: P2 = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2];
      bar(v, t0, t1, 0.16, 0.15, true);
      bar(v, b0, b1, 0.16, 0.15, true);
      bar(v, t0, mid, 0.1, 0.05);
      bar(v, mid, t1, 0.1, 0.05);
      bar(v, t0, b0, 0.1, 0.05);
    }
    bar(v, top[steps] as P2, bot[steps] as P2, 0.1, 0.05);
  }
  // a purlin under the roof at every node of the arch, along the whole shed: the lines that run away down the vault in hist-d
  for (let k = 0; k <= steps; k++) {
    const p = into(k, 0.14);
    rib.box(at(p[0], L / 2, Math.max(0.06, p[1])), [0.14, 0.12, L], { rotY: -plan.heading, skip: ['+y', '+z', '-z'] });
  }
  // the end screen on the gable: glazing in a white iron grid from the foot of the transition roof up to the arch; the panes are
  // about 3.6 m (hist-d2: about 14 across), so the shared glazing is stretched four times along and twice up
  const gable: P2[] = [];
  for (let k = 0; k <= steps; k++) {
    const p = sec(k);
    const q = sec(Math.min(k + 1, steps));
    if (p.y >= F.screenFoot) gable.push([p.x, p.y]);
    if ((p.y < F.screenFoot) !== (q.y < F.screenFoot)) gable.push([p.x + ((F.screenFoot - p.y) / (q.y - p.y)) * (q.x - p.x), F.screenFoot]);
  }
  glass.fan(gable.map((p) => at(p[0], L, p[1])), dir(0, 0, 1), (p) => [((p[0] - plan.origin[0]) * c + (p[2] - plan.origin[1]) * s) / 4, p[1] / 2]);

  // ---- the extension [NSC-EXT], wall to wall like the shed: no ribs, no arch
  const W = plan.width;
  const y0 = F.screenFoot; // the top of the transition's plate girders, where it meets the screen
  const lo = y0 - F.girder; // ASSUMED: the saw-tooth's low edge is level with the girders' underside
  const vT = L + F.transition;
  const [cu, cv] = [W / 12, F.transition / 4]; // the transition: pyramids of glass 6.2 x 5.5 m on a grillage of girders
  for (let j = 0; j <= 4; j++) sheet(rib, [at(0, L + j * cv, lo), at(W, L + j * cv, lo), at(W, L + j * cv, y0), at(0, L + j * cv, y0)], dir(0, 0, 1));
  for (let i = 0; i <= 12; i++) sheet(rib, [at(i * cu, L, lo), at(i * cu, vT, lo), at(i * cu, vT, y0), at(i * cu, L, y0)], dir(1, 0));
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
    for (const u of [0, W]) sheet(rib, [at(u, v0, lo - 1.2), at(u, v1, lo - 1.2), at(u, v1, hi), at(u, v0, lo)], dir(1, 0));
  }
  // the south wall: the shed's end, brick, behind the hotel; u across the wall from its west foot, v up
  const brick = part(parts, 'brickRed');
  const wall = section.map((p): V3 => at(p.x, 0.15, p.y)); // the arch, foot to foot
  const foot0 = wall[0] as V3;
  const south: V3 = [-s, 0, c]; // facing south, away from the shed
  const centre = at(plan.width / 2, 0.15, 0);
  brick.fan([centre, ...wall], south, (p) => [(p[0] - foot0[0]) * c + (p[2] - foot0[2]) * s, p[1]]);
  return parts;
}

// ---- standing on the ground --------------------------------------------------------------------

/** How many vertices each part of a structure holds at this moment: where `liftParts` starts from, to raise only what was added since. */
export function partMarks<K extends string>(parts: PartMap<K>): Partial<Record<K, number>> {
  const marks: Partial<Record<K, number>> = {};
  for (const k of Object.keys(parts) as K[]) marks[k] = parts[k]?.positions.length ?? 0;
  return marks;
}

/**
 * Raise a structure by `dy` metres: the y of every vertex its parts hold (past `from`, if given), and nothing else. The normals and the UVs
 * stay as built, so the brick courses and the shading are what they were; the parts keep their heights relative to one another. A shift
 * of nothing leaves the vertices alone, so a structure with no terrain under it comes out byte for byte as it was built.
 */
export function liftParts<K extends string>(parts: PartMap<K>, dy: number, from: Partial<Record<K, number>> = {}): void {
  if (dy === 0) return;
  for (const k of Object.keys(parts) as K[]) {
    const p = parts[k]?.positions;
    if (!p) continue;
    for (let i = (from[k] ?? 0) + 1; i < p.length; i += 3) p[i] = (p[i] as number) + dy;
  }
}

/**
 * The parts of the three buildings: the hotel, the Midland Grand, the Barlow shed. They are built standing on y = 0; with `seats` each is
 * raised to its own (`landmarkSeats`), so its lowest wall vertex is on the lowest ground under it.
 */
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

/**
 * Add the landmark buildings to the scene. In main.ts: call this once after building the scene, and add
 * LANDMARK_OSM_IDS (or `landmarks.excludeIds`) to the set passed to buildingPrisms(), so the generic OSM
 * boxes for these three buildings are not drawn as well. With `opts.terrain` the buildings are seated on it.
 */
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
