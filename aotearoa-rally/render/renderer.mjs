// World renderer: createWorld(canvas, opts) -> world (see CONTRACTS.md section 4).
import * as THREE from "three";
import { loadTextureSet } from "./textures.mjs";
import { createSharedUniforms, createWaterMaterial } from "./materials.mjs";
import { createTerrain } from "./terrain.mjs";
import { createRoad } from "./road.mjs";
import { createScenery } from "./scenery.mjs";
import { createSky, createLighting, sunDirection } from "./sky.mjs";
import { createWeather } from "./weather.mjs";
import { createSplash, sprayAmount, inWaterSpan } from "./splash.mjs";
import { createSea } from "./sea.mjs";
import { createPost } from "./post.mjs";
import { QUALITY, QUALITY_LEVELS, createGovernor, forceVisible, guessTier, normalizeQuality, percentile, tierBelow } from "./quality.mjs";

// per-biome colour grade: lift (shadow tint), gain (highlight tint), saturation, contrast, vignette, bloom
const GRADES = {
  pasture: { lift: [0.0, 0.004, 0.01], gain: [1.02, 1.01, 0.98], sat: 1.08, contrast: 1.04, vignette: 0.28, bloom: { strength: 0.22, threshold: 0.95, radius: 0.5 } },
  redwood: { lift: [0.006, 0.012, 0.01], gain: [1.0, 1.02, 0.97], sat: 1.04, contrast: 1.05, vignette: 0.36, bloom: { strength: 0.25, threshold: 0.9, radius: 0.6 } },
  coast: { lift: [0.012, 0.0, 0.0], gain: [1.08, 1.0, 0.9], sat: 1.12, contrast: 1.07, vignette: 0.32, bloom: { strength: 0.34, threshold: 0.85, radius: 0.7 } },
  tussock: { lift: [0.0, 0.0, 0.006], gain: [1.05, 1.02, 0.95], sat: 1.14, contrast: 1.06, vignette: 0.26, bloom: { strength: 0.2, threshold: 0.95, radius: 0.5 } },
  alpine: { lift: [0.008, 0.012, 0.02], gain: [0.98, 1.0, 1.05], sat: 0.9, contrast: 1.04, vignette: 0.34, bloom: { strength: 0.25, threshold: 0.9, radius: 0.6 } },
  rainforest: { lift: [0.004, 0.012, 0.022], gain: [0.94, 1.0, 1.1], sat: 0.92, contrast: 1.1, vignette: 0.45, bloom: { strength: 0.3, threshold: 1.05, radius: 0.7 } },
};

