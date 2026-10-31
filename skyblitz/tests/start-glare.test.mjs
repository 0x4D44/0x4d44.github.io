// R2-V-15 / V-15: pale and sun-washed frames, measured in a real (headless) browser.
//  R2-V-15  Frost's GO frame was pale: ring bloom, an ice deck that threw the sky back and white deck decals put up to 7.4 % white pixels (every channel > 225) and 34 % bright
//           ones (luma > 200) on screen at GO + 0.1-0.2 s, and the craft read at 1.3:1 against the deck it sat on. Now: white <= 3 %, bright <= 25 %, craft vs deck >= 3:1,
//           for the four crafts (the reviewer's gantry probe: falcon / bulldog / comet / sprite).
//  V-15     Sunrise's sun-facing stretches washed the frame out (sky glow, sea glitter, bloom). A free camera at fixed course marks looking at the sun (no craft, no sim, so the
//           frames cannot drift with flight or AI changes) must keep the white share under a bound the old glare broke (desk 5.1 % worst, phone 13.5 %).
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/start-glare.test.mjs      (own static server + headless Chrome, ~4 min)
// Env: SKY_URL / SKY_ROOT as in render-det.test.mjs; GLARE_FROST=falcon,comet picks crafts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launchChrome } from './tools/chrome.mjs';
import { startStaticServer } from './tools/static-server.mjs';
import { GLARE_PROBE } from './tools/glare-probe.mjs';

let BASE = process.env.SKY_URL || '';
const WHITE_MAX = 3, BRIGHT_MAX = 25, DECK_RATIO_MIN = 3;                      // Frost GO frames (percent of the frame; WCAG ratio)
const SUN_WHITE_MAX = { desk: 3, touch: 6 };                                   // Sunrise, looking at the sun (percent of the frame): the old glare put up to 5.1 % (desk) / 13.5 % (phone) there, now 1.8 / 4.5
const RUNS = [{ craft: 'falcon', seed: 7, auto: true }, { craft: 'bulldog', seed: 3, auto: true }, { craft: 'comet', seed: 11, auto: false }, { craft: 'sprite', seed: 5, auto: true }]
  .filter((r) => !process.env.GLARE_FROST || process.env.GLARE_FROST.split(',').includes(r.craft));

let chrome, srv, page;
test.before(async () => {
  if (!BASE) { srv = await startStaticServer({ root: process.env.SKY_ROOT || undefined }); BASE = `${srv.url}/skyblitz`; }
  chrome = await launchChrome({ width: 1280, height: 720 });
  page = await chrome.newPage();
});
test.after(async () => { await chrome?.close(); await srv?.close(); });

const J = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));
const open = async (q) => {
  await page.goto(`${BASE}/?` + new URLSearchParams({ manual: 1, autostart: 1, mute: 1, laps: 3, bots: 7, diff: 'normal', ...q }), { timeout: 90000 });
  await page.waitFor('window.__sky && __sky.ready && __sky.game.state==="race" && !!__sky.game.race && !!__sky.game.player', { timeout: 120000 });
  await page.eval(GLARE_PROBE);
  await page.eval('__sky.ui(false)');
};

