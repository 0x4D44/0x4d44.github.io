// Mall Mayhem - theme + scenery. A bright daytime city centre; the road runs through a shopping centre, a supermarket and a TV office.
// Layout constants live in mall-layout.js; geometry helpers in mall-kit.js; the three interiors in mall-mall.js / mall-super.js / mall-office.js.
import * as THREE from "three";
import { MALL, SUPER, OFFICE, FLYOVER, HAIRPIN } from "./mall-layout.js";
import { Mesher, Atlas, rgb, shade, mix, fitText, FONT, FONT_N, TAU, rectUV, sub } from "./mall-kit.js";
import { buildMall } from "./mall-mall.js";
import { buildSuper } from "./mall-super.js";
import { buildOffice } from "./mall-office.js";
import { elevatedDeck } from "./mall-common.js";

const SHOP_NAMES = [
  ["BURGER BARON", "#c8281e", "#ffd34d"], ["GREGORY'S PASTIES", "#e8b04a", "#4a2a12"], ["TECH-O-RAMA", "#1b2a55", "#4de0ff"], ["SHOE ZONE 2", "#ff6a1f", "#ffffff"],
  ["PIZZA PLANET", "#1f8a4c", "#fff3c4"], ["BOOKWORMS", "#5b3a8c", "#ffe9a8"], ["COFFEE & CO", "#5a3a22", "#f6e7cf"], ["BLOCKBUSTED VIDEO", "#1c4fb5", "#ffd34d"],
  ["H&N FASHION", "#111111", "#ffffff"], ["PHONE SHACK", "#d9262c", "#ffffff"], ["CHEMIST 24", "#0f9d6b", "#ffffff"], ["POUND SHOP", "#f2c200", "#1a1a1a"],
  ["DONUT HOLE", "#ff7aa8", "#ffffff"], ["KEBAB KING", "#8a1d1d", "#ffd34d"], ["FLORA FLOWERS", "#7ac143", "#ffffff"], ["OPTIC ILLUSION", "#2d7fd6", "#ffffff"],
  ["TOY BARN", "#ff3d8b", "#ffe14d"], ["SPORTS DEPOT", "#e8453c", "#ffffff"], ["CAKE WALK", "#c98cf0", "#ffffff"], ["JEWEL BOX", "#16213e", "#ffd34d"],
];

export default {
  id: "mall",
  terrainAmp: 0.3,
  theme: {
    shoulder: 2.2, kerb: [0xe8453c, 0xffffff], wallBase: "#f4efe6", wallAccent: "#2b7bd6", wallText: ["MEGA MALL", "FRESH MART", "TV CENTRE", "APEX KARTS"],
    asphalt: "#4a4d55", line: "#f6f1e4", padColor: "#ffb020", padColor2: "#ff5a1f",
    ground: "#a7a69f", groundVar: 8, shoulderCol: "#bdb8ac",
    fog: [0xd2e6f6, 260, 1200],
    hemi: [0xeaf3ff, 0x9a968d, 1.15], sun: { color: 0xfff2dc, i: 2.0, dir: [0.35, 0.8, 0.45] },
    sky: { stops: [[0, "#3f86d8"], [0.3, "#79b2ea"], [0.45, "#b9dcf8"], [0.5, "#d6e8f6"], [0.56, "#d2e6f6"], [1, "#d2e6f6"]], sun: { glow: "#fff6dd", disc: "#ffffff", size: 0.014 }, clouds: "#ffffff", ridge: ["#b9c7d6", "#a2b3c6"], stars: false },
  },
  scenery(track, X, K) {
    const S = makeContext(track, X, K);
    flattenAndClean(S);
    buildMall(S);
    buildSuper(S);
    buildOffice(S);
    buildCity(S);
    buildStreet(S);
    finish(S);
  },
};

