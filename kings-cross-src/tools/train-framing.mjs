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
  // Farther views shrink coach height below the strict follow-frame threshold and
  // keep the same shallow ray through platform screens. Closer, higher alternatives
  // look over furniture while preserving a readable leading coach.
  const index=Math.floor(candidate/2)%3,distance=[42,34,28][index];
  const position=target.clone().addScaledVector(across,side*distance).addScaledVector(back,-12);position.y+=distance*[.32,.48,.8][index];
  const groundY=ground?.heightAt(position.x,position.z);
  if(groundY!==undefined&&!Number.isFinite(groundY))throw new Error('follow camera terrain unavailable');
  if(Number.isFinite(groundY))position.y=Math.max(position.y,groundY+.5);
  setCaptureView(T,camera,controls,position.toArray(),target.toArray(),55);
  return {coach,camera:{position:camera.position.toArray(),target:target.toArray(),fov:camera.fov,groundY:groundY??null,
    mode:'leading-coach follow; approximately two to three car lengths',focusCoach:coach.name,distanceM:position.distanceTo(target)}};
}
/** `up` (default world +y) and `near` (default 0.03 m) are optional: a straight-down plan view needs its own up vector,
 * and a view hundreds of metres from the train needs a nearer-to-the-subject near plane for depth precision. */
