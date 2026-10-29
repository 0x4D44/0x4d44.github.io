// Exterior sign atlas (A2): ONE canvas texture holding every shop fascia, blade sign, painted ghost sign and wall poster of the barrio, painted at load
// time with real Spanish text (browser only: Node has no canvas, signs fall back to flat coloured boards). One material (`sign_atlas`, unit UVs)
// = a handful of draw calls for ALL the lettering of ALL buildings. Same pattern as interiors/atlas.js (decal_atlas).
import * as THREE from 'three';
import { hash01 } from './mb.js';

const W = 2048, GUT = 4;
const F = { slab: '"Arial Black", Impact, "Segoe UI", sans-serif', sans: '"Segoe UI", Arial, Helvetica, sans-serif', serif: 'Georgia, "Times New Roman", serif', hand: '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive' };

/** Shop type -> the small line under the name, and the one word of the blade sign. */
const SUB = {
  tienda: 'ABARROTES · VÍVERES · DOMICILIOS', panaderia: 'PAN CALIENTE · TORTAS · CAFÉ', fruver: 'FRUTAS Y VERDURAS FRESCAS', carniceria: 'CARNES FRESCAS · EMBUTIDOS',
  peluqueria: 'CORTES · BARBA · AFEITADA', drogueria: 'DROGAS · DOMICILIOS 24 H', papeleria: 'PAPELERÍA · FOTOCOPIAS', minutos: 'MINUTOS · INTERNET · RECARGAS',
  zapateria: 'ZAPATOS · REPARACIONES', ferreteria: 'FERRETERÍA · MATERIALES', taller: 'MOTOS · REPARACIÓN · REPUESTOS', modista: 'ARREGLOS · CONFECCIÓN',
  cafe: 'TINTO · EMPANADAS · ALMUERZOS', restaurante: 'ALMUERZOS CORRIENTES · DOMICILIOS',
};
const BLADE = { tienda: 'TIENDA', panaderia: 'PAN', fruver: 'FRUVER', carniceria: 'CARNES', peluqueria: 'BARBERÍA', drogueria: 'DROGAS', papeleria: 'PAPELERÍA', minutos: 'MINUTOS',
  zapateria: 'ZAPATOS', ferreteria: 'FERRETERÍA', taller: 'TALLER', modista: 'ARREGLOS', cafe: 'CAFÉ', restaurante: 'ALMUERZOS' };
const INSTITUTION = { school: 'ESCUELA', clinic: 'PUESTO DE SALUD', hall: 'SALÓN COMUNAL', chapel: 'CAPILLA', tenement: 'INQUILINATO', apartments: 'EDIFICIO', courtyard: 'CASA PATIO', workshop: 'TALLER' };

