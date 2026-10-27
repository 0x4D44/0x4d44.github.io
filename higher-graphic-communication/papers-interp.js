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
  const svg = (w, h, label, body) => `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}"><rect width="${w}" height="${h}" fill="${PAPER}"/>${body}</svg>`;
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

  /* ---- Q12: a cylinder cut at 60 degrees: plan and elevation ---- */
  const fig12 = (() => {
    const k = 2.2, x0 = 117, x1 = x0 + 30 * k, cx = (x0 + x1) / 2, yb = 290, yl = 230, yr = yl - 30 * k * Math.sqrt(3);
    let o = circ(cx, 60, 15 * k, THICK(PAPER)) + ln(cx - 42, 60, cx + 42, 60, CHAIN) + ln(cx, 12, cx, 108, CHAIN);
    o += ln(x0, 60, x0, yl, THIN()) + ln(x1, 60, x1, yr, THIN());
    o += P(`M${x0} ${yl} L${x1} ${n1(yr)} V${yb} H${x0} Z`, THICK(PAPER)) + ln(cx, 106, cx, 298, CHAIN);
    o += ln(x0, yl, x0 + 52, yl, THIN());
    o += P(`M${x0 + 30} ${yl} A30 30 0 0 0 ${n1(x0 + 15)} ${n1(yl - 26)}`, THIN()) + T(x0 + 38, yl - 8, "60°", { a: "start", size: 12 });
    o += leader(212, 48, cx + 23.3, 36.7) + T(216, 52, "Ø30", { a: "start" });
    o += leader(222, 112, 168, 134) + T(226, 112, "Cut line (the cut face seen edge-on)", { a: "start", size: 12 });
    o += T(6, 64, "Plan", { a: "start" }) + T(6, 262, "Elevation", { a: "start" });
    return svg(460, 306, "Third-angle plan above elevation of an upright cylinder of diameter 30. The plan is a circle. The elevation is a rectangle whose top is cut by a sloping straight line at 60 degrees to the horizontal, labelled as the cut line.", o);
  })();

  /* ---- Q13: two equal pipes meeting, elevation ---- */
  const fig13 = (() => {
    let o = P("M90 30 H150 V80 H320 V140 H150 V200 H90 Z", THICK(PAPER));
    o += ln(150, 80, 120, 110, THICK()) + ln(150, 140, 120, 110, THICK());
    o += ln(120, 22, 120, 208, CHAIN) + ln(112, 110, 330, 110, CHAIN);
    o += ln(90, 204, 90, 228) + ln(150, 204, 150, 228) + dim(90, 224, 150, 224, "Ø40", 120, 244);
    o += ln(320, 80, 346, 80) + ln(320, 140, 346, 140) + dim(342, 80, 342, 140, "Ø40", 372, 114);
    o += leader(212, 52, 138, 92) + mark(222, 46, "K");
    o += T(6, 24, "Elevation", { a: "start" });
    return svg(460, 254, "Elevation of an upright pipe with a branch pipe of the same diameter 40 joined to it from the right, both centre lines crossing. A line labelled K marks where the two pipes meet.", o);
  })();

  /* up to three plain words (no punctuation, none that say "unchanged") after a negator */
  const ND = "(?:(?!distort|stretch|chang|warp|skew|squash)\\w+ ){0,3}";
  /* a negated auxiliary: "would not", "wouldn't", "won't", "cannot", "can't", "never" ... */
  const NA = "(?:(?:would|could|should|does|did|do|is|are|was|were|has|have|had|must)(?: not|n't)|will not|won't|can not|cannot|can't|never)";
  /* interp-06 (c): "the real length" ... "would not fit", either order */
  const TRUELEN = "(?:real|true|actual|exact|correct|right|proper|accurate) (?:length|size)|inaccurate|(?:wrong|incorrect|different|inexact) (?:length|size)|too (?:short|small|long|big)|(?:shorter|longer|smaller|bigger) than|foreshorten|shortened|(?:wrong|incorrect|inexact|inaccurate|different) (?:\\w+ )?(?:lengths?|sizes?)|(?:must|need to|needs to|has to|have to|should) be (?:true|real|actual|accurate|correct|exact)";
  const NOFIT = "(?:\\bnot|n't|never) (?:\\w+ )?(?:fit|close|meet|match|line up|join|assemble|come together|go together|form|work|fold)|\\bgaps?\\b|\\boverlaps?\\b|(?:wrong|odd|different|incorrect) shape|gaps";
  const W10 = "(?:\\W+\\w+){0,10}\\W+";
  const ISO = "\\biso(?:metric)?\\b", PLN = "\\bplanom?etric\\b|\\bplanimetric\\b|\\bplano\\b";
  const W3 = "(?:\\W+\\w+){0,3}\\W+"; /* up to three words between two patterns */
  const W5 = "(?:\\W+\\w+){0,5}\\W+", W7 = "(?:\\W+\\w+){0,7}\\W+";
  /* word lists for the north-point marking point (interp-08 b) */
  const SUNX2 = "\\bsun\\b|\\bsunlight\\b|\\bsunshine\\b|\\bsunn\\w+|\\bsunlit\\b|\\bsunset\\b|\\bsunrise\\b|\\bdaylight\\b|\\bshade\\b|\\bshadows?\\b|\\bwinds?\\b|\\bweather\\b|\\bsolar\\b|\\blight\\b";
  const ROOMX = "windows?|rooms?|buildings?|houses?|boathouse|entrance|garden|layout|living areas?|doors?";

  B.interp = {
    intro: "Interpretation of graphic items is the biggest swing area of the paper (12 to 30 of the 90 marks). This bank has thirteen questions worth 68 marks: naming pictorial and orthographic views, reading sizes and lines from third-angle views, matching views to a pictorial, recognising forms and nets, reading a section, a site plan and a dimensioned flange, finding the true shape of a cut face, the line where two pipes meet, explaining why a drawing type suits a job, and comparing two pictorial methods. Most have a drawing: read it, trace features between views, and give cause and effect when asked to explain.",
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
              { desc: "Cause: the hole is inside the material, so it cannot be seen from the front", negOK: true,
                not: ["(?:\\bnot|\\bnever|n't|no longer) (?:\\w+ ){0,2}(?:hidden|inside|within|behind|beneath|obscured|covered|concealed)", "(?:cannot|can't|can not|isn't|not|unable to) (?:be )?(?:see|seen|visible) (?:\\w+ ){0,2}(?:from|in|on) (?:the )?(?:above|top|plan|view p|p\\b)"],
                any: ["(cannot|can'?t|can not|couldn'?t|not|isn'?t|aren'?t|unable to|won'?t) (be )?(see|seen|visible)", "\\b(?:is|are|be|being|was|were|it'?s|stays?|remains?|gets?|become|becomes)(?: \\w+)? hidden\\b(?! (?:detail|lines?))", "\\bhidden (?:from|by|behind|inside|within|under|beneath|below|in the)", "out of (sight|view)", "(inside|within|behind|under|beneath|below|through) (the|a|its) (block|material|metal|front|surface|part|object|solid|component|face)", "(obscured|covered|concealed|blocked)", "hole (goes|runs|sits|lies|is) (right )?(inside|through|within)", "(drilled|cut) (right )?(into|through) the"] },
              { desc: "Effect: it is drawn as thin dashed lines (hidden detail)", negOK: true,
                not: ["(?:not|never|n't) (?:\\w+ ){0,3}(?:dash|hidden detail|broken|drawn as dash)", "\\bp\\b(?:(?!\\bq\\b|\\bbut\\b|\\bwhereas\\b|[.;]).){0,40}(?<!not )(?<!n't )(?:dash|dotted|broken|hidden detail)", "(?<!not )(?<!n't )(?:dash\\w*|dotted|broken) (?:(?!unlike|rather|instead|not|whereas|but|than|compared)\\w+ ){0,3}in (?:view )?p\\b"],
                any: ["dash(ed|es)? (thin )?(lines?|detail)", "(thin|broken|short) dash", "\\b(?:is|are|was|be|become|becomes|appears?|looks?|shown|drawn|represented|made|use|used|using)(?: \\w+)? (?:dash(?:ed|es)|dotted)\\b", "hidden (detail|lines?)", "broken (lines?|detail)", "(drawn|shown|represented|appears?|are|is|as) (as |with |by |using )?(a |some )?(thin )?dash(ed|es)"] },
            ],
            sample: "In view Q the hole is hidden inside the block, out of sight from the front, so its edges are drawn as thin dashed lines (hidden detail) to show that they are there. In view P you look straight down into it.",
            model: mi("The hole is inside the material / behind the front face, so it is hidden from the front (cause) (1)", "…so its edges are shown as hidden detail, thin dashed lines (effect) (1)") + "<p>Seen from above in view P the hole is a visible circle, so it is drawn in thick outline.</p>",
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 3,
            q: "State what the solid line K in view P represents and how the same feature appears in view R.",
            points: [
              { desc: "K is the edge where the taller part meets the lower part: a change in height", win: 60, any: ["chang\\w* (in |of )?(the )?(height|level)", "(higher|lower|upper|taller|shorter) (level|part|section|surface)", "steps? (in|down|up|between|change|from)", "(a|the) step\\b", "(high|tall|taller|higher|thick|thicker|upper) (part|section|bit|level|end).{0,25}(low|short|shorter|lower|thin|thinner)", "(two|different) (heights|levels)", "(where|when) the (taller|higher|upper|raised|bigger|thicker).{0,35}(meets?|joins?|ends?|drops?|steps?)", "(meets?|joins?) the (top of the )?(lower|shorter|thinner|smaller)", "(taller|higher|upper|raised) (part|section|level|block) (and|meets?|joins?|to) (the )?(lower|shorter)"] },
              { desc: "In R it is a solid horizontal line 15 mm up from the base", win: 50, not: ["(?<!not )(?<!n't )(?<!no )(?<!than )\\b(?:dash\\w*|dotted|broken|chain|hidden)\\b"], any: ["(solid|thick|continuous|horizontal) (solid |thick |horizontal )?line.{0,40}\\b15\\b", "\\b15 ?(mm)? (high|up|above|from the (bottom|base)).{0,30}\\bline", "\\bline.{0,25}\\b15 ?(mm)? (high|up|above|from|off)", "\\b15 ?(mm)? (high|up|above|from the (bottom|base)).{0,40}(solid|thick|horizontal|continuous)", "(solid|thick|continuous|horizontal|full)\\b.{0,40}\\b(15|fifteen) ?(mm)?", "\\b(15|fifteen) ?(mm)?\\b.{0,40}(solid|thick|horizontal|continuous)"] },
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
              { desc: "The outline is a plain rectangle (40 wide, 30 high): no notch",
                not: ["\\b(?:with|has|have|shows?|showing|including|contains?) (?:a |an |the )?(?:small |deep |wide |big |large |square |u[- ]shaped? )?(?:notch|step|dip|gap|cut-?out|u[- ]shape)\\b", "(?<!\\b(?:no|without|nor|not|neither|any)\\b[\\w ,]{0,20})\\b(?:notch|step|dip|gap|cut-?out)(?:ed)? (?:in|at|on|cut|out of|into) (?:the )?(?:top|outline|rectangle|middle|centre|center)", "(?:rectangle|square|outline|shape)(?: [\\w\\-]+){0,4} (?:60|sixty)\\b", "\\b(?:60|sixty)(?: [\\w\\-]+){0,3} (?:rectangle|square|outline)"],
                any: ["\\b(?:is|be|looks? like|appears? (?:as|like)|shows?|seen as|drawn as|just|simply|only|plain|simple|full|complete) (?:[\\w\\-x×().]+ ){0,5}(?:rectangle|oblong)\\b", "(?:nothing|no part|none of it|no section)(?: \\w+){0,2} (?:cut|missing|removed|taken|notched)", "(?:isn't|is not|not|never|wouldn't|would not be|won't be)(?: \\w+){0,2} (?:notched|cut away|cut out)","(no|without|not (a|any)) (a )?(notch|cut|gap|step|dip)", "(plain|simple|complete|full|solid|whole|ordinary|unbroken|uncut|intact|normal|basic|ordinary|ordinary)(?: [\\w\\-x×().]+){0,4} (outline |shape )?(rectangle|square|oblong)", "(just|only|simply)( \\w+){0,2} (a |an )?(plain |simple )?(rectangle|square)", "without (any|a) (notch|cut|gap|step|dip|break)", "outline (is|looks like|would be) (a )?(rectangle|square)"] },
              { desc: "The slot floor is a thin dashed (hidden detail) line across the view, 12 mm below the top (18 mm above the base)", win: 60, negOK: true, not: ["(?:\\bno|\\bnot|n't|without) (?:\\w+ )?(?:dash|hidden)"], any: ["(dash(ed|es)?|hidden|broken|dotted) (thin |detail |dash(ed|es)? |lines? )*(line|detail).{0,50}(across|floor|12|18|slot)", "(across|floor|\\b12|\\b18).{0,50}(dash(ed|es)?|hidden|broken|dotted) (thin |detail |dash(ed|es)? |lines? )*(line|detail)", "(floor|bottom) of the slot.{0,40}(dash|hidden)", "(dash(ed|es)?|hidden).{0,40}(floor|bottom) of the slot"] },
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
              { desc: "Cause: the cone has been cut parallel to its base, so the top is a smaller circle", win: 60, any: ["cut (off )?(parallel|by a plane|across|flat|straight)", "parallel to (the|its) base", "(top|end|face|point|tip) (is|are|becomes?|has become|has been)( a| made)? (smaller|narrower|cut|chopped|sliced|removed|flat)", "(top|end|face) (circle )?(is|are) smaller", "(top|upper)( \\w+){0,3} (is|are|being|has) an? (small|smaller|little|tiny)( \\w+)? (circle|disc|disk|face)", "narrower (at )?(the )?top", "(chopped|sliced|cut|removed|taken) (off )?(the )?(top|point|tip)", "(point|tip|top) (is |has been |was )?(cut|chopped|removed|sliced) off", "(cut|sliced|chopped|removed|taken) off", "truncated (at|across|by|the top|its top)", "(top|end|tip|point|face) (is |has been |was |being )?truncated", "leav(es|ing) (a |the )?(smaller|small)", "(smaller|small|narrow\\w*|less wide|reduced)( \\w+)? (top|upper)( \\w+)? (circle|face|end|part|section|surface)", "(top|upper)( \\w+){0,2} (circle|face|end|part|section|surface)( \\w+){0,2} (is|are|being|that is|which is) (smaller|small|narrower|less wide|reduced)", "(small|smaller|narrow\\w*) (circle|one|disc|disk|face)( \\w+){0,2} (on|at) (the )?(top|upper)", "(top|upper) (\\w+ ){0,2}(narrower|smaller) than (the )?(base|bottom)"] },
              { desc: "Effect: seen from above, the small top circle sits inside the larger base circle", win: 70, negOK: true, not: ["(base|bottom)( circle)?( is| being)?( a)? (smaller|small|inner)", "inside the (larger|bigger|big|large|outer|wider)( \\w+)? (top|upper)", "(top|upper) (circle )?(is |being )?(larger|bigger|big|large|outer|wider)", "(bigger|larger|big|large|outer|wider) (circle )?(is |being )?(on|at|in) (the )?(top|upper)"], any: ["(from above|looking down|top view|seen from above|viewed from above|plan view|looking from above).{0,60}(inside|within|in the middle|centre|inner|concentric)", "(smaller|small|top) (circle|one).{0,30}(inside|within|in the middle|sits in|sits on)", "(inside|within|in the middle of) the (larger|bigger|big|large|base|lower|bottom|outer|wider)"] },
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
              { desc: "Cause: when the sector is rolled up, the curved edge goes round to form the rim of the base", win: 70, negOK: true,
                not: ["(?:\\bnot|\\bnever|n't|\\bwouldnt|\\bdoesnt) (?:\\w+ ){0,2}(?:the )?(?:circumference|rim)\\b", "(?:\\bdoes|\\bdo|\\bdid|\\bwill|\\bcan|\\bis|\\bare|\\b)(?: not|n't|never) (?:\\w+ ){0,2}(?:wrap|roll|curl|go|goes|form|make|become)\\b", "(?:\\bnot|\\bnever|n't) (?:be |been )?(?:rolled|wrapped|curled|folded)"],
                any: ["(roll|curl|wrap|bend|bent|fold|turn|bring|brought|join|curve)(ed|s|ing)? (it |them |the (net|sector|arc|shape) )?(up|round|around|into|together|over).{0,60}(rim|edge of the base|base|circle|bottom|cone|perimeter|circumference)", "(forms?|becomes?|makes?|is|make|form|turns? into|goes? (all the way )?(round|around)|wraps? (round|around)|runs? (round|around)) (the |a )?(base'?s? |bottom |cone'?s? )?(perimeter|circumference|rim|outer edge|outline|bottom edge|edge of the (base|bottom|cone|circle))", "curved edge.{0,40}(forms?|becomes?|goes|wraps?|makes?|runs|joins).{0,30}(base|rim|circle|circumference|bottom)", "(arc|curved edge|curve|curved side)( \\w+){0,3} (is |gets |are )?(joined|attached|fixed|stuck|sewn|fastened|glued)( \\w+){0,2} (to|onto|with) (the )?(base|circle|bottom|rim)", "(arc|curved edge|curve|curved side)( \\w+){0,2} (forms?|makes?|becomes?)( a| the)?( \\w+)? (circle|ring|loop)", "(forms?|becomes?|makes?|is) the (rim|circumference|edge|outline|outside) of the (base|cone|circle)", "(to )?(make|form|become|create) (up )?(the |a )?(circle|base|bottom|rim|round)", "(goes|wraps|runs|curls|fits|reaches|goes) (all the way |right )?(round|around) (the |its )?(base|bottom|rim|circle|cone)?", "(same|equal) (length )?(as|to) the (distance|way) (all the way )?(round|around)"] },
              { desc: "Effect: otherwise the edges would overlap or leave a gap, so the cone would not close or fit its base", win: 70, negOK: true,
                not: ["\\b" + NA + " (?:\\w+ ){0,2}(?:overlap|leave|gap|be (?:a )?(?:gap|overlap))", "(?:\\bnot|\\bnever|n't) (?:(?:be|have|leave|make|cause|create) )?(?:a |an |any )?(?:gap|overlap)\\w*\\b(?! or)", "(?<!with )(?<!and )\\bno (?:\\w+ )?(?:gap|overlap)", "\\bwithout (?:any |a |an )?(?:\\w+ )?(?:gap|overlap)", "\\balways (?:\\w+ ){0,2}(?:meet|fit|close|join)", "\\b(?:not|n't|nt) matter|no difference"],
                any: ["\\b(gap|gaps|overlap|overlaps|overlapping)\\b", "(\\bnot|n't|never|\\b(?:would|could|does|do|did|will|can|is|are|was|were)n?t\\b|\\bwon'?t|\\bcan'?t) (properly |quite |fully |neatly )?(close|fit|meet|join|match|line up|reach|go together)", "(too|be|is|was|were) (long|short|big|small|loose)\\b.{0,50}\\b(open|loose|baggy|wrong|fit)"] },
            ],
            sample: "When the net is rolled up, the curved edge wraps round to form the rim of the base. If it were longer or shorter than the circumference the edges would overlap or leave a gap, so the cone would stay open.",
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
              { desc: "Cause: the net is cut out and folded up / joined to make the solid", win: 60, negOK: true,
                not: ["(?:\\bnot|\\bnever|n't) (?:be |been |get |being |ever )?(?:cut|folded|fold|joined|glued|made up|put together)"],
                any: ["cut (it |them |the net |the shape )?out", "\\bfold(ed|s|ing)? (it |them |the net |the shape )?(up|into|to|together|and)", "(is|be|will be|are|gets?) (cut|folded|joined|glued|assembled|made up)", "made (up )?into", "(?:when|once|after|as|if|before|until|while)(?: [\\w']+){0,3} fold(?:ed|ing|s)?\\b(?! lines?)", "\\b(?:used|needed|going|meant|designed|intended) (?:to|for) (?:make|making|build|building|form|forming|create|creating|construct\\w*|manufactur\\w*|assembl\\w*)", "flat (?:sheet|material|card|paper|metal|plate)", "(build|make|form|create)s? (up )?the (solid|prism|shape|3d|model|object)", "assembl(ed|e|ing)", "joined (together|up)", "put together"] },
              { desc: "Effect: a shortened line would make a face too small so the edges would not meet or fit", win: 70, negOK: true,
                not: ["\\b" + NA + " (?:(?:be|look|make|have|leave) )?(?:a |an |any )?(?:too )?(?:short|small|long|big|wrong|different|foreshorten|distort|gap|overlap)", "(?:\\bnot|\\bnever|n't) (?:(?:be|leave|make|have|create|cause|produce|look) )?(?:a |an |any )?(?:too )?(?:short|small|long|big|wrong|different|foreshorten|distort|gap|overlap)"],
                any: ["(too (short|small|long|big)|foreshorten|wrong (size|length)|incorrect (size|length)|different (size|length)|(shorter|longer|smaller|bigger) than).{0,30}(gap|overlap|(not|n'?t) (properly |quite |fully )?(fit|close|meet|match|line up|join|reach|assemble|come together|go together|form|work))", "(gap|overlap|(not|n'?t) (properly |quite |fully )?(fit|close|meet|match|line up|join|reach|assemble|come together|go together|form|work)).{0,30}(too (short|small|long|big)|foreshorten|wrong (size|length)|incorrect (size|length)|different (size|length)|(shorter|longer|smaller|bigger) than)", "(" + TRUELEN + ").{0,60}(" + NOFIT + ")", "(" + NOFIT + ").{0,60}(" + TRUELEN + ")"] },
            ],
            sample: "The net is cut out and folded up into the solid, so a foreshortened line would make a face too small and the edges would leave a gap.",
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
              { desc: "Cause: they are two different, touching parts", win: 60, negOK: true, not: ["(?<!not (?:the )?)(?<!different from the )\\bsame (material|metal|part|thing|item|component|piece|stuff)", "(?:\\bnot|n't|never) (?:\\w+ ){0,2}(?:separate|different|distinct|two|touch|in contact|adjacent|next to)", "(?<!like )(?<!as )(?<!into )(?<!not )(?<!n't )(?<!not the )(?:one|a single|the same|1) (?:piece|part|item|component|object|thing|solid|block)(?! (?:ends|from|and))"], any: ["(?:\\bnot|n't) (?:the |one |a )?same (?:piece|part|item|component|thing|object|material|solid)", "(bush|item 2|item two|shaft|inner (?:part|piece)|pin)( \\w+){0,5} (into|inside|within|against|round|around|in|onto|on) (the )?(housing|item 1|item one|outer (?:part|piece)|casing)", "(housing|item 1|item one|casing)( \\w+){0,5} (and|with|against|round|around|holds?|holding|contains?|surrounds?) (the )?(bush|item 2|item two|inner (?:part|piece)|shaft)", "(separate|different|adjacent|neighbouring|touching|next to each other|distinct|individual|two (separate|different|touching|adjoining|adjacent)) (parts|components|items|pieces)", "(housing|item 1|item one|the outer (part|piece)) (and|with|against|beside|next to) (the )?(bush|item 2|item two|inner (part|piece)|shaft)", "\\b(in contact|side by side|next to|beside|against|inside) (each other|one another|the (other|housing|bush|first|second))", "\\b(two|2) (items|parts|components|pieces)", "(parts|components|items|pieces) (are |is )?(next to|beside|in contact|touching|neighbour|adjacent|fitted|joined|side)", "(parts|components|items|pieces) (are |is )?(separate|different)", "two (parts|components|items|pieces) (that |which )?(touch|meet|fit|are (next|side|joined|fitted|in contact))", "(parts|components|items|pieces) (that |which )?(touch|are (next|side|joined|fitted|in contact))", "(touch|touching|meet|next to) (each other|one another|the other)"] },
              { desc: "Effect: the reader can tell them apart / see where one ends and the next begins", win: 60, negOK: true, not: ["(?<!(?:\\bif|\\bwere|\\bwas|\\bsame|\\bidentical|\\balike|\\botherwise|\\bunless|\\bor)\\b[\\w ,']{0,40})(?:\\bnot|n't|never|cannot) (?:\\w+ ){0,3}(?:told|tell|see|distinguish|identify|clear|apart)", "\\bmaterials?\\b|made (of|from)|\\bmetals?\\b|plastic|strength|strong|\\bsame (colour|look)"], any: ["(tell|see|identify|spot|distinguish|recogni[sz]e|know|show|shows|showing|indicate|make clear|clear)\\w* (clearly |easily |quickly )?(that )?(they|these|the (two|parts|items|components)|it|there) (are|is|were|being) (different|separate|two|distinct|individual|not the same)", "(don'?t|doesn'?t|do not|not|won'?t|avoid|stop|prevent)\\w* (to )?(look|looks|seem|seems|appear|appears|become|becomes|be|being|merge|blend|read|treated)( \\w+)? (like|as|into)? ?(one|a single|the same|1|each other|together)", "(look|looks|seem|seems|appear|appears) (like )?(they are |it is |its )?(separate|distinct|two (separate |different )?(parts|items|components|pieces)|different (parts|items|components|pieces))","tell (them|the parts?|the items?|the two|these|one) (apart|from)", "(distinguish|differentiate|separate)s? (between )?(the |them|these|one)", "(see|know|show|shows|find|tell|showing|helps?|helping)\\w*( \\w+){0,3} where (one|the one|item|part|each|the first|the housing|the bush).{0,30}(ends?|begins?|stops?|starts?|finish\\w*|over|changes?)", "(see|tell|spot|notice|identify|show|shows) (clearly )?(the )?(difference|separation|boundary|divide|division|split|distinction) between", "\\btold (apart|from)|\\btell (\\w+ ){0,2}(from|apart)", "(boundary|boundaries|edge|line) between (the |them|item|part|two)", "(clear|obvious|easy|easier|helps?|shows?) (to see )?(which|where|that they are (different|separate))", "(see|tell|know|show|shows|identify|spot|work out)\\w*( \\w+){0,3} which (area|part|bit|section|piece|item|component|region|hatching|one)( \\w+){0,2} (belongs?|is|goes|are|go|came|comes)"] },
            ],
            sample: "They are two different parts that touch, so hatching them in opposite directions makes it clear where one part ends and the other begins, so the reader can tell them apart.",
            model: mi("Item 1 and item 2 are different parts that touch (cause) (1)", "…opposite hatching makes the boundary between them clear, so the reader can tell the parts apart (effect) (1)"),
          },
          {
            label: "(c)", type: "text", marks: 1, rows: 2, minWords: 2,
            q: "State what the arrows at the ends of the cutting plane line show.",
            points: [{ desc: "The direction of viewing (the way you look at the section)", any: ["direction (of|in which|that|you|the viewer|we).{0,20}(view|look|sight|section|see)", "(viewing|view|looking|look|sight) direction", "(which|what|the) (way|direction|side) (to |you |the (section|viewer|reader|person) |it |we )?(are |is |were )?(look|view|see)", "(way|direction) (you|the viewer|we|the reader|someone|a person) (are |is |were )?(look|view|see|face)", "where you (are )?(look|view|stand)", "point of view", "(side|direction|way|position|viewpoint|angle)( \\w+){0,6} (seen|viewed|looked at|observed|is looked|is viewed|you view|you look|you see|to look|to view)", "(looking|viewing) (at|from|towards?) (the )?(cut|section|plane)"] }],
            sample: "The arrows show the direction of viewing, which is the way the reader is meant to look at the cut section.",
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
              { desc: "Cause: it shows which way north is / which way the building and plot face", win: 60, not: ["way up", "upside", "\\bscale\\b", "measure", "front door"], any: ["which (way|direction) (is |the )?north", "which (way|direction) (round )?(is )?north", "(knows?|see|tell|work out|find) (which|what) (way|direction)", "where north (is|lies)", "direction (of|to) north", "(points?|pointing|facing|towards?) (to |towards? |at )?north", "north (is|lies)", "orientat(e|ed|ion).{0,30}(north|plot|site|building|house|boathouse)", "which (way|direction|side) (of )?(the )?(building|plot|site|house|boathouse|it) (is )?(faces?|facing|points?)", "(direction|way|how|which way)( \\w+){0,2}? (the )?(plot|site|building|house|boathouse|plan)( \\w+){0,2} (is |are )?(orientat\\w*|orient\\w*|position\\w*|faces?|facing|points?|pointing|laid|sited|situated|sits|lies)", "compass", "(shows?|gives?|indicates?|tells?|points? out|knows?|knowing|sees?|work out|finds?)( \\w+){0,2} (the |which )?(compass )?(direction|orientation|bearing)\\b", "direction north|north direction|which way is north|points? (to )?north", "(positioned|situated|placed|laid out|sited|lies?|facing|faces|pointing|points?) (\\w+ ){0,4}(compared|relative|in relation) (to|with) (the )?(north|compass|sun)", "(how|which way|which direction) (the )?(plot|site|building|house|boathouse|plan) (is |are |sits |lies |faces |points |is facing |is positioned |is orientated |is oriented )"] },
              { desc: "Effect: so the sun, light or weather can be allowed for when positioning windows, rooms or the building", win: 70, not: ["way up", "upside", "\\bscale\\b"], any: ["(" + ROOMX + ")\\W+(to |that |which |can |will |could |and )*(get|catch|receive|have|let in|benefit from|avoid|shelter from|face|take|use|make use of|maximi[sz]e|capture|are|is)\\w* (the |some |more |plenty of |enough |lots of |lots of )?(" + SUNX2 + ")", "(position|place|orient|design|put|build|locate|face|plan|arrange|point)\\w* (the |its |their |any |all )?(" + ROOMX + ")( \\w+){0,3} (to|so|for|away|towards?|facing|where)( \\w+){0,4} (" + SUNX2 + ")", "(" + ROOMX + ")( \\w+){0,4} (placed|positioned|orientated|oriented|built|located|put|designed|laid out|arranged|sited)( \\w+){0,3} (to|so|for|away|towards?|facing)( \\w+){0,4} (" + SUNX2 + ")", "(" + SUNX2 + ")( \\w+){0,4} (affect|hit|reach|shine|come|enter|strike|fall|blow|shelter)\\w*( \\w+){0,4} (" + ROOMX + ")", "(" + SUNX2 + ") (when|while|as|if) (positioning|placing|orientating|orienting|designing|planning|building)", "(" + SUNX2 + ")( \\w+){0,8} (for|to|with|on|of|when|in|around|about) (the |their |a |each |every )?(" + ROOMX + ")", "(" + ROOMX + ")( \\w+){0,8} (" + SUNX2 + ")", "(" + SUNX2 + ")\\b.{0,50}(helps?|allow|plan|position|decid|work out|determin|consider|account|design|affect|fall|falls|shine|shines|hits?|reach|catch|where|how much|so that|needed|important|matter)", "(helps?|allow|plan|position|decid|work out|determin|consider|account|design|affect|where|how much|so that|to see|to know|to tell|to find).{0,50}(" + SUNX2 + ")\\b"] },
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
              { desc: "Cause: the plan (floor) is drawn at its true shape, so it can be turned and the heights added upwards", win: 50, negOK: true, not: ["(?:\\bnot|\\bnever|n't) " + ND + "(?:true (?:shape|size)|turned|rotated|traced|copied)"], any: ["(plan|floor|room|layout).{0,40}(true shape|true size|not distorted|undistorted|same shape|unchanged)", "\\b(?:without|no|zero|little|minimal) (?:any )?distortion", "(floor|plan|room|layout)( \\w+){0,4} (is|are|stays?|remains?) (shown|drawn|kept|seen)( \\w+){0,2} (true|accurate|correct|full size|actual size|unchanged|as it is)", "true shape (of|for) the (plan|floor|room|layout)", "(plan|floor|layout) (can be |is |gets |are |simply )?(turned|rotated|traced)", "(turn|rotate|trace)(d|s|ing)? the (plan|floor|layout|room)", "(floor|plan|layout) (is |stays |remains )?(not (stretched|changed|distorted))", "\\b(plan|floor|layout)\\b(?: [\\w']+){0,3} (tilt|turn|rotat|swivel|twist|spin|angle|skew)\\w*", "(tilt|turn|rotat|swivel|twist|spin|angle|skew)\\w*(?: [\\w']+){0,3} (height|vertical|upwards|up)\\b", "(start|begin|based|built|work|use)\\w* (from|with|on|off) (the |a |an )?(actual |existing |real |original )?(floor )?plan", "\\b(plan|floor|layout)\\b (stays|remains|is|are|stay) (true|accurate|exact|correct|undistorted|the same)", "(true|accurate|exact|correct|undistorted|real|actual) (plan|floor|layout|shape)"] },
              { desc: "Effect: quick and easy to draw, with the positions and sizes of the furniture on the floor correct", win: 60, negOK: true, not: ["(?:\\bnot|\\bnever|n't) " + ND + "(?:quick|easy|simple|fast|accurate|correct|right|true)"], any: ["(quick|easy|easier|simple|simpler|fast|faster|straightforward|less work) (to|and) (draw|construct|produce|create|do|plot|make|set up)", "(draw|draws|produce|construct|create|make|made|done)n? (it |them )?(quickly|easily|fast|faster|simply)", "furniture.{0,30}(correct|true|accurate|right|exact|proper|same) (positions?|places?|sizes?|distances?|spacing)", "(accurately|correctly|exactly|properly|precisely) (placed|positioned|shown|located|drawn|laid|put)", "(fast|quick|quicker|easy|easier|simple|simpler)( \\w+){0,2} (method|way|technique|process|to do|to use|to produce)", "(positions?|distances?|sizes?|layout|measurements?|spacing)(?: [\\w']+){0,7} (stay|remain|are|is|kept|still|can be|be)(?: [\\w']+)? (accurate|correct|true|to scale|exact|right)", "(easy|easier|simple|clear|clearer|quick|quickly|helps?)( \\w+){0,3} (to )?(see|understand|visuali[sz]e|show|judge|plan|work out|find)\\w*( \\w+){0,4} (furniture|layout|chairs?|tables?|positions?|arranged|where|beds?)"] },
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
              { desc: "Reason: it is essential to the shaft fitting and the part working", win: 40, any: ["(?<!not )(?<!n't )(essential|critical|vital|crucial|necessary) (to|for) ((the|how|what|making|way) )*(shaft|fit|part|bore|function|it|working|work|flange)", "shaft (must |has to |needs to |to |should |can |also )?(fit|goes|sits|slides)", "(small|tight|close|fine|precise|exact|accurate) (tolerance|fit)", "(would|will|won't|wouldn't) (not |n't )?(work|function)", "(part|flange) (to )?(work|function)s? (properly|correctly)", "(has|have|needs?|must|need|got) to (fit|work|function)", "(hole|bore|shaft|parts?|pieces?|flange)( \\w+){0,4} (have|has|need|needs|must) to (go|fit|work|slot|join|mate|assemble|match)", "tolerance (must|has to|needs to|should|needs) be (tight|small|close|fine|precise|narrow|accurate)", "(for|so) the (part|flange|shaft|bore) (to |can )?(fit|work|function)", "shaft (fits?|works?|turns?|runs?|rotates?) (properly|correctly|smoothly|well|freely|snugly|tightly)", "fit(s|ting)? (the |a |its )?shaft (properly|correctly|closely|tightly|snugly|exactly|well)", "tight(ly)? (tolerance|fit)", "(has|have|needs?|must|need|got|should) to be (accurate|exact|precise|the right size|a certain size|correct|a good fit|spot on)", "shaft (?:(?:to|must|can|will|would|needs? to|has to|should|could|might|may|is|was|be|would be|will be|being) )?(?:fits?|fitting|loose|tight|wobble|jam|stuck|works?|functions?|turn|rotate)", "(wrong|incorrect|inaccurate|too (big|small|large|tight|loose)).{0,50}(loose|tight|wobble|jam|stuck|fail|not (fit|work|function)|n't (fit|work|function))", "(depends?|relies|rely|relying) on"], not: ["^\\W*(nf|non-?functional)\\b", "(?:is|it'?s|be|label(?:l)?ed) (?:a |an )?(?:non-?functional|nf)\\b"] },
            ],
            sample: "It is functional (F), because the bore receives the shaft and has to fit it closely, so a tight tolerance is needed for the part to work properly and for the shaft to turn smoothly.",
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
              { desc: "Plan shape: in planometric the plan keeps its true shape (circles stay circles), whereas in isometric no face is true shape and circles become ellipses", negOK: true, win: 140,
                not: ["(?:" + ISO + ")(?:(?!" + PLN + "|whereas|but|while|however|unlike|[.;]).){0,50}(?<!no )(?<!not )(?<!n't )(?:true (?:shape|size)|real shape|circles? (?:stay|remain|keep)|circles? (?:is|are) (?:still )?(?:circles|round|circular|true)|not distorted|keeps? (?:its|the))", "(?:" + PLN + ")(?:(?!" + ISO + "|whereas|but|while|however|unlike|[.;]).){0,50}(?<!not )(?<!n't )(?<!un)(?<!no )(?<!nothing )(?:ellips|oval)"],
                all: ["(?:real|true|actual|same|undistorted|unchanged|original|correct|exact|accurate|proper)(?: \\w+)? (?:shape|size|angles|proportions)|(?:not|n't) (?:\\w+ )?(?:distort\\w*|stretch\\w*|squash\\w*|changed?|skew\\w*)|undistorted|(?:stays?|remains?|keeps?|kept) (?:\\w+ ){0,2}(?:circles?|round|circular|shape)|circles? (?:stays?|remains?|kept|is|are|looks?) (?:\\w+ )?(?:circl|round|circular|true)|(?:angles?|right angles?|corners?)(?: \\w+){0,4} (?:stays?|remains?|kept|keeps?)(?: \\w+){0,2} (?:90|right|square|true|the same)|(?:keeps?|kept|retains?|maintains?|preserves?)(?: \\w+){0,5} (?:true|correct|accurate|unchanged|undistorted|the same)\\b", "(?<!not )(?<!n't )(?<!un)(?<!no )(?:ellips|\\boval)|(?:" + ISO + ")(?:\\W+\\w+){0,8}\\W+(?<!not )(?<!n't )(?:distort|squash|squeez|skew|stretch)|(?<!not )(?<!n't )(?<!un)(?:distort|squash|squeez|skew|stretch)\\w*(?:\\W+\\w+){0,8}\\W+(?:" + ISO + ")|(?:not|n't|no) (?:a |an )?(?:true|real|actual) (?:shape|size)|(?:become|becomes|changes? to|changed to|turn into|turns into) (?:\\w+ )?(?:60|120) ?(?:°|degrees?)|\\bunlike(?: an?| the)? iso(?:metric)?\\b(?:[^.;]{0,80})(?:true|real|actual|undistorted) (?:shape|size)|(?:true|real|actual) (?:shape|size)[^.;]{0,60}\\bunlike(?: an?| the)? iso(?:metric)?\\b|(?:not|n't) (?:\\w+ )?(?:distort\\w*|stretch\\w*|squash\\w*|skew\\w*|changed?),? (?:but|whereas|while|however)\\b[^.;]{0,25}\\biso"], group: "shape" },
              { desc: "Axes: isometric has both horizontal axes at 30° (all three axes 120° apart), whereas planometric turns the plan to 45°/45° or 30°/60°", negOK: true, win: 160, all: ["(?:" + ISO + ")" + W10 + "(\\b30 ?(°|degrees?)|\\b30\\b)|\\b30 ?(°|degrees?)" + W5 + "(to the horizontal|each side|both sides|isometric|iso\\b)|120 ?(°|degrees?)? ?apart|(all|three) (the )?(three )?(axes|angles)" + W5 + "120", "(?:" + PLN + ")" + W10 + "(45|30 ?(°|degrees?)? ?(and|/|or) ?60)|(45|30 ?(°|degrees?)? ?(and|/|or) ?60)" + W5 + "(?:" + PLN + ")|plan (is |can be )?(turned|rotated)(\\W+\\w+){0,3}\\W+(45|30)|(?:" + PLN + ")" + W10 + "(?:turn|rotat|tilt|twist|swivel|swing|angl)\\w*(?:\\W+\\w+){0,3}\\W+plan|(?:turn|rotat|tilt|twist|swivel)\\w*(?:\\W+\\w+){0,3}\\W+plan\\w*" + W10 + "(?:" + PLN + ")|plan (?:is |can be |gets |being )?(?:turn|rotat|tilt|twist|swivel)\\w*" + W10 + "(?:" + PLN + ")"], group: "axes" },
              { desc: "Similarity: in both, vertical lines are drawn vertical and heights are measured full size (or both show three faces at once)", negOK: true, win: 80, all: ["(lines?|edges?|axes|faces|sides|drawings?|views?|methods?|pictorials?|ways|types|height|verticals?)"], any: ["both( \\w+){0,4} (vertical|heights?|upright|three (faces|sides)|3d|three.dimensional)", "both\\W+(?:\\w+\\W+){0,5}(vertical|upright|heights?|three (faces|sides))", "(vertical|heights?|upright|verticals)( lines| edges)?( \\w+){0,3} (in|for|on) (both|each|either)", "(vertical|heights?|upright|verticals)( lines| edges)?( \\w+){0,3} (the same|same)( \\w+){0,3} (in|for)? ?(both|each)", "(similar|alike|in common|the same|share|shares|common)\\b.{0,60}(vertical|upright|heights?|three (faces|sides)|full size|3d)", "(vertical|upright|heights?|three (faces|sides)).{0,60}(similar|alike|in common|the same in|share|shares)"] },
              { desc: "Use: planometric is quick for a room layout because the floor plan can be traced and turned, whereas isometric means redrawing the plan at 30°", negOK: true, win: 170, any: ["(floor |room )?plan (can be |is |simply |just |easily |can simply be )*(traced|turned|rotated|copied)|(trace|turn|rotate|copy|copies|tilt)\\w* (the |your |a |that )?(floor |room )?plan|\\bplan\\b.{0,30}(trace|copie|copy|turn|rotat|tilt)\\w*|quick(er)? (to|for)(\\W+\\w+){0,3}\\W+(room|layout|interior|floor)|(simple|easy|easier|faster|fast|quick|quicker)\\W+(?:\\w+\\W+){0,4}(plan|layout|room|interior|floor)", "(?:"+ISO+")"+W10+"(?:(redraw|re-draw)(n|ing|s)?\\b|draw (it |the plan )?again|more work|\\bharder|slower|takes longer|(cannot|can'?t|not) (be )?(simply )?(trace|copi)|(built|build|start|set out|construct|draw|made|make)\\w* (it |the plan |them )?(up )?(again|from scratch|afresh|new|separately)|from scratch|more (complicated|complex|difficult|steps))", "(?:(redraw|re-draw)(n|ing|s)?\\b|draw (it |the plan )?again|more work|\\bharder|slower|takes longer|(cannot|can'?t|not) (be )?(simply )?(trace|copi)|(built|build|start|set out|construct|draw|made|make)\\w* (it |the plan |them )?(up )?(again|from scratch|afresh|new|separately)|from scratch|more (complicated|complex|difficult|steps))"+W10+"(?:"+ISO+")"], group: "use" },
              { desc: "Appearance: planometric looks stretched upwards (verticals may be shortened), whereas isometric looks more balanced / natural", negOK: true, win: 140,
                not: ["(?:" + ISO + ")(?:(?!" + PLN + "|whereas|but|while|however|unlike|[.;,]).){0,30}(?<!not )(?<!n't )(?<!less )(?<!un)(?:stretch|elongat|tall)"],
                all: ["(?:" + PLN + ")" + W5 + "(stretch|tall|taller|distort|elongat|exaggerat|lopsided|odd|unnatural)|(stretch|tall|taller|distort|elongat|exaggerat|unnatural)\\w*" + W5 + "(?:" + PLN + ")", "(?:" + ISO + ")" + W5 + "(balanc|natural|realistic|even|equal|proportion|symmetr|better)|(balanc|natural|realistic|even|equal|proportion|symmetr)\\w*" + W5 + "(?:" + ISO + ")"] },
            ],
            sample: "In an isometric drawing both horizontal axes are drawn at 30\u00b0 so no face is true shape and a circle on the floor becomes an ellipse, whereas in a planometric drawing the plan keeps its true shape so a circle in the plan stays a circle. Planometric turns the plan to 45\u00b0 and 45\u00b0, but isometric has all three axes 120\u00b0 apart. In both drawings the vertical lines are drawn vertical. Planometric is quick for a room layout because the floor plan can simply be traced and turned, while isometric means redrawing the plan at 30\u00b0.",
            model: mi("Plan shape: planometric keeps the plan at true shape (circles stay circles), but isometric has no true-shape face and circles become ellipses (1)", "Axes: isometric uses 30\u00b0 on both horizontal axes (all axes 120\u00b0 apart), but planometric turns the plan to 45\u00b0/45\u00b0 or 30\u00b0/60\u00b0 (1)", "Similarity: in both, vertical lines stay vertical / heights are drawn full size, and both show three faces in one view (1)", "Use: planometric is quick for an interior because the floor plan can be traced and turned, but isometric means redrawing the plan at 30\u00b0 (1)", "Appearance: planometric tends to look stretched upwards (some illustrators shorten the verticals), but isometric looks more balanced (1)") + "<p>A comparison must give both sides, for example with <em>whereas</em>, <em>but</em> or <em>both</em>.</p>",
          },
        ],
      },
      {
        id: "interp-12",
        style: "Scenario question · true shape and the auxiliary view",
        stem: "<p>The mast stub of a model ship is a cylinder of diameter 30 mm that stands upright. Its top is cut by a plane at 60° to the horizontal. The plane is at 90° to the elevation, so the elevation shows the cut as a single sloping line. Plan and elevation are in third-angle projection.</p>",
        figure: fig12,
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "What shape does the cut face have in the plan?", opts: ["An ellipse", "A circle", "A rectangle", "A straight line"], a: 1, why: "The sides of the cylinder are vertical, so from above every point of the cut edge still lies on the circle of the cylinder. The plan of the cut face is a circle." },
          { label: "(b)", type: "mcq", marks: 1, q: "What is the true shape of the cut face?", opts: ["A circle", "A rectangle", "An ellipse", "A semicircle"], a: 2, why: "A cylinder cut at an angle to its axis has an elliptical section. An auxiliary view of the sloping face is needed to draw it." },
          { label: "(c)", type: "num", marks: 1, a: 30, tol: 0, unit: "mm", q: "State the length of the minor axis of the true shape.", why: "Across the cut the width is unchanged: it comes straight from the plan, where it is the diameter of the cylinder, 30 mm." },
          { label: "(d)", type: "num", marks: 1, a: 60, tol: 0, unit: "mm", q: "Calculate the length of the major axis of the true shape.", why: "Along the cut the length is the cut line in the elevation, seen at its true length because the plane is at 90° to the elevation. Major axis = diameter ÷ cos (angle of the cut to the horizontal) = 30 ÷ cos 60° = 30 ÷ 0.5 = 60 mm." },
          {
            label: "(e)", type: "text", marks: 2, rows: 3,
            q: "Explain why the auxiliary view of the cut face is projected at right angles to the cut line.",
            points: [
              { desc: "Cause: it makes you look straight at (square-on to) the sloping face", win: 100,
                not: ["(?:project|view|look|seen|drawn|taken|line of sight)\\w*(?: [\\w']+){0,4} (?:at|of|by|from|to|through) (?:an? )?(?:angle of )?(?!90\\b)(?!ninety)\\d+ ?(?:°|degrees?|deg\\b)(?:(?!would|if |not|n't|otherwise|foreshort|distort|wrong|instead|rather|other|but|whereas|unlike|right angle|perpendicular|90|square|[.;]).){0,40}(?:true|real|actual) (?:shape|size)", "(?:project|view|look|seen|drawn|taken)\\w*(?: [\\w']+){0,3} (?:at|from) an? (?!right)(?:\\w+ )?angle(?:(?!would|if |not|n't|otherwise|foreshort|distort|wrong|instead|rather|other|right angle|perpendicular|90|square|[.;]).){0,40}(?:true|real|actual) (?:shape|size)"],
                any: ["\\b(?:look\\w*|viewing|viewed|viewer|you view|to view|we view|sees?|seeing|seen|sight|eyes?)\\b(?: [\\w']+){0,3} (?:at )?(?:right[- ]angles?|90 ?(?:°|degrees?)|ninety|perpendicular\\w*|square|normal) (?:to |with |onto |on |against )?(?:the |it|its |that |this )?(?:face|surface|plane|slop|slant|incline|inclin|angled|oblique|cut face)", "(look|looking|view|viewing|see|seeing|seen|face|facing)\\w* (it |the face |the surface |the cut face |at the face |at it )?(straight|square|directly|head)[- ]?(on|at)", "square[- ]?on", "face[- ]?on", "perpendicular", "parallel to the (new |auxiliary )?(view|picture plane|viewing plane|plane of the view|line of sight)", "(straight|directly|square) (at|onto|towards) the (face|surface|cut)", "(looks?|looking|views?|viewing) (straight|directly|square)[- ]?(on|at|onto)", "line of sight (is |being |would be )?(normal|perpendicular|at 90|at right)", "(normal|at 90|at right angles?|square) to the (face|surface|sloping|slanted|inclined|angled)", "(directly|straight|square|squarely|right) (facing|opposite|in front of|towards?|onto)", "head[- ]?on", "facing (the |it |that )?(face |surface )?(directly|straight|squarely)", "(directly|straight) (to|at) (the |that )(face|surface|cut|slop)", "\\b(look|looking|view|viewing)\\w*( \\w+){0,2} (directly|straight|squarely|square) (at|on|onto|towards?|in front|ahead)\\b", "\\b(directly|straight|squarely)\\b( \\w+){0,2} (at|on) the (face|surface|cut|sloping)"] },
              { desc: "Effect: so the face is seen at its true shape / size, not foreshortened or slanted", win: 100, negOK: true,
                not: ["\\b(?:is|are|was|were) ?(?:not|never|n't) (?:\\w+ )?(?:seen|shown|true|real|actual|full|drawn|projected|viewed|at)\\b", "\\b(?:isn|aren|wasn|weren)'t (?:\\w+ )?(?:seen|shown|true|real|actual|full|drawn|projected|viewed|at)\\b", "(?:project|view|look|seen|drawn|taken|line of sight)\\w*(?: [\\w']+){0,4} (?:at|of|by|from|to|through) (?:an? )?(?:angle of )?(?!90\\b)(?!ninety)\\d+ ?(?:°|degrees?|deg\\b)(?:(?!would|if |not|n't|otherwise|foreshort|distort|wrong|instead|rather|other|but|whereas|unlike|right angle|perpendicular|90|square|[.;]).){0,40}(?:true|real|actual) (?:shape|size)", "(?:project|view|look|seen|drawn|taken)\\w*(?: [\\w']+){0,3} (?:at|from) an? (?!right)(?:\\w+ )?angle(?:(?!would|if |not|n't|otherwise|foreshort|distort|wrong|instead|rather|other|right angle|perpendicular|90|square|[.;]).){0,40}(?:true|real|actual) (?:shape|size)"],
                any: ["(true|real|actual|full|proper|correct|exact|accurate) (shape|size|length)", "\\b(?:look|looks|looked|appear|appears|seem|seems|be|been|is|are|become|becomes|get|gets|comes? out|end up|ends up|shows?|showing|giving)(?: (?:not|n't|more|too|very|rather|quite|slightly|badly|really|be|been|being|look|looks|appear|so|just|all|a bit))? (?:foreshorten|distort|slant|squash|squeez|skew|stretch)", "(?:foreshorten|distort|slant|squash|squeez|skew|stretch)\\w* (?:view|image|drawing|picture)\\b", "(wrong|incorrect|different|inaccurate) (shape|size)"] },
            ],
            sample: "Projecting square to the cut line means you look straight at the face, so it is seen at its true shape. At any other angle it would look slanted and foreshortened.",
            model: mi("Projecting at 90° to the cut line means you are looking straight at (square-on to) the sloping face (cause) (1)", "…so it is seen at its true shape and size; at any other angle it would look slanted and foreshortened (effect) (1)") + "<p>Also acceptable: the face is parallel to the new picture plane, so lengths on it are true lengths.</p>",
          },
        ],
      },
      {
        id: "interp-13",
        style: "Scenario question · interpenetration of pipes",
        stem: "<p>A pipe fitter is making a pipe junction for a ship's ventilation system. An upright pipe and a branch pipe are cut from tube and welded together along the line where they meet. The elevation of the junction is shown. Sizes are in mm.</p>",
        figure: fig13,
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "What is the name for the line K, where the surfaces of the two pipes meet?", opts: ["Fold line", "Generator", "Line of interpenetration", "Datum"], a: 2, why: "Where one solid passes into or through another, the surfaces meet along a line of intersection, also called the line of interpenetration. It is the edge the fitter cuts and welds along." },
          {
            label: "(b)", type: "text", marks: 2, rows: 3,
            q: "The line where two cylinders meet is normally a curve, but K is drawn differently. Explain why.",
            points: [
              { desc: "Cause: the two pipes are the same diameter and their axes meet", win: 120, negOK: true, not: ["(?<!if )(?<!if they )(?<!if the pipes )(?<!were )(?<!was )(?:are|is|do|does) ?(?:not|n't) (?:\\w+ )?(?:the )?(?:same|equal|identical|meet|intersect|cross|match)", "(?<!if )(?<!were )(?:different|unequal|differing) (?:\\w+ )?(?:diameters?|sizes?|widths?)(?! would)", "do(?:es)? ?(?:not|n't) (?:\\w+ )?(?:meet|intersect|cross)","\\btime\\b", "sketch", "quick", "lazy", "rough", "simpl(er|ify|ified)", "easier", "bothered", "estimat", "approximat", "plot the curve", "too (hard|difficult|long)"],
                all: ["(same|equal|identical|matching)( \\w+)? (diameters?|size|width|thickness)|(diameters?|pipes?|cylinders?|they)( are| is| have| has)?( the)? (same|equal|identical)|(diameters?|widths?|sizes?|thickness(es)?) (\\w+ )?(match|are alike)|(match|equal|identical)(ing)? (in )?(diameter|size|width)", "(meeting|crossing|intersecting|intersect|crossed|coinciding|aligned)( \\w+){0,2} (axes|axis|centre ?lines?|centerlines?)|(axes|axis|centre ?lines?|centers?|centres?|middle)( of (both|the)( \\w+)?)?( \\w+){0,2} (meet|cross|intersect|line up|align|join|coincide)|meet (at|in|on) (a |the )?(point|centre|middle|centreline)|(meet|cross|intersect|join) (each other )?(at|in|on) (their |the |a |its )?(\\w+ )?(centres?|centers?|middle|centreline|point|axes|axis)"] },
              { desc: "Effect: so the line of intersection is seen as straight (diagonal) lines in the elevation", win: 160, negOK: true, not: ["(?<!if )(?<!if they )(?<!if the pipes )(?<!were )(?<!was )(?:are|is|do|does) ?(?:not|n't) (?:\\w+ )?(?:the )?(?:same|equal|identical|meet|intersect|cross|match)", "do(?:es)? ?(?:not|n't) (?:\\w+ )?(?:meet|intersect|cross)","\\btime\\b", "sketch", "quick", "lazy", "rough", "simpl(er|ify|ified)", "easier", "bothered", "estimat", "approximat", "plot the curve", "too (hard|difficult|long)"],
                all: ["straight|diagonal|\\bv[- ]?shape", "(same|equal|identical|matching)|\\bplanes?\\b|(axes|axis|centre ?lines?)( \\w+){0,4} (meet|cross|intersect|line up|align|coincide)|meet (at|in|on) (a |the )?(point|centre|middle|centreline)"] },
            ],
            sample: "The two pipes have equal diameters and their axes meet, so in the elevation the line of intersection is seen as straight diagonal lines.",
            model: mi("The two cylinders are the same diameter and their axes meet (cause) (1)", "…so in the elevation the curve is seen as straight lines (effect) (1)") + "<p>If the diameters differed, or the axes did not meet, the line would be a curve that has to be plotted.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 3,
            q: "A second, smaller pipe passes through a large one and its line of intersection is plotted using twelve generators. Explain why twelve are used rather than two or three.",
            points: [
              { desc: "Cause: twelve give enough points, including the top, bottom, front and back where the curve turns", win: 100, negOK: true,
                not: ["no need|unnecessary|not necessary|waste|too many|overkill|enough (with|to)|would be enough|will be enough|is enough"],
                any: ["(two|three|2|3|few|fewer|only|just)\\b.{0,40}(\\bnot\\b|n't|cannot|insufficient|too few|too little|\\bmiss|\\bleave|\\bskip)", "(twelve|12|a dozen|lots|many)( \\w+){0,3} (points|positions|places|plotted)", "(not|n't|too few|insufficient|too little)( \\w+){0,3} (enough|sufficient|points|plotted)","(top|bottom|front|back|sides?|turning|key|important|extreme)( \\w+){0,3} (points?|positions?|places?|where the curve (turns|changes|bends))", "where the curve (turns|changes|bends|is widest|reaches)", "enough (points|generators|positions|plotted)", "(more|many|plenty of|lots of|several) (more )?(points|positions)"] },
              { desc: "Effect: so the curve can be drawn smoothly and accurately instead of guessed", win: 100, negOK: true,
                not: ["no need|unnecessary|not necessary|waste|too many|overkill|enough (with|to)|would be enough|will be enough|is enough", "\\b" + NA + " (?:\\w+ ){0,1}(?:drawn|plotted|found|accurate|smooth|exact|precise|correct)"],
                any: ["(?:draw|drawn|drawing|plot|plotted|get|make|find|show|join|trace|produce|create|construct)\\w*(?: [\\w']+){0,4} (?:accura|smooth|precis|exact|properly|correct|neat)\\w*", "(?:accura|smooth|precis|exact)\\w* (?:curve|line|shape|intersection|drawing|result|outline)", "(?:curve|line|intersection|shape|result|outline|drawing)(?: [\\w']+){0,2} (?:is|are|becomes?|will be|would be|looks?|more) (?:\\w+ )?(?:accura|smooth|precis|exact)\\w*", "(?:instead of|rather than|not|without|avoid|no need to|stop|don't have to|doesn't have to|so (?:you|we|it) (?:don't|doesn't|won't|aren't))(?: [\\w']+){0,3} (?:guess|estimat|approximat)\\w*", "(?:guess|estimat)\\w*(?: [\\w']+){0,3} (?:the|its) (?:curve|shape|line)", "shape of the (curve|line)", "correct (curve|shape|line)", "true (curve|shape)"] },
            ],
            sample: "Twelve generators give points at the top, bottom, front and back, where the curve turns, so the curve can be drawn accurately instead of guessing its shape.",
            model: mi("Twelve generators give enough points, including the top, bottom, front and back of the smaller pipe where the curve turns (cause) (1)", "…so the curve can be drawn accurately through plotted points instead of being guessed (effect) (1)") + "<p>Fewer generators leave gaps, and the shape of the curve, and any part of it that goes hidden, would be guesswork.</p>",
          },
          { label: "(d)", type: "mcq", marks: 1, q: "A cylinder meets a flat face that is seen edge-on in the elevation. How does their line of intersection appear in that view?", opts: ["An ellipse", "A circle", "A smooth curve", "A straight line"], a: 3, why: "A cylinder meeting a flat face meets it in a curve (part of an ellipse), unless you see the face edge-on, when the line of intersection is a straight line." },
        ],
      },
    ],
  };
})();
