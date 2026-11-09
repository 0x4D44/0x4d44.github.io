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
/** In a bounded detail view no two sampled places on a triangle are further apart than this, metres. */
const SAMPLE_PITCH = .3;
/**
 * The places that sample one triangle in a view of the region within `radius` of `focus`: its centre if it is small, else the centres of the pieces it splits into (cut at its
 * edges' midpoints until no edge is longer than SAMPLE_PITCH), leaving out the pieces that cannot reach the region, each with its area. A body's flank is a few triangles as long as
 * the car, whose centres stand metres from anything near them, and its nose and its windows are thousands of tiny ones: the centres alone sample the nose and miss the flank.
 */
function trianglePieces(T, p, q, r, focus, radius, out) {
  const centre = p.clone().add(q).add(r).multiplyScalar(1/3);
  if (centre.distanceTo(focus) - Math.max(centre.distanceTo(p), centre.distanceTo(q), centre.distanceTo(r)) > radius) return;
  if (Math.max(p.distanceTo(q), q.distanceTo(r), r.distanceTo(p)) <= SAMPLE_PITCH) {
    if (centre.distanceTo(focus) <= radius) out.push({ centre, area: q.clone().sub(p).cross(r.clone().sub(p)).length() / 2 });
    return;
  }
  const pq = p.clone().add(q).multiplyScalar(.5), qr = q.clone().add(r).multiplyScalar(.5), rp = r.clone().add(p).multiplyScalar(.5);
  for (const [a, b, c] of [[p, pq, rp], [pq, q, qr], [rp, qr, r], [pq, qr, rp]]) trianglePieces(T, a, b, c, focus, radius, out);
}
/**
 * Triangle-centre samples lie on actual body surfaces, unlike empty bounding-box corners. A view of a region (`detail.focus` and `detail.radius`) samples it by area: the pieces of every
 * triangle that reaches it (trianglePieces), picked at even steps of their cumulative area, so the picks cover what the picture shows however the body happens to be cut into triangles.
 */
function bodySamples(T, group, camera, detail) {
  const samples = [], maxY = trainBounds(T, group).max.y, bounded = detail?.focus ? detail : null;
  group.traverseVisible(o => {
    if (!o.isMesh || !/^(body-shell|body-detail|cab-glass)$/.test(o.name)) return;
    const a = o.geometry.attributes.position, index = o.geometry.index;
    if (!a) return;
    const n = index ? index.count : a.count;
    const point = i => o.localToWorld(new T.Vector3().fromBufferAttribute(a, index ? index.getX(i) : i));
    for (let i = 0; i + 2 < n; i += 3) {
      const p = point(i), q = point(i+1), r = point(i+2), normal = q.clone().sub(p).cross(r.clone().sub(p));
      if (normal.lengthSq() < 1e-10) continue;
      normal.normalize();
      const places = [];
      if (bounded) trianglePieces(T, p, q, r, bounded.focus, bounded.radius, places);
      else places.push({ centre: p.clone().add(q).add(r).multiplyScalar(1/3) });
      for (const place of places) {
        const { centre } = place;
        if (normal.dot(camera.position.clone().sub(centre).normalize()) < .45) continue;
        if (detail) {
          if (detail.includePoint && !detail.includePoint(centre)) continue;
        } else if (centre.y < maxY - 2) continue;
        samples.push(place);
      }
    }
  });
  const k = Math.min(32, samples.length);
  if (bounded && samples.length > k) {
    const total = samples.reduce((sum, s) => sum + s.area, 0), picked = [];
    for (let i = 0, at = 0, seen = 0; i < k; i++) {
      const want = (i + .5) / k * total;
      while (at < samples.length - 1 && seen + samples[at].area < want) seen += samples[at++].area;
      picked.push(samples[at].centre);
    }
    return picked;
  }
  // Cover the sampled surface, not just one lucky clear window.
  return Array.from({length: k}, (_,i) => samples[Math.floor(i * samples.length / k)].centre);
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
  /** V10: web/src/main.ts NOSE_TO_STOP, the gap the page leaves between a standing train's nose and its buffer stop. */
  noseToStopM: 1.5,
  /** V10: the specimen stands at this buffer stop, counted from the west (the page's own sample stop for the 5-car LNER). */
  stationStopIndex: 3,
  /** V10: the leading cab is looked at 1.5 m behind the nose (V01's target) and the coach at the centre of car 1, both 1.7 m up. */
  stationFocusHeightM: 1.7,
  stationCabFocusZ: 1.5,
  /** V10: the cab view judges the front 12 m of the train, the coach view all of car 1, both from just above the platform edge up (the platform hides the running gear from any platform). */
  stationRegionLengthM: 12,
  stationRegionFloorM: 1,
  /** V10: a camera stands at least this far inside its platform's edge. */
  platformEdgeClearM: .5,
  /** V10: at most this many candidate cameras are inspected per view and placement, no two closer than this in azimuth. */
  stationMaxCandidates: 48,
  stationMinSeparationDeg: 2,
  /** V10: candidates are tried best first: nearest a front three-quarter view of the specimen, this many degrees off its nose. */
  stationFrontAngleDeg: 45,
  /** V10: the least a checked region may span in the frame (V01-V09 ask .05; a cab 150 m away is small). */
  stationMinScreenSpan: .03,
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
/** V10: [output suffix, horizontal distance from the focus in metres, the focus: the leading cab or the centre of car 1]. */
export const STATION_VIEW_TABLE = Object.freeze([['station-25m', 25, 'cab'], ['station-75m', 75, 'cab'], ['station-150m', 150, 'cab'],
  ['station-25m-coach', 25, 'coach'], ['station-75m-coach', 75, 'coach'], ['station-150m-coach', 150, 'coach']].map(row => Object.freeze(row)));
export const STATION_VIEWS = Object.freeze(STATION_VIEW_TABLE.map(([suffix]) => suffix));
/** V10 placements, in the order they are tried: the nose at the buffers (as the page stands its own sample trains), then turned so the leading cab is at the north end. */
export const STATION_ORIENTATIONS = Object.freeze(['nose-at-buffers', 'cab-at-north-end']);
/**
 * How a V10 view that has no clear camera at its kind's stop is answered, for the manifest and every sidecar that moved. The stops are the page's own: it stands its sample trains at
 * the shed's buffer stops (web/src/main.ts) and matches each stop to the platform whose south end is nearest it across the shed; a platform's formation limit is core/station.ts
 * platformFormationLimits (the published length less the stop clearance), and a kind fits where its layout is no longer than the limit (web/src/trains-live.ts kindForService, createTrainKinds);
 * no limit is no restriction, and nothing in the page restricts a platform to an operator.
 */
export const ALTERNATE_RULE = 'A V10 view with no clear camera at the stop its kind stands at is searched again at the other buffer stops of the shed where the page\'s own rules let this train stand: the page matches '
  + 'each stop to the platform whose south end is nearest it across the shed (web/src/main.ts), a platform\'s formation limit is core/station.ts platformFormationLimits, and a kind fits where its layout is no '
  + 'longer than that limit (web/src/trains-live.ts kindForService); a platform with no limit is no restriction and the page restricts no platform to an operator. Platforms 9 and 10 have no stop in the shed\'s list '
  + '(core/station.ts shedBufferStops), so the page stands no train there. The stops are tried nearest the kind\'s own stop across the shed first, then west to east, each with the nose at the buffers and then '
  + 'turned so the leading cab is at the north end, by the same search as the first stop; the first placement that gives the view a clear camera takes it. Only a view with no clear camera moves: every other view of the kind keeps its stop.';
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
  // V09: V02's pose in the leading and trailing lamp states, which the page switches with setTrainLampState(group, { front, rear }); a page without that function is a functional GAP.
  const lampReason = 'the built page exposes no window.__kx.setTrainLampState(group, { front, rear }): the lamp meshes are static, so there is no state pair to compare; no switch is invented';
  for (const name of Object.keys(LAMP_STATES)) push('V09', `lights-${name}`, { eye: [0, 1.7, -3], target: [0, 1.7, 0], fov: 50, region: box(-1.3, 1.3, .9, 2.5, -.2, 1.2),
    capability: { function: 'setTrainLampState', state: { ...LAMP_STATES[name] }, reason: lampReason }, notes: { poseOf: 'V02 front-3m', state: name } });
  return out;
}
/**
 * What V09 asks of the page's `window.__kx.setTrainLampState(train, { front, rear })` (web/src/train.ts; modes 'head' | 'tail' | 'off'). `front` is car 0's cab
 * end, the end V02's pose faces; `rear` the last car's. `leading`: the train in service, white lamps at the front cab. `trailing`: the same train running the other
 * way, so the front cab shows its red lamps. A coupled unit's inner cab ends stay dark in either state (the page's rule, not asked for here).
 */
export const LAMP_STATES = Object.freeze({ leading: Object.freeze({ front: 'head', rear: 'tail' }), trailing: Object.freeze({ front: 'tail', rear: 'head' }) });
/**
 * A planned view as a pass of `exposure` takes it. The lamps (V09) are the one view taken at dusk under a name of their own, `<suffix>-dusk`, so the two passes
 * can sit in one pack and be told apart by name; its pose is the day view's (`poseSuffix`), so a dusk pass reuses the day poses. Every other view keeps its name.
 */
export function viewForExposure(view, exposure) {
  if (view.id !== 'V09' || exposure !== 'dusk') return view;
  return { ...view, suffix: `${view.suffix}-dusk`, poseSuffix: view.suffix, notes: { ...view.notes, exposure } };
}
/** The frozen entry of a view in a held kind: under its own suffix, else under the suffix its pose is shared with. */
export const frozenEntryOf = (held, view) => held?.views?.[view.suffix] ?? (view.poseSuffix ? held?.views?.[view.poseSuffix] : undefined);
/** The numbers that define a view, for freezing and comparison. */
export const poseOf = v => ({ status: v.status, frame: v.frame, eye: v.eye, target: v.target, fov: v.fov, up: v.up, near: v.near, region: v.region, extents: v.extents,
  car: v.car, rotationY: v.rotation?.rotationY,
  // V10 only: where the specimen stands, which camera over which platform, and what it looks at
  ...(v.id === 'V10' ? { placement: v.placement, distanceM: v.distanceM, azimuthDeg: v.azimuthDeg, platform: v.platform, platformHeightM: v.platformHeightM, focus: v.focus } : {}) });
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

// ---- V10: the specimen at a real buffer stop, and cameras standing on the platforms around it --------------------------------------------
/** Distance from a point to the nearest edge of a polygon, both in the XZ plane. */
export function polygonEdgeDistance(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz));
  }
  return best;
}
/** One V10 camera position: `distanceM` from the focus along bearing `azimuthDeg` (x = sin, z = cos), or null where that point is not `edgeClearM` inside a platform. */
export function stationCameraAt({ focusXZ, distanceM, azimuthDeg, platforms, inside, edgeClearM = 0 }) {
  const xz = [focusXZ[0] + distanceM * Math.sin(azimuthDeg * D2R), focusXZ[1] + distanceM * Math.cos(azimuthDeg * D2R)];
  const platform = platforms.find(p => inside(xz, p.pts) && (edgeClearM <= 0 || polygonEdgeDistance(xz, p.pts) >= edgeClearM));
  return platform ? { azimuthDeg, xz, platform: platform.ref } : null;
}
/**
 * V10: camera XZ candidates at exactly `distanceM` from the focus, one per `stepDeg` of azimuth, kept only where the point lies
 * over a platform polygon (and `edgeClearM` inside its edge), best first (nearest a preferred bearing, then by azimuth). Azimuths are bearings (x = sin, z = cos).
 */
export function stationCandidates({ focusXZ, distanceM, platforms, inside, stepDeg = 1, preferredBearingsDeg = [], edgeClearM = 0 }) {
  const out = [];
  for (let k = 0; k * stepDeg < 360; k++) {
    const az = k * stepDeg, found = stationCameraAt({ focusXZ, distanceM, azimuthDeg: az, platforms, inside, edgeClearM });
    if (found) out.push({ ...found, preference: preferredBearingsDeg.length ? Math.min(...preferredBearingsDeg.map(b => Math.abs(wrapDeg(az - b)))) : 0 });
  }
  return out.sort((a, b) => a.preference - b.preference || a.azimuthDeg - b.azimuthDeg);
}
/**
 * The first `max` of an ordered candidate list, skipping any within `minSeparationDeg` of azimuth of one already kept: the search spreads
 * over the platforms instead of testing a dozen neighbours of one blocked camera.
 */
export function thinCandidates(ordered, minSeparationDeg = CATALOGUE.stationMinSeparationDeg, max = CATALOGUE.stationMaxCandidates) {
  const kept = [];
  for (const c of ordered) {
    if (kept.length >= max) break;
    if (kept.every(o => Math.abs(wrapDeg(c.azimuthDeg - o.azimuthDeg)) >= minSeparationDeg - 1e-9)) kept.push(c);
  }
  return kept;
}
/** The V10 eye: platform surface + 1.7 m above the candidate XZ, target the focus, FOV 50. Asserts the horizontal distance. */
export function stationPose({ candidate, focus, distanceM, platformHeightM = CATALOGUE.platformHeightM }) {
  const eye = [candidate.xz[0], platformHeightM + CATALOGUE.eyeAbovePlatformM, candidate.xz[1]];
  const horizontal = Math.hypot(eye[0] - focus[0], eye[2] - focus[2]);
  if (Math.abs(horizontal - distanceM) >= 1e-6) throw new Error(`station camera is ${horizontal} m from its focus, not ${distanceM} m`);
  return { eye, target: [...focus], fov: 50, near: catalogueNear(eye, focus), up: [0, 1, 0], horizontalDistanceM: horizontal, azimuthDeg: candidate.azimuthDeg, platform: candidate.platform };
}
/**
 * Where the specimen stands for V10. `standing` is core/station.ts standingTrainPose at the buffer stop: the nose 1.5 m north of the stop and
 * the turn that sends the body north, along the track ('nose-at-buffers', the way the page stands its own sample trains). The other
 * orientation turns the train half way round and puts the nose where the tail was, so the leading cab is at the north end and the tail
 * stands the same 1.5 m from the buffers.
 */
