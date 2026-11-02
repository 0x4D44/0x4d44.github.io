// Text-to-speech: voice ranking (es-CO first), voice choice per person, the subtitle-only fallback, and the rule that an AudioContext is only created or
// resumed for a trusted gesture (a script-made event trips the browser's "AudioContext was not allowed to start" console warning).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-speech.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { langRank, rankVoices, pickVoice, chooseVoice, voiceCast, voiceGender, pitchFor, Speech, LANG_RANK } from '../js/people/speech.js';
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

test('one voice for everybody (Chrome with one Spanish speech pack: "Google español de Estados Unidos", a woman, no gendered name): men are deeper, grandfathers deepest, boys and women untouched', async () => {
  const google = rankVoices([V('Google español', 'es-ES', false), V('Google español de Estados Unidos', 'es-US', false)]);
  assert.equal(voiceGender(google[0]), '?', 'the premise: neither name says a gender'); assert.equal(google[0].name, 'Google español de Estados Unidos', 'and es-US ranks first (alone, it is the one everybody gets)');
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
  // the utterance carries it (with one voice; two have voices of their own, below)
  const b = fakeBrowser({ voices: [V('Google español de Estados Unidos', 'es-US', false)] });
  try {
    const sp = new Speech({ ui: toasts() }).init(), say = async (o) => { const n = b.spoken.length; sp.speak('Buenas tardes.', o); await new Promise((r) => setTimeout(r, 70)); return b.spoken[n]; };
    const um = await say(vm), uf = await say(vf), ub = await say(voiceFor('n7', 'm', 'kid'));
    assert.equal(um.voice.name, 'Google español de Estados Unidos'); assert.equal(uf.voice.name, um.voice.name, 'the one voice');
    assert.ok(Math.abs(um.pitch - pitchFor(google[0], vm)) < 1e-9 && um.pitch < 0.8, `the man's utterance at ${um.pitch}`); assert.ok(uf.pitch >= 0.9 && ub.pitch >= 1.2, `woman ${uf.pitch}, boy ${ub.pitch}`);
    assert.ok(uf.pitch - um.pitch >= 0.2, 'on the same voice the woman is clearly higher'); sp.cancel();
  } finally { b.restore(); }
});

// ---- two voices or more: a woman and a man each get voices of their own (round 6 R3-109: with Chrome's "Google español" and "Google español de Estados Unidos" all 34 speakers had the es-US voice, and every man
// was that woman at 0.62 to 0.73, so that everybody sounded like one actor)
const ID60 = Array.from({ length: 60 }, (_, i) => 'n' + i), SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 5);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const who = (ranked, gender) => [...new Set(SEEDS.map((seed) => pickVoice(ranked, { gender, seed }).name))].sort();       // every voice the sex gets, over many persons

test('two Spanish voices with no gendered name (Chrome\'s es-ES and es-US): the women have the better language, the men the other voice, and no grown-up is pitched outside 0.85 to 1.1', () => {
  const ranked = rankVoices([V('Google español', 'es-ES', false), V('Google español de Estados Unidos', 'es-US', false)]);
  assert.deepEqual(who(ranked, 'f'), ['Google español de Estados Unidos']); assert.deepEqual(who(ranked, 'm'), ['Google español'], 'not the women\'s voice lowered');
  assert.equal(chooseVoice(ranked, { gender: 'f' }).apart, true); assert.equal(chooseVoice(ranked, { gender: 'm' }).apart, true);
  const P = (g, a) => ID60.map((id) => { const o = voiceFor(id, g, a), { voice, apart } = chooseVoice(ranked, { gender: g, seed: o.seed }); return pitchFor(voice, { ...o, apart }); });
  for (const [g, a] of [['m', 'adult'], ['f', 'adult'], ['m', 'elder'], ['f', 'elder']]) { const p = P(g, a); assert.ok(Math.min(...p) >= 0.85 - 1e-9 && Math.max(...p) <= 1.1 + 1e-9, `${g} ${a}: ${Math.min(...p).toFixed(2)} to ${Math.max(...p).toFixed(2)}`); }
  assert.ok(mean(P('f', 'adult')) - mean(P('m', 'adult')) >= 0.04, 'the man is still a little deeper than the woman');
  assert.ok(Math.min(...P('m', 'kid')) >= 1.1 && Math.min(...P('f', 'kid')) >= 1.1 && Math.min(...P('m', 'teen')) >= 0.9, 'children stay high, and a teenage boy is not lowered: the band is for grown-ups');
});

