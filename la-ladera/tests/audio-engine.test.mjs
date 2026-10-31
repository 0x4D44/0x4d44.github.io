// The audio engine in the real page (owner: A1): silent until a real gesture, dry (no device) under automation, the soundscape follows the place and
// the hour, volume and mode scale the master, and every way the browser can refuse us (no context, no worker, no sound at all) ends quietly.
// Quiet box: headless only, and NO real AudioContext is ever made here: the init script below swaps window.AudioContext for a stand-in built on an
// OfflineAudioContext (it renders nothing and never opens a device), counts constructions, and can be told to refuse (?acstub=refuse). It can also
// take the audio worker away (?acstub=noworker) or kill it at birth (?acstub=badworker), leaving every other Worker (Draco) alone.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/audio-engine.test.mjs
// One group per boot; run a single group with --test-name-pattern="<word from its name>" (locked, gestured, selfTest, off, live, refused, workers, absent).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

const STUB = `(() => {
  const q = location.search, st = window.__ac = { made: 0, engine: 0, refused: 0, engineRefused: 0 };
  const OAC = window.OfflineAudioContext;
  if (OAC) {
    class Fake extends OAC {
      constructor(o) {
        const mine = !!(o && o.latencyHint === 'interactive');                       // the engine's own call; the NPC babble's has no options
        if (/[?&]acstub=refuse/.test(q)) { st.refused++; if (mine) st.engineRefused++; throw new DOMException('refused by the test', 'NotAllowedError'); }
        super(2, 128, 44100); st.made++; if (mine) st.engine++;
      }
      resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); }
    }
    window.AudioContext = Fake; window.webkitAudioContext = Fake;
  }
  const RW = window.Worker, m = q.match(/[?&]acstub=(noworker|badworker)/);
  if (RW && m) {
    window.Worker = class extends RW {
      constructor(url, o) {
        if (!/audio\\/worker\\.js/.test(String(url))) { super(url, o); return; }
        if (m[1] === 'noworker') throw new DOMException('workers are not allowed here', 'SecurityError');
        const dead = { postMessage() {}, terminate() {}, onmessage: null, onerror: null };
        setTimeout(() => { try { dead.onerror && dead.onerror({ message: 'boom', preventDefault() {} }); } catch (e) {} }, 30);
        return dead;
      }
    };
  }
})();`;

const T = { timeout: 420000 };
const CORE = ['bed:wind', 'bed:traffic', 'bed:murmur', 'bed:children', 'bed:crickets', 'bed:room', 'chime', 'tick', 'bell'];
const ready = (keys) => `${JSON.stringify(keys)}.every((k) => __ladera.ctx.audio.engine.bank.has(k))`;
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const isQuiet = (m) => m === 'idle' || m === 'blocked';
let b, page;
const A = (expr, t) => page.eval(expr, t);
const boot = (q = '') => page.goto(`${b.baseUrl}/la-ladera/index.html?${q}`, { timeout: 300000 });
const gesture = async () => { for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: 640, y: 360, button: 'left', clickCount: 1 }); await tick(350); };
const clean = (what = '') => { const s = page.summary(); assert.deepEqual([s.errors, s.netErrors, s.consoleErrors, s.consoleWarnings], [[], [], [], []], 'console must stay clean ' + what); };
/** Move, let the mix settle (about 2.4 s of game time), report what the engine says. */
const mixAt = (js) => A(`(() => { ${js}; for (let i = 0; i < 12; i++) __ladera.step(6, 1 / 30); const s = __ladera.ctx.audio.state();
  return { zone: s.zone, alt: s.alt, indoor: s.indoor, cutoff: s.bedCutoff, beds: s.beds, voices: s.voices.map((v) => v.kind), master: s.master }; })()`);
const sum = (beds) => ['wind', 'traffic', 'crickets', 'murmur', 'children'].reduce((a, k) => a + (beds[k] ?? 0), 0);
const SPAWN = '__ladera.teleport(-6.5, 92.5, { yaw: 0, pitch: 0 })', MIRADOR = '__ladera.teleport(26, -91, { yaw: 0, pitch: 0 })';

before(async () => {
  b = await launch({ width: 1280, height: 720 });
  page = b.page;
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
});
after(async () => { await b?.close(); });

