import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_KINDS } from '../train.ts';
import { CIVITY, JUNIPER, WV_EMU_FIGURES, WV_EMU_KINDS, WV_EMU_SPECS, isWvEmuKind, wvEmuLayout } from '../train-wv-emu.ts';
import type { WvEmuFigures } from '../train-wv-emu.ts';

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) < eps;

test('the Waverley EMUs are their own kinds, never King\'s Cross TrainKinds', () => {
  assert.deepEqual([...WV_EMU_KINDS], ['sr334x3', 'tpe397x5']);
  assert.ok(WV_EMU_KINDS.every((k) => !(ALL_KINDS as readonly string[]).includes(k)));
  assert.deepEqual(['sr334x3', 'tpe397x5', 'lner5', ''].map(isWvEmuKind), [true, true, false, false]);
});

test('the cars are the owners\' published lengths, laid end to end: 334 = 21.01 + 19.94 + 21.01, 397 = 2 x 24.030 + 3 x 23.350', () => {
  assert.deepEqual(WV_EMU_KINDS.map((kind) => {
    const l = wvEmuLayout(kind);
    return [l.cars.map((c) => c.type), l.cars.map((c) => +c.length.toFixed(3)), +l.length.toFixed(3), l.cars.every((c, i) => near(c.start, i === 0 ? 0 : (l.cars[i - 1] as { end: number }).end) && near(c.end - c.start, c.length)), near((l.cars.at(-1) as { end: number }).end, l.length)];
  }), [
    [['DMS', 'PTOS', 'DMS'], [21.01, 19.94, 21.01], 61.96, true, true],
    [['DMFLW', 'PTS', 'MSL', 'PTSL', 'DMSL'], [24.03, 23.35, 23.35, 23.35, 24.03], 118.11, true, true],
  ]);
  assert.deepEqual([JUNIPER.drivingCarLength.basis, JUNIPER.carLength.basis, CIVITY.drivingCarLength.basis, CIVITY.carLength.basis], ['published', 'published', 'published', 'published']);
});

test('a cab at each end only, two bogies per car inside it, and the motors and pantographs where the codes put them', () => {
  assert.deepEqual(WV_EMU_KINDS.map((kind) => {
    const l = wvEmuLayout(kind);
    return {
      cabs: l.cars.map((c) => c.cab),
      bogiesInside: l.cars.every((c) => c.bogies.length === 2 && c.start < c.bogies[0] && c.bogies[0] < c.bogies[1] && c.bogies[1] < c.end),
      motored: l.cars.map((c) => c.motor.filter(Boolean).length),
      pantographs: l.cars.map((c) => (c.pantograph ? +((c.pantograph[0] + c.pantograph[1]) / 2 - c.start).toFixed(2) : null)),
    };
  }), [
    { cabs: ['front', null, 'rear'], bogiesInside: true, motored: [1, 0, 1], pantographs: [null, 3, null] },
    // the PTS's pantograph at its rear end (toward the MSL), the PTSL's at its front end (toward the MSL): tpe397-05, -06
    { cabs: ['front', null, null, null, 'rear'], bogiesInside: true, motored: [2, 0, 2, 0, 2], pantographs: [null, 20.45, null, 2.9, null] },
  ]);
  // the 334's motor bogies at the driving cars' inner ends
  assert.deepEqual(wvEmuLayout('sr334x3').cars.map((c) => c.motor), [[false, true], [false, false], [true, false]]);
});

test('every figure names its basis and source, and every figure nobody published says ASSUMED or DRAWN in its source', () => {
  const keys = Object.keys(JUNIPER) as (keyof WvEmuFigures)[];
  for (const family of ['juniper', 'civity'] as const) {
    for (const key of keys) {
      const f = WV_EMU_FIGURES[family][key];
      assert.ok(Number.isFinite(f.value) && f.value > 0, `${family}.${key} is a positive size`);
      assert.ok(f.source.length > 40, `${family}.${key} cites a source`);
      if (f.basis === 'assumed') assert.match(f.source, /^ASSUMED: /, `${family}.${key}`);
      if (f.basis === 'drawn') assert.match(f.source, /^DRAWN: .*(scotrail334|tpe397)/, `${family}.${key} names its photograph`);
      // (a published figure is the owner's, or one of the ruled secondary or borrowed ones, which say so first)
      if (f.basis === 'published') assert.match(f.source, /Eversholt|^SECONDARY, UNCITED: |^BORROWED FROM THE CLASS 331/, `${family}.${key}`);
    }
  }
  // (Arthur's ruling, 2026-11-10 17:04) the 334 takes Wikipedia's uncited width and height, labelled uncited; the 397 the Class 331's, labelled borrowed
  assert.deepEqual([JUNIPER.bodyWidth.value, JUNIPER.height.value, CIVITY.bodyWidth.value, CIVITY.height.value], [2.8, 3.77, 2.712, 3.87]);
  for (const f of [JUNIPER.bodyWidth, JUNIPER.height]) assert.match(f.source, /^SECONDARY, UNCITED: the Wikipedia infobox for the Class 334.*Arthur/);
  for (const f of [CIVITY.bodyWidth, CIVITY.height]) assert.match(f.source, /^BORROWED FROM THE CLASS 331.*not a 397 figure|^BORROWED FROM THE CLASS 331.*No 397 width is published/);
  assert.deepEqual(WV_EMU_KINDS.map((k) => [WV_EMU_SPECS[k].operatorCode, WV_EMU_SPECS[k].classes, WV_EMU_SPECS[k].cars.length]), [['SR', '334', 3], ['TP', '397', 5]]);
});
