// UI pure-logic tests: time/ordinal formatting, the persistent save, the settings round trip, the main-menu GP label, the loading tips, the
// Markdown subset behind the credits screen and the aircraft-screen stat bars (no DOM needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fmtTime, ordinal, mod, clamp, parseMd, parseInline } from '../src/ui/dom.js';
import { loadSave, writeSave, recordResult, bestFor, gpLabel } from '../src/ui/save.js';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

test('fmtTime formats m:ss.mmm and placeholders', () => {
  assert.equal(fmtTime(65.4321), '1:05.432');
  assert.equal(fmtTime(0), '0:00.000');
  assert.equal(fmtTime(null), '--:--.---');
  assert.equal(fmtTime(NaN), '--:--.---');
  assert.equal(fmtTime(Infinity), '--:--.---');
});

test('ordinal handles teens and units', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);
});

test('mod and clamp', () => {
  assert.equal(mod(-1, 6), 5); assert.equal(mod(7, 6), 1);
  assert.equal(clamp(5, 0, 3), 3); assert.equal(clamp(-5, 0, 3), 0);
});

test('save round trip and corrupt data fallback', () => {
  mem.clear();
  const s = loadSave(); assert.equal(s.hintsSeen, false); assert.equal(s.last.course, 'sunrise');
  s.hintsSeen = true; writeSave(s);
  assert.equal(loadSave().hintsSeen, true);
  for (const k of mem.keys()) mem.set(k, '{not json');
  assert.equal(loadSave().hintsSeen, false, 'corrupt save must fall back to defaults');
});

test('recordResult keeps the best and reports records', () => {
  mem.clear();
  const s = loadSave();
  let r = recordResult(s, 'sunrise', 'falcon', { lap: 60, race: 190 });
  assert.equal(r.newLap, true); assert.equal(r.newRace, true); assert.equal(r.prevLap, null);
  r = recordResult(s, 'sunrise', 'falcon', { lap: 61, race: 195 });
  assert.equal(r.newLap, false); assert.equal(r.newRace, false); assert.equal(r.prevLap, 60);
  r = recordResult(s, 'sunrise', 'falcon', { lap: 58.5, race: 189 });
  assert.equal(r.newLap, true); assert.equal(r.newRace, true);
  recordResult(s, 'sunrise', 'wasp', { lap: 57, race: 200 });
  const b = bestFor(s, 'sunrise');
  assert.equal(b.lap, 57); assert.equal(b.race, 189);
  assert.deepEqual(bestFor(s, 'neon'), { lap: null, race: null });
  assert.equal(loadSave().best['sunrise|falcon'].lap, 58.5, 'persisted');
});

test('U-3: stunt popup text merges repeats into one counted line', async () => {
  const { popupText } = await import('../src/ui/hud.js');
  assert.equal(popupText('BARREL ROLL', 1, 6), 'BARREL ROLL +6%');
  assert.equal(popupText('BARREL ROLL', 3, 18), 'BARREL ROLL x3 +18%');
  assert.equal(popupText('SHORTCUT!', 1, 0), 'SHORTCUT!');
});

test('E-20 / U1: settings written by the settings screen come back on the next page load', async () => {
  const { Game } = await import('../src/game.js');
  const { SETTINGS_KEY, DEFAULT_SETTINGS } = await import('../src/config.js');
  mem.clear();
  const first = new Game(null);
  assert.equal(first.settings.masterVolume, DEFAULT_SETTINGS.masterVolume, 'a first run gets the defaults');
  const picks = { masterVolume: 0.4, musicVolume: 0.2, sfxVolume: 0.3, showFps: !DEFAULT_SETTINGS.showFps, doubleTapRoll: !DEFAULT_SETTINGS.doubleTapRoll, keyGuide: !DEFAULT_SETTINGS.keyGuide, quality: DEFAULT_SETTINGS.quality === 'low' ? 'med' : 'low' };   // keyGuide: the Steering assist row (R2-P-04)
  for (const k in picks) assert.notEqual(picks[k], DEFAULT_SETTINGS[k], `${k}: the test value differs from the default, so a missed reload shows`);
  Object.assign(first.settings, picks); first.saveSettings();
  assert.ok(mem.get(SETTINGS_KEY), 'saveSettings wrote the blob');
  const next = new Game(null);   // the next page load: a fresh Game reads localStorage
  for (const k in picks) assert.equal(next.settings[k], picks[k], `${k} survives a reload`);
  mem.set(SETTINGS_KEY, '{not json');
  assert.equal(new Game(null).settings.masterVolume, DEFAULT_SETTINGS.masterVolume, 'a corrupt blob falls back to the defaults');
});

