// An offline stand-in for the recorder (tools/people_motion.html): drives js/sim/gait.js with the real rig of four of the people (js/sim/gait_rig_fixture.json) through the
// same scripted plans, steers the root with the game's own steering kinematics (js/sim/steer.js: speed, braking, turning), and writes recordings in the recorder's format - so js/sim/motion_metrics.mjs can score
// the gait in milliseconds under `node --test`, without a browser. It is a model of the steering, not the steering itself: tools/people_motion.mjs scores the real thing.
import fs from 'fs';
import * as G from './gait.js';
import * as M from './motion_metrics.mjs';
import * as S from './steer.js';
const here = new URL('.', import.meta.url);
export const FIXTURE = JSON.parse(fs.readFileSync(new URL('gait_rig_fixture.json', here), 'utf8'));
export const PEOPLE = Object.keys(FIXTURE.chars);
export const bodyOf = (id) => { const c = FIXTURE.chars[id]; return G.makeBody({ bones: FIXTURE.bones, parent: FIXTURE.parent, pos: c.pos, quat: c.quat }, c.foot); };

/** the landmark points that are not bones: bone + a local offset, as the recorder builds them (heel, ball-of-foot sole point, toe tip, nose) */
export function carried(B) {
  const ix = B.ix, spec = {}, loc = (bone, wp) => ({ b: ix[bone], l: G.qrot(G.qinv(B.Q0[ix[bone]]), G.sub(wp, B.P0[ix[bone]])) });
  for (const s of ['l', 'r']) {
    const an = B.P0[ix['foot_' + s]], ba = B.P0[ix['ball_' + s]];
    spec['heel_' + s] = loc('foot_' + s, [an[0], 0, an[2] + B.heelBack]); spec['bs_' + s] = loc('foot_' + s, [ba[0], 0, ba[2]]); spec['toe_' + s] = loc('ball_' + s, [ba[0], 0, an[2] - B.toeFwd]);
  }
  const hd = B.P0[ix.head]; spec.nose = loc('head', [hd[0], hd[1] + 0.04, hd[2] - 0.12]);
  return spec;
}
const BONES = M.LM.slice(0, 19), EXTRA = M.LM.slice(19);
function landmarks(B, C, solved, node) {
  const fk = G.gaitFK(B, solved), out = [], w = (p) => { const r = G.qrot(G.qy(node.yaw), p); return [r[0] + node.x, r[1], r[2] + node.z]; };
  for (const nm of BONES) out.push(...w(fk.P[B.ix[nm]]));
  for (const nm of EXTRA) { const c = C[nm]; out.push(...w(G.add(fk.P[c.b], G.qrot(fk.Q[c.b], c.l)))); }
  return out;
}
const clampN = (x, a, b) => Math.max(a, Math.min(b, x));
const angD = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

/** Record one person through a plan (segments { dur (s), v (m/s), state, turn (deg), to (m) }, as motion_metrics.SCEN builds them) at 60 Hz.
 *  opts: body (a gait body, G.makeBody, to walk in place of the fixture's own - a real person's rig, a shoe of another profile; kid: whether it is a child's), armOut [l, r] (deg), var (the gait's per-person variation; var.vary 0 is a metronome: no stride-to-stride variability), seed (the stride-to-stride variability's random seed; default: one per person, so every test sees the same walk every run), onFrame (k, gait, targets, solved) called every frame, noStopD (do not tell the gait how far it still has to go to a place it will stand at - the control for the planned-stop test), feed { pos, speed } - for tests of the metrics only: the fraction of the body's position / speed the gait is TOLD
 *  (feed.pos < 1 makes the planted feet slide across the floor, feed.speed < 1 gives a cadence that is too slow for the speed). */
