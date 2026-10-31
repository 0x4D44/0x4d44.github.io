// In-race HUD in real headless Chrome (one static server, one browser, one page) plus the pure HUD models in Node.
// Every check is its own node:test subtest, so a failure is reported where it happens and the checks after it still run.
// Events are emitted on the game's real event bus (the payloads damage.js / items.js / progress.js / race.js send) and the DOM is read back.
// Run: node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/hud-dom.test.mjs        (about 3 minutes; the full-race feed count dominates)
//   HUD_ONLY=<regex>   run only the checks whose name matches (case-insensitive), e.g. HUD_ONLY='V-3|P-18'
//   HUD_ROOT=<dir holding skyblitz/>   serve and import a frozen copy of the game (mutation runs: revert one fix in the copy and watch its check fail)
//   HUD_PURE_ONLY=1    only the Node checks (no browser)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.HUD_ROOT || '';
const SRC = ROOT ? join(ROOT, 'skyblitz', 'src') : join(import.meta.dirname, '..', 'src');
const mod = (f) => import(pathToFileURL(join(SRC, f)).href);
const { Feed, FEED, hitEntry, launchEntry, passEntry, feedText, feedHardMax } = await mod('ui/hud-feed.js');
const { layoutPlates, PLATE, lockLabelSide, lockLabelBox, lockLabelPush, LOCK_PUSH } = await mod('ui/hud-layout.js');
const { rocketHint, rocketTip } = await mod('ui/rocket-hint.js');
const { RACE } = await mod('race/balance.js');
const { popupText } = await mod('ui/hud.js');
const { cloudPixels } = await mod('ui/hud-smoke.js');
const only = process.env.HUD_ONLY && new RegExp(process.env.HUD_ONLY, 'i');
const check = (name, fn, opts = {}) => test(name, { skip: only && !only.test(name) ? 'HUD_ONLY' : false, timeout: 300000, ...opts }, fn);

// ---------------------------------------------------------------------------------------------------- pure models (Node)
const me = (r) => !!r && r.isPlayer === true;
const R = (id, name, isPlayer = false) => ({ id, name, isPlayer });
const YOU = R(0, 'You', true), ACE = R(1, 'Ace Hardcastle'), BEA = R(2, 'Bea Vega'), CY = R(3, 'Cy Moreau');
const add = (feed, e) => { const x = e && feed.add(e); return x; };

check('P-12: AI-vs-AI cannon fire and bumps never reach the feed; contacts with the player do, once per contact', () => {
  const f = new Feed();
  for (let i = 0; i < 7; i++) assert.equal(hitEntry({ racer: BEA, by: ACE, kind: 'cannon' }, me), null, 'AI-vs-AI cannon hit is noise');
  assert.equal(hitEntry({ racer: ACE, by: BEA, kind: 'racer' }, me), null, 'an AI-vs-AI bump is noise');
  assert.equal(hitEntry({ racer: BEA, by: null, kind: 'wall' }, me), null, 'an AI scraping a wall is noise');
  for (let i = 0; i < 7; i++) add(f, hitEntry({ racer: YOU, by: ACE, kind: 'cannon' }, me));
  assert.deepEqual(f.lines.map(feedText), ['Ace Hardcastle hit you x7'], 'seven cannon hits are one merged line');
  // one contact is reported once per side (collision.js emits racer:hit twice): one line
  add(f, hitEntry({ racer: YOU, by: BEA, kind: 'racer' }, me)); add(f, hitEntry({ racer: BEA, by: YOU, kind: 'racer' }, me));
  assert.deepEqual(f.lines.map(feedText).slice(1), ['Collided with Bea Vega'], 'the two reports of one bump are one line');
  f.tick(0.6); add(f, hitEntry({ racer: YOU, by: BEA, kind: 'racer' }, me)); add(f, hitEntry({ racer: BEA, by: YOU, kind: 'racer' }, me));
  assert.equal(feedText(f.lines.find((l) => /Collided/.test(l.text))), 'Collided with Bea Vega x2', 'a second contact half a second later is a repeat');
  assert.equal(hitEntry({ racer: YOU, by: null, kind: 'wall' }, me).text, 'You crashed (wall)');
  // missiles and launches
  assert.equal(launchEntry({ owner: ACE, target: BEA }, me), null, 'an AI missile at another AI is not shown');
  assert.equal(launchEntry({ owner: ACE, target: YOU }, me).text, 'Ace Hardcastle fired at you', 'R2-V-11: the object "you" is lower case in mid-sentence');
  assert.equal(launchEntry({ owner: YOU, target: BEA }, me).text, 'You fired at Bea Vega');
  const m = hitEntry({ racer: BEA, by: ACE, kind: 'missile' }, me);
  assert.ok(m && !m.mine && /missile hit/.test(m.text), 'a missile hit between rivals is news, and not about the player: ' + JSON.stringify(m));
  assert.equal(hitEntry({ racer: YOU, by: ACE, kind: 'lightning' }, me).text, "Ace Hardcastle's storm hit you");
});

check('P-12: lines about the player stay at least 2 s and last 5 s; rival lines last 3 s and are evicted first', () => {
  const f = new Feed();
  add(f, hitEntry({ racer: YOU, by: ACE, kind: 'cannon' }, me));
  // a storm of rival-only news must not push the player line out
  const kinds = ['missile', 'mine', 'emp', 'lightning'], rivals = [ACE, BEA, CY];
  for (let i = 0; i < 12; i++) add(f, hitEntry({ racer: rivals[(i + 1) % 3], by: rivals[i % 3], kind: kinds[i % 4] }, me));
  assert.ok(f.lines.length <= FEED.max, 'the feed is capped: ' + f.lines.length);
  assert.ok(f.lines.some((l) => l.mine), 'the player line survives a storm of rival lines');
  f.tick(1.9); assert.ok(f.lines.some((l) => l.mine), 'still there after 1.9 s');
  f.tick(1.2); assert.ok(f.lines.every((l) => l.mine), 'rival lines are gone after 3 s');
  f.tick(2.0); assert.equal(f.lines.length, 0, 'the player line is gone after 5 s');
  // many player lines at once: they push out each other only after their pin time, and the feed grows to hardMax first
  const g = new Feed();
  for (let i = 0; i < 6; i++) add(g, { key: 'k' + i, text: 'line ' + i, mine: true });
  assert.ok(g.lines.length <= FEED.hardMax && g.lines.length > FEED.max, 'pinned lines may exceed max up to hardMax: ' + g.lines.length);
  g.tick(2.1); add(g, { key: 'k9', text: 'line 9', mine: true });
  assert.ok(g.lines.length <= FEED.max, 'after the pin time the cap holds again: ' + g.lines.length);
});

check('R2-V-11: the object "you" is lower case in every feed line; the opening "You passed" lines are one counted line; a short screen holds four pinned lines at most', () => {
  // text: a mid-sentence "You" never reaches the screen, from the model or from any caller; a line that starts with "You" keeps its capital
  assert.equal(launchEntry({ owner: ACE, target: YOU }, me).text, 'Ace Hardcastle fired at you');
  assert.equal(feedText({ text: 'Zed fired at You', n: 1 }), 'Zed fired at you', 'feedText itself lowers a trailing "You" (a caller such as hud.say may send one)');
  assert.equal(feedText({ text: 'Zed fired at You', n: 3 }), 'Zed fired at you x3');
  assert.equal(feedText({ text: 'You crashed (wall)', n: 1 }), 'You crashed (wall)'); assert.equal(feedText({ text: 'You hit Bea Vega', n: 2 }), 'You hit Bea Vega x2');
  const all = new Feed({ hardMax: 99, max: 99 });
  for (const e of [launchEntry({ owner: ACE, target: YOU }, me), launchEntry({ owner: YOU, target: BEA }, me), hitEntry({ racer: YOU, by: ACE, kind: 'cannon' }, me), hitEntry({ racer: YOU, by: ACE, kind: 'missile' }, me),
    hitEntry({ racer: BEA, by: YOU, kind: 'cannon' }, me), hitEntry({ racer: YOU, by: BEA, kind: 'racer' }, me), hitEntry({ racer: YOU, by: null, kind: 'wall' }, me), passEntry({ racer: ACE, passed: YOU }, me), passEntry({ racer: YOU, passed: ACE }, me)]) add(all, e);
  assert.equal(all.lines.length, 9, 'every kind of line about the player was produced: ' + all.lines.map(feedText));
  for (const l of all.lines) assert.ok(!/\S You\b/.test(feedText(l)), `no capital "You" in the middle of a line: "${feedText(l)}"`);
  // the opening passes: one line that counts distinct rivals
  const f = new Feed();
  add(f, passEntry({ racer: YOU, passed: ACE }, me)); assert.deepEqual(f.lines.map(feedText), ['You passed Ace Hardcastle'], 'one pass names the rival');
  add(f, passEntry({ racer: YOU, passed: BEA }, me)); add(f, passEntry({ racer: YOU, passed: CY }, me)); add(f, passEntry({ racer: YOU, passed: R(4, 'Dee Okoro') }, me));
  assert.deepEqual(f.lines.map(feedText), ['You passed 4 rivals'], 'four passes in a row are one line, not four');
  add(f, passEntry({ racer: YOU, passed: ACE }, me)); assert.deepEqual(f.lines.map(feedText), ['You passed 4 rivals'], 'passing the same rival again does not make a fifth rival');
  assert.equal(passEntry({ racer: ACE, passed: BEA }, me), null, 'a pass between two rivals is not news');
  add(f, passEntry({ racer: ACE, passed: YOU }, me)); add(f, passEntry({ racer: BEA, passed: YOU }, me));
  assert.deepEqual(f.lines.map(feedText), ['You passed 4 rivals', 'Ace Hardcastle passed you', 'Bea Vega passed you'], 'a rival passing the player keeps a line per rival');
  f.tick(5.1); assert.deepEqual(f.lines, [], 'the counted line expires like any other');
  add(f, passEntry({ racer: YOU, passed: ACE }, me)); assert.deepEqual(f.lines.map(feedText), ['You passed Ace Hardcastle'], 'and a later pass starts a fresh count');
  // a short screen: pinned lines (the player's, inside their first 2 s) may not push the feed past four
  assert.equal(feedHardMax(390), 4); assert.equal(feedHardMax(FEED.shortH), 4); assert.equal(feedHardMax(FEED.shortH + 1), FEED.hardMax); assert.equal(feedHardMax(1080), FEED.hardMax);
  const pinned = (hardMax) => { const g = new Feed({ hardMax }); for (let i = 0; i < 6; i++) add(g, { key: 'k' + i, text: 'line ' + i, mine: true }); return g.lines.length; };
  assert.equal(pinned(feedHardMax(390)), 4, 'six pinned lines on a 390 px tall screen keep four'); assert.equal(pinned(feedHardMax(720)), 6, 'a tall screen still holds the six');
});

check('P-18: layoutPlates keeps plates apart, on the screen and out of every zone', () => {
  const W = 1280, H = 720, zones = [{ l: 520, t: 12, r: 760, b: 92 }, { l: 1100, t: 12, r: 1268, b: 92 }, { l: 10, t: 600, r: 250, b: 708 }, { l: 400, t: 640, r: 780, b: 708 }];
  const cases = [
    [[640, 360], [650, 365], [630, 370], [645, 362], [640, 368], [655, 360]],                           // six rivals piled on one spot
    [[2, 300], [1278, 300], [640, 2], [640, 718], [5, 5], [1275, 715]],                                  // on the edges and corners
    [[640, 60], [1180, 70], [100, 650], [600, 700], [641, 60], [1181, 71]],                              // under the panels
  ];
  for (const pts of cases) {
    const cands = pts.map(([x, y], i) => ({ id: i, x, y, w: 80 + (i % 3) * 20, h: 18 }));
    const out = layoutPlates(cands, zones, W, H);
    assert.ok(out.length >= 1 && out.length <= PLATE.max, 'at most PLATE.max plates, at least one: ' + out.length);
    const rects = out.map((o) => ({ l: o.l, t: o.t, r: o.l + cands[o.i].w, b: o.t + cands[o.i].h }));
    rects.forEach((a, i) => {
      assert.ok(a.l >= 0 && a.t >= 0 && a.r <= W && a.b <= H, 'inside the screen ' + JSON.stringify(a));
      for (const z of zones) assert.ok(!(a.l < z.r && z.l < a.r && a.t < z.b && z.t < a.b), 'clear of the zone ' + JSON.stringify([a, z]));
      for (let j = i + 1; j < rects.length; j++) { const b = rects[j]; assert.ok(!(a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b), 'plates do not overlap ' + JSON.stringify([a, b])); }
    });
  }
  const fully = layoutPlates([{ id: 1, x: 640, y: 360, w: 90, h: 18 }], [{ l: 0, t: 0, r: W, b: H }], W, H);
  assert.deepEqual(fully, [], 'a plate with no free spot is dropped, not drawn over a panel');
});

