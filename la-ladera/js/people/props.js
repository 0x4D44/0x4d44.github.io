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

/** name -> { bone, make, pos, quat }  (pos in metres from the bone head, quat = the prop's rest orientation, both in the glTF character frame). */
export const PROPS = {
  broom:  { bone: 'hand_r', make: makeBroom, pos: [-0.01, -0.07, -0.03], quat: () => down(0.0, -0.62, -0.78) },
  bundle: { bone: 'chest', make: makeBundle, pos: [0, -0.20, -0.27], quat: () => new THREE.Quaternion() },
  basket: { bone: 'chest', make: makeBasket, pos: [0, -0.25, -0.30], quat: () => new THREE.Quaternion() },
};

/** Hold `name` (or nothing) on a character instance. Returns the prop or null. */
export function holdProp(lib, inst, name) {
  if (inst.propName === name) return inst.props.get('main') ?? null;
  lib.detach(inst, 'main'); inst.propName = name ?? null;
  if (!name || !PROPS[name]) return null;
  const s = PROPS[name];
  return lib.attachOriented(inst, s.bone, s.make(), s.pos, s.quat(), 1, 'main');
}
