// Text-to-speech: voice ranking (es-CO first), voice choice per person, the subtitle-only fallback, and the rule that an AudioContext is only created or
// resumed for a trusted gesture (a script-made event trips the browser's "AudioContext was not allowed to start" console warning).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-speech.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { langRank, rankVoices, pickVoice, voiceGender, Speech, LANG_RANK } from '../js/people/speech.js';

const V = (name, lang, local = true) => ({ name, lang, localService: local, voiceURI: name });

function fakeBrowser({ voices = [], activation = false } = {}) {
  const spoken = [], listeners = {}, ctxs = [];
  class AC { constructor() { this.state = 'suspended'; ctxs.push(this); } resume() { this.state = 'running'; } }
  class Utt { constructor(text) { this.text = text; } }
  const synth = { getVoices: () => voices, speak: (u) => spoken.push(u), cancel() {}, addEventListener() {} };
  const win = { speechSynthesis: synth, AudioContext: AC, addEventListener: (t, f) => { (listeners[t] ??= []).push(f); }, removeEventListener: (t, f) => { listeners[t] = (listeners[t] ?? []).filter((x) => x !== f); } };
  const saved = { window: globalThis.window, nav: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), U: globalThis.SpeechSynthesisUtterance };
  globalThis.window = win; globalThis.SpeechSynthesisUtterance = Utt;
  Object.defineProperty(globalThis, 'navigator', { value: { userActivation: { hasBeenActive: activation } }, configurable: true, writable: true });
  const restore = () => {
    if (saved.window === undefined) delete globalThis.window; else globalThis.window = saved.window;
    if (saved.U === undefined) delete globalThis.SpeechSynthesisUtterance; else globalThis.SpeechSynthesisUtterance = saved.U;
    if (saved.nav) Object.defineProperty(globalThis, 'navigator', saved.nav); else delete globalThis.navigator;
  };
  return { win, spoken, listeners, ctxs, restore };
}
const toasts = () => { const t = []; return { toast: (m) => t.push(m), list: t }; };

test('language rank: es-CO > es-MX > es-US > es-419 > es-AR > es-CL > es-ES > any other Spanish > not Spanish', () => {
  assert.deepEqual(LANG_RANK, ['es-CO', 'es-MX', 'es-US', 'es-419', 'es-AR', 'es-CL', 'es-ES']);
  const order = ['es-CO', 'es-MX', 'es-US', 'es-419', 'es-AR', 'es-CL', 'es-ES', 'es-VE', 'en-US'].map(langRank);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `rank ${i}: ${order}`);
  assert.equal(langRank('es_CO'), 0, 'underscore spelling'); assert.equal(langRank('ES-co'), 0, 'case does not matter'); assert.equal(langRank('en-GB'), 100);
});

test('rankVoices keeps Spanish voices only, best language first, local before network', () => {
  const r = rankVoices([V('a', 'en-US'), V('b', 'es-ES'), V('c', 'es-MX', false), V('d', 'es-MX', true), V('e', 'es-CO'), V('f', 'fr-FR'), V('g', 'es-VE')]);
  assert.deepEqual(r.map((v) => v.name), ['e', 'd', 'c', 'b', 'g']);
  assert.deepEqual(rankVoices([V('a', 'en-US')]), []);
});

test('pickVoice stays in the best language group, prefers the speaker\'s gender and spreads people over the voices', () => {
  const ranked = rankVoices([V('Microsoft Sabina', 'es-MX'), V('Microsoft Raul', 'es-MX'), V('Microsoft Helena', 'es-MX'), V('Colombian Voice', 'es-CO'), V('Elvira', 'es-ES')]);
  assert.equal(pickVoice(ranked, { gender: 'f', seed: 3 }).lang, 'es-CO', 'es-CO wins whatever the gender');
  const mx = rankVoices([V('Microsoft Sabina', 'es-MX'), V('Microsoft Raul', 'es-MX'), V('Microsoft Helena', 'es-MX')]);
  for (let s = 0; s < 9; s++) { assert.equal(voiceGender(pickVoice(mx, { gender: 'f', seed: s })), 'f'); assert.equal(voiceGender(pickVoice(mx, { gender: 'm', seed: s })), 'm'); }
  assert.notEqual(pickVoice(mx, { gender: 'f', seed: 0 }).name, pickVoice(mx, { gender: 'f', seed: 1 }).name, 'two women get different voices when there are two');
  assert.equal(pickVoice([], {}), null);
  assert.equal(pickVoice(mx, { preferURI: 'Microsoft Raul' }).name, 'Microsoft Raul', 'the settings panel choice wins');
});

