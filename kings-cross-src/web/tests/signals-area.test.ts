// The signal layer per TD area: a synthetic area "ZZ" whose OSM refs name berths like Z123. Synthetic data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createSignals, signalRefBerth, SIGNAL_REF_RULES } from '../src/signals.ts';
import type { OverlaySignal, SignalRefRule } from '../src/signals.ts';
import type { TimedTdEvent } from '../../core/sclass.ts';

const ZZ: SignalRefRule = { berth: /^(?:ZZ\s*)?(Z\d{3})[A-Z]?$/, prefixed: /^ZZ\s*Z\d{3}[A-Z]?$/, prefix: 'ZZ' };
const head = (extra: Partial<OverlaySignal> = {}): OverlaySignal => ({ id: 1, ref: 'ZZ Z123', kinds: ['main'],
  edge: { wayId: 9, from: 1, to: 2, t: 0.5, point: [10, 0] }, travel: [1, 0], side: 'left', sideSource: 'assumed-left',
  review: 'unreviewed', ...extra });
const evidence = () => ({ trials: 5, support: 4, contradictions: 1, precision: 0.8, unmatchedCycles: 1, recall: 0.8 });
const table = (area = 'ZZ') => ({ area, hypotheses: [{ id: 'synthetic', kind: 'proceed', address: '10', bit: 2, berth: 'Z123', proceedValue: 1,
  training: evidence(), heldOut: evidence(), status: 'decoded', reason: 'synthetic only' }] });
const row = (data: string, area = 'ZZ'): TimedTdEvent => ({ t: 1, e: { kind: 'sclass', area, msgType: 'SF', data, address: '10' } });

test('an area\'s own ref rule binds its heads to its berths, and its feed drives them', () => {
  assert.equal(signalRefBerth('ZZ Z123', ZZ), 'Z123');
  assert.equal(signalRefBerth('Z123B', ZZ), 'Z123', 'a variant suffix is the same berth');
  assert.equal(signalRefBerth('YA 1004', ZZ), undefined, 'another area\'s prefix is not this area\'s berth');
  assert.equal(signalRefBerth('ZZ Z123', null), undefined, 'no rule, no berth');
  assert.equal(signalRefBerth('YA 1004'), '1004', 'the King\'s Cross rule stays the default');
  const layer = createSignals({ attribution: 'synthetic', signals: [head()] }, new THREE.Scene(), { area: 'ZZ', refRule: ZZ });
  const drawn = layer.signals()[0]!;
  layer.setTable(table()); layer.apply(row('04')); assert.equal(drawn.state, 'proceed');
  layer.apply(row('00')); assert.equal(drawn.state, 'danger');
  layer.apply(row('04', 'Y9')); assert.equal(drawn.state, 'danger', 'another area\'s bytes cannot change it');
  layer.dispose();
});

test('an area without a ref rule binds no head by its ref, and never borrows King\'s Cross\'s', () => {
  assert.equal(SIGNAL_REF_RULES.ZZ, undefined);
  for (const ref of ['ZZ Z123', 'YA 1004', '1004']) {
    const layer = createSignals({ attribution: 'synthetic', signals: [head({ ref })] }, new THREE.Scene(), { area: 'ZZ' });
    layer.setTable({ ...table(), hypotheses: [{ ...table().hypotheses[0]!, berth: ref === 'ZZ Z123' ? 'Z123' : '1004' }] });
    layer.apply(row('04'));
    assert.equal(layer.signals()[0]!.state, 'unknown', ref); layer.dispose();
  }
  const kx = createSignals({ attribution: 'synthetic', signals: [head({ ref: 'YA 1004' })] }, new THREE.Scene(), { area: 'ZZ', refRule: null });
  kx.setTable({ ...table(), hypotheses: [{ ...table().hypotheses[0]!, berth: '1004' }] }); kx.apply(row('04'));
  assert.equal(kx.signals()[0]!.state, 'unknown', 'refRule null turns the area default off'); kx.dispose();
});

test('a layer for a named area asks the relay for that area\'s table and refuses another area\'s', async () => {
  const urls: unknown[] = [];
  const fetchImpl = (async (url: unknown) => { urls.push(url); return new Response(JSON.stringify(table())); }) as typeof fetch;
  const layer = createSignals({ attribution: 'synthetic', signals: [head()] }, new THREE.Scene(), { area: 'ZZ', refRule: ZZ, fetchImpl });
  layer.apply(row('04')); await layer.loadTable();
  assert.deepEqual(urls, ['/relay/sclass?area=ZZ']); assert.equal(layer.signals()[0]!.state, 'proceed');
  layer.setTable(table('Y9')); assert.equal(layer.signals()[0]!.state, 'unknown', 'a Y9 table is not ZZ\'s');
  layer.dispose();
});

