// Correlate the loopback relay's TRUST probe with its candidate-area recordings.
// Retained for approach investigations. Perth station uses TRUST and CIF.
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { configuredAreas } from '../relay/areas.mjs';
import { validTdEvent } from '../relay/td.mjs';

const WINDOW_MS = 90_000;
const TIE_MS = 12_000;
const MIN_HIGH = 3;
const MAX_JSON = 1024 * 1024;
const isMissing = error => error.code === 'ENOENT';
const time = value => Number.isSafeInteger(value) && value > 0 && value <= 8.64e15 - WINDOW_MS;
const confidence = count => count >= MIN_HIGH ? 'high' : count === 2 ? 'medium' : count === 1 ? 'low' : 'none';
const epochOf = row => row.e.time ?? row.t;
const dayOf = ms => new Date(ms).toISOString().slice(0, 10);

function stationMovements(recent) {
  const unique = new Map();
  for (const m of recent) {
    if (!m || !time(m.actualMs) || typeof m.trainId !== 'string' || !/^[A-Z0-9]{6,32}$/.test(m.trainId) ||
        m.trainId.slice(2, 6) !== m.headcode || !/^[0-9][A-Z][0-9]{2}$/.test(m.headcode) ||
        !['ARRIVAL', 'DEPARTURE'].includes(m.eventType)) continue;
    const service = `${dayOf(m.actualMs)}:${m.trainId}`;
    const key = `${service}:${m.eventType}:${m.actualMs}`;
    const platform = typeof m.platform === 'string' && /^[1-7]$/.test(m.platform.trim()) ? m.platform.trim() : null;
    const previous = unique.get(key);
    unique.set(key, { ...m, service, platform: previous && previous.platform !== platform ? null : platform });
  }
  return [...unique.values()];
}

function areaMatches(area, rows, movements) {
  const byCode = new Map(), seen = new Set();
  for (const row of rows) {
    const e = row?.e;
    if (e?.area !== area || e.kind !== 'step' || e.from === e.to || !validTdEvent(e) || !time(epochOf(row))) continue;
    const key = JSON.stringify([epochOf(row), e.descr, e.from, e.to]);
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byCode.get(e.descr) ?? [];
    list.push(row);
    byCode.set(e.descr, list);
  }
  const samples = new Map(), services = new Set(), claims = new Map();
  let ambiguous = 0, matched = 0;
  for (const movement of movements) {
    const candidates = (byCode.get(movement.headcode) ?? []).map(row => ({ row, delta: Math.abs(epochOf(row) - movement.actualMs) }))
      .filter(c => c.delta <= WINDOW_MS).sort((a, b) => a.delta - b.delta);
    if (!candidates.length) continue;
    const best = candidates[0];
    const other = candidates.find(c => c.row.e.from !== best.row.e.from || c.row.e.to !== best.row.e.to);
    if (other && other.delta - best.delta < TIE_MS) { ambiguous++; continue; }
    const list = claims.get(best.row) ?? [];
    list.push({ best, movement });
    claims.set(best.row, list);
  }
  for (const list of claims.values()) {
    // A step can be evidence for only one movement, even if a headcode is reused.
    list.sort((a, b) => a.best.delta - b.best.delta);
    const { best, movement } = list[0];
    if (list[1] && list[1].best.delta - best.delta < TIE_MS) { ambiguous += list.length; continue; }
    ambiguous += list.length - 1;
    matched++;
    services.add(movement.service);
    const { from, to } = best.row.e;
    const [station, approach] = movement.eventType === 'ARRIVAL' ? [to, from] : [from, to];
    for (const [berth, role] of [[station, 'station'], [approach, 'approach']]) {
      const key = `${role}:${berth}`;
      const item = samples.get(key) ?? { berth, role, services: new Set(), platforms: new Map(), stationBerths: new Set(), eventTypes: new Set(), deltas: [] };
      item.services.add(movement.service);
      if (movement.platform) {
        const services = item.platforms.get(movement.platform) ?? new Set();
        services.add(movement.service);
        item.platforms.set(movement.platform, services);
      }
      if (role === 'approach') item.stationBerths.add(station);
      item.eventTypes.add(movement.eventType);
      item.deltas.push(best.delta);
      samples.set(key, item);
    }
  }
  const berths = [...samples.values()].map(item => {
    const platforms = [...item.platforms.keys()].sort();
    const deltas = item.deltas.sort((a, b) => a - b);
    return { berth: item.berth, role: item.role, support: item.services.size, confidence: confidence(item.services.size),
      platform: platforms.length === 1 ? platforms[0] : null, platforms,
      platformSupport: Object.fromEntries(platforms.map(p => [p, item.platforms.get(p).size])), eventTypes: [...item.eventTypes].sort(),
      stationBerths: [...item.stationBerths].sort(), medianAbsDeltaMs: deltas[Math.floor(deltas.length / 2)] };
  }).sort((a, b) => (a.role === b.role ? b.support - a.support || a.berth.localeCompare(b.berth) : a.role === 'station' ? -1 : 1));
  return { services, berths, matched, ambiguous };
}

