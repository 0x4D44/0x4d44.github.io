// Stand-in furniture: every catalogue archetype drawn from a handful of boxes and cylinders, in item-local space
// (x = right, y = up from the item's base, z = front = the side a person uses). Merged per material by the MeshBuilder, tinted with
// VERTEX COLOURS (never extra materials), so a building's whole interior costs one draw call per material. Blender GLBs replace these
// one catalogue key at a time (build.js); anything without a GLB keeps its stand-in, so the page is never empty or broken.
import * as THREE from 'three';
import { hashStr } from '../core/rng.js';
import { DECALS } from './decals.js';

// ------------------------------------------------------------------ small helpers
export const u01 = (id, i = 0) => ((hashStr(String(id) + '#' + i) >>> 0) % 100003) / 100003;
const pick = (arr, id, i = 0) => arr[Math.floor(u01(id, i) * arr.length) % arr.length];
const mul = (hex, k) => ((Math.min(255, ((hex >> 16) & 255) * k) | 0) << 16) | ((Math.min(255, ((hex >> 8) & 255) * k) | 0) << 8) | (Math.min(255, (hex & 255) * k) | 0);
const mix = (a, b, t) => {
  const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (f(16) << 16) | (f(8) << 8) | f(0);
};
const FLAT = 'plastic_solid';                  // white, rough .45: any flat colour through vertex colours
const BLACK = 0x1c1c1e, STEEL = 0xc8ccd0, CREAM = 0xe9e2d2;
const NAMECOL = {                              // default colours of colourless plastics / appliances
  speaker: 0x1e1e20, tv_flat: 0x15171b, tv_crt: 0x2c2b2a, tv_wall: 0x15171b, fan_stand: 0xe6e2d6, fan_desk: 0x4a6a8a, pc_set: 0xd6d2c6, printer: 0xd6d2c6,
  phone_landline: 0x8a2a24, radio_boombox: 0x2a2a2c, school_bag: 0x2f5f9a, football: 0xf0eee6, toy_pile: 0xd23a32, sewing_machine: 0x24262a,
  water_stand: 0x7fb4d8, gas_cylinder: 0xcf3a2a, water_tank_small: 0x2f5f9a, shower_head_electric: 0xf0eee6, pipes_bundle: 0xe4e0d4, shoes_pair: 0x2a2a2c,
  doll: 0xd9a0a8, box_cardboard_s: 0xb08a5a, box_cardboard_m: 0xb08a5a, box_cardboard_l: 0xb08a5a, trophy_football: 0xd4a830, bottles_group: 0x6a8f5a,
  knickknacks: 0xe4dccb, vase_flowers: 0xdad6c8, fruit_bowl: 0xf0ece0, bread_basket: 0xc89a62, kettle: 0xc8ccd0, thermos_set: 0xc23a30, pot_stack: 0xbfc3c6,
  dish_rack: 0xc8ccd0, books_stack: 0x8a4a3a, photo_frames: 0x5a3a24, plant_tin: 0xb8b0a0, plant_pot_clay: 0xb5603a, plant_big: 0xb5603a, plant_hanging: 0xb5603a,
  mop_bucket: 0xe8c332, trash_bin: 0x3a4a5a, bucket_big: 0x2f6fbf, laundry_basket: 0xd23a32, oil_drum: 0x2f5f9a, tool_cabinet_roll: 0xb23a2a,
};

// Draw-call diet: a building uses ~30 materials at most, so small flat-coloured things (food, fur, leaves, wax, plaster ...) are all drawn with
// ONE flat material and their own vertex colour. Flat library materials with a fixed colour take a passed colour as the ABSOLUTE colour.
const ALIAS = {
  soil: 0x3a2a1c, leaf_green: 0x4a8a3a, leaf_dark: 0x2c5a2a, flower_red: 0xc8302a, flower_yellow: 0xe8c030, candle_wax: 0xf2ead2, plaster_statue: 0xe8e2d4,
  fur_cat: 0xffffff, fur_dog: 0xb08850, feather_canary: 0xf0d020, feather_pigeon: 0x8a8f98, skin_figure: 0xc88b5e, food_bread: 0xc98a4a, food_cake: 0xe8d0b0,
  food_mango: 0xe9a23b, food_banana: 0xe2c84f, food_lulo: 0xe4952f, food_tomato: 0xc83a2e, food_veg: 0x5e9c3f, food_meat: 0xa8403c, food_white: 0xeee4cc,
  clay_terracotta: 0xb5603a, paper: 0xf0ece0, rubber_black: 0x1c1c1c, towel_terry: 0xffffff,
};
const SWAP = { plywood: 'wood_pine', metal_steel: 'metal_chrome' };
const ABS = new Set(['metal_dark', 'metal_chrome', 'enamel_white', 'ceramic_white']);
const norm = (mat, col) => {
  if (SWAP[mat]) mat = SWAP[mat];
  if (ALIAS[mat] != null) return [FLAT, col ?? ALIAS[mat]];
  if (col != null && ABS.has(mat)) return [FLAT, col];
  return [mat, col];
};

/** Draws in item-local space onto a MeshBuilder whose base pose is the building's frame. */
class Pen {
  constructor(b, r, c) {
    this.b = b; this.r = r; this.c = c; this.id = r.id;
    this.x = r.x; this.z = r.z; this.ry = r.ry ?? 0; this.cs = Math.cos(this.ry); this.sn = Math.sin(this.ry);
    this.W = (r.kind === 'wall' && r.w) ? r.w : c.size[0]; this.H = (r.kind === 'wall' && r.h) ? r.h : c.size[1]; this.D = c.size[2];
    this.y0 = r.kind === 'ceil' ? r.y - c.size[1] : r.y;
    this.n = 0;
  }
  X(lx, lz) { return this.x + lx * this.cs + lz * this.sn; }
  Z(lx, lz) { return this.z - lx * this.sn + lz * this.cs; }
  /** Box: centre (lx,lz), bottom at ly, size sx,sy,sz. skip = faces to leave out ('ny' under things standing on the floor). */
  box(mat, lx, ly, lz, sx, sy, sz, col, skip, ry = 0) {
    if (!(sx > 0 && sy > 0 && sz > 0)) return;
    [mat, col] = norm(mat, col);
    this.b.box(mat, this.X(lx, lz), this.y0 + ly + sy / 2, this.Z(lx, lz), sx, sy, sz, { ry: this.ry + ry, col, skip });
    this.n++;
  }
  flat(lx, ly, lz, sx, sy, sz, col, skip, ry) { this.box(FLAT, lx, ly, lz, sx, sy, sz, col, skip, ry); }
  cyl(mat, lx, ly, lz, rad, h, seg = 10, col, r1, caps) {
    if (!(rad > 0 && h > 0)) return;
    [mat, col] = norm(mat, col);
    this.b.cyl(mat, this.X(lx, lz), this.y0 + ly, this.Z(lx, lz), rad, h, seg, { r1, col, caps });
    this.n++;
  }
  /** Horizontal cylinder (axis 'x' or 'z' of the item), centred at (lx,ly,lz): wheels, pipes, rolls. */
  hcyl(mat, lx, ly, lz, rad, len, axis = 'x', seg = 10, col) {
    if (!(rad > 0 && len > 0)) return;
    [mat, col] = norm(mat, col);
    const key = `c${rad}|${len}|${seg}`;
    let g = GEO.get(key); if (!g) GEO.set(key, g = new THREE.CylinderGeometry(rad, rad, len, seg, 1));
    const m = _M.makeRotationY(this.ry).multiply(axis === 'x' ? _RZ : _RX).setPosition(this.X(lx, lz), this.y0 + ly, this.Z(lx, lz));
    this.b.geometry(mat, g, m, { col });
    this.n++;
  }
  /** Ellipsoid centred at (lx,ly,lz) with radii (rx,ry,rz): heads, balls, fruit, pillows. */
  sphere(mat, lx, ly, lz, rx, ry = rx, rz = rx, col, seg = 8) {
    if (!(rx > 0)) return;
    [mat, col] = norm(mat, col);
    const key = `s${seg}`;
    let g = GEO.get(key); if (!g) GEO.set(key, g = new THREE.SphereGeometry(1, seg, Math.max(4, seg - 2)));
    const m = _M.makeRotationY(this.ry).multiply(_S.makeScale(rx, ry, rz)).setPosition(this.X(lx, lz), this.y0 + ly, this.Z(lx, lz));
    this.b.geometry(mat, g, m, { col });
    this.n++;
  }
}
const GEO = new Map(), _M = new THREE.Matrix4(), _S = new THREE.Matrix4();
const _RZ = new THREE.Matrix4().makeRotationZ(Math.PI / 2), _RX = new THREE.Matrix4().makeRotationX(Math.PI / 2);

const NY = ['ny'];
const legs4 = (P, mat, col, w, d, h, t = 0.04, inset = 0.03, lz = 0) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(mat, sx * (w / 2 - inset - t / 2), 0, lz + sz * (d / 2 - inset - t / 2), t, h, t, col, ['ny', 'py']);
};

// ------------------------------------------------------------------ archetypes
export const STANDINS = {};
const S = STANDINS;

