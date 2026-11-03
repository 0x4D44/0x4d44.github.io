// First-person controller (owner: A1).
// Camera convention: yaw 0 looks toward -z (north, uphill). forward = (-sin yaw, -cos yaw).
//
// Public surface (kept stable; other modules read it):
//   s {x,y,z,vy,onGround,blocked,ground}   feet position + physics state      yaw, pitch   radians       eyeY   camera height
//   building (lot id | null)  indoors (bool)  room (Room | null)  floor (index)  surface ('asphalt'|'wood'|...)  speed  sprinting  crouching
//   lock(reason) / unlock(reason) / locked   freeze movement + look (dialogue, menus)        input {f,s,sprint,jump,crouch}  programmatic input
//   teleport(x, z, {y|floor, yaw, pitch, swim})    setLook(yaw, pitch)      attach(canvas)      update(dt)
//   water {mode: 'dry'|'wade'|'deep'|'swim', depth, under, diving, breath {t,low,lift}, breathSoft, ...}   swimming  submerged   the sea under the feet (engine/swim.js; south of the plot's edge only)
// Events emitted: player:step {foot,surface,speed,sprint,crouch,x,y,z}  player:land {speed,surface}  player:jump  player:teleport {x,y,z}
//                 player:unstuck {x,y,z,how: 'moved' | 'crossed'}  (the stall net put the player outside a pocket: see _stallNet)
//                 player:enter {buildingId,floor}  player:exit {buildingId}  player:floor {buildingId,floor}
//                 the water: player:swim {on,how: 'walk'|'plunge'|'teleport'|'ladder',x,y,z}  player:splash {speed,depth,x,y,z} (a fall into the sea)  player:stroke {foot,speed,fast,under,x,y,z}
//                 player:dive / player:surface {x,y,z} (the head goes under / comes out)  player:breath {phase: 'low'|'lift'|'gasp', t}  player:climb {id,x,y,z}  player:whistle {x,z} (the lifeguard)
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { clamp } from '../core/util.js';
import { SEA, Z0 } from '../world/coast.js';
import { SurfaceMap } from './surface.js';
import { seaOf } from './seaview.js';
import * as SW from './swim.js';

const SENS = 0.0022;                                  // radians per pixel at sensitivity 1.0
const PITCH = 1.5;                                    // ~86 degrees
const ACCEL = 13, DECEL = 12, AIR = 2.4;              // velocity smoothing rates (1/s)
const COYOTE = 0.12, JUMP_BUFFER = 0.14, JUMP_COOL = 0.22;
const STRIDE = { walk: 0.72, sprint: 1.05, crouch: 0.5 };   // metres per footstep
const wrap = (a) => (a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a);
const STALL_TIME = 1.2, STALL_DIST = 0.1, STALL_IDLE = 0.5, STALL_HINT_EVERY = 20;   // the stall net: seconds held, metres that count as "got somewhere", seconds of released keys that reset it, seconds between hints
const PORTRAIT_FOV_MAX = 90;                           // vertical degrees: wider than this on a tall narrow screen is a fisheye (review R2-007)

/** Vertical field of view for a screen shape: the setting in landscape; on a tall narrow screen it is widened (up to 1.35x: little shows sideways) but never
 *  above 90 degrees, sprint kick included. */
export function viewFov(base, aspect, kick = 0) {
  const v = base * (aspect < 1 ? clamp(1 + (1 - aspect) * 0.85, 1, 1.35) : 1) + kick;
  return aspect < 1 ? Math.min(v, PORTRAIT_FOV_MAX) : v;
}

