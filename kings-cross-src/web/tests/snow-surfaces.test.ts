import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createAtmosphere, surfaceUniforms } from '../src/atmosphere.ts';
import { applyCover, COVER_GLSL, coverUniforms } from '../src/cover.ts';
import { plain } from '../src/train-geom.ts';
import { forcedObservation, weatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { Glsl, toValue } from './glsl.ts';
import type { Sampler, Value } from './glsl.ts';

const compile = (m: THREE.Material) => {
  const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return s;
};
function setup(meshName: string, materialName = '', m = new THREE.MeshLambertMaterial()) {
  m.name = materialName;
  const scene = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), m); mesh.name = meshName; scene.add(mesh);
  const atmosphere = createAtmosphere({ scene, world: addWorld(scene, { grid: false }), sites: null });
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 10, 20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  atmosphere.update({timeMs: Date.parse('2026-12-10T12:00:00Z'), weather: weatherState(forcedObservation('snow')), camera, target: new THREE.Vector3(), wallMs: 1000});
  return { m, mesh, scene, atmosphere, camera };
}
function shade(m: THREE.Material, up: number, snow = .94, wet = 0, mask = 1, front = true, covered = false, point = [0, 0, 0]) {
  const s = compile(m), f = s.fragmentShader;
  assert.ok(f.includes('uniform float uSnowCover;'), `${m.name || 'custom surface'} receives snow`);
  // Prior roof shading can put unrelated headlamp arrays between the uniforms
  // and cover functions. Run the surface's actual uniforms and shared cover GLSL.
  const declarations = [...f.matchAll(/uniform (?:float|vec[234]|sampler2D) (?!uCover)\w+;/g)].map(m => m[0]).join('\n') + '\n' + COVER_GLSL;
  const code = f.slice(f.indexOf('float coverOpen'), f.indexOf(');', f.indexOf('diffuseColor.rgb = mix(')) + 2);
  const uniforms = Object.fromEntries(Object.entries(s.uniforms).map(([k, v]) => [k, toValue(v.value)]));
  uniforms.uSnowCover = snow; uniforms.uWet = wet;
  if (!covered) uniforms.uCoverRect = [0, 0, 0, 0];
  const vars: Record<string, Value> = { ...uniforms, cameraPosition: [0, 0, 0], vViewPosition: point.map(n => -n), viewMatrix: toValue(new THREE.Matrix4()),
    gl_FrontFacing: front, vSnowNormal: [Math.sqrt(1 - up * up), up, 0], diffuseColor: [.2, .2, .2, 1] };
  const glsl = new Glsl(declarations);
  glsl.snippet(code)({vars, fns: {texture2D: (sampler, _uv) => {
    const texture = (sampler as Sampler).data;
    return [texture === coverUniforms.uCoverMap.value ? ((texture as THREE.DataTexture).image.data as Uint8Array)[0]! / 255
      : texture === coverUniforms.uCoverSoft.value ? 1 : mask, 0, 0, 1];
  }}});
  return vars.diffuseColor as number[];
}

test('snow lies on upward faces, tapers on steep slopes, and leaves walls and soffits bare', () => {
  const {m, atmosphere} = setup('platform', 'asphalt');
  try {
    const flat = shade(m, 1)[0]!, slope = shade(m, .55)[0]!;
    assert.ok(flat > .55);
    assert.ok(slope > .2 && slope < flat - .1, 'a steep slope holds less than a level top');
    for (const up of [0, -.5, -1]) assert.equal(shade(m, up)[0], .2, `normal.y ${up}: bare`);
    assert.equal(shade(m, 1, .94, 0, 1, false)[0], .2, 'back of a thin double-sided roof stays bare');
    for (const up of [-1, 0, .55, 1]) assert.deepEqual(shade(m, up, 0), [.2, .2, .2, 1], 'zero snow changes no albedo');
  } finally { atmosphere.dispose(); }
});

