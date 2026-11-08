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
import { GAUGE, RAIL_HEAD_WIDTH, buildingsUnderStation, concourseCanopy, platformReport, pointInPolygon, shedLayout, shedToWorld, stationBuilding, stationPlatforms } from '../core/station.ts';
import { barlowPlan, greatNorthernHotelPlan, midlandGrandPlan, REPLACED_BUILDING_IDS, tunnelMouths } from '../core/landmarks.ts';
import { planBuilding } from '../core/city.ts';
import { ALL_KINDS, FIGURES, EMU_FIGURES, trainLayout } from '../core/train.ts';
import { WESTERN_RANGE } from '../web/src/shed.ts';

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
  const names = new Set(['--dist', '--out', '--relay', '--chrome', '--date', '--speed', '--signal-at', '--raw-osm']);
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
  const out = path.resolve(values.get('--out') ?? path.join(repoRoot, '.scratch/evidence'));
  if (!within(path.join(repoRoot, '.scratch'), out)) throw new Error('--out must be under this worktree .scratch (the pack contains private derived data)');
  return { dist: path.resolve(values.get('--dist') ?? path.join(repoRoot, '.scratch/kx-dist')), out,
    rawOsm: path.resolve(values.get('--raw-osm') ?? path.join(os.homedir(), 'kx-data/osm/kx-osm.json')), relay: relayUrl(values.get('--relay')), chrome: values.get('--chrome'), gpu: values.has('--gpu'), help: values.has('--help'), date, iso, speed, signalAt };
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

