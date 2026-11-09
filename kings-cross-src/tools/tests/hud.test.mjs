// tools/hud.mjs: the page's overlays (station switcher, status and attribution panels, title, Almanac pill), hidden for a station view
// and put back after it. hudPage runs in the page, so it is run here against a small stand-in for the document: a style element in
// the head hides the elements its rule names, as a real stylesheet does, and the checks the tool makes on a capture are the ones
// these tests drive.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { HUD_NOTE, HUD_SELECTORS, HUD_STYLE_ID, hudCheck, hudController, hudCss, hudMode, hudPage } from '../hud.mjs';

const kingsCrossSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceOf = (...parts) => readFileSync(path.join(kingsCrossSrc, ...parts), 'utf8');

/** The body of web/index.html with the station switcher and the Almanac pill the page adds at run time; `changes` edits one element. */
function pageElements(changes = {}) {
  const base = {
    app: { tag: 'div', id: 'app' },
    title: { tag: 'h1' },
    fallback: { tag: 'div', id: 'fallback', pageHidden: true },
    hud: { tag: 'div', classes: ['hud'] },
    script: { tag: 'script' },
    switcher: { tag: 'nav', classes: ['station-switcher'] },
    pill: { tag: 'div', id: 'almanac-back-host' },
  };
  return Object.entries(base).map(([key, element]) => ({ ...element, ...(changes[key] ?? {}) })).concat(changes.extra ?? []);
}

/**
 * Enough of a document for hudPage: top-level elements, a head that takes style elements, and a computed style in which a style
 * element hides what its rule names. An element with `inline` keeps a `display: block !important` of its own (an inline important
 * beats a stylesheet's), and one with `pageHidden` is hidden by the page's own rules whatever the overlay style says. One with `invisible`
 * has visibility hidden and one with `transparent` an opacity of 0: each keeps its box, as it does in a browser, and is not drawn.
 */
