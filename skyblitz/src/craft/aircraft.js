// Procedural hero aircraft: six designs x 3 liveries. Owner: craft agent.
//   buildAircraft(spec, liveryIndex, game) -> THREE.Group  (nose = -Z, right wing = +X, y up, origin at the centre of mass)
//   group.userData = { radius, wingTips: [Vector3 left, Vector3 right], exhausts: [Vector3...], exhaustInfo, parts, rig, tris, draws }
//   updateAircraft(model, racer, dt)  animates control surfaces / propellers / afterburners / lights from racer.controls + racer.flight.
// Geometry is built once per aircraft id (module cache) and shared; materials and meshes are per model. No DOM needed:
// without `document` a plain MeshStandardMaterial is used (Node tooling, headless tests).
import * as THREE from 'three';
import { loft, wingPatch, mirrorX, merge, mapUV, tube, flameGeometry } from './geom.js';
import { liveryTextures, propDiscTexture } from './livery.js';
import { MODELS } from './models.js';
import { makeSkyEnvironment } from './env.js';

const geomCache = new Map();
const LIGHT_COL = { r: [1, 0.08, 0.04], g: [0.08, 1, 0.22], w: [1, 1, 1] };
const MAX = { ail: 0.5, elev: 0.42, rudder: 0.5, elevon: 0.42, canard: 0.4 };

class Builder {
  constructor(spec) {
    this.spec = spec; this.W = spec.visual.wingspan; this.L = spec.visual.length; this.dims = { W: this.W, L: this.L };
    this.paint = []; this.glassList = []; this.parts = []; this.props = []; this.exhaustList = []; this.lightList = []; this.tips = null;
  }
  body(g, mode = 'auto') { this.paint.push(mapUV(g, this.dims, mode)); }
  glass(g) { this.glassList.push(g.index ? g.toNonIndexed() : g); }
  tubeBody(a, b, r, mode) { this.body(tube(a, b, r), mode); }
  wheel(p, r, w) {
    this.body(new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2).translate(p.x, p.y, p.z), 'solid:dark');
    this.body(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w * 1.05, 10).rotateZ(Math.PI / 2).translate(p.x, p.y, p.z), 'solid:accent');
  }
  light(p, c, r) { this.lightList.push({ p, c, r }); }
  exhaust(p, r, kind) { this.exhaustList.push({ p: p.clone(), r, kind }); }
  prop(p, r, blades, kind) { this.props.push({ p: p.clone(), r, blades, kind }); }
  tip(l, r) { this.tips = [l.clone(), r.clone()]; }

  control(kind, geom, side, hinge, vertical = false) {
    const p0 = hinge[0].clone(), axis = hinge[1].clone().sub(hinge[0]).normalize();
    if (vertical ? axis.y < 0 : axis.x < 0) axis.negate();
    const g = mapUV(geom, this.dims); g.translate(-p0.x, -p0.y, -p0.z);
    this.parts.push({ kind, side, geom: g, pivot: p0, axis });
  }
  /** Main wing (both sides): airfoil body, static trailing edge, and separate movable flaps. flaps: [{s0,s1,kind}] */
  wingSet(st0, { hc = 0.72, flaps = [], cam = 0.015, thick = 1.4 } = {}) {
    const st = st0.map((s) => ({ ...s, t: s.t * thick }));
    const segs = []; let cur = 0;
    for (const f of [...flaps].sort((a, b) => a.s0 - b.s0)) { if (f.s0 > cur + 1e-3) segs.push([cur, f.s0]); cur = f.s1; }
    if (cur < 1 - 1e-3 && hc < 1) segs.push([cur, 1]);
    for (const side of [1, -1]) {
      const m = (g) => (side < 0 ? mirrorX(g) : g);
      this.body(m(wingPatch(st, { c0: 0, c1: hc, cam })));
      if (hc < 1) for (const [a, b] of segs) this.body(m(wingPatch(st, { c0: hc, c1: 1, s0: a, s1: b, cam })));
      for (const f of flaps) { const g = m(wingPatch(st, { c0: hc, c1: 1, s0: f.s0, s1: f.s1, cam })); this.control(f.kind, g, side, g.userData.hinge); }
    }
  }
  _pair(st, o) { return [wingPatch(st, o), mirrorX(wingPatch(st, o))]; }
  /** All-moving tailplane (both halves one part, pivot on the centre line). */
  stabilator(st, { z, kind = 'elev' }) {
    this.control(kind, merge(this._pair(st, {})), 0, [new THREE.Vector3(-1, st[0].y, z), new THREE.Vector3(1, st[0].y, z)]);
  }
  canard(st, { z }) { this.stabilator(st, { z, kind: 'canard' }); }
  /** Fixed tailplane with elevators hinged at chord fraction hc. */
  tailplane(st, { hc = 0.64 }) {
    this.body(merge(this._pair(st, { c0: 0, c1: hc })));
    const z = st[0].z + hc * (st[0].chord + st[st.length - 1].chord) * 0.5 - 0.1;
    this.control('elev', merge(this._pair(st, { c0: hc, c1: 1 })), 0, [new THREE.Vector3(-1, st[0].y, z), new THREE.Vector3(1, st[0].y, z)]);
  }
  /** Vertical fin(s) with rudder. st stations run up the span (x = height). */
  fin(st, { x = 0, y = 0, cant = 0, hc = 0.62, rudder = { s0: 0.1, s1: 1 }, mirror = false } = {}) {
    const M = new THREE.Matrix4().makeTranslation(x, y, 0).multiply(new THREE.Matrix4().makeRotationZ(-cant)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    const place = (g) => { g.applyMatrix4(M); if (g.userData.hinge) for (const h of g.userData.hinge) h.applyMatrix4(M); return g; };
    for (const side of mirror ? [1, -1] : [1]) {
      const m = (g) => (side < 0 ? mirrorX(place(g)) : place(g));
      this.body(m(wingPatch(st, { c0: 0, c1: hc })));
      if (rudder.s0 > 0.01) this.body(m(wingPatch(st, { c0: hc, c1: 1, s0: 0, s1: rudder.s0 })));
      const g = m(wingPatch(st, { c0: hc, c1: 1, s0: rudder.s0, s1: rudder.s1 }));
      this.control('rudder', g, side, g.userData.hinge, true);
    }
  }
}

