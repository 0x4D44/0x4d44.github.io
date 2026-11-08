// The relay: holds the Network Rail connection and serves what it sees on 127.0.0.1.
//
//   GET /health           connection state and counters
//   GET /snapshot         current berth occupancy for the area (plus S-class bytes if any)
//   GET /recent?n=200     the last n normalised events {t, e}
//   GET /events           SSE: `snapshot` first, one `td` per event, `ping` every 5 seconds
//   GET /sclass           local signal mapping: KX_SCLASS or <KX_DATA_DIR>/sclass.json
//   GET /schedule?date=YYYY-MM-DD   cached KNGX calls + TRUST actuals (today by default)
//   GET /static/smart?td=Y9         SMART rows for a TD area
//   GET /static/corpus?stanox=54311 CORPUS rows for a STANOX
//
// It binds loopback only, answers only GET, rejects any Host header that is not loopback
// (DNS-rebinding guard) and sends no CORS headers. No response ever contains the login.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runFeed } from './feed.mjs';
import { createRecorder } from './recorder.mjs';
import { createStaticStore } from './static.mjs';
import { TdState } from './state.mjs';
import { createScheduleStore, scheduleDate } from './schedule.mjs';
import { createTrustState } from './trust.mjs';
import { validDate } from '../core/schedule.ts';

const RECENT_MAX = 2000;

/** Named SSE traffic lets the browser detect an idle or broken relay connection. */
export function startEventHeartbeat(req, res, { now = Date.now, schedule = setInterval, unschedule = clearInterval } = {}) {
  let stopped = false;
  const timer = schedule(() => {
    if (!stopped) res.write(`event: ping\ndata: ${JSON.stringify({ t: now() })}\n\n`);
  }, 5000);
  timer?.unref?.();
  const stop = () => {
    if (stopped) return;
    stopped = true;
    unschedule(timer);
  };
  req.once('close', stop);
  return stop;
}

/** Shared by all endpoints, including disk files. No client-supplied path is accepted. */
export function requestFailure(host, port, method) {
  if (!['127.0.0.1', 'localhost'].some((h) => host === `${h}:${port}`)) return 403;
  return method === 'GET' ? null : 405;
}

export async function localFile(url, { dataDir, area, anchorsFile = process.env.KX_ANCHORS ?? path.join(dataDir, 'anchors.json'), sclassFile = process.env.KX_SCLASS ?? path.join(dataDir, 'sclass.json') }) {
  let file, type;
  if (url.pathname === '/anchors') {
    file = anchorsFile;
    type = 'application/json; charset=utf-8';
  } else if (url.pathname === '/sclass') {
    file = sclassFile;
    type = 'application/json; charset=utf-8';
  } else if (url.pathname === '/recording') {
    const dates = url.searchParams.getAll('date');
    if (dates.length !== 1 || !/^\d{8}$/.test(dates[0])) return { status: 400, body: JSON.stringify({ error: 'date must be exactly 8 digits' }), type: 'application/json; charset=utf-8' };
    if (!/^[A-Za-z0-9]+$/.test(area)) throw new Error('invalid configured TD area');
    file = path.join(dataDir, 'recordings', `td-${area}-${dates[0]}.ndjson`);
    type = 'application/x-ndjson; charset=utf-8';
  } else return null;
  try {
    return { status: 200, body: await readFile(file, 'utf8'), type };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { status: 404, body: JSON.stringify({ error: 'not found' }), type: 'application/json; charset=utf-8' };
  }
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
}

