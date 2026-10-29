// Independent pace-note audit (after the R-PLAY audit): turn direction from the tangent rotation across each call, and the
// call's grade from the minimum circumcircle radius of points 12 m apart on the centreline.
// STAGES_BREAK=audit-grade bumps one corner's severity so the check can be seen to fail (self-test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStage, STAGE_IDS } from "../core/stage.mjs";

const BREAK = process.env.STAGES_BREAK || "";
const grade = (r) => (r <= 20 ? 1 : r <= 30 ? 2 : r <= 48 ? 3 : r <= 75 ? 4 : r <= 120 ? 5 : 6);

test("every corner call has the right direction and a grade matching the measured minimum radius", () => {
  let total = 0, off = 0;
  const bad = [];
  for (const id of STAGE_IDS) {
    const st = buildStage(id);
    const P = (s) => st.sample(Math.max(0, Math.min(st.lengthM, s)), {});
    const notes = st.pacenotes.filter((n) => n.kind === "corner" || n.kind === "hairpin");
    if (BREAK === "audit-grade" && id === "otago") notes[3].severity = notes[3].severity === 6 ? 5 : notes[3].severity + 1;
    for (const nt of notes) {
      const a = P(nt.s - 2), b = P(nt.s + nt.length + 2);
      const cross = a.tz * b.tx - a.tx * b.tz; // > 0 = left turn
      assert.equal(cross > 0 ? "left" : "right", nt.dir, `${id} s=${nt.s}: wrong direction`);
      let rmin = 1e9;
      for (let s = nt.s - 5; s <= nt.s + nt.length + 5; s += 2) {
        const p1 = P(s - 6), p2 = P(s), p3 = P(s + 6);
        const ax = p2.x - p1.x, az = p2.z - p1.z, bx = p3.x - p2.x, bz = p3.z - p2.z, cx = p3.x - p1.x, cz = p3.z - p1.z;
        const ar = Math.abs(ax * bz - az * bx) / 2;
        rmin = Math.min(rmin, ar < 1e-6 ? 1e9 : (Math.hypot(ax, az) * Math.hypot(bx, bz) * Math.hypot(cx, cz)) / (4 * ar));
      }
      const g = grade(rmin);
      const diff = nt.kind === "hairpin" ? (g <= 2 ? 0 : g - 1) : Math.abs(g - nt.severity);
      total++;
      if (diff >= 1) { off++; bad.push(`${id} s=${nt.s.toFixed(0)} call ${nt.severity} measured Rmin ${rmin.toFixed(1)} (grade ${g})`); }
    }
  }
  console.log(`# pace-note audit: ${total} corners, ${off} off by a grade`);
  assert.equal(off, 0, bad.join("\n"));
});
