// Axis 07 relay security probe. It starts the real relay on loopback, with only
// synthetic credentials, a synthetic STOMP peer, and a fetch stub that never
// reaches Network Rail. Its private audit files are intentionally kept under
// the caller's probe-data directory for the parent evidence scanner.
import { EventEmitter } from 'node:events';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { FrameParser, encodeFrame } from '../relay/stomp.mjs';
import { startRelay } from '../relay/relay.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultDataRoot = path.resolve(here, '..', '.scratch', 'probe-data');
const DEFAULT_MARKERS = Object.freeze({
  account: 'AXIS07_ACCOUNT_MARKER_9Q4W',
  secret: 'AXIS07_SECRET_MARKER_3K8R',
  canary: 'AXIS07_TRAVERSAL_CANARY_6M2P',
});
const PROBE_NOW = Date.parse('2026-11-08T12:00:00.000Z');
const AREA = 'ZZ';
const HEADCODE = '1Z91';
const REQUEST_TIMEOUT_MS = 1800;
const FEED_WAIT_MS = 1800;
const CLOSE_TIMEOUT_MS = 2500;
const START_TIMEOUT_MS = 5000;

function bounded(promise, timeoutMs, code = 'ETIMEDOUT') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('operation timed out'), { code })), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function statusFor(checks) {
  if (checks.some((item) => item.status === 'FAIL')) return 'FAIL';
  const interfaceCheck = checks.find((item) => item.name === 'non_loopback_interface_refused');
  const bindingProof = checks.some((item) => item.name === 'listener_bound_loopback' && item.status === 'PASS') &&
    ['foreign_host_refused', 'suffix_host_refused', 'trailing_host_refused', 'wrong_port_refused']
      .every((name) => checks.some((item) => item.name === name && item.status === 'PASS'));
  if (!interfaceCheck || interfaceCheck.status === 'UNAVAILABLE' && !bindingProof) return 'UNAVAILABLE';
  // A route gap stays explicit. PASS remains possible only with the real
  // loopback bind proof and the complete non-loopback Host refusal matrix.
  if (checks.some((item) => item.status === 'UNAVAILABLE' && item.required !== false)) return 'UNAVAILABLE';
  return 'PASS';
}

function addCheck(checks, name, pass, { required = true, detail } = {}) {
  checks.push({ name, status: pass ? 'PASS' : 'FAIL', required, ...(detail ? { detail } : {}) });
}

function addUnavailable(checks, name, { required = true, detail = 'probe unavailable' } = {}) {
  checks.push({ name, status: 'UNAVAILABLE', required, detail });
}

