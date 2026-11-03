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
import { Brain } from './brain.js';
import { Spots } from './spots.js';
import { Doors } from './doors.js';
import { Indoor } from './indoor.js';
import { Reactions } from './reactions.js';
import { Classroom } from './classroom.js';
import { Homelife } from './homelife.js';
import { pickArrivals } from './arrival.js';
import { blockAt, keeperBedH } from './schedule.js';
import { householdsOf } from '../interiors/household.js';
import { makeRng } from '../core/rng.js';

export const TIER0 = 28, TIER1 = 70;     // full-rate simulation / 20 Hz / 5 Hz
export const SEAT_TOP = 0.445;           // seat height the sit clips were authored for (people_build.py SEAT_TOP); a person on a higher or lower seat is moved up or down by the difference
const POCKET_CELLS = 150;                // a closed slot of up to 6 m2 (0.2 m cells) behind a counter is a keeper's post, not another room
const LOOK_CLEAR = 0.42;                 // lookPose: a bystander this near the line of sight (the aim capsule's 0.34 m radius plus a hand) is in the way (core/interact.js PERSON_R)
const AISLE = 0.8;                       // a keeper's post that _makeShops has to find lies at least this far from the way a customer walks in: a walker is pushed off a way that passes nearer a standing person (npc.js separation)
const SWEPT_R = 0.3;                     // waypoints: a body's width for a leg a lane offset made (npc.js BODY.radius 0.25 and a hand); physics.segmentBlocked tests the line alone, so a fence end 0.2 m off it passed
const SWEPT_STEP = 0.15;                 // metres between the places of a leg tried for that body
const PAVE_SPREAD = 0.4;                 // waypoints: a walker's own lane (0.55 to 1.25) moves them this fraction of itself across the pavement (0.9 m wide, 0.4 m of it a body's centre can use), so a street's walkers are not one file
const PAVE_STEPS = [1, 0.72, 0.5, 0.25, 0];   // waypoints: the fractions of a pavement lane tried while it is blocked: the road beside the kerb (a lamp post, a bin) first, the graph last
const LANE_STEPS = [1, 0.6, 0.3, 0];     // waypoints: the same for any other lane (a plaza node near its edge)
const SAME_LEVEL = 2.2;                  // near(): people this far apart in height are not neighbours (another floor of a building, the terrace above a street); the nurse upstairs pushed the patient below her off the way to the seat, and the patient stalled short of it
const FRONT = 0.96;                      // keeperFacing: a keeper idles within this many radians (55 degrees) of the direction to the door
const BEHIND = 1.9;                      // keeperFacing: ... unless the customers' spot lies more than this far (109 degrees) off the direction to the door: then he faces the door

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

/**
 * How a keeper stands at the post (R3-103). The first thing whoever walks in sees is his front, and the anchors authored for a counter, a stall or a bench face the customers' spot or the back wall:
 * 6 of the 28 keepers had their back to the door and 8 more stood side-on to it. A post whose facing is more than FRONT off the direction to the door (`doors`: the points just inside the doors a
 * visitor comes in by) is turned toward it, as far as it takes to be within FRONT of every door (the customers' side stays in front of him); a keeper whose customers lie behind that (`toward`, more
 * than BEHIND off the way to the doors: the counter stands against the wall, so he waits on its customer side, or the stall faces the back wall) simply faces the door. A door under 0.6 m from the
 * post has no direction to speak of.
 */
export function keeperFacing(ry, post, doors, toward = null) {
  const ds = (Array.isArray(doors) ? doors : doors ? [doors] : []).filter((d) => Math.hypot(d.x - post.x, d.z - post.z) >= 0.6);
  if (!ds.length) return ry;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), dir = (d) => Math.atan2(d.x - post.x, d.z - post.z);
  const mid = Math.atan2(ds.reduce((s, d) => s + Math.sin(dir(d)), 0), ds.reduce((s, d) => s + Math.cos(dir(d)), 0)), rel = ds.map((d) => wrap(dir(d) - mid));      // the way between the doors, and each door off it
  const lo = Math.max(...rel) - FRONT, hi = Math.min(...rel) + FRONT, f = wrap(ry - mid);                                                                     // the facings within FRONT of every door: [lo, hi] off `mid`
  if (f >= lo && f <= hi) return ry;
  if (lo > hi || (toward && Math.abs(wrap(mid - dir(toward))) > BEHIND)) return mid;
  return wrap(mid + (Math.abs(wrap(f - lo)) < Math.abs(wrap(f - hi)) ? lo : hi));
}

/** The nearest point (x, z) of any leg of the walks `routes` (each a list of points {x, z}) to `p`, and how far it is (d: Infinity without a walk). */
function nearOnRoutes(routes, p) {
  let best = { d: Infinity, x: p.x, z: p.z };
  for (const pts of routes) for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0, x = a.x + dx * t, z = a.z + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d < best.d) best = { d, x, z };
  }
  return best;
}
/** How far (x, z) is from the nearest leg of any of the walks `routes`; Infinity without one. */
const aisleOf = (routes, p) => nearOnRoutes(routes, p).d;

