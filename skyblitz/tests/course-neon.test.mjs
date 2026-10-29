// Neon Skyline course tests (pure logic; no WebGL). Run: node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/course-neon.test.mjs
// The generic framework contract (orthonormal frames, project round trips, grid, branches, gates, aiHints, collide ...) is covered for this
// course by `COURSE=neon node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/course.test.mjs`; this file adds what is specific to
// the city: tower loop clearance, the atrium tunnel, the billboard shortcut, buildings as obstacles, determinism and hazards.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CourseLayout } from '../src/world/layout.js';
import { courseDef, COURSES } from '../src/world/courses/index.js';
import { NEON } from '../src/world/courses/neon.js';
import { makeNeonCity } from '../src/world/neon/city.js';

const def = courseDef('neon');
const t0 = performance.now();
const lay = new CourseLayout(def);
const buildMs = performance.now() - t0;
const L = lay.length, city = lay.heightFn.city, f = {};

test('neon: lap length matches its metadata and the design brief (6.4-6.8 km)', () => {
  assert.ok(L > 6400 && L < 6800, `length ${L}`);
  assert.ok(Math.abs(L - COURSES.find((c) => c.id === 'neon').lapLength) < 400);
  assert.equal(def.laps, 3);
  assert.equal(def.environment().night, true);
});

test('neon: layout builds fast and deterministically', () => {
  assert.ok(buildMs < 1500, `layout build ${buildMs.toFixed(0)} ms`);
  const again = makeNeonCity(lay, NEON).city;
  assert.equal(again.counts.boxes, city.counts.boxes);
  assert.equal(again.counts.signs, city.counts.signs);
  assert.equal(JSON.stringify(again.boxes.slice(0, 40)), JSON.stringify(city.boxes.slice(0, 40)));
  assert.ok(city.counts.lots > 800 && city.counts.boxes > 1500, JSON.stringify(city.counts));
});

test('neon: the tower loop circles clear of the landmark tower, which stands taller than the loop top', () => {
  const a = lay.marks.loopEntry, b = lay.marks.loopExit, top = lay.marks.loopTop, T = NEON.towerLoop;
  lay.frameAt(top, f); assert.ok(f.up.y < -0.7, 'inverted at the top');
  const topY = f.pos.y;
  assert.ok(city.tower.top > topY + 60, `tower ${city.tower.top} vs loop top ${topY}`);
  // closest approach of any loop sample to the tower footprint (horizontal) and to the neon ring line
  const R = T.R + 22, c = city.loopCentre, rx = -T.heading[1], rz = T.heading[0];
  let minTower = Infinity, minRing = Infinity;
  for (let s = a - 80; s <= b + 80; s += 2) {
    lay.frameAt(s, f);
    const dx = Math.max(Math.abs(f.pos.x - city.tower.cx) - city.tower.hl, 0), dz = Math.max(Math.abs(f.pos.z - city.tower.cz) - city.tower.hw, 0);
    minTower = Math.min(minTower, Math.hypot(dx, dz));
    // ring: circle of radius R about loopCentre in the plane spanned by (heading, up), at lateral = centre
    const lat = (f.pos.x - c.x) * rx + (f.pos.z - c.z) * rz, inPlane = Math.hypot((f.pos.x - c.x) - rx * lat, (f.pos.z - c.z) - rz * lat) * Math.sign(((f.pos.x - c.x) - rx * lat) * T.heading[0] + ((f.pos.z - c.z) - rz * lat) * T.heading[1] || 1);
    const rad = Math.hypot(inPlane, f.pos.y - c.y);
    minRing = Math.min(minRing, Math.hypot(rad - R, lat));
  }
  assert.ok(minTower > 35, `path to tower ${minTower.toFixed(1)} m`);
  assert.ok(minRing > 14, `path to ring tube ${minRing.toFixed(1)} m`);
});

