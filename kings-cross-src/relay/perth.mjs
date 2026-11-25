import { headcodeFrom } from './trust.mjs';

export const PERTH_STANOX = '03140';
const directions = new Set(['north', 'east', 'south']);
const tiploc = value => typeof value === 'string' && /^[A-Z0-9]{1,8}$/.test(value);
const stamp = value => Number.isSafeInteger(value) && value > 0 && value <= 8.64e15 ? value : null;
const platform = value => typeof value === 'string' && /^[A-Z0-9]{1,8}$/i.test(value) ? value.toUpperCase() : null;
const rowsOf = corpus => Array.isArray(corpus?.TIPLOCDATA) ? corpus.TIPLOCDATA : [];

export function findPerthTiplocs(corpus, { stanox, tiploc: specified }) {
  if (specified !== undefined) return tiploc(specified) ? [specified] : [];
  const matching = rowsOf(corpus).filter(row => String(row?.STANOX).trim().padStart(5, '0') === stanox);
  const unique = rows => [...new Set(rows.map(row => String(row.TIPLOC ?? '').trim()).filter(tiploc))];
  const named = unique(matching.filter(row => [row.NLCDESC, row.NLCDESC16].some(name => String(name ?? '').trim().toUpperCase() === 'PERTH')));
  const candidates = named.length ? named : unique(matching);
  return candidates.length === 1 ? candidates : [];
}

// Public geography around the three ends of the model. A nearest matching CIF location
// wins. The optional private TIPLOC map covers aliases and other timing points.
const routeNames = {
  north: /\b(DUNKELD|BIRNAM|PITLOCHRY|BLAIR ATHOLL|DALWHINNIE|KINGUSSIE|AVIEMORE|INVERNESS|STANLEY)\b/,
  east: /\b(DUNDEE|INVERGOWRIE|LONGFORGAN|ERROL|CAMPERDOWN|CARNOUSTIE|ARBROATH|MONTROSE|ABERDEEN)\b/,
  south: /\b(HILTON|FORGANDENNY|DUNNING|AUCHTERARDER|GLENEAGLES|BLACKFORD|DUNBLANE|STIRLING|LARBERT|ALLOA|GLASGOW)\b/,
};

export function perthDirections(corpus, overrides = {}) {
  const byTip = new Map();
  for (const row of rowsOf(corpus)) {
    const id = String(row?.TIPLOC ?? '').trim();
    if (!tiploc(id)) continue;
    const name = `${row.NLCDESC ?? ''} ${row.NLCDESC16 ?? ''}`.toUpperCase();
    const hits = Object.entries(routeNames).filter(([, re]) => re.test(name));
    if (hits.length === 1) byTip.set(id, hits[0][0]);
  }
  for (const [id, direction] of Object.entries(overrides ?? {})) if (tiploc(id) && directions.has(direction)) byTip.set(id, direction);
  return locations => (Array.isArray(locations) ? locations : []).map(id => byTip.get(id)).find(Boolean) ?? null;
}

export function perthCall(row) {
  if (typeof row?.uid !== 'string' || !/^[A-Z0-9]{1,12}$/.test(row.uid) ||
      typeof row.headcode !== 'string' || !/^[0-9][A-Z][0-9]{2}$/.test(row.headcode)) return null;
  const arrivalMs = stamp(row.arrivalMs), departureMs = stamp(row.departureMs), passMs = stamp(row.passMs);
  if (arrivalMs === null && departureMs === null && passMs === null) return null;
  return { uid: row.uid, headcode: row.headcode, platform: platform(row.platform), arrivalMs, departureMs, passMs,
    from: directions.has(row.from) ? row.from : null, to: directions.has(row.to) ? row.to : null };
}

export function perthReport(row) {
  const headcode = typeof row?.trainId === 'string' && headcodeFrom(row.trainId);
  const actualMs = stamp(row?.actualMs), receivedAtMs = stamp(row?.receivedAtMs);
  const eventType = row?.plannedEventType === 'PASS' && row.eventType === 'DEPARTURE' ? 'PASS' : row?.eventType;
  if (!headcode || actualMs === null || receivedAtMs === null || !['ARRIVAL', 'DEPARTURE', 'PASS'].includes(eventType)) return null;
  return { headcode, eventType, plannedMs: stamp(row.plannedMs), actualMs, receivedAtMs, platform: platform(row.platform) };
}