export function setCaptureView(T, camera, controls, position, target, fov, up, near=.03) {
  controls.enableDamping=false;controls.minDistance=0;controls.maxPolarAngle=Math.PI;controls.update();
  camera.up.set(...(up??[0,1,0]));
  camera.position.set(...position);camera.near=near;camera.fov=fov;camera.lookAt(new T.Vector3(...target));camera.updateProjectionMatrix();
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

// ============================================================================================
// CATALOGUE (rubric-FROZEN-v1, views V01-V10), part 1: pure pose maths. Plain numbers in and out,
// no THREE, so the Node tests pin every pose and the page imports this very file.
// Train-local metres: x across (+x is the train's RIGHT), y above the rail head, the front nose at
// z = 0 and the body running to +z. A rear view reverses the train frame: (x, z) -> (-x, L - z).
// ============================================================================================
export const CATALOGUE = Object.freeze({
  rubric: 'rubric-FROZEN-v1',
  viewport: Object.freeze({ width: 1600, height: 1000, deviceScaleFactor: 1 }),
  aspect: 1.6,
  /** V04, V05 and the roof plan: the subject fills at most this fraction of the image width (8% margins). */
  fitFraction: .84,
  /** The page's ground plane (web/src/world.ts GROUND_Y). The capture stage copies the page's own track levels. */
  groundY: -0.2,
  gaugeM: 1.435,
  railHeadWidthM: .072,
  /** web/src/world.ts LIGHTS.sun.position: a directional light, so only its direction matters. */
  sunPosition: Object.freeze([-320, 520, 260]),
  /** How far (degrees) the sun sits off the camera's bearing, toward the specimen's nearest lateral axis. */
  sunOffsetDeg: 15,
  stationDistancesM: Object.freeze([25, 75, 150]),
  /** core/scene.ts PLATFORM_HEIGHT; the capture passes the real constant and a test pins the two equal. */
  platformHeightM: .9,
  eyeAbovePlatformM: 1.7,
});
/** Output suffixes of V01-V09 (the neutral specimen stage), in file order. Every kind gets every suffix, as OK, GAP or N/A. */
export const STAGE_VIEWS = Object.freeze([
  ['V01', ['nose-34-left', 'nose-34-right', 'rear-nose-34-left', 'rear-nose-34-right']],
  ['V02', ['front-3m', 'rear-3m']],
  ['V03', ['cab-side-3m', 'cab-side-3m-right', 'window-door-3m-left', 'window-door-3m-right']],
  ['V04', ['cab-car-side-left', 'cab-car-side-right', 'rear-cab-car-side-left', 'rear-cab-car-side-right', 'intermediate-car-side-left', 'intermediate-car-side-right']],
  ['V05', ['whole-side-left', 'whole-side-right']],
  ['V06', ['roof-front', 'roof-rear', 'roof-plan']],
  ['V07', ['bogie-motor', 'bogie-trailer', 'underframe']],
  ['V08', ['gangway', 'gangway-mid', 'coupling-low', 'unit-coupling', 'unit-coupling-low', 'unit-coupling-2', 'unit-coupling-2-low']],
  ['V09', ['lights-leading', 'lights-trailing']],
].map(([id, suffixes]) => Object.freeze([id, Object.freeze(suffixes)])));
export const STATION_VIEWS = Object.freeze(['station-25m', 'station-75m', 'station-150m', 'station-25m-coach', 'station-75m-coach', 'station-150m-coach']);
export const VIEW_IDS = Object.freeze([...STAGE_VIEWS.map(([id]) => id), 'V10']);

const D2R = Math.PI / 180;
/** Poses are frozen to a micrometre: no float noise in the manifest, and -0 never appears. */
const q6 = v => Math.round(v * 1e6) / 1e6 + 0;
const ceil3 = v => Math.ceil(v * 1000 - 1e-9) / 1000;
const wrap = a => { const t = 2 * Math.PI, r = ((a % t) + t) % t; return r > Math.PI ? r - t : r; };
const wrapDeg = a => wrap(a * D2R) / D2R;
const hypot3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const reverseFrame = (p, length) => [q6(-p[0]), q6(p[1]), q6(length - p[2])];
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
const flipBox = (b, L) => ({ min: [q6(-b.max[0]), b.min[1], q6(L - b.max[2])], max: [q6(-b.min[0]), b.max[1], q6(L - b.min[2])] });
/** Distance from a camera to a subject's near plane at which `extentM` spans `fraction` of the image width. */
export function fitDistance(extentM, fovDeg, aspect = CATALOGUE.aspect, fraction = CATALOGUE.fitFraction) {
  return extentM / (2 * Math.tan(fovDeg * D2R / 2) * aspect * fraction);
}
/**
 * Near plane for a view: a hundredth of the eye-to-focus distance, 3 cm to 4 m. A view hundreds of metres out keeps its depth precision
 * (about a centimetre at 400 m) and still draws the ground down to the bottom of the frame, which a larger near plane would clip away.
 */
export const catalogueNear = (eye, target) => Math.min(4, Math.max(.03, Math.round(hypot3(eye, target) * 10) / 1000));

/**
 * Rotate the specimen about the vertical axis so the sun stands at a fixed bearing from the camera: the
 * camera's bearing from the focus point is within `offsetDeg` of the sun's horizontal azimuth, the sun
 * nudged toward the specimen's nearest lateral axis so a nose three-quarter view lights its front and its
 * cheek alike. A straight-down plan view has no bearing; its image's upper-left diagonal stands in. A pure
 * function of the view's train-local pose: reruns are identical.
 */
export function stageRotation(view, { sunPosition = CATALOGUE.sunPosition, offsetDeg = CATALOGUE.sunOffsetDeg } = {}) {
  const sunAz = Math.atan2(sunPosition[0], sunPosition[2]);
  const dx = view.eye[0] - view.target[0], dz = view.eye[2] - view.target[2];
  const plan = Math.hypot(dx, dz) < 1e-6;
  const camera = plan ? 135 * D2R : Math.atan2(dx, dz);
  const lateral = Math.sin(camera) < -1e-9 ? -Math.PI / 2 : Math.PI / 2;
  const toward = wrap(lateral - camera);
  const step = Math.min(offsetDeg * D2R, Math.abs(toward)) * (toward < 0 ? -1 : 1);
  const rotationY = wrap(sunAz - (camera + step));
  return { ruleId: 'sun-bearing-v1', basis: plan ? 'plan-upper-left-diagonal' : 'camera-bearing',
    rotationY: q6(rotationY), rotationYDeg: q6(rotationY / D2R), sunAzimuthDeg: q6(sunAz / D2R),
    cameraBearingLocalDeg: q6(camera / D2R), appliedOffsetDeg: q6(step / D2R), offsetDeg };
}

/** The first car's first bogie with (or without) traction motors, in train order; null if the model has none. */
export function chooseBogie(f, motor) {
  for (const car of f.cars) for (let k = 0; k < 2; k++) if (car.motor[k] === motor) return { car, k, z: car.bogies[k] };
  return null;
}
/** The door/window junction on car 1, chosen once: its first door, plus half a door and 0.9 m toward the car's centre. */
export function doorJunction(f) {
  const car = f.cars[1], doorZ = car?.doors?.[0];
  if (!Number.isFinite(doorZ)) return null;
  const toward = doorZ < (car.start + car.end) / 2 ? 1 : -1;
  return { carIndex: 1, doorZ: q6(doorZ), doorWidthM: f.doorWidth, offsetM: .9, towardCentre: toward, z: q6(doorZ + toward * (f.doorWidth / 2 + .9)) };
}
/** Joints between cars; a `unit` joint is two cab fronts meeting (Class 387 coupled units), not a through gangway. */
export function jointsOf(f) {
  return f.cars.slice(0, -1).map((car, index) => ({ index, z: q6(car.end), unit: car.cab === 'rear' && f.cars[index + 1].cab === 'front' }));
}
/** The joint nearest `z`; exact ties (the five-car trains have two) go to the lower index. */
export function nearestJoint(joints, z) {
  let best = null;
  for (const j of joints) if (!best || Math.abs(j.z - z) < Math.abs(best.z - z) - 1e-6) best = j;
  return best;
}

/**
 * Every V01-V09 view of one formation, as frozen numbers. `f` is a plain description (see describeFormation in
 * train-capture.mjs): { length, half, roofTop, doorWidth, cars: [{ index, type, start, end, cab, bogies, motor,
 * pantograph, doors }] }. Poses are train-local and absolute (a rear view is already reversed). A view the model
 * cannot honestly provide is a GAP with its reason; one that does not exist for the kind (a single-unit train's
 * unit coupling) is N/A. Nothing is invented and nothing is retried.
 */
export function planCatalogueViews(f) {
  const L = f.length, half = f.half, H = f.roofTop, cars = f.cars, n = cars.length, out = [];
  const centre = c => (c.start + c.end) / 2;
  const push = (id, suffix, o = {}) => {
    const rear = !!o.rear, flip = p => rear ? reverseFrame(p, L) : p.map(q6);
    const view = { id, suffix, status: o.status ?? 'OK', reason: o.reason ?? null };
    if (o.eye) {
      view.frame = rear ? 'rear' : 'front';
      view.eye = flip(o.eye); view.target = flip(o.target); view.fov = o.fov; view.up = o.up ?? [0, 1, 0];
      view.near = catalogueNear(view.eye, view.target);
      view.region = rear ? flipBox(o.region, L) : { min: o.region.min.map(q6), max: o.region.max.map(q6) };
      if (o.extents) view.extents = o.extents;
      if (o.car) view.car = o.car;
      if (o.capability) view.capability = o.capability;
      view.notes = o.notes ?? {};
      view.rotation = stageRotation(view);
    }
    out.push(view);
  };
  const missing = (reason, suffixes, id) => { for (const s of suffixes) push(id, s, { status: 'GAP', reason }); };

  // V01: nose three-quarter, both sides, both ends.
  for (const rear of [false, true]) for (const [side, sx] of [['left', -1], ['right', 1]])
    push('V01', `${rear ? 'rear-' : ''}nose-34-${side}`, { rear, eye: [sx * 4.5, 1.7, -5], target: [0, 1.7, 1.5], fov: 50,
      region: box(-1.6, 1.6, .7, 3.6, -.2, 3.4), notes: { end: rear ? 'rear cab end, train frame reversed' : 'front cab end' } });
  // V02: face on at 3 m.
  for (const rear of [false, true]) push('V02', rear ? 'rear-3m' : 'front-3m', { rear, eye: [0, 1.7, -3], target: [0, 1.7, 0], fov: 50,
    region: box(-1.3, 1.3, .9, 2.5, -.2, 1.2), notes: { end: rear ? 'rear cab end, train frame reversed' : 'front cab end' } });
  // V03: 3.000 m from the body side, FOV 65.
  const bogie0 = cars[0].bogies[0], junction = doorJunction(f);
  for (const [suffix, sx] of [['cab-side-3m', -1], ['cab-side-3m-right', 1]]) push('V03', suffix, { eye: [sx * (half + 3), 1.85, bogie0], target: [sx * half, 1.85, bogie0], fov: 65,
    region: box(-half - .3, half + .3, .6, 3.1, bogie0 - 2, bogie0 + 2), car: { index: 0, type: cars[0].type }, notes: { focus: 'leading bogie of car 0', side: sx < 0 ? 'left' : 'right' } });
  if (junction) for (const [suffix, sx] of [['window-door-3m-left', -1], ['window-door-3m-right', 1]]) push('V03', suffix, { eye: [sx * (half + 3), 1.85, junction.z], target: [sx * half, 1.85, junction.z], fov: 65,
    region: box(-half - .3, half + .3, .6, 3.1, junction.z - 2, junction.z + 2), car: { index: 1, type: cars[1].type }, notes: { junction, side: sx < 0 ? 'left' : 'right' } });
  else missing('car 1 has no door in its plan, so no window/door junction can be chosen', ['window-door-3m-left', 'window-door-3m-right'], 'V03');
  // V04 and V05: perpendicular, FOV 25, distance fixed once from the length so the subject spans at most 84% of the width.
  for (const [carIndex, prefix] of [[0, 'cab-car-side'], [n - 1, 'rear-cab-car-side'], [1, 'intermediate-car-side']]) {
    const c = cars[carIndex], d = ceil3(fitDistance(c.length, 25)), z = q6(centre(c));
    for (const [side, sx] of [['left', -1], ['right', 1]]) push('V04', `${prefix}-${side}`, { eye: [sx * (half + d), 1.9, z], target: [0, 1.9, z], fov: 25,
      region: box(-half - .3, half + .3, 0, H + .3, c.start - .01, c.end + .01), extents: { scope: 'car', car: carIndex, z0: q6(c.start), z1: q6(c.end) },
      car: { index: carIndex, type: c.type }, notes: { carLengthM: c.length, sideDistanceM: d, fitFraction: CATALOGUE.fitFraction } });
  }
  {
    const d = ceil3(fitDistance(L, 25)), z = q6(L / 2);
    for (const [side, sx] of [['left', -1], ['right', 1]]) push('V05', `whole-side-${side}`, { eye: [sx * (half + d), 1.9, z], target: [0, 1.9, z], fov: 25,
      region: box(-half - .3, half + .3, 0, H + .3, -.05, L + .05), extents: { scope: 'train', z0: 0, z1: q6(L) }, notes: { lengthM: L, sideDistanceM: d, fitFraction: CATALOGUE.fitFraction } });
  }
  // V06: roof. zP is the first (front) or last (rear) pantograph's centre, else the middle car's centre.
  {
    const panto = cars.filter(c => c.pantograph), mid = cars[Math.floor(n / 2)];
    const zOf = c => c ? (c.pantograph[0] + c.pantograph[1]) / 2 : centre(mid);
    const source = panto.length ? 'pantograph centre from trainLayout' : 'no pantograph on this train: centre of the middle car';
    const zFront = q6(zOf(panto[0])), zRear = q6(zOf(panto.at(-1))), zPr = q6(L - zRear);
    push('V06', 'roof-front', { eye: [5.5, 8, zFront - 2], target: [0, H, zFront], fov: 50, region: box(-1.8, 1.8, H - .9, H + .15, zFront - 2.2, zFront + 2.2), notes: { zP: zFront, source } });
    push('V06', 'roof-rear', { rear: true, eye: [5.5, 8, zPr - 2], target: [0, H, zPr], fov: 50, region: box(-1.8, 1.8, H - .9, H + .15, zPr - 2.2, zPr + 2.2),
      notes: { zP: zRear, zPReversed: zPr, source, end: 'rear, train frame reversed' } });
    const h = q6(H + ceil3(fitDistance(L, 50)));
    push('V06', 'roof-plan', { eye: [0, h, L / 2], target: [0, H, L / 2], up: [1, 0, 0], fov: 50, region: box(-half - .3, half + .3, H - .9, H + .3, -.05, L + .05),
      extents: { scope: 'train', z0: 0, z1: q6(L) }, notes: { heightM: h, lengthM: L, fitFraction: CATALOGUE.fitFraction, imageAxis: 'image x runs along the train, nose at the left' } });
  }
  // V07: running gear from the track side (the left, x < 0), then the underframe of car 1.
  {
    const side = -1, one = (b, motor) => ({ eye: [side * (half + 3), .65, b.z], target: [0, .55, b.z], fov: 50, region: box(-half - .3, half + .3, 0, 1.2, b.z - 1.8, b.z + 1.8),
      car: { index: b.car.index, type: b.car.type }, notes: { bogie: b.k, motor, z: b.z, side: 'left' } });
    const m = chooseBogie(f, true), t = chooseBogie(f, false);
    if (m) push('V07', 'bogie-motor', one(m, true)); else push('V07', 'bogie-motor', { status: 'GAP', reason: 'no bogie of this train carries traction motors in the model' });
    if (t) push('V07', 'bogie-trailer', one(t, false));
    else push('V07', 'bogie-trailer', { status: 'GAP', reason: 'the model draws every bogie of this train as a motor bogie (trainLayout motor flags are all true), so no trailer bogie exists to show' });
    const c1 = q6(centre(cars[1]));
    push('V07', 'underframe', { eye: [side * (half + 3), .8, c1], target: [0, .7, c1], fov: 50, region: box(-half - .3, half + .3, .3, 1.3, c1 - 2, c1 + 2),
      car: { index: 1, type: cars[1].type }, notes: { side: 'left', focus: 'centre of car 1' } });
  }
  // V08: ordinary joints and Class 387 unit couplings, from the right (+x), at eye height and low and oblique.
  {
    const joints = jointsOf(f), units = joints.filter(j => j.unit), ordinary = joints.filter(j => !j.unit);
    const straight = (j, extra = {}) => ({ eye: [half + 2, 1.8, j.z], target: [0, 1.6, j.z], fov: 50, region: box(-half - .3, half + .3, 1, 2.4, j.z - 1, j.z + 1),
      car: { index: j.index, type: cars[j.index].type }, notes: { joint: j, between: [j.index, j.index + 1], ...extra } });
    const low = (j, extra = {}) => ({ eye: [half + 2, 1.2, j.z - 1.5], target: [0, .85, j.z], fov: 50, region: box(-half - .3, half + .3, .45, 1.4, j.z - 1.2, j.z + 1.2),
      car: { index: j.index, type: cars[j.index].type }, notes: { joint: j, between: [j.index, j.index + 1], oblique: 'eye 1.5 m before the joint, 1.2 m high', ...extra } });
    const mid = nearestJoint(ordinary, L / 2);
    push('V08', 'gangway', straight(joints[0]));
    push('V08', 'gangway-mid', straight(mid, { nearest: 'ordinary joint nearest mid-train; an exact tie goes to the lower index' }));
    push('V08', 'coupling-low', low(joints[0]));
    for (const [k, suffix] of [[0, 'unit-coupling'], [1, 'unit-coupling-2']]) {
      const j = units[k], na = k === 0 ? 'single unit: this train has no cab-to-cab unit coupling' : 'this train has at most one cab-to-cab unit coupling';
      if (j) { push('V08', suffix, straight(j)); push('V08', `${suffix}-low`, low(j)); }
      else { push('V08', suffix, { status: 'N/A', reason: na }); push('V08', `${suffix}-low`, { status: 'N/A', reason: na }); }
    }
  }
  // V09: V02's pose in the leading and trailing lighting states, if the page can switch lamps; else a functional GAP.
  const lampReason = "the built page exposes no window.__kx.setTrainLampState(group, 'leading'|'trailing'): the lamp meshes are static, so there is no state pair to compare; no switch is invented";
  for (const state of ['leading', 'trailing']) push('V09', `lights-${state}`, { eye: [0, 1.7, -3], target: [0, 1.7, 0], fov: 50, region: box(-1.3, 1.3, .9, 2.5, -.2, 1.2),
    capability: { function: 'setTrainLampState', state, reason: lampReason }, notes: { poseOf: 'V02 front-3m', state } });
  return out;
}
/** The numbers that define a view, for freezing and comparison. */
export const poseOf = v => ({ status: v.status, frame: v.frame, eye: v.eye, target: v.target, fov: v.fov, up: v.up, near: v.near, region: v.region, extents: v.extents,
  car: v.car, rotationY: v.rotation?.rotationY });
/** Deep equality on poses: numbers within `tol`, everything else exact. Returns the first difference path, or null. */
export function poseDifference(a, b, tol = 1e-6, path = '') {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= tol ? null : path;
  if (a === undefined && b === undefined) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return Object.is(a, b) || a === b ? null : path;
  if (Array.isArray(a) !== Array.isArray(b)) return path;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) { const d = poseDifference(a[k], b[k], tol, `${path}/${k}`); if (d !== null) return d; }
  return null;
}