export function correlatePerth(recent, recordings) {
  const movements = stationMovements(recent);
  const matches = Object.entries(recordings).sort(([a], [b]) => a.localeCompare(b))
    .map(([area, rows]) => [area, areaMatches(area, rows, movements)]);
  const strong = matches.filter(([, m]) => m.services.size >= MIN_HIGH), recommendedAreas = [], reviewAreas = [];
  const areas = Object.fromEntries(matches.map(([area, m]) => {
    const exclusiveSupport = [...m.services].filter(service => !strong.some(([other, n]) => other !== area && n.services.has(service))).length;
    if (m.services.size >= MIN_HIGH && exclusiveSupport >= MIN_HIGH) recommendedAreas.push(area);
    else if (m.services.size >= 2) reviewAreas.push(area);
    return [area, { confidence: confidence(m.services.size), support: m.services.size, exclusiveSupport,
      matched: m.matched, ambiguous: m.ambiguous, berths: m.berths }];
  }));
  return { movements: movements.length, windowMs: WINDOW_MS, tieMs: TIE_MS, recommendedAreas, reviewAreas, areas };
}

/** A private, canonical directory from an already-running relay. Reject checkouts and redirected subdirectories. */
export async function privatePerthDirectory(...segments) {
  const base = await realpath(process.env.KX_DATA_DIR ?? path.join(homedir(), 'kx-data'));
  for (let dir = base; ; dir = path.dirname(dir)) {
    const git = await lstat(path.join(dir, '.git')).catch(error => { if (!isMissing(error)) throw error; });
    if (git) throw new Error('KX_DATA_DIR must be outside any repository');
    if (path.dirname(dir) === dir) break;
  }
  let dir = base;
  for (const segment of segments) {
    if (segment !== 'areas' && !/^[A-Z0-9]{2}$/.test(segment)) throw new Error('Invalid private Perth directory');
    dir = path.join(dir, segment);
    await mkdir(dir, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    if (await realpath(dir) !== dir || !(await stat(dir)).isDirectory()) throw new Error('Redirected private Perth directory');
  }
  return dir;
}

export async function readPrivatePerthJson(dir, name, optional = false) {
  let file;
  try {
    file = await open(path.join(dir, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await file.stat();
    if (!info.isFile() || info.size > MAX_JSON) throw new Error('Invalid private Perth JSON file');
    return JSON.parse(await file.readFile('utf8'));
  } catch (error) {
    if (optional && isMissing(error)) return undefined;
    throw new Error(`Cannot read private ${name}`);
  } finally { await file?.close(); }
}

export async function writePrivatePerthJson(dir, name, value, replace = true) {
  const target = path.join(dir, name), tmp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    if (replace) await rename(tmp, target);
    else await link(tmp, target);
  } finally { await unlink(tmp).catch(error => { if (!isMissing(error)) throw error; }); }
}

/** Yield complete NDJSON rows and ignore a partial final recorder write. Bound the response and the current line. */
async function* recordingRows(response) {
  const decoder = new TextDecoder();
  let size = 0, pending = '';
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 128 * 1024 * 1024) throw new Error('Candidate recording too large');
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) if (line.trim()) {
      if (line.length > MAX_JSON) throw new Error('Candidate recording row too large');
      try { yield JSON.parse(line); } catch { throw new Error('Malformed candidate recording'); }
    }
    if (pending.length > MAX_JSON) throw new Error('Candidate recording row too large');
  }
}

