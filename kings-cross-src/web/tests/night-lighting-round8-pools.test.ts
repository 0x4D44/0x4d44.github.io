import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {createStreetLights} from '../src/streetlights.ts';
import {urbanLampOptions} from '../src/station-lamps.ts';
import {LAMP_KIND} from '../../core/streetlights.ts';
import {Glsl} from './glsl.ts';

test('KX street pools follow each road tangent with a bright head, an elongated lobe and soft bounded edges',()=>{
 const spots=[0,.7,Math.PI/2].map(yaw=>({x:0,y:0,z:0,height:9,yaw,kind:LAMP_KIND.sodium,slope:[0,0] as [number,number]})),l=createStreetLights(spots,{...urbanLampOptions(),kxOptics:true});
 try{
  const p=l.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh,dir=p.geometry.getAttribute('poolRoadDirection');assert.ok(dir,'a radial disc ignores the road and every lamp reads alike from overview');
  const lib=THREE.ShaderLib.basic!,s={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};(p.material as THREE.Material).onBeforeCompile(s as never,undefined as never);
  const code=s.fragmentShader.split('// pool-profile-begin')[1]!.split('// pool-profile-end')[0]!;
  const shape=s.vertexShader.split('// pool-road-shape-begin')[1]!.split('// pool-road-shape-end')[0]!;
  for(let i=0;i<spots.length;i++){
   const d=[dir.getX(i),dir.getY(i)];assert.ok(Math.abs(d[0]!-Math.sin(spots[i]!.yaw))<1e-6&&Math.abs(d[1]!+Math.cos(spots[i]!.yaw))<1e-6,'the arm points across the road; the pool long axis follows its perpendicular');
   const at=(r:number,across=false)=>{const q=across?[-d[1]!,d[0]!]:d,uv=[.5+.5*r*q[0]!, .5+.5*r*q[1]!],e={vars:{uv,vPoolUv:uv,poolRoadDirection:d,poolLine:0,vPoolLine:0,gl_FragColor:[1,1,1,1]}};new Glsl('').run(shape+code,e);return e.vars.gl_FragColor[3]!;};
   assert.equal(at(0),1);assert.ok(at(.65)>at(.65,true)*3,'a road pool must read as a lobe, not a circular decal');
   let last=1;for(let k=1;k<=100;k++){const a=at(k/100);assert.ok(a<=last+1e-7);last=a;}assert.equal(at(1),0);
  }
  l.setLevel(0);assert.equal(p.visible,false,'day-clear stays unchanged');
  const plain=createStreetLights(spots,urbanLampOptions());try{assert.equal(l.counts().triangles,plain.counts().triangles);assert.equal(l.counts().draws,plain.counts().draws);assert.ok(!(plain.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh).geometry.hasAttribute('poolRoadDirection'),'remote/default optics retain the old geometry attributes');}finally{plain.dispose();}
 }finally{l.dispose();}
});
