/**
 * Offline layout data for the two substation variants. No game registration.
 * Geometry is in metres, +Y up / +Z front, origin at the compound centre.
 * This is a fictional walkable scene, not an engineering-certified design.
 * Run with --write to regenerate the two JSON files after building the catalogue.
 */
import '../tests/nice.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPAN_PRESETS, solveCatenary } from './substation_catenary.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PLAN_PATHS = Object.freeze(Object.fromEntries(['uk', 'co'].map((v) => [v, resolve(HERE, `blender/substation-plan.${v}.json`)])));
const positive3 = (p) => Array.isArray(p) && p.length === 3 && p.every((n) => Number.isFinite(n) && n > 0);
const finite3 = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const finite2 = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const clone = (value) => JSON.parse(JSON.stringify(value));
const rect = (w, d, margin = 0) => [[-w / 2 - margin, -d / 2 - margin], [w / 2 + margin, -d / 2 - margin], [w / 2 + margin, d / 2 + margin], [-w / 2 - margin, d / 2 + margin]];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Nominal envelopes are replaced by catalogue dimensions when it is present.
// Conservative access envelopes deliberately use the same maximum for both yards.
const SHARED = {
  grid_transformer: [8.2, 6.4, 6.2], distribution_transformer: [5.2, 4.8, 4.5],
  oil_breaker_hv: [5.4, 5.0, 2.5], oil_breaker_mv: [3.2, 3.5, 1.8], breaker_truck: [0.8, 1.2, 1.0],
  portal_gantry: [18, 9, 1.6], disconnector_centre: [4.5, 3.7, 1.8], disconnector_pantograph: [2.2, 5.2, 2.2],
  current_transformer: [0.9, 3.7, 0.9], voltage_transformer: [1.1, 4.1, 1.1], surge_arrester: [0.8, 3.8, 0.8],
  post_insulator: [0.6, 2.0, 0.6], earth_switch: [1.8, 2.4, 1.0], busbar_tube: [4, 0.15, 0.15],
  busbar_wire_segment: [1, 0.04, 0.04], bushing: [0.5, 2.3, 0.5], insulator_disc: [0.32, 0.17, 0.32],
  insulator_string: [0.32, 2.1, 0.32], spacer: [0.55, 0.55, 0.08], radiator_fin: [0.12, 2.6, 0.9],
  switchboard_panel: [0.8, 2.3, 1.3], control_panel: [1.0, 2.2, 0.65], battery_bank: [2.5, 1.3, 0.7],
  charger: [0.8, 1.5, 0.6], desk: [1.6, 0.76, 0.8], chair: [0.55, 0.95, 0.55],
  schematic_board: [1.8, 1.2, 0.08], trench_cover: [1, 0.12, 0.6], transformer_bund: [10, 0.55, 8],
  fire_wall: [0.4, 6, 8.5], oil_store: [3.2, 2.6, 2.5], station_service_transformer: [1.8, 2.1, 1.6],
  floodlight_mast: [1.6, 9, 0.6], lightning_mast: [0.8, 14, 0.8], earth_marker: [0.4, 0.5, 0.4],
  hazard_board: [1.1, 1.8, 0.15], tag_holder: [0.35, 0.22, 0.05], gravel_tile: [2, 0.05, 2],
  concrete_tile: [2, 0.1, 2], dry_weeds: [0.5, 0.6, 0.5],
};
const SITE = {
  tower_suspension: [10, 32, 7], tower_tension: [11, 34, 8], pole_mv: [5.2, 12, 1], pole_lv: [2.4, 10, 0.6],
  fence_panel: [2.5, 2.4, 0.1], fence_post: [0.18, 2.6, 0.18], outrigger: [0.12, 0.7, 0.5],
  gate: [4, 2.5, 0.2], building_shell: [12, 4, 7], building_door: [1.5, 2.4, 0.12],
  louvre: [1.2, 0.8, 0.1], window: [1.2, 1.2, 0.1], roof: [12.4, 0.22, 7.4],
};
export const TYPE_IDS = Object.freeze([...Object.keys(SHARED), ...Object.keys(SITE)]);
const ELECTRICAL = new Set(['grid_transformer', 'distribution_transformer', 'oil_breaker_hv', 'oil_breaker_mv', 'portal_gantry', 'disconnector_centre', 'disconnector_pantograph', 'current_transformer', 'voltage_transformer', 'surge_arrester', 'post_insulator', 'earth_switch', 'busbar_tube', 'busbar_wire_segment', 'bushing', 'insulator_string', 'tower_suspension', 'tower_tension', 'pole_mv', 'pole_lv', 'station_service_transformer']);
const TRAVERSABLE = new Set(['gravel_tile', 'concrete_tile', 'trench_cover', 'dry_weeds']);
const ELEVATED = new Set(['busbar_tube', 'busbar_wire_segment', 'insulator_string', 'roof', 'louvre', 'window', 'schematic_board', 'tag_holder', 'outrigger']);
const HUM = new Set(['grid_transformer', 'distribution_transformer', 'station_service_transformer', 'charger']);
const doorDefaults = { grid_transformer: ['marshalling_door'], distribution_transformer: ['marshalling_door'], oil_breaker_hv: ['mechanism_door'], oil_breaker_mv: ['mechanism_door'], switchboard_panel: ['panel_door'], control_panel: ['panel_door'], charger: ['cabinet_door'], oil_store: ['store_door'], gate: ['leaf_left', 'leaf_right'], building_door: ['door'] };

