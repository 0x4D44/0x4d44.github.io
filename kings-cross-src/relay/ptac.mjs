// Passenger Train Allocation and Consist (PTAC): which units Network Rail says each train
// is planned to run with. Read from Arthur's Rail Data Marketplace subscription (Kafka on
// Confluent Cloud, SASL PLAIN over TLS) and kept as a private, bounded per-area store,
// <KX_DATA_DIR>/areas/EB/ptac.json, for the Edinburgh fleet matcher.
//
// Off unless KX_PTAC=1. The consumer login and the consumer group id come from the macOS
// keychain at runtime (items kx-rdm-ptac and kx-rdm-ptac-group) and are never logged,
// returned or written: every log line here is a fixed string with counts only.
//
// Message format (learnt from the live topic; the RDM schema section is empty): one
// TAF-TSI PassengerTrainConsistMessage XML document per Kafka message, MessageType 9002,
// Kafka header TOC = the numeric TAF company code of the operator. Per train:
//   OperationalTrainNumber          the headcode (what a train describer shows)
//   TransportOperationalIdentifiers Core = headcode + CIF train UID + origin hour, StartDate
//   ResponsibleRU                   numeric TAF company code (mapped to ATOC below)
//   Allocation*                     one per route segment and unit: AllocationOrigin/
//                                   DestinationLocation (TIPLOC in LocationSubsidiaryCode)
//                                   and DateTime (local wall time, no zone), and one
//                                   ResourceGroup (unit number, FleetId "158/7", Vehicle*).
// A message for a train replaces the previous one; a message with no Allocation means the
// train currently has no consist.
//
// Key: "<StartDate> <headcode> <UID>". A headcode repeats in a day and a UID repeats across
// days, so neither alone is unique; the planned time at the station (edbArr/edbDep) then
// picks between same-headcode trains when a describer sighting is matched.
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const PTAC_TOPIC = 'prod-1033-Passenger-Train-Allocation-and-Consist-1_0';
export const PTAC_BROKER = 'pkc-z3p1v0.europe-west2.gcp.confluent.cloud:9092';
export const PTAC_LOGIN_SERVICE = 'kx-rdm-ptac';
export const PTAC_GROUP_SERVICE = 'kx-rdm-ptac-group';
export const PTAC_FORMAT = 'kx-ptac/1';

// TAF company code -> ATOC code. Codes are entered only where a real sample showed the
// operator's own fleet under that code (e.g. 9960 with 158/7, 334, 385; 9965 with 390).
export const RU_TO_ATOC = Object.freeze({
  9960: 'SR', // ScotRail
  9965: 'VT', // Avanti West Coast
  9927: 'XC', // CrossCountry
  9923: 'NT', // Northern
  9971: 'AW', // Transport for Wales
  9979: 'CC', // c2c
});

const MAX_MESSAGE_BYTES = 1024 * 1024;
const DAY_MS = 86_400_000;

// --- decoding ------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITIES[e]).trim();

/** Inner text of the first <tag> element (attributes allowed), or null. */
function text(xml, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(xml);
  return m ? unescape(m[1]) : null;
}

/** Inner XML of each non-nested <tag>...</tag> element, in order. */
function blocks(xml, tag) {
  const out = [];
  const open = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'g');
  const close = `</${tag}>`;
  let m;
  while ((m = open.exec(xml))) {
    const end = xml.indexOf(close, open.lastIndex);
    if (end < 0) throw new Error(`unclosed ${tag}`);
    out.push(xml.slice(open.lastIndex, end));
    open.lastIndex = end + close.length;
  }
  return out;
}

const tiploc = (xml, tag) => {
  const block = blocks(xml, tag)[0];
  return block === undefined ? null : text(block, 'LocationSubsidiaryCode');
};

