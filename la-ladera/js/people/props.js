// Hand-held and carried props for the daily-life clips (broom for `sweep`, bundle for `walk_carry` / `carry_stand`, basket for `laundry`).
// Props are tiny shared meshes; their orientation is authored in the glTF character frame (up +Y, forward -Z, the character's right +X) at the REST pose
// and parented to a bone, so every clip carries them (rig.js attachOriented).
import * as THREE from 'three';

const mats = {}, geos = {};
const mat = (k, color, rough = 0.85) => (mats[k] ??= new THREE.MeshStandardMaterial({ color, roughness: rough }));
const geo = (k, make) => (geos[k] ??= make());
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
const down = (dx, dy, dz) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dx, dy, dz).normalize());

/** A straw broom: origin at the lower grip; the stick rises 0.45 m above it and runs 1.0 m below it to the bristle head. */
function makeBroom() {
  const g = new THREE.Group(); g.name = 'prop_broom';
  const stick = mesh(geo('broom.stick', () => new THREE.CylinderGeometry(0.014, 0.016, 1.5, 6)), mat('broom.wood', 0x8a6a3c)); stick.position.y = -0.30; g.add(stick);
  const head = mesh(geo('broom.head', () => new THREE.BoxGeometry(0.30, 0.16, 0.06)), mat('broom.straw', 0xc9a24a, 1)); head.position.y = -1.02; g.add(head);
  const band = mesh(geo('broom.band', () => new THREE.BoxGeometry(0.10, 0.03, 0.075)), mat('broom.band', 0x3a2a1c)); band.position.y = -0.93; g.add(band);
  return g;
}

/** A knotted cloth bundle / market bag held against the belly. */
function makeBundle() {
  const g = new THREE.Group(); g.name = 'prop_bundle';
  const sack = mesh(geo('bundle.sack', () => new THREE.SphereGeometry(0.15, 10, 8).scale(1.15, 0.95, 0.9)), mat('bundle.cloth', 0xb9925a, 1)); g.add(sack);
  const knot = mesh(geo('bundle.knot', () => new THREE.SphereGeometry(0.05, 8, 6)), mat('bundle.cloth', 0xb9925a, 1)); knot.position.y = 0.15; g.add(knot);
  return g;
}

/** A plastic laundry basket. */
function makeBasket() {
  const g = new THREE.Group(); g.name = 'prop_basket';
  const b = mesh(geo('basket.body', () => new THREE.CylinderGeometry(0.25, 0.19, 0.22, 12, 1, true)), mat('basket.plastic', 0xd0583c, 0.6)); b.material.side = THREE.DoubleSide; g.add(b);
  const cloth = mesh(geo('basket.cloth', () => new THREE.CylinderGeometry(0.22, 0.22, 0.04, 10)), mat('basket.cloth', 0xe8e4d8, 1)); cloth.position.y = 0.06; g.add(cloth);
  return g;
}

/**
 * A phone, 7.2 x 15 cm, ONE mesh (one draw call per phone): a box whose top face carries a lit screen with a bezel (the right half of a 32 x 32 atlas); every other face
 * samples one black texel (the left half). Local frame: the screen faces +Y, the top edge points to -Z.
 */