test('custom roofs, terrain, exposed platform paving, forecourt and train roofs all receive the shared snow shader', () => {
  for (const name of ['city-roof', 'shed-roof-glass', 'concourse-panels', 'waverley-mapped-roofs', 'waverley-platform-surfaces',
    'waverley-ground-cover', 'perth-station-roof', 'perth-tite-roof', 'perth-summit-ground', 'perth-west-roofs', 'perth-forecourt-setts', 'perth-platform-ramps']) {
    const {m, atmosphere} = setup(name);
    try { assert.ok(shade(m, 1)[0]! > .4, name); assert.equal(shade(m, 0)[0], .2, `${name}: walls stay bare`); }
    finally { atmosphere.dispose(); }
  }
  const train = plain(), {atmosphere} = setup('train', train.name, train);
  try { assert.ok(shade(train, 1)[0]! > .4, 'train roof'); assert.ok(compile(train).fragmentShader.includes('uNight * step'), 'lamp hook survives'); }
  finally { atmosphere.dispose(); }
});

test('through roads remain darker and wetter than pavements in snow, and unchanged without snow', () => {
  const road = setup('city-asphalt', 'city-asphalt'), pavement = setup('city-pavement', 'city-pavement');
  try {
    assert.ok(shade(road.m, 1)[0]! < shade(pavement.m, 1)[0]! * .55, 'cleared road against white footway');
    assert.ok(shade(road.m, 1)[0]! < .2, 'meltwater darkens the carriageway even without rain');
    assert.deepEqual(shade(road.m, 1, 0), shade(pavement.m, 1, 0));
  } finally { road.atmosphere.dispose(); pavement.atmosphere.dispose(); }
});

test('mapped streets retain their traffic classification within a shared ground draw', () => {
  const m = new THREE.MeshLambertMaterial();
  m.userData.snowMask = { texture: new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat), rect: new THREE.Vector4(-1, -1, .5, .5) };
  const {atmosphere} = setup('waverley-ground-cover', '', m);
  try {
    const road = shade(m, 1, .94, 0, .08)[0]!, pavement = shade(m, 1, .94, 0, 1)[0]!;
    assert.ok(road < .2 && pavement > .6, `road ${road}, pavement ${pavement}`);
    assert.equal(shade(m, 1, .94, 0, 0)[0], .2, 'water takes no snow or meltwater');
    assert.deepEqual(shade(m, 1, 0, 0, .08), [.2, .2, .2, 1], 'mask has no effect without snow');
  } finally { atmosphere.dispose(); }
});

test('snow patches compose prior colour hooks, remain idempotent, and carry world normals through rotated instances', () => {
  const m = new THREE.MeshLambertMaterial(); m.name = 'asphalt';
  m.onBeforeCompile = s => { s.fragmentShader = '// retained finish\n' + s.fragmentShader; };
  m.customProgramCacheKey = () => 'existing-finish';
  const {atmosphere} = setup('platform', m.name, m);
  try {
    const s = compile(m), version = m.version; atmosphere.rescan();
    assert.ok(s.fragmentShader.startsWith('// retained finish'), 'existing custom finish survives');
    assert.ok(s.vertexShader.includes('transformedNormal * mat3( viewMatrix )'), 'normalMatrix and instance transform precede conversion back to world');
    assert.ok(s.vertexShader.indexOf('#include <defaultnormal_vertex>') < s.vertexShader.indexOf('vSnowNormal ='));
    assert.equal(m.version, version, 'rescan never stacks patches');
    assert.ok(m.customProgramCacheKey().includes('existing-finish'), 'cache identity retains the finish');
    const roof = setup('city-roof'), ground = setup('perth-summit-ground');
    try { assert.notEqual(roof.m.customProgramCacheKey(), ground.m.customProgramCacheKey(), 'different generated programs never share a cache key'); }
    finally {roof.atmosphere.dispose();ground.atmosphere.dispose();}
    const late = setup('unrecognised');
    try {
      late.mesh.name = 'city-roof'; late.atmosphere.rescan();
      const shader = compile(late.m);
      assert.equal(shader.fragmentShader.split('float coverGroundAt(').length - 1, 1, 'a material shaded before its snow role arrives has one cover declaration');
      assert.ok(shade(late.m,1)[0]! > .6, 'late snow role reaches the shader');
    } finally {late.atmosphere.dispose();}
    const source = s.vertexShader.slice(s.vertexShader.indexOf('vSnowNormal ='), s.vertexShader.indexOf(';', s.vertexShader.indexOf('vSnowNormal =')) + 1);
    const cam = new THREE.PerspectiveCamera(); cam.position.set(4,8,13); cam.lookAt(0,0,0); cam.updateMatrixWorld(true);
    for (const angle of [0, Math.PI / 3, Math.PI / 2, Math.PI]) {
      const model = new THREE.Matrix4().makeRotationZ(angle).scale(new THREE.Vector3(2,3,4));
      const viewNormal = new THREE.Vector3(0,1,0).applyMatrix3(new THREE.Matrix3().getNormalMatrix(cam.matrixWorldInverse.clone().multiply(model)));
      const vars: Record<string, Value> = {vSnowNormal:[0,0,0], transformedNormal: toValue(viewNormal), viewMatrix: toValue(cam.matrixWorldInverse)};
      new Glsl('').snippet(source)({vars});
      const got = new THREE.Vector3(...vars.vSnowNormal as [number,number,number]).normalize();
      const want = new THREE.Vector3(0,1,0).applyMatrix3(new THREE.Matrix3().getNormalMatrix(model)).normalize();
      assert.ok(got.distanceTo(want) < 1e-9, `rotated, scaled surface at ${angle}: world normal`);
    }
  } finally { atmosphere.dispose(); }
});

