// CPU execution of the actual patched vertex/fragment bodies, with the same
// bilinear receiver read. It checks projection/coverage; it is not a GPU image.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {lampSurfaceAt} from '../src/lamp-wet-surface.ts';
import {Glsl,Mat,type Env} from './glsl.ts';

export function reflectionProbe(mesh:THREE.InstancedMesh,camera:THREE.PerspectiveCamera,index:number){
  const lib=THREE.ShaderLib.basic!,shader={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};
  (mesh.material as THREE.Material).onBeforeCompile(shader as never,undefined as never);
  const surface={map:shader.uniforms.uLampSurface!.value,rect:shader.uniforms.uLampSurfaceRect!.value,dispose(){}},matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);
  const head=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('reflectionHead'),index),source=mesh.geometry.getAttribute('position'),vertices:number[]=[],uvs:number[]=[],valid:number[]=[];
  let vertex=shader.vertexShader.slice(shader.vertexShader.indexOf('vec3 lampBase ='),shader.vertexShader.indexOf('vec4 mvPosition = viewMatrix * vec4( vReflectionWorld'));
  // The test interpreter handles matrix arithmetic but not bracket indexing.
  for(const [token,offset]of [['[0][0]',0],['[0][1]',1],['[2][1]',9],['[2][2]',10]] as const)vertex=vertex.replaceAll('instanceMatrix'+token,String(matrix.elements[offset]));
  vertex+='\nprobeLength=streakLength; probeCentre=reflectionCentre; probeRun=sourceRun;';
  assert.ok(vertex.includes('reflection-receiver-vertex-end'));
  const receiver=(q:unknown)=>Array.from(lampSurfaceAt(surface,...q as [number,number]));
  let frame:Env|undefined;
  for(let i=0;i<source.count;i++){
    const e:Env={vars:{modelMatrix:new Mat(4,mesh.matrixWorld.toArray()),instanceMatrix:new Mat(4,matrix.toArray()),viewMatrix:new Mat(4,camera.matrixWorldInverse.toArray()),projectionMatrix:new Mat(4,camera.projectionMatrix.toArray()),cameraPosition:camera.position.toArray(),reflectionHead:head.toArray(),position:new THREE.Vector3().fromBufferAttribute(source,i).toArray(),poolFloorWeight:0,uReflectionReach:shader.uniforms.uReflectionReach!.value,reflectionWidth:mesh.geometry.getAttribute('reflectionWidth')?.getX(index)??1,vReflectionValid:0,vReflectionAnchor:[0,0,0],vReflectionUv:[0,0],vReflectionWorld:[0,0,0],vReflectionFloor:0},fns:{lampReceiver:receiver}};
    Object.assign(e.vars,{reflectionRoad:mesh.geometry.getAttribute('reflectionRoad')?[mesh.geometry.getAttribute('reflectionRoad').getX(index),mesh.geometry.getAttribute('reflectionRoad').getY(index)]:[0,0],reflectionTail:mesh.geometry.getAttribute('reflectionTail')?.getX(index)??0,vReflectionTail:0,vReflectionRoad:0,probeLength:0,probeCentre:[0,0,0],probeRun:0});for(let j=0;j<3;j++){const a=mesh.geometry.getAttribute('reflectionRoad'+j);e.vars['reflectionRoad'+j]=a?[a.getX(index),a.getY(index),a.getZ(index)]:[0,0,0];}new Glsl('').run(vertex,e);frame=e;
    vertices.push(...e.vars.vReflectionWorld as number[]);uvs.push(...e.vars.vReflectionUv as number[]);valid.push(Number(e.vars.vReflectionValid));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(mesh.geometry.index!.clone());
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),drawn=new THREE.Mesh(geometry,material);drawn.updateMatrixWorld();
  const fragment=shader.fragmentShader.slice(shader.fragmentShader.indexOf('float reflectionOpen ='),shader.fragmentShader.indexOf('#include <tonemapping_fragment>'));
  const at=(x:number,y:number)=>{
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/640-1,1-y/400),camera);const hit=ray.intersectObject(drawn,false)[0];
    if(!hit)return null;
    const e:Env={vars:{vReflectionUv:hit.uv!.toArray(),vReflectionWorld:hit.point.toArray(),vReflectionAnchor:frame!.vars.vReflectionAnchor!,vReflectionValid:valid[0]!,vReflectionFloor:0,uReflectionReach:shader.uniforms.uReflectionReach!.value,uLampWet:1,uLampSnow:0,gl_FragColor:[1,1,1,1]},fns:{lampReceiver:receiver,coverGroundAt:()=>0}};
    e.vars.vReflectionTail=frame!.vars.vReflectionTail!;e.vars.vReflectionRoad=frame!.vars.vReflectionRoad??0;new Glsl('').run(fragment,e);
    return {alpha:(e.vars.gl_FragColor as number[])[3]!,world:hit.point.toArray(),uv:hit.uv!.toArray(),receiver:receiver(hit.point.toArray().filter((_,i)=>i!==1))};
  };
  return {shader,head,frame:frame!,geometry,at,dispose(){geometry.dispose();material.dispose();}};
}
