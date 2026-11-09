import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import util from 'node:util';
import { test } from 'node:test';
import { FrameParser, StompClient, encodeFrame } from '../stomp.mjs';
import { runFeed } from '../feed.mjs';

const frameText = (command, headers, body) => encodeFrame(command, headers, body).toString('utf8');

class FakeSocket extends EventEmitter {
  constructor(onWrite = () => {}) {
    super();
    this.parser = new FrameParser();
    this.writes = [];
    this.frames = [];
    this.onWrite = onWrite;
    this.closed = false;
  }

  write(chunk) {
    this.writes.push(chunk);
    for (const frame of this.parser.push(Buffer.from(chunk))) {
      this.frames.push(frame);
      this.onWrite(frame);
    }
    return true;
  }

  send(command, headers = {}, body = '') {
    if (!this.closed) this.emit('data', encodeFrame(command, headers, body));
  }

  end() { this.destroy(); }
  destroy() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
}

test('encode then parse round-trips a frame with a body', () => {
  const p = new FrameParser();
  const frames = p.push(encodeFrame('SEND', { destination: '/topic/x' }, '{"a":1}'));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].command, 'SEND');
  assert.equal(frames[0].headers.destination, '/topic/x');
  assert.equal(frames[0].body, '{"a":1}');
});

test('a frame split into single bytes still parses once complete', () => {
  const p = new FrameParser();
  const bytes = encodeFrame('MESSAGE', { destination: '/topic/TD', subscription: 's' }, 'hello');
  let frames = [];
  for (const b of bytes) frames = frames.concat(p.push(Buffer.from([b])));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].body, 'hello');
});

test('two frames in one chunk, with heart-beat newlines between them', () => {
  const p = new FrameParser();
  const both = Buffer.concat([
    encodeFrame('MESSAGE', { n: '1' }, 'one'),
    Buffer.from('\n\n'),
    encodeFrame('MESSAGE', { n: '2' }, 'two'),
    Buffer.from('\n'),
  ]);
  const frames = p.push(both);
  assert.deepEqual(frames.map((f) => f.body), ['one', 'two']);
});

test('content-length lets a body contain NUL bytes', () => {
  const p = new FrameParser();
  const body = 'ab\u0000cd';
  const frames = p.push(encodeFrame('MESSAGE', {}, body));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].body, body);
});

test('header values are escaped and unescaped (colon and newline)', () => {
  const p = new FrameParser();
  const frames = p.push(encodeFrame('MESSAGE', { 'a:b': 'x:y\nz\\w' }, ''));
  assert.equal(frames[0].headers['a:b'], 'x:y\nz\\w');
});

test('CONNECT headers are not escaped, so a colon in a passcode survives', () => {
  const text = frameText('CONNECT', { passcode: 'p:q' }, '');
  assert.match(text, /passcode:p:q\n/);
});

test('first occurrence of a repeated header wins', () => {
  const p = new FrameParser();
  const frames = p.push(Buffer.from('MESSAGE\nk:first\nk:second\n\nbody\u0000'));
  assert.equal(frames[0].headers.k, 'first');
});

test('a frame whose content-length is not followed by NUL is a protocol error', () => {
  const p = new FrameParser();
  assert.throws(() => p.push(Buffer.from('MESSAGE\ncontent-length:3\n\nabcX')), /not terminated/);
});

test('a frame over the size cap is rejected', () => {
  const p = new FrameParser();
  assert.throws(() => p.push(Buffer.from('MESSAGE\ncontent-length:99999999\n\n')), /too large/);
});

// ---- client against a loopback fake server -------------------------------------------

function close(server) {
  for (const socket of server.testClients) socket.destroy();
  for (const socket of server.testAccepted) socket.destroy();
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(resolve));
}

async function fakeServer(t, onConnection) {
  const server = net.createServer((socket) => {
    server.testAccepted.add(socket);
    socket.once('close', () => server.testAccepted.delete(socket));
    onConnection(socket);
  });
  server.testClients = new Set();
  server.testAccepted = new Set();
  t.after(() => close(server));
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', onError);
      resolve();
    });
  });
  return server;
}

function clientSocket(server) {
  const socket = net.connect(server.address().port, '127.0.0.1');
  server.testClients.add(socket);
  socket.once('close', () => server.testClients.delete(socket));
  return socket;
}

