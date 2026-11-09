// Is every fixed evidence camera clear of geometry? Builds the station scene in Node (no browser, no GPU) and casts rays from each
// fixed station camera: an eye inside a building or under the ground, a lens pressed to a wall (more than half of the frame within
// 2 m of solid geometry) or a subject hidden behind something solid makes the capture void. Run it before an iterator freezes a view,
// and again after any geometry change that could swallow one:
//   node tools/camera-clearance.mjs [--views <element|view>[,<element|view>...]] [--grid 7]
// --views takes what evidence.mjs --views takes (an element, a view name, or station); the default is every non-grid station camera.
// Exit code 0: every checked camera is clear; 1: at least one fault; 2: bad arguments. One camera takes about a second.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveViews, stationCameras } from './evidence.mjs';
import { buildStationScene, clearanceFaults, stationData, viewClearance } from './station-scene.mjs';

/** @returns {{views:string, grid:number, help:boolean}} */
export function clearanceOptions(args) {
  const values = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--help') { values.set(key, true); continue; }
    if (values.has(key) || !['--views', '--grid'].includes(key)) throw new Error(`unknown or repeated option: ${key}`);
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`missing value for ${key}`);
    values.set(key, args[++i]);
  }
  const grid = Number(values.get('--grid') ?? 7);
  if (!Number.isInteger(grid) || grid < 2 || grid > 15) throw new Error('--grid must be an integer from 2 to 15 (rays per side of the fan)');
  return { views: values.get('--views') ?? 'station', grid, help: values.has('--help') };
}

/** The fixed station cameras a `--views` value names, minus the 10 m grid cameras (3 km out, nothing to be inside of), in camera order. */
export function camerasToCheck(views, cameras) {
  const wanted = resolveViews(views, cameras) ?? new Set(Object.keys(cameras));
  return Object.entries(cameras).filter(([name, camera]) => wanted.has(name) && !camera.grid);
}

export async function main(args = process.argv.slice(2), log = console.log) {
  const options = clearanceOptions(args);
  if (options.help) { log('node tools/camera-clearance.mjs [--views <element|view>[,<element|view>...]] [--grid 7]'); return 0; }
  const { data } = stationData();
  const checked = camerasToCheck(options.views, stationCameras(data));
  const { occluders, ground } = buildStationScene();
  const faults = [];
  for (const [name, camera] of checked) {
    const view = viewClearance(camera, occluders, ground, { grid: options.grid });
    const found = clearanceFaults(name, view);
    faults.push(...found);
    log(`${found.length ? 'FAULT' : 'clear'}  ${name.padEnd(28)} eye ${view.eyeAboveGround.toFixed(1)} m above ground, nearest solid ${Number.isFinite(view.contactM) ? `${view.contactM.toFixed(1)} m` : 'none'}, ${(view.nearBlocked * 100).toFixed(0)}% of the frame within 2 m`);
  }
  for (const fault of faults) log(fault);
  log(`${checked.length} cameras checked, ${faults.length} faults`);
  return faults.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }, error => { console.error(`camera-clearance: ${error.message}`); process.exitCode = 2; });
}
