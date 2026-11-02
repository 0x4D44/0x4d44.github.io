// Parked cars and taxis, motorbikes, a buseta, bicycles, vendor carts and kerbside rubbish. Hand-built from boxes, frustums and tubes
// (a few dozen triangles each); poses follow the street gradient. Groups props.vehicles.<i>.<j>. Colliders are oriented rectangles.
import { tube, quadOut } from './mk.js';
import { OCC } from './occupancy.js';
import { pointAt, project } from './geom.js';
import { vehicleMatrix, lookHash } from './vehicle-library.js';
import { buildParkedLibrary } from './vehicle-placement.js';

/** footprints [width, length] of the placed things, the one source for their colliders and for the arrival-view test */
export const SIZE = { car: [1.75, 3.9], buseta: [2.2, 7.5], moto: [0.62, 1.95], bike: [0.5, 1.7], cart: [1.5, 0.9], bin: [0.5, 0.6] };

const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const TYRE = [0.07, 0.07, 0.08], CHROME = [0.78, 0.8, 0.82], BLACK = [0.1, 0.1, 0.11], WHITE = [1, 1, 1], PLATE = [0.96, 0.8, 0.12];
const shade = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

/** The motorbike's dual seat as lofted sections (rear to front reads z falling): the one source for its geometry and for the spot a parked helmet rests on. */
const MOTO_SEAT = [
  { z: -0.06, y0: 0.8, y1: 0.89, hw: 0.075 }, { z: -0.22, y0: 0.79, y1: 0.905, hw: 0.115 }, { z: -0.55, y0: 0.8, y1: 0.92, hw: 0.115 }, { z: -0.78, y0: 0.82, y1: 0.935, hw: 0.085 }, { z: -0.9, y0: 0.84, y1: 0.935, hw: 0.06 },
];
/** Where a helmet rests: the centre of the seat's long top face (sections 1 and 2) and that face's tilt, since the seat rises toward the tail (local frame, +z = front). */
export const MOTO_SEAT_REST = (() => {
  const a = MOTO_SEAT[1], c = MOTO_SEAT[2];
  return { y: (a.y1 + c.y1) / 2, z: (a.z + c.z) / 2, tilt: Math.atan2(c.y1 - a.y1, a.z - c.z) };
})();

/** Loft along z (rear -> front) through rectangular sections {z,y0,y1,hw}: a car body, a tank, a roof. Bottoms are left open. */
function loft(b, mat, S, col, caps = true) {
  const P = (s, sx, top) => [sx * s.hw, top ? s.y1 : s.y0, s.z];
  const cen = [0, S.reduce((m, s) => m + (s.y0 + s.y1) / 2, 0) / S.length, (S[0].z + S[S.length - 1].z) / 2], o = { col };
  for (let i = 0; i + 1 < S.length; i++) {
    const a = S[i], c = S[i + 1];
    quadOut(b, mat, P(a, -1, true), P(c, -1, true), P(c, 1, true), P(a, 1, true), cen, o);
    quadOut(b, mat, P(a, 1, false), P(a, 1, true), P(c, 1, true), P(c, 1, false), cen, o);
    quadOut(b, mat, P(a, -1, false), P(a, -1, true), P(c, -1, true), P(c, -1, false), cen, o);
  }
  if (caps) for (const s of [S[0], S[S.length - 1]]) quadOut(b, mat, P(s, -1, false), P(s, 1, false), P(s, 1, true), P(s, -1, true), cen, o);
}

/** Run fn with the builder posed at (x,y,z) yaw ry pitch (rotation about local x, nose up positive). Local frame: +z = front, +x = right, y up. */
function posed(K, b, x, y, z, ry, pitch, fn) {
  const T = K.ctx.THREE, m = new T.Matrix4().makeRotationFromEuler(new T.Euler(-pitch, ry, 0, 'YXZ')).setPosition(x, y, z);
  b.setBase(m); fn(); b.setBase(new T.Matrix4());
  return m;
}

/** Box with the top face narrower and shifted: a car's greenhouse. z0 = [back,front] at the bottom, z1 at the top, half widths w0/w1. */
function frustum(b, mat, y0, y1, z0, z1, w0, w1, col, skipBottom = true) {
  const A = [[-w0, y0, z0[0]], [w0, y0, z0[0]], [w0, y0, z0[1]], [-w0, y0, z0[1]]], B = [[-w1, y1, z1[0]], [w1, y1, z1[0]], [w1, y1, z1[1]], [-w1, y1, z1[1]]];
  const o = { col };
  b.quad(mat, A[3], A[2], B[2], B[3], o);     // front (+z)
  b.quad(mat, A[1], A[0], B[0], B[1], o);     // back
  b.quad(mat, A[2], A[1], B[1], B[2], o);     // right (+x)
  b.quad(mat, A[0], A[3], B[3], B[0], o);     // left
  b.quad(mat, B[3], B[2], B[1], B[0], o);     // top
  if (!skipBottom) b.quad(mat, A[0], A[1], A[2], A[3], o);
}

/**
 * A wheel with its axle along x through (x,y,z): a rounded tyre (five rings make the barrel, so it is no longer a flat disc), flat sidewalls, and either a hub cap
 * (cars, carts, bins) or `o.spokes`: a chrome rim ring, a hub and crossed spokes on both faces (motorbikes, bicycles; R1-012 "motorbikes flat slabs with disc wheels").
 */
function wheel(b, x, y, z, r, w, o = {}) {
  const h = w / 2, seg = r > 0.2 ? 16 : 10, ring = [[-h, 0.86], [-h * 0.5, 0.975], [0, 1], [h * 0.5, 0.975], [h, 0.86]];
  for (let i = 0; i + 1 < ring.length; i++) tube(b, 'tyre', [x + ring[i][0], y, z], [x + ring[i + 1][0], y, z], r * ring[i][1], r * ring[i + 1][1], seg, { col: TYRE, caps: i === 0 || i === ring.length - 2 });
  if (!o.spokes) { tube(b, 'chrome', [x - h - 0.005, y, z], [x + h + 0.005, y, z], r * 0.58, r * 0.58, 8, { col: CHROME, caps: true }); return; }
  const rim = r * 0.62, hub = Math.min(0.05, r * 0.16), n = r > 0.25 ? 10 : 8;
  tube(b, 'chrome', [x - h - 0.014, y, z], [x + h + 0.014, y, z], hub, hub, 8, { col: CHROME, caps: true });                    // the hub
  for (const s of [-1, 1]) {
    const xs = x + s * (h + 0.004);
    tube(b, 'chrome', [xs, y, z], [xs + s * 0.005, y, z], rim, rim * 0.9, seg, { col: CHROME, caps: false });                     // the rim: a bright ring on the black sidewall
    for (let i = 0; i < n; i++) {                                                                                                  // crossed spokes, hub flange to rim, each one leaning a little the other way
      const a = (i / n) * Math.PI * 2, c = (i % 2 ? 1 : -1) * 0.22, p = [xs + s * 0.006, y + Math.cos(a) * hub, z + Math.sin(a) * hub], q = [xs + s * 0.006, y + Math.cos(a + c) * rim * 0.96, z + Math.sin(a + c) * rim * 0.96];
      tube(b, 'chrome', p, q, 0.0035, 0.0035, 3, { col: CHROME, caps: false });
    }
  }
}