/**
 * V10: camera XZ candidates at exactly `distanceM` from the focus, one per `stepDeg` of azimuth, kept only where the point lies
 * over a platform polygon, best first (nearest a preferred bearing, then by azimuth). Azimuths are bearings (x = sin, z = cos).
 */
export function stationCandidates({ focusXZ, distanceM, platforms, inside, stepDeg = 1, preferredBearingsDeg = [] }) {
  const out = [];
  for (let k = 0; k * stepDeg < 360; k++) {
    const az = k * stepDeg, xz = [focusXZ[0] + distanceM * Math.sin(az * D2R), focusXZ[1] + distanceM * Math.cos(az * D2R)];
    const platform = platforms.find(p => inside(xz, p.pts));
    if (!platform) continue;
    out.push({ azimuthDeg: az, xz, platform: platform.ref, preference: preferredBearingsDeg.length ? Math.min(...preferredBearingsDeg.map(b => Math.abs(wrapDeg(az - b)))) : 0 });
  }
  return out.sort((a, b) => a.preference - b.preference || a.azimuthDeg - b.azimuthDeg);
}
/** The V10 eye: platform surface + 1.7 m above the candidate XZ, target the focus, FOV 50. Asserts the horizontal distance. */
export function stationPose({ candidate, focus, distanceM, platformHeightM = CATALOGUE.platformHeightM }) {
  const eye = [candidate.xz[0], platformHeightM + CATALOGUE.eyeAbovePlatformM, candidate.xz[1]];
  const horizontal = Math.hypot(eye[0] - focus[0], eye[2] - focus[2]);
  if (Math.abs(horizontal - distanceM) >= 1e-6) throw new Error(`station camera is ${horizontal} m from its focus, not ${distanceM} m`);
  return { eye, target: [...focus], fov: 50, near: .5, up: [0, 1, 0], horizontalDistanceM: horizontal, azimuthDeg: candidate.azimuthDeg, platform: candidate.platform };
}

