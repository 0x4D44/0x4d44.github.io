// A private, reproducible rubric evidence pack from a built page. Chrome is only launched by main().
// node tools/evidence.mjs --gpu --dist <built directory> --out <worktree/.scratch/pack> [--relay http://127.0.0.1:8787]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { constants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { PLATFORM_HEIGHT, railSegments, twinRails } from '../core/scene.ts';
import { GAUGE, RAIL_HEAD_WIDTH, buildingsUnderStation, concourseCanopy, platformReport, pointInPolygon, shedLayout, stationBuilding, stationPlatforms } from '../core/station.ts';
import { REPLACED_BUILDING_IDS } from '../core/landmarks.ts';
import { planBuilding } from '../core/city.ts';
import { createTerrain } from '../core/terrain.ts';
import { ALL_KINDS, FIGURES, EMU_FIGURES, trainLayout } from '../core/train.ts';
import { FLICKER_GAP_MS, compareFrames, flickerSummary } from './flicker.mjs';
import { PIN_TIME, PIN_WEATHER, WEATHER_NAMES, pinHonoured, pinParameters, scenePinFrom, withPin } from './scene-pin.mjs';
import { HUD_NOTE, HUD_SELECTORS, hudController, hudMode } from './hud.mjs';
import { stationData } from './station-scene.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const packageRoot = path.resolve(here, '..');
export const VIEWPORTS = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };
// The stands below are what the frozen station cameras (FROZEN_STATION_CAMERAS) were placed from. The cameras are literals and do not
// read these; the tests that measure a camera against its subject (camera-faults, evidence) read them, so a stand that no longer
// matches its camera shows up there.
/** Metres west of the Western Range's west face that `western-range` and `western-range-full` stand, to see its whole elevation. */
export const WESTERN_RANGE_STANDOFF = 62;
/**
 * The page draws over its own frame. In an 800 row capture the station switcher covers rows 48-125 below column 680 (web/src/stations.ts)
 * and the status and attribution lines everything from row 714 (web/src/main.ts), so the cameras that frame one subject end to end
 * (the clock tower, the hotel) keep it between rows 130 and 706: a spire tip behind the "Edinburgh Waverley" button is not framed.
 */
export const HUD_FREE_ROWS = { top: 130, bottom: 706, height: 800 };
/** Metres out along the Midland Grand clock tower's front normal, and the eye height there, that `midland-clock-tower` stands, to frame the whole tower. */
export const CLOCK_TOWER_STANDOFF = 60;
export const CLOCK_TOWER_EYE_Y = 40;
/** Metres west of the concourse canopy's west rim that `concourse-exterior-west` stands, to see the whole roof. */
export const CONCOURSE_WEST_STANDOFF = 38;
export const TRAIN_FACTORY_HOOK = 'Object.assign(kx, { evidenceBuildTrain: buildTrain });';
export const AXES = [
  ['01', 'Geometric fidelity', 'Platform lengths, gauge, top/side 10 m grids; raw-OSM fidelity comparison remains a separate command.'],
  ['02', 'Station look', 'Fixed world cameras, frozen at the baseline values; each was placed from the station frame, the OSM landmark plans or a reference photograph.'],
  ['03', 'Train models', 'Sample Azuma detail shots and dimension tests; a staged 387 is explicitly labelled.'],
  ['04', 'Live-data correctness', 'Replay inventory/churn report, live/replay comparison command, and board shots.'],
  ['05', 'Motion', 'Recording audit plus successive replay frames, with observed motion positions.'],
  ['06', 'Signals', 'Private decoded table and observed proceed/danger/unknown states; inferred positions stay labelled.'],
  ['07', 'Robustness and security', 'Public-host samples, proxy-stopped feed, connected/drop/recovery, relay tests and host refusal.'],
  ['08', 'Performance and size', 'Actual renderer, frame timings, first render and hashed/gzipped build inventory.'],
  ['09', 'Engineering quality', 'Recorded test/typecheck commands; scorer reruns these and the responsive/catalog checks.'],
].map(([id, name, evidence]) => ({ id, name, evidence }));

/**
 * The fixed station views each graphical-fidelity element is scored from (gfx-rubrics/rubric-<element>.md, "Fixed views"),
 * so an iterator can capture only its own: `node tools/evidence.mjs --gpu --views kx-front ...`. A view may belong to
 * several elements. `<camera>-solid-slate` names are the physical-slate override shot of that camera.
 */
export const ELEMENT_VIEWS = {
  'lighting-materials': ['overview', 'south-front', 'front-oblique-solid-slate', 'platform-eye', 'concourse', 'great-northern-hotel', 'midland-grand-front', 'gasworks-portals', 'facade-brick-close'],
  'kx-front': ['south-front', 'front-oblique', 'front-oblique-solid-slate', 'roof-above-solid-slate', 'north-gable', 'tower-close', 'front-southwest-pedestrian', 'shed-east-flank'],
  'shed-interior': ['platform-eye', 'platform-eye-south', 'shed-interior', 'platform-eye-p1-north', 'platform-eye-p8-south', 'roof-underside', 'furniture-close', 'suburban-p9'],
  'western-concourse': ['concourse', 'concourse-roof-detail', 'western-range', 'western-range-gateline', 'concourse-hotel-junction', 'concourse-exterior-square', 'concourse-funnel-up', 'western-range-full', 'concourse-exterior-west'],
  'historic-neighbours': ['great-northern-hotel', 'midland-grand-front', 'st-pancras-shed', 'st-pancras-shed-oblique', 'gnh-from-square', 'midland-euston-road', 'midland-clock-tower', 'barlow-interior'],
  'city-surroundings': ['overview', 'gasworks-portals', 'front-oblique', 'granary-square', 'gasholders', 'canal-lock', 'kings-boulevard', 'euston-road-east'],
};

/**
 * The part a view plays in scoring, for the criteria that have more than one stand in the pack. A criterion is scored from its
 * `official` view; a `context` view stays in the pack, labelled so, for what it shows around the subject. The western-concourse scorer
 * found the rubric's frozen stand for C6 (`concourse-exterior-square`, in King's Cross Square) unusable: the Great Northern Hotel stands
 * in front of about half of the canopy from it (tests/camera-faults.test.mjs measures it). The lead decided that C6 is scored from
 * `concourse-exterior-west` (Pancras Road: the whole roof, the hotel at the right edge) and that the square stays as context.
 */
export const VIEW_ROLES = Object.freeze({
  'concourse-exterior-west': Object.freeze({ element: 'western-concourse', criterion: 'C6', role: 'official',
    label: 'Official exterior view for western-concourse criterion C6, the view C6 is scored from: the whole roof from Pancras Road, with the Great Northern Hotel at the right edge.' }),
  'concourse-exterior-square': Object.freeze({ element: 'western-concourse', criterion: 'C6', role: 'context',
    label: 'Context for western-concourse criterion C6, not the view it is scored from: the rubric\'s frozen stand in King\'s Cross Square, from which the Great Northern Hotel stands in front of about half of the canopy. C6 is scored from concourse-exterior-west.' }),
});

/** A view's part in scoring as a capture record carries it, `scoring` ({ element, criterion, role }) and a `label`; nothing for a view that has none. */
export function viewScoring(name) {
  if (!Object.hasOwn(VIEW_ROLES, name)) return {};
  const { element, criterion, role, label } = VIEW_ROLES[name];
  return { scoring: { element, criterion, role }, label };
}

/** The pack index's note on the scoring parts of the views it holds (capture records that carry `scoring`), one line each; '' when there are none. */
export function scoringViewsNote(records) {
  const lines = records.filter(record => record.scoring).map(record => `- ${record.scoring.element} ${record.scoring.criterion}, ${record.scoring.role}: ${record.file}: ${record.label}`);
  return lines.length ? `Scoring views: a criterion is scored from its official view; a context view is in the pack for what it shows around the subject, not for the score.\n\n${lines.join('\n')}\n\n` : '';
}

/** Every fixed station view a pack can capture: each camera, plus the solid-slate override shot of the two paired cameras. */
export function stationViewNames(cameras) {
  return [...Object.keys(cameras), ...roofMaterialEvidencePairs(cameras).map(pair => `${pair.cameraName}-solid-slate`)];
}

/**
 * Turn a `--views` value into the set of view names to capture, or null for the whole pack (`all`, or no `--views`).
 * Each comma-separated token is an element (see ELEMENT_VIEWS), a single view name, or `station` for every fixed station view.
 */
export function resolveViews(spec, cameras) {
  if (spec === undefined || spec === 'all') return null;
  const known = new Set(stationViewNames(cameras)), names = new Set();
  for (const token of String(spec).split(',').map(t => t.trim())) {
    if (token === 'station') for (const view of known) names.add(view);
    else if (Object.hasOwn(ELEMENT_VIEWS, token)) {
      for (const view of ELEMENT_VIEWS[token]) {
        if (!known.has(view)) throw new Error(`element ${token} lists ${view}, which is not a station camera`);
        names.add(view);
      }
    } else if (known.has(token)) names.add(token);
    else throw new Error(`unknown view or element: ${token || '(empty)'}. Elements: ${Object.keys(ELEMENT_VIEWS).join(', ')}. Views: ${[...known].join(', ')}`);
  }
  return names;
}

export function within(root, file) { const rel = path.relative(root, file); return rel === '' || !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel); }
export function relayUrl(value) {
  if (!value) return null;
  let u; try { u = new URL(value); } catch { throw new Error('--relay must be a loopback HTTP origin'); }
  if (!['http:', 'https:'].includes(u.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ||
      u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('--relay must be a loopback HTTP origin without credentials or a path');
  return u;
}
export function optionsFrom(args) {
  const values = new Map(), switches = new Set(['--gpu', '--help']);
  const names = new Set(['--dist', '--out', '--relay', '--chrome', '--date', '--speed', '--signal-at', '--raw-osm', '--live-window', '--live-report', '--views', '--time', '--weather', '--sky', '--hud', '--scene', '--commit']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (values.has(key) || !switches.has(key) && !names.has(key)) throw new Error(`unknown or repeated option: ${key}`);
    if (switches.has(key)) values.set(key, true);
    else { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`missing value for ${key}`); values.set(key, args[++i]); }
  }
  const date = values.get('--date') ?? '20261107', speed = Number(values.get('--speed') ?? 8), signalAt = values.get('--signal-at') ?? '16:23:55';
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  if (!/^\d{8}$/.test(date) || !Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 10) !== iso) throw new Error('--date must be a real YYYYMMDD date');
  if (!Number.isFinite(speed) || speed <= 0 || speed > 120) throw new Error('--speed must be positive and at most 120');
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(signalAt)) throw new Error('--signal-at must be HH:mm:ss (UK recording time)');
  const liveWindowText = values.get('--live-window');
  const liveWindow = liveWindowText === undefined ? null : Number(liveWindowText);
  if (liveWindowText !== undefined && (!Number.isInteger(liveWindow) || liveWindow < 1 || liveWindow > 3600)) throw new Error('--live-window must be an integer from 1 to 3600 seconds');
  if (liveWindow !== null && !values.has('--relay')) throw new Error('--live-window requires --relay');
  if (liveWindow !== null && values.has('--live-report')) throw new Error('--live-window and --live-report cannot be used together');
  const liveReport = values.has('--live-report') ? path.resolve(values.get('--live-report')) : null;
  const out = path.resolve(values.get('--out') ?? path.join(repoRoot, '.scratch/evidence'));
  if (!within(path.join(repoRoot, '.scratch'), out)) throw new Error('--out must be under this worktree .scratch (the pack contains private derived data)');
  const views = values.get('--views') ?? 'all';
  if (views !== 'all') {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:,[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(views)) throw new Error('--views must be all, or element and view names separated by commas');
    const notStation = ['--relay', '--live-window', '--live-report', '--raw-osm', '--date', '--speed', '--signal-at'].filter(key => values.has(key));
    if (notStation.length) throw new Error(`--views captures fixed station views only; remove ${notStation.join(', ')}`);
  }
  // --scene waverley: the frozen Edinburgh Waverley cameras only (waverleyMain); none of the London pack's relay or replay options apply.
  const scene = values.get('--scene') ?? 'kings-cross';
  if (!['kings-cross', 'waverley', 'perth'].includes(scene)) throw new Error('--scene must be kings-cross, waverley or perth');
  if (scene !== 'kings-cross') {
    const site = REMOTE_CAPTURE_SITES[scene];
    const london = ['--relay', '--live-window', '--live-report', '--raw-osm', '--date', '--speed', '--signal-at'].filter(key => values.has(key));
    if (london.length) throw new Error(`--scene ${scene} captures the frozen ${site.label} cameras only; remove ${london.join(', ')}`);
    resolveWaverleyViews(views, site.cameras(), site.elements, site.label);
  }
  const commit = values.get('--commit') ?? null;
  if (commit !== null && !/^[0-9a-f]{7,40}$/.test(commit)) throw new Error('--commit must be the commit the --dist was built from (7 to 40 hex digits)');
  const pin = scenePinFrom({ time: values.get('--time'), weather: values.get('--weather'), sky: values.get('--sky') });
  const hud = hudMode(values.get('--hud'));
  return { dist: path.resolve(values.get('--dist') ?? path.join(repoRoot, '.scratch/kx-dist')), out, views, pin, hud, scene, commit,
    rawOsm: path.resolve(values.get('--raw-osm') ?? path.join(os.homedir(), 'kx-data/osm/kx-osm.json')), relay: relayUrl(values.get('--relay')), chrome: values.get('--chrome'), gpu: values.has('--gpu'), help: values.has('--help'), date, iso, speed, signalAt, liveWindow, liveReport };
}
export async function safeOutputDirectory(root, directory) {
  if (!within(root, directory)) throw new Error('output escapes its root');
  const realRoot = await realpath(root);
  let cursor = root;
  for (const part of path.relative(root, directory).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { await lstat(cursor); } catch (error) { if (error.code !== 'ENOENT') throw error; await mkdir(cursor); }
    const info = await lstat(cursor);
    if (info.isSymbolicLink() || !info.isDirectory() || !within(realRoot, await realpath(cursor))) throw new Error('output directory must not contain symlinks');
  }
  return directory;
}
export async function writePrivateFile(file, body) {
  await safeOutputDirectory(repoRoot, path.dirname(file));
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(body); } finally { await handle.close(); }
}

export function realMetal(renderer) { return typeof renderer === 'string' && /\bMetal\b/i.test(renderer) && !/SwiftShader|llvmpipe|software/i.test(renderer); }

export const ROOF_MATERIAL_AUTO = 'auto';
export const ROOF_MATERIAL_SOLID = 'solid slate (evidence override)';

/** The comparison pair shares each fixed context camera; only the slate material state changes. */
export function roofMaterialEvidencePairs(cameras) {
  return ['roof-above', 'front-oblique'].map(cameraName => ({
    cameraName,
    context: { camera: cameras[cameraName], roofMaterialEvidence: ROOF_MATERIAL_AUTO },
    solid: { camera: cameras[cameraName], roofMaterialEvidence: ROOF_MATERIAL_SOLID },
  }));
}

/**
 * Run the intact Station camera set and its same-camera physical-slate comparison shots. `select` (a Set of view
 * names, see resolveViews) limits the run to those views; null runs them all. Every shot is a fixed camera on a
 * still scene, so each also takes the two-frame flicker check (`twoFrame`). A view with a named part in scoring (VIEW_ROLES: official
 * or context) passes it on with a label, and its record carries both. `hud` ('off' or 'on', see hud.mjs) is passed to every
 * shot, which hides or shows the page's overlays for it; null leaves the page alone. With the overlays off, a selection that
 * includes `overview` also gets `overview-hud-on`: the same camera with the overlays shown, labelled, so that the page as a user
 * sees it is still in the pack.
 */
export async function runStationEvidenceShots(cameras, shot, attempt, select = null, hud = null) {
  const pairs = roofMaterialEvidencePairs(cameras);
  const contextEvidence = new Map(pairs.map(pair => [pair.cameraName, pair.context.roofMaterialEvidence]));
  const wanted = name => !select || select.has(name);
  const overlays = hud ? { hud } : {};
  for (const [name, camera] of Object.entries(cameras).filter(([name, camera]) => !camera.grid && wanted(name)))
    await attempt('02', name, () => shot('02', name, camera, { twoFrame: true, ...overlays, ...viewScoring(name), ...(contextEvidence.has(name) ? { roofMaterialEvidence: contextEvidence.get(name) } : {}) }));
  for (const pair of pairs.filter(pair => wanted(`${pair.cameraName}-solid-slate`)))
    await attempt('02', `${pair.cameraName}-solid-slate`, () => shot('02', `${pair.cameraName}-solid-slate`, pair.solid.camera, { twoFrame: true, ...overlays, roofMaterialEvidence: pair.solid.roofMaterialEvidence }));
  if (hud === 'off' && cameras.overview && wanted('overview'))
    await attempt('02', 'overview-hud-on', () => shot('02', 'overview-hud-on', cameras.overview, { twoFrame: true, hud: 'on', label: 'The overview as a user sees the page: its overlays are shown (every other station view has them hidden).' }));
}

/** Capture the physical slate view while an async begin/restore bridge holds the serialized page helper open. */
export async function captureEvidencePng(roofMaterialEvidence, { prepare, capture, restore }) {
  if (roofMaterialEvidence !== ROOF_MATERIAL_SOLID) return await capture();
  await prepare();
  try { return await capture(); }
  finally { await restore(); }
}