// ---------------------------------------------------------------- shared context
function makeContext(track, X, K) {
  const { group, rng, wallDist, hw, nearest, own } = X;
  const atlas = new Atlas(2048, 3072);
  const S = { THREE, track, X, K, group, rng, wallDist, hw, nearest, own, atlas, C: X.C, def: X.def, anim: X.anim };
  S.R = K.R; S.pick = K.pick;
  S.at = K.at;
  S.keepOut = [];
  // meshers -> materials (created in finish())
  S.lit = new Mesher();      // sun-lit vertex coloured (exteriors, props)
  S.basic = new Mesher();    // unlit vertex coloured (interior surfaces, emissive panels)
  S.sign = new Mesher();     // atlas textured, unlit (signs, shopfronts)
  S.signLit = new Mesher();  // atlas textured, sun lit
  S.glass = new Mesher();    // translucent glass
  S.fac = [new Mesher(), new Mesher(), new Mesher()];  // tiled facades: glass tower, brick, stone
  S.floors = [];             // overlay floor meshes (added directly)
  S.cols = (x, z, r, y0 = -1, y1 = 2.2) => track.addObstacle(x, z, r, y0, y1);
  S.pal = (arr) => arr[Math.floor(rng() * arr.length)];
  S.inRect = (r, x, z, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
  S.keepOut.push({ x0: MALL.x0 - 4, x1: MALL.x1 + 4, z0: MALL.z0 - 4, z1: MALL.z1 + 4 }, { x0: SUPER.x0 - 4, x1: SUPER.x1 + 4, z0: SUPER.z0 - 4, z1: SUPER.z1 + 4 }, { x0: OFFICE.x0 - 4, x1: OFFICE.x1 + 4, z0: OFFICE.z0 - 4, z1: OFFICE.z1 + 4 });
  S.keepOut.push({ x0: 590, x1: 1000, z0: FLYOVER.zCross - FLYOVER.crossW / 2 - 3, z1: FLYOVER.zCross + FLYOVER.crossW / 2 + 3 });

  // quad on a vertical face: centre (cx,cz), outward normal (nx,nz), width, y0..y1
  S.wallQuad = (m, cx, cz, nx, nz, w, y0, y1, color, uv, push = 0) => {
    const rx = nz, rz = -nx, hx = (w / 2), px = nx * push, pz = nz * push;
    m.quad([cx - rx * hx + px, y0, cz - rz * hx + pz], [cx + rx * hx + px, y0, cz + rz * hx + pz], [cx + rx * hx + px, y1, cz + rz * hx + pz], [cx - rx * hx + px, y1, cz - rz * hx + pz], color, uv, [nx, 0, nz]);
  };
  // horizontal quad (floor/ceiling) rect; up = +1 faces up
  S.flat = (m, x0, z0, x1, z1, y, color, up = 1, uv = null) => {
    m.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color, uv, [0, up, 0]);
  };
  // texture painters
  S.shops = [];
  S.shop = (i) => {
    i = ((i % SHOP_NAMES.length) + SHOP_NAMES.length) % SHOP_NAMES.length;
    if (S.shops[i]) return S.shops[i];
    const [name, bg, fg] = SHOP_NAMES[i];
    const r = atlas.paint(256, 128, (g, w, h) => {
      g.fillStyle = shadeCss(bg, 0.85); g.fillRect(0, 0, w, h);
      // sign board
      g.fillStyle = bg; g.fillRect(0, 0, w, 34);
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, 31, w, 4);
      fitText(g, name, w / 2, 18, w - 18, FONT, 22, fg);
      // window
      const gr = g.createLinearGradient(0, 40, 0, 118); gr.addColorStop(0, "#cfe9f7"); gr.addColorStop(1, "#7fa7bf");
      g.fillStyle = "#222"; g.fillRect(10, 40, w - 76, 80); g.fillStyle = gr; g.fillRect(14, 44, w - 84, 72);
      // goods
      for (let k = 0; k < 7; k++) { g.fillStyle = ["#ff6a6a", "#ffd34d", "#6ad0ff", "#fff", "#8aff9a", "#e48cff"][k % 6]; g.fillRect(20 + k * 24, 80 + (k % 3) * 8, 14, 34 - (k % 3) * 8); }
      g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.moveTo(14, 44); g.lineTo(70, 44); g.lineTo(30, 116); g.lineTo(14, 116); g.fill();
      // door
      g.fillStyle = "#222"; g.fillRect(w - 58, 40, 48, 88); g.fillStyle = "#bfe4f2"; g.fillRect(w - 54, 44, 40, 84); g.fillStyle = "#222"; g.fillRect(w - 34, 44, 2, 84);
      g.fillStyle = "#ffe9a8"; g.fillRect(w - 50, 92, 4, 14);
      g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(0, 124, w, 4);
    });
    S.shops[i] = r; return r;
  };
  S.nShops = SHOP_NAMES.length;
  // free-standing textured sign: text on coloured board
  const bcache = new Map();
  S.board = (text, w, h, bg, fg, o = {}) => { const key = [text, w, h, bg, fg, o.border, o.stripe, o.pad].join("|"); if (bcache.has(key)) return bcache.get(key); const r = S._board(text, w, h, bg, fg, o); bcache.set(key, r); return r; };
  S._board = (text, w, h, bg, fg, o = {}) => { const k = w > 600 ? 0.62 : 1; w = Math.round(w * k); h = Math.round(h * k); return atlas.paint(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (o.border) { g.strokeStyle = o.border; g.lineWidth = Math.max(4, h * 0.06); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth); }
    if (o.stripe) { g.fillStyle = o.stripe; g.fillRect(0, h - h * 0.12, w, h * 0.12); }
    const lines = String(text).split("\n"), lh = h / (lines.length + (o.pad ?? 0.4));
    lines.forEach((t, k) => fitText(g, t, w / 2, h * (o.pad ? 0.5 : 0.5) + (k - (lines.length - 1) / 2) * lh, w - 20, o.font || FONT, Math.floor(lh * 0.85), fg));
  }); };
  // stripes (awnings): colour pair
  S.stripes = (c1, c2) => atlas.paint(64, 32, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(i * 8, 0, 8, 32); } });
  return S;
}
const shadeCss = (hex, k) => { const c = new THREE.Color(hex); return "#" + new THREE.Color(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k)).getHexString(); };
export { shadeCss };

