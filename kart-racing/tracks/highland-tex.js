// Highland Fling - canvas textures (tartan, stone, flags).
import * as THREE from "three";
import { TAU } from "./highland-geo.js";

const cv = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
export const toTexture = (c, repeat = true) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };

// Woven tartan: bands list [[colour, width], ...] applied warp and weft, with a twill shimmer.
export function tartanCanvas(size = 128, bands = TARTAN_RED) {
  const c = cv(size, size), g = c.getContext("2d");
  const total = bands.reduce((a, b) => a + b[1], 0), k = size / total;
  g.fillStyle = bands[0][0]; g.fillRect(0, 0, size, size);
  const stripes = (vertical, alpha) => {
    let p = 0; g.globalAlpha = alpha;
    for (const [col, w] of bands) { g.fillStyle = col; if (vertical) g.fillRect(p * k, 0, w * k, size); else g.fillRect(0, p * k, size, w * k); p += w; }
    g.globalAlpha = 1;
  };
  stripes(true, 1); stripes(false, 0.62);
  // twill
  g.globalAlpha = 0.12; g.strokeStyle = "#000"; g.lineWidth = 1;
  for (let i = -size; i < size * 2; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + size, size); g.stroke(); }
  g.globalAlpha = 1;
  return c;
}
export const TARTAN_RED = [["#9b1c24", 22], ["#0f2a52", 4], ["#9b1c24", 2], ["#0c5a32", 10], ["#e9e2c8", 2], ["#0c5a32", 10], ["#0f2a52", 4], ["#9b1c24", 6], ["#111111", 3]];
export const TARTAN_BLUE = [["#173a72", 24], ["#0b1c3a", 6], ["#1f6b3a", 12], ["#0b1c3a", 3], ["#e8e0b0", 2], ["#173a72", 8]];
export const TARTAN_GREEN = [["#1d5a34", 24], ["#0c2a18", 6], ["#1a3f7a", 10], ["#f0d040", 2], ["#1a3f7a", 10], ["#0c2a18", 4]];

export function stoneCanvas(w = 256, h = 256, base = [128, 124, 116], seed = 7) {
  const c = cv(w, h), g = c.getContext("2d");
  let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, w, h);
  const rows = 8, rh = h / rows;
  for (let y = 0; y < rows; y++) {
    let x = -r() * 40;
    while (x < w) {
      const bw = 30 + r() * 38, v = (r() - 0.5) * 44;
      g.fillStyle = `rgb(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v * 0.8 | 0})`;
      g.fillRect(x + 1, y * rh + 1, bw - 2, rh - 2);
      if (r() < 0.25) { g.fillStyle = `rgba(80,110,50,${0.15 + r() * 0.2})`; g.fillRect(x + 1, y * rh + rh * 0.55, bw - 2, rh * 0.4); }
      x += bw;
    }
  }
  g.strokeStyle = "rgba(30,28,24,0.55)"; g.lineWidth = 1.4;
  for (let y = 0; y <= rows; y++) { g.beginPath(); g.moveTo(0, y * rh); g.lineTo(w, y * rh); g.stroke(); }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() * 0.07})`; g.fillRect(r() * w, r() * h, 2, 2); }
  return c;
}

export function saltireCanvas() {
  const c = cv(256, 160), g = c.getContext("2d");
  g.fillStyle = "#0a4fa6"; g.fillRect(0, 0, 256, 160);
  g.strokeStyle = "#ffffff"; g.lineWidth = 30; g.beginPath(); g.moveTo(0, 0); g.lineTo(256, 160); g.moveTo(256, 0); g.lineTo(0, 160); g.stroke();
  return c;
}

export function lionCanvas() {
  const c = cv(256, 160), g = c.getContext("2d");
  g.fillStyle = "#f6c812"; g.fillRect(0, 0, 256, 160);
  g.strokeStyle = "#c8102e"; g.lineWidth = 6; g.strokeRect(8, 8, 240, 144);
  g.lineWidth = 3; g.strokeRect(17, 17, 222, 126);
  for (const [x, y, r] of [[17, 17, 0], [239, 17, 1], [17, 143, 2], [239, 143, 3]]) { g.fillStyle = "#c8102e"; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); void r; }
  // heraldic lion rampant (facing left): mane, snout + tongue, raised forepaws, striding hind legs, curling tail
  g.save(); g.translate(132, 84); g.scale(0.92, 0.92);
  const RED = "#c8102e", BLUE = "#1a3f9a";
  g.fillStyle = RED; g.strokeStyle = RED; g.lineJoin = "round"; g.lineCap = "round";
  const limb = (w, pts) => { g.lineWidth = w; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
  // tail
  g.lineWidth = 7; g.beginPath(); g.moveTo(22, 14); g.bezierCurveTo(52, 8, 62, -26, 46, -50); g.bezierCurveTo(40, -58, 30, -52, 36, -44); g.stroke();
  g.beginPath(); g.ellipse(34, -52, 7, 5, -0.6, 0, TAU); g.fill();
  // body
  g.beginPath(); g.moveTo(-14, -26); g.bezierCurveTo(8, -34, 24, -20, 26, 6); g.bezierCurveTo(28, 26, 16, 34, 4, 30); g.bezierCurveTo(-8, 26, -14, 6, -16, -8); g.closePath(); g.fill();
  // hind legs
  limb(11, [14, 22, 22, 40, 12, 52]); limb(9, [18, 24, 36, 38, 46, 52]); limb(7, [6, 52, 20, 54]); limb(7, [40, 54, 54, 54]);
  // forelegs raised
  limb(9, [-10, -14, -30, -18, -48, -30]); limb(9, [-4, -22, -18, -44, -34, -58]);
  for (const [x, y] of [[-48, -30], [-34, -58]]) for (const d of [-0.6, 0, 0.6]) { g.lineWidth = 2.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 8 + d * 6, y - 6 + d * 10); g.stroke(); }
  // mane and head
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, cx = -26, cy = -40; g.beginPath(); g.moveTo(cx + Math.cos(a - 0.22) * 14, cy + Math.sin(a - 0.22) * 14); g.lineTo(cx + Math.cos(a) * 25, cy + Math.sin(a) * 25); g.lineTo(cx + Math.cos(a + 0.22) * 14, cy + Math.sin(a + 0.22) * 14); g.closePath(); g.fill(); }
  g.beginPath(); g.arc(-26, -40, 15, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(-42, -36, 11, 7, 0.15, 0, TAU); g.fill();
  g.strokeStyle = BLUE; g.lineWidth = 3; g.beginPath(); g.moveTo(-50, -32); g.quadraticCurveTo(-56, -26, -50, -22); g.stroke();   // tongue
  g.fillStyle = "#f6c812"; g.beginPath(); g.arc(-30, -43, 3, 0, TAU); g.fill();    // eye (field showing through)
  g.restore();
  return c;
}
