// The feel camera. Owner: flight agent.
// createCameraRig(game) -> { mode, target, init(), reset(racer, mode), setMode(mode), cycle(), shake(amount), update(dt, game, alpha) }
//
// Modes: 'chase' | 'far' | 'low' | 'nose'  (player cycle, key C)  and  'cinematic' (title demo)  'grid' (countdown)  'finish' (victory).
// 'chase' while the race is still on the grid / counting down automatically plays the grid intro (slow orbit of the player's plane)
// and swoops behind the plane at GO; once the player has finished, 'chase' turns into the 'finish' orbit by itself.
//
// Reads ONLY racer.render.pos / racer.render.quat (the interpolated transform) for placement, never flight.pos. The only other racer
// fields used are non-positional: flight.boost.active, controls.lookBack, finished, tumble, spec.visual.
// Frame-rate independent: every smoothing term is an exponential damp(dt).
import * as THREE from 'three';
import { clamp, damp, smoothstep } from '../util.js';

const MODES = ['chase', 'far', 'low', 'nose'];
const RIG = {                       // back / up distances (m, for a ~11 m wingspan craft), look-ahead, base fov
  chase: { back: 14.5, up: 4.2, look: 34, fov: 72, lag: 6.0 },
  far:   { back: 23,   up: 8,  look: 40, fov: 70, lag: 4.5 },
  low:   { back: 11,   up: 1.6,  look: 30, fov: 76, lag: 7.0 },
  nose:  { back: -6.5, up: 0.7,  look: 90, fov: 80, lag: 30 },
};
// cinematic shot list (kind, duration s); deterministic so reruns look the same
const SHOTS = [['orbit', 5.5], ['flyby', 4.2], ['trail', 5], ['side', 4.5], ['front', 4], ['flyby', 4.2], ['orbit', 5], ['trail', 4.5], ['side', 4.5]];