/**
 * Does a body `r` wide walking from a to b touch a wall or a prop on the way? physics.segmentBlocked tests the line alone (r = 0 is that rule: nothing is swept). The ends that are no lane point (a graph
 * node, the goal, where the walker stands: `movedA`, `movedB` say which are) are the world's own; nothing within a body of them counts, so a node beside a wall does not send its neighbours back to the graph.
 */
function bodyBlocked(ph, r, a, b, movedA = true, movedB = true) {
  if (!(r > 0) || !ph?._overlaps) return false;
  const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / SWEPT_STEP)), ya = a.y ?? b.y ?? 0, yb = b.y ?? ya;
  for (let i = 0; i <= n; i++) {
    const s = i / n, d = s * L;
    if ((!movedA && d < r) || (!movedB && L - d < r)) continue;
    if (ph._overlaps(a.x + (b.x - a.x) * s, a.z + (b.z - a.z) * s, ya + (yb - ya) * s, r, 1.5)) return true;
  }
  return false;
}

/**
 * Standing at (x, z) with the feet at y: is there ground under the person and under every point `m` metres round (a lane offset, a push from a neighbour or a
 * step must not take it over an edge)? Only a DROP counts (every surface there is more than 0.5 m below y); a higher surface is a bank or a wall and stops a walker.
 */
export function ledgeSafe(ph, x, z, y, m = 0.65) {
  if (!ph?.heightsAt) return true;
  const ground = (px, pz) => { const hs = ph.heightsAt(px, pz); if (!hs.length) return true; for (let i = 0; i < hs.length; i++) if (hs[i] >= y - 0.5) return true; return false; };
  if (!ground(x, z)) return false;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (!ground(x + Math.cos(a) * m, z + Math.sin(a) * m)) return false; }
  return true;
}

/**
 * May somebody stand at (x, z) with the feet at y, `r` metres of body clear: no wall or prop of the world within `r` (a tree trunk is a wall of its own thickness), the same level as y
 * (a step up or down is another place), and no drop beside it? What `Spots.fit` asks of a corner it moves.
 */
export function standClear(ph, x, z, y, r = 0.26) {
  if (ph?._overlaps?.(x, z, y, r, 1.5)) return false;
  if (ph?.groundAt && Math.abs(ph.groundAt(x, z, y + 0.8) - y) > 0.3) return false;
  return ledgeSafe(ph, x, z, y);
}

