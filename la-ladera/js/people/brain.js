// NPC decision making (no THREE, no DOM): what everybody is doing at this hour, how they get there, how they go through doors, and how they recover.
//
// The day is cut into blocks (schedule.js): sleep / school / work / free. `start` puts everybody where they plausibly are at the first frame, `tick` (1 Hz)
// notices a change of block (the clock, or the player moving the time slider), `next` is called when an idle task ends and picks the next activity.
//
// Activities (`do_<name>(npc, o)` returns true when it started something): wander errand sweep lean bench chat court greet stand phone pray.
// Places come from `spots.js` (outdoor POIs of the plan + indoor anchors of the interiors); doors from `doors.js`; every walk goes over the nav graph and
// ends on the exact spot. Away = hidden inside a building (asleep, at school, on duty); they come out through the same door the next block.
import { blockAt, freeChoices, nearPrayer } from './schedule.js';
import { twinWeight, spreadNodes, isTwin, slotAt, refOf, SLOT_R, TWIN_SLOT_R } from './twins.js';
import { ahead, ARRIVAL_BANDS } from './arrival.js';

const pickW = (rng, list) => { let t = 0; for (const [, w] of list) t += w; let r = rng.next() * t; for (const [v, w] of list) { r -= w; if (r <= 0) return v; } return list[list.length - 1][0]; };
const span = (rng, a, b) => a + rng.next() * (b - a);
const yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const RADIUS = { shopkeeper: 18, elder: 55, kid: 90, teen: 110, homemaker: 90, neighbour: 120, worker: 60 };
const HIDDEN_WORK = new Set(['enfermera']);

export class Brain {
  constructor(world) { this.w = world; }

  awakeAt(npc, hour) { const h = hour; return h >= npc.riseH && h < npc.bedH; }

  speedFor(npc, o = {}) {
    const k = npc.speedBase * (0.93 + npc.rng.next() * 0.14);
    if (o.run) return Math.max(2.1, npc.speedBase * 1.85);
    if (o.hurry) return k * 1.35;
    if (o.slow) return k * 0.85;
    if (npc.age === 'kid' && npc.rng.chance(0.35)) return k * 1.5;
    return k;
  }

  // ---- the first frame --------------------------------------------------------------------------------------------------------------------------
  /** Put `npc` where he or she would be at this hour. `near` = { x, z, min, max }: keep this one within view range of the arrival point. */
  start(npc, near = null) {
    const W = this.w, blk = blockAt(npc, W.hour); npc.block = blk;
    if (blk === 'sleep') return this.hideAway(npc, npc.homeLotId, 'sleep');
    if (npc.routine === 'shopkeeper' && blk === 'free') return this.hideAway(npc, npc.homeLotId, 'home');       // the shop is shut: upstairs, up and about
    if (blk === 'school') return this.hideAway(npc, W.lots.school, 'school');
    if (blk === 'work' && this.startWork(npc, { instant: true, near })) return true;
    return this.leisure(npc, { instant: true, near });
  }

  // ---- the next thing --------------------------------------------------------------------------------------------------------------------------
  /** An idle task ended (no continuation): choose what comes next for the current block. */
  next(npc) {
    const W = this.w;
    this.finish(npc);
    if (npc.away) return;
    const blk = blockAt(npc, W.hour); npc.block = blk;
    if (npc.routine === 'shopkeeper' && blk !== 'work') return this.closeShop(npc);
    if (blk === 'sleep') return this.goHome(npc);
    if (blk === 'school') return this.goIn(npc, W.lots.school, 'school');
    if (blk === 'work') return this.work(npc);
    return this.leisure(npc);
  }

  /** Release everything the finished activity held. */
  finish(npc) {
    const W = this.w;
    this.endConvo(npc);
    if (npc.spot) { if (npc.spot.waiting === npc.id) npc.spot.waiting = null; npc.lastSpot = npc.spot; npc.spot = null; }
    W.spots.release(npc);
    npc.sitH = null; npc.lieH = null; npc.scene = null; npc.prop = null; npc.carry = false; npc.greet = false; npc.waveUntil = 0; npc.then = null;
  }

  leisure(npc, o = {}) {
    const W = this.w, cool = W.t < (npc.stayCool ?? 0), bag = freeChoices(npc, W.hour).filter(([a]) => !cool || (a !== 'home' && a !== 'clinic' && a !== 'hall'));       // out of a stay a while ago: not straight back in
    if (o.near?.role && this['arrive_' + o.near.role]?.(npc, o)) { npc.activity = 'arrive'; return true; }          // the first frame: the part this person plays in the arrival view (arrival.js)
    for (let k = 0; k < 4 && bag.length; k++) {
      const a = pickW(npc.rng, bag); bag.splice(bag.findIndex(([n]) => n === a), 1);
      if (this['do_' + a]?.(npc, o)) { npc.activity = a; return true; }
    }
    if (this.do_wander(npc, o)) { npc.activity = 'wander'; return true; }
    npc.stand(W, 'idle', span(npc.rng, 3, 8), npc.ry + (npc.rng.next() - 0.5));
    return true;
  }

  work(npc, o = {}) {
    switch (npc.persona) {
      case 'obrero': return this.siteWork(npc, o);
      case 'mototaxista': return this.motoWait(npc, o);
      case 'ambulante': return this.sellRoute(npc, o);
      case 'enfermera': return this.goIn(npc, this.w.lots.clinic, 'work');
      default: if (npc.routine === 'shopkeeper') return this.atPost(npc); return this.leisure(npc, o);
    }
  }

  startWork(npc, o = {}) {
    const W = this.w;
    if (npc.routine === 'shopkeeper') return this.openShop(npc, o);
    if (HIDDEN_WORK.has(npc.persona)) { if (o.instant || W.canSnap(npc)) { this.hideAway(npc, W.lots.clinic, 'work'); return true; } return this.goIn(npc, W.lots.clinic, 'work'); }
    return this.work(npc, o);
  }

  // ---- movement helpers ------------------------------------------------------------------------------------------------------------------------
  /** Walk to point p {x,y,z} over the graph, then straight to p. */
  goPoint(npc, p, arrive, o = {}) {
    const W = this.w, nav = W.nav;
    const from = nav.nearest(npc.x, npc.z, 40, npc.y), to = nav.nearest(p.x, p.z, o.snapD ?? 16, p.y);
    if (from < 0 || to < 0 || !W.inMain(to)) return false;
    const idx = nav.path(from, to); if (!idx) { npc.pathFails = (npc.pathFails ?? 0) + 1; return false; }
    const pts = W.waypoints(npc, idx, p); pts.push({ x: p.x, z: p.z, y: p.y });         // (the leg to p is judged with the lane's: the end supports of a bench round the spot)
    return npc.walk(W, pts, arrive, this.speedFor(npc, o));
  }

