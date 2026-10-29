// Dune Canyon - dressing: oasis, camels, ghost town, flora, fences, skulls, buttes, dust devils, tumbleweeds.
import * as THREE from "three";
import { LY } from "./canyon.layout.js";
import { rockGeo, beamMat } from "./canyon-struct.js";

const TAU = Math.PI * 2;
const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildProps(track, X, K, sunDir) {
  const { C, group, wallDist, own, anim, bake, mat, part, canvas, toTex, noiseFill, rng, nearest } = X;
  const { at, instanced, scatter, lam, basic, pick, R } = K;
  const gy = X.groundY, L = track.length, b = track.bounds;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const hl = Math.hypot(sunDir.x, sunDir.z), shx = -sunDir.x / hl, shz = -sunDir.z / hl;   // direction shadows fall
  const shRy = Math.atan2(shx, shz), shK = hl / sunDir.y;                                    // length per metre of height
  const oasis = X.oasis;
  const flat = (x, z, t = 1.7) => Math.abs(gy(x + 3, z) - gy(x - 3, z)) < t && Math.abs(gy(x, z + 3) - gy(x, z - 3)) < t;
  const farRoad = (x, z, d) => nearest(x, z) > d;
  const P = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), ry), V(s, s, s));
  const place = (parts, M) => parts.map((p) => ({ g: p.g, m: M.clone().multiply(p.m), c: p.c }));
  const B = (w, h, d, x, y, z, hex, ry = 0, rx = 0, rz = 0) => part(new THREE.BoxGeometry(w, h, d), mat(x, y, z, 1, 1, 1, rx, ry, rz), hex);
  const CY = (r0, r1, h, x, y, z, hex, seg = 6, rx = 0, rz = 0) => part(new THREE.CylinderGeometry(r0, r1, h, seg), mat(x, y, z, 1, 1, 1, rx, 0, rz), hex);
  const shadowMat = own(new THREE.MeshBasicMaterial({ color: 0x2a1030, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const longShadows = (items, h, wid) => {
    if (!items.length) return;
    const g = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
    instanced(g, shadowMat, items.map((t) => { const len = h * (t.sy ?? t.sx ?? 1) * shK, w = wid * (t.sx ?? 1); return { x: t.x + shx * len * 0.55, z: t.z + shz * len * 0.55, y: 0.2, ry: shRy, sx: w, sy: 1, sz: len * 0.6 + w }; }), "long-shadows");
  };
  const tcol = new THREE.Color();

  // ============================================================ generic desert flora
  // saguaro
  const sag = bake([
    CY(0.42, 0.55, 5.4, 0, 2.7, 0, 0x4f7a3a, 7), part(new THREE.SphereGeometry(0.42, 7, 5), mat(0, 5.4, 0), 0x5d8a44),
    CY(0.28, 0.3, 1.5, 0.95, 2.35, 0, 0x55823e, 6, 0, Math.PI / 2), CY(0.27, 0.28, 2.0, 1.65, 3.2, 0, 0x5d8a44, 6), part(new THREE.SphereGeometry(0.27, 6, 4), mat(1.65, 4.2, 0), 0x5d8a44),
    CY(0.26, 0.28, 1.2, -0.8, 3.1, 0, 0x55823e, 6, 0, Math.PI / 2), CY(0.25, 0.26, 1.5, -1.4, 3.8, 0, 0x5d8a44, 6), part(new THREE.SphereGeometry(0.25, 6, 4), mat(-1.4, 4.55, 0), 0x5d8a44),
  ]);
  const wellSpaced = (n, minD, maxD, sep, extra) => scatter(n, minD, maxD, { sep, filter: (x, z) => flat(x, z) && gy(x, z) < 14 && Math.hypot(x - oasis.x, z - oasis.z) > 45 && (!extra || extra(x, z)) });
  const sagPts = wellSpaced(150, wallDist + 3.5, 190, 14).map((p) => ({ x: p.x, z: p.z, ry: rng() * TAU, sx: R(0.7, 1.5), c: pick([0xffffff, 0xe8f0d8, 0xf2ffe0]) }));
  instanced(sag, lam({ vertexColors: true }), sagPts, "saguaro"); longShadows(sagPts, 5.4, 0.9);
  const barrel = bake([part(new THREE.SphereGeometry(0.6, 8, 6), mat(0, 0.42, 0, 1, 0.85, 1), 0x6a9a4a), part(new THREE.SphereGeometry(0.2, 5, 4), mat(0, 0.95, 0), 0xff6a8a)]);
  instanced(barrel, lam({ vertexColors: true }), wellSpaced(110, wallDist + 3, 150, 6).map((p) => ({ x: p.x, z: p.z, ry: rng() * 6, sx: R(0.6, 1.3) })), "barrel-cactus");
  // dry shrubs
  const shrub = bake([part(new THREE.IcosahedronGeometry(0.7, 0), mat(0, 0.45, 0, 1.2, 0.7, 1.2), 0x8a7a42), part(new THREE.IcosahedronGeometry(0.5, 0), mat(0.5, 0.35, 0.2), 0x9a8a50)]);
  instanced(shrub, lam({ vertexColors: true }), scatter(220, wallDist + 2.5, 160, { filter: (x, z) => gy(x, z) < 16 }).map((p) => ({ x: p.x, z: p.z, ry: rng() * 6, sx: R(0.6, 1.6), c: pick([0xffffff, 0xdcc89a, 0xc2b080]) })), "shrubs");
  // boulders (rock strata) + spires
  const bg = rockGeo(new THREE.IcosahedronGeometry(1, 1), new THREE.Matrix4(), 2.2, 0.35);
  const boulders = scatter(130, wallDist + 3, 200, { filter: (x, z) => gy(x, z) < 20 && Math.hypot(x - oasis.x, z - oasis.z) > 40 }).map((p) => ({ x: p.x, z: p.z, y: -0.3, sx: R(0.9, 3.4), sy: R(0.8, 2.4), sz: R(0.9, 3.0), ry: rng() * 6, c: pick([0xffffff, 0xf2e0d0, 0xe0c8b8]) }));
  instanced(bg, lam({ vertexColors: true }), boulders, "boulders"); longShadows(boulders.map((o) => ({ ...o, sx: o.sx * 0.9 })), 2.2, 1.0);

  // ============================================================ oasis
  {
    // water
    const wc = canvas(256, 256), wg = wc.getContext("2d");
    const gr = wg.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, "#35c4c0"); gr.addColorStop(1, "#1a8aa0"); wg.fillStyle = gr; wg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 220; i++) { wg.strokeStyle = `rgba(255,${230 + rng() * 25 | 0},${190 + rng() * 60 | 0},${0.06 + rng() * 0.2})`; wg.lineWidth = 1 + rng() * 1.5; wg.beginPath(); const x = rng() * 256, y = rng() * 256; wg.moveTo(x, y); wg.quadraticCurveTo(x + 10, y - 3, x + 22, y); wg.stroke(); }
    const wt = own(toTex(wc)); wt.repeat.set(3, 3);
    const pool = new THREE.Mesh(own(new THREE.CircleGeometry(oasis.r * 0.98, 40).rotateX(-Math.PI / 2)), own(new THREE.MeshBasicMaterial({ map: wt, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
    pool.position.set(oasis.x, oasis.y - 0.5, oasis.z); pool.name = "oasis-water"; group.add(pool);
    anim.push((dt) => { wt.offset.x += dt * 0.01; wt.offset.y += dt * 0.006; });
    // palms
    const trunk = 0x8a5a36, trunkD = 0x6a4128, f1 = 0x4a9a3a, f2 = 0x2f7a30;
    const pp = []; { let x = 0, y = 0, tilt = 0;
      for (let k = 0; k < 6; k++) { const h = 1.5; pp.push(part(new THREE.CylinderGeometry(0.2 - k * 0.014, 0.27 - k * 0.014, h, 6), mat(x + Math.sin(tilt) * h / 2, y + h / 2, 0, 1, 1, 1, 0, 0, -tilt), k % 2 ? trunkD : trunk)); x += Math.sin(tilt) * h; y += Math.cos(tilt) * h; tilt += 0.08; }
      for (let k = 0; k < 10; k++) { const az = (k / 10) * TAU, a = k % 2 ? -0.55 : -0.12, len = 4.6; const dx = Math.cos(a) * Math.cos(az), dy = Math.sin(a), dz = -Math.cos(a) * Math.sin(az); pp.push(part(new THREE.ConeGeometry(0.55, len, 4), mat(x + dx * len / 2, y + dy * len / 2 + 0.2, dz * len / 2, 1, 1, 0.22, 0, az, a - Math.PI / 2), k % 2 ? f1 : f2)); }
      for (let k = 0; k < 4; k++) pp.push(part(new THREE.SphereGeometry(0.22, 6, 5), mat(x + Math.cos(k * 1.6) * 0.32, y - 0.25, Math.sin(k * 1.6) * 0.32), 0xb06a20)); }
    const palmGeo = bake(pp), palms = [];
    for (let k = 0; k < 26; k++) { const a = (k / 26) * TAU + R(-0.1, 0.1), r = oasis.r + R(1, 12); palms.push({ x: oasis.x + Math.cos(a) * r, z: oasis.z + Math.sin(a) * r, ry: rng() * TAU, sx: R(0.9, 1.5), c: pick([0xffffff, 0xf0ffe0]) }); }
    for (let s = 10; s < 360; s += 24 + rng() * 14) for (const sg of [-1, 1]) { if (rng() < 0.4) continue; const a = at(s, sg * (wallDist + R(5, 11))); if (!farRoad(a.x, a.z, wallDist + 3.5) || !flat(a.x, a.z)) continue; palms.push({ x: a.x, z: a.z, ry: rng() * TAU, sx: R(0.85, 1.3) }); }
    instanced(palmGeo, lam({ vertexColors: true }), palms, "palms"); longShadows(palms, 7.5, 1.4);
    // reeds + rocks round the pool
    const reed = bake([CY(0.02, 0.06, 1.4, 0, 0.7, 0, 0x6aa040, 4), CY(0.02, 0.06, 1.1, 0.12, 0.55, 0.05, 0x5a9035, 4, 0, -0.2), CY(0.02, 0.06, 1.2, -0.1, 0.6, -0.08, 0x78b04a, 4, 0.2, 0)]);
    const reeds = []; for (let k = 0; k < 90; k++) { const a = rng() * TAU, r = oasis.r * R(0.8, 1.12); reeds.push({ x: oasis.x + Math.cos(a) * r, z: oasis.z + Math.sin(a) * r, ry: rng() * 6, sx: R(0.8, 1.7) }); }
    instanced(reed, lam({ vertexColors: true, side: THREE.DoubleSide }), reeds, "reeds");
    // camels
    const camel = bake([
      B(1.0, 1.0, 2.5, 0, 2.1, 0, 0xc9995c), part(new THREE.SphereGeometry(0.55, 7, 5), mat(0, 2.85, -0.15, 1, 1, 1.2), 0xc2904f),
      CY(0.2, 0.3, 1.7, 0, 3.0, 1.25, 0xc9995c, 6, 0.55, 0), B(0.38, 0.45, 0.75, 0, 3.95, 1.85, 0xd2a46a),
      ...[[-0.35, 0.95], [0.35, 0.95], [-0.35, -0.95], [0.35, -0.95]].map(([x, z]) => CY(0.13, 0.1, 1.7, x, 0.85, z, 0xb8864a, 5)),
      CY(0.04, 0.07, 0.9, 0, 2.2, -1.45, 0x6a4a2a, 4, 0.3, 0),
    ]);
    const camels = []; for (let k = 0; k < 6; k++) { const a = 0.4 + k * 0.9 + R(-0.2, 0.2), r = oasis.r + R(2, 8); camels.push({ x: oasis.x + Math.cos(a) * r, z: oasis.z + Math.sin(a) * r, ry: rng() * TAU, sx: R(0.95, 1.2) }); }
    instanced(camel, lam({ vertexColors: true }), camels, "camels"); longShadows(camels, 4.2, 1.1);
    // striped tents
    const tc = canvas(64, 64), tg = tc.getContext("2d"); for (let i = 0; i < 8; i++) { tg.fillStyle = i % 2 ? "#f4e6c8" : "#c4452a"; tg.fillRect(i * 8, 0, 8, 64); }
    const ttex = own(toTex(tc));
    for (let k = 0; k < 3; k++) { const a = 2.6 + k * 0.5, r = oasis.r + 11 + k * 2, x = oasis.x + Math.cos(a) * r, z = oasis.z + Math.sin(a) * r;
      const m = new THREE.Mesh(own(new THREE.ConeGeometry(3.6, 3.4, 8, 1, true)), lam({ map: ttex, side: THREE.DoubleSide })); m.position.set(x, gy(x, z) + 1.7, z); m.rotation.y = rng() * 6; group.add(m);
      const d = new THREE.Mesh(own(new THREE.CircleGeometry(3.4, 8).rotateX(-Math.PI / 2)), lam({ color: 0x8a6a40 })); d.position.set(x, gy(x, z) + 0.08, z); group.add(d); }
  }

  // ============================================================ ghost town / mining camp
  {
    const [t0, t1] = LY.town;
    const front = (txt, bg, fg) => { const c = canvas(256, 96), g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
      for (let y = 0; y < 96; y += 12) { g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(0, y, 256, 2); }
      noiseFill(g, 256, 96, rng, 700, 0.14, 255, 0, 2);
      g.fillStyle = fg; g.font = "900 40px Arial Black, Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, 128, 50);
      g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 5; g.strokeRect(5, 5, 246, 86); return own(toTex(c, { repeat: false })); };
    const signs = [["SALOON", "#7a3a22", "#f2d9a0"], ["HOTEL", "#4a5a68", "#e8dcc0"], ["ASSAY", "#6a5a3a", "#f0e0b0"], ["GENERAL", "#8a4a2a", "#f4e4c0"], ["BANK", "#3a4a3a", "#e8d9a0"], ["LIVERY", "#6a3a2a", "#e8d0a0"], ["MINE CO.", "#5a4a3a", "#f0c860"]];
    const woods = [0x8a6a4a, 0x7a5c40, 0x9a7a56, 0x6a5038];
    const house = (w, d, h, roofHex, wood) => {
      const out = [B(w, h, d, 0, h / 2, 0, wood), B(w + 0.6, 0.3, d + 0.6, 0, 0.15, 0, 0x5a4a3a),
        part(new THREE.BoxGeometry(w + 0.8, 0.18, d * 0.62), mat(-0, h + 0.55, d * 0.22 * 0, 1, 1, 1, 0.38, 0, 0)), part(new THREE.BoxGeometry(w + 0.8, 0.18, d * 0.62), mat(0, h + 0.55, 0, 1, 1, 1, -0.38, 0, 0))];
      out[2].m = mat(0, h + 0.7, -d * 0.2, 1, 1, 1, -0.4, 0, 0); out[2].c = new THREE.Color(roofHex); out[3].m = mat(0, h + 0.7, d * 0.2, 1, 1, 1, 0.4, 0, 0); out[3].c = new THREE.Color(roofHex);
      out.push(B(w * 0.98, 1.6, 0.35, 0, h + 0.8, d / 2 + 0.05, wood));
      for (let k = -1; k <= 1; k += 2) { out.push(B(1.0, 1.2, 0.12, k * w * 0.27, h * 0.55, d / 2 + 0.07, 0x1c1410)); out.push(B(1.2, 0.12, 0.2, k * w * 0.27, h * 0.55 - 0.65, d / 2 + 0.1, 0x4a3a2a)); }
      out.push(B(1.2, h * 0.65, 0.12, 0, h * 0.33, d / 2 + 0.07, 0x2a1c14));
      // porch
      out.push(B(w, 0.18, 2.4, 0, h * 0.82, d / 2 + 1.25, 0x5a4430));
      for (let k = -1; k <= 1; k += 2) out.push(B(0.22, h * 0.82, 0.22, k * (w / 2 - 0.2), h * 0.41, d / 2 + 2.3, 0x4a3828));
      out.push(B(w, 0.14, 2.4, 0, 0.12, d / 2 + 1.25, 0x6a5238));
      return out;
    };
    const bparts = [], signMeshes = [];
    let bi = 0;
    for (let s = t0 + 8; s < t1 - 12; s += 26) for (const sg of [-1, 1]) {
      if (rng() < 0.18) continue;
      const lat = sg * (wallDist + 10.5 + R(0, 2)), a = at(s + R(-3, 3), lat), w = R(7, 11), d = R(7, 10), h = R(4, 6.2);
      if (!farRoad(a.x, a.z, wallDist + 5)) continue;
      const base = Math.min(gy(a.x, a.z), gy(a.x + 4, a.z), gy(a.x - 4, a.z), gy(a.x, a.z + 4), gy(a.x, a.z - 4)) - 0.2;
      const ry = Math.atan2(-sg * a.rx, -sg * a.rz) + R(-0.08, 0.08);
      const M = P(a.x, base, a.z, ry);
      bparts.push(...place(house(w, d, h, pick([0x5a4030, 0x6a4a34, 0x4a4038]), pick(woods)), M));
      const sgn = signs[bi++ % signs.length], tex = front(sgn[0], sgn[1], sgn[2]);
      const pl = new THREE.Mesh(own(new THREE.PlaneGeometry(w * 0.9, w * 0.9 * 96 / 256)), lam({ map: tex }));
      pl.matrixAutoUpdate = false; pl.matrix.copy(M.clone().multiply(new THREE.Matrix4().makeTranslation(0, h + 0.85, d / 2 + 0.25))); pl.matrixWorldNeedsUpdate = true; group.add(pl);
      track.addObstacle(a.x, a.z, Math.min(w, d) * 0.55, -50, 80);
      X.groundY && 0;
    }
    // water towers
    const wtower = [CY(3.1, 3.1, 4.2, 0, 11.5, 0, 0x8a5a3a, 12), part(new THREE.ConeGeometry(3.5, 1.8, 12), mat(0, 14.5, 0), 0x4a3a2a), B(6.3, 0.35, 6.3, 0, 9.3, 0, 0x4a3a2a)];
    for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) wtower.push(CY(0.28, 0.32, 9.4, x, 4.7, z, 0x5a4430, 6));
    for (const k of [2.5, 6]) { wtower.push(B(5.4, 0.18, 0.2, 0, k, 2.2, 0x4a3828, 0, 0, 0.0), B(5.4, 0.18, 0.2, 0, k, -2.2, 0x4a3828)); }
    wtower.push(B(0.2, 0.2, 6.2, 2.2, 4.3, 0, 0x4a3828, 0, 0.0, 0), B(0.2, 0.2, 6.2, -2.2, 4.3, 0, 0x4a3828));
    for (const [sOff, sg] of [[t0 + 40, 1], [t0 + 118, -1]]) {
      const a = at(sOff, sg * (wallDist + 24)), M = P(a.x, gy(a.x, a.z) - 0.4, a.z, R(0, 6));
      bparts.push(...place(wtower, M));
      for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) { const q = new THREE.Vector3(x, 0, z).applyMatrix4(M); track.addObstacle(q.x, q.z, 0.6, -50, 80); }
    }
    // wagons (a couple wrecked on the shoulder, with colliders)
    const wagon = [B(2.0, 0.22, 4.2, 0, 1.1, 0, 0x6a4a2a), B(0.18, 0.8, 4.2, 1.0, 1.55, 0, 0x7a5a3a), B(0.18, 0.8, 4.2, -1.0, 1.55, 0, 0x7a5a3a), B(2.0, 0.8, 0.18, 0, 1.55, -2.0, 0x7a5a3a), CY(0.05, 0.05, 5, 0, 1.0, 4.4, 0x4a3828, 5, Math.PI / 2, 0)];
    for (const [x, z] of [[-1.15, 1.3], [1.15, 1.3], [-1.15, -1.3], [1.15, -1.3]]) wagon.push(part(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 10), mat(x, 0.85, z, 1, 1, 1, 0, 0, Math.PI / 2), 0x4a3320));
    for (let k = 0; k < 4; k++) wagon.push(part(new THREE.TorusGeometry(0.7, 0.05, 4, 8), mat(0, 1.9 + 0.0, -1.5 + k * 1.0, 1, 1, 1, 0, 0, 0), 0xe8dcc0));
    const hood = part(new THREE.CylinderGeometry(1.05, 1.05, 4.0, 8, 1, true, 0, Math.PI), mat(0, 1.5, 0, 1, 1, 1, Math.PI / 2, 0, Math.PI / 2), 0xe0d2b0);
    wagon.push(hood);
    const wagonSpots = [[t0 + 12, 1, 3.2], [t0 + 62, -1, 3.0], [t0 + 95, 1, 4.2], [t0 + 140, -1, 3.8]];
    for (const [sOff, sg, off] of wagonSpots) {
      const a = at(sOff, sg * (wallDist + off + 4)), ry = a.h + R(-0.5, 0.5) + Math.PI / 2, M = P(a.x, gy(a.x, a.z) - 0.1, a.z, ry);
      bparts.push(...place(wagon, M));
      for (const k of [-1.6, 0, 1.6]) { const q = V(k, 0, 0).applyMatrix4(M); /* length along local z after quarter turn */ void q; }
      for (const k of [-1.7, 0, 1.7]) { const q = V(0, 0, k).applyMatrix4(M); track.addObstacle(q.x, q.z, 1.2, -50, 80); }
    }
    // derelict wagon on the shoulder in the drop (reachable, collidable)
    { const a = at(t0 - 20, 1 * (wallDist - 2.6)), M = P(a.x, gy(a.x, a.z) - 0.05, a.z, a.h + 0.6); bparts.push(...place(wagon, M)); for (const k of [-1.7, 0, 1.7]) { const q = V(0, 0, k).applyMatrix4(M); track.addObstacle(q.x, q.z, 1.0, -50, 80); } }
    // barrels + crates
    const barrelG = [CY(0.5, 0.5, 1.0, 0, 0.5, 0, 0x7a5232, 8), CY(0.53, 0.53, 0.08, 0, 0.3, 0, 0x2a2a2a, 8), CY(0.53, 0.53, 0.08, 0, 0.7, 0, 0x2a2a2a, 8)];
    const crate = [B(0.9, 0.9, 0.9, 0, 0.45, 0, 0x9a7a4a), B(0.95, 0.1, 0.95, 0, 0.9, 0, 0x7a5a32)];
    for (let k = 0; k < 40; k++) { const a = at(R(t0, t1), (rng() < 0.5 ? -1 : 1) * (wallDist + R(3, 14))); if (!farRoad(a.x, a.z, wallDist + 1.8)) continue; bparts.push(...place(rng() < 0.55 ? barrelG : crate, P(a.x, gy(a.x, a.z) - 0.05, a.z, rng() * 6))); }
    // mine: timber portal in the rock face + headframe + ore carts on rails
    { const sg = -1, a = at(t0 + 80, sg * (wallDist + 40)), ry = Math.atan2(-sg * a.rx, -sg * a.rz), base = gy(a.x, a.z), M = P(a.x, base, a.z, ry);
      const mp = [B(0.7, 4.2, 0.7, -2.2, 2.1, 0, 0x5a4030), B(0.7, 4.2, 0.7, 2.2, 2.1, 0, 0x5a4030), B(5.6, 0.7, 0.8, 0, 4.4, 0, 0x4a3426), B(3.7, 3.8, 0.4, 0, 1.9, -0.6, 0x0a0806)];
      for (const x of [-3, 3]) mp.push(B(0.2, 0.2, 14, x * 0.35, 0.12, 6, 0x3a3a3a));
      for (let k = 0; k < 8; k++) mp.push(B(2.6, 0.14, 0.3, 0, 0.05, 1.5 + k * 1.6, 0x4a3828));
      // headframe tower
      mp.push(B(0.5, 12, 0.5, -3, 6, 7, 0x4a3828, 0, 0.0, 0.18), B(0.5, 12, 0.5, 3, 6, 7, 0x4a3828, 0, 0.0, -0.18), B(0.5, 12, 0.5, -3, 6, 10, 0x4a3828, 0, 0, 0.18), B(0.5, 12, 0.5, 3, 6, 10, 0x4a3828, 0, 0, -0.18),
        B(1.8, 0.4, 4.6, 0, 11.6, 8.5, 0x3a2c20), part(new THREE.CylinderGeometry(1.1, 1.1, 0.4, 12), mat(0, 12.2, 8.5, 1, 1, 1, 0, 0, Math.PI / 2), 0x2a2a2a));
      // ore cart
      mp.push(B(1.4, 0.8, 2.0, 0, 0.8, 4.5, 0x6a6a6e), B(1.2, 0.3, 1.8, 0, 1.3, 4.5, 0x3a2a1a));
      bparts.push(...place(mp, M));
      track.addObstacle(a.x, a.z, 1.0, -50, 80);
    }
    // hitching rails
    for (let s = t0 + 6; s < t1 - 8; s += 17) for (const sg of [-1, 1]) { if (rng() < 0.4) continue; const a = at(s, sg * (wallDist + 3.4)); if (!farRoad(a.x, a.z, wallDist + 1.2)) continue;
      const M = P(a.x, gy(a.x, a.z), a.z, a.h); bparts.push(...place([B(0.16, 1.2, 0.16, -1.4, 0.6, 0, 0x5a4430), B(0.16, 1.2, 0.16, 1.4, 0.6, 0, 0x5a4430), B(3.2, 0.14, 0.14, 0, 1.0, 0, 0x6a5238)], M)); }
    const bm = new THREE.Mesh(own(bake(bparts)), lam({ vertexColors: true, side: THREE.DoubleSide })); bm.name = "ghost-town"; group.add(bm);
    // windmill (spinning fan)
    { const a = at(t0 + 100, 1 * (wallDist + 30)), base = gy(a.x, a.z);
      const tower = [];
      for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) tower.push(CY(0.09, 0.14, 11, x * 0.8, 5.5, z * 0.8, 0x6a4a30, 5));
      for (const y of [3, 6.5, 9.5]) tower.push(B(2.4 - y * 0.08, 0.1, 0.1, 0, y, 1.0, 0x5a4430), B(2.4 - y * 0.08, 0.1, 0.1, 0, y, -1.0, 0x5a4430));
      tower.push(B(0.5, 0.5, 1.2, 0, 11.3, 0.5, 0x4a3a2a), B(0.1, 1.2, 2.4, 0, 11.6, -0.8, 0xc8b898));
      const tg = new THREE.Mesh(own(bake(tower)), lam({ vertexColors: true })); tg.position.set(a.x, base - 0.2, a.z); group.add(tg);
      const fan = []; for (let k = 0; k < 10; k++) { const an = k / 10 * TAU; fan.push(part(new THREE.BoxGeometry(0.1, 3.6, 0.7), mat(Math.cos(an) * 1.9, Math.sin(an) * 1.9, 0, 1, 1, 1, 0, 0, an - Math.PI / 2), k % 2 ? 0xd8c8a8 : 0xb8a888)); }
      const fm = new THREE.Mesh(own(bake(fan)), lam({ vertexColors: true, side: THREE.DoubleSide })); const fg = new THREE.Group(); fg.add(fm); fg.position.set(a.x, base + 11.5, a.z + 1.2); group.add(fg);
      anim.push((dt, t) => { fm.rotation.z = -t * 1.6; });
      track.addObstacle(a.x, a.z, 1.8, -50, 80);
    }
  }

  // ============================================================ fence lines + skulls
  {
    const posts = [], wire = [];
    const run = (s0, s1, sg) => {
      let prev = null;
      for (let s = s0; s <= s1; s += 7) {
        const a = at(s, sg * (wallDist + 2.5)); if (!flat(a.x, a.z, 3)) { prev = null; continue; }
        const y = gy(a.x, a.z); posts.push({ x: a.x, z: a.z, y: 0, sx: 1, sy: R(0.85, 1.15), ry: R(-0.2, 0.2), rz: R(-0.12, 0.12) });
        if (prev) for (const hh of [0.55, 1.0]) wire.push(prev.x, prev.y + hh, prev.z, a.x, y + hh - 0.05, a.z);
        prev = { x: a.x, y, z: a.z };
      }
    };
    run(40, 330, 1); run(330, 590, -1); run(1940, 2100, 1); run(2150, 2300, -1); run(2200, 2330, 1);
    const post = bake([B(0.16, 1.5, 0.16, 0, 0.75, 0, 0x6a4c30), B(0.1, 0.1, 0.5, 0, 1.25, 0, 0x6a4c30)]);
    instanced(post, lam({ vertexColors: true }), posts, "fence-posts");
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
    group.add(new THREE.LineSegments(own(wg), basic({ color: 0x3a2a20 })));
    // skulls
    const skull = bake([part(new THREE.SphereGeometry(0.28, 7, 5), mat(0, 0.24, 0, 0.85, 0.7, 1.25), 0xeee2c6), part(new THREE.ConeGeometry(0.14, 0.5, 5), mat(0, 0.12, 0.45, 1, 1, 1, Math.PI / 2, 0, 0), 0xe0d2b0),
      part(new THREE.ConeGeometry(0.07, 0.5, 4), mat(-0.32, 0.4, 0.02, 1, 1, 1, 0, 0, 1.1), 0xcdbf9e), part(new THREE.ConeGeometry(0.07, 0.5, 4), mat(0.32, 0.4, 0.02, 1, 1, 1, 0, 0, -1.1), 0xcdbf9e),
      part(new THREE.BoxGeometry(0.1, 0.1, 0.06), mat(-0.11, 0.3, 0.26), 0x2a1c14), part(new THREE.BoxGeometry(0.1, 0.1, 0.06), mat(0.11, 0.3, 0.26), 0x2a1c14)]);
    const sk = [];
    for (let k = 0; k < 70; k++) { const s = R(30, L - 30), a = at(s, (rng() < 0.5 ? -1 : 1) * (wallDist + R(1.6, 6))); if (!farRoad(a.x, a.z, wallDist + 1.2) || !flat(a.x, a.z, 2.5)) continue; sk.push({ x: a.x, z: a.z, y: 0.02, ry: rng() * TAU, sx: R(1.1, 2.0), rz: R(-0.08, 0.08) }); }
    instanced(skull, lam({ vertexColors: true }), sk, "skulls");
    // a few on fence posts
    instanced(skull, lam({ vertexColors: true }), posts.filter((_, i) => i % 11 === 0).map((p) => ({ x: p.x, z: p.z, y: 1.38, ry: rng() * TAU, sx: 1.3 })), "post-skulls");
  }

  // ============================================================ buttes on the horizon
  {
    const geos = [], c = new THREE.Color();
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU + R(-0.12, 0.12), r = R(790, 1000), H = R(70, 150), RB = R(55, 110);
      const bx = cx + Math.cos(a) * r, bz = cz + Math.sin(a) * r;
      const layers = 7, seg = 12, pos = [], col = [];
      for (let l = 0; l < layers; l++) {
        const y0 = (l / layers) * H, y1 = ((l + 1) / layers) * H, r0 = RB * (1 - 0.1 * l) * (l === 0 ? 1.0 : 0.82 + R(0, 0.1)), r1 = r0 * (l === 0 ? 0.86 : 0.97);
        tcol.setHex([0xb5532b, 0xcf6d36, 0xe08f4a, 0x9b4328, 0xd9a15f, 0xc25e30, 0xeab270][(l * 3 + k) % 7]).multiplyScalar(0.8);
        for (let q = 0; q < seg; q++) {
          const a0 = (q / seg) * TAU, a1 = ((q + 1) / seg) * TAU, n0 = 0.85 + 0.3 * Math.sin(q * 2.3 + k + l), n1 = 0.85 + 0.3 * Math.sin((q + 1) * 2.3 + k + l);
          const p00 = [Math.cos(a0) * r0 * n0, y0, Math.sin(a0) * r0 * n0], p01 = [Math.cos(a1) * r0 * n1, y0, Math.sin(a1) * r0 * n1];
          const p10 = [Math.cos(a0) * r1 * n0, y1, Math.sin(a0) * r1 * n0], p11 = [Math.cos(a1) * r1 * n1, y1, Math.sin(a1) * r1 * n1];
          for (const p of [p00, p10, p01, p01, p10, p11]) { pos.push(bx + p[0], p[1] - 4, bz + p[2]); col.push(tcol.r, tcol.g, tcol.b); }
        }
      }
      for (let q = 0; q < seg; q++) { const a0 = (q / seg) * TAU, a1 = ((q + 1) / seg) * TAU, rr = RB * (1 - 0.1 * 6) * 0.82; for (const [x, z] of [[0, 0], [Math.cos(a0) * rr, Math.sin(a0) * rr], [Math.cos(a1) * rr, Math.sin(a1) * rr]]) { pos.push(bx + x, H - 4, bz + z); col.push(tcol.r * 1.1, tcol.g * 1.1, tcol.b * 1.1); } }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); geos.push(g);
    }
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const P2 = new Float32Array(n * 3), N2 = new Float32Array(n * 3), C2 = new Float32Array(n * 3); let o = 0;
    for (const g of geos) { P2.set(g.attributes.position.array, o * 3); N2.set(g.attributes.normal.array, o * 3); C2.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
    const mg = new THREE.BufferGeometry(); mg.setAttribute("position", new THREE.BufferAttribute(P2, 3)); mg.setAttribute("normal", new THREE.BufferAttribute(N2, 3)); mg.setAttribute("color", new THREE.BufferAttribute(C2, 3));
    const m = new THREE.Mesh(own(mg), lam({ vertexColors: true, side: THREE.DoubleSide })); m.name = "buttes"; group.add(m);
  }

  // ============================================================ dust devils + tumbleweeds (animated)
  {
    const dc = canvas(128, 256), dg = dc.getContext("2d");
    for (let i = 0; i < 90; i++) { const x = rng() * 128, w = 2 + rng() * 10; const gr = dg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "rgba(230,180,120,0)"); gr.addColorStop(0.3 + rng() * 0.4, `rgba(235,185,125,${0.15 + rng() * 0.4})`); gr.addColorStop(1, "rgba(230,180,120,0)"); dg.fillStyle = gr; dg.fillRect(x, 0, w, 256); }
    const dtex = own(toTex(dc)); dtex.repeat.set(2, 1);
    const dm = own(new THREE.MeshBasicMaterial({ map: dtex, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, fog: true }));
    const centres = scatter(4, 90, 200, { sep: 150, filter: (x, z) => gy(x, z) < 6 });
    const devils = centres.map((c0, di) => {
      const g = new THREE.Group(), rings = [];
      for (let k = 0; k < 6; k++) { const h = 4.6, rr = 0.9 + k * 1.0; const mesh = new THREE.Mesh(own(new THREE.CylinderGeometry(rr + 1.1, rr, h, 14, 1, true)), dm); mesh.position.y = k * h * 0.92 + h / 2; g.add(mesh); rings.push(mesh); }
      group.add(g); return { g, rings, c: c0, ph: rng() * 6, rad: R(18, 34), sp: R(0.12, 0.2) * (di % 2 ? 1 : -1) };
    });
    anim.push((dt, t) => {
      for (const d of devils) {
        const a = d.ph + t * d.sp, x = d.c.x + Math.cos(a) * d.rad, z = d.c.z + Math.sin(a * 1.3) * d.rad * 0.7;
        d.g.position.set(x, gy(x, z) - 0.3, z);
        d.rings.forEach((r, k) => { r.rotation.y = t * (2.2 - k * 0.2) + k; r.position.x = Math.sin(t * 0.9 + k * 0.7 + d.ph) * k * 0.45; r.position.z = Math.cos(t * 0.8 + k * 0.6) * k * 0.45; });
      }
      dtex.offset.y -= dt * 0.25;
    });
    // tumbleweeds
    const tw = [];
    const wx = Math.cos(0.55), wz = Math.sin(0.55);
    scatter(26, wallDist + 6, 140, { filter: (x, z) => flat(x, z, 2.5) && gy(x, z) < 10 }).forEach((p) => tw.push({ x0: p.x, z0: p.z, t: rng() * 20, v: R(4.5, 8.5), r: R(0.45, 0.8), ph: rng() * 6 }));
    if (tw.length) {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const im = new THREE.InstancedMesh(geo, own(new THREE.MeshBasicMaterial({ color: 0x9a7040, wireframe: true, fog: true })), tw.length); im.frustumCulled = false; im.name = "tumbleweeds"; group.add(im);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      anim.push((dt, t) => {
        tw.forEach((w, i) => {
          const d = ((t * w.v + w.t * 3) % 160) - 40, x = w.x0 + wx * d, z = w.z0 + wz * d, hop = Math.abs(Math.sin(t * 2.2 + w.ph)) * 0.45;
          const near = nearest(x, z), vis = near > 1e8 ? 1 : sm(wallDist + 0.5, wallDist + 5, near);
          e.set((t * w.v) / w.r, 0, 0, "XYZ"); q.setFromEuler(e); q.premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 0.55 + Math.PI / 2));
          p.set(x, gy(x, z) + w.r * 0.9 + hop, z); sc.setScalar(w.r * vis + 1e-3); m4.compose(p, q, sc); im.setMatrixAt(i, m4);
        });
        im.instanceMatrix.needsUpdate = true;
      });
    }
  }
}
