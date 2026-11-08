// The Hitachi AT300 trains (LNER Azuma 800/801, Hull Trains 802, Lumo 803) as three.js models,
// built only from the figures in core/train.ts. Procedural: no image assets.
//
// Local frame of a train: x across, y up with y = 0 at the rail head, the FRONT nose at z = 0 and
// the train running to z = +length. Forward travel is -z, which is north in the world (see
// core/geo.ts), so the group is turned by (PI - heading) to stand along the shed's tracks.
//
// Structure (the test relies on these names):
//   car-<i>           one per car: the body meshes, the doors, the bogies, and on each driving car the pantograph
//     body-shell      the sides and lower shoulders, textured with the livery
//     body-detail     roof, covers, nose front, windscreen, skirts, door leaves (vertex colours)
//     door            a marker per door leaf (4 per car: 2 per side)
//     bogie-<i>-<k>   a group at z = car.bogies[k]: one merged mesh and four `wheel` markers
//     pantograph      a group over the pantograph base (one per driving car)
//
// Doors and wheels are named marker nodes whose geometry is merged into a few meshes, so a nine-car
// train draws in about forty calls rather than two hundred. The marker is the source: the merged
// geometry is generated from it.
import * as THREE from 'three';
import { standingTrainPose } from '../../core/station.ts';
import type { ShedLayout } from '../../core/station.ts';
import { FIGURES, roofHeight, trainLayout } from '../../core/train.ts';
import type { Car, Livery, TrainKind } from '../../core/train.ts';
import { LIGHT_GAIN, LIVERIES, shellMaterial, TEX_Y0, TEX_Y1 } from './livery.ts';
import type { CarPlan, LiveryDef } from './livery.ts';

/**
 * Everything the published figures do not give. Each is a guess chosen so the model reads as an
 * Azuma, to be replaced when a drawing turns up. They are kept here, apart from FIGURES, so the
 * difference stays visible.
 */
export const ASSUMED = {
  /** Underside of the body (floor level). Nobody publishes it; chosen so the roof edge sits about 2.7 m above it. */
  floorHeight: 1.0,
  /** Bottom edge of the side skirts. Assumed: low enough to hide the underframe, high enough to clear a platform edge and show the wheels' lower half in the bogie cut-outs. */
  skirtBottom: 0.45,
  /** Length of the raked nose, tip to where the body goes full width. Not published; the cab bogie (4.455 m from the nose) sits under it. */
  noseLength: 5.4,
  /** Door leaf width. Assumed. */
  doorWidth: 0.95,
  /** Distance from the inner car end to the centre of the end door, and from the nose end of a driving car. Assumed. */
  doorFromEnd: 3.0,
  doorFromNose: 2.6,
  /** Half-length of the skirt cut-out round each bogie. Assumed. */
  bogieCutout: 1.95,
  /** Wheel tread width. Assumed. */
  wheelWidth: 0.13,
} as const;

/** How far the doors stand proud of the shell, so they, not the shell, set the body width. */
const DOOR_RELIEF = 0.02;

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mean = (ps: V3[]): V3 => {
  const s = ps.reduce((a, p) => add(a, p), [0, 0, 0] as V3);
  return [s[0] / ps.length, s[1] / ps.length, s[2] / ps.length];
};

const colours = new Map<number, THREE.Color>();
const col = (hex: number): THREE.Color => {
  let c = colours.get(hex);
  if (!c) colours.set(hex, (c = new THREE.Color(hex).multiplyScalar(LIGHT_GAIN)));
  return c;
};

type UV = [number, number];

/** A bag of triangles. Winding is fixed at insertion so it agrees with the normals given. */
class Soup {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly clr: number[] = [];
  readonly uvs: number[] = [];

