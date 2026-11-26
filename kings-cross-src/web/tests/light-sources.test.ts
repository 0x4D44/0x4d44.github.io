import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

test('registrations are scene-local CPU data and disposal removes the owning batch', async () => {
  const { registerLights, lightSourcesFor } = await import('../../core/light-sources.ts');
  const a = new THREE.Scene(), b = new THREE.Scene();
  const source = { id: 'kx/street/0', station: 'kx', pos: [0, 8, 0], footY: 0, yaw: 0, spectrum: 'hps', lumens: 16000,
    optic: { kind: 'road', throwM: 32, spreadM: 10, cutoffDeg: 75 }, cover: 'open', tags: ['road'] } as const;
  const detach = registerLights(a, [source]);
  assert.deepEqual(a.children, []);
  assert.deepEqual(lightSourcesFor(a), [source]);
  assert.deepEqual(lightSourcesFor(b), []);
  assert.throws(() => registerLights(a, [source]), /duplicate.*kx\/street\/0/i);
  detach();
  assert.deepEqual(lightSourcesFor(a), []);
});

test('committed KX, Waverley and Perth draws each have one record per physical emitter', async () => {
  const { loadNightLightScene } = await import('../../tools/night-light-scenes.ts');
  const { lightSourcesFor } = await import('../../core/light-sources.ts');
  const { EUSTON_P1_ROW } = await import('../src/night-lighting-p1.ts');
  for (const station of ['kx', 'wv', 'pt'] as const) {
    const { scene, dispose } = await loadNightLightScene(station);
    try {
      const sources = lightSourcesFor(scene);
      const counts: Record<string, number> = {};
      for (const source of sources) {
        const set = source.id.split('/')[1]!;
        counts[set] = (counts[set] ?? 0) + 1;
      }
      // Re-pinned 2026-11-24 (shed rows over the islands): shed 76 -> 95, five rows of 19 (one per island under the vaults) for four.
      // Re-pinned 2026-11-24 (platform 1 edge pools): shed 95 -> 114, the 0/1 island gets two rows of 19 (over platform 1, and under the east aisle roof for platform 0).
      // Re-pinned 2026-11-24 (B6 pendants): platform 36 -> 67, the 11 lamp standards on 9 and 10 (24 m apart) become 42 pendants under
      // their canopies (7.5 m apart, R-kx-shed-interior-f), each one emitter where the lamps' lanterns were.
      // Re-pinned 2026-11-26 (B7 night pools): shed 114 -> 133, the 4/5 island's zig-zag row (19) becomes a row over each platform (two of 19);
      // platform 67 -> 68, a standard at platform 4's open north tip (its last one fell 22 m short of the north keep-clear).
      assert.deepEqual(counts, {
        kx: { platform: 68, shed: 133, concourse: 35, street: 1069, 'euston-north': 5, mast: 4,
          'kx-front-glazing-reflections': 10, 'kx-front-amber-reflections': 7, 'kx-midland-window-reflections': 261 },
        wv: { pendant: 125, 'open-platform': 8, street: 1093, approach: 13 },
        pt: { town: 2737, station: 100, forecourt: 12 },
      }[station]);
      assert.equal(new Set(sources.map(s => s.id)).size, sources.length, station);
      assert.ok(sources.every(s => s.station === station));
      const expected = new Map<string, number>(), actual = new Map<string, number>();
      // The rendered buffer stores Float32 and rounds many survey coordinates
      // by >1e-6 m. Compare exactly in that format, for each emitter instance.
      const key = (p: readonly number[]) => p.map(Math.fround).join(',');
      const add = (bag: Map<string, number>, p: readonly number[]) => {
        const k = key(p);
        bag.set(k, (bag.get(k) ?? 0) + 1);
      };
      scene.traverse(o => {
        if (o.name === 'street-lamp-halos' || o.name.startsWith('lights-')) {
          const geometry = (o as THREE.Points).geometry, p = geometry.getAttribute('position');
          const air = geometry.getAttribute('lampFogHalo');
          for (let i = 0; i < p.count; i++) {
            if (air?.getX(i) || geometry.getAttribute('lampFogCore')?.getX(i)) continue;
            add(expected, [p.getX(i), p.getY(i), p.getZ(i)]);
          }
        } else if (['kx-front-glazing-reflections', 'kx-front-amber-reflections', 'kx-midland-window-reflections'].includes(o.name)) {
          const p = (o as THREE.Mesh).geometry.getAttribute('reflectionHead');
          for (let i = 0; i < p.count; i++) add(expected, [p.getX(i), p.getY(i), p.getZ(i)]);
        }
      });
      for (const light of sources) {
        for (const point of light.drawnHeads ?? [light.pos]) add(actual, point);
      }
      // A promoted Waverley head has a halo in the city batch and in the approach batch.
      if (station === 'wv') {
        for (const light of sources.filter(s => s.tags.includes('promoted-approach'))) add(actual, light.pos);
      }
      assert.equal(actual.size, expected.size, station);
      for (const [p, count] of expected) assert.equal(actual.get(p), count, `${station} ${p}`);
      if (station === 'kx') for (const pilot of EUSTON_P1_ROW) {
        const source = sources.find(s => s.id === pilot.id);
        assert.ok(source?.tags.includes('euston-road') && source.optic.kind === 'road', pilot.id);
      }
    } finally { dispose(); }
    assert.equal(lightSourcesFor(scene).length, 0, station);
  }
});
