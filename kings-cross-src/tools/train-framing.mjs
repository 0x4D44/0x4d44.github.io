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

/** Exterior view into the unchanged drawn portal. The buried coach surface is expected hidden. */
export function portalTrainCamera(T,camera,controls,group,leading,ground,portal,candidate=0) {
  const follow=followTrainCamera(T,camera,controls,group,leading,ground,0),{origin,axis,across,bore}=portal;
  const target=[origin[0]+across[0]*bore.lateral+axis[0]*2,2.8,origin[1]+across[1]*bore.lateral+axis[1]*2];
  const side=candidate%2?-1:1,distance=[34,42,50][Math.floor(candidate/2)%3];
  const position=[target[0]-axis[0]*distance+across[0]*side*12,6,target[2]-axis[1]*distance+across[1]*side*12];
  const groundY=ground?.heightAt(position[0],position[2]);
  if(!Number.isFinite(groundY))throw new Error('portal camera scene terrain unavailable');
  position[1]=Math.max(position[1],groundY+.5);
  setCaptureView(T,camera,controls,position,target,55);
  const opening=[[-bore.width/2,0],[-bore.width/2,6],[bore.width/2,0],[bore.width/2,6]].map(([u,y])=>new T.Vector3(origin[0]+across[0]*(bore.lateral+u),y,origin[1]+across[1]*(bore.lateral+u)).project(camera));
  if(opening.some(p=>Math.abs(p.x)>.88||Math.abs(p.y)>.88||p.z<=-1||p.z>=1))throw new Error('portal opening outside close frame');
  const detail={includePoint:p=>{const w=(p.x-origin[0])*axis[0]+(p.z-origin[1])*axis[1];return w<-.3&&w>-28;}};
  return {coach:follow.coach,detail,camera:{position,target,fov:camera.fov,groundY,focusCoach:follow.coach.name,
    mode:'close view into Gasworks south; only exterior leading-coach surfaces ray-tested; inside portion expected hidden',openingNdc:opening.map(p=>p.toArray())}};
}
