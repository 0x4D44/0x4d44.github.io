// The all-operator full extract is needed: an update file alone cannot reconstruct
// cancellations or overlays. Raw schedules and authentication never enter the cache.
import { mkdir, open, realpath, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { Readable, PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { setImmediate as yieldToFeed } from 'node:timers/promises';
import { createScheduleSelector, parseScheduleLine, validDate } from '../core/schedule.ts';

export const SCHEDULE_URL = 'https://publicdatafeeds.networkrail.co.uk/ntrod/CifFileAuthenticate?type=CIF_ALL_FULL_DAILY&day=toc-full';
export const scheduleDate = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

/** Handles both gzip bytes and bodies already decompressed by fetch, in bounded chunks. */
async function filterScheduleStream(body, date, { signal, maxLineBytes = 1024 * 1024, maxDecodedBytes = 4 * 1024 ** 3, maxRecords = 2_000_000 } = {}) {
  const selector = createScheduleSelector(date);
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
    return { calls: selector.calls(), records, lines, bytes };
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

/** Refresh is deliberately separate from get(): an HTTP request/startup never waits
 * for a national extract. Only compact station calls are persisted, outside git. */
export function createScheduleStore({ dataDir, readCredentials, fetchImpl = fetch, corpus = async () => ({}), now = Date.now, enabled = false, onReady = () => {}, log = () => {}, schedule = setInterval, unschedule = clearInterval }) {
  const memo = new Map(), tasks = new Map();
  const abort = new AbortController();
  let closed = false, timer, lastTry = -Infinity, state = 'idle';
  const fileFor = date => path.join(dataDir, `schedule-${date}.json`);
  async function get(date) {
    if (!validDate(date)) throw new Error('invalid schedule date');
    if (memo.has(date)) return memo.get(date);
    try {
      const root = await realpath(dataDir), file = fileFor(date);
      const resolved = await realpath(file);
      if (path.dirname(resolved) !== root) throw new Error('schedule: invalid cache file');
      const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let doc;
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('schedule: invalid cache file');
        doc = JSON.parse(await handle.readFile('utf8'));
      } finally { await handle.close(); }
      if (!doc || doc.date !== date || !Array.isArray(doc.calls)) return null;
      memo.set(date, doc);
      while (memo.size > 7) memo.delete(memo.keys().next().value);
      return doc;
    } catch (error) { if (error?.code === 'ENOENT') return null; throw new Error('schedule: cache read failed'); }
  }
  function refresh(date = scheduleDate(now())) {
    if (!validDate(date)) return Promise.reject(new Error('invalid schedule date'));
    if (closed) return Promise.resolve(null);
    if (tasks.has(date)) return tasks.get(date);
    const task = (async () => {
      const cached = await get(date);
      if (cached) { onReady(cached); state = 'ready'; return cached; }
      if (!enabled) return null;
      state = 'downloading'; lastTry = now();
      const { account, secret } = await readCredentials();
      if (closed) return null;
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(5 * 60_000)]);
      const res = await fetchImpl(SCHEDULE_URL, { headers: { authorization: `Basic ${Buffer.from(`${account}:${secret}`).toString('base64')}`, 'accept-encoding': 'identity' }, redirect: 'follow', signal });
      if (!res.ok) { await res.body?.cancel?.(); throw new Error(`schedule: download failed (HTTP ${res.status})`); }
      const filtered = await filterSchedule(res.body, date, { signal });
      let names = {};
      try { names = await corpus(); } catch { /* TIPLOC is an honest fallback when CORPUS is unavailable. */ }
      if (closed) return null;
      const doc = { date, tiploc: 'KNGX', stanox: '54311', timeZone: 'Europe/London', fetchedAtMs: now(), source: 'CIF_ALL_FULL_DAILY', ...filtered, calls: nameSchedule(filtered.calls, names) };
      await mkdir(dataDir, { recursive: true });
      const file = fileFor(date), tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(doc), { mode: 0o600 });
      await rename(tmp, file);
      memo.set(date, doc);
      while (memo.size > 7) memo.delete(memo.keys().next().value);
      state = 'ready'; onReady(doc);
      log(`schedule: ready for ${date} (${doc.calls.length} King's Cross calls)`);
      return doc;
    })().catch(error => {
      state = closed ? 'closed' : 'unavailable';
      // Neither redirect URLs nor arbitrary exception messages belong in logs.
      if (!closed) log(/^schedule: download failed \(HTTP \d+\)$/.test(error?.message) ? error.message : 'schedule: refresh failed');
      return null;
    }).finally(() => tasks.delete(date));
    tasks.set(date, task);
    return task;
  }
  return {
    get, refresh,
    start() {
      if (closed || timer) return;
      void refresh();
      if (enabled) {
        timer = schedule(() => {
          const date = scheduleDate(now());
          if (!memo.has(date) && now() - lastTry >= 60_000) void refresh(date);
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
