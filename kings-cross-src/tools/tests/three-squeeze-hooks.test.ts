// The page's own rewrites of three's shader text, run on the text the build ships (vite.config.ts squeezes three's shader strings): the `onBeforeCompile` of the wet ground, the roof
// shade, the windows, the sleepers, the rails, the wires and the trains (also as a live train's clone has it), and lighting.ts's patches of two of three's chunks, which it makes when it
// loads. tools/tests/three-squeeze.test.ts holds every match in web/src to the squeezed text by reading the source; this runs what the source does, on the materials of the real scene.
//
// THREE.ShaderChunk and THREE.ShaderLib are squeezed in place first, and the page's modules are imported after (dynamically: lighting.ts patches a chunk as it loads). The strings as
// three wrote them are kept, so that the same hook is run on both and a hook that matched the one and not the other is seen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { CityData } from '../../core/city.ts';
import { tunnelMouths } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, shedLayout, stationBuilding } from '../../core/station.ts';
import { squeezeGlslText } from '../../vite.config.ts';
import { lines, shaderIds } from './three-text.ts';

type Program = { vertexShader: string; fragmentShader: string };
const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
const programs = THREE.ShaderLib as unknown as Record<string, Program>;
const originalChunks = { ...chunks };
const originalPrograms: Record<string, Program> = Object.fromEntries(Object.entries(programs).map(([name, p]) => [name, { vertexShader: p.vertexShader, fragmentShader: p.fragmentShader }]));
const ship = (s: string): string => squeezeGlslText(s) ?? s;
for (const name of Object.keys(chunks)) chunks[name] = ship(chunks[name] as string);
for (const p of Object.values(programs)) [p.vertexShader, p.fragmentShader] = [ship(p.vertexShader), ship(p.fragmentShader)];

const load = async <T>(load: () => Promise<T>): Promise<{ ok: T; error: null } | { ok: null; error: unknown }> => load().then((ok) => ({ ok, error: null }), (error: unknown) => ({ ok: null, error }));
// lighting.ts patches two chunks of three's as it loads, and throws if either has changed
const lightingLoad = await load(() => import('../../web/src/lighting.ts'));

/** The real scene (the one web/tests/lighting.test.ts builds, with the track, the wires and a train's material), its wet-ground and roof-shade hooks installed as the page installs them. */
async function buildScene(): Promise<{ scene: THREE.Scene; materials: THREE.Material[] }> {
  const [{ createAtmosphere }, { addCity }, { buildConcourse }, { buildFurniture }, { addKxCentral }, { addLandmarks }, { buildShed, buildTower, buildWesternRange }, { buildTrack }, { buildOle }, { addWorld }, { plain }, { cloneWithShaderHooks }] = await Promise.all([
    import('../../web/src/atmosphere.ts'), import('../../web/src/city.ts'), import('../../web/src/concourse.ts'), import('../../web/src/furniture.ts'), import('../../web/src/kxcentral.ts'),
    import('../../web/src/landmarks.ts'), import('../../web/src/shed.ts'), import('../../web/src/track.ts'), import('../../web/src/ole.ts'), import('../../web/src/world.ts'),
    import('../../web/src/train-geom.ts'), import('../../web/src/trains-live.ts'),
  ]);
  const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
  const cityData: CityData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-city.json', import.meta.url), 'utf8'));
  const layout = shedLayout(data);
  const scene = new THREE.Scene();
  scene.add(buildShed(layout), buildTower(60), buildWesternRange());
  scene.add(buildConcourse(concourseCanopy(data), stationBuilding(data)!.pts, layout, data.buildings.filter((b) => b.id === 46821177).map((b) => b.pts)));
  scene.add(buildFurniture(data, layout));
  addLandmarks(scene, data);
  addKxCentral(scene, data);
  addCity(scene, data, cityData, { hidden: new Set(data.buildings.slice(0, 5).map((b) => b.id)), trees: true });
  scene.add(buildTrack(data, layout), buildOle(data, layout, tunnelMouths(data).map((m) => m.origin)));
  const world = addWorld(scene, { grid: false });
  createAtmosphere({ scene, world, sites: null });
  // a train's material, shared by every train, and the copy a live train takes (trains-live.ts: a clone does not copy a shader hook by itself)
  const found = new Map<string, THREE.Material>();
  const add = (m: THREE.Material | null | undefined): void => { if (m) found.set(m.uuid, m); };
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) add(m);
    add(mesh.customDepthMaterial);
    add(mesh.customDistanceMaterial);
  });
  add(plain());
  add(cloneWithShaderHooks(plain()));
  return { scene, materials: [...found.values()] };
}
const built = await load(buildScene);

/** What each hook writes into the program that only it writes: a hook that has landed has its text there. */
const MARKERS = [
  ['the wet ground and snow (atmosphere.ts)', 'uniform float uWet;'],
  ['the roof shade (lighting.ts)', 'uniform vec4 uRoofShade;'],
  ['the slab-to-slab tone (lighting.ts)', '#ifdef MOTTLE'],
  ['the windows\' variation (materials.ts)', 'varying vec3 vWinPos;'],
  ['the sleepers\' fade (track.ts)', 'length( vViewPosition )'],
  ['the rails\' cutoff (track.ts)', 'vCutoff'],
  ['the wires\' pixel (ole.ts)', 'vOleDistance'],
  ['the trains\' lamps (train-geom.ts)', 'uNight'],
] as const;

