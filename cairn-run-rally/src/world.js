import { angleLerp, clamp, expSmoothing, hash01, mat4Compose, mat4Identity, mat4Multiply } from './math.js';
import { roadEdgePoint, sampleStage } from './stage.js';
import { color, MeshBuilder } from './renderer.js';

const C = {
  road: color('#817563'), roadAlt: color('#796f5f'), roadPatch: color('#8a7d69'),
  loose: color('#998168'), looseAlt: color('#8f765d'), shoulder: color('#5a513e'), ditch: color('#394637'),
  grass: color('#536347'), grassAlt: color('#48583e'), moor: color('#687052'), farGrass: color('#4a5941'),
  darkGrass: color('#344332'), trunk: color('#4f3929'), pine: color('#274438'), pineLight: color('#365849'),
  birch: color('#d4c6a4'), rock: color('#69685d'), stone: color('#777267'), stoneDark: color('#59574f'),
  post: color('#e8dfca'), red: color('#d74b32'), barrier: color('#ded5bd'), orange: color('#e65c2b'),
  teal: color('#206a70'), tealDark: color('#16474c'), window: color('#1c2e32'), tyre: color('#171a18'),
  metal: color('#a9a99d'), lamp: color('#f2d37e'), shadow: color('#172018'), water: color('#344e55'),
  spectator1: color('#d99b3b'), spectator2: color('#b64d36'), spectator3: color('#426c77')
};
const IDENTITY = mat4Identity();

export class ChaseCamera {
  constructor(stage,car){
    this.stage=stage;this.position={x:car.x,y:car.y+3,z:car.z-6};this.target={x:car.x,y:car.y+.7,z:car.z+3};
    this.yaw=car.yaw;this.guideYaw=car.yaw;this.fov=58;this.far=780;this.clock=0;
  }
  reset(car){
    const road=sampleStage(this.stage,car.progress);this.yaw=angleLerp(car.yaw,road.heading,.12);this.guideYaw=this.yaw;
    const fx=Math.sin(this.yaw),fz=Math.cos(this.yaw);this.position={x:car.x-fx*6,y:car.y+2.7,z:car.z-fz*6};this.target={x:car.x+fx*3,y:car.y+.6,z:car.z+fz*3};
  }
  update(car,dt){
    this.clock+=dt;
    const speed=car.speed,road=sampleStage(this.stage,car.progress),motionYaw=speed>3?Math.atan2(car.vx,car.vz):car.yaw;
    const slideBlend=clamp(car.slipAmount*.82+speed/150,0,.9);
    let desiredGuide=angleLerp(car.yaw,motionYaw,slideBlend);
    desiredGuide=angleLerp(desiredGuide,road.heading,clamp(.08+car.slipAmount*.18,.08,.28));
    this.guideYaw=angleLerp(this.guideYaw,desiredGuide,expSmoothing(6.2,dt));
    this.yaw=angleLerp(this.yaw,this.guideYaw,expSmoothing(4.35,dt));
    const dist=5.7+clamp(speed*.064,0,3),height=2.5+clamp(speed*.018,0,.72),fx=Math.sin(this.yaw),fz=Math.cos(this.yaw);
    const shake=car.collisionImpulse*.16+car.slipAmount*.016+(car.surface==='grass'?clamp(speed/40,0,1)*.025:0);
    const desired={x:car.x-fx*dist+Math.sin(this.clock*43)*shake,y:car.y+height+Math.sin(this.clock*37)*shake*.45,z:car.z-fz*dist+Math.cos(this.clock*39)*shake};
    const behind=sampleStage(this.stage,Math.max(0,car.progress-dist));desired.y=Math.max(desired.y,behind.y+1.2);
    const horizontal=expSmoothing(7.2,dt),vertical=expSmoothing(9.5,dt);
    this.position.x+=(desired.x-this.position.x)*horizontal;this.position.z+=(desired.z-this.position.z)*horizontal;this.position.y+=(desired.y-this.position.y)*vertical;
    const lookYaw=angleLerp(this.guideYaw,road.heading,.16),look=3.4+clamp(speed*.115,0,4.8),lookX=Math.sin(lookYaw),lookZ=Math.cos(lookYaw),target={x:car.x+lookX*look,y:car.y+.58,z:car.z+lookZ*look};
    const targetSmoothing=expSmoothing(9.5,dt);this.target.x+=(target.x-this.target.x)*targetSmoothing;this.target.y+=(target.y-this.target.y)*targetSmoothing;this.target.z+=(target.z-this.target.z)*targetSmoothing;
    this.fov=56+clamp(speed*.48,0,17);return this;
  }
}

