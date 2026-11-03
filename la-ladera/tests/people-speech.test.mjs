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
  // (R3-201: a man on a woman's voice is lowered into 0.70 to 0.85, where an engine still sounds like a person and the man is still not the woman: it was 0.55 to 0.76)
  assert.ok(Math.max(...men) <= 0.85 + 1e-9, `a man at ${Math.max(...men).toFixed(2)}`); assert.ok(Math.min(...men) >= 0.7 - 1e-9, `a man at ${Math.min(...men).toFixed(2)}`);
  assert.ok(Math.min(...women) >= 0.88, `a woman at ${Math.min(...women).toFixed(2)}`);
  assert.ok(Math.min(...women) - Math.max(...men) >= 0.07, 'the sexes do not overlap on one voice');
  assert.ok(Math.max(...elders) < Math.min(...men) + 0.05 && Math.max(...elders) <= 0.78, `a grandfather at ${Math.max(...elders).toFixed(2)}`); assert.ok(Math.min(...elders) >= 0.7 - 1e-9);
  assert.ok(new Set(elders.map((p) => p.toFixed(3))).size >= 10, 'the grandfathers are not one voice: they walk the whole band, none of them pinned to its edge');
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(mean(grandmas) < mean(women) - 0.1, 'a grandmother is deeper than a woman (on average: every voice has its own spread)'); assert.ok(Math.min(...boys) >= 1.1 && Math.min(...girls) >= 1.1, 'children are high, boys included');
  assert.ok(Math.min(...boys) >= Math.min(...girls) * 0.9);
  assert.ok(AGE.kid.pitch - AGE.elder.pitch >= 0.55, 'the spread by age is wide');
  // a voice that IS a man's keeps the man's pitch; a woman on a man's voice is raised; a named woman's voice is left alone
  const raul = V('Microsoft Raul', 'es-MX'), sabina = V('Microsoft Sabina', 'es-MX');
  const vm = voiceFor('n7', 'm', 'adult'), vf = voiceFor('n7', 'f', 'adult');
  assert.equal(pitchFor(raul, vm), vm.pitch); assert.ok(pitchFor(raul, vf) > vf.pitch * 1.25); assert.equal(pitchFor(sabina, vf), vf.pitch);
  assert.ok(pitchFor(sabina, vm) >= 0.7 && pitchFor(sabina, vm) <= 0.85 && pitchFor(sabina, vm) < vm.pitch, `a man on a woman's voice is lowered into 0.70 to 0.85, not to ${pitchFor(sabina, vm).toFixed(2)} (his own pitch ${vm.pitch.toFixed(2)})`);
  assert.equal(pitchFor(raul, voiceFor('n7', 'f', 'kid')), voiceFor('n7', 'f', 'kid').pitch, 'a girl is not raised on a man\'s voice');
  assert.ok(Math.abs(pitchFor(null, { pitch: 1, gender: 'm' }) - 0.78) < 1e-9, 'no voice at all (the babble; a reader with no tone of her own): a man is the middle of the lowered band'); assert.equal(pitchFor(google[0], { pitch: 1 }), 1, 'a reader without a sex or age is untouched');
  // the utterance carries it (with one voice; two have voices of their own, below)
  const b = fakeBrowser({ voices: [V('Google español de Estados Unidos', 'es-US', false)] });
  try {
    const sp = new Speech({ ui: toasts() }).init(), say = async (o) => { const n = b.spoken.length; sp.speak('Buenas tardes.', o); await new Promise((r) => setTimeout(r, 70)); return b.spoken[n]; };
    const um = await say(vm), uf = await say(vf), ub = await say(voiceFor('n7', 'm', 'kid'));
    assert.equal(um.voice.name, 'Google español de Estados Unidos'); assert.equal(uf.voice.name, um.voice.name, 'the one voice');
    assert.ok(Math.abs(um.pitch - pitchFor(google[0], vm)) < 1e-9 && um.pitch >= 0.7 && um.pitch <= 0.85, `the man's utterance at ${um.pitch}`); assert.ok(uf.pitch >= 0.9 && ub.pitch >= 1.2, `woman ${uf.pitch}, boy ${ub.pitch}`);
    assert.ok(uf.pitch - um.pitch >= 0.2, 'on the same voice the woman is clearly higher'); sp.cancel();
  } finally { b.restore(); }
});