test('lighting.ts loads on the squeezed chunks: it finds the two phrases it patches in them, and the patches are in', () => {
  assert.equal(lightingLoad.error, null, `lighting.ts patches three's chunks as it loads and throws if either is not as it expects: ${String(lightingLoad.error)}`);
  const { SHADOW_TAPS } = lightingLoad.ok as typeof import('../../web/src/lighting.ts');
  assert.ok(chunks.lights_fragment_begin?.includes('receiveShadow && dot( geometryNormal, directLight.direction ) > 0.0 ) ? getShadow( directionalShadowMap[ i ]'), 'the directional light skips the shadow look-up for a face turned from the sun');
  assert.ok(!chunks.lights_fragment_begin?.includes('receiveShadow ) ? getShadow( directionalShadowMap[ i ]'), 'and that line is no longer as it was');
  assert.equal(SHADOW_TAPS, 3);
  assert.ok(chunks.shadowmap_pars_fragment?.includes(`vogelDiskSample( ${SHADOW_TAPS - 1}, ${SHADOW_TAPS}, phi )`), `the soft edge asks ${SHADOW_TAPS} times`);
  assert.ok(!chunks.shadowmap_pars_fragment?.includes('vogelDiskSample( 4, 5, phi )'), 'and not five');
  assert.notEqual(chunks.lights_fragment_begin, originalChunks.lights_fragment_begin);
  // what is patched is the squeezed chunk, not three's own: it has no indentation left
  assert.ok(!/\n[ \t]/.test(chunks.lights_fragment_begin as string) && !/\n[ \t]/.test(chunks.shadowmap_pars_fragment as string));
});

test('the chunks and programs are squeezed in place before the page is loaded, and the strings as three wrote them are kept (the check on this file\'s own set-up)', () => {
  let indented = 0;
  for (const [name, text] of Object.entries(originalChunks)) {
    if (/\n[ \t]/.test(text)) indented++;
    assert.ok(!/\n[ \t]/.test(chunks[name] as string), `${name} is squeezed (the two that lighting.ts patches, too: it patches in one-line phrases)`);
  }
  assert.ok(indented > 100, `three wrote most of its chunks with indentation: ${indented}`);
  assert.notEqual(programs.phong?.fragmentShader, originalPrograms.phong?.fragmentShader, 'a program is squeezed, not only the chunks');
  assert.deepEqual(lines(programs.phong?.fragmentShader as string), lines(originalPrograms.phong?.fragmentShader as string));
});

test('every hook of the real scene does to the squeezed program what it does to the one three wrote: the same text once the white space is set aside, and it changes it (it landed)', () => {
  assert.equal(built.error, null, `the scene builds on the squeezed chunks: ${String(built.error)}`);
  const { materials } = built.ok as { scene: THREE.Scene; materials: THREE.Material[] };
  const hooked = materials.filter((m) => Object.hasOwn(m, 'onBeforeCompile'));
  const landed = new Set<string>();
  const kinds = new Set<string>();
  for (const m of hooked) {
    const id = shaderIds[m.type];
    const name = `${m.name || '(unnamed)'} (${m.type})`;
    assert.ok(id && programs[id] && originalPrograms[id], `${name}: three draws it with a program of ShaderLib`);
    const run = (from: Record<string, Program>): Program => {
      const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: (from[id] as Program).vertexShader, fragmentShader: (from[id] as Program).fragmentShader };
      m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
      return shader;
    };
    const [was, is] = [run(originalPrograms), run(programs)];
    assert.deepEqual(lines(is.vertexShader), lines(was.vertexShader), `${name}: the same vertex shader`);
    assert.deepEqual(lines(is.fragmentShader), lines(was.fragmentShader), `${name}: the same fragment shader`);
    const input = programs[id] as Program;
    assert.ok(is.vertexShader !== input.vertexShader || is.fragmentShader !== input.fragmentShader, `${name}: the hook patched the squeezed program (it matched)`);
    assert.ok(was.vertexShader !== originalPrograms[id]?.vertexShader || was.fragmentShader !== originalPrograms[id]?.fragmentShader, `${name}: and the one three wrote`);
    for (const [kind, marker] of MARKERS) if (is.vertexShader.includes(marker) || is.fragmentShader.includes(marker)) landed.add(kind);
    kinds.add(`${id}:${m.customProgramCacheKey()}`);
  }
  assert.ok(hooked.length >= 30, `the scene's hooked materials: ${hooked.length}`);
  for (const [kind] of MARKERS) assert.ok(landed.has(kind), `a hook of the scene's materials is ${kind}, and its text is in the squeezed program of one of them (${[...landed].join('; ')})`);
  assert.ok(kinds.size >= 8, `the kinds of program (a hook, a base shader): ${kinds.size}`);
});

test('a live train\'s clone of the train material takes the hook and runs it on the squeezed text, as the original does (trains-live.ts cloneWithShaderHooks)', async () => {
  assert.equal(built.error, null);
  const { plain } = await import('../../web/src/train-geom.ts');
  const { cloneWithShaderHooks } = await import('../../web/src/trains-live.ts');
  const copy = cloneWithShaderHooks(plain());
  assert.notEqual(copy, plain());
  assert.equal(copy.onBeforeCompile, plain().onBeforeCompile, 'the same hook');
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: programs.lambert?.vertexShader as string, fragmentShader: programs.lambert?.fragmentShader as string };
  copy.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  assert.ok(shader.vertexShader.includes('vGlow = aGlow;') && shader.fragmentShader.includes('outgoingLight += uNight') && 'uNight' in shader.uniforms, 'the lamps and the lit windows are in the squeezed program');
});