export function stationPlacement({ standing, heading, length, orientation }) {
  const north = [Math.sin(heading), -Math.cos(heading)];
  if (orientation === 'nose-at-buffers') return { position: [standing.nose[0], 0, standing.nose[1]], rotationY: standing.rotationY };
  if (orientation === 'cab-at-north-end') return { position: [standing.nose[0] + north[0] * length, 0, standing.nose[1] + north[1] * length], rotationY: wrap(standing.rotationY + Math.PI) };
  throw new Error(`unknown station orientation ${orientation}`);
}
/** A train-local point in world metres, for a placement {position, rotationY}: three.js turns local (x, z) to (x cos + z sin, -x sin + z cos). */
export function placedPoint(placement, p) {
  const c = Math.cos(placement.rotationY), s = Math.sin(placement.rotationY);
  return [placement.position[0] + p[0] * c + p[2] * s, placement.position[1] + p[1], placement.position[2] - p[0] * s + p[2] * c];
}
/** The six V10 views of a formation, before any camera is chosen: the focus (train-local), the region whose clear view the check judges, and the car it belongs to. */
export function stationViewSpecs(f) {
  const half = f.half, top = f.roofTop + .3, c0 = f.cars[0], c1 = f.cars[1], y = CATALOGUE.stationFocusHeightM;
  return STATION_VIEW_TABLE.map(([suffix, distanceM, focus]) => {
    const cab = focus === 'cab', car = cab ? c0 : c1;
    const low = CATALOGUE.stationRegionFloorM;
    const region = cab ? box(-half - .3, half + .3, low, top, -.2, CATALOGUE.stationRegionLengthM) : box(-half - .3, half + .3, low, top, c1.start - .01, c1.end + .01);
    return { id: 'V10', suffix, distanceM, focus, focusLocal: [0, y, cab ? CATALOGUE.stationCabFocusZ : q6((c1.start + c1.end) / 2)],
      region: { min: region.min.map(q6), max: region.max.map(q6) }, car: { index: car.index, type: car.type } };
  });
}
/**
 * Candidate cameras for one view at one placement: the focus in world metres, how many positions lie over platforms (`candidateCount`), and every
 * one of them with its exact eye, in two passes. Pass 'spread' is the best few (`thinCandidates`: none within `minSeparationDeg` of another, at
 * most `max`, `spreadCount` of them), in the order the search has always tried them. Pass 'neighbour' is every other position over a platform
 * (the ones thinning dropped, and any past `max`), best first again, tried only when no spread camera is clear. So the search never claims a view
 * has no camera while a platform position at that distance is untried, and a camera the spread pass accepts is the same camera as before.
 */
export function stationCameras({ placement, spec, platforms, inside, stepDeg = 1, edgeClearM = CATALOGUE.platformEdgeClearM, max = CATALOGUE.stationMaxCandidates, minSeparationDeg = CATALOGUE.stationMinSeparationDeg }) {
  const focusWorld = placedPoint(placement, spec.focusLocal), front = wrapDeg(placement.rotationY / D2R + 180), spread = CATALOGUE.stationFrontAngleDeg;
  const all = stationCandidates({ focusXZ: [focusWorld[0], focusWorld[2]], distanceM: spec.distanceM, platforms, inside, stepDeg, edgeClearM, preferredBearingsDeg: [front - spread, front + spread] });
  const kept = thinCandidates(all, minSeparationDeg, max), keptSet = new Set(kept);
  const camera = (c, pass) => {
    const pose = stationPose({ candidate: c, focus: focusWorld, distanceM: spec.distanceM });
    return { azimuthDeg: c.azimuthDeg, platform: c.platform, eye: pose.eye, near: pose.near, pass };
  };
  const candidates = [...kept.map(c => camera(c, 'spread')), ...all.filter(c => !keptSet.has(c)).map(c => camera(c, 'neighbour'))];
  return { focusWorld, candidateCount: all.length, spreadCount: kept.length, candidates };
}
/**
 * The stops, other than the one the specimen stands at (`primary`), where the page's own rules let a train of `lengthM` stand (ALTERNATE_RULE). `stops` are [{ index, id, u, platform, limitM }]:
 * the shed's buffer stops with the platform the page matches each to and that platform's formation limit (null: none). A stop fits when its platform has no limit or the train is no longer than
 * it (trains-live.ts: `layout.length <= limit + 1e-8`). They come nearest `primary` across the shed (`u`, metres across the shed) first, then west to east: the same order on every run, none by hand.
 */
export function alternateStops({ stops, primary = CATALOGUE.stationStopIndex, lengthM }) {
  const home = stops.find(s => s.index === primary)?.u ?? 0;
  return stops.filter(s => s.index !== primary && (s.limitM == null || lengthM <= s.limitM + 1e-8))
    .sort((a, b) => Math.abs(a.u - home) - Math.abs(b.u - home) || a.index - b.index);
}
/** A placement of a plan by its id: one of the kind's own stop, or one of the other stops its views can move to. */
export const findPlacement = (station, id) => (id == null ? null : station.placements.find(p => p.id === id) ?? station.alternates?.find(p => p.id === id) ?? null);
/**
 * Everything V10 needs before the page is asked anything, a pure function of the formation and the station's data: the placements in the
 * order they are tried (each orientation at the chosen buffer stop) with every view's candidate cameras, and one plan row per view. A view
 * with no platform point at its distance from either focus is a GAP already; the rest are OK until the search says otherwise.
 * `inside(xz, pts)` is core/station.ts pointInPolygon; `standing(stop)` is its standingTrainPose at the stop. With `stopInfo` (alternateStops' input) the plan also carries `alternates`:
 * the placements at the other stops the page lets this train stand, in the order they are tried, each with the platform and limit its stop was matched to. They are not searched with the
 * first stop's: a view that has no clear camera there is searched in them (alternatePlacementsFor), and no other view moves.
 */