function terrainPoint(sample,lateral,index,band){
  const rx=Math.cos(sample.heading),rz=-Math.sin(sample.heading),camber=clamp(sample.camber*lateral,-1.25,1.25);
  const wave=Math.sin(index*.047+band*1.7)*(.45+band*.55)+Math.sin(index*.014+band*.8)*(.35+band*.7);
  return {x:sample.x+rx*lateral,y:sample.y+camber-(band===1?.28:1.2)+wave,z:sample.z+rz*lateral};
}

export class RallyWorld {
  constructor(renderer,stage,quality='high'){
    this.renderer=renderer;this.stage=stage;this.quality=quality;this.chunks=[];this.particles=[];this.clock=0;this.wheelRotation=0;
    this.buildBackdrop();this.buildStaticWorld();this.buildCar();
  }
  setQuality(quality){this.quality=quality;}

  buildBackdrop(){
    const xs=this.stage.samples.map(sample=>sample.x),zs=this.stage.samples.map(sample=>sample.z),ys=this.stage.samples.map(sample=>sample.y),pad=1300,y=Math.min(...ys)-7,builder=new MeshBuilder();
    const minX=Math.min(...xs)-pad,maxX=Math.max(...xs)+pad,minZ=Math.min(...zs)-pad,maxZ=Math.max(...zs)+pad;
    builder.quad({x:minX,y,z:minZ},{x:minX,y,z:maxZ},{x:maxX,y,z:maxZ},{x:maxX,y,z:minZ},C.farGrass,{x:0,y:1,z:0});
    this.backdrop=this.renderer.createMesh(builder);
  }

  buildStaticWorld(){
    const samplesPerChunk=30;
    for(let start=0;start<this.stage.samples.length-1;start+=samplesPerChunk){
      const end=Math.min(this.stage.samples.length-1,start+samplesPerChunk),builder=new MeshBuilder();
      this.addRoad(builder,start,end);this.addScenery(builder,start,end);
      const center=this.stage.samples[Math.floor((start+end)/2)];
      this.chunks.push({start,end,s0:this.stage.samples[start].s,s1:this.stage.samples[end].s,x:center.x,y:center.y,z:center.z,mesh:this.renderer.createMesh(builder),triangles:builder.triangleCount});
    }
  }

  addRoad(builder,start,end){
    for(let i=start;i<end;i++){
      const a=this.stage.samples[i],b=this.stage.samples[i+1],block=Math.floor(i/16),shade=hash01(block*811+31),roadCol=a.surface==='loose'?(shade>.48?C.loose:C.looseAlt):(shade>.55?C.roadAlt:C.road);
      const al=roadEdgePoint(a,-a.width/2,.035),ar=roadEdgePoint(a,a.width/2,.035),bl=roadEdgePoint(b,-b.width/2,.035),br=roadEdgePoint(b,b.width/2,.035);builder.quad(al,bl,br,ar,roadCol);
      if(i%19===7){
        const lateral=(hash01(i*1709)-.5)*a.width*.52,half=.22+hash01(i*919)*.18,p1=roadEdgePoint(a,lateral-half,.052),p2=roadEdgePoint(b,lateral-half,.052),p3=roadEdgePoint(b,lateral+half,.052),p4=roadEdgePoint(a,lateral+half,.052);builder.quad(p1,p2,p3,p4,C.roadPatch);
      }
      for(const side of [-1,1]){
        const innerA=roadEdgePoint(a,side*a.width/2,.018),innerB=roadEdgePoint(b,side*b.width/2,.018),outerA=roadEdgePoint(a,side*(a.width/2+2.2),-.08),outerB=roadEdgePoint(b,side*(b.width/2+2.2),-.08);
        if(side<0)builder.quad(outerA,outerB,innerB,innerA,C.shoulder);else builder.quad(innerA,innerB,outerB,outerA,C.shoulder);
        const ditchA=roadEdgePoint(a,side*(a.width/2+2.85),-.22),ditchB=roadEdgePoint(b,side*(b.width/2+2.85),-.22);
        if(side<0)builder.quad(ditchA,ditchB,outerB,outerA,C.ditch);else builder.quad(outerA,outerB,ditchB,ditchA,C.ditch);
        const nearWidth=20+Math.sin(i*.031+side)*3,farWidth=76+Math.sin(i*.021+side*2.3)*13;
        const nearA=terrainPoint(a,side*nearWidth,i,1),nearB=terrainPoint(b,side*(20+Math.sin((i+1)*.031+side)*3),i+1,1),farA=terrainPoint(a,side*farWidth,i,2),farB=terrainPoint(b,side*(76+Math.sin((i+1)*.021+side*2.3)*13),i+1,2);
        const open=a.segmentIndex===12||a.segmentIndex===13||a.segmentIndex===23,grass=open?C.moor:(Math.floor(i/13)%2?C.grass:C.grassAlt);
        if(side<0){builder.quad(nearA,nearB,ditchB,ditchA,grass);builder.quad(farA,farB,nearB,nearA,C.farGrass);}else{builder.quad(ditchA,ditchB,nearB,nearA,grass);builder.quad(nearA,nearB,farB,farA,C.farGrass);}
      }
    }
  }

