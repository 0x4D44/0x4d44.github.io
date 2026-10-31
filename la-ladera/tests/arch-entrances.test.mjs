// A2: nobody is shut in at a door. Every ground-floor entrance is WALKED out of and into with the real physics kernel (the player's body and a walker's, doors open, three
// lines across the door), whatever the street does in front of it: flat anywhere from 0.52 m below the sill to 0.4 m above it (a lot set low, a street that climbs along the
// facade), a street that rolls (a sine field: it climbs along the facade and across the door), a curb a few decimetres out, and then every entrance of the real barrio in the
// page's own world (street guards, props, furniture). The failure this pins: the main door of L78, the street 0.33 m ABOVE its sill. The plan's plinth sinks the ground 0.3 m
// under the footprint and 0.3 m beyond it (a pocket), planSteps built nothing where the ground was not below the sill, and a walker stepped down into the pocket and could not
// climb out (a lip steeper than 0.9 and over the 0.5 m step-up): 55 of 64 `unstick` events of A4's six-hour soak, and the player stopped dead.
// Not covered, and not a stoop's job: a street more than 0.4 m over the sill (it needs a raised landing), and a curb over 0.3 m high past the last tread of a flight DOWN to a street.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-entrances.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll } from './arch-lib.mjs';
import { buildData } from './headless.mjs';

const BODIES = { player: { radius: 0.3, height: 1.78, stepUp: 0.5, maxSlope: 0.9, gravity: 9.8 }, walker: { radius: 0.25, height: 1.7, stepUp: 0.5, maxSlope: 0.9, gravity: 9.8 } };
const LATERAL = [-0.15, 0, 0.15];
const f2 = (v) => +(+v).toFixed(2);

/** Walk the way points at 1.3 m/s in 0.05 s frames; ok = every point reached (within 0.3 m) before 14 s or 2.5 s of standing still. */
function walk(ph, pts, y0, body) {
  const s = { x: pts[0][0], y: y0, z: pts[0][2], vy: 0, onGround: true };
  ph.move(s, 0, 0, 0.016, body);
  let pi = 1, t = 0, still = 0;
  while (t < 14 && pi < pts.length) {
    const p = pts[pi], dx = p[0] - s.x, dz = p[2] - s.z, d = Math.hypot(dx, dz);
    if (d < 0.3) { pi++; continue; }
    const x0 = s.x, z0 = s.z;
    ph.move(s, (dx / d) * 1.3 * 0.05, (dz / d) * 1.3 * 0.05, 0.05, body); t += 0.05;
    still = Math.hypot(s.x - x0, s.z - z0) < 0.01 ? still + 0.05 : 0;
    if (still > 2.5) break;
  }
  return { ok: pi >= pts.length, at: [f2(s.x), f2(s.y), f2(s.z)], t: f2(t) };
}

/** Out of the entrance (inside point -> outside point -> 1.4 m beyond) and back in (beyond -> outside -> inside), both bodies, three lines across. Returns the failures. */
function walkEntrance(ctx, e, tag, only) {
  const ph = ctx.physics, bad = [], [ix, iy, iz] = e.inside, [ox, oy, oz] = e.outside;
  const dx = ox - ix, dz = oz - iz, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, lx = -uz, lz = ux;      // along the heading, across it
  ph.setDoor(e.doorId, true);
  for (const lat of LATERAL) for (const [name, body] of Object.entries(BODIES)) {
    if (only && only !== name) continue;
    const sh = (p) => [p[0] + lx * lat, p[1], p[2] + lz * lat], inn = sh(e.inside), out = sh(e.outside), bx = out[0] + ux * 1.4, bz = out[2] + uz * 1.4;
    const a = walk(ph, [inn, out, [bx, oy, bz]], iy, body);
    if (!a.ok) bad.push(`${tag} ${e.id} OUT ${name} line ${lat}: stopped at ${a.at} after ${a.t} s`);
    const by = ph.groundAt(bx, bz, oy + 0.6), b = walk(ph, [[bx, by, bz], out, inn], by, body);
    if (!b.ok) bad.push(`${tag} ${e.id} IN ${name} line ${lat}: stopped at ${b.at} after ${b.t} s`);
  }
  ph.setDoor(e.doorId, false);
  return bad;
}