/** Which lots carry a lettered fascia, and its text. House lots carry none. */
export function signText(lot) {
  const shopish = !!lot.shop || ['kiosk', 'cornerstore', 'shophouse'].includes(lot.kind);
  const inst = INSTITUTION[lot.kind];
  if (!shopish && !inst) return null;
  const name = String(lot.name ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return { main: name.toUpperCase(), sub: SUB[lot.shop] ?? (lot.kind === 'school' ? 'INSTITUCIÓN EDUCATIVA OFICIAL' : lot.kind === 'clinic' ? 'ATENCIÓN PRIMARIA · VACUNACIÓN' : lot.kind === 'hall' ? 'JUNTA DE ACCIÓN COMUNAL' : lot.kind === 'chapel' ? 'PARROQUIA · MISA DOMINGOS 5 PM' : lot.kind === 'workshop' ? 'MOTOS · SOLDADURA · REPUESTOS' : ''), blade: BLADE[lot.shop] ?? (lot.kind === 'clinic' ? 'SALUD' : lot.kind === 'hall' ? 'JAC' : null) };
}

const PAL = [['#c8281e', '#fff4d6'], ['#1f5fa8', '#ffe27a'], ['#f2c200', '#2a1c10'], ['#2e8b57', '#fff8e0'], ['#fff6e0', '#b8201c'], ['#222a30', '#ffd84a'], ['#e8702a', '#ffffff'], ['#7a2f8c', '#ffe6a0'], ['#0e7c86', '#fff0c8'], ['#f4efe0', '#1f4f8c']];
/** The board colours of a lot (also the flat fallback colour without a canvas). */
export function signColours(lot) { const p = PAL[Math.floor(hash01(String(lot.id), 77) * PAL.length) % PAL.length]; return { bg: p[0], fg: p[1] }; }
export const hexToLin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// ---- painters (pixel boxes of their own size, origin top-left) --------------------------------------------------------------------------
const fit = (g, s, px, maxW, font, weight = 'bold') => { g.font = `${weight} ${px}px ${font}`; const m = g.measureText(s).width; return m > maxW ? px * maxW / m : px; };
function txt(g, s, x, y, px, c, o = {}) { g.font = `${o.w ?? 'bold'} ${px}px ${o.f ?? F.slab}`; g.fillStyle = c; g.textAlign = o.a ?? 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y); }
const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function paintBoard(g, w, h, lot) {
  const t = signText(lot), c = signColours(lot), rnd = mulberry(Math.floor(hash01(String(lot.id), 78) * 1e9));
  g.fillStyle = c.bg; g.fillRect(-GUT, -GUT, w + 2 * GUT, h + 2 * GUT);
  g.strokeStyle = c.fg; g.lineWidth = Math.max(2, h * 0.045); rrect(g, h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12, h * 0.08); g.stroke();
  const long = t.main.length > 17 && t.main.includes(' ');
  if (long) {                                                                 // two lines: split at the space nearest the middle
    const sp = [...t.main].map((ch, i) => (ch === ' ' ? i : -1)).filter((i) => i >= 0).sort((a, b) => Math.abs(a - t.main.length / 2) - Math.abs(b - t.main.length / 2))[0];
    const l1 = t.main.slice(0, sp), l2 = t.main.slice(sp + 1), px = Math.min(h * (t.sub ? 0.27 : 0.34), fit(g, l1.length > l2.length ? l1 : l2, h * 0.3, w * 0.86, F.slab));
    txt(g, l1, w / 2, h * (t.sub ? 0.27 : 0.33), px, c.fg); txt(g, l2, w / 2, h * (t.sub ? 0.53 : 0.68), px, c.fg);
  } else txt(g, t.main, w / 2, h * (t.sub ? 0.4 : 0.5), fit(g, t.main, h * (t.sub ? 0.4 : 0.5), w * 0.88, F.slab), c.fg);
  if (t.sub) txt(g, t.sub, w / 2, h * 0.82, fit(g, t.sub, h * 0.15, w * 0.84, F.sans), c.fg, { f: F.sans, w: 'bold' });
  g.fillStyle = 'rgba(255,255,255,0.10)'; for (let i = 0; i < 6; i++) g.fillRect(rnd() * w, 0, 3 + rnd() * 12, h);       // sun-bleached streaks
  g.fillStyle = 'rgba(40,25,10,0.12)'; g.fillRect(0, h * 0.93, w, h * 0.07);
}

function paintBlade(g, w, h, lot) {
  const t = signText(lot), c = signColours(lot);
  g.fillStyle = c.bg; g.fillRect(-GUT, -GUT, w + 2 * GUT, h + 2 * GUT);
  g.strokeStyle = c.fg; g.lineWidth = 3; rrect(g, 5, 5, w - 10, h - 10, 8); g.stroke();
  const word = t.blade ?? 'TIENDA';
  txt(g, word, w / 2, h * 0.5, fit(g, word, h * 0.3, w * 0.84, F.slab), c.fg);
}

