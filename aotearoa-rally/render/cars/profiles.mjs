// Pure data + curve maths describing the four cars' shapes. No THREE, no DOM (unit-testable).
// Model space: origin at the centre of mass projected on the ground (y = 0 is the ground), -Z forward.
import { clamp } from "../../core/mathx.mjs";

/** Monotone cubic (PCHIP-like) interpolation through [[x,y],...] sorted by x. */
export function curve(pts) {
  const n = pts.length;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// Shape descriptions. t runs 0 (front tip) .. 1 (rear tip). Heights in metres above the ground.
const SHAPES = {
  huia: {
    kind: "saloon", doors: 4, bonnetT: [0.075, 0.33], bumper: [0.075, 0.07],
    top: [[0, 0.56], [0.03, 0.66], [0.08, 0.76], [0.2, 0.86], [0.33, 0.92], [0.55, 0.94], [0.82, 0.96], [0.94, 0.95], [1, 0.84]],
    wid: [[0, 0.74], [0.03, 0.9], [0.1, 0.985], [0.2, 1], [0.8, 1], [0.93, 0.97], [1, 0.84]],
    cab: { t0: 0.335, rs: 0.5, re: 0.7, t1: 0.815, roof: 1.395, w: 0.76, bPillar: true, tum: 0.2 },
    sill: 0.2, wing: "gt", scoop: "bonnet", roofScoop: true, nTop: 3.4, lamp: "round", spotBar: true,
    rim: 0x8a8d92, spokes: 10, rimStyle: "mesh",
  },
  kea: {
    kind: "hatch", doors: 2, bonnetT: [0.08, 0.34], bumper: [0.075, 0.075],
    top: [[0, 0.54], [0.03, 0.66], [0.09, 0.78], [0.22, 0.87], [0.36, 0.925], [0.6, 0.95], [0.9, 0.96], [1, 0.9]],
    wid: [[0, 0.78], [0.04, 0.93], [0.1, 0.99], [0.2, 1], [0.85, 1], [0.95, 0.96], [1, 0.86]],
    cab: { t0: 0.32, rs: 0.46, re: 0.79, t1: 0.985, roof: 1.41, w: 0.77, bPillar: true, tum: 0.16 },
    sill: 0.2, wing: "roof", scoop: "none", roofScoop: false, nTop: 3.0, lamp: "wide", spotBar: false,
    rim: 0xe8e8ec, spokes: 5, rimStyle: "spoke",
  },
  takahe: {
    kind: "kit", doors: 2, bonnetT: [0.08, 0.38], bumper: [0.09, 0.08],
    top: [[0, 0.5], [0.03, 0.6], [0.1, 0.71], [0.25, 0.79], [0.4, 0.84], [0.6, 0.865], [0.88, 0.89], [1, 0.82]],
    wid: [[0, 0.8], [0.05, 0.94], [0.12, 1], [0.8, 1], [0.94, 0.97], [1, 0.86]],
    cab: { t0: 0.375, rs: 0.5, re: 0.66, t1: 0.86, roof: 1.37, w: 0.74, bPillar: false, tum: 0.28 },
    sill: 0.19, wing: "small", scoop: "side", roofScoop: true, nTop: 2.6, lamp: "slit", spotBar: false,
    rim: 0xd9a72b, spokes: 6, rimStyle: "spoke",
  },
  piwakawaka: {
    kind: "coupe", doors: 2, bonnetT: [0.07, 0.42], bumper: [0.07, 0.07],
    top: [[0, 0.54], [0.03, 0.64], [0.08, 0.72], [0.28, 0.8], [0.45, 0.86], [0.7, 0.9], [0.9, 0.93], [1, 0.84]],
    wid: [[0, 0.74], [0.04, 0.92], [0.1, 0.985], [0.2, 1], [0.82, 1], [0.94, 0.98], [1, 0.86]],
    cab: { t0: 0.43, rs: 0.57, re: 0.69, t1: 0.88, roof: 1.31, w: 0.76, bPillar: false, tum: 0.3 },
    sill: 0.2, wing: "duck", scoop: "bonnet-low", roofScoop: false, nTop: 2.9, lamp: "pop", spotBar: true,
    rim: 0x1c1c20, spokes: 5, rimStyle: "spoke",
  },
};

export function shapeFor(id) { return SHAPES[id] || SHAPES.huia; }

/** Concrete dimensions + curves for a car spec. Pure. */
export function dimsFor(spec) {
  const S = shapeFor(spec.id);
  const L = spec.length || 4.2, W = spec.width || 1.75, H = spec.height || 1.4;
  const a = spec.wheelbase * (1 - (spec.weightFront ?? 0.55)); // CoM -> front axle
  const b = spec.wheelbase - a; // CoM -> rear axle
  const frontOv = (L - spec.wheelbase) * 0.46, rearOv = (L - spec.wheelbase) - frontOv;
  const zF = -(a + frontOv), zR = b + rearOv;
  const zAt = (t) => zF + t * (zR - zF);
  const tAt = (z) => (z - zF) / (zR - zF);
  const roof = S.cab.roof * (H / 1.4);
  const topC = curve(S.top.map((p) => [p[0], p[1] * (H / 1.4)]));
  const widC = curve(S.wid);
  const R = spec.wheelRadius || 0.32;
  const wheels = [
    { x: -(spec.trackFront / 2), z: -a, r: R }, { x: spec.trackFront / 2, z: -a, r: R },
    { x: -(spec.trackRear / 2), z: b, r: R }, { x: spec.trackRear / 2, z: b, r: R },
  ];
  const cabin = { ...S.cab, roof };
  // driver sits on the right (RHD, NZ)
  const seatT = Math.max(cabin.t0 + 0.1, Math.min((cabin.rs + cabin.re) / 2, cabin.re - 0.11));
  const seatZ = zAt(seatT) + 0.05;
  const eye = { x: 0.36, y: roof - 0.3, z: seatZ - 0.1 };
  return {
    S, L, W, H, a, b, zF, zR, zAt, tAt, topC, widC, hw: W / 2, cabin, roof, wheels, R,
    seatZ, eye, bumperEye: { x: 0, y: 0.5, z: zF - 0.15 },
    sill: S.sill,
  };
}

/** Camera eye points (ground-relative) for a spec. */
export function eyePoints(spec) {
  const d = dimsFor(spec);
  return { bonnet: [d.eye.x, d.eye.y, d.eye.z + 0.02], bumper: [d.bumperEye.x, d.bumperEye.y, d.bumperEye.z] };
}

/** Is a point inside the arch cut-out of any wheel? (model space, side faces only). */
export function inArch(d, x, y, z, gap = 0.05) {
  for (let i = 0; i < 4; i++) {
    const w = d.wheels[i];
    if (Math.sign(x) !== Math.sign(w.x)) continue;
    const dy = y - w.r, dz = z - w.z;
    const r = w.r + gap;
    if (dz * dz + dy * dy < r * r && Math.abs(x) > d.hw * 0.55) return true;
  }
  return false;
}

export function clampSeverity(v) { return clamp(Number.isFinite(v) ? v : 0, 0, 1); }
