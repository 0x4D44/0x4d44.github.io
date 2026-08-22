import { clamp, hash01, lerp, smoothstep, wrapAngle } from './math.js';
import { KESTREL_STAGE } from './content.js';
export const SAMPLE_SPACING = 4;
const SEGMENTS = KESTREL_STAGE.segments.map(segment => ({
  name: segment.name,
  length: segment.lengthM,
  curve: [...segment.curve],
  rise: segment.riseM,
  width: segment.widthM,
  surface: segment.surface,
  feature: segment.feature ?? null
}));
const NOTES = KESTREL_STAGE.notes.map(note => ({
  at: note.atM,
  icon: note.icon,
  main: note.main,
  detail: note.detail,
  phrase: note.phrase,
  id: note.id
}));

export function buildStage(stageDefinition = KESTREL_STAGE){
 const samples=[],segments=[];let x=0,z=0,heading=0,distance=0,elevation=0;
 const authoredSegments = stageDefinition.segments;
 for(let si=0;si<authoredSegments.length;si++){
  const segment=authoredSegments[si],length=segment.lengthM,start=distance,startY=elevation,count=Math.ceil(length/SAMPLE_SPACING),step=length/count;
  for(let j=0;j<count;j++){
   const t=j/count,e=smoothstep(0,1,t),curvature=lerp(segment.curve[0],segment.curve[1],e);
   const y=startY+segment.riseM*e,grade=segment.riseM/length*6*t*(1-t),camber=clamp(-curvature*45,-.06,.06);
   samples.push({index:samples.length,s:start+j*step,x,y,z,heading,width:segment.widthM,surface:segment.surface,curvature,grade,camber,segmentIndex:si,feature:segment.feature ?? null});
   heading=wrapAngle(heading+curvature*step);x+=Math.sin(heading)*step;z+=Math.cos(heading)*step;distance+=step;
  }
  distance=start+length;
  elevation=startY+segment.riseM;segments.push({index:si,name:segment.name,start,end:distance,surface:segment.surface,feature:segment.feature ?? null});
 }
 const last=authoredSegments.at(-1);samples.push({index:samples.length,s:distance,x,y:elevation,z,heading,width:last.widthM,surface:last.surface,curvature:0,grade:0,camber:0,segmentIndex:authoredSegments.length-1,feature:null});
 const notes=stageDefinition.notes.map(note=>({at:note.atM,icon:note.icon,main:note.main,detail:note.detail,phrase:note.phrase,id:note.id}));
 const splits=[...stageDefinition.splits];if(splits.length)splits[splits.length-1]=distance;
 const stage={id:stageDefinition.id,regionId:stageDefinition.regionId,name:stageDefinition.name,length:distance,samples,segments,notes,splits,expectedDurationSeconds:[...stageDefinition.expectedDurationSeconds],landmarkIds:[...stageDefinition.landmarkIds]};
 stage.hazards=buildHazards(stage);stage.barriers=buildBarrierColliders(stage);stage.colliders=[...stage.hazards,...stage.barriers];return stage;
}

function buildHazards(stage){
 const out=[],excluded=[[0,95],[1760,1980],[4020,4255],[5280,5410]];
 for(let i=18;i<stage.samples.length-18;i+=7){const s=stage.samples[i];if(excluded.some(r=>s.s>=r[0]&&s.s<=r[1]))continue;if(hash01(i*92821+17)<.42)continue;const side=hash01(i*31337+9)<.5?-1:1,offset=s.width/2+3.2+hash01(i*7717+3)*8.5,rx=Math.cos(s.heading),rz=-Math.sin(s.heading),r=hash01(i*17713+31),type=r>.87?'rock':r>.62?'tree':'post';out.push({id:out.length,sampleIndex:i,s:s.s,x:s.x+rx*offset*side,y:s.y,z:s.z+rz*offset*side,radius:type==='rock'?1.2:type==='tree'?.78:.58,type,side});}
 return out;
}