function profile(variant) {
  const uk = variant === 'uk';
  return {
    voltageKV: uk ? [132, 33, 11] : [115, 34.5, 13.2], gridFrequencyHz: uk ? 50 : 60,
    signLanguage: uk ? 'en' : 'es', signAtlas: `../textures/substation/signs-${variant}.png`,
    paint: uk ? 'grey-green and light-grey; light damp streaks' : 'light-grey and chalked ochre; humid rust and algae',
    insulators: uk ? ['brown-porcelain', 'grey-porcelain'] : ['brown-porcelain'],
    fence: uk ? 'green anti-climb palisade' : 'chain-link on concrete plinth with barbed-wire outriggers',
    building: uk ? 'brick; shallow flat roof; louvred steel doors' : 'rendered block; flat concrete roof; metal louvre doors',
    vegetation: uk ? 'sparse dry maintenance weeds; damp moss on concrete' : 'dry gravel weeds; algae on concrete',
    equipmentTags: uk ? ['T1 132/33 kV', 'CB 33-2', 'TX2'] : ['T1 115/34.5 kV', 'OCB 34.5-2', 'S/E'],
    lineRecipes: clone(SPAN_PRESETS[variant]),
    instanceMaterialOverrides: {
      'grid-1': { substation_paint: { cell: uk ? 'paint_uk' : 'paint_lightgrey' } },
      'grid-2': { substation_paint: { cell: uk ? 'paint_lightgrey' : 'paint_co' } },
      'distribution-1': { substation_paint: { cell: uk ? 'paint_lightgrey' : 'paint_co' } },
      'distribution-2': { substation_paint: { cell: uk ? 'paint_uk' : 'paint_lightgrey' } },
    },
  };
}

/** Build one type's explicit future integration slots; empty notes are intentional. */
function equipmentType(type, variant, catalogue) {
  const asset = `substation_${type in SITE ? `${variant}_` : ''}${type}`;
  const cat = catalogue?.assets?.[asset];
  const nominal = (SHARED[type] || SITE[type]);
  const otherAsset = `substation_${variant === 'uk' ? 'co' : 'uk'}_${type}`;
  const size = [...(cat?.size || nominal)];
  const otherSize = catalogue?.assets?.[otherAsset]?.size || nominal;
  const envelope = nominal.map((v, i) => Math.max(v, size[i], otherSize[i]));
  const electrical = ELECTRICAL.has(type), traversable = TRAVERSABLE.has(type);
  const margin = electrical ? 2 : type === 'building_shell' ? 0 : 0.2;
  const pivots = (cat?.pivots || doorDefaults[type] || []).filter((p) => /door|leaf|gate/.test(typeof p === 'string' ? p : p.name));
  const definitions = cat?.pivotDefinitions || [];
  const standing = [0, 0, envelope[2] / 2 + margin + 0.8];
  return {
    variantBinding: { asset, envelope: size, sharedGeometry: type in SHARED, pivotAnchors: clone(definitions), lineAnchors: clone(cat?.lineAnchors || []) },
    accessEnvelope: envelope, traversable,
    liveParts: { energised: electrical, exclusionMarginM: electrical ? 2 : 0, clearanceStatus: 'visual-only-not-engineering-certified' },
    anchors: {
      hum100Hz: HUM.has(type) ? { name: 'hum_100hz', position: [0, Math.min(envelope[1] * 0.5, 2.5), 0], frequencyHz: 100 } : null,
      lamps: type === 'floodlight_mast' ? ['lamp_left', 'lamp_right'].map((name, i) => ({ name, position: definitions.find((d) => d.name === name)?.position || [(i ? 1 : -1) * 0.9, 9.4, 0], nodeSuffix: name, direction: [0, -1, 0.3] })) : [],
      // A node reference is an exact hinge anchor even when two variant meshes
      // have slightly different local offsets. Actual positions are recorded in
      // variantBinding.pivotAnchors and verified against the GLB by the asset gate.
      doorHinges: pivots.map((p) => ({ name: typeof p === 'string' ? p : p.name, nodeSuffix: typeof p === 'string' ? p : p.name, axis: [0, 1, 0] })),
      standing: { name: 'inspection_stand', position: standing, facingY: Math.PI },
      seat: type === 'chair' ? { name: 'seat', position: [0, 0.47, 0], facingY: 0 } : null,
    },
    navKeepOut: traversable ? [] : rect(envelope[0], envelope[2], margin),
    inspectionNote: { es: '', en: '' },
  };
}