function safeCode(error) {
  const code = error?.code;
  return ['EPERM', 'EACCES', 'EADDRINUSE', 'EADDRNOTAVAIL', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT'].includes(code)
    ? code : '';
}

function permissionCode(error) {
  return error?.code === 'EPERM' || error?.code === 'EACCES';
}

function normalizeResponse(value) {
  const rawHeaders = value?.headers ?? {};
  const headers = {};
  for (const [key, item] of Object.entries(rawHeaders)) {
    headers[key.toLowerCase()] = Array.isArray(item) ? item.map(String).join(', ') : String(item);
  }
  return {
    status: Number(value?.status ?? value?.statusCode),
    headers,
    body: String(value?.body ?? value?.text ?? ''),
  };
}

function requestHttp(port, pathname, { connectHost = '127.0.0.1', method = 'GET', headers = {}, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: connectHost, port, path: pathname, method, headers }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 1024 * 1024) {
          request.destroy(Object.assign(new Error('response too large'), { code: 'RESPONSE_TOO_LARGE' }));
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', reject);
      response.once('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.once('error', reject);
    request.setTimeout(timeoutMs, () => request.destroy(Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' })));
    request.end();
  });
}

function syntheticUpstream() {
  const sockets = new Set();
  const connectSocket = () => {
    const socket = new EventEmitter();
    socket.closed = false;
    const parser = new FrameParser();
    socket.write = (chunk) => {
      for (const frame of parser.push(Buffer.from(chunk))) {
        if (frame.command === 'CONNECT') {
          // Never retain, log, or write the synthetic login outside this frame.
          queueMicrotask(() => {
            if (!socket.closed) socket.emit('data', encodeFrame('CONNECTED', { version: '1.2', server: 'synthetic', 'heart-beat': '0,0' }));
          });
        }
      }
      return true;
    };
    socket.end = () => socket.destroy();
    socket.destroy = () => {
      if (socket.closed) return;
      socket.closed = true;
      sockets.delete(socket);
      socket.emit('close');
    };
    sockets.add(socket);
    return socket;
  };
  return {
    connectSocket,
    push(body) {
      const socket = [...sockets].find((candidate) => !candidate.closed);
      if (socket) socket.emit('data', encodeFrame('MESSAGE', { destination: '/topic/TD_ALL_SIG_AREA', subscription: 'sub-0' }, body));
    },
  };
}

function loopbackAddress(address) { return address === '127.0.0.1'; }

function firstExternalIpv4(networkInterfaces) {
  const groups = typeof networkInterfaces === 'function' ? networkInterfaces() : networkInterfaces;
  for (const rows of Object.values(groups ?? {})) {
    for (const row of rows ?? []) {
      if (row?.family !== 'IPv4' || row.internal || typeof row.address !== 'string') continue;
      if (row.address.startsWith('127.') || row.address.startsWith('169.254.') || row.address === '0.0.0.0') continue;
      return row.address;
    }
  }
  return null;
}

async function writePrivate(file, text, deps) {
  await deps.writeFile(file, text, { mode: 0o600, flag: 'wx' });
}

/**
 * Exercise relay network and local-file guards using only synthetic inputs.
 *
 * `dataDir` is a parent directory for retained probe artifacts; the probe makes
 * a unique child and never reads existing files from it. `out`, when supplied
 * alone, is treated as the evidence directory and gets a `probe-data` child.
 * Dependencies are injectable so all status decisions can be tested without a
 * listener. The optional `startRelay` override has the same shape as the real
 * startRelay function; `request` receives (port, pathname, {connectHost,
 * method, headers, timeoutMs}) and returns {status, headers, body}.
 */
export async function probeRelaySecurity({ dataDir, out } = {}, dependencies = {}) {
  const deps = {
    startRelay: dependencies.startRelay ?? startRelay,
    request: dependencies.request ?? requestHttp,
    networkInterfaces: dependencies.networkInterfaces ?? os.networkInterfaces,
    mkdir: dependencies.mkdir ?? mkdir,
    mkdtemp: dependencies.mkdtemp ?? mkdtemp,
    writeFile: dependencies.writeFile ?? writeFile,
    readFile: dependencies.readFile ?? readFile,
    readdir: dependencies.readdir ?? readdir,
  };
  const markers = { ...DEFAULT_MARKERS, ...(dependencies.markers ?? {}) };
  const artifactRoot = path.resolve(dataDir ?? (out ? path.join(out, 'probe-data') : defaultDataRoot));
  const checks = [];
  const responses = [];
  const logs = [];
  const records = [];
  let evidenceDir = '';
  let relayDataDir = '';
  let relay = null;
  let pendingRelayStart = null;
  let startupError = null;
  let closeError = null;
  let writeError = false;
  const requestErrors = new Map();
  const fakePeer = syntheticUpstream();

  try {
    await deps.mkdir(artifactRoot, { recursive: true, mode: 0o700 });
    evidenceDir = await deps.mkdtemp(path.join(artifactRoot, 'run-'));
    relayDataDir = path.join(evidenceDir, 'relay-data');
    await deps.mkdir(relayDataDir, { recursive: false, mode: 0o700 });
  } catch {
    addUnavailable(checks, 'probe_artifacts', { detail: 'cannot create private probe directory' });
    return { status: statusFor(checks), checks, paths: {} };
  }

  const auditDir = path.join(evidenceDir, 'audit');
  const responseFile = path.join(auditDir, 'responses.ndjson');
  const logFile = path.join(auditDir, 'logs.ndjson');
  const canaryFile = path.join(evidenceDir, 'traversal-canary.json');
  const scheduleCanaryFile = path.join(evidenceDir, 'schedule-2026-11-08.json');
  const canaryDocument = JSON.stringify({ marker: markers.canary, kind: 'synthetic traversal target' });
  try {
    await deps.mkdir(auditDir, { recursive: false, mode: 0o700 });
    await writePrivate(canaryFile, canaryDocument, deps);
    await writePrivate(scheduleCanaryFile, JSON.stringify({ date: '2026-11-08', calls: [], marker: markers.canary }), deps);
  } catch {
    addUnavailable(checks, 'probe_artifacts', { detail: 'cannot create private probe fixtures' });
    return { status: statusFor(checks), checks, paths: { evidenceDir, dataDir: relayDataDir } };
  }

  try {
    pendingRelayStart = Promise.resolve().then(() => deps.startRelay({
      area: AREA,
      topic: '/topic/TD_ALL_SIG_AREA',
      dataDir: relayDataDir,
      port: 0,
      readCredentials: async () => ({ account: markers.account, secret: markers.secret }),
      connectSocket: fakePeer.connectSocket,
      heartbeat: [0, 0],
      backoff: { minMs: 50, maxMs: 100 },
      feedEnabled: true,
      scheduleEnabled: false,
      now: () => PROBE_NOW,
      fetchImpl: async () => { throw new Error(`synthetic fetch failure ${markers.account} ${markers.secret}`); },
      log: (message) => { if (logs.length < 200) logs.push(String(message)); },
    }));
    relay = await bounded(pendingRelayStart, dependencies.startTimeoutMs ?? START_TIMEOUT_MS);
    if (!relay || !Number.isInteger(Number(relay.port)) || Number(relay.port) < 1 || Number(relay.port) > 65535) throw new Error('relay returned no port');
    addCheck(checks, 'listener_started', true);
    addCheck(checks, 'listener_bound_loopback', loopbackAddress(relay.host));
  } catch (error) {
    startupError = error;
    if (safeCode(error) === 'ETIMEDOUT' && pendingRelayStart) {
      void pendingRelayStart.then(async (lateRelay) => {
        if (lateRelay?.close) await bounded(Promise.resolve().then(() => lateRelay.close()), dependencies.closeTimeoutMs ?? CLOSE_TIMEOUT_MS);
      }).catch(() => {});
    }
    addUnavailable(checks, 'listener_started', {
      detail: permissionCode(error) ? 'permission denied while opening loopback listener' : 'relay listener unavailable',
    });
  }

  const paths = () => ({
    evidenceDir,
    dataDir: relayDataDir,
    responses: responseFile,
    logs: logFile,
    recordings: path.join(relayDataDir, 'recordings'),
    traversalCanary: canaryFile,
  });

  try {
    if (!startupError && relay) {
      const port = Number(relay.port);
      const request = async (name, pathname, { method = 'GET', host = `127.0.0.1:${port}`, origin, connectHost = '127.0.0.1' } = {}) => {
        const headers = { host, ...(origin === undefined ? {} : { origin }) };
        try {
          const response = normalizeResponse(await bounded(
            Promise.resolve().then(() => deps.request(port, pathname, { connectHost, method, headers, timeoutMs: REQUEST_TIMEOUT_MS })),
            REQUEST_TIMEOUT_MS + 150,
          ));
          responses.push({ name, method, pathname, host, origin: origin ?? null, status: response.status, headers: response.headers, body: response.body });
          return response;
        } catch (error) {
          requestErrors.set(name, error);
          responses.push({ name, method, pathname, host, origin: origin ?? null, status: null, headers: {}, body: '' });
          return null;
        }
      };
      const expectStatus = (name, response, expected) => {
        if (!response) addUnavailable(checks, name, { detail: 'request did not complete' });
        else addCheck(checks, name, response.status === expected);
      };

      try {
        const deadline = Date.now() + FEED_WAIT_MS;
        let health = null;
        let connected = false;
        do {
          health = await request('feed readiness', '/health');
          if (health?.status === 200) {
            try { connected = JSON.parse(health.body).feed === 'connected'; } catch {}
            if (connected) break;
          }
          await new Promise((resolve) => setTimeout(resolve, 15));
        } while (Date.now() < deadline);
        if (!health) addUnavailable(checks, 'fake_upstream_connected', { detail: 'health request unavailable' });
        else addCheck(checks, 'fake_upstream_connected', connected);
        if (connected) {
          fakePeer.push(JSON.stringify([{ CA_MSG: { area_id: AREA, msg_type: 'CA', descr: HEADCODE, from: '2034', to: '1001', time: String(PROBE_NOW) } }]));
        }

        const wrongPort = port === 65535 ? 1 : port + 1;
        const hostile = [
          ['foreign_host_refused', `attacker.invalid:${port}`],
          ['suffix_host_refused', `127.0.0.1.attacker.invalid:${port}`],
          ['trailing_host_refused', `localhost:${port}.attacker.invalid`],
          ['wrong_port_refused', `127.0.0.1:${wrongPort}`],
        ];
        for (const [name, host] of hostile) expectStatus(name, await request(name, '/health', { host }), 403);
        expectStatus('hostile_origin_refused', await request('hostile_origin_refused', '/health', { origin: 'https://attacker.invalid' }), 403);
        expectStatus('post_refused', await request('post_refused', '/health', { method: 'POST' }), 405);
        const valid = await request('valid_get', '/health');
        expectStatus('valid_get', valid, 200);

        const date = new Date(PROBE_NOW).toISOString().slice(0, 10);
        const dateDigits = date.replaceAll('-', '');
        const traversalPath = encodeURIComponent('../traversal-canary.json');
        const recording = await request('recording_ignores_client_path', `/recording?date=${dateDigits}&path=${traversalPath}`);
        if (!recording) addUnavailable(checks, 'recording_ignores_client_path', { detail: 'request did not complete' });
        else addCheck(checks, 'recording_ignores_client_path', recording.status === 200 && !recording.body.includes(markers.canary));
        const recordingDateTraversal = await request('recording_date_traversal_refused', `/recording?date=${encodeURIComponent('../../traversal-canary')}`);
        expectStatus('recording_date_traversal_refused', recordingDateTraversal, 400);
        const scheduleExtraPath = await request('schedule_ignores_client_path', `/schedule?date=${date}&path=${traversalPath}`);
        expectStatus('schedule_ignores_client_path', scheduleExtraPath, 400);
        const scheduleDateTraversal = await request('schedule_date_traversal_refused', `/schedule?date=${encodeURIComponent('./../../schedule-2026-11-08')}`);
        expectStatus('schedule_date_traversal_refused', scheduleDateTraversal, 400);

        const smartFailure = await request('synthetic_static_failure', `/static/smart?td=${AREA}`);
        expectStatus('synthetic_static_failure_sanitized', smartFailure, 502);

        const recentDeadline = Date.now() + FEED_WAIT_MS;
        let recent = null;
        let eventRecorded = false;
        do {
          recent = await request('event readiness', '/recent?n=5');
          if (recent?.status === 200) {
            try { eventRecorded = JSON.parse(recent.body).some((row) => row?.e?.descr === HEADCODE); } catch {}
            if (eventRecorded) break;
          }
          await new Promise((resolve) => setTimeout(resolve, 15));
        } while (connected && Date.now() < recentDeadline);
        if (!connected || !recent) addUnavailable(checks, 'synthetic_event_recorded', { detail: 'fake event could not be observed' });
        else addCheck(checks, 'synthetic_event_recorded', eventRecorded);

        const hasCors = responses.some((response) => Object.keys(response.headers).some((header) => header.startsWith('access-control-')));
        addCheck(checks, 'no_cors_headers', !hasCors);

        let nicAddress = null;
        let interfaceDiscoveryFailed = false;
        try { nicAddress = firstExternalIpv4(deps.networkInterfaces); }
        catch (error) {
          interfaceDiscoveryFailed = true;
          const code = safeCode(error);
          addUnavailable(checks, 'non_loopback_interface_refused', { required: false, detail: code ? `gap: interface discovery returned ${code}; loopback bind and Host refusals were checked` : 'gap: interface discovery failed; loopback bind and Host refusals were checked' });
        }
        if (interfaceDiscoveryFailed) {
          // The discovery failure above is retained as an explicit coverage gap.
        } else if (!nicAddress) {
          addUnavailable(checks, 'non_loopback_interface_refused', { required: false, detail: 'gap: no eligible non-loopback IPv4 address; loopback bind and Host refusals were checked' });
        } else {
          try {
            const nicResponse = await request('non_loopback_interface_probe', '/health', { connectHost: nicAddress, host: `127.0.0.1:${port}` });
            if (nicResponse) addCheck(checks, 'non_loopback_interface_refused', false, { detail: 'relay accepted a connection through a non-loopback interface' });
            else if (safeCode(requestErrors.get('non_loopback_interface_probe')) === 'ECONNREFUSED') addCheck(checks, 'non_loopback_interface_refused', true, { required: false, detail: 'connection refused' });
            else {
              const code = safeCode(requestErrors.get('non_loopback_interface_probe'));
              addUnavailable(checks, 'non_loopback_interface_refused', { required: false, detail: code ? `gap: non-loopback connection returned ${code}; loopback bind and Host refusals were checked` : 'gap: non-loopback connection result inconclusive; loopback bind and Host refusals were checked' });
            }
          } catch {
            addUnavailable(checks, 'non_loopback_interface_refused', { required: false, detail: 'gap: non-loopback connection result inconclusive; loopback bind and Host refusals were checked' });
          }
        }
      } catch {
        addUnavailable(checks, 'probe_requests', { detail: 'request sequence could not complete' });
      }
    }
  } catch {
    addUnavailable(checks, 'probe_sequence', { detail: 'security probe could not complete' });
  } finally {
    try {
      if (relay) await bounded(Promise.resolve().then(() => relay.close()), dependencies.closeTimeoutMs ?? CLOSE_TIMEOUT_MS);
    } catch {
      closeError = true;
    }
    if (closeError) addCheck(checks, 'listener_closed', false, { detail: 'relay did not close cleanly' });
    else if (relay) addCheck(checks, 'listener_closed', true);
  }

  try {
    const recordingDir = path.join(relayDataDir, 'recordings');
    for (const name of await deps.readdir(recordingDir)) {
      if (!name.endsWith('.ndjson')) continue;
      records.push(await deps.readFile(path.join(recordingDir, name), 'utf8'));
    }
  } catch {
    if (relay) addUnavailable(checks, 'recordings_readable', { detail: 'recording files unavailable for scan' });
  }

  const scanText = [
    ...responses.map((response) => `${response.body}\n${JSON.stringify(response.headers)}`),
    ...logs,
    ...records,
  ].join('\n');
  const leaked = Object.values(markers).some((marker) => marker && scanText.includes(marker));
  addCheck(checks, 'markers_absent_from_responses_logs_recordings', !leaked);

  try {
    await writePrivate(responseFile, responses.map((row) => JSON.stringify(row)).join('\n') + (responses.length ? '\n' : ''), deps);
    await writePrivate(logFile, logs.map((line) => JSON.stringify({ message: line })).join('\n') + (logs.length ? '\n' : ''), deps);
  } catch {
    writeError = true;
  }
  if (writeError) addUnavailable(checks, 'audit_files_written', { detail: 'could not write private audit files' });
  else addCheck(checks, 'audit_files_written', true);

  // Keep an explicit synthetic start failure summary without copying exception text.
  if (startupError) {
    const detail = permissionCode(startupError) ? 'permission denied' : safeCode(startupError) || 'unavailable';
    checks.find((item) => item.name === 'listener_started').detail = `relay listener ${detail}`;
  }
  if ([...requestErrors.values()].some((error) => safeCode(error) === 'ETIMEDOUT') && checks.every((item) => item.status !== 'FAIL')) {
    addUnavailable(checks, 'request_timeout', { required: false, detail: 'one or more requests timed out' });
  }

  return { status: statusFor(checks), checks, paths: paths() };
}
