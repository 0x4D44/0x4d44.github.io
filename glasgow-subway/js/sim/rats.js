// Rats on the track bed - a little grime for the pit.  Now and then one trots out of a tunnel mouth, stops to sniff about between the rails and bolts
// back into the dark: when a train is announced, when you come close, or simply when it has had enough.
// Cosmetic only, and never anywhere near a train: nothing is let out unless that track's next train is well over twenty seconds off, and every rat on a
// track bolts the moment its train is due.  Station-local frame (the station view's own): own track at x = 0, the hall's tunnel mouths at z = +-27.
import { GeoBuilder } from './gfx.js';

export const RAT = {
  bedY: -0.165,          // feet on the sleepers (rail head is y = 0; sleeper tops -0.16, trackbed -0.18)
  mouthZ: 27.0,          // where the bores open into the hall
  deepZ: 31.4,           // far enough inside the bore to be out of sight: spawn / vanish here
  platZ: 20,             // never loiter beyond this (the hall's lit part)
  startle: 1.9,          // a person this close (plan view) sends it bolting
  trainClear: 24,        // seconds of quiet needed before a rat is let out onto a track
  trainBolt: 14,         // ...and the timer below which everything on that track bolts
  trot: 1.0, bolt: 2.8,  // m/s: a brown rat potters about at around 1 m/s and sprints at 2.5-3 (these were 2.5 and 4.6: 16 km/h, legs a blur)
  accelUp: 9, accelDown: 14,   // m/s^2 at most: a rat is quick off the mark, not instant
  maxLive: 3,
  K: 1.0,                // overall scale (a big brown rat: ~0.30 m head-and-body, ~0.20 m tail - a little large, so it reads from the platform)
};

// z, half-width, half-height, centre height of the body rings, tail-end to nose
const RINGS = [
  [-0.120, 0.004, 0.004, 0.034],
  [-0.105, 0.024, 0.026, 0.036],
  [-0.070, 0.036, 0.038, 0.044],
  [-0.020, 0.040, 0.042, 0.048],
  [0.030, 0.037, 0.040, 0.050],
  [0.070, 0.029, 0.034, 0.052],
  [0.100, 0.022, 0.026, 0.049],
  [0.135, 0.012, 0.015, 0.041],
  [0.165, 0.005, 0.006, 0.036],
  [0.176, 0.0015, 0.0015, 0.034],
];
const SIDES = 8, TAIL_SEG = 0.04, TAIL_T = [0.010, 0.0085, 0.007, 0.0055, 0.004];
const BACK = [0.34, 0.25, 0.18], BELLY = [0.60, 0.51, 0.43], NOSE = [0.72, 0.52, 0.50], EAR = [0.74, 0.55, 0.55], SKIN = [0.64, 0.50, 0.47];
const lerp = (a, b, t) => a + (b - a) * t, clamp01 = (t) => Math.max(0, Math.min(1, t));
/** metres covered per full leg cycle at ground speed v: short quick steps when it potters, a long bound when it bolts - about 4 cycles a second at a trot, 7 flat out */
export const strideAt = (v) => 0.15 + 0.09 * Math.max(0, v);
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** the three shared geometries: body (lofted, with ears and eyes), a leg+foot hanging from its hip, and one unit tail segment running back along -z */
export function buildRatGeometry(THREE) {
  const K = RAT.K, B = new GeoBuilder(), starts = [];
  for (const [z, hw, hh, cy] of RINGS) {
    starts.push(B.count);
    for (let j = 0; j < SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      let nx = c / Math.max(hw, 0.004), ny = s / Math.max(hh, 0.004); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const t = clamp01((s + 0.55) / 1.1), k = clamp01((z - 0.115) / 0.05);
      const col = [0, 1, 2].map((m) => lerp(lerp(BELLY[m], BACK[m], t), NOSE[m], k));
      B.vert(c * hw * K, (cy + s * hh) * K, z * K, nx, ny, 0, 0, 0, ...col);
    }
  }
  for (let i = 0; i < RINGS.length - 1; i++) for (let j = 0; j < SIDES; j++) {
    const a = starts[i] + j, b = starts[i] + (j + 1) % SIDES, c = starts[i + 1] + (j + 1) % SIDES, d = starts[i + 1] + j;
    B.tri(a, b, c); B.tri(a, c, d);
  }
  for (const sx of [-1, 1]) {   // ears (double-sided material) and eyes
    B.quad([sx * 0.018 * K, 0.070 * K, 0.078 * K], [sx * 0.038 * K, 0.078 * K, 0.084 * K], [sx * 0.038 * K, 0.100 * K, 0.090 * K], [sx * 0.018 * K, 0.092 * K, 0.092 * K], [0, 0, 1, 1], EAR, sx < 0);
    const ex = sx * 0.0195 * K, ey = 0.058 * K, ez = 0.112 * K, e = 0.0035 * K; B.box(ex - e, ey - e, ez - e, ex + e, ey + e, ez + e, [0.02, 0.02, 0.02], 1);
  }
  const L = new GeoBuilder(); const w = 0.006 * K, h = 0.036 * K;
  L.box(-w, -h, -w * 1.4, w, 0, w * 1.4, SKIN, 1); L.box(-w, -h, -w * 0.6, w, -h + 0.006 * K, 0.020 * K, SKIN, 1);
  const T = new GeoBuilder(); T.box(-0.5, -0.5, -1, 0.5, 0.5, 0, SKIN, 1);
  return { body: B.build(THREE), leg: L.build(THREE), tail: T.build(THREE) };
}

