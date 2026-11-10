import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import dataFile from '../src/data/waverley-scene.json' with {type:'json'};
import {buildWaverleyStation,WAVERLEY_ROOF_CUTOUTS,WAVERLEY_ROOF_EXTENSION,WAVERLEY_STATION_OMIT_IDS,WAVERLEY_STATION_ROOF_ID,waverleyRoofOutline,waverleyStationRoof} from '../src/waverley-station.ts';
import {waverleyRailPieces,waverleyStationPlan,waverleyStructureBatches,WAVERLEY_EDGE_BANDS,WAVERLEY_STRUCTURE} from '../src/waverley-station-structure.ts';
import {WAVERLEY_STATION_TEXTURES} from '../src/waverley-station-textures.ts';
import {centralBlockBatches,WAVERLEY_BLOCK,WAVERLEY_CENTRAL_BLOCK_ID} from '../src/waverley-station-block.ts';
import {ridgeRoofBatches,roofHeight,WAVERLEY_ROOF_BANDS,WAVERLEY_ROOF_PROFILE,WAVERLEY_ROOF_STRIP_LIFT} from '../src/waverley-roof.ts';
import {WAVERLEY_LEVELS} from '../src/waverley-mesh.ts';

const data=unpackWaverleyScene(dataFile as never),mapped=data.roofs.find(r=>r.id===WAVERLEY_STATION_ROOF_ID)!,roof=waverleyStationRoof(mapped)!,plan=waverleyStationPlan(data,roof,WAVERLEY_ROOF_CUTOUTS),tracks=waverleyRailPieces(data);
const flat={rangeUnder:()=>({min:WAVERLEY_LEVELS.ground,max:WAVERLEY_LEVELS.ground,mean:WAVERLEY_LEVELS.ground})};
/** A train's half-width from the track centre line, metres: the KX figure for a platform face (furniture.ts FIGURES.trackProbe), ASSUMED. */
const ENVELOPE_HALF=1.7;
/** The top of a train and its overhead wires above the rail, metres. ASSUMED (a W6a vehicle is under 4 m; contact wire about 4.7 m). */
const ENVELOPE_TOP=4.8;
const segDist=(p:Pt,[a,b]:[Pt,Pt]):number=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);};
const trackDist=(p:Pt):number=>Math.min(...tracks.map(s=>segDist(p,s)));
const inRing=(p:Pt,r:readonly Pt[]):boolean=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>p[1])!==(r[j][1]>p[1])&&p[0]<(r[j][0]-r[i][0])*(p[1]-r[i][1])/(r[j][1]-r[i][1])+r[i][0])yes=!yes;return yes;};
const onPlatform=(p:Pt):boolean=>data.platforms.some(q=>inRing(p,q.path));
const onRing=(p:Pt,r:readonly Pt[],tol=.01):boolean=>r.some((a,i)=>segDist(p,[a,r[(i+1)%r.length]])<tol);
const meshOf=(g:THREE.Group,name:string):THREE.Mesh=>{const m=g.getObjectByName(name);assert.ok(m instanceof THREE.Mesh,`mesh ${name}`);return m;};

test('W1 columns stand on platforms, under the roof, at about the roof pitch, clear of every train',()=>{
 const S=WAVERLEY_STRUCTURE;
 assert.ok(plan.columns.length>=100,`${plan.columns.length} columns`);
 for(const c of plan.columns){
  const p:Pt=[c.x,c.z];
  assert.ok(onPlatform(p),`column at ${p} stands on a platform`);
  assert.ok(trackDist(p)>=ENVELOPE_HALF+S.capitalRadius,`column at ${p} is ${trackDist(p).toFixed(2)} m from a track`);
  assert.ok(inRing(p,roof.outer)&&!roof.holes.some(h=>inRing(p,h)),'under the roof, not in the central block');
 }
 // Platform girders join neighbouring columns: about one roof pitch apart, never a jump over a missing column.
 for(const [a,b]of plan.spans){const l=Math.hypot(b[0]-a[0],b[1]-a[1]);assert.ok(l>WAVERLEY_ROOF_PROFILE.pitch*.5&&l<=S.maxSpan,`span ${l.toFixed(1)} m`);}
});