export class PeopleSim {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.npcs = []; this.byId = new Map();
    this.rng = makeRng(ctx.seed ?? 1).fork('people');
    this.physics = ctx.physics; this.brain = new Brain(this);
    this.player = { x: 0, y: 0, z: 0, yaw: 0, isPlayer: true };
    this.nav = null; this.landmarks = []; this.comp = null; this.mainComp = 0; this.spots = null; this.doors = null; this.indoor = null; this.lots = null; this._reach = new Map(); this._fp = null;
    this.shops = new Map(); this.cast = []; this.reactions = null; this.classroom = null; this.homelife = null;
    this._grid = new Map(); this._near = []; this._cs = 3; this.clockT = 0; this._later = [];
    this.simVisible = true;          // Node tests: "visible" = within 35 m of the player (the world replaces this with the camera frustum)
    this.faults = [];                // exceptions caught in the frame loop (one bad person must not stop the barrio); tests assert it stays empty
    this.ready = false;
  }

  get hour() { return this.ctx.hour ?? 12; }
  inMain(i) { return this.comp ? this.comp[i] === this.mainComp : true; }
  /** Is a prop or a wall standing on (x, z) at the floor level y, as a body (the width of a leaner) would find it? */
  _solidAt(x, z, y) { return !!this.physics?._overlaps?.(x, z, y, 0.25, 1.5); }

  /**
   * Is there a way to the outdoor place `s`? A walker ends at the node nearest it (brain.goPoint) and goes straight on: false when a wall as tall as a fence (or a room wall) stands across that last leg,
   * or, for a lean spot (which `Spots.fit` has slid off what it could), a prop still stands on the place itself, or a low wall (a prop) stands across the leg and a walker sent over it never gets there
   * (`_walkerReaches`). A place with no node in range is kept: goPoint refuses it as before.
   */
  wayTo(s) {
    if (s.kind === 'lean' && this._solidAt(s.x, s.z, s.y)) return false;
    const nav = this.nav, to = nav.nearest(s.x, s.z, 16, s.y);
    if (to < 0) return true;
    const N = nav.nodes[to], ph = this.physics, y = Math.min(N.y, s.y);
    if (ph?.segmentBlocked?.(N.x, N.z, s.x, s.z, y, 1.6, null, 2.0)) return false;
    return !ph?.segmentBlocked?.(N.x, N.z, s.x, s.z, y, 1.6, null, 0) || this._walkerReaches(N, s);       // (a low wall across the last leg: the line cannot say whether a walker gets round it, so a walker is asked)
  }

  /**
   * Does a walker get from node `a` to the place `b` over the ground alone (the world's colliders, nobody else about)? A prop across the last leg is no fence, and the walker slides round the end of a
   * bench's support with a step aside; one that stands square across the goal it does not get round: it slides to and fro in front of it until `unstick` (the lean place of the lot L10 stands 0.6 m
   * behind a 1.23 m planter: n59 was held for two minutes, and a walker sent there from the nearest node never arrived in 24 tries of 40 s). So the real walker (npc.js: its sidestep, its way back) is sent,
   * up to four times with a different roll of its sidestep, 30 s each (a try that needs `unstick` has failed); the place has a way when one of them arrives. Only the places a low wall crosses are asked
   * (a handful in all), so the build does not wait for it.
   */
  _walkerReaches(a, b) {
    const ph = this.physics; if (!ph?.move) return true;
    let arrived = false, stuck = false;
    const w = { t: 0, physics: ph, near: () => [], doors: null, brain: { next() {}, unstick() { stuck = true; } } };
    for (let k = 0; k < 4; k++) {
      const npc = new Npc({ id: 'probe', rng: makeRng(k + 1).fork('probe') });
      npc.place(a.x, a.y ?? b.y ?? 0, a.z, 0); stuck = false;
      npc.walk(w, [{ x: b.x, y: b.y ?? a.y ?? 0, z: b.z }], () => { arrived = true; }, 1.3);
      for (let t = 0; t < 30 && !arrived && !stuck; t += 0.05) { npc.step(0.05, w); w.t += 0.05; }
      if (arrived) return true;
    }
    return false;
  }
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
    this.spotsMoved = this.spots.fit((x, z, s, r) => standClear(this.physics, x, z, s.y, r), undefined, (x, z, s) => this._solidAt(x, z, s.y));        // the corners the props landed on (the page builds the people after the props)
    this.spotsCut = this.spots.screen((s) => this.wayTo(s));                                           // the places the fence of the court shuts off from the street graph
    this.doors = new Doors(this); this.indoor = new Indoor(this); this.reactions = new Reactions(this);
    this._indexLots(plan); this._makeShops(plan); this.classroom = new Classroom(this); this.homelife = new Homelife(this);
    const cast = this.cast = planCast({ plan, charMetas, rng: this.rng.fork('cast'), count, households: this._households(plan) });
    const mainNodes = nav.nodes.filter((nd) => this.inMain(nd.i)), sp = plan.spawn ?? { x: 0, z: 0 };
    const sites = plan.lots.filter((l) => l.kind === 'unfinished'); let obreros = 0;
    const bench = plan.lots.find((l) => l.kind === 'workshop'); if (bench) sites.unshift(bench);       // the first workman is at the bench of the workshop, the rest on the building sites
    for (let i = 0; i < cast.length; i++) {
      const npc = this._makeNpc(cast[i], charMetas.get(cast[i].charId), mainNodes);
      if (npc.persona === 'obrero' && sites.length) npc.siteLotId = sites[obreros++ % sites.length].id;
      this.npcs.push(npc); this.byId.set(npc.id, npc);
    }
    // the first frame of the day: everybody where they would be at this hour; four of them in the fan the player looks along (one walking away, one standing, two talking) and a fifth within
    // sight of the arrival point, so the middle distance of the first frame is alive at once (arrival.js: A5's hero-shot order)
    this._rebuildGrid();
    const arrivals = pickArrivals(this.npcs, this.hour, blockAt, sp);
    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i];
      this.placeNpc(n, n.homePos.x, n.homePos.z, n.homePos.y, 0);
      n.dist = dist2d(n.st, sp);
      this.brain.start(n, arrivals.get(n) ?? null);
      this.onNpcCreated?.(n);
    }
    this.ready = true;
    return true;
  }

  /**
   * Map<lotId, hh[]>: the interiors' households of every lot (bp.interior.hh once the building is furnished, else replayed from the seed without furnishing it: the same households
   * either way), so a resident carries the name of the member of the household they live in and a diary that says "Camila" is about the girl who lives there.
   */
  _households(plan) {
    const out = new Map(), B = this.ctx.buildings;
    if (!B?.get) return out;
    for (const lot of plan.lots ?? []) {
      const bp = B.get(lot.id); if (!bp) continue;
      try { const hhs = bp.interior?.hh ?? householdsOf(this.ctx, bp); if (hhs?.length) out.set(lot.id, hhs); } catch (e) { this._fault(null, e); }
    }
    return out;
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
    npc.household = c.household ?? null;       // { id, role, lot, matched }: which household of js/interiors/household.js this person is a member of (null: none known)
    npc.homeNode = homeNode; npc.homePos = { x: hx, y: hy ?? plan.heightAt?.(hx, hz) ?? 0, z: hz };
    npc.routine = p.routine; npc.jit = [r.next(), r.next(), r.next()];
    npc.idleVariant = r.chance(0.5) ? 'idle_a' : 'idle_b';
    const shop = !!shopLot;
    npc.riseH = (shop ? 5.8 : age === 'kid' ? 6.4 : 5.0) + r.next() * 1.3;
    const u = r.next();
    npc.bedH = shop ? keeperBedH(npc, u) : (age === 'kid' ? 20.6 : age === 'teen' ? 22.8 : age === 'elder' ? 21.4 : 21.8) + u * 1.6;
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
      const counters = S.inside(lot.id, 'counter'); let custs = S.inside(lot.id, 'customer');
      let post = null, beyond = null;
      const c0 = counters.find((a) => (a.tags ?? []).includes('shopkeeper')) ?? counters[0];
      if (c0) post = { x: c0.x, y: c0.y, z: c0.z, ry: c0.ry };
      if (!post && custs[0]) {              // the keeper stands where the customer faces: 1.7 m beyond the customer along its facing, at the counter's far side
        const a = custs[0], fx = Math.sin(a.ry), fz = Math.cos(a.ry), sameRoom = this._sameRoom(lot.id, a);
        for (const d of [1.7, 1.6, 1.8, 1.5, 1.9]) {
          const x = a.x + fx * d, z = a.z + fz * d;
          if (!sameRoom(x, z) || this._inFurniture(lot.id, x, z, a.y)) { beyond ??= { x, y: a.y, z, ry: a.ry + Math.PI }; continue; }        // a counter against a wall has no far side: the point is in the stairwell, the entry hall next door or the street (L52, L31, L19, L41, L20), or in the counter itself, which tables stand up to (L14: R3-204)
          if (!free(x, z, a.y)) continue;
          post = { x, y: a.y, z, ry: a.ry + Math.PI }; break;
        }
        if (!post) post = beyond;           // the far side is in another room or in the counter: the keeper stands in the customers' room, nearest to it (found below)
      }
      if (!post) { const v = S.inside(lot.id, 'vend')[0] ?? S.inside(lot.id, 'work')[0]; if (v) post = { x: v.x, y: v.y, z: v.z, ry: v.ry }; }          // a stall or a workbench inside; never a street spot outside (the keeper would be out of the shop)
      if (!post && ent?.inside) {           // last resort: just inside the door, facing the street
        const dx = ent.inside.x - ent.outside.x, dz = ent.inside.z - ent.outside.z, l = Math.hypot(dx, dz) || 1;
        post = { x: ent.inside.x + (dx / l) * 1.0, y: ent.inside.y, z: ent.inside.z + (dz / l) * 1.0, ry: Math.atan2(-dx, -dz) };
      }
      if (!post) continue;
      // the keeper must stand on flat floor (not in the stairwell of the house above the shop) and be able to walk to the door, a customer to the counter:
      // a post that fails is moved to the nearest spot that does not; a closed slot behind the counter stays the post but the keeper never leaves it (`sealed`)
      let sealed = false;
      const reach = ent?.inside ? this.reach(ent) : null;
      if (reach) {
        const y = ent.inside.y, flat = (p) => Indoor.flat(ph, p.x, p.z, y) && this.lotAt(p.x, p.z) === lot.id;      // on flat floor INSIDE the building
        custs = custs.filter((a) => flat(a) && this.indoor.canReach(reach, a));
        const routes = custs.map((a) => [ent.inside, ...this.indoor.route(lot.id, ent.inside, a, y)]);          // the way each customer walks in: a post found below is off it (a customer pushed off a 1 m aisle by the keeper stood against the counter for ever, L61)
        const flatPost = flat(post), inBox = this._inFurniture(lot.id, post.x, post.z, post.y), inFurniture = inBox || !!ph._overlaps?.(post.x, post.z, post.y, 0.25, 1.5);      // (a post on the seamstress's chair: the walker is pushed off the chair's outline for ever, L31)
        if (post === beyond || !flatPost || inFurniture || !this.indoor.canReach(reach, post)) {
          const own = flatPost && post !== beyond && !inBox ? this.indoor.reachable(lot.id, post, y) : null;         // the pocket the post sits in (the inside of a counter is no slot behind it: R3-204)
          if (own && own.count <= POCKET_CELLS) sealed = true;                                      // a slot behind the counter, closed on all sides: the keeper is placed there and stays
          else {
            const alt = this._reachablePost(lot.id, reach, post, custs, y, routes);
            if (alt) post = alt;
            else post = { x: ent.inside.x, y, z: ent.inside.z, ry: Math.atan2(ent.outside.x - ent.inside.x, ent.outside.z - ent.inside.z) };       // last resort: just inside the door, facing the street
          }
        }
      }
      if (custs[0] && dist2d(custs[0], post) <= 3.6) {              // a keeper faces the customers, whichever way the stall or the counter anchor was authored (L03's vend anchor faced 84 degrees off the first customer spot)
        const want = Math.atan2(custs[0].x - post.x, custs[0].z - post.z), off = Math.atan2(Math.sin(want - post.ry), Math.cos(want - post.ry));
        if (Math.abs(off) > 0.6) post = { ...post, ry: want };
      }
      const first = this.ctx.buildings?.get?.(lot.id)?.entrances?.[0], doors = ent?.inside ? [ent.inside] : [];                                       // the shop's door, and the building's first when it is another (L11: the workshop's shutter and its door)
      if (first?.inside && first.kind !== 'roof' && doors.length && Math.abs(first.inside[1] - ent.inside.y) < 1.2 && Math.hypot(first.inside[0] - ent.inside.x, first.inside[2] - ent.inside.z) > 0.5) doors.push({ x: first.inside[0], z: first.inside[2] });
      post = { ...post, ry: keeperFacing(post.ry, post, doors, custs[0] && dist2d(custs[0], post) <= 3.6 ? custs[0] : null) };          // and never with his back to the door or side-on to it (R3-103)
      let cpoint = custs[0] ? { x: custs[0].x, y: custs[0].y, z: custs[0].z, ry: custs[0].ry } : null;
      if (!cpoint && ent?.inside) cpoint = { x: ent.inside.x, y: ent.inside.y, z: ent.inside.z, ry: post.ry + Math.PI };
      this.shops.set(lot.id, { lot: lot.id, type: lot.shop, name: lot.name, open: false, keeper: null, post, cust: custs, cpoint: cpoint ?? post, ent, sealed });
    }
  }

  /** The region of a building a person coming in at entrance `ent` can walk to (cached): see indoor.js. */
  reach(ent) {
    const key = ent.lot + '|' + ent.id; let r = this._reach.get(key);
    if (r === undefined) { r = this.indoor.reachable(ent.lot, ent.inside, ent.inside.y); this._reach.set(key, r); }
    return r;
  }
  canReach(ent, p) { return !ent?.inside || this.indoor.canReach(this.reach(ent), p); }

  /**
   * The room of lot `lotId` that holds (x, z) at the floor level y: its id, null for a point that is in no room (inside a wall, in another storey), undefined when the building has no
   * plan to say. A room is its clear interior rectangle (contract: Room.rect, in the building's own frame), so a point a wall's thickness away is in the next room, not this one.
   */
  _roomAt(lotId, x, z, y) {
    const bp = this.ctx.buildings?.get?.(lotId); if (!bp?.rooms?.length || !bp.floors?.length || !bp.frame?.toLocal) return undefined;
    const top = bp.lot?.y ?? 0; let fl = bp.floors[0];
    for (const F of bp.floors) if (Math.abs((F.y ?? 0) + top - y) < Math.abs((fl.y ?? 0) + top - y)) fl = F;
    const [lx, , lz] = bp.frame.toLocal(x, y, z), e = 0.001;
    return bp.rooms.find((q) => q.floor === fl.index && lx >= q.rect.x0 - e && lx <= q.rect.x1 + e && lz >= q.rect.z0 - e && lz <= q.rect.z1 + e)?.id ?? null;
  }

  /** (x, z) -> is it in the room that holds the place `a` (every point is, when the building has no plan or `a` is in no room: no judgement)? */
  _sameRoom(lotId, a) {
    const room = this._roomAt(lotId, a.x, a.z, a.y);
    return room ? (x, z) => this._roomAt(lotId, x, z, a.y) === room : () => true;
  }

  /**
   * Is (x, z) at floor height y inside the footprint of a piece of furniture that blocks (a counter, a table, a bed)? The colliders of the furniture are the OUTLINES of those footprints
   * (interiors/index.js: wallsRect), so physics._overlaps feels a point only within a body's width of an edge: the middle of the 0.65 m counter of L14 is 0.33 m from both, and a keeper
   * "1.7 m beyond the customer" stood in it, sealed in for ever, with only her head above the top (R3-204). The footprints are the records of bp.furniture, laid as the colliders are.
   */
  _inFurniture(lotId, x, z, y) {
    const bp = this.ctx.buildings?.get?.(lotId), room = this._roomAt(lotId, x, z, y);
    if (!room || !bp?.furniture?.length || !bp.frame?.toWorld) return false;                  // in no room (a wall, a doorway), or no plan: no judgement
    const rotY = bp.lot?.rotY ?? 0;
    for (const r of bp.furniture) {
      if (r.room !== room || !r.block || r.kind !== 'floor') continue;
      const [cx, , cz] = bp.frame.toWorld(r.x, 0, r.z), a = rotY + r.ry, c = Math.cos(a), s = Math.sin(a), dx = x - cx, dz = z - cz;
      if (Math.abs(dx * c - dz * s) <= Math.max(r.w, 0.1) / 2 && Math.abs(dx * s + dz * c) <= Math.max(r.d, 0.1) / 2) return true;
    }
    return false;
  }

  /**
   * The nearest spot to `ideal` (a ring search, 0.5 to 3.5 m) on flat floor that the door can reach and that is 1.1 m clear of every customer spot, facing the first.
   * The room of the customers (no door in between) comes first, then, given the walks the customers make in (`routes`), a spot AISLE m off them; when the ring has none (the 1.5 m wide dining room of
   * L14: the strip that is both AISLE m off the walk and 0.26 m off the wall is a few centimetres wide, and the ring's points miss it, R3-204) the nearest spot is slid away from the walk, as far as
   * it takes and the floor lets it. Null when the building offers none.
   */
  _reachablePost(lotId, reach, ideal, custs, y, routes = null) {
    const ph = this.physics, face = custs[0] ?? null, room = face ? this.indoor.reachable(lotId, face, y, false) : null, sameRoom = face ? this._sameRoom(lotId, face) : () => true;
    const post = (x, z) => ({ x, y, z, ry: face ? Math.atan2(face.x - x, face.z - z) : ideal.ry });
    for (const within of room ? [room, null] : [null]) for (const aisle of routes?.length ? [AISLE, 0] : [0]) {
      const ok = (x, z) => !ph._overlaps?.(x, z, y, 0.26, 1.5) && Indoor.flat(ph, x, z, y) && this.lotAt(x, z) === lotId && this.indoor.canReach(reach, { x, z })
        && (!within || (this.indoor.canReach(within, { x, z }) && sameRoom(x, z))) && !custs.some((c) => Math.hypot(x - c.x, z - c.z) < 1.1);
      let best = null, bs = 1e9;
      for (let r = 0.5; r <= 3.5; r += 0.3) for (let a = 0; a < 24; a++) {
        const th = (a / 24) * Math.PI * 2, x = ideal.x + Math.cos(th) * r, z = ideal.z + Math.sin(th) * r;
        if (!ok(x, z) || (aisle && aisleOf(routes, { x, z }) < aisle)) continue;
        const dc = face ? Math.hypot(x - face.x, z - face.z) : 1.7, score = r + Math.abs(dc - 1.7) * 0.5;
        if (score < bs) { bs = score; best = post(x, z); }
      }
      if (best && !aisle && routes?.length && aisleOf(routes, best) < AISLE) {       // (no spot AISLE m off the walks on the ring: slide the best one off them)
        const q = nearOnRoutes(routes, best), ux = (best.x - q.x) / (q.d || 1), uz = (best.z - q.z) / (q.d || 1);
        for (let s = AISLE - q.d + 0.005; s <= AISLE - q.d + 0.3 && q.d > 1e-6; s += 0.01) {
          const x = best.x + ux * s, z = best.z + uz * s;
          if (ok(x, z) && aisleOf(routes, { x, z }) >= AISLE) { best = post(x, z); break; }
        }
      }
      if (best) return best;
    }
    return null;
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

  /** The lot whose building footprint holds (x, z), or null: is somebody indoors? (recovery must not send a person over the street graph from inside a shop) */
  lotAt(x, z) {
    if (!this._fp) {
      this._fp = [];
      for (const [id, bp] of this.ctx.buildings ?? []) {
        const fp = bp?.footprint; if (!fp?.length) continue;
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const [px, pz] of fp) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
        this._fp.push({ id, fp, x0, x1, z0, z1 });
      }
    }
    for (const b of this._fp) {
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      let c = false;
      for (let i = 0, j = b.fp.length - 1; i < b.fp.length; j = i++) {
        const [ax, az] = b.fp[i], [bx, bz] = b.fp[j];
        if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
      }
      if (c) return b.id;
    }
    return null;
  }

  /** May this person be moved without anybody noticing (not in view, not close)? */
  canSnap(n) { return !n.visible && (n.dist ?? 1e9) > 25; }
  /** Is this point out of the player's sight (the world refines this with the camera frustum)? */
  unseen(p) { return dist2d(p, this.player) > 30; }

  // hooks: the world (views, prompts) overrides them; under Node they do nothing
  onNpcCreated(n) { /* world: make the view and the prompt */ }
  syncNpc(n, dt) { /* world: pose the view */ }
  onAway(n, away) { /* world: hide or show the view */ }
  beforeStep(dt) { /* world: frustum */ }
  afterStep(dt) { /* world: dialogue */ }
  /** Is the player in a conversation (the world answers from the dialogue; a reaction never talks over one)? */
  get talkBusy() { return false; }
  /** A resident noticed the player opening a container and says `line` ({ es, en, pool, hold }): the world shows the subtitle and speaks it; under Node reactions.log has it. */
  onReact(n, line, ev) { /* world: subtitle + voice */ }

  /**
   * Graph path (node indices) -> waypoints with a "keep to your right" lane offset. On a street with a sidewalk (nodes with `pave`, world/nav.js) the lane is the middle of the pavement, on the right of the way
   * the walker goes, and a pavement lane that is blocked (a lamp post, a bin) steps down to the road beside the kerb, then towards the centre, one step at a time, before it gives up. A lane offset never leads over a drop, into a solid or across a wall: the offset point goes back towards its
   * node while it is over a drop or inside a cart, a planter or a trunk, and where the leg to or from it still crosses a wall (a bench beside the edge of the graph, whose end supports stand in
   * the lane: eight people a day were pushed against one for four seconds) the walker keeps to the graph itself, which the world has proved clear.
   * A leg also has to be wide enough for a body: the line alone cleared the end of a fence 0.2 m off it and the 0.4 m slot between two guard rails, and the walker stood against them.
   * `this.sweptR` (SWEPT_R unless set) is that body's width; 0 judges the line alone, as before (world-terrace.test.mjs sets it, to show what its two world fixes are worth).
   * `goal` ({ x, z, y }): where the walker goes on from the last point (brain.goPoint), so the last lane point is judged by the leg to it too (the end supports of a bench round the spot).
   */
  waypoints(npc, idx, goal = null) {
    const N = this.nav.nodes; let list = idx;
    if (list.length > 1) {                                       // already past the first node? start at the second
      const a = N[list[0]], b = N[list[1]], ex = b.x - a.x, ez = b.z - a.z;
      if ((npc.x - a.x) * ex + (npc.z - a.z) * ez > 0.5 * (ex * ex + ez * ez)) list = list.slice(1);
    }
    const out = [], nodes = [], moved = [], lanes = [];
    for (let k = 0; k < list.length; k++) {
      const nd = N[list[k]], p = N[list[Math.max(0, k - 1)]], q = N[list[Math.min(list.length - 1, k + 1)]];
      let tx = q.x - p.x, tz = q.z - p.z; const tl = Math.hypot(tx, tz);
      // a street with a sidewalk (nav `pave`): the lane is the middle of the pavement, a little off it by the walker's own lane; the yellow line is for crossing (R3-105: 80 % of the walkers on Calle del Sol kept to it)
      const pave = nd.pave != null && p.pave != null && q.pave != null && nd.kind !== 'stair';
      let off = nd.kind === 'stair' || p.kind === 'stair' || q.kind === 'stair' ? 0 : pave ? nd.pave + (npc.lane - 0.9) * PAVE_SPREAD : Math.min(npc.lane, Math.max(0, (nd.w ?? 2) - 0.9));
      if (tl < 1e-6) off = 0; else { tx /= tl; tz /= tl; }
      const room = (x, z) => ledgeSafe(this.physics, x, z, nd.y) && !this.physics?._overlaps?.(x, z, nd.y, 0.3, 1.5);
      // the fractions of the lane tried in turn while a point or a leg is no good: the pavement steps down to the road beside the kerb (a lamp post or a bin in the way) before it gives up the street's side; an ordinary lane tries 0.6, 0.3, the graph
      const L = { fr: pave ? PAVE_STEPS : LANE_STEPS, i: 0, at: (f) => ({ x: nd.x - tz * off * f, z: nd.z + tx * off * f }), room };
      let at = L.at(1);
      if (off > 0 && !room(at.x, at.z)) {                                     // a plaza node near its edge: the lane would put the walker over the drop (it fell 3 m and could not get back), or inside a vendor's cart, a planter, a trunk
        while (++L.i < L.fr.length) { at = L.at(L.fr[L.i]); if (L.fr[L.i] === 0 || room(at.x, at.z)) break; }
      }
      out.push({ x: at.x, z: at.z, y: nd.y }); nodes.push(nd); moved.push(at.x !== nd.x || at.z !== nd.z); lanes.push(off > 0 ? L : null);
    }
    const ph = this.physics;
    if (goal) { out.push({ x: goal.x, z: goal.z, y: goal.y ?? out[out.length - 1].y }); nodes.push(null); moved.push(false); }        // the leg to the goal is judged with the others
    if (ph?.segmentBlocked && moved.some(Boolean)) {                           // the legs a lane offset made: any across a wall, or too narrow for a body, goes back to the graph
      const r = this.sweptR ?? SWEPT_R;
      const crosses = (a, b, ma, mb) => ph.segmentBlocked(a.x, a.z, b.x, b.z, Math.min(a.y ?? b.y, b.y) + 0.2, 1.4) || bodyBlocked(ph, r, a, b, ma, mb);        // (the wall filter of physics.move: a top 0.4 m above the feet or more, a bottom under the head)
      const home = (k) => { out[k].x = nodes[k].x; out[k].z = nodes[k].z; moved[k] = false; };
      const lower = (k) => {                                                  // an ordinary lane goes back to the graph; a pavement lane one step at a time (to the road beside the kerb first)
        const L = lanes[k]; if (!L || L.fr === LANE_STEPS) return home(k);
        let to; do { to = L.at(L.fr[++L.i]); } while (L.i < L.fr.length - 1 && !L.room(to.x, to.z));
        out[k].x = to.x; out[k].z = to.z; moved[k] = L.fr[L.i] > 0;
      };
      const passes = lanes.some((L) => L && L.fr === PAVE_STEPS) ? 6 : 3;
      for (let pass = 0, changed = true; pass < passes && changed; pass++) {
        changed = false;
        for (let k = 0, prev = { x: npc.x, z: npc.z, y: npc.y }; k < out.length; prev = out[k++]) {
          if (!(moved[k] || (k > 0 && moved[k - 1])) || !crosses(prev, out[k], k > 0 && moved[k - 1], moved[k])) continue;
          if (moved[k]) { lower(k); changed = true; }
          if (k > 0 && moved[k - 1]) { lower(k - 1); changed = true; }
        }
      }
    }
    if (goal) out.pop();
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
      for (let k = 0; k < a.length; k++) { const o = a[k]; if (o !== npc && (o.st.x - s.x) ** 2 + (o.st.z - s.z) ** 2 < r2 && Math.abs(o.st.y - s.y) < SAME_LEVEL) out.push(o); }
    }
    const P = this.player; if ((P.x - s.x) ** 2 + (P.z - s.z) ** 2 < r2 && Math.abs(P.y - s.y) < SAME_LEVEL) out.push(P);
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
    try { this.doors?.update(); this._runLater(); this.classroom?.update(); this.homelife?.update(); } catch (e) { this._fault(null, e); }
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
    if (!this._faultSeen.has(msg)) {
      this._faultSeen.add(msg);
      try { (this.ctx.errors ??= []).push({ stage: 'people', npc: n?.id ?? null, message: msg, stack: rec.stack }); } catch { /* no error list */ }
      try { console.error('[people] ' + (n ? n.id + ': ' : '') + msg + '\n' + rec.stack); } catch { /* no console */ }
    }
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

  /** Where a person's eyes are as they are DRAWN now: standing, or lowered onto the seat they sit on (the sit clips rotate the limbs, the game lowers the root). */
  headOf(n) {
    const m = n.meta ?? {}, eye = m.eyeHeightM ?? 1.55;
    if (n.lieH != null) { const len = (m.heightM ?? 1.7) / 2; return { x: n.st.x - Math.sin(n.ry) * len, y: n.st.y + n.lieH + 0.25, z: n.st.z - Math.cos(n.ry) * len }; }       // asleep: the head at the head of the bed
    const up = n.sitH != null ? (n.sitH - SEAT_TOP) + (m.seatedEyeHeightM ?? eye - 0.24) : eye;
    return { x: n.st.x, y: n.st.y + up, z: n.st.z };
  }

  /**
   * Reviewer helper: where to stand, and where to look, to see the face of `id` (the nearest person when null) from about `o.dist` m (default 1.3).
   * Tries the front of the person first, then round them, nearer and farther; a place counts when it is ground at their level, clear of walls and furniture,
   * with headroom, and nothing solid (a room wall, a shut door) between the eyes and the face. A place with another person on the line of sight, or within a
   * body's width of the spot itself (two neighbours chatting face to face: the front of one is the back of the other), only counts when nothing better exists
   * (the crosshair would rest on the bystander, R3-003).
   * -> { ok: true, id, head:{x,y,z}, feet:{x,y,z}, eye, yaw, pitch, dist, bearing } with yaw/pitch in the player's convention (yaw 0 looks to -z), or { ok: false, reason }.
   */
  lookPose(id = null, o = {}) {
    const n = id ? this.byId.get(id) : this.nearestNpc();
    if (!n) return { ok: false, reason: id ? `no such person: ${id}` : 'nobody is about' };
    if (n.away) return { ok: false, reason: `${n.id} is indoors (${n.awayWhy ?? 'away'}) and not drawn`, id: n.id };
    const ph = this.physics, want = o.dist ?? 1.3, eye = o.eye ?? 1.64, head = this.headOf(n), ry = n.ry;
    const turns = [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9, Math.PI];                   // radians round the person, 0 = straight in front of them
    let crowded = null;                                                                       // the first place that works but has a bystander in the way
    for (const d of [want, want * 0.8, want * 0.62, want * 1.25, want * 1.45]) {
      for (const a of turns) {
        const x = head.x + Math.sin(ry + a) * d, z = head.z + Math.cos(ry + a) * d;
        let fy = null;                                                                          // the floor at the person's level, not the storey above or below
        for (const h of ph.heightsAt(x, z)) if (Math.abs(h - n.st.y) <= 0.6 && (fy == null || Math.abs(h - n.st.y) < Math.abs(fy - n.st.y))) fy = h;
        if (fy == null) continue;
        if (ph._overlaps?.(x, z, fy, 0.3, 1.78) || (ph.canStand && !ph.canStand(x, z, fy))) continue;
        const y0 = Math.min(fy, n.st.y);
        if (ph.segmentBlocked(x, z, head.x, head.z, y0, Math.max(fy + eye, head.y) - y0 + 0.05, null, 1.5)) continue;
        const dx = head.x - x, dz = head.z - z, h = Math.hypot(dx, dz);
        const pose = { ok: true, id: n.id, head, feet: { x, y: fy, z }, eye: fy + eye, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(head.y - (fy + eye), h), dist: +h.toFixed(2), bearing: a };
        if (this._bystander(n, x, z, head)) { crowded ??= pose; continue; }
        return pose;
      }
    }
    if (crowded) return crowded;
    return { ok: false, reason: `no clear place to stand within ${(want * 1.45).toFixed(1)} m of ${n.id}`, id: n.id };
  }

  /**
   * True when, standing at (x, z) and looking at `head`, the body of another person (a disc of LOOK_CLEAR m) is entered before the body of `n` (by more than 5 cm), or the player
   * would stand inside it. Someone behind `n`, beside them, or behind the player is no obstacle; someone exactly where `n` is (two children on the same spot of the
   * court) is entered at the same distance, so not in the way either: no place can tell them apart.
   */
  _bystander(n, x, z, head) {
    const dx = head.x - x, dz = head.z - z, L = Math.hypot(dx, dz) || 1e-9, ux = dx / L, uz = dz / L, R2 = LOOK_CLEAR * LOOK_CLEAR;
    for (const m of this.npcs) {
      if (m === n || m.away || Math.abs(m.st.y - n.st.y) > 1.2) continue;
      const px = m.st.x - x, pz = m.st.z - z, s = px * ux + pz * uz, lat = px * uz - pz * ux;
      if (lat * lat >= R2) continue;
      const half = Math.sqrt(R2 - lat * lat);                                                 // the line crosses their disc between s - half and s + half
      if (s + half > 0 && Math.max(0, s - half) < L - LOOK_CLEAR - 0.05) return true;
    }
    return false;
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
    return { npcs: this.npcs.length, walking, talking, away, indoors: this.homelife?.drawn.size ?? 0, tiers, maxStuck: +maxStuck.toFixed(1), stuckTotal: +stuckTotal.toFixed(1), unstuck, acts, blocks, shops: this.shops.size, shopsOpen: open,
      doorRequests: this.doors?.requests ?? 0, faults: this.faults.length, navNodes: this.nav?.size ?? 0, fallbackNav: !!this.nav?.fallback, landmarks: this.landmarks.length };
  }
}
