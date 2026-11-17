import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import * as THREE from 'three';
import { createAtmosphere, surfaceUniforms } from '../src/atmosphere.ts';
import { addWorld } from '../src/world.ts';
import { CLEAR_STATE, forcedObservation, weatherState } from '../src/weather.ts';
import { createStreetLights } from '../src/streetlights.ts';
import { urbanLampOptions } from '../src/station-lamps.ts';
import { LAMP_KIND } from '../../core/streetlights.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { loadWaverleyLamps } from '../src/waverley-lamps.ts';
import { lampSurfaceAt } from '../src/lamp-wet-surface.ts';
import { Glsl } from './glsl.ts';

function named<T extends THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const o = root.getObjectByName(name); assert.ok(o, name); return o as T;
}
function shader(m: THREE.Material, kind = 'basic') {
  const lib = THREE.ShaderLib[kind]!, s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  m.onBeforeCompile(s as never, undefined as never); return s;
}
function block(s: string, name: string) {
  const b = s.split(`// ${name}-begin`)[1]?.split(`// ${name}-end`)[0]; assert.ok(b, name); return b;
}
const night = Date.parse('2026-11-20T22:30:00Z'), noon = Date.parse('2026-11-20T12:00:00Z');
function climate(tint?: [number, number, number], kx = true) {
  const scene = new THREE.Scene(), world = addWorld(scene, { grid: false });
  const a = createAtmosphere({ scene, world, sites: null, kingsCrossNightFog: kx, ...{ cityFogTint: tint } });
  const camera = new THREE.PerspectiveCamera(60, 1.6, .1, 20000); camera.position.set(70, 26, -185);
  let wallMs = 0;
  return { a, at(timeMs = night, weather = weatherState(forcedObservation('fog'))) {
    a.update({ camera, target: new THREE.Vector3(), timeMs, weather, wallMs: wallMs += 1000 });
    return scene.fog as THREE.Fog;
  } };
}

// Finish the asynchronous fixture before registering tests, so the root after
// hook cannot dispose the shared lamp layer between groups of registrations.
const built = buildWaverleyScene({ lighting: false });
const lamps = await loadWaverleyLamps(built.terrain.heightAt.bind(built.terrain), true, built.group);
after(() => { lamps.dispose(); built.dispose(); });
const reflection = named<THREE.InstancedMesh>(lamps.group, 'street-lamp-reflections');

test('scene-selected KX dense fog is orange-grey at the existing brightness, with no clear/day rig change', () => {
  const tuned = climate([.278, .218, .170]), legacy = climate();
  try {
    const c = tuned.at().color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    const old = legacy.at().color;
    assert.ok(c.r / c.g >= 1.2 && c.r / c.g <= 1.3, `olive/sepia R/G ${c.r/c.g}`);
    assert.ok(c.r / c.b >= 1.55 && c.r / c.b <= 1.7, `orange-grey R/B ${c.r/c.b}`);
    const y = (v: THREE.Color) => .2126*v.r+.7152*v.g+.0722*v.b;
    assert.ok(Math.abs(y(tuned.at().color)/y(old)-1) < .15, 'change hue without raising fog brightness');
    for (const [time, weather] of [[noon, CLEAR_STATE], [night, CLEAR_STATE], [noon, weatherState(forcedObservation('fog'))]] as const) {
      tuned.at(time, weather); legacy.at(time, weather);
      assert.deepEqual(tuned.a.state()!.rig, legacy.a.state()!.rig, 'the entire inactive rig remains exact');
    }
  } finally { tuned.a.dispose(); legacy.a.dispose(); }
});

test('KX mast cores regain energy at 10–30px without expanding the bright centre or changing the wide tail', () => {
  const layer = createStreetLights([{ x: 0, y: 0, z: 0, height: 10, yaw: 0, kind: LAMP_KIND.cool, mast: true, slope: [0, 0] }], { ...urbanLampOptions(), kxOptics: true });
  try {
    const s = shader(named<THREE.Points>(layer.group, 'street-lamp-halos').material as THREE.Material, 'points');
    const code = block(s.fragmentShader, 'lamp-kx-haze');
    const sample = (px: number) => { const e = { vars: { hazeRadius: 2*px/729, mastScatterAlpha: .198, vLampFogHaze: 1, gl_FragColor: [1, 1, 1, 0] } }; new Glsl('').run(code, e); return e.vars.gl_FragColor; };
    const gain = (px: number) => sample(px)[0]!/1.3;
    assert.ok(gain(10) >= 1.19 && gain(20) >= 1.15 && gain(30) >= 1.10, 'restore the measured inner-core deficits');
    assert.ok(gain(60) < 1.025 && gain(120) < 1.001, 'retain the accepted wide tail');
    assert.ok(sample(0)[3]! <= .20, 'do not increase the overlapping strip alpha');
    let previous = Infinity;
    for (let px = 0; px <= 365; px++) { const c = sample(px), intensity = c[0]!*c[3]!; assert.ok(intensity <= previous+1e-8, `ring at ${px}px`); previous=intensity; }
  } finally { layer.dispose(); }
});

