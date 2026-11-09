// web/src/weather.ts: the weather at the station from Open-Meteo. Replies are parsed defensively, a WMO code becomes the numbers the
// renderer draws, and the feed polls at most every ten minutes (counted start to start), times out, falls back to a clear sky and says so
// on the status line, and sends nothing of the visitor's. The clock and fetch are injected, so no test waits or touches the network.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  archiveUrl, ARCHIVE_ORIGIN, CLEAR_STATE, createWeatherFeed, FORCED_NAMES, FORECAST_ORIGIN, forcedObservation, liveUrl, parseCurrent, parseHourly, parseSceneTime,
  POLL_MS, STALE_MS, TIMEOUT_MS, WEATHER_ORIGINS, weatherState,
} from '../src/weather.ts';
import type { Timers, WeatherObservation, WeatherState } from '../src/weather.ts';

// ---- fakes ------------------------------------------------------------------------------------------------

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** A clock that only moves when told to; its timers fire in order, with the promises they start allowed to settle between. */
class FakeClock implements Timers {
  t: number;
  private seq = 0;
  private readonly pending = new Map<number, { at: number; fn: () => void }>();
  constructor(start: string) { this.t = Date.parse(start); }
  readonly now = (): number => this.t;
  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.pending.set(id, { at: this.t + Math.max(0, ms), fn });
    return id;
  }
  clearTimeout(handle: unknown): void { this.pending.delete(handle as number); }
  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    for (;;) {
      await settle();
      const due = [...this.pending.entries()].filter(([, p]) => p.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      this.pending.delete(due[0]);
      this.t = Math.max(this.t, due[1].at);
      due[1].fn();
    }
    this.t = target;
    await settle();
  }
  /** a promise that resolves after `ms` of this clock's time */
  sleep(ms: number): Promise<void> { return new Promise((resolve) => this.setTimeout(resolve, ms)); }
  get timers(): number { return this.pending.size; }
}

interface Call { url: string; init: RequestInit; at: number }
type Responder = (call: Call) => Promise<Response> | Response;
function fakeFetch(clock: FakeClock, respond: Responder): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = ((input: unknown, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {}, at: clock.now() };
    calls.push(call);
    return Promise.resolve().then(() => respond(call));
  }) as typeof fetch;
  return { fetchImpl, calls };
}
const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
/** never answers, but gives up when told to */
const hang = (call: Call): Promise<Response> => new Promise((_, reject) => call.init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));

const forecast = (over: Record<string, unknown> = {}, time = '2026-11-09T14:45') => ({
  latitude: 51.53, longitude: -0.12, generationtime_ms: 0.1, utc_offset_seconds: 0, timezone: 'GMT',
  current_units: { time: 'iso8601', interval: 'seconds', weather_code: 'wmo code', cloud_cover: '%', precipitation: 'mm', rain: 'mm', snowfall: 'cm', visibility: 'm', wind_speed_10m: 'km/h', is_day: '' },
  current: { time, interval: 900, weather_code: 3, cloud_cover: 100, precipitation: 0, rain: 0, snowfall: 0, visibility: 24140, wind_speed_10m: 9.7, is_day: 1, ...over },
});

/** Seventy-two hourly rows from midnight UTC on `first` (YYYY-MM-DD); `hour(i)` overrides the row `i`. */
function archive(first: string, hour: (i: number) => Record<string, number | null | undefined> = () => ({})) {
  const cols: Record<string, (number | null)[]> = { weather_code: [], cloud_cover: [], precipitation: [], rain: [], snowfall: [], wind_speed_10m: [], is_day: [] };
  const time: string[] = [];
  for (let i = 0; i < 72; i++) {
    time.push(new Date(Date.parse(`${first}T00:00:00Z`) + i * 3_600_000).toISOString().slice(0, 16));
    const row = { weather_code: 1, cloud_cover: 20, precipitation: 0, rain: 0, snowfall: 0, wind_speed_10m: 7.2, is_day: 1, ...hour(i) };
    for (const key of Object.keys(cols)) (cols[key] as (number | null)[]).push(row[key as keyof typeof row] as number | null);
  }
  return { hourly_units: { time: 'iso8601', wind_speed_10m: 'km/h' }, hourly: { time, ...cols } };
}

const obs = (over: Partial<WeatherObservation> = {}): WeatherObservation => ({
  source: 'live', timeMs: Date.parse('2026-11-09T14:45:00Z'), intervalS: 900, code: 0, cloudPct: 0, precipMm: 0, rainMm: 0, snowCm: 0, visibilityM: null, windMs: 0, isDay: true, ...over,
});

// ---- the request ---------------------------------------------------------------------------------------------

test('the requests are the ones asked for: the live URL exactly, the archive for a span of days, and only the two Open-Meteo origins', () => {
  assert.equal(liveUrl(), 'https://api.open-meteo.com/v1/forecast?latitude=51.532&longitude=-0.1233&current=weather_code,cloud_cover,precipitation,rain,snowfall,visibility,wind_speed_10m,is_day');
  assert.equal(archiveUrl('2026-11-06', '2026-11-08'),
    'https://archive-api.open-meteo.com/v1/archive?latitude=51.532&longitude=-0.1233&start_date=2026-11-06&end_date=2026-11-08&hourly=weather_code,cloud_cover,precipitation,rain,snowfall,wind_speed_10m,is_day&timezone=UTC');
  assert.deepEqual([...WEATHER_ORIGINS], ['https://api.open-meteo.com', 'https://archive-api.open-meteo.com']);
  assert.equal(FORECAST_ORIGIN, WEATHER_ORIGINS[0]);
  assert.equal(ARCHIVE_ORIGIN, WEATHER_ORIGINS[1]);
  assert.equal(POLL_MS, 10 * 60_000, 'at most every ten minutes');
  assert.equal(TIMEOUT_MS, 8_000);
  assert.equal(STALE_MS, 60 * 60_000, 'a live reading is dropped when it is an hour old');
  for (const u of [liveUrl(), archiveUrl('2026-11-06', '2026-11-08')].map((s) => new URL(s))) {
    assert.equal(u.protocol, 'https:');
    assert.equal(u.username + u.password + u.port, '', 'no credentials and no port');
    assert.ok((WEATHER_ORIGINS as readonly string[]).includes(u.origin));
    assert.ok(![...u.searchParams.keys()].some((k) => /key|token|user|id|session|ip/i.test(k)), 'no key, token or identifier in the query');
  }
  assert.deepEqual([...new URL(liveUrl()).searchParams.keys()], ['latitude', 'longitude', 'current']);
  assert.deepEqual([...new URL(archiveUrl('a', 'b')).searchParams.keys()], ['latitude', 'longitude', 'start_date', 'end_date', 'hourly', 'timezone']);
});

// ---- parsing -----------------------------------------------------------------------------------------------------

test('parseCurrent reads a forecast reply: UTC time, km/h wind to m/s, the visibility, day or night', () => {
  const o = parseCurrent(forecast())!;
  assert.equal(o.source, 'live');
  assert.equal(o.timeMs, Date.parse('2026-11-09T14:45:00Z'));
  assert.equal(o.intervalS, 900);
  assert.equal(o.code, 3);
  assert.equal(o.cloudPct, 100);
  assert.equal(o.visibilityM, 24140);
  assert.ok(Math.abs(o.windMs - 9.7 / 3.6) < 1e-12);
  assert.equal(o.isDay, true);
  assert.equal(parseCurrent(forecast({ is_day: 0 }))!.isDay, false);
  assert.equal(parseCurrent(forecast({ visibility: null }))!.visibilityM, null);
  assert.equal(parseCurrent(forecast({ rain: null }))!.rainMm, 0, 'a missing rain figure is the precipitation figure');
  const ms = forecast();
  (ms.current_units as Record<string, string>).wind_speed_10m = 'm/s';
  assert.equal(parseCurrent(ms)!.windMs, 9.7, 'the units named in the reply are respected');
  const odd = forecast();
  (odd.current_units as Record<string, string>).wind_speed_10m = 'constructor';
  assert.ok(Math.abs(parseCurrent(odd)!.windMs - 9.7 / 3.6) < 1e-12, 'units it does not know are read as km/h, the default, never as a property of Object');
});

