// BASELINE engine (owner: ENGINE agent). Seeded by the lead so every other module can be walked and screenshotted
// from day one. Replace/extend freely; keep these exports and the ctx fields they set:
//   ctx.renderer ctx.camera ctx.sun ctx.hemi ctx.player ctx.step(dt) ctx.render() ctx.setHour(h) ctx.ui.{prompt,subtitle,toast}
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { Player } from './player.js';
import { installDebug } from './debug.js';

export function initEngine(ctx) {
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: ctx.opts.aa !== false, powerPreference: 'high-performance',
    preserveDrawingBuffer: !!ctx.opts.preserve,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ctx.opts.dpr ?? 1.5));
  renderer.shadowMap.enabled = ctx.opts.shadows !== false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 700);
  camera.rotation.order = 'YXZ';
  const scene = ctx.scene;
  scene.background = new THREE.Color(0x9fc2e4);
  scene.fog = new THREE.FogExp2(0xc9d6e2, 0.0028);
  // three r155+ light units are physical: ambient/hemisphere need intensity ~ PI to light a surface at its albedo.
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x9a8672, 2.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 3.2);
  sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  Object.assign(ctx, { renderer, camera, sun, hemi });

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize); resize(); ctx.resize = resize;

  ctx.setHour = (h) => {
    ctx.hour = h;
    const t = (h - 6) / 12 * Math.PI;                         // 0 = sunrise (east) .. PI = sunset (west)
    const el = Math.max(0.05, Math.sin(t)) * 1.05, az = Math.PI - t;   // elevation (rad), azimuth from north via east
    ctx.sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    const warm = 1 - Math.min(1, Math.sin(el) * 2.2);
    sun.color.setRGB(1, 0.86 - 0.22 * warm, 0.68 - 0.36 * warm);
    sun.intensity = 3.4 * Math.min(1, Math.sin(el) * 3 + 0.25);
    ctx.events.emit('time:change', { hour: h });
  };
  ctx.setHour(ctx.hour);

  // minimal DOM HUD (engine agent: replace with the real one)
  const $ = (id) => document.getElementById(id);
  let toastT = 0;
  ctx.ui.prompt = (txt) => { const el = $('prompt'); if (el && el.dataset.t !== (txt ?? '')) { el.dataset.t = txt ?? ''; el.textContent = txt ? `E  ·  ${txt}` : ''; el.style.opacity = txt ? 1 : 0; } };
  ctx.ui.subtitle = (o) => { const el = $('subtitle'); if (!el) return; if (!o) { el.innerHTML = ''; el.style.opacity = 0; return; } el.innerHTML = `${o.who ? `<b>${o.who}</b> ` : ''}<span class="es">${o.es ?? ''}</span>${o.en ? `<span class="en">${o.en}</span>` : ''}`; el.style.opacity = 1; };
  ctx.ui.toast = (txt, ms = 3200) => { const el = $('toast'); if (!el) return; el.textContent = txt; el.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = 0; }, ms); };

  ctx.step = (dt) => { for (const s of ctx.systems) { try { s.fn(dt, ctx); } catch (e) { if (!s.err) { s.err = 1; console.error('[system ' + s.name + ']', e); ctx.errors.push({ system: s.name, message: String(e) }); } } } };
  ctx.render = () => {
    const p = ctx.player?.s;
    if (p && ctx.sunDir) {
      const tx = Math.round(p.x), ty = p.y, tz = Math.round(p.z);
      sun.target.position.set(tx, ty, tz);
      sun.position.set(tx + ctx.sunDir.x * 120, ty + ctx.sunDir.y * 120, tz + ctx.sunDir.z * 120);
      sun.target.updateMatrixWorld();
    }
    renderer.render(scene, camera);
  };
  installDebug(ctx);
}

/** After every stage has run: create the player, start the loop. */
export function startEngine(ctx) {
  const player = new Player(ctx);
  ctx.player = player;
  player.attach(document.getElementById('gl'));
  const sp = ctx.plan?.spawn ?? { x: 0, z: 0, ry: 0 };
  player.teleport(sp.x, sp.z, { yaw: sp.yaw ?? 0 });
  ctx.addSystem('player', (dt) => player.update(dt), 0);

  let last = performance.now(), acc = 0, frames = 0;
  ctx.stats = { fps: 0, frameMs: 0 };
  const frame = (t) => {
    const dt = Math.min((t - last) / 1000, 1 / 20); last = t;
    if (ctx.running) ctx.step(dt);
    ctx.render();
    frames++; acc += dt;
    if (acc >= 0.5) { ctx.stats.fps = Math.round(frames / acc); ctx.stats.frameMs = +(1000 * acc / frames).toFixed(1); frames = 0; acc = 0; }
    if (!ctx.opts.manual) requestAnimationFrame(frame);
  };
  ctx.running = true;
  if (!ctx.opts.manual) requestAnimationFrame((t) => { last = t; frame(t); });
  else { ctx.step(0.016); ctx.render(); }
}
