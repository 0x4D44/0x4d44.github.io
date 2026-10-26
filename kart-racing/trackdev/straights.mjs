import { TRACK_DEFS, splineClosed, elevAt } from "../trackdefs.js";
for (const def of TRACK_DEFS) {
  const d = splineClosed(def.points, 40); let L = 0; const cum = [0];
  for (let i = 1; i <= d.length; i++) { const a = d[i - 1], b = d[i % d.length]; L += Math.hypot(b.x - a.x, b.z - a.z); cum.push(L); }
  const N = Math.round(L / 2), ds = L / N, P = []; let j = 0;
  for (let i = 0; i < N; i++) { const s = i * ds; while (cum[j + 1] < s) j++; const f = (s - cum[j]) / (cum[j + 1] - cum[j]); const a = d[j], b = d[(j + 1) % d.length]; P.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }); }
  const th = P.map((p, i) => { const q = P[(i + 1) % N]; return Math.atan2(q.x - p.x, q.z - p.z); });
  const K = []; for (let i = 0; i < N; i++) { let dt = th[(i + 4) % N] - th[(i - 4 + N) % N]; while (dt > Math.PI) dt -= 2 * Math.PI; while (dt < -Math.PI) dt += 2 * Math.PI; K.push(-dt / (8 * ds)); }
  const out = []; let st = -1;
  for (let i = 0; i <= N; i++) { const ok = i < N && Math.abs(K[i]) < 0.0035; if (ok && st < 0) st = i; if (!ok && st >= 0) { if ((i - st) * ds >= 45) out.push(`${(st * ds).toFixed(0)}-${(i * ds).toFixed(0)}(${((i - st) * ds).toFixed(0)}m)`); st = -1; } }
  console.log(def.id, L.toFixed(0), "straights:", out.join("  "));
  const sl = []; for (let i = 0; i < N; i += 25) sl.push(`${(i * ds).toFixed(0)}:${elevAt(def.elev, i / N).toFixed(1)}`); console.log("   y:", sl.join(" "));
}
