// W2 frontage: the Balmoral Hotel and its clock tower (waverley-frontage-balmoral.ts), North Bridge and Waverley Bridge (waverley-frontage-
// bridges.ts), from data/waverley-frontage.json (OSM outlines, ODbL; tools/build-waverley-landmarks.ts writes the bridges and the tower;
// the hotel body, the pier seat and the Waverley Bridge column points were added from waverley-scene.json and the scene's railway).
// No bridge clearance is inferred from OSM layer: deck ends sample the unwarped Scottish context DTM, never the railway flattening.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch,material} from './materials.ts';
import {shell} from './waverley-mesh.ts';
import {balmoralTime} from './clocks.ts';
import type {ClockDial} from './clocks.ts';
import {BALMORAL_COLOURS,BALMORAL_LEVELS,balmoralBody,balmoralFacadeTexture,balmoralTower,balmoralTowerTexture,towerFrame} from './waverley-frontage-balmoral.ts';
import {northBridge,waverleyBridge} from './waverley-frontage-bridges.ts';
import {princesMall} from './waverley-frontage-mall.ts';
import data from './data/waverley-frontage.json' with {type:'json'};
export const WAVERLEY_FRONTAGE_HEIGHTS={balmoral:58,clockDiameter:3.2} as const;
export const WAVERLEY_FRONTAGE_SOURCES={
 balmoral:{url:'https://portal.historicenvironment.scot/designation/LB30315',height:58,basis:'HES Description: 58 metre high entrance tower; 5 storeys, mezzanine and attic; Dutch gabled bays carrying large clock faces; polygonal turrets and ogee crown spires'},
 clock:{url:'https://www.smithofderby.com/projects/balmoral-hotel/',diameter:3.2,basis:'clock maker project sheet Size: 3.2m'},
 northBridge:{url:'https://portal.historicenvironment.scot/designation/LB30035',spans:3,ribsPerSpan:6,span:53,basis:'HES: 3 wide spans, each constructed of 6 arched iron girders, on masonry piers; 175 ft (53 m) spans (Wikipedia, Canmore summary)'},
 waverleyBridge:{url:'https://portal.historicenvironment.scot/designation/LB30270',spans:7,basis:'HES: Waverley Bridge has seven plate girder spans'},
 assumptions:'Deck structural depth 1m and parapets 1.1m; deck elevations interpolated from the unwarped Scottish context DTM at the mapped ends, not surveyed clearances. Balmoral stage heights, cornice 25.5m, attic, gables, dormers, stacks and corner domes scaled from R-wv2-b / R-wv2-a2 (waverley-frontage-balmoral.ts); arch springing 6.4m, rib section, pier widths and paint colours (waverley-frontage-bridges.ts).',
} as const;
/** The city buildings this element draws itself: the Balmoral tower, the hotel body and Princes Mall. */
export const WAVERLEY_FRONTAGE_OMIT_IDS=[data.balmoral.id,data.balmoralBody.id,data.princesMall.id];
const ringOf=(p:number[][]):Pt[]=>p.map(q=>[q[0],q[1]]);
export interface WaverleyFrontage {group:THREE.Group;stats:{drawCalls:number;triangles:number};omitBuildingIds:string[];dispose():void}
export function buildWaverleyFrontage(ground:Pick<Terrain,'heightAt'|'rangeUnder'>,contextTerrain:Pick<Terrain,'heightAt'>=ground):WaverleyFrontage{
 const group=new THREE.Group();group.name='waverley-frontage';const stats={drawCalls:0,triangles:0};
 const ownedGeometries:THREE.BufferGeometry[]=[],ownedMaterials:THREE.Material[]=[],ownedTextures:THREE.Texture[]=[];
 const add=(b:Batch,m:THREE.Material,name:string)=>{if(!b.triangles)return;const g=b.build(),mesh=new THREE.Mesh(g,m);mesh.name=name;group.add(mesh);ownedGeometries.push(g);stats.drawCalls++;stats.triangles+=b.triangles;};
 const own=<T extends THREE.Material>(m:T):T=>{ownedMaterials.push(m);return m;};
 const decks=new Batch(),paint=new Batch({colored:true}),spire=new Batch({colored:true}),facade=new Batch(),tower=new Batch(),dial=new Batch();
 // decks: the mapped outlines, ends at the unwarped DTM, linear between (unchanged rule)
 const deckOf=(ring:Pt[])=>{const byZ=[...ring].sort((a,b)=>a[1]-b[1]),a=byZ[0],b=byZ.at(-1)!,y0=contextTerrain.heightAt(...a),y1=contextTerrain.heightAt(...b);
  return (p:Pt)=>y0+(y1-y0)*Math.max(0,Math.min(1,(p[1]-a[1])/(b[1]-a[1])));};
 const [nb,wb]=data.bridges.map(b=>ringOf(b.ring));
 for(const r of [nb,wb]){const deck=deckOf(r);shell(decks,r,p=>deck(p)-1,deck);}
 const seat=ringOf(data.northBridgePierSeat.ring);
 const north=northBridge(paint,{ring:nb,deck:deckOf(nb),ground:r=>ground.rangeUnder(r,2).min,seatTop:ground.rangeUnder(seat,4).min+data.northBridgePierSeat.height});
 const waverley=waverleyBridge(paint,{ring:wb,deck:deckOf(wb),columns:data.waverleyBridgeColumns});
 const mallRing=ringOf(data.princesMall.ring),mallNorth=[...mallRing].sort((a,b)=>a[1]-b[1])[0];
 const mall=princesMall(paint,{ring:mallRing,holes:data.princesMall.holes.map(ringOf),roof:contextTerrain.heightAt(...mallNorth),foot:ground.rangeUnder(mallRing,4).min-.15});
 // the Balmoral: P is the street at the tower's north corner, the body stands on the lowest ground under its outline (as the city's blocks do)
 const tr=ringOf(data.balmoral.ring),body=ringOf(data.balmoralBody.ring),northCorner=[...tr].sort((a,b)=>a[1]-b[1])[0],P=ground.heightAt(...northCorner);
 const input={towerRing:tr,bodyRing:body,P,foot:ground.rangeUnder(body,4).min-.15};
 const batches={facade,tower,paint,spire,dial};
 const frame=balmoralTower(batches,input,data.balmoral.clockDiameter/2);
 balmoralBody(batches,input,frame);
 const dials:ClockDial[]=[];
 const {centre,along,back,half}=towerFrame(tr);
 for(const [n,dist] of [[[-back[0],0,-back[2]],half[1]],[back,half[1]],[[-along[0],0,-along[2]],half[0]],[along,half[0]]] as [[number,number,number],number][]){
  dials.push({centre:[centre[0]+n[0]*(dist+.06),P+BALMORAL_LEVELS.tower.dial,centre[1]+n[2]*(dist+.06)],normal:n,up:[0,1,0],radius:data.balmoral.clockDiameter/2,show:balmoralTime}); // the hands are clocks.ts's, three minutes fast
 }
 group.userData.clockDials=dials;
 const deckMat=own((material('asphalt') as THREE.MeshLambertMaterial).clone());
 const paintMat=own(new THREE.MeshLambertMaterial({vertexColors:true}));
 const tex=(t:THREE.CanvasTexture|null)=>{if(t)ownedTextures.push(t);return t;};
 const facadeMap=tex(balmoralFacadeTexture()),towerMap=tex(balmoralTowerTexture(2*half[0]));
 const facadeMat=own(new THREE.MeshLambertMaterial({map:facadeMap,color:facadeMap?0xffffff:BALMORAL_COLOURS.stone}));
 const towerMat=own(new THREE.MeshLambertMaterial({map:towerMap,color:towerMap?0xffffff:BALMORAL_COLOURS.stone}));
 const dialMat=own((material('concrete') as THREE.MeshLambertMaterial).clone());dialMat.color.setHex(0xeee8d1);
 add(decks,deckMat,'waverley-bridge-decks');add(paint,paintMat,'waverley-frontage-structure');add(facade,facadeMat,'waverley-balmoral-facade');add(tower,towerMat,'waverley-balmoral-tower');
 add(spire,paintMat,'waverley-balmoral-spire-and-hands');add(dial,dialMat,'waverley-balmoral-clock-dials');
 group.userData.frontage={northBridge:north,waverleyBridge:waverley,mall,P};
 let disposed=false;return {group,stats,omitBuildingIds:[...WAVERLEY_FRONTAGE_OMIT_IDS],dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const g of ownedGeometries)g.dispose();for(const m of ownedMaterials)m.dispose();for(const t of ownedTextures)t.dispose();group.clear();}};
}
