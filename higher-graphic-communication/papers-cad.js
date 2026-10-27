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
  const D = (n) => `(?:diameter\\s*(?:of\\s*)?${f1(n)}\\b|\\b${f1(n)}\\s*(?:mm\\s*)?(?:diameter|across)|\\bradius\\s*(?:of\\s*)?${f1(n / 2)}\\b|\\br\\s*${f1(n / 2)}\\b|\\b${f1(n / 2)}\\s*(?:mm\\s*)?radius)`;
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
  const HT = (n) => `(?:\\b${n}\\s*(?:mm\\s*)?(?:high|tall|deep|thick|long|height|up)\\b|\\b(?:height|high|tall|thick|up to|to|rises?|rising|reach\\w*|finish\\w*|ends?)\\s*(?:at\\s*|of\\s*|=|:|is\\s*)?(?:a height of\\s*)?${n}\\b)`;
  const ST = (n) => `(?:\\b${n}\\s*(?:mm\\s*)?(?:long|high|tall|vertical|horizontal|straight|line|length|leg|up|across|along)\\b|\\b(?:vertical|horizontal|straight|line|lines|length|leg|height)\\s*(?:of\\s*|=|:|is\\s*|at\\s*)?${n}\\b)`;
  const VERB = "(?:sketch|draw|creat|make|start|begin|insert|add|put|place|construct|model)";
  const GAP = (n) => `[^.]{0,${n}}`;

  // a comparison needs both sides: side A, a contrast word, side B (either way round), or each side tied to its own file name
  const cmp = (sa, sb) => {
    const M = "(?:whereas|while|whilst|but|unlike|compared|however|in contrast|on the other hand|rather than|instead of|;|\\band\\b)";
    return [
      `(?:${sa})[^.]{0,60}${M}[^.]{0,60}(?:${sb})`, `(?:${sb})[^.]{0,60}${M}[^.]{0,60}(?:${sa})`,
      `\\bstep\\b[\\s\\S]{0,70}(?:${sa})[\\s\\S]{0,90}\\b3ds\\b[\\s\\S]{0,70}(?:${sb})`, `\\b3ds\\b[\\s\\S]{0,70}(?:${sb})[\\s\\S]{0,90}\\bstep\\b[\\s\\S]{0,70}(?:${sa})`];
  };

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
    intro: "Computer-aided design techniques are worth 20 to 30 of the 90 marks. This bank is 65 marks: modelling features with sized steps (revolve, extrude, loft, helix, extrude along a path), edits and Booleans, the modelling tree, 3D constraints, file types, libraries and rendering. About 60% of the marks are written \"describe how to model\" answers, so check that every step you write names a plane or face, a feature and its sizes.",
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
              { desc: "Base sized: radius 60 (Ø120) and 15 high", all: ["\\b(?:base|bottom|foot|lower|first|largest)\\b", D(120), HT(15)], win: 70 },
              { desc: "Neck sized: radius 30 (Ø60), rising to 85 (70 long)", all: ["\\b(?:neck|middle|waist|shaft|stem|narrow\\w*|second)\\b", D(60), "(?:\\b85\\b|\\b70\\s*(?:mm\\s*)?(?:high|tall|long)|(?:up to|to|height of|rises? to|reach\\w*)\\s*(?:a height of\\s*)?(?:85|70)\\b)"], win: 70 },
              { desc: "Head sized: radius 45 (Ø90), reaching 110 overall (25 deep)", all: ["\\b(?:head|top|cap|crown|third)\\b", D(90), "(?:\\b110\\b|\\b25\\s*(?:mm\\s*)?(?:high|tall|deep|thick|long)|(?:up to|to|height of|rises? to|reach\\w*|finish\\w*)\\s*(?:at\\s*|a height of\\s*)?(?:110|25)\\b)"], win: 70 },
              { desc: "Revolve the profile (360°) about the axis", any: ["revolv\\w*" + GAP(50) + "(?:360|(?:full|complete|whole|entire)\\s+(?:turn|revolution|circle|rotation)|(?:about|around|round|on|through)\\s+(?:the\\s+|its\\s+|that\\s+|this\\s+)?(?:axis|centre|center))", "(?:360|full|complete|whole)\\s*(?:°|degrees?)?\\s*(?:revolve|revolution|rotation|spin)"] },
            ],
            sample: "On the XZ plane I would sketch the half cross-section of the bollard next to a vertical axis. The base is a rectangle with a radius of 60 and 15 high, the neck has a radius of 30 and goes up to 85, and the head has a radius of 45 and finishes at 110 overall. Then I revolve the profile 360 degrees about the axis.",
            model: "<ul><li>Profile sketched on a plane through the axis, half the cross-section, axis shown (1)</li><li>Base radius 60 (Ø120), 15 high (1)</li><li>Neck radius 30 (Ø60) up to 85 (1)</li><li>Head radius 45 (Ø90) up to 110 overall (1)</li><li>Revolve 360° about the axis (1)</li></ul><p>Any 4 from 5. Also acceptable: the three stacked cylinders as three extrudes (Ø120 × 15, Ø60 × 70, Ø90 × 25, all concentric), one mark per sized step. A revolve with no axis, or with sizes missing, loses those marks: \"revolve the shape\" alone earns nothing.</p>" },
        ],
      },
      {
        id: "cad-02",
        style: "Modelling question · calculate, define and describe a helix",
        stem: "<p>A latch spring for a hatch is a coil of round wire. Its elevation is shown, with dimensions in millimetres.</p>",
        figure: figSpring,
        parts: [
          { label: "(a)", type: "num", marks: 1, unit: "mm", a: 105, tol: 0,
            q: "Calculate the overall length of the spring.",
            why: "Overall length = pitch × number of revolutions = 15 × 7 = 105 mm." },
          { label: "(b)", type: "num", marks: 1, a: 8, tol: 0,
            q: "A second spring has a pitch of 12 and an overall length of 96. How many revolutions does it have?",
            why: "Revolutions = overall length ÷ pitch = 96 ÷ 12 = 8. The three settings are linked, so any two give the third." },
          { label: "(c)", type: "mcq", marks: 1, q: "Which statement describes <em>pitch</em> correctly?",
            opts: ["The number of complete turns in the coil", "The distance the coil advances along its axis in one revolution", "The distance from the axis to the centre of the profile", "The overall height of the finished spring"], a: 1,
            why: "Pitch is a distance measured along the axis, from the centre of one coil to the centre of the next. The number of turns is the revolutions, and the overall height is the length." },
          { label: "(d)", type: "text", marks: 3, rows: 5,
            q: "Describe how the spring in the figure could be modelled using 3D CAD software.",
            points: [
              { desc: "Sketches the wire profile as a Ø5 circle with its centre 22 from the axis", all: ["(?:sketch|draw|creat)\\w*", "(?:circle|profile)", D(5), "(?:\\b22\\s*(?:mm\\s*)?(?:from|away|off|out|offset|apart|to the)|(?:offset|distance|dimension|centre|center)\\s*(?:of\\s*|=|:|is\\s*)?22\\b)"], win: 70 },
              { desc: "Uses the helix command with the profile and the axis", all: ["helix\\w*\\W+(?:\\w+\\W+){0,5}(?:profile|circle|sketch|wire)|(?:profile|circle|wire)\\W+(?:\\w+\\W+){0,4}helix", "(?:axis|centre ?line|center ?line|vertical)"], win: 60 },
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
              { desc: "Sketches the path on a plane, a continuous sketch", all: ["(?:sketch|draw|creat)\\w*\\W+(?:\\w+\\W+){0,2}path|path\\W+sketch", "(?:\\bxz\\b|\\bxy\\b|\\byz\\b|plane|front)"], win: 60 },
              { desc: "Path straights dimensioned: 90 and 70", all: [ST(90), ST(70)], win: 90 },
              { desc: "Bend as an arc, radius 30, tangent to the straights", all: [R(30), "(?:arc|bend|tangent|curve|fillet|corner)"], win: 45 },
              { desc: "Work plane perpendicular to the path at its end", all: ["(?:work ?plane|\\bplane\\b)\\W+(?:\\w+\\W+){0,3}(?:perpendicular|right.?angles?|normal|square to|at 90)|(?:perpendicular|right.?angles?|normal)\\W+(?:\\w+\\W+){0,3}(?:work ?plane|plane)", "(?:path|end|line|sketch)"], win: 50 },
              { desc: "Ø12 circle profile centred on the end of the path", all: ["(?:circle|profile)", D(12), "(?:centre|center|centred|centered|end of|start of|on the path)"], win: 50 },
              { desc: "Extrude along the path (sweep)", any: ["\\bsweep", "extrude\\w*\\s+(?:it |the \\w+ |that \\w+ |this \\w+ |them |the \\w+ \\w+ )?along", "along\\s+(?:the |a |that |this )?(?:\\w+ )?path"] },
            ],
            sample: "First I sketch the path on the XZ plane as one sketch: a vertical line 90, a tangent arc of radius 30 and a horizontal line 70. Then I make a work plane perpendicular to the path at the bottom end and sketch a circle of diameter 12 centred on the end of the path. Finally I extrude the circle along the path.",
            model: "<ul><li>Path sketched on a plane (1)</li><li>Straights 90 and 70 (1)</li><li>Tangent arc R30 (1)</li><li>Work plane perpendicular to the path at an end (1)</li><li>Ø12 circle centred on the end of the path (1)</li><li>Extrude along the path (sweep) (1)</li></ul><p>Any 4 from 6. The 2025 report: many candidates \"did not include all relevant dimensions for the path\". Dimension every straight and every bend.</p>" },
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
              { desc: "Sketches the 100 square on the base plane", all: ["(?:sketch|draw|creat)\\w*\\W+(?:\\w+\\W+){0,4}(?:square|100\\s*(?:x|by)\\s*100)", "\\b100\\b"], win: 40 },
              { desc: "Work plane parallel to the square, offset 80", all: ["(?:work ?plane|\\bplane\\b)", "(?:\\b80\\s*(?:mm\\s*)?(?:above|offset|higher|up|away|from|over|apart|high)|(?:offset|distance|height|above)\\s*(?:of\\s*|=|:|is\\s*)?80\\b)"], win: 50 },
              { desc: "Sketches a Ø40 circle on that plane", all: ["(?:sketch|draw|creat)", "circle", D(40)], win: 50 },
              { desc: "Loft between the square and the circle", all: ["loft\\w*\\W+(?:\\w+\\W+){0,3}(?:between|from|through|joining|connecting|across)", "(?:square|profile|sketch)", "(?:circle|round|spout|profile|sketch)"], win: 60 },
              { desc: "Shell, wall thickness 3, removing the top and bottom faces", all: ["shell\\w*", "(?:(?:thickness|wall|walls)\\s*(?:of\\s*|=|:|is\\s*)?3\\b|\\b3\\s*(?:mm\\s*)?(?:thick|wall|thickness))", "(?:top and bottom|bottom and top|both (?:end|face)s?|each end|two (?:end|face)s?|open (?:at )?both|(?:end|face)s? (?:removed|open)|remov\\w*\\W+(?:\\w+\\W+){0,3}(?:top|bottom|face|end)s?)"], win: 80 },
            ],
            sample: "On the XY plane I sketch a 100 by 100 square. I make a work plane parallel to it and offset 80 above. On that plane I sketch a circle of diameter 40 centred over the square. Then I loft between the square and the circle. Last I shell the loft with a wall thickness of 3, removing the top and bottom faces so it is open at both ends.",
            model: "<ul><li>100 square sketched on the base plane (1)</li><li>Work plane parallel, offset 80 (1)</li><li>Ø40 circle sketched on it, centred over the square (1)</li><li>Loft between the two profiles (1)</li><li>Shell, thickness 3, top and bottom faces removed (1)</li></ul><p>Any 4 from 5.</p>" },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "A Ø6 mounting hole must also pass through one sloping side of the duct. Explain why this hole should be cut after the hollowing edit and not before it.",
            points: [
              { desc: "Cause: the shell puts a wall of the set thickness round every face, including the faces of a hole already cut", any: [
                "(?:shell|hollow)\\w*" + GAP(40) + "(?:wall|thickness|skin|tube|lining)" + GAP(25) + "(?:round|around|surround\\w*|inside|in)\\s+(?:\\w+\\s+){0,3}(?:hole|opening|edge)",
                "(?:shell|hollow)\\w*" + GAP(40) + "(?:every|each|all)\\s+(?:\\w+\\s+)?(?:face|edge|surface)s?" + GAP(25) + "(?:hole|opening)",
                "(?:shell|hollow)\\w*" + GAP(25) + "(?:hole|opening)" + GAP(25) + "(?:wall|thickness|tube|lining|skin|sleeve)",
                "(?:hole|opening)" + GAP(30) + "(?:wall|thickness|tube|lining|skin|sleeve)" + GAP(25) + "(?:shell|hollow)"],
                not: ["(?:should|must|need to|needs to|better to|best to|has to)\\s+(?:be\\s+)?(?:cut|made|added|done|drilled|put)\\w*\\s+(?:it\\s+)?(?:first|before)", "(?:cut|made|done) (?:after|later)[^.]{0,30}(?:shell|hollow)\\w* (?:would |will )?(?:remove|delete|lose|ignore)"] },
              { desc: "Effect: the hole would be lined/blocked by a small tube inside the duct, not a clean hole through the wall", all: ["(?:small|little|thin|narrow|extra|separate)\\s+(?:\\w+\\s+)?(?:tube|sleeve|lining|collar)|\\b(?:tube|sleeve|collar)\\s+(?:inside|in|round|around)|(?:end(?:s|ed)? up|becomes?|turns? into|is|be|get|gets|would be|will be)\\s+(?:\\w+\\s+){0,2}(?:blocked|sealed|closed|narrowed|clogged|lined)|(?:not|isn't|wouldn't be|no longer)\\s+(?:be\\s+)?(?:a\\s+)?(?:clean|clear|open|through)|narrower|smaller\\s+hole|hole\\s+(?:is |would be |will be )?(?:smaller|narrower)", "(?:hole|opening)"], win: 90,
                not: ["(?:remove|delete|erase|ignore|lose|lost|fill|cover)[sd]?\\s+(?:the |that |your )?(?:hole|opening)", "(?:hole|opening)\\s+(?:would |will )?(?:be |get )?(?:removed|deleted|lost|erased|ignored|disappear)"] },
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
              { desc: "Sketches the Ø8 circles with their centres on the 90 PCD (45 from the centre)", all: ["(?:circle|hole)", D(8), "\\b(?:90|45)\\b"], win: 60 },
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
                "tree" + GAP(50) + "(?:select|click|open|find|choose|locate|pick|double)\\w*" + GAP(40) + "(?:sketch|feature|extrude|circle|hole)",
                "(?:select|click|open|find|choose|locate|pick|double)\\w*" + GAP(50) + "(?:sketch|feature|circle|hole|extrude)" + GAP(40) + "(?:in|from|on|using)\\s+(?:the\\s+)?(?:modelling\\s+|model\\s+|feature\\s+)?tree"] },
              { desc: "Changes the diameter to 25 (the model rebuilds)", any: ["(?:change|edit|alter|amend|modify|update|set|resize|enter|type|increase|replace)\\w*" + GAP(45) + "\\b25\\b"] },
            ],
            sample: "In the modelling tree I would select the sketch of the hole, then edit the circle and change its diameter from 20 to 25. The plate then rebuilds with the bigger hole.",
            model: "<ul><li>Select the hole's sketch/feature in the modelling tree (1)</li><li>Change the diameter to 25 and the model rebuilds (1)</li></ul><p>Remodelling the plate from scratch earned no marks in the 2024 marking instructions.</p>" },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Explain why the production drawing made earlier from this model shows the larger hole too.",
            points: [
              { desc: "Cause: the drawing is associative (linked to the model file, not a separate copy)", any: ["associative\\W+(?:\\w+\\W+){0,6}(?:linked|link|connected|model|file)", "(?:linked|connected|attached|tied)\\s+(?:\\w+\\s+){0,2}(?:to|with)\\s+(?:\\w+\\s+){0,2}(?:model|file|3d)", "not\\s+(?:just\\s+)?(?:a\\s+)?(?:separate|copy|copies)", "(?:is|are)\\s+(?:a\\s+)?references?\\s+(?:to|of)", "(?:depends?|dependent)\\s+on\\s+(?:the\\s+)?model", "same (?:model )?file"],
                not: ["not\\s+associative", "isn't\\s+associative", "non.?associative", "(?:is|are)\\s+a\\s+(?:separate\\s+)?copy"] },
              { desc: "Effect: the views and dimensions update/rebuild automatically, without being redrawn", any: ["(?:update|rebuild|regenerat|redraw|recalculat|refresh|reflect|follow)\\w*\\W+(?:\\w+\\W+){0,4}(?:automatic\\w*|without|instantly|straight away|itself|at once|by itself|on its own)", "(?:automatic\\w*|instantly|straight away)\\W+(?:\\w+\\W+){0,2}(?:update|rebuild|regenerat|redraw|recalculat|refresh|reflect|follow)"] },
            ],
            sample: "The drawing is associative, which means it is linked to the model file and is not a separate copy. So when the model is changed, the drawing updates automatically without anyone having to redraw it.",
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
            sample: "Centre axis the pin with the holes in both cheek plates. Centre axis the hole in the pulley with the pin. Then offset the face of the pulley from the face of the cheek plate by 1.5, to give the clearance. Last, mate the underside of the pin's head with the outside face of the cheek plate.",
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
                "(?:neutral|common|universal|international|standard)\\W+(?:\\w+\\W+){0,3}(?:format|file)" + GAP(60) + "(?:any|all|every|most|many|different|other|various)",
                "(?:open|read|import|use|support|work)\\w*\\W+(?:\\w+\\W+){0,4}(?:any|all|every|most|many|different|other|various)\\W+(?:\\w+\\W+){0,2}(?:cad|package|software|program|system|application)",
                "(?:any|all|every|most|many|different|other|various)\\W+(?:\\w+\\W+){0,2}(?:cad\\W+)?(?:package|software|program|system|application)s?\\W+(?:\\w+\\W+){0,3}(?:open|read|import|use|support|work)"] },
              { desc: "Effect: the supplier can open and use the model in their own (different) software", any: [
                "(?:open|use|read|import|view|work with|access|edit)\\w*" + GAP(40) + "(?:different|other|own|another|whichever|whatever)\\W+(?:cad\\W+)?(?:package|software|program|system|application)",
                "(?:different|other|own|another|their)\\W+(?:cad\\W+)?(?:package|software|program|system|application)" + GAP(40) + "(?:open|use|read|import|view|work)"] },
            ],
            sample: "STEP is a neutral format that most CAD packages can import, so the supplier is able to open and use the winch model in their own software even though it is different from the one the shipyard uses.",
            model: "<ul><li>Cause: STEP is a neutral (common) format that any CAD package can open (1)</li><li>Effect: so the supplier can open and use the model in a different package from the shipyard's (1)</li></ul><p>\"It is a common format\" alone is too vague to earn the cause: say that any package can open it. The price of a neutral file is that the modelling tree is normally lost.</p>" },
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
                "\\b(?:light|lights|lighting)(?:\\s+sources?)?\\s+(?:\\w+\\s+){0,4}(?:above|beside|side|top|left|right|angle|direction|position|placed|from)",
                "(?:place|position|put|move|angle|set)\\w*\\W+(?:\\w+\\W+){0,4}\\blights?\\b",
                "\\blight\\w*\\W+(?:\\w+\\W+){0,6}(?:highlights?|shad(?:e|ing|ows?))"] },
              { desc: "Materials: giving the bin a plastic or metal finish (colour, shine or texture)", any: [
                "material\\w*\\W+(?:\\w+\\W+){0,2}(?:plastic|metal|steel|colou?r|shin\\w*|glossy|matt|texture|rough|paint|finish)",
                "(?:plastic|metal|steel|glossy|matt|rubber|shiny)\\s+(?:\\w+\\s+)?material",
                "(?:give|apply|add|assign|use|set)\\w*\\W+(?:\\w+\\W+){0,2}(?:material|texture|colou?r|finish)"] },
              { desc: "Reflections: the shiny bin mirrors the floor and walls around it", any: [
                "reflect\\w*" + GAP(50) + "(?:floor|wall|surround|surface|environment|mirror|shin|metal|scene)",
                "(?:shin\\w*|metal|glossy|polished)" + GAP(40) + "reflect"] },
              { desc: "Shade/shadow: a cast shadow on the floor under the bin showing it rests there", any: [
                "cast\\w*\\W+(?:a\\W+)?shadow", "shadow\\w*" + GAP(30) + "(?:floor|ground|under|beneath)", "(?:floor|ground|under|beneath)" + GAP(30) + "shadow"] },
              { desc: "Sited environment: a setting such as a room or quayside around the bin", any: [
                "(?:environment|setting|room|background|surroundings|context)" + GAP(40) + "(?:place|put|add|surround|inside|within|around)",
                "(?:place|put|add|surround|inside|within|around)\\w*" + GAP(40) + "(?:environment|setting|room|background|surroundings|context)"] },
            ],
            sample: "A light source could be placed above and to one side of the bin, so it has a bright highlight on top and shade on the far side. The bin could also be given a plastic material with a colour and a little shine, so it looks like a real bin and not a flat shape.",
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
                "(?:change|edit|alter|amend|modify|adjust|resize|update)\\w*" + GAP(40) + "(?:dimension|size|value|model|design|hull)" + GAP(60) + "(?:automatic|quick|fast|instant|straight away|rebuild|update|without (?:re)?draw|saves? time)",
                "(?:changes?|edits?|modifications?|alterations?)\\W+(?:\\w+\\W+){0,4}(?:quick\\w*|fast\\w*|easil\\w*|automatic\\w*|instant\\w*)"] },
              { desc: "Many views (orthographic, sectional, pictorial, renders) come from one model", any: [
                "(?:one|single|same)\\W+(?:3d\\W+)?model\\W+(?:\\w+\\W+){0,8}(?:views?|drawings?|sections?|renders?|pictorials?)",
                "(?:views?|drawings?|sections?|renders?|pictorials?)\\W+(?:\\w+\\W+){0,8}(?:from|of|made from|taken from|produced from|generated from)\\W+(?:\\w+\\W+){0,3}(?:one|single|same|the)\\W+(?:3d\\W+)?model"] },
              { desc: "Parts can be checked for fit or interference before anything is built", any: [
                "(?:fit|interfer\\w*|clash\\w*|collision|overlap|check\\w*|test\\w*)\\W+(?:\\w+\\W+){0,8}(?:before|prior to|without)\\W+(?:\\w+\\W+){0,3}(?:built|made|manufactur\\w*|build\\w*|cut|construct\\w*|prototype|physical)"] },
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
            sample: "On the XY plane I sketch a 90 by 60 rectangle and extrude it 50. I add a fillet of radius 5 to the four vertical edges. Then I shell it with a wall thickness of 3, removing the bottom face. On the front face I sketch a circle of diameter 30 in the centre, and a circle of diameter 4 on a PCD of 44 round it. I radial array the small circle six times, 60 degrees apart, about the centre of the opening. Then I extrude subtract all the circles through the front wall.",
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
              { desc: "Geometry: STEP holds an accurate solid, whereas 3DS is a polygon mesh of small flat facets", any: cmp("solids?|accurate|precise|exact|true", "mesh\\w*|polygons?|facets?|triangles?") },
              { desc: "Purpose: STEP is for engineering and exchange between CAD packages, whereas 3DS is for rendering, animation and games", any: cmp("engineering|exchange|manufactur\\w*|supplier|any cad|other cad|different cad|cad packages?|neutral", "render\\w*|animat\\w*|visuali[sz]\\w*|games?|studio|film") },
              { desc: "Extra data: 3DS carries materials, textures or lights, whereas STEP brings in only the finished shape", any: cmp("only (?:has |have |holds? |contains? |includes? |carries |brings? (?:in )?|keeps? |stores? |gives? )?(?:the )?(?:finished |final )?(?:shape|geometry|solid)|just (?:the )?(?:finished )?shape|just (?:the )?(?:finished )?shape|finished shape|no (?:materials?|textures?)|without (?:materials?|textures?)|(?:tree|sketch\\w*|constraints?) (?:is |are )?lost", "materials?|textures?|lights?|cameras?") },
            ],
            sample: "A STEP file holds an accurate solid model, whereas a 3DS file is a polygon mesh made of many small flat facets. STEP is used to send models to any CAD package for engineering, while 3DS is used for rendering, animation and games. A 3DS file also carries materials, textures and lights, but a STEP file brings in only the finished shape.",
            model: "<ul><li>Geometry: STEP is an accurate solid, 3DS a polygon mesh of flat facets (1)</li><li>Purpose: STEP exchanges accurate models between CAD packages for engineering and manufacture, 3DS is for visualisation, rendering, animation and games (1)</li><li>Extra data: 3DS carries materials, textures, lights and cameras, STEP only the finished shape (the modelling tree is lost) (1)</li></ul><p>Any 3 points. A compare answer needs both sides of each point: \"3DS is a mesh\" on its own is half a point, and describing only one file earns nothing for the comparison.</p>" },
        ],
      },
    ],
  };
})();