// ---- before any gesture ---------------------------------------------------------------------------------------------------------------------------------
test('locked: before a real gesture nothing sounds (no AudioContext, script-made events and calls are ignored, console clean)', T, async () => {
  await boot('autostart&manual');
  const s0 = await A(`({ mode: __ladera.ctx.audio.state().mode, ua: navigator.userActivation.hasBeenActive, ac: window.__ac, context: __ladera.ctx.audio.context(), out: __ladera.ctx.audio.out })`);
  assert.equal(s0.ua, false, 'precondition: the page has had no real input');
  assert.ok(isQuiet(s0.mode), s0.mode); assert.equal(s0.context, null); assert.equal(s0.out, null); assert.equal(s0.ac.made, 0);
  const s1 = await A(`(() => {
    const a = __ladera.ctx.audio;
    a.unlock(); a.unlock(new Event('click'));
    for (const t of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click', 'touchend']) window.dispatchEvent(new Event(t));      // plain events: no code, no key
    document.body.click(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    __ladera.ctx.events.emit('player:step', { surface: 'asphalt', speed: 2.6 }); __ladera.ctx.events.emit('player:land', { speed: 6, surface: 'concrete' });
    a.chime(); a.tick(); a.paper(); a.setVolume(0.5); a.setVolume(0.8); a.play('chime'); a.playAt('bell', 0, 0, 0);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    for (let i = 0; i < 10; i++) __ladera.step(6, 1 / 30);
    return { mode: a.state().mode, ac: window.__ac, context: a.context(), out: a.out, ua: navigator.userActivation.hasBeenActive, shots: a.state().activeShots, ready: a.state().samples.ready };
  })()`);
  assert.equal(s1.ua, false, 'script-made events must not count as a gesture');
  assert.ok(isQuiet(s1.mode), 'a script cannot start the engine: ' + s1.mode); assert.equal(s1.context, null); assert.equal(s1.out, null);
  assert.equal(s1.ac.made, 0, 'no AudioContext may be constructed before a real gesture'); assert.equal(s1.shots, 0); assert.equal(s1.ready, 0, 'no samples are rendered before there is a use for them');
  clean('while locked');
});