// ---- sleeping
const BED_BLANKETS = ['blanket_andean', 'bedspread_floral', 'fabric_bedding'];
S.bed = (P, c, T, r) => {
  const { W, D } = P, metal = c.mat === 'metal_painted';
  const head = c.head ?? (metal ? c.size[1] : 0.78);
  const fcol = metal ? pick([0xd9d4c4, 0x2f3a45, 0x6f8f7a, 0x8b3a2e], P.id) : undefined;
  P.box(c.mat, 0, 0.06, 0, W, 0.22, D, fcol, NY);
  P.box(c.mat, 0, 0.06, -D / 2 + 0.03, W, head - 0.06, 0.06, fcol);
  P.box(c.mat, 0, 0.06, D / 2 - 0.03, W, Math.min(0.42, head * 0.55) - 0.06, 0.06, fcol);
  P.box('fabric_bedding', 0, 0.28, 0.0, W - 0.1, 0.17, D - 0.14, T ?? 0xe6ddd0);
  const unmade = r.flags?.unmade;
  const bm = pick(BED_BLANKETS, P.id);
  if (unmade) { P.box(bm, W * 0.12, 0.42, D * 0.22, W * 0.62, 0.09, D * 0.5, bm === 'fabric_bedding' ? T : undefined, undefined, 0.12); }
  else P.box(bm, 0, 0.41, D * 0.17, W - 0.05, 0.08, D * 0.62, bm === 'fabric_bedding' ? (T ?? CREAM) : undefined);
  const pw = W > 1.2 ? W * 0.4 : W * 0.7;
  for (const sx of W > 1.2 ? [-1, 1] : [0]) P.box('fabric_bedding', sx * W * 0.23, 0.45, -D / 2 + 0.3, pw, 0.1, 0.34, 0xf4f0e8, NY, unmade ? 0.15 * sx : 0);
};
S.bunk = (P, c, T) => {
  const { W, D } = P, H = c.size[1];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(c.mat, sx * (W / 2 - 0.035), 0, sz * (D / 2 - 0.035), 0.07, H, 0.07, undefined, NY);
  for (const [ly, k] of [[0.34, 0], [1.1, 1]]) {
    P.box(c.mat, 0, ly, 0, W - 0.1, 0.05, D - 0.1);
    P.box('mattress_ticking', 0, ly + 0.05, 0.02, W - 0.14, 0.14, D - 0.2, k ? T ?? 0x9db8d0 : 0xe6ddd0);
    P.box('fabric_bedding', 0, ly + 0.15, -D / 2 + 0.3, W - 0.3, 0.07, 0.3, 0xf4f0e8);
  }
  P.box(c.mat, W / 2 - 0.035, 1.29, 0, 0.03, 0.3, D - 0.1);
  P.box(c.mat, -W / 2 + 0.035, 1.29, 0, 0.03, 0.3, D - 0.1);
};
S.cot = (P, c, T) => {
  const { W, D } = P;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box('metal_painted', sx * (W / 2 - 0.03), 0, sz * (D / 2 - 0.03), 0.04, 0.3, 0.04, 0x6f7a86, NY);
  P.box('metal_painted', 0, 0.28, 0, W, 0.04, D, 0x6f7a86);
  P.box('fabric_bedding', 0, 0.32, 0.02, W - 0.06, 0.12, D - 0.1, T ?? 0xb7c9a0);
  P.box('fabric_bedding', 0, 0.42, -D / 2 + 0.25, W - 0.2, 0.08, 0.28, 0xf2eee6);
};
S.crib = (P, c, T) => {
  const { W, D } = P, H = c.size[1], col = T ?? 0xf2efe6;
  P.box(c.mat, 0, 0.12, 0, W - 0.04, 0.05, D - 0.04, col);
  P.box('fabric_bedding', 0, 0.17, 0, W - 0.1, 0.1, D - 0.1, 0xe9d8e6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(c.mat, sx * (W / 2 - 0.02), 0, sz * (D / 2 - 0.02), 0.04, H, 0.04, col, NY);
  for (const sx of [-1, 1]) { P.box(c.mat, sx * (W / 2 - 0.02), H - 0.1, 0, 0.03, 0.03, D, col); P.box(c.mat, sx * (W / 2 - 0.02), 0.3, 0, 0.02, 0.02, D, col); }
  for (const sz of [-1, 1]) P.box(c.mat, 0, H - 0.1, sz * (D / 2 - 0.02), W, 0.03, 0.03, col);
  for (let i = -3; i <= 3; i++) for (const sx of [-1, 1]) P.box(c.mat, sx * (W / 2 - 0.02), 0.22, i * D / 8, 0.015, H - 0.32, 0.015, col);
};
S.mattress = (P, c, T, r) => {
  const { W, D } = P;
  P.box('mattress_ticking', 0, 0, 0, W, 0.17, D, undefined, NY);
  P.box(pick(BED_BLANKETS, P.id), 0, 0.15, D * 0.2, W - 0.04, 0.06, D * 0.55, T ?? undefined);
  P.box('fabric_bedding', 0, 0.16, -D / 2 + 0.28, W * 0.6, 0.08, 0.32, 0xf2eee6);
};

// ---- storage
S.cabinet = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], doors = c.doors ?? 0, n = r.name;
  let col = T ?? NAMECOL[n];
  if (n === 'speaker') { P.flat(0, 0, 0, W, H, D, col, NY); P.cyl(FLAT, 0, 0.12, D / 2, 0.12, 0.012, 14, 0x3a3a3c); P.cyl(FLAT, 0, 0.55, D / 2, 0.1, 0.012, 14, 0x3a3a3c); return; }
  P.box(c.mat, 0, 0, 0, W, H, D, col, NY);
  if (H > 1.2) P.box(c.mat, 0, H, 0, W + 0.02, 0.03, D + 0.02, col ? mul(col, 0.85) : undefined);
  const dn = Math.max(1, doors || 2);
  for (let i = 1; i < dn; i++) P.box('metal_dark', -W / 2 + W * i / dn, 0.06, D / 2 + 0.002, 0.012, H - 0.12, 0.004);
  for (let i = 0; i < dn; i++) {
    const x = -W / 2 + W * (i + 0.5) / dn + (i % 2 ? -1 : 1) * Math.min(0.14, W / dn * 0.38);
    P.box('metal_chrome', x, H > 1.2 ? H * 0.5 : H * 0.55, D / 2 + 0.012, 0.018, H > 1.2 ? 0.14 : 0.09, 0.02);
  }
  if (c.tags.includes('wardrobe') && H > 1.6) P.box('mirror', W * 0.25, 0.35, D / 2 + 0.004, W / dn * 0.7, H * 0.55, 0.004);
  if (n === 'tv_stand') P.box('metal_dark', 0, 0.16, D / 2 + 0.003, W * 0.5, 0.2, 0.004, BLACK);
};
S.dresser = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], col = T ?? NAMECOL[r.name], tall = H > 0.7;
  P.box(c.mat, 0, 0, 0, W, H, D, col, NY);
  if (c.tags.includes('tools')) { P.box('metal_dark', 0, H - 0.04, D / 2 - 0.01, W - 0.04, 0.04, 0.06); }
  const rows = tall ? 4 : 3, dh = (H - 0.14) / rows;
  for (let i = 0; i < rows; i++) {
    P.box('metal_dark', 0, 0.08 + i * dh, D / 2 + 0.002, W - 0.06, 0.008, 0.004);
    P.box('metal_chrome', 0, 0.08 + i * dh + dh * 0.45, D / 2 + 0.012, 0.12, 0.016, 0.02);
  }
  P.box(c.mat, 0, H, 0, W + 0.02, 0.025, D + 0.02, col ? mul(col, 0.8) : undefined);
};
S.wallunit = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], col = T;
  P.box(c.mat, 0, 0, 0, W, 0.75, D, col, NY);                                     // lower cabinet
  for (let i = 1; i < 3; i++) P.box('metal_dark', -W / 2 + W * i / 3, 0.04, D / 2 + 0.002, 0.012, 0.67, 0.004);
  P.box(c.mat, 0, 0.75, 0, W, 0.04, D, col ? mul(col, 0.8) : undefined);
  P.box(c.mat, -W / 2 + 0.02, 0.79, 0, 0.04, H - 0.79, D, col);                   // upper open shelves
  P.box(c.mat, W / 2 - 0.02, 0.79, 0, 0.04, H - 0.79, D, col);
  P.box(c.mat, 0, H - 0.04, 0, W, 0.04, D, col);
  P.box('plywood', 0, 0.79, -D / 2 + 0.01, W - 0.08, H - 0.83, 0.02);
  const knick = r.flags?.knick !== false;
  for (let k = 0; k < 3; k++) {
    const ly = 0.79 + k * 0.38;
    if (k) P.box(c.mat, 0, ly, 0, W - 0.08, 0.025, D - 0.02, col);
    if (knick) for (let j = 0; j < 4; j++) {
      const u = u01(P.id, k * 7 + j), x = -W / 2 + 0.2 + (W - 0.4) * (j + u * 0.5) / 4;
      P.flat(x, ly + 0.025, 0.02, 0.1 + u * 0.12, 0.08 + u * 0.16, 0.1, pick([0xe4dccb, 0xb5603a, 0x6a8f5a, 0xd4a830, 0x7a8a9a, 0xc23a30], P.id, k * 5 + j));
    }
  }
  P.box('glass', 0, 1.5, D / 2 - 0.02, W * 0.34, 0.38, 0.01);
};
S.shelf = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], col = T ?? NAMECOL[r.name];
  P.box(c.mat, -W / 2 + 0.02, 0, 0, 0.04, H, D, col, NY);
  P.box(c.mat, W / 2 - 0.02, 0, 0, 0.04, H, D, col, NY);
  P.box('plywood', 0, 0.02, -D / 2 + 0.01, W - 0.08, H - 0.02, 0.02);
  const rows = Math.max(2, Math.round(H / 0.38));
  for (let k = 0; k <= rows; k++) {
    const ly = k === rows ? H - 0.03 : k === 0 ? 0.04 : (H - 0.03) * k / rows;
    P.box(c.mat, 0, ly, 0, W - 0.08, 0.03, D, col);
    if (k < rows && c.tags.includes('books')) {                                    // rows of book spines
      let x = -W / 2 + 0.07;
      for (let j = 0; j < 9 && x < W / 2 - 0.12; j++) { const bw = 0.03 + u01(P.id, k * 9 + j) * 0.04; P.flat(x + bw / 2, ly + 0.03, 0.0, bw, 0.18 + u01(P.id, 50 + k * 9 + j) * 0.1, D * 0.7, pick([0x8a3a2a, 0x2f4a6a, 0x3a5a3a, 0xc8a040, 0x5a3a52, 0xd8d0c0], P.id, k * 9 + j)); x += bw + 0.005; }
    } else if (k < rows && c.tags.includes('shoes')) {
      for (let j = 0; j < 3; j++) P.flat(-W / 2 + 0.2 + j * (W - 0.4) / 3, ly + 0.03, 0.0, 0.22, 0.1, 0.26, pick([0x2a2a2c, 0x6b4226, 0xd23a32, 0xe8e4da], P.id, k * 3 + j));
    }
  }
};
S.vitrine = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], col = T;
  P.box(c.mat, 0, 0, 0, W, 0.7, D, col, NY);
  P.box(c.mat, -W / 2 + 0.02, 0.7, 0, 0.04, H - 0.7, D, col);
  P.box(c.mat, W / 2 - 0.02, 0.7, 0, 0.04, H - 0.7, D, col);
  P.box(c.mat, 0, H - 0.03, 0, W, 0.03, D, col);
  P.box('plywood', 0, 0.7, -D / 2 + 0.01, W - 0.08, H - 0.73, 0.02);
  P.box('glass', 0, 0.7, D / 2 - 0.02, W - 0.08, H - 0.74, 0.01);
  for (let k = 0; k < 3; k++) {
    const ly = 0.72 + k * 0.33; P.box('glass', 0, ly, 0, W - 0.08, 0.012, D - 0.06);
    for (let j = 0; j < 3; j++) P.flat(-W * 0.3 + j * W * 0.3, ly + 0.012, 0, 0.1, 0.14 + u01(P.id, k * 3 + j) * 0.1, 0.1, pick([0xe4dccb, 0xc8a040, 0xd8d0c0, 0x7a8a9a, 0xc23a30], P.id, k * 3 + j));
  }
  P.box('metal_dark', 0, 0.06, D / 2 + 0.002, 0.012, 0.58, 0.004);
};
S.chest = (P, c, T) => {
  const { W, D } = P, H = c.size[1];
  P.box(c.mat, 0, 0, 0, W, H - 0.06, D, T, NY);
  P.box(c.mat, 0, H - 0.06, 0, W + 0.02, 0.06, D + 0.02, T ? mul(T, 0.85) : undefined);
  for (const sx of [-1, 1]) P.box('metal_dark', sx * W * 0.32, 0, D / 2 + 0.003, 0.05, H, 0.006);
  P.box('metal_chrome', 0, H * 0.55, D / 2 + 0.012, 0.06, 0.05, 0.02);
};
S.shelfWall = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], col = T;
  P.box(c.mat, 0, H - 0.03, 0, W, 0.03, D, col);                                       // the board is the top of the item; brackets under it
  for (const sx of [-1, 1]) P.box('metal_dark', sx * (W / 2 - 0.08), 0, -D / 2 + 0.02, 0.02, H - 0.03, 0.03);
  const g = c.goods;
  for (let j = 0; j < 4; j++) { const u = u01(P.id, j); P.flat(-W / 2 + 0.12 + j * (W - 0.24) / 3.2, H, 0, 0.08 + u * 0.06, 0.1 + u * 0.1, 0.08, pick(g === 'barber' ? [0x2f5f9a, 0xc23a30, 0xe8e4da, 0x2f3a45] : [0xe4dccb, 0xb5603a, 0x6a8f5a, 0xd4a830], P.id, j)); }
};
S.hooks = (P, c, T, r) => {
  const { W } = P, H = c.size[1], tags = c.tags, top = H - 0.05;              // the bar is the top of the item, things hang from it
  P.box(c.mat, 0, top, 0, W, 0.05, P.D, T);
  const n = Math.max(3, Math.round(W / 0.22));
  for (let j = 0; j < n; j++) {
    const x = -W / 2 + (j + 0.5) * W / n, u = u01(P.id, j);
    if (tags.includes('towel')) P.box('towel_terry', x, Math.max(0, top - 0.16 - u * 0.1), P.D * 0.3, 0.1, Math.min(top, 0.16 + u * 0.1), 0.03, pick([0xe6ddd0, 0x9db8d0, 0xd9a0a8, 0xb7c9a0], P.id, j));
    else if (tags.includes('pots')) { P.cyl('metal_steel', x, Math.max(0, top - 0.2 - u * 0.05), P.D * 0.3, 0.075 - u * 0.02, 0.1 + u * 0.05, 10); P.box('metal_dark', x, top - 0.1, P.D * 0.1, 0.012, 0.1, 0.012); }
    else if (tags.includes('carniceria')) { P.box('metal_steel', x, top - 0.05, 0.0, 0.015, 0.05, 0.015); P.flat(x, 0, 0.0, 0.1, top - 0.04, 0.08, 0xa8403c); }
    else if (tags.includes('entry')) { P.box('metal_dark', x, top - 0.04, P.D * 0.3, 0.02, 0.04, 0.04); if (j % 2) P.flat(x, 0, P.D * 0.4, 0.14, top - 0.04, 0.05, pick([0x2f3a45, 0x8a3a2a, 0x6a7a62, 0xb09a8a], P.id, j)); }
    else P.box('metal_dark', x, top - 0.05, P.D * 0.2, 0.02, 0.05, 0.03);
  }
};

