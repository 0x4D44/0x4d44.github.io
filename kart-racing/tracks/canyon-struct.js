// Dune Canyon - big structures: rock arch, cave shell + crystals, wooden trestle, canyon shade decals.
import * as THREE from "three";
import { LY } from "./canyon.layout.js";

const TAU = Math.PI * 2;
const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash2 = (ix, iz) => { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const STRATA = [0xb5532b, 0xcf6d36, 0xe08f4a, 0x9b4328, 0xd9a15f, 0xc25e30, 0xeab270, 0x8a3c26, 0xc9784a, 0xf0c88c];
export const strataColor = (y, n, out) => {
  const idx = Math.floor(y / 1.15 + n * 1.4);
  out.setHex(STRATA[((Math.imul(idx, 2654435761) >>> 16) + (idx & 3)) % STRATA.length]);
  if (idx % 7 === 0) out.lerp(new THREE.Color(0xf3d9a2), 0.5);
  return out;
};

// flat-shaded lumpy rock; transformed by matrix m; strata coloured by world y
export function rockGeo(geo, m, seed, amp, shade = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, v = new THREE.Vector3(), col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = vnoise(v.x * 0.35 + seed, v.z * 0.35 - seed) + vnoise(v.y * 0.5 + seed * 2, v.x * 0.5) - 1;
    const l = v.length() || 1; v.multiplyScalar(1 + n * amp / Math.max(2, l));
    v.applyMatrix4(m); p.setXYZ(i, v.x, v.y, v.z);
    strataColor(v.y, vnoise(v.x * 0.08, v.z * 0.08), c);
    col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}
function merge(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return out;
}
const Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
// box beam between two points
export function beamMat(a, b, w, h = w) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  Q.setFromUnitVectors(UP, d.normalize());
  return { m: new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), Q.clone(), new THREE.Vector3(w, len, h)), len };
}