  /** Waypoints over the street graph from point `a` (a step outside a door) to point `b`, ending on `b`; null when the graph has no way. */
  streetLeg(npc, a, b, snapD = 16) {
    const W = this.w, nav = W.nav, from = nav.nearest(a.x, a.z, 10, a.y), to = nav.nearest(b.x, b.z, snapD, b.y);
    if (from < 0 || to < 0 || !W.inMain(from) || !W.inMain(to)) return null;
    const idx = from === to ? [from] : nav.path(from, to); if (!idx) return null;
    const pts = W.waypoints({ x: a.x, z: a.z, lane: npc.lane }, idx, b); pts.push({ x: b.x, z: b.z, y: b.y });
    return pts;
  }

  /** Go to a spot of the registry, claim it, run `arrive(npc, w)` on it. o.instant: place straight on it (first frame). Fails (and claims nothing) when unreachable. */
  toSpot(npc, spot, arrive, o = {}) {
    const W = this.w;
    if (!spot) return false;
    const at = this.slotOn(npc, spot);
    if (o.instant) { W.spots.claim(spot, npc); npc.spot = spot; W.placeNpc(npc, at.x, at.z, spot.y, spot.ry); arrive(npc, W); return true; }
    if (!this.goPoint(npc, { x: at.x, y: spot.y, z: at.z }, arrive, o)) return false;
    W.spots.claim(spot, npc); npc.spot = spot;
    return true;
  }

  /** Where on `spot` this person stands: the spot itself, or (a place several share: the court, a corner) a point of its ring clear of whoever is already there, on a wider ring when one of them is the same character. A chat spot places its pair itself. */
  slotOn(npc, spot) {
    if ((spot.cap ?? 1) < 2 || spot.kind === 'chat') return spot;
    const W = this.w, others = []; let twin = false;
    for (const id of spot.occ) { const m = id === npc.id ? null : W.byId.get(id); if (m && !m.away) { others.push(refOf(m)); twin ||= isTwin(npc, m); } }
    return slotAt(spot, others, (p) => !W.physics?._overlaps?.(p.x, p.z, spot.y, 0.26, 1.5), twin ? TWIN_SLOT_R : SLOT_R, twin ? 8 : 6);
  }

  /** A place of `kind` for `npc`: nearer ones likelier, and one beside somebody drawn from the same character (twins.js) far less likely, so no clone stands next to its twin. */
  pickSpot(npc, kind, o = {}, f = {}) {
    const W = this.w, ref = o.near ?? npc;
    return W.spots.pick(kind, ref.x, ref.z, npc.rng, {
      indoor: false, maxD: o.near ? Math.min(f.maxD ?? 1e9, o.near.max) : (f.maxD ?? 90), half: f.half, tag: f.tag, weight: (s) => twinWeight(npc, s, W.npcs ?? []),
      filter: (s) => s !== npc.lastSpot && (!o.near || ahead({ ...o.near, fan: o.near.fan ?? null, max: 1e9 }, s)) && (!f.filter || f.filter(s)),
    });
  }

  // ---- the first frame (arrival.js): the parts of the people who start in view of the player ---------------------------------------------------------------
  /** Nobody stands within 2.5 m of node `n` right now (spreadNodes looks at where people are going, so somebody who has just been put on the node and is walking off does not count there). */
  unoccupied(npc, n, r = 2.5) { return !(this.w.npcs ?? []).some((m) => m !== npc && !m.away && dist2d(m, n) < r); }
  /** The nodes of the fan for one part, clear of whoever is there: the part's own band of it (the two who talk 10-16 m ahead, the walker 16-24 m, the one who stands 24-30 m: nobody walks through another), else all of the fan. */
  fanNodes(npc, near, part) {
    const W = this.w, [a, b] = ARRIVAL_BANDS[part] ?? [0, 99], any = (n) => W.inMain(n.i) && n.kind !== 'door' && this.unoccupied(npc, n);
    const own = W.nav.nodes.filter((n) => any(n) && ahead({ ...near, min: near.min + a, max: Math.min(near.max, near.min + b) }, n));
    return own.length ? own : W.nav.nodes.filter((n) => any(n) && ahead(near, n));
  }
  /** Somebody walking away up the street: from a node of the fan to one beyond it, in the corridor the player looks along, so the figure is still on the street half a minute later. */
  arrive_walk(npc, o) {
    const W = this.w, r = npc.rng, nav = W.nav, near = o.near, ok = (n) => W.inMain(n.i) && n.kind !== 'door';
    const from = spreadNodes(npc, this.fanNodes(npc, near, 'walk'), W.npcs ?? []);
    const to = [45, 30, 20].map((min) => nav.nodes.filter((n) => ok(n) && ahead({ ...near, min, max: min + 40 }, n))).find((l) => l.length);
    if (!from.length || !to) return false;
    const a = from[Math.floor(r.next() * from.length)], b = to[Math.floor(r.next() * to.length)], idx = nav.path(a.i, b.i);
    if (!idx?.length) return false;
    W.placeNpc(npc, a.x, a.z, a.y, yawTo(a.x, a.z, b.x, b.z));
    return !!npc.walk(W, W.waypoints(npc, idx), (n) => this.idleHere(n), this.speedFor(npc));
  }
  /** A place to stand in the fan where nobody is: a node of the street graph, shifted a step or two to one side across the street (the view's perpendicular) so the middle of the street stays clear for the walker; the node itself when a wall or a post has the sides. */
  fanPlace(npc, o, part) {
    const W = this.w, near = o.near, r = npc.rng, f = near.fan ?? { x: 0, z: -1 };
    const nodes = spreadNodes(npc, this.fanNodes(npc, near, part), W.npcs ?? []);
    if (!nodes.length) return null;
    const nd = nodes[Math.floor(r.next() * nodes.length)], side = r.chance(0.5) ? 1 : -1;
    for (const off of [1.3 * side, -1.3 * side, 0.8 * side, -0.8 * side, 0]) {
      const p = { x: nd.x - f.z * off, z: nd.z + f.x * off, y: nd.y };
      if (!W.physics?._overlaps?.(p.x, p.z, p.y, 0.26, 1.5) && ahead(near, p)) return p;
    }
    return null;
  }
  /** Somebody standing in the middle distance: at a corner, against a wall, on the phone (the spots of the fan, if the plan has any), else on the street, side-on to the player. */
  arrive_stand(npc, o) {
    if (this.do_stand(npc, o) || this.do_phone(npc, o) || this.do_lean(npc, o)) return true;
    const W = this.w, r = npc.rng, p = this.fanPlace(npc, o, 'stand'); if (!p) return false;
    const f = o.near.fan ?? { x: 0, z: -1 }, s = r.chance(0.5) ? 1 : -1, face = yawTo(p.x, p.z, p.x - f.z * s, p.z + f.x * s);
    W.placeNpc(npc, p.x, p.z, p.y, face); npc.targetRy = face;
    npc.stand(W, pickW(r, [['phone', 3], ['idle', 3], ['wait', 2]]), span(r, 30, 90), face);
    return true;
  }
  /** Two talking: the first waits at a chat corner of the fan (a real one, or a corner of their own on the street), the second joins (never the same character) and the talk begins at once. */
  arrive_chat(npc, o) {
    const W = this.w, mine = this._arrivalChat, other = mine?.waiting ? W.byId.get(mine.waiting) : null;
    if (other && other.spot === mine && !other.away && !isTwin(npc, other)) { this._arrivalChat = null; W.placeNpc(npc, mine.x, mine.z, mine.y, mine.ry); return !!this.chatHere(npc, mine, o); }
    if (this.do_chat(npc, o)) return true;
    const p = this.fanPlace(npc, o, 'chat'); if (!p) return false;
    const f = o.near.fan ?? { x: 0, z: -1 }, spot = { kind: 'chat', cap: 2, occ: [], waiting: null, x: p.x, y: p.y, z: p.z, ry: Math.atan2(f.x, f.z) };       // the pair stands side by side across the view, facing each other
    W.placeNpc(npc, p.x, p.z, p.y, spot.ry); npc.spot = spot; this._arrivalChat = spot;
    return !!this.chatHere(npc, spot, o);
  }