// ---- seating
S.sofa = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], m = c.mat, n = c.seat?.[1] ?? 2, arm = 0.17, d = (k) => (T ? mul(T, k) : undefined);
  P.box(m, 0, 0.07, 0, W, 0.23, D, d(0.85), NY);                                                          // base
  const iw = (W - 2 * arm) / n;
  for (let i = 0; i < n; i++) {
    P.box(m, -W / 2 + arm + iw * (i + 0.5), 0.3, 0.09, iw - 0.015, 0.15, D - 0.22, T ?? undefined);       // seat cushions
    P.box(m, -W / 2 + arm + iw * (i + 0.5), 0.42, -D / 2 + 0.24, iw - 0.02, H - 0.46, 0.16, d(0.95));    // back cushions
  }
  P.box(m, 0, 0.3, -D / 2 + 0.07, W, H - 0.3, 0.14, d(0.9));                                              // back frame
  for (const sx of [-1, 1]) P.box(m, sx * (W / 2 - arm / 2), 0.3, 0.0, arm, 0.3, D - 0.02, d(0.92));     // arms
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box('wood_dark', sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.08), 0.05, 0.08, 0.05, undefined, ['ny']);
  if (m === 'fabric_sofa') {                                                                                // crochet covers on the back and arms
    P.box('crochet_cover', 0, H - 0.02, -D / 2 + 0.09, Math.min(0.55, W * 0.4), 0.02, 0.18);
    for (const sx of [-1, 1]) P.box('crochet_cover', sx * (W / 2 - arm / 2), 0.6, 0.0, 0.17, 0.016, 0.28);
  }
};
S.armchair = (P, c, T, r) => S.sofa(P, { ...c, seat: [0.45, 1] }, T, r);
S.chair = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], sh = c.seat[0], n = r.name;
  if (n === 'office_chair') {
    const col = T ?? 0x2a2a2a;
    P.cyl('metal_dark', 0, 0, 0, 0.03, sh - 0.12, 8);
    for (let i = 0; i < 3; i++) P.box('metal_dark', 0, 0.02, 0, 0.5, 0.03, 0.04, undefined, undefined, i * Math.PI / 3);
    P.flat(0, sh - 0.1, 0, W, 0.1, D, col);
    P.flat(0, sh, -D / 2 + 0.05, W - 0.06, H - sh, 0.08, col);
    return;
  }
  if (n === 'rocking_chair') {
    const col = T ?? 0x6b4226;
    for (const sx of [-1, 1]) P.box(c.mat, sx * (W / 2 - 0.03), 0, 0, 0.04, 0.05, D, col);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(c.mat, sx * (W / 2 - 0.04), 0.04, sz * 0.25, 0.04, sh - 0.04, 0.04, col, ['ny', 'py']);
    P.box(c.mat, 0, sh - 0.04, 0.02, W - 0.06, 0.04, 0.5, col);
    P.box(c.mat, 0, sh, -0.24, W - 0.1, H - sh, 0.04, col);
    return;
  }
  const plastic = c.mat === FLAT, padded = n === 'chair_wood_padded';
  const m = c.mat, col = padded ? undefined : (T ?? (n === 'chair_metal' ? STEEL : undefined));
  legs4(P, m, plastic && col ? mul(col, 0.85) : col, W, D, sh - 0.04, 0.03);
  P.box(m, 0, sh - 0.04, 0, W, 0.04, D, col);
  if (padded) P.box('vinyl_sofa', 0, sh, 0.01, W - 0.04, 0.05, D - 0.05, T);
  P.box(m, 0, sh, -D / 2 + 0.025, W - 0.02, H - sh, 0.04, col);
  if (padded) P.box('vinyl_sofa', 0, sh + 0.12, -D / 2 + 0.055, W - 0.1, 0.22, 0.04, T);
  if (n === 'chair_plastic_arm') for (const sx of [-1, 1]) P.box(m, sx * (W / 2 - 0.02), sh, -0.02, 0.04, 0.2, D * 0.7, col);
};
S.stool = (P, c, T, r) => {
  const sh = c.seat[0], n = r.name, rad = c.size[0] / 2;
  if (n === 'pouf') { P.cyl('fabric_sofa', 0, 0, 0, rad, c.size[1], 12, T, rad * 0.92); return; }
  const m = c.mat;
  P.cyl(m, 0, sh - 0.04, 0, rad, 0.04, 12, T);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.5; P.box(m === 'metal_painted' ? 'metal_dark' : m, Math.cos(a) * rad * 0.62, 0, Math.sin(a) * rad * 0.62, 0.035, sh - 0.04, 0.035, m === FLAT ? T : undefined, ['ny', 'py']); }
  if (n === 'stool_bar') P.cyl('metal_chrome', 0, sh * 0.35, 0, rad * 0.62, 0.015, 10, undefined, undefined, false);
};
S.bench = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], pad = r.name === 'kneeler';
  P.box(c.mat, 0, H - 0.05, 0, W, 0.05, D, T);
  for (const sx of [-1, 1]) P.box(c.mat, sx * (W / 2 - 0.05), 0, 0, 0.05, H - 0.05, D - 0.04, T ? mul(T, 0.9) : undefined, NY);
  if (pad) P.box('vinyl_sofa', 0, H - 0.01, 0, W - 0.1, 0.05, D - 0.06, 0x6a2a2a);
};
S.pew = (P, c, T) => {
  const { W, D } = P, H = c.size[1], d = (k) => (T ? mul(T, k) : undefined);
  for (const sx of [-1, 1]) P.box(c.mat, sx * (W / 2 - 0.03), 0, 0, 0.06, H, D, d(0.9), NY);
  P.box(c.mat, 0, 0.4, 0.04, W - 0.12, 0.045, D - 0.14, T ?? undefined);        // seat
  P.box(c.mat, 0, 0.45, -D / 2 + 0.04, W - 0.12, H - 0.45, 0.05, T ?? undefined);   // back
  P.box(c.mat, 0, 0.12, D / 2 - 0.1, W - 0.12, 0.28, 0.04, T ?? undefined);     // front panel
  P.box(c.mat, 0, 0.0, D / 2 - 0.1, W - 0.12, 0.14, 0.18, d(0.8), NY);          // kneeler plank (inside the footprint)
};
S.waiting = (P, c, T) => {
  const { W, D } = P, H = c.size[1], col = T ?? 0x2f3a45, n = c.seat[1];
  P.box('metal_chrome', 0, 0.2, 0.0, W, 0.04, 0.05);
  for (const sx of [-1, 1]) P.box('metal_dark', sx * (W / 2 - 0.05), 0, 0.0, 0.04, 0.42, D * 0.8, undefined, NY);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + W * (i + 0.5) / n;
    P.flat(x, 0.42, 0.02, W / n - 0.04, 0.05, D - 0.1, col);
    P.flat(x, 0.5, -D / 2 + 0.05, W / n - 0.04, H - 0.5, 0.05, col);
  }
};
S.barber = (P, c, T) => {
  const H = c.size[1], col = T ?? 0x6a2a2a;
  P.cyl('metal_chrome', 0, 0, 0, 0.28, 0.04, 14);
  P.cyl('metal_chrome', 0, 0.04, 0, 0.06, 0.4, 8);
  P.box('vinyl_sofa', 0, 0.44, 0.04, 0.5, 0.12, 0.5, col);
  P.box('vinyl_sofa', 0, 0.54, -0.22, 0.5, 0.5, 0.12, col);
  P.box('vinyl_sofa', 0, 1.0, -0.22, 0.28, H - 1.0, 0.1, col);
  for (const sx of [-1, 1]) { P.box('metal_chrome', sx * 0.27, 0.52, 0.02, 0.05, 0.04, 0.46); P.box('vinyl_sofa', sx * 0.27, 0.56, 0.02, 0.06, 0.04, 0.4, col); }
  P.box('metal_chrome', 0, 0.12, 0.34, 0.34, 0.03, 0.18);
};
S.pupitre = (P, c, T) => {
  const { W, D } = P, H = c.size[1], col = T ?? 0xd9a441;
  for (const sx of [-1, 1]) {
    P.box('metal_dark', sx * (W / 2 - 0.03), 0, -D / 2 + 0.1, 0.03, 0.42, 0.03, undefined, ['ny', 'py']);
    P.box('metal_dark', sx * (W / 2 - 0.03), 0, D / 2 - 0.06, 0.03, H - 0.04, 0.03, undefined, ['ny', 'py']);
    P.box('metal_dark', sx * (W / 2 - 0.03), 0.36, 0.02, 0.03, 0.03, D - 0.16);
  }
  P.box('wood_pine', 0, 0.42, -D / 2 + 0.2, W - 0.06, 0.035, 0.36, col);                 // seat (the sitter faces +z, the desk top is in front)
  P.box('wood_pine', 0, 0.55, -D / 2 + 0.03, W - 0.08, 0.2, 0.03, col);                   // back rest
  P.box('melamine_wood', 0, H - 0.035, D / 2 - 0.23, W, 0.035, 0.46);                    // desk top
};

// ---- tables and desks
S.table = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], n = r.name, m = c.mat, plastic = m === FLAT;
  if (n === 'table_pingpong') { P.box('metal_painted', 0, H - 0.03, 0, W, 0.03, D, 0x1d5c63); P.box(FLAT, 0, H, 0, 0.012, 0.15, D, 0xf0efe8); legs4(P, 'metal_dark', undefined, W, D, H - 0.03, 0.05, 0.2); return; }
  if (n === 'table_foosball') { P.box(m, 0, 0.55, 0, W, 0.35, D, 0x4a7a3a, NY); legs4(P, 'metal_dark', undefined, W, D, 0.55, 0.06); for (let i = -2; i <= 2; i++) P.box('metal_chrome', i * 0.26, 0.9, 0, 0.012, 0.012, D + 0.2); return; }
  const topT = 0.04, col = T ?? undefined;
  P.box(m, 0, H - topT, 0, W, topT, D, col);
  if (c.top) P.box(c.top, 0, H, 0, W - 0.02, 0.012, D - 0.02);                                   // oilcloth
  if (c.glass) P.box('glass', 0, 0.2, 0, W - 0.1, 0.012, D - 0.1);                               // lower glass shelf of the coffee table
  if (n === 'cutting_table' || n === 'dough_table' || n === 'folding_table') {
    for (const sx of [-1, 1]) P.box(m, sx * (W / 2 - 0.05), 0, 0, 0.05, H - topT, D - 0.08, col ? mul(col, 0.9) : undefined, ['ny', 'py']);
    P.box(m, 0, 0.2, 0, W - 0.1, 0.03, D - 0.1, col);
  } else legs4(P, m === 'formica' ? 'metal_chrome' : m, m === 'formica' || !col ? undefined : mul(col, 0.9), W, D, H - topT, plastic ? 0.04 : 0.045, 0.04);
  if (m === 'formica') P.box('metal_chrome', 0, H - topT - 0.01, 0, W - 0.04, 0.012, D - 0.04);
};
S.tableRound = (P, c, T, r) => {
  const rad = P.W / 2, H = c.size[1], m = c.mat, leg = m === 'metal_painted' ? 'metal_dark' : m;
  P.cyl(m, 0, H - 0.04, 0, rad, 0.04, 16, T);
  if (c.top) P.cyl(c.top, 0, H, 0, rad - 0.015, 0.012, 16);
  P.cyl(leg, 0, 0.03, 0, 0.035, H - 0.07, 8, T ? mul(T, 0.9) : undefined);
  P.cyl(leg, 0, 0, 0, rad * 0.55, 0.03, 12, T ? mul(T, 0.9) : undefined);
};
S.desk = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], col = T ?? undefined;
  P.box(c.mat, 0, H - 0.04, 0, W, 0.04, D, col);
  P.box(c.mat, -W / 2 + 0.2, 0, 0.0, 0.38, H - 0.04, D - 0.04, col ? mul(col, 0.92) : undefined, NY);   // drawer pedestal
  for (let i = 0; i < 3; i++) { P.box('metal_dark', -W / 2 + 0.2, 0.1 + i * 0.2, D / 2 - 0.018, 0.34, 0.008, 0.004); P.box('metal_chrome', -W / 2 + 0.2, 0.17 + i * 0.2, D / 2 - 0.01, 0.1, 0.014, 0.02); }
  P.box(c.mat, W / 2 - 0.03, 0, 0.0, 0.04, H - 0.04, D - 0.04, col, NY);
  P.box(c.mat, 0, 0.25, -D / 2 + 0.01, W - 0.4, H - 0.3, 0.02, col);                                      // modesty panel
};
S.bench2 = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], col = T ?? undefined;
  P.box(c.mat, 0, H - 0.06, 0, W, 0.06, D, col);
  for (const sx of [-1, 1]) P.box(c.mat, sx * (W / 2 - 0.05), 0, 0, 0.07, H - 0.06, D - 0.06, col ? mul(col, 0.85) : undefined, ['ny', 'py']);
  P.box(c.mat, 0, 0.22, 0, W - 0.1, 0.04, D - 0.1, col);
  P.box('metal_dark', W * 0.34, H, -D * 0.2, 0.12, 0.1, 0.1);                                             // vice
  P.flat(-W * 0.2, H, 0.0, 0.3, 0.04, 0.2, 0x8a7456);
  if (r.name.includes('cobbler')) for (let i = 0; i < 3; i++) P.flat(-0.5 + i * 0.12, H, -0.15, 0.1, 0.08, 0.1, 0x2a2a2c);
};
S.ironing = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.box('metal_painted', 0, H - 0.03, 0, W, 0.03, D, 0xd9d4c4);
  for (const sx of [-1, 1]) { P.box('metal_dark', sx * 0.3, 0, 0, 0.02, H - 0.03, 0.02, undefined, NY, 0.5); P.box('metal_dark', sx * 0.3, 0, 0, 0.02, H - 0.03, 0.02, undefined, NY, -0.5); }
};

