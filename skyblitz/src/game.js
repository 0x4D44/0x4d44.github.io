// Game: owns the renderer, the fixed-timestep loop, the race lifecycle and the module wiring. Owner: lead.
// Other modules never import game.js; they receive the `game` object in their constructor / update calls.
import * as THREE from 'three';
import { SIM_DT, MAX_SIM_STEPS, QUALITY, DEFAULT_SETTINGS, DEFAULT_LAPS, SETTINGS_KEY } from './config.js';
import { EventBus } from './events.js';
import { RNG } from './util.js';
import { Assets } from './assets.js';
import { installDebug } from './debug.js';
import { createInput } from './flight/input.js';
import { createCameraRig } from './flight/camera.js';
import { COURSES, loadCourse } from './world/courses/index.js';
import { Race } from './race/race.js';
import { Fx } from './craft/fx.js';
import { createPost } from './craft/post.js';
import { AudioEngine } from './audio/audio.js';
import { MusicPlayer } from './audio/music.js';
import { UI } from './ui/ui.js';

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}

export class Game {
  constructor(canvas, { params = new URLSearchParams() } = {}) {
    this.THREE = THREE;
    this.canvas = canvas;
    this.params = params;
    this.events = new EventBus();
    this.settings = loadSettings();
    if (params.has('quality')) this.settings.quality = params.get('quality');
    this.rng = new RNG(Number(params.get('seed')) || 20261029);
    this.manual = params.has('manual');      // true: no rAF-driven sim; the harness calls __sky.step(n)
    this.state = 'boot';                     // boot | title | menu | loading | race | demo | finish | results
    this.paused = false;
    this.simTime = 0; this.frame = 0; this.acc = 0; this.lastT = 0;
    this.course = null; this.race = null; this.player = null;
    this.autoScale = 1; this.qualityId = 'high'; this.q = QUALITY.high;
    this.perf = { fps: 60, frameMs: 16.7, simMs: 0, renderMs: 0 };
    this._govT = 0; this._loadToken = 0; this.ready = false;
    this.COURSES = COURSES;
  }

  async init() {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    } catch (e) { this.fail('WebGL2 is not available in this browser.'); throw e; }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.debug.checkShaderErrors = this.manual || this.params.has('debug');   // players: no synchronous link check (smoother load); tests and ?debug keep it
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;      // r186 removed PCFSoftShadowMap (PCFShadowMap is the soft filter now)
    renderer.setClearColor(0x0b1a33, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.6, 24000);
    this.scene.add(this.camera);
    this.assets = new Assets(renderer);

    // Subsystems. Each exposes update(dt, game); optional init().
    this.fx = new Fx(this);
    this.input = createInput(this);
    this.cameraRig = createCameraRig(this);
    this.audio = new AudioEngine(this);
    this.music = new MusicPlayer(this);
    this.ui = new UI(this);
    this.post = createPost(this);

