// Source guard for the keyboard contract (owner: A1; review R2-004). Ctrl is the browser's key: Ctrl+W closes the tab and a page cannot stop it, so it must never
// be a game binding (it was bound to crouch, the FPS habit). Crouch is C. Ctrl may only appear as a modifier that makes a game hotkey step aside
// (`if (e.ctrlKey ...) return;`), never as a key the game acts on.
//   node --test la-ladera/tests/engine-input.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const JS = join(import.meta.dirname, '..', 'js');
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.m?js$/.test(e.name) ? [join(dir, e.name)] : []));
/** the file's code without // and block comments, and without the text inside string literals that are prose (kept: short identifiers), line numbers kept */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n').map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
const all = files(JS).map((f) => ({ name: relative(JS, f).replace(/\\/g, '/'), lines: code(readFileSync(f, 'utf8')).split('\n') }));

test('the shipped code has files to scan (the guard is not vacuous)', () => {
  assert.ok(all.length > 40 && all.some((f) => f.name === 'engine/player.js') && all.some((f) => f.name === 'interiors/sit.js'), `${all.length} files`);
});

test('no game binding on Ctrl: no ControlLeft / ControlRight / "Control" key name in any module', () => {
  const hits = [];
  for (const f of all) f.lines.forEach((l, i) => { if (/Control(Left|Right)\b|key\s*===?\s*['"]Control['"]|['"]Control['"]\s*===?\s*\S*key\b/.test(l)) hits.push(`${f.name}:${i + 1}: ${l.trim().slice(0, 100)}`); });
  assert.deepEqual(hits, [], 'Ctrl is not a game key (Ctrl+W closes the tab)');
});

test('ctrlKey appears only as a guard that makes a hotkey step aside', () => {
  const hits = [];
  for (const f of all) f.lines.forEach((l, i) => { if (/\bctrlKey\b/.test(l) && !/^\s*if \([^)]*\bctrlKey\b[^)]*\) return;/.test(l)) hits.push(`${f.name}:${i + 1}: ${l.trim().slice(0, 100)}`); });
  assert.deepEqual(hits, [], 'a Ctrl chord is left to the browser: handlers return early on it');
});

test('crouch is bound to C only: the player reads KeyC and input.crouch, the sit-down stand-up list has KeyC and no Ctrl', () => {
  const player = all.find((f) => f.name === 'engine/player.js').lines.join('\n'), sit = all.find((f) => f.name === 'interiors/sit.js').lines.join('\n');
  assert.match(player, /crouchWant\s*=\s*k\.has\('KeyC'\)\s*\|\|\s*inp\.crouch;/);
  const move = sit.match(/const MOVE = \[([^\]]*)\]/);
  assert.ok(move, 'sit.js lists the keys that stand a sitter up');
  assert.ok(/'KeyC'/.test(move[1]) && !/Control/.test(move[1]), move[1]);
});