/** A mudguard: a strip 2*hw wide arching over a wheel (axle height y, at z) at radius R from angle a0 to a1 (0 = straight up, positive = toward the front). */
function mudguard(b, y, z, R, hw, a0, a1, col, n = 6) {
  const P = (a, sx) => [sx * hw, y + Math.cos(a) * R, z + Math.sin(a) * R], c = [0, y, z];
  for (let i = 0; i < n; i++) { const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n; quadOut(b, 'car_paint', P(t0, -1), P(t1, -1), P(t1, 1), P(t0, 1), c, { col }); }
}

// ---------------------------------------------------------------------------------------------------- roof racks and taxis (R1-103: "add a few more variations")
/**
 * The flat top of each parked design in its own frame (+z = front): the height of the roof, where it runs (z0 at the back, z1 at the front) and half its width. The two hatchbacks are measured on the
 * models (tests/world-vehicles-variety.test.mjs measures them again, so a re-exported model fails there and not as a rack hung in the air); `procedural` is the box roof of the car drawn without the library.
 */
export const ROOF = {
  vehicle_hatchback_a: { y: 1.5, z0: -0.85, z1: 0.27, hw: 0.7 },
  vehicle_hatchback_b: { y: 1.55, z0: -1.3, z1: 0.27, hw: 0.7 },
  procedural: { y: 1.49, z0: -0.61, z1: 0.29, hw: 0.7 },
};
export const RACK_LOADS = ['bare', 'bundle', 'ladder', 'planks'];
/** The share of the cars along a road that wear a roof rack (per cent), before a road short of racks is made up. */
export const RACK_SHARE = 42;
/** A road of cars has at least this many taxis and racked cars: the dice may leave it short, so the last cars of the road are made up. */
export const ROAD_MIN = { taxis: 2, racks: 2 };
const TARPS = [[0.02, 0.08, 0.22], [0.03, 0.12, 0.05], [0.42, 0.16, 0.03], [0.2, 0.2, 0.19]];
const WOOD = [0.5, 0.34, 0.2], ROPE = [0.55, 0.45, 0.22], ZINC = [0.62, 0.64, 0.66], IRON = [0.05, 0.05, 0.055];

/**
 * Whether the car at (x, z) wears a roof rack, and which: from its place alone, by the hash its look uses and no random stream, so no car, bike or prop moves. `force` gives it one anyway.
 * `used` holds the loads the road's earlier racks carry: the load is the first, from a hashed start, that none of them has (so while there are fewer racks than loads, no two are alike). A rack that is
 * made up (`force`) always carries something: an empty rack is for the cars that chose one.
 */
export function rackFor(x, z, force = false, used = new Set()) {
  const h = lookHash(x, z, 11);
  if (!force && h % 100 >= RACK_SHARE) return null;
  const pool = force ? RACK_LOADS.filter((l) => l !== 'bare') : RACK_LOADS, start = (h >>> 8) % pool.length;
  const load = pool.map((_, i) => pool[(start + i) % pool.length]).find((l) => !used.has(l)) ?? pool[start];
  return { load, tarp: (h >>> 12) % TARPS.length, zinc: ((h >>> 16) & 1) === 1 };
}

/**
 * What a car of the road is. `taxi` is the street's own roll, `taxis` and `racks` are what the road has so far (`used`: the loads of its racks) and `remaining` counts this car and those still to come.
 * A road that the dice leave short of ROAD_MIN has its last cars made taxis and the ones before them take racks (a taxi has its sign on the roof, not a load); a roll for one more taxi is not taken
 * when the cars still to come would then be too few for the racks the road still wants.
 */
export function roadRole({ x, z, remaining, taxis, racks, taxi, used }) {
  const needTaxis = Math.max(0, ROAD_MIN.taxis - taxis), needRacks = Math.max(0, ROAD_MIN.racks - racks);
  const isTaxi = remaining <= needTaxis || (taxi && remaining - 1 >= Math.max(0, needTaxis - 1) + needRacks);
  return { taxi: isTaxi, rack: isTaxi ? null : rackFor(x, z, remaining <= needTaxis + needRacks, used) };
}

/** A roof rack in the car's frame: two rails on four feet, cross bars over them, and (by `rack.load`) what is tied on. About a hundred triangles. */
function roofRack(b, roof, rack) {
  const { y, z0, z1 } = roof, zA = z0 + 0.08, zB = z1 - 0.08, len = zB - zA, zc = (zA + zB) / 2, hx = 0.58, bars = len > 1.2 ? 3 : 2, top = y + 0.099;
  const mat = rack.zinc ? 'galvanised' : 'iron_black', col = rack.zinc ? ZINC : IRON, tarp = TARPS[rack.tarp % TARPS.length];
  for (const sx of [-1, 1]) {
    b.box(mat, sx * hx, y + 0.052, zc, 0.04, 0.034, len, { col, skip: ['ny'] });                                                          // a rail along the roof
    for (const z of [zA + 0.04, zB - 0.04]) b.box('bumper', sx * hx, y + 0.017, z, 0.05, 0.034, 0.05, { col: IRON, skip: ['ny'] });    // on its two feet
  }
  for (let i = 0; i < bars; i++) b.box(mat, 0, y + 0.084, zA + 0.07 + (i * (len - 0.14)) / (bars - 1), 1.3, 0.03, 0.04, { col, skip: ['ny'] });   // the cross bars over the rails
  if (rack.load === 'bundle') {                                          // a tarpaulin roll lashed down
    const l = Math.min(len + 0.1, 1.5);
    b.box('bag', 0, top + 0.13, zc, 1.0, 0.26, l, { col: tarp, skip: ['ny'] });
    b.box('bag', 0.08, top + 0.33, zc - 0.05, 0.66, 0.14, l * 0.6, { col: tarp.map((c) => c * 1.25), skip: ['ny'] });
    for (const f of [-0.3, 0.3]) b.box('bag', 0, top + 0.13, zc + f * l, 1.03, 0.28, 0.03, { col: ROPE, skip: ['ny'] });
  } else if (rack.load === 'ladder') {                                   // a builder's ladder, hanging out over the boot
    const r0 = zA - 0.95, r1 = r0 + 2.8, yy = top + 0.018, lx = 0.12, hw = 0.2;
    for (const s of [-1, 1]) tube(b, 'galvanised', [lx + s * hw, yy, r0], [lx + s * hw, yy, r1], 0.018, 0.018, 4, { col: ZINC, caps: false });
    for (let z = r0 + 0.2; z < r1 - 0.1; z += 0.36) tube(b, 'galvanised', [lx - hw, yy, z], [lx + hw, yy, z], 0.011, 0.011, 4, { col: ZINC, caps: false });
  } else if (rack.load === 'planks') {                                   // three boards, one on top, tied with a rope, and longer than the car's roof
    for (const [px, lift, len2, dz] of [[-0.1, 0, 3.0, -0.35], [0.1, 0, 2.7, -0.2], [0, 0.036, 2.5, -0.45]]) b.box('wood_dark', px, top + 0.018 + lift, zc + dz, 0.19, 0.035, len2, { col: WOOD, skip: ['ny'] });
    b.box('bag', 0, top + 0.04, zc - 0.1, 0.5, 0.1, 0.03, { col: ROPE, skip: ['ny'] });
  }
}

