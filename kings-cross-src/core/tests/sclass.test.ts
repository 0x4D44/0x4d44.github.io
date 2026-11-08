import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseSclass, signalStates, trackSclass, updateBytes } from '../sclass.ts';
import type { SignalHypothesis, TimedTdEvent } from '../sclass.ts';
import type { AnchorMap } from '../anchors.ts';

// All addresses, berth names, times and descriptions below are invented.
const anchors: AnchorMap = { area: 'SYN', sources: ['synthetic'], unmapped: [], anchors: ['A', 'B'].map((berth): AnchorMap['anchors'][number] => ({ berth, kind: 'signal', from: 1, to: 2, t: .5, point: [0, 0], errorM: 1, evidence: 'synthetic' })) };
const windows = { beforeMs: 10, afterMs: 10 };
const byte = (t: number, value: number, address = '20', msgType = 'SF'): TimedTdEvent => ({ t, e: { kind: 'sclass', area: 'SYN', msgType, address, data: value.toString(16).padStart(2, '0') } });
const step = (t: number, from = 'A', descr = 'SYN1'): TimedTdEvent => ({ t, e: { kind: 'step', area: 'SYN', from, to: 'EXIT', descr } });
const boundary = (t: number): TimedTdEvent => ({ t, e: { kind: 'marker', area: 'SYN' } });
const times = [50, 150, 250, 650, 750, 850];
function fixture(passages = times, signalTimes = passages, address = '20'): TimedTdEvent[] {
  return [boundary(0), byte(0, 0, address), boundary(1000), ...passages.map(t => step(t)),
    ...signalTimes.flatMap((t, i) => [byte(t - 2 - i % 3, 1, address), byte(t + 3 + i % 2, 0, address)])];
}
const analyse = (rows: TimedTdEvent[]) => analyseSclass(rows, anchors, { windows });
const candidate = (rows: TimedTdEvent[]): SignalHypothesis => { const h = analyse(rows).hypotheses.find(h => h.berth === 'A' && h.address === '20' && h.bit === 0); assert.ok(h); return h; };

test('sclass: rule byte refresh expands SF SG SH in ascending address and least significant bit order', () => {
  const sg = { t: 0, e: { kind: 'sclass', area: 'SYN', msgType: 'SG', address: 'a', data: '0180FF00' } };
  const first = updateBytes({}, sg, 'SYN');
  assert.equal(first.accepted, true);
  assert.deepEqual(first.state, { '0A': 1, '0B': 128, '0C': 255, '0D': 0 });
  assert.equal(first.transitions.length, 32);
  assert.deepEqual(first.transitions.find(c => c.address === '0A' && c.bit === 0), { t: 0, address: '0A', bit: 0, from: null, to: 1 });
  const sh = updateBytes(first.state, { ...sg, t: 1, e: { ...sg.e, msgType: 'SH', data: '0080FF00' } }, 'SYN');
  assert.deepEqual(sh.transitions, [{ t: 1, address: '0A', bit: 0, from: 1, to: 0 }]);
  const sf = updateBytes(sh.state, byte(2, 128, 'a'), 'SYN');
  assert.equal(sf.state['0A'], 128);
  assert.equal(sf.state['0B'], 128);
  assert.equal(first.state['0A'], 1);
  assert.deepEqual(updateBytes(sf.state, byte(3, 128, 'a'), 'SYN').transitions, []);
});

test('sclass: rule malformed and foreign messages cannot partially change bytes', () => {
  const state = { '20': 7 };
  const good = byte(1, 1);
  const invalid = [ { ...good, t: NaN }, ...[
    { area: 'OTHER' }, { kind: 'step' }, { msgType: 'SX' }, { address: 'xyz' }, { address: '10000' },
    { data: '1' }, { data: 'GG' }, { msgType: 'SG', data: '010203' }, { msgType: 'SH', address: 'FFFF', data: '01020304' },
  ].map(e => ({ ...good, e: { ...good.e, ...e } })) ];
  for (const row of invalid) assert.deepEqual(updateBytes(state, row, 'SYN'), { accepted: false, state, transitions: [] });
  assert.deepEqual(state, { '20': 7 });
  const trace = trackSclass([good, invalid[1]!, invalid[5]!], 'SYN');
  assert.equal(trace.acceptedMessages, 1);
  assert.equal(trace.rejectedMessages, 1);
  assert.deepEqual(trace.state, { '20': 1 });
});

