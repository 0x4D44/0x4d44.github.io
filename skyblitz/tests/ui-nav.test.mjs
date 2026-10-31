// Menu, gamepad and touch flows in real headless Chrome: real key events, one static server, one browser, one page.
// Every check is its own node:test subtest, so a failure is reported where it happens and the checks after it still run. Each check starts from a
// known state (ensureBase: default URL, 1280x720, no touch emulation, a menu showing) or loads the page it needs.
// Run: node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/ui-nav.test.mjs        (3-5 minutes; the races dominate)
//   UI_NAV_ONLY=<regex>  run only the checks whose name matches (case-insensitive), e.g. UI_NAV_ONLY='V-26|podium'
//   UI_NAV_TRACE=1       print every key press with the focus state
//   SKY_URL=http://127.0.0.1:8100/skyblitz   use a server that is already running;   SKY_ROOT=<dir holding skyblitz/>   serve a frozen copy of the game
import test from 'node:test';
import assert from 'node:assert/strict';
import { launchChrome } from './tools/chrome.mjs';
import { startStaticServer } from './tools/static-server.mjs';

const srv = process.env.SKY_URL ? null : await startStaticServer({ root: process.env.SKY_ROOT || undefined });
const BASE = process.env.SKY_URL || `${srv.url}/skyblitz`, GAME = BASE + '/', QS = 'debug=1&mute=1';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const trace = !!process.env.UI_NAV_TRACE;

