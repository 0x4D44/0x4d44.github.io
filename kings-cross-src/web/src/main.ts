import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bounds, PLATFORM_HEIGHT, railSegments } from '../../core/scene.ts';
import type { CityData } from '../../core/city.ts';
import { addCity } from './city.ts';
import { buildingsUnderStation, concourseCanopy, platformSouthEnd, shedBufferStops, shedLayout, stationBuilding, stationPlatforms, worldToShed } from '../../core/station.ts';
import { buildFurniture, buildPlatforms } from './furniture.ts';
import type { FurniturePlan } from './furniture.ts';
import { buildBufferStops, buildTrack } from './track.ts';
import { addPortals, portalHole } from './portals.ts';
import { REPLACED_BUILDING_IDS as LANDMARK_OSM_IDS, tunnelMouths } from '../../core/landmarks.ts';
import { createTerrain } from '../../core/terrain.ts';
import type { Terrain, TerrainFile } from '../../core/terrain.ts';
import type { KxData } from '../../core/osm.ts';
import type { TrainKind } from '../../core/train.ts';
import type { AnchorMap } from '../../core/anchors.ts';
import { buildGraph } from '../../core/graph.ts';
import { createMotion } from '../../core/motion.ts';
import { matchService } from '../../core/schedule.ts';
import type { TrainView } from '../../core/motion.ts';
import { buildConcourse } from './concourse.ts';
import { platformSign } from './labels.ts';
import { buildShed } from './shed.ts';
import { buildTrain, standTrain } from './train.ts';
import { backoffMs, createLiveFeed, createReplayFeed, createScheduleFeed, parseRecording, probeRelay, relayReachable, trainSettings } from './feed.ts';
import type { MotionSink, TrainFeed } from './feed.ts';
import { loadOfflineReplay } from './offline-replay.ts';
import { createSignals } from './signals.ts';
import type { SignalOverlay } from './signals.ts';
import { approachPlatforms, boardRows, createBoard } from './board.ts';
import type { BoardRows, BoardTrain } from './board.ts';
import { createLiveTrains, createTrainKinds } from './trains-live.ts';
import { createTrainTooltip, trainTip } from './tooltip.ts';
import { addTerrain, addWorld, GROUND_Y } from './world.ts';
import { createSceneWeather, createWaverleyWeather, sceneWeatherOptions } from './station-weather.ts';
import { createSunShadow, createUngradedScan, grade } from './lighting.ts';
import { nightLightSites } from './night.ts';
import { parseSceneTime } from './weather.ts';
import trackData from './data/kx-track.json';
import signalData from './data/kx-signals.json';
import { createStations } from './stations.ts';
import { resizeViewport } from './viewport.ts';
import { createStPancrasLive } from './stpancras-live.ts';
import { createEdinburghLive } from './edinburgh-live.ts';

const data = trackData as unknown as KxData;
/** A standing train's nose stops this far (metres) north of its buffer stop. */
const NOSE_TO_STOP = 1.5;
const status = document.getElementById('status') as HTMLElement;
const host = document.getElementById('app') as HTMLElement;

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!webglOk()) {
  document.body.classList.add('no-webgl');
  status.textContent = 'WebGL unavailable';
} else {
  start();
}

