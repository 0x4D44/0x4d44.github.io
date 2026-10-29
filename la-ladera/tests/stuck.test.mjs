// Fixture tests for the stuck-spot probe: it must be able to FAIL, otherwise a green run on the real world means nothing.
//   node --test la-ladera/tests/stuck.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Physics, wallsRect, floorRect } from '../js/core/physics.js';
import { analyze } from './stuck-lib.mjs';

// A 24 x 24 m test plot in the middle of the world: flat ground at y = 0, a ring of walls so the probe is bounded.
function world(build) {
  const P = new Physics();
  P.setTerrain(() => 0);
  P.addWalls(wallsRect(0, 0, 24, 24, 0, -5, 5, 0.1));
  build?.(P);
  return P;
}
const run = (P, extra = {}) => analyze({ physics: P, spawn: { x: 0, z: 0 }, cell: 0.3, region: [-13, -13, 13, 13], lo: -100, hi: 100, ...extra });

test('open flat room inside a wall ring: no traps, no boundary exposure, nothing missing', () => {
  const r = run(world());
  assert.ok(r.nodes > 1000, `explored ${r.nodes} nodes`);
  assert.equal(r.trapNodes, 0);
  assert.equal(r.boundaryClusters, 0);
  assert.equal(r.missingCount, 0);
});

test('a 1.2 m deep pit is a trap (you can fall in but never climb out)', () => {
  // terrain is flat; the pit is a floor-less hole: model it with terrain that dips, so the drop is real
  const P = new Physics();
  P.setTerrain((x, z) => (Math.abs(x - 6) < 1.5 && Math.abs(z) < 1.5 ? -1.2 : 0));
  P.addWalls(wallsRect(0, 0, 24, 24, 0, -5, 5, 0.1));
  const r = run(P);
  assert.ok(r.trapNodes > 10, `trap nodes ${r.trapNodes}`);
  assert.ok(r.traps.some((t) => Math.abs(t.at[0] - 6) < 1.5 && Math.abs(t.at[1]) < 1.5), JSON.stringify(r.traps.slice(0, 2)));
});

test('a 0.35 m kerb is not a trap (step up and down both work)', () => {
  const P = new Physics();
  P.setTerrain((x, z) => (Math.abs(x - 6) < 1.5 && Math.abs(z) < 1.5 ? -0.35 : 0));
  P.addWalls(wallsRect(0, 0, 24, 24, 0, -5, 5, 0.1));
  const r = run(P);
  assert.equal(r.trapNodes, 0);
});

test('open edge of the plot is reported as boundary exposure', () => {
  const P = new Physics();
  P.setTerrain(() => 0);                       // no ring wall at all: the player can walk to x = +-100 ... within the region
  const r = analyze({ physics: P, spawn: { x: 0, z: 0 }, cell: 0.5, region: [-100, -100, 100, 100], lo: -100, hi: 100 });
  assert.ok(r.boundaryClusters > 0, 'walking off the map must be flagged');
});

test('a room sealed by walls is reported missing (unreachable required place)', () => {
  const P = world((p) => p.addWalls(wallsRect(7, 7, 4, 4, 0, -5, 5, 0.1)));   // sealed 4x4 box, no door
  const bp = { id: 'T', bounds: { x0: 5, x1: 9, z0: 5, z1: 9 }, frame: { toWorld: (x, y, z) => [x, y, z], toLocal: (x, y, z) => [x, y, z] }, entrances: [],
    rooms: [{ id: 'T.f0.r0', type: 'living', y: 0, rect: { x0: 6, z0: 6, x1: 8, z1: 8 } }] };
  const r = run(P, { buildings: [bp] });
  assert.equal(r.missingCount, 1, JSON.stringify(r.missing));
  assert.match(r.missing[0].what, /room T\.f0\.r0/);
});

test('the same room with a 0.9 m doorway is reachable', () => {
  const P = world((p) => {
    // 4x4 box centred (7,7) with a gap on its -z side (z = 5) between x = 6.55 and x = 7.45
    p.addWalls([
      { x1: 5, z1: 9, x2: 9, z2: 9, t: 0.1, y0: 0, y1: 3 }, { x1: 5, z1: 5, x2: 5, z2: 9, t: 0.1, y0: 0, y1: 3 }, { x1: 9, z1: 5, x2: 9, z2: 9, t: 0.1, y0: 0, y1: 3 },
      { x1: 5, z1: 5, x2: 6.55, z2: 5, t: 0.1, y0: 0, y1: 3 }, { x1: 7.45, z1: 5, x2: 9, z2: 5, t: 0.1, y0: 0, y1: 3 },
    ]);
  });
  const bp = { id: 'T', bounds: { x0: 5, x1: 9, z0: 5, z1: 9 }, frame: { toWorld: (x, y, z) => [x, y, z], toLocal: (x, y, z) => [x, y, z] }, entrances: [],
    rooms: [{ id: 'T.f0.r0', type: 'living', y: 0, rect: { x0: 6, z0: 6, x1: 8, z1: 8 } }] };
  assert.equal(run(P, { buildings: [bp] }).missingCount, 0);
});

