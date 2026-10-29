// Engine core (owner: A1). Exports initEngine(ctx) (stage 'engine': renderer, look, post, lights, settings, UI) and
// startEngine(ctx) (last stage: player, visibility, frame loop).
//
// ctx fields set here: renderer camera look post pool glow settings sun hemi stats quality qualityMode
//   ctx.step(dt)  run every system once        ctx.render()  draw one frame (idempotent, deterministic with ?manual)
//   ctx.setHour(h) ctx.setQuality(level) ctx.resize() ctx.resizeTo(w,h)    ctx.ui.{prompt,subtitle,toast,place}
//   ctx.stats = { fps, frameMs, drawCalls, triangles, geometries, textures, programs, quality, ... }  (live, every frame)
// Events: 'quality:change' {level}, 'time:change' {hour, night}, 'player:teleport'.
import * as THREE from 'three';
import { Look } from './look.js';
import { Post, PROFILES } from './post.js';
import { LightPool } from './lights.js';
import { Glow } from './glow.js';
import { Visibility } from './visibility.js';
import { createSettings } from './settings.js';
import { Player } from './player.js';
import { installDebug } from './debug.js';
import { installUI } from '../ui/index.js';

const LEVELS = ['low', 'medium', 'high'];
const QUALITY_NAME = { low: 'baja', medium: 'media', high: 'alta' };

/** Minimal lighting used only if Look cannot be built (a shader or API problem must never leave the page black). */
function fallbackLook(ctx, camera) {
  const scene = ctx.scene;
  scene.background = new THREE.Color(0x9fc2e4); scene.fog = new THREE.FogExp2(0xc9d6e2, 0.0028);
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x9a8672, 2.2), sun = new THREE.DirectionalLight(0xffe0b0, 3.0);
  scene.add(hemi, sun, sun.target);
  const sunDir = new THREE.Vector3(0.45, 0.35, 0.8).normalize();
  const state = { hour: ctx.hour, elDeg: 20, night: 0, day: 1, sunDir, moonDir: new THREE.Vector3(0, -1, 0), exposure: 1, bloomThreshold: 2, bloomStrength: 0.2, saturation: 1.05, indoor: 0, sunIntensity: 3 };
  ctx.sunDir = sunDir;
  return {
    hemi, sun, state, timeScale: 0, useSun: true, fallback: true,
    setHour(h) { ctx.hour = state.hour = h; ctx.events.emit('time:change', { hour: h, night: 0 }); },
    setShadowQuality() {}, snapIndoor() {}, setTimeFlow() {}, refreshEnv() {},
    update() {
      sun.position.copy(camera.position).addScaledVector(sunDir, 100); sun.target.position.copy(camera.position);
      sun.target.updateMatrixWorld();
    },
  };
}

export function initEngine(ctx) {
  const settings = ctx.settings ??= createSettings(ctx);        // main.js normally creates settings + HUD first so the title screen works while loading
  installUI(ctx);

  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, powerPreference: 'high-performance', stencil: false,
    preserveDrawingBuffer: !!ctx.opts.preserve,
    reversedDepthBuffer: ctx.opts.rdb !== false,                 // 32-bit float reversed-Z (EXT_clip_control): no z-fighting at distance; three falls back silently
  });
  renderer.shadowMap.enabled = ctx.opts.shadows !== false;
  renderer.shadowMap.type = THREE.PCFShadowMap;                 // 17-tap kernel with a controllable radius (see Look.setShadowQuality)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;                              // one reset per ctx.render(): counts then include shadow + every post pass
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const log = gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(program) || 'shader error';
    ctx.errors.push({ stage: 'shader', message: String(log).slice(0, 500) });
  };
  ctx.matlib.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());   // before any material is created

  const camera = new THREE.PerspectiveCamera(settings.v.fov, 1, 0.1, 900);
  camera.rotation.order = 'YXZ';
  ctx.renderer = renderer; ctx.camera = camera;

  let look;
  try { look = new Look(ctx, renderer, camera); } catch (e) {
    console.error('[look] failed, using fallback lighting', e);
    ctx.errors.push({ stage: 'look', message: String(e?.message ?? e), stack: e?.stack });
    look = fallbackLook(ctx, camera);
  }
  const post = new Post(ctx, renderer, ctx.scene, camera);
  const pool = new LightPool(ctx, 8);
  const visibility = new Visibility(ctx);
  const glow = new Glow(ctx);
  Object.assign(ctx, { look, post, pool, visibility, glow, sun: look.sun, hemi: look.hemi });
  ctx.stats = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0, quality: ctx.quality, frames: 0 };

  // ---- size / quality -----------------------------------------------------------------------------------------------------
  const size = () => {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    post.setSize(w, h);
  };
  ctx.resize = size;
  ctx.resizeTo = (w, h) => { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); post.setSize(w, h); };

  const dprFor = (prof) => ctx.opts.dpr ?? Math.min(window.devicePixelRatio || 1, prof.ratio);
  ctx.setQuality = (level) => {
    if (!PROFILES[level]) level = 'high';
    const prof = PROFILES[level];
    ctx.quality = ctx.stats.quality = level;
    renderer.setPixelRatio(dprFor(prof));
    look.setShadowQuality(prof.shadow);
    pool.setActive(prof.lights);
    renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight), false);
    post.setProfile(level);
    size();
    ctx.events.emit('quality:change', { level });
  };
  const wanted = ctx.opts.quality ?? settings.v.quality;
  ctx.qualityMode = wanted;                                      // 'auto' adapts to the frame rate; a level pins it
  ctx.setQuality(wanted === 'auto' ? 'high' : wanted);
  window.addEventListener('resize', size);
  window.visualViewport?.addEventListener('resize', size);

  // ---- settings wiring ----------------------------------------------------------------------------------------------------
  settings.on((k, v) => {
    if (k === 'quality') { ctx.qualityMode = v; if (v !== 'auto') ctx.setQuality(v); else if (ctx.quality !== 'high') ctx.setQuality('high'); }
    else if (k === 'fov') { camera.fov = v; camera.updateProjectionMatrix(); }
    else if (k === 'timeFlow') look.setTimeFlow(v);
  });

  // ---- time of day ---------------------------------------------------------------------------------------------------------
  ctx.setHour = (h) => { look.setHour(h); pool.update(0, true); };

  // ---- WebGL context loss ---------------------------------------------------------------------------------------------------
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ctx.contextLost = true; ctx.ui.toast('Se perdió el contexto gráfico; intentando recuperarlo…', 6000); });
  canvas.addEventListener('webglcontextrestored', () => {
    ctx.contextLost = false; look.envDirty = true; look.envRT = null;
    post.broken = false; post.setProfile(ctx.quality); size();
  });

  // ---- frame ---------------------------------------------------------------------------------------------------------------
  ctx.frameDt = 0;
  ctx.step = (dt) => {
    ctx.frameDt = dt;
    for (const s of ctx.systems) {
      try { s.fn(dt, ctx); } catch (e) {
        if (!s.err) { s.err = 1; console.error('[system ' + s.name + ']', e); ctx.errors.push({ system: s.name, message: String(e), stack: e?.stack }); }
      }
    }
  };
  ctx.addSystem('look', (dt) => look.update(dt), 5);
  ctx.addSystem('lights', (dt) => pool.update(dt), 6);
  ctx.addSystem('visibility', (dt) => visibility.update(dt), 7);

  ctx.render = () => {
    if (ctx.contextLost) return;
    const info = renderer.info; info.reset();
    look.update(0);                                              // sun/sky placement for the camera pose of this very frame
    glow.sync();                                                 // lamp and city sprites: clock, viewport and fog of this very frame
    post.render(ctx.frameDt, look);
    const s = ctx.stats;
    s.drawCalls = info.render.calls; s.triangles = info.render.triangles; s.geometries = info.memory.geometries;
    s.textures = info.memory.textures; s.programs = info.programs?.length ?? 0; s.frames++;
  };

  // a teleport must not show a single wrong frame (indoor blend, light fades, interior visibility)
  ctx.events.on('player:teleport', () => { look.snapIndoor(); pool.update(0, true); visibility.update(0, true); });
  installDebug(ctx);
}