/** Painted wall ads (ghost signs): flat panels with their own ground, weathered. */
const GHOST = [
  (g, w, h) => { g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, w, h); txt(g, 'PROHIBIDO', w / 2, h * 0.3, h * 0.2, '#1c1c1c'); txt(g, 'FIJAR CARTELES', w / 2, h * 0.58, h * 0.14, '#1c1c1c'); txt(g, 'LEY 140 · MULTA', w / 2, h * 0.84, h * 0.09, '#8a1c1c', { f: F.sans }); },
  (g, w, h) => { g.fillStyle = '#b8201c'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4ead0'; g.beginPath(); g.moveTo(0, h * 0.68); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.68 + Math.sin(x / w * 9) * h * 0.07); g.lineTo(w, h); g.lineTo(0, h); g.fill(); txt(g, 'GASEOSA LA ESTRELLA', w / 2, h * 0.24, fit(g, 'GASEOSA LA ESTRELLA', h * 0.17, w * 0.9, F.slab), '#fff4d6'); txt(g, 'bien fría, bien rica', w / 2, h * 0.47, h * 0.11, '#fff4d6', { f: F.hand, w: 'normal' }); },
  (g, w, h) => { g.fillStyle = '#f2c200'; g.fillRect(0, 0, w, h); txt(g, 'TINTO · EMPANADAS', w / 2, h * 0.32, fit(g, 'TINTO · EMPANADAS', h * 0.17, w * 0.9, F.slab), '#3a1c10'); txt(g, 'ALMUERZOS', w / 2, h * 0.62, h * 0.2, '#b8201c'); txt(g, 'a toda hora', w / 2, h * 0.86, h * 0.1, '#3a1c10', { f: F.hand, w: 'normal' }); },
  (g, w, h) => { g.fillStyle = '#1f4f8c'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4efe0'; g.fillRect(0, h * 0.45, w, h * 0.05); txt(g, 'COOPERATIVA DE TAXIS', w / 2, h * 0.28, fit(g, 'COOPERATIVA DE TAXIS', h * 0.13, w * 0.9, F.slab), '#f4efe0'); txt(g, 'LA LADERA', w / 2, h * 0.7, h * 0.24, '#ffd23a'); },
  (g, w, h) => { g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, w, h); txt(g, 'SE ARRIENDAN', w / 2, h * 0.26, h * 0.16, '#a01c1c'); txt(g, 'PIEZAS Y APARTAESTUDIOS', w / 2, h * 0.5, fit(g, 'PIEZAS Y APARTAESTUDIOS', h * 0.1, w * 0.9, F.sans), '#222'); txt(g, 'Informes: 300 000 00 00', w / 2, h * 0.74, h * 0.1, '#222', { f: F.hand, w: 'normal' }); },
  (g, w, h) => { const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#79b6e8'); sky.addColorStop(1, '#f6e2a8'); g.fillStyle = sky; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(w * 0.78, h * 0.28, h * 0.12, 0, 7); g.fill(); g.fillStyle = '#3f8a52'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.55); g.quadraticCurveTo(w * 0.3, h * 0.25, w * 0.6, h * 0.58); g.quadraticCurveTo(w * 0.8, h * 0.4, w, h * 0.6); g.lineTo(w, h); g.fill();
    ['#d94a3a', '#2f6fbf', '#f2c200', '#e07ab0', '#3aa89a'].forEach((cc, i) => { g.fillStyle = cc; g.fillRect(w * (0.12 + i * 0.16), h * (0.66 - (i % 2) * 0.08), w * 0.1, h * 0.12); g.fillStyle = '#7a3b2e'; g.fillRect(w * (0.12 + i * 0.16) - 2, h * (0.66 - (i % 2) * 0.08) - h * 0.03, w * 0.1 + 4, h * 0.03); });
    txt(g, 'LA LADERA', w / 2, h * 0.9, h * 0.1, '#fff4d6'); },
  (g, w, h) => { g.fillStyle = '#16603a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4efe0'; g.beginPath(); g.arc(w * 0.22, h * 0.5, h * 0.2, 0, 7); g.fill(); g.fillStyle = '#222'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(w * 0.22 + Math.cos(i * 1.26) * h * 0.1, h * 0.5 + Math.sin(i * 1.26) * h * 0.1, h * 0.04, 0, 7); g.fill(); } txt(g, 'LIGA DEL BARRIO', w * 0.62, h * 0.36, fit(g, 'LIGA DEL BARRIO', h * 0.15, w * 0.5, F.slab), '#f4efe0'); txt(g, 'FÚTBOL · DOMINGOS', w * 0.62, h * 0.66, fit(g, 'FÚTBOL · DOMINGOS', h * 0.1, w * 0.5, F.sans), '#ffd23a', { f: F.sans }); },
  (g, w, h) => { g.fillStyle = '#e8702a'; g.fillRect(0, 0, w, h); txt(g, 'REPARACIÓN DE', w / 2, h * 0.28, h * 0.13, '#fff'); txt(g, 'CELULARES · TV', w / 2, h * 0.52, fit(g, 'CELULARES · TV', h * 0.2, w * 0.9, F.slab), '#2a1c10'); txt(g, 'garantía por escrito', w / 2, h * 0.8, h * 0.1, '#fff', { f: F.hand, w: 'normal' }); },
];
function weather(g, w, h, seed) {
  const r = mulberry(seed);
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${200 + r() * 40 | 0},${185 + r() * 40 | 0},${160 + r() * 40 | 0},${0.1 + r() * 0.2})`; g.beginPath(); g.arc(r() * w, r() * h, (6 + r() * 26), 0, 7); g.fill(); }   // flaked paint
  for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(60,45,30,${0.05 + r() * 0.1})`; g.fillRect(r() * w, 0, 2 + r() * 10, h); }                                                                         // rain streaks
  g.fillStyle = 'rgba(235,225,205,0.18)'; g.fillRect(0, 0, w, h);                                                                                                                                         // sun-faded overall
}

