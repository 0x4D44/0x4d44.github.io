// People indoors (round 4: "nobody inside buildings"). Whoever the brain has put inside a building (asleep, a stay at home, a visit to the clinic or the hall, the nurse on duty, the workman
// at the workshop's bench) is hidden, so a visitor who walked in found empty rooms. While the PLAYER is in the building or near it, they are drawn: each on a place of the interiors' anchors
// that fits the room, doing what that room is for (cooking at the stove, eating at the table, in front of the television on the sofa, washing at the sink, hanging the washing, the child at
// her homework, the old man asleep in his chair, in bed at night). When the player goes away they are hidden again, and the brain's own flow (the door, the walk to the next thing) goes on.
// Somebody who comes through the door while the player is looking walks on to their place; somebody whose stay ends while the player is looking walks out of the door. Nobody is ever
// moved in front of the player's eyes: a person the player can see and who cannot walk to where they must be (another storey) stays where they are until the player looks away.
// Nothing is drawn while nobody is near, so the barrio's cost does not change (at most MAX_DRAWN people indoors at once, each within LIVE_R metres of the player's building).
// PURE (no THREE, no DOM): `PeopleSim.step` calls `update()`; the world draws whoever is not `away` and lays down the one who `lieH` says is in bed.
import { awake, blockAt, homeActs } from './schedule.js';
import { isTwin, TWIN_R } from './twins.js';

const EVERY = 0.25;                  // seconds between two looks at who is where
export const LIVE_R = 12;            // metres from a building's footprint: the people inside it are drawn (the furnishings show from 28)
export const LIVE_OFF = 16;          // and hidden again beyond this (no flicker on the threshold)
export const MAX_DRAWN = 18;         // people drawn indoors at once
const SAME_FLOOR = 1.6;              // metres of height: the player indoors sees the floor they are on
const SHOWN_DOWN = 1.2, SHOWN_UP = 4.2;   // the player in the street sees through the windows of the ground floor and the first one
const WALK_IN = 3.5;                 // seconds after coming through the door in which somebody walks on to their place (not later: they were hidden a while)
const RETRY = 4;                     // seconds before a person with no place is looked at again
const STAIRS = 5;                    // seconds a person upstairs takes to come down and out once their stay is over and the player in the street has seen them go from the window

const DINING = new Set(['dining', 'kitchen']), LIVING = new Set(['living', 'dining', 'hall']), BEDS = new Set(['bedroom']);
const NO_SIT = new Set(['terrace', 'patio', 'balcony', 'bathroom', 'shop', 'stairwell', 'landing', 'corridor', 'entry', 'backroom', 'garage']);

/** FNV-1a: the same text gives the same number everywhere (no Math.random: a person who is drawn again in the same half hour is in the same place). */
const h32 = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
const frac = (s) => (h32(s) % 100003) / 100003;
/** The flat a household id belongs to: 'L71.f1.young' and 'L71.f1.' are both flat 'L71.f1' (a house's 'L28.all.family' is 'L28.all'). */
export const flatOf = (id) => { const m = /^([^.]+\.[^.]+)\./.exec(id ?? ''); return m ? m[1] : (id ?? ''); };
const pickSeeded = (bag, seed) => { let t = 0; for (const [, w] of bag) t += w; let r = frac(seed) * t; for (const [v, w] of bag) { r -= w; if (r <= 0) return v; } return bag[bag.length - 1][0]; };