export class Rats {
  constructor(THREE) {
    this.THREE = THREE; this.geo = buildRatGeometry(THREE);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x33251a, side: THREE.DoubleSide });
    this.rats = []; this.view = null; this.group = null; this.tracks = []; this.t = 0; this.gap = 6 + Math.random() * 10; this.onEvent = null;
    this.stats = { spawned: 0, bolted: 0, gone: 0, sniffs: 0 };
  }

  /** bind to a station view (its local frame); any previous view's rats are dropped */
  attach(view) {
    if (this.view === view) return;
    this.detach();
    const inf = view && view.info; if (!inf || !inf.hall) return;
    this.view = view; this.group = new this.THREE.Group(); this.group.name = 'rats'; view.group.add(this.group);
    this.tracks = [{ x: 0, arrive: 1 }];                                                       // own track: trains come in from +z (travel is -z)
    if (inf.otherTrackX != null && isFinite(inf.otherTrackX)) this.tracks.push({ x: inf.otherTrackX, arrive: -1 });   // the other circle's, the other way
    this.gap = Math.min(this.gap, 6 + Math.random() * 10);
  }
  detach() {
    for (const r of this.rats) if (r.root.parent) r.root.parent.remove(r.root);
    this.rats.length = 0; if (this.group && this.group.parent) this.group.parent.remove(this.group);
    this.view = null; this.group = null; this.tracks = [];
  }
  dispose() { this.detach(); this.geo.body.dispose(); this.geo.leg.dispose(); this.geo.tail.dispose(); this.mat.dispose(); }

  _make() {
    const T = this.THREE, K = RAT.K, root = new T.Group(), body = new T.Mesh(this.geo.body, this.mat); root.add(body);
    const legs = [];
    for (const [lx, lz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const p = new T.Group(); p.position.set(lx * 0.034 * K, 0.040 * K, lz * 0.062 * K); p.add(new T.Mesh(this.geo.leg, this.mat)); root.add(p); legs.push(p); }
    const tail = []; let parent = root;
    for (let i = 0; i < TAIL_T.length; i++) {
      const seg = new T.Group(); seg.position.set(0, i ? 0 : 0.032 * K, i ? -TAIL_SEG * K : -0.118 * K);
      const m = new T.Mesh(this.geo.tail, this.mat); m.scale.set(TAIL_T[i] * K, TAIL_T[i] * K, TAIL_SEG * K * 1.03); seg.add(m); parent.add(seg); tail.push(seg); parent = seg;
    }
    return { root, body, legs, tail };
  }

  /** let a rat out (tests and the scheduler): track index, and the tunnel end (+1 / -1) it comes from */
  spawn(trackIdx = 0, end = 1) {
    if (!this.view || !this.tracks[trackIdx]) return null;
    const tr = this.tracks[trackIdx], m = this._make(), r = {
      ...m, track: trackIdx, state: 'run', end, dir: -end, lane: tr.x + (Math.random() - 0.5) * 0.7, x: 0, z: end * RAT.deepZ, y: RAT.bedY,
      speed: 0, goal: end * (8 + Math.random() * 11), age: 0, life: 14 + Math.random() * 22, seed: Math.random() * 100, phase: 0, sniffT: 0, yaw: end > 0 ? Math.PI : 0, pitch: 0,
    };
    r.x = r.lane; r.root.position.set(r.x, r.y, r.z); r.root.rotation.y = r.yaw; this.group.add(r.root); this.rats.push(r); this.stats.spawned++;
    return r;
  }
  /** send one running for a tunnel (reason: 'train' prefers the end the train is NOT coming from) */
  bolt(r, reason = 'scare') {
    if (r.state === 'bolt') return;
    const tr = this.tracks[r.track], away = -tr.arrive;
    let end = r.z >= 0 ? 1 : -1;
    if (reason === 'train' && Math.abs(r.z - tr.arrive * RAT.mouthZ) > 6) end = away;
    if (r.dir !== end) r.speed *= 0.25;      // about-turn: lose most of the speed
    r.state = 'bolt'; r.end = end; r.dir = end; this.stats.bolted++;
    if (this.onEvent) this.onEvent('bolt', r);
  }
  clear() { for (const r of this.rats) if (r.root.parent) r.root.parent.remove(r.root); this.rats.length = 0; }

  /** ctx: { walker: {x,z,y}, own: {state, timer}, other: {state, timer} | null, paused? }.  Safe to call every frame. */
  update(dt, ctx) {
    if (!this.view || !(dt > 0)) return;
    dt = Math.min(dt, 0.1); this.t += dt;
    const trains = [ctx.own, ctx.other], quiet = (i) => { const q = trains[i]; return !!q && q.state === 'wait' && q.timer > RAT.trainClear; };
    // scheduler: a visit every so often, only while some track is quiet and nothing is already out
    if (!this.rats.length) {
      const free = this.tracks.map((_, i) => i).filter(quiet);
      if (free.length) {
        this.gap -= dt;
        if (this.gap <= 0) {
          const ti = free[(Math.random() * free.length) | 0], end = Math.random() < 0.5 ? 1 : -1, n = Math.random() < 0.3 ? 2 : 1;
          this.spawn(ti, end); if (n > 1) { const r2 = this.spawn(ti, end); if (r2) { r2.z += end * (0.5 + Math.random() * 0.9); r2.root.position.z = r2.z; } }
          this.gap = 25 + Math.random() * 45;
        }
      }
    }
    const w = ctx.walker;
    for (let i = this.rats.length - 1; i >= 0; i--) {
      const r = this.rats[i], q = trains[r.track], tr = this.tracks[r.track];
      r.age += dt;
      // threats: its train is announced (or anything other than a long wait), or somebody walks up
      if (r.state !== 'bolt') {
        if (!q || q.state !== 'wait' || q.timer < RAT.trainBolt) this.bolt(r, 'train');
        else if (w && Math.hypot(w.x - r.x, w.z - r.z) < RAT.startle) this.bolt(r, 'scare');
      }
      // intent
      let want = 0;
      if (r.state === 'run') {
        want = RAT.trot * (0.85 + 0.3 * Math.sin(r.age * 3.1 + r.seed));
        if (r.dir * (r.goal - r.z) <= 0) { r.state = 'sniff'; r.sniffT = 1.1 + Math.random() * 2.6; this.stats.sniffs++; }
      } else if (r.state === 'sniff') {
        r.sniffT -= dt;
        if (r.sniffT <= 0) {
          if (r.age > r.life || Math.random() < 0.3) this.bolt(r, 'enough');
          else {   // another dash, now and then back the way it came
            if (Math.random() < 0.25) r.dir = -r.dir;
            r.goal = Math.max(-RAT.platZ, Math.min(RAT.platZ, r.z + r.dir * (2 + Math.random() * 6)));
            if (r.dir * (r.goal - r.z) < 1) { r.dir = -r.dir; r.goal = Math.max(-RAT.platZ, Math.min(RAT.platZ, r.z + r.dir * (2 + Math.random() * 5))); }
            r.state = 'run';
          }
        }
      } else if (r.state === 'bolt') want = RAT.bolt * (0.95 + 0.1 * Math.sin(r.age * 9 + r.seed));
      // motion: quick to start, quicker to stop, but never instant
      { const up = want > r.speed, lim = (up ? RAT.accelUp : RAT.accelDown) * dt, dv = (want - r.speed) * Math.min(1, dt * (up ? 6 : 10)); r.speed += Math.max(-lim, Math.min(lim, dv)); }
      if (want === 0 && r.speed < 0.05) r.speed = 0;
      r.z += r.dir * r.speed * dt;
      const wob = 0.035 * Math.sin(r.age * 5.3 + r.seed), vlat = 0.035 * 5.3 * Math.cos(r.age * 5.3 + r.seed) * Math.min(1, r.speed / 0.8);
      r.x = r.lane + wob * Math.min(1, r.speed / 0.8);
      let yawT = Math.atan2(vlat, r.dir * Math.max(r.speed, 0.4));
      if (r.state === 'sniff') yawT = (r.dir > 0 ? 0 : Math.PI) + 0.7 * Math.sin(r.age * 2.3 + r.seed);      // head swinging about while it sniffs
      r.yaw += wrapPi(yawT - r.yaw) * Math.min(1, dt * (r.state === 'sniff' ? 6 : 14));
      // gait
      const moving = r.speed > 0.15; if (moving) r.phase += (Math.PI * 2 * r.speed * dt) / strideAt(r.speed);
      const amp = Math.min(1.05, 0.45 + 0.25 * r.speed) * Math.min(1, r.speed / 0.4);   // small steps when it potters, long reaches flat out
      r.legs[0].rotation.x = Math.sin(r.phase) * amp; r.legs[3].rotation.x = Math.sin(r.phase) * amp;
      r.legs[1].rotation.x = Math.sin(r.phase + Math.PI) * amp; r.legs[2].rotation.x = Math.sin(r.phase + Math.PI) * amp;
      const sn = r.state === 'sniff' ? 1 : 0, bob = moving ? Math.abs(Math.sin(r.phase)) * 0.007 * Math.min(1, r.speed / 1.0) : 0;
      r.pitch += ((sn ? 0.16 + 0.1 * Math.sin(r.age * 17 + r.seed) : -0.04 * Math.min(1, r.speed / 1.5) + Math.sin(r.phase * 2) * 0.05 * Math.min(1, r.speed / 1.0)) - r.pitch) * Math.min(1, dt * 12);
      r.body.position.y = bob; r.body.rotation.x = r.pitch;
      const tw = moving ? 8 + r.speed * 1.2 : 2.4;
      for (let k = 0; k < r.tail.length; k++) { r.tail[k].rotation.y = (moving ? 0.16 + 0.05 * k : 0.22 + 0.06 * k) * Math.sin(r.age * tw - k * 0.9); r.tail[k].rotation.x = k ? 0.05 : -0.1; }
      r.root.position.set(r.x, r.y, r.z); r.root.rotation.y = r.yaw;
      // out of sight in the bore: gone
      if (r.state === 'bolt' && Math.abs(r.z) >= RAT.deepZ - 0.2 && r.dir * r.z > 0) { this._remove(i); this.stats.gone++; continue; }
      if (r.age > 120) { this._remove(i); this.stats.gone++; }
    }
  }
  _remove(i) { const r = this.rats[i]; if (r.root.parent) r.root.parent.remove(r.root); this.rats.splice(i, 1); }
  state() { return { live: this.rats.length, gap: +this.gap.toFixed(1), ...this.stats, rats: this.rats.map((r) => ({ track: r.track, state: r.state, x: +r.x.toFixed(2), z: +r.z.toFixed(2), speed: +r.speed.toFixed(2), age: +r.age.toFixed(1) })) }; }
}