/** Wall posters: small sheets glued on, some torn. */
const POSTER = [
  (g, w, h) => { g.fillStyle = '#1c1c3a'; g.fillRect(0, 0, w, h); txt(g, 'GRAN', w / 2, h * 0.12, h * 0.08, '#ffd23a'); txt(g, 'CONCIERTO', w / 2, h * 0.24, fit(g, 'CONCIERTO', h * 0.1, w * 0.9, F.slab), '#fff'); g.fillStyle = '#e8702a'; g.beginPath(); g.ellipse(w / 2, h * 0.54, w * 0.22, h * 0.14, 0, 0, 7); g.fill(); g.fillRect(w * 0.46, h * 0.3, w * 0.08, h * 0.2); txt(g, 'SÁBADO 8 PM', w / 2, h * 0.8, h * 0.07, '#ffd23a'); txt(g, 'Parque La Ladera', w / 2, h * 0.9, h * 0.055, '#fff', { f: F.sans }); },
  (g, w, h) => { g.fillStyle = '#f4efe0'; g.fillRect(0, 0, w, h); txt(g, 'SE ARRIENDA', w / 2, h * 0.2, fit(g, 'SE ARRIENDA', h * 0.11, w * 0.9, F.slab), '#b8201c'); txt(g, 'Apartaestudio', w / 2, h * 0.42, h * 0.07, '#222', { f: F.sans }); txt(g, 'Segundo piso', w / 2, h * 0.54, h * 0.07, '#222', { f: F.sans }); txt(g, '300 000 00 00', w / 2, h * 0.8, h * 0.08, '#222', { f: F.hand, w: 'normal' }); },
  (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); txt(g, 'SE BUSCA', w / 2, h * 0.1, h * 0.09, '#b8201c'); g.fillStyle = '#8a5a34'; g.beginPath(); g.ellipse(w / 2, h * 0.4, w * 0.3, h * 0.12, 0, 0, 7); g.fill(); g.beginPath(); g.arc(w * 0.72, h * 0.3, h * 0.07, 0, 7); g.fill(); g.fillRect(w * 0.3, h * 0.48, w * 0.06, h * 0.12); g.fillRect(w * 0.6, h * 0.48, w * 0.06, h * 0.12); txt(g, '"CANELO"', w / 2, h * 0.7, h * 0.09, '#222'); txt(g, 'Recompensa', w / 2, h * 0.86, h * 0.07, '#b8201c', { f: F.sans }); },
  (g, w, h) => { g.fillStyle = '#e85a9a'; g.fillRect(0, 0, w, h); txt(g, 'CLASES DE', w / 2, h * 0.14, h * 0.08, '#fff'); txt(g, 'BAILE', w / 2, h * 0.3, h * 0.17, '#ffe27a'); txt(g, 'Salsa · Zumba', w / 2, h * 0.5, h * 0.08, '#fff', { f: F.sans }); txt(g, 'Lunes y miércoles', w / 2, h * 0.68, h * 0.07, '#fff', { f: F.sans }); txt(g, 'Salón Comunal', w / 2, h * 0.86, h * 0.07, '#ffe27a', { f: F.sans }); },
  (g, w, h) => { g.fillStyle = '#e8f4ec'; g.fillRect(0, 0, w, h); g.fillStyle = '#1e9a4b'; g.fillRect(w * 0.4, h * 0.1, w * 0.2, h * 0.3); g.fillRect(w * 0.25, h * 0.2, w * 0.5, h * 0.1); txt(g, 'VACUNACIÓN', w / 2, h * 0.52, fit(g, 'VACUNACIÓN', h * 0.1, w * 0.9, F.slab), '#16603a'); txt(g, 'GRATIS', w / 2, h * 0.68, h * 0.1, '#16603a'); txt(g, 'Puesto de Salud', w / 2, h * 0.86, h * 0.065, '#222', { f: F.sans }); },
  (g, w, h) => { g.fillStyle = '#ffd23a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { g.fillStyle = ['#d94a3a', '#2f6fbf', '#3aa89a', '#fff'][i % 4]; g.fillRect((i * 37) % w, (i * 53) % h, 6, 6); } txt(g, 'FIESTAS', w / 2, h * 0.22, fit(g, 'FIESTAS', h * 0.13, w * 0.9, F.slab), '#b8201c'); txt(g, 'DEL BARRIO', w / 2, h * 0.38, h * 0.09, '#2a1c10'); txt(g, 'Banda en vivo', w / 2, h * 0.7, h * 0.075, '#2a1c10', { f: F.sans }); txt(g, 'Entrada libre', w / 2, h * 0.84, h * 0.07, '#2a1c10', { f: F.hand, w: 'normal' }); },
  (g, w, h) => { g.fillStyle = '#d8d0c0'; g.fillRect(0, 0, w, h); ['#d94a3a', '#2f6fbf', '#f2c200', '#3aa89a'].forEach((cc, i) => { g.fillStyle = cc; g.fillRect((i % 2) * w * 0.5, Math.floor(i / 2) * h * 0.5, w * 0.5, h * 0.5); }); g.fillStyle = '#d8d0c0'; g.beginPath(); g.moveTo(0, h * 0.7); g.lineTo(w * 0.3, h * 0.62); g.lineTo(w * 0.6, h * 0.8); g.lineTo(w, h * 0.7); g.lineTo(w, h); g.lineTo(0, h); g.fill(); },
  (g, w, h) => { g.fillStyle = '#16603a'; g.fillRect(0, 0, w, h); txt(g, 'FINAL', w / 2, h * 0.16, fit(g, 'FINAL', h * 0.14, w * 0.9, F.slab), '#fff'); txt(g, 'DEL TORNEO', w / 2, h * 0.3, h * 0.09, '#ffd23a'); g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h * 0.55, h * 0.13, 0, 7); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.arc(w / 2, h * 0.55, h * 0.05, 0, 7); g.fill(); txt(g, 'DOMINGO 3 PM', w / 2, h * 0.82, h * 0.075, '#ffd23a'); },
];