// ---- kitchen, laundry
S.stove = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.box(c.mat, 0, 0, 0, W, H - 0.04, D, undefined, NY);
  P.box('metal_dark', 0, H - 0.04, 0, W, 0.04, D);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.cyl('metal_dark', sx * W * 0.22, H, sz * D * 0.2, 0.07, 0.02, 10, 0x3a3a3c);
  P.box('glass', 0, 0.12, D / 2 + 0.002, W - 0.14, H - 0.36, 0.008, 0x303236);
  P.box('metal_chrome', 0, H - 0.2, D / 2 + 0.02, W - 0.16, 0.02, 0.025);
  for (let i = -2; i <= 2; i++) P.cyl('metal_dark', i * 0.1, H - 0.14, D / 2, 0.018, 0.02, 6);
};
S.cylinder = (P, c, T, r) => {
  const n = r.name, rad = Math.min(P.W, P.D) / 2, H = c.size[1];
  const col = T ?? c.pc ?? NAMECOL[n];
  if (n === 'gas_cylinder') { P.cyl(FLAT, 0, 0, 0, rad, H - 0.1, 12, col, rad * 0.95); P.cyl(FLAT, 0, H - 0.1, 0, rad * 0.5, 0.06, 8, mul(col, 0.8), rad * 0.3); P.cyl('metal_chrome', 0, H - 0.04, 0, 0.03, 0.05, 6); return; }
  if (n === 'water_stand') { P.box('metal_painted', 0, 0, 0, rad * 2, 0.5, rad * 2, 0xd9d4c4, NY); P.cyl('glass', 0, 0.5, 0, rad * 0.9, H - 0.5, 12, undefined, rad * 0.4); return; }
  if (n === 'bucket_big') { P.cyl(FLAT, 0, 0, 0, rad * 0.84, H, 12, col, rad); P.cyl(FLAT, 0, H - 0.01, 0, rad * 0.8, 0.012, 12, 0x2f3a45, undefined, false); return; }
  if (n === 'trash_bin' || n === 'laundry_basket') { P.cyl(FLAT, 0, 0, 0, rad * 0.8, H, 10, col, rad); return; }
  if (n === 'oil_drum') { P.cyl('metal_painted', 0, 0, 0, rad, H, 12, col); for (const y of [0.2, 0.44, 0.68]) P.cyl('metal_painted', 0, y, 0, rad + 0.008, 0.03, 12, mul(col ?? 0x808080, 0.8)); return; }
  if (n === 'water_tank_small') { P.cyl(FLAT, 0, 0, 0, rad, H, 14, col); P.cyl(FLAT, 0, H, 0, rad * 0.45, 0.04, 8, mul(col, 0.8)); return; }
  if (n === 'pot_stack') { P.cyl('metal_steel', 0, 0, 0, rad, 0.12, 10); P.cyl('metal_steel', 0, 0.12, 0, rad * 0.8, 0.1, 10); P.cyl('metal_steel', 0, 0.22, 0, rad * 0.6, 0.08, 10); return; }
  if (n === 'kettle') { P.cyl('metal_steel', 0, 0, 0, rad * 0.9, H * 0.7, 10, undefined, rad * 0.6); P.box('metal_dark', rad * 0.9, H * 0.4, 0, 0.06, 0.04, 0.03); P.box('metal_dark', 0, H * 0.7, 0, rad * 1.1, 0.025, 0.02); return; }
  if (n === 'thermos_set') { for (let i = 0; i < 2; i++) { P.cyl(FLAT, -0.07 + i * 0.14, 0, 0, 0.055, H - 0.03 * i, 10, i ? 0xc23a30 : 0x2f6fbf); P.cyl('metal_chrome', -0.07 + i * 0.14, H - 0.03 * i, 0, 0.05, 0.03, 10); } return; }
  if (n === 'fruit_bowl') { P.cyl('ceramic_white', 0, 0, 0, rad, 0.08, 12, 0xe8e0cc, rad * 0.5); for (let i = 0; i < 5; i++) P.sphere(i % 2 ? 'food_mango' : 'food_banana', Math.cos(i * 1.3) * 0.06, 0.1, Math.sin(i * 1.3) * 0.06, 0.05); return; }
  if (n === 'bread_basket') { P.cyl('wood_pine', 0, 0, 0, rad, 0.1, 10, 0xc89a62, rad * 0.8); for (let i = 0; i < 4; i++) P.sphere('food_bread', -0.09 + i * 0.06, 0.12, (i % 2) * 0.04, 0.05, 0.035, 0.04); return; }
  P.cyl(c.mat, 0, 0, 0, rad, H, 10, col);
};
S.fridge = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], n = r.name, col = T ?? (n.includes('drinks') ? 0xd8e4ee : undefined);
  P.box(c.mat, 0, 0.03, 0, W, H - 0.03, D, col, NY);
  P.box('metal_dark', 0, 0, 0, W - 0.06, 0.03, D - 0.06);
  if (n === 'washing_machine') { P.hcyl(FLAT, 0, H * 0.4, D / 2 + 0.004, 0.2, 0.012, 'z', 16, 0xc8ccd0); P.hcyl(FLAT, 0, H * 0.4, D / 2 + 0.008, 0.16, 0.008, 'z', 16, 0x3a4a5a); P.box('metal_dark', 0, H - 0.14, D / 2 + 0.002, W - 0.1, 0.1, 0.004, 0x3a3a3c); return; }
  if (n === 'photocopier') { P.box('glass', 0, H - 0.01, 0, W - 0.1, 0.012, D - 0.12, 0x303236); P.box('metal_dark', 0.18, H - 0.2, D / 2 + 0.002, 0.2, 0.08, 0.004, 0x303236); return; }
  const split = n === 'fridge' ? 0.62 : 0.7;
  P.box('metal_dark', 0, H * split, D / 2 + 0.002, W - 0.02, 0.01, 0.004);
  P.box('metal_chrome', W / 2 - 0.07, H * split + 0.06, D / 2 + 0.02, 0.02, Math.min(0.28, H * 0.2), 0.025);
  P.box('metal_chrome', W / 2 - 0.07, H * split - 0.4 * Math.min(1, H / 1.6), D / 2 + 0.02, 0.02, 0.3 * Math.min(1, H / 1.6), 0.025);
  if (c.display) P.box('glass', 0, 0.1, D / 2 + 0.003, W - 0.12, H - 0.25, 0.006, 0x9ab4c4);
  if (r.flags?.magnets) for (let i = 0; i < 5; i++) { const u = u01(P.id, i); P.flat(-W * 0.2 + u * W * 0.4, H * 0.55 + i * 0.1, D / 2 + 0.006, 0.05 + u * 0.04, 0.05, 0.01, pick([0xd23a32, 0x2f6fbf, 0xe8c332, 0x2f9a58, 0xf0efe8], P.id, i)); }
};
S.sinkunit = (P, c, T) => {
  const { W, D } = P, H = c.size[1];
  P.box(c.mat, 0, 0, 0, W, H - 0.04, D, T ?? undefined, NY);
  for (let i = 1; i < 3; i++) P.box('metal_dark', -W / 2 + W * i / 3, 0.05, D / 2 + 0.002, 0.012, H - 0.14, 0.004);
  P.box('metal_steel', 0, H - 0.04, 0, W + 0.02, 0.04, D + 0.02);
  P.box('metal_dark', -W * 0.15, H - 0.0, 0.0, W * 0.4, 0.004, D * 0.6, 0x55595c);                       // basin hollow (dark)
  P.box('metal_chrome', -W * 0.15, H, -D / 2 + 0.08, 0.03, 0.2, 0.03);
  P.box('metal_chrome', -W * 0.15, H + 0.17, -D / 2 + 0.13, 0.025, 0.025, 0.1);
  P.flat(W * 0.32, H, 0.02, 0.28, 0.03, 0.4, 0xe4e0d4);                                                    // drainer
  for (let i = 0; i < 3; i++) P.box('metal_chrome', -W / 2 + W * (i + 0.5) / 3 + 0.12, H * 0.55, D / 2 + 0.012, 0.016, 0.1, 0.02);
};
const GOODS_BY_COUNTER = {
  pharmacy_counter: [0xf0efe8, 0x2f6fbf, 0x2f9a58, 0xd23a32], bread_case_glass: [0xc98a4a, 0xe8d0b0, 0xa8683a], fridge_meat: [0xa8403c, 0xc25a50, 0xe8d0b0],
  cafe_counter: [0xe4dccb, 0xc98a4a, 0x6b4226, 0xd4a830], shop_counter_glass: [0xe4dccb, 0xc23a30, 0x6a8f5a, 0xd4a830],
};
S.counter = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], n = r.name, glass = !!c.glass, col = T ?? undefined, d = (k) => (col ? mul(col, k) : undefined);
  if (c.tags.includes('kitchen')) {
    P.box(c.mat, 0, 0, 0, W, H - 0.04, D, col, NY);
    const k = Math.max(1, Math.round(W / 0.6));
    for (let i = 1; i < k; i++) P.box('metal_dark', -W / 2 + W * i / k, 0.05, D / 2 + 0.002, 0.012, H - 0.14, 0.004);
    for (let i = 0; i < k; i++) P.box('metal_chrome', -W / 2 + W * (i + 0.5) / k + 0.1, H * 0.62, D / 2 + 0.012, 0.016, 0.1, 0.02);
    P.box('formica', 0, H - 0.04, 0, W + 0.02, 0.04, D + 0.02, 0xd8d0c0);
    return;
  }
  if (n === 'barber_station') {
    P.box(c.mat, 0, 0, 0, W, H - 0.05, D, col, NY);
    for (let i = 1; i < 4; i++) P.box('metal_dark', -W / 2 + W * i / 4, 0.05, D / 2 + 0.002, 0.012, H - 0.15, 0.004);
    P.box('formica', 0, H - 0.05, 0, W + 0.02, 0.05, D + 0.02, 0xe8e0d0);
    for (let i = 0; i < 5; i++) { const u = u01(P.id, i); P.flat(-W / 2 + 0.15 + i * (W - 0.3) / 4, H, -0.02, 0.05 + u * 0.04, 0.12 + u * 0.12, 0.05, pick([0x2f5f9a, 0xc23a30, 0xe8e4da, 0x2f3a45], P.id, i)); }
    return;
  }
  // shop counters: solid body at the shopkeeper side, glass case at the customer side
  P.box(c.mat, 0, 0, 0, W, 0.62, D, col, NY);
  P.box(c.mat, 0, 0.62, -D / 2 + 0.12, W, H - 0.62, 0.24, d(0.9));
  if (glass) {
    P.box('glass', 0, 0.62, 0.1, W - 0.06, H - 0.62 - 0.02, D - 0.3);
    P.box('metal_chrome', 0, 0.62, 0.1, W - 0.04, 0.012, D - 0.28);
    const pal = GOODS_BY_COUNTER[n] ?? GOODS_BY_COUNTER.shop_counter_glass;
    for (let i = 0; i < 6; i++) { const u = u01(P.id, i); P.flat(-W / 2 + 0.2 + i * (W - 0.4) / 5.5, 0.64, 0.1, 0.12 + u * 0.08, 0.08 + u * 0.14, 0.12, pick(pal, P.id, i)); }
  } else P.box(c.mat, 0, H - 0.04, 0, W + 0.04, 0.04, D + 0.04, d(0.8));
  P.box(c.mat, 0, H - 0.01, 0, W + 0.04, 0.03, D + 0.04, d(0.75));
  P.box('metal_dark', 0, 0.06, D / 2 + 0.002, W - 0.1, 0.01, 0.004);
};
S.upper = (P, c, T) => {
  const { W, D } = P, H = c.size[1];
  P.box(c.mat, 0, 0, 0, W, H, D, T ?? undefined);
  const k = Math.max(2, Math.round(W / 0.45));
  for (let i = 1; i < k; i++) P.box('metal_dark', -W / 2 + W * i / k, 0.03, D / 2 + 0.002, 0.012, H - 0.06, 0.004);
  for (let i = 0; i < k; i++) P.box('metal_chrome', -W / 2 + W * (i + 0.5) / k + 0.07, 0.08, D / 2 + 0.012, 0.016, 0.08, 0.02);
};
S.lavadero = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.box('floor_cement', 0, 0, 0, W, H - 0.1, D, undefined, NY);
  P.box('floor_cement', 0, H - 0.1, -D / 2 + 0.03, W, 0.1, 0.06);
  P.box('floor_cement', -W / 2 + 0.03, H - 0.1, 0, 0.06, 0.1, D); P.box('floor_cement', W / 2 - 0.03, H - 0.1, 0, 0.06, 0.1, D); P.box('floor_cement', 0, H - 0.1, D / 2 - 0.03, W, 0.1, 0.06);
  P.box('floor_cement', W * 0.28, H - 0.1, 0.0, W * 0.4, 0.1, D - 0.1, 0xb8b4ac);                            // washboard
  P.box('metal_chrome', -W * 0.2, H, -D / 2 + 0.08, 0.025, 0.18, 0.025);
};
S.rack = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], tags = c.tags, mat = c.mat, col = T ?? undefined;
  if (tags.includes('candles')) {
    P.box(mat, 0, 0, 0, W, 0.5, D, undefined, NY);
    for (let k = 0; k < 3; k++) {
      P.box(mat, 0, 0.5 + k * 0.2, -D / 2 + 0.1 + k * 0.02, W, 0.03, D * 0.4);
      for (let j = 0; j < 7; j++) { const x = -W / 2 + 0.07 + j * (W - 0.14) / 6; P.flat(x, 0.53 + k * 0.2, -D / 2 + 0.1 + k * 0.02, 0.035, 0.08, 0.035, 0xf2ead2); P.flat(x, 0.61 + k * 0.2, -D / 2 + 0.1 + k * 0.02, 0.012, 0.025, 0.012, 0xffc060); }
    }
    return;
  }
  if (tags.includes('tendedero')) {                                                                              // drying rack with clothes
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box('metal_painted', sx * (W / 2 - 0.02), 0, sz * (D / 2 - 0.02), 0.025, H, 0.025, undefined, NY);
    for (let i = 0; i < 4; i++) P.box('metal_painted', 0, 0.25 + i * 0.22, 0, W, 0.02, 0.02);
    for (let i = 0; i < 4; i++) P.flat(-W / 2 + 0.18 + i * 0.22, 0.4 + (i % 2) * 0.2, 0.0, 0.14 + (i % 3) * 0.04, 0.3, 0.02, pick([0xd9a0a8, 0x9db8d0, 0xe0c88a, 0xf0efe8, 0x6a7a62, 0xb23a2a], P.id, i));
    return;
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(mat, sx * (W / 2 - 0.02), 0, sz * (D / 2 - 0.02), 0.03, H, 0.03, col, NY);
  const rows = Math.max(3, Math.round(H / 0.4));
  for (let k = 0; k < rows; k++) {
    const ly = 0.08 + k * (H - 0.12) / rows;
    P.box(mat, 0, ly, 0, W, 0.025, D, col);
    if (tags.includes('bread')) for (let j = 0; j < 4; j++) P.flat(-W / 2 + 0.12 + j * (W - 0.2) / 3.4, ly + 0.025, 0.0, 0.16, 0.07, 0.3, pick([0xc98a4a, 0xa8683a, 0xe8d0b0], P.id, k * 4 + j));
    else if (tags.includes('modista')) for (let j = 0; j < 3; j++) P.flat(-W / 2 + 0.2 + j * (W - 0.3) / 2.6, ly + 0.025, 0.0, 0.2, 0.2, 0.34, pick([0xb23a2a, 0x2f6fbf, 0xe8c332, 0x2f9a58, 0xf0efe8, 0x6a2a52], P.id, k * 3 + j));
    else if (tags.includes('papeleria')) for (let j = 0; j < 4; j++) P.flat(-W / 2 + 0.1 + j * 0.09, ly + 0.025, 0.0, 0.07, 0.16, 0.2, pick([0xd23a32, 0x2f6fbf, 0xe8c332, 0x2f9a58], P.id, k * 4 + j));
  }
};
S.line = (P, c, T, r) => {
  const W = P.W, H = c.size[1], top = H - 0.03;                                         // the line is the top of the item, laundry hangs below it
  P.box('metal_dark', 0, top, 0, W, 0.012, 0.012);
  for (const sx of [-1, 1]) P.box('metal_dark', sx * (W / 2 - 0.01), top - 0.1, 0, 0.03, 0.13, 0.03);
  const n = Math.max(3, Math.round(W / 0.45));
  for (let j = 0; j < n; j++) { const u = u01(P.id, j), h = 0.2 + u * 0.24; P.flat(-W / 2 + (j + 0.5) * W / n, top - h, 0.0, 0.26 + u * 0.14, h, 0.012, pick([0xd9a0a8, 0x9db8d0, 0xe0c88a, 0xf0efe8, 0x6a7a62, 0xb23a2a, 0x2f6fbf], P.id, j)); }
};

