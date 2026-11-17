// Waverley's own luminous glazing and architectural floodlights. Existing
// geometry/materials only: no ambient raise, extra triangles or floodlit bridge.
import * as THREE from 'three';
import { surfaceUniforms } from './atmosphere.ts';
import type { NightLayer } from './night.ts';

export function createWaverleyGlow(scene: THREE.Object3D): NightLayer & {dispose():void} {
  const level = {value:0}, undo: (()=>void)[] = [];
  const hotel = scene.getObjectByName('waverley-balmoral-facade');
  const box = hotel ? new THREE.Box3().setFromObject(hotel) : new THREE.Box3();
  const patch = (name:string, colour: readonly number[], select = '1.0', snow = false):void => {
    const mesh = scene.getObjectByName(name) as THREE.Mesh | undefined;
    const m = mesh?.material as THREE.MeshLambertMaterial | undefined;
    if (!m?.isMeshLambertMaterial) return;
    const before = m.onBeforeCompile, key = m.customProgramCacheKey;
    m.onBeforeCompile = (shader,renderer) => {
      before.call(m,shader,renderer);
      shader.uniforms.uStationLampLevel = level;
      shader.uniforms.uStationLampSnow = surfaceUniforms.snowCover;
      shader.vertexShader = shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStationLampWorld;')
        .replace('#include <project_vertex>','#include <project_vertex>\nvStationLampWorld = (modelMatrix * vec4(transformed,1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uStationLampLevel;\nuniform float uStationLampSnow;\nvarying vec3 vStationLampWorld;')
        .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
// station-light-begin: glowing glazing follows its cassette bars, never the opaque snow.
totalEmissiveRadiance += uStationLampLevel * vec3(${colour.join(',')}) * diffuseColor.rgb * (${select})${snow ? ' * (1.0 - uStationLampSnow)' : ''};
// station-light-end`);
    };
    m.customProgramCacheKey = () => key.call(m) + '-station-night-' + name;
    m.needsUpdate=true;
    undo.push(()=>{m.onBeforeCompile=before;m.customProgramCacheKey=key;m.needsUpdate=true;});
  };
  // ASSUMED intensity, fitted offline for a dim cool luminous roof; opaque
  // cassette bars retain their own pattern. Snow's existing opaque lid wins.
  patch('waverley-mapped-roofs',[.11,.17,.24],'1.0',true);
  patch('waverley-roof-underside',[.08,.12,.18]);
  patch('waverley-scott-monument',[.38,.23,.10]);
  if (!box.isEmpty()) {
    // The hotel cornices share a batch with bridges. Restrict by the hotel's
    // own bounds and upper storeys so no bridge rib receives invented light.
    const p = 'vStationLampWorld';
    const select = `step(${(box.min.x-2).toFixed(3)},${p}.x)*step(${p}.x,${(box.max.x+2).toFixed(3)})*step(${(box.min.z-2).toFixed(3)},${p}.z)*step(${p}.z,${(box.max.z+2).toFixed(3)})*smoothstep(${(box.max.y-5).toFixed(3)},${(box.max.y-1).toFixed(3)},${p}.y)`;
    patch('waverley-frontage-structure',[.65,.31,.10],select);
  }
  return {setLevel(next){level.value=Math.max(0,Math.min(1,next));},dispose(){undo.reverse().forEach(fn=>fn());}};
}