  addScenery(builder,start,end){
    const openSegments=new Set([0,1,11,12,13,16,23,24,25]);
    for(let i=start;i<=end;i+=2){
      const sample=this.stage.samples[i],open=openSegments.has(sample.segmentIndex),density=open?.19:.52;
      for(const side of [-1,1]){
        const roll=hash01(i*739+side*29);if(roll>density)continue;
        const offset=sample.width/2+4+hash01(i*991+side*43)*(open?26:17),point=roadEdgePoint(sample,side*offset,-.12),scale=.7+hash01(i*541+side*7)*1.45,kind=hash01(i*1237+side*71);
        if(kind>.28)this.addTree(builder,point,scale,kind>.48,kind);else if(kind>.12)this.addBush(builder,point,scale);else this.addSmallRock(builder,point,scale);
      }
    }
    for(let i=start;i<=end;i++)if(i%20===4){const sample=this.stage.samples[i];for(const side of [-1,1])this.addMarker(builder,roadEdgePoint(sample,side*(sample.width/2+1.45),.08),sample.heading,side);}
    for(const hazard of this.stage.hazards){if(hazard.sampleIndex<start||hazard.sampleIndex>end)continue;if(hazard.type==='tree')this.addTree(builder,{x:hazard.x,y:hazard.y,z:hazard.z},1.15,true,.8);else if(hazard.type==='rock')this.addRock(builder,hazard);else this.addHazardPost(builder,hazard);}
    const rangeStart=this.stage.samples[start].s,rangeEnd=this.stage.samples[end].s;
    for(const gateDistance of [22,this.stage.length-25])if(gateDistance>=rangeStart&&gateDistance<=rangeEnd)this.addGate(builder,sampleStage(this.stage,gateDistance),gateDistance<100);
    for(const zone of [{s:1815,side:-1},{s:4110,side:1}])if(zone.s>=rangeStart-80&&zone.s<=rangeEnd+80)this.addHairpinScene(builder,zone.s,zone.side);
    if(rangeEnd>=1640&&rangeStart<=1800)this.addStoneWall(builder,Math.max(1640,rangeStart),Math.min(1800,rangeEnd));
    if(rangeEnd>=3950&&rangeStart<=4075)this.addBridge(builder,Math.max(3950,rangeStart),Math.min(4075,rangeEnd));
  }