// ---------------------------------------------------------------------------------------------------- the vehicles
/** A small hatchback / sedan seen all over Colombia (taxis are yellow). Lofted body, glasshouse with pillars, arches, lamps, yellow plates. `o.rack` ({ load, tarp, zinc }) puts a roof rack on it. */
export function car(K, b, x, y, z, ry, pitch, o) {
  const key = Math.abs(Math.round(x * 13 + z * 7)) % 2 ? 'vehicle_hatchback_a' : 'vehicle_hatchback_b';
  // the rack is its own group and casts no shadow: the parked library's cars cast none either, and a ladder's shadow beside a car without one would look pasted on
  const load = (roof) => { if (o.rack && roof) { const lb = K.b('vehicle-load', x, z, { cast: false }); posed(K, lb, x, y, z, ry, pitch, () => roofRack(lb, roof, o.rack)); } };
  if (K.ctx.vehicleLibrary?.place(key, x, y, z, ry, pitch, o)) {
    const roof = ROOF[key];
    if (o.taxi) posed(K, b, x, y, z, ry, pitch, () => b.box('light_roof', 0, (roof?.y ?? K.ctx.vehicleLibrary.meta(key).size[1]) + .06, -.16, .5, .12, .2, { col: WHITE }));
    load(roof);
    return key;
  }
  const body = rgb(o.hex), dark = shade(body, 0.5), sill = [0.12, 0.12, 0.13];
  posed(K, b, x, y, z, ry, pitch, () => {
    // lower body: rear bumper -> boot -> doors -> scuttle -> bonnet -> nose
    loft(b, 'car_paint', [
      { z: -1.95, y0: 0.42, y1: 0.82, hw: 0.77 }, { z: -1.8, y0: 0.36, y1: 0.97, hw: 0.82 }, { z: -1.1, y0: 0.36, y1: 0.99, hw: 0.84 },
      { z: 0.6, y0: 0.36, y1: 0.97, hw: 0.845 }, { z: 0.82, y0: 0.36, y1: 0.94, hw: 0.84 }, { z: 1.6, y0: 0.36, y1: 0.88, hw: 0.82 }, { z: 1.95, y0: 0.42, y1: 0.68, hw: 0.76 },
    ], body);
    // glasshouse: rear window, side glass, windscreen (dark glass), roof + pillars in body colour
    loft(b, 'glass_dark', [
      { z: -1.18, y0: 0.97, y1: 0.97, hw: 0.76 }, { z: -0.58, y0: 0.97, y1: 1.45, hw: 0.67 }, { z: 0.26, y0: 0.97, y1: 1.45, hw: 0.67 }, { z: 0.8, y0: 0.97, y1: 0.97, hw: 0.77 },
    ], WHITE, false);
    b.box('car_paint', 0, 1.465, -0.16, 1.4, 0.05, 0.9, { col: body });                  // roof
    for (const sx of [-1, 1]) {
      tube(b, 'car_paint', [sx * 0.76, 0.96, 0.78], [sx * 0.67, 1.45, 0.26], 0.028, 0.028, 5, { col: body, caps: false });      // A pillar
      tube(b, 'car_paint', [sx * 0.76, 0.96, -1.16], [sx * 0.67, 1.45, -0.58], 0.04, 0.04, 5, { col: body, caps: false });      // C pillar
      b.box('car_paint', sx * 0.72, 1.2, -0.3, 0.04, 0.5, 0.09, { col: body });                                              // B pillar
      b.box('bumper', sx * 0.85, 0.42, 0, 0.03, 0.1, 2.6, { col: sill });                                                   // sill
      for (const dz of [-0.7, 0.04, 0.58]) b.box('bumper', sx * 0.848, 0.7, dz, 0.012, 0.5, 0.012, { col: sill });          // door seams
      for (const dz of [-0.12, -0.74]) b.box('chrome', sx * 0.855, 0.83, dz, 0.02, 0.025, 0.1, { col: CHROME });            // door handles
      b.box('car_paint', sx * 0.93, 1.03, 0.55, 0.12, 0.08, 0.14, { col: body });                                            // mirrors
      b.box('glass_dark', sx * 0.93, 1.03, 0.62, 0.1, 0.06, 0.012, { col: WHITE });
      // wheel arches: a dark recess behind each wheel and a flare over it
      for (const wz of [1.2, -1.2]) {
        b.box('bumper', sx * 0.845, 0.52, wz, 0.04, 0.6, 0.8, { col: sill });
        b.box('car_paint', sx * 0.862, 0.88, wz, 0.05, 0.07, 0.86, { col: body });
        wheel(b, sx * 0.79, 0.31, wz, 0.31, 0.2);
      }
      b.box('light_head', sx * 0.56, 0.79, 1.93, 0.32, 0.12, 0.05, { col: WHITE });                                          // headlamps
      b.box('light_tail', sx * 0.62, 0.86, -1.93, 0.3, 0.14, 0.05, { col: WHITE });                                          // tail lamps
      b.box('bumper', sx * 0.4, 0.5, 1.96, 0.3, 0.07, 0.04, { col: sill });                                                  // lower intakes
    }
    b.box('bumper', 0, 0.4, 1.95, 1.62, 0.16, 0.1, { col: BLACK }); b.box('bumper', 0, 0.4, -1.95, 1.62, 0.16, 0.1, { col: BLACK });   // bumpers
    b.box('bumper', 0, 0.72, 1.97, 0.55, 0.15, 0.03, { col: sill }); b.box('chrome', 0, 0.8, 1.98, 0.55, 0.02, 0.02, { col: CHROME });   // grille
    b.box('sign_route', 0, 0.48, 1.99, 0.34, 0.15, 0.015, { col: PLATE }); b.box('sign_route', 0, 0.6, -1.99, 0.34, 0.15, 0.015, { col: PLATE });   // yellow plates
    if (o.taxi) { b.box('light_roof', 0, 1.55, -0.16, 0.5, 0.12, 0.2, { col: WHITE }); b.box('bumper', 0, 0.95, -1.99, 0.2, 0.05, 0.01, { col: BLACK }); }
  });
  load(ROOF.procedural);
}

