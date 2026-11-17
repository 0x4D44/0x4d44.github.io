import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createAtmosphere, surfaceUniforms } from '../src/atmosphere.ts';
import { applyCover, COVER_GLSL, coverUniforms } from '../src/cover.ts';
import { plain } from '../src/train-geom.ts';
import { hazeLand } from '../src/perth-east-ground.ts';
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
function shade(m: THREE.Material, up: number, snow = .94, wet = 0, mask = 1, front = true, covered = false, point = [0, 0, 0], roofDetail = [2, 1], base = .2, eye = [0,0,0], roadDetail = [0,0,0]) {
  const s = compile(m), f = s.fragmentShader;
  assert.ok(f.includes('uniform float uSnowCover;'), `${m.name || 'custom surface'} receives snow`);
  // Prior roof shading can put unrelated headlamp arrays between the uniforms
  // and cover functions. Run the surface's actual uniforms and shared cover GLSL.
  const declarations = [...f.matchAll(/uniform (?:float|vec[234]|sampler2D) (?!uCover)\w+;/g)].map(m => m[0]).join('\n') + '\n' + COVER_GLSL + '\n' + (f.match(/float snowNoise\([\s\S]*?\n}/)?.[0] ?? '');
  const code = f.slice(f.indexOf('float coverOpen'), f.indexOf('diffuseColor.a = mix('));
  const uniforms = Object.fromEntries(Object.entries(s.uniforms).map(([k, v]) => [k, toValue(v.value)]));
  uniforms.uSnowCover = snow; uniforms.uWet = wet;
  if (!covered) uniforms.uCoverRect = [0, 0, 0, 0];
  const vars: Record<string, Value> = { ...uniforms, cameraPosition: eye, vViewPosition: point.map((n,i) => eye[i]! - n), viewMatrix: toValue(new THREE.Matrix4()),
    gl_FrontFacing: front, vSnowNormal: [Math.sqrt(1 - up * up), up, 0], vSnowRoof: roofDetail, vSnowRoad: roadDetail, diffuseColor: [base, base, base, 1] };
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

test('round 2: Perth ground tiles and the outer KX roof skins receive lying snow', () => {
  for (const name of ['perth-east-ground', 'perth-main-apron', 'concourse-cladding', 'concourse-glass-top', 'landmarks-shedSlate']) {
    const {m, atmosphere} = setup(name);
    try {assert.ok(shade(m, 1)[0]! > .4, `${name} receives snow`);assert.equal(shade(m, 0)[0], .2, `${name} has bare vertical faces`);assert.deepEqual(shade(m,1,0),[.2,.2,.2,1]);}
    finally {atmosphere.dispose();}
  }
});

test('round 2: hillside drifts vary in world space, steep rock and gorse retain less, only in snow', () => {
  const ground = setup('perth-summit-ground'), gorse = setup('perth-summit-gorse');
  try {
    const samples = [[2368,210,208],[2374,210,215],[2390,210,200],[2345,210,230]];
    const values = samples.map(p=>shade(ground.m,1,.94,0,1,true,false,p)[0]!);
    assert.ok(Math.max(...values)-Math.min(...values) > .04, 'drifts and surface grain survive the snow blend');
    assert.ok(shade(ground.m,.65)[0]! < shade(ground.m,1)[0]! - .15, 'wind-scoured steep ground exposes its base');
    assert.ok(shade(gorse.m,1)[0]! < shade(ground.m,1)[0]! - .12, 'gorse has dark foliage between snowy tips');
    for (const wet of [0,.3,1]) for (const p of samples) assert.deepEqual(shade(ground.m,1,0,wet,1,true,false,p),[.2,.2,.2,1], 'dry, rain and fog keep the original ground');
  } finally {ground.atmosphere.dispose();gorse.atmosphere.dispose();}
});

test('round 2: a snow-loaded glazed roof writes depth to hide shed lights, restoring its clear and rainy state', () => {
  const m = new THREE.MeshLambertMaterial({transparent:true,opacity:.35,depthWrite:false});
  const {atmosphere,camera} = setup('shed-roof-glass','',m);
  try {
    assert.equal(m.depthWrite,true,'opaque snow stops late additive lamps shining through the roof');
    for (const weather of ['clear','rain','fog'] as const) {
      atmosphere.update({timeMs:Date.parse('2026-12-10T12:00:00Z'),weather:weatherState(forcedObservation(weather)),camera,target:new THREE.Vector3(),wallMs:2000});
      assert.equal(m.depthWrite,false,`${weather}: restore the original transparent depth state`);
    }
  } finally {atmosphere.dispose();}
});

test('round 2: mapped footpaths may retain compacted snow, independently of roads and surrounding pavement', async () => {
  const {snowLanduseMask} = await import('../src/snow.ts');
  const mask = snowLanduseMask({extent:{x0:0,z0:0,x1:20,z1:20},roads:[],paths:[{width:2,line:[[0,10],[20,10]],snow:.45}]},.5);
  try {
    const {width,height,data}=(mask.texture as THREE.DataTexture).image;
    assert.ok(data instanceof Uint8Array);
    const at=(x:number,z:number)=>data[(height-1-Math.floor(z/.5))*width+Math.floor(x/.5)]!;
    assert.equal(at(10,10),115,'compacted hill path');assert.equal(at(10,5),255,'surrounding untouched snow');
  } finally {mask.texture.dispose();}
});

test('round 2: Euston Road and North Bridge have strong snow-only traffic contrast', () => {
  for (const name of ['city-asphalt', 'waverley-bridge-decks']) {
    const {m,atmosphere}=setup(name, name==='city-asphalt'?'city-asphalt':'asphalt');
    try {
      assert.ok(shade(m,1)[0]! < .15, `${name}: cleared, wet tarmac remains dark in snow`);
      assert.deepEqual(shade(m,1,0),[.2,.2,.2,1],'clear weather keeps the original albedo');
    } finally {atmosphere.dispose();}
  }
});

test('round 2: city roofs keep pitch, eave lines and block variation instead of a white sheet', () => {
  const m=new THREE.MeshLambertMaterial();m.userData.snowRoof=true;
  const {atmosphere}=setup('waverley-building-tops','',m);
  try {
    const roof=(height:number,retention=1,up=1)=>shade(m,up,.94,0,1,true,false,[20,30,40],[height,retention])[0]!;
    assert.ok(roof(2)-roof(.05)>.1,'a narrow exposed eave line remains darker than the roof face');
    assert.ok(roof(2)-roof(2,.8)>.05,'neighbouring blocks retain different snow depths');
    assert.ok(roof(2)-roof(2,1,.7)>.12,'steep pitches expose more slate');
    assert.deepEqual(shade(m,1,0,0,1,true,false,[20,30,40],[.05,.8]),[.2,.2,.2,1]);
  } finally {atmosphere.dispose();}
});

test('round 2: Perth field pigments precede lying snow, so farmland cannot tint the snow green', () => {
  const m=new THREE.MeshLambertMaterial();hazeLand(m,{inside:null});
  const {atmosphere}=setup('perth-west-ground','',m);
  try {
    const f=compile(m).fragmentShader;
    assert.ok(f.indexOf('diffuseColor.rgb *= k;') < f.indexOf('float coverOpen'), 'the actual field-colour hook runs before snow replaces the albedo');
    assert.ok(f.indexOf('float coverOpen') < f.indexOf('#include <lights_lambert_fragment>'), 'snow still receives the scene lighting');
  } finally {atmosphere.dispose();}
});

test('round 3: cleared KX and bridge carriageways retain slush patches rather than a pale snow film', () => {
  for (const name of ['city-asphalt','waverley-bridge-decks']) {
    const {m,atmosphere}=setup(name,name==='city-asphalt'?name:'asphalt');
    try {
      const tones=Array.from({length:12},(_,i)=>shade(m,1,.94,0,1,true,false,[i*1.7,0,35])[0]!);
      assert.ok(Math.max(...tones)<.1,`${name}: residual white snow no longer dominates the cleared tarmac`);
      assert.ok(Math.max(...tones)-Math.min(...tones)>.007,'slush has irregular patches');
      assert.deepEqual(shade(m,1,0,0),[.2,.2,.2,1]);
    } finally {atmosphere.dispose();}
  }
});

test('round 3: slush suppresses the grazing sky sheen on cleared roads, with the rainy sheen unchanged', () => {
  const {m,atmosphere}=setup('waverley-bridge-decks','asphalt');
  try {
    const f=compile(m).fragmentShader,start=f.indexOf('float wetFresnel'),code=f.slice(start,f.indexOf('#include <opaque_fragment>',start));
    const run=(snow:number)=>{
      const vars={normal:[0,1,0],vViewPosition:[0,.05,1],outgoingLight:[0,0,0],uSheen:[1,1,1],uSheenK:1,wetHere:.8,uSnowCover:snow,snowTraffic:1,snowHere:.06};
      new Glsl('').snippet(code.replace(/}\s*$/,''))({vars});return vars.outgoingLight[0]!;
    };
    assert.ok(run(.94)<run(0)*.3,'wet slush is rough enough to keep the bridge dark against its snowy edges');
    assert.ok(Math.abs(run(0)-.8*(.05+.6*(1-.05/Math.sqrt(1.0025))**3))<1e-9,'no change to the clear/rain reflection');
  } finally {atmosphere.dispose();}
});

