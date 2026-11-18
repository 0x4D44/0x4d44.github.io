// Waverley's own luminous glazing and architectural floodlights. Existing
// geometry/materials only: no ambient raise, extra triangles or floodlit bridge.
import * as THREE from 'three';
import { surfaceUniforms } from './atmosphere.ts';
import type { WallGrid } from './materials.ts';
import type { NightLayer } from './night.ts';
import { BALMORAL_LEVELS } from './waverley-frontage-balmoral.ts';

/** The wall UV is in metres and the stone facade map repeats every 3 by 3.6 m. */
export const WAVERLEY_WALL_TILE = [3, 3.6] as const;
export const WAVERLEY_WALL_WINDOWS = {
  cell: WAVERLEY_WALL_TILE,
  profile: {
    key: 'waverley',
    light: 'waverleyWindowLight( wv, ww, vWallWindowData, length( vViewPosition ), uWinNight )',
    fragment: /* glsl */`
vec3 waverleyWindowLight( vec2 uv, vec2 span, vec2 building, float distanceM, float night ) {
  vec2 cell = floor( uv );
  vec2 f = uv - cell;
  float seed = building.x;
  float office = building.y;
  float farWall = smoothstep( 140.0, 460.0, distanceM );
  float floorUse = winHash( vec2( 0.0, cell.y ), seed, 2.0 );
  float homeShare = 0.21 + 0.10 * fract( seed * 3.71 + 0.29 );
  // Occupied office floors are mostly on, with rooms still out on every floor.
  float share = mix( homeShare, mix( 0.22, 0.83, step( 0.38, floorUse ) ), office );
  float cool = mix( 0.36, 0.83, office );
  vec4 h = vec4( winHash( cell, seed, 1.0 ), 1.0, winHash( cell, seed, 3.0 ), winHash( cell, seed, 4.0 ) );
  float size = winHash( cell, seed, 5.0 );
  vec2 halfSize = mix( vec2( 0.15, 0.27 ), vec2( 0.085, 0.13 ), farWall ) * mix( 0.75, 1.06, size );
  halfSize *= mix( 1.0, 0.90, office );
  vec4 rect = vec4( 0.5 - halfSize.x, 0.5 + halfSize.x, 0.56 - halfSize.y, 0.56 + halfSize.y );
  float gain = mix( 0.51 - 0.24 * farWall, 0.55 - 0.22 * farWall, office );
  float farPixel = smoothstep( 0.28, 0.64, max( span.x, span.y ) );
  vec3 pane = winLight( h, night, share, 0.0, cool ) * winPane( f, rect, span * 0.5 ) * winRoom( f.y, rect );
  // Carry the average area and occupancy when an entire bay is subpixel.
  vec3 average = winMean( night, mix( homeShare, 0.60, office ), 0.0, cool ) * ( 4.0 * halfSize.x * halfSize.y );
  return gain * mix( pane, average, farPixel );
}
`,
  },
} as const satisfies WallGrid;