// ---- the first real gesture: one boot, five checks --------------------------------------------------------------------------------------------------------
test('gestured: a real gesture starts the engine DRY under automation and the mix follows the player', T, async (t) => {
  await boot('autostart&manual');
  await gesture();

  await t.test('dry: no device, events counted, samples rendered in the worker, console clean', async () => {
    const s = await A(`(() => { const a = __ladera.ctx.audio, st = a.state(); return { mode: st.mode, ua: navigator.userActivation.hasBeenActive, context: !!a.context(), out: !!a.out, kind: a.engine.ac.constructor.name, engine: window.__ac.engine }; })()`);
    assert.equal(s.ua, true); assert.equal(s.mode, 'dry'); assert.equal(s.context, false, 'dry mode shares no context'); assert.equal(s.out, false);
    assert.equal(s.kind, 'OfflineAudioContext'); assert.equal(s.engine, 0, 'the engine itself must not construct an AudioContext under automation');
    await page.waitFor(ready(CORE), 90000);
    const st0 = await A('__ladera.ctx.audio.state().stats');
    await A('__ladera.teleport(-6.5, 92.5, { yaw: 0, pitch: 0 }); __ladera.walk(1, 0, 3)');                   // real footfalls from the player
    await A('__ladera.walk(0, 0, 0.7, { jump: true }); __ladera.walk(0, 0, 1.5)');                              // a jump and its landing
    // the neighbours open doors of their own while the world steps: the count is read around the player's toggle alone, with nothing simulated in between
    const door = await A(`(() => { const c = __ladera.ctx, n = () => c.audio.state().stats.doors; for (const [id, st] of c.archDoors.entries()) if (st.geo && st.kind !== 'arch') { __ladera.teleport(st.geo.cx + 2, st.geo.cz + 2); __ladera.step(2); const d0 = n(); c.events.emit('door:toggle', { doorId: id, open: true, by: 'player' }); return { id, counted: n() - d0 }; } return null; })()`);
    assert.ok(door, 'the scene has a door to open');
    // the UI sounds are counted around their own calls, like the door: a discovery on the way (the sleeping dog by the first door) chimes too, and that is the game's, not this call's
    const ui = await A(`(() => { const c = __ladera.ctx, a = c.audio, s = () => a.state().stats, s0 = s(); a.chime(); a.tick(); a.paper(); c.events.emit('npc:talk', {}); c.events.emit('npc:end', {}); const s1 = s(); return { chimes: s1.chimes - s0.chimes, ticks: s1.ticks - s0.ticks }; })()`);
    const st1 = await A('__ladera.ctx.audio.state()');
    assert.ok(st1.stats.steps - st0.steps >= 4, `footsteps: ${st1.stats.steps - st0.steps}`);
    assert.ok(st1.stats.jumps - st0.jumps >= 1, 'jump'); assert.ok(st1.stats.lands - st0.lands >= 1, 'landing');
    assert.equal(door.counted, 1, 'the door in earshot'); assert.ok(st1.stats.doors - st0.doors >= 1, 'and it stays counted'); assert.equal(ui.chimes, 1, 'one chime() is one chime'); assert.equal(ui.ticks, 1, 'one tick() is one tick');
    assert.ok(st1.samples.ready >= 9 && st1.samples.via === 'worker', JSON.stringify(st1.samples));
    assert.ok(await A(`!!__ladera.ctx.audio.play('chime', { bus: 'uiBus' })`), 'a ready sample plays');
    assert.deepEqual(st1.errors, []); assert.deepEqual(st1.samples.errors, []);
    clean('after the first gesture');
  });

  await t.test('hour: crickets and a quiet street at night, traffic, talk and children by day', async () => {
    const night = await mixAt(`__ladera.setHour(2); ${SPAWN}`), noon = await mixAt('__ladera.setHour(12)');
    assert.equal(night.zone, 'plan'); assert.equal(noon.zone, 'plan');
    assert.ok(night.beds.crickets > 0.2 && noon.beds.crickets < 0.05, `crickets ${night.beds.crickets} / ${noon.beds.crickets}`);
    assert.ok(noon.beds.traffic > 0.4 && noon.beds.traffic > 2 * night.beds.traffic, `traffic ${noon.beds.traffic} / ${night.beds.traffic}`);
    assert.ok(noon.beds.murmur > 0.3 && night.beds.murmur < 0.1, `talk ${noon.beds.murmur} / ${night.beds.murmur}`);
    assert.ok(noon.beds.children > 0.1 && night.beds.children < 0.05, `children ${noon.beds.children} / ${night.beds.children}`);
    assert.ok(noon.voices.includes('school'), 'the school is audible from the street at noon: ' + noon.voices);
    assert.ok(!night.voices.includes('school'), 'and silent at 02:00: ' + night.voices);
  });

  await t.test('place: the ridge is wind and nothing else, the street is not', async () => {
    const street = await mixAt(`__ladera.setHour(12); ${SPAWN}`), ridge = await mixAt(MIRADOR);
    assert.notEqual(street.zone, ridge.zone); assert.equal(ridge.zone, 'ridge');
    assert.ok(ridge.beds.wind > 0.5 && ridge.beds.wind > 3 * street.beds.wind, `wind ${ridge.beds.wind} / ${street.beds.wind}`);
    assert.ok(ridge.beds.traffic < 0.1 && ridge.beds.murmur < 0.15, JSON.stringify(ridge.beds));
    assert.deepEqual(ridge.voices, [], 'nothing to hear at the mirador but the wind');
    assert.ok(ridge.alt > 0.8 && street.alt < 0.2, `altitude ${ridge.alt} / ${street.alt}`);
  });

  await t.test('indoors: stepping through a door closes the bed filter and lowers the outdoor beds', async () => {
    const e = await A(`(() => { const bp = __ladera.buildings().find((x) => x.entrances && x.entrances.length); const e = bp.entrances[0]; return { id: bp.id, inside: e.inside, outside: e.outside, yaw: e.yawIn ?? 0 }; })()`);
    const go = (p) => `__ladera.setHour(12); __ladera.teleport(${p[0]}, ${p[2]}, { y: ${p[1]}, yaw: ${e.yaw} })`;
    const out = await mixAt(go(e.outside)), inn = await mixAt(go(e.inside)), ctxt = JSON.stringify({ e, out, inn });
    assert.equal(out.indoor, 0, ctxt); assert.ok(out.cutoff > 10000, 'outside the filter is open: ' + out.cutoff);
    assert.equal(inn.indoor, 1, ctxt); assert.ok(inn.cutoff < 1500, 'inside it is closed: ' + inn.cutoff);
    assert.ok(sum(out.beds) > 0.2 && sum(inn.beds) < 0.6 * sum(out.beds), `outdoor beds ${sum(out.beds).toFixed(2)} outside, ${sum(inn.beds).toFixed(2)} inside`);
  });

  await t.test('volume and mode: slider, pause, title and silence scale the master', async () => {
    const master = async (js) => (await mixAt(js)).master, close = (a, c) => Math.abs(a - c) < 0.012;
    const mode = (m) => A(`__ladera.ctx.audio.engine.onMode({ mode: "${m}" })`);                       // the engine's own hook: nothing else reacts to it
    await A('__ladera.ctx.settings.set("volume", 0.5); __ladera.ctx.settings.set("volume", 0.8)'); await mode('play');
    const play = await master(SPAWN);
    assert.ok(close(play, Math.pow(0.8, 1.6) * 0.9), 'playing at 0.8: ' + play);
    await A('__ladera.ctx.settings.set("volume", 0.2)');
    assert.equal(await A('__ladera.ctx.audio.state().volume'), 0.2, 'the settings slider reaches the engine');
    assert.ok(close(await master('0'), Math.pow(0.2, 1.6) * 0.9), 'playing at 0.2');
    await A('__ladera.ctx.settings.set("volume", 0)');
    assert.equal(await master('0'), 0, 'volume 0 is silence');
    await A('__ladera.ctx.settings.set("volume", 0.8)');
    const m = {};
    for (const k of ['paused', 'panel', 'title', 'play']) { await mode(k); m[k] = await master('0'); }
    assert.ok(close(m.paused, play / 2) && close(m.panel, play / 2), `paused ${m.paused} panel ${m.panel} vs play ${play}`);
    assert.ok(close(m.title, play * 0.3), 'title ' + m.title); assert.ok(close(m.play, play), 'back to play ' + m.play);
    assert.deepEqual(await A('__ladera.ctx.audio.state().errors'), []);
    clean('while mixing');
  });
});

