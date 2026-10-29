// The simulation half of the living barrio: casts the inhabitants, gives them somewhere to be (spots.js), doors to go through (doors.js) and a day (schedule.js /
// brain.js), and ticks them in distance tiers. PURE (no THREE, no DOM): the whole barrio runs under Node for the scheduling / soak tests.
// world.js extends this with the views (instanced rigs), the interaction prompts, the dialogue and ctx.people.
//
//   const sim = new PeopleSim(ctx);  sim.build(charMetas);  loop: sim.setPlayer(x, y, z);  sim.step(dt);
//
// Hooks the world fills in:  onNpcCreated(npc)   syncNpc(npc, dt) (after each logic step)   onAway(npc, away)   unseen(point)
import { Npc } from './npc.js';
import { NavGraph } from './nav.js';
import { PERSONAS, voiceFor } from './personas.js';
import { planCast } from './cast.js';
import { Brain } from './brain_v2.js';
import { Spots } from './spots.js';
import { Doors } from './doors.js';
import { makeRng } from '../core/rng.js';

export const TIER0 = 28, TIER1 = 70;     // full-rate simulation / 20 Hz / 5 Hz

/** Places people can be asked about. plan.landmarks when A5 supplies enough of them, else derived from plazas / civic lots / shops. */
export function collectLandmarks(plan) {
  const hy = plan?.heightAt ?? (() => 0), out = [];
  for (const l of plan?.landmarks ?? []) out.push({ ...l, y: l.y ?? hy(l.x, l.z) });
  if (out.length >= 6) return out;
  const seen = new Set(out.map((l) => l.name));
  const add = (id, name, en, x, z, y, kind) => { if (!name || seen.has(name)) return; seen.add(name); out.push({ id, name, en: en ?? name, x, z, y: y ?? hy(x, z), kind }); };
  for (const p of plan?.plazas ?? []) {
    let cx = p.cx, cz = p.cz; if (cx == null && p.poly?.length) { cx = p.poly.reduce((a, q) => a + q[0], 0) / p.poly.length; cz = p.poly.reduce((a, q) => a + q[1], 0) / p.poly.length; }
    if (cx != null) add('pz:' + p.id, p.name, p.en, cx, cz, p.y, p.kind);
  }
  for (const l of plan?.lots ?? []) if (['chapel', 'school', 'clinic', 'hall'].includes(l.kind) || l.shop) add('lot:' + l.id, l.name, l.en ?? l.name, l.x, l.z, l.y, l.kind);
  return out;
}

