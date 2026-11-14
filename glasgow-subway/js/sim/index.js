// Glasgow Subway driver simulator + station walker. ES module, no bundler.
// Exports startSim(ctx) / simAvailable() per SPEC. See NOTES-A5.md.
import { Track } from './track.js';
import { Service, baselineRunTimes } from './service.js';
import { stockFrom, notchToCmd } from './dynamics.js';
import { buildSchedule, DIFFICULTY } from './rules.js';
import { KMH, clamp, wrapL, fmtDist, fmtTime, mulberry32 } from './util.js';
import { loadTrainTemplate, TrainView, ledTailLamps } from './trainview.js';
import { loadTunnelTemplate, TunnelView } from './tunnelview.js';
import { buildStation, placeStation, stationHalfLength, PY } from './stationview.js';
import { Walker } from './walker.js';
import { Crowd, AnimCrowd } from './people.js';
import { SimAudio, reach, panOf } from './audio.js';
import { Tms } from './tms.js';
import { Hud, HELP_HTML } from './hud.js';
import { buildStreet } from './street.js';
import { loadAdvertAtlas, applyAdverts, trackWallAdverts } from './adverts.js';
import { fitTrainAdverts } from './carcards.js';
import { layoutFor, loadGLB, disposeTemplate, lookHints, fixHallSigns, frontFaceSigns, stripIslandFurniture, measureHallWalls, HALL_FULL } from './hall.js';
import { cutStairHoles } from './stairs.js';
import { Rats } from './rats.js';
import { Fleet, measureCycle, advanceToLap } from './fleet.js';
import { peopleVariants } from './kit.js';

// Explore-mode shuttle timing (shared by both circles; the platform indicator boards and the HUD count down to the same clock)
const ARRIVE_S = 31;    // seconds from a train appearing 220 m out to standing in the platform (measured: 30.7-31.3 s at every station)
const CLEAR_TAIL = 130;  // a departed train keeps running until its tail is this far (m) past the station centre and only then is recycled. The fog (FogExp2 0.026) decides the figure: at 70 m the tail was ~50 m from someone at the platform end, where 18 % of it still shows, and it was seen to vanish; at 130 m it is over 100 m away (under 0.1 %)

export function simAvailable() {
  try { return typeof WebGLRenderingContext !== 'undefined' && typeof document !== 'undefined'; } catch (e) { return false; }
}

export async function startSim(ctx) {
  if (ctx && ctx.mode === 'walk') ctx = Object.assign({}, ctx, { mode: 'explore' });
  const sim = new Sim(ctx);
  await sim.init();
  return sim.handle;
}


class Sim {
  constructor(ctx) {
    this.ctx = ctx; this.THREE = ctx.THREE; this.renderer = ctx.renderer; this.canvas = ctx.canvas;
    this.subway = ctx.subway; this.terrain = ctx.terrain; this.base = ctx.assetBase || './';
    this.stations = this.subway.stations; this.stationIdx = new Map(this.stations.map((s, i) => [s.id, i]));
    this.stock = stockFrom(this.subway.rollingStock);
    this.mode = null; this.paused = false; this.disposed = false; this.look = { yaw: 0, pitch: 0 };
    this.mouse = { sens: 1, invertY: false }; try { const m = JSON.parse(localStorage.getItem('gs.mouse') || 'null'); if (m) this.mouse = { sens: Math.min(3, Math.max(0.3, +m.sens || 1)), invertY: !!m.invertY }; } catch (_) {}
    this.keys = new Set(); this.line = ctx.line === 'inner' ? 'inner' : 'outer'; this.diffId = ctx.difficulty || 'standard';
    this.sel = { mode: ctx.mode || 'drive', station: ctx.startStation || this.stations[0].id, line: this.line, diff: this.diffId };
    this.tracks = {}; this.stationViews = new Map(); this.time = 0; this.alightNext = false;
    this.shuttle = { state: 'none', t: 0, idx: 0 };
    this.fleet = null; this.fleetKey = null; this.fleetSeed = ctx.fleetSeed != null ? ctx.fleetSeed : (Math.random() * 1e9) >>> 0;   // the numbered units (fleet.js)
    this.fadeLock = false; this.timeScale = 1; this.ctxKind = 'train'; this.bobT = 0;
    this._v = {}; this.errors = [];
  }

  url(p) { return new URL(this.base + p, location.href).href; }

