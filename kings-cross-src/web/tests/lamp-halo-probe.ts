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

export function lampHaloProbe(points:THREE.Points,camera:THREE.PerspectiveCamera,
 fog:{near:number;far:number;amount:number}, corePoints?:THREE.Points){
 const glsl=new Glsl('');
 const marked=(source:string,name:string)=>source.split(`// ${name}-begin`)[1]?.split(`// ${name}-end`)[0]??'';
 const compile=(obj:THREE.Points)=>{
  const material=obj.material as THREE.PointsMaterial,lib=THREE.ShaderLib.points!;
  const shader={uniforms:{} as Record<string,THREE.IUniform<number>>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};
  material.onBeforeCompile(shader as never,undefined as never);
  return{material,...shader,source:shader.fragmentShader.includes('exp(-1.8*max(0.0,vFogDepth-fogNear)')};
 };
 const core=corePoints&&compile(corePoints);
 const depthCode=glsl.snippet(core?['lamp-depth','lamp-source-extinction','lamp-roof-core'].map(name=>marked(core.fragmentShader,name)).join('\n'):'');
 const coreSize=glsl.snippet(core?marked(core.vertexShader,'lamp-roof-core-size'):'');
 const projectedCores=corePoints&&core?Array.from({length:corePoints.geometry.getAttribute('position').count},(_,i)=>{
  const p=new THREE.Vector3().fromBufferAttribute(corePoints.geometry.getAttribute('position'),i).applyMatrix4(corePoints.matrixWorld);
  const depth=-p.clone().applyMatrix4(camera.matrixWorldInverse).z, q=p.clone().project(camera);
  const colour=new THREE.Vector3().fromBufferAttribute(corePoints.geometry.getAttribute('color'),i).toArray();
  const env={vars:{gl_PointSize:core.material.size,uUrbanLampFog:fog.amount}};
  coreSize(env);
  return{x:640*(q.x+1),y:400*(1-q.y),depth,colour,distance:p.distanceTo(camera.position),size:env.vars.gl_PointSize};
 }):[];

 const s=compile(points),m=s.material,uPlatformLampNight=s.uniforms.uPlatformLampNight?.value??0;
 const sizeCode=glsl.snippet(marked(s.vertexShader,'lamp-fog-size'));
 const screenCode=glsl.snippet(marked(s.vertexShader,'lamp-fog-screen'));
 const roofSpreadCode=glsl.snippet(marked(s.vertexShader,'lamp-roof-spread'));
 const fragment=glsl.snippet(s.fragmentShader.slice(s.fragmentShader.indexOf('// lamp-fog-begin'),s.fragmentShader.indexOf('#include <tonemapping_fragment>')));
 const frontage=glsl.snippet(marked(s.vertexShader,'lamp-edinburgh-frontage-vertex'));
 const late=glsl.snippet(['lamp-roof-cap','lamp-roof-scatter','lamp-edinburgh-frontage-fog','lamp-mast-capsule'].map(name=>marked(s.fragmentShader,name)).join('\n'));
 const fade=(depth:number,source:boolean)=>Math.max(1-THREE.MathUtils.smoothstep(depth,fog.near,fog.far),
  source?Math.exp(-1.8*Math.max(0,depth-fog.near)/Math.max(1,fog.far-fog.near)):0);
 const display=(c:number)=>c<=.0031308?12.92*c:1.055*c**.41666-.055;
 const g=points.geometry,p=g.getAttribute('position'),c=g.getAttribute('color'),entries:{x:number;y:number;size:number;distance:number;depth:number;halo:number;haze:number;core:number;mast:number;weight:number;height:number;roofSize:number;frontage:number;colour:number[]}[]=[];
 for(let i=0;i<p.count;i++){
  const halo=g.getAttribute('lampFogHalo').getX(i),haze=g.getAttribute('lampFogHaze')?.getX(i)??0,core=g.getAttribute('lampFogCore')?.getX(i)??0;
  const v=new THREE.Vector3().fromBufferAttribute(p,i),world=v.clone().applyMatrix4(points.matrixWorld),depth=-world.clone().applyMatrix4(camera.matrixWorldInverse).z;if(depth<=0)continue;
  const scale=g.getAttribute('lampHaloScale')?.getX(i)??1,e={vars:{size:m.size,gl_PointSize:0,lampFogHalo:halo,lampHaloScale:scale,vLampFogViewHeight:0,uPlatformLampNight,uRoofFogPointLimit:Infinity,vRoofFogPointSize:0,vLampFogMast:0,vLampFogDistance:0,vLampFogHaze:haze,vLampFogCore:core,uLampFog:fog.amount,vLampFrontageFog:0,cameraPosition:camera.position.toArray(),modelMatrix:new Mat(4,points.matrixWorld.toArray()),position:v.toArray()}};
  sizeCode(e);e.vars.gl_PointSize=Number(e.vars.gl_PointSize)*scale*400/depth;screenCode(e);roofSpreadCode(e);frontage(e);
  const q=world.clone().project(camera);entries.push({x:640*(q.x+1),y:400*(1-q.y),size:Number(e.vars.gl_PointSize),distance:Number(e.vars.vLampFogDistance),depth,halo,haze,core,mast:Number(e.vars.vLampFogMast),weight:g.getAttribute('lampFogWeight')?.getX(i)??1,height:camera.position.y-world.y,roofSize:Number(e.vars.vRoofFogPointSize),frontage:Number(e.vars.vLampFrontageFog),colour:[c.getX(i),c.getY(i),c.getZ(i)]});
 }
 const fragments=(x:number,y:number,maxSize=Infinity,depth=Infinity,clipPointCenters=false)=>entries.flatMap(p=>{if(p.depth>depth||clipPointCenters&&(p.x<0||p.x>=1280||p.y<0||p.y>=800))return[];const size=Math.max(1,Math.min(p.size,maxSize));if(Math.abs(x-p.x)>size/2||Math.abs(y-p.y)>size/2)return[];const uv=[.5+(x-p.x)/size,.5+(y-p.y)/size],r=2*Math.hypot(uv[0]!-.5,uv[1]!-.5);if(uv.some(v=>v<0||v>1))return[];
   // Canvas radial gradient in night.ts. The analytic air volumes replace it.
   const stops=[[0,1],[.18,.7],[.5,.18],[1,0]];let alpha=0;for(let i=1;i<stops.length;i++)if(r>=stops[i-1]![0]!&&r<=stops[i]![0]!){const [a,b]=[stops[i-1]!,stops[i]!];alpha=a[1]!+(b[1]!-a[1]!)*(r-a[0]!)/(b[0]!-a[0]!);}
   const e={vars:{gl_PointCoord:uv,gl_FragColor:[...p.colour,m.opacity*(p.haze||p.core?1:alpha)],lampAirAlpha:m.opacity,uPlatformLampNight,uLampFog:fog.amount,vLampFogHalo:p.halo,vLampFogMast:p.mast,vLampFogHaze:p.haze,vLampFogCore:p.core,vLampFogDistance:p.distance,vLampFogWeight:p.weight,vLampFogViewHeight:p.height,vLampFrontageFog:p.frontage,vRoofFogPointSize:Math.max(1,Math.min(p.roofSize,maxSize))}};fragment(e);
   const rgba=e.vars.gl_FragColor,transmission=fade(p.depth,true);
   return[{p,rgba,transmission,e}];
 });
  function composeAt(x:number,y:number,receiver:HaloReceiver){
  const f=THREE.MathUtils.smoothstep(receiver.depth,fog.near,fog.far),background=receiver.background.map((c,i)=>c*(1-f)+receiver.fogColour[i]!*f),rgb=[...background];
  for(const {p,rgba,e}of fragments(x,y,receiver.maxPointSize,receiver.depth,true)){
   let colour=rgba.slice(0,3);
   if(m.toneMapped)colour=tone.call('ACESFilmicToneMapping',[colour],{vars:{...toneMatrices,toneMappingExposure:receiver.exposure??2.3}}) as number[];
   e.vars.gl_FragColor=[...colour.map(c=>display(c)*fade(p.depth,s.source)),rgba[3]!];
   late(e);
   const pixel=e.vars.gl_FragColor,alpha=pixel[3]!;
   for(let i=0;i<3;i++){
    const src=pixel[i]!;
    const dst=rgb[i]!;
    if(m.blending===THREE.NormalBlending)rgb[i]=src*alpha+dst*(1-alpha);
    else if(m.blending===THREE.CustomBlending&&m.blendSrc===THREE.OneFactor&&m.blendDst===THREE.OneMinusSrcColorFactor)rgb[i]=src+dst*(1-src);
    else rgb[i]=dst+src*alpha;
   }
  }
  if(core)for(const p of projectedCores){
   if(p.depth<=0||p.depth>receiver.depth||p.x<0||p.x>=1280||p.y<0||p.y>=800)continue;
   const size=Math.min(p.size,receiver.maxPointSize??Infinity),u=(x-p.x)/size,v=(y-p.y)/size;
   if(Math.abs(u)>=.5||Math.abs(v)>=.5)continue;
   const e={vars:{gl_FragColor:[...p.colour.map(c=>display(c)*fade(p.depth,core.source)),core.material.opacity],
    gl_PointCoord:[u+.5,v+.5],uUrbanLampFog:fog.amount,vUrbanLampDistance:p.distance}};
   depthCode(e);
   const rgba=e.vars.gl_FragColor;
   for(let i=0;i<3;i++)rgb[i]=rgb[i]!+THREE.MathUtils.clamp(rgba[i]!,0,1)*rgba[3]!;
  }
  const clipped=rgb.map(c=>THREE.MathUtils.clamp(c,0,1));
  return{rgb:clipped,unclippedRGB:rgb,background,excess:clipped.map((c,i)=>c-background[i]!)};
 }
 return{entries,composeAt,at(x:number,y:number){let energy=0;for(const {p,rgba,transmission}of fragments(x,y)){if(!p.halo&&!p.haze&&!p.core)continue;energy+=(rgba[0]!+rgba[1]!+rgba[2]!)/3*rgba[3]!*transmission;}return energy;}};
}
