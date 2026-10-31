// Outdoor lettering and paint (A5): three murals painted straight onto the tall retaining walls (6-8 m wide, 3 m+ tall, weathered, ragged brush edge, no frame),
// the welcome boards on the gate arch, a blue street-name plaque on an iron post at the start of every street, hand-painted boards (garden, eggs, thanks) and the
// chalk hopscotch on the Almendros plaza. Shop fascias, blades, ghost signs and posters are A2's (arch/signs.js, material `sign_atlas`); this is the other,
// separate pair of atlases: material `world_sign` (2048 x 1024: boards, plaques, chalk, the posters and tags of the perimeter walls) and `world_mural` (1024 x 1560: the three paintings, 1024 x 512 each).
// Painted at boot (Canvas2D -> DataTexture, rows flipped so v = 1 - y/H, like the foliage atlas). Under Node there is no canvas:
// K.signs stays null and every panel is a flat tinted board, so the placement code (and its tests) run the same everywhere.
import * as THREE from 'three';
import { OCC } from './occupancy.js';
import { tube } from './mk.js';
import { pointAt } from './geom.js';

const AW = 2048, AH = 1024;
const FONT = '"Arial Black", "Segoe UI Black", Impact, "Helvetica Neue", Arial, sans-serif';
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Marker Felt", cursive';
const FLAT = { mural: [0.55, 0.45, 0.4], gate: [0.92, 0.88, 0.72], plaque: [0.12, 0.3, 0.62], hand: [0.72, 0.6, 0.4], rayuela: [0.92, 0.92, 0.88] };

/** region of the sign atlas per key: [x, y, w, h] in canvas pixels (8 px gutters between regions). The murals have an atlas of their own (below). */
const REGION = {
  'gate.in': [8, 8, 1000, 128], 'gate.out': [1032, 8, 1000, 128],
  'hand.huerta': [8, 152, 500, 128], 'hand.huevos': [524, 152, 500, 128], 'hand.gracias': [1040, 152, 500, 128], 'hand.mirador': [1556, 152, 480, 128],
  'rayuela': [1872, 296, 140, 360],
};
const PLAQUES = 28;                                                     // 7 to a row, 4 rows: the street-name plaques (plaque i = street i)
const plaqueRegion = (i) => (i >= 0 && i < PLAQUES ? [8 + (i % 7) * 264, 296 + Math.floor(i / 7) * 72, 256, 64] : undefined);
// R1-D02: what is pasted and sprayed on the inside of the perimeter wall, in the rows under the plaques: paper posters (216 x 312 px, 0.34 x 0.49 m) and sprayed tags (300 x 150 px, 0.9 x 0.45 m).
// How many of each there are is the length of POSTERS and TAG_ART below (PAPERS, TAGS), so a region exists exactly for a painted key.
const paperRegion = (i) => (i >= 0 && i < PAPERS ? [8 + i * 224, 696, 216, 312] : undefined);
const tagRegion = (i) => (i >= 0 && i < TAGS ? [8 + PAPERS * 224 + i * 308, 696, 300, 150] : undefined);
const regionOf = (key) => (key.startsWith('plaque.') ? plaqueRegion(+key.slice(7)) : key.startsWith('poster.') ? paperRegion(+key.slice(7)) : key.startsWith('tag.') ? tagRegion(+key.slice(4)) : REGION[key]);

// the murals: one 1024 x 512 region each, stacked with 8 px gutters (in the order of ART below)
const MW = 1024, MH = 512, MGAP = 8;
const muralRegion = (key) => { const i = ART.findIndex((a) => a.key === key); return i < 0 ? undefined : [0, i * (MH + MGAP), MW, MH]; };
/** [u0, vBottom, u1, vTop] of a region of a W x H atlas, half a texel inside; a key with no region is a bug, so it throws with the key's name */
const uvIn = (reg, W, H, key) => {
  if (!reg) throw new Error(`sign atlas: no region for "${key}"`);
  const [x, y, w, h] = reg, e = 0.75;
  return [(x + e) / W, 1 - (y + h - e) / H, (x + w - e) / W, 1 - (y + e) / H];
};

// ---------------------------------------------------------------------------------------------------- painting helpers
function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}
const rng32 = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
const poly = (g, pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill(); };
const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
function fit(g, s, maxW, size, min = 10, fam = FONT) {
  let z = size; g.font = `bold ${z}px ${fam}`;
  while (g.measureText(s).width > maxW && z > min) { z -= 2; g.font = `bold ${z}px ${fam}`; }
  return z;
}
function text(g, s, x, y, size, fill, o = {}) {
  g.font = `bold ${size}px ${o.fam ?? FONT}`; g.textAlign = o.align ?? 'center'; g.textBaseline = 'middle';
  if (o.stroke) { g.lineWidth = o.sw ?? Math.max(2, size * 0.12); g.strokeStyle = o.stroke; g.lineJoin = 'round'; g.strokeText(s, x, y); }
  g.fillStyle = fill; g.fillText(s, x, y);
}
function banner(g, w, y, h, s, bg, fg, edge) {
  poly(g, [[14, y], [w - 14, y], [w - 28, y + h / 2], [w - 14, y + h], [14, y + h], [28, y + h / 2]], edge);
  poly(g, [[20, y + 3], [w - 20, y + 3], [w - 33, y + h / 2], [w - 20, y + h - 3], [20, y + h - 3], [33, y + h / 2]], bg);
  const sz = fit(g, s, w - 120, h * 0.6, 12); text(g, s, w / 2, y + h / 2 + 1, sz, fg);
}
/** The banner of a mural painted on the part `v` = { x0, w } of its 640 x 320 scene (a picture narrower than 2:1 shows only that part), so its ends are not cropped. */
function viewBanner(g, v, ...a) { g.save(); g.translate(v.x0, 0); banner(g, v.w, ...a); g.restore(); }
const FULL = { x0: 0, w: 640 };

