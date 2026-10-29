// Highland Fling - shared geometry constants + helpers (no three import).
export const TAU = Math.PI * 2;
export const LOCH = { x: 320, z: 195, rx: 80, rz: 105, y: 0.0 };
// landmarks by arc length (m)
export const S = { gate: 880, castleA: 860, castleB: 1075, hairpin: 1461, viaduct: 1881, bridge: 1948, piper: 4 };
// burn centre-line (world x,z), flows west -> east into the loch; crosses the road at the humpback bridge
const BURN_CTRL = [[-30, 150], [10, 182], [55, 172], [100, 152], [140, 165], [169.7, 170.2], [200, 178], [236, 194]];
export const BURN = (() => {   // Catmull-Rom smoothed so the stream meanders
  const P = BURN_CTRL, out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 8; k++) { const t = k / 8, t2 = t * t, t3 = t2 * t; out.push([0, 1].map((c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3))); }
  }
  out.push(P[P.length - 1].slice()); return out;
})();
export const VIADUCT = { z: 236, x0: 91, x1: 229, cx: 176 };

export const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export const hash2 = (ix, iz) => { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const vnoise = (x, z) => { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); const a = hash2(ix, iz), c = hash2(ix + 1, iz), d = hash2(ix, iz + 1), e = hash2(ix + 1, iz + 1); return (a + (c - a) * u) * (1 - v) + (d + (e - d) * u) * v; };

// loch "radius" (1 = shoreline of the ellipse), with a wobbly outline
export function lochR(x, z) {
  const dx = (x - LOCH.x) / LOCH.rx, dz = (z - LOCH.z) / LOCH.rz, a = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) * (1 + 0.07 * Math.sin(a * 3 + 1.1) + 0.04 * Math.sin(a * 5 + 0.4));
}
// distance to the burn polyline + arc position t (m) + local direction
export function burnQuery(x, z) {
  let best = 1e9, bt = 0, acc = 0, bi = 0;
  for (let i = 0; i < BURN.length - 1; i++) {
    const [ax, az] = BURN[i], [bx, bz] = BURN[i + 1], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz, l = Math.sqrt(l2);
    let t = ((x - ax) * vx + (z - az) * vz) / l2; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (d < best) { best = d; bt = acc + t * l; bi = i; }
    acc += l;
  }
  return { d: best, t: bt, total: acc, i: bi };
}

// burn bed height by arc position (m): high in the hills, deep under the bridge, down to the loch
export const BURN_LEN = BURN.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - BURN[i][0], p[1] - BURN[i][1]), 0);
export const BURN_T_BRIDGE = burnQuery(169.7, 170.2).t;
export const burnBed = (t) => (t < BURN_T_BRIDGE ? 8.0 + (3.0 - 8.0) * (t / BURN_T_BRIDGE) : 3.0 + (-0.6 - 3.0) * Math.min(1, (t - BURN_T_BRIDGE) / (BURN_LEN - BURN_T_BRIDGE)));