export function buildStructures(track, X, K) {
  const { C, group, wallDist, own, anim, bake, mat, part, Strips, canvas, toTex, rng } = X;
  const { N, ds, px, pz, tx, tz, py } = C;
  const gy = X.groundY;
  const { lam, basic } = K;
  const L = track.length;

  // ---- drop the engine's concrete viaduct; the trestle below replaces it
  for (const nm of ["deck", "pillars"]) { const o = group.getObjectByName(nm); if (o) o.visible = false; }
  for (const o of track.obstacles) { o.y0 = 1e9; o.y1 = 1e9; }

  const frame = (s) => { const sp = track.sample(s); return { x: sp.pos.x, y: sp.pos.y, z: sp.pos.z, rx: sp.right.x, rz: sp.right.z, tx: sp.tangent.x, tz: sp.tangent.z, h: Math.atan2(sp.tangent.x, sp.tangent.z) }; };

  // ============================================================ rock arch
  {
    const f = frame(LY.arch), a = wallDist + 8.4, b = 17.5;
    const pts = [];
    for (let k = 0; k <= 24; k++) { const t = (k / 24) * Math.PI; pts.push(new THREE.Vector3(a * Math.cos(t), b * Math.sin(t) - 3, 0)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 56, 5.4, 14, false);
    const p = tube.attributes.position, v = new THREE.Vector3(), cc = new THREE.Vector3();
    const rs = 15;
    for (let i = 0; i < p.count; i++) {
      const ti = Math.floor(i / (rs)); const u = Math.min(1, ti / 56);
      curve.getPointAt(u, cc); v.fromBufferAttribute(p, i).sub(cc);
      const k = 0.78 + 0.5 * vnoise(u * 9, (i % rs) * 0.7) + 0.35 * Math.sin(u * Math.PI) * 0;
      v.multiplyScalar(k * (1 + 0.45 * (1 - Math.sin(u * Math.PI)))).add(cc);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(f.x, f.y, f.z), new THREE.Quaternion().setFromAxisAngle(UP, f.h), new THREE.Vector3(1, 1, 1));
    const geos = [rockGeo(tube, m, 3.3, 0.9)];
    for (const sg of [-1, 1]) {
      const mm = new THREE.Matrix4().compose(new THREE.Vector3(sg * (a + 1.5), 0, 0), new THREE.Quaternion(), new THREE.Vector3(1.1, 1.5, 1.3)).premultiply(m);
      geos.push(rockGeo(new THREE.IcosahedronGeometry(8.5, 1), mm, 7.1 + sg, 1.6));
    }
    const mesh = new THREE.Mesh(own(merge(geos)), lam({ vertexColors: true })); mesh.name = "arch"; group.add(mesh);
    for (const sg of [-1, 1]) { const q = frame(LY.arch); track.addObstacle(q.x + q.rx * sg * (a + 1), q.z + q.rz * sg * (a + 1), 5.5, -50, 80); }
  }

  // ============================================================ cave (rock roof over the road)
  const [c0, c1] = LY.cave;
  {
    const aL = wallDist + 1.4, hC = 9.2, Wt = 28, ext = 32;
    const i0 = Math.floor(c0 / ds), i1 = Math.ceil(c1 / ds);
    const nth = 14;
    const arch = (st, th) => { // th 0..nth -> lateral(+right), y
      const t = (th / nth) * Math.PI, nzz = vnoise(st * 0.28, th * 0.9) - 0.5;
      const e = Math.min(1, sm(0, 3, st - i0) * sm(0, 3, i1 - st) + 0.15);
      return [aL * Math.cos(t), (hC + nzz * 1.5 * e) * Math.sin(t)];
    };
    const perim = (k) => { // outer perimeter point k/nth, left->... returns [lat,y]
      const t = k / nth * 4; // 0..4 around: right foot -> right top -> left top -> left foot
      if (t < 1) return [ext, Wt * t * 0.0];
      return [ext, 0];
    };
    void perim;
    const pos = [], col = [];
    const cI = new THREE.Color(), cO = new THREE.Color();
    const W = (st, lat, y) => { const i = st % N; return [px[i] - tz[i] * lat, py[i] + y, pz[i] + tx[i] * lat]; };
    const quad = (A, B, Cc, D, ca, cb) => { for (const q of [A, B, Cc, A, Cc, D]) pos.push(...q); for (let k = 0; k < 3; k++) col.push(...ca); for (let k = 0; k < 3; k++) col.push(...cb); };
    const cc = (y, n, sh, out) => { strataColor(y, n, cI); cI.multiplyScalar(sh); return [cI.r, cI.g, cI.b]; };
    for (let st = i0; st < i1; st++) {
      // inner arch
      for (let th = 0; th < nth; th++) {
        const [l0, y0] = arch(st, th), [l1, y1] = arch(st, th + 1), [l2, y2] = arch(st + 1, th), [l3, y3] = arch(st + 1, th + 1);
        const c = cc(py[st % N] + y0, vnoise(st * 0.2, th), 0.55, cI);
        quad(W(st, l0, y0), W(st, l1, y1), W(st + 1, l3, y3), W(st + 1, l2, y2), c, c);
      }
      // top surface (mesa top, slopes off at the edges so it vanishes into the canyon plateau)
      const prof = [[-ext - 10, Wt - 7], [-ext, Wt], [ext, Wt], [ext + 10, Wt - 7]];
      for (let k = 0; k < 3; k++) {
        const a0 = prof[k], a1 = prof[k + 1];
        const c = cc(Wt + 2 + py[st % N], vnoise(st * 0.1, k), 1.0, cI);
        quad(W(st, a0[0], a0[1]), W(st, a1[0], a1[1]), W(st + 1, a1[0], a1[1]), W(st + 1, a0[0], a0[1]), c, c);
      }
    }
    // end faces: connect arch rim to the rectangle around it
    for (const st of [i0, i1]) {
      const rect = (k) => { // k 0..nth -> point on perimeter (right foot, up, across, down left foot)
        const u = k / nth * 3; // 0..3
        if (u < 1) return [ext, Wt * u]; if (u < 2) return [ext - (u - 1) * 2 * ext, Wt]; return [-ext, Wt * (3 - u)];
      };
      for (let th = 0; th < nth; th++) {
        const [l0, y0] = arch(st, th), [l1, y1] = arch(st, th + 1), r0 = rect(th), r1 = rect(th + 1);
        const c = cc(py[st % N] + y0 + 6, vnoise(st, th), 0.8, cI);
        quad(W(st, l0, y0), W(st, l1, y1), W(st, r1[0], r1[1]), W(st, r0[0], r0[1]), c, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = lam({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(own(g), m); mesh.name = "cave"; group.add(mesh);

    // crystals + lanterns (emissive, no lights)
    const crys = [], glow = [], pools = [];
    const hues = [0x4fe8ff, 0xff5ad8, 0xffb04a, 0x7dffb0, 0x9d7bff];
    const cg = new THREE.OctahedronGeometry(1, 0);
    let k = 0;
    for (let s = c0 + 6; s < c1 - 4; s += 7.5, k++) {
      const side = k % 2 ? 1 : -1, f = frame(s), hue = hues[(k * 7 + (k >> 2)) % hues.length];
      const lat = side * (aL - 1.0);
      const bx = f.x + f.rx * lat, bz = f.z + f.rz * lat;
      for (let q = 0; q < 4; q++) {
        const ox = (rng() - 0.5) * 2.2, oz = (rng() - 0.5) * 2.2, hgt = 1.2 + rng() * 2.4, y0 = f.y + 0.4 + rng() * 2;
        const lean = -side * (0.3 + rng() * 0.5);
        crys.push({ g: cg, m: mat(bx + ox - f.tx * oz * 0 + f.rx * (-side) * rng() * 0.8, y0 + hgt * 0.5, bz + oz, 0.32 + rng() * 0.25, hgt, 0.32 + rng() * 0.25, 0, f.h, lean), c: hue });
      }
      glow.push([bx - f.rx * side * 1.2, f.y + 2.2, bz - f.rz * side * 1.2, hue, 7 + rng() * 3]);
      pools.push({ x: f.x + f.rx * side * 3.2, y: f.y, z: f.z + f.rz * side * 3.2, hue, s });
    }
    // lanterns hang from the roof along the centre line
    const lant = [];
    for (let s = c0 + 11; s < c1 - 6; s += 15) {
      const f = frame(s); const ly = f.y + hC - 3.1;
      lant.push({ g: new THREE.BoxGeometry(0.45, 0.7, 0.45), m: mat(f.x, ly, f.z), c: 0xffc060 });
      lant.push({ g: new THREE.CylinderGeometry(0.04, 0.04, 2.6, 4), m: mat(f.x, ly + 1.65, f.z), c: 0x2a2018 });
      glow.push([f.x, ly, f.z, 0xffb050, 10]);
    }
    const parts = [...crys, ...lant].map((o) => part(o.g, o.m, o.c));
    const cm = new THREE.Mesh(own(bake(parts)), basic({ vertexColors: true })); cm.name = "crystals"; group.add(cm);
    // glow sprites (additive points)
    const gc = canvas(64, 64), gx = gc.getContext("2d"), gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
    const gtex = own(toTex(gc, { repeat: false }));
    const gp = new Float32Array(glow.length * 3), gcol = new Float32Array(glow.length * 3), tc = new THREE.Color();
    glow.forEach((g, i) => { gp.set([g[0], g[1], g[2]], i * 3); tc.setHex(g[3]); gcol.set([tc.r, tc.g, tc.b], i * 3); });
    const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(gp, 3)); pg.setAttribute("color", new THREE.BufferAttribute(gcol, 3));
    const pm = own(new THREE.PointsMaterial({ map: gtex, size: 9, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
    const pts = new THREE.Points(own(pg), pm); pts.frustumCulled = false; pts.name = "cave-glow"; group.add(pts);
    // light pools on the road
    {
      const pp = [], pc = [], pu = [];
      for (const pl of pools) {
        const R = 6.5; tc.setHex(pl.hue);
        const f = frame(pl.s);
        const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        const v = [];
        for (const [a, b2] of cs) v.push([pl.x + f.rx * a * R + f.tx * b2 * R, pl.z + f.rz * a * R + f.tz * b2 * R]);
        for (const [x, z] of v) { const yy = track.sample(pl.s).pos.y; pp.push(x, yy + 0.1, z); pc.push(tc.r * 0.55, tc.g * 0.55, tc.b * 0.55); }
        for (const [a, b2] of cs) pu.push(a * 0.5 + 0.5, b2 * 0.5 + 0.5);
      }
      const idx = []; for (let q = 0; q < pools.length; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
      const g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.Float32BufferAttribute(pp, 3)); g2.setAttribute("color", new THREE.Float32BufferAttribute(pc, 3)); g2.setAttribute("uv", new THREE.Float32BufferAttribute(pu, 2)); g2.setIndex(idx);
      const lm = own(new THREE.MeshBasicMaterial({ map: gtex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
      const lmesh = new THREE.Mesh(own(g2), lm); lmesh.name = "cave-pools"; lmesh.renderOrder = 3; group.add(lmesh);
    }
    // soften flicker of the lanterns/crystals
    anim.push((dt, t) => { pm.opacity = 0.72 + 0.1 * Math.sin(t * 3.1) + 0.05 * Math.sin(t * 7.3); });
  }

  // ============================================================ shade decals (canyon dusk shade + cave darkness)
  const shade = (sA, sB, alpha, fade, yy, name) => {
    const c = canvas(4, 128), g = c.getContext("2d");
    for (let y = 0; y < 128; y++) { const t = y / 127, a = alpha * Math.min(1, t / fade, (1 - t) / fade); g.fillStyle = `rgba(20,8,20,${a})`; g.fillRect(0, y, 4, 1); }
    const tex = own(toTex(c, { repeat: false }));
    const i0 = Math.floor(sA / ds), cnt = Math.ceil((sB - sA) / ds);
    const st = new Strips(C).add({ profile: [[-wallDist - 0.4, yy, 0], [wallDist + 0.4, yy, 1]], from: i0, count: cnt, tile: (sB - sA), vBase: i0 });
    const m = new THREE.Mesh(own(st.geometry()), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })));
    m.renderOrder = 2; m.name = name; group.add(m);
  };
  shade(LY.canyon[0] + 30, LY.canyon[1] - 20, 0.30, 0.12, 0.11, "canyon-shade");
  shade(c0 - 8, c1 + 8, 0.55, 0.14, 0.12, "cave-shade");

  // ============================================================ wooden trestle
  {
    const el = (i) => py[i] - gy(px[i], pz[i]);
    const iA = Math.floor((LY.trestle[0] - 40) / ds), iB = Math.ceil((LY.trestle[1] + 60) / ds);
    const mask = (i) => i >= iA && i <= iB && el(i) > 1.1;
    const deckCol = (i, j) => { const h = 0.82 + 0.3 * hash2(i >> 1, 7); return j === 1 ? [0.2 * h, 0.14 * h, 0.1 * h] : [0.43 * h, 0.3 * h, 0.2 * h]; };
    const W = wallDist + 0.55;
    const sk = new Strips(C).add({ profile: [[-W, -0.02, 0], [-W, -1.5, 0.3], [W, -1.5, 0.7], [W, -0.02, 1]], tile: 8, mask, color: deckCol });
    const dm = new THREE.Mesh(own(sk.geometry()), lam({ vertexColors: true, side: THREE.DoubleSide })); dm.name = "trestle-deck"; group.add(dm);
    // rails
    const rails = new Strips(C);
    for (const sg of [-1, 1]) for (const [y0, y1] of [[1.0, 1.28], [0.45, 0.65]]) rails.add({ profile: [[sg * (wallDist + 0.3), y0, 0], [sg * (wallDist + 0.3), y1, 1]], tile: 8, mask, color: () => [0.4, 0.28, 0.18] });
    group.add(new THREE.Mesh(own(rails.geometry()), lam({ vertexColors: true, side: THREE.DoubleSide })));
    // lower-leg samples (the road passing underneath)
    const lower = []; for (let i = 0; i < N; i++) { const s = i * ds; if (Math.abs(s - LY.gorgeFloor) < 90) lower.push(i); }
    const nearLower = (x, z, r) => { for (const j of lower) { const dx = x - px[j], dz = z - pz[j]; if (dx * dx + dz * dz < r * r) return true; } return false; };
    const parts = [], wood = [0x6b4a2c, 0x5c3f25, 0x7a5733, 0x4d3520];
    const wc = () => wood[Math.floor(rng() * wood.length)];
    const addBeam = (a, b, w, c) => { const { m } = beamMat(a, b, w); parts.push(part(new THREE.BoxGeometry(1, 1, 1), m, c)); };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const bents = [];
    for (let i = iA; i <= iB; i += 5) {
      if (!mask(i) || el(i) < 2.6) continue;
      const lat = wallDist + 0.1, top = py[i] - 1.4;
      const xl = px[i] - tz[i] * lat, zl = pz[i] + tx[i] * lat, xr = px[i] + tz[i] * lat, zr = pz[i] - tx[i] * lat;
      if (nearLower(xl, zl, wallDist + 2.6) || nearLower(xr, zr, wallDist + 2.6) || nearLower(px[i], pz[i], wallDist + 2.0)) continue;
      const bl = gy(xl, zl) - 0.8, br = gy(xr, zr) - 0.8;
      const lx = (rng() - 0.5) * 0.9, lz = (rng() - 0.5) * 0.9;
      addBeam(V(xl + lx, bl, zl + lz), V(xl, top, zl), 0.95, wc());
      addBeam(V(xr - lx, br, zr - lz), V(xr, top, zr), 0.95, wc());
      track.addObstacle(xl + lx * 0.3, zl + lz * 0.3, 0.85, Math.min(bl, br) - 1, top);
      track.addObstacle(xr - lx * 0.3, zr - lz * 0.3, 0.85, Math.min(bl, br) - 1, top);
      addBeam(V(xl, top - 0.2, zl), V(xr, top - 0.2, zr), 0.8, wc());
      const mid = (top + Math.min(bl, br)) / 2;
      addBeam(V(xl, mid, zl), V(xr, top - 0.3, zr), 0.35, wc());
      addBeam(V(xr, mid, zr), V(xl, top - 0.3, zl), 0.35, wc());
      addBeam(V(xl, Math.max(bl + 2, mid - 3), zl), V(xr, Math.max(br + 2, mid - 3), zr), 0.35, wc());
      parts.push(part(new THREE.BoxGeometry(2.0, 0.6, 2.0), mat(xl + lx, bl + 0.3, zl + lz), 0x8a7a62), part(new THREE.BoxGeometry(2.0, 0.6, 2.0), mat(xr - lx, br + 0.3, zr - lz), 0x8a7a62));
      bents.push({ i, xl, zl, xr, zr, top, mid });
    }
    // stringers between bents, and trusses over spans with no bent (the crossing)
    for (let k = 0; k < bents.length - 1; k++) {
      const a = bents[k], b = bents[k + 1], gap = (b.i - a.i) * ds;
      if (gap < 18) {
        addBeam(V(a.xl, a.mid, a.zl), V(b.xl, b.top - 0.4, b.zl), 0.3, wc());
        addBeam(V(a.xr, a.top - 0.4, a.zr), V(b.xr, b.mid, b.zr), 0.3, wc());
      } else {
        const n = Math.max(3, Math.round(gap / 5)), hgt = 3.4;
        for (const sg of [-1, 1]) {
          const lat = sg * (wallDist + 0.1);
          const pt = (i, yy) => V(px[i] - tz[i] * lat, py[i] + yy, pz[i] + tx[i] * lat);
          for (let q = 0; q <= n; q++) {
            const ii = Math.round(a.i + (b.i - a.i) * q / n), ii2 = Math.round(a.i + (b.i - a.i) * (q + 1) / n);
            addBeam(pt(ii, -1.4), pt(ii, hgt), 0.45, wc());
            if (q < n) { addBeam(pt(ii, hgt), pt(ii2, hgt), 0.5, wc()); addBeam(pt(ii, -1.2), pt(ii2, -1.2), 0.7, wc()); addBeam(q % 2 ? pt(ii, hgt) : pt(ii, -1.4), q % 2 ? pt(ii2, -1.4) : pt(ii2, hgt), 0.4, wc()); }
          }
        }
        // cross ties over the span, high enough to clear the camera
        for (let q = 1; q < n; q++) { const ii = Math.round(a.i + (b.i - a.i) * q / n), lat = wallDist + 0.1; addBeam(V(px[ii] - tz[ii] * lat, py[ii] - 1.1, pz[ii] + tx[ii] * lat), V(px[ii] + tz[ii] * lat, py[ii] - 1.1, pz[ii] - tx[ii] * lat), 0.5, wc()); }
      }
    }
    // rail posts
    for (let i = iA; i <= iB; i += 2) {
      if (!mask(i)) continue;
      for (const sg of [-1, 1]) { const lat = sg * (wallDist + 0.3); parts.push(part(new THREE.BoxGeometry(0.22, 1.5, 0.22), mat(px[i] - tz[i] * lat, py[i] + 0.65, pz[i] + tx[i] * lat), 0x4d3520)); }
    }
    if (parts.length) { const m = new THREE.Mesh(own(bake(parts)), lam({ vertexColors: true })); m.name = "trestle"; group.add(m); }
    X.trestleBents = bents.length;
  }
}