/** A 125-200 cc street bike: frame, tank, two-tone plastics, telescopic fork, bars with mirrors, lamp, exhaust, swingarm. `hex2` = side panels / fender. */
export function moto(K, b, x, y, z, ry, pitch, o) {
  if (K.ctx.vehicleLibrary?.place('vehicle_motorbike', x, y, z, ry, pitch, o)) {
    recordMotoSeat(K, vehicleMatrix(x, y, z, ry, pitch), ry, pitch, K.ctx.vehicleLibrary.meta('vehicle_motorbike').seatRest);
    return 'vehicle_motorbike';
  }
  const c1 = rgb(o.hex), c2 = rgb(o.hex2 ?? 0x1c1c20), steel = [0.55, 0.57, 0.6];
  const pose = posed(K, b, x, y, z, ry, pitch, () => {
    wheel(b, 0, 0.3, 0.66, 0.3, 0.09, { spokes: true }); wheel(b, 0, 0.3, -0.66, 0.3, 0.12, { spokes: true });
    tube(b, 'chrome', [0.056, 0.3, 0.66], [0.06, 0.3, 0.66], 0.115, 0.115, 12, { col: shade(CHROME, 0.9), caps: true });       // brake disc
    tube(b, 'chrome', [-0.074, 0.3, -0.66], [-0.078, 0.3, -0.66], 0.085, 0.085, 12, { col: shade(CHROME, 0.8), caps: true });  // rear sprocket
    // frame + engine
    tube(b, 'bumper', [0, 0.93, 0.42], [0, 0.5, -0.02], 0.03, 0.03, 5, { col: [0.16, 0.16, 0.17], caps: false });            // backbone
    tube(b, 'bumper', [0, 0.5, -0.02], [0, 0.76, -0.55], 0.028, 0.028, 5, { col: [0.16, 0.16, 0.17], caps: false });          // seat rail
    b.box('bumper', 0, 0.38, 0.02, 0.2, 0.26, 0.3, { col: [0.2, 0.2, 0.21] });                                                 // crankcase
    tube(b, 'bumper', [0, 0.48, 0.08], [0, 0.68, 0.2], 0.065, 0.06, 8, { col: [0.22, 0.22, 0.23] });                          // cylinder
    // fork, steering head, bars
    for (const sx of [-1, 1]) {
      tube(b, 'chrome', [sx * 0.07, 0.96, 0.42], [sx * 0.07, 0.62, 0.55], 0.03, 0.03, 6, { col: CHROME, caps: false });
      tube(b, 'bumper', [sx * 0.07, 0.62, 0.55], [sx * 0.07, 0.3, 0.66], 0.022, 0.022, 6, { col: steel, caps: false });
      tube(b, 'bumper', [sx * 0.07, 0.4, -0.12], [sx * 0.07, 0.3, -0.66], 0.025, 0.025, 5, { col: [0.2, 0.2, 0.21], caps: false });   // swingarm
    }
    tube(b, 'chrome', [-0.36, 1.04, 0.4], [0.36, 1.04, 0.4], 0.013, 0.013, 5, { col: CHROME, caps: false });
    for (const sx of [-1, 1]) {
      tube(b, 'seat', [sx * 0.27, 1.04, 0.4], [sx * 0.37, 1.04, 0.4], 0.02, 0.02, 6, { col: BLACK, caps: true });             // grips
      tube(b, 'chrome', [sx * 0.3, 1.04, 0.42], [sx * 0.32, 1.22, 0.38], 0.008, 0.008, 4, { col: CHROME, caps: false });       // mirror stalk
      b.box('glass_dark', sx * 0.32, 1.25, 0.37, 0.11, 0.07, 0.02, { col: WHITE, ry: sx * 0.25 });                              // mirror
      b.box('bumper', sx * 0.3, 1.03, 0.45, 0.012, 0.012, 0.1, { col: BLACK });                                                 // lever
    }
    // headlamp, cluster, front fender
    tube(b, 'car_paint', [0, 0.97, 0.46], [0, 0.97, 0.56], 0.09, 0.085, 10, { col: c1 });
    tube(b, 'light_head', [0, 0.97, 0.561], [0, 0.97, 0.566], 0.075, 0.075, 10, { col: WHITE });
    b.box('bumper', 0, 1.07, 0.35, 0.14, 0.08, 0.08, { col: BLACK });
    mudguard(b, 0.3, 0.66, 0.345, 0.058, -0.35, 1.25, c2);                                                                      // front mudguard, arching over the wheel
    for (const sx of [-1, 1]) tube(b, 'chrome', [sx * 0.058, 0.64, 0.55], [sx * 0.058, 0.62, 0.62], 0.008, 0.008, 4, { col: CHROME, caps: false });   // its stays
    // tank (a tapering teardrop, narrow at the steering head, broad where the knees grip), dual seat rising to the tail, and the two-tone bodywork under it
    loft(b, 'car_paint', [
      { z: 0.43, y0: 0.9, y1: 1.0, hw: 0.05 }, { z: 0.34, y0: 0.84, y1: 1.035, hw: 0.11 }, { z: 0.14, y0: 0.82, y1: 1.02, hw: 0.135 }, { z: -0.08, y0: 0.8, y1: 0.96, hw: 0.115 }, { z: -0.17, y0: 0.8, y1: 0.9, hw: 0.08 },
    ], c1);
    b.box('chrome', 0, 1.04, 0.2, 0.06, 0.012, 0.06, { col: CHROME });                                                           // fuel cap
    loft(b, 'seat', MOTO_SEAT, BLACK);
    loft(b, 'car_paint', [
      { z: -0.1, y0: 0.58, y1: 0.795, hw: 0.1 }, { z: -0.4, y0: 0.56, y1: 0.795, hw: 0.13 }, { z: -0.75, y0: 0.64, y1: 0.815, hw: 0.105 }, { z: -0.93, y0: 0.7, y1: 0.835, hw: 0.075 },
    ], c2);
    for (const sx of [-1, 1]) {
      b.box('bumper', sx * 0.13, 0.55, 0.0, 0.03, 0.18, 0.26, { col: [0.2, 0.2, 0.21] });                                          // the engine side covers
      b.box('chrome', sx * 0.2, 0.3, -0.05, 0.1, 0.02, 0.05, { col: CHROME });                                                   // foot pegs
    }
    b.box('light_tail', 0, 0.78, -0.96, 0.12, 0.06, 0.03, { col: WHITE });
    b.box('bumper', 0, 0.7, -0.98, 0.04, 0.12, 0.03, { col: BLACK });                                                            // plate bracket
    b.box('sign_route', 0, 0.62, -1.0, 0.18, 0.12, 0.012, { col: PLATE });
    for (const sx of [-1, 1]) { b.box('light_head', sx * 0.15, 0.95, 0.5, 0.05, 0.04, 0.05, { col: [1, 0.55, 0.1] }); b.box('light_tail', sx * 0.09, 0.74, -0.98, 0.04, 0.04, 0.04, { col: [1, 0.55, 0.1] }); }   // indicators
    // exhaust, shock, stand
    tube(b, 'chrome', [0.11, 0.33, 0.12], [0.13, 0.27, -0.35], 0.022, 0.022, 6, { col: CHROME, caps: false });
    tube(b, 'chrome', [0.13, 0.28, -0.3], [0.14, 0.4, -0.95], 0.045, 0.042, 8, { col: shade(CHROME, 0.85), caps: true });
    tube(b, 'iron_black', [-0.09, 0.7, -0.45], [-0.09, 0.4, -0.3], 0.018, 0.018, 5, { col: [0.5, 0.1, 0.1], caps: false });
    tube(b, 'bumper', [-0.1, 0.36, -0.05], [-0.3, 0.06, 0.02], 0.014, 0.014, 4, { col: BLACK, caps: false });                   // side stand
  });
  // A later helmet must sit on this exact transformed seat, including pitch and the body's lateral displacement.
  // Shop-front motos are level; kerb motos follow the road. Re-deriving either pose from rounded vehicle-list data floats helmets.
  // `pitch` is the helmet's own (the bike's less the seat's tilt: the dual seat rises to the tail, so a helmet laid flat on the bike would rock on it); `bikePitch` is the bike's.
  recordMotoSeat(K, pose, ry, pitch);
}

function recordMotoSeat(K, pose, ry, pitch, rest = MOTO_SEAT_REST) {
  const seat = new K.ctx.THREE.Vector3(0, rest.y, rest.z).applyMatrix4(pose);
  K.ctx.world ??= {};
  (K.ctx.world.motoSeats ??= []).push({ x: seat.x, y: seat.y, z: seat.z, yaw: ry, pitch: pitch - rest.tilt, bikePitch: pitch });
}

