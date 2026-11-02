// Highland Fling - the Banana Express. A branch line runs alongside the road for a stretch, between two hills with stone-faced portals.
// A little yellow steam train comes through as the leader approaches; a golden ticket by the road makes its passengers lob bananas
// onto the tarmac for as long as the train is in view (ItemSystem.throwBanana).
import * as THREE from "three";
import { TAU, RAIL, sm, vnoise } from "./highland-geo.js";
import { stoneCanvas, toTexture } from "./highland-tex.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const named = (o, n) => { o.name = n; return o; };

export function buildRail(H) {
  const { track, X, K, rng } = H;
  const { group, bake, mat, part, own, anim } = X;
  const Z = RAIL.z, PW = RAIL.pw, PE = RAIL.pe, BW = RAIL.bw;
  const XF0 = PW + 2, XF1 = PE - 2;   // the portal faces (the train is clipped away beyond them)
  let seed = (rng() * 1e9) >>> 0;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  // ================================================================= ground: the terrain's own triangles, so the hill meshes sit exactly on it
  const tm = group.getObjectByName("terrain");
  const tp = tm.geometry.attributes.position, tx0 = tp.getX(0), tz0 = tp.getZ(0), CS = tp.getX(1) - tx0;
  let nx = 1; while (nx < tp.count && Math.abs(tp.getZ(nx) - tz0) < 1e-4) nx++;
  const nz = tp.count / nx;
  const gnd = (x, z) => {
    const fx = (x - tx0) / CS, fz = (z - tz0) / CS;
    if (fx < 0 || fz < 0 || fx >= nx - 1 || fz >= nz - 1) return X.groundY(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * nx + i;
    const a = tp.getY(k), c = tp.getY(k + 1), d = tp.getY(k + nx), e = tp.getY(k + nx + 1);
    return u + v <= 1 ? a + (c - a) * u + (d - a) * v : e + (d - e) * (1 - u) + (c - e) * (1 - v);   // same split as the terrain index buffer
  };

  const cp = tm.geometry.attributes.color, cget = [(k) => cp.getX(k), (k) => cp.getY(k), (k) => cp.getZ(k)];
  const colAt = (x, z, out) => {   // the terrain's own vertex colour at x,z (same triangles), so the hills carry on its heather exactly
    const fx = clamp((x - tx0) / CS, 0, nx - 1.001), fz = clamp((z - tz0) / CS, 0, nz - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * nx + i, lo = u + v <= 1;
    for (let c = 0; c < 3; c++) { const g = cget[c], a = g(k), cc = g(k + 1), d = g(k + nx), e = g(k + nx + 1); out[c] = lo ? a + (cc - a) * u + (d - a) * v : e + (d - e) * (1 - u) + (cc - e) * (1 - v); }
    return out;
  };

  // ================================================================= the deck: just above the highest ground within the bed, grade-limited and smoothed
  const X0 = PW - 64, X1 = PE + 64, DX = 2, NP = Math.round((X1 - X0) / DX) + 1;
  const need = new Float32Array(NP), deck = new Float32Array(NP);
  for (let i = 0; i < NP; i++) { const x = X0 + i * DX; let m = -1e9; for (let dz = -5; dz <= 5; dz += 2.5) m = Math.max(m, gnd(x, Z + dz)); need[i] = deck[i] = m + 0.5; }
  const GRADE = 0.045 * DX;
  for (let i = 1; i < NP; i++) deck[i] = Math.max(deck[i], deck[i - 1] - GRADE);
  for (let i = NP - 2; i >= 0; i--) deck[i] = Math.max(deck[i], deck[i + 1] - GRADE);
  for (let pass = 0; pass < 3; pass++) {
    const t = deck.slice();
    for (let i = 0; i < NP; i++) { let s = 0; for (let k = -4; k <= 4; k++) s += t[clamp(i + k, 0, NP - 1)]; deck[i] = Math.max(need[i], s / 9); }
  }
  const deckAt = (x) => { const f = clamp((x - X0) / DX, 0, NP - 1.001), i = Math.floor(f); return deck[i] + (deck[i + 1] - deck[i]) * (f - i); };
  const slopeAt = (x) => (deckAt(x + 1.5) - deckAt(x - 1.5)) / 3;

  // ================================================================= hills + embankment: one heightfield laid over the terrain wherever it differs
  const hills = [{ xc: PW - RAIL.hillDx, dir: -1 }, { xc: PE + RAIL.hillDx, dir: 1 }];
  const crag = (x, z) => { const a = 1 - Math.abs(2 * vnoise(x / 7 + 9, z / 7) - 1), b = 1 - Math.abs(2 * vnoise(x / 3.1, z / 3.1 + 5) - 1); return a * a * 0.7 + b * b * 0.3; };   // 0..1, ridged: rocky ribs
  const bump = (x, z) => {
    let b = 0;
    for (const h of hills) {
      // a bell (soft at the foot, steepest around halfway up) with a wobbly footprint, a lopsided crown and rocky ribs; every extra fades to nothing
      // at the portal mouth, so the headwall still meets the hill square on and the bore stays inside it
      const px = h.dir < 0 ? PW : PE, near = sm(5, 24, Math.hypot(x - px, (z - Z) * 0.7));
      const wx = x + near * 9 * (vnoise(x / 17 + h.dir * 5, z / 17 + 3) - 0.5), wz = z + near * 9 * (vnoise(x / 17 - 2, z / 17 + h.dir * 7) - 0.5);
      const ex = (wx - h.xc) / RAIL.hillRx, ez = (wz - Z) / RAIL.hillRz, e2 = ex * ex + ez * ez;
      if (e2 < 1) {
        const f = Math.pow(1 - e2, 1.5), lean = 1 + near * 0.2 * h.dir * ez;
        b = Math.max(b, RAIL.hillH * f * lean * (1 + 0.3 * (vnoise(x / 12 + h.dir * 5, z / 12) - 0.5)) + near * 3.6 * f * (crag(x, z) - 0.4));
      }
    }
    return b;
  };
  const CUT = 1.15, FILL = 0.6;   // cutting sides rise at CUT:1, the embankment falls away at FILL:1
  const surf = (x, z) => {
    let h = gnd(x, z) + bump(x, z);
    if (x > PW + 1.5 && x < PE - 1.5) {   // between the portals: a flat bed, filled below / cut above on slopes
      const d = Math.max(0, Math.abs(z - Z) - BW), dk = deckAt(x);
      h = Math.min(dk + CUT * d, Math.max(dk - FILL * d, h));
    }
    return h;
  };
  {
    const alignX = (v) => tx0 + 2 * Math.round((v - tx0) / 2), alignZ = (v) => tz0 + 2 * Math.round((v - tz0) / 2);
    const GX0 = alignX(PW - 50), GX1 = alignX(PE + 50), GZ0 = alignZ(Z - 25), GZ1 = alignZ(Z + 25), GS = 2;
    const gnx = Math.round((GX1 - GX0) / GS) + 1, gnz = Math.round((GZ1 - GZ0) / GS) + 1;
    const pos = new Float32Array(gnx * gnz * 3), uv = new Float32Array(gnx * gnz * 2), act = new Uint8Array(gnx * gnz), far = new Uint8Array(gnx * gnz);
    for (let j = 0; j < gnz; j++) for (let i = 0; i < gnx; i++) {
      const k = j * gnx + i, x = GX0 + i * GS, z = GZ0 + j * GS, g = gnd(x, z), h = surf(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = h + 0.04; pos[k * 3 + 2] = z; uv[k * 2] = x / 26; uv[k * 2 + 1] = z / 26;
      act[k] = Math.abs(h - g) > 0.03 ? 1 : 0;
      far[k] = track.nearestDist(x, z) > X.wallDist + 3.5 ? 1 : 0;   // never lay a sheet over the road or its walls
    }
    const idx = [];
    for (let j = 0; j < gnz - 1; j++) for (let i = 0; i < gnx - 1; i++) {
      const a = j * gnx + i, c = a + 1, d = a + gnx, e = d + 1;
      if (!(far[a] && far[c] && far[d] && far[e]) || !(act[a] || act[c] || act[d] || act[e])) continue;
      idx.push(a, d, c, c, d, e);   // same winding + diagonal as the terrain
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const nrm = g.attributes.normal, col = new Float32Array(gnx * gnz * 3), rock = new THREE.Color(0x77705f), rockHi = new THREE.Color(0x938d80), snow = new THREE.Color(0xeef2f8), rgb = [0, 0, 0];
    const snowy = !!(X.season && X.season.snowy);
    for (let k = 0; k < gnx * gnz; k++) {
      const x = pos[k * 3], z = pos[k * 3 + 2];
      colAt(x, z, rgb);
      const hh = (pos[k * 3 + 1] - gnd(x, z)) / RAIL.hillH, ny = nrm.getY(k), n = vnoise(x / 4, z / 4), r2 = vnoise(x / 1.7 + 4, z / 1.7);
      let w = 0.55 * sm(0.82, 0.55, ny);   // the steep cutting sides show a little rock through the heather
      w = Math.max(w, 0.55 * sm(0.6, 0.9, hh + 0.25 * (n - 0.5)) * sm(0.35, 0.65, n + 0.1), 0.4 * sm(0.84, 0.62, ny) * sm(0.1, 0.4, hh) * sm(0.25, 0.6, r2));   // rock breaks through in patches on the crown and the steep flanks, heather elsewhere
      let r = lerp(rgb[0], lerp(rock.r, rockHi.r, r2), w), gg = lerp(rgb[1], lerp(rock.g, rockHi.g, r2), w), b = lerp(rgb[2], lerp(rock.b, rockHi.b, r2), w);
      if (snowy) { const s = sm(0.3, 0.55, hh + 0.2 * (n - 0.5)) * sm(0.55, 0.9, ny + 0.2 * (r2 - 0.5)); r = lerp(r, snow.r, s); gg = lerp(gg, snow.g, s); b = lerp(b, snow.b, s); }   // winter: the knolls wear a snow cover
      col[k * 3] = r; col[k * 3 + 1] = gg; col[k * 3 + 2] = b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const gm = own(tm.material.clone()); gm.polygonOffset = true; gm.polygonOffsetFactor = -1; gm.polygonOffsetUnits = -1;
    const mesh = new THREE.Mesh(own(g), gm); mesh.name = "rail-ground"; group.add(mesh);
  }

  // ================================================================= trackbed: ballast, sleepers, rails
  const stoneMat = own(new THREE.MeshLambertMaterial({ map: own(toTexture(stoneCanvas(256, 256, [186, 181, 168], 11))), vertexColors: true }));
  const plainMat = own(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const fixtures = [];   // sleepers, telegraph poles and the dark tunnel bores: one baked mesh
  {
    const bp = [], bc = [], bi = [], tc = new THREE.Color();
    // sweep a cross-section (increasing z) along the line; flat-shaded quads
    const sweep = (prof, xa, xb, hex, step = 2) => {
      tc.set(hex);
      const nseg = Math.max(1, Math.round((xb - xa) / step));
      for (let i = 0; i < nseg; i++) {
        const xA = lerp(xa, xb, i / nseg), xB = lerp(xa, xb, (i + 1) / nseg), yA = deckAt(xA), yB = deckAt(xB);
        for (let j = 0; j < prof.length - 1; j++) {
          const [z0, h0] = prof[j], [z1, h1] = prof[j + 1], b = bp.length / 3;
          bp.push(xA, yA + h0, Z + z0, xA, yA + h1, Z + z1, xB, yB + h0, Z + z0, xB, yB + h1, Z + z1);
          for (let q = 0; q < 4; q++) bc.push(tc.r, tc.g, tc.b);
          bi.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
    };
    const xa = XF0 - 0.3, xb = XF1 + 0.3;
    sweep([[-2.5, 0], [-1.7, 0.3], [1.7, 0.3], [2.5, 0]], xa, xb, 0x7b776d);                                         // ballast (pale gravel, so the line shows up against the heather)
    for (const o of [-0.72, 0.72]) sweep([[o - 0.07, 0.42], [o - 0.07, 0.6], [o + 0.07, 0.6], [o + 0.07, 0.42]], xa, xb, 0x8f8f96, 1);   // rails
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(bc, 3)); g.setIndex(bi); g.computeVertexNormals();
    const parts = [];
    for (let x = xa + 0.5; x < xb - 0.2; x += 0.95) parts.push(part(new THREE.BoxGeometry(0.3, 0.14, 2.4), mat(x, deckAt(x) + 0.36, Z, 1, 1, 1, 0, 0, Math.atan(slopeAt(x))), 0x3a2a1c));   // sleepers
    group.add(named(new THREE.Mesh(own(g), plainMat), "rail-bed")); fixtures.push(...parts);
  }

  // ================================================================= telegraph poles + wires along the road side of the line (they make it read as a railway from the road)
  {
    const pp = [], wp = [], tops = [], PZ = Z + 4.3, PH = 6.6, WOOD = 0x5a4330;
    for (let x = XF0 + 9; x < XF1 - 6; x += 21) {
      const y0 = deckAt(x) - 0.9, ins = [[PH - 0.3, -0.8], [PH - 0.3, 0.8], [PH - 1.0, -0.6], [PH - 1.0, 0.6]];
      pp.push(part(new THREE.CylinderGeometry(0.12, 0.19, PH, 6), mat(x, y0 + PH / 2, PZ), WOOD), part(new THREE.BoxGeometry(0.13, 0.13, 1.9), mat(x, y0 + PH - 0.4, PZ), WOOD), part(new THREE.BoxGeometry(0.13, 0.13, 1.5), mat(x, y0 + PH - 1.1, PZ), WOOD));
      for (const [h, dz] of ins) pp.push(part(new THREE.CylinderGeometry(0.07, 0.09, 0.24, 5), mat(x, y0 + h + 0.18, PZ + dz), 0xd8d4c4));
      tops.push(ins.map(([h, dz]) => [x, y0 + h + 0.3, PZ + dz]));
    }
    for (let i = 0; i < tops.length - 1; i++) for (let w = 0; w < 4; w++) {
      const a = tops[i][w], b = tops[i + 1][w], N = 6, sag = (t) => -1.0 * 4 * t * (1 - t);   // a shallow sag between poles
      for (let k = 0; k < N; k++) { const t0 = k / N, t1 = (k + 1) / N; wp.push(lerp(a[0], b[0], t0), lerp(a[1], b[1], t0) + sag(t0), lerp(a[2], b[2], t0), lerp(a[0], b[0], t1), lerp(a[1], b[1], t1) + sag(t1), lerp(a[2], b[2], t1)); }
    }
    fixtures.push(...pp);
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3));
    group.add(named(new THREE.LineSegments(own(wg), own(new THREE.LineBasicMaterial({ color: 0x2a2a30 }))), "rail-wires"));
  }

  // ================================================================= tunnel portals: a masonry headwall with an arched mouth, set into the foot of each hill
  {
    const S3 = 3, HW = 12, OW = 5.6, OH = 6.6, DEPTH = 3, parts = [], dark = [];
    for (const dir of [-1, 1]) {
      const xf = dir < 0 ? XF0 : XF1, dk = deckAt(xf), base = dk - 0.9, west = dir < 0, sgn = west ? -1 : 1;
      const pts = [new THREE.Vector2(-HW, 0), new THREE.Vector2(HW, 0)];
      for (let k = HW; k >= -HW; k--) {   // top edge follows the hill face just behind the headwall (shape x -> world z: negated for the west portal)
        const top = surf(west ? PW : PE, Z + sgn * k) - base - 0.3;
        pts.push(new THREE.Vector2(k, clamp(top, 3.2, 12.5)));
      }
      const shape = new THREE.Shape(pts), hole = new THREE.Path(), oy = 0.9, rr = OW / 2, yc = oy + OH - rr;
      hole.moveTo(-rr, oy); hole.lineTo(-rr, yc); hole.absarc(0, yc, rr, Math.PI, 0, true); hole.lineTo(rr, oy); hole.lineTo(-rr, oy);
      shape.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false, curveSegments: 10 });
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / S3, uv.getY(i) / S3);
      // local z -> world +x (west portal, hill at -x) / -x (east): the front cap lands on the face plane
      parts.push(part(g, mat(west ? xf - DEPTH : xf + DEPTH, base, Z, 1, 1, 1, 0, west ? Math.PI / 2 : -Math.PI / 2, 0), 0xd6d2c6));
      // the dark bore behind the mouth
      dark.push(part(new THREE.BoxGeometry(6, OH + 0.3, OW), mat(xf + sgn * (0.3 + 3), dk - 0.3 + (OH + 0.3) / 2, Z), 0x07070a));
    }
    group.add(named(new THREE.Mesh(own(bake(parts)), stoneMat), "rail-portals"), named(new THREE.Mesh(own(bake([...fixtures, ...dark])), plainMat), "rail-fixtures"));
  }

  // ================================================================= the train: a yellow steam engine + four coaches, each car on its own bit of the gradient
  const clipA = new THREE.Plane(new THREE.Vector3(1, 0, 0), -XF0), clipB = new THREE.Plane(new THREE.Vector3(-1, 0, 0), XF1);
  const carMat = own(new THREE.MeshLambertMaterial({ vertexColors: true, clippingPlanes: [clipA, clipB] }));
  const enableClip = (r) => { r.localClippingEnabled = true; };
  const train = new THREE.Group(); train.name = "banana-express"; group.add(train);
  const NC = 4, CAR_GAP = 8.6, LOCO_TAIL = 7.7, FRONT = 2.6;
  const LEN = FRONT + LOCO_TAIL + 0.6 + NC * CAR_GAP;   // front of the smokebox to the tail of the last coach
  const SLOTS = [-2.7, 0, 2.7], SH = { y: 2.3, z: 1.42, dx: 0.42 };   // passenger seats along a coach; shoulder offset (they are cartoon-sized, so they read from the road)
  const shirts = [0xc8102e, 0x16365f, 0x1d5a34, 0xf0e6c8, 0xe07a1f, 0x7a3a8a, 0xf6c812], skins = [0xf1c9a5, 0xd9a577, 0xa8714a, 0x7a4a2e], hats = [0xc8102e, 0x16365f, 0x1d5a34, 0x23232a, 0xf6c812];
  const YEL = 0xf2c318, BLK = 0x23232a;
  const cars = [];
  {   // the engine (origin = centre of the boiler; front of the smokebox at +2.6, tender ends at -7.7)
    const lp = [
      part(new THREE.CylinderGeometry(1.0, 1.0, 5.2, 12), mat(0, 1.9, 0, 1, 1, 1, 0, 0, Math.PI / 2), YEL),
      part(new THREE.CylinderGeometry(1.02, 1.02, 0.5, 12), mat(2.3, 1.9, 0, 1, 1, 1, 0, 0, Math.PI / 2), BLK),
      part(new THREE.BoxGeometry(2.4, 2.6, 2.5), mat(-3.4, 2.4, 0), BLK), part(new THREE.BoxGeometry(2.8, 0.22, 2.9), mat(-3.4, 3.8, 0), YEL),
      part(new THREE.CylinderGeometry(0.34, 0.5, 1.5, 8), mat(2.0, 3.4, 0), BLK), part(new THREE.CylinderGeometry(0.58, 0.4, 0.4, 8), mat(2.0, 4.2, 0), 0xc8a030),
      part(new THREE.SphereGeometry(0.5, 8, 6), mat(0.4, 3.1, 0), 0xc8a030), part(new THREE.BoxGeometry(2.0, 0.6, 2.2), mat(-0.2, 0.95, 0), 0x2a2a2e),
      part(new THREE.BoxGeometry(2.6, 1.6, 2.4), mat(-6.4, 1.6, 0), BLK), part(new THREE.BoxGeometry(2.4, 0.6, 2.2), mat(-6.4, 2.6, 0), 0x2a2a2e),
      part(new THREE.BoxGeometry(0.5, 0.5, 0.9), mat(2.75, 1.9, 0), 0xfff2b0),   // headlamp
    ];
    for (const x of [-1.4, 0.6, 2.4]) for (const z of [-1.05, 1.05]) lp.push(part(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 12), mat(x, 0.75, z, 1, 1, 1, Math.PI / 2, 0, 0), 0xb3202a));
    for (const z of [-0.95, 0.95]) lp.push(part(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 10), mat(-6.4, 0.5, z, 1, 1, 1, Math.PI / 2, 0, 0), 0xb3202a));
    cars.push({ off: 0, mesh: named(new THREE.Mesh(own(bake(lp)), carMat), "rail-car"), g: new THREE.Group() });
  }
  const pax = [];
  for (let c = 0; c < NC; c++) {
    const cp = [
      part(new THREE.BoxGeometry(8.0, 2.4, 2.5), mat(0, 1.9, 0), 0xe9b81c), part(new THREE.BoxGeometry(8.1, 0.16, 2.6), mat(0, 1.0, 0), BLK),
      part(new THREE.BoxGeometry(8.1, 0.12, 2.6), mat(0, 3.2, 0), 0x3a3a3e), part(new THREE.BoxGeometry(7.2, 0.9, 2.54), mat(0, 2.4, 0), 0x2a3646),
      part(new THREE.BoxGeometry(7.6, 0.4, 1.8), mat(0, 0.55, 0), 0x2a2a2e),
    ];
    for (const bx of [-2.6, 2.6]) for (const z of [-0.95, 0.95]) cp.push(part(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 10), mat(bx, 0.5, z, 1, 1, 1, Math.PI / 2, 0, 0), 0x1a1a1c));
    for (let j = 0; j < SLOTS.length; j++) {   // passengers at the road-side windows: torso, head, tam-o'-shanter with a pompom
      const lx = SLOTS[j] + (rnd() - 0.5) * 0.5, p = { car: c, lx, st: 0, t: 0, ph: rnd() * TAU, tgt: null, shirt: pick(shirts) };
      cp.push(part(new THREE.BoxGeometry(0.8, 0.9, 0.55), mat(lx, 1.95, 1.38), p.shirt), part(new THREE.SphereGeometry(0.34, 9, 7), mat(lx, 2.68, 1.42), pick(skins)));
      const hc = pick(hats);
      cp.push(part(new THREE.CylinderGeometry(0.4, 0.35, 0.17, 10), mat(lx, 2.97, 1.42), hc), part(new THREE.SphereGeometry(0.09, 6, 5), mat(lx, 3.12, 1.42), 0xf0e6c8));
      pax.push(p);
    }
    cars.push({ off: -(LOCO_TAIL + 0.6 + CAR_GAP / 2 + c * CAR_GAP), mesh: named(new THREE.Mesh(own(bake(cp)), carMat), "rail-car"), g: new THREE.Group() });
  }
  for (const c of cars) { c.mesh.frustumCulled = false; c.mesh.onBeforeRender = enableClip; c.g.add(c.mesh); train.add(c.g); }

  // arms (instanced; pivot at the shoulder, pointing along +y) + the banana in each hand
  const ARM = 0.96, armGeo = own(new THREE.BoxGeometry(0.22, ARM, 0.22).translate(0, ARM / 2, 0));
  const armMat = own(new THREE.MeshLambertMaterial({ clippingPlanes: [clipA, clipB] }));
  const arms = own(new THREE.InstancedMesh(armGeo, armMat, pax.length)); arms.frustumCulled = false; arms.onBeforeRender = enableClip; arms.name = "express-arms"; group.add(arms);
  { const c = new THREE.Color(); pax.forEach((p, i) => arms.setColorAt(i, c.set(p.shirt))); arms.instanceColor.needsUpdate = true; }
  const banGeo = own(new THREE.TorusGeometry(0.26, 0.085, 5, 9, 2.5).rotateY(Math.PI / 2).translate(0, 0.17, 0));
  const banMat = own(new THREE.MeshLambertMaterial({ color: 0xffd60a, emissive: 0x3a2f00, clippingPlanes: [clipA, clipB] }));
  const hand = own(new THREE.InstancedMesh(banGeo, banMat, pax.length)); hand.frustumCulled = false; hand.onBeforeRender = enableClip; hand.name = "express-bananas"; group.add(hand);

  // steam: puffs left hanging in the air as the engine goes by
  const PUFFS = 26, puffs = [];
  const puffIM = own(new THREE.InstancedMesh(own(new THREE.SphereGeometry(1, 10, 7)), own(new THREE.MeshLambertMaterial({ color: 0xf2f2f4, emissive: 0x6a6a74, transparent: true, opacity: 0.6, depthWrite: false })), PUFFS));
  puffIM.frustumCulled = false; puffIM.name = "express-steam"; group.add(puffIM);

  // ================================================================= the road: world position of the road at x (for aiming bananas)
  const rs = [], rx = [];
  for (let s = RAIL.portalS - 40; s <= RAIL.portalS + 260; s += 3) { rs.push(s); rx.push(track.sample(s).pos.x); }
  const sOfX = (x) => {
    if (x <= rx[0]) return rs[0]; if (x >= rx[rx.length - 1]) return rs[rs.length - 1];
    let lo = 0, hi = rx.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rx[m] <= x) lo = m; else hi = m; }
    return lerp(rs[lo], rs[hi], (x - rx[lo]) / (rx[hi] - rx[lo]));
  };

  // ================================================================= the golden ticket
  const tq = track.sample(RAIL.ticketS);
  const TK = { x: tq.pos.x + tq.right.x * RAIL.ticketLat, y: tq.pos.y, z: tq.pos.z + tq.right.z * RAIL.ticketLat };
  const ticket = new THREE.Group(); ticket.name = "golden-ticket"; ticket.position.set(TK.x, TK.y, TK.z); group.add(ticket);
  {
    const c = X.canvas(256, 128), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 256, 128); gr.addColorStop(0, "#fff2a8"); gr.addColorStop(0.5, "#ffc928"); gr.addColorStop(1, "#d9961a");
    g.fillStyle = gr; g.beginPath(); g.roundRect(2, 2, 252, 124, 12); g.fill();
    g.strokeStyle = "#8a5a00"; g.lineWidth = 4; g.stroke();
    g.strokeStyle = "rgba(138,90,0,.6)"; g.lineWidth = 2; g.setLineDash([5, 5]); g.beginPath(); g.roundRect(10, 10, 236, 108, 8); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#3a2500"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "900 34px Arial Black, Impact, sans-serif"; g.fillText("BANANA", 128, 40); g.fillText("EXPRESS", 128, 76);
    g.font = "700 15px Arial, sans-serif"; g.fillText("ADMIT ONE  ★  ALL ABOARD", 128, 106);
    const tex = own(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace;
    const tk = new THREE.Mesh(own(new THREE.PlaneGeometry(3.2, 1.6)), own(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })));
    tk.position.y = 2.3; tk.name = "ticket-face"; ticket.add(tk);
    const glow = new THREE.Mesh(own(new THREE.SphereGeometry(1.7, 12, 8)), own(new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending })));
    glow.position.y = 2.1; ticket.add(glow);
    const beam = new THREE.Mesh(own(new THREE.CylinderGeometry(0.55, 0.9, 14, 10, 1, true)), own(new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
    beam.position.y = 7; ticket.add(beam);
    const ring = new THREE.Mesh(own(new THREE.RingGeometry(1.5, 2.0, 24).rotateX(-Math.PI / 2)), own(new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
    ring.position.y = 0.08; ticket.add(ring);
    ticket.userData = { tk, ring, glow };
  }

  // ================================================================= behaviour
  const R = { player: null, items: null, audio: null, game: null };
  const S = {
    run: false, x: PW - 200, v: 19, barrage: false, barrageT: 0, nextThrow: 0, tick: false, lastT: 0, lastS: null, idleT: 0, ticketOn: true, launches: 0, throws: 0, picked: 0,
  };
  const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), hv = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  function launch(delay = 0) {
    if (S.run) return false;
    S.run = true; S.x = XF0 - S.v * delay; S.launches++; S.whistled = false; S.barrageT = 0; S.nextThrow = 0.4;
    for (const p of pax) { p.st = 0; p.t = 0; }
    return true;
  }
  function whistle() { R.audio?.play?.("whistle", { kart: { position: { x: Math.max(PW, Math.min(PE, S.x)), z: Z } } }); }
  function pickTicket() {
    if (!S.ticketOn) return;
    S.ticketOn = false; S.picked++;
    S.barrage = true; S.barrageT = 0;
    R.audio?.play?.("ticket"); R.audio?.play?.("whistle", {});
    R.game?.ui?.banner?.("ALL ABOARD!", 1900);
    R.game?.ui?.toast?.("Golden ticket - bananas incoming!");
    if (!S.run) launch(0.7);
  }
  function startThrow(p) {
    p.st = 1; p.t = 0; S.throws++;
    // aim at a spot on the road ahead of the train: somewhere across its width, mostly in front of where the passenger is now
    const hx = cars[p.car + 1].g.position.x + p.lx;
    const sl = sOfX(hx + lerp(6, 38, rnd())), lat = lerp(-6.4, 6.4, rnd()), sm = track.sample(sl);
    p.tgt = { x: sm.pos.x + sm.right.x * lat, y: sm.pos.y, z: sm.pos.z + sm.right.z * lat, s: sl };
  }
  // arm direction (coach frame: +x ahead, +y up, +z towards the road) for a passenger's state/time
  const D_READY = new THREE.Vector3(0.15, 0.95, 0.3).normalize(), D_WIND = new THREE.Vector3(-0.5, 0.9, -0.1).normalize(), D_REL = new THREE.Vector3(0.25, 0.3, 1).normalize();
  const REL_T = 0.34;
  function poseArm(p, out, t) {
    if (p.st === 0) {
      if (S.barrage) return out.copy(D_READY);
      const w = Math.sin(t * 6 + p.ph);   // waving to the people on the road
      return out.set(0.5 * w, 1.0, 0.35 + 0.12 * Math.sin(t * 3 + p.ph)).normalize();
    }
    const k = p.t;
    if (k < 0.26) return out.copy(D_READY).lerp(D_WIND, k / 0.26).normalize();
    if (k < REL_T) return out.copy(D_WIND).lerp(D_REL, (k - 0.26) / (REL_T - 0.26)).normalize();
    if (k < 0.7) return out.copy(D_REL);
    return out.copy(D_REL).lerp(D_READY, (k - 0.7) / 0.3).normalize();
  }

  const carBuf = [];
  const tryDispatch = (ps) => {
    if (S.lastS != null && S.lastS < RAIL.portalS - RAIL.dispatch && ps >= RAIL.portalS - RAIL.dispatch && ps - S.lastS < 80 && !S.run) launch(0);
  };

  anim.push((_dt, t) => {
    const dt = clamp(t - S.lastT, 0, 0.1); S.lastT = t;
    const P = R.player;
    // ---- the ticket: spins and bobs; the leader picks it up by driving through it (checked along the whole step so a fast kart can't skip it)
    {
      const u = ticket.userData;
      ticket.visible = S.ticketOn;
      if (S.ticketOn) {
        u.tk.rotation.y = t * 1.8; u.tk.position.y = 2.3 + Math.sin(t * 2.2) * 0.18; u.glow.position.y = u.tk.position.y;
        u.glow.scale.setScalar(1 + 0.12 * Math.sin(t * 5)); u.ring.scale.setScalar(1 + 0.1 * Math.sin(t * 3));
        if (P && S.lastP) {
          const ax = S.lastP.x - TK.x, az = S.lastP.z - TK.z, bx = P.position.x - TK.x, bz = P.position.z - TK.z, ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
          const f = l2 > 1e-6 ? clamp(-(ax * ex + az * ez) / l2, 0, 1) : 0, cx = ax + ex * f, cz = az + ez * f;
          if (cx * cx + cz * cz < 4.4 * 4.4 && Math.abs(P.position.y - TK.y) < 5) pickTicket();
        }
      } else if (P && P.s < RAIL.ticketS - 300 && P.s > 5) S.ticketOn = true;   // a new lap: it is back
    }
    if (P) { (S.lastP ||= new THREE.Vector3()).copy(P.position); tryDispatch(P.s); S.lastS = P.s; }
    else { S.idleT += dt; if (S.idleT > 34 && !S.run) { S.idleT = 0; launch(0); } }   // nobody racing (menu backdrop): the odd train all the same

    // ---- the train
    let carsVisible = 0;
    if (S.run) {
      S.x += S.v * dt;
      if (!S.whistled && S.x > XF0 - 14) { S.whistled = true; if (!S.barrage) R.audio?.play?.("whistle", { kart: { position: { x: XF0, z: Z } } }); }
      if (S.x - LEN > XF1 + 2) { S.run = false; S.barrage = false; }
    }
    train.visible = S.run && S.x > XF0 && S.x - LEN < XF1;
    if (train.visible) {
      const px = S.x - FRONT;   // engine origin
      for (const c of cars) {
        const xc = px + c.off;
        c.g.position.set(xc, deckAt(xc) + 0.46, Z); c.g.rotation.set(0, 0, Math.atan(slopeAt(xc))); c.g.updateMatrixWorld(true);
        c.vis = xc > XF0 + 4 && xc < XF1 - 4;
      }
      // passengers: arms, bananas in hand, throwing
      S.barrageT += S.barrage ? dt : 0;
      if (S.barrage && S.barrageT > 12) S.barrage = false;
      S.nextThrow -= dt;
      if (S.barrage && S.nextThrow <= 0 && R.items) {
        const ready = pax.filter((p) => p.st === 0 && cars[p.car + 1].vis);
        if (ready.length) { startThrow(pick(ready)); S.nextThrow = lerp(0.42, 0.66, rnd()); }
      }
      pax.forEach((p, i) => {
        const car = cars[p.car + 1];
        if (!car.vis) { arms.setMatrixAt(i, zero); hand.setMatrixAt(i, zero); return; }
        carsVisible++;
        if (p.st) {
          p.t += dt;
          if (p.st === 1 && p.t >= REL_T) {   // let go
            p.st = 2;
            poseArm(p, dir, t); hv.set(p.lx + SH.dx, SH.y, SH.z).addScaledVector(dir, ARM + 0.2).applyMatrix4(car.g.matrixWorld); from.copy(hv);
            const g = p.tgt, dx = g.x - from.x, dz = g.z - from.z, T = clamp(0.75 + Math.hypot(dx, dz) / 40, 1.0, 2.1);
            to.set(g.x, g.y, g.z);
            R.items?.throwBanana(from, to, T, R.player, { arm: 7, life: 12, s: g.s });
          }
          if (p.t >= 1) { p.st = 0; p.t = 0; }
        }
        poseArm(p, dir, t);
        q.setFromUnitVectors(up, dir);
        dummy.position.set(p.lx + SH.dx, SH.y, SH.z); dummy.quaternion.copy(q); dummy.scale.setScalar(1); dummy.updateMatrix();
        m4.multiplyMatrices(car.g.matrixWorld, dummy.matrix); arms.setMatrixAt(i, m4);
        // the banana in the hand: shown while armed and not yet thrown
        if (S.barrage && (p.st === 0 || (p.st === 1 && p.t < REL_T))) {
          dummy.position.set(p.lx + SH.dx, SH.y, SH.z).addScaledVector(dir, ARM); dummy.updateMatrix();
          m4.multiplyMatrices(car.g.matrixWorld, dummy.matrix); hand.setMatrixAt(i, m4);
        } else hand.setMatrixAt(i, zero);
      });
      // steam from the funnel, left hanging as the engine goes by
      if (dt > 0) { S.puffAcc = (S.puffAcc || 0) + dt; while (S.puffAcc > 0.16) { S.puffAcc -= 0.16; const xf = px + 2.0, yf = deckAt(xf) + 0.46 + 4.5; puffs.push({ x: xf, y: yf, z: Z, age: 0 }); if (puffs.length > PUFFS) puffs.shift(); } }
    } else {
      for (let i = 0; i < pax.length; i++) { arms.setMatrixAt(i, zero); hand.setMatrixAt(i, zero); }
    }
    arms.instanceMatrix.needsUpdate = true; hand.instanceMatrix.needsUpdate = true;
    arms.visible = hand.visible = train.visible;
    // puffs age and drift on whether or not the train is in view; those inside a hill are not drawn
    for (let i = 0; i < PUFFS; i++) {
      const p = puffs[i];
      if (p) p.age += dt;
      if (!p || p.age > 3.2 || p.x < XF0 || p.x > XF1) { puffIM.setMatrixAt(i, zero); continue; }
      const sc = (0.4 + p.age * 0.55) * (1 - sm(1.9, 3.2, p.age));   // billows, then thins away
      dummy.position.set(p.x + p.age * 0.8, p.y + p.age * 1.5, p.z + p.age * 0.4); dummy.scale.setScalar(sc); dummy.quaternion.identity(); dummy.updateMatrix(); puffIM.setMatrixAt(i, dummy.matrix);
    }
    puffIM.instanceMatrix.needsUpdate = true;
    S.carsVisible = carsVisible;
  });

  // ---- hook the race: remember who/what to talk to, and start from a clean slate each time
  const prev = track.onRaceStart;
  track.onRaceStart = (race, player, audio, game) => {
    prev?.(race, player, audio, game);
    R.player = player; R.audio = audio; R.game = game; R.items = game?.items || null;
    S.run = false; S.barrage = false; S.barrageT = 0; S.ticketOn = true; S.lastS = null; S.lastP = null; puffs.length = 0; S.x = PW - 200;
  };
  track.rail = { S, R, launch, pickTicket, deckAt, slopeAt, gnd, surf, pax, cars, train, ticket, TK, LEN, sOfX };
  H.rail = track.rail;
}