// ---------------------------------------------------------------- terrain flatten + remove the generic racing props
function flattenAndClean(S) {
  const { X, group, track } = S;
  const t = group.getObjectByName("terrain");
  if (t) {
    const p = t.geometry.attributes.position, n = t.geometry.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setY(i, -0.2);
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    p.needsUpdate = true; n.needsUpdate = true;
  }
  X.groundY = () => -0.1; track.groundY = X.groundY;
  const kill = [];
  for (const c of group.children) {
    if (c.name === "grandstand" || c.name === "tyres" || c.name === "flags" || (c.isMesh && c.name === "")) kill.push(c);
    if (c.name === "pillars" || c.name === "deck") kill.push(c);
  }
  for (const c of kill) group.remove(c);
  // engine bridge pillars (if any were generated) must not leave colliders behind
  for (const o of track.obstacles) o.y0 = 1e9;
}

// ---------------------------------------------------------------- city blocks
const FACADES = (S) => {
  const mk = (draw) => { const c = document.createElement("canvas"); c.width = 128; c.height = 128; draw(c.getContext("2d")); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const glass = mk((g) => {
    g.fillStyle = "#cfd8e2"; g.fillRect(0, 0, 128, 128);
    const gr = g.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, "#9bc4e6"); gr.addColorStop(0.5, "#5f93c4"); gr.addColorStop(1, "#8bb6da");
    g.fillStyle = gr; g.fillRect(2, 6, 124, 86);
    g.fillStyle = "rgba(255,255,255,0.25)"; g.beginPath(); g.moveTo(10, 6); g.lineTo(46, 6); g.lineTo(14, 92); g.lineTo(2, 92); g.fill();
    g.fillStyle = "#6b7684"; g.fillRect(0, 92, 128, 36); g.fillRect(62, 6, 4, 86);
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, 124, 128, 4);
  });
  const brick = mk((g) => {
    g.fillStyle = "#b5694a"; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(60,25,15,0.35)"; g.lineWidth = 1;
    for (let y = 0; y < 128; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); for (let x = (y / 8) % 2 ? 0 : 8; x < 128; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); } }
    g.fillStyle = "#e8e0d0"; g.fillRect(34, 22, 60, 76); g.fillStyle = "#37506b"; g.fillRect(38, 26, 52, 68);
    g.fillStyle = "#e8e0d0"; g.fillRect(62, 26, 4, 68); g.fillRect(38, 58, 52, 4);
    g.fillStyle = "rgba(255,255,255,0.2)"; g.fillRect(38, 26, 14, 68);
    g.fillStyle = "#d6c9b0"; g.fillRect(30, 98, 68, 5);
  });
  const stone = mk((g) => {
    g.fillStyle = "#e4dac3"; g.fillRect(0, 0, 128, 128);
    g.fillStyle = "rgba(0,0,0,0.05)"; for (let i = 0; i < 30; i++) g.fillRect(S.rng() * 128, S.rng() * 128, 10, 3);
    g.fillStyle = "#8a97a6"; g.fillRect(20, 18, 38, 84); g.fillRect(70, 18, 38, 84);
    g.fillStyle = "#b6d4ea"; g.fillRect(23, 21, 32, 78); g.fillRect(73, 21, 32, 78);
    g.fillStyle = "rgba(255,255,255,0.3)"; g.fillRect(23, 21, 10, 78); g.fillRect(73, 21, 10, 78);
    g.fillStyle = "#cdbf9f"; g.fillRect(16, 102, 46, 5); g.fillRect(66, 102, 46, 5); g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(0, 124, 128, 4);
  });
  return [glass, brick, stone];
};

