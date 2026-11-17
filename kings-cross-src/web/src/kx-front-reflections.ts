// Reflected light transmitted through the two existing south lunette windows.
// This adds no luminaires or diffuse pools. Sample points lie on the built
// glazing (shed.ts, FRONT_THICK / 2 + 0.1), transformed by the shed frame.
import * as THREE from 'three';
import { shedToWorld, SHED_SPAN_WIDTH } from '../../core/station.ts';
import type { ShedLayout } from '../../core/station.ts';
import { lampSurfaceAt } from './lamp-wet-surface.ts';
import type { LampWetSurface } from './lamp-wet-surface.ts';
import { createLampWeather } from './streetlight-weather.ts';

export interface KxFrontSource {
  head: readonly [number,number,number];
  base: readonly [number,number,number];
}

/** Five restrained samples across each lit window, not ten invented lamps.
 * A receiver anchor is sought immediately outside the wall on drawn paving.
 * The reflected source itself remains at the real recessed glass surface. */
export function kxFrontSources(layout:ShedLayout,surface:LampWetSurface):KxFrontSource[] {
  const sources:KxFrontSource[]=[];
  for(const centre of [layout.aisle+SHED_SPAN_WIDTH/2,layout.aisle+3*SHED_SPAN_WIDTH/2]) {
    for(const offset of [-10,-5,0,5,10]) {
      const [x,z]=shedToWorld(layout,centre+offset,.7);
      for(const out of [1,2,3,4,6,8,12]) {
        const [bx,bz]=shedToWorld(layout,centre+offset,-out),[y,weight]=lampSurfaceAt(surface,bx,bz);
        if(weight<.95)continue;
        sources.push({head:[x,layout.springing+4,z],base:[bx,y+.012,bz]});
        break;
      }
    }
  }
  return sources;
}

/** Same clipped wet optics as the urban lamps; the temporary inputs only
 * provide per-instance colour/anchors. Neither is attached to the scene. */
export function createKxFrontReflections(layout:ShedLayout,surface:LampWetSurface) {
  const sources=kxFrontSources(layout,surface),geometry=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  geometry.setAttribute('poolFloorWeight',new THREE.InstancedBufferAttribute(new Float32Array(sources.length),1));
  const material=new THREE.MeshBasicMaterial(),pools=new THREE.InstancedMesh(geometry,material,sources.length);
  const matrix=new THREE.Matrix4(),colour=new THREE.Color().setRGB(.25,.18,.105);
  sources.forEach((s,i)=>{pools.setMatrixAt(i,matrix.makeTranslation(...s.base));pools.setColorAt(i,colour);});
  const haloGeometry=new THREE.BufferGeometry();
  for(const attr of ['position','color'])haloGeometry.setAttribute(attr,new THREE.Float32BufferAttribute([],3));
  const haloMaterial=new THREE.PointsMaterial(),halos=new THREE.Points(haloGeometry,haloMaterial);
  const weather=createLampWeather(pools,sources.flatMap(s=>[...s.head]),halos,undefined,sources.map((_,i)=>i),44,surface,true,{receiverAnchor:'base'});
  const reflection=weather.group.getObjectByName('street-lamp-reflections');
  if(reflection)reflection.name='kx-front-glazing-reflections';
  weather.group.name='kx-front-reflections';
  pools.dispose();geometry.dispose();material.dispose();haloGeometry.dispose();haloMaterial.dispose();
  return {...weather,sources};
}