check('P-18 (round 2): lockLabelSide puts the target\'s name on a side of the lock ring that covers neither the player\'s craft, the screen edge nor a panel', () => {
  const W = 1280, H = 720, label = { w: 150, h: 18 }, craft = { l: 500, t: 480, r: 780, b: 640 };
  const hits = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const side = (ring, c, zones = [], cur = 'below') => lockLabelSide({ ...ring, r: 40 }, label, c, zones, W, H, cur);
  assert.equal(side({ x: 640, y: 300 }, craft), 'below', 'nothing in the way: the name stays under the ring');
  assert.equal(side({ x: 640, y: 440 }, craft), 'above', 'the craft is right under the ring: the name goes above it');
  assert.ok(!hits(lockLabelBox('above', { x: 640, y: 440, r: 40 }, label), craft));
  assert.ok(hits(lockLabelBox('below', { x: 640, y: 440, r: 40 }, label), craft), 'the default place (under the ring) is across the craft in that case');
  assert.equal(side({ x: 640, y: 300 }, craft, [], 'above'), 'above', 'a side that covers nothing is kept: no hopping between frames');
  assert.equal(side({ x: 640, y: 30 }, { l: 500, t: 60, r: 780, b: 200 }), 'right', 'under the ring is the craft and above is off the screen: beside it');
  assert.equal(side({ x: 640, y: 440 }, craft, [{ l: 0, t: 360, r: 1280, b: 400 }]), 'right', 'below is the craft, above is a panel: beside the ring');
  assert.equal(side({ x: 640, y: 440 }, null), 'below', 'no craft in view (nose camera): the default');
  const huge = { l: 0, t: 0, r: W, b: H };
  assert.ok(['below', 'above', 'right', 'left'].includes(side({ x: 640, y: 360 }, huge)), 'everything covered: still answers');
  assert.equal(side({ x: 1250, y: 300 }, craft), 'left', 'at the right edge the name goes to the other side');
  assert.equal(side({ x: 640, y: 690 }, { l: 500, t: 480, r: 780, b: 600 }), 'above', 'under the ring is off the bottom of the screen');
  // no side is free (a wide craft right at the ring): the name slides out along its side until it clears the craft's edge
  const wide = { l: 480, t: 340, r: 800, b: 540 }, ring = { x: 640, y: 440, r: 40 };
  const s = side(ring, wide), push = lockLabelPush(s, ring, label, wide);
  assert.ok(push > 0 && push % LOCK_PUSH.step === 0, 'the name needs a slide: ' + push);
  assert.ok(!hits(lockLabelBox(s, ring, label, 3 + push), wide), `after sliding ${push} px the ${s} box is clear of the craft`);
  assert.equal(lockLabelPush('below', { x: 640, y: 300, r: 40 }, label, craft), 0, 'clear already: no slide'); assert.equal(lockLabelPush('below', ring, label, null), 0, 'no craft: no slide');
});

check('E-02: the countdown hint and the loading tip state the rule race.js applies (a fresh press in the last RACE.rocketWindow seconds)', async () => {
  assert.ok(Math.abs(RACE.rocketWindow - 0.5) < 1e-9, 'this test words the half-second rule: update rocket-hint.js and this check together if the window changes');
  const hint = rocketHint(), tip = rocketTip();
  assert.match(hint, /TAP BOOST IN THE LAST HALF SECOND BEFORE GO/); assert.match(hint, /EARLIER STALLS/); assert.doesNotMatch(hint, /HOLD/);
  assert.match(tip, /Tap BOOST in the last half second before GO/); assert.doesNotMatch(tip, /Hold BOOST/);
  const keep = RACE.rocketWindow; RACE.rocketWindow = 1;
  try { assert.match(rocketHint(), /LAST SECOND BEFORE GO/, 'the wording follows RACE.rocketWindow'); } finally { RACE.rocketWindow = keep; }
  const { TIPS, tipAt } = await mod('ui/select.js');
  assert.ok(TIPS.some((_, i) => tipAt(i, {}) === tip), 'the loading tips carry the same rule');
  assert.ok(!TIPS.some((t, i) => /Hold BOOST in the last/.test(tipAt(i, {}))), 'the old "hold boost" tip is gone');
  const race = readFileSync(join(SRC, 'race', 'race.js'), 'utf8');
  assert.match(race, /t <= RACE\.rocketWindow/, 'race.js still applies RACE.rocketWindow (re-word the hint if the rule changed)');
});

check('R2-V-17: the smoke texture is soft, uneven cloud noise that tiles without a seam (not a flat veil, not static)', () => {
  const N = 128, d = cloudPixels(N), again = cloudPixels(N);
  assert.deepEqual([...d.slice(0, 64)], [...again.slice(0, 64)], 'the same puffs on every run');
  let sum = 0, lo = 1, hi = 0; for (const v of d) { sum += v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const mean = sum / d.length; let ss = 0; for (const v of d) ss += (v - mean) ** 2; const std = Math.sqrt(ss / d.length);
  assert.ok(lo >= 0 && hi <= 1 && hi - lo >= 0.45 && std >= 0.08, `uneven: density spans ${lo.toFixed(2)}..${hi.toFixed(2)}, deviation ${std.toFixed(3)} (a flat veil would be 0)`);
  let step = 0, n = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N - 1; x++) { step += Math.abs(d[y * N + x + 1] - d[y * N + x]); n++; }
  step /= n;
  assert.ok(step <= 0.03, `soft: the mean step between neighbouring pixels is ${step.toFixed(4)} (white noise is about 0.33)`);
  let seam = 0; for (let y = 0; y < N; y++) seam += Math.abs(d[y * N] - d[y * N + N - 1]) / N; let seamV = 0; for (let x = 0; x < N; x++) seamV += Math.abs(d[x] - d[(N - 1) * N + x]) / N;
  assert.ok(seam <= 2 * step && seamV <= 2 * step, `tileable: the step across the tile's edges (${seam.toFixed(4)} across, ${seamV.toFixed(4)} down) is no bigger than inside it (${step.toFixed(4)})`);
  const blocks = (B) => { const m = []; for (let by = 0; by < N; by += B) for (let bx = 0; bx < N; bx += B) { let t = 0; for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) t += d[(by + y) * N + bx + x]; m.push(t / (B * B)); } const mm = m.reduce((a, b) => a + b, 0) / m.length; return Math.sqrt(m.reduce((a, b) => a + (b - mm) ** 2, 0) / m.length); };
  assert.ok(blocks(32) >= 0.05, `billows: the average density changes from one 32-pixel block to the next (${blocks(32).toFixed(3)}), so there are puffs, not just fine grain`);
});

check('V-3: popupText keeps its contract', () => {
  assert.equal(popupText('BARREL ROLL', 3, 18), 'BARREL ROLL x3 +18%'); assert.equal(popupText('LOOP', 1, 0), 'LOOP');
});

