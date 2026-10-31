// INTERIORS wall decor in stair cores, sampled against A2's stair geometry (js/arch/stairs.js, read back from the `bp.stairs` records, never from the furnisher):
// a poster, notice, picture or clock on the wall of a stairwell or landing hangs where a person standing on the stair sees it, a normal height ABOVE THE STEP in front of it:
//   - not on the open side of a landing (the stair void has no wall: the decal floated in the air),
//   - not on the wall of the nook under a flight or of the hollow under the half landing (nobody can see it),
//   - not at the room's storey height along a flight (it sank into the steps as they rose, or floated above the landing).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-stairs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch } from './interiors-lib.mjs';

const { bps } = await furnishedBatch({ real: true });

// ---------------------------------------------------------------- the dogleg core, as the plan records it
const inRect = (r, x, z, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;
const holeRect = (st) => { const xs = st.hole.map((p) => p[0]), zs = st.hole.map((p) => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }; };
/** The edge along which the landing meets the slab hole (the one stretch of the landing with no wall): { x0, x1, z0, z1 } with one side of zero length, or null. */
function openEdge(st) {
  const L = st.landing, H = holeRect(st), t = 0.05, a = (p, q) => Math.max(p, q), b = (p, q) => Math.min(p, q);
  if (Math.abs(L.z1 - H.z0) < t) return { x0: a(L.x0, H.x0), x1: b(L.x1, H.x1), z0: L.z1, z1: L.z1 };
  if (Math.abs(L.z0 - H.z1) < t) return { x0: a(L.x0, H.x0), x1: b(L.x1, H.x1), z0: L.z0, z1: L.z0 };
  if (Math.abs(L.x1 - H.x0) < t) return { x0: L.x1, x1: L.x1, z0: a(L.z0, H.z0), z1: b(L.z1, H.z1) };
  if (Math.abs(L.x0 - H.x1) < t) return { x0: L.x0, x1: L.x0, z0: a(L.z0, H.z0), z1: b(L.z1, H.z1) };
  return null;
}
const distTo = (e, x, z) => Math.hypot(Math.max(e.x0 - x, 0, x - e.x1), Math.max(e.z0 - z, 0, z - e.z1));
/** Plan frame of one stair record: S = along the flights (away from the landing), lane centre lines, tread tops. */
function core(st) {
  const [a0, a1] = [st.flights[0].from, st.flights[0].to], [b0, b1] = [st.flights[1].from, st.flights[1].to];
  const lfl = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), S = [(a1[0] - a0[0]) / lfl, (a1[1] - a0[1]) / lfl], U = [-S[1], S[0]];
  const nh = st.flights[0].steps, hw = st.width / 2;
  const sOf = (x, z) => (x - a0[0]) * S[0] + (z - a0[1]) * S[1];
  const uOf = (x, z) => (x - a0[0]) * U[0] + (z - a0[1]) * U[1];
  const uB = (b1[0] - a0[0]) * U[0] + (b1[1] - a0[1]) * U[1];
  const yb = st.flights[0].y0, yh = st.flights[0].y1, yt = st.flights[1].y1;
  const tread = (j) => Math.max(0, Math.min(j, nh - 2));
  return {
    yb, yh, yt,
    /** the heights a person can stand at at plan point (x,z) on this stair: its landing at both floors, the half landing, the tread of lane A or B under the point */
    surfaces(x, z) {
      const out = [];
      if (inRect(st.landing, x, z)) out.push(yb, yt);
      if (inRect(st.halfLanding, x, z)) out.push(yh);
      const s = sOf(x, z), u = uOf(x, z);
      if (s >= 0 && s < lfl) {
        if (Math.abs(u) <= hw) out.push(yb + (tread(Math.floor(s / st.run)) + 1) * st.rise);
        if (Math.abs(u - uB) <= hw) out.push(yh + (tread(Math.floor((lfl - s) / st.run)) + 1) * st.rise);
      }
      return out;
    },
  };
}
const surfacesAt = (bp, x, z) => (bp.stairs ?? []).flatMap((st) => core(st).surfaces(x, z));

// ---------------------------------------------------------------- what hangs in the rooms that hold a stair
/** The rooms of a building that a stair core lies in or opens onto (the stairwell of the ground floor, the landing of every floor above). */
const stairRooms = (bp) => bp.rooms.filter((rm) => (bp.stairs ?? []).some((st) => rm.core && inRect(rm.rect, (st.landing.x0 + st.landing.x1) / 2, (st.landing.z0 + st.landing.z1) / 2, 0.05)));
const wallRecs = (bp, rm) => bp.furniture.filter((r) => r.room === rm.id && r.kind === 'wall');
const cases = [];
for (const bp of bps) for (const rm of stairRooms(bp)) for (const r of wallRecs(bp, rm)) cases.push({ bp, rm, r });

