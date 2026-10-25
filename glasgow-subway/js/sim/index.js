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
    this.scene.fog = new THREE.FogExp2(0x0a0a0c, 0.02);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
    this.scene.add(this.camera);
    this.scene.add(new THREE.AmbientLight(0x6b5f50, 1.6));
    this.tunnel = new TunnelView(THREE, tunTpl, this.scene);
    this.trainView = new TrainView(THREE, trainTpl.scene, {});
    this.scene.add(this.trainView.root);
    this.trainLen = this.trainView.length; this.stock.lengthM = this.trainLen; this.doorZ = this.trainView.doorZ.length ? this.trainView.doorZ : [-8.15, -3.65, 3.65, 8.15];
    this.tms = new Tms(THREE); this.tms.attach(this.trainView);
    this.headlight = new THREE.SpotLight(0xfff2d0, 90, 70, 0.55, 0.5, 1.2); this.scene.add(this.headlight, this.headlight.target);
    this.cabLight = new THREE.PointLight(0xdfe8ff, 3, 6, 1.5); this.scene.add(this.cabLight);
    this.saloonLights = []; for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xfff4e0, 5, 12, 1.4); this.scene.add(l); this.saloonLights.push(l); }
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
    this.scene.fog.density = 0.02;
  }

  enterRide(fresh = false) {
    this.mode = 'ride'; this.ctxKind = 'train'; this.hud.setMode('ride');
    const svc = this.svc; svc.ato = true; svc.autoDoors = true;
    this._setupTrainWalker();
    if (fresh) this.walker.place(0.0, -2.0, 0);
    this.look.yaw = 0; this.look.pitch = 0;
    this.scene.fog.density = 0.02;
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
      w.place(inf.xcP, inf.PL * 0.5, 0);
      w.yaw = inf.island ? Math.PI : -inf.S * Math.PI / 2;
    }
    this.look.pitch = 0;
  }

  _trainCentreZl() {
    const svc = this.svc, st = svc.stop;
    const centreU = svc.train.s - this.trainLen / 2 - svc.targetU + st.cabOff + (st.s - st.sc - st.cabOff);
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
    const segs = [[-11, -8.9], [-7.4, -4.4], [-2.9, -0.5], [0.5, 2.9], [4.4, 7.4], [8.9, 11]];
    for (const [a, b] of segs) for (const sx of [-1, 1]) obs.push({ x0: sx > 0 ? 0.62 : -1.1, x1: sx > 0 ? 1.1 : -0.62, z0: a, z1: b, y: 0.8 });
    w.setWorld([{ kind: 'flat', x0: -0.98, x1: 0.98, z0: -11.2, z1: 11.2, y: 0.8, name: 'saloon' }], obs);
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
    this.shuttle.state = 'none'; this.crowd.clear(); this.scene.fog.density = 0.02;
    this.hud.toast('All aboard. N: alight at next stop. Walk to the front cab and press E to drive.', 'info', 5);
  }
  _alight() {
    const idx = this.svc.idx; this.alightNext = false;
    this.mode = 'explore'; this.ctxKind = 'station'; this.hud.setMode('explore');
    this.exploreIdx = idx; this.shuttle.idx = idx; this.shuttle.state = 'dwell'; this.scene.fog.density = 0.006;
    const view = this._ensureStation(idx, true);
    const doorZ = this._nearestDoorZ();
    this._setupStationWalker(view, true);
    this.walker.place(view.info.xe + view.info.S * 0.9, this._trainCentreZl() + doorZ, -view.info.S * Math.PI / 2);
    this.svc.schedule = null; this.svc.ato = true;
    // wave of alighting passengers
    this.hud.toast('Welcome to ' + this.svc.station.name, 'info', 3);
  }
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
    this.sigLight = new THREE.PointLight(0xff2a1a, 3, 9, 1.6); this.sigLight.position.set(0, 2.4, -0.6); g.add(this.sigLight);
    return { group: g };
  }
}
export { Sim };
