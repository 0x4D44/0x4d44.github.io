// Rendering helpers: canvas textures, geometry builder, palettes. Needs THREE passed in.
import { hashStr, mulberry32 } from './util.js';

export function canvasTex(THREE, w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso || 4;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.userData.canvas = c;
  return t;
}

/** Accumulating indexed geometry with positions/normals/uvs/colors. */
export class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  get count() { return this.p.length / 3; }
  vert(x, y, z, nx, ny, nz, u, v, r = 1, g = 1, b = 1) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(r, g, b); return this.count - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  /** Quad from 4 corners (a,b,c,d counter-clockwise seen from the front), uv tiled by (ur, vr). */
  quad(A, B, C, D, uv = [0, 0, 1, 1], col = [1, 1, 1], flip = false) {
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const [u0, v0, u1, v1] = uv;
    const a = this.vert(...A, nx, ny, nz, u0, v0, ...col), b = this.vert(...B, nx, ny, nz, u1, v0, ...col),
      c = this.vert(...C, nx, ny, nz, u1, v1, ...col), d = this.vert(...D, nx, ny, nz, u0, v1, ...col);
    if (flip) { this.tri(a, c, b); this.tri(a, d, c); } else { this.tri(a, b, c); this.tri(a, c, d); }
  }
  /** axis aligned box, min/max corners, uv scaled by texel density (metres per tile) */
  box(x0, y0, z0, x1, y1, z1, col = [1, 1, 1], tile = 1) {
    const dx = (x1 - x0) / tile, dy = (y1 - y0) / tile, dz = (z1 - z0) / tile;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, dx, dy], col);       // +z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, dx, dy], col);       // -z
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [0, 0, dz, dy], col);       // +x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [0, 0, dz, dy], col);       // -x
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 0, dx, dz], col);       // +y
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, 0, dx, dz], col);       // -y
  }
  build(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// Station colour schemes (dado tile, upper tile, trim, accent) - hand picked so every stop reads differently.
export const STATION_STYLES = [
  { dado: '#1d5a8c', upper: '#e9e4d2', trim: '#f0a21a', accent: '#f08a1c' },
  { dado: '#7a1f2b', upper: '#efe6d6', trim: '#d9b25a', accent: '#c93b3b' },
  { dado: '#1f6b4a', upper: '#e8ecdf', trim: '#e9c46a', accent: '#2a9d6a' },
  { dado: '#4b3a7a', upper: '#ece7e0', trim: '#f2b134', accent: '#8a6bd6' },
  { dado: '#a35a1a', upper: '#f1e8d0', trim: '#2f4f6f', accent: '#e07a1a' },
  { dado: '#1a6f78', upper: '#e6efe9', trim: '#f4d35e', accent: '#25a3ae' },
  { dado: '#6b2d5c', upper: '#efe9e4', trim: '#e8a33d', accent: '#b04a98' },
  { dado: '#2e4d2c', upper: '#ebe9d8', trim: '#c97b2a', accent: '#6fa84a' },
  { dado: '#8c2f1e', upper: '#f0e8dc', trim: '#35505e', accent: '#e0603a' },
  { dado: '#264b7a', upper: '#e9eaee', trim: '#d9a521', accent: '#3d7bd0' },
  { dado: '#55602a', upper: '#efeadb', trim: '#9c3d2b', accent: '#aab83a' },
  { dado: '#7b5a1a', upper: '#f3ecd9', trim: '#2a4a6a', accent: '#d4a017' },
  { dado: '#1d4f5a', upper: '#e7ece8', trim: '#e07a2b', accent: '#2e8f9a' },
  { dado: '#6e2638', upper: '#ece6dc', trim: '#c9a64b', accent: '#c4486a' },
  { dado: '#3b4a6b', upper: '#eae7de', trim: '#e2992e', accent: '#6a86c8' },
];
export function styleFor(station, idx) { return STATION_STYLES[(idx ?? (hashStr(station.id) % STATION_STYLES.length)) % STATION_STYLES.length]; }

export function tileTexture(THREE, base, grout = '#c9c3b2', rows = 8, seed = 1, glossy = true) {
  const rng = mulberry32(seed);
  return canvasTex(THREE, 256, 256, (g, w, h) => {
    g.fillStyle = grout; g.fillRect(0, 0, w, h);
    const tw = w / rows, th = h / (rows / 2);
    const col = new (globalThis.OffscreenCanvas ? OffscreenCanvas : Object)(1, 1);
    for (let y = 0; y < rows / 2; y++) for (let x = 0; x < rows; x++) {
      const j = (rng() - 0.5) * 14;
      g.fillStyle = base; g.fillRect(x * tw + 1, y * th + 1, tw - 2, th - 2);
      g.fillStyle = `rgba(${j > 0 ? 255 : 0},${j > 0 ? 255 : 0},${j > 0 ? 255 : 0},${Math.abs(j) / 160})`;
      g.fillRect(x * tw + 1, y * th + 1, tw - 2, th - 2);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x * tw + 2, y * th + 2, tw - 4, 3);
    }
  }, { repeat: true });
}

/** SPT-style roundel (orange circle, white bar) */
export function drawRoundel(g, cx, cy, r, accent = '#f08a1c') {
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = accent; g.fill();
  g.beginPath(); g.arc(cx, cy, r * 0.72, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  g.beginPath(); g.arc(cx, cy, r * 0.5, 0, Math.PI * 2); g.fillStyle = accent; g.fill();
  g.fillStyle = '#fff'; g.fillRect(cx - r * 1.18, cy - r * 0.14, r * 2.36, r * 0.28);
}

export function nameSignTexture(THREE, name, style, opts = {}) {
  const W = opts.w || 1024, H = opts.h || 256;
  return canvasTex(THREE, W, H, (g, w, h) => {
    g.fillStyle = opts.bg || '#0f2a4a'; g.fillRect(0, 0, w, h);
    g.fillStyle = style.trim; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    drawRoundel(g, h * 0.5, h * 0.5, h * 0.3, style.accent);
    g.fillStyle = '#fff'; g.textBaseline = 'middle';
    let size = h * 0.42; g.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
    while (g.measureText(name).width > w - h * 1.25 && size > 20) { size -= 4; g.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`; }
    g.fillText(name, h * 0.95, h * 0.5 + 2);
    if (opts.sub) { g.font = `400 ${h * 0.13}px Arial`; g.fillStyle = '#ffd89a'; g.fillText(opts.sub, h * 0.97, h * 0.88); }
  });
}

export function wrapText(g, text, x, y, maxW, lh) {
  const words = text.split(/\s+/); let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}

export function infoPanelTexture(THREE, title, body, style) {
  return canvasTex(THREE, 512, 640, (g, w, h) => {
    g.fillStyle = '#f4efe3'; g.fillRect(0, 0, w, h);
    g.fillStyle = style.dado; g.fillRect(0, 0, w, 86);
    drawRoundel(g, 54, 43, 26, style.accent);
    g.fillStyle = '#fff'; g.font = '600 34px Arial'; g.textBaseline = 'middle'; g.fillText(title, 100, 46);
    g.fillStyle = '#1a1a1a'; g.textBaseline = 'alphabetic'; g.font = '30px Georgia, serif';
    wrapText(g, body, 34, 150, w - 68, 42);
    g.fillStyle = style.trim; g.fillRect(0, h - 14, w, 14);
  });
}