/** Why a hung thing is wrong, or null: sampled at the point of the wall it covers, against the stair records only. */
function problem({ bp, rm, r }) {
  const sx = Math.sin(r.ry), cz = Math.cos(r.ry), floor = rm.floor ?? 0;
  for (const st of bp.stairs ?? []) {                                      // the open side of a landing: the slab hole has no wall along it (the side walls of the shaft do)
    const e = floor >= 1 && (floor === st.floors[0] || floor === st.floors[1]) ? openEdge(st) : null;
    if (e && distTo(e, r.x, r.z) < 0.1) return 'hangs over the open stair void';
  }
  const fx = r.x + 0.5 * sx, fz = r.z + 0.5 * cz;                          // half a metre out from the wall: where a person looks at it from
  const yc = r.y + r.h / 2, under = surfacesAt(bp, fx, fz).filter((y) => y <= yc - 0.5);
  if (!under.length) return 'has no step or floor in front of it to look at it from (it is in the nook under a flight or the hollow under the half landing)';
  const ys = Math.max(...under), bottom = r.y - ys, top = r.y + r.h - ys;
  if (r.y + r.h > (rm.y ?? 0) + (rm.h ?? 2.6) + 1e-6) return 'reaches above the ceiling of its own room';
  if (bottom < 0.85) return `sinks into the steps: its lower edge is ${bottom.toFixed(2)} m above the step in front of it`;
  if (top > 2.45 || yc - ys > 1.95) return `floats: its middle is ${(yc - ys).toFixed(2)} m above the step in front of it`;
  return null;
}

test('the real barrio has stair cores with things on their walls to sample', () => {
  const withStairs = bps.filter((bp) => bp.stairs?.length).length, rooms = bps.reduce((n, bp) => n + stairRooms(bp).length, 0);
  console.log(`# stairs: ${withStairs} buildings with a stair, ${rooms} stair rooms, ${cases.length} things hung on their walls`);
  assert.ok(withStairs >= 50 && rooms >= 150 && cases.length >= 150, `${withStairs} buildings, ${rooms} rooms, ${cases.length} hangings`);
});

test('stair lamps: the bulb of a stairwell or landing hangs over the landing, a lane or the half landing, never inside the divider wall between the lanes', () => {
  const bad = []; let lamps = 0;
  for (const bp of bps) for (const rm of stairRooms(bp)) for (const r of bp.furniture) {
    if (r.room !== rm.id || r.kind !== 'ceil') continue;
    lamps++;
    if (!surfacesAt(bp, r.x, r.z).length) bad.push(`${r.id} ${r.name} of ${rm.id} at ${r.x.toFixed(2)}, ${r.z.toFixed(2)}`);
  }
  console.log(`# stairs: ${lamps} lamps in stair rooms, ${bad.length} not over a place to stand`);
  assert.ok(lamps >= 150, `${lamps} lamps`);
  assert.equal(bad.length, 0, `${bad.length} lamps of stair rooms hang over no step or floor:\n  ${bad.slice(0, 6).join('\n  ')}`);
});

test('stair walls: every poster, notice, picture and clock hangs over a step or floor a person looks at it from, at a normal height above it', () => {
  const bad = new Map(), seen = new Map();
  for (const c of cases) {
    const why = problem(c); seen.set(c.r.name, (seen.get(c.r.name) ?? 0) + 1);
    if (why) { const k = why.replace(/[\d.]+ m/g, 'N m'); (bad.get(k) ?? bad.set(k, []).get(k)).push(`${c.r.id} ${c.r.name} on the ${c.r.wallSide} wall of ${c.rm.id} (${why})`); }
  }
  const total = [...bad.values()].reduce((n, l) => n + l.length, 0);
  console.log(`# stairs: ${total} of ${cases.length} hangings are wrong; ${[...bad].map(([k, l]) => `${l.length} ${k.slice(0, 30)}`).join('; ')}`);
  assert.equal(total, 0, `${total} of ${cases.length} things on stair walls are wrong:\n  ${[...bad.values()].flatMap((l) => l.slice(0, 4)).join('\n  ')}`);
});