  async init() {
    const THREE = this.THREE, r = this.renderer;
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    this.GLTFLoader = GLTFLoader;
    this.saved = { clear: r.getClearColor(new THREE.Color()), alpha: r.getClearAlpha(), tm: r.toneMapping, exp: r.toneMappingExposure };
    // people: the simplified people_lod.glb (~13 MB) now, the full-detail people.glb (~26 MB) streamed in once the station is drawn (_streamFullPeople)
    const [trainTpl, tunTpl, kitTpl, kioskTpl, peopleLodTpl, vaultTpl, sigWallTpl, boardsTpl] = await Promise.all([
      loadTrainTemplate(THREE, GLTFLoader, this.url('models/train.glb')),
      loadTunnelTemplate(THREE, GLTFLoader, this.url('models/tunnel_segment.glb')),
      this._opt('models/station_kit.glb'), this._opt('models/entrance_kiosk.glb'), this._optG('models/people_lod.glb'),  this._opt('models/tunnel_station_vault.glb'), this._opt('models/signal_wall.glb'), this._opt('models/signal_boards.glb'),
    ]);
    this.hallIndex = await this._json('models/stations_index.json');
    const looksJ = await this._json('data/station_looks.json');
    this.looks = new Map(((looksJ && looksJ.stations) || []).map((x) => [x.id, x]));
    this.walkable = await this._json('models/train_walkable.json');
    this.halls = new Map(); this.hallLoading = new Map(); this.hallFailed = new Set(); this.entrances = new Map();
    this.kit = kitTpl; this.vaultTpl = vaultTpl; this.kioskTpl = kioskTpl; try { frontFaceSigns(kioskTpl); } catch (e) {} this.peopleVariants = null;
    this.peopleLod = peopleLodTpl; this.peopleGltf = peopleLodTpl ? null : await this._optG('models/people.glb');   // (no LOD file: the full one, before the first frame, as before)
    { const pm = await this._json('models/people_meta.json'); this.peopleMeta = null; if (pm && pm.people) { this.peopleMeta = {}; for (const q of pm.people) this.peopleMeta[q.id] = q; } for (const t of [this.peopleLod, this.peopleGltf]) if (t) t.meta = this.peopleMeta; } this.sigWallTpl = sigWallTpl; this.boardsTpl = boardsTpl;
    try { const SU = await import('three/addons/utils/SkeletonUtils.js'); this.SU = SU; } catch (e) { console.warn('[sim] SkeletonUtils unavailable', e && e.message); this.SU = null; }
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x050506);
    this.scene.fog = new THREE.FogExp2(0x0a0a0c, 0.026);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
    this.ambient = new THREE.AmbientLight(0x8a7a66, 2.6); this.scene.add(this.ambient);
    this.quality = this._detectQuality();
    this.savedPR = r.getPixelRatio();
    try { r.setPixelRatio(this.quality === 'low' ? Math.min(devicePixelRatio || 1, 1) : Math.min(devicePixelRatio || 1, 2)); } catch (e) {}
    this.tunnel = new TunnelView(THREE, tunTpl, this.scene, { quality: this.quality });
    try { frontFaceSigns(trainTpl.scene, /^route_map_panel$/); } catch (e) {}   // exterior roundels: never mirrored from behind
    try { ledTailLamps(THREE, trainTpl.scene); } catch (e) {}   // tail lamps: LED red, not tone-mapped pink
    this.trainTpl = trainTpl; this.views = {};
    this.trainView = new TrainView(THREE, trainTpl.scene, {}); this.views[this.line] = this.trainView; this.trainView.line = this.line;
    this.scene.add(this.trainView.root);
    { const tv = this.trainView, ln = this.line; this._advertAtlas().then((a) => fitTrainAdverts(THREE, tv, a, ln)).catch((e) => console.warn('[sim] train adverts', e)); }
    this.trainView.computeHeadroom(PY); if (this.walkable) this.trainView.setWalkable(this.walkable);
    this.trainLen = this.trainView.length; this.stock.lengthM = this.trainLen; this.doorZ = this.trainView.doorZ.length ? this.trainView.doorZ : [-8.15, -3.65, 3.65, 8.15];
    this.tms = new Tms(THREE); this.tms.attach(this.trainView); this.trainView.buildCab(this.tms.tex, this.tms.tex2); this.trainView.setDest(this.line === 'outer' ? 'OUTER CIRCLE' : 'INNER CIRCLE');
    this.headlight = new THREE.SpotLight(0xfff2d0, 160, 90, 0.7, 0.6, 1.1); this.scene.add(this.headlight, this.headlight.target);
    // the shaft: what gets out of the bore mouth into a station ahead. Lights are not shadowed, so the wide beam above is cut off at the portal instead (see _headlight)
    this.headShaft = new THREE.SpotLight(0xfff2d0, 0, 90, 0.1, 0.35, 1.1); this.scene.add(this.headShaft, this.headShaft.target);
    this.cabLight = new THREE.PointLight(0xdfe8ff, 1, 5, 1.5); this.scene.add(this.cabLight);
    // the saloon's own two lamps ride with the player's train. They are NOT in the pool below: sharing it, an arriving train took two of the nearest station lamps' places and the
    // station's lighting changed while it stood there
    this.saloonLights = [-5, 5].map(() => { const l = new THREE.PointLight(0xfff4e0, 0, 8, 1.4); this.scene.add(l); return l; });
    this.poolLights = []; for (let i = 0; i < (this.quality === 'low' ? 3 : 5); i++) { const l = new THREE.PointLight(0xffe3b0, 0, 28, 1.4); this.scene.add(l); this.poolLights.push(l); }
    { const lowQ = this.quality === 'low', ok = this._peopleOk();
      this.crowd = ok ? new AnimCrowd(THREE, this.SU, this.peopleGltf, lowQ ? 14 : 36, this.quality, this.peopleLod) : new Crowd(THREE, lowQ ? 28 : 110, null);
      this.trainView.saloon = this._makeSaloon(); this.trainView.saloonDone = false;   // (each circle's train carries its own riders: see _populateSaloon)
      this.scene.add(this.crowd.group); }
    this.rats = new Rats(THREE); this.rats.onEvent = (kind, r) => this._ratEvent(kind, r);
    this.sigMesh = this._makeSignal(); this.scene.add(this.sigMesh.group);
    this.walker = new Walker();
    this.audio = new SimAudio();
    this.hud = new Hud(this.ctx.container, {
      onAction: (a, el) => this.action(a, el), onLever: (n) => { if (this.mode === 'drive') { this.svc.setLever(n); this.audio.start(); } },
      doorSel: () => (this.svc ? this.svc.doorSel : 1), hints: () => this.svc && this.svc.diff.hints, onModal: (open) => { this._modalOpen = open; if (open) this._releaseLock(); },
    });
    this._bindInput();
    this.trainView.root.visible = true;
    this.setupLine(this.line);
    this.handle = {
      dispose: () => this.dispose(), pause: (b) => { this.paused = !!b; }, getState: () => this.getState(),
    };
    this._exposeHooks();
    this._resize(); addEventListener('resize', this._onResize = () => this._resize());
    this.lastNow = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
    this.peopleFull = this._streamFullPeople();
    if (this.ctx.mode || this.ctx.startStation) this.go({ mode: this.ctx.mode || 'drive', station: this.sel.station, line: this.line, diff: this.diffId });
    else this.openMenu('start');
  }

  _detectQuality() {
    const q = this.ctx.quality; if (q === 'low' || q === 'high') return q;
    try {
      const coarse = matchMedia('(pointer:coarse)').matches, small = Math.min(innerWidth, innerHeight) < 600;
      const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
      return coarse || small || weak ? 'low' : 'high';
    } catch (e) { return 'high'; }
  }

  async _json(path) { try { const r = await fetch(this.url(path)); return r.ok ? await r.json() : null; } catch (e) { return null; } }

  _peopleOk() { const g = this.peopleGltf || this.peopleLod; return !!(this.SU && g && g.animations && g.animations.length); }
  /** people.glb, fetched after the first frame of a station (and any hall still loading), so it does not hold up the drawing or share the line with it; then handed
   *  to every crowd (the platform's and each train's riders), whose nearest people swap up to it a couple a frame. Resolves true once attached (the tools wait on it). */
  async _streamFullPeople() {
    if (this.peopleGltf || !this.peopleLod || !this.SU) return !!this.peopleGltf;
    await new Promise((res) => { this._onStationFrame = res; setTimeout(res, 12000); });
    this._onStationFrame = null;
    await Promise.race([Promise.allSettled([...this.hallLoading.values()]), new Promise((r) => setTimeout(r, 8000))]);
    const g = this.disposed ? null : await this._optG('models/people.glb'); if (!g || this.disposed) return false;
    g.meta = this.peopleMeta; this.peopleGltf = g;
    const crowds = [this.crowd, ...Object.values(this.views || {}).map((tv) => tv && tv.saloon)].filter((c) => c && c.attachFull);
    for (const c of crowds) { try { c.attachFull(g); } catch (e) { console.warn('[sim] people.glb attach', e); } }
    return true;
  }

  async _optG(path) {
    try { return await new Promise((res, rej) => new this.GLTFLoader().load(this.url(path), res, undefined, rej)); } catch (e) { console.warn('[sim] optional model missing', path); return null; }
  }
  /** Seated / standing passengers riding in one train's saloons (parented to the car groups so they move with the train). Both circles' trains carry their own riders:
   *  the player's train and the other circle's train (the one on the far side of an island platform) alike. */
  _populateSaloon(tv = this.trainView, maxCars = 99) {   // (a few cars per call: seating a whole train is a ~0.2-0.4 s stall the first time)
    const sc = tv.saloon, W = this.walkable; if (!sc || !sc.hasAnim) { tv.saloonDone = true; return; }
    if (!tv.saloonJob) { const inner = tv.line === 'inner', k = (tv.trip || 0) * 977; sc.rng = mulberry32((inner ? 1234 : 99) + k); tv.saloonJob = { rng: mulberry32((inner ? 11 : 5) + k), car: 0 }; tv.saloonObstacles = []; tv.seatMap = []; if (tv.load == null) tv.load = this._loadOf(tv); }   // a different cast on each circle
    const job = tv.saloonJob, rng = job.rng, PYf = PY, seatX = 0.74, obstacles = tv.saloonObstacles;
    const ceilAt = (x) => PYf + Math.min(tv.headroomAt(Math.abs(x)), tv.headroomMeasured ? tv.headroomMeasured(Math.abs(x)) : 9);
    for (let n = 0; n < maxCars && job.car < tv.cars.length; n++) {
      const ci = job.car++, car = tv.cars[ci], info = tv.carInfo[ci], wc = W && W.cars && W.cars[ci], doors = tv.doorZ.map((z) => z - info.zc).filter((z) => Math.abs(z) < info.len / 2 + 1);
      const ranges = (wc && wc.benchZRanges ? wc.benchZRanges : [[info.zc - info.len / 2 + 1.6, info.zc + info.len / 2 - 1.6]]).map(([a, b]) => [a - info.zc, b - info.zc]);
      const seatY = tv.seatTopY ? tv.seatTopY(ci, seatX) : PYf + 0.43, slots = [], load = tv.load, low = this.quality === 'low';
      for (const [a, b] of ranges) for (let z = a + 0.35; z <= b - 0.3; z += 0.55) for (const sx of [-1, 1]) {
        if (doors.some((d) => Math.abs(z - d) < 0.9)) continue;
        const st = { x: sx * seatX, y: PYf, z, yaw: sx * Math.PI / 2, seatY, mode: 'sit', ceilAt, ci, p: null }; st.seatRef = st; slots.push(st); tv.seatMap.push(st);   // every seat of the car: who is on it is kept, so that boarders can find a free one
      }
      // every car gets an even share of the crowd (the head cars must not use the budget up before the tail car is reached), seated at random along the car
      const nStand = low ? 1 : load > 0.9 ? 3 + Math.round((load - 0.9) * 14) : load > 0.4 ? 2 : 1, gapS = load > 0.9 ? 0.62 : 0.9, standing = [], share = Math.round(sc.max * (ci + 1) / tv.cars.length) - Math.round(sc.max * ci / tv.cars.length);
      for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)), t = slots[i]; slots[i] = slots[j]; slots[j] = t; }
      const seated = slots.slice(0, Math.max(1, Math.min(share - nStand, Math.round(Math.min(1, load) * slots.length))));
      for (let k = 0; k < nStand * 8 && standing.length < nStand; k++) {
        const busy = load > 0.9, z = (ranges[0][0] + rng() * (ranges[ranges.length - 1][1] - ranges[0][0])), sx = rng() < 0.5 ? -1 : 1, x = sx * (busy ? 0.04 + rng() * 0.1 : 0.14 + rng() * 0.16);
        if (doors.some((d) => Math.abs(z - d) < 1.1) || standing.some((q) => Math.abs(q.z - z) < gapS) || (!busy && seated.some((q) => Math.sign(q.x) === sx && Math.abs(q.z - z) < 0.75))) continue;
        standing.push({ x, y: PYf, z, yaw: rng() * 6.28, mode: rng() < 0.55 ? 'pole' : 'stand', ceilAt });
      }
      for (const q of sc.seat(car, seated.concat(standing))) if (q.seatRef) q.seatRef.p = q;
    }
    this._saloonObs(tv);
    if (job.car >= tv.cars.length) { tv.saloonDone = true; tv.saloonJob = null; }
  }
  /** the standing riders of a train are things the walker goes round (soft: it slides round a rider rather than sticking); rebuilt whenever someone gets up, sits down, gets on or off */
  _saloonObs(tv) {
    const sc = tv.saloon, out = []; if (!sc) return;
    for (const q of sc.people) { if (!q.obj || q.state === 'sit') continue; const ci = tv.cars.indexOf(q.parent); if (ci < 0) continue; const zc = tv.carInfo[ci].zc; out.push({ x0: q.x - 0.17, x1: q.x + 0.17, z0: q.z + zc - 0.17, z1: q.z + zc + 0.17, y: PY, tall: true, soft: true }); }
    tv.saloonObstacles = out; if (this.ctxKind === 'train' && tv === this.trainView) this.walker.obstacles = out;
  }
  /** how full a train is, 0.12 (a few people) to 1.12 (every seat taken and people standing): each unit has its own, and it changes from one trip to the next */
  _loadOf(tv) { const rec = this.tracks && this.tracks[tv.line], u = mulberry32(((rec && rec.unit) || 7) * 7919 + (tv.trip || 0) * 104729 + 13)(); return 0.12 + u; }
  /** a train coming round again arrives with other people aboard */
  _refillSaloon(tv) { const sc = tv && tv.saloon; if (!sc) return; sc.clear(); tv.trip = (tv.trip || 0) + 1; tv.load = null; tv.saloonDone = false; tv.saloonJob = null; tv.seatMap = []; tv.saloonSlow = true; this._saloonObs(tv); }
  _carToCrowd(car, x, z, yaw = 0) {
    const T = this.THREE, v = this._xv || (this._xv = new T.Vector3()), m = this._xm || (this._xm = new T.Matrix4()), g = this.crowd.group; car.updateWorldMatrix(true, false); g.updateWorldMatrix(true, false); m.copy(g.matrixWorld).invert();
    v.set(x, 0, z).applyMatrix4(car.matrixWorld).applyMatrix4(m); const X = v.x, Z = v.z; v.set(-Math.sin(yaw), 0, -Math.cos(yaw)).transformDirection(car.matrixWorld).transformDirection(m);
    return { x: X, z: Z, yaw: Math.atan2(-v.x, -v.z) };
  }
  _crowdToCar(car, x, z, yaw = 0) {
    const T = this.THREE, v = this._xv || (this._xv = new T.Vector3()), m = this._xm || (this._xm = new T.Matrix4()), g = this.crowd.group; car.updateWorldMatrix(true, false); g.updateWorldMatrix(true, false); m.copy(car.matrixWorld).invert();
    v.set(x, 0, z).applyMatrix4(g.matrixWorld).applyMatrix4(m); const X = v.x, Z = v.z; v.set(-Math.sin(yaw), 0, -Math.cos(yaw)).transformDirection(g.matrixWorld).transformDirection(m);
    return { x: X, z: Z, yaw: Math.atan2(-v.x, -v.z) };
  }
  /** Passengers getting off and on the player's train at the platform it serves. Riders who get off here stand up from their seats as the train runs in (those already standing
   *  just wait), and when the doors open they walk out through the nearest doorway to the stairs, one after another. People waiting on the platform and coming down the stairs walk
   *  in through a door, along the aisle to a free seat, and sit down (or stand, when every seat is taken). A person keeps their looks through it: the rider in the train and the
   *  walker on the platform are one character, handed between the train's crowd and the platform's (people.js take / walkOn / rise / settle). */
  _exchange(dt) {
    const tv = this.trainView, sc = tv && tv.saloon, svc = this.svc, v = this.crowdFor, X = this._xch || (this._xch = { state: 'idle', leavers: [] });
    const live = !!(sc && sc.hasAnim && tv.saloonDone && v && this.crowd.walkOn && tv.root.visible && (this.mode === 'explore' || this.mode === 'ride') && Math.abs(this._trainCentreZl() - this._stopCentreZl()) < 45);
    if (!live) { if (X.state === 'open' && this.crowd.setBays) this.crowd.setBays([]); if (X.state !== 'idle') { for (const L of X.leavers) L.p.leaving = false; X.leavers = []; X.state = 'idle'; } return; }
    const inf = v.info, low = this.quality === 'low', atStop = svc.phase === 'station', off = Math.abs(this._trainCentreZl() - this._stopCentreZl());
    const doorsOf = (ci) => { const i = tv.carInfo[ci]; return this.doorZ.map((z) => z - i.zc).filter((z) => Math.abs(z) < i.len / 2 + 0.2); };
    if (X.state === 'idle' && svc.phase === 'run' && svc.distToStop < 30 && svc.distToStop > 0.5 && off < 32) {   // running in: who gets off here?
      X.state = 'rising'; X.t = 0; X.leavers = []; const rnd = sc.rng, riders = sc.people.filter((p) => p.obj && !p.tween && !p.leaving), perDoor = new Map();
      const want = Math.min(low ? 3 : 12, Math.round(riders.length * (0.15 + 0.25 * rnd())));
      const rows = riders.map((p) => { const ci = tv.cars.indexOf(p.parent), ds = ci < 0 ? [] : doorsOf(ci); let dz = null, bd = 1e9; for (const d of ds) if (Math.abs(d - p.z) < bd) { bd = Math.abs(d - p.z); dz = d; } return { p, ci, dz, k: bd + rnd() * 2.5 - (p.state === 'sit' ? 0 : 1.5) }; }).filter((r) => r.dz != null).sort((a, b) => a.k - b.k);
      for (const r of rows) {
        if (X.leavers.length >= want) break; const key = r.ci + ':' + r.dz, n = perDoor.get(key) || 0; if (n >= 3) continue;
        let spot = null; if (r.p.state === 'sit') { spot = { x: Math.sign(r.p.x) * 0.2, y: PY, z: r.p.z, yaw: r.dz > r.p.z ? Math.PI : 0, ceilAt: r.p.ceilAt, mode: 'stand' }; if (!sc._fitsStandAt(r.p.char, spot)) continue; }
        perDoor.set(key, n + 1); r.p.leaving = true; X.leavers.push({ p: r.p, ci: r.ci, dz: r.dz, spot, riseT: rnd() * 2.2, t: 0.3 + n * 1.1 + rnd() * 0.5 });
      }
    }
    if (X.state === 'rising') { X.t += dt; let ch = false; for (const L of X.leavers) if (L.spot && X.t >= L.riseT) { if (L.p.seatRef) { L.p.seatRef.p = null; L.p.seatRef = null; } sc.rise(L.p, L.spot, 0.9); L.spot = null; ch = true; } if (ch) this._saloonObs(tv); }
    if ((X.state === 'rising' || X.state === 'idle') && atStop && svc.doorsOpen) {   // the doors are open
      tv.place(this.track, svc.train.s);   // (the cars' matrices are next set when the frame is drawn: the routes below are worked out from them now)
      X.state = 'open'; X.t = 0; const zc = this._trainCentreZl(), S = inf.S, cx = this._carToCrowd(tv.cars[0], 0, 0).x, bays = [];
      for (const dz of this.doorZ) bays.push({ name: 'bay', x0: Math.min(cx - 0.5, cx + 0.5, inf.xe + S * 0.6), x1: Math.max(cx - 0.5, cx + 0.5, inf.xe + S * 0.6), z0: zc + dz - 0.62, z1: zc + dz + 0.62 });
      tv.cars.forEach((car, ci) => { const a = this._carToCrowd(car, 0, -(tv.carInfo[ci].len / 2 - 0.3)).z, b = this._carToCrowd(car, 0, tv.carInfo[ci].len / 2 - 0.3).z; bays.push({ name: 'bay', x0: cx - 0.62, x1: cx + 0.62, z0: Math.min(a, b), z1: Math.max(a, b) }); });   // the aisle of each car
      this.crowd.setBays(bays); X.cx = cx; X.stands = [];
      // boarders: the queue at the doors first, then people coming down the stairs
      const exits = this._exitPoints(v), door = this.doorZ.slice(), before = new Set(this.crowd.people), queued = this.crowd.people.filter((q) => q.mode === 'queue');
      const nearestDoor = (z) => { let bi = 0, bd = 1e9; door.forEach((dz, k) => { const d = Math.abs(zc + dz - z); if (d < bd) { bd = d; bi = k; } }); return bi; };
      const boarded = this.crowd.board((q) => ({ x: inf.xe + S * 0.7, z: zc + door[nearestDoor(q.z)] }));
      for (const q of queued) this._routeBoarder(q, nearestDoor(q.z), X);
      const nBo = Math.max(0, Math.min(low ? 3 : 7, Math.round(v.crowdN * 0.3)) - boarded);
      for (let i = 0; i < nBo; i++) { const ex = exits[i % exits.length], ds = door.map((d, k) => k).sort((a, b) => Math.abs(zc + door[a] - ex.z) - Math.abs(zc + door[b] - ex.z)), k = ds[i % 2];
        this.crowd.stream(ex, { x: inf.xe + S * 0.7, z: zc + door[k] }, 1, inf.PY, inf.PY, 0.4, 0.6 + i * 0.6 + Math.random() * 0.4);
        for (const q of this.crowd.people) if (!before.has(q)) { before.add(q); this._routeBoarder(q, k, X); } }
    }
    if (X.state === 'open') {
      X.t += dt;
      if (!svc.doorsOpen) { for (const q of this.crowd.people.slice()) if (q.routed && q.onArrive) q.rail ? this.crowd.finish(q) : (q.onArrive(q, false), this.crowd.release(q)); this.crowd.setBays([]); for (const L of X.leavers) L.p.leaving = false; X.leavers = []; X.state = 'closed'; this._saloonObs(tv); return; }   // (anyone still in a doorway is put aboard by their onArrive: see _routeBoarder)
      const exits = this._exitPoints(v);
      for (let i = X.leavers.length - 1; i >= 0; i--) {
        const L = X.leavers[i], p = L.p; if (L.spot) { if (p.seatRef) { p.seatRef.p = null; p.seatRef = null; } sc.rise(p, L.spot, 0.9); L.spot = null; continue; }
        if (X.t < L.t || p.tween) continue; X.leavers.splice(i, 1);
        tv.place(this.track, svc.train.s);
        const car = tv.cars[L.ci], c = this._carToCrowd(car, p.x, p.z, p.yaw), d = this._carToCrowd(car, 0, L.dz), ex = exits.reduce((b, q) => (Math.abs(q.z - d.z) < Math.abs(b.z - d.z) ? q : b), exits[0]), end = this.crowd._toFloor(ex.x, ex.z, 0.3);
        const look = sc.take(p); if (!look) continue;
        this.crowd.walkOn(look, c, c.yaw, [{ x: X.cx, z: d.z, rail: true }, { x: inf.xe + inf.S * 0.9, z: d.z, rail: true }, end], inf.PY, null); this._saloonObs(tv);
      }
    }
    if (X.state === 'closed' && !atStop) X.state = 'idle';
  }
  /** send a boarding passenger (platform crowd) in through door k to a free seat they fit, or to a place to stand, and hand them to the train's crowd when they get there */
  _routeBoarder(q, k, X) {
    const tv = this.trainView, sc = tv.saloon, inf = this.crowdFor.info, zD = this.doorZ[k]; let ci = tv.carInfo.findIndex((i) => Math.abs(zD - i.zc) < i.len / 2 + 0.2); if (ci < 0 || !q.char) return;
    const car = tv.cars[ci], info = tv.carInfo[ci], dz = zD - info.zc, ceilAt = (tv.seatMap.find((s) => s.ci === ci) || {}).ceilAt;
    let seat = null; for (const s of tv.seatMap.filter((s) => s.ci === ci && !s.p).sort((a, b) => Math.abs(a.z - dz) - Math.abs(b.z - dz)).slice(0, 8)) if (sc._canSit(q.char, s)) { seat = s; break; }
    let spot = null;
    if (seat) { seat.p = q; spot = { x: Math.sign(seat.x) * 0.2, z: seat.z }; }
    else for (let n = 0; n < 14 && !spot; n++) { const c = { x: (n % 2 ? -1 : 1) * 0.2, y: PY, z: dz + (n % 4 < 2 ? 1 : -1) * (1.0 + 0.45 * Math.floor(n / 4)), yaw: n % 2 ? -Math.PI / 2 : Math.PI / 2, ceilAt, mode: 'stand' };
      if (Math.abs(c.z) > info.len / 2 - 0.6 || X.stands.some((o) => o.ci === ci && Math.hypot(o.x - c.x, o.z - c.z) < 0.5) || sc.people.some((o) => o.parent === car && o.state !== 'sit' && Math.hypot(o.x - c.x, o.z - c.z) < 0.5) || !sc._fitsStandAt(q.char, c)) continue; spot = c; X.stands.push({ ci, x: c.x, z: c.z }); }
    const dIn = this._carToCrowd(car, 0, dz), out = { x: inf.xe + inf.S * 0.7, z: dIn.z }, path = [{ x: inf.xe - inf.S * 0.15, z: dIn.z, rail: true }, { x: X.cx, z: dIn.z, rail: true }]; if (spot) { const a = this._carToCrowd(car, spot.x, spot.z); path.push({ x: a.x, z: a.z, rail: true }); }
    q.tx = out.x; q.tz = out.z; q.rail = false; q.legR = 0.7; q.path = path; q.routed = true;   // (0.7: the people queuing at the door stand on the point itself)
    const T = this._xstat || (this._xstat = { routed: 0, sat: 0, stood: 0, lost: 0, why: [] }); T.routed++;
    q.onArrive = (p, reached) => {
      const c = this._crowdToCar(car, p.x, p.z, p.yaw), free = (why) => { if (seat && seat.p === q) seat.p = null; T.lost++; if (T.why.length < 12) T.why.push(`${p.char.id} ${why} x=${c.x.toFixed(2)} z=${c.z.toFixed(2)} reached=${reached} legs=${p.path ? p.path.length : '-'} stuck=${(p.stuckT || 0).toFixed(1)}`); };
      if (!p.rail) { if (seat && seat.p === q) seat.p = null; return 'keep'; }   // still on the platform: no way through, they stay there
      if (!spot) return free('no place');   // never got past the doorway (or there was nowhere for them): gone, as before
      const at = reached && !seat && spot.yaw != null, here = { x: at ? spot.x : Math.max(-0.25, Math.min(0.25, c.x)), y: PY, z: at ? spot.z : c.z, yaw: at ? spot.yaw : c.yaw, ceilAt, mode: 'stand' }, look = { char: p.char, print: p.print, teeColour: p.teeColour, force: true };
      if (!seat && !sc._fitsStandAt(p.char, here)) return free('too tall here');
      p.print = null; const np = sc.add({ ...look, ...here, yaw: c.yaw, static: true, state: 'stand' }, car); if (!np.obj) return free('not added');
      seat ? T.sat++ : T.stood++; if (seat) { seat.p = np; np.seatRef = seat; sc.settle(np, seat, 1.0, () => this._saloonObs(tv)); } else { np.yawT = np.yaw; sc.rise(np, { x: here.x, z: here.z, yaw: spot.yaw != null ? spot.yaw : here.yaw, mode: np.char.pools.pole ? 'pole' : 'stand' }, 0.6); }
      this._saloonObs(tv);
    };
  }
  /** both circles' trains carry passengers: build each crowd once (one train a frame: measuring the characters is the slow part, and the second train reuses it), animate them while their train is on show */
  _updateSaloons(dt) {
    const bg = this.bg, views = [this.trainView, bg && bg.view];
    let built = false;
    views.forEach((tv, k) => {
      const sc = tv && tv.saloon; if (!sc) return;
      const sv = k === 0 ? (this.mode === 'ride' || this.mode === 'explore') : true;   // the player's own riders only matter when walking; the other circle's train is seen from every underground mode
      if (sv && !tv.saloonDone && !built) { built = true; this._populateSaloon(tv, k === 0 && !tv.saloonSlow ? 99 : 1); }   // the player's train at once, the other one a car a frame (also while it is out of sight: it must arrive with its passengers aboard)
      const on = sv && tv.root.visible; sc.setEnabled(on);
      if (on) { sc.maxHi = this.quality === 'low' ? (k === 0 ? 3 : 2) : (k === 0 ? (this.mode === 'ride' ? 14 : 5) : (this.mode === 'explore' ? 5 : 4)); sc.update(dt, this.time, null, this.camera.position); }   // (nearest riders get the full-detail model: fewer when the platform crowd is the focus. 14 when riding: a full train puts that many within a few metres, and the simplified models do not stand being looked at that close)
    });
  }
  /** Regression audit of every spawned person (real skinned vertices): soles on the floor/platform/seat, heads under the ceiling, inside the walls, no overlaps. */
  _peopleAudit() {
    const out = { checked: 0, bad: [], seated: 0, standing: 0, platform: 0, maxFootErr: 0, minHeadGap: 9, trains: {} }, bad = (m) => { if (out.bad.length < 12) out.bad.push(m); };
    const wall = 1.085, PYf = PY;
    for (const tv of Object.values(this.views)) {   // both circles' trains (the player's first)
      const sc = tv.saloon; if (!sc || !sc.people.length) continue;
      const list = [], perCar = tv.cars.map(() => 0), tag = tv === this.trainView ? '' : tv.line + ' train: ';
      for (const p of sc.people) {
        if (!p.obj) continue; const b = sc.bodyOf(p); out.checked++; const sit = p.state === 'sit'; sit ? out.seated++ : out.standing++;
        const footErr = b.foot - PYf; out.maxFootErr = Math.max(out.maxFootErr, Math.abs(footErr));
        if (footErr < -0.04) bad(`${tag}${b.id} ${p.state}: feet ${(-footErr * 100).toFixed(0)} cm below the floor`);
        if (footErr > (sit ? 0.07 : 0.04)) bad(`${tag}${b.id} ${p.state}: feet ${(footErr * 100).toFixed(0)} cm above the floor (levitating)`);
        if (sit) { const pel = p.y + p.yOff + p.m.contact; if (pel - p.seatY > 0.08 || p.seatY - pel > 0.07) bad(`${tag}${b.id}: pelvis ${(pel - p.seatY).toFixed(2)} m off the seat top`); }
        let worst = 9, wx = 0;
        for (let i = 0; i < b.pts.length; i += 3) { const x = b.pts[i], y = b.pts[i + 1]; if (Math.abs(x) > wall + 0.005) { bad(`${tag}${b.id} ${p.state}: through the side wall (x=${x.toFixed(2)})`); break; }
          const lim = PYf + Math.min(tv.headroomAt(Math.abs(x)), tv.headroomMeasured(Math.abs(x))); if (y > PYf + 0.9) { const gap = lim - y; if (gap < worst) { worst = gap; wx = x; } } }
        out.minHeadGap = Math.min(out.minHeadGap, worst); if (worst < 0.0) bad(`${tag}${b.id} ${p.state}: through the ceiling by ${(-worst * 100).toFixed(0)} cm at x=${wx.toFixed(2)}`);
        const ci = tv.cars.indexOf(p.parent); if (ci >= 0) perCar[ci]++;
        list.push({ p, b, ci });
      }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i], c = list[j]; if (a.ci !== c.ci) continue; const d = Math.hypot(a.p.x - c.p.x, a.p.z - c.p.z); if (d < 0.42) bad(`${tag}${a.b.id}/${c.b.id} overlap (${d.toFixed(2)} m apart)`); }
      out.trains[tv.line] = perCar;   // riders in each car, per circle
    }
    const av = this.activeStation || null;
    if (av && this.crowd && this.crowd.people && this.crowd.bodyOf) {
      const py = av.info.PY, list = [];
      for (const p of this.crowd.people) {
        if (!p.obj || p.hidden) continue; p.parent = this.crowd.group; const b = this.crowd.bodyOf(p); out.checked++; out.platform++;
        const footErr = b.foot - py; out.maxFootErr = Math.max(out.maxFootErr, Math.abs(footErr));
        if (footErr < -0.04) bad(`platform ${b.id}: feet ${(-footErr * 100).toFixed(0)} cm below the platform`); if (footErr > (p.state === 'walk' || p.state === 'go' ? 0.1 : 0.05)) bad(`platform ${b.id}: feet ${(footErr * 100).toFixed(0)} cm above the platform (levitating)`);
        if (this.crowd.avoid.some((a) => p.x > a.x0 && p.x < a.x1 && p.z > a.z0 && p.z < a.z1)) bad(`platform ${b.id}: standing inside furniture`);
        list.push(p);
      }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z) < 0.28 && list[i].mode !== 'go' && list[j].mode !== 'go') bad(`platform people overlap (${list[i].char.id}/${list[j].char.id})`);
    }
    return out;
  }
  /** Regression audit of the phones (platform crowd and both circles' riders): who holds one, that a steady hold has the phone where it was meant to be (the hold's own target, in the right
   *  hand) with the wrists on their targets, and that nobody holds one who should not (children, staff, anyone on the move). */
  _phoneAudit() {
    const T = this.THREE, ph = new T.Vector3(), hd = new T.Vector3(), want = new T.Vector3();
    const out = { people: 0, holding: 0, text: 0, call: 0, sit: 0, shown: 0, steady: 0, strayed: 0, maxStray: 0, maxHand: 0, maxMiss: 0, maxFlex: 0, maxReach: 0, kids: 0, staff: 0, moving: 0, dead: 0, phonesOn: true };
    for (const cr of [this.crowd, ...Object.values(this.views).map((tv) => tv.saloon)]) {
      if (!cr || !cr.people) continue; if (cr.phones === false) out.phonesOn = false;
      for (const p of cr.people) {
        if (!p.obj) continue; out.people++;
        const h = p.hold; if (!h) continue; if (h.dead) { out.dead++; continue; }
        const rig = h.rig, phone = rig && rig.phone; let shown = !!(phone && phone.visible); for (let o = p.obj; shown && o; o = o.parent) shown = o.visible;   // (drawn: visible all the way up to the scene)
        if (h.target > 0 && h.w > 0.02) { out.holding++; out[h.kind]++; if (p.char.kid) out.kids++; if (p.char.staff) out.staff++; if (p.v > 0.2) out.moving++; }
        if (shown) out.shown++;
        if (!shown || h.target <= 0 || h.w < 0.999 || !rig.dbg) continue;   // (only a hold that has finished coming out has to be where it was meant to be)
        out.steady++; phone.getWorldPosition(ph); rig.by.hand_r.getWorldPosition(hd);
        const C = rig.dbg.ph.C; want.set(C[0], C[1], C[2]).applyMatrix4(p.obj.matrixWorld);   // the target, from the clone's frame into the world
        const arms = Object.values(rig.dbg.err), stray = ph.distanceTo(want), inHand = ph.distanceTo(hd), miss = Math.max(...arms.map((e) => e.miss));
        out.maxStray = Math.max(out.maxStray, stray); out.maxHand = Math.max(out.maxHand, inHand); out.maxMiss = Math.max(out.maxMiss, miss);
        out.maxFlex = Math.max(out.maxFlex, ...arms.map((e) => e.flex)); out.maxReach = Math.max(out.maxReach, ...arms.map((e) => e.reach));   // the elbow's bend (degrees from straight) and how far out the wrist is (1 = the arm at full stretch)
        if (stray > 0.04 || inHand > 0.14) out.strayed++;
      }
    }
    return out;
  }
  async _opt(path) {
    try { const g = await new Promise((res, rej) => new this.GLTFLoader().load(this.url(path), res, undefined, rej)); return g.scene; } catch (e) { console.warn('[sim] optional model missing', path); return null; }
  }

  // ------------------------------------------------------------------ line / service setup
  /** per-line record: track, timetable, its train view, its service, hall layouts and (explore) shuttle state. Both circles always exist. */
  _rec(line) {
    let rec = this.tracks[line];
    if (!rec) {
      const maxPlat = Math.max(...this.stations.map((s) => (s.platform && s.platform.lengthM) || 45), 45);
      const track = new Track(this.subway.tracks[line], { trainLen: this.trainLen, ignoreCentre: true, maxKmh: this.stock.maxKmh, platformLen: maxPlat, latAccel: 1.15 });
      const rt = baselineRunTimes(track, this.stock, this.stations);
      const dw = track.stops.map((s) => s.dwellS);
      const schedule = buildSchedule(rt, dw, 1.06, 0);
      rec = this.tracks[line] = { line, track, schedule, runTimes: rt, svc: null, view: null, layouts: null, dock: null, mode: 'free', sh: { state: 'none', timer: 0, t: 0 }, unit: null };
    }
    return rec;
  }
  /** each circle has its own train model (the cab TMS texture is shared; only the player's train shows its cab) */
  _viewFor(line) {
    if (this.views[line]) return this.views[line];
    const tv = new TrainView(this.THREE, this.trainTpl.scene, {});
    tv.computeHeadroom(PY); if (this.walkable) tv.setWalkable(this.walkable);
    tv.setDest(line === 'outer' ? 'OUTER CIRCLE' : 'INNER CIRCLE');
    this.tms.attach(tv); tv.buildCab(this.tms.tex, this.tms.tex2);
    tv.line = line; tv.saloon = this._makeSaloon(); tv.saloonDone = false;
    this._advertAtlas().then((a) => fitTrainAdverts(this.THREE, tv, a, line)).catch((e) => console.warn('[sim] train adverts', e));
    this.scene.add(tv.root); this.views[line] = tv; return tv;
  }
  /** a crowd of passengers for one train (the saloon crowds share one measuring cache: same characters, same clips) */
  _makeSaloon() {
    if (!this._peopleOk()) return null;
    const low = this.quality === 'low', sc = new AnimCrowd(this.THREE, this.SU, this.peopleGltf, low ? 10 : 96, this.quality, this.peopleLod);   // (96: a full train, every seat taken and people standing)
    if (this._saloonMeas) sc.meas = this._saloonMeas; else this._saloonMeas = sc.meas;
    if (low) sc.rVis = 22;   // a low-quality train hides the interior of cars beyond ~22 m (TrainView.cull): their riders must not be left floating
    return sc;
  }
  /** the riders of the player's train (the other circle's train carries its own crowd, on its own view) */
  get saloon() { return (this.trainView && this.trainView.saloon) || null; }
  get saloonDone() { return !!(this.trainView && this.trainView.saloonDone); }
  set saloonDone(v) { if (this.trainView) this.trainView.saloonDone = v; }
  get saloonObstacles() { return (this.trainView && this.trainView.saloonObstacles) || []; }
  _applyTrack() {
    // clear station views (side depends on line)
    for (const v of this.stationViews.values()) { this.scene.remove(v.group); v.dispose(); }
    this.stationViews.clear();
    // tunnel skip spans
    const spans = this.track.stops.map((st) => {
      const stn = this.stations[this.stationIdx.get(st.station)] || {};
      const half = this.hallIndex && this.hallIndex.stations[st.station] ? HALL_FULL : stationHalfLength(stn, this.trainLen, !!this.vaultTpl) + 0.02;
      return [wrapL(st.sc - half, this.track.length), wrapL(st.sc - half, this.track.length) + 2 * half];
    });
    this._hallSpans = spans;
    this.tunnel.setSkips(spans); this.tunnel.track = null;
  }
  setupLine(line, startIdx = 0) {
    this.line = line;
    const rec = this._rec(line); this._ensureFleet();
    this.track = rec.track; this.schedule = rec.schedule;
    this.trainView = this._viewFor(line); rec.view = this.trainView;
    this._applyTrack();
    this.svc = this._newService(startIdx); rec.svc = this.svc; rec.mode = 'player';
    // the other circle runs too
    const other = line === 'outer' ? 'inner' : 'outer', brec = this._rec(other);
    this.bg = brec; brec.view = this._viewFor(other); brec.view.root.visible = false; brec.dock = null;
    this._bgReset(this.mode === 'explore' ? 'explore' : 'free');
  }

  /** a Service for any line record (hall layouts decide which side the doors open) */
  _newServiceFor(rec, idx, opts = {}) {
    const diff = this.sel.diff || this.diffId;
    const svc = new Service({
      track: rec.track, stock: this.stock, stations: this.stations, difficulty: diff, startIdx: idx, lineKey: rec.line,
      platformLen: 45, schedule: rec.schedule, ato: !!opts.ato, autoDoors: !!opts.autoDoors, seed: 7 + idx + (rec.line === 'inner' ? 100 : 0),
    });
    svc.t0 = svc.t - rec.schedule.arr[idx];
    // hall layouts: choose hall orientation per stop so the platform side matches the data, then let that side drive the door rules
    rec.layouts = rec.track.stops.map((st, i) => { const info = this.hallIndex && this.hallIndex.stations[st.station]; return info ? layoutFor(info, rec.line, svc.sideOf[i]) : null; });
    rec.layouts.forEach((l, i) => { if (l) svc.sideOf[i] = l.S; });
    return svc;
  }
  _newService(idx, opts = {}) {
    const rec = this._rec(this.line), svc = this._newServiceFor(rec, idx, opts);
    this.layouts = rec.layouts; rec.svc = svc;
    svc.on((t, d) => this._onSvc(t, d));
    return svc;
  }

  // ------------------------------------------------------------------ the numbered fleet (fleet.js)
  /** The roster: 17 units (301-317), six on each circle, a lap measured from the real service on the real track (so the numbers on the boards, the trains and the lap time agree).
   *  Rebuilt when the difficulty changes (the brake lag does), keeping the clock. */
  _ensureFleet() {
    const diff = this.sel.diff || this.diffId; if (this.fleet && this.fleetKey === diff) return this.fleet;
    const cycles = {};
    for (const line of ['outer', 'inner']) {
      const rec = this._rec(line);
      cycles[line] = measureCycle(new Service({ track: rec.track, stock: this.stock, stations: this.stations, difficulty: diff, startIdx: 0, lineKey: line, platformLen: 45, ato: true, autoDoors: true, seed: 7 + (line === 'inner' ? 100 : 0) }));
    }
    const old = this.fleet; this.fleet = new Fleet(cycles, { seed: this.fleetSeed, now: old ? old.clock : 0 }); this.fleetKey = diff;
    return this.fleet;
  }
  /** a circle's train is this numbered unit (null: none on show) - its plates are repainted */
  _setUnit(rec, unit) { rec.unit = unit == null ? null : unit; if (rec.view && rec.view.setUnit) rec.view.setUnit(rec.unit); }
  /** the real train stopped at (or left) stop `idx`: keep its unit's place in the roster in step with it (the ring slips by the difference) */
  _anchorUnit(rec, kind, idx, t) { if (this.fleet && rec && rec.unit != null) this.fleet.anchor(rec.line, rec.unit, idx, kind, t); }
  /** the next train due at stop `idx` of a circle that is not yet in the platform: its unit and the seconds until it stands there */
  _nextDue(line, idx) { const nx = this.fleet && this.fleet.nextArriving(line, idx); return nx ? { unit: nx.unit, eta: nx.eta } : { unit: null, eta: 90 }; }
  /** which unit the player's train is when a session starts: explore - the one the roster has due next (enterExplore puts it ~200 m out); ride/drive - a unit standing in the platform */
  _seatPlayer(mode, idx) {
    const f = this.fleet, rec = this.tracks[this.line], ring = f.ring(this.line);
    if (mode === 'explore') { ring.alignNext(idx, f.clock, ARRIVE_S - 3); const nx = ring.nextArriving(idx, f.clock); this._setUnit(rec, nx ? nx.unit : null); }
    else { const u = ring.units[0], since = mode === 'drive' ? Math.max(0, this.svc.stop.dwellS - 10) : 0; f.anchor(this.line, u, idx, 'arrive', f.clock - since); this._setUnit(rec, u); }
  }

  // ------------------------------------------------------------------ the other circle
  /** (re)start the other circle's train. explore: it comes and goes as the roster says; otherwise it free-runs (both trains standing in this station at the start) */
  _bgReset(mode) {
    const rec = this.bg; if (!rec || !this.svc) return;
    const stId = this.svc.stop.station; let idx = rec.track.stops.findIndex((x) => x.station === stId); if (idx < 0) idx = 0;
    rec.svc = this._newServiceFor(rec, idx, { ato: true, autoDoors: true }); rec.dock = null; this._wireBg(rec);
    const f = this.fleet, ring = f.ring(rec.line);
    if (mode === 'explore') {
      rec.mode = 'shuttle'; rec.sh = { state: 'wait', timer: 0, t: 0 }; rec.view.root.visible = false; this._setUnit(rec, null);
      const nx = ring.nextArriving(idx, f.clock); if (nx && nx.eta < ARRIVE_S + 8) ring.alignNext(idx, f.clock, ARRIVE_S + 8 + Math.random() * 25);   // a train needs ARRIVE_S to come in from the bore
    } else {
      rec.mode = 'free'; rec.sh = { state: 'free', timer: 0, t: 0 }; rec.svc.dwellT = Math.random() * 10; rec.view.root.visible = true;
      const u = ring.units[0]; f.anchor(rec.line, u, idx, 'arrive', f.clock - rec.svc.dwellT); this._setUnit(rec, u);
    }
  }
  _bgStopIdx(stationId) { return Math.max(0, this.bg.track.stops.findIndex((x) => x.station === stationId)); }
  /** the player stepped off at a station: the other circle's trains now come and go there on the roster's times */
  _bgToShuttle() {
    const rec = this.bg; if (!rec) return; const stId = this.svc.stop.station, idx = this._bgStopIdx(stId);
    rec.svc = this._newServiceFor(rec, idx, { ato: true, autoDoors: true }); rec.dock = null; this._wireBg(rec);
    rec.mode = 'shuttle'; rec.sh = { state: 'wait', timer: 0, t: 0 }; rec.view.root.visible = false; this._setUnit(rec, null);
    const f = this.fleet, ring = f.ring(rec.line), nx = ring.nextArriving(idx, f.clock); if (nx && nx.eta < ARRIVE_S + 4) ring.alignNext(idx, f.clock, ARRIVE_S + 4 + Math.random() * 20);
  }
  /** the player boarded: the other circle's train resumes its run. If it is not on show, the unit the roster has due next at this station is put exactly where the roster has it on its lap. */
  _bgToFree() {
    const rec = this.bg; if (!rec) return; const stId = this.svc.stop.station, idx = this._bgStopIdx(stId), sh = rec.sh, f = this.fleet, ring = f.ring(rec.line);
    if (sh.state === 'wait' || sh.state === 'none') {
      const nx = ring.nextArriving(idx, f.clock);
      if (nx) {
        const svc = this._newServiceFor(rec, 0, { ato: true, autoDoors: true }); advanceToLap(svc, f.cycles[rec.line], ring.lapTime(nx.unit, f.clock));
        rec.svc = svc; rec.dock = null; this._wireBg(rec); this._setUnit(rec, nx.unit); rec.view.root.visible = true;
      }
    }
    rec.svc.ato = true; rec.svc.autoDoors = true; rec.svc.schedule = rec.schedule; rec.svc.t0 = rec.svc.t - rec.schedule.arr[rec.svc.idx];
    rec.mode = 'free'; rec.sh = { state: 'free', timer: 0, t: 0 };
  }
  /** explore: the other circle's train arrives, dwells (doors open on its platform) and leaves, as the roster says (its countdown is the roster's, so it only ever falls) */
  _bgShuttle(dt) {
    const rec = this.bg, sh = rec.sh, svc = rec.svc, idx = this._bgStopIdx(this.track.stops[this.exploreIdx].station);
    if (sh.state === 'wait' || sh.state === 'leaving') { const d = this._nextDue(rec.line, idx); sh.timer = d.eta - ARRIVE_S; sh.due = d.unit; }
    if (sh.state === 'wait') {
      if (sh.timer <= 0) { this._setUnit(rec, sh.due); svc.schedule = null; svc.placeApproaching(idx, 220, 9); svc.ato = true; svc.autoDoors = true; svc._autoOpened = false; svc._autoClosed = false; rec.view.root.visible = true; sh.state = 'arriving'; sh.arrT = 0; }
    } else if (sh.state === 'arriving') { sh.arrT = (sh.arrT || 0) + dt; if (svc.phase === 'station') sh.state = 'dwell'; }
    else if (sh.state === 'dwell') { if (svc.phase !== 'station') { sh.state = 'leaving'; sh.t = 0; } }   // the next train's countdown is the roster's: it is already running
    else if (sh.state === 'leaving') {   // the train runs on into the bore and is only recycled once its tail is out of sight (never while it is still in the platform)
      sh.t += dt;
      if (this._tailPast(rec, idx) > CLEAR_TAIL || sh.t > 70) { rec.view.root.visible = false; sh.state = 'wait'; svc.train.v = 0; }
    }
  }
  /** how far (m) the tail of this circle's train is beyond the centre of its stop `idx` (negative while the train is still standing in the platform) */
  _tailPast(rec, idx) {
    const tr = rec.track, L = tr.length, st = tr.stops[idx]; if (!st) return 0;
    return wrapL(rec.svc.train.s - this.trainLen - st.sc + L / 2, L) - L / 2;
  }
  /** the other circle's train is placed in the hall's own second bore when it is at a station (the OSM track data does not line up with the hall to within a few metres), blending back to the track data away from it */
  _bgDock() {
    const rec = this.bg, svc = rec.svc, L = rec.track.length, sc0 = svc.train.s - this.trainLen / 2;
    let best = null, bd = 1e9;
    for (const st of rec.track.stops) { const d = Math.abs(wrapL(sc0 - st.sc + L / 2, L) - L / 2); if (d < bd) { bd = d; best = st; } }
    let dock = null;
    if (best && bd < 170) {
      let v = null; for (const x of this.stationViews.values()) if (x.station && x.station.id === best.station) { v = x; break; }
      if (v) { v.group.updateMatrixWorld(true); const T = this.THREE, o = new T.Vector3(v.info.otherTrackX, 0, 0), a = new T.Vector3(v.info.otherTrackX, 0, 1); v.group.localToWorld(o); v.group.localToWorld(a); dock = { stop: best, o, f: a.sub(o), view: v }; }
    }
    rec.dock = dock;
  }
  _bgTrack() {
    if (this._bgT) return this._bgT; const self = this;
    this._bgT = { pose(s, out = {}) {
      const rec = self.bg, tr = rec.track, p = tr.pose(s, out), k = rec.dock; if (!k) return p;
      const L = tr.length, d = wrapL(s - k.stop.sc + L / 2, L) - L / 2, w = Math.min(1, Math.max(0, (160 - Math.abs(d)) / 90)); if (w <= 0) return p;
      p.x += (k.o.x + k.f.x * d - p.x) * w; p.y += (k.o.y + k.f.y * d - p.y) * w; p.z += (k.o.z + k.f.z * d - p.z) * w; return p; } };
    return this._bgT;
  }
  _bgUpdateView(dt) {
    const rec = this.bg; if (!rec || !rec.svc || !rec.view) return; const tv = rec.view;
    const hidden = rec.mode === 'shuttle' && (rec.sh.state === 'wait' || rec.sh.state === 'none');
    if (hidden || this.mode === 'street') { tv.root.visible = false; return; }
    this._bgDock(); tv.place(this._bgTrack(), rec.svc.train.s); tv.setDriveCab(false); tv.setDoors(rec.svc.doors.L, rec.svc.doors.R);
    const m = tv.cars[Math.floor(tv.cars.length / 2)].matrix.elements, c = this.camera.position;
    tv.root.visible = Math.hypot(m[12] - c.x, m[13] - c.y, m[14] - c.z) < 420;
    if (tv.root.visible && ((this._bgCullT = (this._bgCullT || 0) - dt) <= 0)) { this._bgCullT = 0.4; tv.cull(c, 'explore', this.quality === 'low'); }
  }

  /** where a train's doors are relative to the listener (the camera): { dist: metres to the nearest doorway on the given side (side > 0 right-hand doors, < 0 left-hand, 0 either), pan: -1..1 }.
   *  null while the train is not in the scene. */
  _trainEar(tv, side = 0) {
    if (!tv || !tv.root || !tv.root.visible || !tv.cars || !tv.cars.length) return null;
    const cam = this.camera, c = cam.position, v = this._earV || (this._earV = new this.THREE.Vector3()); cam.updateMatrixWorld(); const e = cam.matrixWorld.elements;
    let bd = Infinity, bx = 0, bz = 0;
    for (const list of side > 0 ? [tv.doorsR] : side < 0 ? [tv.doorsL] : [tv.doorsL, tv.doorsR]) for (const dr of list) {
      dr.leaves[0].n.getWorldPosition(v); const dx = v.x - c.x, dy = v.y - c.y, dz = v.z - c.z, d = Math.hypot(dx, dy, dz); if (d < bd) { bd = d; bx = dx; bz = dz; }
    }
    if (!isFinite(bd)) for (const car of tv.cars) { const m = car.matrix.elements, dx = m[12] - c.x, dy = m[13] - c.y, dz = m[14] - c.z, d = Math.hypot(dx, dy, dz) - 6; if (d < bd) { bd = Math.max(0, d); bx = dx; bz = dz; } }   // (a model with no door nodes: the cars will do)
    return { dist: bd, pan: panOf(bx, bz, e[0], e[2]) };
  }
  /** the sound of a train's doors opening (open = true) or closing (with its warning beeps), as heard from where the player is. own = it is the train the player is on;
   *  side = which doors (> 0 right-hand) - from the event when it opens, from how far each side is open when it closes. */
  _doorSound(tv, own, open, side = 0) {
    let o;
    if (own && this.ctxKind === 'train') o = { gain: this.mode === 'drive' ? 0.7 : 1, pan: 0, lp: 0, key: tv };   // aboard it: the doors are beside you (a little muffled in the cab)
    else {
      const ear = this._trainEar(tv, side); if (!ear) return false; const r = reach(ear.dist);
      o = { gain: r.gain, pan: ear.pan, lp: r.lp, key: tv };
      if (this.ctxKind === 'train') { o.gain *= 0.5; o.lp = o.lp ? Math.min(o.lp, 2500) : 2500; }   // the other circle's train, heard through your own train's walls
    }
    return this.audio.doors(open, o);
  }
  /** a service's doors event -> its sound: the side comes with the opening; a closing is on whichever side is open */
  _svcDoors(svc, tv, own, d) {
    const open = !(d && d.open === false), side = d && d.side ? d.side : (svc.doors.R >= svc.doors.L ? 1 : -1);
    return this._doorSound(tv, own, open, side);
  }
  /** the other circle's train (not the player's): its doors are heard from where you stand */
  _wireBg(rec) { const svc = rec.svc; svc.on((t, d) => { if (t === 'doors' && svc !== this.svc) this._svcDoors(svc, rec.view, false, d); else if (t === 'arrive' && svc !== this.svc && (rec.mode !== 'shuttle' || rec.sh.state === 'arriving')) this._anchorUnit(rec, 'arrive', d.idx); }); }   // (a hidden shuttle train, running on unseen, must not slip the roster)

  _onSvc(type, d) {
    if (type === 'toast') this.hud.toast(d.text, d.kind, 3);
    else if (type === 'chime') { if (d.kind !== 'close') this.audio.chime(d.kind); }   // (the closing warning is part of the doors-closing sound below)
    else if (type === 'log') { if (d.delta < 0 && d.kind !== 'time') this.hud.toast(d.text + ' (' + d.delta + ')', 'warn', 3); }
    else if (type === 'doors') this._svcDoors(this.svc, this.trainView, true, d);
    else if (type === 'target') {
      const n = this.svc.station.name;
      if (this.mode === 'ride' || this.mode === 'drive') this._announce(`The next station is ${n}.`);
      this.annDone = false;
    } else if (type === 'arrive') {
      if (this.mode === 'ride') this._announce(`This is ${this.svc.station.name}. Please mind the gap.`);
      if (this.mode === 'drive') { this.hud.toast(`${d.label}  ${d.err >= 0 ? '+' : ''}${d.err.toFixed(2)} m  (+${d.score})`, d.score >= 75 ? 'info' : 'warn', 4); }
      if (this.mode !== 'explore' || this.shuttle.state === 'arriving') this._anchorUnit(this.tracks[this.line], 'arrive', d.idx);   // the roster follows the real train (not the hidden one that runs on unseen after it has left)
      if (this.mode === 'explore' && this.shuttle.state === 'arriving') { this.shuttle.state = 'dwell'; }
    } else if (type === 'depart') {
      if (this.mode === 'explore' && this.shuttle.state === 'dwell') { const sh = this.shuttle; sh.state = 'leaving'; sh.t = 0; }   // the next train's countdown is the roster's: it is already running
      this.alightNext = this.mode === 'ride' ? this.alightNext : false;
    }
  }
  _announce(text) { this.hud.toast(text, 'info', 4); this.audio.speak(text); }

  // ------------------------------------------------------------------ modes
  async go(sel) {
    if (sel.mode === 'walk') sel = Object.assign({}, sel, { mode: 'explore' });
    Object.assign(this.sel, sel);
    this.hud.closeModal(); this.audio.start();
    const idx = this.track.stops.findIndex((s) => s.station === this.sel.station);
    const i = idx < 0 ? 0 : idx;
    if (this.mode === 'street') this._leaveStreetScene();
    if (sel.line && sel.line !== this.line || !this.svc || sel.diff && sel.diff !== this.svc.diff.id) { this.setupLine(sel.line || this.line, i); }
    const mode = sel.mode || this.sel.mode;
    const idx2 = this.track.stops.findIndex((s) => s.station === this.sel.station);
    this.svc = this._newService(Math.max(0, idx2), { ato: mode !== 'drive', autoDoors: mode !== 'drive' });
    this._bgReset(mode === 'explore' ? 'explore' : 'free');
    const svc = this.svc;
    this.shuttle.state = 'none'; this.crowd.clear(); this.crowdFor = null;
    this.tunnel.reset(); this.annDone = false;
    { const i0 = Math.max(0, idx2); await this._prepare(i0); await this._prepare((i0 + 1) % this.track.stops.length); }
    this.trainView.root.visible = true;
    this._seatPlayer(mode === 'drive' || mode === 'ride' ? mode : 'explore', Math.max(0, idx2));
    if (mode === 'drive') {
      svc.dwellT = Math.max(0, svc.stop.dwellS - 10); svc.ato = false;
      this.enterDrive();
    } else if (mode === 'ride') {
      this.enterRide(true);
    } else {
      this.enterExplore(Math.max(0, idx2));
    }
  }

  enterDrive() {
    this.mode = 'drive'; this.ctxKind = 'train'; this.look.yaw = 0; this.look.pitch = -0.05; this.hud.setMode('drive');
    this.svc.ato = false; this.svc.lever = 0; this.svc.autoDoors = this.svc.diff.autoDoors;
    this.hud.toast('Drive: W/S power & brake, O/P doors, A for ATO. H for help.', 'info', 5);
    this.scene.fog.density = 0.026;
  }

  enterRide(fresh = false) {
    this.mode = 'ride'; this.ctxKind = 'train'; this.hud.setMode('ride');
    const svc = this.svc; svc.ato = true; svc.autoDoors = true;
    this._setupTrainWalker();
    if (fresh) this.walker.place(0.0, -2.0, 0);
    this.look.yaw = 0; this.look.pitch = 0;
    this.scene.fog.density = 0.026;
    this.hud.toast('Riding as a passenger. WASD to walk, N: get off at next stop, E at the front: driver\'s cab.', 'info', 5);
  }

  enterExplore(stopIdx, fromRide = false) {
    this.mode = 'explore'; this.ctxKind = 'station'; this.hud.setMode('explore');
    const svc = this.svc; svc.ato = true; svc.autoDoors = true; svc.schedule = null;
    this.exploreIdx = stopIdx;
    this.scene.fog.density = 0.006;
    const view = this._ensureStation(stopIdx, true);
    this._setupStationWalker(view, fromRide);
    this.shuttle.idx = stopIdx;
    if (!fromRide) {
      svc.placeApproaching(stopIdx, 200, 9); this.shuttle.state = 'arriving';
    } else { this.shuttle.state = 'dwell'; }
    this.hud.toast(`${this.stations[this.stationIdx.get(this.track.stops[stopIdx].station)].name}: explore the station. A train will arrive shortly.`, 'info', 5);
  }

  _setupStationWalker(view, fromRide) {
    const w = this.walker, inf = view.info;
    w.setWorld(view.zones, view.obstacles); w.heightFn = null; w.eye = 1.52; w.radius = 0.3; w.headroomFn = null;
    this.activeStation = view;
    if (fromRide) {
      const doorZ = this._nearestDoorZ();
      w.place(inf.xe + inf.S * 0.9, this._trainCentreZl() + doorZ, -inf.S * Math.PI / 2);
    } else {
      w.place(inf.xe + inf.S * 1.9, 4, 0);
      w.yaw = Math.PI; this.look.yaw = w.yaw;
    }
    this.look.pitch = 0;
  }

  _trainCentreZl() {
    const svc = this.svc, st = svc.stop;
    return -(svc.train.s - this.trainLen / 2 - (svc.targetU - st.cabOff));
  }
  /** train centre (station-local z) once it stands on its stop mark. The queue forms where the doors WILL be: `_trainCentreZl()` while the train is still
   *  approaching is 200 m up the line, and people sent there just pile up against the end of the platform. */
  _stopCentreZl() { return this.trainLen / 2 - this.svc.stop.cabOff; }
  /** where passengers leave and enter the platform: the stair portals on the platform the train stands at (halls), else the ramp axis at the platform end */
  _exitPoints(v) {
    const inf = v.info, A = v.anchors || {}, pl = v.ownPlat, out = [];
    if (inf.hall && A.portals && A.portals.length) {
      const on = pl ? A.portals.filter((q) => q.x > pl.x0 - 0.8 && q.x < pl.x1 + 0.8) : [];
      for (const q of (on.length ? on : A.portals)) out.push({ x: q.x, z: q.z });
    }
    return out.length ? out : [{ x: inf.rc, z: inf.zE - 0.5 }];
  }
  _nearestDoorZ() {
    const wz = this.walker.z - (this.ctxKind === 'station' ? this._trainCentreZl() : 0);
    let best = this.doorZ[1], bd = 1e9;
    for (const z of this.doorZ) { const d = Math.abs(z - (this.ctxKind === 'train' ? this.walker.z : wz)); if (d < bd) { bd = d; best = z; } }
    return best;
  }

  _setupTrainWalker() {
    // Whole 4-car train is one walkable corridor (open gangways). Generous aisle, door recesses, no seat colliders.
    const w = this.walker, half = this.trainLen / 2 - 2.5, zones = [{ kind: 'flat', x0: -0.5, x1: 0.5, z0: -half, z1: half, y: PY, name: 'aisle' }];
    for (const z of this.doorZ) zones.push({ kind: 'flat', x0: -1.12, x1: 1.12, z0: z - 0.75, z1: z + 0.75, y: PY, name: 'door' });
    w.setWorld(zones, this.saloonObstacles || []);
    w.heightFn = null; w.eye = 1.5; w.radius = 0.2; w.headroomFn = (x) => this.trainView.headroomAt(x); w.minHead = 1.5;
    this.ctxKind = 'train';
  }

  async enterStreet() {
    if (this.fadeLock) return; this.fadeLock = true; this.hud.setFade(true);
    await new Promise((r) => setTimeout(r, 480));
    const stn = this.stations[this.stationIdx.get(this.track.stops[this.exploreIdx].station)];
    const ents = (stn.entrances || []).filter((e) => e.kind === 'street' || e.kind === 'station-building' || true);
    const ent = ents.length ? ents.reduce((a, b) => (Math.hypot(a.x - stn.x, a.z - stn.z) <= Math.hypot(b.x - stn.x, b.z - stn.z) ? a : b)) : { x: stn.x, z: stn.z };
    const entTpl = await this._loadEntrance(stn.id);
    try { this.street = await buildStreet(this.THREE, { entrance: ent, station: stn, terrain: this.terrain, GLTFLoader: this.GLTFLoader, kioskTpl: entTpl || this.kioskTpl, newEntrance: !!entTpl, base: this.base }); } catch (e) { console.error('street failed', e); this.street = null; }
    if (!this.street) { this.hud.setFade(false); this.fadeLock = false; return; }
    this.mode = 'street'; this.ctxKind = 'street'; this.hud.setMode('street');
    const w = this.walker, st = this.street;
    w.headroomFn = null; w.setWorld([], []); w.heightFn = (x, z) => (Math.hypot(x - st.center.x, z - st.center.z) < st.radius ? st.ground(x, z) : null); w.eye = 1.55; w.radius = 0.3;
    w.place(st.spawn.x, st.spawn.z, st.spawn.yaw); w.y = st.spawn.y;
    this.look.pitch = 0;
    this.hud.toast(`Street level: ${stn.name}. Walk back to the stairwell to descend.`, 'info', 5);
    this.hud.setFade(false); this.fadeLock = false;
  }
  _leaveStreetScene() { if (this.street) { this.street.dispose(); this.street = null; } }
  async leaveStreet() {
    if (this.fadeLock) return; this.fadeLock = true; this.hud.setFade(true);
    await new Promise((r) => setTimeout(r, 480));
    this._leaveStreetScene();
    this.mode = 'explore'; this.ctxKind = 'station'; this.hud.setMode('explore');
    const view = this._ensureStation(this.exploreIdx, true);
    this._setupStationWalker(view, false);
    const a = view.anchors.exit; this.walker.place(a.x, a.z, 0); this.walker.yaw = 0; this.walker.y = a.y;
    this.hud.setFade(false); this.fadeLock = false;
  }

  async _loadEntrance(id) {
    if (this.entrances.has(id)) return this.entrances.get(id);
    const info = this.hallIndex && this.hallIndex.stations[id]; if (!info || !info.entrance) return null;
    let tpl = null; try { tpl = await loadGLB(this.THREE, this.GLTFLoader, this.url('models/' + info.entrance)); } catch (e) { console.warn('[sim] entrance missing', id); }
    try { frontFaceSigns(tpl); } catch (e) {}
    this.entrances.set(id, tpl); return tpl;
  }
  async _teleport(fn) {
    if (this.fadeLock) return; this.fadeLock = true; this.hud.setFade(true);
    await new Promise((r) => setTimeout(r, 420)); try { fn(); } finally { this.hud.setFade(false); this.fadeLock = false; }
  }
  _toAccess(pt) {
    const v = this.activeStation, inf = v.info; this._lastPortal = pt;
    return this._teleport(() => { const w = this.walker; w.place(inf.rc, inf.rampZ0 + 1.2, Math.PI); w.y = inf.PY; this.look.yaw = Math.PI; this.look.pitch = 0; });
  }
  _toPlatform() {
    const v = this.activeStation, inf = v.info, pt = this._lastPortal || (v.anchors.portals || [])[0] || { x: inf.xcP, z: 0 };
    return this._teleport(() => {      // back on the platform the stairs came down to, a couple of metres from their foot, facing away from them
      const w = this.walker, dir = Math.sign(pt.z || 1), px = pt.stair ? pt.x : (inf.xe + inf.xo) / 2, yaw = dir > 0 ? 0 : Math.PI;
      w.place(px, Math.max(-20, Math.min(20, pt.z - dir * 1.8)), yaw); w.y = inf.PY; this.look.yaw = yaw; this.look.pitch = 0;
    });
  }

  _boardTrain() {
    const svc = this.svc; this._setupTrainWalker();
    const dz = this._nearestDoorZ(); const inf = this.activeStation.info;
    this.mode = 'ride'; this.ctxKind = 'train'; this.hud.setMode('ride'); this._bgToFree();
    this.walker.place(inf.S * 0.45, dz, inf.S > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.walker.yaw = -inf.S * -Math.PI / 2 * 0 + (inf.S > 0 ? Math.PI / 2 : -Math.PI / 2) * -1;
    svc.ato = true; svc.autoDoors = true; svc.dwellT = Math.max(svc.dwellT, svc.stop.dwellS - 5);
    this.shuttle.state = 'none'; this.crowd.clear(); this.scene.fog.density = 0.026;
    this.hud.toast('All aboard. N: alight at next stop. Walk to the front cab and press E to drive.', 'info', 5);
  }
  _alight() {
    const idx = this.svc.idx; this.alightNext = false;
    const doorZ = this._nearestDoorZ();   // walker still in train-local space here
    this.mode = 'explore'; this.ctxKind = 'station'; this.hud.setMode('explore'); this._bgToShuttle();
    this.exploreIdx = idx; this.shuttle.idx = idx; this.shuttle.state = 'dwell'; this.shuttle.streamed = false; this.scene.fog.density = 0.006;
    const view = this._ensureStation(idx, true);
    this.walker.heightFn = null; this.walker.headroomFn = null; this.walker.setWorld(view.zones, view.obstacles); this.walker.eye = 1.52; this.walker.radius = 0.3; this.activeStation = view;
    const inf = view.info;
    this.walker.place(inf.xe + inf.S * 0.9, this._trainCentreZl() + doorZ, -inf.S * Math.PI / 2); this.look.yaw = this.walker.yaw; this.look.pitch = 0;
    this.svc.schedule = null; this.svc.ato = true; this.svc.autoDoors = true;
    this.hud.toast('Welcome to ' + this.svc.station.name, 'info', 3);
  }
  // ------------------------------------------------------------------ next-train indicators
  _fmtEta(sec) { return sec == null ? '-' : sec === 0 ? 'In station' : sec <= 20 ? 'Due' : Math.ceil(sec / 60) + ' min'; }
  /** seconds until a shuttle train is standing in the platform (0 = it is, null = unknown). One countdown: it starts when the previous train leaves, runs through the recycle
   *  and the approach, and never steps up (the boards and the HUD both read it). */
  _shuttleEta(sh, svc) {
    if (sh.state === 'dwell') return 0;
    if (sh.state === 'arriving') return Math.max(1, Math.max(0, svc.distToStop) / Math.max(svc.train.v, 4), ARRIVE_S - (sh.arrT || 0));
    if (sh.state === 'wait' || sh.state === 'leaving') return Math.max(0, sh.timer || 0) + ARRIVE_S;
    return null;
  }
  /** The next train due at station `id` on a circle: {eta, unit} - eta in seconds until it stands in the platform (0 = it is), unit its number. It comes from the roster
   *  (fleet.js), so every board agrees and a countdown only falls; at the station you stand in, while a train is arriving or in the platform, the real train is the answer. */
  _lineDue(line, id) {
    const rec = this.tracks[line], f = this.fleet; if (!rec || !rec.svc || !f) return null;
    const k = rec.track.stops.findIndex((x) => x.station === id); if (k < 0) return null;
    if (this.mode === 'explore' && this.track.stops[this.exploreIdx] && this.track.stops[this.exploreIdx].station === id) {   // the station you stand in
      const sh = rec === this.tracks[this.line] ? this.shuttle : rec.sh;
      if (sh && (sh.state === 'dwell' || sh.state === 'arriving')) return { eta: this._shuttleEta(sh, rec.svc), unit: rec.unit };
      if (sh && (sh.state === 'wait' || sh.state === 'leaving')) return this._nextDue(line, k);   // (never the unit that has just left)
    }
    const u = f.upcoming(line, k, 1)[0]; return u ? { eta: u.inStation ? 0 : u.eta, unit: u.unit } : null;
  }
  _updateIndicators() {
    for (const v of this.stationViews.values()) {
      if (!v.indicators || !v.indicators.length) continue; const id = v.station.id;
      for (const ind of v.indicators) {
        const rows = ind.lines.map((l) => { const d = this._lineDue(l, id); return { line: l, name: l === 'outer' ? 'OUTER' : 'INNER', sub: l === 'outer' ? 'clockwise' : 'anticlockwise', eta: this._fmtEta(d ? d.eta : null), unit: d && d.unit != null ? d.unit : null }; });
        const key = rows.map((r) => r.eta + '/' + r.unit).join('|'); if (key === ind.key) continue; ind.key = key; ind.draw(rows);
      }
    }
  }
  /** where the other circle's train docks relative to the platforms (primary hall frame): the platform + edge nearest its track */
  _bgPlat() {
    const v = this.activeStation; if (!v || !v.info.hall || !v.anchors.hallPlat) return null; const ox = v.info.otherTrackX; let best = null;
    for (const pl of v.anchors.hallPlat) for (const e of [pl.x0, pl.x1]) { const d = Math.abs(e - ox); if (d < 2.4 && (!best || d < best.d)) best = { pl, edge: e, d }; }
    return best;
  }
  /** side-platform stations: the other platform is across the tracks - take the passage under them (fade + teleport) */
  _crossPlatform() {
    const v = this.activeStation, w = this.walker; if (!v || !v.info.hall || this.mode !== 'explore') return;
    const P = v.anchors.hallPlat || [], cur = P.find((p) => w.x >= p.x0 - 0.2 && w.x <= p.x1 + 0.2), bp = this._bgPlat();
    const tgt = (bp && cur !== bp.pl) ? bp.pl : (P.find((p) => p !== cur && !(bp && p === bp.pl)) || P.find((p) => p !== cur));
    if (!tgt || tgt === cur) { this.hud.toast('This is an island platform: just walk across it to the other train.', 'info', 3); return; }
    return this._teleport(() => { w.place((tgt.x0 + tgt.x1) / 2, w.z, w.yaw); w.y = v.info.PY; this.hud.toast('You cross to the other platform.', 'info', 2.5); });
  }
  /** step onto the other circle's train: it becomes the player's train (the one just left carries on as the other circle) */
  async _boardOther() {
    const bg = this.bg; if (this.fadeLock || !bg || bg.svc.phase !== 'station') return;
    this.fadeLock = true; this.hud.setFade(true);
    await new Promise((r) => setTimeout(r, 450));
    try {
      const old = this.tracks[this.line], nw = bg;
      old.svc.listeners = []; nw.svc.listeners = [];
      this.line = nw.line; this.track = nw.track; this.schedule = nw.schedule; this.svc = nw.svc; this.trainView = nw.view; this.layouts = nw.layouts; this.sel.line = nw.line;
      nw.mode = 'player'; nw.sh = { state: 'none', timer: 0, t: 0 }; nw.dock = null; nw.svc.on((t, d) => this._onSvc(t, d));
      this.bg = old; old.mode = 'free'; old.sh = { state: 'free', timer: 0, t: 0 }; old.dock = null; old.view.root.visible = true; this._wireBg(old);
      old.svc.ato = true; old.svc.autoDoors = true; old.svc.schedule = old.schedule; old.svc.t0 = old.svc.t - old.schedule.arr[old.svc.idx] + (old.svc.phase === 'station' ? old.svc.dwellT : 0);
      nw.svc.schedule = nw.schedule; nw.svc.t0 = nw.svc.t - nw.schedule.arr[nw.svc.idx] + nw.svc.dwellT; nw.view.root.visible = true;
      this._applyTrack(); this.crowd.clear(); this.crowdFor = null;   // (each train keeps its own riders: nothing to clear in the saloons)
      const i = nw.svc.idx, view = await this._prepare(i);
      this.activeStation = view; this.ctxKind = 'station'; this.exploreIdx = i; this.shuttle.state = 'none';
      const inf = view.info, w = this.walker; w.setWorld(view.zones, view.obstacles); w.heightFn = null; w.headroomFn = null; w.eye = 1.52; w.radius = 0.3;
      w.place(inf.xe + inf.S * 0.9, this._trainCentreZl() + this.doorZ[1], 0);
      this._boardTrain();
    } finally { this.hud.setFade(false); this.fadeLock = false; }
  }
  _stepOut() { this._setupTrainWalker(); this.walker.place(0, this.doorZ[0], 0); this._alight(); }
  _takeCab() {
    this.mode = 'drive'; this.ctxKind = 'train'; this.hud.setMode('drive');
    const svc = this.svc; svc.ato = false; svc.lever = 0; svc.autoDoors = svc.diff.autoDoors; svc.schedule = this.schedule;
    svc.t0 = svc.t - this.schedule.arr[svc.idx] + (svc.phase === 'station' ? svc.dwellT : 0);
    this.look.yaw = 0; this.look.pitch = -0.05; this.hud.toast('You are driving. Good luck!', 'info', 3);
  }

  // ------------------------------------------------------------------ stations in scene
  /** loads (once) the hall GLB for a station; resolves to the template or null */
  _loadHall(id) {
    if (this.halls.has(id)) return Promise.resolve(this.halls.get(id).tpl);
    if (this.hallFailed.has(id) || !this.hallIndex || !this.hallIndex.stations[id]) return Promise.resolve(null);
    if (this.hallLoading.has(id)) return this.hallLoading.get(id);
    const p = Promise.all([loadGLB(this.THREE, this.GLTFLoader, this.url('models/' + this.hallIndex.stations[id].hall)), this._advertAtlas()]).then(([tpl, ads]) => { try { const hi = this.hallIndex.stations[id]; fixHallSigns(tpl, hi); applyAdverts(tpl, ads.portrait, id); frontFaceSigns(tpl, /^route_map_panel$/); stripIslandFurniture(this.THREE, tpl, hi); tpl.userData.wallX = measureHallWalls(tpl); trackWallAdverts(this.THREE, tpl, hi, ads, id); this.advertAtlases = ads; cutStairHoles(this.THREE, tpl, hi); } catch (e) { console.warn('[sim] hall prepare', e); } this.halls.set(id, { tpl, t: this.time }); this.hallLoading.delete(id); this._evictHalls(id); return tpl; })
      .catch((e) => { console.warn('[sim] hall load failed', id, e && e.message); this.hallFailed.add(id); this.hallLoading.delete(id); return null; });
    this.hallLoading.set(id, p); return p;
  }
  /** the shared advert atlases, loaded once: { portrait, landscape, cards }, any null if it fails (portrait: the baked placeholder posters stay) */
  _advertAtlas() {
    const one = (f) => loadAdvertAtlas(this.THREE, this.url('models/' + f)).catch((e) => { console.warn('[sim] advert atlas missing', f, e && e.message); return null; });
    if (!this.advertAtlasP) this.advertAtlasP = Promise.all([one('adverts.jpg'), one('adverts_land.jpg'), one('adverts_cards.jpg')]).then(([portrait, landscape, cards]) => ({ portrait, landscape, cards }));
    return this.advertAtlasP;
  }
  _evictHalls(keep) {
    const inUse = new Set([keep, ...[...this.stationViews.values()].map((v) => v.station.id)]);
    const ids = [...this.halls.keys()].filter((id) => !inUse.has(id));
    while (this.halls.size > 5 && ids.length) { const id = ids.shift(); disposeTemplate(this.halls.get(id).tpl); this.halls.delete(id); }
  }
  async _prepare(stopIdx) {
    const id = this.track.stops[stopIdx].station; await this._loadHall(id); return this._ensureStation(stopIdx, true);
  }
  _ensureStation(stopIdx, force = false) {
    let v = this.stationViews.get(stopIdx);
    if (v) return v;
    const THREE = this.THREE, stop = this.track.stops[stopIdx];
    const si = this.stationIdx.get(stop.station); const station = this.stations[si];
    const lay = this.layouts && this.layouts[stopIdx];
    let hall = null;
    if (lay && this.hallIndex && !this.hallFailed.has(stop.station)) {
      const ent = this.halls.get(stop.station);
      if (ent) hall = { tpl: ent.tpl, layout: lay, info: this.hallIndex.stations[stop.station], hints: lookHints(this.looks.get(stop.station)) };
      else if (!force) { this._loadHall(stop.station); return null; }
    }
    const side = lay ? lay.S : this.svc.sideOf[stopIdx];
    v = buildStation(THREE, { station, stop, side, lineKey: this.line, trainLen: this.trainLen, idx: si, kit: this.kit, vault: this.vaultTpl, low: this.quality === 'low', hall, adverts: this.advertAtlases || null });
    placeStation(THREE, v, stop); v.stopIdx = stopIdx; v.station = station;
    this._decorateStation(v);
    this.scene.add(v.group); this.stationViews.set(stopIdx, v);
    return v;
  }

  _decorateStation(v) {
    // waiting passengers on the platform, density by station
    const inf = v.info, rng = mulberry32(inf.PL * 13 + v.stopIdx);
    const n = Math.round(10 + rng() * 22);
    v.crowdRect = { x0: Math.min(inf.xe, inf.xo) + 0.5 * Math.sign(1), x1: Math.max(inf.xe, inf.xo) - 0.3, z0: -inf.PL + 2, z1: inf.PL - 1 };
    // keep clear of the platform edge strip
    const edge = 1.0; const lo = Math.min(inf.xe, inf.xo), hi = Math.max(inf.xe, inf.xo);
    v.crowdRect.x0 = inf.S > 0 ? inf.xe + edge : inf.xo + 0.4; v.crowdRect.x1 = inf.S > 0 ? inf.xo - 0.4 : inf.xe - edge;
    v.crowdN = Math.round(n * (v.info.hall && this.looks ? lookHints(this.looks.get(v.station.id)).crowd : 1));
    if (v.info.hall) { const pl = v.anchors.hallPlat.find((q) => q.x0 === Math.min(inf.xe, inf.xo) || Math.abs((inf.S > 0 ? q.x0 : q.x1) - inf.xe) < 0.05) || v.anchors.hallPlat[0]; v.ownPlat = pl; v.crowdRect = { x0: pl.x0 + 0.6, x1: pl.x1 - 0.6, z0: -20, z1: 20 }; if (inf.S > 0) v.crowdRect.x0 = pl.x0 + 1.0; else v.crowdRect.x1 = pl.x1 - 1.0; }
    // kit pieces (benches etc.) are procedural; kit used for the signal head
  }

  _manageStations() {
    const L = this.track.length, s = this.svc.train.s;
    this.track.stops.forEach((st, i) => {
      let d = wrapL(st.sc - s + L / 2, L) - L / 2; // signed distance ahead to station centre
      const near = d > -330 && d < 460;
      const v = this.stationViews.get(i);
      if (near && !v) this._ensureStation(i);
      else if (!near && v && !(this.mode === 'explore' && i === this.exploreIdx)) { this.scene.remove(v.group); v.dispose(); this.stationViews.delete(i); if (v.crowdOn) {} }
    });
    // crowd: only for the nearest displayed station
    let cur = null, bd = 1e9;
    for (const [i, v] of this.stationViews) { const st = this.track.stops[i]; const d = Math.abs(wrapL(st.sc - s + L / 2, L) - L / 2); if (d < bd) { bd = d; cur = v; } }
    if (this.mode === 'explore' && this.stationViews.get(this.exploreIdx)) { cur = this.stationViews.get(this.exploreIdx); bd = 0; }   // on foot: the crowd belongs to YOUR platform, not to wherever the (hidden) train has wandered
    if (cur !== this.crowdFor && bd < 300) {
      this.crowd.clear(); this.crowdFor = cur;
      if (cur) {
        const inf = cur.info; const g = cur.group;
        this.crowd.group.position.copy(g.position); this.crowd.group.rotation.copy(g.rotation);
        if (this.crowd.setWorld) this.crowd.setWorld(cur.zones, cur.obstacles.filter((o) => o.tall || Math.abs(o.y - cur.info.PY) < 1.2));
        this.crowd.populate(cur.crowdN, cur.crowdRect, inf.PY, cur.obstacles.filter((o) => !o.tall && o.y === inf.PY).concat(cur.crowdAvoid || []));
      }
    }
  }

  _makeSignal() {
    const THREE = this.THREE, g = new THREE.Group();
    if (this.sigWallTpl) {   // A3 rev 6: wall-mounted two-aspect signal (lamp_red / lamp_green own emissive materials, lenses face +Z)
      const c = this.sigWallTpl.clone(true); g.add(c); const lamps = {};
      c.traverse((o) => { if (o.isMesh && /^lamp_(red|green)$/.test(o.name)) { o.material = o.material.clone(); lamps[o.name] = o.material; } });
      const setLamp = (m, on, hex) => { if (!m) return; m.color.setHex(0x060606); m.map = null; if (m.emissive) m.emissive.setHex(on ? hex : 0x000000); m.emissiveIntensity = on ? 1.1 : 0; m.needsUpdate = true; m.toneMapped = true; };
      this.sigSet = (green) => { setLamp(lamps.lamp_red, !green, 0xff2a14); setLamp(lamps.lamp_green, green, 0x25ff62); };
      this.sigSet(false); this.sigWall = true;
      if (this.boardsTpl) { const b = this.boardsTpl.getObjectByName('board_speed'); if (b) { this.speedBoard = b.clone(true); this.speedBoard.visible = false; this.scene.add(this.speedBoard); } }
      return { group: g };
    }
    const head = this.kit && this.kit.getObjectByName('signal_head');
    if (head) {
      const c = head.clone(true); g.add(c);
      const lamps = {};
      c.traverse((o) => { if (o.isMesh && o.material && /^button_(red|green|amber)$/.test(o.material.name)) { o.material = o.material.clone(); lamps[o.material.name] = o.material; } });
      this.sigSet = (green) => { if (lamps.button_red) lamps.button_red.emissiveIntensity = green ? 0.04 : 2.2; if (lamps.button_green) lamps.button_green.emissiveIntensity = green ? 2.2 : 0.04; if (lamps.button_amber) lamps.button_amber.emissiveIntensity = 0.04; };
      this.sigSet(false);
      return { group: g };
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), new THREE.MeshLambertMaterial({ color: 0x222428 })); post.position.y = 1.3; g.add(post);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.2), new THREE.MeshLambertMaterial({ color: 0x15171a })); box.position.set(0, 2.4, 0); g.add(box);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); red.position.set(0, 2.58, -0.11);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: 0x23ff6a })); green.position.set(0, 2.24, -0.11);
    g.add(red, green);
    this.sigSet = (gr) => { red.visible = !gr; green.visible = gr; };
    return { group: g };
  }

  // ------------------------------------------------------------------ input
  _bindInput() {
    const canvas = this.canvas;
    this._kd = (e) => this._key(e, true); this._ku = (e) => this._key(e, false);
    addEventListener('keydown', this._kd, true); addEventListener('keyup', this._ku, true);
    addEventListener('blur', this._blur = () => { this.keys.clear(); });   // no stuck movement keys after alt-tab
    let drag = null;
    this._pd = (e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} this.audio.start();
      if (e.pointerType === 'mouse' && !this._modalOpen && !this.paused && document.pointerLockElement !== canvas) this._requestLock(); };
    this._pm = (e) => {
      if (this._forceLock || document.pointerLockElement === canvas) { this._lookDelta(e.movementX || 0, e.movementY || 0); return; }
      if (!drag || e.pointerId !== drag.id) return; this._lookDelta(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY;   // drag-to-look fallback (no pointer lock / denied / touch)
    };
    this._pu = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    canvas.addEventListener('pointerdown', this._pd); canvas.addEventListener('pointermove', this._pm);
    canvas.addEventListener('pointerup', this._pu); canvas.addEventListener('pointercancel', this._pu);
    canvas.style.touchAction = 'none';
    this.zoom = 1; this._wh = (e) => { if (this._modalOpen) return; e.preventDefault(); this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.0015), 1, 5); };   // mouse wheel: zoom in (up to 5x) and back out
    canvas.addEventListener('wheel', this._wh, { passive: false });
    this._plc = () => { this._locked = document.pointerLockElement === canvas; this._hintT = this._locked ? 2.5 : 4; };
    this._ple = () => { this._lockDenied = true; this._locked = false; };
    document.addEventListener('pointerlockchange', this._plc); document.addEventListener('pointerlockerror', this._ple);
    this._mkHint();
  }
  _requestLock() {
    const c = this.canvas; if (!c.requestPointerLock || this._lockDenied > 2) return;
    try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => { this._lockDenied = (this._lockDenied || 0) + 1; }); } catch (_) { this._lockDenied = (this._lockDenied || 0) + 1; }
  }
  _releaseLock() { try { if (document.pointerLockElement === this.canvas) document.exitPointerLock(); } catch (_) {} }
  _mkHint() {
    if (this._hintEl || !this.hud) return; const h = document.createElement('div'); h.className = 'gs-hint';
    h.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:5px 12px;border-radius:999px;background:rgba(18,24,34,.72);color:#dfe8f2;font:12px/1.3 system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .4s;white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis';
    this.hud.root.appendChild(h); this._hintEl = h; this._hintT = 8;
  }
  _updateHint(dt) {
    const h = this._hintEl; if (!h) return;
    const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches && !matchMedia('(pointer: coarse)').matches;
    this._hintT = Math.max(0, (this._hintT || 0) - dt);
    const show = fine && this.mode && !this._modalOpen && this._hintT > 0 && !this._lockDenied;
    h.textContent = this._locked ? 'Esc to release the mouse' : 'Click to look with the mouse - Esc to release';
    h.style.opacity = show ? '0.85' : '0';
  }
  _lookDelta(dx, dy) {
    if (this._modalOpen) return;
    const ms = this.mouse || { sens: 1, invertY: false };
    const k = 0.0042 * ms.sens / (this.zoom || 1); this.look.yaw -= dx * k; this.look.pitch = clamp(this.look.pitch - dy * k * (ms.invertY ? -1 : 1), -1.2, 1.2);
    if (this.mode === 'drive') { this.look.yaw = clamp(this.look.yaw, -2.2, 2.2); this.look.pitch = clamp(this.look.pitch, -0.7, 0.7); }
    this._lookT = this.time;
  }
  _key(e, down) {
    if (this.disposed) return;
    const k = e.key, code = e.code;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (down && e.repeat && !/^Arrow/.test(k)) { if (this.mode) e.preventDefault(); return; }
    const kk = k.length === 1 ? k.toLowerCase() : k;
    if (down) this.audio.start();
    if (!down) { this.keys.delete(kk); if (kk === 'x' || kk === 'Backspace') this.svc && this.svc.setEmergency(false); if (kk === 'r' && this.svc) this.svc.setReverse(false); return; }
    this.keys.add(kk);
    if (kk === 'Escape') { if (this.hud.modalOpen) { if (this.hud.modalKind !== 'start') this.hud.closeModal(); } else this.openMenu('menu'); e.preventDefault(); return; }
    if (this.hud.modalOpen) { if (kk === 'h' && this.hud.modalKind === 'help') this.hud.closeModal(); return; }
    let used = true;
    if (kk === 'h' || kk === '?') this.openHelp();
    else if (kk === 'm') this.action('mute');
    else if (kk === 'l') this.hud.toggleLog();
    else if (kk === 'e' || kk === 'Enter') this.interact();
    else if (kk === 'c' && this.mode !== 'drive' && this.mode !== 'street') this._toggleSit();
    else if (this.mode === 'drive') {
      const s = this.svc;
      if (kk === 'w' || kk === 'ArrowUp') s.stepLever(1);
      else if (kk === 's' || kk === 'ArrowDown') s.stepLever(-1);
      else if (kk === 'x' || kk === 'Backspace') s.setEmergency(true);
      else if (kk === ' ') s.vigilanceReset();
      else if (kk === 'o') { s.openDoors(); }
      else if (kk === 'p') s.closeDoors();
      else if (kk === ',') s.selectDoorSide(-1);
      else if (kk === '.') s.selectDoorSide(1);
      else if (kk === 'a') s.setAto(!s.ato);
      else if (kk === 'r') s.setReverse(true);
      else if (kk === 'c') { this.look.yaw = 0; this.look.pitch = -0.05; }
      else used = /^Arrow/.test(kk);
    } else if (this.mode === 'ride') {
      if (kk === 'n') { this.alightNext = !this.alightNext; this.hud.toast(this.alightNext ? 'You will get off at ' + this.svc.station.name : 'Staying on board', 'info'); }
      else used = /^(w|a|s|d|Shift|Arrow.*)$/.test(kk);
    } else if (this.mode === 'explore' && kk === 'x') { this._crossPlatform(); used = true; }
    else used = /^(w|a|s|d|Shift|Arrow.*| )$/.test(kk);
    if (used) e.preventDefault();
  }

  action(a, el) {
    this.audio.start();
    const s = this.svc;
    if (a.startsWith('mode:')) { this.sel.mode = a.slice(5); this._menuSync(); return; }
    if (a.startsWith('line:')) { this.sel.line = a.slice(5); this._menuSync(); return; }
    if (a.startsWith('diff:')) { this.sel.diff = a.slice(5); this._menuSync(); return; }
    if (a === 'sens:-' || a === 'sens:+') { this.mouse.sens = Math.min(3, Math.max(0.3, +(this.mouse.sens * (a === 'sens:+' ? 1.25 : 0.8)).toFixed(2))); this._saveMouse(); const el2 = this.hud.panel.querySelector('#gs-sens'); if (el2) el2.textContent = this.mouse.sens.toFixed(1) + 'x'; return; }
    if (a === 'invy') { this.mouse.invertY = !this.mouse.invertY; this._saveMouse(); const bt = this.hud.panel.querySelector('[data-a="invy"]'); if (bt) { bt.textContent = 'Invert Y: ' + (this.mouse.invertY ? 'on' : 'off'); bt.classList.toggle('on', this.mouse.invertY); } return; }
    switch (a) {
      case 'menu': this.hud.modalOpen ? this.hud.closeModal() : this.openMenu('menu'); break;
      case 'help': this.openHelp(); break;
      case 'closemodal': this.hud.closeModal(); break;
      case 'mute': this.audio.setMuted(!this.audio.muted); this.hud.setMute(this.audio.muted); break;
      case 'log': this.hud.toggleLog(); break;
      case 'go': { const st = this.panelEl('#gs-st'); if (st) this.sel.station = st.value; this.go(this.sel); break; }
      case 'resume': this.hud.closeModal(); break;
      case 'exit': this.hud.closeModal(); try { this.ctx.onExit && this.ctx.onExit(); } catch (e) { console.error(e); } break;
      case 'sideL': s.selectDoorSide(-1); break;
      case 'sideR': s.selectDoorSide(1); break;
      case 'open': s.openDoors(); break;
      case 'close': s.closeDoors(); break;
      case 'ato': s.setAto(!s.ato); break;
      case 'rev': s.setReverse(!s.reversing); break;
      case 'eb': s.setEmergency(true); setTimeout(() => s.setEmergency(false), 1500); break;
      case 'vig': s.vigilanceReset(); break;
      case 'interact': this.interact(); break;
      case 'alight': this.alightNext = !this.alightNext; this.hud.toast(this.alightNext ? 'You will get off at ' + this.svc.station.name : 'Staying on board', 'info'); break;
    }
  }
  panelEl(sel) { return this.hud.panel.querySelector(sel); }

  openHelp() { this.hud.openModal(HELP_HTML, 'help'); }
  openMenu(kind) {
    const st = this.sel;
    const opts = this.stations.map((s) => `<option value="${s.id}" ${s.id === st.station ? 'selected' : ''}>${s.order + 1}. ${s.name}</option>`).join('');
    const b = (a, label, on) => `<button data-a="${a}" class="${on ? 'on' : ''}">${label}</button>`;
    const html = `<h2>Glasgow Subway - Simulator</h2><div style="color:#9fb3c8;margin-bottom:6px">Ride as the driver, as a passenger, or explore the stations on foot.</div>
<h3>Mode</h3><div class="gs-row">${b('mode:drive', 'Drive the train', st.mode === 'drive')}${b('mode:ride', 'Ride (passenger)', st.mode === 'ride')}${b('mode:explore', 'Explore on foot', st.mode === 'explore')}</div>
<h3>Station</h3><select id="gs-st" aria-label="Station">${opts}</select>
<h3>Line</h3><div class="gs-row">${b('line:outer', 'Outer circle (clockwise)', st.line === 'outer')}${b('line:inner', 'Inner circle (anticlockwise)', st.line === 'inner')}</div>
<h3>Difficulty</h3><div class="gs-row">${b('diff:easy', 'Easy - assisted', st.diff === 'easy')}${b('diff:standard', 'Standard', st.diff === 'standard')}${b('diff:expert', 'Expert', st.diff === 'expert')}</div>
<h3>Mouse look</h3><div class="gs-row">${b('sens:-', 'Slower', false)}<span id="gs-sens" style="align-self:center;min-width:3.2em;text-align:center">${this.mouse.sens.toFixed(1)}x</span>${b('sens:+', 'Faster', false)}${b('invy', 'Invert Y: ' + (this.mouse.invertY ? 'on' : 'off'), this.mouse.invertY)}</div>
<h3>&nbsp;</h3><div class="gs-row">${b('go', 'Go', false).replace('<button', '<button style="background:#e8741a;color:#111;font-weight:700"')}${kind === 'menu' ? b('resume', 'Resume', false) : ''}${b('help', 'Controls', false)}${b('exit', 'Back to explorer', false)}</div>`;
    this.hud.openModal(html, kind);
  }
  /** C: crouch / sit. In the saloon, next to a free bench, sits on it facing across the aisle (eye ~1.13 m above the floor). */
  _toggleSit() {
    const w = this.walker;
    if (w.sit) { w.sit = false; if (this._seat) { w.x = this._seat * 0.45; this._seat = null; } return; }
    this._seat = null;
    if (this.ctxKind === 'train' && this.mode !== 'drive') {
      const sx = this._seatSide();
      if (sx) { this._seat = sx; w.x = sx * 0.74; this.look.yaw = sx * Math.PI / 2; this.look.pitch = 0; w.yaw = this.look.yaw; }
      else if (!this.doorZ.some((dz) => Math.abs(w.z - dz) < 1.0)) this.hud.toast('Those seats are taken', 'info', 2);
    }
    w.sit = true;
  }
  /** which bench the walker would sit on here: the side they stand on, or the other one if that seat is taken (+1 / -1); 0 by a door or with both taken */
  /** Headlights. three.js lights pass through walls, so the beam is shaped to what the bore lets through: it sits at the nose, aims along the track, reaches only
   *  as far as the driver can see round the curve, and inside a running tunnel the wide beam stops at the portal ahead while a narrow shaft - the cone the bore
   *  mouth subtends from the lamp - carries on into the station. (Before: a 40 degree, 90 m cone 12 m ahead of the cab lit the station through the tunnel wall.) */
  _headlight(track, sN, y, power) {
    const H = this.headlight, S = this.headShaft, L = track.length, P = this._hp || (this._hp = [{}, {}, {}]);
    track.pose(sN + 0.6, P[0]);
    // sightline: the furthest point of track whose chord from the lamp stays inside the bore (the arc's sagitta is greatest half way)
    let sight = 9;
    for (let d = 12; d <= 90; d += 3) {
      track.pose(sN + 0.6 + d, P[1]); track.pose(sN + 0.6 + d / 2, P[2]);
      if (Math.hypot(P[2].x - (P[0].x + P[1].x) / 2, P[2].y - (P[0].y + P[1].y) / 2, P[2].z - (P[0].z + P[1].z) / 2) > 1.1) break;
      sight = d;
    }
    track.pose(sN + 0.6 + sight, P[1]);
    const dy = y - P[0].y;
    // distance to the next station hall ahead (0 = the nose is in one)
    let dp = 1e9;
    for (const sp of this._hallSpans || []) { const a = wrapL(sp[0] - sN, L), len = sp[1] - sp[0]; if (wrapL(sN - sp[0], L) < len) { dp = 0; break; } if (a < dp) dp = a; }
    const reach = Math.min(90, sight + 6);
    for (const l of [H, S]) { l.position.set(P[0].x, y, P[0].z); l.target.position.set(P[1].x, P[1].y + dy, P[1].z); }
    H.intensity = power; H.distance = dp > 0 ? Math.max(6, Math.min(reach, dp + 6)) : reach;
    const through = dp > 0 && dp < reach;
    S.intensity = through ? power : 0; S.distance = reach;
    if (through) S.angle = Math.max(0.03, Math.min(0.7, Math.atan2(1.9, dp)));
  }
  _seatSide() {
    const w = this.walker, tv = this.trainView; if (this.ctxKind !== 'train' || !tv || this.doorZ.some((dz) => Math.abs(w.z - dz) < 1.0)) return 0;
    const busy = (sx) => !!this.saloon && this.saloon.people.some((p) => p.state === 'sit' && p.obj && Math.sign(p.x) === sx && Math.abs(p.z + tv.carInfo[tv.cars.indexOf(p.parent)].zc - w.z) < 0.5);
    const first = w.x >= 0 ? 1 : -1; return !busy(first) ? first : !busy(-first) ? -first : 0;
  }
  _saveMouse() { try { localStorage.setItem('gs.mouse', JSON.stringify(this.mouse)); } catch (_) {} }
  _menuSync() { for (const bt of this.hud.panel.querySelectorAll('button[data-a]')) { const a = bt.dataset.a; const m = /^(mode|line|diff):(.*)/.exec(a); if (m) bt.classList.toggle('on', this.sel[m[1]] === m[2]); } }

  // ------------------------------------------------------------------ interaction
  interact() {
    if (this.walker.sit) this._toggleSit();
    const c = this.context;
    if (!c) return;
    if (c.kind === 'board') this._boardTrain();
    else if (c.kind === 'street') this.enterStreet();
    else if (c.kind === 'portal') this._toAccess(c.pt);
    else if (c.kind === 'platform') this._toPlatform();
    else if (c.kind === 'descend') this.leaveStreet();
    else if (c.kind === 'cab') this._takeCab();
    else if (c.kind === 'alight') this._alight();
    else if (c.kind === 'board2') this._boardOther();
    else if (c.kind === 'stepout') this._stepOut();
  }

  _computeContext() {
    const w = this.walker, svc = this.svc; this.context = null; let msg = '';
    if (this.mode === 'explore') {
      const v = this.activeStation, inf = v.info;
      if (svc.phase === 'station' && svc.doorsOpen) {
        const zc = this._trainCentreZl();
        const nearEdge = Math.abs(w.x - inf.xe) < 2.4 && Math.abs(w.y - inf.PY) < 0.5;
        const nearDoor = this.doorZ.some((dz) => Math.abs(w.z - (zc + dz)) < 1.6);
        if (nearEdge && nearDoor) { this.context = { kind: 'board' }; msg = '<kbd>E</kbd> Board the train'; }
        else if (nearEdge) msg = 'Walk to a door to board';
      }
      { const bg = this.bg, bp = this._bgPlat();
        if (!this.context && bg && bg.mode === 'shuttle' && bg.svc.phase === 'station' && bg.svc.doorsOpen && bp) {
          const zc = (bg.svc.train.s - this.trainLen / 2) - (bg.svc.targetU - bg.svc.stop.cabOff);
          const nearEdge = Math.abs(w.x - bp.edge) < 2.4 && w.x >= bp.pl.x0 - 0.1 && w.x <= bp.pl.x1 + 0.1 && Math.abs(w.y - inf.PY) < 0.5;
          const nearDoor = this.doorZ.some((dz) => Math.abs(w.z - (zc + dz)) < 1.6);
          const nm = bg.line === 'outer' ? 'outer circle (clockwise)' : 'inner circle (anticlockwise)';
          if (nearEdge && nearDoor) { this.context = { kind: 'board2' }; msg = `<kbd>E</kbd> Board the ${nm} train`; }
          else if (nearEdge) msg = `The ${nm} train is in: walk to a door`;
        } }
      if (inf.hall && !this.context) {
        for (const pt of (v.anchors.portals || [])) {
          const st = pt.stair, near = Math.hypot(w.x - pt.x, w.z - pt.z) < 1.7 && w.y < inf.PY + 0.5;
          const on = !!st && w.x > st.x0 - 0.05 && w.x < st.x1 + 0.05 && w.z > st.z0 - 0.05 && w.z < st.z1 + 0.05;     // on the flight (or its landing)
          if (on && (w.z - st.exitZ) * st.dir >= 0 && w.y > st.yTop - 0.3 && !this.fadeLock) this._toAccess(pt);       // reached the top: through to the ticket hall
          if (near || on) { this.context = { kind: 'portal', pt }; msg = on ? '<kbd>E</kbd> Go up to the ticket hall' : '<kbd>E</kbd> Take the stairs up to the ticket hall'; break; }
        }
        const ad = v.anchors.accessDoor;
        if (!this.context && ad && w.y < inf.PY + 0.6 && Math.hypot(w.x - ad.x, w.z - ad.z) < 1.8 && w.z < inf.rampZ0 + 2.4) { this.context = { kind: 'platform' }; msg = '<kbd>E</kbd> Go back down to the platform'; }
      }
      const a = v.anchors.exit;
      if (!this.context && Math.hypot(w.x - a.x, w.z - a.z) < 2.2 && w.y > a.y - 0.6) { this.context = { kind: 'street' }; msg = '<kbd>E</kbd> Go outside to the street'; }
      if (!this.context) {
        // facts caption
        for (const p of (v.anchors.panels || [])) if (Math.abs(w.z - p.z) < 3.2 && Math.abs(w.x - p.x) < 7 && w.y < inf.PY + 0.5) { msg = `<b>${p.title}</b> ${p.body.slice(0, 160)}`; break; }
        if (!msg) for (const p of (v.anchors.conPanels || [])) if (w.y > inf.Hc - 0.5 && Math.abs(w.z - (p.z + 4.8)) < 3.5 && w.x > inf.rc + 4) { msg = p.body.slice(0, 160); break; }
      }
      if (v.info.hall && v.anchors.hallPlat && v.anchors.hallPlat.length > 1 && !this.context && w.y < inf.PY + 0.5) msg = (msg ? msg + '  ' : '') + '<kbd>X</kbd> Cross to the other platform';
      if (!msg) { const sh = this.shuttle; if (sh.state === 'wait' || sh.state === 'leaving') msg = `Next train in ${fmtTime(this._shuttleEta(sh, svc))}`; else if (sh.state === 'arriving') msg = `Train approaching ${fmtDist(Math.max(0, svc.distToStop))}`; }
    } else if (this.mode === 'ride') {
      if (w.z < -(this.trainLen / 2 - 2.6)) { this.context = { kind: 'cab' }; msg = '<kbd>E</kbd> Take the driver\'s seat'; }
      else if (svc.phase === 'station' && svc.doorsOpen && (this.alightNext || true)) {
        const nearDoor = this.doorZ.some((dz) => Math.abs(w.z - dz) < 1.6) && Math.abs(w.x) > 0.45;
        if (nearDoor) { this.context = { kind: 'alight' }; msg = `<kbd>E</kbd> Step off at ${svc.station.name}`; }
        else msg = `${svc.station.name}: walk to an open door and press E to get off`;
      } else if (this.alightNext) msg = `Getting off at ${svc.station.name}`;
      if (w.sit) msg = (msg ? msg + '  ' : '') + '<kbd>C</kbd> Stand up'; else if (!this.context && this._seatSide()) msg = (msg ? msg + '  ' : '') + '<kbd>C</kbd> Sit down';
    } else if (this.mode === 'street') {
      const st = this.street; if (Math.hypot(w.x - st.stair.x, w.z - st.stair.z) < 4.2) { this.context = { kind: 'descend' }; msg = '<kbd>E</kbd> Take the stairs down to the platform'; }
      else msg = 'Walk back to the station entrance to go underground';
    }
    if (this.mode === 'drive' && svc.phase === 'station' && svc.doorsOpen && svc.train.v < 0.1) { this.context = { kind: 'stepout' }; msg = '<kbd>E</kbd> Step out onto the platform'; }
    this.hud.prompt(msg);
  }

  // ------------------------------------------------------------------ simulation tick
  tick(dt) {
    const svc = this.svc; if (!svc) return;
    this.time += dt; if (this.fleet) this.fleet.advance(dt);
    let n = Math.ceil(dt / 0.05); const h = dt / n;
    // someone in a doorway (passenger walking through an open door) holds the doors; resumes when clear
    { const w = this.walker; let obs = false;
      if (this.mode === 'ride' && this.ctxKind === 'train' && svc.phase === 'station' && (svc.doors.L > 0.02 || svc.doors.R > 0.02)) obs = Math.abs(w.x) > 0.8 && this.doorZ.some((dz) => Math.abs(w.z - dz) < 0.62);
      if (obs && !svc.doorObstructed && !svc.doors.cmdL && !svc.doors.cmdR) this.hud.toast('Doors held - something is in the doorway', 'warn', 2.5);
      svc.doorObstructed = obs; }
    { const bg = this.bg, run = bg && bg.svc && this.mode !== 'street' && !(bg.mode === 'shuttle' && (bg.sh.state === 'wait' || bg.sh.state === 'none'));
      for (let i = 0; i < n; i++) { svc.update(h); if (run) bg.svc.update(h); }
      if (this.mode === 'explore' && bg && bg.mode === 'shuttle') this._bgShuttle(dt); }
    // walker
    const w = this.walker;
    if (this.mode !== 'drive') {
      let fwd = 0, str = 0;
      if (this.keys.has('w')) fwd += 1; if (this.keys.has('s')) fwd -= 1; if (this.keys.has('d')) str += 1; if (this.keys.has('a')) str -= 1;
      if (this.hud.joy.x || this.hud.joy.y) { str += this.hud.joy.x; fwd -= this.hud.joy.y; }
      if (this.keys.has('ArrowLeft')) this.look.yaw += 1.8 * dt; if (this.keys.has('ArrowRight')) this.look.yaw -= 1.8 * dt;
      if (this.keys.has('ArrowUp') && this.mode !== 'drive') fwd += 1; if (this.keys.has('ArrowDown')) fwd -= 1;
      w.sprint = this.keys.has('Shift');
      if (w.sit && (fwd || str) && w.sitK > 0.9) this._toggleSit();
      w.yaw = this.look.yaw;
      if (this.mode === 'ride') {
        // walker lives in train-local space; moves with the train
        w.update(dt, clamp(fwd, -1, 1), clamp(str, -1, 1));
      } else w.update(dt, clamp(fwd, -1, 1), clamp(str, -1, 1));
    } else {
      if (this.keys.has('ArrowLeft')) this.look.yaw = clamp(this.look.yaw + 1.6 * dt, -2.2, 2.2);
      if (this.keys.has('ArrowRight')) this.look.yaw = clamp(this.look.yaw - 1.6 * dt, -2.2, 2.2);
    }
    // shuttle (explore): recycle trains
    if (this.mode === 'explore') this._shuttle(dt);
    this._exchange(dt);
    if (this.mode === 'ride' && this.alightNext === false) {}
    // approach announcements
    if (this.mode !== 'explore' && this.mode !== 'street' && svc.phase === 'run' && !this.annDone && svc.distToStop < 250) {
      this.annDone = true; this._announce(`Approaching ${svc.station.name}`);
    }
    if (this.mode === 'street' && this.street) { /* nothing */ }
  }

  _shuttle(dt) {
    const sh = this.shuttle, svc = this.svc, rec = this.tracks[this.line];
    if (sh.state === 'wait' || sh.state === 'leaving') { const d = this._nextDue(this.line, sh.idx); sh.timer = d.eta - ARRIVE_S; sh.due = d.unit; }   // one countdown, the roster's: it only ever falls
    if (sh.state === 'leaving') {   // the train runs on into the bore and is only recycled once its tail is out of sight (never while it is still in the platform)
      sh.t += dt;
      if (this._tailPast(this.tracks[this.line], this.exploreIdx) > CLEAR_TAIL || sh.t > 70) { this.trainView.root.visible = false; sh.state = 'wait'; svc.train.v = 0; }
    } else if (sh.state === 'wait') {
      if (sh.timer <= 0) {
        this._setUnit(rec, sh.due); if (sh.runs) this._refillSaloon(this.trainView); sh.runs = (sh.runs || 0) + 1;
        svc.placeApproaching(sh.idx, 220, 9); svc.ato = true; svc.autoDoors = true; this.trainView.root.visible = true; sh.state = 'arriving'; sh.arrT = 0; svc._autoOpened = false; svc._autoClosed = false;
      }
    } else if (sh.state === 'arriving') sh.arrT = (sh.arrT || 0) + dt;
    // platform people queue at the doors while the train arrives, then board when the doors open
    if (sh.state === 'arriving' && !sh.queued && this.activeStation && this.crowdFor && this.crowd.queue) {   // (crowdFor: the platform is populated - a queue of nobody would still use up this train)
      sh.queued = true; const v = this.activeStation, inf = v.info, zc = this._stopCentreZl(), slots = [];
      for (let i = 0; i < this.doorZ.length; i++) for (const o of [-0.55, 0.55]) slots.push({ x: inf.xe + inf.S * (0.75 + 0.1 * (i % 2)), z: zc + this.doorZ[i] + o, yaw: inf.S > 0 ? Math.PI / 2 : -Math.PI / 2 });
      this.crowd.queue(Math.min(8, Math.round(v.crowdN * 0.3)), slots);
    }
    if (sh.state === 'wait' || sh.state === 'none') sh.queued = false;
  }
  fastForward(sec, step = 0.1) { for (let t = 0; t < sec; t += step) this.tick(step); }

  // ------------------------------------------------------------------ rendering
  _resize() {
    const r = this.renderer, c = this.canvas;
    const w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
    if (this.camera) { this.camera.aspect = w / h; this._applyFov(); }
    r.setSize(w, h, false);
  }
  frame(now) {
    if (this.disposed) return;
    const dt = clamp((now - this.lastNow) / 1000, 0, 0.1) || 0.016; this.lastNow = now;
    try {
      if (!this.paused && !this._modalOpen && this.mode) { this.tick(dt * this.timeScale); }
      if (this.mode) this.sync(dt);
      const scene = this.mode === 'street' && this.street ? this.street.scene : this.scene;
      this.renderer.render(scene, this.camera);
      if (this._onStationFrame && this.mode) this._onStationFrame();
    } catch (e) { console.error('[sim] frame error', e); this.errors.push(String(e && e.stack || e)); if (this.errors.length > 5) this.renderer.setAnimationLoop(null); }
  }

  /** Vertical FOV by mode, widened for portrait so the horizontal FOV stays wide. */
  _applyFov() {
    const cam = this.camera, drive = this.mode === 'drive', base = drive ? 78 : 92, asp = cam.aspect || 1.6;
    const href = 2 * Math.atan(Math.tan(base * Math.PI / 360) * 16 / 9);
    let v = asp >= 16 / 9 ? base : 2 * Math.atan(Math.tan(href / 2) / asp) * 180 / Math.PI;
    v = Math.min(v, drive ? 105 : 116);
    if (this.zoom > 1) v = 2 * Math.atan(Math.tan(v * Math.PI / 360) / this.zoom) * 180 / Math.PI;
    if (Math.abs(cam.fov - v) > 0.01) { cam.fov = v; cam.updateProjectionMatrix(); }
  }

  sync(dt) {
    this._applyFov(); this._updateHint(dt);
    const THREE = this.THREE, svc = this.svc, tr = svc.train, cam = this.camera, track = this.track;
    const underground = this.mode !== 'street';
    if (underground) {
      if (this.crowd.setWalker) this.crowd.setWalker(this.walker.x, this.walker.z, this.walker.yaw, this.mode === 'explore');   // before the crowd is (re)populated
      this._mgrT = (this._mgrT || 0) - dt; if (this._mgrT <= 0) { this._mgrT = 0.4; this._manageStations(); }
      this._indT = (this._indT || 0) - dt; if (this._indT <= 0) { this._indT = 0.5; this._updateIndicators(); }
      this.trainView.place(track, tr.s); this.trainView.setDriveCab(this.mode === 'drive'); this._bgUpdateView(dt);
      const d = svc.doors; this.trainView.setDoors(d.L, d.R);
      if (this.mode === 'explore') { if (this._tw !== 'x') { this.tunnel.setWindow(60, 45); this._tw = 'x'; } this.tunnel.update(track, track.stops[this.exploreIdx].sc); }
      else { if (this._tw !== 'd') { this.tunnel.setWindow(75, 22); this._tw = 'd'; } this.tunnel.update(track, this.mode === 'ride' ? tr.s - (this.walker.z - this.trainView.zMin) : tr.s - 1.8); }
      for (const v of this.stationViews.values()) {
        v.update(this.time);
        const lv = v.group.userData.psdLeaves;
        if (lv && lv.length) { const open = svc.phase === 'station' && svc.idx === v.stopIdx && (svc.doors.L > 0.04 || svc.doors.R > 0.04); for (const m of lv) m.visible = !open; }
      }
      this.crowd.update(dt, this.time, (x, z, y) => y, this.camera.position); this._updateRats(this.paused || this._modalOpen ? 0 : dt);
      this._updateSaloons(dt);
      this._signal(svc);
      this.tms.update(dt, svc.info(), this.mode);
      // lights
      const front = new THREE.Vector3(), q = new THREE.Quaternion(); this.trainView.eyeWorld(front, q);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      this._headlight(track, tr.s, front.y - 0.6, this.mode === 'explore' && !this.trainView.root.visible ? 0 : 160);
      // running tunnels are unlit: dim ambient between stations, full level inside / near a hall (smooth ramp)
      { let f = 1; if (this.mode !== 'explore') { let md = 1e9; const L = track.length, sN = tr.s; for (const st of track.stops) { let d = Math.abs(sN - st.sc); d = Math.min(d, L - d); if (d < md) md = d; } f = Math.min(1, Math.max(0, (68 - md) / 30)); f = f * f * (3 - 2 * f); }
        // (the tunnel's own surfaces lose the ambient light, not the scene: dimming the scene's ambient made the inside of the train and its passengers go dark between stations)
        const a = 0.135 + (1 - 0.135) * f; this._tunAmb = this._tunAmb == null ? a : this._tunAmb + (a - this._tunAmb) * Math.min(1, dt * 4 + (dt === 0 ? 1 : 0)); this.tunnel.setAmbient(this._tunAmb); }
      this.cabLight.position.copy(front).add(new THREE.Vector3(0, 0.4, 0)).addScaledVector(fwd, -0.2);
      this._lightPool();
      this._camera(front, q, dt);
      if ((this._cullT = (this._cullT || 0) - dt) <= 0) { this._cullT = 0.3; this.trainView.cull(cam.position, this.mode, this.quality === 'low'); }
    } else {
      const w = this.walker; cam.position.set(w.x, w.y + w.eye + Math.sin(w.bob) * 0.03, w.z);
      cam.rotation.set(this.look.pitch, w.yaw, 0, 'YXZ');
    }
    this._clearOfPeople(cam);
    // audio
    const inTrain = this.ctxKind === 'train';
    this.audio.update({ v: tr.v, traction: tr.tractionAct, brake: tr.brakeAct, curv: track.curvature(tr.s), inTrain, doorsOpen: svc.doors.L > 0.1 || svc.doors.R > 0.1 });
    // HUD
    this._computeContext();
    const info = svc.info();
    const upNext = svc.phase === 'depart' ? (svc.stationById.get(svc.stops[(svc.idx + 1) % svc.stops.length].station) || svc.station) : svc.station;
    const unit = (this.tracks[this.line] || {}).unit;
    let title = 'Next: ' + upNext.name, distText = svc.phase === 'station' ? '' : svc.phase === 'depart' ? '' : fmtDist(Math.max(0, svc.distToStop)), sub = '';
    if (this.mode === 'drive') {
      sub = svc.phase === 'station' ? (svc.doorsClosed ? (svc.signalGreen ? 'Signal clear - depart' : `Dwell ${Math.ceil(info.dwellLeft)} s`) : 'Doors open') : `${this.line === 'outer' ? 'Outer' : 'Inner'} circle - ${svc.diff.label}`;
      if (unit != null) sub = `Train ${unit} - ${sub}`;
      if (svc.phase === 'station') title = 'At: ' + svc.station.name;
    } else if (this.mode === 'ride') { title = svc.phase === 'station' ? 'At: ' + svc.station.name : 'Next: ' + upNext.name; sub = (unit != null ? `Train ${unit} - ` : '') + (this.alightNext ? 'Getting off here' : 'N: get off at next stop'); }
    else if (this.mode === 'explore') { title = this.activeStation ? this.activeStation.station.name : ''; { const sh = this.shuttle, tn = sh.state === 'wait' || sh.state === 'leaving' ? sh.due : unit, nm = tn != null ? ` ${tn}` : ''; sub = sh.state === 'wait' || sh.state === 'leaving' ? `Next train${nm} in ${fmtTime(this._shuttleEta(sh, svc))}` : (sh.state === 'arriving' ? `Train${nm} arriving` : sh.state === 'dwell' ? `Train${nm} at platform` : ''); } distText = ''; }
    else if (this.mode === 'street') { title = 'Street level'; sub = ''; distText = ''; }
    let late = null;
    if (this.mode === 'drive' && svc.schedule) { const sched = svc.schedule.arr[svc.idx] + svc.lap * svc.schedule.period + (svc.t0 || 0); late = svc.phase === 'station' ? (svc.stopStatus && svc.stopStatus.late) : Math.max(svc.t - sched, -999); if (late != null && svc.phase !== 'station' && late < 0) late = null; }
    this.hud.update(info, { title, distText, sub, late });
    // in-car screens: the player's train knows its next stop; the other circle's train shows the logo and adverts
    for (const v of Object.values(this.views)) if (v && v.updatePis) v.updatePis(this.time, v === this.trainView ? { line: this.line, next: upNext.name, at: svc.phase === 'station' } : null);
  }

  /** explore only: the occasional rat on the track bed of the station you are standing in (see rats.js) */
  _updateRats(dt) {
    const R = this.rats; if (!R) return;
    const v = this.activeStation, on = this.mode === 'explore' && this.ctxKind === 'station' && v && v.info && v.info.hall;
    if (!on) { if (R.view) R.detach(); return; }
    R.attach(v);
    const sh = this.shuttle, bg = this.bg, w = this.walker;
    R.update(dt, { walker: { x: w.x, z: w.z, y: w.y }, own: { state: sh.state, timer: sh.timer }, other: bg && bg.mode === 'shuttle' && bg.sh ? { state: bg.sh.state, timer: bg.sh.timer } : null });
  }
  _ratEvent(kind, r) {
    if (kind !== 'bolt' || !this.audio || !this.audio.squeak) return;
    const w = this.walker, d = Math.hypot(w.x - r.x, w.z - r.z);
    if (d < 16) this.audio.squeak(Math.min(1, 3 / Math.max(d, 1.5)));
  }

  /** The eye never goes inside a person. Nothing stopped the player walking into one (people step aside for the player, but not seated or walking ones, and not at once), and from
   *  inside a head the back faces are not drawn: you saw out through an empty skull. The camera is slid sideways out of a 0.4 m circle round anyone it is within the height of
   *  (people on the platform and riders in both trains; in drive mode there is nobody in the cab). */
  _clearOfPeople(cam) {
    if (this.mode === 'drive' || this.mode === 'street') return;
    const R = 0.4, crowds = [this.crowd]; for (const tv of Object.values(this.views || {})) if (tv && tv.saloon && tv.root.visible) crowds.push(tv.saloon);
    for (let pass = 0; pass < 2; pass++) for (const c of crowds) for (const p of (c && c.people) || []) {
      const o = p.obj; if (!o || !o.visible) continue; const e = o.matrixWorld.elements, dx = cam.position.x - e[12], dz = cam.position.z - e[14];
      if (Math.abs(dx) > R || Math.abs(dz) > R || cam.position.y < e[13] - 0.1 || cam.position.y > e[13] + 2.0) continue;
      const d = Math.hypot(dx, dz); if (d >= R) continue;
      if (d < 1e-4) { cam.position.x += R; continue; }
      cam.position.x += dx / d * (R - d); cam.position.z += dz / d * (R - d);
    }
  }

  _lightPool() {
    const cam = this.camera.position, THREE = this.THREE, cands = [];
    const v = this._lp || (this._lp = new THREE.Vector3());
    for (const sv of this.stationViews.values()) for (const d of sv.lights) { v.set(d.x, d.y, d.z); sv.group.localToWorld(v); cands.push({ x: v.x, y: v.y, z: v.z, d, dist: v.distanceToSquared(cam) }); }
    // saloon lights ride with the train
    const mid = this.trainView.cars[Math.floor(this.trainView.cars.length / 2)];
    const on = this.trainView.root.visible; [-5, 5].forEach((zz, i) => { const l = this.saloonLights[i]; l.intensity = on ? 4 : 0; if (on) { v.set(0, 2.3, zz).applyMatrix4(mid.matrix); l.position.copy(v); } });
    cands.sort((a, b) => a.dist - b.dist);
    this.poolLights.forEach((l, i) => { const c = cands[i]; if (c) { l.position.set(c.x, c.y, c.z); l.color.set(c.d.c); l.intensity = c.d.i; l.distance = c.d.d; } else l.intensity = 0; });
  }

  _signal(svc) {
    const g = this.sigMesh.group, tr = this.track;
    const d = svc.sigU - svc.train.s; const show = d > -30 && d < 280 && this.mode !== 'explore';
    g.visible = show;
    const sb = this.speedBoard;
    if (sb) { const ub = svc.targetU - 130, db = ub - svc.train.s; const sh = db > -20 && db < 260 && this.mode !== 'explore' && svc.phase === 'run'; sb.visible = sh;
      if (sh) { const p = tr.pose(ub, this._sp2 || (this._sp2 = {})); sb.position.set(p.x - p.tz * 1.32, p.y - 0.18, p.z + p.tx * 1.32); sb.rotation.y = Math.atan2(-p.tx, -p.tz); } }
    if (!show) return;
    const p = tr.pose(svc.sigU, this._sp || (this._sp = {}));
    const rx = -p.tz, rz = p.tx; // right
    g.scale.setScalar(1.6); if (this.sigWall) { g.position.set(p.x + rx * 1.3, p.y + 1.95, p.z + rz * 1.3); g.rotation.y = Math.atan2(-p.tx, -p.tz); }
    else { g.position.set(p.x + rx * 1.75, p.y - 0.1, p.z + rz * 1.75); g.rotation.y = Math.atan2(-p.tx, -p.tz) + Math.PI; }
    this.sigSet(!!svc.signalGreen);
  }

  _camera(front, q, dt) {
    const THREE = this.THREE, cam = this.camera, svc = this.svc, tr = svc.train;
    const e = this._e || (this._e = new THREE.Euler()), ql = this._ql || (this._ql = new THREE.Quaternion());
    if (this.mode === 'drive') {
      // low-frequency sway only (0.3-1.5 Hz, small, scales with speed); body lean on curves is low-passed. No high-frequency head jitter.
      const T = this.time, f = Math.min(1, tr.v / 12), TP = Math.PI * 2, cur = this.track.curvature(tr.s);
      const lt = Math.max(-0.016, Math.min(0.016, cur * tr.v * tr.v * 0.02));
      this._lean = (this._lean || 0) + (lt - (this._lean || 0)) * Math.min(1, dt * 1.2);
      const sw = (this.quality === 'low' ? 0.8 : 1) * f;
      const lat = sw * (0.0045 * Math.sin(TP * 0.55 * T + 0.7) + 0.002 * Math.sin(TP * 1.3 * T)) + this._lean * 0.25;
      const vert = sw * (0.0028 * Math.sin(TP * 0.85 * T + 2.1) + 0.0012 * Math.sin(TP * 1.45 * T + 0.4));
      const rollA = sw * (0.0022 * Math.sin(TP * 0.45 * T) + 0.0011 * Math.sin(TP * 1.1 * T + 1.3)) - this._lean * 0.5;
      const off = new THREE.Vector3(lat, vert, 0).applyQuaternion(q);
      cam.position.copy(front).add(off);
      e.set(this.look.pitch, this.look.yaw, rollA, 'YXZ'); ql.setFromEuler(e); cam.quaternion.copy(q).multiply(ql);
    } else if (this.mode === 'ride') {
      const w = this.walker, ci = this.trainView.carAt(w.z), car = this.trainView.cars[ci], info = this.trainView.carInfo[ci];
      const local = new THREE.Vector3(w.x, w.eyeY(), w.z - info.zc);
      cam.position.copy(local).applyMatrix4(car.matrix);
      const cq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(car.matrix));
      e.set(this.look.pitch, w.yaw, 0, 'YXZ'); ql.setFromEuler(e); cam.quaternion.copy(cq).multiply(ql);
      // gentle low-frequency sway only (rumble is audio-only)
      cam.position.y += Math.sin(this.time * 5.3) * 0.0015 * Math.min(1, tr.v / 10);
    } else if (this.mode === 'explore') {
      const w = this.walker, g = this.activeStation.group;
      const p = new THREE.Vector3(w.x, w.eyeY(), w.z); g.localToWorld(p); cam.position.copy(p);
      e.set(this.look.pitch, w.yaw, 0, 'YXZ'); ql.setFromEuler(e); cam.quaternion.copy(g.quaternion).multiply(ql);
    }
  }

  // ------------------------------------------------------------------ test: train swept volume vs solid station meshes
  /** Moves the real train model along the track through station i and ray-casts every cross-section hull point
   *  between consecutive poses against the station's meshes. Returns { hits: [{s, mesh, point}], poses, samples }. */
  sweepStation(i, o = {}) {
    const THREE = this.THREE, tv = this.trainView, track = this.track, stop = track.stops[i];
    const view = this._ensureStation(i); view.group.updateMatrixWorld(true);
    if (!this._sweepPts) {
      // hull of the train cross-section from exterior mesh vertices
      const pts = [], v = new THREE.Vector3();
      tv.root.traverse((m) => { if (m.isMesh && /exterior|cab$/.test(m.name || (m.parent && m.parent.name) || '')) { const p = m.geometry.attributes.position; for (let k = 0; k < p.count; k += 3) { v.fromBufferAttribute(p, k); pts.push([v.x, v.y]); } } });
      // convex hull (monotone chain) on (x,y)
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o2, a, b) => (a[0] - o2[0]) * (b[1] - o2[1]) - (a[1] - o2[1]) * (b[0] - o2[0]);
      const lo = []; for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
      const up = []; for (let k = pts.length - 1; k >= 0; k--) { const p = pts[k]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
      const hull = lo.slice(0, -1).concat(up.slice(0, -1));
      this._sweepHull = hull;
      const zs = [tv.zMin + 0.05, tv.zMax - 0.05];
      const stride = Math.max(1, Math.ceil(hull.length / 28));
      this._sweepPts = []; for (const z of zs) hull.forEach((h, k) => { if (k % stride === 0) this._sweepPts.push(new THREE.Vector3(h[0], h[1], z)); });
    }
    const meshes = []; view.group.traverse((m) => { if (m.isMesh) meshes.push(m); });
    const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
    const step = o.step || 1.0, range = o.range || 70;
    const prev = [], hits = []; const wv = new THREE.Vector3(), dv = new THREE.Vector3();
    let poses = 0;
    for (let d = -range; d <= range; d += step) {
      const sF = stop.sc + this.trainLen / 2 + d;   // front chainage
      tv.place(track, sF);
      const cur = this._sweepPts.map((p) => { const ci = tv.carAt(p.z); const car = tv.cars[ci]; return wv.set(p.x, p.y, p.z - tv.carInfo[ci].zc).applyMatrix4(car.matrix).clone(); });
      if (prev.length) {
        for (let k = 0; k < cur.length; k++) {
          dv.subVectors(cur[k], prev[k]); const len = dv.length(); if (len < 1e-6) continue; dv.normalize();
          rc.set(prev[k], dv); rc.near = 0; rc.far = len + 0.02;
          const h = rc.intersectObjects(meshes, false);
          if (h.length) hits.push({ s: +(sF - stop.s).toFixed(1), mesh: (h[0].object.name || h[0].object.geometry.type) + (h[0].object.userData.tag ? ':' + h[0].object.userData.tag : ''), pt: view.group.worldToLocal(h[0].point.clone()).toArray().map((x) => +x.toFixed(2)), from: this._sweepPts[k].toArray().map((x) => +x.toFixed(2)) });
        }
      }
      for (let k = 0; k < cur.length; k++) prev[k] = cur[k];
      poses++;
    }
    return { hits, poses, samples: this._sweepPts.length, station: view.station.name, side: view.info.S, island: view.info.island };
  }

  /** Sweeps the train through the n tightest curves of the current line against the tunnel lining meshes. */
  sweepCurves(n = 8, o = {}) {
    const THREE = this.THREE, tv = this.trainView, track = this.track, L = track.length;
    if (!this._sweepPts) this.sweepStation(0, { range: 1 });
    // pick the n tightest-curvature spots (at least 150 m apart), outside station spans
    const cands = []; for (let s = 0; s < L; s += 4) cands.push([s, Math.abs(track.curvature(s))]);
    cands.sort((a, b) => b[1] - a[1]);
    const picks = []; for (const [s, k] of cands) { if (picks.length >= n) break; if (this.tunnel._skipped(s, L)) continue; if (picks.every((p) => Math.abs(((p.s - s + L / 2) % L + L) % L - L / 2) > 150)) picks.push({ s, k }); }
    const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
    const out = [], wv = new THREE.Vector3(), dv = new THREE.Vector3();
    for (const pk of picks) {
      const hits = []; let prev = null, worst = 0;
      for (let d = -22; d <= 22; d += o.step || 1.5) {
        const sF = pk.s + tv.length / 2 + d;
        tv.place(track, sF); this.tunnel.reset(); this.tunnel.update(track, sF - 1.8);
        this.tunnel.group.updateMatrixWorld(true);
        const meshes = []; this.tunnel.group.traverse((m) => { if (m.isMesh) meshes.push(m); });
        const cur = this._sweepPts.map((p) => { const ci = tv.carAt(p.z); return wv.set(p.x, p.y, p.z - tv.carInfo[ci].zc).applyMatrix4(tv.cars[ci].matrix).clone(); });
        if (prev) for (let k = 0; k < cur.length; k++) {
          dv.subVectors(cur[k], prev[k]); const len = dv.length(); if (len < 1e-6) continue; dv.normalize();
          rc.set(prev[k], dv); rc.near = 0; rc.far = len + 0.02;
          const h = rc.intersectObjects(meshes, false); if (h.length) hits.push({ d, k, mesh: h[0].object.name || h[0].object.geometry.type });
        }
        prev = cur;
      }
      out.push({ s: +pk.s.toFixed(0), R: +(1 / Math.max(pk.k, 1e-6)).toFixed(0), hits: hits.length, first: hits[0] });
    }
    return out;
  }

  // ------------------------------------------------------------------ misc
  getState() {
    const svc = this.svc; if (!svc) return {};
    return { mode: this.mode, line: this.line, station: svc.station.name, kmh: svc.train.v / KMH, unit: (this.tracks[this.line] || {}).unit, phase: svc.phase, score: svc.score.total, stops: svc.score.stopsDone, paused: this.paused };
  }
  _exposeHooks() {
    const self = this;
    window.__sim = {
      sim: this,
      state: () => this.getState(), fleet: () => this.fleet, unit: (line) => (this.tracks[line || this.line] || {}).unit, due: (line, id) => this._lineDue(line, id), bg: () => this.bg, boardOther: () => this._boardOther(), cross: () => this._crossPlatform(), info: () => this.svc.info(), svc: () => this.svc,
      go: (sel) => this.go(sel), tick: (dt) => this.tick(dt), ff: (s, st) => this.fastForward(s, st), sync: () => { this._mgrT = 0; this.sync(0.016); },
      ato: (on) => this.svc.setAto(on), key: (k, down = true) => this._key({ key: k, code: k, repeat: false, preventDefault() {}, target: document.body }, down),
      interact: () => this.interact(), context: () => this.context, mode: () => this.mode,
      teleportWalker: (x, z) => this.walker.place(x, z), walker: () => this.walker, station: () => this.activeStation,
      shuttle: () => this.shuttle, openMenu: () => this.openMenu('menu'), errors: () => this.errors,
      stationView: async (i) => this._prepare(i),
      peopleAudit: () => this._peopleAudit(), phoneAudit: () => this._phoneAudit(), phones: (on) => { for (const cr of [this.crowd, ...Object.values(this.views).map((tv) => tv.saloon)]) if (cr && cr.setPhones) cr.setPhones(on); }, rats: () => this.rats,
      saloons: () => { const out = {}, cam = this.camera.position, v = new this.THREE.Vector3(); for (const [line, tv] of Object.entries(this.views)) { const sc = tv.saloon, perCar = tv.cars.map(() => 0), shown = tv.cars.map(() => 0), near = tv.cars.map(() => 0); if (sc) for (const q of sc.people) { const ci = tv.cars.indexOf(q.parent); if (ci >= 0) { perCar[ci]++; if (q.obj && q.obj.visible) shown[ci]++; if (q.obj && (q.obj.getWorldPosition(v), v.distanceTo(cam) < sc.rVis)) near[ci]++; } } out[line] = { player: tv === this.trainView, built: !!tv.saloonDone, trainVisible: tv.root.visible, enabled: !!(sc && sc.enabled !== false), perCar, shown, near, total: perCar.reduce((a, b) => a + b, 0) }; } return out; },   // near = riders within the crowd's view range (rVis) of the camera: the only ones that are meant to be drawn
      peopleBind: () => { const c = this.crowd, T = this.THREE; if (!c.chars) return null; let miss = 0, tracks = 0, lodMiss = 0; const bad = new Set();
        for (const lod of [false, true]) for (const ch of c.chars) { if (lod && !ch.lodNode) continue; const o = c._clone(ch, lod); const seen = new Set();
          for (const cat of Object.keys(ch.pools)) for (const clip of ch.pools[cat]) for (const k of clip.tracks) { const nm = k.name.replace(/\.(quaternion|position|scale)$/, ''); const key = nm; if (seen.has(key)) continue; seen.add(key); tracks++; if (!T.PropertyBinding.findNode(o, nm)) { lod ? lodMiss++ : miss++; bad.add(ch.id + ':' + nm); } } }
        return { chars: c.chars.length, tracks, miss, lodMiss, sample: [...bad].slice(0, 4) }; },
      peopleTris: () => { let tris = 0, meshes = 0, hi = 0, lo = 0; for (const cr of [this.crowd, ...Object.values(this.views).map((v) => v.saloon)]) { if (!cr || !cr.people) continue; for (const q of cr.people) { if (!q.obj || !q.obj.visible) continue; q.lod ? lo++ : hi++; q.obj.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); } } return { tris, meshes, hi, lo }; },
      crowdClearance: () => { const c = this.crowd, w = this.walker; let d = 1e9, front = 1e9; const fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw); for (const q of c.people) { if (!q.obj || q.hidden) continue; const dx = q.x - w.x, dz = q.z - w.z, dd = Math.hypot(dx, dz); d = Math.min(d, dd); if ((dx * fx + dz * fz) / (dd || 1) > Math.cos(1.15)) front = Math.min(front, dd); } return { d, front, n: c.people.length }; },
      peopleInfo: () => { const c = this.crowd; const w = this.walker; return { maxH: Math.max(...(c.chars || []).map((ch) => c.standHeight(ch, 'stand'))), chars: (c.chars || []).length, eye: w.eyeY() - w.y, sit: w.sit, x: w.x, clips: c.chars && c.chars[0] ? Object.keys(c.chars[0].pools) : [] }; },
      peopleFit: () => { const c = this.crowd; if (!c.chars || !c.fit) return null; const rows = []; let u = null;   // skirt-off-the-legs fit (bodyfit.js): stats per skirted character + the strength switch
        for (const ch of c.chars) { const f = c.fit[ch.id]; if (!f || !f.legs) continue; const L = f.legs, Ll = f.legsLod;
          if (!u) ch.node.traverse((m) => { if (!u && m.material && m.material.userData && m.material.userData.legFit) u = m.material.userData.legFit; });
          rows.push({ id: ch.id, g: L.garments, gLod: Ll ? Ll.garments : 0, slim: L.slim ? L.slim.verts : 0, thigh: +Math.max(...L.radii[0], ...L.radii[2]).toFixed(3) }); }
        const k1 = u ? u.uLegK.value : null; c.setLegFit(0); const k0 = u ? u.uLegK.value : null; c.setLegFit(1);
        return { rows, k1, k0, kEnd: u ? u.uLegK.value : null, web: c.webbing() }; },
      armFit: (ns = 3) => { const c = this.crowd; if (!c.chars || !c.armFit) return null; const kit = c.armKit(), rows = [], SKIP = ['phone', 'talk', 'wave'];   // arms-out-of-the-body fit (bodyfit.js armProbe): burial of the forearms / hands in the clips the crowd really plays
        for (const ch of c.chars) { const probes = [kit.probe(ch, false), kit.probe(ch, true)]; let worst = 0, worstClip = '', n = 0, same = true; const names = [];
          for (const cat of Object.keys(ch.pools)) { for (const clip of ch.pools[cat]) { names.push(clip.name.split('__').pop()); if (SKIP.includes(cat)) continue; n++;
            const o = (ch.pools0[cat] || []).find((a) => a.name === clip.name); if (!o || o.duration !== clip.duration) same = false;
            for (const probe of probes) for (let k = 0; k < ns; k++) { probe.pose(clip, (k / ns) * clip.duration); const d = probe.depth(); const m = Math.max(d.l, d.r); if (m > worst) { worst = m; worstClip = clip.name.split('__').pop(); } } } }
          const o0 = ch.pools0.idle && ch.pools0.idle[0]; let base = 0;   // control: the same measure on the shared, unturned idle clip
          if (o0) for (const probe of probes) for (let k = 0; k < ns; k++) { probe.pose(o0, (k / ns) * o0.duration); const d = probe.depth(); base = Math.max(base, d.l, d.r); }
          rows.push({ id: ch.id, baked: c.armFit[ch.id], clips: n, names, worst: +(worst * 100).toFixed(1), worstClip, same, base: +(base * 100).toFixed(1) }); }
        return rows; },
      doorLeaves: () => { const tv = this.trainView, sv = this.svc, side = sv.doors.L > sv.doors.R ? 'L' : 'R', list = side === 'L' ? tv.doorsL : tv.doorsR; return { double: tv.doubleDoors, side, n: list.length, leaves: list.map((d) => d.leaves.map((l) => l.n.position.z)) }; }, mouse: () => ({ locked: !!this._locked, sens: this.mouse.sens, invertY: this.mouse.invertY, denied: !!this._lockDenied, handlers: !!(this._pd && this._pm && this._plc), yaw: this.look.yaw, pitch: this.look.pitch, hint: this._hintEl ? this._hintEl.style.opacity : null }), mouseMove: (dx, dy, locked) => { this._forceLock = !!locked; try { this._pm({ movementX: dx, movementY: dy, clientX: 0, clientY: 0, pointerId: -9 }); } finally { this._forceLock = false; } }, mouseSet: (o) => { Object.assign(this.mouse, o); }, audioState: () => this.audio.state(), audioStart: () => this.audio.start(), audioSetHidden: (h) => this.audio.setHidden(h), audioMute: (m) => this.audio.setMuted(m), audioSpeak: (t) => this.audio.speak(t), audioChime: () => this.audio.chime('door'), audioDoors: (open, o) => this.audio.doors(open, o), audioBong: () => this.audio.bong(), doorSound: (tv, own, open, side) => this._doorSound(tv, own, open, side), trainEar: (tv, side) => this._trainEar(tv, side),
      railExt: async (i) => { const v = await this._prepare(i); if (!v) return null; v.group.updateMatrixWorld(true); const T = this.THREE, b = new T.Box3(), a = new T.Box3(), p = new T.Vector3(); let z0 = 1e9, z1 = -1e9;
        v.group.traverse((m) => { if (m.isMesh && m.material && /^rail_steel/.test(m.material.name || '')) { m.geometry.computeBoundingBox(); a.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); for (const zz of [a.min.z, a.max.z]) for (const xx of [a.min.x, a.max.x]) for (const yy of [a.min.y, a.max.y]) { p.set(xx, yy, zz); v.group.worldToLocal(p); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); } } });
        return { z0, z1, skipHalf: HALL_FULL }; }, render: () => { this._mgrT = 0; this.sync(0.016); this.renderer.render(this.mode === 'street' && this.street ? this.street.scene : this.scene, this.camera); },
      setLook: (y, p) => { this.look.yaw = y; this.look.pitch = p; },
      enterStreet: () => this.enterStreet(), leaveStreet: () => this.leaveStreet(), alight: () => this._alight(), board: () => this._boardTrain(), takeCab: () => this._takeCab(),
      setLine: (l) => this.go({ mode: this.mode, line: l, station: this.sel.station }),
      timeScale: (k) => { this.timeScale = k; },
      quality: () => this.quality,
      headroom: () => this.trainView.headroom,
      sweep: async (i, opts) => { await this._prepare(i); return this.sweepStation(i, opts); },
      portal: () => this._toAccess((this.activeStation.anchors.portals || [])[0]), platform: () => this._toPlatform(),
      sweepCurves: async (n, opts) => { await this._prepare(0); return this.sweepCurves(n, opts); },
      loop: (on) => { if (on) this.renderer.setAnimationLoop((t) => this.frame(t)); else this.renderer.setAnimationLoop(null); },
      stats: () => ({ calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles, geos: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures }),
    };
  }

  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.renderer.setAnimationLoop(null);
    if (this.crowd) this.crowd.clear(); for (const v of Object.values(this.views || {})) if (v && v.saloon) v.saloon.clear();   // hand the characters back to the shared no-repeat registry (people.js IN_USE) before a new sim starts
    removeEventListener('keydown', this._kd, true); removeEventListener('keyup', this._ku, true); removeEventListener('resize', this._onResize); removeEventListener('blur', this._blur);
    const c = this.canvas; c.removeEventListener('pointerdown', this._pd); c.removeEventListener('wheel', this._wh); c.removeEventListener('pointermove', this._pm); c.removeEventListener('pointerup', this._pu); c.removeEventListener('pointercancel', this._pu); document.removeEventListener('pointerlockchange', this._plc); document.removeEventListener('pointerlockerror', this._ple); this._releaseLock(); if (this._hintEl) this._hintEl.remove();
    try { if (document.pointerLockElement === c) document.exitPointerLock(); } catch (e) {}
    this.audio.dispose(); this.hud.dispose(); if (this.rats) this.rats.dispose();
    for (const v of this.stationViews.values()) v.dispose();
    // geometries AND materials/textures (GLB maps, canvas textures) - otherwise every start/dispose cycle leaks ~27 GPU textures
    const texKeys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap'];
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh && o.dispose) o.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) { for (const k of texKeys) if (m[k] && m[k].dispose) m[k].dispose(); m.dispose(); }
    });
    for (const t of [this.tms && this.tms.tex, this.tms && this.tms.tex2]) if (t) t.dispose();
    if (this.street) this.street.dispose();
    const r = this.renderer, s = this.saved; try { if (this.savedPR) r.setPixelRatio(this.savedPR); } catch (e) {} if (s) { r.setClearColor(s.clear, s.alpha); r.toneMapping = s.tm; r.toneMappingExposure = s.exp; }
    if (window.__sim && window.__sim.sim === this) delete window.__sim;
  }
}
export { Sim };
