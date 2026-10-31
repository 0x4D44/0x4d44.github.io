// The living barrio in the browser: the simulation (sim.js: casting, spots, doors, the day, tiers) plus what needs THREE and the DOM - the instanced rigs and their
// clips, props in hand, seats, the interaction prompts, the dialogue and ctx.people. Logic lives in sim.js / npc.js / brain.js / talk.js.
import { PeopleSim, collectLandmarks, SEAT_TOP } from './sim.js';
import { Talk } from './talk.js';
import { DialogueUI } from './ui.js';
import { CharacterLibrary } from './rig.js';
import { Speech } from './speech.js';
import { holdProp, propFor, phoneClip, sellClip } from './props.js';
import { plantFeet } from './legs.js';
import { countLines } from './lines/index.js';
import { PERSON } from '../core/interact.js';

export { collectLandmarks };

const VIEW_MAX = 95;          // beyond this nobody is drawn
const SHADOW_MAX = 42;        // beyond this nobody casts a shadow
const LOD_NEAR = 32, LOD_FAR = 38;   // full-detail mesh inside 32 m, the 1.6k-triangle one beyond 38 m (hysteresis)
const LIE_LIFT = 0.1;         // metres: a body lying on its back rests on the mattress with the root this far above it (the back is about 0.1 m behind the root's axis)

export class PeopleWorld extends PeopleSim {
  constructor(ctx) {
    super(ctx);
    this.speech = new Speech(ctx); this.ui = new DialogueUI(); this.talk = new Talk(this);
    this.lib = null; this.group = null; this.simVisible = false;
    this.api = this._makeApi();
  }

  get svc() { return this; }
  get talkBusy() { return this.talk.active; }

