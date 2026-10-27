// The explorer application: owns renderer/scene/rig/city/underground, selection state, hash state, sim hand-off.
import * as THREE from 'three';
import { createEnv } from './env.js';
import { Rig } from './rig.js';
import { City } from './city.js';
import { Underground } from './underground.js';
import { Labels } from './labels.js';
import { clamp, debounce, store } from './util.js';

export const QUALITY = {
  low:  { aa: true, pixelRatio: 1, tubeSegs: 10, tubeStep: 14, trains: 4, arrows: 1, chunkRadius: 3800, chunkParallel: 2, fog: 1.2 },
  med:  { aa: true, pixelRatio: 1.25, tubeSegs: 14, tubeStep: 9, trains: 6, arrows: 1, chunkRadius: 5000, chunkParallel: 3, fog: 1 },
  high: { aa: true, pixelRatio: 2, tubeSegs: 22, tubeStep: 6, trains: 8, arrows: 1, chunkRadius: Infinity, chunkParallel: 4, fog: 0.85 },
};
export function detectQuality() {
  const saved = store('quality'); if (saved && QUALITY[saved]) return saved;
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  return mobile ? 'low' : (devicePixelRatio > 1.5 ? 'med' : 'high');
}

export class App {
  constructor({ canvas, labelsEl, base, data, qualityName }) {
    this.canvas = canvas; this.base = base; this.data = data; this.subway = data.subway; this.terrainMod = data.terrain;
    this.ground = (x, z) => this.terrainMod.groundHeight(x, z);
    this.qname = qualityName; this.quality = { ...QUALITY[qualityName] };
    this.listeners = {}; this.state = { xray: 0, light: 'day', selected: null, hovered: null, tour: false, sim: false, exag: 1, ready: false, frames: 0 };
    this.env = createEnv(canvas, this.quality); this.env.fogScale = this.quality.fog; this.env.refresh();
    this.rig = new Rig(this.env.camera, canvas, this.ground);
    this.labels = new Labels(labelsEl, this.env.camera);
    this.stations = this.subway.stations; this.byId = new Map(this.stations.map((s) => [s.id, s]));
    const xs = this.stations.map((s) => s.x), zs = this.stations.map((s) => s.z);
    this.bounds = { minX: Math.min(...xs) - 1800, maxX: Math.max(...xs) + 1800, minZ: Math.min(...zs) - 1800, maxZ: Math.max(...zs) + 1800 };
    this.centre = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2); this.centre.y = this.ground(this.centre.x, this.centre.z);
    this.span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    this.rig.bounds = { minX: this.bounds.minX - 600, maxX: this.bounds.maxX + 600, minZ: this.bounds.minZ - 600, maxZ: this.bounds.maxZ + 600 };
    this.pointer = { x: 0, y: 0, in: false, moved: false, down: null }; this.ray = new THREE.Raycaster(); this.last = performance.now();
    this.running = true; this.xrayTarget = 0; this.lsMarker = null;
    this.onHashSave = debounce(() => this.writeHash(), 350);
    this.rig.onUserInput = () => { this.emit('userinput'); };
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { (this.listeners[ev] || []).forEach((f) => f(...a)); }

