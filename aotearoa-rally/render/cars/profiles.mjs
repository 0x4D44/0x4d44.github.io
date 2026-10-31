// Pure data + curve maths describing the four cars' shapes. No THREE, no DOM (unit-testable).
// Model space: origin at the centre of mass projected on the ground (y = 0 is the ground), -Z forward.
import { clamp } from "../../core/mathx.mjs";
import { cockpitLayout } from "./layout.mjs";

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
    top: [[0, 0.56], [0.03, 0.66], [0.08, 0.76], [0.2, 0.86], [0.33, 0.92], [0.55, 0.94], [0.82, 0.965], [0.95, 0.955], [1, 0.86]],
    wid: [[0, 0.74], [0.03, 0.9], [0.1, 0.985], [0.2, 1], [0.8, 1], [0.93, 0.97], [1, 0.84]],
    cab: { t0: 0.335, rs: 0.5, re: 0.715, t1: 0.795, roof: 1.395, w: 0.76, bPillar: true, tum: 0.2, bt: 0.535, boot: 0.835 },
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

/** Driver's eye height: a seated rally driver, 0.2 m under the roof so the cage and headlining sit clear of the lens. */
export function cockpitEyeY(d) { return Math.min(d.sill + 1.0, d.roof - 0.2); }

/** Camera eye points (ground-relative) for a spec. */
export function eyePoints(spec) {
  const d = dimsFor(spec);
  // bonnet: centred, low, just inside the base of the windscreen (bonnet, wipers, mirrors and A-pillars frame the view, road clear);
  // cockpit: the driver's eye (steering wheel and cage visible); bumper: low in front of the grille.
  const t0 = d.cabin.t0 + 0.02, L = cockpitLayout(d);
  return {
    bonnet: [0.0, d.topC(t0) + 0.22, d.zAt(t0) + 0.65],
    // driver's eye: half a metre behind the steering wheel (wheel x / y / z as built in interior.mjs), under the roof
    cockpit: [L.eye.x, L.eye.y, L.eye.z],
    bumper: [d.bumperEye.x, d.bumperEye.y, d.bumperEye.z],
  };
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

/** Station values (t) of the door shut lines: shared by the body (gaps) and the livery (so text never crosses one). */
export function doorLinesT(d) {
  const t0 = d.cabin.t0 + 0.012, tB = d.cabin.rs + (d.cabin.re - d.cabin.rs) * 0.38;
  const bt = d.cabin.bt;
  return d.S.doors === 4 ? [t0 + 0.0, bt - 0.007, bt + 0.009, d.cabin.re + 0.012] : [t0 + 0.02, tB + 0.08, d.cabin.re - 0.02];
}

/**
 * Free z-intervals (metres from the nose) on the body side within the height band [y0, y1]: clear of the wheel arches
 * (with their lips), the door shut lines, the nose / tail curvature and any extra blocked spans [[a, b], ...].
 */
export function sideSlots(d, y0, y1, extra = []) {
  const blocks = [[-1e9, 0.3], [d.zR - d.zF - 0.3, 1e9], ...extra];
  for (const w of d.wheels) {
    if (w.x < 0) continue;
    const rr = w.r + 0.058 + 0.035;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k <= 6; k++) {
      const y = y0 + ((y1 - y0) * k) / 6, dy = y - w.r;
      if (Math.abs(dy) < rr) { const dz = Math.sqrt(rr * rr - dy * dy); lo = Math.min(lo, w.z - dz - d.zF); hi = Math.max(hi, w.z + dz - d.zF); }
    }
    if (hi > lo) blocks.push([lo, hi]);
  }
  for (const t of doorLinesT(d)) { const z = d.zAt(t) - d.zF; blocks.push([z - 0.045, z + 0.045]); }
  blocks.sort((a, b) => a[0] - b[0]);
  const free = [];
  let cur = -1e9;
  const end = d.zR - d.zF;
  for (const [a, b] of blocks) { if (a > cur && a - Math.max(cur, 0) > 0.05) free.push([Math.max(cur, 0), a]); cur = Math.max(cur, b); }
  if (end - cur > 0.05) free.push([cur, end]);
  return free.filter(([a, b]) => b - a > 0.05).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
}
