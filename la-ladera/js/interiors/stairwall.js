// INTERIORS (A3): where wall decor may hang in a stair core, and how high the step beside each wall is.
// A2's dogleg core (js/arch/stairs.js; read back from the `bp.stairs` records, never edited) is one shaft. On the ground floor the stairwell room holds all of it: the landing, lane A
// (which rises along one outer wall), lane B (which is the nook under the flight above, closed off by a panel) and the half landing. On every floor above the room is the landing alone,
// and the slab hole beyond it has no wall at all. A poster hung at the storey height of the room (1.2 to 1.4 m) therefore floated in the void of a landing, sank into the steps as lane A
// rose, hid in the nook or under the half landing. `stairWalls` tells `Layout.hang` per wall which runs take nothing and how high the step in front of each run is, so a decal hangs the
// usual height ABOVE THE STEP and never where nobody could see it (the lead's round-4 list, 'posters on stairs').
const GAP = 0.1;                                                            // how far from a wall line a hole edge or a lane side still counts as that wall's (a landing's edge IS the hole's)
const hole = (st) => { const xs = st.hole.map((p) => p[0]), zs = st.hole.map((p) => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }; };
const side = (r, wall) => (wall === '-z' ? { ax: 'x', base: r.z0, lo: r.x0, hi: r.x1 } : wall === '+z' ? { ax: 'x', base: r.z1, lo: r.x0, hi: r.x1 }
  : wall === '-x' ? { ax: 'z', base: r.x0, lo: r.z0, hi: r.z1 } : { ax: 'z', base: r.x1, lo: r.z0, hi: r.z1 });

/** The dogleg core in plan: S along the flights from the landing, U across to lane B, s and u of a plan point, and the heights of the core (absolute, building frame). */
function frame(st) {
  const [a0, a1] = [st.flights[0].from, st.flights[0].to], b1 = st.flights[1].to, lfl = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
  const S = [(a1[0] - a0[0]) / lfl, (a1[1] - a0[1]) / lfl];
  let U = [-S[1], S[0]]; const uB0 = (b1[0] - a0[0]) * U[0] + (b1[1] - a0[1]) * U[1];
  if (uB0 < 0) U = [-U[0], -U[1]];
  const sOf = (x, z) => (x - a0[0]) * S[0] + (z - a0[1]) * S[1], uOf = (x, z) => (x - a0[0]) * U[0] + (z - a0[1]) * U[1];
  const ends = (q) => { const ss = [[q.x0, q.z0], [q.x1, q.z0], [q.x1, q.z1], [q.x0, q.z1]].map(([x, z]) => sOf(x, z)); return [Math.min(...ss), Math.max(...ss)]; };
  return { S, U, sOf, uOf, lfl, hw: st.width / 2, uB: uOf(b1[0], b1[1]), yb: st.flights[0].y0, yh: st.flights[0].y1, rise: st.rise, run: st.run, landing: ends(st.landing), half: ends(st.halfLanding) };
}

/** Runs of one wall of the ground-floor core: { u0, u1, none | y0 -> y1 } (y = height of the step in front of the run, absolute; the nosing line along a flight). */
function groundRuns(st, sd, fr) {
  const { ax, base, lo, hi } = sd, runs = [];
  const at = (u) => (ax === 'x' ? [u, base] : [base, u]);
  const [px, pz] = at(lo), [qx, qz] = at(hi);
  const s0 = fr.sOf(px, pz), s1 = fr.sOf(qx, qz), along = Math.abs(s1 - s0) > Math.abs(fr.uOf(qx, qz) - fr.uOf(px, pz));
  if (!along) {                                                             // an end wall: the landing's (flat, floor level) or the half landing's (flat, mid-height)
    const y = Math.abs(s0 - fr.half[1]) < GAP ? fr.yh : fr.yb;
    runs.push({ u0: lo, u1: hi, y0: y, y1: y }); return runs;
  }
  const uu = fr.uOf(px, pz), k = (s1 - s0) / (hi - lo);                     // a side wall, along the flights: s runs from s0 at `lo` by k = +-1 per metre
  const sAt = (u) => s0 + k * (u - lo), uAt = (s) => lo + (s - s0) / k;     // s at a wall coordinate, and back
  const part = (sa, sb, make) => { const [a, b] = k > 0 ? [uAt(sa), uAt(sb)] : [uAt(sb), uAt(sa)], c = Math.max(lo, a), d = Math.min(hi, b); if (d > c) runs.push(make(c, d)); };
  const ramp = (c, d) => ({ u0: c, u1: d, y0: fr.yb + fr.rise + sAt(c) * (fr.rise / fr.run), y1: fr.yb + fr.rise + sAt(d) * (fr.rise / fr.run) });   // the nosing line
  const sEnd = fr.half[1], sBegin = fr.landing[0];
  if (Math.abs(uu + fr.hw) < GAP) {                                         // the outer wall of lane A: landing, the flight rising along the wall, the half landing
    part(sBegin, 0, (c, d) => ({ u0: c, u1: d, y0: fr.yb, y1: fr.yb }));
    part(0, fr.lfl, ramp);
    part(fr.lfl, sEnd + 1, (c, d) => ({ u0: c, u1: d, y0: fr.yh, y1: fr.yh }));
  } else if (Math.abs(uu - (fr.uB + fr.hw)) < GAP) {                        // the outer wall of lane B: the nook under the flight above is behind a panel
    part(sBegin, 0, (c, d) => ({ u0: c, u1: d, y0: fr.yb, y1: fr.yb }));
    part(0, fr.lfl, (c, d) => ({ u0: c, u1: d, none: true }));
    part(fr.lfl, sEnd + 1, (c, d) => ({ u0: c, u1: d, y0: fr.yh, y1: fr.yh }));
  }
  return runs;
}

