import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { Rgb } from '../../core/daylight.ts';
import { createAtmosphere, type AtmosphereOptions } from '../src/atmosphere.ts';
import { PERTH_HAZE, WAVERLEY_HAZE } from '../src/station-weather.ts';
import { forcedObservation, weatherState } from '../src/weather.ts';
import { loadWaverleyLamps } from '../src/waverley-lamps.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { addWorld } from '../src/world.ts';
import { reflectionProbe } from './lamp-reflection-probe.ts';

const night = Date.parse('2026-11-20T22:30:00Z');
const day = Date.parse('2026-11-20T12:00:00Z');
const cityTints = { kx: [.320, .266, .237], wv: [.215, .185, .16] } satisfies Record<string, Rgb>;
const stationOptions = {
  kx: { location: { lat: 51.532, lon: -.1233 }, kingsCrossNightFog: true, cityFogTint: cityTints.kx },
  wv: { location: { lat: 55.9519, lon: -3.1904 }, haze: WAVERLEY_HAZE, cityFogTint: cityTints.wv },
  pt: { location: { lat: 56.392, lon: -3.438 }, haze: PERTH_HAZE, lampSunGate: [0, 6] },
} satisfies Record<string, Partial<AtmosphereOptions>>;

function climate(station: keyof typeof stationOptions, litFogCloud = station !== 'pt') {
  const scene = new THREE.Scene();
  const world = addWorld(scene, { grid: false });
  const atmosphere = createAtmosphere({ scene, world, sites: null, litFogCloud, ...stationOptions[station] });
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3();
  const positions = world.sky.geometry.getAttribute('position');
  const colours = world.sky.geometry.getAttribute('color');
  let wallMs = 0;
  return {
    at(kind: string, timeMs = night, height = 26) {
      camera.position.set(260, height, 90);
      atmosphere.update({ camera, target, timeMs, wallMs: wallMs += 1000, weather: weatherState(forcedObservation(kind, timeMs)) });
      const fog = scene.fog as THREE.Fog;
      return { rig: atmosphere.state()!.rig, fog: { near: fog.near, far: fog.far, colour: fog.color.toArray() } };
    },
    colours: () => colours.array,
    ring() {
      const red = [];
      // One latitude in the dome, so the range measures clouds across longitudes.
      for (let i = 0; i < positions.count; i++) {
        if (positions.getY(i) > 2000 && positions.getY(i) < 2400) red.push(colours.getX(i));
      }
      assert.equal(red.length, 97);
      return [Math.min(...red), Math.max(...red)] as const;
    },
    dispose: () => atmosphere.dispose(),
  };
}

test('King’s Cross and Waverley night rain lights the horizon and zenith with city-lit cloud', () => {
  for (const city of ['kx', 'wv'] as const) {
    const lit = climate(city), legacy = climate(city, false);
    try {
      const actual = lit.at('rain'), before = legacy.at('rain');
      for (const edge of ['horizon', 'zenith'] as const) {
        const colour = actual.rig.dome[edge];
        const [r, , b] = colour;
        assert.ok(r >= .11 && r / b > 1.15 && r / b < 1.5, `${city} ${edge} should read as lit brown-grey: ${colour}`);
        // This pin has full rain, full cloud and no low-visibility tint.
        assert.deepEqual(colour, cityTints[city].map(channel => .55 * channel));
      }
      assert.deepEqual({ ...actual, rig: { ...actual.rig, dome: before.rig.dome } }, before);
    } finally {
      lit.dispose();
      legacy.dispose();
    }
  }
});

test('the lit rain dome keeps the longitudinal cloud billows visible', () => {
  for (const city of ['kx', 'wv'] as const) {
    const lit = climate(city), legacy = climate(city, false);
    try {
      lit.at('rain');
      legacy.at('rain');
      const [dark, bright] = lit.ring(), [oldDark, oldBright] = legacy.ring();
      assert.ok(bright - dark > 2 * (oldBright - oldDark), `${city} needs appreciable contrast in its lit rain clouds`);
      assert.ok(bright / dark > 2, `${city} must retain billows across the ring`);
    } finally {
      lit.dispose();
      legacy.dispose();
    }
  }
});

test('King’s Cross and Waverley retain the base fog tint, cloud contrast and height-dependent extinction', () => {
  // CPU readings from 470a559b at the station origins, including the existing fog billows.
  const base = {
    kx: { range: [[4.049788801, 240.109939738], [67.046755981, 672.020850640]], air: [.083454233, .057468868, .045791362], ring: [.030252215, .187321395] },
    wv: { range: [[82.8, 414], [141, 705]], air: [.037943633, .028603804, .021970248], ring: [.015020793, .081816979] },
  };
  for (const city of ['kx', 'wv'] as const) {
    const weather = climate(city);
    try {
      for (const [index, height] of [26, 220].entries()) {
        const { fog } = weather.at('fog', night, height);
        const actual = [fog.near, fog.far, ...fog.colour, ...weather.ring()];
        const expected = [...base[city].range[index]!, ...base[city].air, ...base[city].ring];
        assert.ok(actual.every((value, i) => Math.abs(value - expected[i]!) < 1e-8),
          `${city} fog at ${height} m: expected ${expected}, got ${actual}`);
      }
    } finally {
      weather.dispose();
    }
  }
});

test('city-lit rain leaves clear, snow, daylight and the unselected Perth sky exact', () => {
  for (const city of ['kx', 'wv', 'pt'] as const) {
    const lit = climate(city), legacy = climate(city, city === 'pt');
    try {
      const states = [['clear', night], ['snow', night], ['clear', day], ['rain', day]] as const;
      for (const [kind, time] of city === 'pt' ? [...states, ['rain', night], ['fog', night]] as const : states) {
        assert.deepEqual(lit.at(kind, time), legacy.at(kind, time), `${city} ${kind}`);
        assert.deepEqual(lit.colours(), legacy.colours(), `${city} ${kind} dome bytes`);
      }
    } finally {
      lit.dispose();
      legacy.dispose();
    }
  }
});

test('the Market Street junction leaves no reflection sliver at the frozen North Bridge frame edge', async () => {
  const built = buildWaverleyScene({ lighting: false });
  const lamps = await loadWaverleyLamps(built.terrain.heightAt.bind(built.terrain), true, built.group);
  try {
    lamps.group.updateMatrixWorld(true);
    const mesh = lamps.group.getObjectByName('waverley-approach-lamps')!.getObjectByName('street-lamp-reflections') as THREE.InstancedMesh;
    const camera = new THREE.PerspectiveCamera(60, 1.6, .1, 20000);
    camera.position.set(125.47, 16.73, 35);
    camera.lookAt(-40, 8, 10);
    camera.updateMatrixWorld();

    const probe = reflectionProbe(mesh, camera, 19);
    try {
      const head = probe.head.clone().project(camera);
      assert.ok(Math.abs(640 * (head.x + 1) - 150) < 2, 'the junction lamp projects to x=150');
      for (let y = 606; y <= 618; y += 2) {
        for (let x = 0; x <= 10; x += 2) {
          assert.ok((probe.at(x, y)?.alpha ?? 0) < .001, `diagonal sliver at ${x},${y}`);
        }
      }
    } finally {
      probe.dispose();
    }
    assert.equal(lamps.counts().triangles, 41992);
    assert.equal(lamps.counts().draws, 10);
  } finally {
    lamps.dispose();
    built.dispose();
  }
});