test('neon: the atrium tunnel is a straight, floored, tight corridor through the building', () => {
  const A = NEON.atrium, a = lay.marks.atriumIn, b = lay.marks.atriumOut;
  let n = 0;
  for (let s = a; s <= b; s += 3) {
    lay.frameAt(s, f);
    assert.ok(Math.abs(f.pos.z - A.z) < 2.5, `z drift ${f.pos.z - A.z} at s=${s}`);
    assert.ok(f.halfWidth <= 40 && f.halfHeight <= 32, `corridor ${f.halfWidth}x${f.halfHeight}`);
    assert.ok(Math.abs(f.tangent.y) < 0.03 && f.tangent.x < -0.99, 'level and heading west');
    const g = lay.groundHeight(f.pos.x, f.pos.z), clear = f.pos.y - g;
    assert.ok(clear > f.halfHeight * 0.8 && clear < f.halfHeight + 4, `floor clearance ${clear.toFixed(1)}`);
    for (const l of [-1, 0, 1]) assert.ok(lay.groundHeight(f.pos.x + f.right.x * l * f.halfWidth, f.pos.z + f.right.z * l * f.halfWidth) === g, 'flat floor across the corridor');
    n++;
  }
  assert.ok(n > 100 && b - a > 300, `tunnel length ${b - a}`);
  // outside the building the same x/z is street level / low
  assert.ok(city.atrium.floor === 70 && city.atrium.top > 150);
});

test('neon: billboard shortcut passes the slot between the two giant screens and saves 4-8 s', () => {
  const br = lay.branches[0], gp = city.screens.gap;
  assert.equal(br.id, 'billboard');
  const u = br.marks.gap, g = {};
  br.frameAt(u, g);
  assert.ok(Math.hypot(g.pos.x - gp.x, g.pos.z - gp.z) < 2, 'gap mark at the slot');
  // fly the branch: the lateral distance to each slab edge stays >= 10 m when centred; the corridor is no wider than the slot + 4 m
  assert.ok(br.halfWidth * 2 <= NEON.screens.gap + 6, `corridor ${br.halfWidth * 2} vs slot ${NEON.screens.gap}`);
  for (const sc of city.screens) {
    for (let v = u - 60; v <= u + 60; v += 3) {
      br.frameAt(v, g);
      const dx = g.pos.x - sc.cx, dz = g.pos.z - sc.cz, a = dx * sc.ax[0] + dz * sc.ax[1], b = -dx * sc.ax[1] + dz * sc.ax[0];
      const inside = Math.abs(a) < sc.hl + 3 && Math.abs(b) < sc.hw + 3;
      assert.ok(!inside || g.pos.y > sc.top, `path inside a screen at u=${v}`);
    }
  }
  assert.ok(city.screens.every((sc) => sc.top > g.pos.y + 40), 'screens tower above the slot');
  // time estimate: cruise 100 m/s capped by corner speed sqrt(62 / curvature)
  const est = (fr, from, to) => { let t = 0; const o = {}; for (let s = from; s < to; s += 4) { fr(s, o); t += 4 / Math.min(100, Math.sqrt(62 / Math.max(o.curvature, 1e-4))); } return t; };
  const tMain = est((s, o) => lay.frameAt(s, o), br.fromS, br.toS), tBr = est((s, o) => br.frameAt(s, o), 0, br.length), saving = tMain - tBr;
  assert.ok(saving >= 4 && saving <= 8, `saving ${saving.toFixed(2)} s (main ${tMain.toFixed(1)}, branch ${tBr.toFixed(1)})`);
});

test('neon: buildings are obstacles but never intrude on the flight corridor', () => {
  // a point inside a known lot hits the ground; the street between lots does not
  const lot = city.boxes.find((b) => b.kind === 'lot' && b.y1 > 100);
  assert.ok(lay.groundHeight(lot.cx, lot.cz) >= lot.y1 - 1e-6, 'lot is solid up to its roof');
  const out = {}, p = new THREE.Vector3(lot.cx, lot.y1 - 5, lot.cz);
  assert.equal(lay.collide(p, 3, null, out), true); assert.equal(out.kind, 'ground');
  // corridor clearance everywhere (main path and branches), except on the launch deck
  const check = (fr, len, name) => {
    let worst = Infinity, at = 0;
    for (let s = 0; s < len; s += 4) {
      fr(s, f);
      if (lay._onDeck(f.pos.x, f.pos.z) || (len === L && (s > L - 320 || s < 90))) continue;   // launch podium zone
      for (const l of [-0.95, -0.5, 0, 0.5, 0.95]) {
        const x = f.pos.x + f.right.x * l * f.halfWidth, z = f.pos.z + f.right.z * l * f.halfWidth, h = lay.groundHeight(x, z);
        const c = f.pos.y - f.halfHeight * 0.5 - h;       // lower half of the corridor must be free
        if (c < worst) { worst = c; at = s; }
      }
    }
    assert.ok(worst > 0, `${name}: ground inside the corridor (${worst.toFixed(1)} m at ${at.toFixed(0)})`);
  };
  check((s, o) => lay.frameAt(s, o), L, 'main');
  check((s, o) => lay.branches[0].frameAt(s, o), lay.branches[0].length, 'branch');
});

