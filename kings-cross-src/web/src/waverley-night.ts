// Waverley's own luminous glazing and architectural floodlights. Existing
// geometry and materials only.
import * as THREE from 'three';
import { surfaceUniforms } from './atmosphere.ts';
import type { WallGrid } from './materials.ts';
import type { NightLayer } from './night.ts';
import { BALMORAL_LEVELS } from './waverley-frontage-balmoral.ts';
import { NORTH_BRIDGE } from './waverley-frontage-bridges.ts';

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
  float office = min(1.0, building.y);
  float slitBlock = step(1.5, building.y);
  float farWall = smoothstep( 140.0, 460.0, distanceM );
  float floorUse = winHash( vec2( 0.0, cell.y ), seed, 2.0 );
  float homeShare = 0.21 + 0.10 * fract( seed * 3.71 + 0.29 );
  // Occupied office floors are mostly on, with rooms still out on every floor.
  float share = mix( homeShare, mix( 0.22, 0.83, step( 0.38, floorUse ) ), office );
  float cool = mix( 0.36, 0.83, office );
  // Rooms in the east frontage switch independently, with only a weak floor bias.
  share = mix(share, 0.38 + 0.14 * floorUse, slitBlock);
  cool = mix(cool, 0.58, slitBlock);
  vec4 h = vec4( winHash( cell, seed, 1.0 ), 1.0, winHash( cell, seed, 3.0 ), winHash( cell, seed, 4.0 ) );
  float size = winHash( cell, seed, 5.0 );
  vec2 halfSize = mix( vec2( 0.15, 0.27 ), vec2( 0.085, 0.13 ), farWall ) * mix( 0.75, 1.06, size );
  halfSize *= mix( 1.0, 0.90, office );
  halfSize.y *= mix(1.0, 0.72 + 0.28 * size, slitBlock);
  vec4 rect = vec4( 0.5 - halfSize.x, 0.5 + halfSize.x, 0.56 - halfSize.y, 0.56 + halfSize.y );
  float gain = mix( 0.51 - 0.24 * farWall, 0.55 - 0.22 * farWall, office );
  gain *= mix(1.0, 0.56 + 0.36 * h.w, slitBlock);
  float farPixel = smoothstep( 0.28, 0.64, max( span.x, span.y ) );
  vec3 pane = winLight( h, night, share, 0.0, cool ) * winPane( f, rect, span * 0.5 ) * winRoom( f.y, rect );
  // Carry the average area and occupancy when an entire bay is subpixel.
  float meanShare = mix(mix(homeShare, 0.60, office), 0.45, slitBlock);
  vec3 average = winMean( night, meanShare, 0.0, cool ) * ( 4.0 * halfSize.x * halfSize.y );
  return gain * mix( pane, average, farPixel );
}
`,
  },
} as const satisfies WallGrid;

/** Diffuse transmission seen from above the existing enclosed pendant rows. */
function roofLightMap(heads: readonly number[]) {
  const reach = 17;
  const lamps: THREE.Vector2[] = [];
  for (let i = 0; i < heads.length; i += 3) lamps.push(new THREE.Vector2(heads[i],heads[i+2]));
  const bounds = new THREE.Box2().setFromPoints(lamps).expandByScalar(reach+1);
  const x0 = Math.floor(bounds.min.x), z0 = Math.floor(bounds.min.y);
  const width = Math.ceil(bounds.max.x)-x0, depth = Math.ceil(bounds.max.y)-z0;
  const cells = new Uint8Array(width*depth);
  for (const lamp of lamps) {
    for (let z = Math.floor(lamp.y-reach); z < Math.ceil(lamp.y+reach); z++) {
      for (let x = Math.floor(lamp.x-reach); x < Math.ceil(lamp.x+reach); x++) {
        const distance = Math.hypot(x+.5-lamp.x,z+.5-lamp.y)/reach;
        const falloff = Math.max(0,1-distance*distance);
        const gain = falloff*falloff*(.55+.45*falloff*falloff);
        const i = (z-z0)*width+x-x0;
        cells[i] = Math.max(cells[i]!,Math.round(255*gain));
      }
    }
  }
  const map = new THREE.DataTexture(cells,width,depth,THREE.RedFormat);
  map.minFilter = map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return { map, rect: new THREE.Vector4(x0,z0,1/width,1/depth) };
}

export function createWaverleyGlow(scene: THREE.Object3D): NightLayer & {dispose():void} {
  const level = {value:0}, undo: (()=>void)[] = [];
  const nightPrograms: THREE.Material[] = [];
  const hasNight = () => level.value > .003;
  const hotel = scene.getObjectByName('waverley-balmoral-facade');
  const box = hotel ? new THREE.Box3().setFromObject(hotel) : new THREE.Box3();
  // The tower and the protruding corner domes extend beyond the body facade.
  // A body-only selector lit pinnacle tips but rejected the built ogee bell.
  const tower = scene.getObjectByName('waverley-balmoral-tower');
  const towerBox = new THREE.Box3();
  if(tower)box.union(towerBox.setFromObject(tower));
  const patch = (name:string, colour: readonly number[], select = '1.0', snow = false, extra: string | ((night: boolean) => string) = '', ambient=false,
    vertexInput?: { declaration: string; varying: string; assignment: string },
    night?: { code?: string; declarations?: string; uniforms?: Record<string, THREE.IUniform>; afterEmission?: string; fog?: string }):void => {
    const mesh = scene.getObjectByName(name) as THREE.Mesh | undefined;
    const m = mesh?.material as THREE.MeshLambertMaterial | undefined;
    if (!m?.isMeshLambertMaterial) return;
    const before = m.onBeforeCompile, key = m.customProgramCacheKey;
    const hasVariant = !!night || typeof extra === 'function';
    m.onBeforeCompile = (shader,renderer) => {
      before.call(m,shader,renderer);
      shader.uniforms.uStationLampLevel = level;
      shader.uniforms.uStationLampSnow = surfaceUniforms.snowCover;
      shader.uniforms.uStationLampFog = surfaceUniforms.fog;
      const lit = hasNight(), effect = lit ? night : undefined;
      if (effect?.uniforms) Object.assign(shader.uniforms,effect.uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStationLampWorld;\nvarying vec3 vStationLampNormal;')
        .replace('#include <project_vertex>','#include <project_vertex>\nvStationLampWorld = (modelMatrix * vec4(transformed,1.0)).xyz;\nvStationLampNormal = normalize(mat3(modelMatrix)*objectNormal);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uStationLampLevel;\nuniform float uStationLampSnow;\nuniform float uStationLampFog;\nvarying vec3 vStationLampWorld;\nvarying vec3 vStationLampNormal;')
        .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
// station-light-begin: glowing glazing follows its cassette bars, never the opaque snow.
totalEmissiveRadiance += uStationLampLevel * vec3(${colour.join(',')}) * diffuseColor.rgb * (${select})${snow ? ' * (1.0 - uStationLampSnow)' : ''};
// station-light-end
${typeof extra === 'function' ? extra(lit) : extra}${effect?.code ? '\n'+effect.code : ''}`);
      if (effect?.declarations) shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>',`#include <common>\n${effect.declarations}`);
      // The previous hook inserts the window light after emissivemap_fragment.
      if (effect?.afterEmission) shader.fragmentShader = shader.fragmentShader
        .replace('#include <lights_lambert_fragment>', `${effect.afterEmission}\n#include <lights_lambert_fragment>`);
      // The skyline hook may have expanded fog_fragment. This next chunk is
      // still present and the colour it receives has already passed through fog.
      if (effect?.fog) shader.fragmentShader = shader.fragmentShader
        .replace('#include <premultiplied_alpha_fragment>', `#if defined( USE_FOG ) && !defined( FOG_EXP2 )\n${effect.fog}\n#endif\n#include <premultiplied_alpha_fragment>`);
      if (vertexInput) {
        const {declaration,varying,assignment} = vertexInput;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${declaration}\n${varying}`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>\n${assignment}`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${varying}`);
      }
      if(ambient)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
// station-platform-ambient-begin
reflectedLight.indirectDiffuse *= mix(1.0,0.15,uStationLampLevel);
reflectedLight.directDiffuse *= mix(1.0,0.45,uStationLampLevel);
// station-platform-ambient-end`);
    };
    m.customProgramCacheKey = () => key.call(m) + '-station-night-' + name + (hasVariant && hasNight() ? '-uplight' : '');
    if (hasVariant) nightPrograms.push(m);
    m.needsUpdate=true;
    undo.push(()=>{m.onBeforeCompile=before;m.customProgramCacheKey=key;m.needsUpdate=true;});
  };
  const heads = scene.getObjectByName('waverley-roof')?.userData.platformLampHeads as number[] | undefined;
  const roofLight = heads?.length ? roofLightMap(heads) : undefined;
  if (roofLight) undo.push(() => roofLight.map.dispose());
  // The top cassettes use the same geometry and map in both programs. Only
  // the glazed slopes above the interior acquire the transmitted light.
  patch('waverley-mapped-roofs',[.11,.17,.24],'1.0',true,'',false,undefined,roofLight && {
    uniforms: {uWaverleyRoofLight:{value:roofLight.map}, uWaverleyRoofRect:{value:roofLight.rect}},
    declarations: 'uniform sampler2D uWaverleyRoofLight;\nuniform vec4 uWaverleyRoofRect;',
    code: `
// waverley-roof-transmission-begin
vec2 roofLightUv = (vStationLampWorld.xz-uWaverleyRoofRect.xy)*uWaverleyRoofRect.zw;
if (abs(vStationLampNormal.x) > 0.10 && uStationLampSnow < 1.0) {
  float cassetteTransmission = 1.0;
#ifdef USE_MAP
  // Backlit bars occlude the glow, including the mixed texels along the edges.
  float cassetteLuma = dot(sampledDiffuseColor.rgb,vec3(0.2126,0.7152,0.0722));
  float cassetteFrame = smoothstep(0.245,0.46,cassetteLuma);
  cassetteTransmission = 1.0-cassetteFrame;
  float barShade = 1.0-0.72*cassetteFrame*uStationLampLevel*(1.0-uStationLampSnow);
  diffuseColor.rgb *= barShade;
  totalEmissiveRadiance *= barShade;
#endif
  float interiorLight = texture2D(uWaverleyRoofLight,roofLightUv).r;
  float pendantGlint = 0.20*smoothstep(0.57,0.92,interiorLight);
  totalEmissiveRadiance += uStationLampLevel*vec3(0.93,0.99,1.0)
    *(0.022+0.32*interiorLight+pendantGlint)*cassetteTransmission*(1.0-uStationLampSnow);
}
// waverley-roof-transmission-end`,
    fog: `
// waverley-roof-fog-begin
if (abs(vStationLampNormal.x) > 0.10) {
  float roofFog = smoothstep(0.65,0.90,uStationLampFog)*smoothstep(12.0,85.0,vFogDepth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb,fogColor,0.45*roofFog);
}
// waverley-roof-fog-end`,
  });
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
  // The mapped Castle walls span x -756..-524 and z 274..444 m. Light the
  // summit from the north-east with a softer fill on returns.
  for (const name of ['waverley-city-monuments', 'waverley-building-walls', 'waverley-building-ashlar', 'waverley-building-tops']) {
    patch(name,[0,0,0],'1.0',false,`
// castle-wash-begin
float castleX = smoothstep(-760.0,-752.0,vStationLampWorld.x)*(1.0-smoothstep(-532.0,-520.0,vStationLampWorld.x));
float castleZ = smoothstep(270.0,278.0,vStationLampWorld.z)*(1.0-smoothstep(440.0,448.0,vStationLampWorld.z));
float castleZone = castleX*castleZ*smoothstep(55.0,74.0,vStationLampWorld.y);
if (castleZone > 0.0 && uStationLampLevel > 0.0) {
  vec3 castleNormal = normalize(vStationLampNormal);
  float castleFacing = max(0.0,dot(castleNormal,normalize(vec3(0.65,-0.16,-0.75))));
  float castleFace = (1.0-0.92*abs(castleNormal.y))*(0.32+0.68*castleFacing);
  float castleAir = 1.0;
#if defined( USE_FOG ) && !defined( FOG_EXP2 )
  // The Calton skyline fog keeps a small fraction of the underlying ridge.
  // Extinguish the wash itself at the scene's dense-fog limit.
  float castleFog = smoothstep(fogNear,fogFar,vFogDepth);
  castleAir -= smoothstep(0.60,0.85,uStationLampFog)*castleFog;
#endif
  totalEmissiveRadiance += uStationLampLevel*vec3(1.0,0.68,0.37)*diffuseColor.rgb*(0.98*castleZone*castleFace*castleAir);
}
// castle-wash-end`,false,undefined,{fog:`
// castle-fog-colour-begin
// At the dense-fog limit the lit masonry meets the fog colour. The rest of
// the ridge can keep its silhouette from the skyline fog hook.
float castleVeil = castleZone*smoothstep(0.60,0.85,uStationLampFog)*smoothstep(fogNear,fogFar,vFogDepth);
gl_FragColor.rgb = mix(gl_FragColor.rgb,fogColor,castleVeil);
// castle-fog-colour-end`});
  }
  // Only this platform's sky contribution falls at night. Pendants, train
  // headlamps and daytime materials retain their own light, with no rig change.
  patch('waverley-platform-surfaces',[0,0,0],'1.0',false,'',true);
  if (!box.isEmpty()) {
    // The hotel cornices share a batch with bridges. Restrict the hotel wash
    // to the hotel's own bounds and upper storeys.
    const p = 'vStationLampWorld';
    const bounds = (area:THREE.Box3,pad:number) => `step(${(area.min.x-pad).toFixed(3)},${p}.x)*step(${p}.x,${(area.max.x+pad).toFixed(3)})*step(${(area.min.z-pad).toFixed(3)},${p}.z)*step(${p}.z,${(area.max.z+pad).toFixed(3)})`;
    const within = bounds(box,5);
    const base=scene.getObjectByName('waverley-frontage')?.userData.frontage?.P??box.max.y-BALMORAL_LEVELS.cornice;
    const height=`(${p}.y-${base.toFixed(3)})`;
    const corners=scene.getObjectByName('waverley-frontage')?.userData.frontage?.hotel?.corners as {west:readonly number[];ne:readonly number[]}|undefined;
    const roofZone=corners?`smoothstep(3.0,4.0,length(${p}.xz-vec2(${corners.ne.join(',')})))*smoothstep(4.0,5.0,length(${p}.xz-vec2(${corners.west.join(',')})))`:'0.0';
    const towerFog = (zone: string) => `
// balmoral-tower-fog-begin
float towerFogHeight = ${height};
float towerFogAir = smoothstep(0.65,0.90,uStationLampFog)*smoothstep(15.0,110.0,vFogDepth);
float towerVeil = 0.49*towerFogAir*mix(0.38,1.0,smoothstep(25.5,58.0,towerFogHeight));
gl_FragColor.rgb = mix(gl_FragColor.rgb,fogColor,towerVeil*(${zone}));
// balmoral-tower-fog-end`;
    // Wash the shaft from the cornice and the dial stage from its corbel
    // table. The texture keeps the arched windows dark in both light bands.
    const towerWash = (quoin: string) => `
// balmoral-tower-wash-begin
float towerHeight = ${height};
float towerShaft = smoothstep(25.4,27.0,towerHeight)*exp(-max(0.0,towerHeight-27.0)/10.8);
float towerStage = smoothstep(39.4,41.0,towerHeight)*exp(-max(0.0,towerHeight-41.0)/12.0);
float towerFacing = 0.70+0.30*abs(dot(normalize(vStationLampNormal),normalize(vec3(0.55,0.25,-0.8))));
${quoin}
float towerBeam = (0.80*towerShaft*(1.0+0.37*towerQuoin) + 0.34*towerStage)*(1.0-smoothstep(48.8,51.0,towerHeight));
totalEmissiveRadiance += uStationLampLevel*vec3(1.0,0.68,0.34)*diffuseColor.rgb*(towerFacing*towerBeam);
// balmoral-tower-wash-end`;
    if (tower) patch(tower.name,[0,0,0],'1.0',false,towerWash(`
// Match the alternating wide and narrow quoins in balmoralTowerTexture.
float quoinWidth = mix(0.05,0.08,step(0.5,fract(towerHeight)));
float towerQuoin = 1.0-smoothstep(quoinWidth-0.01,quoinWidth,min(vBalmoralTowerU,1.0-vBalmoralTowerU));
`),false,{declaration:'',varying:'varying float vBalmoralTowerU;',assignment:'vBalmoralTowerU = uv.x;'},
      {fog:towerFog('1.0')});
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
// balmoral-bands-end`,false,undefined,{code:`
// balmoral-body-uplight-begin
// Keep the street-level wash, with darker stone between the window sills.
float bodySpread = (0.038+0.19*exp(-max(0.0,hotelHeight)/19.0))*mix(1.08,0.73,smoothstep(5.5,13.0,hotelHeight));
float bodyBalcony = 0.20*smoothstep(8.5,9.1,hotelHeight)*exp(-max(0.0,hotelHeight-9.1)/2.9);
float bodyZone = smoothstep(-2.0,0.75,hotelHeight)*(1.0-smoothstep(22.5,25.5,hotelHeight));
// The facade texture seats the mezzanine and upper windows on these courses.
vec4 sills = (hotelHeight-vec4(5.2,12.95,16.65,20.25))/0.60;
float stringCourses = dot(exp(-sills*sills),vec4(0.11,0.19,0.18,0.13));
float frieze = (hotelHeight-24.25)/0.90;
float friezeBeam = 0.22*exp(-frieze*frieze);
totalEmissiveRadiance += uStationLampLevel*diffuseColor.rgb*vec3(1.18,0.34,0.065)
  *((bodySpread+bodyBalcony+stringCourses)*bodyZone*facadeBayGain+friezeBeam);
// balmoral-body-uplight-end
vec3 balmoralStoneEmission = totalEmissiveRadiance;`,
      afterEmission:`
// balmoral-room-contrast-begin
vec3 roomEmission = totalEmissiveRadiance-balmoralStoneEmission;
float brightestRoomChannel = max(roomEmission.r,max(roomEmission.g,roomEmission.b));
float roomHeadroom = 1.0-smoothstep(0.37,0.70,brightestRoomChannel);
totalEmissiveRadiance += roomEmission*vec3(0.26,0.21,0.13)*roomHeadroom;
// balmoral-room-contrast-end`,
      fog:`
// balmoral-facade-fog-begin
float facadeFog = smoothstep(0.65,0.90,uStationLampFog)*smoothstep(15.0,110.0,vFogDepth);
gl_FragColor.rgb = mix(gl_FragColor.rgb,fogColor,0.186*facadeFog);
// balmoral-facade-fog-end`,
    });
    // Cornices and lead domes share a material with bridge ribs and the hands.
    // Select by hotel bounds/height. The minimum lit response stops the dark
    // lead vertex tint becoming a smudge through the turret's floodlight.
    patch('waverley-frontage-structure',[0,0,0],'1.0',false,lit=>`
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
${lit ? `float corniceFace = smoothstep(23.2,24.1,trimHeight)*(1.0-smoothstep(26.0,27.0,trimHeight));
trimRadiance *= mix(vec3(1.0),vec3(1.43,1.16,0.82),corniceFace);\n` : ''}totalEmissiveRadiance += uStationLampLevel*trimRadiance;
// balmoral-trim-end
${towerBox.isEmpty() ? '' : `
if ((${bounds(towerBox,2)}) > 0.0 && trimHeight >= 39.4) {
${towerWash('float towerQuoin = 0.0;')}
}`}
// balmoral-crown-begin
float crown = (${within})*smoothstep(${(base+49.2).toFixed(3)},${(base+51.0).toFixed(3)},vStationLampWorld.y);
totalEmissiveRadiance += uStationLampLevel*${lit ? 'vec3(0.54,0.018,0.63)' : 'vec3(0.62,0.07,0.38)'}*crown;
// balmoral-crown-end
// north-bridge-wash-begin
if (vNorthBridgeDeck > 0.0 && uStationLampLevel > 0.0) {
  float belowDeck = vNorthBridgeDeck-vStationLampWorld.y;
  vec3 bridgeNormal = normalize(vStationLampNormal);
  float bridgeSide = abs(dot(bridgeNormal,vec3(0.97,0.0,-0.24)));
  float bridgeBay = 0.54 + 0.46*pow(abs(cos((vStationLampWorld.z-21.0)*0.0593)),4.0);
  float streetWash = 0.52*exp(-max(0.0,belowDeck)/4.2)*(0.28+0.72*bridgeSide);
  float archWash = 0.44*exp(-abs(vStationLampWorld.y-${NORTH_BRIDGE.springing.toFixed(1)})/5.2)
    *(0.35+0.65*max(bridgeSide,-bridgeNormal.y));
  totalEmissiveRadiance += uStationLampLevel*vec3(1.0,0.69,0.38)*diffuseColor.rgb*(streetWash+archWash)*bridgeBay;
}
// north-bridge-wash-end`,false,{
      declaration:'attribute float northBridgeDeck;',varying:'varying float vNorthBridgeDeck;',assignment:'vNorthBridgeDeck = northBridgeDeck;',
    },{fog:towerBox.isEmpty() ? undefined : towerFog(`(${bounds(towerBox,2)})*smoothstep(39.4,41.0,trimHeight)`)});
  }
  return {
    setLevel(next) {
      const wasNight = hasNight();
      level.value = Math.max(0,Math.min(1,next));
      // These Waverley-owned materials keep their day programs and sort IDs.
      // Select the alternate program only when this layer is lit.
      if (hasNight() !== wasNight) for (const material of nightPrograms) material.needsUpdate = true;
    },
    dispose(){undo.reverse().forEach(fn=>fn());},
  };
}
