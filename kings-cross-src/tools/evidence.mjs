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
import { CLOCK_TOWER_HEIGHT, GAUGE, RAIL_HEAD_WIDTH, SHED_SPAN_WIDTH, buildingsUnderStation, concourseCanopy, platformReport, pointInPolygon, shedLayout, shedToWorld, stationBuilding, stationPlatforms, worldToShed } from '../core/station.ts';
import { barlowPlan, greatNorthernHotelPlan, landmarkPlans, landmarkSeats, midlandGrandPlan, REPLACED_BUILDING_IDS, tunnelMouths } from '../core/landmarks.ts';
import { planBuilding } from '../core/city.ts';
import { gasholderPlan, granaryComplex } from '../core/kxcentral.ts';
import { createTerrain } from '../core/terrain.ts';
import { ALL_KINDS, FIGURES, EMU_FIGURES, trainLayout } from '../core/train.ts';
import { TOWER_SIZE, WESTERN_RANGE } from '../web/src/shed.ts';
import { concourseGrid, keepTriangles } from '../web/src/concourse.ts';
import { furniturePlan } from '../web/src/furniture.ts';
import { FLICKER_GAP_MS, compareFrames, flickerSummary } from './flicker.mjs';
import { PIN_TIME, PIN_WEATHER, WEATHER_NAMES, pinHonoured, pinParameters, scenePinFrom, withPin } from './scene-pin.mjs';
import { stationData } from './station-scene.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const packageRoot = path.resolve(here, '..');
export const VIEWPORTS = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };
export const TRAIN_FACTORY_HOOK = 'Object.assign(kx, { evidenceBuildTrain: buildTrain });';
export const AXES = [
  ['01', 'Geometric fidelity', 'Platform lengths, gauge, top/side 10 m grids; raw-OSM fidelity comparison remains a separate command.'],
  ['02', 'Station look', 'Fixed world cameras derived from the station frame and OSM landmark plans.'],
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
  'western-concourse': ['concourse', 'concourse-roof-detail', 'western-range', 'western-range-gateline', 'concourse-hotel-junction', 'concourse-exterior-square', 'concourse-funnel-up', 'western-range-full'],
  'historic-neighbours': ['great-northern-hotel', 'midland-grand-front', 'st-pancras-shed', 'st-pancras-shed-oblique', 'gnh-from-square', 'midland-euston-road', 'midland-clock-tower', 'barlow-interior'],
  'city-surroundings': ['overview', 'gasworks-portals', 'front-oblique', 'granary-square', 'gasholders', 'canal-lock', 'kings-boulevard', 'euston-road-east'],
};

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
  const names = new Set(['--dist', '--out', '--relay', '--chrome', '--date', '--speed', '--signal-at', '--raw-osm', '--live-window', '--live-report', '--views', '--time', '--weather', '--sky']);
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
  const pin = scenePinFrom({ time: values.get('--time'), weather: values.get('--weather'), sky: values.get('--sky') });
  return { dist: path.resolve(values.get('--dist') ?? path.join(repoRoot, '.scratch/kx-dist')), out, views, pin,
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
 * still scene, so each also takes the two-frame flicker check (`twoFrame`).
 */
export async function runStationEvidenceShots(cameras, shot, attempt, select = null) {
  const pairs = roofMaterialEvidencePairs(cameras);
  const contextEvidence = new Map(pairs.map(pair => [pair.cameraName, pair.context.roofMaterialEvidence]));
  const wanted = name => !select || select.has(name);
  for (const [name, camera] of Object.entries(cameras).filter(([name, camera]) => !camera.grid && wanted(name)))
    await attempt('02', name, () => shot('02', name, camera, { twoFrame: true, ...(contextEvidence.has(name) ? { roofMaterialEvidence: contextEvidence.get(name) } : {}) }));
  for (const pair of pairs.filter(pair => wanted(`${pair.cameraName}-solid-slate`)))
    await attempt('02', `${pair.cameraName}-solid-slate`, () => shot('02', `${pair.cameraName}-solid-slate`, pair.solid.camera, { twoFrame: true, roofMaterialEvidence: pair.solid.roofMaterialEvidence }));
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
/** The committed terrain and city extract the ground-level cameras stand on, read once. */
export function stationWorld() {
  if (!worldCache) { const { city, terrain } = stationData(); worldCache = { city, terrain: createTerrain(terrain) }; }
  return worldCache;
}

// x east, y up, z south. Landmark targets come from their actual public OSM outlines.
export function stationCameras(data, world = stationWorld()) {
  const s = shedLayout(data), concourse = concourseCanopy(data);
  const at = (u, v, y) => { const [x, z] = shedToWorld(s, u, v); return [x, y, z]; };
  const camera = (pos, target, source, extra = {}) => ({ pos, target, source, ...extra });
  const cams = {
    overview: camera([260, 220, 90], at(s.width / 2, 120, 5), 'shedLayout'),
    top: camera(at(s.width / 2, 120, 3000), at(s.width / 2, 120.1, 0), 'shedLayout, 10 m grid', { grid: true, fov: 12, near: 100 }),
    side: camera(at(s.width + 1450, 120, 65), at(s.width / 2, 120, 65), 'shedLayout, 10 m grid', { grid: true, fov: 7, near: 100 }),
    'south-front': camera(at(s.width / 2, -70, 26), at(s.width / 2, 0, 12), 'shedLayout south facade, clear of Belgrove House'),
    'front-oblique': camera(at(s.width + 70, -85, 32), at(s.width / 2, 20, 12), 'shedLayout south-east corner'),
    'shed-interior': camera(at(s.width / 4, s.length - 7, 3.2), at(s.width / 4, s.length - 90, 9), 'shedLayout, platform north end'),
    'platform-eye': camera(at(s.width / 2, 100, PLATFORM_HEIGHT + 1.6), at(s.width / 2, 140, PLATFORM_HEIGHT + 1.6), 'shedLayout platform axis; eye 1.6 m above platform'),
    concourse: camera([concourse.centre[0] - concourse.radius * .6, PLATFORM_HEIGHT + 1.6, concourse.centre[1]], [concourse.centre[0], 12, concourse.centre[1]], 'concourseCanopy fitted OSM arc'),
    'western-range': camera(at(-WESTERN_RANGE.depth - 6, (WESTERN_RANGE.v0 + WESTERN_RANGE.v1) / 2, 1.6),
      at(-WESTERN_RANGE.depth - 0.1, (WESTERN_RANGE.v0 + WESTERN_RANGE.v1) / 2, 3.5),
      `WESTERN_RANGE west brick facade v${WESTERN_RANGE.v0}..${WESTERN_RANGE.v1}; eye-level west-side view`, { fov: 35, near: .1 }),
    'western-range-gateline': camera(at(-55, 38, 3), at(-WESTERN_RANGE.depth - .01, 38, 5.5),
      'Arup 2012/2 p27 fig4 southern public frontage; ASSUMED model alignment, upper floors and scene retained', { fov: 60, near: .1 }),
    'roof-above': camera(at(s.width / 2 + 45, 110, s.crown + 110), at(s.width / 2, 110, s.crown - 3), 'shedLayout roof'),
    'north-gable': camera(at(s.width / 2, s.length + 80, 18), at(s.width / 2, s.length, 12), 'shedLayout north gable'),
  };
  // Roof-family comparison: the same public-model triangle in before/after builds,
  // viewed from below at about six metres. No shell, cladding or city is hidden.
  const station = stationBuilding(data);
  let funnel = null; // world [x, z] of the concourse funnel's axis
  if (station) {
    const { centre, grid } = concourseGrid(concourse, station.pts, s, data.buildings.filter(b => b.id === 46821177).map(b => b.pts));
    funnel = centre;
    const targets = keepTriangles(grid, station.pts, s).map(tri => tri.reduce((p, i) => {
      const n = grid.nodes[i]; return [p[0] + n.x / 3, p[1] + n.height / 3, p[2] + n.z / 3];
    }, [0, 0, 0]));
    targets.sort((p, q) => Math.hypot(p[0] - centre[0] + 18, p[2] - centre[1]) - Math.hypot(q[0] - centre[0] + 18, q[2] - centre[1]));
    const t = targets[0];
    if (t) cams['concourse-roof-detail'] = camera([t[0] - 1.5, t[1] - 6, t[2] + 1], t,
      'drawn concourse roof triangle, view from below; approximate procedural member families', { fov: 50, near: .1 });
  }
  const p = stationPlatforms(data).get('4');
  if (p) { const mid = p.pts.reduce((a, b) => [a[0] + b[0] / p.pts.length, a[1] + b[1] / p.pts.length], [0, 0]);
    cams['platform-eye'] = camera([mid[0], PLATFORM_HEIGHT + 1.6, mid[1]], [mid[0] + Math.sin(s.heading) * 40, PLATFORM_HEIGHT + 1.6, mid[1] - Math.cos(s.heading) * 40], 'OSM platform 4 polygon, eye 1.6 m above platform');
    cams['platform-eye-south'] = camera([mid[0], PLATFORM_HEIGHT + 1.6, mid[1]], [mid[0] - Math.sin(s.heading) * 40, PLATFORM_HEIGHT + 1.6, mid[1] + Math.cos(s.heading) * 40], 'OSM platform 4 polygon, south-facing eye 1.6 m above platform');
    const tip = [...p.pts].sort((a,b)=>a[1]-b[1]).slice(0,2).reduce((a,b)=>[a[0]+b[0]/2,a[1]+b[1]/2],[0,0]);
    cams['shed-interior'] = camera([tip[0],3.2,tip[1]], at(s.width / 2,100,8), 'OSM platform 4 north end looking into the shed'); }
  // Pancras Road exterior: the concave east front sits beside the concourse. Its old
  // normal-offset camera landed below that roof and hid the hotel. The public west
  // frontage provides an unobstructed view of the F9 ground-floor arch trim.
  // https://historicengland.org.uk/listing/the-list/list-entry/1113244
  const hotel = greatNorthernHotelPlan(data), road = hotel.faces.find(f => f.kind === 'rear').chain.edges;
  const edge = road[Math.floor(road.length / 2)];
  cams['great-northern-hotel'] = camera([edge.mid[0] + edge.normal[0] * 25, 10, edge.mid[1] + edge.normal[1] * 25], [edge.mid[0], hotel.eaves / 2, edge.mid[1]], 'Great Northern Hotel Pancras Road exterior; OSM rear-chain normal', { fov: 75, near: .1 });
  // Retain the old under-roof view as a junction diagnostic, not as hotel evidence.
  // Before/after captures can inspect the paving seam without moving the camera.
  const main = hotel.faces.find(f => f.kind === 'main').chain.edges;
  const junction = main[Math.floor(main.length / 2)];
  cams['concourse-hotel-junction'] = camera([junction.mid[0] + junction.normal[0] * 45, 14, junction.mid[1] + junction.normal[1] * 45], [junction.mid[0], hotel.eaves / 2, junction.mid[1]], 'OSM hotel main facade; fixed concourse paving-junction diagnostic');
  const midland = midlandGrandPlan(data), face = midland.front.edges[Math.floor(midland.front.edges.length / 2)];
  cams['midland-grand-front'] = camera([face.mid[0] + face.normal[0] * 150, 28, face.mid[1] + face.normal[1] * 150], [face.mid[0], midland.eaves / 2, face.mid[1]], 'midlandGrandPlan Euston Road front');
  const barlow = barlowPlan(data), bp = (u, v, y) => { const [x, z] = shedToWorld(barlow, u, v); return [x, y, z]; };
  cams['st-pancras-shed'] = camera(bp(barlow.width / 2, -85, 46), bp(barlow.width / 2, 95, barlow.rise / 2), 'barlowPlan south end, real OSM heading');
  const midlandEast = Math.max(...midland.outline.map(p => worldToShed(barlow, p).u));
  cams['st-pancras-shed-oblique'] = camera(
    bp(midlandEast + barlow.width * 3.3, -barlow.width * 0.4, barlow.rise * 6),
    bp(barlow.width / 2, barlow.barlowLength * 0.48, barlow.rise * 0.48),
    'barlowPlan elevated south-east oblique; stand-off derived from Midland Grand extent and Barlow width',
    { fov: 55, near: .1 },
  );
  const mouth = tunnelMouths(data).find(m => m.id === 'gasworks-south');
  if (mouth) cams['gasworks-portals'] = camera([mouth.origin[0] - mouth.axis[0] * 65, 12, mouth.origin[1] - mouth.axis[1] * 65], [mouth.origin[0], 4, mouth.origin[1]], 'tunnelMouths gasworks-south rail boundary');

  // ---- Wave 0 of the graphical-fidelity programme: the fixed views the six element rubrics add ----------------------
  // (gfx-rubrics/rubric-<element>.md, "Fixed views"). Each stands where its reference photograph was taken (refs/<group>/
  // SOURCES.md) or on the OSM feature the rubric names, and is frozen once an element's iteration starts. A camera that
  // stands on the ground takes the terrain height under it (the ground is not flat here); platform eyes stand 1.6 m above
  // the platform surface. ELEMENT_VIEWS says which element is scored from which view.
  const { terrain, city } = world;
  const stand = ([x, z], eye = 1.7) => [x, terrain.heightAt(x, z) + eye, z];
  const standAt = (u, v, eye) => stand(shedToWorld(s, u, v), eye);
  const groundAt = ([x, z], above = 0) => [x, terrain.heightAt(x, z) + above, z];
  const way = id => (city.roads.find(r => r.id === id) ?? city.canals.find(c => c.id === id) ?? (() => { throw new Error(`OSM way ${id} is not in the city extract`); })()).pts;
  const pathLength = pts => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  // The point `distance` metres along a polyline, with the unit direction of travel there.
  const along = (pts, distance) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const length = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      if (distance <= length || i + 2 === pts.length) {
        const t = Math.min(1, distance / length);
        return { point: [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t], dir: [(pts[i + 1][0] - pts[i][0]) / length, (pts[i + 1][1] - pts[i][1]) / length] };
      }
      distance -= length;
    }
  };
  const wallPlane = -(TOWER_SIZE + .15); // v of the clock tower's south face: buildTower stands TOWER_SIZE/2 + .15 in front of the south front

  // lighting-materials. R-lighting-materials-a (light-a2-facade-brick-sunlit-2026-06.jpg, Bex Walton CC BY 4.0): stock brick
  // beside a pier of the south front. The east end pier is the stone pier at u = width - 0.5 (shed.ts); the eye stands
  // 4 m south of it and aims at the brick between the pier and the nearest porch arch.
  cams['facade-brick-close'] = camera(standAt(s.width - 1, -4), at(s.width - 2.5, 0, 2.6),
    'R-lighting-materials-a standpoint (light-a2-facade-brick-sunlit-2026-06.jpg): 4 m south of the east end pier of the south front, eye 1.7 m', { fov: 50, near: .1 });

  // kx-front.
  // R-kx-front-c (front-c-clocktower-2019.jpg, Acabashi CC BY-SA 4.0): the clock tower from the square. 35 m south of the
  // tower's south face at y = 28 m, aimed at the clock centre (buildTower's clockY, 5.75 m under the 112 ft overall height).
  cams['tower-close'] = camera(at(s.width / 2, wallPlane - 35, 28), at(s.width / 2, wallPlane, CLOCK_TOWER_HEIGHT - 5.75),
    'R-kx-front-c standpoint (front-c-clocktower-2019.jpg): 35 m south of the tower face, y = 28 m, aimed at the clock centre', { fov: 35, near: .1 });
  // R-kx-front-b (front-b-oblique-sw-2016.jpg, Oast House Archive CC BY-SA 2.0): the front from the square's south-west,
  // about 60 m from the west great arch (centre u = aisle + half a span), looking north-east at the front. The pure
  // south-west bearing (45 degrees) puts the eye inside the square's row of trees (a trunk 0.7 m away filled 58% of the
  // frame), so the eye keeps the 60 m but stands 38 m west and 49 m south of the arch: south-south-west, clear of them.
  const westArch = s.aisle + SHED_SPAN_WIDTH / 2;
  cams['front-southwest-pedestrian'] = camera(standAt(westArch - 38, -49), at(s.width / 2, 0, 12),
    'R-kx-front-b standpoint (front-b-oblique-sw-2016.jpg): 62 m south-south-west of the west great arch, eye 1.7 m on the square, looking north-east', { fov: 60, near: .1 });
  // R-kx-front-d (front-d2-north-york-way-2019.jpg, Colin Cheesman CC BY-SA 2.0): the east flank from York Way. The OSM York Way
  // centreline (way 43892837) runs about 10 m east of the flank wall here; the eye stands 40 m out at y = 12 m, looking west.
  cams['shed-east-flank'] = camera(at(s.width + 40, s.length / 2, 12), at(s.width, s.length / 2, 9),
    'R-kx-front-d standpoint (front-d2-north-york-way-2019.jpg): York Way side, 40 m east of the east flank wall at mid-length, y = 12 m, looking west', { near: .1 });

  // shed-interior. The platform eyes use platform 4's recipe (polygon midpoint, 1.6 m above the platform, looking along it).
  const platformMid = ref => { const q = stationPlatforms(data).get(ref); return q && q.pts.reduce((a, b) => [a[0] + b[0] / q.pts.length, a[1] + b[1] / q.pts.length], [0, 0]); };
  const platformEye = (mid, sign, source) => camera([mid[0], PLATFORM_HEIGHT + 1.6, mid[1]],
    [mid[0] + sign * Math.sin(s.heading) * 40, PLATFORM_HEIGHT + 1.6, mid[1] - sign * Math.cos(s.heading) * 40], source);
  const platform1 = platformMid('1'), platform8 = platformMid('8'), platform4 = platformMid('4');
  // East-shed interior photograph (shed-a-north-from-footbridge-2019.jpg, kitmasterbloke CC BY 2.0, looks north along the platforms).
  if (platform1) cams['platform-eye-p1-north'] = platformEye(platform1, 1, 'OSM platform 1 polygon midpoint, eye 1.6 m above platform, looking north; east-shed interior standpoint (shed-a-north-from-footbridge-2019.jpg)');
  // R-kx-shed-interior-b (shed-b-south-screen-2019.jpg, kitmasterbloke CC BY 2.0): the inner face of the south screen.
  if (platform8) cams['platform-eye-p8-south'] = platformEye(platform8, -1, 'OSM platform 8 polygon midpoint, eye 1.6 m above platform, looking south at the inner south screen; R-kx-shed-interior-b standpoint (shed-b-south-screen-2019.jpg)');
  const furniture = furniturePlan(data, s);
  if (platform4) {
    // R-kx-shed-interior-a (shed-a-north-from-footbridge-2019.jpg): the roof underside, ribs and glazing. Platform 4 midpoint,
    // eye 1.6 m, pitched up 55 degrees and turned north-east so the sight line crosses the east vault.
    const m = worldToShed(s, platform4), eye = PLATFORM_HEIGHT + 1.6, pitch = 55 * Math.PI / 180, reach = 30, run = Math.cos(pitch) * reach * Math.SQRT1_2;
    cams['roof-underside'] = camera([platform4[0], eye, platform4[1]], at(m.u + run, m.v + run, eye + Math.sin(pitch) * reach),
      'OSM platform 4 polygon midpoint, eye 1.6 m, pitched up 55 degrees across the east vault; R-kx-shed-interior-a standpoint (shed-a-north-from-footbridge-2019.jpg)');
    // R-kx-shed-interior-d (shed-d-platform-furniture-2022.jpg, The wub CC BY-SA 4.0): the bench/lamp/help-point groups on a platform.
    // The nearest such group to the midpoint is everything within 3 m of the nearest piece; the eye stands 4 m from its centre,
    // along the platform on the midpoint's side, looking at it.
    const pieces = [...furniture.benches, ...furniture.lamps, ...furniture.helpPoints].filter(piece => piece.ref === '4');
    if (pieces.length) {
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      const first = pieces.reduce((a, b) => dist([a.x, a.z], platform4) <= dist([b.x, b.z], platform4) ? a : b);
      const group = pieces.filter(piece => dist([piece.x, piece.z], [first.x, first.z]) <= 3);
      const centre = [group.reduce((n, piece) => n + piece.x, 0) / group.length, group.reduce((n, piece) => n + piece.z, 0) / group.length];
      const axis = [Math.sin(s.heading), -Math.cos(s.heading)], toMid = (platform4[0] - centre[0]) * axis[0] + (platform4[1] - centre[1]) * axis[1] >= 0 ? 1 : -1;
      cams['furniture-close'] = camera([centre[0] + toMid * axis[0] * 4, PLATFORM_HEIGHT + 1.6, centre[1] + toMid * axis[1] * 4], [centre[0], PLATFORM_HEIGHT + .8, centre[1]],
        'OSM platform 4, 4 m from the nearest bench/lamp/help-point group (furniturePlan), eye 1.6 m; R-kx-shed-interior-d standpoint (shed-d-platform-furniture-2022.jpg)');
    }
  }
  // R-kx-shed-interior-f (shed-f-suburban-platforms-2022.jpg, Mr Ignavy CC BY-SA 2.0): the platform 9-10 canopies. Platform 9's
  // vertex mean lies outside its own canopy (the platform splays), so the midpoint is the canopy's middle sample, which is under it.
  const canopy9 = furniture.canopies.find(c => c.ref === '9');
  if (canopy9) {
    const k = Math.floor(canopy9.left.length / 2), centreline = i => [(canopy9.left[i][0] + canopy9.right[i][0]) / 2, (canopy9.left[i][1] + canopy9.right[i][1]) / 2];
    const mid = centreline(k), ahead = [centreline(Math.min(k + 1, canopy9.left.length - 1)), centreline(Math.max(k - 1, 0))];
    const dir = [ahead[0][0] - ahead[1][0], ahead[0][1] - ahead[1][1]], length = Math.hypot(...dir), north = (dir[0] * Math.sin(s.heading) - dir[1] * Math.cos(s.heading)) >= 0 ? 1 : -1;
    cams['suburban-p9'] = camera([mid[0], PLATFORM_HEIGHT + 1.6, mid[1]], [mid[0] + north * dir[0] / length * 40, PLATFORM_HEIGHT + 1.6, mid[1] + north * dir[1] / length * 40],
      'OSM platform 9 canopy middle (furniturePlan canopy 9), eye 1.6 m above platform, looking north along the platform; R-kx-shed-interior-f standpoint (shed-f-suburban-platforms-2022.jpg)');
  }

  // western-concourse.
  if (funnel) {
    // R-western-concourse-a (conc-a-funnel-2012.jpg, Colin CC BY-SA 3.0; conc-ab-funnel-brick-2025.jpg): the funnel and the Range behind
    // it. 8 m west of the funnel's axis, eye 1.6 m above the concourse floor (y = 0.02), pitched up 35 degrees, looking east.
    const f = worldToShed(s, funnel), eye = 1.62;
    cams['concourse-funnel-up'] = camera(at(f.u - 8, f.v, eye), at(f.u, f.v, eye + 8 * Math.tan(35 * Math.PI / 180)),
      'R-western-concourse-a standpoint (conc-a-funnel-2012.jpg): 8 m from the funnel axis, eye 1.6 m, pitched up 35 degrees, looking east at the funnel and the Range');
  }
  // R-western-concourse-c (conc-c-exterior-square-2016.jpg, ell brown CC BY-SA 2.0): the concourse roof from King's Cross Square.
  // The canopy edge is the fitted arc's southern point. The pure south-west bearing at 50 m is off the square (the ground beyond
  // its west boundary is the hotel and Pancras Road) and the round service building (OSM 96299681) fills the south-south-west,
  // so the eye stands on the square 35 m south of the edge and 5 m west. The photograph centres the whole dome, so the aim is the
  // canopy's centre (a 45 degree aim put the roof half out of frame) and the lens is 60 degrees to take the 123 m span in.
  const arc = worldToShed(s, concourse.centre), canopyEdge = arc.v - concourse.radius;
  cams['concourse-exterior-square'] = camera(standAt(arc.u - 5, canopyEdge - 35), [concourse.centre[0], 8, concourse.centre[1]],
    'R-western-concourse-c standpoint (conc-c-exterior-square-2016.jpg): King\'s Cross Square, eye 1.7 m, 35 m south of the canopy edge, looking at the whole roof', { fov: 60, near: .1 });
  // R-western-concourse-b (conc-b-roof-meets-range-2025-08.jpg, Jonosunde CC BY-SA 4.0): the whole Range elevation from inside the
  // concourse. y = 8 m under the roof near the canopy's west edge (the rim itself is only ~5 m high), at the Range's mid-length.
  cams['western-range-full'] = camera(at(-WESTERN_RANGE.depth - 62, (WESTERN_RANGE.v0 + WESTERN_RANGE.v1) / 2, 8), at(-WESTERN_RANGE.depth - .1, (WESTERN_RANGE.v0 + WESTERN_RANGE.v1) / 2, 6),
    'R-western-concourse-b standpoint (conc-b-roof-meets-range-2025-08.jpg): inside the concourse near the canopy\'s west edge, y = 8 m, the full Range elevation', { fov: 70, near: .1 });

  // historic-neighbours.
  // R-historic-neighbours-a (hist-a-great-northern-hotel-2013.jpg, Richard Ash CC BY-SA 2.0): the crescent from the square, 45 m
  // from the hotel's south end (its southernmost OSM outline point), looking north along the crescent's main face. Due south of
  // the end stands the round service building (OSM 96299681, 3 m ahead of the eye, 92% of the frame), so the eye keeps the 45 m
  // and swings 20 degrees east of south, clear of it, in the square.
  const hotelSouth = worldToShed(s, hotel.outline.reduce((a, b) => b[1] > a[1] ? b : a)), swing = 70 * Math.PI / 180;
  cams['gnh-from-square'] = camera(standAt(hotelSouth.u + 45 * Math.cos(swing), hotelSouth.v - 45 * Math.sin(swing)), [junction.mid[0], hotel.eaves / 2, junction.mid[1]],
    'R-historic-neighbours-a standpoint (hist-a-great-northern-hotel-2013.jpg): King\'s Cross Square, eye 1.7 m, 45 m south-south-east of the hotel\'s south end, looking north along the crescent');
  // R-historic-neighbours-b (hist-b-midland-grand-euston-road-2012.jpg, Colin CC BY-SA 3.0): the front from Euston Road. The two
  // OSM carriageways cross the front's normal 29.8 m and 42.1 m out; 50 m is the south pavement beyond them.
  cams['midland-euston-road'] = camera(stand([face.mid[0] + face.normal[0] * 50, face.mid[1] + face.normal[1] * 50]), [face.mid[0], 16, face.mid[1]],
    'R-historic-neighbours-b standpoint (hist-b-midland-grand-euston-road-2012.jpg): south pavement of Euston Road opposite the hotel centre, eye 1.7 m', { fov: 70, near: .1 });
  // R-historic-neighbours-c (hist-c-clock-tower-2015.jpg, Elliott Brown CC BY-SA 2.0): the clock stage. 60 m out along the tower's
  // front normal at y = 40 m; the clock centre is 0.68 of the tower height (landmarks.ts addTower: belfry top 0.63, clock top 0.73).
  const seats = landmarkSeats(landmarkPlans(data), terrain), clock = midland.towers.find(t => t.name === 'clock');
  if (clock) cams['midland-clock-tower'] = camera([clock.centre[0] + clock.out[0] * 60, 40, clock.centre[1] + clock.out[1] * 60], [clock.centre[0], seats.midland.y + clock.height * .68, clock.centre[1]],
    'R-historic-neighbours-c standpoint (hist-c-clock-tower-2015.jpg): 60 m from the clock tower along its front normal, y = 40 m, aimed at the clock', { fov: 35, near: .1 });
  // R-historic-neighbours-d (hist-d-barlow-interior-2014.jpg, mattbuck CC BY-SA 4.0; hist-d2-barlow-looking-north-2018.jpg): the
  // Barlow shed from inside, on its centreline 40 m from the south end, eye 1.6 m above the shed's floor (its seat), looking north.
  cams['barlow-interior'] = camera(bp(barlow.width / 2, 40, seats.barlow.y + 1.6), bp(barlow.width / 2, 200, seats.barlow.y + 1.6),
    'R-historic-neighbours-d standpoint (hist-d-barlow-interior-2014.jpg): inside the Barlow shed on its centreline, 40 m from the south end, eye 1.6 m, looking north');

  // city-surroundings.
  // R-city-surroundings-b (city-b-granary-building-2016.jpg, Clem Rutter CC BY-SA 3.0): the Granary from Granary Square. The square
  // runs from the Granary's front to the canal, whose OSM centreline is ~98 m south of the front; 88 m is the south steps.
  const granary = granaryComplex(data).granary, granaryFront = granary.front[1];
  cams['granary-square'] = camera(stand([granaryFront.mid[0] + granaryFront.normal[0] * 88, granaryFront.mid[1] + granaryFront.normal[1] * 88]), groundAt(granaryFront.mid, granary.eaves / 2),
    'R-city-surroundings-b standpoint (city-b-granary-building-2016.jpg): Granary Square south steps, 88 m south of the Granary front, eye 1.7 m, looking north');
  // R-city-surroundings-c (city-c-gasholders-2023.jpg, The wub CC BY-SA 4.0): the triplet from the towpath. The canal vertex nearest
  // the point 55 m south of the triplet's centre, then 7 m to the triplet's side of the centreline (the water is 9 m wide).
  const triplet = gasholderPlan().triplet, holders = [triplet.reduce((n, h) => n + h.centre[0], 0) / triplet.length, triplet.reduce((n, h) => n + h.centre[1], 0) / triplet.length];
  const canalRuns = city.canals.map(c => c.pts), canalDist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  let bank = null;
  for (const pts of canalRuns) pts.forEach((p, i) => { const d = canalDist(p, [holders[0], holders[1] + 55]); if (!bank || d < bank.d) bank = { d, p, dir: [pts[Math.min(i + 1, pts.length - 1)][0] - pts[Math.max(i - 1, 0)][0], pts[Math.min(i + 1, pts.length - 1)][1] - pts[Math.max(i - 1, 0)][1]] }; });
  if (bank) {
    const length = Math.hypot(...bank.dir), side = [-bank.dir[1] / length, bank.dir[0] / length], towardHolders = side[0] * (holders[0] - bank.p[0]) + side[1] * (holders[1] - bank.p[1]) >= 0 ? 1 : -1;
    cams.gasholders = camera(stand([bank.p[0] + towardHolders * side[0] * 7, bank.p[1] + towardHolders * side[1] * 7]), groundAt(holders, 12),
      'R-city-surroundings-c standpoint (city-c-gasholders-2023.jpg): canal towpath south of the gasholder triplet, eye 1.7 m, looking north');
  }
  // R-city-surroundings-d (city-d-canal-lock-2022.jpg, Jim Osley CC BY-SA 2.0): St Pancras Lock. OSM canal way 108337675 starts at the
  // lock junction, where the terrain falls to the lock cutting. The scene's water polygons run ~11 m either side of that centreline
  // (a 7 m offset put the eye in the water), so the eye stands on the east towpath 14 m from it, 10 m down-canal of the junction, and
  // looks 60 m down the canal (it runs south-south-east here, not due east as the rubric words it).
  const lockWay = way(108337675), lockDir = along(lockWay, 1).dir, lockSide = [-lockDir[1], lockDir[0]], lockEast = lockSide[0] >= 0 ? 1 : -1;
  const lockEye = [lockWay[0][0] + lockDir[0] * 10 + lockEast * lockSide[0] * 14, lockWay[0][1] + lockDir[1] * 10 + lockEast * lockSide[1] * 14];
  cams['canal-lock'] = camera(stand(lockEye), groundAt([lockWay[0][0] + lockDir[0] * 60, lockWay[0][1] + lockDir[1] * 60], 1),
    'R-city-surroundings-d standpoint (city-d-canal-lock-2022.jpg): east towpath at St Pancras Lock (OSM canal way 108337675), eye 1.7 m, looking down the canal');
  // R-city-surroundings-e (city-e-google-kgx1-2026.jpg, Bex Walton CC BY 4.0): KGX1 from King's Boulevard. The OSM centreline of the
  // boulevard (way 807924984) runs beside KGX1's west face; the eye stands 25 m along it from the south end, looking up the street.
  const boulevard = way(807924984), here = along(boulevard, 25), ahead = along(boulevard, 120);
  cams['kings-boulevard'] = camera(stand(here.point), groundAt(ahead.point, 14),
    'R-city-surroundings-e standpoint (city-e-google-kgx1-2026.jpg): King\'s Boulevard, eye 1.7 m, looking north up the street at KGX1');
  // R-city-surroundings-a (city-a-aerial-skyline-2016.jpg, Robot8A CC BY-SA 4.0): Euston Road outside the forecourt. The eye stands on
  // the middle of OSM way 367808662 (the eastbound carriageway beside the Square) and looks along the road to Pentonville Road (way 1112581153).
  const eustonWay = way(367808662), eustonMid = along(eustonWay, pathLength(eustonWay) / 2), pentonville = way(1112581153).at(-1);
  cams['euston-road-east'] = camera(stand(eustonMid.point), groundAt(pentonville, 4),
    'R-city-surroundings-a standpoint (city-a-aerial-skyline-2016.jpg): Euston Road outside the King\'s Cross forecourt (OSM way 367808662), eye 1.7 m, looking east along Pentonville Road');
  return cams;
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
Every fixed station view is shot twice, 150 ms apart, to check it for flicker; exit code 1 if the capture stops or a view flickers.
Every page load pins the scene clock and weather in its address (a build that predates the sky and weather work ignores them):
  --time <ISO 8601 instant with a zone, or 13-digit epoch ms>   default ${PIN_TIME}
  --weather <${WEATHER_NAMES.join('|')}>   default ${PIN_WEATHER}
  --sky ref   the page's old fixed look instead (cannot be combined with --time or --weather)`); return; }
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
    const shot = async (id, name, c, { twoFrame = false, ...extra } = {}) => {
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
      }
      if (extra.signalId !== undefined && !await evaluate(`window.__kx.signals.signals().find(r=>r.signal.id===${extra.signalId})?.state===${JSON.stringify(extra.observedState)}`)) throw new Error('signal changed during capture; shot was not accepted');
      await writePrivateFile(path.join(options.out, file), Buffer.from(png.data, 'base64'));
      const flicker = secondPng ? compareFrames(Buffer.from(png.data, 'base64'), Buffer.from(secondPng.data, 'base64')) : null;
      const record = { file, axis: id, scenario: currentScenario, ...metadata, ...(captureRender ?? {}), source: c?.source ?? 'current page camera', lighting, ...(flicker ? { flicker } : {}), ...extra };
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
    await runStationEvidenceShots(cameras, shot, attempt, selected);
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
  await writePrivateFile(path.join(options.out, 'index.md'), `# King's Cross evidence pack\n\nMeasured ${report.when}. Renderer: ${report.renderer ?? 'not captured'}.\n\nEach axis-NN.json links its PNGs and command logs. [Axis 04 summary](axis-04.md) links the replay, board agreement and optional live comparison. manifest.json contains every camera, URL, simulation clock, GPU string, draw calls, triangles, errors and explicit gaps.\n\n${report.views.partial ? `Partial pack: only ${report.views.names.length} fixed station views (--views ${report.views.requested}).\n\n` : ''}Flicker: ${report.flicker.checked} fixed views shot twice, ${report.flicker.failed.length} over the ${report.flicker.limit * 100}% limit (worst ${(report.flicker.worstFraction * 100).toFixed(4)}%). Scene pin: ${report.lighting.pin.parameters} (applied by the page: ${report.lighting.pinHonoured ?? 'no pinned page was shot'}). Lighting: ${LIGHTING_NOTE}\n\n${report.axes.map(a=>`- ${a.id}. ${a.name}: ${a.screenshots.length} shots, ${a.artifacts.length} artifacts; ${a.gaps.length} gaps.`).join('\n')}\n\n## Remaining checks\n\n${report.gaps.map(g=>`- ${g}`).join('\n')}\n`);
  console.log(JSON.stringify({ out: options.out, renderer: report.renderer, screenshots: report.screenshots.length, bundleGzipBytes: report.build.totalGzipBytes, gaps: report.gaps, fatal: report.fatal ?? null,
    flicker: { checked: report.flicker.checked, failed: report.flicker.failed.length, worstFraction: report.flicker.worstFraction },
    lighting: { pin: report.lighting.pin.parameters, pinHonoured: report.lighting.pinHonoured, fingerprints: Object.keys(report.lighting.fingerprints) } }, null, 2));
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
