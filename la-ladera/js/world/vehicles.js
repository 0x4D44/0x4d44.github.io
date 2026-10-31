// Parked cars and taxis, motorbikes, a buseta, bicycles, vendor carts and kerbside rubbish. Hand-built from boxes, frustums and tubes
// (a few dozen triangles each); poses follow the street gradient. Groups props.vehicles.<i>.<j>. Colliders are oriented rectangles.
import { tube, quadOut } from './mk.js';
import { OCC } from './occupancy.js';
import { pointAt, project } from './geom.js';

const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const TYRE = [0.07, 0.07, 0.08], CHROME = [0.78, 0.8, 0.82], BLACK = [0.1, 0.1, 0.11], WHITE = [1, 1, 1], PLATE = [0.96, 0.8, 0.12];
const shade = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

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

function wheel(b, x, y, z, r, w) {
  tube(b, 'tyre', [x - w / 2, y, z], [x + w / 2, y, z], r, r, 12, { col: TYRE });
  tube(b, 'chrome', [x - w / 2 - 0.005, y, z], [x + w / 2 + 0.005, y, z], r * 0.58, r * 0.58, 8, { col: CHROME, caps: true });
}

// ---------------------------------------------------------------------------------------------------- the vehicles
/** A small hatchback / sedan seen all over Colombia (taxis are yellow). Lofted body, glasshouse with pillars, arches, lamps, yellow plates. */
export function car(K, b, x, y, z, ry, pitch, o) {
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
}

/** A 125-200 cc street bike: frame, tank, two-tone plastics, telescopic fork, bars with mirrors, lamp, exhaust, swingarm. `hex2` = side panels / fender. */
export function moto(K, b, x, y, z, ry, pitch, o) {
  const c1 = rgb(o.hex), c2 = rgb(o.hex2 ?? 0x1c1c20), steel = [0.55, 0.57, 0.6];
  const pose = posed(K, b, x, y, z, ry, pitch, () => {
    wheel(b, 0, 0.3, 0.66, 0.3, 0.09); wheel(b, 0, 0.3, -0.66, 0.3, 0.12);
    tube(b, 'chrome', [0.052, 0.3, 0.66], [0.058, 0.3, 0.66], 0.12, 0.12, 12, { col: CHROME, caps: true });                   // brake disc
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
    b.box('car_paint', 0, 0.66, 0.66, 0.1, 0.03, 0.56, { col: c2 });                                                            // front fender
    // tank, seat, side panels, tail
    tube(b, 'car_paint', [0, 0.88, 0.4], [0, 0.84, 0.0], 0.1, 0.115, 10, { col: c1 });
    b.box('chrome', 0, 0.98, 0.2, 0.06, 0.012, 0.06, { col: CHROME });                                                           // fuel cap
    b.box('seat', 0, 0.84, -0.32, 0.2, 0.07, 0.6, { col: BLACK }); b.box('seat', 0, 0.87, -0.64, 0.16, 0.07, 0.24, { col: BLACK });
    for (const sx of [-1, 1]) {
      b.box('car_paint', sx * 0.1, 0.64, -0.32, 0.045, 0.2, 0.4, { col: c2 });                                                   // side panels
      b.box('chrome', sx * 0.2, 0.3, -0.05, 0.1, 0.02, 0.05, { col: CHROME });                                                   // foot pegs
    }
    b.box('car_paint', 0, 0.72, -0.84, 0.14, 0.03, 0.34, { col: c2 });                                                           // rear fender
    b.box('light_tail', 0, 0.78, -1.0, 0.1, 0.05, 0.03, { col: WHITE }); b.box('sign_route', 0, 0.66, -1.01, 0.18, 0.12, 0.012, { col: PLATE });
    tube(b, 'chrome', [0.1, 0.84, -0.72], [0.1, 0.9, -0.95], 0.012, 0.012, 4, { col: CHROME, caps: false });                    // grab rail
    // exhaust, shock, stand
    tube(b, 'chrome', [0.11, 0.33, 0.12], [0.13, 0.27, -0.35], 0.022, 0.022, 6, { col: CHROME, caps: false });
    tube(b, 'chrome', [0.13, 0.28, -0.3], [0.14, 0.4, -0.95], 0.045, 0.042, 8, { col: shade(CHROME, 0.85), caps: true });
    tube(b, 'iron_black', [-0.09, 0.7, -0.45], [-0.09, 0.4, -0.3], 0.018, 0.018, 5, { col: [0.5, 0.1, 0.1], caps: false });
    tube(b, 'bumper', [-0.1, 0.36, -0.05], [-0.3, 0.06, 0.02], 0.014, 0.014, 4, { col: BLACK, caps: false });                   // side stand
  });
  // A later helmet must sit on this exact transformed seat, including pitch and the body's lateral displacement.
  // Shop-front motos are level; kerb motos follow the road. Re-deriving either pose from rounded vehicle-list data floats helmets.
  const seat = new K.ctx.THREE.Vector3(0, 0.875, -0.32).applyMatrix4(pose);
  K.ctx.world ??= {};
  (K.ctx.world.motoSeats ??= []).push({ x: seat.x, y: seat.y, z: seat.z, yaw: ry, pitch });
}