test('sclass: rule receipt order overrides payload times and input array order', () => {
  const rows = [byte(3, 0), byte(1, 0), byte(2, 1)].map((r, i) => ({ ...r, e: { ...r.e, time: 100 - i } }));
  const original = structuredClone(rows);
  const trace = trackSclass(rows, 'SYN');
  assert.deepEqual(trace.transitions.filter(c => c.bit === 0).map(c => [c.t, c.from, c.to]), [[1, null, 0], [2, 0, 1], [3, 1, 0]]);
  assert.deepEqual(rows, original);
  assert.throws(() => trackSclass([byte(Infinity, 0)], 'SYN'), /finite/);
});

test('sclass: rule jittered independent berth bits decode while noise stays unknown', () => {
  const bTimes = [100, 200, 300, 700, 800, 900];
  const rows = [...fixture(), ...fixture(bTimes, bTimes, '21').filter(r => r.e.kind === 'sclass'), ...bTimes.map(t => step(t, 'B')),
    byte(0, 0, '22'), ...[30, 130, 230, 630, 730, 830].flatMap(t => [byte(t, 128, '22'), byte(t + 1, 0, '22')])];
  const result = analyse(rows);
  assert.deepEqual(result.hypotheses.filter(h => h.status === 'decoded').map(h => [h.berth, h.address, h.bit, h.proceedValue]).sort(), [['A', '20', 0, 1], ['B', '21', 0, 1]]);
  assert.equal(result.bits.find(b => b.address === '22' && b.bit === 7)?.status, 'unknown');
  assert.deepEqual(signalStates({ '20': 1, '21': 0 }, result.hypotheses, anchors), { A: 'proceed', B: 'danger' });
});

test('sclass: rule inverse polarity and independent noise share one byte without masking errors', () => {
  const rows = fixture().filter(r => r.e.kind !== 'sclass');
  const changes = [byte(0, 1), ...times.flatMap((t, i) => [byte(t - 2 - i % 3, 0), byte(t + 3 + i % 2, 1)]),
    ...[30, 130, 230, 630, 730, 830].flatMap(t => [byte(t, 129), byte(t + 1, 1)])];
  rows.push(...changes);
  const result = analyse(rows);
  const hs = result.hypotheses.filter(h => h.status === 'decoded');
  assert.equal(hs.length, 1);
  assert.equal(hs[0]!.bit, 0);
  assert.equal(hs[0]!.proceedValue, 0);
  assert.equal(signalStates({ '20': 128 }, hs, anchors).A, 'proceed');
  assert.equal(signalStates({ '20': 129 }, hs, anchors).A, 'danger');
  assert.equal(result.bits.length, 8);
  const constant = result.bits.find(b => b.bit === 3)!;
  assert.equal(constant.status, 'unknown');
  assert.equal(constant.changes, 0);
  assert.equal(result.bits.find(b => b.bit === 7)!.status, 'unknown');
});

test('sclass: rule training fit must pass independent held out evidence', () => {
  const h = candidate(fixture(times, times.slice(0, 3)));
  assert.equal(h.training.support, 3);
  assert.equal(h.heldOut.support, 0);
  assert.equal(h.heldOut.contradictions, 3);
  assert.equal(h.status, 'unknown');
  assert.deepEqual(analyse(fixture(times, times.slice(3))).hypotheses, []);
});

test('sclass: rule held out support minimum and precision are conjunctive at exact threshold', () => {
  const two = candidate(fixture([50, 150, 250, 650, 750]));
  assert.equal(two.heldOut.precision, 1);
  assert.equal(two.status, 'unknown');
  const held = [610, 670, 730, 790, 850];
  const at = candidate(fixture([...times.slice(0, 3), ...held], [...times.slice(0, 3), ...held.slice(0, 4)]));
  assert.equal(at.heldOut.precision, .8);
  assert.equal(at.status, 'decoded');
  const below = candidate(fixture([...times.slice(0, 3), ...held], [...times.slice(0, 3), ...held.slice(0, 3)]));
  assert.equal(below.heldOut.support, 3);
  assert.equal(below.status, 'unknown');
});

test('sclass: rule split uses elapsed time and excludes full windows crossing either fold edge', () => {
  const rows = [...fixture(), ...Array.from({ length: 40 }, (_, i) => boundary(i)), ...[5, 490, 495, 500, 505, 510, 990, 995].map(t => step(t))];
  const result = analyse(rows);
  assert.equal(result.splitMs, 500);
  assert.equal(result.steps.training, 3);
  assert.equal(result.steps.heldOut, 5);
  assert.equal(result.steps.excludedAtEdges, 6);
  assert.equal(candidate(rows).heldOut.trials, 5);
});

