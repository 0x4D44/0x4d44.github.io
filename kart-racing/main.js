// Apex Karts - engine: renderer, fixed-step loop, state machine, cup sequencing, wiring of all modules.
import * as THREE from "three";
import { ROSTER, ITEMS, ITEM_IDS, POINTS, RACERS, makeRng, blankInput, clamp } from "./roster.js";

const BEST_KEY = "apexkarts.best.v1";
const STEP = 1 / 120;
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

function fatal(msg) {
  const f = $("fatal");
  if (!f) return;
  $("fatal-msg").textContent = msg;
  f.style.display = "flex";
  const b = $("boot");
  if (b) b.classList.add("gone");
}

// ---- dynamic imports so a missing module gives a clear message instead of a blank page ----
async function loadModules() {
  const names = ["trackdefs", "track", "kart", "controls", "camera", "ai", "items", "ui", "race", "audio", "effects"];
  const mods = {};
  const missing = [];
  await Promise.all(names.map(async (n) => {
    try { mods[n] = await import(`./${n}.js`); } catch (e) {
      missing.push(`${n}.js: ${e && e.message}`);
      console.error(`[apex] failed to load ${n}.js`, e);
    }
  }));
  if (missing.length) throw new Error("Module load failed - " + missing.join("; "));
  return mods;
}

class Game {
  constructor(M) {
    this.M = M;
    this.TRACK_DEFS = M.trackdefs.TRACK_DEFS;
    this.seed = params.has("seed") ? Number(params.get("seed")) || 1 : (Math.random() * 1e9) | 0;
    this.rng = makeRng(this.seed);
    this.canvas = $("game");
    this.stateName = "loading";
    this.paused = false;
    this.timeScale = 1;
    this.cfg = null;            // current race config
    this.cup = null;
    this.botPlayer = false;
    this.tracks = new Map();
    this.activeTrack = null;
    this.disposeScene = null;
    this.karts = [];
    this.drivers = [];
    this.playerDriver = null;
    this.race = null;
    this.items = null;
    this.player = null;
    this.lastResults = null;
    this.acc = 0;
    this.stepNo = 0;
    this.simTime = 0;
    this.hudTimer = 0;
    this.finishTimer = 0;
    this.goHideTimer = 0;
    this.wrongWay = false;
    this.backdropIdx = 0;
    this.frame = 0;
    this.fpsAcc = 0; this.fpsN = 0;
    this.best = this._loadBest();
    this._frameInput = blankInput();
    this.autoScale = 1;
    this.adaptive = !navigator.webdriver && !params.has("quick");
    this.fovBase = 70;
    this._initRenderer();
    this._initModules();
    this._bindEvents();
  }

