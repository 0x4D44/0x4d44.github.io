// What people carry.  About four in ten of the people on the platforms and trains have a bag: a rucksack on the back, or a bag in the left hand (a shopping tote, a
// carrier bag, a laptop case).  The bags are built here in code - no asset, nothing to credit - as soft lofted shapes with vertex colours, one shared material.
//
// A rucksack is fitted to its wearer.  The back, the shoulders and the chest are measured from the person's own mesh at rest (fitBody): the bag rests on the shoulder
// blades, and each strap is laid over the outside of the body - over the shoulder along the convex outline of the torso at that place, then round the ribs under the
// arm to the bottom corner of the bag.  Bag and straps ride on the upper spine, so they lean and turn with the chest.
// A hand bag hangs from the knuckles of the left hand and stays upright, as a thing on handles does; it is kept clear of the thigh.  The left hand, because the right
// is the one that gestures and takes a phone call; someone with a bag in the hand does not type on a phone with both thumbs.
// Sitting down, a bag goes on the lap.
//
// What it is not: nobody takes a bag off or puts one on (it is on the back, then it is on the lap); the bags are stiff (no sag, no swing of their own); and there are
// no shoulder bags or handbags on a long strap, which would need a strap fitted across a moving body.

export const BAGS = {
  strapW: 0.042, strapT: 0.007, lift: 0.006,     // a rucksack strap: width, thickness, and how far it is held off the body
  col: 0.026,                                     // half the width of the slice of the body a strap's line is measured in
  clear: 0.012,                                   // a hand bag is kept this far off the thigh
};
const RUCK = ['#1c2433', '#15171b', '#3b3f46', '#5a1d26', '#22402f', '#b58a1f', '#a3262a', '#1f5560', '#6b6f76', '#2d3a66'];
const KID = ['#d2447e', '#1f6fd0', '#7fb62c', '#6b3fa8', '#e0672a', '#16a0a0'];
const TOTE = ['#d8cfb8', '#2a3550', '#7a2f38', '#3d5a45', '#c7b037', '#e7e3da', '#44474d'];
const CARRIER = ['#f1f1ee', '#e8791e', '#2e7d3c', '#1d4fa0', '#f1f1ee', '#c9202a', '#f0d23c'];
const CASE = ['#17181b', '#2b2118', '#1d2634', '#3a3d42'];
const TROLLEY = ['#1f5560', '#a3262a', '#17181b', '#2d3a66', '#6b6f76', '#c7b037', '#5b2a6e', '#b9bdc2', '#22402f', '#d2447e'];
const HOLDALL = ['#15171b', '#2d3a66', '#a3262a', '#3d5a45', '#6b6f76', '#1f5560'];
const HANDBAG = ['#17181b', '#7a2f38', '#6a4526', '#c9b79a', '#2a3550', '#a3262a', '#3b3f46', '#b58a1f'];
const SHOPPER = ['#b89464', '#f1efe8', '#17181b', '#e7b7c2', '#1d4fa0', '#b89464', '#2e7d3c'];
const SATCHEL = ['#17181b', '#4a2e1b', '#6a4526', '#1d2634', '#3a3d42'];
export const KINDS = ['ruck', 'tote', 'carrier', 'case', 'handbag', 'holdall', 'shopper', 'trolley'];

/** Does this person carry a bag, and which?  c = { kid, staff, kind ('man' | 'woman' | 'teen' | 'elder' | ...), outfit, id, longHair, pet }.
 *  Returns null or { kind, colour (hex), hand: true for a bag carried in the hand }.  Always three draws from rng, whoever it is. */
