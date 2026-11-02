// INTERIORS (A3): the generic close-up of a find (R2b-004: "44 of 64 find types have no close-up model: a fancy watch, 8 of 9 jewels, two of the knickers, the banknote nearest spawn"). The library
// (assets/models/inspect, inspect.js) has 24 models bound to 20 finds; every other find was found, toasted and glinted but never held up. This file draws the rest in code, from the find's own
// record (finds.js `shape`, `tint`, `size`), so no asset is added and no binding changes (BINDINGS stays exact: a find the library draws is held as the library's model, whenever that has loaded).
//
//   genericModel({ id, shape, tint, size }) -> { parts: [{ geometry, matKey }], size: [w, h, d] } | null
//
// Same contract as a library model (inspectParts): metres, +Y up, +Z the front it is held facing the eyes with, centred on its box, parts keyed by a material of the game's own library
// (matdefs.js `inspect_*`; a `#rrggbb` after the name is the matlib's tinted variant), and the geometry carries the white vertex colour those materials ask for. The LONGEST side is `size`.
// Pure (THREE only, no DOM, no ctx, no random: a find looks the same every time), and the geometry is the caller's to dispose (holdup.js does when it is put back).
//   * FAMILY   one builder per word of finds.js FIND_SHAPES (coin, watch, ring, deed, box ...): what a find of that shape looks like when nothing more is known, tinted by the find's colour.
//   * VARIANT  a builder of its own for a find whose family word is only the nearest of twenty (a nugget, a pair of booties, a cassette and a pair of glasses are all `box` in finds.js; a lock of hair,
//              a wig and a moustache are all `roll`): keyed by the find's id, so the family stays the default for a find nobody has drawn yet.
// tests/interiors-generic.test.mjs: every shape word has a family, every variant key is a real find, every find of finds.js builds, and the hold-up opens for all of them.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2, HALF = Math.PI / 2;

// ------------------------------------------------------------------ materials: the library's own (matdefs.js), a tint after '#'
const MAT = { gold: 'inspect_gold', brass: 'inspect_brass', silver: 'inspect_silver', ink: 'inspect_ink', enamel: 'inspect_enamel', leather: 'inspect_leather', cloth: 'inspect_cloth', ribbon: 'inspect_ribbon', gem: 'inspect_gem', dark: 'inspect_dark' };
const mk = (name, c) => (c == null ? name : `${name}#${(c & 0xffffff).toString(16).padStart(6, '0')}`);
const shade = (c, k) => { const f = (s) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k))); return (f(16) << 16) | (f(8) << 8) | f(0); };
const paper = (c) => mk(MAT.cloth, c);
/** The metal a tint asks for: bright yellow is the library's gold, a grey is silver, anything else is brass in that colour (a bronze coin, an old key). */
function metalOf(tint) {
  const r = (tint >> 16) & 255, g = (tint >> 8) & 255, b = tint & 255, hi = Math.max(r, g, b), sat = hi ? (hi - Math.min(r, g, b)) / hi : 0;
  if (sat < 0.2) return hi > 0x90 ? MAT.silver : mk(MAT.dark, tint);
  return sat > 0.55 && hi > 170 && r >= g && g > b ? MAT.gold : mk(MAT.brass, tint);
}

// ------------------------------------------------------------------ a deterministic stream (no Math.random: a find is the same every time it is held)
const seedOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ------------------------------------------------------------------ shapes (all in the model's frame; `disc`, `loop` and `cut` face +Z, `post` stands along Y)
const disc = (r, t, n = 36) => new THREE.CylinderGeometry(r, r, t, n).rotateX(HALF);
const post = (rt, rb, h, n = 20) => new THREE.CylinderGeometry(rt, rb, h, n);
const ball = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const slab = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const loop = (R, r, arc = TAU, n = 36, rn = 10) => new THREE.TorusGeometry(R, r, rn, n, arc);
const cut = (shape, depth, bevel = 0, curve = 6) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curve }).translate(0, 0, -depth / 2);
const wire = (pts, r, n = 40, rn = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z = 0]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.5), n, r, rn, false);
const flat = (g) => { const f = g.toNonIndexed(); f.computeVertexNormals(); return f; };
const rrect = (w, h, r) => {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
};
const heart = () => { const s = new THREE.Shape(); s.moveTo(0, -0.5); s.bezierCurveTo(-0.62, -0.08, -0.34, 0.5, 0, 0.16); s.bezierCurveTo(0.34, 0.5, 0.62, -0.08, 0, -0.5); return s; };
/** `n` points at equal steps of arc length along a polyline: [{ x, y, a }] (a = the direction of the line there). */
function along(pts, n) {
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = []; let j = 1;
  for (let i = 0; i < n; i++) {
    const s = ((i + 0.5) / n) * L[L.length - 1];
    while (j < pts.length - 1 && L[j] < s) j++;
    const t = (s - L[j - 1]) / (L[j] - L[j - 1] || 1), [x0, y0] = pts[j - 1], [x1, y1] = pts[j];
    out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, a: Math.atan2(y1 - y0, x1 - x0) });
  }
  return out;
}
const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
/** Move a geometry: `x y z` (position), `rx ry rz` (radians, applied about Z first, then Y, then X), `s` or `sx sy sz` (scale, applied first). */
function xf(g, t) {
  if (!t) return g;
  const sc = t.s ?? 1;
  _m.compose(_p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0), _q.setFromEuler(_e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0)), _s.set(t.sx ?? sc, t.sy ?? sc, t.sz ?? sc));
  return g.applyMatrix4(_m);
}

/** What a builder draws into: geometries grouped by material, merged and normalised to the find's size by `finish`. */
class Kit {
  constructor() { this.bins = new Map(); this.base = null; }
  add(geo, key, t) {
    xf(geo, t); if (this.base) xf(geo, this.base);
    let l = this.bins.get(key); if (!l) this.bins.set(key, l = []);
    l.push(geo.index ? geo.toNonIndexed() : geo);
    return this;
  }
  /** Everything `fn` adds is moved by `base` too (a bootie, a tooth in a box). */
  with(base, fn) { const old = this.base; this.base = base; fn(); this.base = old; return this; }
  finish(size) {
    const parts = [], box = new THREE.Box3();
    for (const [matKey, list] of this.bins) {
      const geometry = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!geometry) continue;
      geometry.computeBoundingBox(); box.union(geometry.boundingBox);
      parts.push({ geometry, matKey });
    }
    if (!parts.length || box.isEmpty()) return null;
    const dim = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), k = size / Math.max(dim.x, dim.y, dim.z, 1e-9);
    for (const { geometry: g } of parts) {
      g.translate(-c.x, -c.y, -c.z); g.scale(k, k, k);
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));   // (the library's materials are vertex-coloured: white = the material's own colour)
      g.computeBoundingBox(); g.computeBoundingSphere();
    }
    return { parts, size: [dim.x * k, dim.y * k, dim.z * k] };
  }
}

// ------------------------------------------------------------------ small things that more than one find uses
/** Seven-segment digits (the lottery number, the watch's display, the year on a spanner). */
const DIGITS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
function seg7(k, d, cx, cy, h, key, z) {
  const w = h * 0.52, t = h * 0.15, v = h * 0.42, hw = w * 0.82;
  const at = { a: [0, h / 2 - t / 2, hw, t], g: [0, 0, hw, t], d: [0, -h / 2 + t / 2, hw, t], b: [w / 2 - t / 2, h / 4, t, v], c: [w / 2 - t / 2, -h / 4, t, v], e: [-w / 2 + t / 2, -h / 4, t, v], f: [-w / 2 + t / 2, h / 4, t, v] };
  for (const s of DIGITS[d]) { const [x, y, sw, sh] = at[s]; k.add(slab(sw, sh, 0.004), key, { x: cx + x, y: cy + y, z }); }
}
/** Lines of handwriting or print: left edge `x`, first line at `y`, each a little shorter or longer than `w`. */
function lines(k, x, y, w, n, step, R, key, z, h = 0.014) {
  for (let i = 0; i < n; i++) { const l = w * (0.55 + 0.45 * R()); k.add(slab(l, h, 0.004), key, { x: x + l / 2, y: y - i * step, z }); }
}
/** A cut stone facing +Z (a table, `crown` = the radii of its steps as shares of the girdle, an eight-sided pavilion behind): flat-shaded so its facets catch the light as it turns. */
function gem(k, key, R, t = {}, crown = [1, 0.6]) {
  const h = (0.3 * R) / (crown.length - 1);
  for (let i = 0; i < crown.length - 1; i++) k.add(flat(post(R * crown[i + 1], R * crown[i], h, 8).rotateY(Math.PI / 8).rotateX(HALF).translate(0, 0, h * (i + 0.5))), key, t);
  k.add(flat(post(R, 0.001, R * 0.75, 8).rotateY(Math.PI / 8).rotateX(HALF).translate(0, 0, -R * 0.375)), key, t);
}
/** The face of a watch or a clock: the dial, twelve marks, an hour and a minute hand at ten past ten and the pin. */
function dial(k, R, z, hands, face) {
  k.add(disc(R, 0.006, 40), face, { z });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, big = i % 3 === 0; k.add(slab(big ? 0.016 : 0.01, big ? 0.04 : 0.022, 0.006), MAT.ink, { x: Math.sin(a) * R * 0.8, y: Math.cos(a) * R * 0.8, rz: -a, z: z + 0.004 }); }
  for (const [a, len, w] of [[-1.05, R * 0.5, 0.02], [1.05, R * 0.78, 0.014]]) k.add(slab(w, len, 0.006), hands, { x: Math.sin(a) * len / 2, y: Math.cos(a) * len / 2, rz: -a, z: z + 0.009 });
  k.add(disc(R * 0.07, 0.014, 12), hands, { z: z + 0.01 });
}
/** The strap of a wristwatch: `n` links above and below the case, each a little further back so the strap curves away. */
function strap(k, key, { w, len, pitch, bend, n }) {
  for (const s of [1, -1]) for (let i = 0; i < n; i++) k.add(slab(w, pitch * 0.86, len), key, { y: s * (0.25 + pitch * i), z: -bend * i * i, rx: s * Math.atan2(-2 * bend * i, pitch) });
}