// ---- bathroom
S.toilet = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.box('ceramic_white', 0, 0.0, -D / 2 + 0.17, 0.22, 0.38, 0.3, undefined, NY);
  P.box('ceramic_white', 0, 0.38, -D / 2 + 0.08, W - 0.02, 0.4, 0.17);                 // cistern
  P.cyl('ceramic_white', 0, 0.0, 0.08, 0.17, 0.4, 12, undefined, 0.2);                 // bowl
  P.box('ceramic_white', 0, 0.4, 0.08, 0.36, 0.03, 0.4);                               // seat
  P.box('metal_chrome', 0.1, H - 0.01, -D / 2 + 0.08, 0.04, 0.02, 0.04);
};
S.basin = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], vanity = r.name.includes('vanity');
  if (vanity) { P.box('wood_painted', 0, 0, 0, W, H - 0.15, D, 0xe8e4da, NY); for (const sx of [-1, 1]) P.box('metal_chrome', sx * 0.14, H * 0.45, D / 2 + 0.012, 0.016, 0.1, 0.02); }
  else P.cyl('ceramic_white', 0, 0, -D * 0.1, 0.09, H - 0.15, 8, undefined, 0.07);
  P.box('ceramic_white', 0, H - 0.15, 0, W, 0.15, D, undefined, vanity ? undefined : NY);
  P.box('metal_chrome', 0, H, -D / 2 + 0.08, 0.03, 0.12, 0.03);
  P.box('metal_chrome', 0, H + 0.1, -D / 2 + 0.12, 0.03, 0.02, 0.1);
};
S.shower = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.box('ceramic_white', 0, 0, 0, W, 0.1, D, undefined, NY);
  P.box('wall_tile', -W / 2 + 0.03, 0.1, 0, 0.06, 0.8, D, 0xdfe6ea);                      // low tiled kerb on two sides
  P.box('wall_tile', 0, 0.1, -D / 2 + 0.03, W, 0.8, 0.06, 0xdfe6ea);
  P.box('curtain_fabric', 0, 0.9, D / 2 - 0.03, W - 0.04, H - 0.95, 0.012, 0x9db8d0);       // curtain across the front
  P.box('curtain_fabric', W / 2 - 0.03, 0.9, 0, 0.012, H - 0.95, D - 0.04, 0x9db8d0);
  P.box('metal_chrome', -W / 2 + 0.1, 0.1, -D / 2 + 0.1, 0.025, H - 0.2, 0.025);
};
S.mirror = (P, c) => {
  const { W, H } = P;
  P.box('wood_dark', 0, 0, 0, W, H, 0.03, 0x5a3a24);
  P.box('mirror', 0, 0.03, 0.016, W - 0.06, H - 0.06, 0.004);
};

// ---- electronics, lights
const SCREENS = ['tv_screen_a', 'tv_screen_b'];
S.tv = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], wall = r.kind === 'wall', y = wall ? 0 : 0.06, col = NAMECOL[r.name] ?? 0x15171b;
  P.flat(0, y, 0, W, H - y, D, col);
  P.box(SCREENS[Math.floor(u01(P.id, 3) * 2) % 2], 0, y + 0.03, D / 2 + 0.002, W - 0.06, H - y - 0.06, 0.004);
  if (!wall) P.flat(0, 0, 0, 0.3, 0.06, 0.18, 0x15171b);
};
S.tvcrt = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1];
  P.flat(0, 0, D / 2 - 0.12, W, H, 0.24, NAMECOL.tv_crt);
  P.flat(0, 0.05, -0.05, W * 0.72, H * 0.78, D * 0.6, mul(NAMECOL.tv_crt, 0.85));
  P.box(SCREENS[Math.floor(u01(P.id, 4) * 2) % 2], 0, 0.07, D / 2 + 0.002, W * 0.76, H * 0.76, 0.004);
  P.flat(W * 0.4, 0.08, D / 2 + 0.003, 0.03, 0.2, 0.006, 0x8a8a8a);
};
S.radio = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], bb = r.name === 'radio_boombox';
  P.box(c.mat, 0, 0, 0, W, H, D, bb ? NAMECOL.radio_boombox : T ?? undefined, NY);
  P.flat(-W * 0.2, H * 0.15, D / 2 + 0.003, W * 0.42, H * 0.7, 0.004, 0x1c1c1e);
  P.flat(W * 0.27, H * 0.55, D / 2 + 0.003, W * 0.28, H * 0.12, 0.004, 0xe0c88a);
  P.box('metal_chrome', W * 0.12, H, -D / 4, 0.01, 0.2, 0.01, undefined, undefined, 0.5);
};
S.fanc = (P, c, T, r) => {
  const rad = P.W / 2, H = c.size[1], col = T ?? 0xa87445;
  P.cyl('metal_dark', 0, H - 0.1, 0, 0.012, 0.1, 6);
  P.cyl('metal_dark', 0, H - 0.2, 0, 0.1, 0.1, 10, undefined, 0.07);
  for (let i = 0; i < 4; i++) P.box('wood_pine', Math.cos(i * Math.PI / 2) * (rad * 0.52 + 0.02), H - 0.19, Math.sin(i * Math.PI / 2) * (rad * 0.52 + 0.02), i % 2 ? 0.14 : rad * 0.9, 0.012, i % 2 ? rad * 0.9 : 0.14, col);
};
S.fans = (P, c, T, r) => {
  const n = r.name, H = c.size[1], col = NAMECOL[n] ?? T;
  if (n === 'fan_desk') { P.cyl(FLAT, 0, 0, 0, 0.1, 0.03, 10, col); P.box(FLAT, 0, 0.03, 0, 0.03, 0.18, 0.03, col); P.cyl(FLAT, 0, 0.2, 0.02, 0.14, 0.05, 12, col); return; }
  P.cyl(FLAT, 0, 0, 0, 0.2, 0.03, 12, col);
  P.cyl('metal_chrome', 0, 0.03, 0, 0.018, H - 0.45, 6);
  P.cyl(FLAT, 0, H - 0.4, 0.0, 0.2, 0.1, 12, col, 0.15);
  for (let i = 0; i < 3; i++) P.flat(0, H - 0.38 + 0.04, 0.06, 0.36, 0.2, 0.01, 0xcfd2d4, undefined, i * 1.047);
};
S.lamp = (P, c, T, r) => {
  const H = c.size[1], floor = !r.kind || r.kind === 'floor';
  if (floor) {
    P.cyl('metal_dark', 0, 0, 0, 0.14, 0.03, 10);
    P.cyl('metal_dark', 0, 0.03, 0, 0.012, H - 0.45, 6);
    P.cyl('lamp_shade', 0, H - 0.42, 0, 0.17, 0.4, 12, T ?? undefined, 0.1);
  } else {
    P.cyl('ceramic_white', 0, 0, 0, 0.07, 0.03, 8);
    P.cyl('ceramic_white', 0, 0.03, 0, 0.04, 0.16, 8, 0xdad6c8, 0.025);
    P.cyl('lamp_shade', 0, H - 0.22, 0, 0.12, 0.22, 10, T ?? undefined, 0.07);
  }
};
S.bulb = (P, c) => {
  const H = c.size[1];
  P.box('metal_dark', 0, H - 0.1, 0, 0.012, 0.1, 0.012, 0x15171b);
  P.cyl('metal_dark', 0, H - 0.14, 0, 0.022, 0.05, 6, 0x2a2a2c);
  P.cyl('bulb_glow', 0, 0, 0, 0.032, 0.1, 8, undefined, 0.022);
};
S.tube = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.box('metal_painted', 0, H - 0.02, 0, W + 0.02, 0.02, D, 0xd8d4c8);
  P.box('tube_glow', 0, 0, 0, W - 0.04, 0.04, D - 0.04);
};
S.pc = (P, c) => {
  P.flat(0, 0, -0.1, 0.5, 0.01, 0.2, 0x303236);
  P.flat(0, 0.01, -0.12, 0.08, 0.1, 0.06, 0x303236);
  P.flat(0, 0.1, -0.12, 0.46, 0.32, 0.05, 0x24262a);
  P.box('tv_screen_a', 0, 0.12, -0.093, 0.42, 0.26, 0.004);
  P.flat(0, 0.0, 0.08, 0.4, 0.02, 0.14, 0xd6d2c6);
  P.flat(0.27, 0, -0.1, 0.16, 0.38, 0.38, 0xd6d2c6);
};
S.clock = (P, c) => {
  const rad = Math.min(P.W, P.H) / 2;
  P.hcyl('wood_dark', 0, rad, -0.004, rad, 0.036, 'z', 14);
  P.hcyl(FLAT, 0, rad, 0.016, rad * 0.86, 0.006, 'z', 14, 0xf4f0e6);
  P.box(FLAT, 0, rad, 0.02, 0.012, rad * 0.7, 0.004, 0x1c1c1e);
  P.box(FLAT, rad * 0.22, rad - 0.006, 0.02, rad * 0.5, 0.012, 0.004, 0x1c1c1e);
};

// ---- religion and decor
S.altar = (P, c, T) => {
  const { W, D } = P, H = c.size[1], col = T ?? 0xd8cfc0;
  P.box(c.mat, 0, 0, 0, W, 0.55, D, col, NY);
  P.box('wood_painted', 0, 0.55, 0, W + 0.04, 0.03, D + 0.04, mul(col, 0.9));
  P.box('crochet_cover', 0, 0.58, 0.04, W * 0.8, 0.01, D * 0.8);
  P.box(c.mat, 0, 0.59, -D / 2 + 0.07, W * 0.8, 0.2, D * 0.4, col);                        // step for the figures
  P.box('wood_dark', 0, 0.59, -D / 2 + 0.01, W, H - 0.59, 0.02);                              // backboard
  P.box('metal_dark', 0, H - 0.16, -D / 2 + 0.03, 0.2, 0.28, 0.01);
};
S.statue = (P, c) => {
  const H = c.size[1];
  P.cyl(FLAT, 0, 0, 0, 0.09, 0.03, 8, 0xb8a888);
  P.cyl('plaster_statue', 0, 0.03, 0, 0.08, H * 0.62, 8, 0xe8e2d4, 0.04);
  P.sphere('plaster_statue', 0, H * 0.78, 0, 0.034, 0.04, 0.034, 0xe8e2d4);
  P.flat(0, H * 0.18, 0.06, 0.1, H * 0.4, 0.02, 0x2f6fbf);
};
S.statueBig = (P, c) => {
  const H = c.size[1];
  P.box('wood_dark', 0, 0, 0, P.W, 0.35, P.D, undefined, NY);
  P.cyl('plaster_statue', 0, 0.35, 0, 0.17, H * 0.5, 10, 0xe8e2d4, 0.1);
  P.sphere('plaster_statue', 0, 0.35 + H * 0.58, 0, 0.07, 0.085, 0.07, 0xe8e2d4);
  P.flat(0, 0.45, 0.1, 0.34, H * 0.45, 0.04, 0x2f6fbf);
};
S.vase = (P, c) => {
  P.cyl('ceramic_white', 0, 0, 0, 0.08, 0.18, 10, 0xdad6c8, 0.05);
  for (let i = 0; i < 6; i++) { const a = i * 1.05; P.flat(Math.cos(a) * 0.06, 0.2 + (i % 3) * 0.05, Math.sin(a) * 0.06, 0.05, 0.05, 0.05, pick([0xc8302a, 0xe8c030, 0xf0efe8, 0xd9a0a8], P.id, i)); P.flat(Math.cos(a) * 0.03, 0.14, Math.sin(a) * 0.03, 0.012, 0.1, 0.012, 0x4a8a3a); }
};
S.cross = (P, c, T) => {
  const { W, H } = P;
  P.box(c.mat, 0, 0, 0, 0.06 * Math.max(1, W / 0.3), H, 0.04, T ?? undefined);
  P.box(c.mat, 0, H * 0.62, 0, W, 0.06 * Math.max(1, W / 0.3), 0.04, T ?? undefined);
  P.flat(0, H * 0.3, 0.025, 0.08 * Math.max(1, W / 0.3), H * 0.5, 0.012, 0xc89a62);
};
S.altarMain = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.box('wood_painted', 0, 0, 0, W, H - 0.04, D, 0xece6d6, NY);
  P.box('wood_painted', 0, H - 0.04, 0, W + 0.08, 0.04, D + 0.08, 0xd8cfc0);
  P.box('crochet_cover', 0, H, 0.0, W * 0.9, 0.01, D * 0.8);
  P.box('crochet_cover', 0, 0.3, D / 2 + 0.003, W * 0.7, 0.5, 0.01, 0xf0e8d8);
  P.flat(-W * 0.3, H + 0.01, 0, 0.05, 0.18, 0.05, 0xf2ead2); P.flat(W * 0.3, H + 0.01, 0, 0.05, 0.18, 0.05, 0xf2ead2);
  P.flat(0, H + 0.01, 0, 0.1, 0.15, 0.1, 0xd4a830);
};
S.lectern = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.box(c.mat, 0, 0, 0, 0.3, H - 0.25, 0.25, undefined, NY);
  P.box(c.mat, 0, H - 0.25, 0, W, 0.06, D);
  P.box(c.mat, 0, H - 0.19, 0.03, W - 0.04, 0.14, D - 0.04);
};
S.plant = (P, c, T, r) => {
  const n = r.name, H = c.size[1], W = P.W, pot = NAMECOL[n] ?? T ?? 0xb5603a;
  const potH = n === 'plant_bucket' ? 0.34 : n === 'plant_big' ? 0.42 : n === 'plant_hanging' ? 0.18 : n === 'plant_tin' ? 0.16 : 0.3;
  const hang = r.kind === 'ceil', y0 = hang ? H - potH : 0;
  P.cyl(n === 'plant_bucket' ? FLAT : n === 'plant_tin' ? 'metal_painted' : 'clay_terracotta', 0, y0, 0, W * 0.4, potH, 10, n === 'plant_bucket' ? (T ?? pick([0xd23a32, 0x2f6fbf, 0xe8c332], P.id)) : pot, W * 0.5);
  P.cyl('soil', 0, y0 + potH - 0.01, 0, W * 0.38, 0.012, 10, undefined, undefined, false);
  const leaves = n === 'plant_big' ? 9 : 6, green = [0x4a8a3a, 0x3a7a30, 0x5a9a44];
  for (let i = 0; i < leaves; i++) {
    const a = i * 2.4 + u01(P.id, i), rr = (0.12 + u01(P.id, 10 + i) * 0.14) * (n === 'plant_big' ? 1.3 : 1), hh = (H - potH) * (0.5 + u01(P.id, 20 + i) * 0.5);
    P.box('leaf_green', Math.cos(a) * rr * 0.5, y0 + potH, Math.sin(a) * rr * 0.5, 0.03, hh, 0.16 + u01(P.id, 30 + i) * 0.08, pick(green, P.id, i), undefined, a);
  }
  if (n === 'plant_pot_clay' || n === 'plant_bucket') for (let i = 0; i < 3; i++) P.flat(Math.cos(i * 2.1) * 0.1, y0 + potH + (H - potH) * 0.7, Math.sin(i * 2.1) * 0.1, 0.05, 0.05, 0.05, pick([0xc8302a, 0xe8c030, 0xd9a0a8], P.id, i));
};

