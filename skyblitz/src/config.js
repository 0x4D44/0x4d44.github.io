// Global constants shared by every module. Owner: lead.
export const SIM_DT = 1 / 60;          // fixed simulation step (s); gameplay runs ONLY at this rate
export const MAX_SIM_STEPS = 5;        // spiral-of-death guard per rendered frame
export const GRID_SIZE = 8;            // racers per race (player + 7 AI)
export const DEFAULT_LAPS = 3;
export const SETTINGS_KEY = 'skyblitz.settings.v1';
export const SAVE_KEY = 'skyblitz.save.v1';

// Quality presets. Every module MUST honour the scalars it cares about (game.q).
//  renderScale   multiplies the pixel ratio (resolution)          shadows   shadow-map size (0 = off)
//  particles     multiplier on particle counts / spawn rates      scenery   multiplier on prop/foliage/building density
//  trails        multiplier on trail ribbon length                 clouds    multiplier on cloud sprite counts
//  aa            'none' | 'fxaa' | 'smaa'                          water     'simple' | 'full'
//  farMul        multiplier on draw distance / fog far            post      false = render straight to screen (no composer)
export const QUALITY = {
  low:   { id: 'low',   renderScale: 0.7,  pixelRatioCap: 1,    shadows: 0,    bloom: false, aa: 'none', particles: 0.4, scenery: 0.45, trails: 0.5,  clouds: 0.4, water: 'simple', post: false, farMul: 0.7,  aniso: 2 },
  med:   { id: 'med',   renderScale: 0.85, pixelRatioCap: 1.25, shadows: 1024, bloom: true,  aa: 'fxaa', particles: 0.7, scenery: 0.7,  trails: 0.75, clouds: 0.7, water: 'full',   post: true,  farMul: 0.85, aniso: 4 },
  high:  { id: 'high',  renderScale: 1,    pixelRatioCap: 2,    shadows: 2048, bloom: true,  aa: 'smaa', particles: 1,   scenery: 1,    trails: 1,    clouds: 1,   water: 'full',   post: true,  farMul: 1,    aniso: 8 },
  ultra: { id: 'ultra', renderScale: 1,    pixelRatioCap: 2,    shadows: 4096, bloom: true,  aa: 'smaa', particles: 1.4, scenery: 1.3,  trails: 1.4,  clouds: 1.3, water: 'full',   post: true,  farMul: 1.2,  aniso: 16 },
};

const BASE_SETTINGS = {
  quality: 'auto',          // 'auto' | 'low' | 'med' | 'high' | 'ultra'
  masterVolume: 1,
  musicVolume: 0.7,
  sfxVolume: 0.9,
  pitchMode: 'flight',      // 'flight': push forward (W / Up) = nose DOWN (matches the Almanac flight sim); 'arcade': W / Up = nose up
  assist: 'standard',       // 'standard' (auto-level, soft walls) | 'pro' (less hand-holding)
  shake: 1,                 // camera shake scale 0..1
  showFps: false,
  keyGuide: true,           // keyboard flight guide (Standard assist, keyboard only): steers down the course while the keys are idle or only tapped
  doubleTapRoll: false,     // double-tap A / D (or the arrow keys) = barrel roll; off by default (it fires by accident while trimming a turn)
  reduceFlash: false,       // accessibility: no screen flashes / strong chromatic effects
  rumble: true,             // gamepad vibration on hits / tumbles / boosts (flight/input.js reads `rumble === false` as off)
  difficulty: 'normal',     // 'easy' | 'normal' | 'hard' | 'expert'
  lastCraft: 'falcon',
  lastCourse: 'sunrise',
  lastLivery: 0,
};

// V-8: until the player touches them, the two motion settings follow the OS "reduce motion" preference.
export const MOTION_KEYS = ['reduceFlash', 'shake'];
export const REDUCED_MOTION_DEFAULTS = { reduceFlash: true, shake: 0.4 };
const SETTINGS_VERSION = 2;           // blobs without `v` were written when every key was saved, so a motion key equal to the plain default there was never a choice

export function prefersReducedMotion() {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** The defaults for this OS preference. `DEFAULT_SETTINGS` below is this, evaluated once for the page that loads it (Settings > Reset uses it). */
export function defaultSettings(reducedMotion = false) { return { ...BASE_SETTINGS, ...(reducedMotion ? REDUCED_MOTION_DEFAULTS : null) }; }
export const DEFAULT_SETTINGS = defaultSettings(prefersReducedMotion());

/** Pure: the settings object for a stored blob (any shape, possibly corrupt) under an OS preference. */
export function resolveSettings(stored, reducedMotion = false) {
  const blob = stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...stored } : {};
  if (!(blob.v >= SETTINGS_VERSION)) for (const k of MOTION_KEYS) if (blob[k] === BASE_SETTINGS[k]) delete blob[k];   // legacy blob: that value is the old default, not a choice
  delete blob.v;
  return { ...defaultSettings(reducedMotion), ...blob };
}

/** Pure: the blob to persist. A motion key still equal to the default for the current OS preference is left out, so it keeps following the OS. */
export function settingsToStore(settings, reducedMotion = false) {
  const out = { ...settings }, follow = defaultSettings(reducedMotion);
  for (const k of MOTION_KEYS) if (out[k] === follow[k]) delete out[k];
  out.v = SETTINGS_VERSION;
  return out;
}

/** E-28: one rule for boot and for a runtime pick. 'auto' = Med on coarse-pointer devices, High elsewhere; anything unknown = High. */
export function resolveQualityId(setting, coarse = false) {
  if (setting === 'auto') return coarse ? 'med' : 'high';
  return typeof setting === 'string' && Object.hasOwn(QUALITY, setting) ? setting : 'high';     // own keys only: 'constructor' / 'toString' are not presets
}

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'];