test('E-24: the Resume GP sub-label reads race, rank and points from totals keyed by pilot', () => {
  const T = (rows) => Object.fromEntries(rows.map(([n, points, wins, isPlayer]) => [n, { points, wins, isPlayer: !!isPlayer, color: '#fff' }]));
  assert.equal(gpLabel({ race: 1, totals: T([['Nova Kim', 27, 0], ['You', 25, 1, true], ['Rosa Vega', 24, 1]]) }), 'Race 2 of 4 - 2nd, 25 pts');
  assert.equal(gpLabel({ race: 0, totals: T([['You', 0, 0, true]]) }), 'Race 1 of 4 - 1st, 0 pts');
  assert.equal(gpLabel({ race: 2, totals: T([['A', 10, 1], ['You', 10, 0, true]]) }), 'Race 3 of 4 - 2nd, 10 pts', 'equal points: more wins ranks higher, as in the standings table');
  assert.equal(gpLabel({ race: 2, totals: T([['A', 10, 1]]) }), 'Race 3 of 4', 'no player row: just the race');
  for (const gp of [{ race: 1, totals: T([['Nova Kim', 27, 0], ['You', 25, 1, true]]) }, { race: 3, totals: {} }, { race: 0 }]) assert.doesNotMatch(gpLabel(gp), /[-,]\s*$/, 'no dangling dash or comma');
});

test('E-24: gpLabel survives a tampered save', () => {
  for (const gp of [null, undefined, 0, 'x', true]) assert.equal(gpLabel(gp), '');
  assert.equal(gpLabel({}), 'Race 1 of 4');
  assert.equal(gpLabel({ race: 'x', totals: 5 }), 'Race 1 of 4');
  assert.equal(gpLabel({ race: 99, totals: null }), 'Race 4 of 4', 'a race number past the end is clamped');
  assert.equal(gpLabel({ race: -2, totals: [] }), 'Race 1 of 4');
  assert.equal(gpLabel({ race: 1, totals: { a: null, b: 'x', You: { points: 'lots', wins: {}, isPlayer: true } } }), 'Race 2 of 4 - 1st, 0 pts', 'non-numeric points count as 0');
});

test('V-30: the loading tips teach the double-tap roll only when that setting is on', async () => {
  const { TIPS, tipAt } = await import('../src/ui/select.js');
  const { DEFAULT_SETTINGS } = await import('../src/config.js');
  assert.equal(DEFAULT_SETTINGS.doubleTapRoll, false, 'the premise: double-tap roll is off by default');
  const all = (s) => TIPS.map((_, i) => tipAt(i, s));
  for (const t of [...all(DEFAULT_SETTINGS), ...all({ ...DEFAULT_SETTINGS, doubleTapRoll: true }), ...all(undefined)]) assert.ok(typeof t === 'string' && t.length > 10, 'every tip resolves to text');
  assert.ok(!all(DEFAULT_SETTINGS).some((t) => /double-tap/i.test(t)), 'off (the default): never taught');
  assert.ok(!all(undefined).some((t) => /double-tap/i.test(t)), 'no settings object: never taught');
  assert.ok(all({ ...DEFAULT_SETTINGS, doubleTapRoll: true }).some((t) => /double-tap/i.test(t)), 'on: the tip names it');
  assert.ok(/barrel roll/i.test(tipAt(1, DEFAULT_SETTINGS)) && /Q \/ E/.test(tipAt(1, DEFAULT_SETTINGS)), 'the roll tip still names the keys that always work');
  assert.equal(tipAt(TIPS.length + 2, DEFAULT_SETTINGS), tipAt(2, DEFAULT_SETTINGS), 'the index wraps');
  assert.equal(tipAt(-1, DEFAULT_SETTINGS), tipAt(TIPS.length - 1, DEFAULT_SETTINGS), 'a negative index wraps');
});

