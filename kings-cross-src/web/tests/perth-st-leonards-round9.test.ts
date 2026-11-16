import test from 'node:test';
import assert from 'node:assert/strict';
import {stLeonardsPaintTexture} from '../src/perth-frontage-textures.ts';
import {ST_LEONARDS as K,ST_LEONARDS_COLOURS as C,stLeonardsBridge,stLeonardsFrame} from '../src/perth-st-leonards-bridge.ts';
import {Batch} from '../src/materials.ts';
import {stLeonardsWeatherReadings} from './st-leonards-weather-readings.ts';

const panels=Math.floor((K.abutments[1]-K.abutments[0]+2.4)/K.girder.pitch),pitch=(K.abutments[1]-K.abutments[0]+2.4)/panels;
const texture=stLeonardsPaintTexture(panels,C.steel,K.girder.flange/(K.parapet+K.fascia));
test.after(()=>texture.dispose());
const readings=stLeonardsWeatherReadings(texture.image,panels,K.girder.flange/(K.parapet+K.fascia));
const {pw,ph,bodies}=readings,clearHeight=K.parapet+K.fascia-2*K.girder.flange;

// Lead ruling 2026-11-16 21:10Z: the scorer rejected round 9's mushroom/T caps and full-height stalks.
// Replace only weather shape/size/occupancy targets; the girder relief and material assertions remain intact.
test('round 9b: rust occupies at least 70% of panels and 15-22% of the minified face',()=>{
 assert.ok(bodies.length>=Math.ceil(panels*.7),`occupied ${bodies.length}/${panels}`);
 assert.ok(readings.coverage>=.15&&readings.coverage<=.22,`minified rust coverage ${readings.coverage}`);
});

test('round 9b: upper-middle bodies are 12-16 px high, square to wide, and clear of stiffeners',()=>{
 const sizes=bodies.map(p=>({panel:p.panel,h:p.top-p.bottom+1,w:(p.right-p.left+1)/pw*pitch/clearHeight*ph}));
 assert.ok(sizes.filter(p=>p.h>=11&&p.h<=17).length>=bodies.length*.8,`body pixel sizes ${JSON.stringify(sizes)}`);
 assert.ok(sizes.filter(p=>p.w/p.h>=.9&&p.w/p.h<=1.9).length>=bodies.length*.8,`square-to-wide bodies ${JSON.stringify(sizes)}`);
 assert.ok(bodies.every(p=>p.left/pw>=.09&&p.right/pw<=.91&&(p.left+p.right)/2/pw>=.35&&(p.left+p.right)/2/pw<=.65),`clear of stiffeners ${JSON.stringify(bodies)}`);
 assert.ok(bodies.every(p=>(p.bottom+p.top)/2/ph>=.48&&(p.bottom+p.top)/2/ph<=.72),`upper-middle placement ${JSON.stringify(bodies)}`);
});

test('round 9b: only some patches have soft downward trails, all fading within 40% of the face height',()=>{
 const tailed=bodies.filter(p=>p.tailReach>=p.aboveReach+2&&p.tailReach>=3);
 assert.ok(bodies.every(p=>p.tailReach<=ph*.4),`bounded tail reach ${JSON.stringify(bodies)}`);
 assert.ok(tailed.length>=bodies.length*.15&&tailed.length<=bodies.length*.65,`some tailed patches ${tailed.length}/${bodies.length}`);
});

test('round 9: top flange, coping and stiffeners have visible relief and a dark under-flange line on both faces',()=>{
 const b=new Batch({colored:true,uv:false});stLeonardsBridge(b,{heightAt:()=>0});
 for(const sg of [-1,1]){
  const near=(y:number,proud:number)=>Array.from({length:b.count},(_,i)=>i).filter(i=>{
   const f=stLeonardsFrame([b.positions[i*3]!,b.positions[i*3+2]!]);return Math.abs(b.positions[i*3+1]!-y)<.001&&sg*f.o>=K.half+proud-.001&&f.s>12&&f.s<76;
  });
  const top=K.road+K.parapet;
  assert.ok(near(top-K.girder.flange,.15).length>=4,'top flange projects at least 15 cm');
  assert.ok(near(top+K.coping.height,.23).length>=4,'coping projects at least 23 cm');
  const under=[...near(top-K.girder.flange-.07,.005),...near(top-K.girder.flange,.005)];
  assert.ok(under.length>=4&&under.some(i=>b.colors[i*3]!+b.colors[i*3+1]!+b.colors[i*3+2]!<.16),'a crisp dark contact line below the flange');
 }
 assert.ok(K.girder.stiffener>=.15&&K.girder.stiffenerProud>=.085,'stiffeners have a 15 cm face and 8.5 cm relief');
 // Build budget remains independent of scene size or terrain.
 assert.ok(b.triangles<20_000,`bridge triangles ${b.triangles}`);
});
