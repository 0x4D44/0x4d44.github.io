// The all-operator full extract is needed: an update file alone cannot reconstruct
// cancellations or overlays. Raw schedules and authentication never enter the cache.
import { mkdir, open, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable, PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { setImmediate as yieldToFeed } from 'node:timers/promises';
import { createScheduleSelector, parseScheduleLine, validDate } from '../core/schedule.ts';
import { findPerthTiplocs, perthCall, perthDirections } from './perth.mjs';

export const SCHEDULE_URL = 'https://publicdatafeeds.networkrail.co.uk/ntrod/CifFileAuthenticate?type=CIF_ALL_FULL_DAILY&day=toc-full';
const londonDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
export const scheduleDate = (ms = Date.now()) => londonDay.format(ms);

/** Handles both gzip bytes and bodies already decompressed by fetch, in bounded chunks. */
async function filterScheduleStream(body, date, { signal, maxLineBytes = 1024 * 1024, maxDecodedBytes = 4 * 1024 ** 3, maxRecords = 2_000_000,
  perthTiplocs, london = true } = {}) {
  const selector = createScheduleSelector(date, perthTiplocs, london);
  const iterator = body[Symbol.asyncIterator]();
  const prefix = [];
  let bytes = 0, records = 0, lines = 0;
  while (bytes < 2) {
    const part = await iterator.next();
    if (part.done) break;
    const chunk = Buffer.from(part.value);
    if (chunk.length) prefix.push(chunk);
    bytes += chunk.length;
  }
  const magic = Buffer.concat(prefix.map(chunk => chunk.subarray(0, 2)), 2);
  const source = Readable.from((async function* () {
    try {
      yield* prefix;
      for (;;) {
        const part = await iterator.next();
        if (part.done) break;
        const chunk = Buffer.from(part.value);
        bytes += chunk.length;
        yield chunk;
      }
    } finally { await iterator.return?.(); }
  })());
  const decoded = magic[0] === 0x1f && magic[1] === 0x8b ? createGunzip() : new PassThrough();
  const pumping = pipeline(source, decoded, { signal });
  pumping.catch(() => {}); // The reader and pump can fail together; both are awaited below.
  let pending = Buffer.alloc(0), decodedBytes = 0;
  function consume(line) {
    if (!line.trim()) return;
    lines++;
    const record = parseScheduleLine(line);
    if (record) {
      if (++records > maxRecords) throw new Error('schedule: record limit exceeded');
      selector.apply(record);
    } else {
      let value;
      try { value = JSON.parse(line); } catch { throw new Error('schedule: invalid JSON line'); }
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.hasOwn(value, 'JsonScheduleV1')) throw new Error('schedule: invalid schedule record');
    }
  }
  try {
    for await (const chunk of decoded) {
      decodedBytes += chunk.length;
      if (decodedBytes > maxDecodedBytes) throw new Error('schedule: decoded byte limit exceeded');
      let start = 0;
      for (;;) {
        const end = chunk.indexOf(10, start);
        const tail = chunk.subarray(start, end < 0 ? chunk.length : end);
        if (pending.length + tail.length > maxLineBytes) throw new Error('schedule: line limit exceeded');
        if (end < 0) { pending = Buffer.concat([pending, tail]); break; }
        consume(Buffer.concat([pending, tail]).toString('utf8'));
        pending = Buffer.alloc(0);
        start = end + 1;
        if (lines % 1000 === 0) await yieldToFeed();
      }
    }
    if (pending.length) consume(pending.toString('utf8'));
    await pumping;
    if (!records) throw new Error('schedule: no schedule records');
    return { calls: selector.calls(), records, lines, bytes, ...(perthTiplocs?.length ? { perthCalls: selector.perthCalls() } : {}) };
  } finally {
    source.destroy(); decoded.destroy();
    await pumping.catch(() => {});
  }
}

