/* Past-paper practice: Interpretation of graphic items. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HGP_BANK = window.HGP_BANK || {});

  /* ---- small SVG helpers (palette only; fonts inherit) ---- */
  const INK = "#1d1a14", PAPER = "#fffaf0", GREY = "#cbbd9b", MAG = "#d4147a";
  const SH1 = "rgba(203,189,155,.45)", SH2 = "rgba(203,189,155,.8)", TINT = "rgba(212,20,122,.14)";
  const sty = (w, fill, dash) => `fill="${fill || "none"}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}`;
  const THICK = (f) => sty(2.4, f), THIN = (f) => sty(1.1, f), DASH = sty(1.2, "none", "6 3"), CHAIN = sty(1.1, "none", "14 3 2 3");
  const n1 = (v) => +v.toFixed(1);
  const P = (d, s) => `<path d="${d}" ${s}/>`;
  const poly = (pts, s) => P("M" + pts.map((p) => n1(p[0]) + " " + n1(p[1])).join(" L") + " Z", s);
  const ln = (x1, y1, x2, y2, s) => `<line x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}" ${s || THIN()}/>`;
  const rect = (x, y, w, h, s) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${s}/>`;
  const circ = (x, y, r, s) => `<circle cx="${n1(x)}" cy="${n1(y)}" r="${r}" ${s}/>`;
  const T = (x, y, s, o) => { o = o || {}; return `<text x="${n1(x)}" y="${n1(y)}" font-size="${o.size || 12}" fill="${INK}" text-anchor="${o.a || "middle"}"${o.b ? ' font-weight="700"' : ""}>${s}</text>`; };
  const head = (x, y, ux, uy) => { const px = -uy, py = ux; return `<path d="M${n1(x)} ${n1(y)} L${n1(x - ux * 8 + px * 3)} ${n1(y - uy * 8 + py * 3)} L${n1(x - ux * 8 - px * 3)} ${n1(y - uy * 8 - py * 3)} Z" fill="${INK}"/>`; };
  /* dimension line with arrowheads at both ends */
  const dim = (x1, y1, x2, y2, label, lx, ly) => {
    const d = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / d, uy = (y2 - y1) / d;
    return ln(x1, y1, x2, y2) + head(x1, y1, -ux, -uy) + head(x2, y2, ux, uy) + T(lx, ly, label);
  };
  /* leader line with a single arrowhead on the feature end */
  const leader = (x1, y1, x2, y2) => { const d = Math.hypot(x2 - x1, y2 - y1); return ln(x1, y1, x2, y2) + head(x2, y2, (x2 - x1) / d, (y2 - y1) / d); };
  const mark = (x, y, l) => circ(x, y, 10, THIN(PAPER)) + T(x, y + 4.5, l, { b: 1 });
  const svg = (w, h, label, body) => `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${body}</svg>`;
  const mi = (...pts) => "<ul>" + pts.map((p) => `<li>${p}</li>`).join("") + "</ul>";

  /* ---- Q01: four pictorial methods ---- */
  const fig01 = (() => {
    let o = "";
    // A: isometric, s = 40
    { const ox = 62, oy = 112, k = 0.866 * 40, h = 20, z = 40;
      o += poly([[ox, oy], [ox - k, oy - h], [ox - k, oy - h - z], [ox, oy - z]], THICK(SH1));
      o += poly([[ox, oy], [ox + k, oy - h], [ox + k, oy - h - z], [ox, oy - z]], THICK(SH2));
      o += poly([[ox, oy - z], [ox + k, oy - h - z], [ox, oy - 2 * h - z], [ox - k, oy - h - z]], THICK(PAPER));
      o += `<ellipse cx="${ox}" cy="${oy - z - h}" rx="13.4" ry="7.8" ${THICK()}/>`; }
    // B: cabinet oblique, front 44, receding half length at 45 degrees
    { const x0 = 140, y0 = 112, f = 44, d = 15.6;
      o += poly([[x0 + f, y0], [x0 + f + d, y0 - d], [x0 + f + d, y0 - f - d], [x0 + f, y0 - f]], THICK(SH2));
      o += poly([[x0, y0 - f], [x0 + d, y0 - f - d], [x0 + f + d, y0 - f - d], [x0 + f, y0 - f]], THICK(SH1));
      o += rect(x0, y0 - f, f, f, THICK(PAPER));
      o += circ(x0 + f / 2, y0 - f / 2, 12, THICK()); }
    // C: planometric 45/45 : plan true shape, verticals vertical
    { const ox = 282, oy = 112, a = 25.5, hh = 36;
      o += poly([[ox, oy], [ox - a, oy - a], [ox - a, oy - a - hh], [ox, oy - hh]], THICK(SH1));
      o += poly([[ox, oy], [ox + a, oy - a], [ox + a, oy - a - hh], [ox, oy - hh]], THICK(SH2));
      o += poly([[ox, oy - hh], [ox + a, oy - a - hh], [ox, oy - 2 * a - hh], [ox - a, oy - a - hh]], THICK(PAPER));
      o += circ(ox, oy - a - hh, 12, THICK()); }
    // D: two-point perspective, horizon above the block
    { const ox = 395, oy = 112;
      const pts = (a) => a.map((p) => [ox + p[0], oy + p[1]]);
      o += ln(ox - 52, oy - 90, ox + 52, oy - 90, DASH) + T(ox - 40, oy - 94, "HL", { size: 11 });
      o += poly(pts([[0, 0], [-45, -33.75], [-45, -65], [0, -50]]), THICK(SH1));
      o += poly(pts([[0, 0], [35, -26.25], [35, -61.67], [0, -50]]), THICK(SH2));
      o += poly(pts([[0, -50], [-45, -65], [-11.2, -70.1], [35, -61.67]]), THICK(PAPER)); }
    o += mark(62, 138, "A") + mark(172, 138, "B") + mark(282, 138, "C") + mark(395, 138, "D");
    return svg(460, 152, "Four pictorial drawings of a small block, labelled A to D. A is drawn with three equal axes and a circle on its top face seen as an ellipse. B has a true-shape square front face with a true circle on it and shorter lines receding up and to the right. C shows a square top face turned on its corner with a true circle on it and vertical edges. D has converging edges below a horizon line.", o);
  })();

  /* ---- Q02: orthographic views of a stepped block with a drilled hole ---- */
  const fig02 = (() => {
    let o = "";
    // plan (top), elevation (below), end elevation (right): third angle, 2 px per mm
    o += rect(30, 60, 160, 80, THICK(PAPER)) + ln(110, 60, 110, 140, THICK());
    o += circ(150, 100, 16, THICK()) + ln(150, 52, 150, 148, CHAIN) + ln(126, 100, 174, 100, CHAIN);
    o += P("M30 250 H190 V220 H110 V170 H30 Z", THICK(PAPER)) + ln(134, 220, 134, 250, DASH) + ln(166, 220, 166, 250, DASH) + ln(150, 212, 150, 258, CHAIN);
    o += rect(230, 170, 80, 80, THICK(PAPER)) + ln(230, 220, 310, 220, THICK()) + ln(254, 220, 254, 250, DASH) + ln(286, 220, 286, 250, DASH) + ln(270, 212, 270, 258, CHAIN);
    // dimensions
    o += ln(30, 56, 30, 40) + ln(150, 56, 150, 40) + dim(30, 44, 150, 44, "60", 90, 40);
    o += ln(30, 254, 30, 284) + ln(190, 254, 190, 284) + dim(30, 280, 190, 280, "80", 110, 276);
    o += ln(26, 170, 10, 170) + ln(26, 250, 10, 250) + dim(14, 170, 14, 250, "40", 24, 214).replace(/text-anchor="middle"/, 'text-anchor="middle" transform="rotate(-90 24 214)"');
    o += ln(314, 220, 336, 220) + ln(314, 250, 336, 250) + dim(332, 220, 332, 250, "15", 344, 239, 0);
    o += ln(230, 254, 230, 284) + ln(310, 254, 310, 284) + dim(230, 280, 310, 280, "40", 270, 276);
    o += leader(236, 74, 161.3, 88.7) + T(240, 78, "Ø16", { a: "start" });
    o += T(118, 72, "K", { a: "start", b: 1 }) + ln(116, 66, 111, 66, THIN());
    o += mark(190, 24, "P") + mark(110, 306, "Q") + mark(270, 306, "R");
    return svg(460, 322, "Three third-angle views of a block with a drilled hole. View P, the top view, is a rectangle 80 by 40 with a solid line K across it 40 from the left end and a circle for the hole 60 from the left. View Q, below it, has a stepped outline 40 high at the left and 15 high at the right with two dashed lines for the hole. View R, to its right, is a 40 by 40 square with a solid line at 15 high and two dashed hole lines.", o);
  })();

  /* ---- Q03: isometric block with a slot, and candidate views ---- */
  const fig03 = (() => {
    const ox = 100, oy = 175, s = 1.9, k = 0.866 * s, h = 0.5 * s;
    const q = (x, y, z) => [ox + (x - y) * k, oy - (x + y) * h - z * s];
    const face = (a, f) => poly(a.map((p) => q(...p)), THICK(f));
    let o = "";
    // draw back to front
    o += face([[20, 0, 18], [40, 0, 18], [40, 40, 18], [20, 40, 18]], SH1);          // slot floor
    o += face([[40, 0, 18], [40, 40, 18], [40, 40, 30], [40, 0, 30]], SH1);          // slot wall facing viewer
    o += face([[40, 0, 30], [60, 0, 30], [60, 40, 30], [40, 40, 30]], PAPER);        // right piece top
    o += face([[0, 0, 0], [20, 0, 0], [20, 0, 30], [0, 0, 30]], SH2);                // front left
    o += face([[0, 0, 30], [20, 0, 30], [20, 40, 30], [0, 40, 30]], PAPER);          // left piece top
    o += face([[0, 0, 0], [0, 40, 0], [0, 40, 30], [0, 0, 30]], SH1);                // left face
    o += face([[20, 0, 0], [60, 0, 0], [60, 0, 30], [40, 0, 30], [40, 0, 18], [20, 0, 18]], SH2); // front face, notched
    o += ln(...q(0, 0, 0), ...q(0, 0, 30), THICK());
    // arrow F
    const fc = q(30, 0, 15), ax = fc[0] + 0.866 * 52, ay = fc[1] + 0.5 * 52;
    o += leader(ax, ay, fc[0] + 0.866 * 8, fc[1] + 0.5 * 8) + mark(ax + 14, ay + 8, "F");
    // elevations (scale 1.2: 72 x 36)
    o += T(250, 22, "Elevations, looking in direction F", { a: "start", b: 1 });
    o += rect(250, 34, 72, 36, THICK(PAPER)) + ln(274, 34, 274, 70, DASH) + ln(298, 34, 298, 70, DASH) + mark(286, 90, "A");
    o += P("M350 34 H374 V48.4 H398 V34 H422 V70 H350 Z", THICK(PAPER)) + mark(386, 90, "B");
    o += P("M250 118 H322 V154 H298 V139.6 H274 V154 H250 Z", THICK(PAPER)) + mark(286, 174, "C");
    o += P("M350 132.4 H374 V118 H422 V154 H350 Z", THICK(PAPER)) + mark(386, 174, "D");
    // plans (72 x 48)
    o += T(20, 222, "Plans, looking down", { a: "start", b: 1 });
    o += rect(20, 232, 72, 48, THICK(PAPER)) + ln(20, 256, 92, 256, THICK()) + ln(20, 268, 92, 268, THICK()) + mark(56, 298, "A");
    o += rect(130, 232, 72, 48, THICK(PAPER)) + ln(154, 232, 154, 280, DASH) + ln(178, 232, 178, 280, DASH) + mark(166, 298, "B");
    o += rect(240, 232, 72, 48, THICK(PAPER)) + ln(264, 232, 264, 280, THICK()) + ln(288, 232, 288, 280, THICK()) + mark(276, 298, "C");
    o += rect(350, 232, 72, 48, THICK(PAPER)) + circ(386, 256, 14, THICK()) + mark(386, 298, "D");
    return svg(460, 316, "A pictorial of a rectangular block with a slot running from front to back along the middle of its top face, an arrow F showing the front viewing direction, then four candidate elevations A to D and four candidate plans A to D to choose between.", o);
  })();

  /* ---- Q04: three components, plan above elevation ---- */
  const fig04 = (() => {
    let o = "";
    const cols = [120, 250, 380];
    // A: square pyramid
    { const cx = cols[0];
      o += rect(cx - 35, 40, 70, 70, THICK(PAPER)) + ln(cx - 35, 40, cx + 35, 110, THICK()) + ln(cx + 35, 40, cx - 35, 110, THICK());
      o += poly([[cx - 35, 210], [cx + 35, 210], [cx, 140]], THICK(PAPER)) + ln(cx, 132, cx, 218, CHAIN); }
    // B: frustum of a cone
    { const cx = cols[1];
      o += circ(cx, 75, 35, THICK(PAPER)) + circ(cx, 75, 18, THICK()) + ln(cx - 45, 75, cx + 45, 75, CHAIN) + ln(cx, 30, cx, 120, CHAIN);
      o += poly([[cx - 35, 210], [cx + 35, 210], [cx + 18, 140], [cx - 18, 140]], THICK(PAPER)) + ln(cx, 132, cx, 218, CHAIN); }
    // C: hexagonal prism
    { const cx = cols[2];
      o += poly([[cx + 35, 75], [cx + 17.5, 44.7], [cx - 17.5, 44.7], [cx - 35, 75], [cx - 17.5, 105.3], [cx + 17.5, 105.3]], THICK(PAPER));
      o += rect(cx - 35, 140, 70, 70, THICK(PAPER)) + ln(cx - 17.5, 140, cx - 17.5, 210, THICK()) + ln(cx + 17.5, 140, cx + 17.5, 210, THICK()); }
    o += T(6, 78, "Plan", { a: "start", size: 12 }) + T(6, 178, "Elevation", { a: "start", size: 12 });
    o += mark(cols[0], 16, "A") + mark(cols[1], 16, "B") + mark(cols[2], 16, "C");
    return svg(460, 226, "Plans above elevations of three components, A to C. A has a square plan with both diagonals and a triangular elevation. B has two concentric circles in plan and a flat-topped trapezium elevation. C has a hexagonal plan and a square elevation divided by two vertical lines.", o);
  })();

  /* ---- Q05: net of a cone ---- */
  const fig05 = (() => {
    const ax = 230, ay = 18, r = 140, a = Math.PI / 3;           // 120 degree sector, symmetrical about the vertical
    const ex = r * Math.sin(a), ey = r * Math.cos(a);
    let o = P(`M${ax} ${ay} L${n1(ax - ex)} ${n1(ay + ey)} A${r} ${r} 0 0 0 ${n1(ax + ex)} ${n1(ay + ey)} Z`, THICK(PAPER));
    o += P(`M${ax - 22} ${n1(ay + 22 * Math.tan(a))} A25 25 0 0 0 ${ax + 22} ${n1(ay + 22 * Math.tan(a))}`, THIN());
    o += T(ax, ay + 84, "120°", { size: 13 });
    o += T(ax - ex / 2 - 22, ay + ey / 2 - 8, "60", { size: 13 });
    return svg(460, 176, "A flat net shaped as a sector of a circle, 120 degrees at the top apex, with two straight edges each marked 60 and a curved edge along the bottom.", o);
  })();

  /* ---- Q06: net of a triangular prism ---- */
  const fig06 = (() => {
    const k = 1.5, x0 = 70, yT = 52, hgt = 70 * k;           // rectangles 30, 40, W wide; 70 long
    const w1 = 30 * k, w2 = 40 * k, w3 = 50 * k, yB = yT + hgt;
    let o = rect(x0, yT, w1 + w2 + w3, hgt, THICK(PAPER));
    o += poly([[x0 + w1, yT], [x0 + w1 + w2, yT], [x0 + w1, yT - 30 * k]], THICK(PAPER));
    o += poly([[x0 + w1, yB], [x0 + w1 + w2, yB], [x0 + w1, yB + 30 * k]], THICK(PAPER));
    const FOLD = sty(1.1, "none", "14 3 2 3 2 3");
    o += ln(x0 + w1, yT, x0 + w1, yB, FOLD) + ln(x0 + w1 + w2, yT, x0 + w1 + w2, yB, FOLD) + ln(x0 + w1, yT, x0 + w1 + w2, yT, FOLD) + ln(x0 + w1, yB, x0 + w1 + w2, yB, FOLD);
    o += T(x0 + w1 - 14, yT - 14 * k, "30", { size: 13, a: "end" });
    o += T(x0 - 8, yT + hgt / 2 + 4, "70", { size: 13, a: "end" });
    o += T(x0 + w1 / 2, yB - 8, "30", { size: 12 }) + T(x0 + w1 + w2 / 2, yB - 8, "40", { size: 12 }) + T(x0 + w1 + w2 + w3 / 2, yB - 8, "W", { size: 14, b: 1 });
    o += T(70, 244, "Not to scale. Dimensions in mm.", { size: 11, a: "start" });
    return svg(460, 252, "A flat net of a prism: a row of three rectangles each 70 long and 30, 40 and an unknown width W across, with a right-angled triangle with sides 30 and 40 attached above and a second one below the middle rectangle, joined along thin chain lines.", o);
  })();

  /* ---- Q07: sectional view of a bush and shaft in a housing ---- */
  const fig07 = (() => {
    const hatch = (id, ang) => `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(${ang})"><line x1="0" y1="0" x2="0" y2="6" stroke="${INK}" stroke-width="1"/></pattern>`;
    let o = `<defs>${hatch("q07h1", 45)}${hatch("q07h2", -45)}</defs>`;
    // plan
    o += rect(80, 20, 140, 140, THICK(PAPER)) + circ(150, 90, 30, THICK()) + circ(150, 90, 20, THICK());
    o += ln(150, 10, 150, 172, CHAIN);
    o += ln(56, 90, 76, 90, THICK()) + ln(224, 90, 244, 90, THICK()) + ln(76, 90, 224, 90, CHAIN);
    o += ln(66, 90, 66, 62, THICK()) + head(66, 58, 0, -1) + ln(234, 90, 234, 62, THICK()) + head(234, 58, 0, -1);
    o += T(66, 112, "A", { b: 1, size: 14 }) + T(234, 112, "A", { b: 1, size: 14 });
    // section A-A
    o += rect(80, 205, 40, 80, sty(2.4, "url(#q07h1)")) + rect(180, 205, 40, 80, sty(2.4, "url(#q07h1)"));
    o += rect(120, 205, 10, 80, sty(2.4, "url(#q07h2)")) + rect(170, 205, 10, 80, sty(2.4, "url(#q07h2)"));
    o += rect(130, 181, 40, 128, THICK()) + ln(150, 172, 150, 318, CHAIN);
    o += T(150, 330, "SECTION A–A", { b: 1 });
    // parts list
    o += rect(250, 24, 204, 78, THIN(PAPER)) + T(260, 46, "Item 1  Housing", { a: "start" }) + T(260, 68, "Item 2  Bush: Ø30 outside, Ø20 bore", { a: "start", size: 11 }) + T(260, 90, "Item 3  Shaft: Ø20", { a: "start" });
    // balloons
    o += circ(205, 235, 2, `fill="${INK}"`) + ln(205, 235, 245, 235) + mark(255, 235, "1");
    o += circ(175, 262, 2, `fill="${INK}"`) + ln(175, 262, 245, 262) + mark(255, 262, "2");
    o += circ(165, 298, 2, `fill="${INK}"`) + ln(165, 298, 245, 298) + mark(255, 298, "3");
    return svg(460, 340, "A plan view above a sectional view A to A of a shaft running through a bush in a square housing. The plan shows a square, a ring and a circle with a cutting plane line across the middle and arrows pointing up. The section shows hatched housing and bush areas, with the shaft left unhatched, and numbered balloons 1 to 3.", o);
  })();

  /* ---- Q08: site plan with symbols ---- */
  const fig08 = (() => {
    let o = rect(20, 20, 310, 290, sty(1.4, "none", "10 4"));
    o += P("M20 52 C100 40 220 62 330 46", THIN()) + P("M20 214 C100 202 220 224 330 208", THIN()) + P("M20 268 C100 258 220 278 330 264", THIN());
    o += T(326, 40, "20", { size: 11, a: "end" }) + T(326, 202, "15", { size: 11, a: "end" }) + T(326, 258, "10", { size: 11, a: "end" });
    o += rect(110, 110, 120, 60, THICK(SH1)) + T(170, 145, "Boathouse", { size: 13 });
    o += ln(110, 100, 110, 76) + ln(230, 100, 230, 76) + dim(110, 80, 230, 80, "48 mm on the drawing", 170, 72);
    // A existing tree: circle with a dot
    o += circ(60, 110, 14, THICK()) + circ(54, 104, 2, `fill="${INK}"`) + mark(92, 110, "A");
    // B existing tree to be removed: dotted circle with a dot
    o += circ(60, 240, 14, sty(1.8, "none", "2 3.5")) + circ(65, 235, 2, `fill="${INK}"`) + mark(92, 240, "B");
    // C proposed tree: circle with a plus
    o += circ(284, 240, 14, THICK()) + ln(284, 231, 284, 249) + ln(275, 240, 293, 240) + mark(250, 240, "C");
    // D north point: circle with an upward arrow
    o += circ(284, 112, 15, THICK()) + ln(284, 124, 284, 101) + P("M284 99 L276 111 M284 99 L292 111", THICK()) + mark(250, 112, "D");
    o += T(345, 40, "Scale 1:200", { a: "start", b: 1 });
    o += T(345, 66, "Lines 10, 15", { a: "start", size: 11 }) + T(345, 82, "and 20 are", { a: "start", size: 11 }) + T(345, 98, "ground heights", { a: "start", size: 11 }) + T(345, 114, "in metres.", { a: "start", size: 11 });
    return svg(460, 326, "A site plan at scale 1 to 200 with a dashed plot boundary, a boathouse rectangle with a dimension of 48 millimetres on the drawing, three contour lines marked 10, 15 and 20, and four symbols labelled A to D: a circle with a dot, a dotted circle with a dot, a circle with a plus sign and a circle with an upward arrow.", o);
  })();

  /* ---- Q10: flange, plan and elevation ---- */
  const fig10 = (() => {
    const cx = 150, cy = 120, r45 = 49.5;
    let o = circ(cx, cy, 90, THICK(PAPER)) + circ(cx, cy, 30, THICK()) + circ(cx, cy, 70, CHAIN);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach((s) => { o += circ(cx + s[0] * r45, cy + s[1] * r45, 10, THICK()); });
    o += ln(cx - 100, cy, cx + 100, cy, CHAIN) + ln(cx, cy - 100, cx, cy + 100, CHAIN);
    // elevation
    o += rect(60, 240, 180, 24, THICK(PAPER)) + ln(120, 240, 120, 264, DASH) + ln(180, 240, 180, 264, DASH);
    [-r45, r45].forEach((d) => { o += ln(cx + d - 10, 240, cx + d - 10, 264, DASH) + ln(cx + d + 10, 240, cx + d + 10, 264, DASH) + ln(cx + d, 234, cx + d, 270, CHAIN); });
    o += ln(cx, 232, cx, 272, CHAIN);
    // notes
    o += leader(266, 52, 227.9, 75) + T(268, 56, "Ø90", { a: "start" });
    o += leader(266, 150, 178.2, 130.3) + T(268, 148, "Ø30 +0.2 / −0.1", { a: "start" });
    o += leader(262, 192, 209, 173) + T(264, 196, "4 holes Ø10", { a: "start" }) + T(264, 212, "on PCD 70", { a: "start" });
    return svg(460, 290, "A circular flange with its plan above its elevation. The plan shows an outer circle labelled diameter 90, a central bore labelled diameter 30 plus 0.2 minus 0.1, and four holes of diameter 10 centred on a thin chain circle labelled PCD 70. The elevation below shows the disc with the bore and holes as dashed lines.", o);
  })();

  const W3 = "(?:\\W+\\w+){0,3}\\W+"; /* up to three words between two patterns */
  const W5 = "(?:\\W+\\w+){0,5}\\W+", W7 = "(?:\\W+\\w+){0,7}\\W+";
  /* word lists for the north-point marking point (interp-08 b) */
  const SUNX2 = "sun|sunlight|sunshine|daylight|shade|shadows?|wind|winds|weather|solar|light";
  const ROOMX = "windows?|rooms?|buildings?|houses?|boathouse|entrance|garden|layout|living areas?|doors?";

  B.interp = {
    intro: "Interpretation of graphic items is the biggest swing area of the paper (12 to 30 of the 90 marks). This bank has eleven questions worth 56 marks: naming pictorial and orthographic views, reading sizes and lines from third-angle views, matching views to a pictorial, recognising forms and nets, reading a section, a site plan and a dimensioned flange, explaining why a drawing type suits a job, and comparing two pictorial methods. Most have a drawing: read it, trace features between views, and give cause and effect when asked to explain.",
    questions: [
      {
        id: "interp-01",
        style: "Short-answer question · identify the pictorial method",
        stem: "<p>A designer has drawn a small block four different ways, A to D. In drawings A, B and C a circle is marked on one face. The lines going back in B are drawn at half length.</p>",
        figure: fig01,
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: "Match each drawing to the pictorial method used to draw it.",
            pairs: [["Drawing A", "Isometric"], ["Drawing B", "Cabinet oblique"], ["Drawing C", "Planometric"], ["Drawing D", "Two-point perspective"]],
          },
        ],
      },
      {
        id: "interp-02",
        style: "Scenario question · name, calculate, explain and state",
        stem: "<p>A machinist is given the drawing below of a machined block with a drilled hole. The three views are in third-angle projection. Sizes are in mm and the drawing is not to scale.</p>",
        figure: fig02,
        parts: [
          {
            label: "(a)", type: "match", marks: 3,
            q: "Name the views P, Q and R.",
            pairs: [["View P", "Plan"], ["View Q", "Elevation"], ["View R", "End elevation"]],
          },
          {
            label: "(b)", type: "num", marks: 1, a: 12, tol: 0, unit: "mm",
            q: "Calculate the shortest distance from the edge of the hole to the right-hand end of the block.",
            why: "The hole's centre is 60 from the left end of the 80 mm block, so it is 80 − 60 = 20 from the right-hand end. The hole is Ø16, so its edge is 8 closer: 20 − 8 = 12 mm. A dimension is the real size whatever the scale.",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 3,
            q: "Explain why the hole in the block is drawn differently in view Q from the way it is drawn in view P.",
            points: [
              { desc: "Cause: the hole is inside the material, so it cannot be seen from the front", any: ["(cannot|can'?t|can not|couldn'?t|not|isn'?t|aren'?t|unable to|won'?t) (be )?(see|seen|visible)", "hidden (from|by|behind|inside|within|under|beneath)", "out of (sight|view)", "(inside|within|behind|under|beneath) (the|a|its) (block|material|metal|front|surface|part|object)"] },
              { desc: "Effect: it is drawn as thin dashed lines (hidden detail)", any: ["dash(ed|es)? (thin )?(lines?|detail)", "(thin|broken) dash", "hidden (detail|lines?)", "broken lines?", "(drawn|shown|represented|appears?|are|is|as) (as |with |by |using )?(a |some )?(thin )?dash(ed|es)"] },
            ],
            sample: "In view Q the hole is inside the block and cannot be seen from the front, so its edges are drawn as thin dashed lines (hidden detail) to show that they are there. In view P you look straight down into it.",
            model: mi("The hole is inside the material / behind the front face, so it cannot be seen from the front (cause) (1)", "…so its edges are shown as hidden detail, thin dashed lines (effect) (1)") + "<p>Seen from above in view P the hole is a visible circle, so it is drawn in thick outline.</p>",
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 3,
            q: "State what the solid line K in view P represents and how the same feature appears in view R.",
            points: [
              { desc: "K is the edge where the taller part meets the lower part: a change in height", win: 60, any: ["change (in|of) (the )?(height|level)", "step (in|down|up|between|change)", "(a|the) step\\b", "(two|different) (heights|levels)", "(where|when) the (taller|higher|upper|raised|bigger|thicker).{0,35}(meets?|joins?|ends?|drops?|steps?)", "(meets?|joins?) the (top of the )?(lower|shorter|thinner|smaller)", "(taller|higher|upper|raised) (part|section|level|block) (and|meets?|joins?|to) (the )?(lower|shorter)"] },
              { desc: "In R it is a solid horizontal line 15 mm up from the base", win: 50, any: ["(solid|thick|continuous|horizontal) (solid |thick |horizontal )?line.{0,40}\\b15\\b", "\\b15 ?(mm)? (high|up|above|from the (bottom|base)).{0,30}\\bline", "\\bline.{0,25}\\b15 ?(mm)? (high|up|above|from|off)", "\\b15 ?(mm)? (high|up|above|from the (bottom|base)).{0,40}(solid|thick|horizontal|continuous)"] },
            ],
            sample: "Line K is the edge where the taller part of the block meets the top of the lower part, so it marks a change in height. In view R the same edge is a solid horizontal line 15 mm above the base.",
            model: mi("K is the edge where the higher part of the block meets the top of the lower step: a change in height (1)", "In view R it is the solid horizontal line 15 mm above the bottom edge (1)") + "<p>A face that is seen edge-on, or an edge where surfaces meet, is a line; the same edge must line up between the views.</p>",
          },
        ],
      },
      {
        id: "interp-03",
        style: "Scenario question · match views to a pictorial",
        stem: "<p>A pictorial drawing of a rectangular block is shown. It is 60 long, 40 deep and 30 high. A slot 20 wide and 12 deep runs from the front of the block to the back, centred in the length. Arrow F shows the direction from which the front elevation is viewed. Candidate elevations and plans, A to D, are shown beside it.</p>",
        figure: fig03,
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "Which elevation, viewed in direction F, is correct?", opts: ["Elevation A", "Elevation B", "Elevation C", "Elevation D"], a: 1, why: "Looking along the slot you see its end as a notch cut into the top edge, 20 wide and 12 deep, in the middle. A hides the notch behind dashed lines, C puts it in the bottom edge, and D puts it at the left end." },
          { label: "(b)", type: "mcq", marks: 1, q: "Which plan is correct?", opts: ["Plan A", "Plan B", "Plan C", "Plan D"], a: 2, why: "From above the slot's two top edges are visible, so they are drawn as solid lines running front to back (up the page). A has them running left to right, B draws them dashed as if hidden, and D shows a circle, which is a hole." },
          { label: "(c)", type: "num", marks: 1, a: 18, tol: 0, unit: "mm", q: "Calculate the height of the floor of the slot above the bottom of the block.", why: "The block is 30 high and the slot is 12 deep: 30 − 12 = 18 mm." },
          {
            label: "(d)", type: "text", marks: 2, rows: 3,
            q: "Describe how the slot would appear in the end elevation viewed from the right.",
            points: [
              { desc: "The outline is a plain rectangle (40 wide, 30 high): no notch", any: ["(no|without|not (a|any)) (a )?(notch|cut|gap|step|dip)", "(plain|simple|complete|full|solid|whole|ordinary) rectangle", "(just|only|simply) a rectangle", "outline (is|looks like|would be) (a )?(rectangle|square)"] },
              { desc: "The slot floor is a thin dashed (hidden detail) line across the view, 12 mm below the top (18 mm above the base)", win: 60, any: ["(dash(ed|es)?|hidden) (thin |detail |lines? )*(line|detail).{0,50}(across|floor|12|18|slot)", "(across|floor|\\b12|\\b18).{0,50}(dash(ed|es)?|hidden) (thin |detail |lines? )*(line|detail)", "(floor|bottom) of the slot.{0,40}(dash|hidden)", "(dash(ed|es)?|hidden).{0,40}(floor|bottom) of the slot"] },
            ],
            sample: "The end elevation is a plain rectangle 40 wide and 30 high with no notch. A thin dashed hidden detail line runs right across it, 12 mm below the top, to show the floor of the slot.",
            model: mi("The outline is a plain rectangle, 40 wide by 30 high, as the slot runs through to both ends (1)", "The slot is hidden inside the block from this side, so its floor is a thin dashed line (hidden detail) running across the view, 12 below the top / 18 above the base (1)"),
          },
        ],
      },
      {
        id: "interp-04",
        style: "Short-answer question · identify forms and explain a view",
        stem: "<p>The plan and elevation of three components, A to C, are shown in third-angle projection. Each is made from a single geometric form.</p>",
        figure: fig04,
        parts: [
          {
            label: "(a)", type: "match", marks: 3,
            q: "Match each component to the geometric form it is.",
            pairs: [["Component A", "Square pyramid"], ["Component B", "Frustum of a cone"], ["Component C", "Hexagonal prism"]],
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 3,
            q: "Explain why the plan of component B shows two circles, one inside the other.",
            points: [
              { desc: "Cause: the cone has been cut parallel to its base, so the top is a smaller circle", win: 60, any: ["cut (off )?(parallel|by a plane|across|flat|straight)", "parallel to (the|its) base", "(top|end|face|point|tip) (is|are|becomes?|has become|has been)( a| made)? (smaller|narrower|cut|chopped|sliced|removed|flat)", "(top|end|face) (circle )?(is|are) smaller", "narrower (at )?(the )?top", "(chopped|sliced|cut|removed|taken) (off )?(the )?(top|point|tip)", "(point|tip|top) (is |has been |was )?(cut|chopped|removed|sliced) off"] },
              { desc: "Effect: seen from above, the small top circle sits inside the larger base circle", win: 70, any: ["(from above|looking down|top view|seen from above|viewed from above|plan view|looking from above).{0,60}(inside|within|in the middle|centre|inner|concentric)", "(smaller|small|top) (circle|one).{0,30}(inside|within|in the middle|sits in|sits on)", "(inside|within|in the middle of) the (larger|bigger|big|large|base|lower|bottom|outer|wider)"] },
            ],
            sample: "The cone has been cut off parallel to its base, so the top is a smaller circle. Looking down from above you see this small circle sitting inside the larger circle of the base.",
            model: mi("The cone is cut by a plane parallel to its base, so the new top face is a smaller circle (cause) (1)", "…and seen from above the small top circle lies inside the larger base circle (effect) (1)") + "<p>This is why a frustum has a trapezium elevation and a two-circle plan.</p>",
          },
        ],
      },
      {
        id: "interp-05",
        style: "Scenario question · developments",
        stem: "<p>A speaking trumpet's cone is cut from flat sheet using the development (net) shown. The two straight edges are each 60 mm long and the angle between them is 120°.</p>",
        figure: fig05,
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "Which solid does this net fold up into?", opts: ["Cylinder", "Square pyramid", "Frustum of a cone", "Cone"], a: 3, why: "A single sector with every edge running to one point rolls into a cone. A frustum's net would have a smaller curve cut across the point, and a cylinder's net is a rectangle." },
          { label: "(b)", type: "num", marks: 1, a: 20, tol: 0, unit: "mm", q: "Calculate the radius of the base of the finished cone.", why: "Sector angle = 360° × r ÷ L, so r = L × angle ÷ 360 = 60 × 120 ÷ 360 = 20 mm." },
          {
            label: "(c)", type: "text", marks: 2, rows: 3,
            q: "Explain why the length of the curved edge of the net must equal the circumference of the cone's base.",
            points: [
              { desc: "Cause: when the sector is rolled up, the curved edge goes round to form the rim of the base", win: 70, any: ["(roll|curl|wrap|bend|fold)(ed|s|ing)? (it )?(up|round|around|into).{0,60}(rim|edge of the base|base|circle)", "curved edge.{0,40}(forms?|becomes?|goes round|wraps? round|makes?|is|goes around).{0,30}(base|rim|circle|circumference)", "(forms?|becomes?|makes?|is) the (rim|circumference|edge|outline|outside) of the (base|cone|circle)", "(goes|wraps|runs|curls) (right )?(round|around) the (base|bottom|rim|circle)"] },
              { desc: "Effect: otherwise the edges would overlap or leave a gap, so the cone would not close or fit its base", win: 70, all: ["(too|if it (was|were|is)) (long|short|big|small|loose)|(otherwise|or else|or there would|if (not|they (are|were) not|it (is|was) not))|(longer|shorter) than|longer or shorter|not (the same|equal)|(wrong|different) (length|size)", "(gap|overlap|(not|n'?t|never) (fit|close|meet|join|match|line up|reach))"] },
            ],
            sample: "When the net is rolled up, the curved edge wraps round to form the rim of the base. If it were longer or shorter than the circumference the edges would overlap or leave a gap and the cone would not close.",
            model: mi("Rolled up, the curved edge forms the rim (circumference) of the circular base (cause) (1)", "…so if it were too long or too short the edges would overlap or leave a gap and the cone would not close / fit its base (effect) (1)"),
          },
        ],
      },
      {
        id: "interp-06",
        style: "Short-answer question · nets and true lengths",
        stem: "<p>The development below is for a prism. Its end faces are right-angled triangles with sides of 30 mm and 40 mm at the right angle. The width of the longest rectangle is marked W.</p>",
        figure: fig06,
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "State the line type used for the thin lines where the faces join.", opts: ["Long dash, double dot, thin chain", "Long dash, dot, thin chain", "Dashed thin", "Continuous thin"], a: 0, why: "Fold lines on a development are thin long dash, double dot chain lines. The single dot is a centre line, dashed thin is hidden detail, and continuous thin is a projection or dimension line." },
          { label: "(b)", type: "num", marks: 1, a: 50, tol: 0, unit: "mm", q: "Calculate the width W of the longest rectangle.", why: "W is the long side of the triangle: √(30² + 40²) = √2500 = 50 mm." },
          {
            label: "(c)", type: "text", marks: 2, rows: 3,
            q: "Explain why every line on a development must be drawn at its true length.",
            points: [
              { desc: "Cause: the net is cut out and folded up / joined to make the solid", win: 60, any: ["cut out.{0,30}fold", "fold(ed|s|ing)? (it )?(up|into|to make|to form)", "(is|be|will be|are|gets?) (cut|folded|joined|glued|assembled|made up)", "made (up )?into", "(build|make|form|create)s? the (solid|prism|shape|3d|model|object)", "assembled", "joined (together|up)"] },
              { desc: "Effect: a shortened line would make a face too small so the edges would not meet or fit", win: 70, all: ["(too (short|small|long|big)|foreshorten|wrong (size|length)|(shorter|longer|smaller) than)", "(gap|overlap|(not|n'?t|never) (fit|close|meet|match|line up|join|reach))"] },
            ],
            sample: "The net is cut out and folded up into the solid, so a foreshortened line would be too short and the edges would not meet or fit together.",
            model: mi("The net is cut out and folded / joined to make the solid, so each edge must be its real size (cause) (1)", "…a foreshortened (too short) line would leave faces too small, so edges would not meet and the solid would not fit together (effect) (1)"),
          },
        ],
      },
      {
        id: "interp-07",
        style: "Scenario question · reading a sectional view",
        stem: "<p>A shaft runs in a bronze bush pressed into a square housing. The assembly is shown in plan, with a sectional view taken on cutting plane A–A. Sizes are in mm.</p>",
        figure: fig07,
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "The cutting plane passes through all three items. Which item is correctly left unhatched in the section?", opts: ["Item 1, the housing", "Item 3, the shaft", "Item 2, the bush", "None of them"], a: 1, why: "Shafts, bolts, pins and similar solid parts are not hatched when the cutting plane runs along their length. The housing and the bush are hatched." },
          {
            label: "(b)", type: "text", marks: 2, rows: 3,
            q: "Explain why the hatching on item 1 runs in the opposite direction to the hatching on item 2.",
            points: [
              { desc: "Cause: they are two different, touching parts", win: 60, any: ["(separate|different|two|adjacent|neighbouring|touching|next to each other) (parts|components|items|pieces|materials)", "(parts|components|items|pieces) (that |which )?(touch|are (next|side|joined|fitted|in contact))", "(touch|touching|meet|next to) (each other|one another|the other)"] },
              { desc: "Effect: the reader can tell them apart / see where one ends and the next begins", win: 60, any: ["tell (them|the parts?|the items?|the two|these|one) (apart|from)", "(distinguish|differentiate|separate)s? (between )?(the |them|these|one)", "(see|know|show|shows|find|tell)s? (clearly )?where (one|the one|item|part|the first).{0,25}(ends?|begins?|stops?|starts?)", "(boundary|boundaries|edge|line) between (the |them|item|part|two)", "(clear|obvious|easy|easier|helps?|shows?) (to see )?(which|where|that they are (different|separate))"] },
            ],
            sample: "They are two different parts that touch, so hatching them in opposite directions makes it clear where one part ends and the other begins, so the reader can tell them apart.",
            model: mi("Item 1 and item 2 are different parts that touch (cause) (1)", "…opposite hatching makes the boundary between them clear, so the reader can tell the parts apart (effect) (1)"),
          },
          {
            label: "(c)", type: "text", marks: 1, rows: 2, minWords: 2,
            q: "State what the arrows at the ends of the cutting plane line show.",
            points: [{ desc: "The direction of viewing (the way you look at the section)", any: ["direction (of|in which).{0,20}(view|look|sight|section)", "(viewing|view|looking|look) direction", "which way (to|you|the section|it is) (look|view|is viewed|is looked)", "direction (you|the viewer) (look|view)"] }],
            sample: "They show the direction of viewing.",
            model: mi("The direction of viewing, i.e. which way the section is looked at (1)"),
          },
          { label: "(d)", type: "num", marks: 1, a: 5, tol: 0, unit: "mm", q: "Calculate the wall thickness of the bush.", why: "The bush is Ø30 outside and Ø20 inside (the parts list). The difference, 30 − 20 = 10, is shared between two walls: 10 ÷ 2 = 5 mm. You can check it in the section, where each hatched bush strip is a quarter of the shaft's width." },
        ],
      },
      {
        id: "interp-08",
        style: "Scenario question · symbols and scale on a site plan",
        stem: "<p>The Plan Room's boathouse is to be built on the plot shown on the site plan below. Four symbols from the plan are labelled A to D. The plan is drawn to a scale of 1:200.</p>",
        figure: fig08,
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: "Match each symbol to its name.",
            pairs: [["Symbol A", "Existing tree"], ["Symbol B", "Existing tree to be removed"], ["Symbol C", "Proposed tree"], ["Symbol D", "North point"]],
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 3,
            q: "Explain why a site plan includes a north point.",
            points: [
              { desc: "Cause: it shows which way north is / which way the building and plot face", win: 60, not: ["way up", "upside", "\\bscale\\b", "measure", "front door"], any: ["which (way|direction) (is |the )?north", "where north (is|lies)", "direction (of|to) north", "(points?|pointing|facing|towards?) (to |towards? |at )?north", "north (is|lies|points?)", "orientat(e|ed|ion).{0,30}(north|plot|site|building|house|boathouse)", "which (way|direction|side) (of )?(the )?(building|plot|site|house|boathouse|it) (is )?(faces?|facing|points?)", "compass (direction|point)"] },
              { desc: "Effect: so the sun, light or weather can be allowed for when positioning windows, rooms or the building", win: 70, not: ["way up", "upside", "\\bscale\\b"], any: ["(" + ROOMX + ")\\W+(to |that |which |can |will |could |and )*(get|catch|receive|have|let in|benefit from|avoid|shelter from|face|take|use|make use of|maximi[sz]e|capture|are|is)\\w* (the |some |more |plenty of |enough |lots of |lots of )?(" + SUNX2 + ")", "(position|place|orient|design|put|build|locate|face|plan|arrange|point)\\w* (the |its |their |any |all )?(" + ROOMX + ")( \\w+){0,3} (to|so|for|away|towards?|facing|where)( \\w+){0,4} (" + SUNX2 + ")", "(" + ROOMX + ")( \\w+){0,4} (placed|positioned|orientated|oriented|built|located|put|designed|laid out|arranged|sited)( \\w+){0,3} (to|so|for|away|towards?|facing)( \\w+){0,4} (" + SUNX2 + ")", "(" + SUNX2 + ")( \\w+){0,4} (affect|hit|reach|shine|come|enter|strike|fall|blow|shelter)\\w*( \\w+){0,4} (" + ROOMX + ")", "(" + SUNX2 + ") (when|while|as|if) (positioning|placing|orientating|orienting|designing|planning|building)"] },
            ],
            sample: "It shows which way north is, so the reader knows which way the building faces. The architect can then place windows and rooms to get the sunlight.",
            model: mi("It shows which way north is, so the reader knows how the plot / building is orientated (cause) (1)", "…so the designer or builder can take account of sunlight, shade or wind when positioning rooms, windows or the building (effect) (1)"),
          },
          { label: "(c)", type: "num", marks: 1, a: 9.6, tol: 0.01, unit: "m", q: "The boathouse is 48 mm long on the original drawing. Calculate its real length in metres.", why: "At 1:200, real size = drawn size × 200 = 48 × 200 = 9600 mm. Convert to metres: 9600 ÷ 1000 = 9.6 m." },
        ],
      },
      {
        id: "interp-09",
        style: "Short-answer question · choosing the right drawing for the job",
        stem: "<p>The Plan Room produces several kinds of drawing for different readers and jobs: an exploded view, a sectional view and a planometric view.</p>",
        parts: [
          {
            label: "(a)", type: "match", marks: 3,
            q: "Match each job to the drawing that suits it best.",
            pairs: [
              ["Show the deck crew the order in which the parts of a pulley block go together", "Exploded view"],
              ["Show a machinist how a bush fits inside its housing", "Sectional view"],
              ["Show a client how furniture is arranged in a room, built up from the floor plan", "Planometric view"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 3,
            q: "Explain why a planometric view is suitable for showing the layout of furniture in a room.",
            points: [
              { desc: "Cause: the plan (floor) is drawn at its true shape, so it can be turned and the heights added upwards", win: 50, any: ["(plan|floor|room|layout).{0,40}(true shape|true size|not distorted|undistorted|same shape|unchanged)", "true shape (of|for) the (plan|floor|room|layout)", "(plan|floor|layout) (can be |is |gets |are |simply )?(turned|rotated|traced)", "(turn|rotate|trace)(d|s|ing)? the (plan|floor|layout|room)", "(floor|plan|layout) (is |stays |remains )?(not (stretched|changed|distorted))"] },
              { desc: "Effect: quick and easy to draw, with the positions and sizes of the furniture on the floor correct", win: 60, any: ["(quick|quickly|easy|easier|simple|simpler|fast|faster|straightforward|less work) (to |and )?(draw|construct|produce|create|do|plot|make|set up)", "(draw|draws|produce|construct|create|make|made|done)n? (it |them )?(quickly|easily|fast|faster|simply)", "furniture.{0,30}(correct|true|accurate|right|exact|proper|same) (positions?|places?|sizes?|distances?|spacing)", "(positions?|distances?|sizes?|layout|measurements?|spacing).{0,25}(stay|remain|are|is|kept|still|can be|be).{0,15}(accurate|correct|true|to scale|exact|right)"] },
            ],
            sample: "The plan of the room is drawn at its true shape, so the floor layout can be turned and the heights added upwards, which makes it quick to draw with the furniture in the correct positions.",
            model: mi("In planometric the plan is drawn at true shape (turned to 45°/45° or 30°/60°), with heights added vertically (cause) (1)", "…so a floor plan is quick and easy to turn into a view, and the furniture positions and distances on the floor stay accurate (effect) (1)"),
          },
        ],
      },
      {
        id: "interp-10",
        style: "Scenario question · reading a dimensioned production drawing",
        stem: "<p>A flange for a ship's capstan is shown in plan and elevation in third-angle projection. The four holes are equally spaced. The bore receives a shaft. Sizes are in mm.</p>",
        figure: fig10,
        parts: [
          { label: "(a)", type: "num", marks: 1, a: 30.2, tol: 0.01, unit: "mm", q: "State the maximum diameter allowed for the bore.", why: "The bore is Ø30 with an upper deviation of +0.2 and a lower deviation of −0.1. Maximum = 30 + 0.2 = 30.2 mm (the minimum is 30 − 0.1 = 29.9 mm)." },
          { label: "(b)", type: "num", marks: 1, a: 49.5, tol: 0.15, unit: "mm", q: "Calculate the distance between the centres of two neighbouring holes.", why: "The hole centres lie on the PCD 70 circle, radius 35. Four equally spaced holes are 90° apart, so two neighbouring centres and the flange centre form a right-angled triangle with two sides of 35: √(35² + 35²) = √2450 ≈ 49.5 mm." },
          { label: "(c)", type: "mcq", marks: 1, q: "Which line type is the circle through the centres of the four holes drawn in?", opts: ["Continuous thick", "Dashed thin", "Long dash, dot, thin chain", "Continuous thin"], a: 2, why: "The pitch circle is a centre line, drawn as a thin chain: long dash, dot. Thick continuous is an outline, dashed thin is hidden detail and continuous thin is a projection or dimension line." },
          {
            label: "(d)", type: "text", marks: 2, rows: 3,
            q: "The bore receives a shaft. Decide which of the course's two labels, F or NF, suits its dimension, and give a reason.",
            points: [
              { desc: "Functional", any: ["^\\s*\\W*(functional|f)\\b", "\\b(is|be|as|labelled|labeled|marked|called|classed|classified|label|dimension|choose|answer|would|should|it'?s|f or) (a |an |as |the |be |is )*(?<!non-?)(?<!non )(functional|f)\\b(?!\\w)", "(?<!non-?)(?<!non )functional (dimension|\\(f\\)|f\\b)"] },
              { desc: "Reason: it is essential to the shaft fitting and the part working", win: 40, any: ["(?<!not )(?<!n't )(essential|critical|vital|crucial|necessary) (to|for) ((the|how|what|making) )*(shaft|fit|part|bore|function|it|working|work)", "(has|have|needs?|must|need|got) to (fit|work|function)", "(for|so) the (part|flange|shaft|bore) (to |can )?(fit|work|function)", "shaft (fits?|works?|turns?|runs?|rotates?) (properly|correctly|smoothly|well|freely|snugly|tightly)", "fit(s|ting)? (the |a |its )?shaft (properly|correctly|closely|tightly|snugly|exactly|well)", "tight(ly)? (tolerance|fit)"] },
            ],
            sample: "It is functional (F), because the bore receives the shaft and has to fit it closely, so a tight tolerance is needed for the part to work properly and the shaft is not left to wobble about.",
            model: mi("Functional (F) (1)", "It is essential to the function of the part: the bore must fit the shaft, so it needs a tight tolerance (1)") + "<p>A non-functional dimension, such as an overall length that does not affect fit, can have a looser tolerance.</p>",
          },
        ],
      },
      {
        id: "interp-11",
        style: "Short-answer question · compare two pictorial methods",
        stem: "<p>The Plan Room must show a client the layout of a new chart room. The designer is deciding between an isometric drawing and a planometric drawing of the room, both drawn from the same floor plan.</p>",
        parts: [
          {
            label: "(a)", type: "text", marks: 4, rows: 6,
            q: "Compare an isometric drawing with a planometric drawing of the chart room. (4 marks, any 4 comparisons)",
            points: [
              { desc: "Plan shape: in planometric the plan keeps its true shape (circles stay circles), whereas in isometric no face is true shape and circles become ellipses", win: 120, all: ["(plan|floor|planometric)" + W3 + "true (shape|size)|true (shape|size) (of|for) the (plan|floor)", "circles?" + W3 + "(becomes?|turns?|look|appears?|are|is|as)(\\W+\\w+){0,2}\\W+ellips|ellips(es|e)?" + W3 + "(instead|not|rather)|no (face|side|surface)s?(\\W+\\w+){0,2}\\W+true (shape|size)|(isometric|iso)" + W3 + "(distort|no true)"], group: "shape" },
              { desc: "Axes: isometric has both horizontal axes at 30\u00b0 (all three axes 120\u00b0 apart), whereas planometric turns the plan to 45\u00b0/45\u00b0 or 30\u00b0/60\u00b0", win: 130, all: ["isometric" + W7 + "(\\b30 ?(\u00b0|degrees?)|\\b30\\b)|\\b30 ?(\u00b0|degrees?)" + W3 + "(to the horizontal|each side|isometric)|120 ?(\u00b0|degrees?) apart", "planometric" + W5 + "(45|30 ?(\u00b0|degrees?)? ?(and|/|or) ?60)|(45|30 ?(\u00b0|degrees?)? ?(and|/|or) ?60)" + W3 + "planometric|plan (is |can be )?(turned|rotated)(\\W+\\w+){0,3}\\W+(45|30)"], group: "axes" },
              { desc: "Similarity: in both, vertical lines are drawn vertical and heights are measured full size (or both show three faces at once)", win: 60, all: ["(lines?|edges?|axes|faces|sides|drawings?|views?|methods?|pictorials?|ways)"], any: ["both( \\w+){0,4} (vertical|heights?|upright|three (faces|sides)|3d|three.dimensional)", "(vertical|heights?|upright)( lines| edges)?( \\w+){0,3} (in|for) both", "(vertical|heights?|upright)( lines| edges)?( \\w+){0,3} (the same|same)( \\w+){0,3} (in|for)? ?(both|each)"] },
              { desc: "Use: planometric is quick for a room layout because the floor plan can be traced and turned, whereas isometric means redrawing the plan at 30\u00b0", win: 150, all: ["(floor |room )?plan (can be |is |simply |just |easily |can simply be )*(traced|turned|rotated|copied)|(trace|turn|rotate|copy)\\w* (the (floor |room )?plan|it|them)|quick(er)? (to|for)(\\W+\\w+){0,3}\\W+(room|layout|interior|floor)", "(redraw|re-draw)(n|ing|s)?\\b|draw (it |the plan )?again|more work|\\bharder|slower|takes longer|(cannot|can'?t|not) (be )?(simply )?(trace|copi)"], group: "use" },
              { desc: "Appearance: planometric looks stretched upwards (verticals may be shortened), whereas isometric looks more balanced / natural", win: 120, all: ["planometric" + W3 + "(stretch|tall|taller|distort|elongat)|(stretch|tall|taller|distort|elongat)\\w*" + W3 + "planometric", "isometric" + W3 + "(balanc|natural|realistic|even|equal)|(balanc|natural|realistic|even|equal)\\w*" + W3 + "isometric"] },
            ],
            sample: "In an isometric drawing both horizontal axes are drawn at 30\u00b0 so no face is true shape and a circle on the floor becomes an ellipse, whereas in a planometric drawing the plan keeps its true shape so a circle in the plan stays a circle. Planometric turns the plan to 45\u00b0 and 45\u00b0, but isometric has all three axes 120\u00b0 apart. In both drawings the vertical lines are drawn vertical. Planometric is quick for a room layout because the floor plan can simply be traced and turned, while isometric means redrawing the plan at 30\u00b0.",
            model: mi("Plan shape: planometric keeps the plan at true shape (circles stay circles), but isometric has no true-shape face and circles become ellipses (1)", "Axes: isometric uses 30\u00b0 on both horizontal axes (all axes 120\u00b0 apart), but planometric turns the plan to 45\u00b0/45\u00b0 or 30\u00b0/60\u00b0 (1)", "Similarity: in both, vertical lines stay vertical / heights are drawn full size, and both show three faces in one view (1)", "Use: planometric is quick for an interior because the floor plan can be traced and turned, but isometric means redrawing the plan at 30\u00b0 (1)", "Appearance: planometric tends to look stretched upwards (some illustrators shorten the verticals), but isometric looks more balanced (1)") + "<p>A comparison must give both sides, for example with <em>whereas</em>, <em>but</em> or <em>both</em>.</p>",
          },
        ],
      },
    ],
  };
})();