  addTree(builder,point,scale,pine,variant=.5){
    if(pine){
      builder.cylinder({x:point.x,y:point.y+1.25*scale,z:point.z},.15*scale,2.5*scale,6,C.trunk);
      builder.cone({x:point.x,y:point.y+.75*scale,z:point.z},1.08*scale,2.45*scale,7,C.pine);
      builder.cone({x:point.x,y:point.y+1.65*scale,z:point.z},.85*scale,2.05*scale,7,variant>.76?C.pineLight:C.pine);
      if(variant>.7)builder.cone({x:point.x,y:point.y+2.45*scale,z:point.z},.55*scale,1.45*scale,7,C.pineLight);
    }else{
      builder.cylinder({x:point.x,y:point.y+1.4*scale,z:point.z},.13*scale,2.8*scale,6,C.birch);
      builder.cone({x:point.x-.18*scale,y:point.y+1.75*scale,z:point.z},.78*scale,1.5*scale,8,C.grassAlt);
      builder.cone({x:point.x+.2*scale,y:point.y+2.15*scale,z:point.z},.62*scale,1.25*scale,8,C.grass);
    }
  }
  addBush(builder,point,scale){builder.cone({x:point.x,y:point.y+.05,z:point.z},.58*scale,.85*scale,7,C.darkGrass);builder.cone({x:point.x+.34*scale,y:point.y+.02,z:point.z+.18*scale},.42*scale,.62*scale,7,C.grassAlt);}
  addSmallRock(builder,point,scale){builder.cone({x:point.x,y:point.y+.03,z:point.z},.5*scale,.42*scale,6,C.rock);}
  addRock(builder,hazard){builder.cone({x:hazard.x,y:hazard.y+.38,z:hazard.z},hazard.radius,.85,6,C.rock);}
  addHazardPost(builder,hazard){builder.box({x:hazard.x,y:hazard.y+.55,z:hazard.z},{x:.16,y:1.1,z:.16},C.post);builder.box({x:hazard.x,y:hazard.y+.92,z:hazard.z},{x:.18,y:.24,z:.18},C.red);}
  addMarker(builder,point,heading,side){builder.box({x:point.x,y:point.y+.55,z:point.z},{x:.11,y:1.1,z:.11},C.post);const rx=Math.cos(heading),rz=-Math.sin(heading);builder.box({x:point.x+rx*side*.015,y:point.y+.95,z:point.z+rz*side*.015},{x:.15,y:.24,z:.15},C.red);}

  addGate(builder,sample,start){
    const rx=Math.cos(sample.heading),rz=-Math.sin(sample.heading),half=sample.width/2+1;
    for(const side of [-1,1]){const x=sample.x+rx*half*side,z=sample.z+rz*half*side;builder.box({x,y:sample.y+2.2,z},{x:.34,y:4.4,z:.34},start?C.orange:C.post);builder.box({x,y:sample.y+3.55,z},{x:.48,y:.42,z:.48},C.tealDark);}
    builder.boxYaw({x:sample.x,y:sample.y+4.05,z:sample.z},{x:sample.width+2.5,y:.65,z:.42},sample.heading,start?C.orange:C.post);
  }

  addHairpinScene(builder,distance,side){
    for(let n=-4;n<=4;n++){const sample=sampleStage(this.stage,distance+n*12),point=roadEdgePoint(sample,side*(sample.width/2+2.6),.18),col=n%2?C.red:C.barrier;builder.boxYaw({x:point.x,y:point.y+.35,z:point.z},{x:.42,y:.7,z:1.45},sample.heading,col);}
    for(let n=0;n<8;n++){const sample=sampleStage(this.stage,distance-30+n*9),point=roadEdgePoint(sample,-side*(sample.width/2+7+n%2*1.3),0),shirt=[C.spectator1,C.spectator2,C.spectator3][n%3];builder.cylinder({x:point.x,y:point.y+.65,z:point.z},.18,1,5,shirt);builder.cone({x:point.x,y:point.y+1.28,z:point.z},.18,.28,6,C.birch);}
  }

  addStoneWall(builder,start,end){
    for(let distance=Math.ceil(start/5)*5;distance<=end;distance+=5){const sample=sampleStage(this.stage,distance),point=roadEdgePoint(sample,-(sample.width/2+2.15),.05),col=Math.floor(distance/5)%2?C.stone:C.stoneDark;builder.boxYaw({x:point.x,y:point.y+.36,z:point.z},{x:.7,y:.72,z:5.25},sample.heading,col);}
  }

