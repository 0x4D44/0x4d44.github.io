// Reflected light from the south lunette windows and amber-lit facade.
// This adds no luminaires or diffuse pools. Sample points lie on the built
// glazing (shed.ts, FRONT_THICK / 2 + 0.1), transformed by the shed frame.
import * as THREE from 'three';
import { shedToWorld, SHED_SPAN_WIDTH } from '../../core/station.ts';
import type { ShedLayout } from '../../core/station.ts';
import { lampSurfaceAt } from './lamp-wet-surface.ts';
import type { LampWetSurface } from './lamp-wet-surface.ts';
import { createLampWeather } from './streetlight-weather.ts';
import { lunetteBars } from './shed.ts';
import { PANE_UV, windowNight, WIN_NIGHT_GLSL } from './materials.ts';

export interface KxFrontSource {
  head: readonly [number,number,number];
  base: readonly [number,number,number];
  /** Source width relative to a full mullion bay. */
  widthScale: number;
  /** The same stable room identifier used by litPane. */
  paneId?: number;
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
  return reflectedSources(kxFrontSources(layout,surface),surface,'kx-front-glazing-reflections',[.15,.18,.205]);
}

/** The three built piers and four stone arch shoulders receive the facade's
 * amber uplight. Mirror those surfaces, with no invented points in the glass. */
export function kxFacadeSources(layout:ShedLayout,surface:LampWetSurface):KxFrontSource[] {
  const sites = [.5,layout.width/2,layout.width-.5].map(u=>({u,y:layout.springing*.6,widthScale:.9}));
  const r=SHED_SPAN_WIDTH/2+.5;
  for(const centre of [layout.aisle+SHED_SPAN_WIDTH/2,layout.aisle+3*SHED_SPAN_WIDTH/2]) {
    for(const side of [-1,1])sites.push({u:centre+side*r*Math.cos(Math.PI/6),y:layout.springing+r*.5,widthScale:.65});
  }
  return sites.flatMap(s=>{
    const [x,z]=shedToWorld(layout,s.u,-.05);
    for(const out of [1,2,3,4,6,8,12]) {
      const [bx,bz]=shedToWorld(layout,s.u,-out),[y,weight]=lampSurfaceAt(surface,bx,bz);
      if(weight>.95)return [{head:[x,s.y,z] as const,base:[bx,y+.012,bz] as const,widthScale:s.widthScale}];
    }
    return [];
  });
}

export function createKxFacadeReflections(layout:ShedLayout,surface:LampWetSurface) {
  return reflectedSources(kxFacadeSources(layout,surface),surface,'kx-front-amber-reflections',[.14,.078,.028]);
}

/** Recover each real pane's affine UV frame, rather than inventing a regular
 * window grid. Glass uses negative V; railings and balcony bands do not. Only
 * low windows with drawn paving outside their wall can reflect onto a road. */
export function kxWindowSources(scene:THREE.Scene,surface:LampWetSurface):KxFrontSource[] {
  const mesh=scene.getObjectByName('landmarks-pane') as THREE.Mesh<THREE.BufferGeometry>|undefined;
  if(!mesh)return [];
  mesh.updateWorldMatrix(true,false);
  const g=mesh.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),normal=g.getAttribute('normal');
  if(!uv||!normal)return [];
  const sources:KxFrontSource[]=[],seen=new Map<number,THREE.Vector3[]>(),index=g.index;
  for(let t=0;t<(index?.count??p.count);t+=3) {
    const ids=[0,1,2].map(k=>index?index.getX(t+k):t+k),a=ids[0]!,b=ids[1]!,c=ids[2]!;
    const id=Math.floor(uv.getX(a));
    if(ids.some(i=>uv.getY(i)>=-.5||Math.floor(uv.getX(i))!==id))continue;
    const n=new THREE.Vector3().fromBufferAttribute(normal,a).transformDirection(mesh.matrixWorld);
    if(Math.abs(n.y)>.1)continue;
    const pa=new THREE.Vector3().fromBufferAttribute(p,a).applyMatrix4(mesh.matrixWorld);
    const ab=new THREE.Vector3().fromBufferAttribute(p,b).applyMatrix4(mesh.matrixWorld).sub(pa),ac=new THREE.Vector3().fromBufferAttribute(p,c).applyMatrix4(mesh.matrixWorld).sub(pa);
    const du1=uv.getX(b)-uv.getX(a),du2=uv.getX(c)-uv.getX(a),dv1=uv.getY(b)-uv.getY(a),dv2=uv.getY(c)-uv.getY(a),det=du1*dv2-du2*dv1;
    if(Math.abs(det)<1e-7)continue;
    const u=ab.clone().multiplyScalar(dv2).addScaledVector(ac,-dv1).divideScalar(det),v=ac.clone().multiplyScalar(du1).addScaledVector(ab,-du2).divideScalar(det);
    const head=pa.clone().addScaledVector(u,id+.5-uv.getX(a)).addScaledVector(v,-1.5-uv.getY(a));
    // UVs carry large room numbers in Float32. Reconstructing from different
    // fan triangles can move the same centre by a few millimetres.
    const centres=seen.get(id)??[];
    if(centres.some(c=>c.distanceToSquared(head)<.05*.05))continue;
    centres.push(head);seen.set(id,centres);
    for(const out of [1,2,3,4,6,8,12,16,20,24,32]) {
      const x=head.x+n.x*out,z=head.z+n.z*out,[y,weight]=lampSurfaceAt(surface,x,z),height=head.y-y;
      if(weight<.95||height<1||height>26)continue;
      sources.push({head:head.toArray() as [number,number,number],base:[x,y+.012,z],widthScale:Math.max(.4,Math.min(1.2,u.length()*.8/1.5)),paneId:id});
      break;
    }
  }
  return sources;
}