// ---- the voices of the browser, shared out between women and men. Round 6 R3-109: with Chrome's "Google español" and "Google español de Estados Unidos" all 34 speakers had the es-US voice and every man was
// that woman at 0.62 to 0.73, so that everybody sounded like one actor. Round 7 R3-201: the fix for that sent all 20 men to the es-ES one (the Castilian voice, a woman's too) at pitch 0.85 to 1.01, and seven
// elders sat at exactly 0.85, the floor of the clamp: the voice of a Colombian barrio is a regional voice, and a man is a man by his pitch when the browser has no man's voice to give him.
const ID60 = Array.from({ length: 60 }, (_, i) => 'n' + i), SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 5);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const who = (ranked, gender) => [...new Set(SEEDS.map((seed) => pickVoice(ranked, { gender, seed }).name))].sort();       // every voice the sex gets, over many persons
const spread = (ps) => { const c = new Map(); for (const p of ps) c.set(p.toFixed(3), (c.get(p.toFixed(3)) ?? 0) + 1); return { distinct: c.size, most: Math.max(...c.values()) / ps.length }; };
// what each of sixty people of one kind speaks with on a list of voices (the whole of what a player hears: the voice and the pitch)
const heard = (ranked, g, a) => ID60.map((id) => { const o = voiceFor(id, g, a), { voice, apart } = chooseVoice(ranked, { gender: g, seed: o.seed }); return { voice, apart, pitch: pitchFor(voice, { ...o, apart }) }; });

test('R3-201, Chrome\'s two Google voices (es-ES and es-US, neither named for a sex): everybody has the regional es-US voice, no man is sent to the Castilian one, and the men are lowered into 0.70 to 0.85', () => {
  const ranked = rankVoices([V('Google español', 'es-ES', false), V('Google español de Estados Unidos', 'es-US', false)]);
  assert.deepEqual(who(ranked, 'f'), ['Google español de Estados Unidos']); assert.deepEqual(who(ranked, 'm'), ['Google español de Estados Unidos'], 'the men are not on es-ES: that voice is a woman\'s too, and Castilian');
  assert.equal(voiceCast(ranked).apart, false, 'neither voice is a man\'s: there is nobody to share out'); assert.equal(chooseVoice(ranked, { gender: 'm' }).apart, false); assert.equal(chooseVoice(ranked, { gender: 'f' }).apart, false);
  const men = heard(ranked, 'm', 'adult'), elders = heard(ranked, 'm', 'elder'), women = heard(ranked, 'f', 'adult'), teens = heard(ranked, 'm', 'teen'), P = (l) => l.map((x) => x.pitch);
  for (const x of [...men, ...elders, ...women, ...teens, ...heard(ranked, 'm', 'kid'), ...heard(ranked, 'f', 'elder')]) assert.equal(x.voice.lang, 'es-US', 'nobody is on es-ES');
  assert.ok(Math.min(...P(men)) >= 0.7 - 1e-9 && Math.max(...P(men)) <= 0.85 + 1e-9, `the men: ${Math.min(...P(men)).toFixed(2)} to ${Math.max(...P(men)).toFixed(2)} (was 0.85 to 1.01: a Spanish woman)`);
  assert.ok(Math.min(...P(elders)) >= 0.7 - 1e-9 && Math.max(...P(elders)) <= 0.78, `the elders: ${Math.min(...P(elders)).toFixed(2)} to ${Math.max(...P(elders)).toFixed(2)}`);
  assert.ok(P(elders).every((p) => Math.abs(p - 0.85) > 1e-6), 'no grandfather sits at 0.85, the floor of the old clamp'); assert.ok(Math.max(...P(elders)) < Math.min(...P(men)) + 0.05, 'a grandfather is deeper than a man');
  for (const l of [men, elders]) { const s = spread(P(l)); assert.ok(s.distinct >= 10 && s.most <= 0.2, `a kind of people walks its band: ${s.distinct} pitches, ${(s.most * 100).toFixed(0)}% on one`); }
  assert.ok(mean(P(women)) - mean(P(men)) >= 0.15, 'the woman is clearly higher than the man on the one voice'); assert.ok(Math.min(...P(women)) >= 0.88, 'and she is not lowered');
  assert.ok(Math.min(...P(teens)) > Math.max(...P(men)), 'a teenage boy stays above the men'); assert.ok(Math.min(...P(heard(ranked, 'm', 'kid'))) >= 1.1, 'a boy is high');
});

