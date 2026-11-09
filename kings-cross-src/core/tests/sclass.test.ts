import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseSclass, analyseSclassLoo, analyseSclassRecordings, revalidateSignalHypotheses, SESSION_GAP_MS, signalStates, splitRecordingSessions, trackSclass, updateBytes } from '../sclass.ts';
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
const analyseDays = (rows: TimedTdEvent[][]) => {
  let result!: ReturnType<typeof analyseSclassRecordings>;
  assert.doesNotThrow(() => { result = analyseSclassRecordings(rows, anchors, { windows, validation: 'last-recording' }); });
  return result;
};

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
  assert.equal(at.heldOut.precision, 1);
  assert.equal(at.heldOut.recall, .8);
  assert.equal(at.status, 'decoded');
  const below = candidate(fixture([...times.slice(0, 3), ...held], [...times.slice(0, 3), ...held.slice(0, 3)]));
  assert.equal(below.heldOut.support, 3);
  assert.equal(below.status, 'unknown');
});

test('sclass: rule precision counts false clearings while recall counts missed passages', () => {
  const held = [610, 670, 730, 790, 850];
  const rows = fixture([...times.slice(0, 3), ...held], [...times.slice(0, 3), ...held.slice(0, 4), 930]);
  const at = candidate(rows);
  assert.equal(at.heldOut.precision, .8);
  assert.equal(at.heldOut.recall, .8);
  assert.equal(at.heldOut.unmatchedCycles, 1);
  assert.equal(at.status, 'decoded');
  const below = candidate([...rows, byte(960, 1), byte(963, 0)]);
  assert.equal(below.heldOut.precision, 4 / 6);
  assert.equal(below.heldOut.recall, .8);
  assert.equal(below.status, 'unknown');
});

const longTimes = [250, 550, 850, 1450, 1750, 2050];
const receiptWindows = { beforeMs: 200, afterMs: 2, earlyMs: 2, routeAfterMs: 30 };
function longFixture(reset = -1, address = '20'): TimedTdEvent[] {
  return [boundary(0), byte(0, 0, address), boundary(2400), ...longTimes.map(t => step(t)),
    ...longTimes.flatMap(t => [byte(t - 60, 1, address), byte(t + reset, 0, address)])];
}

test('sclass: rule revalidation scores a no-support day but preserves incumbent metadata', () => {
  const incumbent = candidate(fixture());
  const original = structuredClone(incumbent);
  const noSignals = fixture().filter(row => row.e.kind !== 'sclass');
  const [checked] = revalidateSignalHypotheses(noSignals, [incumbent], { area: 'SYN', windows });
  assert.ok(checked);
  assert.notEqual(checked, incumbent);
  assert.notEqual(checked.heldOut, incumbent.heldOut);
  assert.deepEqual(checked.heldOut, { trials: 6, support: 0, contradictions: 6, precision: null, recall: 0, unmatchedCycles: 0 });
  assert.equal(checked.status, incumbent.status);
  assert.equal(checked.status, 'decoded', 'the caller decides whether failed evidence changes status');
  assert.equal(checked.id, incumbent.id);
  assert.deepEqual(checked.training, incumbent.training);
  assert.deepEqual(incumbent, original, 'revalidation leaves its inputs unchanged');
});

test('sclass: rule revalidation retains the fixed polarity of a complemented incumbent', () => {
  const inverse = fixture().map(row => row.e.kind === 'sclass'
    ? { ...row, e: { ...row.e, data: (255 - Number.parseInt(row.e.data!, 16)).toString(16).padStart(2, '0') } }
    : row);
  const incumbent = candidate(inverse);
  assert.equal(incumbent.proceedValue, 0);
  const [checked] = revalidateSignalHypotheses(inverse, [incumbent], { area: 'SYN', windows });
  assert.ok(checked);
  assert.equal(checked.proceedValue, 0);
  assert.equal(checked.heldOut.support, 6);
  assert.equal(checked.heldOut.precision, 1);
  assert.equal(checked.heldOut.recall, 1);
});

