// GPU-backed browser checks for the built page's local-relay states.
// node tools/axis07-browser.mjs --gpu --dist <built directory> [--out <worktree>/.scratch/axis07-browser] [--chrome <path>]
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { createServer } from 'node:http';
import { lstat, mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildGraph } from '../core/graph.ts';
import { createMotion } from '../core/motion.ts';
import { cdpPipe, createEvidenceServer, realMetal, safeOutputDirectory } from './evidence.mjs';
import { createEventReconciler, parseEvent } from '../web/src/feed.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const repoRoot = path.resolve(packageRoot, '..');
const scratchRoot = path.join(repoRoot, '.scratch');
const PHASES = ['no-relay', 'connected', 'stopped', 'sse-drop', 'recovered', 'offline-replay'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const freshDiagnostics = (phase, proxyEnabled) => ({ phase, proxyEnabled, consoleErrorCount: 0, cspErrorCount: 0, cspInvalidSourceCount: 0,
  failedRequests: [], expectedRelayFailures: [], expectedWeatherFailures: [], unexpectedNetworkFailures: [], relayRequestCounts: {}, weatherRequestCounts: {},
  expectedRelayConsoleErrorCount: 0, expectedWeatherConsoleErrorCount: 0, consoleErrors: [], messages: [] });
function relayPath(value) {
  try { const pathname = new URL(value).pathname; return pathname.startsWith('/relay/') ? pathname : null; }
  catch { return null; }
}

/**
 * The weather the page may fetch: Open-Meteo's forecast and archive endpoints, one exact path on each. The list is written out here,
 * not read from web/src/weather.ts, so this check does not follow the code it checks; web/tests/csp.test.ts holds the two equal.
 */
export const WEATHER_ENDPOINTS = new Map([['https://api.open-meteo.com', '/v1/forecast'], ['https://archive-api.open-meteo.com', '/v1/archive']]);
/** The page's whole `connect-src`, in order: its own origin, the loopback dev sockets, and the two weather origins. Nothing else. */
export const EXPECTED_CONNECT_SRC = ["'self'", 'ws://127.0.0.1:*', 'ws://localhost:*', ...WEATHER_ENDPOINTS.keys()];

/** The origin of a URL that is exactly one of the weather endpoints (https, no credentials, no port, that endpoint's own path); else null. */
export function weatherEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return WEATHER_ENDPOINTS.get(url.origin) === url.pathname ? url.origin : null;
  } catch { return null; }
}

/**
 * Audit the page's own Content-Security-Policy: `connect-src` must be exactly EXPECTED_CONNECT_SRC (a missing origin fails as a
 * superfluous one does), the directives that gate scripts, objects, forms, workers and images must be what they always were,
 * and `unsafe-eval` must be absent.
 */
export function auditPageCsp(html) {
  const policy = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(String(html))?.[1];
  if (!policy) return { valid: false, connectSrc: null, problems: ['no Content-Security-Policy meta tag'] };
  const problems = [];
  const rules = new Map(policy.split(';').map(rule => { const [key, ...values] = rule.trim().split(/\s+/); return [key, values]; }));
  const same = (got, want) => Array.isArray(got) && got.length === want.length && got.every((source, i) => source === want[i]);
  const connectSrc = rules.get('connect-src') ?? null;
  if (!same(connectSrc, EXPECTED_CONNECT_SRC)) problems.push(`connect-src is ${connectSrc ? connectSrc.join(' ') : 'absent'}, expected exactly: ${EXPECTED_CONNECT_SRC.join(' ')}`);
  const fixed = { 'default-src': ["'none'"], 'script-src': ["'self'"], 'base-uri': ["'none'"], 'object-src': ["'none'"], 'form-action': ["'none'"],
    'img-src': ["'self'", 'data:', 'blob:'], 'worker-src': ["'self'", 'blob:'] };
  for (const [key, want] of Object.entries(fixed)) {
    if (!same(rules.get(key), want)) problems.push(`${key} is ${rules.get(key)?.join(' ') ?? 'absent'}, expected ${want.join(' ')}`);
  }
  if (policy.includes('unsafe-eval')) problems.push('unsafe-eval is allowed');
  return { valid: problems.length === 0, connectSrc, problems };
}

/**
 * True for the console error Chrome logs when an exact Open-Meteo endpoint is unreachable (a transport failure, or a 5xx): the page's
 * designed fallback to a clear sky, said on its status line. A CSP block, a CORS error, a 4xx, a lookalike host or any other origin is not.
 */
export function expectedWeatherConsoleError({ method, error, text, url, status }) {
  return error === true && method === 'Log.entryAdded' && !/content security policy|blocked_by_csp/i.test(text ?? '') && weatherEndpoint(url) !== null &&
    /failed to load resource/i.test(text ?? '') && (/net::ERR_/i.test(text ?? '') || (status ?? 0) >= 500);
}