/**
 * The stair walls of one room, or null when no stair touches it. The result answers `lift(wall, u0, u1)`: the height of the step in front of that stretch of wall above the room's
 * floor (0 on the flat), or null when nothing may hang there (the open side of a landing, the nook under a flight).
 */
export function stairWalls(bp, room, r) {
  if (!room.core) return null;                                              // only the stair core itself: a bathroom behind the stair has a real wall between it and the shaft
  const f = room.floor ?? 0, y = room.y ?? 0;
  const sts = (bp.stairs ?? []).filter((st) => st.landing && st.halfLanding && st.flights?.length === 2 && st.hole?.length && (f === st.floors?.[0] || f === st.floors?.[1]));
  if (!sts.length) return null;
  const runs = {};
  for (const wall of ['-z', '+z', '-x', '+x']) {
    const sd = side(r, wall), list = [];
    for (const st of sts) {
      const H = hole(st);
      if (f >= 1) {                                                         // an upper floor: the slab hole beyond the landing has no wall along it
        const edge = wall === '-z' ? H.z1 : wall === '+z' ? H.z0 : wall === '-x' ? H.x1 : H.x0;
        if (Math.abs(sd.base - edge) > GAP) continue;
        const a = Math.max(sd.lo, sd.ax === 'x' ? H.x0 : H.z0), b = Math.min(sd.hi, sd.ax === 'x' ? H.x1 : H.z1);
        if (b > a) list.push({ u0: a, u1: b, none: true });
      } else if (H.x0 >= r.x0 - GAP && H.x1 <= r.x1 + GAP && H.z0 >= r.z0 - GAP && H.z1 <= r.z1 + GAP) {      // the ground floor: the flights are inside the room
        for (const rn of groundRuns(st, sd, frame(st))) list.push(rn.none ? rn : { ...rn, y0: rn.y0 - y, y1: rn.y1 - y });
      }
    }
    if (list.length) runs[wall] = list;
  }
  // the lamp of a ground-floor core hangs over its landing: the middle of the room is the divider between the lanes (the bulb sat inside the wall)
  const g = f === 0 ? sts.find((st) => { const H = hole(st); return H.x0 >= r.x0 - GAP && H.x1 <= r.x1 + GAP && H.z0 >= r.z0 - GAP && H.z1 <= r.z1 + GAP; }) : null;
  const lamp = g ? [(g.landing.x0 + g.landing.x1) / 2, (g.landing.z0 + g.landing.z1) / 2] : null;
  if (!Object.keys(runs).length && !lamp) return null;
  return {
    runs, lamp,
    lift(wall, u0, u1) {
      const list = runs[wall]; if (!list) return 0;
      let top = 0;
      for (const rn of list) {
        if (u1 <= rn.u0 || u0 >= rn.u1) continue;
        if (rn.none) return null;
        const a = Math.max(u0, rn.u0), b = Math.min(u1, rn.u1), t = (u) => rn.y0 + ((rn.y1 - rn.y0) * (u - rn.u0)) / (rn.u1 - rn.u0 || 1);
        top = Math.max(top, t(a), t(b));                                    // the highest step under the part of the item that lies over this run
      }
      return top;
    },
  };
}
