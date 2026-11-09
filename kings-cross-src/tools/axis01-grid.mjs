// Capture-only orthographic survey views. The page bundle and its cameras are unchanged.
export function joinBounds(...bounds) {
  const out=Object.fromEntries(['x','y','z'].map(axis=>[axis,[Math.min(...bounds.map(b=>b[axis][0])),Math.max(...bounds.map(b=>b[axis][1]))]]));
  if(Object.values(out).some(v=>!v.every(Number.isFinite)||v[1]<v[0]))throw new Error('invalid geometry capture bounds');
  return out;
}
const ticks=(lo,hi,step)=>Array.from({length:Math.floor(hi/step)-Math.ceil(lo/step)+1},(_,i)=>(Math.ceil(lo/step)+i)*step);
export function gridPlan(bounds,view,spacingM=10,{verticalScale=1,chainage=false}={}) {
  if(!['top','side','cross'].includes(view)||spacingM!==10)throw new Error('capture requires a top or side 10 m grid');
  const b=joinBounds(bounds), margin=20, lines=[],labels=[];
  const add=(a,c,value,axis)=>{lines.push({a,b:c,major:value%50===0,axis,value});};
  if(view==='top') {
    for(const x of ticks(b.x[0]-margin,b.x[1]+margin,spacingM))add([x,1,b.z[0]-margin],[x,1,b.z[1]+margin],x,'x');
    for(const z of ticks(b.z[0]-margin,b.z[1]+margin,spacingM))add([b.x[0]-margin,1,z],[b.x[1]+margin,1,z],z,'z');
    for(const z of ticks(b.z[0],b.z[1],50))labels.push({text:`z ${z} m`,position:[b.x[0]-10,1,z]});
    for(const x of ticks(b.x[0],b.x[1],50))labels.push({text:`x ${x} m`,position:[x,1,b.z[1]+10]});
  }else if(view==='cross') {
    for(const x of ticks(b.x[0]-margin,b.x[1]+margin,spacingM))add([x,b.y[0]-10,b.z[1]+2],[x,b.y[1]+20,b.z[1]+2],x,'x');
    for(const y of ticks(b.y[0]-10,b.y[1]+20,spacingM))add([b.x[0]-margin,y,b.z[1]+2],[b.x[1]+margin,y,b.z[1]+2],y,'y');
    for(const y of ticks(b.y[0],b.y[1]+20,10))labels.push({text:`y ${y} m`,position:[b.x[0]-5,y,b.z[1]+2]});
    for(const x of ticks(b.x[0],b.x[1],10))labels.push({text:`x ${x} m`,position:[x,b.y[0]-3,b.z[1]+2]});
  }else {
    for(const z of ticks(b.z[0]-margin,b.z[1]+margin,spacingM))add([b.x[0],b.y[0]-10,z],[b.x[0],b.y[1]+20,z],z,'z');
    for(const y of ticks(b.y[0]/verticalScale-10,b.y[1]/verticalScale+20,spacingM))add([b.x[0],y*verticalScale,b.z[0]-margin],[b.x[0],y*verticalScale,b.z[1]+margin],y,'y');
    for(const z of ticks(b.z[0],b.z[1],chainage?100:b.z[1]-b.z[0]<100?10:50))labels.push({text:`${chainage?'s':'z'} ${chainage?-z:z} m`,position:[b.x[0],b.y[0]-5,z]});
    for(const y of ticks(b.y[0]/verticalScale,b.y[1]/verticalScale,10))labels.push({text:`y ${y} m${verticalScale!==1?' true':''}`,position:[b.x[0],y*verticalScale,b.z[0]-10]});
  }
  return {view,spacingM,verticalScale,chainage,lines,labels,meaning:`Projected reference grid; depth testing disabled for grid only. ${view==='top'?'Top: x/z':view==='cross'?'Transverse: x/y':chainage?'ECML distance from buffer / height':'Longitudinal: z/y'} metres; vertical exaggeration ${verticalScale}x applies only to plotting; all y tick labels are true metres; y=0 surface rail datum.`};
}