const PHONE_ATLAS = 32;
function phoneBox() {
  const b = new THREE.BoxGeometry(0.072, 0.009, 0.150), uv = b.attributes.uv;           // faces in the order +x -x +y -y +z -z, four vertices each
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; if (f === 2) uv.setXY(i, 0.5 + 0.5 * uv.getX(i), uv.getY(i)); else uv.setXY(i, 0.25, 0.5); }
  return b;
}
function phoneMat() {
  return (mats.phone ??= (() => {
    const W = PHONE_ATLAS, body = [0x15, 0x16, 0x1a], dim = [0x1b, 0x24, 0x30], lit = [0x5b, 0x8f, 0xd0];
    const base = new Uint8Array(W * W * 4), glow = new Uint8Array(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const screen = x >= W / 2 + 1 && x <= W - 2 && y >= 1 && y <= W - 2, i = (y * W + x) * 4;          // the right half minus a one-texel bezel
      base.set(screen ? dim : body, i); base[i + 3] = 255; glow.set(screen ? lit : [0, 0, 0], i); glow[i + 3] = 255;
    }
    const tex = (d) => { const t = new THREE.DataTexture(d, W, W); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
    return new THREE.MeshStandardMaterial({ map: tex(base), emissiveMap: tex(glow), emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.35 });
  })());
}
function makePhone() {
  const g = new THREE.Group(); g.name = 'prop_phone';
  g.add(mesh(geo('phone.box', phoneBox), phoneMat()));
  return g;
}

/** Orientation of a prop whose screen faces `n` and whose top edge points along `t` (both in the character frame, any length, about at right angles). */
const facing = (n, t) => {
  const y = new THREE.Vector3(...n).normalize(), z = new THREE.Vector3(...t).normalize().negate(), x = new THREE.Vector3().crossVectors(y, z).normalize();
  z.crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
};

/**
 * name -> { bone, make, pos, quat, pose?, fit? }  (pos in metres from the bone head, quat = the prop's orientation, both in the glTF character frame; `pose` = the clip phase they are authored
 * against instead of the rest pose; `fit` = pos follows the person's height, the prop itself keeps its size: a child's phone is as big as an adult's).
 */
export const PROPS = {
  broom:  { bone: 'hand_r', make: makeBroom, pos: [-0.001, -0.02, -0.082], quat: () => down(-0.03, -0.90, -0.43), pose: { clip: 'sweep', t: 0 } },     // authored against the sweep clip's grip pose (t = 0), not the rest pose
  bundle: { bone: 'chest', make: makeBundle, pos: [0, -0.20, -0.27], quat: () => new THREE.Quaternion() },
  basket: { bone: 'chest', make: makeBasket, pos: [0, -0.25, -0.30], quat: () => new THREE.Quaternion() },
  // R3-004: nobody carried a phone, so the `phone` act read as "hands up". Two grips (authored at the clip phase t = 0 of the clip they belong to; sit_phone uses the same arms as phone_stand, so `phone` fits both):
  phone:     { bone: 'hand_r', make: makePhone, pos: [-0.095, 0.045, -0.068], quat: () => facing([0, 0.74, 0.67], [0, 0.67, -0.74]), pose: { clip: 'phone_stand', t: 0 }, fit: true },   // texting: cradled between both hands, screen up and back to the face
  phone_ear: { bone: 'hand_r', make: makePhone, pos: [-0.065, 0.105, 0.094], quat: () => facing([-0.99, 0.14, 0], [0.14, 0.97, 0.2]), pose: { clip: 'phone_call', t: 0 }, fit: true },        // a call: held to the right ear (the head is tilted towards it)
};

/** The clip that shows a phone in the hand, and which phone prop goes with it. */
export const CLIP_PROP = { phone_stand: 'phone', phone_call: 'phone_ear', sit_phone: 'phone' };
/** What a person holds while `clip` plays: what the brain gave them (broom, bundle, basket) or the phone their clip needs. */
export const propFor = (npc, clip) => npc.prop ?? CLIP_PROP[clip] ?? null;
/** The clip for the `phone` act: seated people text; two in five of the standing ones hold the phone to the ear, the rest text (the same person always does the same: npc.jit is fixed at birth). */
export const phoneClip = (npc, seated, hasCall = true) => seated ? 'sit_phone' : hasCall && (npc.jit?.[1] ?? 0.5) < 0.4 ? 'phone_call' : 'phone_stand';
/** The clip for the `sell` act: a seller with a basket on the arm stands holding it; the others show their open hand to the customer. */
export const sellClip = (npc, hasCarry = true) => npc.prop === 'basket' && hasCarry ? 'carry_stand' : 'sell';

/** Hold `name` (or nothing) on a character instance. Returns the prop or null. */
export function holdProp(lib, inst, name) {
  if (inst.propName === name) return inst.props.get('main') ?? null;
  lib.detach(inst, 'main'); inst.propName = name ?? null;
  if (!name || !PROPS[name]) return null;
  const s = PROPS[name], fit = s.fit ? Math.min(1.12, Math.max(0.7, (inst.meta?.heightM ?? 1.64) / 1.64)) : 1;
  return lib.attachOriented(inst, s.bone, s.make(), s.fit ? s.pos.map((v) => v * fit) : s.pos, s.quat(), 1, 'main', s.pose ?? null);
}
