// Reflected light transmitted through the two existing south lunette windows.
// This adds no luminaires or diffuse pools. Sample points lie on the built
// glazing (shed.ts, FRONT_THICK / 2 + 0.1), transformed by the shed frame.
import * as THREE from 'three';
import { shedToWorld, SHED_SPAN_WIDTH } from '../../core/station.ts';
import type { ShedLayout } from '../../core/station.ts';
import { lampSurfaceAt } from './lamp-wet-surface.ts';
import type { LampWetSurface } from './lamp-wet-surface.ts';
import { createLampWeather } from './streetlight-weather.ts';
import { lunetteBars } from './shed.ts';

export interface KxFrontSource {
  head: readonly [number,number,number];
  base: readonly [number,number,number];
  /** Clear pane width relative to a full mullion bay. */
  widthScale: number;
}

/** Intersect the actual bar rectangles with a horizontal glass section.
 * The ring clips some bays to slivers; the arch trims the outermost bays. */
function frontApertures(centre:number,springing:number) {
  const bars=lunetteBars(centre,springing),radius=SHED_SPAN_WIDTH/2;
  const transom=bars.find(b=>b.kind==='transom')!;
  const y=springing+(transom.c[1]-springing)*2/3;
  const half=Math.sqrt((radius-.02)**2-(y-springing)**2);
  const cuts:{lo:number;hi:number;ring:boolean}[]=[];
  for(const bar of bars) {
    const c=Math.cos(bar.rotZ),s=Math.sin(bar.rotZ);
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>[
      bar.c[0]+c*x!*bar.s[0]/2-s*z!*bar.s[1]/2,
      bar.c[1]+s*x!*bar.s[0]/2+c*z!*bar.s[1]/2,
    ]);
    const intersections:number[]=[];
    corners.forEach((a,i)=>{
      const b=corners[(i+1)%4]!;
      if(a[1]===b[1]||y<Math.min(a[1]!,b[1]!)||y>Math.max(a[1]!,b[1]!))return;
      intersections.push(a[0]!+(y-a[1]!)/(b[1]!-a[1]!)*(b[0]!-a[0]!));
    });
    if(intersections.length>=2)cuts.push({lo:Math.min(...intersections),hi:Math.max(...intersections),ring:bar.kind==='ring'});
  }
  cuts.sort((a,b)=>a.lo-b.lo);
  const gaps:[number,number][]=[];let x=centre-half;
  for(const cut of cuts) {
    if(cut.lo>x+.001)gaps.push([x,Math.min(cut.lo,centre+half)]);
    x=Math.max(x,cut.hi);
  }
  if(x<centre+half)gaps.push([x,centre+half]);
  const ring=cuts.filter(c=>c.ring),left=ring[0]!,right=ring[ring.length-1]!;
  // The two edge panes, glass inside the left ring, the centre-right bay,
  // and glass outside the right ring retain their actual unequal apertures.
  const panes=[gaps[0]!,gaps.find(g=>g[0]>=left.hi-.001)!,gaps.find(g=>g[0]>centre)!,gaps.find(g=>g[0]>=right.hi-.001)!,gaps[gaps.length-1]!];
  const mullions=bars.filter(b=>b.kind==='mullion'),bay=mullions[1]!.c[0]-mullions[0]!.c[0]-mullions[0]!.s[0];
  return panes.map(([lo,hi])=>({u:(lo+hi)/2,y,widthScale:Math.max(.25,Math.min(1.2,(hi-lo)/bay))}));
}

/** Five clear apertures per built lunette, including the clipped ring/edge
 * panes. No uniform point grid: source widths follow the same bar geometry.
 * The receiver anchor is outside the wall, on drawn paving; the reflected
 * source remains at the real recessed glass surface. */
export function kxFrontSources(layout:ShedLayout,surface:LampWetSurface):KxFrontSource[] {
  const sources:KxFrontSource[]=[];
  for(const centre of [layout.aisle+SHED_SPAN_WIDTH/2,layout.aisle+3*SHED_SPAN_WIDTH/2]) {
    for(const aperture of frontApertures(centre,layout.springing)) {
      const [x,z]=shedToWorld(layout,aperture.u,.7);
      for(const out of [1,2,3,4,6,8,12]) {
        const [bx,bz]=shedToWorld(layout,aperture.u,-out),[y,weight]=lampSurfaceAt(surface,bx,bz);
        if(weight<.95)continue;
        sources.push({head:[x,aperture.y,z],base:[bx,y+.012,bz],widthScale:aperture.widthScale});
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
  const matrix=new THREE.Matrix4(),colour=new THREE.Color().setRGB(.15,.18,.205);
  sources.forEach((s,i)=>{pools.setMatrixAt(i,matrix.makeTranslation(...s.base));pools.setColorAt(i,colour);});
  const haloGeometry=new THREE.BufferGeometry();
  for(const attr of ['position','color'])haloGeometry.setAttribute(attr,new THREE.Float32BufferAttribute([],3));
  const haloMaterial=new THREE.PointsMaterial(),halos=new THREE.Points(haloGeometry,haloMaterial);
  const weather=createLampWeather(pools,sources.flatMap(s=>[...s.head]),halos,undefined,sources.map((_,i)=>i),44,surface,true,{receiverAnchor:'base',suppressSnow:true,reflectionWidthAt:i=>sources[i]!.widthScale});
  const reflection=weather.group.getObjectByName('street-lamp-reflections');
  if(reflection)reflection.name='kx-front-glazing-reflections';
  weather.group.name='kx-front-reflections';
  pools.dispose();geometry.dispose();material.dispose();haloGeometry.dispose();haloMaterial.dispose();
  return {...weather,sources};
}
