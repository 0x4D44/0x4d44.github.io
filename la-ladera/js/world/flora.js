// Trees, palms, bananas, shrubs, agaves, grass tufts, bougainvillea drapes and potted plants. All foliage is alpha-tested cards from
// the sprite atlas (one material), trunks are tubes. Groups props.flora.<i>.<j> and props.tufts.<i>.<j> (50 m chunks).
import { card, tube, V } from './mk.js';
import { TILE } from './sprites.js';
import { sprig, hasSheet, CELL, MAT as CARDS } from './cards.js';
import { OCC } from './occupancy.js';
import { ss, vnoise, pointInPoly, polyDistPoint } from './geom.js';
import { vegetationBuilder } from './vegetation.js';

const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const lerpc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
const BLOCK = OCC.ROAD | OCC.PLAZA | OCC.STAIR | OCC.LOT | OCC.STEEP | OCC.NAV | OCC.DOOR;

/** Cards scattered in an ellipsoid (the canopy). */
function canopy(K, b, tile, c0, rx, ry, rz, n, size, r, base, o = {}) {
  const uv = K.atlas ? K.atlas.uv(tile) : [0, 0, 1, 1];
  for (let i = 0; i < n; i++) {
    const u = r.range(-1, 1), phi = r.range(0, Math.PI * 2), k = Math.sqrt(1 - u * u), rad = Math.cbrt(r.range(o.inner ?? 0.25, 1));
    const dx = k * Math.cos(phi) * rad, dy = u * rad, dz = k * Math.sin(phi) * rad;
    const yaw = r.range(0, Math.PI), fwd = [Math.sin(yaw), 0, Math.cos(yaw)], right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const tau = o.droop ? r.range(-0.15, 0.25) : r.range(-0.45, 0.95) * (dy > 0.3 ? 1.2 : 1), up = V.nrm([fwd[0] * Math.sin(tau), Math.cos(tau), fwd[2] * Math.sin(tau)]);
    const w = size * r.range(0.85, 1.25), h = (o.tall ? o.tall : 1) * w, p = [c0[0] + dx * rx, c0[1] + dy * ry, c0[2] + dz * rz];
    const bottom = o.hang ? V.sub(p, V.mul(up, h * 0.15)) : V.sub(p, V.mul(up, h / 2));
    const shade = 0.66 + 0.34 * (dy * 0.5 + 0.5) + r.range(-0.06, 0.06);
    card(b, o.mat ?? 'foliage', bottom, right, up, w, h, uv, scale(lerpc(base, o.alt ?? base, r.next()), shade), V.nrm([dx, dy * 0.8 + 0.45, dz]));
  }
}

/**
 * Photographed eucalyptus sprays (the sheet's cell 0), each HUNG by the tip of its twig from a point in an ellipsoid, the leaves drooping below it: a gum tree's crown is curtains of these.
 * Turned any way round the tree, swung a little off plumb, mirrored half the time. The lighting normal is the crown's (out and up), as the painted canopy's.
 */
function sprays(b, c0, rx, ry, rz, n, size, r, o = {}) {
  for (let i = 0; i < n; i++) {
    const u = r.range(-0.25, 1), phi = r.range(0, Math.PI * 2), k = Math.sqrt(1 - u * u), rad = Math.cbrt(r.range(0.3, 1));
    const dx = k * Math.cos(phi) * rad, dy = u * rad, dz = k * Math.sin(phi) * rad;
    const yaw = r.range(0, Math.PI), swing = r.range(-0.2, 0.3), fwd = [Math.sin(yaw), 0, Math.cos(yaw)], right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const up = V.nrm([fwd[0] * Math.sin(swing), Math.cos(swing), fwd[2] * Math.sin(swing)]);
    const shade = (0.66 + 0.34 * (dy * 0.5 + 0.5) + r.range(-0.06, 0.06)) * (o.gain ?? 1);
    sprig(b, CARDS, CELL.EUCA, [c0[0] + dx * rx, c0[1] + dy * ry, c0[2] + dz * rz], up, right, size * r.range(0.85, 1.2), [shade, shade, shade], V.nrm([dx, dy * 0.8 + 0.45, dz]), { mirror: r.chance(0.5) });
  }
}

/**
 * Photographed branches of a broadleaf almendro (cell 4), each GROWING from a foot inside the crown outward and a little up (the crown's ellipsoid centre `c0`, radii rx ry rz), rolled any way
 * round its own axis, so a crown is a ball of leafy boughs. The foot is a tenth to two fifths of the way out and the branch is about `size` long: its tip comes out a little past the old crown's surface.
 */
function boughs(b, c0, rx, ry, rz, n, size, r, o = {}) {
  for (let i = 0; i < n; i++) {
    const dy = r.range(-0.4, 0.85), k = Math.sqrt(1 - dy * dy), phi = r.range(0, Math.PI * 2), rad = r.range(0.08, 0.4);
    const dx = k * Math.cos(phi), dz = k * Math.sin(phi), foot = [c0[0] + dx * rad * rx, c0[1] + dy * rad * ry, c0[2] + dz * rad * rz];
    const up = V.nrm([dx, dy + 0.25, dz]), s0 = V.nrm(V.cross(up, [0, 1, 0])), u0 = V.cross(s0, up), roll = r.range(0, Math.PI * 2);
    const right = V.nrm(V.add(V.mul(s0, Math.cos(roll)), V.mul(u0, Math.sin(roll))));
    const shade = (0.66 + 0.34 * (dy * 0.5 + 0.5) + r.range(-0.06, 0.06)) * (o.gain ?? 1), t = o.tint ?? [1, 1, 1];
    sprig(b, CARDS, CELL.BROADLEAF, foot, up, right, size * r.range(0.85, 1.1), [shade * t[0], shade * t[1], shade * t[2]], V.nrm([dx, dy * 0.8 + 0.45, dz]), { mirror: r.chance(0.5) });
  }
}

