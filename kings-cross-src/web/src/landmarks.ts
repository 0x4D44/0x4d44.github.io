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
import { barlowSection, FIGURES, landmarkPlans, landmarkSeats, polygonEdges, REPLACED_BUILDING_IDS, towerSquare } from '../../core/landmarks.ts';
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

export type Key = 'brick' | 'brickRed' | 'stone' | 'slate' | 'sash' | 'sashArch' | 'pane' | 'roofGlass' | 'steel' | 'clock';

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
  // The only material of its own is the clock face: a canvas picture of a dial, drawn here (nothing else uses it).
  let clockMap: THREE.CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = '#e9e2cc';
    g.beginPath();
    g.arc(64, 64, 62, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#1d1b18';
    g.lineWidth = 4;
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      g.beginPath();
      g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50);
      g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58);
      g.stroke();
    }
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + Math.sin(2.4) * 30, 64 - Math.cos(2.4) * 30);
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + Math.sin(5.9) * 46, 64 - Math.cos(5.9) * 46);
    g.stroke();
    clockMap = own(new THREE.CanvasTexture(c));
    clockMap.colorSpace = THREE.SRGBColorSpace;
  }
  const clock = own(new THREE.MeshBasicMaterial({ map: clockMap, color: clockMap ? 0xffffff : 0xe9e2cc, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  return {
    table: {
      brick: material('brick'),
      brickRed: material('brickRed'),
      stone: material('stone'),
      slate: material('slateBothSides'),
      sash: material('sash'),
      sashArch: material('sashArch'),
      pane: material('pane'),
      roofGlass: material('roofGlass'),
      steel: material('steel'),
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
 */
export function addRoof(m: Batch, outline: readonly Pt[], ring: readonly Pt[], y0: number, y1: number, cap = true): void {
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
    m.quadUV([a[0], y0, a[1]], [b[0], y0, b[1]], [rb[0], y1, rb[1]], [ra[0], y1, ra[1]], [[s0, 0], [s1, 0], [s1, slope(j)], [s0, slope(e.i)]], [e.normal[0], 1, e.normal[1]]);
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
const SASH_HEIGHT = 2.4; // ASSUMED

export function hotelGeometry(plan: HotelPlan): PartMap<Key> {
  const parts: PartMap<Key> = {};
  const stone = part(parts, 'stone');
  addWalls(part(parts, 'brick'), plan.outline, 0, plan.eaves);
  const segs = segmentsOutside(polygonEdges(plan.outline), []);
  addBand(stone, segs, plan.groundStorey - 0.12, 0.28, 0.1); // string course over the ground floor
  addBand(stone, segs, plan.eaves - CORNICE_HEIGHT, CORNICE_HEIGHT, 0.55); // modillion cornice [HE-GNH]; its depth is ASSUMED
  addRoof(part(parts, 'slate'), plan.outline, plan.roof.ring, plan.eaves, plan.ridge);

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
      for (let s = 1; s < f.storeys; s++) {
        // sashes 2.4 m tall (the shared texture is 2.6 m, squeezed a little) so the top row clears the cornice
        const base = f.groundStorey + (s - 1) * f.upperStorey + 0.5;
        // the sixth and thirteenth bays of the main front are tripartite [HE-GNH]: three narrow lights
        if (face.kind === 'main' && (index === 5 || index === 12)) {
          for (const k of [-1, 0, 1]) {
            const at: Pt = [bay.at[0] + bay.dir[0] * k * 0.8, bay.at[1] + bay.dir[1] * k * 0.8];
            addSash(parts, 'sash', { at, dir: bay.dir, normal: bay.normal }, base, 0.75, SASH_HEIGHT);
          }
        } else addSash(parts, 'sash', bay, base, tw, SASH_HEIGHT);
      }
    });
  }
  return parts;
}

// ---- the St Pancras Renaissance (Midland Grand) Hotel ------------------------------------------

/** A tower on a square plan: brick shaft with lancets, a belfry stage, then (clock tower) a gabled clock stage and a slate spire, or (west tower) an arcaded stage and a pyramid roof. */
function addTower(parts: PartMap<Key>, t: TowerPlan): void {
  const h = t.side / 2;
  const corner = (a: number, b: number, grow = 0): Pt => [t.centre[0] + t.along[0] * a * (h + grow) + t.out[0] * b * (h + grow), t.centre[1] + t.along[1] * a * (h + grow) + t.out[1] * b * (h + grow)];
  const square = (grow = 0): Pt[] => [corner(-1, -1, grow), corner(1, -1, grow), corner(1, 1, grow), corner(-1, 1, grow)];
  const brick = part(parts, 'brickRed');
  const stone = part(parts, 'stone');
  const slate = part(parts, 'slate');
  const clockTower = t.name === 'clock';
  const shaftTop = clockTower ? t.height * 0.5 : t.height * 0.72;
  addWalls(brick, square(), 0, shaftTop);
  const whole = (grow: number): Seg[] => segmentsOutside(polygonEdges(square(grow)), []);
  for (let y = 9; y < shaftTop - 3; y += 9) addBand(stone, whole(0), y, 0.5, 0.2);
  const faces: Placed[] = [
    { at: corner(0, 1), dir: t.along, normal: t.out },
    { at: corner(0, -1), dir: [-t.along[0], -t.along[1]], normal: [-t.out[0], -t.out[1]] },
    { at: corner(1, 0), dir: t.out, normal: t.along },
    { at: corner(-1, 0), dir: [-t.out[0], -t.out[1]], normal: [-t.along[0], -t.along[1]] },
  ];
  const sideAt = (f: Placed, dx: number, lift: number): Placed => ({ at: [f.at[0] + f.dir[0] * dx + f.normal[0] * lift, f.at[1] + f.dir[1] * dx + f.normal[1] * lift], dir: f.dir, normal: f.normal });
  for (const f of faces) for (let y = 5; y < shaftTop - 6; y += 9) addFramedWindow(parts, f, y, 1.3, 3.6, 'pointed', 0.22);
  if (clockTower) {
    // belfry stage, then the clock stage: a gable and a clock on each face, a pinnacle at each corner, a spire
    const belfryTop = shaftTop + t.height * 0.13;
    addWalls(brick, square(0.15), shaftTop, belfryTop);
    addBand(stone, whole(0.15), shaftTop, 0.5, 0.2);
    addBand(stone, whole(0.15), belfryTop - 0.5, 0.5, 0.2);
    for (const f of faces) for (const dx of [-1.9, 1.9]) addFramedWindow(parts, sideAt(f, dx, 0.25), shaftTop + 1.8, 1.3, t.height * 0.13 - 4.4, 'pointed', 0.2);
    const clockTop = belfryTop + t.height * 0.1;
    addWalls(brick, square(0.1), belfryTop, clockTop);
    for (const f of faces) {
      const apex: V3 = [f.at[0] + f.normal[0] * 0.2, clockTop + 4.2, f.at[1] + f.normal[1] * 0.2];
      const l: V3 = [f.at[0] + f.dir[0] * (h + 0.2) + f.normal[0] * 0.2, clockTop, f.at[1] + f.dir[1] * (h + 0.2) + f.normal[1] * 0.2];
      const r: V3 = [f.at[0] - f.dir[0] * (h + 0.2) + f.normal[0] * 0.2, clockTop, f.at[1] - f.dir[1] * (h + 0.2) + f.normal[1] * 0.2];
      stone.tri(l, r, apex, [[0, clockTop], [2 * h + 0.4, clockTop], [h + 0.2, clockTop + 4.2]], [f.normal[0], 0, f.normal[1]]);
      // the clock face: a square panel whose disc is cut out by the material's alpha test
      const cy = belfryTop + (clockTop - belfryTop) * 0.5;
      const half = 2.1;
      const off = 0.27;
      const q = (x: number, y: number): V3 => [f.at[0] + f.dir[0] * x + f.normal[0] * off, y, f.at[1] + f.dir[1] * x + f.normal[1] * off];
      part(parts, 'clock').quadUV(q(half, cy - half), q(-half, cy - half), q(-half, cy + half), q(half, cy + half), [[0, 0], [1, 0], [1, 1], [0, 1]], [f.normal[0], 0, f.normal[1]]);
    }
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const [px, pz] = corner(a, b, 0.1);
      const sq: Pt[] = [0, 1, 2, 3].map((k) => [px + (k === 1 || k === 2 ? 0.4 : -0.4), pz + (k >= 2 ? 0.4 : -0.4)] as Pt);
      addWalls(stone, sq, clockTop, clockTop + 2.2);
      addRoof(slate, sq, sq.map(() => [px, pz] as Pt), clockTop + 2.2, clockTop + 4.2, false);
    }
    addRoof(slate, square(0.1), square(0.1).map(() => t.centre), clockTop, t.height, false);
  } else {
    const arcTop = shaftTop + t.height * 0.1;
    addWalls(brick, square(0.15), shaftTop, arcTop);
    addBand(stone, whole(0.15), shaftTop, 0.5, 0.2);
    for (const f of faces) for (const dx of [-2.6, 0, 2.6]) addFramedWindow(parts, sideAt(f, dx, 0.25), shaftTop + 1.0, 1.5, t.height * 0.1 - 2.2, 'round', 0.18);
    addRoof(slate, square(0.15), square(0.15).map(() => t.centre), arcTop, t.height, false);
  }
}

export function midlandGeometry(plan: MidlandPlan): PartMap<Key> {
  const parts: PartMap<Key> = {};
  const stone = part(parts, 'stone'), slate = part(parts, 'slate');
  addWalls(part(parts, 'brickRed'), plan.outline, 0, plan.eaves);
  // the towers stand in front of the wall: stop the bands and windows where they stand
  const cutters = plan.towers.map((t) => towerSquare(t, 0.45));
  const segs = segmentsOutside(polygonEdges(plan.outline), cutters);
  for (const y of [6.0, 11.5, 17.0]) addBand(stone, segs, y, 0.35, 0.12);
  addBand(stone, segs, plan.eaves - 1.0, 1.0, 0.6);
  addRoof(slate, plan.outline, plan.roof.ring, plan.eaves, plan.ridge);

  // windows: four storeys, round-headed at the bottom and pointed above; the front and the curved wing in bays, the rest evenly
  const rows = [{ y: 1.0, h: 3.9, head: 'round' as Head }, { y: 6.9, h: 3.4, head: 'pointed' as Head }, { y: 12.4, h: 3.4, head: 'pointed' as Head }, { y: 17.9, h: 3.0, head: 'pointed' as Head }];
  const covered = (p: Pt): boolean => cutters.some((q) => pointInQuad(p, q));
  const dress = (bays: readonly BayPosition[]): void => {
    for (const bay of bays) {
      if (covered(bay.at)) continue;
      const w = Math.max(1.0, Math.min(1.7, bay.width * 0.32));
      for (const row of rows) addFramedWindow(parts, bay, row.y, w, row.h, row.head, 0.22);
    }
  };
  dress(plan.front.bays);
  dress(plan.wing.bays);
  const dressed = new Set<number>([...plan.front.edges, ...plan.wing.edges].map((e) => e.i));
  for (const e of polygonEdges(plan.outline)) {
    if (dressed.has(e.i) || e.length < 6) continue;
    const n = Math.max(1, Math.round(e.length / 5.2));
    const bays: BayPosition[] = [];
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      bays.push({ edge: e.i, at: [e.a[0] + e.dir[0] * e.length * t, e.a[1] + e.dir[1] * e.length * t], dir: e.dir, normal: e.normal, width: e.length / n });
    }
    dress(bays);
  }
  // HE 1342037: two roof storeys with stacked gabled dormers.
  // https://historicengland.org.uk/listing/the-list/list-entry/1342037
  // Public roof photograph: https://www.blackheath.org/events/2026/3/26/walk-amp-talk-st-pancras-and-somerstown
  // ASSUMED: regular bay alignment, tier insets, widths/heights and plain stone gables;
  // slate cheeks/hoods meet the existing pitch. No new footprint or tower placement.
  const slope = (plan.ridge - plan.eaves) / plan.roof.inset;
  for (const bay of [...plan.front.bays, ...plan.wing.bays]) for (const f of [0.12, 0.55]) {
    const w = Math.min(1.3, bay.width * 0.25) * (f < 0.5 ? 1 : 0.75), h = f < 0.5 ? 3.6 : 2.8, shoulder = h * 0.68;
    const depth = h / slope, inset = plan.roof.inset * f, y = plan.eaves + slope * inset;
    const p = { ...bay, at: [bay.at[0] - bay.normal[0] * inset, bay.at[1] - bay.normal[1] * inset] as Pt };
    // Inflate by the full hood radius, not just its centre: no edge can cross a tower.
    if (plan.towers.some(t => pointInQuad(p.at, towerSquare(t, Math.hypot(w, depth) + 0.45)))) continue;
    const q = (u: number, d: number, v: number): V3 => [p.at[0] + p.dir[0] * u - p.normal[0] * d, y + v, p.at[1] + p.dir[1] * u - p.normal[1] * d];
    const normal: V3 = [p.normal[0], 0, p.normal[1]];
    const gable: V2[] = [[-w, 0], [w, 0], [w, shoulder], [0, h], [-w, shoulder]];
    stone.poly(gable.map(([u, v]) => q(u, 0, v)), gable, { normal });
    for (const sign of [-1, 1]) {
      slate.tri(q(sign*w, 0, 0), q(sign*w, 0, shoulder), q(sign*w, shoulder/slope, shoulder), [[0, 0], [0, shoulder], [shoulder/slope, shoulder]], [sign*p.dir[0], 0, sign*p.dir[1]]);
      const span = Math.hypot(w, h - shoulder);
      slate.quadUV(q(sign*w, 0, shoulder), q(0, 0, h), q(0, depth, h), q(sign*w, shoulder/slope, shoulder), [[0, 0], [span, 0], [span, depth], [0, shoulder/slope]], UP);
    }
    addFramedWindow(parts, p, y + 0.18, w * 1.05, shoulder * 0.8, 'pointed', 0.12);
  }
  for (const t of plan.towers) addTower(parts, t);
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

/**
 * The vault: a shell of strips along the shed from the south wall to the end of the OSM outline, slate
 * on the outer quarters and glass on the middle half [WP-STP], with a rib every 8.94 m.
 */
export function barlowGeometry(plan: BarlowPlan, steps = 24): PartMap<Key> {
  const parts: PartMap<Key> = {};
  const c = Math.cos(plan.heading);
  const s = Math.sin(plan.heading);
  // frame: u across (east), v along (north); world = origin + u*(c, s) + v*(s, -c)
  const at = (u: number, v: number, y: number): V3 => [plan.origin[0] + u * c + v * s, y, plan.origin[1] + u * s - v * c];
  const margin = (plan.width - plan.span) / 2;
  const section = barlowSection(steps, plan.span, plan.rise).map((p) => ({ ...p, x: p.x + margin }));
  // metres along the arch, from the west foot (for the UVs)
  const arc: number[] = [0];
  for (let k = 1; k < section.length; k++) arc.push((arc[k - 1] as number) + Math.hypot((section[k] as { x: number }).x - (section[k - 1] as { x: number }).x, (section[k] as { y: number }).y - (section[k - 1] as { y: number }).y));
  const slate = part(parts, 'slate');
  const glass = part(parts, 'roofGlass');
  const steel = part(parts, 'steel');
  const glassFrom = (1 - FIGURES.barlow.glassFraction) / 2;
  const glassTo = 1 - glassFrom;
  for (let k = 0; k < section.length - 1; k++) {
    const p = section[k] as (typeof section)[number];
    const q = section[k + 1] as (typeof section)[number];
    const tm = (p.t + q.t) / 2;
    const isGlass = tm > glassFrom && tm < glassTo;
    // the section runs west to east, so the outward (up) side is (-dy, dx) in (u, y)
    const nu = -(q.y - p.y);
    const ny = q.x - p.x;
    const nl = Math.hypot(nu, ny);
    const hint: V3 = [(nu / nl) * c, ny / nl, (nu / nl) * s];
    // slate strips end where the Barlow part ends; beyond it (the extension) the roof is glass to the ground
    const pieces: [number, number, boolean][] = isGlass ? [[0, plan.length, true]] : [[0, plan.barlowLength, false], [plan.barlowLength, plan.length, true]];
    for (const [v0, v1, g] of pieces) {
      const a = at(p.x, v0, p.y);
      const b = at(q.x, v0, q.y);
      const d = at(q.x, v1, q.y);
      const e = at(p.x, v1, p.y);
      const a0 = arc[k] as number;
      const a1 = arc[k + 1] as number;
      // glass: u across the strip (panes 0.9 m wide), v along it; slate: u along the shed, v up the slope
      if (g) glass.quadUV(a, b, d, e, [[a0, v0], [a1, v0], [a1, v1], [a0, v1]], hint);
      else slate.quadUV(a, b, d, e, [[v0, a0], [v0, a1], [v1, a1], [v1, a0]], hint);
    }
  }
  // ribs: a steel ribbon 0.5 m wide following the arch, 1.4 m deep, at each rib position
  const rib = 0.25;
  const depth = 1.4;
  for (const v of plan.ribs) {
    for (let k = 0; k < section.length - 1; k++) {
      const p = section[k] as (typeof section)[number];
      const q = section[k + 1] as (typeof section)[number];
      const nu = -(q.y - p.y);
      const ny = q.x - p.x;
      const nl = Math.hypot(nu, ny);
      const inward = (pt: typeof p): [number, number] => [pt.x - (nu / nl) * depth, pt.y - (ny / nl) * depth];
      const pi = inward(p);
      const qi = inward(q);
      steel.quadUV(at(p.x, v - rib, p.y), at(q.x, v - rib, q.y), at(qi[0], v - rib, qi[1]), at(pi[0], v - rib, pi[1]));
      steel.quadUV(at(p.x, v + rib, p.y), at(q.x, v + rib, q.y), at(qi[0], v + rib, qi[1]), at(pi[0], v + rib, pi[1]));
      steel.quadUV(at(pi[0], v - rib, pi[1]), at(qi[0], v - rib, qi[1]), at(qi[0], v + rib, qi[1]), at(pi[0], v + rib, pi[1]));
    }
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