  /** Through an entrance: walk to the step, open the door, go in over `ent.inside` and on to `targets`; `arrive` runs at the last one. */
  enter(npc, ent, targets, arrive, o = {}) {
    const W = this.w; W.doors.know(ent.doorId, ent);
    const through = (n) => {
      W.doors.hold(ent.doorId, n.id);
      const go = (m) => m.walk(W, [ent.inside, ...this.indoors(ent, ent.inside, targets)], (k) => { W.doors.release(ent.doorId, k.id); arrive(k, W); }, this.speedFor(m, { slow: true }));
      if (W.doors.isOpen(ent.doorId)) go(n); else n.stand(W, 'wait', 0.55, yawTo(ent.outside.x, ent.outside.z, ent.inside.x, ent.inside.z), go);
    };
    return this.goPoint(npc, ent.outside, through, { snapD: 8, ...o });
  }

  /**
   * Waypoints inside a building from `from` through each of `targets` in turn, round the counters and the furniture (indoor.js); the last one is the last target. A target on another storey
   * than the entrance is routed on ITS floor: the doors and the furniture of that floor, not the ground floor's (in a block of flats the doors upstairs stand where the ones below do, with
   * other ids: the walker held the wrong door and walked into the shut one in front of it).
   */
  indoors(ent, from, targets) {
    if (!ent.inside) return targets.filter(Boolean);                       // a lot known from the plan only: no building to route through
    const pts = []; let cur = from;
    for (const t of targets) {
      if (!t) continue;
      const y = t.y != null && Math.abs(t.y - ent.inside.y) >= 0.6 ? t.y : ent.inside.y;
      for (const p of this.w.indoor.route(ent.lot, cur, t, y)) pts.push(p);
      cur = t;
    }
    return pts;
  }

  /** Out through an entrance from inside (the NPC is hidden or inside): reveal behind the door, walk out and a step beyond, then `arrive`. */
  exit(npc, ent, arrive) {
    const W = this.w; W.doors.know(ent.doorId, ent);
    W.doors.hold(ent.doorId, npc.id); npc.emerging = true;
    const out = () => {
      W.revealAt(npc, ent.inside.x, ent.inside.z, ent.inside.y, yawTo(ent.inside.x, ent.inside.z, ent.outside.x, ent.outside.z));
      const dx = ent.outside.x - ent.inside.x, dz = ent.outside.z - ent.inside.z, l = Math.hypot(dx, dz) || 1;
      const beyond = { x: ent.outside.x + (dx / l) * 1.4, z: ent.outside.z + (dz / l) * 1.4, y: ent.outside.y };
      npc.walk(W, [ent.outside, beyond], (n) => { W.doors.release(ent.doorId, n.id); arrive(n, W); }, this.speedFor(npc));
    };
    if (W.doors.isOpen(ent.doorId)) out(); else W.later(0.5, out);
  }

  // ---- hiding inside and coming out -----------------------------------------------------------------------------------------------------------
  hideAway(npc, lot, why, ent = null) {
    const W = this.w; this.finish(npc); npc.dropGate(W);
    npc.away = true; npc.awayWhy = why; npc.inLot = lot; npc.emerging = false; npc.block = why === 'home' || why === 'visit' ? 'free' : why;
    npc.mode = 'idle'; npc.path = null; npc.moving = false; npc.then = null; npc.visible = false; npc.act = 'idle';
    if (why === 'home' || why === 'visit') npc.stayUntil = W.t + (npc.stayFor ?? 200);
    if (ent) { W.doors.release(ent.doorId, npc.id); npc.justIn = W.t; }
    W.onAway(npc, true);
    return true;
  }

  /** Walk home and go to bed (or hide at once when nobody can see). */
  goHome(npc) { return this.goIn(npc, npc.homeLotId, 'sleep'); }

  /** Go into building `lot` and stay hidden there for `why` ('sleep' | 'school' | 'work'). */
  goIn(npc, lot, why) {
    const W = this.w, ent = lot ? W.spots.entrance(lot, why === 'sleep' ? ['main', 'shop'] : ['main', 'shop']) : null;
    if (!ent || W.canSnap(npc)) return this.hideAway(npc, lot, why);
    if (!this.enter(npc, ent, [], (n) => this.hideAway(n, lot, why, ent))) return this.hideAway(npc, lot, why);
    return true;
  }

