import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {addCity} from '../src/city.ts';
import {addTerrain} from '../src/world.ts';
import {createTerrain} from '../../core/terrain.ts';
import {railSegments} from '../../core/scene.ts';
import {portalHole} from '../src/portals.ts';
import {tunnelMouths,REPLACED_BUILDING_IDS} from '../../core/landmarks.ts';
import {KXCENTRAL_OSM_IDS} from '../src/kxcentral.ts';
import type {KxData} from '../../core/osm.ts';
import type {CityData} from '../../core/city.ts';
import type {TerrainFile} from '../../core/terrain.ts';
import * as THREE from 'three';
import {createStreetLights} from '../src/streetlights.ts';
import {urbanLampOptions} from '../src/station-lamps.ts';
import {createLampWetSurface,lampSurfaceAt} from '../src/lamp-wet-surface.ts';
import {LAMP_KIND} from '../../core/streetlights.ts';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {loadWaverleyLamps} from '../src/waverley-lamps.ts';
import {createWaverleyGlow} from '../src/waverley-night.ts';
import {Glsl} from './glsl.ts';
const named=<T extends THREE.Object3D>(root:THREE.Object3D,name:string):T=>{const o=root.getObjectByName(name);assert.ok(o,name);return o as T;};
function shader(m:THREE.Material,kind='basic'){const lib=THREE.ShaderLib[kind]!;const s={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(s as never,undefined as never);return s;}
function block(s:string,name:string){const b=s.split(`// ${name}-begin`)[1]?.split(`// ${name}-end`)[0];assert.ok(b,name);return b;}
function synthetic(){const root=new THREE.Group(),g=new THREE.PlaneGeometry(60,60,30,30).rotateX(-Math.PI/2),p=g.getAttribute('position');for(let i=0;i<p.count;i++)p.setY(i,.003*p.getZ(i)**2);g.computeVertexNormals();const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial());m.name='paving';root.add(m);const spots=[{x:0,y:0,z:0,height:10,yaw:0,kind:LAMP_KIND.cool,slope:[0,0] as [number,number]}];const surface=createLampWetSurface(root,new Set(['paving']),spots)!;const lamps=createStreetLights(spots,urbanLampOptions(surface));return {surface,lamps,dispose(){lamps.dispose();surface.dispose();g.dispose();m.material.dispose();}};}

test('urban pools sample the road inside their footprint and retain seven centimetres of paint clearance',()=>{
 const r=synthetic();try{const pools=named<THREE.InstancedMesh>(r.lamps.group,'street-lamp-pools'),s=shader(pools.material as THREE.Material),p=pools.geometry.getAttribute('position');
  const centre=Array.from({length:p.count},(_,i)=>i).find(i=>Math.abs(p.getX(i))+Math.abs(p.getZ(i))<1e-6);assert.ok(centre!==undefined,'a curved road needs an interior receiver sample; four corners alone can bury the central pool');
  const e={vars:{vPoolWorld:[0,-1,0]},fns:{lampReceiver:()=>[1,1]}};new Glsl('').run(block(s.vertexShader,'pool-receiver'),e);assert.ok((e.vars.vPoolWorld as number[])[1]!>=1.069,'clear the asphalt and its raised paint');
 }finally{r.dispose();}
});

test('urban reflection strips follow a curved wet receiver in short longitudinal segments',()=>{
 const r=synthetic();try{const g=named<THREE.InstancedMesh>(r.lamps.group,'street-lamp-reflections').geometry,p=g.getAttribute('position'),zs=new Set(Array.from({length:p.count},(_,i)=>p.getZ(i)));
  const sorted=[...zs].sort((a,b)=>a-b);let maxError=0;for(let i=1;i<sorted.length;i++){const z0=sorted[i-1]!*32,z1=sorted[i]!*32;maxError=Math.max(maxError,Math.abs((.003*z0*z0+.003*z1*z1)/2-.003*((z0+z1)/2)**2));}assert.ok(maxError<.04,'a long two-triangle strip clips to a thin horizontal band on curved roads');
 }finally{r.dispose();}
});

test('urban rain optics retain visible upper streaks where the true mast mirror centre lies below the image',()=>{
 const r=synthetic();try{const s=shader(named<THREE.InstancedMesh>(r.lamps.group,'street-lamp-reflections').material as THREE.Material),e={vars:{vReflectionUv:[0,-.5],vReflectionAnchor:[36,0,18],gl_FragColor:[1,1,1,1],uLampWet:1,reflectionOpen:1}};
  const run=new Glsl('');run.run(block(s.fragmentShader,'reflection-alpha'),e);run.run(block(s.fragmentShader,'reflection-breakup'),e);const alpha=(e.vars.gl_FragColor as number[])[3]!;assert.ok(alpha>=.25,'the in-frame tail must reach L*40 on dark paving, not L*8–16');
 }finally{r.dispose();}
});