/** World-space footprint of a lot that has no BuildingPlan footprint yet (rectangle w x d at (x,z), rotated rotY). */
function lotFootprint(l) {
  if (!l || !(l.w > 0)) return null;
  const c = Math.cos(l.rotY ?? 0), s = Math.sin(l.rotY ?? 0), hw = l.w / 2, hd = l.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [l.x + x * c + z * s, l.z - x * s + z * c]);
}
function inPoly(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.s = { x: 0, y: 0, z: 0, vy: 0, onGround: false };
    this.yaw = 0; this.pitch = 0;
    this.vx = 0; this.vz = 0;
    this.crouch = 0; this.crouching = false;           // crouch = eased 0..1, crouching = the wanted state (headroom aware)
    this.camY = 0; this.bob = 0; this.bobAmt = 0; this.dip = 0; this.fovKick = 0; this.roll = 0;
    this.input = { f: 0, s: 0, sprint: false, jump: false, crouch: false };
    this.keys = new Set(); this.locks = new Set();
    this.building = null; this.indoors = false; this.room = null; this.floor = 0; this.surface = 'concrete';
    this.speed = 0; this.sprinting = false;
    this.mdx = 0; this.mdy = 0; this.skipMove = 0; this.dragOnly = false; this.lockErrors = 0;
    this.jumpPrev = false; this.jumpBuf = 0; this.jumpCool = 0; this.sinceGround = 0; this.lastVy = 0;
    this.stride = 0; this.foot = 0; this.safe = { x: 0, y: 0, z: 0, t: 0 }; this.warnedBounds = false;
    this._stall = { x: 0, z: 0, t: 0, idle: 0, done: false, clock: 0, hintAt: -1e9 };            // the stall net's anchor and timers (_stallNet)
    this.eye = new THREE.Vector3(); this._dir = new THREE.Vector3();
    this.surfaces = new SurfaceMap(null); this._surfAt = { x: 1e9, z: 1e9 };
    this._blds = null; this.canvas = null;
    this.water = SW.newWater();                        // the sea under the feet: mode, breath, the dive (engine/swim.js). All of it stays 'dry' off the beach.
    this.wetOff = 0;                                   // the swimmer's eye less the land law's (eyeY = camY + eye - crouch + wetOff): eased in and out, exactly 0 on land
    this._onFloor = false;                             // the feet are on a collider floor (the pier's or the raft's deck): the sea under them does not wet them
    this._sl = [0, 0];
  }

  get pos() { return this.s; }
  get eyeY() { return this.camY + CONFIG.PLAYER.eye - (CONFIG.PLAYER.eye - CONFIG.PLAYER.crouchEye) * this.crouch + this.wetOff; }
  /** In the water with the feet off the ground (swimming or diving). */
  get swimming() { return this.water.mode === 'swim'; }
  /** The head is under the surface (the camera looks from under it: the water look, the breath). */
  get submerged() { return this.water.under; }
  /** Hold the player (a conversation: 'dialogue'). Events 'player:lock' / 'player:unlock' { reason } on a change; ui/flow.js lets go of the pointer for a talk. */
  lock(reason = 'lock') { if (this.locks.has(reason)) return; this.locks.add(reason); this.ctx.events?.emit('player:lock', { reason }); }
  unlock(reason = 'lock') { if (this.locks.delete(reason)) this.ctx.events?.emit('player:unlock', { reason }); }
  get locked() { return this.locks.size > 0; }

  setLook(yaw, pitch = this.pitch) { this.yaw = wrap(yaw); this.pitch = clamp(pitch, -PITCH, PITCH); }

  /** Put the player at (x,z). o: { y | floor (index into the ascending surface list there, 0 = lowest), yaw, pitch, swim }. `swim` puts him in the sea at (x, z), at the surface or, with `y`, at that depth. */
  teleport(x, z, o = {}) {
    const s = this.s, ph = this.ctx.physics, C = this.ctx.plan?.coast;
    s.x = x; s.z = z; s.vy = 0; s.onGround = false; this.vx = this.vz = 0; this.dip = 0; this.jumpBuf = 0;
    const hs = ph.heightsAt(x, z);
    s.y = o.y ?? (o.swim && C ? SW.swimY() : hs.length ? hs[Math.min(o.floor ?? 0, hs.length - 1)] : 0);
    if (o.yaw != null) this.yaw = wrap(o.yaw);
    if (o.pitch != null) this.pitch = clamp(o.pitch, -PITCH, PITCH);
    this.crouch = 0; this.crouching = false;
    const wasSwim = this.water.mode === 'swim';
    this.water = SW.newWater(); this.wetOff = 0; this._onFloor = false;                        // (a teleport leaves the sea: the next update() finds the water again, wherever he is)
    if (o.swim && C) ph.move(s, 0, 0, 0.001, { height: SW.BODY, gravity: 0 }); else ph.move(s, 0, 0, 0.001);
    this.camY = s.y; this.safe = { x: s.x, y: s.y, z: s.z, t: 0 };
    this._stall.t = this._stall.idle = 0; this._stall.done = false;
    this._locate(true);
    this._place();
    if (o.swim && C) this._enterSwim('teleport');
    else if (wasSwim) this.ctx.events.emit('player:swim', { on: false, how: 'teleport', x: s.x, y: s.y, z: s.z });     // (the touch buttons read Subir and Bucear only while he swims)
    this.ctx.events.emit('player:teleport', { x: s.x, y: s.y, z: s.z });
  }

  /** Request pointer lock with raw (unaccelerated) mouse input where the browser supports it. */
  lockPointer() {
    const c = this.canvas; if (!c?.requestPointerLock) return;
    // Chrome answers with a promise that REJECTS when the lock is refused (a re-lock within about a second of Esc, a lock after a talk): every promise gets a catch, or the
    // refusal is an 'Uncaught (in promise) DOMException' in the console (rubric cap C1, R2c-012). A refusal is no error here: pointerlockerror counts it, the flow shows its pause card.
    const quiet = (p) => { try { p?.catch?.(() => {}); } catch { /* not a promise */ } };
    const plain = () => { try { quiet(c.requestPointerLock()); } catch { /* denied */ } };
    try { const p = c.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(plain); } catch { plain(); }
  }
  get pointerLocked() { return document.pointerLockElement === this.canvas; }

  attach(dom) {
    const ctx = this.ctx, canvas = this.canvas = dom ?? document.getElementById('gl');
    const down = (e) => {
      const code = typeof e.code === 'string' ? e.code : '';           // a script-made plain Event('keydown') has no code: ignore it, never throw
      if (e.repeat || !code) return;
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      this.keys.add(code);
      if (code === 'KeyE' && !this.locked && ctx.running) ctx.interact.use();
      if ((code === 'Space' || code.startsWith('Arrow')) && ctx.running) e.preventDefault();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.keys.clear(); });
    document.addEventListener('pointerlockchange', () => {
      this.skipMove = 2; this.mdx = this.mdy = 0;
      if (this.pointerLocked) { this.lockErrors = 0; this.dragOnly = false; } else this.keys.clear();
    });
    // a refused lock is often transient (Chrome blocks a re-lock for about a second after Esc): only after repeated failures fall back to drag-to-look
    document.addEventListener('pointerlockerror', () => { if (++this.lockErrors >= 3) this.dragOnly = true; });
    document.addEventListener('mousemove', (e) => {
      if (!ctx.running) return;
      if (!this.pointerLocked && !(this.dragOnly && (e.buttons & 1))) return;
      if (this.skipMove > 0) { this.skipMove--; return; }
      if (Math.abs(e.movementX) > 500 || Math.abs(e.movementY) > 500) return;           // spurious spike some drivers emit on (re)lock
      this.mdx += e.movementX; this.mdy += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !ctx.running) return;
      if (!this.pointerLocked && !this.locked && !ctx.opts.autostart) this.lockPointer();    // not during a talk: a held pointer eats Esc (ui/flow.js); every click asks again, also after three refusals (dragOnly only adds look-by-dragging, it never blocks a new request)
      else if (this.pointerLocked && !this.locked) ctx.interact.use();
    });
  }

  // ---- where am I ----------------------------------------------------------------------------------------------------------
  _index() {
    const out = this._blds = [];
    for (const bp of this.ctx.buildings.values()) {
      const fp = bp.footprint?.length ? bp.footprint : lotFootprint(bp.lot);
      if (!fp) continue;
      const xs = fp.map((p) => p[0]), zs = fp.map((p) => p[1]), lot = bp.lot ?? {};
      const y0 = bp.bounds?.y0 ?? (lot.y ?? 0) - 1.5, y1 = bp.bounds?.y1 ?? (lot.y ?? 0) + (lot.floors ?? 1) * (lot.fh ?? 2.8) + 1.5;
      out.push({ id: bp.id, bp, fp, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y0, y1 });
    }
  }

  /** building / room / indoors / floor from the footprint, then the room rectangles when the plan has them. */
  _locate(quiet = false) {
    if (!this._blds) this._index();
    const s = this.s, ev = this.ctx.events;
    let hit = null;
    for (const b of this._blds) {
      if (s.x < b.x0 || s.x > b.x1 || s.z < b.z0 || s.z > b.z1 || s.y < b.y0 - 0.5 || s.y > b.y1 + 0.5) continue;
      if (inPoly(b.fp, s.x, s.z)) { hit = b; break; }
    }
    let room = null, indoors = false, floor = 0;
    if (hit) {
      const bp = hit.bp, fr = bp.frame;
      const baseY = fr?.y ?? bp.lot?.y ?? 0, ly = s.y - baseY, roofY = bp.roof?.y ?? hit.y1 - 1.5;
      if (fr?.toLocal && bp.rooms?.length) {
        const [lx, , lz] = fr.toLocal(s.x, s.y, s.z);
        // The height test of a room is wide (from 0.45 m below its floor to 0.3 m above its ceiling), so the rooms of two storeys overlap by a hand's breadth and a player
        // standing on the first floor (ly 2.8) is inside the ground-floor room's test too, which `find` met first. The room is the one whose floor is highest under the feet.
        // (R4-202: every one of the 1001 upstairs rooms of the barrio reported the room below, and 196 of 200 upstairs terraces counted as indoors. The light pool, the footstep
        // surface and the indoor blend of the light all read this.)
        room = null;
        for (const r of bp.rooms) {
          if (!r.rect || lx < r.rect.x0 - 0.06 || lx > r.rect.x1 + 0.06 || lz < r.rect.z0 - 0.06 || lz > r.rect.z1 + 0.06) continue;
          const y = r.y ?? 0;
          if (ly >= y - 0.45 && ly < y + (r.h ?? 2.8) + 0.3 && (!room || y > (room.y ?? 0))) room = r;
        }
        indoors = room ? !room.outdoor : s.y < roofY - 0.6;       // between rooms (wall thickness, stairwell, threshold) still counts as inside
      } else indoors = s.y < roofY - 0.6;
      const fl = bp.floors;
      if (fl?.length) { floor = 0; for (let i = 0; i < fl.length; i++) if ((fl[i].y ?? 0) <= ly + 0.35) floor = fl[i].index ?? i; }
      else floor = Math.max(0, Math.round(ly / (bp.lot?.fh ?? 2.8)));
    }
    const id = hit ? hit.id : null;
    this.room = room; this.indoors = indoors;
    if (id !== this.building) {
      const old = this.building; this.building = id; this.floor = floor;
      if (!quiet) { if (old) ev.emit('player:exit', { buildingId: old }); if (id) ev.emit('player:enter', { buildingId: id, floor }); }
    } else if (floor !== this.floor) {
      this.floor = floor; if (id && !quiet) ev.emit('player:floor', { buildingId: id, floor });
    }
  }

  _place() {
    const s = this.s, ctx = this.ctx;
    if (ctx.plan && (!this.surfaces.streets || this.surfaces.plan !== ctx.plan || (this.surfaces.streets.length === 0 && ctx.plan.streets?.length))) this.surfaces.setPlan(ctx.plan);
    const sa = ctx.physics.surfaceAt(s.x, s.z, s.y, 0.35);
    this._onFloor = sa.id != null && !sa.terrain;                      // (on a collider floor: a roof, a slab, the pier's deck, the raft's; the water code reads it: a deck is dry whatever lies under it)
    // (y: the coast says 'jetty' only for feet up on the pier's or the raft's planks, and 'sand' or the shallows for the ground under them)
    this.surface = this.surfaces.kind(s.x, s.z, { indoors: this.indoors, room: this.room, onFloorPatch: this._onFloor, y: s.y });
  }

  // ---- the water (engine/swim.js; dev/FEATURE-BEACH.md 3.1) ---------------------------------------------------------------------
  /** The land law's eye over the feet: 1.64 standing, 1.15 crouched. */
  _landOff() { const P = CONFIG.PLAYER; return P.eye - (P.eye - P.crouchEye) * this.crouch; }
  /** The feet are now at their new height (a step in or out of the water): the camera keeps the eye where it was, and eases to the new law's. */
  _snapEye(eyeOld) { this.camY = this.s.y; this.wetOff = eyeOld - (this.camY + this._landOff()); }

  /**
   * The water under the feet, once a frame south of the plot's edge (and for as long as he is not dry): the depth and the instant's surface (the sea as `seaOf` gives it: the real one, or the pure one before the
   * water is built), the mode with its hysteresis, the entry into and the exit from swimming, and the hint. Returns the speed a wader keeps (1 on dry land).
   */
  _water() {
    const ctx = this.ctx, s = this.s, W = this.water, sea = seaOf(ctx);
    const depth = W.depth = sea.depth(s.x, s.z), surf = W.surf = SEA + sea.level(s.x, s.z);
    const was = W.mode, now = SW.modeFor(depth, was, !this._onFloor && s.y <= surf + SW.WET_UP);
    if (now !== was) {
      if (was === 'swim') this._leaveSwim();
      W.mode = now;
      if (now === 'swim') this._enterSwim('walk');
    }
    if ((now === 'deep' || now === 'swim') && !W.hinted) { W.hinted = true; ctx.ui?.toast(SW.TOAST.hint, 5200); }
    return now === 'wade' || now === 'deep' ? SW.wadeScale(depth) : 1;
  }

  /** The feet leave the ground: a swimmer at rest (0.3 m under the still surface), the eye where it was. `how`: 'walk' (the depth reached 1.55), 'plunge' (a fall into the sea: the feet stay where they crossed the surface), 'teleport'. */
  _enterSwim(how) {
    const ctx = this.ctx, s = this.s, W = this.water, st = ctx.settings?.v ?? {};
    const eyeOld = how === 'teleport' ? SW.eyeFor(s.y, 0, st.seaMotion ?? 1) : this.eyeY;
    this.crouching = false; this.crouch = 0; this.dip = 0; this.sprinting = false; this.jumpBuf = 0; this.sinceGround = 1; this.lastVy = 0;
    if (how === 'walk') s.y = SW.swimY();
    s.vy = 0; s.onGround = false;
    W.mode = 'swim'; W.vy = 0; W.plunge = 0; W.buoy = false; W.climb = null; W.stroke = SW.STROKE; W.diving = false; W.ladderOk = SW.LADDER_GRACE;
    this._snapEye(eyeOld); W.eye = eyeOld;
    ctx.events.emit('player:swim', { on: true, how, x: s.x, y: s.y, z: s.z });
  }

  /** The feet find the ground again (the depth is under 1.30): he stands on it, the eye eases up to his own height. */
  _leaveSwim(how = 'walk') {
    const ctx = this.ctx, s = this.s, W = this.water, eyeOld = this.eyeY;
    s.y = Number.isFinite(s.ground) ? s.ground : ctx.physics.groundAt(s.x, s.z, s.y); s.vy = 0; s.onGround = true; this.lastVy = 0;
    W.vy = 0; W.plunge = 0; W.buoy = false; W.climb = null; W.diving = false;
    this._snapEye(eyeOld);
    if (W.under) { W.under = false; ctx.events.emit('player:surface', { x: s.x, y: s.y, z: s.z }); }
    ctx.events.emit('player:swim', { on: false, how, x: s.x, y: s.y, z: s.z });
  }

  /** A fall that crossed the surface over deep water: 35 % of its speed is left, the water's drag takes the rest (about 0.6 m under after a 1.4 m fall), and buoyancy brings him back up. */
  _plunge(vyIn) {
    const ctx = this.ctx, s = this.s, W = this.water;
    this._enterSwim('plunge');
    W.vy = SW.plungeSpeed(vyIn); W.plunge = SW.PLUNGE_MAX; W.buoy = true;
    ctx.events.emit('player:splash', { speed: -vyIn, depth: W.depth, x: s.x, y: W.surf, z: s.z });
  }

  /**
   * One frame of swimming and diving: the ladders, the current at the south edge, the vertical (C and looking down dive, Space comes up, buoyancy after a plunge, the lift when the breath is gone), the
   * horizontal (slow to start and to stop; along the look when diving), the kernel's walls with `gravity: 0` (it leaves a swimmer's height alone, so the piles, the skirts and the hulls stop him as they stop a
   * walker), the strokes, the lifeguard. The eye and the roll it wants are left in `water` for the camera.
   */
  _swim(dt, f, side, sprintWant, jumpHeld, crouchWant, C) {
    const ctx = this.ctx, s = this.s, W = this.water, P = CONFIG.PLAYER, ph = ctx.physics, st = ctx.settings?.v ?? {}, rest = SW.swimY();
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    W.clock += dt; this.sprinting = false;
    if (W.climb) { this._climb(dt); return; }

    // a ladder: Space, or W when he is facing it (not in the first moments in the water: he jumped in beside it with Space still down)
    const lad = (W.ladderOk -= dt) > 0 ? null : SW.climbAt(C.climbs, s.x, s.z, s.y);
    if (lad) {
      const dx = lad.x - s.x, dz = lad.z - s.z, d = Math.hypot(dx, dz), facing = d < 0.05 || (-sy * dx - cy * dz) / d > 0.3;
      if (jumpHeld || (f > 0.2 && facing)) { this._startClimb(lad); return; }
      if (!W.ladderHinted) { W.ladderHinted = true; ctx.ui?.toast(SW.TOAST.ladder, 4200); }
    }

    // the vertical: what the keys want, then the water's own smoothing (a plunge is drag alone, then buoyancy)
    const diveKey = crouchWant, lookDown = f > 0.2 && this.pitch < SW.DIVE_PITCH, lim = C.limit(s.x, s.z);
    const diving = W.diving = SW.wantsDive(f, this.pitch, diveKey) || s.y < rest - SW.SURFACE_EPS;
    if (diveKey || lookDown) W.buoy = false;                                  // (a deliberate dive takes the water's lift away; Space is going the same way and leaves it)
    const top = (sprintWant && f > 0.2 ? P.swimFast : P.swim) * SW.limitScale(lim.soft);
    let vyT = 0;
    if (W.breath.lift) vyT = P.rise;                                          // out of breath: carried up, whatever the keys say
    else if (diveKey) vyT = -P.dive;
    else if (jumpHeld) vyT = P.rise;
    else if (diving && f > 0.2) vyT = clamp(f * sp * top, -P.dive, P.rise);   // along the look: down when he looks down, up when he looks up
    else if (W.buoy) vyT = SW.BUOY;
    if (W.plunge > 0) { W.vy *= Math.exp(-SW.DRAG * dt); W.plunge -= dt; if (Math.abs(W.vy) < SW.PLUNGE_END) W.plunge = 0; }
    else W.vy += (vyT - W.vy) * (1 - Math.exp(-SW.VY_RATE * dt));
    s.y += W.vy * dt;
    let floor = SW.diveFloor(Number.isFinite(s.ground) ? s.ground : -1e3);
    if (s.y < floor) { s.y = floor; if (W.vy < 0) W.vy = 0; }
    if (s.y > rest && W.plunge <= 0) { s.y = rest; if (W.vy > 0) W.vy = 0; W.buoy = false; }              // (the surface; a plunge starts above it, with the feet where they crossed it)

    // the horizontal: flat at the surface, along the look (x cos pitch) when diving; the current pushes him toward the shore from z 204
    const hz = diving ? cp : 1, tx = (-sy * f * hz + cy * side) * top, tz = (-cy * f * hz - sy * side) * top;
    const a = 1 - Math.exp(-(f || side ? SW.ACCEL : SW.DECEL) * dt);
    this.vx += (tx - this.vx) * a; this.vz += (tz - this.vz) * a;
    const push = SW.limitPush(lim.soft) * dt, xa = s.x, za = s.z;
    s.vy = 0; s.onGround = false;
    ph.move(s, this.vx * dt, this.vz * dt - push, dt, { radius: P.radius, height: SW.BODY, stepUp: P.stepUp, maxSlope: P.maxSlope, gravity: 0 });
    s.vy = 0; s.onGround = false;
    if (dt > 0) {                                                                                      // what he really did is his velocity: against a pile or a hull he stops (no strokes), along one he slides (never more than he asked for: the kernel's escape from a pocket is no stroke)
      const gx = (s.x - xa) / dt, gz = (s.z - za + push) / dt;
      if (Math.hypot(gx, gz) <= Math.hypot(this.vx, this.vz) + 1e-6) { this.vx = gx; this.vz = gz; }
    }
    floor = SW.diveFloor(s.ground);
    if (s.y < floor) { s.y = floor; if (W.vy < 0) W.vy = 0; }                                         // (the seabed rose under him, or the kernel put his feet on it)

    // the lifeguard: from z 207 a whistle, once a minute of swimming, and the toast the first time
    if (s.z >= SW.WHISTLE_Z && W.clock - W.whistleAt >= SW.WHISTLE_EVERY) {
      W.whistleAt = W.clock; ctx.events.emit('player:whistle', { x: s.x, z: s.z });
      if (!W.whistled) { W.whistled = true; ctx.ui?.toast(SW.TOAST.limit, 4600); }
    }
    // the strokes: one every 1.4 s while he moves (the first as he sets off)
    const v = Math.hypot(this.vx, this.vz);
    if (v > 0.3 && (W.stroke += dt) >= SW.STROKE) {
      W.stroke -= SW.STROKE; W.foot ^= 1;
      ctx.events.emit('player:stroke', { foot: W.foot, speed: v, fast: top > P.swim * 1.05, under: W.under, x: s.x, y: s.y, z: s.z });
    }
    // what the camera wants: the eye (on the swell at the surface, in the body's place diving) and the roll with the surface's slope
    const m = st.seaMotion ?? 1, sea = seaOf(ctx);
    W.eye = SW.eyeFor(s.y, W.surf - SEA, m);
    sea.slope(s.x, s.z, undefined, this._sl); W.roll = SW.rollFor(this._sl[0], this._sl[1], this.yaw, m);
  }

  /** He takes the ladder: 0.4 s from where he floats to the deck, the planks under his feet at the end (plan.coast.climbs: `y` the lowest rung, `top` the deck, `exit` where he stands). */
  _startClimb(c) {
    const s = this.s, W = this.water;
    W.climb = { id: c.id, t: 0, x0: s.x, y0: s.y, z0: s.z, x1: c.exit[0], y1: c.top, z1: c.exit[1] };
    this.vx = this.vz = 0; W.vy = 0; W.plunge = 0;
    this.ctx.events.emit('player:climb', { id: c.id, x: s.x, y: s.y, z: s.z });
  }
  _climb(dt) {
    const s = this.s, W = this.water, c = W.climb;
    c.t = Math.min(1, c.t + dt / SW.CLIMB_TIME);
    const u = c.t * c.t * (3 - 2 * c.t);
    s.x = c.x0 + (c.x1 - c.x0) * u; s.z = c.z0 + (c.z1 - c.z0) * u; s.y = c.y0 + (c.y1 - c.y0) * u; s.vy = 0; s.onGround = false;
    W.eye = s.y + SW.eyeUp();
    if (c.t < 1) return;
    W.climb = null; W.mode = 'dry'; W.diving = false; this._onFloor = true; s.onGround = true; this.lastVy = 0; this.vx = this.vz = 0;
    if (W.under) { W.under = false; this.ctx.events.emit('player:surface', { x: s.x, y: s.y, z: s.z }); }
    this.ctx.events.emit('player:swim', { on: false, how: 'ladder', x: s.x, y: s.y, z: s.z });
  }

  /** After the camera: is the head under the surface (the dive and surface events, the breath that runs out under it and refills three times faster in air). */
  _swimAfter(dt) {
    const ctx = this.ctx, W = this.water, s = this.s, under = W.mode === 'swim' && this.eye.y < W.surf - 0.02;
    if (under !== W.under) { W.under = under; ctx.events.emit(under ? 'player:dive' : 'player:surface', { x: s.x, y: s.y, z: s.z }); }
    for (const e of SW.breathStep(W.breath, under, dt)) { if (e === 'lift') W.buoy = true; ctx.events.emit('player:breath', { phase: e, t: W.breath.t }); }
    W.breathSoft = SW.breathSoft(W.breath.t);
  }

  /**
   * The net under every pocket nobody drew a way out of (review R2 found eight by walking into them): movement keys held and the body not 0.1 m from where
   * it was 1.2 s ago. Then the kernel is asked whether it is really shut in (not just against a wall, a shut door or the corner of a big room: those answer
   * 'free' and nothing happens, once per spot). Shut in: put outside, on the side it was walking to, with a toast (through a room wall only when there is
   * no other way: a sealed closet is a modelling error); with no standable spot near at all, a hint (at most every 20 s) about the pause menu's
   * 'Volver al punto de partida'.
   * Frames in the air count (a trapped player hops), the check itself waits for the ground. Keys released for 0.5 s (a conversation locks the keys: the same)
   * or a seat start it over; so does any move of 0.1 m.
   * Returns true when the player was moved.
   */
  _stallNet(dt, want, tx, tz, H) {
    const s = this.s, st = this._stall, ctx = this.ctx, P = CONFIG.PLAYER;
    st.clock += dt;
    if (Math.hypot(s.x - st.x, s.z - st.z) > STALL_DIST || ctx.interiorSit?.active) { st.x = s.x; st.z = s.z; st.t = st.idle = 0; st.done = false; return false; }
    if (!want) { if ((st.idle += dt) > STALL_IDLE) { st.t = 0; st.done = false; } return false; }
    st.idle = 0; st.t += dt;
    if (st.done || st.t < STALL_TIME || !s.onGround) return false;
    st.done = true;
    const how = ctx.physics.rescue(s, tx, tz, { radius: P.radius, height: H, stepUp: P.stepUp, maxSlope: P.maxSlope });
    if (how === 'free') return false;
    if (how === 'shut') {
      if (st.clock - st.hintAt > STALL_HINT_EVERY) { st.hintAt = st.clock; ctx.ui.toast('Estás atrapado. Abre el menú con Esc y elige «Volver al punto de partida».', 6000); }
      return false;
    }
    this.vx = this.vz = 0; this.safe = { x: s.x, y: s.y, z: s.z, t: 0 };
    st.x = s.x; st.z = s.z; st.t = 0; st.done = false;
    ctx.ui.toast('Te desatascaste', 2200);
    ctx.events.emit('player:unstuck', { x: s.x, y: s.y, z: s.z, how });
    return true;
  }

  // ---- per frame -----------------------------------------------------------------------------------------------------------
  update(dt) {
    const ctx = this.ctx, P = CONFIG.PLAYER, st = ctx.settings?.v ?? {}, s = this.s, k = this.keys, inp = this.input, ph = ctx.physics;
    dt = Math.min(Math.max(dt, 0), 0.05);
    const locked = this.locked;

    // look
    if (!locked) {
      const sens = SENS * (st.sens ?? 1);
      this.yaw = wrap(this.yaw - this.mdx * sens);
      this.pitch = clamp(this.pitch - this.mdy * sens * (st.invertY ? -1 : 1), -PITCH, PITCH);
    }
    this.mdx = this.mdy = 0;

    // intent
    const ax = (neg, pos) => (k.has(pos) ? 1 : 0) - (k.has(neg) ? 1 : 0);
    let f = 0, side = 0, sprintWant = false, jumpHeld = false, crouchWant = false;
    if (!locked) {
      f = ax('KeyS', 'KeyW') + ax('ArrowDown', 'ArrowUp') + inp.f;
      side = ax('KeyA', 'KeyD') + ax('ArrowLeft', 'ArrowRight') + inp.s;
      sprintWant = k.has('ShiftLeft') || k.has('ShiftRight') || inp.sprint;
      jumpHeld = k.has('Space') || inp.jump;
      crouchWant = k.has('KeyC') || inp.crouch;          // C only: Ctrl is the browser's (Ctrl+W closes the tab and a page cannot stop it)
    }
    const len = Math.hypot(f, side); if (len > 1) { f /= len; side /= len; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);

    // the sea under the feet (engine/swim.js, dev/FEATURE-BEACH.md 3.1): south of the plot's edge on a plan with a coast; everywhere else nothing below runs
    const C = ctx.plan?.coast, W = this.water;
    const wadeK = C && (s.z > Z0 || W.mode !== 'dry') ? this._water() : 1;
    let x0 = s.x, z0 = s.z, sprinting = false;
    const wasGround = s.onGround;

    if (W.mode === 'swim') this._swim(dt, f, side, sprintWant, jumpHeld, crouchWant, C);
    else {
      const deep = W.mode === 'deep';                                          // over the waist: no running, no jumping, no crouching (the eyes stay dry)
      // crouch (stays down while there is no headroom)
      if (crouchWant && !deep) this.crouching = true;
      else if (this.crouching && ph.canStand(s.x, s.z, s.y, { height: P.height, crouchHeight: P.height * 0.7, radius: P.radius })) this.crouching = false;
      this.crouch += ((this.crouching ? 1 : 0) - this.crouch) * (1 - Math.exp(-dt * 11));
      const H = this.crouch > 0.5 ? P.height * 0.7 : P.height;

      // horizontal motion with smoothed velocity (a wader keeps wadeK of his speed)
      sprinting = this.sprinting = sprintWant && !deep && f > 0.2 && !this.crouching && (s.onGround || this.sprinting);
      const top = (this.crouching ? P.crouch : sprinting ? P.sprint : P.walk) * wadeK;
      const tx = (-sy * f + cy * side) * top, tz = (-cy * f - sy * side) * top;
      const rate = s.onGround ? (f || side ? ACCEL : DECEL) : AIR, a = 1 - Math.exp(-rate * dt);
      this.vx += (tx - this.vx) * a; this.vz += (tz - this.vz) * a;

      // jump: edge-triggered with a short buffer before landing and a grace period after leaving a ledge
      const pressed = jumpHeld && !this.jumpPrev; this.jumpPrev = jumpHeld;
      this.jumpBuf = pressed ? JUMP_BUFFER : this.jumpBuf - dt; this.jumpCool -= dt;
      this.sinceGround = s.onGround ? 0 : this.sinceGround + dt;
      if (this.jumpBuf > 0 && this.jumpCool <= 0 && !this.crouching && !deep && (s.onGround || (this.sinceGround < COYOTE && s.vy <= 0.5))
        && ph.canStand(s.x, s.z, s.y, { height: P.height + 0.75, crouchHeight: P.height, radius: P.radius })) {
        s.vy = P.jump; s.onGround = false; this.sinceGround = 1; this.jumpBuf = 0; this.jumpCool = JUMP_COOL;
        ctx.events.emit('player:jump', {});
      }

      this.lastVy = s.vy;
      const yPrev = s.y;
      ph.move(s, this.vx * dt, this.vz * dt, dt, { radius: P.radius, height: H, stepUp: P.stepUp, maxSlope: P.maxSlope, gravity: P.gravity });
      if (s.blocked && dt > 0) { this.vx = (s.x - x0) / dt; this.vz = (s.z - z0) / dt; }            // slide along walls instead of pushing into them
      if (this._stallNet(dt, f !== 0 || side !== 0, tx, tz, H)) { x0 = s.x; z0 = s.z; }            // put outside a pocket: that jump is no walking (no footsteps, no speed)
      // a fall that crosses the surface over water deep enough to swim in (off the pier's end, the raft, the sea wall's far side): the plunge (the shallows are landed in, as ever)
      if (C && !s.onGround && s.z > Z0 && yPrev > W.surf && s.y <= W.surf && W.depth >= P.swimOn) this._plunge(s.vy);
    }

    // the barrio ends at the plot edge (beyond it the world is scenery), except south of it: the promenade, the beach and the sea out to the swim limit (plan.coast.limit, dev/FEATURE-BEACH.md)
    const lim = CONFIG.HALF - 1.0, zmax = C ? C.limit(s.x, s.z).z : lim;
    if (Math.abs(s.x) > lim || s.z < -lim || s.z > zmax) {
      s.x = clamp(s.x, -lim, lim); s.z = clamp(s.z, -lim, zmax); this.vx = this.vz = 0;
      if (!this.warnedBounds) { this.warnedBounds = true; ctx.ui.toast(C && s.z > lim ? 'Más allá solo hay mar abierto. Mejor volvamos a la orilla.' : 'Más allá solo hay monte. Mejor sigamos por el barrio.', 3600); }
    }
    // safety nets: NaN or a fall through the world
    if (!Number.isFinite(s.x + s.y + s.z) || s.y < this.safe.y - 60) {
      const sf = this.safe; s.x = sf.x; s.y = sf.y; s.z = sf.z; s.vy = 0; this.vx = this.vz = 0; this.camY = s.y;
      ctx.errors.push({ stage: 'player', message: 'fell out of the world; restored last safe position' });
    } else if ((s.onGround || W.mode === 'swim') && !s.blocked && (this.safe.t += dt) > 0.6 && Number.isFinite(s.ground)) {   // (a swimmer's place is a safe one too: else a fault puts him back where he last stood)
      this.safe.x = s.x; this.safe.y = s.y; this.safe.z = s.z; this.safe.t = 0;
    }

    const moved = Math.hypot(s.x - x0, s.z - z0), hs = this.speed = dt > 0 ? moved / dt : 0;
    if (!wasGround && s.onGround && this.lastVy < -2.0) {
      this.dip = Math.min(0.12, -this.lastVy * 0.018);
      ctx.events.emit('player:land', { speed: -this.lastVy, surface: this.surface });
    }

    // where am I (every frame: cheap, bounded by the footprint AABB test)
    this._locate();
    if (moved > 0.01 || !this._surfAt.set) { this._place(); this._surfAt.set = true; }

    // footsteps
    if (s.onGround && moved > 0.001) {
      this.stride += moved;
      const len2 = this.crouching ? STRIDE.crouch : sprinting ? STRIDE.sprint : STRIDE.walk;
      if (this.stride >= len2) {
        this.stride -= len2; this.foot ^= 1;
        ctx.events.emit('player:step', { foot: this.foot, surface: this.surface, speed: hs, sprint: sprinting, crouch: this.crouching, x: s.x, y: s.y, z: s.z });
      }
    }

    // camera
    const swimming = W.mode === 'swim';
    const follow = s.onGround ? 1 - Math.exp(-dt * 15) : 1 - Math.exp(-dt * 40);              // soften stair steps, stay snappy in the air
    if (swimming) {                                                                           // the swimmer's eye is where `_swim` wants it: eased from where it was (wetOff over the land law)
      this.camY = s.y;
      this.wetOff += (W.eye - (this.camY + this._landOff()) - this.wetOff) * (1 - Math.exp(-dt * 14));
    } else {
      this.camY = Math.abs(s.y - this.camY) > 0.9 ? s.y : this.camY + (s.y - this.camY) * follow;
      if (this.wetOff !== 0) { this.wetOff *= Math.exp(-dt * 10); if (Math.abs(this.wetOff) < 1e-4) this.wetOff = 0; }       // (out of the water the eye eases back to the land law)
    }
    this.dip *= Math.exp(-dt * 9);
    const moving = s.onGround && hs > 0.35;
    this.bobAmt += ((moving ? 1 : 0) - this.bobAmt) * (1 - Math.exp(-dt * 8));
    this.bob += hs * dt * (this.crouching ? 3.0 : sprinting ? 1.8 : 2.4);
    const amp = st.headBob === false ? 0 : (this.crouching ? 0.012 : sprinting ? 0.034 : 0.022) * this.bobAmt;
    const yb = Math.sin(this.bob * 2) * amp, xb = Math.cos(this.bob) * amp * 0.55;
    this.fovKick += ((sprinting && hs > 3 ? 5 : 0) - this.fovKick) * (1 - Math.exp(-dt * 6));
    const cam = ctx.camera, aspect = cam.aspect || 1.78;
    const fov = viewFov(st.fov ?? 72, aspect, this.fovKick);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const strafeV = this.vx * cy - this.vz * sy;
    this.roll += ((swimming ? W.roll : -strafeV * 0.0022) - this.roll) * (1 - Math.exp(-dt * 8));        // (a swimmer leans with the surface instead of with his strafing)
    cam.position.set(s.x + cy * xb, this.eyeY + yb - this.dip, s.z - sy * xb);
    cam.rotation.set(this.pitch, this.yaw, st.headBob === false ? 0 : this.roll);
    this.eye.copy(cam.position);
    cam.getWorldDirection(this._dir);

    ctx.interact.update(this.eye, this._dir);
    ctx.ui.prompt(locked ? null : ctx.interact.prompt());           // a dialogue, a panel or a menu owns the keyboard: no "E ..." over the face of the person talking
    ctx.discover.check(s.x, s.y, s.z);
    if (swimming || W.under || W.breath.t > 0) this._swimAfter(dt);                       // the head under the surface, the breath (only ever in or just out of the water)
  }
}
