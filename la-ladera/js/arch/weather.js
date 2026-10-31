// Weathering of the outside of the shell (A2; review R1-003 "pristine paint everywhere"): rising damp, rain streaks under sills and slabs, peeling patches,
// repair patches in another colour, hairline cracks, soot, leak stains, rust running from a shutter housing, salts on brick and graffiti tags. Every mark is a
// thin alpha quad 8 mm off the wall, textured from ONE canvas atlas (`wall_decal`, painted at load like the sign atlas: browser only; Node has no canvas and the
// quads fall back to faint flat patches). What a building wears, and where, is a hash of its id: no two neighbours repeat, and every front carries at least three
// kinds. The plan (`planWeather`) is pure data; `drawWeather` turns it into quads and records each mark on `bp.facade`.
// No polygonOffset: the engine runs reversed-Z, where a negative offset pushes AWAY (see interiors/atlas.js); the 8 mm gap is the whole trick.
import * as THREE from 'three';
import { lin, hash01 } from './mb.js';
import { PRETIL_H } from './roof.js';
import { paintedItems } from './signs.js';

const UP = [0, 1, 0];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (v, a, c) => (v < a ? a : v > c ? c : v);
const W = 2048, GUT = 6, OFF = 0.008;

/** Atlas contents: how many painted variants of each kind, and the pixel size of one (its aspect is the aspect of the mark on the wall). */
export const ITEMS = {
  damp: { n: 4, w: 256, h: 64 }, streak: { n: 6, w: 64, h: 256 }, peel: { n: 6, w: 192, h: 192 }, patch: { n: 4, w: 192, h: 144 }, crack: { n: 4, w: 96, h: 192 },
  tag: { n: 10, w: 256, h: 128 }, soot: { n: 3, w: 96, h: 144 }, stain: { n: 3, w: 192, h: 192 }, rust: { n: 3, w: 48, h: 192 }, efflor: { n: 3, w: 192, h: 96 },
};
export const WEATHER_KINDS = Object.keys(ITEMS);
/** Marks that cover the wall (a later mark keeps clear of them and is drawn over the soft ones); stains, streaks, soot and rust may lie under anything. */
const HARD = new Set(['peel', 'patch', 'crack', 'tag', 'efflor']);
/** Marks that are never mirrored: lettering, and the mends that carry a shadow cast down and to the right. */
const NOFLIP = new Set(['tag', 'patch']);
const aspect = (k) => ITEMS[k].w / ITEMS[k].h;

// ---- painters (canvas 2D, origin top-left of the item, transparent ground) ------------------------------------------------------------------------
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** Smooth 1-D value noise, n samples in about -1.75..1.75 (octaves: amplitude, lattice step in samples). */
function fbm(r, n, oct = [[1, 48], [0.5, 16], [0.25, 6]]) {
  const out = new Float32Array(n);
  for (const [a, st] of oct) {
    const lat = Array.from({ length: Math.ceil(n / st) + 3 }, () => r() * 2 - 1);
    for (let x = 0; x < n; x++) { const t = x / st, i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f); out[x] += a * (lat[i] * (1 - s) + lat[i + 1] * s); }
  }
  return out;
}
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
/** A lumpy closed outline round (cx, cy) with mean radius R: the points (reaches about 1.04 R at most, plus `jag`). `trace` draws them, so a fill and its stroke share one shape. */
function blobPts(cx, cy, R, r, lobes = 5, jag = 0.07, N = 40) {
  const ph = r() * 6.283, ph2 = r() * 6.283, pts = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2, rr = R * (0.7 + 0.14 * Math.sin(a * 2 + ph) + 0.09 * Math.sin(a * 3 + ph2) + 0.06 * Math.sin(a * lobes + ph) + jag * (r() - 0.5));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92]);
  }
  return pts;
}
const trace = (g, pts) => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
/** Trace a fresh lumpy outline as the current path and return its points. */
function blob(g, cx, cy, R, r, lobes, jag) { const p = blobPts(cx, cy, R, r, lobes, jag); trace(g, p); return p; }
/** Multiply the alpha by a mask that is 1 inside and falls to 0 toward the sides asked for (fractions of w and h): no hard edge where the quad ends. */
function fade(g, w, h, [l, r, t, b]) {
  g.save(); g.globalCompositeOperation = 'destination-in';
  const axis = (x1, y1, a, c) => {
    const gr = g.createLinearGradient(0, 0, x1, y1);
    gr.addColorStop(0, a ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)'); if (a) gr.addColorStop(a, 'rgba(0,0,0,1)'); if (c) gr.addColorStop(1 - c, 'rgba(0,0,0,1)'); gr.addColorStop(1, c ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  };
  axis(w, 0, l, r); axis(0, h, t, b);
  g.restore();
}
/** The same, but round: opaque inside `from` of the half-size, 0 at the rim. */
function fadeRound(g, w, h, from = 0.5) {
  g.save(); g.globalCompositeOperation = 'destination-in'; g.translate(w / 2, h / 2); g.scale(w / 2, h / 2);
  const gr = g.createRadialGradient(0, 0, from, 0, 0, 1); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore();
}

// Second coat and bare ground under the top coat: [the old paint that shows round the hole, what shows where that went too]. (A decal cannot know the wall it lies on: the
// colours are fixed per variant, so the mix on a street is as mixed as the paint jobs of a barrio.)
const PEEL = [
  [[216, 208, 188], [150, 148, 140]],      // old cream over cement
  [[214, 192, 132], [172, 148, 120]],      // old yellow over plaster
  [[158, 184, 160], [142, 138, 130]],      // old green over cement
  [[156, 178, 196], [182, 168, 150]],      // faded blue over plaster
  [[204, 152, 134], [156, 90, 68]],        // old pink over brick
  [[188, 182, 172], [156, 92, 68]],        // grey wash over brick
];
const TAGNAMES = ['LOBO', 'ZETA', 'KIKE', 'RIKO', 'SOL', 'NK', 'TITO', 'MAYA'];

/** A periodic smooth noise round a circle: K random lattice values, eased between them; f(angle) is in -1..1. */
function periodic(r, K) {
  const v = Array.from({ length: K }, () => r() * 2 - 1);
  return (a) => { const t = ((((a / 6.2832) % 1) + 1) % 1) * K, k = Math.floor(t), f = t - k, s = f * f * (3 - 2 * f); return v[k] * (1 - s) + v[(k + 1) % K] * s; };
}
/**
 * The outline of a flake of paint that has come away round (cx, cy): straight edges meeting at angles, uneven spacing (long runs and short teeth), a notch here and there, wide lobes
 * underneath. It reaches about 1.2 R at most; `sq` squashes it. Smooth blobs read as stickers; shards read as paint.
 */
function shardPts(cx, cy, R, r, sq = 0.92, N = 34) {
  const f1 = periodic(r, 5), f2 = periodic(r, 11), pts = [];
  for (let k = 0; k < N; k++) {
    const a = ((k + (r() - 0.5) * 0.7) / N) * 6.2832;
    let rr = R * (0.82 + 0.2 * f1(a) + 0.1 * f2(a) + 0.2 * (r() - 0.5));
    if (r() < 0.14) rr *= 0.7 + 0.2 * r();
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sq]);
  }
  return pts;
}
/** A soft round blot: `a0` opaque in the middle, nothing at the rim. */
function soft(g, x, y, rad, col, a0) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(col, a0)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
}
/** The outline as a broken dark rim: short segments, each a little different, so it reads as an edge with thickness and not as a drawn line. `lit` keeps it to the lower and right sides. */
function rim(g, pts, r, a0 = 0.25, a1 = 0.4, lit = false) {
  g.lineCap = 'round';
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], q = pts[(k + 1) % pts.length];
    if (lit) { const nx = q[1] - p[1], ny = p[0] - q[0]; if (nx * 0.55 + ny * 0.83 < 0) continue; }               // outward normal of a clockwise outline: keep what faces down or right
    g.lineWidth = 1 + r() * 1.4; g.strokeStyle = `rgba(34,24,14,${a0 + r() * a1})`; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
  }
}
/** Dry grain: n specks of the colours given, inside the box. */
function grain(g, x0, y0, x1, y1, n, r, cols, a0 = 0.1, a1 = 0.25, sz = 2) {
  for (let k = 0; k < n; k++) { g.fillStyle = rgba(cols[Math.floor(r() * cols.length)], a0 + r() * a1); g.fillRect(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 0.8 + r() * sz, 0.8 + r() * sz * 0.7); }
}