  addBridge(builder,start,end){
    for(let distance=Math.ceil(start/7)*7;distance<end;distance+=7){
      const a=sampleStage(this.stage,distance),b=sampleStage(this.stage,Math.min(end,distance+7)),half=Math.min(a.width,b.width)/2+.1;
      const al=roadEdgePoint(a,-half,.075),ar=roadEdgePoint(a,half,.075),bl=roadEdgePoint(b,-half,.075),br=roadEdgePoint(b,half,.075);builder.quad(al,bl,br,ar,C.stoneDark);
      const mid=sampleStage(this.stage,(distance+Math.min(end,distance+7))/2);
      for(const side of [-1,1]){const point=roadEdgePoint(mid,side*(mid.width/2+.45),.24);builder.boxYaw({x:point.x,y:point.y+.42,z:point.z},{x:.18,y:.84,z:7.4},mid.heading,C.barrier);}
    }
    const center=sampleStage(this.stage,4008),ahead=sampleStage(this.stage,4050),behind=sampleStage(this.stage,3966),leftBehind=roadEdgePoint(behind,-48,-5.2),rightBehind=roadEdgePoint(behind,48,-5.2),leftAhead=roadEdgePoint(ahead,-48,-5.2),rightAhead=roadEdgePoint(ahead,48,-5.2);builder.quad(leftBehind,leftAhead,rightAhead,rightBehind,C.water,{x:0,y:1,z:0});
    for(const distance of [3950,4075]){const sample=sampleStage(this.stage,distance);for(const side of [-1,1]){const point=roadEdgePoint(sample,side*(sample.width/2+1),-.4);builder.boxYaw({x:point.x,y:point.y+.4,z:point.z},{x:2.1,y:1.6,z:2.4},sample.heading,C.stone);}}
    void center;
  }

  buildCar(){
    let builder=new MeshBuilder();
    builder.box({x:0,y:.48,z:0},{x:1.82,y:.58,z:3.85},C.teal);builder.wedge({x:-.78,y:.77,z:-.78},{x:.78,y:1.55,z:1.05},.2,C.tealDark);
    builder.box({x:0,y:.51,z:1.86},{x:1.86,y:.26,z:.19},C.orange);builder.box({x:0,y:.65,z:-1.86},{x:1.78,y:.22,z:.18},C.metal);builder.box({x:0,y:.75,z:1.15},{x:1.5,y:.025,z:.84},C.teal);
    builder.box({x:0,y:1.22,z:1.03},{x:1.22,y:.5,z:.035},C.window);builder.box({x:0,y:1.25,z:-.78},{x:1.22,y:.48,z:.035},C.window);
    builder.box({x:-.69,y:.91,z:1.78},{x:.35,y:.18,z:.05},C.lamp);builder.box({x:.69,y:.91,z:1.78},{x:.35,y:.18,z:.05},C.lamp);builder.box({x:0,y:1.62,z:-.38},{x:.72,y:.1,z:.6},C.orange);
    builder.box({x:-.79,y:1.18,z:.05},{x:.035,y:.48,z:1.62},C.window);builder.box({x:.79,y:1.18,z:.05},{x:.035,y:.48,z:1.62},C.window);
    builder.box({x:-.61,y:.82,z:-1.955},{x:.34,y:.19,z:.045},C.red);builder.box({x:.61,y:.82,z:-1.955},{x:.34,y:.19,z:.045},C.red);builder.box({x:0,y:1.25,z:-1.67},{x:1.48,y:.09,z:.34},C.tealDark);
    builder.box({x:-.59,y:1.09,z:-1.67},{x:.09,y:.34,z:.09},C.tealDark);builder.box({x:.59,y:1.09,z:-1.67},{x:.09,y:.34,z:.09},C.tealDark);
    for(const z of [.93,-1.08])for(const x of [-.9,.9])builder.box({x,y:.5,z},{x:.12,y:.48,z:.82},C.tealDark);
    builder.box({x:0,y:.55,z:-1.98},{x:.82,y:.2,z:.035},C.barrier);builder.box({x:-.77,y:.31,z:-1.58},{x:.18,y:.38,z:.08},C.red);builder.box({x:.77,y:.31,z:-1.58},{x:.18,y:.38,z:.08},C.red);
    builder.cylinderX({x:.56,y:.35,z:-2.02},.055,.34,7,C.metal);this.carBody=this.renderer.createMesh(builder);

    builder=new MeshBuilder();builder.cylinderX({x:0,y:0,z:0},.39,.34,10,C.tyre);builder.cylinderX({x:0,y:0,z:0},.22,.37,10,C.metal);builder.box({x:0,y:0,z:0},{x:.37,y:.075,z:.34},C.tealDark);builder.box({x:0,y:0,z:0},{x:.37,y:.34,z:.075},C.tealDark);this.wheel=this.renderer.createMesh(builder);
    builder=new MeshBuilder();builder.box({x:0,y:0,z:0},{x:1.9,y:.22,z:.2},C.orange);this.bumper=this.renderer.createMesh(builder);
    builder=new MeshBuilder();builder.quad({x:-1.1,y:0,z:-2},{x:1.1,y:0,z:-2},{x:1.1,y:0,z:2},{x:-1.1,y:0,z:2},C.shadow,{x:0,y:1,z:0});this.shadow=this.renderer.createMesh(builder);
  }

