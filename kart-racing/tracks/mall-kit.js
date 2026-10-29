// Mall Mayhem - geometry kit: a tiny merged-mesh builder (vertex colours, optional tiled/atlas UVs) and a canvas texture atlas.
import * as THREE from "three";

export const TAU = Math.PI * 2;
const _c = new THREE.Color();
export function rgb(hex) { _c.set(hex); return [_c.r, _c.g, _c.b]; }
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return new THREE.Color(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t).getHex(); };
export const shade = (hex, k) => { const x = rgb(hex); return new THREE.Color(Math.min(1, x[0] * k), Math.min(1, x[1] * k), Math.min(1, x[2] * k)).getHex(); };

export class Mesher {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; this.items = []; }
  // a,b,c,d: [x,y,z] counter-clockwise seen from the front. uv: [[u,v]*4] | null. want: optional expected normal (flips winding when needed)
  quad(a, b, c, d, color = 0xffffff, uv = null, want = null) {
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (want && nx * want[0] + ny * want[1] + nz * want[2] < 0) { [b, d] = [d, b]; if (uv) uv = [uv[0], uv[3], uv[2], uv[1]]; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const col = Array.isArray(color) ? color : rgb(color), o = this.n;
    this.items.push(o, 1);
    for (const p of [a, b, c, d]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, ny, nz); this.col.push(col[0], col[1], col[2]); }
    if (uv) for (const t of uv) this.uv.push(t[0], t[1]); else this.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3); this.n += 4;
    return this;
  }
  // axis-aligned-in-local box centred (cx, cy, cz), rotated by ry about Y. opts: tile [tu,tv] metres per UV unit (world-y based v), skip [faces], colors {top,bot,side}, rect [u0,v0,u1,v1] (stretch an atlas rect on every face), inward (flip for room interiors)
  box(cx, cy, cz, w, h, d, color = 0xffffff, o = {}) {
    const ry = o.ry || 0, cs = Math.cos(ry), sn = Math.sin(ry), hx = w / 2, hy = h / 2, hz = d / 2;
    const T = (x, y, z) => [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs];
    const tu = o.tile ? o.tile[0] : 0, tv = o.tile ? o.tile[1] : 0, sk = o.skip || [];
    const cl = o.colors || {};
    const uvFor = (len, y0, y1, u0 = 0) => {
      if (o.rect) { const r = o.rect; return [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]; }
      if (!o.tile) return null;
      return [[u0 / tu, (cy + y0) / tv], [(u0 + len) / tu, (cy + y0) / tv], [(u0 + len) / tu, (cy + y1) / tv], [u0 / tu, (cy + y1) / tv]];
    };
    const inw = o.inward ? -1 : 1;
    const sideC = cl.side ?? color;
    if (!sk.includes("px")) this.quad(T(hx, -hy, hz), T(hx, -hy, -hz), T(hx, hy, -hz), T(hx, hy, hz), cl.px ?? sideC, uvFor(d, -hy, hy), [cs * inw, 0, -sn * inw]);
    if (!sk.includes("nx")) this.quad(T(-hx, -hy, -hz), T(-hx, -hy, hz), T(-hx, hy, hz), T(-hx, hy, -hz), cl.nx ?? sideC, uvFor(d, -hy, hy), [-cs * inw, 0, sn * inw]);
    if (!sk.includes("pz")) this.quad(T(-hx, -hy, hz), T(hx, -hy, hz), T(hx, hy, hz), T(-hx, hy, hz), cl.pz ?? sideC, uvFor(w, -hy, hy), [sn * inw, 0, cs * inw]);
    if (!sk.includes("nz")) this.quad(T(hx, -hy, -hz), T(-hx, -hy, -hz), T(-hx, hy, -hz), T(hx, hy, -hz), cl.nz ?? sideC, uvFor(w, -hy, hy), [-sn * inw, 0, -cs * inw]);
    const tuv = o.rect ? uvFor() : o.tile ? [[0, 0], [w / tu, 0], [w / tu, d / tu], [0, d / tu]] : null;
    if (!sk.includes("top")) this.quad(T(-hx, hy, hz), T(hx, hy, hz), T(hx, hy, -hz), T(-hx, hy, -hz), cl.top ?? color, tuv, [0, inw, 0]);
    if (!sk.includes("bot")) this.quad(T(-hx, -hy, -hz), T(hx, -hy, -hz), T(hx, -hy, hz), T(-hx, -hy, hz), cl.bot ?? shade(color, 0.6), tuv, [0, -inw, 0]);
    return this;
  }
  // box by extents
  boxB(x0, y0, z0, x1, y1, z1, color, o) { return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, color, o); }
  // upright cylinder (or cone when r1 != r0) from y0 to y0+h
  cyl(cx, y0, cz, r0, h, color = 0xffffff, o = {}) {
    const seg = o.seg || 10, r1 = o.r1 ?? r0, col = rgb(color), topC = o.top ? rgb(o.top) : col;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, am = (a0 + a1) / 2;
      const p = (a, r, y) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
      const uv = o.rect ? [[o.rect[0], o.rect[1]], [o.rect[2], o.rect[1]], [o.rect[2], o.rect[3]], [o.rect[0], o.rect[3]]] : o.tile ? [[i / seg * o.tile, y0 / 4], [(i + 1) / seg * o.tile, y0 / 4], [(i + 1) / seg * o.tile, (y0 + h) / 4], [i / seg * o.tile, (y0 + h) / 4]] : null;
      this.quad(p(a1, r0, y0), p(a0, r0, y0), p(a0, r1, y0 + h), p(a1, r1, y0 + h), col, uv, [Math.cos(am), 0, Math.sin(am)]);
      if (o.caps !== false && r1 > 0.001) this.quad([cx, y0 + h, cz], p(a1, r1, y0 + h), p(a0, r1, y0 + h), p(a0, r1, y0 + h), topC, null, [0, 1, 0]);
    }
    return this;
  }
  // append a THREE geometry with a transform and flat colour
  geo(g, m, color = 0xffffff) {
    const gg = g.index ? g.toNonIndexed() : g, pa = gg.attributes.position, na = gg.attributes.normal, ua = gg.attributes.uv, col = rgb(color);
    const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m), o = this.n;
    this.items.push(o, 0);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m); this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z);
      this.col.push(col[0], col[1], col[2]);
      if (ua) this.uv.push(ua.getX(i), ua.getY(i)); else this.uv.push(0, 0);
      this.idx.push(o + i);
    }
    this.n += pa.count;
    return this;
  }
  mesh(material, name) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65000 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material); m.name = name || "mall-mesh"; m.matrixAutoUpdate = false; m.updateMatrix();
    return m;
  }
  // spatially chunked meshes (so far-away parts of the city are frustum culled)
  meshes(material, name, cell = 190) {
    const buckets = new Map(), it = this.items, P = this.pos;
    for (let k = 0; k < it.length; k += 2) {
      const vs = it[k], ve = k + 2 < it.length ? it[k + 2] : this.n;
      let cx = 0, cz = 0; for (let v = vs; v < ve; v++) { cx += P[v * 3]; cz += P[v * 3 + 2]; } cx /= ve - vs; cz /= ve - vs;
      const key = Math.floor(cx / cell) + "," + Math.floor(cz / cell);
      let b = buckets.get(key); if (!b) buckets.set(key, (b = [])); b.push(k);
    }
    const out = [];
    for (const [key, list] of buckets) {
      const pos = [], nor = [], uv = [], col = [], idx = []; let n = 0;
      for (const k of list) {
        const vs = it[k], ve = k + 2 < it.length ? it[k + 2] : this.n, quad = it[k + 1] === 1, o = n;
        for (let v = vs; v < ve; v++) { pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); nor.push(this.nor[v * 3], this.nor[v * 3 + 1], this.nor[v * 3 + 2]); col.push(this.col[v * 3], this.col[v * 3 + 1], this.col[v * 3 + 2]); uv.push(this.uv[v * 2], this.uv[v * 2 + 1]); }
        if (quad) idx.push(o, o + 1, o + 2, o, o + 2, o + 3); else for (let v = 0; v < ve - vs; v++) idx.push(o + v);
        n += ve - vs;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(n > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1)); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, material); m.name = (name || "mall") + "@" + key; m.matrixAutoUpdate = false; m.updateMatrix(); out.push(m);
    }
    return out;
  }
  get empty() { return this.n === 0; }
}