export function planStation(f, { heading, stops, platforms, inside, standing, stopIndexes = [CATALOGUE.stationStopIndex], orientations = STATION_ORIENTATIONS, stepDeg = 1,
  edgeClearM = CATALOGUE.platformEdgeClearM, max = CATALOGUE.stationMaxCandidates, minSeparationDeg = CATALOGUE.stationMinSeparationDeg, stopInfo = null }) {
  const specs = stationViewSpecs(f), placements = [], alternates = [];
  const place = (index, stop, orientation, extra = {}) => {
    const placement = { id: `stop-${index}-${orientation}`, orientation, stop: { index, id: stop.id, x: stop.x, z: stop.z }, ...extra, ...stationPlacement({ standing: standing(stop), heading, length: f.length, orientation }) };
    placement.views = specs.map(spec => ({ suffix: spec.suffix, region: spec.region, ...stationCameras({ placement, spec, platforms, inside, stepDeg, edgeClearM, max, minSeparationDeg }) }));
    return placement;
  };
  for (const index of stopIndexes) {
    const stop = stops[index];
    if (!stop) continue;
    for (const orientation of orientations) placements.push(place(index, stop, orientation));
  }
  if (stopInfo) for (const s of alternateStops({ stops: stopInfo, primary: stopIndexes[0], lengthM: f.length })) {
    const stop = stops[s.index];
    if (!stop || stopIndexes.includes(s.index)) continue;
    for (const orientation of orientations) alternates.push(place(s.index, stop, orientation, { alternate: { platform: s.platform ?? null, limitM: s.limitM ?? null } }));
  }
  const views = specs.map(spec => {
    const candidateCount = placements.reduce((n, p) => n + p.views.find(v => v.suffix === spec.suffix).candidateCount, 0);
    return { ...spec, status: candidateCount ? 'OK' : 'GAP', candidateCount,
      reason: candidateCount ? null : `no platform point lies exactly ${spec.distanceM} m from the ${spec.focus} focus, in any placement` };
  });
  return { specs, placements, alternates, views, context: { platforms, inside, edgeClearM } };
}
/** Which placement the search settled on: the first with every view clear, else the first with the most clear views (the search stops at the first full one); -1 if none was tried. */
export function chooseStation(report) {
  let best = -1, most = -1;
  report.forEach((r, i) => { if (r.clear > most) { best = i; most = r.clear; } });
  return best;
}
/** The commonest reasons candidates failed, as what blocked them (the occluder's name chain) or, with none, why: [[text, count], ...] most first. */
export function failureSummary(tried, top = 4) {
  const counts = new Map();
  for (const t of tried) if (!t.clear) { const key = t.blocker ? `${t.blocker} (${t.reason})` : t.reason; counts.set(key, (counts.get(key) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, top);
}
const stationBase = (spec, placement, planned, platformHeightM) => ({ id: 'V10', suffix: spec.suffix, frame: 'station', distanceM: spec.distanceM, fov: 50, up: [0, 1, 0], region: spec.region, car: spec.car, platformHeightM,
  focus: { name: spec.focus, local: spec.focusLocal, world: planned?.focusWorld ?? null },
  ...(placement ? { placement: { id: placement.id, orientation: placement.orientation, stop: placement.stop, position: placement.position, rotationY: placement.rotationY },
    rotation: { ruleId: 'station-placement', basis: 'the specimen stands where the real track at the buffer stop puts it; the sun is not consulted', rotationY: placement.rotationY, orientation: placement.orientation } } : {}) });
/** What a station view says of itself in its sidecar. */
const stationNotes = view => ({ focus: view.focus, distanceM: view.distanceM, azimuthDeg: view.azimuthDeg ?? null, platform: view.platform ?? null, placement: view.placement?.id ?? null, orientation: view.placement?.orientation ?? null,
  stop: view.placement?.stop ?? null, eyeAbovePlatformM: CATALOGUE.eyeAbovePlatformM, platformHeightM: view.platformHeightM, sceneryKept: true,
  // a view that moved to another stop says so, and why, wherever its notes are read
  ...(view.search?.alternate ? { movedFrom: view.search.alternate.for, movedBecause: view.search.alternate.reason, platformLimitM: view.search.alternate.platformLimitM ?? null } : {}) });
/**
 * How much of a view's candidate list its search inspected, split by pass. The candidates are listed spread first, then the thinned-out
 * neighbours (stationCameras), so how many were tested says how many of each: `tested` of the `candidateCount` positions over platforms.
 */
const searchCounts = (tested, planned) => {
  const spread = Math.min(tested, planned.spreadCount);
  return { tested, candidateCount: planned.candidateCount, spreadCount: planned.spreadCount, testedSpread: spread, testedNeighbours: tested - spread };
};
/**
 * The six V10 views once the search has run: the chosen placement's accepted cameras as OK views, every other view a GAP that says how many
 * candidate positions were inspected (the spread over the platforms, then the neighbours thinning dropped) and what blocked them, by name.
 * Nothing is invented: a view with no clear camera has no pose.
 */
export function stationViewsFromSearch(station, report, { platformHeightM = CATALOGUE.platformHeightM } = {}) {
  const at = chooseStation(report), chosen = at >= 0 ? report[at] : null, placement = chosen ? findPlacement(station, chosen.placementId) : null;
  const search = { placements: report.map(r => ({ id: r.placementId, clear: r.clear })), chosen: placement?.id ?? null };
  return station.views.map(spec => {
    const planned = placement?.views.find(v => v.suffix === spec.suffix), base = stationBase(spec, placement, planned, platformHeightM), found = chosen?.views[spec.suffix];
    const finish = view => ({ ...view, notes: stationNotes(view) });
    if (spec.status !== 'OK' || !placement) return finish({ ...base, status: 'GAP', reason: spec.reason ?? 'no placement could be searched', search });
    if (found?.accepted == null) {
      const counts = searchCounts(found?.tested ?? 0, planned), failures = failureSummary(found?.tried ?? []);
      const reason = `no clear camera: ${counts.tested} of ${counts.candidateCount} candidate positions over platforms were inspected (${counts.testedSpread} spread over the platforms, then ${counts.testedNeighbours} thinned-out neighbours)${failures.length ? `; blocked by ${failures.map(([k, n]) => `${k} x${n}`).join('; ')}` : ''}`;
      return finish({ ...base, status: 'GAP', reason, blocker: failures[0]?.[0] ?? null, search: { ...search, ...counts, failures } });
    }
    const c = planned.candidates[found.accepted.index];
    return finish({ ...base, status: 'OK', reason: null, eye: c.eye, target: planned.focusWorld, near: c.near, azimuthDeg: c.azimuthDeg, platform: c.platform,
      search: { ...search, ...searchCounts(found.tested, planned), pass: c.pass, rejectedBefore: found.tried.filter(t => !t.clear) } });
  });
}
/**
 * The six V10 views from the frozen manifest of an earlier run: an accepted camera is used exactly as frozen (the placement is the one this
 * run derives, which the drift check has already matched to the frozen one) and nothing is searched; a view frozen as a GAP stays a GAP, with
 * the placement, reason and blocker it was frozen with, so the manifest of a replay freezes to the same numbers as the run it replays.
 */
export function stationViewsFromFrozen(station, held, { platformHeightM = CATALOGUE.platformHeightM } = {}) {
  return station.views.map(spec => {
    const entry = held?.views?.[spec.suffix], p = entry?.plan, placement = findPlacement(station, p?.placement?.id);
    // a view that moved to another stop (ALTERNATE_RULE) keeps its record of where it moved from and why, so a replay of the file says so too
    const planned = placement?.views.find(v => v.suffix === spec.suffix), moved = placement?.alternate ? entry?.outcome?.search?.alternate : undefined, frozen = moved ? { frozen: true, alternate: moved } : { frozen: true };
    const finish = view => ({ ...view, notes: stationNotes(view) });
    if (p?.status !== 'OK' || !placement) return finish({ ...stationBase(spec, placement, planned, platformHeightM), status: 'GAP', reason: entry?.outcome?.reason ?? entry?.reason ?? 'no reason recorded', blocker: entry?.outcome?.blocker ?? null, search: frozen });
    return finish({ ...stationBase(spec, placement, planned, platformHeightM), status: 'OK', reason: null, eye: p.eye, target: p.target, near: p.near, azimuthDeg: p.azimuthDeg, platform: p.platform, search: frozen });
  });
}
/**
 * V10 on frozen poses once the scene has moved on. A frozen camera that the page now finds blocked is searched for again, in the placement it was frozen in, so that a bench
 * or a post another change put in its line does not turn the view into a GAP: the V10 rule (eye 1.7 m over a platform, exactly the view's distance from its focus, a clear
 * line to the specimen) is only ever answered by a search, and a frozen camera is that search's earlier answer. So is a view frozen as a GAP: it was recorded under the candidate
 * list the rule had then (it once stopped at the spread, before the neighbours pass), so it has no camera to replace (eye, bearing and platform are null in what it replaces) and the
 * search, which now tries every position, either finds one or says how many it inspected. Every other view keeps its frozen camera.
 * `blocked` are the capture results of the frozen views that failed their inspection or were frozen as a GAP (the view, the reason, the blocker); `report` is the search of that one placement.
 * Returns `replacements`, the views the search found a camera for (the search's own view, its search block naming the frozen camera it replaces and why it was blocked),
 * and `stays`, for each view it found none for, the reason it stays the GAP it was recorded as (which says both the frozen camera's and the search's).
 */
export function reseatBlockedStationViews(station, blocked, report, opts) {
  const fresh = stationViewsFromSearch(station, report, opts), replacements = [], stays = new Map();
  for (const b of blocked) {
    const f = fresh.find(v => v.suffix === b.view.suffix);
    if (!f) throw new Error(`reseatBlockedStationViews: ${b.view.suffix} is not a V10 view of this plan`);
    // the target is the view's focus, the same for every camera of the view, so only the camera (eye, bearing, platform) and why it failed are kept
    if (f.status === 'OK') {
      // (a view that moved to another stop still says so: its camera was replaced in the stop it moved to)
      const view = { ...f, search: { ...f.search, ...(b.view.search?.alternate ? { alternate: b.view.search.alternate } : {}),
        replacesFrozen: { eye: b.view.eye ?? null, azimuthDeg: b.view.azimuthDeg ?? null, platform: b.view.platform ?? null, reason: b.reason ?? null, blocker: b.blocker ?? b.view.blocker ?? null } } };
      replacements.push({ ...view, notes: stationNotes(view) });
    } else stays.set(b.view.suffix, `${b.reason}; searched again in ${b.view.placement.id}: ${f.reason}`);
  }
  return { replacements, stays };
}
/**
 * The placements of `station.alternates` cut down to the views in `suffixes`: what the page is asked to search for the views that have no clear camera at their stop. The page's search
 * (searchStation) tries the placements in order and stops at the first where every view asked is clear, so a view is searched at as few stops as it needs.
 */
export const alternatePlacementsFor = (station, suffixes) => (station.alternates ?? []).map(p => ({ ...p, views: p.views.filter(v => suffixes.includes(v.suffix)) }));
/**
 * V10 views that had no clear camera at their stop, answered by the search of the other stops (alternatePlacementsFor): `gaps` are [{ view, reason, blocker }], the view as it stands (its
 * placement is the stop it had no camera at), what it was told then and what blocked it; `report` is the page's search. A view takes the first alternate placement in the report that gave
 * it a clear camera: a view of the search's own making, standing in that placement, whose search block says where it moved from and why, and which stops were tried up to it. A view no stop
 * gave a camera stays a GAP, and its reason says both what was tried at its own stop and that every other stop was tried too. Returns `moves` (the new views) and `stays` (suffix -> reason).
 */
export function alternateViewsFromSearch(station, gaps, report, { platformHeightM = CATALOGUE.platformHeightM } = {}) {
  const moves = [], stays = new Map();
  for (const g of gaps) {
    const suffix = g.view.suffix, spec = station.views.find(v => v.suffix === suffix);
    if (!spec) throw new Error(`alternateViewsFromSearch: ${suffix} is not a V10 view of this plan`);
    const stopsTried = report.map(r => {
      const p = findPlacement(station, r.placementId), v = r.views[suffix];
      return { placement: r.placementId, stop: p?.stop?.index ?? null, platform: p?.alternate?.platform ?? null, platformLimitM: p?.alternate?.limitM ?? null, tested: v.tested, clear: v.accepted != null };
    });
    const at = report.findIndex(r => r.views[suffix].accepted != null);
    if (at < 0) {
      const failures = failureSummary(report.flatMap(r => r.views[suffix].tried));
      stays.set(suffix, `${g.reason}; also searched ${report.length} placement(s) at ${new Set(stopsTried.map(s => s.stop)).size} other stop(s) where the page lets this train stand: no clear camera in any`
        + `${failures.length ? `; blocked by ${failures.map(([k, n]) => `${k} x${n}`).join('; ')}` : ''}`);
      continue;
    }
    const hit = report[at], placement = findPlacement(station, hit.placementId), planned = placement.views.find(v => v.suffix === suffix), found = hit.views[suffix], c = planned.candidates[found.accepted.index];
    const alternate = { ruleId: 'alternate-stops-v1', rule: ALTERNATE_RULE, for: g.view.placement?.id ?? null, reason: g.reason ?? null, blocker: g.blocker ?? null, chosen: hit.placementId,
      platformLimitM: placement.alternate?.limitM ?? null, stopsTried: stopsTried.slice(0, at + 1) };
    const view = { ...stationBase(spec, placement, planned, platformHeightM), status: 'OK', reason: null, eye: c.eye, target: planned.focusWorld, near: c.near, azimuthDeg: c.azimuthDeg, platform: c.platform,
      search: { placements: report.slice(0, at + 1).map(r => ({ id: r.placementId, clear: r.clear })), chosen: hit.placementId, ...searchCounts(found.tested, planned), pass: c.pass,
        rejectedBefore: found.tried.filter(t => !t.clear), alternate } };
    moves.push({ ...view, notes: stationNotes(view) });
  }
  return { moves, stays };
}
/**
 * Every way the frozen V10 poses of one kind differ from what this run derives: a view missing, a placement this run cannot derive (or two
 * placements of the kind's own stop in one kind; a view that moved to another stop, ALTERNATE_RULE, stands in a placement of its own and is checked like any other), a camera that no
 * longer lies exactly `distanceM` from the focus over a platform, or numbers that moved by more than `tol`.
 */
export function stationFrozenDrift(station, held, { tol = 1e-6 } = {}) {
  const drifts = [], { platforms, inside, edgeClearM } = station.context;
  let placementId = null;
  for (const spec of station.views) {
    const p = held?.views?.[spec.suffix]?.plan;
    if (!p) { drifts.push({ view: spec.suffix, reason: 'view missing from the frozen poses' }); continue; }
    if (p.status !== 'OK') continue;
    const placement = findPlacement(station, p.placement?.id);
    if (!placement) { drifts.push({ view: spec.suffix, reason: 'frozen placement is not one this run derives', at: '/placement/id' }); continue; }
    // a view that moved to another stop (ALTERNATE_RULE) stands in a placement of its own; every other view of the kind shares the kind's
    if (!placement.alternate) {
      if (placementId !== null && placementId !== placement.id) { drifts.push({ view: spec.suffix, reason: 'views of one kind must share one placement', at: '/placement/id' }); continue; }
      placementId = placement.id;
    }
    const wanted = { orientation: placement.orientation, stop: placement.stop, position: placement.position, rotationY: placement.rotationY };
    const placementAt = poseDifference(wanted, { orientation: p.placement.orientation, stop: p.placement.stop, position: p.placement.position, rotationY: p.placement.rotationY }, tol, '/placement');
    if (placementAt !== null) { drifts.push({ view: spec.suffix, reason: 'placement differs from the frozen placement', at: placementAt }); continue; }
    const focus = placedPoint(placement, spec.focusLocal), camera = stationCameraAt({ focusXZ: [focus[0], focus[2]], distanceM: spec.distanceM, azimuthDeg: p.azimuthDeg, platforms, inside, edgeClearM });
    if (!camera) { drifts.push({ view: spec.suffix, reason: 'the frozen camera is no longer over a platform', at: '/azimuthDeg' }); continue; }
    const pose = stationPose({ candidate: camera, focus, distanceM: spec.distanceM });
    const at = poseDifference({ eye: pose.eye, target: pose.target, fov: pose.fov, near: pose.near, up: pose.up, distanceM: spec.distanceM, platform: camera.platform, region: spec.region },
      { eye: p.eye, target: p.target, fov: p.fov, near: p.near, up: p.up, distanceM: p.distanceM, platform: p.platform, region: p.region }, tol);
    if (at !== null) drifts.push({ view: spec.suffix, reason: 'pose differs from the frozen pose', at });
  }
  return drifts;
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
 * past each end of the train. The page's lights, fog, renderer and background are left alone. `zRange` ([z0, z1]) replaces the length and margin with
 * an explicit run, for a stage the specimen drives along (M01) instead of standing on.
 */
export function buildCatalogueStage(T, { length, margin = 60, zRange } = {}) {
  const g = new T.Group();
  g.name = 'capture-stage';
  g.userData = { captureOwned: true, note: 'capture-only neutral specimen stage; not part of the model' };
  const [z0, z1] = zRange ?? [-margin, length + margin], span = z1 - z0, mid = (z0 + z1) / 2, lambert = color => new T.MeshLambertMaterial({ color });
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

// ---- the page's own DOM, which must not be in a picture --------------------------------------------------------------------------------------
// A picture is the canvas and the capture label. Everything else the page puts on screen (the title chip, the status and credit lines, the station
// tabs and their notice, the Almanac button, a train board or tooltip, any overlay) is chrome. It is found by structure, not by a list of names, so
// a page that grows another bar is covered: the chrome is every element of the body that is not the canvas, not on the way to it, and not kept.
const UNDRAWN_TAGS = new Set(['HEAD', 'SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT', 'TITLE', 'BASE']);
/** A short name for an element in a sidecar: tag, #id and .classes. */
export const domName = el => {
  const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
  return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + classes.map(c => `.${c}`).join('');
};
const round1 = v => Math.round(v * 10) / 10 + 0;
const boxOf = el => { const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(round1); };
/** Does the element put pixels in the frame: a box with area that meets the viewport, not visibility:hidden, not fully transparent. (`display: none` anywhere above it leaves no box.) */
export function isDrawn(el, win) {
  const style = win.getComputedStyle(el);
  if (style.visibility === 'hidden' || Number.parseFloat(style.opacity) === 0) return false;
  return Array.from(el.getClientRects()).some(r => r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < win.innerWidth && r.top < win.innerHeight);
}
const keptElements = (doc, { canvas, keepIds = [] }) => [canvas, ...keepIds.map(id => doc.getElementById(id))].filter(Boolean);
/** The page's chrome as a list of elements: those children of the body, or of anything on the way to a kept element, that are neither kept nor on that way. */
export function pageChrome(doc, options) {
  const keep = keptElements(doc, options), chrome = [];
  const walk = parent => {
    for (const el of parent.children) {
      if (UNDRAWN_TAGS.has(el.tagName) || keep.includes(el)) continue;
      if (keep.some(k => el.contains(k))) walk(el); else chrome.push(el);
    }
  };
  walk(doc.body);
  return chrome;
}
/**
 * Hide all of the page's chrome (inline `display: none !important`, so no stylesheet rule can bring it back), whether it is drawn now or not, so what
 * it holds later stays hidden too. `hidden` is the list of records so far; each new element gets one: its name, whether it was drawn, where, and the
 * inline display it had, which `restoreChrome` puts back. Calling it again hides what the page has added since. Returns `hidden`.
 */
export function hideChrome(doc, win, { canvas, keepIds = [], hidden = [] }) {
  const have = new Set(hidden.map(r => r.el));
  for (const el of pageChrome(doc, { canvas, keepIds })) {
    if (have.has(el)) continue;
    const drawn = isDrawn(el, win);
    hidden.push({ el, name: domName(el), drawn, box: drawn ? boxOf(el) : null, was: { value: el.style.getPropertyValue('display'), priority: el.style.getPropertyPriority('display') } });
    el.style.setProperty('display', 'none', 'important');
  }
  return hidden;
}
/** Put every hidden element's inline display back as it was, and empty the list. */
export function restoreChrome(hidden) {
  for (const { el, was } of hidden) { if (was.value === '') el.style.removeProperty('display'); else el.style.setProperty('display', was.value, was.priority); }
  hidden.length = 0;
}
/** What the frame would show besides the canvas and the kept elements: [{name, box}] of every drawn element outside them (empty when the chrome is all hidden). */
export function visibleChrome(doc, win, options) {
  const keep = keptElements(doc, options), seen = [];
  const walk = parent => {
    for (const el of parent.children) {
      if (UNDRAWN_TAGS.has(el.tagName) || keep.includes(el)) continue;
      if (keep.some(k => el.contains(k))) { walk(el); continue; }
      if (isDrawn(el, win)) seen.push({ name: domName(el), box: boxOf(el) }); else walk(el);
    }
  };
  walk(doc.body);
  return seen;
}
/** Specimen and stage share one rigid transform: the vertical-axis rotation the sun rule asks for. V10 has no stage (the station is the stage): it passes null. */
export function placeStageSpecimen(group, stage, rotationY, position = [0, 0, 0]) {
  for (const o of [group, stage]) if (o) { o.position.set(...position); o.rotation.set(0, rotationY, 0); o.updateMatrixWorld(true); }
}
/** The triangles and draw calls one mesh costs: its draw range, a material array by its groups, nothing for a mesh whose materials are all invisible. */
function meshCost(o) {
  const g = o.geometry, n = Math.min(g.drawRange.count, (g.index?.count ?? g.attributes.position.count) - g.drawRange.start), none = { triangles: 0, drawCalls: 0 };
  if (!o.material || n <= 0) return none;
  const materials = Array.isArray(o.material) ? o.material : [o.material];
  if (materials.every(m => m.visible === false || m.opacity === 0)) return none;
  if (Array.isArray(o.material) && g.groups.length) {
    let triangles = 0, drawCalls = 0;
    for (const part of g.groups) if (o.material[part.materialIndex]?.visible !== false) { drawCalls++; triangles += part.count / 3; }
    return { triangles, drawCalls };
  }
  return { triangles: n / 3, drawCalls: 1 };
}
/** The cost of every mesh at or below `object`, shown or not (a level of detail that is hidden still has its cost). */
export function objectCost(object) {
  let triangles = 0, drawCalls = 0;
  object.traverse(o => { if (!o.isMesh) return; const c = meshCost(o); triangles += c.triangles; drawCalls += c.drawCalls; });
  return { triangles, drawCalls };
}
/** Static triangles and draw calls of a train, counted exactly as .scratch/train-rubric/measure-costs.mjs does. Call it after the frame is rendered, so the LODs are the ones drawn. */
export function trainCosts(group) {
  let triangles = 0, drawCalls = 0;
  group.traverseVisible(o => { if (!o.isMesh) return; const c = meshCost(o); triangles += c.triangles; drawCalls += c.drawCalls; });
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
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material], sides = materials.map(m => m.side);
    // an inside-out shell (the page's sky dome) is drawn to be looked at from inside: a camera within it is where it belongs
    if (materials.every(m => m.side === T.BackSide)) continue;
    if (mesh.isInstancedMesh) { if (!mesh.boundingBox) mesh.computeBoundingBox(); box.copy(mesh.boundingBox); }
    else { if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox(); box.copy(mesh.geometry.boundingBox); }
    if (!box.applyMatrix4(mesh.matrixWorld).containsPoint(point)) continue;
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
/** The options V10's check runs with, in the search and in the final check alike, so a camera the search calls clear is clear to the picture. */
export const stationCheckOptions = () => ({ minScreenSpan: CATALOGUE.stationMinScreenSpan });
/**
 * The V10 search, in the page. For each placement in order the specimen is stood there and, view by view, its candidate cameras are tried best
 * first; the first whose check (`inspectCatalogueView`) is clear is accepted and the rest of that view is not tried. A placement with every view
 * clear ends the search. A camera is clear by the check or it is not; every failure is recorded with its reason and the occluder's name chain.
 */
export function searchStation(T, { scene, camera, controls, group, ground }, placements) {
  const report = [];
  for (const placement of placements) {
    placeStageSpecimen(group, null, placement.rotationY, placement.position);
    const views = {};
    let clear = 0;
    for (const view of placement.views) {
      const tried = [];
      let accepted = null;
      for (const [index, c] of view.candidates.entries()) {
        setWorldView(T, camera, controls, { eye: c.eye, target: view.focusWorld, fov: 50, up: [0, 1, 0], near: c.near });
        const r = inspectCatalogueView(T, scene, camera, group, ground, { region: view.region }, stationCheckOptions());
        tried.push({ azimuthDeg: c.azimuthDeg, platform: c.platform, pass: c.pass ?? null, clear: r.clear, reason: r.clear ? null : r.reason, blocker: r.blocker ?? null });
        if (r.clear) { accepted = { index, azimuthDeg: c.azimuthDeg }; break; }
      }
      views[view.suffix] = { tested: tried.length, accepted, tried };
      if (accepted) clear++;
    }
    report.push({ placementId: placement.id, clear, views });
    if (clear === placement.views.length) break;
  }
  return report;
}

// ============================================================================================
// M01 (opt-in): the motion clip. The specimen drives away from a fixed camera along a neutral straight stage and, after every frame, the page is asked which level of
// detail each bogie is drawn at and how far it is from the camera. The plan and the verdicts are plain numbers (the Node tests pin each of them); the readers take THREE
// and run in the page. M01 is not in VIEW_IDS: a run that is not asked for it neither plans it nor refuses on poses frozen before it existed.
// ============================================================================================
/** The views a run can be asked for (`--views`) besides VIEW_IDS, which are the ones it takes when it is not asked. */
export const OPT_IN_VIEW_IDS = Object.freeze(['M01', 'C01']);
export const ASKABLE_VIEW_IDS = Object.freeze([...VIEW_IDS, ...OPT_IN_VIEW_IDS]);
/**
 * The clip's numbers, one set for every kind. `lodDistanceM` is web/src/train-parts.ts BOGIE_LOD_DISTANCE (a test pins the two equal): at that distance or more a bogie is
 * drawn bare. 20 m/s (72 km/h), a frame a second, 16 frames: 300 m, enough for the last bogie of the longest kind to pass 150 m from the camera. The camera is V10's (its eye
 * 1.7 m above a platform surface that is .9 m above the rail head, FOV 50, 1600x1000), `lateralM` from the track axis on the -x side, the side the page sun is on, so the
 * near side of the train is lit; 3.3 m is where V10's platform 5 camera stands at stop 3 (the edge is 2.80 m from the axis at the nose, and a camera stands .5 m inside
 * it), but the stage has no platform. The stage and the path run along -z (the page's north) from z = 160 to z = -540: 160 m behind the camera, and `slackM` or more past the
 * nose of the longest kind in the last frame.
 */
export const MOTION = Object.freeze({
  id: 'M01', suffix: 'motion', stage: 'neutral-straight',
  speedMps: 20, stepS: 1, frames: 16, minFrames: 12,
  lodDistanceM: 150, boundaryMarginM: .05, distanceToleranceM: 1e-6,
  lateralM: 3.3, targetAheadM: 100, fov: 50,
  zRange: Object.freeze([-540, 160]), routeStepM: 50, slackM: 100,
  /** the near plane must clear every vertex bounding box by this much more than the radius of the near volume */
  clearanceMarginM: .25,
  /** the contact sheet: tiles of tileWidth x tileHeight (the frame at a quarter of its size), this many to a row, gap pixels apart */
  sheet: Object.freeze({ columns: 4, tileWidth: 400, tileHeight: 250, gap: 8 }),
});
/** What every sidecar, manifest entry and note says of the stage. */
export const MOTION_STAGE = `${MOTION.stage} (scenery hidden)`;
/** How the clip is made, for the manifest and every sidecar. */
export const MOTION_RULE = 'M01 (opt-in, day only). One clip per kind on one neutral straight stage with the page scenery hidden: a 700 m run along -z, the page\'s north, from z = 160 to z = -540. '
  + 'The specimen is posed with the page\'s own carPoses (web/src/trains-live.ts) over a synthetic straight path and moves at a constant speed: frame i has the nose i x speed x step '
  + 'metres further along than frame 0, in which the middle of the train is level with the camera. The camera is fixed for the whole clip and looks along the track: V10\'s eye height '
  + '(1.7 m above a platform surface .9 m above the rail head), FOV 50, 1600x1000, 3.3 m from the track axis on the -x side, the side the page sun is on. 3.3 m is where V10\'s platform 5 '
  + 'camera stands at stop 3 (the edge is 2.80 m from the axis at the nose of the train and a camera stands .5 m inside it), but the stage has no platform. After every frame the page is asked, '
  + 'for every bogie, which level of detail it is drawn at and how far it is from the camera. Both must equal what the geometry predicts (a bogie is drawn bare at 150 m or more), every bogie '
  + 'must change from full to bare exactly once inside the clip, and the near plane must clear the bounding box of every vertex of the train in every frame. Any difference is a GAP with '
  + 'its reason, never a quiet pass.';
/** Why the clip is not in the station scene, said once in the notes. */
export const MOTION_STATION_NOTE = 'No clip is in the station scene: the station scene could not hold the longest kinds. Walking north from each of the shed\'s buffer stops by the straightest '
  + 'edge at every junction, there are 422-436 m of open track before the first tunnel edge, and lner9, gn387x12 and tl700x12 need 496-514 m (from the tail at the start of the clip to the '
  + 'nose when their last bogie passes 150 m from the camera). V10 remains the in-station evidence.';

/** The fixed camera of the clip, in world metres: the origin is level with the middle of the train in the first frame, the train drives toward -z. */
export function motionCamera({ aspect = CATALOGUE.aspect } = {}) {
  const eye = [q6(-MOTION.lateralM), q6(CATALOGUE.platformHeightM + CATALOGUE.eyeAbovePlatformM), 0], target = [eye[0], eye[1], q6(-MOTION.targetAheadM)];
  return { eye, target, fov: MOTION.fov, up: [0, 1, 0], near: catalogueNear(eye, target), aspect };
}
/**
 * The radius of a ball about the eye that holds the whole near volume, the frustum from the eye to the near plane: its far corners are near x sqrt(1 + tan(fov/2)^2 +
 * (tan(fov/2) x aspect)^2) from the eye. A box farther than this from the eye cannot be cut by the near plane.
 */
export function nearClipRadius({ near, fov, aspect }) {
  const v = Math.tan(fov * D2R / 2), h = v * aspect;
  return near * Math.sqrt(1 + v * v + h * h);
}
/**
 * Every frame of the clip for one formation, from the geometry alone, before the page is asked anything. `f` is describeFormation's plain description. The nose is at
 * z = -length/2 - travel (the train faces -z, its middle level with the camera at the origin in frame 0) and each bogie stands its own distance behind the nose, so its
 * distance from the camera is known in every frame and so is the level of detail the page must draw (level 1, the bare bogie, at `lodDistanceM` or more). The plan is OK only
 * if every bogie is full in the first frame and bare in the last, changes level exactly once and is never within `boundaryMarginM` of the boundary, the stage reaches `slackM`
 * past the last nose and behind the first tail, the clip has enough frames and the near volume is clear of the side of the train; otherwise it is a GAP with every reason.
 */
export function planMotion(f, { speedMps = MOTION.speedMps, stepS = MOTION.stepS, frames: count = MOTION.frames } = {}) {
  const L = f.length, lod = MOTION.lodDistanceM, camera = motionCamera(), eye = camera.eye, [zFar, zBehind] = MOTION.zRange;
  const frames = Array.from({ length: count }, (_, i) => {
    const travelM = q6(i * speedMps * stepS), noseZ = q6(-L / 2 - travelM);
    return { index: i, number: i + 1, timeS: q6(i * stepS), travelM, noseZ, middleZ: q6(-travelM), tailZ: q6(L / 2 - travelM),
      cabDistanceM: Math.hypot(eye[0], eye[1] - CATALOGUE.stationFocusHeightM, eye[2] - (noseZ + CATALOGUE.stationCabFocusZ)) };
  });
  const bogies = f.cars.flatMap(c => c.bogies.map((z, k) => {
    const distanceM = frames.map(r => Math.hypot(eye[0], eye[1], r.noseZ + z - eye[2]));
    return { name: `bogie-${c.index}-${k}`, car: c.index, k, z, distanceM, level: distanceM.map(d => d >= lod ? 1 : 0) };
  }));
  const flips = bogies.map(t => {
    let nearToFar = 0, farToNear = 0, first = null;
    for (let i = 1; i < t.level.length; i++) if (t.level[i] !== t.level[i - 1]) { if (t.level[i] === 1) { nearToFar++; first ??= i; } else farToNear++; }
    return { name: t.name, car: t.car, k: t.k, nearToFar, farToNear, firstFarIndex: first, lastNearIndex: first === null ? null : first - 1,
      nearDistanceM: first === null ? null : t.distanceM[first - 1], farDistanceM: first === null ? null : t.distanceM[first] };
  });
  const margin = Math.min(...bogies.flatMap(t => t.distanceM.map(d => Math.abs(d - lod))));
  const lateralGapM = Math.abs(eye[0]) - f.half, clipRadiusM = nearClipRadius(camera), needM = clipRadiusM + MOTION.clearanceMarginM;
  const finalNoseZ = frames.at(-1).noseZ, startTailZ = frames[0].tailZ, problems = [];
  if (count < MOTION.minFrames) problems.push(`the clip has ${count} frames, fewer than ${MOTION.minFrames}`);
  for (const t of bogies) if (t.level[0] !== 0) problems.push(`${t.name} is already drawn bare in the first frame (${t.distanceM[0].toFixed(1)} m)`);
  for (const t of bogies) if (t.level.at(-1) !== 1) problems.push(`${t.name} is still drawn in full in the last frame (${t.distanceM.at(-1).toFixed(1)} m)`);
  for (const x of flips) if (x.nearToFar !== 1 || x.farToNear !== 0) problems.push(`${x.name} changes level ${x.nearToFar} times to bare and ${x.farToNear} times to full, not once to bare`);
  if (margin < MOTION.boundaryMarginM) problems.push(`a bogie is ${margin.toFixed(3)} m from the ${lod} m boundary in some frame, under the ${MOTION.boundaryMarginM} m margin`);
  if (finalNoseZ - MOTION.slackM < zFar) problems.push(`the stage ends at z = ${zFar}, under ${MOTION.slackM} m past the nose of the last frame (z = ${finalNoseZ})`);
  if (startTailZ > zBehind) problems.push(`the tail of the first frame (z = ${startTailZ}) is behind the start of the stage (z = ${zBehind})`);
  if (lateralGapM < needM) problems.push(`the camera is ${lateralGapM.toFixed(2)} m from the side of the train, under the ${needM.toFixed(2)} m its near volume and margin need`);
  const travelM = q6((count - 1) * speedMps * stepS), trackLengthM = zBehind - zFar;
  const clip = { stage: MOTION.stage, scenery: 'hidden', zRange: [...MOTION.zRange], trackLengthM, direction: 'toward -z, nose first', speedMps, stepS, frames: count, travelM,
    lodDistanceM: lod, start: 'the middle of the train level with the camera', camera: 'fixed for the whole clip' };
  return { id: MOTION.id, suffix: MOTION.suffix, frame: 'motion', status: problems.length ? 'GAP' : 'OK', reason: problems.length ? problems.slice(0, 6).join('; ') + (problems.length > 6 ? `; and ${problems.length - 6} more` : '') : null,
    lengthM: L, camera, clip, bogies, frames, flips,
    clearance: { lateralGapM: q6(lateralGapM), clipRadiusM, marginM: MOTION.clearanceMarginM, ok: lateralGapM >= needM },
    checks: { minBoundaryMarginM: margin, finalNoseZ, startTailZ, stageSlackM: q6(finalNoseZ - zFar) },
    notes: { stage: MOTION_STAGE, trackLengthM, speedMps, stepS, frames: count, travelM, lodDistanceM: lod,
      camera: `fixed for the whole clip: ${MOTION.lateralM} m to the -x (sun) side of the track axis, ${eye[1]} m above the rail head (V10's eye height), level with the middle of the train at the start, looking along the track`,
      rule: MOTION_RULE, stationScene: MOTION_STATION_NOTE } };
}
/** The numbers that define a clip, for freezing and comparison (what the page read is not part of the plan). */
export const motionPoseOf = p => ({ status: p.status, lengthM: p.lengthM, camera: p.camera, clip: p.clip, flips: p.flips.map(x => [x.name, x.firstFarIndex]) });

/** Distance from a point to an axis-aligned box ({ min, max }); 0 inside it. */
export function boxDistance(box, p) {
  return Math.hypot(Math.max(box.min[0] - p[0], 0, p[0] - box.max[0]), Math.max(box.min[1] - p[1], 0, p[1] - box.max[1]), Math.max(box.min[2] - p[2], 0, p[2] - box.max[2]));
}
/** The names from `root` down to an object ('car-3/body-shell'); an unnamed object is its type. */
const pathBelow = (o, root) => { const names = []; for (let p = o; p && p !== root; p = p.parent) names.unshift(p.name || p.type); return names.join('/'); };
/**
 * The world-space bounding box of the vertices of every visible mesh below `object`, one box per mesh, with the path of the mesh. Every vertex is moved to the world, so a
 * turned mesh keeps a tight box (a local box carried over would be looser). A mesh whose vertices are not its geometry's (instanced, skinned) cannot be bounded this way,
 * and the check stops rather than pass it.
 */
export function vertexBoxes(T, object) {
  object.updateWorldMatrix(true, true);
  const boxes = [], v = new T.Vector3();
  object.traverseVisible(o => {
    if (!o.isMesh) return;
    if (o.isInstancedMesh || o.isSkinnedMesh) throw new Error(`${pathBelow(o, object)} is ${o.isInstancedMesh ? 'instanced' : 'skinned'}: its vertices are not its geometry's, so its box cannot be bounded from the geometry`);
    const pos = o.geometry.attributes.position;
    if (!pos || !pos.count) return;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.x < min[0]) min[0] = v.x; if (v.x > max[0]) max[0] = v.x;
      if (v.y < min[1]) min[1] = v.y; if (v.y > max[1]) max[1] = v.y;
      if (v.z < min[2]) min[2] = v.z; if (v.z > max[2]) max[2] = v.z;
    }
    boxes.push({ name: pathBelow(o, object), min, max, vertices: pos.count });
  });
  return boxes;
}
/**
 * Does the near plane clear every box? The near volume (the frustum from the eye to the near plane) lies within `clipRadiusM` of the eye (nearClipRadius), so a box at least that
 * far from the eye, plus `marginM`, cannot be cut by the near plane. No box at all is not clear: a frame of an empty specimen proves nothing.
 */
export function checkNearClearance(boxes, eye, { near, fov, aspect, marginM = 0 }) {
  const clipRadiusM = nearClipRadius({ near, fov, aspect }), needM = clipRadiusM + marginM;
  const distances = boxes.map(b => ({ name: b.name, distanceM: boxDistance(b, eye) }));
  const nearest = distances.reduce((best, d) => !best || d.distanceM < best.distanceM ? d : best, null);
  const cut = distances.filter(d => d.distanceM < needM).sort((a, b) => a.distanceM - b.distanceM), violations = cut.slice(0, 8);
  const ok = boxes.length > 0 && cut.length === 0;
  return { check: 'near-plane clearance of the bounding box of every vertex', ok,
    reason: !boxes.length ? 'the specimen has no visible geometry to clear' : cut.length ? `the near plane (near ${near} m, clip radius ${clipRadiusM.toFixed(3)} m, margin ${marginM} m) is cut by ${cut.length} bounding box(es), the nearest ${cut[0].name} at ${cut[0].distanceM.toFixed(3)} m` : null,
    nearM: near, clipRadiusM, marginM, boxes: boxes.length, minDistanceM: nearest?.distanceM ?? null, nearest, violationCount: cut.length, violations };
}
/**
 * Pose the cars as web/src/trains-live.ts createLiveTrains.update does: every child of the train hidden, then each posed car shown at its position, turned and stretched, and
 * each of its bogies turned to the track. `cars` are { index, position: [x, z], rotationY, scaleZ, bogies: [{ k, rotationY }] }.
 */
export function applyCarPoses(group, cars) {
  for (const node of group.children) node.visible = false;
  for (const c of cars) {
    const node = group.getObjectByName(`car-${c.index}`);
    if (!node) throw new Error(`the specimen has no car-${c.index}`);
    node.visible = true;
    node.position.set(c.position[0], 0, c.position[1]);
    node.rotation.y = c.rotationY;
    node.scale.set(1, 1, c.scaleZ);
    for (const b of c.bogies) {
      const bogie = node.getObjectByName(`bogie-${c.index}-${b.k}`);
      if (!bogie) throw new Error(`car-${c.index} has no bogie-${c.index}-${b.k}`);
      bogie.rotation.y = b.rotationY;
    }
  }
  group.updateMatrixWorld(true);
}
/** The leading cab as V01 looks at it: 1.7 m up and 1.5 m behind the nose, on car 0, in world metres. */
export function leadingCabPoint(T, group) {
  group.updateMatrixWorld(true);
  const car = group.getObjectByName('car-0');
  if (!car) throw new Error('the specimen has no car-0');
  return car.localToWorld(new T.Vector3(0, CATALOGUE.stationFocusHeightM, CATALOGUE.stationCabFocusZ));
}
/**
 * What the page drew each bogie as, read AFTER the frame was rendered (the renderer is what updates a LOD): for every visible LOD, its bogie's name, the level it reports
 * (getCurrentLevel: 0 the full bogie, 1 the bare one), its distance from the camera as THREE measures it, its level table, which of its meshes are shown and what each level
 * costs (triangles and draw calls, counted as trainCosts counts, shown or not), whether the meshes shown are exactly the one the level names (`consistent`), and whether the bogie
 * is inside the camera's frame.
 */
export function readBogieLods(T, group, camera) {
  group.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const eye = new T.Vector3().setFromMatrixPosition(camera.matrixWorld), p = new T.Vector3(), ndc = new T.Vector3(), out = [];
  group.traverseVisible(o => {
    if (!o.isLOD) return;
    const name = o.parent?.name ?? '', m = /^bogie-(\d+)-(\d+)$/.exec(name), level = o.getCurrentLevel(), shown = o.levels.map(l => l.object.visible);
    p.setFromMatrixPosition(o.matrixWorld);
    ndc.copy(p).project(camera);
    out.push({ name, car: m ? Number(m[1]) : null, k: m ? Number(m[2]) : null, level, distanceM: eye.distanceTo(p) / camera.zoom, world: p.toArray(),
      consistent: shown.filter(Boolean).length === 1 && shown[level] === true,
      levels: o.levels.map(l => ({ lod: l.object.userData?.lod ?? null, fromM: l.distance, visible: l.object.visible, ...objectCost(l.object) })),
      inFrame: ndc.z > -1 && ndc.z < 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 });
  });
  return out;
}
/**
 * What is wrong with the cars the page has (`have`: each car node's name, visibility and transform, as the in-page driver reads them) against the cars the capture posed
 * (`applied`): a different number of them, or one that is hidden, not where it was put, turned or stretched.
 */
export function appliedCarProblems(applied, have) {
  const problems = [], want = new Map(applied.map(c => [`car-${c.index}`, c]));
  if (have.length !== want.size) problems.push(`the specimen has ${have.length} cars, the capture posed ${want.size}`);
  for (const c of have) {
    const w = want.get(c.name);
    if (!(w && c.visible === true && Math.abs(c.position[0] - w.position[0]) < 1e-9 && Math.abs(c.position[2] - w.position[1]) < 1e-9 && Math.abs(c.rotationY - w.rotationY) < 1e-9 && Math.abs(c.scaleZ - w.scaleZ) < 1e-9)) problems.push(`${c.name} is not where the capture put it`);
  }
  return problems;
}
/**
 * The bogies a page reports against the bogies a plan has, matched by name: each planned bogie the page reported, as [planned, reported] in the plan's order. A bogie reported twice, one the
 * plan has not and a planned bogie the page left out are pushed onto `problems`.
 */
function reportedBogies(plan, reported, problems) {
  const seen = new Map(), planned = new Set(plan.map(t => t.name)), pairs = [];
  for (const b of reported) { if (seen.has(b.name)) problems.push(`the page reports ${b.name || 'an unnamed bogie'} twice`); seen.set(b.name, b); if (!planned.has(b.name)) problems.push(`the page reports ${b.name || 'an unnamed bogie'}, which the plan has not`); }
  for (const t of plan) {
    const r = seen.get(t.name);
    if (!r) { problems.push(`the page reports no ${t.name}`); continue; }
    pairs.push([t, r]);
  }
  return pairs;
}
/**
 * One frame of a clip against its plan. `read` is what the page said after the frame: `bogies` (readBogieLods), `clearance` (checkNearClearance), `costs` (trainCosts),
 * `cabDistanceM` and `cars` (the transform each car node actually has). `applied` is the cars the capture asked the page to pose.
 * `gap` is a reason the frame cannot be a picture of the clip (the near plane is cut by the train); `problems` are a page that is not in the state it was asked to be in
 * (a bogie missing or twice, a car not where it was put), which also makes the frame a GAP; `mismatches` are readings that differ from the geometry's prediction, which fail
 * the clip but leave the pictures standing as evidence of what the page drew. `baseTriangles` is what the train draws besides its bogies.
 */
export function judgeMotionFrame(plan, index, read, applied = null, { toleranceM = MOTION.distanceToleranceM } = {}) {
  const lod = plan.clip.lodDistanceM, mismatches = [], problems = [], rows = [];
  let maxDistanceErrorM = 0;
  for (const [t, r] of reportedBogies(plan.bogies, read.bogies, problems)) {
    const predicted = { level: t.level[index], distanceM: t.distanceM[index] }, errorM = Math.abs(r.distanceM - predicted.distanceM), got = { level: r.level, distanceM: r.distanceM };
    maxDistanceErrorM = Math.max(maxDistanceErrorM, errorM);
    if (r.level !== predicted.level) mismatches.push({ frame: index, bogie: t.name, why: 'level', predicted, read: got });
    if (!(errorM <= toleranceM)) mismatches.push({ frame: index, bogie: t.name, why: 'distance', predicted, read: got });
    if (r.levels.length !== 2 || r.levels[0].fromM !== 0 || r.levels[1].fromM !== lod) mismatches.push({ frame: index, bogie: t.name, why: 'level table', predicted: { fromM: [0, lod] }, read: { fromM: r.levels.map(l => l.fromM) } });
    if (!r.consistent) mismatches.push({ frame: index, bogie: t.name, why: 'meshes shown', predicted, read: { ...got, shown: r.levels.map(l => l.visible) } });
    rows.push({ name: t.name, car: t.car, k: t.k, level: r.level, distanceM: r.distanceM, predictedLevel: predicted.level, predictedDistanceM: predicted.distanceM, errorM, triangles: r.levels[r.level]?.triangles ?? null, inFrame: r.inFrame });
  }
  const cabErrorM = Math.abs(read.cabDistanceM - plan.frames[index].cabDistanceM);
  if (!(cabErrorM <= toleranceM)) mismatches.push({ frame: index, bogie: null, why: 'cab distance', predicted: { distanceM: plan.frames[index].cabDistanceM }, read: { distanceM: read.cabDistanceM } });
  if (applied) problems.push(...appliedCarProblems(applied, read.cars ?? []));
  const baseTriangles = rows.length === plan.bogies.length && rows.every(w => w.triangles !== null) ? read.costs.triangles - rows.reduce((n, w) => n + w.triangles, 0) : null;
  return { gap: read.clearance.ok ? null : read.clearance.reason, mismatches, problems, rows, maxDistanceErrorM, cabErrorM, baseTriangles };
}
/**
 * The whole clip. `frames` are each { index, status, reason, read, judged } (`judged` is judgeMotionFrame's). The clip is OK only if every frame is, every reading matched the
 * plan, each bogie changed level exactly when and as often as planned, and the triangles the train draws besides its bogies are the same in every frame (so the levels reported
 * are the meshes drawn). A GAP frame is a GAP clip, and so is a reading that differs from the plan: a difference is never a quiet pass.
 */
export function judgeMotionClip(plan, frames) {
  const problems = [], mismatches = frames.flatMap(f => f.judged.mismatches), gaps = frames.filter(f => f.status !== 'OK');
  if (frames.length !== plan.frames.length) problems.push(`the clip has ${frames.length} frames, the plan ${plan.frames.length}`);
  for (const f of frames) for (const p of f.judged.problems) problems.push(`frame ${f.index + 1}: ${p}`);
  const flips = plan.flips.map(p => {
    const rows = frames.map(f => f.judged.rows.find(w => w.name === p.name) ?? null), levels = rows.map(w => w?.level ?? null);
    let nearToFar = 0, farToNear = 0, first = null;
    for (let i = 1; i < levels.length; i++) if (levels[i] !== levels[i - 1]) { if (levels[i] === 1) { nearToFar++; first ??= i; } else farToNear++; }
    return { name: p.name, nearToFar, farToNear, firstFarIndex: first, lastNearIndex: first === null ? null : first - 1, plannedFirstFarIndex: p.firstFarIndex,
      lastNearDistanceM: first === null ? null : rows[first - 1]?.distanceM ?? null, firstFarDistanceM: first === null ? null : rows[first]?.distanceM ?? null,
      equal: nearToFar === 1 && farToNear === 0 && first === p.firstFarIndex && levels.length === plan.frames.length && levels.every(l => l !== null) };
  });
  for (const x of flips) if (!x.equal) problems.push(`${x.name} was read changing to bare ${x.nearToFar} times (first at frame ${x.firstFarIndex === null ? 'never' : x.firstFarIndex + 1}) and back ${x.farToNear} times, the plan says once at frame ${x.plannedFirstFarIndex + 1}`);
  const bases = frames.map(f => f.judged.baseTriangles), baseEqual = frames.length > 0 && bases.every(b => b !== null && Math.abs(b - bases[0]) < 1e-9);
  if (!baseEqual) problems.push(`the triangles drawn besides the bogies differ between frames (${[...new Set(bases)].join(', ')}), so the levels reported are not the meshes drawn`);
  const head = frames[0], tail = frames.at(-1), every = (f, level) => !!f && f.judged.rows.length > 0 && f.judged.rows.every(w => w.level === level);
  const costs = { baseTriangles: baseEqual ? bases[0] : null, baseTrianglesEqual: baseEqual,
    perBogie: head ? head.read.bogies.map(b => ({ name: b.name, near: { triangles: b.levels[0]?.triangles ?? null, drawCalls: b.levels[0]?.drawCalls ?? null }, far: { triangles: b.levels[1]?.triangles ?? null, drawCalls: b.levels[1]?.drawCalls ?? null } })) : [],
    allNear: every(head, 0) ? { index: 0, ...head.read.costs } : null, allBare: every(tail, 1) ? { index: frames.length - 1, ...tail.read.costs } : null,
    perFrame: frames.map(f => ({ index: f.index, triangles: f.read.costs.triangles, drawCalls: f.read.costs.drawCalls, rendererInfo: f.read.info, baseTriangles: f.judged.baseTriangles })) };
  costs.savedTriangles = costs.allNear && costs.allBare ? costs.allNear.triangles - costs.allBare.triangles : null;
  costs.savedDrawCalls = costs.allNear && costs.allBare ? costs.allNear.drawCalls - costs.allBare.drawCalls : null;
  const ok = !problems.length && !mismatches.length && !gaps.length, reasons = [];
  if (gaps.length) reasons.push(`${gaps.length} frame(s) are GAP: ${gaps.slice(0, 3).map(f => `frame ${f.index + 1} ${f.reason}`).join('; ')}`);
  if (mismatches.length) reasons.push(`${mismatches.length} reading(s) differ from the schedule predicted from the geometry: ${mismatches.slice(0, 3).map(m => `frame ${m.frame + 1} ${m.bogie ?? 'cab'} ${m.why}`).join('; ')}`);
  if (problems.length) reasons.push(problems.slice(0, 3).join('; '));
  return { ok, status: ok ? 'OK' : 'GAP', reason: ok ? null : reasons.join('; '), flips, mismatches, costs, maxDistanceErrorM: Math.max(0, ...frames.map(f => f.judged.maxDistanceErrorM)) };
}

// ============================================================================================
// C01 (opt-in): the whole train on a curve. One pose per kind on the tightest real bend of the page's track that the longest train fits: the cars are placed by the page's own
// carPoses over that path (web/src/trains-live.ts), photographed from above and from the outside of the bend on a neutral stage, and checked in numbers, at every joint, for what
// the placement does there. Like M01 it is not in VIEW_IDS. The route, the plan and the checks are plain numbers (the Node tests pin each of them); the stage and the readers take
// THREE and run in the page.
// ============================================================================================
/**
 * The curve's numbers, one set for every kind. The bend is found by its local radius over `baselineM`, the longest car of any kind (26 m): the heading change across that run of
 * track is the turn, and baselineM / turn the radius. The page draws its track on smooth curves through every OSM node (core/curves.ts) except where the track turns by more than
 * `cutDeg` at a node (core/curves.ts SMOOTH_TURN, 30 degrees: a corner, not a curve), so a chain of track is cut there. The route is the stretch of track that holds the longest train
 * with `marginM` to spare at each end. `fallbackRadiusM` and `arcStepM` make the synthetic arc
 * that stands in when no stretch of the page's track holds a train on a bend. The cameras: FOV 50, the oblique one `elevationDeg` above the horizon, and a region padded by `padM`.
 * A bogie must stand on the track within `bogieToleranceM`; the page's carPoses must put one where the route has it within `placementToleranceM` (the route's points are rounded to a
 * micrometre).
 */
export const CURVE = Object.freeze({
  id: 'C01', suffix: 'curve', stage: 'neutral-curve',
  baselineM: 26, cutDeg: 30, marginM: 10, stepM: .5,
  fallbackRadiusM: 100, arcStepM: 2,
  fov: 50, elevationDeg: 35, padM: .3,
  bogieToleranceM: .01, placementToleranceM: 1e-5,
});
/** The suffixes of the two views of the curve, in file order. */
export const CURVE_VIEWS = Object.freeze([`${CURVE.suffix}-plan`, `${CURVE.suffix}-oblique`]);
/** What every sidecar, manifest entry and note says of the stage. */
export const CURVE_STAGE = `${CURVE.stage} (scenery hidden)`;
/** How the curve is made and judged, for the manifest and every sidecar. */
export const CURVE_RULE = 'C01 (opt-in, day only). One pose per kind on the tightest real bend of the page\'s track that the longest train fits. The track is the page\'s own: web/src/data/kx-track.json drawn on the smooth '
  + 'curves of core/curves.ts, which trains run on through core/graph.ts edgePoint. The local radius is the 26 m (the longest car) over the heading change across it on those curves, found along every run of track '
  + 'between branches and corners, and the train stands with its middle on the tightest point. The cars are posed by the page\'s own carPoses (web/src/trains-live.ts) over the page\'s graph built with curves, turned '
  + 'into the frame of the specimen (the tightest point at the origin, the travel along -z) and applied as createLiveTrains.update does; the page\'s track is not drawn, a neutral stage that follows the same curve is '
  + '(scenery hidden). Two views, straight down (image up is the train\'s right-hand side, the nose at the left) and from the outside of the bend, 35 degrees above the horizon, each turned by the sun-bearing rule. '
  + 'Numbers, not pictures, are the check: no two adjacent car bodies (the shell\'s footprint, END_GAP short of each car end) may intersect; at each joint the coupler (the middle of the seam) and each edge of the '
  + 'gangway opening must have the boundary points of the two cars no further apart than one bellows (END_GAP, web/src/train.ts) can reach; and every bogie the page has must stand on the curve within 1 cm. '
  + 'A failed check is a FINDING in the report, never a failed picture and never loosened.';

/** The distance along a polyline of [x, z] points to each of them (the first at 0). */
export const cumulative = points => { const cum = [0]; for (let i = 0; i + 1 < points.length; i++) cum.push(cum[i] + Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])); return cum; };
/** The segment of a polyline, by its cumulative lengths, that the distance `s` falls in (the first for a distance before the start, the last for one at or past the end). */
export const segmentAt = (cum, s) => { let lo = 0, hi = cum.length - 2; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; } return lo; };
/** The point `s` metres along a polyline of [x, z] points whose cumulative lengths are `cum` (the first point at 0; past either end the last segment's line goes on). */
export const pointAlong = (points, cum, s) => { const i = segmentAt(cum, s), t = (s - cum[i]) / (cum[i + 1] - cum[i]); return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t]; };
/** A step's heading, clockwise from north (-z), as the page's trains have it. */
const bearing = (a, b) => Math.atan2(b[0] - a[0], -(b[1] - a[1]));
const headingAtS = (points, cum, s) => { const i = segmentAt(cum, s); return bearing(points[i], points[i + 1]); };
/** The distance from a point [x, z] to the nearest point of a polyline: polygonEdgeDistance's, of the polygon that goes along the polyline and back. */
export const polylineDistance = (points, p) => polygonEdgeDistance(p, [...points, ...points.slice(1, -1).reverse()]);