/** Decode one PTAC message (string or Buffer). Throws on anything that is not one. */
export function decodePtac(raw) {
  if (raw == null) throw new Error('empty message');
  const length = typeof raw === 'string' ? Buffer.byteLength(raw) : raw.length;
  if (length > MAX_MESSAGE_BYTES) throw new Error('message too large');
  const xml = typeof raw === 'string' ? raw : raw.toString('utf8');
  if (!xml.includes('<PassengerTrainConsistMessage')) throw new Error('not a consist message');
  const headcode = text(xml, 'OperationalTrainNumber');
  const ids = blocks(xml, 'TransportOperationalIdentifiers')[0] ?? '';
  const core = text(ids, 'Core');
  const startDate = text(ids, 'StartDate');
  if (!headcode || !/^[0-9A-Z]{4}$/.test(headcode)) throw new Error('no headcode');
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('no start date');
  const uid = core && core.startsWith(headcode) && /^[A-Z]\d{5}$/.test(core.slice(4, 10)) ? core.slice(4, 10) : null;
  const allocations = blocks(xml, 'Allocation').map((a) => {
    const group = blocks(a, 'ResourceGroup')[0] ?? '';
    return {
      position: Number(text(a, 'ResourceGroupPosition')) || 0,
      from: tiploc(a, 'AllocationOriginLocation'),
      fromTime: text(a, 'AllocationOriginDateTime'),
      to: tiploc(a, 'AllocationDestinationLocation'),
      toTime: text(a, 'AllocationDestinationDateTime'),
      unit: text(group, 'ResourceGroupId'),
      fleet: text(group, 'FleetId'),
      vehicles: blocks(group, 'Vehicle').length,
    };
  });
  return {
    messageTime: text(xml, 'MessageDateTime'),
    headcode,
    uid,
    startDate,
    ru: text(xml, 'ResponsibleRU'),
    origin: tiploc(xml, 'TrainOriginLocation'),
    dest: tiploc(xml, 'TrainDestLocation'),
    allocations,
  };
}

export const ptacKey = (msg) => `${msg.startDate} ${msg.headcode} ${msg.uid ?? '-'}`;

/**
 * The train's planned formation at one of `tiplocs`, or null when no allocation segment
 * starts or ends there. Units are the union (de-duplicated, by formation position) of the
 * segments arriving at and leaving the station.
 */
export function stationRecord(msg, { tiplocs, receivedAt = Date.now() }) {
  const at = new Set(tiplocs);
  const arriving = msg.allocations.filter((a) => at.has(a.to));
  const leaving = msg.allocations.filter((a) => at.has(a.from));
  if (!arriving.length && !leaving.length) return null;
  const earliest = (times) => times.filter(Boolean).sort()[0] ?? null;
  const units = [], unitVehicles = [], fleets = [], classes = [];
  for (const a of [...leaving, ...arriving].sort((x, y) => x.position - y.position)) {
    const id = a.unit ?? `?${units.length}`;
    if (units.includes(id)) continue;
    units.push(id);
    unitVehicles.push(a.vehicles);
    if (a.fleet && !fleets.includes(a.fleet)) fleets.push(a.fleet);
    const cls = a.fleet ? a.fleet.split('/')[0] : null;
    if (cls && !classes.includes(cls)) classes.push(cls);
  }
  return {
    date: msg.startDate,
    headcode: msg.headcode,
    uid: msg.uid,
    ru: msg.ru,
    operator: RU_TO_ATOC[msg.ru] ?? null,
    edbArr: earliest(arriving.map((a) => a.toTime)),
    edbDep: earliest(leaving.map((a) => a.fromTime)),
    origin: msg.origin,
    dest: msg.dest,
    classes,
    fleets,
    units,
    unitVehicles,
    vehicles: unitVehicles.reduce((n, v) => n + v, 0),
    messageTime: msg.messageTime,
    receivedAt,
  };
}

// --- store ---------------------------------------------------------------------------

const londonDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