// ---- the drawers feature: furniture, the reader's paper and the ting of a find sound by themselves, from the events alone -----------------------------------
test('furniture: containers, the reader and the finds sound by themselves (placed at the piece, dulled by a wall, silent when far, safe on a bad event)', T, async (t) => {
  await boot('autostart&manual');
  await gesture();
  const NEED = ['sheet:0', 'sheet:1', 'paper:0', 'paper:1', 'chime', 'find:coins', 'find:watches', 'find:jewels', 'find:oddities'];
  for (const k of ['drawer', 'drawerm', 'till', 'wardrobe', 'cupboard', 'locker', 'lid', 'fridge']) for (const d of ['open', 'close']) for (const v of [0, 1]) NEED.push(`furn:${k}:${d}:${v}`);
  await A(`void __ladera.ctx.audio.engine.bank.prefetch(${JSON.stringify(NEED)})`);
  await page.waitFor(ready(NEED), 240000);
  await A(`(() => { __ladera.teleport(-6.5, 92.5, { yaw: 0, pitch: 0 }); __ladera.setHour(12); for (let i = 0; i < 6; i++) __ladera.step(6, 1 / 30);
    const e = __ladera.ctx.audio.engine; e.__rec = []; e._blockedBetween = () => false;                          // every call to play() is written down; no wall in the way unless a test says so
    const p = e.play.bind(e); e.play = (k, o) => { const s = p(k, o); e.__rec.push({ k, bus: o?.bus ?? null, lp: o?.lp ?? null, pos: o?.pos ?? null, when: o?.when ?? null, ok: !!s }); return s; }; })()`);
  /** Run js, return what the engine played meanwhile (key, bus, lowpass, position, whether it really started), its counters and its errors. */
  const take = (js) => A(`(() => { const e = __ladera.ctx.audio.engine; e.__rec.length = 0; const s0 = { ...e.stats }; ${js}; const L = e.listener;
    return { rec: e.__rec.map((r) => ({ ...r, d: r.pos ? Math.hypot(r.pos[0] - L.x, r.pos[1] - L.y, r.pos[2] - L.z) : null })), furn: e.stats.furn - s0.furn, finds: e.stats.finds - s0.finds, sheets: e.stats.sheets - s0.sheets, errors: e.errors.slice(), shots: e.activeShots, dropped: e.stats.dropped - s0.dropped }; })()`);
  /** Let the voices of the last test die out: the engine keeps at most 26 shots in flight and drops the rest (as it should), and these tests fire them faster than any player could. */
  const calm = () => page.waitFor('__ladera.ctx.audio.engine.activeShots === 0', 30000);
  const emit = (type, o, dist = 2) => `(() => { const L = __ladera.ctx.audio.engine.listener; __ladera.ctx.events.emit(${JSON.stringify(type)}, Object.assign({ id: 'test:c', building: 'T', x: L.x + ${dist}, y: L.y - 0.4, z: L.z }, ${JSON.stringify(o)})); })()`;

  await t.test('containers: each piece of furniture has its own sound, open and close differ, placed at the piece on the effects bus', async () => {
    await calm();
    const table = [['door', 'wardrobe', 'wardrobe'], ['door', 'pantry', 'cupboard'], ['door', 'medcab', 'locker'], ['drawer', 'dresser', 'drawer'], ['drawer', 'counter', 'till'], ['drawer', 'toolcab', 'drawerm'], ['lid', 'chest', 'lid'], ['fridge', 'fridge', 'fridge']];
    let n = 0;
    for (const [kind, group, sample] of table) for (const dir of ['open', 'close']) {
      const r = await take(emit(`container:${dir}`, { kind, group })); n++;
      assert.equal(r.rec.length, 1, `${kind} ${group} ${dir}: ${JSON.stringify(r.rec)}`);
      const p = r.rec[0];
      assert.match(p.k, new RegExp(`^furn:${sample}:${dir}:[01]$`), `${kind} ${group} ${dir} plays ${p.k}`);
      assert.equal(p.bus, 'sfxBus'); assert.equal(p.ok, true, `${p.k} did not start`); assert.ok(Math.abs(p.d - 2.06) < 0.1, `placed ${p.d?.toFixed(2)} m from the listener, the piece is 2.06 m away`);
      assert.ok(p.lp > 10000, `an open room: lowpass ${p.lp}`); assert.equal(r.furn, 1); assert.deepEqual(r.errors, []);
    }
    assert.equal(n, 16);
  });

  await t.test('containers: a wall in the way dulls it, beyond 40 m it is not played at all, a bad event does nothing and breaks nothing', async () => {
    await calm();
    const blocked = await take(`__ladera.ctx.audio.engine._blockedBetween = () => true; ${emit('container:open', { kind: 'door', group: 'wardrobe' }, 4)}`);
    await A('__ladera.ctx.audio.engine._blockedBetween = () => false');
    assert.equal(blocked.rec.length, 1); assert.ok(blocked.rec[0].lp <= 800, `behind a wall: lowpass ${blocked.rec[0].lp}`);
    const clear = await take(emit('container:open', { kind: 'door', group: 'wardrobe' }, 4)); assert.ok(clear.rec[0].lp > 10000, 'in the same room: ' + clear.rec[0].lp);
    const near = await take(emit('container:open', { kind: 'drawer', group: 'dresser' }, 36)); assert.equal(near.rec.length, 1, '36 m away is still in earshot'); assert.equal(near.furn, 1);
    const far = await take(emit('container:open', { kind: 'drawer', group: 'dresser' }, 45)); assert.deepEqual(far.rec, [], '45 m away'); assert.equal(far.furn, 0, 'and not even counted');
    const bad = await take(`const ev = __ladera.ctx.events; ev.emit('container:open', null); ev.emit('container:close', undefined); ev.emit('container:open', {}); ev.emit('container:open', { x: 'a', y: 1, z: 2 });
      ev.emit('container:close', { x: NaN, y: 0, z: 0 }); ev.emit('container:open', { x: 1, y: 1 }); ev.emit('container:close', { x: 1, y: 1, z: Infinity })`);
    assert.deepEqual(bad.rec, []); assert.equal(bad.furn, 0); assert.deepEqual(bad.errors, []);
    const odd = await take(emit('container:open', { kind: 'nonsense', group: 'nonsense' })); assert.equal(odd.rec.length, 1, 'an unknown piece still makes a sound'); assert.match(odd.rec[0].k, /^furn:(cupboard|drawer|locker|wardrobe|lid|fridge|till|drawerm):open:[01]$/);
    clean('after furniture events');
  });

  await t.test('reader: opening it unfolds a sheet, a page turn swishes, closing is quiet, the journal keeps the menu swish', async () => {
    await calm();
    const doc = `{ id: 'test:doc', kind: 'letter', title: 'Carta', who: 'Ana', pages: [{ es: 'Uno' }, { es: 'Dos' }, { es: 'Tres' }] }`;
    const open = await take(`__ladera.ctx.reader.open(${doc})`);
    assert.equal(await A('__ladera.ctx.reader.state().open'), true);
    assert.equal(open.rec.length, 1, JSON.stringify(open.rec)); assert.match(open.rec[0].k, /^sheet:[01]$/); assert.equal(open.rec[0].bus, 'uiBus'); assert.equal(open.rec[0].ok, true); assert.equal(open.sheets, 1);
    const turn = await take('__ladera.ctx.reader.next()'); assert.equal(turn.rec.length, 1, JSON.stringify(turn.rec)); assert.match(turn.rec[0].k, /^paper:[01]$/); assert.equal(turn.rec[0].ok, true);
    const back = await take('__ladera.ctx.reader.prev()'); assert.equal(back.rec.length, 1); assert.match(back.rec[0].k, /^paper:[01]$/, 'a page back swishes too');
    const edge = await take('__ladera.ctx.reader.prev()'); assert.deepEqual(edge.rec, [], 'the first page has no page before it: nothing turns, nothing sounds');
    const shut = await take('__ladera.ctx.reader.close()'); assert.equal(await A('__ladera.ctx.mode'), 'play'); assert.deepEqual(shut.rec, [], 'closing back into the game is quiet');
    const jr = await take('__ladera.ctx.flow.openPanel("journal")'); assert.equal(jr.rec.length, 1, JSON.stringify(jr.rec)); assert.match(jr.rec[0].k, /^paper:[01]$/, 'the journal is a menu: the small swish');
    const again = await take(`__ladera.ctx.reader.open(${doc}, { back: 'journal' })`); assert.equal(again.rec.length, 1, JSON.stringify(again.rec)); assert.match(again.rec[0].k, /^sheet:[01]$/, 'a paper opened from the journal unfolds a sheet');
    await A('__ladera.ctx.reader.close(); if (__ladera.ctx.flow.current) __ladera.ctx.flow.closePanel(); if (__ladera.ctx.mode !== "play") __ladera.ctx.flow.resume?.()');
    assert.equal(await A('__ladera.ctx.mode'), 'play'); assert.deepEqual((await take('0')).errors, []);
    clean('after the reader');
  });

  await t.test('finds: each collection has its ting, the rare ones add the discovery chime a moment later, the toast asks for it, a bad call is safe', async () => {
    await calm();
    const mark = (id, o) => take(`__ladera.ctx.discover.mark(Object.assign({ id: ${JSON.stringify(id)}, kind: 'hallazgo', name: 'Cosa', en: 'Thing' }, ${JSON.stringify(o)}))`);
    for (const col of ['coins', 'watches', 'jewels', 'oddities']) {
      const r = await mark(`test:find:${col}`, { collection: col, rarity: 1 });
      assert.equal(r.finds, 1, `${col}: counted`); assert.deepEqual(r.rec.map((x) => x.k), [`find:${col}`], `${col}: ${JSON.stringify(r.rec)}`); assert.equal(r.rec[0].bus, 'uiBus'); assert.equal(r.rec[0].ok, true, `${col}: the ting did not start (${r.shots} voices in flight, ${r.dropped} dropped) ${JSON.stringify(r.rec)}`);
    }
    const rare = await mark('test:find:rare', { collection: 'watches', rarity: 3 });
    assert.deepEqual(rare.rec.map((x) => x.k), ['find:watches', 'chime'], JSON.stringify(rare.rec)); assert.ok(rare.rec[1].when > 0.1 && rare.rec[1].when < 0.4, 'the chime follows the ting: ' + rare.rec[1].when);
    const direct = await take(`const a = __ladera.ctx.audio; a.find({ collection: 'jewels', rarity: 2 }); a.find({ collection: 'nonsense' }); a.find(); a.find(null); a.sheet()`);
    assert.deepEqual(direct.rec.map((x) => x.k).filter((k) => !/^sheet/.test(k)), ['find:jewels', 'find:coins', 'find:coins', 'find:coins'], JSON.stringify(direct.rec)); assert.equal(direct.finds, 4); assert.equal(direct.sheets, 1); assert.deepEqual(direct.errors, []);
    clean('after the finds');
  });

  await t.test('samples: the furniture, sheet and find sounds are on the list rendered ahead of time (so the first drawer is not silent)', async () => {
    const w = await A(`(() => { const e = __ladera.ctx.audio.engine, was = e.o.full; e.o.full = true; try { return e._wanted(); } finally { e.o.full = was; } })()`);
    const missing = NEED.filter((k) => !w.includes(k)); assert.deepEqual(missing, [], 'rendered ahead of the first use');
    assert.deepEqual(await A('__ladera.ctx.audio.state().samples.errors'), []); assert.deepEqual(await A('__ladera.ctx.audio.state().errors'), []);
  });
});