test('W1 furniture keeps out of the train envelope and stays on its platform',()=>{
 const S=WAVERLEY_STRUCTURE;
 for(const [list,half]of [[plan.benches,S.benchLength/2],[plan.screens,S.screenWidth/2],[plan.signs,S.signSize/2],[plan.lamps,S.lampRadius]] as const)for(const s of list){
  const p:Pt=[s.x,s.z];assert.ok(onPlatform(p),`item at ${p} on a platform`);assert.ok(trackDist(p)>=ENVELOPE_HALF+half,`item at ${p} is ${trackDist(p).toFixed(2)} m from a track (needs ${ENVELOPE_HALF+half})`);
 }
 assert.ok(plan.benches.length>20&&plan.signs.length>20&&plan.screens.length>20&&plan.lamps.length>100);
});

test('W1 ironwork: under the glazing, above every train, and no chord coplanar with another',()=>{
 const {ironwork}=waverleyStructureBatches(plan),S=WAVERLEY_STRUCTURE,holes=plan.holes;
 // Above the girders there are only the valance on the hole's edge and the gable cladding on the outline or on a bridge's flank inside it,
 // exactly on those lines.
 const onScreenLine=(p:Pt):boolean=>holes.some(h=>onRing(p,h,1e-6))||onRing(p,plan.outline,1e-6)||plan.cutouts.some(c=>onRing(p,c as Pt[],1e-6)&&inRing(p,plan.outline));
 // Every edge of every face stays under the glass along its whole length, not only at its ends: sampled every 0.5 m and at each fold it crosses.
 const P=WAVERLEY_ROOF_PROFILE,half=P.pitch/2,pos=ironwork.positions,idx=ironwork.indices;let sampled=0;
 for(let i=0;i<idx.length;i+=3)for(let k=0;k<3;k++){
  const a=idx[i+k]*3,b=idx[i+(k+1)%3]*3,ax=pos[a],bx=pos[b],len=Math.hypot(bx-ax,pos[b+2]-pos[a+2]),ts=[...Array(Math.ceil(len/.5)+1).keys()].map(j=>Math.min(1,j*.5/(len||1)));
  if(Math.abs(bx-ax)>1e-9)for(let f=Math.ceil((Math.min(ax,bx)-P.phase)/half);P.phase+f*half<=Math.max(ax,bx);f++)ts.push((P.phase+f*half-ax)/(bx-ax));
  for(const t of ts){const x=ax+(bx-ax)*t,y=pos[a+1]+(pos[b+1]-pos[a+1])*t;sampled++;assert.ok(y<=roofHeight(x)+1e-6,`an ironwork edge at x ${x.toFixed(2)} is ${(y-roofHeight(x)).toFixed(3)} m through the glazing`);}
 }
 assert.ok(sampled>idx.length);
 let over=0;
 for(let i=0;i<ironwork.positions.length;i+=3){
  const x=ironwork.positions[i],y=ironwork.positions[i+1],z=ironwork.positions[i+2],p:Pt=[x,z];
  if(y>S.gutterGirderTop+1e-6)assert.ok(onScreenLine(p),`ironwork at ${p} rises above the girders off the hole, outline and bridge lines`);
  if(trackDist(p)<ENVELOPE_HALF){over++;assert.ok(y>=ENVELOPE_TOP,`ironwork over a track at ${p} is ${y.toFixed(2)} m up`);}
 }
 assert.ok(over>1000,'girders do span the tracks');
 assert.ok(S.gutterGirderTop<WAVERLEY_ROOF_PROFILE.gutter,'gutter girders stay under the gutter');
 const chords=[S.gutterGirderTop,S.gutterGirderTop-S.chordDepth,S.gutterGirderTop-S.gutterGirderDepth,S.gutterGirderTop-S.gutterGirderDepth+S.chordDepth];
 const other=[S.platformGirderTop,S.platformGirderTop-S.chordDepth,S.platformGirderTop-S.platformGirderDepth,S.platformGirderTop-S.platformGirderDepth+S.chordDepth];
 for(const a of chords)for(const b of other)assert.ok(Math.abs(a-b)>=.04,`chord faces at ${a} and ${b} are too close`);
 assert.ok(S.valanceBottom>data.buildings.find(b=>b.id===WAVERLEY_CENTRAL_BLOCK_ID)!.height+.04+.3,'the valance clears the block and its cornice');
});

