// Waverley's own luminous glazing and architectural floodlights. Existing
// geometry/materials only: no ambient raise, extra triangles or floodlit bridge.
import * as THREE from 'three';
import { surfaceUniforms } from './atmosphere.ts';
import type { NightLayer } from './night.ts';
import { BALMORAL_LEVELS } from './waverley-frontage-balmoral.ts';

export function createWaverleyGlow(scene: THREE.Object3D): NightLayer & {dispose():void} {
  const level = {value:0}, undo: (()=>void)[] = [];
  const hotel = scene.getObjectByName('waverley-balmoral-facade');
  const box = hotel ? new THREE.Box3().setFromObject(hotel) : new THREE.Box3();
  const patch = (name:string, colour: readonly number[], select = '1.0', snow = false, extra='', ambient=false):void => {
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
// station-light-end
${extra}`);
      if(ambient)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
// station-platform-ambient-begin
reflectedLight.indirectDiffuse *= mix(1.0,0.25,uStationLampLevel);
// station-platform-ambient-end`);
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
  // Only this platform's sky contribution falls at night. Pendants, train
  // headlamps and daytime materials retain their own light, with no rig change.
  patch('waverley-platform-surfaces',[0,0,0],'1.0',false,'',true);
  if (!box.isEmpty()) {
    // The hotel cornices share a batch with bridges. Restrict by the hotel's
    // own bounds and upper storeys so no bridge rib receives invented light.
    const p = 'vStationLampWorld';
    const within = `step(${(box.min.x-2).toFixed(3)},${p}.x)*step(${p}.x,${(box.max.x+2).toFixed(3)})*step(${(box.min.z-2).toFixed(3)},${p}.z)*step(${p}.z,${(box.max.z+2).toFixed(3)})`;
    const base=scene.getObjectByName('waverley-frontage')?.userData.frontage?.P??box.max.y-BALMORAL_LEVELS.cornice;
    const height=`(${p}.y-${base.toFixed(3)})`;
    patch('waverley-balmoral-facade',[0,0,0],'1.0',false,`
// balmoral-bands-begin
float hotelHeight = ${height};
float balconyBeam = 0.36*smoothstep(8.3,8.7,hotelHeight)*exp(-max(0.0,hotelHeight-8.7)/1.3);
float corniceBeam = 0.45*smoothstep(24.1,24.7,hotelHeight)*exp(-max(0.0,hotelHeight-24.7)/2.5);
totalEmissiveRadiance += uStationLampLevel*diffuseColor.rgb*vec3(1.0,0.57,0.20)*(balconyBeam+corniceBeam);
// balmoral-bands-end`);
    // Cornices and lead domes share a material with bridge ribs and the hands.
    // Select by hotel bounds/height. The minimum lit response stops the dark
    // lead vertex tint becoming a smudge through the turret's floodlight.
    patch('waverley-frontage-structure',[0,0,0],'1.0',false,`
// balmoral-trim-begin
float trimHeight = ${height};
float trimZone = (${within})*smoothstep(8.0,8.5,trimHeight)*(1.0-smoothstep(50.8,51.6,trimHeight));
float trimBeam = 0.12+0.50*smoothstep(23.5,24.7,trimHeight)*exp(-max(0.0,trimHeight-25.5)/8.0);
totalEmissiveRadiance += uStationLampLevel*vec3(0.65,0.31,0.1)*max(diffuseColor.rgb,vec3(0.4))*trimZone*trimBeam;
// balmoral-trim-end
// balmoral-crown-begin
float crown = (${within})*smoothstep(${(base+51.6).toFixed(3)},${(base+52.2).toFixed(3)},vStationLampWorld.y);
totalEmissiveRadiance += uStationLampLevel*vec3(0.62,0.07,0.38)*crown;
// balmoral-crown-end`);
  }
  return {setLevel(next){level.value=Math.max(0,Math.min(1,next));},dispose(){undo.reverse().forEach(fn=>fn());}};
}
