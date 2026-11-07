import assert from 'node:assert/strict';
import net from 'node:net';
import { test } from 'node:test';
import { FrameParser, StompClient, encodeFrame } from '../stomp.mjs';

const frameText = (command, headers, body) => encodeFrame(command, headers, body).toString('utf8');

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

function fakeServer(onConnection) {
  return new Promise((resolve) => {
    const server = net.createServer(onConnection);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const close = (server) => new Promise((resolve) => server.close(resolve));

test('client sends CONNECT with credentials, subscribes after CONNECTED, and emits messages', async () => {
  const seen = [];
  const server = await fakeServer((sock) => {
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
  const socket = net.connect(server.address().port, '127.0.0.1');
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

test('SUBSCRIBE is held back until the server has answered CONNECT', async () => {
  let subscribedEarly = false;
  let connectedSent = false;
  const server = await fakeServer((sock) => {
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
  const socket = net.connect(server.address().port, '127.0.0.1');
  const client = new StompClient(socket, { login: 'l', passcode: 'p', heartbeat: [0, 0] });
  const message = new Promise((resolve) => client.on('message', resolve));
  client.subscribe('/topic/x');
  client.start();
  await message;
  assert.equal(subscribedEarly, false);
  socket.destroy();
  await close(server);
});

test('the client never emits or stringifies the passcode', async () => {
  const sock = new net.Socket();
  sock.write = () => true;
  const client = new StompClient(sock, { login: 'l', passcode: 'SENTINEL-PASSCODE' });
  const dump = JSON.stringify(client) + String(Object.keys(client)) + JSON.stringify(Object.getOwnPropertyNames(client));
  assert.ok(!dump.includes('SENTINEL-PASSCODE'));
});

test('an ERROR frame becomes a fault carrying only the message header', async () => {
  const server = await fakeServer((sock) => {
    sock.on('data', () => sock.write(encodeFrame('ERROR', { message: 'bad login' }, 'details')));
  });
  const socket = net.connect(server.address().port, '127.0.0.1');
  const client = new StompClient(socket, { login: 'l', passcode: 'p', heartbeat: [0, 0] });
  const fault = new Promise((resolve) => client.on('fault', resolve));
  const closed = new Promise((resolve) => client.on('close', resolve));
  client.start();
  const err = await fault;
  assert.match(err.message, /bad login/);
  await closed;
  await close(server);
});

test('a silent server trips the heart-beat timeout', async () => {
  const server = await fakeServer((sock) => {
    sock.on('data', () => sock.write(encodeFrame('CONNECTED', { version: '1.2', 'heart-beat': '40,0' })));
  });
  const socket = net.connect(server.address().port, '127.0.0.1');
  const client = new StompClient(socket, { login: 'l', passcode: 'p', heartbeat: [0, 40] });
  const fault = new Promise((resolve) => client.on('fault', resolve));
  client.start();
  const err = await fault;
  assert.match(err.message, /heart-beat timeout/);
  await close(server);
});

test('a garbled stream is a fault, not a crash', async () => {
  const server = await fakeServer((sock) => {
    sock.on('data', () => sock.write('MESSAGE\ncontent-length:2\n\nabX'));
  });
  const socket = net.connect(server.address().port, '127.0.0.1');
  const client = new StompClient(socket, { login: 'l', passcode: 'p', heartbeat: [0, 0] });
  const fault = new Promise((resolve) => client.on('fault', resolve));
  client.start();
  assert.match((await fault).message, /not terminated/);
  await close(server);
});