test('W1 columns: pedestal, shaft and capital fill the platform-to-girder height',()=>{
 const S=WAVERLEY_STRUCTURE,{fittings}=waverleyStructureBatches({...plan,signs:[],screens:[],benches:[],railings:[],columns:plan.columns.slice(0,1)});
 const ys=fittings.positions.filter((_,i)=>i%3===1);
 assert.ok(Math.abs(Math.min(...ys)-WAVERLEY_LEVELS.platform)<1e-6);
 assert.ok(Math.abs(Math.max(...ys)-(S.platformGirderTop-S.platformGirderDepth))<1e-6,'the abacus carries the platform girder');
});

test('W1 roof: the solid gutter and ridge strips are a fixed share of each pitch, just over the glazing',()=>{
 const outer:Pt[]=[[0,0],[36,0],[36,24],[0,24]],{solid}=ridgeRoofBatches(outer,[]);
 let area=0;
 for(let i=0;i<solid.indices.length;i+=3){const [a,b,c]=solid.indices.slice(i,i+3).map(n=>solid.positions.slice(n*3,n*3+3));area+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;}
 const share=2*(WAVERLEY_ROOF_BANDS.gutter+WAVERLEY_ROOF_BANDS.ridge)/WAVERLEY_ROOF_PROFILE.pitch;
 assert.ok(Math.abs(area-36*24*share)<1e-6,`solid ${area} m2`);
 assert.ok(WAVERLEY_ROOF_STRIP_LIFT>=.02,'the strips stand clear of the glazing, never in its plane');
 for(let i=0;i<solid.positions.length;i+=3)assert.ok(Math.abs(solid.positions[i+1]-roofHeight(solid.positions[i])-WAVERLEY_ROOF_STRIP_LIFT)<1e-6);
});

test('W1 platform edge bands lie on their platforms, along track edges only',()=>{
 const {edges}=waverleyStructureBatches(plan);assert.ok(edges.triangles>200);
 for(let i=0;i<edges.indices.length;i+=3){
  const vs=edges.indices.slice(i,i+3).map(n=>edges.positions.slice(n*3,n*3+3)),c:Pt=[(vs[0][0]+vs[1][0]+vs[2][0])/3,(vs[0][2]+vs[1][2]+vs[2][2])/3];
  assert.ok(onPlatform(c),`edge band at ${c}`);assert.ok(vs.every(v=>Math.abs(v[1]-WAVERLEY_LEVELS.platform-WAVERLEY_STRUCTURE.stripLift)<1e-9));
 }
 assert.equal(WAVERLEY_EDGE_BANDS[1].to-WAVERLEY_EDGE_BANDS[1].from,.4,'the DfT 400 mm warning strip');
});

test('W1 draws the central block itself: the mapped block leaves the city loop and the replacement covers its footprint',async()=>{
 assert.deepEqual([...WAVERLEY_STATION_OMIT_IDS],[WAVERLEY_CENTRAL_BLOCK_ID]);
 const {buildWaverleyScene}=await import('../src/waverley-scene.ts');const scene=buildWaverleyScene({lighting:false});
 assert.ok(!scene.buildingIds.includes(WAVERLEY_CENTRAL_BLOCK_ID),'the generic block is not drawn');
 const block=data.buildings.find(b=>b.id===WAVERLEY_CENTRAL_BLOCK_ID)!,top=scene.parts.platforms.getObjectByName('waverley-central-block-top') as THREE.Mesh;
 assert.ok(top,'the replacement is drawn');scene.group.updateMatrixWorld(true);
 const xs=block.outer.map(p=>p[0]),zs=block.outer.map(p=>p[1]);let hits=0,inside=0;
 for(let x=Math.min(...xs);x<=Math.max(...xs);x+=3)for(let z=Math.min(...zs);z<=Math.max(...zs);z+=3){
  if(!inRing([x,z],block.outer))continue;inside++;
  const h=new THREE.Raycaster(new THREE.Vector3(x,50,z),new THREE.Vector3(0,-1,0)).intersectObject(top);
  if(h.length&&Math.abs(h[0].point.y-(scene.terrain.rangeUnder(block.outer,4).min+block.height))<1e-3)hits++;
 }
 assert.ok(inside>100);assert.equal(hits,inside,'every point of the footprint is roofed by the block at its height');
 scene.dispose();
});