// Trunks wear A1's bark swatches (matdefs.js), so a vertex colour is a TINT on the swatch, not the bark's colour: `bark_dark` averages sRGB 97 66 51 (linear lum 0.07),
// hence tints above 1 for the broadleaf and the palm; the stub of a palm's crown is the green of its boots.
const BARK = { broad: [1.5, 2.5, 3.2], palm: [2.2, 3.8, 4.8], boots: [1.4, 4.6, 3.6] };

/**
 * One piece of a textured trunk, a tube from a to c: the swatch (`aspect` = its height over its width) wraps once round the tube and keeps its proportions, so the swatch's
 * height is 2 pi r x aspect of trunk. `v0` is where the last piece of this trunk ended; returns where the next one starts.
 */
export function trunk(b, mat, a, c, r0, r1, seg, o = {}, v0 = 0, aspect = 1) {
  const per = Math.PI * (r0 + r1) * aspect;
  tube(b, mat, a, c, r0, r1, seg, { turns: 1, vper: per, v0, ...o });
  return v0 + V.len(V.sub(c, a)) / per;
}

// ---------------------------------------------------------------------------------------------------- trees
const TREE_GREEN = rgb(0x6f9a44);                                          // the leaf green of a broadleaf tree unless it is told another (the hillside's own trees vary it)
export function broadTree(K, x, z, o = {}) {
  const r = o.rng, gy = K.H(x, z);
  const h = o.h ?? r.range(5.5, 8), cr = o.crown ?? r.range(2.6, 3.6), tr = o.trunk ?? r.range(0.14, 0.2), lean = r.range(-0.25, 0.25), lean2 = r.range(-0.25, 0.25);
  const b = vegetationBuilder(K, 'almendro', x, gy, z, { height: h, width: cr * 2 });
  const top = [x + lean, gy + h * 0.62, z + lean2], base = o.leaf ?? TREE_GREEN;
  const bark = BARK.broad;
  trunk(b, 'bark_trunk', [x, gy - 0.25, z], top, tr, tr * 0.62, 7, { colFn: (i) => scale(bark, 0.85 + 0.25 * ((i * 37) % 5) / 5) });
  for (let i = 0; i < 3; i++) {                       // limbs
    const a = r.range(0, 6.28), out = cr * r.range(0.45, 0.7), end = [top[0] + Math.cos(a) * out, top[1] + h * r.range(0.14, 0.25), top[2] + Math.sin(a) * out];
    trunk(b, 'bark_trunk', [top[0], top[1] - 0.3, top[2]], end, tr * 0.5, tr * 0.22, 5, { col: scale(bark, 0.95), caps: false });
  }
  if (K.leafCards && !o.tile) boughs(b, [top[0], gy + h * 0.78, top[2]], cr, cr * 0.62, cr * 0.92, o.cards ?? 24, cr, r, { tint: base.map((c, k) => c / TREE_GREEN[k]) });   // (the sheet's boughs are green on their own: a tree's own `leaf` only tints them, by how far it is from the usual green)
  else canopy(K, b, o.tile ?? TILE.BROADLEAF, [top[0], gy + h * 0.78, top[2]], cr, cr * 0.62, cr * 0.92, o.cards ?? 24, cr * 0.95, r, base, { alt: o.alt });
  K.post(x, z, tr + 0.08, 4);
  K.occ.take(x, z, tr + 0.6);
}

// Eucalyptus bark: A1's swatch (pale grey-cream, tan and rust, average sRGB 180 156 138) carries the colour; the tint dirties it: plain, a warmer strip, a brown scar, and a dark
// damp foot (barkAt). The first version was one straight pole of [0.6 0.56 0.49] (sRGB 203 198 188): from the viewpoint it read as a white lamp post with a tuft on top (R1-012).
const EUCA = { pale: [0.86, 0.84, 0.8], strip: [1.0, 0.92, 0.8], scar: [0.55, 0.46, 0.4] };
/** the colour of side `side` of trunk ring `node`, `t` of the way up: a hash (salted per tree) picks scar / strip / plain, the foot is held dark and fades up over the first third */
const barkAt = (t, node, side, salt) => {
  const h = ((side * 7 + (node + salt) * 8 + 6) % 11) / 11, c = h < 0.2 ? EUCA.scar : h < 0.5 ? EUCA.strip : EUCA.pale;
  return scale(c, (0.45 + 0.55 * ss(0, 0.34, t)) * (0.88 + 0.24 * ((side * 53 + (node + salt) * 29) % 7) / 7));
};

