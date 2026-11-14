// A haggis on a lead, trotting behind the man in the string vest (people.js: PET_OWNER).  The wild haggis, as every visitor to Scotland is told, has the legs of
// one side shorter than the other, for running round hillsides - so this one leans, and on the flat of a Subway platform it has to hurry.  Cosmetic only: it
// collides with nothing and nobody steers round it.  The following is plain maths (followStep, unit-tested); the model and the lead are made here from
// three.js primitives, in the frame of whatever group its owner stands in (a platform, a train's saloon).

export const HAGGIS = {
  behind: 0.78, aside: 0.26,     // m: where it wants to be, behind its owner and a little to their left (the lead hand)
  sitAhead: 0.42, sitAside: 0.34, // ...and when the owner sits: by their feet
  slack: 0.10,                   // m: closer to its place than this, it stands still
  vmax: 2.3, acc: 7,             // m/s, m/s^2: a hurried scuttle at the most
  snap: 4.5,                     // m: further from its owner than this (they boarded, the crowd was re-dealt) it is simply put in its place
  stride: 0.12,                  // m per leg cycle
  lean: 0.16,                    // rad: the list its short side gives it
};

/** where a haggis wants to be for an owner at (x, z) heading yaw (the crowd's convention: forward = (-sin yaw, -cos yaw)) */
export function petPlace(o) {
  const fx = -Math.sin(o.yaw), fz = -Math.cos(o.yaw), lx = fz, lz = -fx;   // forward, and the owner's left
  return o.sit ? { x: o.x + fx * HAGGIS.sitAhead + lx * HAGGIS.sitAside, z: o.z + fz * HAGGIS.sitAhead + lz * HAGGIS.sitAside }
    : { x: o.x - fx * HAGGIS.behind + lx * HAGGIS.aside, z: o.z - fz * HAGGIS.behind + lz * HAGGIS.aside };
}

/** one step of the following: h = { x, z, yaw, v, ph } is moved towards its place by its owner o = { x, z, yaw, sit }. yaw here is the haggis's own heading,
 *  atan2(dx, dz) of the way it goes (its nose is +z of the model). Returns h. */
export function followStep(h, o, dt) {
  const t = petPlace(o); let dx = t.x - h.x, dz = t.z - h.z; const d = Math.hypot(dx, dz);
  if (!(d < HAGGIS.snap) || h.v == null) { h.x = t.x; h.z = t.z; h.v = 0; h.ph = h.ph || 0; h.yaw = Math.atan2(-Math.sin(o.yaw), -Math.cos(o.yaw)); return h; }
  const want = d > HAGGIS.slack ? Math.min(HAGGIS.vmax, d * 3.2) : 0, lim = HAGGIS.acc * dt;
  h.v += Math.max(-lim, Math.min(lim, want - h.v));
  const step = Math.min(d, h.v * dt);
  if (d > 1e-6 && step > 0) { h.x += dx / d * step; h.z += dz / d * step; h.ph = (h.ph + step / HAGGIS.stride) % 1; }
  const face = h.v > 0.15 && d > 0.05 ? Math.atan2(dx, dz) : Math.atan2(o.x - h.x, o.z - h.z);   // going: where it goes; stopped: it looks up at its owner
  let e = face - h.yaw; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI;
  h.yaw += e * Math.min(1, dt * 8);
  return h;
}

let shared = null;
function parts(T) {
  if (shared) return shared;
  const body = new T.SphereGeometry(1, 14, 10), pos = body.attributes.position;
  for (let i = 0; i < pos.count; i++) {   // a shaggy lump, not a ball: every vertex pushed in or out a little (the same for every haggis)
    const k = 1 + 0.07 * Math.sin(i * 12.9898) * Math.cos(i * 4.1414);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  body.computeVertexNormals();
  shared = {
    body, ball: new T.SphereGeometry(1, 8, 6), leg: new T.CylinderGeometry(0.016, 0.012, 1, 6), cone: new T.ConeGeometry(1, 1, 8), lead: new T.CylinderGeometry(0.004, 0.004, 1, 5),
    disc: new T.CylinderGeometry(1, 1, 1, 12),
    fur: new T.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 1 }), dark: new T.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.6 }),
    snout: new T.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 }), red: new T.MeshStandardMaterial({ color: 0xa3161c, roughness: 0.8 }),
    green: new T.MeshStandardMaterial({ color: 0x14502c, roughness: 0.8 }),
  };
  return shared;
}

