// Game: owns the renderer, the fixed-timestep loop, the race lifecycle and the module wiring. Owner: lead.
// Other modules never import game.js; they receive the `game` object in their constructor / update calls.
import * as THREE from 'three';
import { SIM_DT, MAX_SIM_STEPS, QUALITY, DEFAULT_SETTINGS, DEFAULT_LAPS, SETTINGS_KEY, MOTION_KEYS, defaultSettings, prefersReducedMotion, resolveSettings, settingsToStore, resolveQualityId } from './config.js';
import { EventBus } from './events.js';
import { RNG } from './util.js';
import { Assets } from './assets.js';
import { installDebug, debugFlag } from './debug.js';
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

/** R2-E-04: most programs the game keeps linked between races (a course needs 60-120; four courses and three presets stay well under this). */
const MAX_KEPT_PROGRAMS = 600;

/** Resolves once the next frame has been presented, or after `ms` (a hidden tab gets no animation frames and must not wait for one). */
const nextPaint = (ms = 250) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  requestAnimationFrame(() => setTimeout(() => { clearTimeout(t); resolve(); }, 0));
});

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
    this.contextLost = false;                                                   // E-12
    this._loadToken = 0; this.ready = false;
    this._warming = 0;                                                          // warm-ups in progress
    this._kept = new Set();                                                     // R2-E-04: programs held across races (keepPrograms)
    this._holdDraw = false; this._presetToken = 0;                            // R2-V-16: a preset change holds the last frame while its programs link
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
    renderer.debug.checkShaderErrors = this.manual || debugFlag(this.params);   // players: no synchronous link check (smoother load); tests and ?debug keep it
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
    document.addEventListener('visibilitychange', () => { this.gov?.wake(); if (document.hidden && (this.state === 'race')) this.setPaused(true); });   // wake: the first long frame after a hidden spell is a stall, not a slow machine (R2-E-01)
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
    const card = document.createElement('div');      // its own solid panel (text and button together): the dimmed pause menu stays visible behind, and the text must not read as a label on one of its buttons
    card.style.cssText = 'display:grid;gap:16px;justify-items:center;max-width:min(30rem,90vw);padding:18px 26px;border-radius:12px;background:#0b1a33;border:1px solid rgba(255,255,255,.22);box-shadow:0 10px 40px rgba(0,0,0,.5)';
    card.appendChild(Object.assign(document.createElement('div'), { textContent: msg }));
    if (reload) {
      const b = Object.assign(document.createElement('button'), { textContent: 'Reload', type: 'button' });
      b.style.cssText = 'font:700 16px system-ui;padding:10px 22px;border:0;border-radius:8px;background:#ffb020;color:#0b1a33;cursor:pointer';
      b.onclick = () => location.reload(); card.appendChild(b);
    }
    el.replaceChildren(card);
  }

  // ------------------------------------------------------------------ WebGL context loss (E-12)
  onContextLost() {
    if (this.contextLost) return;
    this.contextLost = true;
    if (this.state === 'race') this.setPaused(true);    // the race stops (and audio / HUD / menu follow the normal pause path)
    this.notice('Graphics context lost. The browser is restoring it; the race is paused.');
    clearTimeout(this._ctxT);
    this._ctxT = setTimeout(() => { if (this.contextLost) this.notice('Still waiting for the graphics driver. If this does not clear, reload the page.', { reload: true }); }, 8000);
    this.gpuTimer = null;                               // its queries died with the context
    this._kept.clear();                                 // the programs died with it too
    this.events.emit('game:contextlost', {});
  }

  onContextRestored() {
    if (!this.contextLost) return;
    this.contextLost = false; clearTimeout(this._ctxT);
    this.gpuTimer = new GpuTimer(this.renderer.getContext());
    this.resize();                                      // three rebuilt its own state; make the targets match the canvas again
    this.gov?.wake(); this.gov?.hold(4);                // every program recompiles on the first frames
    this.notice(null);
    // R2-V-18: the race stays paused. It used to resume at once, mid-air, with no countdown, before the player had even seen the notice go. The pause menu is
    // still up behind the notice; the focus goes to Resume and the player decides when to fly on.
    this.ui.nav?.ensureFocus?.();
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
    return this.showTitle({ early: !this.manual });      // manual mode (the harness) keeps the title behind a ready demo race
  }

  raceConfigFromParams() {
    const p = this.params;
    return {
      courseId: p.get('course') || this.settings.lastCourse, craftId: p.get('craft') || this.settings.lastCraft, livery: Number(p.get('livery') || 0),
      difficulty: p.get('diff') || this.settings.difficulty, laps: Number(p.get('laps')) || DEFAULT_LAPS, bots: p.has('bots') ? Number(p.get('bots')) : 7,
      mode: p.get('mode') || 'quick', seed: Number(p.get('seed')) || undefined, autopilot: p.has('autopilot'),
    };
  }

  /** Title screen: a live all-AI demo race behind the UI. `early` (the first load): building that race takes seconds on a cold load and the page sat
   *  blank all that time (R2-V-01), so the title goes up first, over a held-back canvas, and the scene fades in behind it once it exists. Coming back
   *  from a race the loading screen covers the build instead, and the title follows it. */
  async showTitle({ early = false } = {}) {
    this.setState('title');
    if (early) {
      this.canvas.style.opacity = '0';                  // the half-built scene (course attached, racers not yet placed) must not show behind the title
      this.ui.show?.('title');
      await nextPaint();                                // the title is on screen before the build blocks the main thread
    }
    const c = COURSES[Math.floor(Math.random() * COURSES.length)];
    let race = null;
    try { race = await this.startRace({ courseId: c.id, craftId: 'falcon', difficulty: 'normal', laps: 99, bots: 7, mode: 'demo', demo: true }, { keepState: true }); }
    finally { if (early && !race) this.canvas.style.opacity = ''; }       // failed or superseded: never leave the canvas hidden
    if (!race) return;                                  // a newer start (the player was quick) or a failed course owns the screen now: leave it alone
    this.setState('title');
    if (early) this.fadeCanvasIn(); else this.ui.show?.('title');
  }

  /** The first demo race exists: bring the canvas in over the title instead of cutting from flat navy to a scene. */
  fadeCanvasIn(ms = 700) {
    const c = this.canvas; c.style.opacity = '';
    if (this.manual || this.reducedMotion || !c.animate) return;
    try { c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' }); } catch { /* the scene just appears */ }
  }

  setState(s) {
    if (s === this.state) return;
    const from = this.state; this.state = s;
    this.events.emit('game:state', { from, to: s });
  }

  setPaused(p) {
    if (p === this.paused) return;
    if (!p && this.contextLost) return;                 // no resuming into a blank frame: the player resumes once the context is back (R2-V-18)
    this.paused = p; this.events.emit(p ? 'game:pause' : 'game:resume', {});
  }

  /** cfg = { courseId, craftId, livery, difficulty, laps, mode:'quick'|'gp'|'trial'|'demo', bots, seed, demo, autopilot } */
  async startRace(cfg, { keepState = false } = {}) {
    const token = ++this._loadToken;
    this._presetToken++; this._holdDraw = false;        // a preset warm-up still running belongs to the scene that is about to go
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
    this.events.emit('game:loadProgress', { progress: 1, label: 'Compiling shaders' });     // the course build ended on "Ready"; the bar must not sit there for the seconds this takes
    this._warming++;
    try {
      await this.compileScene();
      if (this.contextLost) return;
      race.render(0, 0);                                // racers on their grid slots (this.race is not published yet)
      this.hiddenFrame();
    } catch { /* a failed warm-up only costs the first-frame stall */ }
    finally { this._warming--; }
  }

  /** One hidden frame with frustum culling off, so that everything that will be drawn at some point has been drawn once: geometry and textures are uploaded, and the
   *  shadow pass has met every caster (its depth programs are built on first use and only for casters inside the shadow frustum: Neon's alpha-tested ones cost a
   *  127 ms frame seven seconds into the race, R2-E-05; the first countdown frame cost 195-247 ms uploading 112-120 geometries that the grid camera did not see, R2-E-04).
   *  Culling flags are put back before anything else runs. */
  hiddenFrame() {
    const forced = [], probe = this.q.shadows > 0 ? this.shadowProbe() : null;
    this.scene.traverse((o) => { if (o.frustumCulled && (o.isMesh || o.isPoints || o.isLine || o.isSprite)) { o.frustumCulled = false; forced.push(o); } });
    if (probe) this.scene.add(probe);
    this.post?.forceSpeed?.(true);                // the speed pass is off until the craft is fast: its program used to link 3 s into the race
    try { this.renderFrame(0, 0); } finally { this.post?.forceSpeed?.(false); if (probe) this.scene.remove(probe); for (const o of forced) o.frustumCulled = true; }
  }

  /** Three casters for the shadow pass, drawn after the real ones: alpha-tested without a map, a map without alpha test, both. three uses ONE shared depth material and
   *  mutates it per caster (`map`, `alphaTest`), re-linking its program only when the alpha-test state crosses zero, so which depth variants exist after the hidden
   *  frame depends on the order the real casters happen to be drawn in. Neon's `depth ... uv` variant (map, no alpha test) was the one program created after go (a
   *  110-150 ms frame about 11 s in). With the three probes every variant exists before the race. Built once, reused. */
  shadowProbe() {
    if (!this._probe) {
      const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); tex.needsUpdate = true;
      const geo = new THREE.PlaneGeometry(1, 1), g = new THREE.Group(); g.name = 'shadowProbe';
      for (const o of [{ alphaTest: 0.5 }, { map: tex }, { map: tex, alphaTest: 0.5 }]) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial(o)); m.castShadow = true; m.frustumCulled = false; g.add(m);
      }
      this._probe = g;
    }
    return this._probe;
  }

  /** R2-E-04: three frees a GPU program the moment the last material using it is disposed, so every race rebuilt (and re-linked) the same 60-120 programs. One extra
   *  reference per program keeps it linked across races; the next course finds it by cache key. Capped, so a long session cannot collect programs without end;
   *  forgotten on context loss (three rebuilds its tables then). */
  keepPrograms() {
    const progs = this.renderer?.info?.programs; if (!progs || this.contextLost) return;
    for (const p of progs) {
      if (this._kept.has(p) || this._kept.size >= MAX_KEPT_PROGRAMS) continue;
      if (/^\d/.test(p.cacheKey)) continue;             // a ShaderMaterial program: its key starts with per-race shader ids, so no later race can find it and holding it would only pile up (leak.test: +13 programs per race)
      p.usedTimes++; this._kept.add(p);
    }
  }

  /** compileAsync of everything the game draws, raced against 5 s (a driver without parallel compile, or a stuck one, must not hold the game up). The programs are
   *  built for the way the game really draws, because a program's key includes the target's colour space and tone mapping: the scene into the composer's float
   *  target, NOT the canvas (a bare compileAsync built 38 programs that were never used while the hidden frame then linked 37 others on the spot; Sunrise / High,
   *  Neon 41 + 37). The post chain is not in the scene: the hidden frame that follows builds it. */
  async compileScene() {
    const r = this.renderer, rt = this.post?.composer?.readBuffer || null;
    let timer, p;
    if (rt) r.setRenderTarget(rt);
    try { p = r.compileAsync(this.scene, this.camera); }       // the programs are built (and their keys made) synchronously, inside this call
    finally { if (rt) r.setRenderTarget(null); }
    try { await Promise.race([p, new Promise((res) => { timer = setTimeout(res, 5000); })]); } finally { clearTimeout(timer); }
  }

  disposeRace() {
    this.keepPrograms();
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
    if (this.race && !this.manual) this.warmPreset();   // (a manual-mode harness steps and draws by hand: it must not find a held frame)// a scene already exists: its programs for the new preset (shadows on or off, another post chain) would otherwise link inside the next frame
    if (!silent) this.events.emit('settings:change', { key: 'quality', value: id });
  }

  /** R2-V-16: switching preset with a race built (Settings from the pause menu, or a harness) used to compile the new preset's programs inside the next frame: Redrock
   *  High -> Low froze the page for 1.7-2.3 s with the Settings screen on top. The programs are linked in parallel with compileAsync while the last frame stays on
   *  screen (renderFrame draws nothing meanwhile; the sim and the UI go on), then one hidden frame builds the post chain's own. Never fatal; a newer preset change or
   *  a new race supersedes it (a stale run must not clear the newer one's hold). */
  async warmPreset() {
    if (this.contextLost || !this.renderer?.compileAsync) return;
    const token = ++this._presetToken;
    this._holdDraw = true; this._warming++;
    try {
      this.renderFrame(0, 0);                           // every system adopts the preset (materials, visibility) before the programs are collected; nothing is drawn
      await this.compileScene();
      if (token !== this._presetToken || this.contextLost) return;
      this._holdDraw = false;                           // the hidden frame has to draw
      this.hiddenFrame();
    } catch { /* a failed warm-up only costs the first-frame stall */ }
    finally { this._warming--; if (token === this._presetToken) this._holdDraw = false; }
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
    if (!this._holdDraw) this.post.render(dt);          // R2-V-16: held while a preset change links its programs
    gpu?.end();
  }

  /** Auto-quality (E-05 / V-9), one rendered frame. `interval` is the frame interval (s); the decision is made on the frame's COST (governor.js):
   *  sim ms per step + render ms, or the GPU time when the browser reports it. Never on the interval: a vsynced 60 Hz display always shows 16.7 ms.
   *  Public so a harness can drive it with synthetic timings (`manual` mode has no loop). */
  governorFrame(interval, simMs, steps, renderMs) {
    const gov = this.gov; if (!gov) return null;
    const gpuKnown = !!this.gpuTimer?.live;               // false: no EXT_disjoint_timer_query_webgl2 (Safari, Firefox) or no result yet, so `cost` is the CPU's alone (R2-E-01)
    const gpuMs = gpuKnown ? this.gpuTimer.ms : 0;
    const cost = this.costMeter.push(simMs, steps, renderMs, gpuMs);
    this.perf.costMs += (cost - this.perf.costMs) * 0.05; this.perf.gpuMs = gpuMs;
    const live = this.settings.quality === 'auto' && !this.paused && !this.contextLost && (this.state === 'race' || this.state === 'demo' || this.state === 'finish');
    if (!live) { gov.hold(1.5); return null; }
    const act = gov.frame(cost, interval, gpuKnown);
    if (act) this.applyGovernorAction(act);
    return act;
  }

  /** A scale step is applied at once (cheap, invisible mid-race). A preset step only becomes `gov.state.pending`: startRace applies it between races. */
  applyGovernorAction(act) {
    if (act.type === 'scale') { this.autoScale = act.scale; this.resize(); }
    this.events.emit('game:autoquality', { ...act, scale: this.autoScale, preset: this.qualityId });
  }
}
