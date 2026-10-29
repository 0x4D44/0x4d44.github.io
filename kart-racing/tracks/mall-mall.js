// Mall Mayhem - the MEGA MALL: ramp up to an upper concourse, weave round the fountain, ramp down and out.
import * as THREE from "three";
import { MALL } from "./mall-layout.js";
import { rectUV, shade, TAU, FONT, FONT_N, fitText } from "./mall-kit.js";
import { buildShell, roadOverlay, floorPainter, tiledTex, elevatedDeck, shopRun, WT } from "./mall-common.js";

export function buildMall(S) {
  const R = MALL, H = R.h, { track, X, rng, wallDist } = S;
  const ix0 = R.x0 + WT, ix1 = R.x1 - WT, iz0 = R.z0 + WT, iz1 = R.z1 - WT;
  const open = [{ c: 0, hw: 14.5, h: 11 }];
  const inner = buildShell(S, R, { w: open, e: open }, { fac: 0, tint: 0xdfeaf5, innerCol: 0xe6e2da, ceilCol: 0xf2f4f6 });
  S.mallInner = inner;

  // ---- interior wall dressing: two storeys of shopfronts + clerestory
  const clere = S.atlas.paint(256, 128, (g, w, h) => {
    g.fillStyle = "#e9e5db"; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 2; k++) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#8fc2ee"); gr.addColorStop(1, "#d8ecfa"); g.fillStyle = gr; g.fillRect(14 + k * 124, 12, 104, 92); g.fillStyle = "#e9e5db"; g.fillRect(64 + k * 124, 12, 4, 92); g.fillRect(14 + k * 124, 56, 104, 4); }
    g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, 118, w, 10);
  });
  const fascia = S.board("MEGA MALL  *  MEGA MALL  *  MEGA MALL  *", 512, 32, "#2b7bd6", "#ffffff", { font: FONT });
  for (const seg of inner) {
    const full = seg.y0 === 0, len = seg.b - seg.a;
    if (full && len > 6) {
      shopRun(S, seg, [[0, 6.2, 0], [7.5, 13.2, 7]]);
      const n = Math.max(1, Math.round(len / 8)), w = len / n;
      for (let k = 0; k < n; k++) {
        const mid = seg.a + (k + 0.5) * w, al = seg.side === "w" || seg.side === "e";
        const cx = al ? seg.ix : mid, cz = al ? mid : seg.iz;
        S.wallQuad(S.sign, cx, cz, seg.nx, seg.nz, w - 0.1, 13.4, 24.8, 0xffffff, rectUV(clere.uv), 0.04);
        S.wallQuad(S.sign, cx, cz, seg.nx, seg.nz, w - 0.1, 6.2, 7.5, 0xffffff, rectUV(fascia.uv), 0.04);
      }
    } else if (!full) {   // lintel above a door: glass wall
      const n = Math.max(1, Math.round(len / 8)), w = len / n;
      for (let k = 0; k < n; k++) { const cz = seg.a + (k + 0.5) * w; S.wallQuad(S.sign, seg.ix, cz, seg.nx, seg.nz, w - 0.1, seg.y0, H - 0.2, 0xffffff, rectUV(clere.uv), 0.04); }
    }
  }
  // (the thin top bit of each full-height wall above the clerestory is plain)

  // ---- floors: ground tiles everywhere inside, drawn lower than the road overlay
  const tile = tiledTex(S, 128, 128, (g) => { g.fillStyle = "#e7dfcf"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#d9cfba"; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); g.fillStyle = "rgba(0,0,0,0.1)"; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 128); g.fillStyle = "#b9c7d4"; g.fillRect(60, 60, 8, 8); });
  { const fm = new (S.fac[0].constructor)(); const T = 8; fm.quad([ix0, 0.0, iz1], [ix1, 0.0, iz1], [ix1, 0.0, iz0], [ix0, 0.0, iz0], 0xffffff, [[ix0 / T, iz1 / T], [ix1 / T, iz1 / T], [ix1 / T, iz0 / T], [ix0 / T, iz0 / T]], [0, 1, 0]);
    const mesh = fm.mesh(S.own(new THREE.MeshBasicMaterial({ map: tile, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })), "mall-floor-ground"); S.floors.push(mesh); }
  // road surface inside the mall: polished tiles with painted lanes
  const roadTex = tiledTex(S, 256, 256, floorPainter(S, "#efe7d6", "#e2d8c2", "#ffffff", { cells: 8, shoulder: "#b9c7d4" }));
  roadOverlay(S, roadTex, (i) => X.C.px[i] > R.x0 - 6 && X.C.px[i] < R.x1 + 6 && Math.abs(X.C.pz[i]) < 40, 16, "mall-road");
  elevatedDeck(S, (i) => X.C.px[i] > R.x0 - 40 && X.C.px[i] < R.x1 + 40 && Math.abs(X.C.pz[i]) < 40);

  // ---- ceiling: light panels + trusses
  for (let z = -60; z <= 60; z += 24) for (let x = ix0 + 8; x < ix1 - 14; x += 18) S.flat(S.basic, x, z - 1.8, x + 12, z + 1.8, H - 0.2, 0xffffff, -1);
  for (let x = ix0 + 6; x < ix1; x += 24) S.basic.box(x, H - 1.6, 0, 1.0, 1.2, iz1 - iz0, 0xcfd5dc);
  for (let z = -48; z <= 48; z += 24) S.basic.box((ix0 + ix1) / 2, H - 1.2, z, ix1 - ix0, 0.7, 0.7, 0xb9c0c8);

  // ---- columns (outside the road): ring of structural columns
  for (let x = ix0 + 22; x < ix1 - 10; x += 26) for (const z of [-58, 58]) { S.lit.box(x, H / 2, z, 3, H, 3, 0xf0f0f2); S.lit.box(x, 7, z, 3.3, 0.5, 3.3, 0x2b7bd6); S.cols(x, z, 2.1, -1, H); }

  // ---- fountain (centre of the south half would be inside the chicane; keep to the north + south voids)
  fountain(S, 458, -47, 10);
  garden(S, 458, 47);
  // escalators (decorative, between ground and the mezzanine ring)
  const steps = S.atlas.paint(64, 64, (g) => { g.fillStyle = "#5c6068"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#2b2e34"; for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 3); });
  escalator(S, ix0 + 5, 48, ix0 + 27, 48, 7, steps); escalator(S, ix0 + 27, 54, ix0 + 5, 54, 7, steps);
  escalator(S, ix1 - 5, -48, ix1 - 27, -48, 7, steps); escalator(S, ix1 - 27, -54, ix1 - 5, -54, 7, steps);
  // mezzanine ring decks
  for (const sg of [-1, 1]) {
    const z = sg < 0 ? iz0 + 2.5 : iz1 - 2.5;
    S.basic.box((ix0 + ix1) / 2, 6.7, z, ix1 - ix0, 0.5, 5, 0xcfc6b2); S.glass.box((ix0 + ix1) / 2, 7.7, z - sg * 2.45, ix1 - ix0, 1.4, 0.08, 0xcfe8f6);
    S.basic.box((ix0 + ix1) / 2, 6.35, z - sg * 2.2, ix1 - ix0, 0.3, 0.6, 0x2b7bd6);
  }
  // kiosks
  const kioskNames = [["MEGA PRETZEL", "#d97a1e"], ["CASE-O-MATIC", "#2d7fd6"], ["SMOOTHIE SHACK", "#7ac143"], ["INFORMATION", "#444c5c"], ["LOTTO LAND", "#d9262c"], ["CANDY CRUSH", "#e048b8"]];
  [[380, -44], [380, 44], [530, 44], [530, -44], [415, 58], [500, -58]].forEach(([x, z], k) => {
    const [name, col] = kioskNames[k], t = S.board(name, 256, 64, col, "#ffffff", { border: "#ffffff" });
    S.lit.box(x, 1.2, z, 5, 2.4, 3.4, 0xf4efe2); S.lit.box(x, 2.6, z, 6.2, 0.3, 4.6, parseInt(col.slice(1), 16));
    for (const nz of [-1, 1]) S.wallQuad(S.sign, x, z + nz * 2.35, 0, nz, 5.6, 2.9, 4.2, 0xffffff, rectUV(t.uv), 0);
    S.cols(x, z, 2.7, -1, 3);
  });
  // hanging banners
  const banners = [["SALE\n70% OFF", "#d9262c"], ["NEW SEASON\nCOLLECTION", "#2b7bd6"], ["WIN A\nKART!", "#f2c200"], ["SUMMER\nSPECIALS", "#1fa86b"], ["LEVEL 2\nCONCOURSE", "#7b4bff"], ["FREE\nWI-FI", "#ff7a1f"]];
  banners.forEach(([text, col], k) => {
    const t = S.board(text, 128, 256, col, col === "#f2c200" ? "#222" : "#ffffff", { border: "#fff", pad: 0.3 }), x = 335 + k * 46, z = k % 2 ? -34 : 34;
    for (const nx of [-1, 1]) S.wallQuad(S.sign, x + nx * 0.05, z, nx, 0, 4.0, 11, 19, 0xffffff, rectUV(t.uv), 0);
    S.basic.box(x, 19.4, z, 0.1, 0.1, 0.1, 0x333333); S.basic.box(x, 21.5, z, 0.08, 4.2, 0.08, 0x666666);
  });
  // door lintel signs (outside + inside)
  const welcome = S.board("MEGA MALL", 1000, 250, "#0f3d8a", "#ffd34d", { border: "#ffffff", stripe: "#e8453c" });
  const thanks = S.board("THANKS - COME BACK SOON!", 1000, 250, "#0f3d8a", "#ffffff", { border: "#ffffff", stripe: "#e8453c" });
  S.wallQuad(S.sign, R.x0, 0, -1, 0, 28, 12.0, 19.0, 0xffffff, rectUV(welcome.uv), 0.1);
  S.wallQuad(S.sign, R.x1, 0, 1, 0, 28, 12.0, 19.0, 0xffffff, rectUV(thanks.uv), 0.1);
  S.wallQuad(S.sign, ix0 + 0.1, 0, 1, 0, 24, 12, 17, 0xffffff, rectUV(S.board("WELCOME TO THE MEGA MALL\nSHOPS - FOOD - FUN", 1000, 250, "#d9262c", "#ffffff", { border: "#fff" }).uv), 0.02);
  S.wallQuad(S.sign, ix1 - 0.1, 0, -1, 0, 24, 12, 17, 0xffffff, rectUV(S.board("THANKS FOR SHOPPING!\nMIND THE TROLLEYS", 1000, 250, "#1fa86b", "#ffffff", { border: "#fff" }).uv), 0.02);
  // EXIT signs
  const exitT = S.board("EXIT  ->", 256, 96, "#0f9d4a", "#ffffff", { border: "#ffffff" });
  S.wallQuad(S.sign, ix1 - 0.25, -15.5, -1, 0, 5, 9.0, 10.9, 0xffffff, rectUV(exitT.uv), 0);
  // overhead gantries with signs
  gantry(S, 328, "LEVEL 2 CONCOURSE  >", "#2b7bd6", 5.8);
  gantry(S, 398, "FOUNTAIN CHICANE", "#7b4bff", 7.5 + 5.6);
  gantry(S, 540, "EXIT TO HIGH STREET", "#0f9d4a", 3.3 + 5.6);
  // exterior fascia band + base plinth on all four faces
  for (let x = R.x0 + 20; x < R.x1 - 10; x += 40) for (const [nz, z] of [[-1, R.z0], [1, R.z1]]) S.wallQuad(S.sign, x, z, 0, nz, 36, 22.4, 24.8, 0xffffff, rectUV(fascia.uv), 0.05);
  for (const [nx, x] of [[-1, R.x0], [1, R.x1]]) for (const z of [-44, 44]) S.wallQuad(S.sign, x, z, nx, 0, 36, 22.4, 24.8, 0xffffff, rectUV(fascia.uv), 0.05);
  S.lit.box((R.x0 + R.x1) / 2, 0.6, R.z0 - 0.2, R.x1 - R.x0, 1.2, 0.5, 0x39404d); S.lit.box((R.x0 + R.x1) / 2, 0.6, R.z1 + 0.2, R.x1 - R.x0, 1.2, 0.5, 0x39404d);
  // rooftop sign
  { const t = S.board("MEGA MALL", 1000, 250, "#e8453c", "#ffffff", { border: "#ffd34d" });
    for (const nx of [-1, 1]) S.wallQuad(S.sign, R.x0 + 30, 0, nx, 0, 36, H + 1.5, H + 10.5, 0xffffff, rectUV(t.uv), nx * 0.1);
    S.lit.box(R.x0 + 30, H + 1, -16, 0.8, 3, 0.8, 0x555a66); S.lit.box(R.x0 + 30, H + 1, 16, 0.8, 3, 0.8, 0x555a66); }
  // planters at the road edge (colliders)
  const pl = [140, 164, 346, 372, 396];
  pl.forEach((s, k) => {
    const sp = track.sample(s), side = k % 2 ? 1 : -1, lat = side * (wallDist - 1.55);
    const x = sp.pos.x + sp.right.x * lat, z = sp.pos.z + sp.right.z * lat, y = sp.pos.y;
    S.lit.cyl(x, y, z, 0.95, 0.8, 0xb8a98a, { seg: 10 }); S.lit.cyl(x, y + 0.8, z, 0.7, 0.9, 0x3e9b4a, { seg: 8, r1: 0.25 });
    S.cols(x, z, 1.0, y - 0.5, y + 2.2);
  });
  // lifts
  for (const [x, z] of [[ix0 + 12, -30], [ix1 - 12, 30]]) lift(S, x, z, H);
}

function fountain(S, x, z, r) {
  S.lit.cyl(x, 0, z, r, 0.9, 0xd8d2c4, { seg: 24 }); S.basic.cyl(x, 0.95, z, r - 0.7, 0.02, 0x4fb6ea, { seg: 24 });
  S.lit.cyl(x, 0.9, z, 1.6, 1.8, 0xd8d2c4, { seg: 12, r1: 1.0 }); S.lit.cyl(x, 2.7, z, 3.4, 0.5, 0xd8d2c4, { seg: 16, r1: 3.0 });
  S.basic.cyl(x, 3.2, z, 0.2, 5.0, 0xcfefff, { seg: 6, r1: 0.05 });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; S.basic.cyl(x + Math.cos(a) * 5.5, 0.95, z + Math.sin(a) * 5.5, 0.12, 2.6, 0xcfefff, { seg: 5, r1: 0.04 }); }
  S.cols(x, z, r, -1, 2);
}
function palm(S, x, z, h = 7) {
  S.lit.cyl(x, 0, z, 0.34, h, 0x8a6a46, { seg: 6, r1: 0.22 });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; S.lit.cyl(x + Math.cos(a) * 1.2, h - 0.3, z + Math.sin(a) * 1.2, 1.5, 0.3, 0x3e9b4a, { seg: 5, r1: 0.1 }); }
  S.lit.cyl(x, h - 0.2, z, 1.3, 1.0, 0x4aad55, { seg: 8, r1: 0.2 });
}
function garden(S, x, z) {
  S.lit.cyl(x, 0, z, 11, 0.5, 0xb59c78, { seg: 20 }); S.lit.cyl(x, 0.5, z, 10.2, 0.1, 0x5fae50, { seg: 20 });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + 0.3; palm(S, x + Math.cos(a) * 6.2, z + Math.sin(a) * 6.2, 6 + (k % 3)); }
  palm(S, x, z, 9);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.8; S.lit.box(x + Math.cos(a) * 9.6, 0.5, z + Math.sin(a) * 9.6, 3, 0.5, 0.9, 0x8a6a46, { ry: -a + Math.PI / 2 }); }
}
function escalator(S, xa, za, xb, zb, h, steps) {
  const dx = xb - xa, dz = zb - za, len = Math.hypot(dx, dz), px = -dz / len * 1.7, pz = dx / len * 1.7;
  const A = [xa - px, 0.1, za - pz], B = [xa + px, 0.1, za + pz], C = [xb + px, h, zb + pz], D = [xb - px, h, zb - pz];
  S.basic.quad(A, B, C, D, 0xffffff, [[...steps.uv.slice(0, 2)], [steps.uv[2], steps.uv[1]], [steps.uv[2], steps.uv[3]], [steps.uv[0], steps.uv[3]]], [0, 1, 0]);
  for (const sg of [-1, 1]) {
    const ox = px * sg * 1.05, oz = pz * sg * 1.05;
    S.glass.quad([xa + ox, 0.1, za + oz], [xb + ox, h, zb + oz], [xb + ox, h + 1.1, zb + oz], [xa + ox, 1.2, za + oz], 0xcfe8f6, null);
    S.lit.quad([xa + ox, 1.2, za + oz], [xb + ox, h + 1.1, zb + oz], [xb + ox, h + 1.25, zb + oz], [xa + ox, 1.35, za + oz], 0x333840, null);
  }
}
function gantry(S, x, text, col, beamY) {
  const sp = S.track.sample(x - 190), lat = S.wallDist + 1.1, y = sp.pos.y;
  const top = y + 10.8; void beamY;
  for (const sg of [-1, 1]) S.lit.box(sp.pos.x, top / 2 + 0.2, sp.pos.z + sg * lat, 0.9, top + 0.4, 0.9, 0x39404d);
  S.lit.box(sp.pos.x, top + 0.4, sp.pos.z, 0.9, 0.9, 2 * lat + 0.9, 0x39404d);
  const t = S.board(text, 1000, 125, col, "#ffffff", { border: "#ffffff" });
  for (const nx of [-1, 1]) S.wallQuad(S.sign, sp.pos.x + nx * 0.5, sp.pos.z, nx, 0, 2 * lat - 1, top - 2.6, top + 0.2 + 0.0, 0xffffff, rectUV(t.uv), 0);
}
function lift(S, x, z, H) {
  S.glass.cyl(x, 0, z, 2.2, H - 4, 0xbfe0f4, { seg: 14, caps: false });
  S.lit.cyl(x, 0, z, 2.5, 0.4, 0x333840, { seg: 14 }); S.lit.cyl(x, H - 4, z, 2.5, 0.5, 0x333840, { seg: 14 });
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.78; S.lit.box(x + Math.cos(a) * 2.2, (H - 4) / 2, z + Math.sin(a) * 2.2, 0.25, H - 4, 0.25, 0x333840); }
  S.cols(x, z, 2.6, -1, 30);
  const car = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.4), S.own(new THREE.MeshLambertMaterial({ color: 0xf2c200, emissive: 0x443300 }))); S.own(car.geometry);
  car.position.set(x, 1.3, z); S.group.add(car);
  S.anim.push((dt, t) => { car.position.y = 1.4 + (0.5 + 0.5 * Math.sin(t * 0.5 + x)) * (H - 8); });
}
void shade; void FONT_N; void fitText;
