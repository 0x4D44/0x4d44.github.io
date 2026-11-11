// P2 frontage: where P2 draws its own ground surfaces, as plain polygons, so the Perth land-use drape (W3) can leave holes there rather than
// lie over them (lead ruling 2026-11-10 13:18). Pure data: no THREE objects. The polygons are in the Perth frame (x east, z south), each a
// ring of [x, z] points, and may overlap; a point is masked if it is inside any of them.
import type {Pt} from '../../core/geo.ts';
import {KINGS_PLACE_CUT,cutField,cutRoads} from './perth-frontage-bridge.ts';
import {FRONTAGE_WINDOW,ROAD_WIDTHS} from './perth-frontage-street.ts';
import type {FrontageFile} from './perth-frontage-street.ts';
import frontageFile from './data/perth-frontage.json' with {type:'json'};

/** How far past the drawn edge each mask reaches (m), so the drape's own coarse edge falls clear of P2's surfaces. */
export const PERTH_FRONTAGE_MASK_MARGIN=.6;
/** The station front's pavement band (m) out from the outline's north edge: STREET_LEVELS.pavement (4.2 m) and the kerb, plus the margin. */
const FRONT_BAND=5;
/** P2 round 11 (the round-7 to round-10 scores' "lime line" at capture y about 607 in pt-station-hotel): the land-use drape's grass edge lay
 *  0.6 m out from the hotel's street front, and its polygon offset carried it over the forecourt's bushes. The hotel's street front, OSM
 *  way/234811330's vertices from its north-west corner to the east wing's (a test holds them to the outline), and the band (m) masked
 *  either side of it: 1.5 m out over the pavement, 10 m in under the hotel. The drape is cut in 16 m cells, each dropped only when a corner or
 *  its centroid is masked, and the cells along the facade's foot have their centroids 3.8 m and 7.2 m inside the front. */
export const PERTH_HOTEL_FRONT:readonly Pt[]=[[-26.9,-94.5],[-26,-95.3],[-25.3,-97.8],[-8.7,-104.7],[-8.5,-104.3],[-3.2,-106.5]];
const HOTEL_BAND=1.5,HOTEL_DEPTH=10;

export interface PerthFrontageGroundMask {
 /** The King's Place cut: carriageways, pavements and the retaining walls' feet, along each cut road's ramp, and the deck's paved floor. */
 cut:[number,number][][];
 /** The forecourt: the mapped car parks and the road and path strips P2 drapes inside FRONTAGE_WINDOW, and the station front's pavement. */
 forecourt:[number,number][][];
}

/** Quads `half` m either side of a polyline (`inner` m on the side opposite the normal (-dz, dx), when given), one per piece of at most `step` m, keeping a piece
 *  when `keep` accepts its midpoint. */
function band(line:readonly Pt[],half:number,keep:(p:Pt)=>boolean,step=3,inner=half):[number,number][][]{
 const out:[number,number][][]=[];
 for(let i=0;i+1<line.length;i++){const a=line[i],c=line[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]);if(l<1e-6)continue;
  const k=Math.max(1,Math.ceil(l/step)),nx=-(c[1]-a[1])/l*half,nz=(c[0]-a[0])/l*half,ix=nx*inner/half,iz=nz*inner/half;
  for(let j=0;j<k;j++){const p:Pt=[a[0]+(c[0]-a[0])*j/k,a[1]+(c[1]-a[1])*j/k],q:Pt=[a[0]+(c[0]-a[0])*(j+1)/k,a[1]+(c[1]-a[1])*(j+1)/k];
   if(!keep([(p[0]+q[0])/2,(p[1]+q[1])/2]))continue;
   // overlap each quad 0.3 m onto the next, so no hairline gap opens at a bend
   const e=.3/l,p2:Pt=[p[0]-(c[0]-a[0])*e,p[1]-(c[1]-a[1])*e],q2:Pt=[q[0]+(c[0]-a[0])*e,q[1]+(c[1]-a[1])*e];
   out.push([[p2[0]+nx,p2[1]+nz],[q2[0]+nx,q2[1]+nz],[q2[0]-ix,q2[1]-iz],[p2[0]-ix,p2[1]-iz]]);}
 }
 return out;
}

/**
 * Where P2 draws its own ground: the King's Place cut and the forecourt. `stationOuter` is the station outline (OSM way/4064272, from
 * perth-scene.json); when given, the pavement band along its north street front is included too.
 */