/** True for a URL the page has no business requesting: not loopback http/ws, not data/blob/about, and not exactly a weather endpoint. */
export function foreignRequest(value) {
  try {
    const url = new URL(value);
    if (['data:', 'blob:', 'about:'].includes(url.protocol)) return false;
    if (['http:', 'ws:'].includes(url.protocol) && ['127.0.0.1', 'localhost'].includes(url.hostname)) return false;
    return weatherEndpoint(value) === null;
  } catch { return true; }
}
function expectedRelayFault(diagnostics, url, { status = null, failed = false, canceled = false } = {}) {
  const pathname = relayPath(url);
  if (!pathname) return false;
  if (diagnostics?.proxyEnabled === false && ['no-relay', 'stopped'].includes(diagnostics.phase) && (status === 503 || failed || canceled)) return true;
  return pathname === '/relay/events' && ['stopped', 'sse-drop'].includes(diagnostics?.phase) &&
    (canceled || (failed && (status === null || status === 200)));
}
function recordNetworkFailure(diagnostics, url, detail) {
  const fullUrl = typeof url === 'string' && url.trim() ? url.trim() : null;
  const pathname = relayPath(fullUrl);
  const canceled = detail.canceled === true;
  const expected = expectedRelayFault(diagnostics, fullUrl, detail);
  // Open-Meteo unreachable is a designed state: the page falls back to a clear sky and says so (phaseIsComplete requires that line).
  // Only a transport failure or a server error on one of the exact weather endpoints counts; any other origin stays unexpected.
  // A request the page's own CSP blocked is never "Open-Meteo being away": it is the policy refusing what the page asked for.
  const blockedByCsp = detail.blockedReason === 'csp' || /blocked_by_csp/i.test(detail.errorText ?? '');
  const weather = !expected && !canceled && !blockedByCsp && weatherEndpoint(fullUrl) !== null && (detail.failed === true || (detail.status ?? 0) >= 500);
  const row = {
    requestId: detail.requestId ?? null,
    url: fullUrl,
    path: pathname ?? 'unknown',
    status: detail.status ?? null,
    errorText: detail.errorText ?? null,
    event: detail.event ?? 'network failure',
    canceled,
    classification: expected ? 'expected-relay' : weather ? 'expected-weather' : canceled ? 'ignored-cancelled' : 'unexpected',
  };
  diagnostics.failedRequests.push(row);
  if (expectedRelayFault(diagnostics, url, detail)) {
    diagnostics.expectedRelayFailures.push(row);
  }
  else if (weather) diagnostics.expectedWeatherFailures.push(row);
  else if (!canceled) diagnostics.unexpectedNetworkFailures.push(row);
}
function usableUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { new URL(value); return value; } catch { return null; }
}

/** Record one CDP Network event and retain its request URL for later console correlation. */
export function recordCdpNetworkEvent(message, diagnostics, requestInfo) {
  const { method, params = {} } = message ?? {};
  if (method === 'Network.requestWillBeSent') {
    const { requestId, request } = params;
    requestInfo.set(requestId, { url: request?.url ?? null, status: null, diagnostics });
    const pathname = relayPath(request?.url);
    if (pathname) diagnostics.relayRequestCounts[pathname] = (diagnostics.relayRequestCounts[pathname] ?? 0) + 1;
    const weather = weatherEndpoint(request?.url);
    if (weather) diagnostics.weatherRequestCounts[weather] = (diagnostics.weatherRequestCounts[weather] ?? 0) + 1;
    // Anything else that leaves the machine is a finding in its own right, whether or not it succeeds.
    else if (foreignRequest(request?.url)) diagnostics.unexpectedNetworkFailures.push({
      requestId: requestId ?? null, url: typeof request?.url === 'string' ? request.url : null, path: 'unknown', status: null, errorText: null,
      event: 'request to an origin the page may not use', canceled: false, classification: 'unexpected' });
    return true;
  }
  if (method === 'Network.responseReceived') {
    const { requestId, response } = params;
    const info = requestInfo.get(requestId), url = usableUrl(response?.url) ?? usableUrl(info?.url);
    if (info) info.status = response?.status ?? null;
    const pathname = relayPath(url), faultPhase = pathname && ['stopped', 'sse-drop'].includes(diagnostics.phase);
    const target = (faultPhase ? diagnostics : info?.diagnostics) ?? diagnostics;
    if (response?.status >= 400) recordNetworkFailure(target, url, {
      event: method, requestId, status: response.status,
    });
    return true;
  }
  if (method === 'Network.loadingFailed') {
    const { requestId, errorText, canceled, blockedReason } = params, info = requestInfo.get(requestId);
    const url = usableUrl(info?.url), pathname = relayPath(url);
    const faultPhase = pathname && ['stopped', 'sse-drop'].includes(diagnostics.phase);
    const target = (faultPhase ? diagnostics : info?.diagnostics) ?? diagnostics;
    recordNetworkFailure(target, url, {
      event: method, requestId, status: info?.status ?? null, failed: true, errorText, canceled: canceled === true, blockedReason,
    });
    return true;
  }
  return method === 'Network.loadingFinished';
}

export function resolveLogEntryUrl(entry, requestInfo) {
  return usableUrl(entry?.url) ?? usableUrl(requestInfo.get(entry?.networkRequestId)?.url);
}
const within = (root, file) => {
  const rel = path.relative(root, file);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
};

export function parseOptions(args = []) {
  const values = new Map();
  const valueOptions = new Set(['--dist', '--out', '--chrome']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--help') {
      if (args.length !== 1) throw new Error('--help cannot be combined with other options');
      return { help: true };
    }
    if (key === '--gpu') {
      if (values.has(key)) throw new Error('repeated option: --gpu');
      values.set(key, true);
      continue;
    }
    if (!valueOptions.has(key) || values.has(key)) throw new Error(`unknown or repeated option: ${key}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${key}`);
    values.set(key, value);
  }
  if (!values.has('--gpu')) throw new Error('pass --gpu; software renderers are not accepted');
  if (!values.has('--dist')) throw new Error('pass --dist <built directory>');
  const dist = path.resolve(values.get('--dist'));
  const suffix = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.resolve(values.get('--out') ?? path.join(scratchRoot, `axis07-browser-${suffix}`));
  if (!within(scratchRoot, out) || out === scratchRoot) throw new Error('--out must be a new directory under this worktree .scratch');
  return { help: false, gpu: true, dist, out, chrome: values.get('--chrome') ?? null };
}