export async function createWorld(canvas, opts = {}) {
  const onProgress = opts.onProgress ?? (() => {});
  let requested = normalizeQuality(opts.quality ?? "auto");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", alpha: false, stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  renderer.setClearColor(0x8899aa, 1);

  let gpuHint = "";
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    gpuHint = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
  } catch { /* ignore */ }
  const mobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent ?? "");
  const autoTier = guessTier({ cores: (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4, mobile, dpr: (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1, gpuHint });
  let tier = requested === "auto" ? autoTier : requested;
  let cfg = QUALITY[tier];
  const getCfg = () => cfg;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.2, 3000);
  camera.position.set(0, 3, 0);
  const dynamicRoot = new THREE.Group();
  dynamicRoot.name = "dynamicRoot";
  scene.add(camera);

  const SU = createSharedUniforms(THREE);
  onProgress(0.02, "textures");
  const textures = await loadTextureSet(THREE, {
    quality: tier, anisotropy: Math.min(cfg.anisotropy, renderer.capabilities.getMaxAnisotropy()), texScale: cfg.texScale,
    onProgress: (p) => onProgress(0.02 + p * 0.3, "textures"),
  });

  const terrain = createTerrain(THREE, { SU, textures, getCfg });
  const road = createRoad(THREE, { SU, textures, getCfg });
  const scenery = createScenery(THREE, { SU, textures, getCfg });
  const sky = createSky(THREE, { getCfg });
  const lighting = createLighting(THREE, scene, getCfg);
  const weather = createWeather(THREE, { SU, getCfg });
  const splash = createSplash(THREE);
  const sea = createSea(THREE, SU, createWaterMaterial);
  const post = createPost(THREE, renderer, scene, camera);
  scene.add(sky.mesh, terrain.group, road.group, scenery.group, weather.group, splash.group, sea.group, dynamicRoot);
  scene.fog = new THREE.FogExp2(0xaabbcc, 0.001);

  const governor = createGovernor();
  governor.enabled = requested === "auto";

  const environment = {
    sunDir: { x: 0, y: 1, z: 0 }, sunColor: new THREE.Color(1, 1, 1), ambient: new THREE.Color(0.5, 0.5, 0.5), fogColor: new THREE.Color(0.6, 0.7, 0.8),
    wetness: 0, rain: 0, snow: 0, windVec: { x: 0, y: 0, z: 0 }, headlights: false,
    sunIntensity: 3, day: 1, fogDensity: 0.001, lightLevel: 1, flash: 0,
  };

  // ---------------------------------------------------------------- state
  const S = {
    stage: null, def: null, time: 0, cssW: 960, cssH: 540, dpr: 1, scale: 1, pr: 1,
    lastRender: 0, ring: new Float32Array(120), ringN: 0, ringHead: 0, scratch: new Float32Array(120), fpsEma: 60, msEma: 16.7,
    carYaw: 0, carPos: new THREE.Vector3(), lastQualityChange: 0, baseDensity: 0.001, weatherOverride: null,
    sunDir: new THREE.Vector3(0, 1, 0), speed01: 0, camPos: new THREE.Vector3(), envRT: null, mood: { day: 1, wetSky: 0, mist: 0 }, ready: false,
    frameStart: 0, lastTris: 0,
  };

  function applySize() {
    const maxPr = cfg.pixelRatioCap;
    S.pr = Math.max(0.5, Math.min(S.dpr, maxPr) * S.scale);
    renderer.setPixelRatio(S.pr);
    renderer.setSize(S.cssW, S.cssH, false);
    post.setSize(S.cssW, S.cssH, S.pr);
    camera.aspect = S.cssW / Math.max(1, S.cssH);
    camera.updateProjectionMatrix();
  }

  function applyQuality(level, silent) {
    tier = level;
    cfg = QUALITY[tier];
    lighting.setShadowMap(cfg.shadowMap, cfg.shadowRange, !!cfg.shadowCascade2, cfg.shadows, cfg.shadowFar);
    renderer.shadowMap.enabled = cfg.shadows;
    textures.setAnisotropy(Math.min(cfg.anisotropy, renderer.capabilities.getMaxAnisotropy()));
    post.configure(cfg);
    applySize();
    sky.setOctaves(cfg.post ? 5 : 3);
    camera.far = Math.min(cfg.viewDist, terrain.viewDist || cfg.viewDist) + 400;
    camera.updateProjectionMatrix();
    if (S.stage && !silent) {
      terrain.refreshQuality(); road.refreshQuality(); scenery.refreshQuality(); weather.rebuild();
      weather.setWeather(S.def.environment, S.weatherOverride);
      sky.setEnvironment(S.def.environment, S.sunDir, S.mood);
      configureFog();
      applyGrade();
    }
    S.lastQualityChange = performance.now();
  }

  function applyGrade() {
    const g = GRADES[S.def?.biome] ?? GRADES.pasture;
    const night = 1 - S.mood.day;
    const gg = {
      lift: g.lift, gain: g.gain.map((c) => c), sat: g.sat * (1 - 0.12 * night), contrast: g.contrast, vignette: g.vignette + 0.08 * night,
      bloom: { ...g.bloom, strength: g.bloom.strength * (1 + 0.5 * night) }, grain: 0.032,
    };
    post.setGrade(gg);
  }

  function configureFog() {
    const env = S.def.environment;
    const fogFar = env.fogFar ?? 900;
    let dens = env.fogDensity ?? 1.7 / fogFar;
    dens = Math.min(3.2 / fogFar, Math.max(1.2 / fogFar, dens));
    const w = weather.state;
    dens *= 1 + 0.9 * w.rainAmt + 1.2 * w.mist + 0.5 * w.snowAmt;
    S.baseDensity = dens;
    scene.fog.color.set(env.fogColor);
    scene.fog.density = dens;
    environment.fogColor.copy(scene.fog.color);
    environment.fogDensity = dens;
    renderer.setClearColor(scene.fog.color, 1);
    SU.uFogBase.value = (S.stage.bounds?.minY ?? 0) + 6;
    SU.uFogFall.value = 0.03;
    SU.uFogBoost.value = 0.35 + 1.3 * w.mist + 0.4 * w.rainAmt;
    SU.uSunDir.value.copy(S.sunDir);
    sky.uniforms.uMist.value = w.mist * 0.5;
    const precip = Math.max(w.rainAmt, w.snowAmt);
    if (precip > 0) {
      // precipitation implies overcast: heavy cloud cover and a greyed, darker dome
      const u = sky.uniforms;
      u.uCover.value = Math.max(u.uCover.value, 0.6 + 0.4 * precip);
      const grey = Math.min(1, precip * 0.7);
      u.uTop.value.lerp(u.uHorizon.value, grey * 0.6).multiplyScalar(1 - 0.25 * grey);
      u.uHorizon.value.lerp(scene.fog.color, grey * 0.7);
    }
    sky.uniforms.uWetSky.value = Math.min(1, w.rainAmt * 0.9 + w.snowAmt * 0.6);
  }

  function rebuildEnvMap() {
    S.envRT?.dispose();
    S.envRT = sky.makeEnvironment(renderer, cfg.envSize);
    scene.environment = S.envRT.texture;
    scene.environmentIntensity = 0.75 + 0.1 * S.mood.day;
  }

  // ---------------------------------------------------------------- stage
  async function setStage(stage, o = {}) {
    disposeStage();
    S.stage = stage; S.def = stage.def; S.weatherOverride = o.weather ?? null;
    const env = stage.def.environment;
    onProgress(0.34, "sky");
    sunDirection(THREE, env.sunAzimuth, env.sunElevation, S.sunDir);
    const lit = lighting.setEnvironment(env, S.sunDir);
    S.mood.day = lit.day;
    weather.setWeather(env, S.weatherOverride);
    S.mood.wetSky = Math.min(1, weather.state.rainAmt); S.mood.mist = weather.state.mist;
    sky.setEnvironment(env, S.sunDir, S.mood);
    sky.setBiome(stage.def.biome);
    configureFog();
    renderer.toneMappingExposure = 1 + 0.9 * (1 - lit.day) + (stage.def.biome === "alpine" ? 0.05 : 0);
    environment.sunDir.x = S.sunDir.x; environment.sunDir.y = S.sunDir.y; environment.sunDir.z = S.sunDir.z;
    environment.sunColor.copy(lighting.sun.color);
    environment.sunIntensity = lighting.sun.intensity;
    environment.ambient.set(env.ambient);
    environment.day = lit.day;
    environment.headlights = !!env.headlights;
    environment.wetness = weather.state.wetness;
    environment.rain = weather.state.rainAmt; environment.snow = weather.state.snowAmt;
    SU.uNight.value = 1 - lit.day;
    SU.uSunCol.value.copy(lighting.sun.color);
    SU.uSunDir.value.copy(S.sunDir);
    rebuildEnvMap();
    applyGrade();
    onProgress(0.4, "terrain");
    terrain.setStage(stage);
    camera.far = Math.min(cfg.viewDist, terrain.viewDist) + 400;
    camera.updateProjectionMatrix();
    onProgress(0.45, "road");
    road.setStage(stage);
    sea.setStage(stage, stage.def.biome, Math.min(getCfg().viewDist, 1600));
    onProgress(0.5, "scenery");
    await scenery.setStage(stage);
    const sp = stage.startPose ?? { x: stage.px[0], y: stage.py[0], z: stage.pz[0], yaw: 0 };
    S.carPos.set(sp.x, sp.y, sp.z); S.carYaw = sp.yaw;
    camera.position.set(sp.x + Math.sin(sp.yaw) * 6, sp.y + 2.4, sp.z + Math.cos(sp.yaw) * 6);
    camera.lookAt(sp.x - Math.sin(sp.yaw) * 20, sp.y + 1, sp.z - Math.cos(sp.yaw) * 20);
    camera.updateMatrixWorld(true);
    S.camPos.copy(camera.position);
    onProgress(0.55, "terrain");
    await terrain.prebuild(sp.x, sp.z, Math.min(560, terrain.viewDist), (p) => onProgress(0.55 + p * 0.38, "terrain"));
    scenery.update(camera, 0, true);
    lighting.update(S.carPos, S.carYaw, 0, 0);
    try { renderer.compile(scene, camera); } catch { /* ignore */ }
    S.ready = true;
    onProgress(1, "ready");
  }

  function disposeStage() {
    S.ready = false;
    terrain.disposeStage(); road.disposeStage(); scenery.disposeStage(); sea.dispose();
    S.envRT?.dispose(); S.envRT = null; scene.environment = null;
    S.stage = null;
  }

  // ---------------------------------------------------------------- frame
  const fwd = new THREE.Vector3();
  function update(dt, frame = {}) {
    if (!S.stage) return;
    dt = Math.min(Math.max(dt, 0), 0.1);
    S.time = frame.time ?? S.time + dt;
    const cp = frame.carPos ?? S.carPos;
    S.carPos.set(cp.x, cp.y, cp.z);
    const cv = frame.carVel ?? { x: 0, y: 0, z: 0 };
    if (typeof frame.carYaw === "number") S.carYaw = frame.carYaw;
    else if (cv.x * cv.x + cv.z * cv.z > 4) S.carYaw = Math.atan2(-cv.x, -cv.z);
    const cam = frame.camPos ?? camera.position;
    S.camPos.set(cam.x, cam.y, cam.z);
    const spd = Math.hypot(cv.x, cv.z);
    S.speed01 = Math.min(1, Math.max(0, ((frame.speedKmh ?? spd * 3.6) - 60) / 140));

    const w = weather.state;
    terrain.update(S.camPos, S.carPos);
    road.update(SU.uWet.value);
    if (spd > 1) { S.fx = cv.x / spd; S.fz = cv.z / spd; }
    road.setCar(S.carPos.x, S.carPos.z, S.fx ?? 0, S.fz ?? 0);
    scenery.update(camera, S.time);
    sea.update(S.camPos);
    weather.update(dt, S.time, S.camPos, S.carPos, cv, 0.6 + 0.55 * S.mood.day * (1 - 0.35 * w.rainAmt), S.def.environment.fogColor);
    splash.update(S.time, S.carPos, cv, S.carPos.y - 0.2, sprayAmount(inWaterSpan(S.stage.water, S.carPos.x, S.carPos.z), SU.uWet.value, spd), 0.6 + 0.55 * S.mood.day);
    lighting.update(S.carPos, S.carYaw, spd, weather.state.flash);
    sky.update(S.time, S.camPos, { x: weather.wind.x * weather.wind.strength * 4, z: weather.wind.z * weather.wind.strength * 4 }, weather.state.flash);
    environment.windVec.x = weather.wind.x * weather.wind.strength * 8; environment.windVec.z = weather.wind.z * weather.wind.strength * 8;
    environment.flash = weather.state.flash;
    environment.sunIntensity = lighting.sun.intensity;
  }

  /** Compile every program (weather, flare, post, shadow variants) and draw one frame so the first drive has no stall.
   *  Call after the game has attached the car visual and FX. */
  async function warmup() {
    if (!S.stage) return;
    const objs = [];
    scene.traverse((o) => { if (o !== scene && !o.isLight) objs.push(o); });
    const restore = forceVisible(objs);
    try {
      try { await renderer.compileAsync(scene, camera); } catch { /* ignore */ }
      renderer.shadowMap.needsUpdate = true;
      if (post.enabled) post.render(0.016); else renderer.render(scene, camera);
      renderer.getContext().finish();
    } finally { restore(); renderer.info.reset(); S.lastRender = 0; }
  }

  const noPost = { w: 0 };
  function render() {
    const now = performance.now();
    if (S.lastRender) {
      const ms = now - S.lastRender;
      if (ms < 1000) {
        S.ring[S.ringHead] = ms; S.ringHead = (S.ringHead + 1) % S.ring.length; if (S.ringN < S.ring.length) S.ringN++;
        S.msEma += (ms - S.msEma) * 0.08; S.fpsEma = 1000 / Math.max(1, S.msEma);
        if (governor.enabled) {
          const before = governor.scale;
          governor.frame(ms);
          if (Math.abs(governor.scale - before) > 1e-4) { S.scale = governor.scale; applySize(); }
          if (governor.tierDownRequested && tier !== "low" && now - S.lastQualityChange > 8000) {
            governor.reset(); governor.scale = 1; S.scale = 1;
            applyQuality(tierBelow(tier), false);
          }
        }
      }
    }
    S.lastRender = now;
    renderer.info.reset();
    if (!S.stage) { renderer.render(scene, camera); return; }
    post.setDynamic(S.time, S.speed01);
    if (post.enabled) post.render(0.016);
    else renderer.render(scene, camera);
  }

  function resize(w, h, dpr) {
    S.cssW = Math.max(2, Math.floor(w)); S.cssH = Math.max(2, Math.floor(h));
    S.dpr = dpr ?? (typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1);
    applySize();
  }

  function getStats() {
    const info = renderer.info;
    return {
      fps: Math.round(S.fpsEma * 10) / 10,
      frameMsAvg: Math.round(S.msEma * 100) / 100,
      frameMsP95: Math.round(percentile(S.ring, S.ringN, 0.95, S.scratch) * 100) / 100,
      drawCalls: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0,
      resolutionScale: Math.round(S.scale * 100) / 100,
      tier, instances: scenery.stats.instances, terrainChunks: terrain.chunks.size,
    };
  }

  const world = {
    THREE, renderer, scene, camera, dynamicRoot, environment, textures,
    setStage, update, render, warmup, resize, getStats, disposeStage,
    get quality() { return requested; },
    get effectiveQuality() { return tier; },
    setQuality(level) {
      requested = normalizeQuality(level);
      governor.enabled = requested === "auto";
      governor.reset(); S.scale = 1; governor.scale = 1;
      applyQuality(requested === "auto" ? autoTier : requested, false);
    },
    setGovernor(on) { governor.enabled = !!on; if (!on) { S.scale = 1; governor.scale = 1; applySize(); } },
    markSkid(wheelIndex, contact, yaw, intensity, surfaceId) { road.markSkid(wheelIndex, contact, yaw, intensity, surfaceId); },
    addDecal(kind, ...a) { if (kind === "skid") road.markSkid(...a); },
    clearSkids() { road.clearSkids(); },
    /** Contract amendment: renderer-owned lights/stage bits for tooling. */
    get sharedUniforms() { return SU; },
    get stageObjects() { return { terrain, road, scenery, sky, lighting, weather, post }; },
    dispose() {
      disposeStage();
      post.dispose(); weather.dispose(); splash.dispose(); sky.dispose(); lighting.dispose(); textures.dispose();
      renderer.dispose();
    },
  };
  void noPost;
  void QUALITY_LEVELS;

  applyQuality(tier, true);
  resize(canvas.clientWidth || 960, canvas.clientHeight || 540, typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1);
  weather.setWeather({ weather: { type: "clear", intensity: 0 }, windStrength: 0.3 }, null);
  onProgress(0.34, "ready");
  return world;
}
