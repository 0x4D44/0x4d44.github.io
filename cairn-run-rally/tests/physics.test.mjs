import test from 'node:test';
import assert from 'node:assert/strict';
import { CAIRN_R4 } from '../src/content.js';
import { buildStage, sampleStage } from '../src/stage.js';
import { RallyCar } from '../src/vehicle.js';
const stage=buildStage(), dt=1/120;
function place(car,distance,u=0,v=0){const road=sampleStage(stage,distance);car.reset(distance,true);const fx=Math.sin(road.heading),fz=Math.cos(road.heading),rx=Math.cos(road.heading),rz=-Math.sin(road.heading);car.vx=fx*u+rx*v;car.vz=fz*u+rz*v;return road;}
function controlAt(step){const t=step*dt;return {throttle:.25+.65*(Math.sin(t*.73)+1)/2,brake:step%97>82?.35:0,steer:.72*Math.sin(t*1.31),handbrake:step%211>194?.4:0};}
function trajectory(car,steps=420){const samples=[];for(let i=0;i<steps;i++){car.step(controlAt(i),dt);samples.push([car.x,car.y,car.z,car.vx,car.vy,car.vz,car.yaw,car.yawRate,car.roll,car.pitch,car.damageTotal]);}return samples;}

test('default and explicit Cairn R4 profiles produce bit-identical trajectories',()=>{
 const implicit=new RallyCar(stage),explicit=new RallyCar(stage,CAIRN_R4);
 place(implicit,300,18,.4);place(explicit,300,18,.4);
 assert.equal(implicit.profile,CAIRN_R4);assert.equal(explicit.profile,CAIRN_R4);
 assert.deepEqual(trajectory(implicit),trajectory(explicit));
});

test('a copied profile changes mass and steering dynamics without mutating catalog data',()=>{
 const catalogSnapshot=structuredClone(CAIRN_R4);
 const alteredProfile=structuredClone(CAIRN_R4);alteredProfile.massKg*=1.18;alteredProfile.steeringLockRad*=.62;
 const reference=new RallyCar(stage,CAIRN_R4),altered=new RallyCar(stage,alteredProfile);
 place(reference,600,22,0);place(altered,600,22,0);
 const referenceTrajectory=trajectory(reference),alteredTrajectory=trajectory(altered);
 assert.notDeepEqual(alteredTrajectory,referenceTrajectory);
 const finalReference=referenceTrajectory.at(-1),finalAltered=alteredTrajectory.at(-1);
 assert.ok(Math.abs(finalAltered[6]-finalReference[6])>.001||Math.abs(finalAltered[3]-finalReference[3])>.001);
 assert.equal(Object.isFrozen(alteredProfile),false);assert.equal(Object.isFrozen(alteredProfile.suspension),false);
 const inputMass=alteredProfile.massKg;alteredProfile.massKg+=1;alteredProfile.suspension.springHz+=.1;
 assert.equal(alteredProfile.massKg,inputMass+1);assert.equal(altered.profile.massKg,inputMass);assert.equal(altered.profile.suspension.springHz,CAIRN_R4.suspension.springHz);
 assert.deepEqual(CAIRN_R4,catalogSnapshot);
 assert.equal(CAIRN_R4.massKg,1180);assert.equal(CAIRN_R4.steeringLockRad,.6);
});

test('car accelerates credibly and remains numerically stable',()=>{
 const car=new RallyCar(stage);for(let i=0;i<1200;i++)car.step({throttle:1,brake:0,steer:0,handbrake:0},dt);
 assert.ok(car.speedKph>105&&car.speedKph<175,`speed=${car.speedKph}`);
 for(const value of [car.x,car.y,car.z,car.vx,car.vz,car.yaw,car.yawRate])assert.ok(Number.isFinite(value));
});