export function projectedBounds(T,camera,bounds,width,height) {
  const points=[];for(const x of bounds.x)for(const y of bounds.y)for(const z of bounds.z)points.push(new T.Vector3(x,y,z).project(camera));
  return {left:Math.min(...points.map(p=>(p.x+1)*width/2)),right:Math.max(...points.map(p=>(p.x+1)*width/2)),
    top:Math.min(...points.map(p=>(1-p.y)*height/2)),bottom:Math.max(...points.map(p=>(1-p.y)*height/2))};
}
/** Project sample paths into the actual PNG viewport; DOM text never counts as geometry. */
export function pixelSpecification(T,scene,camera,plan,bounds,width,height,evidence,excluded=[]) {
  const pixel=p=>{const v=p.project(camera);return [(v.x+1)*width/2,(1-v.y)*height/2];};
  const grid=plan.lines.map(l=>({axis:l.axis,points:[pixel(new T.Vector3(...l.a)),pixel(new T.Vector3(...l.b))]}));
  const profiles=[];
  if(evidence?.section)for(const [name,colour] of [['axis01-terrain-section','ground'],['axis01-rail-section','rail']]) {
    const line=scene.getObjectByName(name),p=line.geometry.attributes.position,points=[];
    for(let i=0;i<p.count;i++)points.push(pixel(line.localToWorld(new T.Vector3().fromBufferAttribute(p,i))));
    profiles.push({name,colour,points});
  }
  return {view:evidence?.view??'top',width,height,geometry:projectedBounds(T,camera,bounds,width,height),excluded,grid,profiles};
}
/** A second PNG distinguishes real surfaces/lines from a grid-and-label-only image. */
export function renderGridBaseline(renderer,scene,camera,grid) {
  const state=scene.children.map(o=>[o,o.visible]);
  try {
    for(const [o] of state)if(o!==grid&&!o.isLight&&!o.isCamera)o.visible=false;
    renderer.render(scene,camera);
  }finally {for(const [o,visible] of state)o.visible=visible;}
}
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
/** Pixel-sized gutter labels stay legible when the world scale or viewport changes. */
export function layoutGridLabels(T,camera,plan,bounds,width,height) {
  const geometry=projectedBounds(T,camera,bounds,width,height),labels=[];
  for(const label of plan.labels) {
    const p=new T.Vector3(...label.position).project(camera),vertical=label.text.startsWith(plan.view==='top'?'z ':'y ');
    const w=Math.ceil(label.text.length*8+8),h=20;
    let left=vertical?geometry.left-w-8:(p.x+1)*width/2-w/2;
    let top=vertical?(1-p.y)*height/2-h/2:geometry.bottom+16;
    left=Math.max(8,Math.min(width-w-8,left));
    // Moving a tick to the frame edge would mislabel a different grid line.
    if(top<52||top+h>height-32)continue;
    const rect={left,top,right:left+w,bottom:top+h};
    if(overlaps(rect,geometry)||labels.some(l=>overlaps(rect,{left:l.rect.left-4,right:l.rect.right+4,top:l.rect.top-4,bottom:l.rect.bottom+4})))continue;
    labels.push({...label,rect,fontPx:13,axis:vertical?'vertical':'horizontal'});
  }
  return {geometry,labels};
}
/** Receives actual DOM rectangles in the capture, not the proposed layout's rectangles. */
export function inspectGridLabels(labels,geometry,width,height) {
  if(!labels?.length||!['horizontal','vertical'].every(axis=>labels.some(l=>l.axis===axis)))return {clear:false,reason:'axis tick labels missing'};
  for(const label of labels) {
    const r=label.rect;
    if(!r||Object.values(r).some(v=>!Number.isFinite(v))||r.left<4||r.right>width-4||r.top<48||r.bottom>height-24)return {clear:false,reason:'axis label clipped',label};
    if(overlaps(r,geometry))return {clear:false,reason:'axis label overlaps measured geometry',label};
    if(!Number.isFinite(label.fontPx)||label.fontPx<11||label.fontPx>16)return {clear:false,reason:'axis label font size unreadable',label};
    if(r.bottom-r.top>24||r.bottom-r.top<14)return {clear:false,reason:'axis label text size unreadable',label};
  }
  return {clear:true,count:labels.length,labels,geometry};
}
export function addGrid(T,scene,plan,labelFactory) {
  const group=new T.Group();group.name='axis01-grid';group.userData.captureOverlay=true;
  for(const major of [false,true]) {
    const positions=plan.lines.filter(l=>l.major===major).flatMap(l=>[...l.a,...l.b]);
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    const material=new T.LineBasicMaterial({color:major?0x193e62:0x168b9b,transparent:true,opacity:major?.85:.55,depthTest:false,depthWrite:false,fog:false,toneMapped:false});
    const lines=new T.LineSegments(geometry,material);lines.name=major?'grid-major-50m':'grid-minor-10m';lines.renderOrder=plan.chainage?8000:10000;
    lines.userData.keys=plan.lines.filter(l=>l.major===major).map(({axis,value})=>({axis,value}));group.add(lines);
  }
  if(labelFactory)for(const label of plan.labels)group.add(labelFactory(label));
  scene.add(group);return group;
}
/** Only the capture hides architecture/furniture, retaining the actual platforms, track, ground and portals. */
export function prepareGeometryScene(scene,view='top') {
  const keep=new Set(['track','platforms','portals','terrain','buffer-stops','ground-outside-terrain','axis01-grid']),hidden=[];
  // A level side projection is a terrain section: foreground hills otherwise conceal the flat rails.
  if(view==='side'){keep.delete('terrain');keep.delete('ground-outside-terrain');}
  for(const o of scene.children)if(!o.isLight&&!o.isCamera&&!keep.has(o.name)&&o.visible){o.visible=false;hidden.push(o.name||o.type);}
  for(const name of ['track','platforms','portals'])if(!scene.getObjectByName(name)?.visible)throw new Error(`required drawn geometry missing: ${name}`);
  return hidden;
}
export function geometryCamera(T,bounds,view,width,height,ground) {
  const b=joinBounds(bounds), cx=(b.x[0]+b.x[1])/2,cz=(b.z[0]+b.z[1])/2,cy=(b.y[0]+b.y[1])/2;
  const range=Math.max(b.x[1]-b.x[0],b.z[1]-b.z[0],100),distance=range*2;
  // Reserve real pixel gutters for labels and the page's fixed controls at every scale.
  const horizontal=view==='top'||view==='cross'?b.x:b.z,vertical=view==='top'?b.z:b.y;
  const metresPerPixel=Math.max((horizontal[1]-horizontal[0])/(width-168),(vertical[1]-vertical[0])/(height-160));
  const span=metresPerPixel*width,spanY=metresPerPixel*height;
  const offsetX=40*metresPerPixel;
  let camera,groundY=null;
  if(view==='top') {
    camera=new T.OrthographicCamera(-span/2-offsetX,span/2-offsetX,spanY/2,-spanY/2,.1,distance*3);
    camera.position.set(cx,b.y[1]+distance,cz);camera.up.set(0,0,-1);camera.lookAt(cx,cy,cz);
  }else if(view==='cross') {
    camera=new T.OrthographicCamera(-span/2-offsetX,span/2-offsetX,spanY/2,-spanY/2,.1,distance*3);
    camera.position.set(cx,cy,b.z[1]+distance);camera.up.set(0,1,0);camera.lookAt(cx,cy,cz);
  }else if(view==='side') {
    const x=b.x[1]+distance;groundY=ground?.heightAt(x,cz);
    if(groundY!==undefined&&!Number.isFinite(groundY))throw new Error('side camera ground height unknown');
    const cameraY=Math.max(cy,Number.isFinite(groundY)?groundY+.5:cy);
    camera=new T.OrthographicCamera(-span/2-offsetX,span/2-offsetX,cy-cameraY+spanY/2,cy-cameraY-spanY/2,.1,distance*3);
    camera.position.set(x,cameraY,cz);camera.up.set(0,1,0);camera.lookAt(cx,cameraY,cz);
  }else throw new Error('unknown geometry view');
  camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
  return {camera,metadata:{view,position:camera.position.toArray(),up:camera.up.toArray(),frustum:{left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom,near:camera.near,far:camera.far},groundY:groundY??null,metresPerPixel:(camera.right-camera.left)/width}};
}
function visibleMeshes(scene,camera) {
  const meshes=[];scene.traverseVisible(o=>{if(o.isMesh&&camera.layers.test(o.layers)&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m?.visible!==false&&m?.opacity!==0))meshes.push(o);});return meshes;
}
function visibleProbe(T,scene,camera,target,owner) {
  const near=new T.Vector3(target[0],target[1],target[2]).project(camera);if(Math.abs(near.x)>.97||Math.abs(near.y)>.97||near.z<=-1||near.z>=1)return {clear:false,reason:'probe outside image'};
  const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(near.x,near.y),camera);ray.near=camera.near;ray.far=camera.far;
  const hit=ray.intersectObjects(visibleMeshes(scene,camera),false)[0];
  const chain=[];if(hit)for(let o=hit.object;o;o=o.parent)chain.push({name:o.name,type:o.type,userData:Object.fromEntries(Object.entries(o.userData??{}).filter(([,v])=>['string','number','boolean'].includes(typeof v)))});
  const own=hit&&chain.some(o=>o.name===owner);
  return {clear:Boolean(own),reason:own?null:'geometry probe occluded or no drawn surface',blocker:own?null:chain.map(o=>o.name||o.type).reverse().join('/'),hitDistanceM:hit?.distance??null,chain,target};
}
/** Verify metre scale in pixels and require exposed real geometry, not just an attractive grid. */
export function inspectGeometryFrame(T,scene,camera,grid,plan,bounds,platforms,width,height,evidence=null) {
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  if(!camera.isOrthographicCamera||plan.spacingM!==10||!grid.visible)return {clear:false,reason:'orthographic 10 m reference grid missing'};
  const projected=[];
  grid.traverseVisible(o=>{if(!o.isLineSegments)return;const positions=o.geometry.attributes.position;
    for(let i=0;i+1<positions.count;i+=2){const key=o.userData.keys?.[i/2];if(!key)continue;projected.push({...key,
      a:o.localToWorld(new T.Vector3().fromBufferAttribute(positions,i)).project(camera),b:o.localToWorld(new T.Vector3().fromBufferAttribute(positions,i+1)).project(camera)});}});
  const axis=plan.view==='side'?'z':'x',rows=projected.filter(l=>l.axis===axis).sort((a,b)=>a.value-b.value);
  const gaps=rows.slice(1).map((r,i)=>Math.hypot((r.a.x-rows[i].a.x)*width/2,(r.a.y-rows[i].a.y)*height/2));
  const expected=10/(camera.right-camera.left)*width;
  if(projected.length!==plan.lines.length||!gaps.length||gaps.some(p=>Math.abs(p-expected)>1e-4)||expected<8)return {clear:false,reason:'10 m grid is distorted or too small to read',pixelsPer10M:expected,gaps};
  const verticalRows=projected.filter(l=>l.axis===(plan.view==='top'?'z':'y')).sort((a,b)=>a.value-b.value),verticalExpected=expected*(plan.view==='top'?1:plan.verticalScale??1);
  const verticalGaps=verticalRows.slice(1).map((r,i)=>Math.abs(r.a.y-verticalRows[i].a.y)*height/2);
  if(!verticalGaps.length||verticalGaps.some(p=>Math.abs(p-verticalExpected)>1e-4))return {clear:false,reason:'vertical grid scale disagrees with labelled exaggeration'};
  const b=joinBounds(bounds);
  for(const x of b.x)for(const y of b.y)for(const z of b.z){const p=new T.Vector3(x,y,z).project(camera);if(Math.abs(p.x)>.97||Math.abs(p.y)>.97||p.z<=-1||p.z>=1)return {clear:false,reason:'station or throat extent clipped'};}
  const labels=grid.userData.labelRects===undefined?null:inspectGridLabels(grid.userData.labelRects,projectedBounds(T,camera,bounds,width,height),width,height);
  if(labels&&!labels.clear)return {...labels,labels};
  if(evidence)return {...inspectSideExtent(T,scene,camera,evidence,width,height),labels,pixelsPer10M:expected,pixelsPerVertical10M:expected*(plan.verticalScale??1),gridLines:plan.lines.length,metresPerPixel:10/expected};
  const probes=[];
  if(plan.view==='top') {
    for(const platform of platforms) {
      const samples=platform.drawnTopSamples??[];const results=samples.map(p=>visibleProbe(T,scene,camera,p,'platforms'));probes.push({ref:platform.ref,results});
      if(!results.some(r=>r.clear))return {clear:false,reason:`platform ${platform.ref} has no exposed drawn top`,probes};
    }
  }else if(plan.view==='side') {
    const walls=scene.getObjectByName('platform-walls'),p=walls?.geometry?.attributes.position,samples=[];
    if(p)for(let i=0;i+2<p.count;i+=3){const a=walls.localToWorld(new T.Vector3().fromBufferAttribute(p,i)),c=walls.localToWorld(new T.Vector3().fromBufferAttribute(p,i+1)),d=walls.localToWorld(new T.Vector3().fromBufferAttribute(p,i+2));const point=a.add(c).add(d).multiplyScalar(1/3);if(point.x>=b.x[0]&&point.x<=b.x[1]&&point.z>=b.z[0]&&point.z<=b.z[1])samples.push(point.toArray());}
    const blocked=[];
    for(const sample of samples) {const result=visibleProbe(T,scene,camera,sample,'platforms');if(result.clear)probes.push(result);else if(blocked.length<8)blocked.push(result);if(probes.length>=3)break;}
    if(probes.length<3)return {clear:false,reason:'side view has no readable platform wall surfaces',probes,blocked};
  }
  return {clear:true,labels,pixelsPer10M:expected,gridLines:plan.lines.length,probes,metresPerPixel:10/expected};
}

