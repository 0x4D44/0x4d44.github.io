// Boots OpusRally in headless Chrome on a software GL stack and checks the
// things only a real browser can answer: that the scene builds, that the car
// actually drives when keys are pressed, that the co-driver calls the road, that
// the HUD tracks the simulation, and that nothing throws along the way.
//
// Real key events, not synthetic ones: a hand-built KeyboardEvent skips the
// browser's own dispatch and would prove nothing about a player pressing a key.

import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openHarness } from "./drive.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const VIEWPORTS = [[1280, 800], [520, 900]];
const BOOT_TIMEOUT = 180_000;

let page;
const watchdog = setTimeout(() => {
  console.error("opus-rally browser test timed out");
  page?.close();
  process.exit(2);
}, 600_000);
watchdog.unref?.();

function fail(message, extra) {
  throw new Error(`${message}${extra ? `\n${extra}` : ""}`);
}

try {
  page = await openHarness({ root: ROOT, width: 1280, height: 800 });
  let coldTitleText = "";

  for (const [width, height] of VIEWPORTS) {
    process.stderr.write(`[opus-rally] booting at ${width}x${height}\n`);
    await page.setViewport(width, height);
    await page.navigate("/opus-rally/");

    try {
      await page.waitFor("the game to boot", () => page.evaluate("!!window.__opusRally"), BOOT_TIMEOUT);
    } catch (bootFailure) {
      fail(`${width}x${height}: ${bootFailure.message}`,
        `boot card said: ${await page.evaluate("document.getElementById('boot-fail')?.textContent ?? ''")}`);
    }

    // The boot card must really be gone, not merely marked hidden: a full-screen
    // overlay left displayed would swallow every key and click. It fades out over
    // half a second, so wait for it rather than racing it.
    await page.waitFor("the boot card to clear", async () => (
      await page.evaluate("getComputedStyle(document.getElementById('boot')).visibility") === "hidden"
    ), 10_000);

    // The FIRST screen, before any drive() has run and before toMenu() has had a
    // chance to repaint it. This is what a player sees on opening the page, and
    // it is the one that used to render ui.js's demoData() fixtures — an invented
    // "Opus Trophy" over five events that do not exist in the stage book.
    coldTitleText = await page.evaluate(
      `document.getElementById("ui-root").textContent`);

    const canvas = await page.evaluate(`(() => {
      const c = document.getElementById("stage-canvas");
      return { w: c.width, h: c.height, gl: !!(c.getContext("webgl2") || c.getContext("webgl")) };
    })()`);
    assert.ok(canvas.gl, `${width}x${height}: no WebGL context on the canvas`);
    assert.ok(canvas.w > 0 && canvas.h > 0, `${width}x${height}: the canvas has no size`);

    // ---- a stage really generates ----
    await page.evaluate(`window.__opusRally.drive({})`);
    const stage = await page.waitFor("a stage to build",
      () => page.evaluate("window.__opusRally.stageInfo()"), 120_000);
    assert.ok(stage.length > 3000, `${width}x${height}: implausible stage length ${stage.length}`);
    assert.ok(stage.count > 500, `${width}x${height}: stage has only ${stage.count} samples`);
    assert.ok(stage.scenery > 200, `${width}x${height}: the stage is bare (${stage.scenery} scenery)`);
    assert.ok(stage.props > 20, `${width}x${height}: no roadside furniture (${stage.props} props)`);
    assert.match(stage.name, /\S/, `${width}x${height}: the stage has no name`);

    // ---- the car drives when a key is held ----
    await page.evaluate("window.__opusRally.placeAt(200, 0)");
    await page.delay(400);
    const before = await page.evaluate("window.__opusRally.frame.distance");
    const clock0 = await page.evaluate("window.__opusRally.frame.timeMs");
    await page.key("ArrowUp", "down");
    // Wait for four seconds of SIMULATED time, not of wall time. Under a
    // software rasteriser a frame can take a second, and dt is clamped, so four
    // wall seconds bought barely one simulated one — which made this assertion
    // drift with machine load rather than with the car.
    await page.waitFor("four seconds of stage time under throttle", async () => (
      (await page.evaluate("window.__opusRally.frame.timeMs")) - clock0 >= 4000 || null
    ), 120_000);
    const moving = await page.evaluate(`(() => {
      const f = window.__opusRally.frame;
      return { speed: f.speedKph, distance: f.distance, rpm: f.rpm, gear: f.gear };
    })()`);
    await page.key("ArrowUp", "up");
    // The bar comes from measurement, not from taste: the harness drives CARS[0]
    // (a front-wheel-drive junior car) launching on GRAVEL, which reaches 41.1
    // km/h in four seconds on the bench, and rather less up a gradient. Thirty
    // is comfortably clear of that and still catches the failure this assertion
    // exists for — a gearbox stuck in first reached 3.9.
    assert.ok(moving.speed > 30,
      `${width}x${height}: four seconds of stage time on full throttle only reached `
      + `${moving.speed.toFixed(1)} km/h`);
    assert.ok(moving.distance > before + 5,
      `${width}x${height}: the car did not move down the road (${before} -> ${moving.distance})`);
    assert.ok(moving.rpm > 800, `${width}x${height}: the engine is not turning (${moving.rpm} rpm)`);
    assert.ok(moving.gear >= 1, `${width}x${height}: never selected a gear (gear ${moving.gear})`);

    // ---- braking actually slows it ----
    const brakeClock = await page.evaluate("window.__opusRally.frame.timeMs");
    await page.key("ArrowDown", "down");
    await page.waitFor("two seconds of stage time on the brakes", async () => (
      (await page.evaluate("window.__opusRally.frame.timeMs")) - brakeClock >= 2000 || null
    ), 120_000);
    const braked = await page.evaluate("window.__opusRally.frame.speedKph");
    await page.key("ArrowDown", "up");
    assert.ok(braked < moving.speed - 3,
      `${width}x${height}: braking from ${moving.speed.toFixed(1)} left ${braked.toFixed(1)} km/h`);

    // ---- steering changes the car's heading ----
    await page.evaluate("window.__opusRally.placeAt(400, 60)");
    await page.delay(300);
    const yaw0 = await page.evaluate("window.OPUS_RALLY.game.car.yaw");
    await page.key("ArrowLeft", "down");
    await page.key("ArrowUp", "down");
    await page.delay(2500);
    await page.key("ArrowLeft", "up");
    await page.key("ArrowUp", "up");
    const yaw1 = await page.evaluate("window.OPUS_RALLY.game.car.yaw");
    const turned = Math.abs(Math.atan2(Math.sin(yaw1 - yaw0), Math.cos(yaw1 - yaw0)));
    assert.ok(turned > 0.08,
      `${width}x${height}: two and a half seconds of left lock turned the car ${(turned * 57.3).toFixed(1)} degrees`);

    // ---- the co-driver calls the road ----
    const notes = await page.evaluate(`(() => {
      const n = window.OPUS_RALLY.game.notes;
      return { count: n.length, first: n[0] ? JSON.stringify(n[0]).slice(0, 200) : null };
    })()`);
    assert.ok(notes.count > 15,
      `${width}x${height}: only ${notes.count} pacenotes for a ${(stage.length / 1000).toFixed(1)} km stage`);

    // ---- the HUD is really on screen and tracking the simulation ----
    const hud = await page.evaluate(`(() => {
      const root = document.getElementById("hud-root");
      const painted = root.querySelectorAll("*").length;
      const text = root.textContent.replace(/\\s+/g, " ").trim().slice(0, 400);
      const box = root.getBoundingClientRect();
      return { painted, text, w: box.width, h: box.height };
    })()`);
    assert.ok(hud.painted > 20, `${width}x${height}: the HUD drew only ${hud.painted} elements`);
    assert.match(hud.text, /\d/, `${width}x${height}: the HUD shows no numbers ("${hud.text}")`);

    // ---- nothing interactive hides under the shared almanac pill ----
    const covered = await page.evaluate(`(() => {
      const hits = [];
      for (const x of [8, 40, 80, 104]) {
        for (const y of [8, 20, 36]) {
          const el = document.elementFromPoint(x, y);
          if (!el) continue;
          const interactive = el.closest("button, a, input, select, [role=button], [tabindex]");
          if (interactive && !interactive.closest("#almanac-back, .almanac-back")) {
            hits.push(\`\${x},\${y}: \${interactive.tagName}.\${interactive.className}\`);
          }
        }
      }
      return hits;
    })()`);
    assert.deepEqual(covered, [],
      `${width}x${height}: controls sit under the back pill and would be untappable: ${covered.join("; ")}`);

    // ---- the page never scrolls sideways ----
    const overflow = await page.evaluate(
      "document.documentElement.scrollWidth - document.documentElement.clientWidth",
    );
    assert.ok(overflow <= 1, `${width}x${height}: the document scrolls sideways by ${overflow}px`);

    // ---- pause works and stops the clock ----
    await page.tap("Escape");
    await page.delay(700);
    const t0 = await page.evaluate("window.__opusRally.frame.timeMs");
    await page.delay(1200);
    const t1 = await page.evaluate("window.__opusRally.frame.timeMs");
    assert.equal(t0, t1, `${width}x${height}: the stage clock kept running while paused`);
    await page.tap("Escape");

    // ---- and the whole run was clean ----
    const errors = page.errors;
    assert.deepEqual(errors, [],
      `${width}x${height}: the page reported errors:\n  ${errors.join("\n  ")}`);
  }

  // ---- every stage in the book generates and is drivable ----
  process.stderr.write("[opus-rally] generating every stage in the book\n");
  const book = await page.evaluate(`(async () => {
    const mod = await import("/opus-rally/stage.js");
    return mod.STAGE_BOOK.map((s) => s.id);
  })()`);
  assert.ok(book.length >= 8, `the stage book holds only ${book.length} stages`);
  for (const id of book) {
    const info = await page.evaluate(`(async () => {
      const mod = await import("/opus-rally/stage.js");
      const pn = await import("/opus-rally/pacenotes.js");
      // stageFromBook, not generateStage(def.seed, def): a book entry keeps its
      // generator parameters under .params, so spreading the entry itself builds
      // a generic default road instead of the stage the player drives — wrong
      // surface, wrong length, wrong jumps, and a reverse entry not reversed at
      // all. That is exactly how two unplayable reverse stages passed this gate.
      const st = mod.stageFromBook(${JSON.stringify(id)});
      const notes = pn.derivePacenotes(st, {});
      let bad = 0;
      for (let i = 0; i < st.count; i += 1) {
        if (!Number.isFinite(st.x[i]) || !Number.isFinite(st.y[i]) || !Number.isFinite(st.z[i])) bad += 1;
      }
      // The start pose is what resetCar() is handed, so a start that is not on
      // its own road is a stage nobody can drive.
      const w = mod.stageWorld(st);
      const p = w.project(st.start.x, st.start.z, 0, {});
      const entry = mod.STAGE_BOOK.find((e) => e.id === ${JSON.stringify(id)});
      const band = entry?.lengthBand ?? null;
      return { id: st.id, name: st.name, length: st.length, notes: notes.length,
               features: st.features.length, bad,
               startOnRoad: Math.abs(p.s ?? 0),
               band,
               inBand: !band || (st.length >= band[0] && st.length <= band[1]) };
    })()`);
    assert.equal(info.bad, 0, `${id}: ${info.bad} non-finite centreline samples`);
    assert.ok(info.length > 3000 && info.length < 20000,
      `${id}: implausible length ${Math.round(info.length)} m`);
    assert.ok(info.inBand,
      `${id}: ${Math.round(info.length)} m is outside its declared band `
      + `${info.band?.[0]}-${info.band?.[1]} m`);
    assert.ok(info.startOnRoad < 5,
      `${id}: the start line is ${Math.round(info.startOnRoad)} m from the road — `
      + `the car would spawn in the scenery`);
    assert.ok(info.notes > 15, `${id}: only ${info.notes} pacenotes`);
    assert.ok(info.features > 3, `${id}: only ${info.features} named features`);
    process.stderr.write(`  ${info.id.padEnd(22)} ${(info.length / 1000).toFixed(2)} km  `
      + `${String(info.notes).padStart(3)} notes  ${info.features} features\n`);
  }

  // Generating a stage is not the same as starting one: the weather rig, the car,
  // the pacenote runner and the whole mesh build only run on the drive path. That
  // is where eleven of the twelve stages used to throw on an unknown weather id,
  // and generating them had looked perfectly healthy.
  process.stderr.write("[opus-rally] starting a representative stage from each rally\n");
  const rallies = new Map();
  for (const id of book) rallies.set(id.split("-")[0], id);
  for (const id of rallies.values()) {
    page.clearErrors();
    const started = await page.evaluate(
      `window.__opusRally.drive({ stageId: ${JSON.stringify(id)} }).then(() => true, (e) => String(e))`,
    );
    assert.equal(started, true, `${id}: drive() failed — ${started}`);
    const info = await page.waitFor(`${id} to build`,
      () => page.evaluate("window.__opusRally.stageInfo()"), 120_000);
    assert.equal(info.id, id, `${id}: started ${info.id} instead`);
    assert.deepEqual(page.errors, [],
      `${id}: starting it raised:\n  ${page.errors.join("\n  ")}`);
    process.stderr.write(`  ${id.padEnd(22)} started clean\n`);
  }

  // A reverse stage must be a different road from its forward twin. It shares the
  // twin's seed on purpose — a reverse stage is the same road driven the other way —
  // so the only thing that makes it a different drive is `params.reverse: true` on
  // the book entry. beginStage used to spread an unconditional `reverse:
  // !!choice.reverse` over that, writing `false` straight across it, and two of the
  // twelve stages silently became roads the player had already driven: every sampled
  // elevation of kloft-bjornhalt-rev was bit-identical to kloft-bjornhalt.
  //
  // Nothing caught it. stage.js was innocent, so its own tests passed, and this gate
  // only ever asked whether a stage STARTED. So this samples through the RUNNING
  // GAME rather than through stageFromBook, because the bug was in the call and not
  // in the callee.
  process.stderr.write("[opus-rally] a reverse stage differs from its forward twin\n");
  for (const [fwd, rev] of [["kloft-bjornhalt", "kloft-bjornhalt-rev"],
    ["alvenda-calderas", "alvenda-calderas-rev"]]) {
    if (!book.includes(fwd) || !book.includes(rev)) continue;
    const profile = async (id) => {
      await page.evaluate(`window.__opusRally.drive({ stageId: ${JSON.stringify(id)} })`);
      await page.waitFor(`${id} to build`,
        () => page.evaluate("window.__opusRally.stageInfo()"), 120_000);
      return page.evaluate(`(() => {
        const st = window.OPUS_RALLY.game.stage;
        const step = Math.max(1, Math.floor(st.count / 60));
        const out = [];
        for (let i = 0; i < st.count; i += step) out.push(+st.y[i].toFixed(4));
        return out;
      })()`);
    };
    const a = await profile(fwd);
    const b = await profile(rev);
    const n = Math.min(a.length, b.length);
    let same = 0;
    for (let i = 0; i < n; i += 1) if (Math.abs(a[i] - b[i]) < 1e-9) same += 1;
    assert.ok(n > 20, `${rev}: only ${n} elevations to compare`);
    // A few may coincide where the road is flat; all of them cannot.
    assert.ok(same < n * 0.5,
      `${rev} is the same road as ${fwd}: ${same} of ${n} sampled elevations are`
      + " bit-identical, so the reverse stage is its forward twin and the player"
      + " drives the same road twice");
    process.stderr.write(`  ${rev.padEnd(22)} differs from its twin (${same}/${n} shared)\n`);
  }

  // The autopilot is per-stage, not per-session. drive() never cleared it, so any
  // stage started after an auto-driven one began with the throttle already pinned
  // at the start line. That is a test-hook path rather than a player one, but it
  // silently corrupted a launch measurement — the car was being driven by the
  // autopilot rather than by the thing under test — and a harness that lies to its
  // own measurements is worse than one that is merely missing a feature.
  //
  // Waits on the SIMULATION, never on wall time. Under SwiftShader this renders at
  // about three frames a second, and by this point in the suite seventeen stages
  // have been built, so a fixed 700 ms sleep can buy a single frame — which is how
  // the first version of this check started reporting that arming the autopilot
  // did nothing. The countdown clock is the honest signal that frames have run.
  //
  // Differential against a stage started clean, NOT an absolute bar: the idle
  // governor can hold a real non-zero throttle at the line, so "throttle < 0.05"
  // would fail on a perfectly good stage and prove nothing about the autopilot.
  process.stderr.write("[opus-rally] a new stage does not inherit the autopilot\n");
  const countdownNow = () => page.evaluate("window.OPUS_RALLY.game.countdown");
  const advance = async (seconds, why) => {
    const from = await countdownNow();
    await page.waitFor(why, async () => ((await countdownNow()) <= from - seconds) || null,
      180_000);
  };
  const startFresh = async () => {
    await page.evaluate(
      `window.__opusRally.drive({ stageId: ${JSON.stringify(book[0])}, skipCountdown: false })`);
    await page.waitFor("a stage to build",
      () => page.evaluate("window.__opusRally.stageInfo()"), 120_000);
    await advance(0.5, "half a second of countdown on the fresh stage");
    return page.evaluate(`(() => {
      const f = window.__opusRally.frame;
      return { throttle: f.throttle, auto: !!window.OPUS_RALLY.game.autoDrive };
    })()`);
  };

  const clean = await startFresh();
  assert.equal(clean.auto, false, "a stage started clean already has the autopilot armed");

  await page.evaluate("window.__opusRally.setAutoDrive(true, 0.8)");
  const armed = await page.waitFor("the armed autopilot to open the throttle", async () => {
    const t = await page.evaluate("window.__opusRally.frame.throttle");
    return t > clean.throttle + 0.3 ? t : null;
  }, 60_000).catch(() => null);
  assert.ok(armed !== null,
    `arming the autopilot never moved the throttle above ${(clean.throttle + 0.3).toFixed(2)},`
    + " so this check cannot tell an armed autopilot from a cleared one and proves nothing");

  const after = await startFresh();
  assert.equal(after.auto, false,
    "a fresh stage inherited the previous stage's autopilot: it is driving before the"
    + " lights go green, and any measurement taken on it is of the autopilot, not the car");
  assert.ok(after.throttle <= clean.throttle + 0.05,
    `a fresh stage started with ${after.throttle.toFixed(2)} throttle against`
    + ` ${clean.throttle.toFixed(2)} on a stage started clean — the autopilot carried over`);
  process.stderr.write(`  clean ${clean.throttle.toFixed(2)}  armed ${armed.toFixed(2)}`
    + `  fresh-after-armed ${after.throttle.toFixed(2)}\n`);

  // Reach a stage the way a PLAYER does. Everything above this line — and every
  // other check in the suite — starts a stage through window.__opusRally.drive(),
  // the harness door. That is how the entire main menu came to be dead while 435
  // assertions stayed green: ui.js emits an action per button, emit() drops an
  // action with no host hook SILENTLY, and game.js supplied none of the menu's
  // hooks. Only "How to drive" worked, because ui.js resolves that one itself.
  //
  // validate-static.mjs now checks that every action has a hook. This checks the
  // other half: that pressing the buttons in order actually arrives on a stage.
  process.stderr.write("[opus-rally] starting a stage by clicking, as a player would\n");
  await page.evaluate("window.OPUS_RALLY.toMenu()");
  await page.delay(700);

  // Read buttons out of the live shell rather than hard-coding coordinates: a
  // test that clicks a remembered pixel stops testing the menu the moment the
  // menu moves. String.raw because a template literal eats the backslash in \s
  // and the regex would arrive as /s+/ and delete every letter s.
  const readButtons = () => page.evaluate(String.raw`(() => {
    const out = [];
    document.querySelectorAll("#ui-root button").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || el.disabled) return;
      out.push({ text: (el.textContent || "").trim().replace(/\s+/g, " "),
        x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    });
    return out;
  })()`);

  async function press(label, matcher) {
    const buttons = await readButtons();
    const hit = buttons.find((b) => matcher.test(b.text));
    assert.ok(hit, `${label}: no button matching ${matcher} — saw `
      + buttons.map((b) => JSON.stringify(b.text)).join(", "));
    await page.click(hit.x, hit.y);
    await page.delay(900);
    return hit;
  }

  const titleButtons = await readButtons();
  assert.ok(titleButtons.length >= 4,
    `the title screen offers only ${titleButtons.length} buttons`);

  // The menu must be showing THIS game. It used to render ui.js's demoData()
  // fixtures — an invented "Opus Trophy" over five events that do not exist —
  // because game.js passed the stage book as an option and the shell reads
  // content from `data`.
  const realNames = book.map((id) => id.split("-").slice(1).join("-"));
  assert.ok(!/Kalder Hills|Opus Trophy/.test(coldTitleText),
    "the first screen a player sees is still ui.js's demo fixtures, not the stage book");
  assert.ok(book.some((id) => {
    const name = id.split("-").slice(1).join("-").replace(/-/g, " ");
    return coldTitleText.toLowerCase().includes(name.toLowerCase());
  }), "the first screen names no stage from the book");

  page.clearErrors();
  await press("title", /quick stage/i);
  const stageText = await page.evaluate(
    `document.getElementById("ui-root").textContent`);
  assert.ok(book.some((id) => {
    const name = id.split("-").slice(1).join("-").replace(/-/g, " ");
    return stageText.toLowerCase().includes(name.toLowerCase());
  }), `the stage screen names no stage from the book — realNames ${realNames.join(", ")}`);

  await press("stage screen", /start stage/i);
  const reached = await page.waitFor("the stage to start from a click", async () => {
    const st = await page.evaluate("window.__opusRally.state");
    return (st === "countdown" || st === "racing") ? st : null;
  }, 120_000);
  assert.ok(reached === "countdown" || reached === "racing",
    `clicking Start stage left the game in "${reached}"`);
  assert.deepEqual(page.errors, [],
    `clicking through the menu raised:\n  ${page.errors.join("\n  ")}`);
  process.stderr.write(`  title -> quick stage -> start  reached ${reached}\n`);

  // ---- the on-screen controls: only on a touchscreen, and they really drive ----
  //
  // The unit tests measure the geometry against a stub. Only a real browser can
  // answer the two questions that decide whether a phone can play this at all:
  // whether the controls are there, and whether a finger on them moves the car.
  // Every input below is a synthesised touch — no key is pressed after this line.
  const controlRects = `(() => {
    const out = {};
    for (const n of document.querySelectorAll("#touch-root [data-control]")) {
      const r = n.getBoundingClientRect();
      out[n.dataset.control] = { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    return out;
  })()`;

  page.clearErrors();
  await page.touchEmulation(false);
  await page.setViewport(1280, 800);
  await page.navigate("/opus-rally/");
  await page.waitFor("the desktop boot", () => page.evaluate("!!window.__opusRally"), BOOT_TIMEOUT);
  await page.evaluate("window.__opusRally.drive({})");
  await page.waitFor("a desktop stage", () => page.evaluate("window.__opusRally.stageInfo()"), 120_000);
  const onDesktop = await page.evaluate(controlRects);
  assert.deepEqual(onDesktop, {},
    `a mouse-and-keyboard machine was given driving controls: ${JSON.stringify(onDesktop)}`);
  process.stderr.write("  desktop 1280x800: no on-screen controls\n");

  await page.touchEmulation(true, 5);
  await page.setViewport(390, 844);
  await page.navigate("/opus-rally/");
  await page.waitFor("the phone boot", () => page.evaluate("!!window.__opusRally"), BOOT_TIMEOUT);
  assert.equal(await page.evaluate("navigator.maxTouchPoints > 0"), true,
    "the harness is not emulating a touchscreen, so this proves nothing");
  await page.evaluate("window.__opusRally.drive({})");
  await page.waitFor("a phone stage", () => page.evaluate("window.__opusRally.stageInfo()"), 120_000);

  const rects = await page.evaluate(controlRects);
  for (const id of ["steer", "throttle", "brake", "handbrake"]) {
    assert.ok(rects[id], `a touchscreen got no ${id} control: ${JSON.stringify(Object.keys(rects))}`);
  }

  // The pill is measured, not assumed: it is a separate site-wide script, and a
  // tap that lands on it navigates away to the catalog mid-stage.
  const pill = await page.evaluate(`(() => {
    const host = document.getElementById("almanac-back-host");
    if (!host) return null;
    const r = (host.shadowRoot?.querySelector("a") ?? host).getBoundingClientRect();
    return { x: 0, y: 0, w: r.x + r.width, h: r.y + r.height };
  })()`);
  assert.ok(pill, "the shared back pill did not load, so its rectangle cannot be checked");
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  if (pill) {
    for (const [id, r] of Object.entries(rects)) {
      assert.ok(!overlaps(r, pill),
        `${id} at ${JSON.stringify(r)} sits under the almanac pill ${JSON.stringify(pill)} — a tap there leaves the game`);
    }
  }

  // The reserve is the whole point of the hud.js/touch.js contract: a speed
  // readout under a throttle pedal is exactly as useful as one under the pill.
  const cluster = await page.evaluate(`(() => {
    const n = document.querySelector("#hud-root .orh-cluster");
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  assert.ok(cluster && cluster.w > 40, "the HUD has no speed cluster to protect");
  for (const [id, r] of Object.entries(rects)) {
    assert.ok(!overlaps(r, cluster),
      `${id} ${JSON.stringify(r)} covers the speed and gear cluster ${JSON.stringify(cluster)}`);
  }
  process.stderr.write(
    `  phone 390x844: ${Object.keys(rects).length} controls, speed cluster clear at `
    + `${cluster.x.toFixed(0)},${cluster.y.toFixed(0)}\n`);

  const centreOf = (r) => [r.x + r.w / 2, r.y + r.h / 2];
  const [throttleX, throttleY] = centreOf(rects.throttle);
  const steerY = rects.steer.y + rects.steer.h / 2;
  const readCar = `(() => {
    const g = window.OPUS_RALLY.game, f = window.__opusRally.frame;
    return { steer: g.car.input.steer, throttle: g.car.input.throttle,
             speed: f.speedKph, distance: f.distance, timeMs: f.timeMs, yaw: g.car.yaw };
  })()`;
  // Wall time is not the clock here: under a software rasteriser one frame can
  // take a second, so a 250 ms sleep after a touch can land before the game has
  // stepped at all and read an input the simulation has not seen yet.
  const stageSeconds = async (seconds) => {
    const t0 = (await page.evaluate(readCar)).timeMs;
    await page.waitFor(`${seconds}s of stage time`, async () => (
      (await page.evaluate(readCar)).timeMs - t0 >= seconds * 1000 || null
    ), 120_000);
  };

  await page.evaluate("window.__opusRally.placeAt(200, 0)");
  await page.delay(400);
  const standing = await page.evaluate(readCar);
  await page.touchDown(1, throttleX, throttleY);
  await stageSeconds(4);
  const pulling = await page.evaluate(readCar);
  assert.ok(pulling.throttle > 0.9,
    `a finger on the throttle pedal gave ${pulling.throttle.toFixed(2)} throttle`);
  assert.ok(pulling.speed > 25,
    `four seconds of stage time on a touched throttle only reached ${pulling.speed.toFixed(1)} km/h`);
  assert.ok(pulling.distance > standing.distance + 5,
    `the car did not move down the road on touch alone (${standing.distance} -> ${pulling.distance})`);

  // Two fingers at once, which is the whole reason for separate controls: a
  // handler that tracks a single touch drops the throttle the moment you steer.
  await page.touchDown(2, rects.steer.x + rects.steer.w * 0.12, steerY);
  await stageSeconds(0.3);
  const both = await page.evaluate(readCar);
  assert.ok(both.throttle > 0.9,
    `putting a finger on the slider killed the throttle (${both.throttle.toFixed(2)})`);
  assert.ok(both.steer < -0.2,
    `the slider held left gave ${both.steer.toFixed(2)} steer while the throttle was down`);

  const yaw0 = both.yaw;
  await stageSeconds(2.5);
  const turnedLeft = await page.evaluate(readCar);
  await page.touchMove(2, rects.steer.x + rects.steer.w * 0.88, steerY);
  await stageSeconds(0.3);
  const rightLock = await page.evaluate(readCar);
  assert.ok(rightLock.steer > 0.2,
    `sliding the thumb to the other end gave ${rightLock.steer.toFixed(2)}, not right lock`);
  const swung = Math.abs(Math.atan2(
    Math.sin(turnedLeft.yaw - yaw0), Math.cos(turnedLeft.yaw - yaw0)));
  assert.ok(swung > 0.08,
    `two and a half seconds of touched lock turned the car ${(swung * 57.3).toFixed(1)} degrees`);

  await page.touchRelease();
  await stageSeconds(1);
  const released = await page.evaluate(readCar);
  assert.ok(released.throttle < 0.05 && Math.abs(released.steer) < 0.35,
    `lifting every finger left throttle ${released.throttle.toFixed(2)} steer ${released.steer.toFixed(2)} applied`);
  assert.deepEqual(page.errors, [],
    `driving on touch alone raised:\n  ${page.errors.join("\n  ")}`);
  process.stderr.write(
    `  touch drive: ${pulling.speed.toFixed(1)} km/h on the pedal, `
    + `${(swung * 57.3).toFixed(1)} degrees of steering, nothing stuck on release\n`);

  console.log("opus-rally browser test: all checks passed");
} catch (err) {
  console.error(`opus-rally browser test failed: ${err.message}`);
  if (page?.errors?.length) console.error(`page errors:\n  ${page.errors.join("\n  ")}`);
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  page?.close();
}
