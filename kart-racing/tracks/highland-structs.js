// Highland Fling - built structures: ruined castle (gatehouse on the road), humpback stone bridge over the burn,
// Glenfinnan-style rail viaduct (road passes under the big arch; a little steam train crosses), cottages, distillery, standing stones, flags.
import * as THREE from "three";
import { TAU, LOCH, S, BURN, VIADUCT, lochR, burnQuery, vnoise } from "./highland-geo.js";
import { stoneCanvas, toTexture, saltireCanvas, lionCanvas } from "./highland-tex.js";

const S3 = 3;   // stone texture tile (m)

export function buildStructs(H) {
  const { track, X, K, rng } = H;
  const { group, bake, mat, part, own, anim, wallDist, C, hw } = X;
  const { at, instanced, lam, pick, R, blobShadows } = K;
  const gy = X.groundY, L = track.length;

  // ---------------------------------------------------------------- shared materials / part builders
  const stoneTex = own(toTexture(stoneCanvas(256, 256, [186, 181, 168], 11)));
  const stoneMat = own(new THREE.MeshLambertMaterial({ map: stoneTex, vertexColors: true }));
  const plainMat = own(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const copperMat = own(new THREE.MeshLambertMaterial({ color: 0xcf7a38, emissive: 0x3a1a08 }));
  const scaleUV = (g, fn) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, ...fn(uv.getX(i), uv.getY(i), i)); return g; };
  function sbox(w, h, d, m, hex) {
    const g = new THREE.BoxGeometry(w, h, d), f = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    scaleUV(g, (u, v, i) => { const k = Math.floor(i / 4); return [u * f[k][0] / S3, v * f[k][1] / S3]; });
    return part(g, m, hex);
  }
  function scyl(rT, rB, h, seg, m, hex, open = false) {
    const g = new THREE.CylinderGeometry(rT, rB, h, seg, 1, open), circ = TAU * Math.max(rT, rB);
    scaleUV(g, (u, v) => [u * circ / S3, v * h / S3]);
    return part(g, m, hex);
  }
  const extrude = (pts, depth) => {
    const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 1 });
    return scaleUV(g, (u, v) => [u / S3, v / S3]);
  };
  const arcPts = (cx, cy, rx, ry, a0, a1, n = 18) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; };
  const stoneTints = [0xffffff, 0xe8e4da, 0xd6d2c6, 0xf2eee2, 0xc8c4b8];
  const tint = () => pick(stoneTints);

  // ---------------------------------------------------------------- flags (saltire + lion rampant), animated
  const flagList = [];
  const flagTex = { saltire: own(toTexture(saltireCanvas(), false)), lion: own(toTexture(lionCanvas(), false)) };
  const flagMats = { saltire: own(new THREE.MeshBasicMaterial({ map: flagTex.saltire, side: THREE.DoubleSide })), lion: own(new THREE.MeshBasicMaterial({ map: flagTex.lion, side: THREE.DoubleSide })) };
  const flagPoleParts = [];
  function addFlag(kind, x, y, z, ry, w = 5.2, poleH = 0) {
    const g = new THREE.PlaneGeometry(w, w * 0.625, 10, 4); g.translate(w / 2, -w * 0.3125, 0);
    own(g); const base = g.attributes.position.array.slice();
    const m = new THREE.Mesh(g, flagMats[kind]); m.position.set(x, y, z); m.rotation.y = ry; m.frustumCulled = false; group.add(m);
    flagList.push({ g, base, w, ph: rng() * 6 });
    if (poleH > 0) flagPoleParts.push(part(new THREE.CylinderGeometry(0.1, 0.14, poleH, 6), mat(x, y - poleH / 2 + 0.6, z), 0x5a5e66));
  }
  anim.push((dt, t) => {
    for (const f of flagList) {
      const p = f.g.attributes.position;
      for (let i = 0; i < p.count; i++) { const bx = f.base[i * 3], by = f.base[i * 3 + 1], u = bx / f.w; p.setXYZ(i, bx, by - u * u * 0.18 * f.w * 0.4, Math.sin(t * 4.2 + f.ph - u * 5.5) * 0.5 * u * (0.4 + u)); }
      p.needsUpdate = true;
    }
  });

  // ================================================================= CASTLE
  {
    const G = S.gate, a = at(G, 0), gate = new THREE.Group(); gate.position.set(a.x, a.y, a.z); gate.rotation.y = a.h; gate.name = "gatehouse";
    const P = [], P2 = [];   // stone parts, plain parts (slate, iron, dark)
    // arch block (x = left of travel, z = forward)
    const topProfile = [[-26, 9.5], [-23, 12.5], [-21, 11], [-18.5, 14.5], [-14, 16], [-8, 15], [0, 17.2], [10, 17.2], [18, 16.6], [22, 15], [26, 15.8]];
    const topAt = (x) => { for (let i = 0; i < topProfile.length - 1; i++) { const [x0, y0] = topProfile[i], [x1, y1] = topProfile[i + 1]; if (x >= x0 && x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return 15; };
    const AW = 15.5, SPR = 4.5, CROWN = 12.5;
    const pts = [];
    pts.push([-26, -3], [-AW, -3], [-AW, SPR], ...arcPts(0, SPR, AW, CROWN - SPR, Math.PI, 0, 28).slice(1, -1), [AW, SPR], [AW, -3], [26, -3]);
    for (let i = topProfile.length - 1; i >= 0; i--) pts.push([topProfile[i][0], topProfile[i][1]]);
    const archGeo = extrude(pts, 9); archGeo.translate(0, 0, -4.5);
    P.push({ g: archGeo, m: new THREE.Matrix4(), c: new THREE.Color(0xe2ded2) });
    // crenellations (merlons) on both faces of the intact stretch
    for (let x = -24; x <= 22; x += 3.1) for (const zz of [-4.1, 4.1]) { if (x > 8 && rng() < 0.5) continue; const ty = topAt(x); P.push(sbox(1.7, 1.5, 1.1, mat(x, ty + 0.75, zz), tint())); }
    // portcullis remains
    for (let x = -11; x <= 11; x += 1.55) { const top = SPR + (CROWN - SPR) * Math.sqrt(Math.max(0, 1 - (x / AW) ** 2)); P2.push(part(new THREE.BoxGeometry(0.16, 2.8, 0.16), mat(x, top - 1.5, 0), 0x2a2a2e)); }
    P2.push(part(new THREE.BoxGeometry(23, 0.18, 0.2), mat(0, SPR + 6.8, 0), 0x2a2a2e), part(new THREE.BoxGeometry(23, 0.18, 0.2), mat(0, SPR + 7.8, 0), 0x2a2a2e));
    // towers: right (-x) intact with slate cone, left (+x) ruined
    const towerAt = (x, h, ruin) => {
      P.push(scyl(5.0, 5.7, h, 16, mat(x, h / 2 - 3, 0), 0xe4e0d4));
      P.push(scyl(5.5, 5.3, 1.1, 16, mat(x, h - 3 + (ruin ? 0 : 0.5), 0), 0xcfcbbf));
      for (let k = 0; k < 7; k++) { const an = k / 7 * TAU + 0.3; if (ruin && rng() < 0.45) continue; P.push(sbox(1.5, 1.4, 1.4, mat(x + Math.cos(an) * 5.3, h - 3 + 1.6, Math.sin(an) * 5.3, 1, 1, 1, 0, -an, 0), tint())); }
      for (let k = 0; k < 3; k++) { const yy = 6 + k * 5.5; for (const zz of [-1, 1]) P2.push(part(new THREE.BoxGeometry(0.55, 2.0, 0.3), mat(x, yy, zz * 5.4 * (1 - 0.0), 1, 1, 1, 0, 0, 0), 0x1c1c20)); }
    };
    towerAt(-30, 23, false); towerAt(30, 15.5, true);
    P2.push(part(new THREE.ConeGeometry(6.6, 7.5, 16), mat(-30, 23 - 3 + 3.8, 0), 0x3a4048));
    // rubble spilling from the ruined tower
    for (let k = 0; k < 9; k++) P.push(sbox(R(1, 2.6), R(0.7, 1.6), R(1, 2.2), mat(30 + R(-6, 8), R(-1.5, 0.2), R(-7, 7), 1, 1, 1, R(-0.3, 0.3), rng() * 3, R(-0.3, 0.3)), tint()));
    // flanking curtain walls (lateral) with ruin
    for (const sg of [-1, 1]) {
      let x = sg * 33;
      for (let k = 0; k < 5; k++) {
        const len = R(8, 11), hgt = (sg > 0 ? R(3.5, 8) : R(6.5, 9.5)) * (k > 2 ? 0.7 : 1);
        P.push(sbox(len, hgt + 3, 3.0, mat(x + sg * len / 2, hgt / 2 - 1.5, 0), tint()));
        if (sg < 0 && k < 4) for (let m = 0; m < 3; m++) P.push(sbox(1.5, 1.2, 1.0, mat(x + sg * (1.5 + m * 3), hgt + 0.6, 1.0), tint()));
        x += sg * len;
      }
    }
    const gm = new THREE.Mesh(own(bake(P)), stoneMat); gate.add(gm);
    gate.add(new THREE.Mesh(own(bake(P2)), plainMat));
    group.add(gate);
    track.addObstacle(a.x - Math.cos(a.h) * 30, a.z + Math.sin(a.h) * 30, 5.8, a.y - 3, a.y + 24);
    track.addObstacle(a.x + Math.cos(a.h) * 30, a.z - Math.sin(a.h) * 30, 5.8, a.y - 3, a.y + 24);
    const topL = at(G, -30), topR = at(G, 30);
    addFlag("saltire", topL.x, a.y + 22.5, topL.z, a.h + Math.PI / 2 + 0.3, 6.5, 10.5); addFlag("lion", a.x, a.y + 22.5, a.z, a.h + Math.PI / 2 - 0.3, 5.5, 6); addFlag("lion", topR.x, a.y + 32, topR.z, a.h + Math.PI / 2 + 0.2, 5.5, 7.5);

    // --- courtyard corridor walls (follow the road at +/-(wallDist+6.5)), ruined here and there
    const W = [], WP = [];
    const lat = wallDist + 6.8;
    for (const sg of [-1, 1]) for (let s = G + 14; s < S.castleB + 120; s += 7.5) {
      if (rng() < 0.14) continue;
      const p = at(s, sg * lat), g0 = gy(p.x, p.z);
      let hgt = R(5.5, 8.2); const tall = vnoise(s / 25 + sg * 5, 3) > 0.4; if (!tall) hgt *= R(0.35, 0.7);
      const top = Math.max(p.y + hgt, g0 + 2.2), bot = g0 - 1.5, hh = top - bot;
      W.push(sbox(7.9, hh, 2.4, mat(p.x, bot + hh / 2, p.z, 1, 1, 1, 0, p.h, 0), tint()));
      if (tall) for (let m = 0; m < 3; m++) { const q = at(s - 2.6 + m * 2.6, sg * lat); if (rng() < 0.75) W.push(sbox(1.5, 1.3, 1.9, mat(q.x, top + 0.65, q.z, 1, 1, 1, 0, q.h, 0), tint())); }
    }
    // corner / bend towers on the outside of the tight bends
    for (const [s, sg] of [[905, -1], [950, 1], [1000, -1], [1045, 1]]) {
      const p = at(s, sg * (lat + 5)), g0 = gy(p.x, p.z), hgt = R(11, 16), top = Math.max(p.y + hgt, g0 + 6), bot = g0 - 2;
      W.push(scyl(3.6, 4.2, top - bot, 12, mat(p.x, (top + bot) / 2, p.z), 0xe2ded2));
      for (let k = 0; k < 6; k++) { if (rng() < 0.35) continue; const an = k / 6 * TAU; W.push(sbox(1.3, 1.2, 1.1, mat(p.x + Math.cos(an) * 3.6, top + 0.6, p.z + Math.sin(an) * 3.6, 1, 1, 1, 0, -an, 0), tint())); }
      WP.push(part(new THREE.ConeGeometry(4.5, 4, 12), mat(p.x, top + 2, p.z), 0x3a4048));
      track.addObstacle(p.x, p.z, 4.0, p.y - 3, p.y + 20);
    }
    // keep: tall ruined square tower on the inside of the S-bend
    {
      const kp = at(985, 42), g0 = gy(kp.x, kp.z), top = Math.max(kp.y + 24, g0 + 20), bot = g0 - 3, hh = top - bot;
      W.push(sbox(15, hh, 15, mat(kp.x, bot + hh / 2, kp.z, 1, 1, 1, 0, kp.h + 0.15, 0), 0xe2ded2));
      W.push(sbox(15.4, 1.4, 15.4, mat(kp.x, top - 5, kp.z, 1, 1, 1, 0, kp.h + 0.15, 0), 0xcfcbbf));
      for (let k = 0; k < 6; k++) W.push(sbox(R(2, 4), R(2, 5), R(2, 4), mat(kp.x + R(-6, 6), top + R(0.5, 2), kp.z + R(-6, 6), 1, 1, 1, 0, rng(), 0), tint()));
      for (const [ox, oz] of [[8, 8], [-8, 8], [8, -8], [-8, -8]]) { const c = Math.cos(kp.h + 0.15), s = Math.sin(kp.h + 0.15); W.push(scyl(2.2, 2.6, hh * 0.85, 10, mat(kp.x + ox * c + oz * s, bot + hh * 0.425, kp.z - ox * s + oz * c), 0xd8d4c8)); }
      for (let k = 0; k < 5; k++) WP.push(part(new THREE.BoxGeometry(0.9, 2.4, 0.3), mat(kp.x + Math.sin(kp.h + 0.15) * 7.6 + (k - 2) * 0.0 * 0, bot + hh * (0.25 + 0.14 * k), kp.z + Math.cos(kp.h + 0.15) * 7.6 + Math.cos(kp.h) * (k - 2) * 2.2 * 0 + (k - 2) * 2.2, 1, 1, 1, 0, kp.h + 0.15, 0), 0x1c1c20));
      addFlag("saltire", kp.x + 3, top + 9, kp.z, kp.h + 0.5, 7, 12);
      track.addObstacle(kp.x, kp.z, 9.5, kp.y - 3, kp.y + 30);
    }
    // cross wall with a breach where the road leaves the courtyard
    {
      const sE = S.castleB + 118, a2 = at(sE, 0);
      for (const sg of [-1, 1]) for (let k = 0; k < 4; k++) {
        const off = (wallDist + 7.5 + k * 7.6) * sg, p = at(sE, off), g0 = gy(p.x, p.z), hgt = k === 0 ? 11 : R(4, 9), top = Math.max(p.y + hgt, g0 + 3), bot = g0 - 1.5;
        W.push(sbox(2.6, top - bot, 8.1, mat(p.x, (top + bot) / 2, p.z, 1, 1, 1, 0, p.h, 0), tint()));
        if (k === 0) { W.push(scyl(3.4, 3.9, top - bot + 4, 12, mat(p.x, (top + bot) / 2 + 2, p.z), 0xe2ded2)); track.addObstacle(p.x, p.z, 3.6, p.y - 3, p.y + 14); }
      }
      void a2;
    }
    group.add(new THREE.Mesh(own(bake(W)), stoneMat)); group.add(new THREE.Mesh(own(bake(WP)), plainMat));
    // fallen masonry + ferns around the castle, outside the barrier
    const rub = [];
    for (let s = G - 30; s < S.castleB + 140; s += 6) for (const sg of [-1, 1]) if (rng() < 0.55) { const p = at(s, sg * R(wallDist + 3, wallDist + 14)); rub.push({ x: p.x, z: p.z, y: -0.2, sx: R(0.5, 1.8), sy: R(0.4, 1.0), sz: R(0.5, 1.6), ry: rng() * 6, rx: R(-0.3, 0.3), c: pick([0xbdb8a8, 0x9e9a8c, 0xd0ccbc]) }); }
    instanced(new THREE.DodecahedronGeometry(1, 0), lam({ flatShading: true }), rub, "rubble");
  }

  // ================================================================= HUMPBACK BRIDGE over the burn
  {
    const s0 = S.bridge, c0 = track.sample(s0), cx = c0.pos.x, cz = c0.pos.z, tx = c0.tangent.x, tz = c0.tangent.z, rx = c0.right.x, rz = c0.right.z;
    const HL = 19, Wd = wallDist + 0.6;
    const bed = gy(cx, cz);
    const roadY = (t) => track.sample(s0 + t).pos.y;
    const ys = []; for (let t = -HL; t <= HL; t += 2) ys.push([t, roadY(t) - 0.12]);
    const minRoad = Math.min(...ys.map((p) => p[1]));
    const bot = bed - 2.2, SPR = bed + 0.6, crown = Math.min(SPR + 4.8, minRoad - 1.4), AWd = 5.4;
    const pts = [[-HL, bot], [-AWd, bot], [-AWd, SPR], ...arcPts(0, SPR, AWd, crown - SPR, Math.PI, 0, 20).slice(1, -1), [AWd, SPR], [AWd, bot], [HL, bot]];
    for (let i = ys.length - 1; i >= 0; i--) pts.push(ys[i]);
    const g = extrude(pts, 2 * Wd); g.translate(0, 0, -Wd);
    // basis: x -> tangent, y -> up, z -> right
    const B = new THREE.Matrix4().makeBasis(new THREE.Vector3(tx, 0, tz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(rx, 0, rz)); B.setPosition(cx, 0, cz);
    g.applyMatrix4(B);
    const m = new THREE.Mesh(own(g), own(new THREE.MeshLambertMaterial({ map: stoneTex, color: 0xc9c4b4, side: THREE.DoubleSide }))); m.name = "humpback-bridge"; group.add(m);
    // skirts hide the gap between the road edge and the gully-lowered terrain just beyond the stonework
    const sk = new X.Strips(C);
    for (const [from, len] of [[s0 - 56, 56 - HL], [s0 + HL, 56 - HL]]) {
      const i0 = Math.round(from / C.ds), n = Math.round(len / C.ds);
      for (const sg of [-1, 1]) sk.add({ profile: [[sg * (wallDist + 0.55), -0.65, 0.2], [sg * (wallDist + 0.55), -4.2, 0.8]], from: ((i0 % C.N) + C.N) % C.N, count: n, tile: 6, color: () => [0.22, 0.2, 0.16] });
    }
    const sm = new THREE.Mesh(own(sk.geometry()), own(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }))); group.add(sm);
    // parapet coping stones on the wall tops along the bridge
    const cop = [];
    for (let t = -HL + 1; t <= HL - 1; t += 2.4) for (const sg of [-1, 1]) { const p = c0.pos, y = roadY(t) + 1.15; cop.push(sbox(2.2, 0.5, 0.95, mat(p.x + tx * t + rx * sg * (wallDist + 0.28), y, p.z + tz * t + rz * sg * (wallDist + 0.28), 1, 1, 1, 0, Math.atan2(tx, tz), 0), tint())); }
    group.add(new THREE.Mesh(own(bake(cop)), stoneMat));
    H.bridge = { s: s0, bed, crown, x: cx, z: cz };
  }

  // ================================================================= RAIL VIADUCT
  {
    const zv = VIADUCT.z, cxv = VIADUCT.cx;
    const rs = track.locate({ x: cxv, y: undefined, z: zv }); const roadY = rs.y;
    const deck = roadY + 13.6, DW = 8.4, PW = 3.5;
    const piers = [cxv - 21.6, cxv + 21.6]; for (let k = 1; k <= 3; k++) piers.unshift(piers[0] - 18.6); for (let k = 1; k <= 2; k++) piers.push(piers[piers.length - 1] + 18.6);
    piers.sort((p, q) => p - q);
    const stoneP = [], plain = [];
    for (let i = 0; i < piers.length - 1; i++) {
      const x0 = piers[i], x1 = piers[i + 1], span = x1 - x0, cxm = (x0 + x1) / 2, big = Math.abs(cxm - cxv) < 1;
      const gmid = Math.max(gy(cxm, zv), gy(x0, zv), gy(x1, zv)), bot = Math.min(gy(cxm, zv), gy(x0, zv), gy(x1, zv)) - 2.2;
      const hw2 = span / 2 - PW / 2, crown = big ? deck - 3.4 : deck - 3.6;
      const spr = big ? roadY + 1.6 : crown - hw2 * 0.95;
      const top = deck - 1.0;
      let pts;
      if (gmid > spr + 0.5 && !big) pts = [[x0, bot], [x1, bot], [x1, top], [x0, top]];
      else { pts = [[x0, bot], [x0 + PW / 2, bot], [x0 + PW / 2, spr], ...arcPts(cxm, spr, hw2, crown - spr, Math.PI, 0, 24).slice(1, -1), [x1 - PW / 2, spr], [x1 - PW / 2, bot], [x1, bot], [x1, top], [x0, top]]; }
      const g = extrude(pts, DW - 1.4); g.translate(0, 0, zv - (DW - 1.4) / 2);   // x along viaduct, z across
      stoneP.push({ g, m: new THREE.Matrix4(), c: new THREE.Color(0xd4d0c4) });
      if (big) { track.addObstacle(x0, zv, 2.6, roadY - 4, deck); track.addObstacle(x1, zv, 2.6, roadY - 4, deck); }
    }
    const x0 = piers[0], x1 = piers[piers.length - 1], len = x1 - x0, mid = (x0 + x1) / 2;
    stoneP.push(sbox(len, 1.2, DW, mat(mid, deck - 0.4, zv), 0xc2beb2));                       // deck slab
    stoneP.push(sbox(len, 0.9, 0.7, mat(mid, deck + 0.65, zv - DW / 2 + 0.35), 0xd0ccc0), sbox(len, 0.9, 0.7, mat(mid, deck + 0.65, zv + DW / 2 - 0.35), 0xd0ccc0));  // parapets
    for (let x = x0; x <= x1; x += 4.65) stoneP.push(sbox(0.8, 0.5, 0.95, mat(x, deck + 1.28, zv - DW / 2 + 0.35), 0xe0dcd0), sbox(0.8, 0.5, 0.95, mat(x, deck + 1.28, zv + DW / 2 - 0.35), 0xe0dcd0));
    plain.push(part(new THREE.BoxGeometry(len, 0.35, DW - 1.6), mat(mid, deck + 0.38, zv), 0x4a4640));          // ballast
    for (const dz of [-0.72, 0.72]) plain.push(part(new THREE.BoxGeometry(len, 0.16, 0.12), mat(mid, deck + 0.7, zv + dz), 0x7a6a5a));   // rails
    for (let x = x0 + 0.4; x < x1; x += 0.95) plain.push(part(new THREE.BoxGeometry(0.28, 0.12, 2.0), mat(x, deck + 0.6, zv), 0x3a2a1c));  // sleepers
    // cutting mouths at each end (dark portal + embankment block)
    group.add(new THREE.Mesh(own(bake(stoneP)), stoneMat)); group.add(new THREE.Mesh(own(bake(plain)), plainMat));
    H.viaduct = { deck, x0, x1 };
    // steam train (green engine + maroon coaches) crossing west -> east
    const train = new THREE.Group(), tp = [], coachGeo = [];
    const loco = [
      part(new THREE.CylinderGeometry(1.0, 1.0, 5.2, 12), mat(0, 1.9, 0, 1, 1, 1, 0, 0, Math.PI / 2), 0x1f4d36),
      part(new THREE.BoxGeometry(2.4, 2.6, 2.5), mat(-3.4, 2.4, 0), 0x1f4d36), part(new THREE.BoxGeometry(2.7, 0.2, 2.8), mat(-3.4, 3.8, 0), 0x2a2a2e),
      part(new THREE.CylinderGeometry(0.34, 0.5, 1.5, 8), mat(2.0, 3.4, 0), 0x1a1a1c), part(new THREE.CylinderGeometry(0.55, 0.4, 0.4, 8), mat(2.0, 4.2, 0), 0xc8a030),
      part(new THREE.SphereGeometry(0.5, 8, 6), mat(0.4, 3.1, 0), 0xc8a030), part(new THREE.BoxGeometry(2.0, 0.6, 2.2), mat(-0.2, 0.95, 0), 0x2a2a2e),
      part(new THREE.BoxGeometry(2.6, 1.6, 2.4), mat(-6.4, 1.6, 0), 0x1a1a1c), part(new THREE.BoxGeometry(2.4, 0.6, 2.2), mat(-6.4, 2.6, 0), 0x2a2a2e),
    ];
    for (const x of [-1.4, 0.6, 2.4]) for (const z of [-1.05, 1.05]) loco.push(part(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 12), mat(x, 0.75, z, 1, 1, 1, Math.PI / 2, 0, 0), 0xb3202a));
    tp.push(...loco);
    for (let c = 0; c < 4; c++) {
      const ox = -10.4 - c * 8.6;
      tp.push(part(new THREE.BoxGeometry(8.0, 2.6, 2.5), mat(ox, 2.0, 0), 0x7a1c24), part(new THREE.BoxGeometry(8.1, 0.7, 2.6), mat(ox, 2.7, 0), 0xe8dcc0), part(new THREE.BoxGeometry(8.1, 0.12, 2.6), mat(ox, 3.2, 0), 0x2a2a2e), part(new THREE.BoxGeometry(7.2, 0.9, 2.55), mat(ox, 2.4, 0), 0x2a3646));
      for (const bx of [-2.6, 2.6]) for (const z of [-0.95, 0.95]) tp.push(part(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 10), mat(ox + bx, 0.5, z, 1, 1, 1, Math.PI / 2, 0, 0), 0x1a1a1c));
    }
    const trainMat = own(new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: [new THREE.Plane(new THREE.Vector3(1, 0, 0), -(x0 + 0.5)), new THREE.Plane(new THREE.Vector3(-1, 0, 0), x1 - 0.5)] }));
    const trainMesh = new THREE.Mesh(own(bake(tp)), trainMat); trainMesh.frustumCulled = false; trainMesh.onBeforeRender = (r) => { r.localClippingEnabled = true; };
    train.add(trainMesh); train.name = "steam-train"; group.add(train);
    // steam puffs
    const puffG = own(new THREE.SphereGeometry(1, 7, 5)), puffM = own(new THREE.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.6, depthWrite: false }));
    const puffs = new THREE.InstancedMesh(puffG, puffM, 18); puffs.frustumCulled = false; group.add(puffs);
    const dm = new THREE.Matrix4(), PER = 44;
    anim.push((dt, t) => {
      const ph = (t % PER) / PER, px = x0 - 80 + ph * (len + 220);   // front of the loco
      train.position.set(px, deck + 0.6, zv); train.rotation.y = 0; train.scale.x = 1;
      train.visible = px > x0 && px - 52 < x1;
      for (let i = 0; i < 18; i++) { const age = ((t * 0.8 + i / 18) % 1); const sc = 0.5 + age * 2.4; dm.makeScale(sc, sc, sc); dm.setPosition(px + 2 - age * 14, deck + 5 + age * 6, zv + Math.sin(i * 7.1) * 0.6); puffs.setMatrixAt(i, dm); }
      puffs.visible = train.visible; puffs.instanceMatrix.needsUpdate = true;
    });
  }

  // ================================================================= COTTAGES (whitewashed, slate roof, smoking chimney)
  {
    const cp = [
      part(new THREE.BoxGeometry(7.4, 3.4, 5.2), mat(0, 1.7, 0), 0xf0ece0),
      part(new THREE.BoxGeometry(7.4, 0.5, 5.2), mat(0, 0.25, 0), 0x8f8b80),
      part(new THREE.BoxGeometry(8.2, 0.3, 3.7), mat(0, 4.45, -1.5, 1, 1, 1, 0.62, 0, 0), 0x4a5058), part(new THREE.BoxGeometry(8.2, 0.3, 3.7), mat(0, 4.45, 1.5, 1, 1, 1, -0.62, 0, 0), 0x424850),
      part(new THREE.BoxGeometry(8.0, 0.18, 0.5), mat(0, 5.52, 0), 0x333840),
      part(new THREE.BoxGeometry(0.9, 2.6, 0.9), mat(2.7, 5.1, 0), 0xcfc8b8), part(new THREE.BoxGeometry(1.15, 0.25, 1.15), mat(2.7, 6.5, 0), 0x8a8478),
      part(new THREE.BoxGeometry(1.1, 2.1, 0.14), mat(-1.0, 1.05, 2.64), 0x3a2a1c), part(new THREE.BoxGeometry(1.0, 1.0, 0.14), mat(1.6, 2.0, 2.64), 0xffe0a0), part(new THREE.BoxGeometry(1.0, 1.0, 0.14), mat(-2.8, 2.0, 2.64), 0xffe0a0),
      part(new THREE.BoxGeometry(1.0, 1.0, 0.14), mat(2.7, 2.0, 2.64), 0xffe0a0), part(new THREE.BoxGeometry(1.0, 1.0, 0.14), mat(0, 2.0, -2.64), 0x2a2a30),
      part(new THREE.BoxGeometry(2.4, 1.1, 1.0), mat(4.8, 0.55, 1.2), 0x4a3426),   // peat stack
    ];
    const cgeo = bake(cp), cots = [];
    const spots = scatterSpots(14, 17, 60, (x, z) => lochR(x, z) > 1.3 && burnQuery(x, z).d > 14 && !(Math.abs(z - VIADUCT.z) < 22 && x > 60 && x < 260) && !(z > 360 && x > 180 && x < 430) && gyOK(x, z));
    for (const p of spots) { const l = track.locate({ x: p.x, z: p.z }), sp = track.sample(l.s); cots.push({ x: p.x, z: p.z, ry: Math.atan2(sp.tangent.x, sp.tangent.z) + (l.lateral > 0 ? -Math.PI / 2 : Math.PI / 2) + R(-0.25, 0.25), sx: R(0.95, 1.15), c: pick([0xffffff, 0xf4f0e6, 0xece6d6]) }); }
    instanced(cgeo, lam({ vertexColors: true }), cots, "cottages"); blobShadows(cots, 4.5);
    for (const c of cots) track.addObstacle(c.x, c.z, 4.0, -50, 200);
    // chimney smoke
    const sg = own(new THREE.SphereGeometry(1, 6, 4)), sm = own(new THREE.MeshBasicMaterial({ color: 0xdadde0, transparent: true, opacity: 0.5, depthWrite: false }));
    const smoke = new THREE.InstancedMesh(sg, sm, Math.max(1, cots.length * 4)); smoke.frustumCulled = false; group.add(smoke);
    const m4 = new THREE.Matrix4();
    anim.push((dt, t) => {
      let n = 0;
      for (const c of cots) {
        const cs = Math.cos(c.ry), sn = Math.sin(c.ry), cxp = c.x + (2.7 * cs) * c.sx, czp = c.z - 2.7 * sn * c.sx, base = gy(c.x, c.z) + 6.8 * c.sx;
        for (let k = 0; k < 4; k++) { const age = (t * 0.22 + k / 4 + (c.x % 1)) % 1, r = 0.35 + age * 1.3; m4.makeScale(r, r, r); m4.setPosition(cxp + age * 5, base + age * 7, czp + age * 1.5); smoke.setMatrixAt(n++, m4); }
      }
      smoke.instanceMatrix.needsUpdate = true;
    });
  }
  function gyOK(x, z) { return true; }
  function scatterSpots(count, minD, maxD, filter) { return K.scatter(count, wallDist + minD, wallDist + maxD, { filter, sep: 40 }); }

  // ================================================================= DISTILLERY (north of the start straight)
  {
    const s0 = 214, side = -1, base = at(s0, side * (wallDist + 34));
    const g = new THREE.Group(); g.position.set(base.x, gy(base.x, base.z), base.z); g.rotation.y = base.h + (side < 0 ? 0 : Math.PI); g.name = "distillery";
    const wh = [], stone = [];
    // front (road-facing) is local -x for the left side; build with local x toward the road on the right: we place buildings along local z
    const wall = 0xf2eee2, slate = 0x3c424a;
    const warehouse = (z, len, hgt) => { wh.push(part(new THREE.BoxGeometry(14, hgt, len), mat(0, hgt / 2, z), wall)); wh.push(part(new THREE.BoxGeometry(8.9, 0.35, len + 1.2), mat(-3.75, hgt + 2.4, z, 1, 1, 1, 0, 0, 0.58), slate)); wh.push(part(new THREE.BoxGeometry(8.9, 0.35, len + 1.2), mat(3.75, hgt + 2.4, z, 1, 1, 1, 0, 0, -0.58), slate)); for (let k = 0; k < Math.floor(len / 7); k++) { wh.push(part(new THREE.BoxGeometry(0.2, 2.4, 2.4), mat(-7.05, 2.8, z - len / 2 + 4 + k * 7), 0x2a2a30)); } };
    warehouse(-18, 26, 6.5); warehouse(14, 24, 7.5);
    // kiln with pagoda roof
    wh.push(part(new THREE.BoxGeometry(8, 9, 8), mat(0, 4.5, 38), wall));
    [[7.2, 3.0, 9.5, 0], [5.0, 2.4, 12.2, 0], [2.6, 2.0, 14.4, 0]].forEach(([r, h, y]) => wh.push(part(new THREE.ConeGeometry(r, h, 4), mat(0, y + 0.6, 38, 1, 1, 1, 0, Math.PI / 4, 0), slate)));
    wh.push(part(new THREE.BoxGeometry(1.4, 1.6, 1.4), mat(0, 17.6, 38), 0x2a2a30), part(new THREE.ConeGeometry(1.4, 1.6, 4), mat(0, 19, 38, 1, 1, 1, 0, Math.PI / 4, 0), slate));
    // chimney stack
    wh.push(part(new THREE.CylinderGeometry(0.9, 1.4, 20, 8), mat(10, 10, 14), 0xb5714a));
    // still house: open front with three copper stills
    const sh = new THREE.Group(); sh.position.set(-3, 0, -44); sh.rotation.y = -Math.PI / 2;
    const shp = [part(new THREE.BoxGeometry(12, 7, 0.6), mat(0, 3.5, -5), wall), part(new THREE.BoxGeometry(0.6, 7, 10), mat(-6, 3.5, 0), wall), part(new THREE.BoxGeometry(0.6, 7, 10), mat(6, 3.5, 0), wall), part(new THREE.BoxGeometry(13.5, 0.4, 6.5), mat(0, 8.4, -2.5, 1, 1, 1, 0.42, 0, 0), slate), part(new THREE.BoxGeometry(13.5, 0.4, 6.5), mat(0, 8.4, 2.5, 1, 1, 1, -0.42, 0, 0), slate), part(new THREE.BoxGeometry(11.6, 0.3, 9.6), mat(0, 0.15, 0), 0x6a6a64)];
    sh.add(new THREE.Mesh(own(bake(shp)), plainMat));
    const cu = [];
    for (const x of [-3.6, 0, 3.6]) {
      cu.push(part(new THREE.SphereGeometry(1.55, 14, 10), mat(x, 1.9, -0.5, 1, 1.05, 1), 0xffffff));
      cu.push(part(new THREE.CylinderGeometry(0.5, 1.0, 2.0, 10), mat(x, 4.1, -0.5), 0xffffff));
      cu.push(part(new THREE.CylinderGeometry(0.2, 0.48, 1.7, 8), mat(x, 5.6, -0.5), 0xffffff));
      cu.push(part(new THREE.CylinderGeometry(0.2, 0.2, 2.8, 8), mat(x + 0.4, 6.3, -1.4, 1, 1, 1, Math.PI / 2 - 0.1, 0, 0), 0xffffff));
    }
    sh.add(new THREE.Mesh(own(bake(cu)), copperMat));
    const warm = new THREE.Mesh(own(new THREE.PlaneGeometry(10, 5)), own(new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0.22, depthWrite: false })));
    warm.position.set(0, 3.2, 4.8); sh.add(warm);
    g.add(sh);
    g.add(new THREE.Mesh(own(bake(wh)), plainMat));
    // barrels (instanced)
    const bar = [], bg = new THREE.CylinderGeometry(0.62, 0.55, 1.1, 10); bg.translate(0, 0.55, 0);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 14 - r * 2; k++) bar.push({ x: 0, y: 0 });
    void bar;
    const barrelParts = [];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 10 - r * 2; k++) barrelParts.push(part(new THREE.CylinderGeometry(0.62, 0.55, 1.1, 10), mat(-10 + k * 1.3 + r * 0.65, 0.55 + r * 1.05, 28), r % 2 ? 0x7a5230 : 0x8a6038));
    for (let r = 0; r < 3; r++) for (let k = 0; k < 8 - r * 2; k++) barrelParts.push(part(new THREE.CylinderGeometry(0.62, 0.55, 1.1, 10), mat(10.5 - k * 0.0, 0.55 + r * 1.05, -2 + k * 1.3 + r * 0.65 - 20), r % 2 ? 0x7a5230 : 0x8a6038));
    g.add(new THREE.Mesh(own(bake(barrelParts)), plainMat));
    // sign on the road-facing gable of the front warehouse
    {
      const c = document.createElement("canvas"); c.width = 1024; c.height = 256; const cg = c.getContext("2d");
      cg.fillStyle = "#16365f"; cg.fillRect(0, 0, 1024, 256); cg.strokeStyle = "#e8c860"; cg.lineWidth = 8; cg.strokeRect(10, 10, 1004, 236);
      cg.fillStyle = "#f4dc8a"; cg.textAlign = "center"; cg.textBaseline = "middle"; cg.font = "900 120px Georgia, serif"; cg.fillText("GLEN FIDDLY", 512, 100);
      cg.font = "italic 50px Georgia, serif"; cg.fillStyle = "#ffffff"; cg.fillText("Distillery. Est. 1823 (probably). Visitors welcome.", 512, 188);
      const sgn = new THREE.Mesh(own(new THREE.PlaneGeometry(13.2, 3.3)), own(new THREE.MeshBasicMaterial({ map: own(toTexture(c, false)) })));
      sgn.position.set(-7.08, 4.6, 14); sgn.rotation.y = -Math.PI / 2; g.add(sgn);
      const sg2 = sgn.clone(); sg2.position.set(-7.08, 4.2, -18); g.add(sg2);
    }
    group.add(g);
    track.addObstacle(base.x, base.z, 1, -50, 100);
    // smoke from chimney + kiln
    const sm = new THREE.InstancedMesh(own(new THREE.SphereGeometry(1, 6, 4)), own(new THREE.MeshBasicMaterial({ color: 0xcfd3d8, transparent: true, opacity: 0.45, depthWrite: false })), 14); sm.frustumCulled = false; group.add(sm);
    const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
    anim.push((dt, t) => { for (let i = 0; i < 14; i++) { const age = (t * 0.12 + i / 14) % 1, r = 0.8 + age * 3.2; v.set(i < 7 ? 10 : 0, 20.2 + age * 12, i < 7 ? 14 : 38).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position); m4.makeScale(r, r, r); m4.setPosition(v.x + age * 6, v.y + (i >= 7 ? -3 : 0), v.z); sm.setMatrixAt(i, m4); } sm.instanceMatrix.needsUpdate = true; });
  }

  // ================================================================= STANDING STONES (ring on the moor between the two straights) + a menhir by the loch
  {
    const ring = new THREE.Vector3(-14, 0, 52), sp = [], N = 11;
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU, r = 11 + R(-0.6, 0.6), x = ring.x + Math.cos(a) * r, z = ring.z + Math.sin(a) * r, h = R(2.2, 4.4);
      sp.push({ x, z, y: -0.4, ry: rng() * 6, rx: R(-0.1, 0.1), rz: R(-0.1, 0.1), sx: R(1.0, 1.5), sy: h, sz: R(0.6, 1.0), c: pick([0x9a9a94, 0x86877f, 0xaaa89c, 0x7a7c76]) });
    }
    const sg = new THREE.CylinderGeometry(0.55, 0.85, 1, 5); sg.translate(0, 0.5, 0);
    sp.push({ x: ring.x, z: ring.z, y: -0.3, ry: 0.4, rz: 1.45, sx: 1.2, sy: 3.4, sz: 1.2, c: 0x8a8a84 });
    instanced(sg, lam({ flatShading: true }), sp, "standing-stones");
    const ms = [{ x: 400, z: 232, y: -0.4, ry: 0.5, sx: 1.4, sy: 5.2, sz: 0.9, c: 0x8d8d86 }, { x: 405, z: 121, y: -0.4, ry: 1.2, sx: 1.2, sy: 3.8, sz: 0.8, c: 0x7f8079 }];
    instanced(sg, lam({ flatShading: true }), ms, "menhirs");
  }

  // ================================================================= flags around the start line + on poles
  {
    const gs = X.grandstand, pts = [];
    for (let k = 0; k < 3; k++) pts.push([-20 + k * 14, -gs.side * (wallDist + 3.2)]);
    for (let k = 0; k < 3; k++) pts.push([18 + k * 16, gs.side * (wallDist + 3.5)]);
    pts.forEach(([s, lat], i) => { const p = at(s, lat), y = gy(p.x, p.z); addFlag(i % 2 ? "saltire" : "lion", p.x, y + 9.4, p.z, p.h + Math.PI / 2 + (lat * gs.side < 0 ? 0 : 0), 5, 9.4); });
    // flag poles along the loch-side stretch and at the viaduct
    for (const s of [520, 600, 680, 1590, 2050]) { const p = at(s, (s % 2 ? 1 : -1) * (wallDist + 3.6)); addFlag(s % 20 ? "saltire" : "lion", p.x, gy(p.x, p.z) + 8.6, p.z, p.h + Math.PI / 2, 4.6, 8.6); }
    if (flagPoleParts.length) group.add(new THREE.Mesh(own(bake(flagPoleParts)), plainMat));
  }
}
