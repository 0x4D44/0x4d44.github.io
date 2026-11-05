// An offline stand-in for the recorder (tools/people_motion.html): drives js/sim/gait.js with the real rig of four of the people (js/sim/gait_rig_fixture.json) through the
// same scripted plans, steers the root the way the game's AnimCrowd._step / _turn do, and writes recordings in the recorder's format - so js/sim/motion_metrics.mjs can score
// the gait in milliseconds under `node --test`, without a browser. It is a model of the steering, not the steering itself: tools/people_motion.mjs scores the real thing.
import fs from 'fs';
import * as G from './gait.js';
import * as M from './motion_metrics.mjs';
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
 *  opts: armOut [l, r] (deg), var (the gait's per-person variation), feed { pos, speed } - for tests of the metrics only: the fraction of the body's position / speed the gait is TOLD
 *  (feed.pos < 1 makes the planted feet slide across the floor, feed.speed < 1 gives a cadence that is too slow for the speed). */
export function record(id, plan, opts = {}) {
  const B = bodyOf(id), C = carried(B), g = G.newGait(B, { armOut: opts.armOut || [6, 6], var: opts.var }), dt = 1 / 60, fp = (opts.feed && opts.feed.pos) || 1, fv = (opts.feed && opts.feed.speed) || 1;
  const n = Math.round(plan.reduce((s, a) => s + a.dur, 0) / dt), Lc = M.LM.length, pos = new Array(n * Lc * 3), root = new Array(n * 3), yaw = new Array(n), spd = new Array(n), st = new Array(n), seg = new Array(n), ph = new Array(n);
  let x = 0, z = 0, vx = 0, vz = 0, yw = 0, yawT = 0, hd = 0, k = 0, state = 'stand', tx = null, tz = null, arrived = false, pv = 0;
  for (let si = 0; si < plan.length; si++) {
    const s = plan[si]; if (s.state) state = s.state;
    if (s.turn) { hd += s.turn * Math.PI / 180; if (!(s.v > 0)) yawT = hd; }
    const cx = -Math.sin(hd), cz = -Math.cos(hd); tx = s.to ? x + cx * s.to : null; tz = s.to ? z + cz * s.to : null; arrived = false;
    const steps = Math.round(s.dur / dt);
    for (let i = 0; i < steps && k < n; i++, k++) {
      if (s.v > 0 && !arrived) {
        if (tx != null && Math.hypot(tx - x, tz - z) < 0.3) { arrived = true; vx = vz = 0; state = 'stand'; }
        else { const a = 1 - Math.exp(-8 * dt); vx += (cx * s.v - vx) * a; vz += (cz * s.v - vz) * a; yawT = Math.atan2(-vx, -vz); }
      } else { vx = vz = 0; }
      x += vx * dt; z += vz * dt; const rate = (Math.hypot(vx, vz) > 0.2 ? 9 : 5); yw += clampN(angD(yawT, yw), -rate * dt, rate * dt);
      const v = Math.hypot(vx, vz); pv += (v - pv) * Math.min(1, dt * 12);
      G.gaitUpdate(g, dt, { x: x * fp, z: z * fp, yaw: yw, v: pv * fv, walking: state === 'walk' || state === 'go' });
      const T = G.gaitTargets(g), sol = G.gaitSolve(g, T), lm = landmarks(B, C, sol, { x, z, yaw: yw });
      for (let j = 0; j < lm.length; j++) pos[k * Lc * 3 + j] = +lm[j].toFixed(4);
      root[k * 3] = x; root[k * 3 + 1] = 0; root[k * 3 + 2] = z; yaw[k] = yw; spd[k] = pv; st[k] = state; seg[k] = si; ph[k] = g.phase;
    }
  }
  const o = B.leg[0];
  return { id, dt, n: k, names: M.LM, pos, root, yaw, v: spd, state: st, seg, phase: ph, floor: 0,
    info: { hipY: B.hipY, hipHalf: B.hipHalf, thigh: o.l1, shank: o.l2, ankleH: o.ankleH, heelBack: B.heelBack, toeFwd: B.toeFwd, gaitLayer: true, kid: FIXTURE.chars[id].kid }, gait: g };
}
/** Record and analyse a steady walk at v m/s. */
export function steady(id, v, opts) { const sc = M.SCEN.steady(v), rec = new M.Rec(record(id, sc.plan, opts)); return { rec, a: M.analyseSteady(rec, sc.win) }; }
export { M, G };
