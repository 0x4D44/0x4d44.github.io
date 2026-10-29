// Apex Karts - track metadata. Pure data + pure helpers (NO three import).
// Layout conventions: x east, z south (+z), y up. Control points form a closed centripetal Catmull-Rom loop.
// points[0] is on the start/finish line (s = 0) and the track runs toward points[1].
// Extra (backwards-compatible) per-track fields used by track.js:
//   itemAt: fractions of the lap where item-box clusters sit; pads: [{ at: fraction, lat: -1..1 of half-width|"line", len, wid }]

import { EXTRA_DEFS } from "./tracks/defs.js";

export const TRACK_DEFS = [
  {
    id: "sunset-coast", name: "Sunset Coast", blurb: "Wide, flowing seaside circuit. Palms, a long boost straight and one sneaky chicane.",
    difficulty: 1, laps: 3, theme: "sunset", width: 20,
    elev: [[0,3],[0.05,3],[0.10,5],[0.15,8.5],[0.19,12],[0.225,6.0],[0.265,1.0],[0.31,0],[0.36,3],[0.41,9.5],[0.46,5],[0.51,1.5],[0.58,6],[0.65,12.5],[0.72,14.5],[0.76,9],[0.80,10.5],[0.84,5.5],[0.89,11],[0.94,6.5],[0.97,3]],
    points: [[-146,0],[-49,0],[49,-6],[146,-15],[244,-10],[320,15],[376,63],[396,134],[388,205],[348,262],[283,290],[220,271],[159,300],[98,278],[56,300],[22,338],[24,384],[-14,420],[-122,425],[-207,403],[-278,364],[-325,303],[-337,222],[-300,159],[-346,98],[-307,39],[-250,2],[-195,0]],
    itemAt: [0.1, 0.27, 0.45, 0.66, 0.86],
    pads: [{ s: 70, lat: "line", len: 11, wid: 5.5 }, { s: 130, lat: 0.5, len: 11, wid: 5.5 }, { s: 200, lat: -0.5, len: 11, wid: 5.5 }, { s: 300, lat: "line", len: 11, wid: 5.5 }, { s: 1390, lat: "line", len: 11, wid: 5.5 }],
  },
  {
    id: "frostbite-pass", name: "Frostbite Pass", blurb: "Icy mountain switchbacks. Tight hairpins reward a good drift.",
    difficulty: 2, laps: 3, theme: "snow", width: 17,
    elev: [[0,0],[0.05,0],[0.093,-2.0],[0.12,-0.5],[0.17,2.5],[0.22,5.5],[0.28,8.0],[0.33,9.6],[0.365,10.2],[0.40,7.5],[0.44,3.5],[0.48,6.5],[0.525,6.0],[0.56,-1.0],[0.62,2.0],[0.67,-2.2],[0.73,1.0],[0.77,3.5],[0.83,5.0],[0.89,1.0],[0.94,0.3],[0.97,0]],
    points: [[-150,0],[-70,0],[0,0],[60,0],[120,0],[150,0],[195,-12],[228,-45],[240,-90],[228,-135],[195,-168],[150,-180],[105,-168],[72,-135],[60,-90],[60,-45],[60,0],[60,45],[60,70],[18,112],[0,130],[-40,130],[-70,136],[-100,130],[-132,143],[-145,175],[-132,207],[-100,220],[-60,224],[-10,214],[40,220],[72,233],[85,265],[72,297],[40,310],[0,312],[-60,304],[-120,314],[-190,310],[-250,310],[-292,292],[-310,250],[-310,200],[-318,150],[-306,100],[-310,60],[-292,18],[-250,0],[-200,0]],
    itemAt: [0.12, 0.28, 0.45, 0.64, 0.85],
    pads: [{ s: 40, lat: "line", len: 11, wid: 5.5 }, { s: 90, lat: 0.5, len: 11, wid: 5.5 }, { s: 90, lat: -0.5, len: 11, wid: 5.5 }, { s: 770, lat: "line", len: 11, wid: 5.5 }, { s: 820, lat: "line", len: 11, wid: 5.5 }],
  },
  {
    id: "neon-docks", name: "Neon Docks", blurb: "Night-time harbour run. Container maze, quayside blast and no room for error.",
    difficulty: 3, laps: 3, theme: "neon", width: 16,
    elev: [[0,0],[0.04,0],[0.10,-0.6],[0.148,-1.0],[0.20,0.5],[0.25,3.5],[0.31,1.5],[0.37,-1.5],[0.43,2.0],[0.48,0.0],[0.54,0.8],[0.615,9.0],[0.645,10.4],[0.70,6.0],[0.74,5.0],[0.78,0.8],[0.82,7.0],[0.87,3.0],[0.92,5.5],[0.955,2.0],[0.98,0]],
    points: [[300,170],[266,170],[240,170],[205,167],[172,158],[150,150],[100,100],[50,50],[0,0],[-50,-50],[-100,-100],[-140,-140],[-175,-168],[-230,-180],[-285,-160],[-322,-110],[-325,-40],[-300,10],[-330,60],[-325,110],[-290,158],[-240,180],[-195,172],[-165,165],[-150,150],[-100,100],[-50,50],[0,0],[50,-50],[100,-100],[140,-140],[175,-165],[215,-170],[252,-153],[292,-172],[340,-168],[395,-138],[435,-85],[430,-25],[408,12],[432,65],[436,120],[420,150],[395,170],[360,170]],
    itemAt: [0.07, 0.22, 0.41, 0.6, 0.88],
    pads: [{ s: 30, lat: "line", len: 11, wid: 5.5 }, { s: 250, lat: "line", len: 11, wid: 5.5 }, { s: 300, lat: 0.5, len: 11, wid: 5.5 }, { s: 300, lat: -0.5, len: 11, wid: 5.5 }, { s: 540, lat: "line", len: 11, wid: 5.5 }, { s: 1330, lat: "line", len: 11, wid: 5.5 }, { s: 1600, lat: "line", len: 11, wid: 5.5 }],
  },
  ...EXTRA_DEFS,
];