// ---------------------------------------------------------------------------------------------------- the murals (drawn on 640 x 320, painted at 1.6x onto 1024 x 512, then weathered)
function paintCondor(g, w, h, v = FULL) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#173a73'); sky.addColorStop(0.5, '#c9573a'); sky.addColorStop(0.78, '#f2a43e'); sky.addColorStop(1, '#f7d070');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const sx = 470, sy = 170;
  for (let i = 0; i < 28; i++) {
    g.save(); g.translate(sx, sy); g.rotate((i / 28) * Math.PI * 2);
    g.fillStyle = i % 2 ? 'rgba(255,224,110,0.55)' : 'rgba(255,170,60,0.45)';
    g.beginPath(); g.moveTo(52, -7); g.lineTo(230, -16); g.lineTo(230, 16); g.lineTo(52, 7); g.closePath(); g.fill(); g.restore();
  }
  g.fillStyle = '#ffd04a'; circle(g, sx, sy, 56); g.fillStyle = '#ffe98c'; circle(g, sx, sy, 40);
  const snow = (x, y, s) => poly(g, [[x, y], [x - s, y + s * 1.1], [x - s * 0.35, y + s * 0.8], [x, y + s * 1.2], [x + s * 0.4, y + s * 0.8], [x + s, y + s * 1.1]], '#f4f1ea');
  poly(g, [[0, 235], [60, 190], [110, 215], [175, 150], [240, 220], [310, 185], [380, 230], [450, 165], [520, 215], [585, 180], [640, 225], [640, h], [0, h]], '#6b4f9a');
  snow(175, 150, 22); snow(450, 165, 24); snow(585, 180, 14);
  poly(g, [[0, 270], [80, 232], [150, 262], [230, 238], [320, 276], [410, 244], [500, 272], [570, 246], [640, 268], [640, h], [0, h]], '#3a3070');
  // the condor: two fingered wings, white ruff, bare red head
  const cx = 240, cy = 118, ink = '#16141a';
  const wing = (dir) => {
    const X = (x) => cx + dir * x;
    g.beginPath(); g.moveTo(X(14), cy - 6);
    g.bezierCurveTo(X(70), cy - 62, X(150), cy - 78, X(222), cy - 46);
    g.lineTo(X(232), cy - 22); g.lineTo(X(208), cy - 30); g.lineTo(X(226), cy - 2); g.lineTo(X(196), cy - 14);
    g.lineTo(X(208), cy + 18); g.lineTo(X(176), cy + 2); g.lineTo(X(180), cy + 30); g.lineTo(X(148), cy + 12);
    g.lineTo(X(146), cy + 40); g.lineTo(X(114), cy + 20); g.lineTo(X(108), cy + 46); g.lineTo(X(76), cy + 26);
    g.lineTo(X(66), cy + 50); g.lineTo(X(36), cy + 34); g.lineTo(X(20), cy + 52); g.closePath();
    g.fillStyle = ink; g.fill();
    g.strokeStyle = '#efe9dc'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(X(60), cy - 8); g.bezierCurveTo(X(100), cy - 22, X(140), cy - 18, X(170), cy - 4); g.stroke();
  };
  wing(-1); wing(1);
  g.fillStyle = ink; g.beginPath(); g.ellipse(cx, cy + 10, 22, 52, 0, 0, Math.PI * 2); g.fill();
  poly(g, [[cx - 20, cy + 50], [cx - 34, cy + 112], [cx, cy + 96], [cx + 34, cy + 112], [cx + 20, cy + 50]], ink);
  g.fillStyle = '#f2eee4'; g.beginPath(); g.ellipse(cx, cy - 36, 21, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c47a66'; circle(g, cx, cy - 52, 13);
  poly(g, [[cx + 6, cy - 54], [cx + 24, cy - 50], [cx + 12, cy - 42]], '#d8c070');
  g.fillStyle = ink; circle(g, cx + 5, cy - 56, 2.4);
  // the barrio under the mountains
  g.fillStyle = '#2a2336'; g.fillRect(0, 262, w, 58);
  const hc = ['#e4572e', '#f0b429', '#3b8ea5', '#9bc53d', '#c3423f', '#6a4c93', '#f28f3b'];
  for (let i = 0, x = -10; x < w; i++, x += 42 + (i % 3) * 8) {
    const hh = 22 + ((i * 7) % 5) * 6; g.fillStyle = hc[i % hc.length]; g.fillRect(x, 284 - hh, 38, hh + 40);
    g.fillStyle = '#21202b'; g.fillRect(x + 8, 284 - hh + 7, 8, 10); g.fillRect(x + 22, 284 - hh + 7, 8, 10);
  }
  viewBanner(g, v, 268, 44, 'LIBRES COMO EL CÓNDOR', '#f4ecd8', '#4a1f1f', '#2a2220');
}