// ---- shops
const GOODS = {
  tienda: { pal: [0xd23a32, 0xe8c332, 0x2f6fbf, 0x2f9a58, 0xf0efe8, 0xc98a4a], w: [0.07, 0.14], h: [0.12, 0.26], d: 0.8 },
  ferre: { pal: [0xb23a2a, 0x2f6fbf, 0xe8c332, 0x6a7a62, 0x8a8a8a, 0xd8d0c0], w: [0.1, 0.2], h: [0.1, 0.22], d: 0.8 },
  pharma: { pal: [0xf0efe8, 0x2f6fbf, 0x2f9a58, 0xd23a32, 0xe8c332, 0xd9a0a8], w: [0.05, 0.1], h: [0.07, 0.15], d: 0.8 },
  papel: { pal: [0xd23a32, 0x2f6fbf, 0xe8c332, 0x2f9a58, 0xf0efe8, 0xd9a0a8], w: [0.04, 0.09], h: [0.16, 0.24], d: 0.7 },
  shoes: { pal: [0x2a2a2c, 0x6b4226, 0xd23a32, 0xe8e4da, 0x2f5f9a, 0xd4a830], w: [0.2, 0.26], h: [0.09, 0.13], d: 0.8 },
  fabric: { pal: [0xb23a2a, 0x2f6fbf, 0xe8c332, 0x2f9a58, 0x6a2a52, 0xf0efe8, 0xd9a0a8], w: [0.14, 0.2], h: [0.26, 0.34], d: 0.9 },
  cafe: { pal: [0xe4dccb, 0x6b4226, 0xc23a30, 0xd4a830, 0x2f6fbf], w: [0.08, 0.14], h: [0.1, 0.24], d: 0.6 },
  parts: { pal: [0x2a2a2c, 0xb23a2a, 0xc8ccd0, 0xe8c332, 0x2f5f9a], w: [0.12, 0.22], h: [0.1, 0.2], d: 0.8 },
};
S.shopshelf = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], g = c.goods, col = T ?? undefined, G = GOODS[g] ?? GOODS.tienda;
  if (g === 'chips') {                                                          // wire spinner of hanging snack bags
    P.box('metal_dark', 0, 0, -D / 2 + 0.01, W, H, 0.02, undefined, NY);
    for (const sx of [-1, 1]) P.box('metal_dark', sx * (W / 2 - 0.015), 0, 0, 0.03, H, D, undefined, NY);
    for (let k = 0; k < 6; k++) for (let j = 0; j < 3; j++) P.flat(-W / 2 + 0.1 + j * (W - 0.2) / 2.2, 0.25 + k * 0.24, -D / 2 + 0.08, 0.14, 0.2, 0.05, pick([0xd23a32, 0xe8c332, 0x2f6fbf, 0x2f9a58, 0xf0efe8, 0xe8832a], P.id, k * 3 + j));
    return;
  }
  P.box(c.mat, -W / 2 + 0.02, 0, 0, 0.04, H, D, col, NY);
  P.box(c.mat, W / 2 - 0.02, 0, 0, 0.04, H, D, col, NY);
  P.box('plywood', 0, 0.02, -D / 2 + 0.01, W - 0.08, H - 0.02, 0.02);
  const rows = Math.max(3, Math.round(H / 0.4));
  for (let k = 0; k <= rows; k++) {
    const ly = k === rows ? H - 0.03 : k === 0 ? 0.06 : 0.06 + (H - 0.09) * k / rows;
    P.box(c.mat, 0, ly, 0, W - 0.08, 0.03, D, col);
    if (k === rows) break;
    const slotH = (H - 0.09) / rows - 0.04;
    let x = -W / 2 + 0.07, j = 0;
    while (x < W / 2 - 0.1 && j < 14) {
      const u = u01(P.id, k * 17 + j), w = G.w[0] + u * (G.w[1] - G.w[0]), h = Math.min(slotH, G.h[0] + u01(P.id, 99 + k * 17 + j) * (G.h[1] - G.h[0]));
      if (x + w > W / 2 - 0.05) break;
      if (g === 'fabric') P.cyl(FLAT, x + w / 2, ly + 0.03, 0, w / 2, Math.min(slotH, 0.3), 8, pick(G.pal, P.id, k * 17 + j));
      else P.flat(x + w / 2, ly + 0.03, D * 0.05 * (u - 0.5), w, h, D * G.d * 0.8, pick(G.pal, P.id, k * 17 + j));
      x += w + 0.012; j++;
    }
  }
  if (g === 'cafe' || g === 'tienda') P.flat(0, H - 0.03 + 0.03, 0, W * 0.5, 0.06, 0.04, 0xf0efe8);        // price strip
};
S.crates = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], stack = H > 0.5 ? 3 : 1, ch = stack > 1 ? (H - 0.02) / 3 : H - 0.1;
  for (let k = 0; k < stack; k++) {
    const y = k * ch;
    P.box('wood_pine', 0, y, 0, W, ch, D, undefined, k ? undefined : NY);
    P.box('wood_dark', 0, y + ch * 0.45, D / 2 + 0.002, W - 0.04, 0.02, 0.004);
    if (c.fruit) {
      const top = k === stack - 1 || stack === 1;
      for (let j = 0; j < (top ? 9 : 5); j++) { const u = u01(P.id, k * 11 + j); P.sphere(c.fruit, -W * 0.34 + (j % 3) * W * 0.34, y + ch + 0.01, -D * 0.28 + Math.floor(j / 3) * D * 0.28, 0.065 + u * 0.01, 0.05, 0.065 + u * 0.01); }
    }
  }
};
S.fruitstand = (P, c) => {
  const { W, D } = P, H = c.size[1];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box('wood_pine', sx * (W / 2 - 0.04), 0, sz * (D / 2 - 0.04), 0.06, H * 0.7, 0.06, undefined, NY);
  for (let k = 0; k < 2; k++) {
    const y = 0.5 + k * 0.28, dd = D - k * 0.3;
    P.box('wood_pine', 0, y, k * -0.1, W, 0.04, dd);
    P.box('wood_pine', 0, y + 0.04, dd / 2 - 0.1 + k * -0.1, W, 0.08, 0.03);
    const fr = k ? ['food_mango', 'food_lulo', 'food_tomato'] : ['food_banana', 'food_tomato', 'food_veg'];
    for (let j = 0; j < 12; j++) { const u = u01(P.id, k * 20 + j); P.sphere(fr[j % 3], -W / 2 + 0.15 + (j % 6) * (W - 0.3) / 5, y + 0.1, -dd * 0.25 + Math.floor(j / 6) * dd * 0.45 - k * 0.1, 0.07 + u * 0.015, 0.055, 0.07); }
  }
  P.box('curtain_fabric', 0, H * 0.7, -D / 2 + 0.02, W, H * 0.3, 0.02, 0x2f9a58);                         // awning strip
};
S.chopblock = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.box('wood_pine', 0, 0, 0, W - 0.1, H - 0.2, D - 0.1, 0xb8905a, NY);
  P.box('wood_pine', 0, H - 0.2, 0, W, 0.2, D, 0xc8a070);
  P.box('metal_steel', 0.1, H, 0.05, 0.22, 0.02, 0.08); P.box('wood_dark', -0.04, H, 0.05, 0.12, 0.025, 0.03);
  P.flat(-0.2, H, -0.1, 0.2, 0.03, 0.14, 0xa8403c);
};
S.oven = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.box('metal_steel', 0, 0, 0, W, H - 0.4, D, undefined, NY);
  for (const k of [0, 1]) { P.box('metal_dark', 0, 0.15 + k * 0.7, D / 2 + 0.003, W - 0.2, 0.55, 0.006, 0x2a2a2c); P.box('metal_chrome', 0, 0.5 + k * 0.7, D / 2 + 0.02, W - 0.3, 0.03, 0.03); }
  P.box('metal_dark', 0, H - 0.4, 0, W - 0.1, 0.08, D - 0.1);
  P.box('metal_steel', 0.1, H - 0.32, -D / 4, 0.3, 0.32, 0.3);                                             // flue
  P.box('metal_dark', 0, H - 0.08, -D / 2 + 0.2, 0.24, 0.08, 0.24);
};
S.pipes = (P, c) => {
  const { W } = P;
  const cols = [0xe4e0d4, 0xb23a2a, 0xe4e0d4, 0x6a7a62, 0xe4e0d4, 0xd8a050];
  for (let i = 0; i < 6; i++) P.hcyl(FLAT, 0, 0.05 + Math.floor(i / 3) * 0.085, -0.1 + (i % 3) * 0.1, 0.045, W, 'x', 8, cols[i]);
};
S.sacks = (P, c) => {
  const { W, D } = P;
  for (let k = 0; k < 4; k++) P.box('cardboard', (k % 2 ? 0.02 : -0.02), k * 0.12, 0, W - 0.04 + (k % 2) * 0.04, 0.12, D - 0.08 + (k % 2) * 0.06, k % 2 ? 0xb8b4a8 : 0xa8a498, k ? undefined : NY, (k - 1.5) * 0.06);
  P.flat(0, 0.48, 0, 0.18, 0.003, 0.28, 0xd23a32, undefined, 0.1);
};
S.cans = (P, c) => {
  const cols = [0xd23a32, 0x2f6fbf, 0xe8c332, 0xf0efe8, 0x2f9a58];
  for (let k = 0; k < 3; k++) for (let i = 0; i < (k ? 1 : 3); i++) {
    const x = k ? 0 : (i - 1) * 0.12, z = k ? 0 : (i === 1 ? -0.06 : 0.04);
    P.cyl('metal_painted', x, k * 0.2, z, 0.1, 0.2, 10, cols[(k * 3 + i) % cols.length]);
    P.cyl('metal_chrome', x, k * 0.2 + 0.2, z, 0.095, 0.01, 10, undefined, undefined, true);
  }
};
S.pegboard = (P, c) => {
  const { W, H } = P;
  P.box('plywood', 0, 0, 0, W, H, 0.03, 0xb89660);
  for (let j = 0; j < 8; j++) { const u = u01(P.id, j); P.flat(-W / 2 + 0.1 + j * (W - 0.2) / 7, H * 0.2 + u * H * 0.5, 0.022, 0.03 + u * 0.03, 0.14 + u * 0.28, 0.018, pick([0x2a2a2c, 0xb23a2a, 0xc8ccd0, 0xe8c332, 0x6a4a2a], P.id, j)); }
};
S.wheelbarrow = (P, c) => {
  const { W, D } = P;
  P.box('metal_painted', 0, 0.2, 0.15, W, 0.2, 0.7, 0xd9a441, NY);
  P.box('metal_painted', 0, 0.2, 0.15, W - 0.08, 0.01, 0.62, 0x8a6a30);
  P.hcyl('rubber_black', 0, 0.16, 0.62, 0.16, 0.06, 'x', 10);
  for (const sx of [-1, 1]) { P.box('wood_pine', sx * 0.22, 0.28, -0.28, 0.04, 0.04, 0.9, undefined, undefined, sx * 0.08); P.box('metal_dark', sx * 0.2, 0, -0.1, 0.03, 0.26, 0.03, undefined, NY); }
};
S.cabin = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1], phone = r.name === 'phone_booth';
  if (phone) {
    for (const sx of [-1, 1]) P.box(c.mat, sx * (W / 2 - 0.02), 0, 0, 0.04, H, D, T ?? undefined, NY);
    P.box(c.mat, 0, 0, -D / 2 + 0.02, W, H, 0.04, T ?? undefined, NY);
    P.box(c.mat, 0, H - 0.04, 0, W, 0.04, D, T ?? undefined);
    P.flat(0, 1.1, -D / 2 + 0.05, 0.18, 0.22, 0.08, 0x8a2a24);
    P.flat(0, 0.9, -D / 2 + 0.05, 0.3, 0.025, 0.2, 0xd6d2c6);
    P.box(c.mat, 0, 0.42, 0.0, W - 0.1, 0.03, 0.2, T ?? undefined);
    return;
  }
  for (const sx of [-1, 1]) P.box(c.mat, sx * (W / 2 - 0.02), 0, 0, 0.04, H, D, T ?? undefined, NY);
  P.box(c.mat, 0, 0, -D / 2 + 0.02, W, H, 0.04, T ?? undefined, NY);
  P.box(c.mat, 0, 0.72, 0.0, W - 0.08, 0.04, D - 0.1, T ? mul(T, 0.85) : undefined);                         // desk
  P.flat(0, 0.76, -D / 2 + 0.2, 0.46, 0.32, 0.05, 0x24262a); P.box('tv_screen_a', 0, 0.8, -D / 2 + 0.226, 0.4, 0.26, 0.004);
  P.flat(0, 0.76, -D / 2 + 0.2, 0.08, 0.1, 0.06, 0x303236);
  P.flat(0, 0.76, 0.1, 0.38, 0.02, 0.14, 0xd6d2c6);
  P.flat(0, 0.45, -0.02, 0.4, 0.04, 0.4, 0x2a2a2c); P.flat(0, 0.0, -0.02, 0.05, 0.45, 0.05, 0x2a2a2c);       // stool
};
S.mannequin = (P, c, T, r) => {
  const H = c.size[1], col = T ?? pick([0xb7c9a0, 0xd9a0a8, 0x9db8d0, 0xe0c88a], P.id);
  P.cyl('wood_dark', 0, 0, 0, 0.17, 0.03, 10);
  P.cyl('metal_dark', 0, 0.03, 0, 0.012, H * 0.35, 6);
  P.cyl('fabric_sofa', 0, H * 0.36, 0, 0.14, H * 0.2, 10, col, 0.12);
  P.cyl('fabric_sofa', 0, H * 0.54, 0, 0.12, H * 0.2, 10, col, 0.17);
  P.cyl(FLAT, 0, H * 0.74, 0, 0.045, 0.06, 8, 0xe4d8c4);
  P.sphere(FLAT, 0, H * 0.82, 0, 0.065, 0.085, 0.065, 0xe4d8c4);
};
S.curtainCorner = (P, c, T) => {
  const { W, D } = P, H = c.size[1], col = T ?? 0xd9a0a8;
  P.box('metal_chrome', 0, H - 0.05, -D / 2 + 0.02, W, 0.02, 0.02); P.box('metal_chrome', W / 2 - 0.02, H - 0.05, 0, 0.02, 0.02, D);
  for (let i = 0; i < 5; i++) { P.box('curtain_fabric', -W / 2 + (i + 0.5) * W / 5, 0, -D / 2 + 0.02 + (i % 2) * 0.02, W / 5 - 0.01, H - 0.06, 0.02, i % 2 ? mul(col, 0.9) : col); }
  for (let i = 0; i < 5; i++) { P.box('curtain_fabric', W / 2 - 0.03 - (i % 2) * 0.02, 0, -D / 2 + (i + 0.5) * D / 5, 0.02, H - 0.06, D / 5 - 0.01, i % 2 ? mul(col, 0.9) : col); }
};
S.machine = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.box('metal_dark', 0, 0, 0, W * 0.8, 0.7, D * 0.8, 0x4a4e52, NY);
  P.box('metal_painted', 0, 0.7, -D * 0.1, W * 0.7, 0.18, D * 0.5, 0x2f5f9a);
  P.hcyl('metal_steel', 0, 0.9, 0.1, 0.12, 0.12, 'x', 12);
  P.box('metal_dark', 0, 0.78, D * 0.3, W * 0.5, 0.24, 0.03);
  P.flat(W * 0.3, 0.88, 0.1, 0.04, 0.04, 0.04, 0xd23a32);
};
S.motorbike = (P, c, T) => {
  const { W, D } = P, H = c.size[1], col = T ?? 0xb23a2a;
  for (const z of [-0.7, 0.72]) { P.hcyl('rubber_black', 0, 0.3, z, 0.3, 0.1, 'x', 12); P.hcyl('metal_steel', 0, 0.3, z, 0.1, 0.12, 'x', 8); }
  P.box('metal_dark', 0, 0.28, 0, 0.18, 0.2, 0.6, 0x3a3a3c);                                              // engine
  P.box('metal_painted', 0, 0.5, 0.08, 0.26, 0.2, 0.46, col);                                              // tank
  P.flat(0, 0.66, -0.2, 0.28, 0.08, 0.6, 0x1c1c1e);                                                         // seat
  P.box('metal_dark', 0, 0.3, 0.72, 0.05, 0.62, 0.05, undefined, undefined, 0);                              // fork
  P.box('metal_dark', 0, 0.9, 0.62, W - 0.1, 0.04, 0.04);                                                    // handlebar
  P.flat(0, 0.78, 0.7, 0.18, 0.14, 0.12, 0xe8c332);                                                          // lamp
  P.box('metal_chrome', 0.14, 0.2, -0.3, 0.06, 0.06, 0.55);                                                  // exhaust
};
S.tires = (P, c) => {
  for (let k = 0; k < 4; k++) { P.cyl('rubber_black', (k % 2) * 0.02, k * 0.19, (k % 2) * -0.02, 0.33, 0.19, 12); }
  P.cyl('metal_dark', 0, 0.76, 0, 0.17, 0.01, 10);
};

