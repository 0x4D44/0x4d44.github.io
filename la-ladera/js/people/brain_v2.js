// NPC decision making (no THREE, no DOM): what everybody is doing at this hour, how they get there, how they go through doors, and how they recover.
//
// The day is cut into blocks (schedule.js): sleep / school / work / free. `start` puts everybody where they plausibly are at the first frame, `tick` (1 Hz)
// notices a change of block (the clock, or the player moving the time slider), `next` is called when an idle task ends and picks the next activity.
//
// Activities (`do_<name>(npc, o)` returns true when it started something): wander errand sweep lean bench chat court greet stand phone pray.
// Places come from `spots.js` (outdoor POIs of the plan + indoor anchors of the interiors); doors from `doors.js`; every walk goes over the nav graph and
// ends on the exact spot. Away = hidden inside a building (asleep, at school, on duty); they come out through the same door the next block.
import { blockAt, freeChoices, nearPrayer } from './schedule.js';

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
    if (blk === 'sleep') { if (npc.routine === 'shopkeeper') return this.closeShop(npc); return this.goHome(npc); }
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
    npc.sitH = null; npc.prop = null; npc.carry = false; npc.greet = false; npc.waveUntil = 0; npc.then = null;
  }

  leisure(npc, o = {}) {
    const W = this.w, bag = freeChoices(npc, W.hour).slice();
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
    const pts = W.waypoints(npc, idx); pts.push({ x: p.x, z: p.z, y: p.y });
    return npc.walk(W, pts, arrive, this.speedFor(npc, o));
  }

  /** Go to a spot of the registry, claim it, run `arrive(npc, w)` on it. o.instant: place straight on it (first frame). Fails (and claims nothing) when unreachable. */
  toSpot(npc, spot, arrive, o = {}) {
    const W = this.w;
    if (!spot) return false;
    if (o.instant) { W.spots.claim(spot, npc); npc.spot = spot; W.placeNpc(npc, spot.x, spot.z, spot.y, spot.ry); arrive(npc, W); return true; }
    if (!this.goPoint(npc, spot, arrive, o)) return false;
    W.spots.claim(spot, npc); npc.spot = spot;
    return true;
  }

  pickSpot(npc, kind, o = {}, f = {}) {
    const W = this.w, ref = o.near ?? npc;
    return W.spots.pick(kind, ref.x, ref.z, npc.rng, {
      indoor: false, maxD: f.maxD ?? (o.near ? o.near.max : 90), half: f.half, tag: f.tag,
      filter: (s) => s !== npc.lastSpot && (!o.near || dist2d(s, o.near) >= o.near.min) && (!f.filter || f.filter(s)),
    });
  }

  /** Through an entrance: walk to the step, open the door, go in over `ent.inside` and on to `targets`; `arrive` runs at the last one. */
  enter(npc, ent, targets, arrive, o = {}) {
    const W = this.w; W.doors.know(ent.doorId, ent);
    const through = (n) => {
      W.doors.hold(ent.doorId, n.id);
      const go = (m) => m.walk(W, [ent.inside, ...targets], (k) => { W.doors.release(ent.doorId, k.id); arrive(k, W); }, this.speedFor(m, { slow: true }));
      if (W.doors.isOpen(ent.doorId)) go(n); else n.stand(W, 'wait', 0.55, yawTo(ent.outside.x, ent.outside.z, ent.inside.x, ent.inside.z), go);
    };
    return this.goPoint(npc, ent.outside, through, { snapD: 8, ...o });
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
    const W = this.w; this.finish(npc);
    npc.away = true; npc.awayWhy = why; npc.inLot = lot; npc.emerging = false; npc.block = why;
    npc.mode = 'idle'; npc.path = null; npc.moving = false; npc.then = null; npc.visible = false; npc.act = 'idle';
    if (ent) W.doors.release(ent.doorId, npc.id);
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
    if (npc.away) { if (!npc.emerging && blk !== npc.awayWhy) { npc.emerging = true; this.emerge(npc, blk); } return; }
    if (npc.waveUntil && W.t >= npc.waveUntil) { npc.waveUntil = 0; if (npc.act === 'wave') npc.act = 'idle'; }
    else if (npc.greet && npc.act === 'idle' && npc.dist < 13 && npc.rng.chance(0.3)) { npc.act = 'wave'; npc.waveUntil = W.t + 2.6; }
    if (blk !== npc.block && W.t >= (npc.retryAt ?? 0)) this.changeBlock(npc, blk);
  }

  changeBlock(npc, blk) {
    const W = this.w, prev = npc.block;
    if (blk === 'free') { npc.block = blk; return; }                       // off duty: finish what they are doing, `next` picks leisure
    if (npc.routine === 'shopkeeper' && blk === 'sleep') { npc.block = blk; this.closeShop(npc); return; }
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
      let nd = null; for (let k = 0; k < 60 && !nd; k++) { const c = nav.nodes[nav.randomNode(r, null)]; if (ok(c)) nd = c; }
      if (!nd) return false;
      W.placeNpc(npc, nd.x + (r.next() - 0.5), nd.z + (r.next() - 0.5), nd.y, r.range(-Math.PI, Math.PI));
      npc.stand(W, 'idle', span(r, 1, 6)); return true;
    }
    const from = nav.nearest(npc.x, npc.z, 30, npc.y); if (from < 0) return false;
    let best = -1, bs = -1e9;
    for (let k = 0; k < 10; k++) {
      const j = nav.randomNode(r, (n) => W.inMain(n.i) && n.kind !== 'door'), n = nav.nodes[j];
      const dh = dist2d(n, hn), dc = dist2d(n, npc);
      if (dh > rad || dc < 10) continue;
      const score = -Math.abs(dc - 38) + r.next() * 16;
      if (score > bs) { bs = score; best = j; }
    }
    if (best < 0) return false;
    const idx = nav.path(from, best); if (!idx?.length) { npc.pathFails = (npc.pathFails ?? 0) + 1; return false; }
    return npc.walk(W, W.waypoints(npc, idx), (n) => this.idleHere(n), this.speedFor(npc));
  }

  idleHere(npc) {
    const W = this.w, r = npc.rng, kind = npc.age === 'kid' ? pickW(r, [['bounce', 0.5], ['fidget', 0.5]]) : npc.age === 'teen' ? pickW(r, [['idle', 0.5], ['phone', 0.5]]) : pickW(r, [['idle', 0.88], ['phone', 0.12]]);
    npc.stand(W, kind, span(r, 3, 9), npc.ry + (r.next() - 0.5) * 1.6);
    return true;
  }

  do_sweep(npc, o = {}) {
    const own = npc.homeLotId, shop = npc.shopLotId, r = npc.rng;
    let spot = r.chance(0.7) ? this.pickSpot(npc, 'sweep', o, { maxD: 70, filter: (s) => s.building === own || s.building === shop }) : null;
    spot ??= this.pickSpot(npc, 'sweep', o, { maxD: 70 });
    return this.toSpot(npc, spot, (n) => this.sweepHere(n, spot, o), o);
  }
  sweepHere(npc, spot, o = {}) {
    const W = this.w; npc.prop = 'broom'; npc.stand(W, 'sweep', span(npc.rng, 24, 55), spot.ry); if (o.instant) npc.ry = npc.targetRy = spot.ry;
  }

  do_lean(npc, o = {}) {
    const spot = this.pickSpot(npc, 'lean', o, { maxD: 80 });
    return this.toSpot(npc, spot, (n) => { n.stand(this.w, npc.age === 'teen' && n.rng.chance(0.5) ? 'phone' : 'lean', span(n.rng, 18, 70), spot.ry); if (o.instant) n.ry = n.targetRy = spot.ry; }, o);
  }

  do_bench(npc, o = {}) {
    const spot = this.pickSpot(npc, 'bench', o, { maxD: 100, filter: (s) => !s.tagSet.has('busstop') || npc.routine !== 'shopkeeper' });
    return this.toSpot(npc, spot, (n) => this.sitAt(n, spot, o), o);
  }
  sitAt(npc, spot, o = {}) {
    const W = this.w, f = [Math.sin(spot.ry), Math.cos(spot.ry)];
    npc.st.x = spot.x - f[0] * 0.1; npc.st.z = spot.z - f[1] * 0.1; npc.lastX = npc.st.x; npc.lastZ = npc.st.z;   // hips on the middle of the seat
    npc.sitH = spot.seatH ?? 0.49; npc.targetRy = spot.ry; if (o.instant) npc.ry = spot.ry;
    npc.stand(W, 'sit', span(npc.rng, 40, 130), spot.ry);
  }

  do_chat(npc, o = {}) {
    const W = this.w;
    // join somebody who is already waiting at a chat spot, else wait at a free one
    let spot = this.pickSpot(npc, 'chat', o, { maxD: 60, half: true, filter: (s) => s.waiting && W.byId.get(s.waiting)?.spot === s });
    const joining = !!spot;
    spot ??= this.pickSpot(npc, 'chat', o, { maxD: 80, filter: (s) => s.occ.length === 0 });
    return this.toSpot(npc, spot, (n) => this.chatHere(n, spot, o), o);
  }
  chatHere(npc, spot, o = {}) {
    const W = this.w, r = npc.rng, side = (-Math.cos(spot.ry)) * 0 + 1;
    const px = -Math.cos(spot.ry), pz = Math.sin(spot.ry);                       // to the right of the spot's facing
    const other = spot.waiting && spot.waiting !== npc.id ? W.byId.get(spot.waiting) : null;
    if (other && other.spot === spot && !other.away && other.mode === 'idle') {
      // the second one has arrived: stand opposite, and talk, taking turns
      const T = span(r, 26, 62), c = { a: other.id, b: npc.id, turnAt: W.t + 2, speaker: other.id };
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
    npc.stand(W, r.chance(0.35) ? 'phone' : 'wait', span(r, 25, 45), spot.ry + Math.PI / 2);
    return true;
  }

  do_court(npc, o = {}) {
    const W = this.w, r = npc.rng;
    const spot = this.pickSpot(npc, 'play', o, { maxD: 160 });
    return this.toSpot(npc, spot, (n) => { n.stand(W, r.chance(0.6) ? 'bounce' : 'fidget', span(r, 2.5, 8), yawTo(n.x, n.z, spot.x + (r.next() - 0.5) * 8, spot.z + (r.next() - 0.5) * 6)); }, { ...o, run: npc.age === 'kid' || (npc.age === 'teen' && r.chance(0.3)) });
  }

  do_greet(npc, o = {}) {
    const spot = this.pickSpot(npc, 'greet', o, { maxD: 100 });
    return this.toSpot(npc, spot, (n) => { n.greet = true; n.stand(this.w, 'idle', span(n.rng, 20, 50), spot.ry); if (o.instant) n.ry = n.targetRy = spot.ry; }, o);
  }

  do_stand(npc, o = {}) {
    const spot = this.pickSpot(npc, 'stand', o, { maxD: 140 }) ?? this.pickSpot(npc, 'phone', o, { maxD: 140 });
    return this.toSpot(npc, spot, (n) => { n.stand(this.w, spot.kind === 'phone' || n.rng.chance(0.3) ? 'phone' : 'idle', span(n.rng, 20, 60), spot.ry); if (o.instant) n.ry = n.targetRy = spot.ry; }, o);
  }

  do_phone(npc, o = {}) {
    const spot = this.pickSpot(npc, 'phone', o, { maxD: 140 }) ?? this.pickSpot(npc, 'lean', o, { maxD: 80 });
    return this.toSpot(npc, spot, (n) => { n.stand(this.w, 'phone', span(n.rng, 20, 60), spot.ry); if (o.instant) n.ry = n.targetRy = spot.ry; }, o);
  }

  /** The devout go to the chapel at prayer time: in through the door and to the altar (or a pew), and out again. */
  do_pray(npc, o = {}) {
    const W = this.w, lot = W.lots.chapel, ent = lot ? W.spots.entrance(lot, ['main']) : null;
    if (!ent || (!o.instant && !nearPrayer(W.hour) && npc.rng.chance(0.7))) return false;
    const altar = W.spots.inside(lot, 'pray')[0], pew = npc.rng.chance(0.5) ? this.pickInside(npc, lot, 'sit') : null;
    const spot = pew ?? altar; if (!spot) return false;
    const there = (n) => {
      if (pew) { n.sitH = pew.seatH ?? 0.45; n.targetRy = pew.ry; n.stand(W, 'sit', span(n.rng, 40, 100), pew.ry, (m) => this.leaveBuilding(m, ent)); }
      else n.stand(W, 'pray', span(n.rng, 35, 80), spot.ry, (m) => this.leaveBuilding(m, ent));
    };
    if (o.instant) { W.spots.claim(spot, npc); npc.spot = spot; W.placeNpc(npc, spot.x, spot.z, spot.y, spot.ry); there(npc); return true; }
    W.spots.claim(spot, npc); npc.spot = spot;
    if (!this.enter(npc, ent, [{ x: spot.x, z: spot.z, y: spot.y }], there)) { W.spots.release(npc); npc.spot = null; return false; }
    return true;
  }
  pickInside(npc, lot, kind) { return this.w.spots.pick(kind, npc.x, npc.z, npc.rng, { indoor: true, building: lot, maxD: 1e9 }); }

  /** Inside a building: back out through its entrance, then on with the day. */
  leaveBuilding(npc, ent) {
    const W = this.w; npc.sitH = null; W.doors.hold(ent.doorId, npc.id);
    const dx = ent.outside.x - ent.inside.x, dz = ent.outside.z - ent.inside.z, l = Math.hypot(dx, dz) || 1;
    const beyond = { x: ent.outside.x + (dx / l) * 1.4, z: ent.outside.z + (dz / l) * 1.4, y: ent.outside.y };
    npc.walk(W, [ent.inside, ent.outside, beyond], (n) => { W.doors.release(ent.doorId, n.id); this.next(n); }, this.speedFor(npc, { slow: true }));
  }

  // ---- shops -------------------------------------------------------------------------------------------------------------------------------------
  /** Errand: into an open shop, stand at the customer spot a while, and out again. */
  do_errand(npc, o = {}) {
    const W = this.w, cands = [];
    for (const s of W.shops.values()) if (s.open && s.lot !== npc.shopLotId && s.ent) cands.push([s, 1 / (25 + dist2d(s.ent.outside, o.near ?? npc))]);
    if (!cands.length) return false;
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

  closeShop(npc) {
    const W = this.w, shop = W.shops.get(npc.shopLotId); npc.block = 'sleep';
    if (shop) { shop.open = false; shop.keeper = null; if (shop.ent) W.doors.keepOpen(shop.ent.doorId, false); }
    const inside = shop && dist2d(npc, shop.post) < 4.5 && Math.abs(npc.y - shop.post.y) < 1.2;
    if (inside || W.canSnap(npc)) return this.hideAway(npc, npc.shopLotId, 'sleep');
    return this.goHome(npc);
  }

  /** At the counter: sell, idle, look at the phone; now and then step out for a minute. */
  atPost(npc, first = false) {
    const W = this.w, shop = W.shops.get(npc.shopLotId), r = npc.rng; if (!shop) return this.leisure(npc);
    const p = shop.post;
    if (dist2d(npc, p) > 1.3 || Math.abs(npc.y - p.y) > 1.0) return this.backToPost(npc);
    if (!first && r.next() < 0.17 && this.excursion(npc, shop)) return true;
    const x = r.next(), act = x < 0.5 ? 'sell' : x < 0.78 ? 'idle' : x < 0.9 ? 'phone' : 'wait';
    npc.stand(W, act, span(r, 12, 34), p.ry);
    return true;
  }

  backToPost(npc) {
    const W = this.w, shop = W.shops.get(npc.shopLotId); if (!shop) return false;
    const p = shop.post;
    if (!shop.ent) { W.placeNpc(npc, p.x, p.z, p.y, p.ry); return this.atPost(npc, true); }
    if (!this.enter(npc, shop.ent, [{ x: p.x, z: p.z, y: p.y }], (n) => { n.targetRy = p.ry; this.atPost(n, true); })) { W.revealAt(npc, p.x, p.z, p.y, p.ry); return this.atPost(npc, true); }
    return true;
  }

  /** A short walk out of the shop: sweep the doorstep, lean on the wall, chat at the corner; then back to the post. */
  excursion(npc, shop) {
    const W = this.w, lot = npc.shopLotId, r = npc.rng; if (!shop.ent) return false;
    const kind = pickW(r, [['sweep', 3], ['lean', 3], ['chat', 2]]);
    const spot = W.spots.pick(kind, shop.ent.outside.x, shop.ent.outside.z, r, { indoor: false, maxD: kind === 'chat' ? 22 : 12, filter: (s) => (kind === 'chat' ? (s.occ.length === 0 || (s.waiting && W.byId.get(s.waiting)?.spot === s)) : s.building === lot) });
    if (!spot) return false;
    const e = shop.ent, back = (n) => { this.finish(n); this.backToPost(n); };
    W.spots.claim(spot, npc); npc.spot = spot;
    return npc.walk(W, [e.inside, e.outside, { x: spot.x, z: spot.z, y: spot.y }], (n) => {
      if (kind === 'sweep') { n.prop = 'broom'; n.stand(W, 'sweep', span(n.rng, 14, 30), spot.ry, back); }
      else if (kind === 'lean') n.stand(W, 'lean', span(n.rng, 12, 35), spot.ry, back);
      else { this.chatHere(n, spot); n.then = back; }
    }, this.speedFor(npc, { slow: true }));
  }

  // ---- work ----------------------------------------------------------------------------------------------------------------------------------------
  siteWork(npc, o = {}) {
    const W = this.w, lot = W.lots.byId.get(npc.siteLotId), r = npc.rng;
    if (!lot) return this.leisure(npc, o);
    const ent = W.spots.entrance(lot.id, ['main', 'shop']), c = ent?.outside ?? { x: lot.x, z: lot.z, y: lot.y };
    const near = (n) => W.inMain(n.i) && n.kind !== 'door' && dist2d(n, c) < 13;
    const nodes = W.nav.nodes.filter(near); if (!nodes.length) return this.leisure(npc, o);
    const nd = nodes[Math.floor(r.next() * nodes.length)];
    const dwell = (n, act, secs, face) => { n.stand(W, act, secs, face, null); };
    const go = (n) => {
      const x = r.next();
      if (x < 0.45) { n.prop = 'bundle'; n.carry = false; dwell(n, 'carry', span(r, 4, 9), yawTo(n.x, n.z, c.x, c.z)); }
      else if (x < 0.62) dwell(n, 'point', span(r, 3, 7), yawTo(n.x, n.z, c.x, c.z));
      else if (x < 0.8) dwell(n, 'talk', span(r, 5, 12), n.ry + 0.6);
      else dwell(n, 'phone', span(r, 6, 14), n.ry);
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
    const nodes = W.nav.nodes.filter((n) => W.inMain(n.i) && n.kind !== 'door' && dist2d(n, lm) < 9);
    if (!nodes.length) return this.leisure(npc, o);
    const nd = nodes[Math.floor(r.next() * nodes.length)];
    const here = (n) => n.stand(W, pickW(r, [['idle', 4], ['phone', 3], ['wait', 2], ['talk', 1]]), span(r, 10, 35), yawTo(n.x, n.z, lm.x, lm.z) + (r.next() - 0.5));
    if (o.instant) { W.placeNpc(npc, nd.x + (r.next() - 0.5), nd.z + (r.next() - 0.5), nd.y, r.range(-Math.PI, Math.PI)); here(npc); return true; }
    return this.goPoint(npc, nd, here, { snapD: 14 }) || this.leisure(npc, o);
  }

  /** The street seller: a basket on the arm, a few minutes at each plaza corner. */
  sellRoute(npc, o = {}) {
    const W = this.w, r = npc.rng;
    const nodes = W.nav.nodes.filter((n) => W.inMain(n.i) && (n.kind === 'plaza' || n.kind === 'court'));
    if (!nodes.length) return this.leisure(npc, o);
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
    const nn = W.nav.nearest(npc.x, npc.z, 16, npc.y), unseen = W.canSnap(npc), n = npc.unstuckCount;
    if (path && npc.pi < path.length && ((n % 3 === 0 && unseen) || n >= 6)) {          // hop over whatever is in the way: to the waypoint, or the one after
      const pt = path[Math.min(path.length - 1, npc.pi + (n >= 6 ? 1 : 0))]; W.placeNpc(npc, pt.x, pt.z, pt.y, npc.ry); npc.pi = Math.min(path.length, npc.pi + 1); npc.stuckT = 0; npc.hops = (npc.hops ?? 0) + 1; return;
    }
    if (n % 3 === 0 && unseen && nn >= 0) { W.snapToNode(npc, nn); this.idleHere(npc); return; }
    if (n % 3 === 1 && nn >= 0 && npc.goal != null && npc.goal !== nn) { if (this.goNode(npc, nn, npc.goal, npc.arrive)) return; }
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