export function createSubstationPlan(variant, { catalogue = null } = {}) {
  if (!['uk', 'co'].includes(variant)) throw new TypeError('variant must be uk or co');
  if (!catalogue?.assets) throw new TypeError('complete substation catalogue is required to resolve exact line and hinge anchors');
  const equipmentTypes = Object.fromEntries(TYPE_IDS.map((type) => [type, equipmentType(type, variant, catalogue)]));
  const equipment = [];
  const add = (id, type, position, rotationY = 0, extra = {}) => equipment.push({ id, type, position, rotationY: rotationY || 0, ...extra });
  // Two 40 MVA grid units, two 15 MVA distribution units, and a separating wall.
  for (const [i, x] of [-12, 1].entries()) {
    add(`grid-${i + 1}`, 'grid_transformer', [x, 0.12, -1], 0, { bay: `grid-${i + 1}`, assembly: `grid-${i + 1}`, tagCells: ['grid_rating', `number0${i + 1}`] });
    add(`bund-${i + 1}`, 'transformer_bund', [x, 0, -1], 0, { assembly: `grid-${i + 1}` });
  }
  add('firewall', 'fire_wall', [-5.5, 0, -1]);
  for (const [i, x] of [12, 21].entries()) add(`distribution-${i + 1}`, 'distribution_transformer', [x, 0, -1], 0, { bay: `distribution-${i + 1}`, tagCells: ['dist_rating', `number0${i + 3}`] });
  add('gantry-incoming', 'portal_gantry', [-6, 0, -17], 0, { bay: 'incoming' });
  add('breaker-high', 'oil_breaker_hv', [-12, 0, -10], 0, { bay: 'incoming' });
  add('breaker-medium', 'oil_breaker_mv', [7, 0, -10], 0, { bay: 'distribution' });
  add('isolator-centre', 'disconnector_centre', [-1, 0, -10], 0, { bay: 'incoming' });
  add('isolator-pantograph', 'disconnector_pantograph', [20, 0, -12], 0, { bay: 'distribution' });
  for (const [i, x] of [-16, -12, -8].entries()) add(`ct-${i + 1}`, 'current_transformer', [x, 0, -14], 0, { bay: 'incoming' });
  add('voltage-transformer', 'voltage_transformer', [3, 0, -15], 0, { bay: 'incoming' });
  add('arrester', 'surge_arrester', [9, 0, -15], 0, { bay: 'distribution' });
  add('post-insulator', 'post_insulator', [13, 0, -15], 0, { bay: 'distribution' });
  add('earth-switch', 'earth_switch', [16, 0, -15], 0, { bay: 'distribution' });
  // A low bus rack on dedicated post insulators. Independently decoded near
  // geometry has post tops at 1.65 m and tube-body underside at local 0.003076923 m.
  for (const [i, x] of [5.5, 10.5].entries()) add(`bus-support-${i + 1}`, 'post_insulator', [x, 0, -17.5], 0, { assembly: 'buswork' });
  add('busbar-tube', 'busbar_tube', [8, 1.646923077, -17.5], 0, { assembly: 'buswork', elevated: true });
  // The one-metre wire drop touches the decoded centre-string lower terminal.
  add('busbar-wire-segment', 'busbar_wire_segment', [-6, 4.827102661, -17], 0, { assembly: 'buswork', elevated: true });
  add('insulator-string', 'insulator_string', [23.4, 0, 7.2], 0, { spare: true });
  // Explicit building kit with a real front doorway and independent louvred door.
  const building = [16, 0, 12];
  add('control-building', 'building_shell', building, 0, { assembly: 'control-building' });
  add('building-roof', 'roof', [16, 4, 12], 0, { assembly: 'control-building', elevated: true });
  add('building-door', 'building_door', [16, 0, 15.5], 0, { assembly: 'control-building' });
  add('building-louvre', 'louvre', [16, 2.8, 15.52], 0, { assembly: 'control-building', elevated: true });
  add('building-window', 'window', [19.5, 1.2, 15.52], 0, { assembly: 'control-building', elevated: true });
  add('building-window-left', 'window', [12.5, 1.2, 15.52], 0, { assembly: 'control-building', elevated: true });
  for (let i = 0; i < 12; i++) add(`board-${String(i + 1).padStart(2, '0')}`, 'switchboard_panel', [11.6 + i * 0.8, 0, 9.4], 0, { assembly: 'control-building', indoor: true, panelNumber: i + 1 });
  add('withdrawn-truck', 'breaker_truck', [12, 0, 11.2], 0, { assembly: 'control-building', indoor: true });
  add('control-panel', 'control_panel', [21, 0, 12], -Math.PI / 2, { assembly: 'control-building', indoor: true });
  add('battery-bank', 'battery_bank', [13, 0, 14.3], Math.PI, { assembly: 'control-building', indoor: true });
  add('charger', 'charger', [10.8, 0, 14.3], Math.PI, { assembly: 'control-building', indoor: true });
  add('desk', 'desk', [19, 0, 13.8], 0, { assembly: 'control-building', indoor: true });
  add('chair', 'chair', [19, 0, 12.8], 0, { assembly: 'control-building', indoor: true });
  add('wall-schematic', 'schematic_board', [16, 1.2, 8.53], 0, { assembly: 'control-building', indoor: true, elevated: true });
  add('oil-store', 'oil_store', [23.8, 0, 5], -Math.PI / 2);
  add('station-service', 'station_service_transformer', [6, 0, 5]);
  add('spare-bushing', 'bushing', [24, 0, 7.2], 0, { spare: true });
  add('spare-disc', 'insulator_disc', [24.8, 0, 7.2], 0, { spare: true });
  add('spare-spacer', 'spacer', [25.4, 0, 7.2], 0, { spare: true });
  add('spare-radiator', 'radiator_fin', [22.4, 0, 6.2], 0, { spare: true });
  add('earth-grid-marker', 'earth_marker', [-20, 0, 14.5]);
  add('hazard-board', 'hazard_board', [-14.3, 0, 18.4], 0);
  add('equipment-tag', 'tag_holder', [-12, 1.8, 2.5], 0, { assembly: 'grid-1', elevated: true });
  for (const [i, p] of [[-25.5, 0, -17.5], [25.5, 0, -17.5], [-25.5, 0, 14], [25.5, 0, 17.5]].entries()) add(`floodlight-${i + 1}`, 'floodlight_mast', p);
  add('lightning-mast', 'lightning_mast', [24, 0, -17]);
  // Towers and outgoing poles are intentionally outside the compact compound.
  add('incoming-suspension', 'tower_suspension', [-10, 0, -53], Math.PI, { external: true });
  add('incoming-terminal', 'tower_tension', [-10, 0, -29], Math.PI, { external: true });
  add('outgoing-medium', 'pole_mv', [18, 0, -29], 0, { external: true });
  add('outgoing-low', 'pole_lv', [34, 0, 2], Math.PI / 2, { external: true });
  // Fence widths are ordinary modules. The south run leaves exactly a 4 m gate.
  const fencePolyline = [[-27.5, -20], [27.5, -20], [27.5, 20], [-15, 20], [-19, 20], [-27.5, 20], [-27.5, -20]];
  const fenceRuns = [[[-27.5, -20], [27.5, -20]], [[27.5, -20], [27.5, 20]], [[27.5, 20], [-15, 20]], [[-19, 20], [-27.5, 20]], [[-27.5, 20], [-27.5, -20]]];
  let fenceIndex = 0;
  for (const [p, q] of fenceRuns) {
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]), count = Math.ceil(length / 2.5);
    const step = length / count, direction = [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
    const rotation = -Math.atan2(direction[1], direction[0]);
    for (let i = 0; i < count; i++) {
      const x = p[0] + direction[0] * (i + 0.5) * step, z = p[1] + direction[1] * (i + 0.5) * step;
      add(`fence-panel-${++fenceIndex}`, 'fence_panel', [x, 0, z], rotation, { assembly: 'perimeter', moduleLengthM: step, scale: [step / 2.5, 1, 1] });
      add(`fence-post-${fenceIndex}`, 'fence_post', [p[0] + direction[0] * i * step, 0, p[1] + direction[1] * i * step], rotation, { assembly: 'perimeter' });
      add(`outrigger-${fenceIndex}`, 'outrigger', [p[0] + direction[0] * i * step, 2.3, p[1] + direction[1] * i * step], rotation, { assembly: 'perimeter', elevated: true });
    }
  }
  add('main-gate', 'gate', [-17, 0, 20], 0, { assembly: 'perimeter', pivotRotations: { gate_leaf_left: [0, 80 * Math.PI / 180, 0], gate_leaf_right: [0, -80 * Math.PI / 180, 0] } });
  const trenches = [
    { id: 'main', widthM: 0.6, depthM: 0.6, covered: true, polyline: [[-12, 5], [21, 5], [21, 9]] },
    { id: 'grid-1', widthM: 0.6, depthM: 0.6, covered: true, polyline: [[-12, 0], [-12, 5]] },
    { id: 'grid-2', widthM: 0.6, depthM: 0.6, covered: true, polyline: [[1, 0], [1, 5]] },
  ];
  let cover = 0;
  for (const trench of trenches) for (let j = 1; j < trench.polyline.length; j++) {
    const p = trench.polyline[j - 1], q = trench.polyline[j], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const coverLength = equipmentTypes.trench_cover.variantBinding.envelope[0], count = Math.ceil(len / coverLength), step = len / count;
    const rotation = -Math.atan2(q[1] - p[1], q[0] - p[0]);
    for (let i = 0; i < count; i++) add(`trench-cover-${++cover}`, 'trench_cover', [p[0] + (q[0] - p[0]) * (i + 0.5) / count, -0.1, p[1] + (q[1] - p[1]) * (i + 0.5) / count], rotation, { assembly: 'covered-trenches', moduleLengthM: step, scale: [step / coverLength, 1, 1] });
  }
  // Ground tiles are render hints. Tile scales cover the 55x40 m compound exactly.
  const surfacePatches = [{ id: 'yard-gravel', type: 'gravel_tile', polygon: rect(55, 40), tilePitchM: 2, y: -0.06 }, { id: 'visitor-concrete', type: 'concrete_tile', polygon: [[-25, 16], [23, 16], [23, 19], [-25, 19]], tilePitchM: 2, y: -0.1 }];
  add('gravel-sample', 'gravel_tile', [-25, -0.06, 10]);
  add('concrete-sample', 'concrete_tile', [-23, -0.1, 17.5]);
  add('gravel-weeds', 'dry_weeds', [23.5, 0, -6]);
  const plan = {
    schemaVersion: 1, units: 'metres', axes: '+Y up; +Z front; rotations about Y in radians', origin: [0, 0, 0],
    variant, variantProfile: profile(variant),
    purpose: 'offline library yard data; deliberately not registered or loaded by the game',
    clearances: 'Plausible visual clearances only; not engineering-certified. No real operating instructions.',
    audio: { humFrequencyHz: 100, enabledByDefault: false, note: 'Both variants intentionally request a 100 Hz scene cue. UK mains are 50 Hz. Colombian mains are 60 Hz, for which twice-frequency magnetostriction would normally be 120 Hz; this asset cue is an artistic override, not a grid-frequency claim.' },
    compound: { size: [55, 40], fencePolyline, gate: { id: 'main-gate', centre: [-17, 0, 20], widthM: 4, visitorGap: [[-19, 20], [-15, 20]], openingDegrees: 80 } },
    controlBuilding: { id: 'control-building', footprint: [[10, 8.5], [22, 8.5], [22, 15.5], [10, 15.5]], entrance: [16, 0, 15.5] },
    equipmentTypes, equipment,
    bays: [
      { id: 'incoming', polygon: [[-21, -19], [23, -19], [23, -7], [-21, -7]], level: 'hv' },
      { id: 'grid-1', polygon: [[-18, -5.5], [-6, -5.5], [-6, 4], [-18, 4]], level: 'hv-mv' },
      { id: 'grid-2', polygon: [[-5, -5.5], [7, -5.5], [7, 4], [-5, 4]], level: 'hv-mv' },
      { id: 'distribution', polygon: [[8, -6], [26, -6], [26, 3], [8, 3]], level: 'mv-lv' },
    ],
    trenches, surfacePatches,
    visitorRoute: {
      eyeHeightM: 1.6, bodyHeightM: 1.8, radiusM: 0.35, comfortMarginM: 0.25, liveReachM: 1,
      entryGate: 'main-gate', gateMustBeOpen: true,
      points: [[-17, 0, 20], [-17, 0, 17.5], [-23.5, 0, 17.5], [-23.5, 0, 8], [-23.5, 0, -7], [-21.8, 0, -7], [-23.5, 0, -7], [-23.5, 0, 17.5], [16, 0, 17.5]],
      stops: [{ name: 'grid-transformer-view', position: [-23.5, 0, 1], facingY: Math.PI / 2 }, { name: 'incoming-bay-view', position: [-21.8, 0, -7], facingY: 0 }, { name: 'control-room-front', position: [16, 0, 17.5], facingY: Math.PI }],
    },
    spans: [
      { id: 'incoming-double-circuit', from: 'incoming-suspension', to: 'incoming-terminal', level: 'hv', circuits: 2, phasesPerCircuit: 3, recipe: 'variantProfile.lineRecipes.hv', attachmentRecipe: 'catalogue lineAnchors transformed by equipment pose; exact normalized insulator endpoints' },
      { id: 'medium-outgoing', from: 'outgoing-medium', toPoint: [18, 11, -70], level: 'mv', circuits: 1, phasesPerCircuit: 3, recipe: 'variantProfile.lineRecipes.mv' },
      { id: 'low-outgoing', from: 'outgoing-low', toPoint: [70, 9, 2], level: 'lv', circuits: 1, phasesPerCircuit: 3, recipe: 'variantProfile.lineRecipes.lv' },
    ],
  };
  plan.variantProfile.resolvedSpans = resolveYardSpans(plan);
  return plan;
}

