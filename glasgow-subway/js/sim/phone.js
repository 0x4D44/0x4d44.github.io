// The mobile phone a person holds: a thin slab, a dark case and a lit screen, built in code (no asset; nothing to credit). One geometry per case colour is shared by every phone,
// one material for all of them, so a platform full of people on their phones costs a mesh each and nothing more. The screen is not lit by the scene: it is its own light, as a
// real one is in a dim carriage, so it stays bright whatever the lamps do.
// Where it sits in the hand is not tuned by eye: hold.js says where the phone is and where the hands are, and gripInHand turns that into the phone's place in the right hand's frame.
import { PHONE, holdHands, gripInHand, fromBasis } from './hold.js';

const CASES = ['#14161a', '#1b2230', '#2b2e35', '#5f1b22', '#d9d7d2', '#1c3a33', '#3a2b4a', '#0f0f10'];
const SCREENS = ['#d6e6ff', '#eef4ff', '#ffe9c7', '#c3dcff', '#e4ffe9'];
export const VARIANTS = CASES.length;

/** the phone's place in the right hand's frame for each way of holding it: { p: [x, y, z], q: [x, y, z, w] } - the same for everyone, derived from hold.js's hands */
export const GRIPS = (() => {
  const ph = { C: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, o = {};
  for (const k of ['text', 'call']) { const hs = holdHands(k, ph), g = gripInHand(k, ph, hs.r); o[k] = { p: g.P, q: fromBasis(g.x, g.y, g.z) }; }
  return o;
})();

/** the geometry of one phone (indexed, vertex-coloured): the body as a box with the case colour, the screen a quad a hair in front of its face (+z). Centred; x across, y along, z out of the screen. */
export function phoneGeometry(THREE, caseHex, screenHex) {
  const hx = PHONE.w / 2, hy = PHONE.h / 2, hz = PHONE.t / 2, sx = hx - 0.0035, sy = hy - 0.007, sz = hz + 0.0003;
  const P = [-hx, -hy, -hz, hx, -hy, -hz, hx, hy, -hz, -hx, hy, -hz, -hx, -hy, hz, hx, -hy, hz, hx, hy, hz, -hx, hy, hz,   // the box's 8 corners
    -sx, -sy, sz, sx, -sy, sz, sx, sy, sz, -sx, sy, sz];                                                                       // the screen's 4
  const I = [0, 2, 1, 0, 3, 2,  4, 5, 6, 4, 6, 7,  0, 1, 5, 0, 5, 4,  3, 7, 6, 3, 6, 2,  0, 4, 7, 0, 7, 3,  1, 2, 6, 1, 6, 5,  8, 9, 10, 8, 10, 11];
  const c = new THREE.Color(caseHex), s = new THREE.Color(screenHex), col = [];
  for (let i = 0; i < 8; i++) col.push(c.r, c.g, c.b);
  for (let i = 0; i < 4; i++) col.push(s.r, s.g, s.b);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(I);
  g.computeBoundingSphere(); return g;
}

const kits = new WeakMap();
/** the shared pieces for one three.js: { material, geometry(i) } */
export function phoneKit(THREE) {
  let k = kits.get(THREE); if (k) return k;
  const geo = [], material = new THREE.MeshBasicMaterial({ vertexColors: true });
  k = { material, geometry: (i) => geo[i % VARIANTS] || (geo[i % VARIANTS] = phoneGeometry(THREE, CASES[i % VARIANTS], SCREENS[(i * 3 + 1) % SCREENS.length])) };
  kits.set(THREE, k); return k;
}

/** A phone in a hand (a bone of the clone: hand_r), hidden until `show`. variant picks the case; returns the mesh with .setGrip(kind). */
export function attachPhone(THREE, hand, variant = 0) {
  const kit = phoneKit(THREE), m = new THREE.Mesh(kit.geometry(variant), kit.material);
  m.name = 'phone'; m.frustumCulled = false; m.visible = false; m.userData.grip = null;
  m.setGrip = (kind) => { const g = GRIPS[kind === 'call' ? 'call' : 'text']; if (m.userData.grip === g) return; m.userData.grip = g; m.position.set(g.p[0], g.p[1], g.p[2]); m.quaternion.set(g.q[0], g.q[1], g.q[2], g.q[3]); };
  m.setGrip('text'); hand.add(m); return m;
}