/**
 * The track of one piece of a chain as the page draws it: the dense polyline `D` through the piece's nodes (each edge's curve from `shapeOf(from, to)`, the points of core/curves.ts, or
 * its chord where there is none), the distance along it to every point (`cum`), and `nodeAt[i]`, the index in `D` of the piece's node i.
 */
function denseTrack(piece, shapeOf) {
  const D = [piece.P[0]], nodeAt = [0];
  piece.edges.forEach((edge, i) => {
    const run = shapeOf?.(piece.ids[i], piece.ids[i + 1]);
    const points = Array.isArray(run) && run.length >= 2 ? run : [piece.P[i], piece.P[i + 1]];
    for (let k = 1; k < points.length; k++) D.push([points[k][0], points[k][1]]);
    nodeAt.push(D.length - 1);
  });
  const cum = cumulative(D);
  return { D, cum, total: cum.at(-1), nodeAt };
}
/**
 * The tightest bend of the page's track that a train of `lengthM` fits, from its own data (`data`: web/src/data/kx-track.json, { nodes: [[id, x, z]], rails: [{ id, nodes, tunnel,
 * service }] }) and the curves it is drawn on (`shapeOf(a, b)`: the points of the smooth curve from node a to node b, core/curves.ts shapeFrom; none is the chord). The track is cut
 * into chains, the runs of edges between nodes where it branches or ends (walked from the lowest-numbered such node, edges in way order, so the result does not depend on the order of
 * the file), each chain is cut again where the chords turn by more than `cutDeg` at a node (a corner: the page draws no curve through it), and every piece long enough for the train and
 * `marginM` at each end is scanned every `stepM` metres, along its curve, for the turn across `baselineM`. The tightest turn wins (the first one, in chain order, on a tie); where the
 * turn holds the same value over a run of positions the middle of that run is the tightest point. The route is the whole edges of that piece from the one that holds half the train and
 * the margin before the tightest point to the one that holds the same after it, in the direction the chain was walked: `points`, the curve of those edges; `steps`, the edges, with the
 * indices in `points` where each starts and ends; `apexAt`, the edge the tightest point is on and its share of that edge's curve. Null if no piece holds the train on a bend. All
 * numbers in the page's world metres (x east, z south), to a micrometre.
 */
