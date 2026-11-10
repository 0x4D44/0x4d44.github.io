// The ScotRail DMUs' own bogies: the BREL P4/T4 under the Class 158 and the Bombardier B5000 under the Class 170 Turbostar.
//
// The wheels, axles, brake discs and the diesel final drive are the shared builder's (train-parts bogieParts), which draws them the same for
// every outside-frame bogie. What the photographs show differently is the frame and its springs, and those are drawn here:
//  - the P4 (refs bogie-158-a2, bogie-158-g300, bogie-158-spm: 158890 and 158959 lifted on road trailers, 158798 on the ground): a black,
//    deep-middled side beam; a big exposed coil spring standing on each axle box under the beam's end; a large air bag on the middle of the
//    beam; and a vertical damper on the beam's face;
//  - the B5000 (ref bogie-170-tyt: a Class 170 side-on at Tyseley): a grimy brown-grey side beam that rises in a rounded hump over each axle
//    box and runs low through the middle; at each axle box a pair of inclined rubber blocks between the box and the hump; the air spring on the
//    low middle.
// The shapes follow the photographs; every size is ASSUMED (none is published in the sources read), and so is that the B5000's blocks are its
// primary springs (chevron rubber springs; the photograph shows a dark wedge either side of each box).
//
// Like the shared builder's, a bogie is four `wheel` markers and a THREE.LOD `bogie-lod` of two shared meshes named `bogie-mesh` (near, and bare
// beyond BOGIE_LOD_DISTANCE), so a disposer that spares the shared bogie geometry spares these too. No part is more than BOGIE_HALF_WIDTH from the
// centre line or above BOGIE_TOP.
import * as THREE from 'three';
import { col, plain, Soup } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import { BOGIE_LOD_DISTANCE, BOGIE_TOP, bogieFarSoup, bogieParts, FLANGE_HEIGHT, WHEEL_WIDTH } from './train-parts.ts';

export type DmuBogieStyle = 'brel-p4' | 'b5000';

export interface DmuBogieSpec {
  radius: number;
  wheelbase: number;
  track: number;
  motor: boolean;
  style: DmuBogieStyle;
}

/** The frame's colours: the P4's is black (bogie-158-a2), the B5000's a grimy brown-grey (bogie-170-tyt). */
export const DMU_BOGIE_COLOURS: Readonly<Record<DmuBogieStyle, { frame: number; box: number; spring: number; coil: number; rubber: number; damper: number }>> = {
  'brel-p4': { frame: 0x1f2022, box: 0x2b2c2f, spring: 0x3c3d40, coil: 0x18191b, rubber: 0x141516, damper: 0x2f3033 },
  b5000: { frame: 0x4b4640, box: 0x3d3934, spring: 0x4f4a44, coil: 0x2a2724, rubber: 0x1b1a19, damper: 0x34312d },
};

/** The side beam's x span (both styles: outboard of the wheels, as the shared outside frames). */
export const DMU_BEAM_X = [0.975, 1.065] as const;

/** The P4's primary spring on each axle box: centre x, radius, and its top (over the axle line), where the beam's end rests. */
export const P4_SPRING = { x: 1.02, radius: 0.1, top: 0.36 } as const;
/** The air spring on the middle of each beam: centre x and radius. */
export const DMU_AIR_SPRING: Readonly<Record<DmuBogieStyle, { x: number; radius: number }>> = {
  'brel-p4': { x: 0.95, radius: 0.19 },
  b5000: { x: 0.97, radius: 0.16 },
};

/**
 * The side beam as stations along the bogie from its middle out to one end (mirrored for the other end): at each, the beam's bottom and top
 * over the axle line (r). Between stations the beam's edges are straight.
 */
