// Lead's independent oracle for the PLAN (CONTRACT 5.1). `checkPlan(plan)` is a pure function over plan data, so the fixtures in
// plan-oracle.test.mjs can prove that every check is able to fail. Run it on the real plan:
//   node --import ./la-ladera/tests/register.mjs la-ladera/tests/plan-oracle.mjs [--seed N] [--json]      (exit 1 = violations)
import './nice.mjs';
import { pathToFileURL } from 'node:url';
import { LOT_KINDS, SHOP_TYPES, STREET_KINDS } from '../js/core/vocab.js';

const SIDES = ['front', 'left', 'right', 'back'];
const SURFACES = ['asphalt', 'concrete', 'cobble', 'dirt', 'stairs'];
const PLAZA_KINDS = ['plaza', 'court', 'yard', 'mirador'];
// Contract: road <= 12 %, alley <= 22 %, stairs ~55-65 %. 'street', 'path' and the flat kinds are not specified there; these caps are the lead's.
const GRADE_MAX = { road: 0.12, street: 0.18, alley: 0.22, path: 0.30, plaza: 0.06, court: 0.06 };
const STAIR_FLIGHT = [0.50, 0.72];   // steepest sample on a stairway = its flight gradient (contract: ~55-65 %) ...
const STAIR_FLIGHT_SHARE = 0.15;     // ... and at least this share of the centre-line must be flight (>= 40 %), else it is a ramp
const fin = (...v) => v.every((n) => Number.isFinite(n));

export function corners(l) {
  const c = Math.cos(l.rotY), s = Math.sin(l.rotY), hw = l.w / 2, hd = l.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [l.x + lx * c + lz * s, l.z - lx * s + lz * c]);
}

/** Separating-axis result for two rectangles: > 0 = separated by at least that much along an axis, < 0 = overlap depth along the best axis. */
function sat(A, B) {
  let sep = -Infinity;
  for (const P of [A, B]) {
    for (let i = 0; i < 2; i++) {
      const [x1, z1] = P[i], [x2, z2] = P[i + 1];
      let nx = -(z2 - z1), nz = x2 - x1; const len = Math.hypot(nx, nz); nx /= len; nz /= len;
      const pa = A.map(([x, z]) => x * nx + z * nz), pb = B.map(([x, z]) => x * nx + z * nz);
      const gap = Math.max(Math.min(...pa) - Math.max(...pb), Math.min(...pb) - Math.max(...pa));
      if (gap > sep) sep = gap;
    }
  }
  return sep;
}
function segDist(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
/** True distance between two separated rectangles (0 if they touch or overlap). */
export function rectGap(A, B) {
  const s = sat(A, B);
  if (s <= 0) return 0;
  let m = Infinity;
  for (const [P, Q] of [[A, B], [B, A]]) for (const [x, z] of P) for (let i = 0; i < 4; i++) m = Math.min(m, segDist(x, z, Q[i], Q[(i + 1) % 4]));
  return m;
}
function inPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function segsCross([ax, az], [bx, bz], [cx, cz], [dx, dz]) {
  const o = (px, pz, qx, qz, rx, rz) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  return o(ax, az, bx, bz, cx, cz) !== o(ax, az, bx, bz, dx, dz) && o(cx, cz, dx, dz, ax, az) !== o(cx, cz, dx, dz, bx, bz);
}
/** Distance from a rectangle to a polyline (0 if they intersect). */
export function rectToPolyline(R, pts) {
  let m = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (inPoly(a[0], a[1], R) || inPoly(b[0], b[1], R)) return 0;
    for (let k = 0; k < 4; k++) {
      const c = R[k], d = R[(k + 1) % 4];
      if (segsCross(a, b, c, d)) return 0;
      m = Math.min(m, segDist(c[0], c[1], a, b), segDist(a[0], a[1], c, d), segDist(b[0], b[1], c, d));
    }
  }
  return m;
}

/** Candidate world positions ~1.2 m outside the lot's main entrance (the sign convention of `u` is not fixed, so both signs are returned). */
export function outsideCandidates(l, m = 1.2) {
  const e = l.entrance; if (!e || !SIDES.includes(e.side)) return [];
  const u = e.u ?? 0, hw = l.w / 2, hd = l.d / 2, c = Math.cos(l.rotY), s = Math.sin(l.rotY);
  const W = (lx, lz) => [l.x + lx * c + lz * s, l.z - lx * s + lz * c];
  const out = [];
  for (const us of u === 0 ? [0] : [u, -u]) {
    if (e.side === 'front') out.push(W(us, hd + m));
    else if (e.side === 'back') out.push(W(us, -hd - m));
    else if (e.side === 'right') out.push(W(hw + m, us));
    else out.push(W(-hw - m, us));
  }
  return out;
}