/** The anchors a kind of scene can use, by the anchor's kind and the type of room it is in (exported for the table test). */
export const WANT = {
  sleep: (a) => a.kind === 'sleep' && !a.tagSet.has('crib'),
  cook: (a) => a.kind === 'cook',
  wash: (a) => a.kind === 'wash',
  laundry: (a) => a.kind === 'laundry',
  sweep: (a) => a.kind === 'sweep' && !NO_SIT.has(a.rtype),
  eat: (a) => a.kind === 'sit' && DINING.has(a.rtype),
  homework: (a) => (a.kind === 'sit' && (DINING.has(a.rtype) || LIVING.has(a.rtype))) || (a.kind === 'work' && !a.tagSet.has('school') && !NO_SIT.has(a.rtype)),
  tv: (a) => a.kind === 'tv' && !NO_SIT.has(a.rtype),
  read: (a) => a.kind === 'read' || ((a.kind === 'sit' || a.kind === 'tv') && (LIVING.has(a.rtype) || BEDS.has(a.rtype))),
  phone: (a) => (a.kind === 'tv' || a.kind === 'sit') && LIVING.has(a.rtype),
  sit: (a) => (a.kind === 'sit' || a.kind === 'tv') && !NO_SIT.has(a.rtype),
  pray: (a) => a.kind === 'pray' && a.tagSet.has('home'),
  play: (a) => a.kind === 'play',
  // places of work and of the visits
  nurse: (a) => a.kind === 'stand' && a.tagSet.has('doctor'),
  nurse2: (a) => (a.kind === 'customer' || a.kind === 'lean' || a.kind === 'counter') && !NO_SIT.has(a.rtype ?? ''),
  wait: (a) => a.kind === 'sit' && a.tagSet.has('waiting'),
  bench: (a) => a.kind === 'work' && !a.tagSet.has('school'),
  meet: (a) => a.kind === 'sit' && !NO_SIT.has(a.rtype ?? ''),
  altar: (a) => a.kind === 'pray' && a.tagSet.has('chapel'),
  pew: (a) => a.kind === 'sit' && a.tagSet.has('pray'),
};
/** What the person does on it: the act (animation and opening line), whether seated or lying. */
const DOING = {
  sleep: { act: 'sleep', lie: true }, cook: { act: 'cook' }, wash: { act: 'wash' }, laundry: { act: 'laundry' }, sweep: { act: 'sweep', prop: 'broom' },
  eat: { act: 'eat', sit: true }, homework: { act: 'homework', sit: true }, tv: { act: 'tv', sit: true }, read: { act: 'read', sit: true }, phone: { act: 'phone', sit: true }, sit: { act: 'sit', sit: true },
  pray: { act: 'pray' }, play: { act: 'fidget' },
  nurse: { act: 'idle' }, nurse2: { act: 'idle' }, wait: { act: 'sit', sit: true }, bench: { act: 'repair' }, meet: { act: 'sit', sit: true }, altar: { act: 'pray' }, pew: { act: 'sit', sit: true },
};

export class Homelife {
  constructor(world) { this.w = world; this.drawn = new Set(); this.next = 0; this.was = undefined; this.wasY = 0; this._box = new Map(); this._info = new Map(); }