test('loose gravel retains more lateral slip than compact dirt',()=>{
 const compact=new RallyCar(stage),loose=new RallyCar(stage);place(compact,1200,22,5);place(loose,1370,22,5);
 for(let i=0;i<60;i++){compact.step({throttle:0,brake:0,steer:0,handbrake:0},dt);loose.step({throttle:0,brake:0,steer:0,handbrake:0},dt);}
 assert.equal(compact.surface,'compact');assert.equal(loose.surface,'loose');
 assert.ok(Math.abs(loose.lateralSpeed)>Math.abs(compact.lateralSpeed)*1.45,`${loose.lateralSpeed} vs ${compact.lateralSpeed}`);
});

test('handbrake can induce rotation and countersteer reduces yaw rate',()=>{
 const car=new RallyCar(stage);place(car,1000,23,0);
 for(let i=0;i<45;i++)car.step({throttle:.5,brake:0,steer:.7,handbrake:1},dt);
 const induced=Math.abs(car.yawRate);assert.ok(induced>.45,`induced yaw=${induced}`);
 for(let i=0;i<120;i++){const counter=-Math.sign(car.yawRate||1);car.step({throttle:.35,brake:0,steer:counter*.7,handbrake:0},dt);}
 assert.ok(Math.abs(car.yawRate)<induced*.78,`caught yaw=${car.yawRate}, induced=${induced}`);
 assert.ok(car.speed>2);
});

test('damage has consequence without making the car unrecoverable',()=>{
 const car=new RallyCar(stage),hazard=stage.hazards.find(h=>h.type!=='post');
 car.x=hazard.x-8;car.z=hazard.z;car.y=hazard.y+.54;car.yaw=Math.PI/2;car.vx=24;car.vz=0;car.progress=hazard.s;car.progressIndex=hazard.sampleIndex;
 for(let i=0;i<100;i++)car.step({throttle:1,brake:0,steer:0,handbrake:0},dt);
 assert.ok(car.damageTotal>.005,`damage=${car.damageTotal}`);
 assert.ok(car.damage.engine<.8&&car.damage.steering<.8&&car.damage.suspension<.8);
});

test('adversarial inputs stay finite for a long session',()=>{
 const car=new RallyCar(stage);place(car,300,18,0);
 for(let i=0;i<120*90;i++){const t=i*dt;car.step({throttle:(Math.sin(t*.7)+1)/2,brake:Math.sin(t*.31)> .83?1:0,steer:Math.sin(t*1.9),handbrake:Math.sin(t*.47)>.91?1:0},dt);if(car.needsRecovery)car.recover();}
 for(const value of [car.x,car.y,car.z,car.vx,car.vz,car.vy,car.yaw,car.yawRate,car.roll,car.pitch])assert.ok(Number.isFinite(value));
 assert.ok(car.damageTotal<=1);
});

test('full authored stage is completable without recovery or catastrophic damage', async()=>{
 const { autopilotControls }=await import('../src/input.js');
 const { StageRun }=await import('../src/race.js');
 const car=new RallyCar(stage),run=new StageRun(stage);run.state='racing';run.countdown=0;let time=0,recoveries=0,paceCalls=0;
 while(time<stage.expectedDurationSeconds[1]+10&&run.state!=='finished'){
  car.step(autopilotControls(stage,car),dt);const events=run.update(car,dt);paceCalls+=events.filter(e=>e.type==='pace').length;if(car.needsRecovery){car.recover();recoveries++;}time+=dt;
 }
 assert.equal(run.state,'finished');assert.ok(time>=stage.expectedDurationSeconds[0]&&time<=stage.expectedDurationSeconds[1],`time=${time}`);assert.equal(recoveries,0);assert.equal(paceCalls,stage.notes.length);assert.ok(car.damageTotal<.08,`damage=${car.damageTotal}`);
});


test('handbrake cannot create motion from rest',()=>{
 const car=new RallyCar(stage);place(car,220,0,0);
 for(let i=0;i<240;i++)car.step({throttle:0,brake:0,steer:0,handbrake:1},dt);
 assert.ok(car.speed<.025,`handbrake propelled car to ${car.speed} m/s`);
});