// The loading tips name the controls this player has: Q / E and "Hold B" are keyboard words; a phone has the ROLL, BOOST and ITEM buttons, a pad has LB / RB, the right trigger and B.
// Each kind is read against the rows the Controls screen prints (flight/input.js bindingsText), so renaming a control there fails here.
async function tipKit() {
  const { TIPS, tipAt, inputKind } = await import('../src/ui/select.js');
  const { createInput } = await import('../src/flight/input.js');
  globalThis.addEventListener = () => {};   // createInput registers its listeners on the window; there is none here
  let groups;
  try { groups = createInput({ settings: { pitchMode: 'flight' }, state: 'menu', events: { on() {}, emit() {} } }).bindingsText(); } finally { delete globalThis.addEventListener; }
  const rows = (g) => groups.find((x) => x.group === g).rows;
  return { TIPS, tipAt, inputKind, rows, caps: (g) => rows(g).map(([k]) => k).join(' | '), tips: (d, s = {}) => TIPS.map((_, i) => tipAt(i, s, d)) };
}
const KEY_WORDS = /Q \/ E|A \/ D|double-tap|Hold B|\bShift\b|\bCtrl\b|\bEnter\b|\bEsc\b/, SCREEN_WORDS = /ROLL buttons|BOOST button|Tap ITEM/, PAD_WORDS = /LB \/ RB|right trigger|Press B instead/;

test('loading tips on a touch screen name the on-screen buttons and no key', async () => {
  const { tips, caps } = await tipKit();
  for (const s of [{}, { doubleTapRoll: true }]) for (const t of tips('touch', s)) { assert.doesNotMatch(t, KEY_WORDS, 'a key on a phone: ' + t); assert.doesNotMatch(t, PAD_WORDS, 'a pad button on a phone: ' + t); }
  assert.deepEqual(tips('touch', { doubleTapRoll: true }), tips('touch', {}), 'double-tap A / D is a keyboard setting: it changes nothing on a phone');
  const all = tips('touch').join('\n');
  assert.match(all, /A barrel roll \(the ROLL buttons\) dodges incoming missiles\./); assert.match(all, /Tap the BOOST button in the last half second before GO/); assert.match(all, /Tap ITEM to use what you picked up/);
  assert.doesNotMatch(all, /backwards/, 'the touch controls have no fire-backwards button, so none is taught');
  for (const w of ['ROLL', 'BOOST', 'ITEM']) assert.ok(caps('Touch').includes(w), `the Controls screen lists a ${w} button: ${caps('Touch')}`);
});

test('loading tips with a gamepad name the pad buttons and no key or screen button', async () => {
  const { tips, caps, rows } = await tipKit();
  for (const s of [{}, { doubleTapRoll: true }]) for (const t of tips('pad', s)) { assert.doesNotMatch(t, KEY_WORDS, 'a key with a pad: ' + t); assert.doesNotMatch(t, SCREEN_WORDS, 'a screen button with a pad: ' + t); }
  assert.deepEqual(tips('pad', { doubleTapRoll: true }), tips('pad', {}), 'double-tap A / D is a keyboard setting: it changes nothing with a pad');
  const all = tips('pad').join('\n');
  assert.match(all, /A barrel roll \(LB \/ RB\) dodges incoming missiles\./); assert.match(all, /Tap the right trigger in the last half second before GO/); assert.match(all, /Press B instead of A to fire a missile backwards\./);
  assert.ok(caps('Gamepad').includes('LB / RB') && /^right trigger/im.test(rows('Gamepad').map(([k]) => k).join('\n')), `the Controls screen lists LB / RB and the right trigger: ${caps('Gamepad')}`);
  const act = (k) => rows('Gamepad').find(([x]) => x === k)?.[1];
  assert.equal(act('A'), 'Use item'); assert.equal(act('B'), 'Use item backwards');
});

