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
  // The title screen runs the game behind itself: a stage in the renderer with
  // the pure-pursuit driver at the wheel. It is a racing state with no clock.
  ATTRACT: "attract",
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

  // ---- the menu's content and its wiring
  //
  // ui.js seeds its own state from demoData(): an invented "Opus Trophy", five
  // fictional events and an S-shaped recce map. The shell reads its screens out
  // of `data` and reads none of the options it is handed, so everything below
  // exists to replace those fixtures with what the game actually holds.
  //
  // Every button is an action string and emit() drops an action with no host
  // hook SILENTLY — no error, no state change. That is how the entire main menu
  // came to be dead except "How to drive". validate-static.mjs now checks that
  // every action has a hook and browser.test.mjs clicks its way to a stage.

  const STAGE_CARDS = stageMod.STAGE_BOOK.map((d) => ({
    id: d.id,
    name: d.name,
    country: d.country,
    rally: d.rally,
    surface: d.params && d.params.surface !== undefined ? [d.params.surface] : [],
    label: d.surfaceLabel,
  }));

  // ui.js's car screen wants classId, drivetrain, powerKw, gearCount, topSpeedKph
  // and a torque curve. physics.js calls those class, drive, engine.torque and
  // gearbox.ratios, and carries neither power nor top speed at all. Handing over
  // the raw specs left `c.classId === activeClass` false for every car, so the
  // Garage filtered its own list away: buildCarModel() over physics.CARS returns
  // k-cars with 0 items and an empty spec table, over these cards it returns 2
  // for the junior class and seven populated spec rows.
  const CAR_CARDS = physics.CARS.map((spec) => {
    const curve = spec.engine?.torque ?? [];
    let peakKw = 0;
    for (const [rpm, nm] of curve) peakKw = Math.max(peakKw, uiMod.powerKw(nm, rpm));
    const ratios = spec.gearbox?.ratios ?? [];
    const topGear = ratios[ratios.length - 1] ?? 1;
    // Geared top speed at the limiter, which is the only top speed the spec
    // actually implies — there is no drag solve here and none is claimed.
    const topSpeedKph = (spec.engine.limiterRpm * Math.PI * 2 / 60)
      / (topGear * spec.gearbox.final) * spec.wheelRadius * 3.6;
    return {
      id: spec.id,
      classId: spec.class,
      name: spec.name,
      maker: spec.team,
      drivetrain: String(spec.drive ?? "").toLowerCase(),
      mass: spec.mass,
      powerKw: peakKw,
      gearCount: ratios.length,
      topSpeedKph,
      torqueCurve: curve.map(([rpm, nm]) => [rpm, nm]),
      blurb: spec.blurb ?? "",
    };
  });

  // "quick" drives whatever the stage list has selected; "career" drives whatever
  // the championship's cursor is on. The mode is what makes one Start button, one
  // stage screen and one results screen serve both.
  let menuMode = "quick";
  let menuStageId = stageMod.STAGE_BOOK[0].id;
  let menuStage = null;
  let menuCarId = physics.CARS[0].id;
  let careerPendingService = false;
  let careerPendingSeason = null;

  // The recce map on the menu is the generated stage, not a sketch of one: the
  // same stageFromBook() call beginStage makes, so the shape you study is the
  // road you drive. Cached, because generating a 12 km stage is not free and the
  // menu re-renders on every keypress.
  function menuStageFor(id) {
    if (!menuStage || menuStage.id !== id) menuStage = stageMod.stageFromBook(id);
    return menuStage;
  }

  // Null unless a championship is running AND the menu is in career mode, so the
  // quick-stage screens never accidentally read the season's cursor.
  function careerStage() {
    if (menuMode !== "career") return null;
    return career.currentStage?.() ?? null;
  }

  // presetById throws on an unknown id, which is right for a programming error
  // and wrong on a menu: one mistyped datum in the stage book should cost that
  // stage its weather line, not take the menu down.
  function weatherCard(presetId, timeOfDay) {
    let preset = null;
    try {
      preset = weatherMod.presetById(presetId);
    } catch {
      preset = null;
    }
    return {
      name: preset ? preset.name : "Clear",
      temperature: preset ? preset.temperature : 12,
      wetness: preset ? preset.roadWetness : 0,
      wind: preset ? preset.windSpeed : 0,
      timeOfDay: timeOfDay ?? "—",
    };
  }

  function menuData(over) {
    const ctx = careerStage();
    const bookId = ctx?.stage?.book ?? menuStageId;
    const def = stageMod.STAGE_BOOK.find((d) => d.id === bookId) ?? stageMod.STAGE_BOOK[0];
    const champ = career.championship?.() ?? null;
    return {
      championship: champ,
      stage: menuStageFor(def.id),
      stages: STAGE_CARDS,
      cars: CAR_CARDS,
      classes: physics.CAR_CLASSES,
      selectedCarId: menuCarId,
      profile: { name: career.state?.profile?.name, team: career.state?.profile?.team },
      weather: ctx
        ? { ...weatherCard(ctx.conditions.preset, ctx.stage.night ? "Night" : def.timeOfDay), name: ctx.conditions.name }
        : weatherCard(def.weather, def.timeOfDay),
      // In career mode the stage card is the championship's: its own name, the
      // field you are about to be measured against, and your record on it.
      careerStage: ctx ? { ...ctx, book: ctx.stage.book } : null,
      nextStage: ctx ? { name: ctx.stage.name, surface: [ctx.stage.surface], conditions: ctx.conditions.name, round: ctx.round, rounds: ctx.rounds } : null,
      personalBest: ctx ? (ctx.recordMs ?? null) : (career.bestAnyFor?.(def.id)?.timeMs ?? null),
      rivals: ctx ? careerRivals(ctx) : [],
      ...(over || {}),
    };
  }

  // The five names the stage screen puts a time against. Preview times before the
  // stage is driven, real ones after.
  function careerRivals(ctx) {
    const rows = career.leaderboard?.(ctx.stage.id) ?? [];
    return rows.filter((r) => r.status === "ok" && !r.isPlayer).slice(0, 5)
      .map((r) => ({ name: r.name, timeMs: r.totalMs }));
  }

  // Menu actions carry either a bare id or an object holding one.
  const idOf = (value) => (typeof value === "string" ? value : (value && value.id) || null);

  function showStageScreen(stageId) {
    const id = idOf(stageId);
    // A book id means the player picked a road off the stage list, which is a
    // quick stage by definition. An event id (or nothing) leaves the mode alone,
    // so the championship's "Go to stage" lands on the championship's stage.
    if (id && stageMod.STAGE_BOOK.some((d) => d.id === id)) {
      menuStageId = id;
      menuMode = "quick";
    }
    // The service park is not optional. Escape from the results screen goes to
    // the title, so without this a player could walk round the one moment in a
    // championship where the damage they carry gets fixed.
    if (menuMode === "career" && careerPendingService) { careerAdvance(); return; }
    screen("stage", menuData());
  }

  function showCarScreen() {
    screen("car", menuData());
  }

  function showChampionship() {
    menuMode = "career";
    if (!career.hasSeason?.()) career.newSeason?.();
    screen("championship", menuData());
  }

  function startSeason() {
    menuMode = "career";
    career.newSeason?.();
    careerPendingService = false;
    careerPendingSeason = null;
    screen("championship", menuData());
  }

  // career.serviceOptions() speaks in component health and minutes; the service
  // screen speaks in damage rows and a repair budget.
  function serviceData() {
    const opt = career.serviceOptions?.();
    if (!opt) return { damage: [], repairBudgetMin: 0, repairChoices: [] };
    return {
      damage: opt.items.filter((i) => i.health < 1).map((i) => ({
        id: i.id,
        part: i.name,
        severity: 1 - i.health,
        repairMin: Math.max(1, Math.round(i.minutes)),
        effect: i.critical ? "Critical — it will not see the end of the leg." : "Worn. It will run, and it will cost you time.",
      })),
      repairBudgetMin: opt.budgetMinutes,
      repairChoices: opt.items.filter((i) => i.critical).map((i) => i.id),
    };
  }

  // What "Next stage" means depends on where the championship now is: the service
  // park between legs, the podium at the end of a season, the next stage card
  // otherwise.
  function careerAdvance() {
    if (careerPendingService) {
      careerPendingService = false;
      screen("service", serviceData());
      return;
    }
    if (careerPendingSeason) {
      const summary = careerPendingSeason;
      careerPendingSeason = null;
      const table = summary.standings ?? [];
      screen("season", {
        season: {
          title: `${career.championship?.()?.name ?? "Championship"} — final`,
          podium: table.slice(0, 3).map((r) => ({
            position: r.position, name: r.name, team: r.team, points: r.points, isPlayer: r.isPlayer,
          })),
          standings: table.map((r) => ({
            position: r.position, name: r.name, team: r.team, points: r.points, isPlayer: r.isPlayer,
          })),
        },
      });
      return;
    }
    menuMode = "career";
    if (career.currentStage?.()) screen("stage", menuData());
    else screen("championship", menuData());
  }

  // The shell's Start button sends the stage id as a bare string; the pause and
  // results screens send nothing at all. beginStage wants { stageId, carId }, so
  // the difference is flattened here rather than inside it.
  function menuChoice(value) {
    const ctx = careerStage();
    if (ctx) {
      return {
        stageId: ctx.stage.book,
        carId: menuCarId,
        weather: ctx.conditions.preset,
        career: true,
        careerStageId: ctx.stage.id,
      };
    }
    const id = idOf(value);
    return {
      stageId: (id && stageMod.STAGE_BOOK.some((d) => d.id === id)) ? id : menuStageId,
      carId: menuCarId,
    };
  }

  const ui = uiMod.createUi(opts.uiRoot, {
    career,
    cars: CAR_CARDS,
    carClasses: physics.CAR_CLASSES,
    stageBook: stageMod.STAGE_BOOK,
    settings,
    data: menuData(),
    onStart: (choice) => beginStage(menuChoice(choice)),
    onQuickStage: () => { menuMode = "quick"; showStageScreen(); },
    onTimeTrial: () => { menuMode = "quick"; showStageScreen(); },
    onSelectStage: (value) => showStageScreen(value),
    onGarage: () => showCarScreen(),
    onOpenCar: () => showCarScreen(),
    onBack: () => toMenu(),
    onTitle: () => toMenu(),
    onRestartStage: () => beginStage(menuChoice(game.lastChoice)),
    onRepeatNote: () => game.noteRunner?.repeat?.(),
    onNextStage: () => {
      if (menuMode === "career") { careerAdvance(); return; }
      const book = stageMod.STAGE_BOOK;
      const at = book.findIndex((d) => d.id === menuStageId);
      menuStageId = book[(at < 0 ? 0 : at + 1) % book.length].id;
      showStageScreen();
    },
    // The chosen repairs live in the shell's own state — the button carries no
    // value — so the third argument, the ui api, is the only way to read them.
    // Without it applyService got an empty list and the service park was theatre.
    onConfirmRepairs: (_value, _action, api) => {
      career.applyService?.(api?.getData?.().repairChoices ?? []);
      careerAdvance();
    },
    onRepair: () => {},
    // Replay PLAYBACK does not exist yet: game.js records a run and builds a
    // ghost from it, but nothing plays one back through the renderer. The
    // results screen keeps the button disabled via hasReplay:false, so this hook
    // is only here so the wiring check can see the action is accounted for — if
    // it ever fires, returning to the menu beats doing nothing silently.
    onReplay: () => toMenu(),
    onContinue: () => showChampionship(),
    onNewSeason: () => startSeason(),
    onChampionship: () => showChampionship(),
    // The season is driven in order, so an event chip is a way to look at the
    // calendar rather than a way to jump about in it.
    onSelectEvent: () => showChampionship(),
    onSelectCar: (value, action) => {
      const id = idOf(value);
      if (id && physics.CARS.some((c) => c.id === id)) menuCarId = id;
      // selectCar moves the highlight and stays; confirmCar is the way out.
      if (action === "confirmCar") showStageScreen();
      else showCarScreen();
    },
    onSettingsChange: (patch) => applySettings(patch),
    onQuit: () => toMenu(),
    onResume: () => setPaused(false),
    onRestart: () => beginStage(game.lastChoice),
  });

  // ui.js draws a full-screen menu surface and knows nothing about racing, so
  // "show the road" is not one of its screens — it is the absence of one. This
  // adapter is the only place that translates the game's states into its.
  // Which shell screen is up, or null for the road. The attract build lands a
  // second or so after boot and used to repaint the title unconditionally, which
  // threw a player who had already pressed "New championship" straight back out
  // of it.
  let menuScreen = null;

  function screen(name, data) {
    const el = ui.element;
    menuScreen = name;
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
        // The controls and the HUD are separate roots with separate stylesheets,
        // so neither can measure the other. This is the only channel between
        // them, and without it the pedals sit on the speedometer.
        onLayout: (_layout, reserve) => hud.setControlReserve?.(reserve),
      });
      applyTouchSettings();
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
      touchControls: true,
      touchSteerMode: "Slider",
      touchSteerCurve: 1.4,
      touchTiltRange: 26,
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
    applyTouchSettings();
  }

  // touch.js owns its own defaults; this only ever hands it what the player
  // changed. Split out because it has to run once at boot as well — a mode
  // chosen last session is no use if it is only read on the next edit.
  function applyTouchSettings() {
    if (!touch) return;
    touch.setEnabled?.(settings.touchControls !== false);
    touch.setSteerMode?.(/tilt/i.test(String(settings.touchSteerMode ?? "")) ? "tilt" : "slider");
    touch.configure?.({
      steerGamma: Number(settings.touchSteerCurve),
      tiltRange: Number(settings.touchTiltRange),
    });
  }

  // Stage builds are serialised through one promise chain. The attract stage and
  // a harness drive() arriving in the same frame would otherwise call
  // renderer.buildStage twice over on the same renderer; the token is what lets a
  // real stage cancel an attract build that has not started yet.
  let stageChain = Promise.resolve();
  let stageToken = 0;

  function queueStage(fn) {
    const run = () => fn();
    stageChain = stageChain.then(run, run);
    return stageChain;
  }

  function beginStage(choice) {
    stageToken += 1;
    return queueStage(() => buildStage(choice));
  }

  async function buildStage(choice) {
    game.lastChoice = choice;
    if (!choice.attract) {
      game.state = GameState.LOADING;
      screen("loading", { stage: choice.stageId });
      await nextFrame();
    }

    const def = stageMod.STAGE_BOOK.find((s) => s.id === choice.stageId)
      ?? stageMod.STAGE_BOOK[0];
    // `reverse` belongs to the BOOK ENTRY, not to the caller. The reverse stages
    // carry `params.reverse: true` and deliberately share their forward twin's seed,
    // because a reverse stage is the same road driven the other way. stageFromBook
    // spreads a caller's overrides AFTER entry.params, so passing an unconditional
    // `reverse: !!choice.reverse` wrote `false` straight over the book and turned
    // both reverse stages back into their forward twins: every sampled point of
    // kloft-bjornhalt-rev was bit-identical to kloft-bjornhalt (167/167), and the
    // same for alvenda-calderas-rev (154/154). Two of the twelve stages were roads
    // the player had already driven. Only override when a caller actually asked.
    const stage = stageMod.stageFromBook(def.id, {
      ...(choice.reverse === undefined ? {} : { reverse: !!choice.reverse }),
      ...(choice.seed ? { seed: choice.seed } : {}),
    });
    const world = stageMod.stageWorld(stage);

    const weather = weatherMod.createWeather(THREE, renderer.scene, choice.weather ?? def.weather);
    const damage = damageMod.createDamage();
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
      meta: { stageId: stage.id, carId: car.spec.id, weatherKey: weather.presetId ?? "" },
      capacityMetres: stage.length + 500,
    });
    // The reference to beat is whatever this car has already done here in these
    // conditions — a ghost from a different car on a different surface would be
    // a number, not information.
    game.best = career.bestFor?.(stage.id, car.spec.id, weather.presetId ?? "clear") ?? null;
    const ghostRun = choice.ghost ?? career.ghostFor?.(stage.id, {
      carId: car.spec.id, weatherKey: weather.presetId ?? "clear",
    });
    game.ghost = ghostRun ? replayMod.createGhost(ghostRun) : null;
    game.stageTimeMs = 0;
    game.splitIndex = 0;
    game.splitTimes = [];
    game.countdown = 5;
    // The autopilot is per-stage, not per-session. Nothing cleared it, so a stage
    // started after an auto-driven one began with the throttle already pinned at
    // the line — which silently corrupted a launch measurement before anyone
    // noticed the car was not being driven by the thing under test.
    game.autoDrive = false;
    game.careerRun = !!choice.career;
    game.careerStageId = choice.careerStageId ?? null;
    autoState.stuck = 0;
    autoState.bestS = 0;
    autoState.recovering = 0;
    input.clearTouch();

    if (choice.attract) {
      enterAttract();
      // Only repaint the screen the backdrop is FOR. A player who pressed a menu
      // button while the road was building is on another screen by now.
      if (menuScreen === "title") screen("title", titleData());
      return;
    }

    showHud(true);
    audio.setMuted?.(false);
    screen(null);
    hud.countdown?.(5);
    game.state = GameState.COUNTDOWN;
  }

  // The title screen's backdrop. It is not a separate rendering path: it is the
  // stage that is already in the renderer, driven by the same pure-pursuit
  // autopilot the screenshot tool uses, with the clock and the HUD switched off.
  //
  // The book's first stage, because that is also the one the menu opens on: the
  // road behind the title is then the road the recce map on it is drawing.
  const ATTRACT_STAGE = stageMod.STAGE_BOOK[0].id;
  const ATTRACT_PACE = 0.60;
  const attractTimers = new Set();

  function enterAttract() {
    if (!game.stage) return;
    game.state = GameState.ATTRACT;
    game.stageTimeMs = 0;
    game.careerRun = false;
    game.autoDrive = true;
    game.autoPace = ATTRACT_PACE;
    autoState.stuck = 0;
    autoState.recovering = 0;
    showHud(false);
    audio.setMuted?.(true);
    hud.countdown?.(null);
    // Chase, not "tv". The trackside rig does re-cut — render.js's pickTvAnchor
    // runs every frame and takes the NEAREST anchor more than 25 m ahead — but
    // at the start of a stage there is nothing near enough to cut to. The
    // anchors are spaced stage.length / 14 apart, which is 880 m on this road,
    // and the loop mints thirteen of them, at 880 m through to 11440 m. The
    // attract run starts at s = 60, so every one of the thirteen is ahead of the
    // car and the nearest is already 880 m up the road. Measured on the real
    // renderer: the tv camera sat 786 m from the car at the start and was still
    // 703 m away after 80 m of driving, which is a photograph of an empty
    // hillside. Chase held 8.6 to 8.9 m over the same stretch.
    renderer.setCamera?.("chase");
    placeCarAt(60, 65);
  }

  // Deliberately late. A harness that boots the page and immediately calls
  // drive() should not have to wait behind a stage build it never asked for, and
  // a player reading the title for a second before the road arrives is fine.
  function startAttract() {
    const token = ++stageToken;
    const t = setTimeout(() => {
      if (token !== stageToken || game.state !== GameState.MENU) return;
      queueStage(async () => {
        if (token !== stageToken || game.state !== GameState.MENU) return;
        try {
          await buildStage({ stageId: ATTRACT_STAGE, carId: menuCarId, attract: true });
        } catch (err) {
          // A title screen with no road behind it is a worse title screen, not a
          // broken game.
          console.warn("attract stage unavailable:", err?.message ?? err);
        }
      });
    }, 1200);
    attractTimers.add(t);
  }

  function showHud(on) {
    if (opts.hudRoot) opts.hudRoot.style.display = on ? "" : "none";
  }

  function toMenu() {
    game.state = GameState.MENU;
    showHud(false);
    audio.setMuted?.(true);
    screen("title", titleData());
    // The stage in the renderer is not cleared: it becomes the title screen's
    // backdrop. Rebuilding a 12 km road every time someone presses Back would
    // cost seconds for a picture the renderer is already holding.
    if (game.stage) enterAttract();
    else startAttract();
  }

  function titleData() {
    return menuData({
      rallyCount: new Set(stageMod.STAGE_BOOK.map((s) => s.rally ?? s.id.split("-")[0])).size,
    });
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
    } else if (game.state === GameState.ATTRACT) {
      // No clock, no splits, no finish line, and no damage either: the title
      // screen must not be able to retire its own car.
      stepPhysics(car, inp, world, dt);
    }

    const proj = world.project(car.pos.x, car.pos.z, game.lastS ?? 0, projScratch);
    game.lastS = proj.s;
    world.surfaceAt(car.pos.x, car.pos.z, surfScratch);

    if (game.state === GameState.RACING) {
      game.noteRunner.update(proj.s, car.forwardSpeed, dt);
      checkSplits(proj.s, stage);
      if (proj.s >= stage.finish.s) finishStage();
      if (game.damage.retired) retire(game.damage.retiredReason);
    } else if (game.state === GameState.ATTRACT) {
      // Send it round again rather than off the end of the road, and rescue it
      // if the autopilot beaches the car where nobody is watching.
      if (proj.s >= stage.length - 90 || autoState.stuck > 8) {
        autoState.stuck = 0;
        autoState.bestS = 0;
        placeCarAt(60, 65);
      }
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
    showHud(true);
    audio.setMuted?.(false);
    if (game.careerRun) { finishCareerStage(false, ""); return; }
    const report = damageMod.damageReport(game.damage);
    const result = career.recordStage?.({
      stageId: game.stage.id,
      carId: game.car.spec.id,
      weatherKey: game.weather?.presetId ?? "clear",
      timeMs: game.stageTimeMs,
      splits: game.splitTimes.slice(),
      damage: report,
      run: game.recorder?.finish?.(),
    }) ?? { timeMs: game.stageTimeMs };
    game.lastResult = result;
    hud.finish?.(result);
    // ui.js reads the results screen out of `data.results`. Spreading the record
    // in at the top level left that key holding demoData()'s fixture, so every
    // finish showed a second place on "Kalder Pass" whatever had just happened.
    screen("results", {
      results: {
        stageName: game.stage.name,
        totalMs: game.stageTimeMs,
        position: null,
        penaltiesMs: 0,
        // damageReport() rows carry `health` and a `damaged` flag; they have no
        // `severity`, so a threshold on one would have been a condition that can
        // never fire and a run that is always clean.
        cleanRun: !report.some((r) => r.damaged),
        splits: splitRows(),
      },
      hasNextStage: true,
      hasReplay: false,
      noRetry: false,
    });
  }

  // career.js models damage as seven serviceable components; damage.js models it
  // as twenty-five parts. A component is as healthy as its worst part.
  const CAREER_COMPONENTS = Object.freeze({
    engine: ["engine", "turbo", "exhaust"],
    gearbox: ["gearbox", "clutch", "driveshaft"],
    suspension: ["suspFL", "suspFR", "suspRL", "suspRR"],
    steering: ["steering"],
    cooling: ["radiator"],
    electrics: ["headlights"],
    bodywork: ["bodyFront", "bodyRear", "bodyLeft", "bodyRight", "bodyRoof", "windscreen"],
  });

  function componentHealth() {
    const out = {};
    for (const id of Object.keys(CAREER_COMPONENTS)) {
      let worst = 1;
      for (const key of CAREER_COMPONENTS[id]) {
        const h = damageMod.componentHealth?.(game.damage, key);
        if (Number.isFinite(h)) worst = Math.min(worst, h);
      }
      out[id] = worst;
    }
    return out;
  }

  // The intermediate splits plus the finish, each against this car's best here
  // in these conditions where there is one.
  function splitRows() {
    const rows = game.splitTimes.map((t, i) => ({
      label: `Split ${i + 1}`,
      timeMs: t,
      deltaMs: game.best?.bestSplits?.[i] == null ? null : t - game.best.bestSplits[i],
    }));
    rows.push({
      label: "Finish",
      timeMs: game.stageTimeMs,
      deltaMs: game.best?.timeMs == null ? null : game.stageTimeMs - game.best.timeMs,
    });
    return rows;
  }

  function finishCareerStage(retired, reason) {
    const res = career.submitStage?.({
      timeMs: game.stageTimeMs,
      splits: game.splitTimes.slice(),
      retired,
      reason,
      damage: componentHealth(),
      run: game.recorder?.finish?.(),
    });
    game.lastResult = res;
    if (!res) { toMenu(); return; }
    hud.finish?.({ timeMs: game.stageTimeMs });
    careerPendingService = !!res.service;
    careerPendingSeason = res.summary?.season ?? null;
    const me = res.entries.find((e) => e.isPlayer);
    screen("results", {
      results: {
        stageName: `${res.stage.name} — ${res.event.name}`,
        totalMs: me ? me.totalMs : game.stageTimeMs,
        position: res.stagePosition,
        penaltiesMs: me ? me.penaltyMs : 0,
        cleanRun: !retired && !(me && me.penaltyMs > 0),
        splits: splitRows(),
      },
      // Always true in a championship: there is always somewhere to go next,
      // even if that somewhere is the service park or the podium.
      hasNextStage: true,
      hasReplay: false,
      // The stage is on the timing sheet now. Driving it again would be a
      // second time for a stage that already has one.
      noRetry: true,
    });
  }

  function retire(reason) {
    game.state = GameState.RETIRED;
    showHud(true);
    audio.setMuted?.(false);
    if (game.careerRun) { finishCareerStage(true, reason); return; }
    screen("results", {
      results: {
        stageName: game.stage?.name ?? "Stage",
        totalMs: game.stageTimeMs,
        position: null,
        penaltiesMs: 0,
        cleanRun: false,
        splits: splitRows(),
      },
      retired: true,
      reason,
      hasNextStage: true,
      hasReplay: false,
      noRetry: false,
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

  // Teleports to an arc length and sets a speed along the road: how the
  // screenshot tool reaches a jump without a lucky lap, and how the attract
  // backdrop sends its car round again at the end of the stage.
  function placeCarAt(distance, speedKph = 0) {
    if (!game.stage || !game.car) return false;
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
      || game.state === GameState.ATTRACT
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
      // The HUD belongs to the road. Behind a menu it is a speedometer over a
      // main menu, which is how the attract backdrop would read as a bug.
      if (game.state !== GameState.MENU && game.state !== GameState.ATTRACT) hud.update(buildFrame());
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
      await beginStage({
        stageId: choice.stageId ?? stageMod.STAGE_BOOK[0].id,
        carId: choice.carId ?? physics.CARS[0].id,
        weather: choice.weather,
        seed: choice.seed,
        ...(choice.reverse === undefined ? {} : { reverse: !!choice.reverse }),
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
    placeAt(distance, speedKph = 0) { return placeCarAt(distance, speedKph); },
    setCamera(mode) { renderer.setCamera?.(mode); },
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
      // POSITIVE steer is RIGHT; this door had the keyboard's old inverted sign.
      if (keys.includes("left")) patch.steer = -1;
      if (keys.includes("right")) patch.steer = 1;
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
      for (const t of attractTimers) clearTimeout(t);
      attractTimers.clear();
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