test('parseCurrent refuses a reply it cannot trust, rather than guessing', () => {
  for (const bad of [null, undefined, 42, 'x', [], {}, { current: null }, { current: 5 }, forecast({ weather_code: 120 }), forecast({ weather_code: -1 }), forecast({ weather_code: null }),
    forecast({ cloud_cover: 140 }), forecast({ cloud_cover: 'a lot' }), forecast({ precipitation: null }), forecast({ precipitation: -3 }), forecast({ precipitation: Infinity }),
    forecast({}, '2026-11-09 14:45'), forecast({}, '09/11/2026'), forecast({ time: undefined }), forecast({ time: 1794235500 })]) {
    assert.equal(parseCurrent(bad), null, `${JSON.stringify(bad)?.slice(0, 80)} should not parse`);
  }
});

test('parseHourly maps each hour\'s start to its observation, leaves out hours with no reading, and refuses anything else', () => {
  const table = parseHourly(archive('2026-11-06', (i) => (i === 10 ? { weather_code: 63, cloud_cover: 100, precipitation: 1.4, rain: 1.4 } : i === 11 ? { weather_code: null } : {})))!;
  assert.equal(table.size, 71, 'one hour had no reading');
  const hour = table.get(Date.parse('2026-11-06T10:00:00Z'))!;
  assert.equal(hour.source, 'archive');
  assert.equal(hour.intervalS, 3600);
  assert.equal(hour.code, 63);
  assert.equal(hour.precipMm, 1.4);
  assert.equal(hour.visibilityM, null, 'the archive gives no visibility');
  assert.ok(Math.abs(hour.windMs - 2) < 1e-9, '7.2 km/h is 2 m/s');
  assert.equal(table.has(Date.parse('2026-11-06T11:00:00Z')), false);
  for (const bad of [null, {}, { hourly: null }, { hourly: {} }, { hourly: { time: 'x' } }, forecast()]) assert.equal(parseHourly(bad), null);
  assert.equal(parseHourly({ hourly: { time: ['not a time'], weather_code: [1], cloud_cover: [1], precipitation: [0] } })!.size, 0);
});

/** the observation parseCurrent makes of a forecast with `over` applied to its current block, which must parse */
function parsed(over: Record<string, unknown>): WeatherObservation {
  const o = parseCurrent(forecast(over));
  assert.ok(o, `${JSON.stringify(over)} should parse`);
  return o;
}

test('parseCurrent: a missing optional figure takes its stated default, an impossible one counts as missing, and every range includes its ends', () => {
  assert.equal(parsed({ precipitation: 0.8, rain: null }).rainMm, 0.8, 'no rain figure: all of the precipitation is rain');
  assert.equal(parsed({ precipitation: 0.8, rain: 1001 }).rainMm, 0.8, 'an impossible rain figure is a missing one');
  assert.equal(parsed({ snowfall: null }).snowCm, 0, 'no snowfall figure: no snow');
  assert.equal(parsed({ snowfall: -1 }).snowCm, 0);
  assert.equal(parsed({ wind_speed_10m: null }).windMs, 0, 'no wind figure: calm');
  assert.equal(parsed({ wind_speed_10m: -3 }).windMs, 0);
  assert.equal(parsed({ wind_speed_10m: 1001 }).windMs, 0);
  assert.equal(parsed({ visibility: -1 }).visibilityM, null);
  assert.equal(parsed({ visibility: 1_000_001 }).visibilityM, null, 'a visibility over a thousand kilometres is a fault, not a measurement');
  assert.equal(parsed({ is_day: null }).isDay, null, 'no day flag: unknown, not day');
  assert.equal(parsed({ is_day: 2 }).isDay, null);
  // the interval a reading covers: fifteen minutes unless the reply says something between a minute and a day
  assert.equal(parsed({ interval: undefined }).intervalS, 900);
  assert.equal(parsed({ interval: 59 }).intervalS, 900, 'under a minute is not an interval');
  assert.equal(parsed({ interval: 86_401 }).intervalS, 900, 'over a day is not an interval');
  assert.equal(parsed({ interval: 60 }).intervalS, 60);
  assert.equal(parsed({ interval: 86_400 }).intervalS, 86_400);
  // each range includes both its ends, and codes are whole numbers
  assert.equal(parsed({ weather_code: 0 }).code, 0);
  assert.equal(parsed({ weather_code: 99 }).code, 99);
  assert.equal(parsed({ weather_code: 62.6 }).code, 63);
  assert.equal(parsed({ cloud_cover: 0 }).cloudPct, 0);
  assert.equal(parsed({ cloud_cover: 100 }).cloudPct, 100);
  assert.equal(parsed({ precipitation: 0, rain: 0 }).precipMm, 0);
  assert.equal(parsed({ precipitation: 1000, rain: 1000 }).precipMm, 1000);
  assert.equal(parsed({ visibility: 0 }).visibilityM, 0);
  assert.equal(parsed({ visibility: 1_000_000 }).visibilityM, 1_000_000);
  assert.ok(Math.abs(parsed({ wind_speed_10m: 1000 }).windMs - 1000 / 3.6) < 1e-9);
  for (const bad of [{ weather_code: -0.5 }, { weather_code: 100 }, { cloud_cover: -1 }, { cloud_cover: 100.5 }, { cloud_cover: undefined }, { precipitation: 1000.5 }, { precipitation: undefined }]) {
    assert.equal(parseCurrent(forecast(bad)), null, `${JSON.stringify(bad)} is not a reading`);
  }
});

test('wind speeds are converted from the unit the reply names, in a forecast and in an archive; with no usable unit they are read as km/h', () => {
  for (const [units, metresPerSecond] of [['km/h', 1 / 3.6], ['m/s', 1], ['mp/h', 0.44704], ['kn', 0.514444]] as const) {
    const live = forecast({ wind_speed_10m: 10 });
    (live.current_units as Record<string, string>).wind_speed_10m = units;
    assert.ok(Math.abs(parseCurrent(live)!.windMs - 10 * metresPerSecond) < 1e-9, `${units} in a forecast`);
    const rows = archive('2026-11-06', () => ({ wind_speed_10m: 10 }));
    rows.hourly_units.wind_speed_10m = units;
    const hour = parseHourly(rows)!.get(Date.parse('2026-11-06T05:00:00Z'))!;
    assert.ok(Math.abs(hour.windMs - 10 * metresPerSecond) < 1e-9, `${units} in an archive: ${hour.windMs}`);
  }
  for (const units of [undefined, null, 5, '', 'furlongs/fortnight', 'toString', '__proto__']) {
    const live = forecast({ wind_speed_10m: 10 });
    (live.current_units as Record<string, unknown>).wind_speed_10m = units;
    assert.ok(Math.abs(parseCurrent(live)!.windMs - 10 / 3.6) < 1e-9, `${String(units)} is read as km/h in a forecast`);
    const rows = archive('2026-11-06', () => ({ wind_speed_10m: 10 }));
    (rows.hourly_units as Record<string, unknown>).wind_speed_10m = units;
    assert.ok(Math.abs(parseHourly(rows)!.get(Date.parse('2026-11-06T05:00:00Z'))!.windMs - 10 / 3.6) < 1e-9, `${String(units)} is read as km/h in an archive`);
  }
  // a reply whose units block is missing, null or not a block at all is read as km/h too, and does not throw
  for (const block of [undefined, null, 'km/h', 7]) {
    assert.doesNotThrow(() => parseCurrent({ ...forecast({ wind_speed_10m: 10 }), current_units: block }), `current_units ${String(block)}`);
    assert.doesNotThrow(() => parseHourly({ ...archive('2026-11-06'), hourly_units: block }), `hourly_units ${String(block)}`);
    assert.ok(Math.abs(parseCurrent({ ...forecast({ wind_speed_10m: 10 }), current_units: block })!.windMs - 10 / 3.6) < 1e-9);
    assert.ok(Math.abs(parseHourly({ ...archive('2026-11-06', () => ({ wind_speed_10m: 10 })), hourly_units: block })!.get(Date.parse('2026-11-06T05:00:00Z'))!.windMs - 10 / 3.6) < 1e-9);
  }
  assert.doesNotThrow(() => parseHourly({ hourly: { time: 'not a list' } }), 'a table whose times are not a list is refused, not walked');
  assert.equal(parseHourly({ hourly: { time: 'not a list' } }), null);
});

