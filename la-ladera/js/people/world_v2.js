// The living barrio in the browser: the simulation (sim.js: casting, spots, doors, the day, tiers) plus what needs THREE and the DOM - the instanced rigs and their
// clips, props in hand, seats, the interaction prompts, the dialogue and ctx.people. Logic lives in sim.js / npc.js / brain.js / talk.js.
import { PeopleSim, collectLandmarks } from './sim.js';
import { Talk } from './talk.js';
import { DialogueUI } from './ui.js';
import { CharacterLibrary } from './rig.js';
import { Speech } from './speech.js';
import { holdProp } from './props.js';
import { countLines } from './lines/index.js';

export { collectLandmarks };

const VIEW_MAX = 95;          // beyond this nobody is drawn
const SHADOW_MAX = 42;        // beyond this nobody casts a shadow
const LOD_NEAR = 32, LOD_FAR = 38;   // full-detail mesh inside 32 m, the 1.6k-triangle one beyond 38 m (hysteresis)
const SEAT_TOP = 0.445;       // seat height the sit clips were authored for (people_build.py SEAT_TOP)

export class PeopleWorld extends PeopleSim {
  constructor(ctx) {
    super(ctx);
    this.speech = new Speech(ctx); this.ui = new DialogueUI(); this.talk = new Talk(this);
    this.lib = null; this.group = null; this.simVisible = false;
    this.api = this._makeApi();
  }

  get svc() { return this; }

  // ---- loading -------------------------------------------------------------------------------------------------------------------
  async load() {
    this.ui.preload();
    this.speech.init();
    const root = this.ctx.assets?.root ?? './assets/models/';
    this.lib = new CharacterLibrary(root);
    await this.lib.load();
  }

  // ---- casting -------------------------------------------------------------------------------------------------------------------
  spawn(count = null) {
    const ctx = this.ctx, lib = this.lib; if (!lib?.chars.size || !ctx.plan) return;
    const t0 = performance.now(), THREE = ctx.THREE;
    this.group = new THREE.Group(); this.group.name = 'people'; ctx.scene.add(this.group);
    this._frustum = new THREE.Frustum(); this._pv = new THREE.Matrix4(); this._sph = new THREE.Sphere();
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    const n = count ?? (q?.has('npcs') ? Math.max(0, +q.get('npcs') | 0) : null);      // null = the whole barrio (every shop + the community quotas)
    const metas = new Map(lib.ids().map((id) => [id, lib.info(id)]));
    if (!this.build(metas, n)) { console.warn('[people] no walkable graph: nobody to spawn'); return; }
    ctx.addSystem('people', (dt) => this.update(dt), 20);
    ctx.timings.peopleSpawn = Math.round(performance.now() - t0);
  }

  // hooks of the simulation ------------------------------------------------------------------------------------------------------
  onNpcCreated(n) { this._makeView(n); this._registerInteract(n); if (n.away) this.onAway(n, true); }

  onAway(n, away) {
    const v = n.view; if (!v) return;
    if (away) { v.root.visible = false; n.visible = false; if (v.propName) holdProp(this.lib, v, null); }
    if (n.item) n.item.enabled = undefined;
  }

  /** A point is out of sight when it is far, or (beyond the near zone) outside the camera frustum. */
  unseen(p) {
    const P = this.player, d = Math.hypot(p.x - P.x, p.z - P.z);
    if (d > 70) return true; if (d < 14) return false;
    if (!this._sph) return d > 30;
    this._sph.center.set(p.x, (p.y ?? P.y) + 1, p.z); this._sph.radius = 2.5;
    return !this._frustum.intersectsSphere(this._sph);
  }

  // ---- views ---------------------------------------------------------------------------------------------------------------------
  _makeView(n) {
    const v = this.lib.instantiate(n.charId, n.variant); n.view = v;
    v.root.visible = false; v.root.userData.npc = n.id; this.group.add(v.root);
    this.lib.play(v, n.idleVariant, { time: n.rng.next(), fade: 0 }); n.clipName = n.idleVariant;
  }