export function createCameraRig(game) {
  const v = {
    fwd: new THREE.Vector3(), up: new THREE.Vector3(), right: new THREE.Vector3(), prevFwd: new THREE.Vector3(0, 0, -1), prevP: new THREE.Vector3(),
    sdir: new THREE.Vector3(0, 0, -1), sup: new THREE.Vector3(0, 1, 0), pos: new THREE.Vector3(), look: new THREE.Vector3(), tmp: new THREE.Vector3(),
    tmp2: new THREE.Vector3(), tmpUp: new THREE.Vector3(), orbitPos: new THREE.Vector3(), orbitLook: new THREE.Vector3(), shotPos: new THREE.Vector3(),
    side: new THREE.Vector3(), orbitOff: new THREE.Vector3(), worldUp: new THREE.Vector3(0, 1, 0),
  };
  const s = {
    clock: 0, speed: 100, lean: 0, fov: 72, trauma: 0, lb: 0, lift: 0, shotIdx: 0, shotT: 0, shotCut: true, introT: 0, swoop: 1, finishT: 0,
    shotSide: 1, cut: true, boost: 0, haveOrbit: false, pull: 1, bank: 0, course: null,
  };
  const rig = {
    mode: 'chase', target: null, first: true, camMode: 'chase', fov: 72, speed: 0,
    init() { game.events?.on?.('input:camera', () => { if (game.state === 'race') this.cycle(); }); },
    reset(racer, mode = 'chase') {
      this.target = racer; this.mode = mode; this.camMode = MODES.includes(mode) ? mode : 'chase'; this.first = true; s.cut = true; s.shotIdx = 0; s.shotT = 0; s.shotCut = true;
      s.introT = 0; s.swoop = 1; s.finishT = 0; s.clock = 0; s.trauma = 0; s.lb = 0; s.lift = 0; s.haveOrbit = false; s.pull = 1; s.bank = 0;
    },
    setMode(mode) { this.mode = mode; if (MODES.includes(mode)) this.camMode = mode; this.first = true; s.cut = true; },
    cycle() {
      const cur = MODES.includes(this.mode) ? this.mode : this.camMode;
      this.setMode(MODES[(MODES.indexOf(cur) + 1) % MODES.length]);
    },
    /** Add camera shake (0..1). Honours settings.shake and reduceFlash. */
    shake(a = 0.5) { s.trauma = Math.min(1, s.trauma + a); },
    update(dt, g, alpha) {
      const race = g.race;
      let r = this.target;
      if (this.mode === 'cinematic' && race?.racers?.length) { r = race.racers.find((x) => x.place === 1) || race.racers[0]; }
      else if ((!r || !r.render) && race?.racers?.length) r = this.target = g.player || race.racers[0];
      if (!r || !r.render) return;
      if (!(dt >= 0)) dt = 0;
      if (dt > 0.25) dt = 0.25;
      const P = r.render.pos, Q = r.render.quat, cam = g.camera;
      s.course = g.course || null;
      v.fwd.set(0, 0, -1).applyQuaternion(Q); v.up.set(0, 1, 0).applyQuaternion(Q); v.right.set(1, 0, 0).applyQuaternion(Q);
      const spec = r.spec?.visual, size = clamp((spec?.wingspan ?? 11) / 11, 0.8, 1.4);
      s.clock += dt;

      // --- motion measurements (from the interpolated transform only) ---
      if (dt > 1e-5 && !this.first) {
        const jump = v.tmp.copy(P).sub(v.prevP).length();
        if (jump > 250) { s.cut = true; }
        else {
          s.speed = damp(s.speed, jump / dt, 6, dt);
          const lat = v.tmp.copy(v.fwd).sub(v.prevFwd).dot(v.right) / dt;       // sideways swing of the nose, rad/s
          s.lean = damp(s.lean, clamp(lat, -3, 3), 5, dt);
        }
      } else if (this.first) { s.speed = 100; s.lean = 0; }
      v.prevP.copy(P); v.prevFwd.copy(v.fwd);
      const boosting = !!r.flight?.boost?.active;
      s.boost = damp(s.boost, boosting ? 1 : 0, 5, dt);
      this.speed = s.speed;

      // --- mode resolution ---
      let mode = this.mode;
      const rs = race?.state;
      if (mode === 'chase' && r === g.player) {
        if ((rs === 'grid' || rs === 'countdown') && !g.camOverrideNoIntro) { mode = 'grid'; s.swoop = 0; }
        else if (r.finished) { s.finishT += dt; if (s.finishT > 1.2) mode = 'finish'; } else s.finishT = 0;
      }
      if (this.mode === 'grid') mode = (rs === 'grid' || rs === 'countdown') ? 'grid' : 'chase';
      this.camMode = mode;

      let fovT = 72, roll = 0;
      let useOrbit = false;

      if (mode === 'cinematic') fovT = this.cinematic(dt, r, P, size);
      else if (mode === 'finish') { this.finishOrbit(dt, P, size); fovT = 62; }
      else {
        if (mode === 'grid') { this.gridOrbit(dt, r, P, size); fovT = 60; s.haveOrbit = true; useOrbit = true; }
        const rg = RIG[MODES.includes(mode) ? mode : 'chase'];
        fovT = this.chase(dt, r, P, size, rg, mode, useOrbit);
      }

      // --- ground clamp (smoothed so it never pops) ---
      const ground = g.course?.groundHeight ? g.course.groundHeight(v.pos.x, v.pos.z) : -1e9;
      const need = Math.max(0, ground + 4 - v.pos.y);
      s.lift = need > s.lift ? need : damp(s.lift, need, 3, dt);      // rise instantly (never clip), sink slowly
      v.pos.y += s.lift;

      // --- shake ---
      const set = g.settings || {};
      const shakeScale = (set.shake ?? 1) * (set.reduceFlash ? 0.5 : 1);
      s.trauma = Math.max(0, s.trauma - dt * 1.6);
      const hs = (smoothstep(125, 190, s.speed) * 0.1 + s.boost * 0.14) * shakeScale;
      const amp = (s.trauma * s.trauma * 1.4 + hs) * shakeScale;
      if (amp > 0.001) {
        const t = s.clock, k = amp * (mode === 'nose' ? 0.5 : 1);
        v.pos.x += (Math.sin(t * 53.1) + Math.sin(t * 31.7 + 1.3) * 0.7) * 0.09 * k;
        v.pos.y += (Math.sin(t * 47.3 + 2.1) + Math.sin(t * 29.9) * 0.7) * 0.09 * k;
        v.pos.z += (Math.sin(t * 41.9 + 0.7) + Math.sin(t * 37.1 + 4.2) * 0.7) * 0.09 * k;
        roll = (Math.sin(t * 38.3) + Math.sin(t * 23.1 + 1)) * 0.012 * k * (s.trauma > 0.01 ? 1.6 : 1);
      }

      // --- fov: speed / boost kick (72 -> ~95), eased ---
      const kick = smoothstep(80, 185, s.speed) * 15 + s.boost * 6 + s.trauma * 3 * shakeScale;
      const target = mode === 'cinematic' || mode === 'finish' || mode === 'grid' ? fovT : fovT + kick;
      s.fov = this.first || s.cut ? target : damp(s.fov, target, 3.5, dt);
      const f = Math.min(98, s.fov);
      if (Math.abs(cam.fov - f) > 0.02) { cam.fov = f; cam.updateProjectionMatrix(); }
      this.fov = f;

      cam.position.copy(v.pos);
      cam.up.copy(v.tmpUp);
      cam.lookAt(v.look);
      if (roll) cam.rotateZ(roll);
      this.first = false; s.cut = false;
    },

    /** Spring-damped chase family (chase / far / low / nose). Returns the base fov. Writes v.pos, v.look, v.tmpUp. */
    chase(dt, r, P, size, rg, mode, fromOrbit) {
      const snap = this.first || s.cut;
      // smoothed heading / up (exponential damping: frame-rate independent)
      if (snap) { v.sdir.copy(v.fwd); v.sup.copy(v.worldUp); }
      else {
        const lag = mode === 'nose' ? rg.lag : rg.lag * (1 + 0.5 * s.boost);
        v.sdir.lerp(v.fwd, 1 - Math.exp(-lag * dt)).normalize();
      }
      // camera up: partial bank follow (~40 %), never fully inverted
      const bf = mode === 'nose' ? 0.8 : 0.4;
      v.tmp.copy(v.worldUp).multiplyScalar(1 - bf).addScaledVector(v.up, bf).normalize();
      v.sup.lerp(v.tmp, snap ? 1 : 1 - Math.exp(-(mode === 'nose' ? 14 : 4.5) * dt)).normalize();

      // look-back blend
      const wantLb = r.controls?.lookBack && mode !== 'nose' ? 1 : 0;
      s.lb = snap ? wantLb : damp(s.lb, wantLb, 9, dt);
      const lb = s.lb, bump = Math.sin(Math.PI * lb) * 5;

      // P-20: in a hard bank the wing and fuselage fill the view: ease back, rise and look into the turn (+ = right wing down)
      s.bank = snap ? 0 : damp(s.bank, clamp(-v.right.y, -1, 1), 5, dt);
      const bk = mode === 'nose' ? 0 : smoothstep(0.35, 0.95, Math.abs(s.bank)) * Math.sign(s.bank);
      const back = (rg.back * size + (mode === 'nose' ? 0 : (s.boost * 2.4 + clamp((s.speed - 100) * 0.018, -0.8, 2.2) + 2.6 * Math.abs(bk) * size))) * (1 - 2 * lb);
      const upOff = rg.up * size * (1 - 0.35 * lb) + 1.8 * Math.abs(bk) * size;
      v.tmp.copy(P).addScaledVector(v.sdir, -back).addScaledVector(v.sup, upOff + bump);
      if (mode === 'nose') { v.tmp.copy(P).addScaledVector(v.fwd, (spec(r) * 0.55)).addScaledVector(v.up, 0.7); }
      // look target: ahead along the (blended) heading with a lead into turns
      v.tmp2.copy(v.sdir).multiplyScalar(0.5).addScaledVector(v.fwd, 0.5).normalize();
      v.look.copy(P).addScaledVector(v.tmp2, rg.look * (1 - lb)).addScaledVector(v.sup, 1.4 * (1 - lb));
      if (lb > 0) v.look.lerp(P, lb);
      if (mode !== 'nose') v.look.addScaledVector(v.right, clamp(s.lean * 9, -9, 9) * (1 - lb));
      if (bk) { v.side.copy(v.right).setY(0); if (v.side.lengthSq() > 1e-6) v.look.addScaledVector(v.side.normalize(), bk * 16 * size * (1 - lb)); }
      v.pos.copy(v.tmp);
      v.tmpUp.copy(v.sup);
      if (mode !== 'nose' && !fromOrbit) this.pullIn(dt, P, snap);
      if (fromOrbit || s.swoop < 1) {
        // grid intro / swoop at GO: blend the orbit pose into the chase pose
        if (fromOrbit) { v.pos.copy(v.orbitPos); v.look.copy(v.orbitLook); v.tmpUp.copy(v.worldUp); s.swoop = 0; }
        else if (s.haveOrbit) {
          s.swoop = Math.min(1, s.swoop + dt / 1.25);
          v.orbitPos.copy(P).add(v.orbitOff); v.orbitLook.copy(P); v.orbitLook.y += 1.4;     // the orbit pose rides along with the aircraft
          const k = smoothstep(0, 1, s.swoop);
          v.pos.lerpVectors(v.orbitPos, v.pos, k); v.look.lerpVectors(v.orbitLook, v.look, k);
          if (s.swoop >= 1) s.haveOrbit = false;
        } else s.swoop = 1;
      }
      return rg.fov;
    },

    /** P-19: the camera never sits inside terrain. March from the aircraft to the wanted camera spot; at the first sample under the ground the camera is
     *  pulled in along that line (instantly, never clipping), and eases back out slowly. The look-back camera sits AHEAD of the aircraft, so it needs this most. */
    pullIn(dt, P, snap) {
      const gh = s.course?.groundHeight; let t = 1;
      if (gh) {
        const N = 10;
        for (let i = 1; i <= N; i++) {
          const u = i / N, x = P.x + (v.pos.x - P.x) * u, y = P.y + (v.pos.y - P.y) * u, z = P.z + (v.pos.z - P.z) * u;
          if (y < gh.call(s.course, x, z) + 3.5) { t = (i - 1) / N; break; }
        }
      }
      s.pull = snap || t < s.pull ? t : damp(s.pull, t, 2.5, dt);
      if (s.pull < 1) v.pos.lerpVectors(P, v.pos, Math.max(0.12, s.pull));
    },

    /** Slow orbit of the player's aircraft on the grid. Writes v.orbitPos / v.orbitLook. */
    gridOrbit(dt, r, P, size) {
      s.introT += dt;
      const th = 2.35 + s.introT * 0.2, R = 21 * size, h = 4.2 * size + 1.2 * Math.sin(s.introT * 0.6);
      v.fwd.set(0, 0, -1).applyQuaternion(r.render.quat);
      v.tmp.copy(v.fwd).setY(0); if (v.tmp.lengthSq() < 1e-6) v.tmp.set(0, 0, -1); v.tmp.normalize();
      v.side.set(-v.tmp.z, 0, v.tmp.x).multiplyScalar(-1);                 // horizontal right
      v.orbitPos.copy(P).addScaledVector(v.tmp, -Math.cos(th) * R).addScaledVector(v.side, Math.sin(th) * R);
      v.orbitPos.y += h;
      v.orbitLook.copy(P); v.orbitLook.y += 1.4;
      v.orbitOff.copy(v.orbitPos).sub(P);
    },

    /** Victory orbit: wider, descending spiral around the aircraft. Writes v.pos / v.look / v.tmpUp. */
    finishOrbit(dt, P, size) {
      const t = s.clock, th = t * 0.5, R = (30 + 8 * Math.sin(t * 0.35)) * size, h = 5 + 5 * (0.5 + 0.5 * Math.sin(t * 0.4));
      v.pos.set(P.x + Math.cos(th) * R, P.y + h, P.z + Math.sin(th) * R);
      v.look.copy(P); v.tmpUp.copy(v.worldUp);
    },

    /** Title-demo director: cuts between orbit / flyby / trail / side / front shots on the race leader. Returns fov. */
    cinematic(dt, r, P, size) {
      if (s.shotT <= 0 || s.shotCut) {
        if (s.shotT <= 0) { s.shotIdx = (s.shotIdx + 1) % SHOTS.length; s.shotT = SHOTS[s.shotIdx][1]; s.shotSide = s.shotIdx % 2 ? -1 : 1; }
        s.shotCut = true; s.cut = true;
      }
      const kind = SHOTS[s.shotIdx][0], dur = SHOTS[s.shotIdx][1], u = 1 - s.shotT / dur, t = s.clock;
      v.tmpUp.copy(v.worldUp);
      v.side.copy(v.right).setY(0); if (v.side.lengthSq() < 1e-6) v.side.set(1, 0, 0); v.side.normalize();
      let fov = 62;
      if (kind === 'orbit') {
        const th = t * 0.65 + s.shotIdx, R = 36 * size;
        v.pos.set(P.x + Math.cos(th) * R, P.y + 9 + 4 * Math.sin(t * 0.8), P.z + Math.sin(th) * R); v.look.copy(P);
      } else if (kind === 'flyby') {
        if (s.shotCut) { v.shotPos.copy(P).addScaledVector(v.fwd, Math.max(60, s.speed) * dur * 0.55).addScaledVector(v.side, 40 * s.shotSide * size); v.shotPos.y += 6; }
        v.pos.copy(v.shotPos); v.look.copy(P); fov = 52 + 14 * smoothstep(0.4, 1, u);
      } else if (kind === 'trail') {
        const az = Math.sin(t * 0.5) * 0.7;
        v.pos.copy(P).addScaledVector(v.fwd, -26 * size * Math.cos(az)).addScaledVector(v.side, 26 * size * Math.sin(az)); v.pos.y += 7 * size;
        v.look.copy(P).addScaledVector(v.fwd, 20); fov = 66;
      } else if (kind === 'side') {
        v.pos.copy(P).addScaledVector(v.side, 30 * s.shotSide * size).addScaledVector(v.fwd, -8); v.pos.y += 4 + 2 * u; v.look.copy(P).addScaledVector(v.fwd, 6); fov = 58;
      } else {   // front, looking back at the aircraft
        v.pos.copy(P).addScaledVector(v.fwd, 24 * size).addScaledVector(v.side, 5 * s.shotSide); v.pos.y += 5 - 2 * u; v.look.copy(P); fov = 66;
      }
      s.shotT -= dt; s.shotCut = false;
      return fov;
    },
  };
  const spec = (r) => r.spec?.visual?.length ?? 12;
  return rig;
}