test('Waverley uses broad tapered broken rain streaks on its existing receivers, with no triangle or pool change', () => {
  const s = shader(reflection.material as THREE.Material), code = block(s.fragmentShader, 'reflection-roughness');
  const sample = (x: number, y: number) => { const e = { vars: { vReflectionUv: [x, y], vReflectionAnchor: [12, 0, 25], gl_FragColor: [1, 1, 1, 1] } }; new Glsl('').run(code, e); return e.vars.gl_FragColor[3]!; };
  assert.ok(sample(.5, .8) < sample(.5, 0)*.7, 'taper wet tips instead of painting parallel posts');
  assert.ok(sample(.7, 0) > 0 && sample(.95, 0) < sample(.5, 0), 'blur soft sides');
  const values = Array.from({length:161}, (_,i)=>sample(0,-.8+i/100));
  assert.ok(Math.min(...values) < Math.max(...values)*.15, 'unequal bright segments need dark gaps');
  assert.ok(s.fragmentShader.includes('exp( -1.2 * vReflectionUv.x'), 'wide soft lobe must accompany the narrower source');
  assert.equal(lamps.counts().triangles, 41992, 'baseline street layer allocation, including both approach and city batches');
  assert.equal(lamps.counts().draws, 10);
  const pools=named<THREE.InstancedMesh>(lamps.group,'street-lamp-pools'),a=new THREE.Matrix4(),b=new THREE.Matrix4(),poolColour=new THREE.Color(),wetColour=new THREE.Color();
  for(let i=0;i<reflection.count;i++){
    reflection.getMatrixAt(i,a);let source=-1;
    for(let j=0;j<pools.count;j++){pools.getMatrixAt(j,b);if(a.equals(b)){source=j;break;}}
    assert.ok(source>=0,'each wet streak retains its original pool/head anchor');
    pools.getColorAt(source,poolColour);reflection.getColorAt(i,wetColour);
    poolColour.multiplyScalar(3.625);
    assert.ok(Math.hypot(wetColour.r-poolColour.r,wetColour.g-poolColour.g,wetColour.b-poolColour.b)<1e-6,'bright segments retain the lamp hue with enough reflected energy');
  }
  block(s.fragmentShader, 'reflection-receiver-clip'); block(s.fragmentShader, 'reflection-footprint');
  const wet=surfaceUniforms.wet.value, snow=surfaceUniforms.snowCover.value;
  try {
    for (const [w,n,level,visible] of [[1,0,1,true],[0,0,1,false],[.3,0,1,false],[1,.8,1,false],[1,0,0,false]] as const) {
      surfaceUniforms.wet.value=w;surfaceUniforms.snowCover.value=n;lamps.setLevel(level);assert.equal(reflection.visible,visible);
    }
  } finally { surfaceUniforms.wet.value=wet;surfaceUniforms.snowCover.value=snow; }
});