function buildGeometry(spec) {
  const b = new Builder(spec);
  (MODELS[spec.id] || MODELS.falcon)(b);
  const paint = merge(b.paint);
  const glass = b.glassList.length ? merge(b.glassList) : null;
  // nav-light spheres with vertex colours, merged
  let lights = null;
  if (b.lightList.length) {
    const gs = b.lightList.map((l) => { const g = new THREE.IcosahedronGeometry(l.r, 1).translate(l.p.x, l.p.y, l.p.z); const n = g.attributes.position.count; const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(LIGHT_COL[l.c], i * 3); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g.index ? g.toNonIndexed() : g; });
    const n = gs.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
    for (const g of gs) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
    lights = new THREE.BufferGeometry(); lights.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lights.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const flameGeos = b.exhaustList.map((e) => (e.kind === 'flame' ? flameGeometry(e.r, 3.2) : null));
  const propGeos = b.props.map((p) => new THREE.PlaneGeometry(p.r * 2, p.r * 2));
  const tris = (g) => (g ? g.attributes.position.count / 3 : 0);
  let total = tris(paint) + tris(glass) + tris(lights); for (const p of b.parts) total += tris(p.geom);
  return { b, paint, glass, lights, flameGeos, propGeos, parts: b.parts, tris: Math.round(total), tips: b.tips, exhausts: b.exhaustList, props: b.props, L: b.L, W: b.W };
}

function ensureEnvironment(game) {
  try {
    if (game?.scene && game.renderer && !game.scene.environment && !game._craftEnv) {
      game._craftEnv = makeSkyEnvironment(game.renderer); game.scene.environment = game._craftEnv; game.scene.userData.craftEnv = true;
    }
  } catch (e) { /* environment is a nicety */ }
}

export function buildAircraft(spec, liveryIndex = 0, game) {
  let G = geomCache.get(spec.id);
  if (!G) { G = buildGeometry(spec); geomCache.set(spec.id, G); }
  const lv = spec.liveries[liveryIndex % spec.liveries.length];
  const hasDom = typeof document !== 'undefined';
  if (hasDom) ensureEnvironment(game);
  const tex = hasDom ? liveryTextures(spec, liveryIndex) : null;
  const g = new THREE.Group(); g.name = 'aircraft:' + spec.id;
  let paintMat, glassMat;
  if (tex) {
    paintMat = new THREE.MeshPhysicalMaterial({ map: tex.map, roughnessMap: tex.orm, metalnessMap: tex.orm, roughness: 1, metalness: 1, clearcoat: 0.6, clearcoatRoughness: 0.06, envMapIntensity: 0.6, side: THREE.FrontSide });
    glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0b1c33, roughness: 0.03, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.86, envMapIntensity: 2.2 });
  } else {
    paintMat = new THREE.MeshStandardMaterial({ color: lv.primary, roughness: 0.4, metalness: 0.1 });
    glassMat = new THREE.MeshStandardMaterial({ color: 0x0b1c33, roughness: 0.1, transparent: true, opacity: 0.85 });
  }
  const meshes = [];
  const add = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; g.add(m); meshes.push(m); return m; };
  add(G.paint, paintMat, 'paint').receiveShadow = true;
  if (G.glass) { const m = add(G.glass, glassMat, 'glass'); m.castShadow = false; m.renderOrder = 2; }
  const rig = { s: { roll: 0, pitch: 0, yaw: 0, thr: 0.7, boost: 0, spin: 0 }, t: Math.random() * 10, list: [], props: [], flames: [], lights: null, lightMat: null, flameMat: null, propMat: null };
  for (const p of G.parts) {
    const m = add(p.geom, paintMat, 'ctl:' + p.kind); m.position.copy(p.pivot); m.receiveShadow = true;
    rig.list.push({ mesh: m, axis: p.axis, kind: p.kind, side: p.side, max: MAX[p.kind] || 0.4 });
  }
  if (G.lights) {
    rig.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); rig.lights = add(G.lights, rig.lightMat, 'lights'); rig.lights.castShadow = false;
  }
  if (G.flameGeos.some(Boolean) && hasDom !== undefined) {
    rig.flameMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    G.exhausts.forEach((e, i) => { if (!G.flameGeos[i]) return; const m = add(G.flameGeos[i], rig.flameMat, 'flame'); m.position.copy(e.p); m.castShadow = false; m.frustumCulled = false; m.renderOrder = 3; rig.flames.push({ mesh: m, phase: i * 2.3 }); });
  }
  if (G.props.length && hasDom) {
    rig.propMat = new THREE.MeshBasicMaterial({ map: propDiscTexture(G.props[0].blades), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    G.props.forEach((p, i) => { const m = add(G.propGeos[i], rig.propMat, 'prop'); m.position.copy(p.p); m.castShadow = false; m.renderOrder = 3; rig.props.push({ mesh: m, dir: (i % 2 ? -1 : 1) * (p.kind === 'pusher' ? -1 : 1), angle: i * 0.8 }); });
  }
  const sx = G.tips ? G.tips[1].x : G.W / 2;
  g.userData = {
    radius: Math.max(G.L, G.W) * 0.5,
    wingTips: G.tips ? [G.tips[0].clone(), G.tips[1].clone()] : [new THREE.Vector3(-sx, 0, 0), new THREE.Vector3(sx, 0, 0)],
    exhausts: G.exhausts.map((e) => e.p.clone()),
    exhaustInfo: G.exhausts.map((e) => ({ pos: e.p.clone(), radius: e.r, kind: e.kind })),
    parts: { list: rig.list.map((r) => r.mesh), props: rig.props.map((p) => p.mesh), flames: rig.flames.map((f) => f.mesh) },
    rig, tris: G.tris, draws: meshes.length, livery: lv, specId: spec.id,
  };
  // tumble/damage state flags read by Fx
  g.userData.damaged = false;
  return g;
}

/** Idle pose for menus/turntables: engines spooled a little, lights on. */
export function buildPreviewAircraft(spec, liveryIndex = 0, game) {
  const m = buildAircraft(spec, liveryIndex, game); m.userData.rig.s.thr = 0.45; m.userData.preview = true; return m;
}

export function disposeAircraft(model) {
  model.traverse((o) => { if (o.material) o.material.dispose?.(); });   // geometry/textures are shared caches
}

const _q = new THREE.Quaternion();
/** Animate control surfaces from controls, props/afterburners from throttle & boost, lights; flags damage. */
export function updateAircraft(model, racer, dt) {
  const ud = model.userData, rig = ud?.rig; if (!rig) return;
  const c = racer?.controls, f = racer?.flight, s = rig.s;
  dt = Math.min(dt, 0.1);
  const k = 1 - Math.exp(-16 * dt), kb = 1 - Math.exp(-6 * dt);
  const roll = c ? c.roll : 0, pitch = c ? c.pitch : 0, yaw = c ? c.yaw : 0;
  s.roll += (roll - s.roll) * k; s.pitch += (pitch - s.pitch) * k; s.yaw += (yaw - s.yaw) * k;
  const thr = f ? (f.throttle ?? 0.7) : s.thr;
  s.thr += (thr - s.thr) * kb;
  const bo = f && f.boost && f.boost.active ? 1 : (c && c.boost && f && f.boost && f.boost.meter > 0 ? 0.6 : 0);
  s.boost += (bo - s.boost) * kb;
  const tumbling = racer && racer.tumble > 0;
  ud.damaged = !!tumbling;
  rig.t += dt;
  for (const p of rig.list) {
    let a;
    switch (p.kind) {
      case 'ail': a = -p.side * s.roll; break;
      case 'elevon': a = -(p.side * s.roll + s.pitch) * 0.7; break;
      case 'elev': a = -s.pitch; break;
      case 'canard': a = s.pitch; break;
      case 'rudder': a = -s.yaw - (-p.side * s.roll) * 0.0; break;
      default: a = 0;
    }
    p.mesh.quaternion.setFromAxisAngle(p.axis, a * p.max);
  }
  if (rig.props.length) {
    const rpm = 28 + s.thr * 60 + s.boost * 45;
    for (const p of rig.props) { p.angle += p.dir * rpm * dt; p.mesh.rotation.z = p.angle; }
    rig.propMat.opacity = 0.9;
  }
  if (rig.flames.length) {
    const len = 0.28 + 0.5 * s.thr + 1.1 * s.boost, wid = 0.8 + 0.55 * s.boost;
    for (const fl of rig.flames) {
      const flick = 0.92 + 0.08 * Math.sin(rig.t * 70 + fl.phase) + 0.05 * Math.sin(rig.t * 131 + fl.phase * 3);
      fl.mesh.scale.set(wid, wid, len * flick);
    }
    rig.flameMat.color.setScalar(0.55 + 0.6 * s.boost);
    rig.flameMat.opacity = 0.5 + 0.4 * Math.min(1, s.thr + s.boost);
  }
  if (rig.lightMat) {
    const blink = (Math.sin(rig.t * 9) > 0.55) ? 3.2 : 1.1;
    const dmg = tumbling ? (Math.sin(rig.t * 40) > 0 ? 3 : 0.1) : 1;
    rig.lightMat.color.setScalar(blink * dmg);
  }
}
