// Entry steps: a concrete tread (or up to three) in front of every ground-floor swing door whose sill stands above the ground outside.
// Pure data in the building-local frame: S.steps = [{ door, rect:{x0,z0,x1,z1}, y0, y1 }] with y relative to the ground-floor line (y1 is the
// walkable top, y0 reaches below the lowest ground under the tread). shellwin.buildEntrySteps draws them; colliders.js adds their tops as floors.
import { R } from './geom.js';

const DEPTHS = [0.55, 0.32, 0.32], MAXN = DEPTHS.length, TREAD = 0.2;

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
    const strip = (a, b) => {                                       // the ground strip a..b metres out from the face
      const p = face + s * a, q = face + s * b, lo = Math.min(p, q), hi = Math.max(p, q);
      return alongX ? R(c - hw, lo, c + hw, hi) : R(lo, c - hw, hi, c + hw);
    };
    let n = 1, low = floorY, gap = 0, a = 0;
    for (; n <= MAXN; n++) {
      a += DEPTHS[n - 1];
      const ys = [c - hw, c, c + hw].map((u) => (alongX ? hz(u, face + s * a) : hz(face + s * a, u))).filter((v) => v != null);
      if (!ys.length) { gap = 0; break; }
      low = Math.min(...ys); gap = floorY - low;
      if (gap <= n * TREAD) break;
    }
    n = Math.min(n, MAXN);
    if (gap < 0.06 || gap > MAXN * 0.26) continue;                  // flush with the ground, sunk below it, or too high for a plain step
    const rise = gap / n;
    let from = 0;
    for (let i = 0; i < n; i++) {
      const to = from + DEPTHS[i];
      S.steps.push({ door: d.id, rect: strip(from, to), y0: low - 0.06 - floorY, y1: -0.01 - i * rise });
      from = to;
    }
  }
}