const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class PeopleSim {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.npcs = []; this.byId = new Map();
    this.rng = makeRng(ctx.seed ?? 1).fork('people');
    this.physics = ctx.physics; this.brain = new Brain(this);
    this.player = { x: 0, y: 0, z: 0, yaw: 0, isPlayer: true };
    this.nav = null; this.landmarks = []; this.comp = null; this.mainComp = 0; this.spots = null; this.doors = null; this.lots = null;
    this.shops = new Map(); this.cast = [];
    this._grid = new Map(); this._near = []; this._cs = 3; this.clockT = 0; this._later = [];
    this.simVisible = true;          // Node tests: "visible" = within 35 m of the player (the world replaces this with the camera frustum)
    this.faults = [];                // exceptions caught in the frame loop (one bad person must not stop the barrio); tests assert it stays empty
    this.ready = false;
  }

  get hour() { return this.ctx.hour ?? 12; }
  inMain(i) { return this.comp ? this.comp[i] === this.mainComp : true; }
  setPlayer(x, y, z, yaw = 0) { const P = this.player; P.x = x; P.y = y; P.z = z; P.yaw = yaw; }

  // ---- building the cast ---------------------------------------------------------------------------------------------------------
  /** charMetas: Map(charId -> meta of people_meta.json). Returns false when there is no walkable graph. */
  build(charMetas, count = null) {
    const ctx = this.ctx, plan = ctx.plan; if (!plan || !charMetas?.size) return false;
    const nav = this.nav = NavGraph.fromPlan(plan);
    if (nav.size < 4) return false;
    const { comp, sizes } = nav.components(); this.comp = comp; this.mainComp = sizes.indexOf(Math.max(...sizes));
    this.landmarks = collectLandmarks(plan);
    this.spots = new Spots({ plan, anchors: ctx.anchors ?? [], buildings: ctx.buildings ?? new Map() });
    this.doors = new Doors(this);
    this._indexLots(plan); this._makeShops(plan);
    const cast = this.cast = planCast({ plan, charMetas, rng: this.rng.fork('cast'), count });
    const mainNodes = nav.nodes.filter((nd) => this.inMain(nd.i)), sp = plan.spawn ?? { x: 0, z: 0 };
    const sites = plan.lots.filter((l) => l.kind === 'unfinished'); let obreros = 0;
    for (let i = 0; i < cast.length; i++) {
      const npc = this._makeNpc(cast[i], charMetas.get(cast[i].charId), mainNodes);
      if (npc.persona === 'obrero' && sites.length) npc.siteLotId = sites[obreros++ % sites.length].id;
      this.npcs.push(npc); this.byId.set(npc.id, npc);
    }
    // the first frame of the day: everybody where they would be at this hour; a few of them within sight of the arrival point so the barrio is alive at once
    this._rebuildGrid();
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i];
      this.placeNpc(n, n.homePos.x, n.homePos.z, n.homePos.y, 0);
      n.dist = dist2d(n.st, sp);
      this.brain.start(n, i < 5 ? { x: sp.x, z: sp.z, min: 9, max: 34 } : null);
      this.onNpcCreated?.(n);
    }
    this.ready = true;
    return true;
  }

  _makeNpc(c, meta, mainNodes) {
    const plan = this.ctx.plan, nav = this.nav, r = this.rng.fork('life:' + c.id), p = PERSONAS[c.persona];
    const { gender, age, charId, shopLot, homeLot } = c;
    let hx, hz, hy;
    if (homeLot?.entrance?.outside) [hx, hy, hz] = homeLot.entrance.outside;
    else { const nd = r.pick(mainNodes); hx = nd.x; hz = nd.z; hy = nd.y; }
    let homeNode = nav.nearest(hx, hz, 30, hy); if (homeNode < 0 || !this.inMain(homeNode)) homeNode = r.pick(mainNodes).i;
    const npc = new Npc({
      id: c.id, name: c.name, persona: c.persona, bank: c.bank, role: p.role[0], age, gender, charId, meta,
      rng: r.fork('life'), voice: voiceFor(c.id, gender, age), speedBase: meta.walkSpeedMps, lane: 0.55 + r.next() * 0.7,
    });
    npc.roleLabel = c.role; npc.variant = c.variant; npc.appearance = c.appearance; npc.shopName = shopLot?.name; npc.homeLotId = homeLot?.id ?? null; npc.shopLotId = shopLot?.id ?? null;
    npc.homeNode = homeNode; npc.homePos = { x: hx, y: hy ?? plan.heightAt?.(hx, hz) ?? 0, z: hz };
    npc.routine = p.routine; npc.jit = [r.next(), r.next(), r.next()];
    npc.idleVariant = r.chance(0.5) ? 'idle_a' : 'idle_b';
    const shop = !!shopLot;
    npc.riseH = (shop ? 5.8 : age === 'kid' ? 6.4 : 5.0) + r.next() * 1.3;
    npc.bedH = (shop ? 20.3 : age === 'kid' ? 20.6 : age === 'teen' ? 22.8 : age === 'elder' ? 21.4 : 21.8) + r.next() * (shop ? 1.3 : 1.6);
    npc.mixAcc = 0;
    return npc;
  }

  _indexLots(plan) {
    const by = new Map(plan.lots.map((l) => [l.id, l])), first = (kind) => plan.lots.find((l) => l.kind === kind)?.id ?? null;
    this.lots = { byId: by, school: first('school'), clinic: first('clinic'), hall: first('hall'), chapel: first('chapel'), workshop: first('workshop') };
  }

  /** One entry per shop: its door, the keeper's post (behind the counter), the customers' spots. */
  _makeShops(plan) {
    const S = this.spots, ph = this.physics;
    const free = (x, z, y) => { try { return !ph._overlaps?.(x, z, y, 0.22, 1.5); } catch { return true; } };
    for (const lot of plan.lots) {
      if (!lot.shop) continue;
      const ent = S.entrance(lot.id, ['shop', 'main']);
      const counters = S.inside(lot.id, 'counter'), custs = S.inside(lot.id, 'customer');
      let post = null;
      const c0 = counters.find((a) => (a.tags ?? []).includes('shopkeeper')) ?? counters[0];
      if (c0) post = { x: c0.x, y: c0.y, z: c0.z, ry: c0.ry };
      if (!post && custs[0]) {              // the keeper stands where the customer faces: 1.7 m beyond the customer along its facing, at the counter's far side
        const a = custs[0], fx = Math.sin(a.ry), fz = Math.cos(a.ry);
        for (const d of [1.7, 1.6, 1.8, 1.5, 1.9]) { const x = a.x + fx * d, z = a.z + fz * d; if (free(x, z, a.y)) { post = { x, y: a.y, z, ry: a.ry + Math.PI }; break; } }
      }
      if (!post) { const v = S.inside(lot.id, 'vend')[0] ?? S.list('vend').find((s) => s.building === lot.id); if (v) post = { x: v.x, y: v.y, z: v.z, ry: v.ry }; }
      if (!post && ent?.inside) {           // last resort: just inside the door, facing the street
        const dx = ent.inside.x - ent.outside.x, dz = ent.inside.z - ent.outside.z, l = Math.hypot(dx, dz) || 1;
        post = { x: ent.inside.x + (dx / l) * 1.0, y: ent.inside.y, z: ent.inside.z + (dz / l) * 1.0, ry: Math.atan2(-dx, -dz) };
      }
      if (!post) continue;
      let cpoint = custs[0] ? { x: custs[0].x, y: custs[0].y, z: custs[0].z, ry: custs[0].ry } : null;
      if (!cpoint && ent?.inside) cpoint = { x: ent.inside.x, y: ent.inside.y, z: ent.inside.z, ry: post.ry + Math.PI };
      this.shops.set(lot.id, { lot: lot.id, type: lot.shop, name: lot.name, open: false, keeper: null, post, cust: custs, cpoint: cpoint ?? post, ent });
    }
  }

  // ---- placing --------------------------------------------------------------------------------------------------------------------
  placeNpc(n, x, z, yHint, ry) {
    const base = yHint ?? this.ctx.plan.heightAt?.(x, z) ?? 0;
    n.place(x, this.physics.groundAt(x, z, base + 0.8), z, ry ?? n.ry);
  }

  snapToNode(n, idx) {
    const nd = this.nav.nodes[idx]; if (!nd) return;
    this.placeNpc(n, nd.x, nd.z, nd.y, n.ry); n.path = null; n.moving = false; n.stuckT = 0;
  }

  /** Reveal a hidden (away) person at a point inside / at a door. */
  revealAt(n, x, z, y, ry) {
    const was = n.away; n.away = false; n.awayWhy = null; n.emerging = false; n.inLot = null;
    this.placeNpc(n, x, z, y, ry); n.mode = 'idle'; n.act = 'idle'; n.until = this.t + 0.2; n.then = null; n.path = null; n.moving = false;
    n.dist = dist2d(n.st, this.player);
    if (was) this.onAway?.(n, false);
  }

  /** May this person be moved without anybody noticing (not in view, not close)? */
  canSnap(n) { return !n.visible && (n.dist ?? 1e9) > 25; }
  /** Is this point out of the player's sight (the world refines this with the camera frustum)? */
  unseen(p) { return dist2d(p, this.player) > 30; }

  /** Graph path (node indices) -> waypoints with a "keep to your right" lane offset. */
  waypoints(npc, idx) {
    const N = this.nav.nodes; let list = idx;
    if (list.length > 1) {                                       // already past the first node? start at the second
      const a = N[list[0]], b = N[list[1]], ex = b.x - a.x, ez = b.z - a.z;
      if ((npc.x - a.x) * ex + (npc.z - a.z) * ez > 0.5 * (ex * ex + ez * ez)) list = list.slice(1);
    }
    const out = [];
    for (let k = 0; k < list.length; k++) {
      const nd = N[list[k]], p = N[list[Math.max(0, k - 1)]], q = N[list[Math.min(list.length - 1, k + 1)]];
      let tx = q.x - p.x, tz = q.z - p.z; const tl = Math.hypot(tx, tz);
      let off = nd.kind === 'stair' || p.kind === 'stair' || q.kind === 'stair' ? 0 : Math.min(npc.lane, Math.max(0, (nd.w ?? 2) - 0.9));
      if (tl < 1e-6) off = 0; else { tx /= tl; tz /= tl; }
      out.push({ x: nd.x - tz * off, z: nd.z + tx * off, y: nd.y });
    }
    return out;
  }

  /** Run `fn` after `delay` seconds of simulated time. */
  later(delay, fn) { this._later.push({ at: this.t + delay, fn }); }

  // ---- neighbours ------------------------------------------------------------------------------------------------------------------
  _key(i, j) { return (i + 512) * 1024 + (j + 512); }

  _rebuildGrid() {
    const g = this._grid, cs = this._cs;
    for (const a of g.values()) a.length = 0;
    for (const n of this.npcs) {
      if (n.away) continue;
      const k = this._key(Math.floor(n.st.x / cs), Math.floor(n.st.z / cs)); let a = g.get(k); if (!a) g.set(k, a = []); a.push(n);
    }
  }

  /** Neighbours of `npc` within r metres: other people plus the player proxy. The returned array is reused. */
  near(npc, r) {
    const out = this._near; out.length = 0; const cs = this._cs, s = npc.st, r2 = r * r;
    const i0 = Math.floor((s.x - r) / cs), i1 = Math.floor((s.x + r) / cs), j0 = Math.floor((s.z - r) / cs), j1 = Math.floor((s.z + r) / cs);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this._grid.get(this._key(i, j)); if (!a) continue;
      for (let k = 0; k < a.length; k++) { const o = a[k]; if (o !== npc && (o.st.x - s.x) ** 2 + (o.st.z - s.z) ** 2 < r2) out.push(o); }
    }
    const P = this.player; if ((P.x - s.x) ** 2 + (P.z - s.z) ** 2 < r2 && Math.abs(P.y - s.y) < 2.2) out.push(P);
    return out;
  }

  // ---- one step of the barrio --------------------------------------------------------------------------------------------------
  step(dt) {
    dt = Math.min(dt, 0.1); this.t += dt;
    this.beforeStep?.(dt);
    this._rebuildGrid();
    const tick = this.t >= this.clockT; if (tick) this.clockT = this.t + 1;
    const hour = this.hour, P = this.player;
    for (const n of this.npcs) {
      try {
        if (n.away) { if (tick) this.brain.tick(n, hour, this); continue; }
        n.dist = Math.hypot(n.st.x - P.x, n.st.z - P.z);
        n.tier = n.dist < TIER0 ? 0 : n.dist < TIER1 ? 1 : 2;
        if (this.simVisible) n.visible = n.dist < 35;
        n.accum += dt;
        const per = n.tier === 0 ? 0 : n.tier === 1 ? 0.05 : 0.2;
        if (n.accum >= per) { const sdt = Math.min(n.accum, 0.25); n.accum = 0; n.step(sdt, this); }
        this.syncNpc?.(n, dt);
        if (tick) this.brain.tick(n, hour, this);
      } catch (e) { this._fault(n, e); }
    }
    try { this.doors?.update(); this._runLater(); } catch (e) { this._fault(null, e); }
    this.afterStep?.(dt);
  }

  _runLater() {
    const L = this._later; if (!L.length) return;
    for (let i = 0; i < L.length; i++) {
      if (L[i].at > this.t) continue;
      const job = L.splice(i--, 1)[0];
      try { job.fn(); } catch (e) { this._fault(null, e); }
    }
  }

  /** One bad person must not stop the barrio: record it, put that person back on their feet, and say so once. */
  _fault(n, e) {
    const msg = String(e?.message ?? e), rec = { id: n?.id ?? null, msg, stack: String(e?.stack ?? '').split('\n').slice(0, 4).join(' | '), t: +this.t.toFixed(1) };
    if (this.faults.length < 40) this.faults.push(rec);
    if (!this._faultSeen) this._faultSeen = new Set();
    if (!this._faultSeen.has(msg)) { this._faultSeen.add(msg); try { console.error('[people] ' + (n ? n.id + ': ' : '') + msg + '\n' + rec.stack); } catch { /* no console */ } }
    if (!n) return;
    try {
      n.then = null; n.arrive = null; n.path = null; n.moving = false; n.speed = 0; n.convo = null;
      if (n.away) { n.away = false; n.emerging = false; }
      this.spots?.release(n);
      n.mode = 'idle'; n.act = 'idle'; n.until = this.t + 3;
    } catch { /* nothing more to do */ }
  }

  // ---- numbers -------------------------------------------------------------------------------------------------------------------
  /** Is anybody (awake, visible or not) standing inside a collider? Used by the soak test. */
  inWall(n, R = 0.2, H = 1.5) { try { return !!this.physics._overlaps?.(n.st.x, n.st.z, n.st.y, R, H); } catch { return false; } }

  nearestNpc(x = this.player.x, z = this.player.z) {
    let best = null, bd = 1e9;
    for (const n of this.npcs) { if (n.away) continue; const d = Math.hypot(n.st.x - x, n.st.z - z); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  getSimStats() {
    let walking = 0, talking = 0, away = 0, maxStuck = 0, stuckTotal = 0, unstuck = 0; const tiers = [0, 0, 0], acts = {}, blocks = {};
    for (const n of this.npcs) {
      blocks[n.block ?? '-'] = (blocks[n.block ?? '-'] ?? 0) + 1;
      if (n.away) { away++; continue; }
      if (n.mode === 'walk') walking++; if (n.mode === 'talk') talking++;
      tiers[n.tier]++; maxStuck = Math.max(maxStuck, n.maxStuck); stuckTotal += n.stuckTotal; unstuck += n.unstuckCount ?? 0;
      const a = n.mode === 'walk' ? 'walk' : n.act; acts[a] = (acts[a] ?? 0) + 1;
    }
    let open = 0; for (const s of this.shops.values()) if (s.open) open++;
    return { npcs: this.npcs.length, walking, talking, away, tiers, maxStuck: +maxStuck.toFixed(1), stuckTotal: +stuckTotal.toFixed(1), unstuck, acts, blocks, shops: this.shops.size, shopsOpen: open,
      doorRequests: this.doors?.requests ?? 0, faults: this.faults.length, navNodes: this.nav?.size ?? 0, fallbackNav: !!this.nav?.fallback, landmarks: this.landmarks.length };
  }
}
