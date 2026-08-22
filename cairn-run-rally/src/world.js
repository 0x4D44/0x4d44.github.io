import { angleLerp, clamp, expSmoothing, hash01, mat4Compose, mat4Identity, mat4Multiply } from './math.js';
import { roadEdgePoint, sampleStage } from './stage.js';
import { color, MeshBuilder } from './renderer.js';

const C = {
  road: color('#817563'), roadAlt: color('#796f5f'), roadPatch: color('#8a7d69'),
  loose: color('#998168'), looseAlt: color('#8f765d'), shoulder: color('#5a513e'), ditch: color('#394637'),
  grass: color('#536347'), grassAlt: color('#48583e'), moor: color('#687052'), farGrass: color('#4a5941'),
  darkGrass: color('#344332'), trunk: color('#4f3929'), pine: color('#274438'), pineLight: color('#365849'),
  birch: color('#d4c6a4'), rock: color('#69685d'), stone: color('#777267'), stoneDark: color('#59574f'),
  post: color('#e8dfca'), red: color('#d74b32'), barrier: color('#ded5bd'), orange: color('#e65c2b'),
  teal: color('#206a70'), tealDark: color('#16474c'), window: color('#1c2e32'), tyre: color('#171a18'),
  metal: color('#a9a99d'), lamp: color('#f2d37e'), shadow: color('#172018'), water: color('#344e55'),
  spectator1: color('#d99b3b'), spectator2: color('#b64d36'), spectator3: color('#426c77'),
  autumn: color('#c96238'), eucalyptus: color('#486953'), redEarth: color('#8f4931'),
  splash: color('#4f95a0'), lantern: color('#e9a84d'), lime: color('#a7ad62')
};
const IDENTITY = mat4Identity();

const DEFAULT_REGION = {
  id: 'kestrel-ridge',
  palette: { sky: '#15241e', terrain: '#536347', road: '#817563' },
  sceneryKit: ['pine', 'birch', 'moor', 'stone-wall', 'quarry', 'bridge', 'finish-gate']
};
const DEFAULT_WEATHER = {
  id: 'ridge-mist', visibilityM: 850, gripScale: .94, precipitation: 'rain', roadWetness: .28,
  wind: .36, timeOfDay: 'dusk'
};
const DEFAULT_CAR = {
  id: 'cairn-r4', silhouette: 'rally-hatch', wheelbaseM: 2.5, trackM: 1.5, wheelRadiusM: .39,
  rideHeightM: .54
};

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp01 = value => clamp(finite(value, 0), 0, 1);

function parseColor(value, fallback) {
  if (Array.isArray(value) && value.length >= 3 && value.every(Number.isFinite)) return value.slice(0, 3).map(channel => clamp(channel, 0, 1));
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return color(value);
  return fallback.slice();
}

function mixColor(a, b, amount) {
  const t = clamp01(amount);
  return a.map((channel, index) => channel + (b[index] - channel) * t);
}

function scaleColor(value, amount) { return value.map(channel => clamp(channel * amount, 0, 1)); }

function visualPalette(region = DEFAULT_REGION, weather = DEFAULT_WEATHER) {
  const source = region?.palette || DEFAULT_REGION.palette;
  const terrain = parseColor(source.terrain, C.grass);
  const road = parseColor(source.road, C.road);
  const sky = parseColor(source.sky, C.farGrass);
  const wet = clamp01(weather?.roadWetness);
  const dampRoad = mixColor(road, scaleColor(road, .68), wet * .32);
  return {
    ...C,
    road: dampRoad,
    roadAlt: mixColor(dampRoad, C.roadAlt, .42),
    roadPatch: mixColor(dampRoad, C.roadPatch, .38),
    loose: mixColor(dampRoad, terrain, .18),
    looseAlt: mixColor(dampRoad, terrain, .28),
    grass: terrain,
    grassAlt: mixColor(terrain, C.grassAlt, .38),
    moor: mixColor(terrain, sky, .18),
    farGrass: mixColor(terrain, sky, .38),
    darkGrass: scaleColor(terrain, .68),
    trunk: mixColor(C.trunk, terrain, .12),
    pine: mixColor(C.pine, terrain, .18),
    pineLight: mixColor(C.pineLight, terrain, .22),
    birch: mixColor(C.birch, terrain, .22),
    water: mixColor(C.water, sky, .35),
    shadow: mixColor(C.shadow, terrain, .08),
    sky
  };
}

function inferRegion(stage, region) {
  if (isObject(region)) return region;
  const kit = new Set([...(stage?.landmarkIds || []), ...(stage?.identityTags || []), ...(stage?.routeIdentity?.tags || [])]);
  return {
    ...DEFAULT_REGION,
    id: stage?.regionId || DEFAULT_REGION.id,
    sceneryKit: [...new Set([...(stage?.landmarkIds || []), ...kit])]
  };
}

function inferWeather(weather) { return isObject(weather) ? { ...DEFAULT_WEATHER, ...weather } : { ...DEFAULT_WEATHER }; }

const CAR_RECIPES = Object.freeze({
  'rally-hatch': Object.freeze({
    frontOverhang: .76, rearOverhang: .82, bodyHeight: .58, roofHeight: 1.43,
    cabinStart: -.78, cabinEnd: 1.06, roofInset: .2, windowHeight: .48,
    trackPadding: .04, spoiler: true, body: '#206a70', dark: '#16474c', accent: '#e65c2b'
  }),
  'compact-hatch': Object.freeze({
    frontOverhang: .62, rearOverhang: .66, bodyHeight: .5, roofHeight: 1.22,
    cabinStart: -.66, cabinEnd: .86, roofInset: .28, windowHeight: .39,
    trackPadding: .03, spoiler: false, body: '#9a633e', dark: '#493943', accent: '#d4bf82'
  }),
  'short-coupe': Object.freeze({
    frontOverhang: .55, rearOverhang: .6, bodyHeight: .48, roofHeight: 1.15,
    cabinStart: -.55, cabinEnd: .68, roofInset: .31, windowHeight: .36,
    trackPadding: .09, spoiler: true, body: '#d2a23c', dark: '#493c27', accent: '#244f61'
  }),
  'classic-coupe': Object.freeze({
    frontOverhang: .82, rearOverhang: .88, bodyHeight: .46, roofHeight: 1.18,
    cabinStart: -.9, cabinEnd: .74, roofInset: .24, windowHeight: .4,
    trackPadding: .02, spoiler: false, body: '#9b3f35', dark: '#342f32', accent: '#e3cc92'
  }),
  'long-sedan': Object.freeze({
    frontOverhang: .88, rearOverhang: .92, bodyHeight: .54, roofHeight: 1.32,
    cabinStart: -.88, cabinEnd: 1.08, roofInset: .22, windowHeight: .43,
    trackPadding: .06, spoiler: true, body: '#376d67', dark: '#263c3e', accent: '#d6a94c'
  }),
  'widebody-special': Object.freeze({
    frontOverhang: .7, rearOverhang: .74, bodyHeight: .47, roofHeight: 1.12,
    cabinStart: -.72, cabinEnd: .78, roofInset: .34, windowHeight: .34,
    trackPadding: .16, spoiler: true, body: '#6c4f91', dark: '#28283b', accent: '#ec7f38'
  })
});

/**
 * Purely plans the car's low-poly proportions. Rendering consumes this shape, so a
 * selected car changes geometry even when no livery colours are authored yet.
 */