test('a time in a reply is UTC whatever zone the page runs in', () => {
  const before = process.env.TZ;
  try {
    for (const zone of ['America/New_York', 'Asia/Kolkata', 'Pacific/Auckland']) {
      process.env.TZ = zone;
      assert.equal(parseCurrent(forecast())!.timeMs, Date.parse('2026-11-09T14:45:00Z'), `a forecast read in ${zone}`);
      assert.ok(parseHourly(archive('2026-11-06'))!.has(Date.parse('2026-11-06T10:00:00Z')), `an archive read in ${zone}`);
    }
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

// ---- observation -> what to draw -----------------------------------------------------------------------------------

test('weatherState: no observation is a clear sky; the WMO codes map to the right sky, rain, snow, fog and ground', () => {
  assert.equal(weatherState(null), CLEAR_STATE);
  assert.deepEqual(weatherState(obs()), { ...CLEAR_STATE, label: 'clear sky' });
  assert.equal(weatherState(obs({ code: 2, cloudPct: 40 })).cloud, 0.4);
  assert.equal(weatherState(obs({ code: 1, cloudPct: 5 })).label, 'mainly clear');

  const overcast = weatherState(obs({ code: 3, cloudPct: 100 }));
  assert.equal(overcast.cloud, 1);
  assert.equal(overcast.rain + overcast.snow + overcast.wet + overcast.snowCover, 0, 'overcast is dry');
  assert.ok(weatherState(obs({ code: 3, cloudPct: 20 })).cloud >= 0.85, 'the code says overcast even if the cloud figure is low');

  const fog = weatherState(obs({ code: 45, cloudPct: 60 }));
  assert.ok(fog.visibilityM <= 300 && fog.cloud >= 0.7 && fog.wet > 0 && fog.rain === 0, `fog: ${JSON.stringify(fog)}`);
  assert.equal(weatherState(obs({ code: 45, visibilityM: 120 })).visibilityM, 120, 'a measured visibility worse than the code\'s is kept');
  assert.ok(weatherState(obs({ code: 48 })).visibilityM <= 250);
  assert.equal(weatherState(obs({ code: 0, visibilityM: 24140 })).visibilityM, Infinity, 'a visibility of 24 km is no limit');
  assert.equal(weatherState(obs({ code: 0, visibilityM: 800 })).visibilityM, 800, 'a clear code with a measured mist keeps the mist');

  const drizzle = [51, 53, 55].map((code) => weatherState(obs({ code, cloudPct: 100 })));
  const rain = [61, 63, 65].map((code) => weatherState(obs({ code, cloudPct: 100 })));
  const showers = [80, 81, 82].map((code) => weatherState(obs({ code, cloudPct: 80 })));
  for (const group of [drizzle, rain, showers]) {
    group.forEach((s, i) => {
      assert.ok(s.rain > 0 && s.snow === 0 && s.snowCover === 0 && s.wet > 0 && s.cloud >= 0.75, `rain-like: ${JSON.stringify(s)}`);
      if (i > 0) assert.ok(s.rain > (group[i - 1] as typeof s).rain, `a heavier code rains harder (${s.label})`);
    });
  }
  assert.ok((drizzle[2] as { rain: number }).rain < (rain[0] as { rain: number }).rain + 0.0001 || (drizzle[2] as { rain: number }).rain <= 0.35, 'drizzle is lighter than rain');
  assert.ok((rain[2] as { rain: number }).rain >= 0.9 && (rain[2] as { visibilityM: number }).visibilityM <= 3500, 'heavy rain: hard, and shortens the view');
  assert.ok((drizzle[0] as { visibilityM: number }).visibilityM <= 4000 && (drizzle[0] as { visibilityM: number }).visibilityM > 3000, 'drizzle haze');
  assert.equal((showers[2] as { rain: number }).rain, 1, 'violent showers are the most there is');
  assert.equal(weatherState(obs({ code: 82 })).label, 'violent rain showers');

  const snow = [71, 73, 75].map((code) => weatherState(obs({ code, cloudPct: 100, snowCm: 0.5 })));
  snow.forEach((s, i) => {
    assert.ok(s.snow > 0 && s.rain === 0 && s.snowCover >= 0.5, `snow: ${JSON.stringify(s)}`);
    if (i > 0) assert.ok(s.snow > (snow[i - 1] as typeof s).snow);
  });
  assert.ok((snow[2] as { visibilityM: number }).visibilityM <= 1500, 'heavy snow shortens the view');

  const storm = weatherState(obs({ code: 95, cloudPct: 100, precipMm: 2 }));
  assert.ok(storm.thunder && storm.cloud >= 0.9 && storm.rain >= 0.75, JSON.stringify(storm));
  assert.equal(weatherState(obs({ code: 61 })).thunder, false);
});

test('weatherState: the measured rate can raise the code\'s amount; a dry code with a wet reading is rain that has just stopped; sleet is both', () => {
  const light = weatherState(obs({ code: 61, cloudPct: 100 }));
  const downpour = weatherState(obs({ code: 61, cloudPct: 100, precipMm: 5, rainMm: 5 })); // 20 mm an hour
  assert.ok(downpour.rain > 0.99 && downpour.rain > light.rain, `${downpour.rain} against ${light.rain}`);
  const sameRateAnHour = weatherState(obs({ code: 61, cloudPct: 100, precipMm: 20, rainMm: 20, intervalS: 3600, source: 'archive' }));
  assert.ok(Math.abs(sameRateAnHour.rain - downpour.rain) < 1e-12, 'the rate is per hour whatever the interval');
  const stopped = weatherState(obs({ code: 3, cloudPct: 100, precipMm: 0.4, rainMm: 0.4 }));
  assert.ok(stopped.rain > 0 && stopped.rain < 0.3 && stopped.wet >= 0.35, `just stopped: ${JSON.stringify(stopped)}`);
  assert.equal(weatherState(obs({ code: 3, cloudPct: 100, precipMm: 0.01, rainMm: 0.01 })).rain, 0, 'a trace is not rain');
  const sleet = weatherState(obs({ code: 61, cloudPct: 100, precipMm: 1, rainMm: 0.6, snowCm: 0.3 }));
  assert.ok(sleet.rain > 0 && sleet.snow > 0 && Math.abs(sleet.rain - sleet.snow) < 1e-12, JSON.stringify(sleet));
  assert.equal(weatherState(obs({ code: 3, cloudPct: 100, snowCm: 0.2 })).snowCover, 0.5, 'snow on the ground from earlier is still there');
  assert.equal(weatherState(obs({ code: 44, cloudPct: 33 })).label, 'weather code 44', 'an unknown code is named, not hidden');
  assert.equal(weatherState(obs({ code: 44, cloudPct: 33 })).cloud, 0.33);
  assert.ok(Math.abs(weatherState(obs({ windMs: 4.5 })).windMs - 4.5) < 1e-12);
  for (const code of Array.from({ length: 100 }, (_, i) => i)) {
    const s = weatherState(obs({ code, cloudPct: 50, precipMm: 3, rainMm: 3 }));
    for (const v of [s.cloud, s.rain, s.snow, s.wet, s.snowCover]) assert.ok(v >= 0 && v <= 1, `code ${code}: ${v} outside 0..1`);
    assert.ok(s.visibilityM > 0, `code ${code}`);
  }
});

/**
 * [code, label, rain, snow, visibility, cloud, wet ground, snow cover, thunder] for a dry reading with no cloud figure and no visibility
 * figure, so that only the table of codes speaks. Worked out by a separate transcription of the table's amounts (weather.ts CODES) and of the
 * formulas for the ground and the cloud floor, not by running the page's code; the families are WMO's: 51 to 57 drizzle, 61 to 67 rain,
 * 71 to 77 snow, 80 to 82 rain showers, 85 and 86 snow showers, 95 to 99 thunderstorms.
 */
const CODE_TABLE: readonly [number, string, number, number, number, number, number, number, boolean][] = [
  [0, 'clear sky', 0, 0, Infinity, 0, 0, 0, false],
  [1, 'mainly clear', 0, 0, Infinity, 0, 0, 0, false],
  [2, 'partly cloudy', 0, 0, Infinity, 0, 0, 0, false],
  [3, 'overcast', 0, 0, Infinity, 0.85, 0, 0, false],
  [45, 'fog', 0, 0, 300, 0.7, 0.3, 0, false],
  [48, 'freezing fog', 0, 0, 250, 0.7, 0.3, 0, false],
  [51, 'light drizzle', 0.14, 0, 4000, 0.778, 0.196, 0, false],
  [53, 'drizzle', 0.22, 0, 2800, 0.794, 0.308, 0, false],
  [55, 'dense drizzle', 0.32, 0, 1800, 0.814, 0.448, 0, false],
  [56, 'light freezing drizzle', 0.16, 0, 3500, 0.782, 0.224, 0, false],
  [57, 'dense freezing drizzle', 0.32, 0, 1800, 0.814, 0.448, 0, false],
  [61, 'light rain', 0.35, 0, Infinity, 0.82, 0.49, 0, false],
  [63, 'rain', 0.6, 0, 7000, 0.87, 0.84, 0, false],
  [65, 'heavy rain', 0.9, 0, 3500, 0.93, 1, 0, false],
  [66, 'light freezing rain', 0.4, 0, Infinity, 0.83, 0.56, 0, false],
  [67, 'heavy freezing rain', 0.85, 0, 3500, 0.92, 1, 0, false],
  [71, 'light snow', 0, 0.3, 6000, 0.81, 0, 0.74, false],
  [73, 'snow', 0, 0.55, 3500, 0.86, 0, 0.94, false],
  [75, 'heavy snow', 0, 0.85, 1500, 0.92, 0, 1, false],
  [77, 'snow grains', 0, 0.3, 6000, 0.81, 0, 0.74, false],
  [80, 'light rain showers', 0.4, 0, Infinity, 0.83, 0.56, 0, false],
  [81, 'rain showers', 0.65, 0, Infinity, 0.88, 0.91, 0, false],
  [82, 'violent rain showers', 1, 0, 3500, 0.95, 1, 0, false],
  [85, 'light snow showers', 0, 0.4, 6000, 0.83, 0, 0.82, false],
  [86, 'heavy snow showers', 0, 0.85, 2000, 0.92, 0, 1, false],
  [95, 'thunderstorm', 0.75, 0, 5000, 0.9, 1, 0, true],
  [96, 'thunderstorm with hail', 0.85, 0, 4000, 0.92, 1, 0, true],
  [99, 'thunderstorm with heavy hail', 0.95, 0, 3500, 0.94, 1, 0, true],
];

test('weatherState: every code in the table has its own label, kind and strength of precipitation, view, cloud floor, wet ground and snow cover', () => {
  for (const [code, label, rain, snow, visibilityM, cloud, wet, snowCover, thunder] of CODE_TABLE) {
    const s = weatherState(obs({ code }));
    const at = `code ${code} (${label})`;
    assert.equal(s.label, label, at);
    assert.equal(s.thunder, thunder, `${at}: thunder`);
    assert.equal(s.visibilityM, visibilityM, `${at}: visibility`);
    for (const [name, want, got] of [['rain', rain, s.rain], ['snow', snow, s.snow], ['cloud', cloud, s.cloud], ['wet ground', wet, s.wet], ['snow cover', snowCover, s.snowCover]] as const) {
      assert.ok(Math.abs(got - want) < 1e-9, `${at}: ${name} ${got} against ${want}`);
    }
  }
  assert.equal(CODE_TABLE.length, 28, 'no row of the table was dropped');
});

type Expected = { cloud: number; rain: number; snow: number; visibilityM: number; wet: number; snowCover: number };
/** [what the case is, the observation's figures, the state it makes]: the measured figures combined with the code, worked by hand from the formulas in weather.ts */
const SCENARIOS: readonly (readonly [string, Partial<WeatherObservation>, Expected])[] = [
  ['a downpour under a light-rain code (20 mm an hour)', { code: 61, cloudPct: 100, precipMm: 5, rainMm: 5, snowCm: 0, visibilityM: null, intervalS: 900 }, { cloud: 1, rain: 0.998727366199, snow: 0, visibilityM: Infinity, wet: 1, snowCover: 0 }],
  ['the same 20 mm an hour measured over a whole hour', { code: 61, cloudPct: 100, precipMm: 20, rainMm: 20, snowCm: 0, visibilityM: null, intervalS: 3600 }, { cloud: 1, rain: 0.998727366199, snow: 0, visibilityM: Infinity, wet: 1, snowCover: 0 }],
  ['rain that has just stopped under a dry code (1.6 mm an hour)', { code: 3, cloudPct: 100, precipMm: 0.4, rainMm: 0.4, snowCm: 0, visibilityM: null, intervalS: 900 }, { cloud: 1, rain: 0.206676890245, snow: 0, visibilityM: Infinity, wet: 0.35, snowCover: 0 }],
  ['a trace under a dry code, below 0.05 mm an hour: not rain', { code: 3, cloudPct: 100, precipMm: 0.011, rainMm: 0.011, snowCm: 0, visibilityM: null, intervalS: 900 }, { cloud: 1, rain: 0, snow: 0, visibilityM: Infinity, wet: 0, snowCover: 0 }],
  ['a trace under a dry code, just over 0.05 mm an hour: rain that has just stopped', { code: 3, cloudPct: 100, precipMm: 0.014, rainMm: 0.014, snowCm: 0, visibilityM: null, intervalS: 900 }, { cloud: 1, rain: 0.009246761727, snow: 0, visibilityM: Infinity, wet: 0.35, snowCover: 0 }],
  ['a fifth of a millimetre an hour under a partly cloudy code', { code: 2, cloudPct: 30, precipMm: 0.05, rainMm: 0.05, snowCm: 0, visibilityM: null, intervalS: 900 }, { cloud: 0.756449301497, rain: 0.032246507484, snow: 0, visibilityM: Infinity, wet: 0.35, snowCover: 0 }],
  ['sleet: rain and snow together under a rain code', { code: 61, cloudPct: 100, precipMm: 1, rainMm: 0.6, snowCm: 0.3, visibilityM: null, intervalS: 900 }, { cloud: 1, rain: 0.368201430942, snow: 0.368201430942, visibilityM: Infinity, wet: 0.515482003319, snowCover: 0.794561144754 }],
  ['snowfall with no rain under a dry code is all snow', { code: 3, cloudPct: 100, precipMm: 1, rainMm: 0, snowCm: 1, visibilityM: null, intervalS: 900 }, { cloud: 1, rain: 0, snow: 0.368201430942, visibilityM: Infinity, wet: 0.35, snowCover: 0.794561144754 }],
  ['a snow code with no snowfall figure is still snow, not rain', { code: 73, cloudPct: 100, precipMm: 0.5, rainMm: 0.5, snowCm: 0, visibilityM: null, intervalS: 900 }, { cloud: 1, rain: 0, snow: 0.55, visibilityM: 3500, wet: 0.35, snowCover: 0.94 }],
  ['snow lying from earlier under a dry code', { code: 3, cloudPct: 100, precipMm: 0, rainMm: 0, snowCm: 0.2, visibilityM: null, intervalS: 900 }, { cloud: 1, rain: 0, snow: 0, visibilityM: Infinity, wet: 0, snowCover: 0.5 }],
  ['a visibility of 23 999 m is a limit', { code: 0, visibilityM: 23_999 }, { cloud: 0, rain: 0, snow: 0, visibilityM: 23_999, wet: 0, snowCover: 0 }],
  ['a visibility of 24 000 m is not', { code: 0, visibilityM: 24_000 }, { cloud: 0, rain: 0, snow: 0, visibilityM: Infinity, wet: 0, snowCover: 0 }],
  ['a visibility of 15 km is a limit', { code: 0, visibilityM: 15_000 }, { cloud: 0, rain: 0, snow: 0, visibilityM: 15_000, wet: 0, snowCover: 0 }],
  ['a visibility of 2 km is no fog on the ground', { code: 0, visibilityM: 2000 }, { cloud: 0, rain: 0, snow: 0, visibilityM: 2000, wet: 0, snowCover: 0 }],
  ['a visibility of 1500 m is the edge of fog', { code: 0, visibilityM: 1500 }, { cloud: 0, rain: 0, snow: 0, visibilityM: 1500, wet: 0, snowCover: 0 }],
  ['a visibility of 900 m is half fog', { code: 0, visibilityM: 900 }, { cloud: 0, rain: 0, snow: 0, visibilityM: 900, wet: 0.15, snowCover: 0 }],
  ['a visibility of 300 m is full fog', { code: 0, visibilityM: 300 }, { cloud: 0, rain: 0, snow: 0, visibilityM: 300, wet: 0.3, snowCover: 0 }],
  ['a visibility of nothing', { code: 0, visibilityM: 0 }, { cloud: 0, rain: 0, snow: 0, visibilityM: 0, wet: 0.3, snowCover: 0 }],
  ['overcast with a higher cloud figure keeps the figure', { code: 3, cloudPct: 95 }, { cloud: 0.95, rain: 0, snow: 0, visibilityM: Infinity, wet: 0, snowCover: 0 }],
  ['fog with a lower cloud figure takes the code\'s floor', { code: 45, cloudPct: 60 }, { cloud: 0.7, rain: 0, snow: 0, visibilityM: 300, wet: 0.3, snowCover: 0 }],
  ['fog with a worse measured visibility keeps the measurement', { code: 45, visibilityM: 120 }, { cloud: 0.7, rain: 0, snow: 0, visibilityM: 120, wet: 0.3, snowCover: 0 }],
  ['fog with a better measured visibility takes the code\'s', { code: 45, visibilityM: 5000 }, { cloud: 0.7, rain: 0, snow: 0, visibilityM: 300, wet: 0.3, snowCover: 0 }],
  ['heavy rain with no cloud figure is still under cloud', { code: 65, cloudPct: 0 }, { cloud: 0.93, rain: 0.9, snow: 0, visibilityM: 3500, wet: 1, snowCover: 0 }],
  ['snow under heavy-snow showers with a fifth of a millimetre melted in a quarter hour', { code: 86, cloudPct: 100, precipMm: 0.2, rainMm: 0, snowCm: 0.3, visibilityM: null, intervalS: 900 }, { cloud: 1, rain: 0, snow: 0.85, visibilityM: 2000, wet: 0.35, snowCover: 1 }],
];

test('weatherState: the measured rate, sleet, snow on the ground, the visibility limits and the cloud figure combine with the code as the cases say', () => {
  for (const [what, over, want] of SCENARIOS) {
    const s = weatherState(obs(over));
    for (const key of Object.keys(want) as (keyof Expected)[]) {
      assert.ok(s[key] === want[key] || Math.abs(s[key] - want[key]) < 1e-9, `${what}: ${key} is ${s[key]}, not ${want[key]}`);
    }
  }
});

// ---- ?weather= and ?time= ------------------------------------------------------------------------------------------

/** the state each ?weather= name makes, worked by hand from the code, the figures and the formulas */
const FORCED_STATES: readonly (readonly [string, WeatherState])[] = [
  ['clear', { cloud: 0, rain: 0, snow: 0, visibilityM: Infinity, wet: 0, snowCover: 0, windMs: 0, thunder: false, label: 'clear sky' }],
  ['cloudy', { cloud: 0.55, rain: 0, snow: 0, visibilityM: Infinity, wet: 0, snowCover: 0, windMs: 0, thunder: false, label: 'partly cloudy' }],
  ['overcast', { cloud: 1, rain: 0, snow: 0, visibilityM: Infinity, wet: 0, snowCover: 0, windMs: 0, thunder: false, label: 'overcast' }],
  ['drizzle', { cloud: 1, rain: 0.22, snow: 0, visibilityM: 2800, wet: 0.35, snowCover: 0, windMs: 0, thunder: false, label: 'drizzle' }],
  ['rain', { cloud: 1, rain: 0.798103482005, snow: 0, visibilityM: 7000, wet: 1, snowCover: 0, windMs: 3, thunder: false, label: 'rain' }],
  ['heavy-rain', { cloud: 1, rain: 0.990596437449, snow: 0, visibilityM: 3500, wet: 1, snowCover: 0, windMs: 6, thunder: false, label: 'heavy rain' }],
  ['thunder', { cloud: 1, rain: 0.981684361111, snow: 0, visibilityM: 5000, wet: 1, snowCover: 0, windMs: 7, thunder: true, label: 'thunderstorm' }],
  ['mist', { cloud: 0.9, rain: 0, snow: 0, visibilityM: 1800, wet: 0, snowCover: 0, windMs: 0, thunder: false, label: 'mist' }],
  ['fog', { cloud: 1, rain: 0, snow: 0, visibilityM: 300, wet: 0.3, snowCover: 0, windMs: 0, thunder: false, label: 'fog' }],
  ['snow', { cloud: 1, rain: 0, snow: 0.55, visibilityM: 3500, wet: 0.35, snowCover: 0.94, windMs: 2, thunder: false, label: 'snow' }],
];

test('forced weather: each name makes exactly its state, and the observation behind it is a quarter-hour reading with the figures the name sets', () => {
  assert.deepEqual(FORCED_STATES.map(([name]) => name).sort(), [...FORCED_NAMES].sort(), 'every name is covered');
  for (const [name, want] of FORCED_STATES) {
    const s = weatherState(forcedObservation(name));
    for (const key of ['cloud', 'rain', 'snow', 'visibilityM', 'wet', 'snowCover', 'windMs'] as const) {
      assert.ok(s[key] === want[key] || Math.abs(s[key] - want[key]) < 1e-9, `${name}: ${key} is ${s[key]}, not ${want[key]}`);
    }
    assert.equal(s.thunder, want.thunder, `${name}: thunder`);
    assert.equal(s.label, want.label, `${name}: label`);
  }
  assert.deepEqual(forcedObservation('snow', 123), { source: 'forced', timeMs: 123, intervalS: 900, code: 73, cloudPct: 100, precipMm: 0.5, rainMm: 0, snowCm: 0.7, visibilityM: null, windMs: 2, isDay: null });
  assert.deepEqual(forcedObservation('rain'), { source: 'forced', timeMs: 0, intervalS: 900, code: 63, cloudPct: 100, precipMm: 1.2, rainMm: 1.2, snowCm: 0, visibilityM: null, windMs: 3, isDay: null });
  assert.deepEqual(forcedObservation('mist'), { source: 'forced', timeMs: 0, intervalS: 900, code: 3, cloudPct: 90, precipMm: 0, rainMm: 0, snowCm: 0, visibilityM: 1800, windMs: 0, isDay: null, label: 'mist' });
});

test('forced weather: every name gives a fixed, believable state; unknown names give none', () => {
  assert.deepEqual([...FORCED_NAMES].sort(), ['clear', 'cloudy', 'drizzle', 'fog', 'heavy-rain', 'mist', 'overcast', 'rain', 'snow', 'thunder']);
  const state = (name: string) => weatherState(forcedObservation(name));
  assert.deepEqual(state('clear'), { ...CLEAR_STATE });
  assert.ok(state('cloudy').cloud > 0.4 && state('cloudy').rain === 0);
  assert.equal(state('overcast').cloud, 1);
  assert.ok(state('drizzle').rain > 0 && state('drizzle').rain < state('rain').rain);
  assert.ok(state('rain').rain < state('heavy-rain').rain);
  assert.ok(state('rain').wet > 0.5 && state('heavy-rain').wet >= state('rain').wet);
  assert.ok(state('mist').visibilityM === 1800 && state('mist').label === 'mist' && state('mist').cloud >= 0.85, JSON.stringify(state('mist')));
  assert.ok(state('fog').visibilityM <= 300);
  assert.ok(state('snow').snow > 0 && state('snow').rain === 0 && state('snow').snowCover > 0.5);
  assert.ok(state('thunder').thunder);
  assert.equal(forcedObservation('blizzard'), null);
  assert.equal(forcedObservation('__proto__'), null, 'a name is looked up, not evaluated');
  assert.equal(forcedObservation('constructor'), null);
});

test('?time= takes an ISO instant with a zone or thirteen-digit epoch milliseconds, and nothing vaguer', () => {
  assert.equal(parseSceneTime('2026-11-09T14:45:00Z'), Date.parse('2026-11-09T14:45:00Z'));
  assert.equal(parseSceneTime('2026-11-09T14:45Z'), Date.parse('2026-11-09T14:45:00Z'));
  assert.equal(parseSceneTime('2026-11-09T14:45:30.250Z'), Date.parse('2026-11-09T14:45:30.250Z'));
  assert.equal(parseSceneTime('2026-06-21T13:00:00+01:00'), Date.parse('2026-06-21T12:00:00Z'));
  assert.equal(parseSceneTime('1782000000000'), 1782000000000);
  for (const bad of [null, '', 'noon', '2026-11-09', '2026-11-09T14:45', '2026-11-09 14:45:00Z', '1782000000', '17820000000000', '-5', '2026-13-45T99:99:00Z', 'now']) {
    assert.equal(parseSceneTime(bad), null, `${bad} is not a pinned time`);
  }
});

// ---- the live feed -------------------------------------------------------------------------------------------------------

test('live: one request at once, then one every ten minutes counted from each start, whatever the server takes to answer', async () => {
  const clock = new FakeClock('2026-11-09T14:50:00Z');
  const { fetchImpl, calls } = fakeFetch(clock, async () => { await clock.sleep(7_000); return json(forecast()); }); // slow, but inside the timeout
  const changes: number[] = [];
  const feed = createWeatherFeed({ mode: 'live', fetchImpl, now: clock.now, timers: clock, onChange: () => changes.push(clock.t) });
  assert.equal(feed.observation(clock.t), null, 'nothing yet');
  assert.match(feed.status(clock.t), /loading from Open-Meteo, clear sky until it arrives/);
  await clock.advance(0);
  assert.equal(calls.length, 1, 'the first request goes at once');
  assert.equal(calls[0]!.url, liveUrl());
  await clock.advance(7_000);
  assert.equal(changes.length, 1);
  assert.equal(feed.observation(clock.t)!.code, 3);
  await clock.advance(POLL_MS - 7_000 - 1);
  assert.equal(calls.length, 1, 'not one millisecond early');
  await clock.advance(1);
  assert.equal(calls.length, 2, 'the second goes ten minutes after the first STARTED, not after it finished');
  assert.equal(calls[1]!.at - calls[0]!.at, POLL_MS);
  await clock.advance(3 * 3_600_000);
  assert.equal(calls.length, 2 + 18, 'three more hours: eighteen more requests');
  calls.slice(1).forEach((c, i) => assert.equal(c.at - (calls[i] as Call).at, POLL_MS, `request ${i + 1} follows ${i} by exactly ten minutes`));
  assert.ok(calls.every((c, i) => i === 0 || c.at >= (calls[i - 1] as Call).at + POLL_MS), 'never closer than ten minutes, and never two at once');
  feed.dispose();
});

test('live: while the answer is shown the status line credits Open-Meteo with the time of the reading', async () => {
  const clock = new FakeClock('2026-11-09T14:50:00Z');
  const { fetchImpl } = fakeFetch(clock, () => json(forecast({ weather_code: 61, cloud_cover: 90, precipitation: 0.3, rain: 0.3 })));
  const feed = createWeatherFeed({ mode: 'live', fetchImpl, now: clock.now, timers: clock });
  await clock.advance(0);
  const status = feed.status(clock.t);
  assert.match(status, /^weather: light rain, 90% cloud \(Open-Meteo, 14:45 UTC\)$/);
  feed.dispose();
});

test('live and replay status lines round the cloud to a whole percent, and a live line leaves a cloudless sky out', async () => {
  const clock = new FakeClock('2026-11-09T14:50:00Z');
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ weather_code: 0, cloud_cover: 0 }, /^weather: clear sky \(Open-Meteo, 14:45 UTC\)$/],
    [{ weather_code: 2, cloud_cover: 0.4 }, /^weather: partly cloudy, 0% cloud \(Open-Meteo, 14:45 UTC\)$/],
    [{ weather_code: 2, cloud_cover: 90.6 }, /^weather: partly cloudy, 91% cloud \(Open-Meteo, 14:45 UTC\)$/],
  ];
  for (const [over, expected] of cases) {
    const { fetchImpl } = fakeFetch(clock, () => json(forecast(over)));
    const feed = createWeatherFeed({ mode: 'live', fetchImpl, now: clock.now, timers: clock });
    await clock.advance(0);
    assert.match(feed.status(clock.t), expected, JSON.stringify(over));
    feed.dispose();
  }
  const rows = archive('2026-11-06', (i) => (i === 10 ? { weather_code: 2, cloud_cover: 90.6 } : i === 11 ? { weather_code: 0, cloud_cover: 0 } : {}));
  const { fetchImpl } = fakeFetch(clock, () => json(rows));
  const replay = createWeatherFeed({ mode: 'replay', date: '2026-11-07', fetchImpl, now: clock.now, timers: clock });
  await clock.advance(0);
  assert.equal(replay.status(Date.parse('2026-11-06T10:30:00Z')), 'weather: partly cloudy, 91% cloud (Open-Meteo archive, 10:00 UTC)');
  assert.equal(replay.status(Date.parse('2026-11-06T11:30:00Z')), 'weather: clear sky, 0% cloud (Open-Meteo archive, 11:00 UTC)', 'a replay line always says the cloud');
  replay.dispose();
});

