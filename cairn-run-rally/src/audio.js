import { clamp } from './math.js';

const DEFAULT_AUDIO_ROOT = './public/audio/pacenotes';
const DEFAULT_IDLE_RPM = 900;
const DEFAULT_REDLINE_RPM = 7800;
const MAX_RPM = 22000;
const SURFACE_AUDIO = Object.freeze({
  compact: { level: 0.042, band: 700, filter: 2700 },
  loose: { level: 0.082, band: 980, filter: 3400 },
  grass: { level: 0.11, band: 520, filter: 2200 },
  tarmac: { level: 0.028, band: 430, filter: 3200 },
  'wet-tarmac': { level: 0.052, band: 560, filter: 2700 },
  mud: { level: 0.12, band: 380, filter: 1800 },
  water: { level: 0.16, band: 1600, filter: 4300 },
  snow: { level: 0.034, band: 260, filter: 1500 },
  ice: { level: 0.024, band: 720, filter: 3600 },
  'desert-gravel': { level: 0.1, band: 1120, filter: 3600 },
  'rough-gravel': { level: 0.112, band: 1040, filter: 3300 },
  'red-gravel': { level: 0.108, band: 1180, filter: 3700 },
  washboard: { level: 0.128, band: 1320, filter: 3900 }
});
const DEFAULT_SURFACE_AUDIO = SURFACE_AUDIO.compact;
const DRIVE_FACTORS = Object.freeze({ fwd: 0.93, rwd: 1.07, awd: 1 });

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const unit = (value, fallback = 0) => clamp(finite(value, fallback), 0, 1);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

function safePart(value) {
  const part = String(value ?? '').trim();
  if (!part || part === '.' || part === '..' || part.includes('..') || /[\\/]/.test(part)) return '';
  return part.replace(/[^A-Za-z0-9_-]/g, '-');
}

function localPath(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const path = value.trim();
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.includes('..')) return '';
  return path;
}

function audioSettings(profile) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const nested = source.audio && typeof source.audio === 'object' ? source.audio : {};
  const sound = source.sound && typeof source.sound === 'object' ? source.sound : {};
  const engine = nested.engine && typeof nested.engine === 'object'
    ? nested.engine
    : sound.engine && typeof sound.engine === 'object' ? sound.engine : {};
  const transmission = nested.transmission && typeof nested.transmission === 'object'
    ? nested.transmission
    : sound.transmission && typeof sound.transmission === 'object' ? sound.transmission : {};
  return { engine, transmission };
}

function selectedCarProfile(profile) {
  if (profile && typeof profile === 'object' && profile.profile && typeof profile.profile === 'object' && !Array.isArray(profile.profile) && !profile.torqueCurve) return profile.profile;
  return profile || {};
}

function curveStats(profile) {
  const curve = Array.isArray(profile?.torqueCurve)
    ? profile.torqueCurve.filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
      .sort((a, b) => a[0] - b[0])
    : [];
  if (!curve.length) return { curve: [], peakRpm: 4200, peakTorque: 240, redline: DEFAULT_REDLINE_RPM };
  let peak = curve[0];
  for (const point of curve) if (point[1] > peak[1]) peak = point;
  return {
    curve,
    peakRpm: clamp(peak[0], 800, MAX_RPM),
    peakTorque: clamp(peak[1], 20, 1800),
    redline: clamp(curve.at(-1)[0], 2000, MAX_RPM)
  };
}

/**
 * Turn a mechanical car profile into an audio recipe. The recipe deliberately
 * depends on measured profile data, so adding a car does not add an identity
 * branch to the audio consumer. Authored audio fields can tune the result when
 * present, but they are not required for a useful, distinct sound.
 */