export function dmuBeamStations(style: DmuBogieStyle, w: number): { z: number; bottom: number; top: number }[] {
  if (style === 'brel-p4') {
    // deep in the middle, rising over the spring at each end; the end rests on the spring's top
    return [
      { z: 0, bottom: -0.1, top: 0.3 },
      { z: 0.55, bottom: -0.1, top: 0.3 },
      { z: w - 0.25, bottom: P4_SPRING.top, top: 0.48 },
      { z: w + 0.3, bottom: P4_SPRING.top, top: 0.48 },
    ];
  }
  // low through the middle, a rounded hump over each axle box
  return [
    { z: 0, bottom: -0.12, top: 0.26 },
    { z: 0.5, bottom: -0.12, top: 0.26 },
    { z: w - 0.42, bottom: 0.14, top: 0.44 },
    { z: w - 0.2, bottom: 0.16, top: 0.5 },
    { z: w + 0.2, bottom: 0.16, top: 0.5 },
    { z: w + 0.34, bottom: 0.22, top: 0.38 },
  ];
}

/** The beam's bottom and top at `z` along the bogie (either side of the middle), over the axle line. */
export function dmuBeamAt(style: DmuBogieStyle, w: number, z: number): { bottom: number; top: number } | null {
  const st = dmuBeamStations(style, w);
  const a = Math.abs(z);
  for (let k = 0; k + 1 < st.length; k++) {
    const p = st[k] as { z: number; bottom: number; top: number };
    const q = st[k + 1] as { z: number; bottom: number; top: number };
    if (a < p.z || a > q.z) continue;
    const t = q.z === p.z ? 0 : (a - p.z) / (q.z - p.z);
    return { bottom: p.bottom + t * (q.bottom - p.bottom), top: p.top + t * (q.top - p.top) };
  }
  return null;
}

const xsOf = (sx: number, a: number, b: number): [number, number] => (sx > 0 ? [a, b] : [-b, -a]);

/** One side beam: the outer face, the inner face, the top and bottom of each stretch between stations, and the two end faces. */
function beam(soup: Soup, sx: 1 | -1, r: number, st: { z: number; bottom: number; top: number }[], c: THREE.Color): void {
  const [x0, x1] = xsOf(sx, DMU_BEAM_X[0], DMU_BEAM_X[1]);
  // the full run from the one end to the other
  const run = [...[...st].reverse().map((p) => ({ ...p, z: -p.z })), ...st.slice(1)].filter((p, k, a) => k === 0 || Math.abs(p.z - (a[k - 1] as { z: number }).z) > 1e-9);
  for (let k = 0; k + 1 < run.length; k++) {
    const p = run[k] as { z: number; bottom: number; top: number };
    const q = run[k + 1] as { z: number; bottom: number; top: number };
    for (const [x, nx] of [[x1, 1], [x0, -1]] as const) {
      const n: V3 = [nx, 0, 0];
      soup.quad([[x, r + p.bottom, p.z], [x, r + q.bottom, q.z], [x, r + q.top, q.z], [x, r + p.top, p.z]], [n, n, n, n], c);
    }
    // top and bottom, each facing away from the beam
    const up = new THREE.Vector3(0, q.z - p.z, -(q.top - p.top)).normalize();
    const nu: V3 = [0, up.y, up.z];
    soup.quad([[x0, r + p.top, p.z], [x1, r + p.top, p.z], [x1, r + q.top, q.z], [x0, r + q.top, q.z]], [nu, nu, nu, nu], c);
    const dn = new THREE.Vector3(0, -(q.z - p.z), q.bottom - p.bottom).normalize();
    const nd: V3 = [0, dn.y, dn.z];
    soup.quad([[x0, r + p.bottom, p.z], [x1, r + p.bottom, p.z], [x1, r + q.bottom, q.z], [x0, r + q.bottom, q.z]], [nd, nd, nd, nd], c);
  }
  for (const end of [run[0], run[run.length - 1]] as { z: number; bottom: number; top: number }[]) {
    const n: V3 = [0, 0, Math.sign(end.z)];
    soup.quad([[x0, r + end.bottom, end.z], [x1, r + end.bottom, end.z], [x1, r + end.top, end.z], [x0, r + end.top, end.z]], [n, n, n, n], c);
  }
}

