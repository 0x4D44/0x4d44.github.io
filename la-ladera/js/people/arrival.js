// The first frame (A5's hero-shot order: street, balconies, washing lines, a person or two in the middle distance, the hill climbing away). The arrival view is the fan ahead of the
// spawn point, `plan.spawn` {x, z, yaw}. build() used to start five people in a ring of 9-34 m round it; the first five of the cast are the shopkeepers, who go to their posts, and the
// ring is mostly behind the camera or in the side streets, so the middle distance was empty. Now the people the view is made of are chosen first, from those who are out of doors at
// this hour, and each is given a part: somebody walking away up the street, somebody standing, two talking; the fifth keeps the ring.
// Pure (no THREE, no DOM): the same code runs in the page and under Node.
//
//   ahead(near, p)                      true when p {x,z} is in the fan of `near` ({x, z, min, max, fan: {x, z, half}}): min..max metres from the spawn, within `half` of the view direction
//   arrivalNear(sp)                     the fan of the spawn point: 10-30 m, 35 degrees either side of the way the player looks (yaw 0 = north = -z, as plan.spawn and js/world/kit.js inSpawnFan)
//   pickArrivals(npcs, hour, blockAt, sp)   Map(npc -> near with a part) for the people who start in view, and the fifth (a plain ring) if the barrio has one more to spare
export const ARRIVAL = { min: 10, max: 30, half: (35 * Math.PI) / 180 };
export const ARRIVAL_HOLD = 25;      // seconds the arrival people stay where they were put (the first frame is looked at for that long: the standers stand for 30 s at the least, the talkers 40)
export const ARRIVAL_BANDS = { chat: [0, 6], walk: [6, 14], stand: [14, 20] };       // metres past the fan's near edge: the two who talk are nearest, the walker starts behind them and walks away from the player, the one who stands is farthest

export const viewDir = (sp) => ({ x: -Math.sin(sp.yaw ?? 0), z: -Math.cos(sp.yaw ?? 0) });

export function ahead(near, p) {
  const dx = p.x - near.x, dz = p.z - near.z, d = Math.hypot(dx, dz);
  if (d < near.min || d > near.max) return false;
  if (!near.fan) return true;
  return Math.acos(Math.max(-1, Math.min(1, (dx * near.fan.x + dz * near.fan.z) / d))) <= near.fan.half;
}

export function arrivalNear(sp, cfg = ARRIVAL) {
  return { x: sp.x, z: sp.z, min: cfg.min, max: cfg.max, fan: { ...viewDir(sp), half: cfg.half } };
}

/** The parts, in the order they are cast: one walks away up the street, one stands, two talk. Each prefers a woman or a man so the view is not four of one kind. */
export const PARTS = [['walk', 'f'], ['stand', 'm'], ['chat', 'f'], ['chat', 'm']];

export function pickArrivals(npcs, hour, blockAt, sp, parts = PARTS) {
  const out = new Map(), models = new Set(), near = arrivalNear(sp);
  const free = npcs.filter((n) => n.routine !== 'shopkeeper' && n.age !== 'kid' && blockAt(n, hour) === 'free');       // grown-ups who are out and about now
  const take = (want, ok = () => true) => {
    const n = free.find((m) => !out.has(m) && !models.has(m.charId) && ok(m) && m.gender === want) ?? free.find((m) => !out.has(m) && !models.has(m.charId) && ok(m));
    if (n) models.add(n.charId);                                              // four different bodies in the one view
    return n ?? null;
  };
  for (const [part, want] of parts) {
    const n = take(want, part === 'walk' ? (m) => m.age !== 'elder' : undefined);
    if (n) out.set(n, { ...near, role: part });
  }
  const fifth = take(null);
  if (fifth) out.set(fifth, { x: sp.x, z: sp.z, min: 9, max: 34 });
  return out;
}
