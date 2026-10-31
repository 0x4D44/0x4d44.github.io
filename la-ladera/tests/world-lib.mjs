// Shared helpers for the world (A5) tests and labs: build a plan under node, and validators that return message lists.
import { createContext } from '../js/core/ctx.js';
import { Physics, wallsRect } from '../js/core/physics.js';
import { generatePlan } from '../js/world/plan.js';
import { footprint, gapBetween, polyDistPoint, pointInPoly } from '../js/world/geom.js';
import { HALF, CELL, N } from '../js/world/field.js';
import { buildingVolumes } from '../js/world/volumes.js';

export const SEED = 20261029;

export function makePlan(seed = SEED) {
  const ctx = createContext({ seed, headless: true });
  const plan = generatePlan(ctx);
  ctx.plan = plan;
  return { ctx, plan };
}

/** Overlaps, gaps, bounds, street / plaza intrusions. Returns [] when clean. */
export function checkLots(plan) {
  const msgs = [], L = plan.lots, fps = L.map((l) => footprint(l));
  L.forEach((l, i) => { for (const p of fps[i]) if (Math.abs(p[0]) > 99.2 || Math.abs(p[1]) > 99.2) { msgs.push(`${l.id} out of the plot`); break; } });
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const g = gapBetween(fps[i], fps[j]);
    if (g >= 0.3) continue;
    const a = L[i], b = L[j], pa = a.party.left || a.party.right || a.party.back, pb = b.party.left || b.party.right || b.party.back;
    if (g < -0.04) msgs.push(`${a.id} (${a.kind}) overlaps ${b.id} (${b.kind}) by ${(-g).toFixed(2)} m`);
    else if (g > 0.08) msgs.push(`${a.id} / ${b.id} gap ${g.toFixed(2)} m < 0.3 (not touching)`);
    else if (!(pa && pb)) msgs.push(`${a.id} / ${b.id} touch but are not both flagged party`);
  }
  for (const st of plan.streets) {
    const hw = st.width / 2, d = st._d;
    L.forEach((l, i) => {
      let m = Infinity;
      for (let k = 0; k < d.pts.length; k++) m = Math.min(m, polyDistPoint(fps[i], d.pts[k][0], d.pts[k][1]));
      const need = hw + (l.front === st.id ? 0.5 : 0.3);
      if (m < need) msgs.push(`${l.id} (${l.kind}) intrudes into ${st.id} ${st.name}: distance ${m.toFixed(2)} < ${need.toFixed(2)}`);
    });
  }
  for (const p of plan.plazas) L.forEach((l, i) => { const g = gapBetween(fps[i], p.poly); if (g < 0.2) msgs.push(`${l.id} too close to plaza ${p.id} (${g.toFixed(2)})`); });
  return msgs;
}

/** Gradient limits along each street centre-line (sampled from heightAt every 1 m). */
export function streetGrades(plan) {
  const out = [];
  for (const st of plan.streets) {
    const d = st._d; let max = 0, at = null;
    for (let k = 1; k < d.pts.length; k++) {
      const a = d.pts[k - 1], b = d.pts[k], ds = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const g = Math.abs(plan.heightAt(b[0], b[1]) - plan.heightAt(a[0], a[1])) / ds;
      if (g > max) { max = g; at = [b[0], b[1]]; }
    }
    out.push({ id: st.id, kind: st.kind, max, at });
  }
  return out;
}

/** Connected components of plan.nav as arrays of node ids, biggest first. */
export function navComponents(plan) {
  const { nodes, edges } = plan.nav, adj = new Map(nodes.map((n) => [n.id, []]));
  for (const [a, b] of edges) { adj.get(a)?.push(b); adj.get(b)?.push(a); }
  const seen = new Set(), comps = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const q = [n.id], c = []; seen.add(n.id);
    while (q.length) { const id = q.pop(); c.push(id); for (const o of adj.get(id) ?? []) if (!seen.has(o)) { seen.add(o); q.push(o); } }
    comps.push(c);
  }
  return comps.sort((a, b) => b.length - a.length);
}

/** Solid blocks for every lot (what the building shells will add): walls from the plinth top up. */
export function lotWalls(plan) {
  return plan.lots.flatMap((l) => wallsRect(l.x, l.z, l.w, l.d, l.rotY, l.y - 0.3, l.y + 30, 0.06, { id: l.id }));
}