/** the model: { root, legs, lead, h } - root is put in the owner's parent group; lead is a separate mesh in the same group, stretched from collar to hand each frame */
export function makeHaggis(THREE) {
  const T = THREE, G = parts(T), root = new T.Group(), tilt = new T.Group(); root.add(tilt); root.name = 'haggis';
  const mesh = (g, m, sx, sy, sz, x, y, z) => { const o = new T.Mesh(g, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); tilt.add(o); return o; };
  mesh(G.body, G.fur, 0.105, 0.095, 0.17, 0, 0.165, 0);                                   // the haggis proper
  const sn = mesh(G.cone, G.snout, 0.04, 0.09, 0.04, 0, 0.16, 0.19); sn.rotation.x = Math.PI / 2;   // snout
  mesh(G.ball, G.dark, 0.012, 0.012, 0.012, 0, 0.158, 0.236);                             // nose
  for (const s of [-1, 1]) { mesh(G.ball, G.dark, 0.011, 0.011, 0.011, s * 0.038, 0.205, 0.135); const e = mesh(G.cone, G.fur, 0.022, 0.05, 0.012, s * 0.06, 0.26, 0.07); e.rotation.z = -s * 0.5; }
  mesh(G.disc, G.red, 0.062, 0.014, 0.062, 0, 0.262, 0.085).rotation.x = 0.25;            // a tam o' shanter
  mesh(G.ball, G.green, 0.016, 0.016, 0.016, 0, 0.277, 0.09);                              // ...and its toorie
  mesh(G.disc, G.red, 0.07, 0.012, 0.085, 0, 0.175, 0.115).rotation.x = Math.PI / 2;      // collar
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {   // the left pair shorter than the right
    const len = sx < 0 ? 0.085 : 0.115, hip = new T.Group(); hip.position.set(sx * 0.062, 0.10 + (sx < 0 ? -0.012 : 0.012), sz * 0.085);
    const l = new T.Mesh(G.leg, G.dark); l.scale.y = len; l.position.y = -len / 2; hip.add(l);
    const f = new T.Mesh(G.ball, G.dark); f.scale.set(0.02, 0.01, 0.028); f.position.set(0, -len, 0.008); hip.add(f);
    tilt.add(hip); legs.push(hip);
  }
  tilt.rotation.z = HAGGIS.lean; tilt.position.y = 0.012;
  const lead = new T.Mesh(G.lead, G.red); lead.name = 'haggis_lead'; lead.frustumCulled = false;
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { root, tilt, legs, lead, h: { x: 0, z: 0, yaw: 0, v: null, ph: 0 }, _a: new T.Vector3(), _b: new T.Vector3(), _up: new T.Vector3(0, 1, 0) };
}

/** pose the model from its state: place, heading, scuttling legs and a bob; y is the floor it stands on */
export function poseHaggis(pet, y) {
  const h = pet.h, a = h.ph * Math.PI * 2, go = Math.min(1, (h.v || 0) / 0.6);
  pet.root.position.set(h.x, y, h.z); pet.root.rotation.y = h.yaw;
  pet.legs.forEach((l, i) => { l.rotation.x = go * 0.75 * Math.sin(a + (i === 0 || i === 3 ? 0 : Math.PI)); });
  pet.tilt.position.y = 0.012 + go * 0.006 * Math.abs(Math.sin(a * 2)); pet.tilt.rotation.x = go * 0.04 * Math.sin(a * 2);
}

/** the lead: from the collar to a point in the same group (the owner's hand) */
export function poseLead(pet, hx, hy, hz) {
  const a = pet._a.set(0, 0.2, 0.1).applyEuler(pet.root.rotation).add(pet.root.position), b = pet._b.set(hx, hy, hz), L = a.distanceTo(b), ld = pet.lead;
  ld.position.copy(a).add(b).multiplyScalar(0.5); ld.scale.set(1, Math.max(0.01, L), 1);
  ld.quaternion.setFromUnitVectors(pet._up, b.sub(a).normalize());
}