/** Paint the atlas for the page's lots. Returns { texture, uv:{key:[u0,v0,u1,v1]}, canvas } (v0 = bottom edge) or null without a DOM canvas. */
export function paintSignAtlas(lots, THREE_ = THREE) {
  if (typeof document === 'undefined') return null;
  const items = [];
  for (const lot of lots ?? []) {
    const t = signText(lot); if (!t) continue;
    items.push({ key: `board:${lot.id}`, w: 400, h: 100, paint: (g, w, h) => paintBoard(g, w, h, lot) });
    if (t.blade) items.push({ key: `blade:${lot.id}`, w: 96, h: 96, paint: (g, w, h) => paintBlade(g, w, h, lot) });
  }
  GHOST.forEach((p, i) => items.push({ key: `ghost:${i}`, w: 320, h: 200, paint: (g, w, h) => { p(g, w, h); weather(g, w, h, 1000 + i * 31); } }));
  POSTER.forEach((p, i) => items.push({ key: `poster:${i}`, w: 128, h: 180, paint: (g, w, h) => { p(g, w, h); if (i % 3 === 0) weather(g, w, h, 2000 + i); } }));
  items.sort((a, b) => b.h - a.h || b.w - a.w);
  let x = GUT, y = GUT, rowH = 0;
  for (const it of items) {
    if (x + it.w + GUT > W) { x = GUT; y += rowH + 2 * GUT; rowH = 0; }
    it.x = x; it.y = y; x += it.w + 2 * GUT; rowH = Math.max(rowH, it.h);
  }
  const H = Math.min(2048, Math.ceil((y + rowH + GUT) / 4) * 4);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.fillStyle = '#d8d0c0'; g.fillRect(0, 0, W, H);
  const uv = {};
  for (const it of items) {
    g.save(); g.beginPath(); g.rect(it.x - GUT, it.y - GUT, it.w + 2 * GUT, it.h + 2 * GUT); g.clip(); g.translate(it.x, it.y);
    try { it.paint(g, it.w, it.h); } catch (e) { g.fillStyle = '#c8c0b0'; g.fillRect(-GUT, -GUT, it.w + 2 * GUT, it.h + 2 * GUT); console.warn('[signs]', it.key, e); }
    g.restore();
    uv[it.key] = [it.x / W, 1 - (it.y + it.h) / H, (it.x + it.w) / W, 1 - it.y / H];
  }
  const tex = new THREE_.CanvasTexture(cv);
  tex.colorSpace = THREE_.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE_.LinearMipmapLinearFilter; tex.magFilter = THREE_.LinearFilter;
  return { texture: tex, uv, canvas: cv, size: [W, H], count: items.length };
}

