// Foliage sprite atlas, painted at boot with Canvas2D (no files, no network). One 1024x1024 RGBA texture, 4 x 4 tiles of 256 px,
// shared by every tree, shrub, tuft and vine (material `foliage`, alpha-tested, vertex-coloured). Returns null where there is no canvas
// (node tests). Transparent texels carry the tile's average colour so mip-mapping leaves no dark fringes.
export const TILE = { BROADLEAF: 0, EUCA: 1, FROND: 2, BANANA: 3, BOUGAIN: 4, TUFT: 5, FLOWERS: 6, AGAVE: 7, SHRUB: 8, CYPRESS: 9, VINE: 10, REED: 11, FLOWERING: 12 };

const SZ = 1024, T = 256;

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const mixc = (a, b, t) => {
  const r = (v, s) => (v >> s) & 255;
  const m = (s) => Math.round(r(a, s) + (r(b, s) - r(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
};

function leaf(g, x, y, rot, L, W, col, vein) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = hex(col);
  g.beginPath(); g.moveTo(0, -L / 2); g.quadraticCurveTo(W, -L * 0.08, 0, L / 2); g.quadraticCurveTo(-W, -L * 0.08, 0, -L / 2); g.fill();
  if (vein) { g.strokeStyle = hex(vein); g.globalAlpha = 0.5; g.lineWidth = Math.max(1, L * 0.05); g.beginPath(); g.moveTo(0, -L * 0.45); g.lineTo(0, L * 0.45); g.stroke(); g.globalAlpha = 1; }
  g.restore();
}

// ---------------------------------------------------------------------------------------------------- tile painters
const GREENS = [0x2c4a22, 0x3d6228, 0x4f7a30, 0x62893a, 0x7aa443, 0x8fb04a, 0xa7b94a];
function broadleaf(g, r, o = {}) {
  const n = o.n ?? 260, size = o.size ?? 0.11, spread = o.spread ?? 0.47;
  const pal = o.pal ?? GREENS;
  // a solid dark mass under the leaves, so the cluster reads as foliage rather than loose confetti
  g.fillStyle = hex(mixc(pal[0], 0x0e160c, 0.25));
  for (let i = 0; i < 46; i++) {
    const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next()) * spread * 0.78 * T, rr = r.range(0.07, 0.15) * T;
    g.beginPath(); g.ellipse(T / 2 + Math.cos(a) * d, T / 2 + Math.sin(a) * d * 0.9, rr, rr * 0.85, r.range(0, 3), 0, 6.28); g.fill();
  }
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < n / 3; i++) {
    const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next()) * spread * T, x = T / 2 + Math.cos(a) * d, y = T / 2 + Math.sin(a) * d * 0.92;
    if (r.chance(0.07)) continue;
    const up = 1 - y / T, lightK = pass / 2 * 0.55 + up * 0.45 + r.range(-0.12, 0.12);
    const idx = Math.max(0, Math.min(pal.length - 1, Math.round(lightK * (pal.length - 1))));
    const L = r.range(0.75, 1.2) * size * T;
    leaf(g, x, y, r.range(0, Math.PI * 2), L, L * r.range(0.36, 0.5), pal[idx], mixc(pal[idx], 0x1c2c14, 0.4));
  }
}

/** One sickle leaf hanging from (x, y): length L, bulge W, its tip pulled `bend` sideways, turned `tilt` from straight down, with a pale midrib. */
function sickle(g, x, y, tilt, L, W, bend, col) {
  g.save(); g.translate(x, y); g.rotate(tilt);
  g.fillStyle = hex(col);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(W + bend * 0.5, L * 0.5, bend, L); g.quadraticCurveTo(-W * 0.25 + bend * 0.5, L * 0.5, 0, 0); g.fill();
  g.strokeStyle = hex(mixc(col, 0xe8f0d8, 0.5)); g.globalAlpha = 0.55; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(W * 0.3 + bend * 0.5, L * 0.5, bend, L); g.stroke(); g.globalAlpha = 1;
  g.restore();
}

/** A weeping eucalyptus spray (R1-D04: the old tile was 38 fat grey strokes, "cards of hanging strips"): thin twigs hang from the branch across the top and each carries
 *  a couple of hundred small sickle leaves, blue-green on top and darker under, longer toward the tip. The card is 1.7 times taller than wide, so the leaves stretch. */