/** A physics world over the plan terrain with the lot blocks (plus anything the caller adds). */
export function makeWalker(plan, extra = {}) {
  const phys = new Physics();
  phys.setTerrain(plan.heightAt);
  phys.addWalls(lotWalls(plan));
  if (extra.walls) phys.addWalls(extra.walls);
  if (extra.floors) phys.addFloors(extra.floors);
  return phys;
}

// ---------------------------------------------------------------------------------------------------- validators (return message lists)
const LIMIT = { road: 0.12, street: 0.12, alley: 0.22, path: 0.22 };

/** Plinth rule: heightAt = lot.y - 0.30 inside the footprint (+0.3 m margin); door ground within 0.35 m of lot.y. */
export function plinthErrors(plan) {
  const bad = [], fps = plan.lots.map((l) => footprint(l, 0.35));
  for (const l of plan.lots) {
    const c = Math.cos(l.rotY), s = Math.sin(l.rotY), W = (lx, lz) => [l.x + lx * c + lz * s, l.z - lx * s + lz * c];
    const probes = [[0, 0], [l.w / 2 - 0.05, l.d / 2 - 0.05], [-l.w / 2 + 0.05, l.d / 2 - 0.05], [l.w / 2 - 0.05, -l.d / 2 + 0.05], [-l.w / 2 + 0.05, -l.d / 2 + 0.05],
      [0, l.d / 2 + 0.25], [l.w / 2 + 0.25, 0], [-l.w / 2 - 0.25, 0], [0, -l.d / 2 - 0.25]];
    for (const [lx, lz] of probes) {
      const [x, z] = W(lx, lz), h = plan.heightAt(x, z);
      if (fps.some((f, j) => plan.lots[j] !== l && pointInPoly(f, x, z))) continue;   // the probe lies in a neighbour's margin
      if (Math.abs(h - (l.y - 0.3)) > 1e-6) { bad.push(`${l.id}: heightAt(${lx.toFixed(2)},${lz.toFixed(2)} local) = ${h.toFixed(3)}, plinth wants ${(l.y - 0.3).toFixed(3)}`); break; }
    }
    const [ox, , oz] = l.entrance.outside, h = plan.heightAt(ox, oz);
    if (Math.abs(h - l.y) > 0.35) bad.push(`${l.id}: ground at entrance.outside ${h.toFixed(2)} is ${(h - l.y).toFixed(2)} from lot.y ${l.y}`);
  }
  return bad;
}

/** Gradient caps along street centre-lines (stairs: flight gradient + step geometry). */
export function gradeErrors(plan) {
  const bad = [];
  for (const g of streetGrades(plan)) {
    const st = plan.streets.find((s) => s.id === g.id);
    if (st.kind === 'stair') {
      if (g.max < 0.5 || g.max > 0.7) bad.push(`${st.id} stair flight gradient ${(g.max * 100).toFixed(0)} % (want 50-70)`);
      if (!(st.stepRise >= 0.14 && st.stepRise <= 0.2)) bad.push(`${st.id} step rise ${st.stepRise} (want ~0.17)`);
      if (!(st.tread >= 0.24 && st.tread <= 0.36)) bad.push(`${st.id} tread ${st.tread} (want ~0.3)`);
      if (Math.abs(st.rise) > 2.8 && !(st.landings?.length)) bad.push(`${st.id} rises ${st.rise} m without a landing`);
    } else if (g.max > (LIMIT[st.kind] ?? 0.12)) bad.push(`${st.id} ${st.kind} gradient ${(g.max * 100).toFixed(1)} % > ${(LIMIT[st.kind] ?? 0.12) * 100} % at ${g.at.map((v) => v.toFixed(0))}`);
  }
  return bad;
}

