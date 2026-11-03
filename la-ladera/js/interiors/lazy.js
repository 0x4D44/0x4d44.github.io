// LAZY INTERIORS (owner: A1; `?lazy=1`, see dev/FEATURE-LAZY.md). A boot used to furnish every one of the 109 buildings and draw every interior before the title card
// went away (5 s of pure data, 2 s of geometry, and a warm-up frame over all of it). Here a building's interior is made when something needs it, in slices of a frame:
//
//   DATA   furnishSteps(): rooms, furniture list, colliders, anchors, lights, prompts. Needed by the people (the whole barrio, once), the discoveries (the whole barrio, once) and by
//          anyone standing in the building. Runs for every building in the background, the nearest to the player first.
//   MESHES buildInteriorSteps(): the geometry of the `.int` group. Needed only where the player can see it: within NEAR_M of the footprint, or on demand (a door, a teleport, a
//          stuck probe). Runs near-first, after the packs it draws are in (the furniture, the clothes, the shop goods: `setPacks`).
//
// Every job is a generator that yields at the seams of the work, so a frame spends at most `budget` ms here (a step that overruns is the one indivisible piece: a room's furnisher).
// The eager boot is the same generators run to their end (`furnishBuilding`, `buildInterior`): the same world byte for byte (tests/interiors-lazy.test.mjs).
//
// What stays canonical although the order of the work is not:
//   * the id counter of layout.js belongs to the job (saved and put back around every step);
//   * the DISCOVERIES are generated in the boot's order (building order) by a cursor that only passes a building whose data is done: the text of each is picked against what the buildings
//     before it used (stories.js interiorStoryUse). The cursor is the reason `ctx.discover.total` is partial until `sealed`;
//   * `ctx.anchors` is put in the eager order (the interiors' in building order, then the world's) and renumbered when the data pass seals, before the people read it.
// Order-free by construction (checked, not assumed): furniture, rooms, finishes, colliders, goods, households, garments, the prompts and the lights as sets.
import { furnishSteps, buildInteriorSteps, collectDiscoveryStories } from './index.js';
import { getUid, setUid } from './layout.js';
import { STREAM_MS, IDLE_STREAM_MS, streamCap, streamLeft, streamSpend } from '../core/budget.js';

const now = () => performance.now();

export const LAZY = Object.freeze({
  SLICE_MS: STREAM_MS,   // the most a frame of play spends on streaming work (core/budget.js: shared with the warm-up of what is added, so this is what is LEFT of it)
  IDLE_MS: IDLE_STREAM_MS, // ... while nobody plays (the title card, the pause menu, a panel): no gameplay frame to protect
  NEAR_M: 60,            // the meshes of every building whose footprint is within this of the player are made (the furnishings show from 28 m: engine/visibility.js INT_RANGE)
  SEE_M: 28,             // ... and inside this (INT_RANGE) the interior is drawn the moment it is made, so a building this near is finished (data, meshes) before anything beyond it; the shops come next (`_pick`)
  REFRESH_M: 3,          // the distances are worked out again after the player has moved this far (or REFRESH_S seconds have passed)
  REFRESH_S: 0.5,
});

const gap = (b, x, z) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));       // metres from a point to a footprint's box (0 inside)

class Job {
  constructor(bp, i) {
    this.bp = bp; this.i = i; this.id = bp.id;
    this.d = 0; this.m = 0;                           // data / meshes: 0 not started, 1 running, 2 done
    this.shown = false;                               // the meshes are in AND warm (programs built, textures up: engine/warm.js LateWarm): the interior may be seen and a door may open onto it
    this.shop = !!bp.lot?.shop;                       // a shop's data lets its keeper in and its shutter up (people/sim.js onLotData): the far data pass does the shops before the houses
    this.gen = null; this.mgen = null; this.uid = 0; this.E = null; this.disc = false;
    this.dist = 1e9; this.urgent = 0; this.wait = []; this.walls = false;          // dist: not known until the player is (every building is equally far)
  }
  get ready() { return this.m === 2 && this.shown; }
}