export function pickBag(rng, c) {
  const a = rng(), b = rng(), k = rng(), pick = (list) => list[Math.floor(k * list.length) % list.length];
  if (!c || c.staff || c.pet || /highland|kilt/.test(c.outfit || '') && !/school/.test(c.outfit || '')) return null;   // staff are at work; the piper and the Highland dress are going somewhere smart
  const ruckOK = !c.longHair;   // hair down the back would hang through a rucksack
  const teen = c.kind === 'teen', elder = c.kind === 'elder', smart = /suit|commuter|coat|office|blazer/.test(c.id || '');
  const woman = c.kind === 'woman' || /woman|girl/.test(c.id || '');
  // the share of each: rucksack, tote, carrier, case, handbag, holdall, paper shopper, wheeled suitcase
  let P;
  if (c.kid) P = [0.5, 0, 0, 0, 0, 0, 0, 0];
  else if (teen) P = [0.48, 0.04, 0.06, 0, 0, 0.05, 0.03, 0];
  else if (elder) P = [0.03, 0.17, 0.12, 0, woman ? 0.16 : 0, 0, 0.08, 0.07];
  else if (smart) P = [0.14, 0.04, 0.03, 0.22, woman ? 0.1 : 0, 0.03, 0.02, 0.09];
  else P = [0.22, woman ? 0.06 : 0.07, 0.07, 0.04, woman ? 0.13 : 0, woman ? 0.03 : 0.06, woman ? 0.05 : 0.04, 0.08];   // (people review 1: 27% of a platform carried anything and nobody towed a case; these come to about 6 in 10)
  let t = a, i = 0; while (i < P.length && t >= P[i]) t -= P[i++];
  switch (i) {
    case 0: if (ruckOK) return { kind: 'ruck', colour: pick(c.kid ? KID : RUCK), hand: false, style: !c.kid && !teen && b > 0.72 ? 'hike' : 'day' }; return c.kid || b < 0.5 ? null : { kind: 'tote', colour: pick(TOTE), hand: true };
    case 1: return { kind: 'tote', colour: pick(TOTE), hand: true };
    case 2: return { kind: 'carrier', colour: pick(CARRIER), hand: true };
    case 3: return { kind: 'case', colour: pick(LUG ? SATCHEL : CASE), hand: true };
    case 4: return { kind: 'handbag', colour: pick(HANDBAG), hand: true };
    case 5: return { kind: 'holdall', colour: pick(HOLDALL), hand: true };
    case 6: return { kind: 'shopper', colour: pick(SHOPPER), hand: true };
    case 7: return { kind: 'trolley', colour: pick(TROLLEY), hand: true, style: b > 0.62 && !elder ? 'large' : 'cabin' };
  }
  return null;
}

/** the size of a rucksack for a body: sw = half the width across the shoulder joints, torso = shoulder joint down to the hip joint, h = the person's height (m) */
export function ruckSize(sw, torso, h) {
  const s = Math.min(1.05, Math.max(0.6, h / 1.75));
  return { s, W: Math.min(0.3 * s, 1.5 * sw), H: Math.min(0.45 * s, 0.86 * torso), D: 0.15 * s };
}

/** The outline a strap follows over a shoulder.  pts = [[f, y], ...]: points of the body in a thin slice, f forward, y up.  from = [f, y] behind the back (on the bag),
 *  yEnd = the height on the chest where the strap ends.  Returns the convex outline from `from`, over the top, down the front to yEnd: [[f, y], ...], or null. */
export function overShoulder(pts, from, yEnd) {
  const P = pts.filter((p) => p[1] >= yEnd && p[0] > from[0]); if (P.length < 4) return null;
  P.push(from); P.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const up = []; for (const p of P) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) >= 0) up.pop(); up.push(p); }   // the upper chain, back to front
  if (up[0] !== from) return null;
  // then down the front: from the foremost point, the lower chain walked backwards as far as the lowest point of the front half
  const lo = []; for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) >= 0) lo.pop(); lo.push(p); }
  const out = up.slice(), fm = (from[0] + up[up.length - 1][0]) / 2;
  for (let i = 1; i < lo.length; i++) { if (lo[i][0] < fm || lo[i][1] > lo[i - 1][1] + 1e-6) break; out.push(lo[i]); if (lo[i][1] <= yEnd + 0.012) break; }
  return out.length >= 3 ? out : null;
}

