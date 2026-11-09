import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { test } from 'node:test';
import { areaDataDir, configuredAreas, requestArea } from '../areas.mjs';
import { runFeed } from '../feed.mjs';
import { encodeFrame, FrameParser } from '../stomp.mjs';

test('areas: configuredAreas parses and deduplicates an ordered allowlist', () => {
  assert.doesNotThrow(() => configuredAreas(' Y9 , Y4 '), 'blanks around an entry are ignored');
  assert.deepEqual(configuredAreas(' Y9 , Y4 '), ['Y9', 'Y4']);
  assert.deepEqual(configuredAreas('Y9, Y4, Y9'), ['Y9', 'Y4']);
  assert.deepEqual(configuredAreas(['Y9', 'X1']), ['Y9', 'X1']);
  assert.deepEqual(configuredAreas(undefined), ['Y9']);
  assert.deepEqual(configuredAreas(undefined, 'X1'), ['X1']);
});

test('areas: configuredAreas rejects empty and malformed area entries', () => {
  for (const value of ['', '  ', 'Y9,', 'Y9,,X1', 'y9', 'A', 'Y99', 'Y9, bad']) {
    assert.throws(() => configuredAreas(value), undefined, `expected rejection for ${JSON.stringify(value)}`);
  }
  assert.throws(() => configuredAreas([]));
  assert.throws(() => configuredAreas(['Y9', ' y9 ']));
});

test('areas: requestArea selects the default or one configured area', () => {
  const areas = ['Y9', 'Y4'];
  assert.doesNotThrow(() => requestArea('/api/events', areas, 'Y9'), 'a request with no selector gets the default');
  assert.equal(requestArea('/api/events', areas, 'Y9'), 'Y9');
  assert.equal(requestArea('/api/events?view=map&area=Y4', areas, 'Y9'), 'Y4');
});

test('areas: requestArea refuses unknown, duplicate, empty and malformed selectors', () => {
  const areas = ['Y9', 'Y4'];
  for (const url of [
    '/api/events?area=X1',
    '/api/events?area=Y9&area=Y4',
    '/api/events?area=',
    '/api/events?area=y9',
    '/api/events?area=Y99',
  ]) {
    assert.throws(() => requestArea(url, areas, 'Y9'), undefined, `expected rejection for ${url}`);
  }
});

test('areas: requestArea needs exactly one default area', () => {
  const areas = ['Y9', 'Y4'];
  assert.throws(() => requestArea('/api/events', areas, 'Y9,Y4'), /single area/);
  assert.throws(() => requestArea('/api/events', areas, []));
  assert.equal(requestArea('/api/events', areas, 'Y4'), 'Y4', 'the default is the one area given');
  assert.throws(() => requestArea('/api/events', areas, 'X1'), /unknown area/, 'a default outside the allowlist is refused');
});

test('areas: areaDataDir preserves Y9 storage and isolates other areas', () => {
  assert.equal(areaDataDir('/data', 'Y9'), '/data');
  assert.equal(areaDataDir('/data', 'Y4'), path.join('/data', 'areas', 'Y4'));
  assert.throws(() => areaDataDir('/data', '../'));
});

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.parser = new FrameParser();
    this.subscriptions = [];
    this.closed = false;
  }

  write(chunk) {
    for (const frame of this.parser.push(Buffer.from(chunk))) {
      if (frame.command === 'CONNECT') {
        queueMicrotask(() => {
          if (!this.closed) this.emit('data', encodeFrame('CONNECTED', { version: '1.2', 'heart-beat': '0,0' }));
        });
      } else if (frame.command === 'SUBSCRIBE') this.subscriptions.push(frame.headers.destination);
    }
    return true;
  }

  push(body) {
    this.emit('data', encodeFrame('MESSAGE', {
      destination: '/topic/TD_ALL_SIG_AREA',
      subscription: 'sub-0',
    }, body));
  }

  end() { this.destroy(); }
  destroy() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
}

