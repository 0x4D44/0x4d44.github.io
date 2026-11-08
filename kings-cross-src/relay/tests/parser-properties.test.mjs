import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { FrameParser, StompClient, encodeFrame } from '../stomp.mjs';
import { parseTdBody, inArea } from '../td.mjs';
import { TdState } from '../state.mjs';

// Reproducible hostile inputs: never a live feed or a credential-bearing fixture.
function random(seed = 0x17c0ffee) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test('parser properties: seeded fragments preserve UTF8, NUL, escaped and prototype headers', () => {
  const rng = random();
  for (let n = 0; n < 100; n++) {
    const body = `train 🚆 café ${n}\0${Math.floor(rng() * 1000)}`;
    const headers = Object.assign(Object.create(null), { constructor: 'value', 'a:b': 'line\ncolon:\\q' });
    Object.defineProperty(headers, '__proto__', { value: 'safe', enumerable: true });
    const wire = encodeFrame('MESSAGE', headers, body);
    const parser = new FrameParser();
    const frames = [];
    for (let at = 0; at < wire.length;) {
      const size = 1 + Math.floor(rng() * 17);
      frames.push(...parser.push(wire.subarray(at, at += size)));
    }
    assert.equal(frames.length, 1);
    assert.equal(frames[0].body, body);
    assert.equal(Object.getPrototypeOf(frames[0].headers), null);
    assert.equal(frames[0].headers.__proto__, 'safe');
    assert.equal(frames[0].headers['a:b'], headers['a:b']);
  }
});

test('parser properties: complete and incomplete giant frames obey the same byte limit', () => {
  const giant = Buffer.alloc(16 * 1024 * 1024, 65);
  for (const header of ['MESSAGE\n\n', `MESSAGE\ncontent-length:${giant.length}\n\n`]) {
    const wire = Buffer.concat([Buffer.from(header), giant, Buffer.from([0])]);
    assert.throws(() => new FrameParser().push(wire), /too large/);
    const parser = new FrameParser();
    assert.throws(() => parser.push(wire.subarray(0, -1)), /too large/);
  }
  const small = encodeFrame('MESSAGE', {}, 'ok');
  assert.equal(new FrameParser().push(Buffer.concat(Array(1000).fill(small))).length, 1000);
});

test('parser properties: invalid content lengths, UTF8 and header escapes fail safely', () => {
  for (const cl of ['-1', '+2', '2x', '1.5', '', 'NaN', 'Infinity', '9007199254740993']) {
    assert.throws(() => new FrameParser().push(Buffer.from(`MESSAGE\ncontent-length:${cl}\n\nab\0`)), /stomp:/);
  }
  for (const escape of ['\\q', '\\t', '\\']) {
    assert.throws(() => new FrameParser().push(Buffer.from(`MESSAGE\nk:${escape}\n\n\0`)), /stomp:/);
  }
  assert.throws(() => new FrameParser().push(Buffer.from([...'MESSAGE\n\n'].map(c => c.charCodeAt(0)).concat([0xc0, 0xaf, 0]))), /stomp:/);
  assert.throws(() => new FrameParser().push(Buffer.from('MESSAGE\nheader-without-colon\n\n\0')), /stomp:/);
});

test('parser properties: upstream ERROR and socket faults never expose raw text', () => {
  for (const mode of ['header', 'socket', 'code', 'server']) {
    const socket = new EventEmitter();
    socket.write = () => true;
    socket.destroy = () => socket.emit('close');
    const client = new StompClient(socket, { login: 'synthetic', passcode: 'SENTINEL', heartbeat: [0, 0] });
    const faults = [];
    const connected = [];
    client.on('fault', (error) => faults.push(error.message));
    client.on('connected', (value) => connected.push(value));
    client.start();
    if (mode === 'server') {
      socket.emit('data', encodeFrame('CONNECTED', { server: 'SENTINEL /private/path' }));
      assert.deepEqual(connected, [{ server: '' }]);
      socket.emit('error', new Error('SENTINEL'));
    } else if (mode === 'header') socket.emit('data', encodeFrame('ERROR', { message: 'SENTINEL /private/path' }, 'SENTINEL body'));
    else socket.emit('error', Object.assign(new Error('SENTINEL /private/path'), mode === 'code' ? { code: 'SENTINEL' } : {}));
    assert.equal(faults.length, 1);
    assert.match(faults[0], /stomp:/);
    assert.doesNotMatch(faults[0], /SENTINEL|private/);
  }
});

