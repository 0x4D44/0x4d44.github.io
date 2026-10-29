// Mall Mayhem - FRESH MART: in the automatic doors, slalom the aisles, out through the stockroom roller shutter.
import * as THREE from "three";
import { SUPER } from "./mall-layout.js";
import { rectUV, shade, TAU, FONT } from "./mall-kit.js";
import { buildShell, roadOverlay, floorPainter, tiledTex, shopRun, WT } from "./mall-common.js";

export function buildSuper(S) {
  const R = SUPER, H = R.h, { track, X, rng, wallDist, nearest } = S;
  const ix0 = R.x0 + WT, ix1 = R.x1 - WT, iz0 = R.z0 + WT, iz1 = R.z1 - WT, rz = R.roadZ;
  const open = [{ c: rz, hw: 14.5, h: 6.6 }];
  const inner = buildShell(S, R, { e: open, w: open }, { fac: 1, tint: 0xf4e9dd, innerCol: 0xeef2f3, ceilCol: 0xf4f6f6, roofCol: 0x8d9096 });
  S.superInner = inner;

  // ---- inner wall dressing: fridge wall on the north, back-of-house on the south, plain brand band elsewhere
  const fridge = S.atlas.paint(256, 128, (g, w, h) => { g.fillStyle = "#d9eef7"; g.fillRect(0, 0, w, h); for (let r = 0; r < 4; r++) for (let c = 0; c < 16; c++) { g.fillStyle = ["#e8453c", "#ffd34d", "#4de0ff", "#ffffff", "#7ac143", "#ff7aa8"][(r * 5 + c * 3) % 6]; g.fillRect(c * 16 + 2, r * 30 + 6, 12, 22); } g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(0, 0, w, 6); g.fillStyle = "#334"; for (let r = 0; r <= 4; r++) g.fillRect(0, r * 30 + 2, w, 3); });
  const brand = S.board("FRESH MART  *  FRESH MART  *  FRESH MART  *", 512, 48, "#1f8a4c", "#ffffff", { font: FONT });
  const wallTex = S.atlas.paint(128, 128, (g, w, h) => { g.fillStyle = "#e9efe9"; g.fillRect(0, 0, w, h); g.fillStyle = "#1f8a4c"; g.fillRect(0, 96, w, 32); g.fillStyle = "rgba(0,0,0,0.08)"; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, 96); });
  for (const seg of inner) {
    const len = seg.b - seg.a; if (len < 3) continue;
    const n = Math.max(1, Math.round(len / 8)), w = len / n, al = seg.side === "w" || seg.side === "e";
    for (let k = 0; k < n; k++) {
      const mid = seg.a + (k + 0.5) * w, cx = al ? seg.ix : mid, cz = al ? mid : seg.iz;
      const y0 = seg.y0, y1 = Math.min(seg.y1, H - 0.2);
      if (seg.side === "n" && y0 === 0) S.wallQuad(S.sign, cx, cz, seg.nx, seg.nz, w - 0.05, 0, 3.6, 0xffffff, rectUV(fridge.uv), 0.04);
      else S.wallQuad(S.sign, cx, cz, seg.nx, seg.nz, w - 0.05, y0, y1, 0xffffff, rectUV(wallTex.uv), 0.04);
      if (y0 === 0) S.wallQuad(S.sign, cx, cz, seg.nx, seg.nz, w - 0.1, 7.2, 8.4, 0xffffff, rectUV(brand.uv), 0.06);
    }
  }

  // ---- floors
  const gtex = tiledTex(S, 128, 128, (g) => { g.fillStyle = "#cfd8dc"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#c3ccd1"; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); g.fillStyle = "rgba(0,0,0,0.1)"; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 128); });
  { const fm = new (S.fac[0].constructor)(); const T = 8; fm.quad([ix0, 0.0, iz1], [ix1, 0.0, iz1], [ix1, 0.0, iz0], [ix0, 0.0, iz0], 0xffffff, [[ix0 / T, iz1 / T], [ix1 / T, iz1 / T], [ix1 / T, iz0 / T], [ix0 / T, iz0 / T]], [0, 1, 0]);
    S.floors.push(fm.mesh(S.own(new THREE.MeshBasicMaterial({ map: gtex, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })), "super-floor")); }
  const rtex = tiledTex(S, 256, 256, floorPainter(S, "#e3e9ec", "#d6dde1", "#ffd34d", { cells: 8, shoulder: "#a9b6bd" }));
  roadOverlay(S, rtex, (i) => { const x = X.C.px[i], z = X.C.pz[i]; return x > R.x0 - 6 && x < R.x1 + 6 && Math.abs(z - rz) < 40; }, 16, "super-road");
  // yellow/black hazard threshold at both doors
  hazard(S, R.x1 - 3.5, rz, 3, 2 * wallDist); hazard(S, R.x0 + 3.5, rz, 3, 2 * wallDist);

  // ---- ceiling: light panels, trunking, ducts
  for (let z = iz0 + 7; z < iz1 - 3; z += 12) for (let x = ix0 + 6; x < ix1 - 8; x += 10) S.flat(S.basic, x, z - 1.2, x + 7, z + 1.2, H - 0.2, 0xffffff, -1);
  for (let z = iz0 + 13; z < iz1; z += 24) S.basic.box((ix0 + ix1) / 2, H - 0.9, z, ix1 - ix0, 0.6, 0.6, 0xaab3ba);
  for (let x = ix0 + 12; x < ix1; x += 22) S.basic.box(x, H - 0.7, (iz0 + iz1) / 2, 0.7, 0.5, iz1 - iz0, 0xc4ccd2);
  for (let x = ix0 + 8; x < ix1 - 4; x += 28) for (const z of [rz - 30, rz + 30]) { S.lit.box(x, H / 2, z, 1.2, H, 1.2, 0xe9eef0); S.lit.box(x, 3.0, z, 1.3, 0.5, 1.3, 0x1f8a4c); S.cols(x, z, 0.9, -1, H); }

  // ---- gondola shelving rows (outside the road wall; the road itself stays clear)
  const prods = [0, 1, 2, 3].map((k) => S.atlas.paint(192, 64, (g, w, h) => {
    g.fillStyle = "#d8dde0"; g.fillRect(0, 0, w, h);
    const pal = [["#e8453c", "#ffd34d", "#fff"], ["#2b7bd6", "#4de0ff", "#fff"], ["#1f8a4c", "#ffd34d", "#f2f2f2"], ["#7b4bff", "#ff7aa8", "#ffe14d"]][k];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) { g.fillStyle = pal[(r + c * 2) % 3]; g.fillRect(c * 16 + 2, r * 21 + 3, 12, 16); g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(c * 16 + 2, r * 21 + 17, 12, 2); }
    g.fillStyle = "#555e66"; for (let r = 0; r <= 3; r++) g.fillRect(0, r * 21 + 1, w, 2);
  }));
  const aisleNames = ["BREAD & CAKES", "CEREAL & JAM", "CRISPS & SNACKS", "TINS & SAUCES", "PASTA & RICE", "TEA & COFFEE", "FIZZY DRINKS", "BISCUITS", "PET FOOD", "BABY & TOYS", "HOUSEHOLD", "BATHROOM"];
  let aisleN = 0;
  const modL = 3.0;
  for (let zr = iz0 + 12; zr < iz1 - 6; zr += 8.5) {
    // keep a clear row where the checkouts live
    for (let x = ix0 + 12; x + modL < ix1 - 8; x += modL) {
      const cx = x + modL / 2;
      const inCheckout = cx > 438 && cx < 522 && zr > rz + 22;
      const inProduce = cx > 505 && zr < rz + 22 && zr > rz - 30;
      const inStock = cx < 404;
      if (inCheckout || inProduce || inStock) continue;
      const zs = [zr - 0.9, zr + 0.9]; let ok = true;
      for (const z of zs) if (nearest(cx, z) < wallDist + 2.4 || nearest(x, z) < wallDist + 2.4 || nearest(x + modL, z) < wallDist + 2.4) ok = false;
      if (!ok) continue;
      const k = Math.floor(rng() * 4), uvr = rectUV(prods[k].uv);
      S.lit.box(cx, 0.5, zr, modL - 0.1, 1.0, 1.7, 0x4a5058); S.lit.box(cx, 2.15, zr, modL - 0.1, 2.4, 0.3, 0x8a929a);
      for (const sg of [-1, 1]) { S.wallQuad(S.sign, cx, zr + sg * 0.88, 0, sg, modL - 0.15, 1.0, 3.35, 0xffffff, uvr, 0); }
      S.lit.box(cx, 3.5, zr, modL - 0.3, 0.9, 1.5, shade(0xb98a55, 0.8 + rng() * 0.3));   // cartons on top
    }
    // aisle sign at the end of each row
    if (zr > rz + 14 || zr < rz - 14) {
      const name = aisleNames[aisleN++ % aisleNames.length], t = S.board("AISLE " + (aisleN) + "\n" + name, 192, 80, "#1f8a4c", "#ffffff", { border: "#ffffff" });
      for (const x of [ix0 + 16, 440, 480]) {
        if (nearest(x, zr) < wallDist + 3) continue;
        for (const nx of [-1, 1]) S.wallQuad(S.sign, x + nx * 0.06, zr, nx, 0, 3.2, 5.4, 6.8, 0xffffff, rectUV(t.uv), 0);
        S.basic.box(x, 8.2, zr - 1.4, 0.08, 4.2, 0.08, 0x666666); S.basic.box(x, 8.2, zr + 1.4, 0.08, 4.2, 0.08, 0x666666);
      }
    }
  }
  // ---- produce tables (colourful crates) east end
  const crate = S.atlas.paint(64, 32, (g) => { g.fillStyle = "#8a6a46"; g.fillRect(0, 0, 64, 32); const c = ["#e8453c", "#ffd34d", "#7ac143", "#ff8a1f", "#a050d0", "#c0392b"]; for (let k = 0; k < 8; k++) { g.fillStyle = c[k % 6]; g.beginPath(); g.arc(4 + k * 8, 12 + (k % 2) * 4, 4, 0, TAU); g.fill(); } });
  for (let x = 508; x < ix1 - 4; x += 7) for (const zz of [rz - 24, rz - 15, rz + 15, rz + 24]) {
    if (nearest(x, zz) < wallDist + 2) continue;
    S.lit.box(x, 0.45, zz, 5.6, 0.9, 1.9, 0x6b5238); S.wallQuad(S.sign, x, zz - 0.97, 0, -1, 5.4, 0.9, 1.3, 0xffffff, rectUV(crate.uv), 0);
    S.lit.box(x, 1.0, zz, 5.4, 0.25, 1.7, 0x6bbf4a);
    const t = S.board("FRUIT & VEG", 192, 64, "#7ac143", "#fff", { border: "#fff" });
    if (Math.abs(zz - rz) > 20) for (const nx of [-1, 1]) S.wallQuad(S.sign, x + nx * 0.06, zz, nx, 0, 3, 5.0, 6.1, 0xffffff, rectUV(t.uv), 0);
  }
  // ---- freezer cabinets (glowing signs) along the north wall
  const frozen = S.atlas.paint(256, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "#00c8ff"); gr.addColorStop(1, "#7be6ff"); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.strokeStyle = "#006a99"; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); g.font = "900 38px Arial Black, Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("FROZEN FOODS", w / 2, h / 2 + 2); });
  const dairy = S.board("DAIRY & CHILLED", 256, 64, "#ffffff", "#1f6ad6", { border: "#4de0ff" });
  for (let x = 410; x < 528; x += 8) {
    const zc = iz0 + 3.4;
    S.lit.box(x + 4, 0.6, zc + 1.2, 7.6, 1.2, 1.4, 0xf2f6f8); S.glass.box(x + 4, 1.3, zc + 1.2, 7.4, 0.2, 1.3, 0xbfe8ff); S.basic.box(x + 4, 1.05, zc + 1.2, 7.2, 0.15, 1.1, 0xdff6ff);
    S.wallQuad(S.sign, x + 4, iz0 + 0.3, 0, 1, 6.5, 4.0, 5.2, 0xffffff, rectUV(((x / 8) | 0) % 2 ? frozen.uv : dairy.uv), 0.02);
  }
  // ---- checkouts
  const tills = [];
  for (let k = 0; k < 8; k++) tills.push(S.board("CHECKOUT " + (k + 1), 128, 40, k % 2 ? "#f2c200" : "#ffd34d", "#222", { border: "#222" }));
  for (let k = 0; k < 8; k++) {
    const x = 442 + k * 10, z = iz1 - 5;
    if (nearest(x, z) < wallDist + 3) continue;
    S.lit.box(x, 0.45, z, 1.1, 0.9, 5, 0x39414a); S.lit.box(x, 0.95, z, 1.0, 0.1, 4.6, 0x111418); S.lit.box(x + 1.0, 0.55, z + 1.2, 0.8, 1.1, 0.9, 0xd9dde0); S.basic.box(x + 1.0, 1.3, z + 1.2, 0.5, 0.35, 0.05, 0x7be6ff);
    S.basic.box(x, 4.4, z, 0.08, 4.0, 0.08, 0x666666);
    for (const nx of [-1, 1]) S.wallQuad(S.sign, x + nx * 0.05, z, nx, 0, 2.6, 5.0, 5.9, 0xffffff, rectUV(tills[k].uv), 0);
  }
  // ---- stockroom: pallets, roll cages, forklift
  const pal = (x, z, n) => { S.lit.box(x, 0.12, z, 1.2, 0.24, 1.0, 0xa8814f); for (let k = 0; k < n; k++) S.lit.box(x, 0.24 + 0.55 + k * 1.1, z, 1.1, 1.0, 0.9, shade(0xb98a55, 0.85 + 0.3 * rng())); };
  for (let x = ix0 + 6; x < 404; x += 5) for (const zz of [iz0 + 4, iz0 + 6.2, iz1 - 4, iz1 - 6.2, rz - 30, rz + 30]) { if (nearest(x, zz) < wallDist + 2) continue; if (rng() < 0.75) pal(x + rng() * 1.5, zz, 1 + Math.floor(rng() * 3)); }
  for (let k = 0; k < 6; k++) { const x = ix0 + 8 + k * 6, z = rz + (k % 2 ? 22 : -22); if (nearest(x, z) < wallDist + 2) continue; S.glass.box(x, 1.0, z, 1.3, 1.8, 0.9, 0xcfd8e0); S.lit.box(x, 0.2, z, 1.4, 0.2, 1.0, 0x4a5058); for (const [dx, dz] of [[-0.62, -0.42], [0.62, -0.42], [-0.62, 0.42], [0.62, 0.42]]) S.lit.box(x + dx, 1.0, z + dz, 0.06, 1.9, 0.06, 0x8a929a); S.lit.box(x, 0.8, z, 1.1, 0.9, 0.7, 0xf0d9a0); }
  { const fx = 392, fz = rz - 26; S.lit.box(fx, 0.9, fz, 1.3, 1.0, 2.4, 0xf2c200); S.lit.box(fx, 1.7, fz + 0.4, 1.2, 0.2, 1.1, 0x333); S.lit.box(fx - 0.5, 1.2, fz - 1.4, 0.1, 2.8, 0.1, 0x555); S.lit.box(fx + 0.5, 1.2, fz - 1.4, 0.1, 2.8, 0.1, 0x555); S.lit.box(fx, 0.2, fz - 1.8, 1.0, 0.1, 1.2, 0x555); S.cols(fx, fz, 1.5, -1, 3); }
  // shutter drum + hazard frame + signs
  S.lit.box(R.x0 + 1.2, 7.1, rz, 0.9, 0.9, 29, 0x707880);
  const slats = S.atlas.paint(64, 32, (g) => { g.fillStyle = "#8d949b"; g.fillRect(0, 0, 64, 32); g.fillStyle = "#6a7178"; for (let y = 0; y < 32; y += 4) g.fillRect(0, y, 64, 1.5); });
  S.wallQuad(S.sign, R.x0 + 0.5, rz, 1, 0, 29, 6.62, 7.55, 0xffffff, rectUV(slats.uv), 0.1);
  const staff = S.board("STOCKROOM\nSTAFF ONLY  -  KARTS WELCOME", 512, 128, "#f2c200", "#111", { border: "#111" });
  S.wallQuad(S.sign, ix0 + 0.1, rz, 1, 0, 14, 8.0, 9.6, 0xffffff, rectUV(staff.uv), 0.03);
  S.wallQuad(S.sign, R.x0 - 0.1, rz, -1, 0, 24, 7.6, 9.8, 0xffffff, rectUV(S.board("FRESH MART  GOODS IN", 512, 96, "#1f8a4c", "#fff", { border: "#fff" }).uv), 0.1);
  // entrance: canopy, big sign, posts, glass leaves, trolley bay signs
  S.lit.boxB(R.x1, 6.7, rz - 17, R.x1 + 6, 7.2, rz + 17, 0x1f8a4c); S.lit.boxB(R.x1 + 5.6, 4.2, rz - 17, R.x1 + 6, 7.2, rz + 17, 0x1f8a4c);
  for (const sg of [-1, 1]) { S.lit.box(R.x1 + 5.2, 3.4, rz + sg * 16.2, 0.7, 6.8, 0.7, 0xe9eef0); S.cols(R.x1 + 5.2, rz + sg * 16.2, 0.6, -1, 8); }
  S.wallQuad(S.sign, R.x1 + 6.05, rz, 1, 0, 30, 4.4, 7.0, 0xffffff, rectUV(S.board("FRESH MART", 1000, 250, "#1f8a4c", "#ffffff", { border: "#ffd34d", stripe: "#ffd34d" }).uv), 0);
  S.wallQuad(S.sign, R.x1 + 6.05 - 5.8, rz, -1, 0, 30, 4.6, 7.0, 0xffffff, rectUV(S.board("WELCOME - AUTOMATIC DOORS", 768, 96, "#ffffff", "#1f8a4c", { border: "#1f8a4c" }).uv), 0);
  for (const sg of [-1, 1]) { S.glass.box(R.x1 - 0.3, 3.0, rz + sg * 13.2, 0.12, 6.0, 2.6, 0xaee0f2); S.lit.box(R.x1 - 0.3, 3.0, rz + sg * 14.55, 0.3, 6.6, 0.3, 0xf2c200); S.lit.box(R.x1 - 0.3, 3.0, rz + sg * 11.85, 0.2, 6.6, 0.2, 0xf2c200); }
  // rooftop sign
  { const t = S.board("FRESH MART", 1000, 250, "#1f8a4c", "#ffffff", { border: "#ffd34d" }); for (const nx of [-1, 1]) S.wallQuad(S.sign, R.x1 - 30, rz, nx, 0, 26, H + 1.5, H + 8.0, 0xffffff, rectUV(t.uv), nx * 0.1); S.lit.box(R.x1 - 30, H + 1, rz - 10, 0.6, 3, 0.6, 0x555a66); S.lit.box(R.x1 - 30, H + 1, rz + 10, 0.6, 3, 0.6, 0x555a66); }

  // ---- trolleys & display stacks in the shoulder (these ARE reachable, so they have colliders)
  const sOf = (x) => track.locate({ x, y: 0, z: rz }, undefined).s;
  const props = [[546, 1, "trolleys"], [538, -1, "baskets"], [526, -1, "trolleys"], [518, 1, "cans"], [450, -1, "wet"], [418, 1, "baskets"], [398, 1, "pallet"], [386, -1, "pallet"]];
  const cans = S.atlas.paint(64, 64, (g) => { for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = (r + c) % 2 ? "#e8453c" : "#ffffff"; g.fillRect(c * 16, r * 16, 16, 16); g.fillStyle = "#222"; g.fillRect(c * 16, r * 16 + 7, 16, 2); } });
  for (const [x, sg, kind] of props) {
    const s = sOf(x), sp = track.sample(s), lat = sg * (wallDist - 1.5), px = sp.pos.x + sp.right.x * lat, pz = sp.pos.z + sp.right.z * lat, ry = Math.atan2(sp.tangent.x, sp.tangent.z);
    if (kind === "trolleys") for (let k = 0; k < 3; k++) { const tx = px + sp.tangent.x * (k * 1.5 - 1.5), tz = pz + sp.tangent.z * (k * 1.5 - 1.5); trolley(S, tx, tz, ry); S.cols(tx, tz, 0.75, -1, 1.4); }
    else if (kind === "baskets") { for (let k = 0; k < 2; k++) { const tx = px + sp.tangent.x * (k * 1.2 - 0.6), tz = pz + sp.tangent.z * (k * 1.2 - 0.6); for (let h = 0; h < 4; h++) S.lit.box(tx, 0.2 + h * 0.2, tz, 0.5, 0.18, 0.4, h % 2 ? 0xe8453c : 0xd9262c, { ry }); S.cols(tx, tz, 0.5, -1, 1.2); } }
    else if (kind === "cans") { for (let h = 0; h < 4; h++) S.sign.box(px, 0.4 + h * 0.8, pz, 2.6 - h * 0.5, 0.8, 2.6 - h * 0.5, 0xffffff, { ry, rect: cans.uv, skip: ["bot"] }); S.cols(px, pz, 1.4, -1, 3.3); }
    else if (kind === "wet") { S.lit.box(px, 0.35, pz, 0.5, 0.7, 0.4, 0xf2c200, { ry }); S.cols(px, pz, 0.5, -1, 1); }
    else { pal(px, pz, 2); S.cols(px, pz, 1.0, -1, 2.5); }
  }
}

