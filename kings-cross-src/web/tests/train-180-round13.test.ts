// GC180-02/04 support tones and low roof masses; joint closure is a seating fix, not a sourced new envelope.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as T from 'three';
import {trainLayout} from '../../core/train.ts';
import {buildTrain,bodySpec,END_GAP} from '../src/train.ts';
import {col} from '../src/train-geom.ts';
import {liveryFor} from '../src/train-livery.ts';

const luminance=(hex:number):number=>new T.Color(hex).getHSL({h:0,s:0,l:0}).l;
const matches=(a:T.Color,b:T.Color):boolean=>Math.max(Math.abs(a.r-b.r),Math.abs(a.g-b.g),Math.abs(a.b-b.b))<1e-6;
const specimen=()=>{const g=buildTrain('gc180x5');g.updateMatrixWorld(true);return g;};

test('180 round 13: the built roof skin is dark charcoal close to the body on every car',()=>{
  const def=liveryFor('gc180x5'),spec=bodySpec('adelante'),g=specimen();
  assert.ok(luminance(def.roof)<.025,'roof is charcoal, not the old mid-grey');
  assert.ok(Math.abs(luminance(def.roof)-luminance(def.body))<.015,'roof and body are close in tone (shade ASSUMED)');
  for(const car of trainLayout('gc180x5').cars){
    const mesh=g.getObjectByName(`car-${car.index}`)!.getObjectByName('body-detail') as T.Mesh;
    const p=mesh.geometry.getAttribute('position'),c=mesh.geometry.getAttribute('color');let found=0;
    for(let i=0;i<p.count;i++)if(p.getY(i)>spec.wallTop&&Math.abs(p.getX(i))>1&&matches(new T.Color().fromBufferAttribute(c,i),col(def.roof)))found++;
    assert.ok(found>0,`car ${car.index}: charcoal roof skin actually built`);
  }
});

test('180 round 13: low roof panels have no bright grille contrast or new layout',()=>{
  const spec=bodySpec('adelante'),style=spec.coverStyle!,g=specimen();
  assert.ok(style.ridges,'existing fine relief retained, not a new equipment layout');
  assert.ok(luminance(style.ridges.colour)<.025,'no bright grille strips');
  assert.ok(Math.abs(luminance(style.ridges.colour)-luminance(style.colour))<.01,'low contrast relief');
  assert.equal(spec.coverHeight,.14,'existing low hump height retained');
  for(const car of trainLayout('gc180x5').cars){
    const mesh=g.getObjectByName(`car-${car.index}`)!.getObjectByName('body-detail') as T.Mesh;
    const p=mesh.geometry.getAttribute('position'),c=mesh.geometry.getAttribute('color');let ridges=0;
    for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)-(spec.crown+.144))<1e-5){
      assert.ok(matches(new T.Color().fromBufferAttribute(c,i),col(style.ridges.colour)),`car ${car.index}: built ridge tone`);ridges++;
    }
    assert.ok(ridges>0,'existing roof relief present');
  }
});

test('180 round 13: bellows keep their assumed envelope, have a level hem and close onto a floor plate',()=>{
  const spec=bodySpec('adelante'),g=specimen(),ways:T.Object3D[]=[];
  g.traverse(o=>{if(o.name==='gangway')ways.push(o);});
  assert.equal(ways.length,8);
  for(const w of ways){assert.equal(w.userData.width,1.9);assert.equal(w.userData.height,2.1);}
  const layout=trainLayout('gc180x5');
  for(const car of layout.cars.slice(0,-1)){
    const joint=car.end,meshes:T.Object3D[]=[];
    for(const index of [car.index,car.index+1])meshes.push(g.getObjectByName(`car-${index}`)!.getObjectByName('body-detail')!);
    for(const dz of [-.3,-.22,-.1,0,.1,.22,.3])for(const y of [1.12,1.16,1.2]){
      const ray=new T.Raycaster(new T.Vector3(3,y,joint+dz),new T.Vector3(-1,0,0));
      assert.ok(ray.intersectObjects(meshes,false).length>0,`joint ${car.index}, z offset ${dz}, y ${y}: no daylight through floor/hem`);
    }
    for(const mesh of meshes as T.Mesh[]){
      const p=mesh.geometry.getAttribute('position'),c=mesh.geometry.getAttribute('color'),rings=new Map<number,{low:number;high:number}>();
      for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i)-joint)<END_GAP&&matches(new T.Color().fromBufferAttribute(c,i),col(0x2a2c31))){
        const z=p.getZ(i),ring=rings.get(z)??{low:Infinity,high:-Infinity};ring.low=Math.min(ring.low,p.getY(i));ring.high=Math.max(ring.high,p.getY(i));rings.set(z,ring);
      }
      assert.ok(rings.size>=6,'pleats retained');
      for(const {low,high} of rings.values()){
        assert.ok(Math.abs(low-spec.gangway.bottom)<1e-5,'each pleat has the same lower edge');
        assert.ok(Math.min(Math.abs(high-3.25),Math.abs(high-3.1975))<1e-5,'existing upper pleat contour retained');
      }
    }
  }
});

test('180 round 13: the ordinary coupler is a continuous bar at its existing height with no invented hanging fittings',()=>{
  const g=specimen();
  for(const car of trainLayout('gc180x5').cars.slice(0,-1)){
    const joint=car.end;let low=Infinity,high=-Infinity,minZ=Infinity,maxZ=-Infinity,count=0;
    for(const index of [car.index,car.index+1]){
      const mesh=g.getObjectByName(`car-${index}`)!.getObjectByName('body-detail') as T.Mesh,p=mesh.geometry.getAttribute('position');
      for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i)-joint)<=END_GAP+1e-4&&Math.abs(p.getX(i))<.3&&p.getY(i)<1.05){
        low=Math.min(low,p.getY(i));high=Math.max(high,p.getY(i));minZ=Math.min(minZ,p.getZ(i));maxZ=Math.max(maxZ,p.getZ(i));count++;
      }
    }
    assert.ok(count>0);assert.ok(low>=.78-1e-5&&high<=.92+1e-5,'a bar at y=.85, without head box or stub legs');
    for(const dz of [-.34,-.2,0,.2,.34]){
      const ray=new T.Raycaster(new T.Vector3(2,.85,joint+dz),new T.Vector3(-1,0,0));
      const meshes=[car.index,car.index+1].map(i=>g.getObjectByName(`car-${i}`)!.getObjectByName('body-detail')!);
      assert.ok(ray.intersectObjects(meshes,false).length>0,'bar connects both headstocks');
    }
    assert.ok(minZ<joint&&maxZ>joint);
  }
});