/** Nav graph sanity: one component, door node on every entrance, spacing, plaza interiors. */
export function navErrors(plan) {
  const bad = [], { nodes, edges } = plan.nav, byId = new Map(nodes.map((n) => [n.id, n]));
  const comps = navComponents(plan);
  if (comps.length !== 1) bad.push(`nav has ${comps.length} components (${comps.map((c) => c.length).join('/')})`);
  for (const l of plan.lots) {
    const d = nodes.find((n) => n.kind === 'door' && n.lot === l.id);
    if (!d) { bad.push(`${l.id}: no door node`); continue; }
    if (Math.hypot(d.x - l.entrance.outside[0], d.z - l.entrance.outside[2]) > 0.05) bad.push(`${l.id}: door node is not on entrance.outside`);
  }
  for (const [a, b] of edges) {
    const p = byId.get(a), q = byId.get(b), len = Math.hypot(p.x - q.x, p.z - q.z);
    const lim = p.kind === 'stair' && q.kind === 'stair' ? 2.4 : (p.kind === 'street' || p.kind === 'alley' || p.kind === 'path') && p.kind === q.kind ? 5.2 : 12;
    if (len > lim) bad.push(`edge ${a}-${b} (${p.kind}/${q.kind}) is ${len.toFixed(1)} m long`);
  }
  for (const pl of plan.plazas) {
    const n = nodes.filter((q) => q.area === pl.id).length;
    if (n < 4) bad.push(`${pl.id} has only ${n} interior nodes`);
  }
  return bad;
}

/** Spawn: walkable, low on the hill, outside every lot, looking up the hill. */
export function spawnErrors(plan) {
  const bad = [], sp = plan.spawn, fps = plan.lots.map((l) => footprint(l, 0.5));
  if (!(Math.abs(plan.heightAt(sp.x, sp.z) - sp.y) < 0.05)) bad.push(`spawn.y ${sp.y} is not the ground ${plan.heightAt(sp.x, sp.z).toFixed(2)}`);
  if (sp.y > 3) bad.push(`spawn is not low on the hill (y ${sp.y})`);
  if (!(sp.z > 80)) bad.push(`spawn z ${sp.z} is not on the bottom shelf`);
  if (Math.abs(Math.sin(sp.yaw)) > 0.5 || Math.cos(sp.yaw) < 0) bad.push(`spawn yaw ${sp.yaw} does not look up the hill (yaw 0 = north)`);
  fps.forEach((f, i) => { if (pointInPoly(f, sp.x, sp.z)) bad.push(`spawn is inside ${plan.lots[i].id}`); });
  return bad;
}

/** Sides (of 8) of a spot on which the ground falls 0.5 m or more within 0.65 m: a plaza rim, a cut or fill wall. A person placed there stands on an edge. */
export function ledgeSides(plan, p) {
  const y = plan.heightAt(p.x, p.z);
  let n = 0;
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; if (plan.heightAt(p.x + Math.cos(a) * 0.65, p.z + Math.sin(a) * 0.65) < y - 0.5) n++; }
  return n;
}

/** POIs / landmarks / areas shape and vocabulary. */
export function placeErrors(plan, ANCHOR_KINDS) {
  const bad = [], ids = new Set(plan.lots.map((l) => l.id)), seen = new Set();
  for (const p of plan.pois) {
    if (seen.has(p.id)) bad.push(`duplicate poi ${p.id}`); seen.add(p.id);
    if (!ANCHOR_KINDS.includes(p.kind)) bad.push(`poi ${p.id}: kind ${p.kind} is not an anchor kind`);
    if (![p.x, p.y, p.z, p.ry].every(Number.isFinite)) bad.push(`poi ${p.id}: non-finite`);
    else if (Math.abs(plan.heightAt(p.x, p.z) - p.y) > 0.05) bad.push(`poi ${p.id}: y ${p.y} is not the ground ${plan.heightAt(p.x, p.z).toFixed(2)}`);
    else if (ledgeSides(plan, p)) bad.push(`poi ${p.id} (${p.kind}, ${p.x}, ${p.z}): the ground falls 0.5 m or more within 0.65 m on ${ledgeSides(plan, p)} of 8 sides`);
    if (p.building && !ids.has(p.building)) bad.push(`poi ${p.id}: unknown building ${p.building}`);
    if (!Array.isArray(p.tags)) bad.push(`poi ${p.id}: tags missing`);
  }
  for (const k of ['sweep', 'vend', 'lean', 'chat', 'bench', 'play']) if (!plan.pois.some((p) => p.kind === k)) bad.push(`no ${k} poi`);
  if (plan.pois.filter((p) => p.kind === 'play').length < 4) bad.push('fewer than 4 play pois on the court');
  if (plan.landmarks.length < 10) bad.push(`only ${plan.landmarks.length} landmarks`);
  for (const m of plan.landmarks) if (!m.name || !m.en || !m.kind || !Number.isFinite(m.x) || !Number.isFinite(m.z) || m.name === m.en) bad.push(`landmark ${m.id}: needs Spanish name, en, kind, x, z`);
  for (const a of plan.areas) if (!a.name || !a.en || !(a.poly?.length >= 3)) bad.push(`area ${a.id}: needs name, en and a polygon`);
  for (const s of plan.streets) if (!s.name || !s.en || s.name === s.en) bad.push(`street ${s.id}: needs Spanish name + en`);
  for (const l of plan.lots) if (!l.name || /\b(the|and|shop|store)\b/i.test(l.name)) bad.push(`${l.id}: name "${l.name}" is not a Spanish name`);
  return bad;
}

