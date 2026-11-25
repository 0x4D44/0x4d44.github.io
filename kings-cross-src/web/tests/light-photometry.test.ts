import assert from 'node:assert/strict';
import test from 'node:test';
import { LAMP_LIGHT } from '../src/streetlights.ts';
import { EUSTON_P1_OPTIC } from '../src/night-lighting-p1.ts';
import { Glsl } from './glsl.ts';

test('the photometric table reproduces the three live lamp styles exactly', async () => {
  const { legacyLampLight, sceneRadiance, SPECTRA } = await import('../../core/light-photometry.ts');
  const baseline = [
    { halo: 0xffa84a, pool: 0xffbc74, strength: .13 },
    { halo: 0xffd8a0, pool: 0xffd9a8, strength: .11 },
    { halo: 0xcfe4ff, pool: 0xe6ecf5, strength: .05 },
  ] as const;
  for (const [kind, spectrum] of (['hps', 'led-3000', 'led-4000'] as const).entries()) {
    const derived = legacyLampLight(spectrum);
    assert.ok(Math.abs(sceneRadiance(SPECTRA[spectrum].legacy.referenceLux, 1) - baseline[kind]!.strength) <= 1e-3);
    assert.deepEqual(derived, baseline[kind]);
    assert.deepEqual(LAMP_LIGHT[kind as 0 | 1 | 2], derived);
  }
  assert.deepEqual(legacyLampLight('lps'), { halo: 0xff993c, pool: 0xff9136, strength: .13 });
});

test('the shared scale reproduces the unclipped P1 reference patch in linear light', async () => {
  const { EUSTON_REFERENCE, SCENE_LINEAR_PER_CD_M2, sceneRadiance, opticSolidAngle, SPECTRA } =
    await import('../../core/light-photometry.ts');
  const r = EUSTON_REFERENCE;
  const lux = r.lumens / opticSolidAngle(r.optic) * r.angularWeight * r.incidence / r.distanceM ** 2;
  const rgb = new Glsl(EUSTON_P1_OPTIC).call('eustonP1One',
    [[4, 0, 0], [0, 1, 0], [0, 10.15, 0], [1, 0], [0, 0, 0], false], { vars: {} }) as number[];
  const p1Linear = r.albedo * (.2126 * rgb[0]! + .7152 * rgb[1]! + .0722 * rgb[2]!);
  assert.ok(Math.abs(p1Linear - r.linearRadiance) < 1e-12);
  assert.ok(Math.abs(sceneRadiance(lux, r.albedo) - r.linearRadiance) < 1e-12);
  assert.ok(r.linearRadiance > 0 && r.linearRadiance < 1);
  assert.ok(SCENE_LINEAR_PER_CD_M2 > 0);
  assert.ok(SPECTRA.lps.linearRgb[2] === 0 && SPECTRA['led-4000'].linearRgb[2] > SPECTRA['led-2700'].linearRgb[2]);
});