/** Capture-only sections; all measurements come from existing scene meshes or drawn terrain. */
export function prepareSideEvidence(T,scene,view,report,terrain,trains=[]) {
  const keep=new Set(['track','platforms']), targetNames=[];
  let bounds,section=null;
  if(view==='side') {
    const train=trains.find(t=>t.kind==='lner5')?.group??trains[0]?.group;
    if(!train?.children[1])throw new Error('side evidence requires an actual intermediate carriage');
    keep.add(train.name);train.visible=true;
    train.children.forEach((car,i)=>{car.visible=i===1;});
    const b=new T.Box3().setFromObject(train.children[1]);
    bounds={x:[b.min.x-3,(b.min.x+b.max.x)/2+1],y:[-.25,b.max.y+1],z:[b.min.z-4,b.max.z+4]};
    targetNames.push(train.name);
  }else if(view==='arch') {
    keep.add('train-shed');targetNames.push('train-shed');
    const shed=scene.getObjectByName('train-shed');if(!shed)throw new Error('actual shed missing');
    // The rib structure is the measured arch; hide the outer skin and end masonry for this cutaway.
    shed.traverse(o=>{if(o.isMesh)o.visible=o.name==='shed-ribs';});
    const b=new T.Box3().setFromObject(shed);
    bounds={x:[b.min.x,b.max.x],y:[-.25,b.max.y],z:[b.min.z,b.max.z]};
  }else if(view==='portal') {
    keep.clear();keep.add('portals');targetNames.push('portals');
    const mouth=report.tunnels.find(t=>t.id==='gasworks-south');if(!mouth)throw new Error('Gasworks south mouth missing');
    const [x,z]=mouth.drawnFaceOrigin;
    bounds={x:[x-24,x+24],y:[-.25,9],z:[z-7,z+3]};
  }else if(view==='terrain-section') {
    keep.clear();
    if(!terrain?.heightAt)throw new Error('drawn terrain required for section profile');
    section=sampleEcmlSection(T,scene,report.sectionRoute,terrain);
    for(const [name,points,color] of [['axis01-terrain-section',section.ground,0xe05b13],['axis01-rail-section',section.rails,0x1647bc]]) {
      const geometry=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(0,p.y*section.verticalScale,-p.s)));
      const line=new T.Line(geometry,new T.LineBasicMaterial({color,transparent:true,opacity:1,depthTest:false,depthWrite:false,fog:false,toneMapped:false}));
      line.name=name;line.userData.actualGeometry=true;line.renderOrder=name==='axis01-rail-section'?9001:9000;scene.add(line);keep.add(name);targetNames.push(name);
    }
    const ys=[...section.ground,...section.rails].map(p=>p.y*section.verticalScale);
    bounds={x:[-1,1],y:[Math.min(-2,...ys),Math.max(...ys)+10],z:[-section.lengthM,0]};
  }else throw new Error('unknown side evidence view');
  const hidden=[];
  for(const o of scene.children)if(!o.isLight&&!o.isCamera&&!keep.has(o.name)&&o.visible){o.visible=false;hidden.push(o.name||o.type);}
  return {bounds,targetNames,section,hidden,view,verticalScale:section?.verticalScale??1,projection:view==='arch'||view==='portal'?'cross':'side',minimumExtentM:view==='side'?[20,2.5]:view==='arch'?[25,12]:view==='portal'?[20,5]:[1500,20]};
}

