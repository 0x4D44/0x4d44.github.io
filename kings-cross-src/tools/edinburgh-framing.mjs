// Offline EB framing only. Mapped platform polygons constrain every camera;
// no scene visibility/material or train placement changes are made here.
import { trainBounds, setCaptureView, inspectTrainFrame, intersectCaptureRay } from './train-framing.mjs';

function inside(x,z,ring) {
  let yes=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++)if((ring[i][1]>z)!==(ring[j][1]>z)&&x<(ring[j][0]-ring[i][0])*(z-ring[i][1])/(ring[j][1]-ring[i][1])+ring[i][0])yes=!yes;
  return yes;
}
function nearest(x,z,ring) {
  let best={distance:Infinity};
  for(let i=0;i<ring.length;i++) {
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(!length)continue;
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(length*length))),point=[a[0]+t*dx,a[1]+t*dz];
    const distance=Math.hypot(point[0]-x,point[1]-z);
    if(distance<best.distance)best={distance,point,axis:[dx/length,dz/length]};
  }
  return best;
}
const onPlatform=(x,z,ring,margin=.6)=>inside(x,z,ring)&&nearest(x,z,ring).distance>=margin;
const PLATFORM_Y=.915; // Same explicitly assumed preview datum as waverley-scene.ts.

/** Physical platform proximity is independent of private berth associations. */
export function besideMappedPlatform(point,platforms) {
  return platforms.some(p=>!inside(point[0],point[1],p.path)&&nearest(point[0],point[1],p.path).distance<=8);
}

/** Stand back along an adjacent platform, using its width rather than standing on another track. */
export function platformCameraCandidates(T,coach,platforms) {
  coach.updateWorldMatrix(true,true);
  const bounds=trainBounds(T,coach),centre=bounds.getCenter(new T.Vector3());
  const axis=new T.Vector3(0,0,1).transformDirection(coach.matrixWorld),across=new T.Vector3(axis.z,0,-axis.x),out=[];
  for(const platform of platforms) {
    const edge=nearest(centre.x,centre.z,platform.path);
    if(edge.distance>8||inside(centre.x,centre.z,platform.path)||Math.abs(edge.axis[0]*axis.x+edge.axis[1]*axis.z)<.8)continue;
    const side=Math.sign((edge.point[0]-centre.x)*across.x+(edge.point[1]-centre.z)*across.z);
    if(!side)continue;
    // A visible six-metre platform patch beside the coach is part of the frame.
    let patch;
    for(const offset of [2,3,4,6,8]) {
      const p=new T.Vector3(edge.point[0],PLATFORM_Y,edge.point[1]).addScaledVector(across,side*offset);
      const samples=[[-.6,-3],[.6,-3],[.6,3],[-.6,3]].map(([u,v])=>p.clone().addScaledVector(across,u).addScaledVector(axis,v));
      if(samples.every(s=>onPlatform(s.x,s.z,platform.path,.1))){patch=samples;break;}
    }
    if(!patch)continue;
    for(const along of [0,-18,18,-26,26,-35,35,-45,45])for(const offset of [6,8,12,16,22,30,4]) {
      const position=centre.clone().addScaledVector(across,side*offset).addScaledVector(axis,along);position.y=PLATFORM_Y+2.4;
      if(!onPlatform(position.x,position.z,platform.path))continue;
      out.push({position:position.toArray(),target:[centre.x,1.9,centre.z],platform:{id:platform.id,ref:platform.ref??null,edgeDistanceM:edge.distance},patch:patch.map(p=>p.toArray())});
    }
  }
  return out;
}
function corners(T,bounds) {
  const points=[];
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])points.push(new T.Vector3(x,y,z));
  return points;
}
function visiblePlatform(T,scene,camera,patch) {
  const meshes=[];
  scene.traverseVisible(o=>{if(o.isMesh&&camera.layers.test(o.layers)&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m?.visible!==false&&m?.opacity!==0))meshes.push(o);});
  const ray=new T.Raycaster();
  for(const p of patch) {
    const delta=p.clone().sub(camera.position),distance=delta.length();ray.set(camera.position,delta.normalize());ray.near=.01;ray.far=distance+.08;
    const hit=intersectCaptureRay(T,ray,meshes)[0];
    if(!hit||Math.abs(hit.distance-distance)>.12)return false;
  }
  return true;
}

/** Full coach + mapped platform context; all normal strict train raycasts remain mandatory. */
export function platformCoachCamera(T,scene,camera,controls,coach,platforms,ground,candidate=0) {
  scene.updateMatrixWorld(true);
  const candidates=platformCameraCandidates(T,coach,platforms),failures=[];
  if(!candidates.length)throw new Error('no camera within an adjacent mapped platform');
  const bounds=trainBounds(T,coach),bodyCorners=corners(T,bounds);
  for(let i=candidate;i<candidates.length;i++) {
    const view=candidates[i];setCaptureView(T,camera,controls,view.position,view.target,55);
    const projected=bodyCorners.map(p=>p.clone().project(camera)),patch=view.patch.map(p=>new T.Vector3(...p)),platformProjected=patch.map(p=>p.clone().project(camera));
    const inFrame=(p,margin)=>Math.abs(p.x)<=margin&&Math.abs(p.y)<=margin&&p.z>-1&&p.z<1;
    if(!projected.every(p=>inFrame(p,.84))||!platformProjected.every(p=>inFrame(p,.9))){failures.push('whole coach or platform outside frame');continue;}
    // Include the entire facing coach surface, not a small neighbourhood of a window.
    const visibility=inspectTrainFrame(T,scene,camera,coach,ground,{detail:{includePoint:()=>true},minScreenSpan:.2,minVerticalSpan:.08});
    if(!visibility.clear){failures.push(visibility.reason);continue;}
    if(!visiblePlatform(T,scene,camera,patch)){failures.push('mapped platform patch occluded');continue;}
    return {position:camera.position.toArray(),target:view.target,fov:camera.fov,distanceM:camera.position.distanceTo(new T.Vector3(...view.target)),platform:view.platform,
      context:{coachCorners:projected.map(p=>p.toArray()),platformSamples:platformProjected.map(p=>p.toArray()),platformWorldSamples:view.patch,platformCameraHeightM:2.4,margin:.84},visibility,candidate:i,candidateCount:candidates.length};
  }
  throw Object.assign(new Error(`no clear full-coach platform frame: ${[...new Set(failures)].join('; ')}`),{details:{candidateCount:candidates.length,failures}});
}
