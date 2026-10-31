// Entry steps: a concrete tread (or up to three) in front of every ground-floor swing door whose sill stands above the ground outside, and the other way round, a STOOP
// in front of a door whose ground outside is not below the sill (a street that climbs along the facade, a lot set low): a landing flush with the sill, then up to three treads.
// Pure data in the building-local frame: S.steps = [{ door, rect:{x0,z0,x1,z1}, y0, y1 }] with y relative to the ground-floor line (y1 is the
// walkable top, y0 reaches below the lowest ground under the tread). shellwin.buildEntrySteps draws them; colliders.js adds their tops as floors.
import { R } from './geom.js';

const DEPTHS = [0.55, 0.32, 0.32], MAXN = DEPTHS.length, TREAD = 0.2;
// The stoop. The plan's plinth sinks the ground 0.3 m below the floor under the footprint and 0.3 m beyond it (world/plan.js heightAt), and the hill's own height starts at
// that lip. Where the street is not below the sill, the walker stepped down into that pocket and could not climb out: the lip is steeper than physics.js allows (a gradient
// over 0.9, refused whenever the step rises more than 0.05) and often over its 0.5 m step-up (L78's main door in the real barrio: the street 0.33 m above its sill). The
// landing covers the pocket, flush with the sill; each tread after it is the lowest one (a riser of 0.12 m or more, 0.45 at most) that a walker gets onto and over with the
// kernel's own rules (`climb`, run on three lines across the door), and the stoop ends where a walker can go on over the bare ground. A tread over ground that is higher
// is walked as a floor patch: the terrain's gradient is only asked where the terrain is the highest surface. The same question settles a flight down: where a walker could
// not get off its flush first tread onto the ground past the pocket on every line (a street that climbs along the facade, so that it stands above the sill at one side of the
// door and below it at the other), the door gets the stoop, whatever the lowest ground says.
// The margins (0.03 for the kernel's 0.02 and 0.05, 0.85 for its 0.9) cover the phase of a stride: the kernel refuses the step its next stride lands on, and a stride is 0.02 m
// at a walk at 60 frames a second and 0.1 m at most, where the sampled walk below takes 0.065.
const LAND = 0.3, TREAD_UP = 0.32, STOOP_N = 4, RISE_MIN = 0.12, RISE_MAX = 0.45, WALK = 0.065, SLOPE = 0.85, CLEAR = 0.03, FREE = 0.03, FLUSH = -0.01;

export function planSteps(S) {
  S.steps = [];
  const ph = S.ctx.plan?.heightAt;
  if (!ph) return;
  const fr = S.frame, floorY = fr.y;
  const hz = (x, z) => { const p = fr.toWorld(x, 0, z), h = ph(p[0], p[2]); return Number.isFinite(h) ? h : null; };
  for (const d of S.doors) {
    if (!d.ext || d.roof || d.floor !== 0 || d.kind === 'shutter' || d.kind === 'arch') continue;
    const alongX = d.wall.dir === 'x', c = alongX ? d.x : d.z, hw = d.w / 2 + 0.2, t = d.wall.t / 2;
    const s = alongX ? -d.nz : -d.nx;                              // the outside lies toward +s on the wall's normal axis
    const face = d.wall.at + s * t;                                 // outer face of the wall
    const at = (u, a) => (alongX ? hz(u, face + s * a) : hz(face + s * a, u));       // the ground a metres out from the face, u along the wall
    const strip = (a, b) => {                                       // the ground strip a..b metres out from the face
      const p = face + s * a, q = face + s * b, lo = Math.min(p, q), hi = Math.max(p, q);
      return alongX ? R(c - hw, lo, c + hw, hi) : R(lo, c - hw, hi, c + hw);
    };
    let n = 1, low = floorY, gap = 0, a = 0, known = true;
    for (; n <= MAXN; n++) {
      a += DEPTHS[n - 1];
      const ys = [c - hw, c, c + hw].map((u) => at(u, a)).filter((v) => v != null);
      if (!ys.length) { known = false; gap = 0; break; }
      low = Math.min(...ys); gap = floorY - low;
      if (gap <= n * TREAD) break;
    }
    n = Math.min(n, MAXN);
    if (!known || gap > MAXN * 0.26) continue;                      // no ground to measure, or too high for a plain step
    const g = { fr, ph, at, strip, face, s, alongX, c, hw, floorY }, sim = walkers(d, g);
    // flush with the ground, sunk below it, the street climbs past the sill, or it does so at one side of the door only
    if (gap < 0.06 || !sim.all(LAND, DEPTHS[0], FLUSH, FLUSH)) { stoop(S, d, g, sim); continue; }
    const rise = gap / n;
    let from = 0;
    for (let i = 0; i < n; i++) {
      const to = from + DEPTHS[i];
      S.steps.push({ door: d.id, rect: strip(from, to), y0: low - 0.06 - floorY, y1: FLUSH - i * rise });
      from = to;
    }
  }
}