// Spanish voice lists as the browsers report them (the names and tags are how the engines write them; `f` and `m` are the voices each sex ends up on, over many people)
const MSLOCAL = [V('Microsoft Helena - Spanish (Spain)', 'es-ES'), V('Microsoft Pablo - Spanish (Spain)', 'es-ES'), V('Microsoft Sabina - Spanish (Mexico)', 'es-MX')];
const GOOGLE = [V('Google español', 'es-ES', false), V('Google español de Estados Unidos', 'es-US', false)];
const EDGE = [V('Microsoft Dalia Online (Natural) - Spanish (Mexico)', 'es-MX', false), V('Microsoft Jorge Online (Natural) - Spanish (Mexico)', 'es-MX', false), V('Microsoft Elvira Online (Natural) - Spanish (Spain)', 'es-ES', false),
  V('Microsoft Alvaro Online (Natural) - Spanish (Spain)', 'es-ES', false), V('Microsoft Paloma Online (Natural) - Spanish (United States)', 'es-US', false), V('Microsoft Alonso Online (Natural) - Spanish (United States)', 'es-US', false),
  V('Microsoft Camila Online (Natural) - Spanish (Peru)', 'es-PE', false), V('Microsoft Alex Online (Natural) - Spanish (Peru)', 'es-PE', false), V('Microsoft Elena Online (Natural) - Spanish (Argentina)', 'es-AR', false), V('Microsoft Tomas Online (Natural) - Spanish (Argentina)', 'es-AR', false)];