test('named voices: a woman gets a woman\'s name and a man a man\'s, in the best language (es-CO, es-MX, es-419 before es-ES); several of one sex share the people out', () => {
  const all = [V('Microsoft Helena', 'es-ES'), V('Microsoft Pablo', 'es-ES'), V('Microsoft Sabina', 'es-MX'), V('Microsoft Raul', 'es-MX'), V('Microsoft Salome Online', 'es-CO'), V('Microsoft Gonzalo Online', 'es-CO'),
    V('Camila', 'es-419'), V('Mateo', 'es-419')];
  const pick = (list) => { const r = rankVoices(list); return [who(r, 'f'), who(r, 'm')]; };
  assert.deepEqual(pick(all), [['Microsoft Salome Online'], ['Microsoft Gonzalo Online']], 'es-CO first');
  assert.deepEqual(pick(all.filter((v) => v.lang !== 'es-CO')), [['Microsoft Sabina'], ['Microsoft Raul']], 'then es-MX');
  assert.deepEqual(pick(all.filter((v) => v.lang !== 'es-CO' && v.lang !== 'es-MX')), [['Camila'], ['Mateo']], 'then es-419');
  assert.deepEqual(pick(all.filter((v) => v.lang === 'es-ES')), [['Microsoft Helena'], ['Microsoft Pablo']], 'and es-ES when it is all there is');
  assert.deepEqual(pick([...all, V('Paloma', 'es-CO')]), [['Microsoft Salome Online', 'Paloma'], ['Microsoft Gonzalo Online']], 'two women in the best language share the women');
  const mixed = rankVoices([V('Colombian Voice', 'es-CO'), V('Microsoft Sabina', 'es-MX'), V('Microsoft Raul', 'es-MX'), V('Microsoft Helena', 'es-MX'), V('Elvira', 'es-ES')]);
  assert.deepEqual([who(mixed, 'f'), who(mixed, 'm')], [['Colombian Voice'], ['Microsoft Raul']], 'es-CO still wins for the women (a voice with no gendered name is theirs), and the men have the best voice that is a man\'s');
});

test('voices with no gendered name of one language are dealt out in turn, women first; one voice, or none that suits a man, keeps today\'s sharing; the settings panel\'s choice is everybody\'s', () => {
  const three = rankVoices([V('Voz A', 'es-MX'), V('Voz B', 'es-MX'), V('Voz C', 'es-MX')]);
  assert.deepEqual([who(three, 'f'), who(three, 'm')], [['Voz A', 'Voz C'], ['Voz B']]);
  const one = rankVoices([V('Google español de Estados Unidos', 'es-US', false)]);
  assert.equal(voiceCast(one).apart, false); assert.equal(chooseVoice(one, { gender: 'm' }).voice.name, 'Google español de Estados Unidos'); assert.equal(chooseVoice(one, { gender: 'm' }).apart, false);
  const women = rankVoices([V('Microsoft Sabina', 'es-MX'), V('Microsoft Helena', 'es-ES')]);          // every voice is a woman's: nobody is left for the men
  const man = chooseVoice(women, { gender: 'm' });
  assert.equal(voiceCast(women).apart, false); assert.equal(man.voice.name, 'Microsoft Sabina', 'a man shares the best voice'); assert.equal(man.apart, false);
  assert.ok(pitchFor(man.voice, { ...voiceFor('n7', 'm', 'adult'), apart: man.apart }) < 0.8, 'and is lowered, as ever');
  const two = rankVoices([V('Google español', 'es-ES', false), V('Google español de Estados Unidos', 'es-US', false)]);
  const chosen = chooseVoice(two, { gender: 'm', seed: 3, preferURI: 'Google español' });
  assert.equal(chosen.voice.name, 'Google español'); assert.equal(chosen.apart, false, 'one voice for everybody: nobody is apart');
  assert.equal(chooseVoice(two, { gender: '?', seed: 3 }).apart, false, 'a reader of no sex has the best voice, as ever');
  assert.equal(voiceCast([]).apart, false); assert.equal(chooseVoice([], {}).voice, null);
});

test('speak(): with two voices a man and a woman are spoken on different voices, and a grown-up\'s utterance pitch stays inside 0.85 to 1.1', async () => {
  const b = fakeBrowser({ voices: [V('Google español', 'es-ES', false), V('Google español de Estados Unidos', 'es-US', false)] });
  try {
    const sp = new Speech({ ui: toasts() }).init(), say = async (o) => { const n = b.spoken.length; sp.speak('Buenas tardes.', o); await new Promise((r) => setTimeout(r, 70)); return b.spoken[n]; };
    const um = await say(voiceFor('n7', 'm', 'adult')), uf = await say(voiceFor('n7', 'f', 'adult')), ue = await say(voiceFor('n9', 'm', 'elder')), ub = await say(voiceFor('n7', 'm', 'kid'));
    assert.equal(uf.voice.name, 'Google español de Estados Unidos'); assert.equal(um.voice.name, 'Google español', 'the man has the other voice'); assert.equal(ue.voice.name, 'Google español'); assert.equal(ub.voice.name, 'Google español');
    for (const u of [um, uf, ue]) assert.ok(u.pitch >= 0.85 - 1e-9 && u.pitch <= 1.1 + 1e-9, `pitch ${u.pitch}`);
    assert.ok(ub.pitch >= 1.2, `a boy at ${ub.pitch}`); sp.cancel();
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
