// The scene pin: the page parameters that fix its clock and weather so that a capture repeats (README.md, "Time of day and
// weather"). `?time=` is an ISO 8601 instant with a zone (or thirteen-digit epoch milliseconds) and `?weather=` a named weather;
// a page pinned by them asks Open-Meteo for nothing. `?sky=ref` is the page's old fixed look. A page built before the sky and
// weather work reads none of them (it ignores parameters it does not know), so adding the pin to its address is harmless there.
// Shared by the capture tools (evidence.mjs, perf.mjs); pure, so the rules are unit-testable.

/** Midsummer noon in London: a high sun, the light the daylight reference photographs are scored against. */
export const PIN_TIME = '2026-06-21T12:00:00+01:00';
export const PIN_WEATHER = 'clear';
/** The weather names the page accepts (README.md); `off` and `0` are a clear sky and no request. */
export const WEATHER_NAMES = Object.freeze(['clear', 'cloudy', 'overcast', 'drizzle', 'rain', 'heavy-rain', 'thunder', 'mist', 'fog', 'snow', 'off', '0']);

// The page's own rule for `?time=` (web/src/weather.ts parseSceneTime): a value it cannot read is ignored and the live clock shows.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const EPOCH_MS = /^\d{13}$/;

/**
 * The pin a run asks for, from its `--time`, `--weather` and `--sky` values (each undefined when not given).
 * @returns {{mode:'pinned',time:string,weather:string}|{mode:'ref'}}
 */
export function scenePinFrom({ time, weather, sky } = {}) {
  if (sky !== undefined) {
    if (sky !== 'ref') throw new Error('--sky must be ref (the page\'s old fixed look)');
    if (time !== undefined || weather !== undefined) throw new Error('--sky ref is the old fixed look and cannot be combined with --time or --weather');
    return { mode: 'ref' };
  }
  const t = time ?? PIN_TIME, w = weather ?? PIN_WEATHER;
  if (!EPOCH_MS.test(t) && !(ISO_INSTANT.test(t) && Number.isFinite(Date.parse(t)))) throw new Error(`--time must be an ISO 8601 instant with a zone, such as ${PIN_TIME}, or thirteen-digit epoch milliseconds`);
  if (!WEATHER_NAMES.includes(w)) throw new Error(`--weather must be one of ${WEATHER_NAMES.join(', ')}`);
  return { mode: 'pinned', time: t, weather: w };
}

/** The pin as query parameters. A `+` in a zone offset is percent-encoded: a bare `+` reads back as a space and the page would ignore the time. */
export function pinParameters(pin) {
  return pin.mode === 'ref' ? 'sky=ref' : `time=${encodeURIComponent(pin.time)}&weather=${encodeURIComponent(pin.weather)}`;
}

/**
 * Add the pin to a page address's query (`''`, or `?a=b&c=d`). Left alone when the query already names a look of its own:
 * `bare=1` is the fixed look with no clock or weather (the geometry measuring views), and an explicit parameter wins.
 */
export function withPin(query, pin) {
  if (/[?&](?:bare|sky|time|weather)=/.test(query)) return query;
  return `${query}${query.includes('?') ? '&' : '?'}${pinParameters(pin)}`;
}

/**
 * Did the page apply the pin? `atmosphere` is what the page reports about its sky: 'absent' (no sky and weather work in this build),
 * 'fixed' (the old look is on) or an object (a live atmosphere, so the page read the address).
 */
export function pinHonoured(pin, atmosphere) {
  if (pin.mode === 'ref') return atmosphere === 'absent' || atmosphere === 'fixed';
  return typeof atmosphere === 'object' && atmosphere !== null;
}