// ------------------------------------------------------------------ coins
function coin(k, tint) {
  const m = metalOf(tint), R = 0.5;
  k.add(disc(R, 0.085, 56), m);
  for (const s of [1, -1]) {
    k.add(loop(R - 0.025, 0.03, TAU, 56, 8), m, { z: s * 0.0425 });                                  // the raised rim
    k.add(disc(R * 0.66, 0.01, 44), m, { z: s * 0.047 });                                            // the field of the device
    k.add(loop(R * 0.66, 0.01, TAU, 44, 6), m, { z: s * 0.05 });
    for (let i = 0; i < 5; i++) k.add(slab(0.36, 0.034, 0.012), m, { z: s * 0.054, rz: (i / 5) * Math.PI });       // a sunburst
  }
}
/** `moneda_chocolate`: a foil-wrapped chocolate coin with a bite out of it (the foil is bitten back further than the chocolate under it). */
function chocolateCoin(k, tint) {
  const R = 0.5, foil = metalOf(tint), choc = mk(MAT.leather, 0x4a2a1c);
  const outline = (r, bites) => {
    const s = new THREE.Shape(), n = 72;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU; let rr = r;
      for (const [b, w, d] of bites) { const da = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))); if (da < w) rr -= d * Math.cos((da / w) * HALF); }
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) s.lineTo(x, y); else s.moveTo(x, y);
    }
    s.closePath(); return s;
  };
  k.add(cut(outline(R * 0.97, [[0.75, 0.5, 0.1], [0.3, 0.22, 0.06]]), 0.075, 0.008), choc);
  for (const s of [1, -1]) {
    k.add(cut(outline(R, [[0.75, 0.62, 0.14], [0.3, 0.3, 0.1]]), 0.016, 0.006), foil, { z: s * 0.0475 });
    k.add(loop(R * 0.62, 0.011, TAU, 44, 6), foil, { z: s * 0.058 });
    for (let i = 0; i < 5; i++) k.add(slab(0.34, 0.03, 0.01), foil, { z: s * 0.059, rz: (i / 5) * Math.PI });
  }
}

// ------------------------------------------------------------------ watches and clocks
function watch(k, tint) {
  const m = metalOf(tint), R = 0.2;
  k.add(disc(R, 0.09, 40), m);
  k.add(loop(R, 0.016, TAU, 40, 8), m, { z: 0.045 });
  dial(k, R - 0.018, 0.045, m, mk(MAT.enamel, 0xf1ead8));
  k.add(slab(0.05, 0.034, 0.005), MAT.ink, { x: 0.1, z: 0.05 }); k.add(slab(0.042, 0.026, 0.006), mk(MAT.enamel, 0xfaf6ea), { x: 0.1, z: 0.0505 });       // the date window
  k.add(post(0.02, 0.02, 0.05, 12), m, { x: R + 0.02, rz: HALF });                                    // the crown
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.add(slab(0.05, 0.06, 0.04), m, { x: sx * 0.105, y: sy * 0.215 });       // the lugs
  strap(k, m, { w: 0.2, len: 0.026, pitch: 0.047, bend: 0.004, n: 6 });
}
/** `reloj_digital`: a plastic watch with a grey-green display, its numbers and three buttons. */
function digitalWatch(k, tint) {
  const body = mk(MAT.dark, tint), lcd = mk(MAT.enamel, 0xb4c0a4);
  k.add(cut(rrect(0.36, 0.4, 0.06), 0.08, 0.012), body);
  k.add(cut(rrect(0.29, 0.18, 0.02), 0.006), mk(MAT.dark, 0x15181c), { y: 0.03, z: 0.046 });
  k.add(slab(0.25, 0.14, 0.006), lcd, { y: 0.03, z: 0.05 });
  [1, 2, 3, 0].forEach((d, i) => seg7(k, d, [-0.088, -0.034, 0.04, 0.094][i], 0.03, 0.1, MAT.ink, 0.054));
  for (const dy of [0.014, -0.014]) k.add(slab(0.012, 0.012, 0.004), MAT.ink, { x: 0.003, y: 0.03 + dy, z: 0.054 });
  k.add(slab(0.2, 0.016, 0.004), mk(MAT.enamel, 0xcfd4d0), { y: -0.11, z: 0.047 });
  for (const [x, y] of [[0.19, 0.1], [0.19, -0.1], [-0.19, 0]]) k.add(slab(0.03, 0.07, 0.05), MAT.silver, { x, y });
  strap(k, body, { w: 0.2, len: 0.022, pitch: 0.05, bend: 0.0045, n: 6 });
}
function pocketwatch(k, tint) {
  const m = metalOf(tint), R = 0.38;
  k.add(disc(R, 0.15, 44), m);
  k.add(loop(R, 0.026, TAU, 44, 8), m, { z: 0.075 });
  dial(k, R - 0.034, 0.075, m, mk(MAT.enamel, 0xf4f0e0));
  k.add(post(0.05, 0.05, 0.06, 14), m, { y: R + 0.03 });                                              // the crown
  k.add(loop(0.085, 0.017, TAU, 28, 7), m, { y: R + 0.1 });                                           // the bow
}
/** `despertador`: a twin-bell alarm clock on two feet, its hammer between the bells. */
function alarm(k, tint) {
  const body = mk(MAT.enamel, tint), chrome = MAT.silver;
  k.add(disc(0.4, 0.3, 44), body);
  k.add(loop(0.4, 0.03, TAU, 44, 8), chrome, { z: 0.15 });
  dial(k, 0.345, 0.15, MAT.ink, mk(MAT.enamel, 0xf4f0e0));
  k.add(disc(0.05, 0.02, 14), mk(MAT.gold), { z: 0.17, x: 0, y: -0.16 });
  for (const s of [-1, 1]) {
    k.add(new THREE.SphereGeometry(0.15, 20, 10, 0, TAU, 0, HALF), chrome, { x: s * 0.26, y: 0.4, rz: -s * 0.5 });          // a bell
    k.add(post(0.03, 0.045, 0.14, 12), chrome, { x: s * 0.24, y: -0.45, rz: s * 0.45 });                                    // a foot
  }
  k.add(post(0.02, 0.02, 0.1, 10), chrome, { y: 0.45 }); k.add(post(0.012, 0.012, 0.15, 8), chrome, { y: 0.55 }); k.add(ball(0.03, 10, 8), chrome, { y: 0.63 });
  k.add(post(0.025, 0.025, 0.06, 10), chrome, { x: 0, y: 0.43, z: -0.02 });
}