export async function filterSchedule(body, date, options) {
  try { return await filterScheduleStream(body, date, options); }
  catch (error) {
    const safe = new Set(['schedule: record limit exceeded', 'schedule: decoded byte limit exceeded',
      'schedule: line limit exceeded', 'schedule: invalid JSON line', 'schedule: invalid schedule record', 'schedule: no schedule records']);
    throw new Error(safe.has(error?.message) ? error.message : 'schedule: invalid stream');
  }
}

export function nameSchedule(calls, corpus) {
  const candidate = corpus?.TIPLOCDATA ?? Object.values(corpus ?? {}).find(Array.isArray);
  const rows = Array.isArray(candidate) ? candidate : [];
  const names = new Map(rows.filter(r => r && typeof r === 'object').map(r => [typeof r.TIPLOC === 'string' ? r.TIPLOC.trim() : '', typeof r.NLCDESC === 'string' ? r.NLCDESC.trim() : '']));
  return calls.map(call => ({ ...call, originName: names.get(call.origin) || call.origin, destinationName: names.get(call.destination) || call.destination }));
}

async function readScheduleJson(dataDir, file) {
  try {
    const root = await realpath(dataDir), resolved = await realpath(file);
    if (path.dirname(resolved) !== root) throw new Error('schedule: invalid cache file');
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error('schedule: invalid cache file');
      return JSON.parse(await handle.readFile('utf8'));
    } finally { await handle.close(); }
  } catch (error) { if (error?.code === 'ENOENT') return null; throw new Error('schedule: cache read failed'); }
}

async function writePerthSchedule(dataDir, file, doc) {
  await mkdir(dataDir, { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(doc), { mode: 0o600, flag: 'wx' });
    await rename(tmp, file);
  } finally { await unlink(tmp).catch(error => { if (error?.code !== 'ENOENT') throw error; }); }
}

/** Refresh is deliberately separate from get(): an HTTP request/startup never waits
 * for a national extract. Only compact station calls are persisted, outside git. */
