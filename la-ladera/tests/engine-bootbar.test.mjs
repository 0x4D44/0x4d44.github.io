// The loading card, without a browser (owner: A1: js/core/bootbar.js, index.html, css/ladera.css; the page itself is tests/engine-bootcard.test.mjs).
// Review R2c-013: at 8 Mbit/s and 120 ms the title is ready after 44-55 s; for the first 3 s the card shows no text and the bar stands at 0; from about 40 s the bar sits
// at 100 % with 'Calentando la primera vista...' for 10-15 s and looks hung. Here: the stage table (weights, the blocking flag), the bar's arithmetic (a stage that only
// waits creeps inside its share, the bar never goes back), the text the HTML starts with, and the sweep along the bar (transform only, so the compositor keeps it moving
// while the page is blocked).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-bootbar.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BootBar, STAGES, CREEP_AFTER_MS, CREEP_CEIL, CREEP_TICK_MS } from '../js/core/bootbar.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const MAIN = read('../js/main.js'), HTML = read('../index.html'), CSS = read('../css/ladera.css');
const share = (name) => STAGES.find((s) => s[0] === name)[1];
const TOTAL = STAGES.reduce((a, s) => a + s[1], 0);

// ---- the table ------------------------------------------------------------------------------------------------------------------------------
test('the stage table names exactly the stages main.js runs, each with a weight and a message for the card', () => {
  const run = [...MAIN.matchAll(/await stage\('([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(STAGES.map((s) => s[0]), run, 'the table lists the stages in the order main.js runs them (a stage missing from it would count as 1 and push the bar past 100 %)');
  for (const [name, weight, label] of STAGES) {
    assert.ok(Number.isFinite(weight) && weight > 0, `${name}: a positive weight`);
    assert.ok(typeof label === 'string' && label.trim().length > 4, `${name}: a message for the card`);
  }
  assert.equal(new Set(STAGES.map((s) => s[0])).size, STAGES.length, 'no stage twice');
});

test('the warm-up frame is flagged as blocking, and the bar does not read near 100 % while it runs (R2c-013: it stood at 97-100 % for the longest freeze of the boot)', () => {
  assert.equal(STAGES.find((s) => s[0] === 'warm')[3], true, 'warm is flagged: main.js paints its label before the call that blocks the page');
  const before = (TOTAL - share('warm')) / TOTAL;
  assert.ok(before <= 0.9, `the bar stands at ${(before * 100).toFixed(0)} % when the warm-up frame starts: it is the longest single stretch of the boot and must not look finished`);
  assert.ok(share('warm') >= 12 && share('furnish') >= 12, 'the two longest stages of a fast boot (3.8 s and 3.9 s of 11 s) carry a fair share of the bar');
  assert.ok(share('warm') <= 24, 'but the warm-up does not take the bar over');
});

// ---- the bar --------------------------------------------------------------------------------------------------------------------------------
/** a whole boot: every stage begins, reports a few times, is silent for `quiet` ms between ticks, ends. Returns every fraction the bar showed. */
function run(bar, { quiet = 0, reports = 2 } = {}) {
  const seen = []; let now = 0;
  for (const s of STAGES) {
    bar.begin(s[0], now); seen.push(bar.fraction);
    for (let i = 1; i <= reports; i++) { bar.report(i / (reports + 1), now += 100); seen.push(bar.fraction); }       // 1/3, 2/3: below the creep's ceiling, so a quiet stage creeps on from there
    for (let t = 0; t < quiet; t += CREEP_TICK_MS) { now += CREEP_TICK_MS; if (bar.tick(now)) seen.push(bar.fraction); }
    bar.end(); seen.push(bar.fraction);
  }
  return seen;
}

test('the bar only goes forward, ends exactly full, and a finished stage puts it at the sum of the weights behind it', () => {
  for (const quiet of [0, 800, 5000, 60000]) {
    const bar = new BootBar(), seen = run(bar, { quiet });
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], `quiet ${quiet} ms: step ${i} went back (${seen[i - 1]} -> ${seen[i]})`);
    assert.ok(seen.every((f) => f >= 0 && f <= 1), 'always within 0..1');
    assert.equal(bar.fraction, 1, 'after the last stage the bar is full');
  }
  const bar = new BootBar(); let acc = 0;
  for (const s of STAGES) { bar.begin(s[0], 0); bar.report(0.7, 0); bar.tick(1e6); bar.end(); acc += s[1]; assert.equal(bar.fraction, acc / TOTAL, `after ${s[0]} the bar is exactly the weights behind it, whatever the stage crept to`); }
});

test('a stage that reports nothing creeps after a pause, slowly, and never past its share', () => {
  const bar = new BootBar(); bar.begin('people', 0);
  assert.equal(bar.tick(CREEP_AFTER_MS - 1), false, 'a stage silent for less than the pause does not move');
  assert.equal(bar.fraction, 0);
  let now = CREEP_AFTER_MS, moved = 0, last = bar.fraction;
  for (let i = 0; i < 400; i++) { if (bar.tick(now += CREEP_TICK_MS)) { moved++; assert.ok(bar.fraction > last, 'every move is forward'); last = bar.fraction; } }
  assert.ok(moved > 50, `it keeps moving while the stage is silent (${moved} moves)`);
  assert.ok(bar.fraction > 0.5 * CREEP_CEIL * share('people') / TOTAL, `after two minutes of silence it has covered most of the way it may: ${(bar.fraction * 100).toFixed(1)} %`);
  assert.ok(bar.fraction <= CREEP_CEIL * share('people') / TOTAL + 1e-9, 'but never past the ceiling of its own share');
  assert.ok(bar.fraction < 0.9 * share('people') / TOTAL, 'a stage that is only waiting is never shown as nearly done (under 90 % of its share, whatever the constants)');
  const tenSeconds = new BootBar(); tenSeconds.begin('people', 0); for (let t = CREEP_AFTER_MS; t <= 10000; t += CREEP_TICK_MS) tenSeconds.tick(t);
  assert.ok(tenSeconds.fraction > 0.2 * share('people') / TOTAL && tenSeconds.fraction < 0.7 * share('people') / TOTAL, `ten seconds of waiting moves the bar a visible but modest part of the stage: ${(tenSeconds.fraction * 100).toFixed(2)} %`);
});

test('a real report holds the creep off, jumps ahead of it, and a smaller number than what is shown is ignored', () => {
  const bar = new BootBar(); bar.begin('furnish', 0);
  for (let t = 0; t < 20000; t += CREEP_TICK_MS) { bar.report(0.1, t); assert.equal(bar.tick(t + 100), false, 'while the stage keeps reporting the bar is not moved by the creep'); }
  assert.equal(bar.fraction, 0.1 * share('furnish') / TOTAL);
  bar.report(0.6, 30000); assert.equal(bar.fraction, 0.6 * share('furnish') / TOTAL, 'a real number above what is shown is taken at once');
  const shown = bar.fraction; bar.report(0.2, 30100); assert.equal(bar.fraction, shown, 'and a lower one never pulls the bar back');
  bar.report(7, 30200); assert.equal(bar.fraction, share('furnish') / TOTAL, 'a report past 1 is the end of the share, not beyond it');
  bar.report(NaN, 30300); bar.report(-3, 30400); assert.equal(bar.fraction, share('furnish') / TOTAL, 'junk is ignored');
  assert.equal(bar.tick(1e6), false, 'and a stage at the end of its share does not creep (back down toward the ceiling either)');
  assert.equal(bar.fraction, share('furnish') / TOTAL);
});

test('between two stages the bar stands still: a timer tick or a late report after end() must not count the finished stage twice (seen in the page: 77 -> 76)', () => {
  const bar = new BootBar(); bar.begin('people', 0); bar.end();
  const after = bar.fraction;
  assert.equal(after, share('people') / TOTAL, 'the finished stage is exactly behind the bar');
  assert.equal(bar.tick(60000), false, 'a creep tick in the yield between two stages moves nothing');
  assert.equal(bar.fraction, after, '... not even after a long silence');
  bar.report(0.9, 60001);
  assert.equal(bar.fraction, after, 'a late report from the finished stage is ignored');
  bar.end();
  assert.equal(bar.fraction, after, 'and a second end() does not add the share again');
  bar.begin('start', 60002);
  assert.equal(bar.fraction, after, 'the next stage opens where the last one ended: the bar never drops when it begins');
  // the same through a whole boot with a timer that ticks in every gap (the real main.js has one, every 300 ms)
  const b2 = new BootBar(); const seen = []; let now = 0;
  for (const s of STAGES) {
    b2.begin(s[0], now); now += 5000; b2.tick(now); seen.push(b2.fraction);
    b2.end(); b2.tick(now += 4000); seen.push(b2.fraction); b2.tick(now += 4000); seen.push(b2.fraction);
  }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], `step ${i} went back (${seen[i - 1]} -> ${seen[i]})`);
  assert.equal(b2.fraction, 1);
});