// ------------------------------------------------------------------ rings and jewellery
function ring(k, tint) {
  const m = metalOf(tint);
  k.add(loop(0.37, 0.065, TAU, 48, 12), m, { sz: 1.5 });
  gem(k, mk(MAT.gem, 0xeaf4ff), 0.11, { y: 0.47, rx: -HALF });                                     // the stone's table faces away from the finger: up, as the ring is seen
  for (const [x, z] of [[-0.09, 0], [0.09, 0], [0, 0.07], [0, -0.07]]) k.add(ball(0.016, 8, 6), m, { x, y: 0.47, z });
}
/** `argolla`: a plain wedding band, broad and thick. */
function band(k, tint) { k.add(loop(0.41, 0.065, TAU, 56, 14), metalOf(tint), { sz: 2.4 }); }
/** `aretitos_bebe`: a pair of tiny hoops, each closed by a bead. */
function babyEarrings(k, tint) {
  const m = metalOf(tint);
  for (const s of [-1, 1]) {
    k.add(loop(0.2, 0.034, TAU * 0.86, 30, 8), m, { x: s * 0.27, rz: HALF + TAU * 0.07 + s * 0.15 });
    k.add(ball(0.056, 12, 8), m, { x: s * 0.27 - s * 0.03, y: 0.2 });
  }
}
/** `esmeralda`: a step-cut stone, the table to the eyes. */
function emerald(k, tint) {
  gem(k, mk(MAT.gem, tint), 0.5, { sx: 1.3, sz: 1.2 }, [1, 0.84, 0.68]);
  gem(k, mk(MAT.gem, shade(tint, 1.35)), 0.34, { sx: 1.3, z: 0.19, sz: 0.2 }, [1, 0.8]);
}
/** A necklace on a U of links, a medallion at the foot of it. */
function chain(k, tint) {
  const m = metalOf(tint), A = 0.46, TOP = 0.5, BOT = -0.4, U = [];
  for (let j = 0; j <= 240; j++) { const u = (j / 240) * 2 - 1; U.push([A * u, BOT + (TOP - BOT) * u * u]); }
  along(U, 30).forEach((p, i) => { const g = loop(0.034, 0.0095, TAU, 12, 5).scale(1.5, 1, 1); if (i % 2) g.rotateX(HALF); k.add(g, m, { x: p.x, y: p.y, rz: p.a }); });
  k.add(loop(0.04, 0.012, TAU, 16, 6), m, { y: BOT - 0.05, ry: HALF });                                 // the bail
  const y = BOT - 0.22;
  k.add(disc(0.13, 0.03, 36), m, { y, sy: 1.25 }); k.add(loop(0.125, 0.016, TAU, 36, 6), m, { y, z: 0.015, sy: 1.25 });
  k.add(post(0.012, 0.05, 0.12, 10), m, { y: y - 0.03, z: 0.03 }); k.add(ball(0.024, 10, 8), m, { y: y + 0.06, z: 0.03 }); k.add(loop(0.04, 0.005, TAU, 16, 5), m, { y: y + 0.06, z: 0.03 });
}
/** `aretes_perlas`: a pair of drop earrings, an ear wire over a small cap and a pearl each. */
function pearls(k, tint) {
  for (const s of [-1, 1]) {
    const x = s * 0.3;
    k.add(ball(0.105, 22, 16), mk(MAT.enamel, tint), { x, y: -0.14 });
    k.add(post(0.04, 0.06, 0.05, 14), MAT.silver, { x, y: -0.015 });
    k.add(wire([[0, 0.0], [0, 0.07], [0.02, 0.15], [0.08, 0.2], [0.14, 0.15], [0.15, 0.07], [0.145, 0.0]].map(([px, py]) => [s * px * 0.9 + x - s * 0.02, py, 0]), 0.011, 24, 5), MAT.silver);
  }
}
/** A rosary (`rosario_plata` silver, `rosario_comunion` white): five decades on a loop, the medal, the tail of beads and the cross. */
function rosary(k, tint, id) {
  const pearl = id === 'rosario_comunion', bead = pearl ? mk(MAT.enamel, tint) : metalOf(tint), cross = pearl ? MAT.silver : metalOf(tint), C = [];
  for (let j = 0; j <= 200; j++) { const a = -HALF + 0.2 + (j / 200) * (TAU - 0.4); C.push([Math.cos(a) * 0.34, 0.2 + Math.sin(a) * 0.34]); }
  along(C, 55).forEach((p, i) => k.add(ball(i % 11 === 5 ? 0.034 : 0.024, 8, 6), bead, { x: p.x, y: p.y }));
  k.add(disc(0.055, 0.014, 20), cross, { y: -0.17 });
  for (let i = 0; i < 5; i++) k.add(ball(i === 2 ? 0.03 : 0.022, 8, 6), bead, { y: -0.26 - i * 0.052 });
  k.add(slab(0.045, 0.25, 0.022), cross, { y: -0.62 }); k.add(slab(0.15, 0.045, 0.022), cross, { y: -0.56 });
}

// ------------------------------------------------------------------ rolls
function roll(k, tint) {
  const sheet = paper(tint), edge = paper(shade(tint, 1.14));
  k.add(post(0.2, 0.2, 1, 32), sheet, { rz: HALF });
  for (const s of [-1, 1]) for (const r of [0.05, 0.1, 0.15]) k.add(loop(r, 0.008, TAU, 24, 5), edge, { x: s * 0.5, ry: HALF });
  k.add(loop(0.205, 0.022, TAU, 32, 6), mk(MAT.ribbon, 0xb83a3a), { x: 0.12, ry: HALF });
}
/** `rollo_sin_revelar`: a 35 mm film canister, yellow label, and the leader out of its slot. */
function film(k) {
  const cap = MAT.silver;
  k.add(post(0.3, 0.3, 0.76, 36), mk(MAT.dark, 0x24282e));
  for (const s of [1, -1]) k.add(post(0.315, 0.315, 0.07, 36), cap, { y: s * 0.415 });
  k.add(post(0.07, 0.07, 0.16, 16), cap, { y: 0.54 });
  k.add(new THREE.CylinderGeometry(0.306, 0.306, 0.36, 28, 1, true, -1.0, 2.0), paper(0xe9b43a), { y: 0.02 });
  k.add(slab(0.2, 0.06, 0.006), mk(MAT.ink, 0xb83a3a), { y: 0.14, z: 0.3 }); k.add(slab(0.16, 0.03, 0.006), MAT.ink, { y: 0.04, z: 0.3 }); k.add(slab(0.12, 0.03, 0.006), MAT.ink, { y: -0.03, z: 0.3 });
  k.add(slab(0.5, 0.46, 0.008), mk(MAT.ribbon, 0x6b4a30), { x: 0.52, y: -0.12, z: 0.1, rz: -0.06 });
  for (const dy of [-0.2, 0.2]) for (let i = 0; i < 6; i++) k.add(slab(0.03, 0.022, 0.01), MAT.ink, { x: 0.36 + i * 0.075, y: -0.12 + dy, z: 0.1 });         // the sprocket holes
}
/** `mechon`: a lock of dark hair tied with red thread. */
function lock(k, tint) {
  const hair = mk(MAT.ribbon, tint), R = rng(seedOf('mechon'));
  for (let i = 0; i < 16; i++) {
    const u = (i / 16) * TAU, ox = Math.cos(u) * 0.045, oz = Math.sin(u) * 0.045, ph = R() * 6, pts = [];
    for (let j = 0; j <= 6; j++) { const y = -0.52 + (j / 6) * 1.04, spread = 0.7 + 4.5 * Math.abs(y - 0.12), wav = 0.05 * Math.sin(y * 7 + ph); pts.push([ox * spread + wav, y, oz * spread + wav * 0.6]); }
    k.add(wire(pts, 0.013, 14, 4), hair);
  }
  for (const y of [0.09, 0.125, 0.16]) k.add(loop(0.072, 0.009, TAU, 20, 5), mk(MAT.ribbon, 0xb83a3a), { y, rx: HALF });
}
/** `peluca`: a blonde wig, a cap with a head of locks hanging from its rim (shorter in front). */
function wig(k, tint) {
  const hair = mk(MAT.ribbon, shade(tint, 0.7)), R = rng(seedOf('peluca'));
  const cap = new THREE.SphereGeometry(0.34, 72, 18, 0, TAU, 0, 1.9), p = cap.attributes.position;
  for (let i = 0; i < p.count; i++) {                                                                  // the cap is combed: thirty ridges down from the crown, so it reads as hair and not as a bald head
    const x = p.getX(i), z = p.getZ(i), f = 1 + 0.045 * Math.sin(Math.atan2(x, z) * 30) * Math.min(1, Math.hypot(x, z) / 0.12);
    p.setXYZ(i, x * f, p.getY(i), z * f);
  }
  cap.computeVertexNormals(); k.add(cap, hair, { y: 0.05 });
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * TAU + (R() - 0.5) * 0.06, len = 0.42 + 0.3 * (1 - Math.cos(a)) / 2 + 0.06 * R(), g = post(0.05, 0.014, len, 6).translate(0, -len / 2, 0).rotateZ((i % 2 ? 1 : -1) * 0.07).rotateX(-0.12);
    k.add(g, hair, { x: Math.sin(a) * 0.318, y: -0.06, z: Math.cos(a) * 0.318, ry: a });
  }
}
/** `bigote_postizo`: a handlebar moustache, thick at the middle and thin at the curled tips. */
function moustache(k, tint) {
  const up = [], low = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, cx = 0.5 * t, cy = -0.07 * Math.sin(Math.PI * t) + 0.3 * t ** 4, w = 0.115 * (1 - t ** 1.4) ** 0.9 + 0.012;
    const dy = -0.07 * Math.PI * Math.cos(Math.PI * t) + 1.2 * t ** 3, n = Math.hypot(0.5, dy), nx = -dy / n, ny = 0.5 / n;
    up.push(new THREE.Vector2(cx + nx * w, cy + ny * w)); low.push(new THREE.Vector2(cx - nx * w, cy - ny * w));
  }
  const right = [...up, ...low.reverse()], left = right.map((p) => new THREE.Vector2(-p.x, p.y)).reverse().slice(1, -1);
  k.add(cut(new THREE.Shape([...right, ...left]), 0.06, 0.016, 8), mk(MAT.ribbon, tint));
}