export function bicycle(K, b, x, y, z, ry, pitch, o) {
  const body = rgb(o.hex);
  posed(K, b, x, y, z, ry, pitch, () => {
    wheel(b, 0, 0.33, 0.55, 0.33, 0.04); wheel(b, 0, 0.33, -0.55, 0.33, 0.04);
    tube(b, 'car_paint', [0, 0.33, -0.55], [0, 0.78, -0.18], 0.02, 0.02, 4, { col: body, caps: false });
    tube(b, 'car_paint', [0, 0.78, -0.18], [0, 0.85, 0.42], 0.02, 0.02, 4, { col: body, caps: false });
    tube(b, 'car_paint', [0, 0.33, 0.55], [0, 0.85, 0.42], 0.02, 0.02, 4, { col: body, caps: false });
    b.box('seat', 0, 0.9, -0.2, 0.1, 0.04, 0.2, { col: BLACK }); b.box('chrome', 0, 0.98, 0.42, 0.5, 0.025, 0.025, { col: CHROME });
  });
}

export function buseta(K, b, x, y, z, ry, pitch, o) {
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
      b.cyl('car_paint', 0, 2.2, -0.3, 1.25, 0.0, 12, { r1: 0.0, col: ub, caps: false });
    }
  });
}

export function rubbish(K, b, x, z, r) {
  const y = K.H(x, z), n = r.int(3, 6);
  for (let i = 0; i < n; i++) {
    const px = x + r.range(-0.35, 0.35), pz = z + r.range(-0.3, 0.3), s = r.range(0.3, 0.5), col = rgb(r.pick([0x161618, 0x161618, 0xe8e8e0, 0x2a5a30]));
    b.cyl('bag', px, y + 0.0, pz, s * 0.55, s * 0.9, 7, { r1: s * 0.28, col });
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
  const stats = { cars: 0, taxis: 0, motos: 0, bikes: 0, busetas: 0, carts: 0, bins: 0, rubbish: 0, cylinders: 0 };
  const carCols = [0xf4f4f0, 0xf4f4f0, 0xb8222a, 0x9aa0a6, 0x2b4f7e, 0x1c1c20, 0xd9cfa8, 0x3d6b4a];
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
  const list = (ctx.world.vehicleList = []), rec = (kind, x, z, ry) => list.push({ kind, x: +x.toFixed(2), z: +z.toFixed(2), ry: +ry.toFixed(2) });

  // ---- cars along the kerbs of the road and the commerce street
  for (const st of plan.streets.filter((s) => s.kind === 'road')) {
    const hw = st.width / 2, lane = hw - 0.9 - 1.0, d = st._d, rr = R.fork('cars:' + st.id);
    const want = 7;
    let placed = 0;
    for (let t = 0; t < 120 && placed < want; t++) {
      const s = rr.range(6, st.len - 6), q = pointAt(d.pts, d.cum, s), sd = rr.chance(0.5) ? 1 : -1;
      const x = q.x - q.tz * lane * sd, z = q.z + q.tx * lane * sd, ry = Math.atan2(q.tx, q.tz) + (sd > 0 ? 0 : Math.PI) + rr.range(-0.04, 0.04);
      if (!okSpot(st, x, z, x, z, 1.9, 4.1, ry)) continue;
      const taxi = rr.chance(0.18), y = H(x, z) + 0.04, pitch = pitchOf(x, z, ry);
      car(K, K.b('vehicles', x, z), x, y, z, ry, pitch, { hex: taxi ? 0xf2c21b : rr.pick(carCols), taxi });
      K.rect(x, z, 1.75, 3.9, ry, 1.5, y);
      occ.take(x, z, 2.1); placed++; stats.cars++; if (taxi) stats.taxis++; rec(taxi ? 'taxi' : 'car', x, z, ry);
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
          buseta(K, K.b('vehicles', x, z), x, y, z, ry, pitchOf(x, z, ry), { hex: rr.pick([0x2a6ab0, 0xd8402a, 0x3a9a5a]), stripe: 0xf2c230 });
          K.rect(x, z, 2.2, 7.5, ry, 2.6, y); occ.take(x, z, 4); stats.busetas++; rec('buseta', x, z, ry); done = true; break;
        }
      }
    }
  }
  // ---- motorbikes and bicycles by the shop fronts and at the kerbs
  const rm = R.fork('motos');
  for (const lot of plan.lots) {
    if (!(lot.shop || lot.kind === 'house') || !rm.chance(lot.shop ? 0.65 : 0.3)) continue;
    const c = Math.cos(lot.rotY), s = Math.sin(lot.rotY), u = lot.entrance.u + (rm.chance(0.5) ? 1 : -1) * rm.range(1.6, 2.6), hd = lot.d / 2 + 0.75;
    const x = lot.x + u * c + hd * s, z = lot.z - u * s + hd * c, ry = lot.rotY + Math.PI / 2 + rm.range(-0.5, 0.5);
    if (!occ.clear(x, z, 0.5, OCC.DOOR | OCC.STAIR | OCC.PLAZA | OCC.NAV | OCC.STEEP) || !occ.clear(x, z, 0, OCC.LOT) || occ.overlaps(x, z, 0.8)) continue;
    const y = H(x, z) + 0.02;
    if (rm.chance(0.8)) { const [h1, h2] = rm.pick(motoCols); moto(K, K.b('vehicles', x, z), x, y, z, ry, 0, { hex: h1, hex2: h2 }); K.rect(x, z, 0.62, 1.95, ry, 1.0, y); stats.motos++; rec('moto', x, z, ry); }
    else { bicycle(K, K.b('vehicles', x, z), x, y, z, ry, 0, { hex: rm.pick([0xb8222a, 0x2b4f7e, 0x3d6b4a, 0xd9cfa8]) }); K.rect(x, z, 0.5, 1.7, ry, 0.9, y); stats.bikes++; rec('bike', x, z, ry); }
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
      if (bike) { bicycle(K, K.b('vehicles', x, z), x, y, z, ry, pitchOf(x, z, ry), { hex: rk.pick([0xb8222a, 0x2b4f7e, 0x3d6b4a, 0xd9cfa8]) }); K.rect(x, z, 0.5, 1.7, ry, 0.9, y); stats.bikes++; rec('bike', x, z, ry); }
      else { const [h1, h2] = rk.pick(motoCols); moto(K, K.b('vehicles', x, z), x, y, z, ry, pitchOf(x, z, ry), { hex: h1, hex2: h2 }); K.rect(x, z, 0.62, 1.95, ry, 1.0, y); stats.motos++; rec('moto', x, z, ry); }
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
    K.rect(p.x, p.z, 1.5, 0.9, p.ry + Math.PI / 2, 1.1); occ.take(p.x, p.z, 1.2); stats.carts++;
  }
  // ---- bins, rubbish sacks, gas cylinders beside shops and at corners
  const rb = R.fork('bins');
  for (const lot of plan.lots) {
    const c = Math.cos(lot.rotY), s = Math.sin(lot.rotY);
    const at = (u) => [lot.x + u * c + (lot.d / 2 + 0.55) * s, lot.z - u * s + (lot.d / 2 + 0.55) * c];
    if (rb.chance(0.35)) {
      const u = lot.entrance.u + (rb.chance(0.5) ? 1 : -1) * (lot.w / 2 - 0.5), [x, z] = at(Math.max(-lot.w / 2 + 0.4, Math.min(lot.w / 2 - 0.4, u)));
      if (occ.clear(x, z, 0.35, OCC.DOOR | OCC.STAIR | OCC.PLAZA | OCC.NAV | OCC.STEEP) && occ.clear(x, z, 0, OCC.LOT) && !occ.overlaps(x, z, 0.5)) {
        if (rb.chance(0.55)) { rubbish(K, K.b('vehicles', x, z, { cast: false }), x, z, rb); stats.rubbish++; }
        else { bin(K, K.b('vehicles', x, z), x, z, lot.rotY, rb.pick([0x2f6b3a, 0x2a4a7a, 0x555a60])); K.rect(x, z, 0.5, 0.6, lot.rotY, 1.0); stats.bins++; }
        occ.take(x, z, 0.5);
      }
    }
    if ((lot.shop === 'ferreteria' || lot.shop === 'tienda' || lot.shop === 'restaurante' || lot.shop === 'taller') && rb.chance(0.85)) {
      const u = lot.entrance.u + (lot.entrance.u > 0 ? -1 : 1) * (lot.w / 2 - 0.9), [x, z] = at(Math.max(-lot.w / 2 + 0.7, Math.min(lot.w / 2 - 0.7, u)));
      if (occ.clear(x, z, 0.45, OCC.DOOR | OCC.STAIR | OCC.PLAZA | OCC.NAV | OCC.STEEP) && occ.clear(x, z, 0, OCC.LOT) && !occ.overlaps(x, z, 0.8)) { gasCylinders(K, K.b('vehicles', x, z), x, z, lot.rotY, rb); occ.take(x, z, 0.8); stats.cylinders++; }
    }
  }
  ctx.world && (ctx.world.vehicles = stats);
  return stats;
}