export function findCurveRoute(data, lengthM, { baselineM = CURVE.baselineM, cutDeg = CURVE.cutDeg, marginM = CURVE.marginM, stepM = CURVE.stepM, shapeOf = null } = {}) {
  if (!(lengthM > 0)) throw new Error(`a train ${lengthM} m long has no bend to find`);
  const pos = new Map(data.nodes.map(([id, x, z]) => [id, [x, z]])), touching = new Map();
  for (const rail of data.rails) for (let i = 0; i + 1 < rail.nodes.length; i++) {
    const a = rail.nodes[i], b = rail.nodes[i + 1], pa = pos.get(a), pb = pos.get(b);
    if (!pa || !pb || a === b) continue;
    const length = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    if (!(length > 0)) continue;
    const edge = { way: rail.id, a, b, length, tunnel: rail.tunnel === true, service: rail.service ?? null };
    for (const n of [a, b]) { if (!touching.has(n)) touching.set(n, []); touching.get(n).push(edge); }
  }
  const used = new Set(), chains = [];
  for (const start of [...touching.keys()].filter(n => touching.get(n).length !== 2).sort((p, q) => p - q)) {
    for (const first of [...touching.get(start)].sort((p, q) => p.way - q.way || p.a - q.a || p.b - q.b)) {
      if (used.has(first)) continue;
      const nodes = [start], edges = [];
      for (let at = start, edge = first; ;) {
        edges.push(edge); used.add(edge);
        at = edge.a === at ? edge.b : edge.a; nodes.push(at);
        const here = touching.get(at);
        if (here.length !== 2) break;
        const next = here[0] === edge ? here[1] : here[0];
        if (used.has(next)) break;
        edge = next;
      }
      chains.push({ nodes, edges });
    }
  }
  const pieces = [], cut = (chain, P, from, to) => pieces.push({ edges: chain.edges.slice(from, to), ids: chain.nodes.slice(from, to + 1), P: P.slice(from, to + 1) });
  for (const chain of chains) {
    const P = chain.nodes.map(n => pos.get(n));
    let from = 0;
    for (let i = 1; i + 1 < P.length; i++) if (Math.abs(wrap(bearing(P[i], P[i + 1]) - bearing(P[i - 1], P[i]))) > cutDeg * D2R) { cut(chain, P, from, i); from = i; }
    cut(chain, P, from, P.length - 1);
  }
  const need = lengthM / 2 + marginM;
  let best = null, fitting = 0;
  for (const piece of pieces) {
    const track = denseTrack(piece, shapeOf), { D, cum, total } = track;
    if (total < 2 * need - 1e-9) continue;
    fitting++;
    const count = Math.floor((total - 2 * need) / stepM + 1e-9) + 1, turns = [];
    for (let k = 0; k < count; k++) {
      const s = need + k * stepM;
      turns.push(Math.abs(wrap(headingAtS(D, cum, Math.min(total, s + baselineM / 2)) - headingAtS(D, cum, Math.max(0, s - baselineM / 2)))));
    }
    const top = Math.max(...turns), k0 = turns.findIndex(t => t >= top - 1e-12);
    let k1 = k0;
    while (k1 + 1 < count && turns[k1 + 1] >= top - 1e-12) k1++;
    if (!best || top > best.turn + 1e-12) best = { turn: top, s: need + (k0 + k1) / 2 * stepM, piece, track };
  }
  if (!best || !(best.turn > 1e-9)) return null;
  const { piece, track } = best, { D, cum, total, nodeAt } = track, lo = Math.max(0, best.s - need), hi = Math.min(total, best.s + need);
  const startOf = i => cum[nodeAt[i]], endOf = i => cum[nodeAt[i + 1]];
  const edgeAt = s => { let i = 0; while (i + 1 < piece.edges.length && startOf(i + 1) <= s + 1e-9) i++; return i; };
  const i0 = edgeAt(lo), i1 = edgeAt(hi - 1e-9), j = edgeAt(best.s), covered = piece.edges.slice(i0, i1 + 1);
  const tunnelM = covered.reduce((n, edge, k) => n + (edge.tunnel ? Math.max(0, Math.min(endOf(i0 + k), hi) - Math.max(startOf(i0 + k), lo)) : 0), 0), routeM = endOf(i1) - startOf(i0);
  const steps = covered.map((edge, k) => ({ way: edge.way, a: edge.a, b: edge.b, from: piece.ids[i0 + k], to: piece.ids[i0 + k + 1], chordM: q6(edge.length), tunnel: edge.tunnel, service: edge.service,
    fromIndex: nodeAt[i0 + k] - nodeAt[i0], toIndex: nodeAt[i0 + k + 1] - nodeAt[i0] }));
  return { source: 'real', smooth: typeof shapeOf === 'function', radiusM: q6(baselineM / best.turn), turnDeg: q6(best.turn / D2R), baselineM, lengthM: q6(routeM), apexS: q6(best.s - startOf(i0)),
    apex: pointAlong(D, cum, best.s).map(q6), points: D.slice(nodeAt[i0], nodeAt[i1 + 1] + 1).map(p => [q6(p[0]), q6(p[1])]), steps,
    apexAt: { step: j - i0, share: q6((best.s - startOf(j)) / (endOf(j) - startOf(j))) },
    ways: [...new Set(covered.map(e => e.way))], services: [...new Set(covered.map(e => e.service))],
    tunnel: { apexInTunnel: piece.edges[j].tunnel, windowM: q6(tunnelM), fraction: q6(tunnelM / (hi - lo)) },
    chain: { lengthM: q6(total), nodes: piece.P.length, from: piece.P[0].map(q6), to: piece.P.at(-1).map(q6) },
    searched: { chains: chains.length, pieces: pieces.length, fitting } };
}