test('loading tips on the keyboard keep their wording, and anything unknown reads as the keyboard', async () => {
  const { tips, caps, rows } = await tipKit(), { rocketTip } = await import('../src/ui/rocket-hint.js');
  const kb = tips('keys');
  assert.ok(kb.includes('A barrel roll (Q / E) dodges incoming missiles.') && kb.includes('Hold B while using a missile or mine to fire it backwards.') && kb.includes(rocketTip()), JSON.stringify(kb));
  assert.ok(tips('keys', { doubleTapRoll: true }).includes('A barrel roll (Q / E, or double-tap A / D) dodges incoming missiles.'), 'the double-tap roll is still taught to the keyboard when it is on');
  for (const d of [undefined, null, '', 'bogus', 'KEYS']) assert.deepEqual(tips(d), kb, `device ${JSON.stringify(d)} reads as the keyboard`);
  for (const t of kb) { assert.doesNotMatch(t, SCREEN_WORDS, 'a screen button on a keyboard: ' + t); assert.doesNotMatch(t, PAD_WORDS, 'a pad button on a keyboard: ' + t); }
  assert.ok(caps('Keyboard').includes('Q / E') && rows('Keyboard').some(([k, a]) => /F \/ Enter/.test(k) && /hold B/.test(a)), `the Controls screen lists Q / E and Hold B: ${caps('Keyboard')}`);
});

test('input kind for the tips: the device that last sent input decides (R2-P-05); a plugged-in pad or a touch screen left alone does not', async () => {
  const { inputKind } = await tipKit();
  assert.deepEqual(['keyboard', 'pad', 'touch'].map(inputKind), ['keys', 'pad', 'touch'], 'input.lastDevice values map to the words tipAt reads');
  for (const d of [undefined, null, '', 'mouse', 'KEYBOARD', true, 1]) assert.equal(inputKind(d), 'keys', `${JSON.stringify(d)} reads as the keyboard`);
  assert.equal(inputKind('keyboard', true), 'keys', 'a second argument (the old "pad connected" flag) no longer wins over the device in use');
  assert.equal(inputKind(undefined, true), 'keys', 'a connected pad on its own says nothing');
});

// R2-V-03 / R2-P-04: the first-race card picks its rows by name from the rows the Controls screen prints, for the device in use, and says what the keyboard steering assist does.
async function hintKit() {
  const menus = await import('../src/ui/menus.js'), { rows, caps } = await tipKit();
  const groups = ['Keyboard', 'Gamepad', 'Touch'].map((group) => ({ group, rows: rows(group) }));
  return { ...menus, groups, rows, caps };
}
const NOT_ON_THE_CARD = /airbrake|camera|look back|respawn|^use item backwards$|barrel roll: /i;   // (the keyboard's own item row says "(hold B for backwards)": that one is the item row)
test('R2-V-03: the first-race card finds every row it teaches by name, for each device, in the real Controls rows', async () => {
  const { HINT_ROWS, hintRows, groups } = await hintKit();
  assert.deepEqual(HINT_ROWS.map(([n]) => n), ['pitch', 'bank', 'roll', 'boost', 'cannon', 'item', 'pause'], 'the seven things a first-timer is told');
  for (const g of groups) {
    for (const [name, re] of HINT_ROWS) assert.ok(g.rows.some((r) => re.test(r[1])), `${g.group}: no Controls row answers "${name}" (${re}); rows: ${g.rows.map((r) => r[1]).join(' | ')}`);
    const card = hintRows(g.rows);
    assert.equal(new Set(card).size, card.length, `${g.group}: a row that answers two names shows once`);
    for (const r of card) { assert.ok(g.rows.includes(r), `${g.group}: only real rows`); assert.doesNotMatch(r[1], NOT_ON_THE_CARD, `${g.group}: not a card row: ${r[1]}`); }
    assert.ok(card.some((r) => /use item|boost, cannon, use item/i.test(r[1])), `${g.group}: the card tells how to use an item (the 8th keyboard row used to be cut off)`);
    assert.ok(card.some((r) => /^pause\b/i.test(r[1])), `${g.group}: and how to pause`);
  }
  const kb = hintRows(groups[0].rows), keysOf = (c) => c.map((r) => r[0]);
  assert.ok(keysOf(kb).some((k) => /F \/ Enter/.test(k)), 'keyboard: F / Enter uses an item: ' + keysOf(kb)); assert.equal(kb.length, 8, 'keyboard: nose down, nose up, bank, roll, boost, cannon, item, pause: ' + keysOf(kb));
  const pad = hintRows(groups[1].rows); assert.deepEqual(keysOf(pad), ['Left stick', 'LB / RB', 'Right trigger', 'X', 'A', 'Start'], 'gamepad: the pad buttons, A (not B) for the item');
  const touch = hintRows(groups[2].rows); assert.deepEqual(keysOf(touch), ['Left thumb: drag', '< ROLL / > ROLL', 'BOOST / FIRE / ITEM', 'II'], 'touch: the on-screen controls');
});