test('airborne throttle and steering have only negligible authority',()=>{
 const driven=new RallyCar(stage),neutral=new RallyCar(stage);place(driven,1000,24,0);place(neutral,1000,24,0);
 for(const car of [driven,neutral]){car.y+=5;car.grounded=false;car.airTime=.2;}
 for(let i=0;i<60;i++){driven.step({throttle:1,brake:0,steer:1,handbrake:0},dt);neutral.step({throttle:0,brake:0,steer:0,handbrake:0},dt);}
 assert.ok(Math.abs(driven.speed-neutral.speed)<.25,`air speed delta=${driven.speed-neutral.speed}`);
 assert.ok(Math.abs(driven.yaw-neutral.yaw)<.035,`air yaw delta=${driven.yaw-neutral.yaw}`);
});

test('reversing does not move the last safe recovery point forward',()=>{
 const car=new RallyCar(stage),road=place(car,600,-12,0);car.lastSafeDistance=500;
 for(let i=0;i<180;i++)car.step({throttle:0,brake:0,steer:0,handbrake:0},dt);
 assert.equal(car.lastSafeDistance,500);assert.ok(car.progress<road.s);
});


test('low-speed lateral motion settles instead of skating indefinitely',()=>{
 const car=new RallyCar(stage);place(car,220,0,1);
 for(let i=0;i<180;i++)car.step({throttle:0,brake:0,steer:0,handbrake:0},dt);
 assert.ok(Math.abs(car.lateralSpeed)<.12,`lateral speed=${car.lateralSpeed}`);
});

test('authored walls and bridge rails have collision consequence',()=>{
 const car=new RallyCar(stage),barrier=stage.barriers.find(item=>item.type==='wall'),road=sampleStage(stage,barrier.s),dx=barrier.x-road.x,dz=barrier.z-road.z,length=Math.hypot(dx,dz),nx=dx/length,nz=dz/length;
 car.reset(barrier.s,true);car.x=barrier.x-nx*4;car.z=barrier.z-nz*4;car.y=barrier.y+.54;car.vx=nx*16;car.vz=nz*16;car.yaw=Math.atan2(nx,nz);
 for(let i=0;i<90;i++)car.step({throttle:0,brake:0,steer:0,handbrake:0},dt);
 assert.ok(car.damage.body>.01,`body damage=${car.damage.body}`);assert.ok(car.collisionImpulse>=0);
});


test('steering reverses yaw direction while backing up',()=>{
 const forward=new RallyCar(stage),reverse=new RallyCar(stage),road=place(forward,220,9,0);place(reverse,220,-9,0);
 for(let i=0;i<75;i++){forward.step({throttle:0,brake:0,steer:.8,handbrake:0},dt);reverse.step({throttle:0,brake:0,steer:.8,handbrake:0},dt);}
 const forwardYaw=forward.yaw-road.heading,reverseYaw=reverse.yaw-road.heading;
 assert.ok(forwardYaw*reverseYaw<0,`forward=${forwardYaw}, reverse=${reverseYaw}`);assert.ok(Math.abs(reverseYaw)<.9,`reverse yaw runaway=${reverseYaw}`);
});


test('gentle barrier contact gives feedback without accumulating damage',()=>{
 const car=new RallyCar(stage),barrier=stage.barriers.find(item=>item.type==='bridge-rail'),road=sampleStage(stage,barrier.s),dx=barrier.x-road.x,dz=barrier.z-road.z,length=Math.hypot(dx,dz),nx=dx/length,nz=dz/length;
 car.reset(barrier.s,true);car.x=barrier.x-nx*1.3;car.z=barrier.z-nz*1.3;car.vx=nx*1.8;car.vz=nz*1.8;car.yaw=Math.atan2(nx,nz);
 for(let i=0;i<20;i++)car.step({throttle:0,brake:0,steer:0,handbrake:0},dt);
 assert.ok(car.collisionImpulse>0);assert.equal(car.damageTotal,0);
});