test('W1 central block: windows sit on the walls between plinth and cornice, never coplanar with them',()=>{
 const block=data.buildings.find(b=>b.id===WAVERLEY_CENTRAL_BLOCK_ID)!,{windows,stone}=centralBlockBatches(block,0);
 assert.ok(windows.triangles>=40&&stone.triangles>100);
 // The balustraded parapet stands on the cornice, under the valance round the roof's hole.
 const top=Math.max(...stone.positions.filter((_,i)=>i%3===1));
 assert.ok(Math.abs(top-(block.height+.04+WAVERLEY_BLOCK.parapetHeight))<1e-6,`parapet top ${top}`);
 assert.ok(top<WAVERLEY_STRUCTURE.valanceBottom-.05,'the parapet clears the valance');
 assert.ok(WAVERLEY_BLOCK.pilasterDepth>=.3,'pilasters stand proud enough to cast a shadow (R-wv1-b3)');
 const ys=windows.positions.filter((_,i)=>i%3===1);assert.ok(Math.max(...ys)<=block.height-WAVERLEY_BLOCK.cornice,'windows stop under the cornice');
 assert.ok(WAVERLEY_BLOCK.windowLift>0&&WAVERLEY_BLOCK.doorLift>WAVERLEY_BLOCK.plinthDepth,'a door stands clear of the plinth in front of it');
});

test('W1 station: every part is counted, and dispose frees the owned materials',()=>{
 const s=buildWaverleyStation(data,flat);let tris=0,draws=0;
 for(const g of [s.platforms,s.roof])g.traverse(o=>{if(o instanceof THREE.Mesh){tris+=o.geometry.index!.count/3;draws++;}});
 assert.equal(s.stats.triangles,tris);assert.equal(s.stats.drawCalls,draws);
 assert.ok(s.stats.triangles<240000,`${s.stats.triangles} triangles`);assert.ok(s.stats.drawCalls<=6+24);
 const m=(s.roof.getObjectByName('waverley-roof-ironwork') as THREE.Mesh).material as THREE.Material;let freed=0;m.addEventListener('dispose',()=>freed++);
 s.dispose();assert.equal(freed,1);
});

test('W1 roof stops at North Bridge and Waverley Bridge, keeps the published 34,000 m2 within 5%, and leaves the Waverley Steps to W2',async()=>{
 const {default:frontage}=await import('../src/data/waverley-frontage.json',{with:{type:'json'}});
 const s=buildWaverleyStation(data,flat),bridges=frontage.bridges.map(b=>b.ring as Pt[]);
 let area=0;
 for(const name of ['waverley-mapped-roofs','waverley-roof-underside','waverley-roof-strips','waverley-roof-ironwork','waverley-roof-runners']){
  const g=(s.roof.getObjectByName(name) as THREE.Mesh).geometry,pos=g.getAttribute('position'),idx=g.index!;
  for(let i=0;i<idx.count;i+=3){
   const v=[0,1,2].map(k=>[pos.getX(idx.getX(i+k)),pos.getY(idx.getX(i+k)),pos.getZ(idx.getX(i+k))]),c:Pt=[(v[0][0]+v[1][0]+v[2][0])/3,(v[0][2]+v[1][2]+v[2][2])/3];
   if(c[0]<-90||c[0]>320)continue;
   // Every corner, not just the centre: a face that straddles a bridge edge has a corner more than a centimetre inside it.
   for(const p of v){const q:Pt=[p[0],p[2]];assert.ok(!bridges.some(b=>inRing(q,b)&&b.every((a,j)=>segDist(q,[a,b[(j+1)%b.length]])>.01)),`${name} corner at ${q} lies inside a bridge outline`);}
   if(name==='waverley-mapped-roofs'&&inRing(c,roof.outer)&&v.every(p=>p[1]>=WAVERLEY_ROOF_PROFILE.gutter-1e-6))area+=Math.abs((v[1][0]-v[0][0])*(v[2][2]-v[0][2])-(v[1][2]-v[0][2])*(v[2][0]-v[0][0]))/2;
  }
 }
 assert.ok(Math.abs(area/34000-1)<=.05,`station roof ${area.toFixed(0)} m2 against Network Rail's 34,000`);
 for(const c of plan.columns)assert.ok(!bridges.some(b=>inRing([c.x,c.z],b)),'no column stands under a bridge deck');
 const steps=data.roofs.find(r=>r.id==='way/577519823')!,mid=steps.outer.reduce((a,p)=>[a[0]+p[0]/steps.outer.length,a[1]+p[1]/steps.outer.length],[0,0]);
 s.roof.updateMatrixWorld(true);
 assert.equal(new THREE.Raycaster(new THREE.Vector3(mid[0],60,mid[1]),new THREE.Vector3(0,-1,0)).intersectObject(s.roof.getObjectByName('waverley-mapped-roofs')!).length,0,'the steps slab is not drawn');
 s.dispose();
});

