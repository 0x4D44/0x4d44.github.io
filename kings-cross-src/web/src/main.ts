import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bounds, buildingPrisms, PLATFORM_HEIGHT, platformPrisms, railSegments, ribbonTriangles, twinRails } from '../../core/scene.ts';
import type { Prism } from '../../core/scene.ts';
import { buildingsUnderStation, concourseCanopy, platformSouthEnd, shedBufferStops, shedLayout, stationBuilding, stationPlatforms, worldToShed } from '../../core/station.ts';
import type { KxData } from '../../core/osm.ts';
import type { TrainKind } from '../../core/train.ts';
import type { AnchorMap } from '../../core/anchors.ts';
import { buildGraph } from '../../core/graph.ts';
import { createMotion } from '../../core/motion.ts';
import type { TrainView } from '../../core/motion.ts';
import { buildConcourse } from './concourse.ts';
import { platformSign } from './labels.ts';
import { buildShed } from './shed.ts';
import { buildTrain, standTrain } from './train.ts';
import { backoffMs, createLiveFeed, createReplayFeed, parseRecording, probeRelay, trainSettings } from './feed.ts';
import type { TrainFeed } from './feed.ts';
import { createLiveTrains, lengthForDescription } from './trains-live.ts';
import { addWorld } from './world.ts';
import trackData from './data/kx-track.json';

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