test('sclass: rule revalidation scores proceed and route using the fixed route destination', () => {
  const otherDestination: TimedTdEvent = { t: 2300, e: { kind: 'step', area: 'SYN', from: 'A', to: 'OTHER', descr: 'SYN1' } };
  const rows = [...longFixture(), ...longFixture(20, '21').filter(row => row.e.kind === 'sclass'), otherDestination];
  const learned = analyseSclass(rows, anchors, { windows: receiptWindows }).hypotheses;
  const proceed = learned.find(h => h.address === '20' && h.kind === 'proceed');
  const route = learned.find(h => h.address === '21' && h.kind === 'route');
  assert.ok(proceed);
  assert.ok(route);
  assert.equal(route.to, 'EXIT');
  const checked = revalidateSignalHypotheses(rows, [proceed, route], { area: 'SYN', windows: receiptWindows });
  assert.deepEqual(checked.map(h => [h.address, h.kind, h.to, h.heldOut.trials, h.heldOut.support]), [
    ['20', 'proceed', undefined, 7, 6], ['21', 'route', 'EXIT', 6, 6],
  ]);
  assert.deepEqual(checked.map(h => h.status), [proceed.status, route.status]);
});

test('sclass: rule revalidation excludes four-star, duplicate, incomplete and fold-edge steps', () => {
  const rows = fixture();
  rows.push(...times.map(t => step(t, 'A', '****')), step(50), step(9), step(991), step(100, 'A', ''));
  const [checked] = revalidateSignalHypotheses(rows, [candidate(fixture())], { area: 'SYN', windows });
  assert.ok(checked);
  assert.equal(checked.heldOut.trials, 6);
  assert.equal(checked.heldOut.support, 6);
  assert.equal(checked.heldOut.precision, 1);
  assert.equal(checked.heldOut.recall, 1);
});

test('sclass: rule proceed can clear well before passage and reset slightly before C receipt', () => {
  const result = analyseSclass(longFixture(), anchors, { windows: receiptWindows });
  const h = result.hypotheses.find(h => h.status === 'decoded');
  assert.ok(h);
  assert.equal(h.kind, 'proceed');
  assert.equal(h.heldOut.support, 3);
  assert.equal(h.heldOut.precision, 1);
  assert.equal(h.heldOut.recall, 1);
  assert.equal(analyseSclass(longFixture(-3), anchors, { windows: receiptWindows }).hypotheses.length, 0);
  assert.equal(analyseSclass(longFixture(), anchors, { windows: { ...receiptWindows, beforeMs: 50 } }).hypotheses.length, 0);
});

test('sclass: rule default approach window covers a clearing three and a half minutes before passage but remains bounded', () => {
  const session = (offset: number, leadMs: number): TimedTdEvent[] => [boundary(offset), byte(offset, 0), boundary(offset + 2_800_000),
    ...[900_000, 1_500_000, 2_100_000].flatMap(t => [byte(offset + t - leadMs, 1), byte(offset + t - 200, 0), step(offset + t)])];
  const recordings = [session(0, 210_000), session(4_000_000, 210_000)];
  assert.doesNotThrow(() => analyseSclassRecordings(recordings, anchors, { validation: 'last-recording' }));
  const result = analyseSclassRecordings(recordings, anchors, { validation: 'last-recording' });
  const h = result.hypotheses.find(h => h.status === 'decoded'); assert.ok(h);
  assert.equal(h.training.support, 3); assert.equal(h.heldOut.support, 3);
  assert.equal(h.heldOut.precision, 1); assert.equal(h.heldOut.recall, 1);
  assert.deepEqual(analyseSclassRecordings([session(0, 260_000), session(4_000_000, 260_000)], anchors, { validation: 'last-recording' }).hypotheses, []);
});

