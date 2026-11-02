// Apex Karts - Easter: giant Easter bunnies on the bends, hopping bunnies, painted eggs (on the walls, in the grass, big ones on
// show), spring flower patches, chicks, butterflies, a pastel-striped start gantry with a bunny-ears crown and hanging eggs, and a
// rainbow in the sky. Everything is non-solid.
import * as THREE from "three";
import { triGeo, merge, eggParts, TAU } from "./season-kit.js";

export function build(Z) {
  const { X, K, rng, R, pick, P, L, group, anim, onDeck, part, mat } = Z;
  const { own } = X, bake = Z.bakeAll, sin = Math.sin, cos = Math.cos;
  const PINK = 0xff9ec8, YEL = 0xffe27a, MINT = 0x9be8c8, LAV = 0xb9a4ff, SKY = 0x8fd0ff, PEACH = 0xffb88a, WHITE = 0xf7f3ee, CREAM = 0xfff0e2, DARK = 0x2a2230, GRN = 0x3f9a45, HOT = 0xff6f91;
  const PAL = [PINK, YEL, MINT, LAV, SKY, PEACH];
  const rd = (n) => Math.round(n);

  // ------------------------------------------------------------------ eggs
  const BANDS = [
    [[0, 0.2, PINK], [0.2, 0.36, 0xffffff], [0.36, 0.52, PINK], [0.52, 0.68, 0xffffff], [0.68, 1, PINK]],
    [[0, 0.3, SKY], [0.3, 0.42, YEL], [0.42, 0.6, SKY], [0.6, 0.72, YEL], [0.72, 1, SKY]],
    [[0, 0.25, MINT], [0.25, 0.5, LAV], [0.5, 0.75, MINT], [0.75, 1, PEACH]],
    [[0, 0.3, YEL], [0.3, 0.4, HOT], [0.4, 0.6, YEL], [0.6, 0.7, HOT], [0.7, 1, YEL]],
  ];
  const eggFull = BANDS.map((b) => bake(eggParts(X, 0, 0, 0, 1, b, 10)));
  // a cheap egg (height 1, standing on y = 0): lathe with soft colour bands by height
  const eggLow = [[PINK, 0xffffff], [SKY, YEL], [MINT, LAV], [YEL, PEACH]].map(([c0, c1]) => {
    const r = (t) => 0.4 * Math.pow(Math.sin(Math.PI * Math.min(Math.max(t, 0.001), 0.999)), 0.75) * (1.12 - 0.34 * t), pts = [], cols = [];
    const cc = [new THREE.Color(c0), new THREE.Color(c0), new THREE.Color(c1), new THREE.Color(c1), new THREE.Color(c0)];
    for (let k = 0; k <= 4; k++) pts.push(new THREE.Vector2(r(k / 4), k / 4));
    const g = new THREE.LatheGeometry(pts, 6), pa = g.attributes.position, col = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) { const k = Math.max(0, Math.min(4, Math.round(pa.getY(i) * 4))); col[i * 3] = cc[k].r; col[i * 3 + 1] = cc[k].g; col[i * 3 + 2] = cc[k].b; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.deleteAttribute("uv");
    void cols; return g;
  });

  // ------------------------------------------------------------------ the bunny (sits on y = 0, faces +z, 2.9 tall with ears)
  const ear = (sd, inner) => P.sph(inner ? 0.09 : 0.14, sd * 0.17, 2.4, inner ? 0.14 : 0.06, inner ? PINK : WHITE, { y: inner ? 3.1 : 3.3, w: 5, h: 4, rz: -sd * 0.14, rx: -0.12 });
  const bunnyG = bake([
    P.sph(0.62, 0, 0.66, -0.05, WHITE, { y: 1.05, z: 1.12, w: 8, h: 5 }),
    P.sph(0.34, -0.44, 0.4, -0.25, WHITE, { w: 6, h: 4 }), P.sph(0.34, 0.44, 0.4, -0.25, WHITE, { w: 6, h: 4 }),
    P.sph(0.42, 0, 1.5, 0.25, WHITE, { y: 0.95, z: 1.05, w: 8, h: 5 }),
    P.sph(0.2, 0, 1.36, 0.64, CREAM, { y: 0.8, z: 0.9, w: 6, h: 4 }), P.sph(0.075, 0, 1.43, 0.83, 0xff7aa8, { w: 4, h: 3 }),
    P.sph(0.06, -0.19, 1.6, 0.56, DARK, { w: 4, h: 3 }), P.sph(0.06, 0.19, 1.6, 0.56, DARK, { w: 4, h: 3 }),
    ear(-1, false), ear(1, false), ear(-1, true), ear(1, true),
    P.sph(0.2, 0, 0.45, -0.8, WHITE, { w: 6, h: 4 }),
    P.sph(0.14, -0.2, 0.18, 0.5, CREAM, { z: 1.4, w: 5, h: 3 }), P.sph(0.14, 0.2, 0.18, 0.5, CREAM, { z: 1.4, w: 5, h: 3 }),
    P.sph(0.16, -0.52, 0.12, 0.05, CREAM, { z: 2.0, w: 5, h: 3 }), P.sph(0.16, 0.52, 0.12, 0.05, CREAM, { z: 2.0, w: 5, h: 3 }),
    P.cone(0.17, 0.34, -0.16, 1.02, 0.5, HOT, { seg: 4, rz: -Math.PI / 2 }), P.cone(0.17, 0.34, 0.16, 1.02, 0.5, HOT, { seg: 4, rz: Math.PI / 2 }), P.sph(0.07, 0, 1.02, 0.5, 0xc94b75, { w: 4, h: 3 }),
  ]);

  // a chick
  const chickG = bake([
    P.sph(0.19, 0, 0.2, 0, YEL, { w: 6, h: 4 }), P.sph(0.12, 0, 0.4, 0.1, YEL, { w: 6, h: 4 }), P.cone(0.035, 0.11, 0, 0.38, 0.24, 0xff8a1a, { rx: Math.PI / 2, seg: 4 }),
    P.sph(0.025, -0.06, 0.44, 0.19, DARK, { w: 3, h: 3 }), P.sph(0.025, 0.06, 0.44, 0.19, DARK, { w: 3, h: 3 }),
    P.box(0.04, 0.03, 0.1, -0.06, 0.015, 0.05, 0xff8a1a), P.box(0.04, 0.03, 0.1, 0.06, 0.015, 0.05, 0xff8a1a),
    P.sph(0.08, 0, 0.26, -0.18, YEL, { y: 0.6, z: 1.3, w: 4, h: 3 }),
  ]);

  // flower patches: a leafy mound with seven tulips (three colour schemes)
  const patchG = [[0xff7eb3, YEL, 0xffffff], [0xff5a5a, 0xffd23a, 0xffffff], [LAV, PINK, 0xffffff]].map((cols, v) => {
    const q = (i) => { const x = Math.sin(i * 12.9898 + (v + 1) * 78.233) * 43758.5453; return x - Math.floor(x); };
    const parts = [P.sph(0.55, 0, -0.05, 0, 0x4aa04e, { y: 0.45, w: 6, h: 3 })];
    for (let i = 0; i < 7; i++) {
      const a = q(i) * TAU, d = Math.sqrt(q(i + 7)) * 0.8, x = cos(a) * d, z = sin(a) * d, h = 0.4 + q(i + 3) * 0.3;
      parts.push(P.cyl(0.025, 0.03, h, x, h / 2, z, GRN, { seg: 3, open: true }), P.cone(0.12, 0.24, x, h + 0.08, z, cols[i % cols.length], { seg: 5, rx: Math.PI }));
    }
    return bake(parts);
  });

  const shadows = [];
  const low = [[], [], [], []];            // cheap eggs, by colour
  const lowEgg = (x, y, z, s, ry, tilt = 0) => { const k = Math.floor(rng() * 4); low[k].push({ x, y, z, sx: s, ry, rz: tilt }); };

  // ------------------------------------------------------------------ giant bunnies on the bends
  const nGiant = Math.max(2, Math.min(4, rd(L / 650)));
  let giants = onDeck ? Z.airSpot({ n: nGiant, dist: [26, 55], dy: [-3, 8], r: 6 }) : Z.sample({ n: nGiant, off: [8, 11.5], r: 3.8, h: 14, bend: "outside", minCurv: 0.005, big: true, bigSep: 190, tries: 160 });
  if (giants.length < 2 && !onDeck) giants = giants.concat(Z.sample({ n: 2 - giants.length, off: [8, 11.5], r: 3.8, h: 14, big: true, bigSep: 190, tries: 160 }));
  const big = [], sparkles = [], bflies = [], bigEggs = [[], [], [], []];
  giants.forEach((g, i) => {
    const s = R(2.5, 3.0);
    big.push({ x: g.x, y: g.y - 0.05, z: g.z, sx: s, ry: g.ry + R(-0.2, 0.2) });
    if (!onDeck) shadows.push({ x: g.x, z: g.z, sx: s * 0.95 });
    for (let k = 0; k < 14; k++) { const a = R(0, TAU), d = R(2.5, 7) * (s / 2.8), y = g.y + R(0.4, s * 1.6); sparkles.push({ x: g.x + cos(a) * d, y, z: g.z + sin(a) * d, c: pick(PAL), sz: 0.34, ph: R(0, 1) }); }
    for (let k = 0; k < 6; k++) bflies.push({ cx: g.x, cy: g.y + R(1.5, s * 1.6), cz: g.z, R: R(s * 0.9, s * 1.9), w: R(0.5, 0.9) * (k % 2 ? -1 : 1), ph: R(0, TAU), bob: R(0.4, 1.0), s: R(1.0, 1.4), c: pick(PAL) });
    // a ring of big painted eggs round its feet
    for (let k = 0; k < 8; k++) {
      const a = g.ry + Math.PI * R(-0.6, 0.6) + (k % 2 ? 0.5 : -0.5), d = R(3.4, 5.4) * (s / 2.8), x = g.x + sin(a) * d, z = g.z + cos(a) * d;
      if (!onDeck && Z.occ.blocked(x, z, 0.8, g.y + 0.2, g.y + 2.2)) continue;
      bigEggs[(i + k) % 4].push({ x, y: onDeck ? g.y : X.groundY(x, z) - 0.04, z, sx: R(1.1, 1.9), ry: R(0, TAU), rz: R(-0.12, 0.12) });
    }
  });
  Z.inst(bunnyG, Z.matV, big, "giant-bunnies");

  // ------------------------------------------------------------------ painted eggs: big ones on show, little ones on the walls and hidden in the grass
  for (const p of Z.sample({ n: rd(L / 110), off: [1.8, 7], r: 0.95, h: 2.6 })) {
    const s = R(1.2, 2.4); bigEggs[Math.floor(rng() * 4)].push({ x: p.x, y: p.y - 0.04, z: p.z, sx: s, ry: R(0, TAU), rz: R(-0.1, 0.1) });
    if (!onDeck) shadows.push({ x: p.x, z: p.z, sx: 0.6 * s });
  }
  bigEggs.forEach((list, k) => Z.inst(eggFull[k], Z.matV, list, "eggs-big" + k));
  Z.wallTop(13).forEach((w) => lowEgg(w.x, w.y - 0.03, w.z, R(0.8, 1.15), R(0, TAU)));
  for (const p of Z.sample({ n: rd(L / 14), off: [1.2, 9], r: 0.45, h: 0.7 })) lowEgg(p.x, p.y - 0.05, p.z, R(0.45, 0.8), R(0, TAU), R(-0.3, 0.3));
  low.forEach((list, k) => Z.inst(eggLow[k], Z.matV, list, "eggs" + k));

  // ------------------------------------------------------------------ flowers, chicks, hopping bunnies, butterflies
  {
    const fl = [[], [], []];
    const spots = Z.sample({ n: rd(L / 30), off: [1.6, 9], r: 1.3, h: 1.0 });
    spots.forEach((p, i) => { fl[i % 3].push({ x: p.x, y: p.y - 0.05, z: p.z, sx: R(1.0, 1.7), ry: R(0, TAU) }); if (i % 3 === 0) bflies.push({ cx: p.x, cy: p.y + R(1.2, 3.2), cz: p.z, R: R(1.5, 4.5), w: R(0.45, 0.95) * (i % 2 ? -1 : 1), ph: R(0, TAU), bob: R(0.3, 0.8), s: R(0.8, 1.2), c: pick(PAL) }); });
    fl.forEach((list, k) => Z.inst(patchG[k], Z.matV, list, "flowers" + k));

    const ch = Z.sample({ n: rd(L / 100), off: [1.6, 8], r: 0.4, h: 0.5 });
    Z.inst(chickG, Z.matV, ch.map((p) => ({ x: p.x, y: p.y - 0.03, z: p.z, sx: R(1.3, 2.0), ry: R(0, TAU) })), "chicks");

    // bunnies that hop back and forth along the verge
    const hs = Z.sample({ n: Math.max(4, rd(L / 150)), off: [2.5, 8], r: 1.2, h: 1.4 });
    const hop = hs.map((p) => ({ p, s: R(0.42, 0.6), ph: R(0, TAU), amp: R(2.0, 3.2), spd: R(0.25, 0.4) }));
    if (hop.length) {
      const im = new THREE.InstancedMesh(own(bunnyG), Z.matV, hop.length); im.frustumCulled = false; im.name = "hoppers"; group.add(im); Z.count(bunnyG, hop.length, "hoppers");
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ"), v = new THREE.Vector3(), sc = new THREE.Vector3();
      const upd = (t) => {
        hop.forEach((b, i) => {
          const p = b.p, a = t * b.spd + b.ph, u = sin(a), dir = cos(a) >= 0 ? 1 : -1, tx = p.rz, tz = -p.rx, h = Math.abs(sin(t * 4.2 + b.ph * 3));
          e.set(0.3 * (h - 0.5), Math.atan2(tx * dir, tz * dir), 0); q.setFromEuler(e);
          v.set(p.x + tx * u * b.amp, p.y - 0.03 + h * 0.9 * b.s * 2, p.z + tz * u * b.amp); sc.setScalar(b.s);
          m4.compose(v, q, sc); im.setMatrixAt(i, m4);
        });
        im.instanceMatrix.needsUpdate = true;
      };
      upd(0); anim.push((dt, t) => upd(t));
      if (!onDeck) hs.forEach((p) => shadows.push({ x: p.x, z: p.z, sx: 0.9 }));
    }

    if (bflies.length) {
      const wing = (s) => [[[s * 0.04, 0, 0.06], [s * 0.5, 0.06, 0.22], [s * 0.46, 0.02, -0.06], 0xffffff], [[s * 0.04, 0, 0], [s * 0.46, 0.02, -0.06], [s * 0.3, 0, -0.3], 0xf4f0ff]];
      const geo = merge([bake([P.sph(0.05, 0, 0, 0, 0x3a2e40, { z: 3, w: 4, h: 3 })]), triGeo([...wing(1), ...wing(-1)])]);
      Z.swarm(geo, bflies, { flap: 11, amp: 1.2, name: "butterflies" });
    }
    if (sparkles.length) Z.glow(sparkles, { blink: 1, max: 14, name: "egg-sparkles" });
  }

  // ------------------------------------------------------------------ start gantry: pastel stripes, big eggs and bunny ears on top, hanging eggs
  {
    const g = Z.gantry(), span = g.userData.span, gp = [], placed = [];
    const stripe = [PINK, 0xfff6f6, MINT, 0xfff6f6, YEL, 0xfff6f6, LAV, 0xfff6f6];
    for (const sx of [-span, span]) for (let k = 0; k < 14; k++) gp.push(P.box(1.62, 0.62, 1.62, sx, 0.9 + k * 0.7, 0, stripe[k % stripe.length]));
    const N = 7;
    for (let i = 0; i < N; i++) { const x = -span + 1.6 + ((2 * span - 3.2) * i) / (N - 1); if (i === 3) continue; placed.push(Z.place(eggFull[i % 4], { x, y: 11.35, z: 0, s: R(1.5, 2.0), ry: R(0, TAU) })); }
    // bunny ears and a bow where the middle egg would be
    for (const sd of [-1, 1]) gp.push(P.sph(0.55, sd * 0.95, 13.15, 0, WHITE, { y: 3.3, w: 6, h: 5, rz: -sd * 0.22 }), P.sph(0.33, sd * 0.95 + sd * 0.0, 13.15, 0.22, PINK, { y: 3.1, w: 6, h: 5, rz: -sd * 0.22 }));
    gp.push(P.sph(0.5, 0, 11.7, 0, WHITE, { y: 0.8, w: 6, h: 4 }), P.cone(0.5, 1.0, -0.75, 11.8, 0.35, HOT, { seg: 4, rz: -Math.PI / 2 }), P.cone(0.5, 1.0, 0.75, 11.8, 0.35, HOT, { seg: 4, rz: Math.PI / 2 }), P.sph(0.24, 0, 11.8, 0.4, 0xc94b75, { w: 5, h: 4 }));
    // eggs hanging from the white bar under the banner, front and back
    for (const z of [-0.95, 0.95]) for (let i = 0; i < 12; i++) {
      const x = -span + 1.5 + ((2 * span - 3) * i) / 11;
      gp.push(P.cyl(0.012, 0.012, 0.5, x, 7.15, z, 0xeeeeee, { seg: 3, open: true }));
      placed.push(Z.place(eggFull[(i + (z > 0 ? 2 : 0)) % 4], { x, y: 6.1, z, s: 0.8, ry: i }));
    }
    Z.mesh(merge([bake(gp), ...placed]), Z.matV, "gantry-easter", g);
  }

  // ------------------------------------------------------------------ rainbow
  if (!onDeck) {
    const sd = new THREE.Vector3(...X.theme.sun.dir).normalize(), hz = Math.hypot(sd.x, sd.z) || 1, e0 = -0.17;
    const A = new THREE.Vector3((-sd.x / hz) * cos(e0), sin(e0), (-sd.z / hz) * cos(e0)), U = new THREE.Vector3().crossVectors(A, new THREE.Vector3(0, 1, 0)).normalize(), V = new THREE.Vector3().crossVectors(A, U).normalize();
    Z.debug.rainbow = [A.x, A.y, A.z];
    const BANDS7 = ["#ff4a4a", "#ff9a3a", "#ffe14a", "#5bd96a", "#4ad0e8", "#4a7bff", "#9a5bff"], rad = (d) => (d * Math.PI) / 180;
    Z.paintSky((g, W, H, project) => {
      g.save(); g.lineCap = "round"; g.lineJoin = "round";
      const draw = (rho, col, lw, alpha) => {
        g.strokeStyle = col; g.lineWidth = lw; g.globalAlpha = alpha;
        const c = cos(rho), s = sin(rho); let open = false, lx = 0;
        for (let k = 0; k <= 240; k++) {
          const th = (k / 240) * TAU, ct = cos(th), st = sin(th);
          const x = A.x * c + (U.x * ct + V.x * st) * s, y = A.y * c + (U.y * ct + V.y * st) * s, z = A.z * c + (U.z * ct + V.z * st) * s;
          if (y < 0.004) { if (open) { g.stroke(); open = false; } continue; }
          const [px, py] = project(x, y, z);
          if (open && Math.abs(px - lx) > W / 2) { g.stroke(); open = false; }
          if (!open) { g.beginPath(); g.moveTo(px, py); open = true; } else g.lineTo(px, py);
          lx = px;
        }
        if (open) g.stroke();
      };
      const fade = X.theme.sky && X.theme.sky.stars ? 0.5 : 1;   // a faint "moonbow" at night
      draw(rad(39.7), "#ffffff", 44, 0.10 * fade);
      BANDS7.forEach((col, k) => draw(rad(42.6 - 0.72 * k), col, 6, 0.55 * fade));
      g.restore();
    });
  }

  if (shadows.length) Z.shadows(shadows, 1);
  void K; void part; void mat; void CREAM;
}