/** After every stage has run: create the player, start the loop. */
export function startEngine(ctx) {
  const { renderer, look, post, pool, visibility, settings } = ctx;
  const player = new Player(ctx);
  ctx.player = player;
  player.attach(document.getElementById('gl'));
  ctx.addSystem('player', (dt) => player.update(dt), 0);
  visibility.collect();
  const sp = ctx.plan?.spawn ?? { x: 0, z: 0, ry: 0 };
  player.teleport(sp.x, sp.z, { yaw: sp.yaw ?? sp.ry ?? 0 });
  player.update(0);                                              // place the camera now: the title screen already shows this view
  look.setTimeFlow(!!settings.v.timeFlow);

  // adaptive quality: step down after two slow 2-second windows; step back up only after a long run of fast ones,
  // never to a level that already failed within 90 s
  const ad = { acc: 0, n: 0, bad: 0, good: 0, t0: performance.now(), upAt: 0, bans: new Set(), lastUp: 0 };
  const adapt = (dt) => {
    if (ctx.qualityMode !== 'auto' || ctx.opts.manual || !ctx.running || document.hidden || performance.now() - ad.t0 < 4000) { ad.acc = ad.n = 0; return; }
    ad.acc += dt; ad.n++;
    if (ad.acc < 2) return;
    const ms = (ad.acc / ad.n) * 1000; ad.acc = ad.n = 0;
    const i = LEVELS.indexOf(ctx.quality), now = performance.now();
    if (ms > 21 && i > 0) {
      if (++ad.bad >= 2) {
        ad.bad = ad.good = 0;
        if (now - ad.lastUp < 90000) ad.bans.add(ctx.quality);
        ctx.setQuality(LEVELS[i - 1]); ad.upAt = now + 60000;
        ctx.ui.toast(`Calidad gráfica ajustada a ${QUALITY_NAME[ctx.quality]} para mantener la fluidez`, 4200);
      }
    } else ad.bad = 0;
    if (ms < 9.5 && i < LEVELS.length - 1 && now > ad.upAt && !ad.bans.has(LEVELS[i + 1])) {
      if (++ad.good >= 10) { ad.good = 0; ad.lastUp = now; ctx.setQuality(LEVELS[i + 1]); }
    } else ad.good = 0;
  };

  let last = performance.now(), acc = 0, frames = 0;
  const frame = (t) => {
    const dt = Math.min(Math.max((t - last) / 1000, 0), 1 / 20); last = t;
    if (ctx.running) ctx.step(dt);
    ctx.render();
    frames++; acc += dt;
    if (acc >= 0.5) { ctx.stats.fps = Math.round(frames / acc); ctx.stats.frameMs = +(1000 * acc / frames).toFixed(1); frames = 0; acc = 0; }
    adapt(dt);
    if (!ctx.opts.manual) requestAnimationFrame(frame);
  };
  ctx.running = !!ctx.running;
  if (!ctx.opts.manual) requestAnimationFrame((t) => { last = t; frame(t); });
  else { ctx.step(0.016); ctx.render(); }
}
