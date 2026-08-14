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
    await page.key("ArrowUp", "down");
    await page.delay(4000);
    const moving = await page.evaluate(`(() => {
      const f = window.__opusRally.frame;
      return { speed: f.speedKph, distance: f.distance, rpm: f.rpm, gear: f.gear };
    })()`);
    await page.key("ArrowUp", "up");
    assert.ok(moving.speed > 15,
      `${width}x${height}: holding the throttle for four seconds only reached ${moving.speed.toFixed(1)} km/h`);
    assert.ok(moving.distance > before + 5,
      `${width}x${height}: the car did not move down the road (${before} -> ${moving.distance})`);
    assert.ok(moving.rpm > 800, `${width}x${height}: the engine is not turning (${moving.rpm} rpm)`);
    assert.ok(moving.gear >= 1, `${width}x${height}: never selected a gear (gear ${moving.gear})`);

    // ---- braking actually slows it ----
    await page.key("ArrowDown", "down");
    await page.delay(2500);
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

  console.log("opus-rally browser test: all checks passed");
} catch (err) {
  console.error(`opus-rally browser test failed: ${err.message}`);
  if (page?.errors?.length) console.error(`page errors:\n  ${page.errors.join("\n  ")}`);
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  page?.close();
}
