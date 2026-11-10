// P2 frontage: the rail underbridge that carries the Tay Coast Line over King's Place (OSM way/1260630142, man_made=bridge, ODbL), and the
// road cut under it. Source R-pt2-d: geograph 8184219 (habiloid, 2025-08-06, CC BY-SA 2.0; camera NO 1138 2310, looking NNE),
// "The railway bridge at the junction of St. Leonard's Bank and Kings Place". It shows a pair of half-through riveted plate girders painted
// red, each web divided by stiffeners into framed panels lined in cream, with an "1849" plate (Perth Civic Trust also dates the bridge
// 1849). They stand on coursed rubble abutments with dressed sandstone quoins, and a high rubble retaining wall lines King's Place.
// Levels are ASSUMED, scaled off the two 48-sheet posters under the deck (3.05 m by 6.1 m) at about 55 px/m. The road is 4.3 m under
// the girders' soffit, the girders are 3.3 m deep, and their top stands 1.5 m over the rail (y = 0, the scene's schematic rail head).
// So the road lies about 6.1 m under the rail; the 16 m DTM cannot resolve that cutting, so this module carves it.
import type {Pt} from '../../core/geo.ts';
import {createTerrain,encodeGrid} from '../../core/terrain.ts';
import type {Terrain} from '../../core/terrain.ts';
import type {TrackSegment} from './station-railway.ts';
import {Batch,rgb} from './materials.ts';
import type {Rgb,V3} from './materials.ts';
import {cleanRing} from './waverley-mesh.ts';
import {wallBox} from './waverley-frontage-mesh.ts';
import frontageFile from './data/perth-frontage.json' with {type:'json'};

/** ASSUMED from R-pt2-d (see the header): heights relative to the rail (y = 0). */
export const KINGS_PLACE_LEVELS={road:-6.1,soffit:-1.8,top:1.5,panel:1.12,web:.012} as const;
export const KINGS_PLACE_COLOURS={red:0xb3262a,cream:0xe6dcc0,flange:0x8a1c20,rubble:0x6f665d,quoin:0x9a7f68,soffit:0x2f2c2a} as const;
export const KINGS_PLACE_SOURCE={photo:'https://www.geograph.org.uk/photo/8184219',author:'habiloid',licence:'CC BY-SA 2.0',date:'2025-08-06',date1849:'https://www.perthcivictrust.org.uk/staging/?p=2081'} as const;

/** King's Place's mapped centreline (OSM primary, ODbL) from Leonard Street to St Leonard's Bank, west to east. */
export function kingsPlaceLine(file:{roads:{name?:string;path:number[][]}[]}=frontageFile):Pt[]{
 const segs=file.roads.filter(r=>r.name==="King's Place").map(r=>r.path.map(p=>[p[0],p[1]] as Pt)).map(p=>p[0][0]>p.at(-1)![0]?[...p].reverse():p);
 segs.sort((a,b)=>a[0][0]-b[0][0]);
 const out:Pt[]=[];for(const s of segs)for(const p of s)if(!out.length||Math.hypot(p[0]-out.at(-1)![0],p[1]-out.at(-1)![1])>.01)out.push(p);
 return out;
}
const segDist=(x:number,z:number,ax:number,az:number,bx:number,bz:number)=>{const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-ax-t*dx,z-az-t*dz);};
const inRing=(x:number,z:number,p:readonly Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const smooth=(t:number)=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
/** The cut (ASSUMED grades): King's Place flat at KINGS_PLACE_LEVELS.road under the bridge's plan extent, ramping to the ground over
 *  `ramp` m each way; St Leonard's Bank, which R-pt2-d shows dropping beside the railway's retaining wall to the junction under the bridge,
 *  ramping from the junction over `bankRamp` m. Full depth `half` m either side of each centreline, blending out over `blend` m. */
export const KINGS_PLACE_CUT={half:5.5,bankHalf:4,blend:2,ramp:26,bankRamp:42,railClear:3.5,railBlend:.8} as const;
/** St Leonard's Bank (OSM way/24215785, ODbL) from its junction with King's Place, north to south. */
export function stLeonardsBankLine(file:{roads:{id:string;path:number[][]}[]}=frontageFile):Pt[]{
 const r=file.roads.find(q=>q.id==='way/24215785');if(!r)throw Error("St Leonard's Bank way/24215785 missing from perth-frontage.json");
 const p=r.path.map(q=>[q[0],q[1]] as Pt);return p[0][1]<p.at(-1)![1]?p:[...p].reverse();
}
/** The cut's roads: centreline, half width, and the distance along the road from the bridge (0 under it). */
export function cutRoads(bridgeRing:readonly Pt[]=frontageFile.bridge.ring.map(p=>[p[0],p[1]] as Pt)){
 const C=KINGS_PLACE_CUT,bx0=Math.min(...bridgeRing.map(p=>p[0])),bx1=Math.max(...bridgeRing.map(p=>p[0])),bank=stLeonardsBankLine();
 const lenTo=(line:Pt[],x:number,z:number)=>{let best=Infinity,acc=0,out=0;for(let i=0;i+1<line.length;i++){const a=line[i],c=line[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]),
   t=Math.max(0,Math.min(1,((x-a[0])*(c[0]-a[0])+(z-a[1])*(c[1]-a[1]))/(l*l||1))),d=Math.hypot(x-a[0]-t*(c[0]-a[0]),z-a[1]-t*(c[1]-a[1]));if(d<best){best=d;out=acc+t*l;}acc+=l;}return out;};
 return [
  {name:"King's Place",line:kingsPlaceLine(),half:C.half,ramp:C.ramp,along:(x:number,_z:number)=>x<bx0?bx0-x:x>bx1?x-bx1:0},
  {name:"St Leonard's Bank",line:bank,half:C.bankHalf,ramp:C.bankRamp,along:(x:number,z:number)=>lenTo(bank,x,z)},
 ];
}