/** What a walker does over the ground in front of a door: physics.js _stepPos replayed along three lines across it. `rel(u, a)` is the ground relative to the sill; `all(a0, a1, top, y)`
 *  is true when a walker with its feet at y, on the tread (or the landing) before a0, goes on to a1 over the tread `top` (-Infinity: none) and the ground, on every line. */
function walkers(d, g) {
  const { fr, ph, at, face, s, alongX, c, floorY } = g;
  const rel = (u, a) => { const h = at(u, a); return h == null ? null : h - floorY; };              // the ground relative to the sill
  const steep = (u, a) => {                                         // physics.js _terrainGrad: a central difference over 0.25 m
    const p = alongX ? fr.toWorld(u, 0, face + s * a) : fr.toWorld(face + s * a, 0, u), e = 0.25;
    return Math.hypot(ph(p[0] + e, p[2]) - ph(p[0] - e, p[2]), ph(p[0], p[2] + e) - ph(p[0], p[2] - e)) / (2 * e) > SLOPE;
  };
  /** Along the line u, from a0 to a1: its feet at a1, or null when the walker is stopped. */
  const climb = (u, a0, a1, top, y) => {
    for (let a = a0 + 0.02; a <= a1 + 1e-9; a += WALK) {            // the first stride lands just past a0, where the lot's pocket may already have ended
      const h = rel(u, a);
      if (h == null) continue;
      if (h > y + 0.5 && h < y + 1.7) return null;                  // ground over the step-up and under the head: a wall
      const tr = top <= y + 0.5 ? top : -Infinity, te = h <= y + 0.5 ? h : -Infinity, best = Math.max(tr, te);
      if (best === -Infinity) return null;
      if (te > tr - CLEAR && best > y + FREE && steep(u, a)) return null;      // the ground is the highest surface (the kernel asks 0.02, we keep 0.03), climbed with a step over its free 0.05 (we keep 0.03), on a gradient over 0.9
      y = best;
    }
    return y;
  };
  const half = Math.max(0.3, d.w / 2 - 0.1), lines = [c - half, c, c + half];
  return { rel, all: (a0, a1, top, y) => lines.every((u) => climb(u, a0, a1, top, y) !== null) };
}

/** The landing and treads of a door whose ground outside is not below the sill, or is above it on one side (see LAND above). */
function stoop(S, d, g, { rel, all }) {
  const { strip, c, hw } = g, full = [c - hw, c, c + hw];
  const tread = (a0, a1, y1) => {
    let lo = Infinity;
    for (let x = a0; x <= a1 + 1e-6; x += 0.08) for (const u of full) { const h = rel(u, x); if (h != null && h < lo) lo = h; }
    S.steps.push({ door: d.id, rect: strip(a0, a1), y0: (Number.isFinite(lo) ? lo : -0.4) - 0.06, y1 });
  };
  let y = FLUSH, from = LAND;
  tread(0, LAND, y);                                                // the landing covers the plinth's pocket, flush with the sill
  for (let k = 1; k < STOOP_N && !all(from, from + 2 * TREAD_UP, -Infinity, y); k++) {     // until a walker goes on over the bare ground
    const to = from + TREAD_UP;
    let top = y + TREAD;                                            // no riser does it: a stride's, as a best effort
    for (let r = RISE_MIN; r <= RISE_MAX + 1e-9; r += 0.02) if (all(from, to, y + r, y)) { top = y + r + 0.01; break; }
    tread(from, to, top);
    y = top; from = to;
  }
}
