// Capture-only geometry checks, shared with Node tests. No page hooks or scene edits.
const belongs = (object, group) => { for (let o = object; o; o = o.parent) if (o === group) return true; return false; };
function visibleMeshes(scene, camera) {
  const meshes = [];
  scene.traverseVisible(o => {
    if (o.isMesh && camera.layers.test(o.layers) && (Array.isArray(o.material) ? o.material : [o.material])
      .some(m => m?.visible !== false && m?.opacity !== 0)) meshes.push(o);
  });
  return meshes;
}
const rayChunks=new WeakMap();
/** Spatial broad phase for large merged meshes; triangle positions/materials remain exact. */
export function intersectCaptureRay(T,ray,meshes) {
  const hits=[];
  for(const mesh of meshes) {
    const geometry=mesh.geometry,positions=geometry.attributes.position,index=geometry.index;
    if(mesh.isInstancedMesh||Array.isArray(mesh.material)||geometry.drawRange.start!==0||geometry.drawRange.count<(index?.count??positions.count)||(index?.count??positions.count)<9000){
      if(!geometry.boundingBox)geometry.computeBoundingBox();mesh.raycast(ray,hits);continue;
    }
    let chunks=rayChunks.get(geometry);
    if(!chunks) {
      const cells=new Map(),n=index?.count??positions.count;
      for(let i=0;i+2<n;i+=3) {
        const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);
        const points=ids.map(j=>new T.Vector3().fromBufferAttribute(positions,j));
        const centre=points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1/3);
        const key=`${Math.floor(centre.x/24)}:${Math.floor(centre.z/24)}`;
        let cell=cells.get(key);if(!cell){cell={ids:[],box:new T.Box3()};cells.set(key,cell);}
        cell.ids.push(...ids);for(const point of points)cell.box.expandByPoint(point);
      }
      chunks=[...cells.values()].map(cell=>{
        const g=new T.BufferGeometry();g.setAttribute('position',positions);g.setIndex(cell.ids);
        g.boundingBox=cell.box;g.boundingSphere=cell.box.getBoundingSphere(new T.Sphere());return new T.Mesh(g,mesh.material);
      });rayChunks.set(geometry,chunks);
    }
    const localRay=ray.ray.clone().applyMatrix4(new T.Matrix4().copy(mesh.matrixWorld).invert());
    for(const proxy of chunks) {
      if(!localRay.intersectsBox(proxy.geometry.boundingBox))continue;
      proxy.material=mesh.material;proxy.matrixWorld.copy(mesh.matrixWorld);
      const found=[];proxy.raycast(ray,found);for(const hit of found){hit.object=mesh;hits.push(hit);}
    }
  }
  return hits.sort((a,b)=>a.distance-b.distance);
}
export function trainBounds(T, group) {
  const bounds = new T.Box3();
  group.traverseVisible(o => { if (o.isMesh) bounds.union(new T.Box3().setFromObject(o)); });
  if (bounds.isEmpty()) throw new Error('train has no visible geometry');
  return bounds;
}
function obstruction(hit, target, camera) {
  const chain = [];
  for (let o = hit.object; o; o = o.parent) chain.push({ name: o.name, type: o.type,
    userData: Object.fromEntries(Object.entries(o.userData ?? {}).filter(([,v]) => ['string','number','boolean'].includes(typeof v))) });
  return { reason: 'coach occluded', blocker: chain.map(o => o.name || o.type).reverse().join('/'),
    occluder: { chain, distanceM: hit.distance, targetDistanceM: camera.position.distanceTo(target),
      point: hit.point.toArray(), target: target.toArray(), camera: camera.position.toArray() } };
}
/** Triangle-centre samples lie on actual body surfaces, unlike empty bounding-box corners. */
function bodySamples(T, group, camera, detail) {
  const samples = [], maxY = trainBounds(T, group).max.y;
  group.traverseVisible(o => {
    if (!o.isMesh || !/^(body-shell|body-detail|cab-glass)$/.test(o.name)) return;
    const a = o.geometry.attributes.position, index = o.geometry.index;
    if (!a) return;
    const n = index ? index.count : a.count;
    const point = i => o.localToWorld(new T.Vector3().fromBufferAttribute(a, index ? index.getX(i) : i));
    for (let i = 0; i + 2 < n; i += 3) {
      const p = point(i), q = point(i+1), r = point(i+2), normal = q.clone().sub(p).cross(r.clone().sub(p));
      const centre = p.clone().add(q).add(r).multiplyScalar(1/3);
      if (normal.lengthSq() < 1e-10 || normal.normalize().dot(camera.position.clone().sub(centre).normalize()) < .45) continue;
      if (detail) {
        if (detail.focus && centre.distanceTo(detail.focus) > detail.radius) continue;
        if (detail.includePoint && !detail.includePoint(centre)) continue;
      } else if (centre.y < maxY - 2) continue;
      samples.push(centre);
    }
  });
  // Cover the sampled surface, not just one lucky clear window.
  return Array.from({length: Math.min(32, samples.length)}, (_,i) => samples[Math.floor(i * samples.length / Math.min(32,samples.length))]);
}
/** Uses the drawn terrain and external scene geometry, with named obstruction diagnostics. */
export function inspectTrainFrame(T, scene, camera, group, ground, { detail, minScreenSpan = .15, minVerticalSpan=0 } = {}) {
  scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const groundY = ground?.heightAt(camera.position.x, camera.position.z);
  if (groundY !== undefined && (!Number.isFinite(groundY) || camera.position.y < groundY + .25))
    return { clear: false, reason: 'camera below scene ground clearance', groundY };
  const bounds = trainBounds(T, group), points = bodySamples(T, group, camera, detail);
  if (points.length < 4) return { clear: false, reason: 'insufficient visible coach surface samples' };
  const projected = points.map(p=>p.clone().project(camera));
  if (projected.some(p=>Math.abs(p.x)>.91 || Math.abs(p.y)>.91 || p.z<=-1 || p.z>=1))
    return { clear:false, reason:'coach surface outside frame margin' };
  const span = Math.max(Math.max(...projected.map(p=>p.x))-Math.min(...projected.map(p=>p.x)),
    Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y)));
  if (span < minScreenSpan) return { clear:false, reason:'coach detail too small in frame' };
  const verticalSpan=Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y));
  if(verticalSpan<minVerticalSpan)return {clear:false,reason:'coach height too small in frame',verticalSpan};
  const meshes = visibleMeshes(scene, camera), ray = new T.Raycaster();
  for (const point of points) {
    const direction=point.clone().sub(camera.position), distance=direction.length();
    ray.set(camera.position,direction.normalize());ray.near=.01;ray.far=distance+.03;
    const hits=intersectCaptureRay(T,ray,meshes), own=hits.find(h=>belongs(h.object,group));
    const hit=hits.find(h=>!belongs(h.object,group)&&h.distance<Math.min(distance,own?.distance??distance)-.002);
    if(hit)return {clear:false,...obstruction(hit,point,camera)};
    if(!own)return {clear:false,reason:'sample has no visible train surface'};
  }
  return { clear:true, checkedSamples:points.length, groundY:groundY??null, screenSpan:span,verticalSpan,
    bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()} };
}
/** Follow the actual leading coach, not the union of an entire train's past and future track. */
export function followTrainCamera(T,camera,controls,group,leading,ground,candidate=0) {
  group.updateWorldMatrix(true,true);
  const nose=new T.Vector3(leading[0],1.8,leading[1]);
  const coaches=group.children.filter(o=>o.visible&&/^car-\d+$/.test(o.name));
  const coach=(coaches.length?coaches:[group]).sort((a,b)=>trainBounds(T,a).getCenter(new T.Vector3()).distanceTo(nose)-trainBounds(T,b).getCenter(new T.Vector3()).distanceTo(nose))[0];
  const bounds=trainBounds(T,coach),centre=bounds.getCenter(new T.Vector3());
  const back=centre.clone().sub(nose);back.y=0;if(back.lengthSq()<.1)back.set(0,0,1);back.normalize();
  const across=new T.Vector3(-back.z,0,back.x),side=candidate%2?-1:1;
  const target=centre.clone().addScaledVector(back,8);target.y=Math.max(1.8,centre.y);
  const distance=[42,52,64][Math.floor(candidate/2)%3];
  const position=target.clone().addScaledVector(across,side*distance).addScaledVector(back,-12);position.y+=distance*.32;
  const groundY=ground?.heightAt(position.x,position.z);
  if(groundY!==undefined&&!Number.isFinite(groundY))throw new Error('follow camera terrain unavailable');
  if(Number.isFinite(groundY))position.y=Math.max(position.y,groundY+.5);
  setCaptureView(T,camera,controls,position.toArray(),target.toArray(),55);
  return {coach,camera:{position:camera.position.toArray(),target:target.toArray(),fov:camera.fov,groundY:groundY??null,
    mode:'leading-coach follow; approximately two to three car lengths',focusCoach:coach.name,distanceM:position.distanceTo(target)}};
}
export function setCaptureView(T, camera, controls, position, target, fov) {
  controls.enableDamping=false;controls.minDistance=0;controls.maxPolarAngle=Math.PI;controls.update();
  camera.position.set(...position);camera.near=.03;camera.fov=fov;camera.lookAt(new T.Vector3(...target));camera.updateProjectionMatrix();
  controls.target.set(...target);controls.update();camera.updateMatrixWorld(true);
}
/** A constant camera for the whole sequence: union of measured occupied track plus buffer. */
export function sequenceCamera(T, camera, controls, corridor, ground, candidate=0) {
  const bounds=new T.Box3();for(const p of corridor)bounds.expandByPoint(new T.Vector3(...p));
  const target=bounds.getCenter(new T.Vector3());target.y+=1.5;
  const radius=Math.max(12,bounds.getSize(new T.Vector3()).length()/2);
  const side=candidate%2?-1:1, angle=[.7,1.0,1.3][Math.floor(candidate/2)%3];
  const position=target.clone().add(new T.Vector3(side*radius*1.9,radius*angle,radius*.5));
  const groundY=ground?.heightAt(position.x,position.z);if(Number.isFinite(groundY))position.y=Math.max(position.y,groundY+.5);
  setCaptureView(T,camera,controls,position.toArray(),target.toArray(),55);
  return {position:camera.position.toArray(),target:target.toArray(),fov:camera.fov,groundY:groundY??null};
}
/** At 3 m only a coach detail fits a normal lens: window/door/bogie area, not an entire 26 m car. */
export function detailCamera(T, scene, camera, controls, coach, ground, focusLocal, side=1) {
  scene.updateMatrixWorld(true);
  const box=trainBounds(T,coach), localBox=coach.getObjectByName('body-shell');
  if(!localBox)throw new Error('coach shell missing');
  localBox.geometry.computeBoundingBox();
  const b=localBox.geometry.boundingBox;
  const local=new T.Vector3(side>0?b.max.x:b.min.x,focusLocal[1],focusLocal[2]);
  const focus=coach.localToWorld(local),across=new T.Vector3(side,0,0).transformDirection(coach.matrixWorld);
  const position=focus.clone().addScaledVector(across,3);
  const groundY=ground?.heightAt(position.x,position.z);
  if(groundY!==undefined&&(!Number.isFinite(groundY)||position.y<groundY+.25))throw new Error('3 m detail camera below scene terrain; try another track');
  setCaptureView(T,camera,controls,position.toArray(),focus.toArray(),65);
  const detail={focus,radius:2.25};
  const visibility=inspectTrainFrame(T,scene,camera,coach,ground,{detail,minScreenSpan:.7});
  if(!visibility.clear)throw Object.assign(new Error(`3 m coach detail: ${visibility.reason}${visibility.blocker?' by '+visibility.blocker:''}`),{details:visibility});
  return {position:camera.position.toArray(),target:focus.toArray(),fov:camera.fov,distanceM:position.distanceTo(focus),
    focusLocal:local.toArray(),visibility,coachBounds:{min:box.min.toArray(),max:box.max.toArray()},detailRadiusM:detail.radius};
}

