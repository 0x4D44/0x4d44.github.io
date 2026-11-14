// Blinking.  The people are baked meshes with no face bones and no morph targets, so an eyelid is a thing of its own: for each eye a small cap of skin a hair
// proud of the eyeball, hung on the head bone, hidden all the time except for the sixth of a second of a blink (or the seconds of a doze, sitting down).  Then
// it swings down over the eye like a doll's lid and back up.  Where the eyes are and what colour the lid is are read from the model (eyeRig); when to blink
// is plain maths (blinkStep), unit-tested.

export const BLINK = {
  close: 0.07, shut: 0.03, open: 0.11,   // s: lid down, held, up (a blink is 0.1-0.4 s; the closing is the faster half)
  gapMin: 1.8, gapMax: 7.5,              // s between blinks (people blink some 10-20 times a minute at rest)
  phoneGap: 1.7,                         // ...times this when reading a screen (blink rate falls by about half)
  twin: 0.12,                            // chance that a blink is followed at once by a second
  doze: 0.035, dozeMin: 2.5, dozeMax: 9, // sitting: chance per blink of closing the eyes for a while instead
  swing: 1.15,                           // rad: how far up the lid is swung when the eye is open
  range: 9,                              // m from the camera: further than this nobody's lids are drawn
};

/** how closed (0..1) the eye is, t seconds into a blink that is held shut for `hold` seconds */
export function lidAt(t, hold = BLINK.shut) {
  if (!(t > 0)) return 0;
  if (t < BLINK.close) { const u = t / BLINK.close; return u * u * (3 - 2 * u); }
  if (t < BLINK.close + hold) return 1;
  const u = (t - BLINK.close - hold) / BLINK.open; return u >= 1 ? 0 : 1 - u * u * (3 - 2 * u);
}

/** advance one person's blinking: b = { wait, t, hold } (make it with {}), o = { sit, phone }, rng() in [0,1). Returns how closed the eyes are, 0..1. */
export function blinkStep(b, dt, rng, o = {}) {
  if (b.wait == null) { b.wait = rng() * BLINK.gapMax; b.t = -1; b.hold = BLINK.shut; }
  if (b.t >= 0) {
    b.t += dt; const end = BLINK.close + b.hold + BLINK.open;
    if (b.t < end) return lidAt(b.t, b.hold);
    b.t = -1; b.hold = BLINK.shut;
    b.wait = rng() < BLINK.twin ? 0.12 + rng() * 0.1 : (BLINK.gapMin + rng() * (BLINK.gapMax - BLINK.gapMin)) * (o.phone ? BLINK.phoneGap : 1);
    return 0;
  }
  b.wait -= dt;
  if (b.wait <= 0) { b.t = 0; b.hold = o.sit && !o.phone && rng() < BLINK.doze ? BLINK.dozeMin + rng() * (BLINK.dozeMax - BLINK.dozeMin) : BLINK.shut; }
  return 0;
}

/** where a character's eyes are, in the frame of its head bone: { head (bone name), eyes: [{ c: [x,y,z], r }], q: [x,y,z,w] (head-local frame whose x is the
 *  person's left-right, y up, z out of the face), uv: [u,v] (a texel of forehead skin), skin (material) } or null. obj: a posed-at-rest clone of the character. */
export function eyeRig(THREE, obj) {
  const T = THREE, v = new T.Vector3(); let eye = null, skin = null, head = null;
  obj.updateMatrixWorld(true);
  obj.traverse((o) => { if (o.isSkinnedMesh && o.material) { const n = o.material.name || ''; if (/^eye_/.test(n)) eye = o; else if (/^skin_/.test(n)) skin = o; } if (o.isBone && /^head(_\d+)?$/.test(o.name) && !head) head = o; });
  if (!eye || !skin || !head) return null;
  eye.skeleton.update(); skin.skeleton.update();
  const world = (m, i, out) => m.getVertexPosition(i, out).applyMatrix4(m.matrixWorld);
  const P = [], pos = eye.geometry.attributes.position; let mx = 0;
  for (let i = 0; i < pos.count; i++) { const p = world(eye, i, new T.Vector3()); P.push(p); mx += p.x; }
  if (P.length < 8) return null; mx /= P.length;
  const hw = new T.Vector3(); head.getWorldPosition(hw);
  const eyes = [];
  for (const side of [-1, 1]) {
    const S = P.filter((p) => (p.x - mx) * side > 0); if (S.length < 4) return null;
    const lo = new T.Vector3(1e9, 1e9, 1e9), hi = new T.Vector3(-1e9, -1e9, -1e9); for (const p of S) { lo.min(p); hi.max(p); }
    eyes.push({ c: lo.clone().add(hi).multiplyScalar(0.5), r: Math.max(hi.x - lo.x, hi.y - lo.y) / 2 });
  }
  const mid = eyes[0].c.clone().add(eyes[1].c).multiplyScalar(0.5), fz = Math.sign(mid.z - hw.z) || 1;   // the face looks the way the eyes are from the head joint
  // the frame, in the world: x across, y up, z out of the face; then into the head bone's own frame
  const basis = new T.Matrix4().makeBasis(new T.Vector3(fz, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, fz)), qw = new T.Quaternion().setFromRotationMatrix(basis);
  const hq = new T.Quaternion(); head.getWorldQuaternion(hq); const q = hq.clone().invert().multiply(qw);
  // the lid's colour: the skin vertex nearest a point on the forehead (round the eye itself the model keeps socket and mouth-lining vertices, textured red)
  const want = mid.clone().add(new T.Vector3(0, eyes[0].r * 3.2, fz * eyes[0].r * 1.5)), sp = skin.geometry.attributes.position, suv = skin.geometry.attributes.uv; let best = -1, bd = 1e9;
  for (let i = 0; i < sp.count; i++) { const d = world(skin, i, v).distanceToSquared(want); if (d < bd) { bd = d; best = i; } }
  if (best < 0 || !suv) return null;
  const inv = head.matrixWorld.clone().invert();
  return { head: head.name, eyes: eyes.map((e) => ({ c: e.c.clone().applyMatrix4(inv).toArray(), r: e.r })), q: q.toArray(), uv: [suv.getX(best), suv.getY(best)], skin: lidMaterial(T, skin.material, [suv.getX(best), suv.getY(best)]), fz };
}

