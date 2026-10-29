// Game: owns the renderer, the fixed-timestep loop, the race lifecycle and the module wiring. Owner: lead.
// Other modules never import game.js; they receive the `game` object in their constructor / update calls.
import * as THREE from 'three';
import { SIM_DT, MAX_SIM_STEPS, QUALITY, DEFAULT_SETTINGS, DEFAULT_LAPS, SETTINGS_KEY, MOTION_KEYS, defaultSettings, prefersReducedMotion, resolveSettings, settingsToStore, resolveQualityId } from './config.js';
import { EventBus } from './events.js';
import { RNG } from './util.js';
import { Assets } from './assets.js';
import { installDebug } from './debug.js';
import { createGovernor, CostMeter } from './governor.js';
import { GpuTimer } from './gpu-timer.js';
import { createInput } from './flight/input.js';
import { createCameraRig } from './flight/camera.js';
import { COURSES, loadCourse } from './world/courses/index.js';
import { Race } from './race/race.js';
import { Fx } from './craft/fx.js';
import { createPost } from './craft/post.js';
import { AudioEngine } from './audio/audio.js';
import { MusicPlayer } from './audio/music.js';
import { UI } from './ui/ui.js';

function loadSettings(reducedMotion) {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch { /* corrupt blob or storage blocked: defaults */ }
  return resolveSettings(stored, reducedMotion);
}

export class Game {
  constructor(canvas, { params = new URLSearchParams() } = {}) {
    this.THREE = THREE;
    this.canvas = canvas;
    this.params = params;
    this.events = new EventBus();
    this.reducedMotion = prefersReducedMotion();          // V-8: the OS preference decides the motion defaults until the player sets them
    this.settings = loadSettings(this.reducedMotion);
    if (params.has('quality')) this.settings.quality = params.get('quality');
    this.rng = new RNG(Number(params.get('seed')) || 20261029);
    this.manual = params.has('manual');      // true: no rAF-driven sim; the harness calls __sky.step(n)
    this.state = 'boot';                     // boot | title | menu | loading | race | demo | finish | results
    this.paused = false;
    this.simTime = 0; this.frame = 0; this.acc = 0; this.lastT = 0;
    this.course = null; this.race = null; this.player = null;
    this.autoScale = 1; this.qualityId = 'high'; this.q = QUALITY.high;
    this.perf = { fps: 60, frameMs: 16.7, simMs: 0, renderMs: 0, costMs: 0, gpuMs: 0 };
    this.gov = null; this.costMeter = new CostMeter(); this.gpuTimer = null;   // auto-quality (E-05): see governor.js
    this.contextLost = false; this._ctxPausedByUs = false;                      // E-12
    this._loadToken = 0; this.ready = false;
    this.COURSES = COURSES;
  }