export class InteriorManager {
  constructor(ctx, o = {}) {
    this.ctx = ctx; this.o = { ...LAZY, ...o };
    this.jobs = [...ctx.buildings.values()].map((bp, i) => new Job(bp, i));       // the boot's building order: the order the discoveries are made in
    this.byId = new Map(this.jobs.map((j) => [j.id, j]));
    this.cursor = 0; this.sealed = !this.jobs.length; this.built = !this.jobs.length; this.packs = false;
    this.nData = 0; this.nMesh = 0; this.seq = 0;
    this.px = NaN; this.pz = NaN; this.lastRefresh = -1e9;
    this.sealWait = []; this.builtWait = []; this.packWait = [];
    this.stats = { steps: 0, slices: 0, maxStepMs: 0, ensured: 0, late: 0, skipped: 0, cursorMs: 0 };
    this.wantMeshes = o.meshes !== false;             // false: `?skip=interiors` (the data is made, nothing is drawn)
    this.nShown = 0;
    if (!this.wantMeshes) { for (const j of this.jobs) { j.m = 2; j.shown = true; } this.nMesh = this.nShown = this.jobs.length; this.built = true; }
  }

  // ------------------------------------------------------------------ queries
  job(id) { return this.byId.get(id) ?? null; }
  dataDone(id) { return this.byId.get(id)?.d === 2; }
  /** The building's interior can be entered: its meshes are in and warm (a building with nothing to draw is ready once that is true of its empty group). */
  ready(id) { const j = this.byId.get(id); return !j || j.ready; }
  progress() { const n = this.jobs.length || 1; return { total: this.jobs.length, data: this.nData, meshes: this.nMesh, shown: this.nShown, fraction: (this.nData + (this.wantMeshes ? this.nShown : this.nData)) / (2 * n), sealed: this.sealed, built: this.built, packs: this.packs }; }
  summary() { return { ...this.progress(), cursor: this.cursor, ...this.stats }; }

  /** The 'colliders' stage of a lazy boot: every shell's walls and floors (the furniture's blockers are added as each building's data is done: `_dataDone`). */
  addShellColliders() {
    for (const j of this.jobs) {
      const c = j.bp.colliders ?? {}, n0 = j.bp.interior?.walls0;
      this.ctx.physics.add({ walls: n0 != null && c.walls ? c.walls.slice(0, n0) : c.walls, floors: c.floors });
    }
  }

  // ------------------------------------------------------------------ control
  /** The packs the meshes are drawn from (the furniture's models, the clothes', the shop goods') have come down (or failed: the stand-ins are the fallback): meshes may be made now. */
  setPacks(ok = true) { if (this.packs === ok) return; this.packs = ok; if (ok) { const w = this.packWait; this.packWait = []; for (const f of w) f(); } }
  whenPacks() { return this.packs ? Promise.resolve() : new Promise((r) => this.packWait.push(r)); }
  whenSealed() { return this.sealed ? Promise.resolve() : new Promise((r) => this.sealWait.push(r)); }
  whenBuilt() { return this.built ? Promise.resolve() : new Promise((r) => this.builtWait.push(r)); }
  /** Resolves when this building's interior is ready (at once when it is). Asking raises it to the front of the queue. */
  whenReady(id) {
    const j = this.byId.get(id); if (!j || j.ready) return Promise.resolve();
    this.need(id);
    return new Promise((r) => j.wait.push(r));
  }
  /** Something needs this interior (a door about to open, a resident, a probe): it goes to the front of the queue. */
  need(id) { const j = this.byId.get(id); if (j && (j.d !== 2 || j.m !== 2)) j.urgent = ++this.seq; }

  /**
   * A door of a building whose interior is not made yet is pressed (core/interact.js `use`): the interior goes to the front of the queue and the door does what was asked the moment it is ready,
   * with a word on screen if that takes a moment. True when the press was taken (the caller does nothing more), false when the door may open now.
   */
  holdDoor(it) {
    const id = it.building;
    if (id == null || this.ready(id)) return false;
    if (it.held) return true;                                                      // a second press while it waits: still the same wait
    it.held = true;
    const ctx = this.ctx, say = setTimeout(() => ctx.ui?.toast?.('Un momento…', 1500), 400);
    this.whenReady(id).then(() => { clearTimeout(say); it.held = false; it.use?.(ctx, it); });
    return true;
  }