test('doorway width: 0.5 m gap blocks the 0.6 m character, 1.0 m gap passes', () => {
  const narrow = (gap) => {
    const Q = world((p) => {
      const a = 7 - gap / 2, b = 7 + gap / 2;
      p.addWalls([
        { x1: 5, z1: 9, x2: 9, z2: 9, t: 0.1, y0: 0, y1: 3 }, { x1: 5, z1: 5, x2: 5, z2: 9, t: 0.1, y0: 0, y1: 3 }, { x1: 9, z1: 5, x2: 9, z2: 9, t: 0.1, y0: 0, y1: 3 },
        { x1: 5, z1: 5, x2: a, z2: 5, t: 0.1, y0: 0, y1: 3 }, { x1: b, z1: 5, x2: 9, z2: 5, t: 0.1, y0: 0, y1: 3 },
      ]);
    });
    const bp = { id: 'T', bounds: { x0: 5, x1: 9, z0: 5, z1: 9 }, frame: { toWorld: (x, y, z) => [x, y, z], toLocal: (x, y, z) => [x, y, z] }, entrances: [],
      rooms: [{ id: 'T.f0.r0', type: 'living', y: 0, rect: { x0: 6, z0: 6, x1: 8, z1: 8 } }] };
    return run(Q, { buildings: [bp] }).missingCount;
  };
  assert.equal(narrow(0.5), 1, 'a 0.5 m gap (0.3 m clear after wall thickness) must block');
  assert.equal(narrow(1.0), 0, 'a 1.0 m gap (0.8 m clear) must pass');
});

test('a 0.9 m wall can be hopped, a 1.4 m wall cannot', () => {
  const ring = (top) => {
    const P = world((p) => p.addWalls(wallsRect(7, 7, 4, 4, 0, 0, top, 0.1)));       // sealed 4x4 ring, no door
    const bp = { id: 'T', bounds: { x0: 5, x1: 9, z0: 5, z1: 9 }, frame: { toWorld: (x, y, z) => [x, y, z], toLocal: (x, y, z) => [x, y, z] }, entrances: [],
      rooms: [{ id: 'T.f0.r0', type: 'patio', y: 0, rect: { x0: 5.8, z0: 5.8, x1: 8.2, z1: 8.2 } }] };
    return run(P, { buildings: [bp] });
  };
  assert.equal(ring(0.9).missingCount, 0, 'a 0.9 m low wall is hopped');
  assert.equal(ring(0.9).trapNodes, 0, 'and hopped back out');
  assert.equal(ring(1.4).missingCount, 1, 'a 1.4 m wall seals the patio');
});

test('stairs: a flight to an upper slab with a hole is walkable both ways; without the hole headroom blocks', () => {
  // ground slab level 0; a 3 m long ramp from y 0 to 2.8 along +x at z in [-0.6,0.6], x in [2,5]; upper slab at y 2.8 for x in [5,9]
  const mk = (withHole) => world((p) => {
    p.addFloor({ pts: [[5, -3], [9, -3], [9, 3], [5, 3]], y: 2.8 });
    p.addFloor({ pts: [[2, -0.6], [5, -0.6], [5, 0.6], [2, 0.6]], y: 0, px: 2, pz: 0, a: 2.8 / 3, b: 0 });
    if (!withHole) p.addFloor({ pts: [[1.5, -1.5], [5, -1.5], [5, 1.5], [1.5, 1.5]], y: 2.8 });   // a slab straight over the flight: head bump
  });
  // walk 6.5 m east from x = 1 (stops on the upper slab at x = 7.5, well short of its far edge at x = 9)
  const up = (P) => { const s = { x: 1, y: 0, z: 0, vy: 0, onGround: true }; for (let i = 0; i < 130; i++) P.move(s, 0.05, 0, 1 / 60); return s; };
  assert.ok(up(mk(true)).y > 2.5, 'with a clear stairwell the player reaches the upper slab');
  assert.ok(up(mk(false)).y < 2.0, 'a slab over the flight blocks (head bump)');
  const r = analyze({ physics: mk(true), spawn: { x: 0, z: 0 }, cell: 0.3, region: [-13, -13, 13, 13] });
  assert.equal(r.trapNodes, 0, 'the upper slab is not a trap: you can walk back down (or drop off its edge)');
});