/**
 * The ground with King's Place (and St Leonard's Bank's fall to it) cut under the bridge. A 1 m grid over the cut, finer than the field's,
 * holds min(ground, road level). Within KINGS_PLACE_CUT.railClear m of an open (not-bridge) rail outside the bridge the cut fades out, so
 * no track is left over a hole.
 */
export function kingsPlaceCut(field:Terrain,openRails:readonly TrackSegment[],bridgeRing:readonly Pt[]=frontageFile.bridge.ring.map(p=>[p[0],p[1]] as Pt)):Terrain{
 const C=KINGS_PLACE_CUT,L=KINGS_PLACE_LEVELS,roads=cutRoads(bridgeRing);
 const bx0=Math.min(...bridgeRing.map(p=>p[0])),bx1=Math.max(...bridgeRing.map(p=>p[0]));
 const x0=Math.floor(bx0-C.ramp-2),x1=Math.ceil(bx1+C.ramp+2);
 const pts=roads.flatMap(r=>r.line).filter(p=>p[0]>=x0&&p[0]<=x1),bz=bridgeRing.map(p=>p[1]);
 const z0=Math.floor(Math.min(...bz)-C.half-C.blend-2),z1=Math.ceil(Math.min(Math.max(...pts.map(p=>p[1])),Math.max(...bz)+C.bankRamp)+C.half+C.blend+2);
 const near=openRails.filter(([ax,az,bx,bz2])=>Math.max(ax,bx)>x0-10&&Math.min(ax,bx)<x1+10&&Math.max(az,bz2)>z0-10&&Math.min(az,bz2)<z1+10);
 const cutAt=(x:number,z:number):number=>{
  const base=field.heightAt(x,z);let h=base;
  for(const road of roads){
   let d=Infinity;for(let i=0;i+1<road.line.length;i++)d=Math.min(d,segDist(x,z,road.line[i][0],road.line[i][1],road.line[i+1][0],road.line[i+1][1]));
   const across=1-smooth((d-road.half)/C.blend);if(across<=0)continue;
   const along=1-smooth(road.along(x,z)/road.ramp),level=base+(L.road-base)*along;
   if(level>=base)continue;
   let r=Infinity;if(!inRing(x,z,bridgeRing))for(const [ax,az,bx,bz2] of near)r=Math.min(r,segDist(x,z,ax,az,bx,bz2));// under the deck the abutments carry the track
   h=Math.min(h,base+(level-base)*across*smooth((r-C.railClear)/C.railBlend));
  }
  return h;
 };
 const step=1,nx=x1-x0+1,nz=z1-z0+1,h=new Float32Array(nx*nz);
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)h[j*nx+i]=cutAt(x0+i*step,z0+j*step);
 const q=.001;
 return createTerrain({attribution:'derived',source:'perth-frontage-bridge.ts kingsPlaceCut over the station ground',groundY:field.groundY,datumAod:field.datumAod,extent:field.extent,
  grids:[...field.grids.map(g=>encodeGrid(g.h,{...g,q})),encodeGrid(h,{step,x0,z0,nx,nz,q})]});
}

/** The bridge: the two half-through girders along the outline's rail-parallel sides, their panels and stiffeners, the deck soffit between
 *  them, and the abutments along its two ends from the cut road up to the soffit. */