/**
 * Meshes with a non-finite position, normal, uv or colour. One NaN normal makes the shader write NaN, the bloom blur spreads it, and a block of the frame
 * (three quarters of it, seen from above) turns black: ROUND1 R1-011 came from the zero-height cone under a vendor cart's umbrella.
 */
export function badAttributes(root) {
  const bad = [];
  root.traverse((o) => {
    const g = o.geometry; if (!g?.attributes) return;
    for (const [k, a] of Object.entries(g.attributes)) {
      const n = a.count * a.itemSize;
      for (let i = 0; i < n; i++) if (!Number.isFinite(a.array[i])) { bad.push(`${o.name || o.type}: ${k} of vertex ${Math.floor(i / a.itemSize)} is ${a.array[i]}`); break; }
    }
  });
  return bad;
}

// ---------------------------------------------------------------------------------------------------- terrain wedges beside retaining walls
/** The terrain mesh's height at (x, z): the lattice `grid` (field.js N x N, 0.5 m), each cell split along its (i, j)-(i+1, j+1) diagonal like terrain.js builds it. */
export function meshHeight(grid, x, z) {
  const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL, gi = Math.min(N - 2, Math.max(0, Math.floor(fx))), gj = Math.min(N - 2, Math.max(0, Math.floor(fz)));
  const u = fx - gi, v = fz - gj, g = (i, j) => grid[j * N + i], a = g(gi, gj), b = g(gi, gj + 1), c = g(gi + 1, gj + 1), d = g(gi + 1, gj);
  return v >= u ? a + (b - a) * (v - u) + (c - b) * u : a + (d - a) * (u - v) + (c - d) * v;
}

/** The lattice the terrain would have with no wall in the way: the height field at every node, under the pavement carve (terrain.js CARVE). */
export function fieldGrid(plan, carve) {
  const g = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; g[k] = plan.heightAt(-HALF + i * CELL, -HALF + j * CELL) - (carve[k] === 2 ? 0.13 : carve[k] === 1 ? 0.07 : 0); }
  return g;
}

/**
 * How far the terrain MESH stands above the height field in front of each retaining-wall face (0.05 to 0.45 m in front of it, at every sample of every run): a
 * wedge of the ramp that the wall box did not hide (the "mulch cones" the reviewers saw at the foot of every wall). Reported over all samples and over the
 * interior ones (two samples in from each end of a run), as { n, over, max } each; `over` counts wedges above 10 cm.
 */
export function wedgeStats(plan, runs, grid, carve) {
  const all = { n: 0, over: 0, max: 0 }, inner = { n: 0, over: 0, max: 0 };
  for (const r of runs) r.S.forEach((s, si) => {
    const f = r.sign > 0 ? 0 : s.W, dir = r.sign > 0 ? -1 : 1, interior = si >= 2 && si < r.S.length - 2;
    for (const t of [0.05, 0.15, 0.3, 0.45]) {
      const x = s.x + s.nx * (f + dir * t), z = s.z + s.nz * (f + dir * t), k = Math.round((z + HALF) / CELL) * N + Math.round((x + HALF) / CELL);
      const e = meshHeight(grid, x, z) - plan.heightAt(x, z) + (carve[k] ? 0.07 : 0);
      for (const a of interior ? [all, inner] : [all]) { a.n++; if (e > 0.1) a.over++; if (e > a.max) a.max = e; }
    }
  });
  return { ...all, inner };
}