  /** The away NPC's block ended: out through the door and on with the day. */
  emerge(npc, blk) {
    const W = this.w, lot = npc.inLot; npc.block = blk;
    if (npc.awayWhy === 'home' || npc.awayWhy === 'visit') npc.stayCool = W.t + 100;
    if (npc.routine === 'shopkeeper') { if (blk === 'work') this.openShop(npc); return; }
    const toSchool = blk === 'school', toClinic = blk === 'work' && HIDDEN_WORK.has(npc.persona);
    const ent = lot ? W.spots.entrance(lot, ['main', 'shop']) : null;
    if ((toSchool || toClinic) && (!ent || W.unseen(ent.outside))) { this.hideAway(npc, toSchool ? W.lots.school : W.lots.clinic, toSchool ? 'school' : 'work'); return; }
    if (!ent) { W.revealAt(npc, npc.homePos.x, npc.homePos.z, npc.homePos.y, npc.ry); this.beginBlock(npc, blk); return; }
    this.exit(npc, ent, (n) => this.beginBlock(n, blk));
  }

  beginBlock(npc, blk) {
    const W = this.w; npc.block = blk; this.finish(npc);
    if (blk === 'sleep') { return npc.routine === 'shopkeeper' ? this.closeShop(npc) : this.goHome(npc); }
    if (blk === 'school') return this.goIn(npc, W.lots.school, 'school');
    if (blk === 'work') return this.startWork(npc, {});
    return this.leisure(npc);
  }

  // ---- the clock (1 Hz) --------------------------------------------------------------------------------------------------------------------------
  tick(npc, hour, W) {
    if (npc.mode === 'talk') return;
    const blk = blockAt(npc, hour), c = npc.convo;
    if (c && c.a === npc.id && W.t >= c.turnAt) this.turn(c);
    if (npc.away) {
      if (npc.awayWhy === 'home' && blk === 'sleep') { npc.awayWhy = 'sleep'; npc.block = 'sleep'; return; }       // bedtime comes while they are home: they stay, in bed
      if (npc.awayWhy === 'sleep' && npc.routine === 'shopkeeper' && blk === 'free') { npc.awayWhy = 'home'; npc.block = 'free'; return; }       // a keeper is up (the morning, or the clock put back to the evening): up and about upstairs
      if (!npc.emerging && W.t >= npc.downAt && this.stayOver(npc, blk)) { npc.emerging = true; this.emerge(npc, blk); }
      return;
    }
    if (npc.scene) return;                                                  // drawn inside a building: homelife.js sees them through their stay
    if (npc.waveUntil && W.t >= npc.waveUntil) { npc.waveUntil = 0; if (npc.act === 'wave') npc.act = 'idle'; }
    else if (npc.greet && npc.act === 'idle' && npc.dist < 13 && npc.rng.chance(0.3)) { npc.act = 'wave'; npc.waveUntil = W.t + 2.6; }
    if (blk !== npc.block && W.t >= (npc.retryAt ?? 0)) this.changeBlock(npc, blk);
  }

  /**
   * Is the reason this person is indoors over? A stay at home or a visit (the clinic, the hall) ends with its time, or when the day calls (school, work, and for a visitor bed time); the other
   * reasons (asleep, at school, on duty) end with their block. `why` is what the person is indoors for (homelife.js asks it of somebody who is drawn inside).
   */
  stayOver(npc, blk, why = npc.awayWhy) {
    if (npc.routine === 'shopkeeper' && (why === 'home' || why === 'sleep')) return blk === 'work';             // a keeper is upstairs (up or in bed: `tick` keeps the label) until the shop opens
    if (why === 'home' || why === 'visit') return this.w.t >= npc.stayUntil || blk === 'school' || blk === 'work' || (why === 'visit' && blk === 'sleep');
    return blk !== why;
  }

  changeBlock(npc, blk) {
    const W = this.w, prev = npc.block;
    if (npc.routine === 'shopkeeper' && blk !== 'work') { npc.block = blk; this.closeShop(npc); return; }       // the shop shuts: upstairs, up and about until bed time, then in bed
    if (blk === 'free') { npc.block = blk; return; }                       // off duty: finish what they are doing, `next` picks leisure
    if (prev === 'work' && blk === 'school') { npc.block = blk; return; }
    npc.block = blk; this.beginBlock(npc, blk);
  }

  // ---- conversations -----------------------------------------------------------------------------------------------------------------------------
  turn(c) {
    const W = this.w, a = W.byId.get(c.a), b = W.byId.get(c.b); if (!a || !b) return;
    c.speaker = c.speaker === c.a ? c.b : c.a; c.turnAt = W.t + 3.5 + a.rng.next() * 5.5;
    for (const [n, other] of [[a, b], [b, a]]) {
      if (n.mode === 'talk') continue;                                      // somebody else (the player) is talking to this one
      const speaking = c.speaker === n.id; n.act = speaking ? 'talk' : 'listen'; if (speaking) n.talkVariant = n.rng.chance(0.5) ? 1 : 0;
      n.targetRy = yawTo(n.x, n.z, other.x, other.z);
    }
  }

  endConvo(npc) {
    const c = npc.convo; if (!c) return; npc.convo = null;
    const o = this.w.byId.get(c.a === npc.id ? c.b : c.a);
    if (o?.convo === c) { o.convo = null; if (o.act === 'talk' || o.act === 'listen') o.act = 'idle'; }
  }