function eucalyptus(g, r) {
  const pal = [0x4f6f5c, 0x62846e, 0x78997e, 0x8fb08f, 0xa8c4a2], twigs = 12;
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) for (let k = 0; k < twigs; k++) {
    const x0 = T * (0.07 + 0.86 * (k + r.range(0.15, 0.85)) / twigs), y0 = T * r.range(0.02, 0.08), len = T * r.range(0.52, 0.9), sway = T * r.range(-0.09, 0.09), ph = r.range(0, 6);
    const tw = (t) => [x0 + sway * t * t + Math.sin(t * 6 + ph) * 2.5, y0 + len * t];
    if (pass === 0) {
      g.strokeStyle = hex(0x66543f); g.lineWidth = r.range(1.3, 2.2);
      g.beginPath(); g.moveTo(...tw(0)); for (let t = 0.05; t <= 1.001; t += 0.05) g.lineTo(...tw(t)); g.stroke();
    }
    const nl = Math.round(len / 4.4);
    for (let i = 1; i <= nl; i++) {
      const t = i / nl, [x, y] = tw(t), side = (i + k) % 2 ? 1 : -1, lo = pass === 0;
      const L = T * r.range(0.04, 0.068) * (0.75 + 0.5 * t), idx = Math.max(0, Math.min(4, Math.floor((lo ? 0.05 : 0.4) * 5 + r.next() * (lo ? 2.4 : 2.6) + (1 - t) * 0.6)));
      sickle(g, x + side * r.range(0, 2), y, side * r.range(0.2, 0.8), L, r.range(2.6, 4.2), side * r.range(2, 6), pal[idx]);
    }
  }
  g.strokeStyle = hex(0x6d5f50); g.lineWidth = 4;
  g.beginPath(); g.moveTo(0.1 * T, 0.03 * T); g.quadraticCurveTo(0.5 * T, 0.12 * T, 0.92 * T, 0.02 * T); g.stroke();
}

function frond(g, r) {
  g.lineCap = 'round';
  const bend = r.range(0.04, 0.09) * T, bx = (t) => T / 2 + bend * (t * t) * 3 - bend * 0.5, by = (t) => T * (0.97 - 0.94 * t);
  g.strokeStyle = hex(0x9aa860); g.lineWidth = 4;
  g.beginPath(); g.moveTo(bx(0), by(0)); for (let t = 0.05; t <= 1.001; t += 0.05) g.lineTo(bx(t), by(t)); g.stroke();
  for (let t = 0.06; t < 0.99; t += 0.02) {
    const len = T * 0.5 * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * t)), 0.7) * (1 - 0.3 * t), x = bx(t), y = by(t);
    for (const s of [-1, 1]) {
      const ang = s * (0.95 - 0.35 * t) + (r.next() - 0.5) * 0.12, droop = 0.35 + 0.35 * t;
      const ex = x + Math.sin(ang) * len, ey = y - Math.cos(ang) * len * 0.45 + len * droop * 0.6;
      g.strokeStyle = hex(r.pick([0x3f6a2c, 0x4b7a31, 0x5b8a3a, 0x376026]));
      g.lineWidth = 4.2 - 1.8 * t;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.sin(ang) * len * 0.6, y - Math.cos(ang) * len * 0.35, ex, ey); g.stroke();
    }
  }
}

