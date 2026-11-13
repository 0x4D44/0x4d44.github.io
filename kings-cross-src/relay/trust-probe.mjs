// Opt-in TRUST movement probe (KX_TRUST_PROBE=03140,03137, off by default): are TRUST movement
// reports at a station good enough to place trains? Tallies msg_type 0003 for the listed STANOX
// only, per STANOX: event type, planned vs actual time and lateness, platform, event_source
// (AUTOMATIC/MANUAL), train id/headcode, how long after the actual event time the message reached
// the relay, and counts per UTC hour.
//
// Read-only: it sees the raw TRUST body beside the existing KX path and changes nothing there.
// Output is private: a JSON summary at <KX_DATA_DIR>/trust-probe.json (never the repo), plus
// GET /trust-probe on the loopback relay. Memory is bounded (recent-event ring, hour cap).
//
// Summary: {enabled, stanox:[..], startedAt, updatedAt, total, ignored, stations: {STANOX: {
//   total, byEventType, bySource, platform: {given, missing, byPlatform}, planned: {given, missing},
//   lateness: Stat, delay: Stat, perHour: {"YYYY-MM-DDTHH": n}, recent: [event]}}}
// Stat = {n, min, max, mean} (lateness in minutes, actual-planned; delay in seconds, receive-actual).
// event = {trainId, headcode, eventType, plannedMs, actualMs, latenessMin, platform, source, delaySec, receivedAtMs}

import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const PROBE_DEFAULTS = Object.freeze({ maxRecent: 300, maxHours: 24 * 14, flushMs: 30_000 });

export function parseProbeStanox(value) {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(',').map(s => s.trim()).filter(s => /^\d{5}$/.test(s)))];
}

const str = (v) => (typeof v === 'string' && v.length <= 128) || (typeof v === 'number' && Number.isFinite(v)) ? String(v).trim() : '';
const ms = (v) => {
  if (typeof v !== 'number' && (typeof v !== 'string' || !/^\d{1,16}$/.test(v))) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const newStat = () => ({ n: 0, sum: 0, min: null, max: null });
const addStat = (s, v) => { s.n++; s.sum += v; if (s.min === null || v < s.min) s.min = v; if (s.max === null || v > s.max) s.max = v; };
const outStat = (s) => ({ n: s.n, min: s.min, max: s.max, mean: s.n ? Math.round((s.sum / s.n) * 100) / 100 : null });

export function createTrustProbe({ stanox = [], now = Date.now, file = null, ...limits } = {}) {
  const { maxRecent, maxHours, flushMs } = { ...PROBE_DEFAULTS, ...limits };
  const wanted = new Set(stanox);
  const stations = new Map();
  let startedAt = null, updatedAt = null, total = 0, ignored = 0, dirty = false, timer = null, writing = Promise.resolve();

  const entry = (id) => {
    let e = stations.get(id);
    if (!e) {
      e = { total: 0, byEventType: {}, bySource: {}, byPlatform: {}, platformGiven: 0, platformMissing: 0,
        plannedGiven: 0, plannedMissing: 0, lateness: newStat(), delay: newStat(), perHour: new Map(), recent: [] };
      stations.set(id, e);
    }
    return e;
  };
  const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };

  function observe(raw) {
    let list = raw;
    if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { return; } }
    if (!Array.isArray(list)) return;
    const at = Number(now());
    for (const m of list) {
      if (str(m?.header?.msg_type) !== '0003') continue;
      const b = m?.body;
      if (!b || typeof b !== 'object') continue;
      const id = str(b.loc_stanox);
      if (!wanted.has(id)) { ignored++; continue; }
      startedAt ??= at;
      const e = entry(id);
      const eventType = str(b.event_type).toUpperCase() || 'UNKNOWN';
      const source = str(b.event_source).toUpperCase() || 'UNKNOWN';
      const plannedMs = ms(b.planned_timestamp), actualMs = ms(b.actual_timestamp);
      const platform = str(b.platform) || null;
      const trainId = str(b.train_id);
      const latenessMin = plannedMs !== null && actualMs !== null ? Math.round(((actualMs - plannedMs) / 60_000) * 10) / 10 : null;
      const delaySec = actualMs !== null ? Math.round((at - actualMs) / 100) / 10 : null;
      e.total++; total++;
      bump(e.byEventType, eventType); bump(e.bySource, source);
      if (platform) { e.platformGiven++; bump(e.byPlatform, platform); } else e.platformMissing++;
      if (plannedMs !== null) e.plannedGiven++; else e.plannedMissing++;
      if (latenessMin !== null) addStat(e.lateness, latenessMin);
      if (delaySec !== null) addStat(e.delay, delaySec);
      const hour = new Date(at).toISOString().slice(0, 13);
      e.perHour.set(hour, (e.perHour.get(hour) ?? 0) + 1);
      while (e.perHour.size > maxHours) e.perHour.delete(e.perHour.keys().next().value);
      e.recent.push({ trainId, headcode: /^[A-Z0-9]{6,32}$/.test(trainId) ? trainId.slice(2, 6) : '', eventType, plannedMs, actualMs,
        latenessMin, platform, source, delaySec, receivedAtMs: at });
      if (e.recent.length > maxRecent) e.recent.shift();
      updatedAt = at; dirty = true;
    }
    if (dirty && file && !timer) { timer = setTimeout(() => { timer = null; flush(); }, flushMs); timer.unref?.(); }
  }

  function snapshot() {
    const out = {};
    for (const id of [...stations.keys()].sort()) {
      const e = stations.get(id);
      out[id] = { total: e.total, byEventType: { ...e.byEventType }, bySource: { ...e.bySource },
        platform: { given: e.platformGiven, missing: e.platformMissing, byPlatform: { ...e.byPlatform } },
        planned: { given: e.plannedGiven, missing: e.plannedMissing },
        lateness: outStat(e.lateness), delay: outStat(e.delay),
        perHour: Object.fromEntries(e.perHour), recent: e.recent.map(r => ({ ...r })) };
    }
    return { enabled: true, stanox: [...wanted], startedAt, updatedAt, total, ignored, stations: out };
  }

  function flush() {
    if (!file || !dirty) return writing;
    dirty = false;
    const body = JSON.stringify(snapshot(), null, 1), tmp = `${file}.tmp`;
    writing = writing.then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(tmp, body, { mode: 0o600 });
      await rename(tmp, file);
    }).catch(() => { dirty = true; });
    return writing;
  }

  async function close() { if (timer) { clearTimeout(timer); timer = null; } await flush(); await writing; }

  return { observe, snapshot, flush, close };
}

// CLI: node relay/trust-probe.mjs [summary.json]   (default <KX_DATA_DIR or ~/kx-data>/trust-probe.json)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFile } = await import('node:fs/promises');
  const os = await import('node:os');
  const f = process.argv[2] ?? path.join(process.env.KX_DATA_DIR ?? path.join(os.homedir(), 'kx-data'), 'trust-probe.json');
  const s = JSON.parse(await readFile(f, 'utf8'));
  for (const [id, e] of Object.entries(s.stations)) {
    console.log(`${id}: ${e.total} events  types ${JSON.stringify(e.byEventType)}  source ${JSON.stringify(e.bySource)}`);
    console.log(`  platform given ${e.platform.given}/${e.platform.given + e.platform.missing} ${JSON.stringify(e.platform.byPlatform)}`);
    console.log(`  lateness min ${JSON.stringify(e.lateness)}  relay delay s ${JSON.stringify(e.delay)}`);
  }
}