async function main() {
  const { values } = parseArgs({ options: { stanox: { type: 'string' }, candidates: { type: 'string' }, port: { type: 'string' } } });
  const stanox = values.stanox, port = Number(values.port ?? process.env.KX_RELAY_PORT ?? 8787);
  if (!stanox || !/^\d{5}$/.test(stanox) || !values.candidates || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Usage: node tools/perth-discovery.mjs --stanox <five digits> --candidates <comma-separated areas> [--port <loopback port>]');
  }
  const candidates = configuredAreas(values.candidates);
  const base = await privatePerthDirectory();
  const get = async endpoint => {
    try { return await fetch(`http://127.0.0.1:${port}${endpoint}`, { redirect: 'error', signal: AbortSignal.timeout(30_000) }); }
    catch { throw new Error('Loopback relay request failed'); }
  };
  const probe = await get('/trust-probe');
  if (!probe.ok) throw new Error(`TRUST probe unavailable (${probe.status}); enable KX_TRUST_PROBE`);
  const report = await probe.json().catch(() => { throw new Error('Malformed TRUST probe reply'); });
  const recent = report.stations?.[stanox]?.recent;
  const movements = Array.isArray(recent) ? stationMovements(recent) : [];
  if (!movements.length) throw new Error('No usable arrival/departure actuals at the supplied STANOX yet');
  const timesByCode = new Map(), dateSet = new Set();
  for (const m of movements) {
    const times = timesByCode.get(m.headcode) ?? [];
    times.push(m.actualMs);
    timesByCode.set(m.headcode, times);
    for (const at of [m.actualMs - WINDOW_MS, m.actualMs, m.actualMs + WINDOW_MS]) dateSet.add(dayOf(at).replaceAll('-', ''));
  }
  const dates = [...dateSet].sort(), recordings = {}, missingDates = {};
  for (const area of candidates) {
    recordings[area] = [];
    missingDates[area] = [];
    for (const date of dates) {
      const response = await get(`/recording?area=${area}&date=${date}`);
      if (response.status === 404) { missingDates[area].push(date); continue; }
      if (!response.ok) throw new Error(`Candidate recording request refused (${response.status}); check KX_AREAS`);
      for await (const row of recordingRows(response)) {
        if (row?.e?.kind === 'step' && row.e.area === area && time(epochOf(row)) &&
            timesByCode.get(row.e.descr)?.some(at => Math.abs(at - epochOf(row)) <= WINDOW_MS)) recordings[area].push(row);
      }
    }
  }
  const { areas, ...summary } = correlatePerth(recent, recordings);
  const generatedAt = new Date().toISOString();
  for (const area of candidates) {
    const dir = await privatePerthDirectory('areas', area);
    await writePrivatePerthJson(dir, 'perth-discovery.json', { area, generatedAt, stanox, dates, missingDates: missingDates[area], ...summary, ...areas[area] });
  }
  await writePrivatePerthJson(base, 'perth-discovery.json', { generatedAt, stanox, dates, missingDates, ...summary,
    areas: Object.fromEntries(Object.entries(areas).map(([area, { berths, ...totals }]) => [area, { ...totals, berthCount: berths.length }])) });
  console.log('Wrote private Perth discovery summary and candidate reports under KX_DATA_DIR.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
