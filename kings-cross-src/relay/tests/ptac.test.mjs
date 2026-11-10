// PTAC consumer tests. Every message here is invented (made-up headcodes, UIDs, units and
// times); no real PTAC payload is used. No network: the consumer and kafkajs are fakes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  createPtacStore, decodePtac, kafkaConsumerFactory, ptacEnabled, ptacKey, runPtac, startPtacFromEnv, stationRecord,
  PTAC_GROUP_SERVICE, PTAC_LOGIN_SERVICE,
} from '../ptac.mjs';
import { startRelay } from '../relay.mjs';

const scratch = fileURLToPath(new URL('../../../.scratch/ptac-tests/', import.meta.url));
await mkdir(scratch, { recursive: true });
async function temp(t) { const dir = await mkdtemp(path.join(scratch, 'case-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }

const loc = (tag, tiploc) => `<${tag}><CountryCodeISO>GB</CountryCodeISO><LocationPrimaryCode>00000</LocationPrimaryCode><LocationSubsidiaryIdentification><LocationSubsidiaryCode n1:LocationSubsidiaryTypeCode="0">${tiploc}</LocationSubsidiaryCode><AllocationCompany>0070</AllocationCompany></LocationSubsidiaryIdentification></${tag}>`;
const vehicle = (id) => `<Vehicle><VehicleId>${id}</VehicleId><TypeOfVehicle>C</TypeOfVehicle><Defect><DefectDescription>A &amp; B</DefectDescription></Defect></Vehicle>`;
function allocation({ seq = 1, pos = 1, origin, dest, from, fromTime, to, toTime, unit, fleet, cars }) {
  return `<Allocation><AllocationSequenceNumber>${seq}</AllocationSequenceNumber>${loc('TrainOriginLocation', origin)}<ResourceGroupPosition>${pos}</ResourceGroupPosition>${loc('TrainDestLocation', dest)}`
    + `${loc('AllocationOriginLocation', from)}<AllocationOriginDateTime>${fromTime}</AllocationOriginDateTime>${loc('AllocationDestinationLocation', to)}<AllocationDestinationDateTime>${toTime}</AllocationDestinationDateTime>`
    + `<ResourceGroup><ResourceGroupId>${unit}</ResourceGroupId><TypeOfResource>U</TypeOfResource><FleetId>${fleet}</FleetId>${Array.from({ length: cars }, (_, i) => vehicle(`${unit}${i}`)).join('')}</ResourceGroup></Allocation>`;
}
function message({ headcode = '1Z99', uid = 'Q00001', date = '2001-02-03', ru = '9960', sent = '2001-02-03T05:00:00', origin = 'AAAAAAA', dest = 'BBBBBBB', allocations = [] } = {}) {
  const ids = (company) => `<TransportOperationalIdentifiers><ObjectType>PA</ObjectType><Company>${company}</Company><Core>${headcode}${uid}07</Core><Variant>01</Variant><TimetableYear>2001</TimetableYear><StartDate>${date}</StartDate></TransportOperationalIdentifiers>`;
  return `<?xml version="1.0" encoding="UTF-8"?><PassengerTrainConsistMessage xmlns="http://www.era.europa.eu/schemes/TAFTSI/5.3" xmlns:n1="http://www.era.europa.eu/schemes/TAFTSI/5.3"><MessageHeader><MessageReference><MessageType>9002</MessageType><MessageDateTime>${sent}</MessageDateTime></MessageReference></MessageHeader><MessageStatus>1</MessageStatus>`
    + `<TrainOperationalIdentification>${ids(ru)}${ids('0070')}</TrainOperationalIdentification><OperationalTrainNumberIdentifier><OperationalTrainNumber>${headcode}</OperationalTrainNumber></OperationalTrainNumberIdentifier><ResponsibleRU>${ru}</ResponsibleRU>`
    + `${loc('TrainOriginLocation', origin)}${loc('TrainDestLocation', dest)}`
    + `${allocations.map((a) => allocation({ origin, dest, ...a })).join('')}</PassengerTrainConsistMessage>`;
}
// A through train AAAAAAA -> EDINBUR -> BBBBBBB, two units in front of Edinburgh, one beyond.
const through = () => message({ allocations: [
  { seq: 1, pos: 1, from: 'AAAAAAA', fromTime: '2001-02-03T10:00:00', to: 'EDINBUR', toTime: '2001-02-03T11:00:00', unit: '999001', fleet: '999/0', cars: 3 },
  { seq: 2, pos: 2, from: 'AAAAAAA', fromTime: '2001-02-03T10:00:00', to: 'EDINBUR', toTime: '2001-02-03T11:00:00', unit: '998002', fleet: '998/1', cars: 4 },
  { seq: 3, pos: 1, from: 'EDINBUR', fromTime: '2001-02-03T11:05:00', to: 'BBBBBBB', toTime: '2001-02-03T12:00:00', unit: '999001', fleet: '999/0', cars: 3 },
] });
const T0 = Date.parse('2001-02-03T12:00:00Z');

test('decodes a consist message: headcode, UID from Core, date, RU, segments, units, vehicles', () => {
  for (const raw of [through(), Buffer.from(through())]) {
    const m = decodePtac(raw);
    assert.equal(m.headcode, '1Z99');
    assert.equal(m.uid, 'Q00001');
    assert.equal(m.startDate, '2001-02-03');
    assert.equal(m.ru, '9960');
    assert.equal(m.messageTime, '2001-02-03T05:00:00');
    assert.deepEqual([m.origin, m.dest], ['AAAAAAA', 'BBBBBBB']);
    assert.equal(m.allocations.length, 3);
    assert.deepEqual(m.allocations[1], { position: 2, from: 'AAAAAAA', fromTime: '2001-02-03T10:00:00', to: 'EDINBUR', toTime: '2001-02-03T11:00:00', unit: '998002', fleet: '998/1', vehicles: 4 });
  }
  assert.equal(ptacKey(decodePtac(through())), '2001-02-03 1Z99 Q00001');
  assert.deepEqual(decodePtac(message()).allocations, [], 'a message without Allocation means no consist');
});

test('decoding refuses what is not a consist message', () => {
  assert.throws(() => decodePtac(null));
  assert.throws(() => decodePtac('{"json":true}'), /not a consist message/);
  assert.throws(() => decodePtac(message({ headcode: 'bad!' })), /no headcode/);
  assert.throws(() => decodePtac(message({ date: '3 Feb' })), /no start date/);
  assert.throws(() => decodePtac(`<PassengerTrainConsistMessage>${'x'.repeat(1024 * 1024)}`), /too large/);
  assert.throws(() => decodePtac(message().replace('</PassengerTrainConsistMessage>', '<Allocation><ResourceGroup>')), /unclosed/);
});

test('filtering keeps only trains with a segment starting or ending at Edinburgh, with its formation there', () => {
  const tiplocs = ['EDINBUR'];
  const r = stationRecord(decodePtac(through()), { tiplocs, receivedAt: 5 });
  assert.deepEqual(r, {
    date: '2001-02-03', headcode: '1Z99', uid: 'Q00001', ru: '9960', operator: 'SR',
    edbArr: '2001-02-03T11:00:00', edbDep: '2001-02-03T11:05:00', origin: 'AAAAAAA', dest: 'BBBBBBB',
    classes: ['999', '998'], fleets: ['999/0', '998/1'], units: ['999001', '998002'], unitVehicles: [3, 4], unitFleets: ['999/0', '998/1'], vehicles: 7,
    messageTime: '2001-02-03T05:00:00', receivedAt: 5,
  });
  const elsewhere = message({ allocations: [{ from: 'AAAAAAA', fromTime: '2001-02-03T10:00:00', to: 'BBBBBBB', toTime: '2001-02-03T11:00:00', unit: '999003', fleet: '999/0', cars: 2 }] });
  assert.equal(stationRecord(decodePtac(elsewhere), { tiplocs }), null);
  // Edinburgh only as a passing name in free text must not count.
  assert.equal(stationRecord(decodePtac(elsewhere.replace('A &amp; B', 'EDINBUR')), { tiplocs }), null);
  const starts = message({ ru: '1234', allocations: [{ from: 'EDINBUR', fromTime: '2001-02-03T09:00:00', to: 'BBBBBBB', toTime: '2001-02-03T10:00:00', unit: '999004', fleet: '999/0', cars: 2 }] });
  const s = stationRecord(decodePtac(starts), { tiplocs });
  assert.deepEqual([s.edbArr, s.edbDep, s.vehicles, s.operator, s.ru], [null, '2001-02-03T09:00:00', 2, null, '1234']);
});

test('the store is bounded by date window and size, replaces by key, removes deallocations, and ignores stale versions', async (t) => {
  const dir = await temp(t);
  const file = path.join(dir, 'areas', 'EB', 'ptac.json');
  let now = T0;
  const store = await createPtacStore({ file, maxTrains: 3, now: () => now });
  const put = (headcode, opts = {}) => {
    const m = decodePtac(message({ headcode, ...opts, allocations: opts.allocations ?? [{ from: 'EDINBUR', fromTime: '2001-02-03T09:00:00', to: 'BBBBBBB', toTime: '2001-02-03T10:00:00', unit: '999005', fleet: '999/0', cars: 2 }] }));
    return store.apply(m, stationRecord(m, { tiplocs: ['EDINBUR'], receivedAt: now++ }));
  };
  assert.equal(put('1A01'), 'stored');
  assert.equal(put('1A02'), 'stored');
  assert.equal(put('1A03'), 'stored');
  assert.equal(put('1A04'), 'stored');
  assert.equal(store.size, 3, 'maxTrains bounds the store');
  assert.equal(store.get('2001-02-03 1A01 Q00001'), undefined, 'the oldest is evicted first');
  assert.equal(put('1A02', { sent: '2001-02-03T04:00:00' }), 'ignored', 'an older message does not replace a newer one');
  assert.equal(put('1A03', { allocations: [] }), 'removed', 'a message with no consist removes the train');
  assert.equal(put('1A03', { allocations: [] }), 'ignored');
  assert.equal(put('1A05', { date: '2001-02-07' }), 'stored');
  assert.equal(store.get('2001-02-07 1A05 Q00001'), undefined, 'service dates beyond tomorrow are dropped');
  assert.equal(await store.flush(), true);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const doc = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(doc.format, 'kx-ptac/1');
  assert.deepEqual(Object.keys(doc.trains).sort(), ['2001-02-03 1A02 Q00001', '2001-02-03 1A04 Q00001']);
  assert.equal(await store.flush(), false, 'nothing new, nothing written');
  // Reload keeps what is in the window and drops what has aged out.
  assert.equal((await createPtacStore({ file, now: () => T0 })).size, 2);
  assert.equal((await createPtacStore({ file, now: () => T0 + 3 * 86_400_000 })).size, 0);
  await writeFile(file, 'not json');
  assert.equal((await createPtacStore({ file, now: () => T0 })).size, 0, 'an unreadable store starts empty');
});

test('a store write failure is counted, retried on the next flush, and never thrown', async () => {
  let fail = true;
  const fs = { readFile: async () => { throw new Error('ENOENT'); }, mkdir: async () => {}, chmod: async () => {}, rename: async () => {},
    writeFile: async () => { if (fail) throw new Error('disk full'); } };
  const store = await createPtacStore({ file: '/nonexistent/ptac.json', now: () => T0, fs });
  const m = decodePtac(through());
  store.apply(m, stationRecord(m, { tiplocs: ['EDINBUR'] }));
  assert.equal(await store.flush(), false);
  assert.equal(store.stats().writeFailures, 1);
  fail = false;
  assert.equal(await store.flush(), true);
  assert.equal(store.stats().writes, 1);
});

// Secret-shaped values: if any of them reaches a log, a stat or a store, the test fails.
const SECRETS = { username: 'USER-7f3a9c2e1b8d4f60', password: 'PASS-k9Q2xV7mN4pL8sT1wZ5r', groupId: 'GROUP-3e8b1d6c9a2f7e40' };
const leaks = (text) => Object.values(SECRETS).filter((s) => text.includes(s));

function harness({ readCredentials = async () => ({ ...SECRETS }), createConsumer, store } = {}) {
  const logs = [], timers = [];
  const handle = runPtac({
    enabled: true, readCredentials, createConsumer, log: (l) => logs.push(l), now: () => T0,
    store: store ?? { apply: () => 'stored', flush: async () => false, stats: () => ({ trains: 0 }) },
    setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: () => {},
    schedule: () => ({}), unschedule: () => {},
  });
  return { handle, logs, timers };
}
const settle = () => new Promise((r) => setImmediate(r));

test('no secret reaches a log, the health counts or the store, whatever fails', async (t) => {
  const dir = await temp(t);
  const store = await createPtacStore({ file: path.join(dir, 'ptac.json'), now: () => T0 });
  let calls = 0, deliver, failure;
  const createConsumer = async (creds, { onMessage, onFailure }) => {
    calls += 1;
    if (calls === 1) throw new Error(`SASL authentication failed for ${creds.username}:${creds.password} group ${creds.groupId}`);
    deliver = onMessage; failure = onFailure;
    return { stop: async () => { throw new Error(`stop ${creds.password}`); } };
  };
  const { handle, logs, timers } = harness({ createConsumer, store });
  await settle();
  assert.equal(handle.stats().state, 'backoff');
  timers.shift().fn();
  await settle();
  assert.equal(handle.stats().state, 'connected');
  deliver(Buffer.from(`<garbage ${SECRETS.password}>`));
  deliver(Buffer.from(through()));
  failure();
  await settle();
  await store.flush();
  await handle.stop();
  const seen = [...logs, JSON.stringify(handle.stats()), await readFile(path.join(dir, 'ptac.json'), 'utf8')].join('\n');
  assert.deepEqual(leaks(seen), []);
  assert.ok(logs.length >= 3, 'the failures were logged (as fixed text)');
  assert.ok(logs.every((l) => /^ptac: (connected|keychain lookup failed|connection unavailable, reconnecting in \d+s)$/.test(l)), logs.join('|'));
});

test('the kafkajs adapter passes the login only to kafkajs, silences kafkajs logs and reports a crash', async () => {
  const seen = {};
  const handlers = {};
  class Kafka {
    constructor(config) { seen.config = config; }
    consumer(opts) {
      seen.consumer = opts;
      return {
        events: { CRASH: 'consumer.crash' },
        on: (event, fn) => { handlers[event] = fn; },
        connect: async () => {},
        subscribe: async (s) => { seen.subscribe = s; },
        run: async ({ eachMessage }) => { seen.eachMessage = eachMessage; },
        disconnect: async () => { seen.disconnected = true; },
      };
    }
  }
  let failed = 0; const values = [];
  const factory = kafkaConsumerFactory({ Kafka, logLevel: { NOTHING: 0 } });
  const session = await factory({ ...SECRETS }, { onMessage: (v) => values.push(v), onFailure: () => { failed += 1; } });
  assert.deepEqual(seen.config.sasl, { mechanism: 'plain', username: SECRETS.username, password: SECRETS.password });
  assert.equal(seen.config.ssl, true);
  assert.equal(seen.config.logLevel, 0);
  assert.equal(seen.config.logCreator()({ log: { message: SECRETS.password } }), undefined);
  assert.equal(seen.consumer.groupId, SECRETS.groupId);
  assert.equal(await seen.consumer.retry.restartOnFailure(new Error('x')), false, 'reconnection belongs to runPtac');
  assert.equal(seen.subscribe.topic, 'prod-1033-Passenger-Train-Allocation-and-Consist-1_0');
  await seen.eachMessage({ message: { value: 'v' } });
  assert.deepEqual(values, ['v']);
  handlers['consumer.crash']({ payload: { error: new Error(SECRETS.password) } });
  assert.equal(failed, 1);
  await session.stop();
  assert.equal(seen.disconnected, true);
});

test('PTAC is off by default: nothing is imported, no keychain item is read, health says disabled', async (t) => {
  for (const value of [undefined, '', '0', 'true', 'yes']) assert.equal(ptacEnabled({ KX_PTAC: value }), false);
  assert.equal(ptacEnabled({ KX_PTAC: '1' }), true);
  const handle = await startPtacFromEnv({}, { dataDir: '/nonexistent', readKeychain: () => assert.fail('keychain read'), importKafka: () => assert.fail('kafkajs loaded') });
  assert.equal(handle, null);
  const disabled = runPtac({ readCredentials: () => assert.fail('keychain read'), createConsumer: () => assert.fail('consumer'), store: null });
  assert.equal(disabled.stats().state, 'disabled');
  await disabled.stop();
  const dir = await temp(t);
  const relay = await startRelay({ area: 'Y9', topic: 'synthetic', dataDir: dir, feedEnabled: false });
  t.after(() => relay.close());
  const health = JSON.parse(await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: relay.port, path: '/health' }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => resolve(s)); }).on('error', reject);
  }));
  assert.deepEqual(health.ptac, { state: 'disabled' });
});

