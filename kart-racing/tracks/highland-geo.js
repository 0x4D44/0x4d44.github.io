// Highland Fling - shared geometry constants + helpers (no three import).
export const TAU = Math.PI * 2;
export const LOCH = { x: 334, z: 195, rx: 66, rz: 105, y: 0.0 };   // (kept clear of the railway's east hill, and of the road far to the east)
// "Loch Ness": a second loch west of the hairpin, dead ahead at the foot of the long downhill straight. Nessie rears up here, facing the oncoming karts.
export const LOCH2 = { x: -236, z: 438, rx: 66, rz: 70, y: 0.0 };
export const NESS = { x: -226, z: 438, scale: 3.2, splashS: 1345 };   // she surfaces east of the loch's centre, facing +x down the straight; splashS = centre of the soaked road
// the giant piper stands on the island inside the hairpin, facing the approach straight
export const PIPER = { x: -92, z: 394 };
// landmarks by arc length (m)
export const S = { gate: 880, castleA: 860, castleB: 1075, hairpin: 1461, viaduct: 1881, bridge: 1948, piper: 4 };
// burn centre-line (world x,z), flows west -> east into the loch; crosses the road at the humpback bridge
const BURN_CTRL = [[-30, 150], [10, 182], [55, 172], [100, 152], [140, 165], [169.7, 170.2], [200, 178], [236, 190], [270, 198]];
export const BURN = (() => {   // Catmull-Rom smoothed so the stream meanders
  const P = BURN_CTRL, out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 8; k++) { const t = k / 8, t2 = t * t, t3 = t2 * t; out.push([0, 1].map((c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3))); }
  }
  out.push(P[P.length - 1].slice()); return out;
})();
// z = the line (midway between two 6 m terrain rows so the cutting is symmetric); vx0/vx1 = first/last pier; pw/pe = west/east tunnel-portal front faces (on terrain nodes, so the headwalls sit square on a terrain step);
// x0/x1 = overall extent incl. the portals; floor = glen floor, deck = rail level, wall = glen side slope
export const VIADUCT = { z: 237, x0: 84, x1: 234, pw: 90, pe: 228, cx: 176, vx0: 98.6, vx1: 216.2, floor: 3.5, deck: 16.5, wall: 0.24 };
// the road crosses OVER the railway on a high stone viaduct (s range of the bridged glen; terrain is released from the road there)
export const GLEN_S = { a: 1796, b: 1968 };
// the "Banana Express" branch line: a straight single track alongside the road on its left, running between two hills with stone-faced tunnel portals.
// pw/pe = the portal front-face planes (x), z = the line, bw = half the trackbed; the hills sit behind the portals (centre hillDx behind the face, hillRx/hillRz semi-axes, hillH high).
// The golden ticket lies by the road at ticketS (lateral ticketLat, - = left), just before the stretch; the train is dispatched when the leader is `dispatch` m short of portalS (the road s abeam the west portal).
export const RAIL = { z: 309, pw: -90, pe: 48, bw: 3.3, hillH: 19, hillRx: 30, hillRz: 20, hillDx: 13.5, ticketS: 1503, ticketLat: -3, portalS: 1544, dispatch: 26 };
// the rail stretch and its two hills (+ a margin): keep trees, rocks, cottages and the like out of it
export const inRailZone = (x, z, pad = 0) => x > RAIL.pw - 52 - pad && x < RAIL.pe + 52 + pad && Math.abs(z - RAIL.z) < 30 + pad;

export const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export const hash2 = (ix, iz) => { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const vnoise = (x, z) => { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); const a = hash2(ix, iz), c = hash2(ix + 1, iz), d = hash2(ix, iz + 1), e = hash2(ix + 1, iz + 1); return (a + (c - a) * u) * (1 - v) + (d + (e - d) * u) * v; };

// loch "radius" (1 = shoreline of the ellipse), with a wobbly outline; the union of both lochs
export function lochR1(x, z) {
  const dx = (x - LOCH.x) / LOCH.rx, dz = (z - LOCH.z) / LOCH.rz, a = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) * (1 + 0.07 * Math.sin(a * 3 + 1.1) + 0.04 * Math.sin(a * 5 + 0.4));
}
export function lochR2(x, z) {
  const dx = (x - LOCH2.x) / LOCH2.rx, dz = (z - LOCH2.z) / LOCH2.rz, a = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) * (1 + 0.06 * Math.sin(a * 3 + 2.2) + 0.04 * Math.sin(a * 5 + 1.3));
}
export function lochR(x, z) { return Math.min(lochR1(x, z), lochR2(x, z)); }
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
export const BURN_BRIDGE_Y = 12.2;   // bed under the humpback bridge (the road is high here now)
export const burnBed = (t) => (t < BURN_T_BRIDGE ? 13.6 + (BURN_BRIDGE_Y - 13.6) * (t / BURN_T_BRIDGE) : BURN_BRIDGE_Y + (-0.6 - BURN_BRIDGE_Y) * Math.min(1, (t - BURN_T_BRIDGE) / (BURN_LEN - BURN_T_BRIDGE)));