/** Private, bounded store: service dates from yesterday to tomorrow (London), maxTrains. */
export async function createPtacStore({ file, area = 'EB', tiplocs = ['EDINBUR'], maxTrains = 4000, now = Date.now, fs = { readFile, writeFile, rename, chmod, mkdir } }) {
  const trains = new Map();
  let writes = 0, writeFailures = 0, dirty = false, removed = 0, evicted = 0;
  try {
    const doc = JSON.parse(await fs.readFile(file, 'utf8'));
    if (doc?.format === PTAC_FORMAT && doc.trains && typeof doc.trains === 'object')
      for (const [key, record] of Object.entries(doc.trains)) if (record && typeof record.date === 'string') trains.set(key, record);
  } catch { /* No store yet, or an unreadable one: start empty and overwrite. */ }

  function prune() {
    const t = now(), first = londonDate(t - DAY_MS), last = londonDate(t + DAY_MS);
    for (const [key, r] of trains) if (r.date < first || r.date > last) { trains.delete(key); evicted += 1; dirty = true; }
    if (trains.size > maxTrains) {
      const oldest = [...trains].sort((a, b) => (a[1].receivedAt ?? 0) - (b[1].receivedAt ?? 0));
      for (const [key] of oldest.slice(0, trains.size - maxTrains)) { trains.delete(key); evicted += 1; }
      dirty = true;
    }
  }
  prune();

  return {
    /** Apply one decoded message. Returns 'stored', 'removed' or 'ignored'. */
    apply(msg, record) {
      const key = ptacKey(msg);
      if (record) {
        const old = trains.get(key);
        if (old && old.messageTime && record.messageTime && record.messageTime < old.messageTime) return 'ignored';
        trains.delete(key); // re-insert so insertion order follows freshness
        trains.set(key, record);
        dirty = true;
        prune();
        return 'stored';
      }
      if (trains.delete(key)) { removed += 1; dirty = true; return 'removed'; }
      return 'ignored';
    },
    get: (key) => trains.get(key),
    get size() { return trains.size; },
    get dirty() { return dirty; },
    async flush() {
      if (!dirty) return false;
      prune();
      dirty = false;
      const doc = { format: PTAC_FORMAT, area, tiplocs, updatedAt: new Date(now()).toISOString(), trains: Object.fromEntries(trains) };
      const tmp = `${file}.tmp`;
      try {
        await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        await fs.writeFile(tmp, JSON.stringify(doc), { mode: 0o600 });
        await fs.chmod(tmp, 0o600);
        await fs.rename(tmp, file);
        writes += 1;
        return true;
      } catch {
        writeFailures += 1;
        dirty = true;
        return false;
      }
    },
    stats: () => ({ trains: trains.size, writes, writeFailures, removed, evicted, maxTrains }),
  };
}

// --- consumer ------------------------------------------------------------------------

/** Adapter over the kafkajs module; `kafkajs` is injected so tests need no network. */
export function kafkaConsumerFactory(kafkajs, { brokers = [PTAC_BROKER], topic = PTAC_TOPIC, clientId = 'kx-relay-ptac' } = {}) {
  const { Kafka, logLevel } = kafkajs;
  return async ({ username, password, groupId }, { onMessage, onFailure }) => {
    const kafka = new Kafka({
      clientId, brokers, ssl: true,
      sasl: { mechanism: 'plain', username, password },
      // kafkajs log lines can carry broker and SASL detail: discard them all.
      logLevel: logLevel.NOTHING, logCreator: () => () => {},
      connectionTimeout: 15_000, retry: { retries: 3 },
    });
    // The caller owns reconnection (with its own backoff), so kafkajs must not restart.
    const consumer = kafka.consumer({ groupId, retry: { retries: 3, restartOnFailure: async () => false } });
    consumer.on(consumer.events.CRASH, () => onFailure());
    try {
      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: true });
      await consumer.run({ eachMessage: async ({ message }) => onMessage(message.value) });
    } catch (err) {
      await consumer.disconnect().catch(() => {});
      throw err;
    }
    return { stop: () => consumer.disconnect() };
  };
}

/**
 * Keep one PTAC consumer alive and feed the store. Never throws and never rejects: every
 * failure becomes a counted backoff. Logs are fixed strings (no error text, no secrets).
 */