test('snow on transparent roofs becomes opaque and suppresses daylight stand-in glow, only on the snowy face', () => {
  const m = new THREE.MeshLambertMaterial({transparent: true, opacity: .35, emissive: 0x333333});
  const {atmosphere} = setup('shed-roof-glass', '', m);
  try {
    const s = compile(m), f = s.fragmentShader;
    assert.ok(f.includes('diffuseColor.a = mix('), 'snow occludes the transparent roof');
    assert.ok(f.includes('totalEmissiveRadiance *= 1.0 - snowHere'), 'lying snow receives light instead of emitting roof glow');
    const code = f.slice(f.indexOf('diffuseColor.a = mix('), f.indexOf(';', f.indexOf('diffuseColor.a = mix(')) + 1);
    const run = (snowHere: number) => {const vars = {snowHere, diffuseColor: [.2,.2,.2,.35]}; new Glsl('').snippet(code)({vars}); return vars.diffuseColor[3]!;};
    assert.equal(run(0), .35); assert.ok(run(.94) > .95);
  } finally { atmosphere.dispose(); }
});

test('a snowy roof remains bare underneath and snow albedo is lit by the night rig, without a white additive glow', () => {
  const {m, atmosphere} = setup('waverley-mapped-roofs');
  try {
    applyCover({x0: -2, z0: -2, nx: 1, nz: 1, cell: 4, step: .15, heights: new Uint8Array([100]), soft: new Uint8Array([255]), rooms: new Uint8Array(1)});
    const f = compile(m).fragmentShader;
    assert.ok(f.indexOf('diffuseColor.rgb = mix(') < f.indexOf('#include <lights_lambert_fragment>'), 'snow is a lit diffuse surface');
    assert.ok(!f.includes('outgoingLight += uSnowColour'), 'no additive snow emission');
    assert.ok(surfaceUniforms.snowColour.value.b > surfaceUniforms.snowColour.value.r, 'cool neutral snow reflects the blue night rig');
    assert.equal(shade(m, -1)[0], .2, 'the underside remains bare');
    assert.equal(shade(m, 1, .94, 0, 1, true, true)[0], .2, 'a lower upward surface stays bare under the roof');
    for (const x of [-1.5, 0, 1.5]) {
      assert.ok(shade(m, .8, .94, 0, 1, true, true, [x, 15 - .75*x, 0])[0]! > .6, 'a sloped roof receives snow across its whole coarse cover cell');
    }
    ((coverUniforms.uCoverMap.value as THREE.DataTexture).image.data as Uint8Array)[0] = 140;
    assert.equal(shade(m, 1, .94, 0, 1, true, true, [0,15,0])[0], .2, 'a higher overlapping canopy still shelters a lower roof');
  } finally { atmosphere.dispose(); }
});