test('round 3: Waverley snow follows ridges and leaves dark glazed furrows', () => {
  const m=new THREE.MeshLambertMaterial();m.userData.snowRidges=new THREE.Vector2(12,0);
  const {atmosphere}=setup('waverley-mapped-roofs','',m);
  try {
    const ridge=shade(m,1,.94,0,1,true,false,[6,10.4,20])[0]!,furrow=shade(m,1,.94,0,1,true,false,[1,8.4,20])[0]!;
    assert.ok(ridge-furrow>.25,'the actual 12 m ridge profile controls retained snow');
    assert.deepEqual(shade(m,1,0,0,1,true,false,[1,8.4,20]),[.2,.2,.2,1]);
  } finally {atmosphere.dispose();}
});

test('round 3: distant farmland snow has no repeating 88.5 m sine wave', () => {
  const {m,atmosphere}=setup('perth-main-apron');
  try {
    const period=2*Math.PI/.071,deltas=Array.from({length:20},(_,i)=>{
      const x=2000+i*17.3;return Math.abs(shade(m,1,.94,0,1,true,false,[x,5,1000])[0]!-shade(m,1,.94,0,1,true,false,[x+period,5,1000])[0]!);
    });
    assert.ok(deltas.reduce((a,b)=>a+b,0)/deltas.length>.015,'neighbouring fields do not repeat the round-2 horizon ripple');
  } finally {atmosphere.dispose();}
});

