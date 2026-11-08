import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeRelaySecurity } from '../axis07-relay.mjs';

const scratch = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.scratch/axis07-relay-tests');
const markers = {
  account: 'AXIS07_TEST_ACCOUNT_MARKER',
  secret: 'AXIS07_TEST_SECRET_MARKER',
  canary: 'AXIS07_TEST_CANARY_MARKER',
};
await mkdir(scratch, { recursive: true });
after(() => rm(scratch, { recursive: true, force: true }));

async function caseDir(t) {
  const dir = await mkdtemp(path.join(scratch, 'case-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function fakeDependencies(model = {}) {
  const port = 43217;
  const response = (status, body = '', headers = {}) => ({ status, body, headers: model.cors ? { ...headers, 'access-control-allow-origin': '*' } : headers });
  return {
    markers,
    networkInterfaces: () => model.nicAddress ? ({ fake0: [{ family: 'IPv4', address: model.nicAddress, internal: false }] }) : ({}),
    startRelay: async (options) => {
      assert.equal(options.port, 0);
      assert.equal(options.feedEnabled, true);
      assert.equal(options.scheduleEnabled, false);
      const login = await options.readCredentials();
      assert.equal(login.account, markers.account);
      assert.equal(login.secret, markers.secret);
      if (model.logLeak) options.log(`synthetic error ${markers.secret}`);
      return {
        host: model.host ?? '127.0.0.1',
        port,
        async close() {
          const recordings = path.join(options.dataDir, 'recordings');
          await mkdir(recordings, { recursive: true });
          const content = model.recordingLeak ? markers.account : JSON.stringify({ t: 1, e: { kind: 'step', area: 'ZZ', descr: '1Z91' } });
          await writeFile(path.join(recordings, 'td-ZZ-20261108.ndjson'), `${content}\n`, { mode: 0o600 });
        },
      };
    },
    request: async (_port, pathname, { connectHost = '127.0.0.1', method = 'GET', headers = {} }) => {
      if (connectHost !== '127.0.0.1') {
        if (model.nicReachable) return response(200, JSON.stringify({ ok: true }));
        throw Object.assign(new Error('synthetic refusal'), { code: 'ECONNREFUSED' });
      }
      const goodHost = headers.host === `127.0.0.1:${port}` || headers.host === `localhost:${port}`;
      if (!goodHost && !model.acceptBadHost) return response(403, JSON.stringify({ error: 'host not allowed' }));
      if (headers.origin === 'https://attacker.invalid' && !model.acceptHostileOrigin) return response(403, JSON.stringify({ error: 'host not allowed' }));
      if (method !== 'GET' && !model.acceptPost) return response(405, JSON.stringify({ error: 'GET only' }));
      if (pathname === '/health') return response(200, JSON.stringify({ feed: 'connected' }));
      if (pathname.startsWith('/recent')) return response(200, JSON.stringify([{ e: { descr: '1Z91' } }]));
      if (pathname.startsWith('/recording')) {
        if (model.recordingTraversal && pathname.includes('path=')) return response(200, markers.canary);
        const date = new URL(pathname, 'http://relay.test').searchParams.getAll('date');
        if (date.length !== 1 || !/^\d{8}$/.test(date[0])) return response(400, JSON.stringify({ error: 'date must be exactly 8 digits' }));
        return response(200, JSON.stringify({ e: { kind: 'step', descr: '1Z91' } }));
      }
      if (pathname.startsWith('/schedule')) {
        if (model.scheduleTraversal && pathname.includes('date=')) return response(200, markers.canary);
        return response(400, JSON.stringify({ error: 'date must be YYYY-MM-DD' }));
      }
      if (pathname.startsWith('/static/smart')) return response(502, model.responseLeak ? markers.secret : JSON.stringify({ error: 'upstream or internal error' }));
      return response(404, JSON.stringify({ error: 'not found' }));
    },
  };
}

test('axis07 relay probe runs its full request matrix through injected fake services', async (t) => {
  const dir = await caseDir(t);
  const result = await probeRelaySecurity({ dataDir: dir }, fakeDependencies());
  assert.equal(result.status, 'PASS', JSON.stringify(result.checks));
  assert.ok(result.checks.some((item) => item.name === 'listener_bound_loopback' && item.status === 'PASS'));
  assert.ok(result.checks.some((item) => item.name === 'foreign_host_refused' && item.status === 'PASS'));
  assert.ok(result.checks.some((item) => item.name === 'suffix_host_refused' && item.status === 'PASS'));
  assert.ok(result.checks.some((item) => item.name === 'trailing_host_refused' && item.status === 'PASS'));
  assert.ok(result.checks.some((item) => item.name === 'wrong_port_refused' && item.status === 'PASS'));
  assert.ok(result.checks.some((item) => item.name === 'hostile_origin_refused' && item.status === 'PASS'));
  assert.ok(result.checks.some((item) => item.name === 'post_refused' && item.status === 'PASS'));
  assert.ok(result.checks.some((item) => item.name === 'valid_get' && item.status === 'PASS'));
  assert.ok(result.checks.some((item) => item.name === 'recording_ignores_client_path' && item.status === 'PASS'));
  assert.ok(result.checks.some((item) => item.name === 'schedule_ignores_client_path' && item.status === 'PASS'));
  assert.ok(result.checks.some((item) => item.name === 'markers_absent_from_responses_logs_recordings' && item.status === 'PASS'));
  assert.ok(result.checks.some((item) => item.name === 'no_cors_headers' && item.status === 'PASS'));
  const nic = result.checks.find((item) => item.name === 'non_loopback_interface_refused');
  assert.equal(nic.status, 'UNAVAILABLE');
  assert.equal(nic.required, false);
  assert.match(nic.detail, /^gap:/);
  assert.equal(JSON.stringify(result).includes(markers.account), false);
  assert.equal(JSON.stringify(result).includes(markers.secret), false);
  assert.equal(JSON.stringify(result).includes(markers.canary), false);
  const responseText = await readFile(result.paths.responses, 'utf8');
  const logText = await readFile(result.paths.logs, 'utf8');
  const recordingText = await readFile(path.join(result.paths.recordings, 'td-ZZ-20261108.ndjson'), 'utf8');
  for (const text of [responseText, logText, recordingText]) {
    assert.equal(text.includes(markers.account), false);
    assert.equal(text.includes(markers.secret), false);
    assert.equal(text.includes(markers.canary), false);
  }
});

test('axis07 relay probe rejects wildcard binding, accepted hosts, bad methods, CORS, traversal and leaks', async (t) => {
  const dir = await caseDir(t);
  const cases = [
    { name: 'wildcard binding', model: { host: '0.0.0.0', nicAddress: '192.0.2.2', nicReachable: true }, check: 'listener_bound_loopback' },
    { name: 'accepted attacker host', model: { acceptBadHost: true }, check: 'foreign_host_refused' },
    { name: 'accepted POST', model: { acceptPost: true }, check: 'post_refused' },
    { name: 'CORS response', model: { cors: true }, check: 'no_cors_headers' },
    { name: 'recording path traversal', model: { recordingTraversal: true }, check: 'recording_ignores_client_path' },
    { name: 'schedule path traversal', model: { scheduleTraversal: true }, check: 'schedule_ignores_client_path' },
    { name: 'response leak', model: { responseLeak: true }, check: 'markers_absent_from_responses_logs_recordings' },
    { name: 'log leak', model: { logLeak: true }, check: 'markers_absent_from_responses_logs_recordings' },
    { name: 'recording leak', model: { recordingLeak: true }, check: 'markers_absent_from_responses_logs_recordings' },
  ];
  for (const scenario of cases) {
    const result = await probeRelaySecurity({ dataDir: dir }, fakeDependencies(scenario.model));
    assert.equal(result.status, 'FAIL', scenario.name);
    assert.ok(result.checks.some((item) => item.name === scenario.check && item.status === 'FAIL'), scenario.name);
  }
});

test('axis07 relay probe reports loopback listener permission denial as unavailable', async (t) => {
  const dir = await caseDir(t);
  const dependencies = fakeDependencies();
  dependencies.startRelay = async () => { throw Object.assign(new Error('sandbox detail must not escape'), { code: 'EPERM' }); };
  const result = await probeRelaySecurity({ dataDir: dir }, dependencies);
  assert.equal(result.status, 'UNAVAILABLE');
  assert.ok(result.checks.some((item) => item.name === 'listener_started' && item.status === 'UNAVAILABLE' && /permission denied/.test(item.detail)));
  assert.equal(JSON.stringify(result).includes('sandbox detail'), false);
});

test('axis07 relay probe closes a listener that starts after the bounded startup timeout', async (t) => {
  const dir = await caseDir(t);
  const dependencies = fakeDependencies();
  let closeCalls = 0;
  dependencies.startTimeoutMs = 5;
  dependencies.startRelay = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { host: '127.0.0.1', port: 43217, close: async () => { closeCalls++; } };
  };
  const result = await probeRelaySecurity({ dataDir: dir }, dependencies);
  assert.equal(result.status, 'UNAVAILABLE');
  const deadline = Date.now() + 500;
  while (!closeCalls && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(closeCalls, 1);
});

test('axis07 relay probe checks a real loopback listener with synthetic upstream only', async (t) => {
  const dir = await caseDir(t);
  const result = await probeRelaySecurity({ dataDir: dir });
  const listener = result.checks.find((item) => item.name === 'listener_started');
  if (listener?.status === 'UNAVAILABLE' && /permission denied/.test(listener.detail)) {
    t.skip('sandbox denied binding the synthetic relay to 127.0.0.1 (EPERM/EACCES)');
    return;
  }
  assert.equal(result.status, 'PASS', JSON.stringify(result.checks));
  assert.ok(result.checks.some((item) => item.name === 'listener_bound_loopback' && item.status === 'PASS'));
});