test('live: after a long gap with no poll (a page that was asleep) the old reading is not shown, and the status line says there is none', async () => {
  const clock = new FakeClock('2026-11-09T14:50:00Z');
  const { fetchImpl } = fakeFetch(clock, () => json(forecast()));
  const feed = createWeatherFeed({ mode: 'live', fetchImpl, now: clock.now, timers: clock });
  await clock.advance(0);
  assert.notEqual(feed.observation(clock.t), null);
  clock.t += 2 * 3_600_000; // time passed with no timer firing
  assert.equal(feed.observation(clock.t), null);
  assert.equal(feed.status(clock.t), 'weather unavailable (no reading), clear sky assumed');
  feed.dispose();
});

test('live: a request that gets no answer is abandoned after eight seconds, the sky stays clear and the status line says why', async () => {
  const clock = new FakeClock('2026-11-09T14:50:00Z');
  const { fetchImpl, calls } = fakeFetch(clock, hang);
  const feed = createWeatherFeed({ mode: 'live', fetchImpl, now: clock.now, timers: clock });
  await clock.advance(0);
  assert.equal((calls[0]!.init.signal as AbortSignal).aborted, false);
  await clock.advance(TIMEOUT_MS - 1);
  assert.equal((calls[0]!.init.signal as AbortSignal).aborted, false, 'still waiting at 7.999 s');
  assert.match(feed.status(clock.t), /loading/);
  await clock.advance(1);
  assert.equal((calls[0]!.init.signal as AbortSignal).aborted, true, 'the request is cancelled, not left running');
  assert.equal(feed.observation(clock.t), null);
  assert.equal(feed.status(clock.t), 'weather unavailable (no answer in 8 s), clear sky assumed');
  await clock.advance(POLL_MS - TIMEOUT_MS - 1);
  assert.equal(calls.length, 1);
  await clock.advance(1);
  assert.equal(calls.length, 2, 'it tries again ten minutes after the first START (the timeout does not add to the wait)');
  assert.equal(calls[1]!.at - calls[0]!.at, POLL_MS);
  feed.dispose();
});