test('feed: invalid areas fail before credentials or transport are requested', () => {
  let credentialReads = 0;
  let connections = 0;
  assert.throws(() => runFeed({
    areas: ['../'],
    connectSocket: () => { connections += 1; return new FakeSocket(); },
    readCredentials: async () => { credentialReads += 1; return {}; },
    topic: '/topic/TD_ALL_SIG_AREA',
  }));
  assert.equal(credentialReads, 0);
  assert.equal(connections, 0);
});

test('feed: fake transport parses a mixed-area MESSAGE once and delivers allowed areas', async (t) => {
  const socket = new FakeSocket();
  let connections = 0;
  let onEventsCalls = 0;
  const delivered = [];
  let resolveConnected;
  const connected = new Promise((resolve) => { resolveConnected = resolve; });
  const feed = runFeed({
    connectSocket: () => { connections += 1; return socket; },
    readCredentials: async () => ({ account: 'feed@example.test', secret: 'synthetic-only' }),
    topic: '/topic/TD_ALL_SIG_AREA',
    areas: ['Y9', 'Y4'],
    onEvents: (events) => { onEventsCalls += 1; delivered.push(...events); },
    onStatus: ({ state }) => { if (state === 'connected') resolveConnected(); },
    heartbeat: [0, 0],
  });
  t.after(() => feed.stop());
  let connectTimeout;
  try {
    await Promise.race([
      connected,
      new Promise((_, reject) => { connectTimeout = setTimeout(() => reject(new Error('fake feed did not connect')), 1000); }),
    ]);
  } finally {
    clearTimeout(connectTimeout);
  }

  const body = JSON.stringify([
    { CA_MSG: { area_id: 'Y9', descr: '1A23', from: '1234', to: '5678', time: '1000' } },
    { CA_MSG: { area_id: 'Y4', descr: '2B34', from: '2345', to: '6789', time: '2000' } },
    { CA_MSG: { area_id: 'X1', descr: '3C45', from: '3456', to: '7890', time: '3000' } },
  ]);
  const originalParse = JSON.parse.bind(JSON);
  let parseCalls = 0;
  t.mock.method(JSON, 'parse', (text, ...args) => {
    parseCalls += 1;
    return originalParse(text, ...args);
  });
  socket.push(body);

  assert.equal(connections, 1);
  assert.deepEqual(socket.subscriptions, ['/topic/TD_ALL_SIG_AREA']);
  assert.equal(parseCalls, 1);
  assert.equal(onEventsCalls, 1);
  assert.deepEqual(delivered.map((event) => event.area), ['Y9', 'Y4']);
  feed.stop();
});

test('feed: legacy area parameter still filters to its custom area', async (t) => {
  const socket = new FakeSocket();
  let resolveConnected;
  const connected = new Promise((resolve) => { resolveConnected = resolve; });
  const delivered = [];
  const feed = runFeed({
    connectSocket: () => socket,
    readCredentials: async () => ({ account: 'feed@example.test', secret: 'synthetic-only' }),
    topic: '/topic/TD_ALL_SIG_AREA',
    area: 'Y4',
    onEvents: (events) => delivered.push(...events),
    onStatus: ({ state }) => { if (state === 'connected') resolveConnected(); },
    heartbeat: [0, 0],
  });
  t.after(() => feed.stop());
  let connectTimeout;
  try {
    await Promise.race([
      connected,
      new Promise((_, reject) => { connectTimeout = setTimeout(() => reject(new Error('fake feed did not connect')), 1000); }),
    ]);
  } finally {
    clearTimeout(connectTimeout);
  }
  socket.push(JSON.stringify([
    { CA_MSG: { area_id: 'Y9', descr: '1A23', from: '1234', to: '5678', time: '1000' } },
    { CA_MSG: { area_id: 'Y4', descr: '2B34', from: '2345', to: '6789', time: '2000' } },
  ]));
  assert.deepEqual(delivered.map((event) => event.area), ['Y4']);
  feed.stop();
});