const steppable = (bp, e) => { const d = bp.doors.find((q) => q.id === e.doorId); return d && !d.roof && d.floor === 0 && d.kind !== 'shutter' && d.kind !== 'arch'; };

/** The lowest ground under a step's rectangle (corners, edge middles, centre), relative to the sill: the box must reach below it, or the tread floats. */
function lowestUnder(bp, ph, s) {
  const fr = bp.frame, { x0, x1, z0, z1 } = s.rect; let lo = Infinity;
  for (const x of [x0, (x0 + x1) / 2, x1]) for (const z of [z0, (z0 + z1) / 2, z1]) { const p = fr.toWorld(x, 0, z); lo = Math.min(lo, ph(p[0], p[2]) - fr.y); }
  return lo;
}

// ground flat at -drop: 0.52 below the sill (a lot above the street) to 0.4 above it, with a vertical lip (the harshest street: the real one climbs over 0.5 m or more);
// 0.3 m of plinth pocket round every footprint, as the plan's heightAt gives. A street more than 0.4 m over the sill, with an abrupt lip, needs a raised landing: not a stoop.
const DROPS = [0.52, 0.3, 0.1, 0, -0.1, -0.25, -0.33, -0.4];
const lots = testLots();
const real = await buildData({ world: true });                                      // the page's own stage order: street guards, perimeter, props, furniture

test('a walker leaves and enters every ground-floor door with the street anywhere from 0.52 m below the sill to 0.4 m above it', { timeout: 300000 }, () => {
  const problems = []; let walked = 0;
  for (const drop of DROPS) {
    const { ctx, bps } = planAll(lots, undefined, true, drop, 0.3);
    for (const bp of bps) for (const e of bp.entrances) {
      if (!steppable(bp, e)) continue;
      walked++;
      problems.push(...walkEntrance(ctx, e, `street ${f2(-drop)} above the sill:`));
    }
  }
  assert.ok(walked >= 8 * 40, `only ${walked} door walks`);
  assert.deepEqual(problems.slice(0, 10), [], `${problems.length} failures`);
});

test('a street that rolls (it climbs along the facade and across the door, 17 to 52 % at its steepest) still lets a walker out and in at every ground-floor door, none of it over 0.4 m above the sill', { timeout: 300000 }, () => {
  const problems = []; let walked = 0;
  for (const [drop, amp] of [[0.1, 0.2], [0.1, 0.3], [0, 0.2], [0, 0.3], [-0.1, 0.2], [-0.1, 0.3]]) for (const wl of [3, 6]) for (const ph of [0, 1.7, 3.1]) {
    const k = (2 * Math.PI) / wl, field = (x, z) => (amp * (Math.sin(k * x + ph) + Math.sin(k * 1.3 * z + 2 * ph))) / 2;      // within +-amp of the level `drop` below the sill
    const { ctx, bps } = planAll(lots, undefined, true, drop, 0.3, field);
    for (const bp of bps) for (const e of bp.entrances) {
      if (!steppable(bp, e)) continue;
      walked++;
      problems.push(...walkEntrance(ctx, e, `street ${f2(-drop)} above the sill, rolling by ${amp} every ${wl} m (phase ${ph}):`));
    }
  }
  assert.ok(walked >= 36 * 40, `only ${walked} door walks`);
  assert.deepEqual(problems.slice(0, 10), [], `${problems.length} failures`);
});