  async init() {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    } catch (e) { this.fail('WebGL2 is not available in this browser.'); e.skyShown = true; throw e; }
    this.renderer = renderer;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    // E-12: a lost context (driver reset, GPU process crash, sleep) leaves the race running blind. preventDefault asks the browser to restore it.
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.onContextLost(); });
    this.canvas.addEventListener('webglcontextrestored', () => this.onContextRestored());
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

    this.gov = createGovernor();
    this.gpuTimer = new GpuTimer(renderer.getContext());
    this.setQuality(this.settings.quality, true);       // 'auto' resolves like a runtime pick: Med on coarse-pointer devices, High elsewhere
    addEventListener('resize', () => this.resize());
    try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => this.onReducedMotion(e.matches)); } catch { /* old browser: the load-time value stays */ }
    document.addEventListener('visibilitychange', () => { if (document.hidden && (this.state === 'race')) this.setPaused(true); });
    const unlock = () => { this.audio.resume?.(); this.music.resume?.(); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    this.events.on('race:end', () => { if (this.state === 'race' || this.state === 'finish') this.setState('results'); });
    this.events.on('race:finish', ({ racer }) => { if (racer === this.player && this.state === 'race') this.setState('finish'); });
    this.events.on('input:pause', () => { if (this.state === 'race') this.setPaused(!this.paused); });

    this.dbg = installDebug(this);                      // null on a bare URL: players get no test surface (E-29)
    for (const s of [this.fx, this.ui, this.audio, this.music, this.post, this.cameraRig]) s.init?.();
    this.resize();
    this.ready = true; if (this.dbg) this.dbg.ready = true;
    requestAnimationFrame(this.loop);
  }

  /** Fatal start-up message: one overlay for every failure (index.html's boot watchdog owns it; plain DOM when the page has no watchdog). */
  fail(msg) {
    const boot = typeof window !== 'undefined' && window.__skyBoot;
    if (boot?.fail) { boot.fail(msg, { reload: false }); return; }
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#0b1a33;color:#fff;font:600 18px system-ui;padding:24px;text-align:center';
    d.textContent = msg; document.body.appendChild(d);
  }

  /** A transient full-screen notice (context loss). `msg` null removes it. Plain DOM, above the UI, away from the top-left pill. */
  notice(msg, { reload = false } = {}) {
    let el = this._noticeEl;
    if (!msg) { el?.remove(); this._noticeEl = null; return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'sb-notice'; el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-content:center;gap:16px;justify-items:center;background:rgba(11,26,51,.78);color:#fff;font:600 18px/1.4 system-ui;padding:24px;text-align:center';
      document.body.appendChild(el); this._noticeEl = el;
    }
    el.replaceChildren(Object.assign(document.createElement('div'), { textContent: msg }));
    if (reload) {
      const b = Object.assign(document.createElement('button'), { textContent: 'Reload', type: 'button' });
      b.style.cssText = 'font:700 16px system-ui;padding:10px 22px;border:0;border-radius:8px;background:#ffb020;color:#0b1a33;cursor:pointer';
      b.onclick = () => location.reload(); el.appendChild(b);
    }
  }

  // ------------------------------------------------------------------ WebGL context loss (E-12)
  onContextLost() {
    if (this.contextLost) return;
    this.contextLost = true;
    if (this.state === 'race' && !this.paused) { this._ctxPausedByUs = true; this.setPaused(true); }   // the race stops (and audio / HUD / menu follow the normal pause path)
    this.notice('Graphics context lost. The browser is restoring it; the race is paused.');
    clearTimeout(this._ctxT);
    this._ctxT = setTimeout(() => { if (this.contextLost) this.notice('Still waiting for the graphics driver. If this does not clear, reload the page.', { reload: true }); }, 8000);
    this.gpuTimer = null;                               // its queries died with the context
    this.events.emit('game:contextlost', {});
  }

  onContextRestored() {
    if (!this.contextLost) return;
    this.contextLost = false; clearTimeout(this._ctxT);
    this.gpuTimer = new GpuTimer(this.renderer.getContext());
    this.resize();                                      // three rebuilt its own state; make the targets match the canvas again
    this.gov?.hold(4);                                  // every program recompiles on the first frames
    this.notice(null);
    if (this._ctxPausedByUs) { this._ctxPausedByUs = false; this.setPaused(false); }
    this.events.emit('game:contextrestored', {});
  }

  // ------------------------------------------------------------------ OS "reduce motion" changing while the game is open (V-8)
  onReducedMotion(reduced) {
    if (reduced === this.reducedMotion) return;
    this.reducedMotion = reduced;
    const next = defaultSettings(reduced), now = loadSettings(reduced);      // `now`: what a reload would give (a stored choice stays, an untouched key follows the OS)
    for (const k of MOTION_KEYS) {
      DEFAULT_SETTINGS[k] = next[k];                    // Settings > Reset to defaults follows the new preference
      if (this.settings[k] !== now[k]) { this.settings[k] = now[k]; this.events.emit('settings:change', { key: k, value: now[k] }); }
    }
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
    if (!p && this.contextLost) return;                 // no resuming into a blank frame: onContextRestored resumes
    this.paused = p; this.events.emit(p ? 'game:pause' : 'game:resume', {});
  }

  /** cfg = { courseId, craftId, livery, difficulty, laps, mode:'quick'|'gp'|'trial'|'demo', bots, seed, demo, autopilot } */
  async startRace(cfg, { keepState = false } = {}) {
    const token = ++this._loadToken;
    if (!keepState) this.setState('loading');
    this.events.emit('game:loading', { cfg });
    this.disposeRace();
    this.applyPendingPreset();                          // auto-quality asked for another preset: this is the one safe moment, behind the loading screen
    this.setPaused(false);
    const seed = cfg.seed ?? Math.floor(Math.random() * 1e9);
    this.rng = new RNG(seed);
    let course;
    try { course = await loadCourse(cfg.courseId, this); } catch (e) { console.error('[game] course load failed', e); this.events.emit('game:error', { error: e }); return null; }
    if (token !== this._loadToken) { course.dispose?.(); return null; }
    this.course = course; course.attach(this);
    const race = new Race(this, { ...cfg, course, seed, laps: cfg.laps ?? DEFAULT_LAPS });
    this.cameraRig.reset?.(race.player || race.racers[0], cfg.demo ? 'cinematic' : 'chase');
    if (cfg.autopilot && race.setAutopilot) race.setAutopilot(true);
    this.simTime = 0; this.acc = 0;
    await this.warmUp(race);                            // V-35: compile the scene's programs and run the post chain once, while the loading screen is up
    if (token !== this._loadToken) { race.dispose?.(); return null; }   // a newer start took the course while this race warmed up (it never got to be `this.race`)
    this.race = race; this.player = race.player;        // published only now, so a harness that waits for `game.race` finds a race that is ready to start
    if (!keepState) this.setState(cfg.demo ? 'demo' : 'race');
    race.start();
    this.gov?.hold(5);                                  // the first seconds of a race (texture uploads, GC) are not the steady cost
    this.events.emit('game:raceStart', { race });
    return race;
  }

  /** V-35: first-use shader compiles stall the first frames (192 ms for Redrock after a switch to Low). compileAsync links every program of the
   *  built scene in parallel without blocking; one hidden frame then compiles the post chain, whose passes are not in the scene. Never fatal. */
  async warmUp(race) {
    if (this.contextLost || !this.renderer?.compileAsync) return;
    try {
      let timer;
      await Promise.race([this.renderer.compileAsync(this.scene, this.camera), new Promise((r) => { timer = setTimeout(r, 5000); })]);
      clearTimeout(timer);
      if (this.contextLost) return;
      race.render(0, 0);                                // racers on their grid slots (this.race is not published yet)
      this.renderFrame(0, 0);
    } catch { /* a failed warm-up only costs the first-frame stall */ }
  }

  disposeRace() {
    if (this.race) { this.race.dispose?.(); this.race = null; this.player = null; }
    if (this.course) { this.course.detach?.(this); this.course.dispose?.(); this.course = null; }
  }

  quit() { this.disposeRace(); this.showTitle(); }

  /** id: 'auto' | 'low' | 'med' | 'high' | 'ultra' (E-28: 'auto' resolves the same way at boot and at runtime). silent: do not store the pick as the
   *  setting (boot resolves 'auto' this way; the governor applies presets this way). keepScale: a governor preset step keeps the auto resolution scale. */
  setQuality(id, silent = false, { keepScale = false } = {}) {
    if (!silent) this.settings.quality = id;
    this.qualityId = resolveQualityId(id, this.coarse); this.q = QUALITY[this.qualityId];
    this.renderer.shadowMap.enabled = this.q.shadows > 0;
    if (!keepScale) this.autoScale = 1;
    this.assets?.setAniso?.(this.q.aniso);
    this.post?.setQuality?.(this.q);
    this.resize();
    if (keepScale) this.gov?.applied(this.qualityId, this.q.renderScale); else this.gov?.reset(this.qualityId, this.q.renderScale);
    if (!silent) this.events.emit('settings:change', { key: 'quality', value: id });
  }

  /** E-05: the governor wants another preset; it is applied between races only. */
  applyPendingPreset() {
    const want = this.gov?.state.pending;
    if (want && this.settings.quality === 'auto' && want !== this.qualityId) this.setQuality(want, true, { keepScale: true });
    else if (want) this.gov.applied(this.qualityId, this.q.renderScale);
  }

  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsToStore(this.settings, this.reducedMotion))); } catch { /* private mode */ } }

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
    if (this.contextLost) { this.lastT = now; return; }   // E-12: no sim and no drawing while the GL context is gone
    let dt = now - this.lastT; this.lastT = now;
    if (!(dt > 0)) return;
    const interval = dt;
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
    this.governorFrame(interval, t1 - t0, steps, t2 - t1);
  };

  fixedUpdate() {
    const race = this.race;
    if (!race || this.paused || this.contextLost) return;
    const s = this.state;
    if (s !== 'race' && s !== 'demo' && s !== 'title' && s !== 'finish' && s !== 'results') return;
    const controls = race.player && !race.autopilot ? this.input.sample() : null;
    race.fixedUpdate(SIM_DT, controls);
    this.simTime += SIM_DT;
  }

  renderFrame(alpha, dt) {
    if (this.contextLost) return;
    this.frame++;
    if (this.paused) dt = 0;
    const gpu = this.settings.quality === 'auto' && !this.manual ? this.gpuTimer : null;   // GPU time feeds only the auto governor
    gpu?.begin();
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
    gpu?.end();
  }

  /** Auto-quality (E-05 / V-9), one rendered frame. `interval` is the frame interval (s); the decision is made on the frame's COST (governor.js):
   *  sim ms per step + render ms, or the GPU time when the browser reports it. Never on the interval: a vsynced 60 Hz display always shows 16.7 ms.
   *  Public so a harness can drive it with synthetic timings (`manual` mode has no loop). */
  governorFrame(interval, simMs, steps, renderMs) {
    const gov = this.gov; if (!gov) return null;
    const gpuMs = this.gpuTimer?.supported ? this.gpuTimer.ms : 0;
    const cost = this.costMeter.push(simMs, steps, renderMs, gpuMs);
    this.perf.costMs += (cost - this.perf.costMs) * 0.05; this.perf.gpuMs = gpuMs;
    const live = this.settings.quality === 'auto' && !this.paused && !this.contextLost && (this.state === 'race' || this.state === 'demo' || this.state === 'finish');
    if (!live) { gov.hold(1.5); return null; }
    const act = gov.frame(cost, interval);
    if (act) this.applyGovernorAction(act);
    return act;
  }

  /** A scale step is applied at once (cheap, invisible mid-race). A preset step only becomes `gov.state.pending`: startRace applies it between races. */
  applyGovernorAction(act) {
    if (act.type === 'scale') { this.autoScale = act.scale; this.resize(); }
    this.events.emit('game:autoquality', { ...act, scale: this.autoScale, preset: this.qualityId });
  }
}
