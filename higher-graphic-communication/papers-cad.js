/* Past-paper practice: Computer-aided design techniques. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HGP_BANK = window.HGP_BANK || {});

  /* ---------- small helpers for drawing dimensioned figures ---------- */
  const INK = "#1d1a14", PAPER = "#fffaf0", GREY = "#cbbd9b", CYAN = "#00a3d9", MAG = "#d4147a", AUB = "#52308a";
  const svg = (w, h, label, body) =>
    `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}"><rect width="${w}" height="${h}" fill="${PAPER}"/><g fill="none" stroke="${INK}" stroke-width="1.3">${body}</g></svg>`;
  const tx = (x, y, s, a) => `<text x="${x}" y="${y}" text-anchor="${a || "middle"}" font-size="12" fill="${INK}" stroke="none">${s}</text>`;
  const ln = (x1, y1, x2, y2, extra) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke-width="1" ${extra || ""}/>`;
  const dash = 'stroke-dasharray="5 3"';
  const cl = 'stroke-dasharray="12 3 2 3"';
  const arrow = (x, y, d) => {
    const p = { r: [[x, y], [x - 8, y - 3], [x - 8, y + 3]], l: [[x, y], [x + 8, y - 3], [x + 8, y + 3]], u: [[x, y], [x - 3, y + 8], [x + 3, y + 8]], d: [[x, y], [x - 3, y - 8], [x + 3, y - 8]] }[d];
    return `<polygon points="${p.map((q) => q.join(",")).join(" ")}" fill="${INK}" stroke="none"/>`;
  };
  const hdim = (x1, x2, y, label, ly) => ln(x1, y, x2, y) + arrow(x1, y, "l") + arrow(x2, y, "r") + tx((x1 + x2) / 2, ly == null ? y - 5 : ly, label);
  const vdim = (x, y1, y2, label, side) => {
    const s = side || -1;
    return ln(x, y1, x, y2) + arrow(x, y1, "u") + arrow(x, y2, "d") + tx(x + s * 6, (y1 + y2) / 2 + 4, label, s < 0 ? "end" : "start");
  };

  /* ---------- helpers for the marking patterns ---------- */
  const f1 = (n) => String(n);
  // "Ø n" as a diameter (after the marker folds Ø to the word diameter), or the matching radius
  const D = (n) => `(?:diameter\\s*(?:of\\s*)?${f1(n)}\\b|\\b${f1(n)}\\s*(?:mm\\s*)?(?:in\\s+)?(?:diameter|across)|\\bradius\\s*(?:of\\s*)?${f1(n / 2)}\\b|\\br\\s*${f1(n / 2)}\\b|\\b${f1(n / 2)}\\s*(?:mm\\s*)?radius|\\b${f1(n)}\\s*(?:mm\\s*)?(?:circles?|wire|rod|round|holes?|dia)\\b)`;
  const R = (n) => `(?:\\br\\s*${n}\\b|\\bradius\\s*(?:of\\s*)?${n}\\b|\\b${n}\\s*(?:mm\\s*)?radius)`;
  // a label and two numbers in one sentence, either way round (keeps a pile of unrelated numbers from scoring)
  const near = (label, a, b) => [
    `(?:${label})[^.]{0,70}(?:${a})[^.]{0,70}(?:${b})`, `(?:${label})[^.]{0,70}(?:${b})[^.]{0,70}(?:${a})`,
    `(?:${a})[^.]{0,70}(?:${b})[^.]{0,70}(?:${label})`, `(?:${b})[^.]{0,70}(?:${a})[^.]{0,70}(?:${label})`,
    `(?:${a})[^.]{0,70}(?:${label})[^.]{0,70}(?:${b})`, `(?:${b})[^.]{0,70}(?:${label})[^.]{0,70}(?:${a})`];
  // any two of three settings, in either order
  const two = (a, b, c) => {
    const o = [];
    [[a, b], [b, a], [a, c], [c, a], [b, c], [c, b]].forEach(([x, y]) => o.push(`(?:${x})[\\s\\S]*(?:${y})`));
    return o;
  };

  // size patterns that need the number right beside its word, so a shuffle of the right words cannot assemble them
  const HT = (n) => `(?:\\b${n}\\s*(?:mm\\s*)?(?:high|tall|deep|thick|long|height|up|more|extra|extrusion)\\b|\\b(?:height|high|tall|thick|up to|to|rises?|rising|reach\\w*|finish\\w*|ends?|by|extrud\\w*(?:\\s+(?:it|this|that|each|up))?|distance|depth|length)\\s*(?:at\\s*|of\\s*|=|:|is\\s*)?(?:a height of\\s*)?${n}\\b)`;
  const ST = (n) => `(?:\\b${n}\\s*(?:mm\\s*)?(?:long|high|tall|vertical|horizontal|straight|line|length|leg|up|across|along)\\b|\\b(?:vertical|horizontal|straight|line|lines|length|leg|height)\\s*(?:of\\s*|=|:|is\\s*|at\\s*)?${n}\\b)`;
  const GAP = (n) => `[^.]{0,${n}}`;

  // a comparison needs both sides, each tied to the right file: STEP with property A and 3DS with property B (or the other way round in the writing),
  // and a swapped pairing ("3DS is an accurate solid") is vetoed
  const cmp = (sa, sb, va, vb) => ({
    any: [
      `\\bstep\\b[\\s\\S]{0,80}?(?:${sa})[\\s\\S]{0,110}?\\b3ds\\b[\\s\\S]{0,80}?(?:${sb})`,
      `\\b3ds\\b[\\s\\S]{0,80}?(?:${sb})[\\s\\S]{0,110}?\\bstep\\b[\\s\\S]{0,80}?(?:${sa})`],
    not: [`\\b3ds\\b\\W+(?:\\w+\\W+){0,3}(?:${va})`, `\\bstep\\b\\W+(?:\\w+\\W+){0,3}(?:${vb})`, `(?:\\bnot|n't|\\bnever|\\bcannot|\\bno longer)\\W+(?:\\w+\\W+){0,3}(?:${sa}|${sb})`],
  });

  /* ---------- Figure 1: bollard elevation ---------- */
  const figBollard = svg(340, 236,
    "Elevation of a bollard turned about a vertical centre line, 110 high overall: a base of diameter 120 and 15 high, a neck of diameter 60 and 70 high, and a head of diameter 90 and 25 high.",
    `<g transform="translate(0 12)">` +
    `<path d="M86 184 V163 H128 V65 H107 V30 H233 V65 H212 V163 H254 V184 Z" fill="${GREY}" fill-opacity="0.45" stroke-width="2.2"/>` +
    ln(170, 14, 170, 198, `stroke-width="1" ${cl}`) +
    ln(54, 30, 105, 30) + ln(54, 65, 105, 65) + ln(54, 163, 84, 163) + ln(54, 184, 84, 184) +
    vdim(64, 30, 65, "25") + vdim(64, 65, 163, "70") + vdim(64, 163, 184, "15") +
    ln(235, 30, 298, 30) + ln(256, 184, 298, 184) + vdim(290, 30, 184, "110", 1) +
    ln(107, 26, 107, 12) + ln(233, 26, 233, 12) + hdim(107, 233, 16, "Ø90", 11) +
    ln(86, 188, 86, 214) + ln(254, 188, 254, 214) + hdim(86, 254, 210, "Ø120", 205) +
    ln(212, 112, 232, 112) + tx(236, 116, "Ø60", "start") +
    `</g>`);

  /* ---------- Figure 2: coil spring ---------- */
  const figSpring = (() => {
    let s = "";
    for (let k = 0; k < 7; k++) {
      const yl = 250 - 24 * k, yr = yl - 12;
      s += `<path d="M155 ${yl} L225 ${yr}" stroke="${INK}" stroke-width="10" stroke-linecap="round"/><path d="M155 ${yl} L225 ${yr}" stroke="${GREY}" stroke-width="6.5" stroke-linecap="round"/>`;
      if (k < 6) s += `<path d="M225 ${yr} L155 ${yl - 24}" stroke-width="1" ${dash}/>`;
    }
    s += ln(190, 52, 190, 266, `stroke-width="1" ${cl}`);
    s += ln(155, 58, 155, 98) + hdim(155, 190, 62, "22", 55);
    s += ln(229, 214, 268, 214) + ln(229, 190, 268, 190) + vdim(262, 190, 214, "pitch 15", 1);
    s += ln(234, 80, 222, 92) + tx(238, 80, "wire Ø5", "start");
    s += ln(112, 166, 148, 160) + tx(108, 170, "7 revolutions", "end");
    return svg(360, 280,
      "Elevation of a coil spring made from wire of diameter 5. The centre of the wire is 22 from the vertical axis, the pitch is 15 and the spring has 7 revolutions.", s);
  })();

  /* ---------- Figure 3: grab handle path ---------- */
  const figHandle = svg(360, 280,
    "Elevation of a bent brass handle made from round rod of diameter 12. The centre path runs 90 vertically, turns through a 90 degree bend of radius 30, then runs 70 horizontally. A section of the rod is shown at the right.",
    `<path d="M90 250 V115 A45 45 0 0 1 135 70 H240" stroke="${INK}" stroke-width="21"/>` +
    `<path d="M90 250 V115 A45 45 0 0 1 135 70 H240" stroke="${GREY}" stroke-width="18"/>` +
    `<path d="M90 250 V115 A45 45 0 0 1 135 70 H240" stroke-width="1.2" ${cl}/>` +
    ln(44, 250, 80, 250) + ln(44, 115, 80, 115) + vdim(50, 115, 250, "90") +
    ln(135, 30, 135, 62) + ln(240, 30, 240, 62) + hdim(135, 240, 36, "70", 29) +
    ln(103, 83, 62, 52) + tx(30, 50, "R30", "start") +
    `<circle cx="300" cy="190" r="9" fill="${GREY}" stroke-width="2"/>` + tx(318, 194, "Ø12", "start") + tx(250, 226, "Section of the rod", "start"));

  /* ---------- Figure 4: ventilator duct ---------- */
  const figDuct = svg(360, 268,
    "Elevation of a ventilator duct that changes from a 100 square at the bottom to a circle of diameter 40 at the top, 80 higher. The duct is hollow with walls 3 thick and open at both ends.",
    `<path d="M90 184 H270 L216 40 H144 Z" fill="${GREY}" fill-opacity="0.45" stroke-width="2.2"/>` +
    ln(180, 28, 180, 190, `stroke-width="1" ${cl}`) +
    ln(96, 184, 150, 40, `stroke-width="1" ${dash}`) + ln(264, 184, 210, 40, `stroke-width="1" ${dash}`) +
    ln(144, 36, 144, 18) + ln(216, 36, 216, 18) + hdim(144, 216, 22, "Ø40", 17) +
    ln(90, 188, 90, 220) + ln(270, 188, 270, 220) + hdim(90, 270, 216, "100 square", 210) +
    ln(218, 40, 316, 40) + ln(272, 184, 316, 184) + vdim(308, 40, 184, "80", 1) +
    tx(180, 246, "Hollow: walls 3 thick, open at both ends"));

  /* ---------- Figure 5: flange with holes on part of a circle ---------- */
  const figFlange = (() => {
    const cx = 200, cy = 128, rp = 58.5, rd = 91;
    const P = (r, a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
    const f = (v) => v.toFixed(1);
    let s = `<circle cx="${cx}" cy="${cy}" r="${rd}" fill="${GREY}" fill-opacity="0.4" stroke-width="2.2"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${rp}" stroke-width="1" ${dash}/>`;
    [-100, 100].forEach((a) => { const p = P(rd - 8, a); s += ln(cx, cy, f(p[0]), f(p[1]), `stroke-width="1" ${dash}`); });
    [-100, -50, 0, 50, 100].forEach((a) => { const p = P(rp, a); s += `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="5.5" fill="${PAPER}" stroke-width="1.8"/>`; });
    const a1 = P(30, -100), a2 = P(30, 100);
    s += `<path d="M${f(a1[0])} ${f(a1[1])} A30 30 0 1 1 ${f(a2[0])} ${f(a2[1])}" stroke-width="1.2"/>` + tx(cx, cy - 12, "200°");
    s += ln(cx - 4, cy, cx + 4, cy, "") + ln(cx, cy - 4, cx, cy + 4, "");
    const h = P(rp, 100);
    s += ln(f(h[0] + 5), f(h[1] + 3), 318, 168) + tx(320, 172, "5 holes Ø8", "start");
    const q = P(rp, 140);
    s += ln(f(q[0]), f(q[1]), 322, 206) + tx(324, 210, "PCD Ø90", "start");
    s += ln(cx - rd, cy, cx - rd, 238) + ln(cx + rd, cy, cx + rd, 238) + hdim(cx - rd, cx + rd, 234, "Ø140", 228);
    return svg(400, 248, "Plan of a flat circular flange of diameter 140 with five holes of diameter 8 on a pitch circle diameter of 90. The holes spread through a part-circle of 200 degrees, with one hole at each end of the arc.", s);
  })();

  /* ---------- Figure 6: overlapping solids ---------- */
  const figOverlap = svg(340, 190,
    "Two overlapping solids drawn as shaded outlines. Block A has a volume of 520 cubic centimetres, tool body B has a volume of 180 cubic centimetres, and the volume they share is 75 cubic centimetres.",
    `<rect x="30" y="30" width="170" height="90" fill="${CYAN}" fill-opacity="0.3" stroke-width="2"/>` +
    `<rect x="140" y="70" width="170" height="90" fill="${MAG}" fill-opacity="0.3" stroke-width="2"/>` +
    `<rect x="140" y="70" width="60" height="50" fill="${AUB}" fill-opacity="0.35" stroke-width="1" ${dash}/>` +
    tx(38, 52, "A: 520 cm³", "start") + tx(302, 152, "B: 180 cm³", "end") + tx(170, 100, "75 cm³") + tx(170, 182, "Not to scale"));

  /* ---------- Figure 7: modelling tree and plan ---------- */
  const figTree = svg(450, 200,
    "A modelling tree listing Extrude1 for a plate 100 by 60 by 12, Sketch2 for a diameter 20 circle on its top face, Extrude subtract3 through all, and Fillet4 of radius 5. Beside it is a plan of the plate with the hole and rounded corners.",
    `<rect x="8" y="14" width="236" height="160" rx="4" fill="${PAPER}" stroke-width="1.6"/>` +
    tx(18, 36, "Modelling tree", "start") + ln(18, 42, 234, 42) +
    tx(18, 66, "Extrude1 (plate 100 × 60 × 12)", "start") +
    ln(26, 72, 26, 142) + ln(26, 94, 38, 94) + ln(26, 118, 38, 118) + ln(26, 142, 38, 142) +
    tx(42, 98, "Sketch2 (Ø20 circle, top face)", "start") +
    tx(42, 122, "Extrude subtract3 (through all)", "start") +
    tx(42, 146, "Fillet4 (R5, four corners)", "start") +
    `<rect x="262" y="64" width="140" height="84" rx="7" fill="${GREY}" fill-opacity="0.45" stroke-width="2"/>` +
    `<circle cx="332" cy="106" r="14" fill="${PAPER}" stroke-width="2"/>` +
    ln(262, 60, 262, 44) + ln(402, 60, 402, 44) + hdim(262, 402, 48, "100", 43) +
    ln(406, 64, 428, 64) + ln(406, 148, 428, 148) + vdim(422, 64, 148, "60", 1) +
    tx(332, 176, "Plan of the plate"));

  /* ---------- Figure 8: pulley block section ---------- */
  const figPulley = svg(380, 226,
    "Section along the pin of a pulley block. A pin with a head on the left passes through two cheek plates and a pulley between them. The pulley sits 1.5 clear of each cheek plate.",
    `<rect x="78" y="40" width="18" height="140" fill="${GREY}" fill-opacity="0.6" stroke-width="1.8"/>` +
    `<rect x="166" y="40" width="18" height="140" fill="${GREY}" fill-opacity="0.6" stroke-width="1.8"/>` +
    `<rect x="101" y="58" width="60" height="104" fill="${CYAN}" fill-opacity="0.3" stroke-width="1.8"/>` +
    `<rect x="36" y="80" width="16" height="60" fill="${AUB}" fill-opacity="0.35" stroke-width="1.8"/>` +
    `<rect x="52" y="95" width="198" height="30" fill="${AUB}" fill-opacity="0.35" stroke-width="1.8"/>` +
    `<path d="M98.5 70 V150 M163.5 70 V150" stroke="${MAG}" stroke-width="2"/>` +
    tx(87, 32, "cheek plate") + tx(175, 32, "cheek plate") +
    tx(131, 190, "pulley") + tx(258, 108, "pin Ø10", "start") + tx(258, 124, "head on the left", "start") +
    tx(190, 216, "Magenta marks: 1.5 gap each side of the pulley"));

  /* ---------- Figure 10: rendered scene with faults ---------- */
  const figScene = svg(400, 250,
    "A rendered scene: a grey wall behind a floor. A crate stands on the floor with a soft shadow on the floor under it. A cyan bin on the left is drawn well above the floor, with a clear gap between its base and the floor and no shadow on the floor under it.",
    `<rect x="20" y="20" width="360" height="124" fill="${GREY}" fill-opacity="0.35" stroke-width="1.5"/>` +
    `<path d="M20 144 H380 L400 236 H0 Z" fill="${GREY}" fill-opacity="0.75" stroke-width="1.5"/>` +
    `<ellipse cx="310" cy="200" rx="48" ry="9" fill="${INK}" fill-opacity="0.3" stroke="none"/>` +
    `<rect x="280" y="156" width="60" height="44" fill="${AUB}" fill-opacity="0.5" stroke-width="2"/>` +
    `<path d="M158 102 H222 L216 168 H164 Z" fill="${CYAN}" fill-opacity="0.75" stroke-width="2"/>` +
    `<ellipse cx="190" cy="102" rx="32" ry="6" fill="${CYAN}" fill-opacity="0.4" stroke-width="2"/>` +
    ln(110, 200, 240, 200, `stroke-width="1" ${dash}`) + tx(100, 204, "floor", "end") +
    `<path d="M190 170 V198" stroke-width="1.2"/>` + arrow(190, 170, "u") + arrow(190, 198, "d") +
    tx(200, 188, "gap", "start") +
    tx(310, 228, "crate") + tx(190, 228, "bin") + tx(200, 12, "Rendered view of the scene"));

  /* ---------- Figure 12: signal-lamp housing ---------- */
  const figLamp = (() => {
    const cx = 200, fy = 60;
    let s = "";
    // front elevation: 90 wide x 50 high
    s += `<rect x="${cx - 85.5}" y="${fy}" width="171" height="95" fill="${GREY}" fill-opacity="0.4" stroke-width="2"/>`;
    const cyy = fy + 47.5;
    s += `<circle cx="${cx}" cy="${cyy}" r="28.5" fill="${PAPER}" stroke-width="2"/>`;
    for (let k = 0; k < 6; k++) { const a = (k * 60 * Math.PI) / 180; s += `<circle cx="${(cx + 41.8 * Math.sin(a)).toFixed(1)}" cy="${(cyy - 41.8 * Math.cos(a)).toFixed(1)}" r="3.8" fill="${PAPER}" stroke-width="1.5"/>`; }
    s += ln(cx - 50, cyy, cx + 50, cyy, `stroke-width="1" ${cl}`) + ln(cx, cyy - 50, cx, cyy + 50, `stroke-width="1" ${cl}`);
    s += ln(cx - 85.5, fy - 4, cx - 85.5, fy - 26) + ln(cx + 85.5, fy - 4, cx + 85.5, fy - 26) + hdim(cx - 85.5, cx + 85.5, fy - 20, "90", fy - 25);
    s += ln(cx + 90, fy, cx + 128, fy) + ln(cx + 90, fy + 95, cx + 128, fy + 95) + vdim(cx + 120, fy, fy + 95, "50", 1);
    s += tx(cx, fy + 118, "Ø30 opening; 6 × Ø4 holes on PCD 44");
    s += tx(cx - 85.5, 16, "Front elevation", "start");
    // plan: 90 x 60 with R5 corners, walls 3
    const py = 210;
    s += `<rect x="${cx - 85.5}" y="${py}" width="171" height="114" rx="9.5" fill="${GREY}" fill-opacity="0.4" stroke-width="2"/>`;
    s += `<rect x="${cx - 79.8}" y="${py + 5.7}" width="159.6" height="102.6" rx="4" stroke-width="1.2" ${dash}/>`;
    s += ln(cx + 90, py, cx + 128, py) + ln(cx + 90, py + 114, cx + 128, py + 114) + vdim(cx + 120, py, py + 114, "60", 1);
    s += tx(cx - 85.5, py - 10, "Plan", "start") + tx(cx, py + 132, "R5 corners; walls 3 thick; open below");
    return svg(400, 356, "Front elevation and plan of a signal-lamp housing 90 wide, 50 high and 60 deep. The front has a central opening of diameter 30 ringed by six holes of diameter 4 on a pitch circle diameter of 44. The plan shows rounded corners of radius 5 and walls 3 thick.", s);
  })();

  /* ---------- the bank ---------- */
  B.cad = {
    intro: "Computer-aided design techniques are worth 20 to 30 of the 90 marks. This bank is 73 marks: modelling features with sized steps (revolve, extrude, loft, helix, extrude along a path), edits and Booleans, 2D sketch constraints, the modelling tree, 3D constraints, file types (including a compare question), libraries and rendering. About 60% of the marks are written \"describe how to model\" answers, so check that every step you write names a plane or face, a feature and its sizes.",
    questions: [
      {
        id: "cad-01",
        style: "Modelling question · identify and describe how to model",
        stem: "<p>A bollard for the model quayside is turned (round) about its vertical middle. Its elevation is shown, with all dimensions in millimetres.</p>",
        figure: figBollard,
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "Which modelling feature is the most direct way to make the main body of the bollard?",
            opts: ["Extrude", "Loft", "Revolve", "Extrude along a path"], a: 2,
            why: "A part that is round about an axis is a revolve: draw half its cross-section against the axis and spin it. Extrude keeps one cross-section along its length, loft blends two different profiles, and a path feature needs a path." },
          { label: "(b)", type: "text", marks: 4, rows: 7,
            q: "Describe how the bollard could be modelled using 3D CAD software. Give the sizes you would use.",
            points: [
              { desc: "Sketches the half cross-section (profile) on a plane through the axis, with the axis drawn beside it", all: ["(?:sketch|draw|creat)\\w*\\W+(?:\\w+\\W+){0,6}(?:half|profile|cross.?section|outline)", "(?:axis|centre ?line|center ?line)"], win: 60 },
              { desc: "Base sized: radius 60 (Ø120) and 15 high", all: [D(120), HT(15)], win: 70 },
              { desc: "Neck sized: radius 30 (Ø60), rising to 85 (70 long)", all: [D(60), "(?:\\b85\\b|\\b70\\s*(?:mm\\s*)?(?:high|tall|long|more|extra)|(?:up to|to|height of|rises? to|reach\\w*|by|extrud\\w*)\\s*(?:a height of\\s*)?(?:85|70)\\b)"], win: 70 },
              { desc: "Head sized: radius 45 (Ø90), reaching 110 overall (25 deep)", all: [D(90), "(?:\\b110\\b|\\b25\\s*(?:mm\\s*)?(?:high|tall|deep|thick|long|more|extra)|(?:up to|to|height of|rises? to|reach\\w*|finish\\w*|by|extrud\\w*)\\s*(?:at\\s*|a height of\\s*)?(?:110|25)\\b)"], win: 70 },
              { desc: "Revolve the profile (360°) about the axis", any: ["revolv\\w*" + GAP(50) + "(?:360|(?:full|complete|whole|entire)\\s+(?:turn|revolution|circle|rotation)|(?:about|around|round|on|through)\\s+(?:the\\s+|its\\s+|that\\s+|this\\s+)?(?:axis|centre|center|centre ?line))", "(?:360|full|complete|whole)\\s*(?:°|degrees?)?\\s*(?:revolve|revolution|rotation|spin)"] },
              { desc: "Stacked-extrude route only: each circle sketched on the top face of the one below, sharing the same centre", all: ["extrud\\w*", "(?:circles?|cylinders?)", "(?:on top|top face|top of|concentric|same cent(?:re|er)|common cent(?:re|er)|centred on|centered on|centre line|center line|above)"], win: 120 },
            ],
            sample: "On the XZ plane I would sketch the half cross-section of the bollard next to a vertical axis. The base would be a rectangle with a radius of 60 and 15 high, the neck would have a radius of 30 and go up to 85, and the head would have a radius of 45 and finish at 110 overall. Then I would revolve the profile 360 degrees about the axis.",
            model: "<ul><li>Profile sketched on a plane through the axis, half the cross-section, axis shown (1)</li><li>Base radius 60 (Ø120), 15 high (1)</li><li>Neck radius 30 (Ø60) up to 85 (1)</li><li>Head radius 45 (Ø90) up to 110 overall (1)</li><li>Revolve 360° about the axis (1)</li><li>Stacked-extrude route: each circle on the top face of the one below, concentric (1)</li></ul><p>Any 4 from 6. Also acceptable: the three stacked cylinders as three extrudes (Ø120 × 15, Ø60 × 70, Ø90 × 25), each sketched on the top face of the one below and sharing its centre; one mark per sized step and one for the concentric stacking. Radius and diameter are equally acceptable (R60 = Ø120). A revolve with no axis, or with sizes missing, loses those marks: \"revolve the shape\" alone earns nothing.</p>" },
        ],
      },
      {
        id: "cad-02",
        style: "Modelling question · calculate, define and describe a helix",
        stem: "<p>A latch spring for a hatch is a coil of round wire. Its elevation is shown, with dimensions in millimetres.</p>",
        figure: figSpring,
        parts: [
          { label: "(a)", type: "num", marks: 1, unit: "mm", a: 105, tol: 0,
            q: "Calculate the length of the helix path along the axis (the distance it advances over all of its revolutions).",
            why: "Length along the axis = pitch × number of revolutions = 15 × 7 = 105 mm. The wire diameter is not added: the path is measured along the axis, between the centres of the first and last coils." },
          { label: "(b)", type: "num", marks: 1, a: 8, tol: 0,
            q: "A second spring has a pitch of 12 and an overall length of 96. How many revolutions does it have?",
            why: "Revolutions = overall length ÷ pitch = 96 ÷ 12 = 8. The three settings are linked, so any two give the third." },
          { label: "(c)", type: "mcq", marks: 1, q: "Which statement describes <em>pitch</em> correctly?",
            opts: ["The number of complete turns in the coil", "The distance the coil advances along its axis in one revolution", "The distance from the axis to the centre of the profile", "The overall height of the finished spring"], a: 1,
            why: "Pitch is a distance measured along the axis, from the centre of one coil to the centre of the next. The number of turns is the revolutions, and the overall height is the length." },
          { label: "(d)", type: "text", marks: 3, rows: 5,
            q: "Describe how the spring in the figure could be modelled using 3D CAD software.",
            points: [
              { desc: "Sketches the wire profile as a Ø5 circle with its centre 22 from the axis", all: ["(?:sketch|draw|creat|put|plac|mak|position|set)\\w*", "(?:circle|profile)", D(5), "(?:\\b22\\s*(?:mm\\s*)?(?:from|away|off|out|offset|apart|to the)|(?:offset|distance|dimension|centre|center)\\s*(?:of\\s*|=|:|is\\s*)?22\\b)"], win: 130 },
              { desc: "Uses the helix command with the profile and the axis", any: ["(?:use|using|used|apply|applying|run|running|create|creating|insert|inserting|select|choose|add|adding|make|making|with|via|activate|start|click)\\W+(?:\\w+\\W+){0,3}helix", "helix\\w*\\W+(?:\\w+\\W+){0,2}(?:command|tool|feature|function|option|icon|button)", "helix\\w*\\W+(?:\\w+\\W+){0,12}(?:profile|circle|sketch|wire)", "(?:profile|circle|wire)\\W+(?:\\w+\\W+){0,8}helix"] },
              { desc: "Gives any two of: pitch 15, 7 revolutions, overall length 105", any: two(
                "pitch\\s*(?:of|=|:|is)?\\s*15\\b|\\b15\\s*(?:mm\\s*)?pitch",
                "\\b7\\s*(?:complete\\s*|full\\s*)?(?:revolutions?|turns?|coils?|rotations?)|(?:revolutions?|turns?|coils?)\\s*(?:of|=|:|is)?\\s*7\\b",
                "(?:height|length|overall|tall|high)\\D{0,20}105\\b|\\b105\\s*(?:mm\\s*)?(?:high|tall|long|height|length|overall)") },
            ],
            sample: "I would sketch a circle of diameter 5 on a plane through the axis, with its centre 22 from the axis. Then I use the helix command, picking that profile and the axis, and enter a pitch of 15 with 7 revolutions.",
            model: "<ul><li>Ø5 circle sketched with its centre 22 from the axis (1)</li><li>Helix command using the profile and the axis (1)</li><li>Any two of pitch 15, 7 revolutions, length 105 (1)</li></ul><p>Pitch must be a distance and revolutions a count: \"pitch 7 revolutions\" or \"15 turns of pitch\" earns nothing.</p>" },
        ],
      },
      {
        id: "cad-03",
        style: "Modelling question · describe extrude along a path",
        stem: "<p>A brass grab handle for a companionway is bent from round rod. The figure shows the handle and the section of the rod. Dimensions are in millimetres.</p>",
        figure: figHandle,
        parts: [
          { label: "(a)", type: "text", marks: 4, rows: 7,
            q: "Describe how the handle could be modelled using 3D CAD software.",
            points: [
              { desc: "Sketches the path on a plane, a continuous sketch", all: ["(?:sketch|draw|creat|mak|plot)\\w*\\W+(?:\\w+\\W+){0,3}(?:path|route|spine|centre ?line|center ?line)|(?:path|route)\\W+sketch", "(?:\\bxz\\b|\\bxy\\b|\\byz\\b|plane|front)"], win: 60 },
              { desc: "Path straights dimensioned: 90 and 70", all: [ST(90), ST(70)], win: 90 },
              { desc: "Bend as an arc, radius 30, tangent to the straights", all: [R(30), "(?:arc|bend|tangent|curve|fillet|corner)"], win: 45 },
              { desc: "Work plane perpendicular to the path at its end", all: ["(?:work ?plane|\\bplane\\b)\\W+(?:\\w+\\W+){0,8}(?:perpendicular|right.?angles?|normal|square to|at 90)|(?:perpendicular|right.?angles?|normal|square)\\W+(?:\\w+\\W+){0,3}(?:work ?plane|plane)", "(?:path|route|end|line|sketch)"], win: 50 },
              { desc: "Ø12 circle profile centred on the end of the path", all: ["(?:circle|profile)", D(12), "(?:centre|center|centred|centered|end of|start of|on the path|on the route|on the end)"], win: 50 },
              { desc: "Extrude along the path (sweep)", any: ["\\bsweep", "extrude\\w*\\s+(?:it |the \\w+ |that \\w+ |this \\w+ |them |the \\w+ \\w+ )?along", "along\\s+(?:the |a |that |this )?(?:\\w+ )?(?:path|route)"] },
            ],
            sample: "First I would sketch the path on the XZ plane as one sketch: a vertical line 90, a tangent arc of radius 30 and a horizontal line 70. Then I would make a work plane perpendicular to the path at the bottom end and I would sketch a circle of diameter 12 centred on the end of the path. Finally I would extrude the circle along the path.",
            model: "<ul><li>Path sketched on a plane (1)</li><li>Straights 90 and 70 (1)</li><li>Tangent arc R30 (1)</li><li>Work plane perpendicular to the path at an end (1)</li><li>Ø12 circle centred on the end of the path (1)</li><li>Extrude along the path (sweep) (1)</li></ul><p>Any 4 from 6. Dimension every straight and every bend: a path with a missing length or radius loses those marks.</p>" },
          { label: "(b)", type: "multi", marks: 2, q: "Which <strong>two</strong> of these are modelled most simply by extrude along a path?",
            opts: ["A wheel hub, round about its centre", "A curved water pipe", "A funnel from a square top to a round spout", "A handrail that follows a curved wall", "A coil spring"], a: [1, 3],
            why: "A pipe and a handrail are one cross-section driven along a path. The hub is a revolve, the funnel is a loft between two different profiles, and the spring is a helix." },
        ],
      },
      {
        id: "cad-04",
        style: "Modelling question · describe loft and shell, then explain an order",
        stem: "<p>A ventilator duct for the powder room is a single hollow part. It changes from a square at the bottom to a round spout at the top. The figure shows its elevation, in millimetres.</p>",
        figure: figDuct,
        parts: [
          { label: "(a)", type: "text", marks: 4, rows: 7,
            q: "Describe how the duct could be modelled using 3D CAD software.",
            points: [
              { desc: "Sketches the 100 square on the base plane", all: ["(?:sketch|draw|creat)\\w*\\W+(?:\\w+\\W+){0,4}(?:square|100\\s*(?:x|by)\\s*100)|\\b100\\W+(?:\\w+\\W+){0,2}square\\W+(?:\\w+\\W+){0,2}(?:sketch|profile)", "\\b100\\b"], win: 40 },
              { desc: "Work plane parallel to the square, offset 80", all: ["(?:work ?plane|\\bplane\\b)", "(?:\\b80\\s*(?:mm\\s*)?(?:above|offset|higher|up|away|from|over|apart|high)|(?:offset|distance|height|above)\\s*(?:of\\s*|=|:|is\\s*|by\\s*)?80\\b)"], win: 50 },
              { desc: "Sketches a Ø40 circle on that plane", all: ["circle", D(40)], win: 40 },
              { desc: "Loft between the square and the circle", all: ["loft\\w*\\W+(?:\\w+\\W+){0,3}(?:between|from|through|join\\w*|connect\\w*|across|blend\\w*|to)|loft\\w*\\W+(?:\\w+\\W+){0,6}(?:square|profile|sketch)", "(?:square|profile|sketch)", "(?:circle|round|spout|profile|sketch)"], win: 60 },
              { desc: "Shell, wall thickness 3, removing the top and bottom faces", all: ["shell\\w*", "(?:(?:thickness|wall|walls)\\s*(?:of\\s*|=|:|is\\s*)?3\\b|\\b3\\s*(?:mm\\s*)?(?:thick|wall|thickness))", "(?:top and bottom|bottom and top|both (?:end|face)s?|each end|two (?:end|face)s?|open (?:at )?both|(?:end|face)s? (?:removed|open)|remov\\w*\\W+(?:\\w+\\W+){0,3}(?:top|bottom|face|end)s?)"], win: 80 },
            ],
            sample: "On the XY plane I would sketch a 100 by 100 square. I would make a work plane parallel to it and offset 80 above. On that plane I would sketch a circle of diameter 40 centred over the square. Then I would loft between the square and the circle. Last I would shell the loft with a wall thickness of 3, removing the top and bottom faces so it would be open at both ends.",
            model: "<ul><li>100 square sketched on the base plane (1)</li><li>Work plane parallel, offset 80 (1)</li><li>Ø40 circle sketched on it, centred over the square (1)</li><li>Loft between the two profiles (1)</li><li>Shell, thickness 3, top and bottom faces removed (1)</li></ul><p>Any 4 from 5.</p>" },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "A Ø6 mounting hole must also pass through one sloping side of the duct. Explain why this hole should be cut after the hollowing edit and not before it.",
            points: [
              { desc: "Cause: the shell puts a wall of the set thickness round every face, including the faces of a hole already cut", any: [
                "(?:shell|hollow)\\w*" + GAP(40) + "(?:wall|thickness|skin|tube|lining)" + GAP(25) + "\\b(?:round|around|surround\\w*|inside|in)\\s+(?:\\w+\\s+){0,3}(?:hole|opening|edge)",
                "(?:shell|hollow)\\w*" + GAP(45) + "(?:every|each|all)\\s+(?:\\w+\\s+)?(?:face|edge|surface)s?" + GAP(40) + "(?:hole|opening)",
                "(?:shell|hollow)\\w*" + GAP(25) + "(?:hole|opening)" + GAP(25) + "(?:wall|thickness|tube|lining|skin|sleeve)",
                "(?:hole|opening)" + GAP(30) + "(?:wall|thickness|tube|lining|skin|sleeve)" + GAP(25) + "(?:shell|hollow)"],
                not: ["(?:should|must|need to|needs to|better to|best to|has to)\\s+(?:be\\s+)?(?:cut|made|added|done|drilled|put)\\w*\\s+(?:it\\s+)?(?:first|before)", "(?:cut|made|done) (?:after|later)[^.]{0,30}(?:shell|hollow)\\w* (?:would |will )?(?:remove|delete|lose|ignore)"] },
              { desc: "Effect: the hole would be lined/blocked by a small tube inside the duct, not a clean hole through the wall", all: ["(?:small|little|thin|narrow|extra|separate)\\s+(?:\\w+\\s+)?(?:tube|sleeve|lining|collar)|\\b(?:tube|sleeve|collar)\\s+(?:inside|in|round|around)|(?:end(?:s|ed)? up|becomes?|turns? into|is|be|get|gets|would be|will be)\\s+(?:\\w+\\s+){0,2}(?:blocked|sealed|closed|narrowed|clogged|lined)|(?:not|isn't|wouldn't be|no longer)\\s+(?:be\\s+)?(?:a\\s+)?(?:clean|clear|open|through)|narrower|smaller\\s+hole|hole\\s+(?:is |would be |will be )?(?:smaller|narrower)|(?:forms?|forming|formed|makes?|making|creates?|creating|leaves?|leaving|gives?|giving|becomes?|into|with|by|in)\\s+(?:\\w+\\s+){0,2}(?:tube|sleeve|collar|lining)\\b|\\b(?:tube|sleeve|collar|lining)\\s+(?:that|which)\\s+(?:\\w+\\s+){0,2}(?:block|clos|seal|narrow|fill)\\w*|\\bblock(?:s|ed|ing)?\\s+(?:off\\s+)?(?:the\\s+|that\\s+|this\\s+)?(?:hole|opening)", "(?:hole|opening)"], win: 90,
                not: ["\\b(?:remove|delete|erase|ignore|lose|lost|fill|cover)[sd]?\\s+(?:the |that |your )?(?:hole|opening)", "(?:hole|opening)\\s+(?:would |will )?(?:be |get )?(?:removed|deleted|lost|erased|ignored|disappear)"] },
            ],
            sample: "If the hole were cut first, the shell would build a wall of the set thickness round the hole as well, so the hole would end up inside a little tube and blocked off, instead of being a clean opening through the thin wall.",
            model: "<ul><li>Cause: shell keeps a wall of the set thickness around every face, including the sides of an existing hole (1)</li><li>Effect: the hole becomes a small tube/lining on the inside, narrowed or blocked, instead of a clean hole through the thin wall (1)</li></ul><p>The effect alone (\"the hole goes wrong\") earns at most one mark: an explain answer needs the cause.</p>" },
        ],
      },
      {
        id: "cad-05",
        style: "Calculation and short description · radial array",
        stem: "<p>A ship's wheel flange is a flat disc with holes for fixing bolts. A plan is shown, with dimensions in millimetres.</p>",
        figure: figFlange,
        parts: [
          { label: "(a)", type: "num", marks: 1, unit: "°", a: 50, tol: 0,
            q: "The five holes lie through a part-circle of 200°, with a hole at each end of the arc and equal spacing. Calculate the angle between neighbouring holes.",
            why: "Five holes with one at each end make four gaps: 200 ÷ 4 = 50°. Dividing by 5 treats the arc like a full circle." },
          { label: "(b)", type: "num", marks: 1, unit: "°", a: 40, tol: 0,
            q: "A second flange has nine holes equally spaced round a full circle. Calculate the angle between neighbouring holes.",
            why: "Round a full circle the last hole would land on the first, so there are as many gaps as holes: 360 ÷ 9 = 40°." },
          { label: "(c)", type: "text", marks: 2, rows: 4,
            q: "The designer is told not to use a radial array. Describe how the five holes could be positioned and cut instead.",
            points: [
              { desc: "Sketches the Ø8 circles with their centres on the 90 PCD (45 from the centre)", all: ["(?:circle|hole)", D(8), "\\b(?:90|45)\\b(?!\\s*(?:°|degrees?))"], win: 60 },
              { desc: "Gives the angle between neighbouring holes as 50°", any: ["\\b50\\s*(?:°|degrees?)", "(?:angle|spacing)\\s+(?:of\\s+|between\\s+(?:\\w+\\s+){1,3}(?:is|as|of)\\s+)?50\\b", "\\b50\\s+(?:apart|between|each)"] },
              { desc: "Extrude subtract (cut) the circles through the disc", all: ["(?:extrud\\w*\\s+(?:a\\s+)?(?:subtract|cut)|cut\\W+extrud|\\bcut\\b" + GAP(20) + "through|subtract\\w*\\W+(?:\\w+\\W+){0,3}(?:circles?|holes?))", "(?:disc|flange|plate|through)"], win: 50 },
            ],
            sample: "I would sketch five circles of diameter 8, each with its centre on the pitch circle of diameter 90, and give the angle between neighbouring holes as 50 degrees. Then I would extrude subtract the circles through the flange.",
            model: "<ul><li>Ø8 circles with centres on the PCD Ø90 (45 from the centre) (1)</li><li>50° between neighbouring holes, set by dimension (1)</li><li>Extrude subtract through the disc (1)</li></ul><p>Any 2 from 3. If a question says \"do not use radial array\", the angle between copies must be given.</p>" },
        ],
      },
      {
        id: "cad-06",
        style: "Short question set · match edits and calculate Booleans",
        stem: "<p>A model maker combines solids and edits them. Two overlapping solids are shown: block A and tool body B.</p>",
        figure: figOverlap,
        parts: [
          { label: "(a)", type: "match", marks: 4, q: "Match each modelling term to what it does.",
            pairs: [
              ["Shell", "Hollows a solid to an even wall thickness, removing chosen faces"],
              ["Irregular fillet", "Rounds an edge with a radius that varies along it"],
              ["Mirror", "Copies features across a plane to make a symmetrical part"],
              ["Intersect", "Keeps only the volume that two overlapping solids share"],
            ] },
          { label: "(b)", type: "num", marks: 1, unit: "cm³", a: 625, tol: 0,
            q: "The two solids are joined with an add (union) operation. Calculate the volume of the result.",
            why: "Add = A + B − overlap = 520 + 180 − 75 = 625 cm³. The shared volume is only counted once." },
          { label: "(c)", type: "num", marks: 1, unit: "cm³", a: 445, tol: 0,
            q: "B is now subtracted from A. Calculate the volume that is left.",
            why: "Subtract removes only the part of A that B overlaps: 520 − 75 = 445 cm³. The 105 cm³ of B outside A is not part of A, so none of it is taken from A." },
        ],
      },
      {
        id: "cad-07",
        style: "Scenario question · edit through the modelling tree, explain and identify",
        stem: "<p>A mounting plate for a cleat has been modelled. Its modelling tree and a plan view are shown, with dimensions in millimetres. A production drawing was made from the model last week.</p>",
        figure: figTree,
        parts: [
          { label: "(a)", type: "text", marks: 2, rows: 4,
            q: "The hole must now be Ø25 instead of Ø20. Describe how this would be done on the existing model.",
            points: [
              { desc: "Goes into the modelling tree and selects the hole's sketch (or feature)", any: [
                "(?:modelling|model|feature|browser|history|design|part)?\\s*tree" + GAP(50) + "(?:select|click|open|find|choose|locate|pick|double|edit|go to|expand)\\w*" + GAP(40) + "(?:sketch|feature|extrude|circle|hole)",
                "(?:select|click|open|find|choose|locate|pick|double|edit|go to|expand)\\w*" + GAP(50) + "(?:sketch|feature|circle|hole|extrude)" + GAP(40) + "(?:in|from|on|using|through|via)\\s+(?:the\\s+|your\\s+)?(?:\\w+\\s+){0,2}(?:tree|browser|history)"] },
              { desc: "Changes the diameter to 25 (the model rebuilds)", any: ["(?:change|edit|alter|amend|modify|update|set|resize|enter|type|increase|replace|make|turn|put|adjust|enlarge)\\w*" + GAP(45) + "\\b25\\b", "(?:diameter|dimension|size)\\s*(?:to|=|:|from 20 to|becomes?)\\s*25\\b"] },
            ],
            sample: "In the modelling tree I would select the sketch of the hole, then I would edit the circle and change its diameter from 20 to 25. The plate should then rebuild with the bigger hole.",
            model: "<ul><li>Select the hole's sketch/feature in the modelling tree (1)</li><li>Change the diameter to 25 and the model rebuilds (1)</li></ul><p>Remodelling the plate from scratch is not what the question asks for and earns no marks: the point of a parametric model is that you edit it, not rebuild it.</p>" },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Explain why the production drawing made earlier from this model shows the larger hole too.",
            points: [
              { desc: "Cause: the drawing is associative (linked to the model file, not a separate copy)", any: ["\\bassociati(?:ve|vity)\\b", "(?:linked|connected|attached|tied|joined)\\s+(?:\\w+\\s+){0,2}(?:to|with)\\s+(?:\\w+\\s+){0,2}(?:model|file|3d|it\\b)", "live\\s+link", "(?:generated|created|produced|taken|made)\\s+(?:directly\\s+)?from\\s+(?:the\\s+)?(?:3d\\s+)?model\\W+(?:\\w+\\W+){0,6}(?:stay|remain|keep|connected|linked)", "not\\s+(?:just\\s+)?(?:a\\s+)?(?:separate|copy|copies)", "(?:is|are)\\s+(?:a\\s+)?references?\\s+(?:to|of)", "(?:depends?|dependent)\\s+on\\s+(?:the\\s+)?model", "same (?:model )?file"],
                not: ["not\\s+associative", "isn't\\s+associative", "non.?associative", "(?:is|are)\\s+a\\s+(?:separate\\s+)?copy", "(?:\\bnot|n't|\\bno|\\bnever|\\bun)\\s*(?:\\w+\\s+){0,2}(?:linked?|links?|connect\\w*|associat\\w*|attached|tied)\\b", "(?:drawing|views?)\\s+(?:is|are|was|were|gets?|has been|have been)\\s+(?:changed|edited|altered|modified|updated|amended)", "(?:when|if|once|after)\\s+(?:the\\s+|a\\s+)?(?:drawing|views?)\\s+(?:is\\s+|are\\s+)?(?:chang|edit|alter|modif|updat|amend)\\w*"] },
              { desc: "Effect: the views and dimensions update/rebuild automatically, without being redrawn", negOK: true, any: ["(?:update|rebuild|regenerat|redraw|recalculat|refresh|reflect|follow|chang|adjust|alter)\\w*\\W+(?:\\w+\\W+){0,4}(?:automatic\\w*|without|instantly|straight away|itself|at once|by itself|by themselves|themselves|on their own|on its own|all by)", "(?:automatic\\w*|instantly|straight away)\\W+(?:\\w+\\W+){0,2}(?:update|rebuild|regenerat|redraw|recalculat|refresh|reflect|follow|chang)", "(?:drawing|views?)\\W+(?:\\w+\\W+){0,2}(?:follows?|updates?|changes?|reflects?)\\W+(?:\\w+\\W+){0,3}(?:it|the model|the change)\\b(?:\\W+(?:\\w+\\W+){0,3}(?:straight away|at once|immediately|automatic\\w*))?"],
                not: ["(?:\\bnot|n't|\\bnever|no longer)\\s+(?:\\w+\\s+){0,2}(?:update|rebuild|regenerat|chang|refresh|reflect|follow)\\w*", "(?:\\bno|\\bnever|without any)\\s+(?:\\w+\\s+){0,1}(?:update|change|link)\\w*", "\\b(?:nothing|none)\\s+(?:\\w+\\s+){0,2}(?:updat|chang|rebuil|regenerat|refresh)\\w*", "(?:when|if|once|after)\\s+(?:the\\s+|a\\s+)?(?:drawing|views?)\\s+(?:is\\s+|are\\s+|gets\\s+)?(?:chang|edit|alter|modif|updat|amend)\\w*", "model\\s+(?:also\\s+|then\\s+)?(?:updates?|changes?|rebuilds?|follows?)\\s+(?:itself|automatic\\w*|too|as well)", "(?:drawing|views?)\\s+(?:updates?|changes?|edits?|alters?|drives?|controls?)\\s+(?:the\\s+)?model"] },
            ],
            sample: "The drawing is associative, which means it is linked to the model file instead of being a separate copy. So when the model is changed, the drawing updates automatically without anyone having to redraw it.",
            model: "<ul><li>Cause: the drawing is associative, linked to the model file rather than a copy (1)</li><li>Effect: its views and dimensions update automatically when the model changes (1)</li></ul><p>\"The drawing updates\" alone is only the effect: it earns one mark at most.</p>" },
          { label: "(c)", type: "mcq", marks: 1, q: "What would suppressing Extrude subtract3 do?",
            opts: ["Delete the hole from the tree for good", "Turn the hole into a Ø25 hole", "Remove the fillets from the corners only", "Rebuild the plate without the hole, and let it be switched back on later"], a: 3,
            why: "Suppress switches a feature off temporarily: the model rebuilds without it, and it stays in the tree to be unsuppressed. Deleting removes it for good." },
        ],
      },
      {
        id: "cad-08",
        style: "Scenario question · describe 3D constraints and match terms",
        stem: "<p>A pulley block has two cheek plates, each with a hole for the pin. The pulley, which also has a central hole, sits between them, and the pin has a head. The pulley must run freely, with a 1.5 clearance from each cheek plate. The cheek plates are already in position in the assembly.</p>",
        figure: figPulley,
        parts: [
          { label: "(a)", type: "text", marks: 3, rows: 6,
            q: "Describe the 3D constraints needed to position the pin and the pulley. Name the features each constraint joins.",
            points: [
              { desc: "Centre axis: the pin with the holes in the cheek plates", all: ["(?:cent(?:re|er)[ -]?axis|co-?axial|concentric)", "pin", "(?:hole|cheek|plate)"], win: 60 },
              { desc: "Centre axis: the pulley's hole with the pin", all: ["(?:cent(?:re|er)[ -]?axis|co-?axial|concentric)", "pulley", "(?:hole|pin|bore)"], win: 60 },
              { desc: "Offset of 1.5 between the face of the pulley and the face of a cheek plate", all: ["offset\\w*" + GAP(80) + "1\\.5|1\\.5\\s*(?:mm\\s*)?offset|offset\\w*" + GAP(40) + "(?:gap|clearance)", "(?:pulley|cheek|face|plate)"], win: 90 },
              { desc: "Mate the underside of the pin's head with the outer face of a cheek plate", all: ["(?:mate[ds]?|align\\w*|flush)\\W+(?:\\w+\\W+){0,6}head|head\\W+(?:\\w+\\W+){0,6}(?:mate[ds]?|align\\w*|flush)", "(?:cheek|plate|outer|outside)"], win: 70 },
            ],
            sample: "I would centre axis the pin with the holes in both cheek plates. I would centre axis the hole in the pulley with the pin. Then I would offset the face of the pulley from the face of the cheek plate by 1.5, to give the clearance. Last, I would mate the underside of the pin's head with the outside face of the cheek plate.",
            model: "<ul><li>Centre axis: pin with the cheek-plate holes (1)</li><li>Centre axis: pulley hole with the pin (1)</li><li>Offset 1.5: pulley face to cheek-plate face (1)</li><li>Mate: pin head to the outer face of a cheek plate (1)</li></ul><p>Any 3 from 4. Name the constraint, then the two features it joins, then any distance or angle.</p>" },
          { label: "(b)", type: "match", marks: 3, q: "Match each 3D constraint to what it does.",
            pairs: [
              ["Align (flush)", "Makes two faces lie in the same plane, facing the same way"],
              ["Orientate", "Fixes a stated angle between faces or edges of two parts"],
              ["Tangent", "Keeps a curved face touching another face without cutting into it"],
            ] },
        ],
      },
      {
        id: "cad-09",
        style: "Scenario question · match file types and explain",
        stem: "<p>A shipyard exchanges its CAD models with other firms and machines.</p>",
        parts: [
          { label: "(a)", type: "match", marks: 3, q: "Match each job to the file type that suits it best.",
            pairs: [
              ["A 2D pennant outline is sent to a laser cutter", "DXF"],
              ["A winch model is sent to a supplier who uses a different CAD package", "STEP"],
              ["A figurehead mesh with materials and textures goes to an animation studio", "3DS"],
            ] },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Explain why the winch model is sent as a STEP file rather than in the shipyard's own native format.",
            points: [
              { desc: "Cause: STEP is a neutral/common format that any (most) CAD package can open", any: [
                "(?:neutral|universal|international|standard|generic|open)\\W+(?:\\w+\\W+){0,3}(?:format|file|type)",
                "(?:neutral|common|universal|international|standard|generic|open)\\W+(?:\\w+\\W+){0,3}(?:format|file|type)" + GAP(70) + "(?:any|all|every|most|many|different|other|various|whichever|whatever|several|lots of|a range of)",
                "(?:open|read|import|use|support|work|run)\\w*\\W+(?:\\w+\\W+){0,4}(?:any|all|every|most|many|different|other|various|whichever|whatever)\\W+(?:\\w+\\W+){0,2}(?:cad|package|software|program|system|application)",
                "(?:any|all|every|most|many|different|other|various|whichever|whatever)\\W+(?:\\w+\\W+){0,2}(?:cad\\W+)?(?:package|software|program|system|application)s?\\W+(?:\\w+\\W+){0,6}(?:open|read|import|use|support|work)",
                "(?:neutral|common|universal|international|standard|generic)\\W+(?:\\w+\\W+){0,3}(?:format|file|type)\\W+(?:\\w+\\W+){0,6}(?:open|read|import|use|support)\\w*\\W+(?:\\w+\\W+){0,4}(?:by|in|with|on)\\W+(?:\\w+\\W+){0,2}(?:cad|package|software|program|system|application)s?"],
                not: ["(?:native|own|shipyard's)\\W+(?:\\w+\\W+){0,4}(?:is|are|as)\\W+(?:\\w+\\W+){0,2}(?:neutral|common|universal|standard|open)\\b", "\\bstep\\W+(?:\\w+\\W+){0,3}(?:only|just)\\W+(?:\\w+\\W+){0,3}(?:shipyard|own|native|same)", "\\bstep\\W+(?:\\w+\\W+){0,2}(?:is|are)\\W+(?:\\w+\\W+){0,1}(?:mesh|polygon)", "\\bstep\\W+(?:\\w+\\W+){0,2}(?:is|are)\\W+not\\W+(?:\\w+\\W+){0,1}(?:needed|necessary|required)"] },
              { desc: "Effect: the supplier can open and use the model in their own (different) software", any: [
                "(?:open|use|read|import|view|work with|access|edit|load)\\w*" + GAP(45) + "(?:different|other|own|another|whichever|whatever|their|any)\\W+(?:\\w+\\W+){0,2}(?:package|software|program|system|application)",
                "(?:different|other|own|another|their|whichever|whatever|any)\\W+(?:\\w+\\W+){0,2}(?:package|software|program|system|application)" + GAP(60) + "(?:open|use|read|import|view|work|access)",
                "(?:supplier|firm|company|manufacturer)\\W+(?:\\w+\\W+){0,3}(?:can|could|will be able to|is able to|are able to|able to)\\W+(?:\\w+\\W+){0,3}(?:open|read|import|view|load)"],
                not: ["(?:supplier|firm|company|manufacturer)\\W+(?:\\w+\\W+){0,2}(?:cannot|can't|can not|unable|couldn't|won't be able|will not be able)", "(?:native|own|shipyard's)\\W+(?:\\w+\\W+){0,4}(?:is|are|as)\\W+(?:\\w+\\W+){0,2}(?:neutral|common|universal|standard|open)\\b", "\\bstep\\W+(?:\\w+\\W+){0,3}(?:only|just)\\W+(?:\\w+\\W+){0,3}(?:shipyard|own|native|same)", "\\bstep\\W+(?:\\w+\\W+){0,2}(?:is|are)\\W+(?:\\w+\\W+){0,1}(?:mesh|polygon)"] },
            ],
            sample: "STEP is a neutral format that most CAD packages can import, so the supplier would be able to open and use the winch model in their own software even though it is different from the one the shipyard uses.",
            model: "<ul><li>Cause: STEP is a neutral (common) format that any CAD package can open (1)</li><li>Effect: so the supplier can open and use the model in a different package from the shipyard's (1)</li></ul><p>\"It is a common format\" is thin: better to say that any package can open it. \"Neutral\", \"universal\" or \"standard\" file type is accepted for the cause. The price of a neutral file is that the modelling tree is normally lost.</p>" },
        ],
      },
      {
        id: "cad-10",
        style: "Scenario question · identify faults and describe rendering techniques",
        stem: "<p>An apprentice has rendered a scene of the quayside store from a model of a bin and a model of a crate. The render is shown.</p>",
        figure: figScene,
        parts: [
          { label: "(a)", type: "multi", marks: 2, q: "Two faults in the scene can be seen in the render. Choose <strong>two</strong>.",
            opts: ["The scene has no floor", "The bin is floating above the floor", "The bin is sunk into the floor", "The crate is floating above the floor", "No shadow is cast under the bin, although the crate has one"], a: [1, 4],
            why: "Models must rest on a surface, and a shadow is what tells the eye that they do. The bin hangs above the floor with no shadow, while the crate sits on the floor with a soft shadow under it." },
          { label: "(b)", type: "text", marks: 2, rows: 5,
            q: "Describe two rendering techniques that would make the bin look more realistic.",
            points: [
              { desc: "Light source: placed above and to one side, giving highlights on the bin and shade on its far side", any: [
                "(?:\\b|spot|flood)(?:lights?|lighting|lamp)(?:\\s+sources?)?\\s+(?:\\w+\\s+){0,4}(?:above|beside|side|top|left|right|angle|direction|position|placed|from)",
                "(?:place|position|put|move|angle|set|add|use|include|apply|need|fit)\\w*\\W+(?:\\w+\\W+){0,4}(?:\\b|spot|flood)(?:lights?|lamps?|lighting)\\b",
                "(?:\\b|spot|flood)light\\w*\\W+(?:\\w+\\W+){0,8}(?:highlights?|shad(?:e|ing|ows?))"], not: ["(?:remov|delet|without|turn(?:ing)? off|switch(?:ing)? off|get(?:ting)? rid of|\\bno|\\bnot|disable)\\w*\\W+(?:\\w+\\W+){0,3}(?:lights?|lighting|shadows?|lamps?|materials?|textures?|reflect\\w*|environment)"] },
              { desc: "Materials: giving the bin a plastic or metal finish (colour, shine or texture)", any: [
                "material\\w*\\W+(?:\\w+\\W+){0,2}(?:plastic|metal|steel|colou?r|shin\\w*|glossy|matt|texture|rough|paint|finish)",
                "(?:plastic|metal|steel|glossy|matt|rubber|shiny)\\s+(?:\\w+\\s+)?material",
                "(?:give|apply|add|assign|use|set)\\w*\\W+(?:\\w+\\W+){0,2}(?:material|texture|colou?r|finish)"], not: ["(?:remov|delet|without|turn(?:ing)? off|switch(?:ing)? off|get(?:ting)? rid of|\\bno|\\bnot|disable)\\w*\\W+(?:\\w+\\W+){0,3}(?:lights?|lighting|shadows?|lamps?|materials?|textures?|reflect\\w*|environment)"] },
              { desc: "Reflections: the shiny bin mirrors the floor and walls around it", any: [
                "reflect\\w*" + GAP(50) + "(?:floor|wall|surround|surface|environment|mirror|shin|metal|scene)",
                "(?:shin\\w*|metal|glossy|polished)" + GAP(40) + "reflect"], not: ["(?:remov|delet|without|turn(?:ing)? off|switch(?:ing)? off|get(?:ting)? rid of|\\bno|\\bnot|disable)\\w*\\W+(?:\\w+\\W+){0,3}(?:lights?|lighting|shadows?|lamps?|materials?|textures?|reflect\\w*|environment)"] },
              { desc: "Shade/shadow: a cast shadow on the floor under the bin showing it rests there", any: [
                "cast\\w*\\W+(?:a\\W+)?shadow", "shadow\\w*" + GAP(30) + "(?:floor|ground|under|beneath)", "(?:floor|ground|under|beneath)" + GAP(30) + "shadow"], not: ["(?:remov|delet|without|turn(?:ing)? off|switch(?:ing)? off|get(?:ting)? rid of|\\bno|\\bnot|disable)\\w*\\W+(?:\\w+\\W+){0,3}(?:lights?|lighting|shadows?|lamps?|materials?|textures?|reflect\\w*|environment)"] },
              { desc: "Sited environment: a setting such as a room or quayside around the bin", any: [
                "(?:environment|setting|room|background|surroundings|context)" + GAP(40) + "(?:place|put|add|surround|inside|within|around)",
                "(?:place|put|add|surround|inside|within|around)\\w*" + GAP(40) + "(?:environment|setting|room|background|surroundings|context)"] },
            ],
            sample: "A light source should be placed above and to one side of the bin, so that it has a bright highlight on top and shade on the far side. The bin can also be given a plastic material with a colour and a little shine, so it looks like a real bin instead of a flat shape.",
            model: "<ul><li>Light source, placed to give highlights and shade on the bin (1)</li><li>Materials, e.g. glossy green plastic or galvanised steel (1)</li><li>Reflections of the floor and walls in a shiny surface (1)</li><li>A cast shadow on the floor (1)</li><li>A sited environment round the bin (1)</li></ul><p>Any 2. A bare word such as \"lighting\" or \"materials\" earns nothing: say what it does to the bin.</p>" },
          { label: "(c)", type: "mcq", marks: 1, q: "The apprentice's final render has jagged, blocky edges on the bin's outline. What should be done?",
            opts: ["Raise the image resolution", "Add more render samples to reduce grain", "Apply a decal to the bin", "Switch to a neutral file format"], a: 0,
            why: "Blocky, jagged edges are pixelation: the resolution is too low for the page size. Speckles in soft shadows are grain, which needs more samples." },
        ],
      },
      {
        id: "cad-11",
        style: "Scenario question · identify and describe benefits of CAD",
        stem: "<p>A yacht designer who has always drawn on paper is moving to 3D solid modelling for a new racing yacht.</p>",
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "Which task would be done best in 2D CAD rather than 3D?",
            opts: ["Checking two parts for interference", "Drawing a flat outline for a laser cutter", "Generating a rendered image", "Calculating the volume of a part"], a: 1,
            why: "A flat outline is 2D geometry (lines, arcs, circles), as sent to a laser cutter in a DXF file. Interference checks, volumes and renders need a 3D solid." },
          { label: "(b)", type: "text", marks: 2, rows: 5,
            q: "Describe two advantages to the designer of producing the yacht in 3D CAD instead of drawing every view by hand.",
            points: [
              { desc: "Editing one dimension rebuilds the model and updates the drawings automatically", any: [
                "(?:chang|edit|alter|amend|modify|adjust|resiz|updat)\\w*" + GAP(40) + "(?:dimension|size|value|model|design|hull)" + GAP(90) + "(?:automatic|quick|fast|instant|straight away|rebuild|update|without (?:re)?draw|saves? time)",
                "(?:chang(?:e|es|ing)|edit(?:s|ing)?|modifications?|alterations?)\\W+(?:\\w+\\W+){0,4}(?:quick\\w*|fast\\w*|easil\\w*|automatic\\w*|instant\\w*)"] },
              { desc: "Many views (orthographic, sectional, pictorial, renders) come from one model", any: [
                "(?:one|single|same)\\W+(?:3d\\W+)?model\\W+(?:\\w+\\W+){0,8}(?:views?|drawings?|sections?|renders?|pictorials?)",
                "(?:views?|drawings?|sections?|renders?|pictorials?)\\W+(?:\\w+\\W+){0,8}(?:from|of|made from|taken from|produced from|generated from)\\W+(?:\\w+\\W+){0,3}(?:one|single|same|the)\\W+(?:3d\\W+)?model"] },
              { desc: "Parts can be checked for fit or interference before anything is built", any: [
                "(?:fit|interfer\\w*|clash\\w*|collision|overlap|check\\w*|test\\w*)\\W+(?:\\w+\\W+){0,8}(?:before|prior to|without)\\W+(?:\\w+\\W+){0,3}(?:built|made|mak(?:e|ing)|manufactur\\w*|build\\w*|cut|construct\\w*|prototype\\w*|physical|produc\\w*|creat\\w*)"] },
              { desc: "Files can be shared at once or sent straight to CNC machines or 3D printers", any: [
                "(?:share|send|sent|email|cloud|transfer|export)\\w*" + GAP(40) + "(?:instant\\w*|quick\\w*|easil\\w*|immediate\\w*|straight away|anywhere)",
                "(?:send|sent|export|output|feed|transfer)\\w*" + GAP(40) + "(?:cnc|3d print\\w*|laser|machine)"] },
              { desc: "Dimensions are accurate to a fraction of a millimetre and can be measured from the model", any: [
                "accura\\w*" + GAP(40) + "(?:millimet\\w*|fraction|\\bmm\\b|exact|measure)", "(?:millimet\\w*|fraction of a|measure\\w*)" + GAP(40) + "accura\\w*"] },
            ],
            sample: "If the client wants the hull wider, the designer only has to change one dimension and the model and all the drawings rebuild automatically. The parts can also be checked for fit and interference before anything is built, so mistakes are found early.",
            model: "<ul><li>Quick edits: change a dimension and the model and drawings update automatically (1)</li><li>Views and renders all come from one model (1)</li><li>Fit and interference checked before building (1)</li><li>Files shared instantly / sent to CNC or 3D printers (1)</li><li>Accurate to fractions of a millimetre (1)</li></ul><p>Any 2, each developed for the designer. \"It is faster\" alone earns nothing.</p>" },
          { label: "(c)", type: "multi", marks: 2, q: "The designer will use a CAD library. Which <strong>two</strong> statements describe what a CAD library does?",
            opts: ["Converts a 3D model into a flat laser-cutting file", "Provides ready-made standard parts such as nuts, bolts and bearings", "Renders the model with lights and shadows", "Keeps every designer using the same accurate standard parts", "Removes the need to dimension any sketch"], a: [1, 3],
            why: "A library supplies ready-made parts modelled to standard sizes, which saves time and keeps every assembly consistent. Conversion and rendering are separate jobs, and sketches still need dimensions." },
        ],
      },
      {
        id: "cad-12",
        style: "Extended modelling question · describe how to model",
        stem: "<p>A signal-lamp housing for the quarterdeck is a hollow box with rounded vertical corners, open at the bottom. Its front face has a circular opening for the lens, ringed by six small vent holes. A front elevation and a plan are shown, with dimensions in millimetres.</p>",
        figure: figLamp,
        parts: [
          { label: "(a)", type: "text", marks: 6, rows: 10,
            q: "Describe how the housing could be modelled using 3D CAD software. Give the sizes you would use at each step.",
            points: [
              { desc: "Sketches the 90 × 60 rectangle on the base plane and extrudes it 50", all: ["\\b90\\b\\W+(?:\\w+\\W+){0,5}\\b60\\b|\\b60\\b\\W+(?:\\w+\\W+){0,5}\\b90\\b", "extrud\\w*\\W+(?:\\w+\\W+){0,5}\\b50\\b|\\b50\\b\\W+(?:\\w+\\W+){0,4}extrud|(?:height|depth|high|tall|up)\\W+(?:of\\W+|to\\W+)?50\\b"], win: 120 },
              { desc: "Fillet of radius 5 on the four vertical edges (before the shell)", all: ["fillet|round(?:ed|ing)? (?:off )?(?:the )?(?:\\w+ )?(?:vertical|corner|edge)", "(?:" + R(5) + "|\\b5\\s*(?:mm\\s*)?fillets?\\b|fillets?\\s*(?:of\\s*|=|:)?5\\b)"], win: 60 },
              { desc: "Shell, thickness 3, removing the bottom face", all: ["shell\\w*", "(?:(?:thickness|wall|walls)\\s*(?:of\\s*|=|:|is\\s*)?3\\b|\\b3\\s*(?:mm\\s*)?(?:thick|wall|thickness))", "(?:bottom|underside|base|lower|open)"], win: 70 },
              { desc: "Sketches a Ø30 circle centred on the front face", all: ["(?:circle|opening|hole)", D(30), "(?:front|face)"], win: 60 },
              { desc: "Sketches one Ø4 circle on the PCD of 44 round the opening", all: ["(?:circle|hole)", D(4), "\\b(?:44|22)\\b"], win: 60 },
              { desc: "Radial array of the small circle: six instances, 60° apart, about the opening's axis", all: ["(?:radial|circular|polar|rotational)\\W+(?:\\w+\\W+){0,3}(?:array|pattern)|(?:array|pattern)\\w*\\W+(?:\\w+\\W+){0,3}(?:radial|circular|polar)|\\b60\\s*(?:°|degrees?)\\W+(?:\\w+\\W+){0,3}(?:apart|between|spacing|intervals?|each)|(?:angle|spacing)\\W+(?:\\w+\\W+){0,3}60", "\\b(?:6|six)\\b"], win: 80 },
              { desc: "Extrude subtract (cut) the circles through the front wall", all: ["(?:extrud\\w*\\W+(?:\\w+\\W+){0,2}(?:subtract|cut)|(?:cut|subtract)\\W*extrud\\w*|(?:cut|subtract)\\w*\\W+(?:\\w+\\W+){0,5}through|through all)", "(?:wall|front|circles?|holes?|openings?)"], win: 60 },
            ],
            sample: "On the XY plane I would sketch a 90 by 60 rectangle and extrude it 50. I would add a fillet of radius 5 to the four vertical edges. Then I would shell it with a wall thickness of 3, removing the bottom face. On the front face I would sketch a circle of diameter 30 in the centre, and a circle of diameter 4 on a PCD of 44 round it. I would radial array the small circle six times, 60 degrees apart, about the centre of the opening. Then I would extrude subtract all the circles through the front wall.",
            model: "<ul><li>90 × 60 rectangle on the base plane, extruded 50 (1)</li><li>Fillet R5 on the four vertical edges (1)</li><li>Shell, thickness 3, removing the bottom face (1)</li><li>Ø30 circle centred on the front face (1)</li><li>Ø4 circle on the PCD 44 (1)</li><li>Radial array: 6 instances, 60° apart, about the opening's axis (1)</li><li>Extrude subtract the circles through the wall (1)</li></ul><p>Any 6 from 7. Shell before the holes, or the shell builds a tube round each one. If a radial array is not used, the angle between holes (60°) must be given. A step with a command but no plane, face or size loses its mark.</p>" },
        ],
      },
      {
        id: "cad-13",
        style: "Scenario question · compare two file types",
        stem: "<p>The shipyard's designer has a finished model of a figurehead. One copy goes to a partner firm that will check its exact dimensions, and another goes to a film company making a documentary about the yard.</p>",
        parts: [
          { label: "(a)", type: "text", marks: 3, rows: 7,
            q: "Compare a STEP file and a 3DS file of the figurehead.",
            points: [
              { desc: "Geometry: STEP holds an accurate solid, whereas 3DS is a polygon mesh of small flat facets", ...cmp("solids?|accurate|precise|exact|true|real", "mesh\\w*|polygons?|facets?|triangles?|flat faces?", "solids?|exact|precise", "mesh\\w*|polygons?|facets?|triangles?") },
              { desc: "Purpose: STEP is for engineering and exchange between CAD packages, whereas 3DS is for rendering, animation and games", ...cmp("engineer\\w*|exchang\\w*|manufactur\\w*|supplier|any cad|other cad|different cad|cad|neutral|shar\\w*|cnc|3d print\\w*|dimensions?|measur\\w*|production", "render\\w*|animat\\w*|visuali[sz]\\w*|games?|gaming|studio|films?|movies?|video|graphics", "engineer\\w*|manufactur\\w*|supplier", "render\\w*|animat\\w*|games?|films?") },
              { desc: "Extra data: 3DS carries materials, textures or lights, whereas STEP brings in only the finished shape", negOK: true, any: [
                "\\b3ds\\b[\\s\\S]{0,80}?(?:materials?|textures?|lights?|lighting|cameras?|colou?rs?)[\\s\\S]{0,110}?\\bstep\\b[\\s\\S]{0,60}?(?:only|just|no |not |without|cannot|can't|doesn't|does not|lost|loses|finished shape|final shape|geometry|shape)",
                "\\bstep\\b[\\s\\S]{0,130}?(?:only|just|no |not |without|cannot|can't|doesn't|does not|lost|loses|finished shape|final shape)[\\s\\S]{0,110}?\\b3ds\\b[\\s\\S]{0,80}?(?:materials?|textures?|lights?|lighting|cameras?|colou?rs?)"],
                not: ["\\bstep\\b\\W+(?:(?!cannot|can|not|no|without|doesn|does|isn|t\\b)\\w+\\W+){0,4}(?:materials?|textures?|lights?|lighting|cameras?|colou?rs?)", "\\b3ds\\b[^.]{0,25}(?:\\bnot\\b|n't|\\bno\\b|without|never|cannot)[^.]{0,25}(?:materials?|textures?|lights?|lighting|cameras?|colou?rs?)"] },
            ],
            sample: "A STEP file holds an accurate solid model, whereas a 3DS file is a polygon mesh made of many small flat facets. STEP can be used to share models between CAD packages for engineering, while 3DS is used for rendering, animation and games. A 3DS file also does carry materials, textures and lights, but a STEP file will bring in only the finished shape.",
            model: "<ul><li>Geometry: STEP is an accurate solid, 3DS a polygon mesh of flat facets (1)</li><li>Purpose: STEP exchanges accurate models between CAD packages for engineering and manufacture, 3DS is for visualisation, rendering, animation and games (1)</li><li>Extra data: 3DS carries materials, textures, lights and cameras, STEP only the finished shape (the modelling tree is lost) (1)</li></ul><p>Any 3 points. A compare answer needs both sides of each point: \"3DS is a mesh\" on its own is half a point, and describing only one file earns nothing for the comparison.</p>" },
        ],
      },
      {
        id: "cad-14",
        style: "Short question set · match 2D constraints and explain",
        stem: "<p>A cleat plate for the quayside is to be modelled. Its flat sketch has a long straight edge, a second edge at right angles to it, a rounded end that blends smoothly into the straight edge, and a bolt hole on the same centre as a larger recess round it. The designer wants the sketch fully constrained before it is extruded.</p>",
        parts: [
          { label: "(a)", type: "match", marks: 3, q: "Match each 2D constraint to the job it does in the cleat plate sketch.",
            pairs: [
              ["Perpendicular", "Keeps the second edge at 90° to the long edge"],
              ["Tangent", "Makes the rounded end touch the straight edge without crossing it"],
              ["Concentric", "Makes the bolt hole and the recess share one centre"],
            ] },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Explain why the sketch should be fully constrained before the designer starts to edit its dimensions.",
            points: [
              { desc: "Cause: the constraints fix the relationships and sizes of the geometry, so it can only change when a dimension is changed", any: [
                "(?<!un)(?<!under)constrain\\w*" + GAP(60) + "(?:fix|lock|hold|keep|stay|define|control|set|cannot|can't|can only|free to|unable to|prevent|restrict|stop)\\w*",
                "(?:fix|lock|hold|defin|control|pin)\\w*" + GAP(50) + "(?<!un)(?<!under)constrain\\w*",
                "(?<!un)(?<!under)constrain\\w*" + GAP(40) + "(?:every|each|all)" + GAP(30) + "(?:relationship|geometry|line|edge|part)",
                "(?:fully|completely|totally)\\W+(?:\\w+\\W+){0,1}(?:constrained|defined)" + GAP(80) + "(?:only|just)\\s+(?:\\w+\\s+){0,3}(?:change|move|alter|edit)\\w*"] },
              { desc: "Effect: when it is edited, the lines stay parallel, holes stay centred and corners stay square, so the design intent is kept", group: "eff", any: [
                "(?:stay|remain|keep|hold)\\w*\\W+(?:\\w+\\W+){0,5}(?:parallel|centre|center|centred|centered|square|perpendicular|tangent|concentric|in place|in position|shape|90|intent)",
                "design intent"],
                not: ["intent\\W+(?:\\w+\\W+){0,2}(?:lost|broken|ruined|destroyed|gone)", "(?:lose|loses|lost|break|breaks|ruin|ruins)\\W+(?:\\w+\\W+){0,2}design intent"] },
              { desc: "Effect: otherwise the sketch twists or distorts when edited, so holes drift off centre or corners are no longer square", group: "eff", negOK: true, any: [
                "(?:otherwise|without|unconstrained|not constrained|no constraints)" + GAP(80) + "(?:distort|twist|warp|drift|move|out of shape|wrong|lose|change shape)\\w*",
                "(?:distort|twist|warp|drift)\\w*" + GAP(60) + "(?:edit|chang|resiz|dimension)\\w*"] },
            ],
            sample: "Constraints fix the geometry in place, so a fully constrained sketch can only change when a dimension is changed. When the plate is edited its edges would stay parallel and the hole would stay on the centre line, so the design intent is kept.",
            model: "<ul><li>Cause: constraints fix the geometry and its relationships, so it can only change through a dimension (1)</li><li>Effect: when edited, lines stay parallel, holes stay centred and corners stay square: the design intent is kept (1)</li></ul><p>Also acceptable for the effect: without constraints the sketch twists out of shape as soon as one line is edited, so holes drift off centre and a square corner stops being 90°. \"It looks neater\" earns nothing.</p>" },
        ],
      },
    ],
  };
  /* ---- Hardening pass: wider paraphrase, negative phrasings, and vetoes for swapped or stuffed answers. ----
     These helpers only add alternatives to the points above; they never remove a requirement. */
  const QP = (id, i) => B.cad.questions.find((q) => q.id === id).parts[i];
  /* more(): extra `any` alternatives on a point that is `any`-only. */
  const more = (id, i, k, any, negOK) => { const pt = QP(id, i).points[k]; pt.any = (pt.any || []).concat(any); if (negOK) pt.negOK = true; };
  /* alt(): another way to say the j-th required half of an `all` point. */
  const alt = (id, i, k, j, src) => { QP(id, i).points[k].all[j] += "|" + src; };
  /* add(): a further acceptable point (give it the same `group` as the idea it repeats). */
  const add = (id, i, pt) => QP(id, i).points.push(pt);
  const win = (id, i, k, n) => { QP(id, i).points[k].win = n; };
  const AXIS = "(?:axis|axes|cent(?:re|er) ?lines?|common axis)";

  /* cad-01(b): the half profile may be "put" or "drawn"; radii may be given as "60 out from the axis" */
  alt("cad-01", 1, 0, 0, "(?:put|plac|position|mak|start|begin|use)\\w*\\W+(?:\\w+\\W+){0,6}(?:half|profile|cross.?section|outline)");
  win("cad-01", 1, 0, 110);
  alt("cad-01", 1, 1, 0, "\\b60\\s*(?:mm\\s*)?(?:wide|out|over|away|from (?:the )?(?:axis|centre|center|centre ?line))");
  alt("cad-01", 1, 2, 0, "\\b30\\s*(?:mm\\s*)?(?:wide|out|over|away|from (?:the )?(?:axis|centre|center|centre ?line))");
  alt("cad-01", 1, 3, 0, "\\b45\\s*(?:mm\\s*)?(?:wide|out|over|away|from (?:the )?(?:axis|centre|center|centre ?line))");
  more("cad-01", 1, 4, [
    "(?:revolv|rotat|spin|turn)\\w*[^.]{0,50}(?:360|(?:full|complete|whole|entire)\\s+(?:turn|revolution|circle|rotation)|all the way|(?:round|around|about)\\s+(?:the\\s+|its\\s+|that\\s+|this\\s+)?" + AXIS + ")",
    "(?:revolve|revolved)[^.]{0,30}(?:all the way|fully|completely)",
  ]);

  /* cad-02(d): coil / helical sweep are other names for the helix command; "helix it" needs no verb */
  more("cad-02", 3, 1, [
    "(?:use|using|used|apply|applying|run|running|insert|inserting|select|choose|add|adding|make|making|activate|click|pick|picking)\\W+(?:\\w+\\W+){0,3}(?:coil|helical|helix)",
    "(?:coil|helical|spiral)\\w*\\W+(?:\\w+\\W+){0,2}(?:command|tool|feature|function|option|icon|button|sweep)",
    "\\bhelix\\w*\\W+(?:\\w+\\W+){0,4}(?:around|about|round|along)\\W+(?:\\w+\\W+){0,2}" + AXIS,
  ]);

  /* cad-04(a): the loft and the shell, however they are worded; sizes still have to be right */
  alt("cad-04", 0, 0, 0, "\\bsquare\\b\\W+(?:\\w+\\W+){0,5}100|\\b100\\W+(?:\\w+\\W+){0,5}square|\\b100\\s*(?:mm\\s*)?(?:x|by)\\s*100");
  alt("cad-04", 0, 1, 1, "\\b(?:offset|distance|height|above)\\W+(?:\\w+\\W+){0,2}80(?!\\d)|(?:\\b80|^80)\\s*(?:mm)?\\s*(?:above|up|higher|over)");
  alt("cad-04", 0, 0, 1, "100(?=\\s*mm)");
  alt("cad-04", 0, 3, 0, "\\bloft\\w*");
  win("cad-04", 0, 3, 120);
  alt("cad-04", 0, 4, 1, "\\bshell\\w*\\W+(?:\\w+\\W+){0,3}\\b3\\b");

  /* cad-04(b): the tube round the hole, in the words students use for it */
  more("cad-04", 1, 0, [
    "(?:shell|hollow)\\w*[^.]{0,80}(?:hole|opening)[^.]{0,80}(?:wall|thickness|tube|lining|skin|sleeve|pipe)",
    "(?:hole|opening)[^.]{0,60}(?:wall|thickness|tube|lining|skin|sleeve|pipe)[^.]{0,60}(?:shell|hollow)",
    "(?:shell|hollow)\\w*[^.]{0,60}(?:every|each|all)\\s+(?:\\w+\\s+)?(?:face|edge|surface|side)s?",
  ]);
  { const e = QP("cad-04", 1).points[1];
    e.negOK = true;
    e.all[0] += "|\\b(?:tube|sleeve|collar|lining|pipe)\\s+(?:\\w+\\s+){0,2}(?:forms?|formed|appears?|grows?|is (?:made|created|left|added))|instead of (?:a )?(?:\\w+ )?(?:clean|plain|simple|proper|open) (?:hole|opening)|(?:lined|lining) with (?:a )?(?:\\w+ )?(?:tube|pipe|sleeve|wall)|(?:small|little|thin|narrow|extra|separate)\\s+(?:\\w+\\s+)?(?:pipe|cylinder|ring|rim|lip)";
    e.not = e.not.concat(["(?:hole|opening)\\s+(?:is|are|was|would be)\\s+(?:\\w+\\s+)?(?:smaller|narrower)\\s+than\\s+(?:the\\s+)?(?:duct|part|model|spout|square|circle|side)",
      "(?:not|n't|never)\\s+(?:be\\s+|get\\s+|become\\s+)?(?:\\w+\\s+)?(?:blocked|sealed|closed|narrowed|clogged|lined)"]); }

  /* cad-07(b): "associative" is the keyword, but the effect has many wordings */
  more("cad-07", 1, 1, [
    "(?:reflect|carr(?:y|ied)|flow|pass|propagat|appl(?:y|ied)|feed|fed)\\w*\\W+(?:\\w+\\W+){0,6}(?:drawing|views?|dimensions?)\\W+(?:\\w+\\W+){0,6}(?:automatic\\w*|instantly|straight away|immediately|at once|as soon as|when (?:it is |they are )?(?:rebuilt|regenerated))",
    "(?:drawing|views?|dimensions?)\\W+(?:\\w+\\W+){0,8}(?:automatic\\w*|instantly|straight away|immediately|at once)",
    "(?:as soon as|immediately|straight away|at once|instantly)\\W+(?:\\w+\\W+){0,6}(?:reflect|updat|rebuil|regenerat|chang|refresh)\\w*",
    "(?:no need|not need|don'?t need|do not need|don'?t have|do not have|without|avoid\\w*|saves?|saving)\\W+(?:\\w+\\W+){0,4}(?:redraw\\w*|re-?draw\\w*|redo\\w*)",
  ]);
  QP("cad-07", 1).points[1].negOK = true;

  /* cad-08(a): "axis constraint", "align the axes" and "common axis" are centre-axis in other words */
  const AXC = "\\baxis (?:constraint|mate|alignment)|\\b(?:align|aligned|aligns|aligning|line[sd]? up|lined up|lining up)\\w*\\W+(?:\\w+\\W+){0,6}(?:axis|axes|cent(?:re|er) ?lines?|common axis)|\\bcommon axis|\\bsame axis|\\b(?:axis|axes)\\W+(?:\\w+\\W+){0,3}(?:align\\w*|line[sd]? up)";
  alt("cad-08", 0, 0, 0, AXC);
  alt("cad-08", 0, 1, 0, AXC);

  /* cad-09(b): the cause was matched by the verb "open the file" and the swap "STEP only opens in the shipyard's own software" was not vetoed */
  { const c = QP("cad-09", 1).points[0];
    c.any[0] = "(?:neutral|universal|international|standard|generic)\\W+(?:\\w+\\W+){0,3}(?:format|file|type)|\\bopen (?:standard|format|file format|file type)";
    c.any[1] = c.any[1].replace("|generic|open)", "|generic)");
    const e = QP("cad-09", 1).points[1];
    e.any.push("\\b(?:they|them|it|supplier|firm|company|manufacturer)\\b\\W+(?:\\w+\\W+){0,2}(?:can|could|will be able to|is able to|are able to|able to|should be able to)\\W+(?:\\w+\\W+){0,3}(?:open|read|import|view|load|use|access)");
    [c, e].forEach((pt) => { pt.not = pt.not.map((n) => n.replace("(?:only|just)\\W+(?:\\w+\\W+){0,3}", "(?:only|just)\\W+(?:\\w+\\W+){0,6}")); }); }

  /* cad-10(b): shadows */
  more("cad-10", 1, 3, [
    "\\b(?:add|adds|adding|include|put in|use|turn on|enable|apply|cast|casts|casting|create|have|show|showing)\\W+(?:\\w+\\W+){0,3}(?:shadows?)\\b",
    "shadow\\w*[^.]{0,60}(?:floor|ground|under|beneath|below)",
  ]);

  /* cad-11(b): the advantages, however a candidate words them (nothing here rewards "faster" on its own) */
  more("cad-11", 1, 0, [
    "(?:chang|edit|alter|amend|modif|adjust|resiz)\\w*\\W+(?:\\w+\\W+){0,8}(?:once|one (?:dimension|thing|place|value|number|go|edit)|one-?off|single (?:change|edit|dimension))\\W+(?:\\w+\\W+){0,8}(?:updat\\w*|rebuild\\w*|regenerat\\w*|follow\\w*|automatic\\w*|everything|all|every)",
    "(?:once|one (?:dimension|thing|place|value|number|go|edit)|one-?off|single (?:change|edit|dimension))\\W+(?:\\w+\\W+){0,8}(?:chang|edit|alter|amend|modif|adjust|resiz)\\w*\\W+(?:\\w+\\W+){0,8}(?:updat\\w*|rebuild\\w*|regenerat\\w*|follow\\w*|automatic\\w*|everything|all|every)",
    "(?:chang\\w*|edit\\w*|alter\\w*|modif\\w*)\\W+(?:\\w+\\W+){0,6}(?:updat\\w*|rebuild\\w*|regenerat\\w*|automatic\\w*)",
    "(?:no need|not need|don'?t need|do not need|don'?t have|do not have|without|avoid\\w*|saves?|saving)\\W+(?:\\w+\\W+){0,4}(?:redraw\\w*|re-?draw\\w*|redo\\w*)",
  ], true);
  more("cad-11", 1, 1, [
    "\\b(?:all|every|many|different|several|multiple|various|each)\\W+(?:\\w+\\W+){0,2}(?:views?|drawings?|sections?|renders?|pictorials?|elevations?|plans?)\\W+(?:\\w+\\W+){0,8}(?:from|of|made from|taken from|produced|generated|created|come|comes|derived)\\W+(?:\\w+\\W+){0,4}(?:one|single|same|the|a|3d)\\W+(?:3d\\W+)?model",
    "(?:generate|produce|create|get|obtain|make|extract|derive)\\w*\\W+(?:\\w+\\W+){0,4}(?:views?|drawings?|sections?|renders?|elevations?)\\W+(?:\\w+\\W+){0,8}(?:from|out of|using)\\W+(?:\\w+\\W+){0,3}model",
  ]);
  more("cad-11", 1, 2, [
    "(?:mistakes?|errors?|problems?|faults?|clashes?|interference|collisions?)\\W+(?:\\w+\\W+){0,6}(?:found|spotted|caught|detected|picked up|identified|seen|noticed|solved|fixed|checked)\\W+(?:\\w+\\W+){0,4}(?:early|sooner|before|virtually|on screen|on the screen|in the model)",
    "(?:found|spotted|caught|detected|picked up|identified|seen|noticed|solved|fixed|checked)\\W+(?:\\w+\\W+){0,4}(?:early|sooner)",
    "(?:test\\w*|simulat\\w*|check\\w*|try\\w*)\\W+(?:\\w+\\W+){0,6}(?:virtual\\w*|on screen|on the computer|digitally|in the model|without building|before (?:it is |they are )?built)",
  ]);
  more("cad-11", 1, 3, [
    "(?:cnc|3d print\\w*|laser cut\\w*|machines?)\\W+(?:\\w+\\W+){0,6}(?:straight|directly|direct|from the (?:model|file))",
    "(?:straight|directly|direct)\\W+(?:\\w+\\W+){0,4}(?:to|into)\\W+(?:\\w+\\W+){0,3}(?:cnc|3d print\\w*|laser|machines?)",
  ]);
  more("cad-11", 1, 4, [
    "(?:measur\\w*|dimensions?)\\W+(?:\\w+\\W+){0,6}(?:directly|straight|from the model|on screen|off the model)",
  ]);

  /* cad-12(a) */
  alt("cad-12", 0, 0, 1, "extrud\\w*\\W+(?:\\w+\\W+){0,9}\\b50\\b");
  alt("cad-12", 0, 2, 1, "\\bshell\\w*\\W+(?:\\w+\\W+){0,3}\\b3\\b");
  alt("cad-12", 0, 3, 0, "\\bdiameter\\b");
  alt("cad-12", 0, 4, 0, "\\bdiameter\\b");
  alt("cad-12", 0, 5, 0, "(?:array|pattern)\\w*\\W+(?:\\w+\\W+){0,7}(?:radial|circular|polar|rotational|round|around|about)|(?:radial|circular|polar|rotational)\\W+(?:\\w+\\W+){0,3}(?:array|pattern|copy|copies|repeat)\\w*|\\b60\\s*(?:°|degrees?)");

  /* cad-13(a): a 3DS statement about materials, textures or lights carries the third mark even when STEP is only implied */
  more("cad-13", 0, 2, [
    "\\b3ds\\b\\W+(?:\\w+\\W+){0,10}(?:includes?|carr(?:y|ies)|holds?|stores?|keeps?|supports?|contains?|has|have|with|saves?)\\W+(?:\\w+\\W+){0,3}(?:materials?|textures?|lights?|lighting|cameras?)",
  ]);

  /* cad-14(b) */
  more("cad-14", 1, 0, [
    "constrain\\w*[^.]{0,60}(?:relationships?|geometry|shape)[^.]{0,30}(?:kept|keep|keeps|stay|maintained|held|preserved|retained)",
    "(?:stops?|prevents?|prevented|preventing|stopping)\\W+(?:\\w+\\W+){0,3}(?:sketch|geometry|shape|lines?|it)\\W+(?:\\w+\\W+){0,3}(?:moving|moves|move|distort\\w*|twist\\w*|shift\\w*|changing|falling apart|dragged|dragging)",
    "(?:cannot|can'?t|can not|unable to|won'?t)\\W+(?:\\w+\\W+){0,3}(?:be dragged|dragged|be moved|moved|drag|move)",
  ], true);
  more("cad-14", 1, 2, [
    "(?:if|when|unless)[^.]{0,60}(?:free|loose|unconstrained|not (?:fully )?constrained|not fixed|not locked)[^.]{0,80}(?:distort|twist|warp|drift|move|shift|change shape|wrong|out of shape)\\w*",
    "(?:edit|chang|resiz|dimension|alter)\\w*[^.]{0,60}(?:distort|twist|warp|drift|move|shift|fall apart|stretch|squash)\\w*",
  ]);
  { const i = QP("cad-14", 1).points[1];
    i.not = i.not.map((n) => n.replace("intent\\W+(?:\\w+\\W+){0,2}(?:lost", "intent\\W+(?:(?!not|n't|never)\\w+\\W+){0,2}(?:lost")); }
  /* ---- Hardening, part 2: synonym gaps and swap vetoes, checked against hand-written student answers. ---- */
  const FILL = "(?:(?:of|is|as|to|at|be|set|a|the|about|value|number|distance|=|:)\\W+){0,3}";

  /* cad-01(b): "radius is 30", "base 60 by 15", "neck 30 and 85" and a list of radii followed by a list of heights */
  { const P = QP("cad-01", 1).points;
    [["base", 1, 60, 15, "base|bottom|foot|first (?:step|part|section)", 120], ["neck", 2, 30, 85, "neck|middle|stem|second (?:step|part|section)", 60], ["head", 3, 45, 110, "head|top|cap|third (?:step|part|section)", 90]].forEach(([nm, k, r, h, lab, d]) => {
      P[k].group = nm; P[k].win = 110;
      P[k].all[0] += "|\\b(?:radius|rad|r)\\W+(?:(?:is|of|=|:|about|to|a)\\W+){0,2}" + r + "\\b|\\bdiameter\\W+(?:(?:is|of|=|:)\\W+)?" + d + "\\b";
      P.push({ desc: P[k].desc, group: nm, any: ["\\b(?:" + lab + ")\\W+(?:\\w+\\W+){0,4}" + r + "\\b\\W+(?:\\w+\\W+){0,3}" + h + "\\b", "\\b" + r + "\\s*(?:mm\\s*)?(?:x|by)\\s*" + h + "\\b"] });
      P.push({ desc: P[k].desc, group: nm, all: ["\\bradi\\w*\\W+(?:\\w+\\W+){0,3}60\\W+(?:\\w+\\W+){0,3}30\\W+(?:\\w+\\W+){0,3}45\\b", "\\bheights?\\W+(?:\\w+\\W+){0,3}15\\W+(?:\\w+\\W+){0,3}85\\W+(?:\\w+\\W+){0,3}110\\b"], win: 200 });
    }); }
  alt("cad-01", 1, 0, 0, "(?:half|profile|cross.?section|outline)\\W+(?:\\w+\\W+){0,8}(?:sketch|draw|creat|plac|put)\\w*");

  /* cad-02(d) */
  { const p = QP("cad-02", 3).points;
    p[0].all[0] += "|\\b(?:circle|circular|profile)\\b";
    p[0].all[2] += "|diameter\\W+(?:of\\W+)?five|five\\W+(?:mm\\W+)?diameter";
    p[0].all[3] += "|twenty.?two\\W+(?:mm\\W+)?(?:from|away|off|out)";
    const PITCH = "pitch\\W+" + FILL + "15\\b(?!\\s*(?:revolutions?|turns?|coils?))|\\b15\\W+(?:mm\\W+)?(?:for|as|=)\\W+(?:the\\W+)?pitch|\\b15\\s*(?:mm\\s*)?pitch";
    const REVS = "\\b(?:revolutions?|turns?|coils?|rotations?|loops?)\\W+" + FILL + "(?:7|seven)\\b|\\b(?:7|seven)\\W+(?:\\w+\\W+)?(?:revolutions?|turns?|coils?|rotations?|loops?)\\b|\\b(?:7|seven)\\W+(?:for|as|=)\\W+(?:the\\W+)?(?:number of\\W+)?(?:revolutions?|turns?)";
    const LEN = "(?:height|length|overall|tall|high)\\W+" + FILL + "105\\b|\\b105\\W+(?:mm\\W+)?(?:for|as|=)\\W+(?:the\\W+)?(?:length|height|overall)|\\b105\\s*(?:mm\\s*)?(?:high|tall|long|height|length|overall)";
    // a bare "helix is the command" or a pile of nouns round the word helix earns nothing: the helix has to be used on the profile or axis
    p[1].any = [p[1].any[0], p[1].any[4], p[1].any[5], p[1].any[6],
      "\\bhelix\\w*\\W+(?:\\w+\\W+){0,3}(?:with|using|on|from|round|around|about|along)\\W+(?:\\w+\\W+){0,3}(?:profile|circle|sketch|wire|axis)",
      "(?:profile|circle|wire|sketch)\\W+(?:\\w+\\W+){0,3}(?:with|into|using|to|as)\\W+(?:a\\W+|the\\W+)?helix\\w*|(?:helix(?:ed)?|coil)\\W+(?:the|that|this|it)\\W+(?:circle|profile|sketch)",
      "\\b(?:then|next|finally|after that)\\W+(?:i\\W+)?(?:(?:would|will|could)\\W+)?(?:use\\W+)?(?:the\\W+)?helix\\b",
      "\\bhelix\\w*\\W+(?:command\\W+|tool\\W+|feature\\W+)(?:\\w+\\W+){0,2}(?:used|applied|selected|chosen|run|picked)\\b",
      "\\bhelix\\w*\\W+(?:command\\W+|tool\\W+)?(?:\\w+\\W+){0,6}(?:choos|select|pick|click)\\w*\\W+(?:\\w+\\W+){0,3}(?:profile|circle|sketch|wire|axis)"];
    p[0].all[1] += "|\\b(?:circular|section)\\b";
    p[2].any = two(PITCH, REVS, LEN); }

  /* cad-03(a): the straights are path lengths, not the sides of a rectangle */
  QP("cad-03", 0).points[1].not = ["\\brectangles?\\b|\\bextrud\\w*\\W+(?:it\\W+)?straight"];

  /* cad-04(a): a swapped square/circle size earns neither sketch mark */
  { const P = QP("cad-04", 0).points;
    const SWAPSQ = ["\\bcircle\\W+(?:(?:of|with|at|is|=|diameter)\\W+){0,3}100\\b", "\\bsquare\\W+(?:(?:of|with|at|is|=|side|sides)\\W+){0,3}40\\b"];
    P[0].all[0] += "|\\b100\\W+(?:\\w+\\W+)?square|\\bsquare\\W+(?:\\w+\\W+){0,2}100\\b";
    P[0].not = (P[0].not || []).concat(SWAPSQ, ["\\b100\\s*(?:mm\\s*)?(?:diameter|dia)\\b"]);
    P[2].not = (P[2].not || []).concat(SWAPSQ); }

  /* cad-04(b): shell gives a wall to every face, including an existing hole's; the hole then sits inside a tube */
  { const H = "(?:holes?|openings?|cut-?outs?)", W = "(?:walls?|thickness|skin|tube|pipe|sleeve|collar|ring|lining|lined|rim|lip|material|layer)";
    const C = [
      W + "\\W+(?:\\w+\\W+){0,4}(?:round|around|surround\\w*|about|inside|along|on|onto|into|for|to|at|of)\\W+(?:(?:the|that|an?|its|every|each|all|existing|earlier|already|previous|pre-?cut)\\W+){0,3}(?:\\w+\\W+){0,2}" + H,
      H + "\\W+(?:\\w+\\W+){0,4}(?:gets?|got|would get|will get|has|have|given|receives?|ends up with|is given|is lined|is surrounded|is thickened|becomes?)\\W+(?:\\w+\\W+){0,3}" + W,
      "(?:shell|hollow)\\w*\\W+(?:\\w+\\W+){0,12}(?:every|each|all|any|other|also)\\W+(?:\\w+\\W+){0,2}(?:faces?|surfaces?|edges?)\\W+(?:\\w+\\W+){0,8}" + H,
      H + "(?:'s|s')?\\W+(?:\\w+\\W+){0,2}(?:faces?|surfaces?|sides?|insides?)\\W+(?:\\w+\\W+){0,10}(?:shell|hollow|wall|thick)",
      "(?:shell|hollow)\\w*\\W+(?:\\w+\\W+){0,10}" + H + "\\W+(?:\\w+\\W+){0,3}(?:too|as well|also)",
      W + "\\W+(?:\\w+\\W+){0,4}(?:round|around|surround\\w*)\\W+(?:it|them|that)\\b",
      "(?:make|makes|making|turn|turns|turning|create|creates|form|forms|forming|leave|leaves|leaving|produce|produces|wrap|wraps|wrapping|line|lines|lining|become|becomes|surround\\w*)\\W+(?:\\w+\\W+){0,3}" + H + "\\W+(?:\\w+\\W+){0,5}" + W,
    ];
    const c = QP("cad-04", 1).points[0];
    c.all = ["\\b(?:shell|hollow)\\w*", H, C.join("|")]; delete c.any; c.win = 170; c.negOK = true;
    c.not = c.not.concat(["\\bshell\\w*\\W+(?:\\w+\\W+){0,3}(?:not|n't|never)\\W+(?:\\w+\\W+){0,3}(?:add|put|make|give|build|creat|wrap|thick|hollow|go|touch|affect|change|alter)", "\\b(?:no|without)\\W+(?:\\w+\\W+){0,1}(?:walls?|tube|pipe|sleeve|collar|lining)\\W+(?:\\w+\\W+){0,4}(?:holes?|openings?)"]);
    const e = QP("cad-04", 1).points[1];
    e.all[0] += "|\\b(?:tube|pipe|sleeve|collar|plug)\\b|(?:not|n't|never)\\W+(?:\\w+\\W+){0,2}(?:clean|clear|plain|simple|proper|neat|straight|open)\\W+(?:\\w+\\W+){0,1}(?:holes?|openings?)|\\b(?:instead of|rather than)\\W+(?:a\\W+|an\\W+|the\\W+)?(?:\\w+\\W+)?(?:clean|plain|simple|proper|neat|straight)\\W+(?:holes?|openings?)|\\bblock\\w*"; }

  /* cad-05(c): holes sketched singly on the PCD, 50 degrees apart, then cut */
  { const P = QP("cad-05", 2).points; P[0].win = 110; P[2].win = 80; }

  /* cad-07(a): "history tree", "feature tree", a step in the next sentence, and "get back into" the sketch */
  { const V = "(?:select|click|open|find|choose|locate|pick|double|edit|go (?:back )?(?:to|into|in)|get (?:back )?(?:to|into)|return|expand|use|navigate|right)\\w*";
    const T = "(?:tree|browser|history|manager|feature list|model list)";
    const P = QP("cad-07", 0).points;
    P[0].any = P[0].any.concat([
      T + "[\\s\\S]{0,60}" + V + "[\\s\\S]{0,40}(?:sketch|feature|extrude|circle|hole|cut)",
      V + "[\\s\\S]{0,60}(?:sketch|feature|circle|hole|extrude|cut)[\\s\\S]{0,50}(?:in|from|on|using|through|via|of)\\s+(?:the\\s+|your\\s+)?(?:\\w+\\s+){0,2}" + T,
      "(?:hole|sketch|feature)[^.]{0,30}(?:in|from|on|using|through|via|of)\\s+(?:the\\s+|your\\s+)?(?:\\w+\\s+){0,2}" + T]);
    P[1].any[0] = P[1].any[0].replace("{0,45}\\b25\\b", "{0,80}\\b25\\b"); }

  /* cad-07(b): the drawing is associated with the model (any wording of "linked"), and the change then reaches it without redrawing */
  { const P = QP("cad-07", 1).points;
    P[0].any = [
      "\\bassociat\\w*\\W+(?:\\w+\\W+){0,8}(?:drawing|views?|model|3d)|(?:drawing|views?|model|3d)\\W+(?:\\w+\\W+){0,8}\\bassociat\\w*",
      "(?:drawing|views?|dimensions?|it)\\W+(?:\\w+\\W+){0,6}(?:linked|connected|attached|tied|joined|related)\\W+(?:\\w+\\W+){0,3}(?:model|3d|file|each other|one another|together)",
      "(?:model|3d)\\W+(?:\\w+\\W+){0,6}(?:and|to|with)\\W+(?:the\\W+)?(?:drawing|views?)\\W+(?:\\w+\\W+){0,4}(?:are|is)\\W+(?:linked|connected|attached|tied|joined)",
      "(?:linked|connected|tied|attached)\\W+(?:\\w+\\W+){0,3}(?:model|3d)\\b",
      "\\bassociat\\w*\\W+(?:\\w+\\W+){0,12}(?:change|updat|reflect|rebuil|follow)",
      P[0].any[2], P[0].any[3], P[0].any[4], P[0].any[5], P[0].any[6]];
    P[0].negOK = true;
    P[0].any.push("\\b(?:two|both)\\W+(?:files|things|parts)\\W+(?:\\w+\\W+){0,2}(?:are|is)\\W+(?:linked|connected|associat\\w*)");
    P[0].not = [P[0].not[0], P[0].not[1], P[0].not[2], P[0].not[3], P[0].not[4], P[0].not[6],
      "(?:drawing|views?)\\W+(?:\\w+\\W+){0,2}(?:is|are|was|were|gets?|has been|have been)\\W+(?:changed|edited|altered|modified|amended)\\b",
      "\\bassociat\\w*\\W+(?:\\w+\\W+){0,2}(?:is|means?)\\W+(?:\\w+\\W+){0,3}(?:solid|same|related|mesh|association)", "\\bsame folder\\b|\\bsame as\\W+(?:the\\W+)?model\\b"];
    P[1].any = P[1].any.concat([
      "(?:model|hole|part|3d|file)\\W+(?:\\w+\\W+){0,8}(?:chang|edit|alter|modif|updat|amend|made bigger|enlarg)\\w*\\W+(?:\\w+\\W+){0,8}(?:drawing|views?|dimensions?)\\W+(?:\\w+\\W+){0,6}(?:chang|updat|follow|rebuil|regenerat|refresh|reflect|match|show|pick)\\w*",
      "(?:changes?|edits?|alterations?|modifications?)\\W+(?:\\w+\\W+){0,4}(?:model|hole|part)\\W+(?:\\w+\\W+){0,6}(?:passed|carried|fed|flow\\w*|reflected|picked up|shown|appear\\w*|appl\\w*)\\W+(?:\\w+\\W+){0,3}(?:drawing|views?)",
      "(?:drawing|views?|dimensions?)\\W+(?:\\w+\\W+){0,3}(?:is|are|was|were|gets?)\\W+(?:\\w+\\W+){0,1}(?:updat|refresh|rebuil|regenerat|reflect)\\w*\\W+(?:\\w+\\W+){0,6}(?:whenever|when|every time|as soon as|if|once)",
      "(?:updat|refresh|rebuil|regenerat|adjust)\\w*\\W+(?:\\w+\\W+){0,4}(?:drawing|views?|dimensions?)\\W+(?:\\w+\\W+){0,4}(?:whenever|when|every time|as soon as|if|once|after)",
      "\\bno\\W+(?:re-?draw\\w*|redo\\w*|need to re-?draw)",
      "(?:change|edit)\\W+(?:\\w+\\W+){0,6}(?:passes|passed|carried|carries|goes|go|flows?|feeds?)\\W+(?:\\w+\\W+){0,3}(?:into|to|onto|through)\\W+(?:\\w+\\W+){0,3}(?:drawing|views?|dimensions?)",
      "(?:drawing|views?)\\W+(?:\\w+\\W+){0,2}(?:also|too|as well)\\W+(?:\\w+\\W+){0,2}(?:chang|updat|rebuil|regenerat)\\w*|(?:chang|updat|rebuil|regenerat)\\w*\\W+(?:\\w+\\W+){0,3}(?:drawing|views?)\\W+(?:\\w+\\W+){0,2}(?:too|as well)"]);
    P[1].not = P[1].not.concat(["\\bnot\\W+(?:\\w+\\W+){0,2}(?:automatic\\w*|update\\w*)", "\\bbut\\W+(?:it|they)\\W+(?:does ?n'?t|do ?n'?t|does not|do not|won'?t|cannot|can'?t)"]); }

  /* cad-08(a): constrain the axis of the pin to the axes of the holes; offset belongs to the pulley face, not the pin head */
  { const P = QP("cad-08", 0).points;
    const AX2 = "|\\b(?:axis|axes)\\W+(?:\\w+\\W+){0,7}(?:axis|axes)\\b";
    P[0].all[0] += AX2; P[1].all[0] += AX2;
    [P[0], P[1]].forEach((p) => { p.not = ["cent(?:re|er)[ -]?axis\\W+(?:the\\W+)?(?:underside|face|side|head)"]; });
    P[2].all[1] = "(?:pulley|wheel|sheave|roller|gear)";
    P[2].not = ["offset\\w*\\W+(?:\\w+\\W+){0,4}head", "1\\.5\\W+(?:\\w+\\W+){0,3}(?:pin|holes?)\\b"]; }

  /* cad-09(b): neutral format, any package opens it; the swap vetoes stay inside one clause */
  { const P = QP("cad-09", 1).points;
    const OWN = "(?:native|own|shipyard's)\\s+(?:(?!while|whereas|but|and|step)[\\w']+\\s+){0,4}(?:is|are|as)\\s+(?:\\w+\\s+){0,2}(?:neutral|common|universal|standard|open)\\b";
    const SW = ["\\bnative\\s+(?:\\w+\\s+){0,5}(?:in|with|by)\\s+(?:any|all|every|most)\\b", "\\bbut\\s+not\\s+(?:a\\s+|the\\s+)?step\\b", "\\bbrowsers?\\b", "\\bstep\\W+(?:\\w+\\W+){0,3}(?:cannot|can'?t|unable|can not)\\W+(?:\\w+\\W+){0,3}(?:open|read|import)"];
    P[1].not[0] = "(?<!(?:native|own|shipyard's|their)[^.;]{0,60})(?:supplier|firm|company|manufacturer)\\s+(?:(?!software|cad|package|program|system)\\w+\\s+){0,2}(?:cannot|can't|can not|unable|couldn't|won't be able|will not be able)";
    P[0].not[0] = OWN; P[1].not[1] = OWN; P[0].negOK = true; P[1].negOK = true;
    P[0].not = P[0].not.concat(SW); P[1].not = P[1].not.concat(SW);
    P[0].any = P[0].any.concat([
      "(?:compatible|supported|understood|readable|recogni[sz]ed)\\W+(?:\\w+\\W+){0,3}(?:with|by|in|across)\\W+(?:\\w+\\W+){0,3}(?:most|many|all|any|every|lots of|different|other|various|several|nearly all|almost all)",
      "\\b(?:not|n'?t|independent of)\\W+(?:\\w+\\W+){0,4}(?:specific|tied|limited|locked|restricted|dependent)\\W+(?:\\w+\\W+){0,3}(?:to|on)\\W+(?:\\w+\\W+){0,2}(?:one|a single|any|particular|specific)",
      "(?:software|program|package|cad)[- ]independent|non-?proprietary|vendor[- ]neutral",
      "(?:lots of|many|most|all|any|every|different|other|several|various)\\W+(?:\\w+\\W+){0,3}(?:cad\\W+)?(?:packages?|software|programs?|systems?)\\W+(?:\\w+\\W+){0,6}(?:can|could|will)\\W+(?:\\w+\\W+){0,2}(?:read|open|import|use|understand)"]);
    P[1].any = P[1].any.concat([
      "(?:everyone|everybody|anyone|all (?:firms|companies|suppliers)|other (?:firms|companies)|the (?:other|receiving) (?:firm|company|side)|whoever|machines?)\\W+(?:\\w+\\W+){0,3}(?:can|could|will be able to|able to)\\W+(?:\\w+\\W+){0,3}(?:open|read|import|use|view)",
      "(?:model|file|it)\\W+(?:\\w+\\W+){0,3}(?:can|could|will)\\W+(?:be\\W+)?(?:opened|read|imported|used|viewed|shared)\\W+(?:\\w+\\W+){0,6}(?:by|in|with|on)",
      "(?:opened|imported|read|used)\\W+(?:\\w+\\W+){0,4}(?:in|by|with|on)\\W+(?:\\w+\\W+){0,3}(?:their|own|different|other|any|another)",
      "(?:supplier|firm|company|manufacturer|they|machines?)\\W+(?:\\w+\\W+){0,3}(?:can|could|will be able to|able to)\\W+(?:\\w+\\W+){0,3}(?:open|read|import)",
      "\\b(?:so|and|therefore|then)\\W+(?:they|the supplier|the firm|the manufacturer|the company)\\W+can\\b(?!\\W+not)"]); }

  /* cad-12(a): swapped rectangle sides / extrusion height */
  QP("cad-12", 0).points[0].not = ["\\b(?:50|60)\\s*(?:mm\\s*)?(?:by|x)\\s*(?:50|60)\\b", "extrud\\w*\\W+(?:\\w+\\W+){0,2}90\\b"];

  /* cad-10(b): materials, lights, shadows, reflections, setting in a student's own words */
  { const P = QP("cad-10", 1).points;
    P[0].not = P[0].not.concat(["\\blots of\\W+(?:\\w+\\W+){0,2}(?:and|,)\\W+lots of\\b"]);
    P[1].any = P[1].any.concat([
      "material\\w*\\W+(?:\\w+\\W+){0,5}(?:plastic|metal|steel|colou?r|shin\\w*|glossy|matt|texture|rough|paint|finish)",
      "(?:realistic|real|right|correct|suitable)\\W+(?:\\w+\\W+){0,1}(?:texture|colou?r|finish|material)|texture\\w*\\W+(?:and\\W+)?colou?r|colou?r\\W+(?:and\\W+)?(?:texture|gloss\\w*|shin\\w*)",
      "(?:rubber|plastic|metal|steel|wood|chrome|galvani[sz]ed)\\W+(?:\\w+\\W+)?(?:texture|finish|surface|material)",
      "(?:surface|shiny|glossy|metal\\w*|plastic|polished)\\W+(?:finish|texture|surface)|finish\\W+(?:\\w+\\W+){0,4}(?:metal|plastic|shin\\w*|gloss\\w*|polished)"]);
    P[4].any = P[4].any.concat([
      "(?:in|within|inside)\\W+(?:a|an|the)\\W+(?:\\w+\\W+){0,2}(?:scene|setting|room|environment|store|quayside|workshop)",
      "(?:floor|ground|walls?|background)\\W+(?:\\w+\\W+){0,4}(?:round|around|behind|beneath|under)\\W+(?:it|the bin)|(?:add|include|put)\\w*\\W+(?:\\w+\\W+){0,3}(?:a|the)\\W+(?:floor|ground|background|scene)"]);
    QP("cad-10", 1).points.forEach((pt) => { pt.not = (pt.not || []).concat(["\\b3ds\\b|\\bstep\\b"]); }); }

  /* cad-11(b) */
  { const P = QP("cad-11", 1).points;
    P[0].any = P[0].any.concat([
      "(?:easier|quick\\w*|faster|easy|simple|fast)\\W+(?:to\\W+)?(?:\\w+\\W+){0,2}(?:change|modify|edit|alter|update|amend|make changes)",
      "(?:changes?|modifications?|edits?|editing|alterations?)\\W+(?:\\w+\\W+){0,8}(?:follow\\w*|carried (?:through|over)|flow\\w*|show\\w*|appl\\w*|propagat\\w*|updat\\w*)\\W+(?:\\w+\\W+){0,4}(?:all|every|views?|drawings?|everywhere|through|themselves|automatic\\w*)",
      "(?:without|no need|rather than|instead of|not (?:have|need) to)\\W+(?:\\w+\\W+){0,4}(?:redraw\\w*|re-draw\\w*|starting (?:again|over)|start again|redo)",
      "(?:only|just)\\W+(?:\\w+\\W+){0,4}(?:model|dimension|one thing|one place)\\W+(?:\\w+\\W+){0,3}(?:needs?|has to|have to)\\W+(?:\\w+\\W+){0,2}(?:chang|edit|alter|updat)",
      "(?:changed?|edit\\w*|alter\\w*)\\W+(?:\\w+\\W+){0,10}(?:updates?|rebuilds?|follow\\w*|flows?)\\W+(?:\\w+\\W+){0,4}(?:everywhere|every view|all (?:the )?views|by themselves|automatic\\w*)"], true);
    P[1].any = P[1].any.concat([
      "(?:one|single|same)\\W+(?:3d\\W+)?model\\W+(?:\\w+\\W+){0,8}(?:plans?|elevations?|images?|pictures?)",
      "(?:views?|drawings?|plans|elevations|sections)\\W+(?:\\w+\\W+){0,6}(?:come|comes|made|produced|generated|created|obtained|taken)\\W+(?:\\w+\\W+){0,4}(?:automatic\\w*|from (?:it|the model|one|a single|the 3d))",
      "(?:no need to|not need to|don't need to|without)\\W+(?:\\w+\\W+){0,2}draw\\w*\\W+(?:\\w+\\W+){0,3}(?:view|again|separate)",
      "(?:rotat\\w*|view\\w*|look\\w*|see\\w*)\\W+(?:\\w+\\W+){0,6}(?:any|every|all)\\W+(?:\\w+\\W+){0,2}(?:direction|angle|side)|sections?\\W+(?:can be\\W+)?(?:taken|cut|made)",
      "(?:photo-?realistic|realistic|rendered|3d)\\W+(?:render\\w*|images?|pictures?|visuali[sz]\\w*|views?)|render\\w*\\W+(?:\\w+\\W+){0,6}(?:client|customer|presentation|show|sell)"]);
    P[2].any = P[2].any.concat([
      "(?:assembl\\w*|test\\w*|check\\w*)\\W+(?:\\w+\\W+){0,6}(?:fit\\b|fits\\b|fitting|clash\\w*|interfer\\w*|work(?:s|ing)? together)",
      "(?:fit|clash\\w*|interfer\\w*)\\W+(?:\\w+\\W+){0,6}(?:on screen|on the computer|in the model|virtual\\w*|digital\\w*)",
      "(?:simulat\\w*|test\\w*)\\W+(?:\\w+\\W+){0,4}(?:parts?|model|design|assembl\\w*)"]);
    P[3].any = P[3].any.concat([
      "(?:sent|send|share\\w*|email\\w*)\\W+(?:\\w+\\W+){0,6}(?:internet|online|electronic\\w*|email|shipyard|boat-?builder|builder|client|manufacturer|anywhere|immediate\\w*)",
      "(?:use\\w*|make|made|print\\w*|send|sent|export\\w*|go|goes|going|feed|fed|output)\\W+(?:\\w+\\W+){0,6}(?:cnc|3d print\\w*|laser cut\\w*)"]);
    P[4].any = P[4].any.concat([
      "accura\\w*[^.]{0,40}(?:tolerance|small|precise|exact)|(?:exact|precise|accurate)\\W+(?:\\w+\\W+){0,3}(?:dimensions?|sizes?|measurements?)",
      "(?:dimensions?|sizes?|measurements?)\\W+(?:\\w+\\W+){0,4}(?:are|is)\\W+(?:\\w+\\W+){0,2}(?:exact|precise|accurate)"]); }

  /* cad-13(a): a negation about 3DS ("dimensions aren't exact") must not veto the STEP geometry mark; and 3DS carries the extra data in a longer clause */
  { const P = QP("cad-13", 0).points;
    P[0].not[2] = "(?<!\\b3ds\\b(?:(?!\\bstep\\b)[^.]){0,60})" + P[0].not[2];
    P[2].any = P[2].any.concat(["\\b3ds\\b[^.]{0,140}?\\b(?:include[sd]?|carr(?:y|ies)|carried|brings?|holds?|stores?|contains?|has|have|saves?|supports?|with|keeps?)\\b\\W+(?:\\w+\\W+){0,4}(?:materials?|textures?|lights?|lighting|cameras?)"]);
    P[2].any.push("\\b3ds\\b\\W+(?:such as|like|e\\.g\\.?|including|namely)\\W+(?:\\w+\\W+){0,3}(?:materials?|textures?|lights?)", "extra\\W+(?:\\w+\\W+){0,3}3ds");
    P[2].not = P[2].not.concat(["\\bstep\\b[^.]{0,40}\\b(?:includes?|carr(?:y|ies)|holds?|stores?|contains?|has|have|keeps?)\\b\\W+(?:\\w+\\W+){0,3}(?:materials?|textures?|lights?|lighting|cameras?)(?![^.]{0,60}\\b3ds\\b)(?<!\\b3ds\\b[^.]{0,200})"]); }

  /* cad-14(b) */
  { const P = QP("cad-14", 1).points;
    P[0].not = (P[0].not || []).concat(["constrained\\W+(?:\\w+\\W+){0,3}(?:means?|is|are)\\W+(?:\\w+\\W+){0,3}(?:no\\b|colou?r|same|all the lines)", "(?:cannot|can't|can not|unable to|won't let you)\\W+(?:be\\W+)?(?:edited|changed)\\b(?!\\W+(?:by|except|unless|accident|without|only))", "\\bsame colou?r"]);
    P[0].any = P[0].any.concat([
      "(?:held|fixed|locked|defined|controlled)\\W+(?:\\w+\\W+){0,3}(?:in place|in position|by (?:the )?constraints?|by dimensions?)|constraints?\\W+(?:\\w+\\W+){0,3}(?:hold|keep|lock|fix|define|control|stop|prevent|maintain|preserve)",
      "(?:only|just)\\W+(?:\\w+\\W+){0,4}(?:changed?|altered?|edited?|move\\w*)\\W+(?:\\w+\\W+){0,3}(?:by|with|via|through|when)\\W+(?:\\w+\\W+){0,2}dimensions?|can\\W+only\\W+(?:\\w+\\W+){0,3}dimensions?",
      "constraints?\\W+(?:\\w+\\W+){0,3}in place|(?:no|without)\\W+(?:\\w+\\W+){0,2}(?:loose|free)\\W+(?:geometry|lines?|elements?)|\\bwith\\W+(?:the\\W+)?(?:constraints|them|all (?:the )?constraints)\\W+(?:\\w+\\W+){0,4}(?:stays?|remain\\w*|keeps?|fixed|held|locked)",
      "constraints?\\W+(?:\\w+\\W+){0,3}(?:define|decide|set)\\W+(?:\\w+\\W+){0,4}(?:relate|relationship|connected|linked)"], true);
    P[1].negOK = true; P[2].negOK = true;
    P[1].not = (P[1].not || []).concat(["\\b(?:no|not|n't|never)\\W+(?:\\w+\\W+){0,2}(?:stay|remain|keep|hold|maintain|preserve)"]);
    P[1].any = P[1].any.concat([
      "(?:keeps?|kept|maintain\\w*|preserv\\w*|retain\\w*|protect\\w*)\\W+(?:\\w+\\W+){0,4}(?:relationships?|shape|intent|geometry|proportions|intended)",
      "(?:relationships?|shape|intent|geometry)\\W+(?:\\w+\\W+){0,3}(?:kept|keeps|maintained|preserved|retained|intact|correct)",
      "(?:updates?|adjusts?|changes?|responds?|behaves?|follows?|edits?)\\W+(?:\\w+\\W+){0,3}(?:properly|correctly|predictabl\\w*|as (?:intended|expected)|in a controlled)|predictabl\\w*",
      "(?:remains?|stays?|remain)\\W+(?:\\w+\\W+){0,3}(?:correct|right|intact|central|centred|centered|square|symmetrical|smooth|straight|90|tangent|concentric|parallel)",
      "(?:doesn'?t|does not|won'?t|will not|can'?t|cannot)\\W+(?:\\w+\\W+){0,2}(?:distort|deform|twist|warp|drift|move about|go out of shape)",
      "(?:no|nothing)\\W+(?:\\w+\\W+){0,2}(?:float\\w*|twist\\w*|distort\\w*|drift\\w*)"]);
    P[2].any = P[2].any.concat([
      "(?:without|if (?:it|the sketch) (?:is|was|were|wasn'?t|isn'?t) not|if not|if it (?:is|was|were) not|unless)\\W+(?:\\w+\\W+){0,6}(?:distort\\w*|twist\\w*|warp\\w*|drift\\w*|deform\\w*|out of shape|move|shift|change shape)",
      "(?:distort\\w*|twist\\w*|warp\\w*|deform\\w*|go out of shape|out of shape|unexpected ways?)"]); }

  /* every pile of short comma-separated words ("hole, shell, wall, tube, ...") is a list of key words, not an answer */
  const COMMAS = "(?:,\\s*[a-z' -]{1,22}){6,}";
  const noList = (P) => P.forEach((pt) => { pt.not = (pt.not || []).concat([COMMAS]); });
  B.cad.questions.forEach((q) => q.parts.forEach((pt) => { if (pt.type === "text") noList(pt.points); }));
})();
