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
const MAX_FRAME_DT = 0.25;
// The clamp on frame dt is the real backlog limit; the step cap only has to be
// big enough to honour it. Setting it lower silently caps how much time a slow
// frame may simulate, which shows up as the whole game running in slow motion
// on a weak GPU rather than merely dropping frames.
const MAX_STEPS_PER_FRAME = Math.ceil(MAX_FRAME_DT / PHYSICS_DT);

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
    meshes, renderMod, hudMod, uiMod, careerMod, replayMod, championshipMod,
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
    import("./championship.js"),
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
    mode: "quick",
    pendingChoice: null,
    championshipSubmission: null,
    paused: false,
  };

  // ui.js renders from its `data` record. Keep that record tied to the stage and
  // car catalogues the simulator can actually build, and cache the generated
  // recce stage because menu refreshes should not regenerate twelve kilometres
  // of road.
  const STAGE_CARDS = stageMod.STAGE_BOOK.map((def) => ({
    id: def.id,
    name: def.name,
    country: def.country,
    rally: def.rally,
    surface: def.params && def.params.surface !== undefined ? [def.params.surface] : [],
    label: def.surfaceLabel,
  }));

  let menuStageId = stageMod.STAGE_BOOK[0].id;
  let menuStage = null;
  let menuCarId = physics.CARS[0].id;

  function menuStageFor(id) {
    if (!menuStage || menuStage.id !== id) menuStage = stageMod.stageFromBook(id);
    return menuStage;
  }

  function weatherCard(def) {
    let preset = null;
    try {
      preset = weatherMod.presetById(def.weather);
    } catch {
      preset = null;
    }
    return {
      name: preset ? preset.name : "Clear",
      temperature: preset ? preset.temperature : 12,
      wetness: preset ? preset.roadWetness : 0,
      wind: preset ? preset.windSpeed : 0,
      timeOfDay: def.timeOfDay ?? "—",
    };
  }

  function menuData(overrides) {
    const def = stageMod.STAGE_BOOK.find((entry) => entry.id === menuStageId)
      ?? stageMod.STAGE_BOOK[0];
    return {
      championship: championshipMod.championshipData(career, careerMod.RALLIES),
      championshipAvailable: true,
      profile: career.summary?.(),
      stage: menuStageFor(def.id),
      stages: STAGE_CARDS,
      cars: physics.CARS,
      classes: physics.CAR_CLASSES,
      selectedCarId: menuCarId,
      weather: weatherCard(def),
      personalBest: null,
      rivals: [],
      ...(overrides || {}),
    };
  }

  const idOf = (value) => (typeof value === "string" ? value : (value && value.id) || null);

  function showStageScreen(stageId) {
    const id = idOf(stageId);
    if (id && stageMod.STAGE_BOOK.some((def) => def.id === id)) menuStageId = id;
    game.pendingChoice = null;
    screen("stage", menuData());
  }

  function showChampionship() {
    const season = career.state.season;
    if (!season) career.newSeason();
    else if (season.finished) {
      showSeason();
      return;
    }
    game.pendingChoice = null;
    screen("championship", menuData());
  }

  function showChampionshipStage() {
    const ctx = career.currentStage?.();
    const choice = championshipMod.championshipChoice(
      ctx, career.state.season, stageMod.STAGE_BOOK, physics.CARS,
    );
    if (!ctx || !choice) {
      showChampionship();
      return;
    }
    const playable = stageMod.stageFromBook(choice.stageId, {
      seed: choice.seed,
      reverse: choice.reverse,
    });
    const preset = weatherMod.presetById(choice.weather);
    game.pendingChoice = choice;
    screen("stage", menuData({
      stage: {
        ...playable,
        name: ctx.stage.name,
        country: ctx.event.country,
        notes: `${ctx.event.name} · ${ctx.leg.name}. Playable route: ${playable.name}.`,
      },
      weather: {
        name: preset.name,
        temperature: preset.temperature,
        wetness: preset.roadWetness,
        wind: preset.windSpeed,
        timeOfDay: ctx.stage.night ? "night" : "day",
      },
      personalBest: ctx.recordMs,
      rivals: [],
    }));
  }

  function showSeason() {
    screen("season", championshipMod.seasonData({ standings: career.standings?.() ?? [] }));
  }

  let championshipRepairChoices = [];
  function showService() {
    const data = championshipMod.serviceData(game.championshipSubmission?.service);
    championshipRepairChoices = data.repairChoices.slice();
    screen("service", data);
  }

  function showCarScreen() {
    screen("car", menuData());
  }

  // Menu buttons emit a bare id, while beginStage consumes a complete choice.
  function menuChoice(value) {
    if (game.pendingChoice?.mode === "championship") return { ...game.pendingChoice };
    const id = idOf(value);
    return {
      stageId: (id && stageMod.STAGE_BOOK.some((def) => def.id === id)) ? id : menuStageId,
      carId: menuCarId,
    };
  }

  const ui = uiMod.createUi(opts.uiRoot, {
    career,
    cars: physics.CARS,
    carClasses: physics.CAR_CLASSES,
    stageBook: stageMod.STAGE_BOOK,
    settings,
    data: menuData(),
    onStart: (choice) => beginStage(menuChoice(choice)),
    onQuickStage: () => showStageScreen(),
    onTimeTrial: () => showStageScreen(),
    onSelectStage: (value, action) => {
      if (action === "openStage") showChampionshipStage();
      else showStageScreen(value);
    },
    onGarage: () => showCarScreen(),
    onOpenCar: () => showCarScreen(),
    onBack: () => toMenu(),
    onTitle: () => toMenu(),
    onRestartStage: () => beginStage(menuChoice(game.lastChoice)),
    onRepeatNote: () => game.noteRunner?.repeat?.(),
    onNextStage: () => {
      if (game.mode === "championship") {
        if (game.championshipSubmission?.service) showService();
        else if (game.championshipSubmission?.seasonFinished) showSeason();
        else showChampionshipStage();
        return;
      }
      const book = stageMod.STAGE_BOOK;
      const at = book.findIndex((def) => def.id === menuStageId);
      menuStageId = book[(at < 0 ? 0 : at + 1) % book.length].id;
      showStageScreen();
    },
    onConfirmRepairs: () => {
      career.applyService?.(championshipRepairChoices);
      showChampionshipStage();
    },
    onReplay: () => toMenu(),
    onContinue: () => showChampionship(),
    onNewSeason: () => { career.newSeason(); showChampionship(); },
    onChampionship: () => showChampionship(),
    onSelectEvent: (eventId) => {
      const season = career.state.season;
      if (season?.calendar?.[season.cursor.event] === eventId) showChampionshipStage();
    },
    onSelectCar: (value, action) => {
      const id = idOf(value);
      if (id && physics.CARS.some((car) => car.id === id)) menuCarId = id;
      if (action === "confirmCar") showStageScreen();
      else showCarScreen();
    },
    onSettingsChange: (patch) => applySettings(patch),
    onRepair: (change) => {
      if (Array.isArray(change)) championshipRepairChoices = change.slice();
      else if (change?.chosen) championshipRepairChoices = change.chosen.slice();
    },
    onQuit: () => retire("Retired by crew"),
    onResume: () => setPaused(false),
    onRestart: () => beginStage(game.lastChoice),
  });

  // ui.js draws a full-screen menu surface and knows nothing about racing, so
  // "show the road" is not one of its screens — it is the absence of one. This
  // adapter is the only place that translates the game's states into its.
  function screen(name, data) {
    const el = ui.element;
    // The driving controls belong to the road, not to the menus: leaving them up
    // over a pause screen puts a throttle pedal under the Resume button.
    touch?.setVisible?.(name === null);
    if (name === null) {
      el?.classList.add("or-hidden");
      return;
    }
    el?.classList.remove("or-hidden");
    ui.show(name, data);
  }

  input.onAction((action, down) => {
    if (!down) return;
    if (action === "pause") togglePause();
    if (action === "camera") renderer.cycleCamera?.();
    if (action === "reset") requestRecovery();
    if (action === "repeatNote") game.noteRunner?.repeat?.();
    if (action === "headlights") renderer.toggleHeadlights?.();
  });

  // On-screen driving controls, loaded separately and optional: a desktop player
  // never needs them, and a failure to load them must cost a phone its controls
  // rather than cost everyone the game.
  //
  // Only fetched where they can actually be used. A mouse-and-keyboard machine
  // asking for a module it will never mount is a wasted round trip and a 404 in
  // the console if the file is not there.
  const wantsTouch = opts.forceTouch
    || (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0)
    || (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);
  let touch = null;
  if (opts.touchRoot && wantsTouch) {
    try {
      const touchMod = await import("./touch.js");
      touch = touchMod.createTouchControls(opts.touchRoot, {
        input,
        settings,
        onAction: (action) => {
          if (action === "pause") togglePause();
          if (action === "camera") renderer.cycleCamera?.();
          if (action === "reset") requestRecovery();
          if (action === "repeatNote") game.noteRunner?.repeat?.();
        },
      });
    } catch (err) {
      // Not fatal, and not silent either.
      console.warn("touch controls unavailable:", err?.message ?? err);
    }
  }

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
      // Someone who opens the page and holds the throttle has to accelerate.
      // The sim preset leaves the gearbox fully manual, which pins first gear
      // and reads as a broken game rather than as a deliberate difficulty, so
      // the default is the assisted set and the settings screen turns each
      // assist off individually.
      assistPreset: "arcade",
      assists: {
        autoShift: true, autoClutch: true, abs: true,
        tractionControl: 0.35, stability: 0.30,
        steerAssist: 0.35, speedSensitiveSteer: true,
      },
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
    game.mode = choice.mode === "championship" ? "championship" : "quick";
    game.championshipSubmission = null;
    game.state = GameState.LOADING;
    screen("loading", { stage: choice.stageId });
    await nextFrame();

    const def = stageMod.STAGE_BOOK.find((s) => s.id === choice.stageId)
      ?? stageMod.STAGE_BOOK[0];
    const stage = stageMod.stageFromBook(def.id, {
      reverse: !!choice.reverse,
      ...(choice.seed ? { seed: choice.seed } : {}),
    });
    const world = stageMod.stageWorld(stage);

    const weather = weatherMod.createWeather(THREE, renderer.scene, choice.weather ?? def.weather);
    const carSpec = physics.CARS.find((entry) => entry.id === choice.carId) ?? physics.CARS[0];
    const damage = damageMod.createDamage({
      drive: carSpec.drive === "4WD" ? "awd" : carSpec.drive.toLowerCase(),
    });
    if (game.mode === "championship") {
      championshipMod.applyCareerCondition(
        damage,
        career.state.season?.condition,
        damageMod.setComponentHealth,
      );
    }
    const car = physics.createCar(choice.carId, {
      preset: settings.assistPreset,
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
    game.speedProfile = stageMod.speedProfile(stage);
    game.recorder = replayMod.createRecorder({
      meta: { stageId: stage.id, carId: car.spec.id, weatherKey: weather.current?.id ?? "" },
      capacityMetres: stage.length + 500,
    });
    // The reference to beat is whatever this car has already done here in these
    // conditions — a ghost from a different car on a different surface would be
    // a number, not information.
    const recordStageId = choice.careerStageId ?? stage.id;
    const recordCarId = choice.careerCarId ?? car.spec.id;
    const recordWeatherKey = choice.careerWeatherKey ?? weather.current?.id ?? "clear";
    game.best = career.bestFor?.(recordStageId, recordCarId, recordWeatherKey) ?? null;
    const ghostRun = choice.ghost ?? career.ghostFor?.(recordStageId, {
      carId: recordCarId, weatherKey: recordWeatherKey,
    });
    game.ghost = ghostRun ? replayMod.createGhost(ghostRun) : null;
    game.stageTimeMs = 0;
    game.splitIndex = 0;
    game.splitTimes = [];
    game.countdown = 5;

    screen(null);
    hud.countdown?.(5);
    game.state = GameState.COUNTDOWN;
  }

  function toMenu() {
    game.state = GameState.MENU;
    renderer.clearStage?.();
    screen("title", menuData({
      rallyCount: new Set(stageMod.STAGE_BOOK.map((s) => s.rally ?? s.id.split("-")[0])).size,
    }));
  }

  function togglePause() {
    if (game.state === GameState.RACING) setPaused(true);
    else if (game.state === GameState.PAUSED) setPaused(false);
  }

  function setPaused(on) {
    if (on) {
      game.state = GameState.PAUSED;
      audio.setMuted?.(true);
      screen("pause");
    } else {
      game.state = GameState.RACING;
      audio.setMuted?.(false);
      screen(null);
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

  let goTimer = 0;

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

  // A pure-pursuit driver that can take the car round a stage on its own. It
  // exists because a screenshot of a car that was teleported onto the road and
  // left to free-run is a screenshot of a field a hundred metres later, and
  // nobody can judge how a game looks from pictures of grass. It doubles as an
  // attract-mode demo.
  //
  // Deliberately not a fast driver: it runs at a fraction of the limit curve and
  // it knows how to get back on the road, because the question it answers is
  // "can this road be driven", not "can it be driven flat".
  const autoInput = makeInput();
  const autoProj = { s: 0, lateral: 0, signedLateral: 0, index: 0 };
  const autoState = { stuck: 0, bestS: 0, recovering: 0 };

  function driveAutomatically(car, dt) {
    const stage = game.stage;
    const world = game.world;
    if (!stage || !world) return autoInput;

    world.project(car.pos.x, car.pos.z, autoProj.s, autoProj);
    const halfWidth = stage.halfWidth[autoProj.index] ?? 4;
    const offRoad = autoProj.lateral > halfWidth;

    // Look further ahead the faster you go, and much closer when recovering, so
    // the nose is pointed at the road rather than down it.
    const lead = offRoad
      ? 10
      : clamp(9 + car.speed * 0.55, 12, 48);
    const i = world.sampleAt(Math.min(stage.length - 1, autoProj.s + lead));
    const err = Math.atan2(
      Math.sin(Math.atan2(stage.x[i] - car.pos.x, stage.z[i] - car.pos.z) - car.yaw),
      Math.cos(Math.atan2(stage.x[i] - car.pos.x, stage.z[i] - car.pos.z) - car.yaw),
    );

    // Positive steer points the wheels LEFT and yields a NEGATIVE yaw rate, so
    // both terms are inverted against the obvious form.
    autoInput.steer = clamp(-err * (offRoad ? 2.2 : 1.5) + car.yawRate * 0.28, -1, 1);

    const profile = game.speedProfile;
    const limit = profile ? profile[world.sampleAt(Math.min(stage.length - 1, autoProj.s + 25))] : 25;
    // Off the road, crawl: the verge is not a place to carry speed, and trying
    // to is how a recovery becomes a roll.
    const target = offRoad ? Math.min(11, limit) : (limit ?? 25) * (game.autoPace ?? 0.72);
    const over = car.speed - target;
    autoInput.throttle = over < 0 ? clamp(-over * 0.45, 0, 1) : 0;
    autoInput.brake = over > 0 ? clamp(over * 0.30, 0, 1) : 0;
    autoInput.handbrake = 0;

    if (autoProj.s > autoState.bestS + 1) {
      autoState.bestS = autoProj.s;
      autoState.stuck = 0;
    } else {
      autoState.stuck += dt;
    }
    // Beached. Give it everything, and if that does not work the road is at
    // fault, not the driver.
    if (autoState.stuck > 1.5 && car.speed < 3) {
      autoInput.throttle = 1;
      autoInput.brake = 0;
    }
    return autoInput;
  }

  function stepRace(dt) {
    const car = game.car;
    const world = game.world;
    const stage = game.stage;
    const inp = game.autoDrive
      ? driveAutomatically(car, dt)
      : input.update(dt, car.speed);

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
        // countdown(0) is the green "GO" flash, not a dismissal — only a null
        // clears the light gantry, so without this the lights stay lit across
        // the whole stage.
        hud.countdown?.(0);
        clearTimeout(goTimer);
        goTimer = setTimeout(() => hud.countdown?.(null), 1200);
        audio.impact?.({ kind: "start", energy: 0 });
      }
    } else if (game.state === GameState.RACING) {
      game.stageTimeMs += dt * 1000;
      stepPhysics(car, inp, world, dt);
      game.recorder?.sample(game.stageTimeMs / 1000, inp, car);
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
      const best = game.best?.bestSplits?.[game.splitIndex];
      frame.splitDeltaMs = best == null ? null : t - best;
      frame.lastSplitMs = t;
      hud.toast?.(`Split ${game.splitIndex + 1}`);
      game.splitIndex += 1;
    }
  }

  function finishStage() {
    game.state = GameState.FINISHED;
    const report = damageMod.damageReport(game.damage);
    const run = {
      timeMs: game.stageTimeMs,
      splits: game.splitTimes.slice(),
      cleanRun: !report.some((row) => row.damaged),
      run: game.recorder?.finish?.(),
    };
    if (game.mode === "championship") {
      const submission = career.submitStage?.({
        ...run,
        damage: championshipMod.careerDamage(report),
      });
      game.championshipSubmission = submission;
      game.lastResult = submission;
      hud.finish?.({ timeMs: game.stageTimeMs });
      audio.setMuted?.(false);
      screen("results", championshipMod.resultData(submission, run));
      return;
    }
    const result = career.recordStage?.({
      stageId: game.stage.id,
      carId: game.car.spec.id,
      weatherKey: game.weather?.current?.id ?? "clear",
      ...run,
      damage: report,
    }) ?? { timeMs: game.stageTimeMs };
    game.lastResult = result;
    hud.finish?.(result);
    audio.setMuted?.(false);
    screen("results", {
      results: {
        stageName: game.stage.name,
        totalMs: game.stageTimeMs,
        position: 1,
        splits: game.splitTimes.map((timeMs, index) => ({
          label: `Split ${index + 1}`, timeMs, deltaMs: null,
        })),
        penaltiesMs: 0,
        cleanRun: run.cleanRun,
      },
      hasNextStage: true,
      hasReplay: false,
      canRetry: true,
    });
  }

  function retire(reason) {
    if (game.state !== GameState.RACING && game.state !== GameState.PAUSED
      && game.state !== GameState.COUNTDOWN) return;
    game.state = GameState.RETIRED;
    audio.setMuted?.(false);
    if (game.mode === "championship") {
      const run = {
        retired: true,
        reason,
        timeMs: game.stageTimeMs,
        splits: game.splitTimes.slice(),
      };
      const submission = career.submitStage?.({
        ...run,
        damage: championshipMod.careerDamage(damageMod.damageReport(game.damage)),
      });
      game.championshipSubmission = submission;
      game.lastResult = submission;
      screen("results", championshipMod.resultData(submission, run));
      return;
    }
    screen("results", {
      results: {
        stageName: game.stage?.name,
        totalMs: game.stageTimeMs,
        position: null,
        splits: [],
        penaltiesMs: 0,
        cleanRun: false,
        retired: true,
        reason,
      },
      hasNextStage: true,
      hasReplay: false,
      canRetry: true,
    });
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
    if (game.ghost?.valid) {
      game.ghost.update(frame.distance, frame.timeMs);
      frame.ghostDeltaMs = game.ghost.deltaMs;
    } else {
      frame.ghostDeltaMs = null;
    }
    return frame;
  }

  let accumulator = 0;
  let last = performance.now();
  let rafId = 0;
  let captureHold = false;

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    const raw = (now - last) / 1000;
    last = now;
    const dt = clamp(raw, 0, MAX_FRAME_DT);

    const running = !captureHold && (game.state === GameState.RACING
      || game.state === GameState.COUNTDOWN
      || game.state === GameState.FINISHED);

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

  // A scripted-drive surface, so the browser test and the screenshot tool can
  // put the game in a specific place — a named stage in a named weather, the car
  // half way along, a chosen camera — instead of trying to drive there by hand
  // under a software GL stack at four frames a second.
  const harness = {
    get ready() { return true; },
    get state() { return game.state; },
    get frame() { return buildFrame(); },
    async drive(choice) {
      captureHold = false;
      await beginStage({
        mode: choice.mode,
        stageId: choice.stageId ?? stageMod.STAGE_BOOK[0].id,
        carId: choice.carId ?? physics.CARS[0].id,
        weather: choice.weather,
        seed: choice.seed,
        reverse: !!choice.reverse,
      });
      if (choice.skipCountdown !== false) {
        game.countdown = 0;
        game.state = GameState.RACING;
        // Clearing the countdown by hand would leave the HUD's start lights lit
        // for the rest of the stage, which is exactly the sort of thing a
        // screenshot review then reports as a rendering bug.
        hud.countdown?.(null);
      }
      return true;
    },
    // Teleports to an arc length and sets a speed along the road, which is how
    // the screenshot tool reaches a jump or a hairpin without a lucky lap.
    placeAt(distance, speedKph = 0) {
      if (!game.stage) return false;
      const st = game.stage;
      const i = clamp(st.world?.sampleAt?.(distance) ?? game.world.sampleAt(distance), 0, st.count - 1);
      const yaw = Math.atan2(st.tx[i], st.tz[i]);
      physics.resetCar(game.car, st.x[i], st.y[i] + 0.35, st.z[i], yaw);
      const v = speedKph / 3.6;
      game.car.vel.x = st.tx[i] * v;
      game.car.vel.y = 0;
      game.car.vel.z = st.tz[i] * v;
      game.lastS = distance;
      game.stageTimeMs = 0;
      return true;
    },
    setCamera(mode) { renderer.setCamera?.(mode); },
    // Chrome can take longer than a jump's airtime to encode a screenshot.
    // Hold physics without opening the pause overlay so the captured pixels and
    // the manifest describe the same exact racing frame.
    holdForCapture(on) {
      captureHold = !!on;
      accumulator = 0;
      return captureHold;
    },
    // Hand the car to the pure-pursuit driver. The screenshot tool uses this so
    // it photographs a car that is driving the stage rather than one abandoned
    // mid-field, and it is the same code path an attract mode would use.
    setAutoDrive(on, pace) {
      game.autoDrive = !!on;
      if (pace) game.autoPace = pace;
      autoState.stuck = 0;
      autoState.bestS = game.lastS ?? 0;
      if (!on) input.clearTouch();
      return true;
    },
    setWeather(preset) {
      if (!game.weather) return false;
      weatherMod.setWeather(game.weather, preset);
      return true;
    },
    hold(keys, ms) {
      // The screenshot tool wants "throttle for two seconds" without owning the
      // key dispatch; this drives the same input record a real key would.
      const patch = {};
      if (keys.includes("throttle")) patch.throttle = 1;
      if (keys.includes("brake")) patch.brake = 1;
      if (keys.includes("left")) patch.steer = 1;
      if (keys.includes("right")) patch.steer = -1;
      if (keys.includes("handbrake")) patch.handbrake = 1;
      input.setTouch({ steer: 0, throttle: 0, brake: 0, handbrake: 0, ...patch });
      return new Promise((r) => setTimeout(() => { input.clearTouch(); r(true); }, ms));
    },
    stageInfo() {
      const st = game.stage;
      if (!st) return null;
      return {
        id: st.id, name: st.name, country: st.country,
        length: st.length, count: st.count,
        scenery: st.scenery?.length ?? 0, props: st.props?.length ?? 0,
      };
    },
    championshipInfo() {
      const season = career.state.season;
      const ctx = career.currentStage?.();
      const currentEvent = season?.events?.[season.cursor.event];
      const submitted = game.championshipSubmission;
      const submittedState = submitted
        ? season?.events?.find((event) => event.id === submitted.event.id)?.results?.[submitted.stage.id]
        : null;
      return {
        hasSeason: !!season,
        seed: season?.seed ?? null,
        cursor: season ? { ...season.cursor } : null,
        finished: !!season?.finished,
        careerStageId: ctx?.stage?.id ?? null,
        playableStageId: game.stage?.id ?? game.pendingChoice?.stageId ?? null,
        submittedStageId: submitted?.stage?.id ?? null,
        playerResult: submittedState?.entries?.find((entry) => entry.driverId === "player") ?? null,
        serviceDue: !!submitted?.service,
        currentEventDone: !!currentEvent?.done,
      };
    },
    submitStage(result = {}) {
      if (!game.stage || game.mode !== "championship") return false;
      game.stageTimeMs = Number(result.timeMs) || game.stageTimeMs || 1;
      game.splitTimes = Array.isArray(result.splits) ? result.splits.slice() : [];
      game.state = GameState.RACING;
      if (result.retired) retire(result.reason ?? "Retired");
      else finishStage();
      return true;
    },
  };
  window.__opusRally = harness;

  return {
    game,
    harness,
    beginStage,
    toMenu,
    setPaused,
    get state() { return game.state; },
    destroy() {
      cancelAnimationFrame(rafId);
      clearTimeout(goTimer);
      input.destroy();
      audio.dispose?.();
      renderer.dispose?.();
      hud.destroy?.();
      ui.destroy?.();
      touch?.destroy?.();
    },
  };
}