/**
 * The synthetic route for a data set with no bend a train fits: an arc of `radiusM` through the origin, travelling north (-z) and bending to the right (+x), as long as the train
 * and the margin at each end, in chords of `stepM` (an even number of them, so the tightest point is a node). Labelled `synthetic` wherever it goes. It has no edges of the page's
 * graph (`steps` is null): it is a polyline, straight chords of a few metres, which the placement code takes as it takes any graph without curves.
 */
export function circularArcRoute(lengthM, radiusM, { marginM = CURVE.marginM, stepM = CURVE.arcStepM, baselineM = CURVE.baselineM } = {}) {
  if (!(lengthM > 0) || !(radiusM > 0)) throw new Error(`an arc of radius ${radiusM} m for a train ${lengthM} m long`);
  const half = lengthM / 2 + marginM, n = 2 * Math.ceil(half / stepM), points = [];
  for (let i = 0; i <= n; i++) { const phi = (i - n / 2) * (half / (n / 2)) / radiusM; points.push([q6(radiusM - radiusM * Math.cos(phi)), q6(-radiusM * Math.sin(phi))]); }
  const cum = cumulative(points), turn = Math.abs(wrap(headingAtS(points, cum, Math.min(cum.at(-1), cum[n / 2] + baselineM / 2)) - headingAtS(points, cum, Math.max(0, cum[n / 2] - baselineM / 2))));
  return { source: 'synthetic', smooth: false, radiusM: q6(radiusM), turnDeg: q6(turn / D2R), baselineM, lengthM: q6(cum.at(-1)), apexS: q6(cum[n / 2]), apex: [0, 0], points, steps: null, apexAt: null, ways: [], services: [],
    tunnel: { apexInTunnel: false, windowM: 0, fraction: 0 }, chain: null, searched: null,
    note: `a synthetic circular arc of radius ${radiusM} m: no run of the page's track holds a train ${lengthM} m long on a bend` };
}
/**
 * The map from the page's world into the train's own frame at the route's tightest point: the point at the origin, the direction of travel there (the chord across the baseline) along
 * -z, +x the right-hand side of the travel, so a camera on a side of the train is a camera at that sign of x as it is for every other view. `point` maps a world point [x, z], `vector` a
 * direction; `p0` and `p1` are the ends of the baseline in the world.
 */