export function eucalyptus(K, x, z, o = {}) {
  const r = o.rng, gy = K.H(x, z), h = o.h ?? r.range(11, 17), tr = r.range(0.16, 0.24), lean = r.range(-0.9, 0.9), lz = r.range(-0.9, 0.9);
  const b = vegetationBuilder(K, 'eucalyptus', x, gy, z, { height: h, width: 6 });
  const wob = r.range(0.35, 0.85), ph = r.range(0, 6.28), salt = r.int(0, 10);
  // the trunk: a chain of short tubes on a slow S-curve, flared at the foot, each ring coloured on its own so the bark mottles and fades along the length
  const at = (t) => [x + lean * t + wob * t * Math.sin(ph + t * 4.2), gy + h * t, z + lz * t + wob * t * Math.cos(ph + t * 3.6)];
  const n = Math.max(5, Math.round(h / 2.3)), rad = (t) => tr * (1 - 0.62 * t) * (1 + 0.55 * Math.max(0, 1 - t / 0.12));
  let v = 0;
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n, p0 = at(t0), p1 = at(t1);
    if (k === 0) p0[1] -= 0.3;
    v = trunk(b, 'bark_euca', p0, p1, rad(t0), rad(t1), 7, { colFn: (i) => barkAt(t0, k, i, salt), colFnEnd: (i) => barkAt(t1, k + 1, i, salt), caps: k === n - 1 }, v, 2);       // the swatch is 1 : 2
  }
  // limbs from the upper trunk, each carrying its own tuft of leaves, and one crown on the leader
  const heads = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28 + r.range(-0.5, 0.5), t0 = r.range(0.58, 0.84), p0 = at(t0), s = r.range(1.5, 2.9) * (1.1 - 0.4 * t0), p1 = [p0[0] + Math.cos(a) * s, p0[1] + r.range(1.0, 2.6), p0[2] + Math.sin(a) * s];
    trunk(b, 'bark_euca', p0, p1, rad(t0) * 0.7, tr * 0.12, 5, { col: scale(EUCA.pale, 0.95), caps: false }, 0, 2);
    heads.push(p1);
  }
  const top = at(1), leaf = rgb(o.leafHex ?? 0xb5cfb0), alt = rgb(0x8ca98b);
  if (K.leafCards) {                                                    // photographed sprays hung by their twig tips: 12 on the leader and 4 on each limb, 32 cards for the 34 they replace
    sprays(b, [top[0], top[1] + 0.1, top[2]], 2.2, 1.25, 2.2, 12, 2.9, r);
    for (const p of heads) sprays(b, [p[0], p[1] + 0.2, p[2]], 1.4, 0.8, 1.4, 4, 2.5, r);
  } else {
    canopy(K, b, TILE.EUCA, [top[0], top[1] - 0.9, top[2]], 2.3, 1.9, 2.3, 9, 2.5, r, leaf, { droop: true, hang: true, tall: 1.7, alt });
    for (const p of heads) canopy(K, b, TILE.EUCA, [p[0], p[1] - 0.2, p[2]], 1.6, 1.2, 1.6, 5, 2.2, r, leaf, { droop: true, hang: true, tall: 1.7, alt });
  }
  K.post(x, z, tr * 1.3 + 0.05, 5);
  K.occ.take(x, z, 0.8);
}

export function palm(K, x, z, o = {}) {
  const r = o.rng, gy = K.H(x, z), h = o.h ?? r.range(8, 13), tr = 0.17, lean = r.range(-0.4, 0.4), lz = r.range(-0.4, 0.4);
  const b = vegetationBuilder(K, 'palm', x, gy, z, { height: h + 1.2, width: 7.6 });
  const segs = Math.ceil(h / 0.8);
  let v = 0;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs, bend = (t) => [x + lean * t * t, gy + h * t - (t === 0 ? 0.25 : 0), z + lz * t * t];     // only the foot sinks: the piece above starts where this one ends
    v = trunk(b, 'bark_palm', bend(t0), bend(t1), tr * (1 - 0.3 * t0), tr * (1 - 0.3 * t1), 6, { col: scale(BARK.palm, i % 2 ? 0.86 : 1.05), caps: i === segs - 1 }, v);
  }
  const top = [x + lean, gy + h, z + lz], uv = K.atlas ? K.atlas.uv(TILE.FROND) : [0, 0, 1, 1], n = 13;
  const uvLo = [uv[0], uv[1], uv[2], (uv[1] + uv[3]) / 2], uvHi = [uv[0], (uv[1] + uv[3]) / 2, uv[2], uv[3]];
  for (let i = 0; i < n; i++) {
    // each frond = a base card rising out of the crown and a tip card arching down; the pair is rolled into a shallow V
    const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2), tau = r.range(0.2, 0.95) * (i % 2 ? 1 : 0.6), len = r.range(3.8, 4.8) / 2, roll = r.range(0.3, 0.7) * (i % 2 ? 1 : -1);
    const dirAt = (t) => V.nrm([Math.cos(a) * Math.cos(t), Math.sin(t), Math.sin(a) * Math.cos(t)]);
    const rollRight = (d) => { const s0 = V.nrm(V.cross(d, [0, 1, 0])), u0 = V.cross(s0, d); return V.nrm(V.add(V.mul(s0, Math.cos(roll)), V.mul(u0, Math.sin(roll)))); };
    const d1 = dirAt(tau), p1 = [top[0], top[1] - 0.05, top[2]], p2 = V.add(p1, V.mul(d1, len * 0.92)), d2 = dirAt(tau - 0.75);
    const col = scale(rgb(0x7fa850), r.range(0.85, 1.1)), nrm = V.nrm([Math.cos(a), 0.7, Math.sin(a)]);
    card(b, 'foliage', p1, rollRight(d1), d1, len * 1.5, len, uvLo, col, nrm);
    card(b, 'foliage', p2, rollRight(d2), d2, len * 1.2, len, uvHi, col, nrm);
  }
  trunk(b, 'bark_trunk', [top[0], top[1] - 0.2, top[2]], [top[0], top[1] + 0.35, top[2]], 0.18, 0.12, 6, { col: BARK.boots });
  K.post(x, z, tr + 0.08, 4); K.occ.take(x, z, 0.7);
}

export function cypress(K, x, z, o = {}) {
  const r = o.rng, gy = K.H(x, z), h = o.h ?? r.range(6, 9.5), w = h * 0.34, uv = K.atlas ? K.atlas.uv(TILE.CYPRESS) : [0, 0, 1, 1];
  const b = vegetationBuilder(K, 'cypress', x, gy, z, { height: h, width: w });
  const n = 3, rot = r.range(0, 3);
  for (let i = 0; i < n; i++) {
    const yaw = rot + (i * Math.PI) / n, right = [Math.cos(yaw), 0, -Math.sin(yaw)], nrm = V.nrm([Math.sin(yaw), 0.55, Math.cos(yaw)]);
    if (K.leafCards) { const g = r.range(0.85, 1.08); sprig(b, CARDS, CELL.CYPRESS, [x, gy - 0.1, z], [0, 1, 0], right, h, [g, g, g], nrm, { squash: 0.7, mirror: i === 1 }); }   // a photographed plume, slimmed to a cypress's column
    else card(b, 'foliage_low', [x, gy - 0.1, z], right, [0, 1, 0], w * 1.25, h, uv, scale(rgb(0xc4dcc0), r.range(0.85, 1.08)), nrm);
  }
  trunk(b, 'bark_trunk', [x, gy - 0.2, z], [x, gy + 0.7, z], 0.14, 0.1, 5, { col: scale(BARK.broad, 0.6) });
  K.post(x, z, 0.28, 4); K.occ.take(x, z, 0.8);
}