// ---------------------------------------------------------------------------------------------------------------- shapes
class Shape {
  constructor() { this.P = []; this.C = []; this.I = []; }
  _emit(lp, li, col, flat) {
    if (flat) { for (const i of li) { this.I.push(this.P.length / 3); this.P.push(lp[i * 3], lp[i * 3 + 1], lp[i * 3 + 2]); this.C.push(col.r, col.g, col.b); } return; }
    const b = this.P.length / 3; for (let i = 0; i < lp.length; i += 3) { this.P.push(lp[i], lp[i + 1], lp[i + 2]); this.C.push(col.r, col.g, col.b); } for (const i of li) this.I.push(b + i);
  }
  /** a skin over rings of points (each [[x, y, z], ...], the same count in every ring), closed at both ends */
  loft(rings, col, flat = false, caps = true) {
    const n = rings[0].length, lp = [], li = [];
    for (const r of rings) for (const p of r) lp.push(p[0], p[1], p[2]);
    for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < n; j++) { const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + (j + 1) % n, d = (i + 1) * n + j; li.push(a, b, c, a, c, d); }
    if (caps) for (const [ri, flip] of [[0, true], [rings.length - 1, false]]) {
      const r = rings[ri], m = [0, 0, 0]; for (const p of r) { m[0] += p[0] / n; m[1] += p[1] / n; m[2] += p[2] / n; }
      const c = lp.length / 3; lp.push(m[0], m[1], m[2]); for (let j = 0; j < n; j++) { const a = ri * n + j, b = ri * n + (j + 1) % n; if (flip) li.push(c, b, a); else li.push(c, a, b); }
    }
    this._emit(lp, li, col, flat);
  }
  /** a flat strap along a line: pts [[x, y, z], ...], nrm the way out of the body at each point, w wide, t thick */
  ribbon(pts, nrm, w, t, col) {
    const rings = [], N = pts.length, nz = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)], tg = nz([b[0] - a[0], b[1] - a[1], b[2] - a[2]]), n = nz(nrm[i]);
      const s = nz([tg[1] * n[2] - tg[2] * n[1], tg[2] * n[0] - tg[0] * n[2], tg[0] * n[1] - tg[1] * n[0]]), p = pts[i], r = [];
      for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) r.push([p[0] + s[0] * u * w / 2 + n[0] * v * t, p[1] + s[1] * u * w / 2 + n[1] * v * t, p[2] + s[2] * u * w / 2 + n[2] * v * t]);
      rings.push(r);
    }
    this.loft(rings, col, true);
  }
  build(T) {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(this.P, 3)); g.setAttribute('color', new T.Float32BufferAttribute(this.C, 3)); g.setIndex(this.I);
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  }
}
/** a rounded rectangle: 12 points round (cx, cz) at height y, half-sizes a (x) and b (z), corner radius r */
function rrect(cx, y, cz, a, b, r) {
  r = Math.min(r, a, b); const o = [];
  for (const [sx, sz, t0] of [[1, 1, 0], [-1, 1, 1], [-1, -1, 2], [1, -1, 3]]) for (let k = 0; k < 3; k++) {
    const ang = (t0 + k / 2) * Math.PI / 2, c = Math.cos(ang), s = Math.sin(ang);
    o.push([cx + sx * (a - r) + r * (Math.abs(c) < 1e-9 ? 0 : c), y, cz + sz * (b - r) + r * (Math.abs(s) < 1e-9 ? 0 : s)]);
  }
  return o;
}
const shade = (T, hex, k) => new T.Color(hex).multiplyScalar(k);

// the luggage made in Blender (tools/assets_luggage.py -> models/luggage.glb): name -> { parts: [{ geo, mat }], ud }.  Without it the bags are the plain ones made here.
let LUG = null;
/** hand over the loaded models/luggage.glb (a GLTFLoader result).  Call it before the crowd is made. */
export function setLuggage(gltf) {
  if (!gltf || !gltf.scene) { LUG = null; return 0; } const L = {};
  for (const o of gltf.scene.children) { const parts = []; o.traverse((m) => { if (m.isMesh) parts.push({ geo: m.geometry, mat: m.material }); }); if (parts.length) L[o.name] = { parts, ud: o.userData || {} }; }
  LUG = Object.keys(L).length ? L : null; return LUG ? Object.keys(L).length : 0;
}
export const luggageNames = () => (LUG ? Object.keys(LUG) : []);
/** one piece of luggage in a colour: a Group of meshes that share the model's geometry; the cloth takes the colour, its panels a darker shade of it */
function lugObj(T, name, hex) {
  const L = LUG && LUG[name]; if (!L) return null; const K = kit(T), g = new T.Group(); g.name = 'bag_' + name; if (!K.lmat) K.lmat = new Map();
  for (const pt of L.parts) { const n = pt.mat.name, tint = n === 'lug_main' || n === 'lug_second', key = tint ? n + hex : n; let m = K.lmat.get(key);
    if (!m) { m = pt.mat.clone(); m.name = n; if (tint) { m.color.set(hex); if (n === 'lug_second') m.color.multiplyScalar(0.58); } K.lmat.set(key, m); }
    const me = new T.Mesh(pt.geo, m); me.name = 'bag_part'; g.add(me); }
  return g;
}
const LUG_OF = { case: 'satchel', handbag: 'handbag', holdall: 'holdall', shopper: 'shopper' }, PLAIN_OF = { handbag: 'tote', holdall: 'tote', shopper: 'carrier', trolley: 'case' };

const kits = new WeakMap();
function kit(T) { let k = kits.get(T); if (!k) { k = { mat: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: T.DoubleSide }), geo: new Map() }; k.mat.name = 'bag'; kits.set(T, k); } return k; }