// x east, y up, z south. Landmark targets come from their actual public OSM outlines.
export function stationCameras(data) {
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
    'roof-above': camera(at(s.width / 2 + 45, 110, s.crown + 110), at(s.width / 2, 110, s.crown - 3), 'shedLayout roof'),
    'north-gable': camera(at(s.width / 2, s.length + 80, 18), at(s.width / 2, s.length, 12), 'shedLayout north gable'),
  };
  const p = stationPlatforms(data).get('4');
  if (p) { const mid = p.pts.reduce((a, b) => [a[0] + b[0] / p.pts.length, a[1] + b[1] / p.pts.length], [0, 0]);
    cams['platform-eye'] = camera([mid[0], PLATFORM_HEIGHT + 1.6, mid[1]], [mid[0] + Math.sin(s.heading) * 40, PLATFORM_HEIGHT + 1.6, mid[1] - Math.cos(s.heading) * 40], 'OSM platform 4 polygon, eye 1.6 m above platform');
    const tip = [...p.pts].sort((a,b)=>a[1]-b[1]).slice(0,2).reduce((a,b)=>[a[0]+b[0]/2,a[1]+b[1]/2],[0,0]);
    cams['shed-interior'] = camera([tip[0],3.2,tip[1]], at(s.width / 2,100,8), 'OSM platform 4 north end looking into the shed'); }
  const hotel = greatNorthernHotelPlan(data), main = hotel.faces.find(f => f.kind === 'main').chain.edges;
  const edge = main[Math.floor(main.length / 2)];
  cams['great-northern-hotel'] = camera([edge.mid[0] + edge.normal[0] * 45, 14, edge.mid[1] + edge.normal[1] * 45], [edge.mid[0], hotel.eaves / 2, edge.mid[1]], 'greatNorthernHotelPlan main facade');
  const midland = midlandGrandPlan(data), face = midland.front.edges[Math.floor(midland.front.edges.length / 2)];
  cams['midland-grand-front'] = camera([face.mid[0] + face.normal[0] * 150, 28, face.mid[1] + face.normal[1] * 150], [face.mid[0], midland.eaves / 2, face.mid[1]], 'midlandGrandPlan Euston Road front');
  const barlow = barlowPlan(data), bp = (u, v, y) => { const [x, z] = shedToWorld(barlow, u, v); return [x, y, z]; };
  cams['st-pancras-shed'] = camera(bp(barlow.width / 2, -85, 46), bp(barlow.width / 2, 95, barlow.rise / 2), 'barlowPlan south end, real OSM heading');
  const mouth = tunnelMouths(data).find(m => m.id === 'gasworks-south');
  if (mouth) cams['gasworks-portals'] = camera([mouth.origin[0] - mouth.axis[0] * 65, 12, mouth.origin[1] - mouth.axis[1] * 65], [mouth.origin[0], 4, mouth.origin[1]], 'tunnelMouths gasworks-south rail boundary');
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
  if (options.help) { console.log('node tools/evidence.mjs --gpu --dist <built dir> --out <worktree/.scratch/pack> [--relay http://127.0.0.1:8787] [--date YYYYMMDD] [--speed 8] [--signal-at HH:mm:ss] [--raw-osm <OSM extract.json>] [--chrome <path>]'); return; }
  await stat(path.join(options.dist, 'index.html'));
  await safeOutputDirectory(repoRoot, options.out);
  await walk(options.out); // Reject reused input/report links before fetching any private data.
  const data = JSON.parse(await readFile(path.join(packageRoot, 'web/src/data/kx-track.json'), 'utf8'));
  const city = JSON.parse(await readFile(path.join(packageRoot, 'web/src/data/kx-city.json'), 'utf8'));
  const buildings = cityBuildings(data), cameras = stationCameras(data), files = await walk(options.dist);
  const bundleFiles = await Promise.all(files.sort().map(async f => { const b = await readFile(f); return { file: path.relative(options.dist, f), bytes: b.length, gzip: gzipSync(b).length, sha256: createHash('sha256').update(b).digest('hex') }; }));
  const twin = twinRails(railSegments(data).main.slice(0, 6));
  const drawnGauge = Math.hypot(twin[0]-twin[6], twin[2]-twin[8]) - RAIL_HEAD_WIDTH;
  const report = { schema: 2, when: new Date().toISOString(), machine: `${os.type()} ${os.release()}, ${os.cpus()[0]?.model}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB`,
    requestedGpu: options.gpu ? 'ANGLE Metal' : 'SwiftShader (diagnostic only)', renderer: null, validGpu: false, complete: false,
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
    const navigate = async (query, scenario, vp = 'desktop', origin = base) => {
      currentScenario = scenario; await viewport(vp); await S('Page.navigate', { url: `${origin}${query}` });
      await until('!!window.__kx?.ready'); await prepareScene(); await twoFrames();
    };
    const setCamera = async c => { await evaluate(`(() => { const k=window.__kx; k.controls.minDistance=.05; k.controls.maxDistance=20000; k.controls.maxPolarAngle=Math.PI; k.camera.far=20000; k.camera.near=${c.near ?? .1}; k.camera.fov=${c.fov ?? 50}; k.camera.updateProjectionMatrix(); k.camera.position.set(${c.pos}); k.controls.target.set(${c.target}); k.controls.update(); return true; })()`); await twoFrames(); };
    const shot = async (id, name, c, extra = {}) => {
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
      const collisions = cameraBuildingCollisions({ [name]: metadata.camera }, buildings);
      report.cameraClearance.captures.push({ name, collisions });
      if (collisions.length) throw new Error(`camera ${name} is inside city building ${collisions.map(c=>c.buildingId).join(', ')} below its roof`);
      report.renderer ??= metadata.renderer; report.validGpu = realMetal(metadata.renderer);
      if (options.gpu && !realMetal(metadata.renderer)) throw new Error(`real Metal required, observed renderer: ${metadata.renderer}`);
      if (extra.signalId !== undefined && metadata.signals?.find(s=>s.id===extra.signalId)?.state !== extra.observedState) throw new Error('signal changed state before capture; shot was not accepted');
      const file = `axis-${id}/${name}.png`; await mkdir(path.join(options.out, `axis-${id}`), { recursive: true });
      const boardState = extra.signalId === undefined ? null : await evaluate(`(${setSignalDetailBoardVisibility.toString()})(document.querySelector('.kx-board'),true)`);
      let png;
      try {
        if (extra.signalId !== undefined) await twoFrames();
        png = await S('Page.captureScreenshot', { format: 'png' });
      } finally {
        if (extra.signalId !== undefined) await evaluate(`(${setSignalDetailBoardVisibility.toString()})(document.querySelector('.kx-board'),false,${JSON.stringify(boardState)})`);
      }
      if (extra.signalId !== undefined && !await evaluate(`window.__kx.signals.signals().find(r=>r.signal.id===${extra.signalId})?.state===${JSON.stringify(extra.observedState)}`)) throw new Error('signal changed during capture; shot was not accepted');
      await writePrivateFile(path.join(options.out, file), Buffer.from(png.data, 'base64'));
      const record = { file, axis: id, scenario: currentScenario, ...metadata, source: c?.source ?? 'current page camera', ...extra };
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
    for (const [name, c] of Object.entries(cameras).filter(([, c]) => !c.grid)) await attempt('02', name, () => shot('02', name, c));
    if (!cameras['gasworks-portals']) gap('02', 'Gasworks south mouth could not be located in public geometry');
    await navigate('?trains=none&bare=1&grid=1&board=0', 'geometry');
    for (const [name, c] of Object.entries(cameras).filter(([, c]) => c.grid)) await shot('01', `${name}-10m-grid`, c);

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
  } catch (error) { report.fatal = error.message; report.gaps.push(`Capture stopped: ${error.message}`); }
  finally { await cleanup(); }

  // Supporting evidence is generated without reading any login or account name.
  await mkdir(path.join(options.out, 'checks'), { recursive: true });
  const run = async (id, name, command, args, timeout = 300000) => { const r = await commandResult(command, args, packageRoot, path.join(options.out, 'checks', `${name}.log`), timeout); r.file=`checks/${name}.log`; report.commands.push(r); axis(id).artifacts.push(`checks/${name}.log`); if(r.code!==0) gap(id, `${name}: ${r.timedOut?'timed out':`exit ${r.code}`}`); return r; };
  await run('09', 'evidence-tests', 'node', ['--test', '--test-timeout=10000', 'tools/tests/evidence.test.mjs'], 60000);
  await run('09', 'tests', 'npm', ['test']); await run('09', 'typecheck', 'npx', ['tsc', '--noEmit', '-p', '.'], 120000);
  await run('07', 'relay-mutations', 'python3', ['-I', '-u', 'tools/mutation/relay.py', 'relay', path.join(options.out, 'relay-mutations')]);
  try { await stat(options.rawOsm); await run('01', 'osm-fidelity', 'node', ['tools/fidelity.ts', '--raw', options.rawOsm, '--json']); }
  catch { gap('01', 'No raw OSM extract: pass --raw-osm to generate the independent fidelity deltas and unresolved-issue list.'); }
  if (options.relay) {
    await attemptReports(options, report, run, gap);
  }
  gap('07', 'Credential/account-name sweep is intentionally not automated: the scorer runs their local secret scan without giving this tool an account name or login.');
  gap('09', 'Scorer must separately rerun the repository responsive/catalog checks and inspect mutation evidence for other changed components.');
  if (!options.gpu || !report.validGpu) gap('08', 'Only a measured real Metal renderer qualifies; software or unknown graphics do not.');
  await writePrivateFile(path.join(options.out, 'checks/camera-clearance.json'), `${JSON.stringify(report.cameraClearance,null,2)}\n`);
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
  await writePrivateFile(path.join(options.out, 'index.md'), `# King's Cross evidence pack\n\nMeasured ${report.when}. Renderer: ${report.renderer ?? 'not captured'}.\n\nEach axis-NN.json links its PNGs and command logs. manifest.json contains every camera, URL, simulation clock, GPU string, draw calls, triangles, errors and explicit gaps.\n\n${report.axes.map(a=>`- ${a.id}. ${a.name}: ${a.screenshots.length} shots, ${a.artifacts.length} artifacts; ${a.gaps.length} gaps.`).join('\n')}\n\n## Remaining checks\n\n${report.gaps.map(g=>`- ${g}`).join('\n')}\n`);
  console.log(JSON.stringify({ out: options.out, renderer: report.renderer, screenshots: report.screenshots.length, bundleGzipBytes: report.build.totalGzipBytes, gaps: report.gaps, fatal: report.fatal ?? null }, null, 2));
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  if (report.fatal) process.exitCode = 1;
  return report;
}