// ------------------------------------------------------------------ teeth
function tooth(k, tint, id) {
  const gold = id === 'diente_oro', crown = gold ? metalOf(tint) : mk(MAT.enamel, 0xf1e8d8), root = mk(MAT.enamel, gold ? 0xe8e0c8 : 0xf1e8d8);
  k.add(cut(rrect(0.8, 0.4, 0.15), 0.6, 0.05), crown, { y: 0.2 });                                    // the crown: a rounded block with four cusps on its top
  for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) k.add(ball(0.13, 12, 8), crown, { x, y: 0.43, z, sy: 0.6 });
  for (const s of [-1, 1]) k.add(post(0.17, 0.03, 0.62, 14), root, { x: s * 0.2, y: -0.27, rz: s * 0.05 });
}
/** `dentadura`: an upper and a lower plate of false teeth, pink gum and ivory teeth, bitten together. */
function denture(k, tint) {
  const gum = mk(MAT.enamel, 0xe19aa0), ivory = mk(MAT.enamel, tint);
  for (const up of [true, false]) {
    const A = up ? 0.42 : 0.36, B = up ? 0.4 : 0.34, y = up ? 0.17 : -0.19, pts = [];
    for (let i = 0; i <= 24; i++) { const th = (i / 24) * Math.PI; pts.push([Math.cos(th) * A, 0, Math.sin(th) * B]); }
    k.add(wire(pts, 0.07, 36, 8), gum, { y, sy: 0.8 });
    for (let i = 0; i < 11; i++) {
      const th = 0.12 * Math.PI + (i / 10) * 0.76 * Math.PI;
      k.add(cut(rrect(0.085, 0.17, 0.03), 0.05, 0.012, 3), ivory, { x: Math.cos(th) * (A + 0.03), y: y + (up ? -0.1 : 0.1), z: Math.sin(th) * (B + 0.03), ry: Math.atan2(Math.cos(th) / A, Math.sin(th) / B), sy: 1 + 0.15 * Math.sin(th) ** 4 });
    }
  }
}

