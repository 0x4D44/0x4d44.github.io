// Opt-in lamp reflections and fog scattering. Perth uses them; the other
// stations retain the shared street lights' original draws and materials.
import * as THREE from 'three';
import { surfaceUniforms } from './atmosphere.ts';
import { COVER_GLSL, coverUniforms } from './cover.ts';

/** Fade light away rather than blending in a fog-coloured rectangle. */
export function fadeLightInFog(material: THREE.Material, alpha = false): void {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace(
      'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );', alpha ? 'gl_FragColor.a *= 1.0 - fogFactor;' : 'gl_FragColor.rgb *= 1.0 - fogFactor;'));
  };
  material.customProgramCacheKey = () => alpha ? 'street-lamp-fog-alpha' : 'street-lamp-fog-fade';
}

/** One reflection per selected nearby source, laid onto its own ground plane. Its centre is
 * the eye's ray to the head mirrored below that plane: it follows the eye,
 * slopes with the paving, and projects below its source as a wet reflection.
 * The narrow cross-section and soft length suggest rough wet paving rather
 * than a second diffuse light pool. No real lights or frame-time raycasts. */
export function createLampWeather(pools: THREE.InstancedMesh, heads: readonly number[], halos: THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>,
  floor: {map:THREE.Texture;rect:THREE.Vector4}|undefined, indices: readonly number[]) {
  const group=new THREE.Group();group.name='street-lamp-weather';
  const geometry=pools.geometry.clone();
  geometry.setAttribute('reflectionHead',new THREE.InstancedBufferAttribute(new Float32Array(indices.flatMap(i=>heads.slice(i*3,i*3+3))),3));
  const floorWeights=pools.geometry.getAttribute('poolFloorWeight');
  geometry.setAttribute('poolFloorWeight',new THREE.InstancedBufferAttribute(new Float32Array(indices.map(i=>floorWeights.getX(i))),1));
  const material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,toneMapped:false,fog:true,
    polygonOffset:true,polygonOffsetFactor:-7,polygonOffsetUnits:-7});
  fadeLightInFog(material,true);
  const before=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    before.call(material,shader,renderer);
    Object.assign(shader.uniforms,coverUniforms,{uLampWet:surfaceUniforms.wet});
    if(floor)Object.assign(shader.uniforms,{uReflectionFloor:{value:floor.map},uReflectionRect:{value:floor.rect}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
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
vec3 reflectionCentre;
// reflection-project-begin
vec3 mirrorHead = lampHead - 2.0 * dot( lampHead - lampBase, lampNormal ) * lampNormal;
vec3 mirrorRay = mirrorHead - cameraPosition;
float mirrorT = dot( lampBase - cameraPosition, lampNormal ) / min( -0.001, dot( mirrorRay, lampNormal ) );
reflectionCentre = cameraPosition + clamp( mirrorT, 0.0, 1.0 ) * mirrorRay;
float reflectionValid = ( dot( cameraPosition - lampBase, lampNormal ) > 0.0 && mirrorT > 0.0 && mirrorT < 1.0 ) ? 1.0 : 0.0;
// reflection-project-end
vReflectionValid = reflectionValid;
vec3 along = cameraPosition - reflectionCentre;
along -= lampNormal * dot( along, lampNormal );
along = normalize( along + vec3( 0.00001, 0.0, 0.00001 ) );
vec3 across = normalize( vec3( lampNormal.y * along.z - lampNormal.z * along.y, lampNormal.z * along.x - lampNormal.x * along.z, lampNormal.x * along.y - lampNormal.y * along.x ) );
float lampHeight = max( 1.0, dot( lampHead - lampBase, lampNormal ) );
float streakLength = min( 12.0, 1.5 + 0.8 * lampHeight + 0.08 * length( cameraPosition - reflectionCentre ) );
vReflectionUv = position.xz * 2.0;
vReflectionFloor = poolFloorWeight;
vReflectionWorld = reflectionCentre + across * position.x * ( 0.45 + 0.05 * lampHeight ) + along * position.z * streakLength;
vec4 mvPosition = viewMatrix * vec4( vReflectionWorld, 1.0 );
gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec2 vReflectionUv;
varying vec3 vReflectionWorld;
varying float vReflectionFloor;
varying float vReflectionValid;
uniform float uLampWet;
${COVER_GLSL}
${floor?'uniform sampler2D uReflectionFloor;\nuniform vec4 uReflectionRect;':''}`)
      .replace('#include <opaque_fragment>',`#include <opaque_fragment>
float reflectionOpen = 1.0 - coverGroundAt( vReflectionWorld );
${floor?'reflectionOpen *= mix( 1.0, texture2D( uReflectionFloor, ( vReflectionWorld.xz - uReflectionRect.xy ) * uReflectionRect.zw ).r, vReflectionFloor );':''}
gl_FragColor.a *= vReflectionValid;
// reflection-alpha-begin
// Three longitudinal Gaussian taps give a continuous, slightly blurred streak.
float blurY0 = vReflectionUv.y - 0.12;
float blurY1 = vReflectionUv.y + 0.12;
float streakY = 0.5 * exp( -2.5 * vReflectionUv.y * vReflectionUv.y ) + 0.25 * exp( -2.5 * blurY0 * blurY0 ) + 0.25 * exp( -2.5 * blurY1 * blurY1 );
float streak = exp( -10.0 * vReflectionUv.x * vReflectionUv.x ) * streakY;
gl_FragColor.a *= 0.8 * smoothstep( 0.45, 0.85, uLampWet ) * reflectionOpen * streak;
// reflection-alpha-end`);
  };
  material.customProgramCacheKey=()=>`lamp-wet-reflection-${!!floor}`;
  const reflections=new THREE.InstancedMesh(geometry,material,indices.length);
  const matrix=new THREE.Matrix4(),colour=new THREE.Color();
  indices.forEach((source,i)=>{pools.getMatrixAt(source,matrix);reflections.setMatrixAt(i,matrix);if(pools.instanceColor){pools.getColorAt(source,colour);reflections.setColorAt(i,colour.multiplyScalar(2.5));}});
  reflections.name='street-lamp-reflections';reflections.raycast=()=>{};reflections.frustumCulled=false;reflections.renderOrder=4.1;reflections.visible=false;
  if(indices.length)group.add(reflections);

  // The original head and its larger scattering sprite share one Points draw.
  // Core sprites retain their original position attribute and white intensity.
  const hg=halos.geometry,p=hg.getAttribute('position'),c=hg.getAttribute('color'),fogFlags=new Float32Array(p.count*2);
  const positions=new Float32Array(p.count*6),colors=new Float32Array(p.count*6);
  positions.set(p.array);positions.set(p.array,p.count*3);colors.set(c.array);colors.set(c.array,p.count*3);fogFlags.fill(1,p.count);
  hg.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));hg.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));hg.setAttribute('lampFogHalo',new THREE.Float32BufferAttribute(fogFlags,1));
  const fogBefore=halos.material.onBeforeCompile;
  halos.material.onBeforeCompile=(shader,renderer)=>{
    fogBefore.call(halos.material,shader,renderer);shader.uniforms.uLampFog=surfaceUniforms.fog;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float lampFogHalo;\nvarying float vLampFogHalo;\nuniform float uLampFog;')
      .replace('gl_PointSize = size;',`vLampFogHalo = lampFogHalo;
// lamp-fog-size-begin
gl_PointSize = size * mix( 1.0, 4.2, lampFogHalo );
// lamp-fog-size-end`)
      .replace('#include <logdepthbuf_vertex>',`// lamp-fog-screen-begin
gl_PointSize = max( gl_PointSize, 16.0 * lampFogHalo * uLampFog );
// lamp-fog-screen-end
#include <logdepthbuf_vertex>`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vLampFogHalo;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uLampFog;')
      .replace('#include <opaque_fragment>',`#include <opaque_fragment>
// lamp-fog-begin
gl_FragColor.a *= mix( 1.0, 0.22 * uLampFog, vLampFogHalo );
// lamp-fog-end`);
  };
  halos.material.customProgramCacheKey=()=> 'lamp-fog-scattering';
  return {group,triangles:indices.length*2,draws:Number(indices.length>0),
    setLevel(level:number){material.opacity=level;reflections.visible=level>.01&&surfaceUniforms.wet.value>.45;},
    dispose(){reflections.dispose();geometry.dispose();material.dispose();group.removeFromParent();}};
}
