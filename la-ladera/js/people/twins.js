// Clones (R3-006): two people drawn from the same character, side by side, read as a mistake (the library has 30 bodies for 86 people, so some pairs will exist; they should not be
// neighbours). Pure helpers (no THREE, no DOM) the brain uses wherever somebody CHOOSES a place: a bench, a chat corner, a node of the street graph. Nothing is forbidden, because a
// persona with one model and a small barrio must still be able to place everybody; a place beside a twin is just far less likely, and a place on top of anybody is the last choice.
//
//   refOf(m)                        where somebody is, or is heading: the end of the walk they are on, else the place they stand
//   isTwin(a, b)                    the same character (not the same person)
//   twinWeight(npc, p, npcs)        multiplier for a candidate place `p` {x,z}: 1, or TWIN_WEIGHT when a twin of `npc` stands or is heading within TWIN_R of it
//   spreadNodes(npc, nodes, npcs)   the nodes of a list to choose from: clear of twins and of everybody if the list allows, else clear of everybody, else all of it
//   slotAt(spot, others, ok)        where on a place that several people share (the court, a corner) the next one stands: the middle, then a ring round it, each a step from the rest
//   tailsTwin(me, o, ux, uz)        npc.js _walk: the walker behind a twin who walks the same way slows (TAIL_SLOW) until the gap has opened, so two of one character do not walk a street side by side
export const TWIN_R = 4;          // metres: a twin closer than this to where you are going is a clone beside you
export const CROWD_R = 1.6;        // metres: nobody stands on top of anybody
export const TWIN_WEIGHT = 0.04;   // a spot beside a twin is 25 times less likely than the same spot beside a stranger

const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function refOf(m) {
  const path = m.mode === 'walk' && m.path?.length ? m.path[m.path.length - 1] : null;
  return path ?? m;
}
export const isTwin = (a, b) => !!a && !!b && a !== b && a.charId != null && a.charId === b.charId;

export function twinWeight(npc, p, npcs) {
  for (const m of npcs) if (m !== npc && !m.away && isTwin(npc, m) && dist2d(refOf(m), p) < TWIN_R) return TWIN_WEIGHT;
  return 1;
}

export const SLOT_R = 1.3;         // metres from the middle of a shared place to the ring: neighbours on the ring are a step and a half apart (2 R sin 30 degrees)
export const TWIN_SLOT_R = 3.0;    // the ring when a twin is already there (R3-006: the court's ring is 1.3 m wide, so two of one character stood 1.3 m apart; R3 counts a pair under 2.5 m, and a ring of 2.4 stood two of them 2.0 m apart): a wider ring, eight points round it
/**
 * The point of shared place `spot` {x,z,ry} for the next person: the middle if nobody is there, else the point of the middle-and-ring (six points at SLOT_R, turned by the spot's facing)
 * that is farthest from `others` ({x,z}: the people already there or on their way). `ok(point)` rejects points inside a wall. Two children never stand on one point (A1's R3-003 probe).
 */
export function slotAt(spot, others, ok = () => true, radius = SLOT_R, count = 6) {
  const cands = [{ x: spot.x, z: spot.z }];
  for (let i = 0; i < count; i++) { const a = (spot.ry ?? 0) + (i / count) * Math.PI * 2; cands.push({ x: spot.x + Math.sin(a) * radius, z: spot.z + Math.cos(a) * radius }); }
  let best = null, bd = -1;
  for (const c of cands) {
    if (!ok(c)) continue;
    let d = Infinity; for (const o of others) d = Math.min(d, dist2d(o, c));
    if (d > bd + 1e-9) { bd = d; best = c; }                           // strictly better only: the middle wins a tie, then the ring in order
  }
  return best ?? cands[0];
}

export const TAIL_R = 3.2;         // metres: a twin who walks the same way this close in front of you (or level with you) is a clone at your side
export const TAIL_SLOW = 0.45;     // the one behind walks at this fraction of the pace until the gap has opened (two seconds and a half later), then at their own: two of one character do not walk a street side by side

/**
 * Does walker `me` hold back for `o`? Yes when `o` is the same character (not the same person), walks the same way (within about 70 degrees of my direction (ux, uz), which is the unit vector to my
 * next waypoint), is within TAIL_R on this floor, and is in front of me or level with me: the one behind slows; side by side, the one with the higher id (so never both, never neither).
 * Pure, so a test can try every case. Left alone on purpose: a twin who passes head on (a moment), who is behind (it is their turn to slow), who stands (a person does not stop beside one) or is somebody else.
 */
export function tailsTwin(me, o, ux, uz) {
  if (!isTwin(me, o) || o.mode !== 'walk' || !o.moving) return false;
  const dx = o.st.x - me.st.x, dz = o.st.z - me.st.z;
  if (Math.hypot(dx, dz) > TAIL_R || Math.abs(o.st.y - me.st.y) > 2) return false;
  if (ux * Math.sin(o.ry) + uz * Math.cos(o.ry) < 0.35) return false;           // not going my way
  const ahead = dx * ux + dz * uz;                                                // metres in front of me (negative: behind me)
  if (ahead < -0.6) return false;                                                 // behind me: they are the one to slow
  return ahead > 0.6 || me.id > o.id;                                             // clearly in front: I slow; level with me: the higher id slows
}

export function spreadNodes(npc, nodes, npcs) {
  const others = [];
  for (const m of npcs) if (m !== npc && !m.away) { const r = refOf(m); others.push({ x: r.x, z: r.z, twin: isTwin(npc, m) }); }
  const near = (n, twinsOnly, r) => others.some((o) => (!twinsOnly || o.twin) && dist2d(o, n) < r);
  const apart = nodes.filter((n) => !near(n, true, TWIN_R) && !near(n, false, CROWD_R));
  if (apart.length) return apart;
  const free = nodes.filter((n) => !near(n, false, CROWD_R));
  return free.length ? free : nodes;
}