test('R2-V-03: the card follows the rows by name, not by place (a row added, moved or dropped elsewhere changes nothing)', async () => {
  const { hintRows, groups } = await hintKit();
  for (const g of groups) {
    const base = hintRows(g.rows).map((r) => r.join('|')).sort();
    assert.deepEqual(hintRows([['Hold Z', 'Brand new row'], ...g.rows.slice().reverse(), ['Q', 'Another']]).map((r) => r.join('|')).sort(), base, `${g.group}: reversed, with new rows at both ends`);
    const withoutAir = g.rows.filter((r) => !/airbrake/i.test(r[1]));
    assert.deepEqual(hintRows(withoutAir).map((r) => r.join('|')).sort(), base, `${g.group}: dropping the airbrake row (the 6th) does not shift anything`);
  }
  assert.deepEqual(hintRows([]), [], 'no rows, no card rows');
});

test('R2-V-03: the card shows the group of the device in use (input.lastDevice), the keyboard for anything else', async () => {
  const { hintGroup, groups } = await hintKit();
  assert.deepEqual(['keyboard', 'pad', 'touch'].map((d) => hintGroup(groups, d).group), ['Keyboard', 'Gamepad', 'Touch']);
  for (const d of [undefined, null, '', 'mouse', 'Pad']) assert.equal(hintGroup(groups, d).group, 'Keyboard', `${JSON.stringify(d)} reads as the keyboard`);
  assert.equal(hintGroup(groups.slice().reverse(), 'pad').group, 'Gamepad', 'found by its name, not its place');
  assert.equal(hintGroup([{ group: 'Gamepad', rows: [] }], 'touch').group, 'Gamepad', 'a missing group falls back to the first one rather than failing');
});