test('client sends CONNECT with credentials, subscribes after CONNECTED, and emits messages', async (t) => {
  const seen = [];
  const server = await fakeServer(t, (sock) => {
    const p = new FrameParser();
    sock.on('data', (d) => {
      for (const f of p.push(d)) {
        seen.push(f);
        if (f.command === 'CONNECT') sock.write(encodeFrame('CONNECTED', { version: '1.2', server: 'fake/1', 'heart-beat': '0,0' }));
        if (f.command === 'SUBSCRIBE') {
          sock.write(encodeFrame('MESSAGE', { destination: f.headers.destination, subscription: f.headers.id }, '[{"CT_MSG":{}}]'));
        }
      }
    });
  });
  const socket = clientSocket(server);
  const client = new StompClient(socket, { login: 'me@example.test', passcode: 'S3CRET:x', heartbeat: [0, 0] });
  const message = new Promise((resolve) => client.on('message', resolve));
  client.subscribe('/topic/TD_ALL_SIG_AREA'); // queued until CONNECTED
  client.start();
  const m = await message;
  assert.equal(m.destination, '/topic/TD_ALL_SIG_AREA');
  assert.equal(m.body, '[{"CT_MSG":{}}]');
  const connect = seen.find((f) => f.command === 'CONNECT');
  assert.equal(connect.headers.login, 'me@example.test');
  assert.equal(connect.headers.passcode, 'S3CRET:x');
  assert.equal(connect.headers['accept-version'], '1.2,1.1,1.0');
  assert.ok(seen.findIndex((f) => f.command === 'SUBSCRIBE') > seen.findIndex((f) => f.command === 'CONNECT'));
  socket.destroy();
  await close(server);
});

test('SUBSCRIBE is held back until the server has answered CONNECT', async (t) => {
  let subscribedEarly = false;
  let connectedSent = false;
  const server = await fakeServer(t, (sock) => {
    const p = new FrameParser();
    sock.on('data', (d) => {
      for (const f of p.push(d)) {
        if (f.command === 'SUBSCRIBE' && !connectedSent) subscribedEarly = true;
        if (f.command === 'CONNECT') {
          setTimeout(() => {
            connectedSent = true;
            sock.write(encodeFrame('CONNECTED', { version: '1.2', 'heart-beat': '0,0' }));
          }, 60);
        }
        if (f.command === 'SUBSCRIBE') sock.write(encodeFrame('MESSAGE', { destination: 'd', subscription: 's' }, 'x'));
      }
    });
  });
  const socket = clientSocket(server);
  const client = new StompClient(socket, { login: 'l', passcode: 'p', heartbeat: [0, 0] });
  const message = new Promise((resolve) => client.on('message', resolve));
  client.subscribe('/topic/x');
  client.start();
  await message;
  assert.equal(subscribedEarly, false);
  socket.destroy();
  await close(server);
});

