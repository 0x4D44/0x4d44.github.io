// A smile.  The people are baked meshes with no face bones and no morph targets of their own, but the full-detail faces do have lips: real geometry, a few
// hundred triangles round the mouth.  So a smile is made here as one morph target on the skin: the corners of the mouth go up, out and back, the cheeks lift
// a little, and the middle of the lips stays nearly where it was.  The shape is plain maths in units of the distance between the eyes (smileDelta), fitted to
// each face from where its eyes are; three.js blends it in on the GPU, on top of the skinning.  The far (LOD) model has no smile.
//
// What it is not: there are no teeth to show, the eyes do not narrow, and the shading does not change (no morphed normals).  It is a closed-mouth smile.

export const SMILE = {
  mouthY: 1.17,    // the line of the mouth, below the line of the eyes, in eye-to-eye distances (used when the mouth cannot be found in the mesh)
  half: 0.40,      // half the width of the mouth
  sigma: 0.17,     // how far round a corner of the mouth the pull spreads
  up: 0.135, out: 0.07, back: 0.05,   // a corner's travel at a full smile: about 9 mm up, 4.5 out, 3 back on an adult (review 6: 7 mm up read as no smile at all past a metre)
  cheekX: 0.62, cheekY: 0.55, cheekS: 0.26, cheekUp: 0.05, cheekOut: 0.03,   // the cheek that the corner pushes up
};

/** How far a point of the face moves at a full smile. x: across from the middle of the face, y: up from the line of the mouth, both in eye-to-eye distances.
 *  half: half the width of this mouth. Returns [across, up, out of the face] in the same units; across is away from the middle on either side. */
export function smileDelta(x, y, half = SMILE.half) {
  const S = SMILE, sx = x < 0 ? -1 : 1, ax = Math.abs(x);
  const g = (cx, cy, s) => Math.exp(-((ax - cx) ** 2 + (y - cy) ** 2) / (2 * s * s));
  const c = g(half, 0, S.sigma), k = g(S.cheekX, S.cheekY, S.cheekS);
  return [sx * S.out * c, S.up * c + S.cheekUp * k, -S.back * c + S.cheekOut * k];
}

/** Where the mouth is, from the colour of the skin's picture at points of the lower face: pts = [{ x, y, r, g, b }] (x, y as smileDelta's x and y but with y measured
 *  from the line of the eyes; colours 0..255). Lips are redder than the skin round them. Returns { y, half } (the line of the mouth, half its width), or null when
 *  no lips can be told from the skin (then SMILE.mouthY and SMILE.half serve). */
export function findMouth(pts) {
  const red = (p) => (p.r - (p.g + p.b) / 2) / Math.max(30, p.r + p.g + p.b), R = pts.filter((p) => Math.abs(p.x) < 0.75 && p.y < -0.8 && p.y > -1.6); if (R.length < 12) return null;
  const all = R.map(red).sort((a, b) => a - b), base = all[Math.floor(all.length * 0.35)], top = all[Math.floor(all.length * 0.97)]; if (top - base < 0.03) return null;
  const lips = R.filter((p) => red(p) > base + 0.5 * (top - base) && Math.abs(p.x) < 0.6); if (lips.length < 4) return null;
  // the lips are one patch about the middle of the face: take the row with the most of them, and what joins on to it
  const ys = lips.map((p) => p.y).sort((a, b) => a - b), y0 = ys[Math.floor(ys.length / 2)], L = lips.filter((p) => Math.abs(p.y - y0) < 0.2); if (L.length < 4) return null;
  let y = 0; for (const p of L) y += p.y; y /= L.length;
  const xs = L.map((p) => Math.abs(p.x)).sort((a, b) => a - b), half = xs[Math.floor(xs.length * 0.85)];   // (not the furthest: a flushed cheek is red too)
  if (y > -1.0 || y < -1.5) return null;   // (above -1.0 it is the nose or the top of a full upper lip: woman_dress smiled with her top lip - review 6)
  return { y, half: Math.min(0.48, Math.max(0.32, half)) };
}

/** Give a character's skin the smile. rest: a clone of the character standing in its rest pose (its skin geometry is the one every clone shares).
 *  Returns { geo, moved, mouthY, found } or null (no eyes, no skin, no head). */