test('urban rough reflections include the illuminated ground below the head, not only the off-screen mirror point',()=>{
 const r=synthetic();try{const s=shader(named<THREE.InstancedMesh>(r.lamps.group,'street-lamp-reflections').material as THREE.Material);
 const b=block(s.vertexShader,'reflection-urban-frame'),e={vars:{lampBase:[0,0,0],lampHead:[0,10,0],reflectionCentre:[0,0,12],cameraPosition:[0,26,40],lampNormal:[0,1,0],along:[0,0,1],streakLength:32,streakWidth:.5}};new Glsl('').run(b,e);
 const c=e.vars.reflectionCentre as number[],length=Number(e.vars.streakLength);assert.ok(c[2]!-length*.5<-.5,'streak reaches the lamp foot');assert.ok(c[2]!+length*.5>12,'mirror lobe remains covered');
 }finally{r.dispose();}
});

test('Princes Street reflections receive the adjacent wet footway instead of being clipped at the carriageway edge',async()=>{
 const b=buildWaverleyScene({lighting:false}),l=await loadWaverleyLamps(b.terrain.heightAt.bind(b.terrain),true,b.group);try{const s=shader(named<THREE.InstancedMesh>(l.group,'street-lamp-reflections').material as THREE.Material),surface={map:s.uniforms.uLampSurface!.value,rect:s.uniforms.uLampSurfaceRect!.value,dispose(){}};
 assert.ok(lampSurfaceAt(surface,61,-169)[1]>.9,'the visible paving below the Princes Street lamp is wet ground');
 }finally{l.dispose();b.dispose();}
});

test('Market Street has several road-facing sodium heads and pools visible through the frozen North Bridge camera',async()=>{
 const b=buildWaverleyScene({lighting:false}),l=await loadWaverleyLamps(b.terrain.heightAt.bind(b.terrain),true,b.group);try{const rows=named<THREE.Group>(l.group,'waverley-approach-lamps'),heads=named<THREE.Points>(rows,'street-lamp-cores').geometry.getAttribute('position'),cam=new THREE.PerspectiveCamera(60,1.6,.1,10000);cam.position.set(125.47,16.73,35);cam.lookAt(-40,8,10);cam.updateMatrixWorld();b.group.updateMatrixWorld(true);const meshes:THREE.Object3D[]=[];b.group.traverse(o=>{if((o as THREE.Mesh).isMesh&&!((o as THREE.Mesh).material as THREE.Material).transparent)meshes.push(o);});let visible=0;
 for(let i=0;i<heads.count;i++){const h=new THREE.Vector3().fromBufferAttribute(heads,i),v=h.clone().project(cam);if(h.x>-180||Math.abs(v.x)>.95||Math.abs(v.y)>.95||v.z>1)continue;const ray=new THREE.Raycaster(cam.position,h.clone().sub(cam.position).normalize(),0,h.distanceTo(cam.position)-.15);if(!ray.intersectObjects(meshes,false).length)visible++;}assert.ok(visible>=3,'the old 13 fittings were off-screen or hidden; count actual sightlines, not geographical labels');
 }finally{l.dispose();b.dispose();}
});

test('Waverley night paving reduces direct moonlight as well as sky fill while daylight remains exact',()=>{
 const b=buildWaverleyScene({lighting:false}),glow=createWaverleyGlow(b.group);try{const s=shader(named<THREE.Mesh>(b.group,'waverley-platform-surfaces').material as THREE.Material,'lambert'),code=block(s.fragmentShader,'station-platform-ambient').replaceAll('reflectedLight.indirectDiffuse','indirect').replaceAll('reflectedLight.directDiffuse','direct');
 for(const level of[0,1]){const e={vars:{uStationLampLevel:level,indirect:[1,1,1],direct:[1,1,1]}};new Glsl('').run(code,e);assert.ok(level===0?(e.vars.direct as number[])[0]===1:(e.vars.direct as number[])[0]!<=.5);}
 }finally{glow.dispose();b.dispose();}
});

test('Balmoral lights the whole ogee crown, not just pinnacle tips within the body facade bounds',()=>{
 const b=buildWaverleyScene({lighting:false}),glow=createWaverleyGlow(b.group);try{const mesh=named<THREE.Mesh>(b.group,'waverley-balmoral-spire-and-hands'),s=shader(mesh.material as THREE.Material,'lambert'),code=block(s.fragmentShader,'balmoral-crown'),p=mesh.geometry.getAttribute('position'),base=b.group.getObjectByName('waverley-frontage')!.userData.frontage.P;let lit=0,total=0;
 for(let i=0;i<p.count;i++){if(p.getY(i)<base+51.6||p.getY(i)>base+55)continue;const e={vars:{vStationLampWorld:[p.getX(i),p.getY(i),p.getZ(i)],uStationLampLevel:1,totalEmissiveRadiance:[0,0,0]}};new Glsl('').run(code,e);total++;if((e.vars.totalEmissiveRadiance as number[])[0]!>.2)lit++;}assert.ok(total>20&&lit/total>.9,'sample the built dome, not an invented point inside the facade bounds');
 }finally{glow.dispose();b.dispose();}
});

