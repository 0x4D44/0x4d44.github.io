// The integrator: it owns the clock, the state machine and the wiring, and
// nothing else. Every subsystem is behind the contract in CONTRACTS.md, so this
// file is the only place that knows they all exist.
//
// The clock is a fixed-step accumulator at 200 Hz with a render-rate cap on how
// many steps one frame may consume. A variable-step car model would make a time
// depend on the player's framerate, which would make every leaderboard a lie.

import * as THREE from "./three.module.min.js";
import { clamp, damp, saturate } from "./mathx.js";
import { createInput, makeInput } from "./input.js";
import { surfaceProps } from "./surfaces.js";

const PHYSICS_HZ = 200;
const PHYSICS_DT = 1 / PHYSICS_HZ;
const MAX_STEPS_PER_FRAME = 8;      // beyond this we let time slip rather than spiral
const MAX_FRAME_DT = 0.25;

export const GameState = Object.freeze({
  BOOT: "boot",
  MENU: "menu",
  LOADING: "loading",
  COUNTDOWN: "countdown",
  RACING: "racing",
  PAUSED: "paused",
  FINISHED: "finished",
  RETIRED: "retired",
});

export async function startGame(opts) {
  const canvas = opts.canvas;
  const progress = opts.onProgress ?? (() => {});

  progress("Loading modules", 0.15);
  const [
    physics, stageMod, pacenotes, damageMod, weatherMod,
    meshes, renderMod, hudMod, uiMod, careerMod, replayMod,
  ] = await Promise.all([
    import("./physics.js"),
    import("./stage.js"),
    import("./pacenotes.js"),
    import("./damage.js"),
    import("./weather.js"),
    import("./meshes.js"),
    import("./render.js"),
    import("./hud.js"),
    import("./ui.js"),
    import("./career.js"),
    import("./replay.js"),
  ]);

  progress("Building the world", 0.35);

  const audioMod = await import("./audio.js");

  const settings = loadSettings();
  const career = careerMod.createCareer(safeStorage());
  const input = createInput({ target: window });
  const audio = audioMod.createAudio({ settings: settings.audio });
  const renderer = renderMod.createRenderer(canvas, {
    THREE,
    meshes,
    quality: settings.quality,
    onNeedsResize: () => {},
  });
  const hud = hudMod.createHud(opts.hudRoot, {
    units: settings.units,
    scale: settings.hudScale,
    reducedMotion: settings.reducedMotion,
  });

  const game = {
    state: GameState.BOOT,
    settings,
    career,
    audio,
    renderer,
    hud,
    input,
    stage: null,
    car: null,
    damage: null,
    weather: null,
    notes: null,
    noteRunner: null,
    recorder: null,
    ghost: null,
    time: 0,
    stageTimeMs: 0,
    countdown: 0,
    splitIndex: 0,
    splitTimes: [],
    lastResult: null,
    paused: false,
  };

  const ui = uiMod.createUi(opts.uiRoot, {
    career,
    cars: physics.CARS,
    carClasses: physics.CAR_CLASSES,
    stageBook: stageMod.STAGE_BOOK,
    settings,
    onStart: (choice) => beginStage(choice),
    onSettingsChange: (patch) => applySettings(patch),
    onRepair: (plan) => career.applyRepairs?.(plan),
    onQuit: () => toMenu(),
    onResume: () => setPaused(false),
    onRestart: () => beginStage(game.lastChoice),
  });

  input.onAction((action, down) => {
    if (!down) return;
    if (action === "pause") togglePause();
    if (action === "camera") renderer.cycleCamera?.();
    if (action === "reset") requestRecovery();
    if (action === "repeatNote") game.noteRunner?.repeat?.();
    if (action === "headlights") renderer.toggleHeadlights?.();
  });

  // The first gesture anywhere is what unlocks WebAudio; doing it on the start
  // button alone would leave a silent game for anyone who used the keyboard.
  const unlock = () => {
    audio.start?.();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: false });
  window.addEventListener("keydown", unlock, { once: false });

  function safeStorage() {
    try {
      const probe = "__opus_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch {
      const map = new Map();
      return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
      };
    }
  }

  function loadSettings() {
    const fallback = {
      units: "kph",
      hudScale: 1,
      reducedMotion: typeof matchMedia === "function"
        && matchMedia("(prefers-reduced-motion: reduce)").matches,
      quality: "auto",
      camera: "chase",
      assists: { abs: false, tc: false, stability: false, steerAssist: true },
      pacenoteStyle: "numeric",
      pacenoteOffset: 0,
      audio: {},
      difficulty: "clubman",
    };
    try {
      const raw = window.localStorage.getItem("0x4d44.opusrally.settings.v1");
      return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch {
      return fallback;
    }
  }

  function applySettings(patch) {
    Object.assign(settings, patch);
    try {
      window.localStorage.setItem("0x4d44.opusrally.settings.v1", JSON.stringify(settings));
    } catch { /* private mode: the session still works, it just will not persist */ }
    hud.setUnits?.(settings.units);
    hud.setScale?.(settings.hudScale);
    renderer.setQuality?.(settings.quality);
    audio.setSettings?.(settings.audio);
    if (game.noteRunner) game.noteRunner.offset = settings.pacenoteOffset;
  }

  async function beginStage(choice) {
    game.lastChoice = choice;
    game.state = GameState.LOADING;
    ui.show("loading", { stage: choice.stageId });
    await nextFrame();

    const def = stageMod.STAGE_BOOK.find((s) => s.id === choice.stageId)
      ?? stageMod.STAGE_BOOK[0];
    const stage = stageMod.generateStage(choice.seed ?? def.seed, {
      ...def,
      reverse: !!choice.reverse,
    });
    const world = stageMod.stageWorld(stage);

    const weather = weatherMod.createWeather(THREE, renderer.scene, choice.weather ?? def.weather);
    const damage = damageMod.createDamage();
    const car = physics.createCar(choice.carId, {
      assists: settings.assists,
      damage,
    });
    physics.resetCar(car, stage.start.x, stage.start.y, stage.start.z, stage.start.yaw);

    const notes = pacenotes.derivePacenotes(stage, { style: settings.pacenoteStyle });
    const runner = pacenotes.createPacenoteRunner(notes, {
      offset: settings.pacenoteOffset,
      speak: (text, note) => {
        audio.speak?.(text);
        hud.setPacenote?.(note, runner.pending?.[0] ?? null);
      },
    });

    renderer.buildStage(stage, { weather, car, meshes, THREE });
    audio.setCar?.(car.spec);
    audio.setSurfaceBank?.(stage.surfaceMix);

    game.stage = stage;
    game.world = world;
    game.car = car;
    game.damage = damage;
    game.weather = weather;
    game.notes = notes;
    game.noteRunner = runner;
    game.recorder = replayMod.createRecorder({ stage: stage.id, car: choice.carId });
    game.ghost = choice.ghost ? replayMod.createGhost(choice.ghost, stage) : null;
    game.stageTimeMs = 0;
    game.splitIndex = 0;
    game.splitTimes = [];
    game.countdown = 5;

    ui.show("hud");
    hud.countdown?.(5);
    game.state = GameState.COUNTDOWN;
  }

  function toMenu() {
    game.state = GameState.MENU;
    renderer.clearStage?.();
    ui.show("title");
  }

  function togglePause() {
    if (game.state === GameState.RACING) setPaused(true);
    else if (game.state === GameState.PAUSED) setPaused(false);
  }

  function setPaused(on) {
    if (on) {
      game.state = GameState.PAUSED;
      audio.setMuted?.(true);
      ui.show("pause");
    } else {
      game.state = GameState.RACING;
      audio.setMuted?.(false);
      ui.show("hud");
    }
  }

  function requestRecovery() {
    if (game.state !== GameState.RACING || !game.car || !game.stage) return;
    const s = game.world.project(game.car.pos.x, game.car.pos.z, game.lastS ?? 0, projScratch).s;
    const back = Math.max(0, s - 12);
    const i = game.world.sampleAt(back);
    const st = game.stage;
    const yaw = Math.atan2(st.tx[i], st.tz[i]);
    physics.resetCar(game.car, st.x[i], st.y[i] + 0.4, st.z[i], yaw);
    // A recovery is not free: rally rules add time for it, and without a cost
    // players simply ram every corner and reset out of it.
    game.stageTimeMs += 10_000;
    hud.toast?.("+10s recovery");
  }

  const projScratch = { s: 0, lateral: 0, signedLateral: 0, index: 0 };
  const surfScratch = { props: surfaceProps(1), surfaceId: 1, onRoad: true, lateral: 0,
    signedLateral: 0, s: 0, edgeBlend: 0, roughness: 0, ruts: 0 };
  const frame = {
    speedKph: 0, gear: 0, rpm: 0, rpmLimit: 7000, turbo: 0,
    throttle: 0, brake: 0, handbrake: 0, steer: 0,
    distance: 0, stageLength: 0, timeMs: 0, splitDeltaMs: null, lastSplitMs: null,
    pacenote: null, nextPacenote: null, surfaceName: "", damage: null,
    weather: null, positionPct: 0, gripUsed: 0, telemetry: null,
    airborne: false, ghostDeltaMs: null, countdown: 0,
  };

  function stepRace(dt) {
    const car = game.car;
    const world = game.world;
    const stage = game.stage;
    const inp = input.update(dt, car.speed);

    if (game.state === GameState.COUNTDOWN) {
      game.countdown -= dt;
      // Revs are free before the line but the car may not move: holding it on
      // the limiter on the start line is half the ritual.
      const held = makeInput();
      held.throttle = inp.throttle;
      held.brake = 1;
      held.clutch = 1;
      stepPhysics(car, held, world, dt);
      hud.countdown?.(Math.max(0, Math.ceil(game.countdown)));
      if (game.countdown <= 0) {
        game.state = GameState.RACING;
        hud.countdown?.(0);
        audio.impact?.({ kind: "start", energy: 0 });
      }
    } else if (game.state === GameState.RACING) {
      game.stageTimeMs += dt * 1000;
      stepPhysics(car, inp, world, dt);
      game.recorder?.record(game.stageTimeMs, inp, car);
      damageMod.stepDamage(game.damage, car, dt);
    }

    const proj = world.project(car.pos.x, car.pos.z, game.lastS ?? 0, projScratch);
    game.lastS = proj.s;
    world.surfaceAt(car.pos.x, car.pos.z, surfScratch);

    if (game.state === GameState.RACING) {
      game.noteRunner.update(proj.s, car.forwardSpeed, dt);
      checkSplits(proj.s, stage);
      if (proj.s >= stage.finish.s) finishStage();
      if (game.damage.retired) retire(game.damage.retiredReason);
    }
  }

  function stepPhysics(car, inp, world, dt) {
    physics.stepCar(car, inp, world, dt);
    const impacts = car.impacts;
    if (impacts && impacts.length) {
      for (const hit of impacts) {
        damageMod.applyImpact(game.damage, car, hit);
        audio.impact?.(hit);
        renderer.impactEffect?.(hit);
      }
      impacts.length = 0;
    }
  }

  function checkSplits(s, stage) {
    while (game.splitIndex < stage.splits.length && s >= stage.splits[game.splitIndex]) {
      const t = game.stageTimeMs;
      game.splitTimes.push(t);
      const best = career.splitRecord?.(stage.id, game.splitIndex);
      frame.splitDeltaMs = best == null ? null : t - best;
      frame.lastSplitMs = t;
      hud.toast?.(`Split ${game.splitIndex + 1}`);
      game.splitIndex += 1;
    }
  }

  function finishStage() {
    game.state = GameState.FINISHED;
    const result = career.recordStage?.({
      stageId: game.stage.id,
      carId: game.car.spec.id,
      timeMs: game.stageTimeMs,
      splits: game.splitTimes.slice(),
      damage: damageMod.damageReport(game.damage),
      replay: game.recorder?.finish?.(),
    }) ?? { timeMs: game.stageTimeMs };
    game.lastResult = result;
    hud.finish?.(result);
    audio.setMuted?.(false);
    ui.show("results", result);
  }

  function retire(reason) {
    game.state = GameState.RETIRED;
    ui.show("retired", { reason, timeMs: game.stageTimeMs });
  }

  function buildFrame() {
    const car = game.car;
    if (!car) return frame;
    const t = physics.carTelemetry(car);
    frame.speedKph = car.speed * 3.6;
    frame.gear = car.gear;
    frame.rpm = car.engineRpm;
    frame.rpmLimit = car.spec.engine.limitRpm;
    frame.turbo = car.turboBoost;
    frame.throttle = car.input.throttle;
    frame.brake = car.input.brake;
    frame.handbrake = car.input.handbrake;
    frame.steer = car.input.steer;
    frame.distance = game.lastS ?? 0;
    frame.stageLength = game.stage?.length ?? 0;
    frame.timeMs = game.stageTimeMs;
    frame.pacenote = game.noteRunner?.current ?? null;
    frame.nextPacenote = game.noteRunner?.pending?.[0] ?? null;
    frame.surfaceName = surfScratch.props.name;
    frame.damage = damageMod.damageReport(game.damage);
    frame.weather = game.weather?.current ?? null;
    frame.positionPct = frame.stageLength > 0 ? saturate(frame.distance / frame.stageLength) : 0;
    frame.gripUsed = t.gripUsed ?? 0;
    frame.telemetry = t;
    frame.airborne = car.onGround === 0;
    frame.countdown = game.state === GameState.COUNTDOWN ? Math.ceil(game.countdown) : 0;
    frame.ghostDeltaMs = game.ghost?.deltaAt?.(frame.distance, frame.timeMs) ?? null;
    return frame;
  }

  let accumulator = 0;
  let last = performance.now();
  let rafId = 0;

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    const raw = (now - last) / 1000;
    last = now;
    const dt = clamp(raw, 0, MAX_FRAME_DT);

    const running = game.state === GameState.RACING
      || game.state === GameState.COUNTDOWN
      || game.state === GameState.FINISHED;

    if (running) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= PHYSICS_DT && steps < MAX_STEPS_PER_FRAME) {
        stepRace(PHYSICS_DT);
        accumulator -= PHYSICS_DT;
        steps += 1;
      }
      // A frame that could not keep up drops the backlog rather than carrying it,
      // otherwise a single long GC pause turns into seconds of fast-forward.
      if (steps >= MAX_STEPS_PER_FRAME) accumulator = 0;
    }

    if (game.weather) weatherMod.stepWeather(game.weather, renderer.camera, dt);
    if (game.stage) {
      renderer.update({
        car: game.car,
        stage: game.stage,
        weather: game.weather,
        ghost: game.ghost,
        alpha: accumulator / PHYSICS_DT,
        state: game.state,
        surface: surfScratch,
      }, dt);
      audio.update?.(game.car, dt, { surface: surfScratch, camera: renderer.cameraMode });
      hud.update(buildFrame());
    } else {
      renderer.updateIdle?.(dt);
    }
  }

  function nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  window.addEventListener("resize", () => renderer.resize?.());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === GameState.RACING) setPaused(true);
    // A backgrounded tab stops firing rAF; without this the first frame back
    // would carry a several-second dt into the accumulator.
    last = performance.now();
    accumulator = 0;
  });

  progress("Ready", 1);
  toMenu();
  rafId = requestAnimationFrame(loop);

  return {
    game,
    beginStage,
    toMenu,
    setPaused,
    get state() { return game.state; },
    destroy() {
      cancelAnimationFrame(rafId);
      input.destroy();
      audio.dispose?.();
      renderer.dispose?.();
      hud.destroy?.();
      ui.destroy?.();
    },
  };
}