  /** Logical state (mode / act / what they hold) -> clip name. */
  _clipFor(n) {
    const m = n.view.meta, lib = this.lib;
    if (n.mode === 'walk' && n.moving) {
      if (n.carry && lib.hasClip('walk_carry')) return 'walk_carry';
      if (n.speed > (m.walkFastSpeedMps ?? 2) * 1.08 && lib.hasClip('run')) return 'run';
      return n.speed > m.walkSpeedMps * 1.28 ? 'walk_fast' : 'walk';
    }
    const seated = n.sitH != null, other = n.idleVariant === 'idle_a' ? 'idle_b' : 'idle_a';
    switch (n.act) {
      case 'talk': return seated ? 'sit_talk' : n.talkVariant ? 'talk_b' : 'talk';
      case 'listen': return seated ? 'sit_idle' : n.idleVariant;
      case 'phone': return seated ? 'sit_phone' : 'phone_stand';
      case 'sit': return n.talkVariant ? 'sit_look' : 'sit_idle';
      case 'wave': return 'wave'; case 'point': return 'point';
      case 'bounce': return 'kid_bounce'; case 'fidget': return 'kid_fidget';
      case 'sweep': return 'sweep'; case 'lean': return 'lean_wall'; case 'sell': return 'sell'; case 'cook': return 'cook'; case 'pray': return 'pray';
      case 'carry': return lib.hasClip('carry_stand') ? 'carry_stand' : n.idleVariant;
      case 'laundry': return 'laundry'; case 'read': return 'sit_look';
      case 'wait': return other;
      default: return seated ? 'sit_idle' : n.idleVariant;
    }
  }

  /** Called by the simulation after each logic step of a person who is not hidden indoors: position the rig, pick the clip, LOD, shadows. */
  syncNpc(n, dt) { this._syncView(n, dt); }

  _syncView(n, dt) {
    const v = n.view; if (!v) return;
    let vis = n.dist < VIEW_MAX;
    if (vis && n.dist > 22) { this._sph.center.set(n.st.x, n.st.y + 0.9, n.st.z); this._sph.radius = 4; vis = this._frustum.intersectsSphere(this._sph); }
    if (vis !== n.visible) { n.visible = vis; v.root.visible = vis; }
    if (!vis) return;
    const seat = n.sitH != null ? (n.sitH - SEAT_TOP) - (v.meta.seatRootDropM ?? 0) : 0;
    v.root.position.set(n.st.x, n.st.y + seat, n.st.z); v.root.rotation.y = n.ry;
    if (n.item) { n.item.x = n.st.x; n.item.y = n.st.y + (n.sitH != null ? 1.0 : 1.45); n.item.z = n.st.z; }
    if (n.prop !== (v.propName ?? null)) holdProp(this.lib, v, n.prop ?? null);
    const clip = this._clipFor(n), walking = clip === 'walk' || clip === 'walk_fast' || clip === 'walk_carry', running = clip === 'run';
    if (clip !== n.clipName || walking || running) {
      const m = v.meta, ref = clip === 'walk_fast' ? m.walkFastSpeedMps : running ? m.runSpeedMps : m.walkSpeedMps;
      const speed = walking || running ? Math.max(0.5, Math.min(1.7, (n.curSpeed ?? n.speed) / ref)) : 1;
      this.lib.play(v, clip, { fade: 0.25, speed, time: clip !== n.clipName && (walking || running) ? n.rng.next() : undefined });
      n.clipName = clip;
    }
    const wantLod = n.dist > (v.lod ? LOD_NEAR : LOD_FAR) ? 1 : 0;                       // far people use the light mesh (same skeleton, same colours)
    if (wantLod !== v.lod) this.lib.setLod(v, wantLod);
    n.mixAcc += dt;
    const step = n.dist < 35 ? 0 : n.dist < 60 ? 0.05 : 0.1;
    if (n.mixAcc >= step) { v.mixer.update(n.mixAcc); n.mixAcc = 0; }
    const cs = n.dist < SHADOW_MAX; if (v.mesh && v.mesh.castShadow !== cs) v.mesh.castShadow = cs;
  }