export function record(id, plan, opts = {}) {
  const B = opts.body || bodyOf(id), C = carried(B), g = G.newGait(B, { armOut: opts.armOut || [6, 6], var: opts.var, seed: opts.seed != null ? opts.seed : G.seedOf(id) }), dt = opts.dt || 1 / 60, fp = (opts.feed && opts.feed.pos) || 1, fv = (opts.feed && opts.feed.speed) || 1;
  const n = Math.round(plan.reduce((s, a) => s + a.dur, 0) / dt), Lc = M.LM.length, pos = new Array(n * Lc * 3), root = new Array(n * 3), yaw = new Array(n), spd = new Array(n), st = new Array(n), seg = new Array(n), ph = new Array(n);
  const P = { yaw: 0, yw: 0, sp: 0, stopHere: false };
  let x = 0, z = 0, yawT = 0, hd = 0, k = 0, state = 'stand', tx = null, tz = null, arrived = false, pv = 0;
  for (let si = 0; si < plan.length; si++) {
    const s = plan[si]; if (s.state) state = s.state;
    if (s.turn) { hd += s.turn * Math.PI / 180; if (!(s.v > 0)) yawT = hd; }
    const cx = -Math.sin(hd), cz = -Math.cos(hd); tx = s.to ? x + cx * s.to : null; tz = s.to ? z + cz * s.to : null; arrived = false; P.stopHere = !!s.to;
    const steps = Math.round(s.dur / dt);
    for (let i = 0; i < steps && k < n; i++, k++) {
      let stopD = null;   // the distance still to go to a place the person will stand at (the gait shortens its last steps onto it)
      if (s.v > 0 && !arrived) {
        const gx = tx != null ? tx : x + cx * 50, gz = tz != null ? tz : z + cz * 50, d = Math.hypot(gx - x, gz - z);
        if (tx != null && S.arrived(P, d)) { arrived = true; P.sp = 0; state = 'stand'; }
        else { if (P.stopHere && !opts.noStopD) stopD = Math.max(0, d - S.STEER.ARR); const mv = S.steerStep(P, dt, { hT: Math.atan2(-(gx - x), -(gz - z)), want: s.v, d, stop: P.stopHere }); x += -Math.sin(P.yaw) * mv; z += -Math.cos(P.yaw) * mv; yawT = P.yaw; }
      } else { P.sp = 0; S.turnToward(P, yawT, dt, S.STEER.PIVOT); }
      const yw = P.yaw, v = P.sp; pv += (v - pv) * Math.min(1, dt * 12);
      G.gaitUpdate(g, dt, { x: x * fp, z: z * fp, yaw: yw, v: pv * fv, walking: state === 'walk' || state === 'go', stopD });
      const T = G.gaitTargets(g), sol = G.gaitSolve(g, T), lm = landmarks(B, C, sol, { x, z, yaw: yw });
      if (opts.onFrame) opts.onFrame(k, g, T, sol);   // (a hook for probes: the state, the pose targets and the solved pose of every frame)
      for (let j = 0; j < lm.length; j++) pos[k * Lc * 3 + j] = +lm[j].toFixed(4);
      root[k * 3] = x; root[k * 3 + 1] = 0; root[k * 3 + 2] = z; yaw[k] = yw; spd[k] = pv; st[k] = state; seg[k] = si; ph[k] = g.phase;
    }
  }
  const o = B.leg[0];
  return { id, dt, n: k, names: M.LM, pos, root, yaw, v: spd, state: st, seg, phase: ph, floor: 0,
    info: { hipY: B.hipY, hipHalf: B.hipHalf, thigh: o.l1, shank: o.l2, ankleH: o.ankleH, heelBack: B.heelBack, toeFwd: B.toeFwd, gaitLayer: true, kid: opts.body ? !!opts.kid : FIXTURE.chars[id].kid }, gait: g };
}
/** Record and analyse a steady walk at v m/s. */
export function steady(id, v, opts) { const sc = M.SCEN.steady(v), rec = new M.Rec(record(id, sc.plan, opts)); return { rec, a: M.analyseSteady(rec, sc.win) }; }
export { M, G };
