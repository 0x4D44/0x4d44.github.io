// First-person controller (owner: A1).
// Camera convention: yaw 0 looks toward -z (north, uphill). forward = (-sin yaw, -cos yaw).
//
// Public surface (kept stable; other modules read it):
//   s {x,y,z,vy,onGround,blocked,ground}   feet position + physics state      yaw, pitch   radians       eyeY   camera height
//   building (lot id | null)  indoors (bool)  room (Room | null)  floor (index)  surface ('asphalt'|'wood'|...)  speed  sprinting  crouching
//   lock(reason) / unlock(reason) / locked   freeze movement + look (dialogue, menus)        input {f,s,sprint,jump,crouch}  programmatic input
//   teleport(x, z, {y|floor, yaw, pitch})    setLook(yaw, pitch)      attach(canvas)      update(dt)
// Events emitted: player:step {foot,surface,speed,sprint,crouch,x,y,z}  player:land {speed,surface}  player:jump  player:teleport {x,y,z}
//                 player:enter {buildingId,floor}  player:exit {buildingId}  player:floor {buildingId,floor}
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { clamp } from '../core/util.js';
import { SurfaceMap } from './surface.js';

const SENS = 0.0022;                                  // radians per pixel at sensitivity 1.0
const PITCH = 1.5;                                    // ~86 degrees
const ACCEL = 13, DECEL = 12, AIR = 2.4;              // velocity smoothing rates (1/s)
const COYOTE = 0.12, JUMP_BUFFER = 0.14, JUMP_COOL = 0.22;
const STRIDE = { walk: 0.72, sprint: 1.05, crouch: 0.5 };   // metres per footstep
const wrap = (a) => (a > Math.PI ? a - Math.PI * 2 : a < -Math.PI ? a + Math.PI * 2 : a);

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
    this.eye = new THREE.Vector3(); this._dir = new THREE.Vector3();
    this.surfaces = new SurfaceMap(null); this._surfAt = { x: 1e9, z: 1e9 };
    this._blds = null; this.canvas = null;
  }

  get pos() { return this.s; }
  get eyeY() { return this.camY + CONFIG.PLAYER.eye - (CONFIG.PLAYER.eye - CONFIG.PLAYER.crouchEye) * this.crouch; }
  lock(reason = 'lock') { this.locks.add(reason); }
  unlock(reason = 'lock') { this.locks.delete(reason); }
  get locked() { return this.locks.size > 0; }

  setLook(yaw, pitch = this.pitch) { this.yaw = wrap(yaw); this.pitch = clamp(pitch, -PITCH, PITCH); }

  /** Put the player at (x,z). o: { y | floor (index into the ascending surface list there, 0 = lowest), yaw, pitch }. */
  teleport(x, z, o = {}) {
    const s = this.s, ph = this.ctx.physics;
    s.x = x; s.z = z; s.vy = 0; s.onGround = false; this.vx = this.vz = 0; this.dip = 0; this.jumpBuf = 0;
    const hs = ph.heightsAt(x, z);
    s.y = o.y ?? (hs.length ? hs[Math.min(o.floor ?? 0, hs.length - 1)] : 0);
    if (o.yaw != null) this.yaw = wrap(o.yaw);
    if (o.pitch != null) this.pitch = clamp(o.pitch, -PITCH, PITCH);
    this.crouch = 0; this.crouching = false;
    ph.move(s, 0, 0, 0.001);
    this.camY = s.y; this.safe = { x: s.x, y: s.y, z: s.z, t: 0 };
    this._locate(true);
    this._place();
    this.ctx.events.emit('player:teleport', { x: s.x, y: s.y, z: s.z });
  }

  /** Request pointer lock with raw (unaccelerated) mouse input where the browser supports it. */
  lockPointer() {
    const c = this.canvas; if (!c?.requestPointerLock) return;
    const plain = () => { try { c.requestPointerLock(); } catch { /* denied */ } };
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
      if (!this.pointerLocked && !ctx.opts.autostart && !this.dragOnly) this.lockPointer();
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
        room = bp.rooms.find((r) => r.rect && lx >= r.rect.x0 - 0.06 && lx <= r.rect.x1 + 0.06 && lz >= r.rect.z0 - 0.06 && lz <= r.rect.z1 + 0.06
          && ly >= (r.y ?? 0) - 0.45 && ly < (r.y ?? 0) + (r.h ?? 2.8) + 0.3) ?? null;
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
    if (!this.surfaces.streets && ctx.plan) this.surfaces.setPlan(ctx.plan);
    if (ctx.plan && this.surfaces.streets.length === 0 && ctx.plan.streets?.length) this.surfaces.setPlan(ctx.plan);
    const sa = ctx.physics.surfaceAt(s.x, s.z, s.y, 0.35);
    this.surface = this.surfaces.kind(s.x, s.z, { indoors: this.indoors, room: this.room, onFloorPatch: sa.id != null && !sa.terrain });
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
      crouchWant = k.has('KeyC') || k.has('ControlLeft') || inp.crouch;
    }
    const len = Math.hypot(f, side); if (len > 1) { f /= len; side /= len; }

    // crouch (stays down while there is no headroom)
    if (crouchWant) this.crouching = true;
    else if (this.crouching && ph.canStand(s.x, s.z, s.y, { height: P.height, crouchHeight: P.height * 0.7, radius: P.radius })) this.crouching = false;
    this.crouch += ((this.crouching ? 1 : 0) - this.crouch) * (1 - Math.exp(-dt * 11));
    const H = this.crouch > 0.5 ? P.height * 0.7 : P.height;

    // horizontal motion with smoothed velocity
    const sprinting = this.sprinting = sprintWant && f > 0.2 && !this.crouching && (s.onGround || this.sprinting);
    const top = this.crouching ? P.crouch : sprinting ? P.sprint : P.walk;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const tx = (-sy * f + cy * side) * top, tz = (-cy * f - sy * side) * top;
    const rate = s.onGround ? (f || side ? ACCEL : DECEL) : AIR, a = 1 - Math.exp(-rate * dt);
    this.vx += (tx - this.vx) * a; this.vz += (tz - this.vz) * a;
    const x0 = s.x, z0 = s.z, wasGround = s.onGround;

    // jump: edge-triggered with a short buffer before landing and a grace period after leaving a ledge
    const pressed = jumpHeld && !this.jumpPrev; this.jumpPrev = jumpHeld;
    this.jumpBuf = pressed ? JUMP_BUFFER : this.jumpBuf - dt; this.jumpCool -= dt;
    this.sinceGround = s.onGround ? 0 : this.sinceGround + dt;
    if (this.jumpBuf > 0 && this.jumpCool <= 0 && !this.crouching && (s.onGround || (this.sinceGround < COYOTE && s.vy <= 0.5))
      && ph.canStand(s.x, s.z, s.y, { height: P.height + 0.75, crouchHeight: P.height, radius: P.radius })) {
      s.vy = P.jump; s.onGround = false; this.sinceGround = 1; this.jumpBuf = 0; this.jumpCool = JUMP_COOL;
      ctx.events.emit('player:jump', {});
    }

    this.lastVy = s.vy;
    ph.move(s, this.vx * dt, this.vz * dt, dt, { radius: P.radius, height: H, stepUp: P.stepUp, maxSlope: P.maxSlope, gravity: P.gravity });
    if (s.blocked && dt > 0) { this.vx = (s.x - x0) / dt; this.vz = (s.z - z0) / dt; }            // slide along walls instead of pushing into them

    // the barrio ends at the plot edge (beyond it the world is scenery)
    const lim = CONFIG.HALF - 1.0;
    if (Math.abs(s.x) > lim || Math.abs(s.z) > lim) {
      s.x = clamp(s.x, -lim, lim); s.z = clamp(s.z, -lim, lim); this.vx = this.vz = 0;
      if (!this.warnedBounds) { this.warnedBounds = true; ctx.ui.toast('Más allá solo hay monte. Mejor sigamos por el barrio.', 3600); }
    }
    // safety nets: NaN or a fall through the world
    if (!Number.isFinite(s.x + s.y + s.z) || s.y < this.safe.y - 60) {
      const sf = this.safe; s.x = sf.x; s.y = sf.y; s.z = sf.z; s.vy = 0; this.vx = this.vz = 0; this.camY = s.y;
      ctx.errors.push({ stage: 'player', message: 'fell out of the world; restored last safe position' });
    } else if (s.onGround && !s.blocked && (this.safe.t += dt) > 0.6 && Number.isFinite(s.ground)) {
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
    const follow = s.onGround ? 1 - Math.exp(-dt * 15) : 1 - Math.exp(-dt * 40);              // soften stair steps, stay snappy in the air
    this.camY = Math.abs(s.y - this.camY) > 0.9 ? s.y : this.camY + (s.y - this.camY) * follow;
    this.dip *= Math.exp(-dt * 9);
    const moving = s.onGround && hs > 0.35;
    this.bobAmt += ((moving ? 1 : 0) - this.bobAmt) * (1 - Math.exp(-dt * 8));
    this.bob += hs * dt * (this.crouching ? 3.0 : sprinting ? 1.8 : 2.4);
    const amp = st.headBob === false ? 0 : (this.crouching ? 0.012 : sprinting ? 0.034 : 0.022) * this.bobAmt;
    const yb = Math.sin(this.bob * 2) * amp, xb = Math.cos(this.bob) * amp * 0.55;
    this.fovKick += ((sprinting && hs > 3 ? 5 : 0) - this.fovKick) * (1 - Math.exp(-dt * 6));
    const cam = ctx.camera, aspect = cam.aspect || 1.78;
    const fov = (st.fov ?? 72) * (aspect < 1 ? clamp(1 + (1 - aspect) * 0.85, 1, 1.35) : 1) + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const strafeV = this.vx * cy - this.vz * sy;
    this.roll += ((-strafeV * 0.0022) - this.roll) * (1 - Math.exp(-dt * 8));
    cam.position.set(s.x + cy * xb, this.eyeY + yb - this.dip, s.z - sy * xb);
    cam.rotation.set(this.pitch, this.yaw, st.headBob === false ? 0 : this.roll);
    this.eye.copy(cam.position);
    cam.getWorldDirection(this._dir);

    ctx.interact.update(this.eye, this._dir);
    ctx.ui.prompt(ctx.interact.prompt());
    ctx.discover.check(s.x, s.y, s.z);
  }
}