test('a stage the table does not know still cannot push the bar past 100 %', () => {
  const bar = new BootBar(); for (const s of STAGES) { bar.begin(s[0], 0); bar.end(); }
  bar.begin('not-in-the-table', 0); bar.end();
  assert.equal(bar.fraction, 1);
});

test('a stage that finishes does not hand its creep to the next one', () => {
  const bar = new BootBar(); bar.begin('people', 0); for (let t = 2000; t < 30000; t += CREEP_TICK_MS) bar.tick(t); bar.end();
  const after = bar.fraction; bar.begin('start', 30000);
  assert.equal(bar.fraction, after, 'the next stage opens at 0 of its own share');
  assert.equal(bar.tick(30000 + CREEP_AFTER_MS - 1), false, 'and has its own pause before it creeps');
});

// ---- the card's HTML and CSS ----------------------------------------------------------------------------------------------------------------
test('index.html carries a message on the card, so the first seconds (the modules are still coming in) do not show an empty line', () => {
  const m = HTML.match(/<div id="loadmsg">([^<]*)<\/div>/);
  assert.ok(m, '#loadmsg is on the card');
  const text = m[1].replace(/&nbsp;|&#160;/g, ' ').replace(/&hellip;/g, '...').trim();
  assert.ok(text.length > 5, `#loadmsg starts with a sentence, not a blank: "${m[1]}"`);
});

test('the sweep on the bar animates transform only (the compositor keeps it moving while the page is blocked); reduced motion pulses instead', () => {
  const rule = CSS.match(/#loadbar::after\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /animation:\s*loadsweep\b[^;]*infinite/, 'the bar has a sweep that never stops while the card is up');
  assert.match(rule, /will-change:\s*transform/, 'on its own layer');
  const frames = (name) => CSS.match(new RegExp(`@keyframes ${name}\\s*\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}`))?.[1] ?? '';
  const props = (css) => [...css.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(props(frames('loadsweep')))], ['transform'], 'only transform moves (a width or left would be main-thread work)');
  assert.deepEqual([...new Set(props(frames('loadpulse')))], ['opacity'], 'the reduced-motion version changes opacity only');
  assert.match(CSS, /prefers-reduced-motion: reduce\)[^\n]*#loadbar::after\s*\{[^}]*animation:\s*loadpulse/, 'with reduced motion the sweep is a pulse');
  assert.match(CSS, /#title\.ready #loadbar/, 'and the bar, sweep included, is gone when the card is ready');
});
