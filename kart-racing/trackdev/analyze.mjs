// node trackdev/analyze.mjs [id] -> stats + trackdev/outlines.html (svg coloured by elevation)
import { TRACK_DEFS, splineClosed, elevAt } from "../trackdefs.js";
import fs from "fs";
const only = process.argv[2];
let svg = "";
TRACK_DEFS.forEach((def) => {
  if (only && !def.id.startsWith(only)) return;
  const d = splineClosed(def.points, 40);
  let L = 0; const cum = [0];
  for (let i = 1; i <= d.length; i++) { const a = d[i - 1], b = d[i % d.length]; L += Math.hypot(b.x - a.x, b.z - a.z); cum.push(L); }
  const N = Math.round(L / 2), ds = L / N, P = []; let j = 0;
  for (let i = 0; i < N; i++) { const s = i * ds; while (cum[j + 1] < s) j++; const f = (s - cum[j]) / (cum[j + 1] - cum[j]); const a = d[j], b = d[(j + 1) % d.length]; P.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }); }
  const Y = P.map((p, i) => elevAt(def.elev, i / N));
  const hw = def.width / 2, wall = hw + 1.3 + 4.2;
  const th = P.map((p, i) => { const q = P[(i + 1) % N]; return Math.atan2(q.x - p.x, q.z - p.z); });
  const K = []; let minR = 1e9, minRi = 0;
  for (let i = 0; i < N; i++) { let dt = th[(i + 3) % N] - th[(i - 3 + N) % N]; while (dt > Math.PI) dt -= 2 * Math.PI; while (dt < -Math.PI) dt += 2 * Math.PI; K.push(-dt / (6 * ds)); if (Math.abs(K[i]) > 1e-6 && 1 / Math.abs(K[i]) < minR) { minR = 1 / Math.abs(K[i]); minRi = i; } }
  let maxSlope = 0, ms = 0; for (let i = 0; i < N; i++) { const sl = Math.abs(Y[(i + 1) % N] - Y[i]) / ds; if (sl > maxSlope) { maxSlope = sl; ms = i * ds; } }
  const ymin = Math.min(...Y), ymax = Math.max(...Y);
  // crossings + clearance
  let minC = 1e9, cl = null; const cross = [];
  for (let i = 0; i < N; i++) for (let k = i + 1; k < N; k++) {
    const sep = Math.min(k - i, N - (k - i)) * ds; if (sep < 120) continue;
    const dd = Math.hypot(P[i].x - P[k].x, P[i].z - P[k].z);
    if (dd < 2 * wall + 4) { const dy = Math.abs(Y[i] - Y[k]); if (dd < 2.0) cross.push([i * ds, k * ds, dy]); if (dy < 8.5 && dd < 2 * wall + 4 && dd < minC) { minC = dd; cl = [i * ds, k * ds, dy]; } }
  }
  // crossing summary (dedupe)
  const cr = []; for (const c of cross) if (!cr.some((e) => Math.abs(e[0] - c[0]) < 20 && Math.abs(e[1] - c[1]) < 20)) cr.push(c);
  let straightBack = 0; for (let i = 1; i < 60; i++) { if (Math.abs(K[(N - i) % N]) > 1 / 600) break; straightBack = i * ds; }
  let flatStart = 0; for (let i = -20; i < 40; i++) flatStart = Math.max(flatStart, Math.abs(Y[(i + N) % N] - Y[((i + 1) + N) % N]) / ds);
  console.log(`${def.id}: len=${L.toFixed(0)} minR=${minR.toFixed(1)}@s${(minRi * ds).toFixed(0)} y=${ymin.toFixed(1)}..${ymax.toFixed(1)} maxSlope=${(maxSlope * 100).toFixed(1)}%@s${ms.toFixed(0)} straightBack=${straightBack.toFixed(0)} startSlope=${(flatStart * 100).toFixed(1)}%`);
  console.log("   crossings:", cr.map((c) => `s${c[0].toFixed(0)}/s${c[1].toFixed(0)} dy=${c[2].toFixed(1)}`).join("  ") || "none", " | tight non-crossing clearance:", cl ? `${minC.toFixed(1)} at ${cl.map((v) => v.toFixed(0))}` : "ok");
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9; P.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
  const col = (y) => { const t = (y - ymin) / Math.max(1, ymax - ymin); return `hsl(${220 - 200 * t},80%,${45 + 15 * t}%)`; };
  svg += `<div style="display:inline-block;margin:4px"><b>${def.id} ${L.toFixed(0)}m</b><svg width="${maxX - minX + 100}" height="${maxZ - minZ + 100}" viewBox="${minX - 50} ${minZ - 50} ${maxX - minX + 100} ${maxZ - minZ + 100}" style="background:#223">`;
  for (let i = 0; i < N; i++) { const a = P[i], b = P[(i + 1) % N]; svg += `<line x1="${a.x}" y1="${a.z}" x2="${b.x}" y2="${b.z}" stroke="${col(Y[i])}" stroke-width="${def.width}" stroke-linecap="butt"/>`; }
  for (let i = 0; i < N; i += 25) { svg += `<text x="${P[i].x}" y="${P[i].z}" font-size="9" fill="#fff" stroke="#000" stroke-width="0.4">${(i * ds).toFixed(0)}:${Y[i].toFixed(0)}</text>`; }
  def.points.forEach((p, i) => { svg += `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${i === 0 ? "#0f0" : "#fff"}"/><text x="${p[0] + 3}" y="${p[1] - 3}" font-size="7" fill="#ff0">${i}</text>`; });
  svg += `</svg></div>`;
});
fs.writeFileSync(new URL("./outlines.html", import.meta.url), `<body style="background:#111;color:#fff;font:12px sans-serif">${svg}</body>`);