export function planCarVisual(car = DEFAULT_CAR) {
  const source = isObject(car) ? car : DEFAULT_CAR;
  const recipe = CAR_RECIPES[source.silhouette] || CAR_RECIPES['rally-hatch'];
  const wheelbase = clamp(finite(source.wheelbaseM, DEFAULT_CAR.wheelbaseM), 1.8, 3.4);
  const track = clamp(finite(source.trackM, DEFAULT_CAR.trackM), 1.15, 2.1);
  const wheelRadius = clamp(finite(source.wheelRadiusM, DEFAULT_CAR.wheelRadiusM), .22, .52);
  const width = clamp(track * 1.22 + recipe.trackPadding, 1.48, 2.32);
  const length = clamp(wheelbase + recipe.frontOverhang + recipe.rearOverhang, 2.8, 4.9);
  const frontAxle = wheelbase * .5;
  const rearAxle = -wheelbase * .5;
  const palette = isObject(source.palette) ? source.palette : (isObject(source.colors) ? source.colors : {});
  const body = parseColor(palette.body ?? recipe.body, color(recipe.body));
  const dark = parseColor(palette.dark ?? palette.trim ?? recipe.dark, color(recipe.dark));
  const accent = parseColor(palette.accent ?? palette.highlight ?? recipe.accent, color(recipe.accent));
  const window = parseColor(palette.window, C.window);
  return Object.freeze({
    id: source.id || DEFAULT_CAR.id,
    silhouette: source.silhouette || 'rally-hatch',
    wheelbase, track, wheelRadius, width, length,
    frontAxle, rearAxle, frontZ: length / 2, rearZ: -length / 2,
    bodyHeight: recipe.bodyHeight, roofHeight: recipe.roofHeight,
    cabinStart: recipe.cabinStart, cabinEnd: recipe.cabinEnd,
    roofInset: recipe.roofInset, windowHeight: recipe.windowHeight,
    spoiler: recipe.spoiler,
    body, dark, accent, window,
    wheelCenterY: .05, bodyCenterY: wheelRadius + .19,
    bodyY: wheelRadius + .19, bumperY: wheelRadius + .08
  });
}

function rangeForSegments(stage, predicate) {
  const ranges = [];
  let cursor = 0;
  for (const segment of stage?.segments || []) {
    const start = finite(segment.start, cursor);
    const end = finite(segment.end, start + finite(segment.lengthM, finite(segment.length, 0)));
    if (predicate(segment)) ranges.push({ start, end, feature: segment.feature || null });
    cursor = end;
  }
  return ranges;
}