function paintFiesta(g, w, h, v = FULL) {
  const R = rng32(7);
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0a2f4a'); bg.addColorStop(0.6, '#116a78'); bg.addColorStop(1, '#1c8a7a');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,${200 + (i % 3) * 20},120,${0.1 + R() * 0.12})`; circle(g, R() * w, 70 + R() * 160, 10 + R() * 22); }
  const cols = ['#ff4f79', '#ffd23f', '#3bceac', '#ff8c42', '#7bdff2', '#b388eb'];
  for (let k = 0; k < 2; k++) {
    const y0 = 28 + k * 26, sag = 22;
    g.strokeStyle = '#101216'; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x <= w; x += 8) { const t = x / w, y = y0 + sag * 4 * t * (1 - t); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    for (let x = 14, i = 0; x < w - 10; x += 26, i++) { const t = x / w, y = y0 + sag * 4 * t * (1 - t); poly(g, [[x - 11, y], [x + 11, y], [x, y + 26 + (i % 3) * 3]], cols[(i + k * 2) % cols.length]); }
  }
  const dancer = (x, skirt, blouse, band, up) => {
    g.save(); g.translate(x, 0);
    g.lineCap = 'round'; g.strokeStyle = '#b97a4e'; g.lineWidth = 11;
    g.beginPath(); g.moveTo(-15, 138); g.lineTo(-44, up ? 96 : 168); g.moveTo(15, 138); g.lineTo(44, up ? 168 : 96); g.stroke();
    g.strokeStyle = '#15110f'; g.lineWidth = 6; g.beginPath(); g.moveTo(-13, 112); g.quadraticCurveTo(-24, 150, -17, 186); g.moveTo(13, 112); g.quadraticCurveTo(24, 150, 17, 186); g.stroke();
    g.fillStyle = blouse; rrect(g, -19, 124, 38, 52, 10); g.fill();
    g.fillStyle = skirt; g.beginPath(); g.moveTo(-18, 170); g.lineTo(18, 170); g.quadraticCurveTo(52, 214, 70, 262); g.quadraticCurveTo(0, 284, -70, 262); g.quadraticCurveTo(-52, 214, -18, 170); g.closePath(); g.fill();
    g.strokeStyle = band; g.lineWidth = 7;
    for (const [y, k] of [[210, 0.55], [233, 0.72], [254, 0.92]]) { g.beginPath(); g.moveTo(-70 * k, y); g.quadraticCurveTo(0, y + 10, 70 * k, y); g.stroke(); }
    g.fillStyle = '#c68c5a'; circle(g, 0, 104, 17);
    g.fillStyle = '#3a2a22'; g.beginPath(); g.ellipse(0, 90, 24, 7, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(0, 80, 14, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#15110f'; circle(g, -6, 106, 2); circle(g, 6, 106, 2);
    g.strokeStyle = '#7a2e2a'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 111, 6, 0.2, Math.PI - 0.2); g.stroke();
    g.fillStyle = '#1d1a1a'; g.fillRect(-26, 262, 22, 8); g.fillRect(6, 262, 22, 8);
    g.restore();
  };
  dancer(120, '#e63946', '#ffd166', '#06d6a0', 0); dancer(262, '#8338ec', '#ff9f1c', '#ffd166', 1);
  dancer(404, '#06a77d', '#f72585', '#ffd23f', 0); dancer(540, '#ff6b35', '#4cc9f0', '#f7f7f7', 1);
  for (let i = 0; i < 70; i++) { g.fillStyle = cols[i % cols.length]; circle(g, R() * w, 60 + R() * 200, 1.6 + R() * 2.4); }
  viewBanner(g, v, 276, 38, 'FIESTA DE LA LADERA', '#ffd23f', '#7b1e3a', '#2a2220');
}

function paintCerro(g, w, h, v = FULL) {
  const R = rng32(11);
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#7cc4ec'); sky.addColorStop(1, '#e9f4d4'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffe566'; circle(g, 76, 66, 32); g.strokeStyle = '#ffd23f'; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.moveTo(76 + Math.cos(a) * 42, 66 + Math.sin(a) * 42); g.lineTo(76 + Math.cos(a) * 58, 66 + Math.sin(a) * 58); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (const [cx, cy] of [[250, 60], [430, 44], [545, 92]]) { circle(g, cx, cy, 20); circle(g, cx + 22, cy + 4, 16); circle(g, cx - 22, cy + 6, 15); g.fillRect(cx - 30, cy + 6, 60, 14); }
  poly(g, [[0, 190], [90, 140], [200, 120], [330, 150], [450, 120], [560, 150], [640, 130], [640, h], [0, h]], '#6bb36a');
  poly(g, [[0, 235], [120, 195], [260, 185], [380, 215], [520, 190], [640, 210], [640, h], [0, h]], '#4f9a56');
  poly(g, [[0, 285], [150, 250], [320, 262], [470, 244], [640, 270], [640, h], [0, h]], '#3d8446');
  g.strokeStyle = '#f3d98b'; g.lineWidth = 9; g.beginPath(); g.moveTo(330, 150); g.bezierCurveTo(380, 180, 280, 205, 330, 232); g.bezierCurveTo(380, 252, 260, 270, 300, 312); g.stroke();
  const hc = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#c77dff', '#ffe5b4'];
  for (let i = 0; i < 46; i++) {
    const x = 20 + R() * 560, row = Math.floor(R() * 3), y = 150 + row * 44 + R() * 28 - Math.abs(x - 330) * 0.06, s = 15 + R() * 10;
    g.fillStyle = hc[Math.floor(R() * hc.length)]; g.fillRect(x, y, s * 1.3, s);
    poly(g, [[x - 2, y], [x + s * 0.65, y - s * 0.45], [x + s * 1.3 + 2, y]], '#8a4b32');
    g.fillStyle = '#2b2a33'; g.fillRect(x + s * 0.2, y + s * 0.35, s * 0.28, s * 0.35);
  }
  g.fillStyle = '#6b4a2f'; g.fillRect(578, 150, 12, 70);
  g.fillStyle = '#2f7d3a'; circle(g, 584, 130, 38); circle(g, 556, 150, 26); circle(g, 612, 148, 26);
  g.fillStyle = '#f28c28'; for (const [x, y] of [[570, 118], [598, 126], [560, 150], [612, 152], [585, 142], [578, 98]]) circle(g, x, y, 5);
  viewBanner(g, v, 272, 40, 'LA LADERA ES NUESTRA', '#fff3c4', '#1f5f3a', '#2a2220');
}

/**
 * The three paintings: atlas key, discovery id and texts, painter, the scene x (of 640) to keep centred when the picture is narrower than 2:1, weathering seed.
 * Order = their order in the mural atlas and, tallest first, the order they are given the walls.
 */
const ART = [
  { key: 'mural.condor', id: 'condor', name: 'El Cóndor del Cerro', en: 'A condor wider than the street itself, crossing the sun over the mountains: "Free as the condor".', paint: paintCondor, focus: 350, seed: 311 },
  { key: 'mural.fiesta', id: 'fiesta', name: 'La Fiesta de la Ladera', en: 'Four dancers in wide polleras under paper bunting; the neighbours repaint the colours every year before the feast.', paint: paintFiesta, focus: 330, seed: 312 },
  { key: 'mural.cerro', id: 'cerro', name: 'El Cerro Verde', en: 'The hill the way its children draw it: green, with a house on every step. "The hillside is ours".', paint: paintCerro, focus: 400, seed: 313 },
];

/**
 * Years of sun, rain and splashes on a painting of w x h px (region-local coordinates, clipped to its region): sun fade (strongest at the top), plaster grain, dark rain
 * streaks, a damp dirty foot, flecks and peeled patches where the paint is gone (pale plaster, rimmed in shadow) and a hand-ragged edge (alpha 0: the wall shows
 * beyond it) instead of a frame.
 */
function weather(g, w, h, seed) {
  const R = rng32(seed);
  const fade = g.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(228,216,192,0.24)'); fade.addColorStop(0.55, 'rgba(228,216,192,0.09)'); fade.addColorStop(1, 'rgba(228,216,192,0.02)');
  g.fillStyle = fade; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5200; i++) { g.fillStyle = R() < 0.5 ? 'rgba(255,250,235,0.10)' : 'rgba(30,24,20,0.10)'; g.fillRect(R() * w, R() * h, 1 + R() * 2.2, 1 + R() * 2.2); }
  for (let i = 0; i < 34; i++) {                                               // rain runs: from the top edge, or from a spot where water gathers
    const x = R() * w, y0 = R() < 0.6 ? R() * 30 : R() * h * 0.5, len = 70 + R() * 230, sw = 2 + R() * 6;
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, 'rgba(36,30,26,0)'); gr.addColorStop(0.18, 'rgba(36,30,26,0.22)'); gr.addColorStop(1, 'rgba(36,30,26,0)');
    g.fillStyle = gr; g.fillRect(x, y0, sw, len);
  }
  const foot = g.createLinearGradient(0, h - 96, 0, h);                      // mud and splash at the foot
  foot.addColorStop(0, 'rgba(66,54,42,0)'); foot.addColorStop(1, 'rgba(66,54,42,0.5)');
  g.fillStyle = foot; g.fillRect(0, h - 96, w, 96);
  for (let i = 0; i < 170; i++) { g.fillStyle = 'rgba(60,48,36,0.32)'; circle(g, R() * w, h - R() * R() * 130, 1 + R() * 3.2); }
  // Paint lost shows the plaster under it: pale specks and patches with a shadowed rim (a hole to the wall behind read as dark stones stuck on the picture, because
  // the wall behind is rubble). Only the ragged outer edge below is cut to nothing.
  for (let i = 0; i < 760; i++) {
    const x = R() * w, y = R() * h, edge = Math.min(x, w - x, y, h - y);
    if (R() > 0.2 + 0.8 * Math.max(0, 1 - edge / 170)) continue;              // flecks gather near the edges and the foot
    g.fillStyle = R() < 0.75 ? 'rgba(206,196,176,0.9)' : 'rgba(150,138,120,0.8)'; g.fillRect(x, y, 1 + R() * 3.5, 1 + R() * 3.5);
  }
  for (let i = 0; i < 9; i++) {                                                // peeled patches with ragged outlines, mostly in the lower two thirds
    const cx = R() * w, cy = h * (0.3 + 0.7 * R()), rr = 8 + R() * 17, n = 9 + Math.floor(R() * 4);
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, q = rr * (0.5 + 0.5 * R()), x = cx + Math.cos(a) * q * 1.5, y = cy + Math.sin(a) * q;
      if (k) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath(); g.fillStyle = 'rgba(204,194,174,0.95)'; g.fill();           // bare plaster
    g.lineWidth = 2; g.strokeStyle = 'rgba(92,78,62,0.5)'; g.stroke();         // the lifted paint's rim, in shadow
    g.fillStyle = 'rgba(120,106,90,0.18)'; g.fillRect(cx - rr * 1.2, cy + rr * 0.45, rr * 2.4, rr * 0.5);   // a damp stain along its lower side
  }
  g.globalCompositeOperation = 'destination-out';                              // the hand-ragged outer edge: cut to nothing, so the wall shows beyond it
  const ragged = (amp, along, pts) => {                                         // cut the outside of one edge along a jittered line: pts(t, depth) -> [x, y]
    const ph1 = R() * 6.3, ph2 = R() * 6.3, steps = Math.ceil(along / 5);
    const line = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, base = 0.4 + 0.6 * (0.5 + 0.25 * Math.sin(t * 17 + ph1) + 0.25 * Math.sin(t * 41 + ph2)), bite = R() < 0.02 ? 0.5 + R() * 0.6 : 0;
      line.push(pts(t, amp * (base * (0.55 + 0.45 * R()) + bite)));
    }
    g.beginPath(); line.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    const [ex, ey] = pts(1, -60), [sx, sy] = pts(0, -60); g.lineTo(ex, ey); g.lineTo(sx, sy); g.closePath(); g.fillStyle = '#000'; g.fill();
  };
  ragged(18, w, (t, d) => [t * w, d]); ragged(9, w, (t, d) => [t * w, h - d]);       // top, bottom (short: the banner sits just above it)
  ragged(18, h, (t, d) => [d, t * h]); ragged(18, h, (t, d) => [w - d, t * h]);      // left, right
  g.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------------------------------------------- boards and plaques