function trolley(S, x, z, ry) {
  S.lit.box(x, 0.75, z, 0.55, 0.45, 0.9, 0xd0d6da, { ry }); S.lit.box(x, 0.3, z, 0.5, 0.06, 0.8, 0x444a50, { ry }); S.lit.box(x, 1.15, z - Math.cos(ry) * 0.0, 0.5, 0.06, 0.1, 0xe8453c, { ry });
}
function hazard(S, x, z, w, span) {
  const t = S.hazardTex || (S.hazardTex = S.atlas.paint(64, 32, (g) => { g.fillStyle = "#f2c200"; g.fillRect(0, 0, 64, 32); g.fillStyle = "#111"; for (let k = -2; k < 8; k++) { g.beginPath(); g.moveTo(k * 12, 32); g.lineTo(k * 12 + 8, 32); g.lineTo(k * 12 + 24, 0); g.lineTo(k * 12 + 16, 0); g.fill(); } }));
  S.hazardM = S.hazardM || new (S.fac[0].constructor)();
  // lies on the floor over the road, so the road's own y must be ~0 (these doors are at ground level)
  S.hazardM.quad([x - w / 2, 0.075, z + span / 2], [x + w / 2, 0.075, z + span / 2], [x + w / 2, 0.075, z - span / 2], [x - w / 2, 0.075, z - span / 2], 0xffffff, rectUV(t.uv), [0, 1, 0]);
}
void shopRun;