/** A hardware renderer name is required; SwiftShader and other software rasterizers never pass. */
export function hardwareRenderer(renderer) {
  return realMetal(renderer);
}

export function syntheticAnchor(trackData) {
  const nodes = new Map((trackData.nodes ?? []).map(row => Array.isArray(row) ? [row[0], [row[1], row[2]]] : [row.id, [row.x, row.z]]));
  const graph = buildGraph(trackData);
  for (const rail of trackData?.rails ?? []) for (let i = 0; i + 1 < rail.nodes.length; i++) {
    const from = rail.nodes[i], to = rail.nodes[i + 1], a = nodes.get(from), b = nodes.get(to);
    if (!a || !b || ![...a, ...b].every(Number.isFinite)) continue;
    const t = 0.5;
    const anchor = {
      berth: 'SYN4', kind: 'smart', from, to, t,
      point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      errorM: 0, platform: '4', evidence: 'synthetic browser fixture on a public OSM track edge',
    };
    // Verify the application parser, snapshot reconciliation and full 260 m body before
    // choosing a fixture edge; a valid berth on a short spur can otherwise draw no train.
    const anchors = { area: 'SYN', sources: ['synthetic browser fixture'], anchors: [anchor], unmapped: [] };
    const motion = createMotion(graph, anchors);
    const reconcile = createEventReconciler((event, atMs) => motion.apply(event, atMs));
    reconcile(parseEvent({ ...syntheticSnapshot(1), kind: 'snapshot' }), 1);
    if (motion.trains()[0]?.occupiedLengthM >= 259) return anchor;
  }
  throw new Error('built track graph has no safe edge for the full synthetic train body');
}

export function syntheticHealth(now = Date.now()) {
  return {
    ok: true, area: 'SYN', feed: 'connected', connectedAt: now - 1000, lastEventAgeMs: 0,
    badMessages: 0, counts: { berths: 1, descriptions: 1 },
    schedule: { cached: 0, requested: 0 }, trust: { retained: 0, rejected: 0 },
  };
}

export function syntheticSnapshot(now = Date.now()) {
  return { area: 'SYN', berths: { SYN4: 'SYN1' }, sclass: { addresses: 0, data: {} }, lastEventTime: now };
}

export function syntheticPing(now = Date.now()) {
  return { t: now, feed: 'connected', lastEventAt: now };
}

