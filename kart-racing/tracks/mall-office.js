// Mall Mayhem - TV CENTRE: glass lobby, open-plan desks, the big round atrium (hairpin), a studio and out through the loading bay.
import * as THREE from "three";
import { OFFICE, HAIRPIN, OFFICE_ENTRY_Z, OFFICE_EXIT_Z } from "./mall-layout.js";
import { rectUV, shade, TAU, FONT } from "./mall-kit.js";
import { buildShell, roadOverlay, floorPainter, tiledTex, WT } from "./mall-common.js";

export function buildOffice(S) {
  const R = OFFICE, H = R.h, { track, X, rng, wallDist, nearest } = S;
  const ix0 = R.x0 + WT, ix1 = R.x1 - WT, iz0 = R.z0 + WT, iz1 = R.z1 - WT, hp = HAIRPIN, AR = 21.5;
  const inner = buildShell(S, R, { e: [{ c: OFFICE_ENTRY_Z, hw: 14.5, h: 7.2 }, { c: OFFICE_EXIT_Z, hw: 14.5, h: 6.4 }] }, { fac: 0, tint: 0xd7e6f2, innerCol: 0xeeeff2, capCol: 0xaab4c0, roofCol: 0x7d8590, noCeiling: true });
  S.officeInner = inner;
  // ---- ceiling with a round hole over the atrium
  {
    const cy = H - 0.15, c = 0xf3f4f6, hx0 = hp.cx - AR - 1, hx1 = hp.cx + AR + 1, hz0 = hp.cz - AR - 1, hz1 = hp.cz + AR + 1;
    S.flat(S.basic, ix0, iz0, ix1, hz0, cy, c, -1); S.flat(S.basic, ix0, hz1, ix1, iz1, cy, c, -1);
    S.flat(S.basic, ix0, hz0, hx0, hz1, cy, c, -1); S.flat(S.basic, hx1, hz0, ix1, hz1, cy, c, -1);
    const N = 24, ar = AR + 1;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * TAU, a1 = ((k + 1) / N) * TAU, am = (a0 + a1) / 2;
      const P0 = [hp.cx + Math.cos(a0) * ar, cy, hp.cz + Math.sin(a0) * ar], P1 = [hp.cx + Math.cos(a1) * ar, cy, hp.cz + Math.sin(a1) * ar];
      const cx = Math.cos(am) >= 0 ? hx1 : hx0, cz = Math.sin(am) >= 0 ? hz1 : hz0;
      S.basic.quad([cx, cy, cz], P0, P1, P1, c, null, [0, -1, 0]);
    }
  }
  // roof: the hole is covered by the dome, the roof slab leaves it open from above
  {
    const dome = new THREE.SphereGeometry(AR + 1.2, 28, 8, 0, TAU, 0, Math.PI / 2);
    S.glass.geo(dome, new THREE.Matrix4().compose(new THREE.Vector3(hp.cx, H - 0.1, hp.cz), new THREE.Quaternion(), new THREE.Vector3(1, 0.45, 1)), 0xcfe8ff);
    S.basic.geo(new THREE.CylinderGeometry(AR + 1.2, AR + 1.2, 0.1, 28, 1, true), new THREE.Matrix4().makeTranslation(hp.cx, H, hp.cz), 0xffffff);
    // ribs
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; for (let q = 0; q < 6; q++) { const r0 = (AR + 1.2) * Math.cos((q / 6) * 1.35), r1 = (AR + 1.2) * Math.cos(((q + 1) / 6) * 1.35), y0 = H - 0.1 + Math.sin((q / 6) * 1.35) * (AR + 1.2) * 0.45, y1 = H - 0.1 + Math.sin(((q + 1) / 6) * 1.35) * (AR + 1.2) * 0.45; S.basic.quad([hp.cx + Math.cos(a) * r0, y0, hp.cz + Math.sin(a) * r0], [hp.cx + Math.cos(a) * r1, y1, hp.cz + Math.sin(a) * r1], [hp.cx + Math.cos(a) * r1, y1 + 0.2, hp.cz + Math.sin(a) * r1], [hp.cx + Math.cos(a) * r0, y0 + 0.2, hp.cz + Math.sin(a) * r0], 0xe8ecf0, null); } }
  }
  // ---- wall dressing
  const panel = S.atlas.paint(256, 128, (g, w, h) => {
    g.fillStyle = "#e9ebef"; g.fillRect(0, 0, w, h); g.fillStyle = "#3b4a63"; g.fillRect(0, 100, w, 28);
    for (let k = 0; k < 2; k++) { const gr = g.createLinearGradient(0, 0, 0, 90); gr.addColorStop(0, "#9ccaf0"); gr.addColorStop(1, "#dff0fb"); g.fillStyle = gr; g.fillRect(10 + k * 126, 10, 110, 82); g.fillStyle = "#e9ebef"; g.fillRect(64 + k * 126, 10, 4, 82); }
    g.fillStyle = "rgba(0,0,0,0.1)"; g.fillRect(0, 96, w, 4);
  });
  const logo = S.board("TV CENTRE", 512, 96, "#16213e", "#ffd34d", { border: "#ffd34d" });
  for (const seg of inner) {
    const len = seg.b - seg.a; if (len < 3) continue;
    const n = Math.max(1, Math.round(len / 8)), w = len / n, al = seg.side === "w" || seg.side === "e";
    for (let k = 0; k < n; k++) {
      const mid = seg.a + (k + 0.5) * w, cx = al ? seg.ix : mid, cz = al ? mid : seg.iz;
      S.wallQuad(S.sign, cx, cz, seg.nx, seg.nz, w - 0.05, seg.y0, Math.min(seg.y1, H - 0.2), 0xffffff, rectUV(panel.uv), 0.04);
      if (seg.y0 === 0 && k % 3 === 1) S.wallQuad(S.sign, cx, cz, seg.nx, seg.nz, 6, 7.4, 8.9, 0xffffff, rectUV(logo.uv), 0.07);
    }
  }
  // ---- floors
  const gtex = tiledTex(S, 128, 128, (g) => { g.fillStyle = "#d9dcdf"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#cfd3d7"; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); g.fillStyle = "rgba(0,0,0,0.1)"; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 128); });
  { const fm = new (S.fac[0].constructor)(); const T = 8; fm.quad([ix0, 0.0, iz1], [ix1, 0.0, iz1], [ix1, 0.0, iz0], [ix0, 0.0, iz0], 0xffffff, [[ix0 / T, iz1 / T], [ix1 / T, iz1 / T], [ix1 / T, iz0 / T], [ix0 / T, iz0 / T]], [0, 1, 0]);
    S.floors.push(fm.mesh(S.own(new THREE.MeshBasicMaterial({ map: gtex, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })), "office-floor")); }
  const rtex = tiledTex(S, 256, 256, floorPainter(S, "#6e86a3", "#65799a", "#ffffff", { cells: 8, shoulder: "#4a5c73" }));
  roadOverlay(S, rtex, (i) => { const x = X.C.px[i], z = X.C.pz[i]; return x > R.x0 - 4 && x < R.x1 + 4 && z > R.z0 - 4 && z < R.z1 + 4; }, 16, "office-road");
  hazardBay(S, R.x1 - 3.5, OFFICE_EXIT_Z, 2 * wallDist);

  // ---- ceiling lights
  for (let z = iz0 + 6; z < iz1 - 2; z += 10) for (let x = ix0 + 6; x < ix1 - 6; x += 12) { if (Math.hypot(x + 3 - hp.cx, z - hp.cz) < AR + 4) continue; S.flat(S.basic, x, z - 1, x + 6, z + 1, H - 0.2, 0xffffff, -1); }
  for (let x = ix0 + 10; x < ix1; x += 24) if (Math.abs(x - hp.cx) > AR + 3) S.basic.box(x, H - 0.7, (iz0 + iz1) / 2, 0.6, 0.5, iz1 - iz0, 0xd4d8dc);

  // ---- ATRIUM: floor medallion, column ring, tree, fountain, ring bench
  const med = S.atlas.paint(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const rings = [["#2b4a7a", 128], ["#e8e2d2", 118], ["#c9a24a", 104], ["#e8e2d2", 98], ["#2b4a7a", 80], ["#e8e2d2", 70], ["#4d8a5a", 46]];
    rings.forEach(([c, r]) => { g.fillStyle = c; g.beginPath(); g.arc(128, 128, r, 0, TAU); g.fill(); });
    g.strokeStyle = "#ffffff"; g.lineWidth = 2; for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; g.beginPath(); g.moveTo(128 + Math.cos(a) * 46, 128 + Math.sin(a) * 46); g.lineTo(128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80); g.stroke(); }
  });
  { const r = AR + 1.0; S.sign.quad([hp.cx - r, 0.06, hp.cz + r], [hp.cx + r, 0.06, hp.cz + r], [hp.cx + r, 0.06, hp.cz - r], [hp.cx - r, 0.06, hp.cz - r], 0xffffff, rectUV(med.uv), [0, 1, 0]); }
  for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, x = hp.cx + Math.cos(a) * AR, z = hp.cz + Math.sin(a) * AR; S.lit.cyl(x, 0, z, 0.55, H - 0.2, 0xf4f4f6, { seg: 8 }); S.basic.cyl(x, 4.2, z, 0.62, 0.4, 0xffd34d, { seg: 8 }); S.cols(x, z, 0.7, -1, H); }
  // mezzanine gallery ring inside the columns
  for (let k = 0; k < 32; k++) { const a0 = (k / 32) * TAU, a1 = ((k + 1) / 32) * TAU, r0 = AR - 3.6, r1 = AR - 0.2; const P = (a, r, y) => [hp.cx + Math.cos(a) * r, y, hp.cz + Math.sin(a) * r];
    S.basic.quad(P(a0, r0, 6.2), P(a1, r0, 6.2), P(a1, r1, 6.2), P(a0, r1, 6.2), 0xd8dce2, null, [0, -1, 0]); S.basic.quad(P(a0, r0, 6.7), P(a0, r1, 6.7), P(a1, r1, 6.7), P(a1, r0, 6.7), 0xf0f2f5, null, [0, 1, 0]);
    S.glass.quad(P(a0, r0, 6.7), P(a1, r0, 6.7), P(a1, r0, 7.9), P(a0, r0, 7.9), 0xcfe8f6, null); }
  S.lit.cyl(hp.cx, 0, hp.cz, 0.7, 6.0, 0x7a5a3a, { seg: 8, r1: 0.45 });
  for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; S.lit.cyl(hp.cx + Math.cos(a) * 1.8, 5.2 + (k % 2) * 0.8, hp.cz + Math.sin(a) * 1.8, 2.8, 2.2, k % 2 ? 0x3e9b4a : 0x4aad55, { seg: 8, r1: 0.4 }); }
  S.lit.cyl(hp.cx, 5.8, hp.cz, 3.6, 2.8, 0x3e9b4a, { seg: 10, r1: 0.5 });
  S.lit.cyl(hp.cx, 0, hp.cz, 5.2, 0.6, 0xe6e0d0, { seg: 20 }); S.lit.cyl(hp.cx, 0.55, hp.cz, 4.0, 0.2, 0x6a4a2a, { seg: 20 });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2; S.lit.box(hp.cx + Math.cos(a) * 8.5, 0.35, hp.cz + Math.sin(a) * 8.5, 3.4, 0.6, 1.0, 0x9a7a52, { ry: -a + Math.PI / 2 }); }
  const sat = S.board("ATRIUM\nTV CENTRE", 256, 128, "#16213e", "#ffd34d", { border: "#ffd34d" });
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4, x = hp.cx + Math.cos(a) * (AR - 0.5), z = hp.cz + Math.sin(a) * (AR - 0.5); S.wallQuad(S.sign, x, z, -Math.cos(a), -Math.sin(a), 6, 8.6, 11.6, 0xffffff, rectUV(sat.uv), 0.05); }
  S.cols(hp.cx, hp.cz, 2, -1, 12);   // (the trunk sits far from the road; harmless)

  // ---- reception (median near the glass doors)
  const rx = 10, rzc = (OFFICE_ENTRY_Z + OFFICE_EXIT_Z) / 2;
  S.lit.box(rx - 7, 2.5, rzc, 0.6, 5, 24, 0x16213e); S.wallQuad(S.sign, rx - 7 + 0.35, rzc, 1, 0, 14, 1.6, 4.6, 0xffffff, rectUV(S.board("TV CENTRE\nRECEPTION", 512, 256, "#16213e", "#ffd34d", { border: "#ffd34d" }).uv), 0);
  S.wallQuad(S.sign, rx - 7 - 0.35, rzc, -1, 0, 14, 1.6, 4.6, 0xffffff, rectUV(S.board("TV CENTRE\nRECEPTION", 512, 256, "#16213e", "#ffd34d", { border: "#ffd34d" }).uv), 0);
  S.lit.box(rx - 3, 0.6, rzc, 1.4, 1.2, 14, 0xf2f2f4); S.lit.box(rx - 3, 1.25, rzc, 1.6, 0.12, 14.2, 0x2b4a7a); S.basic.box(rx - 3.5, 1.7, rzc - 3, 0.5, 0.45, 0.05, 0x7be6ff); S.basic.box(rx - 3.5, 1.7, rzc + 3, 0.5, 0.45, 0.05, 0x7be6ff);
  for (let k = 0; k < 4; k++) { const z = rzc - 9 + k * 6; S.lit.box(rx + 12, 0.3, z, 2.0, 0.6, 1.1, 0x2b4a7a); S.lit.box(rx + 12.7, 0.75, z, 0.6, 0.6, 1.1, 0x2b4a7a); }
  for (const z of [rzc - 18, rzc + 18]) { S.lit.cyl(rx + 2, 0, z, 0.7, 0.8, 0xb8b0a0, { seg: 8 }); S.lit.cyl(rx + 2, 0.8, z, 0.8, 1.6, 0x3e9b4a, { seg: 8, r1: 0.2 }); }

  // ---- open-plan desks (median between the legs, west of reception)
  const mon = 0x7be6ff;
  for (let row = 0; row < 4; row++) {
    const z = 68 + row * 9.5 - (row > 1 ? 0 : 0);
    for (let k = 0; k < 8; k++) {
      const x = -6 - k * 8.5 - 20; if (Math.hypot(x - hp.cx, z - hp.cz) < AR + 4) continue;
      if (x < ix0 + 22) continue;
      if (nearest(x, z) < wallDist + 2.5) continue;
      for (const sg of [-1, 1]) {
        S.lit.box(x, 0.72, z + sg * 1.0, 3.2, 0.1, 1.5, 0xe9dcc4); S.lit.box(x, 0.36, z + sg * 1.0, 3.0, 0.7, 0.1, 0x8a929a);
        S.basic.box(x - 0.6, 1.2, z + sg * 1.3, 0.8, 0.5, 0.06, mon, { ry: 0 }); S.lit.box(x + 0.6, 1.2, z + sg * 1.3, 0.8, 0.5, 0.06, 0x20242c);
        S.lit.box(x, 0.55, z + sg * 1.9, 0.7, 0.1, 0.7, k % 2 ? 0xe8453c : 0x2b7bd6); S.lit.box(x, 0.95, z + sg * 2.15, 0.7, 0.9, 0.1, k % 2 ? 0xe8453c : 0x2b7bd6);
      }
      S.lit.box(x, 1.0, z, 3.4, 1.0, 0.08, 0xcfd6dd);   // partition
    }
  }
  // water coolers + plants + bins in the median/bands
  for (const [x, z] of [[-20, 112], [-60, 112], [-20, 56], [-60, 56], [-110, 150], [-20, 150]]) { if (nearest(x, z) < wallDist + 1.5) continue; S.lit.box(x, 0.55, z, 0.5, 1.1, 0.5, 0xe9eef2); S.glass.box(x, 1.4, z, 0.4, 0.5, 0.4, 0x7bbcf0); }

  // ---- STUDIO (north band)
  const sz = iz0 + 12;
  S.lit.box(-60, 0.15, sz, 70, 0.3, 24, 0x1a2036);
  const screens = ["NEWS AT TEN", "WEATHER: SUNNY", "KART RACING LIVE"];
  screens.forEach((t, k) => { const b = S.board(t, 256, 96, ["#d9262c", "#2b7bd6", "#1fa86b"][k], "#ffffff", { border: "#ffffff" }); S.wallQuad(S.sign, -90 + k * 30, iz0 + 0.12, 0, 1, 22, 2.6, 8.4, 0xffffff, rectUV(b.uv), 0.0); });
  S.lit.box(-60, 0.55, sz + 3, 10, 1.1, 2.6, 0xf2f2f4); S.lit.box(-60, 1.15, sz + 3, 10.4, 0.1, 2.8, 0xd9262c);
  S.lit.box(-66, 0.4, sz + 8, 3.6, 0.8, 1.4, 0x8a4a2a); S.lit.box(-66, 0.95, sz + 8.5, 3.6, 0.9, 0.3, 0x8a4a2a);
  for (const x of [-80, -50, -30]) { S.lit.cyl(x, 0, sz + 12, 0.1, 1.4, 0x222222, { seg: 5 }); S.lit.box(x, 1.7, sz + 12, 0.7, 0.6, 0.9, 0x222831); S.basic.box(x, 1.75, sz + 11.5, 0.3, 0.3, 0.1, 0xff3b3b); }
  S.lit.box(-60, H - 4.5, sz + 2, 66, 0.35, 0.35, 0x20242c); S.lit.box(-60, H - 4.5, sz + 10, 66, 0.35, 0.35, 0x20242c);
  for (let k = 0; k < 11; k++) { const x = -90 + k * 6, c = [0xffe9a8, 0xffffff, 0x9ad7ff, 0xffb4d8][k % 4]; S.lit.box(x, H - 4.9, sz + (k % 2 ? 10 : 2), 0.8, 0.7, 0.8, 0x15181f); S.basic.cyl(x, H - 6.2, sz + (k % 2 ? 10 : 2), 0.55, 1.3, c, { seg: 6, r1: 0.1 }); }
  S.wallQuad(S.sign, ix1 - 0.1, OFFICE_EXIT_Z - 25, -1, 0, 8, 5.0, 6.4, 0xffffff, rectUV(S.board("ON AIR", 256, 64, "#d9262c", "#ffffff", { border: "#ffffff" }).uv), 0);
  // curtains
  S.lit.box(-60, 4.0, iz0 + 0.5, 70, 8, 0.4, 0x2a3250);
  // ---- canteen band (south)
  for (let k = 0; k < 6; k++) for (const dz of [0, 6]) { const x = -30 - k * 18, z = iz1 - 9 - dz; S.lit.cyl(x, 0, z, 0.9, 0.9, 0xf2e8d0, { seg: 10 }); for (const a of [0, 1.6, 3.1, 4.7]) S.lit.box(x + Math.cos(a) * 1.5, 0.4, z + Math.sin(a) * 1.5, 0.6, 0.8, 0.6, k % 2 ? 0xe8453c : 0xf2c200); }
  S.wallQuad(S.sign, ix0 + 0.1, 148, 1, 0, 12, 6.5, 9, 0xffffff, rectUV(S.board("CANTEEN  -  HOT LUNCH", 512, 128, "#f2c200", "#111", { border: "#111" }).uv), 0.05);

  // ---- doors, signs, loading bay (exterior)
  const en = S.board("TV CENTRE", 1000, 250, "#16213e", "#ffd34d", { border: "#ffd34d", stripe: "#d9262c" });
  S.wallQuad(S.sign, R.x1 + 0.1, OFFICE_ENTRY_Z, 1, 0, 26, 8.0, 14.0, 0xffffff, rectUV(en.uv), 0.0);
  S.wallQuad(S.sign, R.x1 + 0.1, OFFICE_EXIT_Z, 1, 0, 24, 7.2, 10.0, 0xffffff, rectUV(S.board("LOADING BAY  -  KARTS 5 MPH", 768, 125, "#f2c200", "#111", { border: "#111" }).uv), 0.0);
  S.wallQuad(S.sign, R.x1 - 2.4, OFFICE_ENTRY_Z, -1, 0, 24, 8.6, 12.4, 0xffffff, rectUV(S.board("WELCOME TO TV CENTRE\nPLEASE SIGN IN AT RECEPTION", 1000, 250, "#16213e", "#ffffff", { border: "#ffd34d" }).uv), 0.0);
  S.wallQuad(S.sign, R.x1 - 2.4, OFFICE_EXIT_Z, -1, 0, 20, 7.2, 10, 0xffffff, rectUV(S.board("GOODS OUT  >>>", 600, 150, "#f2c200", "#111", { border: "#111" }).uv), 0.0);
  // revolving-door drums beside the entry, glass canopy
  for (const sg of [-1, 1]) { S.glass.box(R.x1 - 0.4, 3.0, OFFICE_ENTRY_Z + sg * 13, 0.12, 6.0, 3.0, 0xaee0f2); S.lit.box(R.x1 - 0.4, 3.6, OFFICE_ENTRY_Z + sg * 14.7, 0.3, 7.2, 0.3, 0x39404d); S.lit.box(R.x1 - 0.4, 3.2, OFFICE_EXIT_Z + sg * 14.7, 0.3, 6.4, 0.3, 0xf2c200); }
  S.glass.box(R.x1 + 3, 7.4, OFFICE_ENTRY_Z, 6, 0.2, 30, 0xaee0f2); S.lit.box(R.x1 + 3, 7.2, OFFICE_ENTRY_Z, 0.3, 0.3, 30, 0x39404d);
  // delivery truck + bollards outside the bay (beyond the wall)
  truck(S, 50, 21, 0);
  // ---- roof: dishes, mast, rooftop letters
  for (const [x, z] of [[-150, 20], [-120, 150], [10, 20]]) { S.lit.cyl(x, H, z, 0.35, 2.4, 0x888e98, { seg: 6 }); S.lit.cyl(x, H + 2.4, z, 3.0, 0.6, 0xf2f2f4, { seg: 14, r1: 0.4 }); }
  S.lit.box(-92, H + 20, 84 + 38, 0.5, 40, 0.5, 0xd0d4da); for (let k = 0; k < 6; k++) S.lit.box(-92, H + 4 + k * 6, 84 + 38, 1.6 - k * 0.2, 0.2, 1.6 - k * 0.2, 0xd0d4da);
  S.basic.box(-92, H + 40.3, 84 + 38, 0.8, 0.8, 0.8, 0xff3b3b); S.basic.box(-92, H + 26, 84 + 38, 0.6, 0.6, 0.6, 0xff3b3b);
  { const t = S.board("TV CENTRE", 1000, 250, "#16213e", "#ffd34d", { border: "#ffd34d" });     for (const nx of [-1, 1]) S.wallQuad(S.sign, R.x1 - 14, OFFICE_ENTRY_Z - 20, nx, 0, 30, H + 1.5, H + 9.5, 0xffffff, rectUV(t.uv), nx * 0.1); S.lit.box(R.x1 - 14, H + 1, OFFICE_ENTRY_Z - 34, 0.6, 3, 0.6, 0x555a66); S.lit.box(R.x1 - 14, H + 1, OFFICE_ENTRY_Z - 6, 0.6, 3, 0.6, 0x555a66); }

  // ---- shoulder props with colliders (plants, bins) down the legs
  const sOf = (x, z) => track.locate({ x, y: 0, z }, undefined).s;
  const ps = [[28, OFFICE_ENTRY_Z, -1], [8, OFFICE_ENTRY_Z, 1], [-20, OFFICE_ENTRY_Z, -1], [-54, OFFICE_ENTRY_Z, 1], [-60, OFFICE_EXIT_Z, 1], [-30, OFFICE_EXIT_Z, -1], [0, OFFICE_EXIT_Z, 1], [24, OFFICE_EXIT_Z, -1]];
  for (const [x, z, sg] of ps) {
    const s = sOf(x, z), sp = track.sample(s), lat = sg * (wallDist - 1.5), px = sp.pos.x + sp.right.x * lat, pz = sp.pos.z + sp.right.z * lat;
    if (Math.abs(sg) && z === OFFICE_EXIT_Z && x > 10) { S.lit.cyl(px, 0, pz, 0.55, 1.0, 0xf2c200, { seg: 8 }); S.lit.cyl(px, 0.3, pz, 0.58, 0.18, 0x111111, { seg: 8 }); S.cols(px, pz, 0.6, -1, 1.2); }   // bay bollards
    else { S.lit.cyl(px, 0, pz, 0.75, 0.9, 0xd8d0c0, { seg: 8 }); S.lit.cyl(px, 0.9, pz, 0.8, 1.6, 0x3e9b4a, { seg: 8, r1: 0.25 }); S.cols(px, pz, 0.8, -1, 2.4); }
  }
}