/**
 * A banana pseudostem: stacked rings 30 cm tall on A1's sheath swatch (green to beige, dry streaks), tinted cream at the foot and green under the crown, every third ring a
 * darker leaf scar, dark dry-sheath streaks down some sides.
 */
function pseudostem(b, x, gy, z, h, r0, r1) {
  const n = Math.max(4, Math.round(h / 0.3));
  let v = 0;
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n, scar = k % 3 === 2, g = lerpc([1.0, 1.0, 1.1], [0.6, 1.15, 0.9], Math.min(1, t0 * 1.15)), bump = scar ? 0.012 : 0;
    v = trunk(b, 'trunk_banana', [x, gy + h * t0 - (k === 0 ? 0.1 : 0), z], [x, gy + h * t1, z], r0 + (r1 - r0) * t0 + bump, r0 + (r1 - r0) * t1 + bump, 7,
      { colFn: (i) => (scar ? scale(g, 0.55) : (i * 5 + k * 3) % 7 === 0 ? scale(g, 0.62) : g), caps: k === n - 1 }, v, 2);                      // the swatch is 1 : 2
  }
}

export function banana(K, x, z, o = {}) {
  const r = o.rng, gy = K.H(x, z), h = r.range(1.7, 2.7), uv = K.atlas ? K.atlas.uv(TILE.BANANA) : [0, 0, 1, 1];
  const b = vegetationBuilder(K, 'banana', x, gy, z, { height: h + 1.4, width: 4.5 });
  pseudostem(b, x, gy, z, h, 0.17, 0.09);
  const n = r.int(6, 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.3, 0.3), tau = r.range(0.7, 1.25), len = r.range(2.0, 2.9);
    const d = V.nrm([Math.cos(a) * Math.sin(tau), Math.cos(tau) * 0.9, Math.sin(a) * Math.sin(tau)]), right = V.nrm(V.cross(d, [0, 1, 0]));
    card(b, 'foliage_low', [x, gy + h - 0.1, z], right, d, len * 0.5, len, uv, scale(rgb(0x7fb04a), r.range(0.8, 1.1)), V.nrm([Math.cos(a), 0.8, Math.sin(a)]));
  }
}

// ---------------------------------------------------------------------------------------------------- low plants
export function shrub(K, x, z, o = {}) {
  const r = o.rng, gy = K.H(x, z) + (o.dy ?? 0), s = o.size ?? r.range(0.7, 1.2), tile = o.tile ?? TILE.SHRUB;
  const b = vegetationBuilder(K, o.flowers ? 'flower_bed' : 'leafy_shrub', x, gy, z, { height: s, width: s * 1.4 }, o.kind ?? 'floralow', { cast: false });
  canopy(K, b, tile, [x, gy + s * 0.45, z], s * 0.7, s * 0.45, s * 0.7, o.cards ?? 6, s * 0.95, r, o.leaf ?? rgb(0x7ca24d), { inner: 0.4, alt: o.alt, mat: 'foliage_low' });
  if (o.flowers) canopy(K, b, TILE.FLOWERS, [x, gy + s * 0.8, z], s * 0.5, s * 0.2, s * 0.5, 3, s * 0.8, r, rgb(0xffffff), { inner: 0.5, mat: 'foliage_low' });
}

const AGAVE_ROWS = 4;                                                     // rows along a leaf: a spine of four straight pieces, each turned a little more than the last

/**
 * One agave leaf: a fleshy lance, in section a lens (the top is hollowed into a channel, the keel under the midrib is thick, the margins are thin), on a spine that rises from the heart and
 * arches over: `tilt` = its angle from the vertical at the foot, `bend` = how much further it has turned by the tip (an old outer leaf droops below the horizontal). The blade is clasping at
 * the foot, widest a third of the way up and drawn out to a point; its colour runs from the grey-green of the foot to the blue-grey of the tip (`foot` -> `tip`), lighter at the margins and
 * darker in the channel. Both faces carry smooth normals, so it shades as a rounded leaf and not as a folded card. `teeth` triangles stand along each margin (hooked a little back toward the
 * foot, olive brown at the point) and the tip ends in a dark spine.
 */