test('the client never emits or stringifies the passcode', async (t) => {
  const sock = new net.Socket();
  t.after(() => sock.destroy());
  sock.write = () => true;
  const client = new StompClient(sock, { login: 'l', passcode: 'SENTINEL-PASSCODE' });
  const dump = JSON.stringify(client) + String(Object.keys(client)) + JSON.stringify(Object.getOwnPropertyNames(client));
  assert.ok(!dump.includes('SENTINEL-PASSCODE'));

  // Now run real clients against a loopback stub (127.0.0.1, ephemeral port, fake passcode only). The stub plays an
  // untrusted server: it echoes the passcode back in every field it controls, the CONNECTED server header and an
  // ERROR frame's message and body, so any path that forwards upstream text would carry it into an event.
  const PASS = 'SENTINEL-PASSCODE';
  const wire = [];
  const server = await fakeServer(t, (s) => {
    const parser = new FrameParser();
    s.on('data', (d) => {
      for (const f of parser.push(d)) {
        wire.push(f);
        if (f.command === 'CONNECT' && f.headers.login === 'stub-ok') s.write(encodeFrame('CONNECTED', { version: '1.2', server: 'stub/1 ' + PASS, 'heart-beat': '0,0' }));
        if (f.command === 'CONNECT' && f.headers.login === 'stub-err') s.write(encodeFrame('ERROR', { message: 'login refused for ' + PASS }, PASS));
        if (f.command === 'SUBSCRIBE') s.write(encodeFrame('MESSAGE', { destination: f.headers.destination, subscription: f.headers.id }, '[{"CT_MSG":{}}]'));
      }
    });
  });
  const emitted = [];
  const watch = (live) => {
    for (const name of ['connected', 'message', 'fault', 'close']) {
      live.on(name, (...args) => emitted.push({ name, args: args.map((a) => (a instanceof Error ? { name: a.name, message: a.message, stack: a.stack } : a)) }));
    }
  };
  const ok = new StompClient(clientSocket(server), { login: 'stub-ok', passcode: PASS, heartbeat: [0, 0] });
  watch(ok);
  const gotMessage = new Promise((resolve) => ok.once('message', resolve));
  ok.subscribe('/topic/x');
  ok.start();
  await gotMessage;
  const okClosed = new Promise((resolve) => ok.once('close', resolve));
  ok.disconnect();
  await okClosed;
  const refused = new StompClient(clientSocket(server), { login: 'stub-err', passcode: PASS, heartbeat: [0, 0] });
  watch(refused);
  const refusedClosed = new Promise((resolve) => refused.once('close', resolve));
  refused.start();
  await refusedClosed;
  assert.deepEqual(emitted.map((e) => e.name), ['connected', 'message', 'close', 'fault', 'close'], 'the stub drove every event path of the client');
  const emittedText = JSON.stringify(emitted);
  assert.ok(!emittedText.includes(PASS), 'an event the client emitted carried the passcode: ' + emittedText);
  const connects = wire.filter((f) => f.command === 'CONNECT');
  assert.equal(connects.length, 2, 'both clients connected to the stub');
  for (const f of connects) assert.equal(f.headers.passcode, PASS, 'CONNECT is the one frame that carries the passcode');
  const leakyFrames = wire.filter((f) => f.command !== 'CONNECT' && JSON.stringify(f).includes(PASS)).map((f) => f.command);
  assert.deepEqual(leakyFrames, [], 'no frame after CONNECT may carry the passcode');
  assert.ok(!(util.inspect(ok, { showHidden: true, depth: 4 }) + util.inspect(refused, { showHidden: true, depth: 4 })).includes(PASS), 'inspecting a started client shows the passcode');
});

test('an ERROR frame becomes a fault without upstream text', async (t) => {
  const server = await fakeServer(t, (sock) => {
    sock.on('data', () => sock.write(encodeFrame('ERROR', { message: 'bad login' }, 'details')));
  });
  const socket = clientSocket(server);
  const client = new StompClient(socket, { login: 'l', passcode: 'p', heartbeat: [0, 0] });
  const fault = new Promise((resolve) => client.on('fault', resolve));
  const closed = new Promise((resolve) => client.on('close', resolve));
  client.start();
  const err = await fault;
  assert.equal(err.message, 'stomp: ERROR frame');
  await closed;
  await close(server);
});

test('a silent server trips the heart-beat timeout', async (t) => {
  const server = await fakeServer(t, (sock) => {
    sock.on('data', () => sock.write(encodeFrame('CONNECTED', { version: '1.2', 'heart-beat': '40,0' })));
  });
  const socket = clientSocket(server);
  const client = new StompClient(socket, { login: 'l', passcode: 'p', heartbeat: [0, 40] });
  const fault = new Promise((resolve) => client.on('fault', resolve));
  client.start();
  const err = await fault;
  assert.match(err.message, /heart-beat timeout/);
  await close(server);
});

test('a garbled stream is a fault, not a crash', async (t) => {
  const server = await fakeServer(t, (sock) => {
    sock.on('data', () => sock.write('MESSAGE\ncontent-length:2\n\nabX'));
  });
  const socket = clientSocket(server);
  const client = new StompClient(socket, { login: 'l', passcode: 'p', heartbeat: [0, 0] });
  const fault = new Promise((resolve) => client.on('fault', resolve));
  client.start();
  assert.match((await fault).message, /not terminated/);
  await close(server);
});

test('stomp: fake transport gates subscriptions and delivers a message', (t) => {
  const socket = new FakeSocket();
  const client = new StompClient(socket, { login: 'l', passcode: 'p', heartbeat: [0, 0] });
  t.after(() => client.disconnect());
  let message;
  client.on('message', (value) => { message = value; });
  client.subscribe('/topic/x');
  client.start();
  assert.deepEqual(socket.frames.map((frame) => frame.command), ['CONNECT']);
  socket.send('CONNECTED', { version: '1.2', 'heart-beat': '0,0' });
  assert.deepEqual(socket.frames.map((frame) => frame.command), ['CONNECT', 'SUBSCRIBE']);
  socket.send('MESSAGE', { destination: '/topic/x', subscription: 's' }, 'synthetic');
  assert.deepEqual(message, {
    destination: '/topic/x', subscription: 's',
    headers: Object.assign(Object.create(null), { destination: '/topic/x', subscription: 's', 'content-length': '9' }),
    body: 'synthetic',
  });
});