const chrome = await launchChrome({ width: 1280, height: 720 });
test.after(async () => { await chrome.close(); await srv?.close(); });
{   // one browser and one page for every check below
  const page = await chrome.newPage();
  // A page with a clean profile at the title screen (clear: wipe localStorage first, so settings and the save are defaults and the first-race hint shows).
  const fresh = async ({ clear = false, qs = QS } = {}) => {
    if (clear) await page.eval(`(() => { try { localStorage.clear(); } catch { /* about:blank */ } })()`).catch(() => {});
    // goto() can return while the OLD document is still current (a same-URL navigation commits later), and the old page also says __sky.ready: mark it, then wait for an unmarked one
    await page.eval(`window.__stale = true`).catch(() => {});
    await page.goto(`${GAME}?${qs}`);
    try { await page.waitFor('!window.__stale && window.__sky && __sky.ready', { timeout: 100000 }); } catch (e) { console.log(await page.eval('document.readyState+" "+location.href+" "+!!window.__sky+" "+document.body.innerText.slice(0,200)')); console.log(page.logs.slice(0, 20).map((l) => l.text).join(' | ')); throw e; }
    await page.waitFor('__sky.game.ui.cur && __sky.game.ui.cur.name', { timeout: 20000 }).catch(() => {}); await delay(500);
  };
  await fresh();
  const state = () => page.eval(`(() => {
    const u = __sky.game.ui, a = document.activeElement, r = a && a.getBoundingClientRect();
    return { screen: u.cur && u.cur.name, tag: a && a.tagName, cls: a && String(a.className), label: a && ((a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 30)),
      visible: !!(a && a.offsetParent !== null && r.width > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight),
      underPill: !!(r && r.left < 112 && r.top < 44 && a !== document.body), nav: !!(a && a.dataset && 'nav' in a.dataset) };
  })()`);
  const press = async (k) => { await page.key(k); await delay(220); const s = await state(); if (trace) console.log(k.padEnd(11), JSON.stringify(s)); return s; };
  const goto = async (name, params) => { await page.eval(`__sky.game.ui.goto(${JSON.stringify(name)}, ${JSON.stringify(params || {})})`); await delay(450); return page.eval('0').then(state); };
  const toMain = async () => { await page.eval(`(() => { const u = __sky.game.ui; u.save.gp = null; u.goto('main'); })()`); await delay(400); };
  // The first race started from the menus opens the controls hint (paused). Checks that are about something else mark it seen; the hint has its own checks.
  const noHint = () => page.eval(`__sky.game.ui.save.hintsSeen = true`);
  // The state every check may rely on: the default page (not another check's URL), 1280x720, no touch emulation, a menu showing (not a race).
  const resetEnv = async () => { await page.s('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {}); await page.setViewport(1280, 720, { dpr: 1, mobile: false }); };
  const ensureBase = async () => {
    await resetEnv();
    // (a touch seen, a faked pad or a started race all leave the page changed for good: reload)
    const ok = await page.eval(`location.search === '?${QS}' && !!window.__sky && __sky.ready && ['title', 'menu'].includes(__sky.game.state) && !!(__sky.game.ui.cur && __sky.game.ui.cur.name) && !__sky.game.input.touchActive && !window.__pad`).catch(() => false);
    if (!ok) await fresh();
  };
  const only = process.env.UI_NAV_ONLY && new RegExp(process.env.UI_NAV_ONLY, 'i');
  // own: the check loads its own page first, so the page reset is skipped (one boot, not two); the viewport and touch emulation are always reset.
  const check = (name, fn, { own = false, timeout = 240000 } = {}) => test(name, { skip: only && !only.test(name) ? 'UI_NAV_ONLY' : false, timeout }, async () => { await (own ? resetEnv() : ensureBase()); await fn(); });

  check('title: Enter reaches the main menu', async () => {
    await fresh({ clear: true });
    assert.equal((await state()).screen, 'title');
    assert.equal((await press('Enter')).screen, 'main');
  }, { own: true });

  check('main menu: first focus is an interactive control and not under the pill', async () => {
    await toMain();
    const s = await state(); assert.ok(s.nav && s.visible && !s.underPill, JSON.stringify(s));
  });

  // A saved Grand Prix with 8 pilots, as the main menu and the podium read it (`totals` is an object keyed by pilot name).
  const GP_TOTALS = { 'Nova Kim': { points: 27, wins: 0, color: '#e6212b', isPlayer: false }, You: { points: 25, wins: 1, color: '#ffd02e', isPlayer: true }, 'Rosa Vega': { points: 24, wins: 1, color: '#ff7bc0', isPlayer: false }, 'Mika Tanaka': { points: 22, wins: 1, color: '#18b8b0', isPlayer: false },
    'Ace Hardcastle': { points: 22, wins: 1, color: '#2f7bff', isPlayer: false }, Zed: { points: 19, wins: 0, color: '#ffcf1f', isPlayer: false }, 'Pip Moreau': { points: 11, wins: 0, color: '#5bd16a', isPlayer: false }, 'Dutch Bergman': { points: 6, wins: 0, color: '#6f8f3a', isPlayer: false } };

  check('main menu: a saved Grand Prix reads "Resume GP" with its race and rank, also on a phone, and the 7 entries fit without a scrollbar (E-24 / V-18)', async () => {
    try {
      for (const [w, h] of [[1280, 720], [1366, 768], [1024, 600], [844, 390], [390, 844], [360, 640], [320, 568]]) {
        await page.setViewport(w, h, { dpr: 1 }); await delay(300);
        await page.eval(`(() => { const u = __sky.game.ui; u.save.gp = { race: 1, craft: 'falcon', livery: 0, difficulty: 'normal', totals: ${JSON.stringify(GP_TOTALS)} }; u.goto('main'); })()`); await delay(500);
        const m = await page.eval(`(() => {
          const scr = document.querySelector('.scr.main'), menu = scr.querySelector('.menu'), bs = [...menu.querySelectorAll('.btn')].filter((b) => b.offsetParent !== null);
          const resume = bs.find((b) => /Resume/.test(b.textContent)), lines = (e) => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size; };
          const sm = resume && resume.querySelector('small'), sr = sm && sm.getBoundingClientRect(), br = resume && resume.getBoundingClientRect(), lr = resume && resume.querySelector('.btn-t').getBoundingClientRect();
          return { n: bs.length, label: resume && resume.querySelector('.btn-t').textContent, sub: resume && resume.querySelector('small').textContent, aria: resume && resume.getAttribute('aria-label'),
            subShown: !!sm && getComputedStyle(sm).display !== 'none' && sr.width > 0 && sr.height > 0, subInside: !!sr && sr.top >= br.top - 1 && sr.bottom <= br.bottom + 1 && sr.left >= br.left - 1 && sr.right <= br.right + 1, subBelow: !!sr && sr.top >= lr.bottom - 2,
            wrapped: bs.filter((b) => lines(b.querySelector('.btn-t')) > 1 || (b.querySelector('small') && lines(b.querySelector('small')) > 1)).map((b) => b.textContent.trim()),
            menuScrolls: menu.scrollHeight > menu.clientHeight + 1, scrScrolls: scr.scrollHeight > scr.clientHeight + 1,
            foot: (() => { const f = scr.querySelector('.main-foot'), fr = f && f.getBoundingClientRect(); return f ? { text: f.textContent, inView: fr.width > 0 && fr.left >= -1 && fr.right <= innerWidth + 1 && fr.top >= 0 && fr.bottom <= innerHeight + 1, hits: bs.filter((b) => { const r = b.getBoundingClientRect(); return r.left < fr.right && r.right > fr.left && r.top < fr.bottom && r.bottom > fr.top; }).length } : null; })(),
            off: bs.filter((b) => { const r = b.getBoundingClientRect(); return r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1; }).map((b) => b.textContent.trim().slice(0, 14)),
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        })()`);
        const at = `${w}x${h}: ${JSON.stringify(m)}`;
        assert.equal(m.n, 7, 'seven entries with a saved Grand Prix: ' + at);
        assert.equal(m.label, 'Resume GP', at); assert.equal(m.sub, 'Race 2 of 4 - 2nd, 25 pts', 'race, rank and points, no dangling dash: ' + at);
        assert.equal(m.aria, 'Resume Grand Prix, Race 2 of 4 - 2nd, 25 pts', at);
        // the line is on screen at every size, a phone included (the other sub-labels are hidden there; this one is the player's own race and rank), under the label when the width is narrow
        assert.ok(m.subShown && m.subInside, 'the race and rank line is drawn inside its entry (a phone used to hide it, so the rank showed only in the aria-label): ' + at);
        if (w <= 760) assert.ok(m.subBelow, 'on a narrow screen the line sits under the label (side by side it does not fit): ' + at);
        assert.deepEqual(m.wrapped, [], 'no label wraps: ' + at); assert.ok(!m.menuScrolls && !m.scrScrolls, 'the menu needs no scrollbar: ' + at);
        assert.deepEqual(m.off, [], 'every entry is on screen: ' + at); assert.ok(m.overflowX <= 1, 'no sideways scroll: ' + at);
        // R2-V-12: the footer describes the game in its own words (it named two other games), and it stays on screen, clear of the entries, at every size
        assert.ok(m.foot && m.foot.text.length >= 20 && !/Mario|Star ?Fox|Nintendo/i.test(m.foot.text), 'the footer is the game\'s own words, no third-party game names: ' + at);
        assert.ok(m.foot.inView && m.foot.hits === 0, 'the footer is on screen and clear of the entries: ' + at);
      }
    } finally { await page.eval(`__sky.game.ui.save.gp = null`); }
  });

  check('aircraft: Enter on the stage continues; Up/Down cycle livery; Left/Right cycle aircraft', async () => {
    await page.eval(`__sky.game.ui.startFlow('quick')`); await delay(700);
    let s = await state(); assert.equal(s.screen, 'aircraft'); assert.ok(/stage/.test(s.cls), 'stage has first focus: ' + JSON.stringify(s));
    const liv = () => page.eval(`document.querySelector('.liv-n').textContent`), name = () => page.eval(`document.querySelector('.ac-name').textContent`);
    const l0 = await liv(); s = await press('ArrowDown'); assert.ok(/stage/.test(s.cls), 'focus stays on the stage'); assert.notEqual(await liv(), l0, 'ArrowDown changes livery');
    await press('ArrowUp'); assert.equal(await liv(), l0, 'ArrowUp restores livery');
    const n0 = await name(); await press('ArrowRight'); assert.notEqual(await name(), n0, 'ArrowRight changes aircraft'); await press('ArrowLeft'); assert.equal(await name(), n0);
    assert.ok(/Esc/.test(await page.eval(`document.querySelector('.keyhint').textContent`)), 'key hint shown');
    assert.equal((await press('Enter')).screen, 'course', 'Enter on the stage = Continue');
  });

  check('aircraft: the keyboard hint is hidden on a touch screen, and a connected gamepad still gets its own hint (V-32)', async () => {
    const hint = () => page.eval(`(() => { const k = document.querySelector('.scr.aircraft .keyhint'); return k ? { shown: k.offsetParent !== null && getComputedStyle(k).display !== 'none', text: k.textContent, pad: k.hasAttribute('data-pad'), touch: document.getElementById('ui').classList.contains('touch') } : null; })()`);
    await page.eval(`__sky.game.ui.startFlow('quick')`); await delay(700);
    let k = await hint(); assert.ok(k && k.shown && /Esc/.test(k.text) && !k.touch, 'keyboard and mouse: the key hint shows ' + JSON.stringify(k));
    await page.s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 5, y: 700, id: 1 }] }); await page.s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await delay(500);   // the first touch marks the UI as touch
    k = await hint(); assert.ok(k && k.touch, 'a first touch sets .touch on the UI root ' + JSON.stringify(k)); assert.ok(!k.shown, 'no keyboard hint on a touch screen ' + JSON.stringify(k));
    await fakePad(); await page.eval(`__sky.game.ui.startFlow('quick')`); await delay(700);   // a pad on a touch device still gets its hint
    k = await hint(); assert.ok(k && k.shown && k.pad && /A select/.test(k.text), 'the gamepad hint stays on a touch device ' + JSON.stringify(k));
  });

  check('aircraft: the whole aircraft stays inside the turntable stage at every turn of the table, on a tall narrow stage too (768x1024)', async () => {
    // How far from the middle of the stage the aircraft reaches (1 = the stage edge): every vertex on show, projected through the turntable camera, over 16 angles of the table.
    const reach = () => page.eval(`(() => {
      const tt = __sky.game.ui.turntable, v = new (tt.cam.position.constructor)(); let x = 0, y = 0;
      for (let k = 0; k < 16; k++) {
        tt.angle = k * Math.PI / 8; tt.pop = 1; tt.frame(0); tt.pivot.updateMatrixWorld(true); tt.cam.updateMatrixWorld(true);
        tt.model.traverse((o) => { const p = o.isMesh && o.visible !== false && o.geometry.attributes.position; for (let i = 0; p && i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).project(tt.cam); x = Math.max(x, Math.abs(v.x)); y = Math.max(y, Math.abs(v.y)); } });
      }
      return { x: +x.toFixed(2), y: +y.toFixed(2), stage: [tt.canvas.clientWidth, tt.canvas.clientHeight] };
    })()`);
    for (const [w, h] of [[768, 1024], [1024, 1366], [800, 700], [1280, 720], [390, 844]]) {
      await page.setViewport(w, h, { dpr: 1 }); await delay(300);
      await page.eval(`__sky.game.ui.startFlow('quick')`); await page.waitFor(`!!__sky.game.ui.turntable && !!__sky.game.ui.turntable.model`, { timeout: 20000 }); await delay(500);   // the screen is open and the stage has focus
      const n = await page.eval(`document.querySelectorAll('.scr.aircraft .stage .dots i').length`); assert.ok(n >= 2, 'the aircraft screen lists its aircraft');
      for (let i = 0; i < n; i++) {   // every aircraft: ArrowRight on the stage turns to the next
        const r = await reach(), at = `${w}x${h} ${await page.eval(`document.querySelector('.ac-name').textContent`)}: ${JSON.stringify(r)}`;
        assert.ok(r.x <= 0.97 && r.y <= 0.97, 'the aircraft stays inside the stage at every turn of the table (on a tall narrow stage it used to reach out to 1.8 half-widths and was cut at the sides): ' + at);
        assert.ok(r.x >= 0.5, 'and it is not shrunk to a speck to get there: ' + at);
        await press('ArrowRight');
      }
    }
  });

  check('aircraft: the details panel never scrolls on a short landscape window, for any aircraft, keeps its name, bars and swatches, and refits when the window changes (round 3); the bars are at least 40 px wide at every size, tablets upright included (R2-V-04)', async () => {
    // The panel (.info) stacks class chip, name, tagline, six stat bars, livery name and swatches. It used to scroll on every landscape phone: 12 px past its box at 844x390, 15 at 812x375, 30 at 640x360, 79 at 1024x600.
    // select.js fit() now takes room back in steps (spacing, tagline, bar icons, ...) only while the content is taller than the panel. Per aircraft (the stage's next arrow steps through them): scrollHeight - clientHeight is 0.
    const panel = () => page.eval(`(async () => {
      const scr = document.querySelector('.scr.aircraft'), info = scr.querySelector('.info'), next = scr.querySelector('.arrow.r'), n = scr.querySelectorAll('.stage .dots i').length, out = [];
      const shown = (e) => !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none';
      for (let i = 0; i < n; i++) {
        await new Promise((r) => setTimeout(r, 220));   // longer than the swatches' .12 s transform transition, so the selected one is measured where it settles
        const ib = info.getBoundingClientRect(), sw = [...info.querySelectorAll('.sw')], inside = (e) => { const b = e.getBoundingClientRect(); return b.top >= ib.top - 1 && b.bottom <= ib.bottom + 1; };
        const stats = [...info.querySelectorAll('.stat')], lastBar = stats[stats.length - 1].getBoundingClientRect(), swTop = Math.min(...sw.map((e) => e.getBoundingClientRect().top));   // as drawn: the selected swatch is lifted and scaled
        // barW: the narrowest bar as laid out (offsetWidth, not the bounding box: the bars are skewed, which makes a zero-width bar measure 6 px wide, a slash: R2-V-04)
        out.push({ who: info.querySelector('.ac-name').textContent, over: info.scrollHeight - info.clientHeight, nameOn: shown(info.querySelector('.ac-name')), bars: stats.filter((e) => shown(e) && inside(e)).length, barW: Math.min(...stats.map((e) => e.querySelector('.st-bar').offsetWidth)),
          swatches: sw.length, swIn: sw.filter(inside).length, clear: +(swTop - lastBar.bottom).toFixed(1), chip: shown(info.querySelector('.ac-cls')), tag: shown(info.querySelector('.ac-tag')), liv: shown(info.querySelector('.liv-l')),
          fit: (info.className.match(/fit\\d/g) || []).length });
        next.click();
      }
      return out;
    })()`);
    const open = async (w, h) => { await page.setViewport(w, h, { dpr: 1 }); await delay(300); await page.eval(`__sky.game.ui.startFlow('quick')`); await page.waitFor(`!!document.querySelector('.scr.aircraft .info .sw')`, { timeout: 20000 }); await delay(400); };
    // 768x1024 and 820x1180 are tablets held upright: the details panel is 275 / 295 px wide there (R2-V-04: the bars were 0 px wide, a slash)
    for (const [w, h] of [[844, 390], [812, 375], [667, 375], [640, 360], [568, 320], [896, 414], [932, 430], [800, 480], [1024, 600], [1280, 720], [390, 844], [768, 1024], [820, 1180]]) {
      await open(w, h);
      const rows = await panel(); assert.ok(rows.length >= 2, 'the aircraft screen lists its aircraft: ' + rows.length);
      for (const r of rows) {
        const at = `${w}x${h} ${r.who}: ${JSON.stringify(r)}`;
        assert.ok(r.barW >= 40, `a stat bar is ${r.barW} px wide, under 40 (at 768x1024 the label column took the whole row and the bars were 0 px: a slash with only the number left): ` + at);
        assert.ok(r.over <= 0, 'the details panel scrolls by ' + r.over + ' px (a scrollbar over the stat bars on a phone): ' + at);
        assert.ok(r.nameOn && r.bars === 6, 'the aircraft name and all six stat bars stay on show, inside the panel: ' + at);
        assert.ok(r.swatches >= 2 && r.swIn === r.swatches, 'every livery swatch stays inside the panel: ' + at);
        assert.ok(r.clear >= 2, 'the swatches (the selected one lifted) stay clear of the last stat bar instead of riding up over it (at 568x320 the orange ring covered the Armour row): ' + at);
        if (h >= 360 && w > h) assert.ok(r.chip && r.liv, 'from 360 px tall up only the tagline (and spacing) gives way: the class chip and the livery name stay: ' + at);
        if (h > w) assert.ok(r.tag && r.chip && r.liv, 'a portrait phone has the room: nothing is hidden: ' + at);
        // not cramped: the order of the steps matters, the tagline goes before the bars are squeezed (a later step has to do the work of a broken earlier one and the panel still "fits")
        if (w === 1024 && h === 600) assert.ok(r.fit <= 2 && !r.tag && r.chip && r.liv, 'at 1024x600 only the spacing and the tagline give way, the bars and their icons keep their size: ' + at);
        if ((w === 1280 && h === 720) || h > w) assert.ok(r.fit <= 1, 'with this much room at most the spacing tightens: ' + at);
      }
    }
    // the panel refits when the window changes under it (a rotation) and gives the room back, without leaving the screen
    const now = () => page.eval(`(() => { const i = document.querySelector('.scr.aircraft .info'); return { over: i.scrollHeight - i.clientHeight, tag: getComputedStyle(i.querySelector('.ac-tag')).display !== 'none', fit: (i.className.match(/fit\\d/g) || []).length }; })()`);
    await open(1280, 720); let s = await now(); assert.ok(s.over <= 0 && s.tag, 'at 1280x720 the panel fits with its tagline: ' + JSON.stringify(s));
    // 568x320 is a window where a step is always needed. (844x390 used to be one, until R2-V-07 moved the header up beside the pill: the panel then gains 26 px and fits with no step at all, which is checked next.)
    await page.setViewport(568, 320, { dpr: 1 }); await delay(600); s = await now();
    assert.ok(s.over <= 0 && !s.tag && s.fit >= 1, 'turned to 568x320 under the open screen, the panel refits by itself (no scrollbar, tagline given up, at least one step taken): ' + JSON.stringify(s));
    await page.setViewport(844, 390, { dpr: 1 }); await delay(600); s = await now();
    assert.ok(s.over <= 0 && !s.tag, 'turned on to 844x390 it still fits (the tagline is left out of the short-landscape layout by the stylesheet): ' + JSON.stringify(s));
    await page.setViewport(1280, 720, { dpr: 1 }); await delay(600); s = await now();
    assert.ok(s.over <= 0 && s.tag, 'and back at 1280x720 it gives the room back (the tagline returns): ' + JSON.stringify(s));
  });

  check('every flow screen: Escape goes back one screen; first focus is visible and clear of the pill', async () => {
    const chain = [['course', 'aircraft'], ['options', 'course'], ['aircraft', 'main']];
    for (const [scr, back] of chain) {
      const s = await goto(scr);
      assert.equal(s.screen, scr); assert.ok(s.nav && s.visible && !s.underPill, scr + ' first focus ' + JSON.stringify(s));
      assert.equal((await press('Escape')).screen, back, scr + ' Escape');
    }
  });

  check('course select lists sunrise, redrock, neon, frost', async () => {
    await goto('course');
    const ids = await page.eval(`[...document.querySelectorAll('.scr.course .card')].map((c) => c.dataset.id || c.textContent.trim().slice(0, 14))`);
    assert.ok(ids.length >= 4, JSON.stringify(ids));
    const txt = (await page.eval(`document.querySelector('.scr.course').textContent`)).toLowerCase();
    for (const n of ['sunrise', 'redrock', 'neon', 'frost']) assert.ok(txt.includes(n), n + ' missing');
  });

  check('course select: all four cards visible without scrolling at 1280x720, 1366x768, 1920x1080; each shows its own outline', async () => {
    for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1080]]) {
      await page.setViewport(w, h, { dpr: 1 }); await delay(300);
      await goto('course'); await delay(2500);
      const r = await page.eval(`(() => { const g = document.querySelector('.scr.course .cards'); const cs = [...document.querySelectorAll('.scr.course .card')].map((c) => c.getBoundingClientRect()); return { n: cs.length, inside: cs.every((b) => b.top >= g.getBoundingClientRect().top - 1 && b.bottom <= g.getBoundingClientRect().bottom + 1 && b.left >= 0 && b.right <= innerWidth), scrolls: g.scrollHeight > g.clientHeight + 1, dbg: [g.scrollHeight, g.clientHeight], vis: cs.every((b) => b.bottom <= innerHeight) }; })()`);
      assert.equal(r.n, 4); assert.ok(r.inside && r.vis && !r.scrolls, `${w}x${h}: cards fit without scrolling ${JSON.stringify(r)}`);
    }
    const sums = await page.eval(`[...document.querySelectorAll('.scr.course canvas.map')].map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) { s += (i >> 2) % c.width * 7 + Math.floor((i >> 2) / c.width) * 13; n++; } return n ? s : 0; })`);
    assert.ok(sums.every((x) => x > 0), 'every card has a drawn outline: ' + sums); assert.equal(new Set(sums).size, 4, 'the four outlines differ: ' + sums);
    await page.setViewport(1280, 720, { dpr: 1 });
  });

  const courseAt = () => page.eval(`(() => { const a = document.activeElement, c = a && a.closest('.card'); return c ? c.dataset.c : null; })()`);
  // The course screen as a new quick race opens it, with Sunrise chosen (blur first: a focused card left by an earlier check would keep focus across the hide and show)
  const openCourse = async () => { await page.eval(`(() => { document.activeElement && document.activeElement.blur(); const u = __sky.game.ui; u.startFlow('quick'); u.flow.course = 'sunrise'; u.after('aircraft'); })()`); await delay(700); };
  check('course select: first focus is the course chosen last, and only that card carries it (V-25)', async () => {
    await openCourse();
    const firsts = () => page.eval(`[...document.querySelectorAll('.scr.course .card')].filter((c) => c.dataset.nav === 'first').map((c) => c.dataset.c)`);
    assert.equal(await courseAt(), 'sunrise', 'opens on the course chosen last'); assert.deepEqual(await firsts(), ['sunrise']);
    let s = await press('Enter'); assert.equal(s.screen, 'options', 'Enter on a card picks it and goes on');   // Sunrise picked
    s = await press('Escape'); assert.equal(s.screen, 'course'); assert.equal(await courseAt(), 'sunrise', 'back on the course screen: focus on the card picked');
    await press('ArrowRight'); assert.equal(await courseAt(), 'redrock', 'Right moves to the next card');
    s = await press('Enter'); assert.equal(s.screen, 'options'); assert.equal(await page.eval(`__sky.game.ui.flow.course`), 'redrock');   // Redrock picked
    s = await press('Escape'); assert.equal(s.screen, 'course');
    assert.equal(await courseAt(), 'redrock', 'focus is on the card picked last, not on the first one ever picked (it used to land on Sunrise)');
    assert.deepEqual(await firsts(), ['redrock'], 'exactly one card carries first-focus');
  });

  check('navigation: Left and Right stay in their row, so the leftmost card and laps "1" never jump to Back; Up and Down still reach the footer (V-26)', async () => {
    const at = () => page.eval(`(() => { const a = document.activeElement; return { screen: __sky.game.ui.cur.name, card: a.closest('.card') ? a.closest('.card').dataset.c : null, label: (a.textContent || '').trim().slice(0, 20), footer: !!a.closest('.ftr') }; })()`);
    await openCourse();
    let s = await at(); assert.equal(s.card, 'sunrise', 'starts on the first card: ' + JSON.stringify(s));
    await press('ArrowLeft'); s = await at(); assert.ok(s.card === 'sunrise' && s.screen === 'course', 'Left from the leftmost card stays on it (it used to jump to Back): ' + JSON.stringify(s));
    await press('Enter'); s = await at(); assert.equal(s.screen, 'options', 'Enter after that Left is still "pick Sunrise", not Back'); await press('Escape');
    for (let i = 0; i < 6; i++) await press('ArrowRight');
    s = await at(); assert.ok(s.card && s.screen === 'course', 'Right from the last card stays on the cards: ' + JSON.stringify(s));
    await press('ArrowDown'); s = await at(); assert.ok(s.footer, 'Down from the cards still reaches the footer: ' + JSON.stringify(s));
    await press('ArrowUp'); s = await at(); assert.ok(s.card, 'Up from the footer returns to a card: ' + JSON.stringify(s));
    // race options: "1" is the leftmost lap choice, "5" the rightmost; Back and Start race share the footer row
    await goto('options'); await page.eval(`document.querySelector('.scr.options .opt[data-id=opt-laps]').focus()`);
    s = await at(); assert.equal(s.label, '1', JSON.stringify(s));
    await press('ArrowLeft'); s = await at(); assert.ok(s.label === '1' && s.screen === 'options' && !s.footer, 'Left from laps "1" stays on it (it used to jump to Back): ' + JSON.stringify(s));
    await press('ArrowRight'); await press('ArrowRight'); s = await at(); assert.equal(s.label, '5', 'Right walks 1 -> 3 -> 5: ' + JSON.stringify(s));
    await press('ArrowRight'); s = await at(); assert.ok(s.label === '5' && !s.footer, 'Right from laps "5" stays on it: ' + JSON.stringify(s));
    await press('ArrowDown'); s = await at(); assert.ok(/Start race/.test(s.label) && s.footer, 'Down from the last row lands on Start race: ' + JSON.stringify(s));
    await press('ArrowLeft'); s = await at(); assert.ok(/Back/.test(s.label) && s.footer, 'Left along the footer row moves to Back: ' + JSON.stringify(s));
    await press('ArrowRight'); s = await at(); assert.ok(/Start race/.test(s.label), 'and Right moves back to Start race: ' + JSON.stringify(s));
  });

  check('race options: each difficulty has its own one-line description, in plain words about the rivals (difficulty copy)', async () => {
    await goto('options');
    const pick = async (i) => { await page.eval(`document.querySelectorAll('.scr.options .opt[data-id=opt-diff]')[${i}].click()`); await delay(150); return page.eval(`document.querySelector('.scr.options .opt-desc').textContent`); };
    const got = {}; for (const [i, id] of ['easy', 'normal', 'hard', 'expert'].entries()) got[id] = await pick(i);
    assert.equal(got.easy, 'Relaxed rivals. Good for learning the courses.'); assert.equal(got.normal, 'Rivals race properly. Fly clean and you can win.'); assert.equal(got.hard, 'Rivals fly the line and fight for it.');
    assert.ok(got.expert.length > 10, 'Expert keeps a description of its own: ' + got.expert); assert.equal(new Set(Object.values(got)).size, 4, 'four different descriptions: ' + JSON.stringify(got));
    await pick(1);   // back to Normal, the default
  });

  check('settings, controls, credits: reachable in <=2 arrows from first focus; Escape returns to the opener', async () => {
    for (const scr of ['settings', 'controls', 'credits']) {
      let s = await goto(scr, { back: 'main' });
      assert.equal(s.screen, scr); assert.ok(s.nav && s.visible && !s.underPill, scr + ' ' + JSON.stringify(s));
      assert.equal((await press('Escape')).screen, 'main', scr + ' Escape');
    }
  });

  check('credits: the licence text is rendered as headings, paragraphs and links rather than Markdown source, and Down scrolls it (V-29)', async () => {
    for (const [w, h] of [[1280, 720], [390, 844]]) {
      await page.setViewport(w, h, { dpr: 1 }); await delay(300);
      await page.eval(`__sky.game.ui.goto('credits', { back: 'main' })`);
      await page.waitFor(`document.querySelectorAll('.scr.credits .md h3').length >= 2`, { timeout: 15000 });   // the licence notices arrive from assets/music/CREDITS.md
      const text = await page.eval(`document.querySelector('.scr.credits .panel').innerText`);
      const at = `${w}x${h}`;
      assert.doesNotMatch(text, /^\s*#{1,6}\s/m, at + ': no "# heading" source is shown'); assert.doesNotMatch(text, /\*\*/, at + ': no **bold** marks'); assert.doesNotMatch(text, /`/, at + ': no `code` marks');
      assert.doesNotMatch(text, /music-src|\[object /, at + ': no repo path and no stringified DOM node');
      assert.match(text, /Sample licences/i, at + ': the sample licence notices loaded under their own heading');   // (innerText follows the heading's text-transform: uppercase)
      const c = await page.eval(`(() => { const p = document.querySelector('.scr.credits .panel'), links = [...p.querySelectorAll('a')]; return { heads: p.querySelectorAll('h3, h4, h5').length, links: links.length, safe: links.every((a) => /^https?:/.test(a.href) && a.rel.includes('noopener') && a.target === '_blank'),
        scrolls: p.scrollHeight > p.clientHeight + 1, wide: p.scrollWidth > p.clientWidth + 1, pageWide: document.documentElement.scrollWidth - document.documentElement.clientWidth, top: p.scrollTop }; })()`);
      assert.equal(c.top, 0, at + ': the screen opens at the top, not where the last visit left off (the second pass re-opens it after ArrowDown scrolled it): ' + JSON.stringify(c));
      assert.ok(c.heads >= 3 && c.links >= 3 && c.safe, at + ': headings and safe links: ' + JSON.stringify(c));
      assert.ok(c.scrolls && !c.wide && c.pageWide <= 1, at + ': a scrolling panel with no sideways overflow: ' + JSON.stringify(c));
      // ui.js places the first focus one animation frame after the screen opens, and on a revisit the licence text is already there, so nothing above has waited for it:
      // wait for the condition (the assertion below still says what is focused when it never arrives)
      await page.waitFor(`!!document.activeElement && !!document.activeElement.closest('.scr.credits')`, { timeout: 5000 }).catch(() => {});
      const s = await state(); assert.ok(/Back/.test(s.label) && s.visible && !s.underPill, at + ': focus is on Back ' + JSON.stringify(s));
      await press('ArrowDown'); await delay(700);
      assert.ok((await page.eval(`document.querySelector('.scr.credits .panel').scrollTop`)) > c.top + 50, at + ': ArrowDown scrolls the licence text');
      assert.ok(/Back/.test((await state()).label), at + ': and focus stays on Back');
      assert.equal((await press('Escape')).screen, 'main', at + ': Escape returns to the opener');
    }
  });

  const seq = async (keys) => { let s; for (const k of keys) s = await press(k); return s; };
  const finish = async () => { await page.eval(`(() => { __sky.autopilot(true); for (let i = 0; i < 80 && __sky.game.state !== 'results'; i++) __sky.step(240); })()`); await delay(900); return state(); };

  check('quick race: keys only from main to results, 1 lap', async () => {
    await fresh({ clear: true });   // a clean profile: this is a first race, so the controls hint opens and its keys are exercised below
    await toMain();
    let s = await seq(['Enter', 'Enter', 'Enter']);   // quick race -> aircraft -> course -> options
    assert.equal(s.screen, 'options', JSON.stringify(s));
    s = await seq(['ArrowUp']);   // Start race -> laps row (the selected value) in one arrow
    assert.equal(await page.eval(`document.activeElement.dataset.id`), 'opt-laps', 'laps row reachable: ' + JSON.stringify(s));
    for (let i = 0; i < 3 && (await state()).label !== '1'; i++) await press('ArrowLeft');
    await press('Enter');
    const lapsOn = await page.eval(`document.querySelector('.scr.options .opt.on[data-id=opt-laps]').textContent`);
    assert.equal(lapsOn, '1', 'laps chosen by keyboard');
    await seq(['ArrowDown']);
    s = await state(); assert.ok(/Start race/.test(s.label), 'Start race reachable by arrows: ' + JSON.stringify(s));
    await press('Enter');
    await page.waitFor(`__sky.game.state === 'race' || __sky.game.ui.hintOpen`, { timeout: 90000 });
    await page.waitFor(`!!__sky.game.ui.cur && __sky.game.ui.cur.name === 'hint' && !!document.activeElement && !!document.activeElement.closest('.scr.hint')`, { timeout: 20000 }).catch(() => {});   // the card opens two frames after the race starts and takes focus a frame later; if it never does, the assertion below says so
    s = await state();
    assert.equal(s.screen, 'hint','a first race (clean profile) opens with the controls hint: ' + JSON.stringify(s));   // was an `if`: the hint keys went unchecked whenever it did not show
    assert.ok(/Got it/.test(s.label), 'hint focus ' + JSON.stringify(s)); await press('Enter');
    assert.equal(await page.eval(`__sky.game.paused`), false, 'race resumes after hint');
    // Escape pauses, and the pause menu opens on RESUME: Enter on it resumes the race
    s = await press('Escape'); assert.equal(s.screen, 'pause'); assert.ok(/Resume/.test(s.label), JSON.stringify(s));
    s = await press('Enter'); assert.equal(await page.eval(`__sky.game.paused`), false, 'Enter on RESUME resumes'); assert.notEqual(s.screen, 'pause', 'the pause screen closes: ' + JSON.stringify(s));
    // pause again: Settings is two arrows down, Escape leaves it for the pause menu, and Escape on the pause menu resumes the race
    s = await press('Escape'); assert.equal(s.screen, 'pause');
    s = await seq(['ArrowDown', 'ArrowDown']); assert.ok(/Settings/.test(s.label), 'pause: Settings within 2 arrows ' + JSON.stringify(s));
    s = await press('Enter'); assert.equal(s.screen, 'settings');
    s = await press('Escape'); assert.equal(s.screen, 'pause', 'Escape from settings returns to pause');
    s = await press('Escape'); assert.equal(await page.eval(`__sky.game.paused`), false, 'Escape on the pause menu resumes');
    s = await finish(); assert.equal(s.screen, 'results', JSON.stringify(s));
    assert.ok(s.nav && s.visible && !s.underPill && /Retry/.test(s.label), 'results primary: ' + JSON.stringify(s));
    s = await seq(['ArrowRight', 'ArrowRight']);
    assert.ok(/Quit/.test(s.label), 'results: Quit within 2 arrows ' + JSON.stringify(s));
    await seq(['ArrowLeft', 'ArrowLeft']);
    s = await press('Escape'); await page.waitFor(`__sky.game.ui.cur && __sky.game.ui.cur.name === 'main'`, { timeout: 60000 }); await delay(400);
    s = await state(); assert.equal(s.screen, 'main', 'Escape on results returns to the main menu'); assert.ok(s.nav && s.visible, JSON.stringify(s));
  }, { own: true });

  check('first-race hint: opens over a race that has been drawn, with live HUD values and a painted minimap (V-31)', async () => {
    await fresh({ clear: true });   // hintsSeen is false on a clean profile
    // record what the screen shows at the moment the hint card opens (the card is paused, so a later look would not tell a late card from an early one)
    await page.eval(`(() => { const g = __sky.game, u = g.ui, open = u.goto.bind(u); window.__hint = null; g.events.on('game:raceStart', () => { window.__rs = g.frame; });
      u.goto = (name, p) => { if (name === 'hint' && !window.__hint) { const m = document.querySelector('canvas.hud-map'); let px = 0;
          if (m) { const d = m.getContext('2d').getImageData(0, 0, m.width, m.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) px++; }
          window.__hint = { frames: g.frame - window.__rs, lap: (document.querySelector('.hud-lap') || {}).textContent || '', map: px, laps: g.race.laps, paused: g.paused }; }
        return open(name, p); };
    })()`);
    await page.eval(`(() => { const u = __sky.game.ui; u.startFlow('quick'); u.flow.course = 'sunrise'; u.flow.laps = 1; u.launch(); })()`);
    await page.waitFor(`window.__hint`, { timeout: 120000 });
    const h = await page.eval(`window.__hint`), at = JSON.stringify(h);
    assert.equal(h.laps, 1, at); assert.ok(h.paused, 'the countdown is frozen behind the card: ' + at);
    assert.ok(h.frames >= 1, 'the race was drawn at least once before the card opened (it used to open with 0 frames): ' + at);
    assert.ok(/\b1\s*\/\s*1\b/.test(h.lap), 'the lap counter shows this race (1/1), not the template 1/3: ' + at);
    assert.ok(h.map > 100, 'the minimap is painted behind the card: ' + at);
    await page.waitFor(`!!document.activeElement && !!document.activeElement.closest('.scr.hint')`, { timeout: 15000 });   // first focus is placed a frame after the card opens (a loaded machine takes longer)
    const s = await state(); assert.equal(s.screen, 'hint'); assert.ok(/Got it/.test(s.label) && s.visible && !s.underPill, JSON.stringify(s));
    await press('Enter'); assert.equal(await page.eval(`__sky.game.paused`), false, 'Enter on the card starts the race');
  }, { own: true });

  check('settings: every control reachable by arrows, operable by keys, persisted; volume reaches the audio bus', async () => {
    await fresh({ clear: true });   // default settings: the checks below assume double-tap roll is off, volume is 100% and quality is auto
    await toMain();
    let s = await seq(['ArrowDown', 'ArrowDown', 'ArrowDown']); assert.ok(/Settings/.test(s.label), JSON.stringify(s));
    s = await press('Enter'); assert.equal(s.screen, 'settings');
    const total = await page.eval(`document.querySelectorAll('.scr.settings [data-nav]').length`);
    const seen = new Set(); let guard = 0;
    for (; guard < total + 6; guard++) {
      s = await state(); assert.ok(s.visible && s.nav && !s.underPill, 'settings focus ' + JSON.stringify(s));
      seen.add(await page.eval(`[...document.querySelectorAll('.scr.settings [data-nav]')].indexOf(document.activeElement)`));
      await page.key('ArrowDown'); await delay(120);
      const st = await state(); if (!/settings/.test(st.screen)) break;
      if (!(await page.eval(`document.activeElement.dataset.nav !== undefined`))) break;
    }
    // arrows only walk one control per row (left/right move within a row); walk right/left too
    for (let i = 0; i < 12; i++) { await page.key('ArrowRight'); await delay(60); seen.add(await page.eval(`[...document.querySelectorAll('.scr.settings [data-nav]')].indexOf(document.activeElement)`)); }
    assert.ok(seen.size >= 6, 'settings walk reached ' + seen.size + ' of ' + total);
    // master volume slider: focus it directly through arrows from the top
    await page.eval(`document.querySelector('.scr.settings input[aria-label="Master volume"]').focus()`);
    const v0 = await page.eval(`__sky.game.settings.masterVolume`);
    await page.key('ArrowLeft'); await page.key('ArrowLeft'); await delay(250);
    const v1 = await page.eval(`__sky.game.settings.masterVolume`);
    assert.ok(v1 < v0 - 0.05, `ArrowLeft lowers master volume ${v0} -> ${v1}`);
    assert.equal(JSON.parse(await page.eval(`localStorage.getItem('skyblitz.settings.v1')`)).masterVolume, v1, 'volume persisted');
    // toggle with Enter, then Space, persisted
    await page.eval(`document.querySelector('.scr.settings .toggle[aria-label="Show FPS counter"]').focus()`);
    const t0 = await page.eval(`__sky.game.settings.showFps`);
    await press('Enter'); assert.equal(await page.eval(`__sky.game.settings.showFps`), !t0, 'Enter toggles');
    await press('Space'); assert.equal(await page.eval(`__sky.game.settings.showFps`), t0, 'Space toggles back (exactly once)');
    assert.equal(JSON.parse(await page.eval(`localStorage.getItem('skyblitz.settings.v1')`)).showFps, t0);
    // K-1: the double-tap barrel-roll toggle exists, is off by default, and is operable and persisted
    assert.equal(await page.eval(`__sky.game.settings.doubleTapRoll`), false, 'double-tap roll defaults off');
    await page.eval(`document.querySelector('.scr.settings .toggle[aria-label="Double-tap bank key = barrel roll"]').focus()`);
    await press('Enter'); assert.equal(await page.eval(`__sky.game.settings.doubleTapRoll`), true);
    assert.equal(JSON.parse(await page.eval(`localStorage.getItem('skyblitz.settings.v1')`)).doubleTapRoll, true, 'double-tap roll persisted');
    await press('Enter');
    // segmented control by keys
    await page.eval(`document.querySelector('.scr.settings .opt[data-id=quality]').focus()`);
    await press('ArrowRight'); await press('Enter');
    assert.notEqual(await page.eval(`__sky.game.settings.quality`), 'auto', 'segmented option chosen by keyboard');
    // reset restores defaults; then Escape goes back
    await page.eval(`[...document.querySelectorAll('.scr.settings .btn')].find((b) => /Reset/.test(b.textContent)).focus()`);
    await press('Enter');
    assert.equal(await page.eval(`__sky.game.settings.masterVolume`), 1, 'reset restores master volume');
    s = await press('Escape'); assert.equal(s.screen, 'main');
  }, { own: true });

  check('settings: choices made with the keyboard survive a page reload and show again on the settings screen (E-20 / mutation U1)', async () => {
    const pick = (sel) => `document.querySelector('.scr.settings ${sel}')`, read = () => page.eval(`(() => { const s = __sky.game.settings; return { masterVolume: s.masterVolume, showFps: s.showFps, quality: s.quality }; })()`);
    try {
      await fresh({ clear: true });
      await page.eval(`__sky.game.ui.goto('settings', { back: 'main' })`); await delay(500);
      await page.eval(`${pick('input[aria-label="Master volume"]')}.focus()`); for (let i = 0; i < 3; i++) await page.key('ArrowLeft'); await delay(250);
      await page.eval(`${pick('.toggle[aria-label="Show FPS counter"]')}.focus()`); await press('Enter');
      await page.eval(`${pick('.opt[data-id=quality]')}.focus()`); await press('ArrowRight'); await press('Enter');
      const saved = await read();
      assert.ok(saved.masterVolume < 0.9 && saved.showFps === true && saved.quality === 'low', 'the three choices took effect: ' + JSON.stringify(saved));
      await fresh();   // the next visit: the same profile in a new page, no clearing
      assert.deepEqual(await read(), saved, 'the settings are read back from localStorage after a reload');
      await page.eval(`__sky.game.ui.goto('settings', { back: 'main' })`); await delay(500);
      const shown = await page.eval(`(() => ({ volume: Number(${pick('input[aria-label="Master volume"]')}.value), fps: ${pick('.toggle[aria-label="Show FPS counter"]')}.getAttribute('aria-checked'), quality: ${pick('.opt[data-id=quality][aria-checked=true]')}.textContent }))()`);
      assert.deepEqual(shown, { volume: saved.masterVolume, fps: 'true', quality: 'Low' }, 'and the settings screen shows what was loaded');
    } finally { await fresh({ clear: true }); }
  }, { own: true });

  // The screen starts on a random tip: step through all of them by feeding Math.random one value per tip.
  const loadingTips = () => page.eval(`(() => { const out = new Set(), real = Math.random, n = 64; try { for (let i = 0; i < n; i++) { Math.random = () => (i + 0.5) / n; __sky.game.ui.goto('loading'); out.add(document.querySelector('.scr.loading .ld-tip').textContent); } } finally { Math.random = real; __sky.game.ui.goto('main'); } return [...out]; })()`);
  check('loading screen: the double-tap roll is taught only when that setting is on (V-30)', async () => {
    try {
      await fresh({ clear: true });
      const tips = loadingTips;
      assert.equal(await page.eval(`__sky.game.settings.doubleTapRoll`), false, 'the premise: double-tap roll is off by default');
      let t = await tips(); assert.ok(t.length >= 8, 'the loading screen shows its tips: ' + t.length);
      assert.ok(t.some((x) => /barrel roll/i.test(x)), 'the barrel-roll tip is among them');
      assert.deepEqual(t.filter((x) => /double-tap/i.test(x)), [], 'double-tap roll is off, so no tip teaches it');
      await page.eval(`__sky.game.ui.setSetting('doubleTapRoll', true)`);
      t = await tips(); assert.ok(t.some((x) => /double-tap/i.test(x)), 'with the setting on, the tip names it: ' + JSON.stringify(t.filter((x) => /roll/i.test(x))));
    } finally { await fresh({ clear: true }); }
  }, { own: true });

  check('loading screen: the tips name the controls of the device last used (input.lastDevice) - keys, a first touch, a pad button, a key again; a pad that is merely plugged in changes nothing (V-30 follow-up, R2-V-03)', async () => {
    const KEY = /Q \/ E|Hold B/, PAD = /LB \/ RB|right trigger|Press B instead/, SCREEN = /the ROLL buttons|the BOOST button|Tap ITEM/;
    const isKeys = (t) => t.some((x) => /Q \/ E/.test(x)) && t.some((x) => /Hold B/.test(x)) && t.some((x) => /Tap BOOST in/.test(x)) && !t.some((x) => SCREEN.test(x) || PAD.test(x));
    const isTouch = (t) => t.some((x) => /the ROLL buttons/.test(x)) && t.some((x) => /the BOOST button/.test(x)) && t.some((x) => /Tap ITEM/.test(x)) && !t.some((x) => KEY.test(x) || PAD.test(x));
    const isPad = (t) => t.some((x) => /\(LB \/ RB\)/.test(x)) && t.some((x) => /right trigger/.test(x)) && t.some((x) => /Press B instead/.test(x)) && !t.some((x) => KEY.test(x) || SCREEN.test(x));
    const dev = () => page.eval(`__sky.game.input.lastDevice`);
    try {
      await fresh({ clear: true });
      assert.equal(await dev(), 'keyboard', 'premise: a fresh page reads as the keyboard');
      let t = await loadingTips(); assert.ok(isKeys(t), 'keyboard and mouse: key words only ' + JSON.stringify(t));
      await page.s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 5, y: 700, id: 1 }] }); await page.s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await delay(500);   // the first touch
      assert.ok(await page.eval(`__sky.game.input.touchActive`), 'premise: the first touch made the controls touch controls'); assert.equal(await dev(), 'touch');
      t = await loadingTips(); assert.ok(isTouch(t), 'after a first touch: the on-screen buttons, no key ' + JSON.stringify(t));
      await fakePad(); await delay(400);
      t = await loadingTips(); assert.equal(await dev(), 'touch', 'a pad that is only plugged in does not take the device over');
      assert.ok(isTouch(t), 'a pad that is only plugged in says nothing: the touch words stay (a connected pad used to win over the device being used) ' + JSON.stringify(t));
      await padBtn(3);   // Y: no menu use of its own, so this only says "the pad is being used"
      assert.equal(await dev(), 'pad', 'a press on the pad makes it the device in use'); t = await loadingTips(); assert.ok(isPad(t), 'after a pad button: the pad buttons ' + JSON.stringify(t));
      await page.key('ShiftLeft'); await delay(200);
      assert.equal(await dev(), 'keyboard', 'a key makes the keyboard the device in use again'); t = await loadingTips(); assert.ok(isKeys(t), 'after a key: key words again, with a pad still plugged in ' + JSON.stringify(t));
    } finally { await page.s('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {}); await fresh({ clear: true }); }
  }, { own: true });

  check('loading screen: it keeps its own heading, LOADING; Quit shows RETURNING TO THE HANGAR for that one visit, and the next race says LOADING again (R2-V-02)', async () => {
    try {
      await fresh({ clear: true }); await noHint();
      // the heading each visit to the loading screen shows, read as the screen opens (enter() sets it at once)
      await page.eval(`(() => { const u = __sky.game.ui, open = u.goto.bind(u); window.__ld = []; u.goto = (name, p) => { const r = open(name, p); if (name === 'loading') window.__ld.push(document.querySelector('.scr.loading .ld-h').textContent); return r; }; })()`);
      const heads = async () => (await page.eval(`window.__ld.slice()`)).filter((x, i, a) => x !== a[i - 1]);   // one entry per run of the same heading
      const race = async () => { await page.eval(`(() => { const u = __sky.game.ui; u.startFlow('quick'); u.flow.course = 'sunrise'; u.flow.laps = 1; u.launch(); })()`); await page.waitFor(`__sky.game.state === 'race'`, { timeout: 120000 }); };
      await race(); assert.deepEqual(await heads(), ['LOADING'], 'a race loads under LOADING');
      await page.eval(`__sky.game.ui.quit(true)`);   // Quit to menu
      await page.waitFor(`__sky.game.ui.cur && __sky.game.ui.cur.name === 'main'`, { timeout: 60000 }); await delay(400);
      assert.deepEqual(await heads(), ['LOADING', 'RETURNING TO THE HANGAR'], 'quitting says where the player is going');
      await race();
      assert.deepEqual(await heads(), ['LOADING', 'RETURNING TO THE HANGAR', 'LOADING'], 'the next race is back to LOADING (the quit heading used to stay on the screen for good)');
      assert.equal(await page.eval(`document.querySelector('.scr.loading .ld-h').textContent`), 'LOADING', 'and that is what the element shows');
    } finally { await fresh({ clear: true }); }
  }, { own: true });

  check('first-race hint: the rows are the ones of the device in use, found by name; F / Enter is the item on the keyboard; the steering-assist note shows for the keyboard only while the assist is on, and the card never scrolls (R2-V-03 / R2-P-04)', async () => {
    const card = () => page.eval(`(() => { const p = document.querySelector('.scr.hint .hint-panel'), n = p.querySelector('.hint-note'), go = p.querySelector('.btn').getBoundingClientRect(), pr = p.getBoundingClientRect();
      return { keys: [...p.querySelectorAll('.hint-list li')].map((li) => li.firstChild.textContent), acts: [...p.querySelectorAll('.hint-list li')].map((li) => li.lastChild.textContent), note: n.hidden ? null : n.textContent, over: p.scrollHeight - p.clientHeight, goIn: go.bottom <= innerHeight + 1 && go.bottom <= pr.bottom + 1 }; })()`);
    const open = async (device, settings = {}) => { await page.eval(`(() => { const u = __sky.game.ui, g = __sky.game; g.input.lastDevice = ${JSON.stringify(device)}; for (const [k, v] of Object.entries(${JSON.stringify(settings)})) u.setSetting(k, v); u.goto('main'); u.goto('hint'); })()`); await delay(500); return card(); };
    try {
      await fresh({ clear: true });
      let c = await open('keyboard');
      assert.deepEqual(c.keys, ['W / Up', 'S / Down', 'A / Left, D / Right', 'Q / E', 'Shift', 'Space', 'F / Enter', 'Esc / P'], 'keyboard: the eight things a first-timer needs, the item on F / Enter (it was the 8th row and was cut off): ' + JSON.stringify(c));
      assert.ok(/^Use item/.test(c.acts[6]), 'F / Enter uses an item: ' + JSON.stringify(c.acts));
      assert.ok(c.note && /flies the course for you when you are not steering/.test(c.note) && /hold a key to take over/.test(c.note) && /Hands off for long and it cruises slower/.test(c.note), 'the keyboard card tells what the steering assist does and what hands-off costs: ' + JSON.stringify(c.note));
      assert.ok(!/Settings/.test(c.note), 'and has no room for where to change it: ' + c.note);
      for (const [w, h] of [[1280, 720], [390, 844], [844, 390], [812, 375], [600, 300]]) {
        await page.setViewport(w, h, { dpr: 1 }); await delay(300); c = await open('keyboard');
        assert.ok(c.over <= 1 && c.goIn && c.keys.length === 8, `${w}x${h}: all eight rows, the note and the button fit the card without a scrollbar: ${JSON.stringify(c)}`);
      }
      await page.setViewport(1280, 720, { dpr: 1 });
      c = await open('pad'); assert.deepEqual(c.keys, ['Left stick', 'LB / RB', 'Right trigger', 'X', 'A', 'Start'], 'gamepad: the pad rows, A (not B) for the item: ' + JSON.stringify(c)); assert.equal(c.note, null, 'no keyboard steering note for a pad');
      c = await open('touch'); assert.deepEqual(c.keys, ['Left thumb: drag', '< ROLL / > ROLL', 'BOOST / FIRE / ITEM', 'II'], 'touch: the on-screen controls, and no respawn row that does not exist: ' + JSON.stringify(c)); assert.equal(c.note, null, 'no keyboard steering note for touch');
      c = await open('keyboard', { keyGuide: false }); assert.equal(c.note, null, 'the steering assist is off: the card does not describe it');
      c = await open('keyboard', { keyGuide: true, assist: 'pro' }); assert.equal(c.note, null, 'Pro assist never steers: the card does not describe it');
      c = await open('keyboard', { assist: 'standard' }); assert.ok(c.note && /flies the course/.test(c.note), 'Standard with the assist on: described again');
    } finally { await fresh({ clear: true }); }
  }, { own: true });

  check('settings: the Steering assist (keyboard) row is on by default, a key switches it, a reload keeps it, Reset restores it, and the Controls note follows it (R2-P-04)', async () => {
    const row = `document.querySelector('.scr.settings .toggle[aria-label="Steering assist (keyboard)"]')`;
    const shown = () => page.eval(`(() => { const t = ${row}; return t ? { checked: t.getAttribute('aria-checked'), text: t.textContent } : null; })()`);
    const stored = () => page.eval(`JSON.parse(localStorage.getItem('skyblitz.settings.v1') || '{}').keyGuide`);
    const note = async () => { await page.eval(`(() => { const u = __sky.game.ui; u.goto('main'); u.goto('controls', { back: 'main' }); })()`); await delay(500); return page.eval(`(() => { const n = document.querySelector('.scr.controls .assist-note'); return n ? n.textContent : null; })()`); };
    const openSettings = async () => { await page.eval(`(() => { const u = __sky.game.ui; u.goto('main'); u.goto('settings', { back: 'main' }); })()`); await delay(500); };
    try {
      await fresh({ clear: true }); await openSettings();
      assert.deepEqual(await shown(), { checked: 'true', text: 'ON' }, 'on by default'); assert.equal(await page.eval(`__sky.game.settings.keyGuide`), true);
      await page.eval(`${row}.focus()`); await press('Enter');
      assert.equal(await page.eval(`__sky.game.settings.keyGuide`), false, 'Enter switches it off'); assert.deepEqual(await shown(), { checked: 'false', text: 'OFF' }); assert.equal(await stored(), false, 'and it is saved');
      await fresh();   // a new page, the same profile
      assert.equal(await page.eval(`__sky.game.settings.keyGuide`), false, 'a reload keeps it off'); await openSettings(); assert.deepEqual(await shown(), { checked: 'false', text: 'OFF' }, 'and the row shows it');
      let t = await note(); assert.ok(/^Steering assist is off/.test(t) && /\nSwitch it on in Settings\.$/.test(t) && !/flies the course|cruises slower/.test(t), 'the Controls screen says it is off, and where to switch it on: ' + JSON.stringify(t));
      await openSettings(); await page.eval(`[...document.querySelectorAll('.scr.settings .btn')].find((b) => /Reset/.test(b.textContent)).focus()`); await press('Enter');
      assert.equal(await page.eval(`__sky.game.settings.keyGuide`), true, 'Reset to defaults switches it back on'); assert.deepEqual(await shown(), { checked: 'true', text: 'ON' }); assert.equal(await stored(), true);
      t = await note(); assert.equal(t, 'Standard assist flies the course for you when you are not steering; hold a key to take over. Hands off for long and it cruises slower.\nSwitch this off in Settings.', 'on: what it does and what hands-off costs, then where to change it, as two lines');
      await page.eval(`__sky.game.ui.setSetting('assist', 'pro')`); t = await note(); assert.ok(/^Pro assist: hands-on/.test(t) && !/flies the course|cruises slower/.test(t), 'Pro: hands-on, whatever the switch says: ' + JSON.stringify(t));
    } finally { await fresh({ clear: true }); }
  }, { own: true });

  const raceReady =() => page.waitFor(`__sky.game.state === 'race'`, { timeout: 120000 });
  check('time trial: keys only to results; Retry primary, Escape back to menu', async () => {
    await toMain(); await noHint();
    let s = await seq(['ArrowDown', 'ArrowDown']); assert.ok(/Time Trial/.test(s.label), JSON.stringify(s));
    await seq(['Enter', 'Enter', 'Enter']);   // aircraft -> course -> launch
    await raceReady(); await delay(300);
    s = await finish(); assert.equal(s.screen, 'results'); assert.ok(/Retry/.test(s.label), JSON.stringify(s));
    assert.match(await page.eval(`document.querySelector('.scr.results h2').textContent`), /TIME TRIAL/);
    await press('Escape'); await page.waitFor(`__sky.game.ui.cur && __sky.game.ui.cur.name === 'main'`, { timeout: 60000 });
  });

  check('grand prix: 4 races by keys, standings each time, podium', async () => {
    await delay(400); await toMain(); await noHint();
    let s = await press('ArrowDown'); assert.ok(/Grand Prix/.test(s.label), JSON.stringify(s));
    await seq(['Enter', 'Enter']);   // aircraft -> options
    s = await state(); assert.equal(s.screen, 'options');
    await press('Enter');
    for (let r = 0; r < 4; r++) {
      await raceReady(); await delay(300);
      s = await finish(); assert.equal(s.screen, 'results', 'race ' + r + ' ' + JSON.stringify(s));
      assert.match(s.label, r < 3 ? /Next race/ : /Final standings/, 'primary on race ' + r);
      assert.ok(s.visible && !s.underPill);
      assert.match(await page.eval(`document.querySelector('.scr.results h2').textContent`), new RegExp('RACE ' + (r + 1)));
      assert.ok((await page.eval(`document.querySelectorAll('.res-gp tbody tr').length`)) >= 8, 'championship table has 8 pilots');
      if (r === 1) { s = await press('ArrowDown'); assert.ok(s.nav && s.visible, 'second button reachable: ' + JSON.stringify(s)); await press('ArrowUp'); }
      await press('Enter');
    }
    await page.waitFor(`__sky.game.ui.cur && __sky.game.ui.cur.name === 'podium'`, { timeout: 30000 }); await delay(500);
    s = await state(); assert.equal(s.screen, 'podium'); assert.ok(/New Grand Prix/.test(s.label) && s.visible && !s.underPill, JSON.stringify(s));
    s = await press('ArrowRight'); assert.ok(/Quit/.test(s.label), JSON.stringify(s));
    await press('Escape'); await page.waitFor(`__sky.game.ui.cur && __sky.game.ui.cur.name === 'main'`, { timeout: 60000 });
  });
  check('podium: New Grand Prix and Quit stay on screen, with focus on one of them, in portrait and in small windows (V-12); on a 720p window the standings table fits its panel without a scrollbar', async () => {
    for (const [w, h] of [[1280, 720], [1024, 720], [1366, 768], [768, 1024], [390, 844], [360, 640], [844, 390]]) {
      await page.setViewport(w, h, { dpr: 1 }); await delay(300);
      await page.eval(`(() => { const u = __sky.game.ui; u.goto('main'); })()`); await delay(300);   // leave and re-enter: goto() of the screen already showing only calls its enter(), which rebuilds the buttons and drops focus
      await page.eval(`(() => { const u = __sky.game.ui; u.gp = { race: 3, totals: ${JSON.stringify(GP_TOTALS)} }; u.pending = null; u.goto('podium'); })()`); await delay(700);
      const m = await page.eval(`(() => {
        const bs = [...document.querySelectorAll('.scr.podium-scr .res-act .btn')], a = document.activeElement, rect = (e) => e.getBoundingClientRect();
        const inView = (e) => { const r = rect(e); return r.width > 0 && r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1; };
        return { names: bs.map((b) => b.textContent.trim()), off: bs.filter((b) => !inView(b)).map((b) => b.textContent.trim()), focus: a && a.textContent.trim(), focusIn: !!a && inView(a), focusInRow: !!a && !!a.closest('.res-act'),
          underPill: !!a && rect(a).left < 112 && rect(a).top < 44, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          tableOver: (() => { const p = document.querySelector('.scr.podium-scr > .panel.scroll'); return p ? p.scrollHeight - p.clientHeight : null; })() };   // how far the standings panel's content reaches past it (a scrollbar when above 0)
      })()`);
      const at = `${w}x${h}: ${JSON.stringify(m)}`;
      // side by side on a wide window that is 700 px or more tall (1280x720 is the common one) the nine standings rows fit their panel; it used to scroll for 6 px
      if (w >= 700 && w > h && h >= 700) assert.ok(m.tableOver !== null && m.tableOver <= 1, 'the standings table needs no scrollbar (its panel was 6 px too short at 1280x720): ' + at);
      assert.ok(m.names.length >= 2 && /New Grand Prix/.test(m.names[0]) && /Quit/.test(m.names[m.names.length - 1]), 'the two actions exist: ' + at);
      assert.deepEqual(m.off, [], 'both actions are on screen without scrolling the page (they used to sit below the fold): ' + at);
      assert.ok(m.focusInRow && m.focusIn && !m.underPill, 'first focus is an action and it is visible: ' + at); assert.ok(m.overflowX <= 1, 'no sideways scroll: ' + at);
      let q = await press('ArrowRight'); if (!/Quit/.test(q.label)) q = await press('ArrowDown');   // side by side on wide screens, stacked on narrow ones
      assert.ok(/Quit/.test(q.label) && q.visible, `${w}x${h}: the arrow keys reach Quit, and it is visible ${JSON.stringify(q)}`);
    }
  });

  // ---- round 2: short landscape windows (R2-V-05 to R2-V-07) and the Grand Prix table on a laptop window (R2-V-08)
  // A results screen with the eight rows of a race, the player in place `me`; as a Grand Prix race (gp) it also carries the championship.
  const RES_OTHERS = [['Nova Kim', '#e6212b', 'Falcon F-1'], ['Rosa Vega', '#ff7bc0', 'Comet X'], ['Mika Tanaka', '#18b8b0', 'Kestrel'], ['Ace Hardcastle', '#2f7bff', 'Bulldog'], ['Zed', '#ffcf1f', 'Wasp'], ['Pip Moreau', '#5bd16a', 'Manta'], ['Dutch Bergman', '#6f8f3a', 'Anvil']];
  const resultsRows = (me) => { const o = RES_OTHERS.slice(); return Array.from({ length: 8 }, (_, i) => { const p = i + 1, x = p === me ? ['You', '#ffd02e', 'Falcon F-1'] : o.shift(); return { place: p, name: x[0], color: x[1], craft: x[2], time: 90 + p * 1.7, best: 30 + p * 0.4, points: Math.max(0, 9 - p), me: p === me }; }); };
  const openResults = async ({ gp = false, me = 6, rec = false } = {}) => {
    const rows = resultsRows(me), pending = Object.fromEntries(rows.map((r) => [r.name, { pts: r.points, win: r.place === 1 ? 1 : 0, color: r.color, isPlayer: r.me }]));
    await page.eval(`(() => { const u = __sky.game.ui; u.goto('main'); u.flow = { mode: ${gp ? "'gp'" : "'quick'"}, craft: 'falcon', course: 'sunrise', difficulty: 'normal', laps: 3 };
      u.gp = ${gp ? `{ race: 1, totals: ${JSON.stringify(GP_TOTALS)} }` : 'null'}; u.pending = ${gp ? JSON.stringify(pending) : 'null'};
      u.lastResults = { rows: ${JSON.stringify(rows)}, rec: ${rec ? '{ newRace: true, newLap: true }' : 'null'}, stats: { stunts: 4, perfectGates: 7, shortcuts: 1, nearMisses: 2, hitsDealt: 3, hitsTaken: 1, overtakes: 5 }, courseId: 'sunrise', laps: 3, difficulty: 'normal', gpIndex: ${gp ? 1 : 0} };
      u.goto('results'); })()`);
    await delay(900);   // the screen slides in (0.35 s) and the player's row is brought into view a frame after that
  };
  const resultsView = () => page.eval(`(() => {
    const scr = document.querySelector('.scr.results'), body = scr.querySelector('.res-body'), br = body.getBoundingClientRect(), q = (s) => scr.querySelector(s), shown = (e) => !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
    const inBody = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= br.top - 1 && r.bottom <= br.bottom + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; };
    const me = q('.res-t tbody tr.me'), line = q('.res-line'), lr = shown(line) ? line.getBoundingClientRect() : null, btns = [...scr.querySelectorAll('.res-act .btn')];
    const whole = lr ? [...line.children].filter((c) => { const r = c.getBoundingClientRect(); return r.right <= lr.right + 1 && r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1; }).map((c) => c.textContent.trim()) : [];
    return { scrOver: scr.scrollHeight - scr.clientHeight, scrTop: scr.scrollTop, me: !!me && inBody(me), raceRows: [...scr.querySelectorAll('.res-t tbody tr')].filter(inBody).length, gpRows: [...scr.querySelectorAll('.res-gp tbody tr')].filter(inBody).length,
      line: !!lr, lineWhole: whole, stats: shown(q('.res-stats')), btnsIn: btns.length > 0 && btns.every((b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1; }),
      h2Left: Math.round(q('.hdr h2').getBoundingClientRect().left), xo: document.documentElement.scrollWidth - document.documentElement.clientWidth, bodyOver: body.scrollHeight - body.clientHeight };
  })()`);

  check('results: on a short landscape window the player\'s own row, YOUR RACE (one line) and the buttons are on screen without scrolling the screen, whether the player came 6th or last (R2-V-05)', async () => {
    for (const [w, h] of [[844, 390], [812, 375], [640, 360], [600, 300]]) {
      await page.setViewport(w, h, { dpr: 1 }); await delay(300);
      for (const [gp, me] of [[false, 6], [false, 8], [true, 6]]) {
        await openResults({ gp, me });
        const v = await resultsView(), at = `${w}x${h} ${gp ? 'Grand Prix' : 'race'}, you ${me}th: ${JSON.stringify(v)}`;
        assert.ok(v.me, 'the player\'s own row is in view (it sat below the fold, behind a scroll nobody knew to make): ' + at);
        assert.ok(v.line && v.lineWhole[0] === 'YOUR RACE' && v.lineWhole[1] === `Position ${me}th` && v.lineWhole.length >= 5, 'YOUR RACE is one line, the position first, and no item is cut in half: ' + at);
        assert.equal(v.stats, false, 'the tall YOUR RACE panel gives way to the line here: ' + at);
        assert.ok(v.scrOver <= 1 && v.scrTop === 0, 'the screen itself does not scroll (that would carry the title under the Almanac pill): ' + at);
        assert.ok(v.btnsIn, 'the buttons are on screen: ' + at); assert.ok(v.h2Left >= 112, 'the title starts right of the pill (x >= 112): ' + at); assert.ok(v.xo <= 1, 'no sideways scroll: ' + at);
      }
    }
  });

  check('results: a Grand Prix shows all eight rows of the race table AND of the championship at 1280x720, 1366x768 and the other laptop windows; a plain race shows its eight (R2-V-08)', async () => {
    for (const [w, h] of [[1280, 720], [1366, 768], [1280, 700], [1280, 800], [1024, 768], [1440, 900], [1920, 1080]]) {
      await page.setViewport(w, h, { dpr: 1 }); await delay(300);
      await openResults({ gp: true });
      let v = await resultsView(), at = `${w}x${h} Grand Prix: ${JSON.stringify(v)}`;
      assert.equal(v.raceRows, 8, 'all eight rows of the race table: ' + at); assert.equal(v.gpRows, 8, 'all eight rows of the championship (it showed 2 of 8 at 1280x720): ' + at);
      assert.ok(v.me && v.btnsIn && v.bodyOver <= 1, 'the player\'s row and the buttons are in view and the body does not scroll: ' + at); assert.ok(v.xo <= 1, at);
      await openResults({ gp: false });
      v = await resultsView(); at = `${w}x${h} race: ${JSON.stringify(v)}`;
      assert.equal(v.raceRows, 8, 'all eight rows of a plain race (the 8th was 41 px under the fold at 1280x720): ' + at); assert.ok(v.stats && v.btnsIn && v.bodyOver <= 1, 'with the YOUR RACE panel beside it: ' + at);
    }
  });

  check('course select: on a short landscape window the cards are compact (map and name), two by two, with every name whole (R2-V-06)', async () => {
    for (const [w, h] of [[844, 390], [812, 375], [640, 360], [600, 300], [568, 320]]) {
      await page.setViewport(w, h, { dpr: 1 }); await delay(300); await openCourse(); await delay(500);
      const m = await page.eval(`(() => { const scr = document.querySelector('.scr.course'), g = scr.querySelector('.cards'), gr = g.getBoundingClientRect(), cs = [...scr.querySelectorAll('.card')], R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        const back = scr.querySelector('.ftr .btn').getBoundingClientRect();
        return { cards: cs.map(R), inside: cs.every((c) => { const r = R(c); return r.t >= gr.top - 1 && r.b <= gr.bottom + 1 && r.l >= gr.left - 1 && r.r <= gr.right + 1; }), scrolls: g.scrollHeight > g.clientHeight + 1, scrOver: scr.scrollHeight - scr.clientHeight, scrTop: scr.scrollTop,
          names: cs.map((c) => { const h3 = c.querySelector('h3'), hr = h3.getBoundingClientRect(), cr = c.getBoundingClientRect(); return { t: h3.textContent, whole: h3.scrollWidth <= h3.clientWidth + 1 && hr.left >= cr.left - 1 && hr.right <= cr.right + 1 && hr.top >= cr.top - 1 && hr.bottom <= cr.bottom + 1 }; }),
          map: cs.map((c) => { const r = c.querySelector('.card-map').getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); }), backIn: back.bottom <= innerHeight + 1 && back.top >= 0, h2Left: Math.round(scr.querySelector('.hdr h2').getBoundingClientRect().left), xo: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
      const at = `${w}x${h}: ${JSON.stringify(m)}`, c = m.cards;
      assert.equal(c.length, 4, at);
      assert.ok(Math.abs(c[0].l - c[2].l) < 8 && Math.abs(c[1].l - c[3].l) < 8 && c[1].l > c[0].r - 8, 'two columns: ' + at); assert.ok(c[2].t >= c[0].b - 8 && Math.abs(c[0].t - c[1].t) < 12, 'two rows: ' + at);
      assert.ok(m.inside && !m.scrolls && m.scrOver <= 1 && m.scrTop === 0, 'every card is whole inside its box and nothing scrolls: ' + at);
      assert.deepEqual(m.names.filter((n) => !n.whole).map((n) => n.t), [], 'every course name is whole, not cut off: ' + at);
      assert.ok(m.map.every((s) => s >= 60), 'every card still has its map, at least 60 px: ' + at); assert.ok(m.backIn, 'Back is on screen: ' + at); assert.ok(m.h2Left >= 112 && m.xo <= 1, 'title clear of the pill, no sideways scroll: ' + at);
    }
  });

  check('race options and pause on a short landscape window: the title is clear of the pill, no key press scrolls the screen up under it, and Quit to menu is whole (R2-V-07)', async () => {
    for (const [w, h] of [[844, 390], [812, 375], [640, 360], [600, 300]]) {
      await page.setViewport(w, h, { dpr: 1 }); await delay(300);
      await page.eval(`(() => { document.activeElement && document.activeElement.blur(); const u = __sky.game.ui; u.startFlow('quick'); u.after('aircraft'); u.after('course'); })()`); await delay(800);
      const view = () => page.eval(`(() => { const scr = document.querySelector('.scr.options'), R = (e) => e.getBoundingClientRect(), ctl = [...scr.querySelectorAll('.btn, .opt')].filter((e) => R(e).width > 0);
        return { screen: __sky.game.ui.cur.name, scrOver: scr.scrollHeight - scr.clientHeight, scrTop: scr.scrollTop, h2Left: Math.round(R(scr.querySelector('.hdr h2')).left), underPill: ctl.filter((e) => R(e).left < 112 && R(e).top < 44).length,
          off: ctl.filter((e) => { const r = R(e); return r.top < 0 || r.bottom > innerHeight + 1 || r.left < 0 || r.right > innerWidth + 1; }).map((e) => e.textContent.trim()), xo: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
      let v = await view(), at = `${w}x${h} options: ${JSON.stringify(v)}`;
      assert.equal(v.screen, 'options', at); assert.ok(v.scrOver <= 1 && v.scrTop === 0, 'the options fit the window, nothing scrolls: ' + at); assert.ok(v.h2Left >= 112 && v.underPill === 0, 'title and controls clear of the pill: ' + at);
      assert.deepEqual(v.off, [], 'every control is on screen: ' + at); assert.ok(v.xo <= 1, at);
      for (const k of ['ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp']) { await press(k); v = await view(); assert.ok(v.screen === 'options' && v.scrTop === 0, `${at}: after ${k} the screen has not scrolled (focus used to scroll it up under the pill): ${JSON.stringify(v)}`); }
      await page.eval(`(() => { const u = __sky.game.ui; u.goto('main'); u.goto('pause'); })()`); await delay(700);
      const p = await page.eval(`(() => { const scr = document.querySelector('.scr.pause'), panel = scr.querySelector('.pause-panel'), pr = panel.getBoundingClientRect(), bs = [...panel.querySelectorAll('.btn')];
        return { labels: bs.map((b) => b.textContent.trim()), whole: bs.map((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1; }), panelOver: panel.scrollHeight - panel.clientHeight, scrOver: scr.scrollHeight - scr.clientHeight }; })()`);
      const pat = `${w}x${h} pause: ${JSON.stringify(p)}`;
      assert.deepEqual(p.labels, ['Resume', 'Restart race', 'Settings', 'Controls', 'Quit to menu'], pat); assert.deepEqual(p.whole, [true, true, true, true, true], 'all five entries are whole, Quit to menu too: ' + pat);
      assert.ok(p.panelOver <= 1 && p.scrOver <= 1, 'the pause panel does not scroll: ' + pat);
    }
  });

  check('U-2: no menu screen is drawn during a race; only results after it; U-3: stunt popups merge and never overlap', async () => {
    await page.goto(GAME + '?debug=1&manual=1&autostart=1&mute=1&laps=1&bots=3&course=sunrise');
    await page.waitFor('window.__sky && __sky.ready && __sky.game.state === "race"', { timeout: 100000 });
    await page.eval('__sky.step(60)'); await delay(300);
    const drawn = () => page.eval(`[...document.querySelectorAll('#ui .scr')].filter((e) => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' || r.width > 0 || r.height > 0; }).map((e) => e.dataset.screen)`);
    assert.deepEqual(await drawn(), [], 'screens drawn during the race');
    // U-3
    await page.eval(`(() => { const h = __sky.game.ui.hud; for (let i = 0; i < 3; i++) h.stunt('BARREL ROLL', '#ffd02e', 6); h.stunt('LOOP', '#ffd02e', 4); h.stunt('NEAR MISS', '#ff3d9a', 2); h.stunt('SHORTCUT!', '#ff8a1f', 0); h.stunt('INVERTED', '#ffd02e', 1); })()`);
    const lines = await page.eval(`[...document.querySelectorAll('.hud-popups .popup')].map((e) => { const r = e.getBoundingClientRect(); return [e.textContent, r.top, r.bottom]; })`);
    assert.ok(lines.length <= 4, 'max 4 popups: ' + lines.length);
    for (let i = 1; i < lines.length; i++) assert.ok(lines[i][1] >= lines[i - 1][2] - 0.5, 'popups overlap: ' + JSON.stringify(lines));
    await page.eval(`(() => { const h = __sky.game.ui.hud; h.stack.replaceChildren(); h.popups.length = 0; for (let i = 0; i < 3; i++) h.stunt('BARREL ROLL', '#ffd02e', 6); })()`);
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('.hud-popups .popup')].map((e) => e.textContent)`), ['BARREL ROLL x3 +18%'], 'consecutive identical stunts merge');
    const s = await finish(); assert.equal(s.screen, 'results');
    assert.deepEqual(await drawn(), ['results'], 'only the results screen is drawn after the race');
  }, { own: true });

  const fakePad = () => page.eval(`(() => { window.__pad = { connected: true, id: 'Fake Pad', index: 0, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; navigator.getGamepads = () => [window.__pad]; })()`);
  const padBtn = async (i) => { await page.eval(`__pad.buttons[${i}] = { pressed: true, value: 1 }`); await delay(160); await page.eval(`__pad.buttons[${i}] = { pressed: false, value: 0 }`); await delay(200); };

  check('gamepad (faked pad): D-pad/A/B drive the menus, no traps', async () => {
    await fresh(); await fakePad(); await delay(300);
    await padBtn(0); let s = await state(); assert.equal(s.screen, 'main', 'A on title: ' + JSON.stringify(s));
    await padBtn(13); s = await state(); assert.ok(/Grand Prix/.test(s.label), 'D-pad down: ' + JSON.stringify(s));
    await padBtn(0); s = await state(); assert.equal(s.screen, 'aircraft');
    await padBtn(15); await padBtn(14); assert.equal((await state()).screen, 'aircraft', 'left/right stay on the stage');
    await padBtn(0); s = await state(); assert.equal(s.screen, 'options', 'A on the stage continues (GP skips course): ' + JSON.stringify(s));
    assert.ok(/Start race/.test(s.label));
    await padBtn(1); s = await state(); assert.equal(s.screen, 'aircraft', 'B goes back');
    await padBtn(1); s = await state(); assert.equal(s.screen, 'main', 'B goes back to main');
    assert.ok(s.nav && s.visible);
  }, { own: true });

  check('gamepad: sticks, triggers and buttons fly the aircraft', async () => {
    await page.goto(GAME + '?debug=1&manual=1&autostart=1&mute=1&laps=3&bots=3&course=sunrise'); await page.waitFor('window.__sky && __sky.ready && __sky.game.state === "race"', { timeout: 100000 });
    await fakePad(); await delay(400);
    await page.eval(`__pad.axes[0] = 1; __pad.axes[1] = 0.8; __pad.buttons[7] = { pressed: true, value: 1 }; __pad.buttons[6] = { pressed: true, value: 0.9 };`);
    await delay(300);
    const c = await page.eval(`(() => { const c = { ...__sky.game.input.sample() }; return { roll: c.roll, pitch: c.pitch, boost: c.boost, airbrake: c.airbrake, connected: __sky.game.input.pad.connected }; })()`);
    assert.ok(c.connected, 'pad detected'); assert.ok(c.roll > 0.8, 'stick right banks right: ' + JSON.stringify(c)); assert.ok(Math.abs(c.pitch) > 0.5, 'stick pitches'); assert.ok(c.boost, 'RT boosts'); assert.ok(c.airbrake > 0.5, 'LT brakes');
    await page.eval(`__pad.axes[0] = 0; __pad.axes[1] = 0; __pad.buttons[7] = { pressed: false, value: 0 }; __pad.buttons[6] = { pressed: false, value: 0 };`);
    await page.goto(GAME + '?debug=1&autostart=1&mute=1&laps=3&bots=3&course=sunrise'); await page.waitFor('window.__sky && __sky.ready && __sky.game.state === "race"', { timeout: 100000 });
    await fakePad(); await delay(400);
    await page.eval(`__pad.buttons[9] = { pressed: true, value: 1 }`); await delay(1200); await page.eval(`__pad.buttons[9] = { pressed: false, value: 0 }`); await delay(400);
    let s = await state(); assert.equal(s.screen, 'pause', 'Start pauses: ' + JSON.stringify(s) + JSON.stringify(await page.eval('({ st: __sky.game.state, paused: __sky.game.paused, pad: __sky.game.input.pad, frame: __sky.game.frame, sim: __sky.game.simTime })'))); assert.ok(/Resume/.test(s.label));
    // "resumes" means more than paused === false: the pause screen is gone and the simulation is running again (a held item firing on that A press is the flight agent's E-03 test)
    const sim0 = await page.eval(`__sky.game.simTime`);
    await padBtn(0); assert.equal(await page.eval(`__sky.game.paused`), false, 'A on Resume resumes');
    s = await state(); assert.notEqual(s.screen, 'pause', 'A on Resume closes the pause screen: ' + JSON.stringify(s));
    await delay(500); assert.ok((await page.eval(`__sky.game.simTime`)) > sim0, 'the simulation runs again after A on Resume');
    assert.equal(await page.eval(`__sky.game.state`), 'race', 'still in the race');
  }, { own: true });

  // The notice flight asks for (input:padunmapped) is drawn as a calm toast: one short line of plain words, no error colour or sound, a real width (not a strip), clear of the pill, gone after its time.
  const toastView = () => page.eval(`(() => { const t = document.querySelector('.toast'), r = t.getBoundingClientRect(), s = getComputedStyle(t);
    return { shown: !t.hidden && r.width > 0, text: t.textContent, cls: t.className, role: t.getAttribute('role'), l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, n: document.querySelectorAll('.toast').length, err: window.__err | 0, fs: parseFloat(s.fontSize) }; })()`);
  const NOTICE = /^Controller not recognised: using the default layout\. Check Controls\.$/;
  check('gamepad: the unrecognised-controller notice (input:padunmapped) is one short calm line, readable on desktop and touch sizes, makes no error sound, does not stack, and goes away (pad notice)', async () => {
    await fresh({ clear: true });
    await page.eval(`(() => { window.__err = 0; __sky.game.events.on('ui:error', () => { window.__err++; }); })()`);
    const say = async () => { await page.eval(`__sky.game.events.emit('input:padunmapped', { id: 'Generic USB Gamepad (Vendor: 0079 Product: 0006)', mapping: '' })`); await delay(300); return toastView(); };
    for (const [w, h, touch] of [[1280, 720, false], [1920, 1080, false], [844, 390, true], [390, 844, true], [768, 1024, true]]) {
      await page.setViewport(w, h, { dpr: 1 }); await page.eval(`document.getElementById('ui').classList.toggle('touch', ${touch})`); await delay(300);
      let v = await say(), at = `${w}x${h}${touch ? ' touch' : ''}: ${JSON.stringify(v)}`;
      assert.ok(v.shown, 'the notice is on screen: ' + at); assert.match(v.text, NOTICE, at); assert.ok(/\btoast-note\b/.test(v.cls) && v.role === 'status', 'a calm note, not the red alert: ' + at); assert.equal(v.err, 0, 'no error sound: ' + at);
      assert.ok(v.l >= 0 && v.r <= v.vw && v.t >= 0 && v.b <= v.vh, 'inside the window: ' + at); assert.ok(!(v.l < 112 && v.t < 44), 'clear of the Almanac pill: ' + at);
      assert.ok(v.w >= Math.min(260, v.vw * 0.5) && v.h <= v.fs * 5.5, 'a readable box of at most three lines (it was squeezed into a 5 px column, then into half the window): ' + at); assert.ok(v.fs >= 14, 'type at least 14 px: ' + at);
      if (touch && w > h) assert.ok(v.r <= v.vw * 0.78, 'on a phone on its side the note ends before the BOOST / FIRE / ITEM / BRAKE buttons (they start at about 76% of the width): ' + at);
      if (touch && w <= h) assert.ok(v.b <= v.vh * 0.45, 'held upright the note sits up under the HUD rows, not in the lower right where the buttons are: ' + at);
      v = await say(); assert.equal(v.n, 1, 'a second event does not stack another toast: ' + at);
      await page.eval(`__sky.game.ui.notice('later', 120)`); await delay(500); v = await toastView(); assert.equal(v.shown, false, 'and it goes away after its time: ' + at);
    }
    await page.eval(`__sky.game.ui.toast('Something broke')`); let v = await toastView();
    assert.ok(v.shown && !/toast-note/.test(v.cls) && v.role === 'alert' && v.err === 1, 'the red alert toast is still an alert and still sounds: ' + JSON.stringify(v));
    await page.setViewport(1280, 720, { dpr: 1 }); await page.eval(`document.getElementById('ui').classList.remove('touch')`);
  }, { own: true });

  check('gamepad: a controller that is not standard-mapped is read through the default layout, tells the player once, and the notice shows (pad notice, end to end)', async () => {
    await page.goto(GAME + '?debug=1&manual=1&autostart=1&mute=1&laps=1&bots=3&course=sunrise'); await page.waitFor('window.__sky && __sky.ready && __sky.game.state === "race"', { timeout: 100000 });
    await page.eval(`(() => { window.__pu = 0; __sky.game.events.on('input:padunmapped', () => { window.__pu++; });
      window.__pad = { connected: true, id: 'Generic USB Gamepad (Vendor: 0079 Product: 0006)', index: 0, mapping: '', timestamp: 0, axes: [0, 0, 0, 0, 0, 0], buttons: Array.from({ length: 12 }, () => ({ pressed: false, value: 0 })) }; navigator.getGamepads = () => [window.__pad]; })()`);
    for (let i = 0; i < 6; i++) await page.eval(`__sky.game.input.sample()`);
    await delay(300);
    const r = await page.eval(`({ pu: window.__pu, mapping: __sky.game.input.padMapping })`), v = await toastView();
    assert.equal(r.pu, 1, 'the event comes once per connect, not once per frame: ' + JSON.stringify(r)); assert.equal(r.mapping, 'dinput');
    assert.ok(v.shown && NOTICE.test(v.text) && /toast-note/.test(v.cls), 'and the player is told, calmly: ' + JSON.stringify(v));
  }, { own: true });

  check('touch: on-screen controls usable and clear of the HUD at 844x390 and 390x844', async () => {
    await page.s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    for (const [w, h] of [[844, 390], [390, 844]]) {
      await page.setViewport(w, h, { dpr: 1, mobile: true });
      await page.goto(GAME + '?debug=1&manual=1&autostart=1&mute=1&laps=3&bots=3&course=sunrise'); await page.waitFor('window.__sky && __sky.ready && __sky.game.state === "race"', { timeout: 100000 });
      const tp = (type, pts) => page.s('Input.dispatchTouchEvent', { type, touchPoints: pts });
      await tp('touchStart', [{ x: 5, y: h - 5, id: 1 }]); await tp('touchEnd', []); await delay(300);   // first touch enables the overlay
      await page.eval(`(() => { const p = __sky.game.player; p.shield = 6; p.item = { type: 'missile', count: 3 }; __sky.game.events.emit('race:wrongway', { racer: p, on: true }); __sky.step(3); })()`); await delay(300);
      const info = await page.eval(`(() => {
        const t = document.getElementById('sb-touch'); if (!t) return null;
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
        const btns = [...t.children].filter((e) => e.textContent.trim()).map((e) => ({ n: e.textContent.trim(), r: vis(e) })).filter((x) => x.r).map((x) => ({ n: x.n, l: x.r.left, t: x.r.top, w: x.r.width, h: x.r.height }));
        const hud = [...document.querySelectorAll('#ui .hud > *, #ui .hud-top > *, #ui .hud-bottom > *, #ui .hud-bc > *')].map((e) => ({ c: String(e.className), r: vis(e) })).filter((x) => x.r && x.r.width < innerWidth * 0.8 && x.r.height < innerHeight * 0.6 && getComputedStyle(x.r ? document.body : document.body).display).map((x) => ({ c: x.c, l: x.r.left, t: x.r.top, rr: x.r.right, b: x.r.bottom }));
        return { btns, hud };
      })()`);
      if (trace) console.log(w + 'x' + h, JSON.stringify(info));
      assert.ok(info && info.btns.length >= 4, `${w}x${h}: touch overlay with buttons ${JSON.stringify(info && info.btns.map((b) => b.n))}`);
      for (const b of info.btns) assert.ok(b.w >= 44 && b.h >= 44, `${w}x${h}: touch target ${b.n} ${Math.round(b.w)}x${Math.round(b.h)}`);
      const crit = info.hud.filter((x) => /map|pos|lap|speed|item|boost|shield|ticker/.test(x.c));
      for (const b of info.btns) for (const x of crit) {
        const ox = Math.min(b.l + b.w, x.rr) - Math.max(b.l, x.l), oy = Math.min(b.t + b.h, x.b) - Math.max(b.t, x.t);
        assert.ok(!(ox > 2 && oy > 2), `${w}x${h}: touch button ${b.n} covers HUD ${x.c}`);
      }
      // stick: drag in the left zone banks right
      await tp('touchStart', [{ x: w * 0.2, y: h * 0.7, id: 1 }]); await tp('touchMove', [{ x: w * 0.2 + 70, y: h * 0.7, id: 1 }]); await delay(250);
      const roll = await page.eval(`__sky.game.input.sample().roll`); await tp('touchEnd', []);
      assert.ok(roll > 0.3, `${w}x${h}: virtual stick banks (${roll})`);
      // boost button held
      const boostB = info.btns.find((b) => /BOOST/i.test(b.n)); assert.ok(boostB, 'BOOST button');
      await tp('touchStart', [{ x: boostB.l + boostB.w / 2, y: boostB.t + boostB.h / 2, id: 2 }]); await delay(200);
      const boosting = await page.eval(`__sky.game.input.sample().boost`); await tp('touchEnd', []);
      assert.ok(boosting, `${w}x${h}: BOOST touch button works`);
    }
    await page.s('Emulation.setTouchEmulationEnabled', { enabled: false }); await page.setViewport(1280, 720, { dpr: 1, mobile: false });
  }, { own: true });

  check('touch: each on-screen button reads one clear label, and the Controls screen lists those labels (roll buttons "< ROLL" and "> ROLL")', async () => {
    await page.s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    try {
      await page.setViewport(844, 390, { dpr: 1, mobile: true });
      await page.goto(GAME + '?debug=1&manual=1&autostart=1&mute=1&laps=3&bots=3&course=sunrise'); await page.waitFor('window.__sky && __sky.ready && __sky.game.state === "race"', { timeout: 100000 });
      const tp = (type, pts) => page.s('Input.dispatchTouchEvent', { type, touchPoints: pts });
      await tp('touchStart', [{ x: 5, y: 385, id: 1 }]); await tp('touchEnd', []); await delay(300);   // the first touch builds the overlay
      await page.eval(`__sky.step(3)`); await delay(300);
      let labels = [];
      for (const [w, h] of [[844, 390], [390, 844]]) {   // landscape and portrait: the layout differs, the labels do not
        await page.setViewport(w, h, { dpr: 1, mobile: true }); await delay(400);
        const buttons = await page.eval(`[...document.getElementById('sb-touch').children].filter((e) => e.textContent.trim()).map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent.trim(), key: e.dataset.k || '', drawn: r.width > 0 && r.height > 0 }; })`);
        const at = `${w}x${h}: ${JSON.stringify(buttons)}`;
        assert.ok(buttons.length >= 6 && buttons.every((b) => b.drawn), 'the touch buttons are drawn: ' + at);
        assert.equal(buttons.find((b) => b.key === 'rollL')?.text, '< ROLL', 'the left roll button is one label, an arrow and ROLL: ' + at);
        assert.equal(buttons.find((b) => b.key === 'rollR')?.text, '> ROLL', 'the right roll button is one label, an arrow and ROLL: ' + at);
        labels = buttons.map((b) => b.text);
      }
      await page.eval(`__sky.game.ui.goto('controls', { back: 'main' })`); await delay(700);
      const c = await page.eval(`(() => { const g = [...document.querySelectorAll('.scr.controls .cgrp')].find((s) => /touch/i.test(s.querySelector('h3').textContent)); return { caps: g ? [...g.querySelectorAll('dt kbd')].map((k) => k.textContent) : null, tip: (document.querySelector('.scr.controls .tip') || {}).textContent || '' }; })()`);
      assert.ok(c.caps && c.caps.length, 'the Controls screen has a touch group: ' + JSON.stringify(c));
      for (const l of labels) assert.ok(c.caps.includes(l), `the on-screen button "${l}" is named on the Controls screen (touch keys: ${JSON.stringify(c.caps)})`);
      for (const k of c.caps) if (k !== 'Left thumb: drag') assert.ok(labels.includes(k), `the Controls screen's touch key "${k}" is a button on screen (${JSON.stringify(labels)})`);
      assert.match(c.tip, /ROLL buttons/, 'the tip on the Controls screen names the touch roll buttons, not just Q / E: ' + c.tip);
    } finally { await page.s('Emulation.setTouchEmulationEnabled', { enabled: false }); await page.setViewport(1280, 720, { dpr: 1, mobile: false }); }
  }, { own: true });

  check('volume sliders reach the audio graph (unmuted page)', async () => {
    await fresh({ qs: 'debug=1' }); await delay(300);   // no mute=1: this page makes sound
    await press('Enter');   // title -> main (a key gesture starts audio)
    await page.eval(`__sky.game.ui.goto('settings', { back: 'main' })`); await delay(500);
    const gain = () => page.eval(`(() => { const a = __sky.game.audio; return a && a.master ? [a.master.gain.value, a.sfxBus.gain.value, a.musicBus.gain.value] : null; })()`);
    const g0 = await gain(); assert.ok(g0, 'audio graph exists after a key press');
    for (const [label, idx] of [['Master volume', 0], ['Effects volume', 1], ['Music volume', 2]]) {
      await page.eval(`document.querySelector('.scr.settings input[aria-label="${label}"]').focus()`);
      for (let i = 0; i < 8; i++) await page.key('ArrowLeft');
      await delay(900);
      const g1 = await gain(); assert.ok(g1[idx] < g0[idx] - 0.2, `${label}: bus gain ${g0[idx]} -> ${g1[idx]}`);
    }
  }, { own: true });
}
