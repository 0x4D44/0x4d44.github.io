// Existing station fittings share Perth's bounded pools, masked floor,
// continuous wet reflections and fog scatter. No new lighting rig or ambient fill.
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { pointInPolygon } from '../../core/station.ts';
import { LAMP_KIND } from '../../core/streetlights.ts';
import type { LampSpot } from '../../core/streetlights.ts';
import { createStreetLights, headOf, MAST_STRIP } from './streetlights.ts';
import type { LampWetSurface } from './lamp-wet-surface.ts';
import type { StreetLights, StreetLightOptions } from './streetlights.ts';

/** Rasterised once at half-metre resolution; light stops at platform edges. */
function floorMask(rings: readonly (readonly Pt[])[]): {map: THREE.DataTexture; rect: THREE.Vector4} | undefined {
  const points = rings.flat();
  if (!points.length) return;
  const cell = .5;
  const x0 = Math.floor(Math.min(...points.map(p=>p[0])))-1, z0 = Math.floor(Math.min(...points.map(p=>p[1])))-1;
  const nx = Math.ceil((Math.max(...points.map(p=>p[0]))-x0+1)/cell), nz = Math.ceil((Math.max(...points.map(p=>p[1]))-z0+1)/cell);
  const bytes = new Uint8Array(nx*nz);
  for (let z=0;z<nz;z++) for (let x=0;x<nx;x++) {
    if (rings.some(r=>pointInPolygon([x0+(x+.5)*cell,z0+(z+.5)*cell],r as Pt[]))) bytes[z*nx+x]=255;
  }
  const map = new THREE.DataTexture(bytes,nx,nz,THREE.RedFormat);
  map.minFilter = map.magFilter = THREE.LinearFilter; map.needsUpdate = true;
  return {map,rect:new THREE.Vector4(x0,z0,1/(nx*cell),1/(nz*cell))};
}

/** Heads are the same positions used by the visible fittings/pendants, metres. */
export function createPlatformLamps(heads: readonly number[], rings: readonly (readonly Pt[])[], floorY: number, station:'kx'|'wv'='kx'): StreetLights {
  const spots: LampSpot[] = [];
  for (let i=0;i<heads.length;i+=3) spots.push({x:heads[i]!,y:floorY,z:heads[i+2]!,height:heads[i+1]!-floorY,yaw:0,kind:LAMP_KIND.cool,slope:[0,0]});
  const radii = spots.map((s,i) => {
    let spacing = Infinity;
    spots.forEach((q,j) => { const d=Math.hypot(s.x-q.x,s.z-q.z); if(i!==j && d>3) spacing=Math.min(spacing,d); });
    return station==='kx'?Math.min(10,.6*spacing):Math.min(8,.58*spacing);
  });
  const floor = floorMask(rings);
  const layer = createStreetLights(spots, {posts:false,headAt:s=>[s.x,s.y+s.height,s.z],fog:true,
    analyticPool:true,poolCeiling:.20,poolFloor:floor,poolLiftAt:()=>.004,poolRadiusAt:(_s,i)=>radii[i]!,
    poolWeather:true,weatherEffects:true,enhancedFog:true,haloSize:3.2,coreSize:1.5,reflectionReach:8,poolFocus:station==='kx'?1.4:undefined});
  layer.group.name='station-platform-lamps';
  return {...layer,dispose(){layer.dispose();floor?.map.dispose();layer.group.removeFromParent();}};
}

/** Nearby urban heads only: no reflective quads over the wider countryside.
 * Existing inferred street positions and sodium/LED kinds are retained. */
export function urbanLampOptions(surface?:LampWetSurface): StreetLightOptions {
  return {fog:true,enhancedFog:true,coreTint:true,analyticPool:true,poolCeiling:.20,poolFocus:1.4,poolSurface:surface,poolWeather:true,weatherEffects:true,coreSize:1.5,haloSize:2.6,haloScaleAt:s=>s.mast?2:1,reflectionReach:96,reflectionSurface:surface,reflectionBroken:true,
    headAt:s=>s.mast?[s.x,s.y+(MAST_STRIP[0]+MAST_STRIP[1])/2,s.z]:headOf(s),
    poolRadiusAt:()=>8,
    poolSizeAt:s=>s.mast?[12,2.8]:undefined,
    poolLineAt:s=>!!s.mast,
    reflectionAt:s=>Math.hypot(s.x,s.z)<650};
}
