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
    if (lg) { const ud = LUG[LUG_OF[bag.kind]].ud, k = bag.kind === 'case' ? Math.max(0.85, s) : s; lg.scale.setScalar(k); rig.mesh = lg; rig.h = ud.h * k; rig.d = ud.w * k; rig.w = ud.d * k; rig.drop = ud.drop * k; rig.lug = bag.kind === 'holdall'; rig.grip = B.middle_01_l || B.hand_l; rig.gripR = B.middle_01_r || B.hand_r; rig.tip = B.middle_02_l || null; rig.tipR = B.middle_02_r || null; }
    else {
    const g = handGeo(T, kind, bag.colour, kind === 'case' ? Math.max(0.85, s) : s); rig.mesh = new T.Mesh(g.geo, K.mat); rig.mesh.name = 'bag_' + bag.kind;
    rig.h = g.h; rig.d = g.d; rig.w = g.w; rig.drop = g.drop; rig.grip = B.middle_01_l || B.hand_l; rig.gripR = B.middle_01_r || B.hand_r; rig.tip = B.middle_02_l || null; rig.tipR = B.middle_02_r || null; }
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
    const eOk = rig.brLive; rig.brLive = false;   // (drawn by easeBranch last frame: see there)
    const yaw = fz > 0 ? 0 : Math.PI, sd0 = fit.side, walk = o && o.walk ? Math.min(1, o.walk) : 0, lift = !!(o && o.lift);
    rig.gh = sit ? -1 : 0;
    const tw = sit || (pole && !(o && o.turn)) ? 0 : walk; rig.fresh = fresh; let dT = fresh ? 0 : (tw - rig.tow) * (o && o.settle ? 0.035 : 0.14);
    { const ob = rig.obj, bp = ob && ob.position, st = bp && rig.lp && !fresh ? Math.hypot(bp.x - rig.lp[0], bp.z - rig.lp[1]) : 0; if (bp) rig.lp = [bp.x, bp.z];
      { const sp = st / ((o && o.dt) || 1 / 60); rig.spd = rig.spd === undefined ? (walk > 0.5 ? Math.max(sp, 1) : sp) : fresh ? rig.spd : rig.spd + (Math.min(sp, 3) - rig.spd) * 0.2; }   // (kept through a fresh frame - a body swapped mid-walk: reset to that frame's nil step, the trailer took a case from an owner at 1.2 m/s - review 68; and a new rig on a walker starts at a walking pace)   // (the owner's ground speed, smoothed: see floorPose's trailer)
      if (dT > 0 && rig.park && !(o && o.turn) && st < 0.3) dT = Math.min(dT, 2 * st / Math.max(rig.gap || 0.3, 0.15)); }   // (in hand by half the way to it: over the whole way, a walker setting off beside the case walked 0.5 - 0.66 m from its handle as it was wheeled in - review 69)   // (a parked case is picked up as its owner walks to it: the tow grows with the ground the body covers, not with the clock - eased in on time, it glided 0.5 - 0.67 m to the hand of a leaver who had moved 3 cm, and 0.26 m to a boarder standing in the queue - review 65; and no faster than the owner walks, with nothing on the clock: at 1.5x their ground plus a clock floor it closed 1.1 m at 0.057 m a frame, and tilted into a still owner's hand over 3.8 s - review 66)
    rig.down = !fresh && dT < 0;   // (being set down: see floorPose)
    if (fresh) rig.tow = tw; else rig.tow += dT;   // (set back upright slowly after a stepped turn - snapped back in 0.25 s, 36 cm at up to 7 m/s - review 53; and towed round by a pole holder too)
    if (sit) {   // on the floor in front of the knees, the pull handle stowed
      at(B.calf_l, v); at(B.calf_r, u); const kx = (v.x + u.x) / 2, kf = (v.z + u.z) / 2; at(B.foot_l, v); at(B.foot_r, u);
      const ff = fz * Math.max(fz * kf, fz * v.z + 0.17 * rig.s, fz * u.z + 0.17 * rig.s);   // clear of the knees and of the toes
      mesh.position.set(kx, Math.min(v.y, u.y) - 0.09 * rig.s, ff + fz * (rig.d / 2 + 0.03)); mesh.rotation.set(0, yaw + Math.PI, 0); if (rig.handle) rig.handle.position.y = -rig.travel; return;
    }
    at(rig.grip, v); const hx = sd0 * (v.x - fit.midx);
    // carried by the top handle, broadside to the leg, on the stairs.  Blended in and out (lw): put straight down on to its wheels at the foot of the stairs it jumped 0.24 - 0.67 m in a frame (review 59)
    const lt = lift ? 1 : 0; rig.lw = rig.lw === undefined ? lt : rig.lw + (lt - rig.lw) * (lift ? 0.15 : 0.12); if (Math.abs(rig.lw - lt) < 0.004) rig.lw = lt;
    const lw = rig.lw;
    if (lw > 0) { rig.lp = rig.lp || [0, 0, 0]; rig.lp[0] = fit.midx + sd0 * Math.max(hx, fit.hip + rig.d / 2 + 0.03); rig.lp[1] = Math.max(0.04, v.y - rig.h - 0.035); rig.lp[2] = v.z; }
    if (lw >= 1) { mesh.position.set(rig.lp[0], rig.lp[1], rig.lp[2]); mesh.rotation.set(0, yaw + Math.PI / 2, 0); if (rig.handle) rig.handle.position.y = -rig.travel; return; }
    floorPose(rig, o, walk, sit, pole, yaw, sd0, hx, v);
    if (lw > 0) { const P = mesh.position, k = lw; P.set(P.x + (rig.lp[0] - P.x) * k, P.y + (rig.lp[1] - P.y) * k, P.z + (rig.lp[2] - P.z) * k); mesh.rotation.set(mesh.rotation.x * (1 - k), yaw + k * Math.PI / 2, 0); if (rig.handle) rig.handle.position.y = -rig.travel * k; }
    easeBranch(rig, obj, eOk && !fresh, (o && o.dt) || 1 / 60);
    return;
  }
  if (where === 'lap') {
    // on the thighs, against the body: between the hips and the knees, as high as the top of the thighs
    at(B.thigh_l, v); at(B.thigh_r, u); const hx = (v.x + u.x) / 2, hy = (v.y + u.y) / 2, hf = (v.z + u.z) / 2;
    at(B.calf_l, v); at(B.calf_r, u); const kx = (v.x + u.x) / 2, ky = (v.y + u.y) / 2, kf = (v.z + u.z) / 2, top = Math.max(hy, ky) + 0.075 * rig.s;
    if (true) {   // every bag goes on the floor at the feet (review 8: a tall shopper on the lap reached the chin; review 9: forearms and hands went through lap holdalls and totes)   // on the floor between the feet, leaning back against the shins (review 7: upright on the lap, it stood there with the hands on the thighs beside it, held by nothing)
      at(B.foot_l, v); at(B.foot_r, u); const ax = (v.x + u.x) / 2;
      // in front of the toes, not the ankles: set against the ankles the left shin went into a rucksack (66 of 99 people) and long feet into a briefcase (review 10)
      let af = fz * Math.max(fz * v.z, fz * u.z); if (B.ball_l && B.ball_r) { at(B.ball_l, rig.v2 || (rig.v2 = v.clone())); at(B.ball_r, rig.u2 || (rig.u2 = u.clone())); af = fz * Math.max(fz * af, fz * rig.v2.z + 0.06, fz * rig.u2.z + 0.06); }
      const base = Math.min(v.y, u.y) - 0.075 * rig.s, ruck = rig.kind === 'ruck';   // (a rucksack's origin is its base; a bag carried by its handles has the top of the handles at its origin)
      // a tote, a carrier bag, a shopper or a handbag is set down facing its owner, its broad side to the shins (review 15: stood edge on, from the aisle they read as slivers);
      // a holdall and a case keep their length across the feet - turned, they reach a neighbour's feet
      const turn = /^(tote|carrier|shopper|handbag)$/.test(rig.kind), ext = turn ? Math.min(rig.w, rig.d) : rig.d;   // (turned, its thin side is what reaches into the aisle - review 16 found the edge at the car's middle)
      mesh.position.set(ax, ruck ? base : base + rig.h + rig.drop, af + fz * (ext * 0.5 + 0.02)); mesh.rotation.set(turn ? 0 : -fz * 0.14, ruck ? (fz > 0 ? 0 : Math.PI) : turn ? Math.PI / 2 : 0, turn ? fz * 0.14 : 0); }   // (end on to the seat row: broadside, a neighbour's bag stood inside it - review 12)   // (its base on the level of the soles: the ankle joints are ~7.5 cm up)
    else if (/case|tote/.test(rig.kind)) { mesh.position.set(hx + (kx - hx) * 0.1, top + rig.d * 0.5, hf + fz * (0.07 - rig.drop)); mesh.rotation.set(-fz * Math.PI / 2, 0, 0); }   // lying flat on the thighs, handles to the belly (review 1: every lap bag stood bolt upright)
    else { mesh.position.set(hx + (kx - hx) * 0.45, top + rig.h + rig.drop * 0.55, hf + (kf - hf) * 0.45); mesh.rotation.set(0, Math.PI / 2, 0); }   // standing on the lap, broadside on
    return;
  }
  let g = rig.grip, sd = fit.side;
  if (pole) { at(rig.grip, v); at(rig.gripR, u); if (u.y < v.y - 0.1) { g = rig.gripR; sd = -sd; } }
  rig.gh = g === rig.gripR ? 1 : 0;   // which hand holds the handle (0 left, 1 right): people.js closes that hand round it
  at(g, v); const tp = g === rig.gripR ? rig.tipR : rig.tip;
  if (tp) { at(tp, u); v.lerp(u, 0.6); }   // review 6: the handle hangs in the crook of the curled fingers, not 2-12 cm beside them
  const off = fit.hip + rig.d / 2 + BAGS.clear, x = v.x - fit.midx, L = rig.drop + rig.h * 0.6, def = off - sd * x;
  // a bag too wide to hang straight beside the hip keeps its handle in the hand and swings its body out, rather than the whole bag sliding sideways off the fingers
  mesh.position.set(v.x, Math.max(v.y + (rig.lug ? -0.004 : 0.014), rig.drop + rig.h + 0.012), v.z); mesh.rotation.set(0, 0, def > 0 ? sd * Math.asin(Math.min(0.42, def / L)) : 0);
}

