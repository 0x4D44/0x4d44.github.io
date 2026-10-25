// node dev/analyze.mjs  -> prints stats per track and writes dev/outlines.html (svg) for viewing
import { TRACK_DEFS, splineClosed } from "../trackdefs.js";
import fs from "fs";
let svg = "";
TRACK_DEFS.forEach((def, ti) => {
  if (!def.points.length) return;
  const d = splineClosed(def.points, 40);
  // resample 2m
  let L = 0; const cum = [0];
  for (let i = 1; i <= d.length; i++) { const a = d[i - 1], b = d[i % d.length]; L += Math.hypot(b.x - a.x, b.z - a.z); cum.push(L); }
  const N = Math.round(L / 2), ds = L / N, P = [];
  let j = 0;
  for (let i = 0; i < N; i++) { const s = i * ds; while (cum[j + 1] < s) j++; const f = (s - cum[j]) / (cum[j + 1] - cum[j]); const a = d[j], b = d[(j + 1) % d.length]; P.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }); }
  const hw = def.width / 2, wall = hw + 1.2 + 4.0;
  // min radius
  let minR = 1e9, minRi = 0;
  const th = P.map((p, i) => { const q = P[(i + 1) % N]; return Math.atan2(q.x - p.x, q.z - p.z); });
  const K = []; for (let i = 0; i < N; i++) { let dt = th[(i + 3) % N] - th[(i - 3 + N) % N]; while (dt > Math.PI) dt -= 2 * Math.PI; while (dt < -Math.PI) dt += 2 * Math.PI; K.push(-dt / (6 * ds)); if (Math.abs(K[i]) > 1e-6 && 1 / Math.abs(K[i]) < minR) { minR = 1 / Math.abs(K[i]); minRi = i; } }
  // clearance
  let minC = 1e9, ci = 0, cj = 0;
  for (let i = 0; i < N; i++) for (let k = i + 1; k < N; k++) { const sep = Math.min(k - i, N - (k - i)) * ds; if (sep < 150) continue; const dd = Math.hypot(P[i].x - P[k].x, P[i].z - P[k].z); if (dd < minC) { minC = dd; ci = i; cj = k; } }
  // straight behind start
  let straightBack = 0; for (let i = 1; i < 60; i++) { if (Math.abs(K[(N - i) % N]) > 1 / 600) break; straightBack = i * ds; }
  // longest straight
  let best = 0, cur = 0, bestAt = 0; for (let i = 0; i < 2 * N; i++) { if (Math.abs(K[i % N]) < 1 / 500) { cur += ds; if (cur > best) { best = cur; bestAt = (i % N) * ds; } } else cur = 0; }
  console.log(`${def.id}: len=${L.toFixed(0)}m N=${N} minR=${minR.toFixed(1)}m@s${(minRi * ds).toFixed(0)} clearance=${minC.toFixed(1)} (need>${(2 * wall + 6).toFixed(1)}) @s${(ci * ds).toFixed(0)}/${(cj * ds).toFixed(0)} straightBack=${straightBack}m longestStraight=${best.toFixed(0)}m ends@${bestAt.toFixed(0)}`);
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; P.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
  const ox = ti * 0; const sc = 1.0;
  svg += `<div style="display:inline-block;margin:4px"><b>${def.id}</b><svg width="${(maxX - minX + 80) * sc}" height="${(maxZ - minZ + 80) * sc}" viewBox="${minX - 40} ${minZ - 40} ${maxX - minX + 80} ${maxZ - minZ + 80}" style="background:#223">`;
  svg += `<polyline fill="none" stroke="#ccd" stroke-width="${def.width}" stroke-linejoin="round" points="${P.map(p => p.x.toFixed(1) + "," + p.z.toFixed(1)).join(" ")} ${P[0].x},${P[0].z}"/>`;
  svg += `<polyline fill="none" stroke="#e44" stroke-width="1" points="${P.map(p => p.x.toFixed(1) + "," + p.z.toFixed(1)).join(" ")} ${P[0].x},${P[0].z}"/>`;
  def.points.forEach((p, i) => { svg += `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${i === 0 ? "#0f0" : "#fa0"}"/><text x="${p[0] + 3}" y="${p[1] - 3}" font-size="7" fill="#ff0">${i}</text>`; });
  svg += `</svg></div>`;
});
fs.writeFileSync(new URL("./outlines.html", import.meta.url), `<body style="background:#111;color:#fff;font:12px sans-serif">${svg}</body>`);
