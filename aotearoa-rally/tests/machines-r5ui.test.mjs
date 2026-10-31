// Round 5 MACHINES: service scroll cue (SHIP-03), 844x390 briefing and pause fit (D7), truthful respawn banner (D6), setBot marks the run assisted (SHIP-04).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openGame, findChrome } from "./harness.mjs";

const chrome = findChrome();
const opts = { skip: chrome ? false : "Chrome not found (set CHROME_PATH)", timeout: 600000 };
const on = (g, n) => g.waitFor(`window.__AR__.screenName() === ${JSON.stringify(n)}`, 60000);
const click = async (g, l) => { if (!(await g.evalAsync(`window.__AR__.click(${JSON.stringify(l)})`))) throw new Error(`no button "${l}"`); };
const inStage = (g) => g.waitFor("window.__AR__.state().screen === 'stage' && window.__AR__.state().status !== 'none'");
const buttonRects = (g, scope) => g.eval(`(() => [...document.querySelectorAll(${JSON.stringify(scope)})].filter((b) => b.offsetParent !== null).map((b) => { const r = b.getBoundingClientRect(); return { n: b.textContent.trim().slice(0, 20), top: r.top, bottom: r.bottom, right: r.right, left: r.left }; }))()`);

test("respawn text never claims a checkpoint (the car goes back about 15 m), and setBot(true) marks the run assisted", () => {
  const src = readFileSync(new URL("../game.mjs", import.meta.url), "utf8");
  assert.ok(!/back at checkpoint|back to checkpoint\"/i.test(src.split("case \"respawn\"")[1].split("case \"wrongWay\"")[0]), "respawn banner must not say checkpoint");
});

test("browser: respawn banner is truthful; setBot(true) mid-run marks the run assisted", opts, async () => {
  const g = await openGame({ width: 960, height: 540, query: "menu=1&quality=low&mute=1&nopause=1" });
  try {
    await g.waitForReady();
    await g.evalAsync("window.__AR__.startStage({ stageId: 'waitomo', carId: 'huia', quality: 'low', countdown: false })");
    await g.evalAsync("window.__AR__.stepSim(120); 1");
    assert.equal(await g.evalAsync("!!window.__AR__._G.run.assisted"), false, "a fresh run is not assisted");
    await g.evalAsync("window.__AR__.setBot(true); 1");
    assert.equal(await g.evalAsync("window.__AR__._G.run.assisted"), true, "setBot(true) assists the run");
    await g.evalAsync("window.__AR__.setBot(false); 1");
    assert.equal(await g.evalAsync("window.__AR__._G.run.assisted"), true, "switching the bot off does not un-assist it");
    await g.evalAsync("window.__AR__._G.run.respawn('manual'); window.__AR__.stepSim(2); 1");
    const t = await g.eval("document.querySelector('.h-banner').textContent");
    assert.match(t, /Back on the road \+\d+ s/);
    assert.ok(!/checkpoint/i.test(t));
  } finally { await g.close(); }
});

test("service area at 1280x720: rows hide below the fold, a visible cue says so, and it goes away at the end of the list", opts, async () => {
  const g = await openGame({ width: 1280, height: 720, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady();
    await click(g, "Championship"); await on(g, "difficulty"); await click(g, "Expert"); await on(g, "car");
    await click(g, "Choose stage 1"); await on(g, "briefing"); await click(g, "Start stage"); await inStage(g);
    await g.evalAsync("window.__AR__.whenOverlayGone().then(() => 1)");
    await g.evalAsync("window.__AR__.stepSim(480); window.__AR__.finishRun(); window.__AR__.showResults(); 1");
    await on(g, "results"); await click(g, "Standings"); await on(g, "standings"); await click(g, "Service area"); await on(g, "service");
    const cue = "(() => { const c = document.querySelector('.scroll-cue'); return !!c && !c.hidden && c.getBoundingClientRect().height > 0; })()";
    await g.waitFor(cue);
    const m = await g.eval("(() => { const s = document.querySelector('.service'); return { more: s.scrollHeight - s.clientHeight }; })()");
    assert.ok(m.more > 40, "the list is taller than its box here, so the cue is honest");
    await g.eval("(() => { const s = document.querySelector('.service'); s.scrollTop = s.scrollHeight; 1; })()");
    await g.waitFor("document.querySelector('.scroll-cue').hidden === true");
    await g.eval("(() => { const s = document.querySelector('.service'); s.scrollTop = 0; 1; })()");
    await g.waitFor(cue);
    // every row, Brake bias last, is reachable by scrolling and ends up above the footer
    await g.eval("(() => { const s = document.querySelector('.service'); s.scrollTop = s.scrollHeight; 1; })()");
    const last = await g.eval(`(() => { const rows = [...document.querySelectorAll('.service .opt')]; const r = rows[rows.length - 1].getBoundingClientRect(); const f = document.querySelector('.screen-foot').getBoundingClientRect(); return { bottom: r.bottom, foot: f.top, n: rows.length }; })()`);
    assert.equal(last.n, 4);
    assert.ok(last.bottom <= last.foot + 1, `Brake bias is covered by the footer ${JSON.stringify(last)}`);
  } finally { await g.close(); }
});

test("844x390 landscape: the briefing's tyre and difficulty buttons and the pause menu's Quit to menu are on screen", opts, async () => {
  const g = await openGame({ width: 844, height: 390, mobile: true, query: "menu=1&quality=low&mute=1&nopause=1" });
  try {
    await g.waitForReady();
    await click(g, "Single stage"); await on(g, "stages"); await click(g, "Waitomo"); await on(g, "car"); await click(g, "Briefing"); await on(g, "briefing");
    await g.sleep(500);
    const bs = await buttonRects(g, "#screens button");
    for (const want of ["gravel", "tarmac", "snow", "Pro", "Start stage"]) {
      const b = bs.find((x) => x.n.toLowerCase() === want.toLowerCase());
      assert.ok(b, `no ${want} button`);
      assert.ok(b.top >= 0 && b.bottom <= 391 && b.right <= 845, `${want} is off screen ${JSON.stringify(b)}`);
    }
    const foot = bs.find((x) => /start stage/i.test(x.n));
    for (const want of ["gravel", "tarmac", "snow", "Rookie", "Pro", "Expert"]) {
      const b = bs.find((x) => x.n.toLowerCase() === want.toLowerCase());
      assert.ok(b.bottom <= foot.top + 1, `${want} sits under the footer ${JSON.stringify([b, foot])}`);
    }
    await click(g, "Start stage"); await inStage(g);
    await g.evalAsync("window.__AR__.whenOverlayGone().then(() => 1)");
    await g.keyPress("Escape"); await on(g, "pause");
    await g.sleep(500);
    const ps = await buttonRects(g, ".modal button");
    assert.ok(ps.length >= 4);
    const q = ps.find((x) => /quit to menu/i.test(x.n));
    assert.ok(q, "Quit to menu present");
    for (const b of ps) assert.ok(b.top >= 0 && b.bottom <= 391 && b.right <= 845 && b.left >= 0, `${b.n} is off screen ${JSON.stringify(b)}`);
  } finally { await g.close(); }
});