test('sclass: rule unknown initial proceed is not an observed clearing', () => {
  const rows = fixture().filter(r => !(r.e.kind === 'sclass' && r.t === 0));
  assert.deepEqual(analyse(rows).hypotheses, []);
});

test('sclass: rule danger must return after passage within its time window', () => {
  const early = fixture().map(r => r.e.kind === 'sclass' && r.e.data === '00' && r.t > 0 ? { ...r, t: r.t - 5 } : r);
  assert.deepEqual(analyse(early).hypotheses, []);
  const late = fixture().map(r => r.e.kind === 'sclass' && r.e.data === '00' && r.t > 0 ? { ...r, t: r.t + 20 } : r);
  assert.deepEqual(analyse(late).hypotheses, []);
  const distantClear = fixture().map(r => r.e.kind === 'sclass' && r.e.data === '01' ? { ...r, t: r.t - 20 } : r);
  assert.deepEqual(analyse(distantClear).hypotheses, []);
});

test('sclass: rule one signal cycle cannot support two distinct passages', () => {
  const rows = [...fixture(), ...times.map(t => step(t + 1, 'A', 'SYN2'))];
  assert.deepEqual(analyse(rows).hypotheses, []);
});

test('sclass: rule four star incomplete foreign and duplicate steps supply no extra evidence', () => {
  const rows = fixture();
  rows.push(...times.map(t => step(t, 'A', '****')), step(50), { ...step(150), e: { ...step(150).e, area: 'OTHER' } },
    { ...step(170), e: { ...step(170).e, to: 'A' } }, { ...step(180), e: { ...step(180).e, descr: '' } });
  const result = analyse(rows);
  assert.equal(result.steps.total, 6);
  assert.equal(result.steps.ignoredNotATrain, 6);
  assert.equal(result.steps.ignoredIncomplete, 2);
  assert.equal(result.steps.duplicates, 1);
  assert.equal(candidate(rows).status, 'decoded');
  assert.deepEqual(analyse(fixture().map(r => r.e.kind === 'step' ? { ...r, e: { ...r.e, descr: '****' } } : r)).hypotheses, []);
});

test('sclass: rule competing training bits cannot be selected using held out outcomes', () => {
  const rows = [...fixture(), ...fixture(times, times.slice(0, 3), '21').filter(r => r.e.kind === 'sclass')];
  const hs = analyse(rows).hypotheses;
  assert.equal(hs.length, 2);
  assert.ok(hs.every(h => h.status === 'unknown' && /Ambiguous/.test(h.reason)));
  assert.equal(hs.find(h => h.address === '20')?.heldOut.support, 3);
});

test('sclass: rule one training bit fitting multiple berths stays ambiguous', () => {
  const rows = [...fixture(), ...times.slice(0, 3).map(t => step(t + 1, 'B'))];
  const hs = analyse(rows).hypotheses;
  assert.equal(hs.length, 2);
  assert.ok(hs.every(h => h.status === 'unknown'));
});

test('sclass: rule lookup rejects missing undecoded invalid and conflicting tables', () => {
  const h = candidate(fixture());
  const lookup = (state: Record<string, number>, hs: SignalHypothesis[]) => signalStates(state, hs, anchors).A;
  assert.equal(lookup({}, [h]), 'unknown');
  assert.equal(lookup({ '20': 1 }, [{ ...h, status: 'unknown' }]), 'unknown');
  assert.equal(lookup({ '20': 1 }, [h, { ...h, id: 'duplicate' }]), 'unknown');
  assert.equal(lookup({ '20': 1 }, [h, { ...h, berth: 'B' }]), 'unknown');
  assert.equal(lookup({ '20': 1 }, [{ ...h, heldOut: { ...h.heldOut, support: 2 } }]), 'unknown');
  for (const value of [-1, 256, NaN, 1.5]) assert.equal(lookup({ '20': value }, [h]), 'unknown');
  for (const bit of [-1, 8, .5]) assert.equal(lookup({ '20': 1 }, [{ ...h, bit }]), 'unknown');
});

test('sclass: rule invalid analysis windows and empty evidence remain explicit', () => {
  for (const value of [0, -1, NaN, Infinity]) {
    assert.throws(() => analyseSclass([], anchors, { windows: { beforeMs: value, afterMs: 10 } }), /positive finite/);
    assert.throws(() => analyseSclass([], anchors, { windows: { beforeMs: 10, afterMs: value } }), /positive finite/);
  }
  const empty = analyse([]);
  assert.equal(empty.splitMs, 0);
  assert.deepEqual(empty.hypotheses, []);
  assert.deepEqual(empty.berths.map(b => b.status), ['unknown', 'unknown']);
});