test('round 3: gorse retains dark foliage and scattered snowy tips', () => {
  const {m,atmosphere}=setup('perth-summit-gorse');
  try {
    const values=Array.from({length:12},(_,i)=>shade(m,1,.94,0,1,true,false,[2360+i*.7,210,208])[0]!);
    assert.ok(Math.max(...values)<.34&&Math.min(...values)<.26,'gorse colour shows through the snow on upward lobes');
    assert.ok(Math.max(...values)-Math.min(...values)>.025,'snowy tips vary between the foliage gaps');
  } finally {atmosphere.dispose();}
});

test('round 3: the summit keeps dark heather flecks visible through its snow cover', () => {
  const {m,atmosphere}=setup('perth-summit-ground');
  try {
    const at=(base:number,snow=.94)=>shade(m,1,snow,0,1,true,false,[2368,210,208],[2,1],base)[0]!;
    assert.ok(at(.025)<at(.2)*.6,'dark heather and grass tufts retain less snow than the surrounding ground');
    assert.equal(at(.025,0),.025,'the original heather is unchanged with no snow');
  } finally {atmosphere.dispose();}
});

test('round 3: the snowy KX shed scatters a soft warm night glow while depth still hides lamp dots', () => {
  const {m,atmosphere,camera}=setup('shed-roof-glass','',new THREE.MeshLambertMaterial({transparent:true,depthWrite:false}));
  try {
    const s=compile(m),f=s.fragmentShader;
    assert.ok(s.uniforms.uSnowGlow,'snowy glazing has a diffuse transmitted-lamp uniform');
    const glow=(time:string,snowHere:number)=>{
      atmosphere.update({timeMs:Date.parse(time),weather:weatherState(forcedObservation('snow')),camera,target:new THREE.Vector3(),wallMs:2000});
      const start=f.indexOf('totalEmissiveRadiance *= 1.0 - snowHere'),end=f.indexOf(';',f.indexOf('totalEmissiveRadiance +=',start))+1;
      const vars={totalEmissiveRadiance:[0,0,0],snowHere,uSnowGlow:toValue(s.uniforms.uSnowGlow!.value)};
      new Glsl('').snippet(f.slice(start,end))({vars});return vars.totalEmissiveRadiance;
    };
    assert.deepEqual(glow('2026-12-10T12:00:00Z',.9),[0,0,0],'no daytime scatter or lamp dots');
    const night=glow('2026-12-10T22:30:00Z',.9);
    assert.ok(night[0]!>.005&&night[0]!<.03&&night[0]!>night[1]!&&night[1]!>night[2]!,'night snow transmits a bounded warm glow');
    assert.deepEqual(glow('2026-12-10T22:30:00Z',0),[0,0,0],'clear glazing gets no added snow glow');
    assert.equal(m.depthWrite,true,'the point-lamp occlusion is retained at night');
  } finally {atmosphere.dispose();}
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


test('round 4: Princes Street uses wet grey slush on the actual dark road paint, preserving North Bridge', () => {
  const m=new THREE.MeshLambertMaterial();m.userData.snowSlush=true;
  m.userData.snowMask={texture:new THREE.DataTexture(new Uint8Array([20]),1,1,THREE.RedFormat),rect:new THREE.Vector4(-100,-200,.01,.01)};
  const {atmosphere}=setup('waverley-ground-cover','',m);
  const bridge=setup('waverley-bridge-decks','asphalt');
  try {
    const base=new THREE.Color('#3b3d3f').r;
    const road=shade(m,1,.94,0,.08,true,false,[61.48,16.22,-150.93],[2,1],base);
    assert.ok(road[0]!>.085&&road[0]!<.16,`slush reflects daylight without being black or pavement white: ${road}`);
    assert.ok(road[2]!>road[0]!,'wet slush has a cool sky tint before receiving the scene lights');
    assert.ok(shade(bridge.m,1)[0]!<.1,'North Bridge retains its accepted response');
    for(const wet of [0,.3,1]) assert.equal(shade(m,1,0,wet,.08,true,false,[61.48,16,-151],[2,1],base)[0],base);
    assert.equal(shade(m,0,.94,0,.08,true,false,[61.48,16,-151],[2,1],base)[0],base,'vertical faces do not gain slush');
  } finally {atmosphere.dispose();bridge.atmosphere.dispose();}
});

test('round 4: the visible Calton path has a grey trodden core instead of white compacted snow', () => {
  const m=new THREE.MeshLambertMaterial();m.userData.snowSlush=true;
  m.userData.snowMask={texture:new THREE.DataTexture(new Uint8Array([82]),1,1,THREE.RedFormat),rect:new THREE.Vector4(300,-320,.01,.01)};
  const {atmosphere}=setup('waverley-ground-cover','',m);
  try {
    const base=new THREE.Color('#5f5c56').r;
    const at=(mask:number)=>shade(m,1,.94,0,mask,true,false,[337,-0,-285],[2,1],base)[0]!;
    assert.ok(at(.32)<.14,`trodden earth/slush remains grey: ${at(.32)}`);
    assert.ok(at(1)-at(.32)>.5,`the mapped line is clearly distinct from surrounding snow: ${at(1)}, ${at(.32)}`);
  } finally {atmosphere.dispose();}
});

test('round 4: KX roads have aligned kerb slush and paired tyre tracks only in snow', () => {
  const m=new THREE.MeshLambertMaterial();m.userData.snowRoad=true;
  const {atmosphere}=setup('city-asphalt','city-asphalt',m);
  try {
    const at=(across:number,snow=.94)=>shade(m,1,snow,0,1,true,false,[-69.46,1.32,138.79],[2,1],.2,[0,0,0],[40,across,14])[0]!;
    assert.ok(at(.25)-at(3.5-.7)>.08,'kerb slush is lighter than the wheel track');
    assert.ok(at(3.5)-at(3.5-.7)>.01,'two wheel tracks flank each lane centre');
    assert.equal(at(.25,0),.2);assert.equal(at(3.5-.7,0),.2);
  } finally {atmosphere.dispose();}
});

test('round 4: metre-scale summit scour exposes grass and heather near the eye', () => {
  const {m,atmosphere}=setup('perth-summit-ground');
  try {
    const values=Array.from({length:50},(_,i)=>shade(m,1,.94,0,1,true,false,[2350+i*.31,210,207+i%4],[2,1],.09,[2368,212.7,208])[0]!);
    assert.ok(Math.max(...values)-Math.min(...values)>.22,'wind-scoured turf breaks up the flat foreground snowfield');
    assert.ok(Math.min(...values)<.25,'some original vegetation shows through');
  } finally {atmosphere.dispose();}
});

test('round 4: distant farmland drift contrast fades instead of waving across the horizon', () => {
  const {m,atmosphere}=setup('perth-main-apron');
  try {
    const range=(eye:number[])=>{const a=Array.from({length:30},(_,i)=>shade(m,1,.94,0,1,true,false,[2000+i*4,5,1000],[2,1],.2,eye)[0]!);return Math.max(...a)-Math.min(...a);};
    assert.ok(range([0,100,0])<range([2050,20,1000])*.55,'far-field drifts have less than half the close contrast');
  } finally {atmosphere.dispose();}
});

test('round 4: opaque snow hides exterior concourse halos but keeps interior lamps and clear-weather halos', () => {
  const scene=new THREE.Scene(),roof=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshLambertMaterial());
  roof.rotation.x=-Math.PI/2;roof.position.y=12;roof.name='concourse-panels';scene.add(roof);
  const atmosphere=createAtmosphere({scene,world:addWorld(scene,{grid:false}),sites:{platform:[],shed:[],concourse:[0,11.9,0]}});
  const camera=new THREE.PerspectiveCamera();
  const conditions=Object.fromEntries((['snow','clear','rain','fog'] as const).map(w=>[w,weatherState(forcedObservation(w))]));
  const update=(weather:'snow'|'clear'|'rain'|'fog',y:number)=>{camera.position.set(0,y,0);camera.updateMatrixWorld(true);atmosphere.update({timeMs:Date.parse('2026-12-10T22:30:00Z'),weather:conditions[weather]!,camera,target:new THREE.Vector3(),wallMs:2000});return atmosphere.nightLights!.group.getObjectByName('lights-concourse')!.visible;};
  try {
    assert.equal(update('snow',25),false,'billboard halos cannot leak through the snowy dome to an exterior eye');
    assert.equal(update('snow',3),true,'lamps still show from under the dome');
    for(const weather of ['clear','rain','fog'] as const)assert.equal(update(weather,25),true,`${weather} keeps its original halo`);
  } finally {atmosphere.dispose();roof.geometry.dispose();(roof.material as THREE.Material).dispose();}
});


test('round 4: canvas-free mapped roads keep longitudinal kerb slush and wheel tracks',async()=>{
 const {snowLanduseMask}=await import('../src/snow.ts');
 const road={width:14,line:[[0,10],[40,10]] as [number,number][],snow:.08,slush:true};
 const mask=snowLanduseMask({extent:{x0:0,x1:40,z0:0,z1:20},roads:[road]},.5);
 try {
  const {data,width,height}=(mask.texture as THREE.DataTexture).image;
  assert.ok(data instanceof Uint8Array,'the road profile retains one byte per texel');
  const at=(x:number,z:number)=>data[(height-1-Math.floor(z/.5))*width+Math.floor(x/.5)]!/255;
  assert.ok(at(20,3.25)>at(20,7.25)+.08,'kerb slush is retained beside the cleared wheel track');
  assert.ok(at(20,6.75)>at(20,7.25)+.015,'wheel tracks follow the lane rather than isotropic noise');
  assert.equal(at(10,7.25),at(30,7.25),'track alignment persists along the road');
 } finally {mask.texture.dispose();}
});


test('round 4: Waverley roof snow scatters a bounded warm glow at night and none by day',()=>{
 const {m,atmosphere,camera}=setup('waverley-mapped-roofs');
 try {
  const s=compile(m),f=s.fragmentShader;
  assert.ok(s.uniforms.uSnowGlow,'the Waverley roof opts into diffuse interior transmission');
  const start=f.indexOf('totalEmissiveRadiance *= 1.0 - snowHere'),end=f.indexOf(';',f.indexOf('totalEmissiveRadiance +=',start))+1;
  const at=(time:string,snowHere:number)=>{
   atmosphere.update({timeMs:Date.parse(time),weather:weatherState(forcedObservation('snow')),camera,target:new THREE.Vector3(),wallMs:2000});
   const vars={totalEmissiveRadiance:[0,0,0],snowHere,uSnowGlow:toValue(s.uniforms.uSnowGlow!.value)};
   new Glsl('').snippet(f.slice(start,end))({vars});return vars.totalEmissiveRadiance;
  };
  assert.deepEqual(at('2026-12-10T12:00:00Z',.8),[0,0,0]);
  const night=at('2026-12-10T22:30:00Z',.8);
  assert.ok(night[0]!>.005&&night[0]!<.02&&night[0]!>night[2]!, 'soft warm transmission, rather than white lamp dots');
  assert.deepEqual(at('2026-12-10T22:30:00Z',0),[0,0,0]);
 } finally {atmosphere.dispose();}
});