// ------------------------------------------------------------------ paper
function deed(k, tint, id) {
  const R = rng(seedOf(id ?? 'deed')), W = 0.72, H = 1, z = 0.011, edge = mk(MAT.ink, 0x7a5a3a);
  k.add(cut(rrect(W, H, 0.012), 0.012, 0.003), paper(tint));
  for (const [x, y, w, h] of [[0, H / 2 - 0.035, W - 0.07, 0.008], [0, -H / 2 + 0.035, W - 0.07, 0.008], [-W / 2 + 0.035, 0, 0.008, H - 0.07], [W / 2 - 0.035, 0, 0.008, H - 0.07]]) k.add(slab(w, h, 0.004), edge, { x, y, z });
  k.add(slab(0.4, 0.05, 0.004), MAT.ink, { y: 0.38, z });
  lines(k, -0.28, 0.28, 0.56, 9, 0.058, R, MAT.ink, z);
  k.add(loop(0.07, 0.006, TAU, 24, 5), mk(MAT.ink, 0x2a4a8a), { x: -0.18, y: -0.16, z });                       // the stamp
  k.add(slab(0.2, 0.006, 0.004), MAT.ink, { x: -0.15, y: -0.36, z });
  k.add(wire([[-0.24, -0.33, z + 0.003], [-0.2, -0.31, z + 0.003], [-0.16, -0.345, z + 0.003], [-0.12, -0.315, z + 0.003], [-0.07, -0.34, z + 0.003]], 0.005, 16, 4), mk(MAT.ink, 0x2a4a8a));
  for (const [x, r] of [[0.17, 0.18], [0.23, -0.18]]) k.add(slab(0.035, 0.14, 0.004), mk(MAT.ribbon, 0xb02a2a), { x, y: -0.4, z: 0.01, rz: r });
  k.add(disc(0.075, 0.016, 28), mk(MAT.enamel, 0xb02a2a), { x: 0.2, y: -0.28, z: 0.014 }); k.add(loop(0.055, 0.008, TAU, 24, 6), mk(MAT.enamel, 0x8a1c1c), { x: 0.2, y: -0.28, z: 0.024 });    // the wax seal
}
/** A lottery ticket: a coloured head, the number in big digits, a few lines and a perforated stub. */
function ticket(k, tint, id) {
  const R = rng(seedOf(id ?? 'ticket')), W = 0.46, z = 0.011;
  k.add(cut(rrect(W, 1, 0.012), 0.012, 0.003), paper(tint));
  k.add(slab(W - 0.04, 0.18, 0.004), paper(0xb83a3a), { y: 0.38, z }); k.add(slab(0.26, 0.03, 0.004), paper(0xf4eddc), { y: 0.4, z: z + 0.004 }); k.add(slab(0.18, 0.02, 0.004), paper(0xf4eddc), { y: 0.35, z: z + 0.004 });
  for (let i = 0; i < 5; i++) seg7(k, i === 4 ? 7 : Math.floor(R() * 10), -0.16 + i * 0.08, 0.1, 0.13, MAT.ink, z);
  lines(k, -0.18, -0.08, 0.36, 4, 0.05, R, MAT.ink, z);
  k.add(slab(W - 0.04, 0.004, 0.004), MAT.ink, { y: -0.3, z });
  for (let i = 0; i < 9; i++) k.add(disc(0.007, 0.006, 8), MAT.ink, { x: -0.18 + i * 0.045, y: -0.33, z });
  k.add(cut(rrect(0.2, 0.1, 0.01), 0.004), paper(0xe9c43a), { y: -0.42, z });
}
/** `billete_olvidado`: a banknote folded in four, the layers showing at its edges. */
function foldedNote(k, tint) {
  const R = rng(seedOf('billete')), z = 0.054;                                                         // z: the face of the top layer
  for (let i = 0; i < 4; i++) k.add(cut(rrect(1, 0.92, 0.006), 0.02, 0.003), paper(tint), { x: (R() - 0.5) * 0.02, y: (R() - 0.5) * 0.02, z: (i - 1.5) * 0.026, rz: (R() - 0.5) * 0.03 });
  const ink = mk(MAT.ink, shade(tint, 0.55));
  for (const [x, y, w, h] of [[0, 0.41, 0.9, 0.012], [0, -0.41, 0.9, 0.012], [-0.47, 0, 0.012, 0.8], [0.47, 0, 0.012, 0.8]]) k.add(slab(w, h, 0.004), ink, { x, y, z });
  k.add(disc(0.2, 0.004, 28), paper(shade(tint, 1.18)), { z, sx: 0.8 }); k.add(loop(0.2, 0.006, TAU, 28, 5), ink, { z, sx: 0.8 });
  k.add(ball(0.06, 12, 8), ink, { y: 0.05, z, sz: 0.1 }); k.add(post(0.02, 0.1, 0.16, 10), ink, { y: -0.09, z, sz: 0.1 });
  for (let i = 0; i < 5; i++) seg7(k, i === 0 ? 1 : 0, -0.2 + i * 0.1, -0.33, 0.1, ink, z);
  for (const [w, h] of [[0.98, 0.006], [0.006, 0.9]]) k.add(slab(w, h, 0.004), mk(MAT.ink, shade(tint, 0.8)), { z: z + 0.001 });        // the folds
}
/** `cheque_sin_cobrar`: a cheque, landscape, printed lines and an amount box, a blue signature. */
function cheque(k, tint) {
  const R = rng(seedOf('cheque')), W = 1, H = 0.46, z = 0.011, ink = mk(MAT.ink, 0x3a4a6a);
  k.add(cut(rrect(W, H, 0.012), 0.012, 0.003), paper(tint));
  k.add(slab(W - 0.05, 0.01, 0.004), ink, { y: H / 2 - 0.03, z }); k.add(slab(W - 0.05, 0.01, 0.004), ink, { y: -H / 2 + 0.03, z });
  k.add(disc(0.045, 0.004, 20), paper(0x3a6a8a), { x: -0.39, y: 0.12, z }); k.add(slab(0.22, 0.03, 0.004), ink, { x: -0.2, y: 0.12, z });
  lines(k, -0.44, 0.02, 0.62, 2, 0.07, R, MAT.ink, z); lines(k, -0.44, -0.12, 0.5, 1, 0.07, R, MAT.ink, z);
  for (const [x, y, w, h] of [[0.33, 0.03, 0.22, 0.007], [0.33, -0.05, 0.22, 0.007], [0.22, -0.01, 0.007, 0.08], [0.44, -0.01, 0.007, 0.08]]) k.add(slab(w, h, 0.004), ink, { x, y, z });
  k.add(slab(0.24, 0.006, 0.004), MAT.ink, { x: 0.3, y: -0.15, z });
  k.add(wire([[0.2, -0.12], [0.24, -0.09], [0.26, -0.14], [0.3, -0.08], [0.33, -0.13], [0.38, -0.1]].map(([x, y]) => [x, y, z + 0.003]), 0.005, 16, 4), mk(MAT.ink, 0x2a4a9a));
}
/** `primer_billete`: the shop's first banknote under a wooden frame, a line of handwriting on the mount. */
function framedNote(k, tint) {
  const R = rng(seedOf('primer')), W = 1, H = 0.62, f = 0.07, wood = mk(MAT.leather, 0x5a3a24);
  for (const [x, y, w, h] of [[0, H / 2 - f / 2, W, f], [0, -H / 2 + f / 2, W, f], [-W / 2 + f / 2, 0, f, H], [W / 2 - f / 2, 0, f, H]]) k.add(cut(rrect(w, h, 0.012), 0.07, 0.01), wood, { x, y });
  k.add(slab(W - 2 * f, H - 2 * f, 0.02), paper(0xefe6cf), { z: -0.01 });
  k.add(cut(rrect(0.76, 0.3, 0.008), 0.006), paper(tint), { y: 0.06, z: 0.003 });
  const ink = mk(MAT.ink, shade(tint, 0.5));
  k.add(loop(0.1, 0.006, TAU, 24, 5), ink, { x: -0.18, y: 0.06, z: 0.008 }); k.add(slab(0.2, 0.014, 0.004), ink, { x: 0.18, y: 0.1, z: 0.008 }); k.add(slab(0.2, 0.014, 0.004), ink, { x: 0.18, y: 0.04, z: 0.008 });
  lines(k, -0.3, -0.19, 0.56, 1, 0.05, R, mk(MAT.ink, 0x2a4a9a), 0.012, 0.012);
}
function letter(k, tint, id) {
  const R = rng(seedOf(id ?? 'letter')), W = 1, H = 0.65, z = 0.011;
  k.add(cut(rrect(W, H, 0.01), 0.014, 0.003), paper(tint));
  for (const s of [-1, 1]) k.add(slab(0.596, 0.006, 0.004), mk(MAT.ink, shade(tint, 0.7)), { x: s * 0.25, y: 0.1625, z, rz: s * 0.576 });
  k.add(cut(rrect(0.12, 0.15, 0.008), 0.004), paper(0xb83a3a), { x: 0.38, y: 0.22, z }); lines(k, -0.2, -0.1, 0.5, 3, 0.06, R, MAT.ink, z);
}
/** `carta_cinta`: a letter folded to a packet and tied with a red ribbon in a bow. */
function tiedLetter(k, tint) {
  const ribbon = mk(MAT.ribbon, 0xb8302a);
  k.add(cut(rrect(0.62, 1, 0.012), 0.04, 0.006), paper(tint));
  k.add(slab(0.66, 0.07, 0.06), ribbon, { y: -0.02 });
  for (const s of [-1, 1]) {
    k.add(loop(0.085, 0.02, TAU, 20, 6), ribbon, { x: s * 0.1, y: 0.0, z: 0.045, sy: 0.6, rz: s * 0.4 });
    k.add(slab(0.04, 0.2, 0.01), ribbon, { x: s * 0.05, y: -0.14, z: 0.048, rz: -s * 0.25 });
  }
  k.add(ball(0.035, 10, 8), ribbon, { y: -0.02, z: 0.05 });
}
/** `tarjeta_agradecimiento`: a thank-you card with a heart, a few lines in blue pen and a coin taped on. */
function thanksCard(k, tint) {
  const R = rng(seedOf('gracias')), z = 0.011;
  k.add(cut(rrect(0.72, 1, 0.02), 0.014, 0.003), paper(tint));
  k.add(cut(heart(), 0.006, 0.002), mk(MAT.enamel, 0xc83a4a), { y: 0.34, z: 0.013, sx: 0.2, sy: 0.2, sz: 1 });
  lines(k, -0.27, 0.12, 0.54, 4, 0.06, R, mk(MAT.ink, 0x2a4a9a), z);
  k.add(disc(0.1, 0.012, 28), MAT.gold, { x: 0.18, y: -0.3, z: 0.016 });
  for (const r of [0.7, -0.7]) k.add(slab(0.3, 0.05, 0.004), mk(MAT.ribbon, 0xe6dca8), { x: 0.18, y: -0.3, z: 0.024, rz: r });
}
/** A child's treasure map: torn paper, a crayon river, trees, a house, a dotted path and a red X. */
function treasureMap(k, tint, id) {
  const R = rng(seedOf(id ?? 'map')), W = 1, H = 0.78, z = 0.011, red = mk(MAT.ribbon, 0xc83a2a), green = mk(MAT.ribbon, 0x4a9a4a), pts = [], n = 8;
  for (let i = 0; i < n; i++) pts.push([-W / 2 + (W * i) / n, H / 2 + (R() - 0.5) * 0.03]);
  for (let i = 0; i < n; i++) pts.push([W / 2 + (R() - 0.5) * 0.03, H / 2 - (H * i) / n]);
  for (let i = 0; i < n; i++) pts.push([W / 2 - (W * i) / n, -H / 2 + (R() - 0.5) * 0.03]);
  for (let i = 0; i < n; i++) pts.push([-W / 2 + (R() - 0.5) * 0.03, -H / 2 + (H * i) / n]);
  k.add(cut(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), 0.012, 0.002, 4), paper(tint));
  k.add(wire([[-0.4, 0.3], [-0.2, 0.18], [-0.05, 0.26], [0.1, 0.1], [0.28, 0.18], [0.42, 0.05]].map(([x, y]) => [x, y, z + 0.004]), 0.016, 30, 5), mk(MAT.ink, 0x3a78c8));
  for (const [x, y] of [[-0.35, 0.0], [-0.1, -0.05], [0.12, 0.3]]) { k.add(ball(0.065, 12, 8), green, { x, y, z: z + 0.012, sz: 0.3 }); k.add(slab(0.014, 0.05, 0.004), mk(MAT.ink, 0x6a4a2a), { x, y: y - 0.075, z }); }
  k.add(slab(0.12, 0.1, 0.006), mk(MAT.ribbon, 0xe0b040), { x: -0.3, y: -0.2, z }); k.add(slab(0.11, 0.11, 0.006), red, { x: -0.3, y: -0.12, z, rz: Math.PI / 4 });
  for (let i = 0; i < 10; i++) { const t = i / 9; k.add(disc(0.012, 0.006, 8), red, { x: -0.2 + 0.55 * t, y: -0.2 + 0.1 * Math.sin(t * 5) + 0.05 * t, z }); }
  for (const r of [Math.PI / 4, -Math.PI / 4]) k.add(slab(0.2, 0.034, 0.006), red, { x: 0.38, y: -0.15, z, rz: r });
}
/** A photograph: a white border, a mid-tone print and two people standing in it (a groom in dark, a bride with a veil). */
function photo(k, tint) {
  const grey = (c) => paper(c), z = 0.0125;
  k.add(cut(rrect(0.76, 1, 0.012), 0.012, 0.003), paper(0xf2eee2));
  k.add(slab(0.64, 0.82, 0.004), grey(tint), { y: 0.04, z: 0.01 });
  k.add(slab(0.64, 0.4, 0.004), grey(shade(tint, 1.2)), { y: 0.24, z });
  k.add(post(0.07, 0.1, 0.36, 14), grey(0x2a2a2e), { x: -0.14, y: -0.12, z: 0.04 }); k.add(ball(0.058, 14, 10), grey(0xc8c0b0), { x: -0.14, y: 0.1, z: 0.04 }); k.add(ball(0.06, 14, 8), grey(0x1c1c20), { x: -0.14, y: 0.13, z: 0.035, sy: 0.55 });
  k.add(ball(0.1, 14, 10), grey(0xe8e4da), { x: 0.12, y: 0.1, z: 0.02, sy: 1.5, sz: 0.3 });
  k.add(post(0.035, 0.15, 0.4, 14), grey(0xeae6dc), { x: 0.12, y: -0.1, z: 0.04 }); k.add(ball(0.055, 14, 10), grey(0xc8c0b0), { x: 0.12, y: 0.12, z: 0.045 }); k.add(ball(0.04, 10, 8), grey(0xf6f4ee), { x: 0.07, y: -0.02, z: 0.1 });
}