/** Fixed near-axis view of the final coaches; reject an early formation that cannot fit locally. */
export function portalTrainCamera(T,camera,controls,group,leading,ground,portal,candidate=0) {
  group.updateWorldMatrix(true,true);
  const {origin,axis,across,bore}=portal,bounds=new T.Box3(),points=[];
  group.traverseVisible(o=>{
    if(!o.isMesh||!/^(body-shell|body-detail|cab-glass)$/.test(o.name))return;
    const a=o.geometry.attributes.position;if(!a)return;
    for(let i=0;i<a.count;i++){
      const point=o.localToWorld(new T.Vector3().fromBufferAttribute(a,i));
      if(portalCoordinates(point,portal).w<=0){bounds.expandByPoint(point);points.push(point);}
    }
  });
  if(bounds.isEmpty())throw new Error('no exterior body for initial portal camera');
  for(const u of [-bore.width/2,bore.width/2])for(const y of [0,6]){
    const p=new T.Vector3(origin[0]+across[0]*(bore.lateral+u),y,origin[1]+across[1]*(bore.lateral+u));bounds.expandByPoint(p);points.push(p);
  }
  const target=bounds.getCenter(new T.Vector3()),side=candidate%2?-1:1,index=Math.floor(candidate/2)%3;
  const distance=[45,60,78][index],offset=[8,12,16][index];
  const position=new T.Vector3(origin[0]+across[0]*(bore.lateral+side*offset)-axis[0]*distance,0,
    origin[1]+across[1]*(bore.lateral+side*offset)-axis[1]*distance);
  const groundY=ground?.heightAt(position.x,position.z);
  if(!Number.isFinite(groundY))throw new Error('portal camera scene terrain unavailable');
  position.y=Math.max(3.5,groundY+.5);
  const fov=65;setCaptureView(T,camera,controls,position.toArray(),target.toArray(),fov);
  if(!points.every(p=>{const n=p.clone().project(camera);return Math.abs(n.x)<.84&&Math.abs(n.y)<.84&&n.z>-1&&n.z<1;}))
    throw new Error('exterior body cannot fit a close near-axis portal camera');
  return {camera:{position:position.toArray(),target:target.toArray(),fov,groundY,faceDistanceM:distance,lateralOffsetM:side*offset,
    mode:'fixed close near-axis final-coaches portal entry'}};
}