  // ------------------------------------------------------------------ setup
  _initRenderer() {
    let r;
    try {
      r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    } catch (e) {
      throw new Error("WebGL is not available in this browser.");
    }
    this.renderer = r;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fovBase, 1, 0.5, 2500);
  }

  _initModules() {
    const M = this.M;
    this.uiRoot = $("ui");
    this.ui = new M.ui.UI(this.uiRoot, {
      roster: ROSTER,
      trackDefs: this.TRACK_DEFS,
      outlinePoints: M.trackdefs.outlinePoints,
      buildKartMesh: M.kart.buildKartMesh,
    });
    this.audio = new M.audio.GameAudio();
    this.effects = new M.effects.Effects(this.scene);
    this.controls = new M.controls.Controls($("controls"), this.canvas);
    this.controls.onPause = () => this.togglePause();
    this.chase = new M.camera.ChaseCamera(this.camera);
    this.controls.enabled = false;
    $("controls").style.display = "none";
    this.ui.setBestTimes?.(this.best);
    this.ui.onSettings = (s) => this.applySettings(s);
    this.ui.onSound = (n) => this.audio.play(n);
    this.applySettings(this.ui.settings);
  }

  applySettings(s) {
    if (!s) return;
    this.settings = s;
    this.audio.setVolumes({ volume: s.volume, music: s.music, sfx: s.sfx });
    this.controls.setTouchMode?.(s.touch || "auto");
    this.chase.setMode?.(s.camera === "far" ? "far" : "chase");
    const low = s.quality === "low";
    this.effects.setQuality(low ? "low" : "high");
    const wantShadow = !low;
    if (this.renderer.shadowMap.enabled !== wantShadow) {
      this.renderer.shadowMap.enabled = wantShadow;
      this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    }
    this.basePR = low ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.max(0.5, this.basePR * this.autoScale));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _bindEvents() {
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.inRace() && !this.paused) this.togglePause(true);
    });
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyU" && !e.repeat && this.inRace() && !this.paused && !this.botPlayer) {
        this.cheat = !this.cheat;
        if (this.cheat) this._raceCheated = true;
        this.audio.play(this.cheat ? "pad" : "ui-back");
      }
    });
    const unlock = () => this.audio.unlock();
    for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, unlock, { passive: true });
  }

  inRace() { return ["grid", "countdown", "racing", "finishing"].includes(this.stateName); }
  setState(s) { this.stateName = s; document.documentElement.dataset.state = s; }

  // ------------------------------------------------------------------ persistence
  _loadBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { return {}; }
  }
  _saveBest() {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(this.best)); } catch (e) { /* ignore */ }
    this.ui.setBestTimes?.(this.best);
  }

  // ------------------------------------------------------------------ world
  getTrack(id) {
    let t = this.tracks.get(id);
    if (!t) { t = this.M.track.createTrack(id); this.tracks.set(id, t); }
    return t;
  }

  activateTrack(id) {
    if (this.activeTrack && this.activeTrack.id === id) return this.activeTrack;
    this.deactivateTrack();
    const t = this.getTrack(id);
    this.scene.add(t.group);
    this.disposeScene = t.setupScene(this.scene, this.renderer);
    this.activeTrack = t;
    return t;
  }

  deactivateTrack() {
    if (!this.activeTrack) return;
    try { if (typeof this.disposeScene === "function") this.disposeScene(); } catch (e) { console.warn(e); }
    this.scene.remove(this.activeTrack.group);
    this.disposeScene = null;
    this.activeTrack = null;
  }

  disposeObject(o) {
    o.traverse((c) => {
      if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose?.();
    });
  }

  clearKarts() {
    this.effects.detachAll();
    this.effects.clear();
    if (this.items) { this.items.dispose(); this.items = null; }
    for (const k of this.karts) {
      this.scene.remove(k.mesh);
      this.disposeObject(k.mesh);
    }
    this.karts = [];
    this.drivers = [];
    this.playerDriver = null;
    this.player = null;
    this.race = null;
    this.audio.stopEngine();
  }

  makeKart(def, isPlayer) {
    const k = new this.M.kart.Kart({ id: def.id, name: def.name, color: def.color, accent: def.accent, stats: def.stats, isPlayer });
    this.scene.add(k.mesh);
    this.effects.attachToKart(k);
    return k;
  }

  /** Menu / title backdrop: idle karts on the grid, orbit camera. */
  async buildBackdrop() {
    this.clearKarts();
    const id = this.TRACK_DEFS[this.backdropIdx % this.TRACK_DEFS.length].id;
    const track = this.activateTrack(id);
    ROSTER.slice(0, RACERS).forEach((def, i) => {
      const k = this.makeKart(def, false);
      const g = track.grid(i);
      k.placeAt(g.pos, g.heading);
      k.locked = true;
      this.karts.push(k);
    });
    this.backdropTrack = track;
    this.audio.startMusic("menu");
    this.ui.hideLoading?.();
  }

  // ------------------------------------------------------------------ flow
  async boot() {
    $("boot-msg").textContent = "BUILDING TRACKS";
    await new Promise((r) => requestAnimationFrame(r));
    await this.buildBackdrop();
    this.resize();
    this.setState("title");
    $("boot").classList.add("gone");
    setTimeout(() => $("boot").remove(), 600);
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    if (params.get("quick") === "1") {
      this.ui.hideLoading?.();
      this.quickStart(this._quickOpts());
    } else {
      this.ui.showTitle(() => this.toMenu());
    }
  }

  _quickOpts() {
    const def = this.TRACK_DEFS.find((d) => d.id === params.get("track")) || this.TRACK_DEFS[0];
    return {
      trackId: def.id,
      laps: Number(params.get("laps")) || def.laps || 3,
      difficulty: params.get("difficulty") || "normal",
      kartId: params.get("kart") || "ember",
      bot: params.get("bot") === "1",
      mode: params.get("cup") === "1" ? "cup" : "race",
    };
  }

  quickStart(o = {}) {
    const base = this._quickOpts();
    const opts = { ...base, ...o };
    if (o.bot === undefined) opts.bot = base.bot;
    this.botPlayer = !!opts.bot;
    this.cup = null;
    this.ui.hideTitle?.();
    this.ui._clearScreen?.();
    const cfg = { mode: opts.mode || "race", trackId: opts.trackId, laps: opts.laps, difficulty: opts.difficulty, kartId: opts.kartId };
    if (cfg.mode === "cup") { this._makeCup(cfg); return this.startRace(cfg); }
    return this.startRace(cfg);
  }

  toMenu() {
    this.paused = false;
    this.ui.hidePause?.();
    this.ui.hideResults?.();
    this.ui.hideHUD?.();
    this.ui.hideCountdown?.();
    this.controls.enabled = false;
    $("controls").style.display = "none";
    this.cup = null;
    this.botPlayer = false;
    this.setState("loading");
    this.backdropIdx++;
    this.buildBackdrop().then(() => {
      this.setState("menu");
      this.ui.showMenu({ onStart: (cfg) => this.onMenuStart(cfg) });
    });
  }

  onMenuStart(cfg) {
    this.audio.play("ui-select");
    this.botPlayer = false;
    this.cup = null;
    if (cfg.mode === "cup") this._makeCup(cfg);
    this.startRace(cfg);
  }

  _makeCup(cfg) {
    const ids = this.TRACK_DEFS.map((d) => d.id);
    const i = Math.max(0, ids.indexOf(cfg.trackId));
    const order = ids.map((_, n) => ids[(i + n) % ids.length]).slice(0, 3);
    this.cup = { cfg, order, round: 0, points: {}, lastPlace: {} };
  }

  async startRace(cfg) {
    this.cfg = cfg;
    this.ui.hideResults?.();
    this.ui.hidePause?.();
    this.paused = false;
    this.setState("loading");
    this.ui.showLoading?.("Loading " + (this.TRACK_DEFS.find((d) => d.id === cfg.trackId)?.name || "race"), 0.3);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    this.clearKarts();
    const track = this.activateTrack(cfg.trackId);
    const defs = this._gridOrder(cfg);
    const playerDef = ROSTER.find((r) => r.id === cfg.kartId) || ROSTER[0];
    const diff = cfg.difficulty || "normal";

    defs.forEach((def, i) => {
      const k = this.makeKart(def, def.id === playerDef.id);
      const g = track.grid(i);
      k.placeAt(g.pos, g.heading);
      k.locked = true;
      this.karts.push(k);
    });
    this.player = this.karts.find((k) => k.isPlayer);
    const AI = this.M.ai.AIDriver;
    this.karts.forEach((k, i) => {
      if (!k.isPlayer || this.botPlayer) {
        const skill = k.isPlayer ? 0.95 : 0.25 + this.rng() * 0.7;
        const d = new AI(k, track, { difficulty: k.isPlayer ? "hard" : diff, skill, seed: this.seed + i * 17 + 1 });
        if (k.isPlayer) this.playerDriver = d; else this.drivers.push(d);
      }
    });

    this.race = new this.M.race.Race({ track, karts: this.karts, laps: cfg.laps || track.laps, rng: this.rng });
    this.items = new this.M.items.ItemSystem({
      scene: this.scene, track, karts: this.karts, effects: this.effects, audio: this.audio, rng: this.rng,
    });
    this._wireRace();
    track.onRaceStart?.(this.race, this.player, this.audio, this);   // optional per-track hook (e.g. the Highland piper)
    this._wireKarts();
    this.chase.setTarget(this.player);
    this.chase.setMode?.(this.settings?.camera === "far" ? "far" : "chase");
    this.chase.snap();

    this.cheat = false; this._raceCheated = false; this._cheatFinal = false;
    this.audio.startMusic(track.def.theme || track.id);
    this.audio.setListener(this.player);
    this.audio.startEngine();
    this.ui.hideLoading?.();
    this.ui.hideTitle?.();
    this.ui.showHUD?.();
    this.controls.enabled = !this.botPlayer;
    $("controls").style.display = this.botPlayer ? "none" : "";
    this.wrongWay = false;
    this.finishTimer = 0;
    this.acc = 0;
    this.race.start();
    this.setState("countdown");
    this.ui.showCountdown?.("3");
    this.audio.play("countdown");
    this._pushHUD(true);
  }

  _gridOrder(cfg) {
    const chosen = ROSTER.find((r) => r.id === cfg.kartId) || ROSTER[0];
    const bots = ROSTER.filter((r) => r.id !== chosen.id);
    // deterministic shuffle
    for (let i = bots.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [bots[i], bots[j]] = [bots[j], bots[i]]; }
    let all = [chosen, ...bots.slice(0, RACERS - 1)];
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    if (this.cup && this.cup.round > 0) {
      // Grand Prix: points leader starts on pole
      all = all.sort((a, b) => (this.cup.points[b.id] || 0) - (this.cup.points[a.id] || 0));
    }
    return all;
  }

  _wireRace() {
    const race = this.race, ui = this.ui, audio = this.audio, player = this.player;
    race.on("countdown", (label) => {
      ui.showCountdown?.(label);
      audio.play("countdown", { go: label === "GO!", label });
      if (label === "GO!") { this.goHideTimer = 0.9; this.setState("racing"); this.chase.setShake?.(0); }
    });
    race.on("rocket", (k) => {
      if (k === player) { ui.toast?.("ROCKET START!"); this.effects.burst(k.position, "sparkle", { color: 0xff9a1f, count: 24 }); }
    });
    race.on("lap", (k, lap, lapTime, isBest) => {
      if (k !== player) return;
      ui.banner?.(`LAP ${lap}`, 1400);
      audio.play("lap");
      if (isBest && lap > 2) ui.toast?.("NEW BEST LAP");
    });
    race.on("finalLap", (k) => {
      if (k !== player) return;
      setTimeout(() => { if (this.race === race) { ui.banner?.("FINAL LAP!", 1600); audio.play("finalLap"); } }, 1500);
    });
    race.on("wrongWay", (k, on) => { if (k === player) this.wrongWay = on; });
    race.on("finish", (k, place) => {
      if (k !== player) return;
      this.setState("finishing");
      this.finishTimer = 0;
      ui.banner?.(place === 1 ? "YOU WIN!" : "FINISH!", 2600);
      audio.play("finish");
      this.effects.burst(k.position, "confetti", { count: place <= 3 ? 70 : 20 });
      // autopilot takes over the player's kart
      if (!this.playerDriver) {
        this.playerDriver = new this.M.ai.AIDriver(k, race.track, { difficulty: "normal", skill: 0.8, seed: this.seed + 99 });
      }
      this.controls.enabled = false;
    });
  }

  _wireKarts() {
    const p = this.player, audio = this.audio, fx = this.effects, chase = this.chase;
    for (const k of this.karts) {
      const me = k === p;
      k.on("bump", (other, impact) => {
        const strong = (impact || 6) > 4;
        if (me || other === p) {
          audio.play("bump");
          chase.setShake?.(Math.min(1, (impact || 6) / 14));
        }
        if (strong) fx.burst(k.position, "impact", { count: 8, scale: 0.7 });
      });
      k.on("wall", (impact) => {
        if (me) { audio.play("wall", { impact }); chase.setShake?.(Math.min(1, (impact || 6) / 16)); }
        if ((impact || 6) > 4) fx.burst(k.position, "impact", { count: 6, scale: 0.6 });
      });
      k.on("spin", () => { if (me) chase.setShake?.(0.8); });
      k.on("boost", () => { if (me) audio.play("boost"); fx.burst(k.position, "sparkle", { color: 0xffa040, count: 6 }); });
      k.on("driftlevel", (n) => { if (me) audio.play("drift-level", { level: n }); });
      k.on("pad", () => { if (me) audio.play("pad"); });
    }
    let flashT = 0;
    this.items.on?.("shock", () => {
      const now = performance.now();
      if (now - flashT < 500) return;
      flashT = now;
      const f = $("fx-flash");
      f.style.transition = "none"; f.style.opacity = "0.85";
      requestAnimationFrame(() => { f.style.transition = "opacity .45s ease-out"; f.style.opacity = "0"; });
      chase.setShake?.(1);
      fx.burst(p.position, "shock", { count: 40 });
    });
  }

  // ------------------------------------------------------------------ pause / quit / restart
  togglePause(force) {
    if (!this.inRace() && !this.paused) return;
    if (this.stateName === "finishing" && !this.paused) return;
    const want = force === undefined ? !this.paused : force;
    if (want === this.paused) return;
    this.paused = want;
    if (want) {
      this.audio.stopEngine();
      this.controls.enabled = false;
      this.ui.showPause?.({
        onResume: () => this.togglePause(false),
        onRestart: () => { this.paused = false; this.ui.hidePause?.(); this.restart(); },
        onQuit: () => this.quit(),
      });
    } else {
      this.ui.hidePause?.();
      this.audio.startEngine();
      this.controls.enabled = !this.botPlayer;
      this.last = performance.now();
    }
  }

  restart() {
    this.ui.hideHUD?.();
    this.ui.hideResults?.();
    if (this.cup) { /* restart the current round only */ }
    this.startRace(this.cfg);
  }

  quit() {
    this.paused = false;
    this.ui.hidePause?.();
    this.toMenu();
  }

  // ------------------------------------------------------------------ results & cup
  showResults() {
    const race = this.race;
    const results = race.results(this.cfg.difficulty, this.cfg.mode);
    results.trackId = this.cfg.trackId;
    const cheated = this._raceCheated;
    this.cheat = false; this._cheatFinal = false;
    // records
    const tid = this.cfg.trackId;
    const rec = (this.best[tid + ":" + results.laps] = this.best[tid + ":" + results.laps] || { bestLap: null, bestRace: null });
    let prevLap = null;
    if (!cheated) {
    for (const [k, v] of Object.entries(this.best)) if (k.startsWith(tid + ":") && v.bestLap != null && (prevLap == null || v.bestLap < prevLap)) prevLap = v.bestLap;
    if (results.bestLap != null && (rec.bestLap == null || results.bestLap < rec.bestLap)) { rec.bestLap = results.bestLap; if (prevLap == null || results.bestLap < prevLap) results.newRecord = true; }
    if (results.totalTime != null && !results.rows.find((r) => r.isPlayer)?.dnf && (rec.bestRace == null || results.totalTime < rec.bestRace)) { rec.bestRace = results.totalTime; results.newRecord = true; }
    this._saveBest();
    }

    let cupInfo = null;
    if (this.cup) {
      const c = this.cup;
      for (const r of results.rows) {
        c.points[r.id] = (c.points[r.id] || 0) + r.points;
        c.lastPlace[r.id] = r.place;
      }
      for (const r of results.rows) r.totalPoints = c.points[r.id];
      const standings = results.rows
        .map((r) => ({ name: r.name, color: r.color, isPlayer: r.isPlayer, points: c.points[r.id], id: r.id }))
        .sort((a, b) => b.points - a.points || (c.lastPlace[a.id] - c.lastPlace[b.id]));
      const rounds = c.order.length;
      cupInfo = { round: c.round + 1, rounds, final: c.round + 1 >= rounds, standings };
      results.cup = cupInfo;
      results.cupStandings = standings;
    }
    this.lastResults = results;
    this.audio.startMusic("results");
    this.setState("results");
    this.ui.hideHUD?.();
    this.audio.stopEngine();
    $("controls").style.display = "none";
    this.ui.showResults(results, {
      onNext: () => {
        if (this.cup && !cupInfo.final) {
          this.cup.round++;
          this.cfg = { ...this.cfg, trackId: this.cup.order[this.cup.round] };
          this.startRace(this.cfg);
        } else {
          // single race: "Next" rolls on to the following track (wrapping round) with the same driver, laps, difficulty
          const ids = this.TRACK_DEFS.map((d) => d.id);
          const nid = ids[(Math.max(0, ids.indexOf(this.cfg.trackId)) + 1) % ids.length];
          this.cfg = { ...this.cfg, trackId: nid };
          this.startRace(this.cfg);
        }
      },
      onRetry: () => {
        if (this.cup) {
          this.cup = { cfg: this.cup.cfg, order: this.cup.order, round: 0, points: {}, lastPlace: {} };
          this.cfg = { ...this.cfg, trackId: this.cup.order[0] };
        }
        this.startRace(this.cfg);
      },
      onMenu: () => this.toMenu(),
    });
  }

  // ------------------------------------------------------------------ simulation
  simStep(h, first) {
    const race = this.race;
    if (!race) return;
    this.stepNo++;
    this.simTime += h;
    const player = this.player;
    const inp = this._frameInput;
    // player input
    if (!this.playerDriver || this.stateName === "grid") {
      if (!this.botPlayer) {
        const pi = player.input;
        pi.throttle = inp.throttle; pi.brake = inp.brake; pi.steer = inp.steer; pi.drift = inp.drift;
        pi.lookBack = inp.lookBack;
        if (first && inp.useItem) pi.useItem = true;
      }
    }
    if (this.cheat) this._applyCheat(player, race);
    // bots at 60 Hz
    const ctx = { karts: this.karts, items: this.items, race };
    if ((this.stepNo & 1) === 0) {
      const dt2 = h * 2;
      for (const d of this.drivers) d.update(dt2, ctx);
      if (this.playerDriver) this.playerDriver.update(dt2, ctx);
    }
    this.items.update(h, this.simTime, race);
    for (const k of this.karts) k.update(h, race.track);
    this.M.kart.Kart.collide(this.karts);
    race.update(h);
    if ((this.stepNo & 15) === 0) this._housekeeping(h * 16);
  }

  /** Secret "U" mode: endless turbo, and a guaranteed win on the final lap. */
  _applyCheat(player, race) {
    if (race.state !== "racing" || player.race.finished) return;
    const finalLap = player.race.lap >= race.laps;
    let strength = 1.15;
    if (finalLap) {
      const gap = Math.max(0, race.leaderProgress() - player.race.progress);
      strength = Math.min(3, 1.4 + gap / 120);
    }
    if (player.boostTime < 0.35 || player.boostStrength < strength) player.boost(strength, 0.7);
    this._cheatFinal = finalLap;
  }

  /** Rubber-banding and recovery for karts that are hopelessly out of bounds. */
  _housekeeping(dt) {
    const race = this.race;
    if (race.state === "countdown") return;
    const lead = race.leaderProgress();
    const pp = this.player.race.progress;
    const diff = this.cfg.difficulty;
    for (const k of this.karts) {
      if (!k.isPlayer || this.botPlayer) {
        if (!k.race.finished) k.speedScale = this.M.ai.rubberBand(k, lead, pp, diff);
      }
      if (this.cheat && this._cheatFinal && !k.isPlayer && !k.race.finished) {
        const remain = race.laps * race.L - this.player.race.progress;
        k.speedScale *= remain < 450 && k.race.progress > this.player.race.progress ? 0.35 : 0.9;
      }
      const st = k._fxStuck || (k._fxStuck = { off: 0, still: 0 });
      st.off = k.offRoad ? st.off + dt : 0;
      st.still = (Math.abs(k.speed) < 1.2 && !k.locked && race.state === "racing" && !k.race.finished) ? st.still + dt : 0;
      if (st.off > 6 || st.still > 7) {
        k.respawn(race.track);
        st.off = 0; st.still = 0;
      }
    }
  }

  // ------------------------------------------------------------------ frame
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.1) dt = 0.1;
    this.frame++;
    this._adapt(dt);
    if (document.hidden) return;
    const st = this.stateName;
    const simActive = this.race && !this.paused && (st === "countdown" || st === "racing" || st === "finishing");

    if (simActive) {
      this._frameInput = this.controls.enabled ? this.controls.read() : this._frameInput;
      if (!this.controls.enabled && !this.botPlayer) { this._frameInput = blankInput(); }
      this.acc += dt * this.timeScale;
      const maxSteps = this.timeScale > 1 ? 80 : 12;
      let n = 0;
      while (this.acc >= STEP && n < maxSteps) { this.simStep(STEP, n === 0); this.acc -= STEP; n++; }
      if (n === maxSteps) this.acc = 0;
      if (st === "finishing") {
        this.finishTimer += dt;
        if (this.finishTimer > 4.0) this.showResults();
      }
      if (this.goHideTimer > 0) { this.goHideTimer -= dt; if (this.goHideTimer <= 0) this.ui.hideCountdown?.(); }
    }

    this._render(dt, simActive);
  }

  _render(dt, simActive) {
    const track = this.activeTrack;
    if (!track) return;
    track.update(dt, this.simTime);
    const p = this.player;
    if (this.race && p && (this.stateName !== "menu" && this.stateName !== "title" && this.stateName !== "loading")) {
      const results = this.stateName === "results";
      if (results) {
        this.chase.orbit(dt, p.position, 12, 4.5);
      } else {
        if (!this.paused) {
          this.chase.lookBack?.(!!this._frameInput.lookBack);
          this.chase.update(dt, track);
        }
        if (simActive) this._pushHUD(false, dt);
        if (!this.paused) this._audioFrame();
        this.effects.setSpeedFx(clamp((Math.abs(p.speed) - p.maxSpeed * 0.85) / (p.maxSpeed * 0.3) + (p.boostTime > 0 ? 0.5 : 0), 0, 1));
      }
    } else {
      // title / menu backdrop
      const c = track.grid(3).pos;
      this.chase.orbit(dt, c, 24, 7);
      this.effects.setSpeedFx(0);
    }
    this.effects.setViewport(this.renderer.domElement.height, this.camera.fov);
    this.effects.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _audioFrame() {
    const p = this.player, au = this.audio;
    const frac = Math.min(1.3, Math.abs(p.speed) / p.maxSpeed);
    const rev = p.locked ? 0.12 + (p.rev || 0) * 0.45 : frac;
    const drift = p.drifting ? Math.max(1, Math.floor(p.driftCharge)) : 0;
    au.updateEngine(rev, p.boostTime > 0, drift, !!p.offRoad && !p.locked);
    const r = this.race;
    au.setMusicIntensity(r && r.state === "racing" ? Math.min(1, 0.35 + (p.race.lap >= r.laps ? 0.3 : 0) + (p.boostTime > 0 ? 0.2 : 0) + (p.race.place <= 2 ? 0.1 : 0)) : 0.3);
    // positional engines (nearest bots), ~20 Hz
    if ((this.frame & 1) === 0) {
      const rx = -Math.cos(p.heading), rz = Math.sin(p.heading);
      const list = [];
      for (const k of this.karts) {
        if (k === p) continue;
        const dx = k.position.x - p.position.x, dz = k.position.z - p.position.z, d = Math.hypot(dx, dz);
        list.push({ id: k.id, dist: d, pan: (dx * rx + dz * rz) / Math.max(6, d), speedFrac: Math.abs(k.speed) / k.maxSpeed });
      }
      au.updateOthers(list);
    }
  }

  _pushHUD(force, dt = 0) {
    this.hudTimer -= dt;
    if (!force && this.hudTimer > 0) return;
    this.hudTimer = 1 / 30;
    const race = this.race, p = this.player, items = this.items;
    if (!race || !p || !this.ui.updateHUD) return;
    const r = p.race;
    const rolling = items.isRolling(p);
    if (rolling && (this._rollTick = (this._rollTick || 0) + 1) % 2 === 0) this.audio.play("item-roll", { i: this._rollTick });
    const standings = race.standings();
    const showMap = this.settings ? this.settings.minimap !== false : true;
    const t = race.track;
    this.ui.updateHUD({
      place: r.place,
      racers: this.karts.length,
      lap: Math.min(race.laps, r.lap),
      laps: race.laps,
      speedKmh: Math.abs(p.speed) * 3.6,
      item: rolling ? null : p.item,
      itemCount: p.itemCount || 0,
      rolling,
      rollIcon: rolling ? ITEM_IDS[Math.floor(this.simTime * 14) % ITEM_IDS.length] : null,
      time: Math.max(0, race.time),
      lapTime: Math.max(0, race.time - (r._lapStart || 0)),
      bestLap: r.bestLap,
      wrongWay: this.wrongWay,
      boostPct: p.drifting ? clamp(p.driftCharge / 3, 0, 1) : p.boostTime > 0 ? clamp(p.boostTime / 1.5, 0, 1) : 0,
      minimap: showMap ? {
        points: t.minimap, bounds: t.bounds,
        karts: this.karts.map((k) => ({ x: k.position.x, z: k.position.z, color: k.color, isPlayer: k.isPlayer, place: k.race.place })),
      } : null,
      standings: standings.slice(0, 8).map((k) => ({ place: k.race.place, name: k.name, color: k.color, isPlayer: k.isPlayer })),
    });
  }

  _adapt(dt) {
    if (!this.adaptive || this.stateName === "loading") return;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsN < 90) return;
    const avg = this.fpsAcc / this.fpsN;
    this.fpsAcc = 0; this.fpsN = 0;
    let s = this.autoScale;
    if (avg > 0.024 && s > 0.6) s -= 0.15;
    else if (avg < 0.0145 && s < 1) s = Math.min(1, s + 0.1);
    if (s !== this.autoScale) { this.autoScale = s; this.resize(); }
  }

  // ------------------------------------------------------------------ debug API
  skipTo(seconds) {
    if (!this.race) return;
    this.paused = false;
    let guard = 0;
    if (this.race.state === "countdown") this.race.countdown = 0.001;
    this._frameInput = this.botPlayer ? this._frameInput : blankInput();
    while (this.race.time < seconds && guard++ < 400000) {
      this.simStep(STEP, true);
      if (this.stateName === "finishing" && this.race.time > (this.race.playerFinishTime ?? 0) + 4) break;
    }
    if (this.stateName === "finishing" && this.race.time > (this.race.playerFinishTime ?? 0) + 4) this.showResults();
  }

  setBot(on) {
    this.botPlayer = !!on;
    const p = this.player;
    if (!p) return;
    if (on && !this.playerDriver) {
      this.playerDriver = new this.M.ai.AIDriver(p, this.race.track, { difficulty: "hard", skill: 0.95, seed: this.seed + 3 });
      this.controls.enabled = false;
      $("controls").style.display = "none";
    } else if (!on && this.playerDriver && this.stateName !== "finishing") {
      this.playerDriver = null;
      this.controls.enabled = true;
      $("controls").style.display = "";
    }
  }
}

