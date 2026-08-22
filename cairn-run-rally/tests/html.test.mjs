import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'index.html'), 'utf8');
const css = await readFile(join(root, 'src', 'style.css'), 'utf8');

const ids = [...html.matchAll(/(?:^|\s)id="([^"]+)"/g)].map(match => match[1]);
const idSet = new Set(ids);

test('the rally shell keeps legacy controls and exposes every vertical-flow hook', () => {
  const required = [
    // Existing driving shell: game.js owns these IDs.
    'game-shell', 'game-canvas', 'hud', 'title-screen', 'start-button', 'settings-button',
    'settings-screen', 'settings-back', 'pause-screen', 'resume-button', 'pause-restart',
    'quit-button', 'result-screen', 'retry-button', 'result-quit', 'final-time', 'best-time',
    'result-delta', 'result-damage', 'effects-volume', 'voice-volume', 'quality-setting',
    'notes-toggle',
    // Title and quick/practice/championship selection flow.
    'practice-button', 'championship-button', 'resume-championship', 'resume-note',
    'selection-screen', 'selection-mode', 'car-options', 'stage-options', 'selection-difficulty',
    'selection-start', 'selection-back', 'selection-error',
    // Championship service, classification and overall standings.
    'service-screen', 'service-budget', 'service-remaining', 'service-repair', 'service-auto',
    'service-start', 'service-abandon', 'service-error', 'result-position', 'result-points',
    'result-penalty', 'result-rivals', 'result-standings', 'result-next', 'standings-screen',
    'stage-standings', 'overall-standings', 'standings-table', 'standings-continue',
    'standings-abandon',
    // Full settings surface and input wiring container.
    'mute-toggle', 'assist-automatic', 'assist-stability', 'assist-braking', 'assist-pace-notes',
    'manual-shifting-toggle', 'remapping-section', 'remapping-container',
    'remap-shift-up', 'remap-shift-down', 'reset-bindings'
  ];
  assert.deepEqual(required.filter(id => !idSet.has(id)), [], 'missing shell IDs');
  assert.equal(ids.length, idSet.size, 'every id must be unique for reliable game wiring');
});

test('menus use semantic controls, live error/status regions and result tables', () => {
  assert.match(html, /<button\b[^>]*id="start-button"[^>]*>\s*START STAGE/i);
  assert.match(html, /<fieldset\b[^>]*id="car-options"/i);
  assert.match(html, /<fieldset\b[^>]*id="stage-options"/i);
  assert.match(html, /<fieldset\b[^>]*id="selection-difficulty"/i);
  assert.match(html, /data-car-id="cairn-r4"/i);
  assert.match(html, /data-stage-id="aurora-forest"/i);
  assert.match(html, /<table\b[^>]*id="standings-table"/i);
  assert.match(html, /<th\b[^>]*scope="col"/i);
  assert.match(html, /id="service-error"[^>]*aria-live="assertive"/i);
  assert.match(html, /id="result-standings"[^>]*aria-live="polite"/i);
  assert.match(html, /id="remapping-container"[^>]*aria-label=/i);
  assert.match(html, /data-binding-device="keyboard"/i);
  assert.match(html, /data-binding-device="gamepad"/i);
  assert.match(html, /id="remap-pad-accelerate"/i);
  assert.match(html, /id="settings-screen"[^>]*aria-labelledby=/i);
});

test('responsive menu CSS provides bounded columns and vertical panel scrolling', () => {
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /overflow:\s*auto/);
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(css, /100dvh/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.doesNotMatch(css, /width:\s*100vw/);
});
