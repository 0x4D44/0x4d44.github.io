// Mall Mayhem - shared layout (pure maths, no three import). Used by mall.def.js (control points) and the scenery builders.
// World: x east, z south (+z), y up. The lap runs clockwise (east on the High Street, south on the right, west along the bottom,
// north on the left, then through the office hairpin and a chicane back onto the High Street).

export const R_CORNER = 24;
// sharp polyline vertices with corner radius; arcs are generated in rounded()
const HP = { cx: -92, cz: 84, r: 34 };        // office hairpin (centre = circular atrium), entry leg z = cz + r, exit leg z = cz - r
export const OFFICE_ENTRY_Z = HP.cz + HP.r, OFFICE_EXIT_Z = HP.cz - HP.r;
export const HAIRPIN = HP;

const V = [
  { x: 72, z: OFFICE_EXIT_Z, r: 20 },
  { x: 72, z: 0, r: 20 },
  { x: 730, z: 0, r: 28 },
  { x: 730, z: 318, r: 28 },
  { x: 118, z: 318, r: 26 },
  { x: 118, z: OFFICE_ENTRY_Z, r: 26 },
];

function arc(cx, cz, r, a0, a1, step) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step)), out = [];
  for (let i = 1; i < n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return out;
}

// Rounded polyline through V (closed through the office hairpin). Returns [[x,z],...]
export function buildPoints() {
  const pts = [];
  const n = V.length;
  const push = (p) => pts.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  // straight sample helper
  const line = (a, b, maxStep = 40) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 0.5) return;
    const ux = (b[0] - a[0]) / d, uz = (b[1] - a[1]) / d, cut = Math.min(8, d / 3), m = d - 2 * cut, k = Math.max(1, Math.ceil(m / maxStep));
    push([a[0] + ux * cut, a[1] + uz * cut]);
    for (let i = 1; i < k; i++) push([a[0] + ux * (cut + (m * i) / k), a[1] + uz * (cut + (m * i) / k)]);
    push([b[0] - ux * cut, b[1] - uz * cut]); push(b);
  };
  // hairpin: entry end at (cx, cz+r) heading west -> exit end at (cx, cz-r) heading east
  const hpIn = [HP.cx, HP.cz + HP.r], hpOut = [HP.cx, HP.cz - HP.r];
  let cur = hpOut;  // start just after the hairpin, on the exit leg
  push(cur);
  for (let i = 0; i < n; i++) {
    const p = V[i], prev = i === 0 ? hpOut : [V[i - 1].x, V[i - 1].z], next = i === n - 1 ? hpIn : [V[i + 1].x, V[i + 1].z];
    const d0 = [Math.sign(p.x - prev[0]) * (p.x !== prev[0]) , Math.sign(p.z - prev[1]) * (p.z !== prev[1])];
    const d1 = [Math.sign(next[0] - p.x) * (next[0] !== p.x), Math.sign(next[1] - p.z) * (next[1] !== p.z)];
    const r = p.r;
    const a = [p.x - d0[0] * r, p.z - d0[1] * r], b = [p.x + d1[0] * r, p.z + d1[1] * r];
    line(cur, a);
    // arc centre: a + perpendicular toward the turn
    const cross = d0[0] * d1[1] - d0[1] * d1[0];   // >0 : turn right in x-east/z-south coords (clockwise on screen)
    const c = [a[0] + d1[0] * r, a[1] + d1[1] * r];
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
    let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;

    for (const q of arc(c[0], c[1], r, a0, a0 + da, Math.PI / 18)) push(q);
    push(b);
    cur = b; void cross;
  }
  line(cur, hpIn);
  // hairpin semicircle (west bulge)
  for (let i = 1; i < 12; i++) { const t = (Math.PI * i) / 12; push([HP.cx - HP.r * Math.sin(t), HP.cz + HP.r * Math.cos(t)]); }
  // pts now ends before hpOut (which is pts[0])
  for (const w of WIGGLES) addWiggle(pts, w);
  return pts;
}

// sinusoidal weaves on straights: one full wave of amplitude A and wavelength lam starting at x0 (road z = zLine + A sin(2pi (x-x0)/lam))
export const WIGGLES = [
  { z: 0, x0: 372, lam: 150, A: 19, dir: 1 },      // mall concourse chicane (upper level)
  { z: 318, x0: 384, lam: 150, A: 17, dir: -1 },   // supermarket aisle slalom (x0 is the west end of the wave, road runs west)
];
function addWiggle(pts, w) {
  const x0 = w.x0, x1 = w.x0 + w.lam, pad = 14;
  const inZone = (p) => p[1] === w.z && p[0] >= x0 - pad && p[0] <= x1 + pad;
  const first = pts.findIndex(inZone); if (first < 0) return;
  let last = first; while (last + 1 < pts.length && inZone(pts[last + 1])) last++;
  const ins = [];
  for (let x = x0 - pad; x <= x1 + pad + 1e-6; x += 7) ins.push([Math.round(x * 10) / 10, Math.round((w.z + (x >= x0 && x <= x1 ? w.A * Math.sin((2 * Math.PI * (x - x0)) / w.lam) * Math.sin((Math.PI * (x - x0)) / w.lam) ** 2 : 0)) * 10) / 10]);
  if (w.dir < 0) ins.reverse();
  pts.splice(first, last - first + 1, ...ins);
}

// Re-order so index 0 is on the start line (x = START_X on the High Street, z = 0)
export const START_X = 190;
export function startPoints() {
  const pts = buildPoints();
  // make sure there is a control point exactly at the line start: insert on the High Street segment
  let best = -1;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (a[1] === 0 && b[1] === 0 && a[0] < START_X && b[0] > START_X) { best = i; break; } }
  const out = pts.slice(); out.splice(best + 1, 0, [START_X, 0]);
  const k = out.findIndex((p) => p[0] === START_X && p[1] === 0);
  return out.slice(k).concat(out.slice(0, k));
}
export const POINTS = startPoints();

// ---------------------------------------------------------------- building footprints (axis aligned, outer shell faces)
export const MALL = { x0: 305, x1: 585, z0: -74, z1: 74, h: 26, doorW: 14 };          // road enters at x0, leaves at x1 (z = 0)
export const SUPER = { x0: 372, x1: 552, z0: 258, z1: 378, h: 10, doorW: 14, roadZ: 318 };  // road enters at x1, leaves at x0
export const OFFICE = { x0: -178, x1: 40, z0: 4, z1: 168, h: 15 };                     // road enters at (x1, ENTRY_Z), leaves at (x1, EXIT_Z)
export const FLYOVER = { x: 730, zCross: 158, y: 6.4, crossW: 30 };                    // right leg passes over an E-W street at z = zCross
