// Player settings (owner: A1). Persisted in localStorage under try/catch (private windows, blocked storage and previews must not break the game).
//   ctx.settings.v.fov / .sens / ...      current values (read freely)
//   ctx.settings.set('fov', 80)           validates, persists, notifies
//   ctx.settings.on((key, value) => ...)  subscribe (UI, player, audio, renderer)
const KEY = 'la-ladera.settings.v1';

export const DEFAULTS = {
  fov: 72,              // vertical degrees
  sens: 1.0,            // multiplier of the base mouse sensitivity
  invertY: false,
  headBob: true,
  volume: 0.8,          // master 0..1
  quality: 'auto',      // 'auto' | 'low' | 'medium' | 'high'
  subs: true,           // subtitles on
  subLang: 'both',      // 'both' | 'es' | 'en'
  voiceURI: '',         // '' = best Spanish voice automatically
  ttsRate: 1.0,         // speech rate multiplier
  ttsOn: true,          // speak NPC lines aloud
  crosshair: true,
  timeFlow: false,      // let the clock run
  address: 'm',         // how the neighbours address you in dialogue: 'm' = vecino, mijo, señor; 'f' = vecina, mija, señora (people/ reads ctx.settings.v.address)
};

const RANGE = { fov: [55, 100], sens: [0.2, 3], volume: [0, 1], ttsRate: [0.6, 1.4] };
const ENUM = { quality: ['auto', 'low', 'medium', 'high'], subLang: ['both', 'es', 'en'], address: ['m', 'f'] };

export function createSettings(ctx) {
  const v = { ...DEFAULTS }, subs = [];
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { stored = null; }
  const clean = (k, x) => {
    if (!(k in DEFAULTS)) return undefined;
    const d = DEFAULTS[k];
    if (typeof d === 'boolean') return !!x;
    if (typeof d === 'number') { const n = Number(x); if (!Number.isFinite(n)) return d; const [a, b] = RANGE[k] ?? [-Infinity, Infinity]; return Math.min(b, Math.max(a, n)); }
    if (ENUM[k]) return ENUM[k].includes(x) ? x : d;
    return typeof x === 'string' ? x : d;
  };
  if (stored && typeof stored === 'object') for (const k of Object.keys(DEFAULTS)) if (k in stored) v[k] = clean(k, stored[k]);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable: settings last for this session only */ } };
  const api = {
    v, defaults: DEFAULTS, range: RANGE,
    get(k) { return v[k]; },
    set(k, x) { const c = clean(k, x); if (c === undefined || c === v[k]) return v[k]; v[k] = c; save(); for (const f of subs.slice()) { try { f(k, c); } catch (e) { console.error('[settings]', e); } } return c; },
    on(f) { subs.push(f); return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); }; },
    reset() { for (const k of Object.keys(DEFAULTS)) api.set(k, DEFAULTS[k]); },
  };
  return api;
}
