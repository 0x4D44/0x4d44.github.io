import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {LAMP_KIND} from '../../core/streetlights.ts';
import {createStreetLights} from '../src/streetlights.ts';
import {urbanLampOptions} from '../src/station-lamps.ts';
import {surfaceUniforms} from '../src/atmosphere.ts';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {loadWaverleyLamps} from '../src/waverley-lamps.ts';
import {Glsl} from './glsl.ts';
const named=<T extends THREE.Object3D>(r:THREE.Object3D,n:string):T=>{const o=r.getObjectByName(n);assert.ok(o,n);return o as T;};
const spot={x:0,y:0,z:0,height:10,yaw:0,kind:LAMP_KIND.sodium,slope:[0,0] as [number,number]};
function shader(m:THREE.Material,kind='basic'){const lib=THREE.ShaderLib[kind]!,s={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(s as never,undefined as never);return s;}
function block(s:string,n:string){const b=s.split(`// ${n}-begin`)[1]?.split(`// ${n}-end`)[0];assert.ok(b,n);return b;}

test('urban scattered fog is warm grey around cool LED heads while clear air remains exact',()=>{
 const l=createStreetLights([spot],urbanLampOptions());try{const code=block(shader(named<THREE.Points>(l.group,'street-lamp-halos').material as THREE.Material,'points').fragmentShader,'lamp-fog-scatter');
 for(const fog of [0,1]){const e={vars:{vLampFogHalo:1,uLampFog:fog,vLampFogDistance:30,gl_FragColor:[.62,.78,1,1]}};new Glsl('').run(code,e);const c=e.vars.gl_FragColor as number[];if(fog)assert.ok(c[0]!>=c[2]!,'the wider halo must not add still more blue to the forecourt fog');else assert.deepEqual(c,[.62,.78,1,1]);}
 }finally{l.dispose();}
});

test('mast fog scatter keeps its wide skirt but removes the overlapping strip hot spot',()=>{
 const l=createStreetLights([{...spot,mast:true,kind:LAMP_KIND.cool}],urbanLampOptions());try{const s=shader(named<THREE.Points>(l.group,'street-lamp-halos').material as THREE.Material,'points'),code=block(s.fragmentShader,'lamp-fog-mast');
 const alpha=(mast:number,fog:number,copy:number,uv=[.5,.5])=>{const e={vars:{vLampFogMast:mast,vLampFogHalo:copy,uLampFog:fog,gl_PointCoord:uv,gl_FragColor:[1,1,1,1]}};new Glsl('').run(code,e);return(e.vars.gl_FragColor as number[])[3]!;};assert.ok(alpha(1,1,1)<=.25);assert.ok(alpha(1,1,1,[.9,.5])>=.95,'retain the warm outer skirt while reducing only the overlapping centres');assert.equal(alpha(0,1,1),1);assert.equal(alpha(1,0,1),1);assert.equal(alpha(1,1,0),1);assert.ok(block(s.vertexShader,'lamp-fog-size').includes('9.0'),'retain the expanded skirt');
 }finally{l.dispose();}
});

test('city head cores fade with physical fog depth even in elevated panorama cameras',()=>{
 const l=createStreetLights([spot],urbanLampOptions());try{const code=block(shader(named<THREE.Points>(l.group,'street-lamp-cores').material as THREE.Material,'points').fragmentShader,'lamp-depth');
 const run=(d:number,fog:number)=>{const e={vars:{vUrbanLampDistance:d,uUrbanLampFog:fog,gl_FragColor:[1,.4,.03,1]}};new Glsl('').run(code,e);return e.vars.gl_FragColor as number[];};assert.ok(run(800,1)[0]!<run(80,1)[0]!*.1);assert.deepEqual(run(800,0),[1,.4,.03,1]);
 }finally{l.dispose();}
});

test('all opt-in urban reflections reject snow even when the snow is wet',()=>{
 const l=createStreetLights([spot],urbanLampOptions()),wet=surfaceUniforms.wet.value,snow=surfaceUniforms.snowCover.value;try{const r=named<THREE.InstancedMesh>(l.group,'street-lamp-reflections'),s=shader(r.material as THREE.Material),code=block(s.fragmentShader,'reflection-snow');
 for(const amount of [0,.7,1]){const e={vars:{uLampSnow:amount,gl_FragColor:[1,1,1,1]}};new Glsl('').run(code,e);assert.equal((e.vars.gl_FragColor as number[])[3],amount?0:1);}
 surfaceUniforms.wet.value=1;surfaceUniforms.snowCover.value=1;l.setLevel(1);assert.equal(r.visible,false,'wet snow cannot expose the reflection geometry');surfaceUniforms.snowCover.value=0;l.setLevel(1);assert.equal(r.visible,true);
 }finally{surfaceUniforms.wet.value=wet;surfaceUniforms.snowCover.value=snow;l.dispose();}
});

test('Waverley approach sodium heads and halos retain R/B over three above dark-blue ambient',async()=>{
 const b=buildWaverleyScene({lighting:false}),l=await loadWaverleyLamps(b.terrain.heightAt.bind(b.terrain),true,b.group);try{const rows=named<THREE.Group>(l.group,'waverley-approach-lamps'),c=named<THREE.Points>(rows,'street-lamp-cores').geometry.getAttribute('color'),h=named<THREE.Points>(rows,'street-lamp-halos'),pool=named<THREE.InstancedMesh>(rows,'street-lamp-pools');
 const display=(x:number)=>THREE.ColorManagement.workingToColorSpace(new THREE.Color(x,x,x),THREE.SRGBColorSpace).r;
 for(const attr of [c,h.geometry.getAttribute('color')])for(let i=0;i<attr.count;i++)assert.ok(display(attr.getX(i)+.005)/display(attr.getZ(i)+.025)>3,'sodium must survive blue night background, not render warm yellow');
 const colour=new THREE.Color();pool.getColorAt(0,colour);assert.ok(colour.r/colour.b>20);assert.ok(colour.g<colour.r*.5);
 const s=shader(h.material as THREE.Material,'points'),e={vars:{size:5,lampFogHalo:1,pointSize:0}};new Glsl('').run(block(s.vertexShader,'lamp-fog-size').replaceAll('gl_PointSize','pointSize'),e);assert.ok(Number(e.vars.pointSize)>=65,'Waverley scatter is wider than the former 9x halo');
 }finally{l.dispose();b.dispose();}
});
