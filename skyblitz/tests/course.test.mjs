// Course framework tests (pure logic; no WebGL). Run: node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/course.test.mjs
// Every course by default; COURSE=sunrise limits to one.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CourseLayout } from '../src/world/layout.js';
import { PathData } from '../src/world/path.js';
import { courseDef, COURSES, previewCourse } from '../src/world/courses/index.js';
import { mulberry32 } from '../src/util.js';

const IDS = (process.env.COURSE ? [process.env.COURSE] : COURSES.map((c) => c.id)).filter((id) => COURSES.some((c) => c.id === id));

for (const id of IDS) {
  const def = courseDef(id);
  const lay = new CourseLayout(def);
  const L = lay.length;

  test(`${id}: lap length and metadata`, () => {
    assert.ok(L > 5500 && L < 7200, `length ${L}`);
    assert.ok(Math.abs(L - COURSES.find((c) => c.id === id).lapLength) < 400, `metadata lapLength ${COURSES.find((c) => c.id === id).lapLength} vs ${L}`);
  });

  test(`${id}: frames are orthonormal and arc length is uniform`, () => {
    const f = {}, g = {};
    let prev = new THREE.Vector3(), first = true, maxErr = 0;
    for (let s = 0; s < L; s += 1.7) {
      lay.frameAt(s, f);
      assert.ok(Math.abs(f.tangent.length() - 1) < 1e-6 && Math.abs(f.up.length() - 1) < 1e-6 && Math.abs(f.right.length() - 1) < 1e-6);
      assert.ok(Math.abs(f.tangent.dot(f.up)) < 1e-6 && Math.abs(f.tangent.dot(f.right)) < 1e-6 && Math.abs(f.up.dot(f.right)) < 1e-6);
      const rr = new THREE.Vector3().crossVectors(f.tangent, f.up); assert.ok(rr.distanceTo(f.right) < 1e-6, 'right = tangent x up');
      assert.ok(f.halfWidth > 20 && f.halfHeight > 20 && Number.isFinite(f.bank) && Number.isFinite(f.curvature));
      if (!first) { const d = f.pos.distanceTo(prev); maxErr = Math.max(maxErr, Math.abs(d - 1.7)); }
      prev.copy(f.pos); first = false;
    }
    assert.ok(maxErr < 0.05, `arc-length step error ${maxErr}`);
    // wrap continuity
    lay.frameAt(L - 0.01, f); lay.frameAt(0.01, g);
    assert.ok(f.pos.distanceTo(g.pos) < 0.1 && f.up.dot(g.up) > 0.999, 'closed path is continuous (incl. twist)');
    lay.frameAt(L + 5, f); lay.frameAt(5, g); assert.ok(f.pos.distanceTo(g.pos) < 1e-6, 's wraps');
  });

  test(`${id}: up never flips discontinuously (frame twist is smooth)`, () => {
    const a = {}, b = {};
    for (let s = 0; s < L; s += 2.5) { lay.frameAt(s, a); lay.frameAt(s + 2.5, b); assert.ok(a.up.dot(b.up) > 0.99, `up jump at s=${s}`); }
  });

  test(`${id}: loops: inverted at the top, passes stay >= 25 m apart`, () => {
    const entries = Object.keys(lay.marks).filter((k) => k.endsWith('Entry') && lay.marks[k.slice(0, -5) + 'Exit'] != null);
    for (const k of entries) {
      const nm = k.slice(0, -5), a = lay.marks[k], b = lay.marks[nm + 'Exit'], top = lay.marks[nm + 'Top'];
      const f = {};
      if (top != null) { lay.frameAt(top, f); assert.ok(f.up.y < -0.7, `up at loop top ${f.up.y}`); }
      const p = new THREE.Vector3(), q = new THREE.Vector3(); let minD = Infinity;
      for (let s = a; s < b; s += 4) { lay.frameAt(s, f); p.copy(f.pos); for (let t = s + 60; t < b; t += 4) { lay.frameAt(t, f); minD = Math.min(minD, p.distanceTo(f.pos) * (t - s > 150 ? 1 : 99)); } }
      void q;
      assert.ok(minD >= 25, `loop self-clearance ${minD}`);
    }
  });

  test(`${id}: project round-trips inside the corridor (hint within 60 m), loops never alias`, () => {
    const rnd = mulberry32(42), f = {}, out = {}, pos = new THREE.Vector3();
    let worstS = 0, worstLat = 0, n = 0;
    for (let i = 0; i < 6000; i++) {
      const s = rnd() * L; lay.frameAt(s, f);
      // keep to where the nearest-point inverse is unique: lateral reach well under the radius of curvature
      const reach = Math.min(f.halfWidth, f.halfHeight) * 0.85, rc = 0.6 / Math.max(f.curvature, 1e-6);
      const lim = Math.min(reach, rc);
      const lat = (rnd() * 2 - 1) * lim, vert = (rnd() * 2 - 1) * Math.min(lim, f.halfHeight * 0.85);
      pos.copy(f.pos).addScaledVector(f.right, lat).addScaledVector(f.up, vert);
      const hint = s + (rnd() * 2 - 1) * 60;
      out.branch = -1;
      lay.project(pos, hint, out);
      if (out.branch >= 0) continue;               // a shortcut branch legitimately claims points that are inside its own corridor
      let ds = Math.abs(out.s - s); ds = Math.min(ds, L - ds);
      worstS = Math.max(worstS, ds); worstLat = Math.max(worstLat, Math.abs(out.lateral - lat), Math.abs(out.vertical - vert)); n++;
    }
    assert.ok(n > 4000, `samples ${n}`);
    assert.ok(worstS < 0.6, `s error ${worstS}`);
    assert.ok(worstLat < 0.6, `lateral/vertical error ${worstLat}`);
  });

  test(`${id}: project at 50 m per step and after a teleport (no hint)`, () => {
    const f = {}, out = { branch: -1 };
    let last = 0;
    for (let s = 0; s < L - 60; s += 50) {
      lay.frameAt(s, f); lay.project(f.pos, last, out); last = out.s;
      let ds = Math.abs(out.s - s); ds = Math.min(ds, L - ds);
      if (out.branch < 0) assert.ok(ds < 0.6, `step 50 m at s=${s}: got ${out.s}`);
    }
    const o2 = {}; lay.frameAt(L * 0.37, f); lay.project(f.pos, null, o2);
    if (o2.branch < 0) assert.ok(Math.abs(o2.s - L * 0.37) < 0.6);
    lay.project(f.pos, NaN, o2); lay.project(f.pos, -L * 0.63, o2);   // negative hint (before the first line crossing) wraps
    assert.ok(Math.abs(o2.s - L * 0.37) < 0.6 || o2.branch >= 0);
  });

  test(`${id}: loop passes keep their own s (entry vs exit side of the crossing)`, () => {
    for (const k of Object.keys(lay.marks).filter((k) => k.endsWith('Entry') && lay.marks[k.slice(0, -5) + 'Exit'] != null)) {
      const a = lay.marks[k], b = lay.marks[k.slice(0, -5) + 'Exit'], f = {}, out = { branch: -1 };
      let last = a - 30;
      for (let s = a - 30; s < b + 30; s += 5) {
        lay.frameAt(s, f); lay.project(f.pos, last, out); last = out.s;
        assert.ok(Math.abs(out.s - s) < 0.6, `loop alias at s=${s} -> ${out.s}`);
      }
    }
  });

  test(`${id}: start grid sits inside the corridor on the deck`, () => {
    const g = lay.startGrid(8), out = {}, f = {};
    assert.equal(g.length, 8);
    g.forEach((slot, i) => {
      assert.equal(slot.slot, i);
      lay.project(slot.pos, null, out);
      lay.frameAt(out.s, f);
      assert.ok(Math.hypot(out.lateral / f.halfWidth, out.vertical / f.halfHeight) < 0.6, `slot ${i} corridor`);
      assert.ok(out.s > L - lay.startCfg.back || out.s < 1, `slot ${i} behind the line (s=${out.s})`);
      assert.ok(lay.groundHeight(slot.pos.x, slot.pos.z) < slot.pos.y - 3, `slot ${i} above the deck`);
      assert.ok(lay.groundHeight(slot.pos.x, slot.pos.z) > slot.pos.y - 12, `slot ${i} on the deck (not on the sea)`);
    });
    assert.ok(new Set(g.map((s) => s.pos.toArray().join())).size === 8);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(g[0].quat);
    lay.frameAt(0, f); assert.ok(fwd.dot(f.tangent) > 0.99, 'grid faces down the track');
  });

  test(`${id}: sectors strictly increasing, outside shortcut spans`, () => {
    const s = lay.sectors; assert.equal(s[0], 0); assert.ok(s.length >= 4);
    for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1]);
    for (const x of s) for (const b of lay.branches) assert.ok(x <= b.fromS || x >= b.toS, `sector ${x} inside branch span`);
    assert.ok(s[s.length - 1] < L);
  });

  test(`${id}: branches blend into the main path and report themselves`, () => {
    assert.ok(lay.branches.length >= 1);
    for (const b of lay.branches) {
      const fm = {}, fb = {};
      lay.frameAt(b.fromS, fm); b.frameAt(0, fb);
      assert.ok(fm.pos.distanceTo(fb.pos) < 1, `branch start gap ${fm.pos.distanceTo(fb.pos)}`);
      assert.ok(fm.tangent.dot(fb.tangent) > 0.85 && fm.up.dot(fb.up) > 0.95, 'start tangent/up continuity');
      lay.frameAt(b.toS, fm); b.frameAt(b.length, fb);
      assert.ok(fm.pos.distanceTo(fb.pos) < 1, `branch end gap ${fm.pos.distanceTo(fb.pos)}`);
      assert.ok(fm.tangent.dot(fb.tangent) > 0.85 && fm.up.dot(fb.up) > 0.95, 'end tangent/up continuity');
      assert.ok(b.length < b.span - 150, `shortcut saves distance (${b.span - b.length} m)`);
      assert.ok(b.length > b.span * 0.5 && b.halfWidth < 70);
      // flying the branch: project reports branch index and a monotonic s inside the span
      const out = { branch: -1 }; let last = b.fromS - 80, prevS = -1;
      const pos = new THREE.Vector3(); let seen = 0;
      for (let u = 0; u <= b.length; u += 6) {
        b.frameAt(u, fb); pos.copy(fb.pos).addScaledVector(fb.right, 5);
        lay.project(pos, last, out); last = out.s;
        if (u > 150 && u < b.length - 150) { assert.equal(out.branch, b.index, `u=${u}`); seen++; }
        // before the capture point (P-08: 130 m past the mouth) the racer is still read as main, and the branch curving away from the main line
        // makes its main-path s wobble by a couple of metres; once captured, s must be monotonic to 1 m
        if (out.branch === b.index) { assert.ok(out.s >= prevS - 1, `s monotonic on branch (${out.s} < ${prevS} at u=${u})`); prevS = Math.max(prevS, out.s); }
        else assert.ok(Math.abs(out.s - b.sOf(u)) < 70, `uncaptured s ${out.s.toFixed(0)} strays from the branch's credited s ${b.sOf(u).toFixed(0)} at u=${u}`);
        assert.ok(out.s >= b.fromS - 40 && out.s <= b.toS + 40);
      }
      assert.ok(seen > 10);
      // main path in the same span is still reported as main
      lay.frameAt((b.fromS + b.toS) / 2, fm); out.branch = -1; lay.project(fm.pos, b.fromS + 100, out);
      assert.equal(out.branch, -1);
    }
  });

  test(`${id}: gates, boost rings, item clusters, hazards`, () => {
    for (let i = 1; i < lay.gates.length; i++) assert.ok(lay.gates[i].s > lay.gates[i - 1].s);
    assert.ok(lay.gates.length >= 18);
    for (const g of lay.gates) { assert.ok(g.radius >= 24 && g.radius <= 60); assert.ok(g.pos.isVector3 && g.quat.isQuaternion); }
    assert.ok(lay.gates.some((g) => g.shortcut));
    assert.ok(lay.boostRings.length >= 6 && lay.boostRings.every((b) => b.power > 1 && b.duration > 0 && b.radius > 10));
    assert.equal(lay.itemBoxes.length % 4, 0); assert.ok(new Set(lay.itemBoxes.map((b) => b.cluster)).size === 5);
    assert.ok(lay.itemBoxes.every((b) => Number.isFinite(b.s) && b.pos.isVector3 && Number.isFinite(b.lateral)));
    assert.ok(lay.hazards.length >= 3 && lay.hazards.every((h) => h.radius > 0 && h.pos.isVector3));
    // everything sits inside its corridor
    const f = {}, out = {};
    for (const it of lay.itemBoxes) { lay.project(it.pos, it.s, out); lay.frameAt(out.s, f); assert.ok(Math.hypot(out.lateral / f.halfWidth, out.vertical / f.halfHeight) < 0.9, 'orb inside corridor'); }
  });

  test(`${id}: terrain never touches the flight corridor centre`, () => {
    const f = {};
    let minClear = Infinity, at = 0;
    for (let s = 0; s < L; s += 8) { lay.frameAt(s, f); for (const l of [-0.3, 0, 0.3]) { const p = f.pos.clone().addScaledVector(f.right, l * f.halfWidth); if (lay._onDeck(p.x, p.z)) continue; const c = p.y - lay.groundHeight(p.x, p.z); if (c < minClear) { minClear = c; at = s; } } }
    assert.ok(minClear > 12, `min clearance ${minClear.toFixed(1)} m at s=${at.toFixed(0)}`);
  });

  test(`${id}: aiHints are finite and braking is anticipated`, () => {
    const h = {};
    let capMin = Infinity;
    for (let s = -50; s < L + 50; s += 3) {
      lay.aiHints(s, h);
      assert.ok(Number.isFinite(h.lateral) && !Number.isNaN(h.speedCap) && h.speedCap > 30, `hint at ${s}: ${JSON.stringify(h)}`);
      const f = {}; lay.frameAt(s, f); assert.ok(Math.abs(h.lateral) <= f.halfWidth * 0.6, 'racing line inside corridor');
      capMin = Math.min(capMin, h.speedCap);
    }
    assert.ok(capMin > 55 && capMin < 130, `slowest corner cap ${capMin}`);
    const o = lay.aiHints(100); assert.ok('lateral' in o && 'speedCap' in o);
  });

  test(`${id}: aiHints racing line clears every main-path hazard and slows before it`, () => {
    const h = {}, f = {}, h0 = {}, noHaz = new CourseLayout({ ...def, hazards: [] });
    for (const hz of lay.hazards) {
      if (hz.branch >= 0) continue;
      lay.path.frameAt(hz.s, f);
      const hl = (hz.home.x - f.pos.x) * f.right.x + (hz.home.y - f.pos.y) * f.right.y + (hz.home.z - f.pos.z) * f.right.z;
      lay.aiHints(hz.s, h);
      assert.ok(Math.abs(h.lateral - hl) >= hz.radius + 11, `line ${h.lateral.toFixed(1)} vs hazard ${hl.toFixed(1)} r=${hz.radius} at s=${hz.s.toFixed(0)}`);
      lay.aiHints(hz.s - 60, h); noHaz.aiHints(hz.s - 60, h0);
      if (Number.isFinite(h0.speedCap)) assert.ok(h.speedCap <= h0.speedCap * 0.97, `cap ${h.speedCap} vs hazard-free ${h0.speedCap} at s=${hz.s.toFixed(0)}`);
    }
  });

  test(`${id}: inner 62% of the corridor ellipse is >= 8 m above terrain and water (main path, decks excluded)`, () => {
    // Excluded spans (explicit): the launch deck ahead of the start line and the deck run-in behind it (the platform itself is the "ground" there);
    // shortcut branches are not sampled (they are tubes through terrain by design).
    const c0 = lay.startCfg, skipA = c0.fwd + 40, skipB = L - c0.back - 40, f = {}, bad = [];
    const wl = def.waterLevel;
    for (let s = 0; s < L; s += 10) {
      if (s <= skipA || s >= skipB) continue;
      lay.frameAt(s, f);
      for (let a = -0.62; a <= 0.6201; a += 0.124) for (let b = -0.62; b <= 0.6201; b += 0.124) {
        if (Math.hypot(a, b) > 0.62) continue;
        const lx = a * f.halfWidth, ly = b * f.halfHeight;
        const x = f.pos.x + f.right.x * lx + f.up.x * ly, y = f.pos.y + f.right.y * lx + f.up.y * ly, z = f.pos.z + f.right.z * lx + f.up.z * ly;
        let c = y - lay.groundHeight(x, z); if (wl != null) c = Math.min(c, y - wl);
        if (c < 8) { bad.push(`s=${s} (${a.toFixed(2)},${b.toFixed(2)}) clearance ${c.toFixed(1)}`); break; }
      }
    }
    assert.equal(bad.length, 0, `${bad.length} samples under 8 m: ${bad.slice(0, 6).join('; ')}`);
  });

  test(`${id}: every shortcut carries boost rings inside its tube, ordered inside the credited main span`, () => {
    const f = {};
    lay.branches.forEach((b, bi) => {
      const rings = lay.boostRings.filter((r) => r.branch === bi);
      assert.ok(rings.length >= 5, `branch ${bi} has ${rings.length} boost rings`);
      for (const r of rings) {
        assert.ok(r.s > b.fromS && r.s < b.toS, `ring s=${r.s.toFixed(0)} outside span ${b.fromS.toFixed(0)}..${b.toS.toFixed(0)}`);
        let best = 1e9;
        for (let uu = 0; uu < b.length; uu += 5) { b.frameAt(uu, f); best = Math.min(best, Math.hypot(f.pos.x - r.pos.x, f.pos.y - r.pos.y, f.pos.z - r.pos.z)); }
        assert.ok(best < Math.min(b.halfWidth, b.halfHeight) * 0.6, `ring ${best.toFixed(1)} m off the branch axis`);
      }
    });
  });

  test(`${id}: a racer flying the main line through a junction is never captured; one on the branch axis past the mouth is`, () => {
    const f = {}, p = new THREE.Vector3(), out = { branch: -1 };
    lay.branches.forEach((b, bi) => {
      for (const lat of [-0.5, -0.25, 0, 0.25, 0.5]) {
        out.branch = -1;
        for (let s = b.fromS - 80; s <= b.toS + 80; s += 5) {
          lay.frameAt(s, f); p.copy(f.pos).addScaledVector(f.right, lat * f.halfWidth);
          lay.project(p, s, out);
          assert.equal(out.branch, -1, `main line lat ${lat} captured by branch ${bi} at s=${s.toFixed(0)}`);
        }
      }
      out.branch = -1;
      for (let u = b.blend + 80; u < b.length * 0.35; u += 5) {
        b.frameAt(u, f); p.copy(f.pos);
        lay.project(p, b.sOf(u), out);
      }
      assert.equal(out.branch, bi, 'a racer flying down the branch axis is captured');
    });
  });

  test(`${id}: junction blend: the branch is the main line for its first and last blend metres, credit is identity there (E-18, mutation C2)`, () => {
    const fm = {}, fb = {};
    for (const b of lay.branches) {
      assert.ok(b.blend >= 50, `junction blend ${b.blend} m`);
      for (let u = 0; u <= b.blend - 5; u += 5) {
        const geo = u <= b.blend / 2;
        b.frameAt(u, fb); lay.frameAt(b.fromS + u, fm);
        assert.ok(!geo || fm.pos.distanceTo(fb.pos) < 8, `start blend: branch ${fm.pos.distanceTo(fb.pos).toFixed(1)} m off the main line at u=${u}`);
        assert.ok(Math.abs(b.sOf(u) - (b.fromS + u)) < 1e-6, 'credit is identity in the start blend');
        b.frameAt(b.length - u, fb); lay.frameAt(b.toS - u, fm);
        assert.ok(!geo || fm.pos.distanceTo(fb.pos) < 8, `end blend: branch ${fm.pos.distanceTo(fb.pos).toFixed(1)} m off the main line at ${u} m from the end`);
        assert.ok(Math.abs(b.sOf(b.length - u) - (b.toS - u)) < 1e-6, 'credit is identity in the end blend');
      }
      let prev = -1;
      for (let u = 0; u <= b.length; u += 4) { const s = b.sOf(u); assert.ok(s >= prev, 'credit is non-decreasing'); prev = s; }
    }
  });

  test(`${id}: a racer scraping the branch tube wall stays on the branch (hysteresis, E-18, mutation C1)`, () => {
    const f = {}, fm2 = {}, p = new THREE.Vector3(), out = { branch: -1 };
    for (const b of lay.branches) {
      out.branch = -1;
      let checked = 0;
      for (let u = b.enter; u < b.length - b.blend - 20; u += 5) {   // capture on the axis, then drift out to 1.7 tube radii (e between 1.3 and 2.2)
        b.frameAt(u, f);
        const outside = u > b.length * 0.3 && u < b.length * 0.7;
        p.copy(f.pos); if (outside) p.addScaledVector(f.right, 1.7 * f.halfWidth);
        lay.project(p, b.sOf(u), out);
        if (outside) { lay.frameAt(b.sOf(u), fm2); if (p.distanceTo(fm2.pos) > 1.7 * f.halfWidth + 20) { assert.equal(out.branch, b.index, `dropped to main while scraping at u=${u}`); checked++; } }
      }
      assert.ok(checked > 10, `only ${checked} scrape samples were far enough from the main line to judge`);
    }
  });

  test(`${id}: an open path honours the projection hint (a doubling-back path is tracked on its own leg, E-18)`, () => {
    const pts = [[0, 50, 0], [100, 50, 0], [200, 50, 0], [260, 50, 10], [200, 50, 20], [100, 50, 20], [0, 50, 20]].map((p) => ({ p }));
    const path = new PathData(pts, { closed: false, ds: 2.5, hw: 30, hh: 30 });
    const pos = new THREE.Vector3(100, 50, 13), a = {}, b = {};      // 13 m from leg one, 7 m from leg two
    path.project(pos, null, a);
    path.project(pos, 100, b, 40);
    assert.ok(a.s > path.length / 2, `full scan finds the nearer leg two (s=${a.s.toFixed(0)})`);
    assert.ok(Math.abs(b.s - 100) < 30, `hinted projection stays on leg one (s=${b.s.toFixed(0)})`);
  });

  test(`${id}: baked ground height matches the analytic function within 0.5 m on a sampled grid (E-15)`, () => {
    const f = {}; let max = 0, n = 0;
    for (let s = 0; s < L; s += 9) {
      lay.frameAt(s, f);
      for (let a = -1.6; a <= 1.6; a += 0.4) {
        const x = f.pos.x + f.right.x * a * f.halfWidth + (s % 7) * 0.61, z = f.pos.z + f.right.z * a * f.halfWidth + (s % 5) * 0.43;
        if (lay._onDeck(x, z)) continue;
        max = Math.max(max, Math.abs(lay.groundHeight(x, z) - lay.heightFn(x, z))); n++;
      }
    }
    assert.ok(n > 500);
    assert.ok(max <= 0.5, `max baked-vs-analytic error ${max.toFixed(2)} m`);
    if (def.bakeCell) assert.ok(lay._bakeTiles.size > 20, 'the bake was actually used');
  });

  test(`${id}: collide: ground, hazard, wall; clear air returns false`, () => {
    const f = {}, p = new THREE.Vector3(), out = {}, proj = { branch: -1 };
    lay.frameAt(L * 0.3, f);
    p.copy(f.pos); lay.project(p, L * 0.3, proj);
    assert.equal(lay.collide(p, 4, proj, out), false);
    p.copy(f.pos).addScaledVector(f.right, f.halfWidth * 1.4); lay.project(p, L * 0.3, proj);
    assert.equal(lay.collide(p, 4, proj, out), true); assert.equal(out.kind, 'wall'); assert.ok(out.soft && out.depth > 0);
    assert.ok(out.normal.dot(f.right) < 0, 'wall normal points back toward the corridor');
    const h = lay.hazards[0]; p.copy(h.pos); lay.project(p, h.s, proj);
    assert.equal(lay.collide(p, 4, proj, out), true); assert.equal(out.kind, 'hazard');
    p.set(5000, -70, 5000); assert.equal(lay.collide(p, 4, null, out), true); assert.equal(out.kind, 'ground'); assert.ok(out.depth > 0);
  });

  test(`${id}: minimap / previewCourse`, () => {
    const m = lay.minimap; assert.ok(m.pts.length > 100 && m.pts.every(Number.isFinite) && m.bounds.maxX > m.bounds.minX);
    assert.ok(m.branches.length >= 1 && m.branches[0].pts.length > 10);
    const pc = previewCourse(id); assert.ok(pc.pts.length > 100 && pc.bounds && pc.branches.length >= 1);
  });

  test(`${id}: build time of the logic layer`, () => {
    const t = performance.now(); new CourseLayout(def); const ms = performance.now() - t;
    assert.ok(ms < 800, `layout build ${ms.toFixed(0)} ms`);
  });
}