/** An upright drum (an air spring, a coil's core or wrap) from y0 to y1 at (x, z), capped at both ends. */
function drumY(soup: Soup, x: number, z: number, y0: number, y1: number, radius: number, c: THREE.Color, sides = 12): void {
  const g = new THREE.CylinderGeometry(radius, radius, y1 - y0, sides, 1, false);
  soup.geometry(g, new THREE.Matrix4().makeTranslation(x, (y0 + y1) / 2, z), c);
  g.dispose();
}

/** A rod along z (a damper lying along the bogie) or along y (one standing up), `radius` round. */
function rod(soup: Soup, a: V3, b: V3, radius: number, c: THREE.Color): void {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = new THREE.CylinderGeometry(radius, radius, d.length(), 8, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1));
  soup.geometry(g, m, c);
  g.dispose();
}

/** The frame and springs of one style: the two side beams, the transom, the axle boxes and what stands on them, the air springs and dampers. */
export function dmuFrameSoup(spec: Pick<DmuBogieSpec, 'radius' | 'wheelbase' | 'style'>): Soup {
  const soup = new Soup();
  const r = spec.radius;
  const w = spec.wheelbase / 2;
  const k = DMU_BOGIE_COLOURS[spec.style];
  const st = dmuBeamStations(spec.style, w);
  const mid = (st[0] as { top: number }).top;
  const air = DMU_AIR_SPRING[spec.style];
  for (const sx of [-1, 1] as const) {
    beam(soup, sx, r, st, col(k.frame));
    // the air spring on the middle of the beam, up to the body's underside
    drumY(soup, sx * air.x, 0, r + mid, BOGIE_TOP - 0.005, air.radius, col(k.rubber), 14);
    for (const az of [-w, w]) {
      // the axle box and its end cap
      const [ax0, ax1] = xsOf(sx, 0.955, 1.085);
      soup.box(ax0, ax1, r - 0.13, r + 0.11, az - 0.125, az + 0.125, col(k.box));
      const [cx0, cx1] = xsOf(sx, 1.085, 1.11);
      soup.box(cx0, cx1, r - 0.06, r + 0.06, az - 0.06, az + 0.06, col(k.spring));
      if (spec.style === 'brel-p4') {
        // the big primary coil on the box, the beam's end resting on it: a dark core with three lighter wraps (bogie-158-a2)
        const s = P4_SPRING;
        drumY(soup, sx * s.x, az, r + 0.11, r + s.top, s.radius, col(k.coil));
        for (const f of [0.15, 0.45, 0.75]) drumY(soup, sx * s.x, az, r + 0.11 + f * (s.top - 0.11), r + 0.11 + (f + 0.13) * (s.top - 0.11), s.radius * 1.18, col(k.spring));
      } else {
        // the B5000's inclined rubber blocks either side of the box, from the box's lower half up to the hump (bogie-170-tyt)
        const [bx0, bx1] = xsOf(sx, 0.965, 1.075);
        for (const zs of [-1, 1]) {
          const outline: [number, number][] = [
            [az + zs * 0.125, r - 0.06],
            [az + zs * 0.2, r - 0.06],
            [az + zs * 0.27, r + 0.15],
            [az + zs * 0.125, r + 0.15],
          ];
          soup.prismX(outline, sx > 0 ? bx0 : bx1, sx > 0 ? bx1 : bx0, col(k.rubber));
        }
      }
    }
    if (spec.style === 'brel-p4') {
      // the vertical damper on the beam's face, beside the air spring (bogie-158-a2: the upright bracket by the middle)
      for (const z of [-0.42, 0.42]) rod(soup, [sx * 1.1, r - 0.05, z], [sx * 1.1, r + 0.3, z], 0.035, col(k.damper));
    }
  }
  // the transom between the beams, under the middle's top
  soup.box(-0.975, 0.975, r + mid - 0.24, r + mid - 0.04, -0.1, 0.1, col(k.box));
  return soup;
}

