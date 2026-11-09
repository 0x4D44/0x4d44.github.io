import assert from 'node:assert/strict';
import test from 'node:test';
import { createAreaReplay } from '../src/area-replay.ts';

test('WH and EB replay gate future snapshots and use one monotonic UTC clock across switches', () => {
  for (const area of ['WH', 'EB']) {
    const applied: { kind: string; area: string; time: number }[] = [], advanced: number[] = [];
    const replay = createAreaReplay(area, [{ t: 5000, e: { kind: 'snapshot', area, berths: { SYN1: '1A11' } } },
      { t: 8000, e: { kind: 'step', area, descr: '1A11', from: 'SYN1', to: 'SYN2' } }],
    { apply: (e, time) => { applied.push({ kind: e.kind, area: e.area, time }); }, advance: dt => { advanced.push(dt); } }, 10);
    replay.frame(1, 4000); assert.equal(applied.length, 0); assert.equal(replay.timeMs(), 4000);
    replay.frame(1, 5000); assert.deepEqual(applied, [{ kind: 'snapshot', area, time: 5000 }, { kind: 'interpose', area, time: 5000 }]);
    replay.frame(1, 8000); assert.deepEqual(applied, [{ kind: 'snapshot', area, time: 5000 }, { kind: 'interpose', area, time: 5000 }, { kind: 'step', area, time: 8000 }]);
    replay.frame(1, 7000); assert.equal(replay.timeMs(), 8000); assert.equal(applied.length, 3);
    replay.frame(0, 1000); assert.equal(replay.timeMs(), 8000, 'a station switch cannot rewind below a published checkpoint');
    replay.frame(.2); assert.equal(replay.timeMs(), 10000); assert.ok(advanced.some(dt => dt > 0));
  }
});

test('area replay rejects cross-area recordings and invalid clocks rather than mixing local berth IDs', () => {
  const sink = { apply() {}, advance() {} }, rows = [{ t: 1, e: { kind: 'snapshot', area: 'EB', berths: {} } }];
  assert.throws(() => createAreaReplay('WH', rows, sink), /another area/);
  assert.throws(() => createAreaReplay('EB', [], sink), /nonempty/);
  assert.throws(() => createAreaReplay('EB', rows, sink, 0), /positive replay speed/);
  const replay = createAreaReplay('EB', rows, sink);
  assert.throws(() => replay.frame(-1), /nonnegative/); assert.throws(() => replay.frame(0, NaN), /finite UTC/);
});
