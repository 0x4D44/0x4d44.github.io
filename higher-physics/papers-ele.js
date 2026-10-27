/* Past-paper practice: Electricity. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HPP_BANK = window.HPP_BANK || {});

  /* near(a, b, n): regex source matching a and b in either order with at most n words between them. */
  const near = (a, b, n) => { const g = "\\W+(?:\\w+\\W+){0," + (n == null ? 3 : n) + "}"; return "\\b(?:" + a + ")\\b" + g + "\\b(?:" + b + ")\\b|\\b(?:" + b + ")\\b" + g + "\\b(?:" + a + ")\\b"; };
  const INC = "increas\\w*|rises?|rising|goes up|go up|grows?|greater|larger|bigger|higher|(?:gets?|becomes?) (?:bigger|larger|higher|greater)";
  const DEC = "decreas\\w*|falls?|falling|drops?|dropping|reduc\\w*|goes down|go down|smaller|lower\\w*|less|(?:gets?|becomes?) (?:smaller|lower)";
  const PD = "p\\.?d\\.?|voltage|potential difference|volts";
  const HALF = "(?:½|1/2|0\\.5)";
  /* relationship patterns (tested against the working with all spaces removed) */
  const OHM = ["v=ir", "v=ixr", "v=rxi", "i=v/r", "r=v/i"];
  const VNUM = "[a-z_0-9.₀-₉]+";
  /* potential-divider relationships, with or without a left-hand side (tested against the compacted working) */
  const DIVIDER = [
    "v[a-z_0-9]*=\\(?" + VNUM + "/\\(?" + VNUM + "\\+" + VNUM + "\\)?\\)?x" + VNUM, "v[a-z_0-9]*=\\(?" + VNUM + "/" + VNUM + "\\)?x" + VNUM,
    "v[a-z_0-9]*/v[a-z_0-9]*=" + VNUM + "/" + VNUM, "i=[0-9.]+/[0-9.]+",
    "\\(?" + VNUM + "/\\(?" + VNUM + "\\+" + VNUM + "\\)?\\)?x" + VNUM, VNUM + "x\\(?" + VNUM + "/\\(?" + VNUM + "\\+" + VNUM, VNUM + "x\\(?" + VNUM + "/" + VNUM, "v[a-z_0-9]*=" + VNUM + "x\\(?" + VNUM + "/",
    "v[a-z_0-9]*=\\(?" + VNUM + "x" + VNUM + "\\)?/\\(?" + VNUM + "\\+" + VNUM,
  ].concat(OHM);
  /* unit-prefix alternatives: the scaled number written with the plain unit (333 A for 333 mA) is vetoed */
  const bareScaled = (digits, unit) => "(?<![0-9.])" + digits + "(?:" + unit + ")\\.?$";

  /* ---------- small SVG kit ---------- */
  const INK = "#222", BLU = "#1c3b66", RED = "#b3261e", FILL = "#dbe6f5", GRID = "#d4d4d4";
  const tx = (x, y, s, o) => { o = o || {}; return '<text x="' + x + '" y="' + y + '" font-family="sans-serif" font-size="' + (o.s || 12) + '" text-anchor="' + (o.a || "middle") + '" fill="' + (o.f || INK) + '"' + (o.i ? ' font-style="italic"' : "") + (o.b ? ' font-weight="bold"' : "") + (o.r ? ' transform="rotate(' + o.r + " " + x + " " + y + ')"' : "") + ">" + s + "</text>"; };
  const ln = (x1, y1, x2, y2, o) => { o = o || {}; return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + (o.c || INK) + '" stroke-width="' + (o.w || 1.6) + '"' + (o.d ? ' stroke-dasharray="' + o.d + '"' : "") + ' stroke-linecap="round"/>'; };
  const pl = (pts, o) => { o = o || {}; return '<polyline points="' + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ") + '" fill="none" stroke="' + (o.c || INK) + '" stroke-width="' + (o.w || 1.6) + '" stroke-linejoin="round" stroke-linecap="round"/>'; };
  const dot = (x, y, r, c) => '<circle cx="' + x + '" cy="' + y + '" r="' + (r || 3) + '" fill="' + (c || INK) + '"/>';
  const rect = (x, y, w, h, fill, stroke, sw) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + (fill || "#fff") + '" stroke="' + (stroke || INK) + '" stroke-width="' + (sw == null ? 1.6 : sw) + '"/>';
  const svg = (w, h, label, body) => '<svg role="img" aria-label="' + label + '" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" xmlns="http://www.w3.org/2000/svg"><rect width="' + w + '" height="' + h + '" fill="#fff"/>' + body + "</svg>";
  /* components: drawn over a wire that runs straight through their centre */
  const resistor = (x, y, v) => (v ? rect(x - 7, y - 20, 14, 40) : rect(x - 20, y - 7, 40, 14));
  const cell = (x, y, v) => v
    ? rect(x - 14, y - 6, 28, 12, "#fff", "none", 0) + ln(x - 13, y - 5, x + 13, y - 5) + ln(x - 7, y + 5, x + 7, y + 5, { w: 3.6 }) + tx(x + 20, y - 4, "+", { s: 12, a: "start" })
    : rect(x - 6, y - 14, 12, 28, "#fff", "none", 0) + ln(x - 5, y - 13, x - 5, y + 13) + ln(x + 5, y - 7, x + 5, y + 7, { w: 3.6 }) + tx(x - 14, y - 12, "+", { s: 12 });
  const capacitor = (x, y, v) => v
    ? rect(x - 15, y - 5, 30, 10, "#fff", "none", 0) + ln(x - 14, y - 4, x + 14, y - 4, { w: 2.6 }) + ln(x - 14, y + 4, x + 14, y + 4, { w: 2.6 })
    : rect(x - 5, y - 15, 10, 30, "#fff", "none", 0) + ln(x - 4, y - 14, x - 4, y + 14, { w: 2.6 }) + ln(x + 4, y - 14, x + 4, y + 14, { w: 2.6 });
  const meter = (x, y, c) => '<circle cx="' + x + '" cy="' + y + '" r="12" fill="#fff" stroke="' + INK + '" stroke-width="1.6"/>' + tx(x, y + 4.5, c, { s: 13, b: true });
  const lamp = (x, y) => '<circle cx="' + x + '" cy="' + y + '" r="12" fill="#fff" stroke="' + INK + '" stroke-width="1.6"/>' + ln(x - 8.5, y - 8.5, x + 8.5, y + 8.5, { w: 1.4 }) + ln(x - 8.5, y + 8.5, x + 8.5, y - 8.5, { w: 1.4 });
  const arrow = (x1, y1, x2, y2, c) => { const a = Math.atan2(y2 - y1, x2 - x1), h = 7; return ln(x1, y1, x2, y2, { c: c || INK, w: 1.3 }) + '<polygon points="' + [[x2, y2], [x2 - h * Math.cos(a - 0.4), y2 - h * Math.sin(a - 0.4)], [x2 - h * Math.cos(a + 0.4), y2 - h * Math.sin(a + 0.4)]].map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ") + '" fill="' + (c || INK) + '"/>'; };
  /* graph axes: returns { g, fx, fy } */
  function axes(o) {
    const L = o.l == null ? 62 : o.l, R = o.r == null ? 24 : o.r, T = o.t == null ? 22 : o.t, Bm = o.b == null ? 52 : o.b;
    const fx = (v) => L + (v / o.xmax) * (o.w - L - R), fy = (v) => o.h - Bm - (v / o.ymax) * (o.h - T - Bm);
    let g = "";
    for (let v = 0; v <= o.xmax + 1e-9; v += o.xs) { g += (v > 0 ? ln(fx(v), fy(0), fx(v), fy(o.ymax), { c: GRID, w: 0.8 }) : "") + ln(fx(v), fy(0), fx(v), fy(0) + 5) + tx(fx(v), fy(0) + 19, +v.toFixed(3), { s: 11 }); }
    for (let v = 0; v <= o.ymax + 1e-9; v += o.ys) { g += (v > 0 ? ln(fx(0), fy(v), fx(o.xmax), fy(v), { c: GRID, w: 0.8 }) : "") + ln(fx(0) - 5, fy(v), fx(0), fy(v)) + tx(fx(0) - 9, fy(v) + 4, +v.toFixed(3), { s: 11, a: "end" }); }
    g += ln(fx(0), fy(0), fx(o.xmax), fy(0), { w: 1.8 }) + ln(fx(0), fy(0), fx(0), fy(o.ymax), { w: 1.8 });
    g += tx((fx(0) + fx(o.xmax)) / 2, o.h - 8, o.xl, { s: 12 }) + tx(o.yx == null ? 15 : o.yx, (fy(0) + fy(o.ymax)) / 2, o.yl, { s: 12, r: -90 });
    return { g, fx, fy };
  }
  /* smooth curve through knots (Catmull-Rom to cubic Bezier) */
  function smooth(pts, c, w) {
    let d = "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += " C" + c1.map((n) => n.toFixed(1)).join(",") + " " + c2.map((n) => n.toFixed(1)).join(",") + " " + p2.map((n) => n.toFixed(1)).join(",");
    }
    return '<path d="' + d + '" fill="none" stroke="' + (c || BLU) + '" stroke-width="' + (w || 2.4) + '" stroke-linecap="round"/>';
  }

  /* ---------- figures ---------- */
  const figScope = (() => {
    const x0 = 60, y0 = 24, d = 36, cy = y0 + 4 * d;
    let b = rect(x0, y0, 10 * d, 8 * d, "#f3f7f3", INK, 1.8);
    for (let i = 1; i < 10; i++) b += ln(x0 + i * d, y0, x0 + i * d, y0 + 8 * d, { c: i === 5 ? "#8aa28a" : GRID, w: i === 5 ? 1.2 : 0.8 });
    for (let j = 1; j < 8; j++) b += ln(x0, y0 + j * d, x0 + 10 * d, y0 + j * d, { c: j === 4 ? "#8aa28a" : GRID, w: j === 4 ? 1.2 : 0.8 });
    const pts = [];
    for (let k = 0; k <= 200; k++) { const x = k / 20; pts.push([x0 + x * d, cy - 3 * d * Math.sin((2 * Math.PI * x) / 5)]); }
    b += pl(pts, { c: BLU, w: 2.6 });
    b += tx(x0 + 5 * d, y0 + 8 * d + 28, "Y-gain 2.0 V/div     timebase 2.0 ms/div", { s: 13, b: true });
    return svg(480, 350, "Oscilloscope screen with a grid of 10 divisions across and 8 divisions up. A sine wave starts on the centre line, rises to a peak 3 divisions above the centre line, and completes exactly two full cycles across the 10 divisions, so one cycle spans 5 divisions. The settings are Y-gain 2.0 V per division and timebase 2.0 ms per division.", b);
  })();

  const figNetwork = (() => {
    let b = ln(120, 40, 360, 40) + ln(120, 160, 360, 160) + ln(120, 40, 120, 160) + ln(290, 40, 290, 160) + ln(360, 40, 360, 160);
    b += resistor(200, 40) + cell(120, 100, true) + lamp(290, 100) + lamp(360, 100) + dot(290, 40) + dot(290, 160);
    b += tx(200, 22, "R₁ = 8.0 Ω") + tx(98, 104, "12 V", { a: "end" });
    b += tx(290, 124, "lamp X", { s: 11 }) + tx(290, 138, "12 Ω", { s: 11 }) + tx(360, 124, "lamp Y", { s: 11 }) + tx(360, 138, "6.0 Ω", { s: 11 });
    return svg(480, 190, "Circuit diagram. A 12 V cell is connected in series with a fixed resistor R1 of 8.0 ohms. The resistor is joined to two branches in parallel: one branch holds lamp X of resistance 12 ohms and the other holds lamp Y of resistance 6.0 ohms. The branches rejoin and return to the cell.", b);
  })();

  const figLdr = (() => {
    let b = ln(130, 30, 260, 30) + ln(130, 190, 370, 190) + ln(130, 30, 130, 190) + ln(260, 30, 260, 190) + ln(260, 115, 370, 115) + ln(370, 115, 370, 190);
    b += resistor(260, 72, true) + cell(130, 110, true) + meter(370, 152, "V") + dot(260, 115) + dot(260, 190);
    // LDR
    b += resistor(260, 158, true) + arrow(212, 134, 247, 150) + arrow(206, 152, 241, 168);
    b += tx(108, 114, "9.0 V", { a: "end" }) + tx(284, 76, "2.0 kΩ", { a: "start" }) + tx(284, 162, "LDR", { a: "start" }) + tx(396, 156, "voltmeter", { a: "start", s: 11 });
    return svg(480, 215, "Circuit diagram of a potential divider. A 9.0 volt supply is connected across a fixed 2.0 kilohm resistor in series with a light dependent resistor, LDR, drawn with two arrows of light pointing at it. A voltmeter is connected across the LDR only.", b);
  })();

  const figVI = (() => {
    const a = axes({ w: 480, h: 300, xmax: 3.5, ymax: 5, xs: 0.5, ys: 1, xl: "current I / A", yl: "terminal p.d. V / V" });
    let b = a.g + ln(a.fx(0), a.fy(4.5), a.fx(3), a.fy(0), { c: BLU, w: 2.4 });
    [[0, 4.5], [1, 3], [2, 1.5], [3, 0]].forEach((p) => { b += dot(a.fx(p[0]), a.fy(p[1]), 3.5, RED); });
    return svg(480, 300, "Graph of terminal potential difference in volts on the vertical axis against current in amperes on the horizontal axis. A straight line slopes down from 4.5 volts at zero current, through 3.0 volts at 1.0 amp and 1.5 volts at 2.0 amps, to zero volts at 3.0 amps.", b);
  })();

  const figConstI = (() => {
    const a = axes({ w: 480, h: 300, xmax: 60, ymax: 5, xs: 10, ys: 1, xl: "time t / s", yl: "p.d. across capacitor / V" });
    let b = a.g + ln(a.fx(50), a.fy(4), a.fx(50), a.fy(0), { c: "#777", w: 1, d: "4 3" }) + ln(a.fx(0), a.fy(4), a.fx(50), a.fy(4), { c: "#777", w: 1, d: "4 3" });
    b += ln(a.fx(0), a.fy(0), a.fx(50), a.fy(4), { c: BLU, w: 2.4 }) + dot(a.fx(50), a.fy(4), 3.5, RED);
    return svg(480, 300, "Graph of the potential difference across a capacitor in volts against time in seconds. A straight line rises from the origin to 4.0 volts at 50 seconds, with dashed guide lines drawn from that point to each axis.", b);
  })();

  const figDischarge = (() => {
    let b = ln(80, 40, 150, 40) + ln(270, 40, 390, 40) + ln(80, 170, 390, 170) + ln(80, 40, 80, 170) + ln(210, 62, 210, 170) + ln(390, 40, 390, 170);
    b += cell(80, 105, true) + capacitor(210, 120, true) + resistor(390, 105, true) + dot(210, 170);
    b += '<circle cx="150" cy="40" r="3.5" fill="#fff" stroke="' + INK + '" stroke-width="1.6"/><circle cx="270" cy="40" r="3.5" fill="#fff" stroke="' + INK + '" stroke-width="1.6"/>' + dot(210, 62, 3);
    b += ln(210, 62, 155, 43, { w: 2 });
    b += tx(150, 26, "1") + tx(270, 26, "2") + tx(226, 70, "S", { a: "start", b: true }) + tx(58, 109, "9.0 V", { a: "end" }) + tx(230, 124, "C = 680 µF", { a: "start" }) + tx(412, 109, "R = 450 Ω", { a: "start" });
    return svg(500, 200, "Circuit diagram. A 9.0 volt cell is connected to contact 1 of a two-way switch S. The switch pivot is joined to the top of a 680 microfarad capacitor C, whose bottom plate is joined to the return wire. Contact 2 of the switch is connected through a 450 ohm resistor R back to the return wire. The switch is drawn touching contact 1.", b);
  })();

  const figBands = (() => {
    const panel = (x, name, cond, val, gapLabel) => {
      let s = tx(x + 70, 24, "Material " + name, { b: true, s: 14 });
      s += rect(x + 20, cond[0], 100, cond[1] - cond[0], "#fff", INK, 1.6) + rect(x + 20, val[0], 100, val[1] - val[0], FILL, INK, 1.6);
      s += tx(x + 70, cond[0] + 14, "conduction band", { s: 10 }) + tx(x + 70, val[1] - 8, "valence band", { s: 10 });
      if (gapLabel) { const m = (cond[1] + val[0]) / 2; s += tx(x + 70, m + 4, gapLabel, { s: 11, i: true, f: RED }); }
      return s;
    };
    let b = panel(8, "X", [130, 200], [180, 250], "") + panel(176, "Y", [50, 100], [180, 250], "large gap") + panel(344, "Z", [110, 160], [180, 250], "small gap");
    b += tx(8 + 70, 168, "bands overlap", { s: 11, i: true, f: RED }).replace('y="168"', 'y="122"');
    b += tx(240, 285, "shaded = band full of electrons;  unshaded = band empty of electrons", { s: 11 });
    return svg(500, 300, "Three energy band diagrams side by side, each showing a conduction band box above a valence band box. Material X: the two bands overlap. Material Y: the valence band is full of electrons, the conduction band is empty, and there is a large gap between them. Material Z: the valence band is full, the conduction band is empty, and there is only a small gap between them.", b);
  })();

  const figPN = (() => {
    let b = rect(130, 80, 110, 70, "#fbe9e7", INK, 1.8) + rect(240, 80, 110, 70, "#e3edf8", INK, 1.8);
    b += tx(185, 70, "p-type") + tx(295, 70, "n-type");
    [[150, 100], [175, 125], [205, 105], [215, 135], [160, 140]].forEach((p) => { b += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" fill="#fff" stroke="' + RED + '" stroke-width="1.5"/>'; });
    [[265, 105], [290, 130], [320, 100], [330, 135], [275, 140]].forEach((p) => { b += dot(p[0], p[1], 5, BLU); });
    b += ln(185, 80, 185, 30) + ln(185, 30, 295, 30) + ln(295, 30, 295, 80) + resistor(240, 30) + tx(240, 14, "R");
    b += ln(185, 150, 185, 200) + ln(185, 200, 295, 200) + ln(295, 200, 295, 150) + cell(240, 200, false);
    b += tx(160, 196, "+", { s: 14, b: true, f: RED });
    b += tx(120, 118, "holes", { a: "end", s: 11, f: RED }) + tx(360, 118, "free electrons", { a: "start", s: 11, f: BLU });
    return svg(500, 225, "Diagram of a p-n junction. A p-type block containing holes, drawn as open circles, is joined to an n-type block containing free electrons, drawn as filled dots. The p-type side is connected through a resistor and the n-type side is connected through a cell, with the positive terminal of the cell joined to the p-type side.", b);
  })();

  const figThermistor = (() => {
    let c = ln(40, 40, 130, 40) + ln(40, 225, 205, 225) + ln(40, 40, 40, 225) + ln(130, 40, 130, 225) + ln(130, 130, 205, 130) + ln(205, 130, 205, 225);
    c += cell(40, 130, true) + resistor(130, 80, true) + resistor(130, 180, true) + meter(205, 180, "V") + dot(130, 130) + dot(130, 225);
    // thermistor: diagonal line through the resistor
    c += ln(112, 104, 148, 56, { w: 1.6 }) + ln(112, 104, 104, 104, { w: 1.6 });
    c += tx(120, 84, "thermistor", { a: "end", s: 11 }).replace('x="120"', 'x="116"') + tx(116, 184, "R = 2.0 kΩ", { a: "end", s: 11 }) + tx(20, 134, "6.0 V", { a: "end", s: 11 }).replace('x="20"', 'x="22"');
    // graph
    let b = '<g transform="translate(36,0)">' + c + "</g>";
    const a = axes({ w: 520, h: 270, l: 318, r: 14, t: 24, b: 52, yx: 288, xmax: 80, ymax: 8, xs: 10, ys: 1, xl: "temperature / °C", yl: "thermistor resistance / kΩ" });
    b += a.g;
    const k = [[15, 7.5], [20, 6.0], [30, 4.0], [40, 3.0], [50, 2.0], [60, 1.5], [70, 1.0], [80, 0.8]].map((p) => [a.fx(p[0]), a.fy(p[1])]);
    b += smooth(k, BLU, 2.4);
    return svg(520, 270, "Left: circuit diagram of a 6.0 volt supply in series with a thermistor and a fixed 2.0 kilohm resistor, with a voltmeter connected across the fixed resistor only. Right: graph of thermistor resistance in kilohms against temperature in degrees Celsius. The curve falls from about 7.5 kilohms at 15 degrees through 6.0 at 20, 4.0 at 30, 3.0 at 40, 2.0 at 50, 1.5 at 60, 1.0 at 70 and 0.8 at 80 degrees.", b);
  })();

  const figCharge = (() => {
    const a = axes({ w: 480, h: 300, xmax: 8, ymax: 6, xs: 1, ys: 1, xl: "time t / s", yl: "p.d. across capacitor / V" });
    const curve = (tau) => { const p = []; for (let k = 0; k <= 80; k++) { const t = k / 10; p.push([a.fx(t), a.fy(6 * (1 - Math.exp(-t / tau)))]); } return p; };
    let b = a.g + pl(curve(1.2), { c: BLU, w: 2.4 }) + pl(curve(2.4), { c: RED, w: 2.4 });
    b += tx(a.fx(3.1), a.fy(5.6), "P", { f: BLU, b: true, s: 14 }) + tx(a.fx(6.2), a.fy(4.85), "Q", { f: RED, b: true, s: 14 });
    return svg(480, 300, "Graph of the potential difference across a capacitor in volts against time in seconds, with two charging curves, P and Q, both starting at zero. Curve P rises quickly and levels off at 6.0 volts after about 5 seconds. Curve Q rises more slowly, reaching about 5 volts at 4 seconds and nearly 6 volts only after 8 seconds.", b);
  })();

  B.ele = {
    intro:
      "Electricity is the smallest of the three areas, but its questions are the most <strong>calculation-heavy</strong> of the paper, and it is where circuit diagrams and graphs earn marks. These fourteen questions (about 110 marks) cover alternating current and the oscilloscope, resistor networks and power, potential dividers with LDRs and thermistors, EMF and internal resistance, capacitors, band theory, and LEDs and solar cells. Marks are earned in small steps: write the relationship, show every substitution, and give the unit; and for a written explanation, give a <strong>cause and its effect</strong> (&ldquo;the resistance rises, so the share of the supply p.d. rises&rdquo;), not just the names of the quantities.",
    questions: [
      /* ---------------------------------------------------------------- 01 */
      {
        id: "ele-01",
        style: "Context question · oscilloscope trace, peak and r.m.s. values",
        stem:
          "<p>A technician at a rail depot checks the alternating supply that powers the signal lamps. An oscilloscope displays the output of the supply on the screen shown. The oscilloscope settings are Y-gain <strong>2.0 V/div</strong> and timebase <strong>2.0 ms/div</strong>.</p>",
        figure: figScope,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 6, alts: [6000], unitAlts: ["mV"], sf: 2, tol: 0, unit: "V", shown: "6.0",
            q: "State the peak voltage of the supply.",
            why: "The peak is 3.0 divisions above the centre line, so V<sub>peak</sub> = 3.0 div × 2.0 V/div = <strong>6.0 V</strong>. Count from the <em>centre</em> line, not from the bottom of the wave.",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Show that the frequency of the supply is 100 Hz.",
            steps: [
              { desc: "Period from the trace: one cycle is 5.0 div, so T = 5.0 × 2.0 ms = 10 ms", nums: [[10, 0.01]] },
              { desc: "Relationship: f = 1/T", rel: ["f=1/t", "f=1/period", "frequency=1/", "t=1/f", "f=1/0?\\.01", "f=1/10"] },
              { desc: "Final line: f = 100 Hz", ans: 100, alts: [0.1], sf: 2, unit: ["hz", "hertz", "khz"], not: [bareScaled("0?\\.10*", "hz|hertz")] },
            ],
            sample: "One cycle spans 5.0 div, so T = 5.0 × 2.0 ms = 10 ms = 0.010 s\nf = 1/T\nf = 1/0.010 = 100 Hz",
            model: "<ul><li>Period from the trace, 5.0 div × 2.0 ms/div = 10 ms (or 0.010 s) (1)</li><li>f = 1/T (1)</li><li>f = 1/0.010 = 100 Hz, with the final line written (1)</li></ul><p>In a &ldquo;show that&rdquo; question the marks are for showing <em>where the period came from</em>, so write the division count and the timebase. The frequency of 100 Hz must appear as a final line; the given answer alone earns nothing.</p>",
          },
          {
            label: "(c)", type: "num", marks: 1, a: 6 / Math.SQRT2, alts: [6000 / Math.SQRT2], unitAlts: ["mV"], sf: 2, tol: 0, unit: "V", shown: "4.2",
            q: "Calculate the r.m.s. voltage of the supply.",
            why: "V<sub>rms</sub> = V<sub>peak</sub>/√2 = 6.0/√2 = <strong>4.2 V</strong>. A common slip is to quote 6.0 V (the peak) or to <em>multiply</em> by √2 (giving 8.5 V): the r.m.s. value is always <em>smaller</em> than the peak.",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 1,
            q: "The timebase is changed to <strong>1.0 ms/div</strong>. The Y-gain is not changed. Which description of the new trace is correct?",
            opts: [
              "Twice as many complete waves, with the same peak height",
              "Half as many complete waves, with the same peak height",
              "The same number of waves, each twice as tall",
              "Half as many waves, each half as tall",
              "Twice as many waves, each twice as tall",
            ],
            why: "The signal is unchanged: its period is still 10 ms. At 1.0 ms/div one cycle now needs 10 divisions instead of 5, so the screen shows <strong>half as many waves</strong>. The timebase only stretches the time axis, so the height (set by the Y-gain, unchanged) stays the same. Options C, D and E wrongly change the height.",
          },
          {
            label: "(e)", type: "multi", marks: 2, a: [0, 3],
            q: "Which <strong>two</strong> of the following statements about the signal are correct?",
            opts: [
              "The period of the signal is 10 ms.",
              "The r.m.s. voltage of the signal is 6.0 V.",
              "The trace shows direct current because the voltage varies smoothly.",
              "The peak-to-peak voltage of the signal is 12 V.",
              "The frequency of the signal is 10 Hz.",
            ],
            why: "The period is 5.0 div × 2.0 ms = 10 ms (A) and the wave swings from +6.0 V to −6.0 V, so peak-to-peak is 12 V (D). The r.m.s. value is 4.2 V, not 6.0 V (B). A voltage that reverses is alternating, not direct (C). The frequency is 1/0.010 = 100 Hz, not 10 Hz (E).",
          },
        ],
      },
      /* ---------------------------------------------------------------- 02 */
      {
        id: "ele-02",
        style: "Context question · resistor network, current and power",
        stem:
          "<p>The lighting on a model railway layout is wired as shown. A <strong>12 V</strong> supply of negligible internal resistance is connected to a fixed resistor R<sub>1</sub> of resistance 8.0 Ω in series with two lamps, X and Y, which are in parallel. Treat each lamp as a fixed resistor: X has a resistance of 12 Ω and Y has a resistance of 6.0 Ω.</p>",
        figure: figNetwork,
        parts: [
          {
            label: "(a)", type: "calc", marks: 3,
            q: "Calculate the total resistance of the circuit.",
            steps: [
              { desc: "Relationship for resistors in parallel: 1/R = 1/R₁ + 1/R₂", rel: ["1/r[a-z_0-9₀-₉]*=1/" + VNUM + "\\+1/" + VNUM, "r[a-z_0-9]*=\\(?" + VNUM + "x" + VNUM + "\\)?/\\(?" + VNUM + "\\+" + VNUM + "\\)?"] },
              { desc: "Resistance of the parallel pair = 4.0 Ω", nums: [4.0] },
              { desc: "Total resistance 12 Ω (with unit)", ans: 12, sf: 2, unit: "Ω" },
            ],
            sample: "1/R = 1/R₁ + 1/R₂ = 1/12 + 1/6.0\nR(parallel) = 4.0 Ω\nR_T = 8.0 + 4.0 = 12 Ω",
            model: "<ul><li>1/R<sub>p</sub> = 1/R<sub>1</sub> + 1/R<sub>2</sub> (1)</li><li>1/12 + 1/6.0 gives R<sub>p</sub> = 4.0 Ω (do not forget to take the reciprocal) (1)</li><li>R<sub>T</sub> = 8.0 + 4.0 = 12 Ω (1)</li></ul><p>Accept the product-over-sum form 12 × 6.0/(12 + 6.0) for the first two marks.</p>",
          },
          {
            label: "(b)", type: "calc", marks: 4,
            q: "Calculate the current in lamp X.",
            steps: [
              { desc: "Relationship: V = IR", rel: OHM },
              { desc: "Total current from the supply: I = 12/12 = 1.0 A", nums: [1.0] },
              { desc: "p.d. across the parallel lamps: 12 − (1.0 × 8.0) = 4.0 V", nums: [4.0] },
              { desc: "Current in lamp X = 0.33 A (333 mA is also accepted)", ans: 1 / 3, alts: [1000 / 3], sf: 2, unit: ["a", "amps", "amp", "amperes", "ampere", "mA", "ma", "milliamps", "milliamp"], not: [bareScaled("3[0-9]{2}(?:\\.[0-9]+)?", "amps?|amperes?|a")] },
            ],
            sample: "V = IR\nI(total) = V/R = 12/12 = 1.0 A\np.d. across R₁ = 1.0 × 8.0 = 8.0 V, so p.d. across the lamps = 12 − 8.0 = 4.0 V\nI(X) = V/R = 4.0/12 = 0.33 A",
            model: "<ul><li>V = IR (1)</li><li>Total current = 12/12 = 1.0 A (use the answer to (a); ecf) (1)</li><li>p.d. across the lamps = 12 − (1.0 × 8.0) = 4.0 V (1)</li><li>I = 4.0/12 = 0.33 A (1)</li></ul><p>Equally acceptable: the current divides in the ratio of the <em>inverse</em> resistances, I<sub>X</sub> = 1.0 × 6.0/(6.0 + 12) = 0.33 A. A frequent error is to use the full 12 V across lamp X, which ignores the p.d. lost across R<sub>1</sub>.</p>",
          },
          {
            label: "(c)", type: "num", marks: 1, a: 8, sf: 2, tol: 0, unit: "W", shown: "8.0",
            q: "Calculate the power dissipated in resistor R<sub>1</sub>.",
            why: "The current in R<sub>1</sub> is the total current, 1.0 A. P = I²R = 1.0² × 8.0 = <strong>8.0 W</strong>. (Equivalent: P = IV = 1.0 × 8.0 V.) Using 12 V across R<sub>1</sub> instead of 8.0 V gives the wrong answer 18 W.",
          },
          {
            label: "(d)", type: "text", marks: 2, minWords: 8,
            q: "Lamp Y burns out, so no current can pass through it. Explain what happens to the brightness of lamp X.",
            points: [
              { desc: "The resistance of the circuit (parallel section) increases, so the current from the supply falls / X takes a larger share of the 12 V (p.d. across X increases)",
                any: [near("(?:total|overall|circuit|parallel|combined|branch|branches|section|network)\\W+(?:\\w+\\W+){0,3}resistance|resistance\\W+(?:\\w+\\W+){0,3}(?:circuit|parallel|section|branches|network)", INC, 5),
                  "\\b(?:bigger|larger|greater|higher|increased|more)\\W+(?:\\w+\\W+){0,2}(?:share|proportion|fraction)",
                  "(?:" + PD + ")\\W+(?:\\w+\\W+){0,4}(?:across|over|on)\\W+(?:\\w+\\W+){0,2}(?:x|lamp x|it)\\W+(?:\\w+\\W+){0,3}(?:" + INC + ")",
                  near("(?:total|overall|circuit|supply)\\W+(?:\\w+\\W+){0,2}current", DEC, 4)] },
              { desc: "Lamp X becomes brighter", not: ["dimmer", "less bright", "\\bdim\\b", "same brightness", "stays? the same", "no change"],
                any: [near("x|lamp|bulb|it", "brighter|more bright|glows? more|shines? more", 5), near("brightness", "increas\\w*|rises?|greater|higher", 4)] },
            ],
            sample: "With lamp Y removed, the resistance of the parallel section increases, so lamp X takes a larger share of the 12 V and the p.d. across it increases. Lamp X therefore becomes brighter.",
            model: "<ul><li>Removing Y raises the resistance of the parallel section (and of the circuit): X gets a larger share of the supply p.d. / the p.d. across X increases (1)</li><li>so the current in X increases and X is brighter (1)</li></ul><p>Check: with Y removed R<sub>T</sub> = 8.0 + 12 = 20 Ω, I = 0.60 A and the p.d. across X is 7.2 V, up from 4.0 V. The total current actually <em>falls</em> (1.0 A to 0.60 A), but the current in X <em>rises</em> (0.33 A to 0.60 A). &ldquo;X is dimmer because there is less current&rdquo; confuses the supply current with the current in X, and earns nothing.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 03 */
      {
        id: "ele-03",
        style: "Context question · potential divider with an LDR",
        stem:
          "<p>A street lamp must switch on automatically at dusk. A technician tests the sensor circuit shown. The supply is <strong>9.0 V</strong> with negligible internal resistance and the fixed resistor has a resistance of <strong>2.0 kΩ</strong>. The LDR has a resistance of <strong>0.50 kΩ</strong> in bright daylight and <strong>18 kΩ</strong> in darkness. The voltmeter has a very high resistance.</p>",
        figure: figLdr,
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 3,
            q: "The light level on the LDR is increased. Which row shows what happens to the resistance of the LDR and to the voltmeter reading?",
            opts: [
              "LDR resistance increases; voltmeter reading increases",
              "LDR resistance increases; voltmeter reading decreases",
              "LDR resistance decreases; voltmeter reading increases",
              "LDR resistance decreases; voltmeter reading decreases",
              "LDR resistance stays the same; voltmeter reading decreases",
            ],
            why: "More light means a <strong>smaller</strong> LDR resistance. The LDR is a smaller part of the total resistance, so it takes a smaller share of the 9.0 V and the voltmeter, which is across the LDR, reads less. Row C would be correct only if the voltmeter were across the fixed resistor.",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Calculate the voltmeter reading when the LDR is in darkness.",
            steps: [
              { desc: "Potential divider relationship, e.g. V₁ = R₁/(R₁ + R₂) × V_S, or V₁/V₂ = R₁/R₂, or V = IR",
                rel: DIVIDER },
              { desc: "Correct substitution: 18 (kΩ), 2.0 (kΩ) and 9.0 V", nums: [[18, 18000], [2, 2000, 20, 20000], 9] },
              { desc: "Voltmeter reading 8.1 V", ans: 8.1, sf: 2, unit: ["v", "volts", "volt"] },
            ],
            sample: "V_LDR = R_LDR/(R_LDR + R) × V_S\nV_LDR = 18/(18 + 2.0) × 9.0\nV_LDR = 8.1 V",
            model: "<ul><li>V<sub>1</sub> = (R<sub>1</sub>/(R<sub>1</sub> + R<sub>2</sub>)) V<sub>S</sub> (1)</li><li>18/(18 + 2.0) × 9.0 (kΩ may be used for both resistances, they only need the same unit) (1)</li><li>8.1 V (1)</li></ul><p>Alternative: V<sub>LDR</sub>/V<sub>R</sub> = 18/2.0 with V<sub>LDR</sub> + V<sub>R</sub> = 9.0 V gives 8.1 V and 0.90 V; or the series current I = 9.0/20 000 = 4.5 × 10<sup>−4</sup> A and V = IR = 8.1 V.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, minWords: 8,
            q: "The voltmeter reading is used to switch on the lamp. Explain why the voltmeter reading changes as the daylight fades.",
            points: [
              { desc: "The resistance of the LDR increases as the light level falls", not: ["\\bnot\\b.{0,30}(?:increas|rise)"],
                all: ["ldr|light|dark|dusk|night", near("resistance|r", INC, 5)] },
              { desc: "The LDR takes a larger share of the 9.0 V, so the p.d. across the LDR (voltmeter reading) increases",
                all: ["ldr|voltmeter|reading|share|darker|dark", near(PD + "|reading|share|proportion|reads?", INC + "|more", 4)] },
            ],
            sample: "As the daylight fades the resistance of the LDR increases. The LDR then takes a larger share of the 9.0 V supply, so the p.d. across it, and the voltmeter reading, increases.",
            model: "<ul><li>The resistance of the LDR increases when the light level falls (1)</li><li>The LDR takes a larger share of the supply p.d. (V<sub>1</sub>/V<sub>2</sub> = R<sub>1</sub>/R<sub>2</sub>), so the voltmeter reading increases (1)</li></ul><p>Both marks need the chain resistance, then share of the p.d. A bare &ldquo;it gets darker so the reading goes up&rdquo; is the observation, not the explanation. In the dark the reading is 8.1 V, in daylight 1.8 V.</p>",
          },
          {
            label: "(d)", type: "multi", marks: 2, a: [0, 2],
            q: "Which <strong>two</strong> of the following statements about the circuit are correct?",
            opts: [
              "The p.d. across the fixed resistor and the p.d. across the LDR add up to 9.0 V.",
              "The current in the LDR is greater than the current in the fixed resistor.",
              "If the fixed resistor is replaced by one of larger resistance, the voltmeter reading in darkness decreases.",
              "In darkness the voltmeter reads 9.0 V.",
              "In daylight the p.d. across the fixed resistor is smaller than the p.d. across the LDR.",
            ],
            why: "The two components are in series, so their p.d.s add to the supply p.d. (A) and the current is the <em>same</em> in both (B is wrong). A larger fixed resistor takes a larger share, leaving less for the LDR: with 4.0 kΩ the dark reading falls from 8.1 V to 7.4 V (C). The LDR never takes the whole supply, since the fixed resistor still has a p.d. across it (D). In daylight the LDR is only 0.50 kΩ so it has the smaller p.d., 1.8 V against 7.2 V (E is wrong).",
          },
        ],
      },
      /* ---------------------------------------------------------------- 04 */
      {
        id: "ele-04",
        style: "Experiment question · EMF, internal resistance and a V–I graph",
        stem:
          "<p>A student investigates a cell. She obtains pairs of values of the terminal potential difference <em>V</em> and the current <em>I</em>, and plots the graph shown.</p>",
        figure: figVI,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 4.5, sf: 2, tol: 0, unit: "V", shown: "4.5",
            q: "State the EMF of the cell.",
            why: "When <em>I</em> = 0 there are no lost volts, so the terminal p.d. equals the EMF: the intercept on the vertical axis, <strong>4.5 V</strong>.",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Use the graph to determine the internal resistance of the cell.",
            steps: [
              { desc: "Relationship: r = −gradient (E = V + Ir, so V = E − rI)", rel: ["gradient", "slope", "e=v\\+ir", "v=e-ir", "r=\\(?e-v\\)?/i", "r=e/i", "e=i\\(r\\+r\\)", "v=-ir\\+e", "y=mx\\+c", "y2-y1"] },
              { desc: "Values taken from the graph, e.g. (0, 4.5 V) and (3.0 A, 0)", nums: [[4.5, 3.0, 1.5]] },
              { desc: "Internal resistance 1.5 Ω", ans: 1.5, sf: 2, unit: "Ω" },
            ],
            sample: "gradient = (0 − 4.5)/(3.0 − 0) = −1.5\nr = −gradient = 1.5 Ω",
            model: "<ul><li>r = −gradient, or E = V + Ir (1)</li><li>Correct substitution of values from the line, e.g. (0 − 4.5)/(3.0 − 0), or E = 4.5 V, short-circuit current 3.0 A (1)</li><li>r = 1.5 Ω (1)</li></ul><p>The gradient is <em>negative</em>; r is its magnitude. Accept any pair of points read correctly from the line. Equivalent route: short-circuit current I = E/r, so r = 4.5/3.0.</p>",
          },
          {
            label: "(c)", type: "calc", marks: 3,
            q: "The cell is now connected across a resistor of resistance 3.0 Ω. Calculate the lost volts.",
            steps: [
              { desc: "Relationship: E = I(R + r) or E = V + Ir",
                rel: ["e=i\\(r\\+r\\)", "i=e/\\(?r\\+r\\)?", "e=v\\+ir", "i=e/\\(?[0-9.]+\\+[0-9.]+\\)?", "4\\.5=i\\([0-9.]+\\+[0-9.]+\\)", "v=e-ir", "e=ir\\+ir", "lostvolts=ir", "lostv=ir", "lostvolts=4\\.5-", "lostvolts=e-"] },
              { desc: "Substitution using E = 4.5 V, R = 3.0 Ω and r = 1.5 Ω", nums: [4.5, [3.0, 4.5]] },
              { desc: "Lost volts 1.5 V", ans: 1.5, sf: 2, unit: ["v", "volts", "volt"] },
            ],
            sample: "E = I(R + r)\n4.5 = I × (3.0 + 1.5)\nI = 1.0 A\nlost volts = Ir = 1.0 × 1.5 = 1.5 V",
            model: "<ul><li>E = I(R + r) (1)</li><li>4.5 = I × (3.0 + 1.5), so I = 1.0 A (1)</li><li>lost volts = Ir = 1.0 × 1.5 = 1.5 V (1)</li></ul><p>Alternative: V = IR = 3.0 V across the resistor, so lost volts = E − V = 4.5 − 3.0 = 1.5 V. The unit is the volt: the lost volts are a p.d. (1.5 V), even though the number matches the internal resistance (1.5 Ω).</p>",
          },
          {
            label: "(d)", type: "text", marks: 3, minWords: 12, rows: 6,
            q: "Describe the circuit she used, how she obtained the data, and how the graph is used to find the EMF and the internal resistance of the cell.",
            points: [
              { desc: "Circuit: ammeter in series with the cell and variable resistor; voltmeter connected across the terminals of the cell",
                all: [near("ammeter", "series|in line|with the (?:cell|resistor)|round the circuit", 8), near("voltmeter", "across|parallel|terminals?|over", 8)] },
              { desc: "Change the variable resistor to give a range of currents, recording V and I each time",
                all: [near("vary|varying|change|changing|adjust\\w*|alter\\w*|different|several|range|repeat\\w*", "variable resistor|resistance|rheostat|resistors|currents?|readings?|values|settings", 6), "record\\w*|reading|measure\\w*|note|results|table|read"] },
              { desc: "Plot V against I; the y-intercept is the EMF and the gradient is −r (r = −gradient)", not: ["(?:not|n't)\\W+(?:the\\W+)?(?:e\\.?m\\.?f|emf)"],
                all: ["(?:graph|plot\\w*|draw\\w*)\\W+(?:\\w+\\W+){0,6}(?:v|voltage|t\\.?p\\.?d\\.?|p\\.?d\\.?|potential difference|terminal)\\W+(?:\\w+\\W+){0,4}(?:against|vs\\.?|versus|and|on|with)\\W+(?:\\w+\\W+){0,3}(?:i|current)|\\b(?:v|voltage|p\\.?d\\.?|t\\.?p\\.?d\\.?)\\W+(?:against|vs\\.?|versus)\\W+(?:\\w+\\W+){0,2}(?:i|current)|\\bv\\W{0,3}i\\W+graph|graph of v\\b",
                  near("intercept|where it crosses|where it cuts|where it meets", "e\\.?m\\.?f\\.?|\\be\\b|emf", 6) + "|" + near("gradient|slope", "internal resistance|\\br\\b|resistance", 6)] },
            ],
            sample: "Connect an ammeter in series with the cell and a variable resistor, and connect a voltmeter across the terminals of the cell. Change the variable resistor to give a range of currents and record the voltmeter and ammeter readings each time. Plot a graph of V against I: the y-intercept is the EMF and the gradient is minus the internal resistance, so r is the negative of the gradient.",
            model: "<ul><li>Circuit: the ammeter in series with the cell and variable resistor; the voltmeter across the cell terminals (1)</li><li>Adjust the variable resistor to obtain a range of values of <em>V</em> and <em>I</em>; record each pair (1)</li><li>Plot <em>V</em> (y-axis) against <em>I</em> (x-axis): y-intercept = EMF, gradient = −<em>r</em> (1)</li></ul><p>Switching off between readings (so the cell does not warm up) is good practice but not required. The resistance of the connecting wires is not a correction to make in this method, since V and I are measured directly at the cell.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 05 */
      {
        id: "ele-05",
        style: "Context question · car battery, lost volts and short circuit",
        stem:
          "<p>A car battery has an EMF of <strong>12.4 V</strong> and an internal resistance of <strong>0.040 Ω</strong>. The headlamps are connected directly across the battery terminals. When the driver operates the starter motor, the battery supplies a current of <strong>150 A</strong> in total.</p>",
        parts: [
          {
            label: "(a)", type: "text", marks: 2, minWords: 8,
            q: "The headlamps become dimmer while the starter motor is operating. Explain why.",
            points: [
              { desc: "The starter motor draws a large current from the battery (the current in the battery increases)",
                all: ["starter|motor|large|big|high|increas|heavy", near("current", "large|big|high|increas\\w*|greater|larger|bigger|draws?|heavy", 5)] },
              { desc: "More p.d. is lost across the internal resistance (more lost volts), so the terminal p.d. across the lamps falls", not: ["(?:not|n't|never)\\W+(?:\\w+\\W+){0,1}(?:dimmer|dim)"],
                any: [near("lost volts|internal resistance|\\bir\\b", "more|increas\\w*|greater|larger|bigger|higher|lost|lose|loses|drop\\w*|across", 6) + "|" + near("lost volts", "increas\\w*|greater|larger|bigger|higher", 6),
                  near("t\\.?p\\.?d\\.?|terminal|" + PD + "|lamps?|headlamps?", DEC, 6)],
                all: ["lost volts|internal resistance|\\bir\\b|t\\.?p\\.?d\\.?|terminal"] },
            ],
            sample: "The starter motor draws a very large current from the battery. This increases the lost volts across the internal resistance of the battery, so the terminal p.d. across the headlamps falls and they are dimmer.",
            model: "<ul><li>The starter motor draws a large current from the battery (1)</li><li>so the lost volts (Ir) across the internal resistance increase, and the terminal p.d. across the lamps decreases (1)</li></ul><p>E = V + Ir: E is fixed, so when I rises V must fall. A bare &ldquo;the starter uses up the power&rdquo; earns nothing. Do not accept &ldquo;the battery runs out&rdquo;: the battery's EMF does not change.</p>",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Calculate the terminal potential difference of the battery while the starter motor is operating.",
            steps: [
              { desc: "Relationship: E = V + Ir", rel: ["e=v\\+ir", "v=e-ir", "v=e-\\(?ixr", "lostvolts=ir", "lostv=ir", "e=ir\\+v"] },
              { desc: "Substitution: 12.4, 150 and 0.040 (lost volts 6.0 V)", nums: [12.4, [150, 6.0], [0.04, 6.0]] },
              { desc: "Terminal p.d. 6.4 V", ans: 6.4, sf: 2, unit: ["v", "volts", "volt"] },
            ],
            sample: "E = V + Ir\n12.4 = V + (150 × 0.040)\nV = 12.4 − 6.0 = 6.4 V",
            model: "<ul><li>E = V + Ir (1)</li><li>12.4 = V + (150 × 0.040) (1)</li><li>V = 6.4 V (1)</li></ul><p>The lost volts are Ir = 6.0 V, about half the EMF Giving 6.0 V (the lost volts) as the answer is the commonest error.</p>",
          },
          {
            label: "(c)", type: "num", marks: 1, a: 310, sf: 3, tol: 0, unit: "A", shown: "3.1 × 10²",
            q: "The battery terminals are accidentally joined by a thick copper bar of negligible resistance. Calculate the current in the bar.",
            why: "Short circuit: all of the EMF is across the internal resistance, so I = E/r = 12.4/0.040 = <strong>310 A</strong> (3.1 × 10² A).",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 2,
            q: "A voltmeter of very high resistance is connected across the battery terminals with nothing else connected to the battery. What does it read?",
            opts: ["0 V", "6.4 V", "12.4 V", "310 V", "6.2 V"],
            why: "With no other component there is a negligible current, so there are no lost volts and the terminal p.d. equals the <strong>EMF, 12.4 V</strong>. 0 V would be the reading for a short circuit.",
          },
        ],
      },
      /* ---------------------------------------------------------------- 06 */
      {
        id: "ele-06",
        style: "Experiment question · capacitor charged at constant current",
        stem:
          "<p>In an investigation a capacitor is charged using a constant current of <strong>40 µA</strong>. A voltmeter connected across the capacitor is read at intervals, and the p.d. across the capacitor against time is shown in the graph. The capacitor is uncharged at time <em>t</em> = 0.</p>",
        figure: figConstI,
        parts: [
          {
            label: "(a)", type: "calc", marks: 4,
            q: "Calculate the capacitance of the capacitor.",
            steps: [
              { desc: "Relationship: Q = It", rel: ["q=it", "i=q/t", "t=q/i", "q=ixt"] },
              { desc: "Charge Q = 40 × 10⁻⁶ × 50 = 2.0 × 10⁻³ C", nums: [0.002] },
              { desc: "Relationship C = Q/V with V = 4.0 V", rel: ["c=q/v", "v=q/c", "q=cv", "c=[0-9.x^\\-]+[/÷]4(?:\\.0)?(?![0-9])"], nums: [4.0] },
              { desc: "Capacitance 5.0 × 10⁻⁴ F (500 µF is also accepted)", ans: 5e-4, alts: [500, 0.5], sf: 2, unit: ["f", "µf", "mf", "farads", "farad", "microfarads", "microfarad"], not: [bareScaled("(?:500(?:\\.0+)?|0?\\.5(?:0+)?)", "f|farads?")] },
            ],
            sample: "Q = It = 40 × 10⁻⁶ × 50 = 2.0 × 10⁻³ C\nC = Q/V = 2.0 × 10⁻³ / 4.0\nC = 5.0 × 10⁻⁴ F",
            model: "<ul><li>Q = It (1)</li><li>Q = 40 × 10<sup>−6</sup> × 50 = 2.0 × 10<sup>−3</sup> C (read t = 50 s and V = 4.0 V from the graph) (1)</li><li>C = Q/V = 2.0 × 10<sup>−3</sup>/4.0 (1)</li><li>C = 5.0 × 10<sup>−4</sup> F (500 µF) (1)</li></ul><p>Convert the microamps: 40 µA is 40 × 10<sup>−6</sup> A. Leaving it as 40 gives an answer 10<sup>6</sup> times too big.</p>",
          },
          {
            label: "(b)", type: "num", marks: 1, a: 0.004, alts: [4], unitAlts: ["mJ"], sf: 2, tol: 0, unit: "J", shown: "4.0 × 10⁻³",
            q: "Calculate the energy stored in the capacitor at 50 s.",
            why: "E = ½QV = ½ × 2.0 × 10<sup>−3</sup> × 4.0 = <strong>4.0 × 10<sup>−3</sup> J</strong>; equivalently ½CV² = ½ × 5.0 × 10<sup>−4</sup> × 4.0². Do not use QV, which is twice the stored energy.",
          },
          {
            label: "(c)", type: "text", marks: 2, minWords: 10,
            q: "The charging circuit contains a variable resistor in series with the capacitor. Explain why the variable resistor has to be adjusted as the capacitor charges, in order to keep the current constant.",
            points: [
              { desc: "As the capacitor charges, the p.d. across the capacitor increases, so the p.d. across the resistor decreases",
                any: [near("(?:" + PD + ")\\W+(?:\\w+\\W+){0,4}(?:across|over|on)\\W+(?:\\w+\\W+){0,2}(?:resistor|variable resistor|r)", DEC, 5),
                  near("(?:" + PD + ")\\W+(?:\\w+\\W+){0,4}(?:across|over|of|on)\\W+(?:\\w+\\W+){0,2}(?:capacitor)", INC, 5),
                  "supply\\W+(?:\\w+\\W+){0,3}(?:" + PD + ")\\W+(?:\\w+\\W+){0,6}(?:shared|split)"] },
              { desc: "The resistance must be decreased so that I = V/R stays constant",
                all: [near("resistance|resistor|\\br\\b", "decreas\\w*|reduc\\w*|lower\\w*|smaller|turned down|less|decrease", 6), near("current|i", "constant|steady|maintain\\w*|keep\\w*|kept|stays?|remain\\w*|same", 5)] },
            ],
            sample: "As the capacitor charges, the p.d. across the capacitor increases, so the p.d. across the resistor decreases. The resistance of the variable resistor must therefore be reduced so that the current, I = V/R, stays constant.",
            model: "<ul><li>The p.d. across the capacitor increases as it charges, so the p.d. across the series resistor (V<sub>S</sub> − V<sub>C</sub>) decreases (1)</li><li>The resistance must be reduced so that I = V/R is kept constant (1)</li></ul><p>If R were left alone the current would fall, and the p.d.–time graph would curve over instead of being a straight line.</p>",
          },
          {
            label: "(d)", type: "match", marks: 3,
            q: "Match each term to its correct description.",
            pairs: [
              ["Capacitance", "The charge stored by a capacitor for each volt of p.d. across it"],
              ["One farad", "The capacitance of a capacitor that stores 1 coulomb of charge when the p.d. across it is 1 volt"],
              ["Energy stored in a capacitor", "The area under the graph of charge against p.d."],
            ],
          },
        ],
      },
      /* ---------------------------------------------------------------- 07 */
      {
        id: "ele-07",
        style: "Context question · discharging a capacitor through a resistor",
        stem:
          "<p>A safety lamp unit on a rail platform is powered by the energy stored in a capacitor. In the circuit shown, switch S is first at position 1 until the <strong>680 µF</strong> capacitor is fully charged by the 9.0 V cell. S is then moved to position 2 so that the capacitor discharges through the <strong>450 Ω</strong> resistor R.</p>",
        figure: figDischarge,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 680e-6 * 9, alts: [6.12], unitAlts: ["mC"], sf: 2, tol: 0, unit: "C", shown: "6.1 × 10⁻³",
            q: "Calculate the charge stored on the capacitor when it is fully charged.",
            why: "Q = CV = 680 × 10<sup>−6</sup> × 9.0 = 6.12 × 10<sup>−3</sup> C, so <strong>6.1 × 10<sup>−3</sup> C</strong>. Convert microfarads: 680 µF = 680 × 10<sup>−6</sup> F.",
          },
          {
            label: "(b)", type: "text", marks: 3, minWords: 14, rows: 6,
            q: "Describe and explain how the current in R changes from the moment S is moved to position 2 until the capacitor has lost all its charge.",
            points: [
              { desc: "The current is greatest at the start (the capacitor is at full p.d., so I = V/R is largest)", not: ["(?:not|n't|never)\\W+(?:\\w+\\W+){0,1}(?:largest|greatest|maximum|biggest|highest)"],
                all: [near("current|highest|greatest|largest|maximum", "largest|greatest|maximum|biggest|highest|0\\.02", 4), "start|begin\\w*|first|initial\\w*|immediate\\w*|moment|at once"] },
              { desc: "As charge leaves, the p.d. across the capacitor falls, so the current falls",
                all: [near(PD, DEC, 6), near("current", DEC, 6) + "|(?:decreas\\w*|falls?|drops?) as (?:the )?(?:capacitor|charge) (?:discharges|loses|leaves|flows)"] },
              { desc: "The current falls to zero (quickly at first, then more slowly) when the capacitor is fully discharged",
                any: [near("zero|stops|nothing|no current|reaches 0", "current", 5), near("zero|stops|reaches 0", "discharged|no charge|empty|flat|fully|all (?:its )?charge", 8), "(?:quickly|rapidly|fast)\\W+(?:\\w+\\W+){0,3}(?:at first)", "exponential"] },
            ],
            sample: "At the start the current is largest, because the capacitor has its full p.d. and I = V/R. As charge flows off the plates the p.d. across the capacitor falls, so the current falls too. It drops quickly at first and then more slowly, and reaches zero when the capacitor is completely discharged.",
            model: "<ul><li>The current is greatest at the start, I = V<sub>C</sub>/R = 9.0/450 = 0.020 A (1)</li><li>As the capacitor discharges its p.d. falls, so the current (V<sub>C</sub>/R) falls (1)</li><li>The current falls to zero, quickly at first and then more slowly (1)</li></ul><p>The current in R is in the opposite direction to the charging current. No current ever passes <em>through</em> the insulator between the plates; the current is in the wires as charge leaves the plates.</p>",
          },
          {
            label: "(c)", type: "num", marks: 1, a: 0.02, alts: [20], unitAlts: ["mA"], sf: 2, tol: 0, unit: "A", shown: "2.0 × 10⁻²",
            q: "Calculate the initial current in R just after S is moved to position 2.",
            why: "At the start the capacitor still has its full 9.0 V across it, so I = V/R = 9.0/450 = <strong>0.020 A</strong>.",
          },
          {
            label: "(d)", type: "text", marks: 2, minWords: 10,
            q: "Resistor R is replaced by a resistor of larger resistance, and the capacitor is again charged to 9.0 V. Explain what happens to the initial current and why the capacitor takes longer to discharge.",
            points: [
              { desc: "The initial current is smaller, since I = V/R with the same p.d. and a larger R", not: ["(?:not|n't|never)\\W+(?:\\w+\\W+){0,1}(?:smaller|lower|less|reduc\\w*|decreas\\w*|fall\\w*|halved|weaker)"],
                all: [near("current|i\\b", "smaller|lower|less|reduc\\w*|decreas\\w*|falls?|halved|weaker", 5)] },
              { desc: "Charge flows off the capacitor more slowly (the rate of flow of charge is smaller), so its p.d. falls more slowly",
                any: [near("charge|electrons", "slow\\w*|more gradual\\w*|less quickly|more time", 8), near("rate", "smaller|lower|slower|reduc\\w*", 4)] },
            ],
            sample: "The initial current is smaller because I = V/R and the resistance is larger. A smaller current means charge flows off the capacitor more slowly, so its p.d. takes longer to fall to zero.",
            model: "<ul><li>The initial current is smaller, because I = V/R with the same V (the capacitor is charged to the same 9.0 V) and a greater R (1)</li><li>A smaller current means charge flows off at a lower rate, so the capacitor takes longer to discharge (1)</li></ul><p>The total charge to be removed (Q = CV) is unchanged, so it is the smaller rate of flow that makes the discharge slower.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 08 */
      {
        id: "ele-08",
        style: "Context question · capacitor in a camera flash",
        stem:
          "<p>A compact camera has a flash unit containing a <strong>120 µF</strong> capacitor. The capacitor is charged by the camera's 3.0 V battery, through a voltage converter, to <strong>300 V</strong> over a few seconds. When the picture is taken, the capacitor discharges through the flash lamp in <strong>1.5 ms</strong>.</p>",
        parts: [
          {
            label: "(a)", type: "calc", marks: 3,
            q: "Calculate the energy stored in the capacitor when it is charged to 300 V.",
            steps: [
              { desc: "Relationship: E = ½CV² (or ½QV, ½Q²/C)", rel: ["e[a-z_]*=\\(?" + HALF, "e[a-z_]*=q\\^?2/\\(?2c", "e[a-z_]*=\\(?c?x?v\\^2/2"] },
              { desc: "Substitution: ½ × 120 × 10⁻⁶ × 300²", nums: [[1.2e-4, 120, 0.036], [300, 90000]] },
              { desc: "Energy 5.4 J", ans: 5.4, sf: 2, unit: ["j", "joules", "joule"] },
            ],
            sample: "E = ½CV²\nE = ½ × 120 × 10⁻⁶ × 300²\nE = 5.4 J",
            model: "<ul><li>E = ½CV² (1)</li><li>E = ½ × 120 × 10<sup>−6</sup> × 300<sup>2</sup> (1)</li><li>E = 5.4 J (1)</li></ul><p>Alternative: Q = CV = 3.6 × 10<sup>−2</sup> C, then E = ½QV = ½ × 3.6 × 10<sup>−2</sup> × 300 = 5.4 J. Forgetting to square V, or to convert 120 µF, are the usual errors.</p>",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Calculate the average current in the flash lamp during the 1.5 ms discharge.",
            steps: [
              { desc: "Relationship: Q = It (I = Q/t)", rel: ["i=q/t", "q=it", "t=q/i", "q=ixt", "i=\\(?cv\\)?/t"] },
              { desc: "Charge Q = CV = 3.6 × 10⁻² C and t = 1.5 × 10⁻³ s", nums: [0.036, [1.5e-3, 1.5]] },
              { desc: "Current 24 A", ans: 24, sf: 2, unit: ["a", "amps", "amp", "amperes", "ampere"] },
            ],
            sample: "Q = CV = 120 × 10⁻⁶ × 300 = 3.6 × 10⁻² C\nI = Q/t = 3.6 × 10⁻² / 1.5 × 10⁻³\nI = 24 A",
            model: "<ul><li>Q = CV and Q = It (I = Q/t) (1)</li><li>Q = 120 × 10<sup>−6</sup> × 300 = 3.6 × 10<sup>−2</sup> C; t = 1.5 × 10<sup>−3</sup> s (1)</li><li>I = 24 A (1)</li></ul>",
          },
          {
            label: "(c)", type: "text", marks: 2, minWords: 10,
            q: "Explain why the flash unit uses a capacitor, rather than being connected directly to the 3.0 V battery.",
            points: [
              { desc: "The flash needs a very large current for a very short time, which the battery (with its internal resistance) cannot supply directly",
                any: [near("battery|cell", "internal resistance|lost volts|cannot|can't|unable|not able|too small|too weak|too slow", 8) + "|" + near("large|big|high|huge", "current|power", 4),
                  near("short|brief|quick\\w*|fraction of a second", "burst|time|energy|current|release", 6)],
                all: ["battery|cell|supply"] },
              { desc: "The capacitor stores the energy gradually, then releases it very quickly as a large current",
                all: [near("capacitor", "stores?|stored|storing|charg\\w*|builds? up|collects?", 5), near("releas\\w*|discharg\\w*|dump\\w*|delivers?|gives? out|gives? off|burst", "quick\\w*|rapid\\w*|short|sudden\\w*|fast|large|big|high|burst", 6)] },
            ],
            sample: "The flash needs a very large current for a very short time, and the battery cannot supply that because of its internal resistance. The capacitor stores energy slowly from the battery and then releases it quickly as a large current through the lamp.",
            model: "<ul><li>The flash needs a large current (high power) for a very short time, which the battery could not supply because of its internal resistance (lost volts) (1)</li><li>The capacitor charges slowly from the battery, storing the energy, and then discharges it all very rapidly through the lamp (1)</li></ul><p>Power = E/t = 5.4/1.5 × 10<sup>−3</sup> = 3.6 kW: far more than a small battery could deliver in one go.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 09 */
      {
        id: "ele-09",
        style: "Context question · band theory of conductors, insulators and semiconductors",
        stem:
          "<p>The energy band diagrams for three solid materials, X, Y and Z, are shown. At room temperature one material is a conductor, one is an insulator and one is a semiconductor.</p>",
        figure: figBands,
        parts: [
          {
            label: "(a)", type: "match", marks: 3,
            q: "Match each material to the type of solid that it is.",
            pairs: [
              ["Material X", "A conductor"],
              ["Material Y", "An insulator"],
              ["Material Z", "A semiconductor"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 2, minWords: 10,
            q: "The temperature of material Z is increased. Explain why its electrical conductivity increases.",
            points: [
              { desc: "More electrons gain enough energy to cross the (small) gap from the valence band to the conduction band",
                all: ["temperature|thermal|heat\\w*|hotter|warm\\w*", "energy|valence|band", "gap|cross\\w*|jump\\w*|promot\\w*|excit\\w*|move\\w* (?:up )?(?:in)?to the conduction|reach\\w*|conduction"] },
              { desc: "So there are more free charge carriers (electrons in the conduction band, and holes) to carry current",
                all: [near("more|increas\\w*|greater|larger|higher|extra", "carriers?|free electrons|electrons|holes|charges?", 5), "conductivity|conducts?\\b|resistance|carry|carries|current"] },
            ],
            sample: "At a higher temperature more electrons gain enough energy to cross the small gap from the valence band into the conduction band. There are then more free electrons, and holes, available to carry charge, so the conductivity is greater.",
            model: "<ul><li>At the higher temperature more electrons gain enough energy to cross the gap between the valence band and the conduction band (1)</li><li>There are more charge carriers (free electrons in the conduction band, and holes in the valence band), so the conductivity is greater / the resistance is less (1)</li></ul><p>Z has a <em>small</em> gap, so thermal energy at room temperature already lifts some electrons across. This is opposite to a metal, whose resistance rises with temperature.</p>",
          },
          {
            label: "(c)", type: "multi", marks: 2, a: [0, 2],
            q: "Which <strong>two</strong> of the following statements are correct?",
            opts: [
              "In material Y the valence band is full and the gap to the conduction band is too large for electrons to cross at room temperature.",
              "In material X the valence band is full and there is a large gap above it.",
              "In material Z some electrons have enough energy at room temperature to reach the conduction band.",
              "Electrons in a full valence band are free to move through a solid.",
              "Material Z is a conductor because its valence band is full.",
            ],
            why: "Y is an insulator: full valence band and a large gap (A). Z has a small gap, so at room temperature some electrons are thermally lifted into the conduction band (C). X is a conductor because its bands overlap, not because of a large gap (B). Electrons need <em>empty states</em> to move into, so a completely full valence band cannot conduct (D). A full valence band alone does not make a conductor (E).",
          },
        ],
      },
      /* ---------------------------------------------------------------- 10 */
      {
        id: "ele-10",
        style: "Context question · doping, the p–n junction and an LED",
        stem:
          "<p>A red LED is made from a p–n junction, formed by doping a semiconductor. It is connected in a circuit with a resistor and a cell as shown, with the positive terminal of the cell connected to the p-type side. The LED emits red light of wavelength <strong>625 nm</strong>.</p>",
        figure: figPN,
        parts: [
          {
            label: "(a)", type: "text", marks: 2, minWords: 10,
            q: "Explain how a semiconductor is made p-type, and what the majority charge carriers are.",
            points: [
              { desc: "Impurity atoms with one fewer outer electron than the semiconductor atoms are added (doping)", not: ["(?:not|n't)\\W+(?:\\w+\\W+){0,1}(?:one )?(?:fewer|less)"],
                all: ["impurit\\w*|dop\\w*|atoms?", near("fewer|less|one less|one fewer|three|3|lacks?|short of|missing", "electrons?|outer|valence", 5)] },
              { desc: "This leaves holes in the valence band, which act as the positive majority charge carriers", not: ["(?:not|n't)\\W+(?:\\w+\\W+){0,1}(?:one )?(?:fewer|less)"],
                all: ["holes?", "positive|majority|carriers?|valence"] },
            ],
            sample: "A p-type semiconductor is made by adding impurity atoms that have one fewer outer electron than the atoms of the semiconductor. This leaves gaps, called holes, in the valence band, and the holes act as positive charge carriers.",
            model: "<ul><li>The semiconductor is doped with impurity atoms that have one fewer outer (valence) electron (1)</li><li>This creates holes in the valence band; the holes are the majority carriers and behave as positive charge carriers (1)</li></ul><p>Do not accept &ldquo;it has extra electrons&rdquo; (that is n-type) or &ldquo;the holes are positive ions&rdquo;. Naming the impurity (boron) is not needed.</p>",
          },
          {
            label: "(b)", type: "text", marks: 3, minWords: 14, rows: 6,
            q: "Explain, in terms of electrons and the energy bands, how the LED gives out light when it is connected as shown.",
            points: [
              { desc: "The cell connected this way is forward bias: it reduces the electric field in the junction and electrons move from the n-type to the p-type (across the junction in the conduction band)",
                all: ["electrons?", "junction|n-type|p-type|across|cross\\w*|n side|p side", "forward|reduc\\w*|move\\w*|flow\\w*|pass\\w*|cross\\w*"] },
              { desc: "Electrons fall from the conduction band into the valence band (combining with holes)",
                all: [near("fall\\w*|drop\\w*|jump\\w*|move\\w*|go(?:es)? down|combin\\w*|recombin\\w*|fill\\w*|lose energy", "valence band|holes?", 6), "conduction band|conduction"] },
              { desc: "The energy released is emitted as photons (of light)",
                any: [near("photons?", "emit\\w*|releas\\w*|given (?:off|out)|radiat\\w*|produc\\w*|gives? out|gives? off|energy", 6), near("energy", "emitted|released|given (?:off|out)|lost as|converted|radiated", 5) + "|" + near("energy", "photon|photons", 6)] },
            ],
            sample: "The junction is forward biased, so the electric field in the junction is reduced and electrons move across from the n-type to the p-type material. The electrons then fall from the conduction band into the valence band, combining with holes. The energy they lose is given out as photons of light.",
            model: "<ul><li>Forward bias reduces the electric field in the junction, so electrons move from the n-type side to the p-type side (1)</li><li>The electrons fall from the conduction band to the valence band (and combine with holes) (1)</li><li>The energy lost by each electron is emitted as a photon (1)</li></ul><p>Precise band words matter: electrons <em>fall from the conduction band to the valence band</em>. &ldquo;The electrons fall from the n-type to the p-type&rdquo; names the layers, not the bands.</p>",
          },
          {
            label: "(c)", type: "calc", marks: 4,
            q: "Calculate the energy of each photon emitted by the LED.",
            steps: [
              { desc: "Relationship for frequency: v = fλ (or c = fλ, f = c/λ); or the combined E = hc/λ", rel: ["v=fλ", "f=v/λ", "c=fλ", "f=c/λ", "v=flambda", "f=v/lambda", "f=c/lambda", "v=f\\*λ", "c=f\\*lambda", "v=fx", "e=hc/", "e=hxc/", "e=\\(hxc\\)/", "e=h\\*c/"] },
              { desc: "Frequency f = 4.8 × 10¹⁴ Hz; or, by the combined route, 6.63 × 10⁻³⁴, 3.00 × 10⁸ and 625 × 10⁻⁹ substituted into E = hc/λ", rel: ["4\\.8x10\\^?14", "4\\.80?e14", "480thz", "(?=.*6\\.63(?:x10\\^?-34|e-34))(?=.*3(?:\\.0+)?(?:x10\\^?8|e8))(?=.*(?:625|6\\.25))"] },
              { desc: "Relationship E = hf with h = 6.63 × 10⁻³⁴ J s (or E = hc/λ with the data substituted)", rel: ["e=hf", "e=hxf", "e=h\\*f", "e=6\\.63", "e=hc/", "e=hxc/", "e=\\(hxc\\)/", "e=h\\*c/"], nums: [6.63e-34] },
              { desc: "Photon energy 3.18 × 10⁻¹⁹ J", ans: 3.1824e-19, sf: 3, unit: ["j", "joules", "joule"] },
            ],
            sample: "v = fλ\nf = v/λ = 3.00 × 10⁸ / 625 × 10⁻⁹ = 4.8 × 10¹⁴ Hz\nE = hf = 6.63 × 10⁻³⁴ × 4.8 × 10¹⁴\nE = 3.18 × 10⁻¹⁹ J",
            model: "<ul><li>v = fλ (c = fλ) (1)</li><li>f = 3.00 × 10<sup>8</sup>/625 × 10<sup>−9</sup> = 4.8 × 10<sup>14</sup> Hz (1)</li><li>E = hf with h = 6.63 × 10<sup>−34</sup> (1)</li><li>E = 3.18 × 10<sup>−19</sup> J (1)</li></ul><p>Alternative route, full marks: E = hc/λ (this earns the first and third marks together), then E = 6.63 × 10<sup>−34</sup> × 3.00 × 10<sup>8</sup> / 625 × 10<sup>−9</sup> (second mark), E = 3.18 × 10<sup>−19</sup> J (fourth mark). This energy is approximately the band gap of the semiconductor. Convert nm to metres (625 nm = 625 × 10<sup>−9</sup> m); leaving it as 625 gives a frequency of 4.8 × 10<sup>6</sup> Hz.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 11 */
      {
        id: "ele-11",
        style: "Context question · LED colours and a solar cell",
        stem:
          "<p>A railway footbridge has a display made from red and blue LEDs, powered by a roof-mounted solar panel. The red and the blue LEDs are made from different semiconductor materials.</p>",
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 3,
            q: "The blue LED needs a larger forward p.d. than the red LED to operate. Which statement explains this?",
            opts: [
              "Blue light has a lower frequency, so each electron needs less energy.",
              "The blue LED has a smaller band gap than the red LED.",
              "Blue photons have less energy, so more electrons are needed.",
              "The blue LED has a larger band gap, so it emits higher-energy photons.",
              "The blue LED has a larger wavelength, so the junction is wider.",
            ],
            why: "Blue light has a higher frequency than red, so E = hf is larger. A bigger photon energy needs a <strong>bigger band gap</strong>, and a larger forward p.d. to give the electrons that energy. Options A, B, C and E all swap the relationship round.",
          },
          {
            label: "(b)", type: "text", marks: 2, minWords: 10,
            q: "Explain how a potential difference is produced across a solar cell when light shines on it.",
            points: [
              { desc: "Absorbed photons give electrons enough energy to move from the valence band to the conduction band (producing electron-hole pairs)",
                all: [near("photons?|light", "absorb\\w*|hit\\w*|strike\\w*|arrive|shine\\w*|shining|give\\w*|provid\\w*|transfer\\w*", 6), near("electrons?", "valence|conduction|energy|excit\\w*|freed|free|release\\w*|promot\\w*|pairs?", 6), "conduction band|conduction|electron-hole|pairs?"] },
              { desc: "The electric field in the junction pushes the electrons to the n-type side (and the holes to the p-type side), so a p.d. develops across the cell",
                all: [near("field|junction|depletion", "push\\w*|force\\w*|sweep\\w*|separat\\w*|drives?|driven|attract\\w*", 6), "n-type|n side|p-type|p side|opposite|across|between|terminals?|p\\.?d\\.?|voltage"] },
            ],
            sample: "Photons of light are absorbed in the junction and give electrons enough energy to move from the valence band to the conduction band. The electric field in the junction then pushes the electrons to the n-type side and the holes to the p-type side, so a potential difference is produced across the cell.",
            model: "<ul><li>Photons are absorbed and give electrons enough energy to move from the valence band to the conduction band (1)</li><li>The electric field across the junction separates the charges (electrons to the n-type, holes to the p-type), so a p.d. is produced between the layers (1)</li></ul><p>This is the photovoltaic effect. It needs no external supply: the cell is a source, not a forward-biased device.</p>",
          },
          {
            label: "(c)", type: "calc", marks: 3,
            q: "The panel delivers a current of 3.2 A at a potential difference of 15 V. Calculate the electrical power output of the panel.",
            steps: [
              { desc: "Relationship: P = IV", rel: ["p=iv", "p=ixv", "p=vi", "p=vxi", "p=i\\^2r", "p=v\\^2/r", "power=current[x×]voltage", "power=voltage[x×]current"] },
              { desc: "Substitution: 3.2 × 15", nums: [3.2, 15] },
              { desc: "Power 48 W", ans: 48, sf: 2, unit: ["w", "watts", "watt"] },
            ],
            sample: "P = IV\nP = 3.2 × 15\nP = 48 W",
            model: "<ul><li>P = IV (1)</li><li>P = 3.2 × 15 (1)</li><li>P = 48 W (1)</li></ul>",
          },
          {
            label: "(d)", type: "multi", marks: 2, a: [0, 2],
            q: "Which <strong>two</strong> of the following statements about solar cells and LEDs are correct?",
            opts: [
              "In a solar cell, absorbed photons give electrons enough energy to move from the valence band to the conduction band.",
              "A solar cell must be forward biased by an external supply in order to work.",
              "In an LED, electrons fall from the conduction band to the valence band and photons are emitted.",
              "A photon of lower energy than the band gap will always produce a p.d. in a solar cell.",
              "An LED works best when it is reverse biased.",
            ],
            why: "A and C describe the two processes correctly: a solar cell turns absorbed photons into a p.d., and an LED turns electrons falling across the gap into photons. A solar cell supplies a p.d. itself (B). A photon needs at least the band-gap energy to lift an electron (D). An LED must be <em>forward</em> biased (E).",
          },
        ],
      },
      /* ---------------------------------------------------------------- 12 */
      {
        id: "ele-12",
        style: "Context question · mains heater, peak and r.m.s. values, power",
        stem:
          "<p>An electric heater in a train carriage is connected to the <strong>230 V</strong> a.c. mains supply. The heater element is rated at <strong>2.3 kW</strong> at this r.m.s. voltage.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 230 * Math.SQRT2, sf: 3, tol: 0, unit: "V", shown: "325",
            q: "Calculate the peak voltage of the supply.",
            why: "V<sub>peak</sub> = √2 × V<sub>rms</sub> = 1.414 × 230 = <strong>325 V</strong>. The mains value quoted, 230 V, is the r.m.s. value, so the voltage actually swings up to about 325 V.",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Calculate the resistance of the heater element.",
            steps: [
              { desc: "Relationship: P = V²/R (or P = IV with V = IR)", rel: ["p=v\\^2/r", "r=v\\^2/p", "p=iv", "i=p/v", "v=ir", "r=v/i", "p=i\\^2r"] },
              { desc: "Substitution: 2300 (W) and 230 (V)", nums: [[230, 10], [2300, 2.3, 100]] },
              { desc: "Resistance 23 Ω", ans: 23, sf: 2, unit: "Ω" },
            ],
            sample: "P = V²/R\n2300 = 230²/R\nR = 23 Ω",
            model: "<ul><li>P = V²/R (or P = IV and V = IR) (1)</li><li>2300 = 230²/R, or I = 2300/230 = 10 A (1)</li><li>R = 23 Ω (1)</li></ul><p>Convert 2.3 kW to 2300 W. Use the <em>r.m.s.</em> voltage 230 V with the power rating; using the peak value 325 V gives the wrong resistance of 46 Ω.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, minWords: 10,
            q: "Explain what is meant by saying that the mains supply is <strong>230 V r.m.s.</strong>",
            points: [
              { desc: "230 V is the value of the direct (d.c.) voltage that would give the same power (heating) in the same resistor",
                all: ["d\\.?c\\.?|direct|steady|constant", near("same", "power|heat\\w*|energy", 5)] },
              { desc: "The alternating voltage is not constant: it only reaches its (larger) peak value of 325 V briefly in each cycle",
                any: [near("peak|325|maximum", "larger|greater|bigger|higher|more than|only|briefly|momentar\\w*|instant\\w*|reach\\w*|changes?|varies|varying|alternates?", 6), "peak\\W+(?:\\w+\\W+){0,5}(?:325|3\\.2|about)"],
                not: ["peak (?:value )?is the same", "same as the peak"] },
            ],
            sample: "The r.m.s. value of 230 V is the value of the direct voltage that would give the same power in the same resistor. The alternating voltage keeps changing, and only reaches its larger peak value of 325 V briefly in each cycle.",
            model: "<ul><li>The r.m.s. value is the value of the direct (d.c.) voltage that would deliver the same power (heating effect) to the same resistor (1)</li><li>The a.c. voltage varies continuously and only reaches the greater peak value (325 V) at an instant in each half cycle; or: the peak value is √2 times greater (1)</li></ul>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 1,
            q: "The same heater is connected to a supply of <strong>115 V r.m.s.</strong> Assuming that its resistance is unchanged, what is the power of the heater?",
            opts: ["288 W", "575 W", "1150 W", "2300 W", "4600 W"],
            why: "P = V²/R, so the power is proportional to V². Halving the voltage cuts the power to a <strong>quarter</strong>: 2300/4 = 575 W. Choosing 1150 W (half) treats the power as proportional to V rather than V².",
          },
        ],
      },
      /* ---------------------------------------------------------------- 13 */
      {
        id: "ele-13",
        style: "Context question · thermistor potential divider and a graph",
        stem:
          "<p>A greenhouse heater is switched by a temperature sensor. The sensor is a thermistor in series with a fixed resistor of resistance <strong>2.0 kΩ</strong>, connected to a <strong>6.0 V</strong> supply of negligible internal resistance. A voltmeter is connected across the <strong>fixed resistor</strong> and its reading is used to switch the heater. The graph shows how the resistance of the thermistor varies with temperature.</p>",
        figure: figThermistor,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 3, alts: [3000], unitAlts: ["Ω", "ohm", "ohms", "kohm", "kohms"], sf: 2, tol: 0.2, unit: "kΩ", shown: "3.0",
            q: "State the resistance of the thermistor at 40 °C.",
            why: "Read from the graph: at 40 °C the curve is at <strong>3.0 kΩ</strong>. Keep the unit in kΩ and use kΩ in later calculations.",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Calculate the voltmeter reading at 40 °C.",
            steps: [
              { desc: "Potential divider relationship, e.g. V₁ = R₁/(R₁ + R₂) × V_S, or V₁/V₂ = R₁/R₂, or V = IR",
                rel: DIVIDER },
              { desc: "Substitution: 2.0 (kΩ), 3.0 (kΩ) and 6.0 V", nums: [[2, 2000], [3, 3000, 5, 5000], 6] },
              { desc: "Voltmeter reading 2.4 V", ans: 2.4, sf: 2, unit: ["v", "volts", "volt"] },
            ],
            sample: "V_R = R/(R + R_T) × V_S\nV_R = 2.0/(2.0 + 3.0) × 6.0\nV_R = 2.4 V",
            model: "<ul><li>V<sub>1</sub> = (R<sub>1</sub>/(R<sub>1</sub> + R<sub>2</sub>)) V<sub>S</sub> (1)</li><li>2.0/(2.0 + 3.0) × 6.0 (1)</li><li>2.4 V (1)</li></ul><p>The voltmeter is across the <em>fixed</em> resistor, so the numerator is 2.0, not 3.0 (that would give the thermistor's p.d., 3.6 V). Alternative: I = 6.0/5000 = 1.2 mA, V = 1.2 mA × 2.0 kΩ = 2.4 V.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, minWords: 10,
            q: "Explain why the voltmeter reading changes as the temperature of the greenhouse rises.",
            points: [
              { desc: "As the temperature rises, the resistance of the thermistor decreases",
                all: ["thermistor|temperature|hot\\w*|warm\\w*|heat\\w*", near("resistance|r|r_t|rt", DEC + "|down", 6)] },
              { desc: "so the fixed resistor takes a larger share of the supply p.d., and the p.d. across it (the reading) increases",
                all: [near("fixed|resistor|voltmeter|reading|reads?|share|proportion|fraction|ratio", INC + "|more", 6), "share|proportion|fraction|ratio|(?:larger|bigger|greater|higher|more) (?:p\\.?d\\.?|voltage|potential)|more of|current|across|v ?= ?ir"] },
            ],
            sample: "As the temperature rises the resistance of the thermistor decreases. The thermistor then takes a smaller share of the 6.0 V, so the fixed resistor takes a larger share and the p.d. across it, which the voltmeter reads, increases.",
            model: "<ul><li>The thermistor's resistance decreases as the temperature rises (1)</li><li>The thermistor's share of the supply p.d. falls, so the p.d. across the fixed resistor (the voltmeter reading) increases, because the two p.d.s add to 6.0 V (1)</li></ul><p>At 40 °C the reading is 2.4 V; at 70 °C, where the thermistor is 1.0 kΩ, it is 4.0 V.</p>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 2,
            q: "The voltmeter is moved so that it is connected across the <strong>thermistor</strong> instead. Which row describes the reading as the temperature rises?",
            opts: [
              "It increases, because the thermistor's resistance increases.",
              "It increases, because the thermistor's resistance decreases.",
              "It decreases, because the thermistor's resistance decreases.",
              "It decreases, because the thermistor's resistance increases.",
              "It stays the same, because the supply p.d. does not change.",
            ],
            why: "The thermistor's resistance falls as it warms, so its share of the 6.0 V falls: the reading <strong>decreases</strong> (e.g. from 3.6 V at 40 °C to 2.0 V at 70 °C). Options A and B wrongly say the reading rises; D has the wrong reason (its resistance does not increase); E mixes up the supply p.d. with the share across one component.",
          },
        ],
      },
      /* ---------------------------------------------------------------- 14 */
      {
        id: "ele-14",
        style: "Experiment question · charging a capacitor through a resistor",
        stem:
          "<p>A capacitor of capacitance <strong>2000 µF</strong>, initially uncharged, is charged through a <strong>600 Ω</strong> resistor from a <strong>6.0 V</strong> supply of negligible internal resistance. The graph shows the p.d. across the capacitor against time as curve P. The experiment is repeated with a different resistor and the same capacitor, giving curve Q.</p>",
        figure: figCharge,
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 1,
            q: "Which statement about the resistor used to obtain curve Q is correct?",
            opts: [
              "It has a smaller resistance, so the current is smaller.",
              "It has a larger resistance, so the current is smaller.",
              "It has a larger resistance, so the final p.d. is smaller.",
              "It has a smaller resistance, so the final p.d. is larger.",
              "It has the same resistance, because the final p.d. is the same.",
            ],
            why: "Curve Q reaches the <em>same</em> final p.d. (6.0 V, the supply) but more slowly. A <strong>larger resistance</strong> gives a smaller charging current, so charge builds up more slowly. The resistance changes the time, not the final p.d.",
          },
          {
            label: "(b)", type: "num", marks: 1, a: 0.01, alts: [10], unitAlts: ["mA"], sf: 2, tol: 0, unit: "A", shown: "1.0 × 10⁻²",
            q: "Calculate the initial charging current for curve P.",
            why: "At the start the capacitor has no p.d., so all 6.0 V is across the resistor: I = V/R = 6.0/600 = <strong>0.010 A</strong>.",
          },
          {
            label: "(c)", type: "calc", marks: 3,
            q: "Calculate the energy stored in the capacitor when it is fully charged.",
            steps: [
              { desc: "Relationship: E = ½CV² (or ½QV)", rel: ["e[a-z_]*=\\(?" + HALF, "e[a-z_]*=q\\^?2/\\(?2c"] },
              { desc: "Substitution: ½ × 2000 × 10⁻⁶ × 6.0²", nums: [[2e-3, 2000, 0.012], [6, 36]] },
              { desc: "Energy 3.6 × 10⁻² J", ans: 0.036, sf: 2, unit: ["j", "joules", "joule"] },
            ],
            sample: "E = ½CV²\nE = ½ × 2000 × 10⁻⁶ × 6.0²\nE = 3.6 × 10⁻² J",
            model: "<ul><li>E = ½CV² (1)</li><li>E = ½ × 2000 × 10<sup>−6</sup> × 6.0<sup>2</sup> (1)</li><li>E = 3.6 × 10<sup>−2</sup> J (1)</li></ul><p>The fully charged capacitor has the supply p.d. of 6.0 V. Alternatively Q = CV = 1.2 × 10<sup>−2</sup> C and E = ½QV.</p>",
          },
          {
            label: "(d)", type: "text", marks: 3, minWords: 14, rows: 6,
            q: "The experiment is repeated with the original 600 Ω resistor but a capacitor of larger capacitance. Describe and explain the effect on (i) the initial current, (ii) the final p.d. across the capacitor, and (iii) the time taken to charge.",
            points: [
              { desc: "The initial current is unchanged, because the capacitor starts uncharged so I = V/R is the same", not: ["not\\W+(?:also\\W+)?(?:the\\W+)?(?:same|unchanged|constant)"],
                all: [near("initial|starting|start|first|beginning|\\(i\\)", "current|same|unchanged", 6), "same|unchanged|no change|not change|constant|doesn't change|does not change|unaffected|not affected|equal"] },
              { desc: "The final p.d. is unchanged: it equals the supply p.d. of 6.0 V", not: ["not\\W+(?:also\\W+)?(?:the\\W+)?(?:same|unchanged|constant)", "not\\W+(?:\\w+\\W+){0,1}equal", "(?:final|ends?)\\W+(?:\\w+\\W+){0,4}(?:p\\.?d\\.?|voltage)\\W+(?:\\w+\\W+){0,3}(?:smaller|larger|bigger|greater|higher|lower|less|increas|decreas)"],
                all: [near("final|ends?|fully charged|eventually|finally|\\(ii\\)", PD + "|same|unchanged|6", 8), "same|unchanged|no change|not change|supply|6\\.0|6 v|equal|unaffected|not affected"] },
              { desc: "It takes longer to charge, because more charge must flow to reach the same p.d. (Q = CV)", not: ["not\\W+(?:\\w+\\W+){0,1}(?:to )?flow"],
                all: ["longer|slower|more time|slowly", "more charge|larger charge|greater charge|bigger charge|more electrons|q ?= ?cv|charge"] },
            ],
            sample: "The initial current is the same, because the capacitor starts uncharged so all of the supply p.d. is across the resistor and I = V/R stays the same. The final p.d. across the capacitor is also unchanged, since it still equals the 6.0 V supply. The capacitor takes longer to charge, because more charge has to flow to reach the same p.d.",
            model: "<ul><li>The initial current is unchanged (the capacitor starts with zero p.d., so I = V/R = 0.010 A as before) (1)</li><li>The final p.d. is unchanged: it reaches the supply p.d., 6.0 V (1)</li><li>It takes longer to charge, since more charge (Q = CV) must flow to reach the same p.d., at the same starting current (1)</li></ul><p>The graph for the larger capacitor starts with the same gradient-related current but climbs more slowly towards the same 6.0 V.</p>",
          },
        ],
      },
    ],
  };
})();
