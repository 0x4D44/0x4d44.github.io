// Opt-in TD census (KX_TD_CENSUS=1, off by default): which train describer areas does the
// TD_ALL_SIG_AREA topic carry, and which (description, berth) pairs appear in each one?
// It exists to find an area that SMART does not list (for example Perth's) by watching where
// known headcodes appear at their timetabled times.
//
// Read-only and in memory: it sees every parsed event before the area allowlist, records
// nothing to disk and never changes what the configured areas receive. Memory is bounded:
// the window closes `windowMs` after the first event (later events are counted as `late`
// only), and the area and pair tables have fixed caps whose overflow is counted, not kept.
//
// GET /census (loopback relay route) returns:
//   {enabled, startedAt, closesAt, closed, late, droppedAreas, droppedPairs, pairs,
//    areas: {AREA: {messages, kinds: {step, cancel, interpose, heartbeat, sclass, unknown},
//            configured, firstAt, lastAt, pairs?: [{descr, berth, n, first, last}], droppedPairs?}}}
// Pairs are kept only for areas outside the configured allowlist. `first`/`last` are TD
// source times when present, else relay receive times, in epoch milliseconds.

export const CENSUS_DEFAULTS = Object.freeze({
  windowMs: 2 * 60 * 60 * 1000,
  maxAreas: 256,
  maxPairsPerArea: 4000,
  maxPairs: 100_000,
});

const KINDS = ['step', 'cancel', 'interpose', 'heartbeat', 'sclass', 'unknown'];

/** The berth a description occupies (or leaves) after this event, or null. */
function berthOf(e) {
  if (e.kind === 'step' || e.kind === 'interpose') return e.to;
  if (e.kind === 'cancel') return e.from;
  return null;
}

export function createCensus({ configured = [], now = Date.now, ...limits } = {}) {
  const { windowMs, maxAreas, maxPairsPerArea, maxPairs } = { ...CENSUS_DEFAULTS, ...limits };
  const allow = new Set(configured);
  const areas = new Map();
  let startedAt = null, late = 0, droppedAreas = 0, droppedPairs = 0, pairs = 0;

  function areaEntry(id) {
    let entry = areas.get(id);
    if (entry) return entry;
    if (areas.size >= maxAreas) return null;
    entry = { messages: 0, kinds: Object.fromEntries(KINDS.map(k => [k, 0])), firstAt: null, lastAt: null, pairs: allow.has(id) ? null : new Map(), droppedPairs: 0 };
    areas.set(id, entry);
    return entry;
  }

  function record(events) {
    const t = now();
    if (startedAt === null) startedAt = t;
    if (t - startedAt >= windowMs) { late += events.length; return; }
    for (const e of events) {
      if (!e || typeof e.area !== 'string') continue;
      const entry = areaEntry(e.area);
      if (!entry) { droppedAreas++; continue; }
      entry.messages++;
      if (Object.hasOwn(entry.kinds, e.kind)) entry.kinds[e.kind]++;
      entry.firstAt ??= t;
      entry.lastAt = t;
      const berth = berthOf(e);
      if (!entry.pairs || berth === null || typeof e.descr !== 'string') continue;
      const key = `${e.descr}|${berth}`;
      const at = typeof e.time === 'number' ? e.time : t;
      const pair = entry.pairs.get(key);
      if (pair) {
        pair.n++;
        if (at < pair.first) pair.first = at;
        if (at > pair.last) pair.last = at;
      } else if (entry.pairs.size >= maxPairsPerArea || pairs >= maxPairs) {
        entry.droppedPairs++; droppedPairs++;
      } else {
        entry.pairs.set(key, { descr: e.descr, berth, n: 1, first: at, last: at });
        pairs++;
      }
    }
  }

  function snapshot() {
    const out = {};
    for (const id of [...areas.keys()].sort()) {
      const { pairs: table, droppedPairs: dropped, ...rest } = areas.get(id);
      out[id] = { ...rest, kinds: { ...rest.kinds }, configured: allow.has(id) };
      if (table) {
        out[id].pairs = [...table.values()].map(p => ({ ...p })).sort((a, b) => a.first - b.first || (a.descr < b.descr ? -1 : 1));
        out[id].droppedPairs = dropped;
      }
    }
    return {
      enabled: true, startedAt, closesAt: startedAt === null ? null : startedAt + windowMs,
      closed: startedAt !== null && now() - startedAt >= windowMs,
      late, droppedAreas, droppedPairs, pairs, areas: out,
    };
  }

  return { record, snapshot };
}
