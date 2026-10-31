// Headless-Chrome suite: boots the real page, walks the menus, plays stages with the bot, checks
// results, championship flow, leaks across restarts, phone layout and REAL key events (CDP).
//   npm --prefix aotearoa-rally run browser      (SHOT_DIR=<dir> keeps the menu screenshots; default: OS temp)
// Every wait is a condition (a screen name, a stage ready), never a fixed sleep.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openGame, findChrome } from "./harness.mjs";
import { leakProblems } from "./leak-trend.mjs";
import { walkLayout } from "./layout-walk.mjs";

const SHOT_DIR = process.env.SHOT_DIR || (await mkdtemp(join(tmpdir(), "ar-shots-")));
const chrome = findChrome();
const opts = { skip: chrome ? false : "Chrome not found (set CHROME_PATH)", timeout: 900000 };
const SAVE_KEY = "aotearoa-rally.save.v1";

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

// visible controls with no accessible name
const NAMELESS = `[...document.querySelectorAll("#screens button, #screens input, #screens select, #hud button")]
  .filter((e) => e.offsetParent !== null && !e.closest("[inert]"))
  .filter((e) => !((e.getAttribute("aria-label") || "").trim() || (e.textContent || "").trim() || (e.title || "").trim()))
  .map((e) => e.tagName + "." + e.className)`;

async function checkNoErrors(g, label) {
  const errs = [...g.consoleErrors(), ...(await g.evalAsync("window.__AR__.errors"))];
  assert.deepEqual(errs, [], `${label}: console/page errors`);
}
const on = (g, name, ms = 60000) => g.waitFor(`window.__AR__.screenName() === ${JSON.stringify(name)}`, ms);
const click = async (g, label) => assert.equal(await g.evalAsync(`window.__AR__.click(${JSON.stringify(label)})`), true, `no button "${label}" on ${await g.evalAsync("window.__AR__.screenName()")}`);
const inStage = async (g) => { await g.waitFor("window.__AR__.state().screen === 'stage' && window.__AR__.state().status !== 'none'"); await g.evalAsync("window.__AR__.whenOverlayGone().then(() => 1)"); };