function rectDist(nearest, x0, z0, x1, z1, clear) {
  // sample the perimeter + centre; true when all samples are farther than clear from the road
  const xs = [x0, (x0 + x1) / 2, x1], zs = [z0, (z0 + z1) / 2, z1];
  for (const x of xs) for (const z of zs) if (nearest(x, z) < clear) return false;
  for (let k = 0; k <= 4; k++) { const f = k / 4, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f; if (nearest(x, z0) < clear || nearest(x, z1) < clear || nearest(x0, z) < clear || nearest(x1, z) < clear) return false; }
  return true;
}

function buildCity(S) {
  const { track, rng, nearest, wallDist, R } = S;
  S.facTex = FACADES(S);
  const b = track.bounds, CELL = 36, clear = wallDist + 5.5;
  const gx0 = Math.floor((b.minX - 260) / CELL) * CELL, gz0 = Math.floor((b.minZ - 260) / CELL) * CELL;
  const toTower = [];
  const stripePairs = [["#e8453c", "#ffffff"], ["#2b7bd6", "#ffffff"], ["#1fa86b", "#ffffff"], ["#ffb020", "#ffffff"], ["#7b4bff", "#f4ecff"], ["#111111", "#ffd34d"]];
  const awn = stripePairs.map(([a, c]) => S.stripes(a, c));
  const tints = [0xffffff, 0xf2efe9, 0xe9f0f7, 0xf7e9e0, 0xe6e6e6];
  S.buildings = [];
  const overlap = (a, c) => a.x0 < c.x1 && a.x1 > c.x0 && a.z0 < c.z1 && a.z1 > c.z0;
  for (let gz = gz0; gz < b.maxZ + 260; gz += CELL) for (let gx = gx0; gx < b.maxX + 260; gx += CELL) {
    const trims = [0, 7, 14, 21];
    let best = null, area = 0;
    for (const tl of trims) for (const tr of trims) for (const tt of trims) for (const tb of trims) {
      const r = { x0: gx + 2 + tl, x1: gx + CELL - 2 - tr, z0: gz + 2 + tt, z1: gz + CELL - 2 - tb };
      const w = r.x1 - r.x0, d = r.z1 - r.z0; if (w < 15 || d < 15 || w * d <= area) continue;
      if (S.keepOut.some((k) => overlap(r, k))) continue;
      if (!rectDist(nearest, r.x0, r.z0, r.x1, r.z1, clear)) continue;
      best = r; area = w * d;
    }
    if (!best) continue;
    const r = best, dRoad = Math.min(nearest(r.x0, r.z0), nearest(r.x1, r.z0), nearest(r.x0, r.z1), nearest(r.x1, r.z1), nearest((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2));
    const near = dRoad < 60;
    const hgt = near ? R(16, 40) : R(34, 90);
    const type = Math.floor(rng() * 3), tint = S.pal(tints);
    S.buildings.push({ ...r, h: hgt, type });
    const fm = S.fac[type], w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    fm.box(cx, hgt / 2, cz, w, hgt, d, tint, { tile: [4, 4], skip: ["top", "bot"] });
    S.flat(S.lit, r.x0, r.z0, r.x1, r.z1, hgt, 0x8d8f94, 1);
    // parapet rim + roof clutter
    S.lit.box(cx, hgt + 0.5, r.z0 + 0.25, w, 1, 0.5, 0xb9bbc0); S.lit.box(cx, hgt + 0.5, r.z1 - 0.25, w, 1, 0.5, 0xb9bbc0);
    S.lit.box(r.x0 + 0.25, hgt + 0.5, cz, 0.5, 1, d, 0xb9bbc0); S.lit.box(r.x1 - 0.25, hgt + 0.5, cz, 0.5, 1, d, 0xb9bbc0);
    for (let k = 0; k < 2 + Math.floor(rng() * 3); k++) {
      const bx = R(r.x0 + 4, r.x1 - 4), bz = R(r.z0 + 4, r.z1 - 4);
      if (rng() < 0.5) S.lit.box(bx, hgt + 1.1, bz, R(2, 5), 2, R(2, 5), 0xc9ccd2);
      else { S.lit.cyl(bx, hgt, bz, 1.6, 3.2, 0x7a5c44, { seg: 6, caps: false }); S.lit.cyl(bx, hgt + 3.2, bz, 1.8, 0.5, 0x5b4636, { seg: 6, r1: 0.1 }); }
    }
    // shopfronts + awnings on street-facing faces
    const faces = [[0, -1, r.x0, r.x1, r.z0, true], [0, 1, r.x0, r.x1, r.z1, true], [-1, 0, r.z0, r.z1, r.x0, false], [1, 0, r.z0, r.z1, r.x1, false]];
    for (const [nx, nz, a0, a1, fixed, alongX] of faces) {
      for (let p = a0 + 4; p + 4 <= a1 + 0.01; p += 8) {
        const px = alongX ? p + 4 > a1 ? a1 - 4 : p : fixed, pz = alongX ? fixed : p;
        const mx = alongX ? Math.min(p + 4, a1 - 4) : fixed, mz = alongX ? fixed : Math.min(p + 4, a1 - 4);
        void px; void pz;
        const probe = nearest(mx + nx * (wallDist + 6), mz + nz * (wallDist + 6));
        if (nearest(mx + nx * 6, mz + nz * 6) > wallDist + 20 && probe > wallDist + 20) continue;
        const idx = Math.floor(rng() * S.nShops), rect = S.shop(idx);
        S.wallQuad(S.sign, mx, mz, nx, nz, 8, 0, 4.2, 0xffffff, rectUV(rect.uv), 0.06);
        // awning
        const aw = awn[Math.floor(rng() * awn.length)], rx = nz, rz = -nx;
        const A = [mx - rx * 4, 3.9, mz - rz * 4], B = [mx + rx * 4, 3.9, mz + rz * 4], Cc = [B[0] + nx * 1.9, 3.3, B[2] + nz * 1.9], D = [A[0] + nx * 1.9, 3.3, A[2] + nz * 1.9];
        S.signLit.quad(A, B, Cc, D, 0xffffff, rectUV(aw.uv), [nx * 0.3, 1, nz * 0.3]);
      }
    }
    // some roofs get a billboard
    if (near && rng() < 0.3) {
      const bi = Math.floor(rng() * 6), t = S.board(["FRESH MART  -  OPEN 24H", "MEGA MALL SALE", "TV CENTRE LIVE", "BURGER BARON", "TECH-O-RAMA", "APEX KARTS"][bi], 512, 128, ["#e8453c", "#2b7bd6", "#1f8a4c", "#111827", "#7b4bff", "#d9262c"][bi], "#ffffff", { border: "#ffffff" });
      const side = Math.abs(cx - b.minX) < 0 ? 1 : 1;
      const bw = Math.min(w - 4, 18); void side;
      S.wallQuad(S.sign, cx, r.z0 + 1.2, 0, -1, bw, hgt + 1, hgt + 1 + bw / 4, 0xffffff, rectUV(t.uv), 0);
      S.wallQuad(S.sign, cx, r.z0 + 1.1, 0, 1, bw, hgt + 1, hgt + 1 + bw / 4, 0xffffff, rectUV(t.uv), 0);
      S.lit.box(cx - bw / 2 + 1, hgt + 1.5, r.z0 + 1.15, 0.4, 3, 0.4, 0x555a66); S.lit.box(cx + bw / 2 - 1, hgt + 1.5, r.z0 + 1.15, 0.4, 3, 0.4, 0x555a66);
    }
    toTower.push(r);
  }
}

// ---------------------------------------------------------------- street furniture, cross street, flyover bits, landmarks
function buildStreet(S) {
  const { track, rng, wallDist, nearest, R, C } = S;
  void C; void toRad;
  const L = track.length;
  const inside = (x, z) => S.keepOut.slice(0, 3).some((k) => x > k.x0 + 2 && x < k.x1 - 2 && z > k.z0 + 2 && z < k.z1 - 2);
  const onBuilding = (x, z) => S.buildings.some((b) => x > b.x0 - 1.5 && x < b.x1 + 1.5 && z > b.z0 - 1.5 && z < b.z1 + 1.5);
  const lamps = [], trees = [], cars = [], peds = [];
  for (let s = 6; s < L; s += 26) {
    for (const side of [-1, 1]) {
      const p = S.at(s, side * (wallDist + 1.9));
      if (inside(p.x, p.z) || onBuilding(p.x, p.z) || Math.abs(p.y) > 0.5) continue;
      lamps.push({ x: p.x, z: p.z, side, ry: p.h, s });
    }
  }
  for (let s = 20; s < L; s += 22) {
    const side = rng() < 0.5 ? -1 : 1, p = S.at(s, side * (wallDist + 4.2 + rng() * 2));
    if (inside(p.x, p.z) || onBuilding(p.x, p.z) || Math.abs(p.y) > 0.5 || nearest(p.x, p.z) < wallDist + 2.5) continue;
    if (rng() < 0.55) trees.push({ x: p.x, z: p.z });
    else if (rng() < 0.5) cars.push({ x: p.x, z: p.z, ry: p.h + (rng() < 0.5 ? 0 : Math.PI), c: S.pal([0xd9262c, 0x2b7bd6, 0xf2c200, 0xeeeeee, 0x222831, 0x1fa86b, 0xff7a1f, 0x8e44ad]) });
    else peds.push({ x: p.x, z: p.z });
  }
  const m = S.lit;
  for (const l of lamps) {
    m.cyl(l.x, 0, l.z, 0.14, 6.4, 0x3a3f4a, { seg: 4, caps: false });
    const toward = S.at(l.s, l.side * (wallDist + 1.9 - 1.6));
    m.box((l.x + toward.x) / 2, 6.4, (l.z + toward.z) / 2, 1.7, 0.14, 0.14, 0x3a3f4a, { ry: l.ry });
    S.basic.box(toward.x, 6.25, toward.z, 0.9, 0.16, 0.5, 0xfff4cc, { ry: l.ry });
  }
  for (const t of trees) {
    m.box(t.x, 0.35, t.z, 1.7, 0.7, 1.7, 0x9a9488);
    m.cyl(t.x, 0.7, t.z, 0.16, 2.6, 0x6b4a2f, { seg: 4, caps: false });
    const gc = S.pal([0x3e9b4a, 0x4aad55, 0x2f8a43]);
    m.cyl(t.x, 2.4, t.z, 1.5, 1.8, gc, { seg: 6, r1: 0.6 }); m.cyl(t.x, 3.6, t.z, 1.2, 1.5, shade(gc, 1.1), { seg: 6, r1: 0.1 });
  }
  for (const c of cars) car(S, c.x, c.z, c.ry, c.c);
  for (const p of peds) ped(S, p.x, p.z, S.pal([0xe63946, 0x1d7ff0, 0xffb703, 0x2ec4b6, 0x7b4a1e, 0xb517e8, 0x222222]));
  // zebra crossings on the High Street + beacons
  for (const s of [-70, 140]) zebra(S, s);
  for (const s of [880, 1250, 1600]) zebra(S, s);
  crossStreet(S);
  elevatedDeck(S, (i) => S.C.px[i] > 690 && S.C.pz[i] > 30 && S.C.pz[i] < 290);
  landmarks(S);
}
const toRad = 0;

export function car(S, x, z, ry, color) {
  const m = S.lit;
  m.box(x, 0.65, z, 1.9, 0.7, 4.3, color, { ry });
  m.box(x, 1.25, z - Math.cos(ry) * 0, 1.7, 0.6, 2.3, shade(color, 1.05), { ry });
  const c = Math.cos(ry), s = Math.sin(ry);
  S.glass.box(x, 1.28, z, 1.74, 0.5, 2.1, 0xaed4ea, { ry });
  for (const [dx, dz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) m.cyl(x + dx * c + dz * s, 0, z - dx * s + dz * c, 0.36, 0.28, 0x151515, { seg: 8 });
  S.cols(x, z, 1.2, -1, 2);
}
export function ped(S, x, z, color) {
  S.lit.cyl(x, 0, z, 0.26, 1.1, color, { seg: 6 }); S.lit.cyl(x, 1.1, z, 0.22, 0.45, shade(color, 1.2), { seg: 6 });
  S.lit.box(x, 1.72, z, 0.3, 0.3, 0.3, 0xf1c9a0);
}
function zebra(S, s) {
  const p = S.at(s, 0), { hw } = S;
  const white = S.white || (S.white = S.atlas.paint(8, 8, (g) => { g.fillStyle = "#fff"; g.fillRect(0, 0, 8, 8); }));
  const tx = Math.sin(p.h), tz = Math.cos(p.h), rx = -tz, rz = tx, y = p.y + 0.078;
  const a = (la, ta) => [p.x + rx * la + tx * ta, y, p.z + rz * la + tz * ta];
  S.zebras = S.zebras || new Mesher();
  for (let la = -hw + 1.0; la < hw - 0.5; la += 1.6) S.zebras.quad(a(la, -2.3), a(la + 0.9, -2.3), a(la + 0.9, 2.3), a(la, 2.3), 0xf2eee4, rectUV(sub(white, 0.2, 0.8, 0.2, 0.8)), [0, 1, 0]);
  for (const sg of [-1, 1]) { const q = S.at(s, sg * (S.wallDist + 1.4)); S.lit.cyl(q.x, 0, q.z, 0.1, 2.8, 0x222222, { seg: 6 }); S.basic.box(q.x, 3.0, q.z, 0.5, 0.5, 0.5, 0xffa51f); }
}
function crossStreet(S) {
  const F = FLYOVER, y = 0.0;
  const x0 = 590, x1 = 1000, z0 = F.zCross - F.crossW / 2, z1 = F.zCross + F.crossW / 2;
  const tex = S.atlas.paint(128, 256, (g, w, h) => {
    g.fillStyle = "#46494f"; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,0.15)"; for (let i = 0; i < 50; i++) g.fillRect(Math.random() * w, Math.random() * h, 12, 4);
    g.fillStyle = "#f6f1e4"; g.fillRect(4, 0, 4, h); g.fillRect(w - 8, 0, 4, h);
    for (let k = 0; k < 4; k++) g.fillRect(w / 2 - 2, k * 64 + 8, 4, 28);
    g.fillStyle = "#8a8d95"; g.fillRect(34, 0, 3, h); g.fillRect(w - 38, 0, 3, h);   // tram rails
  });
  S.roadMesh = S.roadMesh || new Mesher();
  // road: u along the street (rotated quad: tile every 16 m)
  const n = Math.round((x1 - x0) / 16);
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * 16, xb = xa + 16, r = tex.uv;
    S.roadMesh.quad([xa, y + 0.02, z1], [xa, y + 0.02, z0], [xb, y + 0.02, z0], [xb, y + 0.02, z1], 0xffffff, [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]], [0, 1, 0]);
  }
  // sidewalk kerbs
  S.lit.boxB(x0, 0, z0 - 0.4, x1, 0.18, z0, 0xbdb8ac); S.lit.boxB(x0, 0, z1, x1, 0.18, z1 + 0.4, 0xbdb8ac);
  // a parked tram under the flyover and a few cars in the street
  tram(S, 805, F.zCross + 4.2, Math.PI / 2, 0xd9262c);
  tram(S, 655, F.zCross - 4.2, -Math.PI / 2, 0x2b7bd6);
  for (let k = 0; k < 8; k++) { const cx = 610 + k * 47 + (k % 3) * 6; if (Math.abs(cx - F.x) < 22) continue; car(S, cx, F.zCross + (k % 2 ? 9.5 : -9.5), Math.PI / 2 + (k % 2 ? 0 : Math.PI), S.pal([0xd9262c, 0x2b7bd6, 0xf2c200, 0xeeeeee, 0x1fa86b])); }
}
export function tram(S, x, z, ry, color) {
  const m = S.lit, c = Math.cos(ry), s = Math.sin(ry);
  const len = 26;
  m.box(x, 1.8, z, 2.6, 3.0, len, color, { ry });
  m.box(x, 3.5, z, 2.0, 0.5, len - 2, 0xeeeeee, { ry });
  S.glass.box(x, 2.1, z, 2.64, 1.1, len - 3, 0x9cc8e8, { ry });
  m.box(x, 0.6, z, 2.4, 0.5, len + 0.2, 0x222222, { ry });
  S.basic.box(x + s * (len / 2 + 0.02), 2.6, z + c * (len / 2 + 0.02), 1.6, 0.5, 0.05, 0xffe9a8, { ry });
  S.cols(x, z, 1.6, -1, 4);
}