/** Portal coordinates refer to the drawn face, not the OSM mouth. */
function portalCoordinates(point,portal) {
  const dx=point.x-portal.origin[0],dz=point.z-portal.origin[1];
  return {w:dx*portal.axis[0]+dz*portal.axis[1],u:dx*portal.across[0]+dz*portal.across[1]-portal.bore.lateral};
}
function portalBodySamples(T,group,camera,portal) {
  const coaches=group.children.filter(o=>/^car-\d+$/.test(o.name)),samples=[];
  for(const coach of coaches.length?coaches:[group]) {
    const triangles=[];let lo=Infinity,hi=-Infinity;
    coach.traverse(o=>{
      if(!o.isMesh||!/^(body-shell|body-detail|cab-glass)$/.test(o.name))return;
      const a=o.geometry.attributes.position,index=o.geometry.index;if(!a)return;
      const point=i=>o.localToWorld(new T.Vector3().fromBufferAttribute(a,index?index.getX(i):i));
      let visible=camera.layers.test(o.layers)&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m?.visible!==false&&m?.opacity!==0);
      for(let parent=o;parent;parent=parent.parent)if(!parent.visible)visible=false;
      const split=(p,q,r,depth=0)=>{
        const ws=[p,q,r].map(v=>portalCoordinates(v,portal).w);
        lo=Math.min(lo,...ws);hi=Math.max(hi,...ws);
        const normal=q.clone().sub(p).cross(r.clone().sub(p));
        if(normal.lengthSq()<1e-10)return;
        const centre=p.clone().add(q).add(r).multiplyScalar(1/3);
        // Near-axis views still show long body sides at a shallow angle. Dropping those faces
        // repeats the end-cap sample for every bin and mismeasures the visible length.
        if(normal.normalize().dot(camera.position.clone().sub(centre).normalize())<=1e-6)return;
        if(Math.max(...ws)-Math.min(...ws)>2&&depth<4){
          const pq=p.clone().add(q).multiplyScalar(.5),qr=q.clone().add(r).multiplyScalar(.5),rp=r.clone().add(p).multiplyScalar(.5);
          for(const t of [[p,pq,rp],[pq,q,qr],[rp,qr,r],[pq,qr,rp]])split(...t,depth+1);return;
        }
        triangles.push({point:centre,w:portalCoordinates(centre,portal).w,visible,shell:o.name==='body-shell'});
      };
      for(let i=0;i+2<(index?.count??a.count);i+=3)split(point(i),point(i+1),point(i+2));
    });
    if(!triangles.length)continue;
    const count=Math.min(32,Math.max(1,Math.ceil((hi-lo)/2))),step=(hi-lo)/count;
    for(let i=0;i<count;i++) {
      const w=lo+(i+.5)*step;
      const best=triangles.reduce((a,b)=>Math.abs(b.w-w)+(b.shell?0:.3)<Math.abs(a.w-w)+(a.shell?0:.3)?b:a);
      samples.push({...best,lengthM:step,coach:coach.name});
    }
  }
  return samples;
}
/** Body visibility during physical entry: exterior stays visible, the deep interior must disappear. */
export function inspectPortalEntryFrame(T,scene,camera,group,ground,portal,{initial=false}={}) {
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const groundY=ground?.heightAt(camera.position.x,camera.position.z);
  const result={clear:false,reason:null,visibleLengthM:0,outsideLengthM:0,buriedVisibleLengthM:0,
    checkedSamples:0,groundY:groundY??null,track:null};
  const fail=(reason,extra={})=>({...result,reason,...extra});
  if(!Number.isFinite(groundY)||camera.position.y<groundY+.25)return fail('camera below scene ground clearance');
  const meshes=visibleMeshes(scene,camera),solid=meshes.filter(o=>(Array.isArray(o.material)?o.material:[o.material])
    .some(m=>m?.visible!==false&&m?.opacity!==0&&m?.depthTest!==false&&(!m?.transparent||m.opacity>=.98)));
  const exterior=solid.filter(o=>!belongs(o,group)),trainMeshes=meshes.filter(o=>belongs(o,group));
  const ray=new T.Raycaster(),inFrame=p=>{const n=p.clone().project(camera);return Math.abs(n.x)<.94&&Math.abs(n.y)<.94&&n.z>-1&&n.z<1;};
  const blocked=(point,occluders=solid)=>{
    const delta=point.clone().sub(camera.position),distance=delta.length();ray.set(camera.position,delta.normalize());ray.near=.01;ray.far=distance-.025;
    return intersectCaptureRay(T,ray,occluders)[0];
  };
  const samples=portalBodySamples(T,group,camera,portal);result.checkedSamples=samples.length;
  if(!samples.length)return fail('insufficient physical train body samples');
  let outsideFailure=null,buriedFailure=null;
  for(const sample of samples) {
    const {point,w,lengthM}=sample,outside=w<-.3,buried=w>8;
    if(outside)result.outsideLengthM+=lengthM;
    const hit=blocked(point,exterior),framed=inFrame(point);
    let own=false;
    if(sample.visible&&framed&&!hit){
      const delta=point.clone().sub(camera.position);ray.set(camera.position,delta.normalize());ray.near=.01;ray.far=point.distanceTo(camera.position)+.05;
      own=intersectCaptureRay(T,ray,trainMeshes).length>0;
    }
    const visible=sample.visible&&framed&&!hit&&own;
    if(visible)result.visibleLengthM+=lengthM;
    if(visible&&buried){result.buriedVisibleLengthM+=lengthM;buriedFailure??={point:point.toArray(),coach:sample.coach};}
    if(outside&&!visible)outsideFailure??={point:point.toArray(),coach:sample.coach,
      ...(hit?obstruction(hit,point,camera):{}),reason:!sample.visible||!own&&!hit&&framed?'exterior train body hidden':!framed?'exterior train body outside frame':'exterior train body occluded'};
  }
  if(outsideFailure)return fail(outsideFailure.reason,outsideFailure);
  if(buriedFailure)return fail('buried train body visible through tunnel cover',buriedFailure);
  if(initial) {
    if(result.outsideLengthM<=0)return fail('initial exterior train missing');
    const {origin,axis,across,bore}=portal;
    const opening=[[-bore.width/2,.2],[-bore.width/2,6],[bore.width/2,.2],[bore.width/2,6]].map(([u,y])=>new T.Vector3(origin[0]+across[0]*(bore.lateral+u),y,origin[1]+across[1]*(bore.lateral+u)));
    const projected=opening.map(p=>p.clone().project(camera));
    result.openingHeightNdc=Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y));
    if(!opening.every(inFrame)||result.openingHeightNdc<.035)return fail('portal opening outside frame or too small');
    const candidates=[];
    scene.traverseVisible(o=>{
      if(!o.isLineSegments||o.name!=='track-tunnel'||!camera.layers.test(o.layers))return;
      const material=o.material;if(Array.isArray(material)||material?.visible===false||material?.opacity===0||material?.depthTest===false)return;
      const a=o.geometry.attributes.position,index=o.geometry.index;if(!a)return;
      const n=index?.count??a.count,start=o.geometry.drawRange.start,end=Math.min(n,start+o.geometry.drawRange.count);
      for(let i=start;i+1<end;i+=2){
        const p=o.localToWorld(new T.Vector3().fromBufferAttribute(a,index?index.getX(i):i)),q=o.localToWorld(new T.Vector3().fromBufferAttribute(a,index?index.getX(i+1):i+1));
        const pw=portalCoordinates(p,portal).w,qw=portalCoordinates(q,portal).w;if(Math.abs(qw-pw)<1e-6)continue;
        const points=[2,4].map(w=>{const t=(w-pw)/(qw-pw);return t>=0&&t<=1?p.clone().lerp(q,t):null;});
        if(points.some(p=>!p||Math.abs(p.y)>.02||Math.abs(portalCoordinates(p,portal).u)>bore.width/2-.15))continue;
        candidates.push(points);
      }
    });
    const track=candidates.find(points=>points.every(p=>inFrame(p)&&!blocked(p,meshes)));
    result.track={candidateSegments:candidates.length,visible:!!track,points:track?.map(p=>p.toArray())??[]};
    if(!track)return fail('track not visibly continuing through selected portal aperture');
  }
  return {...result,clear:true};
}