test('live: a reply whose body never arrives is abandoned at the timeout like one that never started', async () => {
  const clock = new FakeClock('2026-11-09T14:50:00Z');
  const headersOnly = (): Response => ({ ok: true, status: 200, json: () => new Promise<never>(() => undefined) }) as unknown as Response;
  const { fetchImpl, calls } = fakeFetch(clock, headersOnly);
  const feed = createWeatherFeed({ mode: 'live', fetchImpl, now: clock.now, timers: clock });
  await clock.advance(TIMEOUT_MS - 1);
  assert.match(feed.status(clock.t), /loading/, 'still waiting for the body at 7.999 s');
  await clock.advance(1);
  assert.equal(feed.status(clock.t), 'weather unavailable (no answer in 8 s), clear sky assumed');
  await clock.advance(POLL_MS);
  assert.equal(calls.length, 2, 'and it asks again');
  feed.dispose();
});

test('live: a failure that carries no message, or is not an error at all, is still named', async () => {
  for (const thrown of [new Error(''), 'boom', undefined, 42]) {
    const clock = new FakeClock('2026-11-09T14:50:00Z');
    const { fetchImpl } = fakeFetch(clock, () => { throw thrown; });
    const feed = createWeatherFeed({ mode: 'live', fetchImpl, now: clock.now, timers: clock });
    await clock.advance(0);
    assert.equal(feed.status(clock.t), 'weather unavailable (request failed), clear sky assumed', `after throwing ${String(thrown)}`);
    feed.dispose();
  }
});