  // ---- leisure activities ------------------------------------------------------------------------------------------------------------------------
  do_wander(npc, o = {}) {
    const W = this.w, nav = W.nav, r = npc.rng, rad = RADIUS[npc.routine] ?? 110, hn = nav.nodes[npc.homeNode] ?? nav.nodes[0];
    if (o.instant) {
      const ref = o.near, ok = (n) => W.inMain(n.i) && n.kind !== 'door' && (!ref || (dist2d(n, ref) >= ref.min && dist2d(n, ref) <= ref.max));
      const cands = []; for (let k = 0; k < 60 && cands.length < 6; k++) { const c = nav.nodes[nav.randomNode(r, null)]; if (ok(c) && !cands.includes(c)) cands.push(c); }
      if (!cands.length) return false;
      const apart = spreadNodes(npc, cands, W.npcs ?? []), nd = apart[Math.floor(r.next() * apart.length)];       // not beside a twin, not on top of anybody (R3-006)
      W.placeNpc(npc, nd.x + (r.next() - 0.5), nd.z + (r.next() - 0.5), nd.y, r.range(-Math.PI, Math.PI));
      npc.stand(W, 'idle', span(r, 1, 6)); return true;
    }
    const from = nav.nearest(npc.x, npc.z, 30, npc.y); if (from < 0) return false;
    const cands = [];
    for (let k = 0; k < 10; k++) {
      const j = nav.randomNode(r, (n) => W.inMain(n.i) && n.kind !== 'door'), n = nav.nodes[j];
      const dh = dist2d(n, hn), dc = dist2d(n, npc);
      if (dh > rad || dc < 8) continue;
      cands.push({ j, n, score: -Math.abs(dc - 26) + r.next() * 12 });
    }
    const apart = spreadNodes(npc, cands.map((c) => c.n), W.npcs ?? []);          // the stops of a walk: not beside a twin, not on top of anybody (R3-006)
    let best = -1, bs = -1e9;
    for (const c of cands) if (apart.includes(c.n) && c.score > bs) { bs = c.score; best = c.j; }
    if (best < 0) return false;
    const idx = nav.path(from, best); if (!idx?.length) { npc.pathFails = (npc.pathFails ?? 0) + 1; return false; }
    return npc.walk(W, W.waypoints(npc, idx), (n) => this.idleHere(n), this.speedFor(npc));
  }

  idleHere(npc) {
    const W = this.w, r = npc.rng, kind = npc.age === 'kid' ? pickW(r, [['bounce', 0.5], ['fidget', 0.5]]) : npc.age === 'teen' ? pickW(r, [['idle', 0.5], ['phone', 0.5]]) : pickW(r, [['idle', 0.88], ['phone', 0.12]]);
    npc.stand(W, kind, span(r, 8, 22), npc.ry + (r.next() - 0.5) * 1.6);
    return true;
  }

  do_sweep(npc, o = {}) {
    const own = npc.homeLotId, shop = npc.shopLotId, r = npc.rng;
    let spot = r.chance(0.7) ? this.pickSpot(npc, 'sweep', o, { maxD: 45, filter: (s) => s.building === own || s.building === shop }) : null;
    spot ??= this.pickSpot(npc, 'sweep', o, { maxD: 45 });
    return this.toSpot(npc, spot, (n) => this.sweepHere(n, spot, o), o);
  }
  sweepHere(npc, spot, o = {}) {
    const W = this.w; npc.prop = 'broom'; npc.stand(W, 'sweep', span(npc.rng, 40, 90), spot.ry); if (o.instant) npc.ry = npc.targetRy = spot.ry;
  }

  do_lean(npc, o = {}) {
    const spot = this.pickSpot(npc, 'lean', o, { maxD: 55 });
    return this.toSpot(npc, spot, (n) => { n.stand(this.w, npc.age === 'teen' && n.rng.chance(0.5) ? 'phone' : 'lean', span(n.rng, 30, 100), spot.ry); if (o.instant) n.ry = n.targetRy = spot.ry; }, o);
  }

  do_bench(npc, o = {}) {
    const spot = this.pickSpot(npc, 'bench', o, { maxD: 65, filter: (s) => !s.tagSet.has('busstop') || npc.routine !== 'shopkeeper' });
    return this.toSpot(npc, spot, (n) => this.sitAt(n, spot, o), o);
  }
  sitAt(npc, spot, o = {}) {
    const W = this.w, f = [Math.sin(spot.ry), Math.cos(spot.ry)];
    npc.st.x = spot.x - f[0] * 0.1; npc.st.z = spot.z - f[1] * 0.1; npc.lastX = npc.st.x; npc.lastZ = npc.st.z;   // hips on the middle of the seat
    npc.sitH = spot.seatH ?? 0.49; npc.targetRy = spot.ry; if (o.instant) npc.ry = spot.ry;
    npc.stand(W, 'sit', span(npc.rng, 60, 200), spot.ry);
  }

  /** A chat corner for `npc`: join somebody who is already waiting at one (never a twin: two of the same character in one conversation), else wait at a free one. */
  chatSpot(npc, o = {}) {
    return this.pickSpot(npc, 'chat', o, { maxD: 45, half: true, filter: (s) => s.waiting && this.waitingHere(npc, s) })
      ?? this.pickSpot(npc, 'chat', o, { maxD: 55, filter: (s) => s.occ.length === 0 });
  }
  /** Somebody is waiting at chat spot `s` for company and `npc` may join them (they are not the same character). */
  waitingHere(npc, s) { const w = this.w.byId.get(s.waiting); return w?.spot === s && !isTwin(npc, w); }
  do_chat(npc, o = {}) {
    const spot = this.chatSpot(npc, o);
    return this.toSpot(npc, spot, (n) => this.chatHere(n, spot, o), o);
  }
  chatHere(npc, spot, o = {}) {
    const W = this.w, r = npc.rng, side = (-Math.cos(spot.ry)) * 0 + 1;
    const px = -Math.cos(spot.ry), pz = Math.sin(spot.ry);                       // to the right of the spot's facing
    const other = spot.waiting && spot.waiting !== npc.id ? W.byId.get(spot.waiting) : null;
    if (other && other.spot === spot && !other.away && other.mode === 'idle') {
      // the second one has arrived: stand opposite, and talk, taking turns
      const T = span(r, 40, 100), c = { a: other.id, b: npc.id, turnAt: W.t + 2, speaker: other.id };
      npc.st.x = spot.x - px * 0.4; npc.st.z = spot.z - pz * 0.4; npc.lastX = npc.st.x; npc.lastZ = npc.st.z;
      npc.convo = c; other.convo = c; other.until = npc.until = W.t + T;
      other.then = null; npc.then = null;
      npc.mode = 'idle'; npc.until = W.t + T; npc.act = 'listen'; other.act = 'talk';
      npc.targetRy = yawTo(npc.x, npc.z, other.x, other.z); other.targetRy = yawTo(other.x, other.z, npc.x, npc.z);
      if (o.instant) { npc.ry = npc.targetRy; other.ry = other.targetRy; }
      spot.waiting = null;
      return true;
    }
    spot.waiting = npc.id;
    npc.st.x = spot.x + px * 0.4; npc.st.z = spot.z + pz * 0.4; npc.lastX = npc.st.x; npc.lastZ = npc.st.z;
    npc.stand(W, r.chance(0.35) ? 'phone' : 'wait', span(r, 30, 60), spot.ry + Math.PI / 2);
    return true;
  }