function agaveLeaf(b, p0, a, tilt, bend, L, W, foot, tip, teeth, tl, r) {
  const acc = b._acc('plaster_a'), sd = [-Math.sin(a), 0, Math.cos(a)], v0 = r.range(0, 4);
  const dirAt = (t) => [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)];
  const prof = (u) => (u < 0.3 ? 0.55 + 0.45 * Math.sin((u / 0.3) * Math.PI / 2) : Math.pow(Math.max(0, 1 - (u - 0.3) / 0.7), 0.8));
  const rows = [];
  let c = p0, tPrev = tilt;
  for (let j = 0; j <= AGAVE_ROWS; j++) {
    const u = j / AGAVE_ROWS, t = tilt + bend * Math.pow(u, 1.5);
    if (j > 0) c = V.add(c, V.mul(dirAt((t + tPrev) / 2), L / AGAVE_ROWS));
    tPrev = t;
    const f = dirAt(t);
    rows.push({ u, c, f, n: V.nrm(V.cross(sd, f)), w: Math.max(0.012, W * prof(u)) });
  }
  const rise = (q, u) => q.w * (0.18 + 0.2 * (1 - u)), keel = (q, u) => q.w * 0.5 * (1 - 0.45 * u);
  const base = acc.pos.length / 3, colAt = (u) => lerpc(foot, tip, ss(0.05, 0.85, u));
  for (const q of rows) {
    const { u, c: m, n, w } = q, up = rise(q, u), col = colAt(u), vv = u * L + v0;
    b.vert(acc, V.add(V.sub(m, V.mul(sd, w)), V.mul(n, up)), V.nrm(V.add(V.mul(sd, -0.85), V.mul(n, 0.35))), -w, vv, scale(col, 1.12));      // left margin
    b.vert(acc, m, n, 0, vv, scale(col, 0.86));                                                                                              // the midrib, in the channel
    b.vert(acc, V.add(V.add(m, V.mul(sd, w)), V.mul(n, up)), V.nrm(V.add(V.mul(sd, 0.85), V.mul(n, 0.35))), w, vv, scale(col, 1.12));        // right margin
    b.vert(acc, V.sub(m, V.mul(n, keel(q, u))), V.mul(n, -1), 0, vv, scale(col, 0.62));                                                      // the keel
  }
  for (let j = 0; j < AGAVE_ROWS; j++) {
    const A = base + 4 * j, B = A + 4;                                      // this row's four vertices (left margin, midrib, right margin, keel); B is the next row's first
    acc.idx.push(A, A + 1, B, A + 1, B + 1, B,                              // the channel, left half
      A + 1, A + 2, B + 1, A + 2, B + 2, B + 1,                              // and right half
      A, B, A + 3, A + 3, B, B + 3,                                          // the underside, margin to keel on the left (wound the other way: it faces down)
      A + 3, B + 3, A + 2, A + 2, B + 3, B + 2);                             // and on the right
    b.tris += 8;
  }
  const tri = (p, q, s, cp, cq, cs) => {                                    // a small flat triangle, drawn from both sides
    const nn = V.nrm(V.cross(V.sub(q, p), V.sub(s, p)));
    for (const flip of [false, true]) {
      const P = flip ? [p, s, q] : [p, q, s], C = flip ? [cp, cs, cq] : [cp, cq, cs], nrm = flip ? V.mul(nn, -1) : nn;
      const i0 = b.vert(acc, P[0], nrm, 0, 0, C[0]);
      b.vert(acc, P[1], nrm, 1, 0, C[1]); b.vert(acc, P[2], nrm, 0.5, 1, C[2]);
      acc.idx.push(i0, i0 + 1, i0 + 2);
    }
    b.tris += 2;
  };
  const rowAt = (u) => {                                                    // the frame between two rows
    const x = Math.min(AGAVE_ROWS - 1e-6, u * AGAVE_ROWS), j = Math.floor(x), t = x - j, p = rows[j], q = rows[j + 1];
    const mix = (s, e) => [s[0] + (e[0] - s[0]) * t, s[1] + (e[1] - s[1]) * t, s[2] + (e[2] - s[2]) * t];
    return { c: mix(p.c, q.c), f: V.nrm(mix(p.f, q.f)), n: V.nrm(mix(p.n, q.n)), w: p.w + (q.w - p.w) * t };
  };
  const edge = (u, side) => { const q = rowAt(u); return V.add(V.add(q.c, V.mul(sd, side * q.w)), V.mul(q.n, rise(q, u))); };
  const brown = [0.32, 0.3, 0.2];
  for (const side of [-1, 1]) {
    for (let k = 0; k < teeth; k++) {
      const u = 0.3 + (0.62 * (k + r.range(0, 0.4))) / teeth, du = 0.05, q = rowAt(u), cu = scale(colAt(u), 1.12);
      const p = edge(u, side), e = edge(u + du, side), mid = V.mul(V.add(p, e), 0.5);
      const point = V.add(V.add(mid, V.mul(sd, side * tl)), V.add(V.mul(q.f, -tl * 0.35), V.mul(q.n, -tl * 0.1)));
      tri(p, e, point, cu, cu, brown);
    }
  }
  const last = rows[AGAVE_ROWS], spine = V.add(last.c, V.mul(last.f, 0.07 * L)), cs = scale(colAt(1), 1.1);                                   // the terminal spine
  tri(V.sub(last.c, V.mul(sd, last.w)), V.add(last.c, V.mul(sd, last.w)), spine, cs, cs, [0.26, 0.2, 0.15]);
}

/**
 * An agave rosette of real leaves (R1-D25: the first was three crossed cards, the second flat triangles that folded like paper): 18 fleshy, channelled, toothed leaves on golden-angle
 * azimuths, the youngest upright in the heart, the oldest arching out and drooping, each built by `agaveLeaf`. The leaves draw from a fork and the 54 numbers the flat blades used to take
 * from the flora stream are taken and thrown away, so nothing placed after an agave moves.
 */
export function agave(K, x, z, o = {}) {
  const r = o.rng, gy = K.H(x, z), s = o.size ?? r.range(1.1, 1.6), rot = r.range(0, 6.28);
  const b = vegetationBuilder(K, 'agave', x, gy, z, { height: s, width: s * 1.3, ry: rot }, 'floralow', { cast: false });
  const foot = scale([0.22, 0.4, 0.3], r.range(0.85, 1.1)), tip = scale([0.34, 0.56, 0.56], r.range(0.9, 1.1));
  const q = r.fork('agave');
  for (let i = 0; i < 54; i++) r.next();
  const N = 18;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), a = rot + i * 2.39996 + q.range(-0.1, 0.1);                       // t: 0 the youngest leaf in the heart ... 1 the oldest, outside
    const tilt = 0.05 + 1.2 * Math.pow(t, 0.85) + q.range(-0.07, 0.07);
    const L = s * (0.5 + 0.5 * Math.sin(Math.min(1, t * 1.3) * Math.PI / 2)) * q.range(0.92, 1.06), bend = (0.08 + 0.7 * t) * q.range(0.85, 1.15);
    const W = s * 0.11 * (0.7 + 0.3 * t), ring = 0.04 * s, p0 = [x + Math.cos(a) * ring, gy + 0.03 + 0.12 * s * (1 - t), z + Math.sin(a) * ring];
    const age = q.range(0.9, 1.08);
    agaveLeaf(b, p0, a, tilt, bend, L, W, scale(foot, age), scale(tip, age), i >= 8 ? 3 : 0, 0.045 * s * q.range(0.8, 1.2), q);
  }
}