export function frameTransform(route, { baselineM = route.baselineM ?? CURVE.baselineM } = {}) {
  const cum = cumulative(route.points), at = s => pointAlong(route.points, cum, Math.min(cum.at(-1), Math.max(0, s)));
  const apex = at(route.apexS), p0 = at(route.apexS - baselineM / 2), p1 = at(route.apexS + baselineM / 2), chord = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  if (!(chord > 0)) throw new Error('the route has no direction at its tightest point');
  const d = [(p1[0] - p0[0]) / chord, (p1[1] - p0[1]) / chord], r = [-d[1], d[0]];
  const across = v => v[0] * r[0] + v[1] * r[1], along = v => v[0] * d[0] + v[1] * d[1];
  return { apex, p0, p1, point: p => [across([p[0] - apex[0], p[1] - apex[1]]), -along([p[0] - apex[0], p[1] - apex[1]])], vector: v => [across(v), -along(v)] };
}
/**
 * The route in the train's own frame (frameTransform): the points, the tightest point's place and heading in the world, and `insideSign`, the side of the bend's centre. Lengths are the
 * route's own.
 */
export function curveFrame(route, options = {}) {
  const t = frameTransform(route, options), points = route.points.map(p => t.point(p).map(q6)), inside = Math.sign(t.point(t.p0)[0] + t.point(t.p1)[0]) || 1;
  return { points, apexS: route.apexS, lengthM: q6(cumulative(points).at(-1)), apex: t.apex.map(q6), headingDeg: q6(bearing(t.p0, t.p1) / D2R), insideSign: inside, outsideSign: -inside };
}
/**
 * The route for a train of `lengthM`: the tightest real bend of `data` it fits (on the curves `options.shapeOf` gives), else the synthetic arc (`options.fallbackRadiusM` of radius, its
 * chords `options.arcStepM` long; the margin and the baseline are shared with the search), with its frame as `local`.
 */
export function curveRouteFor(data, lengthM, options = {}) {
  const { marginM, baselineM, arcStepM } = options;
  const found = findCurveRoute(data, lengthM, options) ?? circularArcRoute(lengthM, options.fallbackRadiusM ?? CURVE.fallbackRadiusM, { marginM, baselineM, stepM: arcStepM });
  return { ...found, local: curveFrame(found, options) };
}
/**
 * A pose carPoses gave in the world, in the frame of the route: the car's position, its turn and each bogie's place and direction (`back`, toward the tail) mapped by `frame`
 * (frameTransform), the car's stretch unchanged. The rest of the pose (the car) stays as it was.
 */
export function localPose(pose, frame) {
  const forward = frame.vector([Math.sin(pose.rotationY), Math.cos(pose.rotationY)]), sample = s => ({ point: frame.point(s.point), back: frame.vector(s.back) });
  return { ...pose, position: frame.point(pose.position), rotationY: Math.atan2(forward[0], forward[1]), frontBogie: sample(pose.frontBogie), rearBogie: sample(pose.rearBogie) };
}

/** A point of a car, given in the train's own frame (x across, z along), in the frame of the route: where the page puts that point of the car node. */
export function carPoint(pose, x, z) {
  const c = Math.cos(pose.rotationY), s = Math.sin(pose.rotationY), along = pose.scaleZ * z;
  return [pose.position[0] + x * c + along * s, pose.position[1] - x * s + along * c];
}
/**
 * The gap between two convex polygons (arrays of [x, z] corners): the distance between them if they are apart, 0 if they touch, and minus the shallowest way out if they overlap
 * (the separating-axis test: the largest separation over every edge normal of both).
 */
export function polygonGap(a, b) {
  let separation = -Infinity;
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], nx = p[1] - q[1], nz = q[0] - p[0], n = Math.hypot(nx, nz);
    if (!(n > 0)) continue;
    const pa = a.map(v => (v[0] * nx + v[1] * nz) / n), pb = b.map(v => (v[0] * nx + v[1] * nz) / n);
    separation = Math.max(separation, Math.min(...pb) - Math.max(...pa), Math.min(...pa) - Math.max(...pb));
  }
  if (!(separation > 0)) return separation;
  let nearest = Infinity;
  for (const [from, to] of [[a, b], [b, a]]) for (const p of from) nearest = Math.min(nearest, polygonEdgeDistance(p, to));
  return nearest;
}
/**
 * Every joint of the train as the placement leaves it. `poses` are the cars in train order, { index, start, end, position, rotationY, scaleZ } (the car's extent in the train's own
 * frame and carPoses' pose of it); `spec` is { half, gangwayWidthM, endGapM } (the body's half width, the gangway opening's width and web/src/train.ts END_GAP). For each pair of
 * neighbours: the gap between the footprints of the two bodies (a rectangle `half` either side, END_GAP short of each car end, so 2 x END_GAP apart on a straight), and for the coupler
 * (the middle of the seam) and each edge of the gangway opening the two boundary points of the cars there, one the end of the first car and one the start of the second, which meet on
 * a straight: how far apart they are, and that distance as an opening along the joint (positive: apart) and a slip across it. `left` and `right` are of the direction of travel, and
 * `outsideSign` (+1: the right-hand side is the outside of the bend) says which is the outside.
 */
export function curveJoints(poses, { half, gangwayWidthM, endGapM }, { outsideSign = 1 } = {}) {
  const body = pose => [[-half, pose.start + endGapM], [half, pose.start + endGapM], [half, pose.end - endGapM], [-half, pose.end - endGapM]].map(([x, z]) => carPoint(pose, x, z));
  return poses.slice(0, -1).map((a, i) => {
    const b = poses[i + 1], fa = [Math.sin(a.rotationY), Math.cos(a.rotationY)], fb = [Math.sin(b.rotationY), Math.cos(b.rotationY)], mean = Math.hypot(fa[0] + fb[0], fa[1] + fb[1]);
    const u = [(fa[0] + fb[0]) / mean, (fa[1] + fb[1]) / mean];
    const seam = (x, name, side) => {
      const p = carPoint(a, x, a.end), q = carPoint(b, x, b.start), d = [q[0] - p[0], q[1] - p[1]];
      return { name, side, xM: q6(x), distanceM: Math.hypot(d[0], d[1]), openM: d[0] * u[0] + d[1] * u[1], slipM: d[0] * -u[1] + d[1] * u[0] };
    };
    const edge = sign => seam(sign * gangwayWidthM / 2, sign < 0 ? 'left' : 'right', sign === outsideSign ? 'outside' : 'inside');
    return { joint: i, between: [a.index, b.index], turnDeg: Math.abs(wrap(b.rotationY - a.rotationY)) / D2R, bodyGapM: polygonGap(body(a), body(b)),
      coupler: seam(0, 'coupler', 'centre'), gangway: { left: edge(-1), right: edge(1) } };
  });
}
/**
 * The verdicts the joints give by themselves. Bodies: every pair of neighbours must have a positive gap. Bellows: the coupler and each edge of every gangway opening must have the
 * boundary points of its two cars no further apart than `reachM`. Each failure is a finding with the joint, the numbers and the sentence a reader needs.
 */
