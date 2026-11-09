import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, shedLayout, stationBuilding, worldToShed } from '../../core/station.ts';
import { buildConcourse } from '../src/concourse.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const hotel = data.buildings.find(b => b.id === 46821177)!;
const layout = shedLayout(data), canopy = concourseCanopy(data), station = stationBuilding(data)!;
const cross = (a: Pt, b: Pt, p: Pt): number => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function area(p: Pt[]): number {
  return Math.abs(p.reduce((s,a,i) => { const b=p[(i+1)%p.length]!; return s+a[0]*b[1]-b[0]*a[1]; },0))/2;
}
// Independent convex clipping of each rendered triangle against an ear-triangulation of the
// complete concave hotel footprint. Detects edge crossings and a hotel wholly inside a face.
const hotelTriangles = THREE.ShapeUtils.triangulateShape(hotel.pts.map(p=>new THREE.Vector2(...p)), [])
  .map(t=>t.map(i=>hotel.pts[i]!) as [Pt,Pt,Pt]);
function intersection(subject: Pt[], clip: [Pt,Pt,Pt]): number {
  let p=subject;
  const orientation=Math.sign(cross(clip[0],clip[1],clip[2]));
  for(let i=0;i<3 && p.length;i++) {
    const a=clip[i]!,b=clip[(i+1)%3]!, next:Pt[]=[];
    for(let j=0;j<p.length;j++) {
      const s=p[j]!,e=p[(j+1)%p.length]!, ds=orientation*cross(a,b,s),de=orientation*cross(a,b,e);
      if(ds>=0) next.push(s);
      if((ds>=0)!==(de>=0)) { const t=ds/(ds-de); next.push([s[0]+t*(e[0]-s[0]),s[1]+t*(e[1]-s[1])]); }
    }
    p=next;
  }
  return area(p);
}
test('triangle overlap detects crossings and contained polygons without relying on vertices',()=>{
  assert.equal(intersection([[-2,-.2],[2,-.2],[0,.2]], [[-1,-1],[1,-1],[0,1]]) > 0,true);
  assert.equal(intersection([[-10,-10],[10,-10],[0,10]], [[-1,-1],[1,-1],[0,1]]),2);
});
test('drawn roof and members clear the Great Northern Hotel OSM footprint while retaining Arup extent',()=>{
  // The fourth argument is the domain exclusion, not an altered camera or fitted radius.
  const group=buildConcourse(canopy, station.pts, layout, [hotel.pts]);
  const metrics: Record<string,{area:number;count:number}>={};
  const extent:number[]=[];
  for(const name of ['concourse-panels','concourse-edges','concourse-glass','concourse-lattice','concourse-floor']) {
    const mesh=group.getObjectByName(name) as THREE.Mesh, p=mesh.geometry.getAttribute('position'), index=mesh.geometry.index;
    let overlap=0,count=0;
    for(let i=0;i<(index?.count??p.count);i+=3) {
      const tri:Pt[]=[0,1,2].map(k=>{const n=index?index.getX(i+k):i+k;return [p.getX(n),p.getZ(n)] as Pt;});
      const value=hotelTriangles.reduce((sum,t)=>sum+intersection(tri,t),0);
      if(value>1e-7) {overlap+=value;count++;}
    }
    metrics[name]={area:overlap,count};
    if(name==='concourse-panels'||name==='concourse-edges') for(let i=0;i<p.count;i++) extent.push(worldToShed(layout,[p.getX(i),p.getZ(i)]).v); // the roof's reach: the panels and the edge band under them
  }
  const span=Math.max(...extent)-Math.min(...extent);
  console.log(JSON.stringify({hotelId:hotel.id,metrics,span}));
  for(const [name,m] of Object.entries(metrics)) assert.ok(m.area<1e-4, `${name} overlaps hotel: ${m.area} m² in ${m.count} triangles`);
  assert.ok(Math.abs(span-138)<3, `Arup overall extent ${span} m must stay within 3 m of 138 m`);
});

// The old slab inherited roof lattice chords and omitted these surveyed ground-domain points.
test('concourse ground reaches the OSM floor boundary at both hotel corners',()=>{
  const floor=buildConcourse(canopy,station.pts,layout,[hotel.pts]).getObjectByName('concourse-floor')!;
  floor.updateMatrixWorld(true);
  for(const [x,z] of [[-28.6709202547,-27.2711170717],[-64.5516053826,-55.6315040266]]) {
    const hits=new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0),0,2).intersectObject(floor);
    assert.ok(hits.length,`OSM ground domain has an uncovered hotel corner at ${x},${z}`);
  }
});
