// Apex Karts - track metadata. Pure data + pure helpers (NO three import).
// Layout conventions: x east, z south (+z), y up. Control points form a closed centripetal Catmull-Rom loop.
// points[0] is on the start/finish line (s = 0) and the track runs toward points[1].
// Extra (backwards-compatible) per-track fields used by track.js:
//   itemAt: fractions of the lap where item-box clusters sit; pads: [{ at: fraction, lat: -1..1 of half-width|"line", len, wid }]

export const TRACK_DEFS = [
  {
    id: "sunset-coast", name: "Sunset Coast", blurb: "Wide, flowing seaside circuit. Palms, a long boost straight and one sneaky chicane.",
    difficulty: 1, laps: 3, theme: "sunset", width: 20,
    elev: [[0, 0], [0.5, 0]],
    points: [[0,0],[100,0],[200,0],[250,2],[283,14],[296,45],[283,77],[250,90],[215,90],[186,98],[156,83],[122,92],[88,100],[58,122],[42,162],[46,205],[22,240],[-30,255],[-90,252],[-140,232],[-172,190],[-182,130],[-176,70],[-150,20],[-105,2],[-50,0]],
    itemAt: [0.10, 0.27, 0.44, 0.66, 0.85],
    pads: [{ s: 70, lat: "line", len: 11, wid: 6 }, { s: 118, lat: 0.5, len: 11, wid: 6 }, { s: 160, lat: -0.5, len: 11, wid: 6 }, { s: 1250, lat: "line", len: 11, wid: 6 }],
  },
  {
    id: "frostbite-pass", name: "Frostbite Pass", blurb: "Icy mountain switchbacks. Tight hairpins reward a good drift.",
    difficulty: 2, laps: 3, theme: "snow", width: 17,
    elev: [[0, 0], [0.5, 0]],
    points: [[0,-100],[60,-100],[110,-100],[140,-99],[168,-88],[178,-65],[168,-42],[140,-38],[105,-40],[72,-50],[40,-36],[5,-40],[-40,-40],[-70,-34],[-92,-12],[-88,12],[-62,20],[-20,18],[30,26],[75,20],[110,20],[135,30],[146,60],[138,95],[115,118],[75,124],[35,132],[-15,120],[-65,132],[-115,138],[-150,122],[-168,90],[-170,30],[-170,-30],[-160,-75],[-125,-98],[-95,-100],[-60,-100]],
    itemAt: [0.10, 0.30, 0.48, 0.66, 0.86],
    pads: [{ s: 45, lat: "line", len: 11, wid: 5 }, { s: 95, lat: 0.5, len: 11, wid: 5 }, { s: 95, lat: -0.5, len: 11, wid: 5 }, { s: 700, lat: "line", len: 11, wid: 5 }, { s: 1235, lat: "line", len: 11, wid: 5 }],
  },
  {
    id: "neon-docks", name: "Neon Docks", blurb: "Night-time harbour run. Container maze, quayside blast and no room for error.",
    difficulty: 3, laps: 3, theme: "neon", width: 16,
    elev: [[0, 0], [0.5, 0]],
    points: [[280,170],[240,170],[205,167],[172,158],[150,150],[100,100],[50,50],[0,0],[-50,-50],[-100,-100],[-140,-140],[-175,-168],[-230,-180],[-285,-160],[-322,-110],[-325,-40],[-300,10],[-330,60],[-325,110],[-290,158],[-240,180],[-195,172],[-165,165],[-150,150],[-100,100],[-50,50],[0,0],[50,-50],[100,-100],[140,-140],[175,-165],[215,-170],[250,-148],[290,-175],[335,-165],[375,-135],[400,-85],[395,-25],[372,20],[405,65],[405,115],[375,155],[330,170]],
    itemAt: [0.08, 0.26, 0.45, 0.64, 0.84],
    pads: [{ s: 25, lat: "line", len: 11, wid: 5 }, { s: 62, lat: 0.5, len: 11, wid: 5 }, { s: 975, lat: "line", len: 11, wid: 5 }, { s: 1030, lat: 0.55, len: 11, wid: 5 }, { s: 1030, lat: -0.55, len: 11, wid: 5 }, { s: 1075, lat: "line", len: 11, wid: 5 }],
  },
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
