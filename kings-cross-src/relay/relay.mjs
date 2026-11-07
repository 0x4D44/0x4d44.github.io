// The relay: holds the Network Rail connection and serves what it sees on 127.0.0.1.
//
//   GET /health           connection state and counters
//   GET /snapshot         current berth occupancy for the area (plus S-class bytes if any)
//   GET /recent?n=200     the last n normalised events {t, e}
//   GET /events           Server-Sent Events: `snapshot` first, then one `td` per event
//   GET /static/smart?td=Y9         SMART rows for a TD area
//   GET /static/corpus?stanox=54311 CORPUS rows for a STANOX
//
// It binds loopback only, answers only GET, rejects any Host header that is not loopback
// (DNS-rebinding guard) and sends no CORS headers. No response ever contains the login.
import http from 'node:http';
import path from 'node:path';
import { runFeed } from './feed.mjs';
import { createRecorder } from './recorder.mjs';
import { createStaticStore } from './static.mjs';
import { TdState } from './state.mjs';

const RECENT_MAX = 2000;

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
}

export async function startRelay({
  area,
  topic,
  port = 0,
  dataDir,
  feedEnabled = true,
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
  const status = { state: feedEnabled ? 'connecting' : 'disabled', connectedAt: null, lastEventAt: null, badMessages: 0 };
  const recorder = await createRecorder({ dir: path.join(dataDir, 'recordings'), area, now });
  const store = createStaticStore({ dataDir, readCredentials, fetchImpl, now });

  const feed = feedEnabled
    ? runFeed({
        connectSocket,
        readCredentials,
        topic,
        area,
        heartbeat,
        backoff,
        log,
        onStatus: (s) => {
          if (s.badMessage) status.badMessages += 1;
          else status.state = s.state;
          if (s.state === 'connected' && !s.badMessage) status.connectedAt = now();
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
      if (!['127.0.0.1', 'localhost'].some((h) => req.headers.host === `${h}:${boundPort}`)) {
        return json(res, 403, { error: 'host not allowed' });
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
      const url = new URL(req.url, `http://127.0.0.1:${boundPort}`);

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
          });
        case '/snapshot':
          return json(res, 200, state.snapshot());
        case '/recent': {
          const n = Math.min(Math.max(Number(url.searchParams.get('n')) || 200, 1), RECENT_MAX);
          return json(res, 200, recent.slice(-n));
        }
        case '/events': {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
          res.write(`event: snapshot\ndata: ${JSON.stringify(state.snapshot())}\n\n`);
          const send = (row) => res.write(`event: td\ndata: ${JSON.stringify(row)}\n\n`);
          listeners.add(send);
          const ping = setInterval(() => res.write(': keep-alive\n\n'), 15_000);
          req.on('close', () => {
            clearInterval(ping);
            listeners.delete(send);
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

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  return {
    host: server.address().address,
    port: server.address().port,
    state,
    async close() {
      feed?.stop();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await recorder.close();
    },
  };
}