  /** A resident reacts to the player opening a drawer (reactions.js): the line as a subtitle (Spanish + English by the settings) and in their voice. */
  onReact(n, line, ev) {
    const ctx = this.ctx;
    ctx.ui?.subtitle?.({ who: n.display, es: line.es, en: line.en, ms: Math.round(line.hold * 1000 + 1200) });
    ctx.events?.emit?.('npc:react', { id: n.id, name: n.display, es: line.es, en: line.en, pool: line.pool, building: ev?.building ?? null, container: ev?.id ?? null });
    this.speech.speak(line.es, n.voice);
    n.speakUntil = this.t + this.speech.estimate(line.es) / 1000;
  }

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
    // (the item's own `enabled` guard, registered in _registerInteract, already answers n.away, n.visible, a talk and a sleeper: it stays; a missing `enabled` reads as "always offered")
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
      case 'phone': return phoneClip(n, seated, lib.hasClip('phone_call'));        // R3-004: two in five hold it to the ear, the rest text
      case 'sit': return n.talkVariant ? 'sit_look' : 'sit_idle';
      case 'wave': return 'wave'; case 'point': return 'point';
      case 'bounce': return 'kid_bounce'; case 'fidget': return 'kid_fidget';
      case 'sweep': return 'sweep'; case 'lean': return 'lean_wall'; case 'sell': return sellClip(n, lib.hasClip('carry_stand')); case 'cook': return 'cook'; case 'pray': return 'pray';
      case 'carry': return lib.hasClip('carry_stand') ? 'carry_stand' : n.idleVariant;
      case 'laundry': return 'laundry'; case 'read': case 'homework': return 'sit_look';
      case 'wash': case 'repair': return 'cook';                                       // hands busy at a sink or a bench
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
    if (n.lieH != null) {                                                            // asleep in bed (homelife.js): on the back along the bed, the head at its head, the back on the mattress
      const len = v.meta.heightM ?? 1.7, fx = Math.sin(n.ry), fz = Math.cos(n.ry);
      v.root.position.set(n.st.x + fx * len * 0.5, n.st.y + n.lieH + LIE_LIFT, n.st.z + fz * len * 0.5);
      v.root.rotation.order = 'YXZ'; v.root.rotation.set(-Math.PI / 2, n.ry, 0); v.lying = true;
    } else {
      v.root.position.set(n.st.x, n.st.y + seat, n.st.z);
      if (v.lying) { v.lying = false; v.root.rotation.order = 'XYZ'; v.root.rotation.x = 0; }
      v.root.rotation.y = n.ry;
    }
    if (n.item) { n.item.x = n.st.x; n.item.y = n.st.y + (n.lieH != null ? n.lieH + 0.4 : n.sitH != null ? 1.0 : 1.45); n.item.z = n.st.z; }
    const clip = this._clipFor(n), walking = clip === 'walk' || clip === 'walk_fast' || clip === 'walk_carry', running = clip === 'run';
    const prop = propFor(n, clip); if (prop !== (v.propName ?? null)) holdProp(this.lib, v, prop);
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
    if (n.mixAcc >= step) {
      v.mixer.update(n.mixAcc); n.mixAcc = 0;
      n.floatM = n.sitH != null ? plantFeet(this.lib, v, n.st.y) : null;       // R1-D13: a seated person's soles on the floor (thighs tilt down, shins stay upright); null when standing
    }
    const cs = n.dist < SHADOW_MAX && !n.scene; if (v.mesh && v.mesh.castShadow !== cs) v.mesh.castShadow = cs;       // (nobody indoors casts into the sun's shadow map: the interiors do not either)
  }

  // ---- interaction ---------------------------------------------------------------------------------------------------------------
  _registerInteract(n) {
    n.item = this.ctx.interact.register({
      ...PERSON,                                                    // the aim is decided by the ray against the body, and wins over the counter, the till and the door beside them (R3-003)
      id: 'npc:' + n.id, kind: 'npc', x: n.st.x, y: n.st.y + 1.45, z: n.st.z, radius: 3.2, aim: 0.6,
      prompt: () => `Hablar con ${n.display}`,
      enabled: () => !n.away && n.visible && !this.talk.active && n.act !== 'sleep',
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

  /**
   * Reviewer helper (window.__ladera.lookAtNpc, see dev/REVIEWER-BRIEF.md): put the player in front of person `id` (the nearest one when null), about `o.dist` m away (default 1.3),
   * aimed at the face, and bring the camera, the interaction target and every view up to date, so the very next render draws them where npcs() says they are.
   */
  lookAtNpc(id = null, o = {}) {
    const ctx = this.ctx, pl = ctx.player;
    if (!pl || !this.ready) return { ok: false, reason: 'the barrio is not ready' };
    this.syncPlayer();
    const hidden = id ? this.byId.get(id) : null;
    if (hidden?.away) this.homelife?.reveal(hidden);                                       // somebody indoors (asleep, at home, a visit, on duty): drawn on their place, so that the player can be put in front of them
    const pose = this.lookPose(id, o); if (!pose.ok) return pose;
    pl.teleport(pose.feet.x, pose.feet.z, { y: pose.feet.y, yaw: pose.yaw, pitch: pose.pitch });
    for (let i = 0; i < 2; i++) ctx.step?.(1 / 240);                                       // the camera follows the player; the people system sees the new camera and draws who is in front of it
    const n = this.byId.get(pose.id), head = this.headOf(n), cam = ctx.camera, dx = head.x - pl.s.x, dz = head.z - pl.s.z;
    pl.setLook(Math.atan2(-dx, -dz), Math.atan2(head.y - pl.eyeY, Math.hypot(dx, dz)));      // the person has hardly moved: aim at where the face is now
    cam.rotation.set(pl.pitch, pl.yaw, 0); cam.updateMatrixWorld(true);
    return { ok: true, id: n.id, name: n.display, dist: +Math.hypot(dx, dz).toFixed(2), head: { x: +head.x.toFixed(2), y: +head.y.toFixed(2), z: +head.z.toFixed(2) }, player: [+pl.s.x.toFixed(2), +pl.s.y.toFixed(2), +pl.s.z.toFixed(2)], yaw: +pl.yaw.toFixed(3), pitch: +pl.pitch.toFixed(3), drawn: !!(n.view && n.visible) };
  }

  // ---- published API -------------------------------------------------------------------------------------------------------------
  /** `x y z` = where they stand (the floor under their feet), `head` = their eyes as drawn now (a seated person's is lower), `drawn` = a model is on screen. */
  describe(n, full = false) {
    const hd = this.headOf(n);
    const o = {
      id: n.id, name: n.name.full, display: n.display, persona: n.persona, bank: n.bank, role: n.roleLabel, char: n.charId, appearance: n.appearance, shop: n.shopName ?? null,
      age: n.age, gender: n.gender,
      x: +n.st.x.toFixed(2), y: +n.st.y.toFixed(2), z: +n.st.z.toFixed(2), ry: +n.ry.toFixed(2), head: { x: +hd.x.toFixed(2), y: +hd.y.toFixed(2), z: +hd.z.toFixed(2) },
      mode: n.mode, act: n.act, visible: !!n.visible, drawn: !!(n.view && n.visible && !n.away), away: !!n.away, dist: +(n.dist ?? 0).toFixed(1), tier: n.tier, clip: n.clipName,
      block: n.block ?? null, activity: n.activity ?? null, prop: n.prop ?? null, lot: n.inLot ?? null,
      scene: n.scene ? { lot: n.scene.lot, kind: n.scene.kind, why: n.scene.why, room: n.scene.spot.room ?? null, spot: n.scene.spot.id, arrived: !!n.scene.arrived } : null,       // drawn inside a building (homelife.js)
      household: n.household ? { ...n.household } : null,         // { id, role: 'woman'|'man'|'kid'|'kid2', lot, matched }: the member of js/interiors/household.js this person is (display = that member's first name)
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
      /** The last residents' reactions to opened drawers: [{ t, id, name, pool, es, en, group, building, container }]. */
      reactions: () => (w.reactions?.log ?? []).slice(-20),
      nearest: (x, z) => { const n = w.nearestNpc(x, z); return n ? w.describe(n) : null; },
      /** Stand in front of `id` (the nearest person when omitted) and look them in the face; also window.__ladera.lookAtNpc. */
      lookAt: (id, o) => w.lookAtNpc(id, o),
    };
    // objects with cycles stay non-enumerable so `ctx.people` is always safe to serialise
    Object.defineProperty(api, 'speech', { value: w.speech }); Object.defineProperty(api, '_world', { value: w });
    return api;
  }
}
