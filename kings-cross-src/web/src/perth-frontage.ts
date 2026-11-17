// P2 frontage: the station's street front and entrance, its forecourt, the Station Hotel and the rail underbridge over King's Place
// (gfx-rubrics/perth-frontage.md). perth-scene.ts calls addPerthFrontage once, after the station and before the city, with the scene's
// build context. The station's street front faces NORTH onto the car park, not west (OSM entrance node/561381370; lead ruling 2026-11-10).
// Parts: the hotel (perth-frontage-hotel.ts), the front, forecourt and bridge (perth-frontage-street.ts), St Leonard's Bridge (perth-st-leonards-bridge.ts), from OSM (ODbL: core/perth-data.ts
// and data/perth-frontage.json, written by tools/build-perth-frontage.ts). Every dimension has a cited source or an ASSUMED label.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyScene as PerthData} from '../../core/waverley-data.ts';
import type {Terrain} from '../../core/terrain.ts';
import {PERTH_STATION_BUILDING_ID} from '../../core/perth-data.ts';
import {Batch,floodLit,litWalls} from './materials.ts';
import type {PerthBuild} from './perth-scene.ts';
import {HOTEL_COLOURS,PERTH_HOTEL_ID,hotelFacadeTexture,stationHotel} from './perth-frontage-hotel.ts';
import {forecourt,hotelShrubs,stationFront,FRONTAGE_WINDOW,ROAD_WIDTHS} from './perth-frontage-street.ts';
import {snowLanduseMask} from './snow.ts';
import {cutRoadMask,cutRoadSurfaces,cutWalls,kingsPlaceBridge} from './perth-frontage-bridge.ts';
import {perthTrack} from './perth-station.ts';
import {ST_LEONARDS,ST_LEONARDS_COLOURS,stLeonardsBridge} from './perth-st-leonards-bridge.ts';
import type {StLeonardsInfo} from './perth-st-leonards-bridge.ts';
import {coursedTexture,rubbleTexture,settsTexture,stLeonardsPaintTexture} from './perth-frontage-textures.ts';
import type {FrontageFile} from './perth-frontage-street.ts';
import frontageFile from './data/perth-frontage.json' with {type:'json'};

/** The city blocks this element draws itself, so the city (P3) leaves them out (perth-scene.ts filters them from its draw). */
export const PERTH_FRONTAGE_OMIT_IDS:readonly string[]=[PERTH_HOTEL_ID];
/** The Tay Coast Line's two mapped bridge segments over King's Place, whose direction tells the bridge's sides from its ends. */
const KINGS_PLACE_RAILS=['way/1260630143','way/1260630144'];

/** What the element drew, for tests and the round notes. */
export interface PerthFrontageInfo {hotel:{P:number;foot:number};front:{P:number;edges:number};bridge:{sides:number;ends:number;panels:number;piers:number;walls:number;roadSegments:number};stLeonards:StLeonardsInfo;triangles:number;drawCalls:number}

