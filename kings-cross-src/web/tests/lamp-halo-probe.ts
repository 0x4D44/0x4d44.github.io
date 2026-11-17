// Execute the actual Points size/profile hooks and source extinction on CPU.
// at() retains the old pre-tone energy measurement. composeAt() additionally
// models the receiver veil, ACES, sRGB, clipping, occlusion and display blending.
// Texture filtering, geometry coverage and GPU precision still require capture.
import * as THREE from 'three';
import {Glsl,Mat} from './glsl.ts';

// Execute Three's actual ACES curve, not an RGB gain before its shoulder.
const toneSource=THREE.ShaderChunk.tonemapping_pars_fragment;
const toneMatrices:Record<string,Mat>={};
const tone=new Glsl(toneSource.slice(toneSource.indexOf('vec3 RRTAndODTFit'),toneSource.indexOf('const mat3 LINEAR_REC2020'))
 .replace(/const mat3 (\w+)\s*=\s*mat3\(([\s\S]*?)\);/g,(_all,name,body:string)=>{toneMatrices[name]=new Mat(3,(body.replaceAll('vec3','').match(/-?\d+\.\d+/g)??[]).map(Number));return '';})
 .replace('saturate( color )','clamp( color, 0.0, 1.0 )'));
export interface HaloReceiver {
 /** Display sRGB of the opaque receiver before this light draw and fog. */
 background:readonly number[];
 depth:number;
 fogColour:readonly number[];
 exposure?:number;
 /** Hardware point limit; compare plausible limits if not captured. */
 maxPointSize?:number;
}