  async init(progress = () => {}) {
    const q = this.quality; const t0 = performance.now();
    this.city = new City({ scene: this.env.scene, env: this.env, base: this.base, manifest: this.data.manifest, ground: this.ground, bounds: this.bounds, quality: q, onProgress: (n, t) => progress(0.25 + 0.6 * (n / Math.max(1, t)), `Building the city (${n}/${t})`) });
    await this.city.init();
    this.ug = new Underground({ scene: this.env.scene, env: this.env, subway: this.subway, ground: this.ground, quality: q });
    this.ug.setXray(0);
    // labels
    this.stations.forEach((st, i) => {
      const info = this.ug.stationInfo.get(st.id);
      this.labels.add({ id: st.id, kind: 'station', text: st.name, num: i + 1, pos: info.surface.clone().add(new THREE.Vector3(0, 165, 0)), priority: 10 - (i % 3), onClick: (id) => this.selectStation(id, { fly: true }), onHover: (id) => this.setHover(id) });
    });
    this.rebuildCrossingLabels();
    // marker used by the long-section chart
    this.marker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false })); this.marker.renderOrder = 20; this.marker.visible = false; this.env.scene.add(this.marker);
    this.env.listeners.push(() => this.city.applyAll());
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7d9b78' }));
    fg.position.set(this.centre.x, -1, this.centre.z); fg.renderOrder = 1; fg.material.polygonOffset = true; fg.material.polygonOffsetFactor = 8; fg.material.polygonOffsetUnits = 16; this.farGround = fg; this.env.scene.add(fg);
    // the far ground is unlit (MeshBasicMaterial): tint it with the lighting preset so it is not bright green at dusk / night
    const fgBase = new THREE.Color('#7d9b78'), fgTmp = new THREE.Color();
    const tintFar = (c) => { const k = clamp((c.sunI * 0.25 + c.hemiI * 0.4) / 1.23, 0, 1); fg.material.color.copy(fgBase).multiplyScalar(k * k).lerp(fgTmp.copy(c.fog), 0.25 * (1 - k)); };
    this.env.listeners.push(tintFar); tintFar(this.env.cur);
    progress(0.86, 'Placing the stations');
    // initial view
    this.heroView = this.makeHero(); this.rig.setView(this.heroView);
    this.resize(); addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement);
    this.bindPointer();
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.running = false; this.emit('contextlost'); });
    this.canvas.addEventListener('webglcontextrestored', () => { this.running = true; this.last = performance.now(); this.emit('contextrestored'); requestAnimationFrame((t) => this.frame(t)); });
    document.addEventListener('visibilitychange', () => { this.last = performance.now(); });
    this.city.update(0.016, this.rig.target);
    requestAnimationFrame((t) => this.frame(t));
    return this;
  }
  rebuildCrossingLabels() {
    this.labels.clear('xing');
    for (const c of this.ug.crossings) this.labels.add({ id: 'x-' + c.name, kind: 'xing', text: 'Under the Clyde', pos: () => (this.state.xray > 0.3 ? c.pos.clone().setY(c.pos.y) : c.surface), priority: 0 });
  }
  /** Close, crisp default view: ~2 km out at a ~45 degree pitch, centred on the loop. */
  makeHero() {
    const c = this.centre.clone(); c.y = this.ground(c.x, c.z);
    const narrow = innerWidth / innerHeight < 0.8;
    return { target: c, dist: narrow ? 2500 : 2800, polar: narrow ? 0.78 : 0.9, azim: 0 };
  }
  /** Whole loop in frame (used by the tour and the Home button's long press). */
  makeWide() {
    const c = this.centre.clone(); c.y = this.ground(c.x, c.z);
    const cs = getComputedStyle(document.documentElement); const lw = parseFloat(cs.getPropertyValue('--lw')) || 0, rw = parseFloat(cs.getPropertyValue('--rw')) || 0;
    const W = Math.max(300, innerWidth - lw - rw - 40), H = Math.max(300, innerHeight - (innerWidth < 900 ? 330 : 160));
    const tv = Math.tan(((innerWidth / innerHeight < 0.8 ? 62 : 48) * Math.PI / 180) / 2); const polar = innerWidth / innerHeight < 0.8 ? 0.7 : 0.92;
    const xs = this.stations.map((s) => s.x), zs = this.stations.map((s) => s.z);
    const halfX = (Math.max(...xs) - Math.min(...xs)) / 2 + 250, halfZ = ((Math.max(...zs) - Math.min(...zs)) / 2 + 250) * Math.sin(polar) + 80;
    return { target: c, dist: Math.max(1800, Math.max(halfX * innerHeight / (tv * W), halfZ * innerHeight / (tv * H)) * 1.22), polar, azim: 0 };
  }
  resize() {
    const p = this.canvas.parentElement; const w = Math.max(1, p.clientWidth), h = Math.max(1, p.clientHeight);
    this.env.renderer.setPixelRatio(Math.min(this.quality.pixelRatio, devicePixelRatio || 1)); this.env.setSize(w, h); this.w = w; this.h = h;
    this.env.camera.fov = w / h < 0.8 ? 62 : 48; this.env.camera.updateProjectionMatrix();
  }

  // ---------- state setters ----------
  setXray(v, { animate = false } = {}) {
    v = clamp(v, 0, 1); this.xrayTarget = v;
    if (!animate) { this.applyXray(v); }
  }
  applyXray(v) {
    if (Math.abs(v - this.state.xray) < 1e-4) return;
    this.state.xray = v; this.env.setDim(v); this.farGround && (this.farGround.visible = v < 0.3); this.city.setXray(v); this.ug.setXray(v); this.emit('xray', v); this.onHashSave();
  }
  setLight(name, instant = false) { this.state.light = name; this.env.setPreset(name, instant); this.emit('light', name); this.onHashSave(); }
  setExaggeration(k) { this.state.exag = k; this.ug.setExaggeration(k); this.rebuildCrossingLabels(); this.emit('exag', k); this.onHashSave(); }
  setLayer(name, on) {
    if (name === 'tunnels' || name === 'stations') this.ug.setVisible(name, on);
    else if (name === 'labels') this.labels.setVisible(on);
    else if (name === 'parks') this.city.setLayer('green', on);
    else if (name === 'buildings') { this.city.setLayer('buildings', on); this.city.setLayer('landmarks', on); }
    else this.city.setLayer(name, on);
    this.emit('layer', name, on);
  }
  setQuality(name) {
    if (!QUALITY[name]) return; this.qname = name; store('quality', name); Object.assign(this.quality, QUALITY[name]);
    this.env.fogScale = this.quality.fog; this.env.refresh(); this.resize();
    this.ug.build(this.state.exag); this.rebuildCrossingLabels(); this.emit('quality', name);
  }
  setTimescale(v) { this.ug.timescale = v; this.emit('timescale', v); }
  setHover(id) { if (this.state.hovered === id) return; this.state.hovered = id; this.ug.hovered = id; this.emit('hover', id); }

  // ---------- navigation ----------
  stationView(id, { xray = this.state.xray, dist, angle = 0.65 } = {}) {
    const f = this.ug.focus(id, xray > 0.5); if (!f) return null;
    const p = f.point.clone(); if (xray > 0.5) p.y += 2;
    return { target: p, dist: dist ?? (xray > 0.5 ? 150 : 300), polar: xray > 0.5 ? 1.0 : 1.08, azim: -THREE.MathUtils.degToRad(f.heading) + angle };
  }
  hero(dur = 2.6) { return this.rig.flyTo(this.heroView, dur); }
  flyToView(v, dur) { return this.rig.flyTo(v, dur); }
  flyToStation(id, opts = {}) { const v = this.stationView(id, opts); return v ? this.rig.flyTo(v, opts.dur ?? 2.4) : Promise.resolve(false); }
  selectStation(id, { fly = true, quiet = false } = {}) {
    if (id && !this.byId.has(id)) id = null;
    this.state.selected = id; this.ug.setSelected(id); this.emit('select', id, { quiet });
    if (id && fly) this.flyToStation(id);
    this.onHashSave();
  }
  flyToChainage(s, key = 'outer') {
    const tr = this.ug.tracks[key]; const p = tr.at(s); const ux = this.state.xray > 0.4;
    const y = ux ? this.ug.yMap(p.x, p.z, p.y) : this.ground(p.x, p.z);
    const head = Math.atan2(-p.tz, p.tx); // world heading -> orbit azimuth: camera behind
    return this.rig.flyTo({ target: new THREE.Vector3(p.x, y, p.z), dist: ux ? 160 : 260, polar: 1.05, azim: Math.atan2(-p.tx, -p.tz) + 0.0 + (head * 0) }, 2.0);
  }
  showMarker(s) {
    if (s == null) { this.marker.visible = false; return; }
    const p = this.ug.tracks.outer.at(s); this.marker.position.set(p.x, this.ug.yMap(p.x, p.z, p.y + 1), p.z);
    const k = Math.max(2.5, this.rig.distance * 0.012); this.marker.scale.setScalar(k); this.marker.visible = true;
  }

  // ---------- pointer picking ----------
  bindPointer() {
    const c = this.canvas;
    c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); this.pointer.x = e.clientX - r.left; this.pointer.y = e.clientY - r.top; this.pointer.in = true; this.pointer.moved = true; this.pointer.touch = e.pointerType === 'touch'; });
    c.addEventListener('pointerleave', () => { this.pointer.in = false; this.setHover(null); this.emit('tubehover', null); });
    c.addEventListener('pointerdown', (e) => { this.pointer.down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    c.addEventListener('pointerup', (e) => {
      const d = this.pointer.down; this.pointer.down = null; if (!d) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 500) return;
      const r = c.getBoundingClientRect(); const id = this.pickStation(e.clientX - r.left, e.clientY - r.top, e.pointerType === 'touch' ? 3 : 1);
      if (id) this.selectStation(id, { fly: true });
    });
  }
  pickStation(px, py, slop = 1) {
    this.ray.setFromCamera(new THREE.Vector2((px / this.w) * 2 - 1, -(py / this.h) * 2 + 1), this.env.camera);
    const hits = this.ray.intersectObjects(this.ug.pickMeshes, false);
    if (hits.length) return hits[0].object.userData.station;
    if (slop > 1) { // generous touch targets: nearest projected station within 36px
      let best = null, bd = 36; const v = new THREE.Vector3();
      for (const [id, i] of this.ug.stationInfo) { v.copy(i.surface).setY(i.surface.y + 60).project(this.env.camera); if (v.z > 1) continue; const d = Math.hypot((v.x * 0.5 + 0.5) * this.w - px, (-v.y * 0.5 + 0.5) * this.h - py); if (d < bd) { bd = d; best = id; } }
      return best;
    }
    return null;
  }
  doHover() {
    const p = this.pointer; if (!p.moved || !p.in || this.rig.flight || p.down) return; p.moved = false;
    const st = this.pickStation(p.x, p.y, 1);
    this.setHover(st);
    if (st) { this.emit('tubehover', null); return; }
    if (this.state.xray > 0.25 && !p.touch) {
      this.ray.setFromCamera(new THREE.Vector2((p.x / this.w) * 2 - 1, -(p.y / this.h) * 2 + 1), this.env.camera);
      const hit = this.ug.pickTube(this.ray.ray, this.rig.distance);
      if (hit) { hit.px = p.x; hit.py = p.y; hit.outerS = hit.key === 'outer' ? hit.s : this.ug.tracks.outer.nearest(hit.x, hit.z).s; }
      this.emit('tubehover', hit);
    } else this.emit('tubehover', null);
  }

  // ---------- hash ----------
  readHash() {
    const o = {}; new URLSearchParams(location.hash.replace(/^#/, '')).forEach((v, k) => (o[k] = v)); return o;
  }
  applyHash() {
    const o = this.readHash();
    if (o.light && ['day', 'dusk', 'night'].includes(o.light)) this.setLight(o.light);
    if (o.ex) this.setExaggeration(clamp(parseFloat(o.ex) || 1, 1, 8));
    if (o.xray != null) { this.setXray(clamp(parseFloat(o.xray) || 0, 0, 1)); }
    if (o.view) { const a = o.view.split(',').map(Number); if (a.length >= 6 && a.every(Number.isFinite)) this.rig.setView({ target: new THREE.Vector3(a[0], a[1], a[2]), dist: clamp(a[3], 18, 6500), polar: clamp(a[4], 0.02, 1.52), azim: a[5] }); }
    if (o.station && this.byId.has(o.station)) { this.selectStation(o.station, { fly: !o.view, quiet: false }); if (!o.view) { const v = this.stationView(o.station); if (v) this.rig.setView(v); } }
    return o;
  }
  writeHash() {
    if (this.state.sim || this.state.tour) return;
    const v = this.rig.getView(); const p = new URLSearchParams();
    if (this.state.selected) p.set('station', this.state.selected);
    p.set('view', [v.target.x, v.target.y, v.target.z, v.dist, v.polar, v.azim].map((n, i) => n.toFixed(i < 3 ? 0 : i === 3 ? 0 : 2)).join(','));
    if (this.state.xray > 0.01) p.set('xray', this.state.xray.toFixed(2));
    if (this.state.light !== 'day') p.set('light', this.state.light);
    if (this.state.exag !== 1) p.set('ex', String(this.state.exag));
    try { history.replaceState(null, '', '#' + p.toString()); } catch { /* sandboxed */ }
  }

  // ---------- loop ----------
  frame(now) {
    if (!this.running) return;
    requestAnimationFrame((t) => this.frame(t));
    if (this.paused) return;
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (Math.abs(this.xrayTarget - this.state.xray) > 1e-4 && this.xrayAnim) { const k = 1 - Math.pow(0.0005, dt); this.applyXray(Math.abs(this.xrayTarget - this.state.xray) < 0.003 ? this.xrayTarget : this.state.xray + (this.xrayTarget - this.state.xray) * k); }
    this.rig.update(dt);
    { // depth precision scales with the near plane: keep it proportional to how far out we are so layers don't z-fight
      // Depth quantum ~ z^2 / (near * 2^24): the further out the camera is, the larger the near plane can be. Use both the orbit
      // distance and the camera's height above the ground (nothing can be closer than that minus ~120 m of tower height).
      const cam = this.env.camera, cp = cam.position, tg = this.rig.target;
      const hgt = cp.y - Math.max(this.ground(cp.x, cp.z), this.ground(tg.x, tg.z));
      const nt = this.nearOverride ?? clamp(Math.max(this.rig.distance * 0.02, 0.28 * (hgt - 120)), 2, 700); // nearOverride: test hook
      if (Math.abs(nt - cam.near) > cam.near * 0.12) { cam.near = nt; cam.updateProjectionMatrix(); }
    } const moved = this.rig.controls.target.distanceToSquared(this._lt || (this._lt = new THREE.Vector3())) > 0.01 || Math.abs(this.rig.distance - (this._ld || 0)) > 0.01;
    if (moved) { this._lt.copy(this.rig.controls.target); this._ld = this.rig.distance; this.onHashSave(); }
    this.env.update(dt, this.rig.target); this.city.update(dt, this.rig.target, this.env.camera.position);
    this.ug.update(dt, this.env.camera, this.rig.distance);
    if (this.ug.stationsG.visible) this.doHover();
    this.labels.update(this.w, this.h, this.state.selected, this.state.hovered, this.rig.distance);
    this.emit('frame', dt);
    this.env.renderer.render(this.env.scene, this.env.camera);
    this.state.frames++;
  }
  setXrayAnimated(v) { this.xrayAnim = true; this.xrayTarget = clamp(v, 0, 1); }
  setXrayInstant(v) { this.xrayAnim = false; this.setXray(v); }

  // ---------- simulator hand-off ----------
  async launchSim({ mode = 'drive', station, line = 'outer' } = {}) {
    if (this.state.sim) return;
    let mod;
    try { mod = await import(new URL('js/sim/index.js', this.base).href); } catch (e) { this.emit('toast', 'The driving simulator is not available yet.'); return; }
    if (mod.simAvailable && !mod.simAvailable()) { this.emit('toast', 'The driving simulator is not available on this device.'); return; }
    this.state.sim = true; this.paused = true; document.body.classList.add('sim-active'); this.emit('sim', true);
    const hud = document.getElementById('simHud'); hud.hidden = false;
    let exited = false;
    const onExit = () => { if (exited) return; exited = true; this.exitSim(); };
    try {
      this.sim = await mod.startSim({ THREE, renderer: this.env.renderer, canvas: this.canvas, container: hud, subway: this.subway, terrain: this.terrainMod, startStation: station || this.state.selected || this.stations[0].id, line, mode, onExit, assetBase: './' });
      if (exited) { try { this.sim?.dispose?.(); } catch (e) { console.warn(e); } this.sim = null; }
    } catch (e) { console.warn('sim failed', e); this.emit('toast', 'The simulator failed to start.'); onExit(); }
  }
  exitSim() {
    try { this.sim?.dispose?.(); } catch (e) { console.warn(e); }
    this.sim = null; const r = this.env.renderer;
    r.setRenderTarget(null); r.setScissorTest(false); r.clippingPlanes = []; r.localClippingEnabled = false; r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.autoClear = true;
    r.setClearColor(0x000000, 1);
    const hud = document.getElementById('simHud'); hud.replaceChildren(); hud.hidden = true;
    document.body.classList.remove('sim-active'); this.state.sim = false; this.rig.keys.clear();
    this.env.renderer.setViewport(0, 0, this.w, this.h);
    this.resize(); this.env.refresh(); this.last = performance.now(); this.paused = false; this.emit('sim', false);
  }
}
