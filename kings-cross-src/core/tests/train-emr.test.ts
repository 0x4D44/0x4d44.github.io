import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMR_ASSUMED, EMR_FIGURES, EMR_KINDS, EMR_SPECS, emrTrainLayout } from '../train-emr.ts';

test('EMR formations preserve sourced lengths and distinguish provisional Aurora dimensions', () => {
  assert.deepEqual(EMR_KINDS.map((kind) => {
    const layout = emrTrainLayout(kind);
    return [kind, layout.cars.length, Math.round(layout.length * 100), layout.cars.map((c) => c.length), layout.spec.dimensionsProvisional];
  }), [
    ['emr222x5', 5, 11670, [23.85, 23, 23, 23, 23.85], false],
    ['emr810x5', 5, 12000, [24, 24, 24, 24, 24], true],
    ['emr360x4', 4, 8140, [20.35, 20.35, 20.35, 20.35], false],
  ]);
});

test('EMR dimensions disclose missing evidence rather than promote guessed Class 810 dimensions', () => {
  const values = [...Object.values(EMR_FIGURES).flatMap(Object.values), ...Object.values(EMR_ASSUMED)];
  assert.deepEqual({
    missingSources: values.filter((f) => !f.source || !Number.isFinite(f.value) || f.value <= 0),
    auroraBases: Object.values(EMR_FIGURES.aurora).map((f) => f.basis),
    unmarkedAssumptions: values.filter((f) => f.basis === 'assumed' && !f.source.includes('ASSUMED')),
    widths: [EMR_FIGURES.meridian.width.value, EMR_FIGURES.desiro360.width.value],
    noPublishedRoof: Object.values(EMR_FIGURES).every((f) => f.roof.basis === 'assumed'),
    provisionalLabel: EMR_SPECS.emr810x5.label.includes('dimensions provisional'),
  }, { missingSources: [], auroraBases: ['assumed', 'assumed', 'assumed', 'assumed'], unmarkedAssumptions: [], widths: [2.73, 2.8], noPublishedRoof: true, provisionalLabel: true });
});

test('EMR car layout stays contiguous with mirrored cabs and contained assumed equipment', () => {
  assert.deepEqual(EMR_KINDS.map((kind) => {
    const { cars } = emrTrainLayout(kind);
    return {
      cabs: cars.map((c) => c.cab).filter(Boolean),
      continuous: cars.every((c, i) => Math.abs(c.end - c.start - c.length) < 1e-8 && c.start === (cars[i - 1]?.end ?? 0)),
      contained: cars.every((c) => c.bogies.every((s) => s > c.start && s < c.end) && (!c.pantograph || c.pantograph.every((s) => s > c.start && s < c.end))),
      pantographs: cars.filter((c) => c.pantograph).map((c) => c.index),
    };
  }), [
    { cabs: ['front', 'rear'], continuous: true, contained: true, pantographs: [] },
    { cabs: ['front', 'rear'], continuous: true, contained: true, pantographs: [0, 4] },
    { cabs: ['front', 'rear'], continuous: true, contained: true, pantographs: [1] },
  ]);
});