test('Waverley street fog is wider and luminous sources fade gradually with distance instead of vanishing at one plane', () => {
  const rows = named<THREE.Group>(lamps.group, 'waverley-approach-lamps');
  for (const root of [lamps.group, rows]) {
    const halo = shader(named<THREE.Points>(root, 'street-lamp-halos').material as THREE.Material, 'points');
    const size = block(halo.vertexShader, 'lamp-fog-size');
    const e = { vars: { size: 1, lampFogHalo: 1, gl_PointSize: 1 } };new Glsl('').run(size,e);
    assert.ok(e.vars.gl_PointSize >= 18, 'widen scattered air, retaining the clear source size');
    const head = shader(named<THREE.Points>(root, 'street-lamp-cores').material as THREE.Material, 'points');
    const source = head.fragmentShader.match(/gl_FragColor\.rgb \*= max\(1\.0-fogFactor,exp\(-1\.8[^;]+;/)?.[0];
    assert.ok(source, 'a soft luminous tail remains beyond the opaque surface range');
    const sample=(d:number)=>{const vars={fogFactor:THREE.MathUtils.smoothstep(d,60,300),fogNear:60,fogFar:300,vFogDepth:d,uUrbanLampFog:1,vUrbanLampDistance:d,gl_FragColor:[1,1,1,1]};new Glsl('').run(source+block(head.fragmentShader,'lamp-depth'),{vars});return vars.gl_FragColor[0]!;};
    assert.ok(sample(100)>sample(300)*4 && sample(300)>sample(600)*4 && sample(600)>0, 'panorama light must lose energy with real depth');
  }
});

test('three visible western approach lamps retain resolved wet runs through the frozen North Bridge camera', () => {
  const rows=named<THREE.Group>(lamps.group,'waverley-approach-lamps'),mesh=named<THREE.InstancedMesh>(rows,'street-lamp-reflections'),s=shader(mesh.material as THREE.Material);
  const surface={map:s.uniforms.uLampSurface!.value,rect:s.uniforms.uLampSurfaceRect!.value,dispose(){}};
  const camera=new THREE.PerspectiveCamera(60,1.6,.1,20000);camera.position.set(125.47,16.73,35);camera.lookAt(-40,8,10);camera.updateMatrixWorld();built.group.updateMatrixWorld(true);
  const opaque:THREE.Object3D[]=[];built.group.traverse(o=>{const m=(o as THREE.Mesh).material;if((o as THREE.Mesh).isMesh&&!(Array.isArray(m)?m.every(x=>x.transparent):m.transparent))opaque.push(o);});
  const clear=(p:THREE.Vector3)=>!new THREE.Raycaster(camera.position,p.clone().sub(camera.position).normalize(),0,p.distanceTo(camera.position)-.15).intersectObjects(opaque,false).length;
  const matrix=new THREE.Matrix4(),heads=mesh.geometry.getAttribute('reflectionHead');let visible=0;
  for(const i of [10,12,15]){
    mesh.getMatrixAt(i,matrix);const head=new THREE.Vector3().fromBufferAttribute(heads,i),base=new THREE.Vector3().setFromMatrixPosition(matrix),receiver=lampSurfaceAt(surface,head.x,head.z);base.y=receiver[0]+.012;
    const n=new THREE.Vector3(-matrix.elements[1]!/matrix.elements[0]!,1,-matrix.elements[9]!/matrix.elements[10]!).normalize(),mirror=head.clone().addScaledVector(n,-2*head.clone().sub(base).dot(n)),ray=mirror.sub(camera.position);
    const t=base.clone().sub(camera.position).dot(n)/Math.min(-.001,ray.dot(n)),centre=camera.position.clone().addScaledVector(ray,t);
    if(!clear(head)||camera.position.clone().sub(base).dot(n)<=0||t<=0||t>=1||Math.hypot(centre.x-base.x,centre.z-base.z)>s.uniforms.uReflectionReach!.value+6.5)continue;
    const along=camera.position.clone().sub(centre);along.addScaledVector(n,-along.dot(n)).normalize();
    const env={vars:{lampBase:base.toArray(),lampHead:head.toArray(),lampNormal:n.toArray(),reflectionCentre:centre.toArray(),cameraPosition:camera.position.toArray(),along:along.toArray(),streakLength:32,streakWidth:.5,reflectionTail:mesh.geometry.getAttribute('reflectionTail')?.getX(i)??0,vReflectionTail:0}};
    new Glsl('').run(block(s.vertexShader,'reflection-urban-frame'),env);
    const c=new THREE.Vector3().fromArray(env.vars.reflectionCentre),length=Number(env.vars.streakLength);
    const a=c.clone().addScaledVector(along,-length/2).project(camera),b=c.clone().addScaledVector(along,length/2).project(camera),resolved={vars:{reflectionValid:1,reflectionEndA:[a.x,a.y,a.z,1],reflectionEndB:[b.x,b.y,b.z,1]}};
    new Glsl('').run(block(s.vertexShader,'reflection-resolve'),resolved);if(resolved.vars.reflectionValid<.6)continue;
    for(let k=0;k<=80;k+=8){const p=c.clone().addScaledVector(along,length*(-.5+k/80)),wet=lampSurfaceAt(surface,p.x,p.z);p.y=wet[0]+.012;const screen=p.clone().project(camera);
      if(wet[1]>.5&&Math.abs(screen.x)<1&&Math.abs(screen.y)<1&&screen.z<1&&Math.hypot(p.x-base.x,p.z-base.z)<s.uniforms.uReflectionReach!.value&&clear(p)){visible++;break;}
    }
  }
  assert.equal(visible,3,'96m reach discarded two real wet receivers; unresolved grazing streaks must not turn into a horizontal band');
  const tiny={vars:{reflectionValid:1,reflectionEndA:[0,.003,0,1],reflectionEndB:[0,0,0,1]}};new Glsl('').run(block(s.vertexShader,'reflection-resolve'),tiny);assert.equal(tiny.vars.reflectionValid,0,'subpixel runs still disappear');
});

test('Waverley city fog tint keeps low night brightness and leaves legacy remote/day/rain rigs exact', () => {
  const tuned=climate([.108,.087,.068],false),plain=climate(undefined,false);
  try {
    const c=tuned.at().color.getRGB({r:0,g:0,b:0},THREE.SRGBColorSpace);
    assert.ok(c.r/c.g>=1.2&&c.r/c.b>=1.5,'warm street haze replaces blue fog without an ambient raise');
    assert.ok(c.r<.12&&c.g<.10&&c.b<.08,'keep dense air dim around the local lamps');
    for(const [time,weather] of [[noon,CLEAR_STATE],[night,weatherState(forcedObservation('rain'))],[noon,weatherState(forcedObservation('fog'))]] as const){
      tuned.at(time,weather);plain.at(time,weather);assert.deepEqual(tuned.a.state()!.rig,plain.a.state()!.rig);
    }
  } finally {tuned.a.dispose();plain.a.dispose();}
});
