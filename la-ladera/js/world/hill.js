// The upper hillside as people really use it (A5): a terraced huerta with its fence, gate board and scarecrow, a roadside cross with candles and flowers,
// boulders and wildflower patches, a clothes line in a back yard. Everything claims its ground through the occupancy grid before the flora runs, so
// no tree grows through a bed. Animated residents (crows, hens, dogs) live in life.js and read what this module records in ctx.world.
import { tube, card } from './mk.js';
import { OCC } from './occupancy.js';
import { TILE } from './sprites.js';
import { wire } from './poles.js';
import { handBoard } from './signs.js';
import { localToWorld } from './kit.js';

const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const scale = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
const W1 = [1, 1, 1];

// ---------------------------------------------------------------------------------------------------- rocks
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return { v, f };
})();

/** A lumpy low-poly boulder (20 faces, flat bottom sunk into the ground). */
function rock(K, x, z, r, rng, grey = 1) {
  const b = K.b('rocks', x, z), gy = K.H(x, z);
  const sx = r * rng.range(0.9, 1.35), sy = r * rng.range(0.55, 0.95), sz = r * rng.range(0.9, 1.35), rot = rng.range(0, 6.2832), cs = Math.cos(rot), sn = Math.sin(rot);
  const base = [0.62, 0.59, 0.54].map((c) => c * grey * rng.range(0.9, 1.08));
  const vs = ICO.v.map((p) => {
    const j = rng.range(0.82, 1.16); let py = p[1] * sy * j; const px = p[0] * sx * j, pz = p[2] * sz * j;
    if (py < -sy * 0.3) py = -sy * 0.3;
    return [x + px * cs + pz * sn, gy + sy * 0.3 + py, z - px * sn + pz * cs];
  });
  for (const [i, j, k] of ICO.f) {
    const a = vs[i], c = vs[j], d = vs[k], ny = ((c[2] - a[2]) * (d[0] - a[0]) - (c[0] - a[0]) * (d[2] - a[2])) ;
    const L = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) * Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]) || 1;
    const sh = 0.78 + 0.3 * Math.max(0, Math.min(1, ny / L + 0.15));
    b.tri('stone_wall', a, c, d, { col: scale(base, sh) });
  }
}