test('a curb 0.3 to 0.5 m beyond the pocket (a street at or above the sill that steps up another 0.3 m) is bridged by a second and a third tread: nobody is shut in', { timeout: 300000 }, () => {
  const problems = []; let walked = 0, most = 0;
  for (const [lipAt, rise, drop] of [[0.5, 0.35, 0], [0.3, 0.32, 0], [0.5, 0.35, -0.05], [0.1, 0.3, 0.1]]) {      // the last: a street 0.1 m below the sill, a 0.3 m curb 0.4 m from the facade
    const { ctx, bps } = planAll(lots, undefined, true, drop, 0.3, (x, z, out) => (out > lipAt ? rise : 0));
    for (const bp of bps) for (const e of bp.entrances) {
      if (!steppable(bp, e)) continue;
      walked++; most = Math.max(most, bp.shell.steps.filter((s) => s.door === e.doorId).length);
      problems.push(...walkEntrance(ctx, e, `a ${rise} m curb ${lipAt} m beyond the pocket, street ${f2(-drop)} above the sill:`));
    }
  }
  assert.ok(walked >= 4 * 40, `only ${walked} door walks`);
  assert.ok(most >= 3, `no door has more than ${most} steps: the curb is not even met`);
  assert.deepEqual(problems.slice(0, 10), [], `${problems.length} failures`);
});

test('where the street is not below the sill the door gets a stoop: a landing flush with the sill over the plinth pocket, treads up to the street, no more than four, risers a step can climb', () => {
  const problems = []; let doors = 0;
  for (const drop of [0, -0.05, -0.1, -0.25, -0.33, -0.4, -0.6]) {                // -0.6 is past what a stoop can do (not walked above): it must still be a sane stoop
    const g = -drop, { ctx, bps } = planAll(lots, undefined, true, drop, 0.3);
    for (const bp of bps) for (const d of bp.doors) {
      if (!d.ext || d.roof || d.floor !== 0 || d.kind === 'shutter' || d.kind === 'arch') continue;
      doors++;
      const list = bp.shell.steps.filter((s) => s.door === d.id), dep = (s) => Math.min(s.rect.x1 - s.rect.x0, s.rect.z1 - s.rect.z0), wid = (s) => Math.max(s.rect.x1 - s.rect.x0, s.rect.z1 - s.rect.z0);
      const at = `${bp.id} ${d.id} street ${f2(g)} above the sill`;
      if (!list.length) { problems.push(`${at}: nothing in front of the door`); continue; }
      if (list.length > 4) problems.push(`${at}: ${list.length} treads`);
      const first = list[0], last = list.at(-1);
      if (first.y1 > 0 || first.y1 < -0.05) problems.push(`${at}: the landing's top ${f2(first.y1)} is not flush with the sill`);
      if (dep(first) < 0.3 - 1e-6) problems.push(`${at}: the landing is ${f2(dep(first))} m deep, the plinth pocket is 0.3 m`);
      for (let i = 1; i < list.length; i++) {
        if (list[i].y1 < list[i - 1].y1 - 1e-9) problems.push(`${at}: tread ${i} is lower than the one before it`);
        if (list[i].y1 - list[i - 1].y1 > 0.47) problems.push(`${at}: riser ${f2(list[i].y1 - list[i - 1].y1)} m, a step climbs 0.5`);
        if (list[i].y1 - list[i - 1].y1 < 0.12 - 1e-9) problems.push(`${at}: riser ${f2(list[i].y1 - list[i - 1].y1)} m, a lip and not a step`);
      }
      for (const s of list) {
        if (wid(s) < d.w + 0.3) problems.push(`${at}: a tread ${f2(wid(s))} m wide for a ${d.w} m door`);
        if (dep(s) < 0.3 - 1e-6) problems.push(`${at}: a tread ${f2(dep(s))} m deep, not a place to stand`);
        if (s.y0 > lowestUnder(bp, ctx.plan.heightAt, s) - 0.02) problems.push(`${at}: a tread's box ends at ${f2(s.y0)}, above the ground under it (${f2(lowestUnder(bp, ctx.plan.heightAt, s))})`);
      }
      // a street 0.2 m or more over the sill is a wall to a walker on the landing: the last tread stands over it, and not a hand's breadth more
      if (g >= 0.2 && g <= 0.4 && (last.y1 < g + 0.02 || last.y1 > g + 0.1)) problems.push(`${at}: the last tread's top ${f2(last.y1)} does not meet the street`);
    }
  }
  assert.ok(doors >= 7 * 20, `only ${doors} doors checked`);
  assert.deepEqual(problems.slice(0, 10), [], `${problems.length} problems`);
});

