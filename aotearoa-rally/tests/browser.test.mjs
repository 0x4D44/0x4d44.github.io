// Headless-Chrome suite: boots the real page, walks the menus, plays stages with the bot, checks
// results, championship flow, leaks across restarts and phone layout.
//   npm --prefix aotearoa-rally run browser      (SHOT_DIR=<dir> keeps the menu screenshots; default: OS temp)

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openGame, findChrome } from "./harness.mjs";

const SHOT_DIR = process.env.SHOT_DIR || (await mkdtemp(join(tmpdir(), "ar-shots-")));
const chrome = findChrome();
const opts = { skip: chrome ? false : "Chrome not found (set CHROME_PATH)", timeout: 900000 };

const UNDER_PILL = `(() => {
  const host = [...document.querySelectorAll("*")].find(e => e.shadowRoot && e.shadowRoot.querySelector("a"));
  if (!host) return { pill: false, hits: [] };
  const b = host.getBoundingClientRect();
  const hits = [];
  for (const el of document.querySelectorAll("a, button, input, select, [role=button]")) {
    if (host.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || el.offsetParent === null) continue;
    const ow = Math.min(r.right, b.right) - Math.max(r.left, b.left), oh = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
    if (ow > 6 && oh > 6) hits.push((el.className || el.tagName) + ":" + (el.textContent || "").trim().slice(0, 20));
  }
  return { pill: true, hits };
})()`;

async function checkNoErrors(g, label) {
  const errs = [...g.consoleErrors(), ...(await g.evalAsync("window.__AR__.errors"))];
  assert.deepEqual(errs, [], `${label}: console/page errors`);
}