export function lampHaloProbe(points:THREE.Points,camera:THREE.PerspectiveCamera,fog:{near:number;far:number;amount:number}){
 const m=points.material as THREE.PointsMaterial,l=THREE.ShaderLib.points!,s={uniforms:{},vertexShader:l.vertexShader,fragmentShader:l.fragmentShader};m.onBeforeCompile(s as never,undefined as never);
 const block=(name:string)=>s.vertexShader.split(`// ${name}-begin`)[1]!.split(`// ${name}-end`)[0]!;
 const sizeCode=block('lamp-fog-size'),screenCode=block('lamp-fog-screen');
 const fragment=s.fragmentShader.slice(s.fragmentShader.indexOf('// lamp-fog-begin'),s.fragmentShader.indexOf('#include <tonemapping_fragment>'));
 const g=points.geometry,p=g.getAttribute('position'),c=g.getAttribute('color'),entries:{x:number;y:number;size:number;distance:number;depth:number;halo:number;haze:number;core:number;mast:number;colour:number[]}[]=[];
 for(let i=0;i<p.count;i++){
  const halo=g.getAttribute('lampFogHalo').getX(i),haze=g.getAttribute('lampFogHaze')?.getX(i)??0,core=g.getAttribute('lampFogCore')?.getX(i)??0;
  const v=new THREE.Vector3().fromBufferAttribute(p,i),world=v.clone().applyMatrix4(points.matrixWorld),depth=-world.clone().applyMatrix4(camera.matrixWorldInverse).z;if(depth<=0)continue;
  const scale=g.getAttribute('lampHaloScale')?.getX(i)??1,e={vars:{size:m.size,gl_PointSize:0,lampFogHalo:halo,lampHaloScale:scale,vLampFogMast:0,vLampFogDistance:0,vLampFogHaze:haze,vLampFogCore:core,uLampFog:fog.amount,cameraPosition:camera.position.toArray(),modelMatrix:new Mat(4,points.matrixWorld.toArray()),position:v.toArray()}};
  new Glsl('').run(sizeCode,e);e.vars.gl_PointSize=Number(e.vars.gl_PointSize)*scale*400/depth;new Glsl('').run(screenCode,e);
  const q=world.project(camera);entries.push({x:640*(q.x+1),y:400*(1-q.y),size:Number(e.vars.gl_PointSize),distance:Number(e.vars.vLampFogDistance),depth,halo,haze,core,mast:Number(e.vars.vLampFogMast),colour:[c.getX(i),c.getY(i),c.getZ(i)]});
 }
 const fragments=(x:number,y:number,maxSize=Infinity,depth=Infinity)=>entries.flatMap(p=>{if(p.depth>depth)return[];const size=Math.min(p.size,maxSize),uv=[.5+(x-p.x)/size,.5+(y-p.y)/size],r=2*Math.hypot(uv[0]!-.5,uv[1]!-.5);if(uv.some(v=>v<0||v>1))return[];
   // Canvas radial gradient in night.ts. The analytic air volumes replace it.
   const stops=[[0,1],[.18,.7],[.5,.18],[1,0]];let alpha=0;for(let i=1;i<stops.length;i++)if(r>=stops[i-1]![0]!&&r<=stops[i]![0]!){const [a,b]=[stops[i-1]!,stops[i]!];alpha=a[1]!+(b[1]!-a[1]!)*(r-a[0]!)/(b[0]!-a[0]!);}
   const e={vars:{gl_PointCoord:uv,gl_FragColor:[...p.colour,m.opacity*(p.haze||p.core?1:alpha)],lampAirAlpha:m.opacity,uLampFog:fog.amount,vLampFogHalo:p.halo,vLampFogMast:p.mast,vLampFogHaze:p.haze,vLampFogCore:p.core,vLampFogDistance:p.distance}};new Glsl('').run(fragment,e);
   const rgba=e.vars.gl_FragColor,transmission=Math.max(1-THREE.MathUtils.smoothstep(p.depth,fog.near,fog.far),Math.exp(-1.8*Math.max(0,p.depth-fog.near)/Math.max(1,fog.far-fog.near)));
   return[{p,rgba,transmission,e}];
 });
 return{entries,at(x:number,y:number){let energy=0;for(const {p,rgba,transmission}of fragments(x,y)){if(!p.halo&&!p.haze&&!p.core)continue;energy+=(rgba[0]!+rgba[1]!+rgba[2]!)/3*rgba[3]!*transmission;}return energy;},
 composeAt(x:number,y:number,receiver:HaloReceiver){
  const f=THREE.MathUtils.smoothstep(receiver.depth,fog.near,fog.far),background=receiver.background.map((c,i)=>c*(1-f)+receiver.fogColour[i]!*f),rgb=[...background];
  for(const {p,rgba,transmission,e}of fragments(x,y,receiver.maxPointSize,receiver.depth)){
   let colour=rgba.slice(0,3);
   if(m.toneMapped)colour=tone.call('ACESFilmicToneMapping',[colour],{vars:{...toneMatrices,toneMappingExposure:receiver.exposure??2.3}}) as number[];
   colour=colour.map(c=>c<=.0031308?12.92*c:1.055*c**.41666-.055);
   // Points fog executes after tone mapping / sRGB, then blending occurs.
   const source=s.fragmentShader.includes('exp(-1.8*max(0.0,vFogDepth-fogNear)');
   const transmissionDisplay=source?transmission:1-THREE.MathUtils.smoothstep(p.depth,fog.near,fog.far);
   e.vars.gl_FragColor=[...colour.map(c=>c*transmissionDisplay),rgba[3]!];
   const late=s.fragmentShader.split('// lamp-roof-cap-begin')[1]?.split('// lamp-roof-cap-end')[0];
   if(late)new Glsl('').run(late,e);
   const capsule=s.fragmentShader.split('// lamp-mast-capsule-begin')[1]?.split('// lamp-mast-capsule-end')[0];
   if(capsule)new Glsl('').run(capsule,e);
   const pixel=e.vars.gl_FragColor,alpha=pixel[3]!;
   for(let i=0;i<3;i++)rgb[i]=Math.min(1,Math.max(0,m.blending===THREE.NormalBlending?pixel[i]!*alpha+rgb[i]!*(1-alpha):rgb[i]!+pixel[i]!*alpha));
  }
  return{rgb,background,excess:rgb.map((c,i)=>c-background[i]!)};
 }};
}