// ---------------------------------------------------------------------------------------------------- the infill (plan.js FILL)
export const HAND_LOTS = 49, HAND_DIGEST = 'aa86b3ca', INFILL_MIN_LOTS = 90;

/** FNV-1a over what makes a lot "the same lot": id, kind, name, shop, place, size, floors, front street, floor level. */
export function lotDigest(lots) {
  const s = lots.map((l) => [l.id, l.kind, l.name, l.shop ?? '', +l.x.toFixed(2), +l.z.toFixed(2), +l.rotY.toFixed(3), l.w, l.d, l.floors, l.front, +l.y.toFixed(2)].join('|')).join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/**
 * The density contract. L00-L48 are the hand-authored lots (layout.js ROWS): they come first, in order, and never move, so every id the other
 * agents' tests and discoveries name stays valid. The infill lots follow with the next ids, each in a ':fill' row on a real street. Between any
 * two lots there is either a shared party wall or a walkable passage (>= 1.15 m): never a slit a player could wedge into.
 */
export function infillErrors(plan, o = {}) {
  const bad = [], L = plan.lots, min = o.min ?? INFILL_MIN_LOTS;
  if (L.length < min) bad.push(`only ${L.length} lots (want >= ${min})`);
  if (L.length >= HAND_LOTS && o.digest !== false) {   // the digest is for the default seed: names (and so the digest) depend on the seed
    const d = lotDigest(L.slice(0, HAND_LOTS));
    if (d !== HAND_DIGEST) bad.push(`the ${HAND_LOTS} hand-authored lots changed (digest ${d}, want ${HAND_DIGEST})`);
  }
  L.forEach((l, i) => {
    if (l.id !== 'L' + String(i).padStart(2, '0')) bad.push(`lot #${i} has id ${l.id}`);
    const fill = typeof l.row === 'string' && l.row.endsWith(':fill');
    if (i < HAND_LOTS && fill) bad.push(`${l.id} is hand-authored but sits in an infill row`);
    if (i >= HAND_LOTS && !fill) bad.push(`${l.id} follows the hand-authored lots but is not in an infill row`);
    if (i >= HAND_LOTS && !plan.streets.some((s) => s.id === l.front)) bad.push(`${l.id} fronts ${l.front}, which is not a street`);
  });
  const fps = L.map((l) => footprint(l)), party = (l) => !!(l.party.left || l.party.right || l.party.back);
  for (let i = 0; i < L.length; i++) for (let j = Math.max(i + 1, HAND_LOTS); j < L.length; j++) {   // every pair with at least one infill lot (j >= 49 is the later one)
    const g = gapBetween(fps[i], fps[j]);
    if (g > 0.08 && g < 1.15) bad.push(`${L[i].id} / ${L[j].id}: ${g.toFixed(2)} m slit (a party wall or >= 1.15 m, nothing between)`);
    else if (g <= 0.08 && g >= -0.05 && !(party(L[i]) && party(L[j]))) bad.push(`${L[i].id} / ${L[j].id} touch but are not both flagged party`);
  }
  return bad;
}

/** A cable (ctx.world.cables) by what it joins: the pole pair, the pole and the facade it drops to, the lane and the lots it crosses. */
export function cableLabel(c) {
  if (c.kind === 'span') return `span pole${c.poles[0]}-pole${c.poles[1]} (${c.street})`;
  if (c.kind === 'drop') return `drop pole${c.poles[0]} -> ${c.lot}`;
  if (c.kind === 'yard') return `yard line behind ${c.lot}`;
  return `${c.kind} ${c.street} ${c.lots.join('|')}`;
}

/**
 * Every cable the world strings (ctx.world.cables: poles.js strand) against the buildings, two ways. `inside` = the cable goes through the volume of a building (volumes.js: the shell's outline up to its roof,
 * with a few cm of clearance); `walls` = the independent pass: the cable crosses an exterior wall of the physics (the colliders, at the height it crosses it). One row per cable (a pole pair has six wires) and building:
 * { label, kind, id (the building), depth (m inside the outline), at }. Needs ctx built with the buildings, their colliders and the props (buildData({ world: true })).
 */
export function cableOffenders(ctx) {
  const vol = buildingVolumes(ctx), cables = ctx.world?.cables ?? [], inside = new Map(), crossed = new Map();
  const ext = new Set();
  for (const bp of ctx.buildings.values()) for (const w of bp.shell?.walls ?? []) if (w.ext) ext.add(w.id);
  const walls = ctx.physics.walls.filter((w) => ext.has(w.id));
  for (const c of cables) {
    const label = cableLabel(c);
    for (const h of vol.through(c.a, c.c, c.sag)) {
      const key = label + ' | ' + h.id, row = inside.get(key);
      if (!row || h.depth > row.depth) inside.set(key, { label, kind: c.kind, id: h.id, depth: h.depth, at: h.at });
    }
    // the polyline as drawn, every 0.1 m, against the exterior wall pieces in its bounding box
    const len = Math.hypot(c.c[0] - c.a[0], c.c[1] - c.a[1], c.c[2] - c.a[2]), n = Math.max(2, Math.ceil(len / 0.1));
    const P = Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [c.a[0] + (c.c[0] - c.a[0]) * t, c.a[1] + (c.c[1] - c.a[1]) * t - 4 * c.sag * t * (1 - t), c.a[2] + (c.c[2] - c.a[2]) * t]; });
    const x0 = Math.min(c.a[0], c.c[0]) - 0.5, x1 = Math.max(c.a[0], c.c[0]) + 0.5, z0 = Math.min(c.a[2], c.c[2]) - 0.5, z1 = Math.max(c.a[2], c.c[2]) + 0.5;
    for (const w of walls) {
      if (Math.max(w.x1, w.x2) < x0 || Math.min(w.x1, w.x2) > x1 || Math.max(w.z1, w.z2) < z0 || Math.min(w.z1, w.z2) > z1) continue;
      for (let i = 0; i < n; i++) {
        const p = P[i], q = P[i + 1], rx = q[0] - p[0], rz = q[2] - p[2], sx = w.x2 - w.x1, sz = w.z2 - w.z1, den = rx * sz - rz * sx;
        if (Math.abs(den) < 1e-9) continue;
        const s = ((w.x1 - p[0]) * sz - (w.z1 - p[2]) * sx) / den, u = ((w.x1 - p[0]) * rz - (w.z1 - p[2]) * rx) / den;
        if (s < 0 || s > 1 || u < 0 || u > 1) continue;
        const y = p[1] + (q[1] - p[1]) * s;
        if (y < w.y0 || y > w.y1) continue;
        const id = w.id.split('.')[0], key = label + ' | ' + id;
        if (!crossed.has(key)) crossed.set(key, { label, kind: c.kind, id, wall: w.id, at: [+(p[0] + rx * s).toFixed(2), +y.toFixed(2), +(p[2] + rz * s).toFixed(2)] });
      }
    }
  }
  const sort = (m) => [...m.values()].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : a.id < b.id ? -1 : 1));
  return { cables: cables.length, inside: sort(inside), walls: sort(crossed) };
}

