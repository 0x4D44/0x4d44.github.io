import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { DAY_EXPOSURE, skyRig } from '../../core/daylight.ts';
import type { KxData } from '../../core/osm.ts';
import { shedLayout } from '../../core/station.ts';
import { REFERENCE } from '../src/atmosphere.ts';
import { ROOF_SHADE } from '../src/lighting.ts';
import { buildingNightMaterialsOf, material } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
import { acesFilmic, toSrgb } from './aces.ts';
import type { V3 } from './aces.ts';

// Round S5 (B1; partner decision 2026-11-25: R-a and R-b show the ribs a mid blue-grey by day). What the page draws for the ribs by day, from their own
// material through three's Lambert terms, the roof's shade and the ACES grade at the noon rig: a mid blue-grey on the faces seen from the platforms,
// still darker than the lining and the glass; and at night ribPaint itself, untouched.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const group = shed.buildShed(shedLayout(data), { range: false });
const rig = skyRig(45, 180, { cloud: 0, rain: 0, snow: 0, visibilityM: Infinity }, REFERENCE);
const keep: V3 = [1 - ROOF_SHADE.ambient[0], 1 - ROOF_SHADE.ambient[1], 1 - ROOF_SHADE.ambient[2]];
const rgb = (c: THREE.Color): V3 => [c.r, c.g, c.b];
const linear = (c: readonly number[]): V3 => rgb(new THREE.Color().setRGB(c[0]!, c[1]!, c[2]!, THREE.SRGBColorSpace));
const sky = linear(rig.hemisphere.sky), ground = linear(rig.hemisphere.ground), sun = linear(rig.sun.colour);
// a face looking down (a boom's underside), a face standing up in shade, and one standing up in the sun through the crown at 45 degrees
const faces: Record<string, { hemi: V3; sun: number }> = {
  under: { hemi: ground, sun: 0 },
  shaded: { hemi: [0, 1, 2].map((i) => (sky[i]! + ground[i]!) / 2) as unknown as V3, sun: 0 },
  sunlit: { hemi: [0, 1, 2].map((i) => (sky[i]! + ground[i]!) / 2) as unknown as V3, sun: rig.sun.intensity * Math.SQRT1_2 * (1 - ROOF_SHADE.direct) },
};
const drawn = (m: THREE.MeshLambertMaterial, face: { hemi: V3; sun: number }): number => {
  const a = rgb(m.color), e = rgb(m.emissive);
  const out = [0, 1, 2].map((i) => (a[i]! / Math.PI) * (face.hemi[i]! * rig.hemisphere.intensity * keep[i]! + face.sun * sun[i]!) + e[i]!) as unknown as V3;
  const s = toSrgb(acesFilmic(out, DAY_EXPOSURE));
  return 255 * (0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]);
};

test('B1 S5: by day the ribs and rings draw a mid blue-grey (70-95) on their undersides and shaded faces, under 135 in the sun, darker than the lining', () => {
  const lining = material('lining') as THREE.MeshLambertMaterial;
  for (const name of ['shed-ribs', 'shed-haunch-rings']) {
    const m = (group.getObjectByName(name) as THREE.Mesh).material as THREE.MeshLambertMaterial;
    for (const f of ['under', 'shaded']) {
      const v = drawn(m, faces[f]!);
      assert.ok(v >= 70 && v <= 95, `${name}, ${f}: ${v.toFixed(1)}`);
      assert.ok(v < drawn(lining, faces[f]!) - 40, `${name}, ${f}: ${v.toFixed(1)}, against the lining's ${drawn(lining, faces[f]!).toFixed(1)}`);
    }
    assert.ok(drawn(m, faces.sunlit!) < 135, `${name} in the sun: ${drawn(m, faces.sunlit!).toFixed(1)}`);
    assert.ok(m.color.b > m.color.g && m.color.g > m.color.r && m.emissive.b > m.emissive.g && m.emissive.g > m.emissive.r, `${name}: blue-grey`);
  }
});

test('B1 S5: at night the ribs and rings take ribPaint itself, its colour and glow unchanged, and draw dark', () => {
  const paint = material('ribPaint') as THREE.MeshLambertMaterial;
  assert.equal(paint.color.getHex(), 0x343b42);
  assert.equal(paint.emissive.getHex(), 0x15191d);
  for (const name of ['shed-ribs', 'shed-haunch-rings']) {
    const o = group.getObjectByName(name) as THREE.Mesh;
    assert.equal(buildingNightMaterialsOf(o)?.night, paint, `${name} at night`);
    assert.notEqual(o.material, paint, `${name} by day: its own material`);
  }
  // the paint under the noon rig, for scale: the dark silhouette the night keeps is far under the day's tone
  assert.ok(drawn(paint, faces.shaded!) < 30, `ribPaint, shaded: ${drawn(paint, faces.shaded!).toFixed(1)}`);
});