if (process.env.HUD_PURE_ONLY) { /* the browser checks below are skipped */ } else {
  const { launchChrome } = await import('./tools/chrome.mjs');
  const { startStaticServer } = await import('./tools/static-server.mjs');
  const srv = process.env.SKY_URL ? null : await startStaticServer({ root: ROOT || undefined });
  const BASE = process.env.SKY_URL || `${srv.url}/skyblitz`, GAME = BASE + '/';
  const QS = 'debug=1&manual=1&autostart=1&mute=1&laps=3&bots=7&course=redrock&seed=7';
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const chrome = await launchChrome({ width: 1280, height: 720 });
  test.after(async () => { await chrome.close(); await srv?.close(); });
  const page = await chrome.newPage();

  // In-page helpers: the HUD, the event bus, rivals placed at screen positions, rectangles, an animation switch.
  const INIT = `(() => {
    const g = __sky.game, THREE = g.THREE;
    window.__t = {
      g, hud: g.ui.hud, ev: g.events,
      ais: () => g.race.racers.filter((r) => !r.isPlayer),
      place(r, nx, ny, dist) { const cam = g.camera; cam.updateMatrixWorld(); const v = new THREE.Vector3(nx, ny, 0.5).unproject(cam); const d = v.sub(cam.position).normalize(); const pos = cam.position.clone().addScaledVector(d, dist); pos.y -= 6; r.flight.pos.copy(pos); r.prev.pos.copy(pos); if (r.render) r.render.pos.copy(pos); },
      clear() { const h = g.ui.hud; h.clearTransient(); if (g.paused) g.setPaused(false); if (g.ui.cur && g.ui.cur.name === 'hint') g.ui.hideAll(); g.ui.hintOpen = false; if (g.input) g.input.handsOffT = 0; },   // (handsOffT: a few seconds of stepping with no key must not leave the hands-off plate up for the next check)
      quiet() { if (!document.getElementById('noanim')) { const s = document.createElement('style'); s.id = 'noanim'; s.textContent = '.hud *, #sb-touch * { animation: none !important; transition: none !important; }'; document.head.append(s); } },
      loud() { document.getElementById('noanim')?.remove(); },
      rect(sel) { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; },
    };
    return true; })()`;
  let cur = null;
  /** Make the page a race at w x h (touch: emulated touch with the overlay built). A touch flip reloads: the overlay is built by the first touch. */
  const env = async (w, h, touch = false) => {
    if (!cur || cur.touch !== touch) {
      await page.s('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      await page.setViewport(w, h, { dpr: 1, mobile: touch });
      await page.goto(`${GAME}?${QS}`);
      await page.waitFor('window.__sky && __sky.ready && __sky.game.state === "race"', { timeout: 120000 });
      if (touch) { const tp = (type, pts) => page.s('Input.dispatchTouchEvent', { type, touchPoints: pts }); await tp('touchStart', [{ x: 5, y: h - 5, id: 1 }]); await tp('touchEnd', []); await delay(300); }
      await page.eval(INIT); cur = { w, h, touch };
    } else if (cur.w !== w || cur.h !== h) { await page.setViewport(w, h, { dpr: 1, mobile: touch }); await delay(250); cur.w = w; cur.h = h; }
    await page.eval(`(() => { __t.loud(); __t.clear(); __sky.step(2); })()`);
  };
  const racing = () => page.eval(`(() => { const r = __t.g.race; if (r.state !== 'racing') __sky.sim(60 * 6); __sky.step(20); __t.clear(); return r.state; })()`);
  const overlap = (a, b) => a && b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1.5;
  const errorsNow = () => page.errors().map((e) => e.text);

  check('V-3: stunts merge by kind into at most two lines, in a left column that leaves the craft area clear', async () => {
    for (const [w, h, touch] of [[1280, 720, false], [844, 390, false], [390, 844, true]]) {
      await env(w, h, touch); await racing();
      const r = await page.eval(`(() => { const { ev, g } = __t, p = g.player; __t.clear();
        for (let i = 0; i < 3; i++) { ev.emit('gate:pass', { racer: p, perfect: true }); ev.emit('racer:stunt', { racer: p, kind: 'nearmiss', reward: 6 }); ev.emit('racer:stunt', { racer: p, kind: 'roll', reward: 12 }); }
        __sky.step(2); const s = document.querySelector('.hud-popups').getBoundingClientRect();
        return { lines: [...document.querySelectorAll('.hud-popups .popup')].map((e) => e.textContent), box: { l: s.left, t: s.top, r: s.right, b: s.bottom }, W: innerWidth, H: innerHeight }; })()`);
      const tag = `${w}x${h}${touch ? 't' : ''}`;
      assert.deepEqual(r.lines, ['ROLL x3 +36%', 'NEAR MISS x3 +18%'], `${tag}: one line per kind, running tally, two lines at most`);
      const craft = { l: r.W * 0.3, t: r.H * 0.4, r: r.W * 0.7, b: r.H * 0.95 };   // where the chase camera keeps the aircraft
      assert.ok(!overlap(r.box, craft), `${tag}: the popup column ${JSON.stringify(r.box)} stays off the craft area ${JSON.stringify(craft)}`);
      assert.ok(r.box.l < r.W * 0.1 && r.box.r < r.W * 0.55, `${tag}: a left column ${JSON.stringify(r.box)}`);
    }
  });

  check('P-12: in the DOM, rival noise is dropped, repeats merge, and the player lines stay readable for 2 s', async () => {
    await env(1280, 720); await racing();
    const r = await page.eval(`(() => { const { ev, g, hud } = __t, p = g.player, [a, b, c] = __t.ais(); __t.clear();
      const lis = () => [...document.querySelectorAll('.hud-ticker li')].map((l) => l.textContent);
      for (let i = 0; i < 7; i++) ev.emit('racer:hit', { racer: b, by: a, kind: 'cannon', pos: b.flight.pos, severity: 0.2 });
      ev.emit('racer:hit', { racer: a, by: b, kind: 'racer', pos: a.flight.pos, severity: 0.3 }); ev.emit('racer:hit', { racer: b, by: a, kind: 'racer', pos: a.flight.pos, severity: 0.3 });
      ev.emit('missile:launch', { id: 1, owner: a, target: b, pos: a.flight.pos });
      const noise = lis().length;
      ev.emit('missile:launch', { id: 2, owner: c, target: p, pos: c.flight.pos });
      for (let i = 0; i < 4; i++) ev.emit('racer:hit', { racer: p, by: c, kind: 'cannon', pos: p.flight.pos, severity: 0.2 });
      ev.emit('racer:hit', { racer: p, by: a, kind: 'racer', pos: p.flight.pos, severity: 0.4 }); ev.emit('racer:hit', { racer: a, by: p, kind: 'racer', pos: p.flight.pos, severity: 0.4 });
      const mine = lis();
      const kinds = ['missile', 'mine', 'emp', 'lightning'], rs = [a, b, c];
      for (let i = 0; i < 12; i++) ev.emit('racer:hit', { racer: rs[(i + 1) % 3], by: rs[i % 3], kind: kinds[i % 4], pos: a.flight.pos, severity: 0.4 });
      const crowded = lis();
      for (let i = 0; i < 19; i++) hud.update(0.1, g);          // 1.9 s of HUD time
      const later = lis();
      for (let i = 0; i < 40; i++) hud.update(0.1, g);          // 5.9 s in all
      return { noise, mine, crowded, later, end: lis(), names: { a: a.name, c: c.name } }; })()`);
    assert.equal(r.noise, 0, 'seven cannon hits, a bump from both sides and an AI missile at an AI add no line: ' + JSON.stringify(r));
    assert.deepEqual(r.mine, [`${r.names.c} fired at you`, `${r.names.c} hit you x4`, `Collided with ${r.names.a}`], 'the player lines, merged and de-duplicated (R2-V-11: "fired at you", lower case)');
    assert.ok(r.crowded.length <= 4, 'the feed is capped at four lines: ' + JSON.stringify(r.crowded));
    for (const l of r.mine) assert.ok(r.later.includes(l), `the player line "${l}" is still up after 1.9 s: ${JSON.stringify(r.later)}`);
    assert.deepEqual(r.end, [], 'every line has expired after 5.9 s');
  });

  check('R2-V-11: in the DOM, a rival\'s missile at the player reads "fired at you", four opening passes are one line, and a short screen shows four pinned lines at most', async () => {
    const run = async (w, h, touch) => { await env(w, h, touch); await racing();
      return page.eval(`(() => { const { ev, g, hud } = __t, p = g.player, rs = __t.ais(); __t.clear(); __t.quiet();
        const lis = () => [...document.querySelectorAll('.hud-ticker li')].map((l) => l.textContent);
        ev.emit('missile:launch', { id: 7, owner: rs[2], target: p, pos: rs[2].flight.pos }); const fired = lis(); __t.clear();
        for (const r of rs.slice(0, 4)) ev.emit('race:overtake', { racer: p, passed: r }); ev.emit('race:overtake', { racer: rs[5], passed: rs[6] }); const passes = lis(); __t.clear();
        ev.emit('race:overtake', { racer: rs[4], passed: p }); const passedBy = lis(); __t.clear();
        for (let i = 0; i < 6; i++) hud.say('pinned line ' + i);   // six lines about the player in the same instant: all pinned for 2 s
        return { fired, passes, passedBy, pinned: lis().length, n: rs.map((r) => r.name), H: innerHeight }; })()`); };
    const tall = await run(1280, 720, false), short = await run(844, 390, false);
    assert.deepEqual(tall.fired, [`${tall.n[2]} fired at you`], 'a rival\'s missile at the player: lower-case "you"');
    for (const r of [tall, short]) {
      assert.deepEqual(r.passes, ['You passed 4 rivals'], `four passes, one line (a pass between two rivals adds none) at ${r.H} px tall: ${JSON.stringify(r.passes)}`);
      assert.deepEqual(r.passedBy, [`${r.n[4]} passed you`]);
    }
    assert.equal(tall.pinned, 6, 'a 720 px tall screen holds six pinned lines'); assert.equal(short.pinned, 4, `a ${short.H} px tall screen holds four: ${short.pinned}`);
  });

  check('P-12: a full race shows at most ~10 rival-vs-rival feed lines a minute', async () => {
    await page.goto(`${GAME}?${QS}`); await page.waitFor('window.__sky && __sky.ready && __sky.game.state === "race"', { timeout: 120000 });
    await page.eval(INIT); cur = { w: 1280, h: 720, touch: false };
    const r = await page.eval(`(() => { const { g, ev } = __t; __sky.autopilot(true); __t.clear();
      const c = { ai: 0, mine: 0, hits: 0, aiHits: 0 }, ul = document.querySelector('.hud-ticker'), count = (recs) => { for (const m of recs) for (const n of m.addedNodes) if (n.nodeName === 'LI') n.classList.contains('mine') ? c.mine++ : c.ai++; };
      const obs = new MutationObserver(count); obs.observe(ul, { childList: true });
      ev.on('racer:hit', (e) => { c.hits++; if (e.racer && !e.racer.isPlayer && e.by && !e.by.isPlayer) c.aiHits++; });
      const t0 = g.simTime; __sky.step(60 * 100, 12); c.secs = g.simTime - t0; count(obs.takeRecords()); obs.disconnect(); return c; })()`);
    await delay(50);
    const perMin = (r.ai * 60) / r.secs;
    console.log(`    full race: ${r.secs.toFixed(0)} s, racer:hit ${r.hits} (rival-vs-rival ${r.aiHits}), feed lines: rivals ${r.ai} (${perMin.toFixed(1)}/min), player ${r.mine}`);
    assert.ok(r.secs > 60, 'ran at least a minute of race: ' + r.secs);
    assert.ok(perMin <= 10, `rival-vs-rival feed lines per minute ${perMin.toFixed(1)} (racer:hit rival-vs-rival ${r.aiHits})`);
  });

  check('P-18: nameplates never overlap each other, a HUD panel, a touch button or the screen edge', async () => {
    for (const [w, h, touch] of [[1280, 720, false], [390, 844, true], [844, 390, true]]) {
      await env(w, h, touch); await racing();
      const r = await page.eval(`(async () => { const { g, ev } = __t, ais = __t.ais(); __t.clear(); __t.quiet();
        const spots = [[0.02, 0.1, 90], [0.05, 0.14, 120], [-0.02, 0.06, 150], [0.0, 0.2, 200], [-0.97, 0.1, 100], [0.0, 0.86, 140], [0.9, 0.86, 130]];
        ais.forEach((r, i) => spots[i] && __t.place(r, spots[i][0], spots[i][1], spots[i][2]));
        g.renderFrame(1, 0); await new Promise((r) => setTimeout(r, 260)); g.renderFrame(1, 0); g.renderFrame(1, 0);
        const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        const shown = () => [...document.querySelectorAll('.nameplate')].filter((e) => e.style.display !== 'none').map((e) => ({ n: e.textContent, ...box(e) }));
        const plates = shown();
        const panels = ['.hud-lapbox', '.hud-pos', '.hud-speed', '.hud-bc', '.hud-item', '.hud-shield', '.hud-map', '.hud-popups', '.hud-ticker'].map((s) => [s, document.querySelector(s)]).filter(([, e]) => e && getComputedStyle(e).display !== 'none').map(([s, e]) => ({ s, ...box(e) }));
        for (const b of document.querySelectorAll('#sb-touch > *')) if (b.textContent.trim()) panels.push({ s: 'btn:' + b.textContent.trim(), ...box(b) });
        // the player locks the rival in the middle of the pile: its ring and the name under it are an obstacle too (P-14 / P-18)
        ev.emit('missile:lock', { owner: g.player, target: ais[0], progress: 0.5, targetId: ais[0].id, targetName: ais[0].name }); g.renderFrame(1, 0); g.renderFrame(1, 0);
        const ringEl = document.querySelector('.hud-lock'), lockPlates = shown();
        return { plates, panels, lockPlates, lockOn: getComputedStyle(ringEl).display !== 'none', ring: box(ringEl), name: box(document.querySelector('.lk-name')), locked: ais[0].name, W: innerWidth, H: innerHeight }; })()`);
      const tag = `${w}x${h}${touch ? 't' : ''}`;
      assert.ok(r.plates.length >= 2 && r.plates.length <= 4, `${tag}: between two and four plates are shown: ${JSON.stringify(r.plates.map((p) => p.n))}`);
      assert.ok(r.lockOn && r.lockPlates.length >= 1 && r.lockPlates.length <= 4, `${tag}: the reticle is up and the other rivals keep a plate: ${JSON.stringify(r.lockPlates.map((p) => p.n))}`);
      for (const [what, list] of [['', r.plates], [' while a lock is on', r.lockPlates]]) list.forEach((a, i) => {
        assert.ok(a.l >= -0.5 && a.t >= -0.5 && a.r <= r.W + 0.5 && a.b <= r.H + 0.5, `${tag}: plate ${a.n} is clipped by the screen${what} ${JSON.stringify(a)}`);
        for (const z of r.panels) assert.ok(!overlap(a, z), `${tag}: plate ${a.n} overlaps ${z.s}${what}`);
        for (const b of list.slice(i + 1)) assert.ok(!overlap(a, b), `${tag}: plates ${a.n} and ${b.n} overlap${what}`);
        if (what) { assert.ok(!overlap(a, r.ring), `${tag}: plate ${a.n} sits on the lock ring`); assert.ok(!overlap(a, r.name), `${tag}: plate ${a.n} sits on the name under the lock ring`); assert.notEqual(a.n, r.locked, `${tag}: the locked rival has no plate besides its reticle`); }
      });
    }
  });

  check('R2-T7: a rival\'s nameplate keeps off the hands-off plate while it shows', async () => {
    await env(1280, 720); await racing();
    const r = await page.eval(`(async () => { const { g, hud } = __t, ais = __t.ais(); __t.clear(); __t.quiet();
      const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      const run = async (hands) => { g.input.handsOffT = hands; hud.update(0.016, g);
        __t.place(ais[0], -0.72, -0.63, 70); for (const o of ais.slice(1)) __t.place(o, 0.1, 0.1, 900);   // the one rival whose plate would sit where the hands-off plate goes: low on the left
        for (let i = 0; i < 3; i++) { g.input.handsOffT = hands; g.renderFrame(1, 0); await new Promise((res) => setTimeout(res, 100)); }
        const plate = box(hud.autoEl), shown = [...document.querySelectorAll('.nameplate')].filter((e) => e.style.display !== 'none').map((e) => ({ n: e.textContent, ...box(e) }));
        return { plate, shown, on: hud.autoEl.classList.contains('on'), mine: shown.filter((s) => s.n === ais[0].name) }; };
      const off = await run(0), on = await run(20); __t.clear();
      return { off, on }; })()`);
    assert.ok(!r.off.on && r.on.on, 'the plate is up only for the second pass: ' + JSON.stringify([r.off.on, r.on.on]));
    assert.ok(r.off.mine.length === 1 && overlap(r.off.mine[0], r.off.plate), `sanity: with the plate down, the rival's nameplate does take the spot (${JSON.stringify([r.off.mine, r.off.plate])})`);
    assert.ok(r.on.mine.every((m) => !overlap(m, r.on.plate)), `with the plate up, no nameplate sits on it (${JSON.stringify([r.on.mine, r.on.plate])})`);
    assert.ok(r.on.shown.every((m) => !overlap(m, r.on.plate)), `...none at all: ${JSON.stringify(r.on.shown)}`);
  });

  check('V-11 / V-17: the screen flashes paint under the HUD, the white flash is capped at 0.5, and no flash replays when the HUD is shown again', async () => {
    await env(1280, 720); await racing();
    const order = await page.eval(`(() => { const kids = [...__t.hud.el.children], fx = kids.filter((k) => k.classList.contains('fx')).map((k) => kids.indexOf(k)), panels = kids.filter((k) => /^hud-(top|right|speed|bottom|map|center|warn|lock|finish)$/.test(k.className.split(' ')[0])).map((k) => kids.indexOf(k)); return { fx, panels }; })()`);
    assert.equal(order.fx.length, 4, 'four screen overlays (the P-15 smoke fog, damage, EMP, white flash)'); assert.ok(Math.max(...order.fx) < Math.min(...order.panels), 'every screen overlay (smoke fog included) is below every panel: ' + JSON.stringify(order));
    const a = await page.eval(`(() => { const { ev, g, hud } = __t, p = g.player; ev.emit('lightning:strike', { owner: __t.ais()[0], target: p, pos: p.flight.pos }); const s = parseFloat(hud.flash.style.getPropertyValue('--a')); hud.fx(hud.flash, 1); return [s, parseFloat(hud.flash.style.getPropertyValue('--a'))]; })()`);
    assert.ok(a[0] <= 0.5 + 1e-9 && a[1] <= 0.5 + 1e-9, 'the white flash alpha is capped at 0.5: ' + a);
    // V-17: damage, EMP and lightning flashes, then a retry hides and shows the HUD
    const r = await page.eval(`(() => { const { ev, g, hud } = __t, p = g.player, a = __t.ais()[0];
      ev.emit('racer:hit', { racer: p, by: a, kind: 'cannon', pos: p.flight.pos, severity: 1 }); ev.emit('emp:fire', { owner: a, pos: p.flight.pos, radius: 500 }); ev.emit('lightning:strike', { owner: a, target: p, pos: p.flight.pos });
      const before = document.querySelectorAll('.fx.go').length;
      hud.show(false); hud.show(true);
      return { before, go: document.querySelectorAll('.fx.go').length, anims: document.getAnimations().filter((x) => x.animationName === 'fxGo').length }; })()`);
    assert.equal(r.before, 3, 'the three flashes were running: ' + JSON.stringify(r)); assert.deepEqual([r.go, r.anims], [0, 0], 'no flash replays when the HUD is shown again');
    // and a flash that ran to its end drops its class by itself
    await page.eval(`(() => { const { ev, g } = __t; ev.emit('racer:hit', { racer: g.player, by: __t.ais()[0], kind: 'cannon', pos: g.player.flight.pos, severity: 1 }); })()`);
    await page.waitFor(`document.querySelectorAll('.fx.go').length === 0`, { timeout: 4000 });
  });

  check('P-15: smoke:blind fogs the local player\'s screen and no one else\'s: in fast, out over the blind time, never above 0.75, softer with Reduce flashing, under every panel and over the 3D view', async () => {
    await env(1280, 720); await racing();
    const r = await page.eval(`(() => { const { g, hud, ev } = __t, p = g.player, [a, b] = __t.ais(), S = g.settings, out = { top: 0 };
      const op = () => { const v = +parseFloat(getComputedStyle(hud.smoke).opacity).toFixed(3); out.top = Math.max(out.top, v); return v; };
      const reset = () => { __t.clear(); g.race.items.clouds.length = 0; for (const x of g.race.racers) x.blind = 0; __sky.step(2); };
      // a real cloud dropped by 'owner' on 'at' (items.js stepClouds is the emit site: { racer, owner, duration }), flown through until the player is no longer blind and the fog is gone; one sample per 3 sim steps
      const fly = (owner, at) => { g.race.items.clouds.push({ owner, pos: at.flight.pos.clone(), t: 0 }); const s = []; for (let i = 0; i < 100; i++) { __sky.step(3); s.push({ f: op(), blind: +p.blind.toFixed(3) }); if (i > 4 && !p.blind && !op()) break; } g.race.items.clouds.length = 0; return s; };
      reset(); out.idle = op();
      out.mine = fly(a, p);                                                                  // the player flies through a rival's cloud
      reset(); S.reduceFlash = true; out.calm = fly(a, p); S.reduceFlash = false;           // the same cloud with Reduce flashing & motion on
      reset(); g.race.items.clouds.push({ owner: p, pos: b.flight.pos.clone(), t: 0 }); out.rival = [];   // a rival flies through the player's own cloud
      for (let i = 0; i < 12; i++) { __sky.step(3); out.rival.push(op()); if (i === 0) out.rivalTimer = b.blind; } out.myTimer = p.blind; g.race.items.clouds.length = 0;
      reset(); ev.emit('smoke:blind', { racer: p, owner: a, duration: 1.2 }); out.evt = [];  // the event alone, no timer on the racer: the fog still clears over the announced time
      for (let i = 0; i < 40; i++) { __sky.step(3); out.evt.push(op()); }
      reset(); ev.emit('smoke:blind', { racer: p, owner: a }); __sky.step(3); out.noDur = op();                  // a payload without a duration
      reset(); ev.emit('smoke:blind', { racer: b, owner: p, duration: 1.2 }); __sky.step(3); out.rivalEvt = op();   // a rival's event
      // paint order: with the fog up, the open sky hits the fog (it is over the 3D view) and the speed box hits the panel (the panel is over the fog); the temporary rule only makes those two hit-testable
      reset(); ev.emit('smoke:blind', { racer: p, owner: a, duration: 1.2 }); __sky.step(12);   // (0.2 s: the fog is in by 0.15 s)
      const st = document.createElement('style'); st.textContent = '.hud .fx-smoke, .hud-speed { pointer-events: auto !important; }'; document.head.append(st);
      const sp = document.querySelector('.hud-speed').getBoundingClientRect(), sm = hud.smoke.getBoundingClientRect();
      const sky = document.elementFromPoint(innerWidth / 2, innerHeight * 0.3), onSpeed = document.elementFromPoint(sp.left + sp.width / 2, sp.top + sp.height / 2);
      out.layer = { sky: sky === hud.smoke, skyIs: sky && (sky.tagName + '.' + sky.className), speed: !!onSpeed && !!onSpeed.closest('.hud-speed'), covers: Math.abs(sm.left) < 1 && Math.abs(sm.top) < 1 && Math.abs(sm.right - innerWidth) < 1 && Math.abs(sm.bottom - innerHeight) < 1, bg: getComputedStyle(hud.smoke).backgroundImage, now: op() };
      st.remove();
      // a retry: hiding and showing the HUD must not bring the last fog back (the player's own timer is still running)
      reset(); g.race.items.clouds.push({ owner: a, pos: p.flight.pos.clone(), t: 0 }); __sky.step(12); out.up = op();
      hud.show(false); hud.show(true); out.afterShow = op(); __sky.step(2); out.afterStep = op(); out.stillBlind = p.blind;
      reset(); return out; })()`);
    const f = (s) => s.map((x) => x.f), hi = (s) => Math.max(...s), rise = (s) => s.findIndex((v) => v >= 0.9 * hi(s));
    const shape = (s) => { const i = s.indexOf(hi(s)); return s.every((v, k) => k === 0 || (k <= i ? v >= s[k - 1] - 1e-9 : v <= s[k - 1] + 1e-9)); };   // rises once, falls once: nothing pulses
    const mine = f(r.mine), calm = f(r.calm);
    assert.equal(r.idle, 0, 'no smoke, no fog');
    assert.ok(hi(mine) > 0.5 && hi(mine) <= 0.75, `the fog gets dense and stays at or under 0.75: ${hi(mine)}`);
    assert.ok(mine[3] >= 0.65, `...and comes in fast (a fifth of a second after the event): ${mine.slice(0, 6)}`);
    assert.ok(shape(mine), `it rises once and clears once, nothing pulses: ${mine}`);
    assert.ok(r.mine.every((x) => !(x.blind > 0.05) || x.f > 0) && r.mine.every((x) => x.blind > 0 || x.f === 0), `the fog lasts exactly as long as the player is blind (inside the cloud and 1.2 s after): ${JSON.stringify(r.mine)}`);
    assert.ok(r.mine.at(-1).f === 0 && r.mine.at(-1).blind === 0, 'and it is gone at the end');
    assert.ok(hi(calm) > 0.15 && hi(calm) <= 0.45 && hi(calm) < hi(mine) - 0.15, `Reduce flashing: a lighter fog (${hi(calm)} against ${hi(mine)})`);
    assert.ok(shape(calm) && rise(calm) >= rise(mine) + 3, `...that comes in slowly and also only rises and falls (samples to 90%: ${rise(calm)} against ${rise(mine)}): ${calm}`);
    assert.ok(r.rivalTimer > 0 && r.myTimer === 0, `a rival really was blinded by the player's cloud (its timer ${r.rivalTimer}) and the player was not (${r.myTimer})`);
    assert.ok(r.rival.every((v) => v === 0) && r.rivalEvt === 0, `a rival's blindness, and a rival's event, leave the player's screen clear: ${r.rival} / ${r.rivalEvt}`);
    const last = r.evt.map((v) => v > 0).lastIndexOf(true);
    assert.ok(hi(r.evt) > 0.5 && (last + 1) * 0.05 >= 1 && (last + 1) * 0.05 <= 1.4, `the event alone fogs and clears over the announced 1.2 s (last non-zero sample ${last}): ${r.evt}`);
    assert.ok(r.noDur > 0, 'a payload without a duration still fogs (1.2 s)');
    assert.ok(r.layer.sky, `the fog is over the 3D view (the open sky hit-tests to ${r.layer.skyIs})`); assert.ok(r.layer.speed, 'the speed box is over the fog'); assert.ok(r.layer.covers, 'the fog covers the whole screen');
    assert.match(r.layer.bg, /gradient/, 'the fog has its grey gradient (style.css .fx-smoke)'); assert.ok(r.layer.now > 0.5 && r.layer.now <= 0.75, `the fog shows: ${r.layer.now}`);
    assert.ok(r.up > 0.5 && r.afterShow === 0 && r.afterStep === 0 && r.stillBlind > 0, `no fog comes back when the HUD is shown again, although the player is still blind: ${JSON.stringify([r.up, r.afterShow, r.afterStep, r.stillBlind])}`);
    assert.ok(r.top <= 0.75, `at no sample over 0.75: ${r.top}`);
  });

  check('R2-V-17: the fog is drawn from a canvas-made cloud texture in three layers, and the puffs drift only while the fog is up, motion is welcome (no Reduce flashing) and the tier is not Low', async () => {
    await env(1280, 720); await racing();
    const r = await page.eval(`(async () => { const { g, hud, ev } = __t, p = g.player, [a] = __t.ais(), S = g.settings;
      const reset = () => { __t.clear(); g.race.items.clouds.length = 0; for (const x of g.race.racers) x.blind = 0; __sky.step(2); };
      const look = () => { const cs = getComputedStyle(hud.smoke), b = getComputedStyle(hud.smoke, '::before'), f = getComputedStyle(hud.smoke, '::after');
        return { op: +(+cs.opacity).toFixed(2), bg: cs.backgroundImage.replace(/url\\("?data:[^)]*\\)/g, 'url(data...)'), tex: hud.smoke.style.getPropertyValue('--smoke-tex').slice(0, 40), drift: hud.smoke.classList.contains('drift'),
          before: { content: b.content, anim: b.animationName, tex: b.backgroundImage.startsWith('url(') }, after: { content: f.content, anim: f.animationName, tex: f.backgroundImage.startsWith('url(') } }; };
      const fog = () => { reset(); ev.emit('smoke:blind', { racer: p, owner: a, duration: 3 }); __sky.step(12); return look(); };
      const out = { idle: (reset(), look()) };
      out.high = fog();
      S.reduceFlash = true; out.calm = fog(); S.reduceFlash = false;
      const q = g.qualityId; g.qualityId = 'low'; out.low = fog(); g.qualityId = q;
      out.back = fog();
      // the tile itself: decode the data URL and measure it
      const url = hud.smoke.style.getPropertyValue('--smoke-tex').trim().replace(/^url\\(/, '').replace(/\\)$/, '');
      const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('the smoke texture does not decode')); img.src = url; });
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); const px = cx.getImageData(0, 0, cv.width, cv.height).data;
      let s1 = 0, s2 = 0, n = 0; for (let i = 0; i < px.length; i += 4) { const y = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; s1 += y; s2 += y * y; n++; }
      out.tile = { w: img.width, h: img.height, mean: +(s1 / n).toFixed(1), std: +Math.sqrt(s2 / n - (s1 / n) ** 2).toFixed(1), chars: url.length };
      reset(); return out; })()`);
    assert.ok(r.idle.op === 0 && !r.idle.drift && r.idle.before.anim === 'none' && r.idle.after.anim === 'none', `no fog, nothing animating: ${JSON.stringify(r.idle)}`);
    for (const k of ['high', 'calm', 'low', 'back']) {
      const f = r[k];
      assert.ok(f.op > 0.05, `${k}: the fog is up ${JSON.stringify(f)}`);
      assert.match(f.tex, /^url\(data:image\/jpeg;base64,/, `${k}: the canvas-made cloud texture is in --smoke-tex`);
      assert.ok(/url\(/.test(f.bg) && /gradient/.test(f.bg), `${k}: the fog paints the texture over its grey haze gradient: ${f.bg}`);
      assert.ok(f.before.content === '""' && f.after.content === '""' && f.before.tex && f.after.tex, `${k}: two more layers of the same cloud, at other scales: ${JSON.stringify([f.before, f.after])}`);
    }
    for (const k of ['high', 'back']) assert.ok(r[k].drift && r[k].before.anim === 'smokeA' && r[k].after.anim === 'smokeB', `${k}: the puffs drift (two layers, two speeds): ${JSON.stringify(r[k])}`);
    for (const k of ['calm', 'low']) assert.ok(!r[k].drift && r[k].before.anim === 'none' && r[k].after.anim === 'none', `${k}: the cloud holds still (${k === 'calm' ? 'Reduce flashing & motion' : 'Low tier'}): ${JSON.stringify(r[k])}`);
    assert.ok(r.tile.w >= 64 && r.tile.w === r.tile.h && r.tile.std >= 12 && r.tile.mean > 90 && r.tile.mean < 220 && r.tile.chars < 40000, `the tile is a small uneven grey cloud (not blank, not a few KB of nothing): ${JSON.stringify(r.tile)}`);
  });

  check('E-10: the real shield:block event (damage.js: { racer, by, kind }) shows SHIELD BLOCKED once, and only for the local player', async () => {
    await env(1280, 720); await racing();
    const r = await page.eval(`(async () => { const { applyHit } = await import('${BASE}/src/race/damage.js'); const { g, hud, ev } = __t, p = g.player, [a, b] = __t.ais(); const pop = () => [...document.querySelectorAll('.hud-popups .popup')].map((e) => e.textContent);
      __t.clear(); p.shield = 5; p.invuln = 0; applyHit(g.race, p, a, 'missile', { tumble: 1, loss: 0.4, severity: 0.9, pos: p.flight.pos });
      ev.emit('missile:evaded', { missile: {}, target: p, by: 'shield' });                    // items.js reports the same hit a second time
      const mine = pop();
      __t.clear(); b.shield = 5; b.invuln = 0; applyHit(g.race, b, a, 'missile', { tumble: 1, loss: 0.4, severity: 0.9, pos: b.flight.pos });
      return { mine, theirs: pop(), shieldLeft: p.shield }; })()`);
    assert.deepEqual(r.mine, ['SHIELD BLOCKED'], 'one popup for the player\'s own shield: ' + JSON.stringify(r));
    assert.deepEqual(r.theirs, [], 'a rival\'s shield block shows nothing');
  });

  check('E-31: the countdown digit and its hint are hidden while the game is paused', async () => {
    await env(844, 390); await racing();
    const r = await page.eval(`(() => { const { ev, g } = __t, vis = () => [getComputedStyle(__t.hud.cd).visibility, getComputedStyle(__t.hud.cdHint).visibility];
      ev.emit('race:countdown', { n: 2 }); const running = vis(); g.setPaused(true); __sky.step(2); const paused = vis(); g.setPaused(false); __sky.step(2); return { running, paused, after: vis() }; })()`);
    assert.deepEqual(r.running, ['visible', 'visible']); assert.deepEqual(r.paused, ['hidden', 'hidden'], 'hidden under the PAUSED panel'); assert.deepEqual(r.after, ['visible', 'visible'], 'back after Resume');
  });

  check('V-21: the countdown sits below the LAP box on short landscape screens', async () => {
    for (const [w, h, touch] of [[844, 390, false], [896, 414, false], [915, 412, false], [844, 390, true], [1280, 720, false], [390, 844, true]]) {
      await env(w, h, touch); await racing();
      const r = await page.eval(`(() => { __t.quiet(); const { ev } = __t; ev.emit('race:countdown', { n: 2 }); __sky.step(2);
        return { cd: __t.rect('.hud-cd'), hint: __t.rect('.hud-cdhint'), lap: __t.rect('.hud-lapbox'), W: innerWidth, H: innerHeight, text: __t.hud.cdHint.textContent }; })()`);
      const tag = `${w}x${h}${touch ? 't' : ''}`;
      assert.ok(r.cd && r.hint && r.lap, `${tag}: digit, hint and LAP box are drawn ${JSON.stringify(r)}`);
      assert.ok(!overlap(r.cd, r.lap) && !overlap(r.hint, r.lap), `${tag}: the countdown overlaps the LAP box ${JSON.stringify(r)}`);
      assert.ok(r.cd.t >= 0 && r.hint.b <= r.H && r.hint.l >= 0 && r.hint.r <= r.W, `${tag}: digit and hint are on the screen ${JSON.stringify(r)}`);
      assert.ok(r.hint.t >= r.cd.b - 2, `${tag}: the hint sits under the digit`);
      assert.equal(r.text, rocketHint(), 'E-02: the hint under the digit is the rocket-start rule');
    }
  });

  check('R2-V-09: the countdown hint sits on a dark plate: its text keeps 4.5:1 against the brightest course frame (sunrise), the plate is gone when the hint is empty, and nothing fades the text', async () => {
    const rows = [];
    for (const [w, h, touch] of [[1280, 720, false], [844, 390, true], [390, 844, true]]) {
      cur = null; await env(w, h, touch);
      const r = await page.eval(`(async () => { const { g, ev, hud } = __t;
        await __sky.start({ laps: 1, bots: 3, courseId: 'sunrise', seed: 5 }); __t.loud(); __t.clear();
        const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }, lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
        const rgba = (s) => s.match(/[\\d.]+/g).map(Number);
        ev.emit('race:countdown', { n: 3 }); __sky.step(2); const emptyBox = __t.rect('.hud-cdhint');
        ev.emit('race:countdown', { n: 2 }); __sky.step(2);
        const cs = getComputedStyle(hud.cdHint), bg = rgba(cs.backgroundColor), fg = rgba(cs.color), box = hud.cdHint.getBoundingClientRect();
        // the 3D frame behind the hint: the WebGL canvas read back in the same task as its draw (no DOM on it)
        g.renderFrame(1, 0);
        const cv = g.canvas, k = cv.width / innerWidth, c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
        const x = c2.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
        const sx = Math.max(0, Math.floor(box.left * k)), sy = Math.max(0, Math.floor(box.top * k)), sw = Math.max(1, Math.min(cv.width - sx, Math.ceil(box.width * k))), sh = Math.max(1, Math.min(cv.height - sy, Math.ceil(box.height * k)));
        const d = x.getImageData(sx, sy, sw, sh).data; let best = [0, 0, 0], bl = -1, sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { const c = [d[i], d[i + 1], d[i + 2]], l = lum(c); sum += l; n++; if (l > bl) { bl = l; best = c; } }
        const over = (b) => [0, 1, 2].map((i) => bg[3] * bg[i] + (1 - bg[3]) * b[i]);   // the plate over a backdrop colour (CSS blends in sRGB)
        const ratio = (back) => { const p = lum(over(back)), t = lum(fg); return (Math.max(p, t) + 0.05) / (Math.min(p, t) + 0.05); };
        const fades = hud.cdHint.getAnimations().flatMap((a) => a.effect.getKeyframes().map((f) => f.opacity)).filter((o) => o !== undefined && Number(o) < 1);
        return { emptyBox, bg, fg, best, meanLum: sum / n, bestLum: bl, onBrightest: ratio(best), onWhite: ratio([255, 255, 255]), onBlack: ratio([0, 0, 0]), fades, text: hud.cdHint.textContent, course: g.race.course.id, W: innerWidth, H: innerHeight, px: [sw, sh] }; })()`);
      const tag = `${w}x${h}${touch ? 't' : ''}`;
      assert.equal(r.course, 'sunrise', `${tag}: the brightest course`); assert.equal(r.text, rocketHint(), `${tag}: the hint is the rocket-start rule`);
      assert.equal(r.emptyBox, null, `${tag}: no empty plate is drawn when the hint is cleared (countdown 3)`);
      assert.ok(r.bg[3] >= 0.7, `${tag}: the hint has a dark plate (alpha ${r.bg[3]}) ${JSON.stringify(r.bg)}`);
      assert.deepEqual(r.fades, [], `${tag}: no animation fades the hint (it blinked down to 25% opacity): ${JSON.stringify(r.fades)}`);
      assert.ok(r.onBrightest >= 4.5 && r.onWhite >= 4.5, `${tag}: contrast of the text over the plate: ${r.onBrightest.toFixed(2)}:1 on the brightest pixel behind it ${JSON.stringify(r.best)}, ${r.onWhite.toFixed(2)}:1 on pure white`);
      rows.push(`${tag}: brightest pixel behind the hint rgb(${r.best}) (relative luminance ${r.bestLum.toFixed(3)}, mean ${r.meanLum.toFixed(3)} over ${r.px.join('x')} px) -> ${r.onBrightest.toFixed(2)}:1; on pure white ${r.onWhite.toFixed(2)}:1; with no plate (text over that pixel) ${(() => { const L = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }; const a = L(r.fg), b = L(r.best); return ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2); })()}:1`);
    }
    console.log('    R2-V-09 contrast (text rgb(255,208,46) on the plate rgba(5,10,30,.82)):\n      ' + rows.join('\n      '));
    cur = null;   // the next check reloads the redrock race
  });

  check('V-31: the HUD shows this race\'s lap count, place, altitude and minimap the moment the race starts', async () => {
    await env(1280, 720); await racing();
    const r = await page.eval(`(async () => { const { g, ev, hud } = __t; let snap = null;
      ev.on('game:raceStart', () => { const cv = hud.mapCv, px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let ink = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) ink++;
        snap = { lap: hud.lapEl.textContent, of: hud.posOf.textContent, alt: hud.alt.textContent, best: hud.bestEl.textContent, ink, racers: g.race.racers.length, laps: g.race.laps, y: Math.round(g.player.flight.pos.y) }; });
      await __sky.start({ laps: 1, bots: 3, courseId: 'sunrise', seed: 5 }); return snap; })()`);
    assert.ok(r, 'game:raceStart fired');
    assert.equal(r.lap, 'LAP 1/1', 'the lap count of this race, not the previous one'); assert.equal(r.of, '/' + r.racers, 'the field size of this race');
    assert.equal(r.alt, String(r.y), 'the real altitude, not the template 0'); assert.ok(!/--/.test(r.best), 'no template "--:--.---": ' + r.best); assert.ok(r.ink > 500, 'the minimap is drawn: ' + r.ink + ' px');
    cur = null;   // the next check reloads the race
  });

  check('V-33: modal screens paint above the HUD (the hint card hides the speed box; the pause panel hides the whole HUD)', async () => {
    for (const [w, h, touch] of [[844, 390, true], [1280, 720, false]]) {
      await env(w, h, touch); await racing();
      const r = await page.eval(`(() => { const { g } = __t, st = document.createElement('style'); st.textContent = '#ui .hud, #ui .hud *, #ui .scr, #ui .scr * { pointer-events: auto !important; }'; document.head.append(st);
        g.ui.hintOpen = true; g.setPaused(true); g.ui.goto('hint'); __sky.step(2);
        const card = document.querySelector('.scr.hint .hint-panel').getBoundingClientRect(), bad = [];
        for (const sel of ['.hud-speed', '.hud-bc', '.hud-item', '.hud-lapbox', '.hud-pos', '.hud-map']) { const e = document.querySelector(sel); if (!e) continue; const r = e.getBoundingClientRect();
          for (let fx = 0.05; fx < 1; fx += 0.15) for (let fy = 0.1; fy < 1; fy += 0.2) { const x = r.left + r.width * fx, y = r.top + r.height * fy; if (x > card.left && x < card.right && y > card.top && y < card.bottom) { const top = document.elementFromPoint(x, y); if (top && top.closest('.hud')) bad.push(sel); } } }
        const cs = (s) => getComputedStyle(document.querySelector(s)).zIndex; const z = { hud: cs('#ui .hud'), layer: cs('#ui .layer') };
        st.remove(); return { bad: [...new Set(bad)], z }; })()`);
      const tag = `${w}x${h}${touch ? 't' : ''}`;
      assert.deepEqual(r.bad, [], `${tag}: HUD panels paint over the hint card`);
      assert.ok(Number(r.z.layer) > Number(r.z.hud), `${tag}: the screen layer is stacked above the HUD ${JSON.stringify(r.z)}`);
    }
  });

  check('V-13 / V-32: portrait touch keeps the readouts out of the stick zone, and the ROLL buttons off the countdown, the popups and every readout', async () => {
    for (const [w, h] of [[390, 844], [360, 640], [412, 915], [768, 1024], [844, 390], [568, 320]]) {
      await env(w, h, true); await racing();
      const r = await page.eval(`(() => { const { ev, g, hud } = __t, p = g.player; __t.clear(); __t.quiet(); p.shield = 6; p.item = { type: 'missile', count: 3 };
        ev.emit('race:countdown', { n: 2 });
        for (let i = 0; i < 3; i++) { ev.emit('racer:stunt', { racer: p, kind: 'nearmiss', reward: 6 }); ev.emit('racer:stunt', { racer: p, kind: 'roll', reward: 12 }); }
        hud.showNote('CAMERA: FAR'); __sky.step(2);
        const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        const kids = [...document.getElementById('sb-touch').children];
        const btns = kids.filter((e) => e.textContent.trim()).map((e) => ({ n: e.textContent.trim(), k: e.dataset.k || '', ...box(e) }));
        const named = { speed: '.hud-speed', boost: '.hud-bc', item: '.hud-item', shield: '.hud-shield', map: '.hud-map', lap: '.hud-lapbox', pos: '.hud-pos', digit: '.hud-cd', hint: '.hud-cdhint', popups: '.hud-popups', note: '.hud-note' };
        const rects = {}; for (const k in named) rects[k] = __t.rect(named[k]);
        return { btns, zone: box(kids[0]), rects, W: innerWidth, H: innerHeight }; })()`);
      const tag = `${w}x${h}t`, portrait = h > w;
      const rolls = r.btns.filter((b) => b.k.startsWith('roll'));
      assert.equal(rolls.length, 2, `${tag}: two roll buttons ${JSON.stringify(r.btns.map((b) => b.n))}`);
      for (const b of rolls) assert.match(b.n, /ROLL/, `${tag}: a roll button says what it does (V-32): ${JSON.stringify(b.n)}`);
      for (const k of ['speed', 'boost', 'item', 'shield', 'digit', 'hint', 'popups', 'note']) assert.ok(r.rects[k], `${tag}: ${k} is drawn`);
      for (const b of r.btns) {
        assert.ok(b.w >= 44 && b.h >= 44 && b.l >= 0 && b.t >= 0 && b.l + b.w <= r.W && b.t + b.h <= r.H, `${tag}: touch target ${JSON.stringify(b.n)} is 44px or more and on the screen ${JSON.stringify(b)}`);
        for (const k of Object.keys(r.rects)) assert.ok(!overlap(b, r.rects[k]), `${tag}: touch button ${JSON.stringify(b.n)} ${JSON.stringify(b)} covers the ${k} ${JSON.stringify(r.rects[k])}`);
      }
      if (portrait) for (const k of ['speed', 'boost', 'item', 'shield']) assert.ok(!overlap(r.rects[k], r.zone), `${tag}: the ${k} readout ${JSON.stringify(r.rects[k])} sits in the floating-stick zone ${JSON.stringify(r.zone)}, under the thumb`);
    }
  });

  check('R2-V-10: landscape touch keeps the speed box, boost bar, item box, shield and cannon heat out of the stick zone and clear of every button, the pill and the other panels', async () => {
    const rows = [], bad = [];
    for (const [w, h] of [[844, 390], [812, 375], [640, 360], [568, 320], [896, 414], [915, 412], [740, 360], [700, 500], [1024, 768], [1920, 1080]]) {
      await env(w, h, true); await racing();
      const r = await page.eval(`(() => { const { g, hud } = __t, p = g.player; __t.clear(); __t.quiet(); p.shield = 6; p.item = { type: 'missile', count: 3 }; p.flight.boost.meter = 70; p.heat = 0.9;
        __sky.step(3);
        const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        const kids = [...document.getElementById('sb-touch').children];
        const btns = kids.filter((e) => e.textContent.trim()).map((e) => ({ n: e.textContent.trim(), ...box(e) }));
        const named = { speed: '.hud-speed', boost: '.hud-bc', item: '.hud-item', shield: '.hud-shield', heat: '.hud-heat', lap: '.hud-lapbox', pos: '.hud-pos', map: '.hud-map' };
        const rects = {}; for (const k in named) rects[k] = __t.rect(named[k]);
        return { btns, zone: box(kids[0]), rects, W: innerWidth, H: innerHeight }; })()`);
      const tag = `${w}x${h}t`, pill = { l: 0, t: 0, r: 109, b: 41 };
      for (const k of ['speed', 'boost', 'item', 'shield', 'heat']) {
        const a = r.rects[k];
        if (!a) { bad.push(`${tag}: ${k} is not drawn`); continue; }
        if (a.l < 0 || a.t < 0 || a.r > r.W || a.b > r.H) bad.push(`${tag}: ${k} leaves the screen`);
        if (overlap(a, r.zone)) bad.push(`${tag}: ${k} ${JSON.stringify(a)} sits in the floating-stick zone ${JSON.stringify(r.zone)}, under the left thumb`);
        if (a.t > r.H / 2 || a.b >= r.zone.t) bad.push(`${tag}: ${k} is not at the top of the screen ${JSON.stringify(a)}`);
        if (a.l < pill.r && a.t < pill.b) bad.push(`${tag}: ${k} ${JSON.stringify(a)} sits under the Almanac pill (no slack: a tap there goes to the catalog)`);
        for (const b of r.btns) if (overlap(a, b)) bad.push(`${tag}: ${k} ${JSON.stringify(a)} covers the touch button ${b.n} ${JSON.stringify(b)}`);
        for (const o of ['lap', 'pos', 'map']) if (overlap(a, r.rects[o])) bad.push(`${tag}: ${k} overlaps the ${o} panel`);
      }
      const ks = ['speed', 'item', 'boost', 'shield'];   // the heat meter lives inside the boost block, on purpose
      const ov3 = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 3 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 3;   // V-24's 3 px of slack: a skewed box's bounding box reaches past its slanted edge (the parallelograms themselves are 7 px apart)
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (r.rects[ks[i]] && r.rects[ks[j]] && ov3(r.rects[ks[i]], r.rects[ks[j]])) bad.push(`${tag}: ${ks[i]} overlaps ${ks[j]}`);
      rows.push(`${tag}: speed ${['l', 't', 'r', 'b'].map((k) => Math.round(r.rects.speed?.[k])).join(',')}  boost ${['l', 't', 'r', 'b'].map((k) => Math.round(r.rects.boost?.[k])).join(',')}  item ${['l', 't', 'r', 'b'].map((k) => Math.round(r.rects.item?.[k])).join(',')}  stick zone top ${Math.round(r.zone.t)}`);
    }
    console.log('    R2-V-10 cluster rectangles (l,t,r,b):\n      ' + rows.join('\n      '));
    assert.deepEqual(bad, [], 'landscape touch layout problems:\n  ' + bad.join('\n  '));
  });

  check('R2-T7: the AUTO-CRUISE plate shows from 8 s of input.handsOffT in a running race, fades out within 0.3 s of the first key, switches without a fade under Reduce flashing, and sits clear of the Almanac pill, the screen edge and the speed box', async () => {
    const race = readFileSync(join(SRC, 'race', 'race.js'), 'utf8');
    assert.match(race, /smoothstep\(\s*8\s*,\s*\d+\s*,\s*this\.game\.input\?\.handsOffT/, 'race.js still starts the hands-off pace penalty at 8 s of input.handsOffT (hud.js AUTO_FROM follows it)');
    const rows = [];
    for (const [w, h, touch] of [[1280, 720, false], [390, 844, false], [844, 390, false], [390, 844, true], [844, 390, true]]) {
      await env(w, h, touch); await racing();
      const tag = `${w}x${h}${touch ? 't' : ''}`;
      const r = await page.eval(`(async () => { const { g, hud } = __t, p = g.player, el = hud.autoEl, inp = g.input, wait = (ms) => new Promise((r) => setTimeout(r, ms));
        __t.clear(); __t.loud();                                      // the real fade runs
        const shot = () => { const cs = getComputedStyle(el), b = el.getBoundingClientRect(), s = document.querySelector('.hud-speed').getBoundingClientRect();
          return { on: el.classList.contains('on'), op: +(+cs.opacity).toFixed(2), vis: cs.visibility, fadeMs: parseFloat(cs.transitionDuration.split(',')[0]) * 1000, box: { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }, speed: { l: s.left, t: s.top, r: s.right, b: s.bottom } }; };
        const at = (t) => { inp.handsOffT = t; hud.update(0.016, g); };          // a fake game.input.handsOffT, read by the HUD on its own update
        const out = {};
        at(0); await wait(400); out.zero = shot();
        at(7.9); await wait(400); out.short = shot();
        at(8); await wait(400); out.eight = shot();
        at(9); await wait(400); out.nine = shot();
        at(20); await wait(400); out.twenty = shot(); out.text = el.textContent.replace(/\\s+/g, ' ').trim();
        at(0); out.fadeStart = shot(); await wait(400); out.gone = shot();      // read at once, a CSS fade is still at 1 and a snap is already 0
        const st = g.race.state; g.race.state = 'countdown'; at(20); await wait(400); out.countdown = shot(); g.race.state = st;
        p.finished = true; at(20); await wait(400); out.finished = shot(); p.finished = false;
        const rf = g.settings.reduceFlash; g.settings.reduceFlash = true; at(20); out.calmOn = shot(); at(0); out.calmOff = shot(); g.settings.reduceFlash = rf; hud.update(0.016, g);
        __t.clear(); await wait(400);
        return out; })()`);
      const shown = ['eight', 'nine', 'twenty'], hidden = ['zero', 'short', 'gone', 'countdown', 'finished'];
      assert.equal(r.text, 'AUTO-CRUISE · press a key to take over', `${tag}: the plate says what is happening and what to do`);
      for (const k of shown) assert.ok(r[k].on && r[k].op === 1 && r[k].vis === 'visible', `${tag}: shown at ${k}: ${JSON.stringify(r[k])}`);
      for (const k of hidden) assert.ok(!r[k].on && r[k].op === 0 && r[k].vis === 'hidden', `${tag}: hidden at ${k} (handsOffT below 8, the race not running, the player finished): ${JSON.stringify(r[k])}`);
      assert.ok(!r.fadeStart.on && r.fadeStart.op > 0.9, `${tag}: after a key the plate fades, it does not snap off: ${JSON.stringify(r.fadeStart)}`);
      assert.ok(r.fadeStart.fadeMs > 0 && r.fadeStart.fadeMs <= 300, `${tag}: ...within 0.3 s (the opacity transition lasts ${r.fadeStart.fadeMs} ms)`);
      assert.ok(r.calmOn.on && r.calmOn.op === 1 && r.calmOn.vis === 'visible' && r.calmOff.op === 0 && r.calmOff.vis === 'hidden', `${tag}: with Reduce flashing the plate switches on and off without a fade: ${JSON.stringify([r.calmOn, r.calmOff])}`);
      const b = r.twenty.box, s = r.twenty.speed;
      assert.ok(b.l >= 0 && b.t >= 0 && b.r <= w && b.b <= h, `${tag}: the plate is on the screen ${JSON.stringify(b)}`);
      assert.ok(!(b.l < 109 && b.t < 41), `${tag}: the plate is not under the Almanac pill ${JSON.stringify(b)}`);
      assert.ok(b.r <= w - 8 && b.h <= h * 0.2, `${tag}: a small plate (${Math.round(b.w)} x ${Math.round(b.h)} px)`);
      if (!touch) assert.ok(b.b <= s.t - 2, `${tag}: the plate sits above the speed box ${JSON.stringify([b, s])}`);
      else assert.ok(b.t > h / 2, `${tag}: on touch (speed box moved to the top) the plate takes the bottom-left corner the box left ${JSON.stringify(b)}`);
      rows.push(`${tag}: plate ${['l', 't', 'r', 'b'].map((k) => Math.round(b[k])).join(',')} (${Math.round(b.w)} x ${Math.round(b.h)})  speed box ${['l', 't', 'r', 'b'].map((k) => Math.round(s[k])).join(',')}  fade ${r.fadeStart.fadeMs} ms`);
    }
    console.log('    R2-T7 plate rectangles (l,t,r,b):\n      ' + rows.join('\n      '));
  });

  check('V-24 / V-21 / V-13: no HUD panel overlaps another, leaves the screen or sits under the Almanac pill, at 22 viewports with a mouse and with touch', async () => {
    const SIZES = [[320, 568], [360, 640], [375, 667], [390, 844], [412, 915], [600, 960], [768, 1024], [820, 1180], [1024, 1366], [568, 320], [640, 360], [740, 360], [844, 390], [896, 414], [915, 412], [700, 500], [800, 600], [900, 500], [1024, 768], [1280, 720], [1366, 768], [1920, 1080]];
    const NAMED = { lap: '.hud-lapbox', pos: '.hud-pos', speed: '.hud-speed', boost: '.hud-bc', item: '.hud-item', shield: '.hud-shield', map: '.hud-map', ticker: '.hud-ticker', digit: '.hud-cd', hint: '.hud-cdhint', popups: '.hud-popups', auto: '.hud-auto' };
    const ov = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 3 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 3;   // 3 px of slack: a skewed box's bounding box reaches past its slanted edge
    const pill = { l: 0, t: 0, r: 109, b: 41 }, bad = [];
    for (const touch of [false, true]) for (const [w, h] of SIZES) for (const state of ['countdown', 'popups', 'auto']) {   // the countdown digit and the stunt popups never share a frame; the hands-off plate (R2 T7) is added to the popups, the busiest frame
      await env(w, h, touch); await racing();
      const P = await page.eval(`(() => { const { g, hud, ev } = __t, p = g.player; __t.clear(); __t.quiet(); p.shield = 6; p.item = { type: 'missile', count: 3 };
        if (${JSON.stringify(state)} === 'countdown') { hud.pop(hud.cd, '2', 'cd-pop'); hud.cdHint.textContent = ${JSON.stringify(rocketHint())}; }
        else { ev.emit('gate:pass', { racer: p, perfect: true }); ev.emit('racer:stunt', { racer: p, kind: 'roll', reward: 12 }); }
        __sky.step(2);
        if (${JSON.stringify(state)} === 'auto') { g.input.handsOffT = 20; hud.update(0.016, g); }   // the guide has flown 20 s with no key: the plate is up (set after the steps: input.js recounts it every frame)
        // the feed is not left to chance: none during a countdown (nothing has happened yet), two lines in a running race (the most a touch screen shows); what the race did in those two steps must not decide whether the ticker is measured
        hud.feed.clear(); hud.feedEls.clear(); hud.tickEl.replaceChildren();
        if (${JSON.stringify(state)} !== 'countdown') { hud.say("Dutch Bergman's missile hit Mika Tanaka"); hud.say('Ace Hardcastle passed you'); }   // the longest feed text (hud-feed.js: "<name>'s missile hit <name>") and a short one
        const P = {}, named = ${JSON.stringify(NAMED)}; for (const k in named) { const r = __t.rect(named[k]); if (r) P[k] = r; }
        const t = document.getElementById('sb-touch'); if (t && getComputedStyle(t).display !== 'none') for (const c of t.children) { const r = c.getBoundingClientRect(); if (c.textContent.trim() && r.width > 1 && r.height > 1) P['btn:' + c.textContent.trim()] = { l: r.left, t: r.top, r: r.right, b: r.bottom }; }
        return { P, W: innerWidth, H: innerHeight }; })()`);
      const tag = `${w}x${h}${touch ? 't' : ''} ${state}`, keys = Object.keys(P.P);
      if (state === 'auto' && !P.P.auto) bad.push(`${tag}: the hands-off plate is not drawn`);
      if (state !== 'auto' && P.P.auto) bad.push(`${tag}: the hands-off plate is up without 8 s of handsOffT`);
      for (const k of keys) { const r = P.P[k];
        if (r.l < -1 || r.t < -1 || r.r > P.W + 1 || r.b > P.H + 1) bad.push(`${tag}: ${k} leaves the screen`);
        if (ov(r, pill)) bad.push(`${tag}: ${k} sits under the Almanac pill`); }
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        if (keys[i].startsWith('btn:') && keys[j].startsWith('btn:')) continue;   // the touch buttons among themselves are the flight agent's layout
        if (ov(P.P[keys[i]], P.P[keys[j]])) bad.push(`${tag}: ${keys[i]} overlaps ${keys[j]}`);
      }
    }
    assert.deepEqual(bad, [], 'HUD layout problems:\n  ' + bad.join('\n  '));
  });

  check('P-14: MISSILE banner follows time-to-impact, ROLL! shows while a barrel roll would work, and the lock reticle names its target', async () => {
    await env(1280, 720); await racing();
    const r = await page.eval(`(() => { const { ev, g, hud } = __t, p = g.player, [a, b] = __t.ais(), css = () => ({ txt: hud.warnTxt.textContent.trim(), roll: getComputedStyle(hud.rollEl).display !== 'none' && getComputedStyle(hud.warn).display !== 'none', near: parseFloat(hud.warn.style.getPropertyValue('--near')), rate: parseFloat(hud.warn.style.getPropertyValue('--rate')), shown: getComputedStyle(hud.warn).display !== 'none' });
      const m = { pos: p.flight.pos.clone().add({ x: 30, y: 5, z: 0 }) }, out = {}; __t.clear();
      ev.emit('missile:warn', { target: p, missile: m, dist: 200, tti: 3.4, evade: false, interval: 0.5, closing: 60 }); __sky.step(1); out.far = css();      // same distance, different time to impact:
      ev.emit('missile:warn', { target: p, missile: m, dist: 200, tti: 0.9, evade: true, interval: 0.2, closing: 220 }); __sky.step(1); out.close = css();   // only tti can tell these two apart
      p.flight.barrel.t = 0.4; __sky.step(1); out.rolling = css(); p.flight.barrel.t = 0;
      __t.clear(); __sky.step(1); ev.emit('missile:warn', { target: a, missile: m, dist: 90, tti: 0.9, evade: true }); __sky.step(1); out.other = css();
      __t.clear(); ev.emit('missile:warn', { target: p, missile: m, dist: 300 }); __sky.step(1); out.legacy = css();      // a payload without tti / evade still works (distance only)
      __t.clear(); ev.emit('missile:warn', { target: p, missile: m, dist: 120 }); __sky.step(1); out.legacyClose = css();
      __t.clear(); __t.place(a, 0.1, 0.1, 120); ev.emit('missile:lock', { owner: p, target: a, progress: 0.5, targetId: a.id, targetName: a.name }); __sky.step(1);
      out.lock = hud.lockLbl.textContent; ev.emit('missile:lock', { owner: p, target: a, progress: 1, targetId: a.id, targetName: a.name }); __sky.step(1); out.locked = hud.lockLbl.textContent; out.name = a.name;
      const plates = () => [...document.querySelectorAll('.hud-plates .nameplate')].filter((e) => e.style.display !== 'none').map((e) => e.textContent);
      out.platesLocked = plates(); __sky.step(40); for (const o of __t.ais()) if (o !== a) __t.place(o, 0.1, 0.1, 900); __t.place(a, 0.1, 0.1, 120); __sky.step(1); out.platesAfter = plates();   /* the HUD shows only the PLATE.max nearest rivals: keep the others far away */   // 0.4 s without a lock event: the reticle is gone and the rival has its plate again
      return out; })()`);
    assert.ok(r.far.shown && r.far.txt === 'MISSILE!' && !r.far.roll, 'far, no evade window: MISSILE! and no ROLL!  ' + JSON.stringify(r.far));
    assert.ok(r.close.txt === 'MISSILE CLOSE!' && r.close.roll, 'close and inside the roll window: MISSILE CLOSE! and ROLL!  ' + JSON.stringify(r.close));
    assert.ok(r.close.near > r.far.near + 0.3 && r.close.rate < r.far.rate, `the banner intensifies with time-to-impact: ${JSON.stringify([r.far.near, r.close.near, r.far.rate, r.close.rate])}`);
    assert.ok(!r.rolling.roll, 'ROLL! goes while the roll is already under way'); assert.ok(!r.other.shown, 'a missile at another racer shows nothing');
    assert.ok(r.legacy.shown && r.legacy.txt === 'MISSILE!' && !r.legacy.roll && r.legacyClose.txt === 'MISSILE CLOSE!', 'a warning without tti / evade falls back to distance: ' + JSON.stringify([r.legacy, r.legacyClose]));
    assert.equal(r.lock, r.name, 'the reticle names the target'); assert.equal(r.locked, 'LOCKED: ' + r.name);
    assert.ok(!r.platesLocked.includes(r.name), `the reticle already names its target, so it gets no second plate under the ring: ${JSON.stringify(r.platesLocked)}`);
    assert.ok(r.platesAfter.includes(r.name), `...and the plate comes back once the lock has lapsed: ${JSON.stringify(r.platesAfter)}`);
  });

  check('P-18 (round 2): with a target close ahead, the lock reticle\'s name never lands on the player\'s own craft (3 craft on 3 courses)', async () => {
    await env(1280, 720); await racing();
    const rows = []; let across = 0, total = 0;
    for (const courseId of ['redrock', 'neon', 'sunrise']) for (const craftId of ['falcon', 'comet', 'bulldog']) {
      const r = await page.eval(`(async () => { const { g, ev, hud } = __t, THREE = g.THREE;
        await __sky.start({ courseId: ${JSON.stringify(courseId)}, craftId: ${JSON.stringify(craftId)}, laps: 1, bots: 3, seed: 5 }); __sky.sim(60 * 6); __sky.step(30);
        const p = g.player, ai = __t.ais()[0], cam = g.camera, W = innerWidth, H = innerHeight, out = [];
        __t.clear(); __t.quiet(); p.shield = 0; g.cameraRig.setMode('chase');
        const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
        // the craft's real extent on the screen: every vertex of every visible mesh, projected (not the HUD's own box estimate)
        const craftRect = () => { cam.updateMatrixWorld(); p.model.updateMatrixWorld(true); const v = new THREE.Vector3(); let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
          p.model.traverse((o) => { if (!o.isMesh || !o.visible) return; const pos = o.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(cam); const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H; l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); } });
          return { l, t, r, b }; };
        const craft = craftRect();
        const q = p.render.quat, ax = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q), fwd = ax(0, 0, -1), up = ax(0, 1, 0), rgt = ax(1, 0, 0);
        for (const [ahead, dy, dx] of [[30, 0, 0], [45, 6, 0], [60, 0, 9], [25, -3, 0], [80, 10, -6], [38, 2, 3]]) {   // metres ahead, up, right of the craft
          __t.clear(); __t.quiet(); const pos = p.render.pos.clone().addScaledVector(fwd, ahead).addScaledVector(up, dy).addScaledVector(rgt, dx);
          ai.flight.pos.copy(pos); ai.prev.pos.copy(pos); ai.render.pos.copy(pos);
          ev.emit('missile:lock', { owner: p, target: ai, progress: 1, targetId: ai.id, targetName: ai.name }); hud.update(0, g);
          const shown = getComputedStyle(hud.reticle).display !== 'none'; if (!shown) { out.push({ ahead, dy, dx, shown }); continue; }
          const ring = box(hud.reticle), lbl = box(hud.lockLbl), w = lbl.r - lbl.l, h = lbl.b - lbl.t, cx = (ring.l + ring.r) / 2;
          out.push({ ahead, dy, dx, shown, ring, lbl, below: { l: cx - w / 2, r: cx + w / 2, t: ring.b, b: ring.b + h }, craft, side: hud.reticle.dataset.side, text: hud.lockLbl.textContent, W, H });
        }
        return { courseId: g.race.course.id, craftId: p.spec.id, out }; })()`);
      for (const o of r.out) {
        const tag = `${courseId}/${craftId} target ${o.ahead} m ahead${o.dy ? ', ' + o.dy + ' up' : ''}${o.dx ? ', ' + o.dx + ' right' : ''}`;
        if (!o.shown) continue;   // out of the camera's view: no reticle, nothing to keep clear
        total++; if (overlap(o.below, o.craft)) across++;
        assert.ok(/^LOCKED: /.test(o.text), `${tag}: the name reads LOCKED: ...`);
        assert.ok(o.lbl.l >= 0 && o.lbl.t >= 0 && o.lbl.r <= o.W && o.lbl.b <= o.H, `${tag}: the name ${JSON.stringify(o.lbl)} is on the screen`);
        assert.ok(!overlap(o.lbl, o.craft), `${tag}: the name (${o.side} the ring) ${JSON.stringify(o.lbl)} lands on the craft ${JSON.stringify(o.craft)}`);
        rows.push(`${tag}: ${o.side}`);
      }
      assert.equal(r.courseId, courseId); assert.equal(r.craftId, craftId);
    }
    console.log(`    P-18 round 2: ${total} close-ahead placements on 9 course/craft pairs; under the ring would have been across the craft in ${across} of them; the name sat: ` + [...new Set(rows.map((x) => x.split(': ')[1]))].join(', '));
    assert.ok(total >= 30, `most placements are in view: ${total} of 54`); assert.ok(across >= 8, `the case is really exercised (the default place would cross the craft ${across} times)`);
    cur = null;   // other courses were started: the next check reloads the redrock race
  });

  check('R2-P-08: while the ROLL! cue is still to come, MISSILE CLOSE says to wait for it (a roll begun on it fails); it is plain once the cue has shown, and it fits the screen', async () => {
    const seq = (w, h, touch) => env(w, h, touch).then(racing).then(() => page.eval(`(() => { const { ev, g, hud } = __t, p = g.player, out = {}; __t.clear(); __t.quiet(); p.tumble = 0; p.empT = 0; p.flight.barrel.t = 0; p.flight.barrel.cooldown = 0;   // a flyable craft: items.js canRoll is true
      const look = () => { const r = __t.rect('.warn-txt'); return { txt: hud.warnTxt.textContent.trim(), roll: getComputedStyle(hud.rollEl).display !== 'none' && getComputedStyle(hud.warn).display !== 'none', box: r, W: innerWidth, H: innerHeight }; };
      const warn = (m, tti, evade) => { ev.emit('missile:warn', { target: p, missile: m, dist: tti * 220, tti, evade, interval: 0.2, closing: 220 }); __sky.step(1); return look(); };
      const m1 = { pos: p.flight.pos.clone().add({ x: 30, y: 5, z: 0 }) }, m2 = { pos: m1.pos.clone() }, m3 = { pos: m1.pos.clone() }, m4 = { pos: m1.pos.clone() };
      out.far = warn(m1, 3.0, false);                     // not close yet: MISSILE!
      out.first = warn(m1, 1.7, false);                   // the first CLOSE ping: roll now and it fails
      out.mid = warn(m1, 1.0, false);                     // still before the cue
      out.cue = warn(m1, 0.48, true);                     // the ROLL! cue is up
      out.after = warn(m1, 0.05, false);                  // the window has gone: the cue was seen, nothing left to wait for
      __t.clear(); out.cooldown = (p.flight.barrel.cooldown = 1.5, warn(m2, 1.4, false)); p.flight.barrel.cooldown = 0;   // a roll that cannot start is not waited for
      __t.clear(); p.flight.barrel.t = 0.4; out.rolling = warn(m3, 1.4, false); p.flight.barrel.t = 0;                    // ... nor one that is under way
      __t.clear(); out.legacy = (ev.emit('missile:warn', { target: p, missile: m4, dist: 120 }), __sky.step(1), look());   // no time to impact reported: no cue to wait for
      __t.clear(); ev.emit('missile:warn', { target: p, missile: m1, dist: 150, tti: 1.5, evade: false, interval: 0.2 }); __sky.step(1); out.sameMissileAgain = look();   // clear() forgets the old missile: a ping from it starts the wait again
      __t.clear(); out.tight = warn({ pos: m1.pos.clone() }, 0.56, false);   // the banner at its largest (0.56 s: 1.16x) still wait-worded
      return out; })()`));
    const WAIT = 'MISSILE CLOSE: WAIT FOR ROLL!';
    const r = await seq(1280, 720, false);
    assert.equal(r.far.txt, 'MISSILE!'); assert.ok(!/WAIT/.test(r.far.txt) && !r.far.roll, 'not close yet: MISSILE!, no ROLL!');
    assert.equal(r.first.txt, WAIT, 'the first CLOSE ping (tti 1.7 s) tells the player to wait for the ROLL! cue, not to roll'); assert.ok(!r.first.roll, 'no ROLL! cue yet');
    assert.equal(r.mid.txt, WAIT); assert.ok(!r.mid.roll);
    assert.equal(r.cue.txt, 'MISSILE CLOSE!', 'once the cue is up the line stops telling the player to wait'); assert.ok(r.cue.roll, 'ROLL! shows');
    assert.equal(r.after.txt, 'MISSILE CLOSE!', 'after the cue the line stays plain (the window may have gone, but the player has been told)');
    assert.equal(r.cooldown.txt, 'MISSILE CLOSE!', 'no wait for a roll that cannot start (cooldown)'); assert.equal(r.rolling.txt, 'MISSILE CLOSE!', 'no wait while the roll is under way');
    assert.equal(r.legacy.txt, 'MISSILE CLOSE!', 'a warning without a time to impact keeps the plain text'); assert.equal(r.sameMissileAgain.txt, WAIT, 'a cleared HUD starts the wait again');
    for (const k of Object.keys(r)) assert.ok(!(/WAIT/.test(r[k].txt) && r[k].roll), `${k}: the wait line and the ROLL! cue are never up together`);
    // the wait line is the longest the banner gets: it stays on the screen, in two lines on a phone, at its largest scale
    for (const [w, h, touch] of [[1280, 720, false], [390, 844, true], [360, 640, true], [568, 320, true], [320, 568, true]]) {
      const t = (w === 1280 ? r : await seq(w, h, touch)).tight, b = t.box, tag = `${w}x${h}${touch ? 't' : ''}`;
      assert.equal(t.txt, WAIT, `${tag}: wait-worded`); assert.ok(b && b.l >= 0 && b.r <= t.W && b.t >= 0 && b.b <= t.H, `${tag}: the banner ${JSON.stringify(b)} is on the screen (${t.W}x${t.H})`);
    }
  });

  check('V-37 / V-20: a rival locking on shows a named warning and an on-screen arrow; Storm gives popups; camera and rear-view show a tick', async () => {
    for (const [w, h, touch] of [[1280, 720, false], [390, 844, true]]) {
      await env(w, h, touch); await racing();
      const r = await page.eval(`(() => { const { ev, g, hud } = __t, p = g.player, [a, b] = __t.ais(), out = {}; __t.clear(); __t.quiet();
        const alert = () => ({ txt: hud.lockTxt.textContent.trim(), shown: getComputedStyle(hud.lockTxt).display !== 'none' && getComputedStyle(hud.warn).display !== 'none', arrow: __t.rect('.lockon-arrow') });
        ev.emit('missile:lock', { owner: a, target: p, progress: 0.4, targetId: p.id, targetName: p.name }); __sky.step(1); out.locking = alert();
        ev.emit('missile:lock', { owner: a, target: p, progress: 1, targetId: p.id, targetName: p.name }); __sky.step(1); out.locked = alert();
        ev.emit('missile:unlock', { owner: a, target: p, targetId: p.id, targetName: p.name, reason: 'lost' }); __sky.step(1); out.unlocked = alert();
        ev.emit('missile:lock', { owner: p, target: b, progress: 0.5, targetId: b.id, targetName: b.name }); __sky.step(1); out.mineOnly = alert();   // my own lock is the reticle, not a warning
        __t.clear(); __sky.step(1);
        ev.emit('lightning:strike', { owner: p, target: a, pos: a.flight.pos }); out.storm = [...document.querySelectorAll('.hud-popups .popup')].map((e) => e.textContent);
        __t.clear(); ev.emit('lightning:strike', { owner: a, target: p, pos: p.flight.pos }); out.stormHit = [...document.querySelectorAll('.hud-popups .popup')].map((e) => ({ t: e.textContent, shown: getComputedStyle(e).display !== 'none' }));
        out.ticker = getComputedStyle(hud.tickEl).display; out.A = a.name; out.W = innerWidth; out.H = innerHeight;
        __t.clear(); __t.loud(); const mode0 = g.cameraRig.mode; ev.emit('input:camera'); __sky.step(1); out.cam = [hud.note.textContent, hud.note.classList.contains('on'), mode0, g.cameraRig.mode];
        ev.emit('input:lookback'); out.look = hud.note.textContent; g.cameraRig.setMode('chase');
        return out; })()`);
      const tag = `${w}x${h}${touch ? 't' : ''}`;
      assert.ok(r.locking.shown && /IS LOCKING ON$/i.test(r.locking.txt) && r.locking.txt.includes(r.A), `${tag}: names the rival that is locking on: ${JSON.stringify(r.locking)}`);
      assert.ok(r.locking.arrow && r.locking.arrow.l >= 0 && r.locking.arrow.t >= 0 && r.locking.arrow.r <= r.W && r.locking.arrow.b <= r.H, `${tag}: the arrow is on screen ${JSON.stringify(r.locking.arrow)}`);
      assert.ok(r.locked.shown && /^LOCKED ON BY/i.test(r.locked.txt), `${tag}: locked: ${JSON.stringify(r.locked)}`);
      assert.ok(!r.unlocked.shown, `${tag}: missile:unlock clears the warning`); assert.ok(!r.mineOnly.shown, `${tag}: my own lock is not a warning`);
      assert.deepEqual(r.storm, ['STORM HIT ' + r.A], `${tag}: the Storm caster sees who was hit`);
      assert.deepEqual(r.stormHit, [{ t: 'HIT BY STORM', shown: true }], `${tag}: the victim gets a popup too`);
      if (touch) assert.equal(r.ticker, 'none', 'portrait phones have no feed: the popups are the feedback');
      assert.deepEqual([r.cam[0], r.cam[1]], ['CAMERA: FAR', true], `${tag}: camera tick ${JSON.stringify(r.cam)}`); assert.equal(r.look, 'REAR VIEW');
    }
  });

  check('E-08: race:missed shows MISSED THE LOOP to the local player only', async () => {
    await env(1280, 720); await racing();
    const r = await page.eval(`(() => { const { ev, g, hud } = __t, p = g.player, a = __t.ais()[0]; __t.clear();
      ev.emit('race:missed', { racer: a, what: 'loop', name: 'loop1' }); const other = hud.banner.textContent;
      ev.emit('race:missed', { racer: p, what: 'loop', name: 'loop1' }); return { other, text: hud.banner.textContent, cls: hud.banner.className }; })()`);
    assert.equal(r.other, '', 'a rival missing a loop shows nothing'); assert.equal(r.text, 'MISSED THE LOOP'); assert.ok(/\bon\b/.test(r.cls) && /\bmissed\b/.test(r.cls), 'banner is shown in its own style: ' + r.cls);
  });

  check('E-02: the countdown hint under the digit states the race rule (and clears at 3)', async () => {
    await env(1280, 720);
    const r = await page.eval(`(() => { const { ev, hud } = __t, out = []; for (const n of [3, 2, 1]) { ev.emit('race:countdown', { n }); out.push(hud.cdHint.textContent); } return out; })()`);
    assert.deepEqual(r, ['', rocketHint(), rocketHint()]); assert.doesNotMatch(r[1], /HOLD/);
  });

  check('the HUD checks raised no errors from the HUD modules', () => { assert.deepEqual(errorsNow().filter((t) => /hud/i.test(t)), [], 'page errors mentioning the HUD'); });
}