/** the body of a rucksack: x across, y up from its bottom, z = 0 the face that lies on the wearer's back, the bag behind it (z < 0) */
function ruckGeo(T, d, hex) {
  const key = `ruck|${d.W.toFixed(3)}|${d.H.toFixed(3)}|${d.D.toFixed(3)}|${hex}`, K = kit(T); let g = K.geo.get(key); if (g) return g;
  const S = new Shape(), main = new T.Color(hex), dark = shade(T, hex, 0.62), trim = new T.Color('#1a1b1e');
  const prof = [[0, 0.74, 0.62], [0.05, 0.93, 0.9], [0.28, 1, 1], [0.68, 0.97, 0.94], [0.9, 0.82, 0.72], [1, 0.52, 0.4]], rings = [];
  for (const [t, a, b] of prof) { const hw = d.W / 2 * a, hd = d.D / 2 * b; rings.push(rrect(0, t * d.H, -hd, hw, hd, Math.min(hw, hd) * 0.7)); }
  S.loft(rings, main);
  const pk = [[0.07, 0.58], [0.12, 0.76], [0.42, 0.78], [0.5, 0.6]], pr = [];   // the front pocket, proud of the bag
  for (const [t, a] of pk) pr.push(rrect(0, t * d.H, -d.D * 0.97, d.W / 2 * a, d.D * 0.2, d.D * 0.12));
  S.loft(pr, dark);
  const hy = d.H * 0.985, hz = -d.D * 0.16, hw = d.W * 0.1;   // the grab handle on top
  S.ribbon([[-hw, hy - 0.012, hz], [-hw * 0.6, hy + 0.022, hz], [hw * 0.6, hy + 0.022, hz], [hw, hy - 0.012, hz]], [[-0.5, 1, 0], [0, 1, 0], [0, 1, 0], [0.5, 1, 0]], 0.022, 0.005, trim);
  g = S.build(T); K.geo.set(key, g); return g;
}
/** a bag carried in the hand: the top of its handles at the origin, the bag below; thin across x, wide along z.  Returns { geo, w, h, d, drop } */
function handGeo(T, kind, hex, s) {
  const key = `${kind}|${hex}|${s.toFixed(2)}`, K = kit(T); let o = K.geo.get(key); if (o) return o;
  const S = new Shape(), main = new T.Color(hex), dark = shade(T, hex, 0.6), trim = new T.Color('#1a1b1e');
  let w, h, d, drop;
  const body = (prof, col, flat) => { const rings = []; for (const [t, a, b] of prof) rings.push(rrect(0, -drop - h + t * h, 0, d / 2 * b, w / 2 * a, Math.min(d / 2 * b, w / 2 * a) * (flat ? 0.25 : 0.55))); S.loft(rings, col, flat); };
  const handle = (z0, x, ht, col, wd) => S.ribbon([[x, -drop - 0.01, -z0], [x * 0.5, -ht * 0.35, -z0 * 0.5], [0, 0, 0], [x * 0.5, -ht * 0.35, z0 * 0.5], [x, -drop - 0.01, z0]], [[0, 0.3, -1], [0, 0.7, -0.7], [0, 1, 0], [0, 0.7, 0.7], [0, 0.3, 1]], wd, 0.004, col);
  if (kind === 'tote') {   // a cloth shopping bag on two long handles
    w = 0.36 * s; h = 0.36 * s; d = 0.11 * s; drop = 0.2 * s;
    body([[0, 0.84, 0.86], [0.08, 0.9, 1], [0.5, 0.96, 0.92], [0.92, 1, 0.5], [1, 1, 0.3]], main);
    handle(w * 0.2, d * 0.14, drop, dark, 0.024); handle(w * 0.2, -d * 0.14, drop, dark, 0.024);
  } else if (kind === 'carrier') {   // a plastic carrier bag, full at the bottom, gathered at the top
    w = 0.3 * s; h = 0.36 * s; d = 0.14 * s; drop = 0.07 * s;
    body([[0, 0.7, 0.7], [0.07, 0.9, 1], [0.35, 1, 0.94], [0.7, 0.92, 0.55], [0.93, 0.7, 0.2], [1, 0.55, 0.1]], main);
    handle(w * 0.1, 0.004, drop, main, 0.03); handle(w * 0.1, -0.004, drop, main, 0.03);
  } else {   // a laptop case: stiff, flat, one short handle
    w = 0.4 * s; h = 0.29 * s; d = 0.085 * s; drop = 0.045 * s;
    body([[0, 0.97, 0.96], [0.04, 1, 1], [0.96, 1, 1], [1, 0.97, 0.96]], main, true);
    const fl = []; for (const t of [0.5, 0.97]) fl.push(rrect(0, -drop - h + t * h, 0, d / 2 + 0.004, w / 2 * 0.99, 0.01)); S.loft(fl, dark, true);   // the flap
    handle(w * 0.14, 0, drop, trim, 0.02);
  }
  o = { geo: S.build(T), w, h, d, drop }; K.geo.set(key, o); return o;
}