export function perthFrontageGroundMask(stationOuter?:readonly (readonly number[])[],file:FrontageFile=frontageFile as FrontageFile):PerthFrontageGroundMask{
 const M=PERTH_FRONTAGE_MASK_MARGIN,W=FRONTAGE_WINDOW,inWindow=(p:Pt)=>p[0]>=W.x0&&p[0]<=W.x1&&p[1]>=W.z0&&p[1]<=W.z1;
 const roads=cutRoads(),cut=roads.flatMap(r=>band(r.line,r.half+KINGS_PLACE_CUT.pavement+.7+M,p=>r.inRamp(...p),1.5));
 // the junction's rounded corners (cutField's smooth union reaches past the straight bands there): 1 m squares where it does
 const reach=KINGS_PLACE_CUT.pavement+.7+M,pts=cut.flat(),bx0=Math.floor(Math.min(...pts.map(q=>q[0]))),bx1=Math.ceil(Math.max(...pts.map(q=>q[0])));
 const bz0=Math.floor(Math.min(...pts.map(q=>q[1]))),bz1=Math.ceil(Math.max(...pts.map(q=>q[1]))),straight=cut.slice();
 for(let z=bz0;z<=bz1;z++)for(let x=bx0;x<=bx1;x++){const f=cutField(roads,x,z)?.f;if(f===undefined||f>reach+.75)continue;
  if(inPerthFrontageGroundMask({cut:straight,forecourt:[]},x,z))continue;cut.push([[x-.75,z-.75],[x+.75,z-.75],[x+.75,z+.75],[x-.75,z+.75]]);}
 // the deck's paved floor (cutSurfaceAt), its outline pushed out by the margin plus the abutments' and closing walls' 1.05 m
 const ring=file.bridge.ring.map(q=>[q[0],q[1]] as Pt),cx=ring.reduce((s,q)=>s+q[0],0)/ring.length,cz=ring.reduce((s,q)=>s+q[1],0)/ring.length;
 cut.push(ring.map(([x,z])=>{const l=Math.hypot(x-cx,z-cz)||1,o=1.05+M;return [x+(x-cx)/l*o,z+(z-cz)/l*o] as [number,number];}));
 const forecourt:[number,number][][]=file.parking.map(p=>p.ring.map(q=>[q[0],q[1]] as [number,number]));
 for(const r of file.roads){const kind=r.service==='parking_aisle'?'parking_aisle':r.highway,half=(ROAD_WIDTHS[kind]??4)/2;
  forecourt.push(...band(r.path.map(q=>[q[0],q[1]] as Pt),half+M,inWindow));}
 forecourt.push(...band(PERTH_HOTEL_FRONT,HOTEL_BAND,()=>true,4,HOTEL_DEPTH));// the hotel's street front (P2 round 11)
 if(stationOuter){// the station's north edges from the hotel corner (-45,-84) to the east return (17.4,-22.4), as stationFront walks them
  const ring=stationOuter.map(p=>[p[0],p[1]] as Pt),near=(p:Pt)=>ring.reduce((k,q,i)=>Math.hypot(q[0]-p[0],q[1]-p[1])<Math.hypot(ring[k][0]-p[0],ring[k][1]-p[1])?i:k,0);
  const i0=near([-45,-84]),i1=near([17.4,-22.4]),fwd:Pt[]=[],back:Pt[]=[];
  for(let i=i0;;i=(i+1)%ring.length){fwd.push(ring[i]);if(i===i1||fwd.length>ring.length)break;}
  for(let i=i0;;i=(i-1+ring.length)%ring.length){back.push(ring[i]);if(i===i1||back.length>ring.length)break;}
  const chain=fwd.length<back.length?fwd:back;
  // both sides of each edge: the outward half is the pavement; the inward half lies under the station's own front range
  forecourt.push(...band(chain,FRONT_BAND,()=>true,4));
 }
 return {cut,forecourt};
}

/** True when [x, z] lies inside any of the mask's polygons. */
export function inPerthFrontageGroundMask(mask:PerthFrontageGroundMask,x:number,z:number):boolean{
 const pip=(r:readonly (readonly number[])[])=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>z)!==(r[j][1]>z)&&x<(r[j][0]-r[i][0])*(z-r[i][1])/(r[j][1]-r[i][1])+r[i][0])yes=!yes;return yes;};
 return mask.cut.some(pip)||mask.forecourt.some(pip);
}