function paintGate(big, small) {
  return (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#fbf4de'); bg.addColorStop(1, '#eadfbd'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1f5f3a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); g.strokeStyle = '#b3261e'; g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28);
    for (const x of [58, w - 58]) {
      g.fillStyle = '#f2b705'; circle(g, x, h / 2, 22); g.strokeStyle = '#f2b705'; g.lineWidth = 4; g.lineCap = 'round';
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(x + Math.cos(a) * 28, h / 2 + Math.sin(a) * 28); g.lineTo(x + Math.cos(a) * 38, h / 2 + Math.sin(a) * 38); g.stroke(); }
    }
    const sz = fit(g, big, w - 220, 70, 20); text(g, big, w / 2, h * 0.43, sz, '#b3261e', { stroke: '#5a1410', sw: 2 });
    const s2 = fit(g, small, w - 260, 20, 10, HAND); text(g, small, w / 2, h * 0.82, s2, '#1f5f3a', { fam: HAND });
  };
}
function wood(g, w, h, base) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(60,40,20,0.35)'; g.lineWidth = 2;
  for (const y of [h * 0.33, h * 0.66]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = 'rgba(70,45,20,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const y = (i * 37) % h; g.beginPath(); g.moveTo((i * 53) % 90, y); g.lineTo(60 + ((i * 97) % (w - 60)), y + ((i % 3) - 1)); g.stroke(); }
  g.strokeStyle = 'rgba(40,25,10,0.55)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
}
function paintHuerta(g, w, h) {
  wood(g, w, h, '#b99560');
  text(g, 'HUERTA', w / 2, 42, 54, '#f5efe0', { stroke: '#3b2a18', sw: 6 });
  const sz = fit(g, 'DE DON ANSELMO', w - 50, 38, 14); text(g, 'DE DON ANSELMO', w / 2, 92, sz, '#f5efe0', { stroke: '#3b2a18', sw: 5 });
}
function paintHuevos(g, w, h) {
  g.fillStyle = '#f7f3e6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c0392b'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  const sz = fit(g, 'HUEVOS CRIOLLOS', w - 50, 50, 14); text(g, 'HUEVOS CRIOLLOS', w / 2, 44, sz, '#c0392b');
  const s2 = fit(g, 'docena $3 · pregunte en la casa', w - 60, 28, 12, HAND); text(g, 'docena $3 · pregunte en la casa', w / 2, 94, s2, '#3b2a18', { fam: HAND });
}
function paintGracias(g, w, h) {
  g.fillStyle = '#1d3f77'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d9b24a'; g.lineWidth = 7; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = '#d9b24a'; g.fillRect(w / 2 - 3, 12, 6, 26); g.fillRect(w / 2 - 12, 20, 24, 6);
  const a = fit(g, 'GRACIAS POR LOS FAVORES', w - 50, 40, 14); text(g, 'GRACIAS POR LOS FAVORES', w / 2, 62, a, '#f5efe0');
  const b = fit(g, 'RECIBIDOS · FAM. QUISPE', w - 50, 36, 14); text(g, 'RECIBIDOS · FAM. QUISPE', w / 2, 100, b, '#f5efe0');
}
/** The board on the viewpoint tower (R1-D18): deep green enamel, a cream rule, the name in cream and the height in hand lettering, a little rust at the corners where the water runs. */
function paintMirador(g, w, h) {
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#2b5c45'); bg.addColorStop(1, '#1c4631'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#efe6cc'; g.lineWidth = 6; g.strokeRect(7, 7, w - 14, h - 14);
  const sz = fit(g, 'MIRADOR', w - 70, 74, 20); text(g, 'MIRADOR', w / 2, h * 0.4, sz, '#f7f1de', { stroke: '#10281c', sw: 3 });
  const s2 = fit(g, 'del Cielo · 10 m · suba despacio', w - 70, 26, 10, HAND); text(g, 'del Cielo · 10 m · suba despacio', w / 2, h * 0.8, s2, '#f2c94c', { fam: HAND });
  const R = rng32(4411);
  for (let i = 0; i < 5; i++) {                                                // rust runs from the corners and the lower edge
    const x = i < 2 ? 12 + R() * 40 : w - 12 - R() * 40, len = 18 + R() * 40, gr = g.createLinearGradient(0, h - len, 0, h);
    gr.addColorStop(0, 'rgba(150,84,40,0)'); gr.addColorStop(1, 'rgba(150,84,40,0.55)'); g.fillStyle = gr; g.fillRect(x, h - len, 2 + R() * 4, len);
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = R() < 0.5 ? 'rgba(239,230,204,0.18)' : 'rgba(10,26,18,0.22)'; g.fillRect(R() * w, R() * h, 1 + R() * 2.4, 1 + R() * 2.4); }
}
/** Paper that has stood a season on a wall (R1-D02): rain runs, a fold, flecks, one corner torn off and the bottom edge frayed (cut to nothing: the wall shows through). */
function wornPaper(g, w, h, seed) {
  const R = rng32(seed);
  for (let i = 0; i < 26; i++) {
    const x = R() * w, y0 = R() * h * 0.5, len = 40 + R() * 140, gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, 'rgba(60,48,36,0)'); gr.addColorStop(0.2, 'rgba(60,48,36,0.22)'); gr.addColorStop(1, 'rgba(60,48,36,0)'); g.fillStyle = gr; g.fillRect(x, y0, 2 + R() * 4, len);
  }
  g.strokeStyle = 'rgba(80,70,60,0.28)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h * 0.5); g.lineTo(w, h * 0.5 + 3); g.stroke();
  for (let i = 0; i < 90; i++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,250,0.16)' : 'rgba(40,30,22,0.18)'; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3); }
  g.globalCompositeOperation = 'destination-out';
  const cx = R() < 0.5 ? 0 : w, cy = R() < 0.5 ? 0 : h, s = 26 + R() * 34;
  poly(g, [[cx, cy], [cx + (cx ? -s : s), cy], [cx, cy + (cy ? -s * 1.3 : s * 1.3)]], '#000');
  for (let x = 0; x < w; x += 9) { const d = R() * R() * 14; g.fillStyle = '#000'; g.fillRect(x, h - d, 9, d); }
  g.globalCompositeOperation = 'source-over';
}
const POSTERS = [
  (g, w, h) => {                                                                                            // a house for sale
    g.fillStyle = '#f4efe0'; g.fillRect(0, 0, w, h); g.fillStyle = '#c0261d'; g.fillRect(0, 0, w, 76);
    text(g, 'SE VENDE', w / 2, 40, fit(g, 'SE VENDE', w - 24, 46, 12), '#fff'); text(g, 'CASA', w / 2, 112, 38, '#222'); text(g, '3 PISOS', w / 2, 152, 34, '#222');
    g.fillStyle = '#222'; g.fillRect(24, 190, w - 48, 3); text(g, 'trato directo', w / 2, 224, 22, '#444', { fam: HAND }); text(g, 'cel. 300 555 0142', w / 2, 266, fit(g, 'cel. 300 555 0142', w - 24, 24, 10), '#c0261d');
  },
  (g, w, h) => {                                                                                            // the barrio party
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#f2c230'); bg.addColorStop(1, '#e9772b'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    text(g, 'GRAN', w / 2, 38, 32, '#1d3f77'); text(g, 'FIESTA', w / 2, 92, fit(g, 'FIESTA', w - 20, 62, 20), '#1d3f77', { stroke: '#fff', sw: 3 }); text(g, 'DEL BARRIO', w / 2, 142, fit(g, 'DEL BARRIO', w - 24, 34, 12), '#b3261e');
    for (const [x, y, c] of [[40, 196, '#1d3f77'], [100, 214, '#b3261e'], [160, 192, '#2a7a45']]) { g.fillStyle = c; circle(g, x, y, 22); }
    text(g, 'sábado · 8 pm', w / 2, 262, fit(g, 'sábado · 8 pm', w - 24, 26, 10, HAND), '#1d3f77', { fam: HAND }); text(g, 'cumbia y parrilla', w / 2, 292, fit(g, 'cumbia y parrilla', w - 24, 20, 10, HAND), '#1d3f77', { fam: HAND });
  },
  (g, w, h) => {                                                                                            // a lost dog
    g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, w, h); text(g, 'SE BUSCA', w / 2, 42, fit(g, 'SE BUSCA', w - 24, 50, 12), '#111');
    g.fillStyle = '#6b4a2f'; g.beginPath(); g.ellipse(100, 190, 58, 34, 0, 0, Math.PI * 2); g.fill(); circle(g, 52, 150, 28); poly(g, [[34, 132], [24, 168], [48, 150]], '#4a3320'); poly(g, [[70, 130], [88, 160], [64, 154]], '#4a3320');
    g.fillRect(64, 214, 12, 44); g.fillRect(124, 214, 12, 44); g.fillStyle = '#111'; circle(g, 46, 146, 4);
    text(g, 'PIRATA', w / 2, 98, fit(g, 'PIRATA', w - 24, 30, 10), '#222'); text(g, 'recompensa', w / 2, 286, fit(g, 'recompensa', w - 24, 26, 10, HAND), '#b3261e', { fam: HAND });
  },
  (g, w, h) => {                                                                                            // an election list
    g.fillStyle = '#2a7a45'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4efe0'; g.fillRect(14, 14, w - 28, h - 28); g.fillStyle = '#2a7a45'; g.fillRect(14, 14, w - 28, 120);
    text(g, 'VOTE', w / 2, 74, fit(g, 'VOTE', w - 50, 78, 20), '#f4efe0'); text(g, 'LISTA 7', w / 2, 178, fit(g, 'LISTA 7', w - 40, 52, 14), '#b3261e');
    text(g, 'trabajo', w / 2, 236, 28, '#222', { fam: HAND }); text(g, 'agua y luz', w / 2, 274, 28, '#222', { fam: HAND });
  },
];
export const PAPERS = POSTERS.length;
const paintPoster = (i) => (g, w, h) => { POSTERS[i](g, w, h); wornPaper(g, w, h, 770 + i); };
/** A tag sprayed on a wall (no ground: the wall shows round the letters), with a swoosh under it and drips off its lower edge. */
function paintTag(word, fill, edge, seed) {
  return (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const R = rng32(seed), sz = fit(g, word, w - 40, 96, 24, HAND);
    text(g, word, w / 2, h * 0.48, sz, fill, { fam: HAND, stroke: edge, sw: Math.max(4, sz * 0.08) });
    g.strokeStyle = fill; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(24, h * 0.86); g.quadraticCurveTo(w / 2, h * 0.99, w - 24, h * 0.8); g.stroke();
    for (let i = 0; i < 7; i++) { const x = 40 + R() * (w - 80), y0 = h * 0.6, len = 14 + R() * 36; g.fillStyle = fill; g.fillRect(x, y0, 3, len); circle(g, x + 1.5, y0 + len, 3.2); }
  };
}
const TAG_ART = [{ word: 'ZETA', fill: '#d8352a', edge: '#f4f4ee', seed: 31 }, { word: 'LOS PIBES', fill: '#1c3f9e', edge: '#f4f4ee', seed: 32 }];
export const TAGS = TAG_ART.length;
function paintPlaque(name) {
  const m = /^(\S+)\s+(.*)$/.exec(name ?? '') ?? [null, '', name ?? ''];
  const kind = m[1].toUpperCase(), rest = m[2].toUpperCase();
  return (g, w, h) => {
    g.fillStyle = '#17458f'; rrect(g, 0, 0, w, h, 7); g.fill();
    g.strokeStyle = '#f4f4ee'; g.lineWidth = 3; rrect(g, 4, 4, w - 8, h - 8, 5); g.stroke();
    if (kind) text(g, kind, w / 2, 16, fit(g, kind, w - 40, 19, 9), '#e4eeff');
    const sz = fit(g, rest, w - 26, 28, 12); text(g, rest, w / 2, kind ? 43 : 34, sz, '#f4f4ee');
  };
}
function paintRayuela(g, w, h) {
  g.clearRect(0, 0, w, h);
  const ink = 'rgba(244,244,236,0.96)';
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 6; g.lineJoin = 'round'; g.lineCap = 'round';
  const rows = [1, 1, 2, 1, 2, 1, 2], sq = 44;
  let y = h - 8, n = 1;
  for (const cnt of rows) {
    for (let k = 0; k < cnt; k++) {
      const x0 = cnt === 1 ? (w - sq) / 2 : (w - sq * 2) / 2 + k * sq;
      g.strokeRect(x0, y - sq, sq, sq);
      text(g, String(n), x0 + sq / 2, y - sq / 2 + 1, 24, ink, { fam: HAND }); n++;
    }
    y -= sq;
  }
  g.beginPath(); g.ellipse(w / 2, y, 56, 38, 0, Math.PI, 0); g.closePath(); g.stroke();
  text(g, 'CIELO', w / 2, y - 16, 20, ink, { fam: HAND });
}