  /** Make the building's data NOW, all of it (the chapel's shell reads its furniture; a teleport lands in a building). */
  ensureData(id) {
    const j = this.byId.get(id); if (!j) return false;
    while (j.d !== 2) this._dataStep(j);
    return true;
  }
  /** Make the whole interior NOW (data, then meshes when the packs are in): the player is in, or at, a building the queue has not reached. Counts as `late` when it had to. */
  ensure(id, why = 'ensure') {
    const j = this.byId.get(id); if (!j) return false;
    if (j.ready) return true;
    this.stats.ensured++;
    this.ensureData(id);
    if (this.packs) while (j.m !== 2) this._meshStep(j, true);
    if (j.m === 2 && !j.shown) this.ctx.visibility?.releaseInterior?.(j.id);           // warming still: the player is here, show what there is
    if (why === 'late') this.stats.late++;
    return j.m === 2;
  }

  /** Run everything that is left, now (the tests, and a probe that wants the whole barrio). `meshes: false` stops at the data. Returns the milliseconds it took. */
  drain({ meshes = true } = {}) {
    const t0 = now();
    for (const j of this.jobs) { while (j.d !== 2) this._dataStep(j); }
    if (meshes && this.wantMeshes && this.packs) for (const j of this.jobs) { while (j.m !== 2) this._meshStep(j, true); }
    this.ctx.lateWarm?.drain();
    return now() - t0;
  }

  // ------------------------------------------------------------------ the frame
  /** The per-frame call (a system in play, the self-driver otherwise): `dt` in seconds. */
  update(dt = 0) {
    if (dt > 0.045) { this.stats.skipped++; return; }                              // the last frame was already a long one: leave this one alone
    this._safety();
    const ms = streamLeft(this.ctx, this.ctx.running ? Math.max(this.o.SLICE_MS, streamCap(this.ctx)) : this.o.IDLE_MS);   // what the frame's budget still has (it grows while the frames have time to spare: core/budget.js): the warm-up of what was added comes first (engine/warm.js)
    if (ms >= 0.25) this.pump(ms);
  }
  /** An interior is warm: it may be seen. */
  _shown(j) {
    if (j.shown) return; j.shown = true; this.nShown++;
    this.ctx.events?.emit('interiors:ready', { id: j.id });
    const w = j.wait; j.wait = []; for (const f of w) f();
    if (!this.built && this.nShown >= this.jobs.length) {
      this.built = true;
      const b = this.builtWait; this.builtWait = []; for (const f of b) f();
      this.ctx.events?.emit('interiors:built', {});
    }
  }

  /** Work for up to `ms` (one step is never cut: a long one overruns). Returns true while there is more to do. */
  pump(ms = this.o.SLICE_MS) {
    const t0 = now();
    this._refresh();
    let n = 0;
    for (;;) {
      const j = this._pick();
      if (!j) break;
      const t = now();
      this._step(j);
      const e = now() - t; if (e > this.stats.maxStepMs) this.stats.maxStepMs = e;
      n++;
      if (now() - t0 >= ms) break;
    }
    if (n) { this.stats.slices++; this.stats.steps += n; }
    streamSpend(this.ctx, now() - t0);
    return !!this._pick();
  }

  /** The distances to the player, for the order of the queue (cheap: a few hundred boxes). */
  _refresh(force = false) {
    const p = this.ctx.player?.s; if (!p) return;
    const t = now();
    if (!force && Math.hypot(p.x - this.px, p.z - this.pz) < this.o.REFRESH_M && t - this.lastRefresh < this.o.REFRESH_S * 1000) return;
    this.px = p.x; this.pz = p.z; this.lastRefresh = t;
    for (const j of this.jobs) j.dist = gap(j.bp.bounds, p.x, p.z);
  }