test('TD properties: seeded malformed fields cannot enter the area picture', () => {
  const rng = random();
  const bad = [null, {}, [], true, 1001, '__proto__', 'constructor', 'AAAAA', '\0BAD', '🚆xx'];
  const valid = { area_id: 'Y9', descr: '****', from: '1A2B', to: 'Z9X8', time: '1700000000000' };
  for (let i = 0; i < 200; i++) {
    const field = ['area_id', 'descr', 'from', 'to'][i % 4];
    const value = bad[Math.floor(rng() * bad.length)];
    assert.deepEqual(parseTdBody(JSON.stringify([{ CA_MSG: { ...valid, [field]: value } }])), []);
  }
  const events = parseTdBody(JSON.stringify([{ CA_MSG: valid }, { CT_MSG: { area_id: 'Y8' } }]));
  assert.equal(inArea(events, 'Y9').length, 1);
  assert.equal(events[0].descr, '****');
  for (const value of [true, [], {}, '1e9', ' 10 ', -1, 1.5, 8640000000000001]) {
    assert.equal(parseTdBody(JSON.stringify([{ CT_MSG: { area_id: 'Y9', time: value } }]))[0].time, null);
  }
  for (const m of [{ area_id: 'Y9', address: '__proto__', data: 'FF' }, { area_id: 'Y9', address: '01', data: 'GG' }]) {
    assert.deepEqual(parseTdBody(JSON.stringify([{ SF_MSG: m }])), []);
  }
});

test('parser properties: a fault stops remaining batched frames before asynchronous close', () => {
  const socket = new EventEmitter();
  socket.write = () => true;
  socket.destroy = () => {}; // Real sockets emit close on a later turn.
  const client = new StompClient(socket, { login: 'synthetic', passcode: 'synthetic', heartbeat: [0, 0] });
  let faults = 0;
  let messages = 0;
  client.on('fault', () => faults++);
  client.on('message', () => messages++);
  client.start();
  socket.emit('data', Buffer.concat([encodeFrame('ERROR'), encodeFrame('MESSAGE', {}, 'after-fault')]));
  socket.emit('error', new Error('again'));
  assert.equal(messages, 0);
  assert.equal(faults, 1);
  socket.emit('close');
});

test('TD properties: direct state calls reject malformed fields and poisoned kinds', () => {
  const state = new TdState('Y9');
  for (const event of [null, {}, { kind: '__proto__', area: 'Y9' }, { kind: 'constructor', area: 'Y9' },
    { kind: 'interpose', area: 'Y9', to: '__proto__', descr: '1A23' },
    { kind: 'sclass', area: 'Y9', address: 'FFFFF', data: 'AA' },
    { kind: 'heartbeat', area: 'Y9', time: Infinity }]) assert.equal(state.apply(event), false);
  assert.deepEqual(state.snapshot().counts, { step: 0, cancel: 0, interpose: 0, heartbeat: 0, sclass: 0, unknown: 0 });
  assert.deepEqual(state.snapshot().berths, {});
});

test('TD properties: valid berth floods remain bounded and updates still work', () => {
  const state = new TdState('Y9');
  for (let i = 0; i < 65540; i++) state.apply({ kind: 'interpose', area: 'Y9', to: i.toString(36).toUpperCase().padStart(4, '0'), descr: '1A23' });
  assert.ok(Object.keys(state.snapshot().berths).length <= 65536);
  state.apply({ kind: 'interpose', area: 'Y9', to: '0000', descr: '****' });
  assert.equal(state.snapshot().berths['0000'], '****');
});

test('parser properties: malformed heartbeat negotiation is a fault before timers start', () => {
  for (const heartbeat of ['Infinity,1', '1,NaN', '-1,1', '1.5,1', '0x10,1', '1', '1,1,1', '2147483648,1']) {
    const socket = new EventEmitter();
    socket.write = () => true;
    socket.destroy = () => socket.emit('close');
    const client = new StompClient(socket, { login: 'synthetic', passcode: 'synthetic', heartbeat: [0, 0] });
    const faults = [];
    let connected = 0;
    client.on('fault', error => faults.push(error.message));
    client.on('connected', () => connected++);
    client.start();
    socket.emit('data', encodeFrame('CONNECTED', { 'heart-beat': heartbeat }));
    assert.equal(connected, 0, heartbeat);
    assert.deepEqual(faults, ['stomp: invalid heart-beat'], heartbeat);
  }
});

test('parser properties: repeated CONNECTED cannot accumulate heartbeat timers', () => {
  const socket = new EventEmitter();
  socket.write = () => true;
  socket.destroy = () => socket.emit('close');
  const client = new StompClient(socket, { login: 'synthetic', passcode: 'synthetic', heartbeat: [0, 0] });
  const faults = [];
  let connected = 0;
  client.on('fault', error => faults.push(error.message));
  client.on('connected', () => connected++);
  client.start();
  socket.emit('data', Buffer.concat(Array(10).fill(encodeFrame('CONNECTED', { 'heart-beat': '0,0' }))));
  assert.equal(connected, 1);
  assert.deepEqual(faults, ['stomp: repeated CONNECTED']);
});