test('R2-P-04: the steering-assist note is true for the settings it describes: what it does and the hands-off slowing, only while it is on', async () => {
  const { assistLine, guideOn, STEER_ON } = await hintKit(), { DEFAULT_SETTINGS } = await import('../src/config.js');
  assert.equal(DEFAULT_SETTINGS.keyGuide, true, 'the premise: the keyboard guide is on by default'); assert.equal(DEFAULT_SETTINGS.assist, 'standard');
  assert.equal(guideOn(DEFAULT_SETTINGS), true); assert.equal(guideOn({ assist: 'standard', keyGuide: true }), true);
  assert.equal(guideOn({ assist: 'standard', keyGuide: false }), false, 'Standard with the steering assist off does not steer'); assert.equal(guideOn({ assist: 'pro', keyGuide: true }), false, 'Pro never steers (flight/guide.js)');
  assert.equal(guideOn({ assist: 'standard' }), true, 'a settings object without the key reads as the default (on)');
  const on = assistLine(DEFAULT_SETTINGS);
  assert.equal(on, STEER_ON); assert.match(on, /flies the course for you when you are not steering/); assert.match(on, /hold a key to take over/);
  assert.match(on, /Hands off for long and it cruises slower\./, 'the race slows a player who leaves the keys alone for long (race.js, the hands-off rule): the note says so, in plain words');
  assert.doesNotMatch(on, /Settings/, 'the card has no room for where to change it');
  const onWhere = assistLine(DEFAULT_SETTINGS, true);
  assert.equal(onWhere, STEER_ON + '\nSwitch this off in Settings.', 'the Controls screen adds a second line: where to change it');
  const off = assistLine({ assist: 'standard', keyGuide: false }, true);
  assert.match(off, /Steering assist is off/); assert.match(off, /levels itself/); assert.match(off, /\nSwitch it on in Settings/); assert.doesNotMatch(off, /flies the course|cruises slower/, 'it must not promise what is switched off, nor threaten what only the assist triggers');
  const pro = assistLine({ assist: 'pro', keyGuide: true }, true);
  assert.match(pro, /Pro assist: hands-on/); assert.doesNotMatch(pro, /flies the course|cruises slower/, 'Pro does not steer, whatever keyGuide says');
  for (const [name, t] of [['card', on], ['Controls on', onWhere], ['Controls off', off], ['Controls Pro', pro]]) {
    assert.ok(t.split('\n').length <= 2, `${name}: at most two lines`); assert.ok(t.split('\n').every((l) => l.length <= 140), `${name}: short lines`);
    assert.doesNotMatch(t, /guide|blend|keyGuide|assist mode|handsOff/i, `${name}: plain words, no internal names`);
  }
  assert.equal(on.includes('\n'), false, 'the card note is one line of text (no break)');
});

// The unrecognised-controller notice (flight/input.js emits input:padunmapped once per connect): a calm toast, in plain words, that points at the Controls screen.
test('pad notice: notice() is a calm toast (status role, its own class, no error sound) and toast() stays the red alert; the pad text is short and plain', async () => {
  const { UI, PAD_NOTICE, NOTICE_MS } = await import('../src/ui/ui.js');
  const cues = [], cls = new Set(), attrs = {};
  const ui = Object.create(UI.prototype);
  ui.game = { events: { emit: (n) => cues.push(n) } };
  ui.toastEl = { textContent: '', hidden: true, classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) }, setAttribute: (k, v) => { attrs[k] = v; } };
  try {
    ui.notice('Hello', 20);
    assert.equal(ui.toastEl.hidden, false); assert.equal(ui.toastEl.textContent, 'Hello'); assert.ok(cls.has('toast-note')); assert.equal(attrs.role, 'status'); assert.deepEqual(cues, [], 'a notice is no error: no ui:error sound');
    await new Promise((r) => setTimeout(r, 80)); assert.equal(ui.toastEl.hidden, true, 'and it goes away after its time');
    ui.toast('Boom', 20); assert.equal(cls.has('toast-note'), false); assert.equal(attrs.role, 'alert'); assert.deepEqual(cues, ['ui:error'], 'an error toast still sounds');
  } finally { clearTimeout(ui._tT); }
  assert.match(PAD_NOTICE, /^Controller not recognised: using the default layout\. Check Controls\.$/); assert.ok(PAD_NOTICE.length <= 80, 'one short line');
  assert.doesNotMatch(PAD_NOTICE, /dinput|directinput|mapping|standard|gamepad api/i, 'plain words, no internal names');
  assert.ok(NOTICE_MS >= 5000 && NOTICE_MS <= 15000, 'on screen long enough to read twice, not so long it nags: ' + NOTICE_MS);
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.toast\.toast-note\s*\{/, 'the calm look is styled'); assert.doesNotMatch(css, /\.toast\.info\b/, 'the class is not `info`: that is the aircraft details panel, whose flex column and size container squeezed the toast to a 5 px strip');
});

test('R2-V-12: no third-party game name in the shipped game files (the main footer used to name two)', () => {
  const root = fileURLToPath(new URL('../', import.meta.url)), files = [];
  (function walk(dir) { for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.name === 'tests' || e.name === 'node_modules') continue; const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs|html|css|md|json|txt)$/.test(e.name)) files.push(p); } })(root);
  assert.ok(files.length > 50, 'the scan found the game: ' + files.length);
  assert.deepEqual(files.filter((f) => /Mario|Star\s?Fox|Nintendo/i.test(readFileSync(f, 'utf8'))), [], 'copy describes the game in its own words');
});

