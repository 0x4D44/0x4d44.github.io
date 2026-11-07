// Keeps one STOMP connection to the TD topic alive: connect, subscribe, parse, reconnect
// with backoff. Reports through callbacks and never logs credentials.
import { StompClient } from './stomp.mjs';
import { inArea, parseTdBody } from './td.mjs';

export function runFeed({
  connectSocket, // () => socket
  readCredentials, // () => Promise<{account, secret}>
  topic,
  area,
  onEvents, // (events: normalised[]) => void
  onStatus = () => {},
  log = () => {},
  heartbeat = [15000, 15000],
  backoff = { minMs: 1000, maxMs: 60_000 },
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let stopped = false;
  let client = null;
  let timer = null;
  let delay = backoff.minMs;

  async function attempt() {
    if (stopped) return;
    onStatus({ state: 'connecting' });
    let creds;
    try {
      creds = await readCredentials();
    } catch (err) {
      log(`feed: ${err.message}`);
      return schedule();
    }
    if (stopped) return;
    const socket = connectSocket();
    client = new StompClient(socket, { login: creds.account, passcode: creds.secret, heartbeat });
    client.on('connected', ({ server }) => {
      delay = backoff.minMs;
      onStatus({ state: 'connected', server });
      log(`feed: connected${server ? ` to ${server}` : ''}, subscribed to ${topic}`);
    });
    client.on('message', ({ body }) => {
      let events;
      try {
        events = inArea(parseTdBody(body), area);
      } catch (err) {
        onStatus({ state: 'connected', badMessage: true });
        log(`feed: dropped a bad message (${err.message})`);
        return;
      }
      if (events.length) onEvents(events);
    });
    client.on('fault', (err) => log(`feed: ${err.message}`));
    client.on('close', () => {
      client = null;
      onStatus({ state: 'disconnected' });
      schedule();
    });
    client.subscribe(topic);
    client.start();
  }

  function schedule() {
    if (stopped) return;
    log(`feed: reconnecting in ${Math.round(delay / 1000)}s`);
    timer = setTimer(attempt, delay);
    timer.unref?.();
    delay = Math.min(delay * 2, backoff.maxMs);
  }

  attempt();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimer(timer);
      client?.disconnect();
    },
  };
}