function landmarks(S) {
  // clock tower at the inner side of the north-east corner
  const cx = 730 - 28, cz = 28;
  const m = S.lit;
  m.box(cx, 0.4, cz, 14, 0.8, 14, 0xa7a79f); m.box(cx, 14, cz, 5, 28, 5, 0xc9b99a, {}); m.box(cx, 29, cz, 7, 3, 7, 0x8a7a5a); m.cyl(cx, 30.5, cz, 4.2, 6, 0x4a6a8a, { seg: 4, r1: 0.1 });
  const clock = S.atlas.paint(128, 128, (g) => { g.fillStyle = "#f4efe4"; g.fillRect(0, 0, 128, 128); g.strokeStyle = "#222"; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 56, 0, TAU); g.stroke(); g.lineWidth = 4; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.moveTo(64 + Math.sin(a) * 46, 64 - Math.cos(a) * 46); g.lineTo(64 + Math.sin(a) * 54, 64 - Math.cos(a) * 54); g.stroke(); } g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 28); g.stroke(); g.beginPath(); g.moveTo(64, 64); g.lineTo(92, 74); g.stroke(); });
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) S.wallQuad(S.sign, cx + nx * 3.55, cz + nz * 3.55, nx, nz, 5.4, 25.8, 31.2, 0xffffff, rectUV(clock.uv), 0);
  S.cols(cx, cz, 3.4, -1, 40);
  // fountain roundabout at the south-east corner
  const fx = 730 - 28, fz = 318 - 28;
  m.cyl(fx, 0, fz, 8, 0.7, 0xb8b4a8, { seg: 18 }); S.basic.cyl(fx, 0.72, fz, 7.2, 0.02, 0x59b8e8, { seg: 18 });
  m.cyl(fx, 0.7, fz, 1.2, 3.2, 0xd8d4c8, { seg: 10, r1: 0.6 }); S.basic.cyl(fx, 3.9, fz, 0.9, 0.5, 0xbfe8ff, { seg: 10, r1: 0.2 });
  S.cols(fx, fz, 8, -1, 2);
  // bus shelters beside the road (outside the wall)
  const bus = S.board("BUS STOP", 256, 96, "#d9262c", "#ffffff", { border: "#ffffff" });
  for (const s of [60, 1460]) {
    const p = S.at(s, S.wallDist + 4.0), h = p.h;
    S.glass.box(p.x, 1.3, p.z, 0.1, 2.6, 5, 0xa8d4ea, { ry: h + Math.PI / 2 });
    m.box(p.x, 2.7, p.z, 5.4, 0.15, 1.8, 0x2b7bd6, { ry: h + Math.PI / 2 });
    S.wallQuad(S.sign, p.x, p.z, Math.cos(h), -Math.sin(h), 1.4, 2.7, 3.4, 0xffffff, rectUV(bus.uv), 0.1);
  }
}