/** Extrude a footprint upward: shape in (x, -z) so that after rotateX(-90deg) it lies on the XZ plane. */
function prismGeometry(p: Prism): THREE.BufferGeometry {
  const shape = new THREE.Shape(p.outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: p.height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

function mergedPrisms(prisms: Prism[], material: THREE.Material): THREE.Mesh | null {
  const geos = prisms.map(prismGeometry);
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged ? new THREE.Mesh(merged, material) : null;
}

function lines(positions: number[], color: number, opacity = 1): THREE.LineSegments {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

function triangles(positions: number[], material: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

/** The outline of each footprint as line segments at height y (the yellow platform edge). */
function outlineSegments(prisms: Prism[], y: number): number[] {
  const out: number[] = [];
  for (const p of prisms) {
    for (let i = 0; i < p.outline.length; i++) {
      const a = p.outline[i] as [number, number];
      const b = p.outline[(i + 1) % p.outline.length] as [number, number];
      out.push(a[0], y, a[1], b[0], y, b[1]);
    }
  }
  return out;
}

function start(): void {
  const params = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const world = addWorld(scene, { grid: params.has('grid') || params.has('bare'), bare: params.has('bare') });

  const rails = railSegments(data);
  const ballast = new THREE.MeshLambertMaterial({ color: 0x4b463f });
  scene.add(triangles(ribbonTriangles(rails.main, 3.2, 0.03), ballast));
  scene.add(triangles(ribbonTriangles(rails.siding, 3.0, 0.03), ballast));
  scene.add(lines(twinRails(rails.main), 0xd5dae2));
  scene.add(lines(twinRails(rails.siding), 0x9a9486));
  scene.add(lines(rails.tunnel, 0x5b6b86, 0.7));

  const platPrisms = platformPrisms(data);
  const platforms = mergedPrisms(platPrisms, new THREE.MeshLambertMaterial({ color: 0xa7b0be }));
  if (platforms) scene.add(platforms);
  scene.add(lines(outlineSegments(platPrisms, PLATFORM_HEIGHT + 0.02), 0xe9d25a));

  // The station footprint is a roof, not a block: skip it as a building and build the shed. So are
  // the blocks that would stand inside the concourse dome or against the south front.
  const station = stationBuilding(data);
  const layout = shedLayout(data);
  const canopy = concourseCanopy(data);
  const hidden = new Set(buildingsUnderStation(data, layout, canopy));
  if (station) hidden.add(station.id);
  const buildings = mergedPrisms(buildingPrisms(data, hidden), new THREE.MeshLambertMaterial({ color: 0x56627a }));
  // ?bare=1 hides the surrounding buildings, so the evidence shots can measure the shed and platforms.
  if (buildings && !params.has('bare')) scene.add(buildings);
  const shed = buildShed(layout);
  scene.add(shed);
  if (station) scene.add(buildConcourse(canopy, station.pts, layout));

  // buffer stops: a red block across each terminating track, turned with the platforms
  const stopMaterial = new THREE.MeshLambertMaterial({ color: 0xa83232 });
  for (const b of shedBufferStops(data, layout)) {
    const stop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 0.7), stopMaterial);
    stop.position.set(b.x, 0.58, b.z);
    stop.rotation.y = -layout.heading;
    scene.add(stop);
  }

  // Sample trains: four standing nose-in at the buffer stops, on tracks 1, 3, 5 and 7 (counting
  // from the west), so no two share a platform face and the evidence cameras can stand between them.
  // Explicit demo/none stay offline. The default draws samples immediately while one quiet
  // health probe decides whether a local relay is present. The local frame has the nose at z = 0 and the body
  // running to +z; turning by (PI - heading) sends +z to the shed's north, along the tracks.
  let settings: ReturnType<typeof trainSettings>;
  let settingsError = '';
  try { settings = trainSettings(params); }
  catch (error) { settings = { mode: 'none', date: '', speed: 1 }; settingsError = (error as Error).message; }
  const trains: { kind: TrainKind; group: THREE.Group; noseWorld: [number, number, number]; headingRad: number; trackIndex?: number; description?: string }[] = [];
  const samples: THREE.Group[] = [];
  if (settings.mode === 'demo' || settings.mode === 'auto') {
    const stops = shedBufferStops(data, layout).sort((p, q) => worldToShed(layout, [p.x, p.z]).u - worldToShed(layout, [q.x, q.z]).u);
    const picks: [TrainKind, number][] = [['lner9', 1], ['lner5', 3], ['hull5', 5], ['lumo5', 7]];
    for (const [kind, trackIndex] of picks) {
      const stop = stops[trackIndex];
      if (!stop) continue;
      const group = buildTrain(kind);
      const nose = standTrain(group, layout, stop, NOSE_TO_STOP);
      scene.add(group);
      samples.push(group);
      trains.push({ kind, group, noseWorld: nose, headingRad: layout.heading, trackIndex });
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
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // `firstFrameMs` is performance.now() when the first frame was drawn: milliseconds since the
  // navigation began, which the evidence script reports as the time to first render.
  // `parts` lets the evidence script hide the shed and the surrounding blocks for a side-on view of a train
  const graph = buildGraph(data);
  let motion: ReturnType<typeof createMotion> | null = null;
  let liveTrains: ReturnType<typeof createLiveTrains> | null = null;
  let feed: TrainFeed | null = null;
  let mode: 'demo' | 'live' | 'replay' | 'none' = settings.mode === 'auto' ? 'demo' : settings.mode;
  let connection = settingsError || (settings.mode === 'auto' ? 'checking local relay' : mode === 'demo' || mode === 'none' ? 'offline' : 'loading anchors');
  let unmapped: number | null = null;
  const kx = { ready: true, scene, camera, controls, renderer, layout, trains, parts: { shed, buildings }, firstFrameMs: 0,
    motion: null as ReturnType<typeof createMotion> | null, motionState: [] as TrainView[],
    feed: { mode, connection, timeMs: 0, speed: settings.speed, date: settings.date } };
  const counts = `${data.rails.length} track sections · ${data.platforms.length} platforms · ${data.buildings.length} buildings`;
  const paintStatus = (): void => {
    const label = mode === 'replay' ? `replay of ${settings.date.slice(0, 4)}-${settings.date.slice(4, 6)}-${settings.date.slice(6, 8)} at ${settings.speed}x`
      : mode === 'live' ? 'live' : mode === 'demo' ? 'sample trains at the buffers, not live' : 'trains hidden';
    const text = `${counts} · ${label} · ${connection} · ${trains.length} trains shown · berths unmapped: ${unmapped ?? 'unavailable'}`;
    if (status.textContent !== text) status.textContent = text;
    Object.assign(kx.feed, { mode, connection, timeMs: feed?.timeMs() ?? 0 });
  };
  let lastFrame: number | undefined;
  renderer.setAnimationLoop((time) => {
    const dt = lastFrame === undefined ? 0 : Math.max(0, (time - lastFrame) / 1000); lastFrame = time;
    feed?.advance(dt);
    if (motion && liveTrains) { kx.motionState = motion.trains(); liveTrains.update(kx.motionState); trains.splice(0, trains.length, ...liveTrains.trains()); }
    paintStatus();
    controls.update();
    world.follow(camera);
    renderer.render(scene, camera);
    if (kx.firstFrameMs === 0) kx.firstFrameMs = performance.now();
  });

  (window as unknown as { __kx: unknown }).__kx = kx;
  paintStatus();

  let disposed = false, bootstrapTimer: ReturnType<typeof setTimeout> | undefined;
  const setConnection = (value: string): void => { connection = value; paintStatus(); };
  const begin = async (requested: 'live' | 'replay', attempt = 0): Promise<void> => {
    if (disposed) return;
    for (const sample of samples.splice(0)) {
      scene.remove(sample);
      sample.traverse((o) => { if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') o.geometry.dispose(); });
    }
    trains.splice(0);
    mode = requested; setConnection(attempt ? 'reconnecting; loading anchors' : 'loading anchors');
    try {
      const response = await fetch('/relay/anchors', { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error('anchors unavailable');
      const anchors = await response.json() as AnchorMap;
      if (!anchors || typeof anchors.area !== 'string' || !Array.isArray(anchors.anchors) || !Array.isArray(anchors.unmapped)) throw new Error('invalid anchors');
      let recording: ReturnType<typeof parseRecording> | undefined;
      if (requested === 'replay') {
        setConnection('loading recording');
        const replay = await fetch(`/relay/recording?date=${settings.date}`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
        if (!replay.ok) throw new Error('recording unavailable');
        recording = parseRecording(await replay.text());
        if (!recording.length) throw new Error('recording is empty');
      }
      if (disposed) return;
      unmapped = anchors.unmapped.length;
      // The model's coupling-inclusive length, rather than the core's approximate default.
      motion = createMotion(graph, anchors, { lengthM: lengthForDescription,
        wayMaxspeed: new Map(data.rails.filter((r) => r.maxspeed !== undefined).map((r) => [r.id, r.maxspeed!])) });
      kx.motion = motion;
      liveTrains = createLiveTrains(graph, scene);
      feed = requested === 'replay' ? createReplayFeed(recording!, settings.speed, motion, setConnection) : createLiveFeed(motion, setConnection);
    } catch (error) {
      if (disposed) return;
      const delay = backoffMs(attempt);
      setConnection(`${(error as Error).message}; reconnecting in ${delay / 1000}s`);
      bootstrapTimer = setTimeout(() => { void begin(requested, attempt + 1); }, delay);
    }
  };
  if (settings.mode === 'auto') {
    void probeRelay().then((present) => { if (!disposed) { if (present) void begin('live'); else setConnection('relay absent'); } });
  } else if (settings.mode === 'live' || settings.mode === 'replay') void begin(settings.mode);
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    disposed = true; if (bootstrapTimer !== undefined) clearTimeout(bootstrapTimer);
    feed?.dispose(); liveTrains?.dispose();
  }, { once: true });
}