// ---- clinic and hall
S.examBed = (P, c, T, r) => {
  const { W, D } = P, H = c.size[1];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box('metal_chrome', sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05), 0.04, H - 0.14, 0.04, undefined, NY);
  P.box('metal_painted', 0, H - 0.2, 0, W - 0.06, 0.06, D - 0.06, 0xe8e8e4);
  P.box('vinyl_sofa', 0, H - 0.14, 0, W, 0.14, D, 0xe4ece8);
  P.box('vinyl_sofa', 0, H, -D / 2 + 0.2, W - 0.1, 0.1, 0.42, 0xd8e4e0, undefined);                         // raised head end
  P.flat(0, H, 0.15, W - 0.2, 0.004, D * 0.62, 0xf4f4f0);                                                   // paper roll sheet
  P.hcyl(FLAT, 0, H - 0.02, -D / 2 - 0.03, 0.05, W - 0.1, 'x', 8, 0xe8e8e4);
};
S.scale = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.box('metal_painted', 0, 0, 0, W, 0.06, D - 0.05, 0xd8d8d0, NY);
  P.box('metal_painted', 0, 0.06, -D / 2 + 0.06, 0.06, H - 0.06, 0.06, 0xd8d8d0);
  P.box('metal_dark', 0, H - 0.14, -D / 2 + 0.07, 0.18, 0.1, 0.06, 0x303236);
  P.box('metal_chrome', 0.1, 0.8, -D / 2 + 0.04, 0.02, 0.7, 0.02);
};
S.screen = (P, c, T) => {
  const { W, D } = P, H = c.size[1], col = T ?? 0xb7c9a0, n = 3, pw = W / n;
  for (let i = 0; i < n; i++) {
    const z = (i % 2 ? 0.05 : -0.05);
    P.box('metal_chrome', -W / 2 + (i + 0.5) * pw, 0.0, z, pw - 0.02, 0.04, 0.03, undefined, NY);
    P.box('curtain_fabric', -W / 2 + (i + 0.5) * pw, 0.1, z, pw - 0.04, H - 0.14, 0.02, col);
    P.box('metal_chrome', -W / 2 + (i + 0.5) * pw, H - 0.04, z, pw - 0.02, 0.04, 0.03);
  }
};
S.stand = (P, c) => {
  const H = c.size[1];
  for (let i = 0; i < 5; i++) P.box('metal_chrome', 0, 0.04, 0, 0.5, 0.025, 0.03, undefined, undefined, i * Math.PI / 5);
  P.cyl('metal_chrome', 0, 0.06, 0, 0.012, H - 0.06, 6);
  P.box('metal_chrome', 0, H - 0.02, 0, 0.3, 0.015, 0.015); P.flat(0, H - 0.4, 0.0, 0.1, 0.22, 0.04, 0xe8ecee);
};
S.wheelchair = (P, c) => {
  const { W, D } = P;
  for (const sx of [-1, 1]) { P.hcyl('rubber_black', sx * (W / 2 - 0.03), 0.3, -0.12, 0.3, 0.04, 'x', 12); P.hcyl('metal_steel', sx * (W / 2 - 0.03), 0.3, -0.12, 0.26, 0.012, 'x', 12); P.hcyl('metal_dark', sx * (W / 2 - 0.12), 0.1, 0.38, 0.1, 0.04, 'x', 8); P.box('metal_dark', sx * (W / 2 - 0.1), 0.42, -0.1, 0.03, 0.03, 0.4); }
  P.flat(0, 0.44, -0.08, W - 0.18, 0.05, 0.45, 0x24262a);
  P.flat(0, 0.46, -0.3, W - 0.18, 0.46, 0.05, 0x24262a);
  P.box('metal_dark', 0, 0.12, 0.34, W - 0.3, 0.03, 0.18);
};
S.frames = (P, c, T) => {
  const { W } = P;
  for (let i = 0; i < 2; i++) {
    const x = -W / 4 + i * W / 2, w = 0.12, h = 0.16 - i * 0.03;
    P.box('wood_dark', x, 0, 0, w, h, 0.02, 0x5a3a24); P.flat(x, 0.012, 0.011, w - 0.03, h - 0.025, 0.004, pick([0xc8b898, 0xa89878, 0x98a8b0], P.id, i));
  }
};