  // ---- the buildings -------------------------------------------------------------------------------------------------------------------------
  /** The bounding box of a building's footprint, or null. */
  box(lot) {
    let b = this._box.get(lot);
    if (b === undefined) {
      const fp = this.w.ctx.buildings?.get?.(lot)?.footprint; b = null;
      if (fp?.length) { b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }; for (const [x, z] of fp) { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z); } }
      this._box.set(lot, b);
    }
    return b;
  }
  /** Metres from (x, z) to the building's footprint box (0 inside it). */
  gap(lot, x, z) { const b = this.box(lot); return b ? Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1)) : Infinity; }

  /** The anchors of a building with the type and household of the room each is in. */
  info(lot) {
    let I = this._info.get(lot);
    if (!I) {
      const bp = this.w.ctx.buildings?.get?.(lot), rooms = bp?.interior?.rooms ?? {};
      const anchors = this.w.spots.all.filter((s) => s.src === 'anchor' && s.building === lot);
      for (const a of anchors) { const r = rooms[a.room]; a.rtype = r?.type ?? null; a.hh = r?.hh ?? null; }
      I = { lot, anchors, flats: ['apartments', 'tenement'].includes(this.w.lots?.byId?.get(lot)?.kind) };
      this._info.set(lot, I);
    }
    return I;
  }

  /** Is the building one whose people the player may see now? Inside it: always. Outside, near it (the hysteresis keeps a person who is drawn drawn a little further out). `inside` = the lot the player is in, if known. */
  live(lot, drawnNow = false, inside = this.w.lotAt(this.w.player.x, this.w.player.z)) {
    const P = this.w.player;
    if (inside) return inside === lot;                                    // indoors, the building the player is in is the only one with people to look at
    return this.gap(lot, P.x, P.z) <= (drawnNow ? LIVE_OFF : LIVE_R);
  }
  /** Is the storey at height y one the player sees into? */
  shown(y) {
    const W = this.w, P = W.player, dy = y - P.y;
    return W.lotAt(P.x, P.z) ? Math.abs(dy) <= SAME_FLOOR : dy >= -SHOWN_DOWN && dy <= SHOWN_UP;
  }

  // ---- what each does where ------------------------------------------------------------------------------------------------------------------
  /**
   * The scenes (and their weights) of somebody indoors for `why` in a building of this kind at `hour`. A shopkeeper's night begins when the shop closes, long before bed time: until then
   * (and from getting up until the shop opens) the household is up and about the flat upstairs like any other.
   */
  actsFor(n, lot, why, hour) {
    const kind = this.w.lots?.byId?.get(lot)?.kind;
    if (why === 'sleep') return awake(n, hour) ? homeActs(n, hour) : [['sleep', 1]];
    if (why === 'work') return kind === 'clinic' ? [['nurse', 3], ['nurse2', 1]] : kind === 'workshop' ? [['bench', 1]] : homeActs(n, hour);
    if (why === 'visit') return kind === 'clinic' ? [['wait', 1]] : kind === 'hall' ? [['meet', 1]] : kind === 'chapel' ? [['altar', 3], ['pew', 3]] : homeActs(n, hour);
    return homeActs(n, hour);                                                                      // 'home'
  }

  /** The households that have a resident living in building `lot` (their beds are theirs: nobody else lies in them). */
  owners(lot) {
    const I = this.info(lot);
    return (I.owners ??= new Set(this.w.npcs.filter((m) => m.homeLotId === lot && m.household?.id).map((m) => m.household.id)));
  }

  /**
   * The free anchors of `kind` this person may use in building `lot`, from the nearest to home outwards: their own household's rooms; the rest of their flat (the households of a block of flats
   * are 'L71.f1.young' for the bedroom and 'L71.f1.' for the living room and kitchen of the floor); then the whole building (a block that keeps its kitchen on the ground floor for everybody).
   * A bed is the exception to the last step: a bed of a household with its own resident is not lain in by a stranger.
   */
  candidates(n, lot, kind) {
    const I = this.info(lot), want = WANT[kind]; if (!want) return [];
    const S = this.w.spots, hh = n.household?.id ?? null;
    let ok = I.anchors.filter((a) => S.free(a) && want(a));
    if (kind === 'meet' && ok.some((a) => a.rtype === 'hall')) ok = ok.filter((a) => a.rtype === 'hall');          // the meeting is in the hall itself, not in the committee room upstairs
    if (!ok.length || !hh) return ok;
    let c = ok.filter((a) => a.hh === hh); if (c.length) return c;
    const flat = flatOf(hh); c = ok.filter((a) => flatOf(a.hh) === flat); if (c.length) return c;
    if (kind === 'sleep') { const mine = this.owners(lot); c = ok.filter((a) => !mine.has(a.hh)); return c; }
    return ok;
  }

  /** The anchor for this scene: the household eats and watches together (a spot in a room where a housemate already is counts more), otherwise the seed decides. */
  find(n, lot, kind, seed) {
    const twins = [...this.drawn].filter((m) => isTwin(n, m));
    const list = this.candidates(n, lot, kind).filter((a) => !twins.some((m) => Math.hypot(m.st.x - a.x, m.st.z - a.z) < TWIN_R && Math.abs(m.st.y - a.y) < 2.5));      // never beside one of the same character (R3-006)
    if (!list.length) return null;
    const peers = [...this.drawn].filter((m) => m !== n && m.scene?.lot === lot && m.household?.id && m.household.id === n.household?.id), rooms = new Set(peers.map((m) => m.scene.spot.room));
    const bag = list.map((a) => [a, 1 + (rooms.has(a.room) ? 4 : 0)]);
    return pickSeeded(bag, seed + ':' + kind);
  }

  /** The scene for `n` in building `lot`: { lot, why, kind, spot, act, ry, sit, lie, prop } or null when the building has no place for what they would do. */
  choose(n, lot, why, hour) {
    const bucket = Math.floor(hour * 2), seed = `${n.id}|${lot}|${why}|${bucket}`, bag = this.actsFor(n, lot, why, hour).slice();
    let k = 0;
    while (bag.length) {
      const kind = pickSeeded(bag, seed + ':' + k++); bag.splice(bag.findIndex(([v]) => v === kind), 1);
      const spot = this.find(n, lot, kind, seed);
      if (spot) return this.sceneOf(n, lot, why, kind, spot, seed);
    }
    if (why === 'sleep' && !awake(n, hour)) return null;                // (a bed they have not got: nothing to see)
    const spot = this.find(n, lot, 'sit', seed);                        // nothing they would do has a place: sit somewhere
    return spot ? this.sceneOf(n, lot, why, 'sit', spot, seed) : null;
  }
  sceneOf(n, lot, why, kind, spot, seed) {
    let d = DOING[kind];
    if (kind === 'play' && n.age !== 'kid') d = { act: 'idle' };
    return { lot, why, kind, spot, act: d.act, ry: spot.ry, sit: d.sit ? (spot.seatH ?? 0.45) : null, lie: d.lie ? (spot.seatH ?? 0.5) : null, prop: d.prop ?? null, variant: frac(seed + ':v') < 0.3 ? 1 : 0, arrived: false };
  }

  // ---- drawing and hiding --------------------------------------------------------------------------------------------------------------------
  update() {
    const W = this.w; if (W.t < this.next) return; this.next = W.t + EVERY;
    if (!W.spots || !W.player) return;
    const hour = W.hour, P = W.player, inside = W.lotAt(P.x, P.z);
    if (inside !== this.was || Math.abs(P.y - this.wasY) >= 2) { this.was = inside; this.wasY = P.y; for (const n of W.npcs) n.sceneRetry = 0; }          // another building or another storey: whoever had no place to be seen at gets another look
    for (const n of [...this.drawn]) this.check(n, hour, inside);
    if (this.drawn.size >= MAX_DRAWN) return;
    const by = new Map();
    for (const n of W.npcs) {
      if (!n.away || n.emerging || !n.inLot || n.awayWhy === 'school' || W.t < (n.sceneRetry ?? 0) || !this.live(n.inLot, false, inside)) continue;
      if (W.brain.stayOver(n, blockAt(n, hour))) continue;                                       // their time is up: the brain brings them out of the door (drawn again here, they would be sent away and drawn again for ever)
      (by.get(n.inLot) ?? by.set(n.inLot, []).get(n.inLot)).push(n);
    }
    if (!by.size) return;
    for (const [lot, list] of [...by].sort((a, b) => this.gap(a[0], P.x, P.z) - this.gap(b[0], P.x, P.z))) {
      for (const n of list) { if (this.drawn.size >= MAX_DRAWN) return; this.draw(n, lot, hour); }
    }
  }

  /** Draw `n`, who is hidden in `lot`, on the place the building has for what they do now. Returns true when they are drawn. `force`: on whatever storey it is, and not walking in from the door. */
  draw(n, lot, hour, force = false) {
    const W = this.w, why = n.awayWhy, sc = this.choose(n, lot, why, hour);
    if (!sc || (!force && !this.shown(sc.spot.y))) { n.sceneRetry = W.t + RETRY; return false; }
    const ent = W.spots.entrance(lot, ['main', 'shop']), s = sc.spot, to = !force && W.t - n.justIn < WALK_IN ? this.approach(sc, ent) : null;
    W.spots.claim(s, n); n.spot = s; n.scene = sc; this.drawn.add(n);
    if (to) {                                                                                         // they have just come in: on to their place (a chair or a bed is walked up to, not into)
      W.revealAt(n, ent.inside.x, ent.inside.z, ent.inside.y, ent.yawIn ?? 0);
      n.walk(W, W.brain.indoors(ent, ent.inside, [{ x: to.x, z: to.z, y: s.y }]), (m) => this.begin(m), W.brain.speedFor(n, { slow: true }));
      return true;
    }
    W.revealAt(n, s.x, s.z, s.y, sc.ry); this.begin(n);
    return true;
  }

  /**
   * Reviewer helper (world.js lookAtNpc): draw somebody who is hidden in a building on their scene NOW, wherever the player is and whatever the storey (the player is about to be put in front of
   * them; the next look keeps them drawn while the player is there and hides them when the player has gone). True when they are drawn.
   */
  reveal(n) {
    if (!n.away || !n.inLot || n.emerging || n.awayWhy === 'school' || !this.w.spots) return false;                  // (the pupils are the classroom's)
    return this.draw(n, n.inLot, this.w.hour, true);
  }

  /**
   * Free floor on the anchor's own level, `lo` to `hi` metres from it: the nearest first, and on the side the anchor faces before the others (one gets up from a chair towards its front, out
   * of a bed over its foot). `ok(p)` may refuse a point. null when the room has none.
   */
  floorNear(s, lo, hi, ok = null) {
    const ph = this.w.physics, face = s.ry ?? 0; let best = null, bs = Infinity;
    for (let r = lo; r <= hi + 1e-6; r += 0.15) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r, score = r + 0.3 * Math.abs(Math.atan2(Math.sin(a - face), Math.cos(a - face)));
      if (score >= bs || ph?._overlaps?.(x, z, s.y, 0.26, 1.5) || Math.abs((ph?.groundAt?.(x, z, s.y + 0.8) ?? s.y) - s.y) > 0.15) continue;
      const p = { x, z, y: s.y }; if (ok && !ok(p)) continue;
      best = p; bs = score;
    }
    return best;
  }
  /** The bedside: free floor 0.9 to 1.5 m from the bed (a bed is walked up to, not into). */
  beside(s) { return this.floorNear(s, 0.9, 1.5); }
  /**
   * The place on the storey of the door `ent` that joins the door and scene `sc` (the walk in to the scene, the walk out of it): the anchor itself when the door reaches it and it is a place to
   * stand (the cooker, the sink); a chair, a bench or a bed is no place to walk from or to (the piece of furniture is a closed outline, and a bench of the clinic is wide enough to shut a body
   * in it, not wide enough to let it out: the walker pushed at the end of the bench for four seconds and was thrown out of the building), so for those the free floor beside it that the door
   * does reach. null when there is none, or the scene is on another storey.
   */
  approach(sc, ent) {
    const W = this.w, s = sc.spot, reach = (p) => W.canReach(ent, p), seat = sc.lie != null || sc.sit != null;
    if (!ent?.inside || Math.abs(ent.inside.y - s.y) >= 0.6) return null;
    if (!seat && reach(s)) return s;
    return this.floorNear(s, sc.lie != null ? 0.9 : 0.3, sc.lie != null ? 1.5 : 1.4, reach);
  }

  /** On the place: seated, lying, or at work there, until the stay is over or the player goes away. */
  begin(n) {
    const W = this.w, sc = n.scene; if (!sc) return;
    sc.arrived = true; n.sitH = sc.sit; n.lieH = sc.lie; n.prop = sc.prop; n.talkVariant = sc.variant;
    n.st.x = sc.spot.x; n.st.z = sc.spot.z; n.lastX = n.st.x; n.lastZ = n.st.z; n.ry = n.targetRy = sc.ry;
    n.stand(W, sc.act, 1e9, sc.ry);
  }

  /** One look at somebody who is drawn: still wanted here, or time to go out of sight, or time to walk out. */
  check(n, hour, inside) {
    const W = this.w, sc = n.scene;
    if (!sc || n.away) { this.drawn.delete(n); return; }
    if (n.mode === 'talk' || n.convo || n.reactTok != null) return;                                    // never in the middle of a conversation
    const here = this.live(sc.lot, true, inside) && this.shown(sc.spot.y);
    if (!here) { if (!n.moving || W.unseen(n)) this.dismiss(n); return; }
    if (!sc.arrived) return;                                                                         // still walking to their place
    const blk = blockAt(n, hour);
    if ((sc.why === 'home' || sc.why === 'sleep') && sc.kind !== 'sleep' && blk === 'sleep' && !awake(n, hour)) { this.bedtime(n, sc, hour); return; }      // (at their own home: to bed)
    if (!W.brain.stayOver(n, blk, sc.why)) return;
    // the stay is over (or the day has moved on): out of the door when they can walk there, else out of sight
    if (W.unseen(n)) { this.dismiss(n); return; }
    const ent = W.spots.entrance(sc.lot, ['main', 'shop']);
    if (!ent?.inside || Math.abs(ent.inside.y - sc.spot.y) > 0.6) {                                  // upstairs, and no way for them to walk down in front of the player
      if (inside === sc.lot) return;                                                                 // the player is up there with them: they stay as they are until the player goes (nobody is moved in front of the eyes)
      this.dismiss(n, STAIRS); return;                                                               // seen from the street through a window: down the stairs, out of sight; the brain brings them out of the door
    }
    const from = this.approach(sc, ent); if (!from) return;                                          // (no way to the door from where they sit or lie: they wait)
    if (from !== sc.spot) W.placeNpc(n, from.x, from.z, sc.spot.y, n.ry);                            // up out of the chair or the bed, onto the floor beside it
    this.leave(n, ent);
  }

  /** Bed time comes while they are at home and in sight: to bed if the bed is on this storey and a way leads there, else on as they were until the player looks away. */
  bedtime(n, sc, hour) {
    const sc2 = this.choose(n, sc.lot, 'sleep', hour);
    if (sc2 && this.swap(n, sc2)) return;
    if (this.w.unseen(n)) { sc.why = 'sleep'; this.dismiss(n); }
  }

  /** Go on to another scene in the same building: claim its place and walk there (the same storey and a way through the doors); false when they cannot. */
  swap(n, sc2) {
    const W = this.w, s = sc2.spot, to = sc2.lie != null ? this.beside(s) : s, ent = W.spots.entrance(sc2.lot, ['main', 'shop']), old = n.scene;
    if (!to || !ent?.inside || Math.abs(s.y - n.st.y) > 0.6) return false;
    const conn = (p) => W.indoor.connected(sc2.lot, p, to, s.y).ok;
    const seat = old.sit != null || old.lie != null;
    const from = !seat && conn(n.st) ? n.st : this.floorNear(old.spot, 0.3, 1.4, conn) ?? (conn(n.st) ? n.st : null);      // (a chair is no place to walk from: up onto the floor beside it)
    if (!from) return false;
    if (from !== n.st) W.placeNpc(n, from.x, from.z, old.spot.y, n.ry);
    W.spots.claim(s, n); n.spot = s; n.sitH = null; n.lieH = null; n.prop = null; n.scene = sc2; sc2.arrived = false;
    n.walk(W, W.brain.indoors(ent, n.st, [{ x: to.x, z: to.z, y: s.y }]), (m) => this.begin(m), W.brain.speedFor(n, { slow: true }));
    return true;
  }

  /** Hide `n` again where they are (the building is empty of eyes): the brain goes on from there. `wait` seconds more before the brain lets them out of the door (the way down the stairs). */
  dismiss(n, wait = 0) {
    const W = this.w, sc = n.scene; this.drawn.delete(n); if (!sc) return;
    const until = n.stayUntil; W.brain.hideAway(n, sc.lot, sc.why); n.stayUntil = until; n.downAt = W.t + wait;
  }

  /** The stay is over and they are in sight: out through the door the way anybody leaves. */
  leave(n, ent) {
    const W = this.w, sc = n.scene; this.drawn.delete(n);
    if (sc.why === 'home' || sc.why === 'visit') n.stayCool = W.t + 100;
    W.brain.finish(n); n.block = blockAt(n, W.hour);                 // (the day has moved on - school, work, bed - and the brain takes it up at the street, not now: from inside a wall the street graph is no way out)
    W.brain.leaveBuilding(n, ent);
  }
}
