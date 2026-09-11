import test from 'node:test';
import assert from 'node:assert/strict';
import {CARS,STAGES,Stage,Vehicle,Records,random,angle,clamp,formatTime,medal,nextNote,ghostPose} from '../core.mjs';

const stages=STAGES.map(d=>new Stage(d));
const input=(s,v,target=14)=>{
  const speed=Math.abs(v.speed),look=10+speed*.6,p=s.at(v.progress+look);
  const error=angle(Math.atan2(p.x-v.x,p.z-v.z)-v.yaw);
  const wheel=Math.atan2(2*v.car.wheelbase*Math.sin(error),look);
  return {steer:clamp(wheel*(1+speed*.023)/.52*1.8,-1,1),
    throttle:clamp(.35+(target-speed)*.35,0,1),brake:clamp((speed-target-1)*.4,0,1)};
};
function run(v,controls,seconds,options={}){
  for(let i=0;i<Math.round(seconds*120);i++)v.step(controls,1/120,options);
}
function flat(car=CARS[0]){
  const s=new Stage({...STAGES[0],theme:'farm',legs:[[2400,0]],amplitude:0});
  s.obstacles=[];s.ground=()=>0;
  for(const p of s.points){p.y=0;p.bank=0;}
  return new Vehicle(s,car);
}
class MemoryStorage{constructor(){this.data=new Map();}getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,v);}}

