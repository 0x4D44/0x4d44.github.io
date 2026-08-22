import { autopilotControls } from './input.js';
import { StageRun } from './race.js';
import { buildStage } from './stage.js';
import { RallyCar } from './vehicle.js';

const rounded = (value,digits=3) => Number(value.toFixed(digits));

export function simulateRun({stageSpec,carSpec,weatherSpec=null,maxSeconds=480,dt=1/120}){
  const stage=buildStage(stageSpec),car=new RallyCar(stage,carSpec,{weather:weatherSpec||undefined}),run=new StageRun(stage);run.state='racing';run.countdown=0;
  let time=0,recoveries=0,maxSlip=0,maxLateral=0,notes=0,collisions=0,lastCollision=0,finite=true;
  while(time<maxSeconds&&run.state!=='finished'){
    const input=autopilotControls(stage,car);car.step(input,dt);const events=run.update(car,dt);notes+=events.filter(event=>event.type==='pace').length;
    maxSlip=Math.max(maxSlip,Math.abs(car.slipAngle));maxLateral=Math.max(maxLateral,Math.abs(car.lateral));
    if(car.collisionImpulse>.08&&lastCollision<=.08)collisions++;lastCollision=car.collisionImpulse;
    if(car.needsRecovery){car.recover();recoveries++;}
    finite=finite&&[car.x,car.y,car.z,car.vx,car.vy,car.vz,car.yaw,car.yawRate,car.progress].every(Number.isFinite);
    if(!finite)break;
    time+=dt;
  }
  return {
    stageId:stageSpec.id,carId:carSpec.id,finished:run.state==='finished',finite,time:rounded(time,2),progress:rounded(car.progress,1),speedKph:rounded(car.speedKph,1),recoveries,collisions,notes,
    maxSlipDeg:rounded(maxSlip*180/Math.PI,1),maxLateral:rounded(maxLateral,1),damage:rounded(car.damageTotal,3),splits:run.splits.map(split=>rounded(split.time,2))
  };
}
