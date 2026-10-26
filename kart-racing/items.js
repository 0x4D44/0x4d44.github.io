// Apex Karts - item boxes, projectiles, hazards and item effects (owner: C).
// ItemSystem polls kart.input.useItem itself (and clears it); calling useItem(kart) directly on the
// same edge is harmless (de-duplicated within DEDUPE_S).
import * as THREE from "three";
import { ITEMS, ITEM_IDS, makeRng, clamp } from "./roster.js";

// ---- tuning -------------------------------------------------------------------------------
const BOX_RESPAWN = 4.0;        // s a box stays gone
const BOX_PICK_R = 2.4;         // m
const ROLL_TIME = 1.2;          // s slot-machine delay
const SHIELD_TIME = 8.0;
const BOOST_TIME = 1.7;
const TRIPLE_BOOST_TIME = 1.35;
const BANANA_R = 1.6;
const BANANA_ARM = 0.7;         // owner immune this long
const MAX_BANANAS = 24;
const GREEN_SPEED = 62;
const GREEN_LIFE = 6.0;
const GREEN_BOUNCES = 3;
const HOMING_SPEED = 58;
const HOMING_LIFE = 14.0;
const HOMING_TURN = 4.2;        // rad/s
const SHELL_HIT_R = 1.0;        // added to kart.radius
const SPIN_SHELL = 1.6;
const SPIN_BANANA = 1.3;
const SPIN_SHOCK = 1.9;
const DEDUPE_S = 0.15;
const TRAIL_N = 200;

function makeCanvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ItemSystem {
  constructor({ scene, track, karts, effects, audio, rng }) {
    this.scene = scene;
    this.track = track;
    this.karts = karts;
    this.effects = effects;
    this.audio = audio;
    this.rng = rng || makeRng(7);
    this.hazards = [];       // {type:"banana", position, owner, age, mesh}
    this.projectiles = [];   // {type:"green"|"homing", position, owner, target, ...}
    this.time = 0;
    this._rolls = new Map();       // kart -> {t, dur}
    this._lastUse = new Map();     // kart -> time
    this._bubbles = new Map();     // kart -> {mesh, mat}
    this._listeners = {};
    this._rings = [];
    this._trailHead = 0;
    this._disposables = [];
    this.root = new THREE.Group();
    this.root.name = "items";
    scene.add(this.root);
    this._buildShared();
    this._buildBoxes();
  }

  // ---- events (contract addition): "pickup"(kart,item) "use"(kart,item) "hit"(kart,source) "shock"(kart) "block"(kart)
  on(name, fn) { (this._listeners[name] ||= []).push(fn); return this; }
  _emit(name, a, b) { const l = this._listeners[name]; if (l) for (const f of l) f(a, b); }

  _track(o) { this._disposables.push(o); return o; }

  // ---- shared resources -------------------------------------------------------------------
  _buildShared() {
    const qmark = this._track(makeCanvasTexture(128, (g, s) => {
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, s, s);
      g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8);
      g.font = "900 96px Arial Black, Impact, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 10; g.strokeStyle = "#ffffff"; g.strokeText("?", s / 2, s / 2 + 6);
      g.fillStyle = "#1c2340"; g.fillText("?", s / 2, s / 2 + 6);
    }));
    const glowTex = this._track(makeCanvasTexture(64, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
      gr.addColorStop(0, "rgba(255,255,255,0.95)");
      gr.addColorStop(0.35, "rgba(255,230,140,0.35)");
      gr.addColorStop(1, "rgba(255,200,80,0)");
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }));
    this.boxGeo = this._track(new THREE.BoxGeometry(2.0, 2.0, 2.0));
    this.boxMat = this._track(new THREE.MeshBasicMaterial({ map: qmark, transparent: true, opacity: 0.93 }));
    this.glowMat = this._track(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));

    // banana: curved body + tip
    this.bananaGeo = this._track(new THREE.TorusGeometry(0.55, 0.17, 8, 14, Math.PI * 1.05));
    this.bananaMat = this._track(new THREE.MeshLambertMaterial({ color: 0xffd60a, emissive: 0x553d00 }));
    this.bananaTipGeo = this._track(new THREE.SphereGeometry(0.13, 6, 5));
    this.bananaTipMat = this._track(new THREE.MeshLambertMaterial({ color: 0x4a2c0a }));

    // shells
    this.shellGeo = this._track(new THREE.SphereGeometry(0.62, 14, 10));
    this.ringGeo = this._track(new THREE.TorusGeometry(0.64, 0.09, 6, 16));
    this.greenMat = this._track(new THREE.MeshLambertMaterial({ color: 0x22c55e, emissive: 0x0a4a1a }));
    this.redMat = this._track(new THREE.MeshLambertMaterial({ color: 0xef2d3a, emissive: 0x5a0a10 }));
    this.whiteMat = this._track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.finGeo = this._track(new THREE.ConeGeometry(0.2, 0.55, 6));

    // shield bubble
    this.bubbleGeo = this._track(new THREE.SphereGeometry(2.1, 20, 14));

    // shock ring
    this.shockGeo = this._track(new THREE.RingGeometry(0.88, 1, 48));

    // trail particles
    const dot = this._track(makeCanvasTexture(32, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }));
    const geo = this._track(new THREE.BufferGeometry());
    this._tPos = new Float32Array(TRAIL_N * 3);
    this._tCol = new Float32Array(TRAIL_N * 3);
    this._tBase = new Float32Array(TRAIL_N * 3);
    this._tLife = new Float32Array(TRAIL_N);
    for (let i = 0; i < TRAIL_N; i++) this._tPos[i * 3 + 1] = -1000;
    geo.setAttribute("position", new THREE.BufferAttribute(this._tPos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this._tCol, 3));
    const mat = this._track(new THREE.PointsMaterial({
      size: 1.1, map: dot, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, sizeAttenuation: true,
    }));
    this.trail = new THREE.Points(geo, mat);
    this.trail.frustumCulled = false;
    this.root.add(this.trail);
  }

  _buildBoxes() {
    const list = this.track.itemBoxes || [];
    this.boxes = list.map((b, i) => ({
      x: b.pos.x, y: b.pos.y ?? 1.25, z: b.pos.z, active: true, timer: 0, i, s: b.s,
    }));
    const n = Math.max(1, this.boxes.length);
    this.boxMesh = new THREE.InstancedMesh(this.boxGeo, this.boxMat, n);
    this.boxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.boxMesh.frustumCulled = false;
    this.boxMesh.count = this.boxes.length;
    for (let i = 0; i < this.boxes.length; i++) this.boxMesh.setColorAt(i, new THREE.Color().setHSL(i / n, 1, 0.6));
    this.root.add(this.boxMesh);
    this.glows = this.boxes.map((b) => {
      const sp = new THREE.Sprite(this.glowMat);
      sp.scale.set(3.6, 3.6, 1);
      sp.position.set(b.x, b.y, b.z);
      this.root.add(sp);
      return sp;
    });
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._sc = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  // ---- public API -----------------------------------------------------------------------------
  isRolling(kart) { return this._rolls.has(kart); }
  rollProgress(kart) { const r = this._rolls.get(kart); return r ? clamp(r.t / r.dur, 0, 1) : 0; }

  rollItem(kart, race) {
    const place = (kart.race && kart.race.place) || (race && race.place && race.place(kart)) || 4;
    const band = place <= 2 ? 0 : place <= 5 ? 1 : 2;
    let total = 0;
    for (const id of ITEM_IDS) total += ITEMS[id].weights[band];
    let r = this.rng() * total;
    for (const id of ITEM_IDS) {
      r -= ITEMS[id].weights[band];
      if (r < 0 && ITEMS[id].weights[band] > 0) return id;
    }
    return "boost";
  }

  reset() {
    for (const h of this.hazards) this._removeMesh(h.mesh);
    for (const p of this.projectiles) this._removeMesh(p.mesh);
    this.hazards.length = 0;
    this.projectiles.length = 0;
    for (const r of this._rings) { r.mesh.parent && r.mesh.parent.remove(r.mesh); r.mesh.material.dispose(); }
    this._rings.length = 0;
    this._rolls.clear();
    this._lastUse.clear();
    for (const b of this.boxes) { b.active = true; b.timer = 0; }
    for (const k of this.karts) { k.item = null; k.itemCount = 0; k.shield = 0; }
    this._tLife.fill(0);
    for (let i = 0; i < TRAIL_N; i++) this._tPos[i * 3 + 1] = -1000;
    this._tCol.fill(0);
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;
    for (const { mesh } of this._bubbles.values()) mesh.visible = false;
  }

  dispose() {
    this.reset();
    for (const { mesh, mat } of this._bubbles.values()) { mesh.parent && mesh.parent.remove(mesh); mat.dispose(); }
    this._bubbles.clear();
    this.scene.remove(this.root);
    this.boxMesh.dispose();
    for (const o of this._disposables) o.dispose && o.dispose();
    this._disposables.length = 0;
  }

  // ---- per-frame --------------------------------------------------------------------------------
  update(dt, time, race) {
    this.time += dt;
    const t = this.time;
    // consume use-item edges (before anything else so the effect is immediate)
    for (const k of this.karts) {
      const inp = k.input;
      if (inp && inp.useItem) { inp.useItem = false; this.useItem(k); }
    }
    this._updateBoxes(dt, t);
    this._updateRolls(dt, race);
    this._updateHazards(dt);
    this._updateProjectiles(dt);
    this._updateBubbles(dt, t);
    this._updateRings(dt);
    this._updateTrail(dt);
  }

  _updateBoxes(dt, t) {
    const karts = this.karts, boxes = this.boxes, m = this._m;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!b.active) {
        b.timer -= dt;
        if (b.timer <= 0) { b.active = true; }
      }
      if (b.active) {
        for (let j = 0; j < karts.length; j++) {
          const k = karts[j];
          if (k.item || k.race?.finished || this._rolls.has(k)) continue;
          const dx = k.position.x - b.x, dz = k.position.z - b.z;
          if (dx * dx + dz * dz < BOX_PICK_R * BOX_PICK_R && Math.abs(k.position.y - b.y) < 4) {
            b.active = false; b.timer = BOX_RESPAWN;
            this._rolls.set(k, { t: 0, dur: ROLL_TIME });
            this._p.set(b.x, b.y, b.z);
            this.effects?.burst?.(this._p, "pickup", { color: 0xffe14d });
            this.audio?.play?.("item-get", { kart: k });
            this._emit("pickup", k);
            break;
          }
        }
      }
      // visuals: pop in after respawn
      b.sc = b.active ? Math.min(1, (b.sc ?? 0) + dt * 4) : 0;
      const sc = Math.max(0.0001, b.sc);
      const y = b.y + Math.sin(t * 2.2 + i) * 0.25;
      this._e.set(t * 0.9 + i, t * 1.3, 0.35);
      this._q.setFromEuler(this._e);
      this._sc.setScalar(sc);
      m.compose(this._p.set(b.x, y, b.z), this._q, this._sc);
      this.boxMesh.setMatrixAt(i, m);
      this._c.setHSL((t * 0.35 + i * 0.11) % 1, 1, 0.55);
      this.boxMesh.setColorAt(i, this._c);
      const g = this.glows[i];
      g.visible = b.active;
      g.position.y = y;
      g.scale.setScalar((3.3 + Math.sin(t * 4 + i) * 0.4) * sc);
    }
    this.boxMesh.instanceMatrix.needsUpdate = true;
    if (this.boxMesh.instanceColor) this.boxMesh.instanceColor.needsUpdate = true;
  }

  _updateRolls(dt, race) {
    for (const [k, r] of this._rolls) {
      r.t += dt;
      if (r.t >= r.dur) {
        this._rolls.delete(k);
        const id = this.rollItem(k, race);
        k.item = id;
        k.itemCount = id === "triple" ? 3 : 1;
        this._emit("rolled", k, id);
      }
    }
  }

  // ---- using items ------------------------------------------------------------------------------
  useItem(kart) {
    const id = kart.item;
    if (!id || this._rolls.has(kart)) return false;
    const last = this._lastUse.get(kart);
    if (last !== undefined && this.time - last < DEDUPE_S && this.time >= last) return false;
    this._lastUse.set(kart, this.time);

    const back = !!(kart.input && kart.input.lookBack);
    switch (id) {
      case "boost": kart.boost?.(1, BOOST_TIME); this.audio?.play?.("boost", { kart }); this._flame(kart); break;
      case "triple": kart.boost?.(1, TRIPLE_BOOST_TIME); this.audio?.play?.("boost", { kart }); this._flame(kart); break;
      case "banana": this._dropBanana(kart); break;
      case "green": this._fireGreen(kart, back); break;
      case "homing": this._fireHoming(kart); break;
      case "shield": kart.addShield?.(SHIELD_TIME); this.audio?.play?.("shield", { kart }); break;
      case "shock": this._shock(kart); break;
      default: return false;
    }
    kart.itemCount = Math.max(0, (kart.itemCount || 1) - 1);
    if (kart.itemCount <= 0) { kart.item = null; kart.itemCount = 0; }
    this._emit("use", kart, id);
    return true;
  }

  // road surface height under (pos.x, pos.z), using the owner's s as hint so bridges resolve correctly
  _roadY(pos, hintS, lift) {
    const loc = this.track.locate(pos, hintS);
    return (loc && loc.y != null ? loc.y : 0) + lift;
  }

  _flame(kart) {
    this._p.set(kart.position.x, kart.position.y + 0.6, kart.position.z);
    this.effects?.burst?.(this._p, "boost", { kart, heading: kart.heading });
  }

  _dropBanana(kart) {
    const fx = Math.sin(kart.heading), fz = Math.cos(kart.heading);
    const d = (kart.radius || 1.3) + 1.5;
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(this.bananaGeo, this.bananaMat);
    body.rotation.set(Math.PI / 2, 0, 0);
    body.position.y = 0.2;
    mesh.add(body);
    const tip = new THREE.Mesh(this.bananaTipGeo, this.bananaTipMat);
    tip.position.set(0.55, 0.2, 0);
    mesh.add(tip);
    mesh.position.set(kart.position.x - fx * d, kart.position.y + 0.12, kart.position.z - fz * d);
    mesh.position.y = this._roadY(mesh.position, kart.s, 0.12);
    mesh.rotation.y = this.rng() * 6.28;
    this.root.add(mesh);
    if (this.hazards.length >= MAX_BANANAS) { const old = this.hazards.shift(); this._removeMesh(old.mesh); }
    this.hazards.push({ type: "banana", position: mesh.position, owner: kart, age: 0, mesh });
    this.audio?.play?.("banana", { kart });
    this.audio?.play?.("throw", { kart });
  }

  _makeShell(type) {
    const g = new THREE.Group();
    const mat = type === "green" ? this.greenMat : this.redMat;
    g.add(new THREE.Mesh(this.shellGeo, mat));
    const ring = new THREE.Mesh(this.ringGeo, this.whiteMat);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    if (type === "homing") {
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(this.finGeo, this.whiteMat);
        const a = (i / 4) * Math.PI * 2;
        f.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
        f.rotation.set(Math.sin(a) * 1.5708, 0, -Math.cos(a) * 1.5708);
        g.add(f);
      }
    }
    return g;
  }

  _fireGreen(kart, back) {
    const dir = back ? Math.PI : 0;
    const h = kart.heading + dir;
    const fx = Math.sin(h), fz = Math.cos(h);
    const mesh = this._makeShell("green");
    const d = (kart.radius || 1.3) + 1.4;
    mesh.position.set(kart.position.x + fx * d, kart.position.y + 0.7, kart.position.z + fz * d);
    this.root.add(mesh);
    this.projectiles.push({
      type: "green", mesh, position: mesh.position, owner: kart, age: 0, bounces: 0, s: undefined,
      vx: fx * GREEN_SPEED, vz: fz * GREEN_SPEED, target: null, heading: h, color: [0.2, 1, 0.35],
    });
    this.audio?.play?.("throw", { kart });
  }

  _fireHoming(kart) {
    const target = this._targetAhead(kart);
    const fx = Math.sin(kart.heading), fz = Math.cos(kart.heading);
    const mesh = this._makeShell("homing");
    const d = (kart.radius || 1.3) + 1.4;
    mesh.position.set(kart.position.x + fx * d, kart.position.y + 0.7, kart.position.z + fz * d);
    this.root.add(mesh);
    this.projectiles.push({
      type: "homing", mesh, position: mesh.position, owner: kart, age: 0, bounces: 0, s: undefined,
      vx: fx * HOMING_SPEED, vz: fz * HOMING_SPEED, target, heading: kart.heading, color: [1, 0.25, 0.2],
    });
    this.audio?.play?.("throw", { kart });
  }

  // kart directly ahead in race order (place-1); fall back to nearest ahead by progress
  _targetAhead(kart) {
    const my = kart.race?.place;
    let best = null;
    if (my && my > 1) {
      for (const k of this.karts) if (k !== kart && k.race?.place === my - 1) { best = k; break; }
    }
    if (!best) {
      const mp = kart.race?.progress ?? 0;
      let bd = Infinity;
      for (const k of this.karts) {
        if (k === kart || k.race?.finished) continue;
        const d = (k.race?.progress ?? 0) - mp;
        if (d > 0 && d < bd) { bd = d; best = k; }
      }
    }
    return best;
  }

  _shock(kart) {
    const myPlace = kart.race?.place ?? 99;
    this._p.set(kart.position.x, kart.position.y + 1, kart.position.z);
    this.effects?.burst?.(this._p, "shock", { kart });
    this.audio?.play?.("shock", { kart });
    this._spawnRing(kart.position.x, kart.position.z, kart.position.y);
    for (const k of this.karts) {
      if (k === kart) continue;
      const ahead = (k.race?.place ?? 0) < myPlace;
      if (ahead) this._hit(k, "shock", SPIN_SHOCK);
    }
    this._emit("shock", kart);
  }

  _spawnRing(x, z, y = 0) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9fe8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.shockGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.5, z);
    mesh.scale.setScalar(1);
    this.root.add(mesh);
    this._rings.push({ mesh, age: 0 });
  }

  _updateRings(dt) {
    for (let i = this._rings.length - 1; i >= 0; i--) {
      const r = this._rings[i];
      r.age += dt;
      const u = r.age / 0.8;
      if (u >= 1) {
        this.root.remove(r.mesh); r.mesh.material.dispose(); this._rings.splice(i, 1); continue;
      }
      r.mesh.scale.setScalar(2 + u * 90);
      r.mesh.material.opacity = 0.85 * (1 - u);
    }
  }

  // Returns true if the kart was actually spun (false when shielded / already spinning)
  _hit(kart, source, spin) {
    if (kart.shield > 0) {
      kart.shield = 0;
      this._p.set(kart.position.x, kart.position.y + 1, kart.position.z);
      this.effects?.burst?.(this._p, "shieldpop", { kart });
      this.audio?.play?.("shield", { kart, pop: true });
      this._emit("block", kart, source);
      return false;
    }
    if (kart.spinTime > 0.2) return false;
    kart.spinOut?.(spin);
    this._p.set(kart.position.x, kart.position.y + 1, kart.position.z);
    this.effects?.burst?.(this._p, "hit", { kart });
    this.audio?.play?.(source === "banana" ? "banana" : "hit", { kart });
    this._emit("hit", kart, source);
    return true;
  }

  _updateHazards(dt) {
    const karts = this.karts;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.age += dt;
      h.mesh.rotation.y += dt * 0.4;
      const hp = h.position;
      for (let j = 0; j < karts.length; j++) {
        const k = karts[j];
        if (k === h.owner && h.age < BANANA_ARM) continue;
        const dx = k.position.x - hp.x, dz = k.position.z - hp.z;
        const r = BANANA_R + (k.radius || 1.3) * 0.4;
        if (dx * dx + dz * dz < r * r && Math.abs(k.position.y - hp.y) < 2.5) {
          if (k.spinTime > 0.2 && !(k.shield > 0)) continue;
          this._hit(k, "banana", SPIN_BANANA);
          this._removeMesh(h.mesh);
          this.hazards.splice(i, 1);
          break;
        }
      }
    }
  }

  _updateProjectiles(dt) {
    const tr = this.track;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      let dead = false;
      if (p.type === "green") dead = this._stepGreen(p, dt);
      else dead = this._stepHoming(p, dt);
      p.mesh.rotation.y += dt * 10;
      // trail
      p._tt = (p._tt || 0) - dt;
      if (p._tt <= 0) { p._tt = 0.025; this._emitTrail(p.position.x, p.position.y, p.position.z, p.color); }
      // collisions
      if (!dead) {
        for (const k of this.karts) {
          if (k === p.owner && p.age < 0.35) continue;
          const dx = k.position.x - p.position.x, dz = k.position.z - p.position.z;
          const r = (k.radius || 1.3) + SHELL_HIT_R;
          if (dx * dx + dz * dz < r * r && Math.abs(k.position.y - p.position.y) < 2.5) {
            this._hit(k, p.type, SPIN_SHELL);
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        this._p.copy(p.position);
        this.effects?.burst?.(this._p, "hit", { small: true });
        this._removeMesh(p.mesh);
        this.projectiles.splice(i, 1);
      }
      void tr;
    }
  }

  _stepGreen(p, dt) {
    const tr = this.track;
    p.position.x += p.vx * dt;
    p.position.z += p.vz * dt;
    if (p.age > GREEN_LIFE) return true;
    const loc = tr.locate(p.position, p.s);
    p.s = loc.s;
    if (loc.y != null) p.position.y = loc.y + 0.7;
    const lim = loc.wallDist - 0.7;
    if (Math.abs(loc.lateral) > lim) {
      const smp = tr.sample(loc.s);
      const rx = smp.right.x, rz = smp.right.z;
      const sg = loc.lateral > 0 ? 1 : -1;
      // inward normal
      const nx = -sg * rx, nz = -sg * rz;
      const vn = p.vx * nx + p.vz * nz;
      if (vn < 0) {
        p.vx -= 2 * vn * nx; p.vz -= 2 * vn * nz;
        const over = Math.abs(loc.lateral) - lim;
        p.position.x += nx * (over + 0.1);
        p.position.z += nz * (over + 0.1);
        p.bounces++;
        this._p.copy(p.position);
        this.effects?.burst?.(this._p, "spark", { small: true });
        if (p.bounces > GREEN_BOUNCES) return true;
      }
    }
    return false;
  }

  _stepHoming(p, dt) {
    const tr = this.track;
    if (p.age > HOMING_LIFE) return true;
    const loc = tr.locate(p.position, p.s);
    p.s = loc.s;
    if (loc.y != null) p.position.y = loc.y + 0.7;
    let tx, tz;
    const t = p.target;
    let direct = false;
    if (t && !t.race?.finished) {
      const dx = t.position.x - p.position.x, dz = t.position.z - p.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 38 * 38) { direct = true; tx = t.position.x; tz = t.position.z; }
    }
    if (!direct) {
      const la = 16;
      const s2 = loc.s + la;
      const smp = tr.sample(s2);
      const lat = tr.aiLine ? tr.aiLine(s2) : 0;
      tx = smp.pos.x + smp.right.x * lat;
      tz = smp.pos.z + smp.right.z * lat;
    }
    const want = Math.atan2(tx - p.position.x, tz - p.position.z);
    let diff = want - p.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const turn = direct ? HOMING_TURN * 1.6 : HOMING_TURN;
    p.heading += clamp(diff, -turn * dt, turn * dt);
    p.position.x += Math.sin(p.heading) * HOMING_SPEED * dt;
    p.position.z += Math.cos(p.heading) * HOMING_SPEED * dt;
    // keep inside barriers
    const lim = loc.wallDist - 0.7;
    if (Math.abs(loc.lateral) > lim) {
      const smp = tr.sample(loc.s);
      const sg = loc.lateral > 0 ? 1 : -1;
      const over = Math.abs(loc.lateral) - lim;
      p.position.x -= sg * smp.right.x * over;
      p.position.z -= sg * smp.right.z * over;
    }
    return false;
  }

  // ---- trail --------------------------------------------------------------------------------------
  _emitTrail(x, y, z, c) {
    const i = this._trailHead;
    this._trailHead = (i + 1) % TRAIL_N;
    this._tPos[i * 3] = x; this._tPos[i * 3 + 1] = y; this._tPos[i * 3 + 2] = z;
    this._tBase[i * 3] = c[0]; this._tBase[i * 3 + 1] = c[1]; this._tBase[i * 3 + 2] = c[2];
    this._tLife[i] = 1;
  }

  _updateTrail(dt) {
    const L = this._tLife, C = this._tCol, B = this._tBase, P = this._tPos;
    for (let i = 0; i < TRAIL_N; i++) {
      if (L[i] > 0) {
        L[i] -= dt * 3.2;
        if (L[i] <= 0) { L[i] = 0; P[i * 3 + 1] = -1000; C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = 0; continue; }
        const f = L[i];
        C[i * 3] = B[i * 3] * f; C[i * 3 + 1] = B[i * 3 + 1] * f; C[i * 3 + 2] = B[i * 3 + 2] * f;
      }
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;
  }

  // ---- shield bubbles -----------------------------------------------------------------------------
  _updateBubbles(dt, t) {
    for (const k of this.karts) {
      let b = this._bubbles.get(k);
      const on = k.shield > 0;
      if (!b) {
        if (!on) continue;
        const mat = new THREE.MeshBasicMaterial({
          color: 0x66d4ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending,
          depthWrite: false, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(this.bubbleGeo, mat);
        mesh.position.y = 0.8;
        mesh.renderOrder = 5;
        k.mesh.add(mesh);
        b = { mesh, mat };
        this._bubbles.set(k, b);
      }
      b.mesh.visible = on;
      if (on) {
        const blink = k.shield < 2 ? (Math.sin(t * 22) > 0 ? 1 : 0.25) : 1;
        b.mat.opacity = (0.26 + 0.08 * Math.sin(t * 6)) * blink;
        b.mesh.scale.setScalar(1 + 0.05 * Math.sin(t * 8));
      }
    }
  }

  _removeMesh(m) { if (m && m.parent) m.parent.remove(m); }
}