export function tuft(K, x, z, rng, big = 1) {
  const gy = K.H(x, z), uv = K.atlas ? K.atlas.uv(rng.chance(0.18) ? TILE.REED : TILE.TUFT) : [0, 0, 1, 1];
  const s = rng.range(0.7, 1.25) * big, rot = rng.range(0, 3), col = scale(rgb(0xdce8b0), rng.range(0.8, 1.1));
  const b = vegetationBuilder(K, 'wild_grass', x, gy, z, { height: s * 0.8, width: s * 1.3, ry: rot }, 'tufts', { cast: false });
  for (let i = 0; i < 2; i++) {
    const yaw = rot + (i * Math.PI) / 2, right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    card(b, 'foliage_low', [x, gy - 0.04, z], right, [0, 1, 0], s * 1.3, s * 0.8, uv, col, [0, 1, 0]);
  }
}

export function pottedPlant(K, x, z, rng, solid = true) {
  const gy = K.H(x, z), s = rng.range(0.5, 0.8);
  const b = vegetationBuilder(K, rng.fork('model').chance(0.5) ? 'potted_fern' : 'potted_succulent', x, gy, z, { height: 0.34 + s, width: 0.6 }, 'floralow', { cast: false });
  tube(b, 'pot_clay', [x, gy, z], [x, gy + 0.34, z], 0.17, 0.23, 8, { col: scale(rgb(0xc8683c), rng.range(0.85, 1.1)), caps: true });
  canopy(K, b, rng.chance(0.5) ? TILE.FLOWERS : TILE.SHRUB, [x, gy + 0.34 + s * 0.4, z], s * 0.5, s * 0.4, s * 0.5, 4, s * 0.9, rng, rgb(0xd8e8c8), { inner: 0.3, mat: 'foliage_low' });
  if (solid) K.post(x, z, 0.24, 0.9);
}

/** Bougainvillea sheets hanging over a wall edge: pts = [{x,z,nx,nz,y}] along the crest (y = crest height), n = outward normal. */
export function drape(K, pts, rng, o = {}) {
  const tile = o.tile ?? TILE.BOUGAIN, uv = K.atlas ? K.atlas.uv(tile) : [0, 0, 1, 1];
  let acc = 0, next = rng.range(0.5, 3.5);
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1], l = Math.hypot(q.x - p.x, q.z - p.z);
    acc += l;
    if (acc < next) continue;
    acc = 0; next = (o.step ?? 2.2) * rng.range(0.5, 2.0);
    if (rng.chance(0.3)) continue;
    const hang = Math.max(0.6, rng.range(0.7, 1.5) * (o.hang ?? 1.4)), w = rng.range(1.2, 2.8);
    const b = vegetationBuilder(K, tile === TILE.VINE ? 'climbing_vine' : 'bougainvillea', p.x + p.nx * 0.14, p.y - hang + 0.12, p.z + p.nz * 0.14,
      { height: hang, width: w, depth: 0.28, ry: Math.atan2(p.nx, p.nz) }, 'floralow', { cast: false });
    const right = V.nrm([q.x - p.x, 0, q.z - p.z]), col = scale(rgb(o.hex ?? 0xffffff), rng.range(0.85, 1.1));
    card(b, 'foliage_low', [p.x + p.nx * 0.14, p.y - hang + 0.12, p.z + p.nz * 0.14], right, [0, 1, 0], w, hang, uv, col, V.nrm([p.nx, 0.35, p.nz]));
  }
}