// ============================================================================================
// CATALOGUE, part 2: the neutral specimen stage and the per-view checks. These take THREE as their first
// argument like everything above, so they run in the page and, on fixtures, in Node.
// ============================================================================================
const drawn = m => (Array.isArray(m) ? m : [m]).some(x => x?.visible !== false && x?.opacity !== 0);
const nameOf = o => o.name || o.type;
const chainOf = o => { const names = []; for (let p = o; p; p = p.parent) names.push(nameOf(p)); return names.reverse().join('/'); };

/**
 * A capture-only stage, clearly named and never part of the model: a large ground plane, a 3.4 m ballast strip, sleepers (one
 * InstancedMesh) and two rail-head boxes at the wheel-tread centres (x = +-gauge/2), the rail head top at y = 0. The levels copy
 * the page's own track (web/src/track.ts): ground -0.2, ballast top -0.14, sleeper top -0.10, rail 0.10 m tall. It runs 60 m
 * past each end of the train. The page's lights, fog, renderer and background are left alone.
 */
export function buildCatalogueStage(T, { length, margin = 60 } = {}) {
  const g = new T.Group();
  g.name = 'capture-stage';
  g.userData = { captureOwned: true, note: 'capture-only neutral specimen stage; not part of the model' };
  const z0 = -margin, z1 = length + margin, span = z1 - z0, mid = (z0 + z1) / 2, lambert = color => new T.MeshLambertMaterial({ color });
  const add = (name, geometry, color, x, y, z) => { const m = new T.Mesh(geometry, lambert(color)); m.name = name; m.position.set(x, y, z); g.add(m); return m; };
  add('capture-stage-ground', new T.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), 0x3a4049, 0, CATALOGUE.groundY, mid);
  add('capture-stage-ballast', new T.BoxGeometry(3.4, .06, span), 0x5d5a55, 0, CATALOGUE.groundY + .03, mid);
  const count = Math.floor(span / .65), sleepers = new T.InstancedMesh(new T.BoxGeometry(2.6, .05, .25), lambert(0x8d8b85), count), m = new T.Matrix4();
  sleepers.name = 'capture-stage-sleepers';
  for (let i = 0; i < count; i++) { m.makeTranslation(0, -.125, z0 + .325 + i * .65); sleepers.setMatrixAt(i, m); }
  sleepers.instanceMatrix.needsUpdate = true;
  g.add(sleepers);
  for (const sx of [-1, 1]) add(`capture-stage-rail-${sx < 0 ? 'left' : 'right'}`, new T.BoxGeometry(CATALOGUE.railHeadWidthM, .1, span), 0xa0a4aa, sx * CATALOGUE.gaugeM / 2, -.05, mid);
  g.userData.levels = { groundY: CATALOGUE.groundY, ballastTopY: CATALOGUE.groundY + .06, sleeperTopY: -.1, railHeadTopY: 0, railCentreX: CATALOGUE.gaugeM / 2, ballastWidthM: 3.4, sleepers: count, zRange: [z0, z1] };
  return g;
}
/** Hide every scene child that is not a light and not capture-owned (shed, city, terrain, track, signals, signs...). Returns the objects hidden. */
export function hideSceneryForStage(scene) {
  const hidden = [];
  for (const o of scene.children) if (!o.isLight && !o.userData?.captureOwned && o.visible) { o.visible = false; hidden.push(o); }
  return hidden;
}
export const describeObjects = list => list.map(o => ({ name: o.name || '', type: o.type }));
/** Specimen and stage share one rigid transform: the vertical-axis rotation the sun rule asks for. */
export function placeStageSpecimen(group, stage, rotationY, position = [0, 0, 0]) {
  for (const o of [group, stage]) { o.position.set(...position); o.rotation.set(0, rotationY, 0); o.updateMatrixWorld(true); }
}
/** Static triangles and draw calls of a train, counted exactly as .scratch/train-rubric/measure-costs.mjs does. Call it after the frame is rendered, so the LODs are the ones drawn. */
export function trainCosts(group) {
  let triangles = 0, drawCalls = 0;
  group.traverseVisible(o => {
    if (!o.isMesh) return;
    const g = o.geometry, n = Math.min(g.drawRange.count, (g.index?.count ?? g.attributes.position.count) - g.drawRange.start);
    if (!o.material || n <= 0) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    if (materials.every(m => m.visible === false || m.opacity === 0)) return;
    if (Array.isArray(o.material) && g.groups.length) { for (const part of g.groups) if (o.material[part.materialIndex]?.visible !== false) { drawCalls++; triangles += part.count / 3; } }
    else { drawCalls++; triangles += n / 3; }
  });
  return { triangles, drawCalls };
}
/** Aim the camera at a view given in the train's own frame, through the specimen's world transform. Returns the world pose actually set. */
export function setCatalogueView(T, camera, controls, group, view) {
  group.updateMatrixWorld(true);
  const eye = group.localToWorld(new T.Vector3(...view.eye)), target = group.localToWorld(new T.Vector3(...view.target));
  const up = view.up && (view.up[0] !== 0 || view.up[1] !== 1 || view.up[2] !== 0) ? new T.Vector3(...view.up).transformDirection(group.matrixWorld).toArray() : undefined;
  setCaptureView(T, camera, controls, eye.toArray(), target.toArray(), view.fov, up, view.near);
  return cameraPose(camera, controls, { plannedPosition: eye.toArray(), plannedTarget: target.toArray() });
}
/** A pose given in world metres (V10, where the station fixes the specimen). */
export function setWorldView(T, camera, controls, pose) {
  setCaptureView(T, camera, controls, pose.eye, pose.target, pose.fov, pose.up, pose.near);
  return cameraPose(camera, controls, { plannedPosition: [...pose.eye], plannedTarget: [...pose.target] });
}
export function cameraPose(camera, controls, planned = {}) {
  const position = camera.position.toArray();
  return { position, target: controls.target.toArray(), fov: camera.fov, near: camera.near, far: camera.far, aspect: camera.aspect, up: camera.up.toArray(), ...planned,
    positionErrorM: planned.plannedPosition ? Math.hypot(...position.map((v, i) => v - planned.plannedPosition[i])) : 0 };
}