function barrierRanges(stage, types) {
  const wanted = new Set(types);
  const values = (stage?.barriers || []).filter(item => wanted.has(item.type));
  if (!values.length) return [];
  const grouped = new Map();
  for (const item of values) {
    const key = item.type;
    const current = grouped.get(key) || { start: item.s, end: item.s, type: key, side: item.side };
    current.start = Math.min(current.start, item.s); current.end = Math.max(current.end, item.s);
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

// Landmark rules are keyed by authored scenery-kit ids, never by stage or
// region ids. A short fallback span keeps a kit visible even when a route
// author describes the feature in prose rather than repeating its kit id in
// every segment name.
const LANDMARK_RULES = Object.freeze({
  savannah: { match: /savannah|grassland/i, fallback: [[.04, .12], [.42, .5], [.72, .8]] },
  acacia: { match: /acacia/i, fallback: [[.16, .24], [.56, .64]] },
  'water-splash': { match: /water splash|creek crossing|water crossing/i, fallback: [[.26, .3], [.62, .66]] },
  washboard: { match: /washboard/i, fallback: [[.1, .16], [.5, .56]] },
  'rift-escarpment': { match: /escarpment|rift/i, fallback: [[.34, .42], [.78, .84]] },
  'finish-gate': { fallback: [[.985, 1]] },
  'cedar-tunnel': { match: /cedar|tunnel/i, fallback: [[.08, .2], [.58, .7]] },
  'retaining-wall': { match: /retaining wall/i, fallback: [[.2, .28], [.7, .76]] },
  'autumn-maple': { match: /autumn|maple/i, fallback: [[.3, .38], [.82, .88]] },
  'mountain-stream': { match: /stream|rain channel|water/i, fallback: [[.24, .3], [.64, .7]] },
  'paper-lantern': { match: /lantern|shrine/i, fallback: [[.42, .47], [.9, .94]] },
  'pass-gate': { match: /pass gate/i, fallback: [[.97, 1]] },
  'sea-cliff': { match: /sea|cliff|coast/i, fallback: [[.1, .2], [.48, .58], [.78, .86]] },
  'village-square': { match: /village/i, fallback: [[.22, .3], [.58, .66]] },
  'stone-retaining-wall': { match: /stone wall|retaining wall/i, fallback: [[.34, .42], [.7, .78]] },
  'olive-grove': { match: /olive|grove/i, fallback: [[.04, .12], [.72, .8]] },
  'safe-crowd-line': { match: /crowd|safe/i, fallback: [[.28, .34], [.86, .91]] },
  'coastal-gate': { match: /coastal gate/i, fallback: [[.97, 1]] },
  eucalyptus: { match: /eucalyptus/i, fallback: [[.06, .14], [.5, .58], [.78, .86]] },
  'red-gravel': { match: /red gravel|loose red|gravel/i, fallback: [[.16, .24], [.62, .7]] },
  'cattle-grid': { match: /cattle grid/i, fallback: [[.3, .32], [.48, .5]] },
  'rough-verge': { match: /rough verge|verge/i, fallback: [[.36, .44], [.7, .78]] },
  'dust-bowl': { match: /dust bowl|dust/i, fallback: [[.2, .3], [.54, .62]] },
  'storm-gate': { match: /storm gate/i, fallback: [[.97, 1]] }
});

function stageLength(stage) {
  const authored = (stage?.segments || []).reduce((sum, segment) => sum + finite(segment?.lengthM, finite(segment?.length, 0)), 0);
  return Math.max(0, finite(stage?.length, authored));
}

function ruleRanges(stage, rule) {
  const matched = rule.match ? rangeForSegments(stage, segment => rule.match.test(String(segment?.name || ''))) : [];
  if (matched.length) return matched;
  const length = stageLength(stage);
  return (rule.fallback || []).map(([start, end]) => ({
    start: length * clamp(start, 0, 1),
    end: length * clamp(end, 0, 1),
    feature: null,
    fallback: true
  }));
}

const LANDMARK_DRAWERS = Object.freeze({
  lake: 'addLakeRange',
  'narrow-forest': 'addForestRange',
  'jump-board': 'addJumpRange',
  'granite-outcrop': 'addOutcropRange',
  quarry: 'addOutcropRange',
  'stone-wall': 'addStoneWall',
  bridge: 'addBridge',
  savannah: 'addSavannahRange',
  acacia: 'addAcaciaRange',
  'water-splash': 'addWaterSplashRange',
  washboard: 'addWashboardRange',
  'rift-escarpment': 'addEscarpmentRange',
  'finish-gate': 'addFinishGateRange',
  'cedar-tunnel': 'addCedarTunnelRange',
  'retaining-wall': 'addStoneWall',
  'autumn-maple': 'addAutumnMapleRange',
  'mountain-stream': 'addStreamRange',
  'paper-lantern': 'addLanternRange',
  'pass-gate': 'addPassGateRange',
  'sea-cliff': 'addSeaCliffRange',
  'village-square': 'addVillageRange',
  'stone-retaining-wall': 'addStoneWall',
  'olive-grove': 'addOliveRange',
  'safe-crowd-line': 'addCrowdRange',
  'coastal-gate': 'addCoastalGateRange',
  eucalyptus: 'addEucalyptusRange',
  'red-gravel': 'addRedGravelRange',
  'cattle-grid': 'addCattleGridRange',
  'rough-verge': 'addRoughVergeRange',
  'dust-bowl': 'addDustBowlRange',
  'storm-gate': 'addStormGateRange'
});

const BARRIER_SIZES = Object.freeze({
  wall: Object.freeze({ x: .7, y: .72, z: 5.25 }),
  'bridge-rail': Object.freeze({ x: .18, y: .84, z: 7.4 }),
  'timber-fence': Object.freeze({ x: .3, y: .72, z: 6.2 }),
  'lake-fence': Object.freeze({ x: .3, y: .72, z: 6.2 }),
  'spruce-rail': Object.freeze({ x: .22, y: .76, z: 7.1 }),
  barrier: Object.freeze({ x: .42, y: .7, z: 1.45 }),
  post: Object.freeze({ x: .16, y: 1.1, z: .16 })
});

function barrierSize(type) {
  const key = String(type || 'post');
  if (BARRIER_SIZES[key]) return BARRIER_SIZES[key];
  if (key.includes('wall')) return BARRIER_SIZES.wall;
  if (key.includes('rail') || key.includes('fence')) return BARRIER_SIZES['timber-fence'];
  if (key.includes('grid')) return BARRIER_SIZES.barrier;
  return BARRIER_SIZES.post;
}

/** Returns the authored barrier positions that receive visible geometry. */
export function planBarrierVisuals(stage) {
  return Object.freeze((stage?.barriers || []).map(barrier => Object.freeze({
    ...barrier,
    visible: true,
    size: Object.freeze({ ...barrierSize(barrier.type) })
  })));
}

export const planVisibleColliders = planBarrierVisuals;

/** Returns procedural hazard positions using the exact stage collider coordinates. */
export function planHazardVisuals(stage) {
  return Object.freeze((stage?.hazards || []).map(hazard => Object.freeze({
    ...hazard,
    visible: true,
    visualRadius: hazard.type === 'rock' ? hazard.radius : hazard.type === 'tree' ? Math.max(.48, hazard.radius) : .16
  })));
}

export function planColliderVisuals(stage) {
  return Object.freeze((stage?.colliders || stage?.hazards || []).map(collider => Object.freeze({
    ...collider,
    visible: true,
    visualRadius: collider.type === 'rock' ? collider.radius : collider.type === 'tree' ? Math.max(.48, collider.radius) : .16
  })));
}

/**
 * Pure, bounded world plan used by RallyWorld. It only reads route metadata and
 * colliders; no region or stage identity is switched on here.
 */
export function planWorldVisuals(stage, region = null, weather = null, quality = 'high') {
  const selectedRegion = inferRegion(stage, region || stage?.region);
  const selectedWeather = inferWeather(weather || stage?.weather);
  const kit = [...new Set([...(selectedRegion.sceneryKit || []), ...(stage?.landmarkIds || [])])];
  const kitSet = new Set(kit);
  const high = quality !== 'low';
  const ranges = [];
  const addRanges = (type, values) => values.forEach(range => ranges.push({ ...range, type }));
  if (kitSet.has('lake')) addRanges('lake', rangeForSegments(stage, segment => segment.feature === 'lakeside' || segment.name?.toLowerCase().includes('lake')));
  if (kitSet.has('narrow-forest')) addRanges('narrow-forest', rangeForSegments(stage, segment => segment.feature === 'narrow' || segment.name?.toLowerCase().includes('forest')));
  if (kitSet.has('jump-board')) addRanges('jump-board', rangeForSegments(stage, segment => segment.feature === 'jump' || segment.feature === 'crest'));
  if (kitSet.has('granite-outcrop')) addRanges('granite-outcrop', rangeForSegments(stage, segment => segment.feature === 'braking' || segment.name?.toLowerCase().includes('rock')));
  if (kitSet.has('quarry')) addRanges('quarry', rangeForSegments(stage, segment => segment.name?.toLowerCase().includes('quarry')));
  if (kitSet.has('stone-wall')) addRanges('stone-wall', barrierRanges(stage, ['wall']));
  if (kitSet.has('bridge')) addRanges('bridge', barrierRanges(stage, ['bridge-rail']));
  for (const [kitId, rule] of Object.entries(LANDMARK_RULES)) {
    if (kitSet.has(kitId)) addRanges(kitId, ruleRanges(stage, rule));
  }
  const landmarkTypes = [...new Set(ranges.map(range => range.type))];
  if (kitSet.has('lake')) landmarkTypes.push('lakeside');
  if (kitSet.has('narrow-forest')) { landmarkTypes.push('narrow-spruce'); landmarkTypes.push('forest'); }
  if (kitSet.has('jump-board')) landmarkTypes.push('jump');
  return Object.freeze({
    quality: high ? 'high' : 'low',
    kit: Object.freeze(kit),
    ranges: Object.freeze(ranges.map(range => Object.freeze({ ...range }))),
    landmarks: Object.freeze([...new Set(landmarkTypes)]),
    barrierTypes: Object.freeze([...new Set((stage?.barriers || []).map(item => item.type))]),
    sceneryStride: high ? 2 : 4,
    forestStride: high ? 12 : 24,
    landmarkStride: high ? 14 : 28,
    samplesPerChunk: high ? 30 : 44,
    maxDistance: high ? 850 : 620,
    routeBehind: high ? 460 : 330,
    routeAhead: high ? 660 : 510,
    visibilityM: clamp(finite(selectedWeather.visibilityM, DEFAULT_WEATHER.visibilityM), 220, 3000),
    palette: visualPalette(selectedRegion, selectedWeather)
  });
}

// Short aliases make the pure seam easy to discover without changing the class API.
export const planWorld = planWorldVisuals;
export const planCarMesh = planCarVisual;

export class ChaseCamera {
  constructor(stage,car){
    this.stage=stage;this.position={x:car.x,y:car.y+3,z:car.z-6};this.target={x:car.x,y:car.y+.7,z:car.z+3};
    this.yaw=car.yaw;this.guideYaw=car.yaw;this.fov=58;this.far=780;this.clock=0;
  }
  reset(car){
    const road=sampleStage(this.stage,car.progress);this.yaw=angleLerp(car.yaw,road.heading,.12);this.guideYaw=this.yaw;
    const fx=Math.sin(this.yaw),fz=Math.cos(this.yaw);this.position={x:car.x-fx*6,y:car.y+2.7,z:car.z-fz*6};this.target={x:car.x+fx*3,y:car.y+.6,z:car.z+fz*3};
  }
  update(car,dt){
    this.clock+=dt;
    const speed=car.speed,road=sampleStage(this.stage,car.progress),motionYaw=speed>3?Math.atan2(car.vx,car.vz):car.yaw;
    const slideBlend=clamp(car.slipAmount*.82+speed/150,0,.9);
    let desiredGuide=angleLerp(car.yaw,motionYaw,slideBlend);
    desiredGuide=angleLerp(desiredGuide,road.heading,clamp(.08+car.slipAmount*.18,.08,.28));
    this.guideYaw=angleLerp(this.guideYaw,desiredGuide,expSmoothing(6.2,dt));
    this.yaw=angleLerp(this.yaw,this.guideYaw,expSmoothing(4.35,dt));
    const dist=5.7+clamp(speed*.064,0,3),height=2.5+clamp(speed*.018,0,.72),fx=Math.sin(this.yaw),fz=Math.cos(this.yaw);
    const shake=car.collisionImpulse*.16+car.slipAmount*.016+(car.surface==='grass'?clamp(speed/40,0,1)*.025:0);
    const desired={x:car.x-fx*dist+Math.sin(this.clock*43)*shake,y:car.y+height+Math.sin(this.clock*37)*shake*.45,z:car.z-fz*dist+Math.cos(this.clock*39)*shake};
    const behind=sampleStage(this.stage,Math.max(0,car.progress-dist));desired.y=Math.max(desired.y,behind.y+1.2);
    const horizontal=expSmoothing(7.2,dt),vertical=expSmoothing(9.5,dt);
    this.position.x+=(desired.x-this.position.x)*horizontal;this.position.z+=(desired.z-this.position.z)*horizontal;this.position.y+=(desired.y-this.position.y)*vertical;
    const lookYaw=angleLerp(this.guideYaw,road.heading,.16),look=3.4+clamp(speed*.115,0,4.8),lookX=Math.sin(lookYaw),lookZ=Math.cos(lookYaw),target={x:car.x+lookX*look,y:car.y+.58,z:car.z+lookZ*look};
    const targetSmoothing=expSmoothing(9.5,dt);this.target.x+=(target.x-this.target.x)*targetSmoothing;this.target.y+=(target.y-this.target.y)*targetSmoothing;this.target.z+=(target.z-this.target.z)*targetSmoothing;
    this.fov=56+clamp(speed*.48,0,17);return this;
  }
}

function terrainPoint(sample,lateral,index,band){
  const rx=Math.cos(sample.heading),rz=-Math.sin(sample.heading),camber=clamp(sample.camber*lateral,-1.25,1.25);
  const wave=Math.sin(index*.047+band*1.7)*(.45+band*.55)+Math.sin(index*.014+band*.8)*(.35+band*.7);
  return {x:sample.x+rx*lateral,y:sample.y+camber-(band===1?.28:1.2)+wave,z:sample.z+rz*lateral};
}

export class RallyWorld {
  constructor(renderer,stage,quality='high',options={},weatherArgument=null,carArgument=null){
    let selected=options;
    if(isObject(quality)){
      // Accept the migration-friendly { region, weather, car, quality } form as
      // well as a region object in the old third-argument slot.
      if('region' in quality || 'weather' in quality || 'car' in quality || 'quality' in quality){
        selected=quality;quality=typeof options==='string'?options:(quality.quality || 'high');
      }else{
        selected={region:quality,weather:options,car:weatherArgument};quality='high';
      }
    }
    selected=isObject(selected)?selected:{};
    if(!('region' in selected || 'weather' in selected || 'car' in selected) && (selected.palette || selected.sceneryKit)){
      selected={region:selected,weather:weatherArgument,car:carArgument};
    }
    if(weatherArgument && !selected.weather)selected={...selected,weather:weatherArgument};
    if(carArgument && !selected.car)selected={...selected,car:carArgument};
    this.renderer=renderer;this.stage=stage;this.quality=quality==='low'?'low':'high';
    this.region=inferRegion(stage,selected.region || selected.regionSpec || stage?.region);
    this.weather=inferWeather(selected.weather || selected.weatherSpec || stage?.weather);
    this.carSpec=isObject(selected.car || selected.carSpec || stage?.car)?(selected.car || selected.carSpec || stage.car):DEFAULT_CAR;
    this.visualPlan=planWorldVisuals(stage,this.region,this.weather,this.quality);
    this.worldPlan=this.visualPlan;
    this.landmarks=this.visualPlan.landmarks;
    this.barrierVisuals=planBarrierVisuals(stage);
    this.colors=this.visualPlan.palette;
    this.carVisual=planCarVisual(this.carSpec);
    this.regionSpec=this.region;this.weatherSpec=this.weather;this.car=this.carSpec;this.carProfile=this.carVisual;
    this.hazardVisuals=planHazardVisuals(stage);
    this.chunks=[];this.particles=[];this.clock=0;this.wheelRotation=0;
    this.buildBackdrop();this.buildStaticWorld();this.buildCar();
  }
  setQuality(quality){this.quality=quality==='low'?'low':'high';}

  dispose(){
    if(this.disposed)return 0;
    this.disposed=true;
    const meshes=[this.backdrop,...this.chunks.map(chunk=>chunk.mesh),this.carBody,this.wheel,this.bumper,this.shadow].filter(Boolean);
    for(const mesh of new Set(meshes))this.renderer.deleteMesh(mesh);
    this.chunks.length=0;this.particles.length=0;
    this.backdrop=this.carBody=this.wheel=this.bumper=this.shadow=null;
    return new Set(meshes).size;
  }

  buildBackdrop(){
    const xs=this.stage.samples.map(sample=>sample.x),zs=this.stage.samples.map(sample=>sample.z),ys=this.stage.samples.map(sample=>sample.y),pad=1300,y=Math.min(...ys)-7,builder=new MeshBuilder();
    const minX=Math.min(...xs)-pad,maxX=Math.max(...xs)+pad,minZ=Math.min(...zs)-pad,maxZ=Math.max(...zs)+pad;
    builder.quad({x:minX,y,z:minZ},{x:minX,y,z:maxZ},{x:maxX,y,z:maxZ},{x:maxX,y,z:minZ},this.colors.farGrass,{x:0,y:1,z:0});
    this.backdrop=this.renderer.createMesh(builder);
  }

  buildStaticWorld(){
    const samplesPerChunk=this.visualPlan.samplesPerChunk;
    for(let start=0;start<this.stage.samples.length-1;start+=samplesPerChunk){
      const end=Math.min(this.stage.samples.length-1,start+samplesPerChunk),builder=new MeshBuilder();
      this.addRoad(builder,start,end);this.addScenery(builder,start,end);
      const center=this.stage.samples[Math.floor((start+end)/2)];
      this.chunks.push({start,end,s0:this.stage.samples[start].s,s1:this.stage.samples[end].s,x:center.x,y:center.y,z:center.z,mesh:this.renderer.createMesh(builder),triangles:builder.triangleCount});
    }
  }

  addRoad(builder,start,end){
    for(let i=start;i<end;i++){
      const a=this.stage.samples[i],b=this.stage.samples[i+1],block=Math.floor(i/16),shade=hash01(block*811+31),roadCol=a.surface==='loose'?(shade>.48?this.colors.loose:this.colors.looseAlt):(shade>.55?this.colors.roadAlt:this.colors.road);
      const al=roadEdgePoint(a,-a.width/2,.035),ar=roadEdgePoint(a,a.width/2,.035),bl=roadEdgePoint(b,-b.width/2,.035),br=roadEdgePoint(b,b.width/2,.035);builder.quad(al,bl,br,ar,roadCol);
      if(i%19===7){
        const lateral=(hash01(i*1709)-.5)*a.width*.52,half=.22+hash01(i*919)*.18,p1=roadEdgePoint(a,lateral-half,.052),p2=roadEdgePoint(b,lateral-half,.052),p3=roadEdgePoint(b,lateral+half,.052),p4=roadEdgePoint(a,lateral+half,.052);builder.quad(p1,p2,p3,p4,this.colors.roadPatch);
      }
      for(const side of [-1,1]){
        const innerA=roadEdgePoint(a,side*a.width/2,.018),innerB=roadEdgePoint(b,side*b.width/2,.018),outerA=roadEdgePoint(a,side*(a.width/2+2.2),-.08),outerB=roadEdgePoint(b,side*(b.width/2+2.2),-.08);
        if(side<0)builder.quad(outerA,outerB,innerB,innerA,this.colors.shoulder);else builder.quad(innerA,innerB,outerB,outerA,this.colors.shoulder);
        const ditchA=roadEdgePoint(a,side*(a.width/2+2.85),-.22),ditchB=roadEdgePoint(b,side*(b.width/2+2.85),-.22);
        if(side<0)builder.quad(ditchA,ditchB,outerB,outerA,this.colors.ditch);else builder.quad(outerA,outerB,ditchB,ditchA,this.colors.ditch);
        const nearWidth=20+Math.sin(i*.031+side)*3,farWidth=76+Math.sin(i*.021+side*2.3)*13;
        const nearA=terrainPoint(a,side*nearWidth,i,1),nearB=terrainPoint(b,side*(20+Math.sin((i+1)*.031+side)*3),i+1,1),farA=terrainPoint(a,side*farWidth,i,2),farB=terrainPoint(b,side*(76+Math.sin((i+1)*.021+side*2.3)*13),i+1,2);
        const open=this.visualPlan.kit.includes('moor') ? (a.feature==='crest'||a.feature==='dip'||a.surface==='loose') : a.feature==='lakeside',grass=open?this.colors.moor:(Math.floor(i/13)%2?this.colors.grass:this.colors.grassAlt);
        if(side<0){builder.quad(nearA,nearB,ditchB,ditchA,grass);builder.quad(farA,farB,nearB,nearA,this.colors.farGrass);}else{builder.quad(ditchA,ditchB,nearB,nearA,grass);builder.quad(nearA,nearB,farB,farA,this.colors.farGrass);}
      }
    }
  }

  addScenery(builder,start,end){
    const kit=new Set(this.visualPlan.kit),forestDensity=kit.has('narrow-forest')?.68:kit.has('pine')?.52:.38;
    for(let i=start;i<=end;i+=this.visualPlan.sceneryStride){
      const sample=this.stage.samples[i],open=sample.feature==='lakeside'||sample.feature==='straight'||sample.surface==='loose',density=open?forestDensity*.52:forestDensity;
      for(const side of [-1,1]){
        const roll=hash01(i*739+side*29);if(roll>density)continue;
        const forceSpruce=kit.has('spruce') || (kit.has('narrow-forest') && (sample.feature==='narrow'||sample.feature==='jump'));
        const offset=sample.width/2+4+hash01(i*991+side*43)*(open?26:17),point=roadEdgePoint(sample,side*offset,-.12),scale=(forceSpruce?1.05:.7)+hash01(i*541+side*7)*(forceSpruce?1.7:1.45),kind=hash01(i*1237+side*71);
        if(forceSpruce || kind>.28)this.addTree(builder,point,scale,forceSpruce||kind>.48,kind);else if(kind>.12)this.addBush(builder,point,scale);else this.addSmallRock(builder,point,scale);
      }
    }
    for(let i=start;i<=end;i++)if(i%20===4){const sample=this.stage.samples[i];for(const side of [-1,1])this.addMarker(builder,roadEdgePoint(sample,side*(sample.width/2+1.45),.08),sample.heading,side);}
    for(const hazard of this.hazardVisuals){if(hazard.sampleIndex<start||hazard.sampleIndex>end)continue;if(hazard.type==='tree')this.addTree(builder,{x:hazard.x,y:hazard.y,z:hazard.z},1.15,true,.8);else if(hazard.type==='rock')this.addRock(builder,hazard);else this.addHazardPost(builder,hazard);}
    const rangeStart=this.stage.samples[start].s,rangeEnd=this.stage.samples[end].s;
    for(const gateDistance of [22,this.stage.length-25])if(gateDistance>=rangeStart&&gateDistance<=rangeEnd)this.addGate(builder,sampleStage(this.stage,gateDistance),gateDistance<100);
    for(const barrier of this.barrierVisuals){
      if(barrier.s<rangeStart-8||barrier.s>rangeEnd+8)continue;
      this.addBarrierVisual(builder,barrier);
    }
    for(const spec of this.stage.barrierPlan || []){
      if(spec.type!=='barrier' || !Number.isFinite(spec.centerM))continue;
      if(spec.centerM>=rangeStart-80&&spec.centerM<=rangeEnd+80)this.addHairpinScene(builder,spec.centerM,spec.side ?? 1);
    }
    this.addRegionalLandmarks(builder,rangeStart,rangeEnd);
  }

  addTree(builder,point,scale,pine,variant=.5){
    if(pine){
      builder.cylinder({x:point.x,y:point.y+1.25*scale,z:point.z},.15*scale,2.5*scale,6,this.colors.trunk);
      builder.cone({x:point.x,y:point.y+.75*scale,z:point.z},1.08*scale,2.45*scale,7,this.colors.pine);
      builder.cone({x:point.x,y:point.y+1.65*scale,z:point.z},.85*scale,2.05*scale,7,variant>.76?this.colors.pineLight:this.colors.pine);
      if(variant>.7)builder.cone({x:point.x,y:point.y+2.45*scale,z:point.z},.55*scale,1.45*scale,7,this.colors.pineLight);
    }else{
      builder.cylinder({x:point.x,y:point.y+1.4*scale,z:point.z},.13*scale,2.8*scale,6,this.colors.birch);
      builder.cone({x:point.x-.18*scale,y:point.y+1.75*scale,z:point.z},.78*scale,1.5*scale,8,this.colors.grassAlt);
      builder.cone({x:point.x+.2*scale,y:point.y+2.15*scale,z:point.z},.62*scale,1.25*scale,8,this.colors.grass);
    }
  }
  addBush(builder,point,scale){builder.cone({x:point.x,y:point.y+.05,z:point.z},.58*scale,.85*scale,7,this.colors.darkGrass);builder.cone({x:point.x+.34*scale,y:point.y+.02,z:point.z+.18*scale},.42*scale,.62*scale,7,this.colors.grassAlt);}
  addSmallRock(builder,point,scale){builder.cone({x:point.x,y:point.y+.03,z:point.z},.5*scale,.42*scale,6,this.colors.rock);}
  addRock(builder,hazard){builder.cone({x:hazard.x,y:hazard.y+.38,z:hazard.z},hazard.radius,.85,6,this.colors.rock);}
  addHazardPost(builder,hazard){builder.box({x:hazard.x,y:hazard.y+.55,z:hazard.z},{x:.16,y:1.1,z:.16},this.colors.post);builder.box({x:hazard.x,y:hazard.y+.92,z:hazard.z},{x:.18,y:.24,z:.18},this.colors.red);}
  addMarker(builder,point,heading,side){builder.box({x:point.x,y:point.y+.55,z:point.z},{x:.11,y:1.1,z:.11},this.colors.post);const rx=Math.cos(heading),rz=-Math.sin(heading);builder.box({x:point.x+rx*side*.015,y:point.y+.95,z:point.z+rz*side*.015},{x:.15,y:.24,z:.15},this.colors.red);}

  addGate(builder,sample,start){
    const rx=Math.cos(sample.heading),rz=-Math.sin(sample.heading),half=sample.width/2+1;
    for(const side of [-1,1]){const x=sample.x+rx*half*side,z=sample.z+rz*half*side;builder.box({x,y:sample.y+2.2,z},{x:.34,y:4.4,z:.34},start?this.colors.orange:this.colors.post);builder.box({x,y:sample.y+3.55,z},{x:.48,y:.42,z:.48},this.colors.tealDark);}
    builder.boxYaw({x:sample.x,y:sample.y+4.05,z:sample.z},{x:sample.width+2.5,y:.65,z:.42},sample.heading,start?this.colors.orange:this.colors.post);
  }

  addHairpinScene(builder,distance,side){
    for(let n=0;n<8;n++){const sample=sampleStage(this.stage,distance-30+n*9),point=roadEdgePoint(sample,-side*(sample.width/2+7+n%2*1.3),0),shirt=[this.colors.spectator1,this.colors.spectator2,this.colors.spectator3][n%3];builder.cylinder({x:point.x,y:point.y+.65,z:point.z},.18,1,5,shirt);builder.cone({x:point.x,y:point.y+1.28,z:point.z},.18,.28,6,this.colors.birch);}
  }

  addBarrierVisual(builder,barrier){
    const heading=sampleStage(this.stage,barrier.s).heading;
    const center={x:barrier.x,y:barrier.y,z:barrier.z};
    const type=String(barrier.type || 'post');
    if(type==='wall'){
      const size=barrier.size || BARRIER_SIZES.wall;
      builder.boxYaw({x:center.x,y:center.y+.36,z:center.z},{x:Math.max(size.x,barrier.radius*1.15),y:size.y,z:size.z},heading,Math.round(barrier.s/5)%2?this.colors.stone:this.colors.stoneDark);
    }else if(type==='bridge-rail'){
      builder.boxYaw({x:center.x,y:center.y+.42,z:center.z},barrier.size || BARRIER_SIZES['bridge-rail'],heading,this.colors.barrier);
    }else if(type==='timber-fence' || type==='lake-fence'){
      const size=barrier.size || BARRIER_SIZES[type];
      builder.boxYaw({x:center.x,y:center.y+.36,z:center.z},size,heading,this.colors.barrier);
      builder.boxYaw({x:center.x,y:center.y+.84,z:center.z},{x:.16,y:.18,z:size.z},heading,this.colors.wood || this.colors.trunk);
    }else if(type==='spruce-rail'){
      builder.boxYaw({x:center.x,y:center.y+.38,z:center.z},barrier.size || BARRIER_SIZES['spruce-rail'],heading,this.colors.barrier);
    }else if(type==='barrier'){
      builder.boxYaw({x:center.x,y:center.y+.35,z:center.z},barrier.size || BARRIER_SIZES.barrier,heading,Math.round(barrier.s/12)%2?this.colors.red:this.colors.barrier);
    }else{
      this.addHazardPost(builder,barrier);
    }
  }

  addRegionalLandmarks(builder,start,end){
    const ranges=this.visualPlan.ranges;
    for(const range of ranges){
      const from=Math.max(start,range.start),to=Math.min(end,range.end);
      if(to<from)continue;
      const drawer=LANDMARK_DRAWERS[range.type];
      if(drawer && typeof this[drawer]==='function')this[drawer](builder,from,to);
    }
  }

  addLakeRange(builder,start,end){
    if(end<=start)return;
    const a=sampleStage(this.stage,start),b=sampleStage(this.stage,end),side=-1;
    const nearA=roadEdgePoint(a,side*(a.width/2+8),-.7),nearB=roadEdgePoint(b,side*(b.width/2+8),-.7);
    const farA=roadEdgePoint(a,side*(a.width/2+43),-1.05),farB=roadEdgePoint(b,side*(b.width/2+43),-1.05);
    builder.quad(nearA,nearB,farB,farA,this.colors.water,{x:0,y:1,z:0});
    // A broken shore lip gives the lake a readable silhouette in grayscale.
    const mid=sampleStage(this.stage,(start+end)/2),shore=roadEdgePoint(mid,side*(mid.width/2+7.6),-.34);
    builder.boxYaw({x:shore.x,y:shore.y+.05,z:shore.z},{x:1.1,y:.16,z:Math.min(22,Math.max(6,end-start))},mid.heading,this.colors.rock);
  }

  addForestRange(builder,start,end){
    for(let distance=Math.ceil(start/this.visualPlan.forestStride)*this.visualPlan.forestStride;distance<=end;distance+=this.visualPlan.forestStride){
      const sample=sampleStage(this.stage,distance),n=Math.floor(distance/this.visualPlan.forestStride);
      for(const side of [-1,1]){
        const offset=sample.width/2+2.4+(hash01(n*271+side*17)*2.6),point=roadEdgePoint(sample,side*offset,-.05);
        this.addTree(builder,point,1.35+hash01(n*881+side*31)*1.35,true,hash01(n*991+side*7));
      }
    }
  }

  addJumpRange(builder,start,end){
    const distance=start+(end-start)*.62,sample=sampleStage(this.stage,distance);
    for(const side of [-1,1]){
      const point=roadEdgePoint(sample,side*(sample.width/2+.35),.12);
      builder.boxYaw({x:point.x,y:point.y+.52,z:point.z},{x:.2,y:1.04,z:2.4},sample.heading,this.colors.barrier);
      builder.boxYaw({x:point.x,y:point.y+1.12,z:point.z},{x:.28,y:.12,z:2.4},sample.heading,this.colors.orange);
    }
  }

  addOutcropRange(builder,start,end){
    const distance=start+(end-start)*.5,sample=sampleStage(this.stage,distance);
    for(const side of [-1,1]){
      const point=roadEdgePoint(sample,side*(sample.width/2+3.4),-.05);
      this.addRock(builder,{x:point.x,y:point.y,z:point.z,radius:1.2+hash01(distance+side)*.55});
      if(this.visualPlan.kit.includes('granite-outcrop')){
        const point2=roadEdgePoint(sample,side*(sample.width/2+5.0),-.02);
        this.addRock(builder,{x:point2.x,y:point2.y,z:point2.z,radius:.65+hash01(distance+side*3)*.35});
      }
    }
  }

  addStoneWall(builder,start,end){
    for(let distance=Math.ceil(start/5)*5;distance<=end;distance+=5){const sample=sampleStage(this.stage,distance),point=roadEdgePoint(sample,-(sample.width/2+2.15),.05),col=Math.floor(distance/5)%2?this.colors.stone:this.colors.stoneDark;builder.boxYaw({x:point.x,y:point.y+.36,z:point.z},{x:.7,y:.72,z:5.25},sample.heading,col);}
  }

  addBridge(builder,start,end){
    for(let distance=Math.ceil(start/7)*7;distance<end;distance+=7){
      const a=sampleStage(this.stage,distance),b=sampleStage(this.stage,Math.min(end,distance+7)),half=Math.min(a.width,b.width)/2+.1;
      const al=roadEdgePoint(a,-half,.075),ar=roadEdgePoint(a,half,.075),bl=roadEdgePoint(b,-half,.075),br=roadEdgePoint(b,half,.075);builder.quad(al,bl,br,ar,this.colors.stoneDark);
    }
    const centerDistance=(start+end)/2,ahead=sampleStage(this.stage,Math.min(this.stage.length,end+16)),behind=sampleStage(this.stage,Math.max(0,start-16));
    const leftBehind=roadEdgePoint(behind,-48,-5.2),rightBehind=roadEdgePoint(behind,48,-5.2),leftAhead=roadEdgePoint(ahead,-48,-5.2),rightAhead=roadEdgePoint(ahead,48,-5.2);builder.quad(leftBehind,leftAhead,rightAhead,rightBehind,this.colors.water,{x:0,y:1,z:0});
    if(Math.abs(centerDistance-start)<8){
      for(const sample of [behind,ahead])for(const side of [-1,1]){const point=roadEdgePoint(sample,side*(sample.width/2+1),-.4);builder.boxYaw({x:point.x,y:point.y+.4,z:point.z},{x:2.1,y:1.6,z:2.4},sample.heading,this.colors.stone);}
    }
  }

  landmarkStep(multiplier=1){return Math.max(10,(this.visualPlan.landmarkStride||28)*multiplier);}

  addAcaciaTree(builder,point,scale){
    builder.cylinder({x:point.x,y:point.y+1.0*scale,z:point.z},.11*scale,2.05*scale,6,this.colors.trunk);
    builder.cylinder({x:point.x+.18*scale,y:point.y+1.72*scale,z:point.z},.055*scale,.95*scale,5,this.colors.trunk);
    builder.cone({x:point.x-.22*scale,y:point.y+2.05*scale,z:point.z},.76*scale,.48*scale,7,this.colors.lime);
    builder.cone({x:point.x+.25*scale,y:point.y+2.22*scale,z:point.z+.1*scale},.62*scale,.4*scale,7,this.colors.grass);
  }

  addEucalyptusTree(builder,point,scale){
    builder.cylinder({x:point.x,y:point.y+1.22*scale,z:point.z},.13*scale,2.5*scale,6,this.colors.eucalyptus);
    builder.cone({x:point.x-.2*scale,y:point.y+2.05*scale,z:point.z},.56*scale,1.2*scale,7,this.colors.eucalyptus);
    builder.cone({x:point.x+.22*scale,y:point.y+2.45*scale,z:point.z+.1*scale},.48*scale,1.08*scale,7,this.colors.grassAlt);
  }

  addAutumnTree(builder,point,scale){
    builder.cylinder({x:point.x,y:point.y+1.05*scale,z:point.z},.12*scale,2.15*scale,6,this.colors.trunk);
    builder.cone({x:point.x-.2*scale,y:point.y+1.9*scale,z:point.z},.7*scale,1.2*scale,7,this.colors.autumn);
    builder.cone({x:point.x+.22*scale,y:point.y+2.35*scale,z:point.z+.1*scale},.56*scale,.94*scale,7,this.colors.orange);
  }

  addOliveTree(builder,point,scale){
    builder.cylinder({x:point.x,y:point.y+.8*scale,z:point.z},.1*scale,1.6*scale,6,this.colors.trunk);
    builder.cone({x:point.x-.18*scale,y:point.y+1.62*scale,z:point.z},.62*scale,.92*scale,8,this.colors.eucalyptus);
    builder.cone({x:point.x+.2*scale,y:point.y+1.84*scale,z:point.z+.08*scale},.5*scale,.78*scale,8,this.colors.lime);
  }

  addSavannahRange(builder,start,end){
    const step=this.landmarkStep(2);
    for(let distance=Math.ceil(start/step)*step;distance<=end;distance+=step){
      const sample=sampleStage(this.stage,distance);
      for(const side of [-1,1]){
        const point=roadEdgePoint(sample,side*(sample.width/2+6+hash01(distance+side)*12),-.1);
        this.addBush(builder,point,.65+hash01(distance*3+side)*.55);
      }
    }
  }

  addAcaciaRange(builder,start,end){
    const step=this.landmarkStep(2.5);
    for(let distance=Math.ceil(start/step)*step;distance<=end;distance+=step){
      const sample=sampleStage(this.stage,distance);
      for(const side of [-1,1]){
        const point=roadEdgePoint(sample,side*(sample.width/2+7+hash01(distance*2+side)*17),-.1);
        this.addAcaciaTree(builder,point,.72+hash01(distance*5+side)*.64);
      }
    }
  }

  addEucalyptusRange(builder,start,end){
    const step=this.landmarkStep(2.2);
    for(let distance=Math.ceil(start/step)*step;distance<=end;distance+=step){
      const sample=sampleStage(this.stage,distance);
      for(const side of [-1,1]){
        const point=roadEdgePoint(sample,side*(sample.width/2+6+hash01(distance*2+side)*15),-.08);
        this.addEucalyptusTree(builder,point,.74+hash01(distance*5+side)*.68);
      }
    }
  }

  addAutumnMapleRange(builder,start,end){
    const step=this.landmarkStep(2.3);
    for(let distance=Math.ceil(start/step)*step;distance<=end;distance+=step){
      const sample=sampleStage(this.stage,distance);
      for(const side of [-1,1]){
        const point=roadEdgePoint(sample,side*(sample.width/2+4.8+hash01(distance*2+side)*11),-.06);
        this.addAutumnTree(builder,point,.72+hash01(distance*5+side)*.5);
      }
    }
  }

  addOliveRange(builder,start,end){
    const step=this.landmarkStep(2.5);
    for(let distance=Math.ceil(start/step)*step;distance<=end;distance+=step){
      const sample=sampleStage(this.stage,distance);
      for(const side of [-1,1]){
        const point=roadEdgePoint(sample,side*(sample.width/2+6+hash01(distance*2+side)*14),-.08);
        this.addOliveTree(builder,point,.75+hash01(distance*5+side)*.48);
      }
    }
  }

  addWaterRibbon(builder,start,end,colorValue,side=-1){
    if(end<=start)return;
    const step=this.landmarkStep(.7);
    for(let distance=Math.ceil(start/step)*step;distance<end;distance+=step){
      const a=sampleStage(this.stage,distance),b=sampleStage(this.stage,Math.min(end,distance+step));
      const nearA=roadEdgePoint(a,side*(a.width/2+.03),.075),nearB=roadEdgePoint(b,side*(b.width/2+.03),.075);
      const farA=roadEdgePoint(a,side*(a.width/2+3.2),-.02),farB=roadEdgePoint(b,side*(b.width/2+3.2),-.02);
      if(side<0)builder.quad(farA,farB,nearB,nearA,colorValue,{x:0,y:1,z:0});
      else builder.quad(nearA,nearB,farB,farA,colorValue,{x:0,y:1,z:0});
    }
  }

  addWaterSplashRange(builder,start,end){
    if(end<=start)return;
    const step=this.landmarkStep(.75);
    for(let distance=Math.ceil(start/step)*step;distance<end;distance+=step){
      const a=sampleStage(this.stage,distance),b=sampleStage(this.stage,Math.min(end,distance+step));
      const al=roadEdgePoint(a,-a.width/2-.05,.09),ar=roadEdgePoint(a,a.width/2+.05,.09),bl=roadEdgePoint(b,-b.width/2-.05,.09),br=roadEdgePoint(b,b.width/2+.05,.09);
      builder.quad(al,bl,br,ar,this.colors.splash,{x:0,y:1,z:0});
    }
  }

  addStreamRange(builder,start,end){this.addWaterRibbon(builder,start,end,this.colors.water,-1);}

  addWashboardRange(builder,start,end){
    const step=this.landmarkStep(.7);
    for(let distance=Math.ceil(start/step)*step;distance<=end;distance+=step){
      const sample=sampleStage(this.stage,distance);
      builder.boxYaw({x:sample.x,y:sample.y+.045,z:sample.z},{x:sample.width+.18,y:.08,z:.28},sample.heading,this.colors.redEarth);
    }
  }

  addCattleGridRange(builder,start,end){
    const step=3.5;
    for(let distance=Math.ceil(start/step)*step;distance<=end;distance+=step){
      const sample=sampleStage(this.stage,distance);
      builder.boxYaw({x:sample.x,y:sample.y+.06,z:sample.z},{x:sample.width+.2,y:.12,z:.22},sample.heading,this.colors.metal);
    }
  }

  addEscarpmentRange(builder,start,end){this.addOutcropRange(builder,start,end);}
  addSeaCliffRange(builder,start,end){
    this.addOutcropRange(builder,start,end);
    const sample=sampleStage(this.stage,(start+end)/2);
    const point=roadEdgePoint(sample,-(sample.width/2+8),-.2);
    builder.boxYaw({x:point.x,y:point.y+1.2,z:point.z},{x:3.2,y:2.4,z:Math.max(6,end-start)},sample.heading,this.colors.stoneDark);
  }

  addCedarTunnelRange(builder,start,end){
    const step=this.landmarkStep(1.2);
    for(let distance=Math.ceil(start/step)*step;distance<=end;distance+=step){
      const sample=sampleStage(this.stage,distance);
      for(const side of [-1,1]){
        const point=roadEdgePoint(sample,side*(sample.width/2+2.8+hash01(distance+side)*3),-.04);
        this.addTree(builder,point,1.15+hash01(distance*3+side)*.55,true,hash01(distance+side));
      }
      if(Math.floor(distance/step)%4===0)builder.boxYaw({x:sample.x,y:sample.y+3.1,z:sample.z},{x:sample.width+4.8,y:.2,z:.28},sample.heading,this.colors.trunk);
    }
  }

  addLanternRange(builder,start,end){
    const step=this.landmarkStep(1.8);
    for(let distance=Math.ceil(start/step)*step;distance<=end;distance+=step){
      const sample=sampleStage(this.stage,distance),side=Math.floor(distance/step)%2?1:-1,point=roadEdgePoint(sample,side*(sample.width/2+2.3),.02);
      builder.cylinder({x:point.x,y:point.y+.95,z:point.z},.055,.95,6,this.colors.trunk);
      builder.box({x:point.x,y:point.y+1.65,z:point.z},{x:.28,y:.34,z:.28},this.colors.lantern);
    }
  }

  addVillageRange(builder,start,end){
    const step=this.landmarkStep(2.4);
    for(let distance=Math.ceil(start/step)*step;distance<=end;distance+=step){
      const sample=sampleStage(this.stage,distance);
      for(const side of [-1,1]){
        const point=roadEdgePoint(sample,side*(sample.width/2+8+hash01(distance+side)*7),-.03),size=1.5+hash01(distance*2+side)*1.3;
        builder.boxYaw({x:point.x,y:point.y+size*.65,z:point.z},{x:size*1.4,y:size*1.3,z:size*1.7},sample.heading,this.colors.stone);
        builder.boxYaw({x:point.x,y:point.y+size*1.5,z:point.z},{x:size*1.55,y:.22,z:size*1.85},sample.heading,this.colors.orange);
      }
    }
  }

  addCrowdRange(builder,start,end){
    if(end<=start)return;
    const center=(start+end)/2;
    if(center<start||center>end)return;
    this.addHairpinScene(builder,center,1);
    this.addHairpinScene(builder,center,-1);
  }

  addRedGravelRange(builder,start,end){
    const step=this.landmarkStep(1.8);
    for(let distance=Math.ceil(start/step)*step;distance<=end;distance+=step){
      const sample=sampleStage(this.stage,distance),side=hash01(distance)>0.5?1:-1,point=roadEdgePoint(sample,side*(sample.width/2+3.5),-.02);
      this.addRock(builder,{x:point.x,y:point.y,z:point.z,radius:.35+hash01(distance*2)*.4});
    }
  }

  addRoughVergeRange(builder,start,end){
    const step=this.landmarkStep(1.4);
    for(let distance=Math.ceil(start/step)*step;distance<=end;distance+=step){
      const sample=sampleStage(this.stage,distance);
      for(const side of [-1,1]){
        const point=roadEdgePoint(sample,side*(sample.width/2+3.8+hash01(distance+side)*4),-.05);
        this.addSmallRock(builder,point,.45+hash01(distance*2+side)*.55);
      }
    }
  }

  addDustBowlRange(builder,start,end){
    const mid=sampleStage(this.stage,(start+end)/2),a=roadEdgePoint(mid,-mid.width/2-5,-.06),b=roadEdgePoint(mid,mid.width/2+5,-.06),ahead=sampleStage(this.stage,Math.min(this.stage.length,end+25)),behind=sampleStage(this.stage,Math.max(0,start-25)),c=roadEdgePoint(ahead,ahead.width/2+5,-.06),d=roadEdgePoint(behind,-behind.width/2-5,-.06);
    builder.quad(d,a,b,c,this.colors.redEarth,{x:0,y:1,z:0});
  }

  addFinishGateRange(builder,start,end){
    if((start+end)/2 < this.stage.length-80)return;
    this.addGate(builder,sampleStage(this.stage,Math.min(this.stage.length-1,(start+end)/2)),false);
  }
  addPassGateRange(builder,start,end){this.addGate(builder,sampleStage(this.stage,(start+end)/2),false);}
  addCoastalGateRange(builder,start,end){this.addGate(builder,sampleStage(this.stage,(start+end)/2),false);}
  addStormGateRange(builder,start,end){this.addGate(builder,sampleStage(this.stage,(start+end)/2),false);}

  buildCar(){
    const p=this.carVisual,halfWidth=p.width/2,halfLength=p.length/2,cabinStart=p.cabinStart,cabinEnd=p.cabinEnd,bodyY=p.bodyCenterY;
    let builder=new MeshBuilder();
    builder.box({x:0,y:bodyY,z:0},{x:p.width,y:p.bodyHeight,z:p.length},p.body);
    builder.wedge({x:-halfWidth*.88,y:bodyY+p.bodyHeight*.32,z:cabinStart},{x:halfWidth*.88,y:p.roofHeight,z:cabinEnd},p.roofInset,p.dark);
    builder.box({x:0,y:p.bumperY,z:halfLength+.035},{x:p.width*1.02,y:.26,z:.19},p.accent);
    builder.box({x:0,y:p.bumperY+.13,z:-halfLength-.035},{x:p.width*.96,y:.22,z:.18},this.colors.metal);
    builder.box({x:0,y:bodyY+p.bodyHeight*.46,z:cabinEnd+.04},{x:p.width*.82,y:.025,z:.7},p.body);
    builder.box({x:0,y:p.roofHeight-.22,z:cabinEnd-.03},{x:p.width*.67,y:p.windowHeight,z:.035},p.window);
    builder.box({x:0,y:p.roofHeight-.2,z:cabinStart+.05},{x:p.width*.67,y:p.windowHeight*.94,z:.035},p.window);
    const lampX=p.width*.38;
    builder.box({x:-lampX,y:bodyY+p.bodyHeight*.74,z:halfLength-.16},{x:p.width*.2,y:.18,z:.05},this.colors.lamp);
    builder.box({x:lampX,y:bodyY+p.bodyHeight*.74,z:halfLength-.16},{x:p.width*.2,y:.18,z:.05},this.colors.lamp);
    builder.box({x:0,y:p.roofHeight+.08,z:(cabinStart+cabinEnd)/2},{x:p.width*.42,y:.1,z:.55},p.accent);
    builder.box({x:-halfWidth*.96,y:p.roofHeight-.22,z:(cabinStart+cabinEnd)/2},{x:.035,y:p.windowHeight,z:cabinEnd-cabinStart},p.window);
    builder.box({x:halfWidth*.96,y:p.roofHeight-.22,z:(cabinStart+cabinEnd)/2},{x:.035,y:p.windowHeight,z:cabinEnd-cabinStart},p.window);
    builder.box({x:-lampX,y:bodyY+p.bodyHeight*.53,z:-halfLength+.07},{x:p.width*.18,y:.19,z:.045},this.colors.red);
    builder.box({x:lampX,y:bodyY+p.bodyHeight*.53,z:-halfLength+.07},{x:p.width*.18,y:.19,z:.045},this.colors.red);
    builder.box({x:0,y:p.roofHeight-.2,z:-halfLength+.28},{x:p.width*.78,y:.09,z:.34},p.dark);
    for(const z of [p.frontAxle,p.rearAxle])for(const x of [-halfWidth*.9,halfWidth*.9])builder.box({x,y:bodyY-.03,z},{x:.12,y:.42,z:.62},p.dark);
    builder.box({x:0,y:bodyY-.02,z:-halfLength-.06},{x:p.width*.46,y:.2,z:.035},this.colors.barrier);
    if(p.spoiler){
      builder.box({x:0,y:bodyY+.68,z:-halfLength+.03},{x:p.width*.74,y:.1,z:.32},p.accent);
      builder.box({x:-p.width*.3,y:bodyY+.5,z:-halfLength+.03},{x:.08,y:.34,z:.08},p.dark);
      builder.box({x:p.width*.3,y:bodyY+.5,z:-halfLength+.03},{x:.08,y:.34,z:.08},p.dark);
    }
    builder.cylinderX({x:p.width*.3,y:bodyY-.1,z:-halfLength-.05},.055,.34,7,this.colors.metal);this.carBody=this.renderer.createMesh(builder);

    builder=new MeshBuilder();
    builder.cylinderX({x:0,y:0,z:0},p.wheelRadius,.34,10,this.colors.tyre);
    builder.cylinderX({x:0,y:0,z:0},p.wheelRadius*.56,.37,10,this.colors.metal);
    builder.box({x:0,y:0,z:0},{x:p.wheelRadius*.95,y:.075,z:p.wheelRadius*.88},p.dark);
    builder.box({x:0,y:0,z:0},{x:p.wheelRadius*.95,y:p.wheelRadius*.88,z:.075},p.dark);this.wheel=this.renderer.createMesh(builder);
    builder=new MeshBuilder();builder.box({x:0,y:0,z:0},{x:p.width*1.05,y:.22,z:.2},p.accent);this.bumper=this.renderer.createMesh(builder);
    builder=new MeshBuilder();builder.quad({x:-halfWidth*.66,y:0,z:-halfLength},{x:halfWidth*.66,y:0,z:-halfLength},{x:halfWidth*.66,y:0,z:halfLength},{x:-halfWidth*.66,y:0,z:halfLength},this.colors.shadow,{x:0,y:1,z:0});this.shadow=this.renderer.createMesh(builder);
  }

  update(dt,car,input){
    this.clock+=dt;this.wheelRotation+=car.longitudinalSpeed/Math.max(.1,this.carVisual.wheelRadius)*dt;
    const speed=car.speed,emit=speed>5&&(input.throttle>.15||car.slipAmount>.05||car.surface!=='compact');
    if(emit){
      const count=this.quality==='high'?Math.ceil(1+speed/12+car.slipAmount*3):1,fx=Math.sin(car.yaw),fz=Math.cos(car.yaw),rx=Math.cos(car.yaw),rz=-Math.sin(car.yaw),wetness=clamp01(this.weather.roadWetness);
      for(let i=0;i<count;i++){const side=(Math.random()-.5)*1.35,life=.75+Math.random()*.75;this.particles.push({x:car.x-fx*1.65+rx*side,y:car.y-.35,z:car.z-fz*1.65+rz*side,vx:-fx*(1+Math.random()*2)+rx*(Math.random()-.5),vy:.28+Math.random()*.75,vz:-fz*(1+Math.random()*2)+rz*(Math.random()-.5),life,maxLife:life,size:.32+Math.random()*.58,alpha:.42*(1-wetness*.72),color:car.surface==='grass'?[.38,.42,.28]:[.55,.47,.35],kind:'dust'});}
      if(car.slipAmount>.22&&car.grounded)this.particles.push({x:car.x,y:car.y-.51,z:car.z,vx:0,vy:0,vz:0,life:4,maxLife:4,size:.11,alpha:.42,color:[.16,.15,.12],kind:'mark'});
    }
    let write=0;
    for(let read=0;read<this.particles.length;read++){
      const particle=this.particles[read];particle.life-=dt;if(particle.life<=0)continue;
      if(particle.kind==='dust'){particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.z+=particle.vz*dt;particle.vy+=.18*dt;particle.size+=dt*.65;particle.alpha=.48*Math.pow(Math.max(0,particle.life/particle.maxLife),1.35);}else particle.alpha=.35*Math.max(0,particle.life/particle.maxLife);
      this.particles[write++]=particle;
    }
    this.particles.length=write;const max=this.quality==='high'?420:190;if(this.particles.length>max)this.particles.splice(0,this.particles.length-max);
  }

  draw(camera,car){
    const maxDistance=Math.min(this.quality==='high'?this.visualPlan.maxDistance:620,this.visualPlan.visibilityM*1.08),maxSq=maxDistance*maxDistance,routeBehind=this.quality==='high'?this.visualPlan.routeBehind:330,routeAhead=this.quality==='high'?this.visualPlan.routeAhead:510;
    camera.far=Math.max(320,maxDistance);this.renderer.draw(this.backdrop,IDENTITY);
    for(const chunk of this.chunks){if(chunk.s1<car.progress-routeBehind||chunk.s0>car.progress+routeAhead)continue;const dx=chunk.x-camera.position.x,dz=chunk.z-camera.position.z;if(dx*dx+dz*dz<maxSq)this.renderer.draw(chunk.mesh,IDENTITY);}
    const shadowRoad=sampleStage(this.stage,car.progress),shadowModel=mat4Compose({x:car.x,y:shadowRoad.y+.055,z:car.z},car.yaw,0,0);this.renderer.draw(this.shadow,shadowModel,.48);
    const carModel=mat4Compose({x:car.x,y:car.y,z:car.z},car.yaw,car.pitch,car.roll);this.renderer.draw(this.carBody,carModel);
    const wheelY=this.carVisual.wheelCenterY,frontZ=this.carVisual.frontAxle,rearZ=this.carVisual.rearAxle,track=this.carVisual.track;
    for(const z of [frontZ,rearZ])for(const x of [-track/2,track/2]){const local=mat4Compose({x,y:wheelY-(x>0?car.roll:-car.roll)*.28,z},z>0?car.steer*.38:0,this.wheelRotation,0);this.renderer.draw(this.wheel,mat4Multiply(carModel,local));}
    const damage=car.damage.body,bumperLocal=mat4Compose({x:damage>.58?.18:0,y:this.carVisual.bumperY-damage*.12,z:this.carVisual.frontZ+damage*.1},damage>.58?damage*.24:0,0,damage>.58?-.12:0);this.renderer.draw(this.bumper,mat4Multiply(carModel,bumperLocal));
    this.renderer.drawParticles(this.particles);
  }
}