  do_court(npc, o = {}) {
    const W = this.w, r = npc.rng;
    const spot = this.pickSpot(npc, 'play', o, { maxD: 160 });
    const play = (n) => {                                                   // a minute on the court: bounce, fidget, bounce... (two beats, then the next thing)
      const face = () => yawTo(n.x, n.z, spot.x + (r.next() - 0.5) * 8, spot.z + (r.next() - 0.5) * 6), a1 = r.chance(0.6) ? 'bounce' : 'fidget', a2 = a1 === 'bounce' ? 'fidget' : 'bounce';
      n.stand(W, a1, span(r, 8, 22), face(), (m) => m.stand(W, a2, span(r, 8, 24), face()));
    };
    return this.toSpot(npc, spot, play, { ...o, run: npc.age === 'kid' || (npc.age === 'teen' && r.chance(0.3)) });
  }

  do_greet(npc, o = {}) {
    const spot = this.pickSpot(npc, 'greet', o, { maxD: 60 });
    return this.toSpot(npc, spot, (n) => { n.greet = true; n.stand(this.w, 'idle', span(n.rng, 30, 70), spot.ry); if (o.instant) n.ry = n.targetRy = spot.ry; }, o);
  }

  do_stand(npc, o = {}) {
    const spot = this.pickSpot(npc, 'stand', o, { maxD: 80 }) ?? this.pickSpot(npc, 'phone', o, { maxD: 80 });
    return this.toSpot(npc, spot, (n) => { n.stand(this.w, spot.kind === 'phone' || n.rng.chance(0.3) ? 'phone' : 'idle', span(n.rng, 30, 90), spot.ry); if (o.instant) n.ry = n.targetRy = spot.ry; }, o);
  }

  do_phone(npc, o = {}) {
    const spot = this.pickSpot(npc, 'phone', o, { maxD: 80 }) ?? this.pickSpot(npc, 'lean', o, { maxD: 55 });
    return this.toSpot(npc, spot, (n) => { n.stand(this.w, 'phone', span(n.rng, 30, 80), spot.ry); if (o.instant) n.ry = n.targetRy = spot.ry; }, o);
  }

  /**
   * The devout go to the chapel at prayer time (off the hours, now and then): in through the door and a stay there, at the altar or on a pew (homelife.js draws them while the player is in the
   * chapel or near it), and out again. A chapel with nobody in it was the round-4 complaint.
   */
  do_pray(npc, o = {}) {
    const W = this.w, lot = W.lots.chapel, ent = lot ? W.spots.entrance(lot, ['main']) : null;
    if (!ent || (!o.instant && !nearPrayer(W.hour) && npc.rng.chance(0.5))) return false;
    return this.stay(npc, lot, 'visit', o);
  }
  pickInside(npc, lot, kind, filter = null) { return this.w.spots.pick(kind, npc.x, npc.z, npc.rng, { indoor: true, building: lot, maxD: 1e9, filter }); }

  /** Inside a building: back out through its entrance, then on with the day. */
  leaveBuilding(npc, ent) {
    const W = this.w; npc.sitH = null; W.doors.hold(ent.doorId, npc.id);
    const dx = ent.outside.x - ent.inside.x, dz = ent.outside.z - ent.inside.z, l = Math.hypot(dx, dz) || 1;
    const beyond = { x: ent.outside.x + (dx / l) * 1.4, z: ent.outside.z + (dz / l) * 1.4, y: ent.outside.y };
    npc.walk(W, [...this.indoors(ent, npc, [ent.inside]), ent.outside, beyond], (n) => { W.doors.release(ent.doorId, n.id); this.next(n); }, this.speedFor(npc, { slow: true }));
  }

  // ---- at home and on visits -------------------------------------------------------------------------------------------------------------------
  /**
   * A stay indoors: in at the door of building `lot` and hidden there until the stay is over (the brain's `tick` sends them out again). homelife.js draws whoever is inside while the player is
   * in the building or near it, in the room that fits what they do there. On the first frame (`o.instant`) they are simply already inside, part of the way through the stay.
   */
  stay(npc, lot, why, o = {}) {
    const W = this.w; if (!lot) return false;
    const secs = why === 'home' ? span(npc.rng, 120, 330) : span(npc.rng, 80, 220);
    npc.stayFor = o.instant ? secs * (0.15 + npc.rng.next() * 0.85) : secs;
    if (o.instant) return this.hideAway(npc, lot, why);
    return this.goIn(npc, lot, why);
  }

  /** A stay at home: breakfast, the washing, lunch, the television, the homework, supper. */
  do_home(npc, o = {}) {
    const lot = npc.homeLotId;
    if (!lot || npc.routine === 'shopkeeper' || !this.w.spots.entrance(lot, ['main', 'shop'])) return false;
    return this.stay(npc, lot, 'home', o);
  }

  /** A visit to the clinic: wait on the benches of the waiting room. */
  do_clinic(npc, o = {}) {
    const lot = this.w.lots.clinic; if (!lot || !this.w.spots.entrance(lot, ['main', 'shop'])) return false;
    return this.stay(npc, lot, 'visit', o);
  }

  /** The evening meeting in the hall. */
  do_hall(npc, o = {}) {
    const lot = this.w.lots.hall; if (!lot || !this.w.spots.entrance(lot, ['main', 'shop'])) return false;
    return this.stay(npc, lot, 'visit', o);
  }