export function bicycle(K, b, x, y, z, ry, pitch, o) {
  if (K.ctx.vehicleLibrary?.place('vehicle_bicycle', x, y, z, ry, pitch, o)) return 'vehicle_bicycle';
  const body = rgb(o.hex);
  posed(K, b, x, y, z, ry, pitch, () => {
    wheel(b, 0, 0.33, 0.55, 0.33, 0.04, { spokes: true }); wheel(b, 0, 0.33, -0.55, 0.33, 0.04, { spokes: true });
    tube(b, 'car_paint', [0, 0.33, -0.55], [0, 0.78, -0.18], 0.02, 0.02, 4, { col: body, caps: false });
    tube(b, 'car_paint', [0, 0.78, -0.18], [0, 0.85, 0.42], 0.02, 0.02, 4, { col: body, caps: false });
    tube(b, 'car_paint', [0, 0.33, 0.55], [0, 0.85, 0.42], 0.02, 0.02, 4, { col: body, caps: false });
    tube(b, 'car_paint', [0, 0.78, -0.18], [0, 0.3, -0.04], 0.02, 0.02, 4, { col: body, caps: false });                       // seat tube
    tube(b, 'car_paint', [0, 0.85, 0.42], [0, 0.3, -0.04], 0.022, 0.022, 4, { col: body, caps: false });                      // down tube
    tube(b, 'car_paint', [0, 0.3, -0.04], [0, 0.33, -0.55], 0.016, 0.016, 4, { col: body, caps: false });                     // chain stay
    tube(b, 'chrome', [0, 0.78, -0.18], [0, 0.9, -0.2], 0.012, 0.012, 4, { col: CHROME, caps: false });                       // seat post
    tube(b, 'chrome', [-0.09, 0.24, -0.04], [0.09, 0.36, -0.04], 0.01, 0.01, 4, { col: CHROME, caps: false });                // cranks
    for (const [sx, py] of [[-1, 0.24], [1, 0.36]]) b.box('bumper', sx * 0.1, py, -0.04, 0.08, 0.018, 0.1, { col: BLACK });  // pedals
    b.box('seat', 0, 0.91, -0.2, 0.1, 0.04, 0.2, { col: BLACK }); b.box('chrome', 0, 0.98, 0.42, 0.5, 0.025, 0.025, { col: CHROME });
  });
}

export function buseta(K, b, x, y, z, ry, pitch, o) {
  if (K.ctx.vehicleLibrary?.place('vehicle_chiva', x, y, z, ry, pitch, o)) return 'vehicle_chiva';
  const body = rgb(o.hex), stripe = rgb(o.stripe ?? 0xf2c230);
  posed(K, b, x, y, z, ry, pitch, () => {
    b.box('car_paint', 0, 1.05, 0, 2.15, 1.3, 7.4, { col: body });                      // lower body
    b.box('car_paint', 0, 1.78, -0.2, 2.1, 0.05, 6.9, { col: WHITE });                  // roof plate
    frustum(b, 'glass_dark', 1.65, 2.5, [-3.4, 3.5], [-3.3, 3.0], 1.06, 1.0, WHITE);    // windows band + windscreen slope
    b.box('car_paint', 0, 2.52, -0.2, 2.1, 0.07, 6.8, { col: WHITE });                  // roof
    for (let i = 0; i < 6; i++) b.box('car_paint', 1.07, 2.05, -2.6 + i * 1.15, 0.03, 0.84, 0.07, { col: body });   // window posts (right)
    for (let i = 0; i < 6; i++) b.box('car_paint', -1.07, 2.05, -2.6 + i * 1.15, 0.03, 0.84, 0.07, { col: body });
    b.box('car_paint', 1.08, 1.0, 0.0, 0.02, 0.18, 6.9, { col: stripe }); b.box('car_paint', -1.08, 1.0, 0.0, 0.02, 0.18, 6.9, { col: stripe });
    b.box('bumper', 0, 0.45, 3.78, 2.15, 0.22, 0.12, { col: BLACK }); b.box('bumper', 0, 0.45, -3.78, 2.15, 0.22, 0.12, { col: BLACK });
    for (const sx of [-0.8, 0.8]) { b.box('light_head', sx, 0.85, 3.72, 0.34, 0.16, 0.04, { col: WHITE }); b.box('light_tail', sx, 0.95, -3.72, 0.3, 0.16, 0.04, { col: WHITE }); }
    b.box('sign_route', 0, 2.2, 3.45, 1.5, 0.3, 0.03, { col: WHITE, skip: ['nz'] });
    for (const [wx, wz] of [[-1.0, 2.3], [1.0, 2.3], [-1.0, -2.3], [1.0, -2.3]]) wheel(b, wx, 0.42, wz, 0.42, 0.28);
  });
}

// ---------------------------------------------------------------------------------------------------- carts and rubbish
export function vendorCart(K, b, x, y, z, ry, kind, r) {
  posed(K, b, x, y, z, ry, 0, () => {
    const wood = [0.55, 0.38, 0.22];
    b.box('wood_dark', 0, 0.85, 0, 1.3, 0.1, 0.8, { col: wood });                       // deck
    for (const sx of [-0.62, 0.62]) for (const sz of [-0.34, 0.34]) b.box('wood_dark', sx, 0.46, sz, 0.06, 0.8, 0.06, { col: wood });
    wheel(b, -0.78, 0.4, 0, 0.4, 0.06); wheel(b, 0.78, 0.4, 0, 0.4, 0.06);
    b.box('wood_dark', 0, 0.93, 0.4, 1.3, 0.22, 0.04, { col: wood }); b.box('wood_dark', 0, 0.93, -0.4, 1.3, 0.22, 0.04, { col: wood });
    tube(b, 'wood_dark', [0.62, 0.9, 0], [1.5, 0.75, 0], 0.025, 0.025, 4, { col: wood, caps: false });   // handle
    const pile = (hexes, nx, nz, y0 = 0.95) => { for (let i = 0; i < nx * nz; i++) { const px = -0.5 + (i % nx) * (1.0 / nx) + r.range(-0.04, 0.04), pz = -0.25 + Math.floor(i / nx) * (0.5 / nz) + r.range(-0.04, 0.04); b.box('produce', px, y0 + r.range(0, 0.1), pz, 0.14, 0.14, 0.14, { ry: r.range(0, 3), col: rgb(r.pick(hexes)) }); } };
    if (kind === 'fruit') { pile([0xf08a1c, 0xe8b020, 0xd8402a, 0x6aa036, 0xf2d24a], 7, 3); pile([0xf08a1c, 0xe8b020, 0xd8402a, 0x6aa036], 6, 3, 1.09); }
    else if (kind === 'tinto') { for (const sx of [-0.3, 0.1]) b.cyl('galvanised', sx, 0.9, 0, 0.14, 0.5, 10, { col: WHITE }); for (let i = 0; i < 6; i++) b.cyl('produce', 0.5 + (i % 3) * 0.1, 0.9, -0.2 + Math.floor(i / 3) * 0.2, 0.04, 0.09, 6, { col: [0.95, 0.95, 0.95] }); }
    else if (kind === 'arepas') { b.box('iron_black', -0.1, 0.98, 0, 0.9, 0.12, 0.55, { col: BLACK }); for (let i = 0; i < 5; i++) b.cyl('produce', -0.4 + i * 0.18, 1.04, r.range(-0.12, 0.12), 0.07, 0.025, 8, { col: [0.9, 0.78, 0.45] }); }
    else if (kind === 'minutos') { b.box('wood_dark', 0, 1.2, -0.3, 1.2, 0.5, 0.05, { col: wood }); for (let i = 0; i < 4; i++) b.box('iron_black', -0.45 + i * 0.3, 1.0, 0.1, 0.1, 0.05, 0.16, { col: BLACK }); }
    // umbrella
    const ub = rgb(r.pick([0xd8402a, 0x2a6ab0, 0xf2c230, 0x3a9a5a]));
    if (!K.ctx.clutter?.fit('clutter_umbrella', x - Math.sin(ry) * 0.3, y, z - Math.cos(ry) * 0.3, ry, [2.5, 2.38, 2.5], { scene: 'plaza' })) {
      tube(b, 'iron_black', [0, 0.9, -0.3], [0, 2.35, -0.3], 0.02, 0.02, 4, { col: BLACK, caps: false });
      b.cyl('car_paint', 0, 2.2, -0.3, 1.25, 0.18, 12, { r1: 0.04, col: ub, caps: false });
      b.cyl('car_paint', 0, 2.2, -0.3, 1.25, 0.012, 12, { r1: 1.25, col: shade(ub, 0.8) });                       // the underside: a thin disc (a zero-height frustum has NaN side normals, and one NaN pixel blanks a block of the frame through the bloom blur)
    }
  });
}