test('W1 roof runs out to Waverley Bridge on the south half: the extension is spliced into the real outline and closes the open strip',()=>{
 const E=WAVERLEY_ROOF_EXTENSION;assert.equal(roof.outer.length,mapped.outer.length+2,'two corners added');
 assert.deepEqual(waverleyRoofOutline([[0,0],[10,0],[10,10]]),[[0,0],[10,0],[10,10]],'an outline without those corners is left alone');
 const wb=WAVERLEY_ROOF_CUTOUTS.find(h=>h.some(p=>p[0]<-90))!,face=roof.outer.find(p=>Math.abs(p[1]-E.faceZ)<1e-9&&p[0]<-70)!;
 assert.ok(face&&!inRing(face,wb)&&onRing(face,wb,E.faceGap+1e-6),`the new corner ${face} stands just off the bridge's east face`);
 // A point in the old strip of open track is under the roof now, and so is one in the mapped roof; the strip has columns.
 for(const p of [[-66,20],[-60,5],[-30,-40]] as Pt[])assert.ok(inRing(p,roof.outer),`${p} roofed`);
 assert.ok(!inRing([-66,20],mapped.outer),'that point was open in OSM');
 assert.ok(plan.columns.some(c=>!inRing([c.x,c.z],mapped.outer)),'columns carry the extension');
 assert.ok(plan.gutters.some(([x,z0,z1])=>x===-60&&z1>30),'a gutter girder runs under the extension');
});

test('W1 glazing: near-opaque silver cassettes from above, the translucent glazing from below, one shared buffer',()=>{
 const s=buildWaverleyStation(data,flat),top=meshOf(s.roof,'waverley-mapped-roofs'),under=meshOf(s.roof,'waverley-roof-underside');
 const tm=top.material as THREE.MeshLambertMaterial,um=under.material as THREE.MeshLambertMaterial;
 assert.equal(tm.side,THREE.FrontSide);assert.equal(um.side,THREE.BackSide);assert.equal(top.geometry,under.geometry);
 assert.ok(tm.opacity>=.9&&um.opacity<.85,`top ${tm.opacity}, underside ${um.opacity}`);
 const n=top.geometry.getAttribute('normal');for(let i=0;i<n.count;i+=97)assert.ok(n.getY(i)>.9,'the glazing faces up');
 const [u,v]=WAVERLEY_STATION_TEXTURES.cassettes.tile;assert.ok(Math.abs(u*v-1.2)<.3,`cassette ${u} x ${v} m against 28,000 panes on 34,000 m2`);
 s.dispose();
});

test('W1 purlins and the south edge girder: under the glazing, between the gutter girders, clear of every train',()=>{
 const S=WAVERLEY_STRUCTURE;assert.ok(plan.purlins.length>300,`${plan.purlins.length} purlins`);assert.ok(plan.edgeGirders.length>100,`${plan.edgeGirders.length} m of south edge girder`);
 assert.ok(S.purlinTop<=S.gutterGirderTop-.02&&S.purlinTop-S.purlinDepth>=S.platformGirderTop+.04-1e-9,'purlin faces share no plane with a chord');
 for(const [x0,x1,z]of plan.purlins){
  assert.ok(Math.abs(x1-x0-(WAVERLEY_ROOF_PROFILE.pitch-S.chordWidth))<1e-9,'a purlin spans gutter girder to gutter girder');
  for(const x of [x0,x1])assert.ok(inRing([x,z],roof.outer)&&!plan.cutouts.some(c=>inRing([x,z],c)),'under the roof, not under a deck');
 }
 for(const [a,b]of plan.edgeGirders)for(const p of [a,b]){assert.ok(inRing(p,roof.outer),'inside the outline');assert.ok(!plan.cutouts.some(c=>inRing(p,c)),'not under a bridge');}
});