async function attemptReports(options, report, run, gap) {
  const inputs = path.join(options.out, 'inputs'); await safeOutputDirectory(repoRoot, inputs);
  try {
    for (const [endpoint, name] of [['/anchors', 'anchors.json'], [`/recording?date=${options.date}`, 'recording.ndjson'], ['/sclass', 'sclass.json']]) {
      try {
        const response = await fetch(new URL(endpoint, options.relay), { signal: AbortSignal.timeout(35000) });
        if (!response.ok) throw new Error(`${endpoint.split('?')[0]} HTTP ${response.status}`);
        await writePrivateFile(path.join(inputs, name), new Uint8Array(await response.arrayBuffer()));
        if(name==='sclass.json') report.axes.find(a=>a.id==='06').artifacts.push('inputs/sclass.json');
      } catch(e) { if(name==='sclass.json') gap('06',e.message); else throw e; }
    }
    await run('04', 'replay-report', 'node', ['tools/replay-report.ts', '--anchors', path.join(inputs, 'anchors.json'), '--recording', path.join(inputs, 'recording.ndjson'), '--out', path.join(options.out, 'replay-report')]);
    await run('05', 'motion-report', 'node', ['tools/motion-check.ts', '--anchors', path.join(inputs, 'anchors.json'), '--recording', path.join(inputs, 'recording.ndjson'), '--out', path.join(options.out, 'motion-report')]);
    report.axes.find(a=>a.id==='04').artifacts.push('replay-report/'); report.axes.find(a=>a.id==='05').artifacts.push('motion-report/');
    // Refusal proof uses a harmless invalid Host, never the account name.
    const refusal = await new Promise(resolve => { const request = (options.relay.protocol==='https:'?httpsRequest:httpRequest)(new URL('/health', options.relay), { headers:{host:'outside.invalid'},timeout:5000 }, response=>{response.resume();resolve(response.statusCode);});request.once('timeout',()=>request.destroy());request.once('error',()=>resolve(null));request.end(); });
    report.hostHeaderRefusal = { host: 'outside.invalid', status: refusal, passed: refusal === 403 };
    await writePrivateFile(path.join(options.out,'checks/host-header.json'),JSON.stringify(report.hostHeaderRefusal,null,2)+'\n');
    report.axes.find(a=>a.id==='07').artifacts.push('checks/host-header.json');
    if(refusal!==403) gap('07','Host-header refusal did not return 403');
  } catch(e) { gap('04',`supporting recording reports: ${e.message}`); }
  gap('04', 'For a contemporaneous live/replay comparison run tools/live-vs-replay.ts against a checkpointed window; an old replay cannot establish live equivalence by itself.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`evidence: ${error.message}`); process.exitCode = 1; });
}