export function syntheticSseFrame(name, data) {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function syntheticRelayFixture(trackData, now = Date.now()) {
  return {
    health: syntheticHealth(now),
    anchors: { area: 'SYN', sources: ['synthetic browser fixture'], anchors: [syntheticAnchor(trackData)], unmapped: [] },
    snapshot: syntheticSnapshot(now),
    ping: syntheticPing(now),
    sclass: { area: 'SYN', hypotheses: [] },
  };
}

export function syntheticOfflineReplayFixture(trackData) {
  const startMs = Date.UTC(2026, 10, 7, 12);
  const fixture = syntheticRelayFixture(trackData, startMs);
  return { startMs, resources: new Map([
    ['/axis07-offline/manifest.json', { type: 'application/json', body: JSON.stringify({ anchors: 'anchors.json', recording: 'recording.ndjson' }) }],
    ['/axis07-offline/anchors.json', { type: 'application/json', body: JSON.stringify(fixture.anchors) }],
    ['/axis07-offline/recording.ndjson', { type: 'application/x-ndjson', body: [startMs, startMs + 60_000].map(t => JSON.stringify({ t, e: { ...syntheticSnapshot(t), kind: 'snapshot' } })).join('\n') }],
  ]) };
}

/** Add static synthetic bundle routes without ever enabling the relay proxy. */
export function createBrowserEvidenceServer(options, fixture) {
  const control = createEvidenceServer(options);
  const [serve] = control.server.listeners('request');
  control.server.removeListener('request', serve);
  control.server.on('request', (req, res) => {
    const resource = fixture.resources.get(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    if (!resource) { void serve(req, res); return; }
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    res.writeHead(200, { 'content-type': resource.type, 'cache-control': 'no-store' }).end(resource.body);
  });
  return control;
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

/** A tiny loopback relay with synthetic, real-shaped health metadata and SSE only. */
export function createSyntheticRelay(trackData) {
  const fixture = syntheticRelayFixture(trackData);
  const clients = new Map();
  let streamsDropped = false;
  const server = createServer((req, res) => {
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/health') return sendJson(res, 200, syntheticHealth());
    if (url.pathname === '/anchors') return sendJson(res, 200, fixture.anchors);
    if (url.pathname === '/snapshot') return sendJson(res, 200, syntheticSnapshot());
    if (url.pathname === '/sclass') return sendJson(res, 200, fixture.sclass);
    if (url.pathname === '/recent') return sendJson(res, 200, []);
    if (url.pathname === '/schedule') return sendJson(res, 200, {
      date: url.searchParams.get('date') ?? '', available: false, reason: 'no timetable',
    });
    if (url.pathname !== '/events') return sendJson(res, 404, { error: 'synthetic endpoint unavailable' });
    if (streamsDropped) { res.destroy(); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    const event = (name, data) => {
      if (res.destroyed || res.writableEnded) return;
      res.write(syntheticSseFrame(name, data));
    };
    event('snapshot', syntheticSnapshot());
    event('ping', syntheticPing());
    const timer = setInterval(() => event('ping', syntheticPing()), 500);
    timer.unref?.();
    clients.set(res, timer);
    res.once('close', () => { clearInterval(timer); clients.delete(res); });
  });
  return {
    server,
    get origin() {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('synthetic relay is not listening');
      return `http://127.0.0.1:${address.port}`;
    },
    async listen() {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      return this.origin;
    },
    async close() {
      for (const [res, timer] of clients) { clearInterval(timer); res.destroy(); }
      clients.clear();
      server.closeAllConnections();
      if (server.listening) await new Promise(resolve => server.close(resolve));
    },
    dropStreams() {
      // Keep automatic retries in the failed state until its screenshot is saved.
      streamsDropped = true;
      const dropped = clients.size;
      for (const [res, timer] of clients) { clearInterval(timer); res.destroy(); }
      clients.clear();
      return dropped;
    },
    resumeStreams() { streamsDropped = false; },
  };
}

export function phaseIsComplete(report) {
  const phases = new Map((report.phases ?? []).map(row => [row.name, row]));
  if (report.phases?.length !== PHASES.length || phases.size !== PHASES.length) return false;
  const complete = PHASES.every(name => {
    const phase = phases.get(name), offline = name === 'no-relay', replay = name === 'offline-replay';
    const reconnecting = name === 'stopped' || name === 'sse-drop';
    // Polling can succeed before the screenshot. Require the captured page to still
    // show the intended state, including a real board rather than a truthy placeholder.
    const observedState = phase?.mode === (offline ? 'demo' : replay ? 'replay' : 'live') &&
      phase.proxyEnabled === !(offline || replay || name === 'stopped') &&
      (offline ? phase.connection === 'relay absent' : replay ? ['playing', 'recording ended'].includes(phase.connection) : reconnecting ? phase.connection?.includes('reconnecting') : phase.connection === 'connected');
    return observedState && phase?.conditionObserved === true && phase.cityLoaded === true && typeof phase.statusLine === 'string' && phase.statusLine.trim().length > 0 && typeof phase.connection === 'string' &&
      phase.board?.present === true && phase.board.mode === (offline ? 'sample' : replay ? 'replay' : 'live') &&
      Number.isSafeInteger(phase.board.platformTrainCount) && phase.board.platformTrainCount >= 0 &&
      Number.isSafeInteger(phase.trainCount) && phase.attribution?.present?.osm === true &&
      phase.attribution?.present?.environmentAgency === true && phase.attribution?.present?.openGovernmentLicence === true &&
      phase.attribution?.present?.openMeteo === true &&
      phase.cspInvalidSourceCount === 0 && phase.cspErrorCount === 0 && phase.validCsp === true && phase.consoleErrorCount === 0 &&
      phase.unexpectedNetworkFailures?.length === 0 && typeof phase.screenshot === 'string' && phase.screenshot.trim().length > 0 &&
      // a phase whose weather request failed must say so, and say it fell back to a clear sky
      ((phase.expectedWeatherFailures?.length ?? 0) === 0 && (phase.expectedWeatherConsoleErrorCount ?? 0) === 0 ||
        /weather unavailable[^·]*clear sky/i.test(phase.statusLine));
  });
  const noRelay = phases.get('no-relay'), stopped = phases.get('stopped'), drop = phases.get('sse-drop');
  const replay = phases.get('offline-replay');
  const replayObserved = replay?.trainCount > 0 && Number.isFinite(replay.replayStartMs) &&
    Number.isFinite(replay.replayTimeMs) && replay.replayTimeMs > replay.replayStartMs &&
    replay.relayRequestCounts && Object.values(replay.relayRequestCounts).every(count => count === 0);
  // the page's own CSP, read from the built index.html: connect-src names exactly the permitted origins (auditPageCsp)
  return complete && replayObserved && report.cspAudit?.valid === true && noRelay?.connection === 'relay absent' && /sample trains/i.test(noRelay.statusLine ?? '') &&
    (noRelay.relayRequestCounts?.['/relay/health'] ?? 0) <= 1 && stopped?.connection?.includes('reconnecting') &&
    (stopped.trainCount ?? 0) > 0 && drop?.connection?.includes('reconnecting') && (drop.trainCount ?? 0) > 0 &&
    (phases.get('connected')?.trainCount ?? 0) > 0 &&
    (phases.get('recovered')?.trainCount ?? 0) > 0;
}

export function finalizeStatus(report) {
  if (report.error) return 'ERROR';
  if (report.networkDiagnostics?.some(d => d.consoleErrorCount || d.cspErrorCount || d.unexpectedNetworkFailures.length)) return 'GAP';
  if (!report.validGpu || report.gaps?.length || !phaseIsComplete(report)) return 'GAP';
  return 'PASS';
}

export function syncDiagnostics(report) {
  for (const phase of report.phases) {
    const diagnostics = report.networkDiagnostics?.find(d => d.phase === phase.name);
    if (diagnostics) Object.assign(phase, diagnostics, {
      validCsp: diagnostics.cspErrorCount === 0 && diagnostics.cspInvalidSourceCount === 0,
    });
  }
}

async function writeArtifact(file, body) {
  await safeOutputDirectory(repoRoot, path.dirname(file));
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(body); } finally { await handle.close(); }
}

async function newOutputDirectory(out) {
  try { await lstat(out); throw new Error(`output already exists: ${out}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await safeOutputDirectory(repoRoot, out);
}

function chromeCandidates(explicit) {
  return [explicit, process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
}

function gpuFlags() {
  const platform = os.platform();
  if (platform === 'darwin') return ['--use-angle=metal', '--enable-gpu-rasterization'];
  if (platform === 'win32') return ['--use-angle=d3d11', '--enable-gpu-rasterization'];
  return ['--use-angle=gl', '--enable-gpu-rasterization'];
}

function observationExpression() {
  return `(() => {
    const k = window.__kx, statusLine = document.getElementById('status')?.textContent ?? '';
    const rows = k?.boardRows, boardElement = document.querySelector('.kx-board');
    const boardText = boardElement?.querySelector('.kx-board-body')?.innerText ?? '';
    const hud = document.querySelector('.hud');
    const attributionElement = hud ? [...hud.children].find(child => child.id !== 'status') : null;
    const attributionText = attributionElement?.textContent?.trim() ?? '';
    const licenseLink = attributionElement && [...attributionElement.querySelectorAll('a')].some(a => /nationalarchives\\.gov\\.uk\\/doc\\/open-government-licence/i.test(a.href));
    const gl = k?.renderer?.getContext?.(), debug = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = gl ? (debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : null;
    const trainCount = Array.isArray(k?.trains) ? k.trains.length : 0;
    const platformRows = rows?.platforms?.flatMap(p => p.trains.map(t => ({ platform: p.platform, headcode: t.headcode, state: t.state }))) ?? [];
    return {
      ready: !!k?.ready, webglAvailable: !!gl, renderer, statusLine, mode: k?.feed?.mode ?? null,
      connection: k?.feed?.connection ?? null, replayTimeMs: k?.feed?.timeMs ?? null, trainCount,
      board: boardElement ? { present: true, expanded: boardElement.querySelector('button')?.getAttribute('aria-expanded') ?? null,
        mode: rows?.mode ?? null, timetable: rows?.timetable ?? null, platformTrainCount: platformRows.length,
        platformTrains: platformRows, approachingCount: rows?.approaching?.length ?? null,
        departedCount: rows?.departed?.length ?? null, dueCount: rows?.due?.length ?? null,
        text: boardText.slice(0, 1200) } : null,
      attribution: { text: attributionText, present: {
        osm: /Map data © OpenStreetMap contributors/i.test(attributionText),
        environmentAgency: /Environment Agency information/i.test(attributionText),
        openGovernmentLicence: !!licenseLink,
        openMeteo: /Weather: Open-Meteo\\.com \\(CC BY 4\\.0\\)/.test(attributionText),
      } },
    };
  })()`;
}

function phaseMarkdown(report) {
  const lines = [
    '# Axis 07 browser report', '',
    `Status: **${report.status}**. Genuine Metal renderer: **${report.genuineMetalGpu ? 'yes' : 'no'}** (${report.renderer ?? 'unavailable'}).`,
    '', 'Every relay response and train description in this run is synthetic. The stopped phase cuts this report’s loopback proxy; it does not stop or alter an external relay.',
    '', 'The no-relay phase checks labelled sample trains. The separate offline-replay phase loads a static synthetic recording bundle with the relay proxy disabled.', '',
    '| Phase | Condition | Proxy | Connection | Trains | Board rows | Attribution | CSP errors | CSP invalid sources | Console errors | Expected relay failures | Unexpected network failures | Screenshot |',
    '|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  ];
  for (const phase of report.phases) lines.push(`| ${phase.name} | ${phase.conditionObserved ? 'observed' : 'gap'} | ${phase.proxyEnabled === null ? 'unknown' : phase.proxyEnabled ? 'enabled' : 'disabled'} | ${phase.connection ?? 'unavailable'} | ${phase.trainCount ?? 'unavailable'} | ${phase.board?.platformTrainCount ?? 'unavailable'} | ${phase.attribution?.present?.osm && phase.attribution?.present?.environmentAgency && phase.attribution?.present?.openGovernmentLicence && phase.attribution?.present?.openMeteo ? 'present' : 'gap'} | ${phase.cspErrorCount ?? 'unavailable'} | ${phase.cspInvalidSourceCount ?? 'unavailable'} | ${phase.consoleErrorCount ?? 'unavailable'} | ${phase.expectedRelayFailures?.length ?? 'unavailable'} | ${phase.unexpectedNetworkFailures?.length ?? 'unavailable'} | ${phase.screenshot ? `[${path.basename(phase.screenshot)}](${path.basename(phase.screenshot)})` : 'unavailable'} |`);
  const transitions = (report.networkDiagnostics ?? []).filter(d => !report.phases.some(p => p.name === d.phase)).map(d => ({ ...d, name: d.phase }));
  for (const phase of [...report.phases, ...transitions]) {
    const details = [
      ['Expected relay failures', phase.expectedRelayFailures ?? []],
      ['Expected weather failures (Open-Meteo unreachable; the page falls back to a clear sky and says so)', phase.expectedWeatherFailures ?? []],
      ['Unexpected network failures', phase.unexpectedNetworkFailures ?? []],
      ['Recorded canceled requests (not counted as phase failures)', (phase.failedRequests ?? []).filter(row => row.classification === 'ignored-cancelled')],
    ];
    if (details.some(([, rows]) => rows.length) || phase.consoleErrors?.length) {
      lines.push('', `## ${phase.name} diagnostics`);
      for (const [title, rows] of details) {
        lines.push('', `### ${title}`);
        if (!rows.length) lines.push('', '- None.');
        else for (const row of rows) lines.push('', `- request ${row.requestId ?? 'unavailable'} · ${row.url ? `URL \`${row.url.replaceAll('`', '\\`')}\`` : 'URL unresolved (CDP supplied no usable URL)'} · ${row.status === null || row.status === undefined ? 'no HTTP status' : `HTTP ${row.status}`} · ${row.errorText ?? row.event ?? 'no failure reason supplied'}`);
      }
      lines.push('', '### Console errors');
      if (!phase.consoleErrors?.length) lines.push('', '- None.');
      else for (const error of phase.consoleErrors) lines.push('', `- ${error.expectedRelayFault ? 'Expected relay error' : 'Error'} · request ${error.requestId ?? 'unavailable'} · ${error.url ? `URL \`${error.url.replaceAll('`', '\\`')}\`` : 'URL unresolved (CDP supplied no usable URL)'} · ${error.text}`);
    }
  }
  lines.push('', '## Page CSP', '', report.cspAudit?.valid === true
    ? `- connect-src is exactly: ${report.cspAudit.connectSrc.join(' ')}`
    : `- NOT as expected: ${(report.cspAudit?.problems ?? ['not audited']).join('; ')}`);
  lines.push('', '## Weather requests', '', ...report.phases.map(phase => `- ${phase.name}: ${Object.keys(phase.weatherRequestCounts ?? {}).length
    ? Object.entries(phase.weatherRequestCounts).map(([origin, count]) => `${count} to ${origin}`).join(', ') : 'none'}`));
  if (report.gaps.length) lines.push('', '## Gaps', '', ...report.gaps.map(gap => `- ${gap}`));
  if (report.error) lines.push('', '## Error', '', report.error);
  return `${lines.join('\n')}\n`;
}

async function persistReport(report) {
  syncDiagnostics(report);
  report.status = finalizeStatus(report);
  report.validCsp = report.cspAudit?.valid === true && report.phases.length === PHASES.length &&
    report.phases.every(phase => phase.validCsp === true && phase.cspErrorCount === 0 && phase.cspInvalidSourceCount === 0);
  await writeArtifact(path.join(report.out, 'axis07-browser.md'), phaseMarkdown(report));
  await writeArtifact(path.join(report.out, 'axis07-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
}

export async function main(args = process.argv.slice(2)) {
  let options;
  try { options = parseOptions(args); }
  catch (error) { console.error(error.message); process.exitCode = 2; return null; }
  if (options.help) {
    console.log('node tools/axis07-browser.mjs --gpu --dist <built directory> [--out <worktree>/.scratch/axis07-browser] [--chrome <path>]');
    return null;
  }

  const report = { schema: 1, when: new Date().toISOString(), out: options.out, dist: options.dist,
    renderer: null, genuineMetalGpu: false, validGpu: false, validCsp: false, cspAudit: null, phases: [], networkDiagnostics: [], gaps: [], error: null };
  const diagnosticsFor = (phase, proxyEnabled) => {
    const diagnostics = freshDiagnostics(phase, proxyEnabled);
    report.networkDiagnostics.push(diagnostics);
    return diagnostics;
  };
  let chrome, profile, cdp, relay, serverControl, cleanupPromise, outputReady = false;
  let activeDiagnostics = null, activePhase = null;
  const requestInfo = new Map();
  const cleanup = () => cleanupPromise ??= (async () => {
    cdp?.close();
    if (chrome?.pid && chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      try { process.kill(-chrome.pid, 'SIGTERM'); } catch {}
      const stopped = await Promise.race([exited.then(() => true), sleep(1000).then(() => false)]);
      if (!stopped) { try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} await Promise.race([exited, sleep(1000)]); }
    }
    await serverControl?.close();
    await relay?.close();
    if (profile) await rm(profile, { recursive: true, force: true });
  })();

  try {
    await newOutputDirectory(options.out);
    outputReady = true;
    await stat(path.join(options.dist, 'index.html')).catch(() => { throw new Error(`built page not found at ${options.dist}; build it before running the browser check`); });
    // The page's own Content-Security-Policy, as built: connect-src must be exactly the permitted list (auditPageCsp).
    report.cspAudit = auditPageCsp(await readFile(path.join(options.dist, 'index.html'), 'utf8'));
    for (const problem of report.cspAudit.problems) report.gaps.push(`page CSP: ${problem}`);
    const trackData = JSON.parse(await readFile(path.join(packageRoot, 'web/src/data/kx-track.json'), 'utf8'));
    relay = createSyntheticRelay(trackData);
    const relayOrigin = await relay.listen();
    const replayFixture = syntheticOfflineReplayFixture(trackData);
    serverControl = createBrowserEvidenceServer({ dist: options.dist, relay: new URL(relayOrigin) }, replayFixture);
    await new Promise((resolve, reject) => { serverControl.server.once('error', reject); serverControl.server.listen(0, '127.0.0.1', resolve); });
    const pageBase = `http://127.0.0.1:${serverControl.server.address().port}/kings-cross/`;

    let chromeBin;
    for (const candidate of chromeCandidates(options.chrome)) { try { await stat(candidate); chromeBin = candidate; break; } catch {} }
    if (!chromeBin) throw new Error('no Chrome found; pass --chrome or set CHROME_PATH');
    profile = await mkdtemp(path.join(options.out, 'chrome-profile-'));
    chrome = spawn(chromeBin, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`,
      `--disk-cache-dir=${path.join(profile, 'cache')}`, '--no-sandbox', '--no-first-run', '--mute-audio',
      '--ignore-gpu-blocklist', '--enable-logging=stderr', '--disable-breakpad', '--disable-crash-reporter',
      '--noerrdialogs', '--use-mock-keychain', '--password-store=basic', ...gpuFlags(), 'about:blank'],
    { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    cdp = cdpPipe(chrome, message => {
      if (!activeDiagnostics) return;
      if (recordCdpNetworkEvent(message, activeDiagnostics, requestInfo)) return;
      let text = '', error = false, url = '', requestId = null, urlResolution = 'unresolved';
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        text = `${details.text} ${details.exception?.description ?? ''}`.trim(); error = true;
      } else if (message.method === 'Runtime.consoleAPICalled') {
        text = message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' ');
        error = message.params.type === 'error';
      } else if (message.method === 'Log.entryAdded') {
        const entry = message.params.entry;
        text = entry.text ?? ''; requestId = entry.networkRequestId ?? null;
        const directUrl = usableUrl(entry.url);
        url = resolveLogEntryUrl(entry, requestInfo) ?? '';
        urlResolution = url ? (directUrl ? 'entry' : 'networkRequestId') : 'unresolved';
        error = message.params.entry.level === 'error';
      }
      if (!text) return;
      const info = requestId === null ? null : requestInfo.get(requestId);
      const pathname = relayPath(url), faultPhase = pathname && ['stopped', 'sse-drop'].includes(activeDiagnostics.phase);
      const diagnostics = (faultPhase ? activeDiagnostics : info?.diagnostics) ?? activeDiagnostics;
      const cspMessage = /content security policy/i.test(text);
      const cspInvalid = cspMessage && /invalid source/i.test(text);
      if (cspMessage) diagnostics.cspErrorCount++;
      if (cspInvalid) diagnostics.cspInvalidSourceCount++;
      const parsedStatus = Number(/(?:status of|HTTP\s+)(\d{3})/i.exec(text)?.[1]);
      const status = Number.isFinite(parsedStatus) ? parsedStatus : info?.status ?? null;
      const expectedRelay = error && message.method === 'Log.entryAdded' && relayPath(url) && !cspInvalid &&
        expectedRelayFault(diagnostics, url, { status, failed: true });
      const expectedWeather = expectedWeatherConsoleError({ method: message.method, error, text, url, status });
      if (error && diagnostics.consoleErrors.length < 20) diagnostics.consoleErrors.push({
        text: text.slice(0, 800), url: url || null, requestId, status,
        expectedRelayFault: !!expectedRelay, expectedWeatherFault: !!expectedWeather, urlResolution,
      });
      if (expectedRelay) {
        diagnostics.expectedRelayConsoleErrorCount++;
        error = false;
      }
      if (expectedWeather) {
        diagnostics.expectedWeatherConsoleErrorCount++;
        error = false;
      }
      if (error) diagnostics.consoleErrorCount++;
      if (error && diagnostics.messages.length < 20) diagnostics.messages.push(text.slice(0, 800));
    });
    let spawnError;
    chrome.once('error', error => { spawnError = error; });
    const browser = await cdp.send('Browser.getVersion', {}, undefined, 30000);
    report.browser = { product: browser.product, protocolVersion: browser.protocolVersion };
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params = {}, timeout = 30000) => cdp.send(method, params, sessionId, timeout);
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, 45000);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    const until = async (expression, milliseconds = 25000) => {
      const deadline = Date.now() + milliseconds;
      do { if (await evaluate(expression).catch(() => false)) return true; await sleep(100); } while (Date.now() < deadline);
      return false;
    };
    const twoFrames = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    const takePhase = async (name, conditionObserved, expectation, proxyEnabled) => {
      const cityLoaded = await evaluate('window.__kx?.cityLoaded ? window.__kx.cityLoaded.then(() => true) : true').catch(() => false);
      await twoFrames().catch(() => {});
      const page = await evaluate(observationExpression()).catch(error => ({ statusLine: '', connection: null, trainCount: null, board: null, renderer: null, attribution: { text: '', present: { osm: false, environmentAgency: false, openGovernmentLicence: false, openMeteo: false } }, pageError: error.message }));
      const screenshot = path.join(options.out, `${name}.png`);
      try {
        const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeArtifact(screenshot, Buffer.from(image.data, 'base64'));
      } catch (error) { report.gaps.push(`${name}: screenshot unavailable (${error.message})`); }
      const phase = { name, expectation, conditionObserved, proxyEnabled, cityLoaded, statusLine: page.statusLine ?? '', connection: page.connection ?? null,
        mode: page.mode ?? null, replayTimeMs: page.replayTimeMs ?? null, board: page.board ?? null, trainCount: Number.isSafeInteger(page.trainCount) ? page.trainCount : null,
        renderer: page.renderer ?? null, attribution: page.attribution ?? null,
        cspErrorCount: activeDiagnostics?.cspErrorCount ?? 0,
        cspInvalidSourceCount: activeDiagnostics?.cspInvalidSourceCount ?? 0,
        consoleErrorCount: activeDiagnostics?.consoleErrorCount ?? 0,
        expectedRelayConsoleErrorCount: activeDiagnostics?.expectedRelayConsoleErrorCount ?? 0,
        expectedWeatherConsoleErrorCount: activeDiagnostics?.expectedWeatherConsoleErrorCount ?? 0,
        failedRequests: activeDiagnostics?.failedRequests ?? [],
        expectedRelayFailures: activeDiagnostics?.expectedRelayFailures ?? [],
        expectedWeatherFailures: activeDiagnostics?.expectedWeatherFailures ?? [],
        unexpectedNetworkFailures: activeDiagnostics?.unexpectedNetworkFailures ?? [],
        relayRequestCounts: activeDiagnostics?.relayRequestCounts ?? {},
        weatherRequestCounts: activeDiagnostics?.weatherRequestCounts ?? {},
        consoleErrors: activeDiagnostics?.consoleErrors ?? [],
        consoleErrorMessages: activeDiagnostics?.messages ?? [],
        validCsp: (activeDiagnostics?.cspErrorCount ?? 0) === 0 && (activeDiagnostics?.cspInvalidSourceCount ?? 0) === 0,
        conditionObserved, screenshot: await stat(screenshot).then(() => screenshot, () => null) };
      if (page.pageError) phase.pageError = page.pageError;
      if (!conditionObserved) report.gaps.push(`${name}: expected condition was not observed (${expectation})`);
      if (!cityLoaded) report.gaps.push(`${name}: cityLoaded did not resolve before the screenshot`);
      if (!phase.screenshot) report.gaps.push(`${name}: no screenshot was captured`);
      report.phases.push(phase);
      if (!report.renderer && page.renderer) report.renderer = page.renderer;
      return phase;
    };
    const navigate = async (name, url, expected, milliseconds = 25000) => {
      activePhase = name;
      activeDiagnostics = diagnosticsFor(name, name === 'connected');
      await send('Page.navigate', { url });
      await until('!!window.__kx?.ready || document.body.classList.contains("no-webgl")', 60000);
      const conditionObserved = await until(expected, milliseconds);
      return takePhase(name, conditionObserved, expected, name === 'connected');
    };

    serverControl.setProxy(false);
    const replayPhase = await navigate('offline-replay', `${pageBase}?trains=replay&date=20261107&replayBundle=/axis07-offline/manifest.json`,
      `window.__kx?.feed?.mode === 'replay' && ['playing', 'recording ended'].includes(window.__kx?.feed?.connection) && window.__kx?.feed?.timeMs > ${replayFixture.startMs} && window.__kx?.trains?.length > 0`);
    replayPhase.replayStartMs = replayFixture.startMs;
    await navigate('no-relay', pageBase, "window.__kx?.feed?.connection === 'relay absent' && /sample trains/i.test(document.getElementById('status')?.textContent ?? '') || document.body.classList.contains('no-webgl')");
    serverControl.setProxy(true);
    await navigate('connected', pageBase, "window.__kx?.feed?.connection === 'connected' && window.__kx?.feed?.mode === 'live' && window.__kx?.trains?.length > 0", 45000);
    activePhase = 'stopped';
    activeDiagnostics = diagnosticsFor('stopped', false);
    serverControl.setProxy(false);
    const stoppedObserved = await until("window.__kx?.feed?.connection?.includes('reconnecting')", 20000);
    await takePhase('stopped', stoppedObserved, "this pack's relay proxy is disabled and the live feed is reconnecting", false);
    activePhase = 'proxy-restored';
    activeDiagnostics = diagnosticsFor('proxy-restored', true);
    serverControl.setProxy(true);
    const proxyRecovered = await until("window.__kx?.feed?.connection === 'connected' && window.__kx?.feed?.mode === 'live' && window.__kx?.trains?.length > 0", 45000);
    if (!proxyRecovered) report.gaps.push('proxy restore: synthetic live feed did not reconnect before the separate SSE-drop phase');
    activePhase = 'sse-drop';
    activeDiagnostics = diagnosticsFor('sse-drop', true);
    const droppedStreams = relay.dropStreams();
    const droppedObserved = droppedStreams > 0 && await until("window.__kx?.feed?.connection?.includes('reconnecting')", 20000);
    await takePhase('sse-drop', droppedObserved, `synthetic upstream drops ${droppedStreams} SSE stream(s) while the loopback proxy remains enabled`, true);
    activePhase = 'recovered';
    activeDiagnostics = diagnosticsFor('recovered', true);
    relay.resumeStreams();
    const recoveredObserved = await until("window.__kx?.feed?.connection === 'connected' && window.__kx?.feed?.mode === 'live' && window.__kx?.trains?.length > 0", 45000);
    await takePhase('recovered', recoveredObserved, "healthy synthetic SSE feed and at least one synthetic train are restored", true);
    report.validGpu = hardwareRenderer(report.renderer) && report.phases.some(phase => hardwareRenderer(phase.renderer));
    report.genuineMetalGpu = report.validGpu;
    if (!report.validGpu) report.gaps.push(`--gpu was requested, but Chrome did not report a genuine Metal renderer (${report.renderer ?? 'unavailable'}).`);
    if (spawnError) throw spawnError;
  } catch (error) {
    report.error = error?.stack ?? String(error);
  } finally {
    await cleanup().catch(error => { report.error ??= `cleanup failed: ${error.message}`; });
    if (outputReady) {
      try { await persistReport(report); }
      catch (error) { report.error ??= `report write failed: ${error.message}`; report.status = 'ERROR'; console.error(report.error); }
    } else report.status = 'ERROR';
  }
  console.log(JSON.stringify({ out: report.out, report: path.join(report.out, 'axis07-browser.json'), status: report.status,
    renderer: report.renderer, genuineMetalGpu: report.genuineMetalGpu, validGpu: report.validGpu, validCsp: report.validCsp,
    phases: report.phases.map(phase => ({ name: phase.name, conditionObserved: phase.conditionObserved, connection: phase.connection, trainCount: phase.trainCount, screenshot: phase.screenshot })),
    gaps: report.gaps, error: report.error }, null, 2));
    if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