export function createKxWindowReflections(scene:THREE.Scene,surface:LampWetSurface) {
  return reflectedSources(kxWindowSources(scene,surface),surface,'kx-midland-window-reflections',[.16,.16,.16],true);
}

function reflectedSources(sources:KxFrontSource[],surface:LampWetSurface,name:string,tint:readonly [number,number,number],windows=false) {
  const geometry=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  geometry.setAttribute('poolFloorWeight',new THREE.InstancedBufferAttribute(new Float32Array(sources.length),1));
  const material=new THREE.MeshBasicMaterial(),pools=new THREE.InstancedMesh(geometry,material,sources.length);
  const matrix=new THREE.Matrix4(),colour=new THREE.Color().setRGB(...tint);
  sources.forEach((s,i)=>{pools.setMatrixAt(i,matrix.makeTranslation(...s.base));pools.setColorAt(i,colour);});
  const haloGeometry=new THREE.BufferGeometry();
  for(const attr of ['position','color'])haloGeometry.setAttribute(attr,new THREE.Float32BufferAttribute([],3));
  const haloMaterial=new THREE.PointsMaterial(),halos=new THREE.Points(haloGeometry,haloMaterial);
  const weather=createLampWeather(pools,sources.flatMap(s=>[...s.head]),halos,undefined,sources.map((_,i)=>i),44,surface,true,{receiverAnchor:'base',suppressSnow:true,kxOptics:true,roughReflections:windows,reflectionWidthAt:i=>sources[i]!.widthScale});
  const reflection=weather.group.getObjectByName('street-lamp-reflections') as THREE.InstancedMesh|undefined;
  if(reflection){
    reflection.name=name;
    if(windows){
      reflection.geometry.setAttribute('reflectionWindowId',new THREE.InstancedBufferAttribute(new Float32Array(sources.map(s=>s.paneId!)),1));
      const m=reflection.material as THREE.Material,before=m.onBeforeCompile,key=m.customProgramCacheKey();
      m.onBeforeCompile=(shader,renderer)=>{
        before.call(m,shader,renderer);shader.uniforms.uWinNight=windowNight;
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float reflectionWindowId;\nvarying float vReflectionWindowId;')
          .replace('#include <begin_vertex>','#include <begin_vertex>\nvReflectionWindowId=reflectionWindowId;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nuniform float uWinNight;\nvarying float vReflectionWindowId;\n${WIN_NIGHT_GLSL}`)
          .replace('#include <opaque_fragment>',`#include <opaque_fragment>\n// reflection-window-begin\ngl_FragColor.rgb *= winPaneLit(vec2(vReflectionWindowId+0.5,-1.5),vec2(0.02),uWinNight,${PANE_UV.share});\n// reflection-window-end`);
      };
      m.customProgramCacheKey=()=>key+'-pane-light';
    }
  }
  weather.group.name='kx-front-reflections';
  pools.dispose();geometry.dispose();material.dispose();haloGeometry.dispose();haloMaterial.dispose();
  return {...weather,sources};
}