/** The shared `sign_atlas` material around a painted atlas (vertex colours stay white: the atlas carries its own colours). */
export function signMaterial(atlas, THREE_ = THREE) {
  const m = new THREE_.MeshStandardMaterial({ map: atlas.texture, roughness: 0.8, metalness: 0, vertexColors: true, envMapIntensity: 0.5 });
  m.name = 'sign_atlas';
  return m;
}

/**
 * Paint the atlas once (the first building asks) and seed the shared `sign_atlas` material into the material library. Browser only: under Node
 * (tests, headless probes) there is no canvas, `ctx.signAtlas` stays null and every sign is a flat board tinted by its vertex colour.
 */
export function ensureSignAtlas(ctx) {
  if (ctx.signAtlas !== undefined) return ctx.signAtlas;
  ctx.signAtlas = null;
  if (typeof document === 'undefined' || !ctx.matlib?.cache) return null;
  try {
    const lots = ctx.plan?.lots ?? [...(ctx.buildings?.values?.() ?? [])].map((b) => b.lot);
    const atlas = paintSignAtlas(lots);
    if (atlas) { ctx.matlib.cache.set('sign_atlas', signMaterial(atlas)); ctx.signAtlas = atlas; }
  } catch (e) { (ctx.errors ??= []).push({ stage: 'arch', message: 'sign atlas ' + String(e?.message ?? e), stack: e?.stack }); }
  return ctx.signAtlas;
}

export const GHOST_COUNT = GHOST.length, POSTER_COUNT = POSTER.length;
