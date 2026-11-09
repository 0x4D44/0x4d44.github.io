// The weather at the station, from Open-Meteo (https://open-meteo.com, CC BY 4.0; no key). Three sources, one shape:
//   live     api.open-meteo.com/v1/forecast `current` for King's Cross, polled at most every ten minutes;
//   replay   archive-api.open-meteo.com/v1/archive hourly values for the recording's day, one request, then looked up by scene time;
//   forced   `?weather=rain` and friends: a fixed state, no request (for screenshots and tests); `?weather=off` is clear sky.
// Whatever fails, the scene falls back to a clear sky and the status line says so (`WeatherFeed.status`).
//
// The page sends nothing but these requests: no cookie, no referrer, no credentials, no key, and no data of the visitor's.
// Their network address is of course visible to Open-Meteo, as to any server that answers a request.
//
// `weatherState` turns an observation into the numbers the renderer draws (cloud, rain, snow, visibility, wet and snow-covered
// ground); the WMO code table is Open-Meteo's (https://open-meteo.com/en/docs: "WMO Weather interpretation codes").
import { STATION_LAT, STATION_LON } from '../../core/solar.ts';

/** The only origins the page contacts for weather. The CSP `connect-src` in index.html lists exactly these (tests/csp.test.ts). */
export const WEATHER_ORIGINS = ['https://api.open-meteo.com', 'https://archive-api.open-meteo.com'] as const;
export const FORECAST_ORIGIN = WEATHER_ORIGINS[0];
export const ARCHIVE_ORIGIN = WEATHER_ORIGINS[1];
/** At most one request this often, successes and failures alike. */
export const POLL_MS = 10 * 60_000;
/** A request that has not finished by now is abandoned. */
export const TIMEOUT_MS = 8_000;
/** A live reading older than this is no longer shown as the weather. */
export const STALE_MS = 60 * 60_000;

const CURRENT_FIELDS = 'weather_code,cloud_cover,precipitation,rain,snowfall,visibility,wind_speed_10m,is_day';
// The archive has no visibility (it answers null for every hour), so it is not asked for.
const HOURLY_FIELDS = 'weather_code,cloud_cover,precipitation,rain,snowfall,wind_speed_10m,is_day';

export const liveUrl = (): string => `${FORECAST_ORIGIN}/v1/forecast?latitude=${STATION_LAT}&longitude=${STATION_LON}&current=${CURRENT_FIELDS}`;
export const archiveUrl = (startDate: string, endDate: string): string =>
  `${ARCHIVE_ORIGIN}/v1/archive?latitude=${STATION_LAT}&longitude=${STATION_LON}&start_date=${startDate}&end_date=${endDate}&hourly=${HOURLY_FIELDS}&timezone=UTC`;

export interface WeatherObservation {
  source: 'live' | 'archive' | 'forced';
  /** the instant the values describe, epoch milliseconds (UTC) */
  timeMs: number;
  /** the length of the interval `precipMm`, `rainMm` and `snowCm` total over, seconds (live 900, archive 3600) */
  intervalS: number;
  /** WMO weather code */
  code: number;
  cloudPct: number;
  precipMm: number;
  rainMm: number;
  snowCm: number;
  /** metres; null when the source gives none */
  visibilityM: number | null;
  windMs: number;
  isDay: boolean | null;
  /** words for the status line instead of the code's (forced weather only: there is no WMO code for mist) */
  label?: string;
}

/** What the renderer draws. */
export interface WeatherState {
  cloud: number;
  rain: number;
  snow: number;
  /** metres; Infinity: no limit */
  visibilityM: number;
  /** damp to wet ground and platforms, 0..1 */
  wet: number;
  /** snow lying on the ground, 0..1 */
  snowCover: number;
  windMs: number;
  thunder: boolean;
  /** a few words for the status line: "light rain", "fog" */
  label: string;
}

export const CLEAR_STATE: WeatherState = { cloud: 0, rain: 0, snow: 0, visibilityM: Infinity, wet: 0, snowCover: 0, windMs: 0, thunder: false, label: 'clear sky' };