const PAINT = {
  damp(g, w, h, i, r) {
    // Rising damp: the foot of the wall is wet and dark, the wet climbs in uneven tongues and gives out into the plaster. Nothing is outlined and nothing is pale: the top of it is a fade, never a line.
    const lo = fbm(r, w + 4), hi = fbm(r, w + 4, [[1, 44], [0.4, 20]]), fibre = fbm(r, w + 4, [[1, 9], [0.4, 3]]), reach = new Float32Array(w);
    const wet = [[58, 44, 30], [48, 46, 32], [62, 48, 34], [44, 40, 34]][i % 4];                  // brown, green-brown, ochre, grey-brown
    for (let x = 0; x < w; x++) {
      reach[x] = clamp(0.58 + 0.15 * lo[x] + 0.2 * Math.max(0, hi[x]), 0.24, 0.98);               // how far up this column the wet climbs, as a fraction of h
      const k = 1 + 0.07 * fibre[x], gr = g.createLinearGradient(0, h * (1 - reach[x]), 0, h);    // the wet runs up the plaster in fibres: a little more or less in each column
      gr.addColorStop(0, rgba(wet, 0)); gr.addColorStop(0.16, rgba(wet, 0.16 * k)); gr.addColorStop(0.42, rgba(wet, 0.44 * k)); gr.addColorStop(0.72, rgba(wet, 0.64 * k)); gr.addColorStop(1, rgba(wet, 0.76 * k));
      g.fillStyle = gr; g.fillRect(x, 0, 1, h);
    }
    for (let k = 0; k < 24; k++) { const x = r() * w, y = h * (1 - reach[x | 0] * (0.12 + 0.8 * r())); soft(g, x, y, 5 + r() * 15, wet, 0.05 + r() * 0.1); }       // blotches inside the wet
    for (let k = 0; k < 22; k++) { const x = r() * w; soft(g, x, h * (1 - reach[x | 0] * (0.86 + 0.12 * r())), 6 + r() * 9, wet, 0.05); }                       // a cloudy, uneven top
    grain(g, 0, h * 0.8, w, h, 70, r, [[30, 24, 18]], 0.06, 0.16, 2.4);                                                                                       // splash and street dirt at the very foot
    fade(g, w, h, [0.05, 0.05, 0, 0]);
  },
  streak(g, w, h, i, r) {
    const hz = g.createRadialGradient(w / 2, 0, 0, w / 2, 0, w * 0.6); hz.addColorStop(0, 'rgba(48,40,34,0.28)'); hz.addColorStop(1, 'rgba(48,40,34,0)');
    g.fillStyle = hz; g.fillRect(0, 0, w, h * 0.3);
    g.lineCap = 'round';
    const n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const x0 = w * (0.2 + 0.6 * r()), wd = 2 + r() * 7, len = h * (0.45 + 0.5 * r()), wob = (r() - 0.5) * 6;
      const grd = g.createLinearGradient(0, 0, 0, len); grd.addColorStop(0, `rgba(40,34,30,${0.3 + r() * 0.16})`); grd.addColorStop(0.7, 'rgba(40,34,30,0.12)'); grd.addColorStop(1, 'rgba(40,34,30,0)');
      g.strokeStyle = grd; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, 2);
      for (let y = 8; y <= len; y += 8) g.lineTo(x0 + Math.sin(y * 0.05 + k) * wob, y);
      g.stroke();
    }
    fade(g, w, h, [0.08, 0.08, 0, 0.12]);
  },
  peel(g, w, h, i, r) {
    // Paint that has come away in layers: the top coat is gone from a torn patch and the old coat shows (a second colour), and where that went too, the bare ground. Each edge has
    // a little thickness (a broken dark rim, shade just inside it), a few chips have gone beside the main hole, and nothing is outlined in white.
    const [c2, c3] = PEEL[i % PEEL.length], cx = w / 2 + (r() - 0.5) * 8, cy = h / 2 + (r() - 0.5) * 8, R = Math.min(w, h) * 0.4;
    const outer = shardPts(cx, cy, R, r, 0.72 + 0.4 * r());
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (let k = 0; k < 2; k++) {                                                                                                                           // water that ran from the hole, down the wall
      const x = cx + (r() - 0.5) * R * 1.2, y0 = cy + R * 0.5, L = 14 + r() * 26, gr = g.createLinearGradient(0, y0, 0, y0 + L);
      gr.addColorStop(0, 'rgba(40,30,20,0.16)'); gr.addColorStop(1, 'rgba(40,30,20,0)'); g.strokeStyle = gr; g.lineWidth = 2 + r() * 3; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (r() - 0.5) * 6, y0 + L); g.stroke();
    }
    g.strokeStyle = 'rgba(40,30,20,0.035)'; for (const lw of [22, 14, 7]) { g.lineWidth = lw; trace(g, outer); g.stroke(); }                                  // damp round the hole
    trace(g, outer); g.fillStyle = rgba(c2, 1); g.fill();                                                                                                   // the old coat
    g.save(); trace(g, outer); g.clip();
    for (let k = 0; k < 16; k++) soft(g, cx + (r() - 0.5) * R * 1.7, cy + (r() - 0.5) * R * 1.4, 7 + r() * 18, r() < 0.6 ? [64, 50, 34] : [255, 250, 238], 0.06 + r() * 0.1);   // mottled with dirt
    const gv = g.createLinearGradient(0, cy - R, 0, cy + R); gv.addColorStop(0, 'rgba(60,46,30,0)'); gv.addColorStop(1, 'rgba(60,46,30,0.2)'); g.fillStyle = gv; g.fillRect(0, 0, w, h);   // dirtier toward the bottom
    g.save(); g.translate(3, 4); g.strokeStyle = 'rgba(30,22,14,0.3)'; g.lineWidth = 7; trace(g, outer); g.stroke(); g.lineWidth = 3.5; g.stroke(); g.restore();   // the lip above and to the left shades what lies below it
    const inner = shardPts(cx + (r() - 0.5) * R * 0.5, cy + (r() - 0.5) * R * 0.4, R * (0.34 + 0.2 * r()), r, 0.7 + 0.3 * r(), 26);
    trace(g, inner); g.fillStyle = rgba(c3, 1); g.fill();                                                                                                   // the bare ground
    g.save(); trace(g, inner); g.clip();
    grain(g, cx - R * 1.2, cy - R * 1.2, cx + R * 1.2, cy + R * 1.2, 90, r, [[40, 30, 22], [226, 220, 206], [40, 30, 22]], 0.08, 0.22, 2.2);
    g.save(); g.translate(2.5, 3.5); g.strokeStyle = 'rgba(30,22,14,0.3)'; g.lineWidth = 6; trace(g, inner); g.stroke(); g.restore();
    g.strokeStyle = 'rgba(34,24,14,0.3)'; g.lineWidth = 1; for (let k = 0; k < 3; k++) { g.beginPath(); let x = cx + (r() - 0.5) * R, y = cy + (r() - 0.5) * R * 0.7; g.moveTo(x, y); for (let s = 0; s < 4; s++) { x += (r() - 0.5) * 16; y += (r() - 0.25) * 12; g.lineTo(x, y); } g.stroke(); }
    g.restore();
    rim(g, inner, r, 0.18, 0.3);
    g.restore();
    rim(g, outer, r, 0.25, 0.4);
    for (let k = 0; k < 5; k++) {                                                                                                                           // chips beside the hole
      const a = r() * 6.283, d = R * (1.02 + 0.22 * r()), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.85, rr = 3 + r() * 6;
      if (x < 14 || x > w - 14 || y < 14 || y > h - 14) continue;
      const chip = shardPts(x, y, rr, r, 0.8, 9); trace(g, chip); g.fillStyle = rgba(c2, 0.96); g.fill(); rim(g, chip, r, 0.3, 0.3);
    }
  },
  patch(g, w, h, i, r) {
    // Four kinds of mend. 0 and 1 are near white: the vertex tint paints them in the wall's own colour, a shade off. 2 and 3 carry their own colours and are fixed on with nails, so they
    // stand off the wall and cast a little shadow down and to the right (they are never mirrored).
    if (i === 0) {                                                       // a trowelled render patch: rough, hand-cut, thickest in the middle
      const pts = [], N = 16, x0 = 18 + r() * 8, x1 = w - 18 - r() * 8, y0 = 16 + r() * 8, y1 = h - 16 - r() * 8, wob = () => (r() - 0.5) * 6;
      for (let k = 0; k < N; k++) pts.push([x0 + ((x1 - x0) * k) / N, y0 + wob() + (k % 5 === 0 ? 3 : 0)]);
      for (let k = 0; k < N; k++) pts.push([x1 + wob(), y0 + ((y1 - y0) * k) / N]);
      for (let k = N; k > 0; k--) pts.push([x0 + ((x1 - x0) * k) / N, y1 + wob()]);
      for (let k = N; k > 0; k--) pts.push([x0 + wob(), y0 + ((y1 - y0) * k) / N]);
      g.lineJoin = 'round'; g.strokeStyle = 'rgba(40,30,20,0.05)'; for (const lw of [14, 8]) { g.lineWidth = lw; trace(g, pts); g.stroke(); }
      trace(g, pts); g.fillStyle = 'rgba(236,235,230,0.92)'; g.fill();
      g.save(); trace(g, pts); g.clip();
      for (let k = 0; k < 14; k++) soft(g, x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 10 + r() * 22, r() < 0.5 ? [90, 84, 74] : [255, 255, 250], 0.08 + r() * 0.12);
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 3; for (let k = 0; k < 5; k++) { const y = y0 + ((k + 0.5) / 5) * (y1 - y0); g.beginPath(); g.moveTo(x0, y + (r() - 0.5) * 8); g.quadraticCurveTo((x0 + x1) / 2, y + (r() - 0.5) * 16, x1, y + (r() - 0.5) * 8); g.stroke(); }     // trowel sweeps
      grain(g, x0, y0, x1, y1, 260, r, [[60, 56, 48], [60, 56, 48], [255, 255, 250]], 0.1, 0.25, 1.8);
      g.strokeStyle = 'rgba(30,22,14,0.2)'; for (const lw of [10, 5]) { g.lineWidth = lw; trace(g, pts); g.stroke(); }
      g.restore();
      rim(g, pts, r, 0.2, 0.35, true);
    } else if (i === 1) {                                                // a roller-painted square: the edges wander, the roller leaves stripes, the top and bottom are dry-brushed
      const x0 = 16 + r() * 8, x1 = w - 16 - r() * 8, y0 = 18 + r() * 6, y1 = h - 18 - r() * 6, N = 18, ph = r() * 6, edge = (t, a) => Math.sin(t * 5 + ph) * a + (r() - 0.5) * a * 0.6;
      g.beginPath();
      for (let k = 0; k <= N; k++) g.lineTo(x0 + ((x1 - x0) * k) / N, y0 + edge(k / N, 1.8));
      for (let k = 1; k <= N; k++) g.lineTo(x1 + edge(k / N + 1, 1.5), y0 + ((y1 - y0) * k) / N);
      for (let k = N - 1; k >= 0; k--) g.lineTo(x0 + ((x1 - x0) * k) / N, y1 + edge(k / N + 2, 2.4));
      for (let k = N - 1; k > 0; k--) g.lineTo(x0 + edge(k / N + 3, 1.5), y0 + ((y1 - y0) * k) / N);
      g.closePath(); g.fillStyle = 'rgba(244,243,239,0.66)'; g.fill();                                              // thin paint: the plaster still shows through it
      g.save(); g.clip();
      for (let x = x0; x < x1; x += 11 + r() * 16) { g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${0.015 + r() * 0.03})` : `rgba(255,255,255,${0.04 + r() * 0.06})`; g.fillRect(x, y0 - 6, 4 + r() * 10, y1 - y0 + 12); }                      // roller lanes
      for (let k = 0; k < 10; k++) soft(g, x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 12 + r() * 20, r() < 0.5 ? [40, 30, 20] : [255, 255, 255], 0.04 + r() * 0.05);       // uneven coverage
      g.fillStyle = 'rgba(30,22,14,0.07)'; g.fillRect(x0, y0, 4, y1 - y0); g.fillRect(x1 - 4, y0, 4, y1 - y0);                                                                     // paint ridge at the lane ends
      g.restore();
      for (let k = 0; k < 140; k++) { const top = r() < 0.5, x = x0 + r() * (x1 - x0), y = (top ? y0 : y1) + (r() - 0.5) * 12; g.fillStyle = `rgba(244,243,239,${0.2 + r() * 0.6})`; g.fillRect(x, y, 1 + r() * 2.2, 1 + r() * 1.6); }   // dry-brush stipple
    } else if (i === 2) {                                                // a sheet of zinc nailed over the hole
      const x0 = w * (0.2 + 0.04 * r()), x1 = w * (0.8 - 0.04 * r()), y0 = h * 0.16, y1 = h * 0.84, sk = (r() - 0.5) * 8;
      const sheet = [[x0, y0 + sk], [x1, y0 - sk], [x1 + (r() - 0.5) * 4, y1 - 2], [x0 + (r() - 0.5) * 4, y1 + 2]];
      g.save(); g.shadowColor = 'rgba(18,12,6,0.62)'; g.shadowBlur = 6; g.shadowOffsetX = 2.5; g.shadowOffsetY = 4; trace(g, sheet); g.fillStyle = '#a1a9ae'; g.fill(); g.restore();
      g.save(); trace(g, sheet); g.clip();
      for (let x = x0 - 4; x < x1 + 8; x += 8) {                          // the corrugations
        const gr = g.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, 'rgba(40,46,52,0.42)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(40,46,52,0.42)');
        g.fillStyle = gr; g.fillRect(x, y0 - 6, 8, y1 - y0 + 12);
      }
      soft(g, (x0 + x1) / 2, y0, 40, [255, 255, 255], 0.16);
      for (let k = 0; k < 9; k++) soft(g, x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 8 + r() * 16, k % 3 ? [70, 60, 50] : [150, 80, 40], 0.1 + r() * 0.12);
      g.restore();
      rim(g, sheet, r, 0.25, 0.3);
      for (const [nx, ny] of [[x0 + 8, y0 + 7 + sk], [x1 - 8, y0 + 7 - sk], [x0 + 8, y1 - 7], [x1 - 8, y1 - 7], [(x0 + x1) / 2, y0 + 6], [(x0 + x1) / 2, y1 - 6]]) {         // nails and the rust they weep
        g.strokeStyle = `rgba(150,72,30,${0.3 + r() * 0.2})`; g.lineWidth = 2; g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx + (r() - 0.5) * 3, ny + 8 + r() * 16); g.stroke();
        g.fillStyle = 'rgba(36,32,30,0.95)'; g.beginPath(); g.arc(nx, ny, 2.6, 0, 7); g.fill(); g.fillStyle = 'rgba(220,224,228,0.7)'; g.beginPath(); g.arc(nx - 0.8, ny - 0.8, 0.9, 0, 7); g.fill();
      }
    } else {                                                             // boards nailed over a hole: three planks and a batten across them
      const x0 = w * 0.2, x1 = w * 0.8, y0 = h * 0.13, y1 = h * 0.87, n = 3, bw = (x1 - x0) / n, WOOD = [[124, 100, 72], [108, 90, 70], [136, 112, 82], [96, 82, 66]];
      g.save(); g.shadowColor = 'rgba(18,12,6,0.62)'; g.shadowBlur = 6; g.shadowOffsetX = 2.5; g.shadowOffsetY = 4; g.fillStyle = '#6a5a46'; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.restore();
      for (let k = 0; k < n; k++) {
        const bx = x0 + k * bw, top = y0 + (r() - 0.5) * 5, bot = y1 + (r() - 0.5) * 5, c = WOOD[Math.floor(r() * WOOD.length)];
        g.fillStyle = rgba(c, 1); g.fillRect(bx + 1, top, bw - 2, bot - top);
        for (let q = 0; q < 7; q++) { g.strokeStyle = `rgba(30,22,14,${0.12 + r() * 0.2})`; g.lineWidth = 0.8 + r() * 1.2; const gx = bx + 3 + r() * (bw - 6); g.beginPath(); g.moveTo(gx, top); g.bezierCurveTo(gx + (r() - 0.5) * 6, top + (bot - top) * 0.3, gx + (r() - 0.5) * 6, top + (bot - top) * 0.7, gx + (r() - 0.5) * 4, bot); g.stroke(); }
        const gr = g.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.15, 'rgba(255,255,255,0)'); gr.addColorStop(0.85, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = gr; g.fillRect(bx + 1, top, bw - 2, bot - top);
        g.fillStyle = 'rgba(20,14,8,0.5)'; g.fillRect(bx, top, 1.5, bot - top);                                                                   // the dark gap between planks
      }
      const by = y0 + (y1 - y0) * (0.42 + 0.1 * r());
      g.save(); g.shadowColor = 'rgba(18,12,6,0.6)'; g.shadowBlur = 4; g.shadowOffsetX = 1.5; g.shadowOffsetY = 3; g.fillStyle = 'rgb(116,96,72)'; g.fillRect(x0 - 5, by, x1 - x0 + 10, 15); g.restore();
      for (let q = 0; q < 4; q++) { g.strokeStyle = `rgba(30,22,14,${0.15 + r() * 0.2})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 - 4, by + 3 + q * 3); g.lineTo(x1 + 4, by + 3 + q * 3 + (r() - 0.5) * 2); g.stroke(); }
      for (const [nx, ny] of [[x0 - 1, by + 7.5], [(x0 + x1) / 2, by + 7.5], [x1 + 1, by + 7.5], [x0 + bw / 2, y0 + 8], [x0 + bw * 1.5, y0 + 8], [x0 + bw * 2.5, y0 + 8], [x0 + bw / 2, y1 - 8], [x0 + bw * 1.5, y1 - 8], [x0 + bw * 2.5, y1 - 8]]) {
        g.strokeStyle = `rgba(110,60,30,${0.25 + r() * 0.2})`; g.lineWidth = 1.6; g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx, ny + 6 + r() * 10); g.stroke();
        g.fillStyle = 'rgba(30,26,22,0.95)'; g.beginPath(); g.arc(nx, ny, 2.2, 0, 7); g.fill();
      }
    }
  },
  crack(g, w, h, i, r) {
    let x = w * (0.1 + 0.2 * r()), y = 2; const pts = [[x, y]];
    while (y < h * 0.82) { x = clamp(x + (r() - 0.35) * 22, 6, w - 6); y += 6 + r() * 14; pts.push([x, y]); }
    const stroke = (a, wd, col) => { g.strokeStyle = col; g.lineWidth = wd; g.lineJoin = 'round'; g.beginPath(); a.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); };
    stroke(pts.map((p) => [p[0] + 1.2, p[1]]), 2.2, 'rgba(255,255,255,0.22)');
    stroke(pts, 2, 'rgba(34,26,20,0.82)');
    for (let b = 0; b < 2; b++) { const k = 2 + Math.floor(r() * Math.max(1, pts.length - 4)), br = [pts[Math.min(k, pts.length - 1)]]; let bx = br[0][0], by = br[0][1]; for (let s = 0; s < 4; s++) { bx = clamp(bx + (r() - 0.2) * 16 * (b ? -1 : 1), 4, w - 4); by += 5 + r() * 9; br.push([bx, Math.min(by, h * 0.9)]); } stroke(br, 1.3, 'rgba(34,26,20,0.7)'); }
    fade(g, w, h, [0.05, 0.05, 0, 0.15]);
  },
  tag(g, w, h, i, r) {                                                      // white marker: the vertex tint colours it
    g.lineCap = 'round'; g.lineJoin = 'round'; g.fillStyle = 'rgba(255,255,255,0.96)'; g.strokeStyle = 'rgba(255,255,255,0.96)';
    if (i < TAGNAMES.length) {
      const t = TAGNAMES[i], face = '"Segoe Print", "Brush Script MT", "Comic Sans MS", cursive';
      g.font = `italic 900 ${h * 0.6}px ${face}`; const mw = g.measureText(t).width, px = h * 0.6 * Math.min(1, (w * 0.82) / Math.max(1, mw));
      g.save(); g.translate(w / 2, h * 0.46); g.rotate((r() - 0.5) * 0.16); g.font = `italic 900 ${px}px ${face}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 7; g.strokeText(t, 0, 0); g.fillText(t, 1.5, 1); g.restore();
      g.lineWidth = 5; g.beginPath(); g.moveTo(w * 0.12, h * 0.82); g.quadraticCurveTo(w * 0.5, h * (0.9 + r() * 0.06), w * 0.9, h * 0.78); g.stroke();
      g.lineWidth = 3; for (let k = 0; k < 3; k++) { const dx = w * (0.22 + 0.56 * r()), y0 = h * 0.66, L = 8 + r() * 18; g.beginPath(); g.moveTo(dx, y0); g.lineTo(dx, y0 + L); g.stroke(); g.beginPath(); g.arc(dx, y0 + L, 2.6, 0, 7); g.fill(); }
    } else {                                                                  // a scribbled signature: a looping line, a star and (on one) a crown
      g.lineWidth = 7; g.beginPath(); let x = w * 0.14, y = h * 0.6, a = -0.4; g.moveTo(x, y);
      for (let k = 0; k < 26; k++) { a += (r() - 0.5) * 2.4; x = clamp(x + Math.cos(a) * 15 + 4, 10, w - 10); y = clamp(y + Math.sin(a) * 15, 12, h - 12); g.lineTo(x, y); }
      g.stroke();
      g.lineWidth = 4; g.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? 7 : 16, aa = (k / 10) * 6.283 - 1.57, px = w * 0.86 + Math.cos(aa) * rr, py = h * 0.26 + Math.sin(aa) * rr; if (k === 0) g.moveTo(px, py); else g.lineTo(px, py); } g.closePath(); g.stroke();
      if (i === 9) { g.beginPath(); g.moveTo(w * 0.1, h * 0.3); g.lineTo(w * 0.16, h * 0.12); g.lineTo(w * 0.22, h * 0.24); g.lineTo(w * 0.28, h * 0.12); g.lineTo(w * 0.34, h * 0.3); g.closePath(); g.stroke(); }
    }
  },
  soot(g, w, h, i, r) {
    for (let k = 0; k < 70; k++) {
      const t = k / 70, y = h * (0.92 - 0.8 * t), sp = 6 + 38 * t, x = w / 2 + Math.sin(t * 5 + i) * 9 * t + (r() - 0.5) * sp;
      g.fillStyle = `rgba(22,20,18,${0.055 * (1 - t * 0.7)})`; g.beginPath(); g.arc(x, y, 5 + 15 * t, 0, 7); g.fill();
    }
    fadeRound(g, w, h, 0.35);
  },
  stain(g, w, h, i, r) {
    const cx = w / 2, cy = h * 0.46;
    for (let k = 0; k < 6; k++) { blob(g, cx + (r() - 0.5) * 12, cy + (r() - 0.5) * 12, Math.min(w, h) * (0.4 - k * 0.05), r, 5, 0.12); g.fillStyle = `rgba(66,54,40,${0.07 + k * 0.012})`; g.fill(); }
    blob(g, cx, cy, Math.min(w, h) * 0.38, r, 5, 0.12); g.lineWidth = 2.5; g.strokeStyle = 'rgba(52,42,30,0.22)'; g.stroke();
    for (let k = 0; k < 24; k++) { g.fillStyle = `rgba(36,28,18,${0.04 + r() * 0.06})`; g.beginPath(); g.arc(cx + (r() - 0.5) * w * 0.5, cy + (r() - 0.5) * h * 0.5, 2 + r() * 8, 0, 7); g.fill(); }
    fadeRound(g, w, h, 0.6);
  },
  rust(g, w, h, i, r) {
    g.lineCap = 'round';
    const n = 2 + (i % 2);
    for (let k = 0; k < n; k++) {
      const x0 = w * (0.3 + 0.4 * r()), len = h * (0.55 + 0.4 * r()), wd = 3 + r() * 5, grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, 'rgba(150,70,30,0.6)'); grd.addColorStop(0.6, 'rgba(130,64,30,0.28)'); grd.addColorStop(1, 'rgba(120,60,30,0)');
      g.strokeStyle = grd; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, 4); for (let y = 8; y <= len; y += 8) g.lineTo(x0 + Math.sin(y * 0.07 + k) * 2.5, y); g.stroke();
    }
    g.fillStyle = 'rgba(150,70,30,0.22)'; g.beginPath(); g.ellipse(w / 2, 9, w * 0.3, 5, 0, 0, 7); g.fill();
    fade(g, w, h, [0.12, 0.12, 0, 0.15]);
  },
  efflor(g, w, h, i, r) {
    // Salts on brick: the lower courses are dark with wet, and a thin bloom of white dust lies on them, thickest under the top of the wet where it dried out. A crust, not a stripe.
    const lo = fbm(r, w + 4), hi = fbm(r, w + 4, [[1, 30], [0.5, 11], [0.2, 4]]), reach = new Float32Array(w), dark = [44, 30, 24], salt = [238, 235, 224];
    for (let x = 0; x < w; x++) {
      reach[x] = clamp(0.6 + 0.14 * lo[x] + 0.2 * Math.max(0, hi[x]), 0.25, 0.97);
      const top = h * (1 - reach[x]), gr = g.createLinearGradient(0, top, 0, h);
      gr.addColorStop(0, rgba(dark, 0)); gr.addColorStop(0.5, rgba(dark, 0.12)); gr.addColorStop(1, rgba(dark, 0.36));
      g.fillStyle = gr; g.fillRect(x, 0, 1, h);
      const bl = g.createLinearGradient(0, top - 3, 0, top + h * 0.5), thick = 0.07 + 0.2 * Math.max(0, hi[x]) + 0.03 * lo[x];
      bl.addColorStop(0, rgba(salt, 0)); bl.addColorStop(0.2, rgba(salt, Math.max(0.03, thick))); bl.addColorStop(1, rgba(salt, 0));
      g.fillStyle = bl; g.fillRect(x, 0, 1, h);
    }
    for (let k = 0; k < 12; k++) {                                                                                                                               // thicker crust here and there: wide and low, laid along the courses
      const x = r() * w, y = h * (1 - reach[x | 0] * (0.5 + 0.45 * r())), rad = 10 + r() * 20;
      g.save(); g.translate(x, y); g.scale(1, 0.28); soft(g, 0, 0, rad, salt, 0.12 + r() * 0.12); g.restore();
    }
    for (let k = 0; k < 110; k++) { const x = r() * w; g.fillStyle = rgba(salt, 0.18 + r() * 0.4); g.fillRect(x, h * (1 - reach[x | 0] * (0.4 + 0.6 * r())), 0.8 + r() * 2.4, 0.7 + r() * 1.1); }   // crystals along the mortar
    fade(g, w, h, [0.12, 0.12, 0, 0]);
  },
};

/** The painters by kind: `(g, w, h, variant, rng)`. Exported so that a test can run one on a recording canvas. */
export const PAINTERS = PAINT;

/** Paint the atlas. Returns { texture, uv:{ 'kind:i': [u0,v0,u1,v1] } (v0 = bottom edge), canvas, size, count, failed } or null without a DOM canvas. */
export function paintDecalAtlas(THREE_ = THREE, extra = []) {
  if (typeof document === 'undefined') return null;
  const items = [];
  for (const [kind, d] of Object.entries(ITEMS)) for (let i = 0; i < d.n; i++) items.push({ key: `${kind}:${i}`, kind, i, w: d.w, h: d.h });
  for (const e of extra) items.push({ key: e.key, kind: e.key, i: 0, w: e.w, h: e.h, paint: e.paint });                       // lettering painted on a wall (signs.js `paintedItems`)
  items.sort((a, b) => b.h - a.h || b.w - a.w);
  let x = GUT, y = GUT, rowH = 0;
  for (const it of items) {
    if (x + it.w + GUT > W) { x = GUT; y += rowH + 2 * GUT; rowH = 0; }
    it.x = x; it.y = y; x += it.w + 2 * GUT; rowH = Math.max(rowH, it.h);
  }
  const H = Math.min(2048, Math.ceil((y + rowH + GUT) / 4) * 4);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
  const uv = {}, failed = [];
  for (const it of items) {
    g.save(); g.beginPath(); g.rect(it.x - GUT, it.y - GUT, it.w + 2 * GUT, it.h + 2 * GUT); g.clip(); g.translate(it.x, it.y);
    // a painter that throws leaves its item blank; it is listed on the atlas (ensureDecalAtlas reports it through ctx.errors), never written to the console
    try { (it.paint ?? PAINT[it.kind])(g, it.w, it.h, it.i, mulberry(Math.floor(hash01(it.kind, it.i + 5) * 1e9))); } catch (e) { failed.push({ key: it.key, message: String(e?.message ?? e) }); }
    g.restore();
    uv[it.key] = [it.x / W, 1 - (it.y + it.h) / H, (it.x + it.w) / W, 1 - it.y / H];
  }
  const tex = new THREE_.CanvasTexture(cv);
  tex.colorSpace = THREE_.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE_.LinearMipmapLinearFilter; tex.magFilter = THREE_.LinearFilter;
  return { texture: tex, uv, canvas: cv, size: [W, H], count: items.length, failed };
}

/** The shared `wall_decal` material: alpha-blended, never writes depth. */
export function decalMaterial(atlas, THREE_ = THREE) {
  const m = new THREE_.MeshStandardMaterial({ map: atlas.texture, roughness: 0.95, metalness: 0, vertexColors: true, envMapIntensity: 0.4, transparent: true, depthWrite: false });
  m.name = 'wall_decal';
  return m;
}

/** Paint once (the first building asks) and seed the material. Browser only: under Node `ctx.decalAtlas` stays null and the marks are faint flat patches. */
export function ensureDecalAtlas(ctx) {
  if (ctx.decalAtlas !== undefined) return ctx.decalAtlas;
  ctx.decalAtlas = null;
  if (typeof document === 'undefined' || !ctx.matlib?.cache) return null;
  try {
    const atlas = paintDecalAtlas(undefined, paintedItems(ctx.plan?.lots));
    if (atlas) {
      ctx.matlib.cache.set('wall_decal', decalMaterial(atlas)); ctx.decalAtlas = atlas;
      for (const f of atlas.failed) (ctx.errors ??= []).push({ stage: 'arch', message: `decal painter ${f.key}: ${f.message}` });
    }
  } catch (e) { (ctx.errors ??= []).push({ stage: 'arch', message: 'decal atlas ' + String(e?.message ?? e), stack: e?.stack }); }
  return ctx.decalAtlas;
}

// ---- the plan ------------------------------------------------------------------------------------------------------------------------------------
const TAG_COLS = [0x16161a, 0x16161a, 0xf2f2f2, 0xc4202a, 0x2a4fb8, 0x2a9a50, 0xe86a1a, 0xaab0b8];
/** Flat stand-in colours (linear) for Node and for a failed atlas. */
const FLAT = { damp: [0.3, 0.26, 0.2], streak: [0.25, 0.22, 0.2], stain: [0.3, 0.26, 0.2], soot: [0.1, 0.1, 0.1], rust: [0.55, 0.3, 0.15], crack: [0.1, 0.09, 0.08], peel: [0.8, 0.76, 0.68], efflor: [0.9, 0.9, 0.86], patch: [0.5, 0.48, 0.44] };
/**
 * The vertex tint (linear) of a mend of this variant on a wall of this colour (linear). A render patch is the wall greyed toward cement, a roller patch is the wall a shade lighter
 * or darker (repainted by someone who did not have the tin): never a second colour from another palette, which read as a sticker. Zinc and boards carry their own colours: null.
 */
export function patchTint(variant, wall) {
  if (variant === 0) return wall.map((v, k) => v * 0.42 + [0.4, 0.38, 0.33][k] * 0.58);
  if (variant === 1) {
    const lum = 0.2126 * wall[0] + 0.7152 * wall[1] + 0.0722 * wall[2], lighter = lum < 0.3;
    return wall.map((v, k) => clamp(v * (lighter ? 1.55 : 0.64) * [1.03, 1, 0.95][k], 0, 1));                      // the same hue a shade off (mixing with white would wash a strong wall out); the paint is thin (see the painter), so the shift is wider than it ends up
  }
  return null;
}

// ---- how high the damp climbs: one level for each lot, no two neighbours alike ---------------------------------------------------------------------------
/** Heights (m) the wet can reach on a front. A lot gets one of them (`assignDampLevels`), so that a street does not wear one tide line from end to end (review R1-D05). */
export const DAMP_LEVELS = [0.34, 0.4, 0.46, 0.52, 0.58, 0.64, 0.7, 0.76, 0.82];
const DAMP_NEAR = 6;                                                          // m between two footprints that still count as neighbours
/**
 * Pick a level for every lot, the same for the same plan: lots in id order, each takes the level that lies furthest from those of the neighbours already chosen (the closest
 * neighbours count double), a hash breaks ties. Returns Map(lot.id -> level).
 */
export function assignDampLevels(lots) {
  const list = [...lots].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), out = new Map();
  for (const lot of list) {
    const gap = (o) => Math.hypot(o.x - lot.x, o.z - lot.z) - (o.w + lot.w) / 2;                   // the clear distance between the two footprints (about: they are boxes, not discs)
    const placed = list.filter((o) => out.has(o.id) && o.id !== lot.id), next = placed.filter((o) => gap(o) < 1.5), near = placed.filter((o) => gap(o) < DAMP_NEAR);
    const away = (list_, v) => list_.reduce((m, o) => Math.min(m, Math.abs(out.get(o.id) - v)), 0.2);        // beyond 0.2 m further is no better: the hash picks among the levels that are far enough
    let best = DAMP_LEVELS[0], bs = -Infinity;
    DAMP_LEVELS.forEach((v, k) => { const s = 2 * away(next, v) + away(near, v) + 0.03 * hash01(`${lot.id}|${k}`, 905); if (s > bs) { bs = s; best = v; } });
    out.set(lot.id, best);
  }
  return out;
}
/** The level of one lot (the plan's lots are computed once per ctx); a lot outside the plan, or no plan at all (a bare planner test), gets the one its id hashes to. */
export function dampLevelOf(ctx, lot, id) {
  const lots = ctx?.plan?.lots ?? [];
  if (lots.length && lot?.id !== undefined) {
    if (!ctx.archDamp || ctx.archDamp.n !== lots.length) ctx.archDamp = { n: lots.length, map: assignDampLevels(lots) };
    const v = ctx.archDamp.map.get(lot.id);
    if (v !== undefined) return v;
  }
  return DAMP_LEVELS[Math.floor(hash01(String(id), 905) * DAMP_LEVELS.length) % DAMP_LEVELS.length];
}
const alongOf = (side, o) => (side === 'front' || side === 'back' ? o.x : o.z);
const FOOD = ['panaderia', 'restaurante', 'cafe', 'carniceria'];

/**
 * What the front (and the free side walls) of one building wear. Returns marks { kind, variant, side, u0, u1, y0, y1, flip, tint, off } in building-local wall
 * coordinates (u along the wall, y up). Deterministic in the building id. Needs the dressing already placed (`G.recs`, `G.balc`) so that no mark lies over a sign,
 * a meter, a unit or a balcony, and `kit.limitAt` so that none rises past the top of the wall.
 */
export function planWeather(G, kit) {
  const { S, bp, fs } = G, fh = S.fh, yF = S.F * fh, yTop = S.openTop ? (S.F - 1) * fh + PRETIL_H : yF, marks = [];
  let ctr = 0; const rnd = () => hash01(bp.id, 1000 + ctr++), hv = (n) => hash01(bp.id, 900 + n);
  const brick = !!fs.brick || kit.kind === 'unfinished', peeling = fs.m === 'paint_peeling_soft';
  const age = (kit.inst ? 0.55 : 1) * (0.2 + 0.8 * hv(0));                                  // 0 freshly painted .. 1 neglected
  // how high the wet climbs: a level for the lot (the front), and a side wall is always a good deal lower or higher than that (a different wall, other ground behind it)
  const level = dampLevelOf(G.ctx, G.lot, bp.id), wallK = (side) => { if (side === 'front') return 1; const t = hv(side === 'left' ? 21 : 22); return t < 0.5 ? 0.6 + 0.5 * t : 0.9 + 0.4 * t; };
  const sides = ['front', ...['left', 'right'].filter((s) => !S.party[s])];
  const occ = { front: [], back: [], left: [], right: [] };
  const addOcc = (side, u0, u1, y0, y1, tag) => occ[side]?.push({ u0, u1, y0, y1, tag });
  for (const w of bp.windows) { const u = alongOf(w.side, w); addOcc(w.side, u - w.w / 2 - 0.06, u + w.w / 2 + 0.06, w.floor * fh + w.y - 0.07, w.floor * fh + w.y + w.h + 0.06, 'window'); }
  for (const d of bp.doors) {
    if (!d.ext) continue;
    const u = alongOf(d.side, d), shop = d.kind === 'shutter', m = shop ? (bp.shopfront?.style === 'wood' ? 0.32 : 0.14) : 0.16;
    addOcc(d.side, u - d.w / 2 - m, u + d.w / 2 + m, d.floor * fh - 0.02, d.floor * fh + d.h + (shop ? 0.36 : 0.14), 'door');
  }
  for (const r of G.recs) addOcc(r.side, r.u0 - 0.04, r.u1 + 0.04, r.y0 - 0.04, r.y1 + 0.04, r.kind);
  if (kit.pilasters) for (const sg of [-1, 1]) if (!(sg < 0 ? S.party.left : S.party.right)) addOcc('front', Math.min(sg * S.W / 2, sg * (S.W / 2 - 0.3)) - 0.03, Math.max(sg * S.W / 2, sg * (S.W / 2 - 0.3)) + 0.03, -0.01, yTop, 'pilaster');
  const top = (side, u0, u1) => (side === 'front' ? Math.min(kit.limitAt(u0, u1), yTop - 0.08) : yTop - 0.12);
  const free = (side, u0, u1, y0, y1, ignore) => !occ[side].some((o) => o.tag !== ignore && u1 > o.u0 && u0 < o.u1 && y1 > o.y0 && y0 < o.y1);
  const span = (side) => G.FR[side].span;
  const put = (kind, side, u0, u1, y0, y1, o = {}) => {
    const m = { kind, variant: o.variant ?? Math.floor(rnd() * ITEMS[kind].n), side, u0, u1, y0, y1, flip: !NOFLIP.has(kind) && rnd() < 0.5, tint: o.tint ?? null, off: OFF };
    marks.push(m);
    if (HARD.has(kind)) addOcc(side, u0 - 0.05, u1 + 0.05, y0 - 0.05, y1 + 0.05, kind);
    return m;
  };
  /** Try to drop one mark of `kind` about h tall (its width follows the picture's aspect) somewhere in the region; returns the mark or null. */
  const place = (kind, side, h, reg, o = {}) => {
    const w = h * aspect(kind) * (0.9 + 0.25 * rnd());
    if (reg.u1 - reg.u0 < w || reg.y1 - reg.y0 < h) return null;
    for (let k = 0; k < (o.tries ?? 16); k++) {
      const y0 = reg.y0 + (reg.y1 - reg.y0 - h) * rnd(), u0 = reg.u0 + (reg.u1 - reg.u0 - w) * rnd();
      if (y0 + h > top(side, u0, u0 + w) || !free(side, u0, u0 + w, y0, y0 + h)) continue;
      return put(kind, side, u0, u0 + w, y0, y0 + h, o);
    }
    return null;
  };
  const wallReg = (side, y0 = 0.15) => ({ u0: -span(side) / 2 + 0.15, u1: span(side) / 2 - 0.15, y0, y1: yTop - 0.2 });
  const keyed = (list, salt) => list.map((q) => ({ q, k: hash01(String(q.id), salt) })).sort((a, b) => a.k - b.k).map((e) => e.q);

  for (const side of sides) {
    const front = side === 'front', sp = span(side), lo = -sp / 2 + 0.06, hi = sp / 2 - 0.06;
    // -- rising damp (salts on brick) along the foot of the wall, in runs between whatever reaches down to it (doors, the drainpipe, pilasters, a shutter housing)
    const gaps = [[lo, hi]];
    for (const o of occ[side]) {
      if (o.y0 >= 0.3 || o.y1 <= 0.05) continue;
      for (let k = gaps.length - 1; k >= 0; k--) { const [g0, g1] = gaps[k]; if (o.u1 > g0 && o.u0 < g1) { gaps.splice(k, 1); if (o.u0 - g0 > 0.5) gaps.push([g0, o.u0]); if (g1 - o.u1 > 0.5) gaps.push([o.u1, g1]); } }
    }
    if (rnd() < 0.45 + 0.55 * age) for (const [g0, g1] of gaps.sort((p, q) => p[0] - q[0])) {
      if (g1 - g0 < 0.6) continue;
      const n = Math.ceil((g1 - g0) / 2.8);
      for (let k = 0; k < n; k++) {
        const a = g0 + ((g1 - g0) * k) / n, b = g0 + ((g1 - g0) * (k + 1)) / n, hgt = clamp(level * wallK(side) + (rnd() - 0.5) * 0.06, 0.26, 1.05);
        const low = occ[side].filter((o) => o.u1 > a && o.u0 < b && o.y1 > 0.05).reduce((m, o) => Math.min(m, o.y0), Infinity);      // the lowest window sill or unit above this run
        const h2 = Math.min(hgt, low - 0.06);
        if (h2 < 0.24) continue;
        if (brick) put('efflor', side, a + 0.05, b - 0.05, 0, Math.min(h2, 0.8)); else put('damp', side, a, b, 0, h2);
      }
    }
    // -- rain streaks: under sills, under balcony slabs, down from the top of the wall
    if (rnd() < 0.55 + 0.45 * age) for (const w of bp.windows) {
      if (w.side !== side || rnd() > 0.3 + 0.5 * age) continue;
      const wu = alongOf(side, w), yb = w.floor * fh + w.y - 0.07, n = w.w > 1.5 || rnd() < 0.3 ? 2 : 1;                 // one or two runs under a sill
      for (let k = 0; k < n; k++) {
        const u = wu + (n === 1 ? (rnd() - 0.5) * (w.w - 0.4) : (k - 0.5) * (w.w - 0.3) + (rnd() - 0.5) * 0.1), wd = 0.18 + 0.2 * rnd();
        let L = Math.min(0.5 + 0.9 * rnd(), yb - 0.05);
        while (L >= 0.25 && !free(side, u - wd / 2, u + wd / 2, yb - L, yb)) L -= 0.1;
        if (L >= 0.25) put('streak', side, u - wd / 2, u + wd / 2, yb - L, yb);
      }
    }
    if (front) for (const bl of G.balc ?? []) {
      if (rnd() > 0.3 + 0.55 * age) continue;
      for (const sg of [-1, 1]) {
        const u = bl.u + sg * (bl.len / 2 - 0.25), yb = bl.yk - 0.2;
        let L = Math.min(0.6 + 0.8 * rnd(), yb - 0.05);
        while (L >= 0.3 && !free(side, u - 0.17, u + 0.17, yb - L, yb)) L -= 0.1;
        if (L >= 0.3) put('streak', side, u - 0.17, u + 0.17, yb - L, yb);
      }
    }
    const nTop = Math.floor(rnd() * (1 + 3 * age));
    for (let k = 0; k < nTop; k++) {
      const u = lo + 0.3 + (hi - lo - 0.6) * rnd(), yt = top(side, u - 0.17, u + 0.17) - 0.03;
      let L = 0.9 + 0.9 * rnd();
      while (L >= 0.35 && !free(side, u - 0.17, u + 0.17, yt - L, yt)) L -= 0.15;
      if (L >= 0.35 && yt - L > 0.3) put('streak', side, u - 0.17, u + 0.17, yt - L, yt);
    }
    // -- soot over a window of a food shop (or, now and then, a home), and a leak stain
    if (front && !kit.inst && !brick && rnd() < 0.15 + 0.2 * age + (FOOD.includes(G.lot.shop) ? 0.45 : 0)) {
      for (const w of keyed(bp.windows.filter((q) => q.side === 'front'), 61).slice(0, 3)) {
        const L = 0.8 + 0.5 * rnd(), ww = L * aspect('soot'), u = w.x + (rnd() - 0.5) * 0.3, y0 = w.floor * fh + w.y + w.h + 0.08;
        if (u - ww / 2 >= lo && u + ww / 2 <= hi && y0 + L < top(side, u - ww / 2, u + ww / 2) && free(side, u - ww / 2, u + ww / 2, y0, y0 + L)) { put('soot', side, u - ww / 2, u + ww / 2, y0, y0 + L); break; }
      }
    }
    if (rnd() < 0.25 + 0.45 * age) place('stain', side, 0.7 + 0.7 * rnd(), wallReg(side, 1.0), { tries: 14 });
    // -- peeling and repaired patches, cracks at the corners of windows
    if (!brick) {
      const nPeel = Math.round(age * (peeling ? 1 : front ? 2.6 : 1.6) * (0.5 + rnd()));
      for (let k = 0; k < nPeel; k++) place('peel', side, 0.4 + 0.55 * rnd(), wallReg(side, 0.5));
      const nPatch = (rnd() < 0.55 ? 1 : 0) + (age > 0.65 && rnd() < 0.6 ? 1 : 0);
      for (let k = 0; k < nPatch; k++) {
        const u = rnd(), variant = u < 0.3 ? 0 : u < 0.65 ? 1 : u < 0.82 ? 2 : 3;                      // a render patch, a roller-painted square, a sheet of zinc, boards
        place('patch', side, 0.35 + 0.35 * rnd(), wallReg(side, 0.4), { variant, tint: patchTint(variant, fs.wall) });
      }
    }
    if (rnd() < 0.2 + 0.4 * age) {
      for (const w of keyed(bp.windows.filter((q) => q.side === side), 62).slice(0, 2)) {
        const sg = rnd() < 0.5 ? -1 : 1, L = 0.5 + 0.35 * rnd(), cw = L * aspect('crack'), u = alongOf(side, w) + sg * (w.w / 2 + 0.07 + cw / 2), y1 = w.floor * fh + w.y + w.h + 0.04;
        if (u - cw / 2 >= lo && u + cw / 2 <= hi && y1 - L > 0.2 && y1 < top(side, u - cw / 2, u + cw / 2) && free(side, u - cw / 2, u + cw / 2, y1 - L, y1)) { put('crack', side, u - cw / 2, u + cw / 2, y1 - L, y1); break; }
      }
    }
    // -- graffiti on the ground floor (more where there is a shop), rust running from the end of a shutter housing
    const nTag = front ? (kit.shops ? (rnd() < 0.8 ? 1 : 0) + (rnd() < 0.35 ? 1 : 0) : rnd() < 0.45 ? 1 : 0) : rnd() < 0.4 ? 1 : 0;       // the bare side walls are where the writers stand
    for (let k = 0; k < nTag; k++) place('tag', side, 0.28 + 0.2 * rnd(), { u0: lo, u1: hi, y0: 0.7, y1: 2.0 }, { tint: lin(TAG_COLS[Math.floor(rnd() * TAG_COLS.length)]), tries: 22 });
    if (front) {
      const d = kit.shopDoor;
      if (d && ['steel', 'painted', 'ajar'].includes(bp.shopfront?.style) && rnd() < 0.6 + 0.3 * age) {
        const sg = rnd() < 0.5 ? -1 : 1, u = d.x + sg * (d.w / 2 + 0.17), L = 0.7 + 0.5 * rnd();
        const aw = G.recs.find((r) => r.kind === 'awning' && r.u1 + 0.04 > u - 0.08 && r.u0 - 0.04 < u + 0.08), yt = aw ? aw.y0 - 0.06 : d.h + 0.28;     // under an awning it drips from the bracket, below the valance
        if (Math.abs(u) < S.W / 2 - 0.1 && yt - L > 0.3 && yt < top('front', u - 0.08, u + 0.08) && free('front', u - 0.08, u + 0.08, yt - L, yt, 'door')) put('rust', 'front', u - 0.07, u + 0.07, yt - L, yt);
      }
    }
  }

  // every front wears at least three kinds, whatever else was in the way: scan the free wall for the first spot that takes a smaller mark
  const kinds = () => new Set(marks.filter((m) => m.side === 'front').map((m) => m.kind));
  const scan = (kind, h, y0, y1, o) => {
    for (const k of [1, 0.8, 0.6, 0.45]) {
      const hh = h * k, w = hh * aspect(kind);
      for (let y = y0; y + hh <= y1 + 1e-9; y += 0.2) for (let u = -S.W / 2 + 0.1; u + w <= S.W / 2 - 0.1 + 1e-9; u += 0.2) {
        if (y + hh <= top('front', u, u + w) && free('front', u, u + w, y, y + hh)) return put(kind, 'front', u, u + w, y, y + hh, o);
      }
    }
    return null;
  };
  /** Damp keeps to the foot of the wall (a run as wide as will fit, as high as the lot's level) and never floats. */
  const scanDamp = () => {
    for (const k of [1, 0.8, 0.6]) {
      const hh = level * k;
      for (const wd of [2.6, 1.8, 1.2, 0.8]) for (let u = -S.W / 2 + 0.1; u + wd <= S.W / 2 - 0.1 + 1e-9; u += 0.2) if (hh <= top('front', u, u + wd) && free('front', u, u + wd, 0, hh)) return put('damp', 'front', u, u + wd, 0, hh);
    }
    return null;
  };
  const FORCE = { damp: scanDamp, streak: () => scan('streak', 0.8, 0.2, yTop), stain: () => scan('stain', 0.7, 0.3, yTop), peel: () => scan('peel', 0.45, 0.3, yTop), patch: () => scan('patch', 0.35, 0.3, yTop, { variant: 0, tint: patchTint(0, fs.wall) }), crack: () => scan('crack', 0.45, 0.3, yTop) };
  for (const k of ['damp', 'streak', 'stain', 'peel', 'patch', 'crack']) { if (kinds().size >= 3) break; if (!kinds().has(k)) FORCE[k](); }
  // the condensate of an air-conditioner dribbles down the wall under it (more where the paint is old). Planned last, from hashes of its own, so that no other mark moves.
  for (const a of G.recs) {
    if (a.kind !== 'ac') continue;
    const k = (n) => hash01(`${bp.id}|${a.u0}`, n), yb = a.y0 - 0.02;
    if (k(1600) > 0.4 + 0.5 * age) continue;
    const wd = 0.16 + 0.1 * k(1601), u = (a.u0 + a.u1) / 2 + (k(1602) - 0.5) * 0.3;
    let L = Math.min(0.55 + 0.7 * k(1603), yb - 0.05);
    const onUnit = (y0, y1) => G.recs.some((q) => q !== a && q.kind === 'ac' && q.side === a.side && q.u1 > u - wd / 2 && q.u0 < u + wd / 2 && q.y1 > y0 && q.y0 < y1);        // (the ignore below is for this unit's own margin; a unit lower down still stops it)
    while (L >= 0.25 && (!free(a.side, u - wd / 2, u + wd / 2, yb - L, yb, 'ac') || onUnit(yb - L, yb))) L -= 0.1;
    if (L >= 0.25) put('streak', a.side, u - wd / 2, u + wd / 2, yb - L, yb, { variant: Math.floor(k(1604) * ITEMS.streak.n) % ITEMS.streak.n });
  }
  return marks;
}

/** Quads for the planned marks (the soft stains first, then the marks that cover them). Records every mark on `bp.facade`. */
export function drawWeather(G, marks) {
  const A = G.ctx.decalAtlas ?? null;
  for (const m of [...marks.filter((q) => !HARD.has(q.kind)), ...marks.filter((q) => HARD.has(q.kind))]) {
    const fr = G.FR[m.side], uc = (m.u0 + m.u1) / 2, yc = (m.y0 + m.y1) / 2, hw = (m.u1 - m.u0) / 2, hh = (m.y1 - m.y0) / 2, c = fr.at(uc, yc, m.off), r = crs(UP, fr.n);
    const P = (sx, sy) => [c[0] + r[0] * hw * sx, c[1] + hh * sy, c[2] + r[2] * hw * sx];
    const rect = A?.uv?.[`${m.kind}:${m.variant}`] ?? null;
    const [ua, ub] = rect ? (m.flip ? [rect[2], rect[0]] : [rect[0], rect[2]]) : [0, 1];
    const col = rect ? (m.tint ?? [1, 1, 1]) : (m.tint ?? FLAT[m.kind] ?? [0.3, 0.3, 0.3]);
    G.b.quad('wall_decal', P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), { uv: rect ? [ua, rect[1], ub, rect[1], ub, rect[3], ua, rect[3]] : undefined, col });
    G.rec(m.kind, m.side, m.u0, m.u1, m.y0, m.y1, m.off, { variant: m.variant });
  }
}

/** Weather the outside of one building: plan, draw, record. Called last in `buildFacade`, once everything else is on the wall. */
export const weatherFacade = (G, kit) => drawWeather(G, planWeather(G, kit));