test("boots to the menu with zero errors and every module present", opts, async () => {
  const g = await openGame({ width: 1280, height: 720, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    await on(g, "menu");
    const s = await g.evalAsync("({ st: window.__AR__.state(), mods: window.__AR__.modules, missing: window.__AR__.missing, v: window.__AR__.version })");
    assert.deepEqual(s.missing, [], "lane modules missing");
    assert.equal(s.v, "1.0.0");
    await checkNoErrors(g, "boot");
    await g.screenshot(join(SHOT_DIR, "menu-1280.png"));
  } finally { await g.close(); }
});

test("every menu screen is reachable, fits 390x844, keeps the Almanac pill clear, and every control has a name", opts, async () => {
  const g = await openGame({ width: 390, height: 844, mobile: true, dpr: 2, query: "menu=1&quality=low&mute=1" });
  const visit = async (name, label) => {
    if (label) await click(g, label);
    await on(g, name);
    assert.ok((await g.overflowX()) <= 1, `${name}: horizontal overflow ${await g.overflowX()} px at 390 wide`);
    assert.deepEqual((await g.eval(UNDER_PILL)).hits, [], `${name}: controls under the Almanac pill`);
    assert.deepEqual(await g.eval(NAMELESS), [], `${name}: controls without an accessible name`);
    await g.screenshot(join(SHOT_DIR, `${name}-390.png`));
  };
  const back = async (label, name) => { await click(g, label); await on(g, name); };
  try {
    await g.waitForReady();
    await visit("menu");
    await visit("options", "Options");
    for (const t of ["driving", "display", "audio", "data"]) {
      await click(g, t);
      assert.ok((await g.overflowX()) <= 1, "options/" + t + " overflow");
      assert.deepEqual(await g.eval(NAMELESS), [], `options/${t}: unnamed controls`);
    }
    await g.screenshot(join(SHOT_DIR, "options-data-390.png"));
    await back("Back", "menu");
    await visit("credits", "Credits");
    assert.match(await g.eval("document.querySelector('#screens').textContent"), /AI image generator/, "credits tell the truth about the art");
    await back("Back", "menu");
    await visit("howto", "How to play");
    const howto = await g.eval("document.querySelector('#screens').textContent");
    assert.match(howto, /Accelerate/); assert.doesNotMatch(howto, /Comma|Period|KeyA|WASD/);
    await back("Back", "menu");
    await visit("car", "Garage");
    await back("Menu", "menu");
    await visit("stages", "Single stage");
    await visit("car", "Waitomo");
    await visit("briefing", "Briefing");
    await checkNoErrors(g, "menus");
  } finally { await g.close(); }
});

test("the briefing keeps Start stage on screen at 1280x720, 1366x768, 1024x768, 390x844 and 844x390", opts, async () => {
  const g = await openGame({ width: 1280, height: 720, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    await click(g, "Single stage"); await on(g, "stages");
    await click(g, "Waitomo"); await on(g, "car");
    await click(g, "Briefing"); await on(g, "briefing");
    for (const [w, h, m] of [[1280, 720, false], [1366, 768, false], [1024, 768, false], [390, 844, true], [844, 390, true]]) {
      await g.setViewport(w, h, m ? 2 : 1, m);
      await g.waitFor(`(() => { const b = [...document.querySelectorAll("#screens button")].find((x) => /start stage/i.test(x.textContent)); return !!b && b.getBoundingClientRect().height > 0; })()`);
      const r = await g.eval(`(() => { const b = [...document.querySelectorAll("#screens button")].find((x) => /start stage/i.test(x.textContent)).getBoundingClientRect(); return { top: b.top, bottom: b.bottom, right: b.right, h: innerHeight, w: innerWidth }; })()`);
      assert.ok(r.top >= 0 && r.bottom <= r.h + 1 && r.right <= r.w + 1, `${w}x${h}: Start stage is cut off ${JSON.stringify(r)}`);
      assert.ok((await g.overflowX()) <= 1, `${w}x${h}: sideways scroll`);
      await g.screenshot(join(SHOT_DIR, `briefing-${w}x${h}.png`));
    }
    await checkNoErrors(g, "briefing fit");
  } finally { await g.close(); }
});

test("plays Waitomo with the bot to the finish: plausible time, results, replay returns to the results", opts, async () => {
  const g = await openGame({ width: 960, height: 540, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    const st0 = await g.evalAsync("window.__AR__.startStage({ stageId: 'waitomo', carId: 'huia', quality: 'low', countdown: true, bot: true })");
    assert.equal(st0.status, "countdown");
    assert.equal(st0.stageId, "waitomo");
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
    await g.evalAsync("window.__AR__.showResults(); 1");
    await on(g, "results");
    assert.equal(await g.evalAsync("document.querySelectorAll('#screens .sheet tbody tr').length"), 8, "time sheet shows player + seven rivals");
    assert.equal(await g.evalAsync("!!document.querySelector('#screens .sheet tr.me')"), true);
    const gaps = await g.evalAsync("[...document.querySelectorAll('#screens .sheet tbody tr')].map((r) => r.children[3].textContent.trim())");
    assert.equal(gaps.filter((x) => x === "Leader").length, 1, "exactly one row is the stage leader: " + gaps.join(","));
    await g.screenshot(join(SHOT_DIR, "results-960.png"));
    // finishRun is an API shortcut: the run is marked assisted, so it must not fake a personal best, a ghost or the record banner
    const best = await g.evalAsync("window.__AR__.career().profile.best.waitomo && window.__AR__.career().profile.best.waitomo.huia");
    assert.ok(!best, "an assisted run records no personal best, got " + best);
    assert.equal(await g.evalAsync("window.__AR__._G.lastResult.assisted"), true);
    const txt = await g.eval("document.querySelector('#screens').textContent");
    assert.match(txt, /Assisted run/);
    assert.doesNotMatch(txt, /New personal best/);
    // Watch replay -> Back must land on the results screen again (not the main menu)
    await click(g, "Watch replay"); await on(g, "replay");
    assert.match(await g.eval("document.querySelector('.rb-time').textContent"), /^\d+:\d\d\.\d$/, "replay time is M:SS.s");
    await click(g, "Back"); await on(g, "results");
    await checkNoErrors(g, "bot run");
  } finally { await g.close(); }
});

test("time trial is distinct: no rivals, no sheet, no points", opts, async () => {
  const g = await openGame({ width: 960, height: 540, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    await g.evalAsync("window.__AR__.startStage({ stageId: 'waitomo', carId: 'huia', quality: 'low', countdown: true, bot: true, mode: 'trial' })");
    let st = await g.evalAsync("window.__AR__.stepSim(120 * 2)");
    assert.equal(st.status, "running", "a trial countdown is one second");
    assert.equal(await g.evalAsync("window.__AR__._G.run.timeCap > 0 && window.__AR__.state().mode"), "trial");
    st = await g.evalAsync("window.__AR__.finishRun()");
    await g.evalAsync("window.__AR__.showResults(); 1");
    await on(g, "results");
    assert.equal(await g.evalAsync("document.querySelectorAll('#screens .sheet').length"), 0, "no rival sheet in a trial");
    assert.match(await g.eval("document.querySelector('#screens').textContent"), /Time trial|best lap/i);
    await checkNoErrors(g, "trial");
  } finally { await g.close(); }
});

test("restarting a stage does not leak: trend of geometries, textures and programs over 12 stage visits", opts, async () => {
  const g = await openGame({ width: 640, height: 360, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    const counts = [];
    for (let i = 0; i < 12; i++) {
      const id = i % 2 ? "waitomo" : "otago";
      await g.evalAsync(`window.__AR__.startStage({ stageId: ${JSON.stringify(id)}, carId: 'kea', quality: 'low', fresh: true })`);
      await g.evalAsync("window.__AR__.stepSim(120); window.__AR__.renderNow(); 1");
      const p = await g.evalAsync("window.__AR__.perf()");
      counts.push({ stage: id, geometries: p.geometries, textures: p.textures, programs: p.programs });
    }
    assert.deepEqual(leakProblems(counts), [], JSON.stringify(counts));
    await checkNoErrors(g, "restarts");
  } finally { await g.close(); }
});

test("phone: Waitomo at 390x844 has no sideways scroll, HUD and touch controls show, nothing under the pill", opts, async () => {
  const g = await openGame({ width: 390, height: 844, mobile: true, dpr: 2, query: "nomenu=1&stage=waitomo&quality=low&mute=1" });
  try {
    await g.waitForReady();
    await g.evalAsync("window.__AR__.teleport(300, 0, 70); window.__AR__.stepSim(60); window.__AR__.renderNow(); 1");
    assert.ok((await g.overflowX()) <= 1, "overflow " + (await g.overflowX()));
    assert.equal(await g.evalAsync("!document.getElementById('hud').hidden"), true, "HUD visible");
    assert.equal(await g.evalAsync("!!document.querySelector('.touch-controls') && !document.querySelector('.touch-controls').hidden"), true, "touch controls visible");
    assert.deepEqual((await g.eval(UNDER_PILL)).hits, [], "controls under the Almanac pill during play");
    await g.screenshot(join(SHOT_DIR, "stage-390.png"));
    // portrait touch layout: every control in a bottom corner, nothing in the middle third; steer/gas/brake in the bottom 22 %
    const tc = await g.eval(`(() => { const W = innerWidth, H = innerHeight; const out = [];
      for (const el of document.querySelectorAll(".touch-controls button, .touch-controls .tc-steer")) { const r = el.getBoundingClientRect(); if (r.width <= 0) continue;
        out.push({ n: el.getAttribute("aria-label"), l: r.left, r: r.right, t: r.top, b: r.bottom, op: (() => { let o = 1; for (let e = el; e && !e.classList.contains("touch-controls"); e = e.parentElement) o *= +getComputedStyle(e).opacity; return o * +getComputedStyle(document.querySelector(".touch-controls")).opacity; })() }); } return { W, H, out }; })()`);
    assert.ok(tc.out.length >= 6, "touch controls present");
    for (const c of tc.out) {
      assert.ok(c.r <= tc.W / 3 + 1 || c.l >= (2 * tc.W) / 3 - 1, `touch control ${c.n} sits in the middle third [${Math.round(c.l)}..${Math.round(c.r)}]`);
      assert.ok(c.op <= 0.7, `touch control ${c.n} is too opaque (${c.op})`);
      if (["Steer", "Throttle", "Brake"].includes(c.n)) assert.ok(c.t >= tc.H * 0.78 - 1, `${c.n} reaches above the bottom 22 % (top ${Math.round(c.t)} of ${tc.H})`);
      assert.ok(c.t >= tc.H * 0.7, `touch control ${c.n} is higher than 30 % of the screen`);
    }
    await g.setViewport(844, 390, 2, true);
    await g.evalAsync("window.__AR__.renderNow(); 1");
    assert.ok((await g.overflowX()) <= 1, "landscape overflow");
    assert.deepEqual((await g.eval(UNDER_PILL)).hits, [], "landscape: controls under the Almanac pill");
    await g.screenshot(join(SHOT_DIR, "stage-844x390.png"));
    await checkNoErrors(g, "phone");
  } finally { await g.close(); }
});

async function startChampionship(g) {
  await g.evalAsync("window.__AR__.eraseSave(); 1");
  await click(g, "Championship"); await on(g, "difficulty");
  await click(g, "Expert"); await on(g, "car");
  await click(g, "Choose stage 1"); await on(g, "briefing");
}

test("championship flow: stage 1 -> results -> standings -> service -> stage 2; leaving stage 2 mid-run is a DNF", opts, async () => {
  const g = await openGame({ width: 1280, height: 720, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    await startChampionship(g);
    await g.screenshot(join(SHOT_DIR, "briefing-1280.png"));
    await click(g, "Start stage"); await inStage(g);
    let st = await g.evalAsync("window.__AR__.state()");
    assert.equal(st.mode, "championship");
    assert.equal(st.stageId, "waitomo");
    await g.evalAsync("window.__AR__.stepSim(120 * 4); window.__AR__.renderNow(); 1");
    await g.screenshot(join(SHOT_DIR, "hud-countdown-1280.png"));
    st = await g.evalAsync("window.__AR__.finishRun()");
    assert.equal(st.status, "finished");
    await g.evalAsync("window.__AR__.showResults(); 1");
    await on(g, "results");
    await click(g, "Standings"); await on(g, "standings");
    assert.equal(await g.evalAsync("document.querySelectorAll('#screens .table-wrap').length"), 2, "points and overall-time tables");
    assert.equal(await g.evalAsync("document.querySelectorAll('#screens .table-wrap:first-child .sheet tbody tr').length"), 8);
    await g.screenshot(join(SHOT_DIR, "standings-1280.png"));
    const c1 = await g.evalAsync("window.__AR__.career().championship");
    assert.equal(c1.stageIndex, 1);
    assert.equal(c1.results.length, 1);
    await click(g, "Service area"); await on(g, "service");
    await g.screenshot(join(SHOT_DIR, "service-1280.png"));
    await g.goto("menu=1&quality=low&mute=1");
    await g.waitForReady(); await on(g, "menu");
    assert.ok((await g.evalAsync("window.__AR__.buttons()")).some((b) => /Continue championship/i.test(b)), "continue offered after reload");
    await click(g, "Continue championship"); await on(g, "service");
    await click(g, "Go to the start line"); await on(g, "briefing");
    await click(g, "Start stage"); await inStage(g);
    st = await g.evalAsync("window.__AR__.state()");
    assert.equal(st.stageId, "whakarewarewa", "stage 2 follows stage 1");
    assert.equal(await g.evalAsync("window.__AR__.career().championship.inStage"), true, "stage start is saved");
    // close the page mid-stage, come back, Continue: that stage is a DNF, not a free retry
    await g.goto("menu=1&quality=low&mute=1");
    await g.waitForReady(); await on(g, "menu");
    await click(g, "Continue championship"); await on(g, "standings");
    const c2 = await g.evalAsync("window.__AR__.career().championship");
    assert.equal(c2.stageIndex, 2);
    const me = c2.results[1].sheet.find((r) => r.player);
    assert.equal(me.dnf, true); assert.equal(me.points, 0);
    await checkNoErrors(g, "championship");
    await g.evalAsync("window.__AR__.eraseSave(); 1");
  } finally { await g.close(); }
});

test("championship pause has no restart; Retire asks first and scores a DNF; Esc resumes", opts, async () => {
  const g = await openGame({ width: 1280, height: 720, query: "menu=1&quality=low&mute=1&nopause=1" });
  try {
    await g.waitForReady();
    await startChampionship(g);
    await click(g, "Start stage"); await inStage(g);
    await g.keyPress("Escape");
    await on(g, "pause");
    const btns = await g.evalAsync("window.__AR__.buttons()");
    assert.ok(!btns.some((b) => /restart/i.test(b)), "no restart in a championship: " + btns.join("|"));
    assert.ok(btns.some((b) => /retire/i.test(b)) && btns.some((b) => /respawn on road/i.test(b)), btns.join("|"));
    await g.keyPress("Escape"); // the pause key resumes
    await g.waitFor("window.__AR__.paused() === false");
    await g.keyPress("Escape"); await on(g, "pause");
    await click(g, "Retire"); await on(g, "confirm");
    await g.keyPress("Escape"); // cancels the dialog, stays paused on the pause menu
    await on(g, "pause");
    assert.equal(await g.evalAsync("window.__AR__.paused()"), true);
    await click(g, "Retire"); await on(g, "confirm");
    await click(g, "Retire (DNF)"); await on(g, "results", 30000);
    assert.match(await g.eval("document.querySelector('#screens').textContent"), /DNF/);
    const ch = await g.evalAsync("window.__AR__.career().championship");
    assert.equal(ch.stageIndex, 1);
    assert.equal(ch.results[0].sheet.find((r) => r.player).dnf, true);
    assert.equal(ch.inStage, false);
    await checkNoErrors(g, "retire");
    await g.evalAsync("window.__AR__.eraseSave(); 1");
  } finally { await g.close(); }
});

test("a hostile save (unknown car) still shows the title menu, and Erase save data is offered", opts, async () => {
  const g = await openGame({ width: 1280, height: 720, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    await g.evalAsync(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, JSON.stringify({ v: 1, profile: {}, championship: { difficulty: "pro", carId: "ghost-car", livery: 99, stageIndex: 0, results: [], setup: {}, damage: { total: "x" } } })); 1`);
    await g.goto("menu=1&quality=low&mute=1");
    await g.waitForReady(); await on(g, "menu");
    assert.equal(await g.evalAsync("window.__AR__.career().championship"), null, "unusable championship dropped");
    await click(g, "Options"); await on(g, "options");
    await click(g, "data");
    assert.ok((await g.evalAsync("window.__AR__.buttons()")).some((b) => /Erase everything/i.test(b)));
    await checkNoErrors(g, "hostile save");
  } finally { await g.close(); }
});

test("REAL key events: A/Z/comma/period drive and steer, Escape pauses without quitting, WASD does nothing", opts, async () => {
  const g = await openGame({ width: 960, height: 540, query: "nomenu=1&stage=waitomo&quality=low&mute=1&nopause=1" });
  try {
    await g.waitForReady();
    await g.evalAsync("window.__AR__.hideOverlays()");
    const num = (k) => g.evalAsync(`window.__AR__.inputNow().${k}`);
    // WASD is unbound
    await g.keyDown("KeyW"); await g.sleep(250);
    assert.equal(await num("throttle"), 0, "W does not accelerate");
    await g.keyUp("KeyW");
    // A accelerates and a period steers right, together
    await g.keyDown("KeyA"); await g.keyDown("Period");
    await g.waitFor("window.__AR__.inputNow().throttle > 0.9 && window.__AR__.inputNow().steer > 0.5", 15000);
    await g.waitFor("window.__AR__.state().speedKmh > 8", 30000);
    await g.keyUp("Period");
    await g.keyDown("Comma");
    await g.waitFor("window.__AR__.inputNow().steer < -0.3", 15000);
    await g.keyUp("Comma"); await g.keyUp("KeyA");
    await g.keyDown("KeyZ");
    await g.waitFor("window.__AR__.inputNow().brake > 0.9", 15000);
    await g.keyUp("KeyZ");
    await g.waitFor("window.__AR__.inputNow().brake === 0", 15000);
    // Escape: one press pauses and the menu stays a pause menu (it used to fall through to "Quit to menu")
    await g.keyPress("Escape");
    await g.waitFor("window.__AR__.paused() === true");
    await g.sleep(300);
    assert.equal(await g.evalAsync("window.__AR__.screenName()"), "pause", "Escape must not quit the stage");
    await g.keyPress("Escape");
    await g.waitFor("window.__AR__.paused() === false");
    assert.equal(await g.evalAsync("window.__AR__.state().screen"), "stage");
    // quitting needs a confirmation, and Backspace on the pause menu resumes
    await g.keyPress("Escape"); await on(g, "pause");
    await g.keyPress("Backspace");
    await g.waitFor("window.__AR__.paused() === false");
    await g.keyPress("Escape"); await on(g, "pause");
    await click(g, "Quit to menu"); await on(g, "confirm");
    await click(g, "Keep driving"); await on(g, "pause");
    console.log("perf", JSON.stringify(await g.evalAsync("window.__AR__.perf()")));
    await checkNoErrors(g, "real keys");
  } finally { await g.close(); }
});

test("pause, recover and camera keys work in a stage", opts, async () => {
  const g = await openGame({ width: 960, height: 540, query: "nomenu=1&stage=waitomo&quality=low&mute=1&nopause=1" });
  try {
    await g.waitForReady();
    await g.waitFor("window.__AR__.state().camera");
    const cam0 = (await g.evalAsync("window.__AR__.state()")).camera;
    await g.keyPress("KeyC");
    await g.waitFor(`window.__AR__.state().camera !== ${JSON.stringify(cam0)}`);
    await g.keyPress("Escape");
    await on(g, "pause");
    await g.screenshot(join(SHOT_DIR, "pause-960.png"));
    await click(g, "Resume");
    assert.equal(await g.evalAsync("window.__AR__.paused()"), false);
    await g.keyPress("KeyH");
    await g.waitFor("window.__AR__.hudHidden() === true");
    await g.keyPress("KeyH");
    await g.evalAsync("window.__AR__.teleport(500, 0, 60); window.__AR__.stepSim(60); 1");
    await g.keyPress("KeyR");
    await g.waitFor("window.__AR__.state().penalties.some((p) => p.kind === 'reset')");
    await checkNoErrors(g, "keys");
  } finally { await g.close(); }
});

test("a stage restart cleans the car (setDirt(0)) and the camera API reports the active view", opts, async () => {
  const g = await openGame({ width: 640, height: 360, query: "nomenu=1&stage=waitomo&quality=low&mute=1&camera=bonnet" });
  try {
    await g.waitForReady();
    assert.equal(await g.evalAsync("window.__AR__.state().camera"), "bonnet", "?camera= is honoured");
    assert.equal(await g.evalAsync("window.__AR__.setCamera('bumper')"), "bumper");
    await g.evalAsync("(() => { const c = window.__AR__._G.carVis; c.__dirt = []; const o = c.setDirt ? c.setDirt.bind(c) : null; c.setDirt = (v) => { c.__dirt.push(v); return o && o(v); }; return 1; })()");
    await g.evalAsync("window.__AR__.startStage({ stageId: 'waitomo', carId: 'huia', quality: 'low' })");
    assert.ok((await g.evalAsync("window.__AR__._G.carVis.__dirt")).includes(0), "restart calls setDirt(0)");
    await checkNoErrors(g, "dirt/camera");
  } finally { await g.close(); }
});

test("Backspace and gamepad B go back in menus; on the pause menu they resume (never quit); options preview renders", opts, async () => {
  const g = await openGame({ width: 1280, height: 720, query: "menu=1&quality=low&mute=1&nopause=1" });
  // The pad is polled once per rendered frame, and a software-GL frame can take 0.5 s, so a fixed-length press can
  // fall between two polls. Hold B until the expected effect is seen, then release.
  const padB = async (until) => {
    await g.eval("window.__pad = { connected: true, id: 'test', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; navigator.getGamepads = () => [window.__pad]; 1");
    await g.eval("window.__pad.buttons[1].pressed = true; 1");
    try { await g.waitFor(until); } finally { await g.eval("window.__pad.buttons[1].pressed = false; 1"); }
  };
  try {
    await g.waitForReady();
    await on(g, "menu");
    await click(g, "Options"); await on(g, "options");
    await g.keyPress("Backspace"); await on(g, "menu");
    await click(g, "Options"); await on(g, "options");
    await padB(`window.__AR__.screenName() === "menu"`);
    await click(g, "Options"); await on(g, "options"); await click(g, "display");
    await g.waitFor("!!document.querySelector('.opt-preview')");
    await g.screenshot(join(SHOT_DIR, "options-display-1280.png"));
    await g.keyPress("Escape"); await on(g, "menu");
    await g.evalAsync("window.__AR__.startStage({ stageId: 'waitomo', carId: 'huia', quality: 'low' })");
    await g.keyPress("Escape"); await on(g, "pause");
    await padB("window.__AR__.paused() === false");
    assert.equal(await g.evalAsync("window.__AR__.state().screen"), "stage", "pad B resumed, did not quit");
    await g.keyPress("Escape"); await on(g, "pause");
    await g.keyPress("Backspace"); await g.waitFor("window.__AR__.paused() === false");
    assert.equal(await g.evalAsync("window.__AR__.state().screen"), "stage", "Backspace resumed, did not quit");
    await checkNoErrors(g, "back paths");
  } finally { await g.close(); }
});

// Regression: the wet tail-light glow on the road overflowed (exp of a large negative "along" = Inf, times a zero
// smoothstep = NaN) once the car had a heading, and bloom spread that NaN over the whole frame: the 3D view went
// black after any respawn/teleport on medium/high while the HUD kept updating. Needs a real GPU (SwiftShader does not NaN).
for (const quality of ["medium", "high"]) {
  test(`the 3D view is not black after a teleport at speed (${quality})`, opts, async () => {
    const g = await openGame({ width: 960, height: 540, query: `nomenu=1&stage=coromandel&quality=${quality}&mute=1`, extraFlags: ["--use-angle=d3d11", "--enable-gpu-rasterization"] });
    try {
      await g.waitForReady(120000);
      await g.sleep(1500);
      assert.ok(await g.luma() > 10, `${quality}: start view is black`);
      await g.evalAsync("(() => { const A = window.__AR__; A.teleport(0.3 * A._G.stage.lengthM, 0, 95); A.setBot(true); return 1; })()");
      await g.sleep(2000);
      const l = await g.luma();
      assert.ok(l > 10, `${quality}: frame is black after teleport (centre luma ${l})`);
      await checkNoErrors(g, `teleport ${quality}`);
    } finally { await g.close(); }
  });
}

test("a hostile save (__proto__, constructor, prototype keys) cannot pollute Object.prototype; the game still starts a stage", opts, async () => {
  const g = await openGame({ width: 640, height: 360, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    const evil = '{"v":1,"profile":{"best":{"__proto__":{"polluted":123},"constructor":{"prototype":9},"waitomo":{"__proto__":5,"huia":88.5}},"splits":{"__proto__":{"polluted":[1]}},"options":{"__proto__":{"polluted":1},"units":"mph"},"stats":{"__proto__":{"polluted":1}}},"championship":null}';
    await g.evalAsync(`localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(evil)}); localStorage.setItem("aotearoa-rally.ghost.v1.__proto__.constructor", '{"__proto__":{"polluted":1},"n":1,"d":[0,0,0,0,0,0]}'); 1`);
    await g.goto("menu=1&quality=low&mute=1");
    await g.waitForReady(); await on(g, "menu");
    assert.equal(await g.evalAsync("({}).polluted === undefined && Object.prototype.polluted === undefined"), true, "Object.prototype is clean");
    assert.equal(await g.evalAsync("window.__AR__.career().profile.best.waitomo.huia"), 88.5, "the valid part of the save loaded");
    await g.evalAsync("window.__AR__.startStage({ stageId: 'waitomo', carId: 'huia', quality: 'low' })");
    assert.equal(await g.evalAsync("window.__AR__.state().screen"), "stage");
    assert.equal(await g.evalAsync("({}).polluted === undefined"), true);
    await checkNoErrors(g, "hostile save proto keys");
    await g.evalAsync("window.__AR__.eraseSave(); 1");
  } finally { await g.close(); }
});

test("bad URL parameters fall back to the menu with a console warning, never a blank screen", opts, async () => {
  const g = await openGame({ width: 640, height: 360, query: "nomenu=1&stage=nope&car=ghost&weather=hail&quality=ultra9&mute=1" });
  try {
    await g.waitForReady();
    await on(g, "menu");
    const warns = g.logs().filter((l) => l.startsWith("warning:") && l.includes("ignoring ?"));
    for (const k of ["stage=nope", "car=ghost", "weather=hail", "quality=ultra9"]) assert.ok(warns.some((w) => w.includes(k)), `no warning for ${k}`);
    assert.ok(await g.evalAsync("window.__AR__.buttons().length > 3"), "the menu has buttons");
    await checkNoErrors(g, "bad params");
  } finally { await g.close(); }
  const g2 = await openGame({ width: 640, height: 360, query: "nomenu=1&stage=waitomo&car=ghost&weather=hail&quality=low&mute=1" });
  try {
    await g2.waitForReady();
    assert.equal(await g2.evalAsync("window.__AR__.state().stageId"), "waitomo", "a valid stage still starts with the other values dropped");
    assert.equal(await g2.evalAsync("window.__AR__.state().screen"), "stage");
    await checkNoErrors(g2, "bad car and weather");
  } finally { await g2.close(); }
});

test("the loading overlay is compositor-driven (transform/opacity only) and rotates its tips in CSS", opts, async () => {
  const g = await openGame({ width: 640, height: 360, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    const r = await g.eval(`(() => { const cs = (s) => getComputedStyle(document.querySelector(s)); const spans = [...document.querySelectorAll("#load-tip span")];
      return { fillTransition: cs("#load-fill").transitionProperty, fillWill: cs("#load-fill").willChange, fillWidthAnimated: cs("#load-fill").transitionProperty.includes("width"),
        spin: cs(".koru-mark").animationName, spinWill: cs(".koru-mark").willChange, sweep: getComputedStyle(document.querySelector(".load-bar"), "::after").animationName,
        tips: spans.length, tipAnim: spans.map((s) => getComputedStyle(s).animationName), tipProps: getComputedStyle(spans[0]).willChange }; })()`);
    assert.equal(r.fillTransition, "transform"); assert.equal(r.fillWill, "transform"); assert.equal(r.fillWidthAnimated, false);
    assert.equal(r.spin, "spin"); assert.equal(r.spinWill, "transform"); assert.equal(r.sweep, "load-sweep");
    assert.ok(r.tips >= 6 && r.tipAnim.every((a) => a === "tip-cycle"), "every tip is a CSS-animated span");
    assert.equal(r.tipProps, "opacity");
  } finally { await g.close(); }
});

test("HUD: a three-digit speed sits inside the dial numerals and the RIVAL label has a dark pill, at 1280x720 and 1920x1080", opts, async () => {
  const g = await openGame({ width: 1280, height: 720, query: "nomenu=1&stage=waitomo&quality=low&mute=1" });
  try {
    await g.waitForReady();
    for (const [w, h] of [[1280, 720], [1920, 1080]]) {
      await g.setViewport(w, h, 1, false);
      await g.evalAsync("window.__AR__.teleport(1500, 0, 150); window.__AR__.stepSim(36); window.__AR__.renderNow(); 1");
      await g.sleep(200);
      const r = await g.eval(`(() => { const gg = document.querySelector(".gauge").getBoundingClientRect(); const sp = document.querySelector(".gauge .speed");
        const range = document.createRange(); range.selectNodeContents(sp); const t = range.getBoundingClientRect();
        const lbl = document.querySelector(".h-delta > span"); const bg = getComputedStyle(lbl).backgroundColor.match(/[\\d.]+/g).map(Number);
        return { text: sp.textContent, gw: gg.width, cx: gg.left + gg.width / 2, tl: t.left, tr: t.right, w3: sp.classList.contains("w3"), alpha: bg.length > 3 ? bg[3] : 1, lum: bg[0] + bg[1] + bg[2] }; })()`);
      assert.ok(+r.text >= 100, `speed ${r.text} should be three digits`);
      assert.equal(r.w3, true, "three-digit class");
      assert.ok(r.tr - r.tl <= r.gw * 0.5, `${w}: readout ${Math.round(r.tr - r.tl)}px wide in a ${Math.round(r.gw)}px dial`);
      assert.ok(r.tl >= r.cx - r.gw * 0.28 && r.tr <= r.cx + r.gw * 0.28, `${w}: readout leaves the numerals' inner radius`);
      assert.ok(r.alpha >= 0.6 && r.lum < 60, `${w}: RIVAL pill is not dark enough (alpha ${r.alpha}, rgb sum ${r.lum})`);
      await g.screenshot(join(SHOT_DIR, `hud-150kmh-${w}.png`));
    }
    await checkNoErrors(g, "hud");
  } finally { await g.close(); }
});

test("layout: every primary control is inside the viewport and no two controls overlap, on every screen at 844x390, 390x844 and 1280x720", opts, async () => {
  const res = await walkLayout(SHOT_DIR);
  const bad = Object.entries(res).filter(([, v]) => v.problems.length).map(([k, v]) => k + ": " + v.problems.join("; "));
  assert.deepEqual(bad, []);
  assert.ok(Object.keys(res).length >= 30, "all screens were probed");
});

test("the service area washes the car (setDirt(0)) when you leave it", opts, async () => {
  const g = await openGame({ width: 1280, height: 720, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    await startChampionship(g);
    await click(g, "Start stage"); await inStage(g);
    await g.evalAsync("window.__AR__.stepSim(120 * 4); window.__AR__.finishRun(); window.__AR__.showResults(); 1");
    await on(g, "results");
    await click(g, "Standings"); await on(g, "standings");
    await click(g, "Service area"); await on(g, "service");
    await g.evalAsync("(() => { const c = window.__AR__._G.carVis; c.__dirt = []; const o = c.setDirt.bind(c); c.setDirt = (v) => { c.__dirt.push(v); return o(v); }; return 1; })()");
    await click(g, "Go to the start line"); await on(g, "briefing");
    assert.ok((await g.evalAsync("window.__AR__._G.carVis.__dirt")).includes(0), "service calls setDirt(0)");
    await checkNoErrors(g, "service dirt");
    await g.evalAsync("window.__AR__.eraseSave(); 1");
  } finally { await g.close(); }
});

test("Options > Audio > Co-driver voice: Auto + listed voices, late voiceschanged, persisted, a vanished or hostile saved voice shows Auto, fits 844x390 and 390x844, nothing is spoken", opts, async () => {
  const STUB = `(() => { window.__said = 0; window.__voices = []; const s = window.speechSynthesis;
    s.getVoices = () => window.__voices; s.speak = () => { window.__said++; }; s.cancel = () => {}; return 1; })()`;
  const SET = (v) => `window.__voices = ${JSON.stringify(v)}; speechSynthesis.dispatchEvent(new Event("voiceschanged")); 1`;
  const OPTS = `[...document.querySelector('select[aria-label="Co-driver voice"]').options].map((o) => o.value + "|" + o.textContent)`;
  const g = await openGame({ width: 844, height: 390, mobile: true, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady(); await on(g, "menu");
    await g.eval(STUB);
    await click(g, "Options"); await on(g, "options"); await click(g, "audio");
    assert.deepEqual(await g.eval(OPTS), ["|Auto (best available)"], "no voices yet: only Auto");
    await g.eval(SET([{ name: "Libby", lang: "en-GB" }, { name: "Fenella", lang: "en-NZ" }, { name: "Hans", lang: "de-DE" }]));
    const list = await g.eval(OPTS);
    assert.equal(list[0], "|Auto (best available)"); assert.ok(list.some((x) => x.startsWith("Libby|")) && list.some((x) => x.startsWith("Fenella|")), "late voices arrive");
    assert.ok(!list.some((x) => x.startsWith("Hans|")), "English voices only");
    for (const [w, h] of [[844, 390], [390, 844]]) {
      await g.setViewport(w, h, 1, true); await g.sleep(250);
      const r = await g.eval(`(() => { const e = document.querySelector('select[aria-label="Co-driver voice"]'); e.scrollIntoView({ block: "center" }); const b = e.getBoundingClientRect();
        return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: innerWidth, h: innerHeight, sx: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
      assert.ok(r.l >= 0 && r.r <= r.w + 0.5 && r.t >= 0 && r.b <= r.h + 0.5 && r.r - r.l > 40, `voice row inside ${w}x${h}: ${JSON.stringify(r)}`);
      assert.ok(r.sx <= 1, "no sideways scroll");
    }
    await g.eval(`(() => { const e = document.querySelector('select[aria-label="Co-driver voice"]'); e.value = "Fenella"; e.dispatchEvent(new Event("change")); return 1; })()`);
    assert.equal(await g.evalAsync("window.__AR__.career().profile.options.voiceName"), "Fenella", "choice stored");
    assert.equal(JSON.parse(await g.evalAsync(`localStorage.getItem(${JSON.stringify(SAVE_KEY)})`)).profile.options.voiceName, "Fenella", "choice persisted");
    // a saved voice that no longer exists, and hostile values, show Auto and raise nothing
    for (const bad of ["Gone Voice", 12, { a: 1 }, "__proto__", "x".repeat(5000)]) {
      await g.evalAsync(`(() => { const k = ${JSON.stringify(SAVE_KEY)}; const s = JSON.parse(localStorage.getItem(k)); s.profile.options.voiceName = ${JSON.stringify(bad)}; localStorage.setItem(k, JSON.stringify(s)); return 1; })()`);
      await g.goto("menu=1&quality=low&mute=1"); await g.waitForReady(); await on(g, "menu");
      await g.eval(STUB); await g.eval(`window.__voices = [{ name: "Libby", lang: "en-GB" }]; 1`);
      await click(g, "Options"); await on(g, "options"); await click(g, "audio");
      assert.equal(await g.eval(`document.querySelector('select[aria-label="Co-driver voice"]').value`), "", `Auto shown for ${String(typeof bad === "string" ? bad.slice(0, 12) : JSON.stringify(bad))}`);
      await checkNoErrors(g, "hostile voice " + typeof bad);
    }
    assert.equal(await g.eval("window.__said"), 0, "nothing was spoken");
    await g.evalAsync("window.__AR__.eraseSave(); 1");
  } finally { await g.close(); }
});