test('stomp: fake transport detects server heart-beat timeout', (t) => {
  let now = 1000;
  const intervals = [];
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setInterval', (callback, milliseconds) => {
    const timer = { callback, milliseconds, unref() {} };
    intervals.push(timer);
    return timer;
  });
  t.mock.method(globalThis, 'clearInterval', () => {});
  const socket = new FakeSocket();
  const client = new StompClient(socket, { login: 'l', passcode: 'p', heartbeat: [0, 20] });
  t.after(() => client.disconnect());
  const faults = [];
  client.on('fault', (error) => faults.push(error));
  client.start();
  socket.send('CONNECTED', { version: '1.2', 'heart-beat': '20,0' });
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].milliseconds, 10);
  now = 1051;
  intervals[0].callback();
  assert.equal(faults.length, 1);
  assert.match(faults[0].message, /heart-beat timeout/);
  assert.equal(socket.closed, true);
});

test('stomp: fake transport turns ERROR frames into safe faults', (t) => {
  const socket = new FakeSocket();
  const client = new StompClient(socket, { login: 'l', passcode: 'SENTINEL', heartbeat: [0, 0] });
  t.after(() => client.disconnect());
  const faults = [];
  client.on('fault', (error) => faults.push(error));
  client.start();
  socket.send('ERROR', { message: 'bad login' }, 'SENTINEL details');
  assert.equal(faults.length, 1);
  assert.equal(faults[0].message, 'stomp: ERROR frame');
  assert.ok(!faults[0].message.includes('SENTINEL'));
  assert.equal(socket.closed, true);
});

test('feed: fake transport keeps credentials private, logs bad bodies, and reconnects', async (t) => {
  const sockets = [];
  const logs = [];
  const events = [];
  const timers = [];
  const statuses = [];
  let connectedCount = 0;
  let readCount = 0;
  const waiters = [];
  const waitConnected = async (n) => {
    if (connectedCount >= n) return;
    await new Promise((resolve) => waiters.push({ n, resolve }));
  };
  const feed = runFeed({
    connectSocket: () => {
      const socket = new FakeSocket((frame) => {
        if (frame.command === 'CONNECT') queueMicrotask(() => socket.send('CONNECTED', { version: '1.2', server: 'synthetic', 'heart-beat': '0,0' }));
      });
      sockets.push(socket);
      return socket;
    },
    readCredentials: async () => { readCount += 1; return { account: 'synthetic', secret: 'SENTINEL-PASSCODE' }; },
    topic: '/topic/TD_ALL_SIG_AREA', area: 'Y9',
    onEvents: (batch) => events.push(...batch),
    onStatus: (status) => {
      statuses.push(status);
      if (status.state === 'connected') {
        connectedCount += 1;
        for (const waiter of waiters.splice(0)) if (waiter.n <= connectedCount) waiter.resolve();
      }
    },
    log: (line) => logs.push(line),
    heartbeat: [0, 0], backoff: { minMs: 20, maxMs: 40 },
    setTimer: (callback, milliseconds) => { const timer = { callback, milliseconds, unref() {} }; timers.push(timer); return timer; },
    clearTimer: () => {},
  });
  t.after(() => feed.stop());
  await waitConnected(1);
  assert.ok(!logs.join('\n').includes('SENTINEL-PASSCODE'));
  sockets[0].send('MESSAGE', { destination: '/topic/TD_ALL_SIG_AREA', subscription: 'sub-0' }, JSON.stringify([
    { CA_MSG: { area_id: 'Y9', msg_type: 'CA', descr: '1A23', from: '2034', to: '1001', time: '1700000000000' } },
  ]));
  sockets[0].send('MESSAGE', { destination: '/topic/TD_ALL_SIG_AREA', subscription: 'sub-0' }, '{bad json');
  assert.deepEqual(events.map((event) => event.descr), ['1A23']);
  assert.ok(statuses.some((status) => status.badMessage));
  assert.ok(logs.some((line) => /dropped a bad message/.test(line)));

  sockets[0].destroy();
  assert.equal(timers.length, 1, 'closing the connection schedules one retry');
  assert.equal(timers[0].milliseconds, 20);
  assert.ok(logs.some((line) => /reconnecting/.test(line)));
  const secondConnected = waitConnected(2);
  timers[0].callback();
  await secondConnected;
  assert.equal(readCount, 2);
});