const TRL_RATE = 0.35, TRL_TH = 0.99, TRL_IN = 0.25, TRL_OUT = 0.5, TRL_EASE = 0.8;   // the trailer's pace being wheeled round to its place (m/s), its handle's greatest lean (rad: acos 0.55, as the towed pose's), and the owner's pace (m/s) below which a walker's case is drawn as a trailer, and above which it is towed rigidly again; and how fast (m/s) the towed pose is eased in from the trailer's

const EASE_T = 0.25;   // s
/** A case's pose changes branch (a park point taken or dropped, stood up or tipped on to its wheels, the set-down begun): the new branch's pose is not where the case was drawn
 *  last frame. The difference is kept and faded out over EASE_T (inertialization), so the case moves there instead of jumping: a pick-up of a standing case stepped its handle
 *  0.18 m and turned it 0.78 rad in one frame, and set-downs kicked 0.10 - 0.13 m on their first frame (review 70). */
function easeBranch(rig, obj, live, dt) {
  if (rig.brObj !== obj) { rig.brObj = obj; live = false; }   // (a body swapped, far model for full: on that frame its world matrix is not yet its own - eased through it, a standing case jumped 0.4 - 0.8 m and came back)
  const T = rig.T, mesh = rig.mesh, key = (rig.park ? 1 : 0) | (rig.tow < 0.01 ? 2 : 0) | (rig.pT ? 8 : 0);   // (not rig.down nor rig.pick: at a walking pace they flicker, and each flicker restarted the fade, leaving the case behind the hand; a set-down still shows, its park point being taken)
  if (!(rig.brOq && rig.brOq.isQuaternion)) { rig.brOq = new T.Quaternion(); rig.brOv = new T.Vector3(); rig.brOs = new T.Vector3(); rig.brCp = new T.Vector3(); rig.brCq = new T.Quaternion(); rig.brI = new T.Quaternion(); }   // (and a rig copied as plain data has none of them as three.js objects)
  const oq = rig.brOq, ov = rig.brOv, os = rig.brOs;
  obj.matrixWorld.decompose(ov, oq, os);
  const cp = rig.brCp.copy(mesh.position).applyMatrix4(obj.matrixWorld), cq = rig.brCq.copy(oq).multiply(mesh.quaternion);
  if (!(rig.brP && rig.brP.isVector3 && rig.brQ && rig.brQ.isQuaternion && rig.brD && rig.brD.isVector3 && rig.brDq && rig.brDq.isQuaternion)) { rig.brKey = undefined; rig.brP = new T.Vector3(); rig.brQ = new T.Quaternion(); rig.brD = new T.Vector3(); rig.brDq = new T.Quaternion(); rig.brT = EASE_T; }
  const dn = rig.down && (rig.brNd || 0) >= 10; rig.brNd = rig.down ? 0 : (rig.brNd || 0) + 1;   // (the start of a set-down: down after a run of not, so a flicker at walking pace starts one fade, not one a frame)
  if (live && ((rig.brKey !== undefined && key !== rig.brKey) || dn)) { rig.brD.copy(rig.brP).sub(cp); rig.brDq.copy(cq).invert().premultiply(rig.brQ); rig.brT = 0; }   // (eDq: last frame's drawn = eDq * this frame's)
  if (!live) rig.brT = EASE_T;
  rig.brKey = key; rig.brLive = true;
  if (rig.brT < EASE_T) {
    const u = rig.brT / EASE_T, k = 1 - u * u * (3 - 2 * u), I = rig.brI;
    cp.addScaledVector(rig.brD, k); cq.premultiply(I.identity().slerp(rig.brDq, k));
    mesh.position.copy(cp).applyMatrix4(rig.m); mesh.quaternion.copy(oq).invert().multiply(cq);
    rig.brT += dt;
  }
  rig.brP.copy(cp); rig.brQ.copy(cq);
}