// ------------------------------------------------------------------ clothes
/** `camiseta_firmada`: a team shirt, a white band across the chest, a badge and a black-marker signature. */
function shirt(k, tint) {
  const s = new THREE.Shape(), body = paper(tint), white = paper(0xf2f2ee), P = [[-0.13, 0.44], [-0.31, 0.39], [-0.5, 0.2], [-0.42, 0.02], [-0.31, 0.1], [-0.3, -0.45], [0.3, -0.45], [0.31, 0.1], [0.42, 0.02], [0.5, 0.2], [0.31, 0.39], [0.13, 0.44]];
  s.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]); s.quadraticCurveTo(0, 0.28, -0.13, 0.44);
  k.add(cut(s, 0.07, 0.02, 10), body);
  const neck = new THREE.QuadraticBezierCurve(new THREE.Vector2(0.13, 0.44), new THREE.Vector2(0, 0.28), new THREE.Vector2(-0.13, 0.44)).getPoints(10);
  k.add(wire(neck.map((p) => [p.x, p.y, 0.058]), 0.013, 20, 5), white);
  k.add(slab(0.6, 0.09, 0.006), white, { y: 0.15, z: 0.058 });
  k.add(disc(0.045, 0.008, 5), white, { x: -0.15, y: 0.02, z: 0.06 }); k.add(loop(0.045, 0.006, TAU, 5, 5), MAT.gold, { x: -0.15, y: 0.02, z: 0.062 });
  k.add(wire([[-0.2, -0.12], [-0.12, -0.02], [-0.06, -0.14], [0.0, -0.04], [0.05, -0.15], [0.12, -0.05], [0.2, -0.1], [0.26, -0.02]].map(([x, y]) => [x, y, 0.063]), 0.007, 40, 4), MAT.ink);
  k.add(slab(0.4, 0.008, 0.004), MAT.ink, { x: 0.02, y: -0.19, z: 0.061 });
}
/** Frilly knickers; `calzones_lunares` has polka dots, `calzones_regalo` its shop tag on a string. */
function knickers(k, tint, id) {
  const W = 0.43, c = paper(tint), frill = paper(shade(tint, 1.06)), s = new THREE.Shape();
  const leg = (m) => new THREE.CubicBezierCurve(new THREE.Vector2(m * (W + 0.03), 0.1), new THREE.Vector2(m * 0.34, -0.12), new THREE.Vector2(m * 0.15, -0.14), new THREE.Vector2(m * 0.085, -0.36)).getPoints(40).map((p) => [p.x, p.y]);
  s.moveTo(-W, 0.36); s.lineTo(W, 0.36); s.lineTo(W + 0.03, 0.1); s.bezierCurveTo(0.34, -0.12, 0.15, -0.14, 0.085, -0.36); s.lineTo(-0.085, -0.36); s.bezierCurveTo(-0.15, -0.14, -0.34, -0.12, -(W + 0.03), 0.1); s.lineTo(-W, 0.36);
  k.add(cut(s, 0.05, 0.014, 14), c);
  for (const m of [1, -1]) along(leg(m), 13).forEach((p) => k.add(ball(0.034, 8, 6), frill, { x: p.x, y: p.y, z: 0.04, sz: 0.8 }));
  along([[-W, 0.36], [W, 0.36]], 15).forEach((p) => k.add(ball(0.034, 8, 6), frill, { x: p.x, y: p.y, z: 0.04, sz: 0.8 }));
  k.add(slab(2 * W, 0.035, 0.056), paper(shade(tint, 0.9)), { y: 0.335 });
  if (id === 'calzones_lunares') {
    const poly = [[-W, 0.36], [W, 0.36], ...leg(1), ...leg(-1).reverse()];
    for (let r = 0; r < 6; r++) for (let q = -4; q <= 4; q++) { const x = q * 0.095 + (r % 2) * 0.047, y = 0.27 - r * 0.11; if (inside(poly, x, y) && inside(poly, x - 0.035, y) && inside(poly, x + 0.035, y)) k.add(disc(0.026, 0.006, 10), paper(0xb8483a), { x, y, z: 0.057 }); }
  }
  if (id === 'calzones_regalo') {
    k.add(cut(rrect(0.16, 0.22, 0.015), 0.008, 0.002), paper(0xf4f0e0), { x: 0.53, y: 0.05, z: 0.05, rz: -0.35 });
    k.add(slab(0.09, 0.016, 0.004), MAT.ink, { x: 0.53, y: 0.08, z: 0.056, rz: -0.35 }); k.add(slab(0.07, 0.012, 0.004), mk(MAT.ink, 0xb83a3a), { x: 0.52, y: 0.03, z: 0.056, rz: -0.35 });
    k.add(wire([[0.4, 0.34, 0.05], [0.47, 0.25, 0.06], [0.5, 0.16, 0.05]], 0.007, 12, 4), mk(MAT.ribbon, 0xcfc6b0));
  }
}

// ------------------------------------------------------------------ jars and tins
/** `tapas_gaseosa`: a round tin heaped with coloured bottle caps. */
function capsTin(k, tint, id) {
  const R = rng(seedOf(id ?? 'caps')), tin = mk(MAT.brass, 0x9a8f7a), cols = [0xb5483a, 0x2f6fc4, 0x3a9a4a, 0xe9c43a, 0xe9e4d4, 0xe07a2a];
  k.add(post(0.5, 0.5, 0.46, 44), tin, { y: -0.07 });
  k.add(loop(0.5, 0.02, TAU, 44, 6).rotateX(HALF), tin, { y: 0.16 });
  k.add(post(0.505, 0.505, 0.12, 44), mk(MAT.enamel, tint), { y: -0.1 });
  for (let i = 0; i < 70; i++) {
    const r = 0.43 * Math.sqrt((i + 0.5) / 70), a = i * 2.39996, h = 0.17 + 0.1 * (1 - (r / 0.45) ** 2) + 0.02 * R();
    k.add(post(0.07, 0.085, 0.028, 12), mk(MAT.enamel, cols[(R() * cols.length) | 0]), { x: Math.cos(a) * r, y: h, z: Math.sin(a) * r, rx: (R() - 0.5) * 0.9, rz: (R() - 0.5) * 0.9 });
  }
}
/** `perfume_viejo`: a rectangular amber bottle, a gold collar and stopper, a paper label. */
function perfume(k, tint) {
  const glass = mk(MAT.gem, shade(tint, 0.78));
  k.add(cut(rrect(0.62, 0.66, 0.08), 0.34, 0.025), glass, { y: -0.17 });
  k.add(cut(rrect(0.34, 0.1, 0.03), 0.2, 0.012), glass, { y: 0.21 });
  k.add(post(0.075, 0.075, 0.1, 16), MAT.gold, { y: 0.31 });
  k.add(flat(post(0.13, 0.1, 0.2, 8)), MAT.gold, { y: 0.46 });
  k.add(cut(rrect(0.4, 0.28, 0.015), 0.006), paper(0xf2ead2), { y: -0.18, z: 0.185 });
  k.add(slab(0.26, 0.03, 0.004), MAT.ink, { y: -0.14, z: 0.19 }); k.add(slab(0.18, 0.02, 0.004), mk(MAT.ink, 0xa8842a), { y: -0.21, z: 0.19 });
}
function jar(k, tint) {
  k.add(post(0.4, 0.4, 0.62, 32), mk(MAT.gem, 0xcfe4ec), { y: -0.05 });
  k.add(post(0.34, 0.36, 0.1, 32), metalOf(tint), { y: 0.31 });
}

