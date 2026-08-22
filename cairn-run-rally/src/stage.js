import { clamp, hash01, lerp, smoothstep, wrapAngle } from './math.js';
import { KESTREL_STAGE } from './content.js';
export const SAMPLE_SPACING = 4;
const clone = value => {
 if (value === null || typeof value !== 'object') return value;
 if (Array.isArray(value)) return value.map(clone);
 return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
};
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
 const routeIdentity=clone(stageDefinition.routeIdentity||{}),hazardPlan=clone(stageDefinition.hazardPlan||{seed:stageDefinition.hazardSeed,exclusions:stageDefinition.hazardExclusions});
 const stage={
  id:stageDefinition.id,
  regionId:stageDefinition.regionId,
  name:stageDefinition.name,
  length:distance,
  samples,
  segments,
  notes,
  splits,
  expectedDurationSeconds:[...stageDefinition.expectedDurationSeconds],
  landmarkIds:[...stageDefinition.landmarkIds],
  hazardPlan,
  hazardSeed:hazardPlan.seed,
  hazardExclusions:clone(hazardPlan.exclusions||[]),
  barrierPlan:clone(stageDefinition.barrierPlan||[]),
  routeIdentity,
  identityTags:[...(stageDefinition.identityTags||routeIdentity.tags||[])],
  signatureSequences:clone(stageDefinition.signatureSequences||[]),
  difficultyArc:clone(stageDefinition.difficultyArc||[]),
  finishRun:clone(stageDefinition.finishRun||null)
 };
 stage.hazards=buildHazards(stage);stage.barriers=buildBarrierColliders(stage);stage.colliders=[...stage.hazards,...stage.barriers];return stage;
}

function buildHazards(stage){
 const out=[],plan=stage.hazardPlan||{},excluded=Array.isArray(plan.exclusions)?plan.exclusions:[],start=Number.isInteger(plan.sampleStart)?plan.sampleStart:18,endMargin=Number.isInteger(plan.sampleEndMargin)?plan.sampleEndMargin:18,step=Number.isInteger(plan.sampleStep)&&plan.sampleStep>0?plan.sampleStep:7,skipSeed=Number.isInteger(plan.skipSeed)?plan.skipSeed:92821,seed=Number.isInteger(plan.seed)?plan.seed:17,skipThreshold=Number.isFinite(plan.skipThreshold)?plan.skipThreshold:.42,sideSeed=Number.isInteger(plan.sideSeed)?plan.sideSeed:31337,sideSalt=Number.isInteger(plan.sideSalt)?plan.sideSalt:9,offsetSeed=Number.isInteger(plan.offsetSeed)?plan.offsetSeed:7717,offsetSalt=Number.isInteger(plan.offsetSalt)?plan.offsetSalt:3,typeSeed=Number.isInteger(plan.typeSeed)?plan.typeSeed:17713,typeSalt=Number.isInteger(plan.typeSalt)?plan.typeSalt:31,minOffset=Number.isFinite(plan.minOffsetM)?plan.minOffsetM:3.2,offsetJitter=Number.isFinite(plan.offsetJitterM)?plan.offsetJitterM:8.5,rockThreshold=Number.isFinite(plan.rockThreshold)?plan.rockThreshold:.87,treeThreshold=Number.isFinite(plan.treeThreshold)?plan.treeThreshold:.62;
 for(let i=start;i<stage.samples.length-endMargin;i+=step){const s=stage.samples[i];if(excluded.some(r=>s.s>=r[0]&&s.s<=r[1]))continue;if(hash01(i*skipSeed+seed)<skipThreshold)continue;const side=hash01(i*sideSeed+sideSalt)<.5?-1:1,offset=s.width/2+minOffset+hash01(i*offsetSeed+offsetSalt)*offsetJitter,rx=Math.cos(s.heading),rz=-Math.sin(s.heading),r=hash01(i*typeSeed+typeSalt),type=r>rockThreshold?'rock':r>treeThreshold?'tree':'post';out.push({id:out.length,sampleIndex:i,s:s.s,x:s.x+rx*offset*side,y:s.y,z:s.z+rz*offset*side,radius:type==='rock'?1.2:type==='tree'?.78:.58,type,side});}
 return out;
}

function buildBarrierColliders(stage){
 const out=[],add=(distance,side,offset,radius,type,yOffset=.12)=>{const sample=sampleStage(stage,distance),point=roadEdgePoint(sample,side*(sample.width/2+offset),yOffset);out.push({id:`${type}-${out.length}`,s:distance,x:point.x,y:point.y,z:point.z,radius,type,side});};
 const addRange=spec=>{const start=Number(spec.startM),end=Number(spec.endM),step=Number(spec.stepM);if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(step)||step<=0)return;for(let distance=start;distance<=end+1e-9;distance+=step){for(const side of spec.bothSides?[-1,1]:[spec.side??1])add(distance,side,spec.offsetM??0,spec.radiusM??.5,spec.type,spec.yOffsetM??.12);}};
 const addAnchors=spec=>{const centers=Array.isArray(spec.anchorsM)?spec.anchorsM:[spec.centerM];for(const center of centers){const count=Number.isInteger(spec.count)&&spec.count>0?spec.count:1,spacing=Number.isFinite(spec.spacingM)?spec.spacingM:0;for(let n=0;n<count;n++){const distance=center+(n-(count-1)/2)*spacing;for(const side of spec.bothSides?[-1,1]:[spec.side??1])add(distance,side,spec.offsetM??0,spec.radiusM??.5,spec.type,spec.yOffsetM??.12);}}};
 for(const spec of Array.isArray(stage.barrierPlan)?stage.barrierPlan:[]){if(Number.isFinite(spec.startM)&&Number.isFinite(spec.endM))addRange(spec);else if(Number.isFinite(spec.centerM)||Array.isArray(spec.anchorsM))addAnchors(spec);else if(Array.isArray(spec.distancesM))for(const distance of spec.distancesM)for(const side of spec.bothSides?[-1,1]:[spec.side??1])add(distance,side,spec.offsetM??0,spec.radiusM??.5,spec.type,spec.yOffsetM??.12);}
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
export function requiredFeatureCoverage(stage){const names=stage.segments.map(s=>s.name.toLowerCase()).join(' '),coverage={straight:names.includes('straight')||names.includes('chute'),fastBend:names.includes('six')||names.includes('five long'),mediumBend:names.includes('four')||names.includes('five'),hairpin:stage.segments.some(s=>s.feature==='hairpin'),crest:stage.segments.some(s=>s.feature==='crest'),dip:stage.segments.some(s=>s.feature==='dip'),brakingZone:names.includes('braking'),looseSurface:stage.segments.some(s=>s.surface==='loose')};if(stage.segments.some(s=>s.feature==='jump'))coverage.jump=true;return coverage;}
export const STAGE_SEGMENTS=SEGMENTS.map(s=>({...s,curve:[...s.curve]}));export const STAGE_NOTES=NOTES.map(n=>({...n}));