// the outline of a tied sack, bottom to neck: [height fraction, radius fraction]. It sits flat, bulges low (the weight settles), slumps in at the shoulder and is gathered into a knot.
const SACK = [[0, 0.5], [0.12, 0.88], [0.34, 1], [0.58, 0.9], [0.78, 0.6], [0.92, 0.3], [1, 0.1]];

/** A tied rubbish sack: ten sides, lumpy radius, a slumped belly and a gathered neck with a knot and a loose ear (R1-012 "rubbish bags faceted blobs": they were seven-sided cones). */
function sack(b, cx, y, cz, s, col, r) {
  const acc = b._acc('bag'), seg = 10, w = s * r.range(0.55, 0.7), hgt = s * r.range(0.95, 1.2), lean = r.range(-0.12, 0.12), lz = r.range(-0.12, 0.12), base = acc.pos.length / 3;
  for (let k = 0; k < SACK.length; k++) {
    const [t, rf] = SACK[k], slope = k + 1 < SACK.length ? (SACK[k + 1][1] - rf) / Math.max(0.01, SACK[k + 1][0] - t) : -1;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, lump = 1 + 0.16 * Math.sin(a * 2 + k * 1.7 + cx * 9) + 0.07 * Math.sin(a * 3 + cz * 7), rr = w * rf * lump, shade = 1 + 0.6 * (lump - 1);   // lump and shade are the same at i = 0 and i = seg: the seam closes, and the creases catch the light
      const n = [Math.cos(a), -(w / hgt) * slope, Math.sin(a)], l = Math.hypot(...n);
      b.vert(acc, [cx + Math.cos(a) * rr + lean * t * hgt, y + t * hgt, cz + Math.sin(a) * rr + lz * t * hgt], [n[0] / l, n[1] / l, n[2] / l], i / seg, t, [Math.min(1, col[0] * shade), Math.min(1, col[1] * shade), Math.min(1, col[2] * shade)]);
    }
  }
  for (let k = 0; k + 1 < SACK.length; k++) for (let i = 0; i < seg; i++) {
    const p = base + k * (seg + 1) + i, q = p + seg + 1;
    acc.idx.push(p, q, q + 1, p, q + 1, p + 1);
  }
  b.tris += (SACK.length - 1) * seg * 2;
  const top = [cx + lean * hgt, y + hgt, cz + lz * hgt];
  tube(b, 'bag', top, [top[0] + lean * 0.3, top[1] + 0.09, top[2] + lz * 0.3], w * 0.14, w * 0.07, 5, { col, caps: true });                      // the knot
  b.quad('bag', [top[0], top[1] + 0.07, top[2]], [top[0] + w * 0.35, top[1] + 0.02, top[2] + w * 0.1], [top[0] + w * 0.3, top[1] - 0.05, top[2] + w * 0.12], [top[0], top[1] - 0.01, top[2]], { col });   // the loose ear
  b.quad('bag', [top[0], top[1] - 0.01, top[2]], [top[0] + w * 0.3, top[1] - 0.05, top[2] + w * 0.12], [top[0] + w * 0.35, top[1] + 0.02, top[2] + w * 0.1], [top[0], top[1] + 0.07, top[2]], { col });
}

// bin-bag colours in LINEAR light (a hex run through rgb() is read as linear, so 0x2a5a30 came out mint): black, black, white, dark green, dark blue
const SACKS = [[0.012, 0.012, 0.014], [0.012, 0.012, 0.014], [0.6, 0.6, 0.56], [0.025, 0.1, 0.04], [0.02, 0.04, 0.11]];

export function rubbish(K, b, x, z, r) {
  const y = K.H(x, z), n = r.int(3, 6);
  for (let i = 0; i < n; i++) {
    const px = x + r.range(-0.35, 0.35), pz = z + r.range(-0.3, 0.3), s = r.range(0.7, 1.0);
    sack(b, px, y - 0.01, pz, s * 0.55, r.pick(SACKS), r);
  }
}

export function bin(K, b, x, z, ry, hex = 0x2f6b3a) {
  const y = K.H(x, z);
  if (K.ctx.clutter?.fit('clutter_bin_wheelie', x, y, z, ry, [0.5, 0.98, 0.6], { scene: 'alley' })) return;
  posed(K, b, x, y, z, ry, 0, () => {
    b.box('plastic_bin', 0, 0.45, 0, 0.48, 0.9, 0.55, { col: rgb(hex) });
    b.box('plastic_bin', 0, 0.93, -0.02, 0.5, 0.06, 0.58, { col: rgb(hex).map((c) => c * 0.85) });
    wheel(b, -0.22, 0.09, -0.24, 0.09, 0.04); wheel(b, 0.22, 0.09, -0.24, 0.09, 0.04);
  });
}

export function gasCylinders(K, b, x, z, ry, r) {
  const y = K.H(x, z), n = r.int(3, 5);
  for (let i = 0; i < n; i++) {
    const px = x + Math.cos(ry) * (i - n / 2) * 0.36, pz = z - Math.sin(ry) * (i - n / 2) * 0.36, col = rgb(r.pick([0xe8c030, 0xe8c030, 0xd8402a, 0x2a6ab0]));
    if (K.ctx.clutter?.fit('clutter_gas_cylinder', px, y, pz, ry, [0.3, 0.72, 0.3], { scene: 'alley' })) continue;
    b.cyl('car_paint', px, y, pz, 0.15, 0.58, 10, { r1: 0.15, col });
    b.cyl('car_paint', px, y + 0.58, pz, 0.15, 0.08, 10, { r1: 0.05, col });
    b.cyl('iron_black', px, y + 0.66, pz, 0.04, 0.06, 6, { col: BLACK });
  }
  K.rect(x, z, n * 0.36 + 0.1, 0.4, ry + Math.PI / 2, 0.9);
}