test('selfTest: four offline scenes through the real graph, no gesture and no device (finite, below full scale, the right character)', T, async () => {
  await boot('autostart&manual');
  const r = await A(`__ladera.ctx.audio.selfTest({ seconds: 2 }).then((r) => ({ ok: r.ok, scenes: r.scenes, samples: r.samples, mode: __ladera.ctx.audio.state().mode, made: window.__ac.made }))`, 240000);
  assert.equal(r.ok, true, JSON.stringify(r.scenes.filter((s) => !s.ok)));
  assert.ok(isQuiet(r.mode), 'a self test is not a gesture: ' + r.mode); assert.equal(r.made, 0);
  assert.deepEqual(r.scenes.map((s) => s.name), ['spawn-day', 'mirador-day', 'plaza-night', 'spawn-indoors']);
  const by = Object.fromEntries(r.scenes.map((s) => [s.name, s]));
  for (const s of r.scenes) {
    assert.equal(s.finite, true, s.name); assert.ok(s.peak > 0.05 && s.peak <= 1, `${s.name} peak ${s.peak}`);
    assert.ok(s.dbfs > -45 && s.dbfs < -8, `${s.name} level ${s.dbfs} dBFS`); assert.ok(s.ambDbfs > -50 && s.ambDbfs < -12, `${s.name} ambience ${s.ambDbfs} dBFS`);
    assert.ok(Math.abs(s.dc) < 0.01, `${s.name} DC offset ${s.dc}`); assert.deepEqual(s.errors, [], s.name);
  }
  assert.ok(by['mirador-day'].beds.wind > 0.5 && by['mirador-day'].beds.wind > 3 * by['mirador-day'].beds.traffic, 'the mirador is wind, not traffic: ' + JSON.stringify(by['mirador-day'].beds));
  assert.ok(by['plaza-night'].beds.crickets > 0.3 && by['plaza-night'].beds.crickets > 2 * by['plaza-night'].beds.murmur, 'the plaza at night is crickets: ' + JSON.stringify(by['plaza-night'].beds));
  assert.ok(by['spawn-day'].beds.traffic > 0.4, 'the street is busy by day: ' + JSON.stringify(by['spawn-day'].beds));
  assert.ok(by['spawn-day'].bedCutoff > 10000 && by['spawn-indoors'].bedCutoff < 1500, `indoors is dull: ${by['spawn-day'].bedCutoff} vs ${by['spawn-indoors'].bedCutoff}`);
  assert.deepEqual(r.samples.errors, []);
  clean('after selfTest');
});