/** Explicit conductor endpoints for previews/integration, resolved from the plan. */
export function resolveYardSpans(plan) {
  const result = [], byId = new Map(plan.equipment.map((e) => [e.id, e]));
  const transform = (point, item) => {
    const c = Math.cos(item.rotationY), s = Math.sin(item.rotationY);
    return [item.position[0] + point[0] * c + point[2] * s, item.position[1] + point[1], item.position[2] - point[0] * s + point[2] * c];
  };
  const emit = (id, start, end, recipe) => {
    const horizontal = Math.hypot(end[0] - start[0], end[2] - start[2]);
    result.push({ id, start, end, sagM: recipe.sagM * horizontal / recipe.spanM, conductorRadiusM: recipe.conductorRadiusM, maxSegmentLengthM: 0.6 });
  };
  for (const span of plan.spans) {
    const from = byId.get(span.from), to = byId.get(span.to), recipe = plan.variantProfile.lineRecipes[span.level];
    if (!from || !recipe) throw new Error(`${span.id}: unresolved support/recipe`);
    const fromAnchors = plan.equipmentTypes[from.type].variantBinding.lineAnchors;
    if (!Array.isArray(fromAnchors) || fromAnchors.length !== span.circuits * span.phasesPerCircuit) throw new Error(`${span.id}: exact line anchors missing from catalogue`);
    if (span.level === 'hv') {
      if (!to) throw new Error(`${span.id}: terminal tower missing`);
      const toAnchors = plan.equipmentTypes[to.type].variantBinding.lineAnchors;
      for (const anchor of fromAnchors) {
        const endAnchor = toAnchors.find((a) => a.circuit === anchor.circuit && a.phase === anchor.phase);
        if (!endAnchor) throw new Error(`${span.id}: matching terminal phase missing`);
        emit(`${span.id}-c${anchor.circuit + 1}p${anchor.phase + 1}`, transform(anchor.position, from), transform(endAnchor.position, to), recipe);
      }
    } else {
      const endpoint = to ? [...to.position] : [...span.toPoint];
      for (const anchor of fromAnchors) {
        const start = transform(anchor.position, from);
        // toPoint is a remote crossarm-centre anchor, not a ground-level pole base.
        emit(`${span.id}-${anchor.phase + 1}`, start, [endpoint[0] + start[0] - from.position[0], endpoint[1], endpoint[2] + start[2] - from.position[2]], recipe);
      }
    }
  }
  return result;
}