// ---------------------------------------------------------------------------------------------------- placement
export function buildVehicles(K) {
  const { plan, occ, ctx, H } = K, R = K.rng('vehicles');
  const stats = { cars: 0, taxis: 0, racks: 0, motos: 0, bikes: 0, busetas: 0, carts: 0, bins: 0, rubbish: 0, cylinders: 0 };
  const carCols = [0xf4f4f0, 0xf4f4f0, 0xb8222a, 0x9aa0a6, 0x2b4f7e, 0x1c1c20, 0xd9cfa8, 0x3d6b4a];
  // R1-103: the list above is dealt at random, so three of seven cars came out white. A colour that was already dealt is swapped for one that was not (maroon, teal, steel, pale blue are added to the
  // pool); the draw on the street's random stream is untouched, so no car, bike or prop moves. Once every colour is out they repeat. (The library tints each car to its colour; vehicle-library.js.)
  const carPool = [...new Set([...carCols, 0x6d3037, 0x2d9590, 0x7f8a94, 0xa9c3dc])], dealt = new Map();
  const dealCar = (pick, x, z) => {
    let col = pick;
    if (dealt.has(col)) { const fresh = carPool.filter((c) => !dealt.has(c)); if (fresh.length) col = fresh[lookHash(x, z, 3) % fresh.length]; }
    dealt.set(col, (dealt.get(col) ?? 0) + 1);
    return col;
  };
  const motoCols = [[0xb8222a, 0x1c1c20], [0x2b4f7e, 0xe8e8e0], [0xe8e8e0, 0xb8222a], [0x1c1c20, 0xb8222a], [0xf2c230, 0x1c1c20], [0xd8702a, 0x1c1c20], [0x2f7a4a, 0xe8e8e0], [0x6a6e74, 0x1c1c20]];
  const nonStair = plan.streets.filter((s) => s.kind !== 'stair');
  const farFromOthers = (st, x, z, m) => nonStair.every((o) => o === st || project(o._d.pts, o._d.cum, x, z).d > o.width / 2 + m);
  const okSpot = (st, x, z, cx, cz, w, d, ry, margin = 1.2) => {
    // footprint corners + centre must be free of doors / stairs / plazas / nav and not on another street
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const [lx, lz] of [[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) {
      const px = cx + lx * c + lz * s, pz = cz - lx * s + lz * c;
      if (!occ.clear(px, pz, 0.1, OCC.DOOR | OCC.STAIR | OCC.PLAZA | OCC.LOT | OCC.STEEP) || !occ.clear(px, pz, 0, OCC.NAV) || !farFromOthers(st, px, pz, margin)) return false;
    }
    // nothing solid already standing along the body (a few discs down the axis, as wide as the vehicle)
    const steps = Math.max(1, Math.round(d / 2.2)), rr = w / 2 + 0.15;
    for (let i = 0; i <= steps; i++) { const t = (i / steps - 0.5) * (d - w); if (occ.overlaps(cx + t * s, cz + t * c, rr)) return false; }
    return true;
  };
  const pitchOf = (x, z, ry) => { const dx = Math.sin(ry) * 1.6, dz = Math.cos(ry) * 1.6; return Math.atan2(H(x + dx, z + dz) - H(x - dx, z - dz), 3.2); };
  const list = (ctx.world.vehicleList = []), rec = (kind, x, z, ry, extra = {}) => list.push({ kind, x: +x.toFixed(2), z: +z.toFixed(2), ry: +ry.toFixed(2), ...extra });
  const envelope = (key, fallback) => ctx.vehicleLibrary?.meta(key)?.footprint ?? fallback;

  // ---- cars along the kerbs of the road and the commerce street
  for (const st of plan.streets.filter((s) => s.kind === 'road')) {
    const hw = st.width / 2, lane = hw - 0.9 - 1.0, d = st._d, rr = R.fork('cars:' + st.id);
    const want = 7;
    let placed = 0, taxis = 0, racks = 0;
    const loads = new Set();
    for (let t = 0; t < 120 && placed < want; t++) {
      const s = rr.range(6, st.len - 6), q = pointAt(d.pts, d.cum, s), sd = rr.chance(0.5) ? 1 : -1;
      const x = q.x - q.tz * lane * sd, z = q.z + q.tx * lane * sd, ry = Math.atan2(q.tx, q.tz) + (sd > 0 ? 0 : Math.PI) + rr.range(-0.04, 0.04);
      if (!okSpot(st, x, z, x, z, 1.9, 4.1, ry)) continue;
      // R1-103: the street's own roll makes the taxis; a road left short of taxis or of roof racks is made up at its last cars (roadRole), from the place alone, so no random stream moves
      const role = roadRole({ x, z, remaining: want - placed, taxis, racks, used: loads, taxi: rr.chance(0.18) }), y = H(x, z) + 0.04, pitch = pitchOf(x, z, ry);
      const model = car(K, K.b('vehicles', x, z), x, y, z, ry, pitch, { hex: role.taxi ? 0xf2c21b : dealCar(rr.pick(carCols), x, z), taxi: role.taxi, rack: role.rack });
      K.rect(x, z, ...envelope(model, SIZE.car), ry, ctx.vehicleLibrary?.meta(model)?.size[1] ?? 1.5, y, 0.05, true); // solid: no inside to be shut in
      occ.take(x, z, 2.1); placed++; stats.cars++;
      if (role.taxi) { stats.taxis++; taxis++; }
      if (role.rack) { stats.racks++; racks++; loads.add(role.rack.load); }
      rec(role.taxi ? 'taxi' : 'car', x, z, ry, role.rack ? { rack: role.rack.load } : {});
    }
  }
  // ---- the buseta waits on the road near the bus stop. The 7.8 m between the gate hardware (z 98) and the Comercio crossing (z 90.4) is too short for it,
  // so it takes the first stretch of S1 further up (either lane) that is clear of doors, side streets, nav lines and taken ground.
  {
    const s1 = plan.streets.find((s) => s.id === 'S1'), rr = R.fork('bus');
    let done = false;
    if (s1) {
      for (let s = 5; s < Math.min(s1.len - 10, 260) && !done; s += s < 12 ? 1 : 2.5) {
        for (const sd of [1, -1]) {
          const q = pointAt(s1._d.pts, s1._d.cum, s), lane = s1.width / 2 - 0.9 - 1.0, x = q.x + q.tz * lane * sd, z = q.z - q.tx * lane * sd, ry = Math.atan2(q.tx, q.tz) + (sd > 0 ? Math.PI : 0);
          if (!okSpot(s1, x, z, x, z, 2.4, 7.8, ry, 0.4) || !occ.clear(x, z, 0.5, OCC.DOOR)) continue;
          const y = H(x, z) + 0.04;
          const model = buseta(K, K.b('vehicles', x, z), x, y, z, ry, pitchOf(x, z, ry), { hex: rr.pick([0x2a6ab0, 0xd8402a, 0x3a9a5a]), stripe: 0xf2c230 });
          K.rect(x, z, ...envelope(model, SIZE.buseta), ry, ctx.vehicleLibrary?.meta(model)?.size[1] ?? 2.6, y, 0.05, true); occ.take(x, z, 4); stats.busetas++; rec('buseta', x, z, ry); done = true; break;
        }
      }
    }
  }
  // Larger utility vehicles reserve their real footprints before the smaller bikes take the remaining kerb spaces.
  const libraryParked = buildParkedLibrary(K, { pitchOf, rec });
  if (libraryParked) stats.libraryParked = libraryParked;
  // ---- motorbikes and bicycles by the shop fronts and at the kerbs
  const rm = R.fork('motos');
  for (const lot of plan.lots) {
    if (!(lot.shop || lot.kind === 'house') || !rm.chance(lot.shop ? 0.65 : 0.3)) continue;
    const c = Math.cos(lot.rotY), s = Math.sin(lot.rotY), u = lot.entrance.u + (rm.chance(0.5) ? 1 : -1) * rm.range(1.6, 2.6), hd = lot.d / 2 + 0.75;
    const x = lot.x + u * c + hd * s, z = lot.z - u * s + hd * c, ry = lot.rotY + Math.PI / 2 + rm.range(-0.5, 0.5);
    if (!occ.clear(x, z, 0.5, OCC.DOOR | OCC.STAIR | OCC.PLAZA | OCC.NAV | OCC.STEEP) || !occ.clear(x, z, 0, OCC.LOT) || occ.overlaps(x, z, 0.8)) continue;
    const y = H(x, z) + 0.02;
    if (rm.chance(0.8)) { const [h1, h2] = rm.pick(motoCols); moto(K, K.b('vehicles', x, z), x, y, z, ry, 0, { hex: h1, hex2: h2 }); K.rect(x, z, ...envelope('vehicle_motorbike', SIZE.moto), ry, ctx.vehicleLibrary?.meta('vehicle_motorbike')?.size[1] ?? 1.0, y); stats.motos++; rec('moto', x, z, ry); }
    else { bicycle(K, K.b('vehicles', x, z), x, y, z, ry, 0, { hex: rm.pick([0xb8222a, 0x2b4f7e, 0x3d6b4a, 0xd9cfa8]) }); K.rect(x, z, ...envelope('vehicle_bicycle', SIZE.bike), ry, ctx.vehicleLibrary?.meta('vehicle_bicycle')?.size[1] ?? 0.9, y); stats.bikes++; rec('bike', x, z, ry); }
    occ.take(x, z, 0.9);
  }
  // ... and parked along the edge of every street (on the pavement strip where there is one), pointing either way
  for (const st of plan.streets.filter((s) => s.kind === 'road' || s.kind === 'street' || (s.kind === 'alley' && s.width >= 3.2))) {
    const hw = st.width / 2, d = st._d, rk = R.fork('kerb:' + st.id), want = Math.round(st.len / (st.kind === 'road' ? 24 : st.kind === 'street' ? 14 : 30));
    let placed = 0;
    for (let t = 0; t < 120 && placed < want; t++) {
      const s = rk.range(3, st.len - 3), q = pointAt(d.pts, d.cum, s), sd = rk.chance(0.5) ? 1 : -1, off = hw - 0.5;
      const x = q.x - q.tz * off * sd, z = q.z + q.tx * off * sd, ry = Math.atan2(q.tx, q.tz) + (rk.chance(0.5) ? 0 : Math.PI) + rk.range(-0.12, 0.12);
      if (!okSpot(st, x, z, x, z, 0.8, 2.0, ry, 0.4) || !occ.clear(x, z, 0.5, OCC.DOOR | OCC.NAV)) continue;
      const y = H(x, z) + 0.02, bike = rk.chance(0.12);
      if (bike) { bicycle(K, K.b('vehicles', x, z), x, y, z, ry, pitchOf(x, z, ry), { hex: rk.pick([0xb8222a, 0x2b4f7e, 0x3d6b4a, 0xd9cfa8]) }); K.rect(x, z, ...envelope('vehicle_bicycle', SIZE.bike), ry, ctx.vehicleLibrary?.meta('vehicle_bicycle')?.size[1] ?? 0.9, y); stats.bikes++; rec('bike', x, z, ry); }
      else { const [h1, h2] = rk.pick(motoCols); moto(K, K.b('vehicles', x, z), x, y, z, ry, pitchOf(x, z, ry), { hex: h1, hex2: h2 }); K.rect(x, z, ...envelope('vehicle_motorbike', SIZE.moto), ry, ctx.vehicleLibrary?.meta('vehicle_motorbike')?.size[1] ?? 1.0, y); stats.motos++; rec('moto', x, z, ry); }
      occ.take(x, z, 1.1); placed++;
    }
  }
  // ---- vendor carts at their POIs
  const rc = R.fork('carts');
  for (const p of plan.pois) {
    const t = (p.tags ?? []).join(' ');
    if (p.kind !== 'vend' || !/cart|stand:fruit/.test(t)) continue;
    const kind = /fruit/.test(t) ? 'fruit' : rc.pick(['tinto', 'arepas']);
    if (!occ.clear(p.x, p.z, 0.4, OCC.STAIR | OCC.LOT) || occ.overlaps(p.x, p.z, 1)) continue;
    vendorCart(K, K.b('vehicles', p.x, p.z), p.x, H(p.x, p.z), p.z, p.ry + Math.PI / 2, kind, rc);
    K.rect(p.x, p.z, ...SIZE.cart, p.ry + Math.PI / 2, 1.1); occ.take(p.x, p.z, 1.2); stats.carts++; rec('cart', p.x, p.z, p.ry + Math.PI / 2);
  }
  // ---- bins, rubbish sacks, gas cylinders beside shops and at corners
  const rb = R.fork('bins');
  for (const lot of plan.lots) {
    const c = Math.cos(lot.rotY), s = Math.sin(lot.rotY);
    const at = (u) => [lot.x + u * c + (lot.d / 2 + 0.55) * s, lot.z - u * s + (lot.d / 2 + 0.55) * c];
    if (rb.chance(0.35)) {
      const u = lot.entrance.u + (rb.chance(0.5) ? 1 : -1) * (lot.w / 2 - 0.5), [x, z] = at(Math.max(-lot.w / 2 + 0.4, Math.min(lot.w / 2 - 0.4, u)));
      if (occ.clear(x, z, 0.35, OCC.DOOR | OCC.STAIR | OCC.PLAZA | OCC.NAV | OCC.STEEP) && occ.clear(x, z, 0, OCC.LOT) && !occ.overlaps(x, z, 0.5)) {
        if (rb.chance(0.55)) { rubbish(K, K.b('vehicles', x, z, { cast: false }), x, z, rb); stats.rubbish++; rec('rubbish', x, z, 0); }
        else { bin(K, K.b('vehicles', x, z), x, z, lot.rotY, rb.pick([0x2f6b3a, 0x2a4a7a, 0x555a60])); K.rect(x, z, ...SIZE.bin, lot.rotY, 1.0); stats.bins++; rec('bin', x, z, lot.rotY); }
        occ.take(x, z, 0.5);
      }
    }
    if ((lot.shop === 'ferreteria' || lot.shop === 'tienda' || lot.shop === 'restaurante' || lot.shop === 'taller') && rb.chance(0.85)) {
      const u = lot.entrance.u + (lot.entrance.u > 0 ? -1 : 1) * (lot.w / 2 - 0.9), [x, z] = at(Math.max(-lot.w / 2 + 0.7, Math.min(lot.w / 2 - 0.7, u)));
      if (occ.clear(x, z, 0.45, OCC.DOOR | OCC.STAIR | OCC.PLAZA | OCC.NAV | OCC.STEEP) && occ.clear(x, z, 0, OCC.LOT) && !occ.overlaps(x, z, 0.8)) { gasCylinders(K, K.b('vehicles', x, z), x, z, lot.rotY, rb); occ.take(x, z, 0.8); stats.cylinders++; rec('cylinders', x, z, lot.rotY); }
    }
  }
  ctx.world && (ctx.world.vehicles = stats);
  return stats;
}