    const coarse = matchMedia('(pointer: coarse)').matches;
    this.setQuality(this.settings.quality === 'auto' ? (coarse ? 'med' : 'high') : this.settings.quality, true);
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && (this.state === 'race')) this.setPaused(true); });
    const unlock = () => { this.audio.resume?.(); this.music.resume?.(); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    this.events.on('race:end', () => { if (this.state === 'race' || this.state === 'finish') this.setState('results'); });
    this.events.on('race:finish', ({ racer }) => { if (racer === this.player && this.state === 'race') this.setState('finish'); });
    this.events.on('input:pause', () => { if (this.state === 'race') this.setPaused(!this.paused); });

    this.dbg = installDebug(this);
    for (const s of [this.fx, this.ui, this.audio, this.music, this.post, this.cameraRig]) s.init?.();
    this.resize();
    this.ready = true; this.dbg.ready = true;
    requestAnimationFrame(this.loop);
  }

  fail(msg) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#0b1a33;color:#fff;font:600 18px system-ui;padding:24px;text-align:center';
    d.textContent = msg; document.body.appendChild(d);
  }

  boot() {
    const p = this.params;
    if (p.has('autostart')) return this.startRace(this.raceConfigFromParams());
    if (p.has('demo')) return this.startRace({ ...this.raceConfigFromParams(), demo: true });
    return this.showTitle();
  }

  raceConfigFromParams() {
    const p = this.params;
    return {
      courseId: p.get('course') || this.settings.lastCourse, craftId: p.get('craft') || this.settings.lastCraft, livery: Number(p.get('livery') || 0),
      difficulty: p.get('diff') || this.settings.difficulty, laps: Number(p.get('laps')) || DEFAULT_LAPS, bots: p.has('bots') ? Number(p.get('bots')) : 7,
      mode: p.get('mode') || 'quick', seed: Number(p.get('seed')) || undefined, autopilot: p.has('autopilot'),
    };
  }

  /** Title screen: a live all-AI demo race behind the UI. */
  async showTitle() {
    this.setState('title');
    const c = COURSES[Math.floor(Math.random() * COURSES.length)];
    await this.startRace({ courseId: c.id, craftId: 'falcon', difficulty: 'normal', laps: 99, bots: 7, mode: 'demo', demo: true }, { keepState: true });
    this.setState('title');
    this.ui.show?.('title');
  }

  setState(s) {
    if (s === this.state) return;
    const from = this.state; this.state = s;
    this.events.emit('game:state', { from, to: s });
  }

  setPaused(p) {
    if (p === this.paused) return;
    this.paused = p; this.events.emit(p ? 'game:pause' : 'game:resume', {});
  }

  /** cfg = { courseId, craftId, livery, difficulty, laps, mode:'quick'|'gp'|'trial'|'demo', bots, seed, demo, autopilot } */
  async startRace(cfg, { keepState = false } = {}) {
    const token = ++this._loadToken;
    if (!keepState) this.setState('loading');
    this.events.emit('game:loading', { cfg });
    this.disposeRace();
    this.setPaused(false);
    const seed = cfg.seed ?? Math.floor(Math.random() * 1e9);
    this.rng = new RNG(seed);
    let course;
    try { course = await loadCourse(cfg.courseId, this); } catch (e) { console.error('[game] course load failed', e); this.events.emit('game:error', { error: e }); return null; }
    if (token !== this._loadToken) { course.dispose?.(); return null; }
    this.course = course; course.attach(this);
    const race = new Race(this, { ...cfg, course, seed, laps: cfg.laps ?? DEFAULT_LAPS });
    this.race = race; this.player = race.player;
    this.cameraRig.reset?.(this.player || race.racers[0], cfg.demo ? 'cinematic' : 'chase');
    if (cfg.autopilot && race.setAutopilot) race.setAutopilot(true);
    this.simTime = 0; this.acc = 0;
    if (!keepState) this.setState(cfg.demo ? 'demo' : 'race');
    race.start();
    this.events.emit('game:raceStart', { race });
    return race;
  }

  disposeRace() {
    if (this.race) { this.race.dispose?.(); this.race = null; this.player = null; }
    if (this.course) { this.course.detach?.(this); this.course.dispose?.(); this.course = null; }
  }

  quit() { this.disposeRace(); this.showTitle(); }

  setQuality(id, silent = false) {
    this.settings.quality = silent ? this.settings.quality : id;
    this.qualityId = QUALITY[id] ? id : 'high'; this.q = QUALITY[this.qualityId];
    this.renderer.shadowMap.enabled = this.q.shadows > 0;
    this.autoScale = 1;
    this.post?.setQuality?.(this.q);
    this.resize();
    if (!silent) this.events.emit('settings:change', { key: 'quality', value: id });
  }

  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* private mode */ } }

  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.canvas.clientWidth || innerWidth), h = Math.max(1, this.canvas.clientHeight || innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatioCap) * this.q.renderScale * this.autoScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.post?.resize?.(w, h, pr);
    this.width = w; this.height = h; this.pixelRatio = pr;
    this.events.emit('game:resize', { w, h, pr });
  }

  loop = (t) => {
    requestAnimationFrame(this.loop);
    if (this.manual || !this.ready) return;
    const now = t / 1000;
    let dt = now - this.lastT; this.lastT = now;
    if (!(dt > 0)) return;
    if (dt > 0.25) dt = 0.25;
    const t0 = performance.now();
    this.acc += dt;
    let steps = 0;
    while (this.acc >= SIM_DT && steps < MAX_SIM_STEPS) { this.fixedUpdate(); this.acc -= SIM_DT; steps++; }
    if (steps === MAX_SIM_STEPS) this.acc = 0;
    const t1 = performance.now();
    this.renderFrame(this.acc / SIM_DT, dt);
    const t2 = performance.now();
    this.perf.simMs = t1 - t0; this.perf.renderMs = t2 - t1;
    this.perf.frameMs += (dt * 1000 - this.perf.frameMs) * 0.05; this.perf.fps = 1000 / this.perf.frameMs;
    this.governor(dt);
  };

  fixedUpdate() {
    const race = this.race;
    if (!race || this.paused) return;
    const s = this.state;
    if (s !== 'race' && s !== 'demo' && s !== 'title' && s !== 'finish' && s !== 'results') return;
    const controls = race.player && !race.autopilot ? this.input.sample() : null;
    race.fixedUpdate(SIM_DT, controls);
    this.simTime += SIM_DT;
  }

  renderFrame(alpha, dt) {
    this.frame++;
    if (this.paused) dt = 0;
    this.race?.render(alpha, dt);
    const o = this.camOverride;
    if (o) {   // debug free camera (see debug.js); the rig is bypassed
      this.camera.position.copy(o.pos); this.camera.up.set(0, 1, 0); this.camera.lookAt(o.look);
      if (o.fov && this.camera.fov !== o.fov) { this.camera.fov = o.fov; this.camera.updateProjectionMatrix(); }
    } else this.cameraRig.update(dt, this, alpha);
    this.course?.update(dt, this);
    this.fx.update(dt, this);
    this.audio.update(dt, this);
    this.music.update(dt, this);
    this.ui.update(dt, this);
    this.post.update(dt, this);
    this.post.render(dt);
  }

  /** Auto-quality: adapt the resolution scale (and, as a last resort, the preset) to hold ~60 fps. Only when quality is 'auto'. */
  governor(dt) {
    if (this.settings.quality !== 'auto' || this.manual || this.paused || (this.state !== 'race' && this.state !== 'demo')) return;
    this._govT += dt;
    if (this._govT < 1.5) return;
    this._govT = 0;
    const ms = this.perf.frameMs;
    if (ms > 21 && this.autoScale > 0.55) { this.autoScale = Math.max(0.55, this.autoScale - 0.1); this.resize(); }
    else if (ms > 21 && this.qualityId !== 'low') { this.setQuality(this.qualityId === 'ultra' ? 'high' : this.qualityId === 'high' ? 'med' : 'low', true); }
    else if (ms < 13 && this.autoScale < 1) { this.autoScale = Math.min(1, this.autoScale + 0.05); this.resize(); }
  }
}