test('V-29: parseMd reads the Markdown subset the credits use', () => {
  const md = ['# Title', '', 'A line', 'wrapped on two.', '', '- one', '- two', '  continues', '', '    code a', '    code b', '', '---', '', '## Crate', 'Crate', '=====', 'Done.'].join('\n');
  assert.deepEqual(parseMd(md), [
    { t: 'h', level: 1, text: 'Title' }, { t: 'p', text: 'A line wrapped on two.' }, { t: 'ul', items: ['one', 'two continues'] },
    { t: 'pre', text: 'code a\ncode b' }, { t: 'hr' }, { t: 'h', level: 2, text: 'Crate' }, { t: 'p', text: 'Done.' },
  ]);
  assert.deepEqual(parseMd(''), []); assert.deepEqual(parseMd(null), []);
  assert.deepEqual(parseMd('a\r\nb\r\n\r\nc'), [{ t: 'p', text: 'a b' }, { t: 'p', text: 'c' }], 'CRLF files parse too');
});

test('V-29: parseInline turns **bold**, `code` and links into tokens, and nothing else into markup', () => {
  assert.deepEqual(parseInline('see **ferrosintesis** (https://github.com/0x4D44/ferrosintesis, MIT) and `../x/` [a](https://e.com/a) end.'), [
    { t: 'text', s: 'see ' }, { t: 'b', s: 'ferrosintesis' }, { t: 'text', s: ' (' }, { t: 'a', s: 'https://github.com/0x4D44/ferrosintesis', href: 'https://github.com/0x4D44/ferrosintesis' },
    { t: 'text', s: ',' }, { t: 'text', s: ' MIT) and ' }, { t: 'code', s: '../x/' }, { t: 'text', s: ' ' }, { t: 'a', s: 'a', href: 'https://e.com/a' }, { t: 'text', s: ' end.' }]);
  assert.deepEqual(parseInline('Source: https://x.org/a.'), [{ t: 'text', s: 'Source: ' }, { t: 'a', s: 'https://x.org/a', href: 'https://x.org/a' }, { t: 'text', s: '.' }], 'the sentence full stop is not part of the link');
  assert.deepEqual(parseInline('[x](javascript:alert(1)) <img src=x onerror=alert(1)>').filter((k) => k.t !== 'text'), [], 'only http(s) becomes a link and HTML stays text');
  assert.deepEqual(parseInline('plain'), [{ t: 'text', s: 'plain' }]); assert.deepEqual(parseInline(''), []);
});