// ---------------------------------------------------------------- finalise: materials + meshes
function finish(S) {
  const { group, own, track } = S;
  const lamb = (o) => own(new THREE.MeshLambertMaterial(o));
  const add = (m, mat, name) => { if (!m.empty) for (const x of m.meshes(own(mat), name)) group.add(x); };
  add(S.lit, new THREE.MeshLambertMaterial({ vertexColors: true }), "mall-lit");
  add(S.basic, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), "mall-basic");
  const atex = own(S.atlas.texture());
  add(S.sign, new THREE.MeshBasicMaterial({ map: atex, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.35 }), "mall-signs");
  add(S.signLit, new THREE.MeshLambertMaterial({ map: atex, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.35 }), "mall-signs-lit");
  add(S.glass, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false, emissive: 0x335577 }), "mall-glass");
  S.fac.forEach((m, i) => add(m, new THREE.MeshLambertMaterial({ map: own(S.facTex[i]), vertexColors: true }), "mall-fac" + i));
  if (S.roadMesh) add(S.roadMesh, new THREE.MeshBasicMaterial({ map: atex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), "mall-crossroad");
  if (S.hazardM) add(S.hazardM, new THREE.MeshBasicMaterial({ map: atex, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), "mall-hazard");
  if (S.zebras) add(S.zebras, new THREE.MeshBasicMaterial({ map: atex, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), "mall-zebra");
  for (const m of S.floors) group.add(m);
  void track;
}
export { HAIRPIN, mix, rgb, FONT_N, lamb0 };
const lamb0 = null;