test('a stranded off-road car requests recovery and returns to the route',()=>{
 const car=new RallyCar(stage),road=sampleStage(stage,900),rx=Math.cos(road.heading),rz=-Math.sin(road.heading);car.reset(900,true);car.x=road.x+rx*42;car.z=road.z+rz*42;car.vx=0;car.vz=0;
 for(let i=0;i<360&&!car.needsRecovery;i++)car.step({throttle:0,brake:0,steer:0,handbrake:0},dt);
 assert.equal(car.needsRecovery,true);car.recover();assert.ok(Math.abs(car.lateral)<1);assert.ok(car.progress<=900);
});

test('drive layouts create distinct power-on balance through the combined tyre model',()=>{
 const make=drive=>new RallyCar(stage,{...structuredClone(CAIRN_R4),id:`test-${drive}`,drive},{assists:{automatic:false,stability:false,braking:false}});
 const cars=Object.fromEntries(['fwd','rwd','awd'].map(drive=>[drive,make(drive)]));
 for(const car of Object.values(cars)){place(car,1000,20,0);car.gear=3;for(let i=0;i<90;i++)car.step({throttle:1,brake:0,steer:.55,handbrake:0},dt);}
 assert.ok(Math.abs(cars.rwd.yawRate)>Math.abs(cars.fwd.yawRate)*1.45,`${cars.rwd.yawRate} vs ${cars.fwd.yawRate}`);
 assert.notEqual(cars.awd.lateralSpeed,cars.fwd.lateralSpeed);
 assert.notEqual(cars.awd.lateralSpeed,cars.rwd.lateralSpeed);
});

test('power-on cornering consumes front tyre capacity instead of granting unlimited grip',()=>{
 const run=throttle=>{const car=new RallyCar(stage,CAIRN_R4,{assists:{automatic:false,stability:false,braking:false}});place(car,1000,20,0);car.gear=3;for(let i=0;i<30;i++)car.step({throttle,brake:0,steer:.7,handbrake:0},dt);return car;};
 const coast=run(0),power=run(1);
 assert.ok(Math.abs(power.tyreForces.frontLateral)<Math.abs(coast.tyreForces.frontLateral));
 for(const car of [coast,power])for(const axle of ['front','rear']){
  const longitudinal=car.tyreForces[`${axle}Longitudinal`],lateral=car.tyreForces[`${axle}Lateral`],load=car.axleLoads[axle];
  assert.ok(Math.hypot(longitudinal,lateral)<load*1.2);
 }
});

test('braking and engine drag cannot add kinetic energy',()=>{
 const car=new RallyCar(stage),initialSpeed=25;place(car,220,initialSpeed,0);
 let previous=car.speed;
 for(let i=0;i<120;i++){
  car.step({throttle:0,brake:1,steer:0,handbrake:0},dt);
  assert.ok(car.speed<=previous+.04,`speed rose from ${previous} to ${car.speed}`);
  previous=car.speed;
 }
 assert.ok(car.speed<initialSpeed*.7,`final speed=${car.speed}`);
});

test('manual gearbox shifts only on an explicit input edge',()=>{
 const car=new RallyCar(stage,CAIRN_R4,{assists:{automatic:false}});place(car,220,18,0);
 for(let i=0;i<30;i++)car.step({throttle:.5,brake:0,steer:0,handbrake:0},dt);
 assert.equal(car.gear,1);
 car.step({throttle:.5,brake:0,steer:0,handbrake:0,shiftUp:true},dt);
 assert.equal(car.gear,2);
 assert.ok(car.shiftRemaining>0);
});

test('service damping and tyre choices change the physical setup',()=>{
 const baseline=new RallyCar(stage,CAIRN_R4);
 const firm=new RallyCar(stage,CAIRN_R4,{tuning:{damping:.25,tyreId:'gravel'}});
 assert.ok(firm.suspensionResponse.damping>baseline.suspensionResponse.damping);
 assert.ok(firm.tyreSurfaceScale('gravel','compact')>firm.tyreSurfaceScale('gravel','tarmac'));
});
