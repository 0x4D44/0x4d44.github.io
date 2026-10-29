// Highland Fling - vegetation, rocks, mountains, livestock (coos + sheep), dry-stone dykes.
import * as THREE from "three";
import { TAU, LOCH, lochR, burnQuery, VIADUCT, S, vnoise } from "./highland-geo.js";

export function buildNature(H) {
  const { track, X, K, rng } = H;
  const { C, group, nearest, bake, mat, part, wallDist, own, anim } = X;
  const { instanced, blobShadows, scatter, lam, pick, R, at } = K;
  const L = track.length, b = track.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const gy = X.groundY;
  const castleZone = (x, z) => Math.hypot(x - 300, z - 430) < 135 && z > 360;
  const free = (x, z, pad = 0) => lochR(x, z) > 1.22 + pad * 0.004 && burnQuery(x, z).d > 9 && !(Math.abs(z - VIADUCT.z) < 14 && x > VIADUCT.x0 - 10 && x < VIADUCT.x1 + 10) && !castleZone(x, z);
  const onSide = (s, side, off) => at(s, side * (wallDist + off));

  // ---------- Scots pines
  const pp = [part(new THREE.CylinderGeometry(0.22, 0.38, 7.5, 6), mat(0, 3.75, 0), 0x7b4a2d)];
  [[0, 7.4, 0, 2.6, 1.3], [1.6, 6.6, 0.5, 1.9, 1.0], [-1.5, 8.4, -0.4, 2.1, 1.0], [0.4, 9.2, 0.8, 1.5, 0.9]].forEach(([x, y, z, r, sy], k) => pp.push(part(new THREE.SphereGeometry(r, 7, 5), mat(x, y, z, 1, sy * 0.6, 1), k % 2 ? 0x34522f : 0x2b4628)));
  pp.push(part(new THREE.CylinderGeometry(0.1, 0.14, 2.2, 5), mat(1.0, 6.0, 0.3, 1, 1, 1, 0, 0, -0.8), 0x7b4a2d));
  const pineGeo = bake(pp);
  // ---------- spruce / fir plantations
  const fp = [part(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 5), mat(0, 0.8, 0), 0x4a3320)];
  [3.0, 2.4, 1.8, 1.2].forEach((r, k) => fp.push(part(new THREE.ConeGeometry(r, 2.8, 7), mat(0, 2.3 + k * 1.75, 0), k % 2 ? 0x1f4a33 : 0x1a3f2c)));
  const firGeo = bake(fp);
  // ---------- birches
  const bp = [part(new THREE.CylinderGeometry(0.12, 0.2, 5.4, 5), mat(0, 2.7, 0), 0xe8e4da)];
  [[0, 5.4, 0, 1.5], [1.0, 4.6, 0.4, 1.1], [-0.9, 4.2, -0.5, 1.2], [0.2, 6.3, 0.2, 1.0]].forEach(([x, y, z, r]) => bp.push(part(new THREE.SphereGeometry(r, 6, 5), mat(x, y, z, 1, 0.8, 1), 0xffffff)));
  const birchGeo = bake(bp);

  const pines = [], firs = [], birches = [];
  const treeOK = (x, z, off = 4) => nearest(x, z) > wallDist + off && free(x, z) && !X.underDeck(x, z, gy(x, z));
  for (let s = 10; s < L; s += 14 + rng() * 14) for (const side of [-1, 1]) {
    if (rng() < 0.4) continue;
    const a = onSide(s, side, R(6, 22));
    if (!treeOK(a.x, a.z)) continue;
    const k = rng();
    if (k < 0.45) pines.push({ x: a.x, z: a.z, ry: rng() * 6, sx: R(0.9, 1.45), c: pick([0xffffff, 0xe6f0e0, 0xd9e6d0]) });
    else if (k < 0.75) birches.push({ x: a.x, z: a.z, ry: rng() * 6, sx: R(0.9, 1.5), c: pick([0xd8e06a, 0xffffff, 0xe8c85a, 0xb8d070, 0xe89a40]) });
    else firs.push({ x: a.x, z: a.z, ry: rng() * 6, sx: R(0.9, 1.5), sy: R(0.9, 1.6), c: pick([0xffffff, 0xd8e8d8]) });
  }
  // forestry plantations (dense stands on the hillsides) + scattered wild trees
  for (let k = 0; k < 9; k++) {
    const seed = scatter(1, wallDist + 28, 200, { filter: (x, z) => free(x, z, 30) })[0]; if (!seed) continue;
    for (let i = 0; i < 26; i++) { const x = seed.x + R(-22, 22), z = seed.z + R(-22, 22); if (treeOK(x, z, 14)) firs.push({ x, z, ry: rng() * 6, sx: R(0.9, 1.6), sy: R(1.0, 1.8) }); }
  }
  for (const p of scatter(150, wallDist + 10, 330, { filter: (x, z) => free(x, z, 10), sep: 7 })) { const k = rng(); (k < 0.4 ? pines : k < 0.7 ? birches : firs).push({ x: p.x, z: p.z, ry: rng() * 6, sx: R(0.9, 1.6), sy: R(0.9, 1.5) }); }
  instanced(pineGeo, lam({ vertexColors: true }), pines, "pines"); blobShadows(pines, 2.8);
  instanced(firGeo, lam({ vertexColors: true }), firs, "firs"); blobShadows(firs, 2.4);
  instanced(birchGeo, lam({ vertexColors: true }), birches, "birches"); blobShadows(birches, 1.8);

  // ---------- heather, gorse, bracken, boulders
  const heatherG = new THREE.IcosahedronGeometry(1, 0); heatherG.scale(1, 0.5, 1);
  const heather = [];
  const hc = [0x7a4f8c, 0x8b5fa0, 0x6a4478, 0x9a6aa8, 0x5f4a82, 0x84508a];
  for (let s = 0; s < L; s += 6) for (const side of [-1, 1]) {
    const n = vnoise(s / 38 + side * 9, side * 5);
    if (n < 0.42) continue;
    for (let k = 0; k < 2; k++) { const a = onSide(s + R(-2, 2), side, R(3.2, 26)); if (nearest(a.x, a.z) > wallDist + 2.2 && free(a.x, a.z) && !X.underDeck(a.x, a.z, gy(a.x, a.z))) heather.push({ x: a.x, z: a.z, y: -0.1, ry: rng() * 6, sx: R(0.9, 2.2), sy: R(0.8, 1.3), c: pick(hc) }); }
  }
  for (const p of scatter(300, wallDist + 6, 260, { filter: (x, z) => free(x, z) && vnoise(x / 60, z / 60) > 0.45 })) heather.push({ x: p.x, z: p.z, y: -0.1, ry: rng() * 6, sx: R(1.2, 3.4), sy: R(0.8, 1.3), c: pick(hc) });
  instanced(heatherG, lam({}), heather, "heather");

  const gorseG = bake([part(new THREE.SphereGeometry(1, 6, 5), mat(0, 0.6, 0, 1, 0.7, 1), 0x5e7d28), ...[0, 1, 2, 3, 4, 5, 6].map((i) => part(new THREE.SphereGeometry(0.16, 4, 3), mat(Math.cos(i * 2.4) * 0.7, 1.0 + (i % 3) * 0.12, Math.sin(i * 2.4) * 0.7), 0xf3d412))]);
  const gorse = [];
  for (let s = 6; s < L; s += 17 + rng() * 22) { const side = rng() < 0.5 ? -1 : 1, a = onSide(s, side, R(3, 16)); if (nearest(a.x, a.z) > wallDist + 2.2 && free(a.x, a.z) && !X.underDeck(a.x, a.z, gy(a.x, a.z))) gorse.push({ x: a.x, z: a.z, ry: rng() * 6, sx: R(0.9, 1.7) }); }
  for (const p of scatter(70, wallDist + 8, 240, { filter: (x, z) => free(x, z) })) gorse.push({ x: p.x, z: p.z, ry: rng() * 6, sx: R(0.9, 1.9) });
  instanced(gorseG, lam({ vertexColors: true }), gorse, "gorse");

  const bracken = [];
  const brG = new THREE.ConeGeometry(1.6, 1.3, 6); brG.translate(0, 0.65, 0);
  for (const p of scatter(260, wallDist + 3, 200, { filter: (x, z) => free(x, z) && vnoise(x / 50 + 40, z / 50) > 0.5 })) bracken.push({ x: p.x, z: p.z, ry: rng() * 6, sx: R(0.9, 2.0), sy: R(0.5, 0.9), c: pick([0x6f7f33, 0x8a7a34, 0x9a6a2c, 0x5f7a30]) });
  instanced(brG, lam({}), bracken, "bracken");

  const rockG = new THREE.DodecahedronGeometry(1, 0), pebG = new THREE.TetrahedronGeometry(1, 0);
  const rocks = scatter(150, wallDist + 3, 260, { filter: (x, z) => lochR(x, z) > 1.0 && burnQuery(x, z).d > 5 && !(Math.abs(z - VIADUCT.z) < 12 && x > VIADUCT.x0 - 8 && x < VIADUCT.x1 + 8) && !castleZone(x, z) })
    .map((p) => ({ x: p.x, z: p.z, y: -0.2, sx: R(0.8, 3.2), sy: R(0.7, 2.2), sz: R(0.8, 3), ry: rng() * 6, rx: R(-0.3, 0.3), c: pick([0x8a8a86, 0x75766f, 0x9b9a92, 0x6c6e6a, 0x8d8576]) }));
  instanced(rockG, lam({ flatShading: true }), rocks, "rocks"); blobShadows(rocks, 1.4);
  // loch-shore pebbles
  const peb = [];
  for (let i = 0; i < 140; i++) { const a = rng() * TAU, r = R(1.0, 1.1), x = LOCH.x + Math.cos(a) * LOCH.rx * r, z = LOCH.z + Math.sin(a) * LOCH.rz * r; if (nearest(x, z) < wallDist + 4) continue; peb.push({ x, z, y: -0.1, sx: R(0.3, 1.0), sy: R(0.2, 0.5), sz: R(0.3, 1.0), ry: rng() * 6, c: pick([0x8b8a84, 0x6f706a, 0xa09c90]) }); }
  instanced(pebG, lam({ flatShading: true }), peb, "pebbles");

  // ---------- dry-stone dykes along parts of the verge (beyond the barrier)
  const dykeG = new THREE.BoxGeometry(2.8, 1.15, 0.8); dykeG.translate(0, 0.57, 0);
  const dykes = [];
  const spans = [[150, 330, 1], [330, 470, -1], [1160, 1330, 1], [1560, 1700, -1], [2000, 2150, 1], [2200, 2330, -1], [60, 130, -1], [610, 740, -1]];
  for (const [a0, a1, side] of spans) for (let s = a0; s < a1; s += 2.6) {
    const a = onSide(s, side, 8.4); if (!treeOK(a.x, a.z, 6) || nearest(a.x, a.z) < wallDist + 7) continue;
    dykes.push({ x: a.x, z: a.z, ry: a.h + R(-0.05, 0.05), sx: R(0.95, 1.1), sy: R(0.9, 1.2), c: pick([0x8d8b84, 0x7c7b74, 0x9a978b, 0x6f6e68]) });
  }
  instanced(dykeG, lam({ flatShading: true }), dykes, "dykes");

  // ---------- Highland coos (shaggy orange cattle) and sheep
  const GING = 0xc4631f, DARK = 0x6a3a1a, CREAM = 0xf0e4c4;
  const cooParts = [
    part(new THREE.SphereGeometry(0.8, 9, 7), mat(0, 1.05, 0, 0.78, 0.74, 1.3), GING),
    part(new THREE.BoxGeometry(1.35, 0.7, 1.9), mat(0, 0.62, 0), GING),
    part(new THREE.SphereGeometry(0.5, 7, 6), mat(0, 1.2, 1.15, 0.9, 1, 0.9), GING),
    part(new THREE.BoxGeometry(0.42, 0.5, 0.62), mat(0, 0.95, 1.7, 1, 1, 1, 0.35, 0, 0), 0xe8c8a0),
    part(new THREE.SphereGeometry(0.4, 7, 5), mat(0, 1.45, 1.5, 1.35, 0.8, 1.0), DARK),           // shaggy forelock
    part(new THREE.SphereGeometry(0.1, 5, 4), mat(0.17, 0.95, 2.0), 0x1a1210), part(new THREE.SphereGeometry(0.1, 5, 4), mat(-0.17, 0.95, 2.0), 0x1a1210),
    part(new THREE.CylinderGeometry(0.05, 0.03, 0.9, 4), mat(0, 0.9, -1.15, 1, 1, 1, 0.25, 0, 0), DARK),
    part(new THREE.SphereGeometry(0.17, 5, 4), mat(0, 0.42, -1.3), DARK),
  ];
  for (const sx of [-1, 1]) {
    cooParts.push(part(new THREE.CylinderGeometry(0.06, 0.1, 0.95, 5), mat(sx * 0.58, 1.62, 1.5, 1, 1, 1, 0, 0, -sx * 1.15), CREAM));
    cooParts.push(part(new THREE.ConeGeometry(0.075, 0.55, 5), mat(sx * 1.0, 2.0, 1.5, 1, 1, 1, 0, 0, -sx * 0.1), CREAM));
    for (const fz of [0.7, -0.7]) cooParts.push(part(new THREE.CylinderGeometry(0.14, 0.12, 0.5, 5), mat(sx * 0.42, 0.25, fz), 0x2a1a12));
  }
  const cooGeo = bake(cooParts);
  const coos = [];
  const cooTints = [0xffffff, 0xffffff, 0xe8d0a8, 0x8f6f58, 0xffd9b0];
  // verge coos: on the grass strip INSIDE the barrier, with colliders
  const vergeCoo = [[118, 1], [244, -1], [352, 1], [655, -1], [1180, 1], [1285, -1], [1560, 1], [2060, -1], [2110, 1], [2330, -1]];
  vergeCoo.forEach(([s, side], i) => {
    const lat = side * (X.hw + 1.3 + 2.6), a = at(s, lat);
    coos.push({ x: a.x, z: a.z, y: a.y - gy(a.x, a.z) + 0.02, ry: a.h + (side > 0 ? -1 : 1) * R(1.1, 2.0) + (rng() < 0.5 ? Math.PI : 0), sx: R(0.95, 1.1), c: cooTints[i % cooTints.length], abs: false });
    track.addObstacle(a.x, a.z, 1.15, a.y - 1.5, a.y + 2.4);
    track.addObstacle(a.x + a.rx * 0.0 + Math.sin(a.h) * (rng() - 0.5) * 0.4, a.z + Math.cos(a.h) * 0.5, 0.9, a.y - 1.5, a.y + 2.4);
  });
  // field herds beyond the barrier
  for (let k = 0; k < 8; k++) {
    const sd = scatter(1, wallDist + 12, 150, { filter: (x, z) => free(x, z, 10) && Math.hypot(x - LOCH.x, z - LOCH.z) > 30 })[0]; if (!sd) continue;
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) { const x = sd.x + R(-7, 7), z = sd.z + R(-7, 7); if (free(x, z) && nearest(x, z) > wallDist + 5) coos.push({ x, z, ry: rng() * 6, sx: R(0.9, 1.15), c: pick(cooTints) }); }
  }
  // the coo-sign herd by the start straight, just past the barrier
  [[200, -1], [212, -1], [224, -1]].forEach(([s, side], i) => { const a = onSide(s, side, 5 + i * 1.5); coos.push({ x: a.x, z: a.z, ry: a.h + R(-0.6, 0.6) + Math.PI / 2 * side, sx: 1.05, c: cooTints[i] }); });
  // instanced() places y at groundY unless abs; verge coos keep y offset relative to ground
  instanced(cooGeo, lam({ vertexColors: true }), coos, "coos"); blobShadows(coos, 1.3);

  const sheepGeo = bake([
    part(new THREE.SphereGeometry(0.62, 7, 6), mat(0, 0.75, 0, 0.8, 0.8, 1.15), 0xe9e5d8),
    part(new THREE.SphereGeometry(0.3, 6, 5), mat(0.28, 0.78, 0.2), 0xf4f0e4), part(new THREE.SphereGeometry(0.3, 6, 5), mat(-0.28, 0.82, -0.25), 0xf4f0e4),
    part(new THREE.SphereGeometry(0.2, 6, 5), mat(0, 0.95, 0.85, 0.9, 1, 1.2), 0x2c2723),
    part(new THREE.BoxGeometry(0.12, 0.05, 0.2), mat(0.2, 1.08, 0.78, 1, 1, 1, 0, 0, 0.5), 0x2c2723), part(new THREE.BoxGeometry(0.12, 0.05, 0.2), mat(-0.2, 1.08, 0.78, 1, 1, 1, 0, 0, -0.5), 0x2c2723),
    ...[[0.25, 0.5], [-0.25, 0.5], [0.25, -0.5], [-0.25, -0.5]].map(([x, z]) => part(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 4), mat(x, 0.25, z), 0x2c2723)),
  ]);
  const sheep = [];
  const sheepTints = [0xffffff, 0xffffff, 0xece4d0, 0xd8d0c0, 0xa89a88];
  for (let k = 0; k < 16; k++) {
    const sd = scatter(1, wallDist + 6, 200, { filter: (x, z) => free(x, z, 8) })[0]; if (!sd) continue;
    const n = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) { const x = sd.x + R(-9, 9), z = sd.z + R(-9, 9); if (free(x, z) && nearest(x, z) > wallDist + 4) sheep.push({ x, z, ry: rng() * 6, sx: R(0.9, 1.15), c: pick(sheepTints) }); }
  }
  // sheep that have wandered onto the verge
  [[330, 1], [1000, -1], [1700, 1], [2250, 1]].forEach(([s, side], i) => {
    const a = at(s, side * (X.hw + 1.3 + 2.4)); sheep.push({ x: a.x, z: a.z, y: a.y - gy(a.x, a.z) + 0.02, ry: a.h + R(0.5, 2.5), sx: 1.1, c: sheepTints[i % 3] });
    track.addObstacle(a.x, a.z, 0.85, a.y - 1.5, a.y + 1.5);
  });
  instanced(sheepGeo, lam({ vertexColors: true }), sheep, "sheep"); blobShadows(sheep, 0.9);
  H.counts = { pines: pines.length, firs: firs.length, birches: birches.length, heather: heather.length, coos: coos.length, sheep: sheep.length };

  // ---------- big mountains (munros): heather -> scree -> a dusting of snow on the tallest
  const mgeo = new THREE.ConeGeometry(1, 1, 9, 7, true).translate(0, 0.5, 0);
  { const pa = mgeo.attributes.position, cl = new Float32Array(pa.count * 3), lo = new THREE.Color(0x4d5a38), mid = new THREE.Color(0x6e5a78), hi = new THREE.Color(0x7d7b84), sn = new THREE.Color(0xe4e8ee), t = new THREE.Color();
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i), j = 0.09 * Math.sin(i * 12.9898) * (1 - y) + 0.05 * Math.sin(i * 3.7) * y;
      pa.setXYZ(i, pa.getX(i) * (1 + j), y * (1 + 0.04 * Math.sin(i * 7.1)), pa.getZ(i) * (1 + j));
      t.copy(lo).lerp(mid, Math.min(1, y / 0.35)).lerp(hi, Math.min(1, Math.max(0, (y - 0.45) / 0.3))).lerp(sn, Math.min(1, Math.max(0, (y - 0.86) / 0.08)));
      cl[i * 3] = t.r; cl[i * 3 + 1] = t.g; cl[i * 3 + 2] = t.b;
    }
    mgeo.setAttribute("color", new THREE.BufferAttribute(cl, 3)); mgeo.computeVertexNormals(); }
  const minTrackDist = (x, z) => { let d = 1e9; for (let i = 0; i < C.N; i += 3) { const dd = Math.hypot(x - C.px[i], z - C.pz[i]); if (dd < d) d = dd; } return d; };
  const mts = [];
  for (let k = 0; k < 34; k++) {
    const a = (k / 34) * TAU + R(-0.07, 0.07), sx = R(110, 200), sy = R(150, 300), sz = sx * R(0.8, 1.2);
    for (let r = 420; r < 1150; r += 25) {
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (minTrackDist(x, z) > Math.max(sx, sz) * 1.1 + wallDist + 90) { mts.push({ x, z, y: -8, sx, sy, sz, ry: rng() * 6, c: pick([0xffffff, 0xf0eef4, 0xe0e0e8]) }); break; }
    }
  }
  X.mountains = mts;
  instanced(mgeo, lam({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), mts, "mountains");
  // low rounded hills closer in (rolling braes behind the fields)
  const hgeo = new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2);
  const hills = [];
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * TAU + R(-0.1, 0.1), sx = R(60, 120), sy = R(26, 55);
    for (let r = 300; r < 700; r += 20) { const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (minTrackDist(x, z) > sx * 1.0 + wallDist + 70) { hills.push({ x, z, y: -3, sx, sy, sz: sx * R(0.8, 1.3), ry: rng() * 6, c: pick([0x6a5d78, 0x58683c, 0x75687f, 0x6a7440, 0x7a6a6a]) }); break; } }
  }
  instanced(hgeo, lam({}), hills, "hills");
}

// Highland corners get black-wrapped silage bales instead of the generic tyre walls (cheaper too).
export function silageBales(H) {
  const { X, K, rng } = H, { group } = X, ty = group.getObjectByName("tyres");
  if (!ty) return;
  ty.visible = false;
  const g = new THREE.CylinderGeometry(0.62, 0.62, 1.25, 10); g.rotateZ(Math.PI / 2);
  const items = [], m = new THREE.Matrix4(), v = new THREE.Vector3();
  for (let i = 0; i < ty.count; i += 3) { ty.getMatrixAt(i, m); v.setFromMatrixPosition(m); const k = Math.floor(i / 3) % 7; items.push({ x: v.x, y: 0.05, z: v.z, abs: false, ry: rng() * 6, c: k < 4 ? 0x23262b : k < 6 ? 0x3a6a45 : 0xe4e6e8 }); }
  K.instanced(g, K.lam({}), items, "silage-bales");
  // second layer on every other stack
  K.instanced(g, K.lam({}), items.filter((_, i) => i % 3 === 0).map((b) => ({ ...b, y: 1.2, ry: b.ry + 1 })), "silage-bales-2");
}