test('every ground-floor door of the barrio has a step or a landing in front of it: none opens onto the plinth pocket; the stoops (streets that climb past a sill) have human risers', () => {
  const none = [], stoops = [], risers = [], floating = []; let doors = 0;
  for (const bp of real.buildings) for (const d of bp.doors) {
    if (!d.ext || d.roof || d.floor !== 0 || d.kind === 'shutter' || d.kind === 'arch') continue;
    doors++;
    const list = bp.shell.steps.filter((s) => s.door === d.id);
    if (!list.length) { none.push(`${bp.id} ${d.id}`); continue; }
    if (Math.min(list[0].rect.x1 - list[0].rect.x0, list[0].rect.z1 - list[0].rect.z0) >= 0.4) continue;      // a flight down to the street, not a stoop
    stoops.push(d.id);
    for (let i = 1; i < list.length; i++) risers.push([d.id, f2(list[i].y1 - list[i - 1].y1)]);
    for (const s of list) if (s.y0 > lowestUnder(bp, real.ctx.plan.heightAt, s) - 0.02) floating.push([d.id, f2(s.y0)]);
  }
  assert.ok(doors >= 100, `${doors} doors`);
  assert.deepEqual(stoops, ['L53.d6', 'L71.d9', 'L78.d5'], 'the streets that climb past a sill');
  assert.ok(risers.some(([id, r]) => id === 'L78.d5' && r >= 0.1), `L78's door climbs to the street: ${JSON.stringify(risers)}`);
  assert.deepEqual(risers.filter(([, r]) => r > 0.21), [], 'a riser over 0.21 m');
  assert.deepEqual(floating, [], 'a tread whose box ends above the ground under it');
  assert.deepEqual(none, []);
});

test('every entrance of the barrio (137, page world: street guards, props, furniture) can be walked out of and into, the main door of L78 among them', { timeout: 300000 }, () => {
  const bad = []; let n = 0, l78 = 0;
  for (const bp of real.buildings) for (const e of bp.entrances) {
    if (e.kind === 'roof') continue;                                                // a roof door has its own test (arch-walk.test.mjs)
    n++;
    if (e.id === 'L78.e0') l78++;
    bad.push(...walkEntrance(real.ctx, e, 'barrio'));
  }
  assert.ok(n >= 130 && l78 === 1, `${n} entrances, L78.e0 found ${l78} times`);
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} failed walks`);
});

test('the inside point of every roof door of the barrio is a place a body can stand: put there, the kernel does not push it off (the landing is ~0.75 m deep before the stair guard)', () => {
  // The stuck sweep wants a node within 0.45 m of `inside`. At 1.0 m behind the door the point stood on the stair guard for 25 of the 64 roof doors (L65.e1 had no node near it);
  // at 0.55 m it is the middle of the landing. A body put on a wall zone is pushed out by the kernel as soon as it moves (a move of exactly 0 does not run the push), so "ends where
  // the 1 cm of walking put it" is "is standable" with the public API.
  const ph = real.ctx.physics, bad = []; let n = 0;
  for (const bp of real.buildings) for (const e of bp.entrances.filter((q) => q.kind === 'roof')) {
    n++;
    const s = { x: e.inside[0], y: e.inside[1], z: e.inside[2], vy: 0, onGround: true };
    for (let i = 0; i < 5; i++) ph.move(s, 0.002, 0, 1 / 60, BODIES.player);
    const off = Math.hypot(s.x - e.inside[0] - 0.01, s.z - e.inside[2]);
    if (off > 0.03 || Math.abs(s.y - e.inside[1]) > 0.1) bad.push(`${e.id}: a body put on the inside point ends ${f2(off)} m off, at y ${f2(s.y)} (the point is at y ${e.inside[1]})`);
  }
  assert.ok(n >= 60, `${n} roof doors`);
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} of ${n} inside points are not standable`);
});