test('sclass: rule later route release is separate from proceed and cannot light a lamp', () => {
  const rows = [...longFixture(), ...longFixture(20, '21').filter(r => r.e.kind === 'sclass')];
  const result = analyseSclass(rows, anchors, { windows: receiptWindows });
  const hs = result.hypotheses.filter(h => h.status === 'decoded');
  assert.deepEqual(hs.map(h => [h.address, h.kind, h.to]).sort(), [['20', 'proceed', undefined], ['21', 'route', 'EXIT']]);
  assert.equal(signalStates({ '20': 1, '21': 0 }, hs, anchors).A, 'proceed');
  assert.equal(signalStates({ '21': 1 }, hs.filter(h => h.kind === 'route'), anchors).A, 'unknown');
  const late = analyseSclass(longFixture(31), anchors, { windows: receiptWindows });
  assert.equal(late.hypotheses.length, 0);
});

test('sclass: rule occupancy transitions that only follow passage cannot be proceed evidence', () => {
  const rows = longFixture().filter(r => r.e.kind !== 'sclass');
  rows.push(byte(0, 0), ...longTimes.flatMap(t => [byte(t + 5, 1), byte(t + 20, 0)]));
  assert.deepEqual(analyseSclass(rows, anchors, { windows: receiptWindows }).hypotheses, []);
});

test('sclass: rule each recording learns its first half and validates its second half without gap cycles', () => {
  const first = fixture(), second = fixture().map(row => ({ ...row, t: row.t + 5000 }));
  const result = analyseSclassRecordings([first, second], anchors, { windows });
  assert.deepEqual(result.folds, [{ startMs: 0, splitMs: 500, endMs: 1000 }, { startMs: 5000, splitMs: 5500, endMs: 6000 }]);
  assert.equal(result.hypotheses[0]?.training.support, 6);
  assert.equal(result.hypotheses[0]?.heldOut.support, 6);
  assert.equal(result.hypotheses[0]?.status, 'decoded');
  assert.equal(result.trace.transitions.find(c => c.t === 5000 && c.bit === 0)?.from, null);
});

test('sclass: rule whole recordings learn earlier days and hold out the complete latest day', () => {
  const first = fixture(), second = fixture().map(row => ({ ...row, t: row.t + 5000 }));
  const result = analyseDays([first, second]);
  assert.equal(result.validation, 'last-recording');
  assert.equal(result.splitMs, 5000);
  assert.deepEqual(result.folds, [{ startMs: 0, splitMs: 1000, endMs: 1000 }, { startMs: 5000, splitMs: 5000, endMs: 6000 }]);
  const h = result.hypotheses[0]; assert.ok(h);
  assert.equal(h.status, 'decoded');
  assert.equal(h.training.support, 6);
  assert.equal(h.heldOut.support, 6);
  assert.deepEqual(analyseDays([second, first]), result);
});

test('sclass: rule a held out day cannot introduce candidates or rescue an unsupported training identity', () => {
  const first = fixture(), second = fixture().map(row => ({ ...row, t: row.t + 5000 }));
  second.push(...fixture().filter(r => r.e.kind === 'sclass').map(row => ({ ...row, t: row.t + 5000, e: { ...row.e, address: '21' } })));
  const hs = analyseDays([first, second]).hypotheses;
  assert.equal(hs.length, 1); assert.equal(hs[0]!.address, '20'); assert.equal(hs[0]!.status, 'decoded');
  const noCycles = second.filter(r => r.e.kind !== 'sclass');
  const rejected = analyseDays([first, noCycles]).hypotheses[0]; assert.ok(rejected);
  assert.equal(rejected.training.support, 6); assert.equal(rejected.heldOut.support, 0); assert.equal(rejected.status, 'unknown');
});

test('sclass: rule whole recording validation rejects empty overlapping and unsupported fold specifications', () => {
  const options = { windows, validation: 'last-recording' as const };
  for (const rows of [[], [fixture()], [fixture(), []], [fixture(), fixture()], [fixture(), fixture().map(row => ({ ...row, t: row.t + 1000 }))]]) {
    assert.throws(() => analyseSclassRecordings(rows, anchors, options), /recording/i);
  }
  assert.throws(() => analyseSclassRecordings([], anchors, { validation: 'bogus' as never }), /validation scheme/);
});