test('live: every kind of failure falls back to a clear sky and says so; the next success recovers', async () => {
  const clock = new FakeClock('2026-11-09T14:50:00Z');
  const failures: (() => Response | Promise<Response>)[] = [
    () => { throw new TypeError('fetch failed'); },
    () => json({ reason: 'busy' }, 503),
    () => new Response('<html>not json</html>', { status: 200 }),
    () => json({ hello: 'world' }),
    () => json(forecast({ weather_code: 999 })),
  ];
  const expected = [/fetch failed/, /HTTP 503/, /JSON|Unexpected token|not valid/i, /unexpected reply/, /unexpected reply/];
  let attempt = 0;
  const { fetchImpl, calls } = fakeFetch(clock, () => (attempt < failures.length ? (failures[attempt++] as () => Response)() : json(forecast())));
  const feed = createWeatherFeed({ mode: 'live', fetchImpl, now: clock.now, timers: clock });
  for (let i = 0; i < failures.length; i++) {
    await clock.advance(i === 0 ? 0 : POLL_MS);
    assert.equal(calls.length, i + 1, `attempt ${i + 1}`);
    assert.equal(feed.observation(clock.t), null, `failure ${i + 1}: the scene falls back to a clear sky`);
    const status = feed.status(clock.t);
    assert.match(status, /^weather unavailable \(.+\), clear sky assumed$/, `failure ${i + 1}: ${status}`);
    assert.match(status, expected[i] as RegExp);
  }
  await clock.advance(POLL_MS);
  assert.equal(feed.observation(clock.t)!.code, 3, 'the first good reply is used at once');
  assert.match(feed.status(clock.t), /^weather: overcast, 100% cloud \(Open-Meteo, 14:45 UTC\)$/);
  feed.dispose();
});

