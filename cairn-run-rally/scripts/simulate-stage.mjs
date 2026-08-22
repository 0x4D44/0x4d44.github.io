import { buildStage } from '../src/stage.js';
import { RallyCar } from '../src/vehicle.js';
import { StageRun } from '../src/race.js';
import { autopilotControls } from '../src/input.js';
const stage=buildStage(),car=new RallyCar(stage),run=new StageRun(stage);run.state='racing';run.countdown=0;
let time=0,recoveries=0,maxSlip=0,maxLateral=0,notes=0,collisions=0,lastCollision=0;
const dt=1/120;
while(time<420&&run.state!=='finished'){
 const input=autopilotControls(stage,car);car.step(input,dt);const events=run.update(car,dt);notes+=events.filter(e=>e.type==='pace').length;
 maxSlip=Math.max(maxSlip,Math.abs(car.slipAngle));maxLateral=Math.max(maxLateral,Math.abs(car.lateral));
 if(car.collisionImpulse>.08&&lastCollision<=.08)collisions++;lastCollision=car.collisionImpulse;
 if(car.needsRecovery){car.recover();recoveries++;}
 time+=dt;
}
console.log(JSON.stringify({finished:run.state==='finished',time:Number(time.toFixed(2)),progress:Number(car.progress.toFixed(1)),speedKph:Number(car.speedKph.toFixed(1)),recoveries,collisions,notes,maxSlipDeg:Number((maxSlip*180/Math.PI).toFixed(1)),maxLateral:Number(maxLateral.toFixed(1)),damage:Number(car.damageTotal.toFixed(3)),splits:run.splits.map(s=>Number(s.time.toFixed(2)))},null,2));