// ------------------------------------------------------------------ boxes (and the things finds.js calls a box because no word fits them better)
function box(k, tint) {
  k.add(cut(rrect(1, 0.38, 0.03), 0.8, 0.01), paper(tint), { y: -0.1 });
  k.add(cut(rrect(1.04, 0.14, 0.03), 0.84, 0.01), paper(shade(tint, 0.82)), { y: 0.16 });
}
/** `pepita_oro`: a lump of river gold, rounded and lumpy (a deterministic bump of its own at every point). */
function nugget(k, tint) {
  let g = new THREE.IcosahedronGeometry(0.5, 3); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const r = 0.5 * (0.84 + 0.14 * (0.5 + 0.5 * Math.sin(v.x * 5.1 + v.y * 3.7 + 1.3)) + 0.06 * Math.sin(v.y * 7.3 - v.z * 6.1 + 0.4) + 0.03 * Math.sin(v.z * 11.7 + v.x * 9.3));
    p.setXYZ(i, v.x * r, v.y * r * 0.62, v.z * r * 0.78);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2)); g.computeVertexNormals();
  k.add(g, metalOf(tint));
}
/** `zapatitos_bebe`: a pair of knitted booties, ribbed cuffs and a pink ribbon each. */
function booties(k, tint) {
  const wool = mk(MAT.ribbon, tint), trim = mk(MAT.ribbon, 0xf2b5c8);
  for (const s of [-1, 1]) k.with({ x: s * 0.3, ry: -s * 0.14 }, () => {
    k.add(ball(0.2, 20, 14), wool, { y: -0.12, z: 0.1, sx: 0.9, sy: 0.62, sz: 1.25 });
    k.add(ball(0.14, 14, 10), wool, { y: -0.09, z: 0.3, sy: 0.8 });
    k.add(post(0.17, 0.2, 0.34, 18), wool, { y: 0.1, z: -0.02 });
    for (const y of [0.0, 0.1, 0.18]) k.add(loop(0.185, 0.02, TAU, 20, 6).rotateX(HALF), wool, { y, z: -0.02 });
    k.add(loop(0.17, 0.028, TAU, 20, 6).rotateX(HALF), trim, { y: 0.27, z: -0.02 });
    for (const t of [-1, 1]) k.add(loop(0.05, 0.014, TAU, 14, 5), trim, { x: t * 0.05, y: 0.14, z: 0.19, sy: 0.7, rz: t * 0.4 }); k.add(ball(0.022, 8, 6), trim, { y: 0.14, z: 0.2 });
  });
}
/** `diente_leche`: a little cardboard box with a milk tooth on a bed of cotton. */
function toothBox(k) {
  const card = paper(0xcdb894);
  k.add(slab(1, 0.04, 0.7), card, { y: -0.1 });
  for (const s of [-1, 1]) { k.add(slab(1, 0.2, 0.04), card, { y: 0, z: s * 0.33 }); k.add(slab(0.04, 0.2, 0.7), card, { x: s * 0.48, y: 0 }); }
  k.add(ball(0.3, 20, 12), paper(0xfaf8f2), { y: -0.04, sy: 0.45 });
  k.add(slab(0.5, 0.09, 0.006), paper(0xb83a3a), { y: 0.0, z: 0.352 });
  k.with({ y: 0.14, s: 0.3 }, () => tooth(k, 0xf1e8d8, 'diente_leche'));
}
/** `casete`: a cassette, a handwritten label, the window with its two reels and the tape. */
function cassette(k, tint) {
  const R = rng(seedOf('casete'));
  k.add(cut(rrect(1, 0.63, 0.03), 0.12, 0.01), mk(MAT.dark, tint));
  k.add(cut(rrect(0.86, 0.34, 0.02), 0.01), paper(0xe8e2d0), { y: 0.1, z: 0.064 });
  lines(k, -0.36, 0.2, 0.7, 3, 0.07, R, mk(MAT.ink, 0x2a4a9a), 0.072, 0.02);
  k.add(cut(rrect(0.52, 0.15, 0.07), 0.01), mk(MAT.dark, 0x15181c), { y: -0.1, z: 0.064 });
  for (const s of [-1, 1]) { k.add(disc(0.065, 0.014, 20), paper(0xe8e8e0), { x: s * 0.14, y: -0.1, z: 0.07 }); k.add(disc(0.03, 0.016, 6), mk(MAT.dark, 0x15181c), { x: s * 0.14, y: -0.1, z: 0.071 }); }
  k.add(slab(0.28, 0.04, 0.006), mk(MAT.ribbon, 0x5a3a28), { y: -0.11, z: 0.07 });
  k.add(slab(0.6, 0.12, 0.012), mk(MAT.dark, 0x3a3f46), { y: -0.255, z: 0.063 });
  for (const [x, y] of [[-0.45, 0.27], [0.45, 0.27], [-0.45, -0.27], [0.45, -0.27], [-0.1, -0.255], [0.1, -0.255]]) k.add(disc(0.022, 0.008, 10), MAT.silver, { x, y, z: 0.063 });
}
/** `gafas_cinta`: round-rimmed glasses, a lens each, one arm mended with a wrap of tape. */
function glasses(k, tint) {
  const frame = mk(MAT.dark, tint);
  for (const s of [-1, 1]) {
    k.add(loop(0.2, 0.026, TAU, 36, 8), frame, { x: s * 0.27 }); k.add(disc(0.195, 0.008, 32), mk(MAT.gem, 0xcfe2ec), { x: s * 0.27, z: -0.002 });
    k.add(slab(0.03, 0.035, 0.7), frame, { x: s * 0.47, y: 0.09, z: -0.35, ry: s * 0.04 });
  }
  k.add(loop(0.075, 0.022, Math.PI, 16, 6), frame, { y: 0.08 });
  k.add(slab(0.055, 0.06, 0.1), paper(0xe6dfc8), { x: -0.47, y: 0.09, z: -0.16 });
}
/** `baraja_sin_as`: a pile of cards backs up with three fanned out face up beside it. */
function deck(k, tint) {
  const face = paper(0xf2eee2), back = paper(tint), pat = mk(MAT.ink, shade(tint, 0.7)), pip = paper(0xc0302a);
  k.with({ x: -0.34 }, () => {
    k.add(cut(rrect(0.64, 0.9, 0.04), 0.22, 0.008), face);
    k.add(cut(rrect(0.6, 0.86, 0.035), 0.006), back, { z: 0.113 });
    for (const [x, y, w, h] of [[0, 0.38, 0.5, 0.01], [0, -0.38, 0.5, 0.01], [-0.25, 0, 0.01, 0.76], [0.25, 0, 0.01, 0.76]]) k.add(slab(w, h, 0.004), pat, { x, y, z: 0.118 });
    for (const r of [0.9, -0.9]) k.add(slab(0.7, 0.012, 0.004), pat, { z: 0.118, rz: r });
    k.add(loop(0.1, 0.008, TAU, 4, 4), pat, { z: 0.118, rz: HALF / 2 });
  });
  for (let i = 0; i < 3; i++) {
    const t = { x: 0.34 + 0.09 * i, y: 0.03 * i, z: 0.012 * i - 0.012, rz: -0.12 - 0.2 * i };
    k.add(cut(rrect(0.64, 0.9, 0.04), 0.008, 0.003), face, t);
    const c = Math.cos(t.rz), s = Math.sin(t.rz);                                                       // the pips turn with their card
    for (const [x, y] of [[0, 0.15], [0, -0.15], [-0.15, 0], [0.15, 0]]) k.add(slab(0.09, 0.09, 0.004), pip, { x: t.x + x * c - y * s, y: t.y + x * s + y * c, z: t.z + 0.008, rz: t.rz + HALF / 2 });
  }
}
/** `album_estampas`: a sticker album, blue cover, a white title plate, a football and a few stickers stuck on. */
function album(k, tint) {
  const cover = paper(tint), R = rng(seedOf('album'));
  k.add(cut(rrect(0.74, 1, 0.03), 0.02, 0.008), cover, { z: 0.06 }); k.add(cut(rrect(0.74, 1, 0.03), 0.02, 0.008), cover, { z: -0.06 });
  k.add(slab(0.7, 0.96, 0.1), paper(0xf2ecd8)); k.add(slab(0.05, 1, 0.14), paper(shade(tint, 0.7)), { x: -0.36 });
  k.add(cut(rrect(0.5, 0.2, 0.02), 0.006), paper(0xf6f2e6), { y: 0.3, z: 0.078 });
  k.add(slab(0.32, 0.04, 0.004), MAT.ink, { y: 0.33, z: 0.083 }); k.add(slab(0.22, 0.03, 0.004), mk(MAT.ink, 0xc0302a), { y: 0.27, z: 0.083 });
  k.add(ball(0.12, 16, 12), paper(0xf6f6f2), { y: 0.0, z: 0.1, sz: 0.5 });
  for (const [x, y] of [[0, 0.0], [0.07, 0.07], [-0.07, 0.07], [0.08, -0.06], [-0.08, -0.06]]) k.add(disc(0.034, 0.006, 5), mk(MAT.ink, 0x2a2a2e), { x, y, z: 0.158 });
  [[-0.2, -0.28, 0xe9c43a], [0.0, -0.3, 0xc0302a], [0.2, -0.28, 0x3a9a4a], [0.0, -0.1, 0xf6f6f2]].forEach(([x, y, c], i) => { if (i < 3) k.add(cut(rrect(0.15, 0.2, 0.012), 0.004), paper(c), { x: x + (R() - 0.5) * 0.04, y: y + (R() - 0.5) * 0.04, z: 0.075, rz: (R() - 0.5) * 0.4 }); });
}
/** `milagritos`: a handful of little tin charms laid together (two hearts, a house, a leg and an arm). */
function charms(k, tint) {
  const tin = metalOf(tint), house = new THREE.Shape([[-0.4, -0.4], [0.4, -0.4], [0.4, 0.1], [0, 0.5], [-0.4, 0.1]].map(([x, y]) => new THREE.Vector2(x, y)));
  const leg = new THREE.Shape([[-0.1, 0.5], [0.1, 0.5], [0.1, -0.25], [0.36, -0.34], [0.36, -0.5], [-0.1, -0.5]].map(([x, y]) => new THREE.Vector2(x, y)));
  // a piece lies at `t` (its own height `top` is where its hanging ring is) at depth `z`, so no two share a face
  const piece = (shape, t, z, top) => {
    k.add(cut(shape, 0.025, 0.006), tin, { ...t, z });
    k.add(loop(0.035, 0.008, TAU, 16, 5), tin, { x: t.x - top * t.s * Math.sin(t.rz), y: t.y + (top + 0.05) * t.s * Math.cos(t.rz), z });
  };
  piece(heart(), { x: -0.28, y: 0.12, s: 0.5, rz: 0.2 }, 0, 0.3); piece(house, { x: 0.12, y: 0.18, s: 0.46, rz: -0.1 }, 0.012, 0.5); piece(leg, { x: -0.05, y: -0.18, s: 0.44, rz: 0.9 }, 0.024, 0.5);
  piece(rrect(0.18, 0.75, 0.08), { x: 0.33, y: -0.2, s: 0.5, rz: -0.6 }, 0.036, 0.375); piece(heart(), { x: -0.38, y: -0.25, s: 0.3, rz: -0.3 }, 0.048, 0.3);
}

