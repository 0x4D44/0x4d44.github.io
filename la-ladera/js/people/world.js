// The living barrio: casts the inhabitants, ticks them (distance tiers), draws them (instanced rigs, shared clips), registers their
// interaction and publishes ctx.people. Logic lives in npc.js / brain.js / talk.js; this file is the glue and the only place THREE is touched.
import { Npc } from './npc.js';
import { NavGraph } from './nav.js';
import { PERSONAS, voiceFor } from './personas.js';
import { planCast } from './cast.js';
import { Brain } from './brain.js';
import { Talk } from './talk.js';
import { DialogueUI } from './ui.js';
import { CharacterLibrary } from './rig.js';
import { Speech } from './speech.js';
import { countLines } from './lines/index.js';
import { makeRng } from '../core/rng.js';

const VIEW_MAX = 95;          // beyond this nobody is drawn
const SHADOW_MAX = 42;        // beyond this nobody casts a shadow
const LOD_NEAR = 32, LOD_FAR = 38;   // full-detail mesh inside 32 m, the 1.6k-triangle one beyond 38 m (hysteresis)
const TIER0 = 28, TIER1 = 70; // full-rate simulation / 20 Hz / 5 Hz

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

export class PeopleWorld {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.npcs = []; this.byId = new Map();
    this.rng = makeRng(ctx.seed ?? 1).fork('people');
    this.physics = ctx.physics; this.brain = new Brain(this);
    this.speech = new Speech(ctx); this.ui = new DialogueUI(); this.talk = new Talk(this);
    this.player = { x: 0, y: 0, z: 0, yaw: 0, isPlayer: true };
    this.lib = null; this.nav = null; this.landmarks = []; this.ready = false; this.comp = null; this.mainComp = 0;
    this._grid = new Map(); this._near = []; this._cs = 3; this.clockT = 0;
    this.api = this._makeApi();
  }

  get svc() { return this; }
  inMain(i) { return this.comp ? this.comp[i] === this.mainComp : true; }

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
    const t0 = performance.now();
    this.nav = NavGraph.fromPlan(ctx.plan);
    if (this.nav.size < 4) { console.warn('[people] no walkable graph: nobody to spawn'); return; }
    const { comp, sizes } = this.nav.components(); this.comp = comp; this.mainComp = sizes.indexOf(Math.max(...sizes));
    this.landmarks = collectLandmarks(ctx.plan);
    const THREE = ctx.THREE;
    this.group = new THREE.Group(); this.group.name = 'people'; ctx.scene.add(this.group);
    this._frustum = new THREE.Frustum(); this._pv = new THREE.Matrix4(); this._sph = new THREE.Sphere();
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    const n = count ?? (q?.has('npcs') ? Math.max(0, +q.get('npcs') | 0) : null);      // null = the whole barrio (every shop + the community quotas)
    this._cast(n);
    ctx.addSystem('people', (dt) => this.update(dt), 20);
    this.ready = true;
    ctx.timings.peopleSpawn = Math.round(performance.now() - t0);
  }

  _cast(count) {
    const { lib, ctx, nav } = this, plan = ctx.plan, hy = plan.heightAt ?? (() => 0);
    const metas = new Map(lib.ids().map((id) => [id, lib.info(id)]));
    const cast = planCast({ plan, charMetas: metas, rng: this.rng.fork('cast'), count });
    this.cast = cast;
    const mainNodes = nav.nodes.filter((nd) => this.inMain(nd.i));
    const sp = plan.spawn ?? { x: 0, z: 0 }, placed = [];
    for (let i = 0; i < cast.length; i++) {
      const c = cast[i], r = this.rng.fork('life:' + c.id), meta = lib.info(c.charId), p = PERSONAS[c.persona];
      const { gender, age, charId, shopLot, homeLot } = c, shop = !!shopLot;
      // home position (door step) and nearest graph node
      let hx, hz, hyv;
      if (homeLot?.entrance?.outside) { [hx, hyv, hz] = homeLot.entrance.outside; }
      else { const nd = r.pick(mainNodes); hx = nd.x; hz = nd.z; hyv = nd.y; }
      let homeNode = nav.nearest(hx, hz, 30, hyv); if (homeNode < 0 || !this.inMain(homeNode)) homeNode = r.pick(mainNodes).i;
      const npc = new Npc({
        id: c.id, name: c.name, persona: c.persona, bank: c.bank, role: p.role[0], age, gender, charId, meta,
        rng: r.fork('life'), voice: voiceFor(c.id, gender, age), speedBase: meta.walkSpeedMps,
        lane: 0.55 + r.next() * 0.7,
      });
      npc.roleLabel = c.role; npc.variant = c.variant; npc.appearance = c.appearance; npc.shopName = shopLot?.name; npc.homeLotId = homeLot?.id ?? null; npc.shopLotId = shopLot?.id ?? null;
      npc.homeNode = homeNode; npc.homePos = { x: hx, y: hyv, z: hz };
      npc.idleVariant = r.chance(0.5) ? 'idle_a' : 'idle_b';
      npc.riseH = (shop ? 5.8 : age === 'kid' ? 6.4 : 5.0) + r.next() * 1.3;
      npc.bedH = (shop ? 20.3 : age === 'kid' ? 20.6 : age === 'teen' ? 22.8 : age === 'elder' ? 21.4 : 21.8) + r.next() * (shop ? 1.3 : 1.6);
      npc.mixAcc = 0;
      // start somewhere on the graph, a few of them near the player's arrival point so the barrio is alive at once
      let node = null;
      for (let k = 0; k < 14 && !node; k++) {
        const cand = r.pick(mainNodes), nearSpawn = i < 5;
        const ds = Math.hypot(cand.x - sp.x, cand.z - sp.z);
        if (nearSpawn ? (ds < 9 || ds > 34) : false) continue;
        if (placed.some((q) => Math.hypot(q.x - cand.x, q.z - cand.z) < 5)) continue;
        node = cand;
      }
      node ??= r.pick(mainNodes);
      placed.push(node);
      this.placeNpc(npc, node.x + (r.next() - 0.5), node.z + (r.next() - 0.5), node.y ?? hy(node.x, node.z), r.range(-Math.PI, Math.PI));
      npc.stand(this, 'idle', r.range(0, 7));
      this._makeView(npc);
      this._registerInteract(npc);
      if (!this.brain.awakeAt(npc, ctx.hour)) this.brain.sleep(npc);
      this.npcs.push(npc); this.byId.set(npc.id, npc);
    }
  }

  placeNpc(n, x, z, yHint, ry) {
    const base = yHint ?? this.ctx.plan.heightAt?.(x, z) ?? 0;
    n.place(x, this.physics.groundAt(x, z, base + 0.8), z, ry ?? n.ry);
  }

  snapToNode(n, idx) {
    const nd = this.nav.nodes[idx]; if (!nd) return;
    this.placeNpc(n, nd.x, nd.z, nd.y, n.ry); n.path = null; n.moving = false; n.stuckT = 0;
  }

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

  // ---- views ---------------------------------------------------------------------------------------------------------------------
  _makeView(n) {
    const v = this.lib.instantiate(n.charId, n.variant); n.view = v;
    v.root.visible = false; v.root.userData.npc = n.id; this.group.add(v.root);
    this.lib.play(v, n.idleVariant, { time: n.rng.next(), fade: 0 }); n.clipName = n.idleVariant;
  }

  _clipFor(n) {
    const m = n.view.meta;
    if (n.mode === 'walk' && n.moving) return n.speed > m.walkSpeedMps * 1.28 ? 'walk_fast' : 'walk';
    switch (n.act) {
      case 'talk': return 'talk'; case 'phone': return 'phone_stand'; case 'wave': return 'wave'; case 'point': return 'point';
      case 'bounce': return 'kid_bounce'; case 'fidget': return 'kid_fidget'; case 'sit': return 'sit_idle';
      default: return n.idleVariant;
    }
  }

  _syncView(n, dt) {
    const v = n.view; if (!v) return;
    let vis = n.dist < VIEW_MAX;
    if (vis && n.dist > 22) { this._sph.center.set(n.st.x, n.st.y + 0.9, n.st.z); this._sph.radius = 4; vis = this._frustum.intersectsSphere(this._sph); }
    if (vis !== n.visible) { n.visible = vis; v.root.visible = vis; }
    if (!vis) return;
    v.root.position.set(n.st.x, n.st.y, n.st.z); v.root.rotation.y = n.ry;
    if (n.item) { n.item.x = n.st.x; n.item.y = n.st.y + 1.45; n.item.z = n.st.z; }
    const clip = this._clipFor(n), walking = clip === 'walk' || clip === 'walk_fast';
    if (clip !== n.clipName || walking) {
      const m = v.meta, ref = clip === 'walk_fast' ? m.walkFastSpeedMps : m.walkSpeedMps;
      const speed = walking ? Math.max(0.5, Math.min(1.7, (n.curSpeed ?? n.speed) / ref)) : 1;
      this.lib.play(v, clip, { fade: 0.25, speed, time: clip !== n.clipName && walking ? n.rng.next() : undefined });
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

  update(dt) {
    const ctx = this.ctx, pl = ctx.player; if (!this.ready || !pl) return;
    dt = Math.min(dt, 0.1); this.t += dt; this.syncPlayer();
    const P = this.player, cam = ctx.camera;
    cam.updateMatrixWorld(); this._pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this._frustum.setFromProjectionMatrix(this._pv);
    this._rebuildGrid();
    const tick = this.t >= this.clockT; if (tick) this.clockT = this.t + 1;
    for (const n of this.npcs) {
      if (n.away) { if (tick) this.brain.tick(n, ctx.hour, this); continue; }
      n.dist = Math.hypot(n.st.x - P.x, n.st.z - P.z);
      n.tier = n.dist < TIER0 ? 0 : n.dist < TIER1 ? 1 : 2;
      n.accum += dt;
      const per = n.tier === 0 ? 0 : n.tier === 1 ? 0.05 : 0.2;
      if (n.accum >= per) { const sdt = Math.min(n.accum, 0.25); n.accum = 0; n.step(sdt, this); }
      this._syncView(n, dt);
      if (tick) this.brain.tick(n, ctx.hour, this);
    }
    this.talk.update(dt);
  }

  // ---- published API -------------------------------------------------------------------------------------------------------------
  describe(n, full = false) {
    const o = {
      id: n.id, name: n.name.full, display: n.display, persona: n.persona, bank: n.bank, role: n.roleLabel, char: n.charId, appearance: n.appearance, shop: n.shopName ?? null,
      age: n.age, gender: n.gender,
      x: +n.st.x.toFixed(2), y: +n.st.y.toFixed(2), z: +n.st.z.toFixed(2), ry: +n.ry.toFixed(2),
      mode: n.mode, act: n.act, visible: !!n.visible, away: !!n.away, dist: +(n.dist ?? 0).toFixed(1), tier: n.tier, clip: n.clipName,
    };
    if (full) Object.assign(o, { met: n.mem.met, maxStuck: +n.maxStuck.toFixed(1), stuckTotal: +n.stuckTotal.toFixed(1), unstuck: n.unstuckCount ?? 0, goal: n.goal ?? null, home: n.homePos });
    return o;
  }

  getStats() {
    let visible = 0, walking = 0, talking = 0, away = 0, maxStuck = 0, stuckTotal = 0, tiers = [0, 0, 0], tris = 0;
    for (const n of this.npcs) {
      if (n.away) { away++; continue; }
      if (n.visible) { visible++; tris += n.view?.meta?.tris ?? 0; }
      if (n.mode === 'walk') walking++; if (n.mode === 'talk') talking++;
      tiers[n.tier]++; maxStuck = Math.max(maxStuck, n.maxStuck); stuckTotal += n.stuckTotal;
    }
    const bank = countLines(), looks = new Set(this.npcs.map((n) => n.appearance)), chars = new Set(this.npcs.map((n) => n.charId)), personas = new Set(this.npcs.map((n) => n.persona));
    return {
      npcs: this.npcs.length, visible, walking, talking, away, tiers, maxStuck: +maxStuck.toFixed(1), stuckTotal: +stuckTotal.toFixed(1), tris, navNodes: this.nav?.size ?? 0, fallbackNav: !!this.nav?.fallback,
      landmarks: this.landmarks.length, appearances: looks.size, characters: chars.size, personas: personas.size, lines: bank.total, bankPersonas: bank.personas,
      speech: { ready: this.speech.ready, voices: this.speech.ranked.length, reason: this.speech.reason },
    };
  }

  nearestNpc(x = this.player.x, z = this.player.z) {
    let best = null, bd = 1e9;
    for (const n of this.npcs) { if (n.away) continue; const d = Math.hypot(n.st.x - x, n.st.z - z); if (d < bd) { bd = d; best = n; } }
    return best;
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
