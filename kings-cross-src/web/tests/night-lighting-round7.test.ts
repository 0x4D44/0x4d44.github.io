import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createAtmosphere} from '../src/atmosphere.ts';
import {addWorld} from '../src/world.ts';
import {CLEAR_STATE,forcedObservation,weatherState} from '../src/weather.ts';
import {createStreetLights} from '../src/streetlights.ts';
import {urbanLampOptions} from '../src/station-lamps.ts';
import {LAMP_KIND} from '../../core/streetlights.ts';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {loadWaverleyLamps} from '../src/waverley-lamps.ts';
import {lampSurfaceAt} from '../src/lamp-wet-surface.ts';
import {Glsl} from './glsl.ts';

function named<T extends THREE.Object3D>(root:THREE.Object3D,name:string):T{const o=root.getObjectByName(name);assert.ok(o,name);return o as T;}
function shader(m:THREE.Material,kind='basic'){const lib=THREE.ShaderLib[kind]!,s={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(s as never,undefined as never);return s;}
function block(s:string,n:string){const b=s.split(`// ${n}-begin`)[1]?.split(`// ${n}-end`)[0];assert.ok(b,n);return b;}
const built=buildWaverleyScene({lighting:false}),lamps=await loadWaverleyLamps(built.terrain.heightAt.bind(built.terrain),true,built.group);
after(()=>{lamps.dispose();built.dispose();});
const reflection=named<THREE.InstancedMesh>(lamps.group,'street-lamp-reflections'),wet=shader(reflection.material as THREE.Material);
const wetSample=(x:number,y:number)=>{const e={vars:{vReflectionUv:[x,y],vReflectionAnchor:[12,0,25],uLampWet:1,reflectionOpen:1,gl_FragColor:[1,1,1,1]}};new Glsl('').run(block(wet.fragmentShader,'reflection-alpha')+block(wet.fragmentShader,'reflection-edge')+block(wet.fragmentShader,'reflection-breakup'),e);return e.vars.gl_FragColor[3]!;};

test('WV wet streaks retain a dim continuous spine between irregular brighter segments and through the lower tail',()=>{
  const samples=Array.from({length:131},(_,i)=>wetSample(0,-.65+i*.01));
  assert.ok(Math.min(...samples)>=.055,`black wet gaps: alpha ${Math.min(...samples)}`);
  assert.ok(Math.max(...samples)>Math.min(...samples)*3,'retain brighter broken segments above the dim floor');
  assert.ok(wetSample(0,.9)>=.035,'the visible lower wet tail must not disappear before its receiver ends');
  assert.ok(wetSample(.6,.8)<wetSample(.6,0)*.7,'narrow towards the tip');
  assert.equal(wetSample(0,1),0,'fade to zero at the finite receiver edge');
  assert.equal(lamps.counts().triangles,41992);assert.equal(lamps.counts().draws,10);
});

test('WV distant Market Street wet lobes resolve at frame scale without widening the nearby Princes Street lozenges',()=>{
  const code=block(wet.vertexShader,'reflection-rough-width');
  const width=(d:number)=>{const e={vars:{cameraPosition:[0,20,d],reflectionCentre:[0,20,0],streakWidth:.5,roughWidth:.5}};new Glsl('').run(code,e);return Number(e.vars.roughWidth);};
  assert.ok(width(350)>=5.4,'a distant road reflection needs a resolved soft width');
  assert.ok(width(30)<=1.05,'nearby wet streaks should be narrower than the old dashed lozenges');
  const rows=named<THREE.Group>(lamps.group,'waverley-approach-lamps'),s=shader(named<THREE.InstancedMesh>(rows,'street-lamp-reflections').material as THREE.Material);
  assert.equal(block(s.vertexShader,'reflection-rough-width'),code,'both city and approach fittings use the same rough paving mechanism');
  block(s.fragmentShader,'reflection-receiver-clip');block(s.fragmentShader,'reflection-snow');
});

test('the real Princes Street wet receiver retains its soft tail at frozen x805/y780–794',()=>{
  const surface={map:wet.uniforms.uLampSurface!.value,rect:wet.uniforms.uLampSurfaceRect!.value,dispose(){}},matrix=new THREE.Matrix4();reflection.getMatrixAt(30,matrix);
  const head=new THREE.Vector3().fromBufferAttribute(reflection.geometry.getAttribute('reflectionHead'),30),base=new THREE.Vector3().setFromMatrixPosition(matrix);base.y=lampSurfaceAt(surface,head.x,head.z)[0]+.012;
  const camera=new THREE.PerspectiveCamera(60,1.6,.1,20000);camera.position.set(70,17.86,-185);camera.lookAt(55,43,-125);camera.updateMatrixWorld();
  const normal=new THREE.Vector3(-matrix.elements[1]!/matrix.elements[0]!,1,-matrix.elements[9]!/matrix.elements[10]!).normalize(),mirror=head.clone().addScaledVector(normal,-2*head.clone().sub(base).dot(normal)),ray=mirror.sub(camera.position),t=base.clone().sub(camera.position).dot(normal)/Math.min(-.001,ray.dot(normal)),centre=camera.position.clone().addScaledVector(ray,t);
  const along=camera.position.clone().sub(centre);along.addScaledVector(normal,-along.dot(normal)).normalize();const across=new THREE.Vector3().crossVectors(normal,along).normalize();
  const frame={vars:{lampBase:base.toArray(),lampHead:head.toArray(),lampNormal:normal.toArray(),reflectionCentre:centre.toArray(),cameraPosition:camera.position.toArray(),along:along.toArray(),streakLength:32,streakWidth:.5}};new Glsl('').run(block(wet.vertexShader,'reflection-urban-frame'),frame);
  const c=new THREE.Vector3().fromArray(frame.vars.reflectionCentre),length=Number(frame.vars.streakLength),widthEnv={vars:{streakWidth:.5,roughWidth:.5,reflectionCentre:c.toArray(),cameraPosition:camera.position.toArray()}};new Glsl('').run(block(wet.vertexShader,'reflection-rough-width'),widthEnv);
  const positions=reflection.geometry.getAttribute('position'),vertices:number[]=[],uvs:number[]=[];
  for(let i=0;i<positions.count;i++){
    const z=positions.getZ(i),p=c.clone().addScaledVector(along,length*z),depth=-c.clone().applyMatrix4(camera.matrixWorldInverse).z,vd=-p.clone().applyMatrix4(camera.matrixWorldInverse).z;
    p.addScaledVector(across,positions.getX(i)*Number(widthEnv.vars.roughWidth)*Math.max(.15,Math.min(1,vd/depth)));const receiver=lampSurfaceAt(surface,p.x,p.z);if(receiver[1]>.001)p.y=receiver[0]+.012;
    vertices.push(...p.toArray());uvs.push(positions.getX(i)*2,z*2);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(reflection.geometry.index!.clone());
  const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld();
  try{for(const y of [780,794]){
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(805/640-1,1-y/400),camera);const hit=ray.intersectObject(mesh,false)[0];assert.ok(hit,`the actual draped strip must cover the tail at ${y}`);
    const receiver=lampSurfaceAt(surface,hit.point.x,hit.point.z),error=Math.abs(hit.point.y-receiver[0]-.012),e={vars:{vReflectionUv:hit.uv!.toArray(),vReflectionAnchor:base.toArray(),gl_FragColor:[1,1,1,1],uLampWet:1,reflectionOpen:receiver[1]*(1-THREE.MathUtils.smoothstep(error,.04,.16))}};
    new Glsl('').run(block(wet.fragmentShader,'reflection-alpha')+block(wet.fragmentShader,'reflection-edge')+block(wet.fragmentShader,'reflection-breakup'),e);
    assert.ok(e.vars.gl_FragColor[3]!>=.05,`frozen tail y${y} alpha ${e.vars.gl_FragColor[3]}`);
  }}finally{geometry.dispose();material.dispose();}
});

test('KX masts add one tight fog-only core per strip in the existing Points draw, retaining the wide lobe',()=>{
  const spots=[{x:0,y:0,z:0,height:10,yaw:0,kind:LAMP_KIND.cool,mast:true as const,slope:[0,0] as [number,number]}];
  const l=createStreetLights(spots,{...urbanLampOptions(),kxOptics:true}),plain=createStreetLights(spots,urbanLampOptions());
  try{
    const h=named<THREE.Points>(l.group,'street-lamp-halos'),s=shader(h.material as THREE.Material,'points'),cores=h.geometry.getAttribute('lampFogCore');
    assert.ok(cores,'a separate source-centred lobe is needed; scaling the broad haze barely moves the core');
    assert.equal(Array.from(cores.array).filter(v=>v>.5).length,1);
    const broad=h.geometry.getAttribute('lampFogHaze'),sizes=h.geometry.getAttribute('lampHaloScale'),positions=h.geometry.getAttribute('position'),ci=Array.from(cores.array).findIndex(v=>v>.5),bi=Array.from(broad.array).findIndex(v=>v>.5);
    const diameterShare=sizes.getX(ci)/(9*sizes.getX(bi));
    assert.ok(diameterShare>=.25&&diameterShare<=.35,'the tight lobe spans roughly 200px inside the 700px air halo, not a 20px dot');
    assert.equal(positions.getX(ci),positions.getX(bi));assert.equal(positions.getY(ci),positions.getY(bi));assert.equal(positions.getZ(ci),positions.getZ(bi));
    assert.equal(l.counts().draws,plain.counts().draws);assert.equal(l.counts().triangles,plain.counts().triangles);
    const code=block(s.fragmentShader,'lamp-kx-core');
    const sample=(r:number,fog=1,flag=1)=>{const e={vars:{gl_PointCoord:[.5+r/2,.5],uLampFog:fog,vLampFogCore:flag,mastScatterAlpha:.75,gl_FragColor:[1,1,1,0]}};new Glsl('').run(code,e);return e.vars.gl_FragColor[3]!;};
    assert.ok(sample(.2)>=.075&&sample(.3)>=.055,'add actual inner light energy, not a small colour multiplier');
    assert.ok(sample(.9)<.002,'keep the outer 90–120px shoulder on the accepted broad lobe');
    assert.equal(sample(0,0),0);assert.equal(sample(0,.3),0,'rain and thin haze do not gain a fog core');assert.equal(sample(0,1,0),0,'original strip and broad haze receive no core duplication');
    let previous=Infinity;for(let i=0;i<=100;i++){const a=sample(i/100);assert.ok(a<=previous+1e-8,'core must not form a ring');previous=a;}
    block(s.fragmentShader,'lamp-kx-haze');
  }finally{l.dispose();plain.dispose();}
});

test('live KX fog selects a brighter less saturated orange-grey without changing inactive/day or remote rigs',()=>{
  const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),match=source.match(/cityFogTint:\[([^\]]+)\]/);assert.ok(match);
  const tint=match[1]!.split(',').map(Number) as [number,number,number];
  function setup(colour:[number,number,number]){const scene=new THREE.Scene(),world=addWorld(scene,{grid:false}),a=createAtmosphere({scene,world,sites:null,kingsCrossNightFog:true,cityFogTint:colour}),camera=new THREE.PerspectiveCamera();camera.position.set(260,220,90);let wall=0;return{a,at(timeMs=Date.parse('2026-11-20T22:30:00Z'),weather=weatherState(forcedObservation('fog'))){a.update({camera,target:new THREE.Vector3(),timeMs,wallMs:wall+=1000,weather});return(scene.fog as THREE.Fog).color.getRGB({r:0,g:0,b:0},THREE.SRGBColorSpace);}};}
  const next=setup(tint),base=setup([.278,.218,.170]);
  try{
    const c=next.at(),b=base.at(),brightness=(x:typeof c)=>(x.r+x.g+x.b)/3,saturation=(c.r-Math.min(c.g,c.b))/c.r;
    assert.ok(brightness(c)/brightness(b)>=1.15&&brightness(c)/brightness(b)<=1.25,'lift rendered air brightness without brightening surface lighting');
    assert.ok(saturation>=.25&&saturation<=.30,`brown fog saturation ${saturation}`);
    assert.ok(c.r/c.g>=1.18&&c.r/c.g<=1.24);
    for(const[time,weather]of [[Date.parse('2026-11-20T12:00:00Z'),CLEAR_STATE],[Date.parse('2026-11-20T22:30:00Z'),CLEAR_STATE]] as const){next.at(time,weather);base.at(time,weather);assert.deepEqual(next.a.state()!.rig,base.a.state()!.rig);}
  }finally{next.a.dispose();base.a.dispose();}
});
