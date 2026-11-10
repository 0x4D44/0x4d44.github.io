// P2 frontage: the station's street front and entrance, its forecourt, the Station Hotel and the rail underbridge over King's Place
// (gfx-rubrics/perth-frontage.md). perth-scene.ts calls addPerthFrontage once, after the station and before the city, with the scene's
// build context. The station's street front faces NORTH onto the car park, not west (OSM entrance node/561381370; lead ruling 2026-11-10).
// Parts: the hotel (perth-frontage-hotel.ts), the front, forecourt and bridge (perth-frontage-street.ts), from OSM (ODbL: core/perth-data.ts
// and data/perth-frontage.json, written by tools/build-perth-frontage.ts). Every dimension has a cited source or an ASSUMED label.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyScene as PerthData} from '../../core/waverley-data.ts';
import type {Terrain} from '../../core/terrain.ts';
import {PERTH_STATION_BUILDING_ID} from '../../core/perth-data.ts';
import {Batch} from './materials.ts';
import type {PerthBuild} from './perth-scene.ts';
import {HOTEL_COLOURS,PERTH_HOTEL_ID,hotelFacadeTexture,stationHotel} from './perth-frontage-hotel.ts';
import {forecourt,stationFront} from './perth-frontage-street.ts';
import {cutWalls,kingsPlaceBridge} from './perth-frontage-bridge.ts';
import {perthTrack} from './perth-station.ts';
import type {FrontageFile} from './perth-frontage-street.ts';
import frontageFile from './data/perth-frontage.json' with {type:'json'};

/** The city blocks this element draws itself, so the city (P3) leaves them out (perth-scene.ts filters them from its draw). */
export const PERTH_FRONTAGE_OMIT_IDS:readonly string[]=[PERTH_HOTEL_ID];
/** The Tay Coast Line's two mapped bridge segments over King's Place, whose direction tells the bridge's sides from its ends. */
const KINGS_PLACE_RAILS=['way/1260630143','way/1260630144'];

/** What the element drew, for tests and the round notes. */
export interface PerthFrontageInfo {hotel:{P:number;foot:number};front:{P:number;edges:number};bridge:{sides:number;ends:number;panels:number;walls:number};triangles:number;drawCalls:number}

export function addPerthFrontage(build:PerthBuild,data:PerthData,ground:Terrain,parent:THREE.Group):PerthFrontageInfo{
 const {add,own,stats}=build,before={t:stats.triangles,d:stats.drawCalls};
 const group=new THREE.Group();group.name='perth-frontage';parent.add(group);
 const file=frontageFile as FrontageFile;
 const hotelArea=data.buildings.find(b=>b.id===PERTH_HOTEL_ID),station=data.buildings.find(b=>b.id===PERTH_STATION_BUILDING_ID);
 if(!hotelArea||!station)throw Error('Perth frontage: the hotel or the station outline is missing from perth-scene.json');
 const facade=new Batch(),detail=new Batch({colored:true}),front=new Batch({colored:true}),glass=new Batch({colored:true,uv:false});
 const flat=new Batch({colored:true,uv:false}),paint=new Batch({colored:true,uv:false}),bridgeBatch=new Batch({colored:true,uv:false});
 const hotel=stationHotel({facade,detail},hotelArea.outer,ground);
 const streets={front,glass,flat,paint};
 const frontInfo=stationFront(streets,station.outer,ground);
 forecourt(streets,file,ground,[station.outer,hotelArea.outer,...data.platforms.map(p=>p.path)]);
 const rails=data.rails.filter(r=>KINGS_PLACE_RAILS.includes(r.id));
 let dir:Pt=[0,0];for(const r of rails){const a=r.path[0],c=r.path.at(-1)!,l=Math.hypot(c[0]-a[0],c[1]-a[1])||1,sgn=dir[0]*(c[0]-a[0])+dir[1]*(c[1]-a[1])<0?-1:1;dir=[dir[0]+sgn*(c[0]-a[0])/l,dir[1]+sgn*(c[1]-a[1])/l];}
 const dl=Math.hypot(...dir)||1;
 const bridge=kingsPlaceBridge(bridgeBatch,file.bridge.ring.map(p=>[p[0],p[1]] as Pt),[dir[0]/dl,dir[1]/dl],ground);
 const cutWallCount=cutWalls(bridgeBatch,ground,perthTrack(data).ground,perthTrack(data).bridge);
 // materials: the hotel's facade texture (ashlar flat colour when no canvas, as in tests), vertex-coloured stone, slate and paint
 const tex=hotelFacadeTexture();
 const facadeMat=own(new THREE.MeshLambertMaterial({map:tex,color:tex?0xffffff:HOTEL_COLOURS.ashlar}));if(tex)facadeMat.addEventListener('dispose',()=>tex.dispose());
 const coloured=own(new THREE.MeshLambertMaterial({vertexColors:true}));
 const glassMat=own(new THREE.MeshPhongMaterial({vertexColors:true,shininess:60,specular:0x445058,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 // flat layers over the ground, lowest first, each pulled forward a step so none z-fights (as materials.ts CITY_LAYER_OFFSET)
 const flatMat=own(new THREE.MeshLambertMaterial({vertexColors:true,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
 const paintMat=own(new THREE.MeshLambertMaterial({vertexColors:true,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6}));
 add(group,facade,facadeMat,'perth-hotel-facade');add(group,detail,coloured,'perth-hotel-roofs-and-stone');
 add(group,front,coloured,'perth-station-front');add(group,glass,glassMat,'perth-frontage-glazing');
 add(group,flat,flatMat,'perth-forecourt');add(group,paint,paintMat,'perth-forecourt-markings');add(group,bridgeBatch,coloured,'perth-kings-place-bridge');
 return {hotel:{P:hotel.P,foot:hotel.foot},front:{P:frontInfo.P,edges:frontInfo.chain.length-1},bridge:{...bridge,walls:cutWallCount},triangles:stats.triangles-before.t,drawCalls:stats.drawCalls-before.d};
}