// ---------------------------------------------------------------------------------------------------- the huerta
function huerta(K, R, stats, extra) {
  const { ctx, occ, H, atlas } = K, W = ctx.world, Wd = 13, D = 9.6;
  const anchors = [[58, -56, 16], [-62, -66, 18], [52, -76, 14], [-72, -48, 16], [70, -34, 12]];
  let site = null;
  for (const [ax, az, mr] of anchors) {
    for (let rad = 0; rad <= mr && !site; rad += 1.5) {
      const n = rad === 0 ? 1 : Math.round(rad * 1.4);
      for (let k = 0; k < n && !site; k++) {
        const a = (k / n) * Math.PI * 2 + rad, x = ax + Math.cos(a) * rad, z = az + Math.sin(a) * rad;
        const gx = (H(x + 0.6, z) - H(x - 0.6, z)) / 1.2, gz = (H(x, z + 0.6) - H(x, z - 0.6)) / 1.2, gl = Math.hypot(gx, gz);
        if (gl > 0.5) continue;
        const ry = gl > 0.04 ? Math.atan2(-gx, -gz) : 0;                            // local +z = downhill, local x runs along the contour
        if (K.rectFree(x, z, Wd + 2.4, D + 2.4, ry, { slope: 0.62 })) site = { x, z, ry };
      }
    }
    if (site) break;
  }
  if (!site) return null;
  const { x, z, ry } = site, P = localToWorld(x, z, ry), s = Math.sin(ry), c = Math.cos(ry);
  const bd = K.b('huerta', x, z), cards = K.b('floralow', x, z, { cast: false });
  const uv = (t) => (atlas ? atlas.uv(t) : [0, 0, 1, 1]);
  const kinds = ['maize', 'lettuce', 'beans', 'flowers'];
  for (let i = 0; i < 4; i++) {
    const lz = -D / 2 + 1.1 + i * 2.2, len = Wd - 1.4, kind = kinds[i];
    const corners = [P(-len / 2, lz - 0.75), P(len / 2, lz - 0.75), P(-len / 2, lz + 0.75), P(len / 2, lz + 0.75)].map((q) => H(q[0], q[1]));
    const yb = Math.min(...corners) - 0.2, yt = Math.max(...corners) + 0.15, [mx, mz] = P(0, lz);
    bd.box('ground_dirt#5a3f2c', mx, (yb + yt) / 2, mz, len, yt - yb, 1.5, { ry, col: W1 });
    const step = kind === 'maize' ? 0.55 : kind === 'beans' ? 0.9 : 0.5, r = R.fork('bed' + i);
    for (let u = -len / 2 + 0.35; u < len / 2 - 0.2; u += step) {
      const [px, pz] = P(u + r.range(-0.08, 0.08), lz + r.range(-0.12, 0.12)), gy = H(px, pz) + 0.1;
      for (let q = 0; q < 2; q++) {
        const yaw = ry + q * Math.PI / 2 + r.range(-0.2, 0.2), right = [Math.cos(yaw), 0, -Math.sin(yaw)];
        if (kind === 'maize') card(cards, 'foliage_low', [px, gy - 0.05, pz], right, [0, 1, 0], 0.95, r.range(1.35, 1.8), uv(TILE.REED), scale(rgb(0xd2e2a4), r.range(0.85, 1.1)), [0, 1, 0]);
        else if (kind === 'lettuce') card(cards, 'foliage_low', [px, gy - 0.02, pz], right, [0, 1, 0], 0.62, 0.42, uv(TILE.AGAVE), scale(r.chance(0.25) ? rgb(0xc9a0d8) : rgb(0xb4e6a0), r.range(0.85, 1.1)), [0, 1, 0]);
        else if (kind === 'beans') card(cards, 'foliage_low', [px, gy - 0.02, pz], right, [0, 1, 0], 0.8, r.range(0.9, 1.25), uv(TILE.SHRUB), scale(rgb(0xcfe8a6), r.range(0.85, 1.1)), [0, 1, 0]);
        else card(cards, 'foliage_low', [px, gy - 0.02, pz], right, [0, 1, 0], 0.55, 0.5, uv(TILE.FLOWERS), scale(r.pick([rgb(0xffe6a0), rgb(0xffb070), rgb(0xffffff), rgb(0xf0a0c0)]), r.range(0.9, 1.05)), [0, 1, 0]);
      }
      if (kind === 'beans' && ((u / step) | 0) % 2 === 0) {                           // a cane for the bean vines
        tube(bd, 'wood_pine', [px, gy - 0.1, pz], [px, gy + 1.5, pz], 0.014, 0.01, 4, { col: [0.55, 0.45, 0.3], caps: false });
      }
      stats.crops++;
    }
    stats.beds++;
  }
  // fence round the plot, a gate on the downhill side (local +z)
  const fx = Wd / 2 + 0.6, fz = D / 2 + 0.2, gateHalf = 0.85, post = (lx, lz) => {
    const [px, pz] = P(lx, lz), gy = H(px, pz);
    bd.box('wood_pine#8a6d48', px, gy + 0.55, pz, 0.08, 1.3, 0.08, { col: W1 });
  };
  const rail = (l0x, l0z, l1x, l1z) => {
    const a = P(l0x, l0z), e = P(l1x, l1z), len = Math.hypot(e[0] - a[0], e[1] - a[1]), rr = Math.atan2(-(e[1] - a[1]), e[0] - a[0]);
    for (const hgt of [0.4, 0.85]) bd.box('wood_pine#a2855c', (a[0] + e[0]) / 2, (H(a[0], a[1]) + H(e[0], e[1])) / 2 + hgt, (a[1] + e[1]) / 2, len, 0.045, 0.045, { ry: rr, col: W1 });
    K.seg(a[0], a[1], e[0], e[1], 1.1, 0.06);
  };
  for (let u = -fx; u <= fx + 1e-6; u += 2.17) { post(u, -fz); if (Math.abs(u) > gateHalf + 0.2) post(u, fz); }
  for (let v = -fz + 2.0; v < fz - 0.1; v += 2.0) { post(-fx, v); post(fx, v); }
  post(-gateHalf, fz); post(gateHalf, fz); post(-fx, -fz); post(fx, -fz); post(-fx, fz); post(fx, fz);
  rail(-fx, -fz, fx, -fz); rail(-fx, -fz, -fx, fz); rail(fx, -fz, fx, fz);
  rail(-fx, fz, -gateHalf, fz); rail(gateHalf, fz, fx, fz);
  const [gpx, gpz] = P(-gateHalf - 0.05, fz), outx = s, outz = c;                       // outward normal of the gate side = local +z
  handBoard(K, 'hand.huerta', gpx + outx * 0.06, H(gpx, gpz) + 1.0, gpz + outz * 0.06, outx, outz, 0.95);
  for (let k = -1.5; k <= 1.5; k += 1.5) occ.take(...P(k * 3, 0), 3.4);
  // the scarecrow: a cross of poles, a red shirt, a straw hat, a sack for a face
  const [sx, sz] = P(Wd / 2 - 1.0, -D / 2 + 1.1 + 2.2), sy = H(sx, sz), sb = K.b('huerta', sx, sz);
  tube(sb, 'wood_pine', [sx, sy - 0.1, sz], [sx, sy + 2.05, sz], 0.035, 0.03, 5, { col: [0.55, 0.45, 0.3], caps: true });
  sb.box('wood_pine', sx, sy + 1.45, sz, 1.5, 0.05, 0.05, { ry, col: [0.55, 0.45, 0.3] });
  sb.box('fabric_woven#b5372b', sx, sy + 1.22, sz, 0.5, 0.58, 0.24, { ry, col: W1 });
  sb.box('fabric_woven#b5372b', sx, sy + 1.4, sz, 1.4, 0.14, 0.14, { ry, col: [0.9, 0.9, 0.9] });
  for (const k of [-1, 1]) sb.box('fabric_woven#3b4a66', sx + k * 0.1 * c, sy + 0.6, sz - k * 0.1 * s, 0.17, 0.65, 0.15, { ry, col: W1 });
  sb.cyl('fabric_woven#c9b184', sx, sy + 1.56, sz, 0.14, 0.27, 8, { col: W1 });
  sb.cyl('produce', sx, sy + 1.82, sz, 0.34, 0.025, 10, { col: [0.86, 0.72, 0.38] });
  sb.cyl('produce', sx, sy + 1.84, sz, 0.17, 0.17, 10, { r1: 0.14, col: [0.82, 0.68, 0.34] });
  for (const k of [-1, 1]) sb.box('iron_black', sx + k * 0.05 * c + s * 0.14, sy + 1.66, sz - k * 0.05 * s + c * 0.14, 0.035, 0.035, 0.02, { ry, col: [0.1, 0.1, 0.1] });
  K.post(sx, sz, 0.16, 2.0);
  W.huerta = { x, z, ry, w: Wd, d: D, gate: P(0, fz + 1.4), y: H(x, z) };
  W.scarecrow = { x: sx, z: sz, y: sy, ry };
  extra.push({ id: 'huerta', name: 'La huerta de Don Anselmo', en: 'Four terraces of maize, lettuce, beans and marigolds, hoed by hand on a slope too steep for anything else.', kind: 'story', x: W.huerta.gate[0], z: W.huerta.gate[1], y: H(...W.huerta.gate), radius: 6.5, dy: 4 });
  extra.push({ id: 'espantapajaros', name: 'El espantapájaros', en: 'A scarecrow in a shirt older than the garden; the crows have long since stopped being impressed.', kind: 'object', x: sx, z: sz, y: sy, radius: 3.4, dy: 3 });
  ctx.interact.register({
    id: 'w.scarecrow', kind: 'object', x: sx + s * 0.6, y: sy + 1.3, z: sz + c * 0.6, radius: 3.0, prompt: 'Saludar al espantapájaros',
    use: (cx) => { cx.ui?.toast?.({ tag: 'Huerta', title: 'El espantapájaros', sub: 'Don Anselmo lo vistió con su mejor camisa. Los cuervos ya no le hacen caso.' }, 4200); cx.events?.emit?.('w:scarecrow'); },
  });
  return site;
}

