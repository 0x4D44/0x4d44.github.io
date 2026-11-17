// Shared lamp reflections and fog scattering. Urban receivers opt into a
// finite wet-surface footprint; Perth retains its existing rendering path.
import * as THREE from 'three';
import type { LampWetSurface } from './lamp-wet-surface.ts';
import { LAMP_RECEIVER_GLSL } from './lamp-wet-surface.ts';
import { surfaceUniforms } from './atmosphere.ts';
import { COVER_GLSL, coverUniforms } from './cover.ts';

/** Fade light away rather than blending in a fog-coloured rectangle. */
export function fadeLightInFog(material: THREE.Material, alpha = false, depth = false, source = false): void {
  material.onBeforeCompile = shader => {
    if(depth){
      shader.uniforms.uUrbanLampFog=surfaceUniforms.fog;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vUrbanLampDistance;')
        .replace('#include <project_vertex>','#include <project_vertex>\nvUrbanLampDistance=length(cameraPosition-(modelMatrix*vec4(transformed,1.0)).xyz);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uUrbanLampFog;\nvarying float vUrbanLampDistance;');
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace(
      'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );', source
        ? `gl_FragColor.${alpha?'a':'rgb'} *= max(1.0-fogFactor,exp(-1.8*max(0.0,vFogDepth-fogNear)/max(1.0,fogFar-fogNear)));`
        : alpha ? 'gl_FragColor.a *= 1.0 - fogFactor;' : 'gl_FragColor.rgb *= 1.0 - fogFactor;')+(depth?`
// lamp-depth-begin
gl_FragColor.rgb *= exp(-0.0045*max(0.0,vUrbanLampDistance-30.0)*uUrbanLampFog);
// lamp-depth-end`:''));
  };
  material.customProgramCacheKey = () => (alpha ? 'street-lamp-fog-alpha' : 'street-lamp-fog-fade')+(depth?'-depth':'')+(source?'-source':'');
}

export interface LampWeatherOptions {
  enhancedFog?: boolean;
  fogHaloSpread?: number;
  mastHaze?: boolean;
  kxOptics?: boolean;
  /** Rough wet paving optics independent of KX's pool and mast treatment. */
  roughReflections?: boolean;
  reflectionTailAt?: (sourceIndex:number)=>number;
  lightFog?: boolean;
  suppressSnow?: boolean;
  reflectionWidthAt?: (sourceIndex:number)=>number;
  /** A window is recessed inside the wall; its receiver is outside on paving. */
  receiverAnchor?: 'head' | 'base';
}

/** One reflection per selected nearby source, laid onto its own ground plane. Its centre is
 * the eye's ray to the head mirrored below that plane: it follows the eye,
 * slopes with the paving, and projects below its source as a wet reflection.
 * The narrow cross-section and soft length suggest rough wet paving rather
 * than a second diffuse light pool. No real lights or frame-time raycasts. */
