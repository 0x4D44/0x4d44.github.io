import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { trackSclass } from '../../core/sclass.ts';
import { createSignals } from '../../web/src/signals.ts';
import { TdState } from '../state.mjs';

const event = (msgType, address, data, time = 1) => ({ kind: 'sclass', area: 'Y9', msgType, address, data, time });

test('state: S-class snapshots expand SF SG and SH into canonical bytes', () => {
  const state = new TdState('Y9');
  assert.equal(state.apply(event('SG', '0A', '0102a0ff', 10)), true);
  assert.equal(state.apply(event('SH', '20', 'deadbeef', 20)), true);
  assert.equal(state.apply(event('SF', '30', '7a', 30)), true);

  const snapshot = state.snapshot();
  assert.deepEqual(snapshot.sclass, { addresses: 9, data: {
    '0A': '01', '0B': '02', '0C': 'A0', '0D': 'FF',
    '20': 'DE', '21': 'AD', '22': 'BE', '23': 'EF', '30': '7A',
  } });
  assert.equal(snapshot.counts.sclass, 3);
  assert.equal(snapshot.lastEventTime, 30);
});

test('state: S-class SF overrides one byte and a later SG refreshes its full block', () => {
  const state = new TdState('Y9');
  assert.equal(state.apply(event('SG', '10', '01020304')), true);
  assert.equal(state.apply(event('SF', '0011', 'aa', 2)), true);
  assert.deepEqual(state.snapshot().sclass, { addresses: 4, data: {
    '10': '01', '11': 'AA', '12': '03', '13': '04',
  } });

  assert.equal(state.apply(event('SG', '000F', '11121314', 3)), true);
  assert.deepEqual(state.snapshot().sclass, { addresses: 5, data: {
    '10': '12', '11': '13', '12': '14', '13': '04', '0F': '11',
  } });
});

test('state: S-class rejects malformed widths and address overflow without changing state', () => {
  const state = new TdState('Y9');
  assert.equal(state.apply(event('SF', '0A', '04', 100)), true);
  assert.equal(state.apply(event('SF', '000a', '05', 101)), true);
  assert.deepEqual(state.snapshot().sclass, { addresses: 1, data: { '0A': '05' } });
  assert.equal(state.apply(event('SH', 'FFFC', '01020304', 102)), true);

  const before = state.snapshot();
  for (const malformed of [
    event('SF', '0A', '0102', 200),
    event('SG', '0A', 'FF', 200),
    event(undefined, '0A', '0102', 200),
    event('SH', 'FFFD', '01020304', 200),
  ]) {
    assert.equal(state.apply(malformed), false);
    assert.deepEqual(state.snapshot(), before);
  }

  // Older normalized recordings omitted msgType for a one-byte SF observation.
  assert.equal(state.apply(event(undefined, '0A', '06', 300)), true);
  assert.deepEqual(state.snapshot().sclass, { addresses: 5, data: {
    '0A': '06', FFFC: '01', FFFD: '02', FFFE: '03', FFFF: '04',
  } });
  assert.equal(state.snapshot().lastEventTime, 300);
  assert.equal(state.snapshot().counts.sclass, 4);
});

test('state: S-class snapshots restore in core and page without unknown signal state', () => {
  const state = new TdState('Y9');
  assert.equal(state.apply(event('SG', '0F', '00040000', 10)), true);
  const picture = state.snapshot();
  const row = { t: 10, e: { kind: 'snapshot', area: 'Y9', berths: {}, sclass: picture.sclass } };

  const trace = trackSclass([row], 'Y9');
  assert.deepEqual(trace.state, { '0F': 0, '10': 4, '11': 0, '12': 0 });
  assert.equal(trace.rejectedMessages, 0);

  const overlay = { attribution: 'synthetic', signals: [{ id: 1, ref: 'YA 1004', kinds: ['main'],
    edge: { wayId: 1, from: 1, to: 2, t: 0.5, point: [0, 0] }, travel: [1, 0],
    side: 'left', sideSource: 'osm', berth: '1004', review: 'osm-ref-match' }] };
  const evidence = { trials: 5, support: 4, contradictions: 1, precision: 0.8, unmatchedCycles: 1 };
  const table = { area: 'Y9', hypotheses: [{ id: 'synthetic', address: '10', bit: 2, berth: '1004',
    proceedValue: 1, training: evidence, heldOut: evidence, status: 'decoded', reason: 'synthetic only' }] };
  const layer = createSignals(overlay, new THREE.Scene(), { platforms: [] });
  try {
    layer.setTable(table);
    layer.apply(row);
    assert.equal(layer.signals()[0]?.state, 'proceed');
    assert.deepEqual(layer.counts(), { drawn: 1, decoded: 1 });
  } finally {
    layer.dispose();
  }
});
