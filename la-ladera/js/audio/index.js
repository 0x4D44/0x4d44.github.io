// Audio entry (owner: A1). `initAudio(ctx)` publishes `ctx.audio` at once and wires the game's events to the engine; nothing sounds (and no
// AudioContext exists) until the person has really used the page, so a script-made event can never provoke the browser's autoplay warning.
//
//   ctx.audio.context()   the live AudioContext, or null (blocked, dry under automation, unsupported). Other modules share it: ctx.audio?.context?.()
//   ctx.audio.out         a GainNode into the master bus for other modules' own sounds (null while there is no live context)
//   ctx.audio.unlock(e)   start on a real gesture (the window listeners below do it too); returns the mode
//   ctx.audio.setVolume(v) chime() tick() paper()   master volume 0..1, discovery chime, UI tick, paper swish
//   ctx.audio.state()     { mode: idle|blocked|live|dry|off|failed|unsupported, zone, beds, voices, stats, samples, errors, ... } (also in __ladera.state().audio)
//   ctx.audio.selfTest()  render a few offline scenes through the real graph and measure them (no sound, no gesture needed)
// URL: ?audio=0 turns the engine off, ?audio=live forces a real context even under automation.
import { AudioEngine } from './engine.js';
import { selfTest } from './selftest.js';

const flag = (k) => { try { return new URLSearchParams(location.search).get(k); } catch { return null; } };

export function initAudio(ctx) {
  const engine = new AudioEngine(ctx, { live: flag('audio') === 'live' });
  if (flag('audio') === '0' || flag('audio') === 'off') engine.mode = 'off';
  const api = {
    get mode() { return engine.mode; },
    get ac() { return engine.live ? engine.ac : null; },
    get out() { return engine.live ? engine.n.out : null; },
    context: () => (engine.live ? engine.ac : null),
    unlock: (e) => engine.unlock(e),
    setVolume: (v) => engine.setVolume(v),
    chime: () => engine.chime(), tick: () => engine.tick(), paper: () => engine.paper(),
    play: (key, o) => engine.play(key, o), playAt: (key, x, y, z, o) => engine.playAt(key, x, y, z, o), ring: (n) => engine.ring(n),
    state: () => engine.state(),
    selfTest: (o) => selfTest(engine, o),
  };
  Object.defineProperty(api, 'engine', { value: engine });                 // reachable for tests, never serialised
  ctx.audio = api;
  engine.setVolume(ctx.settings?.v?.volume ?? 0.8);
  if (engine.mode === 'off' || typeof window === 'undefined') return api;

  // a real gesture anywhere starts the engine (and wakes it again if the browser suspended it); script-made events are ignored
  const gesture = (e) => { if (e.isTrusted) engine.unlock(e); };
  for (const t of ['pointerdown', 'pointerup', 'keydown', 'keyup', 'touchend', 'click']) window.addEventListener(t, gesture, { capture: true, passive: true });

  const ev = ctx.events;
  ev.on('player:step', (e) => engine.onStep(e));
  ev.on('player:land', (e) => engine.onLand(e));
  ev.on('player:jump', () => engine.onJump());
  ev.on('door:toggle', (e) => engine.onDoor(e));
  ev.on('mode', (e) => engine.onMode(e));
  ev.on('npc:talk', () => engine.onTalk(true));
  ev.on('npc:end', () => engine.onTalk(false));
  // a small tick when a button is pressed (trusted clicks only: a test script clicking a hundred buttons stays silent)
  document.addEventListener('click', (e) => { if (e.isTrusted && engine.running && e.target?.closest?.('button, .btn, [role="button"], select, summary')) engine.tick(); }, true);

  ctx.addSystem('audio', (dt) => engine.update(dt), 15);                   // runs while playing
  setInterval(() => { if (!ctx.running && engine.running && !document.hidden) engine.update(0.25); }, 250);     // title, pause and panels keep their (muffled) ambience
  return api;
}