export function createLampWeather(pools: THREE.InstancedMesh, heads: readonly number[], halos: THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>,
  floor: {map:THREE.Texture;rect:THREE.Vector4}|undefined, indices: readonly number[], reach?:number, surface?:LampWetSurface, broken=false, optics:LampWeatherOptions={}) {
  const enhancedFog=!!optics.enhancedFog;
  const roughReflections=!!(optics.kxOptics||optics.roughReflections);
  const group=new THREE.Group();group.name='street-lamp-weather';
  // Urban roads need intermediate receiver samples along a long streak.
  // Perth/platform strips retain their original geometry and shader path.
  const geometry=surface?new THREE.PlaneGeometry(1,1,1,8).rotateX(-Math.PI/2):pools.geometry.clone();
  geometry.setAttribute('reflectionHead',new THREE.InstancedBufferAttribute(new Float32Array(indices.flatMap(i=>heads.slice(i*3,i*3+3))),3));
  if(optics.reflectionWidthAt)geometry.setAttribute('reflectionWidth',new THREE.InstancedBufferAttribute(new Float32Array(indices.map(i=>optics.reflectionWidthAt!(i))),1));
  if(optics.reflectionTailAt)geometry.setAttribute('reflectionTail',new THREE.InstancedBufferAttribute(new Float32Array(indices.map(i=>optics.reflectionTailAt!(i))),1));
  const floorWeights=pools.geometry.getAttribute('poolFloorWeight');
  geometry.setAttribute('poolFloorWeight',new THREE.InstancedBufferAttribute(new Float32Array(indices.map(i=>floorWeights.getX(i))),1));
  const material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,toneMapped:false,fog:true,
    polygonOffset:true,polygonOffsetFactor:-7,polygonOffsetUnits:-7});
  fadeLightInFog(material,true);
  const before=material.onBeforeCompile;
  const surfaceGLSL=surface?LAMP_RECEIVER_GLSL:'';
  // Assemble the optional urban optics with the original hook. Only match
  // three's include lines, so production GLSL squeezing cannot lose a patch.
  const receiverCommon=surface?`\n${surfaceGLSL}`:'';
  const reachCommon=reach!==undefined?'\nvarying vec3 vReflectionAnchor;\nuniform float uReflectionReach;':'';
  material.onBeforeCompile=(shader,renderer)=>{
    before.call(material,shader,renderer);
    Object.assign(shader.uniforms,coverUniforms,{uLampWet:surfaceUniforms.wet});
    if(optics.suppressSnow)shader.uniforms.uLampSnow=surfaceUniforms.snowCover;
    if(floor)Object.assign(shader.uniforms,{uReflectionFloor:{value:floor.map},uReflectionRect:{value:floor.rect}});
    if(reach!==undefined)shader.uniforms.uReflectionReach={value:reach};
    if(surface)Object.assign(shader.uniforms,{uLampSurface:{value:surface.map},uLampSurfaceRect:{value:surface.rect}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>${receiverCommon}${reachCommon}
${optics.reflectionWidthAt?'attribute float reflectionWidth;':''}${optics.reflectionTailAt?'\nattribute float reflectionTail;\nvarying float vReflectionTail;':''}
attribute vec3 reflectionHead;
attribute float poolFloorWeight;
varying vec2 vReflectionUv;
varying vec3 vReflectionWorld;
varying float vReflectionFloor;
varying float vReflectionValid;`)
      .replace('#include <project_vertex>',`
vec3 lampBase = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
vec3 lampHead = ( modelMatrix * vec4( reflectionHead, 1.0 ) ).xyz;
vec3 lampNormal = normalize( mat3( modelMatrix ) * vec3( -instanceMatrix[0][1] / instanceMatrix[0][0], 1.0, -instanceMatrix[2][1] / instanceMatrix[2][2] ) );
${surface?`// reflection-receiver-anchor-begin
vec2 headReceiver = lampReceiver(${optics.receiverAnchor==='base'?'lampBase':'lampHead'}.xz);
lampBase.y = headReceiver.x + 0.012;
// reflection-receiver-anchor-end
`:''}vec3 reflectionCentre;
// reflection-project-begin
vec3 mirrorHead = lampHead - 2.0 * dot( lampHead - lampBase, lampNormal ) * lampNormal;
vec3 mirrorRay = mirrorHead - cameraPosition;
float mirrorT = dot( lampBase - cameraPosition, lampNormal ) / min( -0.001, dot( mirrorRay, lampNormal ) );
reflectionCentre = cameraPosition + clamp( mirrorT, 0.0, 1.0 ) * mirrorRay;
float reflectionValid = ( dot( cameraPosition - lampBase, lampNormal ) > 0.0 && mirrorT > 0.0 && mirrorT < 1.0 ) ? 1.0 : 0.0;
// reflection-project-end
${reach!==undefined?`// reflection-local-begin
reflectionValid *= 1.0-step(uReflectionReach+6.5,length(reflectionCentre.xz-lampBase.xz));
// reflection-local-end
`:''}vReflectionValid = reflectionValid${surface?' * smoothstep(0.0,0.5,headReceiver.y)':''};${reach!==undefined?'\nvReflectionAnchor = lampBase;':''}
vec3 along = cameraPosition - reflectionCentre;
along -= lampNormal * dot( along, lampNormal );
along = normalize( along + vec3( 0.00001, 0.0, 0.00001 ) );
vec3 across = normalize( vec3( lampNormal.y * along.z - lampNormal.z * along.y, lampNormal.z * along.x - lampNormal.x * along.z, lampNormal.x * along.y - lampNormal.y * along.x ) );
float lampHeight = max( 1.0, dot( lampHead - lampBase, lampNormal ) );
float streakLength = min( 12.0, 1.5 + 0.8 * lampHeight + 0.08 * length( cameraPosition - reflectionCentre ) );${broken?`
float streakWidth = 0.45;
// reflection-urban-shape-begin
streakLength = min(32.0,12.0+lampHeight+0.08*length(cameraPosition-reflectionCentre));
streakWidth = 0.30+0.02*min(lampHeight,12.0);
// reflection-urban-shape-end
// reflection-urban-frame-begin
// A rough wet surface reflects over the run from the source foot to its
// mirror lobe. At a low eye height that lobe alone is below the frame.
vec3 sourceFoot = lampHead-lampNormal*dot(lampHead-lampBase,lampNormal);
float sourceRun = max(0.0,dot(reflectionCentre-sourceFoot,along));
reflectionCentre -= along*sourceRun*0.5;
streakLength = min(${optics.reflectionTailAt?'mix(80.0,140.0,step(0.001,reflectionTail))':optics.roughReflections?'140.0':'80.0'},max(streakLength,sourceRun+16.0));${optics.reflectionTailAt?`
// reflection-road-tail-begin
// Extend only the eye-facing rough tail, retaining the source-foot end.
// Receiver/snow/finite-distance clipping still applies to every fragment.
reflectionCentre += along*reflectionTail*0.5;
streakLength += reflectionTail;
vReflectionTail = step(0.001,reflectionTail);
// reflection-road-tail-end`:''}
// reflection-urban-frame-end`:''}
${broken?`float roughWidth = streakWidth;
// reflection-rough-width-begin
// A rough wet receiver spreads a distant light across more paving. Retain
// the narrow source kernel, adding a blurred lobe around it in world metres.
roughWidth = max(streakWidth,${optics.roughReflections?'0.55+0.014*min(length(cameraPosition-reflectionCentre),400.0)':'0.9+0.012*min(length(cameraPosition-reflectionCentre),200.0)'});
// reflection-rough-width-end${optics.reflectionWidthAt?`
// reflection-source-width-begin
roughWidth *= reflectionWidth;
// reflection-source-width-end`:''}
// Keep a rough lobe from swelling at the end closest to the eye. The source
// still broadens with distance, but its angular width stays bounded along it.
float streakDepth = max(1.0,-(viewMatrix*vec4(reflectionCentre,1.0)).z);
float vertexDepth = max(1.0,-(viewMatrix*vec4(reflectionCentre+along*position.z*streakLength,1.0)).z);
// reflection-rough-perspective-begin
roughWidth *= clamp(vertexDepth/streakDepth,0.15,1.0);
// reflection-rough-perspective-end
vec4 reflectionEndA = projectionMatrix*viewMatrix*vec4(reflectionCentre-along*streakLength*0.5,1.0);
vec4 reflectionEndB = projectionMatrix*viewMatrix*vec4(reflectionCentre+along*streakLength*0.5,1.0);
// reflection-resolve-begin
// Subpixel runs at the horizon read as a horizontal band, not a reflection.
float verticalSpan = abs(reflectionEndA.y/reflectionEndA.w-reflectionEndB.y/reflectionEndB.w);
reflectionValid *= smoothstep(${optics.roughReflections?'0.008,0.024':'0.012,0.035'},verticalSpan);
// reflection-resolve-end
vReflectionValid *= reflectionValid;
`:''}
vReflectionUv = position.xz * 2.0;
vReflectionFloor = poolFloorWeight;
vReflectionWorld = reflectionCentre + across * position.x * ${broken?'roughWidth':'( 0.45 + 0.05 * lampHeight )'} + along * position.z * streakLength;
${surface?`// reflection-receiver-vertex-begin
vec2 vertexReceiver = lampReceiver(vReflectionWorld.xz);
${optics.roughReflections?'':'if (vertexReceiver.y > 0.001) '}vReflectionWorld.y = vertexReceiver.x + ${optics.reflectionTailAt?'mix(0.012,0.07,vReflectionTail)':'0.012'};
// reflection-receiver-vertex-end
`:''}vec4 mvPosition = viewMatrix * vec4( vReflectionWorld, 1.0 );
gl_Position = projectionMatrix * mvPosition;${reach!==undefined?'\nif (vReflectionValid < 0.001) gl_Position = vec4(2.0,2.0,2.0,1.0);':''}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>${receiverCommon}${reachCommon}${optics.reflectionTailAt?'\nvarying float vReflectionTail;':''}
varying vec2 vReflectionUv;
varying vec3 vReflectionWorld;
varying float vReflectionFloor;
varying float vReflectionValid;
uniform float uLampWet;
${optics.suppressSnow?'uniform float uLampSnow;':''}
${COVER_GLSL}
${floor?'uniform sampler2D uReflectionFloor;\nuniform vec4 uReflectionRect;':''}`)
      .replace('#include <opaque_fragment>',`#include <opaque_fragment>
float reflectionOpen = 1.0 - coverGroundAt( vReflectionWorld );
${floor?'reflectionOpen *= mix( 1.0, texture2D( uReflectionFloor, ( vReflectionWorld.xz - uReflectionRect.xy ) * uReflectionRect.zw ).r, vReflectionFloor );':''}
gl_FragColor.a *= vReflectionValid;
${reach!==undefined?`// reflection-footprint-begin
float sourceDistance = length(vReflectionWorld.xz-vReflectionAnchor.xz);
reflectionOpen *= 1.0-smoothstep(0.65*uReflectionReach,uReflectionReach,sourceDistance);
// reflection-footprint-end
`:''}${surface?`// reflection-receiver-clip-begin
vec2 receiver = lampReceiver(vReflectionWorld.xz);
float onSurface = 1.0-smoothstep(0.04,0.16,abs(vReflectionWorld.y-receiver.x-0.012));
reflectionOpen *= receiver.y*onSurface;
// reflection-receiver-clip-end
`:''}// reflection-alpha-begin
// Three longitudinal Gaussian taps give a continuous, slightly blurred streak.
float blurY0 = vReflectionUv.y - 0.12;
float blurY1 = vReflectionUv.y + 0.12;
float streakY = 0.5 * exp( -${broken?'0.8':'2.5'} * vReflectionUv.y * vReflectionUv.y ) + 0.25 * exp( -${broken?'0.8':'2.5'} * blurY0 * blurY0 ) + 0.25 * exp( -${broken?'0.8':'2.5'} * blurY1 * blurY1 );
float streak = exp( -${broken?(roughReflections?'1.2':'3.2'):'10.0'} * vReflectionUv.x * vReflectionUv.x ) * streakY;
gl_FragColor.a *= ${optics.reflectionTailAt?'mix(0.8,1.0,vReflectionTail)':'0.8'} * smoothstep( 0.45, 0.85, uLampWet ) * reflectionOpen * streak;
// reflection-alpha-end${optics.suppressSnow?`
// reflection-snow-begin
gl_FragColor.a *= 1.0-smoothstep(0.02,0.20,uLampSnow);
// reflection-snow-end`:''}${reach!==undefined?`
// reflection-edge-begin
gl_FragColor.a *= (1.0-smoothstep(0.65,1.0,abs(vReflectionUv.x)))*(1.0-smoothstep(${optics.roughReflections?'0.85':'0.65'},1.0,abs(vReflectionUv.y)));
// reflection-edge-end`:''}${broken?`
// reflection-breakup-begin
float seed = dot(vReflectionAnchor.xz,vec2(0.37,0.73));
${roughReflections?`// ${optics.kxOptics?'reflection-kx-roughness':'reflection-roughness'}-begin
// Unequal wet segments, tapered tips and wandering soft sides replace the
// former shallow horizontal bars inside a parallel-sided post silhouette.
float wetSeed = dot(vReflectionAnchor.xz,vec2(0.37,0.73));
float wetY = vReflectionUv.y;
float wetTaper = ${optics.roughReflections?'0.12+0.88*pow(max(0.0,0.5-0.5*wetY),0.60)':'0.10+0.90*pow(max(0.0,1.0-wetY*wetY),1.75)'};
float wetWander = ${optics.roughReflections?'0.035':'0.10'}*sin(9.0*wetY+wetSeed);
float wetAcross = (vReflectionUv.x-wetWander)/wetTaper;
float wetSegments = 0.5+0.5*sin(${optics.roughReflections?'7.0':'13.0'}*wetY+wetSeed+2.0*sin(4.3*wetY-wetSeed))*sin(5.7*wetY-wetSeed);
gl_FragColor.a *= exp(-1.4*wetAcross*wetAcross)*(${optics.roughReflections?(optics.reflectionTailAt?'mix(0.12,0.24,vReflectionTail)+mix(0.88,0.76,vReflectionTail)*smoothstep(0.18,0.82,wetSegments)':'0.12+0.88*smoothstep(0.18,0.82,wetSegments)'):'0.035+0.965*smoothstep(0.28,0.75,wetSegments)'});
// ${optics.kxOptics?'reflection-kx-roughness':'reflection-roughness'}-end`:`float puddles = 0.5+0.5*sin(19.0*vReflectionUv.y+seed+3.0*vReflectionUv.x)*sin(7.0*vReflectionUv.y-seed);
gl_FragColor.a *= 0.42+0.58*smoothstep(0.15,0.8,puddles);`}
// reflection-breakup-end`:''}`);
  };
  material.customProgramCacheKey=()=>`lamp-wet-reflection-${!!floor}${reach!==undefined?'-finite':''}${surface?'-receiver':''}${broken?'-broken':''}${enhancedFog?'-scatter':''}${optics.receiverAnchor==='base'?'-base-anchor':''}${optics.suppressSnow?'-snow-free':''}${optics.reflectionWidthAt?'-source-width':''}${optics.kxOptics?'-kx':''}${optics.roughReflections?'-rough':''}${optics.reflectionTailAt?'-road-tail':''}`;
  const reflections=new THREE.InstancedMesh(geometry,material,indices.length);
  const matrix=new THREE.Matrix4(),colour=new THREE.Color();
  // Deep breaks remove the diffuse wet wash. Recover that energy in the lit
  // fragments, preserving source colour and the original pool brightness.
  indices.forEach((source,i)=>{pools.getMatrixAt(source,matrix);reflections.setMatrixAt(i,matrix);if(pools.instanceColor){pools.getColorAt(source,colour);reflections.setColorAt(i,colour.multiplyScalar(optics.roughReflections?3.625:2.5));}});
  reflections.name='street-lamp-reflections';reflections.raycast=()=>{};reflections.frustumCulled=false;reflections.renderOrder=4.1;reflections.visible=false;
  if(indices.length)group.add(reflections);

  // The original head and its larger scattering sprite share one Points draw.
  // Core sprites retain their original position attribute and white intensity.
  const hg=halos.geometry,p=hg.getAttribute('position'),c=hg.getAttribute('color'),scale=hg.getAttribute('lampHaloScale');
  // A strip's seven near-head samples are one source of light in the air.
  // Add one bounded volume at their centroid, retaining the accepted head
  // profile and the existing Points draw instead of amplifying every sample.
  const strips=new Map<string,{point:THREE.Vector3;colour:THREE.Vector3;scale:number;count:number}>();
  if(enhancedFog&&optics.mastHaze&&scale)for(let i=0;i<p.count;i++){
    if(scale.getX(i)<1.5)continue;
    const key=`${p.getX(i)},${p.getZ(i)}`,entry=strips.get(key);
    if(entry){entry.point.y+=p.getY(i);entry.count++;}
    else strips.set(key,{point:new THREE.Vector3().fromBufferAttribute(p,i),colour:new THREE.Vector3().fromBufferAttribute(c,i),scale:scale.getX(i),count:1});
  }
  const haze=[...strips.values()];haze.forEach(s=>s.point.y/=s.count);
  // One independent inner lobe per KX strip, in the same Points draw. Scaling
  // the much wider air lobe barely changed the observed 10–30px shoulders.
  const cores=optics.kxOptics?haze:[],sourceCount=p.count*2+haze.length+cores.length;
  const fogFlags=new Float32Array(sourceCount);
  const positions=new Float32Array(sourceCount*3),colors=new Float32Array(sourceCount*3);
  positions.set(p.array);positions.set(p.array,p.count*3);colors.set(c.array);colors.set(c.array,p.count*3);fogFlags.fill(1,p.count,p.count*2+haze.length);
  haze.forEach((s,i)=>{positions.set(s.point.toArray(),p.count*6+i*3);colors.set(s.colour.toArray(),p.count*6+i*3);});
  cores.forEach((s,i)=>{const offset=(p.count*2+haze.length+i)*3;positions.set(s.point.toArray(),offset);colors.set(s.colour.toArray(),offset);});
  hg.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));hg.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));hg.setAttribute('lampFogHalo',new THREE.Float32BufferAttribute(fogFlags,1));
  if(scale){const sizes=new Float32Array(sourceCount);sizes.set(scale.array);sizes.set(scale.array,scale.count);haze.forEach((s,i)=>{sizes[scale.count*2+i]=s.scale*(optics.kxOptics?1.65:1.15);});cores.forEach((s,i)=>{sizes[scale.count*2+haze.length+i]=s.scale*4.32;});hg.setAttribute('lampHaloScale',new THREE.Float32BufferAttribute(sizes,1));}
  if(haze.length){const flags=new Float32Array(sourceCount);flags.fill(1,p.count*2,p.count*2+haze.length);hg.setAttribute('lampFogHaze',new THREE.Float32BufferAttribute(flags,1));}
  if(cores.length){const flags=new Float32Array(sourceCount);flags.fill(1,p.count*2+haze.length);hg.setAttribute('lampFogCore',new THREE.Float32BufferAttribute(flags,1));}
  const fogBefore=halos.material.onBeforeCompile;
  halos.material.onBeforeCompile=(shader,renderer)=>{
    fogBefore.call(halos.material,shader,renderer);shader.uniforms.uLampFog=surfaceUniforms.fog;
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nattribute float lampFogHalo;\nvarying float vLampFogHalo;\nuniform float uLampFog;${enhancedFog?'\nvarying float vLampFogDistance;\nvarying float vLampFogMast;':''}${haze.length?'\nattribute float lampFogHaze;\nvarying float vLampFogHaze;':''}${cores.length?'\nattribute float lampFogCore;\nvarying float vLampFogCore;':''}`)
      .replace('gl_PointSize = size;',`vLampFogHalo = lampFogHalo;
${haze.length?'vLampFogHaze = lampFogHaze;':''}${cores.length?'\nvLampFogCore = lampFogCore;':''}
// lamp-fog-size-begin
gl_PointSize = size * mix( 1.0, ${enhancedFog?(optics.fogHaloSpread??9).toFixed(1):'4.2'}, lampFogHalo );
// lamp-fog-size-end`)
      .replace('#include <logdepthbuf_vertex>',`// lamp-fog-screen-begin
${enhancedFog?`vLampFogDistance = length(cameraPosition-(modelMatrix*vec4(position,1.0)).xyz);\nvLampFogMast = ${scale?'step(1.5,lampHaloScale)':'0.0'};`:''}
gl_PointSize = max( gl_PointSize, 16.0 * lampFogHalo * uLampFog${enhancedFog?' * (1.0+1.25*uLampFog)':''} );
// lamp-fog-screen-end
#include <logdepthbuf_vertex>`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying float vLampFogHalo;${enhancedFog?'\nvarying float vLampFogDistance;\nvarying float vLampFogMast;':''}`);
    if(haze.length)shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying float vLampFogHaze;${cores.length?'\nvarying float vLampFogCore;':''}`)
      .replace('#include <map_particle_fragment>',`float hazeSourceAlpha = diffuseColor.a;
#include <map_particle_fragment>
// The volume has its own analytic soft edge; the bright-head texture remains
// on the original and ordinary fog samples.
diffuseColor.a = mix(diffuseColor.a,hazeSourceAlpha,${cores.length?'max(vLampFogHaze,vLampFogCore)':'vLampFogHaze'});`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uLampFog;')
      .replace('#include <opaque_fragment>',`#include <opaque_fragment>
// lamp-fog-begin
gl_FragColor.a *= mix( 1.0, 0.22 * uLampFog, vLampFogHalo );
// lamp-fog-end${enhancedFog?`
// lamp-fog-scatter-begin
// Desaturate only the wider scattered light towards a warm grey, preserving
// the sodium colour. Dense air removes distant sources rather than painting
// fog-coloured sprite rectangles in front of the city.
float scatter = vLampFogHalo*uLampFog;
gl_FragColor.rgb = mix(gl_FragColor.rgb,gl_FragColor.rgb*vec3(1.2,0.85,0.45)+vec3(0.15,0.12,0.08),0.85*scatter);
gl_FragColor.a *= exp(-0.0035*max(0.0,vLampFogDistance-35.0)*uLampFog);
// lamp-fog-scatter-end
// lamp-fog-mast-profile-begin
float mastScatterAlpha = gl_FragColor.a;
// lamp-fog-mast-begin
// Multiple points describe one LED strip. Suppress their overlapping bright
// centres, retaining the warm outer skirt instead of shrinking its diameter.
float mastSkirt = smoothstep(0.15,0.55,2.0*length(gl_PointCoord-vec2(0.5)));
gl_FragColor.a *= mix(1.0,mix(0.10,1.0,mastSkirt),vLampFogMast*vLampFogHalo*uLampFog);
// lamp-fog-mast-end
// A broad skirt needs a filled core: their combined radial response must
// fall from the head, rather than exposing the skirt as a hollow ring.
// Lower both lobes together to bound the overlapping LED-strip peak.
float mastFog = vLampFogMast*vLampFogHalo*uLampFog;
gl_FragColor.a = mix(gl_FragColor.a,0.35*(gl_FragColor.a+0.55*mastScatterAlpha*(1.0-mastSkirt)),mastFog);
gl_FragColor.rgb *= mix(vec3(1.0),vec3(1.1,1.0,0.8),mastFog);
// lamp-fog-mast-profile-end${haze.length?`
// lamp-mast-haze-begin
float hazeRadius = 2.0*length(gl_PointCoord-vec2(0.5));
float hazeProfile = (1.30*exp(-12.0*hazeRadius*hazeRadius)+0.12*exp(-1.45*hazeRadius*hazeRadius))*(1.0-smoothstep(0.85,1.0,hazeRadius));
gl_FragColor.a = mix(gl_FragColor.a,mastScatterAlpha*hazeProfile,vLampFogHaze);
// lamp-mast-haze-end${optics.kxOptics?`
// lamp-kx-haze-begin
float kxHazeProfile = (0.88*exp(-4.7*hazeRadius*hazeRadius)+0.12*exp(-1.1*hazeRadius*hazeRadius))*(1.0-smoothstep(0.85,1.0,hazeRadius));
gl_FragColor.a = mix(gl_FragColor.a,mastScatterAlpha*kxHazeProfile,vLampFogHaze);
gl_FragColor.rgb *= mix(vec3(1.0),vec3(1.3,1.25,0.85),vLampFogHaze);
// Restore only the inner 10–30px energy. The established 60–120px air tail
// and overlapping strip alpha stay bounded; there is no cut-out at the head.
gl_FragColor.rgb *= 1.0+vLampFogHaze*0.22*exp(-90.0*hazeRadius*hazeRadius);
// lamp-kx-haze-end${cores.length?`
// lamp-kx-core-begin
float coreRadius = 2.0*length(gl_PointCoord-vec2(0.5));
float coreProfile = exp(-6.0*coreRadius*coreRadius)*(1.0-smoothstep(0.85,1.0,coreRadius));
float coreFog = smoothstep(0.65,0.9,uLampFog);
gl_FragColor.a = mix(gl_FragColor.a,0.16*mastScatterAlpha*coreFog*coreProfile,vLampFogCore);
// lamp-kx-core-end`:''}`:''}`:''}`:''}`);
  };
  halos.material.customProgramCacheKey=()=> (scale?'lamp-fog-scattering-strip':'lamp-fog-scattering')+(enhancedFog?`-wide-${optics.fogHaloSpread??9}`:'')+(haze.length?'-mast-haze':'')+(optics.kxOptics?'-kx':'')+(optics.lightFog?'-source':'');
  return {group,triangles:indices.length*geometry.index!.count/3,draws:Number(indices.length>0),
    setLevel(level:number){material.opacity=level;reflections.visible=level>.01&&surfaceUniforms.wet.value>.45&&(!optics.suppressSnow||surfaceUniforms.snowCover.value<.20);},
    dispose(){reflections.dispose();geometry.dispose();material.dispose();group.removeFromParent();}};
}