function lcg(seed) { let a = seed >>> 0; return () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Gradient samples along a street's centre-line (1 m steps, skipping 1.5 m around corners and the first/last metre). */
export function streetGrades(street, heightAt) {
  const pts = street.pts, out = [];
  const total = pts.reduce((a, p, k) => (k ? a + Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) : 0), 0);
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 1e-6) continue;
    const tx = (x2 - x1) / L, tz = (z2 - z1) / L;
    for (let d = 0; d <= L; d += 1) {
      const sAlong = acc + d;
      if (d < 1.5 && i > 0) continue;
      if (L - d < 1.5 && i + 2 < pts.length) continue;
      if (sAlong < 1 || total - sAlong < 1) continue;
      const px = x1 + tx * d, pz = z1 + tz * d;
      const g = Math.abs(heightAt(px + tx * 0.5, pz + tz * 0.5) - heightAt(px - tx * 0.5, pz - tz * 0.5));
      out.push(g);
    }
    acc += L;
  }
  return out;
}

/**
 * Returns { violations:[{code,msg}], stats }. `opts.seed` is only used for the cliff-scan sampling.
 */
export function checkPlan(plan, opts = {}) {
  const v = [], stats = {};
  const bad = (code, msg) => v.push({ code, msg });
  if (!plan || typeof plan !== 'object') { bad('shape', 'plan missing'); return { violations: v, stats }; }
  for (const k of ['lots', 'streets', 'plazas', 'pois', 'landmarks', 'areas']) if (!Array.isArray(plan[k])) bad('shape', `plan.${k} is not an array`);
  if (typeof plan.heightAt !== 'function') bad('shape', 'plan.heightAt is not a function');
  if (!plan.nav || !Array.isArray(plan.nav.nodes) || !Array.isArray(plan.nav.edges)) bad('shape', 'plan.nav.{nodes,edges} missing');
  if (!plan.spawn || !fin(plan.spawn.x, plan.spawn.z, plan.spawn.yaw)) bad('shape', 'plan.spawn {x,z,yaw} missing');
  if (v.length) return { violations: v, stats };
  const h = plan.heightAt, lots = plan.lots, B = 100;

  // ---- lots
  stats.lots = lots.length;
  if (lots.length < 40 || lots.length > 52) bad('lots.count', `${lots.length} lots (want ~42-50)`);
  const ids = new Set();
  for (const l of lots) {
    const tag = l.id ?? '?';
    if (typeof l.id !== 'string' || ids.has(l.id)) bad('lots.id', `lot id ${tag} missing or duplicated`);
    ids.add(l.id);
    if (!LOT_KINDS.includes(l.kind)) bad('lots.kind', `${tag}: kind ${l.kind}`);
    if (!fin(l.x, l.y, l.z, l.rotY, l.w, l.d, l.fh)) { bad('lots.fields', `${tag}: non-finite x/y/z/rotY/w/d/fh`); continue; }
    if (l.w < 2.5 || l.d < 2.5 || l.w > 40 || l.d > 40) bad('lots.size', `${tag}: ${l.w} x ${l.d} m`);
    if (!Number.isInteger(l.floors) || l.floors < 1 || l.floors > 6) bad('lots.floors', `${tag}: floors ${l.floors}`);
    if (l.fh < 2.4 || l.fh > 4.6) bad('lots.fh', `${tag}: fh ${l.fh}`);
    if (!l.entrance || !SIDES.includes(l.entrance.side) || !fin(l.entrance.u ?? 0)) bad('lots.entrance', `${tag}: entrance ${JSON.stringify(l.entrance)}`);
    else {
      const half = (l.entrance.side === 'front' || l.entrance.side === 'back' ? l.w : l.d) / 2;
      if (Math.abs(l.entrance.u ?? 0) > half - 0.5) bad('lots.entrance', `${tag}: u=${l.entrance.u} is off the ${l.entrance.side} wall (half length ${half})`);
    }
    if (l.front && !plan.streets.some((s) => s.id === l.front) && !plan.plazas.some((p) => p.id === l.front)) bad('lots.front', `${tag}: front ${l.front} is neither a street nor a plaza`);
    for (const [cx, cz] of corners(l)) if (Math.abs(cx) > B + 0.01 || Math.abs(cz) > B + 0.01) { bad('lots.bounds', `${tag}: corner (${cx.toFixed(1)}, ${cz.toFixed(1)}) outside the 200 m square`); break; }
  }
  const kinds = new Set(lots.map((l) => l.kind));
  for (const k of LOT_KINDS) if (!kinds.has(k)) bad('lots.kinds', `no lot of kind ${k}`);
  const shops = lots.filter((l) => l.shop);
  stats.shops = shops.length; stats.shopTypes = new Set(shops.map((l) => l.shop)).size;
  if (shops.length < 12) bad('shops.count', `${shops.length} shops (want >= 12)`);
  if (stats.shopTypes < 10) bad('shops.types', `${stats.shopTypes} shop types (want >= 10)`);
  for (const l of shops) if (!SHOP_TYPES.includes(l.shop)) bad('shops.type', `${l.id}: shop ${l.shop}`);

  // ---- overlaps (>= 0.3 m between footprints unless a party wall; never interpenetrating beyond a wall thickness)
  const rects = lots.map((l) => (fin(l.x, l.z, l.rotY, l.w, l.d) ? corners(l) : null));
  const partyOf = (l) => !!(l.party && (l.party.left || l.party.right || l.party.back));
  for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) {
    if (!rects[i] || !rects[j]) continue;
    const a = lots[i], b = lots[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) > Math.hypot(a.w, a.d) / 2 + Math.hypot(b.w, b.d) / 2 + 1) continue;
    const s = sat(rects[i], rects[j]);
    if (s < -0.26) { bad('lots.overlap', `${a.id} and ${b.id} overlap by ${(-s).toFixed(2)} m`); continue; }
    const gap = s <= 0 ? 0 : rectGap(rects[i], rects[j]);
    if (gap < 0.3 && !(partyOf(a) || partyOf(b))) bad('lots.gap', `${a.id} and ${b.id} are ${gap.toFixed(2)} m apart with no party wall`);
  }

  // ---- ground under and at the door of each lot (CONTRACT amendment: plinth = lot.y - 0.30; door ground within +-0.35 of lot.y)
  for (const l of lots) {
    if (!rects[lots.indexOf(l)]) continue;
    const c = Math.cos(l.rotY), s = Math.sin(l.rotY);
    for (const [fx, fz] of [[0, 0], [0.35, 0.35], [-0.35, 0.35], [0.35, -0.35], [-0.35, -0.35]]) {
      const lx = fx * (l.w / 2 - 0.4), lz = fz * (l.d / 2 - 0.4);
      const y = h(l.x + lx * c + lz * s, l.z - lx * s + lz * c);
      if (!Number.isFinite(y) || Math.abs(y - (l.y - 0.30)) > 0.03) { bad('lots.plinth', `${l.id}: heightAt inside the footprint is ${y?.toFixed?.(2)}, want lot.y-0.30 = ${(l.y - 0.30).toFixed(2)}`); break; }
    }
    const cands = outsideCandidates(l);
    if (!cands.length) continue;
    const best = Math.min(...cands.map(([x, z]) => Math.abs(h(x, z) - l.y)));
    if (!(best <= 0.40)) bad('lots.doorground', `${l.id}: ground outside the door is ${best.toFixed(2)} m from the floor (want within 0.35)`);
  }

  // ---- streets
  const sids = new Set();
  stats.grade = {};
  for (const st of plan.streets) {
    if (typeof st.id !== 'string' || sids.has(st.id)) bad('streets.id', `street id ${st.id} missing or duplicated`);
    sids.add(st.id);
    if (!STREET_KINDS.includes(st.kind)) { bad('streets.kind', `${st.id}: kind ${st.kind}`); continue; }
    if (!SURFACES.includes(st.surface)) bad('streets.surface', `${st.id}: surface ${st.surface}`);
    if (!(st.width > 0) || !Array.isArray(st.pts) || st.pts.length < 2 || st.pts.some((p) => !fin(p[0], p[1]))) { bad('streets.fields', `${st.id}: width/pts`); continue; }
    const g = streetGrades(st, h);
    if (!g.length) continue;
    const max = Math.max(...g);
    stats.grade[st.kind] = Math.max(stats.grade[st.kind] ?? 0, max);
    if (st.kind === 'stair') {
      // A flight's gradient is read at its steepest sample: the 1 m window blurs every landing-to-flight transition, so means understate it.
      const flight = g.filter((x) => x >= 0.4);
      if (flight.length < g.length * STAIR_FLIGHT_SHARE) bad('streets.stair', `${st.id}: only ${flight.length}/${g.length} samples are flight (gradient >= 40 %): it is a ramp or a flat`);
      else if (max < STAIR_FLIGHT[0] || max > STAIR_FLIGHT[1]) bad('streets.stair', `${st.id}: steepest flight sample ${(max * 100).toFixed(0)} % (want ${STAIR_FLIGHT[0] * 100}-${STAIR_FLIGHT[1] * 100})`);
    } else if (GRADE_MAX[st.kind] != null && max > GRADE_MAX[st.kind] + 0.005) {
      bad('streets.gradient', `${st.id} (${st.kind}): ${(max * 100).toFixed(1)} % (max ${GRADE_MAX[st.kind] * 100} %)`);
    }
  }
  if (!plan.streets.some((s) => s.kind === 'stair')) bad('streets.stair', 'no stairways at all');
  if (!plan.streets.some((s) => s.kind === 'alley')) bad('streets.alley', 'no alleys at all');

  // ---- no building stands in the carriageway or in a plaza (a lot's plinth override would punch a hole in the street profile)
  for (let i = 0; i < lots.length; i++) {
    if (!rects[i]) continue;
    for (const st of plan.streets) {
      if (st.kind === 'plaza' || st.kind === 'court' || !Array.isArray(st.pts) || st.pts.length < 2 || !(st.width > 0)) continue;
      const d = rectToPolyline(rects[i], st.pts);
      if (d < st.width / 2 - 0.25) bad('lots.onstreet', `${lots[i].id} (${lots[i].kind}) is ${d.toFixed(1)} m from the centre-line of ${st.id} ${st.name ?? ''} (half width ${(st.width / 2).toFixed(1)})`);
    }
    for (const p of plan.plazas) {
      if (!Array.isArray(p.poly) || p.poly.length < 3) continue;
      const R = rects[i], inside = R.filter(([x, z]) => inPoly(x, z, p.poly)).length + (inPoly(lots[i].x, lots[i].z, p.poly) ? 1 : 0);
      if (inside >= (lots[i].front === p.id ? 3 : 2)) bad('lots.onplaza', `${lots[i].id} (${lots[i].kind}) stands inside plaza ${p.id} ${p.name ?? ''}`);
    }
  }

  // ---- terrain relief, continuity
  const rise = h(0, -B + 1) - h(0, B - 1);
  stats.rise = +rise.toFixed(1);
  if (!(rise >= 15)) bad('terrain.relief', `only ${rise.toFixed(1)} m of rise from the bottom to the top of the hill (want >= 15)`);
  const rnd = lcg(opts.seed ?? 7); let cliffs = 0, n = 0; const where = [];
  for (let k = 0; k < 6000; k++) {
    const x = (rnd() * 2 - 1) * 98, z = (rnd() * 2 - 1) * 98, a = rnd() * Math.PI * 2, x2 = x + Math.cos(a) * 0.25, z2 = z + Math.sin(a) * 0.25;
    if (lots.some((l, i) => rects[i] && (Math.hypot(l.x - x, l.z - z) < Math.hypot(l.w, l.d) / 2 + 1.5) && rectGap(rects[i], [[x - 0.01, z - 0.01], [x + 0.01, z - 0.01], [x + 0.01, z + 0.01], [x - 0.01, z + 0.01]]) < 1.2)) continue;
    n++;
    if (Math.abs(h(x, z) - h(x2, z2)) > 0.45) { cliffs++; if (where.length < 4) where.push(`(${x.toFixed(1)}, ${z.toFixed(1)})`); }
  }
  stats.cliffs = +(cliffs / Math.max(1, n)).toFixed(4);
  if (cliffs / Math.max(1, n) > 0.015) bad('terrain.cliffs', `${(100 * cliffs / n).toFixed(1)} % of sampled points outside lots drop > 0.45 m within 0.25 m, e.g. ${where.join(' ')}`);

  // ---- plazas, pois, landmarks, areas
  if (plan.plazas.length < 3) bad('plazas.count', `${plan.plazas.length} plazas/courts/miradors (want >= 3)`);
  for (const p of plan.plazas) if (!PLAZA_KINDS.includes(p.kind) || !Array.isArray(p.poly) || p.poly.length < 3 || !fin(p.y)) bad('plazas.fields', `${p.id}: kind/poly/y`);
  if (plan.pois.length < 40) bad('pois.count', `${plan.pois.length} pois (want >= 40)`);
  for (const p of plan.pois) if (typeof p.kind !== 'string' || !fin(p.x, p.y, p.z, p.ry)) { bad('pois.fields', `${p.id}: kind/x/y/z/ry`); break; }
  if (plan.landmarks.length < 8) bad('landmarks.count', `${plan.landmarks.length} landmarks (want >= 8)`);
  for (const m of plan.landmarks) if (!m.name || !m.en || !fin(m.x, m.z) || !m.kind) { bad('landmarks.fields', `${m.id}: name/en/x/z/kind`); break; }
  if (plan.areas.length < 4) bad('areas.count', `${plan.areas.length} areas (want >= 4)`);

  // ---- nav graph
  const nodes = plan.nav.nodes, edges = plan.nav.edges, byId = new Map(nodes.map((nd) => [nd.id, nd]));
  stats.navNodes = nodes.length; stats.navEdges = edges.length;
  if (byId.size !== nodes.length) bad('nav.ids', 'duplicate nav node ids');
  if (nodes.length < 120) bad('nav.density', `${nodes.length} nav nodes (want >= 120)`);
  const parent = new Map(nodes.map((nd) => [nd.id, nd.id]));
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  let badEdges = 0;
  for (const [a, b] of edges) {
    const A = byId.get(a), Bn = byId.get(b);
    if (!A || !Bn) { if (badEdges++ < 3) bad('nav.edge', `edge ${a}-${b} references a missing node`); continue; }
    const d = Math.hypot(A.x - Bn.x, A.z - Bn.z), g = Math.abs(A.y - Bn.y) / Math.max(d, 0.01);
    if (d > 10 && badEdges++ < 3) bad('nav.edge', `edge ${a}-${b} is ${d.toFixed(1)} m long (want <= 10)`);
    else if (g > 0.9 && badEdges++ < 3) bad('nav.edge', `edge ${a}-${b} climbs ${(g * 100).toFixed(0)} %`);
    parent.set(find(a), find(b));
  }
  let offGround = 0;
  for (const nd of nodes) if (!fin(nd.x, nd.y, nd.z) || Math.abs(nd.y - h(nd.x, nd.z)) > 0.45) { if (offGround++ < 3) bad('nav.ground', `node ${nd.id} at (${nd.x}, ${nd.z}) y=${nd.y} vs heightAt ${h(nd.x, nd.z)?.toFixed?.(2)}`); }
  const comp = new Map(); for (const nd of nodes) { const r = find(nd.id); comp.set(r, (comp.get(r) ?? 0) + 1); }
  stats.navComponents = comp.size;
  if (comp.size > 1) bad('nav.connected', `nav graph has ${comp.size} components (sizes ${[...comp.values()].sort((a, b) => b - a).slice(0, 6).join(', ')}); NPCs on a small one never leave it`);
  let uncovered = 0;
  for (const l of lots) {
    const cands = outsideCandidates(l); if (!cands.length) continue;
    const d = Math.min(...cands.flatMap(([x, z]) => nodes.map((nd) => Math.hypot(nd.x - x, nd.z - z))));
    if (!(d <= 2.5) && uncovered++ < 5) bad('nav.coverage', `${l.id}: nearest nav node to the door is ${d.toFixed(1)} m away (want <= 2.5)`);
  }

  // ---- spawn
  const sp = plan.spawn;
  if (Math.abs(sp.x) > B || Math.abs(sp.z) > B) bad('spawn.bounds', 'spawn outside the map');
  if (sp.z < 30) bad('spawn.place', `spawn z=${sp.z}: should be low on the hill (z >= 30)`);
  if (Math.cos(sp.yaw) < 0.3) bad('spawn.look', `spawn yaw ${sp.yaw.toFixed(2)} does not look uphill (-z)`);
  if (!Number.isFinite(h(sp.x, sp.z))) bad('spawn.ground', 'heightAt(spawn) is not finite');
  return { violations: v, stats };
}

// ---- CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const seed = arg('--seed') != null ? +arg('--seed') : undefined;
  const { createContext } = await import('../js/core/ctx.js');
  const { generatePlan } = await import('../js/world/plan.js');
  const ctx = createContext({ seed, headless: true });
  const t0 = performance.now();
  ctx.plan = generatePlan(ctx);
  const ms = Math.round(performance.now() - t0);
  const r = checkPlan(ctx.plan, { seed });
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ms, ...r }, null, 1));
  else {
    console.log(`plan generated in ${ms} ms:`, JSON.stringify(r.stats));
    for (const x of r.violations) console.log(`  FAIL ${x.code}: ${x.msg}`);
    console.log(r.violations.length ? `${r.violations.length} violation(s)` : 'plan oracle: all checks pass');
  }
  process.exit(r.violations.length ? 1 : 0);
}
