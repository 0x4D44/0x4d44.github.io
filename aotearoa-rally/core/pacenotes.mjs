// Co-driver pace notes from the curvature profile and the design's features.
// Severity: 1 = hairpin ... 6 = flat.  Pure, deterministic.

import { clamp } from "./mathx.mjs";

/** metres before `s` at which to voice a call at speed v (m/s). */
export const leadDistance = (v) => clamp(v * 2.6, 40, 220);
export const leadS = (note, v) => note.s - leadDistance(v);

const NUM = ["zero", "one", "two", "three", "four", "five", "six"];
const SURF_NAME = { 0: "gravel", 1: "hard pack", 2: "tarmac", 3: "mud", 4: "snow", 5: "pumice", 12: "water" };

/** severity grade from corner radius (m) */
export function gradeOfRadius(r) {
  return r <= 20 ? 1 : r <= 30 ? 2 : r <= 48 ? 3 : r <= 75 ? 4 : r <= 120 ? 5 : 6;
}

function makeLead(sNote) {
  const f = (v) => sNote - leadDistance(v);
  f.valueOf = () => 104; // default lead distance (m) so `s - note.lead` also works
  f.toString = () => "104";
  return f;
}

export function buildPacenotes(c, opts = {}) {
  const { N, ds, curv, lengthM, feats, surf } = c;
  const notes = [];
  const KIN = 1 / 330, KOUT = 1 / 420;
  const pt = (s) => {
    const f = clamp(s, 0, lengthM) / ds;
    const i = Math.min(N - 2, Math.floor(f)), t = f - i;
    return [c.px[i] + (c.px[i + 1] - c.px[i]) * t, c.pz[i] + (c.pz[i + 1] - c.pz[i]) * t];
  };

  // ---------------- corner runs
  const runs = [];
  let i = 0;
  while (i < N) {
    if (Math.abs(curv[i]) > KIN) {
      let j = i, sign = Math.sign(curv[i]);
      // extend while |k| stays above KOUT and sign unchanged
      while (j + 1 < N && Math.abs(curv[j + 1]) > KOUT && Math.sign(curv[j + 1]) === sign) j++;
      // back up to where it first exceeded KOUT
      let i0 = i;
      while (i0 > 0 && Math.abs(curv[i0 - 1]) > KOUT && Math.sign(curv[i0 - 1]) === sign) i0--;
      runs.push({ i0, i1: j, sign });
      i = j + 1;
    } else i++;
  }
  // merge runs of the same sign split only by a tiny dip
  const merged = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (prev && prev.sign === r.sign && (r.i0 - prev.i1) * ds < 14) prev.i1 = r.i1;
    else merged.push({ ...r });
  }
  for (const r of merged) {
    let kmax = 0, angle = 0;
    for (let q = r.i0; q <= r.i1; q++) {
      const k = Math.abs(curv[q]);
      if (k > kmax) kmax = k;
      angle += k * ds;
    }
    const len = (r.i1 - r.i0) * ds;
    // entry (first 40%) and exit (last 40%) peaks
    const span = Math.max(1, r.i1 - r.i0);
    let kIn = 0, kOut = 0;
    for (let q = r.i0; q <= r.i1; q++) {
      const u = (q - r.i0) / span;
      const k = Math.abs(curv[q]);
      if (u <= 0.4 && k > kIn) kIn = k;
      if (u >= 0.6 && k > kOut) kOut = k;
    }
    // grade on the measured minimum radius: circumcircle of centreline points 12 m apart over the call (the way a
    // driver would judge it), not the smoothed curvature, which sits a metre or two off at the grade boundaries
    let rmin = 1e9;
    for (let s = r.i0 * ds - 5; s <= r.i0 * ds + Math.max(ds, len) + 5 + 1e-9; s += 2) {
      const p1 = pt(s - 6), p2 = pt(s), p3 = pt(s + 6);
      const ax = p2[0] - p1[0], az = p2[1] - p1[1], bx = p3[0] - p2[0], bz = p3[1] - p2[1], cx = p3[0] - p1[0], cz = p3[1] - p1[1];
      const ar = Math.abs(ax * bz - az * bx) / 2;
      if (ar > 1e-6) rmin = Math.min(rmin, (Math.hypot(ax, az) * Math.hypot(bx, bz) * Math.hypot(cx, cz)) / (4 * ar));
    }
    const gApex = gradeOfRadius(rmin < 1e8 ? rmin : 1 / kmax);
    let gIn = gradeOfRadius(1 / Math.max(kIn, 1e-5)), gOut = gradeOfRadius(1 / Math.max(kOut, 1e-5));
    const mods = [];
    const hairpin = gApex === 1 && angle * 57.2958 >= 100;
    let sev = hairpin ? 1 : gApex;
    if (!hairpin) {
      if (gOut <= gIn - 1 && len > 20) mods.push("tightens");
      else if (gOut >= gIn + 1 && len > 20) mods.push("opens");
      if (mods.includes("tightens") && gApex < sev) { /* entry stays */ }
    }
    if (len > 95 && sev >= 3 && !hairpin) mods.push("long");
    else if (len < 24 && sev >= 3) mods.push("short");
    notes.push({
      s: r.i0 * ds, kind: hairpin ? "hairpin" : "corner", dir: r.sign > 0 ? "right" : "left", severity: sev,
      length: Math.max(ds, len), modifiers: mods, _prio: 4, _apex: gApex, _gIn: gIn, _angle: angle,
    });
  }

  // ---------------- feature notes
  for (const f of feats) {
    if (f.type === "crest") {
      notes.push({ s: Math.max(0, f.s - f.w * 0.9), kind: "crest", dir: null, severity: 6, length: f.w * 1.8, modifiers: f.H >= 1.25 ? ["caution", "blind"] : ["over_crest"], _prio: 2 });
    } else if (f.type === "jump") {
      notes.push({ s: Math.max(0, f.s - f.w * 1.1), kind: "jump", dir: null, severity: 6, length: f.w * 2.4, modifiers: ["caution", "jump", "blind"], _prio: 3 });
    } else if (f.type === "ford") {
      notes.push({ s: Math.max(0, f.s - f.len / 2 - 8), kind: "ford", dir: null, severity: 6, length: f.len + 12, modifiers: ["caution", "slippery"], _prio: 3 });
    } else if (f.type === "bridge") {
      notes.push({ s: Math.max(0, f.s - 10), kind: "bridge", dir: null, severity: 6, length: f.len + 14, modifiers: ["narrows", "caution"], _prio: 3 });
    } else if (f.type === "tunnel") {
      notes.push({ s: Math.max(0, f.s - 14), kind: "caution", dir: null, severity: 6, length: f.len + 14, modifiers: ["narrows", "caution"], _prio: 3, _cave: true });
    } else if (f.type === "cattlegrid") {
      notes.push({ s: Math.max(0, f.s - 6), kind: "caution", dir: null, severity: 6, length: 12, modifiers: ["bumpy", "caution"], _prio: 2, _grid: true });
    }
  }
  // surface changes (stable for 30 m+, water excluded)
  {
    let last = surf[0];
    for (let q = 1; q < N; q++) {
      if (surf[q] !== last && surf[q] !== 12 && last !== 12) {
        let ok = true;
        for (let k = q; k < Math.min(N, q + 15); k++) if (surf[k] !== surf[q]) { ok = false; break; }
        if (ok) {
          const to = surf[q];
          const slip = to === 3 || to === 4;
          notes.push({
            s: q * ds, kind: "surface", dir: null, severity: 6, length: 30, modifiers: slip ? ["slippery"] : [],
            _prio: 3, _from: last, _to: to,
          });
          last = to;
        }
      } else if (surf[q] !== 12) last = surf[q];
    }
  }
  // long straights between corners
  {
    let a = -1;
    const KFLAT = 1 / 400;
    for (let q = 0; q <= N; q++) {
      const flat = q < N && Math.abs(curv[q]) < KFLAT;
      if (flat && a < 0) a = q;
      if (!flat && a >= 0) {
        const len = (q - a) * ds;
        if (len >= 200 && a > 0) notes.push({ s: (a + 5) * ds, kind: "straight", dir: null, severity: 6, length: len, modifiers: [], _prio: 0 });
        a = -1;
      }
    }
  }
  notes.push({ s: 0, kind: "start", dir: null, severity: 6, length: 60, modifiers: [], _prio: 9 });
  notes.push({ s: lengthM, kind: "finish", dir: null, severity: 6, length: 0, modifiers: [], _prio: 9 });
  // distance calls: "200" after a feature when the next one is 150 m+ away
  {
    const sorted = [...notes].sort((a, b) => a.s - b.s);
    for (let q = 0; q < sorted.length - 1; q++) {
      const a = sorted[q], b = sorted[q + 1];
      if (b.kind === "straight" && b.s - (a.s + a.length) < 60) continue;
      const gap = b.s - (a.s + a.length);
      if (gap >= 150) {
        const d = Math.round(gap / 50) * 50;
        notes.push({ s: a.s + a.length + 8, kind: "distance", dir: null, severity: 6, length: 0, modifiers: [], _prio: 0.5, _say: String(d) });
      }
    }
  }

  // ---------------- "don't cut": a nocut feature within 90 m before (or inside) a corner
  const nocuts = feats.filter((f) => f.type === "nocut");
  for (const n of notes) {
    if (n.kind !== "corner" && n.kind !== "hairpin") continue;
    for (const f of nocuts) {
      if (f.s <= n.s + n.length && f.s >= n.s - 90) { if (!n.modifiers.includes("dont_cut")) n.modifiers.push("dont_cut"); }
    }
    if (n.severity <= 3 && n.kind === "corner" && n._angle * 57.3 > 70 && !n.modifiers.includes("dont_cut") && n.severity <= 2) n.modifiers.push("maybe");
  }

  // ---------------- sort, resolve conflicts (< 15 m)
  const isCorner = (x) => x.kind === "corner" || x.kind === "hairpin";
  let out = notes;
  for (let pass = 0; pass < 8; pass++) {
    out.sort((a, b) => a.s - b.s || b._prio - a._prio);
    let changed = false;
    const next = [];
    for (const n of out) {
      const prev = next[next.length - 1];
      if (prev && n.s - prev.s < 15 && !(isCorner(prev) && isCorner(n))) {
        changed = true;
        if (prev._prio === 9 && n._prio === 9) { next.push(n); continue; }
        if (n._prio > prev._prio && prev._prio < 9) { next[next.length - 1] = n; }       // higher priority replaces
        else if (n._prio >= 3) { n.s = Math.min(lengthM, prev.s + 15); next.push(n); }    // safety call: shift later
        // else: lower-priority note dropped
        continue;
      }
      next.push(n);
    }
    out = next;
    if (!changed) break;
  }
  out.sort((a, b) => a.s - b.s);

  // ---------------- chaining ("into")
  for (let k = 0; k < out.length - 1; k++) {
    const a = out[k], b = out[k + 1];
    const first = a.kind === "corner" || a.kind === "hairpin" || a.kind === "crest";
    const second = b.kind === "corner" || b.kind === "hairpin";
    if (first && second && b.s - (a.s + a.length) < 45) {
      if (!a.modifiers.includes("into")) a.modifiers.push("into");
    }
  }

  // ---------------- phrases
  const dirWord = (n) => (n.dir === "left" ? "left" : "right");
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const soloPhrase = (n) => {
    const m = n.modifiers;
    switch (n.kind) {
      case "hairpin": {
        const parts = [`hairpin ${dirWord(n)}`];
        if (m.includes("dont_cut")) parts.push("don't cut");
        return parts;
      }
      case "corner": {
        const parts = [`${dirWord(n)} ${NUM[n.severity]}`];
        if (m.includes("long")) parts.push("long");
        if (m.includes("short")) parts.push("short");
        if (m.includes("tightens")) { if (n._gIn > n.severity) parts[0] = `${dirWord(n)} ${NUM[n._gIn]}`; parts.push(n._gIn > n.severity ? `tightens to ${NUM[n.severity]}` : "tightens"); }
        if (m.includes("opens")) parts.push("opens");
        if (m.includes("dont_cut")) parts.push("don't cut");
        if (m.includes("maybe")) parts.push("maybe flat");
        return parts;
      }
      default: return [];
    }
  };
  const textOf = (n) => {
    const m = n.modifiers;
    if (n.kind === "hairpin") return `HAIRPIN ${n.dir === "left" ? "L" : "R"}${m.includes("dont_cut") ? " dont cut" : ""}`;
    if (n.kind === "corner") {
      let t = `${n.dir === "left" ? "L" : "R"}${n.severity}`;
      if (m.includes("long")) t += " long";
      if (m.includes("short")) t += " short";
      if (m.includes("tightens")) t += n._gIn > n.severity ? ` tightens ${n.severity}` : " tightens";
      if (m.includes("opens")) t += " opens";
      if (m.includes("dont_cut")) t += " dont cut";
      return t;
    }
    return "";
  };
  const iconOf = (n) => {
    if (n.kind === "hairpin") return n.dir === "left" ? "hairpin_l" : "hairpin_r";
    if (n.kind === "corner") return `${n.dir === "left" ? "L" : "R"}${n.severity}`;
    if (n.kind === "crest") return "crest";
    if (n.kind === "jump") return "jump";
    if (n.kind === "ford") return "ford";
    if (n.kind === "bridge") return "bridge";
    if (n.kind === "finish") return "finish";
    if (n.kind === "surface") return n.modifiers.includes("slippery") ? "slippery" : "straight";
    if (n.kind === "caution") return "caution";
    return "straight";
  };
  const roundTo = (v, q) => Math.round(v / q) * q;
  const words = (n) => {
    if (n < 100) return String(n);
    return String(n);
  };

  for (let k = 0; k < out.length; k++) {
    const n = out[k];
    n.icon = iconOf(n);
    n.text = textOf(n);
    n.speak = "";
    delete n._angle;
  }
  // build speech with chains of up to 3
  for (let k = 0; k < out.length; k++) {
    const n = out[k];
    if (n.chained) continue;
    if (n.kind === "corner" || n.kind === "hairpin" || n.kind === "crest") {
      const chain = [n];
      let q = k;
      while (out[q].modifiers.includes("into") && out[q + 1] && chain.length < 3 && (out[q + 1].kind === "corner" || out[q + 1].kind === "hairpin")) {
        q++;
        chain.push(out[q]);
      }
      const pieces = [];
      for (const cn of chain) {
        if (cn.kind === "crest") pieces.push(cn.modifiers.includes("blind") ? "crest, caution" : "over crest");
        else pieces.push(soloPhrase(cn).join(", "));
      }
      n.speak = cap(pieces.join(", into "));
      if (chain.length > 1) {
        n.text = chain.map((cn) => (cn.kind === "crest" ? "CREST" : textOf(cn))).join(" > ");
        for (let z = 1; z < chain.length; z++) { chain[z].chained = true; chain[z].speak = ""; }
      }
      if (n.kind === "crest") { if (chain.length === 1) n.text = n.modifiers.includes("blind") ? "CREST caution" : "CREST"; }
    }
  }
  for (const n of out) {
    switch (n.kind) {
      case "crest": if (!n.speak) { n.speak = n.modifiers.includes("blind") ? "Crest, caution" : "Over crest"; n.text = n.modifiers.includes("blind") ? "CREST caution" : "CREST"; } break;
      case "jump": n.speak = "Caution, jump"; n.text = "JUMP caution"; break;
      case "ford": n.speak = "Caution, ford"; n.text = "FORD"; break;
      case "bridge": n.speak = "Caution, one lane bridge"; n.text = "BRIDGE narrow"; break;
      case "caution":
        if (n._cave) { n.speak = "Caution, cave mouth, trees close in"; n.text = "CAVE narrows"; } else { n.speak = "Cattle grid"; n.text = "GRID"; }
        break;
      case "surface": {
        const to = SURF_NAME[n._to] ?? "gravel", from = SURF_NAME[n._from] ?? "gravel";
        n.speak = `${n._from === 2 ? "Tarmac ends, " + to : cap(to)}${n.modifiers.includes("slippery") ? ", slippery" : ""}`;
        n.text = n.modifiers.includes("slippery") ? `${to.toUpperCase()} slippery` : to.toUpperCase();
        n._detail = `${from} to ${to}`;
        break;
      }
      case "straight": {
        const d = roundTo(n.length, 50);
        n.speak = `Flat out, ${d}`;
        n.text = `FLAT ${d}`;
        break;
      }
      case "distance": n.speak = n._say; n.text = n._say; break;
      case "start": n.speak = "Go, flat out"; n.text = "START"; break;
      case "finish": n.speak = "Finish, flat out"; n.text = "FINISH"; break;
      default: break;
    }
    if (n.kind === "straight" || n.kind === "start") n.icon = "straight";
  }
  for (const n of out) {
    n.lead = makeLead(n.s);
    delete n._prio; delete n._say; delete n._gIn; delete n._apex; delete n._grid; delete n._cave; delete n._from; delete n._to;
    if (!n.modifiers) n.modifiers = [];
  }
  return out;
}