const lidMats = new Map();
/** a plain material of the skin's colour at one texel, a shade darker (a lid lies in the shadow of the brow). The skin's own textured material on a lid came
 *  out paler than the face around it; a flat colour read from the picture does not. */
function lidMaterial(T, skin, uv) {
  const key = skin.uuid + ':' + uv[0].toFixed(3) + ',' + uv[1].toFixed(3); let m = lidMats.get(key); if (m) return m;
  const col = new T.Color(0xb98e74); let read = false;
  try {
    const img = skin.map && skin.map.image, c = img && typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (c) { c.width = c.height = 8; const g = c.getContext('2d'), w = img.width, h = img.height, v = skin.map.flipY ? 1 - uv[1] : uv[1];
      g.drawImage(img, Math.max(0, Math.min(w - 8, uv[0] * w - 4)), Math.max(0, Math.min(h - 8, v * h - 4)), 8, 8, 0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0; for (let k = 0; k < d.length; k += 4) { r += d[k]; gg += d[k + 1]; b += d[k + 2]; }
      col.setRGB(r / 64 / 255, gg / 64 / 255, b / 64 / 255, T.SRGBColorSpace); read = true; }
  } catch (e) { /* a picture the canvas may not read: the default colour */ }
  col.multiply(skin.color).multiplyScalar(0.8);
  m = new T.MeshStandardMaterial({ name: 'eyelid', color: col, roughness: 0.75, metalness: 0 }); m.userData.read = read; lidMats.set(key, m); return m;
}

const caps = new Map();
/** the lid: the part of a unit sphere in front of the eye, from a little under its middle to well over it; every vertex carries the one skin texel */
function capGeometry(T, uv) {
  const key = uv[0].toFixed(4) + ',' + uv[1].toFixed(4); let g = caps.get(key); if (g) return g;
  const W = 8, H = 6, az = 1.15, e0 = -0.5, e1 = 1.0, pos = [], nor = [], uvs = [], idx = [];
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    const a = -az + 2 * az * i / W, e = e0 + (e1 - e0) * j / H, x = Math.cos(e) * Math.sin(a), y = Math.sin(e), z = Math.cos(e) * Math.cos(a);
    pos.push(x, y, z); nor.push(x, y, z); uvs.push(uv[0], uv[1]);
  }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const a = j * (W + 1) + i, b = a + 1, c = a + W + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
  caps.set(key, g); return g;
}

/** hang a pair of lids on a clone's head bone. Returns { lids: [pivot, pivot], set(c) } or null; set(0) hides them. */
export function makeLids(THREE, obj, rig) {
  if (!rig) return null; const T = THREE; let head = null; obj.traverse((o) => { if (o.isBone && o.name === rig.head && !head) head = o; }); if (!head) return null;
  const geo = capGeometry(T, rig.uv), lids = [];
  for (const e of rig.eyes) {
    const pivot = new T.Group(); pivot.name = 'eyelid'; pivot.position.fromArray(e.c); pivot.quaternion.fromArray(rig.q);
    const swing = new T.Group(), m = new T.Mesh(geo, rig.skin); m.scale.setScalar(e.r * 1.07); m.frustumCulled = false; m.name = 'eyelid_cap'; m.userData.eyelid = true;
    swing.add(m); pivot.add(swing); pivot.visible = false; head.add(pivot); lids.push({ pivot, swing });
  }
  return { lids, c: 0, set(c) { this.c = c; for (const l of lids) { l.pivot.visible = c > 0.01; l.swing.rotation.x = -(1 - c) * BLINK.swing; } } };
}