  update(dt,car,input){
    this.clock+=dt;this.wheelRotation+=car.longitudinalSpeed/.39*dt;
    const speed=car.speed,emit=speed>5&&(input.throttle>.15||car.slipAmount>.05||car.surface!=='compact');
    if(emit){
      const count=this.quality==='high'?Math.ceil(1+speed/12+car.slipAmount*3):1,fx=Math.sin(car.yaw),fz=Math.cos(car.yaw),rx=Math.cos(car.yaw),rz=-Math.sin(car.yaw);
      for(let i=0;i<count;i++){const side=(Math.random()-.5)*1.35,life=.75+Math.random()*.75;this.particles.push({x:car.x-fx*1.65+rx*side,y:car.y-.35,z:car.z-fz*1.65+rz*side,vx:-fx*(1+Math.random()*2)+rx*(Math.random()-.5),vy:.28+Math.random()*.75,vz:-fz*(1+Math.random()*2)+rz*(Math.random()-.5),life,maxLife:life,size:.32+Math.random()*.58,alpha:.42,color:car.surface==='grass'?[.38,.42,.28]:[.55,.47,.35],kind:'dust'});}
      if(car.slipAmount>.22&&car.grounded)this.particles.push({x:car.x,y:car.y-.51,z:car.z,vx:0,vy:0,vz:0,life:4,maxLife:4,size:.11,alpha:.42,color:[.16,.15,.12],kind:'mark'});
    }
    let write=0;
    for(let read=0;read<this.particles.length;read++){
      const particle=this.particles[read];particle.life-=dt;if(particle.life<=0)continue;
      if(particle.kind==='dust'){particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.z+=particle.vz*dt;particle.vy+=.18*dt;particle.size+=dt*.65;particle.alpha=.48*Math.pow(Math.max(0,particle.life/particle.maxLife),1.35);}else particle.alpha=.35*Math.max(0,particle.life/particle.maxLife);
      this.particles[write++]=particle;
    }
    this.particles.length=write;const max=this.quality==='high'?420:190;if(this.particles.length>max)this.particles.splice(0,this.particles.length-max);
  }

  draw(camera,car){
    const maxDistance=this.quality==='high'?850:620,maxSq=maxDistance*maxDistance,routeBehind=this.quality==='high'?460:330,routeAhead=this.quality==='high'?660:510;this.renderer.draw(this.backdrop,IDENTITY);
    for(const chunk of this.chunks){if(chunk.s1<car.progress-routeBehind||chunk.s0>car.progress+routeAhead)continue;const dx=chunk.x-camera.position.x,dz=chunk.z-camera.position.z;if(dx*dx+dz*dz<maxSq)this.renderer.draw(chunk.mesh,IDENTITY);}
    const shadowRoad=sampleStage(this.stage,car.progress),shadowModel=mat4Compose({x:car.x,y:shadowRoad.y+.055,z:car.z},car.yaw,0,0);this.renderer.draw(this.shadow,shadowModel,.48);
    const carModel=mat4Compose({x:car.x,y:car.y,z:car.z},car.yaw,car.pitch,car.roll);this.renderer.draw(this.carBody,carModel);
    const wheelY=.05,frontZ=1.17,rearZ=-1.22;
    for(const z of [frontZ,rearZ])for(const x of [-.93,.93]){const local=mat4Compose({x,y:wheelY-(x>0?car.roll:-car.roll)*.28,z},z>0?car.steer*.38:0,this.wheelRotation,0);this.renderer.draw(this.wheel,mat4Multiply(carModel,local));}
    const damage=car.damage.body,bumperLocal=mat4Compose({x:damage>.58?.18:0,y:.49-damage*.12,z:1.96+damage*.1},damage>.58?damage*.24:0,0,damage>.58?-.12:0);this.renderer.draw(this.bumper,mat4Multiply(carModel,bumperLocal));
    this.renderer.drawParticles(this.particles);
  }
}