function banana(g, r) {
  const cx = T / 2;
  const grad = g.createLinearGradient(0, 0, T, 0); grad.addColorStop(0, '#4f8a2c'); grad.addColorStop(0.5, '#6aa63a'); grad.addColorStop(1, '#4c8228');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(cx, T * 0.98);
  g.bezierCurveTo(cx - T * 0.46, T * 0.78, cx - T * 0.5, T * 0.2, cx - T * 0.04, T * 0.03);
  g.lineTo(cx + T * 0.04, T * 0.03);
  g.bezierCurveTo(cx + T * 0.5, T * 0.2, cx + T * 0.46, T * 0.78, cx, T * 0.98); g.fill();
  g.strokeStyle = 'rgba(40,90,30,0.55)'; g.lineWidth = 1.4;
  for (let i = 0; i < 16; i++) {
    const t = 0.1 + i * 0.054, y = T * (0.98 - 0.94 * t), w = T * 0.42 * Math.sin(Math.PI * (0.05 + 0.9 * t)) ** 0.8;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx, y); g.lineTo(cx + s * w, y - T * 0.07); g.stroke(); }
  }
  g.strokeStyle = '#b6cf72'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, T * 0.98); g.lineTo(cx, T * 0.04); g.stroke();
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 3; g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const t = r.range(0.2, 0.9), y = T * (0.98 - 0.94 * t), s = r.chance(0.5) ? 1 : -1, w = T * 0.42 * Math.sin(Math.PI * (0.05 + 0.9 * t)) ** 0.8;
    g.beginPath(); g.moveTo(cx + s * w * 1.1, y - T * 0.05); g.lineTo(cx + s * w * 0.55, y - T * 0.02); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
}

function bougainvillea(g, r) {
  broadleaf(g, r, { n: 120, size: 0.07, spread: 0.48, pal: [0x2d5226, 0x3f6b2e, 0x4f7e36, 0x63903d] });
  const cols = [0xd3207a, 0xe04a9a, 0xc41a6c, 0xf06aa8, 0xe03a86];
  for (let i = 0; i < 150; i++) {
    const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next()) * 0.47 * T, x = T / 2 + Math.cos(a) * d, y = T / 2 + Math.sin(a) * d * 0.92;
    const c = r.pick(cols), s = r.range(5, 9);
    g.fillStyle = hex(c);
    for (let k = 0; k < 3; k++) { const th = r.range(0, 6.28); g.beginPath(); g.ellipse(x + Math.cos(th) * s * 0.5, y + Math.sin(th) * s * 0.5, s * 0.55, s * 0.4, th, 0, 6.28); g.fill(); }
    g.fillStyle = hex(0xf6e9a0); g.beginPath(); g.arc(x, y, 1.4, 0, 6.28); g.fill();
  }
}

function tuft(g, r) {
  const pal = [0x5f8433, 0x73963c, 0x88a748, 0xa3b455, 0xb9b45f, 0x4a6e2b];
  for (let i = 0; i < 64; i++) {
    const x0 = T / 2 + r.range(-0.3, 0.3) * T, lean = r.range(-0.22, 0.22) * T + (x0 - T / 2) * 0.55, h = r.range(0.28, 0.78) * T * (1 - 0.35 * Math.abs(x0 - T / 2) / (0.3 * T)), w = r.range(4, 8);
    const tx = x0 + lean, ty = T - h, c = r.pick(pal);
    g.fillStyle = hex(c);
    g.beginPath(); g.moveTo(x0 - w / 2, T); g.quadraticCurveTo(x0 + lean * 0.2, T - h * 0.55, tx, ty); g.quadraticCurveTo(x0 + lean * 0.35 + w * 0.2, T - h * 0.5, x0 + w / 2, T); g.fill();
  }
}

/** One flower head at (x, y), radius about s: six petals with a shaded back row, a yellow eye with a dark heart. */
function bloom(g, x, y, s, col) {
  const n = 6, rot = x * 0.37 + y * 0.21;
  g.fillStyle = hex(mixc(col, 0x000000, 0.3));
  for (let k = 0; k < n; k++) { const th = (k / n) * 6.283 + rot; g.beginPath(); g.ellipse(x + Math.cos(th) * s * 0.5, y + Math.sin(th) * s * 0.5 + s * 0.12, s * 0.52, s * 0.31, th, 0, 6.283); g.fill(); }
  g.fillStyle = hex(col);
  for (let k = 0; k < n; k++) { const th = (k / n) * 6.283 + rot; g.beginPath(); g.ellipse(x + Math.cos(th) * s * 0.48, y + Math.sin(th) * s * 0.48, s * 0.5, s * 0.29, th, 0, 6.283); g.fill(); }
  g.fillStyle = hex(0xeab524); g.beginPath(); g.arc(x, y, s * 0.27, 0, 6.283); g.fill();
  g.fillStyle = hex(0x7a4a14); g.beginPath(); g.arc(x + s * 0.04, y + s * 0.04, s * 0.11, 0, 6.283); g.fill();
}