export function deriveEngineCharacter(profile = {}) {
  const settings = audioSettings(profile);
  const configured = settings.engine;
  const stats = curveStats(profile);
  const gears = Array.isArray(profile.gearRatios) ? profile.gearRatios.length : 5;
  const finalDrive = clamp(finite(profile.finalDrive, 4), 2, 8);
  const mass = clamp(finite(profile.massKg, 1100), 450, 2600);
  const power = clamp(finite(profile.powerBhp, stats.peakTorque * stats.peakRpm / 7127), 40, 1000);
  const driveFactor = DRIVE_FACTORS[profile.drive] ?? 1;
  const powerDensity = clamp(power / mass, 0.035, 0.8);
  const peakPosition = clamp((stats.peakRpm - 1000) / Math.max(1000, stats.redline - 1000), 0, 1);
  const torqueShape = clamp(stats.peakTorque / Math.max(80, power * 0.82), 0.25, 2.2);
  const defaultIdle = 820 + (1 - peakPosition) * 180 + (gears < 5 ? 45 : 0);
  const idleRpm = clamp(finite(configured.idleRpm, defaultIdle), 500, 3000);
  const redline = clamp(finite(configured.redline, stats.redline), idleRpm + 700, MAX_RPM);
  const order = clamp(
    finite(configured.order, 1.45 + gears * 0.105 + powerDensity * 1.4 + (driveFactor - 1) * 0.25),
    0.8,
    4.8
  );
  const harmonic = clamp(
    finite(configured.harmonic, 1.82 + torqueShape * 0.18 + (1 - peakPosition) * 0.28),
    1.15,
    3.8
  );
  const mesh = clamp(
    finite(settings.transmission.meshMultiplier, 5.4 + finalDrive * 0.42 + gears * 0.16),
    3,
    11
  );
  const bodyHz = clamp(
    finite(configured.bodyHz, 145 + stats.peakRpm * 0.012 + stats.peakTorque * 0.21 + mass * 0.018),
    90,
    1100
  );
  return Object.freeze({
    idleRpm,
    redline,
    peakRpm: stats.peakRpm,
    peakTorque: stats.peakTorque,
    order,
    harmonic,
    bodyHz,
    transmissionRatio: mesh,
    lowLevel: clamp(finite(configured.lowLevel, 0.38 + powerDensity * 0.32), 0.16, 0.9),
    highLevel: clamp(finite(configured.highLevel, 0.16 + torqueShape * 0.11 + (1 - peakPosition) * 0.08), 0.05, 0.55),
    textureLevel: clamp(finite(configured.textureLevel, 0.08 + (gears / 6) * 0.07), 0.02, 0.3),
    intakeLevel: clamp(finite(configured.intakeLevel, 0.035 + powerDensity * 0.08), 0.015, 0.22),
    exhaustLevel: clamp(finite(configured.exhaustLevel, 0.04 + torqueShape * 0.026), 0.02, 0.16),
    transmissionLevel: clamp(finite(settings.transmission.level, 0.024 + finalDrive * 0.003), 0.008, 0.09),
    diffLevel: clamp(finite(settings.transmission.diffLevel, 0.008 + driveFactor * 0.006), 0.003, 0.035),
    shiftCut: clamp(finite(configured.shiftCut, 0.19 + (1 - driveFactor) * 0.03), 0.08, 0.45),
    shiftBlip: clamp(finite(configured.shiftBlip, 0.3 + torqueShape * 0.06), 0.12, 0.65),
    overrun: clamp(finite(configured.overrun, 0.025 + (1 - peakPosition) * 0.035), 0.01, 0.12)
  });
}

/** Derive an ambience/road recipe from authored stage and weather data. */
export function deriveStageSoundscape(stage = {}, weather = null) {
  const segments = Array.isArray(stage?.segments) ? stage.segments : [];
  const totals = {
    compact: 0, loose: 0, grass: 0, tarmac: 0, 'wet-tarmac': 0, mud: 0, water: 0,
    snow: 0, ice: 0, 'desert-gravel': 0, 'rough-gravel': 0, 'red-gravel': 0, washboard: 0
  };
  let total = 0;
  let width = 7;
  let rise = 0;
  for (const segment of segments) {
    const length = Math.max(0, finite(segment?.lengthM));
    total += length;
    const surface = String(segment?.surface || 'compact');
    totals[surface] = (totals[surface] || 0) + length;
    width += (finite(segment?.widthM, 7) - width) * (length / Math.max(1, total));
    rise += Math.abs(finite(segment?.riseM));
  }
  const authoredWeather = weather && typeof weather === 'object'
    ? weather
    : stage?.weather && typeof stage.weather === 'object' ? stage.weather : {};
  const precipitation = String(authoredWeather.precipitation || 'none').toLowerCase();
  const precipitationLevel = precipitation === 'storm' ? .95
    : precipitation === 'rain' ? .65
      : precipitation === 'sleet' ? .82
        : precipitation === 'freezing-rain' ? .88
          : precipitation === 'snow' ? .72 : 0;
  const wetness = unit(authoredWeather.roadWetness);
  const wind = unit(authoredWeather.wind);
  const roughDistance = totals.loose + totals.grass + totals.mud + totals['desert-gravel'] + totals['rough-gravel'] + totals['red-gravel'] + totals.washboard + totals.snow * .58 + totals.ice * .28;
  const rough = total ? clamp(roughDistance / total, 0, 1) : 0;
  const openness = clamp((width - 6) / 3, 0, 1);
  const gradient = clamp(rise / Math.max(1, total) * 8, 0, 1);
  const configured = stage?.audio?.soundscape && typeof stage.audio.soundscape === 'object'
    ? stage.audio.soundscape
    : stage?.soundscape && typeof stage.soundscape === 'object' ? stage.soundscape : {};
  const roadBase = 0.035 + rough * 0.055 + (1 - openness) * 0.018;
  const weatherRoadFactor = 1 + wetness * .42 + precipitationLevel * .2;
  const roadLevel = clamp(finite(configured.roadLevel, roadBase * weatherRoadFactor), 0.01, 0.18);
  const roadBandHz = clamp(finite(configured.roadBandHz, 660 + rough * 560 + wetness * 150 + precipitationLevel * 210), 260, 2200);
  const roadFilterHz = clamp(finite(configured.roadFilterHz, 2500 + openness * 1600 - wetness * 260 + precipitationLevel * 110), 1200, 7000);
  const gravelLevel = clamp(finite(configured.gravelLevel, roadLevel * (1 + rough * 2.2 + wetness * .18)), 0.01, 0.28);
  const windLevel = clamp(finite(configured.windLevel, 0.028 + openness * 0.018 + gradient * 0.012 + wind * .035 + precipitationLevel * .022), 0.01, 0.12);
  const windFilterHz = clamp(finite(configured.windFilterHz, 240 + gradient * 180 + wind * 120 + precipitationLevel * 70), 120, 900);
  const ambienceLevel = clamp(finite(configured.ambienceLevel, 0.008 + openness * 0.012 + wind * .008 + precipitationLevel * .009), 0.002, 0.06);
  return Object.freeze({
    stageId: safePart(stage?.id) || null,
    weatherId: safePart(authoredWeather.id || authoredWeather.weatherId) || null,
    precipitation,
    precipitationLevel,
    wetness,
    wind,
    roadLevel,
    roadBandHz,
    roadFilterHz,
    gravelLevel,
    windLevel,
    windFilterHz,
    ambienceLevel,
    surfaceMix: Object.freeze({ ...totals })
  });
}