// ---------------------------------------------------------------------------------------------------- the roadside cross
function roadCross(K, R, stats, extra) {
  const { ctx, plan, occ, H } = K, road = plan.streets.find((st) => st.id === 'S1') ?? plan.streets.find((st) => st.kind === 'road');
  if (!road) return;
  const d = road._d, pts = d.pts, hw = road.width / 2;
  // the sharpest bend on the road (a hairpin): turning angle across +-7 m
  let best = null;
  for (let k = 2; k < pts.length - 2; k++) {
    let a = k, b = k; while (a > 0 && Math.abs(d.cum[k] - d.cum[a]) < 7) a--; while (b < pts.length - 1 && Math.abs(d.cum[b] - d.cum[k]) < 7) b++;
    const u = [pts[k][0] - pts[a][0], pts[k][1] - pts[a][1]], v = [pts[b][0] - pts[k][0], pts[b][1] - pts[k][1]];
    const ang = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
    const p = pts[k];
    if (p[1] > 60 || p[1] < -40) continue;                                           // somewhere a walker passes: the middle of the hill
    if (!best || ang > best.ang) best = { k, ang, p, a, b };
  }
  if (!best) return;
  const p = best.p, u = [pts[best.k][0] - pts[best.a][0], pts[best.k][1] - pts[best.a][1]], v = [pts[best.b][0] - pts[best.k][0], pts[best.b][1] - pts[best.k][1]];
  const turn = Math.sign(u[0] * v[1] - u[1] * v[0]) || 1;                           // + : turns right (x east, z south)
  const tl = Math.hypot(v[0] + u[0], v[1] + u[1]) || 1, tx = (u[0] + v[0]) / tl, tz = (u[1] + v[1]) / tl;
  let site = null;
  for (const side of [-turn, turn]) {
    // the outside of the bend is the side the road turns away from
    const nx = -tz * side, nz = tx * side;
    site = K.spot(p[0] + nx * (hw + 1.6), p[1] + nz * (hw + 1.6), { r: 0.9, maxR: 6, mask: OCC.ROAD | OCC.STAIR | OCC.LOT | OCC.DOOR | OCC.PLAZA | OCC.NAV, slope: 0.5, gap: 1.4 });
    if (site) break;
  }
  if (!site) return;
  const [x, z] = site;
  // face the road
  let bd = Infinity, rx = p[0], rz = p[1];
  for (let k = 0; k < pts.length; k++) { const dd = Math.hypot(pts[k][0] - x, pts[k][1] - z); if (dd < bd) { bd = dd; rx = pts[k][0]; rz = pts[k][1]; } }
  const fx = (rx - x) / (bd || 1), fz = (rz - z) / (bd || 1), ry = Math.atan2(fx, fz), c = Math.cos(ry), s = Math.sin(ry), gy = H(x, z), b = K.b('feature', x, z);
  b.box('concrete_bare', x, gy + 0.1, z, 1.1, 0.5, 0.8, { ry, col: [0.82, 0.8, 0.76] });
  b.box('concrete_bare', x, gy + 0.46, z - 0.02, 0.8, 0.22, 0.5, { ry, col: [0.88, 0.86, 0.82] });
  b.box('plaster_rough#f1ede2', x, gy + 1.28, z, 0.11, 1.5, 0.11, { ry, col: W1 });
  b.box('plaster_rough#f1ede2', x, gy + 1.62, z, 0.7, 0.1, 0.1, { ry, col: W1 });
  for (const k of [-1, 1]) {                                                         // two vases of plastic flowers and four candles
    const vx = x + k * 0.36 * c + s * 0.28, vz = z - k * 0.36 * s + c * 0.28;
    tube(b, 'pot_clay', [vx, gy + 0.57, vz], [vx, gy + 0.87, vz], 0.07, 0.1, 7, { col: [0.78, 0.4, 0.25], caps: true });
    const uv = K.atlas ? K.atlas.uv(TILE.FLOWERS) : [0, 0, 1, 1], cb = K.b('floralow', x, z, { cast: false });
    for (let q = 0; q < 3; q++) { const yaw = ry + q * 1.05, right = [Math.cos(yaw), 0, -Math.sin(yaw)]; card(cb, 'foliage_low', [vx, gy + 0.84, vz], right, [0, 1, 0], 0.55, 0.5, uv, scale(R.pick([rgb(0xffffff), rgb(0xffd0d0), rgb(0xffe890)]), 1), [0, 1, 0]); }
  }
  const lights = [];
  for (let k = 0; k < 4; k++) {
    const lx = x + (k - 1.5) * 0.17 * c + s * 0.0, lz = z - (k - 1.5) * 0.17 * s + c * 0.0, cy = gy + 0.57;
    b.cyl('candle_wax', lx + s * 0.02, cy, lz + c * 0.02, 0.035, 0.1 + (k % 2) * 0.04, 6, { col: W1 });
    b.cyl('candle_flame', lx + s * 0.02, cy + 0.11 + (k % 2) * 0.04, lz + c * 0.02, 0.014, 0.04, 5, { r1: 0.004, col: W1 });
    if (k % 2 === 0) lights.push(ctx.lights.add({ x: lx + s * 0.02, y: cy + 0.3, z: lz + c * 0.02, color: 0xffa755, intensity: 2.4, distance: 5, kind: 'candle', flicker: 0.3 }));
  }
  const hbx = x + s * 0.5 + c * 0.7, hbz = z + c * 0.5 - s * 0.7;
  b.box('wood_pine', hbx, gy + 0.3, hbz, 0.05, 0.6, 0.05, { col: [0.5, 0.4, 0.28] });
  handBoard(K, 'hand.gracias', hbx, gy + 0.68, hbz, fx, fz, 0.72);
  K.rect(x, z, 1.1, 0.8, ry, 0.9); occ.take(x, z, 1.3);
  ctx.world.roadCross = { x, z, y: gy, ry };
  extra.push({ id: 'cruzcamino', name: 'La cruz del camino', en: 'A roadside cross with fresh flowers and four candles, kept lit by a family who thanks the hill for a favour no one else knows.', kind: 'shrine', x: x + fx * 1.5, z: z + fz * 1.5, y: gy, radius: 3.6, dy: 3 });
  stats.cross = 1;
}