/** A flower bed (R1-D04: "dark blobs with confetti dots"): a low mound of bright leaves, dark under and light on top, and six clusters of marigold, geranium and
 *  daisy heads, one colour to a cluster, each head with its own petals. */
function flowers(g, r) {
  const greens = [0x33582a, 0x437232, 0x558a3b, 0x6c9f46, 0x88b454];
  g.fillStyle = hex(0x244020);                                                           // a dark core, so the gaps between leaves are shade
  g.beginPath(); g.ellipse(T / 2, T * 0.66, T * 0.34, T * 0.2, 0, 0, 6.283); g.fill();
  for (let i = 0; i < 170; i++) {
    const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next()) * 0.46 * T, x = T / 2 + Math.cos(a) * d, y = T * 0.64 + Math.sin(a) * d * 0.6;
    const up = 1 - y / T, k = Math.max(0, Math.min(4, Math.round((0.1 + up * 0.5 + r.range(-0.2, 0.3)) * 4)));
    leaf(g, x, y, r.range(-1.1, 1.1) + (x < T / 2 ? -0.3 : 0.3), r.range(20, 32), r.range(7, 11), greens[k], mixc(greens[k], 0x172b10, 0.4));
  }
  const cols = [0xf08a1c, 0xf5c21f, 0xd9301f, 0xe96a98, 0xf4efe3, 0x8a5cc4, 0xf2a02a];
  for (let c = 0; c < 6; c++) {
    const col = r.pick(cols), cx = T / 2 + r.range(-0.28, 0.28) * T, cy = T * 0.56 + r.range(-0.1, 0.1) * T;
    for (let i = r.int(4, 7); i > 0; i--) {
      const x = cx + r.range(-0.13, 0.13) * T, y = cy + r.range(-0.1, 0.1) * T;
      bloom(g, x, y, r.range(7.5, 12), mixc(col, r.chance(0.5) ? 0xffffff : 0x000000, r.range(0, 0.18)));
    }
  }
}

function agave(g, r) {
  const cx = T / 2, by = T * 0.97;
  const n = 13;
  for (let i = 0; i < n; i++) {
    const k = (i / (n - 1)) * 2 - 1, ang = k * 1.25 + r.range(-0.08, 0.08), len = T * (0.78 - 0.32 * Math.abs(k)) * r.range(0.9, 1.05), w = T * r.range(0.05, 0.07);
    const tx = cx + Math.sin(ang) * len, ty = by - Math.cos(ang) * len * 0.95;
    const c = mixc(0x5f8f80, 0x8fbaa6, r.next());
    g.fillStyle = hex(c);
    g.beginPath(); g.moveTo(cx - w, by); g.quadraticCurveTo(cx + Math.sin(ang) * len * 0.5 - w * 1.6, by - Math.cos(ang) * len * 0.5, tx, ty);
    g.quadraticCurveTo(cx + Math.sin(ang) * len * 0.5 + w * 1.6, by - Math.cos(ang) * len * 0.5, cx + w, by); g.fill();
    g.strokeStyle = hex(mixc(c, 0x2a3a30, 0.5)); g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, by); g.lineTo(tx, ty); g.stroke();
    g.fillStyle = hex(0x5a3a28); g.beginPath(); g.arc(tx, ty, 2.2, 0, 6.28); g.fill();
  }
}

const CYPRESS_ASPECT = 0.425;       // a cypress card is 0.425 times as wide as it is tall (flora.js cypress): the tile is painted in world proportions, x stretched by 1 / this

