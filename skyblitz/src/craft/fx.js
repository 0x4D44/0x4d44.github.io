// Effects system. Owner: craft agent.  API (frozen): constructor(game); init(); attachRacer(racer); detachRacer(racer); burst(kind, pos, opts); update(dt, game); dispose().
// Event driven (contract section 6). Attaches itself to every racer on race:ready. Pooled instanced sprites + ribbon trails, zero per-frame allocation.
import * as THREE from 'three';
import { SpriteSystem, RibbonSystem, fresnelMaterial, starTexture, glowTexture, ringTexture } from './fx-core.js';
import { LightningSystem } from './fx-lightning.js';

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _q = new THREE.Quaternion();
const ITEM_COL = { missile: [1, 0.35, 0.2], triple: [1, 0.5, 0.2], mine: [1, 0.8, 0.2], turbo: [0.3, 0.8, 1], turbo3: [0.3, 0.9, 1], shield: [0.3, 1, 0.8], emp: [0.5, 0.6, 1], storm: [0.8, 0.5, 1], smoke: [0.8, 0.8, 0.9], drone: [0.4, 1, 0.5] };
const rnd = Math.random;
const sgn = () => (rnd() < 0.5 ? -1 : 1);

export class Fx {
  constructor(game) {
    this.game = game; this.states = new Map(); this.offs = []; this.ready = false; this.time = 0;
    this.delayed = []; for (let i = 0; i < 48; i++) this.delayed.push({ t: -1, kind: 0, x: 0, y: 0, z: 0, s: 1 });
    this.trailMissiles = new Map(); this.camVel = V(); this.lastCam = V(); this.lastCamSet = false; this.sprayT = 0;
  }