// ---------------------------------------------------------------------------------------------------- boulders, wildflowers, a back-yard clothes line
const CLOTH = [[0.95, 0.95, 0.92], [0.8, 0.85, 0.95], [0.85, 0.25, 0.22], [0.92, 0.78, 0.25], [0.25, 0.3, 0.38], [0.35, 0.55, 0.8], [0.9, 0.55, 0.65], [0.2, 0.2, 0.22], [0.45, 0.7, 0.45], [0.9, 0.9, 0.55]];

function clothesLine(K, R, lot, stats) {
  const { occ, H } = K, back = [-Math.sin(lot.rotY), -Math.cos(lot.rotY)], ax = [Math.cos(lot.rotY), -Math.sin(lot.rotY)];
  const site = K.spot(lot.x + back[0] * (lot.d / 2 + 3.2), lot.z + back[1] * (lot.d / 2 + 3.2), { r: 3.0, maxR: 6, slope: 0.4, gap: 3 });
  if (!site) return false;
  const [x, z] = site, half = 2.8, laundry = K.one('laundry', { cast: false }), wb = K.one('wires', { cast: false });
  const A = [x - ax[0] * half, z - ax[1] * half], B = [x + ax[0] * half, z + ax[1] * half], ya = H(A[0], A[1]) + 2.15, yb = H(B[0], B[1]) + 2.15;
  const pb = K.b('feature', x, z);
  for (const [p, y0] of [[A, ya], [B, yb]]) { tube(pb, 'wood_pine', [p[0], y0 - 2.25, p[1]], [p[0], y0 + 0.1, p[1]], 0.05, 0.04, 5, { col: [0.5, 0.4, 0.28], caps: true }); K.post(p[0], p[1], 0.07, 2.3); occ.take(p[0], p[1], 0.4); }
  wire(wb, [A[0], ya, A[1]], [B[0], yb, B[1]], 0.18, 0.016, 8);
  const len = 2 * half, m = Math.floor(len / 0.62), ry = Math.atan2(-(B[1] - A[1]), B[0] - A[0]);
  for (let g = 0; g < m; g++) {
    if (!R.chance(0.82)) continue;
    const t = (g + 0.5) / m, px = A[0] + (B[0] - A[0]) * t, pz = A[1] + (B[1] - A[1]) * t, py = ya + (yb - ya) * t - 4 * 0.18 * t * (1 - t);
    const w = R.range(0.32, 0.7), h = R.range(0.4, 0.95), col = R.pick(CLOTH), hx = Math.cos(ry) * w / 2, hz = -Math.sin(ry) * w / 2, k = R.range(0.05, 0.09), bx = -Math.sin(ry) * k, bz = -Math.cos(ry) * k;
    laundry.quad('laundry', [px - hx, py - h, pz - hz], [px + bx, py - h * 0.97, pz + bz], [px, py, pz], [px - hx, py, pz - hz], { col, uv: [0, 0, 1, 0, 1, 1, 0, 1] });
    laundry.quad('laundry', [px + bx, py - h * 0.97, pz + bz], [px + hx, py - h, pz + hz], [px + hx, py, pz + hz], [px, py, pz], { col: scale(col, 0.9), uv: [0, 0, 1, 0, 1, 1, 0, 1] });
  }
  stats.lines++;
  return true;
}