// ---------------------------------------------------------------------- boot
(async function main() {
  const canvasProbe = document.createElement("canvas");
  const gl = canvasProbe.getContext("webgl2") || canvasProbe.getContext("webgl");
  if (!gl) { fatal("Apex Karts needs WebGL, which is not available in this browser."); return; }
  let game;
  try {
    const M = await loadModules();
    game = new Game(M);
  } catch (e) {
    console.error(e);
    fatal(String(e && e.message ? e.message : e));
    return;
  }
  const g = game;
  window.__kart = {
    game: g,
    state: () => g.stateName,
    get race() { return g.race; },
    get karts() { return g.karts; },
    get track() { return g.activeTrack; },
    get items() { return g.items; },
    get ui() { return g.ui; },
    get player() { return g.player; },
    get cup() { return g.cup; },
    get lastResults() { return g.lastResults; },
    setBot: (on) => g.setBot(on),
    quickStart: (o) => g.quickStart(o),
    skipTo: (s) => g.skipTo(s),
    setTimeScale: (s) => { g.timeScale = s; },
    togglePause: (f) => g.togglePause(f),
    restart: () => g.restart(),
    quit: () => g.quit(),
  };
  g.boot().catch((e) => { console.error(e); fatal("Failed to start: " + (e && e.message)); });
})();
