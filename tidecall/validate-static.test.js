'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const html = read('index.html');
const app = read('app.js');
const worker = read('sw.js');
const styles = read('styles.css');

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`✓ ${name}\n`);
  } catch (error) {
    process.stderr.write(`✗ ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

function matches(source, expression) {
  return Array.from(source.matchAll(expression), (match) => match[1]);
}

test('HTML has one copy of every id', () => {
  const ids = matches(html, /\sid=["']([^"']+)["']/g);
  assert(ids.length > 40, 'expected the complete application shell');
  assert.equal(new Set(ids).size, ids.length, 'duplicate id found');
});

test('every app id lookup resolves in the document', () => {
  const ids = new Set(matches(html, /\sid=["']([^"']+)["']/g));
  const queried = new Set(matches(app, /\$\('#([^']+)'\)/g));
  const missing = Array.from(queried).filter((id) => !ids.has(id));
  assert.deepEqual(missing, []);
});

test('all local document assets exist', () => {
  const references = matches(html, /\s(?:src|href)=["']([^"']+)["']/g)
    .filter((value) => !/^(?:https?:|data:|#|mailto:|\.\.\/)/.test(value));
  const missing = references
    .map((value) => value.split(/[?#]/, 1)[0])
    .filter(Boolean)
    .filter((value) => !fs.existsSync(path.join(ROOT, value)));
  assert.deepEqual(missing, []);
});

test('manifest describes a local standalone app', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'Tidecall');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert(Array.isArray(manifest.icons) && manifest.icons.length > 0);
});

test('service worker precaches every runtime file', () => {
  for (const asset of ['index.html', 'styles.css', 'engine.js', 'app.js', 'manifest.webmanifest', 'icon.svg']) {
    assert(worker.includes(`./${asset}`), `${asset} is not precached`);
  }
});

test('service worker only retires Tidecall caches', () => {
  assert.match(worker, /const CACHE_PREFIX = ['"]tidecall-['"]/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE/);
  assert.doesNotMatch(worker, /keys\.filter\(\(key\) => key !== CACHE\)/);
});

test('the game board min-height subtracts the real chrome at every tier', () => {
  // Each game-screen tier hand-computes the fixed chrome to subtract from 100dvh; when
  // it understates it, the board is taller than the viewport and the page scrolls.
  // Measured-correct values: desktop 106, ≤820 101, ≤560 73. (Regression guard.)
  assert.match(styles, /100dvh - 106px - var\(--safe-top\)/, 'desktop game-layout chrome');
  assert.match(styles, /100dvh - 101px - var\(--safe-top\)/, '≤820 table-column chrome');
  assert.match(styles, /100dvh - 73px - var\(--safe-top\)/, '≤560 table-column chrome');
  assert.doesNotMatch(styles, /100dvh - 64px/, 'stale ≤560 constant');
  assert.doesNotMatch(styles, /100dvh - 90px/, 'stale ≤820 constant (also lacked safe insets)');
});

test('the confetti animation cancels a live burst before starting a new one', () => {
  // celebrate() drives one shared canvas; without cancelling the prior rAF loop, two
  // overlapping bursts clearRect each other every frame — the earlier burst is erased
  // and a zombie loop keeps running. (Regression guard for the single-owner fix.)
  assert.match(app, /if \(celebrateRaf\) cancelAnimationFrame\(celebrateRaf\)/, 'celebrate must cancel the live loop');
});

test('round/match modals cannot be dismissed by the close control or scrim', () => {
  // Closing a round/match modal lets drive() immediately re-open it (the phase is still
  // at its boundary), which flashed the modal and re-fired the win sound/confetti. The
  // ✕/scrim must skip those two modals, and the redundant direct close listener that
  // bypassed the delegated guard must be gone. (Regression guard for the reopen bug.)
  assert.match(app, /ui\.modal === 'round' \|\| ui\.modal === 'match'\)\s*return/, 'delegated close must skip round/match');
  assert.doesNotMatch(app, /\[data-close-modal\]', dom\.modalLayer\)\.forEach/, 'the redundant direct close listener must be removed');
});

test('face-card watermark attribute targets the element its CSS reads', () => {
  // The watermark is drawn by `.card-art::before { content: attr(data-face) }`; attr()
  // resolves against .card-art, so data-face must be written there, not on the button,
  // or the J/Q/K/A ghost never renders (regression guard for the wrong-node bug).
  assert.match(app, /\$\('\.card-art', node\)\.dataset\.face/, 'data-face must be set on .card-art');
  assert.doesNotMatch(app, /\bnode\.dataset\.face\b/, 'data-face must not be set on the card button');
});

test('hand cards offer a touch tap-to-raise affordance', () => {
  // On touch there is no hover to disambiguate the overlapped fan, so the first tap raises
  // a card and a second tap plays it. Guard the ui state field, the (hover: none) gate, and
  // the CSS class so the affordance can't be silently dropped by a future refactor.
  assert.match(app, /raisedCard/, 'app tracks a raised card in ui state');
  assert.match(app, /matchMedia\('\(hover: none\)'\)/, 'the raise gate is scoped to touch (no-hover) pointers');
  assert.match(styles, /\.playing-card\.playable\.raised/, 'styles define the raised-card lift');
});

test('the page has no external runtime dependency', () => {
  const externalScripts = matches(html, /<script[^>]+src=["'](https?:\/\/[^"']+)["']/g);
  const externalStyles = matches(html, /<link[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*rel=["']stylesheet["']/g);
  assert.deepEqual(externalScripts, []);
  assert.deepEqual(externalStyles, []);
});

if (!process.exitCode) process.stdout.write('\nAll Tidecall static checks passed.\n');
