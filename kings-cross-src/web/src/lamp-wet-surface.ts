// A one-time top-down receipt of the paving/road triangles that can receive
// urban lamp reflections. Roofs, walls, gardens and the space beside decks do
// not receive a reflection. No render pass or per-frame CPU raycast.
import * as THREE from 'three';
import type { LampSpot } from '../../core/streetlights.ts';

export interface LampWetSurface {
  map: THREE.DataTexture;
  rect: THREE.Vector4;
  dispose():void;
}

/** RG stores height at 1/128 m, biased by 128 m; B is the wet receiver mask.
 * The ordinary byte texture is linearly filterable on every supported GPU. */
export function createLampWetSurface(root:THREE.Object3D,names:ReadonlySet<string>,spots:readonly LampSpot[],
  accept?:(name:string,x:number,z:number)=>boolean):LampWetSurface|undefined {
  const near=spots.filter(s=>Math.hypot(s.x,s.z)<650);
  if(!near.length)return;
  const x0=Math.floor(Math.min(...near.map(s=>s.x)))-16,z0=Math.floor(Math.min(...near.map(s=>s.z)))-16;
  const x1=Math.ceil(Math.max(...near.map(s=>s.x)))+16,z1=Math.ceil(Math.max(...near.map(s=>s.z)))+16;
  let cell=.5;
  while(Math.ceil((x1-x0)/cell)*Math.ceil((z1-z0)/cell)>2_000_000)cell+=.25;
  const nx=Math.ceil((x1-x0)/cell),nz=Math.ceil((z1-z0)/cell),heights=new Float32Array(nx*nz).fill(-Infinity);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse(object=>{
    const mesh=object as THREE.Mesh;
    if(!mesh.isMesh||!names.has(mesh.name))return;
    const p=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
    for(let i=0;i<(index?.count??p.count);i+=3){
      a.fromBufferAttribute(p,index?.getX(i)??i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(p,index?.getX(i+1)??i+1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(p,index?.getX(i+2)??i+2).applyMatrix4(mesh.matrixWorld);
      const det=(b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z);
      if(det>=-1e-8)continue; // upward faces only; never a bridge wall or underside
      const dx=((b.y-a.y)*(c.z-a.z)-(c.y-a.y)*(b.z-a.z))/det;
      const dz=((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/det;
      const iz0=Math.max(0,Math.ceil((Math.min(a.z,b.z,c.z)-z0)/cell-.5));
      const iz1=Math.min(nz-1,Math.floor((Math.max(a.z,b.z,c.z)-z0)/cell-.5));
      for(let iz=iz0;iz<=iz1;iz++){
        const z=z0+(iz+.5)*cell;let lo=Infinity,hi=-Infinity;
        for(const [u,v]of [[a,b],[b,c],[c,a]]){
          if(u.z===v.z||z<Math.min(u.z,v.z)||z>Math.max(u.z,v.z))continue;
          const x=u.x+(z-u.z)/(v.z-u.z)*(v.x-u.x);lo=Math.min(lo,x);hi=Math.max(hi,x);
        }
        const ix0=Math.max(0,Math.ceil((lo-x0)/cell-.5-1e-9)),ix1=Math.min(nx-1,Math.floor((hi-x0)/cell-.5+1e-9));
        for(let ix=ix0;ix<=ix1;ix++){
          const x=x0+(ix+.5)*cell;
          if(accept&&!accept(mesh.name,x,z))continue;
          const y=a.y+dx*(x-a.x)+dz*(z-a.z),k=iz*nx+ix;
          heights[k]=Math.max(heights[k]!,y);
        }
      }
    }
  });
  const bytes=new Uint8Array(nx*nz*4);
  const encode=(k:number,y:number)=>{const n=Math.max(0,Math.min(65535,Math.round((y+128)*128)));bytes[k*4]=n>>8;bytes[k*4+1]=n&255;bytes[k*4+3]=255;};
  for(let k=0;k<heights.length;k++)if(Number.isFinite(heights[k])){encode(k,heights[k]!);bytes[k*4+2]=255;}
  // Carry edge heights one texel outward, retaining zero receiver weight. This
  // keeps bilinear height reads on the deck plane while its mask fades out.
  for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
    const k=z*nx+x;if(Number.isFinite(heights[k]))continue;
    let sum=0,n=0;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const xx=x+dx,zz=z+dz;if(xx<0||xx>=nx||zz<0||zz>=nz)continue;
      const y=heights[zz*nx+xx]!;if(Number.isFinite(y)){sum+=y;n++;}
    }
    if(n)encode(k,sum/n);
  }
  const map=new THREE.DataTexture(bytes,nx,nz,THREE.RGBAFormat);map.minFilter=map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
  return {map,rect:new THREE.Vector4(x0,z0,1/(nx*cell),1/(nz*cell)),
    dispose(){map.dispose();}};
}