function append(into: Soup, from: Soup): void {
  into.pos.push(...from.pos);
  into.nrm.push(...from.nrm);
  into.clr.push(...from.clr);
  into.glow.push(...from.glow);
}

/** The full bogie: the shared wheels, axles, brakes and (on a driven bogie) the final drive, with this style's frame and springs. */
export function dmuBogieSoup(spec: DmuBogieSpec): Soup {
  const shared = bogieParts({ radius: spec.radius, wheelbase: spec.wheelbase, track: spec.track, motor: spec.motor, diesel: true, style: 'alstom' });
  const soup = new Soup();
  for (const part of [shared.wheels, shared.axles, shared.brakes, shared.drive]) append(soup, part);
  append(soup, dmuFrameSoup(spec));
  return soup;
}

/** The bare bogie: the shared far level (twelve-sided wheels, a slab for each side frame and the transom), its frame recoloured to this style's. */
export function dmuBogieFarSoup(spec: Pick<DmuBogieSpec, 'radius' | 'wheelbase' | 'track' | 'style'>): Soup {
  const soup = bogieFarSoup({ radius: spec.radius, wheelbase: spec.wheelbase, track: spec.track, style: 'alstom' });
  // the shared far level paints its slabs in the Alstom frame's and box's colours; nothing else in it is those colours
  const from = [col(0x66625a), col(0x55514a)];
  const to = col(DMU_BOGIE_COLOURS[spec.style].frame);
  for (let i = 0; i < soup.clr.length; i += 3) {
    if (from.some((c) => Math.abs((soup.clr[i] as number) - c.r) < 1e-6 && Math.abs((soup.clr[i + 1] as number) - c.g) < 1e-6 && Math.abs((soup.clr[i + 2] as number) - c.b) < 1e-6)) {
      soup.clr[i] = to.r;
      soup.clr[i + 1] = to.g;
      soup.clr[i + 2] = to.b;
    }
  }
  return soup;
}

const cache = new Map<string, THREE.BufferGeometry>();
const cached = (key: string, make: () => Soup): THREE.BufferGeometry => {
  let g = cache.get(key);
  if (!g) {
    g = make().build();
    cache.set(key, g);
  }
  return g;
};

/** One DMU bogie, built as the shared builder builds its own (see the head of this file). */
export function buildDmuBogie(spec: DmuBogieSpec): THREE.Group {
  const group = new THREE.Group();
  for (const az of [-spec.wheelbase / 2, spec.wheelbase / 2]) {
    for (const sx of [-1, 1]) {
      const m = new THREE.Object3D();
      m.name = 'wheel';
      m.position.set((sx * spec.track) / 2, spec.radius, az);
      m.userData = { radius: spec.radius, width: WHEEL_WIDTH, flange: FLANGE_HEIGHT };
      group.add(m);
    }
  }
  const key = `${spec.style}/${spec.radius}/${spec.wheelbase}/${spec.track}`;
  const near = new THREE.Mesh(cached(`${key}/${spec.motor}`, () => dmuBogieSoup(spec)), plain());
  near.name = 'bogie-mesh';
  near.userData = { lod: 'near', style: spec.style };
  const far = new THREE.Mesh(cached(`${key}/far`, () => dmuBogieFarSoup(spec)), plain());
  far.name = 'bogie-mesh';
  far.userData = { lod: 'far', style: spec.style };
  far.visible = false;
  const lod = new THREE.LOD();
  lod.name = 'bogie-lod';
  lod.addLevel(near, 0);
  // (the page may move the switch distance, as train-parts' own reads it)
  const o = (globalThis as { __kxBogieLodDistance?: unknown }).__kxBogieLodDistance;
  lod.addLevel(far, typeof o === 'number' && o >= 0 ? o : BOGIE_LOD_DISTANCE);
  group.add(lod);
  return group;
}
