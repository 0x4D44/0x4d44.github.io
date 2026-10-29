// Canvas livery painter: one colour atlas + one ORM (roughness/metal) atlas per aircraft x livery. Owner: craft agent.
// Layout is documented in geom.js (ATLAS). Browser-only; returns null without a DOM.
import * as THREE from 'three';
import { ATLAS } from './geom.js';

const NUMBERS = { falcon: 1, wasp: 2, manta: 3, bulldog: 4, comet: 5, sprite: 6 };
const cache = new Map();

export function liveryTextures(spec, liveryIndex) {
  if (typeof document === 'undefined') return null;
  const key = spec.id + ':' + liveryIndex;
  if (cache.has(key)) return cache.get(key);
  const lv = spec.liveries[liveryIndex % spec.liveries.length];
  const out = paint(spec, lv, liveryIndex % 3);
  cache.set(key, out);
  return out;
}

function mix(hex, to, t) { const a = new THREE.Color(hex), b = new THREE.Color(to); return '#' + a.lerp(b, t).getHexString(); }

function paint(spec, lv, style) {
  const { W, H } = ATLAS, dims = { W: spec.visual.wingspan, L: spec.visual.length };
  const Wm = dims.W * 1.12, Lm = dims.L * 1.12;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const col = mk(W, H), orm = mk(W / 2, H / 2);
  const g = col.getContext('2d'), o = orm.getContext('2d');
  const dark = '#1b2030', P = lv.primary, S = lv.secondary, A = lv.accent;
  const px = (x) => (x / Wm + 0.5) * W;                       // top band: metres -> canvas
  const pz = (z) => (1 - (ATLAS.topV0 + (1 - ATLAS.topV0) * (0.5 - z / Lm))) * H;
  const mZ = Wm / W;                                           // metres per pixel horizontally
  const sideY0 = (right) => (1 - (right ? ATLAS.topV0 : ATLAS.rV0)) * H;   // canvas y of the band top
  const sideH = (ATLAS.topV0 - ATLAS.rV0) * H;
  const sideX = (z, right) => (right ? 0.5 - z / Lm : 0.5 + z / Lm) * W;
  const sideY = (y, right) => sideY0(right) + sideH * (0.5 - y / (dims.L * 0.3));

  // ---- base ----
  g.fillStyle = P; g.fillRect(0, 0, W, H);
  o.fillStyle = 'rgb(255,70,8)'; o.fillRect(0, 0, W / 2, H / 2);       // R=ao, G=rough .27, B=metal .03
  const solids = [dark, A, S, P];
  solids.forEach((c, i) => { g.fillStyle = c; g.fillRect((i * W) / 4, (1 - ATLAS.solidV * 2) * H, W / 4, ATLAS.solidV * 2 * H); });
  o.fillStyle = 'rgb(255,92,235)'; o.fillRect(0, (1 - ATLAS.solidV * 2) * H / 2, W / 8, ATLAS.solidV * 2 * H / 2);   // dark: metal
  o.fillStyle = 'rgb(255,40,6)'; o.fillRect(W / 8, (1 - ATLAS.solidV * 2) * H / 2, (W * 3) / 8, ATLAS.solidV * 2 * H / 2);

  // ---- top-band livery ----
  const half = dims.W / 2, L2 = dims.L / 2;
  g.save(); g.beginPath(); g.rect(0, 0, W, pz(L2 * 1.2)); g.clip();
  const stripe = (x0, x1, c) => { g.fillStyle = c; g.fillRect(px(x0), 0, px(x1) - px(x0), pz(L2 * 1.2)); };
  const kind = spec.visual.kind;
  if (style === 0) {                      // twin racing stripes + pinstripes
    stripe(-0.9, -0.3, A); stripe(0.3, 0.9, A); stripe(-1.05, -0.95, S); stripe(0.95, 1.05, S); stripe(-0.1, 0.1, S);
  } else if (style === 1) {               // bold single centre stripe with chevrons
    stripe(-0.7, 0.7, A); stripe(-0.35, 0.35, S);
    g.fillStyle = A; g.strokeStyle = A; g.lineWidth = 36;
    for (let k = 0; k < 4; k++) { const z = -L2 * 0.1 + k * L2 * 0.35; g.beginPath(); g.moveTo(px(-half * 0.9), pz(z + L2 * 0.35)); g.lineTo(px(-half * 0.25), pz(z)); g.lineTo(px(0), pz(z - L2 * 0.1)); g.lineTo(px(half * 0.25), pz(z)); g.lineTo(px(half * 0.9), pz(z + L2 * 0.35)); g.stroke(); }
  } else {                                // diagonal slashes
    g.fillStyle = A; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(px(-half), pz(k * L2 * 0.3)); g.lineTo(px(-half) + 90, pz(k * L2 * 0.3)); g.lineTo(px(half), pz(k * L2 * 0.3 + L2 * 0.35)); g.lineTo(px(half) - 90, pz(k * L2 * 0.3 + L2 * 0.35)); g.fill(); }
    stripe(-0.5, 0.5, S); stripe(-0.2, 0.2, P);
  }
  // wing-tip blocks and trailing-edge flashes
  g.fillStyle = A; g.fillRect(px(-half * 1.2), 0, px(-half * 0.8) - px(-half * 1.2), H); g.fillRect(px(half * 0.8), 0, px(half * 1.2) - px(half * 0.8), H);
  g.fillStyle = S; g.fillRect(px(-half * 1.2), 0, px(-half * 0.93) - px(-half * 1.2), H); g.fillRect(px(half * 0.93), 0, px(half * 1.2) - px(half * 0.93), H);
  // nose cone dark radome + nose paint
  g.fillStyle = mix(P, '#000000', 0.35); g.beginPath(); g.ellipse(px(0), pz(-L2 * 1.02), 100, 110, 0, 0, Math.PI * 2); g.fill();
  // roundels with the racing number on both wings
  const num = String(NUMBERS[spec.id] || 1);
  const rx = half * (kind === 'delta' ? 0.38 : 0.52), rz = kind === 'flying-wing' ? L2 * 0.1 : kind === 'delta' ? L2 * 0.45 : L2 * 0.2;
  for (const sx of [-1, 1]) {
    const cx = px(sx * rx), cy = pz(rz), r = Math.min(110, 0.17 * W);
    g.fillStyle = S; g.beginPath(); g.arc(cx, cy, r, 0, 6.3); g.fill();
    g.fillStyle = A; g.beginPath(); g.arc(cx, cy, r * 0.84, 0, 6.3); g.fill();
    g.fillStyle = S; g.beginPath(); g.arc(cx, cy, r * 0.62, 0, 6.3); g.fill();
    g.fillStyle = dark; g.font = `900 italic ${Math.round(r * 0.95)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, cx, cy + r * 0.05);
  }
  // tail / rear stripes
  g.fillStyle = dark; g.globalAlpha = 0.9; g.fillRect(0, pz(L2 * 0.98), W, 6); g.globalAlpha = 1;
  g.restore();

  // ---- side bands ----
  for (const right of [true, false]) {
    const y0 = sideY0(right), y1 = y0 + sideH, nose = (z) => sideX(z, right);
    g.save(); g.beginPath(); g.rect(0, y0, W, sideH); g.clip();
    g.fillStyle = P; g.fillRect(0, y0, W, sideH);
    // belt stripe through the fuselage centre line
    const sy = sideY(0, right);
    g.fillStyle = A; g.fillRect(0, sy - 16, W, 32); g.fillStyle = S; g.fillRect(0, sy - 26, W, 8); g.fillRect(0, sy + 18, W, 8);
    // flame tongues from the nose
    const fl = (c, s, off) => { g.fillStyle = c; g.beginPath(); const x0 = nose(-L2 * 0.9), dir = right ? -1 : 1; g.moveTo(x0, sy + off);
      for (let k = 0; k < 5; k++) { g.quadraticCurveTo(x0 + dir * (70 + k * 60) * s, sy + off - 40 * s + k * 6, x0 + dir * (160 + k * 95) * s, sy + off + (k % 2 ? 22 : -26) * s); } g.lineTo(x0 + dir * 80 * s, sy + off + 60 * s); g.closePath(); g.fill(); };
    if (style === 2) { fl(A, 1.2, -6); fl(S, 0.72, -2); }
    // tail flash (reads on the fins)\n    g.fillStyle = A; g.beginPath(); g.moveTo(nose(L2 * 0.35), sy - 60); g.lineTo(nose(L2 * 0.7), sy - 60); g.lineTo(nose(L2 * 0.95), y0); g.lineTo(nose(L2 * 0.6), y0); g.fill();\n    g.fillStyle = S; g.beginPath(); g.moveTo(nose(L2 * 0.72), sy - 60); g.lineTo(nose(L2 * 0.78), sy - 60); g.lineTo(nose(L2 * 1.03), y0); g.lineTo(nose(L2 * 0.97), y0); g.fill();\n    // big racing number
    g.fillStyle = S; g.strokeStyle = dark; g.lineWidth = 12; g.font = '900 italic 190px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeText(num, nose(L2 * 0.18), sy - 4); g.fillText(num, nose(L2 * 0.18), sy - 4);
    g.font = '800 italic 54px system-ui, sans-serif'; g.fillStyle = S; g.fillText(spec.name.split(' ')[0].toUpperCase(), nose(-L2 * 0.45), sy + 78);
    g.restore();
  }

  // ---- panel lines (colour darkening + roughness bump), rivets ----
  const lines = (ctx, scale, style2, alpha) => {
    ctx.save(); ctx.strokeStyle = style2; ctx.globalAlpha = alpha; ctx.lineWidth = 2.2 * scale;
    for (let x = -half; x <= half; x += 1.35) { ctx.beginPath(); ctx.moveTo(px(x) * scale, 0); ctx.lineTo(px(x) * scale, pz(L2 * 1.05) * scale); ctx.stroke(); }
    for (let z = -L2; z <= L2; z += 1.7) { ctx.beginPath(); ctx.moveTo(0, pz(z) * scale); ctx.lineTo(W * scale, pz(z) * scale); ctx.stroke(); }
    for (const y0 of [(1 - ATLAS.topV0) * H, sideY0(false)]) {
      for (let k = 1; k < 9; k++) { const xx = (k / 9) * W * scale; ctx.beginPath(); ctx.moveTo(xx, y0 * scale); ctx.lineTo(xx, (y0 + sideH * 2 * (y0 > 1000 ? 0.5 : 0.5)) * scale); ctx.stroke(); }
    }
    ctx.restore();
  };
  lines(g, 1, 'rgba(10,16,30,1)', 0.07);
  lines(o, 0.5, 'rgb(255,190,10)', 0.9);

  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; map.generateMipmaps = true;
  const ormTex = new THREE.CanvasTexture(orm); ormTex.colorSpace = THREE.NoColorSpace; ormTex.anisotropy = 4;
  return { map, orm: ormTex, canvas: col };
}

/** Soft blurred propeller disc (3 faint blade streaks); rotate the mesh to animate. */
let propTex = null;
export function propDiscTexture(blades = 3) {
  if (typeof document === 'undefined') return null;
  const key = blades; propTex = propTex || {};
  if (propTex[key]) return propTex[key];
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  const rg = g.createRadialGradient(0, 0, S * 0.04, 0, 0, S * 0.5); rg.addColorStop(0, 'rgba(210,225,240,0.05)'); rg.addColorStop(0.55, 'rgba(210,225,240,0.20)'); rg.addColorStop(0.92, 'rgba(235,240,255,0.30)'); rg.addColorStop(1, 'rgba(235,240,255,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, S / 2, 0, 7); g.fill();
  for (let b = 0; b < blades; b++) {
    g.save(); g.rotate((b / blades) * Math.PI * 2);
    const gr = g.createLinearGradient(0, 0, S * 0.5, 0); gr.addColorStop(0, 'rgba(40,44,56,0.55)'); gr.addColorStop(0.9, 'rgba(60,66,80,0.5)'); gr.addColorStop(1, 'rgba(255,200,40,0.9)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(S * 0.05, -S * 0.012); g.quadraticCurveTo(S * 0.3, -S * 0.05, S * 0.5, -S * 0.02); g.lineTo(S * 0.5, S * 0.012); g.quadraticCurveTo(S * 0.3, S * 0.015, S * 0.05, S * 0.012); g.fill();
    // motion smear behind the blade
    const sg = g.createLinearGradient(0, 0, S * 0.5, 0); sg.addColorStop(0, 'rgba(220,230,245,0)'); sg.addColorStop(1, 'rgba(220,230,245,0.22)');
    g.fillStyle = sg; g.beginPath(); g.moveTo(S * 0.05, 0); g.arc(0, 0, S * 0.5, 0, 0.55); g.closePath(); g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (propTex[key] = t);
}
