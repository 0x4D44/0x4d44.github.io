// Existing station fittings share Perth's bounded pools, masked floor,
// continuous wet reflections and fog scatter. No new lighting rig or ambient fill.
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { pointInPolygon } from '../../core/station.ts';
import { LAMP_KIND } from '../../core/streetlights.ts';
import type { LampSpot } from '../../core/streetlights.ts';
import { createStreetLights, headOf, LAMP_LIGHT, MAST_STRIP } from './streetlights.ts';
import type { LampWetSurface } from './lamp-wet-surface.ts';
import type { StreetLights, StreetLightOptions } from './streetlights.ts';
import { surfaceUniforms } from './atmosphere.ts';
import { windowNight } from './materials.ts';
import { smoothstep } from '../../core/daylight.ts';

export interface OpenPlatformLamp extends LampSpot {
  /** Longitudinal and lateral half-extents of the diffuse beam, metres. */
  reach: number;
  width: number;
}

/** Bake the open fittings' diffuse footprints into a small world-space map.
 * The paving itself clips the light at platform edges and follows its level.
 * The existing transparent pools and wet reflections still serve the pendants. */
export function lightOpenPlatformPaving(material: THREE.MeshLambertMaterial, spots: readonly OpenPlatformLamp[]): THREE.DataTexture | undefined {
  if (!spots.length) return;
  const cell = .5;
  const bounds = (axis: 'x' | 'z', sign: number) =>
    Math.ceil(Math.max(...spots.map(s => sign * s[axis] + s.reach)) / cell) * cell + cell;
  const x0 = -bounds('x',-1), z0 = -bounds('z',-1);
  const nx = (bounds('x',1) - x0) / cell, nz = (bounds('z',1) - z0) / cell;
  const energy = new Float32Array(nx * nz * 4);
  for (const s of spots) {
    const tint = new THREE.Color(LAMP_LIGHT[s.kind].pool);
    const cos = Math.cos(s.yaw), sin = Math.sin(s.yaw);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const dx = x0 + (i + .5) * cell - s.x, dz = z0 + (j + .5) * cell - s.z;
      const r = Math.hypot((dx * cos - dz * sin) / s.reach, (dx * sin + dz * cos) / s.width);
      if (r >= 1) continue;
      const beam = (1 - smoothstep(.55,1,r)) * (1 + 1.4 * r * r) ** -1.5;
      const n = (j * nx + i) * 4;
      energy[n] += beam * tint.r;
      energy[n + 1] += beam * tint.g;
      energy[n + 2] += beam * tint.b;
    }
  }
  const bytes = Uint8Array.from(energy, value => Math.round(255 * Math.min(1,value)));
  const map = new THREE.DataTexture(bytes,nx,nz);
  map.minFilter = map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  const rect = new THREE.Vector4(x0,z0,1/(nx*cell),1/(nz*cell));
  const before = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader,renderer) => {
    before.call(material,shader,renderer);
    Object.assign(shader.uniforms, { uOpenPlatformMap: { value: map }, uOpenPlatformRect: { value: rect },
      uOpenPlatformNight: windowNight, uOpenPlatformWet: surfaceUniforms.wet, uOpenPlatformFog: surfaceUniforms.fog });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uOpenPlatformMap;
uniform vec4 uOpenPlatformRect;
uniform float uOpenPlatformNight, uOpenPlatformWet, uOpenPlatformFog;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
// open-platform-paving-begin
if (uOpenPlatformNight > 0.003) {
  vec2 platformXZ = (cameraPosition - vViewPosition * mat3(viewMatrix)).xz;
  vec2 platformUV = (platformXZ - uOpenPlatformRect.xy) * uOpenPlatformRect.zw;
  vec3 openPlatformLight = texture2D(uOpenPlatformMap, platformUV).rgb;
  float openPlatformLevel = uOpenPlatformNight * (1.0 - 0.38 * uOpenPlatformWet) * (1.0 - 0.55 * uOpenPlatformFog);
  totalEmissiveRadiance += 0.24 * openPlatformLevel * openPlatformLight * mix(vec3(0.35),diffuseColor.rgb,0.65);
}
// open-platform-paving-end`);
  };
  material.customProgramCacheKey = () => key + '+open-platform-paving';
  return map;
}


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
export function createPlatformLamps(heads: readonly number[], rings: readonly (readonly Pt[])[], floorY: number, station:'kx'|'wv'='kx', fogAir=false, open: readonly OpenPlatformLamp[] = []): StreetLights {
  const spots: LampSpot[] = [];
  for (let i=0;i<heads.length;i+=3) spots.push({x:heads[i]!,y:floorY,z:heads[i+2]!,height:heads[i+1]!-floorY,yaw:0,kind:LAMP_KIND.cool,slope:[0,0]});
  const radii = spots.map((s,i) => {
    let spacing = Infinity;
    spots.forEach((q,j) => { const d=Math.hypot(s.x-q.x,s.z-q.z); if(i!==j && d>3) spacing=Math.min(spacing,d); });
    return station==='kx'?Math.min(10,.6*spacing):Math.min(8,.58*spacing);
  });
  const floor = floorMask(rings);
  const layer = createStreetLights([...spots,...open], {posts:false,headAt:s=>[s.x,s.y+s.height,s.z],fog:true,
    analyticPool:true,poolCeiling:.20,poolAt:(_s,i)=>i<spots.length,poolFloor:floor,poolLiftAt:()=>.004,poolRadiusAt:(_s,i)=>radii[i]!,
    poolWeather:true,weatherEffects:true,enhancedFog:true,softFog:fogAir,boundedFog:fogAir?station:undefined,lightFog:station==='kx',suppressSnow:true,fogHaloSpread:station==='wv'?9:undefined,haloSize:3.2,coreSize:1.5,reflectionReach:8,poolFocus:station==='kx'?1.4:undefined});
  layer.group.name='station-platform-lamps';
  return {...layer,dispose(){layer.dispose();floor?.map.dispose();layer.group.removeFromParent();}};
}

/** Nearby urban heads only: no reflective quads over the wider countryside.
 * Existing inferred street positions and sodium/LED kinds are retained. */
export function urbanLampOptions(surface?:LampWetSurface): StreetLightOptions {
  return {fog:true,enhancedFog:true,mastHaze:true,suppressSnow:true,coreTint:true,analyticPool:true,poolCeiling:.20,poolFocus:1.4,poolSurface:surface,poolWeather:true,weatherEffects:true,coreSize:1.5,haloSize:2.6,haloScaleAt:s=>s.mast?2:1,reflectionReach:96,reflectionSurface:surface,reflectionBroken:true,
    headAt:s=>s.mast?[s.x,s.y+(MAST_STRIP[0]+MAST_STRIP[1])/2,s.z]:headOf(s),
    poolRadiusAt:()=>8,
    poolSizeAt:s=>s.mast?[12,2.8]:undefined,
    poolLineAt:s=>!!s.mast,
    reflectionAt:s=>Math.hypot(s.x,s.z)<650};
}