// ---- parsing ------------------------------------------------------------------------------------

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown, min: number, max: number): number | null => (finite(v) && v >= min && v <= max ? v : null);
const WIND_TO_MS: Record<string, number> = { 'km/h': 1 / 3.6, 'm/s': 1, 'mp/h': 0.44704, 'kn': 0.514444 };
const windFactor = (units: unknown): number => (typeof units === 'string' && Object.hasOwn(WIND_TO_MS, units) ? (WIND_TO_MS[units] as number) : 1 / 3.6);
/** Open-Meteo times carry no zone; with no `timezone` asked for they are UTC. */
const parseTime = (s: unknown): number | null => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}:00Z`);
  return Number.isFinite(t) ? t : null;
};

function observationFrom(source: 'live' | 'archive', timeMs: number, intervalS: number, v: Record<string, unknown>, windToMs: number): WeatherObservation | null {
  const code = num(v.weather_code, 0, 99);
  const cloud = num(v.cloud_cover, 0, 100);
  const precip = num(v.precipitation, 0, 1000);
  if (code === null || cloud === null || precip === null) return null;
  const wind = num(v.wind_speed_10m, 0, 1000);
  const visibility = num(v.visibility, 0, 1_000_000);
  return {
    source, timeMs, intervalS, code: Math.round(code), cloudPct: cloud, precipMm: precip,
    rainMm: num(v.rain, 0, 1000) ?? precip, snowCm: num(v.snowfall, 0, 1000) ?? 0,
    visibilityM: visibility, windMs: wind === null ? 0 : wind * windToMs,
    isDay: v.is_day === 1 ? true : v.is_day === 0 ? false : null,
  };
}

/** The `current` block of a forecast reply, or null if it is missing or malformed. */
export function parseCurrent(json: unknown): WeatherObservation | null {
  if (typeof json !== 'object' || json === null) return null;
  const root = json as { current?: unknown; current_units?: unknown };
  if (typeof root.current !== 'object' || root.current === null) return null;
  const current = root.current as Record<string, unknown>;
  const timeMs = parseTime(current.time);
  if (timeMs === null) return null;
  const units = typeof root.current_units === 'object' && root.current_units !== null ? (root.current_units as Record<string, unknown>).wind_speed_10m : undefined;
  return observationFrom('live', timeMs, num(current.interval, 60, 86_400) ?? 900, current, windFactor(units));
}

/** The hourly block of an archive reply as a map from the hour's start (epoch ms) to its observation; hours with a null reading are left out. Null if the reply is not an archive reply. */
export function parseHourly(json: unknown): Map<number, WeatherObservation> | null {
  if (typeof json !== 'object' || json === null) return null;
  const root = json as { hourly?: unknown; hourly_units?: unknown };
  if (typeof root.hourly !== 'object' || root.hourly === null) return null;
  const hourly = root.hourly as Record<string, unknown>;
  if (!Array.isArray(hourly.time)) return null;
  const units = typeof root.hourly_units === 'object' && root.hourly_units !== null ? (root.hourly_units as Record<string, unknown>).wind_speed_10m : undefined;
  const windToMs = windFactor(units);
  const out = new Map<number, WeatherObservation>();
  hourly.time.forEach((t: unknown, i: number) => {
    const timeMs = parseTime(t);
    if (timeMs === null) return;
    const row: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(hourly)) if (key !== 'time' && Array.isArray(hourly[key])) row[key] = (hourly[key] as unknown[])[i];
    const obs = observationFrom('archive', timeMs, 3600, row, windToMs);
    if (obs) out.set(timeMs, obs);
  });
  return out;
}

// ---- observation -> what to draw -------------------------------------------------------------------

interface CodeInfo {
  label: string;
  /** a precipitation code: 'rain' covers drizzle and showers, 'snow' snow and grains */
  precip?: 'rain' | 'snow';
  /** how hard it falls by the code alone, 0..1 */
  amount?: number;
  /** the visibility this weather implies when the source gives none or a larger one, metres */
  visibilityM?: number;
  /** the least cloud this weather implies, 0..1 */
  minCloud?: number;
  thunder?: boolean;
}

const CODES: Readonly<Record<number, CodeInfo>> = {
  0: { label: 'clear sky' },
  1: { label: 'mainly clear' },
  2: { label: 'partly cloudy' },
  3: { label: 'overcast', minCloud: 0.85 },
  45: { label: 'fog', visibilityM: 300, minCloud: 0.7 },
  48: { label: 'freezing fog', visibilityM: 250, minCloud: 0.7 },
  51: { label: 'light drizzle', precip: 'rain', amount: 0.14, visibilityM: 4000 },
  53: { label: 'drizzle', precip: 'rain', amount: 0.22, visibilityM: 2800 },
  55: { label: 'dense drizzle', precip: 'rain', amount: 0.32, visibilityM: 1800 },
  56: { label: 'light freezing drizzle', precip: 'rain', amount: 0.16, visibilityM: 3500 },
  57: { label: 'dense freezing drizzle', precip: 'rain', amount: 0.32, visibilityM: 1800 },
  61: { label: 'light rain', precip: 'rain', amount: 0.35 },
  63: { label: 'rain', precip: 'rain', amount: 0.6, visibilityM: 7000 },
  65: { label: 'heavy rain', precip: 'rain', amount: 0.9, visibilityM: 3500 },
  66: { label: 'light freezing rain', precip: 'rain', amount: 0.4 },
  67: { label: 'heavy freezing rain', precip: 'rain', amount: 0.85, visibilityM: 3500 },
  71: { label: 'light snow', precip: 'snow', amount: 0.3, visibilityM: 6000 },
  73: { label: 'snow', precip: 'snow', amount: 0.55, visibilityM: 3500 },
  75: { label: 'heavy snow', precip: 'snow', amount: 0.85, visibilityM: 1500 },
  77: { label: 'snow grains', precip: 'snow', amount: 0.3, visibilityM: 6000 },
  80: { label: 'light rain showers', precip: 'rain', amount: 0.4 },
  81: { label: 'rain showers', precip: 'rain', amount: 0.65 },
  82: { label: 'violent rain showers', precip: 'rain', amount: 1, visibilityM: 3500 },
  85: { label: 'light snow showers', precip: 'snow', amount: 0.4, visibilityM: 6000 },
  86: { label: 'heavy snow showers', precip: 'snow', amount: 0.85, visibilityM: 2000 },
  95: { label: 'thunderstorm', precip: 'rain', amount: 0.75, thunder: true, minCloud: 0.9, visibilityM: 5000 },
  96: { label: 'thunderstorm with hail', precip: 'rain', amount: 0.85, thunder: true, minCloud: 0.9, visibilityM: 4000 },
  99: { label: 'thunderstorm with heavy hail', precip: 'rain', amount: 0.95, thunder: true, minCloud: 0.9, visibilityM: 3500 },
};

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** The renderer's numbers for an observation (null: a clear sky). */
export function weatherState(obs: WeatherObservation | null): WeatherState {
  if (!obs) return CLEAR_STATE;
  const info = CODES[obs.code];
  const rate = (obs.precipMm * 3600) / obs.intervalS; // mm per hour
  const rateAmount = 1 - Math.exp(-rate / 3); // 0.5 mm/h: 0.15, 2.5: 0.57, 7.6: 0.92
  // A precipitation code sets how hard it falls (the measured rate can raise that); a dry code with a wet reading is rain that has just stopped.
  const amount = info?.precip ? Math.max(info.amount ?? 0, rateAmount) : rate > 0.05 ? 0.5 * rateAmount : 0;
  const snowShare = info?.precip === 'snow' ? 1 : obs.snowCm > 0 ? (obs.rainMm > 0 ? 0.5 : 1) : 0;
  const rain = amount * (1 - snowShare);
  const snow = amount * snowShare;
  let visibilityM = obs.visibilityM !== null && obs.visibilityM < 24_000 ? obs.visibilityM : Infinity;
  if (info?.visibilityM !== undefined) visibilityM = Math.min(visibilityM, info.visibilityM);
  const cloud = clamp01(Math.max(obs.cloudPct / 100, info?.minCloud ?? 0, amount > 0 ? 0.75 + 0.2 * amount : 0));
  const foggy = visibilityM < 1500 ? clamp01((1500 - visibilityM) / 1200) : 0;
  const wet = clamp01(Math.max(rain * 1.4, rate > 0.05 ? 0.35 : 0, 0.3 * foggy));
  const snowCover = snow > 0 ? clamp01(0.5 + snow * 0.8) : obs.snowCm > 0 ? 0.5 : 0;
  return { cloud, rain, snow, visibilityM, wet, snowCover, windMs: obs.windMs, thunder: info?.thunder === true, label: obs.label ?? info?.label ?? `weather code ${obs.code}` };
}

// ---- forced weather (?weather=...) --------------------------------------------------------------------

const FORCED_CODES: Readonly<Record<string, { code: number; cloudPct: number; precipMm?: number; snowCm?: number; visibilityM?: number; windMs?: number; label?: string }>> = {
  clear: { code: 0, cloudPct: 0 },
  cloudy: { code: 2, cloudPct: 55 },
  overcast: { code: 3, cloudPct: 100 },
  drizzle: { code: 53, cloudPct: 100, precipMm: 0.1 },
  rain: { code: 63, cloudPct: 100, precipMm: 1.2, windMs: 3 },
  'heavy-rain': { code: 65, cloudPct: 100, precipMm: 3.5, windMs: 6 },
  thunder: { code: 95, cloudPct: 100, precipMm: 3, windMs: 7 },
  mist: { code: 3, cloudPct: 90, visibilityM: 1800, label: 'mist' },
  fog: { code: 45, cloudPct: 100, visibilityM: 300 },
  snow: { code: 73, cloudPct: 100, precipMm: 0.5, snowCm: 0.7, windMs: 2 },
};
/** The names `?weather=` accepts (besides `off`). */
export const FORCED_NAMES: readonly string[] = Object.keys(FORCED_CODES);

/** A fixed observation for a `?weather=` name, or null if the name is not one. */
export function forcedObservation(name: string, timeMs = 0): WeatherObservation | null {
  if (!Object.hasOwn(FORCED_CODES, name)) return null; // the name comes from the page address: '__proto__' and 'constructor' are not weather
  const f = FORCED_CODES[name]!;
  const precipMm = f.precipMm ?? 0;
  return { source: 'forced', timeMs, intervalS: 900, code: f.code, cloudPct: f.cloudPct, precipMm, rainMm: f.snowCm ? 0 : precipMm, snowCm: f.snowCm ?? 0,
    visibilityM: f.visibilityM ?? null, windMs: f.windMs ?? 0, isDay: null, ...(f.label ? { label: f.label } : {}) };
}

/**
 * The scene clock a `?time=` value pins: an ISO 8601 instant with a zone, or epoch milliseconds (thirteen digits: a ten-digit number
 * is epoch seconds, which read as milliseconds would be January 1970, so it is refused). Null if it is neither.
 */
export function parseSceneTime(value: string | null): number | null {
  if (value === null) return null;
  if (/^\d{13}$/.test(value)) return Number(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

// ---- the feed ------------------------------------------------------------------------------------------

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface WeatherFeedOptions {
  /** 'live': poll the forecast `current`; 'replay': the archive for `date`; 'forced': a fixed state; 'off': clear sky, no request */
  mode: 'live' | 'replay' | 'forced' | 'off';
  /** replay: the recording's date, YYYY-MM-DD */
  date?: string;
  /** forced: a name from FORCED_NAMES */
  forced?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timers?: Timers;
  pollMs?: number;
  timeoutMs?: number;
  /** called when a new reading or failure has been recorded */
  onChange?: () => void;
}

export interface WeatherFeed {
  /** The observation to draw at scene time `tMs`; null while loading, after a failure, or when the source has nothing for that moment. */
  observation(tMs: number): WeatherObservation | null;
  /** One honest line for the status line. */
  status(tMs: number): string;
  dispose(): void;
}

const hhmm = (ms: number): string => new Date(ms).toISOString().slice(11, 16);
const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

class Permanent extends Error {}

export function createWeatherFeed(options: WeatherFeedOptions): WeatherFeed {
  const now = options.now ?? Date.now;
  const timers: Timers = options.timers ?? { setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>) };
  const pollMs = options.pollMs ?? POLL_MS;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  let disposed = false;
  let timer: unknown;
  let inFlight: AbortController | undefined;
  let lastStart = -Infinity;
  let pending = options.mode === 'live' || options.mode === 'replay';
  let failure: string | null = null;
  let latest: WeatherObservation | null = null;
  let lastOkAt = -Infinity;
  let hourly: Map<number, WeatherObservation> | null = null;
  // one object for the life of the feed, so the page can tell that nothing has changed
  const forced = options.mode === 'forced' ? forcedObservation(options.forced ?? '') : null;

  const getJson = async (url: string): Promise<unknown> => {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const controller = new AbortController();
    inFlight = controller;
    let handle: unknown;
    const timeout = new Promise<never>((_, reject) => {
      handle = timers.setTimeout(() => { controller.abort(); reject(new Error(`no answer in ${Math.round(timeoutMs / 1000)} s`)); }, timeoutMs);
    });
    try {
      const response = await Promise.race([
        fetchImpl(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' }),
        timeout,
      ]);
      if (!response.ok) {
        if (response.status === 400) throw new Permanent('HTTP 400');
        throw new Error(`HTTP ${response.status}`);
      }
      return await Promise.race([response.json() as Promise<unknown>, timeout]);
    } finally {
      timers.clearTimeout(handle);
      if (inFlight === controller) inFlight = undefined;
    }
  };

  const request = async (): Promise<void> => {
    timer = undefined;
    if (disposed) return;
    lastStart = now();
    let retry = true;
    try {
      if (options.mode === 'live') {
        const obs = parseCurrent(await getJson(liveUrl()));
        if (!obs) throw new Error('unexpected reply');
        latest = obs;
        lastOkAt = now();
      } else {
        const day = Date.parse(`${options.date ?? ''}T00:00:00Z`);
        if (!Number.isFinite(day)) throw new Permanent('no recording date');
        const start = isoDate(day - 86_400_000);
        const end = isoDate(Math.min(day + 86_400_000, now()));
        if (end < start) throw new Permanent('the recording is dated in the future');
        const table = parseHourly(await getJson(archiveUrl(start, end)));
        if (!table) throw new Error('unexpected reply');
        hourly = table;
        lastOkAt = now();
        retry = false;
      }
      failure = null;
    } catch (error) {
      failure = error instanceof Error && error.message ? error.message : 'request failed';
      if (error instanceof Permanent) retry = false;
    } finally {
      pending = false;
      if (!disposed) {
        if (retry) timer = timers.setTimeout(() => { void request(); }, Math.max(0, lastStart + pollMs - now()));
        options.onChange?.();
      }
    }
  };
  if (options.mode === 'live' || options.mode === 'replay') void request();

  const liveFresh = (): boolean => latest !== null && now() - lastOkAt < STALE_MS;

  return {
    observation(tMs) {
      if (options.mode === 'forced') return forced;
      if (options.mode === 'live') return liveFresh() ? latest : null;
      if (options.mode === 'replay') return hourly?.get(Math.floor(tMs / 3_600_000) * 3_600_000) ?? null;
      return null;
    },
    status(tMs) {
      switch (options.mode) {
        case 'off': return 'weather: off, clear sky';
        case 'forced': return forced ? `weather: ${weatherState(forced).label} (set by the page address, not measured)` : `weather: unknown name "${options.forced ?? ''}", clear sky`;
        case 'live':
          if (liveFresh() && latest) return `weather: ${weatherState(latest).label}${latest.cloudPct > 0 ? `, ${Math.round(latest.cloudPct)}% cloud` : ''} (Open-Meteo, ${hhmm(latest.timeMs)} UTC${failure ? '; last refresh failed' : ''})`;
          return pending ? 'weather: loading from Open-Meteo, clear sky until it arrives' : `weather unavailable (${failure ?? 'no reading'}), clear sky assumed`;
        default: {
          const obs = hourly?.get(Math.floor(tMs / 3_600_000) * 3_600_000);
          if (obs) return `weather: ${weatherState(obs).label}, ${Math.round(obs.cloudPct)}% cloud (Open-Meteo archive, ${hhmm(obs.timeMs)} UTC)`;
          if (pending) return 'weather: loading the Open-Meteo archive, clear sky until it arrives';
          return hourly ? 'weather: the Open-Meteo archive has nothing for that hour, clear sky assumed' : `weather unavailable (${failure ?? 'no reading'}), clear sky assumed`;
        }
      }
    },
    dispose() {
      disposed = true;
      if (timer !== undefined) timers.clearTimeout(timer);
      timer = undefined;
      inFlight?.abort();
    },
  };
}