export function createScheduleStore({ dataDir, readCredentials, fetchImpl = fetch, corpus = async () => ({}), now = Date.now, enabled = false, onReady = () => {}, log = () => {}, schedule = setInterval, unschedule = clearInterval,
  perth = null, london = true }) {
  const memo = new Map(), perthMemo = new Map(), tasks = new Map();
  const abort = new AbortController();
  let closed = false, timer, lastTry = -Infinity, state = 'idle', perthOverrides;
  const fileFor = date => path.join(dataDir, `schedule-${date}.json`);
  const perthFileFor = date => path.join(dataDir, `perth-schedule-${date}.json`);
  async function getCache(date, cache, filename) {
    if (!validDate(date)) throw new Error('invalid schedule date');
    if (cache.has(date)) return cache.get(date);
    const doc = await readScheduleJson(dataDir, filename);
    if (!doc || doc.date !== date || !Array.isArray(doc.calls)) return null;
    remember(cache, date, doc);
    return doc;
  }
  function remember(cache, date, doc) {
    cache.set(date, doc);
    while (cache.size > 7) cache.delete(cache.keys().next().value);
  }
  const get = date => getCache(date, memo, fileFor(date));
  const getRawPerth = date => getCache(date, perthMemo, perthFileFor(date));
  async function getPerth(date) {
    const cached = await getRawPerth(date);
    if (!cached) return null;
    perthOverrides ??= readScheduleJson(dataDir, path.join(dataDir, 'perth-directions.json')).catch(() => null);
    const overrides = await perthOverrides;
    if (!overrides) return cached;
    const direction = perthDirections({}, overrides);
    return { ...cached, calls: cached.calls.map(call => call && ({ ...call,
      from: direction(call.previous) ?? call.from, to: direction(call.next) ?? call.to })) };
  }
  function refresh(date = scheduleDate(now())) {
    if (!validDate(date)) return Promise.reject(new Error('invalid schedule date'));
    if (closed) return Promise.resolve(null);
    if (tasks.has(date)) return tasks.get(date);
    let cached = null;
    const task = (async () => {
      if (london) cached = await get(date);
      if (cached) { onReady(cached); state = 'ready'; }
      if (!enabled) return cached;
      const cachedPerth = perth ? await getRawPerth(date).catch(() => null) : null;
      if ((!london || cached) && (!perth || cachedPerth)) return cached;
      state = 'downloading'; lastTry = now();
      // If London already has today's cache, the same national stream can backfill Perth once.
      let names = {};
      if (perth && !cachedPerth) {
        try { names = await corpus(); } catch { /* Optional station metadata. */ }
      }
      const perthTiplocs = perth && !cachedPerth ? findPerthTiplocs(names, perth) : undefined;
      if (perthTiplocs && !perthTiplocs.length) log('schedule: Perth TIPLOC unavailable');
      if (closed || ((!london || cached) && !perthTiplocs?.length)) { state = cached ? 'ready' : 'unavailable'; return cached; }
      const { account, secret } = await readCredentials();
      if (closed) return null;
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(5 * 60_000)]);
      const res = await fetchImpl(SCHEDULE_URL, { headers: { authorization: `Basic ${Buffer.from(`${account}:${secret}`).toString('base64')}`, 'accept-encoding': 'identity' }, redirect: 'follow', signal });
      if (!res.ok) { await res.body?.cancel?.(); throw new Error(`schedule: download failed (HTTP ${res.status})`); }
      const { perthCalls, ...filtered } = await filterSchedule(res.body, date, { signal, perthTiplocs, london: london && !cached });
      if (london && !cached && !perthTiplocs?.length) {
        try { names = await corpus(); } catch { /* TIPLOC is an honest fallback when CORPUS is unavailable. */ }
      }
      if (closed) return null;
      if (perthCalls) {
        try {
          const direction = perthDirections(names);
          const calls = perthCalls.flatMap(({ previous, next, ...call }) => {
            const selected = perthCall({ ...call, from: direction(previous), to: direction(next) });
            return selected ? [{ ...selected, previous, next }] : [];
          });
          const doc = { date, fetchedAtMs: now(), calls };
          if (!closed) {
            await writePerthSchedule(dataDir, perthFileFor(date), doc);
            remember(perthMemo, date, doc);
            log(`schedule: ready for ${date} (${calls.length} Perth calls)`);
          }
        } catch { if (!closed) log('schedule: Perth cache write failed'); }
      }
      if (closed || !london || cached) { state = closed ? 'closed' : 'ready'; return cached; }
      const doc = { date, tiploc: 'KNGX', stanox: '54311', timeZone: 'Europe/London', fetchedAtMs: now(), source: 'CIF_ALL_FULL_DAILY', ...filtered, calls: nameSchedule(filtered.calls, names) };
      await mkdir(dataDir, { recursive: true });
      const file = fileFor(date), tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(doc), { mode: 0o600 });
      await rename(tmp, file);
      remember(memo, date, doc);
      state = 'ready'; onReady(doc);
      log(`schedule: ready for ${date} (${doc.calls.length} King's Cross calls)`);
      return doc;
    })().catch(error => {
      state = closed ? 'closed' : cached ? 'ready' : 'unavailable';
      // Neither redirect URLs nor arbitrary exception messages belong in logs.
      if (!closed) log(/^schedule: download failed \(HTTP \d+\)$/.test(error?.message) ? error.message : 'schedule: refresh failed');
      return cached;
    }).finally(() => tasks.delete(date));
    tasks.set(date, task);
    return task;
  }
  return {
    get, getPerth, refresh,
    start() {
      if (closed || timer) return;
      void refresh();
      if (enabled) {
        timer = schedule(() => {
          const date = scheduleDate(now());
          if (((london && !memo.has(date)) || (perth && !perthMemo.has(date))) && now() - lastTry >= 60_000) void refresh(date);
        }, 60_000);
        timer?.unref?.();
      }
    },
    stats: () => ({ state, dates: [...memo.keys()] }),
    async close() {
      closed = true; abort.abort();
      if (timer) unschedule(timer);
      await Promise.allSettled([...tasks.values()]);
    },
  };
}