// Shelf-packed canvas atlas. alloc(w,h) -> rect with .uv = [u0,v0,u1,v1] (v up).
export class Atlas {
  constructor(W = 2048, H = 3072) {
    this.W = W; this.H = H; this.cv = document.createElement("canvas"); this.cv.width = W; this.cv.height = H;
    this.ctx = this.cv.getContext("2d"); this.ctx.fillStyle = "#ffffff"; this.ctx.fillRect(0, 0, W, H);
    this.x = 0; this.y = 0; this.rowH = 0; this.G = 6;
  }
  alloc(w, h) {
    if (this.x + w + this.G > this.W) { this.x = 0; this.y += this.rowH + this.G; this.rowH = 0; }
    if (this.y + h + this.G > this.H) throw new Error("mall atlas full " + JSON.stringify(this.log));
    (this.log = this.log || []).push(w + "x" + h); const r = { x: this.x, y: this.y, w, h }; this.x += w + this.G; this.rowH = Math.max(this.rowH, h);
    const e = 1.2; r.uv = [(r.x + e) / this.W, 1 - (r.y + h - e) / this.H, (r.x + w - e) / this.W, 1 - (r.y + e) / this.H];
    return r;
  }
  paint(w, h, fn) {
    const r = this.alloc(w, h), g = this.ctx;
    g.save(); g.translate(r.x, r.y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(g, w, h); g.restore();
    return r;
  }
  texture() { const t = new THREE.CanvasTexture(this.cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
}

// sub-rect of an atlas rect: fractions fx0..fx1 across, fy0..fy1 down(0=top)
export function sub(r, fx0 = 0, fx1 = 1, fy0 = 0, fy1 = 1) {
  const [u0, v0, u1, v1] = r.uv, du = u1 - u0, dv = v1 - v0;
  return [u0 + du * fx0, v0 + dv * (1 - fy1), u0 + du * fx1, v0 + dv * (1 - fy0)];
}
// uv list for a quad a,b,c,d = bottom-left, bottom-right, top-right, top-left using rect [u0,v0,u1,v1]
export const rectUV = (r) => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];

// text helper: fits text to width
export function fitText(g, text, x, y, maxW, font, size, color = "#fff", align = "center") {
  let s = size; g.font = `${font.replace("%s", s)}`; while (g.measureText(text).width > maxW && s > 8) { s -= 2; g.font = `${font.replace("%s", s)}`; }
  g.fillStyle = color; g.textAlign = align; g.textBaseline = "middle"; g.fillText(text, x, y);
}
export const FONT = "900 %spx Arial Black, Impact, Arial, sans-serif";
export const FONT_N = "700 %spx Arial, Helvetica, sans-serif";