/** The boards painted into the sign atlas: [key, painter] for the gate, the hand signs, the chalk and one plaque per street (plaque i = street i). */
function signItems(plan) {
  const items = [
    ['gate.in', paintGate('BIENVENIDOS A LA LADERA', 'barrio de gente buena y de cerro alto')],
    ['gate.out', paintGate('VAYA CON DIOS · VUELVA PRONTO', 'gracias por la visita')],
    ['hand.huerta', paintHuerta], ['hand.huevos', paintHuevos], ['hand.gracias', paintGracias], ['hand.mirador', paintMirador], ['rayuela', paintRayuela],
  ];
  (plan?.streets ?? []).slice(0, PLAQUES).forEach((st, i) => items.push([`plaque.${i}`, paintPlaque(st.name)]));
  for (let i = 0; i < PAPERS; i++) items.push([`poster.${i}`, paintPoster(i)]);
  TAG_ART.forEach((t, i) => items.push([`tag.${i}`, paintTag(t.word, t.fill, t.edge, t.seed)]));
  return items;
}
/** Every key of the sign atlas for this plan, and of the mural atlas: each has exactly one region (a test holds the geometry code to this list). */
export const signKeys = (plan) => signItems(plan).map(([key]) => key);
export const muralKeys = () => ART.map((a) => a.key);

/** Paint each [key, painter] into its region of g (clipped, origin at the region's corner). A key with no region, or a painter that throws, leaves a note in makeSignAtlas.errors. */
function paintRegions(g, items, regionFor) {
  for (const [key, paint] of items) {
    const reg = regionFor(key);
    if (!reg) { (makeSignAtlas.errors ??= []).push(`${key}: no region in the atlas`); continue; }
    const [x, y, w, h] = reg;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y);
    try { paint(g, w, h); } catch (e) { g.globalCompositeOperation = 'source-over'; g.fillStyle = '#c8c0b0'; g.fillRect(0, 0, w, h); (makeSignAtlas.errors ??= []).push(`${key}: ${e?.message ?? e}`); }
    g.restore();
  }
}

/** A canvas as a DataTexture, rows flipped so v = 1 - y/H. Texels with no paint keep the colour `bare` (chalk, wall) so the mips do not darken the edges. */
function toTexture(g, W, H, bare) {
  const d = g.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H * 4), row = W * 4;
  for (let y = 0; y < H; y++) {
    const src = y * row, dst = (H - 1 - y) * row;
    for (let i = 0; i < row; i += 4) {
      if (d[src + i + 3] < 10) { out[dst + i] = bare[0]; out[dst + i + 1] = bare[1]; out[dst + i + 2] = bare[2]; out[dst + i + 3] = 0; }
      else { out[dst + i] = d[src + i]; out[dst + i + 1] = d[src + i + 1]; out[dst + i + 2] = d[src + i + 2]; out[dst + i + 3] = d[src + i + 3]; }
    }
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 8; tex.needsUpdate = true;
  return tex;
}

/**
 * Paint every sign of the world once. Browser only (null under Node). `plan.streets[i].name` becomes plaque i.
 * `murals` = planMurals(K): the shape (width / height) of the wall each painting was given, so a picture on a squarer wall shows the middle of its scene instead of
 * being squeezed; without it every picture is the full 2:1 scene.
 * Returns { texture, uv(key), mural: { texture, uv(key) } }: the boards atlas and the mural atlas, each uv() = [u0, vBottom, u1, vTop] of a region, half a texel inside.
 */