test('live: a good reading survives a failed refresh, says so, and is dropped once an hour old', async () => {
  const clock = new FakeClock('2026-11-09T14:50:00Z');
  let up = true;
  const { fetchImpl } = fakeFetch(clock, () => (up ? json(forecast()) : json({}, 502)));
  const feed = createWeatherFeed({ mode: 'live', fetchImpl, now: clock.now, timers: clock });
  await clock.advance(0);
  up = false;
  await clock.advance(POLL_MS);
  assert.equal(feed.observation(clock.t)!.code, 3, 'ten minutes old: still the weather');
  assert.match(feed.status(clock.t), /; last refresh failed\)$/);
  await clock.advance(STALE_MS - POLL_MS - 1);
  assert.notEqual(feed.observation(clock.t), null, 'an hour less a millisecond');
  await clock.advance(1);
  assert.equal(feed.observation(clock.t), null, 'an hour old: no longer shown as the weather');
  assert.equal(feed.status(clock.t), 'weather unavailable (HTTP 502), clear sky assumed');
  up = true;
  await clock.advance(POLL_MS);
  assert.notEqual(feed.observation(clock.t), null, 'and back when the service is');
  feed.dispose();
});

test('live: an HTTP 400 means the request itself is wrong, so it is not repeated', async () => {
  const clock = new FakeClock('2026-11-09T14:50:00Z');
  const { fetchImpl, calls } = fakeFetch(clock, () => json({ error: true, reason: 'Latitude must be in range of -90 to 90' }, 400));
  const feed = createWeatherFeed({ mode: 'live', fetchImpl, now: clock.now, timers: clock });
  await clock.advance(12 * 3_600_000);
  assert.equal(calls.length, 1);
  assert.equal(clock.timers, 0);
  assert.equal(feed.status(clock.t), 'weather unavailable (HTTP 400), clear sky assumed');
  feed.dispose();
});

test('the request carries nothing of the visitor: GET, no cookies, no referrer, no headers, no body, no redirects, never cached', async () => {
  const clock = new FakeClock('2026-11-09T14:50:00Z');
  const { fetchImpl, calls } = fakeFetch(clock, (c) => (c.url.startsWith(ARCHIVE_ORIGIN) ? json(archive('2026-11-06')) : json(forecast())));
  const live = createWeatherFeed({ mode: 'live', fetchImpl, now: clock.now, timers: clock });
  const replay = createWeatherFeed({ mode: 'replay', date: '2026-11-07', fetchImpl, now: clock.now, timers: clock });
  await clock.advance(0);
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.deepEqual(Object.keys(c.init).sort(), ['cache', 'credentials', 'redirect', 'referrerPolicy', 'signal']);
    assert.equal(c.init.cache, 'no-store');
    assert.equal(c.init.credentials, 'omit');
    assert.equal(c.init.referrerPolicy, 'no-referrer');
    assert.equal(c.init.redirect, 'error');
    assert.ok(c.init.signal instanceof AbortSignal);
    assert.equal(c.init.method, undefined, 'a plain GET');
    assert.ok((WEATHER_ORIGINS as readonly string[]).includes(new URL(c.url).origin));
  }
  live.dispose();
  replay.dispose();
});

test('dispose stops everything: no timer left, the request in flight is cancelled, nothing more is asked or announced', async () => {
  const clock = new FakeClock('2026-11-09T14:50:00Z');
  const { fetchImpl, calls } = fakeFetch(clock, hang);
  let announced = 0;
  const feed = createWeatherFeed({ mode: 'live', fetchImpl, now: clock.now, timers: clock, onChange: () => announced++ });
  await clock.advance(1_000);
  assert.equal(calls.length, 1);
  feed.dispose();
  assert.equal((calls[0]!.init.signal as AbortSignal).aborted, true);
  await clock.advance(6 * 3_600_000);
  assert.equal(calls.length, 1);
  assert.equal(clock.timers, 0);
  assert.equal(announced, 0);

  const second = fakeFetch(clock, () => json(forecast()));
  const waiting = createWeatherFeed({ mode: 'live', fetchImpl: second.fetchImpl, now: clock.now, timers: clock });
  await clock.advance(0);
  assert.equal(clock.timers, 1, 'the next poll is waiting');
  waiting.dispose();
  assert.equal(clock.timers, 0, 'and disposing cancels it');
  await clock.advance(POLL_MS * 3);
  assert.equal(second.calls.length, 1);
});

// ---- the replay feed ---------------------------------------------------------------------------------------------------------

test('replay: one archive request for the recording\'s day and its neighbours, then each scene time reads its own hour', async () => {
  const clock = new FakeClock('2026-11-09T15:00:00Z');
  const rows = archive('2026-11-06', (i) => (i === 24 + 14 ? { weather_code: 63, cloud_cover: 100, precipitation: 1.4, rain: 1.4, wind_speed_10m: 18 } : {}));
  const { fetchImpl, calls } = fakeFetch(clock, () => json(rows));
  const feed = createWeatherFeed({ mode: 'replay', date: '2026-11-07', fetchImpl, now: clock.now, timers: clock });
  assert.match(feed.status(Date.parse('2026-11-07T14:35:00Z')), /loading the Open-Meteo archive, clear sky until it arrives/);
  await clock.advance(0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, archiveUrl('2026-11-06', '2026-11-08'), 'the day before to the day after');
  const wet = feed.observation(Date.parse('2026-11-07T14:35:00Z'))!;
  assert.equal(wet.code, 63);
  assert.equal(wet.timeMs, Date.parse('2026-11-07T14:00:00Z'), 'the reading is the hour\'s, floored');
  assert.equal(wet.source, 'archive');
  assert.equal(feed.observation(Date.parse('2026-11-07T14:00:00Z')), wet);
  assert.equal(feed.observation(Date.parse('2026-11-07T14:59:59Z')), wet);
  assert.equal(feed.observation(Date.parse('2026-11-07T15:00:00Z'))!.code, 1, 'the next hour is the next row');
  assert.equal(feed.status(Date.parse('2026-11-07T14:35:00Z')), 'weather: rain, 100% cloud (Open-Meteo archive, 14:00 UTC)');
  assert.equal(feed.observation(Date.parse('2026-11-10T03:00:00Z')), null, 'a time outside the table');
  assert.equal(feed.status(Date.parse('2026-11-10T03:00:00Z')), 'weather: the Open-Meteo archive has nothing for that hour, clear sky assumed');
  await clock.advance(6 * 3_600_000);
  assert.equal(calls.length, 1, 'one request is all a replay needs');
  feed.dispose();
});

