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
// `time` is milliseconds since the epoch (or null if absent or unparseable).

function ms(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalise(msgType, m) {
  const area = String(m.area_id ?? '');
  switch (msgType) {
    case 'CA':
      return { kind: 'step', area, descr: String(m.descr ?? ''), from: String(m.from ?? ''), to: String(m.to ?? ''), time: ms(m.time) };
    case 'CB':
      return { kind: 'cancel', area, from: String(m.from ?? ''), descr: String(m.descr ?? '') };
    case 'CC':
      return { kind: 'interpose', area, to: String(m.to ?? ''), descr: String(m.descr ?? '') };
    case 'CT':
      return { kind: 'heartbeat', area, time: ms(m.report_time ?? m.time) };
    case 'SF':
    case 'SG':
    case 'SH':
      return { kind: 'sclass', area, msgType, address: String(m.address ?? ''), data: String(m.data ?? '') };
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
      if (m && value && typeof value === 'object') events.push(normalise(m[1], value));
    }
  }
  return events;
}

export const inArea = (events, area) => events.filter((e) => e.area === area);