export function makeSignAtlas(plan, murals = []) {
  const MAH = ART.length * (MH + MGAP), cv = makeCanvas(AW, AH), mc = makeCanvas(MW, MAH); if (!cv || !mc) return null;
  const g = cv.getContext('2d', { willReadFrequently: true }), mg = mc.getContext('2d', { willReadFrequently: true }); if (!g || !mg) return null;
  g.clearRect(0, 0, AW, AH); mg.clearRect(0, 0, MW, MAH);
  paintRegions(g, signItems(plan), regionOf);
  const picture = (a, i) => (c, w, h) => {                                       // the scene is 640 x 320; a wall squarer than 2:1 shows the part of it around the focus, stretched to fill the region
    const m = murals[i], cw = m ? Math.max(320, Math.min(640, 320 * (m.W / m.h))) : 640, x0 = Math.max(0, Math.min(640 - cw, a.focus - cw / 2));
    c.save(); c.scale(w / cw, h / 320); c.translate(-x0, 0); a.paint(c, 640, 320, { x0, w: cw }); c.restore();
    weather(c, w, h, a.seed);
  };
  paintRegions(mg, ART.map((a, i) => [a.key, picture(a, i)]), muralRegion);
  return {
    texture: toTexture(g, AW, AH, [236, 236, 228]), canvas: cv,
    uv: (key) => uvIn(regionOf(key), AW, AH, key),
    mural: { texture: toTexture(mg, MW, MAH, [150, 142, 130]), canvas: mc, uv: (key) => uvIn(muralRegion(key), MW, MAH, key) },
  };
}

// ---------------------------------------------------------------------------------------------------- geometry
/**
 * One flat panel facing (ox, oz) (unit outward normal), centred on (cx, cz), `w` wide along the viewer's right, bottom edge yl (left) .. yr (right), h tall.
 * The viewer faces -o; their right is (oz, -ox). Corners BL, BR, TR, TL: counter-clockwise seen from the front.
 */
export function panel(K, b, key, cx, cz, ox, oz, w, yl, yr, h) {
  const A = K.signs, r = A ? A.uv(key) : [0, 0, 1, 1], col = A ? [1, 1, 1] : (FLAT[key.split('.')[0]] ?? [0.75, 0.72, 0.65]);
  const rx = oz, rz = -ox, hw = w / 2;
  b.quad('world_sign', [cx - rx * hw, yl, cz - rz * hw], [cx + rx * hw, yr, cz + rz * hw], [cx + rx * hw, yr + h, cz + rz * hw], [cx - rx * hw, yl + h, cz - rz * hw], { uv: [r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]], col });
}

/**
 * A painting on a wall that bends gently: one flat quad per step of `pts` = [{ x, y, z }] (the bottom edge, in front of the wall, ordered left to right as the viewer sees
 * it), h tall; u runs 0..1 with the arc length, v up the height. Every quad is wound counter-clockwise seen from the street (BL, BR, TR, TL), or the wall culls it.
 */
export function wallPanel(K, b, key, pts, h) {
  const A = K.signs?.mural, r = A ? A.uv(key) : [0, 0, 1, 1], col = A ? [1, 1, 1] : FLAT.mural, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const u = (i) => r[0] + (r[2] - r[0]) * (cum[i] / cum[cum.length - 1]);
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1], u0 = u(i), u1 = u(i + 1);
    b.quad('world_mural', [p.x, p.y, p.z], [q.x, q.y, q.z], [q.x, q.y + h, q.z], [p.x, p.y + h, p.z], { uv: [u0, r[1], u1, r[1], u1, r[3], u0, r[3]], col });
  }
}

/** A hand-painted board hung on a post / fence at (x, y, z), facing (ox, oz): backing plank plus the painted face. w wide, height from the atlas ratio. */
export function handBoard(K, key, x, y, z, ox, oz, w = 0.9) {
  const b = K.one('signs', { cast: false }), h = w * 128 / 500, ry = Math.atan2(ox, oz);
  b.box('wood_dark', x - ox * 0.012, y, z - oz * 0.012, w + 0.05, h + 0.05, 0.022, { ry, col: [0.55, 0.5, 0.45] });
  panel(K, b, key, x + ox * 0.004, z + oz * 0.004, ox, oz, w, y - h / 2, y - h / 2, h);
}

const LIFT = 0.35, PITCH = 0.5, OFF = 0.045, GAP = 0.3;      // the painting starts LIFT above the street edge of the wall (kerb, mud line); a quad every PITCH m; OFF in front of the wall face; GAP between two paintings of a wall
const MIN_H = 3.0, MIN_W = 3.6, MAX_W = 8.0, FLATTEST = 2.2, BIG = 6.0;  // a painting is at least 3 m tall and 3.6 m wide, at most 8 m wide, and never flatter than 2.2 : 1; the two main ones want BIG m
const FINE = 0.05, REACH = 0.55;                                // the walls in front of a street wall are looked at every FINE m, and a hung point clears all of them within REACH (a little over one strip) of it

/** Every wall face of every run as a segment { run, a, b: its ends in plan, ta, tb: the height of its cap there }: a cut wall's face is on the street edge, a fill wall's at the foot of its ramp. */
function faceSegments(runs) {
  const segs = [];
  for (const run of runs) {
    const cut = run.sign > 0, top = (s) => (cut ? s.outer : s.inner) + 0.02, at = (s) => { const f = cut ? 0 : s.W; return [s.x + s.nx * f, s.z + s.nz * f]; };
    for (let i = 0; i + 1 < run.S.length; i++) {
      const p = run.S[i], q = run.S[i + 1], [ax, az] = at(p), [bx, bz] = at(q);
      segs.push({ run, ax, az, bx, bz, ta: top(p), tb: top(q) });
    }
  }
  return segs;
}

/**
 * Where the front-most wall face stands at a point `s` of a cut wall (unit normal, street edge at s.x, s.z): the lot pads above a street carry fill walls of their own
 * whose faces stand 0 to 0.4 m in front of the street wall's, so a painting hung on the street wall's face disappears behind them. Casts a ray from the face toward the
 * street (1.2 m) through the `near` segments of the other runs: front = how far the farthest full wall stands out, cap = the lowest cap among the walls it hangs on
 * (a wall that stops lower than the street wall's cap lowers the painting's top); a kerb under the painting's foot is ignored.
 */
function frontAt(s, near) {
  const ox = -s.nx, oz = -s.nz;
  let front = 0, cap = s.outer, hit = null;
  for (const g of near) {
    const dx = g.bx - g.ax, dz = g.bz - g.az, den = ox * dz - oz * dx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((g.ax - s.x) * dz - (g.az - s.z) * dx) / den, u = ((g.ax - s.x) * oz - (g.az - s.z) * ox) / den;
    if (t < 0.02 || t > 1.2 || u < 0 || u > 1) continue;
    const top = g.ta + (g.tb - g.ta) * u;
    if (top <= s.inner + LIFT + 0.05) continue;
    if (t > front) front = t;
    cap = Math.min(cap, top - 0.02);
    if (!hit?.includes(g.run)) (hit ??= []).push(g.run);
  }
  return { front, cap, hit };
}

/**
 * Every place on the tall cut walls along streets and plazas that holds a painting: W wide (arc length, 3.6 to 8 m) and h tall = the whole height between the
 * painting's bottom edge (LIFT above the street edge of the wall, never over a step of more than 30 cm in 0.5 m) and the lowest cap of the walls it hangs on (less 3 cm),
 * at least 3 m, never flatter than 2.2 : 1 (a window taller than wide gets a square picture), and the wall turns less than about 36 degrees along it. Each window
 * carries `pts` = the wall samples (x, z, unit normal, inner, outer, and front / cap from frontAt) every PITCH m along it. Widths in steps of 0.4 m, starts every 0.5 m.
 */