test('V-29: the real CREDITS.md shows as headings, text and links, with its repo-path front matter left out', async () => {
  const { licenceBody } = await import('../src/ui/menus.js');
  assert.equal(licenceBody('front matter\n\n---\n\nbody text'), 'body text', 'everything before the first rule is dropped');
  assert.equal(licenceBody('no rule here'), 'no rule here'); assert.equal(licenceBody(undefined), '');
  assert.equal(licenceBody('front\n\n---\n\nbody\n\n\n---\n'), 'body', 'a closing rule is dropped, so the text does not end on a bare line');
  assert.equal(licenceBody('front\n\n---'), '', 'front matter only: nothing to show');
  const md = readFileSync(new URL('../assets/music/CREDITS.md', import.meta.url), 'utf8'), body = licenceBody(md);
  assert.doesNotMatch(body, /music-src/, 'no internal repo path is shown');
  const blocks = parseMd(body);
  assert.ok(blocks.filter((b) => b.t === 'h').length >= 5, 'one heading per sample crate');
  assert.ok(blocks.every((b) => b.t !== 'h' || !/^#/.test(b.text)), 'no heading keeps its # marks');
  const kids = blocks.flatMap((b) => (b.t === 'ul' ? b.items : b.t === 'p' || b.t === 'h' ? [b.text] : [])).flatMap(parseInline);
  assert.ok(kids.every((k) => k.t !== 'text' || !/\*\*|`/.test(k.s)), 'no raw ** or backtick is left in the text');
  const links = kids.filter((k) => k.t === 'a');
  assert.ok(links.length >= 5 && links.every((k) => /^https?:\/\/\S+[^\s.,;:!?)\]]$/.test(k.href)), 'bare URLs are links without trailing punctuation');
});

test('P-04: every stat bar on the aircraft screen drives a mechanic, and a tagline that claims the lead has it', async () => {
  const THREE = await import('three');
  const { STATS } = await import('../src/ui/select.js');
  const { AIRCRAFT, getAircraft } = await import('../src/craft/roster.js');
  const { createFlightState, resetFlightState, flightParams, topSpeed } = await import('../src/flight/flight.js');
  const { applyHit } = await import('../src/race/damage.js');
  assert.deepEqual(STATS.map(([k]) => k).sort(), ['accel', 'armor', 'boost', 'handling', 'speed', 'stability'], 'the bars on screen: a new bar needs a mechanic and a check below');
  for (const a of AIRCRAFT) for (const [k, label] of STATS) assert.ok(Number.isInteger(a.stats[k]) && a.stats[k] >= 1 && a.stats[k] <= 10, `${a.id} ${label}: a whole rating 1..10 fills the bar`);
  const withStat = (id, k, v) => ({ ...getAircraft(id), stats: { ...getAircraft(id).stats, [k]: v } });
  // Five bars are read by flightParams: moving the rating must move a physical parameter, or the bar promises nothing.
  for (const [k, label] of STATS) if (k !== 'armor') assert.notDeepEqual(flightParams(withStat('falcon', k, 2)), flightParams(withStat('falcon', k, 9)), `${label}: no flight parameter reads this rating`);
  // Armour is read by damage.js: the same missile hit costs the heavily armoured craft less tumble time and less speed.
  const hit = (armor) => {
    const fs = createFlightState(withStat('falcon', 'armor', armor)); resetFlightState(fs, new THREE.Vector3(0, 500, 0), new THREE.Quaternion(), fs.params.cruise);
    const victim = { flight: fs, invuln: 0, shield: 0, finished: false, stats: { hitsTaken: 0 }, tumble: 0, empT: 0 };
    assert.ok(applyHit({ game: { events: { emit() {} } }, rng: { chance: () => true } }, victim, null, 'missile', { tumble: 1.5, loss: 0.4 }));
    return { tumble: fs.tumble.t, speed: fs.speed / fs.params.cruise };
  };
  const soft = hit(2), hard = hit(9);
  assert.ok(hard.tumble < soft.tumble && hard.speed > soft.speed, `Armour: armour 9 tumbles ${hard.tumble}s and keeps ${hard.speed.toFixed(2)} of cruise, armour 2 ${soft.tumble}s and ${soft.speed.toFixed(2)}`);
  // A tagline that says "fastest" or "best" is a claim: the craft must lead on the mechanic behind it. A new superlative has to be added here to pass.
  const claims = { manta: [/fastest in a straight line/i, (a) => topSpeed(a)], sprite: [/fastest boost recharge/i, (a) => flightParams(a).boostRegen], comet: [/savage acceleration/i, (a) => flightParams(a).accel], bulldog: [/shrugs off hits/i, (a) => a.stats.armor] };   // armour: the rating itself, its effect is checked just above
  for (const [id, [re, value]] of Object.entries(claims)) {
    const a = getAircraft(id); assert.match(a.tagline, re, `${id}: the claim this check covers is gone from the tagline: update the check`);
    const all = AIRCRAFT.map(value);
    assert.ok(Math.max(...all) > Math.min(...all), `${id}: the mechanic behind "${a.tagline}" is the same for every craft, so nothing leads`);
    assert.equal(value(a), Math.max(...all), `${id}: "${a.tagline}" claims the lead, so it must have it`);
  }
  for (const a of AIRCRAFT) if (/\b(fastest|best|most|strongest|toughest|savage)\b/i.test(a.tagline)) assert.ok(claims[a.id], `${a.id}: "${a.tagline}" makes a claim that no check covers`);
});