export function transformFootprint(polygon, item) {
  const s = Math.sin(item.rotationY), c = Math.cos(item.rotationY), scale = item.scale || [1, 1, 1];
  return polygon.map(([x, z]) => [item.position[0] + c * x * scale[0] + s * z * scale[2], item.position[2] - s * x * scale[0] + c * z * scale[2]]);
}

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function onSegment(a, b, p) {
  return Math.abs(cross(a, b, p)) < 1e-9 && p[0] >= Math.min(a[0], b[0]) - 1e-9 && p[0] <= Math.max(a[0], b[0]) + 1e-9 && p[1] >= Math.min(a[1], b[1]) - 1e-9 && p[1] <= Math.max(a[1], b[1]) + 1e-9;
}
function intersects(a, b, c, d) {
  const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
  return (x * y < 0 && z * w < 0) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
function pointDistance(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
export function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(a, b, p)) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Exact segment/edge intersection plus minimum distance; no coarse route sampling. */
export function segmentPolygonDistance(start, end, polygon) {
  if (pointInPolygon(start, polygon) || pointInPolygon(end, polygon)) return 0;
  let result = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (intersects(start, end, a, b)) return 0;
    result = Math.min(result, pointDistance(start, a, b), pointDistance(end, a, b), pointDistance(a, start, end), pointDistance(b, start, end));
  }
  return result;
}

