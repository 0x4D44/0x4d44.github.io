/* Past-paper practice: Drives, mechanisms & pneumatics. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HEP_BANK = window.HEP_BANK || {});

  /* ---- marker helpers: clause-bounded (tempered) regex source strings, built with String.raw ---- */
  const R = String.raw;
  /* C(stop, n): up to n characters of one clause (no full stop or semicolon) that never run into `stop` */
  const C = (stop, n) => R`(?:(?!${stop})[^.;]){0,${n}}`;
  /* Cc(stop, n): like C but a comma also ends the clause (for vetoes, so a negative in the next clause is not blamed) */
  const Cc = (stop, n) => R`(?:(?!${stop})[^.;,]){0,${n}}`;
  /* K(n): up to n characters of one clause */
  const K = (n) => R`[^.;]{0,${n}}`;
  /* KC(n): like K but a comma also ends the span, so a comma list cannot satisfy a relation */
  const KC = (n) => R`[^.;,]{0,${n}}`;
  /* near(a, b, n): a and b in either order with at most n words between them */
  const near = (a, b, n) => { const g = R`\W+(?:\w+\W+){0,${n == null ? 3 : n}}`; return R`\b(?:${a})\b${g}\b(?:${b})\b|\b(?:${b})\b${g}\b(?:${a})\b`; };
  /* an outstroke or an instroke, in the words candidates use */
  const OUT = R`(?:out-?\s?strok\w*|extend\w*|(?:moves?|goes?|comes?|pushes?|pushed|travels?)\s+out\w*|forwards?|advances?|thrust out)`;
  const IN = R`(?:in-?\s?strok\w*|retract\w*|(?:moves?|goes?|comes?|pulls?|pulled|travels?|returns?)\s+(?:back\s+)?in\b|(?:moves?|goes?|comes?|returns?|pulls?|pulled)\s+back|returns?\b|withdraws?)`;
  const NEGS = R`\bnot\b|n't|\bnever\b|\bcannot\b|\bno\b|\bwithout\b`;
  /* ---- small SVG helpers (palette: ink, rust, paper, tan) ---- */
  const INK = "#1d1a14", PAPER = "#fffaf0", RED = "#a3262a", GREY = "#6a604c", TINT = "#efe2c2";
  const r1 = (n) => Math.round(n * 10) / 10;
  const svg = (w, h, label, body) =>
    `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" font-family="Helvetica, Arial, sans-serif"><rect width="${w}" height="${h}" fill="${PAPER}"/>${body}</svg>`;
  const ln = (x1, y1, x2, y2, o = {}) =>
    `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${o.c || INK}" stroke-width="${o.w || 1.8}"${o.d ? ` stroke-dasharray="${o.d}"` : ""}/>`;
  const pl = (pts, o = {}) =>
    `<polyline points="${pts.map((p) => r1(p[0]) + "," + r1(p[1])).join(" ")}" fill="none" stroke="${o.c || INK}" stroke-width="${o.w || 1.8}"${o.d ? ` stroke-dasharray="${o.d}"` : ""} stroke-linejoin="round"/>`;
  const rc = (x, y, w, h, o = {}) =>
    `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" fill="${o.f || "none"}" stroke="${o.c || INK}" stroke-width="${o.w || 1.8}"${o.rx ? ` rx="${o.rx}"` : ""}/>`;
  const ci = (cx, cy, r, o = {}) =>
    `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${o.f || "none"}" stroke="${o.c || INK}" stroke-width="${o.w == null ? 1.8 : o.w}"${o.d ? ` stroke-dasharray="${o.d}"` : ""}/>`;
  const tx = (x, y, s, o = {}) =>
    `<text x="${r1(x)}" y="${r1(y)}" font-size="${o.s || 13}" text-anchor="${o.a || "middle"}" fill="${o.c || INK}"${o.b ? ' font-weight="700"' : ""}>${s}</text>`;
  const poly = (pts, f, o = {}) =>
    `<polygon points="${pts.map((p) => r1(p[0]) + "," + r1(p[1])).join(" ")}" fill="${f || INK}" stroke="${o.c || (f === "none" ? INK : "none")}" stroke-width="${o.w || 1.6}"/>`;
  const dot = (x, y) => ci(x, y, 2.8, { f: INK, w: 0 });
  const head = (x, y, ang, len = 8, half = 3, col) => {
    const bx = x - len * Math.cos(ang), by = y - len * Math.sin(ang), nx = -Math.sin(ang) * half, ny = Math.cos(ang) * half;
    return poly([[x, y], [bx + nx, by + ny], [bx - nx, by - ny]], col);
  };
  const arrow = (x1, y1, x2, y2, o = {}) => ln(x1, y1, x2, y2, o) + head(x2, y2, Math.atan2(y2 - y1, x2 - x1), o.len || 8, o.half || 3);
  /* a curved arrow round a hub: clockwise when cw is true */
  const spin = (cx, cy, r, cw) => {
    const a0 = cw ? -2.4 : -0.74, a1 = cw ? -0.74 : -2.4; // radians, y down
    const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    const tang = a1 + (cw ? Math.PI / 2 : -Math.PI / 2);
    return `<path d="M${r1(x0)} ${r1(y0)} A${r} ${r} 0 0 ${cw ? 1 : 0} ${r1(x1)} ${r1(y1)}" fill="none" stroke="${RED}" stroke-width="2"/>` +
      head(x1, y1, tang, 8, 3.4, RED);
  };

  /* ---- a gear drawn end-on: the toothed rim is a dashed ring with exactly n teeth ---- */
  const gear = (cx, cy, r, n, o = {}) => {
    const rim = r + 2, circ = 2 * Math.PI * rim, d = circ / (2 * n);
    return `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(rim)}" fill="none" stroke="${INK}" stroke-width="6" stroke-dasharray="${d.toFixed(3)} ${d.toFixed(3)}" stroke-dashoffset="${((o.ph || 0) * d).toFixed(3)}"/>` +
      ci(cx, cy, r - 2, { f: o.f || TINT, w: 1.8 }) + ci(cx, cy, Math.min(7, r / 3), { f: PAPER, w: 1.6 }) + dot(cx, cy);
  };

  /* ---- ISO-style pneumatic symbols, as used in the Drives & pneumatics deck ---- */
  /* actuator glyph on the left (s = -1) or right (s = +1) edge of a valve; returns { g, far } */
  const actuator = (kind, xe, ym, s, label) => {
    let g = "", far = { x: xe + s * 26, y: ym };
    if (kind === "pilot") {
      g += ln(xe + s * 9, ym, xe + s * 26, ym, { w: 1.5, d: "4 3" }) + poly([[xe, ym], [xe + s * 9, ym - 5], [xe + s * 9, ym + 5]]);
      if (label) g += tx(xe + s * 17, ym - 8, label, { s: 12 });
    } else if (kind === "push") {
      g += pl([[xe, ym], [xe + s * 8, ym]]) + pl([[xe + s * 15, ym - 9], [xe + s * 8, ym - 9], [xe + s * 8, ym + 9], [xe + s * 15, ym + 9]]);
      far = { x: xe + s * 15, y: ym };
    } else if (kind === "roller") {
      g += pl([[xe, ym], [xe + s * 8, ym]]) + ci(xe + s * 13, ym, 5, { w: 1.6 }) + ci(xe + s * 13, ym, 1.3, { f: INK, w: 0 });
      far = { x: xe + s * 18, y: ym };
    } else if (kind === "spring") {
      const pts = [[xe, ym]];
      for (let i = 0; i < 6; i++) pts.push([xe + s * (3 + i * 3.6), ym + (i % 2 ? 6 : -6)]);
      pts.push([xe + s * 25, ym]);
      g += pl(pts, { w: 1.5 });
      far = { x: xe + s * 25, y: ym };
    }
    return { g, far };
  };
  /* exhaust: a short stub ends in a small open triangle */
  const exhaust = (x, y) => poly([[x - 4.5, y], [x + 4.5, y], [x, y + 8]], "none");
  const blockT = (x, y) => pl([[x, y], [x, y - 9]], { w: 1.6 }) + ln(x - 5, y - 9, x + 5, y - 9, { w: 1.6 });
  /* A 3/2 or 5/2 valve drawn at rest-or-actuated: o = { x, y (top-left of the left box), t: "32"|"52", act: left box over the ports,
     L, R: actuator kinds, lblL, lblR, num: label the ports, S }.  Returns { g, P: port stub ends, x0, x1: overall left/right } */
  const valve = (o) => {
    const S = o.S || 34, x = o.x, y = o.y, is52 = o.t === "52", bx = [x, x + S];
    const flow = (b, x1, y1, x2, y2) => arrow(b + x1 * S, y + y1 * S, b + x2 * S, y + y2 * S, { w: 1.5, len: 7, half: 2.6 });
    let g = rc(x, y, S, S) + rc(x + S, y, S, S);
    if (is52) {
      g += flow(bx[0], 0.5, 1, 0.28, 0) + flow(bx[0], 0.72, 0, 0.8, 1) + flow(bx[1], 0.5, 1, 0.72, 0) + flow(bx[1], 0.28, 0, 0.2, 1);
    } else {
      g += flow(bx[0], 0.28, 1, 0.5, 0) + blockT(bx[0] + 0.72 * S, y + S) + flow(bx[1], 0.5, 0, 0.72, 1) + blockT(bx[1] + 0.28 * S, y + S);
    }
    const ab = bx[o.act ? 0 : 1], P = {};
    const tops = is52 ? [["4", 0.28], ["2", 0.72]] : [["2", 0.5]];
    const bots = is52 ? [["5", 0.2], ["1", 0.5], ["3", 0.8]] : [["1", 0.28], ["3", 0.72]];
    tops.forEach(([n, f]) => {
      const px = ab + f * S; P[n] = { x: px, y: y - 10 }; g += ln(px, y, px, y - 10, { w: 1.6 });
      if (o.num) g += tx(px + (n === "4" ? -3 : 3), y - 4, n, { s: 12, a: n === "4" ? "end" : "start" });
    });
    bots.forEach(([n, f]) => {
      const px = ab + f * S; P[n] = { x: px, y: y + S + 10 }; g += ln(px, y + S, px, y + S + 10, { w: 1.6 });
      if (n === "3" || n === "5") g += exhaust(px, y + S + 10);
      if (n === "1" && o.ext1) { g += ln(px, y + S + 10, px, y + S + 26, { w: 1.6 }); P[n].y = y + S + 26; }
      if (o.num) {
        if (n === "1" && is52) g += tx(px + 5, y + S + 30, n, { s: 12, a: "start" });
        else g += tx(px + (n === "3" ? 4 : -4), y + S + 8, n, { s: 12, a: n === "3" ? "start" : "end" });
      }
    });
    const out = { g, P, x0: x, x1: x + 2 * S };
    const ym = y + S / 2;
    if (o.L) { const a = actuator(o.L, x, ym, -1, o.lblL); out.g += a.g; out.Lfar = a.far; out.x0 = a.far.x; }
    if (o.R) { const a = actuator(o.R, x + 2 * S, ym, 1, o.lblR); out.g += a.g; out.Rfar = a.far; out.x1 = a.far.x; }
    return out;
  };
  /* A double-acting cylinder lying flat, rod to the right. pos 0 = instroked. Ports on the underside. */
  const cylinder = (o) => {
    const { x, y, w } = o, h = o.h || 30, out = o.pos ? 1 : 0;
    const px = out ? x + w - 15 : x + 15, tip = x + w + (out ? 38 : 24);
    const g = rc(x, y, w, h, { f: PAPER }) + rc(px, y + 2, 6, h - 4, { f: TINT, w: 1.6 }) +
      rc(px + 6, y + h / 2 - 3, tip - px - 6, 6, { f: PAPER, w: 1.6 }) +
      ln(x + w, y + h / 2 - 3, x + w, y + h / 2 + 3, { c: PAPER, w: 2.4 }) +
      ln(x + 8, y + h, x + 8, y + h + 10, { w: 1.6 }) + ln(x + w - 8, y + h, x + w - 8, y + h + 10, { w: 1.6 });
    return { g, cap: { x: x + 8, y: y + h + 10 }, rod: { x: x + w - 8, y: y + h + 10 } };
  };
  /* compressed-air source symbol, line leaving to the right */
  const source = (x, y) => ci(x, y, 8, { w: 1.7 }) + poly([[x + 5, y], [x - 3.5, y - 4.2], [x - 3.5, y + 4.2]]);

  /* ---- the figures ---- */
  /* a belt or chain round two circles on one level: external tangents */
  const wrap = (x1, y, ra, x2, rb, o = {}) => {
    const d = x2 - x1, a = (rb - ra) / d, b = Math.sqrt(1 - a * a);
    const t1 = [x1 + ra * a, y - ra * b], t2 = [x2 + rb * a, y - rb * b], u1 = [x1 + ra * a, y + ra * b], u2 = [x2 + rb * a, y + rb * b];
    const rightLarge = rb < ra ? 1 : 0;
    return `<path d="M${r1(t1[0])} ${r1(t1[1])} L${r1(t2[0])} ${r1(t2[1])} A${rb} ${rb} 0 ${rightLarge} 1 ${r1(u2[0])} ${r1(u2[1])} L${r1(u1[0])} ${r1(u1[1])} A${ra} ${ra} 0 ${1 - rightLarge} 1 ${r1(t1[0])} ${r1(t1[1])}" fill="none" stroke="${INK}" stroke-width="${o.w || 3}"${o.d ? ` stroke-dasharray="${o.d}"` : ""}/>`;
  };

  /* mechanisms-05: a driver, an idler and an output gear, drawn to scale */
  const figIdler = () => {
    const cy = 170, k = 1.6, rA = 20 * k, rB = 30 * k, rC = 80 * k;
    const xa = 84, xb = xa + rA + rB + 4, xc = xb + rB + rC + 4;
    return svg(500, 322, "Three spur gears in a row, drawn to scale and meshing. Gear A, the driver, has 20 teeth and turns clockwise. It meshes with gear B, an idler with 30 teeth, which meshes with gear C, the large output gear with 80 teeth.",
      gear(xa, cy, rA, 20, { ph: 0 }) + gear(xb, cy, rB, 30, { ph: 0.5 }) + gear(xc, cy, rC, 80, { ph: 0 }) + spin(xa, cy, 18, true) +
      tx(xa, cy - rA - 14, "A  driver", { b: 1 }) + tx(xa, cy + rA + 26, "20 teeth") +
      tx(xb, cy + rB + 26, "B  idler", { b: 1 }) + tx(xb, cy + rB + 42, "30 teeth") +
      tx(xc, cy - rC - 14, "C  output", { b: 1 }) + tx(xc, cy + 58, "80 teeth"));
  };

  /* mechanisms-09: compound train in skeleton side view (shafts vertical, gears edge-on, width proportional to teeth) */
  const figCompound = () => {
    const k = 2, gh = 16, sx1 = 112, y1 = 128, y2 = 196;
    const wA = 16 * k, wB = 64 * k, wC = 18 * k, wD = 54 * k;
    const xB = sx1 + wA / 2, sx2 = xB + wB / 2, xD = sx2 + wC / 2, sx3 = xD + wD / 2;
    const gr = (x, y, w) => rc(x, y, w, gh, { f: TINT, w: 1.8 });
    return svg(480, 350, "Skeleton side view of a compound gear train. A 16-tooth gear A on the motor shaft meshes with a 64-tooth gear B. Gear B and an 18-tooth gear C are fixed to the same middle shaft. Gear C meshes with a 54-tooth gear D on the output shaft, which turns a drum. Widths are in proportion to the number of teeth.",
      rc(80, 22, 64, 48, { f: TINT, rx: 4 }) + tx(112, 51, "motor", { b: 1 }) +
      ln(sx1, 70, sx1, y1 + gh + 10) + ln(sx2, y1 - 24, sx2, y2 + gh + 24) + ln(sx3, y2 - 26, sx3, 276) +
      gr(sx1 - wA / 2, y1, wA) + gr(xB, y1, wB) + gr(sx2 - wC / 2, y2, wC) + gr(xD, y2, wD) +
      tx(sx1 - wA / 2 - 6, y1 + 13, "A  16 teeth", { a: "end" }) + tx(sx2, y1 + 13, "B  64 teeth") +
      tx(sx2 - wC / 2 - 6, y2 + 13, "C  18 teeth", { a: "end" }) + tx(xD + wD / 2, y2 + 13, "D  54 teeth") +
      tx(sx2 + 10, y1 - 30, "B and C are fixed to the same shaft", { s: 12, a: "start" }) +
      rc(sx3 - 58, 276, 116, 46, { f: TINT, rx: 4 }) + tx(sx3, 297, "drum", { b: 1 }) + tx(sx3, 313, "300 mm diameter", { s: 12 }) +
      tx(sx3 + 10, 252, "output shaft", { a: "start", s: 12 }));
  };

  /* mechanisms-06: motor, coupling, worm gearbox, chain, roller */
  const figConveyor = () => {
    const y = 112;
    return svg(540, 230, "Drive diagram for a conveyor, read left to right. An electric motor turns at 1440 revolutions per minute. A coupling joins it to a worm and wheel gearbox with a velocity ratio of 20. The gearbox output shaft carries a 12-tooth sprocket. A chain drives a 36-tooth sprocket, whose shaft turns the conveyor roller, which has a diameter of 160 millimetres.",
      ln(66, y, 86, y) + rc(86, y - 14, 7, 28, { f: PAPER, w: 1.6 }) + rc(96, y - 14, 7, 28, { f: PAPER, w: 1.6 }) + ln(103, y, 122, y) + ln(214, y, 246, y) + ln(356, y, 424, y) +
      rc(8, y - 28, 58, 56, { f: TINT, rx: 4 }) + tx(37, y + 5, "motor", { b: 1 }) + tx(37, y + 50, "1440 rev/min", { s: 12 }) +
      tx(95, y - 22, "coupling", { s: 12 }) +
      rc(122, y - 38, 92, 76, { f: TINT, rx: 4 }) + tx(168, y - 6, "worm gearbox", { s: 12, b: 1 }) + tx(168, y + 12, "VR = 20", { s: 12 }) +
      wrap(246, y, 17, 356, 51, { d: "7 3", w: 3.2 }) +
      gear(246, y, 15, 12, { f: PAPER }) + gear(356, y, 49, 36, { f: PAPER }) +
      tx(246, y + 40, "12 teeth", { s: 12 }) + tx(356, y + 30, "36 teeth", { s: 12 }) + tx(301, y - 66, "chain", { s: 12 }) +
      rc(424, y - 40, 108, 80, { f: TINT, rx: 6 }) + tx(478, y - 6, "conveyor roller", { s: 12, b: 1 }) + tx(478, y + 12, "160 mm diameter", { s: 12 }));
  };

  /* mechanisms-04: four valve symbols */
  const figSymbols = () => {
    const S = 40, kinds = [
      { t: "32", L: "push", R: "spring", name: "A" },
      { t: "32", L: "roller", R: "spring", name: "B" },
      { t: "52", L: "pilot", R: "spring", name: "C", lblL: "14" },
      { t: "52", L: "pilot", R: "pilot", name: "D", lblL: "14", lblR: "12" },
    ];
    const lw = { push: 15, roller: 18, pilot: 26 }, rw = { spring: 25, pilot: 26 };
    let g = "";
    kinds.forEach((k, i) => {
      const cx = (i % 2) * 260 + 130, cy = Math.floor(i / 2) * 140 + 34;
      const x = cx - (lw[k.L] + 2 * S + rw[k.R]) / 2 + lw[k.L];
      const v = valve({ x, y: cy, S, t: k.t, L: k.L, R: k.R, lblL: k.lblL, lblR: k.lblR, num: true, ext1: true });
      g += v.g + tx(cx, cy + S + 56, k.name, { s: 18, b: 1 });
    });
    return svg(520, 292, "Four pneumatic valve symbols, labelled A to D, each drawn in its rest position. A is a three-port two-position valve with a push-button on one side and a spring on the other. B is a three-port two-position valve with a roller on one side and a spring on the other. C is a five-port two-position valve with a pilot signal on one side and a spring on the other. D is a five-port two-position valve with a pilot signal on both sides and no spring.", g);
  };

  /* mechanisms-11: push-button valve S, pilot-operated valve V, cylinder C */
  const figSimple = () => {
    const S = 34, cyl = cylinder({ x: 250, y: 26, w: 130 });
    const V = valve({ x: 288, y: 118, S, t: "52", L: "pilot", R: "spring", lblL: "14", num: true });
    const Sv = valve({ x: 96, y: 176, S, t: "32", L: "push", R: "spring", num: true });
    const bus = 252, p1 = Sv.P["1"], p2 = Sv.P["2"], v1 = V.P["1"];
    return svg(480, 292, "Pneumatic circuit. A compressed air supply feeds a three-port two-position push-button valve S with spring return, and a five-port two-position valve V that has a pilot port 14 on its left and a spring on its right. The outlet of S is connected by a dashed pilot line to port 14 of V. Valve V feeds a double-acting cylinder C, with outlet 4 to the cap end and outlet 2 to the rod end. The cylinder is drawn instroked.",
      cyl.g + V.g + Sv.g +
      pl([[V.P["4"].x, V.P["4"].y], [V.P["4"].x, 88], [cyl.cap.x, 88], [cyl.cap.x, cyl.cap.y]]) +
      pl([[V.P["2"].x, V.P["2"].y], [V.P["2"].x, 80], [cyl.rod.x, 80], [cyl.rod.x, cyl.rod.y]]) +
      pl([[p2.x, p2.y], [p2.x, 135], [V.Lfar.x, 135]], { w: 1.5, d: "4 3" }) +
      pl([[p1.x, p1.y], [p1.x, bus], [v1.x, bus], [v1.x, v1.y]]) + dot(p1.x, bus) + ln(46, bus, p1.x, bus) + source(38, bus) + tx(38, bus + 24, "supply", { s: 12 }) +
      tx(cyl.cap.x - 20, 47, "C", { s: 16, b: 1 }) + tx(113, 238, "S", { s: 16, b: 1 }) + tx(305, 190, "V", { s: 16, b: 1 }));
  };

  /* mechanisms-12: A+ B+ A- B- with double-pilot valves and roller limit valves; a0 and b0 are shown pressed */
  const figSeq = () => {
    const S = 34, yb = 270;
    const cA = cylinder({ x: 40, y: 24, w: 120 }), cB = cylinder({ x: 330, y: 24, w: 120 });
    const vo = { S, t: "52", L: "pilot", R: "pilot", lblL: "14", lblR: "12", num: true };
    const vA = valve({ ...vo, x: 70, y: 118 }), vB = valve({ ...vo, x: 360, y: 118 });
    const lo = { S, t: "32", L: "roller", R: "spring", y: yb };
    const b0 = valve({ ...lo, x: 60, act: true }), b1 = valve({ ...lo, x: 178 }), a1 = valve({ ...lo, x: 298 }), a0 = valve({ ...lo, x: 422, act: true });
    const st = valve({ S, t: "32", L: "push", R: "spring", x: b0.P["2"].x - (S + 0.28 * S), y: 196 });
    const D = { w: 1.5, d: "4 3" }, bus = 350, up = 186;
    let g = cA.g + cB.g + vA.g + vB.g + b0.g + b1.g + a1.g + a0.g + st.g;
    // cylinder ports
    [[vA, cA], [vB, cB]].forEach(([v, c]) => {
      g += pl([[v.P["4"].x, v.P["4"].y], [v.P["4"].x, 88], [c.cap.x, 88], [c.cap.x, c.cap.y]]);
      g += pl([[v.P["2"].x, v.P["2"].y], [v.P["2"].x, 80], [c.rod.x, 80], [c.rod.x, c.rod.y]]);
    });
    // signal (pilot) lines
    g += pl([[b0.P["2"].x, b0.P["2"].y], [st.P["1"].x, st.P["1"].y]], D);
    g += pl([[st.P["2"].x, st.P["2"].y], [st.P["2"].x, 180], [vA.Lfar.x, 180], [vA.Lfar.x, vA.Lfar.y]], D);
    g += pl([[b1.P["2"].x, b1.P["2"].y], [b1.P["2"].x, 214], [vA.Rfar.x, 214], [vA.Rfar.x, vA.Rfar.y]], D);
    g += pl([[a1.P["2"].x, a1.P["2"].y], [a1.P["2"].x, 222], [vB.Lfar.x, 222], [vB.Lfar.x, vB.Lfar.y]], D);
    g += pl([[a0.P["2"].x, a0.P["2"].y], [a0.P["2"].x, 238], [vB.Rfar.x, 238], [vB.Rfar.x, vB.Rfar.y]], D);
    // supply: upper bus for the two main valves (hops over the signal lines), lower bus for the signal valves
    const hop = (x) => `H${x - 5} A5 5 0 0 1 ${x + 5} ${up}`;
    g += pl([[vA.P["1"].x, vA.P["1"].y], [vA.P["1"].x, up]]) + pl([[vB.P["1"].x, vB.P["1"].y], [vB.P["1"].x, up]]) + dot(vB.P["1"].x, up);
    g += `<path d="M${vA.P["1"].x} ${up} ${hop(vA.Rfar.x)} ${hop(vB.Lfar.x)} ${hop(vB.Rfar.x)} H540 V${bus}" fill="none" stroke="${INK}" stroke-width="1.8"/>`;
    g += ln(28, bus, 540, bus) + source(20, bus);
    [b0, b1, a1, a0].forEach((v) => { g += pl([[v.P["1"].x, v.P["1"].y], [v.P["1"].x, bus]]) + dot(v.P["1"].x, bus); });
    g += dot(540, bus);
    // labels
    g += tx(100, 16, "cylinder A", { b: 1 }) + tx(390, 16, "cylinder B", { b: 1 }) +
      tx(104, 173, "valve A", { a: "end", s: 12 }) + tx(394, 173, "valve B", { a: "end", s: 12 }) +
      tx(24, 242, "START", { a: "start", s: 12, b: 1 }) +
      tx(b0.x0 + 10, yb - 6, "b0", { s: 13, b: 1 }) + tx(b1.x0 + 10, yb - 6, "b1", { s: 13, b: 1 }) + tx(a1.x0 + 10, yb - 6, "a1", { s: 13, b: 1 }) + tx(a0.x0 + 10, yb - 6, "a0", { s: 13, b: 1 }) +
      tx(46, bus + 22, "supply", { s: 12 });
    return svg(560, 380, "Pneumatic circuit for two double-acting cylinders A and B. Each cylinder is controlled by a five-port two-position valve with a pilot port on each side and no spring. Four roller limit valves a0, a1, b0 and b1 are tripped by the piston rods, and a START push-button valve is in series with b0. The START and b0 signal goes to pilot 14 of valve A. Limit valve a1 goes to pilot 14 of valve B, b1 goes to pilot 12 of valve A and a0 goes to pilot 12 of valve B. Both cylinders are drawn instroked, with a0 and b0 pressed.", g);
  };

  /* mechanisms-13: ladder diagram, a latching relay K1 and a solenoid Y1 */
  const figLadder = () => {
    const L = 36, Rr = 484, y1 = 76, y1b = 124, y2 = 196;
    const contact = (cx, y, nc) => ln(cx - 6, y - 12, cx - 6, y + 12, { w: 2 }) + ln(cx + 6, y - 12, cx + 6, y + 12, { w: 2 }) + (nc ? ln(cx - 11, y + 10, cx + 11, y - 10, { w: 1.6 }) : "");
    const coil = (cx, y, name, sol) => rc(cx - 26, y - 15, 52, 30, { f: PAPER, w: 2 }) + (sol ? ln(cx - 26, y + 15, cx + 26, y - 15, { w: 1.4 }) + tx(cx, y - 22, name, { s: 13 }) : tx(cx, y + 5, name, { b: 1, s: 14 }));
    return svg(520, 252, "Ladder diagram with a positive rail on the left and a 0 volt rail on the right. Rung one: a normally closed stop switch S2 in series, then a normally open start switch S1 in parallel with a normally open contact of relay K1, then the coil of relay K1. Rung two: a second normally open contact of relay K1 in series with solenoid Y1.",
      ln(L, 40, L, 214, { w: 2.6 }) + ln(Rr, 40, Rr, 214, { w: 2.6 }) + tx(L, 30, "+24 V", { b: 1 }) + tx(Rr, 30, "0 V", { b: 1 }) +
      // rung 1
      ln(L, y1, 82, y1) + contact(88, y1, true) + ln(94, y1, 150, y1) + tx(88, y1 - 20, "S2") +
      dot(150, y1) + ln(150, y1, 196, y1) + contact(202, y1, false) + ln(208, y1, 270, y1) + tx(202, y1 - 20, "S1") +
      pl([[150, y1], [150, y1b], [196, y1b]]) + contact(202, y1b, false) + pl([[208, y1b], [270, y1b], [270, y1]]) + tx(202, y1b + 28, "K1") + dot(270, y1) +
      ln(270, y1, 340 - 26, y1) + coil(340, y1, "K1") + ln(366, y1, Rr, y1) +
      // rung 2
      ln(L, y2, 142, y2) + contact(148, y2, false) + ln(154, y2, 314, y2) + tx(148, y2 - 20, "K1") + coil(340, y2, "Y1", true) + ln(366, y2, Rr, y2) +
      tx(340, y1 + 34, "relay coil", { s: 12 }) + tx(340, y2 + 34, "solenoid", { s: 12 }));
  };

  /* ---- the written-answer banks: marking points, a full-marks sample and the marking guidance ---- */
  const TXT = {};

  /* mechanisms-05(e): why a reduction gear train sits between motor and drum */
  {
    const SPD = R`(?:speed|rpm|revs|revolutions|rotation\w*|rev/min|spinning)`;
    const TRQ = R`(?:torque|turning (?:force|effect)|twisting (?:force|effect)|moment|pulling (?:force|power)|lifting (?:force|power)|force)`;
    const RED = R`(?:reduc(?:e|es|ed|ing)|lower(?:s|ed|ing)?|decreas\w*|slow(?:s|ed|ing)?|cuts?|drops?)`;
    const RAISE = R`(?:increas\w*|rais\w*|boost\w*|multipl\w*|amplif\w*|bigger|greater|higher|more|extra|larger|stronger)`;
    TXT.reduct = {
      points: [
        {
          desc: "The output (drum) speed is lower than the motor speed: the train reduces the speed",
          negOK: true,
          not: [
            R`(?:\bnot|n't|\bnever|\bcannot)\s+(?!only\b)(?:\w+\s+){0,2}(?:${RED}|slower)\b`,
            R`\b(?:speed|rpm)\b${C(R`torque|force|reduc|lower|slow|decreas|drop|less|smaller|but|and|while|whereas`, 18)}\b(?:increas\w*|rais\w*|higher|greater|faster|boost\w*|bigger|larger)\b`,
            R`\b(?:increas\w*|rais\w*|boost\w*|speeds?\s+up|sped\s+up|faster)\b${C(R`torque|force|reduc|lower|slow|decreas|drop|less|smaller|but|and|while|whereas`, 18)}\b(?:speed|rpm)\b`,
            R`\b(?:turns?|runs?|rotates?|spins?|goes?)\s+(?:much |a lot |far |a bit |even )?(?:faster|quicker|more quickly)\b`,
          ],
          any: [
            R`\b${RED}\b${C(R`torque|force|increas|raise|higher|greater|faster`, 30)}\b${SPD}\b`,
            R`\b${SPD}\b${C(R`torque|force|increas|higher|greater|faster|raise`, 30)}\b(?:reduc(?:e|es|ed|ing)|lower(?:s|ed|ing)?|decreas\w*|drops?|dropped|falls?|fell|slower|less|smaller)\b`,
            R`\b(?:turns?|runs?|rotates?|spins?|goes?|moves?)\s+(?:much |a lot |far |a bit |more )?(?:slower|more slowly|slowly)\b`,
            R`\bslow(?:s|ed|ing)?\b(?:\s+\w+){0,3}\s+down\b`,
            R`\b(?:speed|rpm)\s+(?:down|lower)\b`,
            R`\b(?:lower|slower|reduced|decreased)\s+(?:\w+\s+){0,2}(?:speed|rpm|rev/min)\b`,
            R`\breduction\s+(?:in|of)\s+(?:the\s+)?(?:\w+\s+)?(?:speed|rpm)\b`,
          ],
        },
        {
          desc: "The torque at the drum is greater than at the motor: the train increases the torque",
          negOK: true,
          not: [
            R`(?:\bnot|n't|\bnever|\bcannot|\bno)\s+(?!only\b)(?:\w+\s+){0,2}(?:increas\w*|rais\w*|boost\w*|multipl\w*|more|greater|higher|bigger|larger)\b${C(R`speed|rpm`, 25)}\b${TRQ}\b`,
            R`\b(?:torque|turning (?:force|effect)|twisting (?:force|effect))\b${Cc(R`increas|rais|more|greater|higher|bigger|larger|gain|boost|stronger|speed|rpm|but|and|while|so\b|because|which|gearbox|gears?\b|train`, 25)}\b(?:reduc\w*|lower\w*|decreas\w*|drop\w*|less|smaller|weaker|falls?|fewer)`,
            R`(?<!\b(?:speed|rpm|revs)\s)\b(?:reduc(?:e|es|ed|ing)|lower(?:s|ed|ing)?|decreas\w*|cuts?|drops?)\b${Cc(R`speed|rpm|increas|rais|more|greater|higher|bigger|larger|gain|boost|but|and|while|so\b|because|which`, 25)}\b(?:torque|turning (?:force|effect)|twisting (?:force|effect))`,
          ],
          any: [
            R`\b${RAISE}\b${C(R`speed|rpm|reduc|lower|slow|decreas|drop|less|smaller|fewer|${NEGS}`, 30)}\b${TRQ}\b`,
            R`\b${TRQ}\b${C(R`speed|rpm|reduc|lower|slow|decreas|drop|less|smaller|fewer|${NEGS}`, 35)}\b(?:increas\w*|rises?|rising|rais\w*|bigger|larger|higher|greater|stronger|multipl\w*|boost\w*|more|goes? up|gains?)`,
            R`\b(?:high|large|greater|more|extra)\s+(?:output\s+)?(?:torque|turning force)\b`,
          ],
        },
      ],
      sample: "The gear train reduces the speed, so the drum turns much more slowly than the motor. As the speed falls the torque is increased, so the winch can pull a heavy load.",
      model: R`<ul><li>The output (drum) speed is lower than the motor speed: the gears reduce the speed (1)</li><li>The torque at the drum is greater than the motor torque: the gears increase the torque (1)</li></ul><p>Also acceptable: the motor runs at its efficient high speed while the load gets the large torque it needs; since $P = 2\pi nT$, power is roughly constant, so torque rises as speed falls. Do not accept a bare &quot;to slow it down&quot; or &quot;to make it more powerful&quot;; both speed and torque must be mentioned, in the right directions.</p>`,
    };
  }

  /* mechanisms-10(c): the rod takes up area on the instroke */
  {
    const SM = R`(?:smaller|less|reduced|lower|decreased|weaker)`;
    const FORM = R`(?:\bf\s*=\s*p\s*(?:x|\*|times)?\s*a\b|\bforce\s*(?:=|is|equals)\s*pressure\s*(?:x|\*|times|multiplied by)\s*area|\bpressure\s*(?:x|times|\*|multiplied by)\s*area)`;
    const BIG = R`(?:bigger|larger|greater|higher|more|stronger|increas\w*)`;
    const WRONGDIR = [
      R`\b(?:makes?|making|gives?|giving|adds?|adding|increases?|increasing|means?)\s+(?:the\s+|a\s+|an\s+)?(?:\w+\s+){0,2}(?:area|surface|face)\s+(?:bigger|larger|greater|more|increase\w*)`,
      R`\brod\b${K(40)}\b(?:makes?|making|increas\w*|adds?|adding|enlarg\w*)\s+(?:the\s+|an?\s+)?(?:\w+\s+){0,2}(?:area|surface|face)`,
      R`\b(?:in-?\s?strok\w*|rod end|rod side|annul\w*)\s+(?:force|area)\s+(?:is|are)\s+(?:\w+\s+){0,2}${BIG}`,
      R`\b(?:out-?\s?strok\w*|cap end|full)\s+(?:force|area)\s+(?:is|are)\s+(?:\w+\s+){0,2}${SM}`,
      R`\b(?:out-?\s?strok\w*|cap end)\b${K(40)}\b(?:force|area)\b${K(10)}\b${SM}\s+than`,
      R`\b(?:in-?\s?strok\w*|rod end|rod side|annul\w*)\b${K(40)}\b(?:is|are)\s+(?:\w+\s+){0,2}${BIG}\s+than`,
      R`\b${BIG}\s+than\s+(?:the\s+)?(?:\w+\s+){0,1}(?:out-?\s?strok\w*|cap end|full)\b`,
    ];
    TXT.annulus = {
      points: [
        {
          desc: "The piston rod takes up part of the piston face on the rod side, so the area the air pushes on (the annulus) is smaller on the instroke",
          group: "rod",
          not: WRONGDIR.concat([
            R`\brod\b${C(R`not|n't|never|\bno\b|in-?\s?strok|rod end|rod side`, 45)}\b(?:reduc\w*|tak\w+|remov\w*|cover\w*|block\w*)\b${C(R`not|n't|never|\bno\b|in-?\s?strok|rod end|rod side`, 40)}\b(?:area|face)\b${C(R`in-?\s?strok|rod end`, 20)}\bon\s+(?:the\s+)?(?:out-?\s?strok\w*|cap end)`,
          ]),
          any: [
            R`\brod\b${K(40)}\b(?:take[sn]?\s+up|takes? away|occupies|occupying|reduces?|reducing|covers?|covering|blocks?|blocking|removes?|removing|uses?\s+up|in the way|obstruct\w*|fills?|part of|some of)\b${K(40)}\b(?:area|face|surface|space|side)`,
            R`\b(?:on|onto|over|against|only|acts?|the|an?|is|called|using|uses?)\s+(?:\w+\s+){0,1}annul\w*`,
            R`\brod\b${K(15)}\b(?:is\s+not|isn't|n't)\s+(?:in the way|taking|covering|blocking|obstruct\w*|there|present)`,
            R`\b(?:covered|blocked|taken(?:\s+up)?|used up|occupied|filled|reduced|obstructed)\s+by\s+(?:the\s+)?(?:piston\s+)?rod`,
            R`\b(?:because of|due to|caused by|owing to|thanks to|as a result of|since there is a|with the)\s+(?:the\s+)?(?:piston\s+)?rod\b${K(60)}\b(?:area|face|surface)`,
            R`\bring\b${K(15)}\b(?:of\s+)?(?:area|air)\b`,
            R`\b(?:ring|donut|doughnut|band|crescent|hollow)\b${K(25)}\b(?:round|around|about|surrounding|outside|beside)\b${K(15)}\brod`,
            R`\b(?:area|surface|face)\b${KC(40)}\b${SM}\b${KC(40)}\b(?:rod|instroke|in-?\s?stroke|rod end|rod side)`,
            R`\b(?:rod end|rod side|instroke|in-?\s?stroke)\b${KC(40)}\b(?:area|face|surface)\b${KC(30)}\b${SM}`,
            R`\b${SM}\s+(?:\w+\s+){0,2}(?:area|surface|face)\b${KC(40)}\b(?:rod|instroke|in-?\s?stroke)`,
            R`\b(?:area of|space taken by|room taken by)\s+(?:the\s+)?rod\b`,
            R`\b(?:rod|piston rod)\b${K(30)}\b(?:is|are|sits?|being)\s+(?:on|in|at)\s+(?:the\s+)?(?:same|that|rod|this)\s+side\b${K(40)}\b${SM}`,
          ],
        },
        {
          desc: "Force = pressure x area, so the same pressure on a smaller area gives a smaller force",
          group: "fpa",
          not: WRONGDIR,
          all: [FORM, R`\b${SM}\b`, R`\barea\b`],
          win: 200,
        },
        {
          desc: "Force = pressure x area, so the same pressure on a smaller area gives a smaller force",
          group: "fpa",
          not: WRONGDIR,
          any: [
            R`\b${SM}\s+(?:effective\s+|working\s+|piston\s+)?area\b${K(50)}\b${SM}\s+(?:\w+\s+){0,2}force`,
            R`\barea\b${K(40)}\b${SM}\b${K(50)}\bforce\b${K(30)}\b${SM}`,
            R`\b(?:same|equal|constant)\s+pressure\b${K(60)}\b${SM}\s+(?:\w+\s+){0,2}area\b${K(50)}\bforce`,
            R`\b(?:same|equal|constant)\s+pressure\b${K(60)}\barea\b${K(40)}\b${SM}\b${K(40)}\bforce`,
            R`\b(?:reduc\w*|decreas\w*|cuts?|lower\w*)\s+(?:the\s+)?(?:\w+\s+){0,2}area\b${K(70)}\b(?:force)\b${K(25)}\b${SM}`,
            R`\bforce\b${K(40)}\b(?:proportional|depends?|dependent)\b${K(30)}\barea\b${K(60)}\b${SM}`,
            R`\barea\b${K(60)}\b${SM}\b${K(85)}\b${SM}\s+(?:\w+\s+){0,2}force\b`,
            R`\b(?:takes?|taking|took|removes?|removing|uses?|using|reduces?|reducing|covers?|blocks?)\b${K(40)}\barea\b${K(50)}\bforce\b${K(30)}\b${SM}`,
            R`\b(?:out-?\s?strok\w*|cap end|full|whole)\b${K(90)}\barea\b${K(90)}\b${BIG}\s+(?:\w+\s+){0,2}force\b`,
            R`\b(?:greater|bigger|larger|more)\s+(?:\w+\s+){0,2}area\b${K(80)}\b(?:out-?\s?strok\w*|cap end)\b${K(90)}\bpressure\b${K(40)}\b${BIG}\s+(?:\w+\s+){0,2}force\b`,
          ],
        },
      ],
      sample: "The piston rod takes up part of the piston face on the rod side, so on the instroke the air pushes on a smaller area, the annulus. Force equals pressure times area, so the same pressure acting on the smaller area gives a smaller force.",
      model: R`<ul><li>On the instroke the air acts on the rod side of the piston, where the piston rod takes up part of the area, so the area is the smaller annulus $\pi(D^2 - d^2)/4$ (1)</li><li>$F = PA$ (or force = pressure × area), so the same pressure on a smaller area gives a smaller force (1)</li></ul><p>Also acceptable: &quot;the effective area is reduced by the area of the rod&quot;. Do not accept friction, &quot;the air is weaker&quot; or &quot;the spring pushes against it&quot;.</p>`,
    };
  }

  /* mechanisms-11(b): push-button, 5/2 valve, outstroke, release */
  {
    const ACT = R`(?:actuat\w*|press(?:ed|es|ing)?|depress\w*|operat\w*|activat\w*|triggered|pushed)`;
    const SREF = R`(?:s|valve s|button|push-?\s?button|3/2|three[- ]port)`;
    const CHG = R`(?:changes?\s+(?:its\s+)?(?:state|position)|changed\s+(?:state|position)|switch(?:es|ed)?|shifts?|shifted|flips?|actuat\w*|operat\w*|moves?\s+(?:over|across)|reverses)`;
    const VREF = R`(?:v|valve v|5/2|five[- ]port)`;
    const PRESS = R`(?:press\w*|push(?:es|ed|ing)?\b(?!\s+(?:it|them|this|back)\b)|depress\w*|actuat\w*|operat\w*|activat\w*|trigger\w*|hold\w*|held)`;
    const REL = R`(?:releas\w*|let(?:s|ting)?\s+go|lets go|removed|no longer (?:pressed|held|operated)|stops? being (?:pressed|held)|taken off|unpress\w*|stops? pressing|let go)`;
    const RET = R`(?:spring|return\w*|reset\w*|revert\w*|snaps? back|springs? back|flips? back|switch(?:es)? back|(?:changes?|goes?|moves?) back|back (?:to|into) (?:its |their |the )?(?:original|rest|normal|first|starting))`;
    const IN2 = R`(?:in-?\s?strok(?:es|ed|ing)?|retract\w*|(?:moves?|goes?|comes?|pulls?|pulled|travels?)\s+(?:back\s+)?in\b|(?:piston|cylinder|rod|ram|c)\s+(?:then\s+|also\s+)?(?:returns?|goes?\s+back|comes?\s+back|moves?\s+back)|withdraws?|(?:door|oven)\s+(?:closes|shuts))`;
    const VALVEY = R`(?:spring|pilot|signal|exhaust\w*|vent\w*|valve|\bv\b|\bs\b|\b14\b|\b12\b|rod end|port)`;
    const OUTW = R`(?:out-?\s?strok(?:es|e)\b|extends?\b|goes? (?:out|forward)|moves? (?:out|forward)|pushes? out|advances?)`;
    const ENDS = R`(?:exhaust\w*|vent\w*|remov\w*|cuts? off|stops?|release\w*|loses?|drops?|isolat\w*|blocks?|bleed\w*)`;
    const NOPIL = R`\bnothing\s+(?:happens|changes)|\bno\s+(?:pilot|signal)|\b(?:not|never|n't)\s+(?:\w+\s+){0,1}(?:change|shift|switch|flip|operate|actuate)`;
    const CAP = R`(?:air|pressure|flows?|suppl\w*|goes|go|gets?|enters?|reach\w*|sent|to|into|fills?|admitted)\s+(?:\w+\s+){0,2}(?:the\s+)?cap\b(?:\s+end)?`;
    TXT.simple = {
      points: [
        {
          desc: "Pressing the push-button: the 3/2 valve S actuates and air (a signal) goes to pilot port 14 of valve V",
          not: [R`\b${PRESS}${C(REL, 50)}\b${ENDS}\b${K(25)}(?:pilot|signal|14)`, NOPIL],
          all: [near(ACT, SREF, 5), R`(?:pilot|\b14\b)`],
          win: 140,
        },
        {
          desc: "The 5/2 valve V changes state, air goes to the cap end and the piston outstrokes",
          group: "v",
          not: [
            NOPIL,
            R`\b${REL}${K(60)}\b(?:supplies|supplied|sends|gives|applies|provides|admits|puts)\s+(?:\w+\s+){0,3}(?:pilot|14|signal)`,
            R`\b${PRESS}${C(R`${REL}|\bthen\b|\bwhen\b|\bafter\b`, 70)}\b${IN2}`,
            R`\b${REL}${K(60)}\b${OUTW}`,
          ],
          all: [R`${near(CHG, VREF, 6)}|\bchang\w+\s+(?:the\s+)?(?:v|valve v)\b`, OUT],
          win: 160,
        },
        {
          desc: "The 5/2 valve V changes state, air goes to the cap end and the piston outstrokes",
          group: "v",
          not: [
            NOPIL,
            R`\b${REL}${K(60)}\b(?:supplies|supplied|sends|gives|applies|provides|admits|puts)\s+(?:\w+\s+){0,3}(?:pilot|14|signal)`,
            R`\b${PRESS}${C(R`${REL}|\bthen\b|\bwhen\b|\bafter\b`, 70)}\b${IN2}`,
            R`\b${REL}${K(60)}\bcap\b${K(60)}\b${OUTW}`,
          ],
          all: [CAP, OUT],
          win: 120,
        },
        {
          desc: "On release S returns (spring), the pilot signal goes, V returns and the piston instrokes",
          not: [R`\b${REL}${K(160)}\b${OUTW}`],
          all: [R`${REL}`, R`${RET}`, R`\b${REL}[^;]{0,260}\b${IN2}`, R`${VALVEY}`],
          win: 200,
        },
      ],
      sample: "When push-button S is pressed, the 3/2 valve actuates and air is supplied to pilot port 14 of valve V. The 5/2 valve V changes state, so air is supplied to the cap end of cylinder C and the piston outstrokes, opening the door. When S is released it returns under spring force, the pilot signal is removed and V returns, so air is supplied to the rod end and the piston instrokes.",
      model: R`<ul><li>S (3/2 valve) actuates when pressed and supplies air to pilot port 14 of V (1)</li><li>V (5/2 valve) changes state: air is supplied to the cap end, the rod end exhausts, and the piston outstrokes (1)</li><li>When S is released it returns (spring), the pilot signal is exhausted and V returns (spring), so air goes to the rod end and the piston instrokes (1)</li></ul><p>Use the exact words: a 3/2 valve <em>actuates</em>, a 5/2 valve <em>changes state</em>, a piston <em>outstrokes</em> or <em>instrokes</em>. Do not accept &quot;the valve opens&quot; or &quot;the cylinder goes forward&quot; as the only description, and do not accept the two halves swapped (pressing S withdrawing the signal, releasing it supplying pilot 14).</p>`,
    };
  }

  /* mechanisms-12(b): A+ B+ A- B- */
  {
    const who = (l) => R`(?:(?:cylinder|piston|ram|rod)\s+${l}\b${K(25)}|\b${l}\s+(?:then\s+|now\s+|also\s+|to\s+|will\s+|can\s+|starts?\s+to\s+|begins?\s+to\s+|starts?\s+|begins?\s+)?)`;
    const OUT2 = R`(?:${OUT}|\bout\b)`;
    /* a result for cylinder l: words (piston A outstrokes) or the shorthand l+ / l- */
    const outS = (l) => R`\b${l}\s?\+(?![\w+])`;
    const inS = (l) => R`\b${l}\s?[-\u2212](?![\w-])`;
    const veto = (sig) => R`${sig}${K(14)}\b(?:not|never|n't)\b`;
    /* a signal and its result, in either order, with no other signal named in between (sentences may run on) */
    const S = (stop, n) => R`(?:(?!${stop})[\s\S]){0,${n}}`;
    /* words may come before or after the signal; the shorthand (A+, B-) only after it, as "a1 ... B+", so the question's own "A+ B+ A- B-" cannot match */
    const step = (sig, stop, res, short) => [R`${sig}${S(stop, 170)}${res}`, R`${res}${S(stop, 170)}${sig}`, R`${sig}${S(stop, 110)}${short}`];
    TXT.seq = {
      points: [
        { desc: "START is pressed (with b0 pressed): pilot 14 of valve A, which changes state, and piston A outstrokes", not: [veto(R`\bstart\b`)], any: step(R`\bstart\b`, R`\ba\s?[01]\b|\bb\s?1\b`, who("a") + OUT2, outS("a")) },
        { desc: "Piston A actuates a1, which supplies pilot 14 of valve B, so B changes state and piston B outstrokes", not: [veto(R`\ba\s?1\b`)], any: step(R`\ba\s?1\b`, R`\bstart\b|\ba\s?0\b|\bb\s?[01]\b`, who("b") + OUT2, outS("b")) },
        { desc: "Piston B actuates b1, which supplies pilot 12 of valve A, so A changes state and piston A instrokes", not: [veto(R`\bb\s?1\b`)], any: step(R`\bb\s?1\b`, R`\bstart\b|\ba\s?[01]\b|\bb\s?0\b`, who("a") + IN, inS("a")) },
        { desc: "Piston A actuates a0, which supplies pilot 12 of valve B, so B changes state and piston B instrokes", not: [veto(R`\ba\s?0\b`)], any: step(R`\ba\s?0\b`, R`\bstart\b|\ba\s?1\b|\bb\s?[01]\b`, who("b") + IN, inS("b")) },
      ],
      sample: "When START is pressed, with b0 already pressed, air is supplied to pilot 14 of valve A. Valve A changes state and piston A outstrokes. At the end of its stroke a1 is actuated by piston A and supplies pilot 14 of valve B, so valve B changes state and piston B outstrokes. Then b1 is actuated by piston B, which supplies pilot 12 of valve A, so valve A changes state and piston A instrokes. Finally a0 is actuated by piston A, which supplies pilot 12 of valve B, so valve B changes state and piston B instrokes.",
      model: R`<ul><li>START is pressed (b0 is already pressed), so air reaches pilot 14 of valve A; valve A changes state and piston A outstrokes (1)</li><li>Piston A actuates limit valve a1, which supplies pilot 14 of valve B; valve B changes state and piston B outstrokes (1)</li><li>Piston B actuates b1, which supplies pilot 12 of valve A; valve A changes state and piston A instrokes (1)</li><li>Piston A actuates a0, which supplies pilot 12 of valve B; valve B changes state and piston B instrokes (1); the cycle then waits for START</li></ul><p>Each step needs its limit valve and its result. Writing only &quot;A+ then B+ then A− then B−&quot; repeats the question and earns nothing. Say <em>actuates</em> for the limit valves, <em>changes state</em> for the 5/2 valves, <em>outstrokes</em> or <em>instrokes</em> for the pistons.</p>`,
    };
  }

  /* mechanisms-13(b): the latch */
  {
    const CONTACT = R`(?:contacts?|switch)`;
    TXT.latch = {
      points: [
        {
          desc: "When S1 is pressed relay K1 is energised and its contact closes",
          group: "k1",
          all: [R`(?:\bk1\b|relay|coil)`, CONTACT, R`(?:clos\w*|make\w*|made|shut|join\w*|connect\w*|complet\w*)`],
          win: 110,
        },
        {
          desc: "When S1 is pressed relay K1 is energised and its contact closes",
          group: "k1",
          all: [CONTACT, R`(?:parallel|across\s+s1|bypass\w*|alongside|latch\w*)`],
          win: 110,
        },
        {
          desc: "The contact is in parallel with S1 (a latch), giving the current another path, so K1 and Y1 stay energised after S1 is released",
          all: [
            R`(?:contacts?|parallel|bypass\w*|latch\w*|self-?hold\w*|hold(?:s|ing)?\s+(?:itself|it)\s+on|hold-?on|(?:another|alternative|second|different|own|extra|separate)\s+(?:current\s+)?(?:path|route|way)|(?:path|route|way)\s+for\s+(?:the\s+)?current|(?:round|around|across)\s+s1)`,
            R`(?:stay\w*|remain\w*|keep\w*|continu\w*|maintain\w*|holds?|still|even after|even though|although)`,
            R`(?:energi[sz]\w*|\bon\b|live|current|power\w*|flow\w*|supplied|holds?\s+(?:itself\s+)?in\b|stays?\s+(?:in|closed|latched)\b|latched|pulled in)`,
            R`(?:parallel|bypass\w*|latch\w*|self-?hold\w*|hold(?:s|ing)?\s+(?:itself|it)\s+on|hold-?on|(?:another|alternative|second|different|own|extra|separate)\s+(?:current\s+)?(?:path|route|way)|(?:path|route|way)\s+for\s+(?:the\s+)?current|(?:round|around|across)\s+s1)`,
          ],
          win: 170,
        },
      ],
      sample: "When S1 is pressed, relay K1 is energised and its contact, wired in parallel with S1, closes. This gives the current another path round S1, so K1 stays energised after S1 is released and Y1 keeps its current.",
      model: R`<ul><li>Pressing S1 energises K1, so the K1 contact that is wired in parallel with S1 closes (1)</li><li>That contact gives the current a second path (a latch or hold-on), so K1 stays energised, and with it Y1, after S1 is released (1)</li></ul><p>Also acceptable: &quot;K1 holds itself on&quot;, &quot;self-latching&quot;. A statement that only repeats &quot;K1 keeps Y1 energised&quot; without the parallel contact earns at most one mark.</p>`,
    };
  }

  /* mechanisms-14(a): V-belt v chain for a dough mixer */
  {
    const BS = R`\bbelts?\b${C(R`chain|\bnot\b|n't|\bnever\b|\bcannot\b|\bno\b`, 24)}\bslip`;
    const JAMW = R`(?:jam\w*|overload\w*|stuck|stall\w*|seiz\w*|protect\w*|safety|damag\w*|block\w*|snag\w*|too (?:much|heavy|stiff)|stiff|struggl\w*|overheat\w*|burn\w*)`;
    const BNOSLIP = R`\bbelts?\b${C("chain", 22)}\b(?:does ?n'?t|doesn't|do not|never|cannot|can't|won't|will not|not)\s+(?:\w+\s+){0,2}slip`;
    const RBAD = R`(?:vary|varies|varying|inaccura\w*|inexact|imprecise|not\s+(?:exact|accurate|precise|constant|fixed|positive|steady)|isn't\s+(?:exact|accurate|precise|constant|fixed)|lag\w*|lost|loses|lose|out of (?:step|time|sync|phase)|changes?|drops?|falls?|reduced|slower|uneven|unreliable|not\s+the\s+same)`;
    const GOOD = R`(?:exact|accurate|precise|constant|fixed|positive|correct|steady|synchron\w*)`;
    const NOCH = R`\bchains?\b${C(R`belt|\bnot\b|n't|\bnever\b|\bcannot\b|\bno\b`, 25)}\bslip`;
    const NOILCH = R`\bchains?\b${C("belt", 40)}\b(?:no|not|without|doesn'?t|does not|don'?t|never)\s+(?:\w+\s+){0,3}(?:oil\w*|lubricat\w*|grease\w*|lubricant)`;
    TXT.drive = {
      points: [
        {
          desc: "A belt slips if the mixer jams or overloads, which protects the motor and drive (a chain would stall or break)",
          group: "slipjam", negOK: true,
          not: [NOCH, BNOSLIP],
          all: [BS, JAMW],
          win: 140,
        },
        {
          desc: "A belt slips if the mixer jams or overloads, which protects the motor and drive (a chain would stall or break)",
          group: "slipjam", negOK: true,
          not: [NOCH, BNOSLIP, R`\bnot\s+slip`],
          all: [R`\bslips?\b|\bslipped\b|\bslipping\b|\bslide`, JAMW, R`\bbelts?\b`],
          win: 90,
        },
        {
          desc: "A belt slips if the mixer jams or overloads, which protects the motor and drive (a chain would stall or break)",
          group: "slipjam", negOK: true,
          not: [R`\bchains?\b${C(R`belt|\bnot\b|n't|\bnever\b|\bcannot\b|\bno\b`, 25)}\bslip`],
          all: [R`\bchains?\b${C("belt", 50)}\b(?:stall\w*|snap\w*|break\w*|breaks|damag\w*|seiz\w*|burn\w*|strain\w*|fail\w*)`, R`(?:motor|machine|mixer|drive|gearbox|dough)`],
          win: 140,
        },
        {
          desc: "A chain needs oil or grease (which could contaminate food); a belt runs dry and clean",
          group: "oil",
          negOK: true,
          not: [NOILCH, R`\bbelts?\b${C("chain", 20)}\b(?:not|isn't|is not|never)\s+(?:\w+\s+){0,2}(?:dry|clean|hygien\w*)`,
            R`\bbelts?\b${C("chain", 30)}\b(?:need\w*|require\w*|use\w*)\s+(?:some\s+|regular\s+|lots of\s+|a lot of\s+|plenty of\s+|frequent\s+)?(?:oil\w*|lubricat\w*|grease\w*)`],
          any: [
            R`\bchains?\b${C("belt", 60)}\b(?:oil\w*|lubricat\w*|grease\w*|greasy|drip\w*|lubricant)`,
            R`\b(?:oil\w*|lubricat\w*|grease\w*|lubricant)\b${C("belt", 45)}\bchains?\b`,
            R`\bbelts?\b${C("chain", 60)}\b(?:dry|clean|oil-?free|hygien\w*|food[- ]safe)`,
            R`\b(?:oil|lubricat\w*|grease)\w*${K(50)}\b(?:contaminat\w*|hygien\w*|bakery|food|dough)`,
            R`\bbelts?\b${C("chain", 40)}\b(?:no|not|without|doesn'?t|does not|don'?t|never)\s+(?:\w+\s+){0,3}(?:oil\w*|lubricat\w*|grease\w*|lubricant)`,
          ],
        },
        {
          desc: "A chain does not slip, so the speed ratio is exact; a belt can slip, so its ratio is not exact",
          group: "ratio",
          negOK: true,
          not: [
            R`\bchains?\b${C("belt", 20)}\b(?:not|isn't|is not|never)\s+(?:a\s+)?(?:positive|exact|accurate|precise)`,
            NOCH,
            R`\bchains?\b${C(R`belt|\bnot\b|n't|\bnever\b|\bno\b|\bcannot\b|${GOOD}`, 40)}\b${RBAD}`,
            R`\bchains?\b${C("belt", 25)}\b(?:does ?n'?t|doesn't|do not|never|cannot|can't|not)\s+slip\w*${C(R`belt|${GOOD}|exact|accura|precise`, 30)}\b(?:vary|varies|varying|inaccura\w*|lag\w*|lose|loses|lost|change\w*|drops?|uneven|out of (?:step|time|sync))`,
            R`\bbelts?\b${C(R`chain|\bnot\b|n't|\bnever\b|\bno\b|\bcannot\b|${RBAD}`, 30)}\b${GOOD}\s+(?:\w+\s+){0,1}(?:ratio|speed|drive|transmission)`,
            R`\bbelts?\b${C(R`chain|\bnot\b|n't|\bnever\b|\bno\b|\bcannot\b`, 25)}\bslips?\b${C(R`chain|\bnot\b|n't|\bnever\b|\bno\b|\bcannot\b|${RBAD}|jam|overload|protect`, 30)}\b${GOOD}\b`,
            BNOSLIP,
          ],
          any: [
            R`\bchains?\b${C("belt", 30)}\b(?:positive|synchron\w*)`,
            R`\bchains?\b${C("belt", 40)}\b${GOOD}\s+(?:\w+\s+){0,1}(?:ratio|speed)`,
            R`\bchains?\b${C("belt", 30)}\b(?:does ?n'?t|doesn't|do ?n'?t|cannot|can't|never|will not|won't|would not|does not|do not|can not|no)\s+slip`,
            R`\b${GOOD}\s+(?:\w+\s+){0,1}(?:speed\s+)?ratio\b${C("belt", 50)}\bchains?\b`,
            R`\bbelts?\b${C(R`chain|\bnot\b|n't|\bnever\b|\bno\b|\bcannot\b`, 25)}\bslip\w*${C(R`chain|jam|overload|protect|${GOOD}`, 50)}\b(?:speed|ratio|${RBAD})`,
            R`\bbelts?\b${C("chain", 40)}\b(?:inexact|not\s+(?:exact|accurate|precise|positive)|inaccura\w*|imprecise)`,
          ],
        },
        {
          desc: "A belt is quieter, cheaper or lighter; or a chain carries more torque and lasts longer (a chain is noisy and stretches)",
          group: "other",
          negOK: true,
          not: [
            R`\bbelts?\b${C("chain", 40)}(?:\bnot|n't|\bnever)\s+(?:\w+\s+){0,2}(?:quiet\w*|silent|smooth\w*|cheap\w*|light\w*|simpl\w*)`,
            R`\bchains?\b${C("belt", 40)}(?:\bnot|n't|\bnever)\s+(?:\w+\s+){0,2}(?:nois\w*|loud|rattl\w*|stretch\w*|wear\w*|heav\w*|expensive|costly|stronger|robust|durable)`,
            R`\bchains?\b(?:\s+drive)?\s+(?:is|are)\s+(?:the\s+|a\s+)?(?:better|best|superior|preferable|ideal|good|great)${K(30)}\b(?:because|as|since|so)\b${K(20)}\b(?:it|they)\s+(?:is|are)\s+(?:\w+\s+){0,2}(?:nois\w*|loud|heav\w*|expensive|costly|rattl\w*|stretch\w*)`],
          any: [
            R`\bbelts?\b${C("chain", 70)}\b(?:quiet\w*|silent|less noisy|smooth\w*|cheap\w*|light\w*|simpl\w*)`,
            R`\bchains?\b${C("belt", 40)}\b(?:nois\w*|loud|rattl\w*|stretch\w*|wear\w*|heav\w*|expensive|costly)`,
            R`\bchains?\b${C("belt", 40)}\b(?:stronger|more\s+(?:robust|durable)|longer[- ]lasting|lasts?\s+longer|(?:higher|greater|more|larger|bigger)\s+(?:torque|power|load)|(?:carr\w+|transmit\w*|handl\w*)\s+(?:\w+\s+){0,2}(?:torque|power|load))`,
          ],
        },
      ],
      sample: "A V-belt will slip if the dough jams the mixer, which protects the motor, but a chain could stall the motor or break. A chain needs oil, which could contaminate the food, but a belt runs dry and clean. A chain is a positive drive, so it keeps an exact speed ratio, but a belt can slip so its speed can vary. A belt is also quieter than a chain, though a chain can carry more torque.",
      model: R`<ul><li>A belt slips if the mixer jams, protecting the motor (a chain would stall the motor or snap) (1)</li><li>A chain needs lubricating oil, which is a contamination risk in a food area; a belt needs none and stays clean (1)</li><li>A chain cannot slip, so the speed ratio is exact; a belt can slip, so its ratio is not exact (1)</li><li>Any one more: the belt is quieter, cheaper or lighter; the chain carries a larger torque, lasts longer, or is noisy and stretches (1)</li></ul><p>Each mark is a property <em>linked to the mixer</em> and a comparison. A bare &quot;a chain is strong&quot; or &quot;a belt is better&quot; earns nothing. Do not accept a chain slipping, or a belt being a positive drive.</p>`,
    };
  }

  /* mechanisms-15: flexible coupling, thrust bearing, clutch */
  {
    /* up to n characters of one clause that does not turn to a new idea (and, but, so, which...) */
    const CL = (n) => R`(?:(?!\band\b|\bbut\b|\bso\b|\bwhich\b|\bbecause\b|\bwhile\b|\bwhereas\b|\bthat\b)[^.;,]){0,${n}}`;
    const NEGV = R`(?:cannot|can't|can not|can\s+never|unable to|(?:does|do|did|will|would|could|should)\s?n'?o?t|doesn't|don't|won't|not|never|fails? to|no\s+(?:ability|way|power|capacity)\s+to)`;
    const GIVE = R`(?:cope|allow|tolerat|accommodat|accept|deal|handle|take|compensat|stand|permit|adjust|manage|put up|work|function|operate)`;
    const AB = R`(?:absorb|damp|cushion|soak|reduc|smooth|isolat|protect|cope|deal|handle|tolerat|withstand|accommodat|prevent|stop|tak(?:e|es|ing)\s+up|dissipat|lessen|minimi[sz]e)`;
    const SHK = R`(?:shocks?|vibrat\w*|jerks?|jolts?|judder\w*|sudden\s+(?:load|start|stop|torque|jerk)s?|surg\w+|snatch\w*)`;
    const TRANS = R`(?:transmits|passes|sends|carries|(?:will|would|can|could|just|simply|also|still|directly|fully|all)\s+(?:also\s+)?(?:transmit|pass|send|carry))`;
    TXT.flex = {
      points: [
        {
          desc: "It copes with a small misalignment between the motor shaft and the gearbox shaft",
          group: "mis", negOK: true,
          not: [
            R`\brigid\b${C(NEGS, 40)}\b${GIVE}\w*${K(25)}misalign`,
            R`\bflexible\b${K(30)}\b(?:cannot|can't|can not|does not|doesn't|will not|won't|unable)\b${K(50)}misalign`,
            R`\b${NEGV}\b${CL(30)}\b${GIVE}\w*${K(30)}misalign`,
            R`\bno\s+(?:\w+\s+)?(?:allowance|tolerance|provision|room|give|flexibility|movement|play|compensation|capacity)\b${K(25)}misalign`,
            R`\bmisalign\w*${K(15)}\b(?:is|are|would be|will be)\s+(?:a\s+|an\s+)?(?:problem|issue|not (?:allowed|possible|tolerated|accepted)|impossible|bad)`,
            R`\bwithout\s+(?:any\s+)?(?:allowance|tolerance|provision|room|flexibility)\b${K(25)}misalign`,
          ],
          any: [R`\bmisalign\w*`, R`\bnot\s+(?:\w+\s+){0,2}(?:perfectly\s+)?(?:aligned|lined up|in line)`, R`\b(?:slight|small|minor|little|tiny)\s+(?:\w+\s+){0,1}(?:error|errors|offset|difference|gap|misfit|movement)`, R`\bout of (?:line|alignment|true)`, R`\boff[- ]cent\w*|\boff[- ]line\b|\bnot\s+(?:\w+\s+){0,2}(?:central|concentric|straight|true|exactly (?:aligned|in line))`],
        },
        {
          desc: "It absorbs shock loads and vibration (for example when the conveyor starts)",
          group: "shock", negOK: true,
          not: [
            R`\brigid\b${C(NEGS, 30)}\b(?:absorb\w*|damp\w*|cushion\w*)`,
            R`\bflexible\b${K(30)}\b(?:cannot|can't|can not|does not|doesn't|will not|won't|unable)\b${K(50)}(?:absorb\w*|damp\w*|cushion\w*)`,
            R`\b${NEGV}\b${CL(30)}\b${AB}\w*${K(25)}\b${SHK}`,
            R`\b${NEGV}\b${CL(20)}\b(?:absorb|damp|cushion|soak)\w*`,
            R`\b${TRANS}\s+(?:on\s+|across\s+)?(?:all\s+|any\s+|the\s+|every\s+|most\s+of\s+the\s+|these\s+|those\s+|its\s+)*(?:\w+\s+)?${SHK}`,
            R`\b${SHK}${K(30)}\b(?:is|are)\s+(?:all\s+|then\s+|just\s+|simply\s+|fully\s+)?(?:transmitted|passed|sent|carried)`,
          ],
          any: [
            R`\b${AB}\w*${K(40)}\b${SHK}`,
            R`\b${SHK}\w*\b${K(30)}\b(?:absorb|damp|cushion|soak|reduc|smooth|protect|isolat)\w*`,
            R`\b(?:shock|vibration)[- ]?(?:absorb|damp|proof|resist)\w*`,
            R`\bprotect\w*\s+(?:the\s+)?(?:motor|gearbox|gears?|bearings?|shafts?|machine)`,
            R`\bsoft(?:en)?s?\s+(?:the\s+)?(?:start|load|shock)`,
            R`\babsorb\w*\s+(?:the\s+)?(?:\w+\s+){0,2}(?:load|force|impact|movement)`,
          ],
        },
      ],
      sample: "A flexible coupling allows for small misalignment between the motor shaft and the gearbox shaft, and it absorbs shock loads and vibration when the conveyor starts.",
      model: R`<ul><li>It allows for (small) misalignment between the two shafts (1)</li><li>It absorbs shock loads or vibration, so the motor and gearbox are not damaged (1)</li></ul><p>Also acceptable: it protects the bearings from side loads, and it copes with small changes in shaft position as the machine warms up. Do not accept &quot;it joins the shafts&quot; (a rigid coupling does that too) or &quot;it is cheaper&quot;, or a claim that a flexible coupling cannot cope with misalignment or passes shocks on to the gearbox.</p>`,
    };
  }
  TXT.thrust = {
    points: [
      {
        desc: "The worm pushes along its own shaft, so there is an axial (end) load that the thrust bearing carries",
        all: [
          R`\b(?:axial|axially|along\s+(?:the\s+|its\s+|their\s+)?(?:own\s+)?(?:axis|shaft|length)|end\s*(?:load|thrust|force)|thrust\s+(?:load|force)|lengthways|longways|parallel\s+to\s+(?:the\s+)?(?:shaft|axis))`,
          R`\b(?:carr\w*|support\w*|take[sn]?|taking|withstand\w*|resist\w*|absorb\w*|handl\w*|cop(?:e|es|ing)|stop\w*|prevent\w*|hold\w*|against|deal\w*|bear\w*)\b`,
        ],
        not: [
          R`(?:\bno\b|\bnot\b(?!\s+only)|n't|\bnever\b|\bcannot\b|\bwithout\b|\bnor\b|\bneither\b)(?:(?!\band\b|\bbut\b|\bso\b|\bwhich\b|\bbecause\b|\bthat\b)[^.;,]){0,40}\b(?:axial|axially|along|end\s*(?:load|thrust|force)|thrust|lengthways|longways|parallel)`,
          R`\b(?:axial|end\s*(?:load|thrust|force)|thrust\s+(?:load|force))\b(?:(?!\band\b|\bbut\b|\bso\b|\bwhich\b)[^.;,]){0,25}\b(?:not|never|cannot|can't|unable)\s+(?:be\s+)?(?:carr|support|take|withstand|resist|handl|bear|stop)\w*`,
        ],
        win: 110,
      },
    ],
    sample: "The teeth of the worm push it along its own shaft, and the thrust bearing carries this axial load.",
    model: R`<ul><li>The worm pushes sideways along its own shaft (an axial or thrust load), and the thrust bearing is designed to carry a load along the shaft (1)</li></ul><p>Do not accept &quot;to reduce friction&quot; on its own, or a radial load: a radial bearing carries loads across the shaft.</p>`,
  };
  {
    const SLIP = R`(?:slip\w*|slid\w*|skid\w*|slither\w*)`;
    const IMM = R`(?:immediate\w*|instant\w*|straight\s?away|right\s+away|at\s+once|straight\s+off|suddenly|abrupt\w*)`;
    /* "does not slip" only counts against the answer when it never says the plates slip at first */
    const NOSLIP = R`^(?![\s\S]*\b(?:at first|initially|to begin|to start|begin\w*|start\w*|first|then|until|once|when|after|eventually|finally|before)\b)[\s\S]*\b(?:does ?n'?t|do not|never|cannot|can't|won't|will not|not|no)\s+(?:\w+\s+){0,2}${SLIP}`;
    const EASY = R`(?:gradual\w*|gentl\w*|smooth\w*|progress\w*|slowly|soft\w*|eas(?:e|es|ed|ing)\b|builds? up|picks? up|tak(?:es|ing|e)\s+up|slow\w*)`;
    const MOTORFIRST = R`\bmotor\b${K(40)}\b(?:speed\w*|reach\w*|gets?|gain\w*|build\w*|attain\w*|accelerat\w*)\b${K(50)}\b(?:before|until|while)\b`;
    TXT.clutch = {
      points: [
        {
          desc: "The friction plates slip at first, so the load is taken up gradually (no jerk)",
          group: "slip", not: [NOSLIP],
          all: [R`\b${SLIP}`, R`(?:${EASY}|${MOTORFIRST}|\bbefore\b${K(40)}\b(?:load|conveyor|driven|drive)\w*)`],
          win: 150,
        },
        {
          desc: "The friction plates slip at first, so the load is taken up gradually (no jerk)",
          group: "slip", negOK: true, not: [NOSLIP],
          all: [R`\b${SLIP}`, R`(?:without|no|avoid\w*|prevent\w*|stops?)\s+(?:a\s+|any\s+)?(?:sudden\s+)?(?:jerk\w*|shock\w*|snatch\w*|lurch\w*|jolt\w*)`],
          win: 130,
        },
        {
          desc: "When both plates reach the same speed they lock together and the drive passes through (or the motor reaches speed before the conveyor is fully driven)",
          group: "lock", negOK: true,
          not: [
            R`(?:does ?n'?t|doesn't|does not|never|cannot|can't|won't|will not)\s+(?:\w+\s+){0,2}lock`,
            R`\block\w*${Cc(R`\bthen\b|\buntil\b`, 40)}\b${IMM}`,
            R`\b${IMM}${Cc(R`\bthen\b|\buntil\b`, 40)}\block\w*`,
            R`\b(?:engage\w*|grip\w*|connect\w*)${Cc(R`\bthen\b|\buntil\b`, 25)}\b${IMM}`,
            NOSLIP,
          ],
          any: [R`\block\w*`, R`\b(?:same|equal|matching|matched)\s+(?:\w+\s+){0,1}(?:speed|rate)`, R`\bstops?\s+slipping`, R`\bno\s+(?:more\s+)?slip\w*`, R`\b(?:fully|firmly|tightly|completely)\s+(?:engage\w*|grip\w*|clamp\w*|press\w*|driven|drives?)`, R`\b(?:engage\w*|grip\w*|clamp\w*)\s+(?:fully|firmly|tightly|completely)`, R`\bspeeds?\s+(?:\w+\s+){0,2}(?:match\w*|equal|same)`, R`\bmatch\w*\s+(?:the\s+)?speeds?`, R`\bcatch(?:es)?\s+up`, R`\b(?:turn|rotat|spin|move|run)\w*\s+together`, R`\bas one\b|\b(?:pressed|squeezed|clamped|held|pushed|joined|forced)\s+together`
          ],
        },
        {
          desc: "When both plates reach the same speed they lock together and the drive passes through (or the motor reaches speed before the conveyor is fully driven)",
          group: "lock", not: [NOSLIP],
          all: [R`\b${SLIP}`, R`\bmotor\b${K(40)}\b(?:reach\w*|get|gets|gain\w*|attain\w*)\b${K(30)}\b(?:running|full|operating|working|normal|its)\s+speed|\bbefore\b${K(40)}\b(?:fully|completely|full)\s+(?:driven|loaded|load|engaged|connected|drive)`],
          win: 150,
        },
      ],
      sample: "The friction plates slip against each other at first, so the load is taken up gradually and the conveyor starts smoothly. When both plates reach the same speed they lock together and the drive passes through without slip.",
      model: R`<ul><li>The clutch plates slip at first (friction between the plates), so the conveyor is brought up to speed gradually and smoothly, with no jerk (1)</li><li>When the two plates reach the same speed they lock together, and the full drive passes through (1)</li></ul><p>Also acceptable: &quot;the clutch slips while taking up the load, so the motor reaches its running speed before the conveyor is fully driven&quot; (1 for the slip taking up the load gradually, 1 for the motor reaching speed before the full drive). Do not accept &quot;it connects the motor to the conveyor&quot; with no mention of slip or gradual starting, or plates that lock together at once with no slip.</p>`,
    };
  }

  B.mechanisms = {
    intro:
      "<p>Drives and pneumatics is worth <strong>15 to 30 marks</strong> of the paper. Fifteen questions, about eighty marks: power and torque, gear trains, belts, chains and worms, couplings, bearings, clutches and brakes, then pneumatic force, symbols, sequence circuits and a latching relay. Roughly half the marks are calculations, so convert rev/min to rev/s before using $P = 2\\pi nT$ and halve a diameter before using $T = Fr$. The written marks reward the <strong>exact words</strong>: a 3/2 valve <em>actuates</em>, a 5/2 valve <em>changes state</em>, a piston <em>outstrokes</em> or <em>instrokes</em>.</p>",
    questions: [
      {
        id: "mechanisms-01",
        style: "Section 1 · short answer · power in a rotating shaft",
        stem: R`<p>A motor on a model capstan turns at <strong>1450 rev/min</strong> and delivers a torque of <strong>12.5 N m</strong> to its shaft.</p>`,
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 1898, tol: 3, unit: "W",
            q: R`Calculate the power delivered by the motor shaft, in watts.`,
            why: R`<p>$n = 1450 \div 60 = 24.17\ \text{rev s}^{-1}$ (the Data Booklet needs revolutions per <em>second</em>)</p><p>$P = 2\pi nT = 2\pi \times 24.17 \times 12.5$ (1)</p><p>$P = 1898\ \text{W}$ (1)</p><p>Putting 1450 straight into the formula gives about 114 000 W, sixty times too big.</p>`,
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 2,
            q: R`The motor now drives a reduction gearbox that halves the shaft speed. Ignoring losses, what happens to the torque at the gearbox output?`,
            opts: [R`It is halved`, R`It stays the same`, R`It doubles`, R`It is multiplied by four`],
            why: R`With no losses the power stays the same, and $P = 2\pi nT$, so if $n$ halves then $T$ must double. Halved torque and unchanged torque both forget that power is conserved; four times would need the speed to fall to a quarter.`,
          },
        ],
      },
      {
        id: "mechanisms-02",
        style: "Section 1 · short answer · hoist drum, torque and rope speed",
        stem: R`<p>A hoist lifts a load that hangs from a rope wound on a drum of <strong>diameter 320 mm</strong>. The tension in the rope is <strong>3.6 kN</strong>.</p>`,
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 576, tol: 0.5, rtol: 0.01, unit: "N m",
            q: R`Calculate the torque the drum shaft must supply to hold the load, in N m.`,
            why: R`<p>$r = d \div 2 = 0.320 \div 2 = 0.160\ \text{m}$ (1)</p><p>$T = Fr = 3600 \times 0.160$</p><p>$T = 576\ \text{N m}$ (1)</p><p>Using the diameter instead of the radius doubles the answer to 1152 N m.</p>`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 0.754, tol: 0.002, rtol: 0.01, unit: "m s⁻¹",
            q: R`The drum turns at <strong>45 rev/min</strong>. Calculate the speed of the rope, in m s⁻¹.`,
            why: R`<p>$n = 45 \div 60 = 0.75\ \text{rev s}^{-1}$ (1)</p><p>$v = \pi d n = \pi \times 0.320 \times 0.75$</p><p>$v = 0.754\ \text{m s}^{-1}$ (1)</p><p>Each turn pays out one circumference, $C = \pi d$, of rope. Leaving the speed in rev/min gives 45 m s⁻¹, sixty times too big.</p>`,
          },
        ],
      },
      {
        id: "mechanisms-03",
        style: "Section 1 · match · couplings, bearings, clutches and brakes",
        stem: R`<p>On a ship's winch the motor turns the drum through several machine parts. Each part has a different job.</p>`,
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: R`Match each machine part to the job it does.`,
            pairs: [
              ["Flexible coupling", "Joins two shafts and copes with small misalignment and shock loads"],
              ["Thrust bearing", "Carries a load that acts along the length of the shaft"],
              ["Clutch", "Connects and disconnects the drive, slipping briefly as it takes up the load"],
              ["Brake", "Uses friction to change the kinetic energy of the machine into heat"],
            ],
            why: "A flexible coupling joins shafts that are not perfectly in line and cushions shock. A thrust bearing takes the axial load that a plain bearing cannot. A clutch connects and disconnects the drive, and slips for a moment as the load is taken up. A brake does not transmit power: it uses friction to turn kinetic energy into heat and so slows the machine.",
          },
        ],
      },
      {
        id: "mechanisms-04",
        style: "Section 1 · identify · pneumatic valve symbols",
        stem: R`<p>The figure shows four pneumatic valve symbols, labelled A to D. Each is drawn in its rest position.</p>`,
        figure: figSymbols(),
        parts: [
          {
            label: "(a)", type: "multi", marks: 2, a: [1, 3],
            q: R`Choose <strong>two</strong> correct statements about the valves in the figure.`,
            opts: [
              "Valve A is a limit valve, tripped by the piston rod",
              "Valve B has a roller, so it can be a limit valve tripped by the piston rod",
              "Valve C has memory, so it stays where the last signal left it",
              "Valve D has memory, because it has a pilot at each end and no spring",
              "Valves A and D are both three-port two-position valves",
            ],
            why: R`Valve B has a roller on one side and a spring on the other: it is a 3/2 roller limit valve. Valve D has a pilot signal at each end and no spring, so nothing pushes it back and it stays where the last pilot signal left it. Valve A is operated by a push-button, not a roller, so it is not a limit valve. Valve C has a spring, so it returns when the signal goes. Valve D has five ports, so it is a 5/2 valve, not a 3/2 valve.`,
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 1,
            q: R`In its rest position, which ports of valve C are joined?`,
            opts: ["1 to 4, and 2 to 3", "1 to 2, and 4 to 5", "1 to 2 only, with port 4 blocked", "3 to 5, with all the other ports blocked"],
            why: R`At rest the spring holds the valve in the state shown by the box beside the port connections (the right-hand box, next to the spring). That box joins supply 1 to outlet 2 and outlet 4 to exhaust 5. The left-hand box (1 to 4 and 2 to 3) is the state when pilot 14 is applied.`,
          },
        ],
      },
      {
        id: "mechanisms-05",
        style: "Section 2 · context question · idler gear train, speed and torque",
        stem: R`<p>The model winch on the <em>HMS Ratchet</em> display uses the gear train in the figure. Gear A (20 teeth) is fixed to the motor shaft and turns clockwise at <strong>1800 rev/min</strong>. It drives gear B, an idler with 30 teeth, which drives gear C (80 teeth) on the winch drum. The motor shaft supplies a torque of <strong>6.0 N m</strong> and the efficiency of the gear train is <strong>92%</strong>.</p>`,
        figure: figIdler(),
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 4, alts: [1], tol: 0.01, unit: "",
            q: R`Calculate the velocity ratio of the gear train, $\text{VR} = \dfrac{\text{teeth on driven gear}}{\text{teeth on driver gear}}$. Give it as a single number.`,
            why: R`$\text{VR} = \dfrac{\text{teeth on driven gear C}}{\text{teeth on driver gear A}} = \dfrac{80}{20} = 4$ (1), which is a 4 : 1 reduction (typing 4 : 1 is accepted). Only the first and last gears count: the idler's teeth cancel. Slips: inverting the fraction gives 0.25, and counting the idler as the driven gear gives $30/20 = 1.5$ or $80/30 = 2.67$.`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 450, alts: [7.5], tol: 0.5, unit: "rev/min",
            q: R`Calculate the speed of gear C, in rev/min.`,
            why: R`$n_{out} = \dfrac{n_{in}}{\text{VR}} = \dfrac{1800}{4} = 450\ \text{rev/min}$ (1) (the same as 7.5 rev s$^{-1}$, which is also accepted). Or from the Data Booklet: input speed × input size = output speed × output size, so $1800 \times 20 = n \times 80$. Multiplying by the ratio instead of dividing gives 7200 rev/min, which would be faster than the motor.`,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 1,
            q: R`In which direction does gear C turn?`,
            opts: ["Anticlockwise, opposite to gear A", "Clockwise, the same as gear A", "It depends on the number of teeth on the idler", "It cannot turn, because an idler locks the train"],
            why: R`Each pair of meshing gears reverses the direction of rotation. A to B reverses it and B to C reverses it again, so C turns the same way as A: clockwise. The idler only decides the direction, not the ratio, and it does not lock anything.`,
          },
          {
            label: "(d)", type: "num", marks: 2, a: 22.08, tol: 0.5, unit: "N m",
            q: R`Calculate the output torque of the gear train, in N m.`,
            why: R`<p>$T_{out} = T_{in} \times \text{VR} \times \eta$ (1)</p><p>$T_{out} = 6.0 \times 4 \times 0.92 = 22.1\ \text{N m}$ (1)</p><p>An ideal train would give 24 N m; the 8% loss takes off the rest.</p>`,
          },
          {
            label: "(e)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: R`Explain, in terms of speed and torque, why a reduction gear train is fitted between the motor and the winch drum.`,
            points: TXT.reduct.points,
            sample: TXT.reduct.sample,
            model: TXT.reduct.model,
          },
        ],
      },
      {
        id: "mechanisms-06",
        style: "Section 2 · context question · drive system for a conveyor",
        stem: R`<p>A bakery conveyor is driven by the system in the figure. The motor turns at <strong>1440 rev/min</strong>. The worm gearbox has a velocity ratio of 20. The chain drive has a 12-tooth driver sprocket and a 36-tooth driven sprocket. The conveyor roller has a diameter of <strong>160 mm</strong>.</p>`,
        figure: figConveyor(),
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 24, tol: 0.1, unit: "rev/min",
            q: R`Calculate the speed of the conveyor roller, in rev/min.`,
            why: R`<p>Overall $\text{VR} = 20 \times \dfrac{36}{12} = 20 \times 3 = 60$ (1)</p><p>$n_{roller} = \dfrac{1440}{60} = 24\ \text{rev/min}$ (1)</p><p>The velocity ratios of the stages multiply.</p>`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 0.201, tol: 0.0012, unit: "m s⁻¹",
            q: R`The roller turns at 24 rev/min. The belt moves at the speed of the roller's surface. Calculate the speed of the belt, in m s⁻¹.`,
            why: R`<p>$n = 24 \div 60 = 0.40\ \text{rev s}^{-1}$ (1)</p><p>$v = \pi d n = \pi \times 0.160 \times 0.40$</p><p>$v = 0.201\ \text{m s}^{-1}$ (1)</p><p>With $n$ left in rev/min the answer is 60 times too big; using the radius gives half the right answer.</p>`,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 2,
            q: R`Why is a worm and wheel gearbox a good choice for the first stage of this drive?`,
            opts: [
              "It is more efficient than a pair of spur gears",
              "It joins two shafts that are parallel and close together",
              "It gives a large speed reduction from a single pair of gears in a small space",
              "It never needs lubrication because the teeth roll on each other",
            ],
            why: R`A one-start worm and a wheel with many teeth give a large velocity ratio in one stage. The shafts are at 90°, not parallel; the teeth slide rather than roll, so a worm drive needs lubrication and is usually <em>less</em> efficient than spur gears.`,
          },
        ],
      },
      {
        id: "mechanisms-07",
        style: "Section 2 · context question · drives that give straight-line motion",
        stem: R`<p>A workshop door is opened by a pinion of <strong>diameter 48 mm</strong> that meshes with a rack fixed to the door. The pinion turns at <strong>120 rev/min</strong>. The door travels <strong>600 mm</strong> from closed to open.</p>`,
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 0.302, tol: 0.002, unit: "m s⁻¹",
            q: R`Calculate the speed of the door, in m s⁻¹.`,
            why: R`<p>$n = 120 \div 60 = 2\ \text{rev s}^{-1}$ (1)</p><p>$v = \pi d n = \pi \times 0.048 \times 2$</p><p>$v = 0.302\ \text{m s}^{-1}$ (1)</p><p>One turn of the pinion moves the rack one circumference of the pinion.</p>`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 1.99, tol: 0.02, unit: "s",
            q: R`Calculate the time the door takes to open, in seconds.`,
            why: R`$t = \dfrac{\text{distance}}{v} = \dfrac{0.600}{0.3016} = 1.99\ \text{s}$ (1). The 600 mm becomes 0.600 m first: dividing 600 by 0.302 gives 1990, which is not in seconds.`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 20, tol: 0.05, unit: "mm s⁻¹",
            q: R`A window opener uses a lead screw (a worm and nut) with a lead of <strong>8 mm</strong>. The screw turns at <strong>150 rev/min</strong>. Calculate the speed of the nut, in mm s⁻¹.`,
            why: R`<p>The nut moves one lead for every turn: $8 \times 150 = 1200\ \text{mm/min}$ (1)</p><p>$\dfrac{1200}{60} = 20\ \text{mm s}^{-1}$ (1)</p>`,
          },
        ],
      },
      {
        id: "mechanisms-08",
        style: "Section 2 · context question · energy turned to heat by a brake",
        stem: R`<p>A car of mass <strong>1400 kg</strong> brakes to a stop from <strong>25 m s⁻¹</strong>. The brake discs are made of steel, with a specific heat capacity of <strong>490 J kg⁻¹ K⁻¹</strong>.</p>`,
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 437.5, tol: 0.5, rtol: 0.01, unit: "kJ",
            q: R`Calculate the kinetic energy of the car before braking, in kJ.`,
            why: R`<p>$E_k = \tfrac{1}{2}mv^2 = \tfrac{1}{2} \times 1400 \times 25^2$ (1)</p><p>$E_k = 437\,500\ \text{J} = 437.5\ \text{kJ}$ (1)</p><p>Forgetting to square the speed, or the half, gives 17.5 kJ or 875 kJ.</p>`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 52.5, tol: 0.5, unit: "K",
            q: R`In a different stop, the two front discs together absorb <strong>180 kJ</strong> of energy as heat. Each front disc has a mass of <strong>3.5 kg</strong>. Calculate the temperature rise of the front discs, in kelvin.`,
            why: R`<p>Mass of discs $= 2 \times 3.5 = 7.0\ \text{kg}$</p><p>$E_h = cm\Delta T$, so $\Delta T = \dfrac{E_h}{cm} = \dfrac{180\,000}{490 \times 7.0}$ (1)</p><p>$\Delta T = 52.5\ \text{K}$ (1)</p><p>Using the mass of one disc gives 105 K. A rise in kelvin is the same size as a rise in °C.</p>`,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 2,
            q: R`The designer wants the discs to heat up less in the same stop. Which change would do this?`,
            opts: ["Make the discs smaller", "Make the discs from a metal with a lower specific heat capacity", "Increase the mass of the discs", "Press the pads harder so that the car stops sooner"],
            why: R`$\Delta T = E_h \div cm$, so more mass (or a higher specific heat capacity) means a smaller rise. Smaller discs or a lower $c$ make it worse. Pressing harder does not change the energy that has to be removed from the car, only how fast it goes.`,
          },
        ],
      },
      {
        id: "mechanisms-09",
        style: "Section 2 · context question · compound gear train, torque and rope speed",
        stem: R`<p>A hoist is driven by the compound gear train in the figure. Gear A (16 teeth) is on the motor shaft, which delivers <strong>2.2 kW</strong> at <strong>1440 rev/min</strong>. Gear A meshes with gear B (64 teeth). Gear C (18 teeth) is fixed to the same shaft as B and meshes with gear D (54 teeth) on the output shaft. The efficiency of the whole train is <strong>88%</strong>. The output shaft turns a drum of <strong>diameter 300 mm</strong>.</p>`,
        figure: figCompound(),
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 12, alts: [1], tol: 0.01, unit: "",
            q: R`Calculate the velocity ratio of the gear train.`,
            why: R`<p>$\text{VR} = \dfrac{64}{16} \times \dfrac{54}{18}$ (1)</p><p>$\text{VR} = 4 \times 3 = 12$ (1)</p><p>The velocity ratios of the two meshes multiply; they are not added (adding gives 7). A ratio typed as 12 : 1 is accepted.</p>`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 120, tol: 0.5, unit: "rev/min",
            q: R`Calculate the speed of the output shaft, in rev/min.`,
            why: R`$n_{out} = 1440 \div 12 = 120\ \text{rev/min}$ (1). Slips: multiplying instead of dividing gives 17 280 rev/min, and using only one mesh gives 360 or 480 rev/min.`,
          },
          {
            label: "(c)", type: "num", marks: 3, a: 154, tol: 0.7, rtol: 0.028, unit: "N m",
            q: R`Using the velocity ratio from part (a), calculate the torque on the output shaft, in N m.`,
            why: R`<p>$n_{in} = 1440 \div 60 = 24\ \text{rev s}^{-1}$, so $T_{in} = \dfrac{P}{2\pi n} = \dfrac{2200}{2\pi \times 24} = 14.6\ \text{N m}$ (1)</p><p>$T_{out} = T_{in} \times \text{VR} \times \eta = 14.59 \times 12 \times 0.88$ (1)</p><p>$T_{out} = 154\ \text{N m}$ (1)</p><p>Check: the output power is $0.88 \times 2200 = 1936\ \text{W}$ and $2\pi \times 2 \times 154 = 1936\ \text{W}$. Putting the speed in rev/min into $P = 2\pi nT$ makes $T$ sixty times too small.</p>`,
          },
          {
            label: "(d)", type: "num", marks: 2, a: 1.88, tol: 0.025, unit: "m s⁻¹",
            q: R`The drum turns at 120 rev/min. Calculate the speed of the rope on the drum, in m s⁻¹.`,
            why: R`<p>$n = 120 \div 60 = 2\ \text{rev s}^{-1}$ (1)</p><p>$v = \pi d n = \pi \times 0.300 \times 2 = 1.88\ \text{m s}^{-1}$ (1)</p>`,
          },
        ],
      },
      {
        id: "mechanisms-10",
        style: "Section 2 · context question · force from a pneumatic cylinder",
        stem: R`<p>A double-acting cylinder in a clamping jig has a bore of <strong>40 mm</strong> and a piston rod of <strong>16 mm</strong> diameter. It is supplied with air at a gauge pressure of <strong>550 kPa</strong>.</p>`,
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 691, tol: 1, unit: "N",
            q: R`Calculate the force the cylinder produces on its outstroke, in newtons.`,
            why: R`<p>$A = \dfrac{\pi d^2}{4} = \dfrac{\pi \times 0.040^2}{4} = 1.257 \times 10^{-3}\ \text{m}^2$, and $P = 550 \times 10^3\ \text{Pa}$ (1)</p><p>$F = PA = 550\,000 \times 1.257 \times 10^{-3} = 691\ \text{N}$ (1)</p>`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 581, tol: 1.2, unit: "N",
            q: R`Calculate the force the cylinder produces on its <strong>instroke</strong>, in newtons.`,
            why: R`<p>On the instroke the air acts on the annulus: $A = \dfrac{\pi(D^2 - d^2)}{4} = \dfrac{\pi(0.040^2 - 0.016^2)}{4} = 1.056 \times 10^{-3}\ \text{m}^2$ (1)</p><p>$F = PA = 550\,000 \times 1.056 \times 10^{-3} = 581\ \text{N}$ (1)</p>`,
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 10,
            q: R`Explain why the instroke force is smaller than the outstroke force, although the air pressure is the same.`,
            points: TXT.annulus.points,
            sample: TXT.annulus.sample,
            model: TXT.annulus.model,
          },
          {
            label: "(d)", type: "num", marks: 2, a: 56.4, tol: 0.1, rtol: 0.01, unit: "mm",
            q: R`A different jig needs a force of <strong>1.5 kN</strong> on the outstroke from air at <strong>6.0 bar</strong> (1 bar = $10^5$ Pa). Calculate the smallest bore that will do, in mm.`,
            why: R`<p>$A = \dfrac{F}{P} = \dfrac{1500}{6.0 \times 10^5} = 2.5 \times 10^{-3}\ \text{m}^2$ (1)</p><p>$A = \dfrac{\pi d^2}{4}$, so $d = \sqrt{\dfrac{4A}{\pi}} = \sqrt{\dfrac{4 \times 2.5 \times 10^{-3}}{\pi}} = 0.0564\ \text{m} = 56.4\ \text{mm}$ (1)</p><p>Taking this as the radius gives 28.2 mm, which is half the right answer.</p>`,
          },
        ],
      },
      {
        id: "mechanisms-11",
        style: "Section 2 · context question · reading a pneumatic circuit",
        stem: R`<p>The door of a bakery oven is opened and closed by the double-acting cylinder C in the circuit shown. Valve S is a push-button valve and valve V controls the cylinder. The door is closed when the rod of C is fully in, as drawn, and opens when the cylinder outstrokes.</p>`,
        figure: figSimple(),
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 1,
            q: R`Which description matches valve V?`,
            opts: [
              "A 3/2 valve with a push-button and a spring return",
              "A 5/2 valve with a pilot signal on one side and a spring return on the other",
              "A 5/2 valve with a pilot signal at both ends and no spring",
              "A 3/2 roller valve with a spring return",
            ],
            why: R`Valve V has five ports, two positions, a pilot port (14) on the left and a spring on the right, so it returns to the position shown when the pilot signal goes. Valve S is the 3/2 push-button valve. A valve with a pilot at both ends and no spring would have memory.`,
          },
          {
            label: "(b)", type: "text", marks: 3, rows: 6, minWords: 15,
            q: R`Describe the operation of the circuit when push-button S is pressed and held, and then released.`,
            points: TXT.simple.points,
            sample: TXT.simple.sample,
            model: TXT.simple.model,
          },
        ],
      },
      {
        id: "mechanisms-12",
        style: "Section 2 · context question · sequence circuit, describe the operation",
        stem: R`<p>A press has two double-acting cylinders: A clamps the work and B stamps it. The circuit in the figure produces the sequence <strong>A+ B+ A− B−</strong>, where + means outstroke and − means instroke. At rest both cylinders are instroked, so limit valves a0 and b0 are pressed. Valves A and B are 5/2 valves with a pilot at each end and no spring. Pilot 14 makes a cylinder outstroke and pilot 12 makes it instroke.</p>`,
        figure: figSeq(),
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: R`Read the figure. Match each pilot port to the signal that supplies it.`,
            pairs: [
              ["Pilot 14 of valve A", "START push-button, with limit valve b0 pressed"],
              ["Pilot 14 of valve B", "Limit valve a1"],
              ["Pilot 12 of valve A", "Limit valve b1"],
              ["Pilot 12 of valve B", "Limit valve a0"],
            ],
            why: "Follow the sequence A+ B+ A- B-. START with b0 pressed starts A+ through pilot 14 of A. A outstroked presses a1, which gives pilot 14 of B (B+). B outstroked presses b1, which gives pilot 12 of A (A-). A back at rest presses a0, which gives pilot 12 of B (B-). Each limit valve is pressed only at the end of the stroke it signals.",
          },
          {
            label: "(b)", type: "text", marks: 4, rows: 9, minWords: 25,
            q: R`Describe the operation of the circuit for one complete sequence, starting with START being pressed.`,
            points: TXT.seq.points,
            sample: TXT.seq.sample,
            model: TXT.seq.model,
          },
        ],
      },
      {
        id: "mechanisms-13",
        style: "Section 2 · context question · electro-pneumatics and a latching relay",
        stem: R`<p>A clamp is operated by a double-acting cylinder and a 5/2 valve with a single solenoid, Y1, and a spring return. The control circuit is the ladder diagram in the figure. S1 is a normally open START push-button, S2 is a normally closed STOP push-button, and K1 is a relay.</p>`,
        figure: figLadder(),
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 3,
            q: R`S1 is pressed briefly and then released. What does the clamp cylinder do?`,
            opts: [
              "It outstrokes and then instrokes again as soon as S1 is released",
              "It does not move, because S2 is open",
              "It instrokes and stays instroked",
              "It outstrokes and stays outstroked until S2 is pressed",
            ],
            why: R`Pressing S1 energises K1, and K1's contact in parallel with S1 keeps the rung live after S1 is released (a latch). So Y1 stays energised and the cylinder stays outstroked. It only goes back when S2 breaks the rung. S2 is normally <em>closed</em>, so it does not stop the circuit at rest.`,
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 5, minWords: 12,
            q: R`Explain how relay K1 keeps solenoid Y1 energised after S1 has been released.`,
            points: TXT.latch.points,
            sample: TXT.latch.sample,
            model: TXT.latch.model,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 1,
            q: R`While the cylinder is outstroked, S2 is pressed. What happens?`,
            opts: [
              "K1 stays energised, because its own contact is closed, so the cylinder stays outstroked",
              "K1 is de-energised, its contacts open, Y1 is de-energised and the spring returns the valve, so the cylinder instrokes",
              "Y1 stays energised until S1 is pressed again",
              "Both Y1 and K1 are energised, so the valve cannot change state",
            ],
            why: R`S2 is in series with the whole of the first rung, including the latch contact, so opening it removes the current from K1 whatever the K1 contact is doing. K1 drops out, both its contacts open, Y1 loses its current, and the spring returns the single-solenoid valve.`,
          },
        ],
      },
      {
        id: "mechanisms-14",
        style: "Section 2 · context question · choosing a drive",
        stem: R`<p>A bakery dough mixer is driven by a <strong>1.5 kW</strong> electric motor. The motor shaft and the mixer shaft are <strong>600 mm</strong> apart. Stiff dough can jam the mixer, and the machine is in a food area where it is washed down. The designer is deciding between a V-belt drive and a roller-chain drive.</p>`,
        parts: [
          {
            label: "(a)", type: "text", marks: 4, rows: 9, minWords: 25,
            q: R`Compare the use of a V-belt drive with a roller-chain drive for this mixer.`,
            points: TXT.drive.points,
            sample: TXT.drive.sample,
            model: TXT.drive.model,
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 1,
            q: R`A different machine needs the speed ratio to stay exactly 3 : 1 so that two parts stay in step. Which belt is the best choice?`,
            opts: ["V-belt", "Toothed (timing) belt", "Flat belt", "Crossed flat belt"],
            why: R`A toothed belt's teeth fit grooves in the pulleys, so it cannot slip and the ratio stays exact. Flat and V-belts rely on friction and can slip, and crossing the belt only reverses the direction of rotation.`,
          },
          {
            label: "(c)", type: "multi", marks: 2, a: [0, 3],
            q: R`Choose <strong>two</strong> advantages of a roller-chain drive over a flat-belt drive.`,
            opts: [
              "The speed ratio is exact, because the chain cannot slip on the sprockets",
              "It runs quietly and needs no lubrication",
              "It slips safely if the machine jams, which protects the motor",
              "It can carry a larger torque than a belt of the same width",
              "It is always lighter and cheaper",
            ],
            why: R`A chain is a positive drive (no slip, exact ratio) and carries high torque. It is noisier than a belt and needs oil. Slipping on a jam is a property of belts, not chains, and a chain is usually heavier and dearer than a belt.`,
          },
        ],
      },
      {
        id: "mechanisms-15",
        style: "Section 2 · context question · couplings, bearings and clutches",
        stem: R`<p>A conveyor on the lower deck is driven by an electric motor through a worm and wheel gearbox. A friction clutch lets the motor reach its running speed before the conveyor takes up the load.</p>`,
        parts: [
          {
            label: "(a)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: R`Give <strong>two</strong> reasons why a flexible coupling, rather than a rigid one, is used between the motor and the gearbox.`,
            points: TXT.flex.points,
            sample: TXT.flex.sample,
            model: TXT.flex.model,
          },
          {
            label: "(b)", type: "text", marks: 1, rows: 3, minWords: 6,
            q: R`State why a thrust bearing is fitted to the worm shaft.`,
            points: TXT.thrust.points,
            sample: TXT.thrust.sample,
            model: TXT.thrust.model,
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 5, minWords: 10,
            q: R`Explain how the clutch lets the conveyor start gently.`,
            points: TXT.clutch.points,
            sample: TXT.clutch.sample,
            model: TXT.clutch.model,
          },
        ],
      },
    ],
  };
})();