  /**
   * The next job to advance, or null. In this order:
   *   1. what somebody waits for (a door, a teleport, a resident);
   *   2. the buildings the player can see into (within SEE_M, the range interiors are drawn from: engine/visibility.js INT_RANGE), the nearest first: a building's data, its meshes at once, then the next;
   *   3. the data of every shop, the nearest first, whatever its distance: a shop's data brings in its keeper and puts its shutter up (people/sim.js `onLotData`), and the street is seen from everywhere
   *      (R3-210: the shutters stood down and the last shop opened at 120 s of 155, behind the data and the meshes of every house in reach);
   *   4. the data of the houses within NEAR_M, the nearest first; 5. their meshes, the nearest first; 6. the data of the rest, the nearest first; 7. the meshes of the rest.
   * (Measured over the barrio's data pass in plain Node, on 7dbc7c48: the 28 shops are 25 % of its work, and the last of them is made after 31 % of it, against 56 % under the round-6 order, the nearest building first; dev/FEATURE-LAZY.md section 10.)
   */
  _pick() {
    let best = null, bestKey = Infinity, wantData = null, wantMesh = null, wantShop = null, dData = Infinity, dMesh = Infinity, dShop = Infinity;
    const meshOk = this.packs && this.wantMeshes;
    for (const j of this.jobs) {
      const doneAll = j.d === 2 && (j.m === 2 || !meshOk);
      if (doneAll) continue;
      if (j.urgent && (j.d !== 2 || meshOk)) { const k = -1e12 + j.urgent; if (k < bestKey) { bestKey = k; best = j; } continue; }
      if (j.d !== 2) { if (j.dist < dData) { dData = j.dist; wantData = j; } if (j.shop && j.dist < dShop) { dShop = j.dist; wantShop = j; } }
      else if (meshOk && j.dist < dMesh) { dMesh = j.dist; wantMesh = j; }
    }
    if (best) return best;
    const SEE = this.o.SEE_M, NEAR = this.o.NEAR_M;
    if (dMesh <= SEE && dMesh <= dData) return wantMesh;                          // (a furnished building no farther than the next one to furnish: it is drawn at once)
    if (dData <= SEE) return wantData;
    if (wantShop) return wantShop;
    if (dData <= NEAR) return wantData;
    if (dMesh <= NEAR) return wantMesh;
    return wantData ?? wantMesh;
  }

  _step(j) { if (j.d !== 2) this._dataStep(j); else this._meshStep(j, false); }

  _dataStep(j) {
    const ctx = this.ctx;
    if (!j.gen) { j.gen = furnishSteps(ctx, j.bp, { lazy: true }); j.d = 1; j.uid = 0; }
    setUid(j.uid);
    let r;
    try { r = j.gen.next(); }
    catch (e) { (ctx.errors ??= []).push({ stage: 'furnish', building: j.id, message: String(e?.message ?? e), stack: e?.stack }); console.error('[furnish]', j.id, e); r = { done: true, value: null }; }
    j.uid = getUid();
    if (r.done) { j.d = 2; j.gen = null; j.E = r.value ?? null; this._dataDone(j); }
  }

  _dataDone(j) {
    const { ctx } = this, bp = j.bp, walls = bp.colliders?.walls, n0 = bp.interior?.walls0;
    if (walls && n0 != null && walls.length > n0 && !j.walls) { j.walls = true; ctx.physics.addWalls(walls.slice(n0)); }     // the furniture's blockers (the shell's went in at the 'colliders' stage)
    this.nData++;
    ctx.events?.emit('interiors:data', { id: j.id });
    this._advance();
  }

  /** The discovery cursor: building order, only over buildings whose data is done. Seals the data pass when it reaches the end. */
  _advance() {
    const t0 = now();
    while (this.cursor < this.jobs.length) {
      const j = this.jobs[this.cursor]; if (j.d !== 2) break;
      try { if (j.E) collectDiscoveryStories(this.ctx, j.bp, j.E); }
      catch (e) { (this.ctx.errors ??= []).push({ stage: 'furnish', building: j.id, message: 'stories ' + String(e?.message ?? e), stack: e?.stack }); console.error('[stories]', j.id, e); }
      j.E = null; j.disc = true; this.cursor++;
    }
    this.stats.cursorMs += now() - t0;
    if (!this.sealed && this.cursor >= this.jobs.length) this._seal();
  }

  /** Every building's data is in and the discoveries are made: the anchors take the eager order (the interiors' in building order, then the world's), so whoever reads them sees what a full boot makes. */
  _seal() {
    const ctx = this.ctx, A = ctx.anchors;
    const mine = new Set(), order = [];
    for (const j of this.jobs) for (const a of j.bp.anchors ?? []) if (!mine.has(a)) { mine.add(a); order.push(a); }
    const rest = A.filter((a) => !mine.has(a)), all = order.concat(rest);
    if (all.length === A.length) {
      A.splice(0, A.length, ...all);
      A.forEach((a, i) => { if (/^a\d+$/.test(a.id ?? '')) a.id = 'a' + i; });
    }
    this.sealed = true;
    const w = this.sealWait; this.sealWait = []; for (const f of w) f();
    ctx.events?.emit('interiors:sealed', { anchors: A.length });
  }