// ---- the ways it can be switched off or refused -----------------------------------------------------------------------------------------------------
test('off: ?audio=0 switches the engine off for good (no context, no events, every call still safe)', T, async () => {
  await boot('autostart&manual&audio=0');
  await gesture();
  const r = await A(`(() => {
    const a = __ladera.ctx.audio, ev = __ladera.ctx.events;
    const un = a.unlock(); ev.emit('player:step', { surface: 'asphalt' }); ev.emit('door:toggle', { doorId: 'x', open: true });
    const calls = [a.chime(), a.tick(), a.paper(), a.play('chime'), a.playAt('bell', 0, 0, 0), a.ring(3)];
    a.setVolume(0.3); for (let i = 0; i < 6; i++) __ladera.step(6, 1 / 30);
    const st = a.state(); return { un, mode: st.mode, ctxState: st.ctxState, steps: st.stats.steps, ready: st.samples.ready, context: a.context(), engine: window.__ac.engine, calls: calls.map((c) => !!c), volume: st.volume };
  })()`);
  assert.equal(r.un, 'off'); assert.equal(r.mode, 'off'); assert.equal(r.ctxState, null); assert.equal(r.context, null); assert.equal(r.engine, 0);
  assert.equal(r.steps, 0, 'an off engine does not even listen'); assert.equal(r.ready, 0); assert.deepEqual(r.calls, [false, false, false, false, false, false]); assert.equal(r.volume, 0.3);
  clean('with audio off');
});

