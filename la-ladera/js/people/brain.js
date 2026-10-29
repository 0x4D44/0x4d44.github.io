// NPC decision making (no THREE, no DOM): what to do next when a task ends, how to recover when stuck, when to go home / wake up.
// P1 = outdoor wander with per-persona rhythm and a day/night cycle. The world calls `next(npc, svc)` when an idle task expires and `unstick(npc, svc)`
// when an NPC has made no progress for ~4 s; `tick(npc)` once a second for the clock.
import { PERSONAS } from './personas.js';

const PROFILE = {
  default:    { walk: 0.62, idle: [4, 11], radius: 120, acts: [['idle', 0.86], ['phone', 0.14]] },
  shopkeeper: { walk: 0.22, idle: [8, 22], radius: 16, acts: [['idle', 0.92], ['phone', 0.08]] },
  elder:      { walk: 0.36, idle: [8, 20], radius: 45, acts: [['idle', 1]] },
  kid:        { walk: 0.8, idle: [2, 6], radius: 75, acts: [['bounce', 0.5], ['fidget', 0.5]] },
  teen:       { walk: 0.55, idle: [4, 12], radius: 95, acts: [['idle', 0.48], ['phone', 0.52]] },
};
const ROUTINE_PROFILE = { shopkeeper: 'shopkeeper', elder: 'elder', kid: 'kid', teen: 'teen' };

const pickWeighted = (rng, list) => { let t = 0; for (const [, w] of list) t += w; let r = rng.next() * t; for (const [v, w] of list) { r -= w; if (r <= 0) return v; } return list[list.length - 1][0]; };

export class Brain {
  constructor(world) { this.w = world; }

  profile(npc) { return PROFILE[ROUTINE_PROFILE[PERSONAS[npc.persona]?.routine] ?? 'default']; }

  /** Rise/bed hours are per NPC (set once at casting). */
  awakeAt(npc, hour) { return hour >= npc.riseH && hour < npc.bedH; }

  // ---- decisions ----------------------------------------------------------------------------------------------------------------
  next(npc, svc) {
    const prof = this.profile(npc), r = npc.rng;
    if (r.next() < prof.walk && this.goSomewhere(npc, svc, prof)) return;
    this.stand(npc, svc, prof);
  }

  stand(npc, svc, prof = this.profile(npc), minS = null, maxS = null) {
    const r = npc.rng, act = pickWeighted(r, prof.acts);
    const [a, b] = minS != null ? [minS, maxS ?? minS * 2] : prof.idle;
    // turn a little so a standing person does not stare along the street forever
    const face = npc.ry + (r.next() - 0.5) * 1.6;
    npc.stand(svc, act, a + r.next() * (b - a), face);
    npc.goal = null;
  }

  goSomewhere(npc, svc, prof = this.profile(npc)) {
    const W = this.w, nav = W.nav, r = npc.rng; if (!nav?.size) return false;
    const from = nav.nearest(npc.x, npc.z, 30, npc.y); if (from < 0) return false;
    const hn = nav.nodes[npc.homeNode] ?? nav.nodes[from];
    let best = -1, bs = -1e9;
    for (let k = 0; k < 10; k++) {
      const j = nav.randomNode(r, (n) => W.inMain(n.i)), n = nav.nodes[j];
      const dh = Math.hypot(n.x - hn.x, n.z - hn.z), dc = Math.hypot(n.x - npc.x, n.z - npc.z);
      if (dh > prof.radius || dc < 10) continue;
      const score = -Math.abs(dc - 38) + r.next() * 16;
      if (score > bs) { bs = score; best = j; }
    }
    if (best < 0) return false;
    return this.goNode(npc, svc, from, best);
  }

  goNode(npc, svc, from, to, arrive = null) {
    const W = this.w, idx = W.nav.path(from, to);
    if (!idx || idx.length < 1) { npc.pathFails = (npc.pathFails ?? 0) + 1; return false; }
    npc.goal = to;
    const pts = W.waypoints(npc, idx);
    const kid = npc.age === 'kid', sp = npc.speedBase * (kid && npc.rng.chance(0.4) ? 1.55 : 0.93 + npc.rng.next() * 0.14);
    return npc.walk(svc, pts, arrive ?? ((n, s) => this.arrived(n, s)), sp);
  }

  arrived(npc, svc) { this.stand(npc, svc, this.profile(npc), 3, 9); }

  // ---- recovery -----------------------------------------------------------------------------------------------------------------
  /** Called after ~4 s without progress. Re-path, then side-step, then (out of sight only) snap to the graph. */
  unstick(npc, svc) {
    const W = this.w; npc.unstuckCount = (npc.unstuckCount ?? 0) + 1; npc.stuckT = 1.5;
    const nn = W.nav.nearest(npc.x, npc.z, 16, npc.y);
    const unseen = !npc.visible || npc.dist > 40;
    if (npc.unstuckCount % 3 === 0 && unseen && nn >= 0) { W.snapToNode(npc, nn); this.stand(npc, svc, this.profile(npc), 1, 3); return; }
    if (npc.unstuckCount % 3 === 1 && nn >= 0 && npc.goal != null && npc.goal !== nn) { if (this.goNode(npc, svc, nn, npc.goal, npc.arrive)) return; }
    npc.sidestep = 1.4; npc.sideDir = -npc.sideDir;
    if (npc.unstuckCount >= 5 && unseen && nn >= 0) { W.snapToNode(npc, nn); npc.unstuckCount = 0; this.stand(npc, svc, this.profile(npc), 1, 3); }
  }

  // ---- clock --------------------------------------------------------------------------------------------------------------------
  /** Once a second: put people to bed at night and get them up in the morning. */
  tick(npc, hour, svc) {
    if (npc.mode === 'talk') return;
    const awake = this.awakeAt(npc, hour);
    if (npc.away) { if (awake) this.wake(npc, svc); return; }
    if (awake) { npc.goingHome = false; return; }
    if (npc.goingHome) return;
    // time for bed: out of sight -> just vanish, otherwise walk home first
    if (!npc.visible && npc.dist > 25) { this.sleep(npc); return; }
    const W = this.w, from = W.nav.nearest(npc.x, npc.z, 30, npc.y);
    npc.goingHome = true;
    if (from < 0 || npc.homeNode == null || !this.goNode(npc, svc, from, npc.homeNode, (n) => this.sleep(n))) this.sleep(npc);
  }

  sleep(npc) { npc.away = true; npc.goingHome = false; npc.mode = 'idle'; npc.path = null; npc.moving = false; npc.visible = false; if (npc.view) npc.view.root.visible = false; }

  wake(npc, svc) {
    const W = this.w, h = npc.homePos;
    npc.away = false; npc.goingHome = false;
    W.placeNpc(npc, h.x, h.z, h.y, npc.rng.range(-Math.PI, Math.PI));
    this.stand(npc, svc, this.profile(npc), 0.4, 3);
  }
}