  _meshStep(j, now = false) {
    const ctx = this.ctx;
    if (!j.mgen) { j.mgen = buildInteriorSteps(ctx, j.bp); j.m = 1; }
    let r;
    try { r = j.mgen.next(); }
    catch (e) { (ctx.errors ??= []).push({ stage: 'build', building: j.id, message: 'interior ' + String(e?.message ?? e), stack: e?.stack }); console.error('[interior]', j.id, e); r = { done: true }; }
    if (r.done) { j.m = 2; j.mgen = null; this._meshDone(j, now); }
  }

  /** The meshes are in. They join the visibility budget, hidden, and the interior is SHOWN (and a door may open onto it) once its programs are built and its textures are up (LateWarm);
   *  `now`: the player is here, no waiting. */
  _meshDone(j, now = false) {
    const { ctx } = this;
    this.nMesh++;
    ctx.events?.emit('interiors:meshes', { id: j.id });
    let p = null;
    try { p = ctx.visibility?.addInterior?.(j.id, { now }); } catch (e) { (ctx.errors ??= []).push({ stage: 'build', building: j.id, message: 'visibility ' + String(e?.message ?? e) }); }
    if (p && typeof p.then === 'function') p.then(() => this._shown(j), () => this._shown(j)); else this._shown(j);
  }

  // ------------------------------------------------------------------ the player outruns the queue
  /** The building (if any) the player stands in or on. */
  _here() {
    const pl = this.ctx.player; if (!pl) return null;
    if (pl.building != null && this.byId.has(pl.building)) return pl.building;
    return null;
  }
  /** Standing in a building whose interior is not made is the one thing that must never be seen: make it now (counted, the tests hold it at zero in ordinary walking). */
  _safety() {
    const id = this._here(); if (id == null) return;
    const j = this.byId.get(id); if (!j || j.ready) return;
    if (j.m === 2) { this.ctx.visibility?.releaseInterior?.(id); return; }          // built, still warming: the player is in it, so it is shown now
    if (!this.packs && j.d === 2) return;                                          // nothing more can be done until the packs are in: the shell is bare, no furnishing is hidden
    this.ensure(id, 'late');
  }

  /** The player was put somewhere else (a respawn, a probe): the building under their feet, if any, is made now, so the first frame there is right. */
  onTeleport() {
    const p = this.ctx.player?.s; if (!p) return;
    this._refresh(true);
    for (const j of this.jobs) {
      const b = j.bp.bounds;
      if (p.x >= b.x0 - 0.5 && p.x <= b.x1 + 0.5 && p.z >= b.z0 - 0.5 && p.z <= b.z1 + 0.5 && p.y >= b.y0 - 2 && p.y <= b.y1 + 2) this.ensure(j.id);
    }
  }

  /** Wire into the page: a system for play, a driver for the rest, the teleport hook. */
  attach() {
    const ctx = this.ctx;
    ctx.interiors = this;
    ctx.addSystem('interiors', (dt) => this.update(dt), 8);
    ctx.events?.on('player:teleport', () => { this.onTeleport(); ctx.visibility?.update?.(0, true); ctx.pool?.update?.(0, true); });
    if (!ctx.opts.manual) this._drive();
    return this;
  }

  /** While the game does not step (title card, pause, a panel) nothing calls update(): this does, on a frame or, in a tab that gets none, on a timer. */
  _drive() {
    let off = false;
    const tick = () => {
      if (off) return;
      if (!this.ctx.running && !(this.sealed && this.built)) { try { this.update(0); } catch (e) { (this.ctx.errors ??= []).push({ stage: 'interiors', message: String(e?.message ?? e), stack: e?.stack }); } }
      if (this.sealed && this.built) { off = true; return; }
      let fired = false;
      const go = () => { if (fired) return; fired = true; tick(); };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
      setTimeout(go, 40);
    };
    this.stop = () => { off = true; };
    tick();
  }
}