function torqueAt(profile, rpm) {
  const curve = curveStats(profile).curve;
  if (!curve.length) return 0;
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i += 1) {
    if (rpm <= curve[i][0]) {
      const a = curve[i - 1], b = curve[i];
      const t = (rpm - a[0]) / Math.max(1, b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return curve.at(-1)[1];
}

/** Convert live car/input state into finite values used by every audio layer. */
export function readAudioTelemetry(car = {}, input = {}, profile = car?.profile || {}) {
  const selectedProfile = selectedCarProfile(profile);
  const character = deriveEngineCharacter(selectedProfile);
  const rawRpm = finite(car?.engineRpm ?? car?.rpm, 0);
  const rpm = rawRpm <= 1 ? 0 : clamp(rawRpm, character.idleRpm, character.redline * 1.12);
  const throttle = unit(input?.throttle ?? car?.input?.throttle);
  const brake = unit(input?.brake ?? car?.input?.brake);
  const speed = Math.abs(finite(car?.speed, Math.hypot(finite(car?.vx), finite(car?.vz))));
  const gear = Math.round(finite(car?.gear, 0));
  const shiftTimer = Math.max(0, finite(car?.gearShiftTimer, 0));
  const shift = Math.max(unit(car?.shiftPulse), clamp(shiftTimer / 0.42, 0, 1));
  const explicitLoad = car?.engineLoad ?? car?.load;
  const torqueLoad = rpm > 0 ? clamp(torqueAt(selectedProfile, rpm) / Math.max(1, character.peakTorque), 0, 1) : 0;
  const accelerationLoad = clamp(Math.max(0, finite(car?.acceleration)) / 12, 0, 1) * 0.18;
  const load = explicitLoad == null
    ? clamp(throttle * 0.72 + torqueLoad * (0.12 + throttle * 0.22) + accelerationLoad - brake * 0.08, 0, 1)
    : unit(explicitLoad);
  const ratio = Array.isArray(selectedProfile?.gearRatios) && gear > 0 && gear <= selectedProfile.gearRatios.length
    ? finite(selectedProfile.gearRatios[gear - 1], 0)
    : gear > 0 ? 3.2 / gear : 0;
  const rpmNormalised = rpm > 0 ? clamp((rpm - character.idleRpm) / Math.max(1, character.redline - character.idleRpm), 0, 1.2) : 0;
  return Object.freeze({
    rpm,
    rpmNormalised,
    throttle,
    brake,
    load,
    engineLoad: load,
    speed,
    gear,
    gearRatio: ratio,
    shift,
    overrun: rpm > character.idleRpm * 1.45 && throttle < 0.08 && brake < 0.35,
    running: rpm > 1,
    surface: String(car?.surface || 'compact')
  });
}

function noteToken(note) {
  const explicit = note?.audioKey ?? note?.assetId ?? note?.id ?? note?.index;
  if (typeof explicit === 'string' && safePart(explicit)) return safePart(explicit);
  if (Number.isFinite(explicit)) return String(Math.max(0, Math.round(explicit))).padStart(2, '0');
  if (Number.isFinite(note?.atM)) return `at-${Math.max(0, Math.round(note.atM))}`;
  return 'unknown';
}

function sourceExtension(format) {
  return String(format).toLowerCase() === 'ogg' ? ['ogg', 'mp3'] : ['mp3', 'ogg'];
}

/**
 * Return stage-qualified local files first, then the legacy flat files. The
 * fallback keeps Kestrel's shipped assets working while new stages can package
 * their own voice set without numeric ID collisions.
 */
export function paceNoteSources(stage, note, format = 'mp3') {
  const rootCandidate = stage?.paceNotes?.audioRoot ?? stage?.audio?.paceNotesRoot ?? stage?.audioRoot;
  const root = localPath(rootCandidate) || DEFAULT_AUDIO_ROOT;
  const explicit = note?.audio;
  const result = [];
  const add = value => {
    const path = localPath(value);
    if (path && !result.includes(path)) result.push(path);
  };
  if (typeof explicit === 'string') {
    for (const extension of sourceExtension(format)) add(explicit.replace(/\.(?:mp3|ogg)$/i, `.${extension}`));
  } else if (explicit && typeof explicit === 'object') {
    for (const extension of sourceExtension(format)) add(explicit[extension]);
  }
  const token = noteToken(note);
  const stageId = safePart(stage?.id ?? stage?.stageId);
  for (const extension of sourceExtension(format)) {
    if (stageId) add(`${root}/${stageId}/note-${token}.${extension}`);
    for (const key of ['path', 'file', 'asset']) {
      const path = localPath(note?.[key]);
      if (path) add(path.replace(/\.(?:mp3|ogg)$/i, `.${extension}`));
    }
    add(`${root}/note-${token}.${extension}`);
  }
  return result;
}

export function resolvePaceNoteSource(stage, note, format = 'mp3') {
  return paceNoteSources(stage, note, format)[0] || null;
}

function startNode(node, time = 0) {
  try { node?.start?.(time); } catch (_) { /* already started or unsupported fake */ }
}

function stopNode(node, time = 0) {
  try { node?.stop?.(time); } catch (_) { /* already stopped */ }
}

function setParam(param, value, now, smoothing = 0.04) {
  if (!param) return;
  const target = finite(value, 0);
  const time = finite(now, 0);
  try {
    if (typeof param.setTargetAtTime === 'function') param.setTargetAtTime(target, time, Math.max(0.005, smoothing));
    else param.value = target;
  } catch (_) {
    try { param.value = target; } catch (_) { /* browser capability failure */ }
  }
}

function setValue(param, value, now) {
  if (!param) return;
  const target = finite(value, 0);
  try {
    if (typeof param.setValueAtTime === 'function') param.setValueAtTime(target, finite(now, 0));
    else param.value = target;
  } catch (_) {
    try { param.value = target; } catch (_) { /* browser capability failure */ }
  }
}

function connect(source, destination) {
  try { return source?.connect?.(destination) || destination; } catch (_) { return destination; }
}

function createGain(ctx, value = 0.0001) {
  const gain = ctx.createGain();
  try { gain.gain.value = value; } catch (_) { setParam(gain.gain, value, 0); }
  return gain;
}

function createNoiseBuffer(ctx, seconds = 2) {
  const sampleRate = Math.max(8000, finite(ctx.sampleRate, 48000));
  const length = Math.max(32, Math.floor(sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  let filtered = 0;
  for (let i = 0; i < data.length; i += 1) {
    const value = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    const white = (value - Math.floor(value)) * 2 - 1;
    filtered = filtered * 0.86 + white * 0.14;
    data[i] = white * 0.52 + filtered * 1.6;
  }
  return buffer;
}

function createLoop(ctx, buffer, filterType, filterFrequency, level, destination) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  setParam(filter.frequency, filterFrequency, 0, 0.01);
  const gain = createGain(ctx, level);
  connect(source, filter);
  connect(filter, gain);
  connect(gain, destination);
  startNode(source);
  return { source, filter, gain };
}

function contextConstructor() {
  const root = typeof window !== 'undefined' ? window : globalThis;
  return root?.AudioContext || root?.webkitAudioContext || globalThis?.AudioContext || globalThis?.webkitAudioContext || null;
}

function audioConstructor() {
  const root = typeof window !== 'undefined' ? window : globalThis;
  return root?.Audio || globalThis?.Audio || null;
}

function stageId(stage) {
  return safePart(stage?.id ?? stage?.stageId) || null;
}

function paceAt(note) {
  const value = note?.at ?? note?.atM ?? note?.distance;
  return Number.isFinite(value) ? value : null;
}

function parsePlayArgs(stageOrOptions, maybeOptions) {
  if (stageOrOptions && (stageOrOptions.id || stageOrOptions.stageId || stageOrOptions.segments || stageOrOptions.notes)) {
    return { stage: stageOrOptions, options: maybeOptions || {} };
  }
  return { stage: null, options: stageOrOptions || {} };
}

/**
 * Web Audio consumer for car/stage telemetry. It has no DOM dependency and does
 * not write captions; game.js remains the sole owner of visible pace-note text.
 */
export class AudioSystem {
  constructor(options = {}) {
    this.ctx = null;
    this.started = false;
    this.effectsVolume = clamp(finite(options.effectsVolume, 0.75), 0, 1);
    this.voiceVolume = clamp(finite(options.voiceVolume, 0.9), 0, 1);
    this.audioRoot = localPath(options.audioRoot) || DEFAULT_AUDIO_ROOT;
    this.carProfile = selectedCarProfile(options.car || options.carProfile || null);
    this.stageProfile = options.stage || options.stageProfile || null;
    this.weatherProfile = options.weather || options.weatherProfile || this.stageProfile?.weather || null;
    this.engineCharacter = deriveEngineCharacter(this.carProfile || {});
    this.stageSoundscape = deriveStageSoundscape(this.stageProfile || {}, this.weatherProfile);
    this.lastTelemetry = null;
    this.lastShift = 0;
    this.lastShiftAt = -Infinity;
    this.lastGear = null;
    this.lastShiftPulse = 0;
    this.voice = null;
    this._activeOneShots = new Set();
    this._starting = null;
    this._pace = {
      stageId: stageId(this.stageProfile),
      generation: 0,
      sequence: 0,
      current: null,
      queue: [],
      lastAt: -Infinity,
      progress: 0
    };
  }

  configure({ car, carProfile, stage, stageProfile, weather, weatherProfile } = {}) {
    if (car || carProfile) this.setCarProfile(car || carProfile);
    if (stage || stageProfile) this.setStage(stage || stageProfile);
    if (weather || weatherProfile) this.setWeather(weather || weatherProfile);
    return this;
  }

  setCarProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    this.carProfile = selectedCarProfile(profile);
    this.engineCharacter = deriveEngineCharacter(this.carProfile);
    return true;
  }

  setCar(profile) { return this.setCarProfile(profile); }
  selectCar(profile) { return this.setCarProfile(profile); }

  setStage(stage, weather = null) {
    if (!stage || typeof stage !== 'object') return false;
    const nextId = stageId(stage);
    if (nextId !== this._pace.stageId) {
      this._cancelVoice();
      this._pace.generation += 1;
      this._pace.current = null;
      this._pace.queue.length = 0;
      this._pace.lastAt = -Infinity;
      this._pace.progress = 0;
    }
    this.stageProfile = stage;
    this._pace.stageId = nextId;
    const nextWeather = weather || stage.weather || this.weatherProfile;
    if (nextWeather && typeof nextWeather === 'object') this.weatherProfile = nextWeather;
    this.stageSoundscape = deriveStageSoundscape(stage, this.weatherProfile);
    return true;
  }

  setWeather(weather) {
    if (!weather || typeof weather !== 'object') return false;
    this.weatherProfile = weather;
    this.stageSoundscape = deriveStageSoundscape(this.stageProfile || {}, this.weatherProfile);
    return true;
  }

  selectStage(stage) { return this.setStage(stage); }

  async start(carOrOptions, stageMaybe) {
    const options = carOrOptions && typeof carOrOptions === 'object' &&
      (own(carOrOptions, 'car') || own(carOrOptions, 'carProfile') || own(carOrOptions, 'stage') || own(carOrOptions, 'stageProfile') || own(carOrOptions, 'weather') || own(carOrOptions, 'weatherProfile'))
      ? carOrOptions
      : { car: carOrOptions, stage: stageMaybe };
    this.configure(options);
    if (this.started) {
      try { await this.ctx?.resume?.(); } catch (_) { /* resume may be rejected until a user gesture */ }
      this._resumePaceQueue();
      return true;
    }
    if (this._starting) return this._starting;
    this._starting = (async () => {
      const Ctx = contextConstructor();
      if (typeof Ctx !== 'function') return false;
      let context;
      try { context = new Ctx(); } catch (_) { return false; }
      try {
        this.ctx = context;
        await context.resume?.();
        this._buildGraph();
        this.started = true;
        this._resumePaceQueue();
        return true;
      } catch (_) {
        this.started = false;
        this.ctx = null;
        try { await context.close?.(); } catch (_) { /* best effort */ }
        return false;
      }
    })();
    try { return await this._starting; } finally { this._starting = null; }
  }

  _buildGraph() {
    const ctx = this.ctx;
    const master = createGain(ctx, this.effectsVolume);
    connect(master, ctx.destination);
    this.master = master;

    this.engineGain = createGain(ctx, 0.0001);
    this.engineCut = createGain(ctx, 1);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    setParam(this.filter.frequency, 1200, 0, 0.01);
    connect(this.engineGain, this.filter);
    connect(this.filter, this.engineCut);
    connect(this.engineCut, master);

    const lowGain = createGain(ctx, 0.78);
    const highGain = createGain(ctx, 0.34);
    const textureGain = createGain(ctx, 0.18);
    this.engine1 = ctx.createOscillator();
    this.engine1.type = 'sawtooth';
    this.engine2 = ctx.createOscillator();
    this.engine2.type = 'triangle';
    this.engine3 = ctx.createOscillator();
    this.engine3.type = 'square';
    connect(this.engine1, lowGain); connect(lowGain, this.engineGain);
    connect(this.engine2, highGain); connect(highGain, this.engineGain);
    connect(this.engine3, textureGain); connect(textureGain, this.engineGain);
    this.engineLowGain = lowGain;
    this.engineHighGain = highGain;
    this.engineTextureGain = textureGain;
    this.engineLow = this.engine1;
    this.engineHigh = this.engine2;
    startNode(this.engine1); startNode(this.engine2); startNode(this.engine3);

    const noise = createNoiseBuffer(ctx);
    const road = createLoop(ctx, noise, 'bandpass', 700, 0.0001, master);
    this.gravel = road.source;
    this.gravelFilter = road.filter;
    this.gravelGain = road.gain;
    const wind = createLoop(ctx, noise, 'highpass', 260, 0.0001, master);
    this.wind = wind.source;
    this.windFilter = wind.filter;
    this.windGain = wind.gain;
    const intake = createLoop(ctx, noise, 'bandpass', 1350, 0.0001, master);
    this.intake = intake.source;
    this.intakeFilter = intake.filter;
    this.intakeGain = intake.gain;
    const exhaust = createLoop(ctx, noise, 'lowpass', 820, 0.0001, master);
    this.exhaust = exhaust.source;
    this.exhaustFilter = exhaust.filter;
    this.exhaustGain = exhaust.gain;

    this.transmission1 = ctx.createOscillator();
    this.transmission1.type = 'sine';
    this.transmission2 = ctx.createOscillator();
    this.transmission2.type = 'triangle';
    this.transmissionGain = createGain(ctx, 0.0001);
    this.transmissionFilter = ctx.createBiquadFilter();
    this.transmissionFilter.type = 'bandpass';
    connect(this.transmission1, this.transmissionGain);
    connect(this.transmission2, this.transmissionGain);
    connect(this.transmissionGain, this.transmissionFilter);
    connect(this.transmissionFilter, master);
    startNode(this.transmission1); startNode(this.transmission2);
    this.whine = this.transmission1;
    this.whineGain = this.transmissionGain;

    this._graphReady = true;
  }

  update(car = {}, input = {}, stageMaybe) {
    if (stageMaybe) this.setStage(stageMaybe);
    if (car?.profile && car.profile !== this.carProfile) this.setCarProfile(car.profile);
    if (car?.stage && car.stage !== this.stageProfile) this.setStage(car.stage);
    if (car?.weather && car.weather !== this.weatherProfile) this.setWeather(car.weather);
    this.setPaceProgress(car?.progress);
    const profile = this.carProfile || car?.profile || {};
    this.lastTelemetry = readAudioTelemetry(car, input, profile);
    if (!this.started || !this.ctx || !this._graphReady) return this.lastTelemetry;
    const now = finite(this.ctx.currentTime, 0);
    const telemetry = this.lastTelemetry;
    const character = this.engineCharacter;
    const frequency = Math.max(18, telemetry.running ? telemetry.rpm / 60 : character.idleRpm / 60);
    const rpmN = telemetry.rpmNormalised;
    const load = telemetry.load;
    setParam(this.engine1.frequency, frequency * character.order, now, 0.025);
    setParam(this.engine2.frequency, frequency * character.order * character.harmonic, now, 0.03);
    setParam(this.engine3.frequency, frequency * character.order * (character.harmonic + 1.17), now, 0.035);
    setParam(this.filter.frequency, character.bodyHz * (0.82 + rpmN * 0.72 + load * 0.24), now, 0.05);
    setParam(this.engineGain.gain, telemetry.running ? 0.18 + rpmN * 0.28 + load * 0.22 : 0.0001, now, 0.035);
    setParam(this.engineLowGain.gain, character.lowLevel * (0.52 + rpmN * 0.48) * (0.68 + load * 0.32), now, 0.03);
    setParam(this.engineHighGain.gain, character.highLevel * (0.35 + rpmN * 0.65) * (0.45 + load * 0.55), now, 0.035);
    setParam(this.engineTextureGain.gain, character.textureLevel * (0.2 + rpmN * 0.8) * (0.3 + load * 0.7), now, 0.04);
    setParam(this.intakeFilter.frequency, 850 + rpmN * 4300 + load * 1800, now, 0.05);
    setParam(this.intakeGain.gain, character.intakeLevel * (0.12 + load * 0.88) * (telemetry.running ? 1 : 0), now, 0.04);
    setParam(this.exhaustFilter.frequency, 420 + rpmN * 1750 + load * 1800, now, 0.06);
    setParam(this.exhaustGain.gain, character.exhaustLevel * (0.2 + rpmN * 0.45 + load * 0.55) * (telemetry.running ? 1 : 0), now, 0.045);
    if (telemetry.overrun) setParam(this.exhaustGain.gain, character.exhaustLevel * (0.45 + rpmN * 0.55), now, 0.025);

    const gearChanged = this.lastGear !== null && telemetry.gear !== this.lastGear;
    const risingShift = telemetry.shift > 0.72 && this.lastShiftPulse <= 0.72;
    if ((gearChanged || risingShift) && now - this.lastShiftAt > 0.045) {
      this.lastShiftAt = now;
      this.lastShift = typeof performance !== 'undefined' ? performance.now() : now * 1000;
      this._triggerShift(telemetry, now);
    }
    this.lastGear = telemetry.gear;
    this.lastShiftPulse = telemetry.shift;
    setParam(this.engineCut.gain, telemetry.shift > 0.05 ? character.shiftCut + (1 - character.shiftCut) * (1 - telemetry.shift) : 1, now, telemetry.shift > 0.05 ? 0.015 : 0.06);

    const meshHz = clamp(frequency * Math.max(1, Math.abs(telemetry.gearRatio)) * character.transmissionRatio, 35, 5800);
    setParam(this.transmission1.frequency, meshHz, now, 0.035);
    setParam(this.transmission2.frequency, meshHz * 1.97, now, 0.04);
    setParam(this.transmissionFilter.frequency, clamp(meshHz * 1.45, 80, 9000), now, 0.05);
    setParam(this.transmissionGain.gain, telemetry.running && telemetry.gear > 0
      ? character.transmissionLevel * (0.28 + rpmN * 0.72) * (0.35 + load * 0.65) : 0.0001, now, 0.05);
    const speedRatio = clamp(telemetry.speed / 48, 0, 1);
    setParam(this.whine.frequency, 50 + telemetry.speed * 8.5 + Math.max(0, telemetry.gear) * 24, now, 0.04);
    setParam(this.whineGain.gain, character.diffLevel * speedRatio * (0.3 + rpmN * 0.7), now, 0.05);

    const surface = SURFACE_AUDIO[telemetry.surface] || DEFAULT_SURFACE_AUDIO;
    const stage = this.stageSoundscape;
    const weatherRoadBoost = 1 + stage.wetness * .16 + stage.precipitationLevel * .12;
    setParam(this.gravelFilter.frequency, stage.roadBandHz + telemetry.speed * 12 + surface.band * 0.15, now, 0.08);
    setParam(this.gravelGain.gain, (surface.level + stage.gravelLevel * 0.35) * speedRatio * weatherRoadBoost, now, 0.04);
    setParam(this.windFilter.frequency, stage.windFilterHz + telemetry.speed * 15 + stage.precipitationLevel * 100, now, 0.09);
    setParam(this.windGain.gain, stage.windLevel * speedRatio * speedRatio * (1 + stage.precipitationLevel * .35), now, 0.09);
    return telemetry;
  }

  _triggerShift(telemetry) {
    const direction = this.lastGear !== null && telemetry.gear < this.lastGear ? 1.15 : 0.9;
    this.blip(380 + Math.max(0, telemetry.gear) * 52, 0.075, this.engineCharacter.shiftBlip * direction);
  }

  _trackOneShot(node) {
    if (!node) return;
    this._activeOneShots.add(node);
    const release = () => this._activeOneShots.delete(node);
    if (typeof node.addEventListener === 'function') node.addEventListener('ended', release, { once: true });
    else node.onended = release;
  }

  voiceCount() {
    if (!this.started) return 0;
    const continuous = [this.engine1, this.engine2, this.engine3, this.transmission1, this.transmission2, this.gravel, this.wind, this.intake, this.exhaust].filter(Boolean).length;
    return continuous + this._activeOneShots.size + (this._pace.current?.audio ? 1 : 0);
  }

  blip(frequency = 500, duration = 0.12, volume = 0.08) {
    if (!this.started || !this.ctx) return;
    try {
      const oscillator = this.ctx.createOscillator();
      this._trackOneShot(oscillator);
      const gain = createGain(this.ctx, 0.0001);
      const now = finite(this.ctx.currentTime, 0);
      oscillator.type = 'square';
      setValue(oscillator.frequency, clamp(frequency, 30, 9000), now);
      setValue(gain.gain, clamp(volume, 0, 1), now);
      if (typeof gain.gain.exponentialRampToValueAtTime === 'function') gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.02, duration));
      else setParam(gain.gain, 0.0001, now + Math.max(0.02, duration), 0.02);
      connect(oscillator, gain); connect(gain, this.master);
      startNode(oscillator, now); stopNode(oscillator, now + Math.max(0.02, duration) + 0.02);
    } catch (_) { /* an unavailable one-shot must not disable the engine graph */ }
  }

  countdown(value) { this.blip(value === 0 ? 920 : 610, value === 0 ? 0.18 : 0.09, value === 0 ? 0.12 : 0.065); }

  collision(intensity = 0) {
    if (!this.started || !this.ctx) return;
    const amount = unit(intensity);
    if (amount < 0.01) return;
    try {
      const sampleRate = Math.max(8000, finite(this.ctx.sampleRate, 48000));
      const size = Math.max(32, Math.floor(sampleRate * 0.23));
      const buffer = this.ctx.createBuffer(1, size, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        const hash = Math.sin(i * 17.17 + 2.3) * 43758.5453;
        data[i] = ((hash - Math.floor(hash)) * 2 - 1) * Math.pow(1 - i / data.length, 2);
      }
      const source = this.ctx.createBufferSource();
      this._trackOneShot(source);
      source.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      setParam(filter.frequency, 220 + amount * 650, this.ctx.currentTime, 0.01);
      const gain = createGain(this.ctx, 0.12 + amount * 0.25);
      connect(source, filter); connect(filter, gain); connect(gain, this.master);
      startNode(source, this.ctx.currentTime);
      stopNode(source, this.ctx.currentTime + 0.24);
    } catch (_) { /* impact feedback is optional */ }
  }

  impact(intensity) { this.collision(intensity); }

  setVolumes(effects, voice) {
    if (effects !== undefined) this.effectsVolume = clamp(finite(effects, this.effectsVolume), 0, 1);
    if (voice !== undefined) this.voiceVolume = clamp(finite(voice, this.voiceVolume), 0, 1);
    if (this.master && this.ctx) setParam(this.master.gain, this.effectsVolume, this.ctx.currentTime, 0.03);
  }

  _makePaceItem(note, stage) {
    if (!note || typeof note !== 'object') return null;
    const selectedStage = stage || this.stageProfile;
    const selectedId = stageId(selectedStage) || this._pace.stageId;
    const noteStage = stageId(note.stage || note.stageProfile) || safePart(note.stageId) || null;
    if (this._pace.stageId && selectedId && selectedId !== this._pace.stageId) return null;
    if (noteStage && selectedId && noteStage !== selectedId) return null;
    const at = paceAt(note);
    if (at !== null && at < this._pace.progress - 18) return null;
    if (at !== null && at <= this._pace.lastAt + 0.001) return null;
    const key = `${selectedId || 'legacy'}:${noteToken(note)}:${at ?? 'na'}`;
    if (this._pace.current?.key === key || this._pace.queue.some(item => item.key === key)) return null;
    return {
      key,
      note,
      stage: selectedStage || null,
      stageId: selectedId || null,
      at,
      sources: paceNoteSources(selectedStage ? { ...selectedStage, audioRoot: selectedStage.audioRoot || this.audioRoot } : null, note),
      sourceIndex: 0,
      sequence: ++this._pace.sequence,
      generation: this._pace.generation
    };
  }

  queuePace(note, stageOrOptions, maybeOptions) {
    const parsed = parsePlayArgs(stageOrOptions, maybeOptions);
    const stage = parsed.stage || this.stageProfile;
    if (stage && stageId(stage) && stageId(stage) !== this._pace.stageId) this.setStage(stage);
    const item = this._makePaceItem(note, stage);
    if (!item) return false;
    this._pace.queue.push(item);
    this._pace.queue.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || a.sequence - b.sequence);
    while (this._pace.queue.length > 4) this._pace.queue.shift();
    if (parsed.options.interrupt || parsed.options.priority === 'now') return this._startInterrupted(item);
    this._pumpPaceQueue();
    return true;
  }

  playPace(note, stageOrOptions, maybeOptions) {
    return this.queuePace(note, stageOrOptions, maybeOptions);
  }

  interruptPace(note, stageOrOptions) {
    const parsed = parsePlayArgs(stageOrOptions, { interrupt: true });
    const stage = parsed.stage || this.stageProfile;
    if (stage && stageId(stage) && stageId(stage) !== this._pace.stageId) this.setStage(stage);
    const item = this._makePaceItem(note, stage);
    if (!item) return false;
    return this._startInterrupted(item);
  }

  _startInterrupted(item) {
    this._pace.queue = this._pace.queue.filter(candidate => candidate !== item);
    this._pace.queue.length = 0;
    this._cancelVoice();
    this._pace.current = item;
    this._startPaceItem(item);
    return true;
  }

  _pumpPaceQueue() {
    if (this._pace.current || !this._pace.queue.length) return;
    this._dropStalePace();
    const item = this._pace.queue.shift();
    if (!item || item.generation !== this._pace.generation) return this._pumpPaceQueue();
    this._pace.current = item;
    this._startPaceItem(item);
  }

  _resumePaceQueue() {
    if (!this.started) return;
    if (this._pace.current && !this._pace.current.audio) this._startPaceItem(this._pace.current);
    else this._pumpPaceQueue();
  }

  _startPaceItem(item) {
    if (!this.started) return;
    const AudioCtor = audioConstructor();
    if (typeof AudioCtor !== 'function' || !item.sources.length) return this._finishPace(item, 'unavailable');
    let audio;
    try { audio = new AudioCtor(); } catch (_) { return this._finishPace(item, 'unavailable'); }
    item.audio = audio;
    this.voice = audio;
    const finish = reason => {
      if (this._pace.current !== item || item.generation !== this._pace.generation) return;
      if (reason === 'error' && item.sourceIndex + 1 < item.sources.length) {
        item.sourceIndex += 1;
        try {
          audio.src = item.sources[item.sourceIndex];
          audio.load?.();
          const retry = audio.play?.();
          retry?.catch?.(() => finish('blocked'));
          return;
        } catch (_) { /* fall through and release the queue */ }
      }
      this._finishPace(item, reason);
    };
    item.finish = finish;
    try {
      audio.preload = 'auto';
      audio.volume = this.voiceVolume;
      audio.onended = () => finish('ended');
      audio.onerror = () => finish('error');
      audio.src = item.sources[0];
      const result = audio.play?.();
      result?.catch?.(() => finish('blocked'));
    } catch (_) {
      finish('error');
    }
  }

  _finishPace(item, reason) {
    if (this._pace.current !== item) return;
    if (item.audio) {
      try { item.audio.onended = null; item.audio.onerror = null; item.audio.pause?.(); } catch (_) { /* stale element */ }
    }
    this.voice = null;
    this._pace.current = null;
    if (item.at !== null) this._pace.lastAt = Math.max(this._pace.lastAt, item.at);
    item.finishReason = reason;
    this._pumpPaceQueue();
  }

  _cancelVoice() {
    const item = this._pace.current;
    this._pace.current = null;
    this.voice = null;
    if (!item?.audio) return;
    try { item.audio.onended = null; item.audio.onerror = null; item.audio.pause?.(); } catch (_) { /* stale element */ }
  }

  setPaceProgress(distance) {
    if (Number.isFinite(distance)) this._pace.progress = Math.max(0, distance);
    this._dropStalePace();
    return this._pace.progress;
  }

  _dropStalePace() {
    const cutoff = this._pace.progress - 18;
    this._pace.queue = this._pace.queue.filter(item => item.generation === this._pace.generation && (item.at === null || item.at >= cutoff));
    if (this._pace.current && this._pace.current.at !== null && this._pace.current.at < cutoff) {
      const stale = this._pace.current;
      this._cancelVoice();
      stale.finishReason = 'stale';
      this._pumpPaceQueue();
    }
  }

  paceState() {
    return {
      stageId: this._pace.stageId,
      generation: this._pace.generation,
      progress: this._pace.progress,
      lastAt: this._pace.lastAt,
      current: this._pace.current ? {
        key: this._pace.current.key,
        stageId: this._pace.current.stageId,
        at: this._pace.current.at,
        note: this._pace.current.note
      } : null,
      queue: this._pace.queue.map(item => ({ key: item.key, stageId: item.stageId, at: item.at, note: item.note }))
    };
  }

  stopVoice() {
    this._cancelVoice();
    this._pace.queue.length = 0;
  }

  mute(muted) {
    if (this.master && this.ctx) setParam(this.master.gain, muted ? 0 : this.effectsVolume, this.ctx.currentTime, 0.03);
    if (muted) this.stopVoice();
  }

  async dispose() {
    this.stopVoice();
    for (const node of [this.engine1, this.engine2, this.engine3, this.transmission1, this.transmission2, this.gravel, this.wind, this.intake, this.exhaust]) stopNode(node);
    try { await this.ctx?.close?.(); } catch (_) { /* best effort */ }
    this.ctx = null;
    this.started = false;
    this._graphReady = false;
    this._activeOneShots.clear();
  }
}

// Existing game code imports AudioManager. Keep that public seam while exposing
// the neutral AudioSystem name to new mode/car/stage wiring.
export const AudioManager = AudioSystem;