// ---------------------------------------------------------------------------------------------------------------- fitting
const ARM = /^(upperarm|lowerarm|hand|index|middle|pinky|ring|thumb)_/, LEG = /^(thigh|calf|foot|ball)_/, HEAD = /^head$/;

/** Measure a person for bags.  rest: a clone of the character in its rest pose, at the origin (its bones named plainly).  h: the person's height.
 *  Returns { ok, longHair, fz, midx, side, hip, size, top, fB, inv (the upper spine's frame, to hang the rucksack on), straps (a geometry, or null) } or null. */
export function fitBody(T, rest, h = 1.75) {
  rest.updateMatrixWorld(true); const B = {}; rest.traverse((o) => { if (o.isBone && !B[o.name]) B[o.name] = o; });
  for (const n of ['spine_03', 'pelvis', 'upperarm_l', 'hand_l', 'foot_l', 'ball_l', 'thigh_l', 'neck_01']) if (!B[n]) return null;
  const wp = (n) => new T.Vector3().setFromMatrixPosition(B[n].matrixWorld), sp = wp('spine_03'), ua = wp('upperarm_l'), th = wp('thigh_l');
  const fz = Math.sign(wp('ball_l').z - wp('foot_l').z) || 1, midx = sp.x, side = Math.sign(wp('hand_l').x - midx) || 1;
  const shY = ua.y, sw = Math.abs(ua.x - midx), hipY = th.y, spF = fz * sp.z;
  const torso = [], v = new T.Vector3(); let hairBack = 0, hip = 0;
  rest.traverse((m) => {
    if (!m.isSkinnedMesh || !m.material) return; const name = m.material.name || ''; if (/^(eye_|scalp_|alpha_brows)/.test(name)) return;
    const hair = /^alpha_/.test(name), g = m.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw4 = g.attributes.skinWeight; if (!si || !sw4) return;
    m.skeleton.update(); const cls = m.skeleton.bones.map((b) => (ARM.test(b.name) ? 1 : LEG.test(b.name) ? 2 : HEAD.test(b.name) ? 3 : 0));
    for (let i = 0; i < pos.count; i++) {
      const w = [0, 0, 0, 0]; for (let k = 0; k < 4; k++) w[cls[si.getComponent(i, k)] || 0] += sw4.getComponent(i, k);
      if (!hair && (w[1] > 0.35 || w[3] > 0.3)) continue;
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld); const x = fz * (v.x - midx), f = fz * v.z;
      if (hair) { if (v.y < shY + 0.02 && f < spF) hairBack++; continue; }
      if (v.y < hipY + 0.02 && v.y > hipY - 0.4) hip = Math.max(hip, Math.abs(x));
      if (w[2] > 0.3 || v.y < hipY - 0.08) continue;
      torso.push([x, v.y, f]);
    }
  });
  const out = { ok: false, longHair: hairBack > 12, fz, midx, side, hip: hip || 0.17, straps: null };
  if (torso.length < 60) return out;
  const size = ruckSize(sw, shY - hipY, h), top = shY - 0.035 * size.s, bot = top - size.H;
  const back = torso.filter((p) => Math.abs(p[0]) < size.W / 2 && p[1] > bot && p[1] < top && p[2] < spF + 0.02).map((p) => p[2]).sort((a, b) => a - b); if (back.length < 8) return out;
  const fB = back[Math.floor(back.length * 0.03)] - 0.003;   // the bag lies on what sticks out most: the shoulder blades
  // the body's radius round the spine, by height and bearing: the way a strap goes round the ribs
  const fc = (fB + Math.max(...torso.filter((p) => p[1] > bot && p[1] < top).map((p) => p[2]))) / 2, DY = 0.03, NA = 24, y0 = bot - 0.06, rows = Math.ceil((top + 0.1 - y0) / DY), R = new Float32Array(rows * NA);
  for (const p of torso) { const r = Math.floor((p[1] - y0) / DY); if (r < 0 || r >= rows) continue; const a = Math.atan2(p[0], p[2] - fc), c = ((Math.floor((a + Math.PI) / (2 * Math.PI) * NA) % NA) + NA) % NA, d = Math.hypot(p[0], p[2] - fc); if (d > R[r * NA + c]) R[r * NA + c] = d; }
  const rad = (y, a) => { const r = Math.min(rows - 1, Math.max(0, Math.floor((y - y0) / DY))), c = ((Math.floor((a + Math.PI) / (2 * Math.PI) * NA) % NA) + NA) % NA; let m = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr; if (rr < 0 || rr >= rows) continue; m = Math.max(m, R[rr * NA + (c + dc + NA) % NA]); } return m; };
  const S = new Shape(), strap = new T.Color('#1b1c20'), yEnd = shY - 0.2 * size.s, xs = Math.min(0.7 * sw, size.W / 2 - 0.03); let made = 0;
  for (const sd of [-1, 1]) {
    let tol = BAGS.col, col = []; for (let k = 0; k < 3 && col.length < 14; k++, tol *= 1.7) col = torso.filter((p) => Math.abs(p[0] - sd * xs) < tol).map((p) => [p[2], p[1]]);
    const line = overShoulder(col, [fB - 0.03, top - 0.03 * size.s], yEnd); if (!line) continue;
    const pts = [], nrm = [], L = line.length;
    for (let i = 0; i < L; i++) {   // lifted off the body along the outline's own normal
      const a = line[Math.max(0, i - 1)], b = line[Math.min(L - 1, i + 1)], tf = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tf, ty) || 1, n = [0, tf / l, -ty / l];   // (left of the way it runs: up at the top, forward down the chest)
      pts.push([sd * xs, line[i][1] + n[1] * BAGS.lift, line[i][0] + n[2] * BAGS.lift]); nrm.push(n);
    }
    // round the ribs, under the arm, to the bottom corner of the bag
    const e = pts[L - 1], bx = sd * (size.W / 2 - 0.03), by = bot + 0.08 * size.s, bf = fB - 0.02, a0 = Math.atan2(e[0], e[2] - fc), a1 = Math.atan2(bx, bf - fc), r0 = Math.hypot(e[0], e[2] - fc), r1 = Math.hypot(bx, bf - fc), N = 9;
    for (let k = 1; k <= N; k++) {
      const t = k / N, a = a0 + (a1 - a0) * t, y = e[1] + (by - e[1]) * t, r = Math.max(r0 + (r1 - r0) * t, k < N ? rad(y, a) + BAGS.lift : 0);
      pts.push([Math.sin(a) * r, y, fc + Math.cos(a) * r]); nrm.push([Math.sin(a), 0, Math.cos(a)]);
    }
    S.ribbon(pts, nrm, BAGS.strapW * size.s, BAGS.strapT, strap); made++;
  }
  // the frame the bag is built in (x across, y up, z forward, at the person's feet), as seen from the upper spine
  const F = new T.Matrix4().makeRotationY(fz > 0 ? 0 : Math.PI); F.setPosition(midx, 0, 0);
  out.inv = new T.Matrix4().copy(B.spine_03.matrixWorld).invert().multiply(F); out.size = size; out.top = top; out.bot = bot; out.fB = fB; out.strapN = made;
  out.straps = made ? S.build(T) : null; out.ok = true;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- wearing