/** The train's car-level meshes (the body shell, which is open at roof, floor and ends, and the body detail): a camera inside their box is inside the car. */
const CAR_ENVELOPE_NAMES = ['body-shell', 'body-detail'];
/**
 * Is the point inside any of the meshes? A train car is an open, non-watertight shell, so a car-level mesh (`CAR_ENVELOPE_NAMES`) counts as
 * enclosing the point when the point is inside its own, un-rotated bounding box (tested in the mesh's frame, so a turned car keeps its true
 * box). Any other mesh is closed geometry: parity of ray crossings (double-sided) along the six axes, odd in at least five. A ray through
 * the seam of two triangles (it hits both at one distance) crosses the surface once, so hits within a micrometre count as one crossing.
 */
export function cameraInsideMesh(T, point, meshes) {
  const box = new T.Box3(), dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const mesh of meshes) {
    if (CAR_ENVELOPE_NAMES.includes(mesh.name) && !mesh.isInstancedMesh) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox.containsPoint(mesh.worldToLocal(point.clone()))) return mesh;
      continue;
    }
    if (mesh.isInstancedMesh) { if (!mesh.boundingBox) mesh.computeBoundingBox(); box.copy(mesh.boundingBox); }
    else { if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox(); box.copy(mesh.geometry.boundingBox); }
    if (!box.applyMatrix4(mesh.matrixWorld).containsPoint(point)) continue;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material], sides = materials.map(m => m.side);
    let odd = 0;
    materials.forEach(m => { m.side = T.DoubleSide; });
    try {
      for (const d of dirs) {
        const ray = new T.Raycaster(point, new T.Vector3(...d), 0, Infinity);
        let crossings = 0, last = -Infinity;
        for (const hit of intersectCaptureRay(T, ray, [mesh]).sort((a, b) => a.distance - b.distance)) { if (hit.distance - last > 1e-6) crossings++; last = hit.distance; }
        if (crossings % 2 === 1) odd++;
      }
    } finally { materials.forEach((m, i) => { m.side = sides[i]; }); }
    if (odd >= 5) return mesh;
  }
  return null;
}
/**
 * Points on the train's visible surfaces that face the camera (normal . direction to camera >= minFacing). With a `region` (a box in the
 * train's own frame) only points inside it are kept, and a triangle longer than `maxEdge` is subdivided so a long skirt panel still
 * offers points inside a short region; with none, each triangle gives its centre.
 */