/** An Italian cypress (R1-D04: the old tile was 620 round dots, "polka-dot cones"): a dark flame of upswept sprays, shaded from the left foot to the lit right tip. */
function cypress(g, r) {
  const pal = [0x1f3b25, 0x2a4a2c, 0x33603a, 0x3f7244, 0x4f8750, 0x62984f, 0x7aa85a];
  g.save(); g.translate(T / 2, 0); g.scale(1 / CYPRESS_ASPECT, 1);                       // x in metres-ish, y down from the tip: both in the same unit
  const V0 = 18, hw = (v) => { const t = (v - V0) / (T - V0); return 30 * Math.min(1, Math.pow(Math.sin(Math.min(1, Math.max(0, t) * 2.2) * Math.PI / 2), 0.9)) * (1 - 0.2 * Math.max(0, t - 0.86) / 0.14); };   // the tip sits below the tile's top edge
  g.fillStyle = hex(0x1b3320);                                                           // the flame in deep green, so the gaps between sprays are shade, not sky
  g.beginPath(); g.moveTo(0, V0);
  for (let v = V0; v <= T - 4; v += 6) g.lineTo(hw(v) * 0.92, v);
  for (let v = T - 4; v >= V0; v -= 6) g.lineTo(-hw(v) * 0.92, v);
  g.fill();
  g.lineCap = 'round';
  for (let i = 0; i < 1100; i++) {
    const t = Math.pow(r.next(), 0.85), v = V0 + (T - V0 - 3) * t, w = hw(v), x = r.range(-1, 1) * w * 0.95, side = w > 1 ? x / w : 0;
    const lit = 0.45 + 0.28 * side + 0.2 * (1 - t) + r.range(-0.18, 0.18), idx = Math.max(0, Math.min(pal.length - 1, Math.round(lit * (pal.length - 1))));
    const a = -Math.PI / 2 + side * 0.5 + r.range(-0.35, 0.35), len = r.range(8, 15), cx = Math.cos(a) * len, cz = Math.sin(a) * len;
    g.strokeStyle = hex(pal[idx]); g.lineWidth = r.range(2.2, 3.8);
    g.beginPath(); g.moveTo(x, v); g.quadraticCurveTo(x + cx * 0.5 + r.range(-1.5, 1.5), v + cz * 0.5, x + cx, v + cz); g.stroke();
  }
  g.restore();
}

/** Ivy / hanging vine: wavy vertical strands carrying leaves, dense at the top, ragged at the bottom. */
function vine(g, r) {
  const pal = [0x2e5424, 0x3e6b2c, 0x538235, 0x6a9a40, 0x7bab48];
  for (let s = 0; s < 15; s++) {
    const x0 = r.range(0.04, 0.96) * T, len = r.range(0.45, 0.98) * T, ph = r.range(0, 6.28), amp = r.range(0.01, 0.04) * T;
    g.strokeStyle = hex(0x3a5a2a); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, 0);
    for (let y = 0; y <= len; y += 6) g.lineTo(x0 + Math.sin(ph + y * 0.05) * amp, y);
    g.stroke();
    for (let y = 2; y < len; y += r.range(5, 8)) {
      const x = x0 + Math.sin(ph + y * 0.05) * amp + r.range(-5, 5), L = r.range(0.07, 0.11) * T, c = pal[Math.min(4, Math.floor(r.next() * 4 + (1 - y / T) * 1.2))];
      leaf(g, x, y, r.range(0, Math.PI * 2), L, L * r.range(0.4, 0.55), c, null);
    }
  }
  g.fillStyle = hex(0x2e5424); g.fillRect(0, 0, T, 9);
}

function reed(g, r) {
  const pal = [0xa9b45c, 0xc2c070, 0xd8d08a, 0x8fa24c];
  for (let i = 0; i < 24; i++) {
    const x0 = T / 2 + r.range(-0.2, 0.2) * T, tx = x0 + r.range(-0.3, 0.3) * T, ty = T * r.range(0.04, 0.35);
    g.strokeStyle = hex(r.pick(pal)); g.lineWidth = r.range(2, 3.5); g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, T); g.quadraticCurveTo(x0 + (tx - x0) * 0.2, T * 0.5, tx, ty); g.stroke();
    g.fillStyle = hex(0xe9dfc0); g.beginPath(); g.ellipse(tx, ty, 5, 14, Math.atan2(tx - x0, T - ty) * 0.6, 0, 6.28); g.fill();
  }
}

/** A canopy in bloom: pale blossoms over dark leaves, meant to be tinted by vertex colour (yellow guayacan, pink, orange). */
function flowering(g, r) {
  broadleaf(g, r, { n: 90, size: 0.07, spread: 0.45, pal: [0x35582a, 0x466e32, 0x5a8539] });
  for (let i = 0; i < 300; i++) {
    const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next()) * 0.46 * T, x = T / 2 + Math.cos(a) * d, y = T / 2 + Math.sin(a) * d * 0.92, s = r.range(3.5, 7.5);
    g.fillStyle = hex(mixc(0xdedbd4, 0xffffff, r.next())); g.beginPath(); g.ellipse(x, y, s, s * 0.75, r.range(0, 3), 0, 6.28); g.fill();
  }
}

