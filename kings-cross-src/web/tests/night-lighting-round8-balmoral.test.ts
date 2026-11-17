import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { addRoofShade } from '../src/lighting.ts';
import { BALMORAL_WINDOWS, lightWaverleyNight } from '../src/station-weather.ts';
import { litWalls } from '../src/materials.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { Glsl } from './glsl.ts';

function hotel() {
  const scene = new THREE.Group();
  const texture = new THREE.Texture();
  const material = new THREE.MeshLambertMaterial({ map: texture });
  const windowMaterial = new THREE.MeshLambertMaterial();
  const undoWindows = litWalls(windowMaterial, BALMORAL_WINDOWS.tile, BALMORAL_WINDOWS.grid);
  const facade = new THREE.Mesh(new THREE.BoxGeometry(4.2, 43.5, 0.2), material);
  facade.name = 'waverley-balmoral-facade';
  facade.position.y = 3.75; // the texture runs from 18 m below the street to the 25.5 m cornice
  scene.add(facade);
  addRoofShade(material);
  const undoNight = lightWaverleyNight(scene,.60);
  const glow = createWaverleyGlow(scene);
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert!.vertexShader, fragmentShader: THREE.ShaderLib.lambert!.fragmentShader };
  material.onBeforeCompile(shader as never, undefined as never);
  const floodBlockAt = shader.fragmentShader.indexOf('#ifdef FLOOD');
  const floodBlockEnd = shader.fragmentShader.indexOf('#endif', floodBlockAt);
  const washAt = shader.fragmentShader.indexOf('// balmoral-facade-wash-begin');
  const washEnd = shader.fragmentShader.indexOf('// balmoral-facade-wash-end', washAt);
  assert.ok(floodBlockAt > 0 && floodBlockEnd > floodBlockAt && 'WALL_WIN' in (material.defines ?? {}), 'the facade keeps its window and floodlight shader paths');
  const defines = material.defines as Record<string, string>;
  const vector = (name: string): number[] => {
    const match = /^vec\d\( ([^)]*) \)$/.exec(defines[name] ?? '');
    assert.ok(match, `${name} is a vector define`);
    return (match[1] as string).split(', ').map(Number);
  };
  const windowShader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert!.vertexShader, fragmentShader: THREE.ShaderLib.lambert!.fragmentShader };
  windowMaterial.onBeforeCompile(windowShader as never, undefined as never);
  const functionsAt = windowShader.fragmentShader.indexOf('float winHash(');
  const functionsEnd = windowShader.fragmentShader.indexOf('#include', functionsAt);
  assert.ok(functionsAt > 0 && functionsEnd > functionsAt, 'the shared window-light functions are in the facade shader');
  return {
    scene, material, undoNight,
    windows: new Glsl(windowShader.fragmentShader.slice(functionsAt, functionsEnd)),
    rect: vector('WIN_RECT'), mode: vector('WIN_MODE'), floodDefine: defines.FLOOD!,
    floodTerm: /totalEmissiveRadiance \+= (.*);/.exec(shader.fragmentShader.slice(floodBlockAt, floodBlockEnd))?.[1] ?? '',
    wash: washAt >= 0 && washEnd > washAt
      ? shader.fragmentShader.slice(washAt + '// balmoral-facade-wash-begin'.length, washEnd).replace(/#ifdef USE_MAP\s+([\s\S]*?)#else[\s\S]*?#endif/, '$1') : '',
    dispose() { glow.dispose(); undoNight(); undoWindows(); scene.clear(); facade.geometry.dispose(); material.dispose(); texture.dispose(); windowMaterial.dispose(); },
  };
}

const peak = (colour: number[]): number => Math.max(...colour);