test('live: ?audio=live uses a real-mode context (here a stand-in): one context for any number of gestures, graph built, calls play, console clean', T, async () => {
  await boot('autostart&manual&audio=live');
  const before = await A('({ mode: __ladera.ctx.audio.state().mode, engine: window.__ac.engine })');
  assert.ok(isQuiet(before.mode)); assert.equal(before.engine, 0);
  await gesture(); await gesture();
  const s = await A(`(() => { const a = __ladera.ctx.audio, st = a.state(); return { mode: st.mode, engine: window.__ac.engine, context: !!a.context(), out: a.out?.constructor?.name, kind: a.context()?.constructor?.name, ctxState: st.ctxState, errors: st.errors }; })()`);
  assert.equal(s.mode, 'live'); assert.equal(s.engine, 1, 'two gestures, one context'); assert.equal(s.context, true); assert.equal(s.out, 'GainNode'); assert.equal(s.kind, 'Fake');
  await page.waitFor(ready(['chime', 'tick', 'bed:wind', 'bed:traffic']), 120000);
  const r = await A(`(() => {
    const a = __ladera.ctx.audio; for (let i = 0; i < 20; i++) __ladera.step(6, 1 / 30);
    const played = !!a.play('chime', { bus: 'uiBus' }), tick = !!a.tick(); a.setVolume(0.4);
    document.dispatchEvent(new Event('visibilitychange'));                                    // the tab-hidden handler of the live path
    for (let i = 0; i < 5; i++) __ladera.step(6, 1 / 30);
    const st = a.state(); return { played, tick, mode: st.mode, shots: st.activeShots, beds: Object.keys(st.beds), errors: st.errors, volume: st.volume };
  })()`);
  assert.equal(r.played, true); assert.equal(r.tick, true); assert.equal(r.mode, 'live'); assert.ok(r.shots >= 2, 'voices: ' + r.shots);
  assert.ok(['wind', 'traffic'].every((k) => r.beds.includes(k)), 'the beds start: ' + r.beds); assert.deepEqual(r.errors, []); assert.equal(r.volume, 0.4);
  clean('in live mode');
});