function truck(S, x, z, ry) {
  S.lit.box(x, 2.1, z, 2.6, 3.2, 8.5, 0xf4f4f4, { ry }); S.lit.box(x + 6.0 * Math.sin(ry), 1.6, z + 6.0 * Math.cos(ry), 2.5, 2.2, 2.6, 0x2b7bd6, { ry });
  S.lit.box(x, 0.45, z, 2.4, 0.5, 11, 0x222222, { ry }); S.cols(x, z, 3.2, -1, 4); S.cols(x + 3.2 * Math.sin(ry), z + 3.2 * Math.cos(ry), 2.2, -1, 4); S.cols(x - 3.2 * Math.sin(ry), z - 3.2 * Math.cos(ry), 2.2, -1, 4);
}
function hazardBay(S, x, z, span) {
  const t = S.hazardTex || (S.hazardTex = S.atlas.paint(64, 32, (g) => { g.fillStyle = "#f2c200"; g.fillRect(0, 0, 64, 32); g.fillStyle = "#111"; for (let k = -2; k < 8; k++) { g.beginPath(); g.moveTo(k * 12, 32); g.lineTo(k * 12 + 8, 32); g.lineTo(k * 12 + 24, 0); g.lineTo(k * 12 + 16, 0); g.fill(); } }));
  S.hazardM = S.hazardM || new (S.fac[0].constructor)();
  S.hazardM.quad([x - 1.5, 0.075, z + span / 2], [x + 1.5, 0.075, z + span / 2], [x + 1.5, 0.075, z - span / 2], [x - 1.5, 0.075, z - span / 2], 0xffffff, rectUV(t.uv), [0, 1, 0]);
}
void shade; void FONT;