for (const run of RUNS) {
  test(`frost / ${run.craft}: the GO frames are not pale and the craft reads against the deck (R2-V-15)`, { timeout: 300000 }, async (t) => {
    await page.s('Emulation.setTouchEmulationEnabled', { enabled: false }); await page.setViewport(1280, 720, { dpr: 1, mobile: false });
    await open({ course: 'frost', quality: 'high', seed: run.seed, craft: run.craft, ...(run.auto ? { autopilot: 1 } : {}) });
    for (let i = 0; i < 80 && (await J('__sky.game.race.state')) !== 'racing'; i++) await page.eval('__sky.sim(5)');      // the countdown, up to GO
    assert.equal(await J('__sky.game.race.state'), 'racing', 'the race starts');
    if (!run.auto) await page.key('ShiftLeft', { type: 'down' });
    const series = []; let deck = null;
    for (let k = 1; k <= 6; k++) {                                                                                         // GO + 0.1 .. 0.6 s, the pale window
      series.push(await J('(()=>{ __sky.step(6, 1); return __glare.now(); })()'));
      if (k === 2) deck = await J('__glare.deck()');                                                                       // GO + 0.2 s, where the old frame was palest
    }
    if (!run.auto) await page.key('ShiftLeft', { type: 'up' });
    const white = Math.max(...series.map((s) => s.white)), bright = Math.max(...series.map((s) => s.bright));
    t.diagnostic(`${run.craft}: white ${series.map((s) => s.white).join(' ')} (max ${white} %), bright ${series.map((s) => s.bright).join(' ')} (max ${bright} %); craft vs deck ${JSON.stringify(deck)}`);
    const problems = [];                                                                                                   // every check is reported, not just the first to fail
    if (!(white <= WHITE_MAX)) problems.push(`white pixels reach ${white} % of the frame (limit ${WHITE_MAX} %)`);
    if (!(bright <= BRIGHT_MAX)) problems.push(`bright pixels reach ${bright} % of the frame (limit ${BRIGHT_MAX} %)`);
    if (!(deck && deck.ratio >= DECK_RATIO_MIN)) problems.push(`the craft reads ${deck && deck.ratio}:1 against the deck (needs ${DECK_RATIO_MIN}:1): ${JSON.stringify(deck)}`);
    problems.push(...(await J('__sky.errors')).map((e) => `console error: ${e}`));
    assert.deepEqual(problems, [], 'the GO frame must not be pale');
  });
}

// Sunrise, free camera 20 m above a course mark, looking at the sun's azimuth and +/- 17 degrees either side, 6 degrees down: the sun disc, its glow, the glitter road
// and the bloom all in frame. Desktop 1280x720 on High; phone 390x844 @2x on the auto preset (Med) with touch emulation.
for (const view of ['desk', 'touch']) {
  test(`sunrise ${view}: looking at the sun does not wash the frame white (V-15)`, { timeout: 300000 }, async (t) => {
    if (view === 'touch') { await page.setViewport(390, 844, { dpr: 2, mobile: true }); await page.s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
    else { await page.s('Emulation.setTouchEmulationEnabled', { enabled: false }); await page.setViewport(1280, 720, { dpr: 1, mobile: false }); }
    await open({ course: 'sunrise', quality: view === 'touch' ? 'auto' : 'high', seed: 7, craft: 'falcon', autopilot: 1 });
    await page.eval('__sky.step(40, 1)');
    const fov = view === 'touch' ? 72 : 60, rows = [];
    for (const mark of ['sweepEnd', 'bay', 'loopTop', 'arch']) for (const off of [0, 0.3, -0.3]) {
      const r = await J(`(()=>{ const g=__sky.game, f={}, s=g.course.marks['${mark}']; if (s == null) return null; g.course.frameAt(s, f);
        const p=f.pos, sd=g.course.environment.sunDir, az=Math.atan2(sd.x, sd.z)+(${off}), pt=-0.1, d=[Math.sin(az)*Math.cos(pt), Math.sin(pt), Math.cos(az)*Math.cos(pt)];
        g.player.model.visible=false; __sky.cam([p.x, p.y+20, p.z], [p.x+d[0]*1000, p.y+20+d[1]*1000, p.z+d[2]*1000], ${fov}); g.renderFrame(1, 0); const st=__glare.now(); g.player.model.visible=true; return st; })()`);
      assert.ok(r, `course mark ${mark} exists`);
      rows.push({ mark, off, ...r });
    }
    const worst = rows.reduce((a, b) => (b.white > a.white ? b : a));
    t.diagnostic(`${view}: white % ${rows.map((r) => `${r.mark}${r.off >= 0 ? '+' : ''}${r.off}=${r.white}`).join(' ')}; worst ${JSON.stringify(worst)}`);
    assert.ok(worst.white <= SUN_WHITE_MAX[view], `looking at the sun from ${worst.mark} (${worst.off} rad off) puts ${worst.white} % of the frame at white (limit ${SUN_WHITE_MAX[view]} %)`);
    assert.deepEqual(await J('__sky.errors'), [], 'no console errors');
  });
}