function fakePage(elements) {
  const styles = [];
  const matches = (element, selector) => selector.startsWith('body > ') ? matches(element, selector.slice(7))
    : selector.startsWith('.') ? element.classes.includes(selector.slice(1))
      : selector.startsWith('#') ? element.id === selector.slice(1) : element.tag === selector;
  const nodes = elements.map(({ tag, id = '', classes = [], inline = false, pageHidden = false, invisible = false, transparent = false }) => {
    const element = { tag, tagName: tag.toUpperCase(), id, classes, className: classes.join(' '), inline, pageHidden, invisible, transparent };
    element.matches = selector => matches(element, selector);
    return element;
  });
  const hiddenByStyle = element => styles.some(style => [...style.textContent.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .some(([, selectors, body]) => /display:\s*none\s*!important/.test(body) && selectors.split(',').some(selector => matches(element, selector.trim()))));
  const display = element => element.pageHidden || (hiddenByStyle(element) && !element.inline) ? 'none' : 'block';
  for (const element of nodes) element.getClientRects = () => display(element) === 'none' ? [] : [{ width: 100, height: 20 }];
  const document = {
    head: { appendChild: node => styles.push(node) },
    documentElement: { appendChild: node => styles.push(node) },
    body: { children: nodes },
    createElement: tag => { const node = { tag, tagName: tag.toUpperCase(), id: '', textContent: '', remove() { styles.splice(styles.indexOf(node), 1); } }; return node; },
    getElementById: id => styles.find(style => style.id === id) ?? nodes.find(node => node.id === id) ?? null,
    querySelectorAll: selector => nodes.filter(node => matches(node, selector)),
  };
  return { document, styles, getComputedStyle: element => ({ display: display(element), visibility: element.invisible ? 'hidden' : 'visible', opacity: element.transparent ? '0' : '1' }) };
}

/** Run page source in the stand-in; the result comes back as JSON, as it does over the DevTools protocol. */
const evaluateIn = page => async source => JSON.parse(JSON.stringify(runInNewContext(source, { document: page.document, getComputedStyle: page.getComputedStyle })));
const probeOf = page => evaluateIn(page)(`(${hudPage.toString()})("probe",${JSON.stringify(HUD_SELECTORS)},${JSON.stringify(hudCss())},${JSON.stringify(HUD_STYLE_ID)})`);
const countsOf = result => result.rows.map(row => [row.selector, row.found, row.visible]);
/** The controller the tool uses, over the stand-in; `log` records each page action and each wait for a frame, in order. */
function controllerFor(page, log) {
  const evaluate = evaluateIn(page);
  return hudController({
    evaluate: source => { log.push(/\("(hide|show|probe)",/.exec(source)[1]); return evaluate(source); },
    settle: async () => { log.push('settle'); },
  });
}

test('the overlays are the four things the page draws over the canvas, and the style hides each of them', () => {
  assert.deepEqual([...HUD_SELECTORS], ['.station-switcher', '.hud', 'body > h1', '#almanac-back-host']);
  assert.ok(Object.isFrozen(HUD_SELECTORS));
  assert.equal(hudCss(), '.station-switcher, .hud, body > h1, #almanac-back-host { display: none !important; }');
  assert.equal(hudCss(['.a', '#b']), '.a, #b { display: none !important; }');
  assert.match(HUD_NOTE, /overview-hud-on/);
  assert.match(HUD_NOTE, /axis-01 grid views/);
});

test('every selector names something the page draws: the switcher, the hud panels and the title in the page sources, the pill in the shared script', () => {
  const indexHtml = sourceOf('web', 'index.html'), body = indexHtml.slice(indexHtml.indexOf('<body>'), indexHtml.indexOf('</body>'));
  assert.match(sourceOf('web', 'src', 'stations.ts'), /\.station-switcher\{[^}]*position:fixed/, '.station-switcher is a fixed overlay in the station CSS');
  assert.match(sourceOf('web', 'src', 'stations.ts'), /nav\.className = 'station-switcher'/, 'and the page gives its nav that class');
  assert.match(body, /^<h1>/m, 'the title is a direct child of the body (body > h1)');
  assert.match(body, /^<div class="hud">/m, 'the status and attribution panels are in a .hud container, a direct child of the body');
  assert.match(indexHtml, /\.hud \{[^}]*position: fixed/, '.hud is fixed over the canvas');
  assert.match(sourceOf('..', 'almanac-back.js'), /host\.id = "almanac-back-host"/, 'the Almanac pill has that id');
  assert.match(sourceOf('vite.config.ts'), /src: '\/almanac-back\.js' \}, injectTo: 'body'/, 'and the build puts its script in the body, so the pill is a direct child of it');
});

test('--hud is on or off, off when not given', () => {
  assert.equal(hudMode(undefined), 'off');
  assert.equal(hudMode('off'), 'off');
  assert.equal(hudMode('on'), 'on');
  for (const bad of ['', 'ON', 'Off', 'true', '1', 'none', 'hide', 'on,off']) assert.throws(() => hudMode(bad), /--hud must be on or off/, JSON.stringify(bad));
});

test('hudCheck: off wants every overlay found hidden, on wants every one drawn, and either wants at least one found', () => {
  const row = (selector, found, visible) => ({ selector, found, visible });
  const drawn = HUD_SELECTORS.map(selector => row(selector, 1, 1)), gone = HUD_SELECTORS.map(selector => row(selector, 1, 0));
  assert.deepEqual(hudCheck('off', gone), { ok: true, problems: [], hidden: [...HUD_SELECTORS], shown: [], absent: [] });
  assert.deepEqual(hudCheck('on', drawn), { ok: true, problems: [], hidden: [], shown: [...HUD_SELECTORS], absent: [] });
  assert.deepEqual(hudCheck('off', drawn).problems, HUD_SELECTORS.map(selector => `${selector}: 1 of 1 still drawn`));
  assert.deepEqual(hudCheck('on', gone).problems, HUD_SELECTORS.map(selector => `${selector}: 1 of 1 not drawn`));
  const mixed = [row('.station-switcher', 1, 0), row('.hud', 2, 1), row('body > h1', 0, 0)];
  assert.deepEqual(hudCheck('off', mixed), { ok: false, problems: ['.hud: 1 of 2 still drawn'], hidden: ['.station-switcher'], shown: [], absent: ['body > h1'] });
  assert.deepEqual(hudCheck('on', mixed).problems, ['.station-switcher: 1 of 1 not drawn', '.hud: 1 of 2 not drawn']);
  for (const mode of ['off', 'on']) {
    const nothing = hudCheck(mode, HUD_SELECTORS.map(selector => row(selector, 0, 0)));
    assert.equal(nothing.ok, false, `${mode}: a page with none of the overlays cannot be checked`);
    assert.match(nothing.problems[0], new RegExp(`was found, so --hud ${mode} cannot be checked`));
  }
});

test('a pack capture hides every overlay and puts every one back; --hud on leaves the page alone', async () => {
  const page = fakePage(pageElements()), log = [], control = controllerFor(page, log);
  assert.deepEqual(countsOf(await probeOf(page)), HUD_SELECTORS.map(selector => [selector, 1, 1]), 'before: all four are drawn');
  const hidden = await control.apply('off', 'overview');
  assert.deepEqual(hidden, { mode: 'off', hidden: [...HUD_SELECTORS], absent: [], otherOverlays: [], restored: null });
  assert.deepEqual(countsOf(await probeOf(page)), HUD_SELECTORS.map(selector => [selector, 1, 0]), 'during the shot: none is drawn');
  assert.equal(page.styles.length, 1);
  assert.equal(page.styles[0].id, HUD_STYLE_ID);
  assert.equal(await control.restore('off'), true);
  assert.equal(page.styles.length, 0, 'the style is gone');
  assert.deepEqual(countsOf(await probeOf(page)), HUD_SELECTORS.map(selector => [selector, 1, 1]), 'after: all four are drawn again');
  assert.deepEqual(log, ['hide', 'settle', 'show', 'settle'], 'the page draws a frame after each change, so the shot sees it');

  const shown = fakePage(pageElements()), onLog = [], onControl = controllerFor(shown, onLog);
  assert.deepEqual(await onControl.apply('on', 'overview-hud-on'), { mode: 'on', shown: [...HUD_SELECTORS], absent: [], otherOverlays: [], restored: null });
  assert.equal(shown.styles.length, 0, '--hud on adds no style');
  assert.equal(await onControl.restore('on'), true);
  assert.deepEqual(onLog, ['probe', 'settle'], 'and has nothing to restore');
});

test('hiding twice adds one style and showing twice is harmless', async () => {
  const page = fakePage(pageElements()), run = action => evaluateIn(page)(`(${hudPage.toString()})(${JSON.stringify(action)},${JSON.stringify(HUD_SELECTORS)},${JSON.stringify(hudCss())},${JSON.stringify(HUD_STYLE_ID)})`);
  await run('hide'); await run('hide');
  assert.equal(page.styles.length, 1);
  await run('show'); await run('show');
  assert.equal(page.styles.length, 0);
});

test('an overlay the style cannot hide fails the capture and puts the page back', async () => {
  const page = fakePage(pageElements({ hud: { inline: true } })), log = [], control = controllerFor(page, log);
  await assert.rejects(control.apply('off', 'gasholders'), /overlays off check failed for gasholders: \.hud: 1 of 1 still drawn/);
  assert.equal(page.styles.length, 0, 'no shot is taken with the overlays half hidden, and the style is gone');
  assert.deepEqual(log, ['hide', 'settle', 'show']);
});

test('an overlay the page itself hides fails --hud on, and one that does not come back fails the restore', async () => {
  const page = fakePage(pageElements({ switcher: { pageHidden: true } })), control = controllerFor(page, []);
  await assert.rejects(control.apply('on', 'overview-hud-on'), /overlays on check failed for overview-hud-on: \.station-switcher: 1 of 1 not drawn/);
  const hidden = await control.apply('off', 'overview');
  assert.ok(hidden.hidden.includes('.station-switcher'), 'hidden either way, so the off check passes');
  await assert.rejects(control.restore('off'), /the page's overlays did not come back after the capture: \.station-switcher: 1 of 1 not drawn/);
});

test('an overlay that is invisible or transparent is not drawn, though it keeps its box', async () => {
  for (const [look, change] of [['visibility hidden', { invisible: true }], ['opacity 0', { transparent: true }]]) {
    const page = fakePage(pageElements({ hud: change }));
    assert.deepEqual(countsOf(await probeOf(page)).find(([selector]) => selector === '.hud'), ['.hud', 1, 0], look);
    await assert.rejects(controllerFor(page, []).apply('on', 'overview-hud-on'), /\.hud: 1 of 1 not drawn/, look);
    const board = fakePage(pageElements({ extra: [{ tag: 'div', classes: ['kx-board'], ...change }] }));
    assert.deepEqual((await controllerFor(board, []).apply('off', 'overview')).otherOverlays, [], `${look}: a departure board nobody can see is not reported`);
  }
});

test('a page with none of the overlays cannot be checked, and an overlay the list does not name is reported', async () => {
  const empty = fakePage([{ tag: 'div', id: 'app' }]);
  await assert.rejects(controllerFor(empty, []).apply('off', 'overview'), /was found, so --hud off cannot be checked/);
  assert.equal(empty.styles.length, 0);
  const extra = fakePage(pageElements({ extra: [{ tag: 'div', classes: ['kx-board', 'open'] }] })), applied = await controllerFor(extra, []).apply('off', 'overview');
  assert.deepEqual(applied.otherOverlays, ['div.kx-board.open'], 'a departure board left on would show here; #app, #fallback and scripts never do');
});