// ---- clutter
S.broom = (P, c, T, r) => {
  const H = c.size[1];
  if (r.name === 'mop_bucket') {
    P.cyl(FLAT, 0, 0, 0, 0.14, 0.28, 10, T ?? 0xe8c332, 0.17);
    P.box('wood_pine', 0.06, 0.2, -0.04, 0.025, H - 0.2, 0.025, undefined, undefined, 0);
    P.flat(0.06, 0.28, -0.04, 0.1, 0.1, 0.1, 0xe8e4da);
    return;
  }
  P.box('wood_pine', 0, 0.2, 0, 0.025, H - 0.2, 0.025);
  P.box('wood_old', 0, 0, 0, 0.26, 0.22, 0.04, 0xc8a050);
  P.box('metal_dark', 0, 0.2, 0, 0.1, 0.03, 0.045);
};
S.smallbox = (P, c, T, r) => {
  const n = r.name, { W, D } = P, H = c.size[1];
  switch (n) {
    case 'shower_head_electric': P.flat(0, 0, 0, W, H * 0.4, D, 0xf0eee6); P.cyl(FLAT, 0, H * 0.4, 0, 0.03, H * 0.3, 8, 0xd0d0d0); P.cyl('metal_chrome', 0, H * 0.68, 0.0, 0.07, 0.04, 10, undefined, 0.09); P.box('metal_dark', 0.05, H * 0.2, D / 2, 0.04, 0.04, 0.01); break;
    case 'phone_landline': P.flat(0, 0, 0, W, 0.05, D, 0x8a2a24); P.flat(0, 0.05, -0.02, W - 0.02, 0.035, 0.06, 0x8a2a24); P.cyl(FLAT, 0, 0.05, 0.05, 0.05, 0.012, 10, 0xd6d2c6); break;
    case 'sewing_machine': P.flat(0, 0, 0, W, 0.04, D, 0x24262a); P.flat(-W * 0.2, 0.04, 0, W * 0.5, H - 0.1, D * 0.6, 0x24262a); P.flat(0, H - 0.08, 0, W * 0.75, 0.08, D * 0.5, 0x24262a); P.cyl('metal_chrome', W * 0.3, 0.04, 0, 0.012, H * 0.5, 6); P.cyl('metal_chrome', -W * 0.3, H - 0.02, 0, 0.05, 0.02, 8); break;
    case 'printer': P.flat(0, 0, 0, W, H * 0.7, D, 0xd6d2c6); P.flat(0, H * 0.7, -D * 0.1, W * 0.7, H * 0.3, D * 0.6, 0xc8c4b8); P.flat(0, H * 0.45, D / 2 + 0.003, W * 0.6, 0.02, 0.004, 0x303236); P.flat(0, H * 0.7, D * 0.25, W * 0.6, 0.003, D * 0.4, 0xf4f4f0); break;
    case 'candles_set': for (let i = 0; i < 3; i++) { P.flat(-0.06 + i * 0.06, 0, (i % 2) * 0.02, 0.035, 0.12 + i * 0.03, 0.035, 0xf2ead2); P.flat(-0.06 + i * 0.06, 0.13 + i * 0.03, (i % 2) * 0.02, 0.012, 0.03, 0.012, 0xffc060); } break;
    case 'dish_rack': P.box('metal_steel', 0, 0, 0, W, 0.03, D); for (let i = 0; i < 5; i++) { P.flat(-W / 2 + 0.08 + i * (W - 0.16) / 4, 0.03, 0, 0.012, 0.22, D * 0.75, pick([0xf0efe8, 0x2f6fbf, 0xe8e0cc], P.id, i)); } P.box('metal_steel', 0, 0.24, D / 2 - 0.02, W, 0.015, 0.015); break;
    case 'bottles_group': for (let i = 0; i < 4; i++) { const col = pick([0x6a8f5a, 0x8a5a2a, 0xe4e0d4, 0x2f6fbf], P.id, i); P.cyl(FLAT, -0.1 + (i % 2) * 0.1 + (i > 1 ? 0.05 : 0), 0, (i > 1 ? -0.04 : 0.03), 0.04, 0.2, 8, col); P.cyl(FLAT, -0.1 + (i % 2) * 0.1 + (i > 1 ? 0.05 : 0), 0.2, (i > 1 ? -0.04 : 0.03), 0.018, 0.08, 6, col); } break;
    case 'books_stack': for (let i = 0; i < 4; i++) P.flat(0.0, i * 0.05, 0, W - i * 0.012, 0.05, D - i * 0.008, pick([0x8a3a2a, 0x2f4a6a, 0x3a5a3a, 0xc8a040, 0x5a3a52], P.id, i), undefined, (i - 1.5) * 0.12); break;
    case 'knickknacks': for (let i = 0; i < 5; i++) { const u = u01(P.id, i); P.flat(-W / 2 + 0.06 + i * (W - 0.12) / 4, 0, 0, 0.05 + u * 0.06, 0.06 + u * 0.14, 0.06, pick([0xe4dccb, 0xb5603a, 0x6a8f5a, 0xd4a830, 0x7a8a9a, 0xc23a30], P.id, i)); } break;
    case 'trophy_football': P.flat(0, 0, 0, 0.12, 0.04, 0.12, 0x2a2a2c); P.cyl(FLAT, 0, 0.04, 0, 0.012, 0.08, 6, 0xd4a830); P.cyl(FLAT, 0, 0.12, 0, 0.05, 0.1, 10, 0xd4a830, 0.07); break;
    case 'toy_pile': for (let i = 0; i < 6; i++) { const u = u01(P.id, i); P.flat(-0.18 + u * 0.36, 0, -0.18 + u01(P.id, 9 + i) * 0.36, 0.08 + u * 0.06, 0.07, 0.08 + u * 0.05, pick([0xd23a32, 0x2f6fbf, 0xe8c332, 0x2f9a58, 0xd9a0a8], P.id, i), undefined, u * 3); } break;
    case 'doll': P.flat(0, 0.0, 0, 0.1, 0.17, 0.06, pick([0xd23a32, 0x2f6fbf, 0xd9a0a8], P.id)); P.sphere(FLAT, 0, 0.26, 0, 0.055, 0.06, 0.055, 0xe9c9a0); P.flat(0, 0.2, 0, 0.14, 0.03, 0.04, 0xe9c9a0); break;
    case 'shoes_pair': for (const sx of [-1, 1]) { P.flat(sx * 0.07, 0, 0, 0.1, 0.07, 0.27, 0x2a2a2c, undefined, sx * 0.1); P.flat(sx * 0.07, 0.07, -0.06, 0.09, 0.05, 0.12, 0x2a2a2c); } break;
    case 'school_bag': P.flat(0, 0, 0, W, H, D, NAMECOL.school_bag); P.flat(0, 0.03, D / 2 + 0.005, W - 0.08, H * 0.4, 0.015, mul(NAMECOL.school_bag, 1.25)); P.flat(0, H * 0.7, D / 2 + 0.003, 0.14, 0.04, 0.006, 0xe8c332); break;
    case 'box_cardboard_s': case 'box_cardboard_m': case 'box_cardboard_l':
      P.box('cardboard', 0, 0, 0, W, H, D, undefined, NY); P.flat(0, H - 0.004, 0, 0.05, 0.006, D - 0.02, 0xc8a878); P.flat(0, H * 0.5, D / 2 + 0.002, W * 0.3, 0.05, 0.003, 0x2a2a2c); break;
    case 'pet_bed': P.cyl('fabric_sofa', 0, 0, 0, Math.min(W, D) / 2, H, 12, T ?? 0x9a8a72, Math.min(W, D) / 2 * 0.95); P.cyl('fabric_sofa', 0, H - 0.02, 0, Math.min(W, D) / 2 * 0.72, 0.03, 12, T ? mul(T, 0.8) : 0x7a6a52, undefined, true); break;
    default: P.box(c.mat, 0, 0, 0, W, H, D, T ?? undefined, NY);
  }
};
S.ball = (P, c) => {
  P.sphere(FLAT, 0, 0.11, 0, 0.11, 0.11, 0.11, NAMECOL.football, 10);
  P.sphere(FLAT, 0.05, 0.14, 0.09, 0.03, 0.03, 0.01, 0x15171b, 6);
};
S.cage = (P, c) => {
  const { W, D } = P, H = c.size[1];
  P.cyl('metal_chrome', 0, 0, 0, W * 0.5, 0.03, 12);
  for (let i = 0; i < 10; i++) { const a = i * Math.PI * 2 / 10; P.box('metal_chrome', Math.cos(a) * W * 0.46, 0.03, Math.sin(a) * W * 0.46, 0.006, H * 0.62, 0.006); }
  P.cyl('metal_chrome', 0, H * 0.65, 0, W * 0.5, H * 0.18, 12, undefined, 0.02);
  P.box('metal_chrome', 0, H * 0.84, 0, 0.012, H * 0.16, 0.012);
  P.box('wood_pine', 0, H * 0.32, 0, W * 0.8, 0.012, 0.012);
  P.sphere('feather_canary', -0.03, H * 0.32 + 0.04, 0, 0.035, 0.035, 0.03);
  P.sphere('feather_canary', 0.0, H * 0.32 + 0.06, 0, 0.022, 0.022, 0.022);
};
S.cat = (P, c) => {
  const col = pick([0x2a2a2c, 0xc8a070, 0x8a8a88, 0xd8d0c0], P.id);
  P.sphere('fur_cat', 0, 0.12, -0.04, 0.09, 0.12, 0.1, col);
  P.sphere('fur_cat', 0, 0.26, 0.04, 0.06, 0.055, 0.055, col);
  P.box('fur_cat', -0.035, 0.31, 0.04, 0.025, 0.035, 0.015, col); P.box('fur_cat', 0.035, 0.31, 0.04, 0.025, 0.035, 0.015, col);
  P.box('fur_cat', 0.09, 0.01, -0.12, 0.2, 0.03, 0.03, col, undefined, 0.5);
};
S.dog = (P, c) => {
  const col = pick([0xc8a070, 0x6b4226, 0x2a2a2c, 0xd8d0c0], P.id);
  P.sphere('fur_dog', 0, 0.12, 0, 0.3, 0.12, 0.17, col);
  P.sphere('fur_dog', 0.3, 0.09, 0.05, 0.1, 0.075, 0.08, col);
  P.box('fur_dog', 0.34, 0.07, 0.12, 0.05, 0.05, 0.03, mul(col, 0.7));
  P.box('fur_dog', -0.32, 0.03, -0.1, 0.16, 0.05, 0.05, col, undefined, 0.3);
};
S.guitar = (P, c, T) => {
  const col = T ?? 0xa87445;
  P.sphere('wood_pine', 0, 0.2, 0, 0.17, 0.22, 0.045, col, 10);
  P.sphere('wood_pine', 0, 0.42, 0, 0.13, 0.15, 0.045, col, 10);
  P.sphere(FLAT, 0, 0.3, 0.04, 0.045, 0.045, 0.01, 0x15171b, 8);
  P.box('wood_dark', 0, 0.45, 0, 0.045, 0.5, 0.025, 0x3a2a1c);
  P.box('wood_dark', 0, 0.94, 0, 0.07, 0.1, 0.03, 0x3a2a1c);
};
S.loft = (P, c, T) => {
  const { W, D } = P, H = c.size[1], col = T ?? undefined;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(c.mat, sx * (W / 2 - 0.03), 0, sz * (D / 2 - 0.03), 0.06, H, 0.06, col, NY);
  P.box(c.mat, 0, 0.5, 0, W, 0.04, D, col);                                         // floor of the loft
  P.box(c.mat, 0, H - 0.1, 0, W + 0.1, 0.06, D + 0.1, col);                          // roof
  P.box(c.mat, 0, 0.54, -D / 2 + 0.02, W, H - 0.64, 0.03, col);                       // back
  for (let i = 0; i < 9; i++) P.box('metal_chrome', -W / 2 + 0.06 + i * (W - 0.12) / 8, 0.54, D / 2 - 0.03, 0.01, H - 0.64, 0.01);
  for (let i = 0; i < 3; i++) { P.box('wood_pine', -W / 2 + 0.25 + i * 0.35, 0.8, 0, 0.3, 0.02, 0.03); P.sphere('feather_pigeon', -W / 2 + 0.25 + i * 0.35, 0.89, 0, 0.07, 0.07, 0.05); }
};
S.rug = (P, c, T, r) => {
  const { W, D } = P, col = pick([0xb23a2a, 0x2f5f9a, 0x6a7a62, 0xd4a830, 0x8a3a52, 0x4a7a8a], P.id);
  P.box('rug_woven', 0, 0, 0, W, 0.012, D, mul(col, 0.8), NY);
  if (r.name !== 'doormat') P.box('rug_woven', 0, 0.012, 0, W - 0.14, 0.004, D - 0.14, mix(col, 0xf0e8d8, 0.45), NY);
};
S.curtain = (P, c, T) => {
  const { W, H } = P, col = T ?? 0xd9a0a8, n = 8;
  P.box('metal_chrome', 0, H, 0, W + 0.1, 0.02, 0.03);
  for (let i = 0; i < n; i++) P.box('curtain_fabric', -W / 2 + (i + 0.5) * W / n, 0, (i % 2) * 0.012 - 0.01, W / n - 0.005, H - 0.02, 0.02, i % 2 ? mul(col, 0.88) : col);
};
S.decal = (P, c, T, r) => {
  const d = DECALS[c.decal] ?? { frame: null, kind: 'poster' }, { W, H } = P;
  const kind = d.kind, id = c.decal;
  const PAPER = { religion: 0xe8dcc0, photo: 0xb8a888, art: 0xa8b8a0, kids: 0xf0e0b0, poster: 0xd8503a, calendar: 0xf0ecd8, document: 0xf0ecd8, notes: 0xf0ecd8, notice: 0xf0ecd8, shop: 0xf0e4c8, school: 0xf0ecd8, clinic: 0xe8f0f0 };
  let col = PAPER[kind] ?? 0xe8e0d0;
  if (id === 'chalkboard') col = 0x2f4a3c; else if (id === 'menu_board') col = 0x2a2a28; else if (id === 'poster_music') col = 0x6a3a8a; else if (id === 'poster_football_b') col = 0x2f6fbf; else if (id === 'poster_football_c') col = 0x2f9a58; else if (id === 'poster_map') col = 0xc8d8c0;
  if (d.frame != null) { P.box(FLAT, 0, 0, 0, W + 0.04, H + 0.04, 0.014, d.frame, ['ny']); P.box(FLAT, 0, 0.02, 0.008, W, H, 0.006, col); }
  else P.box(FLAT, 0, 0, 0, W, H, 0.01, col);
  const z = d.frame != null ? 0.013 : 0.007;
  if (id === 'flag_co') { P.flat(0, H * 0.5, z, W, H * 0.5, 0.004, 0xf2c830); P.flat(0, H * 0.25, z, W, H * 0.25, 0.004, 0x1d4f9a); P.flat(0, 0, z, W, H * 0.25, 0.004, 0xc8302a); }
  else if (kind === 'photo') { P.flat(0, H * 0.18, z, W * 0.7, H * 0.64, 0.004, 0x887860); P.flat(-W * 0.12, H * 0.25, z + 0.003, W * 0.14, H * 0.5, 0.003, 0x4a3a2a); P.flat(W * 0.12, H * 0.25, z + 0.003, W * 0.14, H * 0.46, 0.003, 0x6a4a3a); }
  else if (kind === 'art') { P.flat(0, H * 0.1, z, W * 0.84, H * 0.5, 0.004, 0x88b0d0); P.flat(0, H * 0.1, z + 0.002, W * 0.84, H * 0.22, 0.004, 0x5a8a48); }
  else if (kind === 'religion') { P.flat(0, H * 0.12, z, W * 0.6, H * 0.76, 0.004, 0x4a68a0); P.flat(0, H * 0.45, z + 0.002, W * 0.22, H * 0.28, 0.003, 0xe8c8a0); }
  else if (kind === 'poster') { P.flat(0, H * 0.1, z, W * 0.8, H * 0.5, 0.004, pick([0xf2c830, 0xffffff, 0x1d4f9a, 0x2a2a2c], id)); P.flat(0, H * 0.7, z, W * 0.6, H * 0.12, 0.004, 0xf0efe8); }
  else if (kind === 'calendar') { P.flat(0, H * 0.5, z, W * 0.84, H * 0.44, 0.004, pick([0x7aa7d9, 0x6fae8f, 0xd9a441], id)); P.flat(0, H * 0.06, z, W * 0.7, H * 0.34, 0.004, 0xe8e4d8); }
  else if (kind === 'kids') { P.flat(-W * 0.15, H * 0.3, z, W * 0.3, H * 0.3, 0.004, 0xd23a32); P.flat(W * 0.2, H * 0.5, z, W * 0.22, H * 0.25, 0.004, 0x2f9a58); }
  else if (kind === 'shop' || kind === 'school' || kind === 'clinic' || kind === 'notice' || kind === 'notes' || kind === 'document') { for (let i = 0; i < 4; i++) P.flat(0, H * (0.15 + i * 0.19), z, W * (0.8 - (i % 2) * 0.2), H * 0.06, 0.003, id === 'chalkboard' || id === 'menu_board' ? 0xe8e8e0 : 0x3a3a3c); }
};

// ---- entry
const generic = (P, c, T) => { P.box(c.mat ?? FLAT, 0, 0, 0, P.W, P.H, P.D, T ?? undefined, c.wall || c.ceil ? undefined : NY); };

// The palettes were written for NEUTRAL textures; dark or strongly coloured library textures (wood, vinyl) would turn near-black when multiplied
// by a dark tint, so those are lifted towards white first.
const LIFT = { wood_dark: 0.62, wood_pine: 0.3, wood_old: 0.3, melamine_wood: 0.3, vinyl_sofa: 0.4, fabric_sofa: 0.2 };
export const tintFor = (c, t) => (t == null ? null : LIFT[c.mat] ? mix(t, 0xffffff, LIFT[c.mat]) : t);

/** Draw one furniture record as stand-in boxes. `c` = catalogue/decal definition. Returns the number of primitives drawn. */
export function drawStandin(b, rec, c) {
  const P = new Pen(b, rec, c);
  (STANDINS[c.arch] ?? generic)(P, c, tintFor(c, rec.tint), rec);
  return P.n;
}