/** Read rail level from the scene's real line vertices, including the schematic tunnel drop. */
export function sampleEcmlSection(T,scene,route,terrain,spacingM=2) {
  if(!route?.segments?.length)throw new Error('continuous OSM ECML section route missing');
  scene.updateMatrixWorld(true);
  const track=scene.getObjectByName('track'),cache=new Map(),ground=[],rails=[];
  const steel=scene.getObjectByName('track-rails');let steelTop=-Infinity;
  if(steel){const p=steel.geometry.attributes.position;for(let i=0;i<p.count;i++)steelTop=Math.max(steelTop,steel.localToWorld(new T.Vector3().fromBufferAttribute(p,i)).y);}
  const readLevel=(point,tunnel)=>{
    const name=tunnel?'track-tunnel':'track-lines';
    if(!cache.has(name)){
      const line=track?.getObjectByName(name),p=line?.geometry.attributes.position,segments=[];
      if(p)for(let i=0;i+1<p.count;i+=2)segments.push({a:line.localToWorld(new T.Vector3().fromBufferAttribute(p,i)),b:line.localToWorld(new T.Vector3().fromBufferAttribute(p,i+1)),cutoff:line.geometry.attributes.cutoff?.getX(i)??0});
      cache.set(name,segments);
    }
    let best=null;
    for(const segment of cache.get(name)){
      const {a,b}=segment,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point[0]-a.x)*dx+(point[1]-a.z)*dz)/(dx*dx+dz*dz)));
      const distance=Math.hypot(point[0]-a.x-t*dx,point[1]-a.z-t*dz);
      if(!best||distance<best.distance)best={distance,y:segment.cutoff>0&&Number.isFinite(steelTop)?steelTop:a.y+(b.y-a.y)*t,source:segment.cutoff>0?'track-rails top vertices':name};
    }
    if(!best||best.distance>2)throw new Error(`section has no drawn ${name} within 2 m`);
    return best;
  };
  let distance=0;
  for(const segment of route.segments){
    const length=Math.hypot(segment.b[0]-segment.a[0],segment.b[1]-segment.a[1]),steps=Math.ceil(length/spacingM);
    for(let i=0;i<=steps;i++){
      const t=i/steps,x=segment.a[0]+(segment.b[0]-segment.a[0])*t,z=segment.a[1]+(segment.b[1]-segment.a[1])*t,s=distance+length*t;
      const y=terrain.heightAt(x,z);if(!Number.isFinite(y))throw new Error('terrain section height missing');
      ground.push({s,x,z,y});const rail=readLevel([x,z],segment.tunnel);rails.push({s,x,z,y:rail.y,source:rail.source,wayId:segment.wayId,tunnel:segment.tunnel});
    }
    distance+=length;
  }
  return {ground,rails,lengthM:distance,spacingM,verticalScale:10,route,basis:'Along a continuous OSM ECML route; ground from the actual drawn mesh heightAt; rails from drawn geometry. Orange ground and blue rail heights exaggerated 10x, horizontal distance in metres. Surface railheads are drawn at y=0 m. Tunnel lines are schematic at their actual drawn y=-4 m depth (core/scene.ts TUNNEL_DEPTH), not a surveyed rail gradient; live train bodies remain at y=0 m.'};
}