export function muralWindows(K) {
  const runs = K.ctx.world?.wallRuns ?? [], out = [];
  let segs = null;
  for (const run of runs) {
    if (run.sign <= 0 || !(run.src === 'street' || run.src.startsWith('plaza')) || run.tall < MIN_H + LIFT + 0.03) continue;
    const S = run.S, cum = [0];
    for (let i = 1; i < S.length; i++) cum.push(cum[i - 1] + Math.hypot(S[i].x - S[i - 1].x, S[i].z - S[i - 1].z));
    const total = cum[cum.length - 1];
    const x0 = Math.min(...S.map((s) => s.x)) - 3, x1 = Math.max(...S.map((s) => s.x)) + 3, z0 = Math.min(...S.map((s) => s.z)) - 3, z1 = Math.max(...S.map((s) => s.z)) + 3;
    const near = (segs ??= faceSegments(runs)).filter((g) => g.run !== run && Math.max(g.ax, g.bx) > x0 && Math.min(g.ax, g.bx) < x1 && Math.max(g.az, g.bz) > z0 && Math.min(g.az, g.bz) < z1);
    const base = (d) => {
      let i = 0; while (i + 2 < S.length && cum[i + 1] < d) i++;
      const a = S[i], c = S[i + 1], t = Math.max(0, Math.min(1, (d - cum[i]) / ((cum[i + 1] - cum[i]) || 1)));
      const m = (k) => a[k] + (c[k] - a[k]) * t, s = { x: m('x'), z: m('z'), nx: m('nx'), nz: m('nz'), inner: m('inner'), outer: m('outer') }, l = Math.hypot(s.nx, s.nz) || 1;
      s.nx /= l; s.nz /= l;
      return Object.assign(s, frontAt(s, near));
    };
    // A lot wall ends in a corner or a jog between two points of the painting, and a straight quad from one point to the next would cut through it (the condor's seam:
    // a stone corner stood 3 mm proud of the paint over the whole height). So a point stands out as far as ANY wall face within REACH of it along the window (both strips
    // it belongs to), seen on a FINE lattice, and takes the lowest cap of them: a chord between two such points clears every face between them.
    const lat = new Map(), fine = (i) => { let v = lat.get(i); if (!v) lat.set(i, (v = base(i * FINE))); return v; };
    const at = (d, lo, hi) => {
      const s = base(d), hit = new Set(s.hit ?? []);
      for (let i = Math.ceil(Math.max(lo, d - REACH, 0) / FINE - 1e-9); i * FINE <= Math.min(hi, d + REACH, total) + 1e-9; i++) {
        const f = fine(i);
        if (f.front > s.front) s.front = f.front;
        if (f.cap < s.cap) s.cap = f.cap;
        for (const r of f.hit ?? []) hit.add(r);
      }
      s.hit = hit.size ? [...hit] : null;
      return s;
    };
    const fits = [];
    for (let W = MAX_W; W > MIN_W - 1e-6; W -= 0.4) {
      const n = Math.round(W / PITCH);
      for (let d0 = 0; d0 + W <= total + 1e-6; d0 += 0.5) {
        const pts = []; let mx = 0, mz = 0;
        for (let k = 0; k <= n; k++) { const s = at(d0 + (W * k) / n, d0, d0 + W); pts.push(s); mx += s.nx; mz += s.nz; }
        const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
        let room = Infinity;                                                  // the height the walls give the painting
        for (let k = 0; k <= n; k++) {
          const s = pts[k];
          room = Math.min(room, s.cap - 0.03 - s.inner - LIFT);
          if (room < MIN_H || s.nx * mx + s.nz * mz < 0.95 || (k && Math.abs(s.inner - pts[k - 1].inner) > 0.3)) { room = -1; break; }
        }
        const h = Math.min(room, W);
        if (room >= MIN_H && W / h <= FLATTEST) fits.push({ run, W, h, d0, area: W * h, pts });
      }
    }
    out.push(...fits);
  }
  return out;
}

/**
 * The walls of the three paintings: the set of up to ART.length windows, no two overlapping on a wall (GAP apart), that gives the most paintings, then the most
 * of them (two at most) 6 m wide or more (the two big ones are meant to be mural-sized), then the most paint, largest first (so the broadest picture, the condor, gets the
 * biggest wall). Exhaustive over the windows (thinned to about 240 by an even stride when there are more: a few million combinations at most).
 */
export function planMurals(K) {
  let cands = muralWindows(K).sort((a, c) => c.area - a.area || a.d0 - c.d0 || a.W - c.W);
  if (cands.length > 240) { const stride = cands.length / 240; cands = Array.from({ length: 240 }, (_, i) => cands[Math.floor(i * stride)]); }
  const free = (a, c) => a.run !== c.run || a.d0 + a.W + GAP <= c.d0 || c.d0 + c.W + GAP <= a.d0;
  const big = (set) => Math.min(2, set.filter((q) => q.W >= BIG - 1e-9).length);
  let best = [], bestArea = 0, bestBig = 0;
  const rec = (from, chosen, area) => {
    const b = big(chosen);
    if (chosen.length > best.length || (chosen.length === best.length && (b > bestBig || (b === bestBig && area > bestArea + 1e-9)))) { best = chosen.slice(); bestArea = area; bestBig = b; }
    if (chosen.length === ART.length) return;
    for (let i = from; i < cands.length; i++) {
      if (!chosen.every((q) => free(q, cands[i]))) continue;
      chosen.push(cands[i]); rec(i + 1, chosen, area + cands[i].area); chosen.pop();
    }
  };
  rec(0, [], 0);
  return best.sort((a, c) => c.area - a.area || a.d0 - c.d0).map(hang);
}

/**
 * The gentlest surface that is nowhere behind a face: the lowest concave curve above the fronts along a painting (its two ends stay), found by lifting every
 * point to the mean of its neighbours until none is below it. A lot wall ends in a step of up to 0.4 m; a picture hung on every face as it comes would bend
 * and tilt round each one (up to 20 degrees a step), a painted wall does not. The painting stands up to about 10 cm off the lower stretches instead.
 */
function gentle(front) {
  const f = front.slice();
  for (let it = 0; it < 400; it++) {
    let lifted = false;
    for (let k = 1; k + 1 < f.length; k++) { const m = (f[k - 1] + f[k + 1]) / 2; if (m > f[k] + 1e-6) { f[k] = m; lifted = true; } }
    if (!lifted) break;
  }
  return f;
}

/**
 * A chosen window made ready to hang: `pts` = the painting's bottom edge OFF in front of the front-most face (x, z, y, the cap above it, front = how far out of the
 * street wall's face it stands, the runs it hangs on, the wall's normal), ordered left to right as the viewer sees it (their right is (oz, -ox)); (ox, oz) = the way
 * it looks, toward the street; (vx, vz) = the viewer's spot.
 */
function hang(p) {
  let ox = -p.pts.reduce((s, q) => s + q.nx, 0), oz = -p.pts.reduce((s, q) => s + q.nz, 0);
  const nl = Math.hypot(ox, oz) || 1; ox /= nl; oz /= nl;
  const fr = gentle(p.pts.map((s) => s.front));
  const pts = p.pts.map((s, k) => ({ x: s.x - s.nx * (fr[k] + OFF), z: s.z - s.nz * (fr[k] + OFF), y: s.inner + LIFT, cap: s.cap, front: fr[k], hit: s.hit, nx: s.nx, nz: s.nz }));
  const last = pts[pts.length - 1];
  if ((last.x - pts[0].x) * oz - (last.z - pts[0].z) * ox < 0) pts.reverse();
  const c = pts[pts.length >> 1];
  return { ...p, pts, ox, oz, vx: c.x + ox * 2.4, vz: c.z + oz * 2.4 };
}

/**
 * Keeps the street in front of every painting open: a row of discs 2.4 m out, about 1 m radius each and touching, along its whole width, claimed before the poles,
 * benches, parked vehicles and (later) trees take their ground. (Three discs of 1.2 m at a third of the width overlapped one another, so `take` refused the middle
 * one: the spot a visitor stands on.) Where two paintings hang side by side on a bending wall, the end discs of their rows overlap: the later one shrinks until it
 * fits and takes what the first left.
 */