const EDGE_CO = [V('Microsoft Salome Online (Natural) - Spanish (Colombia)', 'es-CO', false), V('Microsoft Gonzalo Online (Natural) - Spanish (Colombia)', 'es-CO', false)];
const MAC = [V('Mónica', 'es-ES'), V('Jorge', 'es-ES'), V('Paulina', 'es-MX'), V('Juan', 'es-MX'), V('Eddy (Spanish (Mexico))', 'es-MX'), V('Flo (Spanish (Mexico))', 'es-MX'), V('Grandpa (Spanish (Mexico))', 'es-MX')];
const LISTS = [
  { name: 'Chrome (Linux, macOS, ChromeOS): the two Google voices', voices: GOOGLE, f: ['Google español de Estados Unidos'], m: ['Google español de Estados Unidos'], apart: false },
  { name: 'Chrome on Windows: Windows\' own voices and the two Google ones', voices: [...MSLOCAL, ...GOOGLE], f: ['Microsoft Sabina - Spanish (Mexico)'], m: ['Microsoft Pablo - Spanish (Spain)'], apart: true },
  { name: 'Chrome on Windows with Spain\'s voices only: the women take the regional Google voice, the one man is Pablo', voices: [MSLOCAL[0], MSLOCAL[1], ...GOOGLE], f: ['Google español de Estados Unidos'], m: ['Microsoft Pablo - Spanish (Spain)'], apart: true },
  { name: 'Edge (Windows 11), the natural voices', voices: [...MSLOCAL, ...EDGE], f: ['Microsoft Dalia Online (Natural) - Spanish (Mexico)', 'Microsoft Sabina - Spanish (Mexico)'], m: ['Microsoft Jorge Online (Natural) - Spanish (Mexico)'], apart: true },
  { name: 'Edge with the Colombian voices', voices: [...MSLOCAL, ...EDGE, ...EDGE_CO], f: ['Microsoft Salome Online (Natural) - Spanish (Colombia)'], m: ['Microsoft Gonzalo Online (Natural) - Spanish (Colombia)'], apart: true },
  { name: 'Edge with only voices of countries outside the ranking (Peru, Costa Rica): all alike, so they share the people out', voices: [EDGE[6], EDGE[7], V('Microsoft Maria Online (Natural) - Spanish (Costa Rica)', 'es-CR', false), V('Microsoft Juan Online (Natural) - Spanish (Costa Rica)', 'es-CR', false)],
    f: ['Microsoft Camila Online (Natural) - Spanish (Peru)', 'Microsoft Maria Online (Natural) - Spanish (Costa Rica)'], m: ['Microsoft Alex Online (Natural) - Spanish (Peru)', 'Microsoft Juan Online (Natural) - Spanish (Costa Rica)'], apart: true },
  { name: 'Firefox on Windows', voices: [V('Microsoft Helena Desktop - Spanish (Spain)', 'es-ES'), V('Microsoft Pablo Desktop - Spanish (Spain)', 'es-ES'), V('Microsoft Sabina Desktop - Spanish (Mexico)', 'es-MX')],
    f: ['Microsoft Sabina Desktop - Spanish (Mexico)'], m: ['Microsoft Pablo Desktop - Spanish (Spain)'], apart: true },
  { name: 'Firefox on Linux (speech-dispatcher: voices with no personal name)', voices: [V('Spanish (Spain)', 'es-ES'), V('Spanish (Latin America)', 'es-419')], f: ['Spanish (Latin America)'], m: ['Spanish (Latin America)'], apart: false },
  { name: 'macOS (Safari, Chrome and Firefox list the same voices): Spain\'s and Mexico\'s', voices: MAC, f: ['Paulina'], m: ['Juan'], apart: true },
  { name: 'macOS with Colombian and Argentine voices as well', voices: [...MAC, V('Carlos', 'es-CO'), V('Soledad', 'es-CO'), V('Jimena', 'es-CO'), V('Diego', 'es-AR'), V('Isabela', 'es-AR')], f: ['Jimena', 'Soledad'], m: ['Carlos'], apart: true },
  { name: 'macOS with Spain\'s voices and the Argentine ones', voices: [MAC[0], MAC[1], V('Diego', 'es-AR'), V('Isabela', 'es-AR')], f: ['Isabela'], m: ['Diego'], apart: true },
  { name: 'macOS with Spain\'s two voices and nothing else (all there is)', voices: [MAC[0], MAC[1]], f: ['Mónica'], m: ['Jorge'], apart: true },
  { name: 'Chrome on macOS: the system voices and the two Google ones', voices: [...MAC, ...GOOGLE], f: ['Paulina'], m: ['Juan'], apart: true },
];