test('when enabled, the keychain items read are the PTAC ones and the counts reach /health', async (t) => {
  const dir = await temp(t);
  const services = [];
  const readKeychain = async ({ service }) => { services.push(service); return { account: service === PTAC_LOGIN_SERVICE ? SECRETS.username : 'group', secret: service === PTAC_LOGIN_SERVICE ? SECRETS.password : SECRETS.groupId }; };
  let creds;
  class Kafka {
    constructor(c) { creds = c.sasl; }
    consumer(o) { creds = { ...creds, groupId: o.groupId }; return { events: {}, on() {}, connect: async () => {}, subscribe: async () => {}, run: async () => {}, disconnect: async () => {} }; }
  }
  const handle = await startPtacFromEnv({ KX_PTAC: '1' }, { dataDir: dir, readKeychain, importKafka: async () => ({ default: { Kafka, logLevel: { NOTHING: 0 } } }) });
  t.after(() => handle.stop());
  await settle(); await settle();
  assert.deepEqual(services, [PTAC_LOGIN_SERVICE, PTAC_GROUP_SERVICE]);
  assert.deepEqual(creds, { mechanism: 'plain', username: SECRETS.username, password: SECRETS.password, groupId: SECRETS.groupId });
  assert.equal(handle.stats().state, 'connected');
  const relay = await startRelay({ area: 'Y9', topic: 'synthetic', dataDir: dir, feedEnabled: false, ptac: handle });
  t.after(() => relay.close());
  const text = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: relay.port, path: '/health' }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => resolve(s)); }).on('error', reject);
  });
  const health = JSON.parse(text);
  assert.equal(health.ptac.state, 'connected');
  assert.equal(health.ptac.connects, 1);
  assert.deepEqual(leaks(text), []);
});