test('sclass: rule unchanged checkpoints preserve observed cycles without inventing transitions', () => {
  const rows = fixture();
  rows.push(...times.map(t => ({ t: t - 1, e: { kind: 'snapshot', area: 'SYN', sclass: { addresses: 1, data: { '20': '01' } } } })));
  const trace = trackSclass(rows, 'SYN');
  assert.ok(trace.transitions.every(c => !times.some(t => c.t === t - 1)), 'an unchanged bit has no transition at a checkpoint');
  const h = candidate(rows);
  assert.equal(h.status, 'decoded'); assert.equal(h.training.support, 3); assert.equal(h.heldOut.support, 3);
  const corrected = rows.map(row => row.e.kind === 'snapshot' ? { ...row, e: { ...row.e, sclass: { addresses: 1, data: { '20': '00' } } } } : row);
  assert.deepEqual(analyse(corrected).hypotheses, [], 'a reset supplied only by a checkpoint is still unobserved');
});

test('sclass: rule snapshots establish bytes atomically without counting a clearing or reset', () => {
  const snapshot = (t: number, data: unknown, addresses = 1): TimedTdEvent => ({ t, e: { kind: 'snapshot', area: 'SYN', sclass: { addresses, data } } });
  const trace = trackSclass([byte(0, 0), byte(1, 1), snapshot(2, { '20': '00' }), byte(3, 1)], 'SYN');
  assert.equal(trace.transitions.find(c => c.t === 2 && c.bit === 0)?.from, null);
  assert.equal(trace.transitions.find(c => c.t === 3 && c.bit === 0)?.from, 0);
  // A malformed checkpoint is rejected whole: it neither applies nor erases recorded history.
  for (const [data, count] of [[{ '20': '00', '21': 'GG' }, 2], [{ '20': '00000000' }, 1], [{ '20': '00' }, 2], [{ 'a': '01', '0A': '02' }, 2]] as const) {
    const malformed = trackSclass([byte(0, 1), snapshot(1, data, count), byte(2, 0)], 'SYN');
    assert.deepEqual(malformed.state, { '20': 0 });
    assert.equal(malformed.rejectedMessages, 1);
    assert.equal(malformed.transitions.find(c => c.t === 2 && c.bit === 0)?.from, 1);
  }
  assert.deepEqual(trackSclass([byte(0, 1), { t: 1, e: { kind: 'snapshot', area: 'SYN' } }], 'SYN').state, {}, 'a checkpoint without S-class still marks unknown history');
  const rows = fixture().map(r => r.e.kind === 'sclass' && r.e.data === '00' && r.t > 0 ? snapshot(r.t, { '20': '00' }) : r);
  assert.deepEqual(analyse(rows).hypotheses, []);
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

test('sclass: rule a restart checkpoint keeps omitted bytes across a short gap but not after the recorder was down', () => {
  const snapshot = (t: number, data: Record<string, string>): TimedTdEvent => ({ t, e: { kind: 'snapshot', area: 'SYN', sclass: { addresses: Object.keys(data).length, data } } });
  const short = trackSclass([byte(0, 1), byte(0, 0, '21'), snapshot(1, {}), snapshot(2, { '21': '00' }), byte(3, 0)], 'SYN');
  assert.equal(short.transitions.find(c => c.t === 3 && c.address === '20' && c.bit === 0)?.from, 1, 'an empty restart picture cannot erase byte 20');
  const late = SESSION_GAP_MS + 10;
  const long = trackSclass([byte(0, 1), byte(0, 0, '21'), snapshot(late, { '21': '00' }), byte(late + 1, 0)], 'SYN');
  assert.equal(long.transitions.find(c => c.t === late + 1 && c.address === '20' && c.bit === 0)?.from, null);
});

const shift = (rows: TimedTdEvent[], by: number) => rows.map(row => ({ ...row, t: row.t + by }));
const loo = (rows: TimedTdEvent[][]) => analyseSclassLoo(rows, anchors, { windows });

test('sclass: rule leave-one-recording-out holds out every session whole and decodes a stable mapping', () => {
  const days = [fixture(), shift(fixture(), 5000), shift(fixture(), 10000)];
  const result = loo(days);
  assert.equal(result.validation, 'leave-one-recording-out');
  assert.deepEqual(result.folds, [0, 5000, 10000].map(t => ({ startMs: t, splitMs: t, endMs: t + 1000 })));
  const h = result.hypotheses.find(h => h.address === '20' && h.bit === 0 && h.berth === 'A' && h.kind === 'proceed');
  assert.ok(h); assert.equal(h.status, 'decoded');
  assert.equal(h.heldOut.support, 18); assert.equal(h.heldOut.trials, 18);
  assert.deepEqual((h as typeof h & { loo: { selected: boolean }[] }).loo.map(f => f.selected), [true, true, true]);
  assert.deepEqual(result.loo.nested.map(n => [n.recording, n.all.recall]), [[0, 1], [1, 1], [2, 1]]);
  assert.deepEqual(analyseSclassRecordings([days[2]!, days[0]!, days[1]!], anchors, { windows, validation: 'leave-one-recording-out' }), result);
});

test('sclass: rule leave-one-recording-out prunes a mapping that fails one held-out session even when pooled evidence passes', () => {
  const noCycles = shift(fixture(times.slice(0, 3)), 15000).filter(r => r.e.kind !== 'sclass' || r.t === 15000);
  const result = loo([fixture(), shift(fixture(), 5000), shift(fixture(), 10000), noCycles]);
  const h = result.hypotheses.find(h => h.address === '20' && h.bit === 0 && h.berth === 'A' && h.kind === 'proceed');
  assert.ok(h);
  assert.ok(h.heldOut.recall! >= 0.8, 'pooled held-out alone would admit it');
  assert.equal(h.status, 'unknown');
  assert.match(h.reason, /session\(s\) 3 below/);
  const nested = result.loo.nested[3]!;
  assert.equal(nested.admitted, 1, 'admission without session 3 cannot see its failure');
  assert.equal(nested.all.recall, 0);
  assert.equal(signalStates({ '20': 1 }, result.hypotheses, anchors).A, 'unknown');
});

test('sclass: rule leave-one-recording-out rejects a mapping only one session can teach', () => {
  const bTimes = [100, 200, 300, 700, 800, 900];
  const first = [...fixture(), ...fixture(bTimes, bTimes, '21').filter(r => r.e.kind === 'sclass'), ...bTimes.map(t => step(t, 'B'))];
  const result = loo([first, shift(fixture(), 5000), shift(fixture(), 10000)]);
  const b = result.hypotheses.find(h => h.berth === 'B');
  assert.ok(b); assert.equal(b.status, 'unknown'); assert.match(b.reason, /Unstable: training without session\(s\) 0/);
  assert.equal(result.hypotheses.find(h => h.berth === 'A' && h.address === '20')?.status, 'decoded');
});

test('sclass: rule recording sessions split at receipt gaps and leave-one-out needs three disjoint sessions', () => {
  const later = shift(fixture(), SESSION_GAP_MS + 2000);
  assert.deepEqual(splitRecordingSessions([...later, ...fixture()]).map(s => [s[0]!.t, s.at(-1)!.t]), [[0, 1000], [SESSION_GAP_MS + 2000, SESSION_GAP_MS + 3000]]);
  assert.equal(splitRecordingSessions(fixture(), 50).length > 1, true);
  assert.throws(() => splitRecordingSessions(fixture(), 0), /gap/);
  assert.equal(loo([[...fixture(), ...later], shift(fixture(), 3 * SESSION_GAP_MS)]).folds.length, 3, 'one file with an outage is two sessions');
  assert.throws(() => loo([fixture(), shift(fixture(), 5000)]), /three/);
  assert.throws(() => loo([fixture(), shift(fixture(), 500), shift(fixture(), 5000)]), /disjoint/);
});
