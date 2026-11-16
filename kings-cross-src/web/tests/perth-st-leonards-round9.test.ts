import test from 'node:test';
import assert from 'node:assert/strict';
import {stLeonardsPaintTexture} from '../src/perth-frontage-textures.ts';
import {ST_LEONARDS as K,ST_LEONARDS_COLOURS as C,stLeonardsBridge,stLeonardsFrame} from '../src/perth-st-leonards-bridge.ts';
import {Batch} from '../src/materials.ts';
import {stLeonardsWeatherReadings} from './st-leonards-weather-readings.ts';

const panels=Math.floor((K.abutments[1]-K.abutments[0]+2.4)/K.girder.pitch);
const texture=stLeonardsPaintTexture(panels,C.steel,K.girder.flange/(K.parapet+K.fascia));
test.after(()=>texture.dispose());
const readings=stLeonardsWeatherReadings(texture.image,panels,K.girder.flange/(K.parapet+K.fascia));
const {pw,ph,bodies}=readings;

// Lead ruling 2026-11-16 21:33Z: the scorer rejected round 9b's same-sized, centred orange polka dots.
// Replace its weather placement/size/runoff clauses with irregular seeded blotches; preserve material and girder relief assertions.
test('round 9c: rust retains 15-22% face coverage and reaches the platform-end strip',()=>{
 assert.ok(readings.coverage>=.15&&readings.coverage<=.22,`minified rust coverage ${readings.coverage}`);
 assert.ok(readings.stripCoverage>=.02&&readings.stripCoverage<=.12,`platform-visible lower third coverage ${readings.stripCoverage}`);
});

test('round 9c: blotch centres span the panel horizontally and from the flange to below mid-height',()=>{
 const xs=bodies.map(p=>(p.left+p.right+1)/2/pw),ys=bodies.map(p=>(p.bottom+p.top+1)/2/ph);
 assert.ok(Math.max(...xs)-Math.min(...xs)>=.5,`horizontal centre spread ${xs}`);
 assert.ok(Math.max(...ys)-Math.min(...ys)>=.45&&Math.min(...ys)<.42&&Math.max(...ys)>.8,`vertical centre spread ${ys}`);
});

test('round 9c: blotch sizes vary by at least 2.5x and merged lobes leave ragged, concave edges',()=>{
 const sizes=bodies.map(p=>Math.sqrt(p.area));
 assert.ok(Math.max(...sizes)/Math.min(...sizes)>=2.5,`linear size ratio ${sizes}`);
 assert.ok(bodies.filter(p=>p.solidity<.9).length>=bodies.length*.45,`ragged core solidity ${bodies.map(p=>p.solidity)}`);
});

test('round 9c: panel counts include clean or faint bays, single blotches and several double blotches',()=>{
 assert.ok(readings.counts.filter(n=>n===0).length>=3&&readings.counts.filter(n=>n===0).length<=8,`clean/faint panel counts ${readings.counts}`);
 assert.ok(readings.counts.filter(n=>n===1).length>=panels*.5&&readings.counts.filter(n=>n>=2).length>=2,`varied panel counts ${readings.counts}`);
});

test('round 9c: about half of blotches carry soft downward runoff reaching 5-9 px',()=>{
 const tailed=bodies.filter(p=>p.tailReach>=5&&p.tailReach<=9&&p.tailReach>=p.aboveReach+2);
 assert.ok(tailed.length>=bodies.length*.35&&tailed.length<=bodies.length*.65,`5-9 px tails ${tailed.length}/${bodies.length}: ${JSON.stringify(bodies)}`);
 assert.ok(bodies.every(p=>p.tailReach<=10),`no full-height stalks ${bodies.map(p=>p.tailReach)}`);
});

test('round 9c: calibrated colour predicts muted day rust and retains the ruling saturation ceiling at dusk',()=>{
 // Calibration is from existing PNGs, not a fresh render; the next GPU report must verify these predictions.
 assert.ok(readings.daySaturation>=.22&&readings.daySaturation<=.28,`predicted day saturation ${readings.daySaturation}; ruling target .22-.28`);
 assert.ok(readings.duskSaturation<=.338,`predicted dusk saturation ${readings.duskSaturation}; ruling ceiling .338`);
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