  tri(p: [V3, V3, V3], n: [V3, V3, V3], c: THREE.Color | null, uv?: [UV, UV, UV]): void {
    const f = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const want = add(add(n[0], n[1]), n[2]);
    const order = dot(f, want) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const i of order) {
      const v = p[i] as V3;
      const nn = n[i] as V3;
      this.pos.push(v[0], v[1], v[2]);
      this.nrm.push(nn[0], nn[1], nn[2]);
      if (c) this.clr.push(c.r, c.g, c.b);
      if (uv) this.uvs.push((uv[i] as UV)[0], (uv[i] as UV)[1]);
    }
  }

  quad(p: [V3, V3, V3, V3], n: [V3, V3, V3, V3], c: THREE.Color | null, uv?: [UV, UV, UV, UV]): void {
    this.tri([p[0], p[1], p[2]], [n[0], n[1], n[2]], c, uv && [uv[0], uv[1], uv[2]]);
    this.tri([p[0], p[2], p[3]], [n[0], n[2], n[3]], c, uv && [uv[0], uv[2], uv[3]]);
  }

  /** A flat quad of a convex solid, facing away from the solid's centre. */
  face(p: [V3, V3, V3, V3], centre: V3, c: THREE.Color): void {
    let n = unit(cross(sub(p[1], p[0]), sub(p[3], p[0])));
    if (dot(n, sub(mean(p), centre)) < 0) n = [-n[0], -n[1], -n[2]];
    this.quad(p, [n, n, n, n], c);
  }

  /** An axis-aligned box. `skip` lists faces to leave out ('+x', '-y', ...); `faceColours` recolours some. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: THREE.Color, skip = '', faceColours: Record<string, THREE.Color> = {}): void {
    const centre: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const faces: Record<string, [V3, V3, V3, V3]> = {
      '+x': [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
      '-x': [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]],
      '+y': [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
      '-y': [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      '+z': [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      '-z': [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    };
    for (const [k, p] of Object.entries(faces)) if (!skip.includes(k)) this.face(p, centre, faceColours[k] ?? c);
  }

  /** A square bar between two points in the y-z plane, `w` wide in x and `h` thick across its axis. */
  bar(a: [number, number], b: [number, number], w: number, h: number, c: THREE.Color): void {
    const d = unit([0, b[0] - a[0], b[1] - a[1]]);
    const nx: V3 = [0, -d[2], d[1]];
    const corner = (p: [number, number], sx: number, sn: number): V3 => [(sx * w) / 2, p[0] + (sn * h * nx[1]) / 2, p[1] + (sn * h * nx[2]) / 2];
    const ps = [corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1), corner(b, -1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1)] as V3[];
    const centre = mean(ps);
    const at = (...i: number[]): [V3, V3, V3, V3] => i.map((k) => ps[k]) as [V3, V3, V3, V3];
    for (const f of [at(0, 1, 2, 3), at(4, 5, 6, 7), at(0, 1, 5, 4), at(2, 3, 7, 6), at(0, 3, 7, 4), at(1, 2, 6, 5)]) this.face(f, centre, c);
  }

  /** Triangles of a three.js geometry, moved by `m`. */
  geometry(g: THREE.BufferGeometry, m: THREE.Matrix4, c: THREE.Color): void {
    const flat = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
    const p = flat.getAttribute('position');
    const n = flat.getAttribute('normal');
    const at = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number): V3 => [a.getX(i), a.getY(i), a.getZ(i)];
    for (let i = 0; i + 2 < p.count; i += 3) this.tri([at(p, i), at(p, i + 1), at(p, i + 2)], [at(n, i), at(n, i + 1), at(n, i + 2)], c);
    flat.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    if (this.clr.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.clr, 3));
    if (this.uvs.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

let plainMaterial: THREE.MeshLambertMaterial | null = null;
/** The one material for everything that carries its colour in the vertices; shared by every train. */
const plain = (): THREE.MeshLambertMaterial => {
  plainMaterial ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  return plainMaterial;
};

// --- the body section --------------------------------------------------------------------------

const BW = FIGURES.bodyWidth.value;
const ROOF_EDGE = FIGURES.roofEdgeHeight.value;
/** Half-width of the shell. The door windows (BW / 2) are the widest points, so the body is exactly bodyWidth. */
const W = BW / 2 - DOOR_RELIEF;
const FLOOR = ASSUMED.floorHeight;

/**
 * The roof and nose profiles below were drawn against a roof edge of 3.725 m, the first reading,
 * which put the top of the covers at nearly 4 m. They are scaled into the roof edge now in use
 * (FIGURES.roofEdgeHeight), so the shape holds while the height follows the figure.
 */
const DRAWN_ROOF_EDGE = 3.725;
/** Top of the vertical side wall: the doors, windows and livery bands all sit below it and are not scaled. */
const WALL_TOP = 2.9;
const roofY = (drawn: number): number => WALL_TOP + (drawn - WALL_TOP) * ((ROOF_EDGE - WALL_TOP) / (DRAWN_ROOF_EDGE - WALL_TOP));
/** A height above the floor, scaled with the roof edge (the nose rings). */
const noseY = (drawn: number): number => FLOOR + (drawn - FLOOR) * ((ROOF_EDGE - FLOOR) / (DRAWN_ROOF_EDGE - FLOOR));

/** Right half of the section, from the bottom corner up to the roof centre: slight tumblehome above the doors, rounded shoulders. */
const HALF: [number, number][] = [
  [W - 0.15, FLOOR],
  [W - 0.03, FLOOR + 0.07],
  [W, FLOOR + 0.25],
  [W, WALL_TOP],
  [W - 0.05, roofY(3.22)],
  [W - 0.16, roofY(3.47)],
  [W - 0.33, roofY(3.63)],
  [W - 0.52, roofY(3.7)],
  [0, ROOF_EDGE],
];
/** The closed section: up the right, down the left; the last point joins the first along the floor. */
const SECTION: [number, number][] = [...HALF, ...HALF.slice(0, -1).reverse().map(([x, y]): [number, number] => [-x, y])];

interface Ring {
  s: number;
  /** width scale, roof height, floor height at this distance from the nose tip */
  ws: number;
  top: number;
  bottom: number;
}

/** The raked nose, tip to full section: a long low bonnet, a windscreen rising at about 35 degrees, then the roof. */
function noseRings(): Ring[] {
  const n = ASSUMED.noseLength;
  return [
    { s: 0.02, ws: 0.5, top: noseY(1.9), bottom: 0.8 },
    { s: 0.5, ws: 0.56, top: noseY(1.95), bottom: 0.8 },
    { s: 1.0, ws: 0.64, top: noseY(2.15), bottom: 0.82 },
    { s: 1.6, ws: 0.74, top: noseY(2.62), bottom: 0.85 },
    { s: 2.2, ws: 0.83, top: noseY(3.1), bottom: 0.88 },
    { s: 2.8, ws: 0.9, top: noseY(3.42), bottom: 0.9 },
    { s: 3.5, ws: 0.95, top: noseY(3.55), bottom: 0.93 },
    { s: 4.4, ws: 0.98, top: noseY(3.65), bottom: 0.95 },
    { s: n, ws: 1, top: ROOF_EDGE, bottom: FLOOR },
  ];
}

function clipY(poly: V3[], yCut: number, above: boolean): V3[] {
  const out: V3[] = [];
  const inside = (p: V3): boolean => (above ? p[1] >= yCut : p[1] <= yCut);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as V3;
    const b = poly[(i + 1) % poly.length] as V3;
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) {
      const t = (yCut - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, yCut, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

/** Split the cars' intervals: remove [a, b] from each of them. */
function without(spans: [number, number][], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [s, e] of spans) {
    if (b <= s || a >= e) out.push([s, e]);
    else {
      if (a > s) out.push([s, a]);
      if (b < e) out.push([b, e]);
    }
  }
  return out;
}

export function carPlan(car: Car): CarPlan {
  const L = car.length;
  const nose = car.cab ? ASSUMED.noseLength : 0;
  const doors = [car.cab ? nose + ASSUMED.doorFromNose : ASSUMED.doorFromEnd, L - ASSUMED.doorFromEnd];
  const from = (doors[0] as number) + ASSUMED.doorWidth / 2 + 0.5;
  const to = (doors[1] as number) - ASSUMED.doorWidth / 2 - 0.5;
  const n = Math.max(1, Math.round((to - from) / 2.0));
  const pitch = (to - from) / n;
  const windows: [number, number][] = [];
  for (let k = 0; k < n; k++) windows.push([from + k * pitch + 0.2, from + (k + 1) * pitch - 0.2]);
  return { length: L, nose, doors, windows };
}

// --- one car -----------------------------------------------------------------------------------

function buildCar(car: Car, def: LiveryDef, livery: Livery): THREE.Group {
  const group = new THREE.Group();
  group.name = `car-${car.index}`;
  const plan = carPlan(car);
  const L = car.length;
  // distance along the car (s) to z: from the cab end for a driving car, from the start otherwise
  const dir = car.cab === 'rear' ? -1 : 1;
  const base = car.cab === 'rear' ? car.end : car.start;
  const Z = (s: number): number => base + dir * s;

  const shell = new Soup();
  const detail = new Soup();
  const vUv = (y: number): number => (y - TEX_Y0) / (TEX_Y1 - TEX_Y0);

  // rings of the lofted body, in the car's own frame (x, y, s)
  const rings: Ring[] = [...(car.cab ? noseRings() : [{ s: 0, ws: 1, top: ROOF_EDGE, bottom: FLOOR }]), { s: L, ws: 1, top: ROOF_EDGE, bottom: FLOOR }];
  const M = SECTION.length;
  const P: V3[][] = rings.map((r) => SECTION.map(([x, y]): V3 => [x * r.ws, r.bottom + ((y - FLOOR) / (ROOF_EDGE - FLOOR)) * (r.top - r.bottom), r.s]));
  const R = rings.length - 1;
  const N: V3[][] = P.map((ring, i) =>
    ring.map((p, j): V3 => {
      const a = (P[Math.min(i + 1, R)] as V3[])[j] as V3;
      const b = (P[Math.max(i - 1, 0)] as V3[])[j] as V3;
      const c = ring[(j + 1) % M] as V3;
      const d = ring[(j + M - 1) % M] as V3;
      const n = unit(cross(sub(a, b), sub(c, d)));
      const r = rings[i] as Ring;
      const out: V3 = [p[0], p[1] - (r.top + r.bottom) / 2, 0];
      return dot(n, out) < 0 ? [-n[0], -n[1], -n[2]] : n;
    }),
  );
  const world = (p: V3): V3 => [p[0], p[1], Z(p[2])];
  const wn = (n: V3): V3 => [n[0], n[1], n[2] * dir];
  const noseTip = def.swoosh ?? def.noseFront;
  for (let i = 0; i < R; i++) {
    const r0 = rings[i] as Ring;
    const r1 = rings[i + 1] as Ring;
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      const idx: [number, number][] = [[i, j], [i, j1], [i + 1, j1], [i + 1, j]];
      const ps = idx.map(([a, b]) => (P[a] as V3[])[b] as V3) as [V3, V3, V3, V3];
      const ns = idx.map(([a, b]) => (N[a] as V3[])[b] as V3) as [V3, V3, V3, V3];
      const nAvg = unit(ns.reduce((a, n) => add(a, n), [0, 0, 0] as V3));
      const c = mean(ps);
      const onNose = car.cab !== null && r1.s <= ASSUMED.noseLength + 1e-9;
      if (Math.abs(nAvg[0]) >= 0.55) {
        // the side: the livery texture, projected along x
        shell.quad(ps.map(world) as [V3, V3, V3, V3], ns.map(wn) as [V3, V3, V3, V3], null, ps.map((p): UV => [p[2] / L, vUv(p[1])]) as [UV, UV, UV, UV]);
        continue;
      }
      let colour = def.roof;
      if (nAvg[1] < -0.5) colour = def.skirt;
      else if (onNose) {
        const yRel = (c[1] - (r0.bottom + r1.bottom) / 2) / ((r0.top + r1.top) / 2 - (r0.bottom + r1.bottom) / 2);
        if (c[2] < 0.55) colour = yRel < 0.4 ? noseTip : def.noseFront;
        else if (nAvg[1] >= 0.2 && c[2] < 1.0) colour = def.noseBand;
        else if (nAvg[1] >= 0.2 && c[2] < 2.9 && Math.abs(c[0]) < 0.9 * W * ((r0.ws + r1.ws) / 2)) colour = def.glass;
        else if (nAvg[1] < 0.2) colour = def.body;
      }
      detail.quad(ps.map(world) as [V3, V3, V3, V3], ns.map(wn) as [V3, V3, V3, V3], col(colour));
    }
  }
  if (car.cab) {
    // the front of the nose: red below, the warning panel above; a head lamp each side
    const front = (P[0] as V3[]).map(world);
    const r = rings[0] as Ring;
    const yCut = r.bottom + 0.4 * (r.top - r.bottom);
    const cap = (poly: V3[], colour: number): void => {
      if (poly.length < 3) return;
      const c0 = mean(poly);
      const n: V3 = [0, 0, -dir];
      for (let k = 0; k < poly.length; k++) detail.tri([c0, poly[k] as V3, poly[(k + 1) % poly.length] as V3], [n, n, n], col(colour));
    };
    cap(clipY(front, yCut, false), noseTip);
    cap(clipY(front, yCut, true), def.noseFront);
    for (const sx of [-1, 1]) detail.box(sx * 0.4 - 0.1, sx * 0.4 + 0.1, 1.35, 1.47, Math.min(Z(0), Z(0.02)), Math.max(Z(0), Z(0.02)), col(0xfff3c4));
  }

  // roof covers: grey fairings along the roof, split in short runs, left off over the pantograph
  const carFrom = car.cab === 'front' ? car.start + ASSUMED.noseLength + 0.4 : car.start + 0.6;
  const carTo = car.cab === 'rear' ? car.end - ASSUMED.noseLength - 0.4 : car.end - 0.6;
  const runs = Math.max(1, Math.ceil((carTo - carFrom) / 7.5));
  const gap = 0.8;
  const runLen = (carTo - carFrom - gap * (runs - 1)) / runs;
  let covers: [number, number][] = [];
  for (let k = 0; k < runs; k++) covers.push([carFrom + k * (runLen + gap), carFrom + k * (runLen + gap) + runLen]);
  if (car.pantograph) covers = without(covers, car.pantograph[0] - 0.35, car.pantograph[1] + 0.35);
  const coverColour = col(0xb4b8be);
  for (const [z0, z1] of covers) {
    if (z1 - z0 < 0.8) continue;
    const yb = ROOF_EDGE - 0.04;
    const yt = roofHeight();
    const bw = 0.85;
    const tw = 0.62;
    const ez = 0.3;
    const lo: V3[] = [[-bw, yb, z0], [bw, yb, z0], [bw, yb, z1], [-bw, yb, z1]];
    const hi: V3[] = [[-tw, yt, z0 + ez], [tw, yt, z0 + ez], [tw, yt, z1 - ez], [-tw, yt, z1 - ez]];
    const centre = mean([...lo, ...hi]);
    const f = (a: V3, b: V3, c: V3, d: V3): void => detail.face([a, b, c, d], centre, coverColour);
    f(hi[0] as V3, hi[1] as V3, hi[2] as V3, hi[3] as V3);
    for (let k = 0; k < 4; k++) f(lo[k] as V3, lo[(k + 1) % 4] as V3, hi[(k + 1) % 4] as V3, hi[k] as V3);
  }

  // skirts between the bogie cut-outs, and the dark underframe seen through the cut-outs
  const noseZone: [number, number] | null = car.cab === 'front' ? [car.start, car.start + ASSUMED.noseLength] : car.cab === 'rear' ? [car.end - ASSUMED.noseLength, car.end] : null;
  let free: [number, number][] = [[car.start + 0.25, car.end - 0.25]];
  if (noseZone) free = without(free, noseZone[0], noseZone[1]);
  const underframe = free.map((s) => [...s] as [number, number]);
  for (const z of car.bogies) free = without(free, z - ASSUMED.bogieCutout, z + ASSUMED.bogieCutout);
  for (const [z0, z1] of underframe) detail.box(-0.95, 0.95, 0.62, FLOOR + 0.05, z0, z1, col(def.skirt), '+y');
  for (const [z0, z1] of free) for (const sx of [-1, 1]) detail.box(sx > 0 ? W - 0.06 : -(W - 0.03), sx > 0 ? W - 0.03 : -(W - 0.06), ASSUMED.skirtBottom, FLOOR + 0.1, z0, z1, col(def.skirt));

  // doors: a dark frame, the leaf, and a window in the leaf; one marker per leaf
  const half = BW / 2;
  const frameC = col(0x24272b);
  const leafC = col(def.door);
  const paneC = col(def.window);
  plan.doors.forEach((s, di) => {
    const z = Z(s);
    for (const sx of [-1, 1]) {
      const dw = ASSUMED.doorWidth;
      const side = sx > 0 ? 'right' : 'left';
      const x = (a: number): number => sx * a;
      const lo = (a: number, b: number): [number, number] => [Math.min(x(a), x(b)), Math.max(x(a), x(b))];
      const [fx0, fx1] = lo(W - 0.005, half - DOOR_RELIEF / 2);
      detail.box(fx0, fx1, 1.1, 2.9, z - dw / 2 - 0.05, z + dw / 2 + 0.05, frameC);
      const [lx0, lx1] = lo(W - 0.005, half - 0.004);
      detail.box(lx0, lx1, 1.15, 2.86, z - dw / 2, z + dw / 2, leafC);
      const [px0, px1] = lo(W - 0.005, half);
      detail.box(px0, px1, 1.95, 2.65, z - 0.27, z + 0.27, paneC);
      const marker = new THREE.Object3D();
      marker.name = 'door';
      marker.position.set(x(half), (1.15 + 2.86) / 2, z);
      marker.userData = { side, index: di, width: dw, height: 2.86 - 1.15 };
      group.add(marker);
    }
  });

  const shellMesh = new THREE.Mesh(shell.build(), shellMaterial(livery, car.cab ? 'driving' : 'mid', plan));
  shellMesh.name = 'body-shell';
  const detailMesh = new THREE.Mesh(detail.build(), plain());
  detailMesh.name = 'body-detail';
  group.add(shellMesh, detailMesh);

  car.bogies.forEach((z, k) => {
    const b = buildBogie();
    b.name = `bogie-${car.index}-${k}`;
    b.position.set(0, 0, z);
    group.add(b);
  });
  if (car.pantograph) {
    const p = buildPantograph();
    p.position.set(0, ROOF_EDGE, (car.pantograph[0] + car.pantograph[1]) / 2);
    group.add(p);
  }
  return group;
}

// --- bogie and pantograph ----------------------------------------------------------------------

let bogieGeometry: THREE.BufferGeometry | null = null;

/** A bogie centred on the rail head: four wheels, axles, motors, side frames and air springs. The geometry is shared by every bogie. */
function buildBogie(): THREE.Group {
  const radius = FIGURES.wheelDiameter.value / 2;
  const wb = FIGURES.bogieWheelbase.value;
  const track = FIGURES.gauge.value;
  const group = new THREE.Group();
  const spots: V3[] = [];
  for (const az of [-wb / 2, wb / 2]) for (const sx of [-1, 1]) spots.push([(sx * track) / 2, radius, az]);
  for (const p of spots) {
    const w = new THREE.Object3D();
    w.name = 'wheel';
    w.position.set(p[0], p[1], p[2]);
    w.userData = { radius, width: ASSUMED.wheelWidth };
    group.add(w);
  }
  if (!bogieGeometry) {
    const soup = new Soup();
    const steel = col(0x70757d);
    const dark = col(0x2a2d32);
    const motor = col(0x3d4147);
    const toX = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
    for (const w of group.children) {
      // 20 segments: a multiple of four puts a vertex at the bottom, so the tread touches y = 0 exactly
      const wheel = new THREE.CylinderGeometry(radius, radius, ASSUMED.wheelWidth, 20, 1);
      soup.geometry(wheel, new THREE.Matrix4().makeTranslation(w.position.x, w.position.y, w.position.z).multiply(toX), steel);
      wheel.dispose();
    }
    for (const az of [-wb / 2, wb / 2]) {
      const axle = new THREE.CylinderGeometry(0.065, 0.065, track, 10, 1);
      soup.geometry(axle, new THREE.Matrix4().makeTranslation(0, radius, az).multiply(toX), dark);
      axle.dispose();
      soup.box(-0.34, 0.34, 0.3, 0.64, az - 0.28, az + 0.28, motor);
    }
    for (const sx of [-1, 1]) {
      const x0 = Math.min(sx * 0.88, sx * 1.02);
      const x1 = Math.max(sx * 0.88, sx * 1.02);
      soup.box(x0, x1, 0.52, 0.78, -1.5, 1.5, dark);
      const spring = new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10, 1);
      for (const z of [-0.8, 0.8]) soup.geometry(spring, new THREE.Matrix4().makeTranslation(sx * 0.95, 0.88, z), motor);
      spring.dispose();
    }
    for (const z of [-0.5, 0.5]) soup.box(-1.0, 1.0, 0.55, 0.75, z - 0.1, z + 0.1, dark);
    bogieGeometry = soup.build();
  }
  const mesh = new THREE.Mesh(bogieGeometry, plain());
  mesh.name = 'bogie-mesh';
  group.add(mesh);
  return group;
}