export function kingsPlaceBridge(b:Batch,ring:readonly Pt[],railDir:Pt,ground:Pick<Terrain,'heightAt'>):{sides:number;ends:number;panels:number}{
 const C=KINGS_PLACE_COLOURS,L=KINGS_PLACE_LEVELS,r=cleanRing(ring);let sides=0,ends=0,panels=0;
 const cx=r.reduce((s,p)=>s+p[0],0)/r.length,cz=r.reduce((s,p)=>s+p[1],0)/r.length;
 const girders:[Pt,Pt][]=[];
 for(let i=0;i<r.length;i++){const a=r[i],c=r[(i+1)%r.length],l=Math.hypot(c[0]-a[0],c[1]-a[1]);if(l<2)continue;
  const cos=Math.abs(((c[0]-a[0])*railDir[0]+(c[1]-a[1])*railDir[1])/l);
  if(cos>.95){girders.push([a,c]);sides++;}
  else {// the abutment's face: the road's level just inside the bridge, under the edge
   const inward=(p:Pt):Pt=>{const l2=Math.hypot(cx-p[0],cz-p[1])||1;return [p[0]+(cx-p[0])/l2*1.5,p[1]+(cz-p[1])/l2*1.5];};
   let g=Infinity;for(let k=0;k<=8;k++){const q:Pt=[a[0]+(c[0]-a[0])*k/8,a[1]+(c[1]-a[1])*k/8];g=Math.min(g,ground.heightAt(...inward(q)));}if(L.soffit>g+.05){wallBox(b,a,c,g-.3,L.soffit,.7,rgb(C.rubble));wallBox(b,a,c,L.soffit-.35,L.soffit,.75,rgb(C.quoin));}ends++;}
 }
 for(const [a,c] of girders){
  const l=Math.hypot(c[0]-a[0],c[1]-a[1]),t:Pt=[(c[0]-a[0])/l,(c[1]-a[1])/l];
  let n:Pt=[-t[1],t[0]];const m:Pt=[(a[0]+c[0])/2,(a[1]+c[1])/2];if((m[0]-cx)*n[0]+(m[1]-cz)*n[1]<0)n=[-n[0],-n[1]];// n: out of the bridge
  const at=(s:number,o:number):Pt=>[a[0]+t[0]*s+n[0]*o,a[1]+t[1]*s+n[1]*o];
  const GO=.35;// the girder's centre line, 0.35 m outside the mapped deck edge: the outline is the deck, the girders stand along its sides
  wallBox(b,at(-.3,GO),at(l+.3,GO),L.soffit,L.top,.22,rgb(C.red));// the web, 0.45 m thick with its flanges' outstand
  wallBox(b,at(-.4,GO),at(l+.4,GO),L.top-.12,L.top,.4,rgb(C.flange));wallBox(b,at(-.4,GO),at(l+.4,GO),L.soffit,L.soffit+.12,.4,rgb(C.flange));
  const k=Math.max(1,Math.round(l/L.panel)),w=l/k;
  for(const side of [1,-1])for(let i=0;i<=k;i++){const s=i*w,o=GO+side*.23;// stiffeners both faces
   wallBox(b,at(s-.07,o+side*.05),at(s+.07,o+side*.05),L.soffit+.12,L.top-.12,.05,rgb(C.red));
   if(i<k){panels++;const s0=s+.16,s1=s+w-.16,y0=L.soffit+.45,y1=L.top-.45,oo=o+side*.015,face:V3=[n[0]*side,0,n[1]*side];
    const quad=(u0:number,u1:number,v0:number,v1:number,col:Rgb,lift:number)=>{const p=at(u0,oo+side*lift),q=at(u1,oo+side*lift);
     b.poly([[p[0],v0,p[1]],[q[0],v0,q[1]],[q[0],v1,q[1]],[p[0],v1,p[1]]],undefined,{facing:face,color:col});};
    quad(s0,s1,y0,y1,rgb(C.cream),.004);quad(s0+.09,s1-.09,y0+.09,y1-.09,rgb(C.red),.008);}
  }
 }
 // the deck soffit between the girders (dark), at the girders' foot
 if(girders.length===2){const [[a,c],[d,e]]=girders;const pts:V3[]=[[a[0],L.soffit,a[1]],[c[0],L.soffit,c[1]],[d[0],L.soffit,d[1]],[e[0],L.soffit,e[1]]];
  const sameDir=(c[0]-a[0])*(e[0]-d[0])+(c[1]-a[1])*(e[1]-d[1])>0;const quad=sameDir?[pts[0],pts[1],pts[3],pts[2]]:pts;
  b.poly(quad,undefined,{facing:[0,-1,0],color:rgb(C.soffit)});}
 return {sides,ends,panels};
}

