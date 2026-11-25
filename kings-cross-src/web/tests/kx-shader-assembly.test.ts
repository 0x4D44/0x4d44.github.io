// CPU assembly guard, not a substitute for the capture's real GPU compiler.
// Build the actual station/city material census and include each program's
// defines, which a ShaderLib + onBeforeCompile-only test otherwise misses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { concourseCanopy, shedLayout, stationBuilding } from '../../core/station.ts';
import { createAtmosphere } from '../src/atmosphere.ts';
import { addWorld } from '../src/world.ts';
import { addCity } from '../src/city.ts';
import { buildShed } from '../src/shed.ts';
import { buildConcourse } from '../src/concourse.ts';
import { buildFurniture, buildPlatforms } from '../src/furniture.ts';
import { buildTrack } from '../src/track.ts';
import { addLandmarks } from '../src/landmarks.ts';
import { addKxCentral } from '../src/kxcentral.ts';
import { buildTrain } from '../src/train.ts';
import { nightLightSites } from '../src/night.ts';
import type { FurniturePlan } from '../src/furniture.ts';
import { forcedObservation, weatherState } from '../src/weather.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
type DefinedMaterial = THREE.Material & { defines?: Record<string, unknown> };
const materials = (o: THREE.Object3D): DefinedMaterial[] => {
  const m = (o as THREE.Mesh).material;
  return m ? (Array.isArray(m) ? m : [m]) : [];
};
const defineKey = (m: DefinedMaterial) => JSON.stringify(Object.entries(m.defines ?? {}).sort());
function expand(source: string): string {
  return source.replace(/#include <([\w\d_]+)>/g, (_line, name: keyof typeof THREE.ShaderChunk) => {
    assert.ok(THREE.ShaderChunk[name] !== undefined, `unknown shader chunk ${name}`);
    return expand(THREE.ShaderChunk[name]);
  });
}
function assemble(m: DefinedMaterial) {
  const custom = m as THREE.ShaderMaterial;
  const type = ({ MeshLambertMaterial: 'lambert', MeshPhongMaterial: 'phong', MeshBasicMaterial: 'basic',
    PointsMaterial: 'points', SpriteMaterial: 'sprite', LineBasicMaterial: 'basic', MeshStandardMaterial: 'physical' } as Record<string, string>)[m.type];
  const lib = custom.isShaderMaterial ? custom : THREE.ShaderLib[type!];
  assert.ok(lib, `unhandled material ${m.type}/${m.name}`);
  const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  m.onBeforeCompile(s as never, undefined as never);
  const prefix = Object.entries(m.defines ?? {}).filter(([, value]) => value !== false)
    .map(([name, value]) => `#define ${name} ${value}`).join('\n');
  return { fragment: prefix + '\n' + expand(s.fragmentShader), vertex: prefix + '\n' + expand(s.vertexShader) };
}

test('every patched KX material assembles with its window identifiers and original defines in all four night states', () => {
  const data = read('kx-track'), layout = shedLayout(data), canopy = concourseCanopy(data), station = stationBuilding(data)!;
  const scene = new THREE.Scene(), world = addWorld(scene, { grid: false });
  const furniture = buildFurniture(data, layout);
  scene.add(buildShed(layout), buildConcourse(canopy, station.pts, layout), buildPlatforms(data, layout), buildTrack(data, layout), furniture);
  const landmarks = addLandmarks(scene, data), central = addKxCentral(scene, data);
  const city = addCity(scene, data, read('kx-city'), { nightEffects: true, trees: false });
  for (const kind of ['lner9', 'lner5', 'hull5', 'lumo5'] as const) scene.add(buildTrain(kind));
  const original = new Map<THREE.Object3D, DefinedMaterial[]>();
  scene.traverse(o => original.set(o, materials(o)));
  const sites = nightLightSites({ lamps: (furniture.userData.plan as FurniturePlan).lamps, layout, data, canopy, footprint: station.pts });
  const atmosphere = createAtmosphere({ scene, world, sites, kingsCrossNightFog: true, platformLampFloor: data.platforms.filter((p: {tunnel: boolean}) => !p.tunnel).map((p: {pts: [number, number][]}) => p.pts) });
  if (city.lights) atmosphere.nightLights!.attach(city.lights);
  const camera = new THREE.PerspectiveCamera(50, 1.6, .1, 20000); camera.position.set(260, 220, 90);
  const errors: string[] = [], census: Record<string, number> = {};
  try {
    for (const weather of ['clear', 'rain', 'fog', 'snow']) {
      atmosphere.update({ camera, target: new THREE.Vector3(46, 5, -132), timeMs: Date.parse('2026-11-20T22:30:00Z'), wallMs: 12000,
        weather: weatherState(forcedObservation(weather)) });
      const checked = new Set<THREE.Material>(), windowNames = new Set<string>();
      scene.traverse(o => materials(o).forEach((m, i) => {
        const prior = original.get(o)?.[i];
        if (prior && defineKey(m) !== defineKey(prior)) errors.push(`${weather}/${o.name}/${m.name}: clone lost original material defines`);
        if (checked.has(m)) return;
        checked.add(m);
        const { fragment } = assemble(m);
        const code = fragment.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        const macros = new Set([...code.matchAll(/^\s*#define\s+(\w+)/gm)].map(x => x[1]));
        const body = code.replace(/^\s*#.*$/gm, '');
        // These are the project's custom window symbols, not renderer-supplied
        // light counts or conditional macros in inactive Three.js chunks.
        for (const id of new Set(body.match(/\bWIN_[A-Z_]+\b/g))) {
          windowNames.add(m.name);
          if (!macros.has(id)) errors.push(`${weather}/${m.name}: undeclared ${id}`);
        }
        const functions = new Set([...code.matchAll(/\b(?:float|vec[234])\s+(win\w+)\s*\(/g)].map(x => x[1]));
        for (const call of new Set([...body.matchAll(/\b(win\w+)\s*\(/g)].map(x => x[1]))) {
          if (!functions.has(call)) errors.push(`${weather}/${m.name}: undeclared function ${call}`);
        }
      }));
      census[weather] = checked.size;
      assert.ok(checked.size > 50, `${weather}: empty or incomplete material census (${checked.size})`);
      assert.ok(windowNames.has('sashArch') && windowNames.has('pane') && windowNames.has('city-stock'), `${weather}: must cover all three failed GPU material families`);
    }
    assert.ok(errors.length === 0, errors.join('\n'));
    console.log('KX assembled material counts:', JSON.stringify(census));
  } finally {
    atmosphere.dispose(); city.dispose(); central.dispose(); landmarks.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    scene.traverse(o => { const g = (o as THREE.Mesh).geometry; if (g) geometries.add(g); });
    for (const g of geometries) g.dispose();
  }
});