test('exactly two distinct original cars and six unique stages',()=>{
  assert.equal(CARS.length,2);assert.equal(STAGES.length,6);
  assert.deepEqual(CARS.map(c=>c.drive),['AWD','RWD']);
  assert.equal(new Set(STAGES.map(s=>s.id)).size,6);
  assert.equal(new Set(STAGES.map(s=>s.seed)).size,6);
  assert.ok(stages.reduce((n,s)=>n+s.finish,0)>15000);
});
test('generation is deterministic, connected and smoothly sampled',()=>{
  for(const s of stages){const copy=new Stage(s.def);assert.deepEqual(s.points,copy.points);assert.deepEqual(s.obstacles,copy.obstacles);
    for(let i=1;i<s.points.length;i++){const a=s.points[i-1],b=s.points[i];assert.ok(b.s>a.s);assert.ok(Math.abs(b.y-a.y)<2);assert.ok(Math.abs(angle(b.heading-a.heading))<.11);}
  }
  const a=random(90),b=random(90);for(let i=0;i<100;i++)assert.equal(a(),b());
});
test('sample, projection and ground agree on the driving surface',()=>{
  for(const s of stages)for(let d=12;d<s.finish;d+=29){const p=s.at(d),n=s.nearest(p.x,p.z);assert.ok(n.distance<.02);assert.ok(Math.abs(n.s-d)<.02);assert.ok(Math.abs(s.ground(p.x,p.z)-p.y)<.02);}
});
test('terrain and nearest-segment fallback remain finite far off course',()=>{
  for(const s of stages)for(const [x,z] of [[-800,-400],[1000,900],[2000,5000]])assert.ok(Number.isFinite(s.ground(x,z)));
});
test('visible collision objects have road clearance',()=>{
  for(const s of stages)for(const o of s.obstacles)assert.ok(s.nearest(o.x,o.z).distance>=s.def.width/2+3);
});
for(const s of stages)for(const car of CARS)test(`drive the entire ${s.def.name} in ${car.name}`,()=>{
  const v=new Vehicle(s,car);let maxOffset=0;
  for(let i=0;i<120*360&&!v.finished;i++){
    v.step(input(s,v),1/120);
    assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.yaw));
    maxOffset=Math.max(maxOffset,s.nearest(v.x,v.z,v.progress).distance);
  }
  assert.equal(v.finished,true);assert.equal(v.checkpoint,4);assert.equal(v.splits.length,4);
  assert.equal(v.penalty,0);assert.equal(v.damage,0);assert.ok(maxOffset<1.1);
  const elapsed=v.elapsed;v.step({throttle:1},1/120);assert.equal(v.elapsed,elapsed);
});
test('acceleration, braking and deliberate hold-to-reverse',()=>{
  const v=flat();run(v,{throttle:1},3);assert.ok(v.speed>12);
  run(v,{brake:1},2);assert.ok(v.speed<1.5);
  run(v,{brake:1},2);assert.ok(v.speed<-2);assert.equal(v.reverse,true);
});
test('gear ratios affect delivered wheel force in manual mode',()=>{
  const low=flat(),high=flat();high.gear=6;
  run(low,{throttle:1},3,{automatic:false});run(high,{throttle:1},3,{automatic:false});
  assert.ok(low.speed>high.speed*1.7);assert.equal(high.gear,6);
});
test('automatic shifts and manual shift cooldown stay within six gears',()=>{
  const v=flat();run(v,{throttle:1},8);assert.ok(v.gear>1&&v.gear<=6);
  v.shiftCooldown=0;v.gear=1;v.shift(-1);assert.equal(v.gear,1);
  v.shiftCooldown=0;v.gear=6;v.shift(1);assert.equal(v.gear,6);
  v.shiftCooldown=0;v.gear=3;v.shift(1);v.shift(1);assert.equal(v.gear,4);
});
test('steering changes yaw and handbrake raises rear slip',()=>{
  const a=flat(),b=flat();run(a,{throttle:1},2);run(b,{throttle:1},2);
  run(a,{steer:.5,throttle:.3},.5);run(b,{steer:.5,throttle:.3,handbrake:true},.5);
  assert.ok(a.yaw>.1);assert.ok(b.slip>a.slip+.3);
});
test('zero, negative and nonfinite timestep are harmless',()=>{
  const v=flat();for(const dt of [0,-1,NaN,Infinity])v.step({throttle:1},dt);
  assert.equal(v.elapsed,0);assert.equal(v.speed,0);
  v.step({throttle:NaN,steer:Infinity},1/120);assert.ok(Number.isFinite(v.x));
});
test('recovery charges five seconds and cannot skip an unearned control',()=>{
  const s=stages[0],v=new Vehicle(s,CARS[0]);v.progress=s.finish;v.reset(true);
  assert.equal(v.penalty,5);assert.equal(v.checkpoint,0);assert.ok(v.progress<s.checkpoints[0]);
  v.reset(true);assert.equal(v.penalty,10);
});
test('crossing the finish without intermediate controls is not a result',()=>{
  const s=stages[0],v=new Vehicle(s,CARS[0]);v.reset(false,s.finish-1);
  v.vx=Math.sin(v.yaw)*15;v.vz=Math.cos(v.yaw)*15;run(v,{throttle:.1},.5);
  assert.equal(v.finished,false);assert.equal(v.checkpoint,0);
});
test('finite-width control rejects an off-road bypass',()=>{
  const v=flat(),s=v.stage;v.reset(false,s.checkpoints[0]-1);v.x=s.def.width/2+5;v.vz=15;
  run(v,{throttle:.2},.4);assert.ok(v.progress>s.checkpoints[0]);assert.equal(v.checkpoint,0);
});
test('crossing the first control on the road records one split',()=>{
  const v=flat();v.reset(false,v.stage.checkpoints[0]-1);v.vz=15;run(v,{throttle:.2},.4);
  assert.equal(v.checkpoint,1);assert.equal(v.splits.length,1);
});
test('rock collision changes velocity and applies damage',()=>{
  const v=flat();v.stage.obstacles=[{x:0,z:12,y:0,s:12,radius:1,type:'rock',scale:1}];
  v.cooldown=0;v.vz=18;run(v,{throttle:0},.35);assert.ok(v.damage>0);assert.ok(v.speed<18);
});
test('impact cooldown prevents repeated damage at the same contact',()=>{
  const v=flat();v.cooldown=0;v.impact(15);const damage=v.damage;v.impact(15);assert.equal(v.damage,damage);
  v.cooldown=0;v.impact(1000);assert.equal(v.damage,100);
});
test('pace-note direction and grade agree with signed road curvature',()=>{
  for(const s of stages){assert.ok(s.notes.length>8);for(const n of s.notes){assert.ok(n.grade>=1&&n.grade<=5);const p=s.at((n.s+n.end)/2);assert.equal(n.dir,p.curvature>0?'RIGHT':'LEFT');}
    const n=s.notes[0];assert.equal(nextNote(s,n.s-20,15),n);
  }
});
test('best times save only improvements and isolate assisted/sport records',()=>{
  const memory=new MemoryStorage(),r=new Records(memory),samples=[[0,0,0,0,0],[1,1,1,1,0]];
  assert.equal(r.save('s','c',100,samples),true);assert.equal(r.save('s','c',110,samples),false);
  assert.equal(r.save('s','c',90,samples),true);assert.equal(r.read('s','c').time,90);
  assert.equal(r.read('s','c',false),null);assert.equal(r.save('s','c',NaN,samples),false);
});
test('blocked or full storage is reported, not a false successful save',()=>{
  for(const store of [null,{getItem(){throw Error('blocked');},setItem(){throw Error('quota');}}]){
    const r=new Records(store);assert.equal(r.read('s','c'),null);assert.equal(r.save('s','c',50,[]),false);assert.match(r.warning,/not saved/);
  }
});
test('malformed local records and ghost samples cannot crash playback',()=>{
  const m=new MemoryStorage(),r=new Records(m);m.setItem(r.key('s','c'),'{broken');assert.equal(r.read('s','c'),null);
  m.setItem(r.key('s','c'),JSON.stringify({time:80,samples:'bad'}));assert.deepEqual(r.read('s','c').samples,[]);
  m.setItem(r.key('s','c'),JSON.stringify({time:80,samples:[[1,0,0,0,0],[0,0,0,0,0]]}));assert.deepEqual(r.read('s','c').samples,[]);
});
test('ghost interpolation takes the short path across the yaw wrap',()=>{
  const samples=[[0,0,1,0,3.1],[2,2,1,4,-3.1]],p=ghostPose(samples,1);
  assert.equal(p.x,1);assert.equal(p.z,2);assert.ok(Math.abs(Math.abs(p.yaw)-Math.PI)<.01);
  assert.equal(ghostPose(samples,-1),null);assert.equal(ghostPose(samples,3),null);
});
test('timing and medal boundaries are stable',()=>{
  assert.equal(formatTime(61.234),'1:01.234');assert.equal(formatTime(NaN),'—');assert.equal(formatTime(59.9996),'1:00.000');
  assert.equal(medal(100,100),'GOLD');assert.equal(medal(118,100),'SILVER');assert.equal(medal(140,100),'BRONZE');assert.equal(medal(141,100),'FINISHER');
});
