// Skyway Station - orbital circuit above a ringed gas giant (theme "skyway").
// Cool teal / violet / white sci-fi. The road is a glowing deck floating in a star-field void: no terrain, a painted
// planet + nebula + star layers follow the camera, a translucent cloud deck sits far below. Everything is baked into a
// handful of meshes (solid + emissive vertex-coloured), plus a few animated groups (rings, dishes, reactor, wheels).
import * as THREE from "three";

const TAU = Math.PI * 2;
const TEAL = 0x2ff3e0, VIOLET = 0x9a78ff, ICE = 0xa8ecff, WHITE = 0xf2fbff;

const theme = {
  shoulder: 4.4, kerb: [0x25e6d4, 0xf4fbff], wallBase: "#e8f6ff", wallAccent: "#1fc7c0", wallText: ["SKYWAY", "APEX KARTS", "ORBITAL", "NOVA-X"],
  asphalt: "#8e9cb4", line: "#ffffff", padColor: "#35fff0", padColor2: "#9b6bff",
  ground: "#0a0d26", groundVar: 4, shoulderCol: "#2b3558",
  fog: [0x141a55, 240, 1500],
  hemi: [0xdcedff, 0x7a66d8, 1.5], sun: { color: 0xeaf6ff, i: 2.3, dir: [0.55, 0.6, -0.45] },
  sky: {
    stops: [[0, "#02030c"], [0.28, "#080b2c"], [0.42, "#1d1766"], [0.49, "#4a3bb0"], [0.52, "#3a2e9a"], [0.62, "#12104a"], [1, "#03030f"]],
    sun: { glow: "#bff3ff", disc: "#ffffff", size: 0.008 }, clouds: "#6a52e8", ridge: ["#3a2e96", "#2a2377"], stars: true,
  },
};

// ------------------------------------------------------------------ module-level geometry / matrix helpers
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16, 1),
  cone: new THREE.CylinderGeometry(0, 1, 1, 14, 1),
  sph: new THREE.SphereGeometry(1, 14, 10),
};
const _a = new THREE.Matrix4(), _b = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
// push a part into a bake list. base = {x,y,z,ry}; off/rot/sc in base-local space.
function put(list, geo, base, off, rot, sc, hex) {
  _a.makeRotationY(base.ry || 0).setPosition(base.x, base.y, base.z);
  const s = typeof sc === "number" ? [sc, sc, sc] : sc;
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  _b.compose(_p.set(off[0], off[1], off[2]), _q, _s.set(s[0], s[1], s[2]));
  list.push({ g: geo, m: _a.clone().multiply(_b), c: new THREE.Color(hex) });
}
const W0 = { x: 0, y: 0, z: 0, ry: 0 };
// a beam (unit cylinder/box along +y) between two world points
function beam(list, geo, ax, ay, az, bx, by, bz, t, hex) {
  _d.set(bx - ax, by - ay, bz - az); const len = _d.length(); if (len < 1e-3) return;
  _q.setFromUnitVectors(_u, _d.normalize());
  _b.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(t, len, t));
  list.push({ g: geo, m: _b.clone(), c: new THREE.Color(hex) });
}

export default {
  id: "skyway",
  theme,
  terrainAmp: 0,
  scenery(track, X, K) { buildSkyway(track, X, K); },
};