export function buildSmile(THREE, rest) {
  const T = THREE; let eye = null, skin = null, head = null;
  rest.updateMatrixWorld(true);
  rest.traverse((o) => { if (o.isSkinnedMesh && o.material) { const n = o.material.name || ''; if (/^eye_/.test(n)) eye = o; else if (/^skin_/.test(n)) skin = o; } if (o.isBone && /^head(_\d+)?$/.test(o.name) && !head) head = o; });
  if (!eye || !skin || !head) return null;
  const geo = skin.geometry; if (geo.morphAttributes.position && geo.userData.smile) return geo.userData.smile;
  if (geo.morphAttributes.position) return null;   // (morph targets of its own: not ours to add to)
  eye.skeleton.update(); skin.skeleton.update();
  const v = new T.Vector3(), ep = eye.geometry.attributes.position; let mx = 0; const E = [];
  for (let i = 0; i < ep.count; i++) { const p = eye.getVertexPosition(i, new T.Vector3()).applyMatrix4(eye.matrixWorld); E.push(p); mx += p.x; }
  if (E.length < 8) return null; mx /= E.length;
  const cen = [];
  for (const side of [-1, 1]) { const S = E.filter((p) => (p.x - mx) * side > 0); if (S.length < 4) return null; const c = new T.Vector3(); for (const p of S) c.add(p); cen.push(c.multiplyScalar(1 / S.length)); }
  const mid = cen[0].clone().add(cen[1]).multiplyScalar(0.5), d = cen[0].distanceTo(cen[1]), hw = new T.Vector3(); head.getWorldPosition(hw);
  if (!(d > 0.02 && d < 0.12)) return null;
  const fz = Math.sign(mid.z - hw.z) || 1;   // (as eyeRig: at rest the face looks along z, the way the eyes are from the head joint)
  // which vertices belong to the head, and where they are on the face
  const hi = skin.skeleton.bones.indexOf(head), si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, pos = geo.attributes.position; if (hi < 0 || !si || !sw) return null;
  const F = new Float32Array(pos.count * 3), on = new Uint8Array(pos.count), pts = [], uv = geo.attributes.uv, px = texels(skin.material);
  for (let i = 0; i < pos.count; i++) {
    let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === hi) w += sw.getComponent(i, k);
    if (w < 0.6) continue;
    skin.getVertexPosition(i, v).applyMatrix4(skin.matrixWorld);
    const x = fz * (v.x - mid.x) / d, y = (v.y - mid.y) / d, z = fz * (v.z - mid.z) / d; if (z < -0.75) continue;   // (the back of the head is not the face)
    on[i] = 1; F[i * 3] = x; F[i * 3 + 1] = y; F[i * 3 + 2] = z;
    if (px && uv && z > -0.25 && y < -0.8 && y > -1.6 && Math.abs(x) < 0.75) { const c = px(uv.getX(i), uv.getY(i)); pts.push({ x, y, r: c[0], g: c[1], b: c[2] }); }
  }
  const found = findMouth(pts), mouthY = found ? -found.y : SMILE.mouthY, half = found ? found.half : SMILE.half;
  // a move in the world, as a move of the vertex before skinning: undo the head bone's transform (three: world = M * Bi * (bone * boneInverse) * B * v)
  const L = new T.Matrix4().copy(skin.matrixWorld).multiply(skin.bindMatrixInverse).multiply(head.matrixWorld).multiply(skin.skeleton.boneInverses[hi]).multiply(skin.bindMatrix);
  const inv = new T.Matrix3().setFromMatrix4(L).invert(), D = new Float32Array(pos.count * 3); let moved = 0;
  for (let i = 0; i < pos.count; i++) {
    if (!on[i]) continue; const m = smileDelta(F[i * 3], F[i * 3 + 1] + mouthY, half); if (Math.abs(m[0]) + Math.abs(m[1]) + Math.abs(m[2]) < 0.002) continue;
    v.set(fz * m[0] * d, m[1] * d, fz * m[2] * d).applyMatrix3(inv); D[i * 3] = v.x; D[i * 3 + 1] = v.y; D[i * 3 + 2] = v.z; moved++;
  }
  if (!moved) return null;
  const a = new T.Float32BufferAttribute(D, 3); a.name = 'smile'; geo.morphAttributes.position = [a]; geo.morphTargetsRelative = true;
  geo.userData.smile = { geo, moved, mouthY, half, found: !!found, d };
  return geo.userData.smile;
}

const PIX = new WeakMap();
/** a reader of a material's picture: (u, v) -> [r, g, b] (0..255), or null where there is no picture or no canvas to read it with */
function texels(mat) {
  const map = mat && mat.map, img = map && map.image; if (!img || typeof document === 'undefined') return null;
  let d = PIX.get(img);
  if (d === undefined) { d = null; try { const c = document.createElement('canvas'), w = c.width = Math.min(1024, img.width), h = c.height = Math.min(1024, img.height), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h); d = { w, h, px: g.getImageData(0, 0, w, h).data }; } catch (e) { d = null; } PIX.set(img, d); }
  if (!d) return null;
  return (u, v) => { const x = Math.min(d.w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * d.w))), vv = map.flipY ? 1 - v : v, y = Math.min(d.h - 1, Math.max(0, Math.floor((vv - Math.floor(vv)) * d.h))), i = (y * d.w + x) * 4; return [d.px[i], d.px[i + 1], d.px[i + 2]]; };
}

/** the skin of a clone, ready to smile: its mesh, with morphTargetInfluences[0] the amount; null if the character has no smile */
export function smileMesh(obj, rig) {
  if (!rig) return null; let skin = null;
  obj.traverse((o) => { if (!skin && o.isSkinnedMesh && o.material && /^skin_/.test(o.material.name || '') && o.geometry === rig.geo) skin = o; });
  if (!skin) return null;
  if (!skin.morphTargetInfluences || skin.morphTargetInfluences.length !== 1) skin.updateMorphTargets();
  skin.morphTargetInfluences[0] = 0; return skin;
}
