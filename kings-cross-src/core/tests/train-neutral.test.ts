import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NEUTRAL_ASSUMED, createEdinburghKinds, neutralTrainLayout } from '../train-neutral.ts';
import type { EdinburghServiceEvidence } from '../train-neutral.ts';

test('neutral footprint is configurable and all fleet dimensions are explicit assumptions', () => {
  const defaults = neutralTrainLayout(); const custom = neutralTrainLayout(92, 4);
  assert.deepEqual({
    default: [defaults.length, defaults.cars.length], custom: [custom.length, custom.cars.map(c => c.length)],
    figures: Object.values(NEUTRAL_ASSUMED).every(f => f.basis === 'assumed' && f.source.includes('ASSUMED')),
    continuous: custom.cars.every((c, i) => c.start === (custom.cars[i - 1]?.end ?? 0) && c.end - c.start === c.length && c.bogies.every(z => z > c.start && z < c.end)),
  }, { default: [130, 5], custom: [92, [23, 23, 23, 23]], figures: true, continuous: true });
});

test('Edinburgh resolver earns known liveries only with explicit supported operator class and count', () => {
  const cases: EdinburghServiceEvidence[] = [
    { operator: 'GR', class: '800', cars: 5 }, { operator: 'GR', class: '801', cars: 9 },
    { operator: 'LD', class: '803', cars: 5 },
  ];
  assert.deepEqual(cases.map(evidence => {
    const kinds = createEdinburghKinds(() => evidence); kinds.lengthM('2XXX', { id: 1, timeMs: 7 });
    const choice = kinds.formationFor({ id: 1 })!;
    return [choice.kind, choice.allocation, choice.lengthM, choice.label.includes(evidence.class!)];
  }), [['lner5', 'service evidence', 129.7, true], ['lner9', 'service evidence', 233.7, true], ['lumo5', 'service evidence', 129.7, true]]);
});

test('unknown unsupported and partial Edinburgh evidence stays neutral independent of headcode', () => {
  const cases: (EdinburghServiceEvidence | undefined)[] = [undefined, { operator: 'GR' }, { operator: 'GR', class: '800' }, { operator: 'GR', cars: 5 }, { class: '800', cars: 5 }, { operator: 'TP', class: '802', cars: 5 }, { operator: 'HT', class: '802', cars: 5 }, { operator: 'GR', class: '803', cars: 5 }, { operator: 'LD', class: '803', cars: 10 }, { operator: 'GR', class: '800', cars: 10 }];
  assert.deepEqual(cases.map(evidence => {
    const kinds = createEdinburghKinds(() => evidence);
    const a = kinds.lengthM('1S01', { id: 1, timeMs: 0 });
    const b = kinds.lengthM('2A02', { id: 2, timeMs: 0 });
    return [a, b, kinds.kindFor({ id: 1 }), kinds.kindFor({ id: 2 }), kinds.formationFor({ id: 1 })?.allocation];
  }), cases.map(() => [130, 130, 'neutral', 'neutral', 'assumed fleet']));
});

test('Edinburgh kind and length are fixed at birth despite description changes or late service evidence', () => {
  let evidence: EdinburghServiceEvidence | undefined;
  const calls: (string | number)[][] = [];
  const kinds = createEdinburghKinds((description, time) => { calls.push([description, time]); return evidence; }, { lengthM: 92, carCount: 4 });
  const first = kinds.lengthM('1S01', { id: 1, timeMs: 12 });
  evidence = { operator: 'GR', class: '801', cars: 9 };
  const same = kinds.lengthM('CHANGED', { id: 1, timeMs: 99 });
  kinds.lengthM('1S02', { id: 2, timeMs: 100 });
  assert.deepEqual({ first, same, old: kinds.kindFor({ id: 1 }), next: kinds.kindFor({ id: 2 }), count: kinds.layoutFor({ id: 1 }).cars.length, calls }, { first: 92, same: 92, old: 'neutral', next: 'lner9', count: 4, calls: [['1S01', 12], ['1S02', 100]] });
});

test('neutral layout rejects unusable or nonfinite footprints', () => {
  const cases = [[0, 5], [NaN, 5], [Infinity, 5], [130, 0], [130, 1], [130, 2.5], [10, 5]];
  assert.deepEqual(cases.map(([length, count]) => { try { neutralTrainLayout(length, count); return false; } catch (e) { return e instanceof RangeError; } }), cases.map(() => true));
});
