// A2: a window in a stair wall hangs from the stair running past it, not from the storey (openings.js `stairClear`). The half landing of a dogleg is mid-storey (1.4 - 1.6 m up) and the treads
// of a flight climb the wall, so the usual 1.0 m sill started below the landing's floor or the tread in front of it. This samples EVERY window of every stair room of every test lot and measures
// its sill against the stair surfaces (read back from the core's own flights, landings and half landings, tread by tread: not through the helper that places the windows).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-stairwin.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll } from './arch-lib.mjs';
import { T_EXT } from '../js/arch/geom.js';

const lots = testLots();
const { bps } = planAll(lots);
const inR = (r, x, z) => x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6 && z >= r.z0 - 1e-6 && z <= r.z1 + 1e-6;

/** Every height a person stands at over local point (x, z): landings, half landings and the TOP OF THE TREAD (stepped, not a ramp) of the flight there. */
function surfaces(bp, x, z) {
  const c = bp.shell.core, fh = bp.shell.fh, out = [];
  if (inR(c.landing, x, z)) for (let k = 0; k <= c.nUp; k++) out.push(k * fh);
  for (const f of c.flights) {
    if (!inR(f.rect, x, z)) continue;
    const dx = f.to[0] - f.from[0], dz = f.to[1] - f.from[1], d = Math.max(0, ((x - f.from[0]) * dx + (z - f.from[1]) * dz) / Math.hypot(dx, dz));   // distance along the flight from its first tread (lane A: the landing end; lane B: the half landing end)
    out.push(f.y0 + (Math.floor(d / c.run + 1e-9) + 1) * c.rise);
  }
  for (const h of c.halfLandings) if (inR(h.rect, x, z)) out.push(h.y);
  return out;
}

/** The window's span, sampled on the line 0.3 m inside its wall: building-local points. */
function span(bp, w) {
  const { W, D } = bp.shell, i = T_EXT + 0.3, n = Math.max(2, Math.ceil(w.w / 0.1));
  return Array.from({ length: n + 1 }, (_, k) => {
    const u = (w.side === 'front' || w.side === 'back' ? w.x : w.z) - w.w / 2 + (w.w * k) / n;
    return w.side === 'front' ? [u, D / 2 - i] : w.side === 'back' ? [u, -D / 2 + i] : w.side === 'left' ? [-W / 2 + i, u] : [W / 2 - i, u];
  });
}

const stairWindows = [];
for (const bp of bps) {
  if (!bp.shell.core) continue;
  const coreRooms = new Set(bp.rooms.filter((r) => r.core).map((r) => r.id));
  for (const w of bp.windows) if (coreRooms.has(w.room)) stairWindows.push({ bp, w });
}

test('the lots have stair windows to measure: a landing at every floor and a half landing, in houses and in the school', () => {
  assert.ok(stairWindows.length >= 30, `${stairWindows.length} windows in stair rooms`);
  assert.ok(stairWindows.some(({ bp, w }) => bp.lot.kind === 'school' && w.floor === 0), 'a ground-floor stair window in a school');
  assert.ok(stairWindows.some(({ w }) => w.floor >= 1), 'a window on an upper landing');
});

test('every window of a stair room clears the stair: its sill stands 0.6 m or more above every landing, half landing and tread that runs past it', () => {
  const bad = [];
  for (const { bp, w } of stairWindows) {
    const base = w.floor * bp.shell.fh, head = w.y + w.h, pts = span(bp, w);
    for (const [x, z] of pts) for (const y of surfaces(bp, x, z)) {
      const rel = y - base;
      if (rel < head - 0.2 && w.y < rel + 0.6 - 1e-6) bad.push(`${w.id} (${bp.lot.kind}, floor ${w.floor}, ${w.side}): sill ${w.y.toFixed(2)}, head ${head.toFixed(2)}, stair surface ${rel.toFixed(2)} m above the floor at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
  assert.deepEqual([...new Set(bad)].slice(0, 12), [], `${bad.length} samples of stair windows sit within 0.6 m of a surface`);
});

test('a stair window stays under the ceiling and is worth cutting: head 0.15 m or more under it (as every window, arch-plan), 0.45 m or more of glass', () => {
  for (const { bp, w } of stairWindows) {
    assert.ok(w.y + w.h <= bp.shell.h - 0.15 + 0.011, `${w.id}: head at ${(w.y + w.h).toFixed(2)} under a ${bp.shell.h} m ceiling (${bp.shell.fh} m storey)`);
    assert.ok(w.h >= 0.45 - 0.011, `${w.id}: only ${w.h} m of glass`);
  }
});

test('windows follow the landings: each one lifted above the usual sill hangs 0.6 - 1.05 m over the stair surface that lifted it, and the school has its high stair window over the half landing', () => {
  const lifted = stairWindows.filter(({ w }) => w.y > 1.3);
  assert.ok(lifted.length >= 3, `only ${lifted.length} stair windows were lifted above the usual 1.0 m sill: nothing follows the half landing or the flights`);
  for (const { bp, w } of lifted) {
    const base = w.floor * bp.shell.fh, under = span(bp, w).flatMap(([x, z]) => surfaces(bp, x, z)).map((y) => y - base);
    assert.ok(under.some((y) => w.y - y >= 0.6 - 0.011 && w.y - y <= 1.05), `${w.id}: sill ${w.y} is lifted above nothing (stair surfaces there: ${[...new Set(under.map((y) => y.toFixed(2)))].join(', ')})`);
  }
  const school = bps.find((bp) => bp.id === 'T40'), half = school.shell.core.halfLandings[0].y;
  const slit = school.windows.find((w) => w.floor === 0 && school.rooms.find((r) => r.id === w.room)?.type === 'stairwell' && w.y > 1.3);
  assert.ok(slit && slit.y >= half + 0.6 - 0.011 && slit.h >= 0.45 - 0.011, `the school has its high stair window above the half landing (${half} m up): ${slit && slit.y}`);
});
