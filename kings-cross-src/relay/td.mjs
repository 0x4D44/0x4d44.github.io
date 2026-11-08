// Train Describer (TD) messages from Network Rail: one STOMP message body is a JSON array
// of single-key objects, e.g. [{"CA_MSG":{"area_id":"Y9","descr":"1A23","from":"2034","to":"1001",...}}].
//
// Normalised events (the schema shared by the live feed, the recorder and the replay):
//   {kind:'step',      area, descr, from, to, time}   C-class CA: description moves berth to berth
//   {kind:'cancel',    area, from, descr}              CB: description removed from a berth
//   {kind:'interpose', area, to, descr}                CC: description placed in a berth
//   {kind:'heartbeat', area, time}                     CT
//   {kind:'sclass',    area, msgType, address, data}   SF/SG/SH: signalling-state bytes
//   {kind:'snapshot', area, berths, sclass, counts, lastEventTime} recorder checkpoint:
//     berths is {berth: description}; sclass is {addresses: count, data: {address: hex}}.
//     The remaining fields have the same shape as GET /snapshot. A checkpoint is recorded
//     at start, UTC-day rollover, each feed connect/reconnect and every ten minutes, and
//     broadcast as an SSE snapshot too. Replay reconciles it instead of treating it as a step.
//     Older {t,e} recordings without checkpoints remain valid; missing history cannot be
//     reconstructed retrospectively. `t` is receive time; `time` below is the TD event time.
//   {kind:'unknown',   area, msgType}
//   {kind:'trust', area, type:'activation'|'movement', trainId, uid, headcode,
//    serviceDate, date, eventType, plannedMs, actualMs, publicMs, variationMinutes,
//    platform, matchMethod, receivedAtMs} TRUST projection (see trust.mjs): uid is null
//     when no service is matched. Only KNGX activations and STANOX 54311 movements are
//     retained; SSE uses `trust` and recordings use the same {t,e} envelope. Timestamp
//     fields are explicit TRUST epochs; these historical actuals are not forecasts.
// `time` is milliseconds since the epoch (or null if absent or unparseable).

function ms(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= 8640000000000000 ? n : null;
}

const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);
const berth = (value) => matches(value, /^[A-Z0-9]{4}$/);
const descr = (value) => matches(value, /^[\x20-\x7e]{4}$/);

// Also guard direct callers (recordings and state callers need not use the wire parser).
export function validTdEvent(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e) || !matches(e.area, /^[A-Z0-9]{2}$/)) return false;
  if (e.time != null && ms(e.time) !== e.time) return false;
  switch (e.kind) {
    case 'step': return berth(e.from) && berth(e.to) && descr(e.descr);
    case 'cancel': return berth(e.from) && descr(e.descr);
    case 'interpose': return berth(e.to) && descr(e.descr);
    case 'heartbeat': return true;
    case 'sclass': return (e.msgType === undefined || ['SF', 'SG', 'SH'].includes(e.msgType)) &&
      matches(e.address, /^[\dA-F]{1,4}$/i) && matches(e.data, /^(?:[\dA-F]{2}){1,4}$/i);
    case 'unknown': return matches(e.msgType, /^[A-Z]{2}$/);
    default: return false;
  }
}

function normalise(msgType, m) {
  const area = m.area_id;
  switch (msgType) {
    case 'CA':
      return { kind: 'step', area, descr: m.descr, from: m.from, to: m.to, time: ms(m.time) };
    case 'CB':
      return { kind: 'cancel', area, from: m.from, descr: m.descr };
    case 'CC':
      return { kind: 'interpose', area, to: m.to, descr: m.descr };
    case 'CT':
      return { kind: 'heartbeat', area, time: ms(m.report_time ?? m.time) };
    case 'SF':
    case 'SG':
    case 'SH':
      return { kind: 'sclass', area, msgType, address: m.address, data: m.data };
    default:
      return { kind: 'unknown', area, msgType };
  }
}

// Parse a MESSAGE body. Throws on invalid JSON or a non-array body.
export function parseTdBody(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('td: body is not an array');
  const events = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    for (const [key, value] of Object.entries(item)) {
      const m = /^([A-Z]{2})_MSG$/.exec(key);
      if (m && value && typeof value === 'object' && !Array.isArray(value)) {
        const event = normalise(m[1], value);
        if (validTdEvent(event)) events.push(event);
      }
    }
  }
  return events;
}

export const inArea = (events, area) => events.filter((e) => e.area === area);