function start(): void {
  const params = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // the sun's shadow (lighting.ts) is drawn only when the atmosphere's sun casts it: ?bare=1 and ?sky=ref keep the old fixed rig, and no shadow
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const world = addWorld(scene, { grid: params.has('grid') || params.has('bare'), bare: params.has('bare') });
  // the track's curves (core/curves.ts): the trains run on them, and the signal heads stand beside them
  const graph = buildGraph(data, { curves: true });
  const signalLayer = params.get('signals') === '0' ? null : createSignals(signalData as SignalOverlay, scene, { track: graph });

  const rails = railSegments(data); // camera bounds
  const layout = shedLayout(data);
  // Ballast, sleepers and rail heads (track.ts); textured platforms with edge strips and furniture.
  scene.add(buildTrack(data, layout));
  scene.add(buildPlatforms(data, layout));
  const furniture = buildFurniture(data, layout);
  scene.add(furniture);

  // The station footprint is a roof, not a block: skip it as a building and build the shed. So are
  // the blocks that would stand inside the concourse dome or against the south front.
  const station = stationBuilding(data);
  const canopy = concourseCanopy(data);
  const hidden = new Set(buildingsUnderStation(data, layout, canopy));
  if (station) hidden.add(station.id);
  // The Great Northern Hotel, the Midland Grand and the Barlow shed are modelled (landmarks.ts),
  // so their OSM boxes go.
  for (const id of LANDMARK_OSM_IDS) hidden.add(id);
  // The terrain (Environment Agency DTM, ~120 kB) and the city (textured buildings, streets, paving, water,
  // trees: ~240 kB of JSON) are their own chunks, so the station draws first and they follow. The terrain is
  // drawn over its extent with the tunnel mouths cut into it, then the landmarks follow. ?bare=1 and ?terrain=0
  // keep the flat plane (and ?bare leaves the city out, so the evidence shots can measure the shed and
  // platforms). Tools await kx.cityLoaded, which is everything: terrain, portals, landmarks, city.
  const bare = params.has('bare');
  const parts: { shed: THREE.Object3D | null; buildings: THREE.Group | null; terrain: Terrain | null } = { shed: null, buildings: null, terrain: null };
  const terrainLoaded: Promise<Terrain | null> = bare || params.get('terrain') === '0'
    ? Promise.resolve(null)
    : import('./data/kx-terrain.json').then((m) => createTerrain(m.default as unknown as TerrainFile)).catch((err: unknown) => { console.error('terrain failed to load', err); return null; });
  const groundLoaded: Promise<Terrain | null> = terrainLoaded.then(async (field) => {
    // everything that stands on the ground is seated on the surface as drawn (the mesh), not on the DTM it approximates
    const terrain = field ? addTerrain(scene, field, { exclude: portalHole(tunnelMouths(data)), rails }).ground : null;
    parts.terrain = terrain;
    if (field) world.carve(field.extent);
    addPortals(scene, data, terrain ? { terrain } : {}); // Gasworks and Copenhagen tunnel mouths: cutting ends on the terrain, else wing walls and an earth bank on the flat plane
    if (!bare) {
      // Optional procedural landmarks have their own chunk, like King's Cross Central below.
      // cityLoaded still waits for their geometry; captures never race this lazy boundary.
      const { addLandmarks } = await import('./landmarks.ts');
      addLandmarks(scene, data, terrain ? { terrain } : {}); // each base on its lowest ground
    }
    return terrain;
  });
  // King's Cross Central (Coal Drops, Granary, gasholders, Crick, Library, Platform 37) rides in
  // the city's lazy load: its OSM boxes must be hidden before the city is built.
  const cityLoaded: Promise<void> = (bare ? groundLoaded.then(() => undefined)
    : Promise.all([groundLoaded, import('./data/kx-city.json'), import('./kxcentral.ts')]).then(([terrain, m, central]) => {
      for (const id of central.KXCENTRAL_OSM_IDS) hidden.add(id);
      // buildings, streets, paving, water and trees stand on the terrain as drawn; without one (?terrain=0, or it failed to load) on the flat plane
      const ground = terrain ? { terrain } : {};
      central.addKxCentral(scene, data, ground);
      parts.buildings = addCity(scene, data, m.default as unknown as CityData, { hidden, ...ground }).group;
    })).catch((err: unknown) => { console.error('city failed to load', err); });
  const shed = buildShed(layout);
  scene.add(shed);
  parts.shed = shed;
  if (station) scene.add(buildConcourse(canopy, station.pts, layout, data.buildings.filter(b => b.id === 46821177).map(b => b.pts)));

  scene.add(buildBufferStops(data, layout));
  void import('./ole.ts').then(({ buildOle }) => scene.add(buildOle(data, layout, tunnelMouths(data).map(m => m.origin)))).catch((err: unknown) => { console.error('OLE failed to load', err); });

  // Sample trains: four standing nose-in at the buffer stops, on tracks 1, 3, 5 and 7 (counting
  // from the west), so no two share a platform face and the evidence cameras can stand between them.
  // Explicit demo/none stay offline. The default draws samples immediately while one quiet
  // health probe decides whether a local relay is present. The local frame has the nose at z = 0 and the body
  // running to +z; turning by (PI - heading) sends +z to the shed's north, along the tracks.
  let settings: ReturnType<typeof trainSettings>;
  let settingsError = '';
  try { settings = trainSettings(params); }
  catch (error) { settings = { mode: 'none', date: '', speed: 1 }; settingsError = (error as Error).message; }
  const replayBundle = settings.mode === 'replay' ? params.get('replayBundle') : null;
  const trains: { kind: TrainKind; group: THREE.Group; noseWorld: [number, number, number]; headingRad: number; trackIndex?: number; description?: string }[] = [];
  const samples: THREE.Group[] = [];
  const sampleBoardTrains: BoardTrain[] = [];
  if (settings.mode === 'demo' || settings.mode === 'auto') {
    const stops = shedBufferStops(data, layout).sort((p, q) => worldToShed(layout, [p.x, p.z]).u - worldToShed(layout, [q.x, q.z]).u);
    const picks: [TrainKind, number][] = [['lner9', 1], ['lner5', 3], ['hull5', 5], ['lumo5', 7]];
    for (const [kind, trackIndex] of picks) {
      const stop = stops[trackIndex];
      if (!stop) continue;
      const group = buildTrain(kind);
      const nose = standTrain(group, layout, stop, NOSE_TO_STOP);
      scene.add(group);
      group.userData.id = sampleBoardTrains.length + 1; // the board's id for this sample, which the tooltip looks up
      samples.push(group);
      trains.push({ kind, group, noseWorld: nose, headingRad: layout.heading, trackIndex });
      // Match across the parallel shed tracks; longitudinal platform ends are staggered.
      const u = worldToShed(layout, [stop.x, stop.z]).u;
      const platform = [...stationPlatforms(data)].sort(([, p], [, q]) =>
        Math.abs(worldToShed(layout, platformSouthEnd(p.pts)).u - u) - Math.abs(worldToShed(layout, platformSouthEnd(q.pts)).u - u))[0]?.[0];
      // Hand-written sample descriptions, never presented as real train identities.
      sampleBoardTrains.push({ id: sampleBoardTrains.length + 1, description: `1S0${sampleBoardTrains.length + 1}`, samplePlatform: Number(platform) });
    }
  }

  for (const [ref, p] of stationPlatforms(data)) {
    const [x, z] = platformSouthEnd(p.pts);
    scene.add(platformSign(ref, [x, PLATFORM_HEIGHT + 3.1, z - 1.2]));
  }

  // Frame the camera on the platform heads of King's Cross, looking north-west from the south-east.
  const b = bounds(rails.main);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
  camera.position.set(cx + 250, 380, cz + 420);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(40, 0, -150);
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 8;
  controls.maxDistance = 3000;
  controls.update();

  const resize = (): void => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    resizeViewport(renderer, camera, w, h);
  };
  window.addEventListener('resize', resize);
  resize();

  // Time of day and weather (atmosphere.ts): the sun, the sky, the lamps and the ground follow the scene clock, and the weather follows
  // Open-Meteo (weather.ts). ?bare=1 and ?sky=ref keep the old fixed rig; ?time=<ISO instant> pins the clock and ?weather=<name> the
  // weather (no request), which is how the evidence shots stay repeatable. They are the same page, only pinned.
  const pinnedTimeMs = parseSceneTime(params.get('time'));
  const forcedWeather = params.get('weather');
  const fixedSky = (bare || params.get('sky') === 'ref') && pinnedTimeMs === null && forcedWeather === null;
  const replayDay = `${settings.date.slice(0, 4)}-${settings.date.slice(4, 6)}-${settings.date.slice(6, 8)}`;
  const weatherOptions = sceneWeatherOptions(forcedWeather, settings.mode === 'replay' ? replayDay : null);
  const lampPlan = furniture.userData.plan as FurniturePlan;
  const londonClimate = fixedSky ? null : createSceneWeather({ scene, world,
    sites: nightLightSites({ lamps: lampPlan.lamps, layout, canopy, footprint: station?.pts ?? [] }), weather: weatherOptions });
  const atmosphere = londonClimate?.atmosphere ?? null, weatherFeed = londonClimate?.feed ?? null;
  // The sun's shadow (lighting.ts) is London's; ?shadows=0 leaves it out. Every scene with a climate is drawn through the filmic grade (see the frame loop).
  const sunShadow = atmosphere && params.get('shadows') !== '0' ? createSunShadow(scene, world.lights.sun) : null;
  const ungraded = createUngradedScan();
  const replayNoonMs = Date.parse(`${replayDay}T12:00:00Z`);

  // `firstFrameMs` is performance.now() when the first frame was drawn: milliseconds since the
  // navigation began, which the evidence script reports as the time to first render.
  // `parts` lets the evidence script hide the shed and the surrounding blocks for a side-on view of a train
  let motion: ReturnType<typeof createMotion> | null = null;
  let liveTrains: ReturnType<typeof createLiveTrains> | null = null;
  let feed: TrainFeed | null = null;
  let timetable: ReturnType<typeof createScheduleFeed> | null = null;
  let mode: 'demo' | 'live' | 'replay' | 'none' = settings.mode === 'auto' ? 'demo' : settings.mode;
  let connection = settingsError || (settings.mode === 'auto' ? 'checking local relay' : mode === 'demo' || mode === 'none' ? 'offline' : 'loading anchors');
  let unmapped: number | null = null;
  let boardAnchors: AnchorMap = { area: 'Y9', sources: [], anchors: [], unmapped: [] };
  let arrivalSets = approachPlatforms(boardAnchors);
  const stationBoard = params.get('board') === '0' ? null : createBoard(document.body, status);
  const kx = { ready: true, scene, camera, controls, renderer, layout, trains, signals: signalLayer, parts, cityLoaded, firstFrameMs: 0,
    motion: null as ReturnType<typeof createMotion> | null, motionState: [] as TrainView[],
    boardRows: null as BoardRows | null,
    feed: { mode, connection, timeMs: 0, speed: settings.speed, date: settings.date } };
  // tools/evidence.mjs builds a Great Northern 387 for its close-up shot through this hook.
  Object.assign(kx, { evidenceBuildTrain: buildTrain, atmosphere, weatherFeed });
  const stPancras = createStPancrasLive({ scene, camera, parent: document.body, data,
    mode: settings.mode, date: settings.date, speed: settings.speed, hostname: location.hostname });
  const stations = createStations({ scene, camera, controls, renderer, ready: cityLoaded, data,
    attachEdinburgh: view => { view.live = createEdinburghLive({ geometry: view.geometry, scene: view.scene, camera, parent: document.body,
      mode: settings.mode, date: settings.date, speed: settings.speed, hostname: location.hostname });
      if (!fixedSky) view.climate = createWaverleyWeather(view, weatherOptions); },
    stationSuffix: id => (id === 'edinburgh-waverley' ? stations.edinburgh()?.climate : londonClimate)?.status(sceneClock(), timeNote) ?? '',
    stationStatus: id => id === 'st-pancras' && settings.mode !== 'demo' && settings.mode !== 'none' ? stPancras.status() : undefined,
    kxObjects: () => [...trains.map(t => t.group), ...(signalLayer?.signals().map(s => s.group) ?? [])] });
  Object.assign(kx, { stations, stPancras });
  const counts = `${data.rails.length} track sections · ${data.platforms.length} platforms · ${data.buildings.length} buildings`;
  const paintStatus = (): void => {
    const label = mode === 'replay' ? `replay of ${settings.date.slice(0, 4)}-${settings.date.slice(4, 6)}-${settings.date.slice(6, 8)} at ${settings.speed}x`
      : mode === 'live' ? 'live' : mode === 'demo' ? 'sample trains at the buffers, not live' : 'trains hidden';
    const signals = signalLayer?.counts() ?? { drawn: 0, decoded: 0 };
    const text = stations.statusText(`${counts} · ${label} · ${connection} · ${trains.length} trains shown · berths unmapped: ${unmapped ?? 'unavailable'} · signals: ${signals.drawn} drawn, ${signals.decoded} decoded`);
    if (status.textContent !== text) status.textContent = text;
    Object.assign(kx.feed, { mode, connection, timeMs: feed?.timeMs() ?? 0 });
  };
  let sampleTimeMs = 0, lastBoardFrame = -Infinity;
  const simNow = (): number => mode === 'demo' ? sampleTimeMs : mode === 'live' ? Date.now()
    : feed?.timeMs() ?? (stPancras.timeMs() || stations.edinburgh()?.live?.timeMs() || 0);
  Object.defineProperty(kx, 'simulationTimeMs', { get: simNow });
  // The scene clock the sun and the weather follow: now, or the recording's time in a replay (noon of its day until the feed has one), or ?time=.
  const sceneClock = (): number => pinnedTimeMs ?? (settings.mode === 'replay' ? ((stations.state().selected === 'edinburgh-waverley' ? stations.edinburgh()?.live?.timeMs() : feed?.timeMs()) || replayNoonMs) : Date.now());
  const timeNote = pinnedTimeMs !== null ? ' (time set by the page address)' : params.has('time') ? ' (time= ignored: not an ISO instant with a zone, or 13-digit epoch milliseconds)' : '';
  // Hover or tap a train for everything the page knows of it (tooltip.ts). ?tooltip=0 leaves it out.
  const tooltip = params.get('tooltip') === '0' ? null : createTrainTooltip({ parent: document.body, canvas: renderer.domElement, camera,
    groups: () => trains.map((t) => t.group),
    info: (group) => {
      const t = trains.find((x) => x.group === group);
      return t ? trainTip({ mode: mode === 'live' ? 'live' : mode === 'replay' ? 'replay' : 'sample', nowMs: simNow(), views: kx.motionState, rows: kx.boardRows,
        services: timetable?.services() }, group.userData.id as number | undefined, t.kind) : null;
    } });
  Object.assign(kx, { tooltip }); // a script can read the card's state and time tooltip.frame() in the page
  const paintBoard = (): void => {
    if (!stationBoard) return;
    kx.boardRows = boardRows(mode === 'demo' ? sampleBoardTrains : kx.motionState, boardAnchors, {
      mode: mode === 'demo' ? 'sample' : mode, nowMs: simNow(),
      previous: kx.boardRows ?? undefined, graph, arrivals: arrivalSets,
      services: timetable?.services(),
    });
    stationBoard.update(kx.boardRows);
  };
  let lastFrame: number | undefined;
  renderer.setAnimationLoop((time) => {
    resize(); // render at the actual host size even before a queued window.resize event
    const dt = lastFrame === undefined ? 0 : Math.max(0, (time - lastFrame) / 1000); lastFrame = time;
    feed?.advance(dt);
    stPancras.frame(dt, stations.state().selected === 'st-pancras', feed?.timeMs());
    if (mode === 'demo') sampleTimeMs += dt * 1000;
    if (motion && liveTrains) { kx.motionState = motion.trains(); liveTrains.update(kx.motionState); trains.splice(0, trains.length, ...liveTrains.trains()); }
    if (time - lastBoardFrame >= 250) { paintBoard(); lastBoardFrame = time; }
    stations.frame(time);
    stations.edinburgh()?.live?.frame(dt, stations.state().selected === 'edinburgh-waverley', feed?.timeMs() ?? (stPancras.timeMs() || undefined));
    controls.update();
    const climate = stations.activeScene() === scene ? londonClimate : stations.edinburgh()?.climate;
    if (climate) climate.update({ timeMs: sceneClock(), camera, target: controls.target, wallMs: time });
    else if (stations.activeScene() === scene) world.follow(camera);
    stations.refreshPresentation();
    paintStatus();
    // The scene on show, if it has a climate (London's, and Edinburgh's own once it has loaded), is lit by the daylight rig and so drawn through the
    // filmic grade at its own sun's exposure; London's also takes the sun's shadow. A scene with no climate (?bare=1, ?sky=ref, the placeholder)
    // keeps its fixed lights and no tone map. The unlit things (lines, points, sprites) are left out of the grade as they arrive.
    const shown = stations.activeScene();
    const sky = climate?.atmosphere.state() ?? null;
    if (climate && sky) {
      ungraded(shown);
      const toSun = climate.atmosphere.keyDirection();
      if (shown === scene && sunShadow && toSun) { sunShadow.tag(); sunShadow.update(camera, controls.target, toSun); }
    }
    grade(renderer, sky !== null, sky?.rig.exposure ?? 1);
    renderer.render(shown, camera);
    tooltip?.frame(); // after the render, so every matrix is this frame's
    if (kx.firstFrameMs === 0) kx.firstFrameMs = performance.now();
  });

  // the terrain and the city make their materials late: the wet and snowy ground picks them up when they have arrived
  void groundLoaded.then(() => atmosphere?.rescan());
  void cityLoaded.then(() => atmosphere?.rescan());
  (window as unknown as { __kx: unknown }).__kx = kx;
  paintStatus();
  paintBoard();
  if (signalLayer && replayBundle === null && relayReachable(location.hostname)) void signalLayer.loadTable().then(paintStatus);

  let disposed = false, bootstrapTimer: ReturnType<typeof setTimeout> | undefined;
  const setConnection = (value: string): void => {
    connection = value;
    if (value === 'connected') void timetable?.refresh();
    // A disconnected or invalid live stream cannot support a current aspect.
    if (!['connected', 'playing', 'recording ended'].includes(value)) signalLayer?.reset();
    paintStatus();
  };
  const begin = async (requested: 'live' | 'replay', attempt = 0): Promise<void> => {
    if (disposed) return;
    for (const sample of samples.splice(0)) {
      scene.remove(sample);
      sample.traverse((o) => { if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') o.geometry.dispose(); });
    }
    trains.splice(0);
    kx.boardRows = null;
    mode = requested; setConnection(attempt ? 'reconnecting; loading anchors' : 'loading anchors');
    try {
      const bundle = requested === 'replay' && replayBundle !== null
        ? await loadOfflineReplay(replayBundle, location.href, graph, `${settings.date.slice(0, 4)}-${settings.date.slice(4, 6)}-${settings.date.slice(6, 8)}`)
        : undefined;
      let anchors: AnchorMap;
      let recording: ReturnType<typeof parseRecording> | undefined = bundle?.recording;
      if (bundle) anchors = bundle.anchors;
      else {
        const response = await fetch('/relay/anchors', { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error('anchors unavailable');
        anchors = await response.json() as AnchorMap;
        if (!anchors || typeof anchors.area !== 'string' || !Array.isArray(anchors.anchors) || !Array.isArray(anchors.unmapped)) throw new Error('invalid anchors');
        if (requested === 'replay') {
          setConnection('loading recording');
          const replay = await fetch(`/relay/recording?date=${settings.date}`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
          if (!replay.ok) throw new Error('recording unavailable');
          recording = parseRecording(await replay.text());
          if (!recording.length) throw new Error('recording is empty');
        }
      }
      if (disposed) return;
      unmapped = anchors.unmapped.length;
      boardAnchors = anchors; arrivalSets = approachPlatforms(anchors);
      // Decoded berths with no OSM signal get a head at their anchor, marked inferred.
      signalLayer?.setAnchors(anchors, graph);
      // The model's coupling-inclusive length, rather than the core's approximate default.
      const trainKinds = createTrainKinds((description, atTime) => matchService(description, requested === 'live' ? Date.now() : atTime, timetable?.services() ?? []));
      motion = createMotion(graph, anchors, { lengthM: trainKinds.lengthM,
        wayMaxspeed: new Map(data.rails.filter((r) => r.maxspeed !== undefined).map((r) => [r.id, r.maxspeed!])) });
      kx.motion = motion;
      liveTrains = createLiveTrains(graph, scene, trainKinds.kindFor);
      timetable?.dispose();
      timetable = createScheduleFeed({ mode: requested, hostname: bundle ? 'localhost' : location.hostname,
        ...(bundle ? { relayPresent: true, fetchImpl: bundle.fetchSchedule } : {}),
        date: requested === 'replay' ? `${settings.date.slice(0, 4)}-${settings.date.slice(4, 6)}-${settings.date.slice(6, 8)}` : undefined,
        onChange: () => paintBoard() });
      await timetable.refresh();
      if (disposed) return;
      const sink: MotionSink = {
        advance: (seconds) => motion!.advance(seconds),
        apply: (event, nowMs, observedAtMs) => {
          motion!.apply(event, nowMs, observedAtMs); signalLayer?.apply({ t: nowMs, e: event });
          if (event.kind === 'trust') timetable?.apply(event, nowMs);
        },
      };
      feed = requested === 'replay' ? createReplayFeed(recording!, settings.speed, sink, setConnection) : createLiveFeed(sink, setConnection);
    } catch (error) {
      if (disposed) return;
      if (replayBundle !== null && requested === 'replay') {
        setConnection(`replay bundle unavailable: ${(error as Error).message}`);
        return;
      }
      const delay = backoffMs(attempt);
      setConnection(`${(error as Error).message}; reconnecting in ${delay / 1000}s`);
      bootstrapTimer = setTimeout(() => { void begin(requested, attempt + 1); }, delay);
    }
  };
  if (settings.mode === 'auto' && !relayReachable(location.hostname)) setConnection('relay absent');
  else if (settings.mode === 'auto') {
    void probeRelay().then((present) => { if (!disposed) { if (present) void begin('live'); else setConnection('relay absent'); } });
  } else if (settings.mode === 'live' || settings.mode === 'replay') void begin(settings.mode);
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    disposed = true; if (bootstrapTimer !== undefined) clearTimeout(bootstrapTimer);
    stations.dispose();
    stPancras.dispose();
    feed?.dispose(); timetable?.dispose(); liveTrains?.dispose(); signalLayer?.dispose(); stationBoard?.dispose(); tooltip?.dispose();
    sunShadow?.dispose(); londonClimate?.dispose();
  }, { once: true });
}
