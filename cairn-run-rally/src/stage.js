import { clamp, hash01, lerp, smoothstep, wrapAngle } from './math.js';
export const SAMPLE_SPACING = 4;
const SEGMENTS = [
 ['Launch straight',220,0,0,4,7.5,'compact'],
 ['Right six long',300,.00155,.00155,8,7.4,'compact'],
 ['First crest',190,0,0,13,7.2,'compact','crest'],
 ['Left five',240,-.0031,-.0031,-3,7,'compact'],
 ['Downhill chute',170,0,0,-14,7.1,'compact','dip'],
 ['Right four',210,.0045,.0045,-3,6.9,'compact'],
 ['Birch straight',130,0,0,2,7.2,'loose'],
 ['Left three tightens',180,-.0037,-.0065,4,6.8,'loose'],
 ['Stone wall braking zone',160,0,0,6,7,'compact'],
 ['Quarry hairpin right',140,.0192,.0192,1,7.8,'compact','hairpin'],
 ['Quarry exit climb',200,0,0,14,7,'compact'],
 ['Left six long',320,-.00165,-.00165,1,7.4,'compact'],
 ['Loose moor straight',220,.0002,.0002,1,7.4,'loose'],
 ['Right five over crest',250,.00265,.00265,14,7,'compact','crest'],
 ['Blind dip',170,0,0,-18,6.9,'compact','dip'],
 ['Left four',220,-.0044,-.0044,4,6.9,'compact'],
 ['Commitment straight',280,0,0,7,7.3,'compact'],
 ['Right three',170,.0059,.0059,-1,6.8,'compact'],
 ['Into left three',160,-.0062,-.0062,-2,6.7,'compact'],
 ['Bridge approach',140,0,0,-6,6.6,'compact'],
 ['Bridge hairpin left',135,-.0199,-.0199,1,7.7,'compact','hairpin'],
 ['Pine climb',220,0,0,17,6.9,'compact'],
 ['Right four tightens',200,.0037,.0061,3,6.7,'loose'],
 ['Ridge straight',220,0,0,2,7.3,'compact'],
 ['Left five long',300,-.0029,-.0029,-3,7.1,'compact'],
 ['Finish run',260,0,0,-9,7.6,'compact']
].map(([name,length,c0,c1,rise,width,surface,feature=null])=>({name,length,curve:[c0,c1],rise,width,surface,feature}));

const NOTES = [
 [220,'R6','RIGHT SIX LONG','80','right six long, eighty'],
 [520,'▲','OVER CREST','INTO LEFT FIVE','over crest, into left five'],
 [710,'L5','LEFT FIVE',"DON'T CUT","left five, don't cut"],
 [1120,'R4','RIGHT FOUR','130','right four, one hundred and thirty'],
 [1330,'!','CAUTION — LOOSE','LEFT THREE TIGHTENS','caution, loose gravel, left three tightens'],
 [1460,'L3','LEFT THREE','TIGHTENS TWO','left three, tightens two'],
 [1800,'HR','HAIRPIN RIGHT',"DON'T CUT","hairpin right, don't cut"],
 [2140,'L6','LEFT SIX LONG','320','left six long, three hundred and twenty'],
 [2460,'!','LOOSE GRAVEL','RIGHT FIVE OVER CREST','caution, loose gravel, right five over crest'],
 [2680,'R5','RIGHT FIVE','OVER CREST','right five, over crest'],
 [2930,'▽','DIP','INTO LEFT FOUR','dip, into left four'],
 [3320,'▲','FLAT OVER CREST','280','flat over crest, two hundred and eighty'],
 [3600,'R3','RIGHT THREE','INTO LEFT THREE','right three, into left three'],
 [3770,'L3','LEFT THREE','140','left three, one hundred and forty'],
 [4070,'!','NARROW BRIDGE','INTO HAIRPIN LEFT','narrow bridge, into hairpin left'],
 [4425,'R4','RIGHT FOUR','TIGHTENS THREE','right four, tightens three'],
 [4845,'L5','LEFT FIVE LONG','260 TO FINISH','left five long, two hundred and sixty, to finish'],
 [5320,'🏁','FINISH','THROUGH GATE','finish, through gate']
].map(([at,icon,main,detail,phrase],id)=>({at,icon,main,detail,phrase,id}));

export function buildStage(){
 const samples=[],segments=[];let x=0,z=0,heading=0,distance=0,elevation=0;
 for(let si=0;si<SEGMENTS.length;si++){
  const segment=SEGMENTS[si],start=distance,startY=elevation,count=Math.ceil(segment.length/SAMPLE_SPACING),step=segment.length/count;
  for(let j=0;j<count;j++){
   const t=j/count,e=smoothstep(0,1,t),curvature=lerp(segment.curve[0],segment.curve[1],e);
   const y=startY+segment.rise*e,grade=segment.rise/segment.length*6*t*(1-t),camber=clamp(-curvature*45,-.06,.06);
   samples.push({index:samples.length,s:distance,x,y,z,heading,width:segment.width,surface:segment.surface,curvature,grade,camber,segmentIndex:si,feature:segment.feature});
   heading=wrapAngle(heading+curvature*step);x+=Math.sin(heading)*step;z+=Math.cos(heading)*step;distance+=step;
  }
  elevation=startY+segment.rise;segments.push({index:si,name:segment.name,start,end:distance,surface:segment.surface,feature:segment.feature});
 }
 const last=SEGMENTS.at(-1);samples.push({index:samples.length,s:distance,x,y:elevation,z,heading,width:last.width,surface:last.surface,curvature:0,grade:0,camber:0,segmentIndex:SEGMENTS.length-1,feature:null});
 const stage={id:'kestrel-ridge',name:'Kestrel Ridge',length:distance,samples,segments,notes:NOTES.map(n=>({...n})),splits:[1800,3600,distance],expectedDurationSeconds:[205,310]};
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
export const STAGE_SEGMENTS=SEGMENTS.map(s=>({...s}));export const STAGE_NOTES=NOTES.map(n=>({...n}));
