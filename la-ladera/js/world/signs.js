// Outdoor lettering and paint (A5): three murals on the tall retaining walls, the welcome boards on the gate arch, a blue street-name plaque on an iron
// post at the start of every street, hand-painted boards (garden, eggs, thanks) and the chalk hopscotch on the Almendros plaza. Shop fascias, blades,
// ghost signs and posters are A2's (arch/signs.js, material `sign_atlas`); this is the other, separate atlas: material `world_sign`.
// One 2048 x 1024 atlas painted at boot (Canvas2D -> DataTexture, rows flipped so v = 1 - y/H, like the foliage atlas). Under Node there is no canvas:
// K.signs stays null and every panel is a flat tinted board, so the placement code (and its tests) run the same everywhere.
import * as THREE from 'three';
import { OCC } from './occupancy.js';
import { tube } from './mk.js';
import { pointAt } from './geom.js';

const AW = 2048, AH = 1024;
const FONT = '"Arial Black", "Segoe UI Black", Impact, "Helvetica Neue", Arial, sans-serif';
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Marker Felt", cursive';
const FLAT = { mural: [0.55, 0.45, 0.4], gate: [0.92, 0.88, 0.72], plaque: [0.12, 0.3, 0.62], hand: [0.72, 0.6, 0.4], rayuela: [0.92, 0.92, 0.88] };

/** region of the atlas per key: [x, y, w, h] in canvas pixels (8 px gutters between regions) */
const REGION = {
  'mural.condor': [8, 8, 640, 320], 'mural.fiesta': [664, 8, 640, 320], 'mural.cerro': [1320, 8, 640, 320],
  'gate.in': [8, 344, 1000, 128], 'gate.out': [1032, 344, 1000, 128],
  'hand.huerta': [8, 488, 500, 128], 'hand.huevos': [524, 488, 500, 128], 'hand.gracias': [1040, 488, 500, 128],
  'rayuela': [1872, 632, 140, 360],
};
const plaqueRegion = (i) => [8 + (i % 7) * 264, 632 + Math.floor(i / 7) * 72, 256, 64];
const regionOf = (key) => (key.startsWith('plaque.') ? plaqueRegion(+key.slice(7)) : REGION[key]);

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
function frame(g, w, h) {
  g.strokeStyle = '#f1e7cf'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
  g.strokeStyle = '#2a2220'; g.lineWidth = 3; g.strokeRect(14.5, 14.5, w - 29, h - 29);
}

// ---------------------------------------------------------------------------------------------------- the murals (640 x 320)
function paintCondor(g, w, h) {
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
  banner(g, w, 268, 44, 'LIBRES COMO EL CÓNDOR', '#f4ecd8', '#4a1f1f', '#2a2220');
  frame(g, w, h);
}

function paintFiesta(g, w, h) {
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
  banner(g, w, 276, 38, 'FIESTA DE LA LADERA', '#ffd23f', '#7b1e3a', '#2a2220');
  frame(g, w, h);
}

