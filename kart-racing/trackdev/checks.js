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
      const sp = track.sample(s), p = new V(sp.pos.x + sp.right.x * lat * hw, sp.pos.y, sp.pos.z + sp.right.z * lat * hw);
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
    const sp = track.sample(L * 0.5), mk = (lat) => new V(sp.pos.x + sp.right.x * lat, sp.pos.y, sp.pos.z + sp.right.z * lat);
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
      if (d < need && arc > 2.4 * d + 12 && Math.abs(pts[i].y - pts[j].y) < 4) { if (d < worst) { worst = d; w = [i, j]; } }
    }
    check("road never overlaps itself at the same height (walls clear of other legs)", worst === 1e9, w ? `d=${worst.toFixed(1)} need ${need.toFixed(1)} at s=${(w[0] * L / N).toFixed(0)}/${(w[1] * L / N).toFixed(0)}` : `need clearance ${need.toFixed(1)}`);
    // global min separation of non-adjacent legs, for the record
    let mn = 1e9; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const arc = Math.min(j - i, N - (j - i)) * L / N; if (arc > 150 && Math.abs(pts[i].y - pts[j].y) < 4) mn = Math.min(mn, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)); }
    check("min separation of distant legs > 2*wallDist", mn > 2 * track.sample(0).wallDist + 4, `min ${mn.toFixed(1)}`);
  }
  // 5. aiLine
  {
    let maxAbs = 0, maxSlope = 0, off = 0, prev = track.aiLine(0);
    for (let s = 0; s < L; s += 1) { const a = track.aiLine(s); maxAbs = Math.max(maxAbs, Math.abs(a)); maxSlope = Math.max(maxSlope, Math.abs(a - prev)); prev = a; const sp = track.sample(s), p = new V(sp.pos.x + sp.right.x * a, sp.pos.y, sp.pos.z + sp.right.z * a); if (!track.locate(p, s).onRoad) off++; }
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
      const r = track.locate(g.pos, 0), sp = track.sample(r.s); if (Math.abs(g.pos.y - sp.pos.y) > 0.05) { ok = false; why += ` slot${i} y ${g.pos.y.toFixed(2)} vs ${sp.pos.y.toFixed(2)}`; }
      const want = Math.atan2(sp.tangent.x, sp.tangent.z);
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
    for (const b of ib) { const r = track.locate(b.pos, b.s); if (Math.abs(b.pos.y - r.y - 1.2) > 0.25) bad++; if (!r.onRoad || Math.abs(r.lateral) > hw - 1.8 || Math.abs(wrap(r.s - b.s)) > 0.3) bad++; clusters.set(b.s.toFixed(2), (clusters.get(b.s.toFixed(2)) || 0) + 1); }
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
        const sp = track.sample(p.s + f * p.length), lat = p.lateral + lf * p.width, pos = new V(sp.pos.x + sp.right.x * lat, sp.pos.y, sp.pos.z + sp.right.z * lat);
        const r = track.locate(pos, p.s); if (!r.boost || !r.onRoad) bad++;
      }
      if (Math.abs(p.lateral) + p.width / 2 > hw - 0.5) offCentre++;
      const out = track.sample(p.s + p.length * 0.9), pos2 = new V(out.pos.x + out.right.x * p.lateral, out.pos.y, out.pos.z + out.right.z * p.lateral); if (track.locate(pos2, p.s).boost) bad++;
      if (Math.abs(track.curvature(p.s)) > 0.007) bad++;
    }
    check("boost pads: locate().boost true on pad only, on road, on straights", pads.length >= 2 && bad === 0 && offCentre === 0, `${pads.length} pads, bad ${bad}, offEdge ${offCentre}`);
  }
  // 10. structure
  {
    check("minimap ~160 pts + bounds", track.minimap.length >= 150 && track.bounds.maxX > track.bounds.minX);
    check("lap length 1800..2400 m", L >= 1800 && L <= 2400, `${L.toFixed(0)} m`);
    check("fields present", ["id", "name", "laps", "length", "def", "group", "setupScene", "sample", "locate", "grid", "itemBoxes", "boostPads", "aiLine", "curvature", "minimap", "bounds", "update"].every((k) => k in track));
  }
  // 11. driving a box around the aiLine at 28 m/s: always on road, lap sane
  {
    let s = 0, off = 0, t = 0, steps = 0; const dt = 1 / 60; let minSurface = {};
    const p = new V(); let lastS = 0; let travelled = 0; let hint = 0; const path = new V();
    while (travelled < L && steps < 20000) {
      const sp = track.sample(s), lat = track.aiLine(s); p.set(sp.pos.x + sp.right.x * lat, 0, sp.pos.z + sp.right.z * lat);
      p.y = sp.pos.y; const r = track.locate(p, hint); hint = r.s; if (!r.onRoad) off++; minSurface[r.surface] = (minSurface[r.surface] || 0) + 1;
      const v = Math.min(40, Math.sqrt(26 / Math.max(1e-4, Math.abs(track.curvature(s))))); s += v * dt; travelled += v * dt; t += dt; steps++; void lastS; void path;
    }
    check("box driven along aiLine stays on road for a lap", off === 0 && travelled >= L, `off ${off}, lap time ${t.toFixed(1)}s, surfaces ${JSON.stringify(minSurface)}`);
    check("race-pace lap time 48..75 s (40 m/s cap, 26 m/s^2 lateral)", t > 48 && t < 75, `${t.toFixed(1)} s`);
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
  // 14. elevation
  {
    let maxSl = 0, ymin = 1e9, ymax = -1e9, worstSl = 0; const N = Math.round(L / 1);
    for (let k = 0; k < N; k++) { const a = track.sample(k).pos.y, b = track.sample(k + 1).pos.y; maxSl = Math.max(maxSl, Math.abs(b - a)); ymin = Math.min(ymin, a); ymax = Math.max(ymax, a); }
    check("slope <= 12% everywhere", maxSl <= 0.12, `max ${(maxSl * 100).toFixed(1)}%`);
    check("total relief 8..20 m", ymax - ymin >= 8 && ymax - ymin <= 20, `${(ymax - ymin).toFixed(1)} m (${ymin.toFixed(1)}..${ymax.toFixed(1)})`);
    const a = track.sample(0), y0 = a.pos.y, t0 = a.tangent.clone(), yb = track.sample(L - 0.01).pos.y;
    check("height continuous across s=0", Math.abs(y0 - yb) < 0.01, `${y0.toFixed(3)} vs ${yb.toFixed(3)}`);
    let sl0 = 0; for (let s = -45; s <= 80; s += 5) sl0 = Math.max(sl0, Math.abs(track.sample(s).slope)); check("start/finish area flat-ish (< 3% slope, -45..+80 m)", sl0 < 0.03, `${(sl0 * 100).toFixed(1)}%`);
    // normal/slope fields
    const sp = track.sample(L * 0.3); check("sample().normal unit, consistent with slope", Math.abs(sp.normal.length() - 1) < 1e-6 && Math.abs(sp.normal.dot(sp.tangent) + sp.slope / Math.hypot(sp.slope, 1)) < 1e-3, `slope ${sp.slope.toFixed(3)}`);
    // vertical rejection
    const q = track.sample(L * 0.5), above = new V(q.pos.x, q.pos.y + 4.5, q.pos.z); check("locate: kart 4.5 m above surface is not onRoad", !track.locate(above, L * 0.5).onRoad);
    check("locate returns y at surface", Math.abs(track.locate(new V(q.pos.x, q.pos.y, q.pos.z), L * 0.5).y - q.pos.y) < 0.02);
  }
  // 15. crossings
  {
    const cr = track.crossings; const need = ["sunset-coast"].includes(track.id) ? 0 : 1;
    if (cr) {
      let minHead = 1e9, bad = 0, n = 0;
      for (const su of cr.upperS) {
        const up = track.sample(su).pos.clone(), upr = track.sample(su).right.clone();
        // find the lower leg point closest horizontally
        let best = 1e9, ls = 0; for (let s = 0; s < L; s += 1) { if (Math.abs(wrap(s - su)) < 120) continue; const p = track.sample(s).pos; const d = Math.hypot(p.x - up.x, p.z - up.z); if (d < best) { best = d; ls = s; } }
        if (best > 3) continue;
        const lo = track.sample(ls).pos.clone(); const head = up.y - lo.y - 1.4; minHead = Math.min(minHead, head);
        // legs near the deck centre: both karts located correctly with hints and without
        for (const off of [-4, 0, 4]) {
          const pu = new V(up.x + upr.x * off, up.y, up.z + upr.z * off), a = track.locate(pu, su); if (Math.abs(wrap(a.s - su)) > 3) bad++;
          const pl = new V(pu.x, lo.y, pu.z), b = track.locate(pl, ls); if (Math.abs(wrap(b.s - ls)) > 12) bad++;
          const ng = track.locate(pu); if (Math.abs(wrap(ng.s - su)) > 3) bad++;      // unhinted, 3D choice
          const nl = track.locate(new V(pu.x, lo.y, pu.z)); if (Math.abs(wrap(nl.s - ls)) > 12) bad++;
          if (b.y > lo.y + 1) bad++;
          n++;
        }
      }
      check("crossing: >= 6 m headroom under deck", minHead >= 6, `${minHead.toFixed(1)} m`);
      check("crossing: locate() never snaps between legs (hinted + 3D unhinted)", bad === 0, `${bad} bad of ${n * 4}`);
    }
    check("crossing present where required (neon, frostbite)", need === 0 || !!cr);
  }
  // 16. chevron boards: arrows point where the track turns, boards on the outside
  {
    const ch = track._ctx.chevrons || []; let bad = 0, wrongSide = 0;
    for (const c of ch) {
      const sp = track.sample(c.s); const k = track.curvature(c.s);
      if ((k > 0) !== (c.turn === "right")) bad++;
      // plane +x (arrow ">" points +u for right boards); u = (n.z, -n.x)
      const ux = c.nz, uz = -c.nx, rightX = sp.right.x, rightZ = sp.right.z;
      const arrow = c.turn === "right" ? 1 : -1;              // ">" on right boards, "<" on left boards
      const dirAlongRight = arrow * (ux * rightX + uz * rightZ);   // viewer-side direction of the arrow vs the track's right
      const want = c.turn === "right" ? 1 : -1;
      if (dirAlongRight * want < 0.5) bad++;
      // board lies on the outside of the bend
      const lat = (c.x - sp.pos.x) * sp.right.x + (c.z - sp.pos.z) * sp.right.z; if ((lat > 0) === (k > 0)) wrongSide++;
      // faces the oncoming driver: normal has a component against the travel direction
      if (c.nx * sp.tangent.x + c.nz * sp.tangent.z > -0.5) bad++;
    }
    check("chevrons: arrow direction == turn direction, outside of bend, face oncoming traffic", ch.length >= 4 && bad === 0 && wrongSide === 0, `${ch.length} boards, bad ${bad}, wrongSide ${wrongSide}`);
  }
  // 17. nothing solid intersects the road corridor: scenery instances, mountains, terrain embankments
  {
    const X = track._ctx, { px, pz, py, N } = X.C, wd = X.wallDist;
    const nd = (x, z) => { let d = 1e9; for (let i = 0; i < N; i++) { const dd = Math.hypot(x - px[i], z - pz[i]); if (dd < d) d = dd; } return d; };
    const skip = new Set(["tyres", "chevrons-left", "chevrons-right", "chevron-posts", "poles", "lamps", "light-pools", "shadows", "snowmen"]);
    const m = new THREE.Matrix4(), p = new V(), q = new THREE.Quaternion(), sc = new V(); let bad = 0, n = 0, worst = 1e9, wname = "";
    track.group.traverse((o) => {
      if (!o.isInstancedMesh || skip.has(o.name)) return;
      o.geometry.computeBoundingSphere(); const br = o.geometry.boundingSphere.radius;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m); m.decompose(p, q, sc); n++;
        const big = o.name === "mountains", rad = big ? Math.max(sc.x, sc.z) : Math.min(4, br * Math.max(sc.x, sc.y, sc.z) * 0.5);
        const margin = big ? 60 : 1.5, d = nd(p.x, p.z) - rad - wd;
        if (d < worst) { worst = d; wname = o.name; }
        if (d < margin) bad++;
      }
    });
    check("scenery/mountains never intersect the road corridor (incl. big peaks, 60 m margin)", bad === 0, `${n} instances, ${bad} too close, tightest ${worst.toFixed(1)} m (${wname})`);
    // heightfield: not above the road within the walls, and embankment slopes <= 55% beyond them
    let up = 0, steep = 0, cnt = 0;
    for (let i = 0; i < N; i += 3) for (const side of [-1, 1]) for (let l = 0; l <= wd + 40; l += 2.5) {
      const x = px[i] - X.C.tz[i] * l * side, z = pz[i] + X.C.tx[i] * l * side;
      if (nd(x, z) < l - 2) continue;       // another leg is closer
      const g = track.groundY(x, z); cnt++;
      if (l <= wd && g > py[i] + 0.06) up++;
      if (l > wd && g - py[i] > 0.6 + 0.55 * (l - wd)) steep++;
    }
    check("terrain never above the road inside the walls; embankment slope <= 55% (no solid peaks near the track)", up === 0 && steep === 0, `${cnt} probes, above-road ${up}, too steep ${steep}`);
  }
  check("no console errors", H.errors.length === 0, H.errors.join(" | "));
  return res;
}