// ---------------------------------------------------------------------------------------------------- placement
export function buildFlora(K) {
  const plan = K.plan, occ = K.occ, R = K.rng('flora'), dirt = K.ctx.world?.masks?.dirt;
  K.leafCards = hasSheet(K.ctx);                                          // the eucalyptus, cypress and broadleaf crowns wear the photographed sheet when it is there (cards.js), the painted atlas when it is not
  // The cut-out keeps its 0.5 threshold (the shadow pass and the profiles without MSAA use it as it is); on the high profile's 4x MSAA the same edge is also written as coverage,
  // so the leaves are anti-aliased instead of stair-stepped (side by side on the same views: smoother edges, the same area).
  if (K.leafCards) K.ctx.mat(CARDS).alphaToCoverage = true;
  const sp = { n: 0, euca: 0, palm: 0, broad: 0, cypress: 0, banana: 0, shrub: 0, agave: 0, tuft: 0, pots: 0, drape: 0, rim: 0 };
  const free = (x, z, r, mask = BLOCK) => occ.clear(x, z, r, mask) && !occ.overlaps(x, z, r * 0.8);
  // the viewpoint's fan (dress.js mirador): a point inside it keeps only plants lower than a person's eye
  const view = K.ctx.world?.view;
  const inView = (x, z) => {
    if (!view) return false;
    const vx = x - view.x, vz = z - view.z, d = vx * view.dx + vz * view.dz;
    return d > -3 && d < view.reach && Math.abs(vx * view.dz - vz * view.dx) < view.apex + Math.max(0, d) * Math.tan(view.half);
  };

  // ---- plaza trees (inside planters)
  for (const pl of plan.plazas) {
    if (pl.kind !== 'plaza' || pl.id === 'P6') continue;                          // (the Plaza del Mar at the spawn is the beach's: palms and furniture of its own, and an almond here would also pull the tyre swing (life.js) in reach of the spawn)
    const want = pl.id === 'P2' ? 5 : pl.id === 'P1' ? 2 : 3, spec = pl.id === 'P1' ? 'palm' : pl.id === 'P4' ? 'cypress' : 'almendro';
    const xs = pl.poly.map((p) => p[0]), zs = pl.poly.map((p) => p[1]), tries = 600, got = [];
    const r = R.fork('plaza:' + pl.id);
    for (let t = 0; t < tries && got.length < want; t++) {
      const x = r.range(Math.min(...xs), Math.max(...xs)), z = r.range(Math.min(...zs), Math.max(...zs));
      if (!pointInPoly(pl.poly, x, z) || polyDistPoint(pl.poly, x, z) > 99) continue;
      let dEdge = Infinity; for (let i = 0; i < pl.poly.length; i++) { const a = pl.poly[i], c = pl.poly[(i + 1) % pl.poly.length]; const vx = c[0] - a[0], vz = c[1] - a[1], l2 = vx * vx + vz * vz || 1; const u = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2)); dEdge = Math.min(dEdge, Math.hypot(x - a[0] - vx * u, z - a[1] - vz * u)); }
      if (dEdge < 0.9 || dEdge > 4.6) continue;
      if (!occ.clear(x, z, 0.4, BLOCK & ~OCC.PLAZA) || occ.overlaps(x, z, 1.9)) continue;     // (the nav grid covers most of a plaza: trees stand in the pockets between its lines)
      got.push([x, z]); occ.take(x, z, 0.5);
      (K.ctx.world.plazaTrees ??= []).push([x, z, spec]);                               // dress.js raises a stone ring around each
      if (spec === 'palm') palm(K, x, z, { rng: r.fork('t' + got.length) }); else if (spec === 'cypress') cypress(K, x, z, { rng: r.fork('t' + got.length) });
      else broadTree(K, x, z, { rng: r.fork('t' + got.length), h: r.range(6.5, 8.5), crown: r.range(3.2, 4.2), cards: 30 });
      sp[spec === 'palm' ? 'palm' : spec === 'cypress' ? 'cypress' : 'broad']++; sp.n++;
    }
  }

  // ---- entry-road palms (palma de cera) and kerb-side trees on the main road
  for (const st of plan.streets) {
    if (st.kind !== 'road') continue;
    const d = st._d, rr = R.fork('road:' + st.id);
    let acc = 6;
    for (let k = 1; k < d.pts.length; k++) {
      const a = d.pts[k - 1], c = d.pts[k], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      let s = 0;
      while (s < l) {
        if (acc >= 14) {
          acc = 0;
          const t = s / l, x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t, nx = -(c[1] - a[1]) / l, nz = (c[0] - a[0]) / l;
          for (const side of [-1, 1]) {
            if (!rr.chance(0.55)) continue;
            const off = st.width / 2 + rr.range(1.4, 2.6), px = x + nx * off * side, pz = z + nz * off * side;
            if (!free(px, pz, 1.6)) continue;
            if (rr.chance(0.5)) palm(K, px, pz, { rng: rr.fork('p' + sp.n) }); else broadTree(K, px, pz, { rng: rr.fork('p' + sp.n) });
            sp.n++; sp.palm++;
          }
        }
        s += 1; acc += 1;
      }
    }
  }

  // ---- the hillside: zones by position
  const sc = R.fork('scatter');
  for (let gz = -98; gz < 98; gz += 3.2) for (let gx = -98; gx < 98; gx += 3.2) {
    const x = gx + sc.range(0, 3.2), z = gz + sc.range(0, 3.2);
    if (x < -98 || x > 98 || z < -98 || z > 98) continue;
    const north = ss(-66, -88, z), east = ss(58, 80, x), west = ss(-58, -80, x), n1 = vnoise(x, z, 13, plan.seed + 21), n2 = vnoise(x, z, 5, plan.seed + 23);
    const wild = Math.max(north, east, west), terrace = 0.12 + 0.1 * (n1 + 1), upper = ss(-36, -64, z) * (0.6 + 0.4 * n2);   // upper: the scrubby band above the last houses (z -64..-36)
    const dens = wild * (0.55 + 0.45 * n1) + (1 - wild) * (terrace * 0.5 + 0.42 * upper);
    if (sc.next() > dens * 0.55) continue;
    if (occ.slope(x, z) > 0.55) continue;
    const r = sc.fork('c' + sp.n);
    if (inView(x, z)) {                                                   // the view from the mirador: agaves and shrubs, no tree, no banana
      if (free(x, z, 1.3)) { if (r.chance(0.45)) agave(K, x, z, { rng: r }), sp.agave++; else shrub(K, x, z, { rng: r, flowers: r.chance(0.4) }), sp.shrub++; sp.n++; }
      continue;
    }
    if (north > 0.5 && free(x, z, 2.4)) {
      if (r.chance(0.62)) eucalyptus(K, x, z, { rng: r }), sp.euca++; else cypress(K, x, z, { rng: r }), sp.cypress++;
      sp.n++;
    } else if (east > 0.4 && free(x, z, 2.0)) {
      if (r.chance(0.42)) banana(K, x, z, { rng: r }), sp.banana++; else if (r.chance(0.5)) eucalyptus(K, x, z, { rng: r }), sp.euca++; else broadTree(K, x, z, { rng: r }), sp.broad++;
      sp.n++;
    } else if (west > 0.4 && free(x, z, 1.6)) {
      if (r.chance(0.45)) agave(K, x, z, { rng: r }), sp.agave++; else if (r.chance(0.5)) shrub(K, x, z, { rng: r, size: r.range(1.0, 1.7) }), sp.shrub++; else broadTree(K, x, z, { rng: r, h: r.range(4.5, 6.5) }), sp.broad++;
      sp.n++;
    } else if (wild < 0.3 && free(x, z, 1.7)) {
      const k = r.next();
      if (k < 0.28) broadTree(K, x, z, { rng: r, h: r.range(4.5, 6.5), crown: r.range(2.2, 3), leaf: rgb(r.pick([0x6f9a44, 0x7fa84a, 0x5f8f3b])) }), sp.broad++;
      else if (k < 0.5) banana(K, x, z, { rng: r }), sp.banana++;
      else if (k < 0.62) agave(K, x, z, { rng: r }), sp.agave++;
      else shrub(K, x, z, { rng: r, flowers: r.chance(0.4) }), sp.shrub++;
      sp.n++;
    }
  }

  // ---- the rim (R1-D02): a belt of trees and a low hedge 1 to 6.5 m inside the perimeter wall, so the open grass of the outer third ends in planting and not in a bare wall
  const rim = R.fork('rim'), EDGE = 99.2;
  for (const side of ['n', 'e', 'w', 's']) {
    const rr = rim.fork(side), at = (s, d) => (side === 'n' ? [s, -EDGE + d] : side === 's' ? [s, EDGE - d] : side === 'e' ? [EDGE - d, s] : [-EDGE + d, s]);
    for (let s = -96; s < 96; s += 3.6) {
      const [x, z] = at(s + rr.range(0, 2.4), rr.range(2.2, 6.5)), r = rr.fork('t' + sp.n);
      if (occ.slope(x, z) > 0.55 || (side === 's' && z > EDGE - 2)) continue;
      const hedge = at(s + rr.range(0, 2.4), rr.range(2.4, 3.2));       // (the footpath of rimwalk.js runs between the wall and the hedge)
      if (free(hedge[0], hedge[1], 0.8)) { shrub(K, hedge[0], hedge[1], { rng: r.fork('h'), size: r.range(1.0, 1.6), flowers: r.chance(0.45) }); sp.shrub++; sp.rim++; }
      if (inView(x, z)) { if (free(x, z, 1.2)) { agave(K, x, z, { rng: r }); sp.agave++; sp.rim++; sp.n++; } continue; }
      const k = r.next();
      if (side === 'n') { if (!free(x, z, 2.4)) continue; if (k < 0.55) eucalyptus(K, x, z, { rng: r }), sp.euca++; else cypress(K, x, z, { rng: r }), sp.cypress++; }
      else if (side === 'e') { if (!free(x, z, 2.0)) continue; if (k < 0.4) banana(K, x, z, { rng: r }), sp.banana++; else if (k < 0.6) eucalyptus(K, x, z, { rng: r }), sp.euca++; else broadTree(K, x, z, { rng: r }), sp.broad++; }
      else if (side === 'w') { if (!free(x, z, 1.8)) continue; if (k < 0.3) agave(K, x, z, { rng: r }), sp.agave++; else if (k < 0.45) cypress(K, x, z, { rng: r }), sp.cypress++; else broadTree(K, x, z, { rng: r, h: r.range(4.8, 7) }), sp.broad++; }
      else { if (!free(x, z, 2.0)) continue; if (k < 0.4) cypress(K, x, z, { rng: r }), sp.cypress++; else if (k < 0.75) broadTree(K, x, z, { rng: r }), sp.broad++; else palm(K, x, z, { rng: r, h: r.range(6.5, 8.5) }), sp.palm++; }      // (a palm here is a young one: a tall one stands in front of the far hillside's lights)
      sp.rim++; sp.n++;
    }
  }

  // ---- the view's frame: a cypress on each side of the axis, a dozen metres out, so the opening between them reads as a picture (the first free spot of four)
  if (view) {
    const ax = -view.dz, az = view.dx;
    for (const side of [-1, 1]) {
      for (const [d, lat] of [[11, 6.8], [12.5, 7.4], [9.5, 6.4], [13, 8.2]]) {
        const x = view.x + view.dx * d + ax * lat * side, z = view.z + view.dz * d + az * lat * side;
        if (!free(x, z, 1.4)) continue;
        cypress(K, x, z, { rng: R.fork('frame' + side), h: 8.4 }); sp.cypress++; sp.n++; break;
      }
    }
  }

  // ---- grass tufts on the open grass
  const tr = R.fork('tufts');
  for (let i = 0; i < 6500; i++) {
    const x = tr.range(-99, 99), z = tr.range(-99, 99);
    if (!occ.clear(x, z, 0.4, BLOCK) || occ.slope(x, z) > 0.6 || K.rimNear?.(x, z, 0.5)) continue;       // (nor on the rim path: it is bare earth)
    if (dirt) { const gi = Math.round((x + 100) / 0.5), gj = Math.round((z + 100) / 0.5); if (dirt[gj * 401 + gi] > 0.5) continue; }
    tuft(K, x, z, tr, 0.9 + 0.5 * Math.max(ss(58, 90, Math.abs(x)), ss(-66, -90, z)));
    sp.tuft++;
  }

  // ---- bougainvillea / vine over the tall retaining walls
  const runs = K.ctx.world?.wallRuns ?? [], dr = R.fork('drape');
  for (const run of runs) {
    if (run.tall < 0.9 || !dr.chance(0.5) || K.ctx.world?.muralRuns?.has(run)) continue;       // (a painted wall is left uncovered)
    // cut wall (sign > 0): face on the edge looking at the structure, crest = upper ground; fill wall: face on the outer line, crest = structure level
    const pts = run.S.map((s) => (run.sign > 0
      ? { x: s.x, z: s.z, nx: -s.nx, nz: -s.nz, y: s.outer + 0.02 }
      : { x: s.x + s.nx * s.W, z: s.z + s.nz * s.W, nx: s.nx, nz: s.nz, y: s.inner + 0.02 }));
    drape(K, pts, dr, { tile: dr.chance(0.55) ? TILE.BOUGAIN : TILE.VINE, step: 2.4, hang: Math.min(1.4, run.tall * 0.6) });
    sp.drape++;
  }
  K.ctx.world && (K.ctx.world.flora = sp);
  return sp;
}
