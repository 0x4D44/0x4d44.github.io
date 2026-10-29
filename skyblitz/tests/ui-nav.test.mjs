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

  check('main menu: a saved Grand Prix reads "Resume GP" with its race and rank, and the 7 entries fit without a scrollbar (E-24 / V-18)', async () => {
    try {
      for (const [w, h] of [[1280, 720], [1366, 768], [1024, 600], [844, 390], [390, 844]]) {
        await page.setViewport(w, h, { dpr: 1 }); await delay(300);
        await page.eval(`(() => { const u = __sky.game.ui; u.save.gp = { race: 1, craft: 'falcon', livery: 0, difficulty: 'normal', totals: ${JSON.stringify(GP_TOTALS)} }; u.goto('main'); })()`); await delay(500);
        const m = await page.eval(`(() => {
          const scr = document.querySelector('.scr.main'), menu = scr.querySelector('.menu'), bs = [...menu.querySelectorAll('.btn')].filter((b) => b.offsetParent !== null);
          const resume = bs.find((b) => /Resume/.test(b.textContent)), lines = (e) => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size; };
          return { n: bs.length, label: resume && resume.querySelector('.btn-t').textContent, sub: resume && resume.querySelector('small').textContent, aria: resume && resume.getAttribute('aria-label'),
            wrapped: bs.filter((b) => lines(b.querySelector('.btn-t')) > 1 || (b.querySelector('small') && lines(b.querySelector('small')) > 1)).map((b) => b.textContent.trim()),
            menuScrolls: menu.scrollHeight > menu.clientHeight + 1, scrScrolls: scr.scrollHeight > scr.clientHeight + 1,
            off: bs.filter((b) => { const r = b.getBoundingClientRect(); return r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1; }).map((b) => b.textContent.trim().slice(0, 14)),
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        })()`);
        const at = `${w}x${h}: ${JSON.stringify(m)}`;
        assert.equal(m.n, 7, 'seven entries with a saved Grand Prix: ' + at);
        assert.equal(m.label, 'Resume GP', at); assert.equal(m.sub, 'Race 2 of 4 - 2nd, 25 pts', 'race, rank and points, no dangling dash: ' + at);
        assert.equal(m.aria, 'Resume Grand Prix, Race 2 of 4 - 2nd, 25 pts', at);
        assert.deepEqual(m.wrapped, [], 'no label wraps: ' + at); assert.ok(!m.menuScrolls && !m.scrScrolls, 'the menu needs no scrollbar: ' + at);
        assert.deepEqual(m.off, [], 'every entry is on screen: ' + at); assert.ok(m.overflowX <= 1, 'no sideways scroll: ' + at);
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
      assert.ok(c.heads >= 3 && c.links >= 3 && c.safe, at + ': headings and safe links: ' + JSON.stringify(c));
      assert.ok(c.scrolls && !c.wide && c.pageWide <= 1, at + ': a scrolling panel with no sideways overflow: ' + JSON.stringify(c));
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
    await page.waitFor(`__sky.game.state === 'race' || __sky.game.ui.hintOpen`, { timeout: 90000 }); await delay(600);
    s = await state();
    assert.equal(s.screen, 'hint', 'a first race (clean profile) opens with the controls hint: ' + JSON.stringify(s));   // was an `if`: the hint keys went unchecked whenever it did not show
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

  check('loading screen: the double-tap roll is taught only when that setting is on (V-30)', async () => {
    try {
      await fresh({ clear: true });
      // The screen starts on a random tip: step through all of them by feeding Math.random one value per tip.
      const tips = () => page.eval(`(() => { const out = new Set(), real = Math.random, n = 64; try { for (let i = 0; i < n; i++) { Math.random = () => (i + 0.5) / n; __sky.game.ui.goto('loading'); out.add(document.querySelector('.scr.loading .ld-tip').textContent); } } finally { Math.random = real; __sky.game.ui.goto('main'); } return [...out]; })()`);
      assert.equal(await page.eval(`__sky.game.settings.doubleTapRoll`), false, 'the premise: double-tap roll is off by default');
      let t = await tips(); assert.ok(t.length >= 8, 'the loading screen shows its tips: ' + t.length);
      assert.ok(t.some((x) => /barrel roll/i.test(x)), 'the barrel-roll tip is among them');
      assert.deepEqual(t.filter((x) => /double-tap/i.test(x)), [], 'double-tap roll is off, so no tip teaches it');
      await page.eval(`__sky.game.ui.setSetting('doubleTapRoll', true)`);
      t = await tips(); assert.ok(t.some((x) => /double-tap/i.test(x)), 'with the setting on, the tip names it: ' + JSON.stringify(t.filter((x) => /roll/i.test(x))));
    } finally { await fresh({ clear: true }); }
  }, { own: true });

  const raceReady =() => page.waitFor(`__sky.game.state === 'race'`, { timeout: 120000 });
  check('time trial: keys only to results; Retry primary, Escape back to menu', async () => {
    await toMain();
    let s = await seq(['ArrowDown', 'ArrowDown']); assert.ok(/Time Trial/.test(s.label), JSON.stringify(s));
    await seq(['Enter', 'Enter', 'Enter']);   // aircraft -> course -> launch
    await raceReady(); await delay(300);
    s = await finish(); assert.equal(s.screen, 'results'); assert.ok(/Retry/.test(s.label), JSON.stringify(s));
    assert.match(await page.eval(`document.querySelector('.scr.results h2').textContent`), /TIME TRIAL/);
    await press('Escape'); await page.waitFor(`__sky.game.ui.cur && __sky.game.ui.cur.name === 'main'`, { timeout: 60000 });
  });

  check('grand prix: 4 races by keys, standings each time, podium', async () => {
    await delay(400); await toMain();
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
  check('podium: New Grand Prix and Quit stay on screen, with focus on one of them, in portrait and in small windows (V-12)', async () => {
    for (const [w, h] of [[1280, 720], [768, 1024], [390, 844], [360, 640], [844, 390]]) {
      await page.setViewport(w, h, { dpr: 1 }); await delay(300);
      await page.eval(`(() => { const u = __sky.game.ui; u.goto('main'); })()`); await delay(300);   // leave and re-enter: goto() of the screen already showing only calls its enter(), which rebuilds the buttons and drops focus
      await page.eval(`(() => { const u = __sky.game.ui; u.gp = { race: 3, totals: ${JSON.stringify(GP_TOTALS)} }; u.pending = null; u.goto('podium'); })()`); await delay(700);
      const m = await page.eval(`(() => {
        const bs = [...document.querySelectorAll('.scr.podium-scr .res-act .btn')], a = document.activeElement, rect = (e) => e.getBoundingClientRect();
        const inView = (e) => { const r = rect(e); return r.width > 0 && r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1; };
        return { names: bs.map((b) => b.textContent.trim()), off: bs.filter((b) => !inView(b)).map((b) => b.textContent.trim()), focus: a && a.textContent.trim(), focusIn: !!a && inView(a), focusInRow: !!a && !!a.closest('.res-act'),
          underPill: !!a && rect(a).left < 112 && rect(a).top < 44, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      })()`);
      const at = `${w}x${h}: ${JSON.stringify(m)}`;
      assert.ok(m.names.length >= 2 && /New Grand Prix/.test(m.names[0]) && /Quit/.test(m.names[m.names.length - 1]), 'the two actions exist: ' + at);
      assert.deepEqual(m.off, [], 'both actions are on screen without scrolling the page (they used to sit below the fold): ' + at);
      assert.ok(m.focusInRow && m.focusIn && !m.underPill, 'first focus is an action and it is visible: ' + at); assert.ok(m.overflowX <= 1, 'no sideways scroll: ' + at);
      await press('ArrowRight'); const q = await state(); assert.ok(/Quit/.test(q.label) && q.visible, `${w}x${h}: Right reaches Quit, visible ${JSON.stringify(q)}`);
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

  check('volume sliders reach the audio graph (unmuted page)', async () => {
    await page.goto(GAME + '?debug=1');
    await page.waitFor('window.__sky && __sky.ready', { timeout: 100000 }); await delay(800);
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