export function runPtac({
  enabled = false,
  readCredentials, // () => Promise<{ username, password, groupId }>
  createConsumer, // (creds, { onMessage, onFailure }) => Promise<{ stop }>
  store,
  tiplocs = ['EDINBUR'],
  log = () => {},
  now = Date.now,
  backoff = { minMs: 5_000, maxMs: 300_000 },
  flushMs = 30_000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  schedule = setInterval,
  unschedule = clearInterval,
}) {
  const counts = { messages: 0, relevant: 0, stored: 0, removed: 0, ignored: 0, badMessages: 0, connects: 0, failures: 0 };
  let state = enabled ? 'connecting' : 'disabled';
  let stopped = !enabled, session = null, timer = null, delay = backoff.minMs, lastMessageAt = null, generation = 0;

  const say = (line) => { try { log(line); } catch { /* a broken logger must not stop the consumer */ } };

  function onMessage(value) {
    counts.messages += 1;
    lastMessageAt = now();
    try {
      const msg = decodePtac(value);
      const record = stationRecord(msg, { tiplocs, receivedAt: lastMessageAt });
      if (record) counts.relevant += 1;
      counts[store.apply(msg, record)] += 1;
    } catch { counts.badMessages += 1; }
  }

  function fail(gen) {
    if (stopped || gen !== generation) return;
    generation += 1;
    counts.failures += 1;
    const old = session;
    session = null;
    Promise.resolve().then(() => old?.stop()).catch(() => {});
    state = 'backoff';
    say(`ptac: connection unavailable, reconnecting in ${Math.round(delay / 1000)}s`);
    timer = setTimer(attempt, delay);
    timer?.unref?.();
    delay = Math.min(delay * 2, backoff.maxMs);
  }

  async function attempt() {
    if (stopped) return;
    const gen = generation;
    state = 'connecting';
    let creds;
    try { creds = await readCredentials(); }
    catch { say('ptac: keychain lookup failed'); return fail(gen); }
    if (stopped || gen !== generation) return;
    try {
      const s = await createConsumer(creds, { onMessage, onFailure: () => fail(gen) });
      creds = null;
      if (stopped || gen !== generation) { await s?.stop?.(); return; }
      session = s;
      state = 'connected';
      counts.connects += 1;
      delay = backoff.minMs;
      say('ptac: connected');
    } catch { fail(gen); }
  }

  const flusher = enabled ? schedule(() => { store.flush().catch(() => {}); }, flushMs) : null;
  flusher?.unref?.();
  if (enabled) attempt().catch(() => fail(generation));

  return {
    stats: () => ({
      state,
      ...counts,
      lastMessageAgeMs: lastMessageAt === null ? null : now() - lastMessageAt,
      store: store ? store.stats() : null,
    }),
    async stop() {
      if (state === 'disabled') return;
      stopped = true;
      state = 'stopped';
      if (timer) clearTimer(timer);
      if (flusher) unschedule(flusher);
      try { await session?.stop(); } catch { /* already gone */ }
      session = null;
      await store?.flush().catch(() => {});
    },
  };
}

/** True only for KX_PTAC=1: PTAC is off by default. */
export const ptacEnabled = (env) => env.KX_PTAC === '1';

/**
 * Wire PTAC from the environment. Returns null (and loads nothing, reads no keychain item)
 * unless KX_PTAC=1.
 */
export async function startPtacFromEnv(env, { dataDir, readKeychain, log, importKafka = () => import('kafkajs') }) {
  if (!ptacEnabled(env)) return null;
  const kafkajs = await importKafka();
  const store = await createPtacStore({ file: path.join(dataDir, 'areas', 'EB', 'ptac.json') });
  return runPtac({
    enabled: true,
    store,
    log,
    createConsumer: kafkaConsumerFactory(kafkajs.default ?? kafkajs),
    readCredentials: async () => {
      const login = await readKeychain({ service: PTAC_LOGIN_SERVICE });
      const group = await readKeychain({ service: PTAC_GROUP_SERVICE });
      return { username: login.account, password: login.secret, groupId: group.secret };
    },
  });
}