export async function startRelay({
  area,
  topic,
  trustTopic,
  port = 0,
  dataDir,
  anchorsFile,
  sclassFile,
  feedEnabled = true,
  scheduleEnabled = false,
  readCredentials,
  connectSocket,
  heartbeat,
  backoff,
  fetchImpl,
  log = () => {},
  now = Date.now,
}) {
  const state = new TdState(area);
  const recent = [];
  const listeners = new Set();
  const heartbeats = new Set();
  let closing;
  const status = { state: feedEnabled ? 'connecting' : 'disabled', connectedAt: null, lastEventAt: null, badMessages: 0 };
  const recorder = await createRecorder({ dir: path.join(dataDir, 'recordings'), area, now,
    onSnapshot: (row) => { for (const send of listeners) send(row); } });
  const store = createStaticStore({ dataDir, readCredentials, fetchImpl, now });
  let services = [];
  const trust = createTrustState({ area, services: () => services, now });
  const publishTrust = (events) => {
    for (const e of events) {
      recorder.append(e);
      const row = { t: now(), e };
      for (const send of listeners) send(row);
    }
  };
  const schedules = createScheduleStore({ dataDir, readCredentials, fetchImpl, now,
    enabled: scheduleEnabled, corpus: () => store.get('corpus'), log,
    onReady: (doc) => {
      services = doc.calls;
      publishTrust(trust.setServices(doc.calls));
    } });
  schedules.start();

  const feed = feedEnabled
    ? runFeed({
        connectSocket,
        readCredentials,
        topic,
        trustTopic,
        area,
        heartbeat,
        backoff,
        log,
        onTrust: (body) => publishTrust(trust.apply(body)),
        onStatus: (s) => {
          if (s.badMessage) status.badMessages += 1;
          else status.state = s.state;
          if (s.state === 'connected' && !s.badMessage) { status.connectedAt = now(); recorder.checkpoint(); }
        },
        onEvents: (events) => {
          const t = now();
          for (const e of events) {
            if (!state.apply(e)) continue;
            const row = { t, e };
            recent.push(row);
            if (recent.length > RECENT_MAX) recent.shift();
            recorder.append(e);
            for (const send of listeners) send(row);
          }
          status.lastEventAt = t;
        },
      })
    : null;

  const server = http.createServer(async (req, res) => {
    try {
      const { port: boundPort } = server.address();
      const refusal = requestFailure(req.headers.host, boundPort, req.method);
      if (refusal) return json(res, refusal, { error: refusal === 403 ? 'host not allowed' : 'GET only' });
      const url = new URL(req.url, `http://127.0.0.1:${boundPort}`);

      const file = await localFile(url, { dataDir, area, anchorsFile, sclassFile });
      if (file) {
        res.writeHead(file.status, { 'content-type': file.type, 'cache-control': 'no-store' });
        return res.end(file.body);
      }

      switch (url.pathname) {
        case '/health':
          return json(res, 200, {
            ok: true,
            area,
            feed: status.state,
            connectedAt: status.connectedAt,
            lastEventAgeMs: status.lastEventAt ? now() - status.lastEventAt : null,
            badMessages: status.badMessages,
            counts: state.snapshot().counts,
            schedule: schedules.stats(),
            trust: trust.stats(),
          });
        case '/schedule': {
          const dates = url.searchParams.getAll('date');
          const date = dates[0] ?? scheduleDate(now());
          if (dates.length > 1 || !validDate(date) || [...url.searchParams.keys()].some(key => key !== 'date'))
            return json(res, 400, { error: 'date must be YYYY-MM-DD' });
          const doc = await schedules.get(date);
          if (!doc) return json(res, 404, { error: 'schedule not available yet' });
          return json(res, 200, { ...doc, ...trust.enrich(doc.calls) });
        }
        case '/snapshot':
          return json(res, 200, state.snapshot());
        case '/recent': {
          const n = Math.min(Math.max(Number(url.searchParams.get('n')) || 200, 1), RECENT_MAX);
          return json(res, 200, recent.slice(-n));
        }
        case '/events': {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
          res.write(`event: snapshot\ndata: ${JSON.stringify(state.snapshot())}\n\n`);
          const send = (row) => {
            if (row.e.kind === 'snapshot') {
              const { kind, ...snapshot } = row.e;
              res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
            } else if (row.e.kind === 'trust') res.write(`event: trust\ndata: ${JSON.stringify(row)}\n\n`);
            else res.write(`event: td\ndata: ${JSON.stringify(row)}\n\n`);
          };
          listeners.add(send);
          const stopHeartbeat = startEventHeartbeat(req, res, { now });
          heartbeats.add(stopHeartbeat);
          req.once('close', () => {
            listeners.delete(send);
            heartbeats.delete(stopHeartbeat);
          });
          return undefined;
        }
        case '/static/smart': {
          const td = url.searchParams.get('td');
          if (!td) return json(res, 400, { error: 'td parameter required' });
          return json(res, 200, await store.smartRows({ td }));
        }
        case '/static/corpus': {
          const stanox = url.searchParams.get('stanox');
          if (!stanox) return json(res, 400, { error: 'stanox parameter required' });
          return json(res, 200, await store.corpusRows({ stanox }));
        }
        default:
          return json(res, 404, { error: 'not found' });
      }
    } catch (err) {
      log(`relay: request failed: ${err.message}`);
      return json(res, 502, { error: 'upstream or internal error' });
    }
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } catch (error) { feed?.stop(); await schedules.close(); await recorder.close(); throw error; }

  return {
    host: server.address().address,
    port: server.address().port,
    state,
    close() {
      if (closing) return closing;
      return closing = (async () => {
        feed?.stop();
        for (const stopHeartbeat of heartbeats) stopHeartbeat();
        heartbeats.clear();
        listeners.clear();
        // Stop periodic writes before waiting for sockets. A server-close error must
        // still finish the recording, and callers may share the same close promise.
        const recorded = recorder.close();
        const scheduled = schedules.close();
        try {
          await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
            server.closeAllConnections();
          });
        } finally { await Promise.all([recorded, scheduled]); }
      })();
    },
  };
}