  // ---- shops -------------------------------------------------------------------------------------------------------------------------------------
  /** Errand: into an open shop, stand at the customer spot a while, and out again. Never a shop whose keeper or another customer is the same character (R3-006: the drogueria keeper and a neighbour, both m_tendero, 1 m apart) unless it is the only one open. */
  do_errand(npc, o = {}) {
    const W = this.w, all = [];
    for (const s of W.shops.values()) if (s.open && s.lot !== npc.shopLotId && s.ent) all.push([s, 1 / (25 + dist2d(s.ent.outside, o.near ?? npc))]);
    if (!all.length) return false;
    const apart = all.filter(([s]) => twinWeight(npc, s.cpoint, W.npcs ?? []) === 1), cands = apart.length ? apart : all;
    const shop = pickW(npc.rng, cands), cs = shop.cust.find((a) => W.spots.free(a)) ?? null;
    const target = cs ?? shop.cpoint;
    const here = (n) => {
      n.stand(W, 'talk', span(n.rng, 6, 15), cs ? cs.ry : yawTo(target.x, target.z, shop.post.x, shop.post.z), (m) => this.leaveShop(m, shop));
      if (o.instant) n.ry = n.targetRy;
    };
    if (o.instant) { if (cs) { W.spots.claim(cs, npc); npc.spot = cs; } W.placeNpc(npc, target.x, target.z, target.y, 0); here(npc); return true; }
    if (cs) { W.spots.claim(cs, npc); npc.spot = cs; }
    if (!this.enter(npc, shop.ent, [{ x: target.x, z: target.z, y: target.y }], here)) { if (cs) { W.spots.release(npc); npc.spot = null; } return false; }
    return true;
  }

  leaveShop(npc, shop) { this.leaveBuilding(npc, shop.ent); }

  /** The shop opens: shutter up, the keeper at the post (placed there when he was hidden inside, walking in when he was out). */
  openShop(npc, o = {}) {
    const W = this.w, shop = W.shops.get(npc.shopLotId); if (!shop) return false;
    shop.open = true; shop.keeper = npc.id; npc.block = 'work';
    if (shop.ent) W.doors.keepOpen(shop.ent.doorId, true);
    if (npc.away || o.instant) { const p = shop.post; W.revealAt(npc, p.x, p.z, p.y, p.ry); this.atPost(npc, true); return true; }
    return this.backToPost(npc);
  }

  /** The shop shuts (or the keeper's day is over): up the stairs, hidden in the building. 'home' while they are up and about, 'sleep' from bed time (`tick` turns one into the other). */
  closeShop(npc) {
    const W = this.w, shop = W.shops.get(npc.shopLotId), why = blockAt(npc, W.hour) === 'sleep' ? 'sleep' : 'home'; npc.block = why === 'sleep' ? 'sleep' : 'free';
    if (shop) { shop.open = false; shop.keeper = null; if (shop.ent) W.doors.keepOpen(shop.ent.doorId, false); }
    const inside = shop && dist2d(npc, shop.post) < 4.5 && Math.abs(npc.y - shop.post.y) < 1.2;
    if (inside || W.canSnap(npc)) return this.hideAway(npc, npc.shopLotId, why);
    return this.goIn(npc, npc.homeLotId, why);
  }

  /** At the counter: sell, idle, look at the phone; now and then step out for a minute. */
  atPost(npc, first = false) {
    const W = this.w, shop = W.shops.get(npc.shopLotId), r = npc.rng; if (!shop) return this.leisure(npc);
    const p = shop.post;
    if (dist2d(npc, p) > 1.3 || Math.abs(npc.y - p.y) > 1.0) return this.backToPost(npc);
    if (!first && r.next() < 0.12 && this.excursion(npc, shop)) return true;
    const x = r.next(), act = x < 0.5 ? 'sell' : x < 0.78 ? 'idle' : x < 0.9 ? 'phone' : 'wait';
    npc.stand(W, act, span(r, 20, 50), p.ry);
    return true;
  }

  backToPost(npc) {
    const W = this.w, shop = W.shops.get(npc.shopLotId); if (!shop) return false;
    const p = shop.post;
    if (!shop.ent) { W.placeNpc(npc, p.x, p.z, p.y, p.ry); return this.atPost(npc, true); }
    const targets = shop.sealed ? [] : [{ x: p.x, z: p.z, y: p.y }];                       // a post the door cannot reach (sealed in by the counter): in at the door, then at the post
    const there = (n) => { if (shop.sealed) W.placeNpc(n, p.x, p.z, p.y, p.ry); n.targetRy = p.ry; this.atPost(n, true); };
    if (!this.enter(npc, shop.ent, targets, there)) { W.revealAt(npc, p.x, p.z, p.y, p.ry); return this.atPost(npc, true); }
    return true;
  }

  /** The place of `kind` ('sweep' | 'lean' | 'chat') near the shop's door for a short walk out: a chat corner is free or has somebody (not a twin) waiting at it. */
  excursionSpot(npc, shop, kind) {
    const W = this.w, lot = npc.shopLotId, o = shop.ent.outside;
    return W.spots.pick(kind, o.x, o.z, npc.rng, {
      indoor: false, maxD: kind === 'chat' ? 22 : 12, weight: (s) => twinWeight(npc, s, W.npcs ?? []),
      filter: (s) => (kind === 'chat' ? (s.occ.length === 0 || (s.waiting && this.waitingHere(npc, s))) : s.building === lot),
    });
  }

  /** A short walk out of the shop: sweep the doorstep, lean on the wall, chat at the corner; then back to the post. */
  excursion(npc, shop) {
    const W = this.w, r = npc.rng; if (!shop.ent || shop.sealed) return false;
    const kind = pickW(r, [['sweep', 3], ['lean', 3], ['chat', 2]]);
    const spot = this.excursionSpot(npc, shop, kind);
    if (!spot) return false;
    const e = shop.ent, back = (n) => { this.finish(n); this.backToPost(n); };
    const leg = dist2d(e.outside, spot) < 3.5 ? [{ x: spot.x, z: spot.z, y: spot.y }] : this.streetLeg(npc, e.outside, spot);     // the doorstep is a few steps; a corner down the street is a walk along it
    if (!leg) return false;
    W.spots.claim(spot, npc); npc.spot = spot;
    return npc.walk(W, [...this.indoors(e, npc, [e.inside]), e.outside, ...leg], (n) => {
      if (kind === 'sweep') { n.prop = 'broom'; n.stand(W, 'sweep', span(n.rng, 14, 30), spot.ry, back); }
      else if (kind === 'lean') n.stand(W, 'lean', span(n.rng, 12, 35), spot.ry, back);
      else { this.chatHere(n, spot); n.then = back; }
    }, this.speedFor(npc, { slow: true }));
  }