export function surfaceSamples(T, group, camera, region = null, minFacing = .45, maxEdge = 1) {
  const out = [], inverse = region ? new T.Matrix4().copy(group.matrixWorld).invert() : null;
  const p = [new T.Vector3(), new T.Vector3(), new T.Vector3()], l = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
  const a = new T.Vector3(), b = new T.Vector3(), n = new T.Vector3(), s = new T.Vector3(), q = new T.Vector3();
  group.traverseVisible(o => {
    if (!o.isMesh || !camera.layers.test(o.layers) || !drawn(o.material)) return;
    const pos = o.geometry.attributes.position; if (!pos) return;
    const index = o.geometry.index, start = o.geometry.drawRange.start, end = Math.min(index ? index.count : pos.count, start + o.geometry.drawRange.count);
    for (let i = start; i + 2 < end; i += 3) {
      for (let k = 0; k < 3; k++) p[k].fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(o.matrixWorld);
      n.crossVectors(a.subVectors(p[1], p[0]), b.subVectors(p[2], p[0]));
      if (n.lengthSq() < 1e-10) continue;
      n.normalize();
      let N = 1;
      if (inverse) {
        for (let k = 0; k < 3; k++) l[k].copy(p[k]).applyMatrix4(inverse);
        if (Math.max(l[0].x, l[1].x, l[2].x) < region.min[0] || Math.min(l[0].x, l[1].x, l[2].x) > region.max[0] ||
            Math.max(l[0].y, l[1].y, l[2].y) < region.min[1] || Math.min(l[0].y, l[1].y, l[2].y) > region.max[1] ||
            Math.max(l[0].z, l[1].z, l[2].z) < region.min[2] || Math.min(l[0].z, l[1].z, l[2].z) > region.max[2]) continue;
        N = Math.min(8, Math.max(1, Math.ceil(Math.max(p[0].distanceTo(p[1]), p[0].distanceTo(p[2]), p[1].distanceTo(p[2])) / maxEdge)));
      }
      // the centres of the N x N small triangles the triangle divides into (one, its own centre, when N = 1)
      for (let i2 = 0; i2 < N; i2++) for (let j2 = 0; i2 + j2 < N; j2++) for (const third of (i2 + j2 < N - 1 ? [1, 2] : [1])) {
        const u = (i2 + third / 3) / N, v = (j2 + third / 3) / N;
        s.copy(p[0]).addScaledVector(a.subVectors(p[1], p[0]), u).addScaledVector(b.subVectors(p[2], p[0]), v);
        if (n.dot(q.subVectors(camera.position, s).normalize()) < minFacing) continue;
        if (inverse) {
          q.copy(s).applyMatrix4(inverse);
          if (q.x < region.min[0] || q.x > region.max[0] || q.y < region.min[1] || q.y > region.max[1] || q.z < region.min[2] || q.z > region.max[2]) continue;
        }
        out.push(s.clone());
      }
    }
  });
  return out;
}
/** At most `count` samples spread across the image: the one nearest the centre of each cell of a grid laid over their extent, and the four extremes. */
export function spreadSamples(T, points, camera, count = 64) {
  if (points.length <= count) return points;
  const ndc = points.map(p => p.clone().project(camera)), g = Math.max(1, Math.floor(Math.sqrt(count - 4)));
  const minX = Math.min(...ndc.map(p => p.x)), maxX = Math.max(...ndc.map(p => p.x)), minY = Math.min(...ndc.map(p => p.y)), maxY = Math.max(...ndc.map(p => p.y));
  const cellOf = (v, lo, hi) => Math.min(g - 1, Math.floor((v - lo) / ((hi - lo) || 1) * g)), best = new Map();
  ndc.forEach((p, i) => {
    const cx = cellOf(p.x, minX, maxX), cy = cellOf(p.y, minY, maxY), d = Math.hypot(p.x - (minX + (cx + .5) / g * (maxX - minX)), p.y - (minY + (cy + .5) / g * (maxY - minY)));
    const key = cy * g + cx, held = best.get(key);
    if (!held || d < held.d - 1e-12) best.set(key, { i, d });
  });
  const chosen = new Set([...best.values()].map(h => h.i));
  let lx = 0, hx = 0, ly = 0, hy = 0;
  ndc.forEach((p, i) => { if (p.x < ndc[lx].x) lx = i; if (p.x > ndc[hx].x) hx = i; if (p.y < ndc[ly].y) ly = i; if (p.y > ndc[hy].y) hy = i; });
  for (const i of [lx, hx, ly, hy]) chosen.add(i);
  return [...chosen].sort((i, j) => i - j).map(i => points[i]);
}
/** NDC bounding box of every vertex of an object's visible meshes. */
export function projectedExtents(T, object, camera) {
  const v = new T.Vector3(); let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, vertices = 0;
  object.traverseVisible(o => {
    if (!o.isMesh || !drawn(o.material)) return;
    const pos = o.geometry.attributes.position; if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(camera);
      if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x; if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y; vertices++;
    }
  });
  return { minX, maxX, minY, maxY, vertices, widthFraction: (maxX - minX) / 2, heightFraction: (maxY - minY) / 2 };
}
/**
 * The per-view check. A view is clear only if: the camera is at least 0.25 m above the ground (the stage's flat ground, or the drawn
 * terrain) and inside no mesh; the surface of the VIEWED region (a train-local box) has samples; every sample lies inside the frame
 * margin; the region is not trivially small; a ray from the camera to every sample meets no non-train mesh first; at least
 * `minVisibleFraction` of the samples are seen directly (not hidden behind other parts of the train); and, for the whole-car and
 * whole-train views, the subject's actual vertices span no more than 84% of the image width. Never moves the camera, never retries.
 */