function buildBarrierColliders(stage){
 const out=[],add=(distance,side,offset,radius,type)=>{const sample=sampleStage(stage,distance),point=roadEdgePoint(sample,side*(sample.width/2+offset),.12);out.push({id:`${type}-${out.length}`,s:distance,x:point.x,y:point.y,z:point.z,radius,type,side});};
 for(let distance=1640;distance<=1800;distance+=5)add(distance,-1,2.15,.62,'wall');
 for(const zone of [{s:1815,side:-1},{s:4110,side:1}])for(let n=-4;n<=4;n++)add(zone.s+n*12,zone.side,2.6,.72,'barrier');
 for(let distance=3950;distance<=4075;distance+=7)for(const side of [-1,1])add(distance,side,.45,.48,'bridge-rail');
 return out;
}

function sampleIndexAtDistance(samples,s){
 let lo=0,hi=samples.length-1;
 while(lo+1<hi){const mid=(lo+hi)>>1;if(samples[mid].s<=s)lo=mid;else hi=mid;}
 return lo;
}
export function sampleStage(stage,distance){
 const s=clamp(distance,0,stage.length),lo=sampleIndexAtDistance(stage.samples,s),hi=Math.min(stage.samples.length-1,lo+1),a=stage.samples[lo],b=stage.samples[hi],t=clamp((s-a.s)/Math.max(.001,b.s-a.s),0,1);
 return {index:t<.5?lo:hi,s,x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t),heading:a.heading+wrapAngle(b.heading-a.heading)*t,width:lerp(a.width,b.width,t),surface:t<.5?a.surface:b.surface,curvature:lerp(a.curvature,b.curvature,t),grade:lerp(a.grade,b.grade,t),camber:lerp(a.camber,b.camber,t),segmentIndex:t<.5?a.segmentIndex:b.segmentIndex,feature:a.feature||b.feature};
}
export function nearestStagePoint(stage,x,z,hint=0,radius=55){
 const start=Math.max(0,hint-radius),end=Math.min(stage.samples.length-2,hint+radius);let best=null,bestD=Infinity;
 for(let i=start;i<=end;i++){
  const a=stage.samples[i],b=stage.samples[i+1],sx=b.x-a.x,sz=b.z-a.z,lengthSq=sx*sx+sz*sz,t=clamp(((x-a.x)*sx+(z-a.z)*sz)/Math.max(.001,lengthSq),0,1),px=lerp(a.x,b.x,t),pz=lerp(a.z,b.z,t),dx=x-px,dz=z-pz,d=dx*dx+dz*dz;
  if(d<bestD){bestD=d;best={a,b,t,index:t<.5?i:i+1,x:px,z:pz};}
 }
 if(!best){const a=stage.samples.at(-1);best={a,b:a,t:0,index:a.index,x:a.x,z:a.z};bestD=(x-a.x)**2+(z-a.z)**2;}
 const {a,b,t,index}=best,heading=a.heading+wrapAngle(b.heading-a.heading)*t,rx=Math.cos(heading),rz=-Math.sin(heading),dx=x-best.x,dz=z-best.z;
 return {index,s:lerp(a.s,b.s,t),x:best.x,y:lerp(a.y,b.y,t),z:best.z,heading,width:lerp(a.width,b.width,t),surface:t<.5?a.surface:b.surface,curvature:lerp(a.curvature,b.curvature,t),grade:lerp(a.grade,b.grade,t),camber:lerp(a.camber,b.camber,t),segmentIndex:t<.5?a.segmentIndex:b.segmentIndex,feature:a.feature||b.feature,lateral:dx*rx+dz*rz,distance:Math.sqrt(bestD)};
}
export function roadEdgePoint(sample,lateral,yOffset=0){const rx=Math.cos(sample.heading),rz=-Math.sin(sample.heading);return{x:sample.x+rx*lateral,y:sample.y+sample.camber*lateral+yOffset,z:sample.z+rz*lateral};}
export function requiredFeatureCoverage(stage){const names=stage.segments.map(s=>s.name.toLowerCase()).join(' ');return{straight:names.includes('straight')||names.includes('chute'),fastBend:names.includes('six')||names.includes('five long'),mediumBend:names.includes('four')||names.includes('five'),hairpin:stage.segments.some(s=>s.feature==='hairpin'),crest:stage.segments.some(s=>s.feature==='crest'),dip:stage.segments.some(s=>s.feature==='dip'),brakingZone:names.includes('braking'),looseSurface:stage.segments.some(s=>s.surface==='loose')};}
export const STAGE_SEGMENTS=SEGMENTS.map(s=>({...s,curve:[...s.curve]}));export const STAGE_NOTES=NOTES.map(n=>({...n}));