test('Balmoral corner turret uplight varies across its curved stone rather than a flat brown minimum tint',()=>{
 const b=buildWaverleyScene({lighting:false}),glow=createWaverleyGlow(b.group);try{const s=shader(named<THREE.Mesh>(b.group,'waverley-frontage-structure').material as THREE.Material,'lambert'),code=block(s.fragmentShader,'balmoral-trim'),base=b.group.getObjectByName('waverley-frontage')!.userData.frontage.P;
 const run=(n:number[])=>{const e={vars:{vStationLampWorld:[74,base+28.5,-136],vStationLampNormal:n,diffuseColor:[.1,.1,.1,1],uStationLampLevel:1,totalEmissiveRadiance:[0,0,0]}};new Glsl('').run(code,e);return (e.vars.totalEmissiveRadiance as number[])[0]!;};assert.ok(run([0,1,0])>.12);assert.ok(Math.abs(run([1,0,0])-run([0,0,1]))>.025,'flood direction reveals the turret curvature');
 }finally{glow.dispose();b.dispose();}
});


test('the frozen Euston foreground pool stays above the drawn road across the old hard rectangle boundary',()=>{
 const read=(name:string)=>JSON.parse(readFileSync(new URL(`../src/data/${name}.json`,import.meta.url),'utf8'));
 const data=read('kx-track') as KxData,scene=new THREE.Scene(),ground=addTerrain(scene,createTerrain(read('kx-terrain') as TerrainFile),{exclude:portalHole(tunnelMouths(data)),rails:railSegments(data)}),city=addCity(scene,data,read('kx-city') as CityData,{nightEffects:true,trees:false,terrain:ground.ground,hidden:new Set([...REPLACED_BUILDING_IDS,...KXCENTRAL_OSM_IDS])});
 const geometries:THREE.BufferGeometry[]=[],material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 try{const pools=named<THREE.InstancedMesh>(city.lights!.group,'street-lamp-pools'),s=shader(pools.material as THREE.Material),surface={map:s.uniforms.uLampSurface!.value,rect:s.uniforms.uLampSurfaceRect!.value,dispose(){}},m=new THREE.Matrix4(),position=pools.geometry.getAttribute('position'),decals:THREE.Mesh[]=[];
 for(let i=0;i<pools.count;i++){pools.getMatrixAt(i,m);const anchor=new THREE.Vector3().setFromMatrixPosition(m);if(Math.hypot(anchor.x+64.2,anchor.z-135.1)>1)continue;const vertices:number[]=[];
 for(let j=0;j<position.count;j++){const p=new THREE.Vector3().fromBufferAttribute(position,j).applyMatrix4(m),e={vars:{vPoolWorld:p.toArray(),poolAnchorReceiver:[...lampSurfaceAt(surface,anchor.x,anchor.z)]},fns:{lampReceiver:(q:unknown)=>[...lampSurfaceAt(surface,...q as [number,number])]}};new Glsl('').run(block(s.vertexShader,'pool-receiver'),e);vertices.push(...e.vars.vPoolWorld);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(pools.geometry.index!.clone());geometries.push(g);decals.push(new THREE.Mesh(g,material));}
 assert.equal(decals.length,1);scene.updateMatrixWorld(true);const roads:THREE.Object3D[]=[];scene.traverse(o=>{if(['city-asphalt','city-pavement','city-plaza'].includes(o.name))roads.push(o);});const camera=new THREE.PerspectiveCamera(70,1.6,.1,10000);camera.position.set(-67.56067450589589,2.8303483106854976,142.60696559216098);camera.lookAt(-89.85,16,97.85);camera.updateMatrixWorld();let visible=0;
 for(const x of[680,760,840])for(const y of[700,740,780]){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/640-1,1-y/400),camera);const pool=ray.intersectObjects(decals,false)[0],road=ray.intersectObjects(roads,false)[0];if(pool&&road&&pool.distance<road.distance+.01)visible++;}assert.ok(visible>=8,'the centre must not disappear behind a tilted receiver quad');
 }finally{for(const g of geometries)g.dispose();material.dispose();city.dispose();ground.dispose();}
});

test('Waverley retains far head cores while spending its ground geometry only within the station approaches',async()=>{
 const l=await loadWaverleyLamps(()=>0,true);try{const p=named<THREE.InstancedMesh>(l.group,'street-lamp-pools'),heads=named<THREE.Points>(l.group,'street-lamp-cores').geometry.getAttribute('position'),m=new THREE.Matrix4();assert.ok(heads.count>1000);for(let i=0;i<p.count;i++){p.getMatrixAt(i,m);assert.ok(Math.hypot(m.elements[12]!,m.elements[14]!)<253,'fund the conforming pools without adding Waverley frame triangles');}}
 finally{l.dispose();}
});