function simplePolygon(poly) {
  if (!Array.isArray(poly) || poly.length < 3 || !poly.every(finite2)) return false;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
    for (let k = i + 1; k < poly.length; k++) {
      const l = (k + 1) % poly.length;
      if (i === k || j === k || l === i) continue;
      if (intersects(poly[i], poly[j], poly[k], poly[l])) return false;
    }
  }
  return Math.abs(area) > 1e-6;
}

/** Validate independently of the generator's authored placement loops. */
export function validateSubstationPlan(plan, { catalogue = null } = {}) {
  const failures = [], check = (value, message) => { if (!value) failures.push(message); };
  if (!plan || typeof plan !== 'object') return { ok: false, failures: ['plan is missing'] };
  const variant = plan.variant;
  check(['uk', 'co'].includes(variant), 'invalid variant');
  check(plan.schemaVersion === 1 && plan.units === 'metres' && same(plan.origin, [0, 0, 0]), 'schema, metre units or compound-centred origin differs');
  check(same(plan.compound?.size, [55, 40]), 'compound must be 55 x 40 metres');
  check(same(plan.variantProfile?.voltageKV, variant === 'uk' ? [132, 33, 11] : [115, 34.5, 13.2]), 'voltage levels disagree with variant');
  check(plan.audio?.humFrequencyHz === 100 && plan.audio?.enabledByDefault === false, '100 Hz cue must be explicit and disabled by default');
  check(plan.variantProfile?.gridFrequencyHz === (variant === 'uk' ? 50 : 60), 'grid frequency disagrees with variant');
  check(plan.variantProfile?.signLanguage === (variant === 'uk' ? 'en' : 'es'), 'sign language disagrees with variant');
  const types = plan.equipmentTypes || {};
  check(same(Object.keys(types).sort(), [...TYPE_IDS].sort()), 'equipment type inventory differs');
  for (const [type, entry] of Object.entries(types)) {
    const size = entry.variantBinding?.envelope, asset = entry.variantBinding?.asset;
    check(positive3(size) && positive3(entry.accessEnvelope), `${type}: invalid metre envelope`);
    if (positive3(size) && positive3(entry.accessEnvelope)) check(size.every((v, i) => entry.accessEnvelope[i] >= v), `${type}: access envelope is smaller than actual equipment`);
    const expected = `substation_${type in SITE ? `${variant}_` : ''}${type}`;
    check(asset === expected, `${type}: wrong variant/shared asset binding`);
    if (catalogue) {
      const cat = catalogue.assets?.[asset];
      check(!!cat, `${type}: asset is absent from catalogue`);
      if (cat) {
        check(same(size, cat.size), `${type}: envelope differs from catalogue metres`);
        check(same(entry.variantBinding.pivotAnchors, cat.pivotDefinitions || []), `${type}: exact pivot anchor positions differ from catalogue`);
        check(same(entry.variantBinding.lineAnchors, cat.lineAnchors || []), `${type}: exact line-anchor positions differ from catalogue`);
      }
    }
    check(same(entry.inspectionNote, { es: '', en: '' }), `${type}: bilingual inspection-note slots must remain empty`);
    const anchors = entry.anchors;
    check(!!anchors && finite3(anchors.standing?.position), `${type}: named standing anchor missing`);
    check(anchors?.standing?.name === 'inspection_stand', `${type}: standing anchor name differs`);
    check(Array.isArray(anchors?.lamps) && Array.isArray(anchors?.doorHinges) && Object.hasOwn(anchors || {}, 'seat') && Object.hasOwn(anchors || {}, 'hum100Hz'), `${type}: incomplete anchor slots`);
    if (HUM.has(type)) check(anchors?.hum100Hz?.frequencyHz === 100 && finite3(anchors?.hum100Hz?.position) && anchors.hum100Hz.name === 'hum_100hz', `${type}: hum anchor must specify 100 Hz`);
    else check(anchors?.hum100Hz === null, `${type}: passive equipment should have a null hum anchor`);
    if (type === 'chair') check(anchors?.seat?.name === 'seat' && finite3(anchors.seat.position), 'chair: seat anchor missing');
    for (const anchor of anchors?.lamps || []) check(typeof anchor.name === 'string' && !!anchor.name && finite3(anchor.position), `${type}: malformed named lamp anchor`);
    for (const anchor of anchors?.doorHinges || []) {
      check(typeof anchor.name === 'string' && anchor.name && anchor.nodeSuffix === anchor.name && same(anchor.axis, [0, 1, 0]), `${type}: malformed hinge node anchor`);
      if (catalogue) check(catalogue.assets?.[asset]?.pivots?.includes(anchor.nodeSuffix), `${type}: hinge anchor absent from GLB catalogue`);
    }
    const traversable = TRAVERSABLE.has(type);
    check(entry.traversable === traversable, `${type}: traversability differs`);
    if (traversable) check(Array.isArray(entry.navKeepOut) && entry.navKeepOut.length === 0, `${type}: walkable surface has a keep-out`);
    else {
      check(simplePolygon(entry.navKeepOut), `${type}: invalid keep-out polygon`);
      if (simplePolygon(entry.navKeepOut) && positive3(entry.accessEnvelope)) {
        const margin = ELECTRICAL.has(type) ? 2 : 0;
        for (const corner of rect(entry.accessEnvelope[0], entry.accessEnvelope[2], margin)) check(pointInPolygon(corner, entry.navKeepOut), `${type}: keep-out does not contain equipment and live margin`);
      }
    }
    check(entry.liveParts?.energised === ELECTRICAL.has(type), `${type}: live-parts classification differs`);
    if (ELECTRICAL.has(type)) check(entry.liveParts?.exclusionMarginM >= 2, `${type}: live-parts margin reduced`);
  }
  const equipment = Array.isArray(plan.equipment) ? plan.equipment : [];
  const ids = new Set(), counts = {};
  for (const item of equipment) {
    check(typeof item.id === 'string' && item.id.length && !ids.has(item.id), `duplicate/missing equipment id ${item.id}`); ids.add(item.id);
    check(Object.hasOwn(types, item.type), `${item.id}: unknown equipment type`);
    check(finite3(item.position) && Number.isFinite(item.rotationY), `${item.id}: invalid placement/rotation`);
    if (item.scale) check(positive3(item.scale) && ['fence_panel', 'trench_cover'].includes(item.type) && item.scale[0] <= 1 && item.scale[1] === 1 && item.scale[2] === 1, `${item.id}: only fence/trench infills may reduce their width`);
    if (item.elevated) check(ELEVATED.has(item.type), `${item.id}: this equipment type cannot bypass ground placement as elevated`);
    for (const [name, angles] of Object.entries(item.pivotRotations || {})) {
      const def = types[item.type]?.variantBinding?.pivotAnchors?.find((a) => a.name === name);
      check(!!def && finite3(angles), `${item.id}: unknown or invalid pivot pose ${name}`);
      if (def && finite3(angles)) {
        const axis = def.axis.findIndex((n) => Math.abs(n) > 0.9);
        check(axis >= 0 && angles.every((n, i) => i === axis || Math.abs(n) < 1e-9), `${item.id}: pose rotates a hinge off its axis`);
        if (axis >= 0) check(angles[axis] >= def.range[0] - 1e-6 && angles[axis] <= def.range[1] + 1e-6, `${item.id}: pose exceeds hinge range`);
      }
    }
    counts[item.type] = (counts[item.type] || 0) + 1;
    if (finite3(item.position) && !item.external) check(Math.abs(item.position[0]) <= 27.5 + 1e-5 && Math.abs(item.position[2]) <= 20 + 1e-5, `${item.id}: unmarked external placement`);
    if (item.indoor) {
      check(item.assembly === 'control-building' && !ELECTRICAL.has(item.type), `${item.id}: invalid indoor safety exemption`);
      if (finite3(item.position) && simplePolygon(plan.controlBuilding?.footprint)) check(pointInPolygon([item.position[0], item.position[2]], plan.controlBuilding.footprint), `${item.id}: indoor item outside control building`);
    }
    if (!item.elevated && !TRAVERSABLE.has(item.type) && finite3(item.position)) check(item.position[1] >= 0 && item.position[1] <= 0.6, `${item.id}: unmarked floating/buried equipment`);
  }
  check(counts.grid_transformer === 2 && counts.distribution_transformer === 2, 'yard must contain two grid and two distribution transformers');
  check(counts.switchboard_panel === 12, 'indoor board must contain twelve panels');
  for (const type of TYPE_IDS) check((counts[type] || 0) > 0, `no placed instance of ${type}`);
  check(counts.tower_suspension === 1 && counts.tower_tension === 1 && counts.pole_mv === 1 && counts.pole_lv === 1, 'incoming/outgoing line-support inventory differs');
  const route = plan.visitorRoute, points = route?.points;
  check(Array.isArray(points) && points.length >= 3 && points.every(finite3), 'visitor route points are invalid');
  check(route?.eyeHeightM === 1.6 && route?.bodyHeightM >= 1.8 && route?.radiusM >= 0.35 && route?.comfortMarginM >= 0.25 && route?.liveReachM >= 1, 'visitor anthropometric clearance contract differs');
  check(route?.gateMustBeOpen === true && route?.entryGate === plan.compound?.gate?.id, 'visitor gate condition missing');
  check(plan.compound?.gate?.widthM === 4 && same(plan.compound.gate.centre, [-17, 0, 20]), 'gate location/width differs');
  const gate = equipment.find((e) => e.id === route?.entryGate), gateAngle = plan.compound?.gate?.openingDegrees;
  check(Number.isFinite(gateAngle) && gateAngle >= 75 && gateAngle <= 90, 'gate must be open 75 to 90 degrees for the visitor route');
  if (gate) {
    check(same(gate.pivotRotations?.gate_leaf_left, [0, gateAngle * Math.PI / 180, 0]) && same(gate.pivotRotations?.gate_leaf_right, [0, -gateAngle * Math.PI / 180, 0]), 'gate hinge poses do not match clear visitor entry');
  }
  if (points?.every(finite3) && Number.isFinite(route.radiusM) && Number.isFinite(route.comfortMarginM)) {
    check(same(points[0], plan.compound?.gate?.centre), 'visitor route does not start at gate centre');
    for (const p of points) check(Math.abs(p[0]) <= 27.5 && Math.abs(p[2]) <= 20 && p[1] === 0, 'visitor route leaves level compound');
    const radius = route.radiusM + route.comfortMarginM;
    check(Array.isArray(route.stops) && route.stops.length >= 3, 'visitor inspection stops missing');
    const stopNames = new Set();
    for (const stop of route.stops || []) {
      check(typeof stop.name === 'string' && stop.name.length && !stopNames.has(stop.name) && finite3(stop.position) && Number.isFinite(stop.facingY), 'invalid or duplicate visitor inspection stop');
      stopNames.add(stop.name);
      if (finite3(stop.position) && points.length >= 2) {
        const p = [stop.position[0], stop.position[2]];
        const distance = Math.min(...points.slice(1).map((q, i) => pointDistance(p, [points[i][0], points[i][2]], [q[0], q[2]])));
        check(distance <= 1e-6 && stop.position[1] === 0, `${stop.name}: inspection stop leaves checked visitor route`);
      }
    }
    for (const item of equipment) {
      const entry = types[item.type];
      if (!entry || entry.traversable || item.indoor || item.id === route.entryGate || !simplePolygon(entry.navKeepOut) || !finite3(item.position) || !Number.isFinite(item.rotationY)) continue;
      // Elevated is descriptive metadata, never a safety exemption: actual Y is
      // checked against the visitor's head/reach envelope before dropping a blocker.
      if (item.position[1] > (entry.liveParts.energised ? route.bodyHeightM + route.liveReachM : route.bodyHeightM) + 0.2) continue;
      const polygon = transformFootprint(entry.navKeepOut, item);
      for (let i = 1; i < points.length; i++) {
        const d = segmentPolygonDistance([points[i - 1][0], points[i - 1][2]], [points[i][0], points[i][2]], polygon);
        check(d >= radius - 1e-6, `visitor route segment ${i - 1} intersects keep-out/buffer of ${item.id} (${d.toFixed(3)} m)`);
      }
    }
  }
  check(Array.isArray(plan.trenches) && plan.trenches.length >= 3 && plan.trenches.every((t) => t.covered === true && t.widthM > 0 && t.depthM > 0 && t.polyline?.length >= 2 && t.polyline.every(finite2)), 'covered cable-trench data missing or invalid');
  check(Array.isArray(plan.compound?.fencePolyline) && plan.compound.fencePolyline.every(finite2) && same(plan.compound.fencePolyline[0], plan.compound.fencePolyline.at(-1)), 'closed fence polyline missing');
  check(simplePolygon(plan.controlBuilding?.footprint), 'control-building footprint missing');
  check(Array.isArray(plan.spans) && plan.spans.length === 3, 'line-span inventory differs');
  for (const span of plan.spans || []) {
    check(ids.has(span.from) && (ids.has(span.to) || finite3(span.toPoint)), `${span.id}: unresolved span attachment`);
    const recipe = plan.variantProfile?.lineRecipes?.[span.level];
    check(!!recipe && recipe.sagM > 0 && recipe.spanM > 0 && recipe.phaseSpacingM > 0, `${span.id}: invalid catenary recipe`);
    if (recipe) {
      try { solveCatenary([0, 20, 0], [recipe.spanM, 21, 0], { sag: recipe.sagM }); }
      catch (e) { failures.push(`${span.id}: ${e.message}`); }
    }
  }
  if (Array.isArray(plan.spans) && plan.spans.length === 3 && plan.variantProfile?.lineRecipes && equipment.length) {
    try {
      const resolved = resolveYardSpans(plan);
      check(same(plan.variantProfile.resolvedSpans, resolved), 'resolved conductor endpoints/sags differ from source plan');
      check(resolved.length === 12, 'twelve phase spans required');
      for (const span of resolved) solveCatenary(span.start, span.end, { sag: span.sagM });
    } catch (error) { failures.push(`resolved span data: ${error.message}`); }
  }
  return { ok: failures.length === 0, failures, variant, equipmentCount: equipment.length, typeCount: Object.keys(types).length, routeSegmentCount: Math.max(0, (points?.length || 0) - 1), counts };
}

