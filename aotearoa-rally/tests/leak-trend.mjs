// Trend-based GPU-resource leak check. Counts are sampled once per stage visit (alternating stages).
// For each stage: ignore the cold first visit, call occurrences 2-3 "early" and the rest "late".
//   geometries: mean(late) must stay within +10 % (+1) of mean(early)
//   textures / programs: the late maximum must not exceed the early maximum at all
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/** @param {{stage:string,geometries:number,textures:number,programs:number}[]} counts  @returns {string[]} problems */
export function leakProblems(counts) {
  const out = [];
  for (const id of [...new Set(counts.map((c) => c.stage))]) {
    const c = counts.filter((x) => x.stage === id).slice(1); // drop the cold visit
    if (c.length < 4) { out.push(`${id}: need at least 5 visits, got ${c.length + 1}`); continue; }
    const early = c.slice(0, 2), late = c.slice(2);
    const g0 = mean(early.map((x) => x.geometries)), g1 = mean(late.map((x) => x.geometries));
    if (g1 > g0 * 1.1 + 1) out.push(`${id}: geometries trend ${g0.toFixed(1)} -> ${g1.toFixed(1)} (> +10 %)`);
    for (const k of ["textures", "programs"]) {
      const m0 = Math.max(...early.map((x) => x[k])), m1 = Math.max(...late.map((x) => x[k]));
      if (m1 > m0) out.push(`${id}: ${k} grew ${m0} -> ${m1}`);
    }
  }
  return out;
}
