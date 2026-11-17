// CPU execution of the composed Points size/profile hooks, then source-fog
// extinction. Energy is before tone mapping, not a prediction of GPU pixels.
import * as THREE from 'three';
import {Glsl,Mat} from './glsl.ts';

export function lampHaloProbe(points:THREE.Points,camera:THREE.PerspectiveCamera,fog:{near:number;far:number;amount:number}){
 const m=points.material as THREE.PointsMaterial,l=THREE.ShaderLib.points!,s={uniforms:{},vertexShader:l.vertexShader,fragmentShader:l.fragmentShader};m.onBeforeCompile(s as never,undefined as never);
 const block=(name:string)=>s.vertexShader.split(`// ${name}-begin`)[1]!.split(`// ${name}-end`)[0]!;
 const sizeCode=block('lamp-fog-size'),screenCode=block('lamp-fog-screen');
 const fragment=s.fragmentShader.slice(s.fragmentShader.indexOf('// lamp-fog-begin'),s.fragmentShader.indexOf('#include <tonemapping_fragment>'));
 const g=points.geometry,p=g.getAttribute('position'),c=g.getAttribute('color'),entries:{x:number;y:number;size:number;distance:number;depth:number;halo:number;haze:number;core:number;mast:number;colour:number[]}[]=[];
 for(let i=0;i<p.count;i++){
  const halo=g.getAttribute('lampFogHalo').getX(i),haze=g.getAttribute('lampFogHaze')?.getX(i)??0,core=g.getAttribute('lampFogCore')?.getX(i)??0;if(!halo&&!haze&&!core)continue;
  const v=new THREE.Vector3().fromBufferAttribute(p,i),world=v.clone().applyMatrix4(points.matrixWorld),depth=-world.clone().applyMatrix4(camera.matrixWorldInverse).z;if(depth<=0)continue;
  const scale=g.getAttribute('lampHaloScale')?.getX(i)??1,e={vars:{size:m.size,gl_PointSize:0,lampFogHalo:halo,lampHaloScale:scale,vLampFogMast:0,vLampFogDistance:0,vLampFogHaze:haze,vLampFogCore:core,uLampFog:fog.amount,cameraPosition:camera.position.toArray(),modelMatrix:new Mat(4,points.matrixWorld.toArray()),position:v.toArray()}};
  new Glsl('').run(sizeCode,e);e.vars.gl_PointSize=Number(e.vars.gl_PointSize)*scale*400/depth;new Glsl('').run(screenCode,e);
  const q=world.project(camera);entries.push({x:640*(q.x+1),y:400*(1-q.y),size:Number(e.vars.gl_PointSize),distance:Number(e.vars.vLampFogDistance),depth,halo,haze,core,mast:Number(e.vars.vLampFogMast),colour:[c.getX(i),c.getY(i),c.getZ(i)]});
 }
 return{entries,at(x:number,y:number){let energy=0;for(const p of entries){const uv=[.5+(x-p.x)/p.size,.5+(y-p.y)/p.size],r=2*Math.hypot(uv[0]!-.5,uv[1]!-.5);if(uv.some(v=>v<0||v>1))continue;
   // Canvas radial gradient in night.ts. The analytic air volumes replace it.
   const stops=[[0,1],[.18,.7],[.5,.18],[1,0]];let alpha=0;for(let i=1;i<stops.length;i++)if(r>=stops[i-1]![0]!&&r<=stops[i]![0]!){const [a,b]=[stops[i-1]!,stops[i]!];alpha=a[1]!+(b[1]!-a[1]!)*(r-a[0]!)/(b[0]!-a[0]!);}
   const e={vars:{gl_PointCoord:uv,gl_FragColor:[...p.colour,m.opacity*(p.haze||p.core?1:alpha)],lampAirAlpha:m.opacity,uLampFog:fog.amount,vLampFogHalo:p.halo,vLampFogMast:p.mast,vLampFogHaze:p.haze,vLampFogCore:p.core,vLampFogDistance:p.distance}};new Glsl('').run(fragment,e);
   const rgba=e.vars.gl_FragColor,transmission=Math.max(1-THREE.MathUtils.smoothstep(p.depth,fog.near,fog.far),Math.exp(-1.8*Math.max(0,p.depth-fog.near)/Math.max(1,fog.far-fog.near)));
   energy+=(rgba[0]!+rgba[1]!+rgba[2]!)/3*rgba[3]!*transmission;
  }return energy;}};
}
