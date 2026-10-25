// Numeric assertions for a Track. Imported by view.html; run via dev/tests.cjs.
export function runChecks(H) {
  const { track, THREE, renderer, scene, camera } = H;
  const res = [];
  const check = (name, ok, info = "") => res.push({ name, ok: !!ok, info });
  const L = track.length, hw = track.def.width / 2;
  const wrap = (d) => { d %= L; if (d > L / 2) d -= L; if (d < -L / 2) d += L; return d; };
  const V = THREE.Vector3;

  // 1. sample/locate round trip (hinted, global, offset hints)
  {
    let worstS = 0, worstLat = 0, worstG = 0, n = 0;
    for (let s = 0; s < L; s += 2.3) for (const lat of [-0.9, -0.5, 0, 0.5, 0.9]) {
      const sp = track.sample(s), p = new V(sp.pos.x + sp.right.x * lat * hw, 0, sp.pos.z + sp.right.z * lat * hw);
      const a = track.locate(p, s + (n % 7 - 3) * 2.5);
      worstS = Math.max(worstS, Math.abs(wrap(a.s - s))); worstLat = Math.max(worstLat, Math.abs(a.lateral - lat * hw));
      const g = track.locate(p); worstG = Math.max(worstG, Math.abs(wrap(g.s - s)));
      n++;
    }
    check("locate(hinted) recovers s", worstS < 0.3, `worst ds=${worstS.toFixed(3)}`);
    check("locate recovers lateral", worstLat < 0.05, `worst dlat=${worstLat.toFixed(3)}`);
    check("locate(global) recovers s", worstG < 0.3, `worst ds=${worstG.toFixed(3)}`);
  }
  // 2. surfaces
  {
    const sp = track.sample(L * 0.5), mk = (lat) => new V(sp.pos.x + sp.right.x * lat, 0, sp.pos.z + sp.right.z * lat);
    const r0 = track.locate(mk(0), L * 0.5), rg = track.locate(mk(track.sample(L * 0.5).wallDist - 1), L * 0.5);
    check("centre is road/onRoad", r0.onRoad && (r0.surface === "road" || r0.surface === "boost"), r0.surface);
    check("near-wall is grass/offroad", !rg.onRoad && rg.surface === "grass", rg.surface);
    check("wallDist > halfWidth + 3", sp.wallDist > hw + 3, `${sp.wallDist.toFixed(1)} vs hw ${hw}`);
  }
  // 3. wrap + closed loop
  {
    const a = track.sample(0).pos.clone(), b = track.sample(L).pos.clone(), c = track.sample(L - 1.5).pos.clone(), t0 = track.sample(0).tangent.clone(), t1 = track.sample(L - 0.5).tangent.clone();
    check("sample(L) == sample(0)", a.distanceTo(b) < 0.01);
    check("loop closes (gap to previous sample < 2m)", a.distanceTo(c) < 2.0, `gap ${a.distanceTo(c).toFixed(2)}`);
    check("tangent continuous across s=0", t0.dot(t1) > 0.9995, `dot ${t0.dot(t1).toFixed(5)}`);
    check("sample(-5) wraps", track.sample(-5).pos.distanceTo(track.sample(L - 5).pos) < 0.01);
    let maxStep = 0, minDot = 1; let prev = track.sample(0).pos.clone(), pt = track.sample(0).tangent.clone();
    for (let s = 1; s <= L; s += 1) { const sp = track.sample(s); maxStep = Math.max(maxStep, sp.pos.distanceTo(prev)); minDot = Math.min(minDot, sp.tangent.dot(pt)); prev.copy(sp.pos); pt.copy(sp.tangent); }
    check("1 m steps are ~1 m long (arc-length param)", maxStep < 1.02 && maxStep > 0.9, `max step ${maxStep.toFixed(3)}`);
    check("tangent smooth (no kinks > 6deg per m)", minDot > Math.cos(0.105), `min dot ${minDot.toFixed(4)}`);
  }
  // 4. no self overlap: any two centreline points that are close in space must be close along the track
  {
    const N = Math.round(L / 2), pts = []; for (let i = 0; i < N; i++) pts.push(track.sample(i * L / N).pos.clone());
    const need = 2 * track.sample(0).wallDist + 4; let worst = 1e9, w = null;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const arc = Math.min(j - i, N - (j - i)) * L / N; const d = pts[i].distanceTo(pts[j]);
      if (d < need && arc > 2.4 * d + 12) { if (d < worst) { worst = d; w = [i, j]; } }
    }
    check("road never overlaps itself (walls clear of other legs)", worst === 1e9, w ? `d=${worst.toFixed(1)} need ${need.toFixed(1)} at s=${(w[0] * L / N).toFixed(0)}/${(w[1] * L / N).toFixed(0)}` : `need clearance ${need.toFixed(1)}`);
    // global min separation of non-adjacent legs, for the record
    let mn = 1e9; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const arc = Math.min(j - i, N - (j - i)) * L / N; if (arc > 150) mn = Math.min(mn, pts[i].distanceTo(pts[j])); }
    check("min separation of distant legs > 2*wallDist", mn > 2 * track.sample(0).wallDist + 4, `min ${mn.toFixed(1)}`);
  }
  // 5. aiLine
  {
    let maxAbs = 0, maxSlope = 0, off = 0, prev = track.aiLine(0);
    for (let s = 0; s < L; s += 1) { const a = track.aiLine(s); maxAbs = Math.max(maxAbs, Math.abs(a)); maxSlope = Math.max(maxSlope, Math.abs(a - prev)); prev = a; const sp = track.sample(s), p = new V(sp.pos.x + sp.right.x * a, 0, sp.pos.z + sp.right.z * a); if (!track.locate(p, s).onRoad) off++; }
    check("aiLine within road margin (<= hw-2.5)", maxAbs <= hw - 2.5 && off === 0, `max |lat| ${maxAbs.toFixed(2)} (hw ${hw}), off-road pts ${off}`);
    check("aiLine smooth (<= 0.25 m lateral per m)", maxSlope <= 0.25, `max slope ${maxSlope.toFixed(3)}`);
    // aiLine path is shorter than the centreline (cuts corners)
    let lc = 0, la = 0, pc = track.sample(0).pos.clone(), pa = null;
    for (let s = 0; s <= L; s += 1) { const sp = track.sample(s), q = new V(sp.pos.x + sp.right.x * track.aiLine(s), 0, sp.pos.z + sp.right.z * track.aiLine(s)); if (pa) la += q.distanceTo(pa); pa = q; if (s) lc += sp.pos.distanceTo(pc); pc = sp.pos.clone(); }
    check("aiLine shorter than centreline", la < lc, `${la.toFixed(0)} vs ${lc.toFixed(0)}`);
  }
  // 6. curvature
  {
    let bad = 0, maxK = 0; for (let s = 0; s < L; s += 4) { const k = track.curvature(s); maxK = Math.max(maxK, Math.abs(k)); const a = track.sample(s - 3).tangent.clone(), b = track.sample(s + 3).tangent.clone(); const cross = a.x * b.z - a.z * b.x; /* +ve cross = turning toward +x..: heading east->south is right turn: cross = tx*tz' - tz*tx' */ const turnRight = cross > 0; if (Math.abs(k) > 0.004 && (k > 0) !== turnRight) bad++; }
    check("curvature sign (+ve = right) matches geometry", bad === 0, `${bad} mismatches; max |k|=${maxK.toFixed(4)} (min radius ${(1 / maxK).toFixed(1)} m)`);
    check("min corner radius >= 15 m", 1 / maxK >= 15);
  }
  // 7. grid
  {
    const slots = []; for (let i = 0; i < 8; i++) slots.push(track.grid(i));
    let ok = true, why = ""; const info = [];
    slots.forEach((g, i) => {
      const r = track.locate(g.pos, 0), sp = track.sample(r.s), want = Math.atan2(sp.tangent.x, sp.tangent.z);
      let dh = Math.atan2(Math.sin(g.heading - want), Math.cos(g.heading - want));
      if (!r.onRoad || Math.abs(r.lateral) > hw - 1.5) { ok = false; why += ` slot${i} lat ${r.lateral.toFixed(1)}`; }
      if (Math.abs(dh) > 0.03) { ok = false; why += ` slot${i} heading off ${dh.toFixed(3)}`; }
      const behind = wrap(r.s - 0); if (!(behind < 0 && behind > -45)) { ok = false; why += ` slot${i} s=${behind.toFixed(1)}`; }
      info.push(behind.toFixed(1));
    });
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (slots[i].pos.distanceTo(slots[j].pos) < 3.2) { ok = false; why += ` overlap ${i}/${j}`; }
    check("grid: 8 slots on road, facing forward, behind line, separated", ok, why || `s: ${info.join(", ")}`);
    // straight behind the line (all slots): curvature small
    let k = 0; for (let s = -45; s <= 0; s += 3) k = Math.max(k, Math.abs(track.curvature(s)));
    check("grid area is straight", k < 0.003, `max |k| ${k.toFixed(4)}`);
    // pole position is ahead of slot 1 and 2
    check("pole is closest to the line", wrap(track.locate(slots[0].pos, 0).s) > wrap(track.locate(slots[1].pos, 0).s) && wrap(track.locate(slots[0].pos, 0).s) > wrap(track.locate(slots[2].pos, 0).s));
  }
  // 8. item boxes
  {
    const ib = track.itemBoxes; let bad = 0; const clusters = new Map();
    for (const b of ib) { const r = track.locate(b.pos, b.s); if (!r.onRoad || Math.abs(r.lateral) > hw - 1.8 || Math.abs(wrap(r.s - b.s)) > 0.3) bad++; clusters.set(b.s.toFixed(2), (clusters.get(b.s.toFixed(2)) || 0) + 1); }
    const sizes = [...clusters.values()];
    check("itemBoxes on road & s consistent", bad === 0 && ib.length > 0, `bad ${bad}/${ib.length}`);
    check("4-6 clusters of 3-5 boxes", clusters.size >= 4 && clusters.size <= 6 && sizes.every((n) => n >= 3 && n <= 5), `clusters ${clusters.size} sizes ${sizes.join(",")}`);
    const ss = [...clusters.keys()].map(Number); let minGap = 1e9; for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) minGap = Math.min(minGap, Math.abs(wrap(ss[i] - ss[j])));
    check("clusters spaced > 100 m apart and none within grid zone", minGap > 100 && ss.every((s) => s > 40 && s < L - 40), `min gap ${minGap.toFixed(0)}`);
  }
  // 9. boost pads
  {
    const pads = track.boostPads; let bad = 0, offCentre = 0;
    for (const p of pads) {
      for (let f = -0.45; f <= 0.46; f += 0.3) for (const lf of [-0.45, 0, 0.45]) {
        const sp = track.sample(p.s + f * p.length), lat = p.lateral + lf * p.width, pos = new V(sp.pos.x + sp.right.x * lat, 0, sp.pos.z + sp.right.z * lat);
        const r = track.locate(pos, p.s); if (!r.boost || !r.onRoad) bad++;
      }
      if (Math.abs(p.lateral) + p.width / 2 > hw - 0.5) offCentre++;
      const out = track.sample(p.s + p.length * 0.9), pos2 = new V(out.pos.x + out.right.x * p.lateral, 0, out.pos.z + out.right.z * p.lateral); if (track.locate(pos2, p.s).boost) bad++;
      if (Math.abs(track.curvature(p.s)) > 0.007) bad++;
    }
    check("boost pads: locate().boost true on pad only, on road, on straights", pads.length >= 2 && bad === 0 && offCentre === 0, `${pads.length} pads, bad ${bad}, offEdge ${offCentre}`);
  }
  // 10. structure
  {
    check("minimap ~160 pts + bounds", track.minimap.length >= 150 && track.bounds.maxX > track.bounds.minX);
    check("lap length 900..1550 m", L >= 900 && L <= 1550, `${L.toFixed(0)} m`);
    check("fields present", ["id", "name", "laps", "length", "def", "group", "setupScene", "sample", "locate", "grid", "itemBoxes", "boostPads", "aiLine", "curvature", "minimap", "bounds", "update"].every((k) => k in track));
  }
  // 11. driving a box around the aiLine at 28 m/s: always on road, lap sane
  {
    let s = 0, off = 0, t = 0, steps = 0; const dt = 1 / 60; let minSurface = {};
    const p = new V(); let lastS = 0; let travelled = 0; let hint = 0; const path = new V();
    while (travelled < L && steps < 20000) {
      const sp = track.sample(s), lat = track.aiLine(s); p.set(sp.pos.x + sp.right.x * lat, 0, sp.pos.z + sp.right.z * lat);
      const r = track.locate(p, hint); hint = r.s; if (!r.onRoad) off++; minSurface[r.surface] = (minSurface[r.surface] || 0) + 1;
      const v = 28 / (1 + 40 * Math.abs(track.curvature(s))); s += v * dt; travelled += v * dt; t += dt; steps++; void lastS; void path;
    }
    check("box driven along aiLine stays on road for a lap", off === 0 && travelled >= L, `off ${off}, lap time ${t.toFixed(1)}s, surfaces ${JSON.stringify(minSurface)}`);
    check("plausible lap time 45..80 s (curvature-limited speed)", t > 40 && t < 85, `${t.toFixed(1)} s`);
  }
  // 12. locate() performance
  {
    const pts = []; for (let i = 0; i < 300; i++) { const sp = track.sample((i * 7.7) % L); pts.push(new V(sp.pos.x + sp.right.x * 3, 0, sp.pos.z + sp.right.z * 3)); }
    const t0 = performance.now(); let acc = 0; for (let rep = 0; rep < 100; rep++) for (let i = 0; i < 300; i++) acc += track.locate(pts[i], (i * 7.7) % L).s; const dtm = performance.now() - t0;
    const per = dtm / 30000; check("locate() < 20 us per call (hinted)", per < 0.02, `${(per * 1000).toFixed(2)} us`);
    const t1 = performance.now(); for (let i = 0; i < 300; i++) acc += track.locate(pts[i]).s; const pg = (performance.now() - t1) / 300; check("locate() global < 0.2 ms", pg < 0.2, `${(pg * 1000).toFixed(1)} us`);
    void acc;
  }
  // 13. render stats
  {
    renderer.info.reset(); H.view({ mode: "chase", s: 40 }); const c1 = renderer.info.render.calls, tri1 = renderer.info.render.triangles;
    renderer.info.reset(); H.view({ mode: "top" }); const c2 = renderer.info.render.calls;
    check("draw calls < 400 (track only)", c1 < 400 && c2 < 400, `chase ${c1}, top ${c2}; tris ${tri1}`);
    check("geometry memory sane", renderer.info.memory.geometries < 120 && renderer.info.memory.textures < 40, `geoms ${renderer.info.memory.geometries} tex ${renderer.info.memory.textures}`);
    const t0 = performance.now(); for (let i = 0; i < 20; i++) H.render(1 / 60); check("track.update() runs", true, `render x20 ${(performance.now() - t0).toFixed(0)} ms (swiftshader)`);
  }
  check("no console errors", H.errors.length === 0, H.errors.join(" | "));
  return res;
}