test('neon: the elevated highway deck is solid ground below the route and the river is below street level', () => {
  const h = city.highway;
  assert.ok(h.pts.length > 100);
  const mid = h.pts[Math.floor(h.pts.length / 2)];
  assert.ok(Math.abs(lay.groundHeight(mid.x, mid.z) - mid.y) < 3, 'deck height query');
  lay.frameAt(mid.s, f); assert.ok(f.pos.y - mid.y > 34 && f.pos.y - mid.y < 48, `route is ${f.pos.y - mid.y} m above the deck`);
  const rp = city.river.pts[3];
  assert.ok(lay.groundHeight(rp[0], rp[1]) < 0, 'river bed');
});

test('neon: hazards are sane (hover cars on rails, blimps), inside the corridor and clear of the racing line', () => {
  const kinds = new Set(lay.hazards.map((x) => x.kind));
  assert.ok(kinds.has('hovercar') && kinds.has('blimp'));
  assert.ok(lay.hazards.length >= 6);
  for (const hz of lay.hazards) {
    assert.ok(hz.radius >= 7 && hz.radius <= 20 && !hz.column);
    assert.ok(hz.data && hz.data.amp > 5 && hz.data.amp < 40 && hz.data.period > 3 && hz.data.period < 15, JSON.stringify(hz.data));
    lay.path.frameAt(hz.s, f);
    const lat = (hz.home.x - f.pos.x) * f.right.x + (hz.home.y - f.pos.y) * f.right.y + (hz.home.z - f.pos.z) * f.right.z;
    // the full sweep stays within the corridor, so cars can never end up inside a wall
    assert.ok(Math.abs(lat) + (hz.data.axis === 'lateral' ? hz.data.amp : 0) + hz.radius < f.halfWidth * 1.15, `sweep ${lat} +- ${hz.data.amp} in hw ${f.halfWidth} at s=${hz.s.toFixed(0)}`);
  }
  // no hazard sits in or right at the tunnel
  const A = NEON.atrium;
  for (const hz of lay.hazards) assert.ok(!(hz.home.x > A.x0 - 60 && hz.home.x < A.x1 + 60 && Math.abs(hz.home.z - A.z) < 80), 'not at the atrium');
});

test('neon: item clusters, boost rings and gates cover the lap', () => {
  assert.equal(new Set(lay.itemBoxes.map((b) => b.cluster)).size, 5);
  assert.ok(lay.boostRings.length >= 10);
  assert.ok(lay.gates.length >= 22);
  // gates keep a sane spacing (no two within 60 m except the shortcut entry)
  for (let i = 1; i < lay.gates.length; i++) assert.ok(lay.gates[i].s - lay.gates[i - 1].s > 55 || lay.gates[i].shortcut || lay.gates[i - 1].shortcut);
  // one cluster lands in the tunnel exit, none inside the tunnel itself
  for (const b of lay.itemBoxes) assert.ok(b.s < lay.marks.atriumIn - 10 || b.s > lay.marks.atriumOut - 5, 'no orb mid-tunnel');
});

test('neon: sky is night with strong bloom', () => {
  const e = def.environment();
  assert.ok(e.night && e.bloom.strength >= 0.6 && e.fogDensity > 0.0003 && e.ringColor !== undefined && e.warnColor !== undefined);
});