  // ------------------------------------------------------------------------------------------------------------ setup
  init() {
    if (this.ready || typeof document === 'undefined') return;
    const game = this.game, A = game.assets, scene = game.scene;
    this.group = new THREE.Group(); this.group.name = 'fx'; scene.add(this.group);
    const glow = glowTexture(), star = starTexture(), ring = ringTexture();
    this.tex = { glow, star, ring };
    this.expl = new SpriteSystem(A.tex('explosion_atlas'), { cols: 4, rows: 4, additive: false, premul: true, cap: 220, order: 6 });
    this.smoke = new SpriteSystem(A.tex('smoke_atlas'), { cols: 4, rows: 4, additive: false, cap: 2400, order: 5 });
    this.glow = new SpriteSystem(glow, { additive: true, cap: 4500, order: 7 });
    this.sparks = new SpriteSystem(A.tex('spark'), { additive: true, cap: 3000, order: 7 });
    this.stars = new SpriteSystem(star, { additive: true, cap: 160, order: 8 });
    this.rings = new SpriteSystem(ring, { additive: true, cap: 160, order: 7 });
    for (const s of [this.smoke, this.expl, this.glow, this.sparks, this.rings, this.stars]) this.group.add(s.mesh);
    this.vapour = new RibbonSystem({ ribbons: 22, N: 64, additive: false, order: 4 });
    this.hot = new RibbonSystem({ ribbons: 24, N: 40, additive: true, order: 6 });
    this.group.add(this.vapour.mesh, this.hot.mesh);
    this.bolts = new LightningSystem(); this.group.add(this.bolts.group);
    this.light = new THREE.PointLight(0xffa860, 0, 160, 1.6); this.light.castShadow = false; scene.add(this.light); this.lightT = 0; this.lightBase = 0;
    // EMP ripples (expanding fresnel shells), pooled
    this.emps = []; const eg = new THREE.SphereGeometry(1, 28, 18);
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(eg, fresnelMaterial(0x5ab4ff, 0.9, 1.1)); m.visible = false; m.frustumCulled = false; m.renderOrder = 9; this.group.add(m); this.emps.push({ mesh: m, t: 1e9, life: 0.8, r: 100 }); }
    this.shieldGeo = new THREE.SphereGeometry(1, 28, 18);
    // speed streaks: world-fixed segments around the player's camera
    const NS = 110; this.streakN = NS; this.streakPts = new Float32Array(NS * 3);
    const sg = new THREE.BufferGeometry(); this.streakPos = new THREE.BufferAttribute(new Float32Array(NS * 6), 3).setUsage(THREE.DynamicDrawUsage); sg.setAttribute('position', this.streakPos);
    this.streakMat = new THREE.LineBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.streaks = new THREE.LineSegments(sg, this.streakMat); this.streaks.frustumCulled = false; this.streaks.renderOrder = 6; this.group.add(this.streaks);
    for (let i = 0; i < NS; i++) this._respawnStreak(i, true);
    this._listen(); this.ready = true;
  }

  _listen() {
    const ev = this.game.events, on = (t, f) => this.offs.push(ev.on(t, f));
    on('race:ready', ({ race }) => { for (const r of race.racers) this.attachRacer(r); });
    on('race:end', () => { for (const r of [...this.states.keys()]) this.detachRacer(r); });
    on('game:resize', () => {});
    on('gate:pass', ({ gate, perfect, racer }) => { if (gate?.pos) this.gatePass(gate.pos, gate.radius || 35, !!perfect, gate.quat); void racer; });
    on('pickup:orb', ({ item, pos }) => { if (pos) this.pickup(pos, ITEM_COL[item] || [1, 1, 1]); });
    on('missile:launch', ({ pos, owner }) => { this.launchPuff(pos, owner); });
    on('missile:hit', ({ pos }) => { if (pos) this.explosion(pos, 1.15); });
    on('mine:hit', ({ pos }) => { if (pos) this.flak(pos); });
    on('mine:drop', ({ pos }) => { if (pos) this.puffs(pos, 5, 1.2, 0.6); });
    on('emp:fire', ({ pos, radius }) => { if (pos) this.empRipple(pos, radius || 120); });
    on('lightning:strike', ({ pos, target }) => { if (pos) this.lightning(pos, target); });
    on('smoke:deploy', ({ pos }) => { if (pos) this.smokeScreen(pos); });
    on('drone:launch', ({ drone, owner }) => { const p = drone?.pos || owner?.render?.pos; if (p) this.flare(p, 3.5, 0.5, 1, 0.6); });
    on('shield:up', ({ racer }) => { const s = this.states.get(racer); if (s) s.shieldAnim = 1; this._shield(racer, true); });
    on('shield:block', ({ racer }) => { const s = this.states.get(racer); if (s) { s.shieldPulse = 1; const p = racer.render.pos; this.sparkBurst(p.x, p.y, p.z, 22, 70, 0.5, 1, 0.95, 0.5); this.ringPulse(p, 8, 0.4, 0.5, 1, 0.9); } });
    on('shield:down', ({ racer }) => { const s = this.states.get(racer); if (s) s.shieldAnim = -1; });
    on('cannon:fire', ({ pos, dir }) => { if (pos) this.muzzle(pos, dir); });
    on('cannon:hit', ({ pos }) => { if (pos) { this.sparkBurst(pos.x, pos.y, pos.z, 14, 55, 1, 0.8, 0.3); this.flare(pos, 2.4, 1, 0.8, 0.4, 0.12); } });
    on('racer:hit', ({ racer, kind, pos, severity = 0.5 }) => this.onHit(racer, kind, pos, severity));
    on('racer:tumble', ({ racer }) => { const s = this.states.get(racer); if (s) s.damage = true; });
    on('racer:recover', ({ racer }) => { const s = this.states.get(racer); if (s) s.damage = false; });
    on('racer:boost', ({ racer, kind, power }) => this.onBoost(racer, kind, power));
    on('racer:stunt', ({ racer, kind }) => { const s = this.states.get(racer); if (s) { s.glow = 1.6; this.stuntBurst(racer, kind); } });
    on('racer:graze', ({ surface, pos, intensity = 0.5 }) => { if (pos) this.graze(surface, pos, intensity); });
    on('race:rocketStart', ({ racer, perfect }) => { const s = this.states.get(racer); if (s) this.exhaustBlast(racer, perfect ? 1.6 : 1); });
    on('race:finish', ({ racer }) => { this.celebrate(racer); });
    on('race:respawn', ({ racer }) => { const s = this.states.get(racer); if (s) this._cut(s); });
    on('game:raceStart', () => { for (const s of this.states.values()) this._cut(s); });
  }

  // ------------------------------------------------------------------------------------------------------------ racers
  attachRacer(racer) {
    if (!this.ready || this.states.has(racer)) return;
    const q = this.game.q || {};
    const s = { racer, tipV: [-1, -1], tipH: [-1, -1], shield: null, shieldAnim: 0, shieldPulse: 0, damage: false, glow: 0, exAcc: 0, dmgAcc: 0, sprayAcc: 0, boostSm: 0, lastPos: V(), has: false, dustCol: [0.8, 0.8, 0.8] };
    const lv = racer.spec?.liveries?.[racer.livery || 0];
    s.accent = new THREE.Color(lv ? lv.accent : '#ffffff');
    const life = 1.5 * (q.trails ?? 1);
    for (let i = 0; i < 2; i++) s.tipV[i] = this.vapour.acquire(0.3, life, 1, 1, 1, 1);
    const nEx = Math.min(2, racer.model?.userData?.exhausts?.length || 1);
    for (let i = 0; i < nEx; i++) s.tipH[i] = this.hot.acquire(0.32, 0.55 * Math.max(0.5, q.trails ?? 1), 0.5, 0.8, 1, 0);
    s.nEx = nEx; this.states.set(racer, s);
  }
  detachRacer(racer) {
    const s = this.states.get(racer); if (!s) return;
    for (const id of s.tipV) this.vapour.release(id); for (const id of s.tipH) this.hot.release(id);
    if (s.shield) { this.group.remove(s.shield); s.shield.material.dispose(); }
    this.states.delete(racer);
  }
  _cut(s) { for (const id of s.tipV) this.vapour.cut(id); for (const id of s.tipH) this.hot.cut(id); s.has = false; }
  _shield(racer, on) {
    const s = this.states.get(racer); if (!s) return;
    if (on && !s.shield) { const m = new THREE.Mesh(this.shieldGeo, fresnelMaterial(0x45e6ff, 2.0, 1.4)); m.frustumCulled = false; m.renderOrder = 9; this.group.add(m); s.shield = m; }
    if (s.shield) s.shield.visible = on;
  }

  /** Public helper for other modules: burst('explosion'|'sparks'|'smoke'|'debris'|'flash'|'shockwave'|'lightning'|'pickup'|'flak'|'gate', pos, opts). */
  burst(kind, pos, opts = {}) {
    if (!this.ready || !pos) return;
    const s = opts.scale ?? 1;
    switch (kind) {
      case 'explosion': this.explosion(pos, s); break;
      case 'sparks': this.sparkBurst(pos.x, pos.y, pos.z, opts.count ?? 20, opts.speed ?? 60, ...(opts.color || [1, 0.8, 0.3])); break;
      case 'smoke': this.puffs(pos, opts.count ?? 8, s, 0.7); break;
      case 'debris': this.debris(pos, opts.count ?? 10, s); break;
      case 'flash': this.flare(pos, 6 * s, 1, 0.9, 0.7, 0.2); break;
      case 'shockwave': this.ringPulse(pos, 30 * s, 0.6, 1, 0.9, 0.7); break;
      case 'lightning': this.lightning(pos, null); break;
      case 'pickup': this.pickup(pos, opts.color || [1, 1, 1]); break;
      case 'flak': this.flak(pos); break;
      case 'gate': this.gatePass(pos, opts.radius || 35, !!opts.perfect); break;
      case 'empRipple': this.empRipple(pos, opts.radius || 120); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------------------------------------------------ emitters
  get pm() { return this.game.q?.particles ?? 1; }
  flare(p, size, r, g, b, life = 0.2) { this.glow.emit(p.x, p.y, p.z, 0, 0, 0, life, size, size * 1.6, r, g, b, 1, r, g * 0.8, b * 0.6, 0); }
  ringPulse(p, size, life, r, g, b) { this.rings.emit(p.x, p.y, p.z, 0, 0, 0, life, size * 0.15, size, r * 1.3, g * 1.3, b * 1.3, 0.9, r * 0.6, g * 0.6, b * 0.6, 0); }
  sparkBurst(x, y, z, n, speed, r = 1, g = 0.8, b = 0.3) {
    n = Math.max(1, Math.round(n * this.pm));
    for (let i = 0; i < n; i++) {
      _a.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(speed * (0.35 + rnd() * 0.9));
      this.sparks.emit(x, y, z, _a.x, _a.y, _a.z, 0.35 + rnd() * 0.55, 0.9 + rnd() * 0.8, 0.1, r * 2.2, g * 2.2, b * 2.2, 1, r, g * 0.4, b * 0.2, 0, 14, 1.2);
    }
  }
  puffs(p, n, size, dark) {
    n = Math.max(1, Math.round(n * this.pm));
    for (let i = 0; i < n; i++) {
      this.smoke.emit(p.x + (rnd() - 0.5) * size, p.y + (rnd() - 0.5) * size, p.z + (rnd() - 0.5) * size, (rnd() - 0.5) * 6, 2 + rnd() * 5, (rnd() - 0.5) * 6, 1.4 + rnd() * 1.4, size * 1.2, size * 4.5, dark, dark, dark, 0.7, dark * 1.1, dark * 1.1, dark * 1.15, 0, -1.5, 1.2, Math.floor(rnd() * 16), 0, rnd() * 6, (rnd() - 0.5) * 1.2);
    }
  }
  debris(p, n, scale) {
    n = Math.max(2, Math.round(n * this.pm));
    for (let i = 0; i < n; i++) {
      _a.set(rnd() - 0.5, rnd() * 0.6 - 0.1, rnd() - 0.5).normalize().multiplyScalar((20 + rnd() * 45) * scale);
      this.sparks.emit(p.x, p.y, p.z, _a.x, _a.y, _a.z, 0.9 + rnd() * 0.8, 1.4 + rnd() * 1.4, 0.6, 1.5, 0.7, 0.25, 1, 0.25, 0.12, 0.08, 0.8, 22, 0.5);
    }
  }
  explosion(p, scale = 1) {
    const s = scale;
    this.expl.emit(p.x, p.y, p.z, 0, 4, 0, 1.0, 26 * s, 56 * s, 1.7, 1.45, 1.25, 1, 1, 0.9, 0.8, 0.9, 0, 0.5, 0, 16, rnd() * 6, 0.3);
    this.expl.emit(p.x + (rnd() - 0.5) * 6 * s, p.y + 2, p.z + (rnd() - 0.5) * 6 * s, 0, 8, 0, 0.85, 14 * s, 36 * s, 1.5, 1.1, 0.7, 1, 1, 0.8, 0.6, 0.8, 0, 0.5, 2, 14, rnd() * 6, -0.4);
    this.flare(p, 26 * s, 1.2, 0.75, 0.4, 0.2);
    this.stars.emit(p.x, p.y, p.z, 0, 0, 0, 0.3, 8 * s, 34 * s, 1.5, 1.0, 0.55, 0.9, 1, 0.55, 0.25, 0, 0, 0, 0, 0, rnd() * 3, 1.5);
    this.ringPulse(p, 42 * s, 0.55, 1, 0.55, 0.28);
    this.sparkBurst(p.x, p.y, p.z, 46, 95 * s, 1, 0.75, 0.25);
    this.debris(p, 14, s);
    this.puffs(p, 10, 5 * s, 0.22);
    this.light.position.copy(p); this.lightT = 0.45; this.lightBase = 55 * s;
    this.light.color.setRGB(1, 0.62, 0.3);
  }
  flak(p) {
    for (let i = 0; i < 4; i++) { _a.set(rnd() - 0.5, rnd() - 0.4, rnd() - 0.5).multiplyScalar(14); this.expl.emit(p.x + _a.x, p.y + _a.y, p.z + _a.z, 0, 3, 0, 0.6 + rnd() * 0.25, 5, 14, 1.6, 1.3, 1, 1, 1, 0.8, 0.6, 0.8, 0, 0.5, 2, 14, rnd() * 6, 0.3); }
    this.flare(p, 26, 1.5, 1.2, 0.8, 0.14); this.ringPulse(p, 34, 0.45, 1, 0.8, 0.5);
    this.sparkBurst(p.x, p.y, p.z, 40, 85, 1, 0.8, 0.35); this.debris(p, 10, 0.7); this.puffs(p, 5, 3, 0.2);
    this.light.position.copy(p); this.lightT = 0.3; this.lightBase = 30; this.light.color.setRGB(1, 0.7, 0.35);
  }
  muzzle(p, dir) {
    this.flare(p, 2.6, 1.6, 1.3, 0.7, 0.07);
    this.stars.emit(p.x, p.y, p.z, 0, 0, 0, 0.06, 1.2, 3.6, 2.4, 1.8, 1, 1, 1, 0.8, 0.5, 0, 0, 0, 0, 0, rnd() * 3, 0);
    for (let i = 0; i < 3; i++) this.sparks.emit(p.x, p.y, p.z, dir.x * 70 + (rnd() - 0.5) * 20, dir.y * 70 + (rnd() - 0.5) * 20, dir.z * 70 + (rnd() - 0.5) * 20, 0.18, 0.7, 0.1, 2.2, 1.6, 0.8, 1, 1, 0.5, 0.2, 0, 0, 3);
  }
  launchPuff(p, owner) {
    this.flare(p, 5, 1.4, 1.1, 0.7, 0.14); this.puffs(p, 6, 1.6, 0.8); this.sparkBurst(p.x, p.y, p.z, 14, 40, 1, 0.7, 0.3);
    void owner;
  }
  pickup(p, c) {
    const n = Math.round(30 * this.pm);
    for (let i = 0; i < n; i++) { _a.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(18 + rnd() * 30); this.sparks.emit(p.x, p.y, p.z, _a.x, _a.y, _a.z, 0.5 + rnd() * 0.5, 1.6, 0.2, c[0] * 2 + 0.3, c[1] * 2 + 0.3, c[2] * 2 + 0.3, 1, c[0], c[1], c[2], 0, 4, 1.6); }
    this.ringPulse(p, 14, 0.4, c[0], c[1], c[2]);
    this.stars.emit(p.x, p.y, p.z, 0, 0, 0, 0.4, 3, 14, c[0] * 2 + 0.5, c[1] * 2 + 0.5, c[2] * 2 + 0.5, 1, c[0], c[1], c[2], 0, 0, 0, 0, 0, rnd() * 3, 1.2);
  }
  gatePass(p, radius, perfect, quat) {
    const n = Math.round((perfect ? 56 : 26) * this.pm);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
      _a.set(Math.cos(a), Math.sin(a), 0); if (quat) _a.applyQuaternion(quat);
      const rr = radius * (perfect ? 0.95 : 0.9);
      const hue = perfect ? [1, 0.85, 0.3] : [0.5, 0.9, 1];
      this.sparks.emit(p.x + _a.x * rr, p.y + _a.y * rr, p.z + _a.z * rr, _a.x * (perfect ? 26 : 10) + (rnd() - 0.5) * 6, _a.y * (perfect ? 26 : 10) + (rnd() - 0.5) * 6, _a.z * (perfect ? 26 : 10) + (rnd() - 0.5) * 6, 0.6 + rnd() * 0.5, 2.4, 0.2, hue[0] * 2.4, hue[1] * 2.4, hue[2] * 2.4, 1, hue[0], hue[1] * 0.7, hue[2] * 0.5, 0, 2, 1.5);
    }
    this.ringPulse(p, radius * 2.3, 0.5, perfect ? 0.8 : 0.3, perfect ? 0.65 : 0.7, perfect ? 0.25 : 0.8);
    if (perfect) {
      this.stars.emit(p.x, p.y, p.z, 0, 0, 0, 0.5, radius * 0.4, radius * 1.3, 1.5, 1.15, 0.5, 0.9, 1, 0.7, 0.25, 0, 0, 0, 0, 0, 0.2, 0.9);
      this.ringPulse(p, radius * 2.8, 0.7, 0.8, 0.65, 0.3);
    }
  }
  stuntBurst(racer, kind) {
    const p = racer.render.pos, acc = this.states.get(racer)?.accent; const n = Math.round(24 * this.pm);
    const r = acc ? acc.r : 1, g = acc ? acc.g : 1, b = acc ? acc.b : 1;
    const rad = racer.model?.userData?.radius || 6;
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; _a.set(Math.cos(a), Math.sin(a), 0).applyQuaternion(racer.render.quat); this.sparks.emit(p.x + _a.x * rad * 0.6, p.y + _a.y * rad * 0.6, p.z + _a.z * rad * 0.6, _a.x * 12, _a.y * 12, _a.z * 12, 0.6, 1.8, 0.2, r * 2 + 0.6, g * 2 + 0.6, b * 2 + 0.6, 1, r, g, b, 0, 2.5, 1.6); }
    this.stars.emit(p.x, p.y, p.z, 0, 0, 0, 0.35, 4, 16, r * 2 + 0.5, g * 2 + 0.5, b * 2 + 0.5, 0.9, r, g, b, 0, 0, 0, 0, 0, rnd() * 3, 1.5);
    void kind;
  }
  onHit(racer, kind, pos, severity) {
    const p = pos || racer?.render?.pos; if (!p) return;
    switch (kind) {
      case 'missile': case 'mine': case 'emp': case 'lightning': break;   // their own events render the main effect
      case 'cannon': this.sparkBurst(p.x, p.y, p.z, 10, 40, 1, 0.8, 0.3); break;
      case 'racer': this.sparkBurst(p.x, p.y, p.z, 18, 50, 1, 0.9, 0.5); this.flare(p, 3, 1.2, 1, 0.8, 0.1); break;
      case 'hazard': this.explosion(p, 0.7 + severity * 0.4); break;
      case 'ground': case 'wall': this.sparkBurst(p.x, p.y, p.z, 20 + severity * 20, 45, 1, 0.8, 0.4); this.puffs(p, 4, 2, 0.55); break;
      default: this.sparkBurst(p.x, p.y, p.z, 12, 40);
    }
    if (kind !== 'emp' && kind !== 'lightning') this.puffs(p, 3, 1.5, 0.15);
  }
  onBoost(racer, kind, power) {
    const s = this.states.get(racer); if (!s) return;
    if (kind === 'meter' || kind === 'draft') return;
    this.exhaustBlast(racer, kind === 'start' ? 1.2 : 0.8 + (power || 1.3) * 0.25);
  }
  exhaustBlast(racer, k) {
    const ex = racer.model?.userData?.exhausts; if (!ex?.length) return;
    for (let i = 0; i < ex.length; i++) {
      _a.copy(ex[i]).applyQuaternion(racer.render.quat).add(racer.render.pos);
      this.flare(_a, 7 * k, 0.7, 0.9, 1.5, 0.22);
      _b.set(0, 0, 1).applyQuaternion(racer.render.quat);
      for (let j = 0; j < 8; j++) this.sparks.emit(_a.x, _a.y, _a.z, _b.x * (50 + rnd() * 80) + (rnd() - 0.5) * 14, _b.y * (50 + rnd() * 80) + (rnd() - 0.5) * 14, _b.z * (50 + rnd() * 80) + (rnd() - 0.5) * 14, 0.4 + rnd() * 0.3, 1.2, 0.1, 0.8, 1.4, 2.4, 1, 1, 0.5, 0.2, 0, 0, 2);
    }
    // shock ring behind the aircraft
    _a.copy(racer.render.pos); _b.set(0, 0, 1).applyQuaternion(racer.render.quat); _a.addScaledVector(_b, (racer.model?.userData?.radius || 6) * 0.6);
    this.ringPulse(_a, 26 * k, 0.45, 0.5, 0.8, 1);
  }
  graze(surface, pos, intensity) {
    if (surface === 'water') { this.puffs(pos, 3, 2.5, 0.95); this.sparks.emit(pos.x, pos.y + 1, pos.z, 0, 8, 0, 0.4, 1.2, 0.2, 1.2, 1.4, 1.6, 0.8, 0.8, 0.9, 1, 0, 8, 1); return; }
    this.sparkBurst(pos.x, pos.y, pos.z, 4 + intensity * 8, 35, 1, 0.75, 0.3);
    if (rnd() < 0.5) this.puffs(pos, 1, 2, 0.6);
  }
  empRipple(pos, radius) {
    let best = this.emps[0]; for (const e of this.emps) if (e.t >= e.life) { best = e; break; }
    best.t = 0; best.r = radius; best.life = 0.8; best.mesh.position.copy(pos); best.mesh.visible = true;
    this.ringPulse(pos, radius * 0.8, 0.6, 0.4, 0.8, 1); this.sparkBurst(pos.x, pos.y, pos.z, 40, radius * 0.9, 0.4, 0.8, 1);
  }
  lightning(pos, target) {
    this.bolts.strike(pos, this.game.camera);
    this.flare(pos, 16, 1.0, 1.0, 1.6, 0.2); this.sparkBurst(pos.x, pos.y, pos.z, 44, 80, 0.8, 0.8, 1); this.ringPulse(pos, 50, 0.5, 0.8, 0.8, 1);
    this.puffs(pos, 5, 4, 0.3);
    this.light.position.copy(pos); this.lightT = 0.4; this.lightBase = 70; this.light.color.setRGB(0.7, 0.75, 1);
    void target;
  }
  smokeScreen(pos) {
    const n = Math.round(60 * this.pm);
    for (let i = 0; i < n; i++) {
      _a.set(rnd() - 0.5, (rnd() - 0.5) * 0.7, rnd() - 0.5).normalize().multiplyScalar(rnd() * 28);
      const sh = 0.55 + rnd() * 0.25;
      this.smoke.emit(pos.x + _a.x, pos.y + _a.y, pos.z + _a.z, (rnd() - 0.5) * 3, (rnd() - 0.5) * 2, (rnd() - 0.5) * 3, 7 + rnd() * 3, 26, 48, sh + 0.1, sh + 0.1, sh * 1.05 + 0.1, 0.5, sh * 0.9, sh * 0.9, sh, 0, 0, 0.3, Math.floor(rnd() * 16), 0, rnd() * 6, (rnd() - 0.5) * 0.3);
    }
  }
  celebrate(racer) {
    const p = racer.render.pos;
    for (let i = 0; i < 5; i++) {
      const d = this.delayed.find((x) => x.t < 0); if (!d) break;
      d.t = i * 0.28 + 0.1; d.kind = 1; d.x = p.x + (rnd() - 0.5) * 50; d.y = p.y + 25 + rnd() * 25; d.z = p.z + (rnd() - 0.5) * 50; d.s = 1;
    }
  }
  _firework(x, y, z) {
    const c = [[1, 0.4, 0.3], [0.4, 0.8, 1], [1, 0.9, 0.3], [0.7, 0.5, 1], [0.4, 1, 0.6]][Math.floor(rnd() * 5)];
    const n = Math.round(70 * this.pm);
    for (let i = 0; i < n; i++) { _a.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(30 + rnd() * 8); this.sparks.emit(x, y, z, _a.x, _a.y, _a.z, 1.4 + rnd() * 0.4, 2.2, 0.3, c[0] * 2.4, c[1] * 2.4, c[2] * 2.4, 1, c[0], c[1], c[2], 0, 6, 1.8); }
    this.stars.emit(x, y, z, 0, 0, 0, 0.5, 6, 30, c[0] * 2, c[1] * 2, c[2] * 2, 1, c[0], c[1], c[2], 0, 0, 0, 0, 0, rnd() * 3, 1);
  }

  // ------------------------------------------------------------------------------------------------------------ streaks
  _respawnStreak(i, init) {
    const cam = this.game.camera; const ang = rnd() * 6.283, r = 7 + Math.pow(rnd(), 0.7) * 45, d = init ? rnd() * 140 : 90 + rnd() * 60;
    _a.set(Math.cos(ang) * r, Math.sin(ang) * r, -d).applyQuaternion(cam.quaternion).add(cam.position);
    this.streakPts[i * 3] = _a.x; this.streakPts[i * 3 + 1] = _a.y; this.streakPts[i * 3 + 2] = _a.z;
  }
  _updateStreaks(dt, speedFrac, boost, dirV, speed) {
    const cam = this.game.camera, N = this.streakN, P = this.streakPos.array, T = this.streakPts;
    const reduce = this.game.settings?.reduceFlash;
    this.streakMat.opacity = Math.min(0.55, (Math.max(0, speedFrac - 0.25) * 0.6 + boost * 0.35)) * (reduce ? 0.4 : 1) * Math.min(1, this.pm + 0.3);
    this.streaks.visible = this.streakMat.opacity > 0.01;
    if (!this.streaks.visible) return;
    const len = Math.min(18, speed * 0.05 + boost * 5);
    cam.getWorldDirection(_b);
    for (let i = 0; i < N; i++) {
      _a.set(T[i * 3] - cam.position.x, T[i * 3 + 1] - cam.position.y, T[i * 3 + 2] - cam.position.z);
      const along = _a.dot(_b);
      if (along < -4 || along > 170) { this._respawnStreak(i, false); }
      P[i * 6] = T[i * 3]; P[i * 6 + 1] = T[i * 3 + 1]; P[i * 6 + 2] = T[i * 3 + 2];
      P[i * 6 + 3] = T[i * 3] - dirV.x * len; P[i * 6 + 4] = T[i * 3 + 1] - dirV.y * len; P[i * 6 + 5] = T[i * 3 + 2] - dirV.z * len;
    }
    this.streakPos.needsUpdate = true;
  }

  // ------------------------------------------------------------------------------------------------------------ frame
  update(dt, game) {
    if (!this.ready) return;
    dt = Math.min(dt, 0.1); this.time += dt;
    const race = game.race, cam = game.camera, q = game.q, pm = this.pm;
    const camPos = cam.position;
    if (!this.lastCamSet) { this.lastCam.copy(camPos); this.lastCamSet = true; }
    if (dt > 0) this.camVel.copy(camPos).sub(this.lastCam).multiplyScalar(1 / dt); this.lastCam.copy(camPos);
    const trailsK = q?.trails ?? 1;
    this.vapour.mesh.visible = this.hot.mesh.visible = trailsK > 0.05;
    for (const d of this.delayed) if (d.t >= 0) { d.t -= dt; if (d.t < 0) { this._firework(d.x, d.y, d.z); d.t = -1; } }
    if (race && dt > 0) {
      const player = game.player;
      for (const s of this.states.values()) this._updateRacer(s, dt, player, camPos, pm, trailsK, game);
      this._missileTrails(race, dt, pm);
      this._drones(race, dt);
      if (player) {
        const f = player.flight;
        const frac = Math.min(1, Math.max(0, (f.speed - 60) / 110)), bo = f.boost?.active ? 1 : 0;
        _c.set(0, 0, -1).applyQuaternion(player.render.quat);
        this._updateStreaks(dt, frac, bo, _c, f.speed);
      } else this.streaks.visible = false;
    }
    // EMP shells
    for (const e of this.emps) if (e.mesh.visible) {
      e.t += dt; const k = e.t / e.life;
      if (k >= 1) { e.mesh.visible = false; continue; }
      e.mesh.scale.setScalar(Math.max(1, e.r * (1 - Math.pow(1 - k, 2.2)))); e.mesh.material.uniforms.uI.value = 1.3 * (1 - k) * (1 - k); e.mesh.material.uniforms.uTime.value = this.time;
    }
    this.bolts.update(dt, camPos, this.time);
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = Math.max(0, this.lightT / 0.45) * this.lightBase * 40; if (this.lightT <= 0) this.light.intensity = 0; }
    for (const sys of [this.smoke, this.expl, this.glow, this.sparks, this.rings, this.stars]) sys.update(dt);
    this.vapour.update(this.time, cam); this.hot.update(this.time, cam);
  }

  _updateRacer(s, dt, player, camPos, pm, trailsK, game) {
    const r = s.racer, m = r.model; if (!m || !r.render) return;
    const ud = m.userData, f = r.flight, pos = r.render.pos, quat = r.render.quat;
    const distCam = pos.distanceTo(camPos), near = distCam < 450;
    const isP = r === player;
    const boost = f.boost?.active ? 1 : 0; s.boostSm += (boost - s.boostSm) * (1 - Math.exp(-8 * dt));
    s.glow = Math.max(0, s.glow - dt);
    // teleport / respawn detection: break ribbons
    if (s.has && pos.distanceToSquared(s.lastPos) > 60 * 60) this._cut(s);
    s.lastPos.copy(pos); s.has = true;
    // wing-tip vapour: always faintly visible, strong in hard turns, boosts and stunts
    const g = Math.abs(f.gLoad || 1), inten = Math.min(1, 0.22 + Math.max(0, g - 1.6) * 0.32 + s.boostSm * 0.55 + (s.glow > 0 ? 0.7 : 0) + (r.tumble > 0 ? 0.4 : 0));
    const speedK = Math.min(1, Math.max(0.25, (f.speed - 30) / 70));
    const tips = ud?.wingTips;
    if (tips) for (let i = 0; i < 2; i++) {
      const id = s.tipV[i]; if (id < 0) continue;
      _a.copy(tips[i]).applyQuaternion(quat).add(pos); this.vapour.push(id, _a.x, _a.y, _a.z, this.time);
      this.vapour.gain[id] = inten * speedK * (near ? 1 : 0.7);
      this.vapour.width[id] = 0.12 + 0.12 * inten;
      if (s.glow > 0 && s.accent) { const k = Math.min(1, s.glow); this.vapour.tint[id * 4] = 1 + (s.accent.r - 1) * k; this.vapour.tint[id * 4 + 1] = 1 + (s.accent.g - 1) * k; this.vapour.tint[id * 4 + 2] = 1 + (s.accent.b - 1) * k; }
      else if (s.boostSm > 0.05) { this.vapour.tint[id * 4] = 1 - 0.35 * s.boostSm; this.vapour.tint[id * 4 + 1] = 1 - 0.1 * s.boostSm; this.vapour.tint[id * 4 + 2] = 1; }
      else { this.vapour.tint[id * 4] = this.vapour.tint[id * 4 + 1] = this.vapour.tint[id * 4 + 2] = 1; }
    }
    // hot boost ribbons from the exhausts
    const ex = ud?.exhausts;
    if (ex) for (let i = 0; i < s.nEx; i++) {
      const id = s.tipH[i]; if (id < 0) continue;
      _a.copy(ex[i]).applyQuaternion(quat).add(pos); this.hot.push(id, _a.x, _a.y, _a.z, this.time);
      this.hot.gain[id] = s.boostSm * 0.85; this.hot.width[id] = 0.45 + 0.25 * s.boostSm;
    }
    if (!near || !ex) return;
    // exhaust glow + particles
    const thr = f.throttle ?? 0.7, info = ud.exhaustInfo;
    for (let i = 0; i < ex.length; i++) {
      _a.copy(ex[i]).applyQuaternion(quat).add(pos);
      const kind = info?.[i]?.kind, rad = info?.[i]?.radius || 0.3;
      _b.set(0, 0, 1).applyQuaternion(quat);
      if (kind === 'flame') {
        const sz = (0.9 + thr * 0.5 + s.boostSm * 1.6) * rad * 2.0;
        this.glow.emit(_a.x + _b.x * rad * 2, _a.y + _b.y * rad * 2, _a.z + _b.z * rad * 2, 0, 0, 0, dt * 1.6, sz, sz, 0.7 + s.boostSm * 0.2, 0.4 + s.boostSm * 0.25, 0.22 + s.boostSm * 0.6, 0.45 + 0.2 * s.boostSm, 1, 0.5, 0.3, 0.5);
        s.exAcc += dt * (30 + 90 * s.boostSm) * pm;
        while (s.exAcc >= 1) { s.exAcc -= 1; this.sparks.emit(_a.x + (rnd() - 0.5) * rad, _a.y + (rnd() - 0.5) * rad, _a.z + (rnd() - 0.5) * rad, _b.x * (14 + rnd() * 20) + f.vel.x * 0.9, _b.y * (14 + rnd() * 20) + f.vel.y * 0.9, _b.z * (14 + rnd() * 20) + f.vel.z * 0.9, 0.25 + rnd() * 0.25, rad * 1.4, rad * 0.3, s.boostSm > 0.3 ? 0.6 : 1.4, s.boostSm > 0.3 ? 1.2 : 0.8, s.boostSm > 0.3 ? 2.4 : 0.35, 0.9, 0.4, 0.25, 0.9, 0, 0, 0.5); }
      } else {
        // propeller engines: grey exhaust puffs; faint blue when boosting
        s.exAcc += dt * (10 + 14 * thr + s.boostSm * 20) * pm / Math.max(1, ex.length * 0.7);
        while (s.exAcc >= 1) { s.exAcc -= 1; this.smoke.emit(_a.x, _a.y, _a.z, f.vel.x * 0.92 + (rnd() - 0.5) * 2, f.vel.y * 0.92 + (rnd() - 0.5) * 2 + 1, f.vel.z * 0.92 + (rnd() - 0.5) * 2, 0.5 + rnd() * 0.4, 0.4, 1.6, 0.85, 0.85, 0.9, 0.22 + s.boostSm * 0.12, 0.9, 0.9, 1, 0, 0, 1.1, Math.floor(rnd() * 16), 0, rnd() * 6, 0.5); }
        if (s.boostSm > 0.2) this.glow.emit(_a.x, _a.y, _a.z, 0, 0, 0, dt * 1.5, 2.4 * rad * 4, 2.4 * rad * 4, 0.4, 0.8, 1.6, 0.6 * s.boostSm, 0.4, 0.8, 1.6, 0.2);
      }
    }
    // damage: smoke + sparks while tumbling
    if (s.damage || r.tumble > 0) {
      s.dmgAcc += dt * 55 * pm;
      while (s.dmgAcc >= 1) {
        s.dmgAcc -= 1; _a.set((rnd() - 0.5) * 2, (rnd() - 0.5) * 1.2, (rnd() - 0.2) * 3).applyQuaternion(quat).add(pos);
        const sh = 0.08 + rnd() * 0.12;
        this.smoke.emit(_a.x, _a.y, _a.z, f.vel.x * 0.7 + (rnd() - 0.5) * 5, f.vel.y * 0.7 + 2 + rnd() * 3, f.vel.z * 0.7 + (rnd() - 0.5) * 5, 1.2 + rnd() * 0.9, 1.6, 6, sh, sh, sh, 0.8, sh * 1.5, sh * 1.4, sh * 1.3, 0, 0, 0.9, Math.floor(rnd() * 16), 0, rnd() * 6, (rnd() - 0.5));
        if (rnd() < 0.3) this.sparks.emit(_a.x, _a.y, _a.z, f.vel.x * 0.6 + (rnd() - 0.5) * 30, f.vel.y * 0.6 + (rnd() - 0.2) * 30, f.vel.z * 0.6 + (rnd() - 0.5) * 30, 0.5, 1.2, 0.1, 2.4, 1.2, 0.4, 1, 1, 0.3, 0.1, 0, 14, 1);
        if (rnd() < 0.2) this.glow.emit(_a.x, _a.y, _a.z, f.vel.x * 0.7, f.vel.y * 0.7, f.vel.z * 0.7, 0.35, 3, 5, 1.6, 0.6, 0.15, 0.8, 1, 0.3, 0.05, 0);
      }
    }
    // low-altitude dust / water spray
    const course = game.course;
    if (course?.groundHeight && f.speed > 40) {
      const gy = course.groundHeight(pos.x, pos.z), h = pos.y - gy;
      if (h < 26 && h > -2) {
        const k = 1 - Math.max(0, h) / 26;
        s.sprayAcc += dt * 70 * k * k * pm;
        const env = course.environment, fc = env?.fogColor, sandy = env && !env.night;
        const cr = fc ? 0.55 + fc.r * 0.45 : 0.9, cg = fc ? 0.55 + fc.g * 0.45 : 0.9, cb = fc ? 0.55 + fc.b * 0.45 : 0.9;
        while (s.sprayAcc >= 1) {
          s.sprayAcc -= 1; const sp = (rnd() - 0.5) * 12;
          _b.copy(f.vel).multiplyScalar(0.25);
          this.smoke.emit(pos.x + (rnd() - 0.5) * 6, gy + 0.6, pos.z + (rnd() - 0.5) * 6, _b.x + sp, 2 + rnd() * 5 * k, _b.z + sp, 0.9 + rnd() * 0.7, 2 + 2 * k, 9 + 6 * k, cr, cg, cb, 0.42 * k + 0.05, cr, cg, cb, 0, -1, 1.2, Math.floor(rnd() * 16), 0, rnd() * 6, (rnd() - 0.5) * 0.6);
        }
        void sandy;
      }
    }
    // shield bubble
    if (s.shield) {
      const on = r.shield > 0 && s.shield.visible !== false || s.shieldAnim > 0;
      if (s.shieldAnim !== 0) { s.shieldAnim = Math.sign(s.shieldAnim) * Math.max(0, Math.abs(s.shieldAnim) - dt * 2.5); }
      s.shield.visible = r.shield > 0 || s.shieldAnim !== 0 || s.shieldPulse > 0;
      if (s.shield.visible) {
        s.shield.position.copy(pos); s.shield.quaternion.copy(quat);
        const rad = (ud?.radius || 6) * 0.95, grow = s.shieldAnim > 0 ? 1.6 - 0.6 * (1 - s.shieldAnim) : s.shieldAnim < 0 ? 1 + 0.5 * (1 + s.shieldAnim) : 1;
        s.shield.scale.setScalar(rad * grow);
        const u = s.shield.material.uniforms; u.uTime.value = this.time; s.shieldPulse = Math.max(0, s.shieldPulse - dt * 3); u.uPulse.value = s.shieldPulse;
        const warn = r.shield > 0 && r.shield < 2.2 ? (Math.sin(this.time * 24) > 0 ? 0.35 : 1) : 1;
        u.uI.value = (0.55 + (s.shieldAnim > 0 ? 1.2 * s.shieldAnim : 0)) * warn * (s.shieldAnim < 0 ? 1 + s.shieldAnim : 1);
      }
      void on;
    }
  }

  _missileTrails(race, dt, pm) {
    const items = race.items; if (!items?.missiles) return;
    for (const m of items.missiles) {
      if (m.dead || !m.pos) continue;
      let t = this.trailMissiles.get(m.id); if (t === undefined) { t = { acc: 0 }; this.trailMissiles.set(m.id, t); }
      t.acc += dt * 170 * pm;
      while (t.acc >= 1) {
        t.acc -= 1; const jx = (rnd() - 0.5) * 0.6, jy = (rnd() - 0.5) * 0.6, jz = (rnd() - 0.5) * 0.6;
        this.smoke.emit(m.pos.x + jx, m.pos.y + jy, m.pos.z + jz, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2 + 0.5, (rnd() - 0.5) * 2, 1.6 + rnd() * 0.7, 1.8, 6.5, 0.95, 0.95, 0.98, 0.6, 0.82, 0.82, 0.88, 0, 0, 1.4, Math.floor(rnd() * 16), 0, rnd() * 6, (rnd() - 0.5));
        this.glow.emit(m.pos.x, m.pos.y, m.pos.z, 0, 0, 0, 0.16, 2.6, 1.0, 1.4, 0.8, 0.35, 0.9, 1, 0.35, 0.1, 0);
      }
    }
    if (this.trailMissiles.size > 64) { const alive = new Set(); for (const m of items.missiles) alive.add(m.id); for (const k of this.trailMissiles.keys()) if (!alive.has(k)) this.trailMissiles.delete(k); }
  }
  _drones(race, dt) {
    const dr = race.items?.drones; if (!dr) return;
    for (const d of dr) { if (!d.pos) continue; if (rnd() < dt * 40) this.glow.emit(d.pos.x, d.pos.y, d.pos.z, 0, 0, 0, 0.3, 1.8, 0.5, 0.4, 1.4, 0.8, 0.9, 0.2, 0.7, 0.4, 0); }
  }

  dispose() {
    for (const off of this.offs) off(); this.offs.length = 0;
    for (const r of [...this.states.keys()]) this.detachRacer(r);
    if (!this.ready) return;
    for (const sys of [this.smoke, this.expl, this.glow, this.sparks, this.rings, this.stars, this.vapour, this.hot]) sys.dispose();
    this.bolts.dispose(); for (const e of this.emps) e.mesh.material.dispose();
    this.streaks.geometry.dispose(); this.streakMat.dispose(); this.shieldGeo.dispose();
    this.game.scene.remove(this.group, this.light); this.ready = false;
  }
}