/** Walk a character from node a to node b with the real kernel (0.07 m per frame, like 4 m/s at 60 fps). */
export function walk(phys, a, b, o = {}) {
  const s = { x: a.x, y: a.y, z: a.z, vy: 0, onGround: true };
  const total = Math.hypot(b.x - a.x, b.z - a.z), maxSteps = Math.ceil(total / 0.07) * 3 + 30, tol = o.tol ?? 0.25;
  let stuck = 0;
  for (let steps = 0; steps < maxSteps; steps++) {
    const dx = b.x - s.x, dz = b.z - s.z, d = Math.hypot(dx, dz);
    if (d < tol) return Math.abs(s.y - b.y) < 0.6 ? { ok: true, steps } : { ok: false, reason: `arrived at y ${s.y.toFixed(2)} not ${b.y}`, at: [s.x, s.z] };
    const k = Math.min(0.07, d) / d, px = s.x, pz = s.z;
    phys.move(s, dx * k, dz * k, 1 / 60);
    if (Math.hypot(s.x - px, s.z - pz) < 0.01) { if (++stuck > 8) return { ok: false, reason: 'stuck', at: [+s.x.toFixed(2), +s.z.toFixed(2)], y: +s.y.toFixed(2) }; } else stuck = 0;
  }
  return { ok: false, reason: 'timeout', at: [+s.x.toFixed(2), +s.z.toFixed(2)] };
}
