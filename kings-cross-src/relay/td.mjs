// Train Describer (TD) messages from Network Rail: one STOMP message body is a JSON array
// of single-key objects, e.g. [{"CA_MSG":{"area_id":"Y9","descr":"1A23","from":"2034","to":"1001",...}}].
//
// Normalised events (the schema shared by the live feed, the recorder and the replay):
//   {kind:'step',      area, descr, from, to, time}   C-class CA: description moves berth to berth
//   {kind:'cancel',    area, from, descr}              CB: description removed from a berth
//   {kind:'interpose', area, to, descr}                CC: description placed in a berth
//   {kind:'heartbeat', area, time}                     CT
//   {kind:'sclass',    area, msgType, address, data}   SF/SG/SH: signalling-state bytes
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