export function claimMurals(K) {
  for (const m of K.murals ??= planMurals(K)) {
    const n = Math.max(1, Math.round(m.W / 2.05)), step = m.W / n, r = Math.min(1.0, step / 2 - 0.02);
    for (let k = 0; k < n; k++) {
      const t = (k - (n - 1) / 2) * step, x = m.vx + m.oz * t, z = m.vz - m.ox * t;
      for (let rr = r; rr >= 0.45; rr -= 0.1) if (K.occ.take(x, z, rr)) break;
    }
  }
}

export function buildSigns(K) {
  const { ctx, plan, occ, H } = K, W = ctx.world, b = K.one('signs', { cast: false });
  const stats = { murals: 0, plaques: 0, boards: 0, hopscotch: 0 }, extra = (W.extra ??= []);

  // ---- 1. the three murals: 3 m and taller, 3.6 to 8 m wide, painted straight on the tall street walls (no frame, weathered, ragged edge)
  (K.murals ??= planMurals(K)).forEach((p, i) => {
    const { key, id, name, en } = ART[i], { W: w, h, pts, ox, oz, vx, vz } = p;
    wallPanel(K, b, key, pts, h);
    const muralRuns = (W.muralRuns ??= new Set());                                                   // the flora hangs no vine on a wall with a painting on it, nor on the pad walls it hangs in front of
    muralRuns.add(p.run); for (const s of pts) for (const r of s.hit ?? []) muralRuns.add(r);
    (W.muralList ??= []).push({ id, key, run: p.run, w, h, ox: +ox.toFixed(4), oz: +oz.toFixed(4), pts });
    extra.push({ id, name, en, kind: 'mural', x: vx, z: vz, y: H(vx, vz), radius: 6, dy: 3.2, face: [+ox.toFixed(3), +oz.toFixed(3)] });   // face: the way the painting looks (toward the street)
    stats.murals++;
  });

  // ---- 2. the arch: welcome boards on both faces of the beam
  const gate = W.gate;
  if (gate) {
    const by = gate.beamY - 0.015, bw = 6.6, bh = bw * 128 / 1000;
    panel(K, b, 'gate.in', gate.x, gate.z - 0.362, 0, -1, bw, by, by, bh);            // north face: what a person inside the barrio sees
    panel(K, b, 'gate.out', gate.x, gate.z + 0.362, 0, 1, bw, by, by, bh);             // south face: what a person leaving sees
    stats.boards = 2;
    extra.push({ id: 'arco', name: 'El Arco de Bienvenida', en: 'The welcome arch over the only road in and out: "Bienvenidos a La Ladera" on this side, "Vaya con Dios" on the other.', kind: 'vista', x: gate.x, z: gate.z - 3.4, y: gate.y, radius: 9, dy: 6 });
  }

  // ---- 3. street-name plaques on iron posts
  const plaqueAt = [];
  plan.streets.slice(0, PLAQUES).forEach((st, i) => {                         // (the atlas has room for PLAQUES names)
    const d = st._d, hw = st.width / 2, L = st.len ?? d.cum[d.cum.length - 1];
    const ss = [1.6, 3.2, 5, L - 1.6, L - 3.2, 7.5, L - 5];
    for (const s of ss) {
      if (s < 0.8 || s > L - 0.8) continue;
      const q = pointAt(d.pts, d.cum, s);
      let done = false;
      for (const sd of [1, -1]) for (const off of [hw + 0.55, hw + 1.0, hw + 1.5]) {
        const x = q.x - q.tz * off * sd, z = q.z + q.tx * off * sd;
        if (!occ.clear(x, z, 0.3, OCC.LOT | OCC.STAIR | OCC.PLAZA | OCC.DOOR | OCC.STEEP | OCC.ROAD) || occ.overlaps(x, z, 0.5) || occ.slope(x, z) > 0.5 || occ.navDist(x, z) < 0.95) continue;
        const gy = H(x, z), top = gy + 2.55, ry = Math.atan2(q.tx, q.tz);
        tube(b, 'iron_black', [x, gy - 0.25, z], [x, top, z], 0.036, 0.03, 6, { col: [0.2, 0.22, 0.25] });
        b.box('iron_black', x, gy + 2.36, z, 0.94, 0.27, 0.02, { ry, col: [0.15, 0.16, 0.2] });
        for (const f of [1, -1]) panel(K, b, `plaque.${i}`, x + q.tx * f * 0.012, z + q.tz * f * 0.012, q.tx * f, q.tz * f, 0.9, gy + 2.36 - 0.1125, gy + 2.36 - 0.1125, 0.225);
        K.post(x, z, 0.06, 2.6); occ.take(x, z, 0.4);
        plaqueAt.push({ x, z, y: gy, i, name: st.name, tx: q.tx, tz: q.tz });
        stats.plaques++; done = true; break;
      }
      if (done) break;
    }
  });
  W.plaques = plaqueAt;
  const sp = plan.spawn;
  const near = plaqueAt.slice().sort((a, c) => Math.hypot(a.x - sp.x, a.z - sp.z) - Math.hypot(c.x - sp.x, c.z - sp.z))[0];
  if (near) extra.push({ id: 'placas', name: 'Las placas de las calles', en: `Blue enamel plaques on iron posts: this one says "${near.name}"; every street of the barrio has its own, and some have a story.`, kind: 'object', x: near.x, z: near.z, y: near.y, radius: 3.6, dy: 3 });

  // ---- 4. the hopscotch, chalked on the Almendros plaza
  const pl = plan.plazas.find((q) => q.id === 'P2') ?? plan.plazas.find((q) => q.kind === 'plaza');
  if (pl) {
    const ry = pl.ry ?? 0, c = Math.cos(ry), s = Math.sin(ry), LEN = 2.57, WID = 1.0;
    const spotOk = (x, z, rr) => K.rectFree(x, z, LEN + 0.3, WID + 0.5, rr, { mask: OCC.STAIR | OCC.LOT | OCC.DOOR | OCC.ROAD | OCC.STEEP, gapK: 0.75 });
    let hit = null;
    for (let t = 0; t < 400 && !hit; t++) {
      const u = (((t * 0.6180339) % 1) - 0.5) * (pl.w - 3.2), v = (((t * 0.7548777) % 1) - 0.5) * (pl.d - 2.6);
      const x = pl.cx + u * c + v * s, z = pl.cz - u * s + v * c;
      if (spotOk(x, z, ry)) hit = [x, z];
    }
    if (hit) {
      const [x, z] = hit, y = pl.y + 0.036, dx = c, dz = -s, rx = s, rz = c;              // the paving tops out at pl.y + 0.02 (its border band at + 0.028): chalk lies on it. d = the plaza's local x (the long way), r = its local z
      const BL = [x - dx * LEN / 2 - rx * WID / 2, y, z - dz * LEN / 2 - rz * WID / 2], BR = [x - dx * LEN / 2 + rx * WID / 2, y, z - dz * LEN / 2 + rz * WID / 2];
      const TR = [x + dx * LEN / 2 + rx * WID / 2, y, z + dz * LEN / 2 + rz * WID / 2], TL = [x + dx * LEN / 2 - rx * WID / 2, y, z + dz * LEN / 2 - rz * WID / 2];
      const r = K.signs ? K.signs.uv('rayuela') : [0, 0, 1, 1];
      b.quad('world_sign', BL, BR, TR, TL, { uv: [r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]], col: K.signs ? [1, 1, 1] : FLAT.rayuela });
      occ.take(x, z, 1.5);
      const sx = x - dx * (LEN / 2 - 0.3), sz = z - dz * (LEN / 2 - 0.3);                 // the start square
      W.hopscotch = { x, z, ry, sx, sz, dx, dz, len: LEN, y: pl.y + 0.02 };
      extra.push({ id: 'rayuela', name: 'La rayuela', en: 'A hopscotch in chalk, redrawn every week by whoever is small enough to care; it still ends in "cielo".', kind: 'object', x: sx, z: sz, y: pl.y + 0.02, radius: 2.4, dy: 2.5 });
      stats.hopscotch = 1;
    }
  }
  W.signs = stats;
  return stats;
}