/** the case on the floor: standing beside the leg, or towed on its wheels (v: the grip, in the body's frame) */
function floorPose(rig, o, walk, sit, pole, yaw, sd0, hx, v) {
  const { mesh, fit } = rig, fz = fit.fz;
  if (rig.handle) rig.handle.position.y = 0;
  // standing: upright beside the leg and a little behind.  Towed: tipped on to the wheels under the handle, the grip in the hand, the case rolling behind and outside the heel
  if (rig.tow > 0.99 && walk > 0.5 && !(o && o.settle)) rig.park = null;   // (walking off, once it is fully in tow - not drawn standing then - it goes back to its place beside the leg when next stood; cleared at once, the standing case jumped 0.13 - 0.35 m in a frame, review 58)
  // after a turn on the spot it stays where it was towed to, and is stood up there: moved back to its place beside the leg it slid 0.3 - 0.5 m with no hand on it (reviews 53 - 57)
  // a parked case stays where it was put in the car (or on the platform), not at a fixed place by the body: the body is its parent, and as a settling rider turned or eased into
  // their place it swung with them - a boarder's case slid 0.3 m along the car after they had stopped (review 64)
  let dyaw = 0; const ob = rig.obj, par = ob && ob.parent;
  // The trailer's park (its wheel point and heading, taken at full weight while pT) is for a case set down from it. Walking off still holding it, or picking it up
  // again, the case goes back to the towed pose's heading as the tow rises: kept at full weight until the tow reached 0.99 and then dropped, the case stood un-held
  // up to 1.1 m from the hand and spun 1 - 3 rad in one frame (review 68)
  if (rig.pT && rig.sP && !rig.down && o && !o.settle && walk > 0.5) { rig.park = null; rig.pT = false; }
  else if (rig.park && rig.tow < 0.02) { rig.pick = true; rig.pT = false; }   // (a pick-up from where it stands: see the trailer's entry below)
  if (!rig.sP) rig.eb = 0;
  if (!rig.park || !rig.parkP) rig.dyL = undefined;
  if (!rig.park) { rig.parkP = null; rig.pT = false; rig.pick = false; }
  else if (par) {
    const P = rig.pv || (rig.pv = new rig.T.Vector3());
    if (!rig.parkP) { const pm = rig.pm || (rig.pm = new rig.T.Matrix4()); pm.copy(par.matrixWorld).invert(); P.set(rig.park[0], 0, rig.park[1]).applyMatrix4(ob.matrixWorld).applyMatrix4(pm); rig.parkP = [P.x, P.z, ob.rotation.y]; }
    else { P.set(rig.parkP[0], 0, rig.parkP[1]).applyMatrix4(par.matrixWorld).applyMatrix4(rig.m); rig.park = [P.x, P.z]; dyaw = rig.parkP[2] - ob.rotation.y; const d0 = rig.dyL === undefined ? 0 : rig.dyL; dyaw = d0 + Math.atan2(Math.sin(dyaw - d0), Math.cos(dyaw - d0)); rig.dyL = dyaw; }   // (continuous from frame to frame, starting the short way round: taken raw, it jumped by 2 pi as the body's heading crossed pi, and eased by (1 - tow) the case flipped 1.9 - 2.6 rad in a frame as it was picked up; and a park 2 pi off spun the case a full turn - review 69)
  }
  const sx = rig.park ? rig.park[0] : fit.midx + sd0 * (fit.hip + rig.w / 2 + 0.08), sz = rig.park ? rig.park[1] : -fz * 0.12, t = rig.tow;   // (its place beside the leg, as the trailer's: 2 cm nearer, the foot was 0.8 - 4 cm from its side)
  if (t < 0.01) { mesh.position.set(sx, 0, sz); mesh.rotation.set(0, yaw + dyaw, 0); rig.sb = 0; return; }
  // the tilt follows the hand's height with the case's own inertia: taken straight from it (acos is steep near upright), the 10 - 12 cm the hand rises and falls in a stride
  // swung the wheels 0.1 - 0.24 m along the floor in one frame (review 63's towed-case whip)
  const th0 = Math.acos(Math.min(0.95, Math.max(0.55, (v.y + 0.02) / rig.gripH)));   // (never nearer upright than 18 degrees, where acos is steepest: a towed case leans back on its wheels)
  rig.th = rig.th === undefined || rig.fresh || t < 0.05 ? th0 : rig.th + (th0 - rig.th) * 0.3;   // (eased at 0.12 the handle lagged the hand and the hand rode 5 - 10 cm above it - review 64)
  const th = rig.th * t, c = Math.cos(th), sn = Math.sin(th);
  const gx = fit.midx + sd0 * Math.max(hx, 0.15 + rig.w / 2), gzw = v.z;   // where the grip is
  // the case's own (0, gripH, gz) is at the grip; its wheels (0, 0, pz) are on the floor
  const lz = rig.gripH * sn + rig.gz * c, wy = -rig.pz * sn;
  const tx = gx, tz = gzw - fz * lz, ty = -wy;   // towed
  // Standing with the handle still in the hand (turning or stepping into place to settle, or turning at a pole) the case is a trailer: its wheels stay where they are on the
  // floor, held in the car's frame, and only the handle tilts to the hand; the hand drags it only at full stretch, and wheels it round beside the leg at a hand's pace. Drawn as
  // the rigid towed pose turned about the grip, it slid 0.8 - 2.3 m beside a still owner, and was set down 0.7 - 1.0 m off or inside the shin (review 67)
  // And so it is for a walker barely moving (turning as they set off, or shuffling in a queue): towed rigidly, it swung 1.3 m round one who turned 2.3 rad while covering 0.34 m (review 67).
  // In and out of it on the owner's pace, with a margin, so a walker near the pace does not flick between the two
  const slow = rig.spd !== undefined && (rig.sP ? rig.spd < TRL_OUT : rig.spd < TRL_IN);
  if (o && (o.settle || slow) && !sit && par && !rig.fresh && t > 0.02 && !rig.down && !o.lift && (!rig.pick || t > 0.5)) {   // (not for a case being picked up where it stood: taken over at a tow of 0.02, the upright case snapped to the hand's tilt and heading - review 68)
    if (rig.pick) { rig.pick = false; rig.sP = null; if (par) { mesh.updateMatrix(); const M = rig.tm || (rig.tm = new rig.T.Matrix4()), W = new rig.T.Vector3(), Q = new rig.T.Quaternion(), S = new rig.T.Vector3(); M.multiplyMatrices(ob.matrix, mesh.matrix).decompose(W, Q, S); rig.eP = W.toArray(); rig.eQ = Q.toArray(); rig.eb = 1; } }   // (picked up and in hand, its owner stopped again: a trailer from where it is drawn now - kept on the pick-up, it was set down at its old place and spun 1 rad in a frame, review 68)
    trailer(rig, o, t, gx, gzw, yaw); return; }
  rig.sP = null;
  rig.gap = rig.park ? Math.hypot(tx - sx, tz - sz) : 0;   // (how far a parked case is from the hand: see the tow's pick-up)
  if (o && o.settle && (sit || pole ? 0 : walk) === 0 && !rig.park && t > 0.5) rig.park = rig.wasDown !== undefined ? [mesh.position.x, mesh.position.z] : [tx, tz];   // (where it is drawn: trailing its handle it is not at the rigid towed place, and parked there it jumped 0.37 - 0.56 m)
  // the set-down starts where the case is now: the park point is taken as the settle begins, before the settling turn swings the towed case round the body, and stood up at that
  // stale point the case jumped 0.77 - 1.60 m in a frame and stood a metre from its owner for the ride (review 66). Not on a body's first frame, whose mesh is still where a fresh rig puts it.
  if (rig.park && rig.down && rig.wasDown === false && !rig.pT) { rig.park = [mesh.position.x, mesh.position.z]; rig.parkP = null; }
  rig.wasDown = rig.down;
  const k = rig.park && rig.down ? 0 : t;   // (set down where it was parked: it stands up there on its wheels, and is not drawn after the hand as the arm goes back to the idle pose - it slid 0.24 - 0.59 m over 3.7 s beside a still owner, review 65)
  // The towed case trails its handle like a trailer: its wheels are only drawn towards the hand, never swung round it. Drawn as a rigid offset behind the hand, the case swept
  // 0.4 - 1.3 m round an owner turning on the spot to settle in the car, and 0.10 - 0.12 m a frame in a walking turn (review 66). The wheel point is kept in the parent's frame
  // (the car or the platform) and the rigid towed pose is turned about the grip until it points at it.
  let al = 0;
  if (k > 0 && par && !rig.fresh && rig.wP) {
    const P = rig.pv || (rig.pv = new rig.T.Vector3());
    P.set(rig.wP[0], 0, rig.wP[1]).applyMatrix4(par.matrixWorld).applyMatrix4(rig.m);
    const dx0 = tx - gx, dz0 = tz - gzw, dx1 = P.x - gx, dz1 = P.z - gzw;
    if (Math.hypot(dx1, dz1) > 0.05 && Math.hypot(dx0, dz0) > 0.05) al = Math.max(-1.3, Math.min(1.3, Math.atan2(dx1 * dz0 - dz1 * dx0, dx1 * dx0 + dz1 * dz0)));
  }
  const ca = Math.cos(al), sa = Math.sin(al), rx = gx + (tx - gx) * ca + (tz - gzw) * sa, rz = gzw - (tx - gx) * sa + (tz - gzw) * ca;   // (the rigid pose turned by al about the vertical through the grip)
  if (k > 0 && par) { const P = rig.pv || (rig.pv = new rig.T.Vector3()), pm = rig.pm || (rig.pm = new rig.T.Matrix4()); pm.copy(par.matrixWorld).invert(); P.set(rx, 0, rz).applyMatrix4(ob.matrixWorld).applyMatrix4(pm); rig.wP = [P.x, P.z]; }
  else rig.wP = null;
  if (k === 0) mesh.position.set(rig.park[0], ty * t, rig.park[1]); else mesh.position.set(sx + (rx - sx) * t, ty * t, sz + (rz - sz) * t);
  mesh.rotation.set(th, yaw + dyaw * (rig.pT ? 1 : 1 - t), 0);   // (stood up where the trailer left it, facing as it did: see trailer)
  if (al) mesh.quaternion.premultiply((rig.qa || (rig.qa = new rig.T.Quaternion())).setFromAxisAngle(rig.ay || (rig.ay = new rig.T.Vector3(0, 1, 0)), al * t));   // (in the parent's frame, after the case's own order of rotations)
  // walking off from the trailer's pose, the towed pose is eased in over half a second rather than taken at once
  if (k === 0) rig.sb = 0;
  else if (rig.sb > 0 && par && rig.sPos) {
    const P = rig.tv || (rig.tv = new rig.T.Vector3()), Q = rig.tq || (rig.tq = new rig.T.Quaternion());
    // (from the trailer's last pose, carried with the body from there, and at no more than TRL_EASE over the floor: eased on the clock from a pose fixed in the car, it went 0.11 m a frame)
    if (!rig.sBP) { P.fromArray(rig.sPos).applyMatrix4(par.matrixWorld).applyMatrix4(rig.m); Q.fromArray(rig.sQ).premultiply((rig.tq2 || (rig.tq2 = new rig.T.Quaternion())).copy(ob.quaternion).invert()); rig.sBP = P.toArray(); rig.sBQ = Q.toArray(); }
    P.fromArray(rig.sBP); Q.fromArray(rig.sBQ); const D = P.distanceTo(mesh.position), dt = (o && o.dt) || 1 / 60;
    mesh.position.lerp(P, rig.sb); mesh.quaternion.slerp(Q, rig.sb); rig.sb = Math.max(0, rig.sb - Math.min(2 * dt, TRL_EASE * dt / Math.max(D, 1e-3)));
  }
}