export function buildHill(K) {
  const { ctx, plan, occ, H } = K, R = K.rng('hill'), extra = (ctx.world.extra ??= []);
  const stats = { beds: 0, crops: 0, rocks: 0, flowers: 0, lines: 0, cross: 0 };
  huerta(K, R.fork('huerta'), stats, extra);
  roadCross(K, R.fork('cross'), stats, extra);
  // yards: the two highest houses of the lower clusters that have room behind them
  let placed = 0;
  for (const id of ['L47', 'L41', 'L45', 'L42', 'L40', 'L37']) {
    const lot = plan.lots.find((l) => l.id === id);
    if (lot && placed < 2 && clothesLine(K, R.fork('line' + id), lot, stats)) placed++;
  }
  // boulders: clusters on the free upper ground and the wild flanks
  const rr = R.fork('rocks');
  for (let t = 0; t < 900 && stats.rocks < 70; t++) {
    const x = rr.range(-96, 96), z = rr.range(-96, -26), wild = Math.max((Math.abs(x) - 40) / 40, (-z - 40) / 40);
    if (wild < rr.range(0, 1.2) * 0.8) continue;
    if (!occ.clear(x, z, 1.0, OCC.ROAD | OCC.PLAZA | OCC.STAIR | OCC.LOT | OCC.NAV | OCC.DOOR) || occ.overlaps(x, z, 1.1) || occ.slope(x, z) > 0.75) continue;
    const big = rr.range(0.6, 1.6), n = rr.int(1, 3);
    for (let i = 0; i < n; i++) {
      const a = rr.range(0, 6.28), dd = i ? rr.range(0.9, 1.8) * big : 0, px = x + Math.cos(a) * dd, pz = z + Math.sin(a) * dd, r = i ? big * rr.range(0.3, 0.55) : big;
      if (!occ.clear(px, pz, r * 0.8, OCC.ROAD | OCC.PLAZA | OCC.STAIR | OCC.LOT | OCC.NAV | OCC.DOOR)) continue;
      rock(K, px, pz, r, rr.fork('r' + stats.rocks), rr.range(0.9, 1.1));
      if (r > 0.85) K.post(px, pz, r * 0.8, r * 0.9);
      stats.rocks++;
    }
    occ.take(x, z, big * 0.9);
  }
  // wildflower patches on the open upper slope
  const fr = R.fork('flowers'), uv = K.atlas ? K.atlas.uv(TILE.FLOWERS) : [0, 0, 1, 1];
  for (let t = 0; t < 700 && stats.flowers < 120; t++) {
    const x = fr.range(-96, 96), z = fr.range(-96, -34);
    if (!occ.clear(x, z, 0.5, OCC.ROAD | OCC.PLAZA | OCC.STAIR | OCC.LOT | OCC.NAV | OCC.DOOR | OCC.STEEP) || occ.overlaps(x, z, 0.6)) continue;
    const b = K.b('floralow', x, z, { cast: false }), tint = fr.pick([[1, 1, 1], [1, 0.82, 0.95], [1, 0.95, 0.6], [0.8, 0.85, 1]]);
    const n = fr.int(3, 6);
    for (let i = 0; i < n; i++) {
      const px = x + fr.range(-0.7, 0.7), pz = z + fr.range(-0.7, 0.7), yaw = fr.range(0, 3.14), right = [Math.cos(yaw), 0, -Math.sin(yaw)], s = fr.range(0.5, 0.85);
      card(b, 'foliage_low', [px, H(px, pz) - 0.03 - s * 0.17, pz], right, [0, 1, 0], s, s * 0.85, uv, scale(tint, fr.range(0.85, 1.05)), [0, 1, 0]);   // the tile's bush sits high in the card: sink it so it rests on the ground
    }
    stats.flowers++;
  }
  ctx.world.hill = stats;
  return stats;
}