/** A single-arm pantograph, folded: base frame on four insulators, the arms lying down, the collector head on top. */
function buildPantograph(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pantograph';
  const len = FIGURES.pantographLength.value;
  const top = FIGURES.pantographFoldedHeight.value;
  const soup = new Soup();
  const frame = col(0x2d3035);
  const head = col(0x8a8f96);
  for (const sx of [-1, 1]) {
    soup.box(sx * 0.55 - 0.06, sx * 0.55 + 0.06, 0.08, 0.14, -len / 2, len / 2, frame);
    for (const z of [-len / 2 + 0.15, len / 2 - 0.15]) soup.box(sx * 0.55 - 0.05, sx * 0.55 + 0.05, -0.02, 0.08, z - 0.05, z + 0.05, col(0xd8d2c4));
  }
  soup.box(-0.55, 0.55, 0.08, 0.14, -0.06, 0.06, frame);
  // lower arm up from the rear of the base to the knee, upper arm folded back to the head
  const knee = top - 0.045;
  soup.bar([0.14, 0.9], [knee, -0.1], 0.1, 0.07, frame);
  soup.bar([knee, -0.1], [top - 0.1, 0.72], 0.08, 0.06, frame);
  soup.box(-0.8, 0.8, top - 0.07, top, 0.64, 0.82, head);
  const mesh = new THREE.Mesh(soup.build(), plain());
  mesh.name = 'pantograph-mesh';
  group.add(mesh);
  return group;
}

// --- the train ---------------------------------------------------------------------------------

export function buildTrain(kind: TrainKind): THREE.Group {
  const layout = trainLayout(kind);
  const livery = layout.spec.livery;
  const def = LIVERIES[livery];
  const root = new THREE.Group();
  root.name = `train-${kind}`;
  root.userData = { kind, length: layout.length, cars: layout.cars.length };
  for (const car of layout.cars) root.add(buildCar(car, def, livery));
  return root;
}

/** Stand a built train nose-in at a buffer stop, body along the shed's tracks to the north. Returns the nose in world metres. */
export function standTrain(group: THREE.Group, shed: Pick<ShedLayout, 'heading'>, stop: { x: number; z: number }, noseGap: number): [number, number, number] {
  const pose = standingTrainPose(shed, stop, noseGap);
  group.position.set(pose.nose[0], 0, pose.nose[1]);
  group.rotation.y = pose.rotationY;
  group.updateMatrixWorld(true);
  return [pose.nose[0], 0, pose.nose[1]];
}