test('replay: today\'s recording asks no further than today; a future one asks nothing; a failed request is retried no sooner than ten minutes', async () => {
  const clock = new FakeClock('2026-11-09T15:00:00Z');
  const today = fakeFetch(clock, () => json(archive('2026-11-08')));
  const f1 = createWeatherFeed({ mode: 'replay', date: '2026-11-09', fetchImpl: today.fetchImpl, now: clock.now, timers: clock });
  await clock.advance(0);
  assert.equal(today.calls[0]!.url, archiveUrl('2026-11-08', '2026-11-09'));
  f1.dispose();

  const future = fakeFetch(clock, () => json(archive('2026-11-09')));
  const f2 = createWeatherFeed({ mode: 'replay', date: '2026-11-12', fetchImpl: future.fetchImpl, now: clock.now, timers: clock });
  await clock.advance(POLL_MS * 2);
  assert.equal(future.calls.length, 0);
  assert.equal(f2.status(clock.t), 'weather unavailable (the recording is dated in the future), clear sky assumed');
  assert.equal(clock.timers, 0, 'and it is not asked again: the date will not change');
  f2.dispose();

  const nodate = fakeFetch(clock, () => json(archive('2026-11-09')));
  const f3 = createWeatherFeed({ mode: 'replay', date: 'yesterday', fetchImpl: nodate.fetchImpl, now: clock.now, timers: clock });
  await clock.advance(POLL_MS * 2);
  assert.equal(nodate.calls.length, 0);
  assert.match(f3.status(clock.t), /^weather unavailable \(no recording date\)/);
  assert.equal(clock.timers, 0, 'and it is not asked again');
  f3.dispose();

  let down = true;
  const flaky = fakeFetch(clock, () => (down ? json({}, 500) : json(archive('2026-11-06'))));
  const f4 = createWeatherFeed({ mode: 'replay', date: '2026-11-07', fetchImpl: flaky.fetchImpl, now: clock.now, timers: clock });
  await clock.advance(POLL_MS - 1);
  assert.equal(flaky.calls.length, 1);
  assert.equal(f4.observation(Date.parse('2026-11-07T14:35:00Z')), null);
  assert.equal(f4.status(Date.parse('2026-11-07T14:35:00Z')), 'weather unavailable (HTTP 500), clear sky assumed');
  down = false;
  await clock.advance(1);
  assert.equal(flaky.calls.length, 2);
  assert.equal(flaky.calls[1]!.at - flaky.calls[0]!.at, POLL_MS);
  assert.notEqual(f4.observation(Date.parse('2026-11-07T14:35:00Z')), null);
  await clock.advance(3_600_000);
  assert.equal(flaky.calls.length, 2, 'and then it stops');
  f4.dispose();
});

test('replay: a recording dated tomorrow still asks for today, one dated the day after asks for nothing', async () => {
  const clock = new FakeClock('2026-11-09T15:00:00Z');
  const tomorrow = fakeFetch(clock, () => json(archive('2026-11-09')));
  const f1 = createWeatherFeed({ mode: 'replay', date: '2026-11-10', fetchImpl: tomorrow.fetchImpl, now: clock.now, timers: clock });
  await clock.advance(0);
  assert.equal(tomorrow.calls.length, 1);
  assert.equal(tomorrow.calls[0]!.url, archiveUrl('2026-11-09', '2026-11-09'), 'the day before the recording, which is today, to the latest day there is');
  f1.dispose();
  const later = fakeFetch(clock, () => json(archive('2026-11-09')));
  const f2 = createWeatherFeed({ mode: 'replay', date: '2026-11-11', fetchImpl: later.fetchImpl, now: clock.now, timers: clock });
  await clock.advance(0);
  assert.equal(later.calls.length, 0);
  assert.equal(f2.status(clock.t), 'weather unavailable (the recording is dated in the future), clear sky assumed');
  f2.dispose();
});

test('replay: a reply that is not an archive is a failure to be asked about again, not an empty archive', async () => {
  const clock = new FakeClock('2026-11-09T15:00:00Z');
  let attempt = 0;
  const { fetchImpl, calls } = fakeFetch(clock, () => (attempt++ === 0 ? json({ hello: 'world' }) : json(archive('2026-11-06'))));
  const feed = createWeatherFeed({ mode: 'replay', date: '2026-11-07', fetchImpl, now: clock.now, timers: clock });
  const when = Date.parse('2026-11-07T14:35:00Z');
  await clock.advance(0);
  assert.equal(feed.status(when), 'weather unavailable (unexpected reply), clear sky assumed');
  assert.equal(feed.observation(when), null);
  assert.equal(clock.timers, 1, 'the next try is waiting');
  await clock.advance(POLL_MS);
  assert.equal(calls.length, 2);
  assert.notEqual(feed.observation(when), null);
  assert.match(feed.status(when), /^weather: /);
  feed.dispose();
});

// ---- no request at all -------------------------------------------------------------------------------------------------------------

test('forced and off modes never fetch; a forced observation is the same object every time and the status line says it was set, not measured', async () => {
  const clock = new FakeClock('2026-11-09T14:50:00Z');
  const { fetchImpl, calls } = fakeFetch(clock, () => { throw new Error('no request should be made'); });
  const forced = createWeatherFeed({ mode: 'forced', forced: 'rain', fetchImpl, now: clock.now, timers: clock });
  const off = createWeatherFeed({ mode: 'off', fetchImpl, now: clock.now, timers: clock });
  const unknown = createWeatherFeed({ mode: 'forced', forced: 'blizzard', fetchImpl, now: clock.now, timers: clock });
  await clock.advance(POLL_MS * 3);
  assert.equal(calls.length, 0);
  assert.equal(clock.timers, 0);
  assert.equal(forced.observation(1), forced.observation(Date.now()), 'one object, so the page can tell nothing changed');
  assert.equal(forced.observation(1)!.code, 63);
  assert.equal(forced.status(0), 'weather: rain (set by the page address, not measured)');
  assert.equal(off.observation(0), null);
  assert.equal(off.status(0), 'weather: off, clear sky');
  assert.equal(unknown.observation(0), null);
  assert.equal(unknown.status(0), 'weather: unknown name "blizzard", clear sky');
  for (const f of [forced, off, unknown]) f.dispose();
});


test('weather URL location is explicit for Waverley and defaults remain exactly London', () => {
  const location = { lat: 55.9519018, lon: -3.1904199 };
  for (const url of [liveUrl(location), archiveUrl('2026-11-07', '2026-11-09', location)]) {
    const query = new URL(url).searchParams;
    assert.equal(query.get('latitude'), String(location.lat));
    assert.equal(query.get('longitude'), String(location.lon));
  }
  assert.equal(new URL(liveUrl()).searchParams.get('latitude'), '51.532');
  assert.equal(new URL(liveUrl()).searchParams.get('longitude'), '-0.1233');
});

test('live and replay feeds request their configured station rather than the London point', async () => {
  const location = { lat: 55.9519018, lon: -3.1904199 };
  for (const mode of ['live', 'replay'] as const) {
    const clock = new FakeClock('2026-11-09T15:00:00Z');
    const { fetchImpl, calls } = fakeFetch(clock, () => json(mode === 'live' ? forecast() : archive('2026-11-08')));
    const feed = createWeatherFeed({ mode, location, date: '2026-11-09', fetchImpl, timers: clock, now: clock.now });
    try {
      await settle();
      assert.equal(calls.length, 1);
      const query = new URL(calls[0]!.url).searchParams;
      assert.equal(query.get('latitude'), String(location.lat));
      assert.equal(query.get('longitude'), String(location.lon));
      assert.equal(calls[0]!.init.credentials, 'omit');
    } finally { feed.dispose(); }
    assert.equal(clock.timers, 0);
  }
});