/** Force only the shed slate cladding; its original callback still updates glass opacity for the current camera. */
export async function withSolidSlateEvidence(cladding, capture) {
  if (cladding?.name !== 'shed-roof-cladding') throw new Error('solid slate evidence requires shed-roof-cladding');
  if (typeof capture !== 'function') throw new Error('solid slate evidence requires a capture callback');
  const materials = Array.isArray(cladding.material) ? cladding.material : [cladding.material];
  if (!materials.length || materials.some(material => !material)) throw new Error('shed roof cladding has no material');
  const before = materials.map(material => ({ opacity: material.opacity, depthWrite: material.depthWrite }));
  const callback = cladding.onBeforeRender;
  const forceSolid = () => {
    for (const material of materials) { material.opacity = 1; material.depthWrite = true; }
  };
  try {
    cladding.onBeforeRender = function(...args) {
      if (typeof callback === 'function') callback.apply(this, args);
      forceSolid();
    };
    forceSolid();
    return await capture();
  } finally {
    cladding.onBeforeRender = callback;
    materials.forEach((material, index) => {
      material.opacity = before[index].opacity;
      material.depthWrite = before[index].depthWrite;
    });
  }
}
export function proxyTarget(relay, pathname) {
  const request = new URL(pathname, 'http://127.0.0.1');
  if (!request.pathname.startsWith('/relay/')) return null;
  const target = new URL(relay); target.pathname = request.pathname.slice('/relay'.length); target.search = request.search; return target;
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2' };
export async function safeFile(root, name) {
  try {
    const base = await realpath(root), file = await realpath(path.resolve(base, `.${decodeURIComponent(name.startsWith('/') ? name : `/${name}`)}`));
    if (!within(base, file)) return null;
    return { body: await readFile(file), type: MIME[path.extname(file)] ?? 'application/octet-stream' };
  } catch { return null; }
}

let worldCache;
/** The committed terrain and city extract, read once, for measuring a camera against the ground. The station cameras do not read it: they are frozen. */
export function stationWorld() {
  if (!worldCache) { const { city, terrain } = stationData(); worldCache = { city, terrain: createTerrain(terrain) }; }
  return worldCache;
}

/**
 * The fixed station cameras by name (x east, y up, z south), frozen at the values the graphical-fidelity baseline holds
 * (gfx-rubrics/baseline/cameras.json, "station"); tools/tests/frozen-station-cameras.json is the copy that
 * tools/tests/frozen-cameras.test.mjs holds stationCameras to, name by name and field by field.
 *
 * A frozen camera must not depend on the model. These were computed on every run from the OSM station frame, the landmark plans and
 * the terrain, so a model change moved a view the scorers had already compared against (the Midland Grand clock tower going from 76 m
 * to 73 m, the rubric's figure, would have moved midland-clock-tower's aim and lens, and the scorers' camera check, which compares
 * pos, target and fov with the baseline, would have voided the view). They are literals now. Change one only on purpose, in this
 * table and in the test's copy together, and re-freeze the baseline with it. The comments keep the reasoning each camera came from
 * (the photograph, the stand, the lens); a model value they name (a height, a width) is the one it had when the camera was frozen.
 */
const FROZEN_STATION_CAMERAS = {
  overview: {
    pos: [260, 220, 90],
    target: [46.37560028234806, 5, -131.62931499021622],
    source: 'shedLayout',
  },
  top: {
    pos: [46.37560028234806, 3000, -131.62931499021622],
    target: [46.37840361751828, 0, -131.7292756890529],
    source: 'shedLayout, 10 m grid',
    grid: true, fov: 12, near: 100,
  },
  side: {
    pos: [1531.8966211635652, 65, -89.9688086871672],
    target: [46.37560028234806, 65, -131.62931499021622],
    source: 'shedLayout, 10 m grid',
    grid: true, fov: 7, near: 100,
  },
  'south-front': {
    pos: [41.04926345892175, 26, 58.29601279953229],
    target: [43.01159807807881, 12, -11.676476386164524],
    source: 'shedLayout south facade, clear of Belgrove House',
  },
  'front-oblique': {
    pos: [146.69214011801085, 32, 76.26459857899144],
    target: [43.57226511212369, 12, -31.66861615350647],
    source: 'shedLayout south-east corner',
  },
  'shed-interior': {
    pos: [44.150000000000006, 3.2, -328.45],
    target: [45.814933248303184, 8, -111.63717522287426],
    source: 'OSM platform 4 north end looking into the shed',
  },
  'platform-eye': {
    pos: [43.54285714285716, 2.5, -210.09285714285716],
    target: [44.66419121094691, 2.5, -250.07713667754103],
    source: 'OSM platform 4 polygon, eye 1.6 m above platform',
  },
  concourse: {
    pos: [-58.19823691449512, 2.5, -90.50307363615148],
    target: [-21.256814215392197, 12, -90.50307363615148],
    source: 'concourseCanopy fitted OSM arc',
  },
  // Wave 0 re-framing (round-4 scorer: the old 1.6 m stand 6 m off the face showed about three bays). The same eye height, pulled back
  // WESTERN_RANGE_STANDOFF = 62 m from the west face on the Range's mid-length line, with a 70 degree lens: at the capture aspect
  // (1.6) that is a 96 degree horizontal view, wider than the 133.4 m elevation seen from 62 m (2 x atan(66.7 / 62) = 94 degrees).
  'western-range': {
    pos: [-64.95331210268448, 1.6, -89.53369347678505],
    target: [-3.0776395227611486, 7.5, -87.79842900641617],
    source: 'WESTERN_RANGE west brick facade v8.1..141.5: the whole 133.4 m west elevation from 62 m west of the face on its mid-length, eye 1.6 m, 70 degree lens',
    fov: 70, near: 0.1,
  },
  'western-range-gateline': {
    pos: [-46.992406666352196, 3, -52.21552262253324],
    target: [-4.019302236450679, 5.5, -51.010368832853786],
    source: 'Arup 2012/2 p27 fig4 southern public frontage; ASSUMED model alignment, upper floors and scene retained',
    fov: 60, near: 0.1,
  },
  'roof-above': {
    pos: [91.07758124184501, 131.6408, -120.37174427994427],
    target: [46.09526676532562, 18.640800000000002, -121.63324510654523],
    source: 'shedLayout roof',
  },
  'north-gable': {
    pos: [52.08991869333342, 18, -335.38920349896534],
    target: [49.84725055715392, 12, -255.42064442959756],
    source: 'shedLayout north gable',
  },
  // Roof-family comparison: the same public-model triangle in before/after builds,
  // viewed from below at about six metres. No shell, cladding or city is hidden.
  'concourse-roof-detail': {
    pos: [-27.505453679719565, 13.037666207957841, -86.60333744605987],
    target: [-26.005453679719565, 19.03766620795784, -87.60333744605987],
    source: 'drawn concourse roof triangle, view from below; approximate procedural member families',
    fov: 50, near: 0.1,
  },
  'platform-eye-south': {
    pos: [43.54285714285716, 2.5, -210.09285714285716],
    target: [42.42152307476741, 2.5, -170.10857760817328],
    source: 'OSM platform 4 polygon, south-facing eye 1.6 m above platform',
  },
  // Pancras Road exterior: the concave east front sits beside the concourse. Its old
  // normal-offset camera landed below that roof and hid the hotel. The public west
  // frontage provides an unobstructed view of the F9 ground-floor arch trim.
  // https://historicengland.org.uk/listing/the-list/list-entry/1113244
  'great-northern-hotel': {
    pos: [-76.82513065762711, 10, -5.344558174312606],
    target: [-61.25, 9.65, -24.9],
    source: 'Great Northern Hotel Pancras Road exterior; OSM rear-chain normal',
    fov: 75, near: 0.1,
  },
  // Retain the old under-roof view as a junction diagnostic, not as hotel evidence.
  // Before/after captures can inspect the paving seam without moving the camera.
  'concourse-hotel-junction': {
    pos: [-22.843110827215803, 14, -71.98447478138837],
    target: [-53.4, 9.65, -38.95],
    source: 'OSM hotel main facade; fixed concourse paving-junction diagnostic',
  },
  'midland-grand-front': {
    pos: [-22.982023517687793, 28, 232.12089677648294],
    target: [-89.85, 11, 97.85],
    source: 'midlandGrandPlan Euston Road front',
  },
  'st-pancras-shed': {
    pos: [-51.63065086440554, 46, 147.21783924819596],
    target: [-132.3878885320359, 15.24, -13.649399692160884],
    source: 'barlowPlan south end, real OSM heading',
  },
  'st-pancras-shed-oblique': {
    pos: [180.61555356901593, 182.88, -30.990709103055394],
    target: [-134.99161672917833, 14.6304, -18.835988264560044],
    source: 'barlowPlan elevated south-east oblique; stand-off derived from Midland Grand extent and Barlow width',
    fov: 55, near: 0.1,
  },
  'gasworks-portals': {
    pos: [40.17447320353345, 12, -393.4972012403787],
    target: [42.26168417780199, 4, -458.4636814463194],
    source: 'tunnelMouths gasworks-south rail boundary',
  },

  // ---- Wave 0 of the graphical-fidelity programme: the fixed views the six element rubrics add ----------------------
  // (gfx-rubrics/rubric-<element>.md, "Fixed views"). Each stands where its reference photograph was taken (refs/<group>/
  // SOURCES.md) or on the OSM feature the rubric names, and is frozen once an element's iteration starts. A camera that
  // stands on the ground took the terrain height under it (the ground is not flat here); platform eyes stand 1.6 m above
  // the platform surface. ELEMENT_VIEWS says which element is scored from which view.

  // lighting-materials. R-lighting-materials-a (light-a2-facade-brick-sunlit-2026-06.jpg, Bex Walton CC BY 4.0): stock brick
  // beside a pier of the south front. The east end pier is the stone pier at u = width - 0.5 (shed.ts); the eye stands
  // 4 m south of it and aims at the brick between the pier and the nearest porch arch.
  'facade-brick-close': {
    pos: [77.99074543182866, 1.1164013310948557, -6.693935449602762],
    target: [76.60346835608698, 2.6, -10.734413430624517],
    source: 'R-lighting-materials-a standpoint (light-a2-facade-brick-sunlit-2026-06.jpg): 4 m south of the east end pier of the south front, eye 1.7 m',
    fov: 50, near: 0.1,
  },

  // kx-front.
  // R-kx-front-c (front-c-clocktower-2019.jpg, Acabashi CC BY-SA 4.0): the clock tower from the square. 35 m south of the
  // tower's south face at y = 28 m, aimed at the clock centre (buildTower's clockY, 5.75 m under the 112 ft overall height).
  'tower-close': {
    pos: [41.84681231485059, 28, 29.85719398048837],
    target: [42.82797962442912, 28.3876, -5.129050612360035],
    source: 'R-kx-front-c standpoint (front-c-clocktower-2019.jpg): 35 m south of the tower face, y = 28 m, aimed at the clock centre',
    fov: 35, near: 0.1,
  },
  // R-kx-front-b (front-b-oblique-sw-2016.jpg, Oast House Archive CC BY-SA 2.0): the front from the square's south-west,
  // about 60 m from the west great arch (centre u = aisle + half a span), looking north-east at the front. The pure
  // south-west bearing (45 degrees) puts the eye inside the square's row of trees (a trunk 0.7 m away filled 58% of the
  // frame), so the eye keeps the 60 m but stands 38 m west and 49 m south of the arch: south-south-west, clear of them.
  'front-southwest-pedestrian': {
    pos: [-12.342812741131121, 1.8085703201461005, 35.79040898519868],
    target: [43.01159807807881, 12, -11.676476386164524],
    source: 'R-kx-front-b standpoint (front-b-oblique-sw-2016.jpg): 62 m south-south-west of the west great arch, eye 1.7 m on the square, looking north-east',
    fov: 60, near: 0.1,
  },
  // R-kx-front-d (front-d2-north-york-way-2019.jpg, Colin Cheesman CC BY-SA 2.0): the east flank from York Way. The OSM York Way
  // centreline (way 43892837) runs about 10 m east of the flank wall here; the eye stands 40 m out at y = 12 m, looking west.
  'shed-east-flank': {
    pos: [122.50459160122618, 12, -131.41508000499567],
    target: [82.52031206654229, 9, -132.53641407308544],
    source: 'R-kx-front-d standpoint (front-d2-north-york-way-2019.jpg): York Way side, 40 m east of the east flank wall at mid-length, y = 12 m, looking west',
    near: 0.1,
  },

  // shed-interior. The platform eyes use platform 4's recipe (polygon midpoint, 1.6 m above the platform, looking along it).
  // East-shed interior photograph (shed-a-north-from-footbridge-2019.jpg, kitmasterbloke CC BY 2.0, looks north along the platforms).
  'platform-eye-p1-north': {
    pos: [67.66190476190475, 2.5, -206.35238095238097],
    target: [68.7832388299945, 2.5, -246.33666048706488],
    source: 'OSM platform 1 polygon midpoint, eye 1.6 m above platform, looking north; east-shed interior standpoint (shed-a-north-from-footbridge-2019.jpg)',
  },
  // R-kx-shed-interior-b (shed-b-south-screen-2019.jpg, kitmasterbloke CC BY 2.0): the inner face of the south screen.
  'platform-eye-p8-south': {
    pos: [15.408333333333333, 2.5, -216.2666666666667],
    target: [14.286999265243583, 2.5, -176.28238713198283],
    source: 'OSM platform 8 polygon midpoint, eye 1.6 m above platform, looking south at the inner south screen; R-kx-shed-interior-b standpoint (shed-b-south-screen-2019.jpg)',
  },
  // R-kx-shed-interior-a (shed-a-north-from-footbridge-2019.jpg): the roof underside, ribs and glazing. Platform 4 midpoint,
  // eye 1.6 m, pitched up 55 degrees and turned north-east so the sight line crosses the east vault.
  'roof-underside': {
    pos: [43.54285714285716, 2.5, -210.09285714285716],
    target: [56.04656167073201, 27.074561328669756, -221.9143760208631],
    source: 'OSM platform 4 polygon midpoint, eye 1.6 m, pitched up 55 degrees across the east vault; R-kx-shed-interior-a standpoint (shed-a-north-from-footbridge-2019.jpg)',
  },
  // R-kx-shed-interior-d (shed-d-platform-furniture-2022.jpg, The wub CC BY-SA 4.0): the bench/lamp/help-point groups on a platform.
  // The nearest such group to the midpoint is everything within 3 m of the nearest piece; the eye stands 4 m from its centre,
  // along the platform on the midpoint's side, looking at it.
  'furniture-close': {
    pos: [43.47617734039083, 2.5, -217.99980584974898],
    target: [43.5883107471998, 1.7000000000000002, -221.99823380321737],
    source: 'OSM platform 4, 4 m from the nearest bench/lamp/help-point group (furniturePlan), eye 1.6 m; R-kx-shed-interior-d standpoint (shed-d-platform-furniture-2022.jpg)',
  },
  // R-kx-shed-interior-f (shed-f-suburban-platforms-2022.jpg, Mr Ignavy CC BY-SA 2.0): the platform 9-10 canopies. Platform 9's
  // vertex mean lies outside its own canopy (the platform splays), so the midpoint is the canopy's middle sample, which is under it.
  'suburban-p9': {
    pos: [7.821052603185734, 2.5, -271.7337435583622],
    target: [17.78834085522388, 2.5, -310.47200842529685],
    source: 'OSM platform 9 canopy middle (furniturePlan canopy 9), eye 1.6 m above platform, looking north along the platform; R-kx-shed-interior-f standpoint (shed-f-suburban-platforms-2022.jpg)',
  },

  // western-concourse.
  // R-western-concourse-a (conc-a-funnel-2012.jpg, Colin CC BY-SA 3.0; conc-ab-funnel-brick-2025.jpg): the funnel and the Range behind
  // it. 8 m west of the funnel's axis, eye 1.6 m above the concourse floor (y = 0.02), pitched up 35 degrees, looking east.
  'concourse-funnel-up': {
    pos: [-16.7270740795371, 1.62, -86.22636688980997],
    target: [-8.730218172600322, 7.221660305677678, -86.00210007619202],
    source: 'R-western-concourse-a standpoint (conc-a-funnel-2012.jpg): 8 m from the funnel axis, eye 1.6 m, pitched up 35 degrees, looking east at the funnel and the Range',
  },
  // R-western-concourse-c (conc-c-exterior-square-2016.jpg, ell brown CC BY-SA 2.0): the concourse roof from King's Cross Square.
  // The canopy edge is the fitted arc's southern point. The rubric asks for ~50 m south-west of it, looking north-east, but that
  // quarter of the square is the hotel's: from 43 south-west stands (bearing 185-260 degrees from the roof's centre, 15-100 m from its
  // edge, each at least 6 m outside every footprint) the lens sees the roof in at most 2% of the frame (7 x 7 ray grid), the hotel,
  // the round service building (OSM 96299681), the pavement and the sky filling the rest. So the eye stands on the open square 35 m
  // south of the edge and 5 m west (4 degrees west of south), 7.6 m outside that round building. The photograph centres the whole
  // dome, so the aim is the canopy's centre (a 45 degree aim put the roof half out of frame) and the lens is 60 degrees to take the
  // 123 m span in. The hotel still stands in front of about half of the canopy from this stand (tests/camera-faults.test.mjs measures
  // it), so the western-concourse scorer could not score C6 from here: it is context only (VIEW_ROLES) and C6 is scored from the west view.
  'concourse-exterior-square': {
    pos: [-28.962002958314887, 1.7873006283983532, 5.887844681929378],
    target: [-21.256814215392197, 8, -90.50307363615148],
    source: 'R-western-concourse-c standpoint (conc-c-exterior-square-2016.jpg): King\'s Cross Square, eye 1.7 m, 35 m south of the canopy edge and 5 m west (the south-west quarter of the square is behind the hotel), looking at the whole roof',
    fov: 60, near: 0.1,
  },
  // The photograph's own composition, which the square cannot give: the whole dome with the hotel at the frame's right edge and the
  // clock turret behind the roof. That is the dome seen from the west, across Pancras Road: 38 m west of the canopy's west rim on the
  // roof's centre line, eye 1.7 m, looking east. Added beside concourse-exterior-square (not named in the rubric) for the C2 and C6
  // criteria, and now the official view for C6 (VIEW_ROLES): the lead's decision after the scorer found the hotel hiding the square's.
  'concourse-exterior-west': {
    pos: [-120.78672025708558, 1.1259939593046575, -93.29432749234542],
    target: [-21.256814215392197, 8, -90.50307363615148],
    source: 'R-western-concourse-c composition (conc-c-exterior-square-2016.jpg, conc-c2-dome-aerial-2016.jpg): Pancras Road, 38 m west of the canopy\'s west rim on the roof\'s centre line, eye 1.7 m, looking east at the whole roof with the hotel at the right edge',
    fov: 60, near: 0.1,
  },
  // R-western-concourse-b (conc-b-roof-meets-range-2025-08.jpg, Jonosunde CC BY-SA 4.0): the whole Range elevation from inside the
  // concourse. y = 8 m under the roof near the canopy's west edge (the rim itself is only ~5 m high), at the Range's mid-length. The
  // eye is clear of the roof: the dome's glazing is 3.3 m above it there and the concourse floor 8 m below (tests/camera-faults.test.mjs).
  'western-range-full': {
    pos: [-64.95331210268448, 8, -89.53369347678505],
    target: [-3.0776395227611486, 6, -87.79842900641617],
    source: 'R-western-concourse-b standpoint (conc-b-roof-meets-range-2025-08.jpg): inside the concourse near the canopy\'s west edge, y = 8 m, under the roof glazing, the full Range elevation',
    fov: 70, near: 0.1,
  },

  // historic-neighbours.
  // R-historic-neighbours-a (hist-a-great-northern-hotel-2013.jpg, Richard Ash CC BY-SA 2.0): the crescent from the square, looking
  // north along its main face. The rubric's stand is ~45 m due south of the hotel's south end (its southernmost OSM outline point):
  // 2.2 m from the south wall of the round service building (OSM 96299681, roof about 7 m, 15 m across), which then fills the frame.
  // A 45 m stand 20 degrees east of south (the first wave-0 camera) was 10.8 m outside it but still had that wall, and the pavement
  // trees behind it, across a quarter of the frame. The eye now stands on the open square 30 m from the end at 30 degrees east of
  // south, 8.9 m outside the footprint of the round building and every other. The lens is aimed at the main face's middle 23 m up and
  // is 64 degrees, which puts the roofline (the ridge and the chimneys above it, 27 m) and the foot of the nearest corner inside the
  // page's free rows (HUD_FREE_ROWS): the 50 degree lens aimed at 9.65 m cropped the near corner's roof and put the dormers behind the
  // station switcher.
  'gnh-from-square': {
    pos: [-20.134223016314543, 1.9819315691099577, 15.39105164732452],
    target: [-53.4, 23, -38.95],
    source: 'R-historic-neighbours-a standpoint (hist-a-great-northern-hotel-2013.jpg): King\'s Cross Square, eye 1.7 m, 30 m from the hotel\'s south end at 30 degrees east of south (clear of the round service building OSM 96299681 that the rubric\'s 45 m due-south stand lands in), looking along the crescent\'s main face with the whole roofline in frame',
    fov: 64, near: 0.1,
  },
  // R-historic-neighbours-b (hist-b-midland-grand-euston-road-2012.jpg, Colin CC BY-SA 3.0): the front from Euston Road. The two
  // OSM carriageways cross the front's normal 29.8 m and 42.1 m out; 50 m is the south pavement beyond them.
  'midland-euston-road': {
    pos: [-67.56067450589593, 2.830348310685503, 142.60696559216098],
    target: [-89.85, 16, 97.85],
    source: 'R-historic-neighbours-b standpoint (hist-b-midland-grand-euston-road-2012.jpg): south pavement of Euston Road opposite the hotel centre, eye 1.7 m',
    fov: 70, near: 0.1,
  },
  // R-historic-neighbours-c (hist-c-clock-tower-2015.jpg, Elliott Brown CC BY-SA 2.0): the clock tower. 60 m out along the tower's
  // front normal at y = 40 m (CLOCK_TOWER_STANDOFF, CLOCK_TOWER_EYE_Y). The round-4 scorers found the old 35 degree lens aimed at the
  // clock (0.68 of the tower height) cut the spire off: its tip stands 31 degrees above that eye and the frame ended at 28. The stand
  // stayed; the lens and the aim were set from the two heights that bound the tower, the main roof's eaves (22 m, where the tower
  // rises out of the building) and the spire tip (76 m, the model's clockTowerHeight when this was frozen), placed on the top and
  // bottom of the page's free rows (HUD_FREE_ROWS: the station switcher is over the spire tip of a tower framed any tighter, and the
  // status lines over its eaves): the lens is the angle between the two heights seen from the eye, widened to put them on those rows
  // and rounded up to 0.1 degree, and the aim is the middle of the two. Both are literals now, and stay so when the model moves: the
  // rubric's figure for the tower is 73 m (Bradley 2007), and the same derivation from it gives a 63.8 degree lens aimed at 46.3 m
  // instead of 66.5 degrees at 47.4 m: not the view the baseline holds.
  'midland-clock-tower': {
    pos: [-27.53216076224816, 40, 128.52979585409406],
    target: [-51.35363794830843, 47.42283429841958, 73.46131825870368],
    source: 'R-historic-neighbours-c standpoint (hist-c-clock-tower-2015.jpg): 60 m from the clock tower along its front normal, y = 40 m, the whole tower in frame from the 22 m eaves to the 76 m spire tip, clear of the page\'s overlays (66.5 degree lens aimed at 47.4 m)',
    fov: 66.5, near: 0.1,
  },
  // R-historic-neighbours-d (hist-d-barlow-interior-2014.jpg, mattbuck CC BY-SA 4.0; hist-d2-barlow-looking-north-2018.jpg): the
  // Barlow shed from inside, on its centreline 40 m from the south end, eye 1.6 m above the shed's floor (its seat), looking north.
  'barlow-interior': {
    pos: [-107.71206591137107, 1.1, 35.50447887294815],
    target: [-179.49627717148695, 1.1, -107.48862240736904],
    source: 'R-historic-neighbours-d standpoint (hist-d-barlow-interior-2014.jpg): inside the Barlow shed on its centreline, 40 m from the south end, eye 1.6 m, looking north',
  },

  // city-surroundings.
  // R-city-surroundings-b (city-b-granary-building-2016.jpg, Clem Rutter CC BY-SA 3.0): the Granary from Granary Square. The square
  // runs from the Granary's front to the canal, whose OSM centreline is ~98 m south of the front; 88 m is the south steps.
  'granary-square': {
    pos: [-116.10205456323189, 8.859598863756945, -450.31892209297956],
    target: [-93.25, 17.950000381469728, -535.3],
    source: 'R-city-surroundings-b standpoint (city-b-granary-building-2016.jpg): Granary Square south steps, 88 m south of the Granary front, eye 1.7 m, looking north',
  },
  // R-city-surroundings-c (city-c-gasholders-2023.jpg, The wub CC BY-SA 4.0): the triplet from the towpath. The canal vertex nearest
  // the point 55 m south of the triplet's centre, then 7 m to the triplet's side of the centreline (the water is 9 m wide).
  gasholders: {
    pos: [-271.4797210984105, -2.1587933324442714, -587.1973793086374],
    target: [-237.22138989823574, 13.869305055978296, -653.1208161391395],
    source: 'R-city-surroundings-c standpoint (city-c-gasholders-2023.jpg): canal towpath south of the gasholder triplet, eye 1.7 m, looking north',
  },
  // R-city-surroundings-d (city-d-canal-lock-2022.jpg, Jim Osley CC BY-SA 2.0): St Pancras Lock. OSM canal way 108337675 starts at the
  // lock junction, where the terrain falls to the lock cutting. The scene's water polygons run ~11 m either side of that centreline
  // (a 7 m offset put the eye in the water), so the eye stands on the east towpath 14 m from it, 10 m down-canal of the junction, and
  // looks 60 m down the canal (it runs south-south-east here, not due east as the rubric words it).
  'canal-lock': {
    pos: [-274.10604318448173, -0.925332274855377, -606.3515030435755],
    target: [-262.0796059259647, -2.258052023292347, -555.8404665578039],
    source: 'R-city-surroundings-d standpoint (city-d-canal-lock-2022.jpg): east towpath at St Pancras Lock (OSM canal way 108337675), eye 1.7 m, looking down the canal',
  },
  // R-city-surroundings-e (city-e-google-kgx1-2026.jpg, Bex Walton CC BY 4.0): KGX1 from King's Boulevard. The OSM centreline of the
  // boulevard (way 807924984) runs beside KGX1's west face; the eye stands 25 m along it from the south end, looking up the street.
  'kings-boulevard': {
    pos: [-69.74361639944951, 2.5303075110385786, -201.88985644056845],
    target: [-55.096958361497165, 19.20718153026687, -295.65293500368495],
    source: 'R-city-surroundings-e standpoint (city-e-google-kgx1-2026.jpg): King\'s Boulevard, eye 1.7 m, looking north up the street at KGX1',
  },
  // R-city-surroundings-a (city-a-aerial-skyline-2016.jpg, Robot8A CC BY-SA 4.0): Euston Road outside the forecourt. The eye stands on
  // the middle of OSM way 367808662 (the eastbound carriageway beside the Square) and looks along the road to Pentonville Road (way 1112581153).
  'euston-road-east': {
    pos: [39.65, 1.201249999925493, 44.05],
    target: [133.5, 3.9374999990686774, -3],
    source: 'R-city-surroundings-a standpoint (city-a-aerial-skyline-2016.jpg): Euston Road outside the King\'s Cross forecourt (OSM way 367808662), eye 1.7 m, looking east along Pentonville Road',
  },
};

/**
 * The station cameras by name: a fresh copy of FROZEN_STATION_CAMERAS on every call, so a caller may edit what it gets. `data` is
 * accepted for the callers that pass the station data and is not read: a frozen camera does not depend on the model.
 */
export function stationCameras(data) {
  return structuredClone(FROZEN_STATION_CAMERAS);
}

/**
 * The 12 frozen Edinburgh Waverley cameras (Waverley's own frame: x east, y up, z south, origin 55.9519018 N 3.1904199 W,
 * core/waverley-data.ts WAVERLEY_ORIGIN, rail datum y = 0), as gfx-rubrics/waverley/frozen-cameras.json holds them;
 * tools/tests/frozen-waverley-cameras.json is the copy tools/tests/frozen-waverley-cameras.test.mjs holds waverleyCameras to.
 * Like FROZEN_STATION_CAMERAS they are literals and read no model: change one only on purpose, here and in the test's copy together,
 * and re-freeze the Waverley baseline with it. A camera with no fov (wv-overview) is shot at the page's 50 degrees.
 */
const FROZEN_WAVERLEY_CAMERAS = {
  'wv-platform-11-east': {
    pos: [20, 2.515, 35.3],
    target: [65, 6, 23.44],
    fov: 60,
    source: 'OSM platform 11 centreline at x 20 (width 4.3 m), eye 1.6 m above the ASSUMED 0.915 m deck, looking east under the west roof toward the central block',
  },
  'wv-platform-5-west': {
    pos: [290, 2.515, -51.61],
    target: [160, 7, -16.25],
    fov: 60,
    source: 'OSM platform 5 centreline at x 290 (width 3.6 m), eye 1.6 m above deck, looking west under the east roof to North Bridge',
  },
  'wv-roof-underside': {
    pos: [-30, 2.515, 59.52],
    target: [10, 10.4, 53.52],
    fov: 70,
    source: 'OSM platform 10 centreline at x -30, looking up and east at the ridge-and-furrow underside (gutter 8 m, ridge 10.4 m per WAVERLEY_ROOF_PROFILE)',
  },
  'wv-roof-from-north-bridge': {
    pos: [125.47, 16.73, 35],
    target: [-40, 8, 10],
    fov: 60,
    source: 'North Bridge west parapet line (OSM way/380552925) at z 35, deck from the landmarks deck rule (raw DTM at the bridge ends), eye 1.6 m above deck, looking west over the roof: the standpoint of the Liberaler Humanist 2015 photo cited in waverley-roof.ts',
  },
  'wv-balmoral-east-end': {
    pos: [70, 17.86, -185],
    target: [55, 43, -125],
    fov: 60,
    source: 'East end of Princes Street in front of Register House (OSM relation/963741 south face), eye 1.7 m above model ground, looking south at the Balmoral tower (OSM way/313744197, 58 m HES LB30315)',
  },
  'wv-waverley-bridge-east': {
    pos: [-57.42, 7.24, 70],
    target: [60, 10, -95],
    fov: 60,
    source: 'Waverley Bridge east parapet line (OSM way/377738788) at z 70 (south of the OSM block way/377738789 on its east side), 1.5 m inside its east parapet line, eye 1.6 m above deck, looking north-east over the west roof to Princes Mall, Waverley Steps and the Balmoral',
  },
  'wv-north-bridge-side': {
    pos: [345, 2.515, -63.48],
    target: [125, 5, 0],
    fov: 45,
    source: 'OSM platform 5 east end at x 345, eye 1.6 m above deck, looking west at the North Bridge east elevation (arches) across the tracks',
  },
  'wv-calton-hill-panorama': {
    pos: [365, 45.4, -301],
    target: [-300, 45, 250],
    fov: 50,
    source: 'Calton Hill beside the Dugald Stewart Monument (55.95461 N, 3.18456 W, projected with core/geo.ts project), eye 1.7 m above DTM, looking south-west over the station to the Old Town ridge and the Castle',
  },
  'wv-castle-from-princes-st': {
    pos: [-600, 12.4, 30],
    target: [-595, 80, 372],
    fov: 45,
    source: 'Princes Street at x -600 (line from the OSM building fronts), eye 1.7 m above DTM, looking south over West Princes Street Gardens to Castle Rock (Crown Square 55.94856 N, 3.19998 W)',
  },
  'wv-scott-monument': {
    pos: [-240, 5.81, 10],
    target: [-176, 40, -51],
    fov: 50,
    source: 'East Princes Street Gardens south-west of the Scott Monument (OSM way/39044819), eye 1.7 m above DTM, 88 m off, looking north-east',
  },
  'wv-calton-hill-from-north-bridge': {
    pos: [114.38, 14.44, -70],
    target: [480, 62, -235],
    fov: 45,
    source: 'North Bridge east parapet near its north end (z -70), eye 1.6 m above deck, looking north-east to Calton Hill (Nelson Monument 55.95400 N, 3.18273 W)',
  },
  'wv-overview': {
    pos: [199.04, 397.92, 422.07],
    target: [89.9, 5, -14.5],
    source: 'waverleyView(geometry, 1.6): the app landing view fitted to the OSM platform extent',
  },
  'wv-waverley-steps': {
    pos: [16.61, 17.543, -126.32],
    target: [32.93, 7.543, -68.61],
    fov: 60,
    source: 'Head landing of the Waverley Steps (OSM way/577519823; bridgeFrame of the outline at s 0.3 m from the Princes Street end, t 0.3, 1.3 m west of the centreline), eye 1.6 m above the head landing (15.943 m: W2 layTreads, highest DTM under the walking line + 0.02), looking south down the line to its Market Street end at t 0.3, pitched 10 degrees down: the standpoint of R-wv2-d / R-wv1-d2 (M J Richardson 2013, geotag 55.95291 N, 3.19017 W). Placed 2026-11-09 by a neutral agent from the photo, no render consulted',
  },
};

/** The Waverley cameras by name: a fresh copy of FROZEN_WAVERLEY_CAMERAS on every call. */
export function waverleyCameras() {
  return structuredClone(FROZEN_WAVERLEY_CAMERAS);
}

/** The fixed Waverley views each element is scored from (gfx-rubrics/waverley/rubric-<element>.md, "Fixed views"). */
export const WAVERLEY_ELEMENT_VIEWS = {
  'waverley-station': ['wv-roof-from-north-bridge', 'wv-platform-11-east', 'wv-platform-5-west', 'wv-roof-underside', 'wv-overview'],
  'waverley-frontage': ['wv-balmoral-east-end', 'wv-waverley-bridge-east', 'wv-north-bridge-side', 'wv-roof-from-north-bridge', 'wv-waverley-steps'],
  'waverley-city': ['wv-calton-hill-panorama', 'wv-castle-from-princes-st', 'wv-scott-monument', 'wv-calton-hill-from-north-bridge', 'wv-overview'],
};

/** `--views` for `--scene waverley` (or perth, given its cameras and elements): null for every camera (`all`), else the set of camera names its elements and names select. */
export function resolveWaverleyViews(spec, cameras = waverleyCameras(), elements = WAVERLEY_ELEMENT_VIEWS, label = 'Waverley') {
  if (spec === undefined || spec === 'all') return null;
  const names = new Set();
  for (const token of String(spec).split(',').map(t => t.trim())) {
    if (Object.hasOwn(elements, token)) for (const view of elements[token]) names.add(view);
    else if (Object.hasOwn(cameras, token)) names.add(token);
    else throw new Error(`unknown ${label} view or element: ${token || '(empty)'}. Elements: ${Object.keys(elements).join(', ')}. Views: ${Object.keys(cameras).join(', ')}`);
  }
  return names;
}

/**
 * Perth's phase 1 cameras (Perth's own frame: x east, y up, z south, origin 56.3914751 N 3.4383963 W, core/perth-data.ts PERTH_ORIGIN,
 * rail datum y = 0), placed by the lead from OSM geometry and the DTM and ray-checked against the Node build (eye on a platform or the
 * ground, clear of every mapped block); tools/tests/frozen-perth-cameras.json is the copy tools/tests/frozen-perth-cameras.test.mjs holds
 * perthCameras to. Frozen as the Waverley cameras are: change one only on purpose, here and in the copy together. No fov: the page's 50.
 */
const FROZEN_PERTH_CAMERAS = {
  'pt-platform-4-north': {
    pos: [-21.94,  2.515,  60],
    target: [-61.13,  4,  -60],
    fov: 60,
    source: "OSM platform 4 (way/44200505) centreline at z 60 (width 8.3 m), eye 1.6 m above the ASSUMED 0.915 m deck, looking north along the island toward the station building (way/4064272)",
  },
  'pt-platform-1-dundee': {
    pos: [15.68,  2.515,  120],
    target: [22.18,  4,  40],
    fov: 60,
    source: "OSM platform 1 (way/44200498) centreline at z 120 (width 6.12 m), eye 1.6 m above deck, looking north along the Dundee platforms' curve",
  },
  'pt-roof-underside': {
    pos: [-39.93,  2.515,  -60],
    target: [-40.93,  8.5,  -72],
    fov: 70,
    source: "OSM platform 3 (way/44200499) centreline at z -60 (width 7.48 m), inside the mapped station outline (way/4064272), looking up and north at the station roof's underside",
  },
  'pt-south-approach': {
    pos: [-156.43,  2.515,  -300],
    target: [-12.51,  3,  100],
    fov: 55,
    source: "OSM platform 4 at its north end (z -300), eye 1.6 m above deck, looking south down the station along the through lines",
  },
  'pt-platform-4-clock': {
    pos: [-44.44,  2.515,  -17.78],
    target: [-10.48,  4,  11.74],
    fov: 60,
    source: "OSM platform 4 (way/44200505) at track-frame x' -28 (perth-station-structure.ts), eye 1.6 m above the ASSUMED 0.915 m deck, looking south-east down the platform at the island building's platform 4 bracket clock (R-pt1-a2) about 24 m ahead and the Dundee canopies over platforms 1 and 2 beyond. Lead ruling 2026-11-10 13:02",
  },
  'pt-north-footbridge': {
    pos: [-14.38,  2.515,  15.88],
    target: [-39.69,  4,  -32.33],
    fov: 60,
    source: "OSM platform 3 (way/44200499) at track-frame x' 14 (perth-station-structure.ts), about 30 m south of the north (lattice) footbridge's deck, eye 1.6 m above the ASSUMED 0.915 m deck, looking north along the tracks at the deck crossing and its stairs to platforms 3 and 4, as Sheppard 2018 \"footbridge south\" (R-pt1-d) frames it. Lead ruling 2026-11-10 13:02",
  },
  'pt-platform-4-south-end': {
    pos: [-4.21,  2.515,  135.28],
    target: [0.79,  0,  148.64],
    fov: 35,
    source: "OSM platform 4 (way/44200505) at track-frame x' 129.5, z' 50.9 (perth-station-structure.ts), 1.4 m in from its east edge and 2.7 m short of its south end (x' 132.2; lead ruling 18:05, round 7: at the end, so the ramp's slope shows), pitched 10 degrees down on the same bearing (the target at rail level 14.3 m ahead) so the ramp below the end is in frame, eye 1.6 m above the ASSUMED 0.915 m deck, looking south down the through lines toward the road bridge, as geograph 591926 (Adrian Beney 2007, CC BY-SA 2.0: camera NO 113 230, subject NO 113 228, looking S) frames it: the platform edge running into the lower right, the tracks to its left, a telephoto lens. Arthur's ruling 2026-11-10 (round 6): at platform 4's south end, fov 35",
  },
  'pt-station-frontage': {
    pos: [-6.1,  0.9,  -56.3],
    target: [-9.4,  4,  -27.3],
    fov: 60,
    source: "R-pt2-a standpoint (geograph 6872924, JThomas 2021: camera NO 11294 23119, looking S at the entrance, subject NO 1129 2309), in the station car park (OSM way/24505868), eye 1.7 m above model ground, looking south at the entrance front (OSM entrance node/561381370). Lead ruling 2026-11-10: re-pointed from the old west standpoint, which stood on the through rails and saw no front",
  },
  'pt-station-hotel': {
    pos: [-12.3,  0.82,  -68.2],
    target: [-20.9,  9,  -97],
    fov: 60,
    source: "R-pt2-b standpoint (geograph 6872925, JThomas 2021: camera NO 11288 23131, looking N, subject NO 1128 2316), in the station car park (OSM way/24505868), eye 1.7 m above model ground, looking north at the Station Hotel's south front (OSM way/234811330; HES LB39538). Lead ruling 2026-11-10",
  },
  'pt-kings-place-bridge': {
    pos: [88.0,  -1.65,  -39.0],
    target: [94.3,  -1.65,  -68.7],
    fov: 19.4,
    source: "R-pt2-d standpoint (geograph 8184219, habiloid 2025, CC BY-SA 2.0: camera NO 1138 2310, looking NNE, subject NO 1139 2313), on St Leonard's Bank, eye 1.7 m above the cut road, level as the photograph is (its horizon is at mid-frame), looking at the Tay Coast Line's 1849 girder bridge over King's Place (OSM way/1260630142). Lead re-freeze 2026-11-10 12:57: the eye lowered to R-pt2-d's (the girders' underside 0.15 m over it; the 12:30 eye was ~2.2 m high). Lead re-freeze 2026-11-10 13:18: fov 19.4, R-pt2-d's lens (f about 2334 px from the poster's 3.05 m = 178 px at about 40 m; 2 atan(400/2334) = 19.4 deg over the 800 px capture height). Lead re-freeze 2026-11-10 13:35: the aim bears 12.0 deg east of north (was 2.6), from R-pt2-d itself: the near girder's NE end (about 104.3,-77.96 here) bears 22.7 deg from the standpoint and stands at photo x 1085 of 1280, 10.8 deg right of centre at f 2334 px, so the photo's axis bears about 11.9 deg; St Leonard's Bank runs at 10.8 deg, as the photo looks almost straight down it. The grid references (about 18 deg) are only 10 m precise",
  },
  'pt-kinnoull-panorama': {
    pos: [2368,  212.7,  208],
    target: [0,  10,  0],
    fov: 50,
    source: "Kinnoull Hill summit: the highest DTM node of the model's terrain (221.71 m AOD), eye 1.7 m above it, looking west over the Tay and the town to the station",
  },
  'pt-tay-from-bridgend': {
    pos: [954,  -1.52,  -300],
    target: [0,  8,  -80],
    fov: 50,
    source: "The Tay's east bank at Bridgend (z -300: the first DTM node east of the river standing above -5 m, plus 6 m), eye 1.7 m above it, looking west across the Tay to the town and the station",
  },
  'pt-tay-viaduct': {
    pos: [1078,  -1.16,  120],
    target: [922,  -1,  -43],
    fov: 50,
    source: "The Tay's east bank south of the railway bridge (OSM way/4438951; bank found as for pt-tay-from-bridgend at z 120), eye 1.7 m above it, looking north-west at the bridge's mid-river spans",
  },
  'pt-kinnoull-cliff': {
    pos: [2460,  172.2,  295],
    target: [2659.7,  136.9,  305.5],
    fov: 50,
    source: "8703 standpoint (geograph 8703, Val Vannet 2004, CC BY-SA 2.0, R-pt3-a; Geograph gives only the subject square NO1322, so the camera is ASSUMED-from-photo): the west rim of the gully across from Kinnoull Tower, eye 1.7 m above the drawn ground, the tower (at its LiDAR peak, 2606, 277.5) upper left, 7 deg north of the view's centre, its base just above eye level, looking east-south-east and 10 deg down at the cliff falling to the Tay. Lead ruling 2026-11-10 12:59: a fifth P3 camera, the four kept",
  },
  'pt-overview': {
    pos: [101.91,  551.52,  514.8],
    target: [-49.9,  5,  -92.45],
    source: "waverleyView(geometry, 1.6): the app landing view fitted to the OSM platform extent",
  },
};

/** The Perth cameras by name: a fresh copy of FROZEN_PERTH_CAMERAS on every call. */
export function perthCameras() {
  return structuredClone(FROZEN_PERTH_CAMERAS);
}

/** The fixed Perth views each phase 2 element is scored from (the Perth plan, "Cameras"). */
export const PERTH_ELEMENT_VIEWS = {
  'perth-station': ['pt-platform-4-north', 'pt-platform-1-dundee', 'pt-roof-underside', 'pt-south-approach', 'pt-platform-4-clock', 'pt-north-footbridge', 'pt-platform-4-south-end', 'pt-overview'],
  'perth-frontage': ['pt-station-frontage', 'pt-station-hotel', 'pt-kings-place-bridge', 'pt-platform-4-north', 'pt-overview'],
  'perth-city': ['pt-kinnoull-panorama', 'pt-kinnoull-cliff', 'pt-tay-from-bridgend', 'pt-tay-viaduct', 'pt-overview'],
};

/** The page address a Perth capture loads: the Perth scene, no trains, no board or tooltip, pinned. */
export function perthAddress(pin) {
  return withPin('?station=perth&trains=none&board=0&tooltip=0', pin);
}
/** Page script that waits for the city, then switches the page to Perth. */
export const PERTH_SELECT_SCRIPT = "(async()=>{const k=window.__kx;await k.cityLoaded;if(k.stations.state().selected!=='perth')await k.stations.select('perth',false);return true;})()";
/** Page condition true once the Perth scene is loaded, real (not the placeholder) and the one on show. */
export const PERTH_READY_CONDITION = "(()=>{const k=window.__kx,s=k.stations.state(),e=k.stations.perth();return s.phase==='ready'&&s.selected==='perth'&&!!e&&!e.placeholder&&k.stations.activeScene()===e.scene;})()";

/** The page address a Waverley capture loads: the Edinburgh scene, no trains (so no relay and no EB anchors), no board or tooltip, pinned. */
export function waverleyAddress(pin) {
  return withPin('?station=edinburgh-waverley&trains=none&board=0&tooltip=0', pin);
}

/** Page script that waits for the city, then switches the page to Edinburgh Waverley (instantly under reduced motion). Shared with tools/perf.mjs --scene waverley. */
export const WAVERLEY_SELECT_SCRIPT = "(async()=>{const k=window.__kx;await k.cityLoaded;if(k.stations.state().selected!=='edinburgh-waverley')await k.stations.select('edinburgh-waverley',false);return true;})()";
/** Page condition true once the Waverley scene is loaded, real (not the placeholder) and the one on show. */
export const WAVERLEY_READY_CONDITION = "(()=>{const k=window.__kx,s=k.stations.state(),e=k.stations.edinburgh();return s.phase==='ready'&&s.selected==='edinburgh-waverley'&&!!e&&!e.placeholder&&k.stations.activeScene()===e.scene;})()";

/** One id for a built page: the sha256 of its files' relative paths and hashes, so two captures can be shown to come from the same build. */
export function buildId(files) {
  return createHash('sha256').update(JSON.stringify([...files].sort((a, b) => a.file.localeCompare(b.file)).map(f => [f.file, f.sha256]))).digest('hex');
}

/** Where the page's camera differs from the frozen one it was posed at (pos, target, fov), one line per field; [] when it is the frozen camera. */
export function cameraDeparture(frozen, actual, epsilon = 1e-6) {
  const out = [];
  for (const field of ['pos', 'target']) if (frozen[field].some((v, i) => !(Math.abs(v - actual[field]?.[i]) <= epsilon))) out.push(`${field} is ${JSON.stringify(actual[field])}, frozen ${JSON.stringify(frozen[field])}`);
  const fov = frozen.fov ?? 50;
  if (!(Math.abs(fov - actual.fov) <= epsilon)) out.push(`fov is ${actual.fov}, frozen ${fov}`);
  return out;
}

/** The per-shot sidecar: the build, the frozen and the page's camera, the GPU, the pin and lighting, and what the renderer drew. */
export function waverleySidecar({ name, file, camera, metadata, build, pin, pinHonoured: honoured, lighting, lightingState, flicker, hud, when, scene = 'edinburgh-waverley' }) {
  return { schema: 1, scene, view: name, file, when,
    build, camera: { frozen: { pos: camera.pos, target: camera.target, fov: camera.fov ?? null }, actual: metadata.camera, source: camera.source, departure: cameraDeparture(camera, metadata.camera) },
    renderer: metadata.renderer, validGpu: realMetal(metadata.renderer), viewport: metadata.viewport, url: metadata.url,
    pin: { ...pin, parameters: pinParameters(pin) }, pinHonoured: honoured, sunElevationDeg: metadata.sun,
    lighting, lightingState, renderInfo: { drawCalls: metadata.drawCalls, triangles: metadata.triangles }, flicker, hud };
}

/**
 * `node tools/evidence.mjs --gpu --scene waverley --dist <built dir> --out <worktree/.scratch/dir> [--views ...] [--time ...] [--weather ...]`:
 * the frozen Waverley cameras on the built page, each shot twice for flicker, with the page's overlays hidden, at the pinned time and
 * weather. Needs no relay and no EB anchor data (trains are off). Writes waverley/<view>.png, its sidecar waverley/<view>.json and
 * waverley.json (every sidecar, the cameras, the build and the page's errors).
 */
/** What a remote station's capture needs: its scene id, its output folder, its cameras and elements, its address, select script and
 *  ready condition, and the page expression for its loaded view. `--scene waverley` and `--scene perth` share waverleyMain. */
export const REMOTE_CAPTURE_SITES = {
  waverley: { scene: 'edinburgh-waverley', dir: 'waverley', label: 'Waverley', cameras: () => waverleyCameras(), elements: WAVERLEY_ELEMENT_VIEWS,
    address: pin => waverleyAddress(pin), select: WAVERLEY_SELECT_SCRIPT, ready: WAVERLEY_READY_CONDITION, view: 'k.stations.edinburgh()' },
  perth: { scene: 'perth', dir: 'perth', label: 'Perth', cameras: () => perthCameras(), elements: PERTH_ELEMENT_VIEWS,
    address: pin => perthAddress(pin), select: PERTH_SELECT_SCRIPT, ready: PERTH_READY_CONDITION, view: 'k.stations.perth()' },
};

async function waverleyMain(options, site = REMOTE_CAPTURE_SITES.waverley) {
  await stat(path.join(options.dist, 'index.html'));
  await safeOutputDirectory(repoRoot, options.out);
  await walk(options.out);
  const cameras = site.cameras(), selected = resolveWaverleyViews(options.views, cameras, site.elements, site.label);
  const files = await Promise.all((await walk(options.dist)).sort().map(async f => { const b = await readFile(f); return { file: path.relative(options.dist, f), bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') }; }));
  const build = { dist: options.dist, commit: options.commit, id: buildId(files), files: files.length, totalBytes: files.reduce((n, f) => n + f.bytes, 0), index: files.find(f => f.file === 'index.html')?.sha256 ?? null };
  const report = { schema: 1, scene: site.scene, when: new Date().toISOString(), machine: `${os.type()} ${os.release()}, ${os.cpus()[0]?.model}`,
    requestedGpu: options.gpu ? 'ANGLE Metal' : 'SwiftShader (diagnostic only)', renderer: null, validGpu: false, build,
    views: { requested: options.views, names: selected ? [...selected] : Object.keys(cameras) }, cameras,
    pin: { ...options.pin, parameters: pinParameters(options.pin) }, hud: { mode: options.hud, note: HUD_NOTE },
    shots: [], failures: [], consoleErrors: [], networkFailures: [], relayRequests: [] };
  let serverControl, chrome, profile, cdp;
  try {
    serverControl = createEvidenceServer({ dist: options.dist, relay: null });
    const server = serverControl.server;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}/kings-cross/`;
    const candidates = [options.chrome, process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
    let chromeBin; for (const c of candidates) { try { await stat(c); chromeBin = c; break; } catch {} }
    if (!chromeBin) throw new Error('no Chrome found; pass --chrome or set CHROME_PATH');
    profile = await mkdtemp(path.join(options.out, 'chrome-profile-'));
    chrome = spawn(chromeBin, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-sandbox', '--no-first-run', '--mute-audio', '--ignore-gpu-blocklist',
      '--disable-breakpad', '--disable-crash-reporter', '--noerrdialogs', '--use-mock-keychain', '--password-store=basic', '--no-proxy-server',
      ...(options.gpu ? ['--use-angle=metal', '--enable-gpu-rasterization'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), 'about:blank'], { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    cdp = cdpPipe(chrome, m => {
      if (m.method === 'Runtime.exceptionThrown') report.consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') report.consoleErrors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
      if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/relay/')) report.relayRequests.push(m.params.request.url);
      if (m.method === 'Network.loadingFailed') report.networkFailures.push({ message: m.params.errorText, canceled: m.params.canceled ?? false });
    });
    report.browser = await cdp.send('Browser.getVersion');
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const S = (method, params, timeout) => cdp.send(method, params, sessionId, timeout);
    const evaluate = async expression => { const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, 90000); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
    const until = async (expression, ms = 60000) => { const end = Date.now() + ms; do { if (await evaluate(expression).catch(() => false)) return; await sleep(100); } while (Date.now() < end); throw new Error(`page condition timed out: ${expression}`); };
    const twoFrames = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable');
    await S('Emulation.setDeviceMetricsOverride', { ...VIEWPORTS.desktop, deviceScaleFactor: 1, mobile: false });
    // Reduced motion: the station switch swaps scenes at once instead of hopping, so no flight moves a posed camera.
    await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await S('Page.navigate', { url: `${base}${site.address(options.pin)}` });
    await until('!!window.__kx?.ready');
    await evaluate(site.select);
    await until(site.ready, 120000);
    await twoFrames();
    const hudControl = hudController({ evaluate, settle: twoFrames });
    for (const [name, camera] of Object.entries(cameras).filter(([name]) => !selected || selected.has(name))) {
      try {
        await evaluate(`(() => { const k=window.__kx; k.controls.minDistance=.05; k.controls.maxDistance=20000; k.controls.maxPolarAngle=Math.PI; k.camera.far=20000; k.camera.near=${camera.near ?? .1}; k.camera.fov=${camera.fov ?? 50}; k.camera.updateProjectionMatrix(); k.camera.position.set(${camera.pos}); k.controls.target.set(${camera.target}); k.controls.update(); return true; })()`);
        await twoFrames();
        const metadata = await evaluate(`(() => { const k=window.__kx,g=k.renderer.getContext(),d=g.getExtension('WEBGL_debug_renderer_info'),e=${site.view}; let sun=null; try { sun=e.climate?.atmosphere.state()?.sun?.elevationDeg??null; } catch {} return {
          url:location.href,camera:{pos:k.camera.position.toArray(),target:k.controls.target.toArray(),fov:k.camera.fov,near:k.camera.near},
          renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):'unknown',drawCalls:k.renderer.info.render.calls,triangles:k.renderer.info.render.triangles,
          viewport:{width:innerWidth,height:innerHeight},sun}; })()`);
        const lightingState = await evaluate(`(()=>{const k=window.__kx,e=${site.view};return (${lightingProbe.toString()})({scene:e.scene,renderer:k.renderer,atmosphere:e.climate?.atmosphere??null});})()`);
        report.renderer ??= metadata.renderer;
        if (options.gpu && !realMetal(metadata.renderer)) throw new Error(`real Metal required, observed renderer: ${metadata.renderer}`);
        const departure = cameraDeparture(camera, metadata.camera);
        if (departure.length) throw new Error(`camera ${name} moved from its frozen value: ${departure.join('; ')}`);
        const hud = options.hud ? await hudControl.apply(options.hud, name) : null;
        let first, second;
        try {
          first = Buffer.from((await S('Page.captureScreenshot', { format: 'png' })).data, 'base64');
          await sleep(FLICKER_GAP_MS); await twoFrames();
          second = Buffer.from((await S('Page.captureScreenshot', { format: 'png' })).data, 'base64');
        } finally { if (hud) hud.restored = await hudControl.restore(hud.mode); }
        const file = `${site.dir}/${name}.png`;
        await writePrivateFile(path.join(options.out, file), first);
        const sidecar = waverleySidecar({ name, file, camera, metadata, build, pin: options.pin, pinHonoured: pinHonoured(options.pin, lightingState.atmosphere),
          lighting: lightingFingerprint(lightingState), lightingState, flicker: compareFrames(first, second), hud, when: new Date().toISOString(), scene: site.scene });
        await writePrivateFile(path.join(options.out, `${site.dir}/${name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
        report.shots.push(sidecar);
      } catch (error) { report.failures.push(`${name}: ${error.message}`); }
    }
  } catch (error) { report.failures.push(`fatal: ${error.message}`); }
  finally {
    cdp?.close();
    if (chrome?.pid) { const exited = new Promise(r => chrome.once('exit', r)); try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} await Promise.race([exited, sleep(1000)]); }
    await serverControl?.close();
    if (profile) await rm(profile, { recursive: true, force: true });
  }
  report.validGpu = report.shots.length > 0 && report.shots.every(s => s.validGpu);
  report.flicker = { checked: report.shots.length, failed: report.shots.filter(s => !s.flicker.pass).map(s => s.view) };
  report.complete = !report.failures.length && report.validGpu && !report.flicker.failed.length && report.shots.length === report.views.names.length;
  await writePrivateFile(path.join(options.out, `${site.dir}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ out: options.out, renderer: report.renderer, validGpu: report.validGpu, build: build.id, shots: report.shots.length, failures: report.failures, flickerFailed: report.flicker.failed, consoleErrors: report.consoleErrors.length }, null, 2));
  if (!report.complete) process.exitCode = 1;
  return report;
}

/** Match main.ts's city exclusions. kx-city.json has streets/ground; footprints live in kx-track.json. */
export function cityBuildings(data) {
  const hidden = new Set([...buildingsUnderStation(data, shedLayout(data), concourseCanopy(data)), ...REPLACED_BUILDING_IDS]);
  const station = stationBuilding(data); if (station) hidden.add(station.id);
  return data.buildings.filter(b => !hidden.has(b.id) && b.pts.length >= 3).map(planBuilding);
}

/** Use the city's fitted roof, including assumed heights, rather than just buildings with OSM height tags. */
export function cameraBuildingCollisions(cameras, buildings, groundY = -.2) {
  return Object.entries(cameras).flatMap(([camera, c]) => buildings.flatMap(b => {
    const roofY = groundY + (b.canopy ? b.height : b.storeys * b.storeyHeight);
    return c.pos[1] < roofY && pointInPolygon([c.pos[0], c.pos[2]], b.ring)
      ? [{ camera, buildingId: b.id, roofY, pos: c.pos }] : [];
  }));
}

/**
 * Time of day and weather are pinned in the page address (tools/scene-pin.mjs): `?time=` and `?weather=`, default midsummer noon and
 * a clear sky, so a capture does not follow the real clock or the live weather. A build from before the sky and weather work ignores
 * both and keeps web/src/world.ts LIGHTS, one fixed dusk rig, so every capture of that build is lit alike. Either way each shot
 * records `lightingFingerprint` of the lights, sky, fog and tone mapping it was rendered with, so two captures can be shown to share
 * their lighting, and `pinHonoured` says whether the page applied the pin.
 */
export const LIGHTING_NOTE = 'Captures pin the scene with ?time=<instant>&weather=<name> (default 2026-06-21T12:00:00+01:00, clear: midsummer noon) on pages that read them; --sky ref asks for the old fixed look. A build from before the sky and weather work ignores the pin and keeps its one fixed dusk rig (web/src/world.ts LIGHTS), so every capture of that build is lit alike; lighting.pinHonoured says which happened. Each shot carries a fingerprint of its light rig, sky, fog and tone mapping: equal fingerprints mean equal lighting.';

/** Serialized into the page: the lighting state of the scene, rounded so equal rigs read equal. */
export function lightingProbe(kx) {
  const round = n => Math.round(n * 1e4) / 1e4, hex = c => c?.getHexString?.() ?? null, lights = [];
  kx.scene.traverse(o => {
    if (o.isLight) lights.push({ type: o.type, name: o.name || null, colour: hex(o.color), groundColour: hex(o.groundColor), intensity: round(o.intensity), position: o.position.toArray().map(round), visible: o.visible });
  });
  // The sky dome is a vertex-coloured sphere: its lowest and highest vertex colours are the horizon and the zenith.
  const dome = kx.scene.children.find(o => o.isMesh && o.geometry?.type === 'SphereGeometry' && o.geometry.parameters?.radius > 1000);
  let horizon = null, zenith = null;
  if (dome) {
    const position = dome.geometry.getAttribute('position'), colours = dome.geometry.getAttribute('color');
    let low = 0, high = 0;
    for (let i = 1; i < position.count; i++) { if (position.getY(i) < position.getY(low)) low = i; if (position.getY(i) > position.getY(high)) high = i; }
    if (colours) { horizon = [colours.getX(low), colours.getY(low), colours.getZ(low)].map(round); zenith = [colours.getX(high), colours.getY(high), colours.getZ(high)].map(round); }
  }
  const fog = kx.scene.fog;
  // What the page says about its sky: no hook (a build from before the sky and weather work), the old fixed look, or a live atmosphere and its sun.
  let atmosphere = 'absent';
  if ('atmosphere' in kx) {
    atmosphere = 'fixed';
    if (kx.atmosphere) { let sun = null; try { sun = kx.atmosphere.state?.().sun?.elevationDeg; } catch { /* the hook exists; its sun is unknown */ } atmosphere = { sunElevationDeg: Number.isFinite(sun) ? round(sun) : null }; }
  }
  return { lights, background: hex(kx.scene.background), horizon, zenith, fog: fog ? { colour: hex(fog.color), near: fog.near ?? null, far: fog.far ?? null, density: fog.density ?? null } : null,
    toneMapping: kx.renderer.toneMapping, exposure: round(kx.renderer.toneMappingExposure), outputColorSpace: kx.renderer.outputColorSpace, atmosphere };
}

/** A short stable id for a lighting state: independent of the order of lights and of object key order. */
export function lightingFingerprint(state) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const lights = state.lights.map(canonical).map(light => JSON.stringify(light)).sort();
  return createHash('sha256').update(JSON.stringify({ ...canonical(state), lights })).digest('hex').slice(0, 16);
}

/** Serialized into the page so a deferred city cannot arrive after a cutaway was hidden. */
export async function prepareEvidenceScene(kx, hideScenery, bare = false) {
  await kx.cityLoaded;
  if (kx.cityLoaded && !bare && !kx.parts?.buildings) throw new Error('cityLoaded resolved without the city in the scene');
  if (hideScenery !== undefined) for (const object of [kx.parts?.shed, kx.parts?.buildings]) {
    if (object) object.visible = !hideScenery;
  }
  return true;
}

/** An observed aspect proves that the controller decoded this OSM head. A later unknown
 * is eligible only for a head previously observed decoded; an unmapped '?' proves no decoder. */
export function signalStateTarget(signals, state, decodedIds = new Set()) {
  return signals.find(s => Number.isSafeInteger(s.id) && s.id > 0 && !s.inferred && s.state === state &&
    (state !== 'unknown' || decodedIds.has(s.id))) ?? null;
}

/** A close view of the lamp face from the track side, below head height, with the OSM aspect kept visible. */
export function signalStateCamera(position, signal, source = 'OSM signal face') {
  const facingLength = Math.hypot(...signal.facing) || 1;
  const fx = signal.facing[0] / facingLength, fz = signal.facing[1] / facingLength;
  const mountSide = signal.side === 'left' ? 1 : -1;
  // The signal post is offset from the rail by two metres; move partway back towards the track.
  const trackX = -mountSide * signal.travel[1], trackZ = mountSide * signal.travel[0];
  return {
    pos: [position[0] + fx * 2.8 + trackX * 1.6, position[1] + 2.9, position[2] + fz * 2.8 + trackZ * 1.6],
    target: [position[0] + fx * .32, position[1] + 4.1, position[2] + fz * .32],
    near: .1, fov: 30, source,
  };
}

/** Hide the station board only while a signal face is captured, then restore its exact inline visibility. */
export function setSignalDetailBoardVisibility(board, hidden, previous = null) {
  if (!board) return null;
  if (hidden) {
    const state = { value: board.style.getPropertyValue('visibility'), priority: board.style.getPropertyPriority('visibility') };
    board.style.setProperty('visibility', 'hidden');
    return state;
  }
  if (previous?.value) board.style.setProperty('visibility', previous.value, previous.priority);
  else board.style.removeProperty('visibility');
  return null;
}

/** Convert the requested London clock to an epoch window, including BST recordings. */
export function signalReplayWindow(isoDate, clock, durationMs = 600000) {
  const utc = Date.parse(`${isoDate}T${clock}Z`);
  const zone = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' });
  const offset = zone.formatToParts(utc).find(p => p.type === 'timeZoneName').value;
  const match = /^GMT(?:([+-])(\d+)(?::(\d+))?)?$/.exec(offset);
  const minutes = match?.[1] ? (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === '+' ? 1 : -1) : 0;
  const startMs = utc - minutes * 60000;
  return { startMs, endMs: startMs + durationMs };
}

/** Search every eligible head, never wait on a synthetic id. Missing states are a result,
 * not a thrown timeout; a stalled clock is bounded separately from the simulation window. */
export async function searchSignalStates({ sample, capture, startMs, endMs, timeoutMs, wait = sleep, now = Date.now }) {
  const pending = new Set(['danger', 'proceed', 'unknown']), decodedIds = new Set(), captures = [];
  const deadline = now() + timeoutMs;
  let frame, reason;
  for (;;) {
    frame = await sample();
    for (const s of frame.signals) if (s.id > 0 && !s.inferred && ['danger', 'proceed'].includes(s.state)) decodedIds.add(s.id);
    if (frame.timeMs >= startMs && frame.timeMs <= endMs) for (const state of pending) {
      const target = signalStateTarget(frame.signals, state, decodedIds);
      if (target && await capture(target, state)) { captures.push({ state, id: target.id, timeMs: frame.timeMs }); pending.delete(state); }
    }
    if (!pending.size) { reason = 'all states captured'; break; }
    if (frame.ended || frame.timeMs >= endMs) { reason = frame.ended ? 'recording ended' : 'window ended'; break; }
    if (now() >= deadline) { reason = 'replay clock did not traverse the window within the capture budget'; break; }
    await wait(100);
  }
  return { startMs, endMs, scannedUntilMs: frame.timeMs, captures, missing: [...pending], decodedIds: [...decodedIds], reason };
}

export function trainCameras(trains, data) {
  const platforms = [...stationPlatforms(data).values()];
  const ground = p => platforms.some(q => pointInPolygon([p[0], p[2]], q.pts)) ? PLATFORM_HEIGHT : 0;
  const at = (t, s, off, y) => [t.nose[0] + Math.sin(t.h) * s + Math.cos(t.h) * off, y, t.nose[2] - Math.cos(t.h) * s + Math.sin(t.h) * off];
  const stand = (t, s, off, eye) => { for (const sign of [1, -1]) { const p = at(t, s, off * sign, 0); if (ground(p)) return [p[0], ground(p) + eye, p[2]]; } return at(t, s, off, eye); };
  const freeSide = (t,s) => [1,-1].find(sign => ground(at(t,s,sign*3.5,0)) === 0) ?? 1;
  const l9 = trains.find(t => t.kind === 'lner9'); if (!l9) throw new Error('sample lner9 not exposed in window.__kx.trains');
  const layout = trainLayout('lner9'), coach = layout.cars[1], bogie = layout.cars[0].bogies[0];
  const c = (pos, target, detail) => ({ pos, target, fov: 50, near: .1, source: 'window.__kx sample train nose and heading + trainLayout', detail });
  const cams = {
    'azuma-nose-3m': c(stand(l9, -3, 0, 1.7), at(l9, 0, 0, 1.7), '3 m horizontally in front of nose'),
    'coach-side-3m': c(stand(l9, coach.start + 5, FIGURES.bodyWidth.value / 2 + 3, 1.6), at(l9, coach.start + 5, 0, 2.2), '3 m horizontally from coach side'),
    gangway: c(at(l9, coach.start, 3.5, 2), at(l9, coach.start, 0, 1.9), 'joint between leading and second cars'),
    bogie: c(at(l9, bogie, freeSide(l9,bogie)*3.5, .65), at(l9, bogie, 0, .55), 'cab-end bogie at rail height'),
    'whole-train-side': { ...c(at(l9, layout.length / 2, -950, 8), at(l9, layout.length / 2, 0, 2), 'cutaway: shed and generic blocks hidden'), fov: 7, near: 100, hideScenery: true },
  };
  const pantograph = layout.cars.find(car => car.pantograph)?.pantograph;
  if (pantograph) { const s = (pantograph[0] + pantograph[1]) / 2; cams.pantograph = c(at(l9, s - 2, 5.5, 8), at(l9, s, 0, 3.8), 'roof pantograph'); }
  for (const [name, kind] of [['lumo', 'lumo5'], ['hull-trains', 'hull5'], ['great-northern-387', 'gn387x4']]) {
    const t = trains.find(t => t.kind === kind); if (t) cams[name] = c(stand(t, 6.5, 5, 1.6), at(t, 6.5, 0, 2), `sample ${kind}`);
  }
  for (const kind of ['gc180x5', 'tl700x8']) {
    const t = trains.find(t => t.kind === kind); if (!t) continue;
    const layout = trainLayout(kind);
    cams[`${kind}-nose-three-quarter`] = c(stand(t, -3, 3.5, 1.6), at(t, 0, 0, 2), `sample ${kind}; nose three-quarter`);
    const distance = Math.max(950, layout.length * 6);
    cams[`${kind}-whole-side`] = { ...c(at(t, layout.length / 2, -distance, 8), at(t, layout.length / 2, 0, 2), `sample ${kind}; full side; cutaway: shed and generic blocks hidden`),
      fov: 7, near: 100, hideScenery: true };
  }
  return cams;
}

// A bounded CDP pipe avoids debugging-port races and orphaned command promises.
export function cdpPipe(child, onEvent = () => {}) {
  let serial = 0, buffer = '', closed;
  const pending = new Map(), writer = child.stdio[3], reader = child.stdio[4];
  const fail = error => { closed = error; for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear(); };
  reader.setEncoding('utf8'); reader.on('data', chunk => { buffer += chunk; let end;
    while ((end = buffer.indexOf('\0')) >= 0) { const raw = buffer.slice(0, end); buffer = buffer.slice(end + 1); let m;
      try { m = JSON.parse(raw); } catch { continue; }
      const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } else onEvent(m);
    }
  });
  child.once('error', fail); child.once('exit', () => fail(new Error('Chrome exited during evidence capture'))); reader.on('error', fail); writer.on('error', fail);
  return { send(method, params = {}, sessionId, timeoutMs = 15000) { return new Promise((resolve, reject) => {
    if (closed) { reject(closed); return; } const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer }); writer.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  }); }, close() { fail(new Error('CDP closed')); } };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const walk = async dir => { const result = []; for (const entry of await readdir(dir, { withFileTypes: true })) { const f = path.join(dir, entry.name); if (entry.isDirectory()) result.push(...await walk(f)); else { if(entry.isSymbolicLink()) throw new Error('evidence trees must not contain symlinks'); result.push(f); } } return result; };
const activeChecks = new Set();
export async function commandResult(command, args, cwd, destination, timeoutMs = 300000) {
  let child;
  const result = await new Promise(resolve => {
    const output = []; let done = false, timedOut = false;
    child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    activeChecks.add(child);
    const timer = setTimeout(() => {
      timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      child.stdout.destroy(); child.stderr.destroy(); finish(null, 'command timed out');
    }, timeoutMs);
    const finish = (code, error) => { if (done) return; done = true; activeChecks.delete(child); clearTimeout(timer); resolve({ command: [command, ...args], cwd, code, timedOut, error, output: Buffer.concat(output).toString() }); };
    child.stdout.on('data', d => output.push(d)); child.stderr.on('data', d => output.push(d));
    child.once('error', e => finish(null, e.message)); child.once('close', code => finish(code));
  });
  await writePrivateFile(destination, result.output); const { output, ...summary } = result; return { ...summary, file: path.basename(destination) };
}

/** The fault switch cuts only this pack's proxy; it never stops the user's relay. */
export function createEvidenceServer({ dist, relay, repo = repoRoot }) {
  let proxyEnabled = true;
  const proxyRequests = new Set(), sockets = new Set();
  const server = createServer(async (req, res) => {
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (u.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
      if (u.pathname.startsWith('/relay/')) {
        if (!proxyEnabled || !relay || !/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? '')) { res.writeHead(503, { 'content-type': 'application/json' }).end('{"error":"relay unavailable"}'); return; }
        const target = proxyTarget(relay, req.url);
        const forward = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, { method: 'GET', headers: { host: target.host, accept: req.headers.accept ?? '*/*' }, timeout: 35000 }, upstream => {
          res.writeHead(upstream.statusCode ?? 502, { 'content-type': upstream.headers['content-type'] ?? 'application/octet-stream', 'cache-control': 'no-store' }); upstream.pipe(res);
          upstream.once('aborted', () => res.destroy());
        });
        proxyRequests.add(forward); forward.once('close', () => proxyRequests.delete(forward));
        res.once('close', () => forward.destroy()); forward.once('timeout', () => forward.destroy());
        forward.once('error', () => { if (!res.headersSent) res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"relay unavailable"}'); }); forward.end(); return;
      }
      let hit;
      if (u.pathname === '/almanac-back.js') hit = await safeFile(repo, '/almanac-back.js');
      else if (u.pathname === '/kings-cross' || u.pathname === '/kings-cross/') hit = await safeFile(dist, '/index.html');
      else if (u.pathname.startsWith('/kings-cross/')) hit = await safeFile(dist, u.pathname.slice('/kings-cross'.length));
      if (!hit) { res.writeHead(404).end(); return; } res.writeHead(200, { 'content-type': hit.type }).end(hit.body);
    });
    server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  return {
    server,
    setProxy(enabled) { proxyEnabled = enabled; if (!enabled) for (const request of proxyRequests) request.destroy(); },
    async close() {
      for (const request of proxyRequests) request.destroy();
      for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise(resolve => server.close(resolve));
    },
  };
}

export async function main(args = process.argv.slice(2)) {
  const options = optionsFrom(args);
  if (options.help) { console.log(`node tools/evidence.mjs --gpu --dist <built dir> --out <worktree/.scratch/pack> [--relay http://127.0.0.1:8787] [--date YYYYMMDD] [--speed 8] [--signal-at HH:mm:ss] [--live-window <1..3600 seconds> | --live-report <path>] [--raw-osm <OSM extract.json>] [--chrome <path>]
node tools/evidence.mjs --gpu --dist <built dir> --out <worktree/.scratch/pack> --views <element|view>[,<element|view>...]   (station views only: no trains, relay, tests or performance run)
  elements: ${Object.keys(ELEMENT_VIEWS).join(', ')}; or station for every fixed station view
node tools/evidence.mjs --gpu --scene waverley --dist <built dir> --out <worktree/.scratch/dir> [--views <element|view>,...] [--commit <sha>]   (the frozen Edinburgh Waverley cameras; no relay or EB data)
  elements: ${Object.keys(WAVERLEY_ELEMENT_VIEWS).join(', ')}; views: ${Object.keys(FROZEN_WAVERLEY_CAMERAS).join(', ')}
node tools/evidence.mjs --gpu --scene perth --dist <built dir> --out <worktree/.scratch/dir> [--views <element|view>,...] [--commit <sha>]   (the frozen Perth cameras; no relay)
  elements: ${Object.keys(PERTH_ELEMENT_VIEWS).join(', ')}; views: ${Object.keys(FROZEN_PERTH_CAMERAS).join(', ')}
  scoring views (VIEW_ROLES): ${Object.entries(VIEW_ROLES).map(([view, r]) => `${view} is ${r.element} ${r.criterion}'s ${r.role} view`).join('; ')}
Every fixed station view is shot twice, 150 ms apart, to check it for flicker; exit code 1 if the capture stops or a view flickers.
Every page load pins the scene clock and weather in its address (a build that predates the sky and weather work ignores them):
  --time <ISO 8601 instant with a zone, or 13-digit epoch ms>   default ${PIN_TIME}
  --weather <${WEATHER_NAMES.join('|')}>   default ${PIN_WEATHER}
  --sky ref   the page's old fixed look instead (cannot be combined with --time or --weather)
The page draws its own overlays (station switcher, status and attribution panels, title, Almanac pill) over the canvas:
  --hud <on|off>   default off: every fixed station view is shot with them hidden (and restored after each shot), plus overview-hud-on, the
                   overview with them shown; the axis-01 grid views keep them. on shows them in every station view.`); return; }
  if (options.scene === 'waverley' || options.scene === 'perth') return waverleyMain(options, REMOTE_CAPTURE_SITES[options.scene]);
  await stat(path.join(options.dist, 'index.html'));
  await safeOutputDirectory(repoRoot, options.out);
  await walk(options.out); // Reject reused input/report links before fetching any private data.
  const data = JSON.parse(await readFile(path.join(packageRoot, 'web/src/data/kx-track.json'), 'utf8'));
  const city = JSON.parse(await readFile(path.join(packageRoot, 'web/src/data/kx-city.json'), 'utf8'));
  const buildings = cityBuildings(data), cameras = stationCameras(data), files = await walk(options.dist);
  const selected = resolveViews(options.views, cameras); // null: the whole pack; a Set: only those fixed station views
  const bundleFiles = await Promise.all(files.sort().map(async f => { const b = await readFile(f); return { file: path.relative(options.dist, f), bytes: b.length, gzip: gzipSync(b).length, sha256: createHash('sha256').update(b).digest('hex') }; }));
  const twin = twinRails(railSegments(data).main.slice(0, 6));
  const drawnGauge = Math.hypot(twin[0]-twin[6], twin[2]-twin[8]) - RAIL_HEAD_WIDTH;
  const report = { schema: 2, when: new Date().toISOString(), machine: `${os.type()} ${os.release()}, ${os.cpus()[0]?.model}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB`,
    requestedGpu: options.gpu ? 'ANGLE Metal' : 'SwiftShader (diagnostic only)', renderer: null, validGpu: false, complete: false,
    views: { requested: options.views, partial: !!selected, names: selected ? [...selected] : null },
    lighting: { pin: { ...options.pin, parameters: pinParameters(options.pin) }, pinHonoured: null, note: LIGHTING_NOTE, fingerprints: {} },
    hud: { mode: options.hud, selectors: [...HUD_SELECTORS], note: HUD_NOTE },
    build: { dist: options.dist, files: bundleFiles, totalBytes: bundleFiles.reduce((n, f) => n + f.bytes, 0), totalGzipBytes: bundleFiles.reduce((n, f) => n + f.gzip, 0), budgetGzipBytes: 2 * 1024 ** 2 },
    replay: { date: options.date, speed: options.speed, signalAtUK: options.signalAt, relay: options.relay?.origin ?? null },
    axes: AXES.map(a => ({ ...a, screenshots: [], artifacts: [], gaps: [] })), screenshots: [], commands: [], scenarios: [], consoleErrors: [], networkFailures: [], gaps: [],
    geometry: { platforms: platformReport(data), gaugeM: { standard: GAUGE, drawn: drawnGauge }, shed: shedLayout(data) },
    cameraClearance: { cityExtract: city.extract, footprints: 'web/src/data/kx-track.json', heights: 'core/city.ts planBuilding', groundY: -.2,
      namedCameras: Object.keys(cameras), collisions: cameraBuildingCollisions(cameras, buildings), captures: [] },
    trainDimensions: ALL_KINDS.map(kind => { const l = trainLayout(kind); return { kind, lengthM: l.length, bodyDimensions: l.spec.family === 'at300' ? { width: FIGURES.bodyWidth, roofEdge: FIGURES.roofEdgeHeight, roofCover: FIGURES.roofCoverHeight } : { width: EMU_FIGURES[l.spec.family].bodyWidth, height: EMU_FIGURES[l.spec.family].height }, cars: l.cars.map(c => ({ type: c.type, lengthM: c.length })), dimensionTest: 'core/tests/train.test.ts' }; }),
  };
  const axis = id => report.axes.find(a => a.id === id);
  const gap = (id, message) => { axis(id).gaps.push(message); report.gaps.push(`${id}: ${message}`); };
  let server, serverControl, chrome, profile, cdp, cleanupPromise, currentScenario = 'startup';
  const setProxy = enabled => serverControl.setProxy(enabled);
  const cleanup = () => cleanupPromise ??= (async () => {
    cdp?.close();
    if (chrome?.pid) { const exited = new Promise(r => chrome.once('exit', r)); try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} await Promise.race([exited, sleep(1000)]); }
    await serverControl?.close();
    if (profile) await rm(profile, { recursive: true, force: true });
  })();
  const stop = () => {
    for (const child of activeChecks) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
    void cleanup().finally(() => process.exit(130));
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    serverControl = createEvidenceServer({ dist: options.dist, relay: options.relay });
    server = serverControl.server;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port, base = `http://127.0.0.1:${port}/kings-cross/`, publicBase = `http://pages.kx.test:${port}/kings-cross/`;
    const candidates = [options.chrome, process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
    let chromeBin; for (const c of candidates) { try { await stat(c); chromeBin = c; break; } catch {} }
    if (!chromeBin) throw new Error('no Chrome found; pass --chrome or set CHROME_PATH');
    profile = await mkdtemp(path.join(options.out, 'chrome-profile-'));
    chrome = spawn(chromeBin, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-sandbox', '--no-first-run', '--mute-audio', '--ignore-gpu-blocklist',
      '--disable-breakpad', '--disable-crash-reporter', '--noerrdialogs', '--use-mock-keychain', '--password-store=basic', '--no-proxy-server', '--host-resolver-rules=MAP pages.kx.test 127.0.0.1',
      ...(options.gpu ? ['--use-angle=metal', '--enable-gpu-rasterization'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), 'about:blank'], { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    cdp = cdpPipe(chrome, m => {
      if (m.method === 'Runtime.exceptionThrown') report.consoleErrors.push({ scenario: currentScenario, message: m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text });
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') report.consoleErrors.push({ scenario: currentScenario, message: m.params.args.map(a => a.value ?? a.description ?? '').join(' ') });
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') report.consoleErrors.push({scenario:currentScenario,message:m.params.entry.text});
      if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/relay/')) (report.relayRequests ??= []).push({scenario:currentScenario,url:m.params.request.url,method:m.params.request.method});
      if (m.method === 'Network.loadingFailed') report.networkFailures.push({ scenario: currentScenario, message: m.params.errorText, canceled: m.params.canceled ?? false });
    });
    report.browser = await cdp.send('Browser.getVersion');
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const S = (method, params, timeout) => cdp.send(method, params, sessionId, timeout);
    const evaluate = async expression => { const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, 45000); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
    await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable'); await S('Log.enable');
    const viewport = async name => S('Emulation.setDeviceMetricsOverride', { ...VIEWPORTS[name], deviceScaleFactor: 1, mobile: name === 'phone' });
    const until = async (expression, ms = 20000) => { const end = Date.now() + ms; do { if (await evaluate(expression).catch(() => false)) return; await sleep(100); } while (Date.now() < end); throw new Error(`page condition timed out: ${expression}`); };
    const twoFrames = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    const prepareScene = hideScenery => evaluate(`(${prepareEvidenceScene.toString()})(window.__kx,${JSON.stringify(hideScenery)},new URLSearchParams(location.search).has('bare'))`);
    let pinnedLoad = false; // did the page now loaded get the scene pin in its address (bare geometry views carry their own fixed look)
    const navigate = async (query, scenario, vp = 'desktop', origin = base) => {
      const address = withPin(query, options.pin); pinnedLoad = address !== query;
      currentScenario = scenario; await viewport(vp); await S('Page.navigate', { url: `${origin}${address}` });
      await until('!!window.__kx?.ready'); await prepareScene(); await twoFrames();
    };
    const setCamera = async c => { await evaluate(`(() => { const k=window.__kx; k.controls.minDistance=.05; k.controls.maxDistance=20000; k.controls.maxPolarAngle=Math.PI; k.camera.far=20000; k.camera.near=${c.near ?? .1}; k.camera.fov=${c.fov ?? 50}; k.camera.updateProjectionMatrix(); k.camera.position.set(${c.pos}); k.controls.target.set(${c.target}); k.controls.update(); return true; })()`); await twoFrames(); };
    // The page's overlays (hud.mjs): hidden or checked before a shot, put back and checked after it.
    const hudControl = hudController({ evaluate, settle: twoFrames });
    const shot = async (id, name, c, { twoFrame = false, hud: hudWanted, ...extra } = {}) => {
      await prepareScene(c ? !!c.hideScenery : undefined);
      if (c) await setCamera(c); else await twoFrames();
      const metadata = await evaluate(`(() => { const k=window.__kx,g=k.renderer.getContext(),d=g.getExtension('WEBGL_debug_renderer_info'); return {
        url:location.href,clockKind:k.feed?.mode==='replay'?'recording epoch milliseconds':k.feed?.mode==='live'?'live elapsed milliseconds':'sample/offline',simTimeISO:k.feed?.mode==='replay'?new Date(k.feed.timeMs).toISOString():null,camera:{pos:k.camera.position.toArray(),target:k.controls.target.toArray(),fov:k.camera.fov,near:k.camera.near},simTimeMs:k.feed?.timeMs??null,
        renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):'unknown',drawCalls:k.renderer.info.render.calls,triangles:k.renderer.info.render.triangles,
        viewport:{width:innerWidth,height:innerHeight},overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        status:document.getElementById('status')?.textContent,firstFrameMs:k.firstFrameMs,feed:k.feed,
        board:k.boardRows?{timetable:k.boardRows.timetable,platformTrains:k.boardRows.platforms.flatMap(p=>p.trains).length,matched:k.boardRows.platforms.flatMap(p=>p.trains).filter(t=>t.uid).length,due:k.boardRows.due.length}:null,
        city:{loaded:!!k.parts?.buildings,bare:new URLSearchParams(location.search).has('bare'),visible:k.parts?.buildings?.visible??false},
        motion:k.motionState?.map(t=>({id:t.id,state:t.state,speed:t.speed,point:t.leading.point})),signals:k.signals?.signals().map(r=>({id:r.signal.id,berth:r.group.userData.berth??r.signal.berth,state:r.state,inferred:r.inferredPosition,starter:!!r.group.userData.platformStarter,label:r.label}))}; })()`);
      const lightingState = await evaluate(`(${lightingProbe.toString()})(window.__kx)`), lighting = lightingFingerprint(lightingState);
      (report.lighting.fingerprints[lighting] ??= { state: lightingState, shots: 0 }).shots++;
      if (pinnedLoad) report.lighting.pinHonoured = (report.lighting.pinHonoured ?? true) && pinHonoured(options.pin, lightingState.atmosphere);
      const collisions = cameraBuildingCollisions({ [name]: metadata.camera }, buildings);
      report.cameraClearance.captures.push({ name, collisions });
      if (collisions.length) throw new Error(`camera ${name} is inside city building ${collisions.map(c=>c.buildingId).join(', ')} below its roof`);
      report.renderer ??= metadata.renderer; report.validGpu = realMetal(metadata.renderer);
      if (options.gpu && !realMetal(metadata.renderer)) throw new Error(`real Metal required, observed renderer: ${metadata.renderer}`);
      if (extra.signalId !== undefined && metadata.signals?.find(s=>s.id===extra.signalId)?.state !== extra.observedState) throw new Error('signal changed state before capture; shot was not accepted');
      const file = `axis-${id}/${name}.png`; await mkdir(path.join(options.out, `axis-${id}`), { recursive: true });
      const boardState = extra.signalId === undefined ? null : await evaluate(`(${setSignalDetailBoardVisibility.toString()})(document.querySelector('.kx-board'),true)`);
      const hud = hudWanted ? await hudControl.apply(hudWanted, name) : null;
      let png, secondPng = null, captureRender = null;
      try {
        if (extra.signalId !== undefined) await twoFrames();
        png = await captureEvidencePng(extra.roofMaterialEvidence, {
          prepare: async () => evaluate(`(() => {
            const k=window.__kx, cladding=k.parts?.shed?.getObjectByName('shed-roof-cladding');
            if(!cladding) throw new Error('shed roof cladding unavailable');
            const materials=Array.isArray(cladding.material)?cladding.material:[cladding.material];
            const state={cladding,materials,opacity:materials.map(m=>m.opacity),depthWrite:materials.map(m=>m.depthWrite),callback:cladding.onBeforeRender,ready:false,release:null};
            state.promise=(${withSolidSlateEvidence.toString()})(cladding,()=>new Promise(resolve=>{state.ready=true;state.release=resolve;}));
            k.__solidSlateCapture=state; return true;
          })()`),
          capture: async () => {
            if (extra.roofMaterialEvidence === ROOF_MATERIAL_SOLID) {
              await until('window.__kx.__solidSlateCapture?.ready === true');
              await twoFrames();
              captureRender = await evaluate(`(() => {
                const k=window.__kx,cladding=k.parts.shed.getObjectByName('shed-roof-cladding'),glass=k.parts.shed.getObjectByName('shed-roof-glass');
                const opacity=Array.isArray(cladding.material)?cladding.material.map(m=>m.opacity):cladding.material.opacity;
                const depthWrite=Array.isArray(cladding.material)?cladding.material.map(m=>m.depthWrite):cladding.material.depthWrite;
                if ((Array.isArray(opacity)?opacity.some(value=>value!==1):opacity!==1) || (Array.isArray(depthWrite)?depthWrite.some(value=>value!==true):depthWrite!==true))
                  throw new Error('solid slate was not active after two rendered frames');
                return {drawCalls:k.renderer.info.render.calls,triangles:k.renderer.info.render.triangles,roofCladding:{opacity,depthWrite,glassOpacity:glass.material.opacity},overrideFrames:2};
              })()`);
            }
            const first = await S('Page.captureScreenshot', { format: 'png' });
            // Flicker check: the scene is still, so a second screenshot a moment and two rendered frames later must match.
            if (twoFrame) { await sleep(FLICKER_GAP_MS); await twoFrames(); secondPng = await S('Page.captureScreenshot', { format: 'png' }); }
            return first;
          },
          restore: async () => {
            await evaluate('window.__kx.__solidSlateCapture?.release?.(true); true');
            await evaluate('window.__kx.__solidSlateCapture.promise');
            const restored = await evaluate(`(() => {
              const s=window.__kx.__solidSlateCapture;
              const ok=s.cladding.onBeforeRender===s.callback && s.materials.every((m,i)=>m.opacity===s.opacity[i]&&m.depthWrite===s.depthWrite[i]);
              delete window.__kx.__solidSlateCapture; return ok;
            })()`);
            if (!restored) throw new Error('solid slate evidence failed to restore auto cladding state');
          },
        });
      } finally {
        if (extra.signalId !== undefined) await evaluate(`(${setSignalDetailBoardVisibility.toString()})(document.querySelector('.kx-board'),false,${JSON.stringify(boardState)})`);
        if (hud) hud.restored = await hudControl.restore(hud.mode);
      }
      if (extra.signalId !== undefined && !await evaluate(`window.__kx.signals.signals().find(r=>r.signal.id===${extra.signalId})?.state===${JSON.stringify(extra.observedState)}`)) throw new Error('signal changed during capture; shot was not accepted');
      await writePrivateFile(path.join(options.out, file), Buffer.from(png.data, 'base64'));
      const flicker = secondPng ? compareFrames(Buffer.from(png.data, 'base64'), Buffer.from(secondPng.data, 'base64')) : null;
      const record = { file, axis: id, scenario: currentScenario, ...metadata, ...(captureRender ?? {}), source: c?.source ?? 'current page camera', lighting, ...(flicker ? { flicker } : {}), ...(hud ? { hud } : {}), ...extra };
      report.screenshots.push(record); axis(id).screenshots.push(file); return record;
    };
    const attempt = async (id, name, work) => { try { await work(); } catch (e) { gap(id, `${name}: ${e.message}`); } };
    const boardShots = async (prefix = 'board') => {
      await viewport('desktop'); const desktop = await shot('04', `${prefix}-desktop`, cameras.overview);
      if (desktop.feed.mode === 'replay' && !desktop.board?.timetable) gap('04', 'The relay has no timetable for this recording date; board shots say no timetable.');
      await viewport('phone'); await twoFrames();
      await until("document.querySelector('.kx-board button')?.getAttribute('aria-expanded')==='false'");
      await shot('04', `${prefix}-phone-collapsed`, cameras.overview);
      await evaluate("document.querySelector('.kx-board button').click()"); await twoFrames();
      await shot('04', `${prefix}-phone-expanded`, cameras.overview);
      await viewport('desktop');
    };


    // Fixed offline views deliberately keep the station intact; only measuring views are bare.
    await navigate('?trains=none&board=0', 'station');
    await runStationEvidenceShots(cameras, shot, attempt, selected, options.hud);
    if (!cameras['gasworks-portals'] && (!selected || selected.has('gasworks-portals'))) gap('02', 'Gasworks south mouth could not be located in public geometry');
    const gridViews = Object.entries(cameras).filter(([name, c]) => c.grid && (!selected || selected.has(name)));
    if (gridViews.length) {
      await navigate('?trains=none&bare=1&grid=1&board=0', 'geometry');
      for (const [name, c] of gridViews) await shot('01', `${name}-10m-grid`, c, { twoFrame: true });
    }

    // --views captures only the fixed station views above; the rest of the pack (trains, relay scenarios, performance) is skipped.
    if (!selected) {
      await navigate('?trains=demo&board=0', 'sample trains');
      const readTrainRows = () => evaluate('window.__kx.trains.map(t=>({kind:t.kind,nose:t.noseWorld,h:t.headingRad}))');
      const stageSample = async kind => evaluate(`(() => {
        const k=window.__kx;
        if(k.trains.some(t=>t.kind===${JSON.stringify(kind)}))return 'existing sample';
        if(typeof k.evidenceBuildTrain!=='function'||k.__evidenceActiveTrain)return null;
        const base=k.trains.find(t=>t.kind==='lner5'); if(!base)return null;
        const group=k.evidenceBuildTrain(${JSON.stringify(kind)});
        group.position.copy(base.group.position);group.quaternion.copy(base.group.quaternion);k.scene.add(group);base.group.visible=false;
        const active={...base,kind:${JSON.stringify(kind)},group};
        k.__evidenceBaseTrain=base;k.__evidenceActiveTrain=active;k.trains[k.trains.indexOf(base)]=active;
        return 'staged sample ${kind} replacing sample lner5 for evidence';
      })()`);
      const restoreSample = () => evaluate(`(() => {
        const k=window.__kx, base=k.__evidenceBaseTrain, active=k.__evidenceActiveTrain;
        if(!base||!active)return false;
        const index=k.trains.indexOf(active); if(index<0)return false;
        active.group.visible=false;active.group.removeFromParent();base.group.visible=true;k.trains[index]=base;
        delete k.__evidenceBaseTrain;delete k.__evidenceActiveTrain;return true;
      })()`);
      const trainRows = () => readTrainRows();
      let trains = await trainRows();
      const staged = await stageSample('gn387x4');
      if (staged) trains = await trainRows();
      else gap('03', `387 unavailable in built samples. After kx is created in main.ts add: ${TRAIN_FACTORY_HOOK} (existing web/dev/trains.ts is not in the normal dist).`);
      for (const [name, c] of Object.entries(trainCameras(trains, data)))
        await attempt('03', name, () => shot('03', name, c, { fixture: name === 'great-northern-387' ? staged : 'offline labelled sample' }));
      if (staged?.startsWith('staged sample')) { await restoreSample(); trains = await trainRows(); }
      for (const kind of ['gc180x5', 'tl700x8']) {
        const fixture = await stageSample(kind);
        if (!fixture) { gap('03', `${kind} unavailable in built samples; evidenceBuildTrain could not stage a labelled sample.`); continue; }
        trains = await trainRows();
        const cameras = trainCameras(trains, data);
        for (const name of [`${kind}-nose-three-quarter`, `${kind}-whole-side`]) {
          const c = cameras[name];
          if (!c) { gap('03', `${kind} sample did not produce ${name}.`); continue; }
          await attempt('03', name, () => shot('03', name, c, { fixture: fixture === 'existing sample' ? 'offline labelled sample' : fixture }));
        }
        if (fixture.startsWith('staged sample')) { await restoreSample(); trains = await trainRows(); }
      }

      // Match the Pages hostname gate, not just a missing upstream on localhost.
      await navigate('', 'Pages-like public host, no relay', 'desktop', publicBase);
      await until("window.__kx.feed.connection==='relay absent'");
      await shot('07', 'pages-no-relay', cameras.overview, { expected: 'offline samples; no relay fetch on a public hostname' });
      setProxy(false);
      // Reload after closing the proxy: one quiet probe is the page's normal auto-mode behavior.
      await navigate('', 'localhost no relay'); await until("window.__kx.feed.connection==='relay absent'");
      await shot('07', 'localhost-no-relay', cameras.overview);
      await navigate('?trains=live', 'simulated stopped relay');
      await until("/reconnecting/.test(window.__kx.feed.connection)");
      await shot('07', 'relay-stopped', cameras.overview, { fault: 'evidence proxy returns 503; upstream relay process is untouched' });
      setProxy(true);

      if (options.relay) {
        const observedDecodedIds = new Set();
        const signalFrame = () => evaluate(`(() => {
          const k=window.__kx;
          const camera=${signalStateCamera.toString()};
          return {timeMs:k.feed.timeMs,ended:k.feed.connection==='recording ended',signals:(k.signals?.signals()??[]).map(r=>{
            const p=r.group.position;
            return {id:r.signal.id,berth:r.group.userData.berth??r.signal.berth,state:r.state,inferred:r.inferredPosition,
              ...camera([p.x,p.y,p.z],r.signal,r.label)};
          })};
        })()`);
        await attempt('04', 'replay and board', async () => {
          await navigate(`?trains=replay&date=${options.date}&speed=${options.speed}`, 'recording replay');
          await until("['playing','recording ended'].includes(window.__kx.feed.connection)", 60000);
          // Inferred positions get context evidence, never a state wait or a decoded-state claim.
          const inferred = (await signalFrame()).signals.find(s=>s.inferred);
          if (inferred) await attempt('06', 'inferred position context', () => shot('06', 'inferred-position-context', inferred, { purpose: 'position provenance only; not a state target' }));
          // A sequence records the real motion core through the real page feed; no odometer shortcut.
          await attempt('05', 'moving sequence', async () => {
            await until('window.__kx.motionState.some(t=>t.speed>0)', 30000);
            for (let i = 0; i < 4; i++) { const start = await evaluate('window.__kx.feed.timeMs'); if(i) await until(`window.__kx.feed.timeMs>=${start+2000}`, 10000); await shot('05', `motion-${String(i).padStart(2,'0')}`, cameras['north-gable']); }
          });
          await attempt('06', 'decoded OSM state search', async () => {
            const window = signalReplayWindow(options.iso, options.signalAt), initial = await signalFrame();
            report.signalSearch = await searchSignalStates({ ...window, sample: signalFrame,
              timeoutMs: Math.min(900000, Math.max(0, window.endMs-initial.timeMs)/options.speed+15000),
              capture: async (target, state) => {
                try {
                  await shot('06', `${state}-decoded-osm-replay`, target, { observedState: state, signalId: target.id, berth: target.berth });
                  return true;
                } catch (e) { if (/signal changed/.test(e.message)) return false; throw e; }
              },
            });
            for (const id of report.signalSearch.decodedIds) observedDecodedIds.add(id);
            for (const state of report.signalSearch.missing) gap('06', `No decoded, non-inferred ${state} head captured in replay window ${new Date(window.startMs).toISOString()}–${new Date(window.endMs).toISOString()} (${report.signalSearch.reason}).`);
          });
          await boardShots();
          if (await evaluate("!!document.querySelector('[data-signal-legend],.kx-signal-legend')")) await shot('06', 'overlay-legend', cameras.overview);
          else axis('06').notes = ['The page has no signal overlay legend; labels/provenance are in shot metadata.'];
        });
        await attempt('07', 'live drop and recovery', async () => {
          await navigate('?trains=live', 'live connected'); await until("window.__kx.feed.connection==='connected'", 60000);
          await shot('07', 'relay-connected', cameras.overview);
          for (const s of (await signalFrame()).signals) if (s.id > 0 && !s.inferred && ['danger','proceed'].includes(s.state)) observedDecodedIds.add(s.id);
          setProxy(false); currentScenario='live relay drop'; await until("/reconnecting/.test(window.__kx.feed.connection)", 20000);
          await shot('07', 'relay-dropped', cameras.overview, { fault: 'all proxy upstream sockets closed; real relay stays running' });
          const unknown = signalStateTarget((await signalFrame()).signals, 'unknown', observedDecodedIds);
          if (unknown) await shot('06', 'unknown-decoded-osm-disconnected', unknown, { observedState: 'unknown', signalId: unknown.id, cause: 'live disconnect clears stale byte picture on a previously decoded OSM head; no aspect was injected' });
          else gap('06', 'No previously decoded, non-inferred unknown head remained after the live disconnect.');
          setProxy(true); currentScenario='live relay recovered'; await until("window.__kx.feed.connection==='connected'", 30000); await shot('07', 'relay-recovered', cameras.overview);
        });
      } else for (const id of ['04', '05', '06']) gap(id, 'Pass --relay to collect replay/board, motion and decoded signal evidence.');

      if (!axis('04').screenshots.some(file=>file.includes('board-desktop'))) {
        await navigate('?trains=demo', 'sample board, no timetable'); await boardShots('sample-board');
      }
      await navigate('?trains=demo&board=0', 'performance'); await setCamera(cameras.overview);
      report.performance = await evaluate(`new Promise(resolve => {
        const k = window.__kx, t = k.controls.target, c = k.camera;
        const radius = Math.hypot(c.position.x-t.x,c.position.z-t.z), y = c.position.y;
        const angle = Math.atan2(c.position.z-t.z,c.position.x-t.x), durations = [];
        let last, start;
        const tick = now => {
          start ??= now;
          if (last !== undefined) durations.push(now-last);
          last = now;
          const a = angle + (now-start)/2000;
          c.position.set(t.x+radius*Math.cos(a),y,t.z+radius*Math.sin(a));
          if (now-start < 5000) requestAnimationFrame(tick);
          else {
            const sorted = [...durations].sort((a,b)=>a-b), q = p=>sorted[Math.floor((sorted.length-1)*p)];
            resolve({frames:durations.length,seconds:(now-start)/1000,fps:durations.length/((now-start)/1000),
              frameMs:{p50:q(.5),p95:q(.95),p99:q(.99),max:sorted.at(-1)},
              over20ms:durations.filter(x=>x>20).length,firstFrameMs:k.firstFrameMs});
          }
        };
        requestAnimationFrame(tick);
      })`);
      await shot('08', 'performance-overview', null);
    }
  } catch (error) { report.fatal = error.message; report.gaps.push(`Capture stopped: ${error.message}`); }
  finally { await cleanup(); }

  // Supporting evidence is generated without reading any login or account name.
  await mkdir(path.join(options.out, 'checks'), { recursive: true });
  const run = async (id, name, command, args, timeout = 300000) => { const r = await commandResult(command, args, packageRoot, path.join(options.out, 'checks', `${name}.log`), timeout); r.file=`checks/${name}.log`; report.commands.push(r); axis(id).artifacts.push(`checks/${name}.log`); if(r.code!==0) gap(id, `${name}: ${r.timedOut?'timed out':`exit ${r.code}`}`); return r; };
  if (selected) gap('02', `Partial pack: --views ${options.views} captured only ${[...selected].length} fixed station views; trains, relay scenarios, supporting commands and performance were not run.`);
  else {
    await run('09', 'evidence-tests', 'node', ['--test', '--test-timeout=10000', 'tools/tests/evidence.test.mjs', 'tools/tests/board-vs-trust.test.ts', 'tools/tests/live-vs-replay.test.ts', 'tools/tests/axis04-summary.test.ts'], 60000);
    await run('09', 'tests', 'npm', ['test']); await run('09', 'typecheck', 'npx', ['tsc', '--noEmit', '-p', '.'], 120000);
    await run('07', 'relay-mutations', 'python3', ['-I', '-u', 'tools/mutation/relay.py', 'relay', path.join(options.out, 'relay-mutations')]);
    try { await stat(options.rawOsm); await run('01', 'osm-fidelity', 'node', ['tools/fidelity.ts', '--raw', options.rawOsm, '--json']); }
    catch { gap('01', 'No raw OSM extract: pass --raw-osm to generate the independent fidelity deltas and unresolved-issue list.'); }
    await runAxis04Reports(options, report, { fetchImpl: fetch, run, gap });
    gap('07', 'Credential/account-name sweep is intentionally not automated: the scorer runs their local secret scan without giving this tool an account name or login.');
    gap('09', 'Scorer must separately rerun the repository responsive/catalog checks and inspect mutation evidence for other changed components.');
  }
  if (!options.gpu || !report.validGpu) gap('08', 'Only a measured real Metal renderer qualifies; software or unknown graphics do not.');
  report.hud.shots = { hidden: report.screenshots.filter(s => s.hud?.mode === 'off').length, shown: report.screenshots.filter(s => s.hud?.mode === 'on').length };
  report.hud.otherOverlays = [...new Set(report.screenshots.flatMap(s => s.hud?.otherOverlays ?? []))];
  report.flicker = flickerSummary(report.screenshots);
  for (const f of report.flicker.failed) gap(f.axis, `${f.camera}: flicker, ${f.differingPixels} px differ between two frames of a still scene (${(f.fraction * 100).toFixed(3)}% > ${report.flicker.limit * 100}%), in ${f.bbox?.join(',')}`);  await writePrivateFile(path.join(options.out, 'checks/camera-clearance.json'), `${JSON.stringify(report.cameraClearance,null,2)}\n`);
  axis('02').artifacts.push('checks/camera-clearance.json'); axis('03').artifacts.push('checks/camera-clearance.json');
  report.scenarios = [...new Set(report.screenshots.map(s=>s.scenario))].map(name=>({name,files:report.screenshots.filter(s=>s.scenario===name).map(s=>s.file),consoleErrors:report.consoleErrors.filter(e=>e.scenario===name).length,relayRequests:(report.relayRequests??[]).filter(r=>r.scenario===name).length}));
  report.complete = !report.fatal && report.validGpu && !report.gaps.length;
  for (const [id, name, value] of [['01','geometry.json',report.geometry],['03','train-dimensions.json',report.trainDimensions],['08','performance.json',{machine:report.machine,renderer:report.renderer,validGpu:report.validGpu,measurements:report.performance,build:report.build}]]) {
    await writePrivateFile(path.join(options.out,name),`${JSON.stringify(value,null,2)}\n`); axis(id).artifacts.push(name);
  }
  for (const a of report.axes) await writePrivateFile(path.join(options.out, `axis-${a.id}.json`), `${JSON.stringify({ ...a, captures: report.screenshots.filter(s=>s.axis===a.id) }, null, 2)}\n`);
  await writePrivateFile(path.join(options.out, 'cameras.json'), `${JSON.stringify({ station: cameras, captures: Object.fromEntries(report.screenshots.map(s=>[s.file,{...s.camera,source:s.source,url:s.url,simTimeMs:s.simTimeMs}])) }, null, 2)}\n`);
  await writePrivateFile(path.join(options.out, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  // Keep the old evidence.json entry point for existing scorer scripts.
  await writePrivateFile(path.join(options.out, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writePrivateFile(path.join(options.out, 'index.md'), `# King's Cross evidence pack\n\nMeasured ${report.when}. Renderer: ${report.renderer ?? 'not captured'}.\n\nEach axis-NN.json links its PNGs and command logs. [Axis 04 summary](axis-04.md) links the replay, board agreement and optional live comparison. manifest.json contains every camera, URL, simulation clock, GPU string, draw calls, triangles, errors and explicit gaps.\n\n${report.views.partial ? `Partial pack: only ${report.views.names.length} fixed station views (--views ${report.views.requested}).\n\n` : ''}Flicker: ${report.flicker.checked} fixed views shot twice, ${report.flicker.failed.length} over the ${report.flicker.limit * 100}% limit (worst ${(report.flicker.worstFraction * 100).toFixed(4)}%). Scene pin: ${report.lighting.pin.parameters} (applied by the page: ${report.lighting.pinHonoured ?? 'no pinned page was shot'}). Lighting: ${LIGHTING_NOTE}\n\nOverlays (--hud ${report.hud.mode}): ${report.hud.shots.hidden} shots with the page's overlays hidden, ${report.hud.shots.shown} with them shown. ${report.hud.note}\n\n${scoringViewsNote(report.screenshots)}${report.axes.map(a=>`- ${a.id}. ${a.name}: ${a.screenshots.length} shots, ${a.artifacts.length} artifacts; ${a.gaps.length} gaps.`).join('\n')}\n\n## Remaining checks\n\n${report.gaps.map(g=>`- ${g}`).join('\n')}\n`);
  console.log(JSON.stringify({ out: options.out, renderer: report.renderer, screenshots: report.screenshots.length, bundleGzipBytes: report.build.totalGzipBytes, gaps: report.gaps, fatal: report.fatal ?? null,
    flicker: { checked: report.flicker.checked, failed: report.flicker.failed.length, worstFraction: report.flicker.worstFraction },
    lighting: { pin: report.lighting.pin.parameters, pinHonoured: report.lighting.pinHonoured, fingerprints: Object.keys(report.lighting.fingerprints) },
    hud: { mode: report.hud.mode, hiddenShots: report.hud.shots.hidden, shownShots: report.hud.shots.shown, otherOverlays: report.hud.otherOverlays } }, null, 2));
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  if (report.fatal || !report.flicker.pass) process.exitCode = 1;
  return report;
}

function londonDate(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function validLiveReport(report) {
  return report && typeof report === 'object' && report.interval && Number.isFinite(report.interval.startMs) &&
    Number.isFinite(report.interval.endMs) && report.interval.startMs <= report.interval.endMs;
}
async function jsonReport(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}
async function fileStamp(file) {
  try {
    const info = await stat(file, { bigint: true });
    return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
  } catch { return null; }
}
async function changedSince(file, previous) {
  const current = await fileStamp(file);
  return current !== null && current !== previous;
}
async function hostHeaderStatus(relay) {
  return new Promise(resolve => {
    const request = (relay.protocol === 'https:' ? httpsRequest : httpRequest)(new URL('/health', relay), {
      headers: { host: 'outside.invalid' }, timeout: 5000,
    }, response => { response.resume(); resolve(response.statusCode); });
    request.once('timeout', () => request.destroy()); request.once('error', () => resolve(null)); request.end();
  });
}

/** Supporting report orchestration; fetch/run are injected so this stays testable without a browser or relay. */
export async function runAxis04Reports(options, report, { fetchImpl = fetch, run, gap, checkHost = hostHeaderStatus } = {}) {
  if (typeof run !== 'function' || typeof gap !== 'function') throw new TypeError('runAxis04Reports requires run and gap callbacks');
  const axis04 = report.axes.find(a => a.id === '04');
  const packPath = file => path.relative(options.out, file).split(path.sep).join('/');
  const addArtifact = file => { const relative = packPath(file); if (!axis04.artifacts.includes(relative)) axis04.artifacts.push(relative); };
  const inputs = path.join(options.out, 'inputs'); await safeOutputDirectory(repoRoot, inputs);
  const boardOut = path.join(options.out, 'board-vs-trust');
  const liveOut = path.join(options.out, 'live-vs-replay');
  const liveReportPath = path.join(liveOut, 'live-vs-replay.json');
  const summaryOut = path.join(options.out, 'axis-04-summary');
  let liveReport = null, liveReportRecomputable = false, boardReport = null, boardDateMatches = true;
  const anchorsFile = path.join(inputs, 'anchors.json'), recordingFile = path.join(inputs, 'recording.ndjson');
  const scheduleFile = path.join(inputs, `schedule-${options.iso}.json`);

  if (options.liveWindow !== null && options.liveWindow !== undefined) {
    await safeOutputDirectory(repoRoot, liveOut);
    const timeout = (options.liveWindow + 610 + 45) * 1000;
    const previous = await fileStamp(liveReportPath);
    const result = await run('04', 'live-vs-replay', 'node', ['tools/live-vs-replay.ts', '--out', liveOut, '--seconds', String(options.liveWindow),
      '--start', 'checkpoint', '--checkpoint-wait', '610', '--relay', options.relay.origin], timeout);
    const fresh = (result?.code === 0 || result?.code === 1) && !result?.timedOut && await changedSince(liveReportPath, previous);
    liveReport = fresh ? await jsonReport(liveReportPath) : null;
    if (!validLiveReport(liveReport)) gap('04', `Live/replay capture did not produce a fresh valid ${packPath(liveReportPath)} interval report.`);
    else addArtifact(liveReportPath);
  } else if (options.liveReport) {
    try {
      const bytes = await readFile(options.liveReport);
      const parsed = JSON.parse(bytes.toString('utf8'));
      if (!validLiveReport(parsed)) throw new Error('report needs a valid interval.startMs and interval.endMs');
      await safeOutputDirectory(repoRoot, liveOut);
      const sourceDir = path.dirname(path.resolve(options.liveReport));
      const hasSavedSamples = await Promise.all(['live-samples.json', 'replay-samples.json'].map(file => stat(path.join(sourceDir, file)).then(() => true, () => false))).then(values => values.every(Boolean));
      if (hasSavedSamples) {
        const previous = await fileStamp(liveReportPath);
        const result = await run('04', 'live-vs-replay-summary', 'node', ['tools/live-vs-replay.ts', '--summarize', sourceDir, '--out', liveOut], 60000);
        const fresh = (result?.code === 0 || result?.code === 1) && !result?.timedOut && await changedSince(liveReportPath, previous);
        liveReport = fresh ? await jsonReport(liveReportPath) : null;
        liveReportRecomputable = validLiveReport(liveReport);
        if (!liveReportRecomputable) {
          gap('04', 'Saved live report samples could not be recomputed into a fresh report; retaining the original report as non-recomputable evidence.');
          await writePrivateFile(liveReportPath, bytes); liveReport = parsed;
        }
      } else {
        gap('04', 'Saved live report has no live-samples.json and replay-samples.json; retaining the original report as non-recomputable evidence.');
        await writePrivateFile(liveReportPath, bytes); liveReport = parsed;
      }
      addArtifact(liveReportPath);
    } catch (error) { gap('04', `Live report unavailable: ${error.message}`); }
  }
  if (options.liveWindow !== null && options.liveWindow !== undefined && liveReport && validLiveReport(liveReport)) {
    const startDate = londonDate(liveReport.interval.startMs), endDate = londonDate(liveReport.interval.endMs);
    boardDateMatches = startDate === options.iso && endDate === options.iso;
    if (!boardDateMatches) gap('04', `Live/replay interval ${startDate} to ${endDate} does not match recording date ${options.iso}; interval-scoped board agreement is unavailable.`);
  }

  let scheduleReady = false, anchorsReady = false, recordingReady = false;
  if (!options.relay) {
    gap('04', `No relay was provided; no /schedule?date=${options.iso} timetable is available for board agreement.`);
  } else {
    try {
      const response = await fetchImpl(new URL(`/schedule?date=${options.iso}`, options.relay), { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`/schedule HTTP ${response.status}`);
      const text = await response.text(), schedule = JSON.parse(text);
      if (schedule.date !== options.iso || !Array.isArray(schedule.calls)) throw new Error(`schedule response does not contain date ${options.iso} and calls[]`);
      await writePrivateFile(scheduleFile, `${JSON.stringify(schedule, null, 2)}\n`);
      scheduleReady = true; addArtifact(scheduleFile);
    } catch (error) { gap('04', `No timetable for recording date ${options.iso}; board-vs-TRUST agreement is unavailable: ${error.message}`); }
  }

  if (options.relay) {
    for (const [endpoint, name] of [['/anchors', 'anchors.json'], [`/recording?date=${options.date}`, 'recording.ndjson']]) {
      try {
        const response = await fetchImpl(new URL(endpoint, options.relay), { signal: AbortSignal.timeout(35000) });
        if (!response.ok) throw new Error(`${endpoint.split('?')[0]} HTTP ${response.status}`);
        await writePrivateFile(path.join(inputs, name), new Uint8Array(await response.arrayBuffer()));
        if (name === 'anchors.json') anchorsReady = true; else recordingReady = true;
      } catch (error) { gap('04', `Supporting recording reports: ${error.message}`); }
    }
    try {
      const response = await fetchImpl(new URL('/sclass', options.relay), { signal: AbortSignal.timeout(35000) });
      if (!response.ok) throw new Error(`/sclass HTTP ${response.status}`);
      await writePrivateFile(path.join(inputs, 'sclass.json'), new Uint8Array(await response.arrayBuffer()));
      report.axes.find(a => a.id === '06').artifacts.push('inputs/sclass.json');
    } catch (error) { gap('06', error.message); }

    if (anchorsReady && recordingReady) {
      await run('04', 'replay-report', 'node', ['tools/replay-report.ts', '--anchors', anchorsFile, '--recording', recordingFile, '--out', path.join(options.out, 'replay-report')]);
      await run('05', 'motion-report', 'node', ['tools/motion-check.ts', '--anchors', anchorsFile, '--recording', recordingFile, '--out', path.join(options.out, 'motion-report')]);
      addArtifact(path.join(options.out, 'replay-report')); report.axes.find(a => a.id === '05').artifacts.push('motion-report/');
    }
    const refusal = await checkHost(options.relay);
    report.hostHeaderRefusal = { host: 'outside.invalid', status: refusal, passed: refusal === 403 };
    await writePrivateFile(path.join(options.out, 'checks/host-header.json'), JSON.stringify(report.hostHeaderRefusal, null, 2) + '\n');
    report.axes.find(a => a.id === '07').artifacts.push('checks/host-header.json');
    if (refusal !== 403) gap('07', 'Host-header refusal did not return 403');
  }

  if (options.relay && scheduleReady && anchorsReady && recordingReady && boardDateMatches) {
    const args = ['tools/board-vs-trust.ts', '--recording', recordingFile, '--schedule', scheduleFile, '--anchors', anchorsFile,
      '--out', boardOut, '--hourly'];
    if (options.liveWindow !== null && options.liveWindow !== undefined && liveReport && validLiveReport(liveReport)) args.push('--from', new Date(liveReport.interval.startMs).toISOString(), '--to', new Date(liveReport.interval.endMs).toISOString());
    await safeOutputDirectory(repoRoot, boardOut);
    const boardReportPath = path.join(boardOut, 'board-vs-trust.json');
    const previous = await fileStamp(boardReportPath);
    const result = await run('04', 'board-vs-trust', 'node', args, 300000);
    const fresh = result?.code === 0 && !result?.timedOut && await changedSince(boardReportPath, previous);
    boardReport = fresh ? await jsonReport(boardReportPath) : null;
    if (!boardReport) gap('04', 'Board-vs-TRUST command did not produce a readable board-vs-trust.json report.');
    else addArtifact(path.join(boardOut, 'board-vs-trust.json'));
    if (boardReport && await stat(path.join(boardOut, 'board-vs-trust.md')).then(() => true, () => false)) addArtifact(path.join(boardOut, 'board-vs-trust.md'));
    addArtifact(boardOut);
  }

  const boardReportFile = boardReport ? path.join(boardOut, 'board-vs-trust.json') : null;
  const summaryArgs = ['tools/axis04-summary.ts', '--out', summaryOut];
  if (boardReportFile) summaryArgs.push('--board-report', boardReportFile);
  if (liveReport && validLiveReport(liveReport)) summaryArgs.push('--live-report', liveReportPath);
  if (options.relay) summaryArgs.push('--relay', options.relay.origin);
  await safeOutputDirectory(repoRoot, summaryOut);
  const summaryMarkdownPath = path.join(summaryOut, 'axis-04-summary.md'), summaryJsonPath = path.join(summaryOut, 'axis-04-summary.json');
  const previousSummary = await fileStamp(summaryMarkdownPath);
  const summaryResult = await run('04', 'axis-04-summary', 'node', summaryArgs, 60000);
  const summaryFresh = summaryResult?.code === 0 && !summaryResult?.timedOut && await changedSince(summaryMarkdownPath, previousSummary);
  if (summaryFresh) addArtifact(summaryOut);

  const summary = boardReport?.summary;
  const rows = (boardReport?.results ?? []).filter(row => row.reasons?.length || row.agreed === false || row.fullyObserved === false);
  axis04.boardVsTrust = boardReport ? {
    summary: boardReport.summary ?? null, hourly: boardReport.hourly ?? [], scheduleMatch: boardReport.scheduleMatch ?? null,
    results: boardReport.results ?? [], disagreements: rows,
    disagreementTable: rows.map(row => ({ actualMs: row.actualMs, headcode: row.headcode, eventType: row.eventType,
      platform: row.platform, bookedPlatform: row.bookedPlatform, section: row.observation?.section ?? null,
      platforms: row.observation?.platforms ?? [], lagSeconds: row.observation?.lagSeconds ?? null, reasons: row.reasons ?? [] })),
    reproduce: boardReport.reproduce ?? null,
    json: packPath(path.join(boardOut, 'board-vs-trust.json')),
    markdown: packPath(path.join(boardOut, 'board-vs-trust.md')),
  } : { summary: null, hourly: [], scheduleMatch: null, results: [], disagreements: [], disagreementTable: [], reproduce: null, json: null, markdown: null };
  axis04.liveVsReplay = liveReport && validLiveReport(liveReport) ? {
    interval: liveReport.interval, passed: liveReport.passed ?? null, samples: liveReport.samples ?? null,
    positionDifferenceM: liveReport.positionDifferenceM ?? null, recomputable: liveReportRecomputable,
    reproduce: liveReport.reproduce ?? null, captureCommand: liveReport.captureCommand ?? null, json: packPath(liveReportPath),
  } : { interval: null, passed: null, recomputable: false, reproduce: null, captureCommand: null, json: null };
  axis04.summary = summaryFresh && await fileStamp(summaryJsonPath) !== null
    ? { markdown: packPath(summaryMarkdownPath), json: packPath(summaryJsonPath) }
    : { markdown: null, json: null };
  const format = value => value === null || value === undefined ? 'unavailable' : String(value);
  const disagreements = rows.length ? rows.map(row => `| ${new Date(row.actualMs).toISOString()} | ${String(row.headcode ?? '').replaceAll('|', '')} | ${String(row.eventType ?? '').replaceAll('|', '')} | ${row.platform ?? '?'} / ${row.bookedPlatform ?? '?'} | ${row.observation ? `${row.observation.section} / ${(row.observation.platforms ?? []).join(', ')}` : 'absent'} | ${row.observation?.lagSeconds ?? '—'} | ${(row.reasons ?? []).join('; ').replaceAll('|', '')} |`).join('\n') : '| — | — | — | — | — | — | No disagreement rows available. |';
  const hourly = (boardReport?.hourly ?? []).map(hour => `| ${hour.fromISO} | ${hour.toISO} | ${hour.summary?.movements ?? 0} | ${hour.summary?.agreementPercent ?? '—'} | ${hour.summary?.medianLagSeconds ?? '—'} | ${hour.scheduleMatch?.matchedHeadcodes ?? 0}/${hour.scheduleMatch?.observedHeadcodes ?? 0} |`).join('\n');
  const liveLink = liveReport ? `${liveReportRecomputable ? '[JSON]' : '[JSON (non-recomputable)]'}(live-vs-replay/live-vs-replay.json)` : 'unavailable';
  const summaryLink = summaryFresh ? '[Axis 04 generated summary](axis-04-summary/axis-04-summary.md)' : 'Axis 04 generated summary unavailable';
  const axisMarkdown = `# Axis 04 — Live-data correctness\n\n## Board versus TRUST\n\n- Agreement: ${format(summary?.boardAgreement)} / ${format(summary?.fullyObserved)} fully observed movements (${format(summary?.agreementPercent)}%).\n- Median signed lag: ${format(summary?.medianLagSeconds)} s; median absolute lag: ${format(summary?.medianAbsoluteLagSeconds)} s.\n- Schedule headcodes: ${format(boardReport?.scheduleMatch?.matchedHeadcodes)} / ${format(boardReport?.scheduleMatch?.observedHeadcodes)} (${format(boardReport?.scheduleMatch?.percent)}%).\n- ${summaryLink}; [full Axis 04 JSON](axis-04.json).\n- Board report: ${boardReport ? '[JSON](board-vs-trust/board-vs-trust.json), [table](board-vs-trust/board-vs-trust.md)' : 'unavailable'}; live report: ${liveLink}; supporting reports: [replay](replay-report/replay-report.md), [motion](motion-report/motion-report.md).\n\n## Hourly agreement (UTC)\n\n| From | To | Movements | Agreement % | Median lag s | Schedule headcodes matched |\n| --- | --- | ---: | ---: | ---: | ---: |\n${hourly || '| — | — | — | — | — | — | No hourly report available. |'}\n\n## Disagreements\n\n| Actual (UTC) | Headcode | Movement | TRUST / booked | Board section / platforms | Lag s | Reason |\n| --- | --- | --- | --- | --- | ---: | --- |\n${disagreements}\n`;
  await writePrivateFile(path.join(options.out, 'axis-04.md'), axisMarkdown);
  addArtifact(path.join(options.out, 'axis-04.md'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`evidence: ${error.message}`); process.exitCode = 1; });
}