test('W1 railings stand on their platforms along edges with no track, and benches are slatted on end frames',()=>{
 const S=WAVERLEY_STRUCTURE;assert.ok(plan.railings.length>=5,`${plan.railings.length} railings`);
 for(const [a,b]of plan.railings)for(const p of [a,b,[(a[0]+b[0])/2,(a[1]+b[1])/2] as Pt]){assert.ok(onPlatform(p),`railing at ${p}`);assert.ok(trackDist(p)>=ENVELOPE_HALF,`railing at ${p} is ${trackDist(p).toFixed(2)} m from a track`);}
 const one={...plan,columns:[],signs:[],screens:[],railings:[],lamps:[],benches:plan.benches.slice(0,1)},{fittings}=waverleyStructureBatches(one);
 // Four seat slats, three back slats, per end two legs, a seat rail and a back post: 15 boxes of 12 triangles.
 assert.equal(fittings.triangles,15*12);
 const seat=fittings.positions.filter((_,i)=>i%3===1).filter(y=>Math.abs(y-(WAVERLEY_LEVELS.platform+S.benchSeat+.0175))<1e-6).length;assert.ok(seat>0,'slats at seat height');
});

test('W1 split islands: a column may straddle the seam between two halves, clear of both halves\' tracks',()=>{
 const island=plan.columns.filter(c=>c.ref.includes('/'));assert.ok(island.length>=1,'at least one island column');
 for(const c of island)assert.ok(trackDist([c.x,c.z])>=ENVELOPE_HALF+WAVERLEY_STRUCTURE.capitalRadius);
});

test('W1 platform tactile strip: blister texture in metres, 0.4 m deep, on the platforms',()=>{
 const {tactile}=waverleyStructureBatches(plan);assert.ok(tactile.triangles>100);
 const uv=tactile.uvs!,vs=uv.filter((_,i)=>i%2===1);assert.ok(Math.min(...vs)===0&&Math.abs(Math.max(...vs)-.4)<1e-9,'v runs across the 0.4 m strip');
 for(let i=0;i<tactile.positions.length;i+=3)assert.ok(Math.abs(tactile.positions[i+1]-WAVERLEY_LEVELS.platform-WAVERLEY_STRUCTURE.stripLift)<1e-9);
 const [tu,tv]=WAVERLEY_STATION_TEXTURES.blister.tile;assert.ok(tu<=.4&&tv<=.4,'a texture tile is no bigger than the strip');
});

/** A made-up layout: platforms as rectangles x 0..40 m, tracks as straight lines, one big roof over all. */
const layout=(platforms:{ref:string;z0:number;z1:number}[],tracks:[number,number,number][])=>({
 platforms:platforms.map(({ref,z0,z1})=>({id:ref,ref,tags:{},path:[[0,z0],[40,z0],[40,z1],[0,z1]] as Pt[]})),
 rails:tracks.map(([z,x0,x1],i)=>({id:`r${i}`,tags:{railway:'rail'},path:[[x0,z],[x1,z]] as Pt[]})),
});
const bigRoof={outer:[[-20,-20],[60,-20],[60,30],[-20,30]] as Pt[],holes:[]};

test('W1 split islands, made up: a wide island takes a column on its seam, a narrow one none',()=>{
 const S=WAVERLEY_STRUCTURE,need=1.6+.1+S.pedestalRadius;// the KX safety line and slack, plus the pedestal
 for(const [half,expect]of [[2.3,true],[1.8,false]] as const){
  // Each 2.3 m half is too narrow for a column of its own beside its track; the 4.6 m island is not.
  const d=layout([{ref:'a',z0:0,z1:half},{ref:'b',z0:half,z1:2*half}],[[-1.7,-10,50],[2*half+1.7,-10,50]]);
  const cols=waverleyStationPlan(d,bigRoof).columns.filter(c=>c.ref==='a/b');
  assert.equal(cols.length>0,expect,`${2*half} m island: ${cols.length} seam columns`);
  for(const c of cols)assert.ok(Math.min(c.z,2*half-c.z)>=need-1e-9,`seam column ${c.z.toFixed(2)} m in`);
 }
});

test('W1 railings, made up: none where a track runs close past the end of an open edge',()=>{
 // The far side faces a track for only 12 of its 40 m, so it is an open edge; that track passes 1.2 m off it.
 const d=layout([{ref:'a',z0:0,z1:6}],[[-1.7,-10,50],[7.2,-10,12]]),plan=waverleyStationPlan(d,bigRoof);
 const near=(p:Pt):number=>Math.min(...d.rails.map(r=>segDist(p,r.path as [Pt,Pt])));
 for(const [a,b]of plan.railings)for(const p of [a,b])assert.ok(near(p)>=ENVELOPE_HALF,`railing end at ${p} is ${near(p).toFixed(2)} m from a track`);
});