export function addPerthFrontage(build:PerthBuild,data:PerthData,ground:Terrain,parent:THREE.Group):PerthFrontageInfo{
 const {add,own,stats}=build,before={t:stats.triangles,d:stats.drawCalls};
 const group=new THREE.Group();group.name='perth-frontage';parent.add(group);
 const file=frontageFile as FrontageFile;
 const hotelArea=data.buildings.find(b=>b.id===PERTH_HOTEL_ID),station=data.buildings.find(b=>b.id===PERTH_STATION_BUILDING_ID);
 if(!hotelArea||!station)throw Error('Perth frontage: the hotel or the station outline is missing from perth-scene.json');
 const facade=new Batch(),detail=new Batch({colored:true}),front=new Batch({colored:true}),glass=new Batch({colored:true,uv:false});
 const flat=new Batch({colored:true,uv:false}),paint=new Batch({colored:true,uv:false}),bridgeBatch=new Batch({colored:true,uv:false});
 // textured: the block paving, the station's coursed street walls, the cut's coursed rubble (perth-frontage-textures.ts)
 const setts=new Batch({colored:true}),coursed=new Batch({colored:true}),rubble=new Batch({colored:true});
 const hotel=stationHotel({facade,detail},hotelArea.outer,ground);
 const streets={front,glass,flat,paint,setts,coursed};
 const frontInfo=stationFront(streets,station.outer,ground);
 forecourt(streets,file,ground,[station.outer,hotelArea.outer,...data.platforms.map(p=>p.path)],cutRoadMask());
 const park=file.parking.find(p=>p.id==='way/24505868');if(park)hotelShrubs(front,hotelArea.outer,park.ring.map(p=>[p[0],p[1]] as Pt),ground);
 const rails=data.rails.filter(r=>KINGS_PLACE_RAILS.includes(r.id));
 let dir:Pt=[0,0];for(const r of rails){const a=r.path[0],c=r.path.at(-1)!,l=Math.hypot(c[0]-a[0],c[1]-a[1])||1,sgn=dir[0]*(c[0]-a[0])+dir[1]*(c[1]-a[1])<0?-1:1;dir=[dir[0]+sgn*(c[0]-a[0])/l,dir[1]+sgn*(c[1]-a[1])/l];}
 const dl=Math.hypot(...dir)||1;
 const ring=file.bridge.ring.map(p=>[p[0],p[1]] as Pt),track=perthTrack(data);
 const bridge=kingsPlaceBridge(bridgeBatch,ring,[dir[0]/dl,dir[1]/dl],ground,rubble,[...track.ground,...track.bridge]);
 const cutWallCount=cutWalls(rubble,ground,track.ground,track.bridge,ring,bridgeBatch);
 const cutRoad=cutRoadSurfaces(flat,paint,bridgeBatch,ground,ring,track.ground);
 // St Leonard's Bridge over the south throat (perth-st-leonards-bridge.ts): its own mesh, one draw, the King's Place bridge's material,
 // and its soffits another (round 7: lamp-lit after dark). Round 8: its own irregular ashlar bond, using the same texture mechanism.
 const stLeonardsBatch=new Batch({colored:true,uv:false}),stLeonardsSoffits=new Batch({colored:true,uv:false}),stLeonardsAshlar=new Batch({colored:true}),stLeonardsPaint=new Batch({colored:true});
 const stLeonards=stLeonardsBridge(stLeonardsBatch,ground,stLeonardsAshlar,stLeonardsSoffits,stLeonardsPaint);
 // materials: the hotel's facade texture (ashlar flat colour when no canvas, as in tests), vertex-coloured stone, slate and paint
 const tex=hotelFacadeTexture();
 const facadeMat=own(new THREE.MeshLambertMaterial({map:tex,color:tex?0xffffff:HOTEL_COLOURS.ashlar}));if(tex)facadeMat.addEventListener('dispose',()=>tex.dispose());
 // Four storeys in the existing bay texture, with a few warm rooms. The blue
 // glass mask keeps the stone, white sashes and red mullions dark between them.
 litWalls(facadeMat,[4.5,18],{cell:[4.5,3.65],shift:[0,-3.25/3.65],rows:[0,4],rect:[.28,.72,.08,.66],mode:[.28,0,.12,.06]});
 const windows=facadeMat.onBeforeCompile,windowKey=facadeMat.customProgramCacheKey();
 facadeMat.onBeforeCompile=(shader,renderer)=>{windows.call(facadeMat,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',
  'totalEmissiveRadiance *= smoothstep(0.005, 0.035, diffuseColor.b - diffuseColor.r);\n#include <lights_fragment_begin>');};
 facadeMat.customProgramCacheKey=()=>`${windowKey}+perth-hotel-glass`;
 const coloured=own(new THREE.MeshLambertMaterial({vertexColors:true}));
 // glass: dark, with a small tight highlight (round 2's broad specular lobe read as pale grey panes)
 const glassMat=own(new THREE.MeshPhongMaterial({vertexColors:true,shininess:90,specular:0x1c2024,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 // flat layers over the ground, lowest first, each pulled forward a step so none z-fights (as materials.ts CITY_LAYER_OFFSET)
 const flatMat=own(new THREE.MeshLambertMaterial({vertexColors:true,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
 const paintMat=own(new THREE.MeshLambertMaterial({vertexColors:true,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6}));
 const foot=(r:FrontageFile['roads'][number])=>['footway','pedestrian','path','cycleway','steps'].includes(r.highway);
 const snowMask=snowLanduseMask({extent:FRONTAGE_WINDOW,
  roads:file.roads.filter(r=>!foot(r)).map(r=>({line:r.path as Pt[],width:ROAD_WIDTHS[r.service==='parking_aisle'?'parking_aisle':r.highway]??4})),
  paths:file.roads.filter(foot).map(r=>({line:r.path as Pt[],width:ROAD_WIDTHS[r.highway]??2}))});
 if(snowMask){flatMat.userData.snowMask=snowMask;paintMat.userData.snowMask=snowMask;flatMat.addEventListener('dispose',()=>snowMask.texture.dispose());}
 add(group,facade,facadeMat,'perth-hotel-facade');add(group,detail,coloured,'perth-hotel-roofs-and-stone');
 add(group,front,coloured,'perth-station-front');add(group,glass,glassMat,'perth-frontage-glazing');
 add(group,flat,flatMat,'perth-forecourt');add(group,paint,paintMat,'perth-forecourt-markings');add(group,bridgeBatch,coloured,'perth-kings-place-bridge');
 add(group,stLeonardsBatch,coloured,'perth-st-leonards-bridge');
 // its soffits: their own draw, lit after dark by the station's and the street's lamps (lighting.ts FLOOD, round 7)
 const SL=ST_LEONARDS.soffitLamp;add(group,stLeonardsSoffits,own(floodLit(new THREE.MeshLambertMaterial({vertexColors:true}),SL.strength,SL.reach,SL.floor)),'perth-st-leonards-soffit');
 const textured=(t:THREE.Texture|null,offset=0)=>{const m=own(new THREE.MeshLambertMaterial({map:t,vertexColors:true,...offset?{polygonOffset:true,polygonOffsetFactor:offset,polygonOffsetUnits:offset}:{}}));if(t)m.addEventListener('dispose',()=>t.dispose());return m;};
 add(group,stLeonardsAshlar,textured(coursedTexture('bridge')),'perth-st-leonards-masonry');
 add(group,stLeonardsPaint,textured(stLeonardsPaintTexture(stLeonards.girderPanels,ST_LEONARDS_COLOURS.steel,ST_LEONARDS.girder.flange/(ST_LEONARDS.parapet+ST_LEONARDS.fascia))),'perth-st-leonards-paint');
 const settMaterial=textured(settsTexture(),-3);if(snowMask)settMaterial.userData.snowMask=snowMask;
 add(group,setts,settMaterial,'perth-forecourt-setts');add(group,coursed,textured(coursedTexture()),'perth-station-street-walls');
 add(group,rubble,textured(rubbleTexture()),'perth-kings-place-walls');
 return {hotel:{P:hotel.P,foot:hotel.foot},front:{P:frontInfo.P,edges:frontInfo.chain.length-1},bridge:{...bridge,walls:cutWallCount,roadSegments:cutRoad.segments},stLeonards,triangles:stats.triangles-before.t,drawCalls:stats.drawCalls-before.d};
}