/** the case as a trailer, its owner standing with the handle in their hand (see floorPose): (gx, gz) is the grip on the floor plan, in the body's frame */
function trailer(rig, o, t, gx, gz, yaw) {
  const { mesh, fit } = rig, ob = rig.obj, par = ob.parent, T = rig.T, P = rig.tv || (rig.tv = new T.Vector3()), pm = rig.pm || (rig.pm = new T.Matrix4());
  pm.copy(par.matrixWorld).invert();
  const toPar = (x, z) => { P.set(x, 0, z).applyMatrix4(ob.matrixWorld).applyMatrix4(pm); return [P.x, P.z]; }, toBody = (x, z) => { P.set(x, 0, z).applyMatrix4(par.matrixWorld).applyMatrix4(rig.m); return [P.x, P.z]; };
  // from where it is drawn now; and handed over between crowds (on to a train), from where the old body left it, which the trailer holds: eased over as well, it went 1.3 m from the
  // owner and was dragged back 0.4 m in a frame
  if (!rig.sP || rig.carry) { rig.sP = toPar(mesh.position.x, mesh.position.z); rig.carry = null; }
  let [bx, bz] = toBody(rig.sP[0], rig.sP[1]);
  // wheeled round to its place beside the leg (about 0.45 m from the pelvis, clear of the knee and the foot), round the body rather than through it, at no more than a hand's pace
  if (t > 0.5 && o && o.settle) {
    const sd = fit.side, lx = fit.midx + sd * (fit.hip + rig.w / 2 + 0.08), lz = -fit.fz * 0.12, rt = Math.hypot(lx, lz), at = Math.atan2(lx, lz);
    let r = Math.hypot(bx, bz), a = Math.atan2(bx, bz), da = at - a; da -= 2 * Math.PI * Math.round(da / (2 * Math.PI));
    const step = TRL_RATE * ((o && o.dt) || 1 / 60), dr = Math.max(-step, Math.min(step, rt - r)); r = Math.max(r + dr, Math.min(r, 0.38));
    a += Math.max(-step / Math.max(r, 0.3), Math.min(step / Math.max(r, 0.3), da)); bx = r * Math.sin(a); bz = r * Math.cos(a);
  }
  // dragged by the handle only at full stretch
  const A = Math.hypot(rig.gripH, rig.gz), ph = Math.atan2(rig.gz, rig.gripH), reach = A * Math.sin(TRL_TH + ph);
  let dx = bx - gx, dz = bz - gz, d = Math.hypot(dx, dz); if (d > reach) { bx = gx + dx * reach / d; bz = gz + dz * reach / d; d = reach; }
  rig.sP = toPar(bx, bz);
  const th = Math.max(0, Math.min(TRL_TH, Math.asin(Math.min(1, d / A)) - ph)), psi = d > 0.03 ? Math.atan2(gx - bx, gz - bz) : (rig.sPsi !== undefined ? rig.sPsi - ob.rotation.y : yaw);
  rig.sPsi = psi + ob.rotation.y;
  mesh.position.set(bx, rig.pz * Math.sin(th), bz); mesh.rotation.set(th, psi, 0); if (rig.handle) rig.handle.position.y = 0;
  // taking over a case half picked up, from the pose it was drawn in, carried with the body and at no more than TRL_EASE over the floor (taken at once it stepped 0.16 - 0.23 m and 0.6 rad - review 68)
  if (rig.eb > 0 && rig.eP) {
    const E = rig.ev || (rig.ev = new T.Vector3()), EQ = rig.eq || (rig.eq = new T.Quaternion());
    E.fromArray(rig.eP).applyMatrix4(par.matrixWorld).applyMatrix4(rig.m); EQ.fromArray(rig.eQ).premultiply((rig.tq2 || (rig.tq2 = new T.Quaternion())).copy(ob.quaternion).invert());
    const D = E.distanceTo(mesh.position), dt = (o && o.dt) || 1 / 60;
    mesh.position.lerp(E, rig.eb); mesh.quaternion.slerp(EQ, rig.eb); rig.eb = Math.max(0, rig.eb - Math.min(2 * dt, TRL_EASE * dt / Math.max(D, 1e-3)));
  }
  // set down from here, it stands where it is, facing as it does (floorPose's park, held in the car's frame); and walked off from here, the towed pose is eased in
  rig.park = [bx, bz]; rig.parkP = [rig.sP[0], rig.sP[1], psi + ob.rotation.y - yaw]; rig.pT = true; rig.th = th / Math.max(t, 0.05); rig.wP = rig.sP.slice(); rig.wasDown = false;
  mesh.updateMatrix(); const M = rig.tm || (rig.tm = new T.Matrix4()); M.multiplyMatrices(ob.matrix, mesh.matrix);
  const Q = rig.tq || (rig.tq = new T.Quaternion()), S = rig.ts || (rig.ts = new T.Vector3()), W = rig.tw2 || (rig.tw2 = new T.Vector3()); M.decompose(W, Q, S);
  rig.sPos = [W.x, W.y, W.z]; rig.sQ = [Q.x, Q.y, Q.z, Q.w]; rig.sb = 1; rig.sBP = null;
}

/** take a bag off a clone (the clone is being thrown away; the geometries and the material are shared and stay) */
export function dropBag(rig) { if (!rig) return; for (const o of [rig.mesh, rig.on, rig.straps]) if (o && o.parent) o.parent.remove(o); }
