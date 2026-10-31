// Text-to-speech: voice ranking (es-CO first), voice choice per person, the subtitle-only fallback, and the rule that an AudioContext is only created or
// resumed for a trusted gesture (a script-made event trips the browser's "AudioContext was not allowed to start" console warning).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-speech.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { langRank, rankVoices, pickVoice, voiceGender, pitchFor, Speech, LANG_RANK } from '../js/people/speech.js';
import { voiceFor, AGE } from '../js/people/personas.js';

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

test('one voice for everybody (Chrome with no Spanish speech packs: "Google español", women, no gendered name): men are deeper, grandfathers deepest, boys and women untouched', async () => {
  const google = rankVoices([V('Google español', 'es-ES', false), V('Google español de Estados Unidos', 'es-US', false)]);
  assert.equal(voiceGender(google[0]), '?', 'the premise: neither name says a gender'); assert.equal(google[0].name, 'Google español de Estados Unidos', 'and es-US is the one everybody gets');
  const ids = Array.from({ length: 60 }, (_, i) => 'n' + i), P = (g, a) => ids.map((id) => pitchFor(google[0], voiceFor(id, g, a)));
  const men = P('m', 'adult'), women = P('f', 'adult'), elders = P('m', 'elder'), grandmas = P('f', 'elder'), boys = P('m', 'kid'), girls = P('f', 'kid');
  assert.ok(Math.max(...men) <= 0.76, `a man at ${Math.max(...men).toFixed(2)}`); assert.ok(Math.min(...men) >= 0.55);
  assert.ok(Math.min(...women) >= 0.88, `a woman at ${Math.min(...women).toFixed(2)}`);
  assert.ok(Math.min(...women) - Math.max(...men) >= 0.14, 'the sexes do not overlap on one voice');
  assert.ok(Math.max(...elders) < Math.min(...men) + 0.05 && Math.max(...elders) <= 0.66, `a grandfather at ${Math.max(...elders).toFixed(2)}`); assert.ok(Math.min(...elders) >= 0.55);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(mean(grandmas) < mean(women) - 0.1, 'a grandmother is deeper than a woman (on average: every voice has its own spread)'); assert.ok(Math.min(...boys) >= 1.1 && Math.min(...girls) >= 1.1, 'children are high, boys included');
  assert.ok(Math.min(...boys) >= Math.min(...girls) * 0.9);
  assert.ok(AGE.kid.pitch - AGE.elder.pitch >= 0.55, 'the spread by age is wide');
  // a voice that IS a man's keeps the man's pitch; a woman on a man's voice is raised; a named woman's voice is left alone
  const raul = V('Microsoft Raul', 'es-MX'), sabina = V('Microsoft Sabina', 'es-MX');
  const vm = voiceFor('n7', 'm', 'adult'), vf = voiceFor('n7', 'f', 'adult');
  assert.equal(pitchFor(raul, vm), vm.pitch); assert.ok(pitchFor(raul, vf) > vf.pitch * 1.25); assert.equal(pitchFor(sabina, vf), vf.pitch); assert.ok(pitchFor(sabina, vm) < vm.pitch * 0.75);
  assert.equal(pitchFor(raul, voiceFor('n7', 'f', 'kid')), voiceFor('n7', 'f', 'kid').pitch, 'a girl is not raised on a man\'s voice');
  assert.equal(pitchFor(null, { pitch: 1, gender: 'm' }), 0.72, 'no voice at all (the babble): a man is lower than a woman'); assert.equal(pitchFor(google[0], { pitch: 1 }), 1, 'a reader without a sex or age is untouched');
  // the utterance carries it
  const b = fakeBrowser({ voices: [V('Google español', 'es-ES', false), V('Google español de Estados Unidos', 'es-US', false)] });
  try {
    const sp = new Speech({ ui: toasts() }).init(), say = async (o) => { const n = b.spoken.length; sp.speak('Buenas tardes.', o); await new Promise((r) => setTimeout(r, 70)); return b.spoken[n]; };
    const um = await say(vm), uf = await say(vf), ub = await say(voiceFor('n7', 'm', 'kid'));
    assert.equal(um.voice.name, 'Google español de Estados Unidos'); assert.equal(uf.voice.name, um.voice.name, 'the one voice');
    assert.ok(Math.abs(um.pitch - pitchFor(google[0], vm)) < 1e-9 && um.pitch < 0.8, `the man's utterance at ${um.pitch}`); assert.ok(uf.pitch >= 0.9 && ub.pitch >= 1.2, `woman ${uf.pitch}, boy ${ub.pitch}`);
    assert.ok(uf.pitch - um.pitch >= 0.2, 'on the same voice the woman is clearly higher'); sp.cancel();
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