test('refused: a browser that refuses the AudioContext ends in "failed" (one attempt, no retry on later gestures, every call safe, console clean)', T, async () => {
  await boot('autostart&manual&audio=live&acstub=refuse');
  await gesture();
  const s = await A(`(() => { const a = __ladera.ctx.audio, st = a.state(); return { mode: st.mode, errors: st.errors, tries: window.__ac.engineRefused, context: a.context() }; })()`);
  assert.equal(s.mode, 'failed'); assert.equal(s.tries, 1); assert.equal(s.context, null); assert.ok(s.errors.some((e) => /unlock/.test(e) && /refused/.test(e)), JSON.stringify(s.errors));
  await gesture();
  const r = await A(`(() => {
    const a = __ladera.ctx.audio, ev = __ladera.ctx.events, un = a.unlock();
    ev.emit('player:step', { surface: 'wood' }); ev.emit('player:land', { speed: 5 }); a.chime(); a.tick(); a.paper(); a.setVolume(0.6); a.ring(2); a.play('chime'); a.playAt('bell', 1, 2, 3);
    for (let i = 0; i < 10; i++) __ladera.step(6, 1 / 30);
    return { un, mode: a.state().mode, tries: window.__ac.engineRefused, chimes: a.state().stats.chimes };
  })()`);
  assert.equal(r.un, 'failed'); assert.equal(r.mode, 'failed'); assert.equal(r.tries, 1, 'it does not keep knocking'); assert.equal(r.chimes, 1);
  clean('after a refused context');
});

test('workers: no audio Worker (or one that dies at birth) falls back to rendering on the main thread: same samples, no errors in the page', T, async () => {
  for (const stub of ['noworker', 'badworker']) {
    await boot(`autostart&manual&acstub=${stub}`);
    await gesture();
    await page.waitFor(ready(CORE), 120000);
    const s = await A('(() => { const st = __ladera.ctx.audio.state(); return { mode: st.mode, via: st.samples.via, ready: st.samples.ready, errors: st.errors, bankErrors: st.samples.errors }; })()');
    assert.equal(s.mode, 'dry', stub); assert.equal(s.via, 'main', stub); assert.ok(s.ready >= 9, `${stub}: ${s.ready}`); assert.deepEqual(s.errors, [], stub);
    if (stub === 'badworker') assert.ok(s.bankErrors.some((e) => /boom/.test(e)), 'the worker failure is recorded: ' + JSON.stringify(s.bankErrors)); else assert.deepEqual(s.bankErrors, [], stub);
    clean('with ' + stub);
  }
});

test('absent: the game still plays when ctx.audio is absent (start button, volume slider and a discovery chime all tolerate it)', T, async () => {
  await boot('manual');
  await A('__ladera.ctx.audio = undefined');
  await A('document.getElementById("start").click()'); await tick(300);
  await A('__ladera.ctx.settings.set("volume", 0.3)');
  await A('__ladera.ctx.events.emit("discover", { id: "audio-test-spot", name: "Prueba", en: "Test" })'); await tick(200);
  assert.equal(await A('__ladera.ctx.mode'), 'play'); assert.equal(await A('__ladera.ctx.errors.length'), 0);
  assert.equal(await A('__ladera.state().audio'), null);
  clean('without ctx.audio');
});