export function judgeCurveJoints(joints, { reachM }) {
  const findings = [], tightest = joints.reduce((best, j) => !best || j.bodyGapM < best.bodyGapM ? j : best, null);
  const widest = (pick) => joints.reduce((best, j) => { const s = pick(j); return !best || s.distanceM > best.seam.distanceM ? { joint: j.joint, seam: s } : best; }, null);
  const coupler = widest(j => j.coupler), gangway = widest(j => j.gangway.left.distanceM > j.gangway.right.distanceM ? j.gangway.left : j.gangway.right);
  for (const j of joints) {
    if (!(j.bodyGapM > 0)) findings.push({ check: 'body-gap', joint: j.joint, between: j.between, gapM: j.bodyGapM, message: `the bodies of cars ${j.between[0]} and ${j.between[1]} ${j.bodyGapM < 0 ? `intersect by ${(-j.bodyGapM).toFixed(3)} m` : 'touch'} at the joint` });
    const seams = [['coupler', j.coupler], ['gangway', j.gangway.left], ['gangway', j.gangway.right]];
    for (const [check, s] of seams) if (!(s.distanceM <= reachM)) findings.push({ check, joint: j.joint, between: j.between, edge: check === 'gangway' ? s.name : null, side: s.side, distanceM: s.distanceM, openM: s.openM, slipM: s.slipM, reachM,
      message: `${check === 'coupler' ? 'the coupler' : `the ${s.name} (${s.side}) edge of the gangway`} between cars ${j.between[0]} and ${j.between[1]}: the cars' boundary points are ${s.distanceM.toFixed(3)} m apart (${s.openM.toFixed(3)} m open, ${Math.abs(s.slipM).toFixed(3)} m slipped), more than the ${reachM} m one bellows reaches` });
  }
  return { findings, bodies: { ok: joints.every(j => j.bodyGapM > 0), joints: joints.length, minGapM: tightest?.bodyGapM ?? null, atJoint: tightest?.joint ?? null },
    couplers: { ok: joints.every(j => j.coupler.distanceM <= reachM), reachM, maxDistanceM: coupler?.seam.distanceM ?? null, atJoint: coupler?.joint ?? null },
    gangways: { ok: joints.every(j => j.gangway.left.distanceM <= reachM && j.gangway.right.distanceM <= reachM), reachM, maxDistanceM: gangway?.seam.distanceM ?? null, atJoint: gangway?.joint ?? null, edge: gangway?.seam.name ?? null } };
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = a => { const n = Math.hypot(...a); return a.map(v => v / n); };
/**
 * The camera distance that frames a set of points: the smallest, to a millimetre, at which a camera standing that far from `target` along the unit vector `direction` (looking back at
 * the target, `up` its up) has every one of the `points` ([x, y, z]) in front of it and inside +-`fraction` of the half width and of the half height of the image. The projection is
 * the camera's own (vertical FOV `fov`, `aspect`); a point's offsets across the view do not change as the camera backs off, only its depth, so the first distance that fits is found
 * by halving.
 */
export function fitCameraDistance({ points, target, direction, up, fov, aspect = CATALOGUE.aspect, fraction = CATALOGUE.fitFraction }) {
  const forward = direction.map(v => -v), right = unit3(cross3(forward, up)), top = cross3(right, forward), t = Math.tan(fov * D2R / 2);
  const fits = distance => points.every(p => {
    const v = p.map((c, i) => c - (target[i] + direction[i] * distance)), depth = dot3(v, forward);
    return depth > 0 && Math.abs(dot3(v, right) / (depth * t * aspect)) <= fraction && Math.abs(dot3(v, top) / (depth * t)) <= fraction;
  });
  let lo = 0, hi = 1;
  while (!fits(hi)) { lo = hi; hi *= 2; if (hi > 1e7) throw new Error('no distance frames the points'); }
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return ceil3(hi);
}
/**
 * The two views of a train on the curve, in the frame of the route (the train's own: x across, the nose toward -z): straight down on the middle of the train's footprint, image up the
 * train's right-hand side and its nose at the left (as V06's roof plan has it), and from the outside of the bend, `elevationDeg` above the horizon, looking at the middle of the footprint
 * at half the height of the roof. Each stands as near as frames the footprint of every car (its envelope padded by `padM`, at the rail and at the roof) within the fit fraction of the
 * image, and is turned by the sun-bearing rule like every other view. `poses` are curveJoints' poses.
 */
export function planCurveViews(f, route, poses, { aspect = CATALOGUE.aspect } = {}) {
  const H = f.roofTop, pad = CURVE.padM, spots = [];
  for (const pose of poses) for (const [sx, end] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) spots.push(carPoint(pose, sx * (f.half + pad), end ? pose.end + pad : pose.start - pad));
  const xs = spots.map(p => p[0]), zs = spots.map(p => p[1]), bounds = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const centre = [(bounds[0] + bounds[1]) / 2, (bounds[2] + bounds[3]) / 2], points = spots.flatMap(p => [[p[0], 0, p[1]], [p[0], H, p[1]]]);
  const region = box(q6(bounds[0]), q6(bounds[1]), 0, q6(H + pad), q6(bounds[2]), q6(bounds[3])), outsideSign = route.local.outsideSign;
  const make = (name, target, direction, up, notes) => {
    const distance = fitCameraDistance({ points, target, direction, up, fov: CURVE.fov, aspect }), eye = target.map((v, i) => q6(v + direction[i] * distance));
    const view = { id: CURVE.id, suffix: `${CURVE.suffix}-${name}`, frame: 'curve', status: 'OK', eye, target: target.map(q6), fov: CURVE.fov, up, near: catalogueNear(eye, target), region,
      extents: { scope: 'train', z0: 0, z1: q6(f.length) }, notes: { stage: CURVE_STAGE, distanceM: distance, fitFraction: CATALOGUE.fitFraction, footprintM: { x: [q6(bounds[0]), q6(bounds[1])], z: [q6(bounds[2]), q6(bounds[3])] }, ...notes } };
    return { ...view, rotation: stageRotation(view) };
  };
  return [
    make('plan', [centre[0], H, centre[1]], [0, 1, 0], [1, 0, 0], { imageAxis: 'image x runs along the train toward the tail, the nose at the left; image up is the right-hand side of the direction of travel' }),
    make('oblique', [centre[0], H / 2, centre[1]], [outsideSign * Math.cos(CURVE.elevationDeg * D2R), Math.sin(CURVE.elevationDeg * D2R), 0], [0, 1, 0],
      { elevationDeg: CURVE.elevationDeg, side: `the outside of the bend (${outsideSign > 0 ? 'right' : 'left'}-hand side of the direction of travel)` }),
  ];
}
/**
 * Everything about one kind on the curve, from the geometry alone, before the page is asked anything. `f` is describeFormation's plain description, `route` curveRouteFor's, `placed`
 * what carPoses did with the train on the route ({ poses: curveJoints' poses, each with the `front` and `rear` bogie points in the frame of the route, `cars`: the poses as the page is told
 * them, `noseM`: how far along the route's edges, in the page's own measure of distance along the track (the chords), the nose stood, and `problems`: every way carPoses disagrees with
 * the geometry) and `spec` is { gangwayWidthM, endGapM }. A GAP, with the reason, if carPoses disagrees with the geometry or did not pose every car; otherwise the two views, the cars to
 * pose, the bogies where they must stand, every joint and the verdicts the joints give by themselves (the page's bogies are read later: judgeCurvePage).
 */
export function planCurve(f, route, placed, { gangwayWidthM, endGapM }) {
  const { poses, cars } = placed, problems = [];
  if (placed.problems?.length) problems.push(`the page's placement code (carPoses) disagrees with the geometry: ${placed.problems.slice(0, 3).join('; ')}`);
  if (poses.length !== f.cars.length) problems.push(`carPoses posed ${poses.length} of the ${f.cars.length} cars of ${f.kind}`);
  const summary = { source: route.source, smooth: route.smooth === true, radiusM: route.radiusM, turnDeg: route.turnDeg, baselineM: route.baselineM, apex: route.apex, headingDeg: route.local.headingDeg,
    outsideSign: route.local.outsideSign, lengthM: route.local.lengthM, apexS: route.local.apexS, edges: route.steps?.length ?? 0, ways: route.ways, services: route.services, tunnel: route.tunnel,
    ...(route.note ? { note: route.note } : {}) };
  const notes = { stage: CURVE_STAGE, route: summary, rule: CURVE_RULE };
  const head = { id: CURVE.id, suffix: CURVE.suffix, frame: 'curve', lengthM: f.length, route: summary, path: route.local.points, notes };
  if (problems.length) return { ...head, status: 'GAP', reason: problems.join('; '), noseM: null, views: [], cars: [], bogies: [], joints: [], checks: null };
  const joints = curveJoints(poses, { half: f.half, gangwayWidthM, endGapM }, { outsideSign: route.local.outsideSign });
  return { ...head, status: 'OK', reason: null, noseM: q6(placed.noseM), views: planCurveViews(f, route, poses), cars, joints, checks: judgeCurveJoints(joints, { reachM: endGapM }),
    bogies: poses.flatMap(p => [p.front, p.rear].map((point, k) => ({ name: `bogie-${p.index}-${k}`, car: p.index, k, point }))) };
}
/** The numbers that define a curve plan, for freezing and comparison (what the page read and the verdicts are not part of it). */
export const curvePoseOf = p => ({ status: p.status, lengthM: p.lengthM, route: p.route, path: p.path, views: p.views.map(poseOf) });

/** The cars of the specimen as they stand: the transform of each car node. */
export function readCars(group) {
  return group.children.filter(o => /^car-\d+$/.test(o.name)).map(o => ({ name: o.name, visible: o.visible, position: o.position.toArray(), rotationY: o.rotation.y, scaleZ: o.scale.z }));
}
/** Where every bogie the specimen shows stands: its position in the specimen's own frame (`local`, the frame the route is in) and in the world. */
export function readBogiePoints(T, group) {
  group.updateMatrixWorld(true);
  const out = [], world = new T.Vector3();
  group.traverseVisible(o => {
    const m = /^bogie-(\d+)-(\d+)$/.exec(o.name);
    if (!m) return;
    world.setFromMatrixPosition(o.matrixWorld);
    out.push({ name: o.name, car: Number(m[1]), k: Number(m[2]), local: group.worldToLocal(world.clone()).toArray(), world: world.toArray() });
  });
  return out;
}
/**
 * What the page has, against the plan: `read` is { cars: readCars, bogies: readBogiePoints }. `problems` are a page that is not in the state it was asked to be in (a car not where it
 * was put, a bogie missing, twice or unplanned), which makes the curve a GAP; `findings` are bogies that stand more than `toleranceM` from the track (the path, at the rail head), which
 * are the model's. `rows` give each bogie's place, its distance from the path and from the place carPoses gave it.
 */
export function judgeCurvePage(plan, read, { toleranceM = CURVE.bogieToleranceM } = {}) {
  const problems = appliedCarProblems(plan.cars, read.cars ?? []), findings = [], rows = [];
  for (const [t, r] of reportedBogies(plan.bogies, read.bogies ?? [], problems)) {
    const offTrackM = Math.hypot(polylineDistance(plan.path, [r.local[0], r.local[2]]), r.local[1]), plannedErrorM = Math.hypot(r.local[0] - t.point[0], r.local[1], r.local[2] - t.point[1]);
    rows.push({ name: t.name, car: t.car, k: t.k, plannedPoint: t.point, local: r.local, world: r.world, offTrackM, plannedErrorM });
    if (!(offTrackM <= toleranceM)) findings.push({ check: 'bogie-on-track', bogie: t.name, offTrackM, toleranceM, message: `${t.name} stands ${offTrackM.toFixed(4)} m from the track, more than the ${toleranceM} m allowed` });
  }
  return { problems, findings, rows, bogies: { ok: findings.length === 0 && problems.length === 0, count: rows.length, toleranceM, maxOffTrackM: Math.max(0, ...rows.map(r => r.offTrackM)), maxPlannedErrorM: Math.max(0, ...rows.map(r => r.plannedErrorM)) } };
}
/** The verdict of the curve: the joints' findings and the page's, PASS when there are none. `page` is judgeCurvePage's, or null when the page was never read (then the bogies are not judged). */
export function curveVerdict(plan, page = null) {
  if (!plan.checks) return { status: 'NOT RUN', findings: [], bodies: null, couplers: null, gangways: null, bogies: null };
  const findings = [...plan.checks.findings, ...(page?.findings ?? [])];
  return { status: findings.length ? 'FINDING' : 'PASS', findings, bodies: plan.checks.bodies, couplers: plan.checks.couplers, gangways: plan.checks.gangways, bogies: page?.bogies ?? null };
}

/**
 * A capture-only stage that follows the route, named like the straight one and never part of the model: the ground, a 3.4 m ballast strip, sleepers (one InstancedMesh every .65 m of
 * the route, each square to the track under it) and two rail-head boxes at the wheel-tread centres, the rail head top at y = 0 and the levels the page's own track has (web/src/track.ts).
 * Each straight run of the route is a box, the ends of the boxes at a bend cut or lengthened so that the rails meet at the corner (a rail at a lateral offset s is lengthened by
 * -s tan(turn / 2) at each end of a run, the ballast by half its width times tan(|turn| / 2)) and the boxes of a strip are merged into one mesh. `points` are the route in the frame of the specimen.
 */
export function buildCurveStage(T, { points }) {
  const g = new T.Group();
  g.name = 'capture-stage';
  g.userData = { captureOwned: true, note: 'capture-only neutral curved specimen stage; not part of the model' };
  const cum = cumulative(points), total = cum.at(-1), lambert = color => new T.MeshLambertMaterial({ color }), yaw = i => Math.atan2(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  const turn = j => wrap(bearing(points[j], points[j + 1]) - bearing(points[j - 1], points[j]));
  const strip = (name, color, width, height, y, offset, extension) => {
    const position = [], normal = [], index = [];
    for (let i = 0; i + 1 < points.length; i++) {
      const length = cum[i + 1] - cum[i], e0 = i > 0 ? extension(turn(i)) : 0, e1 = i + 2 < points.length ? extension(turn(i + 1)) : 0, theta = yaw(i), d = [Math.sin(theta), Math.cos(theta)];
      const geometry = new T.BoxGeometry(width, height, length + e0 + e1).applyMatrix4(new T.Matrix4().makeRotationY(theta).setPosition(
        (points[i][0] + points[i + 1][0]) / 2 - d[1] * offset + d[0] * (e1 - e0) / 2, y, (points[i][1] + points[i + 1][1]) / 2 + d[0] * offset + d[1] * (e1 - e0) / 2));
      for (const v of geometry.attributes.position.array) position.push(v);
      for (const v of geometry.attributes.normal.array) normal.push(v);
      for (const v of geometry.index.array) index.push(v + position.length / 3 - geometry.attributes.position.count);
      geometry.dispose();
    }
    const merged = new T.BufferGeometry();
    merged.setAttribute('position', new T.Float32BufferAttribute(position, 3)); merged.setAttribute('normal', new T.Float32BufferAttribute(normal, 3)); merged.setIndex(index);
    const m = new T.Mesh(merged, lambert(color)); m.name = name; g.add(m); return m;
  };
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]), ground = new T.Mesh(new T.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), lambert(0x3a4049));
  ground.name = 'capture-stage-ground'; ground.position.set((Math.min(...xs) + Math.max(...xs)) / 2, CATALOGUE.groundY, (Math.min(...zs) + Math.max(...zs)) / 2); g.add(ground);
  strip('capture-stage-ballast', 0x5d5a55, 3.4, .06, CATALOGUE.groundY + .03, 0, angle => 1.7 * Math.tan(Math.abs(angle) / 2));
  const count = Math.floor(total / .65), sleepers = new T.InstancedMesh(new T.BoxGeometry(2.6, .05, .25), lambert(0x8d8b85), count), m = new T.Matrix4();
  sleepers.name = 'capture-stage-sleepers';
  for (let i = 0; i < count; i++) { const s = .325 + i * .65, p = pointAlong(points, cum, s); m.makeRotationY(yaw(segmentAt(cum, s))).setPosition(p[0], -.125, p[1]); sleepers.setMatrixAt(i, m); }
  sleepers.instanceMatrix.needsUpdate = true;
  g.add(sleepers);
  for (const sx of [-1, 1]) {
    const offset = sx * CATALOGUE.gaugeM / 2;
    strip(`capture-stage-rail-${sx < 0 ? 'left' : 'right'}`, 0xa0a4aa, CATALOGUE.railHeadWidthM, .1, -.05, offset, angle => -offset * Math.tan(angle / 2));
  }
  g.userData.levels = { groundY: CATALOGUE.groundY, ballastTopY: CATALOGUE.groundY + .06, sleeperTopY: -.1, railHeadTopY: 0, railCentreX: CATALOGUE.gaugeM / 2, ballastWidthM: 3.4, sleepers: count,
    route: { points: points.length, lengthM: q6(total) } };
  return g;
}
