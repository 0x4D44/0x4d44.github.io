/* Southern Cross Rally — original, deterministic simulation. SI units throughout.
 * No renderer, DOM or random global state lives in this module. */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const mix = (a, b, t) => a + (b - a) * t;
export const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
export const smooth = (a, b, x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
export function random(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }
export const CARS = [
  {id:'kestrel', name:'Kestrel R4', class:'TURBO · ALL-WHEEL DRIVE', description:'Planted, forgiving and very fast. A turbocharged four-cylinder with a balanced all-wheel-drive chassis.', mass:1280, power:224000, grip:1, wheelbase:2.55, front:.55, rearGrip:1, drive:'AWD', colour:[.08,.48,.46], accent:[.92,.88,.69], number:'07', maxSpeed:57, gears:[0,3.1,2.1,1.55,1.22,1,.84]},
  {id:'tui', name:'Tūī Clubman', class:'NATURALLY ASPIRATED · REAR-WHEEL DRIVE', description:'Less weight, more attitude. A high-revving rear-drive coupé that rewards a measured throttle and a well-timed flick.', mass:1050, power:190000, grip:.97, wheelbase:2.38, front:.49, rearGrip:.9, drive:'RWD', colour:[.88,.29,.075], accent:[.11,.15,.16], number:'23', maxSpeed:60, gears:[0,3.3,2.22,1.6,1.25,1,.83]}
];
// Original roads inspired by NZ landscapes, not surveyed or licensed rally routes.
// Each leg: metres, heading change in radians. Smooth entry/exit preserves flow.
export const STAGES = [
  {id:'whaanga',name:'Whaanga Coast',region:'TASMAN COAST',theme:'coast',weather:'Golden hour',seed:113, width:8.5, grip:.88, sky:[.30,.55,.65],fog:[.67,.75,.72],grass:[.32,.40,.18],sun:[- .65,.55,.45],light:[1,.86,.66],wet:0, amplitude:17,base:34, target:132,
    description:'Salt air, open sweepers and a road carved into the coast. Settle the car before the tightening bends.',
    legs:[[180,0],[230,.8],[180,-1.1],[140,-.65],[210,1.3],[160,.5],[150,-1.2],[210,.8],[180,-.9],[240,.6],[190,-.6],[200,.5],[160,0]]},
  {id:'te-akau',name:'Te Akau Run',region:'WAIKATO FARMLAND',theme:'farm',weather:'Clear morning',seed:229,width:9,grip:.91,sky:[.30,.57,.76],fog:[.68,.79,.78],grass:[.31,.44,.15],sun:[.5,.7,.4],light:[1,.97,.86],wet:0,amplitude:24,base:35,target:136,
    description:'Fast farmland, fence lines and blind crests. Carry momentum, but leave room for the downhill braking zones.',
    legs:[[200,0],[220,-.7],[160,.6],[200,1],[150,-.9],[210,-.65],[200,.9],[160,.4],[220,-1],[180,.85],[240,-.6],[180,.4],[190,0]]},
  {id:'maramarua',name:'Maramarua Pines',region:'NORTH ISLAND FOREST',theme:'forest',weather:'Low cloud',seed:347,width:7.5,grip:.83,sky:[.35,.43,.46],fog:[.53,.62,.60],grass:[.19,.30,.16],sun:[-.35,.8,.45],light:[.87,.94,1],wet:.12,amplitude:20,base:40,target:139,
    description:'A narrow ribbon through tall pines. Linked corners, loose shoulders and no room for an ambitious cut.',
    legs:[[140,0],[140,.95],[160,-1.2],[150,.8],[120,1],[150,-1.5],[180,.9],[120,-.8],[160,.7],[160,-1.1],[170,1.3],[190,-.7],[190,.7],[160,-.8],[160,0]]},
  {id:'waipu',name:'Waipu Gorge',region:'NORTHLAND',theme:'gorge',weather:'Bright overcast',seed:461,width:7.7,grip:.86,sky:[.38,.55,.61],fog:[.66,.74,.70],grass:[.28,.37,.21],sun:[.55,.65,-.4],light:[1,.96,.86],wet:0,amplitude:38,base:60,target:153,
    description:'Rock faces, steep grades and two switchbacks. Brake in a straight line, then rotate the car on entry.',
    legs:[[170,0],[170,.6],[160,-.8],[190,1.1],[120,-1.4],[180,.75],[130,-1.5],[150,1.5],[190,.6],[140,-1.1],[170,.6],[140,-1.3],[150,1.3],[180,-.8],[200,.6],[180,0]]},
  {id:'raglan',name:'Raglan Ridge',region:'WESTERN WAIKATO',theme:'ridge',weather:'Late afternoon',seed:577,width:8,grip:.85,sky:[.35,.49,.59],fog:[.73,.71,.62],grass:[.40,.43,.21],sun:[-.65,.32,-.4],light:[1,.79,.54],wet:0,amplitude:44,base:85,target:168,
    description:'Long views and quick changes of direction. Crests unload the suspension; keep the steering quiet as you land.',
    legs:[[190,0],[210,.8],[200,-1],[200,.9],[140,-1.2],[200,.6],[160,.8],[150,-1.35],[220,.85],[180,-.7],[200,.9],[170,-.8],[220,.9],[220,-.75],[180,.3],[160,0]]},
  {id:'riverhead',name:'Riverhead Twilight',region:'AUCKLAND FOREST',theme:'forest',weather:'Rain at dusk',seed:683,width:8,grip:.72,sky:[.095,.15,.22],fog:[.23,.31,.34],grass:[.16,.26,.18],sun:[.6,.20,.45],light:[.66,.75,1],wet:.92,amplitude:22,base:36,target:178,
    description:'The final test: wet gravel and fading light. Read the road early and be patient with the throttle.',
    legs:[[170,0],[160,-.8],[190,1],[170,-1.1],[190,.75],[150,1.1],[170,-1.2],[210,.6],[150,-1],[220,.9],[170,-.8],[220,.7],[190,-.8],[220,.65],[200,-.3],[180,0]]}
];
export function formatTime(t) { if (!Number.isFinite(t)) return '—'; const n=Math.max(0,Math.round(t*1000)); return `${Math.floor(n/60000)}:${String(Math.floor(n/1000)%60).padStart(2,'0')}.${String(n%1000).padStart(3,'0')}`; }
export function medal(time,target) { return time <= target ? 'GOLD' : time <= target*1.18 ? 'SILVER' : time <= target*1.4 ? 'BRONZE' : 'FINISHER'; }
export function naturalHeight(x,z,stage) { const a=stage.amplitude; return stage.base + a*(.55*Math.sin(x*.008+stage.seed)+.45*Math.sin(z*.006)+.3*Math.sin(x*.012+z*.005)) + 3*Math.sin(x*.028-z*.014); }
export class Stage {
  constructor(def) {
    this.def=def; this.points=[]; this.grid=new Map(); this.obstacles=[]; this.notes=[];
    let x=0,z=0,s=0,heading=0;
    this.points.push({x,z,s,y:naturalHeight(x,z,def),heading,curvature:0});
    def.legs.forEach(([length,turn])=>{
      const n=Math.ceil(length/4), ds=length/n, initial=heading;
      for(let i=1;i<=n;i++) {
        const t=i/n, next=initial+turn*(t-Math.sin(t*2*Math.PI)/(2*Math.PI));
        const mid=(next+heading)/2;
        x+=Math.sin(mid)*ds; z+=Math.cos(mid)*ds; s+=ds;
        this.points.push({x,z,s,y:naturalHeight(x,z,def),heading:next,curvature:angle(next-heading)/ds}); heading=next;
      }
    });
    this.length=s; this.finish=s-24;
    // Smooth road elevation; no discontinuities at segment boundaries.
    const ys=this.points.map(p=>p.y);
    this.points.forEach((p,i)=>{ let sum=0,w=0; for(let j=-8;j<=8;j++){const k=clamp(i+j,0,ys.length-1),v=9-Math.abs(j);sum+=ys[k]*v;w+=v;}p.y=sum/w; p.bank=clamp(-p.curvature*7,-.08,.08); const key=this.key(p.x,p.z);if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push(i); });
    this.checkpoints=[this.finish/4,this.finish/2,this.finish*3/4,this.finish];
    let legStart=0;
    for(const [length,turn] of def.legs) {
      if(Math.abs(turn)>.2) {
        const curve=Math.abs(turn)*2/length;
        const grade=curve>.02?1:curve>.014?2:curve>.010?3:curve>.007?4:5;
        this.notes.push({s:legStart+length*.28,end:legStart+length*.92,dir:turn>0?'RIGHT':'LEFT',grade,text:`${turn>0?'Right':'Left'} ${grade}${Math.abs(turn)>1.25?', tightens':''}`});
      }
      legStart+=length;
    }
    const rng=random(def.seed);
    // Shared, deterministic collision geometry and visible scenery.
    for(let at=30;at<this.finish;at+=def.theme==='forest'?4:9) {
      const p=this.at(at);
      for(const side of [-1,1]) {
        if(rng()<.12) continue;
        const off=side*(def.width/2+4+rng()*62), xx=p.x+Math.cos(p.heading)*off,zz=p.z-Math.sin(p.heading)*off;
        const n=this.nearest(xx,zz);
        if(n.distance<def.width/2+3)continue;
        if(def.theme==='coast' && side<0 && Math.abs(off)>30) continue;
        const tree=rng()<(def.theme==='forest'?.94:.4), scale=tree?(.75+rng()*1.5):(.5+rng()*1.4);
        this.obstacles.push({x:xx,z:zz,y:this.ground(xx,zz),scale,rotation:rng()*Math.PI*2,type:tree?'tree':'rock',radius:tree?.4*scale:.9*scale,s:at,tint:.8+rng()*.4});
      }
    }
  }
  key(x,z) { return `${Math.floor(x/64)},${Math.floor(z/64)}`; }
  at(s) {
    s=clamp(s,0,this.length); let low=0,high=this.points.length-1;
    while(high-low>1){const m=(low+high)>>1;if(this.points[m].s<s)low=m;else high=m;}
    const a=this.points[low],b=this.points[high],t=clamp((s-a.s)/(b.s-a.s||1),0,1);
    return {x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),z:mix(a.z,b.z,t),s,heading:a.heading+angle(b.heading-a.heading)*t,curvature:mix(a.curvature,b.curvature,t),bank:mix(a.bank,b.bank,t)};
  }
  nearest(x,z,hint=null) {
    const candidates=new Set(),gx=Math.floor(x/64),gz=Math.floor(z/64);
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const bucket=this.grid.get(`${gx+dx},${gz+dz}`);if(bucket)for(const i of bucket){candidates.add(i);if(i>0)candidates.add(i-1);}}
    // Off-course rescue/search and terrain construction need a global fallback.
    if(!candidates.size)for(let i=0;i<this.points.length-1;i++)candidates.add(i);
    let best=null, bestScore=Infinity;
    for(const i of candidates){const a=this.points[i],b=this.points[i+1];if(!b)continue;const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),xx=mix(a.x,b.x,t),zz=mix(a.z,b.z,t),d2=(x-xx)**2+(z-zz)**2;
      const ss=mix(a.s,b.s,t),score=d2+(hint===null?0:Math.max(0,Math.abs(ss-hint)-100)**2*.1);
      if(score<bestScore){bestScore=score;const h=a.heading+angle(b.heading-a.heading)*t;best={x:xx,z:zz,y:mix(a.y,b.y,t),s:ss,heading:h,bank:mix(a.bank,b.bank,t),distance:Math.sqrt(d2),offset:(x-xx)*Math.cos(h)-(z-zz)*Math.sin(h)};}
    }
    return best;
  }
  ground(x,z,nearest=null) {
    const n=nearest||this.nearest(x,z), d=n.distance, half=this.def.width/2;
    const road=n.y+n.offset*n.bank;
    let height=mix(road,naturalHeight(x,z,this.def),smooth(half+1,half+36,d));
    if(this.def.theme==='coast')height-=smooth(24,180,-n.offset)*72;
    if(this.def.theme==='gorge')height+=smooth(half+2,half+19,n.offset)*(1-smooth(half+30,half+95,n.offset))*28*(.75+.25*Math.sin(n.s*.006));
    return height;
  }
}
export class Vehicle {
  constructor(stage,car,damage=0) { this.stage=stage;this.car=car;this.damage=clamp(damage,0,100);this.elapsed=0;this.penalty=0;this.checkpoint=0;this.splits=[];this.finished=false;this.cooldown=0;this.shiftCooldown=0;this.gear=1;this.rpm=1000;this.steering=0;this.travel=0;this.reset(false,8); }
  reset(penalise=true,at=null) {
    // Recovery cannot skip an unearned control. It is deliberately costly.
    const lastGate=this.checkpoint?this.stage.checkpoints[this.checkpoint-1]:8;
    const s=at===null?clamp(this.progress-8,lastGate,this.stage.checkpoints[this.checkpoint]-12):at;
    const p=this.stage.at(s);
    this.x=p.x;this.z=p.z;this.y=p.y+.62;this.yaw=p.heading;this.vx=0;this.vz=0;this.vy=0;this.yawRate=0;this.speed=0;this.progress=s;this.previousProgress=s;this.pitch=0;this.roll=0;this.slip=0;this.offroad=false;this.surface='GRAVEL';this.airborne=false;this.reverseHold=0;this.cooldown=1;this.lastImpact=0;this.lastGround=p.y;
    if(penalise)this.penalty+=5;
  }
  shift(direction) { if(this.shiftCooldown>0)return;this.gear=clamp(this.gear+direction,1,6);this.shiftCooldown=.2; }
  step(input,dt=1/120,options={}) {
    if(this.finished||!Number.isFinite(dt)||dt<=0)return;
    dt=clamp(dt,0,1/30);this.elapsed+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.shiftCooldown=Math.max(0,this.shiftCooldown-dt);this.lastImpact=0;
    const c=this.car,stage=this.stage,sy=Math.sin(this.yaw),cy=Math.cos(this.yaw);
    let u=this.vx*sy+this.vz*cy, v=this.vx*cy-this.vz*sy;
    const speed=Math.hypot(this.vx,this.vz),n=stage.nearest(this.x,this.z,this.progress),off=n.distance>stage.def.width/2;
    this.offroad=off;this.surface=off?'VERGE':stage.def.wet>.5?'WET GRAVEL':'GRAVEL';
    const steer=clamp(Number(input.steer)||0,-1,1),throttle=clamp(Number(input.throttle)||0,0,1),brake=clamp(Number(input.brake)||0,0,1),hb=input.handbrake?1:0;
    this.steering=mix(this.steering,steer*(.52/(1+Math.abs(u)*.023)),1-Math.exp(-dt*8));
    this.reverseHold=brake>.3&&Math.abs(u)<1.5?this.reverseHold+dt:0;
    const reverse=(this.reverseHold>.45 || u<-.5)&&brake>.3&&throttle<.1;
    const damageFactor=1-this.damage*.004,mu=stage.def.grip*c.grip*(off?.55:1)*(options.assists===false?1:1.06);
    // Gear ratio and a broad torque curve matter, including a soft rev limiter.
    const gearing=c.gears[this.gear]*3.8,engineRPM=Math.max(2700,Math.abs(u)/(.34*2*Math.PI)*60*gearing);
    const torque=c.power/(6500*2*Math.PI/60)*(.68+.32*Math.sin(clamp((engineRPM-1200)/7200,0,1)*Math.PI));
    let drive=throttle*Math.min(9500,torque*gearing*.88/.34,c.power*.80/Math.max(12,Math.abs(u)))*damageFactor*(engineRPM>7600?.12:1);
    if(reverse)drive=-Math.min(3000,brake*3600)*(1-clamp(-u/12,0,1));
    const braking=reverse?0:brake*mu*c.mass*10.8;
    const drag=(off?470+speed*45:170)+.43*speed*speed;
    let longitudinal=drive-Math.sign(u)*(drag+braking+hb*c.mass*2.2);
    if(Math.abs(u)<.15 && Math.abs(drive)<drag)longitudinal=-u*c.mass/dt;
    if(u>c.maxSpeed)longitudinal-= (u-c.maxSpeed)*900;
    const frontLoad=c.mass*9.81*c.front,rearLoad=c.mass*9.81*(1-c.front);
    const frontLimit=frontLoad*mu*(1-brake*.25),rearLimit=rearLoad*mu*c.rearGrip*(1-hb*.72)*(c.drive==='RWD'?1-throttle*.19:1);
    const den=Math.max(3,Math.abs(u)),lf=c.wheelbase*(1-c.front),lr=c.wheelbase*c.front;
    const frontSlip=Math.atan2(v+this.yawRate*lf,den)-this.steering*Math.sign(u||1),rearSlip=Math.atan2(v-this.yawRate*lr,den);
    const fFront=-frontLimit*Math.tanh(frontSlip*9),fRear=-rearLimit*Math.tanh(rearSlip*10);
    const gripContact=this.airborne?.10:1;
    let lateral=(fFront+fRear)*gripContact;
    this.yawRate+=(lf*fFront-lr*fRear)/(c.mass*c.wheelbase*c.wheelbase*.25)*dt*gripContact;
    this.yawRate*=Math.exp(-dt*(options.assists===false?.6:1.2));
    if(Math.abs(u)<6)this.yawRate=mix(this.yawRate,u*Math.tan(this.steering)/c.wheelbase,dt*8);
    this.yawRate=clamp(this.yawRate,-2.2,2.2);
    const ahead=stage.ground(this.x+sy*2,this.z+cy*2),behind=stage.ground(this.x-sy*2,this.z-cy*2),slope=(ahead-behind)/4;
    longitudinal-=c.mass*9.81*slope;
    this.vx+=(sy*longitudinal+cy*lateral)/c.mass*dt;
    this.vz+=(cy*longitudinal-sy*lateral)/c.mass*dt;
    // Prevent numerical sign reversal from stationary brake/rolling resistance.
    const newU=this.vx*sy+this.vz*cy;
    if(!reverse && throttle<.02 && u*newU<0 && Math.abs(u)<.5){this.vx-=sy*newU;this.vz-=cy*newU;}
    this.yaw=angle(this.yaw+this.yawRate*dt);
    this.x+=this.vx*dt;this.z+=this.vz*dt;
    const nearest=stage.nearest(this.x,this.z,this.progress),ground=stage.ground(this.x,this.z,nearest),target=ground+.62;
    const compression=target-this.y;
    // Damp suspension travel, not absolute vertical velocity. A downhill road
    // moves the tyre contact patch; damping world velocity caused false jumps.
    const groundVelocity=clamp((ground-this.lastGround)/Math.max(dt,1e-6),-20,20);this.lastGround=ground;
    if(compression>-.12){this.vy+=(compression*130-(this.vy-groundVelocity)*13-2)*dt;this.airborne=false;}else{this.vy-=9.81*dt;this.airborne=true;}
    this.y+=this.vy*dt;
    if(this.y<ground+.43){if(this.vy<-5)this.impact(-this.vy*.7);this.y=ground+.43;this.vy=Math.max(0,-this.vy*.12);this.airborne=false;}
    this.pitch=mix(this.pitch,Math.atan(slope),1-Math.exp(-dt*10));
    this.roll=mix(this.roll,clamp(-lateral/c.mass*.016+nearest.bank,-.22,.22),1-Math.exp(-dt*9));
    for(const o of stage.obstacles){if(Math.abs(o.s-nearest.s)>100)continue;const dx=this.x-o.x,dz=this.z-o.z,r=o.radius+.9,d2=dx*dx+dz*dz;
      if(d2<r*r && this.y<o.y+(o.type==='tree'?6:o.scale*2)){
        const d=Math.sqrt(d2)||.001,nx=d2?dx/d:1,nz=d2?dz/d:0;this.x=o.x+nx*r;this.z=o.z+nz*r;
        const vn=this.vx*nx+this.vz*nz;
        if(vn<0){this.vx-=nx*vn*1.2;this.vz-=nz*vn*1.2;this.yawRate+=clamp(vn*.015,-.45,.45);this.impact(-vn);}
      }
    }
    this.previousProgress=this.progress;this.progress=nearest.s;this.travel+=speed*dt;
    // A checkpoint is a finite transverse gate, not simply a distance threshold.
    const gateS=stage.checkpoints[this.checkpoint],gate=stage.at(gateS),along=(this.x-gate.x)*Math.sin(gate.heading)+(this.z-gate.z)*Math.cos(gate.heading),across=(this.x-gate.x)*Math.cos(gate.heading)-(this.z-gate.z)*Math.sin(gate.heading);
    if(this.previousProgress<gateS && this.progress>=gateS && along>=-.1 && Math.abs(across)<stage.def.width/2+2){this.splits.push(this.elapsed+this.penalty);this.checkpoint++;if(this.checkpoint===stage.checkpoints.length)this.finished=true;}
    if(nearest.distance>65 || this.y<-30){this.reset(true);}
    this.speed=this.vx*Math.sin(this.yaw)+this.vz*Math.cos(this.yaw);
    this.slip=clamp((Math.abs(frontSlip)+Math.abs(rearSlip))*.8+hb*.7+(off?.25:0),0,1);
    const wheelRPM=Math.abs(this.speed)/(2*Math.PI*.34)*60;
    this.rpm=clamp(950+wheelRPM*c.gears[this.gear]*3.8+throttle*350,950,7800);
    if(options.automatic!==false&&this.shiftCooldown===0){if(this.rpm>6700)this.shift(1);else if(this.rpm<2800&&this.gear>1)this.shift(-1);}
    this.reverse=reverse;
  }
  impact(speed) { if(speed>2&&this.cooldown===0){this.damage=clamp(this.damage+(speed-2)*1.4,0,100);this.lastImpact=speed;this.cooldown=.45;} }
  get total() { return this.elapsed+this.penalty; }
}
export function nextNote(stage,progress,speed=0) { const look=Math.max(65,Math.abs(speed)*3.7);return stage.notes.find(n=>n.end>progress+8&&n.s<progress+look)||null; }
export function ghostPose(samples,time) { if(!samples?.length||time<samples[0][0]||time>samples.at(-1)[0])return null;let lo=0,hi=samples.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(samples[m][0]<time)lo=m;else hi=m;}const a=samples[lo],b=samples[hi],t=clamp((time-a[0])/(b[0]-a[0]||1),0,1);return {x:mix(a[1],b[1],t),y:mix(a[2],b[2],t),z:mix(a[3],b[3],t),yaw:a[4]+angle(b[4]-a[4])*t,pitch:mix(a[5]||0,b[5]||0,t),roll:mix(a[6]||0,b[6]||0,t)}; }
export class Records {
  constructor(storage) { this.storage=storage;this.warning=''; }
  key(stage,car,assists=true) { return `southern-cross.v1.${stage}.${car}.${assists?'assist':'sport'}`; }
  read(stage,car,assists=true) { try { const r=JSON.parse(this.storage?.getItem(this.key(stage,car,assists))||'null');if(!r||!Number.isFinite(r.time)||r.time<=0)return null;if(!Array.isArray(r.samples)||r.samples.length>18000||r.samples.some((s,i)=>!Array.isArray(s)||s.length<5||!s.every(Number.isFinite)||(i>0&&s[0]<=r.samples[i-1][0])))r.samples=[];return r; } catch {return null;} }
  save(stage,car,time,samples,assists=true) {
    const old=this.read(stage,car,assists);if(!Number.isFinite(time)||time<=0||old&&old.time<=time)return false;
    try { if(!this.storage)throw new Error('Storage unavailable');this.warning='';this.storage.setItem(this.key(stage,car,assists),JSON.stringify({time,samples,date:new Date().toISOString()}));return true; }
    catch {this.warning='Storage is full or unavailable. This result was not saved.';return false;}
  }
}
