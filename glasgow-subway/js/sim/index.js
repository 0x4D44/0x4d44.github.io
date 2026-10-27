// Glasgow Subway driver simulator + station walker. ES module, no bundler.
// Exports startSim(ctx) / simAvailable() per SPEC. See NOTES-A5.md.
import { Track } from './track.js';
import { Service, baselineRunTimes } from './service.js';
import { stockFrom, notchToCmd } from './dynamics.js';
import { buildSchedule, DIFFICULTY } from './rules.js';
import { KMH, clamp, wrapL, fmtDist, fmtTime, mulberry32 } from './util.js';
import { loadTrainTemplate, TrainView } from './trainview.js';
import { loadTunnelTemplate, TunnelView } from './tunnelview.js';
import { buildStation, placeStation, stationHalfLength, PY } from './stationview.js';
import { Walker } from './walker.js';
import { Crowd, AnimCrowd } from './people.js';
import { SimAudio } from './audio.js';
import { Tms } from './tms.js';
import { Hud, HELP_HTML } from './hud.js';
import { buildStreet } from './street.js';
import { layoutFor, loadGLB, disposeTemplate, lookHints, HALL_FULL } from './hall.js';
import { peopleVariants } from './kit.js';

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
    this.keys = new Set(); this.line = ctx.line === 'inner' ? 'inner' : 'outer'; this.diffId = ctx.difficulty || 'standard';
    this.sel = { mode: ctx.mode || 'drive', station: ctx.startStation || this.stations[0].id, line: this.line, diff: this.diffId };
    this.tracks = {}; this.stationViews = new Map(); this.time = 0; this.alightNext = false;
    this.shuttle = { state: 'none', t: 0, idx: 0, headway: 70 };
    this.fadeLock = false; this.timeScale = 1; this.ctxKind = 'train'; this.bobT = 0;
    this._v = {}; this.errors = [];
  }

  url(p) { return new URL(this.base + p, location.href).href; }

  async init() {
    const THREE = this.THREE, r = this.renderer;
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    this.GLTFLoader = GLTFLoader;
    this.saved = { clear: r.getClearColor(new THREE.Color()), alpha: r.getClearAlpha(), tm: r.toneMapping, exp: r.toneMappingExposure };
    const [trainTpl, tunTpl, kitTpl, kioskTpl, peopleTpl, vaultTpl, sigWallTpl, boardsTpl] = await Promise.all([
      loadTrainTemplate(THREE, GLTFLoader, this.url('models/train.glb')),
      loadTunnelTemplate(THREE, GLTFLoader, this.url('models/tunnel_segment.glb')),
      this._opt('models/station_kit.glb'), this._opt('models/entrance_kiosk.glb'), this._optG('models/people.glb'), this._opt('models/tunnel_station_vault.glb'), this._opt('models/signal_wall.glb'), this._opt('models/signal_boards.glb'),
    ]);
    this.hallIndex = await this._json('models/stations_index.json');
    const looksJ = await this._json('data/station_looks.json');
    this.looks = new Map(((looksJ && looksJ.stations) || []).map((x) => [x.id, x]));
    this.walkable = await this._json('models/train_walkable.json');
    this.halls = new Map(); this.hallLoading = new Map(); this.hallFailed = new Set(); this.entrances = new Map();
    this.kit = kitTpl; this.vaultTpl = vaultTpl; this.kioskTpl = kioskTpl; this.peopleGltf = peopleTpl; this.peopleVariants = null; this.sigWallTpl = sigWallTpl; this.boardsTpl = boardsTpl;
    try { const SU = await import('three/addons/utils/SkeletonUtils.js'); this.SU = SU; } catch (e) { console.warn('[sim] SkeletonUtils unavailable', e && e.message); this.SU = null; }
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x050506);
    this.scene.fog = new THREE.FogExp2(0x0a0a0c, 0.026);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
    this.ambient = new THREE.AmbientLight(0x8a7a66, 2.6); this.scene.add(this.ambient);
    this.quality = this._detectQuality();
    this.savedPR = r.getPixelRatio();
    try { r.setPixelRatio(this.quality === 'low' ? Math.min(devicePixelRatio || 1, 1) : Math.min(devicePixelRatio || 1, 2)); } catch (e) {}
    this.tunnel = new TunnelView(THREE, tunTpl, this.scene, { quality: this.quality });
    this.trainView = new TrainView(THREE, trainTpl.scene, {});
    this.scene.add(this.trainView.root);
    this.trainView.computeHeadroom(PY); if (this.walkable) this.trainView.setWalkable(this.walkable);
    this.trainLen = this.trainView.length; this.stock.lengthM = this.trainLen; this.doorZ = this.trainView.doorZ.length ? this.trainView.doorZ : [-8.15, -3.65, 3.65, 8.15];
    this.tms = new Tms(THREE); this.tms.attach(this.trainView); this.trainView.buildCab(this.tms.tex, this.tms.tex2); this.trainView.setDest(this.line === 'outer' ? 'OUTER CIRCLE' : 'INNER CIRCLE');
    this.headlight = new THREE.SpotLight(0xfff2d0, 160, 90, 0.7, 0.6, 1.1); this.scene.add(this.headlight, this.headlight.target);
    this.cabLight = new THREE.PointLight(0xdfe8ff, 1, 5, 1.5); this.scene.add(this.cabLight);
    this.poolLights = []; for (let i = 0; i < (this.quality === 'low' ? 3 : 5); i++) { const l = new THREE.PointLight(0xffe3b0, 0, 28, 1.4); this.scene.add(l); this.poolLights.push(l); }
    { const lowQ = this.quality === 'low'; const ok = this.SU && this.peopleGltf && this.peopleGltf.animations && this.peopleGltf.animations.length;
      this.crowd = ok ? new AnimCrowd(THREE, this.SU, this.peopleGltf, lowQ ? 22 : 60, this.quality) : new Crowd(THREE, lowQ ? 28 : 110, null);
      this.saloon = ok ? new AnimCrowd(THREE, this.SU, this.peopleGltf, lowQ ? 8 : 20, this.quality) : null; this.saloonDone = false;
      this.scene.add(this.crowd.group); }
    this.sigMesh = this._makeSignal(); this.scene.add(this.sigMesh.group);
    this.walker = new Walker();
    this.audio = new SimAudio();
    this.hud = new Hud(this.ctx.container, {
      onAction: (a, el) => this.action(a, el), onLever: (n) => { if (this.mode === 'drive') { this.svc.setLever(n); this.audio.start(); } },
      doorSel: () => (this.svc ? this.svc.doorSel : 1), hints: () => this.svc && this.svc.diff.hints, onModal: (open) => { this._modalOpen = open; },
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

  async _optG(path) {
    try { return await new Promise((res, rej) => new this.GLTFLoader().load(this.url(path), res, undefined, rej)); } catch (e) { console.warn('[sim] optional model missing', path); return null; }
  }
  /** Seated / standing passengers riding in the saloons (ride + explore only; parented to the car groups so they move with the train). */
  _populateSaloon() {
    const sc = this.saloon, tv = this.trainView; this.saloonDone = true; if (!sc || !sc.hasAnim) return;
    const rng = mulberry32(5), PYf = PY;
    tv.cars.forEach((car, ci) => {
      const info = tv.carInfo[ci], doors = tv.doorZ.map((z) => z - info.zc).filter((z) => Math.abs(z) < info.len / 2 + 1);
      const zA = ci === 0 ? -info.len / 2 + 2.2 : -info.len / 2 + 0.9, zB = ci === tv.cars.length - 1 ? info.len / 2 - 2.2 : info.len / 2 - 0.9;
      const slots = [];
      for (let z = zA; z <= zB; z += 0.55) for (const sx of [-1, 1]) {
        if (doors.some((d) => Math.abs(z - d) < 1.0)) continue;
        if (rng() < (this.quality === 'low' ? 0.2 : 0.3)) slots.push({ x: sx * 0.8, y: PYf, z, yaw: sx * Math.PI / 2, mode: 'sit' });
      }
      const standing = []; for (let k = 0; k < 2; k++) { const z = zA + rng() * (zB - zA); if (!doors.some((d) => Math.abs(z - d) < 1.2)) standing.push({ x: (rng() < 0.5 ? -1 : 1) * 0.62, y: PYf, z, yaw: rng() * 6.28, mode: 'idle' }); }
      sc.seat(car, slots.slice(0, Math.ceil(sc.max / tv.cars.length)).concat(standing));
    });
  }
  async _opt(path) {
    try { const g = await new Promise((res, rej) => new this.GLTFLoader().load(this.url(path), res, undefined, rej)); return g.scene; } catch (e) { console.warn('[sim] optional model missing', path); return null; }
  }

  // ------------------------------------------------------------------ line / service setup
  setupLine(line, startIdx = 0) {
    this.line = line; if (this.trainView) this.trainView.setDest(line === 'outer' ? 'OUTER CIRCLE' : 'INNER CIRCLE');
    let rec = this.tracks[line];
    if (!rec) {
      const maxPlat = Math.max(...this.stations.map((s) => (s.platform && s.platform.lengthM) || 45), 45);
      const track = new Track(this.subway.tracks[line], { trainLen: this.trainLen, ignoreCentre: true, maxKmh: this.stock.maxKmh, platformLen: maxPlat, latAccel: 1.15 });
      const rt = baselineRunTimes(track, this.stock, this.stations);
      const dw = track.stops.map((s) => s.dwellS);
      const schedule = buildSchedule(rt, dw, 1.06, 0);
      rec = this.tracks[line] = { track, schedule, runTimes: rt };
    }
    this.track = rec.track; this.schedule = rec.schedule;
    // clear station views (side depends on line)
    for (const v of this.stationViews.values()) { this.scene.remove(v.group); v.dispose(); }
    this.stationViews.clear();
    // tunnel skip spans
    const spans = this.track.stops.map((st) => {
      const stn = this.stations[this.stationIdx.get(st.station)] || {};
      const half = this.hallIndex && this.hallIndex.stations[st.station] ? HALL_FULL : stationHalfLength(stn, this.trainLen, !!this.vaultTpl) + 0.02;
      return [wrapL(st.sc - half, this.track.length), wrapL(st.sc - half, this.track.length) + 2 * half];
    });
    this.tunnel.setSkips(spans); this.tunnel.track = null;
    this.svc = this._newService(startIdx);
  }

  _newService(idx, opts = {}) {
    const diff = this.sel.diff || this.diffId;
    const svc = new Service({
      track: this.track, stock: this.stock, stations: this.stations, difficulty: diff, startIdx: idx, lineKey: this.line,
      platformLen: 45, schedule: this.schedule, ato: !!opts.ato, autoDoors: !!opts.autoDoors, seed: 7 + idx,
    });
    svc.t0 = svc.t - this.schedule.arr[idx];
    // hall layouts: choose hall orientation per stop so the platform side matches the data, then let that side drive the door rules
    this.layouts = this.track.stops.map((st, i) => { const info = this.hallIndex && this.hallIndex.stations[st.station]; return info ? layoutFor(info, this.line, svc.sideOf[i]) : null; });
    this.layouts.forEach((l, i) => { if (l) svc.sideOf[i] = l.S; });
    svc.on((t, d) => this._onSvc(t, d));
    return svc;
  }

  _onSvc(type, d) {
    if (type === 'toast') this.hud.toast(d.text, d.kind, 3);
    else if (type === 'chime') this.audio.chime(d.kind);
    else if (type === 'log') { if (d.delta < 0 && d.kind !== 'time') this.hud.toast(d.text + ' (' + d.delta + ')', 'warn', 3); }
    else if (type === 'doors') { this.audio.chime('door'); }
    else if (type === 'target') {
      const n = this.svc.station.name;
      if (this.mode === 'ride' || this.mode === 'drive') this._announce(`The next station is ${n}.`);
      this.annDone = false;
    } else if (type === 'arrive') {
      if (this.mode === 'ride') this._announce(`This is ${this.svc.station.name}. Please mind the gap.`);
      if (this.mode === 'drive') { this.hud.toast(`${d.label}  ${d.err >= 0 ? '+' : ''}${d.err.toFixed(2)} m  (+${d.score})`, d.score >= 75 ? 'info' : 'warn', 4); }
      if (this.mode === 'explore' && this.shuttle.state === 'arriving') { this.shuttle.state = 'dwell'; }
    } else if (type === 'depart') {
      if (this.mode === 'explore' && this.shuttle.state === 'dwell') { this.shuttle.state = 'leaving'; this.shuttle.t = 0; }
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
    const svc = this.svc;
    this.shuttle.state = 'none'; this.crowd.clear(); this.crowdFor = null;
    this.tunnel.reset(); this.annDone = false;
    { const i0 = Math.max(0, idx2); await this._prepare(i0); await this._prepare((i0 + 1) % this.track.stops.length); }
    this.trainView.root.visible = true;
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
    w.setWorld(view.zones, view.obstacles); w.heightFn = null; w.eye = 1.62; w.radius = 0.3; w.headroomFn = null;
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
    w.setWorld(zones, []);
    w.heightFn = null; w.eye = 1.6; w.radius = 0.2; w.headroomFn = (x) => this.trainView.headroomAt(x); w.minHead = 1.5;
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
    w.headroomFn = null; w.setWorld([], []); w.heightFn = (x, z) => (Math.hypot(x - st.center.x, z - st.center.z) < st.radius ? st.ground(x, z) : null); w.eye = 1.65; w.radius = 0.3;
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
    return this._teleport(() => { const w = this.walker; const px = (inf.xe + inf.xo) / 2; w.place(px, Math.max(-20, Math.min(20, pt.z - Math.sign(pt.z || 1) * 1.8)), 0); w.y = inf.PY; this.look.yaw = 0; this.look.pitch = 0; });
  }

  _boardTrain() {
    const svc = this.svc; this._setupTrainWalker();
    const dz = this._nearestDoorZ(); const inf = this.activeStation.info;
    this.mode = 'ride'; this.ctxKind = 'train'; this.hud.setMode('ride');
    this.walker.place(inf.S * 0.45, dz, inf.S > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.walker.yaw = -inf.S * -Math.PI / 2 * 0 + (inf.S > 0 ? Math.PI / 2 : -Math.PI / 2) * -1;
    svc.ato = true; svc.autoDoors = true; svc.dwellT = Math.max(svc.dwellT, svc.stop.dwellS - 5);
    this.shuttle.state = 'none'; this.crowd.clear(); this.scene.fog.density = 0.026;
    this.hud.toast('All aboard. N: alight at next stop. Walk to the front cab and press E to drive.', 'info', 5);
  }
  _alight() {
    const idx = this.svc.idx; this.alightNext = false;
    const doorZ = this._nearestDoorZ();   // walker still in train-local space here
    this.mode = 'explore'; this.ctxKind = 'station'; this.hud.setMode('explore');
    this.exploreIdx = idx; this.shuttle.idx = idx; this.shuttle.state = 'dwell'; this.shuttle.streamed = false; this.scene.fog.density = 0.006;
    const view = this._ensureStation(idx, true);
    this.walker.heightFn = null; this.walker.headroomFn = null; this.walker.setWorld(view.zones, view.obstacles); this.walker.eye = 1.62; this.walker.radius = 0.3; this.activeStation = view;
    const inf = view.info;
    this.walker.place(inf.xe + inf.S * 0.9, this._trainCentreZl() + doorZ, -inf.S * Math.PI / 2); this.look.yaw = this.walker.yaw; this.look.pitch = 0;
    this.svc.schedule = null; this.svc.ato = true; this.svc.autoDoors = true;
    this.hud.toast('Welcome to ' + this.svc.station.name, 'info', 3);
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
    const p = loadGLB(this.THREE, this.GLTFLoader, this.url('models/' + this.hallIndex.stations[id].hall)).then((tpl) => { this.halls.set(id, { tpl, t: this.time }); this.hallLoading.delete(id); this._evictHalls(id); return tpl; })
      .catch((e) => { console.warn('[sim] hall load failed', id, e && e.message); this.hallFailed.add(id); this.hallLoading.delete(id); return null; });
    this.hallLoading.set(id, p); return p;
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
    v = buildStation(THREE, { station, stop, side, lineKey: this.line, trainLen: this.trainLen, idx: si, kit: this.kit, vault: this.vaultTpl, low: this.quality === 'low', hall });
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
    if (v.info.hall) { const pl = v.anchors.hallPlat.find((q) => q.x0 === Math.min(inf.xe, inf.xo) || Math.abs((inf.S > 0 ? q.x0 : q.x1) - inf.xe) < 0.05) || v.anchors.hallPlat[0]; v.crowdRect = { x0: pl.x0 + 0.6, x1: pl.x1 - 0.6, z0: -20, z1: 20 }; if (inf.S > 0) v.crowdRect.x0 = pl.x0 + 1.0; else v.crowdRect.x1 = pl.x1 - 1.0; }
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
    if (cur !== this.crowdFor && bd < 300) {
      this.crowd.clear(); this.crowdFor = cur;
      if (cur) {
        const inf = cur.info; const g = cur.group;
        this.crowd.group.position.copy(g.position); this.crowd.group.rotation.copy(g.rotation);
        this.crowd.populate(cur.crowdN, cur.crowdRect, inf.PY, cur.obstacles.filter((o) => !o.tall && o.y === inf.PY));
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
      if (e.pointerType === 'mouse' && this.mode !== 'drive' && !this._modalOpen) { try { canvas.requestPointerLock && canvas.requestPointerLock(); } catch (_) {} } };
    this._pm = (e) => {
      if (document.pointerLockElement === canvas) { this._lookDelta(e.movementX, e.movementY); return; }
      if (!drag || e.pointerId !== drag.id) return; this._lookDelta(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY;
    };
    this._pu = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    canvas.addEventListener('pointerdown', this._pd); canvas.addEventListener('pointermove', this._pm);
    canvas.addEventListener('pointerup', this._pu); canvas.addEventListener('pointercancel', this._pu);
    canvas.style.touchAction = 'none';
  }
  _lookDelta(dx, dy) {
    if (this._modalOpen) return;
    const k = 0.0042; this.look.yaw -= dx * k; this.look.pitch = clamp(this.look.pitch - dy * k, -1.2, 1.2);
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
    } else used = /^(w|a|s|d|Shift|Arrow.*| )$/.test(kk);
    if (used) e.preventDefault();
  }

  action(a, el) {
    this.audio.start();
    const s = this.svc;
    if (a.startsWith('mode:')) { this.sel.mode = a.slice(5); this._menuSync(); return; }
    if (a.startsWith('line:')) { this.sel.line = a.slice(5); this._menuSync(); return; }
    if (a.startsWith('diff:')) { this.sel.diff = a.slice(5); this._menuSync(); return; }
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
<h3>&nbsp;</h3><div class="gs-row">${b('go', 'Go', false).replace('<button', '<button style="background:#e8741a;color:#111;font-weight:700"')}${kind === 'menu' ? b('resume', 'Resume', false) : ''}${b('help', 'Controls', false)}${b('exit', 'Back to explorer', false)}</div>`;
    this.hud.openModal(html, kind);
  }
  _menuSync() { for (const bt of this.hud.panel.querySelectorAll('button[data-a]')) { const a = bt.dataset.a; const m = /^(mode|line|diff):(.*)/.exec(a); if (m) bt.classList.toggle('on', this.sel[m[1]] === m[2]); } }

  // ------------------------------------------------------------------ interaction
  interact() {
    const c = this.context;
    if (!c) return;
    if (c.kind === 'board') this._boardTrain();
    else if (c.kind === 'street') this.enterStreet();
    else if (c.kind === 'portal') this._toAccess(c.pt);
    else if (c.kind === 'platform') this._toPlatform();
    else if (c.kind === 'descend') this.leaveStreet();
    else if (c.kind === 'cab') this._takeCab();
    else if (c.kind === 'alight') this._alight();
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
      if (inf.hall && !this.context) {
        for (const pt of (v.anchors.portals || [])) if (Math.hypot(w.x - pt.x, w.z - pt.z) < 1.7 && w.y < inf.PY + 0.5) { this.context = { kind: 'portal', pt }; msg = '<kbd>E</kbd> Take the stairs up to the ticket hall'; break; }
        const ad = v.anchors.accessDoor;
        if (!this.context && ad && w.y < inf.PY + 0.6 && Math.hypot(w.x - ad.x, w.z - ad.z) < 1.8 && w.z < inf.rampZ0 + 2.4) { this.context = { kind: 'platform' }; msg = '<kbd>E</kbd> Go back down to the platform'; }
      }
      const a = v.anchors.exit;
      if (!this.context && Math.hypot(w.x - a.x, w.z - a.z) < 2.2 && w.y > a.y - 0.6) { this.context = { kind: 'street' }; msg = '<kbd>E</kbd> Go outside to the street'; }
      if (!this.context) {
        // facts caption
        for (const p of (v.anchors.panels || [])) if (Math.abs(w.z - p.z) < 3.2 && Math.abs(w.x - p.x) < 4 && w.y < inf.PY + 0.5) { msg = `<b>${p.title}</b> ${p.body.slice(0, 160)}`; break; }
        if (!msg) for (const p of (v.anchors.conPanels || [])) if (w.y > inf.Hc - 0.5 && Math.abs(w.z - (p.z + 4.8)) < 3.5 && w.x > inf.rc + 4) { msg = p.body.slice(0, 160); break; }
      }
      if (!msg) { const sh = this.shuttle; if (sh.state === 'wait') msg = `Next train in ${fmtTime(sh.timer)}`; else if (sh.state === 'arriving') msg = `Train approaching ${fmtDist(Math.max(0, svc.distToStop))}`; }
    } else if (this.mode === 'ride') {
      if (w.z < -(this.trainLen / 2 - 2.6)) { this.context = { kind: 'cab' }; msg = '<kbd>E</kbd> Take the driver\'s seat'; }
      else if (svc.phase === 'station' && svc.doorsOpen && (this.alightNext || true)) {
        const nearDoor = this.doorZ.some((dz) => Math.abs(w.z - dz) < 1.6) && Math.abs(w.x) > 0.45;
        if (nearDoor) { this.context = { kind: 'alight' }; msg = `<kbd>E</kbd> Step off at ${svc.station.name}`; }
        else msg = `${svc.station.name}: walk to an open door and press E to get off`;
      } else if (this.alightNext) msg = `Getting off at ${svc.station.name}`;
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
    this.time += dt;
    let n = Math.ceil(dt / 0.05); const h = dt / n;
    for (let i = 0; i < n; i++) svc.update(h);
    // walker
    const w = this.walker;
    if (this.mode !== 'drive') {
      let fwd = 0, str = 0;
      if (this.keys.has('w')) fwd += 1; if (this.keys.has('s')) fwd -= 1; if (this.keys.has('d')) str += 1; if (this.keys.has('a')) str -= 1;
      if (this.hud.joy.x || this.hud.joy.y) { str += this.hud.joy.x; fwd -= this.hud.joy.y; }
      if (this.keys.has('ArrowLeft')) this.look.yaw += 1.8 * dt; if (this.keys.has('ArrowRight')) this.look.yaw -= 1.8 * dt;
      if (this.keys.has('ArrowUp') && this.mode !== 'drive') fwd += 1; if (this.keys.has('ArrowDown')) fwd -= 1;
      w.sprint = this.keys.has('Shift');
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
    if (this.mode === 'ride' && this.alightNext === false) {}
    // approach announcements
    if (this.mode !== 'explore' && this.mode !== 'street' && svc.phase === 'run' && !this.annDone && svc.distToStop < 250) {
      this.annDone = true; this._announce(`Approaching ${svc.station.name}`);
    }
    if (this.mode === 'street' && this.street) { /* nothing */ }
  }

  _shuttle(dt) {
    const sh = this.shuttle, svc = this.svc;
    if (sh.state === 'leaving') {
      sh.t += dt;
      if (sh.t > 9) { this.trainView.root.visible = false; sh.state = 'wait'; sh.timer = sh.headway * (0.7 + Math.random() * 0.5); svc.train.v = 0; }
    } else if (sh.state === 'wait') {
      sh.timer -= dt;
      if (sh.timer <= 0) {
        svc.placeApproaching(sh.idx, 220, 9); svc.ato = true; svc.autoDoors = true; this.trainView.root.visible = true; sh.state = 'arriving'; svc._autoOpened = false; svc._autoClosed = false;
      }
    }
    // passenger streams during dwell
    if (sh.state === 'dwell' && svc.doorsOpen && !sh.streamed && this.activeStation) {
      sh.streamed = true; const v = this.activeStation, inf = v.info, zc = this._trainCentreZl();
      const door = this.doorZ.slice(); const ramp = { x: inf.rc, z: inf.zE - 0.5 };
      const nAl = Math.min(10, Math.round(svc.pax.onboard * 0.12)), nBo = Math.min(10, Math.round(v.crowdN * 0.35));
      for (let i = 0; i < nAl; i++) { const dz = door[i % door.length]; this.crowd.stream({ x: inf.xe + inf.S * 0.4, z: zc + dz }, { x: inf.rc, z: inf.zE - 0.5 }, 1, inf.PY, inf.PY, 0.4); }
      for (let i = 0; i < nBo; i++) { const dz = door[i % door.length]; this.crowd.stream({ x: inf.rc, z: zc + dz + (Math.random() - 0.5) * 3 }, { x: inf.xe + inf.S * 0.3, z: zc + dz }, 1, inf.PY, inf.PY, 0.6); }
    }
    if (sh.state !== 'dwell') sh.streamed = false;
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
    } catch (e) { console.error('[sim] frame error', e); this.errors.push(String(e && e.stack || e)); if (this.errors.length > 5) this.renderer.setAnimationLoop(null); }
  }

  /** Vertical FOV by mode, widened for portrait so the horizontal FOV stays wide. */
  _applyFov() {
    const cam = this.camera, drive = this.mode === 'drive', base = drive ? 78 : 92, asp = cam.aspect || 1.6;
    const href = 2 * Math.atan(Math.tan(base * Math.PI / 360) * 16 / 9);
    let v = asp >= 16 / 9 ? base : 2 * Math.atan(Math.tan(href / 2) / asp) * 180 / Math.PI;
    v = Math.min(v, drive ? 105 : 116);
    if (Math.abs(cam.fov - v) > 0.01) { cam.fov = v; cam.updateProjectionMatrix(); }
  }

  sync(dt) {
    this._applyFov();
    const THREE = this.THREE, svc = this.svc, tr = svc.train, cam = this.camera, track = this.track;
    const underground = this.mode !== 'street';
    if (underground) {
      this._mgrT = (this._mgrT || 0) - dt; if (this._mgrT <= 0) { this._mgrT = 0.4; this._manageStations(); }
      this.trainView.place(track, tr.s); this.trainView.setDriveCab(this.mode === 'drive');
      const d = svc.doors; this.trainView.setDoors(d.L, d.R);
      if (this.mode === 'explore') { if (this._tw !== 'x') { this.tunnel.setWindow(60, 45); this._tw = 'x'; } this.tunnel.update(track, track.stops[this.exploreIdx].sc); }
      else { if (this._tw !== 'd') { this.tunnel.setWindow(75, 22); this._tw = 'd'; } this.tunnel.update(track, this.mode === 'ride' ? tr.s - (this.walker.z - this.trainView.zMin) : tr.s - 1.8); }
      for (const v of this.stationViews.values()) {
        v.update(this.time);
        const lv = v.group.userData.psdLeaves;
        if (lv && lv.length) { const open = svc.phase === 'station' && svc.idx === v.stopIdx && (svc.doors.L > 0.04 || svc.doors.R > 0.04); for (const m of lv) m.visible = !open; }
      }
      this.crowd.update(dt, this.time, (x, z, y) => y, this.camera.position);
      if (this.saloon) { const sv = this.mode === 'ride' || this.mode === 'explore'; this.saloon.setEnabled(sv); if (sv) { if (!this.saloonDone) this._populateSaloon(); this.saloon.update(dt, this.time, null, this.camera.position); } }
      this._signal(svc);
      this.tms.update(dt, svc.info(), this.mode);
      // lights
      const front = new THREE.Vector3(), q = new THREE.Quaternion(); this.trainView.eyeWorld(front, q);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      this.headlight.position.copy(front).add(new THREE.Vector3(0, -0.6, 0)).addScaledVector(fwd, 12);
      this.headlight.target.position.copy(front).addScaledVector(fwd, 40);
      this.headlight.intensity = this.mode === 'explore' && !this.trainView.root.visible ? 0 : 160;
      // running tunnels are unlit: dim ambient between stations, full level inside / near a hall (smooth ramp)
      { let f = 1; if (this.mode !== 'explore') { let md = 1e9; const L = track.length, sN = tr.s; for (const st of track.stops) { let d = Math.abs(sN - st.sc); d = Math.min(d, L - d); if (d < md) md = d; } f = Math.min(1, Math.max(0, (68 - md) / 30)); f = f * f * (3 - 2 * f); }
        const a = 0.35 + (2.6 - 0.35) * f; this.ambient.intensity += (a - this.ambient.intensity) * Math.min(1, dt * 4 + (dt === 0 ? 1 : 0)); }
      this.cabLight.position.copy(front).add(new THREE.Vector3(0, 0.4, 0)).addScaledVector(fwd, -0.2);
      this._lightPool();
      this._camera(front, q, dt);
      if ((this._cullT = (this._cullT || 0) - dt) <= 0) { this._cullT = 0.3; this.trainView.cull(cam.position, this.mode, this.quality === 'low'); }
    } else {
      const w = this.walker; cam.position.set(w.x, w.y + w.eye + Math.sin(w.bob) * 0.03, w.z);
      cam.rotation.set(this.look.pitch, w.yaw, 0, 'YXZ');
    }
    // audio
    const inTrain = this.ctxKind === 'train';
    this.audio.update({ v: tr.v, traction: tr.tractionAct, brake: tr.brakeAct, curv: track.curvature(tr.s), inTrain, doorsOpen: svc.doors.L > 0.1 || svc.doors.R > 0.1 });
    // HUD
    this._computeContext();
    const info = svc.info();
    const upNext = svc.phase === 'depart' ? (svc.stationById.get(svc.stops[(svc.idx + 1) % svc.stops.length].station) || svc.station) : svc.station;
    let title = 'Next: ' + upNext.name, distText = svc.phase === 'station' ? '' : svc.phase === 'depart' ? '' : fmtDist(Math.max(0, svc.distToStop)), sub = '';
    if (this.mode === 'drive') {
      sub = svc.phase === 'station' ? (svc.doorsClosed ? (svc.signalGreen ? 'Signal clear - depart' : `Dwell ${Math.ceil(info.dwellLeft)} s`) : 'Doors open') : `${this.line === 'outer' ? 'Outer' : 'Inner'} circle - ${svc.diff.label}`;
      if (svc.phase === 'station') title = 'At: ' + svc.station.name;
    } else if (this.mode === 'ride') { title = svc.phase === 'station' ? 'At: ' + svc.station.name : 'Next: ' + upNext.name; sub = this.alightNext ? 'Getting off here' : 'Press N to get off at the next stop'; }
    else if (this.mode === 'explore') { title = this.activeStation ? this.activeStation.station.name : ''; sub = this.shuttle.state === 'wait' ? `Next train ${fmtTime(this.shuttle.timer)}` : (this.shuttle.state === 'arriving' ? 'Train arriving' : this.shuttle.state === 'dwell' ? 'Train at platform' : ''); distText = ''; }
    else if (this.mode === 'street') { title = 'Street level'; sub = ''; distText = ''; }
    let late = null;
    if (this.mode === 'drive' && svc.schedule) { const sched = svc.schedule.arr[svc.idx] + svc.lap * svc.schedule.period + (svc.t0 || 0); late = svc.phase === 'station' ? (svc.stopStatus && svc.stopStatus.late) : Math.max(svc.t - sched, -999); if (late != null && svc.phase !== 'station' && late < 0) late = null; }
    this.hud.update(info, { title, distText, sub, late });
  }

  _lightPool() {
    const cam = this.camera.position, THREE = this.THREE, cands = [];
    const v = this._lp || (this._lp = new THREE.Vector3());
    for (const sv of this.stationViews.values()) for (const d of sv.lights) { v.set(d.x, d.y, d.z); sv.group.localToWorld(v); cands.push({ x: v.x, y: v.y, z: v.z, d, dist: v.distanceToSquared(cam) }); }
    // saloon lights ride with the train
    const mid = this.trainView.cars[Math.floor(this.trainView.cars.length / 2)];
    for (const zz of [-5, 5]) { v.set(0, 2.3, zz).applyMatrix4(mid.matrix); cands.push({ x: v.x, y: v.y, z: v.z, d: { c: 0xfff4e0, i: this.ctxKind === 'train' ? 5 : 2.5, d: 12 }, dist: v.distanceToSquared(cam) }); }
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
    return { mode: this.mode, line: this.line, station: svc.station.name, kmh: svc.train.v / KMH, phase: svc.phase, score: svc.score.total, stops: svc.score.stopsDone, paused: this.paused };
  }
  _exposeHooks() {
    const self = this;
    window.__sim = {
      sim: this,
      state: () => this.getState(), info: () => this.svc.info(), svc: () => this.svc,
      go: (sel) => this.go(sel), tick: (dt) => this.tick(dt), ff: (s, st) => this.fastForward(s, st), sync: () => { this._mgrT = 0; this.sync(0.016); },
      ato: (on) => this.svc.setAto(on), key: (k, down = true) => this._key({ key: k, code: k, repeat: false, preventDefault() {}, target: document.body }, down),
      interact: () => this.interact(), context: () => this.context, mode: () => this.mode,
      teleportWalker: (x, z) => this.walker.place(x, z), walker: () => this.walker, station: () => this.activeStation,
      shuttle: () => this.shuttle, openMenu: () => this.openMenu('menu'), errors: () => this.errors,
      stationView: async (i) => this._prepare(i),
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
    removeEventListener('keydown', this._kd, true); removeEventListener('keyup', this._ku, true); removeEventListener('resize', this._onResize); removeEventListener('blur', this._blur);
    const c = this.canvas; c.removeEventListener('pointerdown', this._pd); c.removeEventListener('pointermove', this._pm); c.removeEventListener('pointerup', this._pu); c.removeEventListener('pointercancel', this._pu);
    try { if (document.pointerLockElement === c) document.exitPointerLock(); } catch (e) {}
    this.audio.dispose(); this.hud.dispose();
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