  // ---- work ----------------------------------------------------------------------------------------------------------------------------------------
  siteWork(npc, o = {}) {
    const W = this.w, lot = W.lots.byId.get(npc.siteLotId), r = npc.rng;
    if (!lot) return this.leisure(npc, o);
    if (lot.kind === 'workshop') return o.instant ? this.hideAway(npc, lot.id, 'work') : this.goIn(npc, lot.id, 'work');       // the workshop's bench: homelife.js draws the worker there
    const ent = W.spots.entrance(lot.id, ['main', 'shop']), c = ent?.outside ?? { x: lot.x, z: lot.z, y: lot.y };
    const near = (n) => W.inMain(n.i) && n.kind !== 'door' && dist2d(n, c) < 13;
    const around = W.nav.nodes.filter(near); if (!around.length) return this.leisure(npc, o);
    const nodes = spreadNodes(npc, around, W.npcs ?? []);                 // the site is shared: not beside a twin, not on top of the others
    const nd = nodes[Math.floor(r.next() * nodes.length)];
    const dwell =(n, act, secs, face) => { n.stand(W, act, secs, face, null); };
    const go = (n) => {
      const x = r.next();
      if (x < 0.45) { n.prop = 'bundle'; n.carry = false; dwell(n, 'carry', span(r, 8, 18), yawTo(n.x, n.z, c.x, c.z)); }
      else if (x < 0.62) dwell(n, 'point', span(r, 6, 14), yawTo(n.x, n.z, c.x, c.z));
      else if (x < 0.8) dwell(n, 'talk', span(r, 8, 20), n.ry + 0.6);
      else dwell(n, 'phone', span(r, 8, 18), n.ry);
    };
    if (o.instant) { W.placeNpc(npc, nd.x + (r.next() - 0.5), nd.z + (r.next() - 0.5), nd.y, r.range(-Math.PI, Math.PI)); go(npc); return true; }
    const carrying = r.chance(0.5);
    if (carrying) { npc.prop = 'bundle'; npc.carry = true; }
    const ok = this.goPoint(npc, nd, go, { snapD: 14 });
    if (!ok) { npc.prop = null; npc.carry = false; return this.leisure(npc, o); }
    return true;
  }

  motoWait(npc, o = {}) {
    const W = this.w, lm = W.landmarks.find((l) => l.id === 'busstop') ?? W.landmarks[0], r = npc.rng;
    const around = W.nav.nodes.filter((n) => W.inMain(n.i) && n.kind !== 'door' && dist2d(n, lm) < 9);
    if (!around.length) return this.leisure(npc, o);
    const nodes = spreadNodes(npc, around, W.npcs ?? []);                 // three riders at one stand: three different corners of it (R3-006: n37 and n59 stood 0.5 m apart)
    const nd = nodes[Math.floor(r.next() * nodes.length)];
    const here = (n) => n.stand(W, pickW(r, [['idle', 4], ['phone', 3], ['wait', 2], ['talk', 1]]), span(r, 25, 80), yawTo(n.x, n.z, lm.x, lm.z) + (r.next() - 0.5));
    if (o.instant) { W.placeNpc(npc, nd.x + (r.next() - 0.5), nd.z + (r.next() - 0.5), nd.y, r.range(-Math.PI, Math.PI)); here(npc); return true; }
    return this.goPoint(npc, nd, here, { snapD: 14 }) || this.leisure(npc, o);
  }

  /** The street seller: a basket on the arm, a few minutes at each plaza corner. */
  sellRoute(npc, o = {}) {
    const W = this.w, r = npc.rng;
    const all = W.nav.nodes.filter((n) => W.inMain(n.i) && (n.kind === 'plaza' || n.kind === 'court'));
    if (!all.length) return this.leisure(npc, o);
    const close = all.filter((n) => { const d = dist2d(n, npc); return d > 8 && d < 70; }), nodes = spreadNodes(npc, close.length ? close : all, W.npcs ?? []);       // the next corner, not the far side of the barrio, and not one where somebody already is
    const nd = nodes[Math.floor(r.next() * nodes.length)];
    const here = (n) => { n.prop = 'basket'; n.stand(W, 'sell', span(r, 35, 95), n.ry + (r.next() - 0.5) * 2); };
    if (o.instant) { W.placeNpc(npc, nd.x, nd.z, nd.y, r.range(-Math.PI, Math.PI)); here(npc); return true; }
    npc.prop = 'basket';
    return this.goPoint(npc, nd, here, { snapD: 14 }) || (npc.prop = null, this.leisure(npc, o));
  }

  // ---- recovery -----------------------------------------------------------------------------------------------------------------------------------
  /** Called after ~4 s without progress. Arrive when close to the end, re-path, side-step, and (out of sight) hop to the next waypoint or the graph. */
  unstick(npc, W) {
    npc.unstuckCount = (npc.unstuckCount ?? 0) + 1; npc.stuckT = 1.5;
    const path = npc.path, fin = path?.[path.length - 1];
    if (fin && npc.pi >= path.length - 1 && dist2d(fin, npc) < 1.6) { npc._arrived(W); return; }
    const nn = W.nav.nearest(npc.x, npc.z, 16, npc.y), unseen = W.canSnap(npc), n = npc.unstuckCount, indoors = W.lotAt(npc.x, npc.z) != null;
    if (path && npc.pi < path.length && ((n % 3 === 0 && unseen) || n >= 6)) {          // hop over whatever is in the way: to the waypoint, or the one after
      const pt = path[Math.min(path.length - 1, npc.pi + (n >= 6 ? 1 : 0))]; W.placeNpc(npc, pt.x, pt.z, pt.y, npc.ry); npc.pi = Math.min(path.length, npc.pi + 1); npc.stuckT = 0; npc.hops = (npc.hops ?? 0) + 1; return;
    }
    if (n % 3 === 0 && unseen && nn >= 0) { W.snapToNode(npc, nn); this.idleHere(npc); return; }
    if (n % 3 === 1 && !indoors && nn >= 0 && npc.goal != null && npc.goal !== nn) { if (this.goNode(npc, nn, npc.goal, npc.arrive)) return; }       // (inside a building the street graph is no way out)
    npc.sidestep = 1.4; npc.sideDir = -npc.sideDir;
    if (n >= 5 && unseen && nn >= 0) { W.snapToNode(npc, nn); npc.unstuckCount = 0; this.idleHere(npc); }
  }

  goNode(npc, from, to, arrive = null) {
    const W = this.w, idx = W.nav.path(from, to);
    if (!idx || idx.length < 1) { npc.pathFails = (npc.pathFails ?? 0) + 1; return false; }
    npc.goal = to;
    return npc.walk(W, W.waypoints(npc, idx), arrive, this.speedFor(npc));
  }
}