function paintCerro(g, w, h) {
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
  banner(g, w, 272, 40, 'LA LADERA ES NUESTRA', '#fff3c4', '#1f5f3a', '#2a2220');
  frame(g, w, h);
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
function paintPlaque(name) {
  const m = /^(\S+)\s+(.*)$/.exec(name ?? '') ?? [null, '', name ?? ''];
  const kind = m[1].toUpperCase(), rest = m[2].toUpperCase();
  return (g, w, h) => {
    g.fillStyle = '#17458f'; rrect(g, 0, 0, w, h, 7); g.fill();
    g.strokeStyle = '#f4f4ee'; g.lineWidth = 3; rrect(g, 4, 4, w - 8, h - 8, 5); g.stroke();
    if (kind) text(g, kind, w / 2, 17, fit(g, kind, w - 40, 15, 9), '#cfe0ff');
    const sz = fit(g, rest, w - 26, 30, 12); text(g, rest, w / 2, kind ? 42 : 34, sz, '#f4f4ee');
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

/** Paint every sign of the world once. Browser only (null under Node). `plan.streets[i].name` becomes plaque i. */
export function makeSignAtlas(plan) {
  const cv = makeCanvas(AW, AH); if (!cv) return null;
  const g = cv.getContext('2d', { willReadFrequently: true }); if (!g) return null;
  g.clearRect(0, 0, AW, AH);
  const items = [
    ['mural.condor', paintCondor], ['mural.fiesta', paintFiesta], ['mural.cerro', paintCerro],
    ['gate.in', paintGate('BIENVENIDOS A LA LADERA', 'barrio de gente buena y de cerro alto')],
    ['gate.out', paintGate('VAYA CON DIOS · VUELVA PRONTO', 'gracias por la visita')],
    ['hand.huerta', paintHuerta], ['hand.huevos', paintHuevos], ['hand.gracias', paintGracias], ['rayuela', paintRayuela],
  ];
  (plan?.streets ?? []).slice(0, 21).forEach((st, i) => items.push([`plaque.${i}`, paintPlaque(st.name)]));
  for (const [key, paint] of items) {
    const [x, y, w, h] = regionOf(key);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y);
    try { paint(g, w, h); } catch (e) { g.fillStyle = '#c8c0b0'; g.fillRect(0, 0, w, h); (makeSignAtlas.errors ??= []).push(`${key}: ${e?.message ?? e}`); }
    g.restore();
  }
  const d = g.getImageData(0, 0, AW, AH).data, out = new Uint8Array(AW * AH * 4), row = AW * 4;
  for (let y = 0; y < AH; y++) {
    const src = y * row, dst = (AH - 1 - y) * row;
    for (let i = 0; i < row; i += 4) {
      if (d[src + i + 3] < 10) { out[dst + i] = 236; out[dst + i + 1] = 236; out[dst + i + 2] = 228; out[dst + i + 3] = 0; }          // transparent texels keep a chalk colour so mips do not darken the lines
      else { out[dst + i] = d[src + i]; out[dst + i + 1] = d[src + i + 1]; out[dst + i + 2] = d[src + i + 2]; out[dst + i + 3] = d[src + i + 3]; }
    }
  }
  const tex = new THREE.DataTexture(out, AW, AH, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 8; tex.needsUpdate = true;
  return {
    texture: tex, canvas: cv,
    /** [u0, vBottom, u1, vTop] of a region, half a texel inside */
    uv(key) { const [x, y, w, h] = regionOf(key), e = 0.75; return [(x + e) / AW, 1 - (y + h - e) / AH, (x + w - e) / AW, 1 - (y + e) / AH]; },
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

/** A hand-painted board hung on a post / fence at (x, y, z), facing (ox, oz): backing plank plus the painted face. w wide, height from the atlas ratio. */
export function handBoard(K, key, x, y, z, ox, oz, w = 0.9) {
  const b = K.one('signs', { cast: false }), h = w * 128 / 500, ry = Math.atan2(ox, oz);
  b.box('wood_dark', x - ox * 0.012, y, z - oz * 0.012, w + 0.05, h + 0.05, 0.022, { ry, col: [0.55, 0.5, 0.45] });
  panel(K, b, key, x + ox * 0.004, z + oz * 0.004, ox, oz, w, y - h / 2, y - h / 2, h);
}

/** Straight stretches of the tall cut walls along streets: the best (tallest) mural-sized stretch of each run. */
function muralSites(K) {
  const runs = K.ctx.world?.wallRuns ?? [], sites = [];
  for (const run of runs) {
    if (run.sign <= 0 || !(run.src === 'street' || run.src.startsWith('plaza')) || run.tall < 1.6) continue;
    const S = run.S, cum = [0];
    for (let i = 1; i < S.length; i++) cum.push(cum[i - 1] + Math.hypot(S[i].x - S[i - 1].x, S[i].z - S[i - 1].z));
    const total = cum[cum.length - 1];
    const at = (d) => {
      let i = 0; while (i + 2 < S.length && cum[i + 1] < d) i++;
      const a = S[i], c = S[i + 1], t = Math.max(0, Math.min(1, (d - cum[i]) / ((cum[i + 1] - cum[i]) || 1)));
      const m = (k) => a[k] + (c[k] - a[k]) * t;
      return { x: m('x'), z: m('z'), nx: m('nx'), nz: m('nz'), inner: m('inner'), outer: m('outer') };
    };
    let best = null;
    for (const h of [2.4, 2.2, 2.0, 1.8, 1.6, 1.4]) {
      const w = 2 * h;
      for (let d0 = 0; d0 + w <= total + 1e-6; d0 += 0.5) {
        const P = at(d0), Q = at(d0 + w), len = Math.hypot(Q.x - P.x, Q.z - P.z) || 1;
        let ok = true, margin = 9;
        for (let k = 0; k <= 10 && ok; k++) {
          const t = k / 10, s = at(d0 + w * t), yb = P.inner + (Q.inner - P.inner) * t + 0.4;
          const dev = Math.abs((s.x - P.x) * (Q.z - P.z) - (s.z - P.z) * (Q.x - P.x)) / len;
          margin = Math.min(margin, s.outer - 0.03 - (yb + h));
          if (dev > 0.09 || s.inner + 0.12 > yb || margin < 0) ok = false;
        }
        if (!ok) continue;
        if (!best || h > best.h + 1e-6 || (Math.abs(h - best.h) < 1e-6 && margin > best.margin + 0.05)) best = { run, P, Q, h, w, margin };
      }
      if (best) break;                                                       // tallest size that fits this run
    }
    if (best) sites.push(best);
  }
  return sites.sort((a, b) => b.h - a.h || b.margin - a.margin);
}

export function buildSigns(K) {
  const { ctx, plan, occ, H } = K, W = ctx.world, b = K.one('signs', { cast: false });
  const stats = { murals: 0, plaques: 0, boards: 0, hopscotch: 0 }, extra = (W.extra ??= []);

  // ---- 1. the three murals
  const ART = [
    ['mural.condor', 'condor', 'El Cóndor del Cerro', 'A condor wider than the street itself, crossing the sun over the mountains: "Free as the condor".'],
    ['mural.fiesta', 'fiesta', 'La Fiesta de la Ladera', 'Four dancers in wide polleras under paper bunting; the neighbours repaint the colours every year before the feast.'],
    ['mural.cerro', 'cerro', 'El Cerro Verde', 'The hill the way its children draw it: green, with a house on every step. "The hillside is ours".'],
  ];
  const picked = [];
  for (const site of muralSites(K)) {
    if (picked.length >= ART.length) break;
    const cx = (site.P.x + site.Q.x) / 2, cz = (site.P.z + site.Q.z) / 2;
    if (picked.some((q) => Math.hypot(q.cx - cx, q.cz - cz) < 38)) continue;
    picked.push({ ...site, cx, cz });
  }
  picked.forEach((p, i) => {
    const [key, id, name, en] = ART[i], { P, Q, h, w } = p, len = Math.hypot(Q.x - P.x, Q.z - P.z) || 1;
    let ox = -(P.nx + Q.nx) / 2, oz = -(P.nz + Q.nz) / 2;                       // toward the street: opposite the wall's outward normal
    const nl = Math.hypot(ox, oz) || 1; ox /= nl; oz /= nl;
    const cx = p.cx + ox * 0.045, cz = p.cz + oz * 0.045;
    const flip = (Q.x - P.x) * oz - (Q.z - P.z) * ox < 0;                         // is Q on the viewer's left? then the left edge sits at Q
    panel(K, b, key, cx, cz, ox, oz, Math.min(w, len), (flip ? Q : P).inner + 0.4, (flip ? P : Q).inner + 0.4, h);
    // the viewer's spot, kept clear of trees (flora runs after this step)
    const vx = p.cx + ox * 2.4, vz = p.cz + oz * 2.4;
    occ.take(vx, vz, 1.2);
    (W.muralRuns ??= new Set()).add(p.run);
    extra.push({ id, name, en, kind: 'mural', x: vx, z: vz, y: H(vx, vz), radius: 5.2, dy: 3.2 });
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
  plan.streets.forEach((st, i) => {
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
        plaqueAt.push({ x, z, y: gy, i, name: st.name });
        stats.plaques++; done = true; break;
      }
      if (done) break;
    }
  });
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
      const [x, z] = hit, y = H(x, z) + 0.016, dx = c, dz = -s, rx = s, rz = c;           // d = the plaza's local x (the long way), r = its local z
      const BL = [x - dx * LEN / 2 - rx * WID / 2, y, z - dz * LEN / 2 - rz * WID / 2], BR = [x - dx * LEN / 2 + rx * WID / 2, y, z - dz * LEN / 2 + rz * WID / 2];
      const TR = [x + dx * LEN / 2 + rx * WID / 2, y, z + dz * LEN / 2 + rz * WID / 2], TL = [x + dx * LEN / 2 - rx * WID / 2, y, z + dz * LEN / 2 - rz * WID / 2];
      const r = K.signs ? K.signs.uv('rayuela') : [0, 0, 1, 1];
      b.quad('world_sign', BL, BR, TR, TL, { uv: [r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]], col: K.signs ? [1, 1, 1] : FLAT.rayuela });
      occ.take(x, z, 1.5);
      const sx = x - dx * (LEN / 2 - 0.3), sz = z - dz * (LEN / 2 - 0.3);                 // the start square
      W.hopscotch = { x, z, ry, sx, sz, dx, dz, len: LEN, y: y - 0.016 };
      extra.push({ id: 'rayuela', name: 'La rayuela', en: 'A hopscotch in chalk, redrawn every week by whoever is small enough to care; it still ends in "cielo".', kind: 'object', x: sx, z: sz, y: y - 0.016, radius: 2.4, dy: 2.5 });
      stats.hopscotch = 1;
    }
  }
  W.signs = stats;
  return stats;
}
