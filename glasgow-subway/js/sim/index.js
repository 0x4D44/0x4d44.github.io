// Glasgow Subway driver simulator + station walker. ES module, no bundler.
// Exports startSim(ctx) / simAvailable() per SPEC. See NOTES-A5.md.
import { Track } from './track.js';
import { Service, baselineRunTimes } from './service.js';
import { stockFrom, notchToCmd } from './dynamics.js';
import { buildSchedule, DIFFICULTY } from './rules.js';
import { KMH, clamp, wrapL, fmtDist, fmtTime, mulberry32 } from './util.js';
import { loadTrainTemplate, TrainView } from './trainview.js';
import { loadTunnelTemplate, TunnelView } from './tunnelview.js';
import { buildStation, placeStation, PY } from './stationview.js';
import { Walker } from './walker.js';
import { Crowd } from './people.js';
import { SimAudio } from './audio.js';
import { Tms } from './tms.js';
import { Hud, HELP_HTML } from './hud.js';
import { buildStreet } from './street.js';

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
    const [trainTpl, tunTpl, kitTpl, kioskTpl] = await Promise.all([
      loadTrainTemplate(THREE, GLTFLoader, this.url('models/train.glb')),
      loadTunnelTemplate(THREE, GLTFLoader, this.url('models/tunnel_segment.glb')),
      this._opt('models/station_kit.glb'), this._opt('models/entrance_kiosk.glb'),
    ]);
    this.kit = kitTpl; this.kioskTpl = kioskTpl;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x050506);
    this.scene.fog = new THREE.FogExp2(0x0a0a0c, 0.026);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
    this.scene.add(new THREE.AmbientLight(0x8a7a66, 2.6));
    this.tunnel = new TunnelView(THREE, tunTpl, this.scene);
    this.trainView = new TrainView(THREE, trainTpl.scene, {});
    this.scene.add(this.trainView.root);
    this.trainLen = this.trainView.length; this.stock.lengthM = this.trainLen; this.doorZ = this.trainView.doorZ.length ? this.trainView.doorZ : [-8.15, -3.65, 3.65, 8.15];
    this.tms = new Tms(THREE); this.tms.attach(this.trainView);
    this.headlight = new THREE.SpotLight(0xfff2d0, 160, 90, 0.7, 0.6, 1.1); this.scene.add(this.headlight, this.headlight.target);
    this.cabLight = new THREE.PointLight(0xdfe8ff, 1, 5, 1.5); this.scene.add(this.cabLight);
    this.poolLights = []; for (let i = 0; i < 5; i++) { const l = new THREE.PointLight(0xffe3b0, 0, 28, 1.4); this.scene.add(l); this.poolLights.push(l); }
    this.crowd = new Crowd(THREE, 120); this.scene.add(this.crowd.group);
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

  async _opt(path) {
    try { const g = await new Promise((res, rej) => new this.GLTFLoader().load(this.url(path), res, undefined, rej)); return g.scene; } catch (e) { console.warn('[sim] optional model missing', path); return null; }
  }

  // ------------------------------------------------------------------ line / service setup
  setupLine(line, startIdx = 0) {
    this.line = line;
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
      const PL = Math.max((stn.platform && stn.platform.lengthM) || 45, this.trainLen + 6) / 2;
      return [wrapL(st.sc - PL - 5.2, this.track.length), wrapL(st.sc + PL + 5.2, this.track.length)].concat([PL * 2 + 10.4]);
    }).map(([a, b, len]) => [a, a + len]);
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
    this.shuttle.state = 'none'; this.crowd.clear();
    this.tunnel.reset(); this.annDone = false;
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
    w.setWorld(view.zones, view.obstacles); w.heightFn = null; w.eye = 1.62; w.radius = 0.3;
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
    const w = this.walker; const obs = [];
    const half = this.trainLen / 2 - 2.5;
    const gaps = this.doorZ.map((z) => [z - 0.85, z + 0.85]).sort((a, b) => a[0] - b[0]);
    let z0 = -half; const segs = [];
    for (const [a, b] of gaps) { if (a > z0 + 0.3) segs.push([z0, a]); z0 = Math.max(z0, b); }
    if (z0 < half) segs.push([z0, half]);
    for (const [a, b] of segs) for (const sx of [-1, 1]) {
      if (b - a < 0.5) continue;
      // keep a 0.5 m gangway gap at car joints is unnecessary (open gangways)
      obs.push({ x0: sx > 0 ? 0.62 : -1.1, x1: sx > 0 ? 1.1 : -0.62, z0: a, z1: b, y: PY });
    }
    w.setWorld([{ kind: 'flat', x0: -0.98, x1: 0.98, z0: -half, z1: half, y: PY, name: 'saloon' }], obs);
    w.heightFn = null; w.eye = 1.5; w.radius = 0.22;
    this.ctxKind = 'train';
  }

  async enterStreet() {
    if (this.fadeLock) return; this.fadeLock = true; this.hud.setFade(true);
    await new Promise((r) => setTimeout(r, 480));
    const stn = this.stations[this.stationIdx.get(this.track.stops[this.exploreIdx].station)];
    const ents = (stn.entrances || []).filter((e) => e.kind === 'street' || e.kind === 'station-building' || true);
    const ent = ents.length ? ents.reduce((a, b) => (Math.hypot(a.x - stn.x, a.z - stn.z) <= Math.hypot(b.x - stn.x, b.z - stn.z) ? a : b)) : { x: stn.x, z: stn.z };
    try { this.street = await buildStreet(this.THREE, { entrance: ent, station: stn, terrain: this.terrain, GLTFLoader: this.GLTFLoader, kioskTpl: this.kioskTpl, base: this.base }); } catch (e) { console.error('street failed', e); this.street = null; }
    if (!this.street) { this.hud.setFade(false); this.fadeLock = false; return; }
    this.mode = 'street'; this.ctxKind = 'street'; this.hud.setMode('street');
    const w = this.walker, st = this.street;
    w.setWorld([], []); w.heightFn = (x, z) => (Math.hypot(x - st.center.x, z - st.center.z) < st.radius ? st.ground(x, z) : null); w.eye = 1.65; w.radius = 0.3;
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
    this.walker.heightFn = null; this.walker.setWorld(view.zones, view.obstacles); this.walker.eye = 1.62; this.walker.radius = 0.3; this.activeStation = view;
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
  _ensureStation(stopIdx, force = false) {
    let v = this.stationViews.get(stopIdx);
    if (v) return v;
    const THREE = this.THREE, stop = this.track.stops[stopIdx];
    const si = this.stationIdx.get(stop.station); const station = this.stations[si];
    const tmp = new Service({ track: this.track, stock: this.stock, stations: this.stations, startIdx: stopIdx, placeAtStop: false, lineKey: this.line });
    const side = tmp.sideOf[stopIdx];
    v = buildStation(THREE, { station, stop, side, lineKey: this.line, trainLen: this.trainLen, idx: si });
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
    v.crowdN = n;
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
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), new THREE.MeshLambertMaterial({ color: 0x222428 })); post.position.y = 1.3; g.add(post);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.2), new THREE.MeshLambertMaterial({ color: 0x15171a })); box.position.set(0, 2.4, 0); g.add(box);
    this.sigRed = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); this.sigRed.position.set(0, 2.58, -0.11);
    this.sigGreen = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: 0x23ff6a })); this.sigGreen.position.set(0, 2.24, -0.11);
    g.add(this.sigRed, this.sigGreen);
    this.sigLight = { color: new THREE.Color() };
    return { group: g };
  }

  // ------------------------------------------------------------------ input
  _bindInput() {
    const canvas = this.canvas;
    this._kd = (e) => this._key(e, true); this._ku = (e) => this._key(e, false);
    addEventListener('keydown', this._kd, true); addEventListener('keyup', this._ku, true);
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
      const a = v.anchors.exit;
      if (!this.context && Math.hypot(w.x - a.x, w.z - a.z) < 2.2 && w.y > a.y - 0.6) { this.context = { kind: 'street' }; msg = '<kbd>E</kbd> Go outside to the street'; }
      if (!this.context) {
        // facts caption
        for (const p of (v.anchors.panels || [])) if (Math.abs(w.z - p.z) < 3.2 && Math.abs(w.x - p.x) < 4 && w.y < inf.PY + 0.5) { msg = `<b>${p.title}</b> ${p.body.slice(0, 160)}`; break; }
        if (!msg) for (const p of (v.anchors.conPanels || [])) if (w.y > inf.Hc - 0.5 && Math.abs(w.z - (p.z + 4.8)) < 3.5 && w.x > inf.xcP + 4) { msg = p.body.slice(0, 160); break; }
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
      else msg = 'Walk to the orange entrance to go back underground';
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
      const door = this.doorZ.slice(); const ramp = { x: inf.xcP, z: inf.zE - 0.5 };
      const nAl = Math.min(10, Math.round(svc.pax.onboard * 0.12)), nBo = Math.min(10, Math.round(v.crowdN * 0.35));
      for (let i = 0; i < nAl; i++) { const dz = door[i % door.length]; this.crowd.stream({ x: inf.xe + inf.S * 0.4, z: zc + dz }, { x: inf.xcP, z: inf.zE - 0.5 }, 1, inf.PY, inf.PY, 0.4); }
      for (let i = 0; i < nBo; i++) { const dz = door[i % door.length]; this.crowd.stream({ x: inf.xcP, z: zc + dz + (Math.random() - 0.5) * 3 }, { x: inf.xe + inf.S * 0.3, z: zc + dz }, 1, inf.PY, inf.PY, 0.6); }
    }
    if (sh.state !== 'dwell') sh.streamed = false;
  }
  fastForward(sec, step = 0.1) { for (let t = 0; t < sec; t += step) this.tick(step); }

  // ------------------------------------------------------------------ rendering
  _resize() {
    const r = this.renderer, c = this.canvas;
    const w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
    if (this.camera) { this.camera.aspect = w / h; this.camera.fov = w / h < 0.8 ? 82 : 70; this.camera.updateProjectionMatrix(); }
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

  sync(dt) {
    const THREE = this.THREE, svc = this.svc, tr = svc.train, cam = this.camera, track = this.track;
    const underground = this.mode !== 'street';
    if (underground) {
      this._mgrT = (this._mgrT || 0) - dt; if (this._mgrT <= 0) { this._mgrT = 0.4; this._manageStations(); }
      this.trainView.place(track, tr.s);
      const d = svc.doors; this.trainView.setDoors(d.L, d.R);
      if (this.mode === 'explore') { if (this._tw !== 'x') { this.tunnel.setWindow(60, 45); this._tw = 'x'; } this.tunnel.update(track, track.stops[this.exploreIdx].sc); }
      else { if (this._tw !== 'd') { this.tunnel.setWindow(75, 22); this._tw = 'd'; } this.tunnel.update(track, tr.s - this.trainLen / 2); }
      for (const v of this.stationViews.values()) v.update(this.time);
      this.crowd.update(dt, this.time, (x, z, y) => y);
      this._signal(svc);
      this.tms.update(dt, svc.info(), this.mode);
      // lights
      const front = new THREE.Vector3(), q = new THREE.Quaternion(); this.trainView.eyeWorld(front, q);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      this.headlight.position.copy(front).add(new THREE.Vector3(0, -0.6, 0)).addScaledVector(fwd, 12);
      this.headlight.target.position.copy(front).addScaledVector(fwd, 40);
      this.headlight.intensity = this.mode === 'explore' && !this.trainView.root.visible ? 0 : 160;
      this.cabLight.position.copy(front).add(new THREE.Vector3(0, 0.4, 0)).addScaledVector(fwd, -0.2);
      this._lightPool();
      this._camera(front, q, dt);
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
    let title = 'Next: ' + svc.station.name, distText = svc.phase === 'station' ? '' : fmtDist(Math.max(0, svc.distToStop)), sub = '';
    if (this.mode === 'drive') {
      sub = svc.phase === 'station' ? (svc.doorsClosed ? (svc.signalGreen ? 'Signal clear - depart' : `Dwell ${Math.ceil(info.dwellLeft)} s`) : 'Doors open') : `${this.line === 'outer' ? 'Outer' : 'Inner'} circle - ${svc.diff.label}`;
      if (svc.phase === 'station') title = 'At: ' + svc.station.name;
    } else if (this.mode === 'ride') { title = svc.phase === 'station' ? 'At: ' + svc.station.name : 'Next: ' + svc.station.name; sub = this.alightNext ? 'Getting off here' : 'Press N to get off at the next stop'; }
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
    g.visible = show; if (!show) return;
    const p = tr.pose(svc.sigU, this._sp || (this._sp = {}));
    const rx = -p.tz, rz = p.tx; // right
    g.position.set(p.x + rx * 1.75, p.y - 0.1, p.z + rz * 1.75);
    g.rotation.y = Math.atan2(-p.tx, -p.tz) + Math.PI;
    const green = svc.signalGreen && svc.phase !== 'run';
    const gr = svc.signalGreen; this.sigRed.visible = !gr; this.sigGreen.visible = gr; this.sigLight.color.set(gr ? 0x23ff6a : 0xff2a1a);
  }

  _camera(front, q, dt) {
    const THREE = this.THREE, cam = this.camera, svc = this.svc, tr = svc.train;
    const e = this._e || (this._e = new THREE.Euler()), ql = this._ql || (this._ql = new THREE.Quaternion());
    if (this.mode === 'drive') {
      this.bobT += tr.v * dt;
      const vib = Math.min(1, tr.v / 10);
      const sway = this.track.curvature(tr.s) * tr.v * tr.v * 0.02;
      const off = new THREE.Vector3(Math.sin(this.bobT * 1.9) * 0.004 * vib + sway, Math.sin(this.bobT * 4.1) * 0.006 * vib + Math.sin(this.time * 31) * 0.0015 * vib, 0).applyQuaternion(q);
      cam.position.copy(front).add(off);
      e.set(this.look.pitch, this.look.yaw, 0, 'YXZ'); ql.setFromEuler(e); cam.quaternion.copy(q).multiply(ql);
    } else if (this.mode === 'ride') {
      const w = this.walker, ci = this.trainView.carAt(w.z), car = this.trainView.cars[ci], info = this.trainView.carInfo[ci];
      const local = new THREE.Vector3(w.x, w.eyeY(), w.z - info.zc);
      cam.position.copy(local).applyMatrix4(car.matrix);
      const cq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(car.matrix));
      e.set(this.look.pitch, w.yaw, 0, 'YXZ'); ql.setFromEuler(e); cam.quaternion.copy(cq).multiply(ql);
      // rumble
      cam.position.y += Math.sin(this.time * 37) * 0.002 * Math.min(1, tr.v / 8);
    } else if (this.mode === 'explore') {
      const w = this.walker, g = this.activeStation.group;
      const p = new THREE.Vector3(w.x, w.eyeY(), w.z); g.localToWorld(p); cam.position.copy(p);
      e.set(this.look.pitch, w.yaw, 0, 'YXZ'); ql.setFromEuler(e); cam.quaternion.copy(g.quaternion).multiply(ql);
    }
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
      go: (sel) => this.go(sel), tick: (dt) => this.tick(dt), ff: (s, st) => this.fastForward(s, st), sync: () => this.sync(0.016),
      ato: (on) => this.svc.setAto(on), key: (k, down = true) => this._key({ key: k, code: k, repeat: false, preventDefault() {}, target: document.body }, down),
      interact: () => this.interact(), context: () => this.context, mode: () => this.mode,
      teleportWalker: (x, z) => this.walker.place(x, z), walker: () => this.walker, station: () => this.activeStation,
      shuttle: () => this.shuttle, openMenu: () => this.openMenu('menu'), errors: () => this.errors,
      stationView: (i) => this._ensureStation(i), render: () => { this.sync(0.016); this.renderer.render(this.mode === 'street' && this.street ? this.street.scene : this.scene, this.camera); },
      setLook: (y, p) => { this.look.yaw = y; this.look.pitch = p; },
      enterStreet: () => this.enterStreet(), leaveStreet: () => this.leaveStreet(), alight: () => this._alight(), board: () => this._boardTrain(), takeCab: () => this._takeCab(),
      setLine: (l) => this.go({ mode: this.mode, line: l, station: this.sel.station }),
      timeScale: (k) => { this.timeScale = k; },
      loop: (on) => { if (on) this.renderer.setAnimationLoop((t) => this.frame(t)); else this.renderer.setAnimationLoop(null); },
      stats: () => ({ calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles, geos: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures }),
    };
  }

  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.renderer.setAnimationLoop(null);
    removeEventListener('keydown', this._kd, true); removeEventListener('keyup', this._ku, true); removeEventListener('resize', this._onResize);
    const c = this.canvas; c.removeEventListener('pointerdown', this._pd); c.removeEventListener('pointermove', this._pm); c.removeEventListener('pointerup', this._pu); c.removeEventListener('pointercancel', this._pu);
    try { if (document.pointerLockElement === c) document.exitPointerLock(); } catch (e) {}
    this.audio.dispose(); this.hud.dispose();
    for (const v of this.stationViews.values()) v.dispose();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (this.street) this.street.dispose();
    const r = this.renderer, s = this.saved; if (s) { r.setClearColor(s.clear, s.alpha); r.toneMapping = s.tm; r.toneMappingExposure = s.exp; }
    if (window.__sim && window.__sim.sim === this) delete window.__sim;
  }
}
export { Sim };