test("boots to the menu with zero errors and every module present", opts, async () => {
  const g = await openGame({ width: 1280, height: 720, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    const s = await g.evalAsync("({ st: window.__AR__.state(), mods: window.__AR__.modules, missing: window.__AR__.missing, v: window.__AR__.version })");
    assert.equal(s.st.screen, "menu");
    assert.deepEqual(s.missing, [], "lane modules missing");
    assert.equal(s.v, "1.0.0");
    await checkNoErrors(g, "boot");
    await g.screenshot(join(SHOT_DIR, "menu-1280.png"));
  } finally { await g.close(); }
});

test("every menu screen is reachable, fits 390x844 without sideways scroll and keeps the Almanac pill clear", opts, async () => {
  const g = await openGame({ width: 390, height: 844, mobile: true, dpr: 2, query: "menu=1&quality=low&mute=1" });
  const seen = [];
  const visit = async (name, label) => {
    if (label) assert.equal(await g.evalAsync(`window.__AR__.click(${JSON.stringify(label)})`), true, `button "${label}" not found on ${seen.at(-1) || "menu"}`);
    await g.sleep(700);
    const st = await g.evalAsync("window.__AR__.screenName()");
    assert.equal(st, name, `expected screen ${name} after "${label}", got ${st}`);
    seen.push(name);
    assert.ok((await g.overflowX()) <= 1, `${name}: horizontal overflow ${await g.overflowX()} px at 390 wide`);
    const pill = await g.eval(UNDER_PILL);
    assert.deepEqual(pill.hits, [], `${name}: controls under the Almanac pill`);
    await g.screenshot(join(SHOT_DIR, `${name}-390.png`));
  };
  try {
    await g.waitForReady();
    await visit("menu");
    await visit("options", "Options");
    for (const t of ["driving", "display", "audio", "data"]) { assert.equal(await g.evalAsync(`window.__AR__.click(${JSON.stringify(t)})`), true); await g.sleep(250); assert.ok((await g.overflowX()) <= 1, "options/" + t + " overflow"); }
    await g.screenshot(join(SHOT_DIR, "options-audio-390.png"));
    await g.evalAsync("window.__AR__.click('Back')");
    await g.sleep(500);
    await visit("credits", "Credits");
    await g.evalAsync("window.__AR__.click('Back')"); await g.sleep(400);
    await visit("howto", "How to play");
    await g.evalAsync("window.__AR__.click('Back')"); await g.sleep(400);
    await visit("car", "Garage");
    await g.evalAsync("window.__AR__.click('Back')"); await g.sleep(400);
    await visit("stages", "Single stage");
    await visit("car", "Waitomo");
    await visit("briefing", "Briefing");
    await checkNoErrors(g, "menus");
  } finally { await g.close(); }
});

test("plays Waitomo with the bot to the finish: plausible time, results screen, no errors", opts, async () => {
  const g = await openGame({ width: 960, height: 540, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    const st0 = await g.evalAsync("window.__AR__.startStage({ stageId: 'waitomo', carId: 'huia', quality: 'low', countdown: true, bot: true })");
    assert.equal(st0.status, "countdown");
    assert.equal(st0.stageId, "waitomo");
    // 3-2-1-GO through real fixed steps, then the stage itself
    let st = await g.evalAsync("window.__AR__.stepSim(120 * 4)");
    assert.equal(st.status, "running", "countdown should have finished");
    assert.ok(st.speedKmh > 5, "the bot is driving after GO");
    st = await g.evalAsync("window.__AR__.finishRun()");
    assert.equal(st.status, "finished", `run ended as ${st.status} at s=${st.s}`);
    const par = await g.evalAsync("window.__AR__._G.stage.parTime");
    assert.ok(st.time > 60 && st.time < 600, "implausible stage time " + st.time);
    assert.ok(st.time > par * 0.6 && st.time < par * 1.6, `time ${st.time.toFixed(1)} s far from par ${par} s`);
    assert.ok(st.splits.length >= 3, "splits recorded");
    assert.ok(st.damage.total < 1);
    await g.evalAsync("window.__AR__.showResults()");
    await g.sleep(600);
    assert.equal(await g.evalAsync("window.__AR__.screenName()"), "results");
    const rows = await g.evalAsync("document.querySelectorAll('#screens .sheet tbody tr').length");
    assert.equal(rows, 8, "time sheet shows player + seven rivals");
    assert.equal(await g.evalAsync("!!document.querySelector('#screens .sheet tr.me')"), true);
    await g.screenshot(join(SHOT_DIR, "results-960.png"));
    const best = await g.evalAsync("window.__AR__.career().profile.best.waitomo && window.__AR__.career().profile.best.waitomo.huia");
    assert.ok(Math.abs(best - st.total) < 0.01, "best time recorded");
    await checkNoErrors(g, "bot run");
  } finally { await g.close(); }
});

test("restarting a stage five times does not leak geometries or textures", opts, async () => {
  const g = await openGame({ width: 640, height: 360, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    const counts = [];
    const ids = ["otago", "waitomo", "otago", "waitomo", "otago", "waitomo", "otago", "waitomo"];
    for (let i = 0; i < ids.length; i++) {
      await g.evalAsync(`window.__AR__.startStage({ stageId: ${JSON.stringify(ids[i])}, carId: 'kea', quality: 'low', fresh: true })`);
      await g.evalAsync("window.__AR__.stepSim(120); window.__AR__.renderNow(); 1");
      const p = await g.evalAsync("window.__AR__.perf()");
      counts.push({ stage: ids[i], geometries: p.geometries, textures: p.textures, programs: p.programs });
    }
    // compare like with like. The first visit is a cold start (lazily created shared textures such as the
    // environment map appear on the next stage change, measured: otago 22 -> 24 then flat), so the
    // baseline is the second visit to the same stage and every later visit must not hold more.
    for (const id of ["otago", "waitomo"]) {
      const c = counts.filter((x) => x.stage === id);
      for (let i = 2; i < c.length; i++) {
        assert.ok(c[i].geometries <= c[1].geometries + 2, `${id} geometries grew ${c[1].geometries} -> ${c[i].geometries}`);
        assert.ok(c[i].textures <= c[1].textures, `${id} textures grew ${c[1].textures} -> ${c[i].textures}`);
        assert.ok(c[i].programs <= c[1].programs, `${id} programs grew ${c[1].programs} -> ${c[i].programs}`);
      }
    }
    // plain same-stage restarts (the in-game "restart stage")
    const base = await g.evalAsync("window.__AR__.perf()");
    for (let i = 0; i < 5; i++) await g.evalAsync("window.__AR__.startStage({ stageId: 'waitomo', carId: 'kea', quality: 'low', fresh: true })");
    const after = await g.evalAsync("window.__AR__.perf()");
    assert.ok(after.geometries <= base.geometries + 5 && after.textures <= base.textures + 1, `restart leak: ${JSON.stringify(base)} -> ${JSON.stringify(after)}`);
    await checkNoErrors(g, "restarts");
  } finally { await g.close(); }
});

test("phone: Waitomo at 390x844 has no sideways scroll, HUD and touch controls show, nothing under the pill", opts, async () => {
  const g = await openGame({ width: 390, height: 844, mobile: true, dpr: 2, query: "nomenu=1&stage=waitomo&quality=low&mute=1" });
  try {
    await g.waitForReady();
    await g.evalAsync("window.__AR__.teleport(300, 0, 70); window.__AR__.stepSim(60); window.__AR__.renderNow(); 1");
    await g.sleep(400);
    assert.ok((await g.overflowX()) <= 1, "overflow " + (await g.overflowX()));
    assert.equal(await g.evalAsync("!document.getElementById('hud').hidden"), true, "HUD visible");
    assert.equal(await g.evalAsync("!!document.querySelector('.touch-controls') && !document.querySelector('.touch-controls').hidden"), true, "touch controls visible");
    const pill = await g.eval(UNDER_PILL);
    assert.deepEqual(pill.hits, [], "controls under the Almanac pill during play");
    await g.screenshot(join(SHOT_DIR, "stage-390.png"));
    // landscape phone
    await g.setViewport(844, 390, 2, true);
    await g.evalAsync("window.__AR__.renderNow(); 1");
    assert.ok((await g.overflowX()) <= 1, "landscape overflow");
    assert.deepEqual((await g.eval(UNDER_PILL)).hits, [], "landscape: controls under the Almanac pill");
    await g.screenshot(join(SHOT_DIR, "stage-844x390.png"));
    await checkNoErrors(g, "phone");
  } finally { await g.close(); }
});

test("championship flow: stage 1 -> results -> standings -> service -> stage 2, with save/resume", opts, async () => {
  const g = await openGame({ width: 1280, height: 720, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    await g.evalAsync("window.__AR__.eraseSave(); 1");
    const click = async (label, wait = 500) => { assert.equal(await g.evalAsync(`window.__AR__.click(${JSON.stringify(label)})`), true, `no button "${label}" on ${await g.evalAsync("window.__AR__.screenName()")}`); await g.sleep(wait); };
    await click("Championship");
    assert.equal(await g.evalAsync("window.__AR__.screenName()"), "difficulty");
    await g.screenshot(join(SHOT_DIR, "difficulty-1280.png"));
    await click("Expert");
    assert.equal(await g.evalAsync("window.__AR__.screenName()"), "car");
    await g.sleep(1200);
    await g.screenshot(join(SHOT_DIR, "car-1280.png"));
    await click("Choose stage 1", 4000);
    assert.equal(await g.evalAsync("window.__AR__.screenName()"), "briefing");
    await g.screenshot(join(SHOT_DIR, "briefing-1280.png"));
    await click("Start stage", 3000);
    let st = await g.evalAsync("window.__AR__.state()");
    assert.equal(st.screen, "stage");
    assert.equal(st.mode, "championship");
    assert.equal(st.stageId, "waitomo");
    await g.evalAsync("window.__AR__.stepSim(120 * 4); window.__AR__.renderNow(); 1");
    await g.screenshot(join(SHOT_DIR, "hud-countdown-1280.png"));
    st = await g.evalAsync("window.__AR__.finishRun()");
    assert.equal(st.status, "finished");
    await g.evalAsync("window.__AR__.showResults()");
    await g.sleep(600);
    assert.equal(await g.evalAsync("window.__AR__.screenName()"), "results");
    await click("Standings");
    assert.equal(await g.evalAsync("window.__AR__.screenName()"), "standings");
    const standings = await g.evalAsync("[...document.querySelectorAll('#screens .sheet tbody tr')].map(r => r.textContent)");
    assert.equal(standings.length, 8);
    await g.screenshot(join(SHOT_DIR, "standings-1280.png"));
    const c1 = await g.evalAsync("window.__AR__.career().championship");
    assert.equal(c1.stageIndex, 1);
    assert.equal(c1.results.length, 1);
    await click("Service area");
    assert.equal(await g.evalAsync("window.__AR__.screenName()"), "service");
    await g.screenshot(join(SHOT_DIR, "service-1280.png"));
    // saved progress survives a reload
    await g.goto("menu=1&quality=low&mute=1");
    await g.waitForReady();
    assert.ok((await g.evalAsync("window.__AR__.buttons()")).some((b) => /Continue championship/i.test(b)), "continue offered after reload");
    await click("Continue championship", 800);
    assert.equal(await g.evalAsync("window.__AR__.screenName()"), "service");
    await click("Go to the start line", 5000);
    st = await g.evalAsync("window.__AR__.state()");
    assert.equal(st.stageId, "whakarewarewa", "stage 2 follows stage 1");
    assert.equal(st.mode, "championship");
    await checkNoErrors(g, "championship");
    await g.evalAsync("window.__AR__.eraseSave(); 1");
  } finally { await g.close(); }
});

test("pause, recover and camera keys work in a stage", opts, async () => {
  const g = await openGame({ width: 960, height: 540, query: "nomenu=1&stage=waitomo&quality=low&mute=1&nopause=1" });
  try {
    await g.waitForReady();
    const key = (code) => g.evalAsync(`(() => { const e = new Event('keydown'); e.code = ${JSON.stringify(code)}; window.dispatchEvent(e); const u = new Event('keyup'); u.code = ${JSON.stringify(code)}; window.dispatchEvent(u); return 1; })()`);
    const cam0 = (await g.evalAsync("window.__AR__.state()")).camera;
    await key("KeyC");
    assert.notEqual((await g.evalAsync("window.__AR__.state()")).camera, cam0, "C cycles the camera");
    await key("Escape");
    assert.equal(await g.evalAsync("window.__AR__.paused()"), true);
    assert.equal(await g.evalAsync("window.__AR__.screenName()"), "pause");
    await g.screenshot(join(SHOT_DIR, "pause-960.png"));
    await g.evalAsync("window.__AR__.click('Resume')");
    assert.equal(await g.evalAsync("window.__AR__.paused()"), false);
    await key("KeyH");
    assert.equal(await g.evalAsync("window.__AR__.hudHidden()"), true);
    await key("KeyH");
    await g.evalAsync("window.__AR__.teleport(500, 0, 60); window.__AR__.stepSim(60); 1");
    await key("KeyR");
    const st = await g.evalAsync("window.__AR__.state()");
    assert.ok(st.penalties.some((p) => p.kind === "reset"), "R recovers with a penalty");
    await checkNoErrors(g, "keys");
  } finally { await g.close(); }
});
