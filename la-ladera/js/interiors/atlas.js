// Decal atlas: ONE canvas texture holding every poster, picture, calendar, notice, menu and school chart of the barrio, painted at load time with
// real Spanish text (browser only: Node tests have no canvas and fall back to flat coloured paper). One material (`decal_atlas`) = one draw call per
// building for ALL its wall pictures. Layout: shelf packing of the DECALS definitions (decals.js), pixels-per-metre chosen so everything fits 2048 x 2048.
import * as THREE from 'three';
import { DECALS } from './decals.js';

const SIZE = 2048, GUT = 6;
const F = {
  sans: '"Segoe UI", Arial, Helvetica, sans-serif', serif: 'Georgia, "Times New Roman", serif', hand: '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive',
  slab: '"Arial Black", Impact, "Segoe UI", sans-serif',
};
// ------------------------------------------------------------------ drawing helpers (all in pixels of the decal's own w x h box)
const bg = (g, w, h, c) => { g.fillStyle = c; g.fillRect(-GUT, -GUT, w + 2 * GUT, h + 2 * GUT); };
const grad = (g, w, h, stops, vertical = true) => { const gr = vertical ? g.createLinearGradient(0, 0, 0, h) : g.createLinearGradient(0, 0, w, 0); stops.forEach(([t, c]) => gr.addColorStop(t, c)); g.fillStyle = gr; g.fillRect(-GUT, -GUT, w + 2 * GUT, h + 2 * GUT); };
const txt = (g, s, x, y, px, o = {}) => {
  g.font = `${o.w ?? ''} ${px}px ${o.f ?? F.sans}`.trim(); g.fillStyle = o.c ?? '#222'; g.textAlign = o.a ?? 'center'; g.textBaseline = o.b ?? 'middle';
  if (o.r) { g.save(); g.translate(x, y); g.rotate(o.r); g.fillText(s, 0, 0, o.max); g.restore(); } else g.fillText(s, x, y, o.max);
};
const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const circ = (g, x, y, r, c, stroke) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (c) { g.fillStyle = c; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.stroke(); } };
const poly = (g, pts, c, stroke) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); if (c) { g.fillStyle = c; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.stroke(); } };
const line = (g, x0, y0, x1, y1, c, lw = 1) => { g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
const border = (g, w, h, c, lw) => { g.strokeStyle = c; g.lineWidth = lw; g.strokeRect(lw / 2, lw / 2, w - lw, h - lw); };
const person = (g, x, y, s, shirt, skin, hair) => {                      // bust: shoulders + head (s = head radius)
  g.fillStyle = shirt; g.beginPath(); g.ellipse(x, y + s * 2.6, s * 1.8, s * 1.5, 0, Math.PI, 0); g.fill(); g.fillRect(x - s * 1.8, y + s * 2.6, s * 3.6, s * 0.8);
  circ(g, x, y, s, skin); g.fillStyle = hair; g.beginPath(); g.arc(x, y - s * 0.1, s * 1.05, Math.PI, 0); g.fill();
};
const heart = (g, x, y, s, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(x, y + s * 0.9); g.bezierCurveTo(x - s * 1.5, y - s * 0.2, x - s * 0.7, y - s * 1.1, x, y - s * 0.4); g.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.5, y - s * 0.2, x, y + s * 0.9); g.fill(); };
const rays = (g, x, y, r0, r1, n, c) => { g.strokeStyle = c; g.lineWidth = Math.max(1, r0 * 0.12); for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n; line(g, x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, c, g.lineWidth); } };
const vignette = (g, w, h, a = 0.45) => { const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(40,25,10,${a})`); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
const lines = (g, rows, x, y, lh, px, o = {}) => rows.forEach((s, i) => txt(g, s, x, y + i * lh, px, o));
const table = (g, rows, x, y, w, lh, px, o = {}) => {                    // two columns; the font shrinks (one size for all rows) until label + price fit
  g.font = `${o.w ?? ''} ${px}px ${o.f ?? F.sans}`.trim();
  const k = Math.min(1, ...rows.map(([a, b]) => w / (g.measureText(a).width + g.measureText(b).width + px * 1.3)));
  rows.forEach(([a, b], i) => { txt(g, a, x, y + i * lh, px * k, { ...o, a: 'left' }); txt(g, b, x + w, y + i * lh, px * k, { ...o, a: 'right' }); });
};

/** Generic board: coloured ground, big title, optional sub line and border. */
const board = (c) => (g, w, h) => {
  bg(g, w, h, c.bg);
  if (c.border) border(g, w, h, c.border, Math.max(2, Math.min(w, h) * 0.045));
  const n = c.title.length, big = Math.min(h * (c.sub ? 0.34 : 0.5), w / (n * 0.52) * 1.05);
  txt(g, c.title, w / 2, h * (c.sub ? 0.38 : 0.5), big, { w: 'bold', f: c.f ?? F.slab, c: c.fg, max: w * 0.9 });
  if (c.sub) txt(g, c.sub, w / 2, h * 0.74, Math.min(h * 0.17, w / (c.sub.length * 0.5)), { c: c.fg2 ?? c.fg, f: c.f2 ?? F.sans, max: w * 0.9 });
};
/** A hand-lettered price board for one trade: red title, a line under it, then `rows` of [what, price] (the font shrinks until every row fits). */
const priceBoard = (title, sub, rows) => (g, w, h) => {
  bg(g, w, h, '#f6f0d8'); border(g, w, h, 'rgba(120,90,50,0.35)', Math.max(2, w * 0.02));
  txt(g, title, w / 2, h * 0.065, h * 0.06, { w: 'bold', f: F.slab, c: '#b02a1a', max: w * 0.88 });
  txt(g, sub, w / 2, h * 0.122, h * 0.038, { f: F.hand, c: '#5a4a3a', max: w * 0.88 });
  line(g, w * 0.06, h * 0.158, w * 0.94, h * 0.158, '#b02a1a', 3);
  table(g, rows, w * 0.08, h * 0.225, w * 0.84, h * 0.092, h * 0.06, { f: F.hand, c: '#222' });
};
const calendar = (head, sub, col, month = 'OCTUBRE 2026') => (g, w, h) => {
  bg(g, w, h, '#f4efe0'); rect(g, 0, 0, w, h * 0.42, col);
  txt(g, head, w / 2, h * 0.11, h * 0.065, { w: 'bold', c: '#fff', max: w * 0.9 }); txt(g, sub, w / 2, h * 0.22, h * 0.045, { c: '#fff', f: F.serif, max: w * 0.9 });
  circ(g, w / 2, h * 0.33, h * 0.06, 'rgba(255,255,255,0.25)');
  txt(g, month, w / 2, h * 0.47, h * 0.055, { w: 'bold', c: '#333' });
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  days.forEach((d, i) => txt(g, d, w * (0.1 + i * 0.133), h * 0.54, h * 0.04, { w: 'bold', c: i > 4 ? '#b02a2a' : '#555' }));
  for (let d = 0; d < 31; d++) { const k = d + 3; txt(g, String(d + 1), w * (0.1 + (k % 7) * 0.133), h * (0.61 + Math.floor(k / 7) * 0.075), h * 0.04, { c: (k % 7) > 5 ? '#b02a2a' : '#333' }); }
  border(g, w, h, 'rgba(0,0,0,0.25)', 2);
};
const photo = (people, tone, caption) => (g, w, h) => {
  grad(g, w, h, [[0, tone[0]], [1, tone[1]]]);
  const s = Math.min(w / (people.length * 2.4), h * 0.2);
  people.forEach((p, i) => person(g, w * (i + 0.5) / people.length, h * 0.42, s * (p.k ?? 1), p.shirt, p.skin ?? '#a8785a', p.hair ?? '#2a1c14'));
  vignette(g, w, h, 0.5); if (caption) txt(g, caption, w / 2, h * 0.93, h * 0.07, { f: F.hand, c: 'rgba(255,250,235,0.9)', max: w * 0.9 });
  border(g, w, h, '#e8e0cc', Math.max(3, w * 0.03));
};

// ------------------------------------------------------------------ the pictures
const PAINT = {
  picture_virgin(g, w, h) {
    grad(g, w, h, [[0, '#9ec4e8'], [0.6, '#f4e8c8'], [1, '#e8d8a8']]); rays(g, w / 2, h * 0.34, w * 0.2, w * 0.9, 28, 'rgba(255,215,120,0.35)');
    poly(g, [[w * 0.5, h * 0.2], [w * 0.14, h * 0.86], [w * 0.86, h * 0.86]], '#2c58a8'); poly(g, [[w * 0.5, h * 0.4], [w * 0.34, h * 0.86], [w * 0.66, h * 0.86]], '#f2ecda');
    circ(g, w / 2, h * 0.3, w * 0.085, '#e8c8a0'); g.fillStyle = '#2c58a8'; g.beginPath(); g.arc(w / 2, h * 0.29, w * 0.1, Math.PI, 0); g.fill();
    g.lineWidth = w * 0.015; circ(g, w / 2, h * 0.3, w * 0.15, null, '#e8b830'); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; circ(g, w / 2 + Math.cos(a) * w * 0.19, h * 0.3 + Math.sin(a) * w * 0.19, w * 0.01, '#f2d050'); }
    rect(g, 0, h * 0.89, w, h * 0.11, '#3a2a1c'); txt(g, 'VIRGEN DEL CARMEN', w / 2, h * 0.945, h * 0.055, { w: 'bold', c: '#f2d050', max: w * 0.92 });
  },
  picture_heart(g, w, h) {
    grad(g, w, h, [[0, '#f2d8c0'], [1, '#c8503c']]); rays(g, w / 2, h * 0.45, w * 0.22, w, 36, 'rgba(255,230,160,0.45)');
    heart(g, w / 2, h * 0.44, w * 0.3, '#c8201c'); g.strokeStyle = '#6a2a14'; g.lineWidth = w * 0.012; g.beginPath(); g.arc(w / 2, h * 0.44, w * 0.22, 0.05 * Math.PI, 0.95 * Math.PI); g.stroke();
    poly(g, [[w * 0.5, h * 0.2], [w * 0.44, h * 0.3], [w * 0.5, h * 0.27], [w * 0.56, h * 0.3]], '#f2a020'); rect(g, w * 0.485, h * 0.5, w * 0.03, h * 0.14, '#f2e0c0'); rect(g, w * 0.44, h * 0.54, w * 0.12, h * 0.03, '#f2e0c0');
    rect(g, 0, h * 0.8, w, h * 0.2, '#3a2a1c'); txt(g, 'SAGRADO CORAZÓN', w / 2, h * 0.855, h * 0.052, { w: 'bold', c: '#f2d050', max: w * 0.92 }); txt(g, 'Jesús, en Ti confío', w / 2, h * 0.93, h * 0.045, { c: '#f4e8d0', f: F.serif, max: w * 0.9 });
  },
  picture_saint(g, w, h) {
    grad(g, w, h, [[0, '#5a7a9a'], [1, '#d8c8a0']]); circ(g, w / 2, h * 0.3, w * 0.2, 'rgba(255,200,80,0.9)');
    poly(g, [[w * 0.5, h * 0.3], [w * 0.16, h * 0.84], [w * 0.84, h * 0.84]], '#3a7a4a'); poly(g, [[w * 0.5, h * 0.4], [w * 0.3, h * 0.84], [w * 0.7, h * 0.84]], '#8a5a34');
    circ(g, w / 2, h * 0.3, w * 0.1, '#e0b890'); g.fillStyle = '#3a2a1c'; g.beginPath(); g.arc(w / 2, h * 0.28, w * 0.105, Math.PI, 0); g.fill(); circ(g, w / 2, h * 0.19, w * 0.05, '#f08a1a');
    rect(g, 0, h * 0.86, w, h * 0.14, '#3a2a1c'); txt(g, 'SAN JUDAS TADEO', w / 2, h * 0.93, h * 0.06, { w: 'bold', c: '#f2d050', max: w * 0.92 });
  },
  blessing(g, w, h) {
    bg(g, w, h, '#f0e4c4'); border(g, w, h, '#8a5a34', h * 0.08); txt(g, 'BENDICE, SEÑOR,', w / 2, h * 0.34, h * 0.2, { f: F.serif, w: 'bold', c: '#5a3a1c', max: w * 0.84 }); txt(g, 'ESTE HOGAR', w / 2, h * 0.68, h * 0.24, { f: F.serif, w: 'bold', c: '#a82a2a', max: w * 0.84 });
  },
  stations(g, w, h) {
    grad(g, w, h, [[0, '#a8a498'], [1, '#78746a']]); border(g, w, h, '#58544a', w * 0.05); txt(g, 'IV', w / 2, h * 0.42, h * 0.38, { f: F.serif, w: 'bold', c: '#4a463c' }); txt(g, 'VÍA CRUCIS', w / 2, h * 0.8, h * 0.1, { c: '#3a362c', w: 'bold', max: w * 0.8 });
  },
  photo_family_a: photo([{ shirt: '#a83a3a', k: 1 }, { shirt: '#2f5f9a', k: 0.95, skin: '#c89a78' }, { shirt: '#e0c0a0', k: 0.7, skin: '#e0b890' }], ['#d8c098', '#8a6a48'], 'Navidad 2008'),
  photo_family_b: photo([{ shirt: '#3a5a3a' }, { shirt: '#a8a8a0', skin: '#e0b890', hair: '#c8c0b0', k: 0.9 }], ['#c8b890', '#7a5a38'], 'Los abuelos'),
  photo_wedding: photo([{ shirt: '#1c1c20', skin: '#c89a78', k: 1.05 }, { shirt: '#f4f0e8', skin: '#e0b890', hair: '#1c1008' }], ['#e8dcc0', '#9a8458'], 'Mateo y Lucía'),
  photo_grad: (g, w, h) => { photo([{ shirt: '#1c2a48', skin: '#c89a78', hair: '#1c1008' }], ['#d8c8a8', '#7a6a4a'], 'Promoción 2019')(g, w, h); poly(g, [[w * 0.28, h * 0.22], [w * 0.5, h * 0.14], [w * 0.72, h * 0.22], [w * 0.5, h * 0.3]], '#15151a'); line(g, w * 0.72, h * 0.22, w * 0.74, h * 0.34, '#d4a830', 3); },
  photo_collage(g, w, h) {
    bg(g, w, h, '#d8cdb4'); const cells = [['#d8c098', '#8a6a48'], ['#c8d0d8', '#6a7a88'], ['#e0c8a0', '#9a7a50'], ['#c8d4b8', '#6a7a58'], ['#d8b8a8', '#8a5a48'], ['#d0c8d8', '#6a5a78']];
    cells.forEach((c, i) => { const cw = w / 3, ch = h / 2, x = (i % 3) * cw + cw * 0.06, y = Math.floor(i / 3) * ch + ch * 0.07; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, cw * 0.88, ch * 0.86); g.clip(); photo([{ shirt: ['#a83a3a', '#2f5f9a', '#3a7a4a', '#c8a030', '#7a3a7a', '#e0e0d8'][i] }, { shirt: '#f0e8d8', k: 0.8, skin: '#e0b890' }], c)(g, cw * 0.88, ch * 0.86); g.restore(); });
  },
  picture_landscape(g, w, h) {
    grad(g, w, h, [[0, '#7aa8d8'], [0.5, '#f0e0b8']]); circ(g, w * 0.78, h * 0.22, h * 0.08, '#fbe078');
    poly(g, [[0, h * 0.62], [w * 0.2, h * 0.34], [w * 0.38, h * 0.52], [w * 0.58, h * 0.28], [w * 0.8, h * 0.5], [w, h * 0.4], [w, h], [0, h]], '#5a6a8a'); poly(g, [[0, h * 0.74], [w * 0.3, h * 0.55], [w * 0.62, h * 0.7], [w, h * 0.58], [w, h], [0, h]], '#4a8a48');
    poly(g, [[w * 0.2, h * 0.68], [w * 0.5, h * 0.62], [w * 0.8, h * 0.9], [w * 0.1, h * 0.95]], '#3a6a38'); rect(g, w * 0.62, h * 0.62, w * 0.08, h * 0.07, '#e8e0d0'); poly(g, [[w * 0.6, h * 0.62], [w * 0.66, h * 0.56], [w * 0.72, h * 0.62]], '#a8402a');
  },
  picture_flowers(g, w, h) {
    grad(g, w, h, [[0, '#e8e0cc'], [1, '#c8b890']]); rect(g, w * 0.34, h * 0.66, w * 0.32, h * 0.26, '#5a7aa8'); g.fillStyle = '#4a688e'; g.fillRect(w * 0.3, h * 0.64, w * 0.4, h * 0.04);
    for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.22, x = w * 0.5 + Math.sin(a) * w * 0.3, y = h * 0.32 + Math.cos(a * 1.4) * h * 0.1 + (i % 3) * h * 0.04; line(g, w * 0.5, h * 0.66, x, y, '#3a7a38', w * 0.014); circ(g, x, y, w * 0.07, ['#d83a3a', '#f0c030', '#f0f0e8', '#e87aa0'][i % 4]); circ(g, x, y, w * 0.025, '#8a4a1a'); }
  },
  picture_coast(g, w, h) {
    grad(g, w, h, [[0, '#f0a868'], [0.45, '#f8d8a0'], [0.46, '#3a8ac0'], [1, '#1c5a8a']]); circ(g, w * 0.7, h * 0.36, h * 0.09, '#fff2c0'); rect(g, 0, h * 0.82, w, h * 0.18, '#e8d098');
    line(g, w * 0.2, h * 0.9, w * 0.26, h * 0.5, '#5a3a1c', w * 0.02); for (let i = 0; i < 6; i++) { const a = -2.6 + i * 0.5; line(g, w * 0.26, h * 0.5, w * 0.26 + Math.cos(a) * w * 0.14, h * 0.5 + Math.sin(a) * h * 0.14 + h * 0.06, '#2a7a38', w * 0.016); }
  },
  kids_drawing_a(g, w, h) {
    bg(g, w, h, '#f6f2e6'); circ(g, w * 0.82, h * 0.14, w * 0.09, '#f8c818'); rays(g, w * 0.82, h * 0.14, w * 0.11, w * 0.16, 10, '#f8c818'); rect(g, w * 0.2, h * 0.4, w * 0.5, h * 0.34, '#e85a3a'); poly(g, [[w * 0.14, h * 0.4], [w * 0.45, h * 0.18], [w * 0.76, h * 0.4]], '#3a6ad0'); rect(g, w * 0.4, h * 0.54, w * 0.12, h * 0.2, '#8a5a2a'); rect(g, w * 0.25, h * 0.46, w * 0.1, h * 0.1, '#a8d8f0'); rect(g, 0, h * 0.74, w, h * 0.26, '#58b848');
    for (let i = 0; i < 3; i++) { circ(g, w * (0.2 + i * 0.22), h * 0.82, w * 0.04, '#e8c8a0'); line(g, w * (0.2 + i * 0.22), h * 0.86, w * (0.2 + i * 0.22), h * 0.94, '#222', 3); }
    txt(g, 'MI FAMILIA', w / 2, h * 0.07, h * 0.07, { f: F.hand, c: '#c82a2a', max: w * 0.7, w: 'bold' });
  },
  kids_drawing_b(g, w, h) {
    bg(g, w, h, '#f4f0e0'); grad(g, w, h * 0.6, [[0, '#a8d8f0'], [1, '#f6f2e6']]); rect(g, 0, h * 0.6, w, h * 0.4, '#68b858'); for (let i = 0; i < 4; i++) { const x = w * (0.18 + i * 0.22); line(g, x, h * 0.9, x, h * 0.66, '#3a8a38', 4); circ(g, x, h * 0.64, w * 0.05, ['#e83a3a', '#f8c818', '#e870a8', '#fff'][i]); }
    circ(g, w * 0.14, h * 0.16, w * 0.07, '#f8c818'); txt(g, 'Mi jardín', w * 0.6, h * 0.14, h * 0.13, { f: F.hand, c: '#2a5ac0', w: 'bold', max: w * 0.6 }); txt(g, '¡Te quiero, mamá!', w / 2, h * 0.96, h * 0.07, { f: F.hand, c: '#c82a2a', max: w * 0.9 });
  },
  poster_football_a(g, w, h) { football(g, w, h, '#d8a020', '#1c1c20', 'DEPORTIVO\nLA LADERA', 'Domingo 3 p. m.\nCancha del mirador'); },
  poster_football_b(g, w, h) { football(g, w, h, '#2f6fbf', '#f4f0e0', 'GRAN FINAL\nDEL BARRIO', '¡Todos a la cancha!\nEntrada libre'); },
  poster_football_c(g, w, h) { football(g, w, h, '#2f9a58', '#f4f0e0', 'COPA LADERA', 'Unión Cumbre vs. Real Montaña\nSábado 4 p. m.'); },
  poster_music(g, w, h) {
    grad(g, w, h, [[0, '#4a1c7a'], [1, '#d8407a']]); rays(g, w / 2, h * 0.4, w * 0.15, w, 30, 'rgba(255,220,120,0.18)'); txt(g, 'NOCHE', w / 2, h * 0.16, h * 0.14, { f: F.slab, c: '#ffe070', max: w * 0.9 }); txt(g, 'DE SALSA', w / 2, h * 0.3, h * 0.14, { f: F.slab, c: '#fff', max: w * 0.9 });
    ['♪', '♫', '♪'].forEach((n, i) => txt(g, n, w * (0.25 + i * 0.25), h * (0.5 + (i % 2) * 0.08), h * 0.15, { c: '#ffe070' })); lines(g, ['Sábado 8 p. m.', 'Salón Comunal', 'Entrada libre'], w / 2, h * 0.74, h * 0.07, h * 0.055, { c: '#fff', w: 'bold', max: w * 0.9 });
  },
  poster_map(g, w, h) {
    bg(g, w, h, '#b8d8e8'); const pts = [[0.42, 0.04], [0.55, 0.02], [0.66, 0.1], [0.78, 0.12], [0.9, 0.22], [0.95, 0.32], [0.86, 0.4], [0.9, 0.52], [0.82, 0.62], [0.88, 0.72], [0.8, 0.85], [0.7, 0.9], [0.62, 0.98], [0.55, 0.9], [0.5, 0.74], [0.38, 0.7], [0.28, 0.6], [0.22, 0.5], [0.2, 0.4], [0.24, 0.3], [0.3, 0.22], [0.36, 0.12]];
    poly(g, pts.map(([x, y]) => [w * (0.1 + x * 0.55), h * (0.06 + y * 0.88)]), '#8ac86a', '#3a6a2a'); [[0.46, 0.4], [0.44, 0.5], [0.5, 0.3], [0.6, 0.55]].forEach(([x, y]) => circ(g, w * (0.1 + x * 0.55), h * (0.06 + y * 0.88), w * 0.014, '#c82a2a'));
    txt(g, 'COLOMBIA', w * 0.78, h * 0.12, h * 0.07, { w: 'bold', c: '#1c3a5a', f: F.serif }); txt(g, 'Mapa político', w * 0.78, h * 0.2, h * 0.04, { c: '#1c3a5a' });
  },
  calendar_pharma: calendar('DROGUERÍA SAN JOSÉ', 'Su salud, nuestra prioridad', '#2f9a58'),
  calendar_church: calendar('PARROQUIA DEL CARMEN', 'Octubre, mes del Rosario', '#6a3a8a'),
  calendar_tienda: calendar('TIENDA DOÑA ROSA', 'Hoy no se fía, mañana sí', '#c8502a'),
  diploma(g, w, h) {
    bg(g, w, h, '#f6f0dc'); border(g, w, h, '#b8902a', h * 0.05); txt(g, 'DIPLOMA', w / 2, h * 0.17, h * 0.15, { f: F.serif, w: 'bold', c: '#2a3a5a' }); lines(g, ['Se otorga el título de', 'BACHILLER ACADÉMICO', 'a Camila Rodríguez'], w / 2, h * 0.4, h * 0.14, h * 0.085, { f: F.serif, c: '#333', max: w * 0.84 });
    txt(g, 'Institución Educativa La Ladera · 2019', w / 2, h * 0.8, h * 0.06, { f: F.serif, c: '#555', max: w * 0.84 }); circ(g, w * 0.82, h * 0.78, h * 0.08, '#c8302a');
  },
  exam_notes(g, w, h) {
    bg(g, w, h, '#faf8f0'); for (let i = 0; i < 12; i++) line(g, 0, h * (0.2 + i * 0.065), w, h * (0.2 + i * 0.065), '#a8c4e0', 1.5); line(g, w * 0.14, 0, w * 0.14, h, '#e08a8a', 2);
    txt(g, 'Evaluación de Matemáticas', w / 2, h * 0.07, h * 0.055, { f: F.hand, c: '#2a3a8a', max: w * 0.9 }); lines(g, ['3 + 4 = 7', '12 − 5 = 7', '6 × 3 = 18'], w * 0.2, h * 0.3, h * 0.12, h * 0.075, { f: F.hand, c: '#2a3a8a', a: 'left' });
    txt(g, '5.0', w * 0.74, h * 0.8, h * 0.18, { f: F.hand, c: '#d02a2a', w: 'bold', r: -0.2 }); txt(g, '¡Muy bien!', w * 0.7, h * 0.93, h * 0.07, { f: F.hand, c: '#d02a2a', r: -0.1 });
  },
  notice_rent(g, w, h) {
    bg(g, w, h, '#f4f0e0'); border(g, w, h, '#c01c1c', Math.max(3, w * 0.04));
    txt(g, 'SE', w / 2, h * 0.13, h * 0.11, { f: F.slab, c: '#c01c1c' }); txt(g, 'ARRIENDA', w / 2, h * 0.27, h * 0.12, { f: F.slab, c: '#c01c1c', max: w * 0.86 });
    lines(g, ['Pieza con baño', 'Informes:', '310 555 0142'], w / 2, h * 0.47, h * 0.12, h * 0.075, { c: '#222', w: 'bold', max: w * 0.86 });
    for (let i = 0; i < 6; i++) { const x = w * (0.1 + i * 0.14); rect(g, x, h * 0.8, w * 0.1, h * 0.15, '#e6dcc0'); line(g, x + w * 0.05, h * 0.82, x + w * 0.05, h * 0.93, '#a89870', 1); }
  },
  chores(g, w, h) {
    bg(g, w, h, '#fff6d0'); txt(g, 'TAREAS DE LA CASA', w / 2, h * 0.09, h * 0.07, { w: 'bold', f: F.hand, c: '#c04a1a', max: w * 0.92 });
    ['Lunes · Barrer', 'Martes · Lavar los platos', 'Miércoles · Sacar la basura', 'Jueves · Trapear', 'Viernes · Ordenar el cuarto'].forEach((s, i) => { rect(g, w * 0.07, h * (0.2 + i * 0.15) - h * 0.025, h * 0.05, h * 0.05, i < 2 ? '#58a848' : '#fff'); border2(g, w * 0.07, h * (0.2 + i * 0.15) - h * 0.025, h * 0.05); txt(g, s, w * 0.17, h * (0.2 + i * 0.15), h * 0.055, { f: F.hand, c: '#333', a: 'left', max: w * 0.78 }); });
  },
  price_list(g, w, h) {
    bg(g, w, h, '#f6f0d8'); txt(g, 'LISTA DE PRECIOS', w / 2, h * 0.07, h * 0.065, { w: 'bold', f: F.slab, c: '#b02a1a', max: w * 0.9 }); line(g, w * 0.06, h * 0.13, w * 0.94, h * 0.13, '#b02a1a', 3);
    table(g, [['Arroz (libra)', '$2.800'], ['Huevo (unidad)', '$600'], ['Panela', '$3.500'], ['Leche (bolsa)', '$3.600'], ['Aceite (litro)', '$11.000'], ['Café (libra)', '$9.500'], ['Gaseosa 1,5 L', '$5.500'], ['Papa (libra)', '$1.800']], w * 0.08, h * 0.2, w * 0.84, h * 0.095, h * 0.062, { f: F.hand, c: '#222' });
  },
  price_meat: priceBoard('CARNICERÍA', 'Precio por libra', [['Carne molida', '$13.000'], ['Lomo de res', '$22.000'], ['Costilla de res', '$14.500'], ['Costilla de cerdo', '$15.000'], ['Chicharrón', '$16.000'], ['Pollo entero', '$7.800'], ['Pechuga', '$11.500'], ['Chorizo (unidad)', '$2.500']]),
  price_bread: priceBoard('PANADERÍA', 'Recién horneado', [['Pan francés', '$400'], ['Pan de bono', '$1.200'], ['Almojábana', '$1.500'], ['Buñuelo', '$1.200'], ['Pan de queso', '$1.800'], ['Mogolla integral', '$900'], ['Croissant', '$2.800'], ['Torta (porción)', '$3.500']]),
  price_hair: priceBoard('PELUQUERÍA', 'Tarifas', [['Corte caballero', '$12.000'], ['Corte dama', '$20.000'], ['Corte niño', '$8.000'], ['Barba', '$6.000'], ['Cejas', '$4.000'], ['Tinte', '$35.000'], ['Alisado', '$60.000'], ['Peinado', '$15.000']]),
  price_ferre: priceBoard('FERRETERÍA', 'Precios de hoy', [['Cemento (bulto)', '$32.000'], ['Varilla 3/8', '$18.500'], ['Tubo PVC 1/2"', '$9.000'], ['Pintura (galón)', '$58.000'], ['Martillo', '$22.000'], ['Clavos (libra)', '$4.500'], ['Bombillo LED', '$5.000'], ['Candado', '$12.000']]),
  price_papel: priceBoard('PAPELERÍA', 'Útiles y copias', [['Cuaderno 100 h.', '$4.500'], ['Lápiz', '$800'], ['Esfero', '$1.000'], ['Resma carta', '$16.000'], ['Fotocopia', '$100'], ['Impresión', '$300'], ['Colores x12', '$6.500'], ['Cartulina', '$1.200']]),
  price_shoes: priceBoard('ZAPATERÍA', 'Arreglos', [['Media suela', '$18.000'], ['Tacón (par)', '$8.000'], ['Cremallera', '$12.000'], ['Pegar suela', '$10.000'], ['Limpiada', '$3.000'], ['Cordones (par)', '$2.000'], ['Tintura', '$15.000'], ['Plantillas', '$7.000']]),
  price_minutos: priceBoard('MINUTOS', 'Tarifas por minuto', [['A celular', '$200'], ['A fijo', '$100'], ['A Venezuela', '$450'], ['A España', '$500'], ['Internet (hora)', '$2.000'], ['Recarga mínima', '$2.000'], ['Impresión', '$300'], ['Fotocopia', '$100']]),
  price_modista: priceBoard('MODISTA', 'Arreglos y confección', [['Ruedo de pantalón', '$6.000'], ['Cambio de cierre', '$10.000'], ['Entallar camisa', '$12.000'], ['Arreglo de falda', '$8.000'], ['Vestido a medida', '$90.000'], ['Uniforme escolar', '$45.000'], ['Bordado', '$15.000'], ['Botones', '$1.000']]),
  price_solda: priceBoard('SOLDADURA', 'Rejas, portones y estructuras', [['Reja de ventana (m²)', '$95.000'], ['Portón sencillo', '$480.000'], ['Reparar una reja', '$25.000'], ['Escalera metálica', '$190.000'], ['Soldadura (hora)', '$15.000'], ['Corte y doblez', '$8.000'], ['Anticorrosivo', '$12.000'], ['Presupuesto', 'gratis']]),
  price_taller: priceBoard('TALLER', 'Servicio de motos', [['Cambio de aceite', '$25.000'], ['Pinchazo', '$8.000'], ['Kit de arrastre', '$60.000'], ['Frenos', '$30.000'], ['Sincronización', '$55.000'], ['Lavado', '$10.000'], ['Bujía', '$12.000'], ['Revisión', '$15.000']]),
  barber_pole(g, w, h) {                                                       // the striped pole of every barber, behind glass
    bg(g, w, h, '#2a2a30'); const cap = h * 0.09;
    g.save(); g.beginPath(); g.rect(w * 0.1, cap, w * 0.8, h - 2 * cap); g.clip(); rect(g, 0, cap, w, h - 2 * cap, '#f4f0e8');
    const P = h * 0.2;
    for (let k = -3; k < 8; k++) for (const [off, col] of [[0, '#c82a2a'], [P / 2, '#2f5fa8']]) { const y = cap + k * P + off; poly(g, [[0, y], [w, y - w * 0.9], [w, y - w * 0.9 + P * 0.25], [0, y + P * 0.25]], col); }
    g.restore();
    const gr = g.createLinearGradient(w * 0.1, 0, w * 0.9, 0); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.3)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = gr; g.fillRect(w * 0.1, cap, w * 0.8, h - 2 * cap);
    rect(g, 0, 0, w, cap, '#b8b8bc'); rect(g, 0, h - cap, w, cap, '#b8b8bc'); rect(g, 0, cap * 0.8, w, cap * 0.25, '#7a7a7e'); rect(g, 0, h - cap * 1.05, w, cap * 0.25, '#7a7a7e');
  },
  menu_board(g, w, h) {
    bg(g, w, h, '#2a2e2a'); border(g, w, h, '#6b4226', w * 0.04); txt(g, 'MENÚ DEL DÍA', w / 2, h * 0.09, h * 0.075, { f: F.hand, w: 'bold', c: '#f4f0e0', max: w * 0.8 }); line(g, w * 0.1, h * 0.15, w * 0.9, h * 0.15, 'rgba(255,255,255,0.7)', 3);
    table(g, [['Sancocho de gallina', '$14.000'], ['Bandeja paisa', '$18.000'], ['Sopa + seco', '$12.000'], ['Arepa con queso', '$3.500'], ['Jugo natural', '$3.500'], ['Tinto', '$1.200']], w * 0.1, h * 0.25, w * 0.8, h * 0.115, h * 0.058, { f: F.hand, c: '#f4f0e0' });
    txt(g, '¡Pregunte por el fríjol!', w / 2, h * 0.93, h * 0.055, { f: F.hand, c: '#f2d050', max: w * 0.8 });
  },
  sign_tienda: board({ bg: '#b8321e', fg: '#fff1c0', fg2: '#ffe08a', title: 'TIENDA', sub: 'De todo un poco', border: '#f2d050' }),
  sign_fruver: board({ bg: '#2f7a3a', fg: '#fff6c8', fg2: '#ffe27a', title: 'FRUTAS Y VERDURAS', sub: 'Fresco del campo', border: '#e8c030' }),
  sign_carne: board({ bg: '#8a1c1c', fg: '#fff1e0', fg2: '#ffd9b0', title: 'CARNICERÍA', sub: 'Carne fresca todos los días', border: '#e8d0b0' }),
  sign_resto: board({ bg: '#7a4a1a', fg: '#ffe9a8', fg2: '#ffffff', title: 'RESTAURANTE', sub: 'Almuerzos · Sancocho · Bandeja', border: '#f2d050' }),
  sign_papel: board({ bg: '#1f5fa8', fg: '#ffffff', fg2: '#ffe27a', title: 'PAPELERÍA', sub: 'Útiles · Copias · Impresiones', border: '#ffe27a' }),
  sign_modista: board({ bg: '#8a2a62', fg: '#fff0f6', fg2: '#ffd0e8', title: 'MODISTA', sub: 'Arreglos y confección', border: '#ffd0e8' }),
  sign_zapa: board({ bg: '#3a2a1c', fg: '#ffe9a8', fg2: '#f4e8d0', title: 'ZAPATERÍA', sub: 'Remontamos su calzado', border: '#c8a050' }),
  sign_soldadura: board({ bg: '#2a2a2e', fg: '#ff9a3a', fg2: '#e8e8e8', title: 'TALLER DE SOLDADURA', sub: 'Rejas · Portones · Estructuras', border: '#ff9a3a' }),
  sign_taller: board({ bg: '#2a2a2e', fg: '#ffd23a', fg2: '#e8e8e8', title: 'TALLER DE MOTOS', sub: 'Mecánica · Frenos · Llantas', border: '#ffd23a' }),
  sign_tinto: board({ bg: '#2a1c14', fg: '#f2d050', fg2: '#f4e8d0', title: 'TINTO', sub: '$1.200 · pan y buñuelo', border: '#6b4226' }),
  sign_pan: board({ bg: '#7a3a1a', fg: '#f8e0a0', fg2: '#f4e8d0', title: 'PANADERÍA', sub: 'Pan caliente todo el día', border: '#d8a050', f: F.serif, f2: F.serif }),
  sign_pharma(g, w, h) { bg(g, w, h, '#f6f6f2'); rect(g, w * 0.38, h * 0.12, w * 0.24, h * 0.52, '#2f9a58'); rect(g, w * 0.2, h * 0.3, w * 0.6, h * 0.2, '#2f9a58'); txt(g, 'DROGUERÍA', w / 2, h * 0.8, h * 0.13, { w: 'bold', c: '#1f7a3e', max: w * 0.9 }); txt(g, 'San José', w / 2, h * 0.93, h * 0.08, { c: '#444', max: w * 0.9 }); },
  sign_barber(g, w, h) {
    bg(g, w, h, '#15264a'); border(g, w, h, '#f4f0e4', h * 0.05);
    txt(g, 'PELUQUERÍA', w / 2, h * 0.34, h * 0.3, { f: F.slab, c: '#ffffff', max: w * 0.86 }); txt(g, 'Cortes · Barba · Tintes', w / 2, h * 0.62, h * 0.13, { c: '#f2c230', w: 'bold', max: w * 0.84 });
    const n = 12, sw = w * 0.84 / n, y0 = h * 0.76, hh = h * 0.13;                       // red, white and blue barber stripes along the foot of the sign
    g.save(); g.beginPath(); g.rect(w * 0.08, y0, w * 0.84, hh); g.clip();
    for (let i = -2; i < n + 2; i++) { const x = w * 0.08 + i * sw; poly(g, [[x, y0 + hh], [x + sw, y0 + hh], [x + sw + hh * 0.7, y0], [x + hh * 0.7, y0]], ['#d42a2a', '#f4f0e8', '#2f5fa8'][((i % 3) + 3) % 3]); }
    g.restore();
  },
  sign_minutos: board({ bg: '#1c2a48', fg: '#ffffff', fg2: '#e8c030', title: 'MINUTOS', sub: 'Llamadas · Datos · Recargas', border: '#e8c030' }),
  sign_ferre: board({ bg: '#2a2a2a', fg: '#f2c030', fg2: '#f4f0e0', title: 'FERRETERÍA', sub: 'Todo para su obra', border: '#f2c030' }),
  chalkboard(g, w, h) {
    grad(g, w, h, [[0, '#2f4a3c'], [1, '#243a2e']]); g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 40; i++) g.fillRect(w * (i * 0.377 % 1), h * (i * 0.61 % 1), w * 0.15, h * 0.012);
    txt(g, 'Lunes 14 de octubre', w * 0.06, h * 0.12, h * 0.12, { f: F.hand, c: '#f4f0e0', a: 'left' }); lines(g, ['Las vocales:  a  e  i  o  u', '3 + 4 = 7        6 + 2 = 8', 'Tarea: copiar la página 12'], w * 0.08, h * 0.34, h * 0.2, h * 0.11, { f: F.hand, c: '#f4f0e0', a: 'left', max: w * 0.84 });
    txt(g, 'Sin tareas no hay recreo', w * 0.94, h * 0.9, h * 0.07, { f: F.hand, c: '#f2d050', a: 'right', r: -0.03 });
  },
  alphabet_chart(g, w, h) {
    bg(g, w, h, '#fff4d0'); const L = ['A a', 'B b', 'C c', 'D d', 'E e', 'F f', 'G g', 'H h'], W = ['abeja', 'barco', 'casa', 'dedo', 'escuela', 'flor', 'gato', 'helado'], C = ['#d83a3a', '#2f6fbf', '#2f9a58', '#e8a020', '#8a3a9a', '#d8506a', '#2a8a8a', '#c86a20'];
    L.forEach((l, i) => { const x = w * (0.0625 + i * 0.125); txt(g, l, x, h * 0.4, h * 0.3, { f: F.slab, c: C[i], max: w * 0.11 }); txt(g, W[i], x, h * 0.78, h * 0.085, { f: F.hand, c: '#333', max: w * 0.118 }); });
  },
  times_table(g, w, h) {
    bg(g, w, h, '#e8f0fa'); border(g, w, h, '#2f6fbf', w * 0.04); txt(g, 'TABLA DEL 6', w / 2, h * 0.08, h * 0.07, { f: F.slab, c: '#2f6fbf', max: w * 0.8 });
    for (let i = 1; i <= 10; i++) txt(g, `6 × ${i} = ${6 * i}`, w * 0.5, h * (0.13 + i * 0.081), h * 0.058, { f: F.hand, c: i % 2 ? '#222' : '#c82a2a' });
  },
  flag_co(g, w, h) { rect(g, -GUT, -GUT, w + 2 * GUT, h * 0.5 + GUT, '#f8d020'); rect(g, -GUT, h * 0.5, w + 2 * GUT, h * 0.25, '#1d4f9a'); rect(g, -GUT, h * 0.75, w + 2 * GUT, h * 0.25 + GUT, '#c8202a'); },
  schedule(g, w, h) {
    bg(g, w, h, '#f4f0e0'); border(g, w, h, '#2a3a5a', 4); txt(g, 'HORARIO', w / 2, h * 0.08, h * 0.075, { f: F.slab, c: '#2a3a5a' });
    table(g, [['7:00', 'Formación'], ['7:30', 'Matemáticas'], ['9:00', 'Descanso'], ['9:30', 'Español'], ['11:00', 'Ciencias'], ['12:30', 'Salida']], w * 0.1, h * 0.2, w * 0.8, h * 0.13, h * 0.062, { f: F.hand, c: '#222' });
  },
  eye_chart(g, w, h) {
    bg(g, w, h, '#f6f6f2'); ['E', 'F P', 'T O Z', 'L P E D', 'P E C F D', 'E D F C Z P', 'F E L O P Z D'].forEach((s, i) => txt(g, s, w / 2, h * (0.09 + i * 0.125) + h * 0.02 * (7 - i) * 0.1, h * (0.15 - i * 0.017), { f: F.sans, w: 'bold', c: '#111', max: w * 0.9 }));
  },
  health_poster(g, w, h) {
    grad(g, w, h, [[0, '#3a9ac0'], [1, '#d8f0f8']]); txt(g, 'LÁVESE', w / 2, h * 0.09, h * 0.09, { f: F.slab, c: '#fff', max: w * 0.86 }); txt(g, 'LAS MANOS', w / 2, h * 0.19, h * 0.09, { f: F.slab, c: '#fff', max: w * 0.86 });
    ['Moje sus manos', 'Use jabón', 'Frote 20 segundos', 'Enjuague y seque'].forEach((s, i) => { const y = h * (0.33 + i * 0.16); circ(g, w * 0.14, y, h * 0.05, '#fff'); txt(g, String(i + 1), w * 0.14, y, h * 0.06, { w: 'bold', c: '#1c6a8a' }); txt(g, s, w * 0.24, y, h * 0.058, { c: '#0c3a4a', a: 'left', w: 'bold', max: w * 0.7 }); });
  },
  vaccines(g, w, h) {
    bg(g, w, h, '#f6faf6'); border(g, w, h, '#2f9a58', 5); txt(g, 'ESQUEMA DE VACUNACIÓN', w / 2, h * 0.07, h * 0.055, { w: 'bold', c: '#1f7a3e', max: w * 0.9 });
    [['Recién nacido', 'BCG · Hepatitis B'], ['2 meses', 'Pentavalente · Polio'], ['6 meses', 'Influenza'], ['12 meses', 'Triple viral'], ['5 años', 'Refuerzos']].forEach(([a, b], i) => { const y = h * (0.2 + i * 0.16); rect(g, w * 0.06, y - h * 0.05, w * 0.88, h * 0.1, i % 2 ? '#e8f4e8' : '#d8ecd8'); txt(g, a, w * 0.09, y, h * 0.048, { w: 'bold', a: 'left', c: '#1f5a30', max: w * 0.38 }); txt(g, b, w * 0.9, y, h * 0.045, { a: 'right', c: '#333', max: w * 0.46 }); });
  },
};
const border2 = (g, x, y, s) => { g.strokeStyle = '#444'; g.lineWidth = 2; g.strokeRect(x, y, s, s); };
function football(g, w, h, c1, c2, title, sub) {
  grad(g, w, h, [[0, c1], [1, '#101418']]); rays(g, w / 2, h * 0.5, w * 0.1, w, 24, 'rgba(255,255,255,0.1)'); lines(g, title.split('\n'), w / 2, h * 0.1, h * 0.095, h * 0.085, { f: F.slab, c: c2, max: w * 0.9 });
  rect(g, 0, h * 0.5, w, h * 0.22, '#3a8a40'); for (let i = 0; i < 6; i++) rect(g, w * i / 6, h * 0.5, w / 12, h * 0.22, 'rgba(255,255,255,0.07)'); line(g, w / 2, h * 0.5, w / 2, h * 0.72, 'rgba(255,255,255,0.7)', 2); circ(g, w / 2, h * 0.61, h * 0.05, null, 'rgba(255,255,255,0.7)');
  [[0.22, 0.58, '#d8a020'], [0.4, 0.64, '#d8a020'], [0.6, 0.57, '#2f6fbf'], [0.78, 0.65, '#2f6fbf']].forEach(([x, y, c]) => { circ(g, w * x, h * (y - 0.07), h * 0.025, '#d8a880'); rect(g, w * x - h * 0.02, h * (y - 0.045), h * 0.04, h * 0.05, c); rect(g, w * x - h * 0.02, h * (y + 0.005), h * 0.04, h * 0.05, '#222'); });
  circ(g, w * 0.5, h * 0.66, h * 0.013, '#fff'); lines(g, sub.split('\n'), w / 2, h * 0.82, h * 0.075, h * 0.052, { c: '#f4f0e0', w: 'bold', max: w * 0.9 });
}

// ------------------------------------------------------------------ generated families (decals.js `gen`): one painter per number, each from its own seeded stream
const rngOf = (seed) => { let s = Math.imul(seed + 1, 2654435761) >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const pickOf = (r, a) => a[Math.floor(r() * a.length)];
const SHIRTS = ['#a83a3a', '#2f5f9a', '#3a7a4a', '#c8a030', '#7a3a7a', '#e0e0d8', '#d8703a', '#2a2a30', '#d86a8a', '#4a8a9a'];
const SKINS = ['#a8785a', '#c89a78', '#e0b890', '#8a5a3e', '#d0a07c'];
const HAIRS = ['#2a1c14', '#1c1008', '#4a2c18', '#c8c0b0', '#6a4a2a'];
const TONES = [['#d8c098', '#8a6a48'], ['#c8d0d8', '#6a7a88'], ['#e0c8a0', '#9a7a50'], ['#c8d4b8', '#6a7a58'], ['#d8b8a8', '#8a5a48'], ['#d0c8d8', '#6a5a78'], ['#e8dcc0', '#9a8458']];
const CAPTIONS = ['Navidad 2011', 'Primera comunión', 'Cumpleaños de mamá', 'Paseo al río', 'Día de la madre', 'Año nuevo 2015', 'El bautizo', 'Los quince años', 'Fiesta de grado', 'Con los primos', 'La finca de los tíos', 'Semana Santa 2012'];
const famPhoto = (i) => (g, w, h) => {
  const r = rngOf(i), n = 2 + Math.floor(r() * 3);
  const people = Array.from({ length: n }, (_, j) => ({ shirt: pickOf(r, SHIRTS), skin: pickOf(r, SKINS), hair: pickOf(r, HAIRS), k: j === n - 1 && r() < 0.5 ? 0.7 : 0.85 + r() * 0.2 }));
  photo(people, pickOf(r, TONES), CAPTIONS[(i * 5) % CAPTIONS.length])(g, w, h);
};
const SKIES = [['#7aa8d8', '#f0e0b8'], ['#f0a868', '#f8e0b0'], ['#a8c0d8', '#e8e8e0'], ['#5a7aa8', '#d8c8a8'], ['#e8c0a0', '#f4e4c8']];
const landscapeV = (i) => (g, w, h) => {
  const r = rngOf(i + 100), sky = pickOf(r, SKIES);
  grad(g, w, h, [[0, sky[0]], [0.55, sky[1]]]); circ(g, w * (0.2 + r() * 0.6), h * (0.16 + r() * 0.12), h * (0.06 + r() * 0.04), r() < 0.7 ? '#fbe078' : '#f4f0e0');
  const ridge = (base, amp, col) => { const pts = [[0, h]]; for (let k = 0; k <= 8; k++) pts.push([w * k / 8, h * (base - amp * r())]); pts.push([w, h]); poly(g, pts, col); };
  ridge(0.62, 0.3, pickOf(r, ['#5a6a8a', '#6a7a9a', '#4a5a7a'])); ridge(0.78, 0.2, pickOf(r, ['#4a8a48', '#5a9a50', '#6a8a40'])); ridge(0.95, 0.12, pickOf(r, ['#3a6a38', '#4a7a30']));
  if (r() < 0.6) { const x = w * (0.3 + r() * 0.4), y = h * 0.8; rect(g, x, y, w * 0.08, h * 0.06, '#e8e0d0'); poly(g, [[x - w * 0.015, y], [x + w * 0.04, y - h * 0.06], [x + w * 0.095, y]], pickOf(r, ['#a8402a', '#8a3a2a', '#b85a30'])); }
  if (r() < 0.5) for (let t = 0; t < 3; t++) { const x = w * (0.1 + r() * 0.8), y = h * (0.86 + r() * 0.08); rect(g, x, y - h * 0.08, w * 0.012, h * 0.08, '#5a3a1c'); circ(g, x + w * 0.006, y - h * 0.1, w * 0.035, '#2a6a30'); }
};
const coastV = (i) => (g, w, h) => {
  const r = rngOf(i + 200), warm = pickOf(r, [['#f0a868', '#f8d8a0'], ['#e8806a', '#f8c8a0'], ['#a8c8e8', '#f4ecd0'], ['#f0c870', '#f8e8b8']]);
  grad(g, w, h, [[0, warm[0]], [0.45, warm[1]], [0.46, pickOf(r, ['#3a8ac0', '#2a7aa8', '#3a9ab0'])], [1, '#1c5a8a']]); circ(g, w * (0.2 + r() * 0.6), h * (0.3 + r() * 0.1), h * 0.09, '#fff2c0'); rect(g, 0, h * 0.82, w, h * 0.18, '#e8d098');
  if (r() < 0.6) { const x = w * (0.55 + r() * 0.25), y = h * 0.62; poly(g, [[x, y], [x, y - h * 0.22], [x + w * 0.12, y]], '#f4f0e0'); rect(g, x - w * 0.04, y, w * 0.2, h * 0.025, '#6a3a1c'); }
  const px = w * (0.12 + r() * 0.3); line(g, px, h * 0.9, px + w * 0.05, h * 0.5, '#5a3a1c', w * 0.02);
  for (let k = 0; k < 6; k++) { const a = -2.6 + k * 0.5; line(g, px + w * 0.05, h * 0.5, px + w * 0.05 + Math.cos(a) * w * 0.14, h * 0.5 + Math.sin(a) * h * 0.14 + h * 0.06, '#2a7a38', w * 0.016); }
};
const flowersV = (i) => (g, w, h) => {
  const r = rngOf(i + 300), ground = pickOf(r, [['#e8e0cc', '#c8b890'], ['#d8e4e0', '#a8bcb0'], ['#f0dcd0', '#d0a890']]), pal = pickOf(r, [['#d83a3a', '#f0c030', '#f0f0e8', '#e87aa0'], ['#e8a020', '#f8d848', '#c85a1a', '#f0f0e8'], ['#7a4ab8', '#e87aa0', '#f0f0e8', '#4a6ad0']]);
  grad(g, w, h, [[0, ground[0]], [1, ground[1]]]); rect(g, w * 0.34, h * 0.66, w * 0.32, h * 0.26, pickOf(r, ['#5a7aa8', '#a8503a', '#4a8a6a', '#8a5a9a'])); rect(g, w * 0.3, h * 0.64, w * 0.4, h * 0.04, 'rgba(0,0,0,0.22)');
  const n = 7 + Math.floor(r() * 5);
  for (let k = 0; k < n; k++) { const a = -0.9 + k * (1.8 / (n - 1)), x = w * 0.5 + Math.sin(a) * w * 0.3, y = h * 0.32 + Math.cos(a * 1.4) * h * 0.1 + (k % 3) * h * 0.04; line(g, w * 0.5, h * 0.66, x, y, '#3a7a38', w * 0.014); circ(g, x, y, w * (0.05 + r() * 0.03), pal[k % 4]); circ(g, x, y, w * 0.022, '#8a4a1a'); }
};
/** A child's drawing, one subject per number, in wobbly crayon with its own title. */
const kidsDraw = (i) => (g, w, h) => {
  const r = rngOf(i + 400), sub = (i - 1) % 6, sun = () => { circ(g, w * 0.84, h * 0.14, w * 0.08, '#f8c818'); rays(g, w * 0.84, h * 0.14, w * 0.1, w * 0.15, 9, '#f8c818'); };
  bg(g, w, h, pickOf(r, ['#f6f2e6', '#f4f0e0', '#faf6ea'])); rect(g, 0, h * 0.74, w, h * 0.12, pickOf(r, ['#58b848', '#68c058', '#8ac060'])); rect(g, 0, h * 0.86, w, h * 0.14, '#faf6ea');
  const title = ['MI PERRO', 'EL ARCOÍRIS', 'MI CARRO', 'MI MAMÁ', 'EL PEZ', 'MI ESCUELA'][sub];
  if (sub === 0) { sun(); g.fillStyle = '#8a5a2a'; g.beginPath(); g.ellipse(w * 0.5, h * 0.62, w * 0.24, h * 0.1, 0, 0, Math.PI * 2); g.fill(); circ(g, w * 0.76, h * 0.54, w * 0.09, '#8a5a2a'); poly(g, [[w * 0.7, h * 0.47], [w * 0.68, h * 0.38], [w * 0.74, h * 0.46]], '#5a3a18'); [0.34, 0.42, 0.58, 0.64].forEach((x) => line(g, w * x, h * 0.68, w * x, h * 0.8, '#5a3a18', 4)); line(g, w * 0.26, h * 0.58, w * 0.18, h * 0.5, '#8a5a2a', 5); }
  if (sub === 1) { ['#e83a3a', '#f08a20', '#f8d818', '#58b848', '#3a6ad0', '#8a3aa8'].forEach((c, k) => { g.strokeStyle = c; g.lineWidth = w * 0.035; g.beginPath(); g.arc(w * 0.5, h * 0.8, w * (0.42 - k * 0.04), Math.PI, 0); g.stroke(); }); circ(g, w * 0.14, h * 0.74, w * 0.07, '#fff'); circ(g, w * 0.86, h * 0.74, w * 0.07, '#fff'); }
  if (sub === 2) { sun(); rect(g, w * 0.14, h * 0.5, w * 0.72, h * 0.18, pickOf(r, ['#e83a3a', '#3a6ad0', '#f08a20'])); rect(g, w * 0.3, h * 0.38, w * 0.38, h * 0.14, '#e8c0a0'); rect(g, w * 0.34, h * 0.41, w * 0.12, h * 0.08, '#a8d8f0'); rect(g, w * 0.52, h * 0.41, w * 0.12, h * 0.08, '#a8d8f0'); circ(g, w * 0.3, h * 0.7, w * 0.08, '#222'); circ(g, w * 0.7, h * 0.7, w * 0.08, '#222'); }
  if (sub === 3) { poly(g, [[w * 0.5, h * 0.32], [w * 0.28, h * 0.76], [w * 0.72, h * 0.76]], pickOf(r, ['#d83a8a', '#3a6ad0', '#e8a020'])); circ(g, w * 0.5, h * 0.26, w * 0.09, '#e8c8a0'); g.fillStyle = '#5a3a18'; g.beginPath(); g.arc(w * 0.5, h * 0.24, w * 0.1, Math.PI, 0); g.fill(); line(g, w * 0.36, h * 0.5, w * 0.2, h * 0.6, '#e8c8a0', 5); line(g, w * 0.64, h * 0.5, w * 0.8, h * 0.6, '#e8c8a0', 5); heart(g, w * 0.84, h * 0.2, w * 0.08, '#e83a3a'); }
  if (sub === 4) { rect(g, 0, 0, w, h * 0.78, '#a8d8f0'); g.fillStyle = '#f08a20'; g.beginPath(); g.ellipse(w * 0.46, h * 0.46, w * 0.24, h * 0.12, 0, 0, Math.PI * 2); g.fill(); poly(g, [[w * 0.68, h * 0.46], [w * 0.86, h * 0.34], [w * 0.86, h * 0.58]], '#f08a20'); circ(g, w * 0.34, h * 0.43, w * 0.025, '#222'); for (let k = 0; k < 4; k++) circ(g, w * (0.12 + k * 0.06), h * (0.7 - k * 0.12), w * 0.02, 'rgba(255,255,255,0.8)'); }
  if (sub === 5) { sun(); rect(g, w * 0.16, h * 0.42, w * 0.68, h * 0.34, '#f0c070'); poly(g, [[w * 0.1, h * 0.42], [w * 0.5, h * 0.22], [w * 0.9, h * 0.42]], '#c8402a'); rect(g, w * 0.44, h * 0.56, w * 0.12, h * 0.2, '#8a5a2a'); [0.22, 0.66].forEach((x) => rect(g, w * x, h * 0.5, w * 0.12, h * 0.1, '#a8d8f0')); line(g, w * 0.5, h * 0.22, w * 0.5, h * 0.1, '#222', 3); poly(g, [[w * 0.5, h * 0.1], [w * 0.68, h * 0.14], [w * 0.5, h * 0.18]], '#f8d020'); }
  txt(g, title, w / 2, h * 0.94, h * 0.08, { f: F.hand, c: pickOf(r, ['#c82a2a', '#2a5ac0', '#2a8a3a']), w: 'bold', max: w * 0.9 });
};
/** A framed plaque of lettering: two lines on a ground, a border. */
const plaque = (l1, l2, c) => (g, w, h) => {
  bg(g, w, h, c.bg); border(g, w, h, c.bd, h * 0.08); txt(g, l1, w / 2, h * 0.34, h * 0.17, { f: F.serif, w: 'bold', c: c.a, max: w * 0.84 }); txt(g, l2, w / 2, h * 0.68, h * 0.2, { f: F.serif, w: 'bold', c: c.b, max: w * 0.84 });
};
const sponsor = (head, sub, col) => calendar(head, sub, col);
/** A notice on a stair: red or blue frame, a heading, lines of hand-written text, tear-off tabs along the foot when it is an offer. */
const noticeOf = (c) => (g, w, h) => {
  bg(g, w, h, c.bg ?? '#f4f0e0'); border(g, w, h, c.col, Math.max(3, w * 0.04));
  txt(g, c.h1, w / 2, h * 0.13, h * 0.1, { f: F.slab, c: c.col, max: w * 0.86 }); txt(g, c.h2, w / 2, h * 0.27, h * 0.11, { f: F.slab, c: c.col, max: w * 0.86 });
  lines(g, c.rows, w / 2, h * 0.47, h * 0.12, h * 0.072, { c: '#222', w: 'bold', max: w * 0.86 });
  if (c.tabs) for (let i = 0; i < 6; i++) { const x = w * (0.1 + i * 0.14); rect(g, x, h * 0.8, w * 0.1, h * 0.15, '#e6dcc0'); line(g, x + w * 0.05, h * 0.82, x + w * 0.05, h * 0.93, '#a89870', 1); }
};
const PIC_NINO = (g, w, h) => {
  grad(g, w, h, [[0, '#8ab8e8'], [0.7, '#f4ecd0'], [1, '#e8d8a8']]); rays(g, w / 2, h * 0.34, w * 0.18, w * 0.9, 26, 'rgba(255,215,120,0.4)');
  poly(g, [[w * 0.36, h * 0.46], [w * 0.64, h * 0.46], [w * 0.74, h * 0.84], [w * 0.26, h * 0.84]], '#e87aa0'); rect(g, w * 0.34, h * 0.6, w * 0.32, h * 0.045, '#2c58a8');
  line(g, w * 0.37, h * 0.5, w * 0.2, h * 0.58, '#f0c8a0', w * 0.04); line(g, w * 0.63, h * 0.5, w * 0.8, h * 0.58, '#f0c8a0', w * 0.04);
  circ(g, w / 2, h * 0.34, w * 0.14, '#f0c8a0'); g.fillStyle = '#6a4a2a'; for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(w * (0.4 + k * 0.033), h * 0.23 + (k % 2) * h * 0.01, w * 0.035, 0, Math.PI * 2); g.fill(); }
  g.lineWidth = w * 0.014; circ(g, w / 2, h * 0.3, w * 0.2, null, '#e8b830');
  rect(g, 0, h * 0.88, w, h * 0.12, '#3a2a1c'); txt(g, 'DIVINO NIÑO', w / 2, h * 0.94, h * 0.06, { w: 'bold', c: '#f2d050', max: w * 0.92 });
};
const PIC_CHIQUI = (g, w, h) => {
  grad(g, w, h, [[0, '#24243a'], [1, '#4a3a2a']]); rays(g, w / 2, h * 0.36, w * 0.2, w, 30, 'rgba(255,215,120,0.28)');
  poly(g, [[w * 0.5, h * 0.2], [w * 0.2, h * 0.84], [w * 0.8, h * 0.84]], '#3a58a8'); poly(g, [[w * 0.5, h * 0.2], [w * 0.38, h * 0.84], [w * 0.62, h * 0.84]], '#d8b840');
  circ(g, w / 2, h * 0.27, w * 0.08, '#d8b088'); g.fillStyle = '#d8b840'; g.beginPath(); g.moveTo(w * 0.4, h * 0.2); g.lineTo(w * 0.44, h * 0.12); g.lineTo(w * 0.5, h * 0.17); g.lineTo(w * 0.56, h * 0.12); g.lineTo(w * 0.6, h * 0.2); g.closePath(); g.fill();
  circ(g, w * 0.5, h * 0.55, w * 0.06, '#e8c8a0'); rect(g, 0, h * 0.86, w, h * 0.14, '#1c1410'); txt(g, 'N. S. DE CHIQUINQUIRÁ', w / 2, h * 0.93, h * 0.052, { w: 'bold', c: '#f2d050', max: w * 0.92 });
};
Object.assign(PAINT, {
  picture_nino: PIC_NINO, picture_chiqui: PIC_CHIQUI,
  poster_football_d(g, w, h) { football(g, w, h, '#c8302a', '#f4f0e0', 'CLÁSICO\nDE LA LOMA', 'Real Montaña vs. La Cumbre\nDomingo 10 a. m.'); },
  poster_football_e(g, w, h) { football(g, w, h, '#1f5fa8', '#ffe27a', 'TORNEO\nRELÁMPAGO', 'Inscripciones abiertas\nSalón comunal'); },
  poster_football_f(g, w, h) { football(g, w, h, '#7a3a8a', '#f4f0e0', 'ESCUELA DE\nFÚTBOL', 'Niños de 6 a 12 años\nMartes y jueves 4 p. m.'); },
  poster_music_2(g, w, h) {
    grad(g, w, h, [[0, '#1c5a7a'], [1, '#e8a020']]); rays(g, w / 2, h * 0.4, w * 0.15, w, 30, 'rgba(255,255,255,0.15)'); txt(g, 'FIESTAS', w / 2, h * 0.16, h * 0.14, { f: F.slab, c: '#fff', max: w * 0.9 }); txt(g, 'DEL BARRIO', w / 2, h * 0.3, h * 0.12, { f: F.slab, c: '#ffe070', max: w * 0.9 });
    ['★', '♫', '★'].forEach((n, i) => txt(g, n, w * (0.25 + i * 0.25), h * (0.5 + (i % 2) * 0.08), h * 0.14, { c: '#fff' })); lines(g, ['Sábado desde las 4 p. m.', 'Orquesta · Comida · Juegos', 'Plazoleta de la Virgen'], w / 2, h * 0.74, h * 0.07, h * 0.05, { c: '#fff', w: 'bold', max: w * 0.9 });
  },
  calendar_ferre: sponsor('FERRETERÍA EL CONSTRUCTOR', 'Todo para su obra', '#d89a1a'),
  calendar_pan: sponsor('PANADERÍA LA ESPIGA', 'El pan de cada día', '#a8602a'),
  calendar_carne: sponsor('CARNES EL CORRAL', 'Fresca y al mejor precio', '#a82a2a'),
  calendar_funeraria: sponsor('FUNERARIA LOS OLIVOS', 'Acompañándolos siempre', '#3a4a6a'),
  calendar_coop: sponsor('COOPERATIVA SAN FRANCISCO', 'Ahorre con nosotros', '#2a7a8a'),
  calendar_loteria: sponsor('LOTERÍA LA ABUNDANCIA', 'Juegue los martes', '#7a3a8a'),
  calendar_repuestos: sponsor('REPUESTOS EL RÁPIDO', 'Motos y bicicletas', '#2a2a2e'),
  calendar_optica: sponsor('ÓPTICA VISIÓN', 'Examen de la vista gratis', '#2a5aa8'),
  calendar_agua: sponsor('AGUA CRISTALINA', 'Pida su botellón', '#3a9ac0'),
  notice_dog: noticeOf({ col: '#c8501a', h1: 'SE PERDIÓ', h2: 'PERRITA', rows: ['Criolla, color café', 'Responde a «Canela»', 'Se agradece la ayuda', '310 555 0187'], tabs: true }),
  notice_agua: noticeOf({ col: '#1f5fa8', h1: 'AVISO', h2: 'SIN AGUA', rows: ['El jueves de 8 a. m.', 'a 4 p. m. por arreglos', 'Guarde agua en tanques', 'Acueducto del barrio'] }),
  notice_junta: noticeOf({ col: '#2f7a3a', h1: 'JUNTA COMUNAL', h2: 'REUNIÓN', rows: ['Domingo 10 a. m.', 'Salón comunal', 'Tema: el alumbrado', '¡Venga y opine!'] }),
  notice_basura: noticeOf({ col: '#7a4a1a', h1: 'BASURA', h2: 'MARTES Y VIERNES', rows: ['Saque la bolsa', 'después de las 6 p. m.', 'No la deje en la escalera', 'Gracias, vecinos'] }),
});
for (let i = 1; i <= 10; i++) PAINT['photo_fam_' + i] = famPhoto(i);
for (let i = 1; i <= 4; i++) { PAINT['art_land_' + i] = landscapeV(i); PAINT['art_coast_' + i] = coastV(i); PAINT['art_flow_' + i] = flowersV(i); }
for (let i = 1; i <= 6; i++) PAINT['kids_draw_' + i] = kidsDraw(i);
[['DIOS BENDIGA', 'ESTA CASA', { bg: '#e8f0e0', bd: '#4a7a3a', a: '#2a5a2a', b: '#a82a2a' }], ['CRISTO ES EL CENTRO', 'DE ESTE HOGAR', { bg: '#f4ecd8', bd: '#2c58a8', a: '#2c58a8', b: '#5a3a1c' }], ['AQUÍ SE REZA', 'EN FAMILIA', { bg: '#f0e0e0', bd: '#8a2a2a', a: '#8a2a2a', b: '#3a2a1c' }]]
  .forEach(([a, b, c], i) => { PAINT['blessing_' + (i + 1)] = plaque(a, b, c); });

/** The decals that have a painter (the test: every decal of decals.js is painted). */
export const paintedIds = () => Object.keys(DECALS).filter((id) => PAINT[id]);

// ------------------------------------------------------------------ packing and texture
/** Paint the atlas. Returns { texture, uv: { id: [u0, v0, u1, v1] }, ppm, used } (v0 = bottom edge) or null without a DOM canvas. */
export function paintDecalAtlas(THREE_ = THREE) {
  if (typeof document === 'undefined') return null;
  const ids = Object.keys(DECALS).filter((id) => PAINT[id]);
  for (let ppm = 512; ppm >= 128; ppm -= 16) {
    const items = ids.map((id) => ({ id, w: Math.ceil(DECALS[id].w * ppm), h: Math.ceil(DECALS[id].h * ppm) })).sort((a, b) => b.h - a.h || b.w - a.w);
    let x = GUT, y = GUT, rowH = 0, ok = true;
    for (const it of items) {
      if (x + it.w + GUT > SIZE) { x = GUT; y += rowH + 2 * GUT; rowH = 0; }
      it.x = x; it.y = y; x += it.w + 2 * GUT; rowH = Math.max(rowH, it.h);
      if (y + it.h + GUT > SIZE) { ok = false; break; }
    }
    if (!ok) continue;
    const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
    const g = cv.getContext('2d'); g.fillStyle = '#e8e0d0'; g.fillRect(0, 0, SIZE, SIZE);
    const uv = {};
    for (const it of items) {
      g.save(); g.beginPath(); g.rect(it.x - GUT, it.y - GUT, it.w + 2 * GUT, it.h + 2 * GUT); g.clip(); g.translate(it.x, it.y);
      try { PAINT[it.id](g, it.w, it.h); } catch (e) { g.fillStyle = '#d8d0c0'; g.fillRect(-GUT, -GUT, it.w + 2 * GUT, it.h + 2 * GUT); console.warn('[atlas]', it.id, e); }
      g.restore();
      uv[it.id] = [it.x / SIZE, 1 - (it.y + it.h) / SIZE, (it.x + it.w) / SIZE, 1 - it.y / SIZE];
    }
    const tex = new THREE_.CanvasTexture(cv);
    tex.colorSpace = THREE_.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE_.LinearMipmapLinearFilter; tex.magFilter = THREE_.LinearFilter;
    return { texture: tex, uv, ppm, used: y + rowH, canvas: cv };
  }
  return null;
}

/** Make the shared `decal_atlas` material from a painted atlas. */
export function atlasMaterial(atlas, THREE_ = THREE) {
  const m = new THREE_.MeshStandardMaterial({ map: atlas.texture, roughness: 0.85, metalness: 0, vertexColors: true, envMapIntensity: 0.5 });
  m.name = 'decal_atlas';                                   // no polygonOffset: the engine uses reversed-Z, where a negative offset pushes AWAY; the quad sits 3 mm in front of its slab instead
  return m;
}