test('failures stay inside PTAC: keychain, connect, crash and a throwing store back off and retry, never throw', async () => {
  let keychainFails = 1, connects = 0, failure;
  const readCredentials = async () => { if (keychainFails-- > 0) throw new Error('keychain'); return { ...SECRETS }; };
  const createConsumer = async (_c, { onFailure }) => { connects += 1; if (connects === 1) throw new Error('refused'); failure = onFailure; return { stop: async () => {} }; };
  const store = { apply: () => { throw new Error('store broke'); }, flush: async () => { throw new Error('disk'); }, stats: () => ({}) };
  const { handle, timers } = harness({ readCredentials, createConsumer, store });
  await settle();
  assert.equal(handle.stats().state, 'backoff');
  assert.equal(timers.at(-1).ms, 5000);
  timers.at(-1).fn(); await settle();
  assert.equal(handle.stats().state, 'backoff');
  assert.equal(timers.at(-1).ms, 10000, 'backoff doubles');
  timers.at(-1).fn(); await settle();
  assert.equal(handle.stats().state, 'connected');
  failure();
  failure(); // a second crash report for the same session is ignored
  await settle();
  assert.equal(handle.stats().failures, 3);
  assert.equal(timers.at(-1).ms, 5000, 'a successful connect resets the backoff');
  timers.at(-1).fn(); await settle();
  assert.equal(handle.stats().state, 'connected');
  await handle.stop();
  assert.equal(handle.stats().state, 'stopped');
});

test('a message that breaks decoding or the store is counted, not thrown', async () => {
  let onMessage;
  const store = { apply: () => { throw new Error('store broke'); }, flush: async () => false, stats: () => ({}) };
  const { handle } = harness({ store, createConsumer: async (_c, h) => { onMessage = h.onMessage; return { stop: async () => {} }; } });
  await settle();
  assert.doesNotThrow(() => onMessage(Buffer.from('nonsense')));
  assert.doesNotThrow(() => onMessage(Buffer.from(through())));
  assert.doesNotThrow(() => onMessage(undefined));
  const s = handle.stats();
  assert.equal(s.messages, 3);
  assert.equal(s.badMessages, 3);
  assert.equal(s.lastMessageAgeMs, 0);
  await handle.stop();
});
