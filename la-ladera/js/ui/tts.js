// Spanish voice helper for the settings panel (owner: A1). The NPC speech itself lives in people/speech.js (ctx.people.speech); this
// module finds it, pushes the player's settings into it (voice, on/off, volume) and can speak a test line even when it is absent.
const TEST_ES = 'Buenas tardes, vecino. ¿Cómo le va por aquí?';
const TEST_EN = 'Good afternoon, neighbour. How are things around here?';
const RANK = ['es-co', 'es-mx', 'es-us', 'es-419', 'es-ar', 'es-cl', 'es-es'];

const rankOf = (lang) => { const l = String(lang || '').toLowerCase().replace('_', '-'); const i = RANK.indexOf(l); return i >= 0 ? i : /^es([-_]|$)/.test(l) ? 20 : 100; };
const synth = () => (typeof window !== 'undefined' ? window.speechSynthesis ?? null : null);

export const speechOf = (ctx) => ctx.people?.speech ?? null;

/** Spanish voices, best first: [{ uri, name, lang, local }]. */
export function listVoices(ctx) {
  const sp = speechOf(ctx);
  if (sp?.voices) { try { return sp.voices().map((v) => ({ uri: v.uri, name: v.name, lang: v.lang, local: v.local })); } catch { /* fall through */ } }
  const ss = synth(); if (!ss?.getVoices) return [];
  return ss.getVoices().map((v, i) => ({ v, i, r: rankOf(v.lang) })).filter((x) => x.r < 100)
    .sort((a, b) => a.r - b.r || (b.v.localService ? 1 : 0) - (a.v.localService ? 1 : 0) || a.i - b.i)
    .map((x) => ({ uri: x.v.voiceURI, name: x.v.name, lang: x.v.lang, local: !!x.v.localService }));
}

/** Push the player's settings into the NPC speech engine. Safe to call at any time. */
export function applyTts(ctx) {
  const sp = speechOf(ctx), v = ctx.settings?.v; if (!sp || !v) return;
  try { sp.setVoice?.(v.voiceURI || null); sp.enabled = !!v.ttsOn; sp.volume = v.volume; } catch { /* old API */ }
}

/** Speak the sample line with the chosen voice. Returns a short status string for the panel. */
export function testVoice(ctx) {
  const v = ctx.settings.v, sp = speechOf(ctx);
  ctx.ui.subtitle({ who: 'Prueba de voz', es: TEST_ES, en: TEST_EN, ms: 4200 });
  if (sp?.speak) { try { sp.enabled = true; sp.speak(TEST_ES, { pitch: 1, rate: v.ttsRate ?? 1, gender: '?', seed: 0 }); return sp.available ? 'ok' : 'novoice'; } catch { /* fall back below */ } }
  const ss = synth();
  if (!ss) return 'unsupported';
  const voices = listVoices(ctx);
  if (!voices.length) return 'novoice';
  try {
    ss.cancel();
    const u = new SpeechSynthesisUtterance(TEST_ES), pick = voices.find((x) => x.uri === v.voiceURI) ?? voices[0];
    const real = ss.getVoices().find((x) => x.voiceURI === pick.uri);
    if (real) { u.voice = real; u.lang = real.lang; } else u.lang = 'es-CO';
    u.rate = v.ttsRate ?? 1; u.volume = v.volume;
    ss.speak(u);
    return 'ok';
  } catch { return 'blocked'; }
}