const PAINT = [
  (g, r) => broadleaf(g, r), (g, r) => eucalyptus(g, r), frond, banana, bougainvillea, tuft, flowers, agave,
  (g, r) => broadleaf(g, r, { n: 300, size: 0.075, spread: 0.46, pal: [0x35582a, 0x466e32, 0x5a8539, 0x6f9a44] }), cypress, vine, reed, flowering,
];

/** Paint one tile on `g`, whose origin is the tile's top-left corner, from the stream the atlas gives that tile. The atlas calls this, and so can a test with a recording context. */
export function paintTile(g, tile, rng) { PAINT[tile](g, rng.fork('sprite:' + tile)); }

/** Chain-link: a 64 px tile of diamond mesh, transparent between the wires (repeats every 0.4 m). Null without a canvas. */
export function makeFenceTexture(THREE) {
  const cv = makeCanvas(64, 64); if (!cv) return null;
  const g = cv.getContext('2d', { willReadFrequently: true }); if (!g) return null;
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#d4d8dc'; g.lineWidth = 3; g.lineCap = 'butt';
  for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 + 64, 64); g.stroke(); }          // x - y = const
  for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32 - 64, 64); g.stroke(); }          // x + y = const
  const d = g.getImageData(0, 0, 64, 64).data, out = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) {
    const a = d[i * 4 + 3];
    out[i * 4] = a < 8 ? 205 : d[i * 4]; out[i * 4 + 1] = a < 8 ? 210 : d[i * 4 + 1]; out[i * 4 + 2] = a < 8 ? 214 : d[i * 4 + 2]; out[i * 4 + 3] = a;
  }
  const tex = new THREE.DataTexture(out, 64, 64, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.needsUpdate = true;
  return tex;
}

/** Paint the atlas. Returns { texture, uv(tile) -> [u0,v0,u1,v1], canvas } or null without a canvas. */
export function makeFoliageAtlas(THREE, rng) {
  const cv = makeCanvas(SZ, SZ); if (!cv) return null;
  const g = cv.getContext('2d', { willReadFrequently: true }); if (!g) return null;
  g.clearRect(0, 0, SZ, SZ);
  for (let i = 0; i < PAINT.length; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    g.save(); g.translate(col * T, row * T); g.beginPath(); g.rect(2, 2, T - 4, T - 4); g.clip();
    paintTile(g, i, rng); g.restore();
  }
  const img = g.getImageData(0, 0, SZ, SZ), d = img.data, out = new Uint8Array(SZ * SZ * 4);
  // average colour per tile (opaque texels) -> written into transparent texels; rows flipped so v = 1 - y/SZ
  const avg = [];
  for (let t = 0; t < 16; t++) {
    const x0 = (t % 4) * T, y0 = Math.floor(t / 4) * T; let sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = y0; y < y0 + T; y += 2) for (let x = x0; x < x0 + T; x += 2) { const k = (y * SZ + x) * 4; if (d[k + 3] > 200) { sr += d[k]; sg += d[k + 1]; sb += d[k + 2]; n++; } }
    avg.push(n ? [sr / n, sg / n, sb / n] : [80, 110, 60]);
  }
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
    const k = (y * SZ + x) * 4, o = ((SZ - 1 - y) * SZ + x) * 4, a = d[k + 3], av = avg[Math.floor(y / T) * 4 + Math.floor(x / T)];
    if (a < 10) { out[o] = av[0]; out[o + 1] = av[1]; out[o + 2] = av[2]; out[o + 3] = 0; }
    else { out[o] = d[k]; out[o + 1] = d[k + 1]; out[o + 2] = d[k + 2]; out[o + 3] = a; }
  }
  const tex = new THREE.DataTexture(out, SZ, SZ, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 4; tex.needsUpdate = true;
  const e = 1.5 / SZ;
  return {
    texture: tex, canvas: cv,
    uv(i) { const col = i % 4, row = Math.floor(i / 4); return [col / 4 + e, 1 - (row + 1) / 4 + e, (col + 1) / 4 - e, 1 - row / 4 - e]; },
  };
}