  // ---- interaction ---------------------------------------------------------------------------------------------------------------
  _registerInteract(n) {
    n.item = this.ctx.interact.register({
      id: 'npc:' + n.id, kind: 'npc', x: n.st.x, y: n.st.y + 1.45, z: n.st.z, radius: 3.2, aim: 0.6,
      prompt: () => `Hablar con ${n.display}`,
      enabled: () => !n.away && n.visible && !this.talk.active,
      use: () => { this.talk.begin(n); },
    });
  }

  // ---- per frame -----------------------------------------------------------------------------------------------------------------
  syncPlayer() {
    const pl = this.ctx.player; if (!pl) return;
    const P = this.player; P.x = pl.s.x; P.y = pl.s.y; P.z = pl.s.z; P.yaw = pl.yaw;
  }

  update(dt) {
    const ctx = this.ctx, pl = ctx.player; if (!this.ready || !pl) return;
    this.syncPlayer();
    const cam = ctx.camera;
    cam.updateMatrixWorld(); this._pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this._frustum.setFromProjectionMatrix(this._pv);
    this.step(dt);
    this.talk.update(Math.min(dt, 0.1));
  }

  // ---- published API -------------------------------------------------------------------------------------------------------------
  describe(n, full = false) {
    const o = {
      id: n.id, name: n.name.full, display: n.display, persona: n.persona, bank: n.bank, role: n.roleLabel, char: n.charId, appearance: n.appearance, shop: n.shopName ?? null,
      age: n.age, gender: n.gender,
      x: +n.st.x.toFixed(2), y: +n.st.y.toFixed(2), z: +n.st.z.toFixed(2), ry: +n.ry.toFixed(2),
      mode: n.mode, act: n.act, visible: !!n.visible, away: !!n.away, dist: +(n.dist ?? 0).toFixed(1), tier: n.tier, clip: n.clipName,
      block: n.block ?? null, activity: n.activity ?? null, prop: n.prop ?? null, lot: n.inLot ?? null,
    };
    if (full) Object.assign(o, { met: n.mem.met, maxStuck: +n.maxStuck.toFixed(1), stuckTotal: +n.stuckTotal.toFixed(1), unstuck: n.unstuckCount ?? 0, goal: n.goal ?? null, home: n.homePos });
    return o;
  }

  getStats() {
    let visible = 0, tris = 0;
    for (const n of this.npcs) if (!n.away && n.visible) { visible++; tris += n.view?.meta?.tris ?? 0; }
    const bank = countLines(), looks = new Set(this.npcs.map((n) => n.appearance)), chars = new Set(this.npcs.map((n) => n.charId)), personas = new Set(this.npcs.map((n) => n.persona));
    return {
      ...this.getSimStats(), visible, tris, appearances: looks.size, characters: chars.size, personas: personas.size, lines: bank.total, bankPersonas: bank.personas,
      speech: { ready: this.speech.ready, voices: this.speech.ranked.length, reason: this.speech.reason },
    };
  }

  _makeApi() {
    const w = this;
    const api = {
      list: () => w.npcs.map((n) => w.describe(n)),
      get: (id) => { const n = w.byId.get(id); return n ? w.describe(n, true) : null; },
      /** Start a conversation with `id` (or the nearest person). Returns true if it started. */
      talk: (id) => { const n = id ? w.byId.get(id) : w.nearestNpc(); return n ? w.talk.begin(n) : false; },
      pick: (choiceId) => w.talk.pick(choiceId),
      leave: () => w.talk.leave(),
      skip: () => w.talk.skip(),
      conversation: () => (w.talk.active ? { id: w.talk.npc.id, name: w.talk.npc.display, line: w.talk.step?.line ?? null, choices: w.talk.step?.choices ?? [], end: !!w.talk.step?.end } : null),
      stats: () => w.getStats(),
      nearest: (x, z) => { const n = w.nearestNpc(x, z); return n ? w.describe(n) : null; },
    };
    // objects with cycles stay non-enumerable so `ctx.people` is always safe to serialise
    Object.defineProperty(api, 'speech', { value: w.speech }); Object.defineProperty(api, '_world', { value: w });
    return api;
  }
}