test('speak(): utterance uses the best Spanish voice, its language, and the persona pitch and rate', async () => {
  const b = fakeBrowser({ voices: [V('Elvira', 'es-ES'), V('Microsoft Sabina', 'es-MX'), V('Paola', 'es-CO'), V('Zira', 'en-US')] });
  try {
    const sp = new Speech({ ui: toasts() }).init();
    assert.equal(sp.ready, true); assert.equal(sp.available, true);
    const rec = sp.speak('Buenas tardes, ¿cómo le va?', { pitch: 1.38, rate: 1.06, gender: 'f', seed: 4 });
    await new Promise((r) => setTimeout(r, 90));
    assert.equal(b.spoken.length, 1, 'one utterance reached speechSynthesis');
    const u = b.spoken[0]; assert.equal(u.text, 'Buenas tardes, ¿cómo le va?'); assert.equal(u.lang, 'es-CO'); assert.equal(u.voice.name, 'Paola');
    assert.ok(Math.abs(u.pitch - 1.38) < 1e-9 && Math.abs(u.rate - 1.06) < 1e-9, `pitch ${u.pitch} rate ${u.rate}`);
    assert.equal(rec.mode, 'tts'); sp.cancel();
  } finally { b.restore(); }
});

test('no Spanish voice: subtitles only, one explanation toast, no utterance, never a crash', async () => {
  const b = fakeBrowser({ voices: [V('Zira', 'en-US')] }), t = toasts();
  try {
    const sp = new Speech({ ui: t }).init(); sp.babble = false;
    assert.equal(sp.reason, 'novoice'); assert.equal(sp.available, false);
    const a = sp.speak('Hola.'); const c = sp.speak('Otra vez.');
    assert.equal(a.mode, 'fallback'); assert.equal(c.mode, 'fallback'); assert.equal(b.spoken.length, 0);
    assert.equal(t.list.length, 1, 'the explanation is shown once'); assert.match(t.list[0], /No hay voz en español.*No Spanish voice/);
    sp.cancel();
  } finally { b.restore(); }
});

test('AudioContext: only a trusted gesture (or earlier sticky activation) may create or resume one', () => {
  const b = fakeBrowser({ voices: [], activation: false });
  try {
    const sp = new Speech({});
    assert.equal(sp._activated({ isTrusted: false }), false, 'a script-made event does not count'); assert.equal(sp._activated(null), false);
    assert.equal(sp._audio(true, { isTrusted: false }), null); assert.equal(b.ctxs.length, 0, 'no AudioContext for a synthetic event');
    assert.equal(sp._audio(true, null), null); assert.equal(b.ctxs.length, 0);
    const ac = sp._audio(true, { isTrusted: true }); assert.ok(ac); assert.equal(b.ctxs.length, 1, 'created for a real key press / click');
    assert.equal(sp._audio(true, { isTrusted: true }), ac, 'and reused after');
  } finally { b.restore(); }
  const c = fakeBrowser({ activation: true });
  try { const sp = new Speech({}); assert.equal(sp._activated(null), true, 'the page was used before'); assert.ok(sp._audio(true, null)); assert.equal(c.ctxs.length, 1); } finally { c.restore(); }
});

test('AudioContext: the game\'s own context is reused and ours is never created', () => {
  const b = fakeBrowser({ activation: true });
  try {
    const own = { state: 'running' };
    const sp = new Speech({ audio: { context: () => own } });
    assert.equal(sp._audio(true, { isTrusted: true }), own); assert.equal(b.ctxs.length, 0);
  } finally { b.restore(); }
});

test('the unlock listener ignores script-made events and keeps waiting for a real one', () => {
  const b = fakeBrowser({ activation: false });
  try {
    const sp = new Speech({}).init();
    const handlers = b.listeners.pointerdown ?? []; assert.equal(handlers.length, 1);
    handlers[0]({ isTrusted: false });
    assert.equal(b.ctxs.length, 0); assert.equal((b.listeners.pointerdown ?? []).length, 1, 'still listening after a synthetic event');
    handlers[0]({ isTrusted: true });
    assert.equal(b.ctxs.length, 1); assert.equal((b.listeners.pointerdown ?? []).length, 0, 'done after the first real gesture');
    assert.ok(sp);
  } finally { b.restore(); }
});