function buildSkyway(track, X, K) {
  const { C, rng, own, anim, group, bake, canvas, toTex, hw, wallDist, Strips } = X;
  const { lam, basic, R, pick, instanced, at } = K;
  const { N, ds, px, pz, tx, tz, py, curv } = C;
  const L = track.length, WH = X.WH;
  const idx = (u) => Math.max(0, Math.min(N - 1, Math.round((u * L) / ds)));
  const W = wallDist + 3.2;                        // deck half-width incl. outer catwalk
  const cT = new THREE.Color();
  const Hh = (a) => new THREE.Color(a);

  // ---------------------------------------------------------------- strip out the stock outdoor scenery (no ground up here)
  const KEEP = new Set(["road", "kerbs", "shoulder", "walls", "pads", "startline", "gantry", "sky"]);
  for (const ch of [...group.children]) if (!KEEP.has(ch.name)) group.remove(ch);
  for (const o of track.obstacles) { o.y0 = 1e9; o.y1 = 1e9; }     // engine viaduct pillars (terrain is hidden)

  // ---------------------------------------------------------------- baked part lists + glow point lists
  const SOL = [], GLO = [];
  const glow = { s: [], m: [], l: [] };            // x,y,z,r,g,b  (small/mid/large additive sprites)
  const gl = (k, x, y, z, hex) => { cT.set(hex); glow[k].push(x, y, z, cT.r, cT.g, cT.b); };
  const addGroupBake = (solid, glo, parent = group) => {
    const g = new THREE.Group();
    if (solid.length) g.add(new THREE.Mesh(own(bake(solid)), lam({ vertexColors: true })));
    if (glo.length) g.add(new THREE.Mesh(own(bake(glo)), basic({ vertexColors: true })));
    parent.add(g); return g;
  };

  // ---------------------------------------------------------------- textures
  const glowTex = (() => {
    const c = canvas(64, 64), g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,0.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return own(toTex(c, { repeat: false }));
  })();

  // road: bright panelled deck with glowing edge lines
  {
    const S = 512, c = canvas(S, S), g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, S, 0); gr.addColorStop(0, "#7d8cab"); gr.addColorStop(0.5, "#a3b2cc"); gr.addColorStop(1, "#7d8cab");
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) { const v = rng() < 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${rng() * 0.05})`; g.fillRect(rng() * S, rng() * S, 2 + rng() * 3, 2 + rng() * 3); }
    for (const cx of [0.3, 0.7]) { const l = g.createLinearGradient((cx - 0.08) * S, 0, (cx + 0.08) * S, 0); l.addColorStop(0, "rgba(40,50,90,0)"); l.addColorStop(0.5, "rgba(40,50,90,0.16)"); l.addColorStop(1, "rgba(40,50,90,0)"); g.fillStyle = l; g.fillRect((cx - 0.08) * S, 0, 0.16 * S, S); }
    g.strokeStyle = "rgba(30,40,80,0.45)"; g.lineWidth = 2;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(k * S / 4, 0); g.lineTo(k * S / 4, S); g.stroke(); }
    g.beginPath(); g.moveTo(0, 1); g.lineTo(S, 1); g.stroke(); g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
    g.fillStyle = "rgba(30,40,80,0.5)";
    for (const y of [4, S / 2 + 4]) for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(k * S / 4 + (k === 0 ? 8 : k === 4 ? -8 : 0) + 6, y + 5, 2.4, 0, TAU); g.fill(); }
    const lw = 0.0115 * S;
    g.fillStyle = "#0d2a3a"; g.fillRect(0.058 * S, 0, lw * 1.2, S); g.fillRect((0.942 - 0.0115 * 1.2) * S, 0, lw * 1.2, S);
    g.fillStyle = "rgba(60,255,235,0.95)"; g.fillRect(0.062 * S, 0, lw * 0.6, S); g.fillRect((0.938 - 0.0115 * 0.6) * S, 0, lw * 0.6, S);
    g.fillStyle = "#ffffff"; g.globalAlpha = 0.95;
    g.fillRect(0.035 * S, 0, lw, S); g.fillRect((0.965 - 0.0115) * S, 0, lw, S);
    for (let k = 0; k < 3; k++) g.fillRect(0.5 * S - lw * 0.4, (k / 3) * S, lw * 0.8, S / 6);
    g.globalAlpha = 1;
    const tex = own(toTex(c)), road = group.getObjectByName("road");
    if (road) { const m = road.material; m.map = tex; m.emissive = new THREE.Color(0x5b78a8); m.emissiveMap = tex; m.emissiveIntensity = 0.42; m.roughness = 0.5; m.metalness = 0.12; m.needsUpdate = true; }
    const wl = group.getObjectByName("walls");
    if (wl) { const m = wl.material; m.emissive = new THREE.Color(0x3d6c88); m.emissiveMap = m.map; m.needsUpdate = true; }
    const sh = group.getObjectByName("shoulder");
    if (sh) { sh.material.emissive = new THREE.Color(0x1b2548); sh.material.needsUpdate = true; }
  }

  // ---------------------------------------------------------------- deck structure: hull, keel, catwalk, running lights
  const hullMat = lam({ vertexColors: true, side: THREE.DoubleSide });
  {
    const hull = new Strips(C).add({
      profile: [[-W, 0, 0], [-W, -1.6, 0.2], [-W + 2.4, -3.0, 0.5], [W - 2.4, -3.0, 0.5], [W, -1.6, 0.8], [W, 0, 1]], tile: 8,
      color: (i, j) => (j === 0 || j === 4 ? [0.82, 0.9, 1.0] : j === 2 ? [0.2, 0.24, 0.42] : [0.3, 0.34, 0.55]),
    });
    for (const sg of [-1, 1]) hull.add({ profile: [[sg * (wallDist + 0.6), 0, 0], [sg * W, 0, 1]], tile: 8, color: () => [0.34, 0.4, 0.58] });
    hull.add({ profile: [[-1.5, -3.0, 0], [-0.9, -6.6, 0.3], [0.9, -6.6, 0.7], [1.5, -3.0, 1]], tile: 8, mask: (i) => i < idx(0.60) || i > idx(0.68), color: () => [0.22, 0.25, 0.42] });
    const m = new THREE.Mesh(own(hull.geometry()), hullMat); m.name = "hull"; group.add(m);
  }
  const dashTex = (() => { const c = canvas(16, 64), g = c.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, 16, 64); g.fillStyle = "#35fff0"; g.fillRect(0, 4, 16, 26); return own(toTex(c)); })();
  {
    const lights = new Strips(C);
    for (const sg of [-1, 1]) lights.add({ profile: [[sg * (W + 0.03), -0.3, 0], [sg * (W + 0.03), -1.1, 1]], tile: 7 });
    const m = new THREE.Mesh(own(lights.geometry()), basic({ map: dashTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.name = "runlights"; group.add(m);
    anim.push((dt) => { dashTex.offset.y -= dt * 1.1; });
  }

  // ---------------------------------------------------------------- guard rails: glass panes + glowing top rail + stanchions
  {
    const glass = new Strips(C), rail = new Strips(C);
    for (const sg of [-1, 1]) {
      glass.add({ profile: [[sg * wallDist, WH, 0], [sg * wallDist, WH + 1.4, 1]], tile: 8 });
      const o = sg * wallDist;
      rail.add({
        profile: [[o - 0.14, WH + 1.2, 0], [o - 0.14, WH + 1.55, 0], [o + 0.14, WH + 1.55, 0], [o + 0.14, WH + 1.2, 0]], tile: 8,
        color: (i) => { const h = 0.5 + 0.5 * Math.sin(i * 0.011); return [0.25 + 0.5 * h, 0.95 - 0.35 * h, 1.0]; },
      });
    }
    const gm = new THREE.Mesh(own(glass.geometry()), basic({ color: 0x8ff2ff, transparent: true, opacity: 0.17, side: THREE.DoubleSide, depthWrite: false })); gm.name = "glass"; gm.renderOrder = 2; group.add(gm);
    const rm = new THREE.Mesh(own(rail.geometry()), basic({ vertexColors: true, side: THREE.DoubleSide })); rm.name = "rail"; group.add(rm);
    for (let i = 0; i < N; i += 4) for (const sg of [-1, 1]) {
      const lat = sg * wallDist, x = px[i] - tz[i] * lat, z = pz[i] + tx[i] * lat;
      put(SOL, G.box, { x, y: py[i], z, ry: 0 }, [0, WH + 0.1, 0], [0, 0, 0], [0.2, 1.7, 0.2], 0xe8f4ff);
      if (i % 8 === 0) gl("s", x, py[i] + WH + 1.7, z, sg > 0 ? TEAL : VIOLET);
    }
  }

  // ---------------------------------------------------------------- landmark positions
  // tube / hangar / reactor ranges (fractions of the lap)
  const TUBE = [0.226, 0.328], HANG = [0.852, 0.93], LAUNCH_U = 0.346, HAIRPIN_U = 0.392;
  const inRange = (i, r) => i >= idx(r[0]) && i <= idx(r[1]);

  // ---------------------------------------------------------------- glass tube
  {
    const Rt = 18, cy = 4, i0 = idx(TUBE[0]), cnt = idx(TUBE[1]) - i0, SEG = 30;
    const ring = []; for (let k = 0; k <= SEG; k++) { const a = (k / SEG) * TAU; ring.push([Rt * Math.cos(a), cy + Rt * Math.sin(a), k / SEG]); }
    const shell = new Strips(C).add({ profile: ring, from: i0, count: cnt, tile: 8 });
    const sm = new THREE.Mesh(own(shell.geometry()), basic({ color: 0x78f2ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    sm.name = "tube"; sm.renderOrder = 3; group.add(sm);
    const strips = new Strips(C);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + 0.15, b = a + 0.05, r = Rt - 0.05;
      strips.add({ profile: [[r * Math.cos(a), cy + r * Math.sin(a), 0], [r * Math.cos(b), cy + r * Math.sin(b), 1]], from: i0, count: cnt, tile: 8, color: () => (k % 2 ? [0.7, 0.55, 1] : [0.55, 1, 0.98]) });
    }
    group.add(new THREE.Mesh(own(strips.geometry()), basic({ vertexColors: true, side: THREE.DoubleSide })));
    const ribs = [];
    for (let s = TUBE[0] * L; s <= TUBE[1] * L; s += 9) { const a = at(s, 0); ribs.push({ x: a.x, y: a.y + cy, z: a.z, ry: a.h, abs: true }); }
    instanced(new THREE.TorusGeometry(Rt, 0.5, 6, 30), lam({ color: 0xe6efff, emissive: 0x28406a }), ribs, "tube-ribs");
    for (const u of TUBE) {
      const a = at(u * L, 0);
      instanced(new THREE.TorusGeometry(Rt + 0.6, 1.3, 8, 36), basic({ color: u === TUBE[0] ? TEAL : VIOLET }), [{ x: a.x, y: a.y + cy, z: a.z, ry: a.h, abs: true }], "tube-portal");
      gl("l", a.x, a.y + cy + Rt, a.z, ICE); gl("m", a.x - a.rx * Rt, a.y + cy, a.z - a.rz * Rt, TEAL); gl("m", a.x + a.rx * Rt, a.y + cy, a.z + a.rz * Rt, TEAL);
    }
    for (let s = TUBE[0] * L + 20; s < TUBE[1] * L; s += 18) { const a = at(s, 0); gl("m", a.x, a.y + cy + Rt - 0.4, a.z, ICE); }
  }

  // ---------------------------------------------------------------- ring gates: launch ring (big, pulsing) + rotating ring segments
  const spinners = [];
  const ringGate = (u, Rr, up, o = {}) => {
    const a = at(u * L, 0), g = new THREE.Group(); g.position.set(a.x, a.y + up, a.z); g.rotation.y = a.h; group.add(g);
    const pivot = new THREE.Group(); g.add(pivot);
    const arcMat = lam({ color: o.color ?? 0xe4ecff, emissive: o.emissive ?? 0x2a4a88 });
    const n = o.arcs ?? 3;
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(Rr, o.tube ?? 0.8, 8, 22, (TAU / n) * 0.72), arcMat); m.rotation.z = (k * TAU) / n; pivot.add(m); own(m.geometry);
      const lt = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.5), basic({ color: o.light ?? TEAL })); own(lt.geometry);
      const aa = (k * TAU) / n + (TAU / n) * 0.36; lt.position.set(Rr * Math.cos(aa), Rr * Math.sin(aa), 0); lt.rotation.z = aa + Math.PI / 2; pivot.add(lt);
    }
    const frame = new THREE.Mesh(new THREE.TorusGeometry(Rr + (o.frameR ?? 2.4), o.frameT ?? 0.25, 6, 56), basic({ color: o.frame ?? TEAL })); own(frame.geometry); g.add(frame);
    spinners.push({ pivot, speed: o.speed ?? 0.5, frame });
    gl("l", a.x, a.y + up + Rr + 1, a.z, o.frame ?? TEAL);
    return { g, a, frame };
  };
  anim.push((dt, t) => { for (const s of spinners) s.pivot.rotation.z += dt * s.speed; });
  const launch = ringGate(LAUNCH_U, 24, 8, { speed: 0.9, tube: 1.3, arcs: 4, frameR: 3.2, frameT: 0.5, frame: 0xffffff, light: 0xffe27a });
  {   // countdown lamps along the top of the launch ring
    const lamps = [];
    for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), basic({ color: 0x35fff0 })); own(m.geometry); const aa = Math.PI / 2 + (k - 2) * 0.17; m.position.set(Math.cos(aa) * 28.2, Math.sin(aa) * 28.2, 0); launch.g.add(m); lamps.push(m); }
    anim.push((dt, t) => { const ph = Math.floor(t * 2.2) % 7; lamps.forEach((m, k) => { m.material.color.set(k < ph ? 0xffd34d : 0x1a6a78); }); launch.frame.material.color.setHSL(0.5, 0.2, 0.75 + 0.25 * Math.sin(t * 5)); });
  }
  for (const [u, up] of [[0.06, 7], [0.585, 7], [0.80, 7], [0.955, 7]]) ringGate(u, 21, up, { speed: u > 0.7 ? -0.45 : 0.5, color: u === 0.585 ? 0xe8e0ff : 0xe4ecff, frame: u === 0.585 || u === 0.955 ? VIOLET : TEAL, light: u === 0.585 ? VIOLET : TEAL });

  // ---------------------------------------------------------------- reactor core at the hairpin
  const reactor = (() => {
    const a1 = at((HAIRPIN_U - 0.02) * L, 0), a2 = at(HAIRPIN_U * L, 0), a3 = at((HAIRPIN_U + 0.02) * L, 0);
    const ax = a1.x, az = a1.z, bx = a2.x, bz = a2.z, cx = a3.x, cz = a3.z;
    const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
    const ux = ((ax * ax + az * az) * (bz - cz) + (bx * bx + bz * bz) * (cz - az) + (cx * cx + cz * cz) * (az - bz)) / d;
    const uz = ((ax * ax + az * az) * (cx - bx) + (bx * bx + bz * bz) * (ax - cx) + (cx * cx + cz * cz) * (bx - ax)) / d;
    const Rr = Math.hypot(ax - ux, az - uz), yb = a2.y;
    const Rin = Math.max(6, Rr - wallDist - 0.9);
    const g = new THREE.Group(); g.position.set(ux, yb, uz); group.add(g);
    const base = lam({ color: 0xcfd9f0, emissive: 0x1a2a50 }), dark = lam({ color: 0x2c3558 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(Rin, Rin + 0.8, 1.2, 28), base); disc.position.y = -0.7; own(disc.geometry); g.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(Rin, 0.3, 6, 40), basic({ color: TEAL })); rim.rotation.x = Math.PI / 2; rim.position.y = 0; own(rim.geometry); g.add(rim);
    const coreMat = basic({ color: TEAL });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(Rin * 0.26, Rin * 0.26, 30, 16), coreMat); core.position.y = 15; own(core.geometry); g.add(core);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(Rin * 0.55, Rin * 0.55, 30, 20, 1, true), basic({ color: 0x9ff6ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })); glass.position.y = 15; own(glass.geometry); glass.renderOrder = 3; g.add(glass);
    for (const yy of [0.2, 29.8]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(Rin * 0.62, Rin * 0.7, 1.6, 20), dark); cap.position.y = yy; own(cap.geometry); g.add(cap); }
    const rings = [];
    for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(Rin * (0.8 - k * 0.04), 0.5 + k * 0.1, 6, 36), basic({ color: k === 1 ? VIOLET : TEAL })); r.position.y = 8 + k * 7; r.rotation.x = Math.PI / 2; own(r.geometry); g.add(r); rings.push(r); }
    const gemMat = basic({ color: 0xffffff });
    const gem = new THREE.Mesh(new THREE.SphereGeometry(Rin * 0.3, 14, 10), gemMat); gem.position.y = 34; own(gem.geometry); g.add(gem);
    for (let k = 0; k < 6; k++) {   // coolant pillars around the base
      const aa = (k / 6) * TAU, rr = Rin * 0.82, p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 12, 8), base); p.position.set(Math.cos(aa) * rr, 5.4, Math.sin(aa) * rr); own(p.geometry); g.add(p);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4), basic({ color: VIOLET })); l.position.set(Math.cos(aa) * (rr + 0.95), 5.4, Math.sin(aa) * (rr + 0.95)); own(l.geometry); g.add(l);
      track.addObstacle(ux + Math.cos(aa) * rr, uz + Math.sin(aa) * rr, 1.1, yb - 2, yb + 14);
    }
    track.addObstacle(ux, uz, Rin * 0.62, yb - 3, yb + 32);
    const light = new THREE.PointLight(0x6af6ff, 2.4, 110, 1.6); light.position.set(ux, yb + 14, uz); group.add(light);
    gl("l", ux, yb + 15, uz, TEAL); gl("l", ux, yb + 34, uz, 0xffffff); gl("l", ux, yb + 5, uz, VIOLET);
    const c1 = new THREE.Color(TEAL), c2 = new THREE.Color(VIOLET), c3 = new THREE.Color();
    anim.push((dt, t) => {
      const p = 0.5 + 0.5 * Math.sin(t * 2.1);
      c3.copy(c1).lerp(c2, p); coreMat.color.copy(c3); gemMat.color.setHSL(0.5 + 0.15 * p, 0.6, 0.7 + 0.25 * Math.sin(t * 4.2));
      light.intensity = 1.8 + 1.4 * p; core.scale.set(1 + 0.12 * p, 1, 1 + 0.12 * p);
      rings.forEach((r, k) => { r.rotation.z += dt * (0.8 + k * 0.5) * (k % 2 ? -1 : 1); r.position.y = 8 + k * 7 + Math.sin(t * 1.3 + k * 2) * 1.2; });
    });
    return { x: ux, z: uz, y: yb, R: Rr };
  })();

  // ---------------------------------------------------------------- the crossing: pylons, hub, bracing
  {
    let bd = 1e18, bi = 0, bj = 0;
    for (let i = 0; i < N; i += 2) for (let j = 0; j < N; j += 2) {
      if (py[i] - py[j] < 5) continue;
      const dd = (px[i] - px[j]) ** 2 + (pz[i] - pz[j]) ** 2; if (dd < bd) { bd = dd; bi = i; bj = j; }
    }
    if (bd < 400) {
      const cx = (px[bi] + px[bj]) / 2, cz = (pz[bi] + pz[bj]) / 2, yU = py[bi], yL = py[bj];
      const e1 = [tx[bj], tz[bj]], e2 = [tx[bi], tz[bi]];       // lower road tangent / upper road tangent
      const hU = Math.atan2(e2[0], e2[1]), D = 27;
      const upper = { x: cx, y: yU, z: cz, ry: hU };
      // column + arms below
      put(SOL, G.cyl, W0, [cx, yL - 40, cz], [0, 0, 0], [5.5, 66, 5.5], 0xb9c6e4);
      put(SOL, G.cyl, W0, [cx, yL - 78, cz], [0, 0, 0], [3, 30, 3], 0x6c7aa8);
      for (const yy of [-10, -22]) { const t = new THREE.Mesh(new THREE.TorusGeometry(8 + (-yy - 10) * 0.2, 0.7, 6, 28), lam({ color: 0xd9e3ff })); t.position.set(cx, yL + yy, cz); t.rotation.x = Math.PI / 2; own(t.geometry); group.add(t); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        // local (upper road frame): z along upper tangent, x to its left; lower road runs along local x
        const lx = sx * D, lz = sz * D, c = Math.cos(hU), s = Math.sin(hU);
        const wx = cx + lx * c + lz * s, wz = cz - lx * s + lz * c;
        put(SOL, G.box, W0, [wx, (yL - 22 + yU) / 2 - 0.6, wz], [0, hU, 0], [3.8, yU - yL + 22 - 1.2, 3.8], 0xd2dcf2);
        put(GLO, G.box, W0, [wx, (yL - 22 + yU) / 2 - 0.6, wz], [0, hU, 0], [0.5, yU - yL + 20, 4.1], TEAL);
        put(SOL, G.box, W0, [wx, yU - 2.0, wz], [0, hU, 0], [5, 1.4, 5], 0x6d7ba8);
        // girder from pylon to the upper deck underside
        const gx = cx + (sx * 14) * c + lz * s, gz = cz - (sx * 14) * s + lz * c;
        put(SOL, G.box, W0, [gx, yU - 3.4, gz], [0, hU, 0], [Math.abs(lx) - 12, 1.6, 2.4], 0xb7c3e0);
        // arms to the central column
        beam(SOL, G.cyl, cx, yL - 20, cz, wx, yL - 21, wz, 1.4, 0x8f9cc4);
        beam(SOL, G.cyl, cx, yL - 9, cz, wx, yL - 21, wz, 0.8, 0x6c7aa8);
        // diagonal braces pylon -> pylon underside
        track.addObstacle(wx, wz, 2.9, yL - 24, yU + 1);
        gl("m", wx, yU - 1, wz, TEAL); gl("m", wx, yL + 6, wz, VIOLET);
        for (let k = 0; k < 4; k++) put(GLO, G.box, W0, [wx, yL - 14 + k * ((yU - yL + 12) / 3.4), wz], [0, hU, 0], [4.1, 0.25, 4.1], k % 2 ? VIOLET : TEAL);
      }
      track.addObstacle(cx, cz, 5.6, yL - 80, yL - 6);
      put(SOL, G.box, upper, [0, -3.6, 0], [0, 0, 0], [2 * (W + 1.0), 1.0, 5], 0xaab8da);     // cross-girder directly under the junction
      gl("l", cx, yU + 9, cz, ICE);
    }
  }

  // ---------------------------------------------------------------- hangar (docking bay)
  {
    const i0 = idx(HANG[0]), i1 = idx(HANG[1]), cnt = i1 - i0, Hw = 27, Ha = 21, Hb = 7;
    // floor outside the road corridor + roof arch + side walls
    const prof = [[-Hw, -0.1, 0], [-Hw, Hb, 0.05]];
    for (let k = 1; k < 14; k++) { const a = Math.PI - (k / 14) * Math.PI; prof.push([Hw * Math.cos(a), Hb + (Ha - Hb) * Math.sin(a), 0.05 + 0.9 * (k / 14)]); }
    prof.push([Hw, Hb, 0.95], [Hw, -0.1, 1]);
    const roof = new Strips(C).add({ profile: prof, from: i0, count: cnt, tile: 8, color: (i, j) => { const f = 0.42 + 0.1 * Math.sin(j * 1.2); return [f * 0.7, f * 0.78, f * 1.2]; } });
    const floor = new Strips(C);
    for (const sg of [-1, 1]) floor.add({ profile: [[sg * (W - 0.2), -0.1, 0], [sg * Hw, -0.1, 1]], from: i0, count: cnt, tile: 8, color: () => [0.2, 0.24, 0.36] });
    const rm = new THREE.Mesh(own(roof.geometry()), lam({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x141c3a })); rm.name = "hangar"; group.add(rm);
    group.add(new THREE.Mesh(own(floor.geometry()), hullMat));
    // light panels along the roof
    const lp = new Strips(C);
    for (const k of [3, 5, 7, 9, 11]) { const A = prof[k + 1], B = prof[k + 2]; lp.add({ profile: [[A[0] * 0.985, A[1] * 0.985 + 0.1, 0], [B[0] * 0.985, B[1] * 0.985 + 0.1, 1]], from: i0, count: cnt, tile: 8, color: (i) => ((i >> 2) % 2 ? [0.7, 1, 1] : [0.45, 0.8, 0.95]) }); }
    group.add(new THREE.Mesh(own(lp.geometry()), basic({ vertexColors: true, side: THREE.DoubleSide })));
    // arch ribs + columns
    const ribs = [];
    for (let s = HANG[0] * L + 6; s < HANG[1] * L; s += 12) { const a = at(s, 0); ribs.push({ x: a.x, y: a.y + Hb, z: a.z, ry: a.h, abs: true, sx: Hw / 20, sy: (Ha - Hb) / 20, sz: 1 }); }
    instanced(new THREE.TorusGeometry(20, 0.55, 6, 28, Math.PI), lam({ color: 0xcdd8f2, emissive: 0x1c2a52 }), ribs, "hangar-ribs");
    for (let s = HANG[0] * L + 6; s < HANG[1] * L; s += 12) for (const sg of [-1, 1]) { const a = at(s, 0); put(SOL, G.box, { x: a.x, y: a.y, z: a.z, ry: a.h }, [sg * (Hw - 0.5), Hb / 2, 0], [0, 0, 0], [1.1, Hb + 0.2, 1.1], 0xb7c3e0); }
    // big portals at both ends: frame + header with hazard stripes + the retracted hangar door
    const hz = (() => { const c = canvas(256, 64), g = c.getContext("2d"); g.fillStyle = "#101626"; g.fillRect(0, 0, 256, 64); g.fillStyle = "#ffd34d"; for (let x = -64; x < 300; x += 32) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 16, 64); g.lineTo(x + 48, 0); g.lineTo(x + 32, 0); g.fill(); } return own(toTex(c)); })();
    const sign = (() => { const c = canvas(512, 128), g = c.getContext("2d"); g.fillStyle = "#06101c"; g.fillRect(0, 0, 512, 128); g.strokeStyle = "#35fff0"; g.lineWidth = 6; g.strokeRect(4, 4, 504, 120); g.fillStyle = "#35fff0"; g.font = "900 70px Arial Black, Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("DOCK BAY 7", 256, 66); return own(toTex(c, { repeat: false })); })();
    const hzMat = basic({ map: hz }), signMat = basic({ map: sign });
    const doors = [];
    for (const [u, dir] of [[HANG[0], 1], [HANG[1], -1]]) {
      const a = at(u * L, 0), b = { x: a.x, y: a.y, z: a.z, ry: a.h };
      for (const sg of [-1, 1]) put(SOL, G.box, b, [sg * (Hw + 1.2), (Ha + 3) / 2, 0], [0, 0, 0], [3.2, Ha + 3, 4], 0xdfe7fa);
      put(SOL, G.box, b, [0, Ha + 2.2, 0], [0, 0, 0], [2 * Hw + 6, 3.4, 4], 0xdfe7fa);
      const hdr = new THREE.Mesh(new THREE.BoxGeometry(2 * Hw - 6, 2.2, 0.5), hzMat); own(hdr.geometry);
      const dd = new THREE.Group(); dd.position.set(a.x, a.y + Ha - 1.0, a.z); dd.rotation.y = a.h; group.add(dd);
      hdr.position.z = -dir * 2.1; dd.add(hdr);
      const hdr2 = hdr.clone(); hdr2.position.z = dir * 2.1; dd.add(hdr2);
      const sg2 = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), signMat); own(sg2.geometry); sg2.position.set(0, 3.2, -dir * 2.2); sg2.rotation.y = dir > 0 ? Math.PI : 0; dd.add(sg2);
      // retracted shutter slats stacked above the opening (they never reach the drivable height)
      for (let k = 0; k < 4; k++) put(SOL, G.box, b, [0, Ha - 4.3 + k * 0.0 + (k * 0.55), -dir * 0.0], [0, 0, 0], [2 * Hw - 2, 0.42, 1.0], k % 2 ? 0x56627f : 0x6d7a9c);
      gl("l", a.x, a.y + Ha + 2.3, a.z, TEAL);
      doors.push(dd);
      for (const sg of [-1, 1]) { gl("m", a.x + a.rx * sg * (Hw + 1.2), a.y + 10, a.z + a.rz * sg * (Hw + 1.2), 0xffd34d); gl("m", a.x + a.rx * sg * (Hw + 1.2), a.y + 15, a.z + a.rz * sg * (Hw + 1.2), 0xff6a4a); }
    }
    const hl = new THREE.PointLight(0x9ff0ff, 1.6, 120, 1.5); const mid = at(((HANG[0] + HANG[1]) / 2) * L, 0); hl.position.set(mid.x, mid.y + 15, mid.z); group.add(hl);
    for (let s = HANG[0] * L + 12; s < HANG[1] * L; s += 24) { const a = at(s, 0); gl("l", a.x, a.y + Ha - 1.2, a.z, 0xcff8ff); }

    // shuttles on the side decks (+ landing circles) and a few service tankers on the shoulders (collidable)
    const shuttle = (b, sc, hex) => {
      put(SOL, G.cyl, b, [0, 2.6 * sc, 0], [Math.PI / 2, 0, 0], [1.7 * sc, 11 * sc, 1.7 * sc], hex);
      put(SOL, G.cone, b, [0, 2.6 * sc, 6.9 * sc], [Math.PI / 2, 0, 0], [1.7 * sc, 3.4 * sc, 1.7 * sc], hex);
      for (const sg of [-1, 1]) {
        put(SOL, G.box, b, [sg * 3.6 * sc, 2.0 * sc, -1.8 * sc], [0, sg * 0.32, sg * 0.05], [6 * sc, 0.32 * sc, 4.4 * sc], 0xdfe7fa);
        put(SOL, G.cyl, b, [sg * 1.1 * sc, 2.4 * sc, -5.6 * sc], [Math.PI / 2, 0, 0], [0.75 * sc, 1.8 * sc, 0.75 * sc], 0x4a5578);
        put(GLO, G.cyl, b, [sg * 1.1 * sc, 2.4 * sc, -6.55 * sc], [Math.PI / 2, 0, 0], [0.6 * sc, 0.15 * sc, 0.6 * sc], ICE);
        put(SOL, G.box, b, [sg * 1.4 * sc, 0.75 * sc, 0.6 * sc], [0, 0, 0], [0.25 * sc, 1.5 * sc, 0.25 * sc], 0x4a5578);
        put(SOL, G.box, b, [sg * 5.6 * sc, 2.4 * sc, -2.9 * sc], [0, 0, sg * 0.0], [0.3 * sc, 1.1 * sc, 1.6 * sc], TEAL);
      }
      put(SOL, G.box, b, [0, 4.8 * sc, -4.6 * sc], [0, 0, 0], [0.3 * sc, 3.2 * sc, 2.6 * sc], 0xdfe7fa);
      put(GLO, G.box, b, [0, 3.7 * sc, 4.3 * sc], [-0.35, 0, 0], [1.8 * sc, 0.5 * sc, 1.8 * sc], 0x6ae8ff);
      put(SOL, G.box, b, [0, 0.8 * sc, 0.6 * sc], [0, 0, 0], [0.25 * sc, 0.25 * sc, 6 * sc], 0x4a5578);
      put(GLO, G.box, b, [0, 2.9 * sc, 0], [0, 0, 0], [1.74 * sc * 2, 0.16 * sc, 6 * sc], hex === 0xdfe7fa ? VIOLET : TEAL);
    };
    const cols = [0xdfe7fa, 0xc9d6f5, 0xe6dcff, 0xd0f2f0];
    let n = 0;
    for (let s = HANG[0] * L + 26; s < HANG[1] * L - 14; s += 40) for (const sg of [-1, 1]) {
      const a = at(s + sg * 8, sg * 21.5), b = { x: a.x, y: a.y - 0.1, z: a.z, ry: a.h + (sg > 0 ? 0.0 : Math.PI) + (n % 3 - 1) * 0.04 };
      shuttle(b, 1.0, cols[n++ % cols.length]);
      put(GLO, G.cyl, { x: a.x, y: a.y - 0.07, z: a.z, ry: 0 }, [0, 0, 0], [0, 0, 0], [8.5, 0.03, 8.5], 0x1c6f88);
      put(GLO, G.cyl, { x: a.x, y: a.y - 0.05, z: a.z, ry: 0 }, [0, 0, 0], [0, 0, 0], [7.6, 0.03, 7.6], 0x0b1226);
      track.addObstacle(a.x, a.z, 4.2, a.y - 2, a.y + 8);
    }
    // service tankers parked on the shoulders: solid, slalom pattern
    let side = -1;
    for (let s = HANG[0] * L + 34; s < HANG[1] * L - 20; s += 34) {
      const lat = side * (hw + 3.2), c0 = at(s, lat), b = { x: c0.x, y: c0.y, z: c0.z, ry: c0.h };
      put(SOL, G.cyl, b, [0, 1.75, 0], [Math.PI / 2, 0, 0], [1.5, 7.4, 1.5], 0xe6eeff);
      put(GLO, G.cyl, b, [0, 1.75, 0], [Math.PI / 2, 0, 0], [1.54, 1.4, 1.54], side > 0 ? TEAL : VIOLET);
      put(SOL, G.box, b, [0, 0.55, 0], [0, 0, 0], [1.9, 0.5, 8.2], 0x4a5578);
      put(SOL, G.cone, b, [0, 1.75, 4.1], [Math.PI / 2, 0, 0], [1.5, 1.0, 1.5], 0xe6eeff);
      put(SOL, G.cone, b, [0, 1.75, -4.1], [-Math.PI / 2, 0, 0], [1.5, 1.0, 1.5], 0xe6eeff);
      for (let k = -1; k <= 1; k++) { const q = at(s + k * 2.8, lat); track.addObstacle(q.x, q.z, 1.55, q.y - 1, q.y + 3.5); }
      gl("s", c0.x, c0.y + 3.0, c0.z, 0xffd34d);
      side = -side;
    }
    // radar dishes on the hangar roof
    const dishes = [];
    for (const u of [0.872, 0.91]) { const a = at(u * L, 0); dishes.push([a.x + a.rx * (u > 0.9 ? -10 : 10), a.y + Ha + 0.8, a.z + a.rz * (u > 0.9 ? -10 : 10), 1.0, u > 0.9 ? -0.5 : 0.7]); }
    X.skywayDishes = dishes;
  }

  // ---------------------------------------------------------------- radar dishes (spinning)
  const dishGeo = new THREE.SphereGeometry(1, 22, 6, 0, TAU, 0, 1.0).scale(1, 0.55, 1);
  const dishMat = lam({ color: 0xeaf1ff, side: THREE.DoubleSide, emissive: 0x16224a });
  const mastMat = lam({ color: 0x8794b8 });
  const addDish = (x, y, z, size, speed) => {
    const g = new THREE.Group(); g.position.set(x, y, z); group.add(g);
    const mast = new THREE.Mesh(G.cyl, mastMat); mast.scale.set(0.5 * size, 3 * size, 0.5 * size); mast.position.y = 1.5 * size; g.add(mast);
    const pivot = new THREE.Group(); pivot.position.y = 3 * size; g.add(pivot);
    const tilt = new THREE.Group(); tilt.rotation.x = -0.95; pivot.add(tilt);
    const bowl = new THREE.Mesh(dishGeo, dishMat); bowl.scale.setScalar(4.5 * size); tilt.add(bowl);
    const feed = new THREE.Mesh(G.cyl, mastMat); feed.scale.set(0.1 * size, 2.6 * size, 0.1 * size); feed.position.y = 1.5 * size; tilt.add(feed);
    const tip = new THREE.Mesh(G.sph, basic({ color: 0xff5a4a })); tip.scale.setScalar(0.28 * size); tip.position.y = 2.9 * size; tilt.add(tip);
    anim.push((dt, t) => { pivot.rotation.y += dt * speed; tip.visible = Math.sin(t * 3 + x) > -0.2; });
    gl("s", x, y + 3 * size + 3, z, 0xff5a4a);
  };
  for (const d of X.skywayDishes || []) addDish(...d);
  { const a = at(0.30 * L, 0); addDish(a.x + a.rx * -26, a.y + 4, a.z + a.rz * -26, 1.6, 0.5); }

  // ---------------------------------------------------------------- hub A (left lobe): habitat wheel + spine + dishes
  const ctr = { x: (track.bounds.minX + track.bounds.maxX) / 2, z: (track.bounds.minZ + track.bounds.maxZ) / 2 };
  const hubA = { x: -212, z: 32, y: 17 };
  {
    const S1 = [], G1 = [], Rw = 62, seg = 22;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU, th = -(a + Math.PI / 2), px0 = Math.cos(a) * Rw, pz0 = Math.sin(a) * Rw, len = ((TAU * Rw) / seg) * 0.92;
      put(S1, G.box, W0, [px0, 0, pz0], [0, th, 0], [len, 9, 11], k % 3 === 0 ? 0xc6d4f5 : 0xe4ecff);
      put(G1, G.box, W0, [Math.cos(a) * (Rw + 5.6), 1.6, Math.sin(a) * (Rw + 5.6)], [0, th, 0], [len * 0.82, 1.5, 0.2], k % 2 ? TEAL : ICE);
      put(G1, G.box, W0, [Math.cos(a) * (Rw + 5.6), -1.8, Math.sin(a) * (Rw + 5.6)], [0, th, 0], [len * 0.82, 0.6, 0.2], VIOLET);
      if (k % 2 === 0) beam(S1, G.cyl, 0, 0, 0, px0 * 0.99, 0, pz0 * 0.99, 1.1, 0x9aa8cf);
    }
    put(S1, G.cyl, W0, [0, 0, 0], [0, 0, 0], [8, 12, 8], 0xd6e0fa);
    const wheel = addGroupBake(S1, G1); wheel.position.set(hubA.x, hubA.y, hubA.z);
    anim.push((dt) => { wheel.rotation.y += dt * 0.06; });
    const S2 = [], G2 = [];
    const bs = { x: hubA.x, y: 0, z: hubA.z, ry: 0 };
    put(S2, G.cyl, bs, [0, hubA.y - 40, 0], [0, 0, 0], [5, 220, 5], 0x8b98c0);
    put(S2, G.cyl, bs, [0, hubA.y + 18, 0], [0, 0, 0], [6.5, 26, 6.5], 0xe4ecff);
    put(S2, G.cone, bs, [0, hubA.y + 36, 0], [0, 0, 0], [6.5, 12, 6.5], 0xc6d4f5);
    put(S2, G.cyl, bs, [0, hubA.y + 48, 0], [0, 0, 0], [0.5, 14, 0.5], 0xe4ecff);
    for (let k = 0; k < 5; k++) { put(G2, G.cyl, bs, [0, hubA.y + 6 + k * 5, 0], [0, 0, 0], [6.7, 0.5, 6.7], k % 2 ? TEAL : VIOLET); }
    for (let k = 0; k < 4; k++) put(S2, G.cyl, bs, [0, hubA.y - 10 - k * 30, 0], [0, 0, 0], [11 - k * 2, 1.4, 11 - k * 2], 0x6c7aa8);
    addGroupBake(S2, G2);
    gl("l", hubA.x, hubA.y + 55, hubA.z, 0xff5a4a); gl("l", hubA.x, hubA.y + 20, hubA.z, TEAL);
    addDish(hubA.x + 11, hubA.y + 30, hubA.z, 1.9, 0.35); addDish(hubA.x - 10, hubA.y + 24, hubA.z + 4, 1.3, -0.55);
    track.addObstacle(hubA.x, hubA.z, 8, -80, 80);
  }

  // ---------------------------------------------------------------- hub B (right lobe): solar array tower
  {
    const cx = 292, cz = -16, y0 = 36;
    const sol = (() => { const c = canvas(256, 64), g = c.getContext("2d"); g.fillStyle = "#0d1c52"; g.fillRect(0, 0, 256, 64); g.strokeStyle = "#3a6ae0"; g.lineWidth = 2; for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); } for (let y = 0; y <= 64; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); } g.fillStyle = "rgba(120,200,255,0.18)"; g.fillRect(0, 0, 256, 10); return own(toTex(c)); })();
    const panMat = lam({ map: sol, emissive: 0x16306e, emissiveMap: sol, side: THREE.DoubleSide });
    const arr = new THREE.Group(); arr.position.set(cx, y0, cz); group.add(arr);
    for (const sg of [-1, 1]) for (const dy of [-9, 9]) {
      const p = new THREE.Mesh(G.box, panMat); p.scale.set(36, 0.4, 14); p.position.set(sg * 24, dy, 0); arr.add(p);
      const bm = new THREE.Mesh(G.box, mastMat); bm.scale.set(24, 0.7, 0.7); bm.position.set(sg * 12, dy, 0); arr.add(bm);
    }
    const S3 = [], G3 = [], bs = { x: cx, y: 0, z: cz, ry: 0 };
    put(S3, G.cyl, bs, [0, y0 - 60, 0], [0, 0, 0], [3.2, 180, 3.2], 0xd6e0fa);
    put(S3, G.cyl, bs, [0, y0, 0], [0, 0, 0], [4.4, 26, 4.4], 0xe4ecff);
    put(S3, G.cone, bs, [0, y0 + 19, 0], [0, 0, 0], [4.4, 12, 4.4], 0xc6d4f5);
    for (let k = 0; k < 4; k++) put(G3, G.cyl, bs, [0, y0 - 10 + k * 7, 0], [0, 0, 0], [4.6, 0.4, 4.6], k % 2 ? VIOLET : TEAL);
    addGroupBake(S3, G3);
    anim.push((dt, t) => { arr.rotation.y += dt * 0.09; arr.rotation.z = Math.sin(t * 0.2) * 0.06; });
    addDish(cx, y0 + 25, cz, 1.2, 0.8);
    gl("l", cx, y0 + 30, cz, 0xff5a4a);
    track.addObstacle(cx, cz, 5, -80, 90);
  }

  // ---------------------------------------------------------------- holographic billboards (parody sponsors), one atlas, one mesh
  {
    const ads = [
      ["ZERO-G COLA", "NO BUBBLES. NO PROBLEMS.", "#35fff0"], ["GRAVITA-TEA", "FEEL LIGHTER THAN AIR", "#a98bff"],
      ["NOVA TYRES", "GRIP THE VOID", "#ffd34d"], ["SATURN EXPRESS", "NEXT RING IN 4 MIN", "#7fd8ff"],
      ["ORBITAL EATS", "FREEZE-DRIED FRIDAYS", "#ff8ad8"], ["WARPCO(TM)", "ALMOST LIGHTSPEED", "#6affc0"],
      ["MOON & SON LLP", "NO SUING ABOVE 100 KM", "#c9b8ff"], ["BREATHE-EASY AIR", "SUBSCRIBE TO OXYGEN", "#35fff0"],
    ];
    const TW = 768, TH = 288, c = canvas(TW, TH * ads.length), g = c.getContext("2d");
    ads.forEach(([t1, t2, col], k) => {
      const y = k * TH; g.fillStyle = "#02050d"; g.fillRect(0, y, TW, TH);
      const gr = g.createLinearGradient(0, y, 0, y + TH); gr.addColorStop(0, col + "30"); gr.addColorStop(1, col + "08"); g.fillStyle = gr; g.fillRect(0, y, TW, TH);
      g.strokeStyle = col; g.lineWidth = 8; g.strokeRect(8, y + 8, TW - 16, TH - 16);
      g.lineWidth = 2; g.strokeRect(22, y + 22, TW - 44, TH - 44);
      g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle";
      let fs = 96; g.font = `900 ${fs}px Arial Black, Impact, sans-serif`; while (g.measureText(t1).width > TW - 90 && fs > 30) { fs -= 4; g.font = `900 ${fs}px Arial Black, Impact, sans-serif`; }
      g.fillText(t1, TW / 2, y + 110);
      fs = 40; g.font = `700 ${fs}px Arial, sans-serif`; while (g.measureText(t2).width > TW - 100 && fs > 18) { fs -= 2; g.font = `700 ${fs}px Arial, sans-serif`; }
      g.fillStyle = "#ffffff"; g.fillText(t2, TW / 2, y + 196);
      g.fillStyle = col; g.globalAlpha = 0.5; g.beginPath(); g.arc(70, y + 70, 22, 0, TAU); g.arc(TW - 70, y + 70, 22, 0, TAU); g.fill(); g.globalAlpha = 1;
      g.fillStyle = "rgba(0,0,0,0.35)"; for (let yy = y + 2; yy < y + TH; yy += 5) g.fillRect(0, yy, TW, 2);
    });
    const atlas = own(toTex(c, { repeat: false }));
    const pos = [], uv = [], ind = [], places = [[0.035, 1], [0.105, -1], [0.19, 1], [0.205, -1], [0.405, 1], [0.47, -1], [0.525, 1], [0.60, -1], [0.70, 1], [0.745, -1], [0.82, 1], [0.945, -1], [0.14, -1]];
    let nb = 0;
    for (const [u, side] of places) {
      const a = at(u * L, 0), tg = new THREE.Vector3(Math.sin(a.h), 0, Math.cos(a.h));
      const nrm = new THREE.Vector3().copy(tg).multiplyScalar(-Math.cos(0.5)).add(new THREE.Vector3(a.rx, 0, a.rz).multiplyScalar(-side * Math.sin(0.5))).normalize();
      const rv = new THREE.Vector3(nrm.z, 0, -nrm.x);       // board's right (as seen by the viewer)
      const lat = side * (wallDist + 7.5), bx = a.x + a.rx * lat, bz = a.z + a.rz * lat, by = a.y + 11.5;
      const hwB = 11, hhB = 4.1, k = nb % ads.length, v1 = 1 - k / ads.length, v0 = 1 - (k + 1) / ads.length, o = pos.length / 3;
      for (const [sx, sy, uu, vv] of [[-1, -1, 0, v0], [1, -1, 1, v0], [1, 1, 1, v1], [-1, 1, 0, v1]]) { pos.push(bx + rv.x * hwB * sx, by + hhB * sy, bz + rv.z * hwB * sx); uv.push(uu, vv); }
      ind.push(o, o + 1, o + 2, o, o + 2, o + 3);
      // support: pole on the catwalk + arm
      const pxx = a.x + a.rx * side * (wallDist + 2.0), pzz = a.z + a.rz * side * (wallDist + 2.0);
      put(SOL, G.cyl, W0, [pxx, a.y + 4.8, pzz], [0, 0, 0], [0.32, 9.6, 0.32], 0xcfd9f2);
      beam(SOL, G.cyl, pxx, a.y + 8.8, pzz, bx, by - hhB - 0.2, bz, 0.22, 0xcfd9f2);
      beam(SOL, G.cyl, pxx, a.y + 3.0, pzz, bx, by - hhB - 0.2, bz, 0.16, 0x9aa8cf);
      gl("m", bx + rv.x * hwB, by + hhB, bz + rv.z * hwB, col2hex(ads[k][2])); gl("m", bx - rv.x * hwB, by + hhB, bz - rv.z * hwB, col2hex(ads[k][2]));
      nb++;
    }
    const bg = own(new THREE.BufferGeometry()); bg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); bg.setIndex(ind);
    const bm = basic({ map: atlas, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, opacity: 0.95 });
    const bmesh = new THREE.Mesh(bg, bm); bmesh.name = "billboards"; bmesh.renderOrder = 4; group.add(bmesh);
    anim.push((dt, t) => { bm.opacity = 0.86 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 2.1) + (Math.sin(t * 31) > 0.985 ? -0.3 : 0); });
  }
  function col2hex(s) { return parseInt(s.slice(1), 16); }

  // ---------------------------------------------------------------- flashing chevrons on the outside of corners
  {
    const mk = (right) => {
      const c = canvas(128, 128), g = c.getContext("2d");
      g.fillStyle = "#050a18"; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = right ? "#35fff0" : "#ffd34d"; g.lineWidth = 14; g.lineJoin = "miter";
      for (let k = 0; k < 2; k++) { g.beginPath(); const x = 24 + k * 44; if (right) { g.moveTo(x, 20); g.lineTo(x + 46, 64); g.lineTo(x, 108); } else { g.moveTo(128 - x, 20); g.lineTo(128 - x - 46, 64); g.lineTo(128 - x, 108); } g.stroke(); }
      g.strokeStyle = "#ffffff"; g.lineWidth = 5; g.strokeRect(3, 3, 122, 122);
      return own(toTex(c, { repeat: false }));
    };
    const tex = { right: mk(true), left: mk(false) };
    const mats = {}; for (const k of ["right", "left"]) for (const ph of [0, 1]) mats[k + ph] = basic({ map: tex[k], transparent: true, side: THREE.DoubleSide, opacity: 1 });
    const items = { right0: [], right1: [], left0: [], left1: [] }, posts = [];
    let last = -999, n = 0;
    const crossX = { x: 0, z: 0 };
    for (let i = 0; i < N; i++) {
      const k = curv[i];
      if (Math.abs(k) < 0.0105 || i * ds - last < 17 || inRange(i, TUBE) || inRange(i, HANG)) continue;
      if (Math.hypot(px[i] - crossX.x, pz[i] - crossX.z) < 60) continue;
      last = i * ds;
      const side = k > 0 ? -1 : 1, lat = side * (wallDist + 1.7), x = px[i] - tz[i] * lat, z = pz[i] + tx[i] * lat;
      const nxv = -tx[i] * Math.cos(0.5) + (-side * -tz[i]) * Math.sin(0.5), nzv = -tz[i] * Math.cos(0.5) + (-side * tx[i]) * Math.sin(0.5);
      const ry = Math.atan2(nxv, nzv);
      items[(k > 0 ? "right" : "left") + (n++ % 2)].push({ x, y: py[i] + 3.6, z, ry, abs: true });
      put(SOL, G.cyl, W0, [x, py[i] + 1.6, z], [0, 0, 0], [0.12, 3.2, 0.12], 0xcfd9f2);
      gl("m", x, py[i] + 5.6, z, k > 0 ? TEAL : 0xffd34d);
    }
    const pg = new THREE.PlaneGeometry(3.6, 3.6);
    for (const key of Object.keys(items)) if (items[key].length) instanced(pg, mats[key], items[key], "chevrons-" + key);
    anim.push((dt, t) => { const ph = Math.floor(t * 3.2) % 2; for (const k of ["right", "left"]) { mats[k + 0].opacity = ph === 0 ? 1 : 0.18; mats[k + 1].opacity = ph === 1 ? 1 : 0.18; } });
  }

  // ---------------------------------------------------------------- parked-shuttle style props done; far-field stations, antennae, asteroids
  {
    const farFromTrack = (x, z, d) => { for (let i = 0; i < N; i += 6) if ((px[i] - x) ** 2 + (pz[i] - z) ** 2 < d * d) return false; return true; };
    const farS = [], farG = [];
    const habs = [];
    let tries = 0, placed = 0;
    while (placed < 22 && tries++ < 600) {
      const a = rng() * TAU, r = 380 + rng() * 520, x = ctr.x + Math.cos(a) * r * 1.15, z = ctr.z + Math.sin(a) * r * 0.9;
      if (!farFromTrack(x, z, 190)) continue;
      const y = R(-70, 90), kind = placed % 5;
      const b = { x, y, z, ry: rng() * TAU };
      if (kind === 0 || kind === 3) {      // O'Neill cylinder (rotating)
        const S = [], Gg = [], len = R(160, 240), rad = R(26, 40);
        put(S, G.cyl, W0, [0, 0, 0], [Math.PI / 2, 0, 0], [rad, len, rad], 0xc9d6f5);
        for (let k = 0; k < 6; k++) { const aa = (k / 6) * TAU; put(Gg, G.box, W0, [Math.cos(aa) * (rad + 0.3), Math.sin(aa) * (rad + 0.3), 0], [0, 0, aa], [1.2, 2.2, len * 0.92], k % 2 ? TEAL : ICE); }
        for (const sg of [-1, 1]) { put(S, G.cone, W0, [0, 0, sg * (len / 2 + 6)], [sg * Math.PI / 2, 0, 0], [rad * 0.7, 12, rad * 0.7], 0x8b98c0); put(S, G.cyl, W0, [0, 0, sg * (len / 2 + 14)], [Math.PI / 2, 0, 0], [3, 18, 3], 0x6c7aa8); }
        const g = addGroupBake(S, Gg); g.position.set(x, y, z); g.rotation.y = b.ry; habs.push(g);
        g.userData.spin = 0.05 * (rng() < 0.5 ? 1 : -1);
      } else if (kind === 1) {              // sphere station with equator ring
        const rad = R(24, 36);
        put(farS, G.sph, b, [0, 0, 0], [0, 0, 0], rad, 0xdbe4fb);
        const t = new THREE.TorusGeometry(rad * 1.5, 2.2, 6, 30); put(farS, t, b, [0, 0, 0], [Math.PI / 2 + R(-0.2, 0.2), 0, 0], 1, 0xb7c3e6);
        put(farG, new THREE.TorusGeometry(rad * 1.5, 0.35, 4, 40), b, [0, 0, 0], [Math.PI / 2, 0, 0], 1, TEAL);
        put(farG, G.sph, b, [0, rad * 0.4, rad * 0.92], [0, 0, 0], rad * 0.14, 0x9fe8ff);
        gl("l", x, y + rad + 4, z, 0xff5a4a);
      } else if (kind === 2) {              // lattice mast
        const hgt = R(120, 220);
        put(farS, G.cyl, b, [0, hgt / 2 - 40, 0], [0, 0, 0], [2.4, hgt, 2.4], 0xcfd9f2);
        for (let k = 0; k < 4; k++) put(farG, G.cyl, b, [0, k * hgt / 4 - 30, 0], [0, 0, 0], [3.0, 0.5, 3.0], k % 2 ? VIOLET : TEAL);
        put(farS, G.box, b, [0, hgt - 40, 0], [0, 0, 0], [26, 1, 1], 0xcfd9f2); put(farS, G.box, b, [0, hgt - 52, 0], [0, 0, 0], [18, 1, 1], 0xcfd9f2);
        gl("l", x, y + hgt - 38, z, 0xff5a4a);
      } else {                               // asteroid cluster
        for (let k = 0; k < 4; k++) put(farS, new THREE.IcosahedronGeometry(1, 1), b, [R(-40, 40), R(-20, 20), R(-40, 40)], [rng() * 3, rng() * 3, rng() * 3], [R(8, 28), R(6, 20), R(8, 24)], pick([0x5a527a, 0x6b6290, 0x4a4a68]));
      }
      placed++;
    }
    addGroupBake(farS, farG);
    anim.push((dt) => { for (const h of habs) h.rotateZ?.(0); });
    X.skywayHabs = habs;
    const lis = habs.map((h) => h);
    anim.push((dt) => { for (const h of lis) { h.rotation.y += 0; h.children.forEach(() => {}); } });
    // spin cylinders about their own long axis
    for (const h of habs) { const sp = h.userData.spin; h.children.forEach((m) => { m.matrixAutoUpdate = true; }); const inner = new THREE.Group(); while (h.children.length) inner.add(h.children[0]); h.add(inner); anim.push((dt) => { inner.rotation.z += dt * sp; }); }
  }

  // ---------------------------------------------------------------- additive glow sprites ("bloom")
  {
    const mkPts = (arr, size, name, pulse) => {
      if (!arr.length) return;
      const n = arr.length / 6, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { p.set([arr[i * 6], arr[i * 6 + 1], arr[i * 6 + 2]], i * 3); c.set([arr[i * 6 + 3], arr[i * 6 + 4], arr[i * 6 + 5]], i * 3); }
      const g = own(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("color", new THREE.BufferAttribute(c, 3));
      const m = own(new THREE.PointsMaterial({ map: glowTex, size, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
      const pts = new THREE.Points(g, m); pts.name = name; pts.frustumCulled = false; pts.renderOrder = 5; group.add(pts);
      if (pulse) anim.push((dt, t) => { m.opacity = 0.65 + 0.3 * Math.sin(t * pulse); });
    };
    // wall-top lights get an extra "chase" sparkle through the small layer's pulse
    mkPts(glow.s, 3.4, "glow-s", 6.5); mkPts(glow.m, 8, "glow-m", 3.1); mkPts(glow.l, 30, "glow-l", 1.7);
  }

  // ---------------------------------------------------------------- sky: stars, nebulae, ringed planet, moon, cloud deck
  {
    const follow = (mesh) => {
      mesh.updateMatrix(); const local = mesh.matrix.clone(); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
      const T = new THREE.Matrix4();
      mesh.onBeforeRender = (r, s, cam) => { mesh.matrixWorld.copy(local).premultiply(T.makeTranslation(cam.position.x, cam.position.y, cam.position.z)); };
    };
    const skyMat = (map, blend) => own(new THREE.MeshBasicMaterial({
      map, fog: false, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      blending: blend ? THREE.AdditiveBlending : THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    }));
    const quad = (map, dir, dist, size, order, blend, roll = 0) => {
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(size, size)), skyMat(map, blend));
      const d = new THREE.Vector3(...dir).normalize().multiplyScalar(dist); m.position.copy(d); m.lookAt(0, 0, 0); m.rotateZ(roll); m.renderOrder = order; follow(m); group.add(m); return m;
    };
    // stars (all round, incl. below the horizon)
    {
      const n = 2400, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const z = rng() * 2 - 1, a = rng() * TAU, r = Math.sqrt(1 - z * z), d = 395;
        p.set([Math.cos(a) * r * d, z * d, Math.sin(a) * r * d], i * 3);
        const t = rng(), b = 0.35 + rng() * 0.65, tint = t < 0.15 ? [0.7, 0.8, 1] : t < 0.25 ? [1, 0.92, 0.75] : [1, 1, 1];
        c.set([tint[0] * b, tint[1] * b, tint[2] * b], i * 3);
      }
      const g = own(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("color", new THREE.BufferAttribute(c, 3));
      const stars = new THREE.Points(g, own(new THREE.PointsMaterial({ size: 1.9, sizeAttenuation: false, vertexColors: true, fog: false, depthTest: false, depthWrite: false })));
      stars.renderOrder = -98; stars.frustumCulled = false;
      const T = new THREE.Matrix4(); stars.matrixAutoUpdate = false; stars.onBeforeRender = (r, s, cam) => { stars.matrixWorld.makeTranslation(cam.position.x, cam.position.y, cam.position.z); void T; };
      group.add(stars);
    }
    // nebula clouds
    const nebula = (hues, seed) => {
      const S = 512, c = canvas(S, S), g = c.getContext("2d"); g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 70; i++) {
        const x = S / 2 + (rng() - 0.5) * S * 0.7, y = S / 2 + (rng() - 0.5) * S * 0.5, r = 40 + rng() * 120, col = hues[i % hues.length];
        const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${col},${0.06 + rng() * 0.08})`); rg.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      const fade = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.5); g.globalCompositeOperation = "destination-in"; fade.addColorStop(0, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = fade; g.fillRect(0, 0, S, S);
      void seed; return own(toTex(c, { repeat: false }));
    };
    quad(nebula(["110,70,230", "40,200,220", "200,90,220"], 1), [0.25, 0.28, 0.95], 360, 760, -99, true, 0.4);
    quad(nebula(["60,220,210", "90,120,255"], 2), [-0.85, 0.18, -0.45], 360, 700, -99, true, 1.2);
    quad(nebula(["170,90,255", "255,120,200", "90,160,255"], 3), [0.95, 0.35, -0.1], 360, 760, -99, true, 2.2);
    quad(nebula(["70,140,255", "120,70,230"], 4), [-0.3, -0.12, -0.95], 360, 800, -99, true, 0.9);
    // ringed gas giant (big, low on the horizon so the deck seems to float above it)
    {
      const S = 1024, c = canvas(S, S), g = c.getContext("2d"), cx0 = S / 2, cy0 = S / 2, pr = 250, tilt = -0.32, ky = 0.2;
      const ring = (front) => {
        g.save(); g.translate(cx0, cy0); g.rotate(tilt); g.beginPath(); if (front) g.rect(-S, 0, 2 * S, S); else g.rect(-S, -S, 2 * S, S); g.clip();
        for (const [o, i, col] of [[1.0, 0.93, "rgba(190,230,255,0.50)"], [0.92, 0.84, "rgba(130,170,255,0.30)"], [0.83, 0.79, "rgba(255,255,255,0.65)"], [0.78, 0.66, "rgba(180,150,255,0.42)"], [0.65, 0.58, "rgba(210,245,255,0.45)"]]) {
          g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, o * 490, o * 490 * ky, 0, 0, TAU); g.ellipse(0, 0, i * 490, i * 490 * ky, 0, 0, TAU, true); g.fill("evenodd");
        }
        g.restore();
      };
      ring(false);
      g.save(); g.beginPath(); g.arc(cx0, cy0, pr, 0, TAU); g.clip();
      const base = g.createLinearGradient(0, cy0 - pr, 0, cy0 + pr); base.addColorStop(0, "#7a6cf0"); base.addColorStop(0.5, "#b9a4ff"); base.addColorStop(1, "#4f8fe0"); g.fillStyle = base; g.fillRect(0, 0, S, S);
      const bands = ["#8fe9ff", "#ffffff", "#6a4ad8", "#c3a8ff", "#5ad0e8", "#9078ff", "#e8f2ff"];
      for (let y = cy0 - pr; y < cy0 + pr; y += 6) { g.fillStyle = bands[Math.floor(Math.abs(Math.sin(y * 0.071) * 3 + Math.sin(y * 0.19)) * 2) % bands.length]; g.globalAlpha = 0.16 + 0.1 * Math.abs(Math.sin(y * 0.37)); g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + y * 0.1) * 3); g.lineTo(S, y + 7); g.lineTo(0, y + 7); g.fill(); }
      g.globalAlpha = 1;
      const sh = g.createRadialGradient(cx0 - pr * 0.55, cy0 - pr * 0.5, pr * 0.15, cx0 - pr * 0.25, cy0 - pr * 0.2, pr * 1.55); sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(0.55, "rgba(10,10,60,0.25)"); sh.addColorStop(1, "rgba(2,2,25,0.88)"); g.fillStyle = sh; g.fillRect(0, 0, S, S);
      g.restore();
      g.save(); g.shadowColor = "rgba(150,200,255,0.9)"; g.shadowBlur = 24; g.strokeStyle = "rgba(170,215,255,0.5)"; g.lineWidth = 3; g.beginPath(); g.arc(cx0, cy0, pr, 0, TAU); g.stroke(); g.restore();
      ring(true);
      quad(own(toTex(c, { repeat: false })), [0.62, -0.14, -0.78], 340, 700, -97, false);
    }
    // moon + distant sun flare
    {
      const c = canvas(256, 256), g = c.getContext("2d"), r = g.createRadialGradient(100, 100, 5, 128, 128, 100); r.addColorStop(0, "#f4f8ff"); r.addColorStop(0.7, "#9aa6c8"); r.addColorStop(1, "#4a5273");
      g.fillStyle = r; g.beginPath(); g.arc(128, 128, 100, 0, TAU); g.fill();
      for (let i = 0; i < 14; i++) { g.fillStyle = "rgba(60,70,110,0.28)"; g.beginPath(); g.arc(60 + rng() * 140, 60 + rng() * 140, 5 + rng() * 14, 0, TAU); g.fill(); }
      const sh = g.createRadialGradient(80, 80, 20, 150, 150, 150); sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,20,0.75)"); g.fillStyle = sh; g.beginPath(); g.arc(128, 128, 100, 0, TAU); g.fill();
      quad(own(toTex(c, { repeat: false })), [-0.7, 0.34, 0.45], 330, 120, -96, false);
      const f = canvas(256, 256), fg = f.getContext("2d"), fr = fg.createRadialGradient(128, 128, 0, 128, 128, 128); fr.addColorStop(0, "rgba(255,255,255,1)"); fr.addColorStop(0.08, "rgba(210,245,255,0.8)"); fr.addColorStop(0.3, "rgba(120,200,255,0.25)"); fr.addColorStop(1, "rgba(80,120,255,0)");
      fg.fillStyle = fr; fg.fillRect(0, 0, 256, 256); fg.fillStyle = "rgba(255,255,255,0.7)"; fg.fillRect(0, 126, 256, 4); fg.fillRect(126, 0, 4, 256);
      quad(own(toTex(f, { repeat: false })), [0.55, 0.6, -0.25], 340, 300, -96, true);
    }
    // translucent storm deck far below
    {
      const S = 512, c = canvas(S, S), g = c.getContext("2d");
      g.clearRect(0, 0, S, S);
      for (let i = 0; i < 160; i++) {
        const x = rng() * S, y = rng() * S, r = 30 + rng() * 90, col = pick(["120,90,255", "70,210,235", "200,170,255", "255,255,255", "90,120,255"]);
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          const rg = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); rg.addColorStop(0, `rgba(${col},${0.10 + rng() * 0.16})`); rg.addColorStop(1, `rgba(${col},0)`);
          g.fillStyle = rg; g.save(); g.translate(x + ox, y + oy); g.scale(1, 0.45); g.translate(-(x + ox), -(y + oy)); g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r); g.restore();
        }
      }
      const cloudTex = own(toTex(c)); cloudTex.repeat.set(7, 7);
      const am = canvas(256, 256), ag = am.getContext("2d"), ar = ag.createRadialGradient(128, 128, 20, 128, 128, 128); ar.addColorStop(0, "#fff"); ar.addColorStop(0.62, "#999"); ar.addColorStop(1, "#000"); ag.fillStyle = ar; ag.fillRect(0, 0, 256, 256);
      const alpha = own(toTex(am, { repeat: false }));
      const deck = (y, size, op, speed) => {
        const m = new THREE.Mesh(own(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2)), own(new THREE.MeshBasicMaterial({ map: cloudTex, alphaMap: alpha, transparent: true, opacity: op, depthWrite: false, fog: false, color: 0xb8aaff })));
        m.position.set(ctr.x, y, ctr.z); m.renderOrder = -50; group.add(m);
        anim.push((dt) => { cloudTex.offset.x += dt * speed; });
      };
      deck(-300, 4200, 0.95, 0.0016);
    }
  }
}