/** The rubble retaining walls R-pt2-d shows lining the cut: either side of each cut road, at the middle of the cut's 2 m edge blend, from the
 *  road to the ground beyond, wherever the cut is over 1 m deep; none under the deck, where the abutments stand. */
export function cutWalls(b:Batch,ground:Pick<Terrain,'heightAt'>,openRails:readonly TrackSegment[]=[],bridgeRails:readonly TrackSegment[]=[],bridgeRing:readonly Pt[]=frontageFile.bridge.ring.map(p=>[p[0],p[1]] as Pt)):number{
 const C=KINGS_PLACE_CUT;let n=0;
 for(const road of cutRoads(bridgeRing)){
  const pts:Pt[]=[];for(let i=0;i+1<road.line.length;i++){const a=road.line[i],c=road.line[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]),k=Math.max(1,Math.ceil(l/2));for(let j=0;j<k;j++)pts.push([a[0]+(c[0]-a[0])*j/k,a[1]+(c[1]-a[1])*j/k]);}
  pts.push(road.line.at(-1)!);
  for(const side of [1,-1])for(let i=0;i+1<pts.length;i++){const a=pts[i],c=pts[i+1];if(road.along(...a)>road.ramp&&road.along(...c)>road.ramp)continue;
   const l=Math.hypot(c[0]-a[0],c[1]-a[1])||1,nx=-(c[1]-a[1])/l*side,nz=(c[0]-a[0])/l*side;
   const o=road.half+C.blend*.5,p:Pt=[a[0]+nx*o,a[1]+nz*o],q:Pt=[c[0]+nx*o,c[1]+nz*o],m:Pt=[(p[0]+q[0])/2,(p[1]+q[1])/2];
   if(inRing(m[0],m[1],bridgeRing)||[p,q].some(e=>[...openRails,...bridgeRails].some(([cx,cz,dx,dz])=>segDist(e[0],e[1],cx,cz,dx,dz)<1.9)))continue;// the train envelope
   const foot=Math.min(ground.heightAt(a[0]+nx*road.half,a[1]+nz*road.half),ground.heightAt(c[0]+nx*road.half,c[1]+nz*road.half));
   const top=Math.max(ground.heightAt(m[0]+nx*(C.blend*.5+.6),m[1]+nz*(C.blend*.5+.6)),ground.heightAt(...m));
   if(top-foot<1)continue;
   wallBox(b,p,q,foot-.3,top+.5,.3,rgb(KINGS_PLACE_COLOURS.rubble),.15);n++;
  }
 }
 // the railway's own retaining walls (R-pt2-d, left): where the cut falls away beside an open rail, a rubble wall at the rail guard's edge
 const half=KINGS_PLACE_CUT.railClear+KINGS_PLACE_CUT.railBlend*.5,rx0=Math.min(...bridgeRing.map(p=>p[0]))-KINGS_PLACE_CUT.ramp,rx1=Math.max(...bridgeRing.map(p=>p[0]))+KINGS_PLACE_CUT.ramp;
 for(const [ax,az,bx,bz] of openRails){if(Math.max(ax,bx)<rx0||Math.min(ax,bx)>rx1)continue;
  const l=Math.hypot(bx-ax,bz-az);if(l<.1)continue;const k=Math.ceil(l/2),tx=(bx-ax)/l,tz=(bz-az)/l;
  for(const side of [1,-1])for(let j=0;j<k;j++){const s0=j*l/k,s1=(j+1)*l/k,nx=-tz*side,nz=tx*side;
   const p:Pt=[ax+tx*s0+nx*half,az+tz*s0+nz*half],q:Pt=[ax+tx*s1+nx*half,az+tz*s1+nz*half],m:Pt=[(p[0]+q[0])/2,(p[1]+q[1])/2];
   if(inRing(m[0],m[1],bridgeRing)||openRails.some(([cx,cz,dx,dz])=>segDist(m[0],m[1],cx,cz,dx,dz)<half-.3))continue;
   if([p,q].some(e=>[...openRails,...bridgeRails].some(([cx,cz,dx,dz])=>segDist(e[0],e[1],cx,cz,dx,dz)<1.9)))continue;// the train envelope
   const top=ground.heightAt(m[0]-nx*.9,m[1]-nz*.9),foot=Math.min(ground.heightAt(p[0]+nx*.9,p[1]+nz*.9),ground.heightAt(q[0]+nx*.9,q[1]+nz*.9));
   if(top-foot<1)continue;
   wallBox(b,p,q,foot-.3,top+.6,.35,rgb(KINGS_PLACE_COLOURS.rubble),.2);n++;
  }
 }
 return n;
}