test('every browser\'s voice list: women and men get the best regional voices that suit them (a man\'s voice only when it is named for one), grown-ups stay inside believable pitch bands, and no kind of people is pinned to one pitch', () => {
  for (const L of LISTS) {
    const ranked = rankVoices(L.voices);
    assert.deepEqual(who(ranked, 'f'), [...L.f].sort(), `${L.name}: the women`); assert.deepEqual(who(ranked, 'm'), [...L.m].sort(), `${L.name}: the men`);
    assert.equal(chooseVoice(ranked, { gender: 'm' }).apart, L.apart, `${L.name}: apart`); assert.equal(voiceCast(ranked).apart, L.apart);
    const kinds = Object.fromEntries([['m', 'adult'], ['m', 'elder'], ['f', 'adult'], ['f', 'elder']].map(([g, a]) => [g + a, heard(ranked, g, a).map((x) => x.pitch)]));
    for (const [k, ps] of Object.entries(kinds)) {
      const lo = Math.min(...ps), hi = Math.max(...ps);
      assert.ok(lo >= 0.7 - 1e-9 && hi <= 1.1 + 1e-9, `${L.name}, ${k}: ${lo.toFixed(2)} to ${hi.toFixed(2)}`);
      const s = spread(ps); assert.ok(s.distinct >= 10 && s.most <= 0.2, `${L.name}, ${k}: ${s.distinct} pitches, ${(s.most * 100).toFixed(0)}% on one (the people of a kind walk their band)`);
    }
    // a man on a man's voice (`apart`) is not lowered; a man on a voice that is not a man's is, into 0.70 to 0.85 (the pitch is all that makes him one)
    for (const k of ['madult', 'melder']) {
      if (L.apart) assert.ok(Math.min(...kinds[k]) >= 0.85 - 1e-9, `${L.name}, ${k}: a man on a man's voice is not lowered: ${Math.min(...kinds[k]).toFixed(2)}`);
      else assert.ok(Math.max(...kinds[k]) <= 0.85 + 1e-9, `${L.name}, ${k}: a man on a voice that is not a man's is at ${Math.max(...kinds[k]).toFixed(2)}`);
    }
    assert.ok(mean(kinds.fadult) - mean(kinds.madult) >= 0.04, `${L.name}: the man is still a little deeper than the woman`);
    for (const g of ['m', 'f']) assert.ok(Math.min(...heard(ranked, g, 'kid').map((x) => x.pitch)) >= 1.1, `${L.name}: children stay high`);
  }
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

test('voices with no gendered name are all taken for women\'s, none is dealt to the men (R3-201: it was "in turn", which sent Chrome\'s men to es-ES); one voice, or none that suits a man, is everybody\'s; the settings panel\'s choice is everybody\'s', () => {
  const three = rankVoices([V('Voz A', 'es-MX'), V('Voz B', 'es-MX'), V('Voz C', 'es-MX')]);
  assert.equal(voiceCast(three).apart, false, 'no voice is a man\'s: there is nothing to deal out');
  assert.deepEqual([who(three, 'f'), who(three, 'm')], [['Voz A', 'Voz B', 'Voz C'], ['Voz A', 'Voz B', 'Voz C']], 'everybody is spread over the voices of the best language');
  const one = rankVoices([V('Google español de Estados Unidos', 'es-US', false)]);
  assert.equal(voiceCast(one).apart, false); assert.equal(chooseVoice(one, { gender: 'm' }).voice.name, 'Google español de Estados Unidos'); assert.equal(chooseVoice(one, { gender: 'm' }).apart, false);
  const women = rankVoices([V('Microsoft Sabina', 'es-MX'), V('Microsoft Helena', 'es-ES')]);          // every voice is a woman's: nobody is left for the men
  const man = chooseVoice(women, { gender: 'm' });
  assert.equal(voiceCast(women).apart, false); assert.equal(man.voice.name, 'Microsoft Sabina', 'a man shares the best voice'); assert.equal(man.apart, false);
  const lowered = pitchFor(man.voice, { ...voiceFor('n7', 'm', 'adult'), apart: man.apart }); assert.ok(lowered >= 0.7 && lowered <= 0.85, `and is lowered, as ever: ${lowered.toFixed(2)}`);
  const two = rankVoices([V('Google español', 'es-ES', false), V('Google español de Estados Unidos', 'es-US', false)]);
  const chosen = chooseVoice(two, { gender: 'm', seed: 3, preferURI: 'Google español' });
  assert.equal(chosen.voice.name, 'Google español'); assert.equal(chosen.apart, false, 'one voice for everybody: nobody is apart');
  assert.equal(chooseVoice(two, { gender: '?', seed: 3 }).apart, false, 'a reader of no sex has the best voice, as ever');
  assert.equal(voiceCast([]).apart, false); assert.equal(chooseVoice([], {}).voice, null);
});

test('speak(), Chrome\'s two Google voices (R3-201): every utterance is on the regional es-US voice, a man\'s pitch is lowered into 0.70 to 0.85 and a grandfather\'s is the lowest', async () => {
  const b = fakeBrowser({ voices: [V('Google español', 'es-ES', false), V('Google español de Estados Unidos', 'es-US', false)] });
  try {
    const sp = new Speech({ ui: toasts() }).init(), say = async (o) => { const n = b.spoken.length; sp.speak('Buenas tardes.', o); await new Promise((r) => setTimeout(r, 70)); return b.spoken[n]; };
    const um = await say(voiceFor('n7', 'm', 'adult')), uf = await say(voiceFor('n7', 'f', 'adult')), ue = await say(voiceFor('n9', 'm', 'elder')), ub = await say(voiceFor('n7', 'm', 'kid'));
    for (const u of [um, uf, ue, ub]) { assert.equal(u.voice.name, 'Google español de Estados Unidos', 'nobody is sent to the Castilian voice'); assert.equal(u.lang, 'es-US'); }
    assert.ok(um.pitch >= 0.7 && um.pitch <= 0.85, `a man at ${um.pitch}`); assert.ok(ue.pitch >= 0.7 && ue.pitch <= 0.78 && ue.pitch < um.pitch, `a grandfather at ${ue.pitch}`);
    assert.ok(uf.pitch >= 0.9 && uf.pitch <= 1.1, `a woman at ${uf.pitch}`); assert.ok(ub.pitch >= 1.2, `a boy at ${ub.pitch}`); sp.cancel();
  } finally { b.restore(); }
});

test('speak(), Edge\'s Dalia and Jorge (a woman\'s voice and a man\'s, es-MX): the sexes are on voices of their own and a grown-up\'s utterance pitch stays inside 0.85 to 1.1', async () => {
  const b = fakeBrowser({ voices: [V('Microsoft Dalia Online (Natural) - Spanish (Mexico)', 'es-MX', false), V('Microsoft Jorge Online (Natural) - Spanish (Mexico)', 'es-MX', false), V('Microsoft Elvira Online (Natural) - Spanish (Spain)', 'es-ES', false)] });
  try {
    const sp = new Speech({ ui: toasts() }).init(), say = async (o) => { const n = b.spoken.length; sp.speak('Buenas tardes.', o); await new Promise((r) => setTimeout(r, 70)); return b.spoken[n]; };
    const um = await say(voiceFor('n7', 'm', 'adult')), uf = await say(voiceFor('n7', 'f', 'adult')), ue = await say(voiceFor('n9', 'm', 'elder')), ug = await say(voiceFor('n9', 'f', 'elder'));
    assert.equal(uf.voice.name, 'Microsoft Dalia Online (Natural) - Spanish (Mexico)'); assert.equal(ug.voice.name, uf.voice.name); assert.equal(um.voice.name, 'Microsoft Jorge Online (Natural) - Spanish (Mexico)'); assert.equal(ue.voice.name, um.voice.name);
    for (const u of [um, uf, ue, ug]) assert.ok(u.pitch >= 0.85 - 1e-9 && u.pitch <= 1.1 + 1e-9, `pitch ${u.pitch}`);
    sp.cancel();
  } finally { b.restore(); }
});

test('voiceGender reads the first name the engines write: accents, case and decoration ("(Enhanced)", "Online (Natural)") do not matter, and a word that merely contains a name is not that name', () => {
  const g = (n) => voiceGender({ name: n });
  for (const n of ['Mónica', 'MONICA', 'Paulina (Enhanced)', 'Marisol (Premium)', 'Angélica', 'Sofía', 'Microsoft Dalia Online (Natural) - Spanish (Mexico)', 'Microsoft Sabina Desktop - Spanish (Mexico)', 'Microsoft Salome Online (Natural) - Spanish (Colombia)',
    'Microsoft Maria Online (Natural) - Spanish (Costa Rica)', 'Google UK English Female']) assert.equal(g(n), 'f', n);
  for (const n of ['Jorge', 'Raúl', 'Diego (Enhanced)', 'Microsoft Jorge Online (Natural) - Spanish (Mexico)', 'Microsoft Gonzalo Online (Natural) - Spanish (Colombia)', 'Microsoft Alonso Online (Natural) - Spanish (United States)', 'Microsoft Alex Online (Natural) - Spanish (Peru)',
    'Google UK English Male']) assert.equal(g(n), 'm', n);
  for (const n of ['Google español', 'Google español de Estados Unidos', 'Mariana', 'Eddy (Spanish (Spain))', 'Spanish (Latin America)', '', undefined]) assert.equal(g(n), '?', String(n));
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