export function inspectCatalogueView(T, scene, camera, group, ground, view, { count = 64, margin = .91, minScreenSpan = .05, minVisibleFraction = .2, extentFraction = CATALOGUE.fitFraction } = {}) {
  scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  // the level of detail the renderer would draw from this camera, so the samples are the surfaces the picture shows
  group.traverse(o => { if (o.isLOD) o.update(camera); });
  const groundY = ground?.heightAt(camera.position.x, camera.position.z);
  if (groundY !== undefined && (!Number.isFinite(groundY) || camera.position.y < groundY + .25)) return { clear: false, reason: 'camera below scene ground clearance', groundY };
  const meshes = visibleMeshes(scene, camera), inside = cameraInsideMesh(T, camera.position, meshes);
  if (inside) return { clear: false, reason: 'camera inside a mesh', blocker: chainOf(inside), groundY };
  const all = surfaceSamples(T, group, camera, view.region);
  if (all.length < 4) return { clear: false, reason: 'insufficient visible train surface in the viewed region', candidates: all.length, groundY };
  const points = spreadSamples(T, all, camera, count), ndc = points.map(p => p.clone().project(camera));
  const bad = ndc.findIndex(p => Math.abs(p.x) > margin || Math.abs(p.y) > margin || p.z <= -1 || p.z >= 1);
  if (bad >= 0) return { clear: false, reason: 'viewed region outside the frame margin', point: points[bad].toArray(), ndc: ndc[bad].toArray(), groundY };
  const spanX = Math.max(...ndc.map(p => p.x)) - Math.min(...ndc.map(p => p.x)), spanY = Math.max(...ndc.map(p => p.y)) - Math.min(...ndc.map(p => p.y)), span = Math.max(spanX, spanY);
  if (span < minScreenSpan) return { clear: false, reason: 'viewed region too small in frame', screenSpan: span, groundY };
  let extents = null;
  if (view.extents) {
    const subject = view.extents.scope === 'car' ? group.getObjectByName(`car-${view.extents.car}`) : group;
    if (!subject) return { clear: false, reason: 'subject car missing from the specimen', groundY };
    extents = projectedExtents(T, subject, camera);
    if (Math.max(Math.abs(extents.minX), Math.abs(extents.maxX)) > extentFraction + 1e-6) return { clear: false, reason: `subject exceeds ${Math.round(extentFraction * 100)}% of the frame width`, extents, groundY };
    if (extents.widthFraction < .7 * extentFraction) return { clear: false, reason: 'subject too small in frame', extents, groundY };
  }
  const ray = new T.Raycaster(), blockers = new Map(), sampleNdc = []; let seen = 0;
  for (const [i, point] of points.entries()) {
    const direction = point.clone().sub(camera.position), distance = direction.length();
    ray.set(camera.position, direction.normalize()); ray.near = .01; ray.far = distance + .03;
    const hits = intersectCaptureRay(T, ray, meshes), own = hits.find(h => belongs(h.object, group));
    const hit = hits.find(h => !belongs(h.object, group) && h.distance < Math.min(distance, own?.distance ?? distance) - .002);
    if (hit) return { clear: false, ...obstruction(hit, point, camera), groundY };
    if (!own) return { clear: false, reason: 'sample has no visible train surface', point: point.toArray(), groundY };
    if (own.distance >= distance - .03) { seen++; sampleNdc.push([ndc[i].x, ndc[i].y]); }
    else blockers.set(chainOf(own.object), (blockers.get(chainOf(own.object)) ?? 0) + 1);
  }
  const visibleFraction = seen / points.length;
  if (visibleFraction < minVisibleFraction) {
    const blocker = [...blockers].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { clear: false, reason: 'viewed region hidden behind other parts of the train', visibleFraction, blocker, groundY };
  }
  return { clear: true, checkedSamples: points.length, candidateSamples: all.length, visibleFraction, screenSpan: span, verticalSpan: spanY, groundY: groundY ?? null, sampleNdc,
    ...(extents ? { extentsNdc: { minX: extents.minX, maxX: extents.maxX, minY: extents.minY, maxY: extents.maxY, widthFraction: extents.widthFraction, vertices: extents.vertices } } : {}) };
}