/** Real target vertices must occupy both grid axes; a flat platform wall cannot certify a train/arch/portal. */
export function inspectSideExtent(T,scene,camera,evidence,width,height) {
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  let loX=Infinity,hiX=-Infinity,loY=Infinity,hiY=-Infinity,count=0;
  const owners=[];
  scene.traverseVisible(o=>{
    if(!o.isMesh&&!o.isLine)return;
    let owned=false;for(let p=o;p;p=p.parent)if(evidence.targetNames.includes(p.name))owned=true;
    if(!owned||!o.geometry?.attributes.position)return;
    const vertices=o.geometry.attributes.position;let used=0;
    const instances=o.isInstancedMesh?o.count:1;
    for(let instance=0;instance<instances;instance++)for(let i=0;i<vertices.count;i++){
      const local=new T.Vector3().fromBufferAttribute(vertices,i);
      if(o.isInstancedMesh){const matrix=new T.Matrix4();o.getMatrixAt(instance,matrix);local.applyMatrix4(matrix);}
      const world=o.localToWorld(local);
      // Portal meshes contain all mouths: measure only vertices in this purpose-framed section.
      const b=evidence.bounds;if(world.x<b.x[0]||world.x>b.x[1]||world.z<b.z[0]||world.z>b.z[1])continue;
      const p=world.project(camera);if(Math.abs(p.x)>1||Math.abs(p.y)>1||p.z<=-1||p.z>=1)continue;
      loX=Math.min(loX,p.x);hiX=Math.max(hiX,p.x);loY=Math.min(loY,p.y);hiY=Math.max(hiY,p.y);count++;used++;
    }
    if(used)owners.push(o.name||o.type);
  });
  const extentM=[(hiX-loX)*(camera.right-camera.left)/2,(hiY-loY)*(camera.top-camera.bottom)/2],extentPixels=[(hiX-loX)*width/2,(hiY-loY)*height/2];
  const context=[];
  if(evidence.view==='side')for(const [name,owner] of [['track-rails','track'],['platform-walls','platforms']]) {
    const object=scene.getObjectByName(name);
    let result=null;
    if(object)for(let z=evidence.bounds.z[0]+1;z<evidence.bounds.z[1]-1;z+=.5){
      for(const y of name==='track-rails'?[-.007,-.05,-.08]:[.2,.5,.75]){
        const probe=visibleProbe(T,scene,camera,[evidence.bounds.x[1],y,z],owner);if(probe.clear){result=probe;break;}
      }
      if(result)break;
    }
    context.push({name,clear:Boolean(result),probe:result});
  }
  const clear=count>0&&extentM.every((v,i)=>Number.isFinite(v)&&v>=evidence.minimumExtentM[i])&&extentPixels.every(v=>v>=24)&&context.every(p=>p.clear);
  return {clear,reason:clear?null:'actual side geometry is missing or flat in a grid axis',extentM,extentPixels,minimumExtentM:evidence.minimumExtentM,context,owners,vertexCount:count,section:evidence.section};
}
