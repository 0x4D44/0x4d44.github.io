// Apex Karts - Christmas: decorated firs with twinkling lights (little ones on the walls, giants on the bends), present piles,
// snowmen in Santa hats, candy canes, reindeer with glowing noses, light strings along the walls, falling snow and a dusting on
// the ground, a candy-striped and garlanded start gantry, and Santa's sleigh crossing the sky. Everything is non-solid.
import * as THREE from "three";
import { TAU } from "./season-kit.js";

export function build(Z) {
  const { X, K, rng, R, pick, P, L, group, anim, onDeck, part, mat } = Z;
  const { own } = X, bake = Z.bakeAll, sin = Math.sin, cos = Math.cos;
  const RED = 0xd62839, GOLD = 0xffd23a, GREEN = 0x1f8a4c, SNOW = 0xf3f8ff, BROWN = 0x5a3a1e, COAL = 0x15121c, ANTLER = 0xd9c9a0;
  const BAUBLE = [0xe63946, 0xffc83d, 0x3a7bd5, 0xe8f0f8, 0xc94bd6];
  const LIGHTS = [0xff3b3b, 0x3bff6a, 0xffd23a, 0x3b9bff, 0xffffff];
  const FIR = [0x1d5a30, 0x23683a, 0x1d5a30, 0x2a7444];

  // ------------------------------------------------------------------ geometry
  // A fir about 4.7 tall standing on y = 0, widest ~3.1. The full one has baubles, a trunk and a star; the mini one (wall tops) is plainer.
  const TIERS = { full: [[1.55, 1.5, 0.55], [1.25, 1.38, 1.5], [0.95, 1.26, 2.45], [0.65, 1.14, 3.4]], mini: [[1.6, 1.9, 0.5], [1.15, 1.7, 1.95], [0.65, 1.45, 3.2]] };
  const treeGeo = (full) => {
    const parts = [], seg = full ? 8 : 6;
    if (full) parts.push(P.cyl(0.2, 0.28, 0.8, 0, 0.4, 0, BROWN, { seg: 5 }));
    TIERS[full ? "full" : "mini"].forEach(([r, h, y], k) => {
      parts.push(P.cone(r, h, 0, y + h / 2, 0, FIR[k], { seg }), P.cone(r * 0.52, h * 0.5, 0, y + h * 0.75, 0, SNOW, { seg }));
      if (full) for (let j = 0; j < 2; j++) { const a = (k * 2 + j) * 2.4, f = 0.32, rr = r * (1 - f) * 1.02; parts.push(P.sph(0.12, cos(a) * rr, y + f * h, sin(a) * rr, BAUBLE[(k * 2 + j) % 5], { w: 5, h: 3 })); }
    });
    for (const ry of full ? [0, Math.PI / 2] : [0]) for (const rz of [0, Math.PI / 4]) parts.push(part(new THREE.OctahedronGeometry(0.3, 0), mat(0, 4.7, 0, 1.15, 1.15, 0.45, 0, ry, rz), GOLD));
    return bake(parts);
  };
  const treeFull = treeGeo(true), treeMini = treeGeo(false);
  // fairy lights spiralling down a full tree (scale 1, before rotation)
  const treeLights = [];
  for (let j = 0; j < 14; j++) { const t = j / 13, y = 0.95 + t * 3.1, rr = 1.45 * (1 - (y - 0.55) / 4.05) + 0.12; treeLights.push([cos(j * 2.4) * rr, y, sin(j * 2.4) * rr]); }

  // a wrapped present: box, cross ribbon, bow
  const gift = (x, y0, z, w, h, d, box, rib, ry = 0) => [
    P.box(w, h, d, x, y0 + h / 2, z, box, { ry }), P.box(w * 0.18, h + 0.03, d + 0.03, x, y0 + h / 2, z, rib, { ry }), P.box(w + 0.03, h + 0.03, d * 0.18, x, y0 + h / 2, z, rib, { ry }),
    P.box(w * 0.34, 0.12, 0.12, x, y0 + h + 0.06, z, rib, { ry: ry + 0.8 }),
  ];
  const pileG = bake([...gift(0, 0, 0, 0.9, 0.7, 0.9, RED, GOLD, 0.1), ...gift(0.98, 0, 0.25, 0.7, 0.55, 0.7, GREEN, RED, 0.5), ...gift(0.04, 0.7, 0.02, 0.55, 0.45, 0.55, 0x2f6fd6, 0xe8f0f8, -0.5), ...gift(-0.85, 0, 0.3, 0.42, 0.9, 0.42, 0x8b4bd6, GOLD, 0.2)]);
  const miniPile = bake([...gift(0, 0, 0, 0.9, 0.7, 0.9, RED, GOLD, 0.2), ...gift(0.85, 0, 0.1, 0.6, 0.5, 0.6, GREEN, RED, 0.6)]);

  // snowman with a Santa hat, scarf, carrot nose and twig arms
  const snowmanG = bake([
    P.sph(0.64, 0, 0.56, 0, SNOW, { w: 9, h: 6 }), P.sph(0.46, 0, 1.38, 0, SNOW, { w: 8, h: 6 }), P.sph(0.33, 0, 1.98, 0, SNOW, { w: 8, h: 5 }),
    P.cone(0.28, 0.66, 0.06, 2.6, 0, RED, { seg: 8, rz: 0.3 }), P.cyl(0.34, 0.34, 0.12, 0, 2.3, 0, SNOW, { seg: 8 }), P.sph(0.09, -0.04, 2.93, 0, SNOW, { w: 5, h: 4 }),
    P.cone(0.05, 0.32, 0, 1.96, 0.4, 0xff8a1a, { rx: Math.PI / 2, seg: 5 }), P.sph(0.04, -0.12, 2.06, 0.3, COAL, { w: 4, h: 3 }), P.sph(0.04, 0.12, 2.06, 0.3, COAL, { w: 4, h: 3 }),
    P.sph(0.045, 0, 1.55, 0.44, COAL, { w: 4, h: 3 }), P.sph(0.045, 0, 1.38, 0.46, COAL, { w: 4, h: 3 }), P.sph(0.045, 0, 1.21, 0.45, COAL, { w: 4, h: 3 }),
    P.cyl(0.3, 0.35, 0.2, 0, 1.75, 0, RED, { seg: 8 }), P.box(0.16, 0.5, 0.06, 0.2, 1.5, 0.33, RED, { rz: 0.12 }),
    P.seg([0.4, 1.5, 0], [1.05, 1.95, 0], 0.035, BROWN, { seg: 4 }), P.seg([-0.4, 1.5, 0], [-1.05, 1.95, 0], 0.035, BROWN, { seg: 4 }),
    P.seg([0.85, 1.8, 0], [1.05, 2.15, 0], 0.025, BROWN, { seg: 4 }), P.seg([-0.85, 1.8, 0], [-1.05, 2.15, 0], 0.025, BROWN, { seg: 4 }),
  ]);

  // candy cane: striped shaft (stands on y = 0) and a half-turn hook curving towards -x
  const caneG = (() => {
    const parts = [], Rr = 0.38, H = 2.1;
    for (let k = 0; k < 6; k++) parts.push(P.cyl(0.08, 0.08, 0.355, 0, 0.175 + k * 0.35, 0, k % 2 ? 0xfff6f6 : 0xd62839, { seg: 5, open: true }));
    for (let j = 0; j < 6; j++) parts.push(P.tor(Rr, 0.08, -Rr, H, 0, j % 2 ? 0xd62839 : 0xfff6f6, { arc: Math.PI / 6 + 0.02, rz: (j * Math.PI) / 6, seg: 2, tseg: 4 }));
    return bake(parts);
  })();

  // reindeer (front = +z): the red nose is a separate glow light
  const reindeerG = bake([
    P.box(0.7, 0.75, 1.5, 0, 1.2, 0, 0x8a5a2e), P.box(0.5, 0.3, 0.9, 0, 0.88, 0.2, 0xe9dcc8),
    P.box(0.34, 0.8, 0.34, 0, 1.75, 0.72, 0x8a5a2e, { rx: 0.45 }), P.box(0.34, 0.36, 0.56, 0, 2.2, 1.0, 0x8a5a2e, { rx: 0.15 }), P.box(0.26, 0.24, 0.3, 0, 2.1, 1.3, 0xe9dcc8),
    P.sph(0.095, 0, 2.1, 1.47, 0xe5202a, { w: 5, h: 4 }), P.sph(0.04, -0.14, 2.3, 1.17, COAL, { w: 4, h: 3 }), P.sph(0.04, 0.14, 2.3, 1.17, COAL, { w: 4, h: 3 }),
    P.cone(0.07, 0.25, -0.2, 2.45, 0.9, 0x8a5a2e, { seg: 4, rz: 0.7 }), P.cone(0.07, 0.25, 0.2, 2.45, 0.9, 0x8a5a2e, { seg: 4, rz: -0.7 }),
    ...[-1, 1].flatMap((sd) => [P.seg([sd * 0.12, 2.4, 0.9], [sd * 0.42, 3.1, 0.75], 0.04, ANTLER, { seg: 4 }), P.seg([sd * 0.3, 2.85, 0.8], [sd * 0.62, 3.0, 1.0], 0.03, ANTLER, { seg: 4 }), P.seg([sd * 0.36, 2.98, 0.77], [sd * 0.58, 3.45, 0.7], 0.03, ANTLER, { seg: 4 })]),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([a, b2]) => [P.cyl(0.075, 0.06, 0.82, a * 0.24, 0.41, b2 * 0.55, 0x7a4e26, { seg: 5 }), P.cyl(0.08, 0.08, 0.1, a * 0.24, 0.05, b2 * 0.55, 0x201812, { seg: 5 })]),
    P.sph(0.12, 0, 1.45, -0.8, SNOW, { w: 5, h: 4 }), P.sph(0.09, 0, 1.15, 0.86, GOLD, { w: 4, h: 3 }),
  ]);

  const shadows = [], fairy = [];
  const rd = (n) => Math.round(n);
  const trees = [], minis = [];
  // a full tree plus its fairy lights (rotated and scaled like the instance)
  const addTree = (x, y, z, s, ry, lights = true) => {
    trees.push({ x, y, z, sx: s, ry });
    if (!lights) return;
    const cr = cos(ry), sr = sin(ry);
    treeLights.forEach((t, j) => fairy.push({ x: x + (t[0] * cr + t[2] * sr) * s, y: y + t[1] * s, z: z + (-t[0] * sr + t[2] * cr) * s, c: LIGHTS[(j + trees.length) % 5], sz: 0.13 * Math.max(0.8, s * 0.7), ph: R(0, 1) + j * 0.13 }));
  };

  // ------------------------------------------------------------------ trees: wall tops, verge, giants
  const pilesW = [];
  Z.wallTop(15).forEach((w, i) => {
    if (i % 3 === 2) { pilesW.push({ x: w.x, y: w.y - 0.02, z: w.z, ry: w.ry + R(-0.5, 0.5), sx: R(0.66, 0.84) }); return; }
    const s = R(0.5, 0.64);
    minis.push({ x: w.x, y: w.y - 0.02, z: w.z, sx: s, ry: R(0, TAU) });
    fairy.push({ x: w.x, y: w.y + 4.7 * s + 0.05, z: w.z, c: GOLD, sz: 0.26, ph: R(0, 1) });
    if (i % 2 === 0) for (let j = 1; j < treeLights.length; j += 3) { const t = treeLights[j]; fairy.push({ x: w.x + t[0] * s, y: w.y + t[1] * s, z: w.z + t[2] * s, c: LIGHTS[(j + i) % 5], sz: 0.1, ph: R(0, 1) }); }
  });
  for (const p of Z.sample({ n: rd(L / 42), off: [1.8, 7], r: 2.1, h: 5.5 })) {
    const s = R(0.8, 1.4); addTree(p.x, p.y - 0.05, p.z, s, R(0, TAU), true);
    if (!onDeck) shadows.push({ x: p.x, z: p.z, sx: 2.2 * s });
  }
  const nGiant = Math.max(2, Math.min(4, rd(L / 650)));
  let giants = onDeck ? Z.airSpot({ n: nGiant, dist: [26, 55], dy: [-4, 8], r: 8 }) : Z.sample({ n: nGiant, off: [8, 11.5], r: 5, h: 15, bend: "outside", minCurv: 0.005, big: true, bigSep: 190, tries: 160 });
  if (giants.length < 2 && !onDeck) giants = giants.concat(Z.sample({ n: 2 - giants.length, off: [8, 11.5], r: 5, h: 15, big: true, bigSep: 190, tries: 160 }));
  giants.forEach((g) => {
    const s = R(2.6, 3.1), y = g.y - 0.1;
    trees.push({ x: g.x, y, z: g.z, sx: s, ry: R(0, TAU) });
    for (let j = 0; j < 34; j++) { const t = j / 33, yy = 1.0 + t * 3.0, rr = (1.45 * (1 - (yy - 0.55) / 4.05) + 0.2) * s, a = j * 2.4; fairy.push({ x: g.x + cos(a) * rr, y: y + yy * s, z: g.z + sin(a) * rr, c: LIGHTS[j % 5], sz: 0.34, ph: R(0, 1) + j * 0.11 }); }
    fairy.push({ x: g.x, y: y + 4.75 * s, z: g.z, c: 0xffe27a, sz: 1.6, ph: 0 });
    if (!onDeck) shadows.push({ x: g.x, z: g.z, sx: s * 2.6 });
    // a ring of presents round the foot of each giant
    const ring = []; for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + R(-0.2, 0.2), d = R(3.0, 3.8) * (s / 2.8) * 1.4, x = g.x + cos(a) * d, z = g.z + sin(a) * d; if (!onDeck && Z.occ.blocked(x, z, 0.8, y + 0.2, y + 1.3)) continue; ring.push({ x, y: onDeck ? y : X.groundY(x, z) - 0.03, z, ry: R(0, TAU), sx: R(1.0, 1.5) }); }
    Z.inst(pileG, Z.matV, ring, "giant-presents");
  });
  Z.inst(treeFull, Z.matV, trees, "trees");
  Z.inst(treeMini, Z.matV, minis, "mini-trees");

  // ------------------------------------------------------------------ presents, snowmen, canes, reindeer
  {
    const ps = Z.sample({ n: rd(L / 40), off: [1.7, 6], r: 1.5, h: 1.3 });
    Z.inst(pileG, Z.matV, ps.map((p) => ({ x: p.x, y: p.y - 0.03, z: p.z, ry: p.ry + R(-0.6, 0.6), sx: R(0.8, 1.3) })), "presents");
    Z.inst(miniPile, Z.matV, pilesW, "wall-presents");
    if (!onDeck) ps.forEach((p) => shadows.push({ x: p.x, z: p.z, sx: 1.4 }));

    const sm = Z.sample({ n: Math.max(4, rd(L / 150)), off: [2.4, 6.5], r: 1.1, h: 3.1 });
    Z.inst(snowmanG, Z.matV, sm.map((p) => ({ x: p.x, y: p.y - 0.05, z: p.z, ry: p.ry + R(-0.5, 0.5), sx: R(0.95, 1.35) })), "snowmen");
    if (!onDeck) sm.forEach((p) => shadows.push({ x: p.x, z: p.z, sx: 1.1 }));

    // candy canes: a guard of honour either side of the start straight, then scattered along the lap
    const canes = [];
    if (!onDeck) for (let k = 0; k < 8; k++) for (const sd of [-1, 1]) {
      const s = 22 + k * 12, a = K.at(s, sd * (Z.wallDist + 0.55 + 1.25)), i = rd(s / Z.ds) % Z.N, y = Z.check(a.x, a.z, i, 0.4, 2.6);
      if (y === null) continue;
      Z.occ.mark(a.x, a.z, 0.4, y, y + 2.6); canes.push({ x: a.x, y: y - 0.02, z: a.z, ry: Z.facing(a, sd), sx: 1.0 + 0.1 * (k % 3) });
    }
    for (const p of Z.sample({ n: rd(L / 70), off: [1.5, 5], r: 0.5, h: 2.8 })) canes.push({ x: p.x, y: p.y - 0.02, z: p.z, ry: p.ry, sx: R(0.9, 1.5) });
    Z.inst(caneG, Z.matV, canes, "candy-canes");

    const rs = Z.sample({ n: Math.max(4, rd(L / 210)), off: [2.8, 7], r: 1.4, h: 3.5 });
    const deer = rs.map((p) => ({ x: p.x, y: p.y - 0.04, z: p.z, ry: p.ry + R(-0.5, 0.5), sx: R(1.0, 1.3) }));
    Z.inst(reindeerG, Z.matV, deer, "reindeer");
    deer.forEach((d) => { fairy.push({ x: d.x + sin(d.ry) * 1.47 * d.sx, y: d.y + 2.1 * d.sx, z: d.z + cos(d.ry) * 1.47 * d.sx, c: 0xff2a2a, sz: 0.34, ph: 0 }); if (!onDeck) shadows.push({ x: d.x, z: d.z, sx: 1.5 }); });
  }

  // ------------------------------------------------------------------ light strings along both walls, tree lights
  {
    const w = Z.wallTop(2.7, { both: true, jitter: 0 });
    Z.glow(w.map((q, i) => ({ x: q.x, y: q.y + 0.1, z: q.z, c: LIGHTS[i % 5], sz: 0.17, ph: i * 0.9 })), { blink: 1, max: 12, name: "wall-lights" });
    Z.glow(fairy, { blink: 1, max: 20, name: "tree-lights" });
  }

  // ------------------------------------------------------------------ start gantry: candy-striped pillars, garland swags, bows, wreaths
  {
    const g = Z.gantry(), span = g.userData.span, gp = [], lights = [];
    const bow = (x, y, z, sd, sc = 1) => [P.cone(0.26 * sc, 0.6 * sc, x - 0.3 * sc, y, z, RED, { seg: 4, rz: 1.35 }), P.cone(0.26 * sc, 0.6 * sc, x + 0.3 * sc, y, z, RED, { seg: 4, rz: -1.35 }), P.sph(0.13 * sc, x, y, z, 0xa5192a, { w: 5, h: 3 }),
      P.box(0.13 * sc, 0.8 * sc, 0.05, x - 0.1 * sc, y - 0.5 * sc, z + sd * 0.04, RED, { rz: 0.18 }), P.box(0.13 * sc, 0.8 * sc, 0.05, x + 0.1 * sc, y - 0.5 * sc, z + sd * 0.04, RED, { rz: -0.18 })];
    for (const sx of [-span, span]) for (let k = 0; k < 14; k++) gp.push(P.box(1.62, 0.62, 1.62, sx, 0.9 + k * 0.7, 0, k % 2 ? 0xfff6f6 : 0xd62839));
    const xs = [-span + 0.4, -span * 0.5, 0, span * 0.5, span - 0.4];
    for (const z of [-0.84, 0.84]) {
      const sd = Math.sign(z);
      for (let j = 0; j < 4; j++) for (let i = 0; i <= 9; i++) {
        const t = i / 9, x = xs[j] + (xs[j + 1] - xs[j]) * t, y = 11.0 - 0.7 * 4 * t * (1 - t);
        gp.push(P.sph(0.3, x, y, z, FIR[(i + j) % 4], { w: 5, h: 3, y: 0.85 }));
        if (i < 9 && i % 2 === 0) lights.push({ x, y: y + 0.05, z: z + sd * 0.3, c: LIGHTS[(i + j * 2) % 5] });
      }
      for (const x of xs) gp.push(...bow(x, 11.0, z * 1.08, sd, 1.05));
      for (const sx of [-span, span]) {
        gp.push(P.tor(0.55, 0.2, sx, 6.0, z * 1.02, 0x1d5a30, { seg: 10, tseg: 5 }), ...bow(sx, 5.35, z * 1.1, sd));
        for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; gp.push(P.sph(0.09, sx + cos(a) * 0.55, 6.0 + sin(a) * 0.55, z * 1.08, BAUBLE[k % 5], { w: 4, h: 3 })); }
      }
    }
    Z.mesh(bake(gp), Z.matV, "gantry-garland", g);
    const gpnt = (x, y, z) => { const c = cos(g.rotation.y), s = sin(g.rotation.y); return { x: g.position.x + x * c + z * s, y: g.position.y + y, z: g.position.z - x * s + z * c }; };
    Z.glow(lights.map((l, i) => ({ ...gpnt(l.x, l.y, l.z), c: l.c, sz: 0.22, ph: i * 0.37 })), { blink: 1, max: 14, name: "gantry-lights" });
  }

  // ------------------------------------------------------------------ Santa's sleigh across the sky
  {
    const f = new THREE.Group(); f.name = "sleigh";
    const RN = 0xc4202f;
    Z.mesh(bake([
      P.box(1.3, 0.75, 2.7, 0, 0.95, 0, RN), P.box(1.36, 0.18, 2.76, 0, 1.36, 0, GOLD), P.box(1.3, 1.0, 0.32, 0, 1.55, -1.25, RN), P.box(1.0, 0.1, 1.5, 0, 0.55, 0, 0x7a2a1a),
      P.box(0.12, 0.12, 3.5, -0.58, 0.2, 0.1, GOLD), P.box(0.12, 0.12, 3.5, 0.58, 0.2, 0.1, GOLD), P.box(0.1, 0.4, 0.1, -0.58, 0.45, 0.8, GOLD), P.box(0.1, 0.4, 0.1, 0.58, 0.45, 0.8, GOLD), P.box(0.1, 0.4, 0.1, -0.58, 0.45, -0.7, GOLD), P.box(0.1, 0.4, 0.1, 0.58, 0.45, -0.7, GOLD),
      P.cone(0.42, 1.0, 0, 1.95, -0.35, RED, { seg: 8 }), P.sph(0.23, 0, 2.62, -0.3, 0xf2c9a0, { w: 7, h: 5 }), P.sph(0.26, 0, 2.42, -0.15, SNOW, { w: 7, h: 5 }),
      P.cone(0.24, 0.62, 0.02, 3.0, -0.4, RED, { seg: 8, rz: 0.25 }), P.cyl(0.25, 0.25, 0.1, 0, 2.8, -0.3, SNOW, { seg: 8 }), P.sph(0.09, -0.1, 3.3, -0.4, SNOW, { w: 5, h: 4 }),
      P.sph(0.6, 0, 1.55, -1.0, 0x7a5230, { y: 1.1, w: 8, h: 6 }), P.box(0.5, 0.5, 0.5, -0.3, 1.5, 0.8, 0x2f6fd6), P.box(0.4, 0.4, 0.4, 0.3, 1.45, 0.95, GREEN), P.box(0.52, 0.06, 0.06, -0.3, 1.5, 0.8, GOLD),
      P.seg([-0.58, 0.9, 1.4], [-0.85, 1.2, 3.8], 0.025, ANTLER, { seg: 3 }), P.seg([0.58, 0.9, 1.4], [0.85, 1.2, 3.8], 0.025, ANTLER, { seg: 3 }),
      P.seg([-0.85, 1.2, 3.8], [-0.85, 1.2, 9.8], 0.025, ANTLER, { seg: 3 }), P.seg([0.85, 1.2, 3.8], [0.85, 1.2, 9.8], 0.025, ANTLER, { seg: 3 }),
    ]), Z.matVD, "sleigh-body", f);
    Z.count(reindeerG, 6);
    for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) { const m = new THREE.Mesh(reindeerG, Z.matV); m.position.set(sd * 0.85, 0.2 + k * 0.15, 3.8 + k * 3.0); m.rotation.x = -0.1; m.scale.setScalar(0.9); f.add(m); }
    const sp = []; for (let i = 0; i < 40; i++) { const k = i / 40; sp.push({ x: R(-0.5, 0.5) * (1 + k * 3), y: 0.3 + R(-0.4, 0.4), z: -1.8 - k * 12, c: pick([0xffffff, 0xffe27a, 0xa8d8ff]), sz: 0.3 * (1 - k * 0.5), ph: R(0, 1) }); }
    sp.push({ x: 0, y: 2.4, z: 11.1, c: 0xff2a2a, sz: 0.55, ph: 0 });
    Z.glow(sp, { parent: f, blink: 1, max: 28, name: "sleigh-sparkles" });
    f.scale.setScalar(3.0);
    Z.flyer(f, { y: onDeck ? 42 : 92, speed: 0.04, dir: -1, bob: 3 });
  }

  // ------------------------------------------------------------------ weather: snow in the air and a dusting on the ground
  {
    const drizzle = group.getObjectByName("drizzle"); if (drizzle) drizzle.visible = false;
    if (!Z.indoor) {
      if (!group.getObjectByName("snowfall")) Z.snowfall({ count: onDeck ? 700 : 1400 });
      if (!onDeck && Z.theme !== "snow") Z.snowGround(Z.theme === "canyon" ? 0.55 : 0.85);
    }
  }
  if (shadows.length) Z.shadows(shadows, 1);
}