/** Only these explicitly variant-owned fields may differ; everything else is equal. */
export function parityCanonical(plan) {
  const result = clone(plan); delete result.variant; delete result.variantProfile;
  for (const type of Object.values(result.equipmentTypes || {})) delete type.variantBinding;
  return result;
}
export function validateYardParity(uk, co) {
  const failures = [];
  if (uk?.variant !== 'uk' || co?.variant !== 'co') failures.push('parity needs uk and co plans');
  if (!same(parityCanonical(uk), parityCanonical(co))) failures.push('yard parity differs outside explicit variant/profile and type binding fields');
  return { ok: failures.length === 0, failures, equipmentCount: uk?.equipment?.length || 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cataloguePath = resolve(HERE, 'blender/substation.catalog.json');
  const catalogue = existsSync(cataloguePath) ? JSON.parse(readFileSync(cataloguePath, 'utf8')) : null;
  if (process.argv.includes('--write')) for (const variant of ['uk', 'co']) writeFileSync(PLAN_PATHS[variant], JSON.stringify(createSubstationPlan(variant, { catalogue }), null, 2) + '\n');
  const plans = Object.fromEntries(['uk', 'co'].map((v) => [v, JSON.parse(readFileSync(PLAN_PATHS[v], 'utf8'))]));
  const reports = ['uk', 'co'].map((v) => validateSubstationPlan(plans[v], { catalogue }));
  for (const report of reports) console.log(`${report.ok ? 'PASS' : 'FAIL'} substation yard ${report.variant}: ${report.equipmentCount} instances; ${report.typeCount} types; ${report.routeSegmentCount} visitor-route segments${report.failures.length ? '\n' + report.failures.join('\n') : ''}`);
  const parity = validateYardParity(plans.uk, plans.co);
  console.log(`${parity.ok ? 'PASS' : 'FAIL'} yard parity: ${parity.equipmentCount} matching equipment instances${parity.failures.length ? '\n' + parity.failures.join('\n') : ''}`);
  if (reports.some((r) => !r.ok) || !parity.ok) process.exitCode = 1;
}