test('Balmoral windows fill about half the occupied bays with an irregular warm, cool and dark room pattern', () => {
  const h = hotel();
  try {
    const grid = BALMORAL_WINDOWS.grid;
    const lit: boolean[][] = [];
    let warm = 0, cool = 0;
    for (let row = grid.rows[0]; row < grid.rows[1]; row++) {
      const rooms: boolean[] = [];
      for (let bay = 0; bay < 40; bay++) {
        const colour = h.windows.call('winTile', [[bay + 0.5, row + 0.5], [0.001, 0.001], 0.5, 1, h.rect, h.mode, 1], { vars: {} }) as number[];
        const isLit = peak(colour) > 0.01;
        rooms.push(isLit);
        if (isLit) {
          if (colour[2]! > colour[0]!) cool++;
          else warm++;
        }
      }
      lit.push(rooms);
    }
    const litCount = lit.flat().filter(Boolean).length, total = lit.flat().length, share = litCount / total;
    assert.ok(share >= 0.42 && share <= 0.60, `about half of the occupied rooms glow: ${litCount} of ${total} (${share.toFixed(3)})`);
    assert.ok(warm > 0 && cool >= 3, `warm and cool rooms remain distinct: ${warm} warm, ${cool} cool`);
    let sameNeighbours = 0, changedNeighbours = 0;
    for (const row of lit) for (let bay = 1; bay < row.length; bay++) {
      if (row[bay] === row[bay - 1]) sameNeighbours++;
      else changedNeighbours++;
    }
    assert.ok(sameNeighbours > 20 && changedNeighbours > 20, `bay occupancy is patchy without a checkerboard: ${sameNeighbours} same, ${changedNeighbours} changed neighbour pairs`);
  } finally { h.dispose(); }
});

test('Balmoral body wash falls upward and varies by bay at a fixed height, independently of the landed trim washes', () => {
  const h = hotel();
  try {
    assert.ok(h.wash, 'the body has its own height and bay-varying wash');
    const sampleWash = (height: number, bay: number): number[] => {
      const env = { vars: { vStationLampWorld: [4.2*bay, height, 0], vMapUv: [bay + 0.5, 0.5], uStationLampLevel: 1,
        diffuseColor: [0.5, 0.5, 0.5, 1], totalEmissiveRadiance: [0, 0, 0] } };
      new Glsl('').run(h.wash, env);
      return env.vars.totalEmissiveRadiance as number[];
    };
    const worldY = '( cameraPosition - vViewPosition * mat3( viewMatrix ) ).y';
    assert.ok(h.floodTerm.includes(worldY), 'the flood samples world height');
    const glsl = new Glsl('');
    const floor = h.floodDefine.match(/vec4\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*([^ )]+)/)?.[1];
    assert.ok(floor !== undefined, 'the facade flood has a foot');
    const sampleFlood = (worldHeight: number): number[] => {
      const code = h.floodTerm.replace(worldY, 'uHeight').replaceAll('FLOOD', h.floodDefine);
      return glsl.evaluate(code, { vars: {} }, { uHeight: worldHeight, uWinNight: 1, diffuseColor: [0.5, 0.5, 0.5, 1] }) as number[];
    };
    const combinedAt = (height: number, bay: number): number => sampleWash(height, bay)[0]! + sampleFlood(height)[0]!;
    const washFoot=sampleWash(0,2)[0]!,washMid=sampleWash(12,2)[0]!,washCornice=sampleWash(25.5,2)[0]!;
    assert.ok(washFoot>washMid*1.5&&washMid>washCornice*1.5,'the added wash itself has a clear upward falloff');
    const foot = combinedAt(0, 2), middle = combinedAt(12, 2), cornice = combinedAt(25.5, 2);
    const floodFoot = sampleFlood(0)[0]!, floodMid = sampleFlood(12)[0]!, floodCornice = sampleFlood(25.5)[0]!;
    assert.ok(foot > middle * 1.2 && middle > cornice * 1.2, `the combined body wash falls upward: ${foot.toFixed(4)}, ${middle.toFixed(4)}, ${cornice.toFixed(4)}`);
    const bays = Array.from({ length: 20 }, (_, bay) => combinedAt(12, bay));
    const mean = bays.reduce((sum, n) => sum + n, 0) / bays.length, spread = Math.max(...bays) - Math.min(...bays);
    assert.ok(spread > mean * 0.075, `same-height bays remain varied after the broad flood is added: mean ${mean.toFixed(4)}, spread ${spread.toFixed(4)}`);
    assert.ok(spread>0.002,'retain measurable absolute bay variation as well as relative contrast');
    assert.ok(sampleFlood(43.5)[0]!>0&&sampleFlood(43.5)[0]!>=sampleFlood(0)[0]!*.5,'retain the original broad flood throughout its full texture height');
    assert.ok(floodFoot > floodMid && floodMid > floodCornice && floodCornice >= floodFoot * 0.5, `the original broad floor/reach term remains exact: ${floodFoot.toFixed(4)}, ${floodMid.toFixed(4)}, ${floodCornice.toFixed(4)}`);
  } finally { h.dispose(); }
});