test('new custom ground keeps its original dry and rainy colour whenever snow is absent', () => {
  for (const name of ['waverley-ground-cover', 'perth-summit-ground', 'perth-west-ground', 'perth-forecourt-setts']) {
    const {m, atmosphere} = setup(name);
    try { for (const wet of [0, .3, 1]) assert.deepEqual(shade(m, 1, 0, wet), [.2,.2,.2,1], `${name}: wet ${wet}, no snow`); }
    finally { atmosphere.dispose(); }
  }
});

test('land-use mask uses mapped road widths and water holes, with traffic roads painted over footpaths', async () => {
  const module = await import('../src/snow.ts').catch(() => null);
  assert.ok(module?.snowLanduseMask, 'the shared land-use snow mask exists');
  const old = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {configurable:true, value:{createElement: () => {throw Error('snow mask must not allocate a canvas');}}});
  try {
    const land = {extent:{x0:0,x1:100,z0:0,z1:50}, water:[[[[10,10],[30,10],[30,30],[10,30]],[[15,15],[20,15],[20,20],[15,20]]]] as [number,number][][][],
      roads:[{width:9,line:[[0,25],[100,25]] as [number,number][]},{width:5,line:[[25,0],[25,50]] as [number,number][]},{width:4,line:[[0,0],[10,0]] as [number,number][]}],
      paths:[{width:2,line:[[0,0],[0,50]] as [number,number][]}]};
    const mask = module.snowLanduseMask(land)!;
    assert.ok(mask.texture instanceof THREE.DataTexture, 'one-channel bytes, no canvas backing');
    const texture = mask.texture as THREE.DataTexture, {width,height,data} = texture.image;
    assert.ok(data instanceof Uint8Array); assert.equal(data.byteLength,width*height);
    assert.deepEqual([width,height],[50,25], '2 metres per texel resolves the 2 m footpath');
    assert.equal(texture.format,THREE.RedFormat);assert.equal(texture.type,THREE.UnsignedByteType);
    assert.equal(texture.unpackAlignment,1);assert.equal(texture.flipY,false);
    assert.equal(texture.minFilter,THREE.LinearFilter);assert.equal(texture.magFilter,THREE.LinearFilter);
    // Read with the page's unchanged (u, 1-v) lookup. DataTexture's first row is
    // the south edge: no DOM image upload exists to flip the canvas for us.
    const at=(x:number,z:number)=>data[(height-1-Math.floor(z/2))*width+Math.floor(x/2)];
    assert.deepEqual(mask.rect.toArray(),[0,0,.01,.02]);
    assert.equal(at(75,45),255,'untouched pavement');
    assert.equal(at(5,1),242,'4 m pedestrian street');
    assert.equal(at(1,45),249,'half a texel of the 2 m footpath, antialiased against the pavement');
    assert.equal(at(25,45),89,'5 m lane');assert.equal(at(75,25),20,'9 m main road');
    assert.equal(at(25,25),20,'the main road paints over the lane at their crossing');
    assert.equal(at(11,15),0,'water takes no snow');assert.equal(at(17,17),255,'even-odd river island remains snowy');
    assert.equal(at(19,19),255,'the island edge remains land');
    assert.equal(mask.texture.colorSpace, THREE.NoColorSpace, 'retention is linear data');
    assert.equal(mask.texture.generateMipmaps,false); mask.texture.dispose();
    const bend = [[20,20],[40,20],[40,40]] as [number,number][];
    const rounded = module.snowLanduseMask({extent:land.extent,roads:[{width:4,line:bend}]});
    const retraced = module.snowLanduseMask({extent:land.extent,roads:[{width:4,line:[...bend,[40,20],[40,20],[20,20]]}]});
    const pixels = (m: typeof rounded) => (m.texture as THREE.DataTexture).image.data as Uint8Array;
    assert.ok(Buffer.compare(pixels(rounded),pixels(retraced))===0,'round joins and repeated segments blend once, without dark seams');
    const cap = pixels(rounded)[(height-1-9)*width+9]!;
    assert.ok(cap>242&&cap<255,'antialiased round cap reaches behind its endpoint');
    rounded.texture.dispose();retraced.texture.dispose();
  } finally {if(old)Object.defineProperty(globalThis,'document',old);else Reflect.deleteProperty(globalThis,'document');}
});
