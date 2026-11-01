// Moving and flickering things of the interiors (A3): ceiling-fan rotors (one InstancedMesh per building, so a whole building's fans are ONE draw call),
// the flicker of the TV screens (shared materials) and their glow on the wall behind. Everything is driven by one system, 'interiors-anim', which does
// nothing for buildings whose interior group is hidden.
import * as THREE from 'three';
import { MeshBuilder } from '../core/mesh.js';
import { hashStr } from '../core/rng.js';
import { tintFor } from './standins.js';

const Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
let _rotor = null;

/** Four pitched blades and their irons around the hub (origin, y = 0). Shared by every fan. White = take the instance tint, dark = irons. */
function rotorGeometry() {
  if (_rotor) return _rotor;
  const mb = new MeshBuilder(), unit = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 4; i++) {
    const phi = i * Math.PI / 2, dx = Math.cos(phi), dz = Math.sin(phi);
    _q.setFromEuler(_e.set(0.2, -phi, 0));                                                 // 11.5 degrees of pitch about the blade's own long axis, then round the hub
    mb.geometry('wood_pine', unit, _m.compose(_p.set(dx * 0.34, 0.0, dz * 0.34), _q, new THREE.Vector3(0.42, 0.014, 0.15)), { col: 0xffffff });
    mb.geometry('wood_pine', unit, _m.compose(_p.set(dx * 0.17, -0.022, dz * 0.17), _q.setFromEuler(_e.set(0, -phi, 0)), new THREE.Vector3(0.2, 0.012, 0.035)), { col: 0x2a2018 });
  }
  const a = mb.accs.get('wood_pine'), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
  g.setIndex(new THREE.Uint16BufferAttribute(a.idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return (_rotor = g);
}

const noise = (t) => Math.sin(t * 17.3) * 0.5 + Math.sin(t * 7.1 + 1.3) * 0.3 + Math.sin(t * 31.7 + 4.1) * 0.2;
const TV_TONES = [[0x6fa0ff, 0xffb070], [0xb8d0ff, 0xffd8a0], [0x80e0a0, 0xe08a8a], [0x9fb8ff, 0xf0e0a0]];

function install(ctx) {
  const A = ctx.interiorAnim = { fans: [], byId: new Map(), t: 0, tvs: 0 };
  ctx.addSystem?.('interiors-anim', (dt) => {
    A.t += dt;
    for (const f of A.fans) {                                                              // one entry per building: { obj, mesh, list:[{i, pos, ang, spd, want}] }
      if (!f.obj.visible) continue;
      let dirty = false;
      for (const k of f.list) {
        if (k.spd !== k.want) { k.spd += (k.want - k.spd) * (1 - Math.exp(-dt * 0.9)); if (Math.abs(k.spd - k.want) < 0.03) k.spd = k.want; }       // a switched fan coasts to its new speed
        if (!k.spd) continue;
        k.ang += k.spd * dt; dirty = true;
        f.mesh.setMatrixAt(k.i, _m.compose(k.pos, _q.setFromAxisAngle(Y, k.ang), ONE));
      }
      if (dirty) f.mesh.instanceMatrix.needsUpdate = true;
    }
    if (A.tvs) {                                                                           // TV screens: shared materials, so every set in the barrio shows the same programme
      const c = ctx.matlib?.cache;
      for (const [k, key] of [['tv_screen_a', 0], ['tv_screen_b', 1], ['tv_screen_crt_a', 0], ['tv_screen_crt_b', 1]]) {
        const m = c?.get(k); if (!m) continue;
        const ph = A.t + key * 2.1, tone = TV_TONES[Math.floor(ph / 3.7) % TV_TONES.length][key];
        m.emissive.setHex(tone); m.emissiveIntensity = 0.85 * (0.78 + 0.32 * (0.5 + 0.5 * noise(ph * 1.7)));
      }
      const g = c?.get('tv_glow');
      if (g) { const tone = TV_TONES[Math.floor(A.t / 3.7) % TV_TONES.length][0]; g.color.setHex(tone); g.opacity = 0.2 + 0.1 * (0.5 + 0.5 * noise(A.t * 1.3)); }
    }
  }, 30);
  return A;
}

/** Build the rotors of this building's ceiling fans (records named fan_ceiling). Returns the number of fans. */
export function buildRotors(ctx, bp, group, recs, catalog) {
  const fans = recs.filter((r) => r.name === 'fan_ceiling');
  if (!fans.length) return 0;
  const A = ctx.interiorAnim ?? install(ctx), geo = rotorGeometry();
  const mat = ctx.mat('wood_pine'), c = catalog.fan_ceiling;
  const mesh = new THREE.InstancedMesh(geo, mat, fans.length);
  mesh.name = `${bp.id}.int:rotors`; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
  const list = [];
  fans.forEach((r, i) => {
    const [wx, wy, wz] = bp.frame.toWorld(r.x, r.y - c.size[1] + 0.165, r.z);
    const pos = new THREE.Vector3(wx, wy, wz), on = (hashStr(String(r.id)) >>> 0) % 100 < 72, ang = ((r.x * 7.3 + r.z * 3.1) % 6.28);
    const base = 4.2 + (((r.x * 13.7 + r.z * 5.3) % 1 + 1) % 1) * 3, k = { i, id: r.id, pos, ang, base, spd: on ? base : 0, want: on ? base : 0 };
    list.push(k); A.byId.set(r.id, k);
    mesh.setMatrixAt(i, _m.compose(pos, _q.setFromAxisAngle(Y, ang), ONE));
    mesh.setColorAt(i, new THREE.Color(tintFor(c, r.tint ?? 0xa87445)));
  });
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.obj.add(mesh);
  A.fans.push({ obj: group.obj, mesh, list });
  return fans.length;
}

/** TV glow: a soft additive halo on the wall behind every TV, so a lit lounge reads as lit without spending a real light. Browser only (needs the `tv_glow` material). */
export function buildTvGlow(ctx, bp, b, recs, catalog) {
  const have = !!ctx.matlib?.cache?.has('tv_glow'), byId = new Map(recs.map((r) => [r.id, r]));
  let n = 0;
  for (const r of recs) {
    const c = catalog[r.name]; if (!c || c.dyn !== 'tv') continue;
    n++;
    if (!have) continue;
    const par = r.parent ? byId.get(r.parent) : null, pc = par ? catalog[par.name] : null;
    const back = (r.kind === 'wall' ? c.size[2] / 2 + 0.003 : pc ? pc.size[2] / 2 + 0.008 : c.size[2] / 2 + 0.2) - 0.0;      // distance from the TV centre back to the wall (a hair in front of it)
    const cs = Math.cos(r.ry), sn = Math.sin(r.ry);
    const P = (lx, ly) => [r.x + lx * cs - back * sn, ly, r.z - lx * sn - back * cs];
    const w = c.size[0] * 1.3 + 0.7, h = c.size[1] * 1.3 + 0.55, cy = r.y + c.size[1] / 2;
    b.quad('tv_glow', P(w / 2, cy - h / 2), P(-w / 2, cy - h / 2), P(-w / 2, cy + h / 2), P(w / 2, cy + h / 2), { uv: [0, 0, 1, 0, 1, 1, 0, 1], col: 0xffffff });
  }
  if (n) ensureAnim(ctx).tvs += n;
  return n;
}

/** Make sure the animation system exists even in a building without fans (TV flicker only). */
export const ensureAnim = (ctx) => ctx.interiorAnim ?? install(ctx);

/** Is the ceiling fan record `recId` turning (or told to turn)? false when its rotor is not built yet. */
export const fanOn = (ctx, recId) => !!ctx.interiorAnim?.byId.get(recId)?.want;
/** Switch the fan `recId` on / off (or flip it). Returns the new state, or null when there is no such rotor. */
export function setFan(ctx, recId, on) {
  const k = ctx.interiorAnim?.byId.get(recId); if (!k) return null;
  k.want = (on ?? !k.want) ? k.base : 0;
  return !!k.want;
}

/**
 * The picture on the TV screens (D28: the screen was one flat emissive colour, a white octagon): a football match from the stand, painted in greys, which the screen's emissive tone
 * (the programme's colour, driven above) tints. `crt` = the glass of a tube set, a cap of a sphere, so the picture fades to black round an ellipse and the polygon of its rim never shows;
 * a flat panel shows a whole rectangle. The screens' UVs are planar over the glass (build.js glbParts). Browser only.
 */
export function paintTvPicture(crt) {
  const W = 256, H = 192, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), grey = (v, a = 1) => `rgba(${Math.round(255 * v)},${Math.round(255 * v)},${Math.round(255 * v)},${a})`;
  let s = crt ? 7 : 11; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);       // (the same picture every time)
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = grey(0.42); g.fillRect(0, 0, W, H * 0.2);                                              // the stand: a crowd of specks
  for (let i = 0; i < 380; i++) { g.fillStyle = grey(0.28 + 0.5 * rnd()); g.fillRect(rnd() * W, rnd() * H * 0.2, 2 + rnd() * 2, 2 + rnd() * 3); }
  for (let i = 0; i < 9; i++) { g.fillStyle = grey(i % 2 ? 0.68 : 0.8); g.fillRect(0, H * (0.2 + 0.088 * i), W, H * 0.088 + 1); }       // the mown stripes of the pitch
  g.strokeStyle = grey(0.97); g.lineWidth = 3;                                                         // its lines: halfway, the centre circle, both penalty areas
  g.beginPath(); g.moveTo(W / 2, H * 0.2); g.lineTo(W / 2, H); g.stroke();
  g.beginPath(); g.ellipse(W / 2, H * 0.62, W * 0.13, H * 0.2, 0, 0, Math.PI * 2); g.stroke();
  g.strokeRect(-4, H * 0.38, W * 0.2, H * 0.52); g.strokeRect(W * 0.8, H * 0.38, W * 0.2 + 4, H * 0.52);
  for (let i = 0; i < 9; i++) {                                                                        // players, one side dark, the other light
    const x = W * (0.12 + 0.76 * rnd()), y = H * (0.42 + 0.5 * rnd()), light = i % 2 === 0;
    g.fillStyle = grey(light ? 0.98 : 0.18); g.beginPath(); g.ellipse(x, y, 4, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = grey(0.85); g.beginPath(); g.arc(x, y - 11, 2.4, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = grey(0.97); g.beginPath(); g.arc(W * 0.57, H * 0.7, 3.2, 0, Math.PI * 2); g.fill();     // the ball
  g.fillStyle = grey(0.92); g.fillRect(W * 0.07, H * 0.07, W * 0.24, H * 0.08);                        // the scoreboard, with its two scores
  g.fillStyle = grey(0.12); g.fillRect(W * 0.09, H * 0.095, W * 0.08, H * 0.03); g.fillRect(W * 0.2, H * 0.095, W * 0.08, H * 0.03);
  for (let y = 0; y < H; y += 3) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y, W, 1); }          // scanlines
  g.save(); g.translate(W / 2, H / 2); g.scale(W / 2, H / 2); g.translate(-W / 2, -H / 2);             // the glass: bright in the middle, dark toward its rim (an ellipse as wide as the picture)
  const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, crt ? 1 : 1.4);
  if (crt) { gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.6, 'rgba(0,0,0,0)'); gr.addColorStop(0.97, 'rgba(0,0,0,1)'); }
  else { gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.57, 'rgba(0,0,0,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0.6)'); }
  g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
  if (!crt) { g.fillStyle = '#000'; g.fillRect(0, 0, W, 3); g.fillRect(0, H - 3, W, 3); g.fillRect(0, 0, 3, H); g.fillRect(W - 3, 0, 3, H); }
  return cv;
}

/** Give the screens their picture: the emissive map of the two flat-panel tones and of the tube set's own two (seeds nothing new into the cache: the materials are made as the matlib makes any). */
export function makeTvScreens(ctx) {
  if (typeof document === 'undefined' || !ctx.matlib?.get) return null;
  const flat = new THREE.CanvasTexture(paintTvPicture(false)), tube = new THREE.CanvasTexture(paintTvPicture(true));
  for (const t of [flat, tube]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; }
  for (const [k, t] of [['tv_screen_a', flat], ['tv_screen_b', flat], ['tv_screen_crt_a', tube], ['tv_screen_crt_b', tube]]) { const m = ctx.matlib.get(k); m.emissiveMap = t; m.needsUpdate = true; }
  return { flat, tube };
}

/** The soft radial texture + material of the TV glow (browser only). Seeds `tv_glow` into the material cache. */
export function makeTvGlowMaterial(ctx) {
  if (typeof document === 'undefined' || !ctx.matlib?.cache) return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex, color: 0x6fa0ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  m.name = 'tv_glow'; m.vertexColors = true;
  ctx.matlib.cache.set('tv_glow', m);
  return m;
}
