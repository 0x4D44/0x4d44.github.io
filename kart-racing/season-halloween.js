// Apex Karts - Halloween: jack-o'-lanterns (little ones on the walls, giants on the bends), graveyards, hay and scarecrows, bobbing
// ghosts, bats, a witch on a broomstick, a harvest moon and a spider over the start line. Everything is non-solid.
import * as THREE from "three";
import { pumpkinGeo, facePatch, faceAtlas, ghostGeo, triGeo, merge, TAU } from "./season-kit.js";

export function build(Z) {
  const { X, K, rng, R, pick, P, L, group, anim, onDeck, part, mat } = Z;
  const { own } = X, bake = Z.bakeAll;
  const sin = Math.sin, cos = Math.cos;

  // ------------------------------------------------------------------ geometry
  const pumpBig = pumpkinGeo(X, 12, 7), pumpSmall = pumpkinGeo(X, 8, 5);
  const faceTex = own(X.toTex(faceAtlas(X.canvas), { repeat: false }));
  const faceMat = K.basic({ map: faceTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const faceBig = [0, 1, 2, 3].map((c) => facePatch(c, 4, 8, 5)), faceSmall = [0, 1, 2, 3].map((c) => facePatch(c, 4, 5, 3));
  const pumpMat = K.lam({ vertexColors: true, emissive: 0x3a1600 });
  const TINT = [0xffffff, 0xffffff, 0xffe9d2, 0xffd8b0, 0xffc890, 0xfff3e2];
  const pumps = { big: [], small: [] }, faces = { big: [[], [], [], []], small: [[], [], [], []] }, shadows = [], halos = [], bats = [];
  const gy = (p, x, z) => (onDeck ? p.y : X.groundY(x, z) - 0.04);
  const addPump = (x, y, z, s, ry, face = true, o = {}) => {
    const sy = s * (o.tall ?? 1), k = s > 0.82 ? "big" : "small", it = { x, y, z, sx: s, sy, sz: s, ry, rz: o.rz || 0 };
    pumps[k].push({ ...it, c: o.c ?? pick(TINT) });
    if (face) faces[k][o.cell ?? Math.floor(rng() * 4)].push(it);
  };

  // ------------------------------------------------------------------ pumpkins: wall tops, verge patches, giants
  for (const w of Z.wallTop(15)) {
    const s = R(0.52, 0.74);
    addPump(w.x, w.y - 0.02, w.z, s, w.ry + R(-0.6, 0.6), rng() < 0.7);
    if (rng() < 0.25) addPump(w.x + w.rz * 0.9, w.y - 0.02, w.z - w.rx * 0.9, s * R(0.6, 0.8), w.ry + R(-1, 1), false);
  }
  for (const p of Z.sample({ n: Math.round(L / 46), off: [1.6, 6.5], r: 1.2, h: 1.7 })) {
    const m = 1 + Math.floor(rng() * 2), base = R(0.62, 1.1);
    for (let k = 0; k < m; k++) {
      const x = p.x + (k ? R(-1.1, 1.1) : 0), z = p.z + (k ? R(-1.1, 1.1) : 0), s = k ? base * R(0.5, 0.85) : base;
      addPump(x, gy(p, x, z), z, s, p.ry + R(-0.7, 0.7), k === 0 || rng() < 0.4);
    }
    if (!onDeck) shadows.push({ x: p.x, z: p.z, sx: 0.8 + base });
  }
  const nGiant = Math.max(2, Math.min(5, Math.round(L / 520)));
  let giants = onDeck ? Z.airSpot({ n: nGiant, dist: [26, 55], dy: [-5, 9], r: 6.5 }) : Z.sample({ n: nGiant, off: [8, 11], r: 5.4, h: 9, bend: "outside", minCurv: 0.005, big: true, bigSep: 160, tries: 160 });
  if (giants.length < 2 && !onDeck) giants = giants.concat(Z.sample({ n: 2 - giants.length, off: [8, 11], r: 5.4, h: 9, big: true, bigSep: 160, tries: 160 }));
  giants.forEach((g, i) => {
    const s = R(4.0, 5.0);
    addPump(g.x, g.y - 0.1 * s, g.z, s, g.ry + R(-0.15, 0.15), true, { cell: i % 4 });
    if (!onDeck) shadows.push({ x: g.x, z: g.z, sx: s * 1.15 });
    halos.push({ x: g.x + sin(g.ry) * s * 1.25, y: g.y + s * 0.85, z: g.z + cos(g.ry) * s * 1.25, c: 0xff8a1a, sz: s * 0.55, ph: i * 0.9 });
    for (let k = 0; k < 6; k++) bats.push({ cx: g.x, cy: g.y + s * 1.7 + R(1, 5), cz: g.z, R: R(s * 0.9, s * 1.7), w: R(0.7, 1.2) * (k % 2 ? -1 : 1), ph: R(0, TAU), bob: R(0.5, 1.2), s: R(1.3, 1.9) });
  });
  // a few small jack-o'-lantern groups round each giant so it does not stand alone
  giants.forEach((g, i) => {
    for (let k = 0; k < 5; k++) {
      const a = g.ry + Math.PI * R(-0.55, 0.55) + (k % 2 ? 0.4 : -0.4), d = R(5.2, 7.5), x = g.x + sin(a) * d, z = g.z + cos(a) * d;
      if (!onDeck && Z.occ.blocked(x, z, 0.8, g.y + 0.2, g.y + 1.6)) continue;
      addPump(x, gy(g, x, z), z, R(0.5, 0.9), a + R(-0.5, 0.5), rng() < 0.7, { cell: (i + k) % 4 });
    }
  });
  for (const k of ["big", "small"]) {
    const geo = k === "big" ? pumpBig : pumpSmall;
    if (pumps[k].length) Z.inst(geo, pumpMat, pumps[k], "pumpkins-" + k);
    faces[k].forEach((list, c) => { if (list.length) Z.inst(k === "big" ? faceBig[c] : faceSmall[c], faceMat, list, "pumpkin-faces-" + k + c); });
  }
  if (halos.length) Z.glow(halos, { blink: 0.35, max: 110, name: "season-halos" });

  // ------------------------------------------------------------------ graveyard corners
  {
    const slab = (x, z, w, h, hex, round = true) => [P.box(w, h, 0.24, x, h / 2, z, hex), round ? part(new THREE.SphereGeometry(w / 2, 8, 4, 0, TAU, 0, Math.PI / 2), mat(x, h, z, 1, 1, 0.5), hex) : null];
    const g = bake([
      P.sph(1.7, 0, -0.45, 0, 0x3b4a28, { y: 0.28, w: 10, h: 5 }),
      ...slab(-0.95, 0.15, 0.95, 1.15, 0x8e9199), ...slab(0.35, -0.15, 0.8, 0.85, 0x7d818b), ...slab(1.15, 0.5, 0.7, 0.6, 0x9a9da4),
      P.box(0.2, 1.7, 0.2, -0.1, 0.85, -0.85, 0x6f737c), P.box(0.85, 0.2, 0.2, -0.1, 1.25, -0.85, 0x6f737c),
      P.box(1.3, 0.12, 0.9, -0.95, 0.06, 0.55, 0x5f6470),
    ].filter(Boolean));
    const spots = Z.sample({ n: Math.round(L / 150), off: [2.6, 7], r: 1.9, h: 2 }), items = spots.map((p) => ({ x: p.x, y: p.y - 0.04, z: p.z, ry: p.ry + R(-0.35, 0.35), sx: R(0.85, 1.25), c: pick([0xffffff, 0xe6ece6, 0xd8d8e8]) }));
    Z.inst(g, Z.matV, items, "gravestones");
    if (!onDeck) spots.forEach((p) => shadows.push({ x: p.x, z: p.z, sx: 1.8 }));
  }

  // ------------------------------------------------------------------ hay bales and scarecrows
  {
    const bale = (x, y, z) => [P.cyl(0.55, 0.55, 0.95, x, y, z, 0xd9b44e, { rx: Math.PI / 2, seg: 9 }), P.cyl(0.565, 0.565, 0.07, x, y, z + 0.27, 0xa8822a, { rx: Math.PI / 2, seg: 9 }), P.cyl(0.565, 0.565, 0.07, x, y, z - 0.27, 0xa8822a, { rx: Math.PI / 2, seg: 9 })];
    const hay = bake([...bale(-0.58, 0.55, 0), ...bale(0.58, 0.55, 0.05), ...bale(0, 1.48, 0.0)]);
    const spots = Z.sample({ n: Math.round(L / 150), off: [2, 5.5], r: 1.5, h: 1.6 });
    Z.inst(hay, Z.matV, spots.map((p) => ({ x: p.x, y: p.y - 0.03, z: p.z, ry: p.ry + R(-0.5, 0.5), sx: R(0.85, 1.2) })), "hay");
    if (!onDeck) spots.forEach((p) => shadows.push({ x: p.x, z: p.z, sx: 1.6 }));

    const shirt = 0xb5403a, wood = 0x6b4a2b, straw = 0xe0c25a, denim = 0x3f5f8f, sack = 0xd9c08a;
    const tufts = [[-0.86, 1.7, 0], [0.86, 1.7, 0], [0, 1.95, 0.05], [-0.15, 0.95, 0.1], [0.15, 0.95, 0.1]].map(([x, y, z]) => part(new THREE.ConeGeometry(0.1, 0.34, 5), mat(x, y - 0.1, z, 1, 1, 1, 0, 0, x === 0 ? Math.PI : x < 0 ? 1.3 : -1.3), straw));
    const sc = bake([
      P.cyl(0.06, 0.07, 2.4, 0, 1.2, -0.02, wood), P.cyl(0.05, 0.05, 1.75, 0, 1.72, 0, wood, { rz: Math.PI / 2 }),
      P.box(0.74, 0.85, 0.32, 0, 1.45, 0, shirt), P.box(1.55, 0.3, 0.3, 0, 1.72, 0, shirt),
      P.box(0.28, 0.95, 0.28, -0.17, 0.62, 0.02, denim), P.box(0.28, 0.95, 0.28, 0.17, 0.62, 0.02, denim),
      P.sph(0.25, 0, 2.08, 0.02, sack, { w: 8, h: 6 }), P.sph(0.045, -0.095, 2.12, 0.23, 0x120c10, { w: 4, h: 3 }), P.sph(0.045, 0.095, 2.12, 0.23, 0x120c10, { w: 4, h: 3 }),
      P.cone(0.05, 0.17, 0, 2.05, 0.28, 0xff8a1a, { rx: Math.PI / 2, seg: 5 }),
      P.cyl(0.4, 0.4, 0.045, 0, 2.3, 0.02, 0x3a2c1f, { seg: 10 }), P.cone(0.23, 0.46, 0, 2.55, 0.02, 0x3a2c1f, { seg: 8, rx: -0.12 }), P.cyl(0.235, 0.235, 0.07, 0, 2.36, 0.02, 0xff7a1a, { seg: 8 }),
      ...tufts,
    ]);
    const sp = Z.sample({ n: Math.max(2, Math.round(L / 330)), off: [2.8, 6], r: 1.0, h: 3 });
    Z.inst(sc, Z.matV, sp.map((p) => ({ x: p.x, y: p.y - 0.05, z: p.z, ry: p.ry + R(-0.5, 0.5), rz: R(-0.06, 0.06), sx: R(0.95, 1.25) })), "scarecrows");
    if (!onDeck) sp.forEach((p) => shadows.push({ x: p.x, z: p.z, sx: 0.8 }));
  }

  // ------------------------------------------------------------------ ghosts: bob and sway at the verge
  {
    const spots = Z.sample({ n: Math.round(L / 180), off: [1.8, 9], r: 0.9, h: 3.4 });
    if (spots.length) {
      const geo = ghostGeo(X), mt = K.basic({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.93 });
      const gh = spots.map((p) => ({ ...p, s: R(1.1, 1.6), ph: R(0, TAU), h0: 1.2 + R(0, 1.3) }));
      const im = new THREE.InstancedMesh(own(geo), mt, gh.length); im.frustumCulled = false; im.name = "ghosts"; group.add(im);
      Z.stats.calls++; Z.stats.inst += gh.length; Z.stats.tris += (geo.attributes.position.count / 3) * gh.length;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      const upd = (t) => {
        gh.forEach((g, i) => {
          e.set(0, g.ry + sin(t * 0.7 + g.ph) * 0.4, sin(t * 1.3 + g.ph) * 0.1); q.setFromEuler(e);
          v.set(g.x + sin(t * 0.4 + g.ph) * 0.5, g.y + g.h0 + sin(t * 1.2 + g.ph) * 0.35, g.z); sc.setScalar(g.s);
          m4.compose(v, q, sc); im.setMatrixAt(i, m4);
        });
        im.instanceMatrix.needsUpdate = true;
      };
      upd(0); anim.push((dt, t) => upd(t));
    }
  }

  // ------------------------------------------------------------------ bats
  {
    const wing = (s) => [[[s * 0.06, 0.03, 0.1], [s * 0.64, 0.08, 0.02], [s * 0.34, 0.0, -0.24], 0x2b1d3b], [[s * 0.06, 0.03, 0.1], [s * 0.34, 0.0, -0.24], [s * 0.06, 0.0, -0.22], 0x35244a]];
    const body = bake([P.sph(0.11, 0, 0, 0.02, 0x16101f, { z: 1.5, w: 5, h: 4 }), P.cone(0.04, 0.12, -0.05, 0.12, 0.12, 0x16101f, { seg: 3 }), P.cone(0.04, 0.12, 0.05, 0.12, 0.12, 0x16101f, { seg: 3 })]);
    const geo = merge([body, triGeo([...wing(1), ...wing(-1)])]);
    for (let k = 0; k < Math.ceil(L / 800); k++) {   // a few more over the road
      const s = R(0.1, 0.9) * L, p = K.at(s, 0);
      for (let j = 0; j < 5; j++) bats.push({ cx: p.x, cy: p.y + R(10, 15), cz: p.z, R: R(5, 9), w: R(0.5, 0.9) * (j % 2 ? -1 : 1), ph: R(0, TAU), bob: R(0.6, 1.3), s: R(1.3, 1.8) });
    }
    { const g0 = K.at(0, 0); for (let j = 0; j < 7; j++) bats.push({ cx: g0.x, cy: g0.y + 15, cz: g0.z, R: R(6, 10), w: R(0.6, 1.0) * (j % 2 ? -1 : 1), ph: R(0, TAU), bob: 1, s: R(1.3, 1.8) }); }
    Z.swarm(geo, bats, { flap: 17, amp: 1.1, name: "bats" });
  }

  // ------------------------------------------------------------------ the witch: broomstick, cat and a trail of sparks
  {
    const robe = 0x3b1f5c, hat = 0x1d1230;
    const w = new THREE.Group(); w.name = "witch";
    const parts = [
      P.cyl(0.045, 0.045, 2.7, 0, 0, 0, 0x7a5230, { rx: Math.PI / 2 }), P.cone(0.27, 1.0, 0, 0, -1.8, 0xc9a24a, { rx: -Math.PI / 2, seg: 9 }), P.tor(0.07, 0.025, 0, 0, -1.25, 0x4a301a, { rx: 0, seg: 8 }),
      P.cone(0.34, 1.0, 0, 0.5, 0.15, robe, { seg: 8 }), P.cone(0.3, 1.0, 0, 0.5, -0.3, 0x2a1648, { rx: -1.15, seg: 8 }),
      P.sph(0.2, 0, 1.08, 0.2, 0x8fd16a, { w: 8, h: 6 }), P.cone(0.05, 0.16, 0, 1.06, 0.4, 0x7ec25a, { rx: Math.PI / 2, seg: 4 }),
      P.cyl(0.46, 0.46, 0.045, 0, 1.22, 0.2, hat, { seg: 10 }), P.cone(0.25, 0.8, 0, 1.64, 0.1, hat, { rx: -0.3, seg: 8 }), P.cyl(0.26, 0.26, 0.09, 0, 1.28, 0.2, 0xff7a1a, { seg: 8 }),
      P.seg([0.05, 0.85, 0.2], [0.03, 0.45, 0.9], 0.07, robe), P.seg([-0.05, 0.85, 0.2], [-0.03, 0.45, 0.6], 0.07, robe),
      P.seg([0.1, 0.2, 0.15], [0.14, -0.5, 0.45], 0.075, robe), P.seg([-0.1, 0.2, 0.15], [-0.14, -0.5, 0.2], 0.075, robe),
      P.sph(0.1, 0.14, -0.55, 0.52, 0x120c10, { z: 1.5, w: 5, h: 4 }), P.sph(0.1, -0.14, -0.55, 0.26, 0x120c10, { z: 1.5, w: 5, h: 4 }),
      // the black cat riding on the tail
      P.sph(0.2, 0, 0.22, -1.0, 0x15121c, { z: 1.4, w: 7, h: 5 }), P.sph(0.14, 0, 0.42, -0.72, 0x15121c, { w: 6, h: 5 }),
      P.cone(0.045, 0.14, -0.07, 0.56, -0.72, 0x15121c, { seg: 3 }), P.cone(0.045, 0.14, 0.07, 0.56, -0.72, 0x15121c, { seg: 3 }),
      P.tor(0.14, 0.03, 0, 0.35, -1.25, 0x15121c, { arc: Math.PI * 1.2, rz: 0.4, ry: 0, seg: 7 }),
      P.sph(0.03, -0.05, 0.44, -0.6, 0xffd23a, { w: 4, h: 3 }), P.sph(0.03, 0.05, 0.44, -0.6, 0xffd23a, { w: 4, h: 3 }),
    ];
    const body = new THREE.Mesh(own(bake(parts)), Z.matVD); w.add(body); w.scale.setScalar(3.2);
    const sparks = [], cols = [0xffa030, 0xff6a10, 0xffd060, 0xb04bff];
    for (let i = 0; i < 26; i++) { const k = i / 26; sparks.push({ x: R(-0.35, 0.35) * (1 + k * 2), y: R(-0.3, 0.4) + k * 0.3, z: -2.2 - k * 7, c: pick(cols), sz: 0.22 * (1 - k * 0.55), ph: R(0, 1) }); }
    Z.glow(sparks, { parent: w, blink: 1, max: 24, name: "witch-sparks" });
    Z.flyer(w, { y: onDeck ? 40 : 82, speed: 0.045, dir: 1, bob: 2.5 });
    Z.stats.calls += 1;
  }

  // ------------------------------------------------------------------ start gantry: jack-o'-lanterns along the beam, bunting, a dangling spider
  {
    const g = Z.gantry(), span = g.userData.span;
    const beamTop = 11.4, bigP = [], bigF = [[], [], [], []], N = 7;
    for (let i = 0; i < N; i++) {
      const x = -span + 1.6 + ((2 * span - 3.2) * i) / (N - 1), s = i === (N - 1) / 2 ? 1.5 : R(0.85, 1.15);
      bigP.push(Z.place(pumpBig, { x, y: beamTop - 0.05, z: 0, s, ry: R(-0.3, 0.3) }));
      for (const [ry, c] of [[0, i % 4], [Math.PI, (i + 2) % 4]]) bigF[c].push(Z.place(faceBig[c], { x, y: beamTop - 0.05, z: 0, s, ry }));
    }
    Z.mesh(merge(bigP), Z.matV, "gantry-pumpkins", g);
    bigF.forEach((l, c) => { if (l.length) Z.mesh(merge(l), faceMat, "gantry-faces" + c, g).renderOrder = 2; });
    const pn = Z.pennants();
    for (const z of [-1.3, 1.3]) pn.add([-span, 7.2, z], [span, 7.2, z], { n: 22, sag: 1.1, size: 0.55, pal: [0xff7a1a, 0x1a1325, 0x8b3dff, 0x1a1325] });
    pn.mesh(g, "gantry-bunting");
    // spider on a thread from the crossbar, bobbing up and down
    const spider = new THREE.Group(), SP = [];
    SP.push(P.sph(0.34, 0, 0, -0.18, 0x15121c, { w: 8, h: 6 }), P.sph(0.2, 0, 0, 0.2, 0x15121c, { w: 7, h: 5 }), P.sph(0.05, -0.07, 0.05, 0.38, 0xff2a2a, { w: 4, h: 3 }), P.sph(0.05, 0.07, 0.05, 0.38, 0xff2a2a, { w: 4, h: 3 }));
    SP.push(P.sph(0.1, 0, 0.06, -0.38, 0xff6a10, { y: 1.5, w: 5, h: 4 }));
    for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) {
      const z0 = 0.28 - k * 0.2, sw = (k - 1.5) * 0.18;
      SP.push(P.seg([sd * 0.15, 0.05, z0], [sd * 0.75, 0.55, z0 + sw], 0.03, 0x15121c, { seg: 4 }), P.seg([sd * 0.75, 0.55, z0 + sw], [sd * 1.2, -0.45, z0 + sw * 2.2], 0.025, 0x15121c, { seg: 4 }));
    }
    spider.add(new THREE.Mesh(own(bake(SP)), Z.matV));
    const thread = new THREE.Mesh(own(new THREE.CylinderGeometry(0.012, 0.012, 1, 3)), K.basic({ color: 0xdfe3ea }));
    spider.scale.setScalar(1.15); g.add(spider, thread); Z.stats.calls += 3;
    anim.push((dt, t) => { const drop = 1.7 + 1.5 * (0.5 + 0.5 * sin(t * 0.85)), top = 7.25; spider.position.set(1.4, top - drop - 0.3, -0.9); thread.position.set(1.4, top - drop / 2, -0.9); thread.scale.y = drop + 0.3; spider.rotation.y = sin(t * 0.6) * 0.5; });
    const gl = [];
    for (let i = 0; i < N; i++) { const x = -span + 1.6 + ((2 * span - 3.2) * i) / (N - 1); for (const z of [-1.2, 1.2]) gl.push({ ...gantryPoint(g, x, beamTop + 0.9, z), c: 0xff8a1a, sz: 0.5, ph: i * 0.7 + z }); }
    Z.glow(gl, { blink: 0.4, max: 48, name: "gantry-glow" });
  }

  // ------------------------------------------------------------------ the harvest moon
  if (!onDeck) {
    const sd = new THREE.Vector3(...X.theme.sun.dir).normalize(), hz = Math.hypot(sd.x, sd.z) || 1, el = 0.34;
    const dx = (-sd.x / hz) * cos(el), dz = (-sd.z / hz) * cos(el), dy = sin(el);
    Z.debug.moon = [dx, dy, dz];
    Z.paintSky((g, W, H, project) => {
      const [px, py] = project(dx, dy, dz), r = 44;
      for (const ox of [-W, 0, W]) {
        const x = px + ox; if (x < -200 || x > W + 200) continue;
        g.save(); g.translate(x, py); g.scale(1 / cos(el), 1); g.translate(-x, -py);   // the dome squeezes the canvas sideways by cos(elevation)
        const gl = g.createRadialGradient(x, py, r * 0.6, x, py, r * 4.2); gl.addColorStop(0, "rgba(255,170,70,0.5)"); gl.addColorStop(0.35, "rgba(255,140,50,0.16)"); gl.addColorStop(1, "rgba(255,120,40,0)");
        g.fillStyle = gl; g.fillRect(x - r * 4.2, py - r * 4.2, r * 8.4, r * 8.4);
        const d = g.createRadialGradient(x - r * 0.25, py - r * 0.25, r * 0.1, x, py, r); d.addColorStop(0, "#ffd49a"); d.addColorStop(0.7, "#ffa349"); d.addColorStop(1, "#f08a30");
        g.fillStyle = d; g.beginPath(); g.arc(x, py, r, 0, TAU); g.fill();
        g.fillStyle = "rgba(190,90,30,0.28)";
        for (const [cx, cy, cr] of [[-0.35, -0.2, 0.2], [0.3, 0.15, 0.26], [-0.1, 0.45, 0.14], [0.45, -0.35, 0.12], [-0.5, 0.2, 0.1]]) { g.beginPath(); g.arc(x + cx * r, py + cy * r, cr * r, 0, TAU); g.fill(); }
        g.fillStyle = "#1a0f1f";   // bats crossing the moon
        for (const [bx, by, bs] of [[-0.25, -0.2, 0.34], [0.2, -0.45, 0.24], [0.45, 0.05, 0.2]]) {
          const cx = x + bx * r, cy = py + by * r, s = bs * r; g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx - s * 0.5, cy - s * 0.6, cx - s * 1.1, cy - s * 0.1); g.quadraticCurveTo(cx - s * 0.6, cy + s * 0.05, cx - s * 0.4, cy + s * 0.25); g.quadraticCurveTo(cx - s * 0.1, cy + s * 0.05, cx, cy + s * 0.2);
          g.quadraticCurveTo(cx + s * 0.1, cy + s * 0.05, cx + s * 0.4, cy + s * 0.25); g.quadraticCurveTo(cx + s * 0.6, cy + s * 0.05, cx + s * 1.1, cy - s * 0.1); g.quadraticCurveTo(cx + s * 0.5, cy - s * 0.6, cx, cy); g.fill();
        }
        g.restore();
      }
    });
  }

  if (shadows.length) Z.shadows(shadows, 1);

  // a point on the gantry in world space (for glow lights that live outside the gantry group)
  function gantryPoint(g, x, y, z) { const c = cos(g.rotation.y), s = sin(g.rotation.y); return { x: g.position.x + x * c + z * s, y: g.position.y + y, z: g.position.z - x * s + z * c }; }
}