// ------------------------------------------------------------------ dolls, keys, medals, balls
function bear(k, tint) {
  const fur = mk(MAT.ribbon, tint), pale = mk(MAT.ribbon, shade(tint, 1.25)), dark = MAT.ink;
  k.add(ball(0.3, 20, 14), fur, { y: -0.1, sy: 1.15 }); k.add(ball(0.2, 18, 12), pale, { y: -0.08, z: 0.14, sy: 1.0, sz: 0.6 });
  k.add(ball(0.22, 20, 14), fur, { y: 0.3 }); for (const s of [-1, 1]) { k.add(ball(0.08, 12, 8), fur, { x: s * 0.17, y: 0.47 }); k.add(ball(0.045, 10, 8), pale, { x: s * 0.17, y: 0.47, z: 0.04 }); k.add(ball(0.026, 10, 8), dark, { x: s * 0.08, y: 0.34, z: 0.2 }); }
  k.add(ball(0.09, 14, 10), pale, { y: 0.24, z: 0.17, sz: 0.8 }); k.add(ball(0.032, 10, 8), dark, { y: 0.27, z: 0.25 });
  for (const s of [-1, 1]) { k.add(ball(0.09, 12, 10), fur, { x: s * 0.33, y: -0.02, rz: -s * 0.5, sy: 1.7 }); k.add(ball(0.11, 12, 10), fur, { x: s * 0.18, y: -0.42, sy: 1.2, sz: 1.3 }); }
}
function key(k, tint) {
  const m = metalOf(tint), thread = mk(MAT.ribbon, 0xb83a3a);
  k.add(loop(0.15, 0.04, TAU, 30, 8), m, { y: 0.4 }); k.add(post(0.034, 0.034, 0.7, 14), m, { y: -0.04 }); k.add(post(0.06, 0.06, 0.06, 14), m, { y: 0.28 });
  k.add(slab(0.12, 0.04, 0.05), m, { x: 0.08, y: -0.31 }); k.add(slab(0.09, 0.05, 0.05), m, { x: 0.065, y: -0.38 });
  k.add(loop(0.05, 0.01, TAU, 16, 5), thread, { y: 0.555, ry: HALF });
  k.add(wire([[0.01, 0.55, 0], [0.2, 0.62, 0.02], [0.3, 0.45, 0], [0.34, 0.2, 0.03]], 0.011, 20, 4), thread); k.add(wire([[-0.01, 0.55, 0], [-0.18, 0.64, 0], [-0.3, 0.5, 0.02], [-0.33, 0.28, 0.02]], 0.011, 20, 4), thread);
}
/** An open-end spanner head: a disc with a slot cut into its top. */
function jaw(R, nw) {
  const s = new THREE.Shape(), a = Math.asin(nw / R);
  s.absarc(0, 0, R, HALF + a, HALF - a + TAU, false); s.lineTo(nw, 0); s.lineTo(-nw, 0); s.closePath();
  return s;
}
/** `llave_dorada`: a gilded spanner, the year painted on its handle. */
function spanner(k, tint) {
  const m = metalOf(tint), paint = mk(MAT.ink, 0x4a3a10);
  k.add(cut(jaw(0.2, 0.085), 0.06, 0.012), m, { y: 0.44 }); k.add(cut(jaw(0.16, 0.068), 0.06, 0.012), m, { y: -0.46, rz: Math.PI });
  k.add(cut(rrect(0.15, 0.65, 0.07), 0.05, 0.012), m, { y: -0.025 });
  for (const y of [0.15, 0.09, 0.03]) k.add(slab(0.09, 0.012, 0.004), paint, { y, z: 0.04 });
  [1, 9, 9, 9].forEach((d, i) => seg7(k, d, -0.05 + i * 0.033, -0.12, 0.07, paint, 0.04));
}
function medal(k, tint) {
  const m = metalOf(tint);
  for (const s of [-1, 1]) k.add(slab(0.13, 0.447, 0.012), paper(s < 0 ? 0x2a4f9a : 0xf2f2ee), { x: s * 0.12, y: 0.4, rz: -s * 0.46 });
  k.add(loop(0.04, 0.01, TAU, 16, 5), m, { y: 0.2 });
  k.add(disc(0.24, 0.04, 40), m, { y: -0.08 }); k.add(loop(0.225, 0.016, TAU, 40, 6), m, { y: -0.08, z: 0.02 }); k.add(disc(0.15, 0.01, 32), m, { y: -0.08, z: 0.024 });
  for (let i = 0; i < 5; i++) k.add(slab(0.24, 0.026, 0.01), m, { y: -0.08, z: 0.032, rz: (i / 5) * Math.PI + HALF });
}
/** `trofeo_1994`: a trophy cup on a stepped base with a brass plate, one side of the cup dented. */
function trophy(k, tint) {
  const m = metalOf(tint), base = mk(MAT.dark, 0x2a2a2e);
  k.add(slab(0.62, 0.14, 0.34), base, { y: -0.43 }); k.add(slab(0.46, 0.06, 0.26), base, { y: -0.33 }); k.add(slab(0.34, 0.07, 0.006), MAT.brass, { y: -0.43, z: 0.173 });
  k.add(slab(0.2, 0.014, 0.004), MAT.ink, { y: -0.42, z: 0.178 }); k.add(slab(0.14, 0.012, 0.004), MAT.ink, { y: -0.45, z: 0.178 });
  k.add(post(0.04, 0.07, 0.2, 16), m, { y: -0.2 }); k.add(ball(0.07, 14, 10), m, { y: -0.1 });
  const cup = new THREE.LatheGeometry([[0.03, -0.05], [0.1, -0.02], [0.2, 0.1], [0.27, 0.28], [0.3, 0.45], [0.31, 0.5]].map(([r, y]) => new THREE.Vector2(r, y)), 40), p = cup.attributes.position;
  for (let i = 0; i < p.count; i++) {                                                                  // the dent: a hollow pushed in towards the axis
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d2 = (x - 0.14) ** 2 + (y - 0.3) ** 2 + (z - 0.25) ** 2, rr = Math.hypot(x, z) || 1;
    if (d2 < 0.04) { const pull = 0.06 * Math.exp(-d2 / 0.0035); p.setXYZ(i, x - (x / rr) * pull, y, z - (z / rr) * pull); }
  }
  cup.computeVertexNormals(); k.add(cup, m);
  k.add(loop(0.31, 0.02, TAU, 40, 6).rotateX(HALF), m, { y: 0.5 });
  k.add(loop(0.14, 0.022, Math.PI * 1.15, 18, 7), m, { x: 0.29, y: 0.24, rz: -Math.PI * 0.575 }); k.add(loop(0.14, 0.022, Math.PI * 1.15, 18, 7), m, { x: -0.29, y: 0.24, rz: Math.PI * 0.425 });
}
/** `canica_azul`: a glass marble with a cloud of paler bands in it. */
function marble(k, tint) {
  k.add(ball(0.5, 36, 24), mk(MAT.gem, tint));
  for (let i = 0; i < 3; i++) k.add(loop(0.5, 0.022, TAU, 36, 6), mk(MAT.gem, 0x9cc4ee), { rx: 0.7 + i * 0.45, ry: i * 1.1 });
}

// ------------------------------------------------------------------ the tables
/** One builder for each word of finds.js FIND_SHAPES: what a find of that shape looks like when nothing more is known. */
const FAMILY = { coin, watch, pocketwatch, ring, chain, roll, teeth: denture, deed, ticket, letter, map: treasureMap, shirt, knickers, jar, box, doll: bear, key, medal, photo, ball: marble };
/** A builder of its own for a find whose shape word is only the nearest of the twenty (finds.js): keyed by the find's id. */
const VARIANT = {
  moneda_chocolate: chocolateCoin, reloj_digital: digitalWatch, despertador: alarm, argolla: band, aretitos_bebe: babyEarrings, esmeralda: emerald, aretes_perlas: pearls,
  rosario_plata: rosary, rosario_comunion: rosary, mechon: lock, peluca: wig, bigote_postizo: moustache, rollo_sin_revelar: film, diente_oro: tooth,
  billete_olvidado: foldedNote, cheque_sin_cobrar: cheque, primer_billete: framedNote, carta_cinta: tiedLetter, tarjeta_agradecimiento: thanksCard,
  tapas_gaseosa: capsTin, perfume_viejo: perfume, pepita_oro: nugget, zapatitos_bebe: booties, diente_leche: toothBox, casete: cassette, gafas_cinta: glasses,
  baraja_sin_as: deck, album_estampas: album, milagritos: charms, llave_dorada: spanner, trofeo_1994: trophy,
};
/** The shape words with a family, and the finds with a builder of their own. */
export const GENERIC_SHAPES = Object.keys(FAMILY), GENERIC_FINDS = Object.keys(VARIANT);
/** Which builder draws this find: `find:<id>` (its own), `shape:<word>` (its family), or null (nothing: the hold-up declines). */
export const genericKind = ({ id, shape } = {}) => (VARIANT[id] ? `find:${id}` : FAMILY[shape] ? `shape:${shape}` : null);

/**
 * The close-up of a find as `{ parts: [{ geometry, matKey }], size: [w, h, d] }` (see the top of the file), its longest side `size` metres (default 5 cm), or null when its shape has no family and
 * the find no builder. Every call makes new geometry: the caller disposes it.
 */
export function genericModel({ id, shape, tint, size } = {}) {
  const build = VARIANT[id] ?? FAMILY[shape];
  if (!build) return null;
  const k = new Kit(); build(k, Number.isFinite(tint) ? tint : 0xc8c0b0, id);
  return k.finish(size > 0 ? size : 0.05);
}
