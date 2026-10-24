// Run with: node the-wire/tests/engine.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const E = createRequire(import.meta.url)('../engine.js');
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok - ' + name); }

test('crc32 known vector', () => assert.equal(E.crc32(Array.from(new TextEncoder().encode('123456789'))), 0xCBF43926));
test('frame: min size pads payload to 46, total 64 with FCS', () => {
  const f = E.buildFrame({ dst: 'ff:ff:ff:ff:ff:ff', src: '02:00:00:00:00:01', payload: [1, 2, 3] });
  assert.equal(f.bytes.length, 64); assert.equal(E.checkFcs(f.bytes), true); assert.equal(f.wire, 84);
});
test('frame: tagged is still 64 minimum and carries 81 00', () => {
  const f = E.buildFrame({ dst: 'ff:ff:ff:ff:ff:ff', src: '02:00:00:00:00:01', vlan: { vid: 10, pcp: 5 }, payload: [1] });
  assert.equal(f.bytes.length, 64); assert.deepEqual(f.bytes.slice(12, 16), [0x81, 0, 0xA0, 10]);
});
test('frame: a flipped bit fails the FCS', () => {
  const f = E.buildFrame({ dst: '02:00:00:00:00:02', src: '02:00:00:00:00:01', payload: E.utf8('hello') });
  const b = f.bytes.slice(); b[20] ^= 1; assert.equal(E.checkFcs(b), false);
});
test('subnet math', () => {
  const s = E.subnetInfo('192.168.1.77/26');
  assert.equal(s.network, '192.168.1.64'); assert.equal(s.broadcast, '192.168.1.127'); assert.equal(s.hosts, 62); assert.equal(s.mask, '255.255.255.192');
  assert.equal(E.subnetInfo('10.0.0.0/8').hosts, 16777214); assert.equal(E.subnetInfo('1.2.3.4/32').hosts, 1);
  assert.equal(E.ip2n('300.1.1.1'), null);
});
test('longest prefix match', () => {
  const r = [{ cidr: '0.0.0.0/0' }, { cidr: '10.0.0.0/8' }, { cidr: '10.1.0.0/16' }];
  assert.equal(E.lookup(r, '10.1.2.3').best, 2); assert.equal(E.lookup(r, '10.9.9.9').best, 1); assert.equal(E.lookup(r, '8.8.8.8').best, 0);
  assert.deepEqual(E.lookup(r, '10.1.2.3').matches, [0, 1, 2]);
});
test('switch learns, floods unknown, unicasts known, filters same-port', () => {
  const A = '02:00:00:00:00:0a', B = '02:00:00:00:00:0b', C = '02:00:00:00:00:0c';
  const sw = { table: {}, ports: [1, 2, 3, 4] };
  let r = E.switchForward(sw, 1, A, B); assert.deepEqual(r.out, [2, 3, 4]); assert.equal(r.flood, true);
  r = E.switchForward(sw, 2, B, A); assert.deepEqual(r.out, [1]); assert.equal(r.flood, false);
  r = E.switchForward(sw, 1, A, B); assert.deepEqual(r.out, [2]);
  r = E.switchForward(sw, 1, A, 'ff:ff:ff:ff:ff:ff'); assert.equal(r.flood, true);
  assert.equal(E.switchForward(sw, 1, C, A).filtered, true);
  assert.equal(E.switchForward(sw, 1, A, B, true).flood, true);
});
test('dns plan', () => {
  const p = E.dnsPlan('www.example.co.uk', 'A'); assert.equal(p.tld, 'uk'); assert.equal(p.zone, 'example.co.uk'); assert.equal(p.steps.length, 3);
  assert.equal(E.dnsPlan('localhost', 'A'), null); assert.equal(E.dnsPlan('a.b.com', 'A').answer, E.dnsPlan('a.b.com', 'A').answer);
});
test('jumbo frames are more efficient and need fewer packets', () => {
  const a = E.efficiency(1500), b = E.efficiency(9000);
  assert.ok(b.eff > a.eff); assert.ok(Math.abs(a.eff - 1460 / 1538) < 1e-9); assert.ok(b.framesPerGB < a.framesPerGB / 5);
  assert.ok(Math.abs(E.pps(1e9, 1500) - 81274) < 5);
});
test('path MTU: DF drops, no-DF fragments', () => {
  const d = E.pathMtu([9000, 1500, 9000], 8000, true); assert.equal(d.ok, false); assert.equal(d.mtu, 1500);
  const f = E.pathMtu([9000, 1500, 9000], 8000, false); assert.equal(f.ok, true); assert.ok(f.pieces.length >= 6);
  assert.equal(E.pathMtu([1500], 1000, true).ok, true);
});
test('nagle + delayed ACK: write-write-read stalls 40 ms; NODELAY does not', () => {
  const base = { writes: [{ t: 0, size: 50 }, { t: 1, size: 200 }], rtt: 2, delack: true, reqBytes: 250 };
  const bad = E.simTcp({ ...base, nagle: true }), ok = E.simTcp({ ...base, nagle: false });
  assert.ok(bad.done > 40); assert.ok(ok.done < 5); assert.equal(bad.dataSegs, 2);
});
test('nagle coalesces tiny writes into fewer segments', () => {
  const ws = []; for (let i = 0; i < 20; i++) ws.push({ t: i, size: 10 });
  const on = E.simTcp({ writes: ws, rtt: 40, nagle: true, delack: false }), off = E.simTcp({ writes: ws, rtt: 40, nagle: false, delack: false });
  assert.equal(off.dataSegs, 20); assert.ok(on.dataSegs < 6);
});
test('delayed ack off removes the stall even with nagle', () => {
  const r = E.simTcp({ writes: [{ t: 0, size: 50 }, { t: 1, size: 200 }], rtt: 2, nagle: true, delack: false, reqBytes: 250 });
  assert.ok(r.done < 8);
});
test('backoff range doubles and caps at 2^10', () => {
  assert.equal(E.backoffSlots(1, () => 0.999), 1); assert.equal(E.backoffSlots(3, () => 0.999), 7); assert.equal(E.backoffSlots(15, () => 0.99999), 1023);
});
test('switch: case-insensitive, never learns multicast source', () => {
  const sw = { table: {}, ports: [1, 2] };
  E.switchForward(sw, 1, 'AA:00:00:00:00:01', 'x'); assert.deepEqual(E.switchForward(sw, 2, '02:00:00:00:00:02', 'aa:00:00:00:00:01').out, [1]);
  E.switchForward(sw, 1, '01:00:5e:00:00:01', 'x'); assert.equal(sw.table['01:00:5e:00:00:01'], undefined);
  E.switchForward(sw, 2, 'aa:00:00:00:00:01', 'x'); assert.equal(sw.table['aa:00:00:00:00:01'], 2);
});
test('parseMac rejects junk; subnet edge cases', () => {
  assert.equal(E.parseMac('12zz:00:00:00:00:01'), null); assert.equal(E.parseMac('1:2:3:4:5'), null);
  assert.equal(E.subnetInfo('10.0.0.0/31').hosts, 2); assert.equal(E.subnetInfo('0.0.0.0/0').size, 4294967296); assert.equal(E.parseCidr('1.2.3.4/33'), null);
});
test('nagle exact timing: 80 ms for write-write-read at 20 ms RTT; MSS-based ack', () => {
  const r = E.simTcp({ writes: [{ t: 0, size: 60 }, { t: 0.3, size: 200 }], reqBytes: 260, rtt: 20, nagle: true, delack: true });
  assert.equal(r.done, 80);
  const big = E.simTcp({ writes: [{ t: 0, size: 3000 }], rtt: 20, nagle: false, delack: true });
  assert.ok(big.segs.some((s) => s.kind === 'ack' && s.why === 'two full segments'));
});
test('fragments are 8-byte aligned and sum to the payload', () => {
  const f = E.pathMtu([1500], 8000, false); const pay = f.pieces.map((x) => x - 20);
  assert.equal(pay.reduce((a, b) => a + b, 0), 7980); pay.slice(0, -1).forEach((x) => assert.equal(x % 8, 0));
});
test('switch: case-insensitive, never learns multicast source', () => {
  const sw = { table: {}, ports: [1, 2] };
  E.switchForward(sw, 1, 'AA:00:00:00:00:01', 'x'); assert.deepEqual(E.switchForward(sw, 2, '02:00:00:00:00:02', 'aa:00:00:00:00:01').out, [1]);
  E.switchForward(sw, 1, '01:00:5e:00:00:01', 'x'); assert.equal(sw.table['01:00:5e:00:00:01'], undefined);
  E.switchForward(sw, 2, 'aa:00:00:00:00:01', 'x'); assert.equal(sw.table['aa:00:00:00:00:01'], 2);
});
test('parseMac rejects junk; subnet edge cases', () => {
  assert.equal(E.parseMac('12zz:00:00:00:00:01'), null); assert.equal(E.parseMac('1:2:3:4:5'), null);
  assert.equal(E.subnetInfo('10.0.0.0/31').hosts, 2); assert.equal(E.subnetInfo('0.0.0.0/0').size, 4294967296); assert.equal(E.parseCidr('1.2.3.4/33'), null);
});
test('nagle exact timing: 80 ms for write-write-read at 20 ms RTT; MSS-based ack', () => {
  const r = E.simTcp({ writes: [{ t: 0, size: 60 }, { t: 0.3, size: 200 }], reqBytes: 260, rtt: 20, nagle: true, delack: true });
  assert.equal(r.done, 80);
  const big = E.simTcp({ writes: [{ t: 0, size: 3000 }], rtt: 20, nagle: false, delack: true });
  assert.ok(big.segs.some((s) => s.kind === 'ack' && s.why === 'two full segments'));
});
test('fragments are 8-byte aligned and sum to the payload', () => {
  const f = E.pathMtu([1500], 8000, false); const pay = f.pieces.map((x) => x - 20);
  assert.equal(pay.reduce((a, b) => a + b, 0), 7980); pay.slice(0, -1).forEach((x) => assert.equal(x % 8, 0));
});
console.log(n + ' tests passed');