export function createWaverleyGlow(scene: THREE.Object3D): NightLayer & {dispose():void} {
  const level = {value:0}, undo: (()=>void)[] = [];
  const hotel = scene.getObjectByName('waverley-balmoral-facade');
  const box = hotel ? new THREE.Box3().setFromObject(hotel) : new THREE.Box3();
  // The tower and the protruding corner domes extend beyond the body facade.
  // A body-only selector lit pinnacle tips but rejected the built ogee bell.
  const tower = scene.getObjectByName('waverley-balmoral-tower');
  const towerBox = new THREE.Box3();
  if(tower)box.union(towerBox.setFromObject(tower));
  const patch = (name:string, colour: readonly number[], select = '1.0', snow = false, extra='', ambient=false):void => {
    const mesh = scene.getObjectByName(name) as THREE.Mesh | undefined;
    const m = mesh?.material as THREE.MeshLambertMaterial | undefined;
    if (!m?.isMeshLambertMaterial) return;
    const before = m.onBeforeCompile, key = m.customProgramCacheKey;
    m.onBeforeCompile = (shader,renderer) => {
      before.call(m,shader,renderer);
      shader.uniforms.uStationLampLevel = level;
      shader.uniforms.uStationLampSnow = surfaceUniforms.snowCover;
      shader.vertexShader = shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStationLampWorld;\nvarying vec3 vStationLampNormal;')
        .replace('#include <project_vertex>','#include <project_vertex>\nvStationLampWorld = (modelMatrix * vec4(transformed,1.0)).xyz;\nvStationLampNormal = normalize(mat3(modelMatrix)*objectNormal);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uStationLampLevel;\nuniform float uStationLampSnow;\nvarying vec3 vStationLampWorld;\nvarying vec3 vStationLampNormal;')
        .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
// station-light-begin: glowing glazing follows its cassette bars, never the opaque snow.
totalEmissiveRadiance += uStationLampLevel * vec3(${colour.join(',')}) * diffuseColor.rgb * (${select})${snow ? ' * (1.0 - uStationLampSnow)' : ''};
// station-light-end
${extra}`);
      if(ambient)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
// station-platform-ambient-begin
reflectedLight.indirectDiffuse *= mix(1.0,0.15,uStationLampLevel);
reflectedLight.directDiffuse *= mix(1.0,0.45,uStationLampLevel);
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
  const scott = scene.getObjectByName('waverley-scott-monument');
  if (scott) {
    const foot = new THREE.Box3().setFromObject(scott).min.y.toFixed(3);
    patch(scott.name,[0,0,0],'1.0',false,`
// scott-monument-wash-begin
float scottHeight = max(0.0,vStationLampWorld.y-${foot});
float scottSpire = smoothstep(25.0,34.0,scottHeight);
float scottGain = 0.43+0.32*exp(-scottHeight/30.0)+0.19*scottSpire;
float scottFace = 0.65+0.35*abs(dot(normalize(vStationLampNormal),normalize(vec3(0.55,0.25,-0.8))));
totalEmissiveRadiance += uStationLampLevel*vec3(1.0,0.68,0.34)*diffuseColor.rgb*scottGain*scottFace;
// scott-monument-wash-end`);
  }
  // The mapped Castle walls span x -756..-524 and z 274..444 m. Wash the
  // summit masonry and upper batteries, with less spill on slates and no crag light.
  for (const name of ['waverley-city-monuments', 'waverley-building-walls', 'waverley-building-ashlar', 'waverley-building-tops']) {
    patch(name,[0,0,0],'1.0',false,`
// castle-wash-begin
float castleX = smoothstep(-760.0,-752.0,vStationLampWorld.x)*(1.0-smoothstep(-532.0,-520.0,vStationLampWorld.x));
float castleZ = smoothstep(270.0,278.0,vStationLampWorld.z)*(1.0-smoothstep(440.0,448.0,vStationLampWorld.z));
float castleHeight = smoothstep(55.0,74.0,vStationLampWorld.y);
vec3 castleNormal = normalize(vStationLampNormal);
float castleFace = (1.0-0.85*abs(castleNormal.y))*(0.55+0.45*abs(dot(castleNormal,normalize(vec3(0.65,0.1,-0.75)))));
totalEmissiveRadiance += uStationLampLevel*vec3(0.87,0.97,1.0)*diffuseColor.rgb*(0.68*castleX*castleZ*castleHeight*castleFace);
// castle-wash-end`);
  }
  // Only this platform's sky contribution falls at night. Pendants, train
  // headlamps and daytime materials retain their own light, with no rig change.
  patch('waverley-platform-surfaces',[0,0,0],'1.0',false,'',true);
  if (!box.isEmpty()) {
    // The hotel cornices share a batch with bridges. Restrict by the hotel's
    // own bounds and upper storeys so no bridge rib receives invented light.
    const p = 'vStationLampWorld';
    const bounds = (area:THREE.Box3,pad:number) => `step(${(area.min.x-pad).toFixed(3)},${p}.x)*step(${p}.x,${(area.max.x+pad).toFixed(3)})*step(${(area.min.z-pad).toFixed(3)},${p}.z)*step(${p}.z,${(area.max.z+pad).toFixed(3)})`;
    const within = bounds(box,5);
    const base=scene.getObjectByName('waverley-frontage')?.userData.frontage?.P??box.max.y-BALMORAL_LEVELS.cornice;
    const height=`(${p}.y-${base.toFixed(3)})`;
    const corners=scene.getObjectByName('waverley-frontage')?.userData.frontage?.hotel?.corners as {west:readonly number[];ne:readonly number[]}|undefined;
    const roofZone=corners?`smoothstep(3.0,4.0,length(${p}.xz-vec2(${corners.ne.join(',')})))*smoothstep(4.0,5.0,length(${p}.xz-vec2(${corners.west.join(',')})))`:'0.0';
    // Wash the shaft from the cornice and the dial stage from its corbel
    // table. The texture keeps the arched windows dark in both light bands.
    const towerWash = `
// balmoral-tower-wash-begin
float towerHeight = ${height};
float towerShaft = smoothstep(25.4,27.0,towerHeight)*exp(-max(0.0,towerHeight-27.0)/13.0);
float towerStage = smoothstep(39.4,41.0,towerHeight)*exp(-max(0.0,towerHeight-41.0)/12.0);
float towerFacing = 0.70+0.30*abs(dot(normalize(vStationLampNormal),normalize(vec3(0.55,0.25,-0.8))));
float towerBeam = (0.56*towerShaft + 0.40*towerStage)*(1.0-smoothstep(48.8,51.0,towerHeight));
totalEmissiveRadiance += uStationLampLevel*vec3(1.0,0.68,0.34)*diffuseColor.rgb*(towerFacing*towerBeam);
// balmoral-tower-wash-end`;
    if (tower) patch(tower.name,[0,0,0],'1.0',false,towerWash);
    patch('waverley-balmoral-facade',[0,0,0],'1.0',false,`
// balmoral-facade-wash-begin
float facadeWashHeight = max(0.0,${height});
float facadeBay = floor((vStationLampWorld.x+vStationLampWorld.z)/4.2);
float facadeBayNoise = fract(sin(facadeBay*12.9898+78.233)*43758.5453);
float facadeBayGain = 0.74+0.26*facadeBayNoise;
float facadeWash = 0.07*(0.12+0.88*exp(-facadeWashHeight/14.0))*facadeBayGain;
totalEmissiveRadiance += uStationLampLevel*diffuseColor.rgb*vec3(1.0,0.62,0.32)*facadeWash;
// balmoral-facade-wash-end
// balmoral-bands-begin
float hotelHeight = ${height};
float balconyBeam = 0.36*smoothstep(8.3,8.7,hotelHeight)*exp(-max(0.0,hotelHeight-8.7)/1.3);
float corniceBeam = 0.45*smoothstep(23.2,23.6,hotelHeight)*exp(-max(0.0,hotelHeight-24.7)/2.5);
totalEmissiveRadiance += uStationLampLevel*diffuseColor.rgb*vec3(1.0,0.57,0.20)*(balconyBeam+corniceBeam);
// balmoral-bands-end`);
    // Cornices and lead domes share a material with bridge ribs and the hands.
    // Select by hotel bounds/height. The minimum lit response stops the dark
    // lead vertex tint becoming a smudge through the turret's floodlight.
    patch('waverley-frontage-structure',[0,0,0],'1.0',false,`
// balmoral-trim-begin
float trimHeight = ${height};
float trimZone = (${within})*smoothstep(8.0,8.5,trimHeight)*(1.0-smoothstep(50.8,51.6,trimHeight));
// Lamps at the cornice, lower cap shoulder and upper bell make separate
// upward washes. Their short falloffs reveal the whole curved cap without
// carrying a uniform orange floor over its height. Heights follow the built
// corner turret: shaft to 27.5 m, ogee cap to 30.9 m above the street.
float trimBeam = 0.025+0.65*smoothstep(23.5,24.7,trimHeight)*exp(-max(0.0,trimHeight-24.7)/1.4);
trimBeam += 0.95*smoothstep(27.3,27.55,trimHeight)*exp(-max(0.0,trimHeight-27.55)/0.85);
trimBeam += 0.42*smoothstep(30.2,30.35,trimHeight)*exp(-max(0.0,trimHeight-30.35)/0.55);
// A separate wash on the high gables and chimney copes keeps their stone
// gold under the neutral sky fill, without lifting the corner-cap shadows.
trimBeam += 0.30*smoothstep(34.5,35.5,trimHeight)*exp(-max(0.0,trimHeight-35.5)/5.0);
// The dormers, gables and stacks have one continuous cornice uplight.
// Their built bases start below the old 35 m wash; lighting only above it
// put a dark waist below bright chimney copes. Corner domes retain their
// own shoulder/bell optics, using the same centres as their built geometry.
float roofBeam = 0.025+0.90*smoothstep(24.7,25.5,trimHeight)*exp(-max(0.0,trimHeight-25.5)/10.0);
trimBeam = mix(trimBeam,roofBeam,(${roofZone})*(1.0-smoothstep(39.5,40.0,trimHeight)));
float trimFacing = 0.50+0.50*abs(dot(normalize(vStationLampNormal),normalize(vec3(0.8,0.6,0.2))));
vec3 trimRadiance = vec3(0.95,0.39,0.085)*max(diffuseColor.rgb,vec3(0.5))*trimZone*trimBeam*trimFacing;
// Camera probes hit the vertical cornice, the turret shaft and sloped bell,
// not just the upward-facing roof samples. Keep the proven BASE envelope
// on these faces when a short beam or the dome mask would leave a dark band.
float baseCapBeam = 0.10+0.65*smoothstep(23.5,24.7,trimHeight)*exp(-max(0.0,trimHeight-25.5)/8.0);
baseCapBeam += 0.50*exp(-8.0*(trimHeight-27.8)*(trimHeight-27.8))+0.40*exp(-8.0*(trimHeight-30.8)*(trimHeight-30.8));
vec3 baseCapRadiance = vec3(0.95,0.39,0.085)*max(diffuseColor.rgb,vec3(0.5))*trimZone*baseCapBeam*trimFacing;
float capFaces = (1.0-smoothstep(0.65,0.95,normalize(vStationLampNormal).y))*smoothstep(19.0,20.0,trimHeight)*(1.0-smoothstep(39.5,40.0,trimHeight));
trimRadiance = mix(trimRadiance,max(trimRadiance,max(baseCapRadiance,vec3(0.105,0.0431,0.0094)*trimZone)),capFaces);
totalEmissiveRadiance += uStationLampLevel*trimRadiance;
// balmoral-trim-end
${towerBox.isEmpty() ? '' : `
if ((${bounds(towerBox,2)}) > 0.0 && trimHeight >= 39.4) {
${towerWash}
}`}
// balmoral-crown-begin
float crown = (${within})*smoothstep(${(base+49.2).toFixed(3)},${(base+51.0).toFixed(3)},vStationLampWorld.y);
totalEmissiveRadiance += uStationLampLevel*vec3(0.62,0.07,0.38)*crown;
// balmoral-crown-end`);
  }
  return {setLevel(next){level.value=Math.max(0,Math.min(1,next));},dispose(){undo.reverse().forEach(fn=>fn());}};
}