/** Put a person's bag on a clone.  obj: the clone (bones named plainly); bag: from pickBag; fit: from fitBody; h: the person's height.
 *  Returns the rig { bag, kind, mesh, ... } to hand to stepBag every frame, or null (no bag, or the body could not be measured for it). */
export function wearBag(T, obj, bag, fit, h = 1.75) {
  if (!bag || !fit) return null; const K = kit(T), B = {}; obj.traverse((o) => { if (o.isBone && !B[o.name]) B[o.name] = o; });
  for (const n of ['spine_03', 'pelvis', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r']) if (!B[n]) return null;
  const s = Math.min(1.05, Math.max(0.6, h / 1.75)), rig = { bag, kind: bag.kind, fit, B, s, where: null, T };
  if (bag.kind === 'ruck') {
    if (!fit.ok) return null;
    const on = new T.Group(); on.name = 'bag_on'; on.matrixAutoUpdate = false; on.matrix.copy(fit.inv); B.spine_03.add(on);
    let body = lugObj(T, bag.style === 'hike' ? 'ruck_hike' : 'ruck_day', bag.colour);
    if (body) body.scale.set(fit.size.W / 0.30, fit.size.H / 0.45, fit.size.D / 0.16); else { body = new T.Mesh(ruckGeo(T, fit.size, bag.colour), K.mat); body.name = 'bag_ruck'; } rig.home = new T.Vector3(0, fit.bot, fit.fB); rig.mesh = body; rig.on = on;
    if (fit.straps) { rig.straps = new T.Mesh(fit.straps, K.mat); rig.straps.name = 'bag_straps'; on.add(rig.straps); }
    rig.h = fit.size.H; rig.d = fit.size.D; rig.w = fit.size.W;
  } else if (bag.kind === 'trolley' && LUG && LUG.trolley_cabin) {
    // a wheeled suitcase: it stands on the floor by its owner, is towed behind them on two wheels when they walk, and is carried by its top handle on the stairs
    const nm = bag.style === 'large' && LUG.trolley_large ? 'trolley_large' : 'trolley_cabin', ud = LUG[nm].ud, hu = LUG[nm + '_handle'].ud;
    const g = new T.Group(); g.name = 'bag_trolley'; g.rotation.order = 'YXZ'; g.add(lugObj(T, nm, bag.colour)); rig.handle = lugObj(T, nm + '_handle', bag.colour); g.add(rig.handle);
    rig.mesh = g; rig.kind = 'trolley'; rig.w = ud.w; rig.h = ud.h; rig.d = ud.d; rig.drop = 0; rig.travel = hu.travel; rig.gripH = hu.grip; rig.gz = -hu.gripY; rig.pz = ud.d / 2 - 0.04; rig.tow = 0;
    rig.grip = B.middle_01_l || B.hand_l; rig.gripR = B.middle_01_r || B.hand_r;
  } else {
    const lg = lugObj(T, LUG_OF[bag.kind], bag.colour), kind = lg ? bag.kind : PLAIN_OF[bag.kind] || bag.kind;
    if (lg) { const ud = LUG[LUG_OF[bag.kind]].ud, k = bag.kind === 'case' ? Math.max(0.85, s) : s; lg.scale.setScalar(k); rig.mesh = lg; rig.h = ud.h * k; rig.d = ud.w * k; rig.w = ud.d * k; rig.drop = ud.drop * k; rig.grip = B.middle_01_l || B.hand_l; rig.gripR = B.middle_01_r || B.hand_r; }
    else {
    const g = handGeo(T, kind, bag.colour, kind === 'case' ? Math.max(0.85, s) : s); rig.mesh = new T.Mesh(g.geo, K.mat); rig.mesh.name = 'bag_' + bag.kind;
    rig.h = g.h; rig.d = g.d; rig.w = g.w; rig.drop = g.drop; rig.grip = B.middle_01_l || B.hand_l; rig.gripR = B.middle_01_r || B.hand_r; }
  }
  rig.obj = obj; rig.m = new T.Matrix4(); rig.v = new T.Vector3(); rig.u = new T.Vector3();
  return rig;
}

/** Where the bag is this frame.  sit: the person is sitting (the bag is on the lap); pole: holding on (the bag is in whichever hand is lower).
 *  Reads the skeleton as it was last drawn (matrixWorld), so it costs no update of its own; call it once with fresh = true after posing a new clone. */
export function stepBag(rig, sit, pole, fresh, o) {
  if (!rig) return; const { obj, B, mesh, fit, T } = rig, v = rig.v, u = rig.u;
  if (fresh) obj.updateMatrixWorld(true);
  const inv = rig.m.copy(obj.matrixWorld).invert(), at = (bone, out) => out.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inv);
  const where = rig.kind === 'trolley' ? 'floor' : sit ? 'lap' : rig.kind === 'ruck' ? 'back' : 'hand';
  if (where !== rig.where) {
    rig.where = where; rig.gh = -1; if (mesh.parent) mesh.parent.remove(mesh);
    if (where === 'back') { rig.on.add(mesh); mesh.position.copy(rig.home); mesh.rotation.set(0, 0, 0); } else obj.add(mesh);
    if (rig.straps) rig.straps.visible = where === 'back';
  }
  if (where === 'back') return;
  const fz = fit.fz;
  if (where === 'floor') {
    const yaw = fz > 0 ? 0 : Math.PI, sd0 = fit.side, walk = o && o.walk ? Math.min(1, o.walk) : 0, lift = !!(o && o.lift);
    rig.gh = sit ? -1 : 0;
    if (fresh) rig.tow = sit || pole ? 0 : walk; else rig.tow += ((sit || pole ? 0 : walk) - rig.tow) * 0.14;
    if (sit) {   // on the floor in front of the knees, the pull handle stowed
      at(B.calf_l, v); at(B.calf_r, u); const kx = (v.x + u.x) / 2, kf = (v.z + u.z) / 2; at(B.foot_l, v); at(B.foot_r, u);
      const ff = fz * Math.max(fz * kf, fz * v.z + 0.17 * rig.s, fz * u.z + 0.17 * rig.s);   // clear of the knees and of the toes
      mesh.position.set(kx, Math.min(v.y, u.y) - 0.09 * rig.s, ff + fz * (rig.d / 2 + 0.03)); mesh.rotation.set(0, yaw + Math.PI, 0); if (rig.handle) rig.handle.position.y = -rig.travel; return;
    }
    at(rig.grip, v); const hx = sd0 * (v.x - fit.midx);
    if (lift) {   // carried by the top handle, broadside to the leg
      mesh.position.set(fit.midx + sd0 * Math.max(hx, fit.hip + rig.d / 2 + 0.03), Math.max(0.04, v.y - rig.h - 0.035), v.z); mesh.rotation.set(0, yaw + Math.PI / 2, 0); if (rig.handle) rig.handle.position.y = -rig.travel; return;
    }
    if (rig.handle) rig.handle.position.y = 0;
    // standing: upright beside the leg and a little behind.  Towed: tipped on to the wheels under the handle, the grip in the hand, the case rolling behind and outside the heel
    const sx = fit.midx + sd0 * (fit.hip + rig.w / 2 + 0.06), sz = -fz * 0.1, t = rig.tow;
    if (t < 0.01) { mesh.position.set(sx, 0, sz); mesh.rotation.set(0, yaw, 0); return; }
    const th = Math.acos(Math.min(0.985, Math.max(0.55, (v.y + 0.02) / rig.gripH))) * t, c = Math.cos(th), sn = Math.sin(th);
    const gx = fit.midx + sd0 * Math.max(hx, 0.15 + rig.w / 2), gzw = v.z;   // where the grip is
    // the case's own (0, gripH, gz) is at the grip; its wheels (0, 0, pz) are on the floor
    const lz = rig.gripH * sn + rig.gz * c, wy = -rig.pz * sn;
    const tx = gx, tz = gzw - fz * lz, ty = -wy;   // towed
    mesh.position.set(sx + (tx - sx) * t, ty * t, sz + (tz - sz) * t); mesh.rotation.set(th, yaw, 0);
    return;
  }
  if (where === 'lap') {
    // on the thighs, against the body: between the hips and the knees, as high as the top of the thighs
    at(B.thigh_l, v); at(B.thigh_r, u); const hx = (v.x + u.x) / 2, hy = (v.y + u.y) / 2, hf = (v.z + u.z) / 2;
    at(B.calf_l, v); at(B.calf_r, u); const kx = (v.x + u.x) / 2, ky = (v.y + u.y) / 2, kf = (v.z + u.z) / 2, top = Math.max(hy, ky) + 0.075 * rig.s;
    if (rig.kind === 'ruck') { mesh.position.set(hx + (kx - hx) * 0.42, top, hf + (kf - hf) * 0.42 + fz * rig.d * 0.5); mesh.rotation.set(0, fz > 0 ? 0 : Math.PI, 0); }   // upright, its back to the belly
    else if (/case|tote/.test(rig.kind)) { mesh.position.set(hx + (kx - hx) * 0.1, top + rig.d * 0.5, hf + fz * (0.07 - rig.drop)); mesh.rotation.set(-fz * Math.PI / 2, 0, 0); }   // lying flat on the thighs, handles to the belly (review 1: every lap bag stood bolt upright)
    else { mesh.position.set(hx + (kx - hx) * 0.45, top + rig.h + rig.drop * 0.55, hf + (kf - hf) * 0.45); mesh.rotation.set(0, Math.PI / 2, 0); }   // standing on the lap, broadside on
    return;
  }
  let g = rig.grip, sd = fit.side;
  if (pole) { at(rig.grip, v); at(rig.gripR, u); if (u.y < v.y - 0.1) { g = rig.gripR; sd = -sd; } }
  rig.gh = g === rig.gripR ? 1 : 0;   // which hand holds the handle (0 left, 1 right): people.js closes that hand round it
  at(g, v); const off = fit.hip + rig.d / 2 + BAGS.clear, x = v.x - fit.midx;
  mesh.position.set(fit.midx + sd * Math.max(sd * x, off), Math.max(v.y - 0.012, rig.drop + rig.h + 0.012), v.z); mesh.rotation.set(0, 0, 0);
}

/** take a bag off a clone (the clone is being thrown away; the geometries and the material are shared and stay) */
export function dropBag(rig) { if (!rig) return; for (const o of [rig.mesh, rig.on, rig.straps]) if (o && o.parent) o.parent.remove(o); }