// Periodic height profile: elev = [[u, y], ...] with u in [0,1) (fraction of lap), cubic Hermite, C1, wraps.
export function elevAt(elev, u) {
  const n = elev.length;
  u = u - Math.floor(u);
  let i = n - 1;
  for (let k = 0; k < n; k++) if (elev[k][0] > u) { i = (k + n - 1) % n; break; }
  const j = (i + 1) % n, h = (k) => elev[(k + n) % n];
  const u0 = elev[i][0], u1 = elev[j][0] + (j <= i ? 1 : 0), uu = u < u0 ? u + 1 : u;
  const span = u1 - u0, t = (uu - u0) / span;
  const pu = (k) => { const e = h(k); return e[0] + (k < 0 ? -1 : k >= n ? 1 : 0); };
  const m0 = (h(i + 1)[1] - h(i - 1)[1]) / (pu(i + 1) - pu(i - 1));
  const m1 = (h(i + 2)[1] - h(i)[1]) / (pu(i + 2) - pu(i));
  const y0 = elev[i][1], y1 = elev[j][1];
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 * span + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1 * span;
}

// Closed centripetal Catmull-Rom spline through pts ([[x,z],...]); returns [{x,z}] with perSeg samples per segment.
export function splineClosed(pts, perSeg = 24) {
  const n = pts.length, out = [];
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-3;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let k = 0; k < perSeg; k++) {
      const t = t1 + ((t2 - t1) * k) / perSeg;
      const pt = [0, 0];
      for (let c = 0; c < 2; c++) {
        const a1 = ((t1 - t) / (t1 - t0)) * p0[c] + ((t - t0) / (t1 - t0)) * p1[c];
        const a2 = ((t2 - t) / (t2 - t1)) * p1[c] + ((t - t1) / (t2 - t1)) * p2[c];
        const a3 = ((t3 - t) / (t3 - t2)) * p2[c] + ((t - t2) / (t3 - t2)) * p3[c];
        const b1 = ((t2 - t) / (t2 - t0)) * a1 + ((t - t0) / (t2 - t0)) * a2;
        const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
        pt[c] = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
      }
      out.push({ x: pt[0], z: pt[1] });
    }
  }
  return out;
}

// n evenly-spaced-by-index outline points for menu previews.
export function outlinePoints(def, n = 120) {
  const dense = splineClosed(def.points, 24);
  const out = [];
  for (let i = 0; i < n; i++) out.push(dense[Math.floor((i * dense.length) / n)]);
  return out;
}
