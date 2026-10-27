/* Past-paper practice: structures and materials. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HEP_BANK = window.HEP_BANK || {});
  const R = String.raw;

  /* ---------- marking helpers ---------- */
  /* near(a, b, n): regex source matching a and b in either order with at most n words between them. */
  const near = (a, b, n) => { const g = "\\W+(?:\\w+\\W+){0," + (n == null ? 3 : n) + "}"; return "\\b(?:" + a + ")\\b" + g + "\\b(?:" + b + ")\\b|\\b(?:" + b + ")\\b" + g + "\\b(?:" + a + ")\\b"; };

  /* ---------- small SVG kit (cream paper, drawing-office style) ---------- */
  const INK = "#2b2418", BLUE = "#1f5f8b", RED = "#b3261e", GREY = "#8a8070", FILL = "#e9dfc8", GRID = "#d9cfb6";
  const fig = (w, h, label, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" role="img" aria-label="${label}" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${INK}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const f1 = (n) => (Math.round(n * 10) / 10).toString();
  const T = (x, y, s, o) => { o = o || {}; return `<text x="${f1(x)}" y="${f1(y)}" text-anchor="${o.a || "middle"}"${o.b ? ' font-weight="700"' : ""}${o.c ? ` fill="${o.c}"` : ""}${o.s ? ` font-size="${o.s}"` : ""}${o.i ? ' font-style="italic"' : ""}>${s}</text>`; };
  const L = (x1, y1, x2, y2, c, w, d) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${c || INK}" stroke-width="${w || 2}"${d ? ` stroke-dasharray="${d}"` : ""}/>`;
  const arrow = (x1, y1, x2, y2, c, w) => {
    c = c || RED; w = w || 2.5;
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, h = 11, hw = 4.8;
    const bx = x2 - ux * h, by = y2 - uy * h;
    return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(bx)}" y2="${f1(by)}" stroke="${c}" stroke-width="${w}"/><polygon points="${f1(x2)},${f1(y2)} ${f1(bx - uy * hw)},${f1(by + ux * hw)} ${f1(bx + uy * hw)},${f1(by - ux * hw)}" fill="${c}" stroke="none"/>`;
  };
  const dot = (x, y, r) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r || 3.5}" fill="${INK}"/>`;
  const ground = (x, y, w) => {
    let s = L(x - w / 2, y, x + w / 2, y, INK, 2);
    for (let k = -w / 2 + 6; k < w / 2; k += 9) s += L(k + x, y, k + x - 7, y + 8, GREY, 1.4);
    return s;
  };
  /* hinge (pin) support: apex at (x, y) */
  const hinge = (x, y) => `<polygon points="${x},${y} ${x - 13},${y + 22} ${x + 13},${y + 22}" fill="${FILL}" stroke="${INK}" stroke-width="2"/>${dot(x, y, 3.2)}${ground(x, y + 22, 44)}`;
  /* roller support on level ground */
  const roller = (x, y) => `<polygon points="${x},${y} ${x - 13},${y + 17} ${x + 13},${y + 17}" fill="${FILL}" stroke="${INK}" stroke-width="2"/><circle cx="${x - 7}" cy="${y + 22}" r="5" fill="${FILL}" stroke="${INK}" stroke-width="1.8"/><circle cx="${x + 7}" cy="${y + 22}" r="5" fill="${FILL}" stroke="${INK}" stroke-width="1.8"/>${ground(x, y + 27, 44)}`;
  /* horizontal dimension line between x1 and x2 at height y */
  const dimH = (x1, x2, y, s) => L(x1, y, x2, y, GREY, 1.4) + L(x1, y - 5, x1, y + 5, GREY, 1.4) + L(x2, y - 5, x2, y + 5, GREY, 1.4) + T((x1 + x2) / 2, y - 6, s, { s: 12 });

  /* ---------- figures ---------- */
  /* st-02: two forces on a ring-bolt */
  const figForces = (() => {
    const ox = 200, oy = 190, k = 12;
    const e = [ox + 10 * k, oy], u = [ox + 8 * k * Math.cos((120 * Math.PI) / 180), oy - 8 * k * Math.sin((120 * Math.PI) / 180)];
    return fig(440, 260, "Two forces pull on a ring-bolt at O. A force of 10 kilonewtons points due east and a force of 8 kilonewtons points up and to the left, at 120 degrees anticlockwise from east.",
      L(ox - 150, oy, ox + 190, oy, GRID, 1.2, "5 4") + L(ox, oy + 40, ox, oy - 150, GRID, 1.2, "5 4") +
      `<path d="M ${ox + 34} ${oy} A 34 34 0 0 0 ${f1(ox + 34 * Math.cos((120 * Math.PI) / 180))} ${f1(oy - 34 * Math.sin((120 * Math.PI) / 180))}" fill="none" stroke="${GREY}" stroke-width="1.6"/>` +
      arrow(ox, oy, e[0], e[1], RED) + arrow(ox, oy, u[0], u[1], BLUE) + dot(ox, oy, 5) +
      T(ox - 11, oy + 17, "O", { b: 1 }) + T(e[0] - 10, oy + 22, "10 kN", { c: RED, b: 1 }) + T(u[0] - 18, u[1] - 6, "8 kN", { c: BLUE, b: 1 }) +
      T(ox + 14, oy - 40, "120°", { s: 12, a: "start" }) + T(ox + 188, oy + 4, "east", { s: 12, a: "end", c: GREY }));
  })();

  /* st-03: ring hung from two ropes */
  const figRopes = (() => {
    const rx = 270, ry = 190, rise = 150, cy = ry - rise;
    const lx = rx - rise / Math.tan((35 * Math.PI) / 180), qx = rx + rise / Math.tan((60 * Math.PI) / 180);
    return fig(460, 320, "A 45 kilonewton weight hangs from a ring. Rope A runs up and to the left to a ceiling at 35 degrees to the ceiling. Rope B runs up and to the right to the ceiling at 60 degrees to the ceiling.",
      L(lx - 40, cy, qx + 60, cy, INK, 2.5) +
      Array.from({ length: 18 }, (_, i) => L(lx - 36 + i * 22, cy, lx - 44 + i * 22, cy - 9, GREY, 1.4)).join("") +
      L(rx, ry, lx, cy, INK, 3) + L(rx, ry, qx, cy, INK, 3) + L(rx, ry, rx, ry + 80, INK, 3) +
      `<circle cx="${rx}" cy="${ry}" r="7" fill="${FILL}" stroke="${INK}" stroke-width="2.4"/>` +
      `<rect x="${rx - 28}" y="${ry + 80}" width="56" height="42" fill="${FILL}" stroke="${INK}" stroke-width="2"/>` + T(rx, ry + 106, "45 kN", { b: 1 }) +
      `<path d="M ${lx + 38} ${cy} A 38 38 0 0 0 ${f1(lx + 38 * Math.cos((35 * Math.PI) / 180))} ${f1(cy + 38 * Math.sin((35 * Math.PI) / 180))}" fill="none" stroke="${GREY}" stroke-width="1.6"/>` +
      `<path d="M ${qx - 30} ${cy} A 30 30 0 0 1 ${f1(qx - 30 * Math.cos((60 * Math.PI) / 180))} ${f1(cy + 30 * Math.sin((60 * Math.PI) / 180))}" fill="none" stroke="${GREY}" stroke-width="1.6"/>` +
      T(lx + 70, cy + 17, "35°", { s: 12 }) + T(qx - 40, cy + 38, "60°", { s: 12 }) +
      T((lx + rx) / 2 - 16, (cy + ry) / 2 - 6, "rope A", { b: 1, c: BLUE }) + T((qx + rx) / 2 + 32, (cy + ry) / 2 + 12, "rope B", { b: 1, c: BLUE }) + T(rx + 18, ry + 22, "ring", { a: "start", s: 12, c: GREY }));
  })();

  /* st-04: beam with a part-length UDL and a point load */
  const figUdl = (() => {
    const x0 = 50, k = 44, y = 130;
    const X = (m) => x0 + m * k;
    let s = `<rect x="${x0}" y="${y}" width="${10 * k}" height="10" fill="${FILL}" stroke="${INK}" stroke-width="2"/>`;
    s += hinge(X(0), y + 10) + roller(X(10), y + 10);
    s += L(X(1), y - 52, X(7), y - 52, RED, 2);
    for (let m = 1; m <= 7; m++) s += arrow(X(m), y - 52, X(m), y, RED, 2);
    s += T(X(4), y - 62, "5 kN/m", { b: 1, c: RED });
    s += arrow(X(8), y - 64, X(8), y, BLUE, 3) + T(X(8), y - 72, "24 kN", { b: 1, c: BLUE });
    s += T(X(0) - 2, y - 8, "A", { b: 1, a: "end" }) + T(X(10) + 2, y - 8, "B", { b: 1, a: "start" });
    s += dimH(X(0), X(1), 215, "1 m") + dimH(X(1), X(7), 215, "6 m") + dimH(X(7), X(8), 215, "1 m") + dimH(X(8), X(10), 215, "2 m");
    return fig(540, 245, "A horizontal beam AB, 10 metres long, is hinged at A on the left and rests on a roller at B on the right. A uniformly distributed load of 5 kilonewtons per metre covers 6 metres, from 1 metre to 7 metres from A. A 24 kilonewton point load acts downwards 8 metres from A.", s);
  })();

  /* st-05: beam with an inclined load */
  const figInclined = (() => {
    const x0 = 60, k = 55, y = 150;
    const X = (m) => x0 + m * k;
    const hx = X(3), len = 84, a = (30 * Math.PI) / 180;
    const tx = hx - len * Math.sin(a), ty = y - len * Math.cos(a);
    let s = `<rect x="${x0}" y="${y}" width="${8 * k}" height="10" fill="${FILL}" stroke="${INK}" stroke-width="2"/>`;
    s += hinge(X(0), y + 10) + roller(X(8), y + 10);
    s += L(hx, y - 96, hx, y, GREY, 1.4, "5 4") + arrow(tx, ty, hx, y, BLUE, 3);
    s += `<path d="M ${hx} ${y - 54} A 54 54 0 0 0 ${f1(hx - 54 * Math.sin(a))} ${f1(y - 54 * Math.cos(a))}" fill="none" stroke="${GREY}" stroke-width="1.6"/>` + T(hx - 28, y - 62, "30°", { s: 12 });
    s += T(tx - 6, ty - 8, "40 kN", { b: 1, c: BLUE, a: "end" });
    s += T(X(0) - 2, y - 8, "A", { b: 1, a: "end" }) + T(X(8) + 2, y - 8, "B", { b: 1, a: "start" });
    s += dimH(X(0), X(3), 222, "3 m") + dimH(X(3), X(8), 222, "5 m");
    return fig(540, 250, "A horizontal beam AB, 8 metres long, is hinged at A on the left and rests on a roller at B on the right. A 40 kilonewton load acts 3 metres from A. It points downwards and towards B, at 30 degrees to the vertical.", s);
  })();

  /* st-06: Warren truss */
  const figTruss = (() => {
    const s0 = 40, ya = 218, h = 104, X = (i) => s0 + i * 60; // joints every 1.5 m = 60 px
    const A = [X(1), ya], C = [X(3), ya], E = [X(5), ya], Bj = [X(2), ya - h], D = [X(4), ya - h];
    const mem = [[A, Bj], [Bj, C], [C, D], [D, E], [A, C], [C, E], [Bj, D]];
    let s = mem.map(([p, q]) => L(p[0], p[1], q[0], q[1], INK, 4)).join("");
    [A, C, E, Bj, D].forEach((p) => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="5.5" fill="${FILL}" stroke="${INK}" stroke-width="2"/>`; });
    s += hinge(A[0], A[1] + 6) + roller(E[0], E[1] + 6);
    s += arrow(Bj[0], Bj[1] - 62, Bj[0], Bj[1] - 6, BLUE, 3) + T(Bj[0] + 8, Bj[1] - 46, "24 kN", { b: 1, c: BLUE, a: "start" });
    s += T(A[0] - 10, A[1] - 8, "A", { b: 1, a: "end" }) + T(Bj[0] - 10, Bj[1] + 20, "B", { b: 1, a: "end" }) + T(C[0], C[1] - 12, "C", { b: 1 }) + T(D[0] + 10, D[1] + 20, "D", { b: 1, a: "start" }) + T(E[0] + 10, E[1] - 8, "E", { b: 1, a: "start" });
    s += `<path d="M ${A[0] + 28} ${A[1]} A 28 28 0 0 0 ${f1(A[0] + 28 * Math.cos(Math.PI / 3))} ${f1(A[1] - 28 * Math.sin(Math.PI / 3))}" fill="none" stroke="${GREY}" stroke-width="1.5"/>` + T(A[0] + 38, A[1] - 8, "60°", { s: 12, a: "start" });
    s += dimH(A[0], E[0], 292, "6 m (members AC, CE 3 m each)");
    return fig(500, 312, "A pin-jointed Warren truss ABCDE. Joints A, C and E lie on the bottom chord, 3 metres apart. Joints B and D lie on the top chord. Every member is 3 metres long, so every triangle is equilateral and the inclined members are at 60 degrees. The truss is hinged at A and rests on a roller at E. A 24 kilonewton load acts downwards at joint B.", s);
  })();

  /* st-07: wall jib crane space diagram */
  const figJib = (() => {
    const ax = 100, ay = 270, k = 100, bx = ax + 2.4 * k, cy = ay - 2.4 * Math.tan((35 * Math.PI) / 180) * k, dx = ax + 1.5 * k;
    let s = L(ax - 14, cy - 40, ax - 14, ay + 40, INK, 3);
    for (let y = cy - 36; y < ay + 40; y += 12) s += L(ax - 14, y, ax - 24, y + 8, GREY, 1.4);
    s += `<rect x="${ax}" y="${ay - 7}" width="${2.4 * k}" height="14" fill="${FILL}" stroke="${INK}" stroke-width="2"/>`;
    s += L(bx, ay - 7, ax - 2, cy, INK, 3) + dot(ax, ay, 5) + dot(ax, cy, 5) + dot(bx, ay, 4.5);
    s += arrow(dx, ay + 8, dx, ay + 72, BLUE, 3) + T(dx + 8, ay + 62, "W = 18 kN", { b: 1, c: BLUE, a: "start" });
    s += T(ax + 14, ay - 14, "A", { b: 1, a: "start" }) + T(ax + 14, cy - 6, "C", { b: 1, a: "start" }) + T(bx + 6, ay - 12, "B", { b: 1, a: "start" });
    s += T((ax + bx) / 2 + 24, cy + 62, "tie BC", { b: 1, c: RED });
    s += `<path d="M ${bx - 46} ${ay - 7} A 46 46 0 0 0 ${f1(bx - 46 * Math.cos((35 * Math.PI) / 180))} ${f1(ay - 7 - 46 * Math.sin((35 * Math.PI) / 180))}" fill="none" stroke="${GREY}" stroke-width="1.6"/>` + T(bx - 66, ay - 20, "35°", { s: 12 });
    s += dimH(ax, dx, 335, "1.5 m") + dimH(dx, bx, 335, "0.9 m") + T(ax - 36, ay - 6, "wall", { s: 12, c: GREY, a: "end" });
    return fig(440, 360, "A jib crane. A horizontal steel jib AB, 2.4 metres long, is pinned to a vertical wall at A. A tie BC runs from the end of the jib B up to the wall at C, making 35 degrees with the jib. A load W of 18 kilonewtons hangs from the jib 1.5 metres from A.", s);
  })();

  /* st-09: stress-strain graph, drawn to scale (x: 0 to 4.0 x10^-3, y: 0 to 400 N/mm2) */
  const figCurve = (() => {
    const x0 = 80, y0 = 330, kx = 115, ky = 0.75; // px per unit of strain (x10^-3) and per N/mm2
    const X = (e) => x0 + e * kx, Y = (sg) => y0 - sg * ky;
    const f = (e) => 300 + 50.8 * (1 - Math.exp(-(e - 2.5) / 1.0));
    let s = "";
    for (let sg = 0; sg <= 400; sg += 50) s += L(x0, Y(sg), X(4), Y(sg), GRID, 1) + T(x0 - 8, Y(sg) + 4, String(sg), { a: "end", s: 12 });
    for (let e = 0; e <= 4; e += 0.5) s += L(X(e), y0, X(e), Y(400), GRID, 1) + T(X(e), y0 + 17, e.toFixed(1), { s: 12 });
    s += L(x0, y0, X(4), y0, INK, 2.2) + L(x0, y0, x0, Y(400), INK, 2.2);
    let pts = `${f1(X(0))},${f1(Y(0))} ${f1(X(1.5))},${f1(Y(300))} ${f1(X(2.5))},${f1(Y(300))}`;
    for (let e = 2.6; e <= 4.0001; e += 0.1) pts += ` ${f1(X(e))},${f1(Y(f(e)))}`;
    s += `<polyline points="${pts}" fill="none" stroke="${BLUE}" stroke-width="3"/>`;
    s += L(X(3.0), Y(320), X(1.4), Y(0), RED, 2.2, "7 5") + `<circle cx="${X(3.0)}" cy="${Y(320)}" r="4.5" fill="${RED}"/>`;
    s += T(X(3.0) + 8, Y(320) - 10, "P", { b: 1, a: "start", c: RED });
    s += T(x0 + 230, y0 + 40, "strain (× 10⁻³)", { b: 1 });
    s += `<text transform="translate(26 ${y0 - 150}) rotate(-90)" text-anchor="middle" font-weight="700">stress (N/mm²)</text>`;
    s += T(X(0.3), Y(380), "mild-steel-like specimen, first part of the test", { a: "start", s: 12, c: GREY });
    return fig(540, 385, "Stress-strain graph for a metal specimen. Stress in newtons per square millimetre is on the vertical axis from 0 to 400 and strain in units of 10 to the minus 3 is on the horizontal axis from 0 to 4. The line is straight from the origin to 300 at a strain of 1.5, then runs level at 300 up to a strain of 2.5, then rises slowly and curves over to about 350 at a strain of 4. At point P, at a strain of 3.0 and a stress of 320, the specimen is unloaded along a dashed straight line that reaches zero stress at a strain of 1.4.", s);
  })();

  /* st-12: strain gauge potential divider */
  const figGauge = (() => {
    const x = 170;
    let s = L(x - 70, 40, x + 130, 40, INK, 2) + T(x - 76, 45, "+10 V", { a: "end", b: 1 });
    s += L(x, 40, x, 66, INK, 2) + `<rect x="${x - 13}" y="66" width="26" height="62" fill="${FILL}" stroke="${INK}" stroke-width="2"/>` + T(x - 22, 100, "350 Ω", { a: "end" }) + T(x - 22, 116, "fixed", { a: "end", s: 12, c: GREY });
    s += L(x, 128, x, 156, INK, 2) + dot(x, 156, 4) + L(x, 156, x + 130, 156, INK, 2) + T(x + 134, 160, "V", { a: "start", b: 1 }) + T(x + 144, 165, "out", { a: "start", s: 11 });
    s += L(x, 156, x, 184, INK, 2) + `<rect x="${x - 13}" y="184" width="26" height="62" fill="${FILL}" stroke="${INK}" stroke-width="2"/>`;
    s += L(x - 9, 192, x + 9, 192, BLUE, 2) + L(x + 9, 192, x - 9, 202, BLUE, 2) + L(x - 9, 202, x + 9, 212, BLUE, 2) + L(x + 9, 212, x - 9, 222, BLUE, 2) + L(x - 9, 222, x + 9, 232, BLUE, 2) + L(x + 9, 232, x - 9, 240, BLUE, 2);
    s += T(x - 22, 212, "strain gauge", { a: "end" }) + T(x - 22, 228, "350 Ω unstrained", { a: "end", s: 12, c: GREY });
    s += L(x, 246, x, 274, INK, 2) + L(x - 18, 274, x + 18, 274, INK, 2) + L(x - 11, 280, x + 11, 280, INK, 2) + L(x - 5, 286, x + 5, 286, INK, 2) + T(x + 26, 282, "0 V", { a: "start", b: 1 });
    return fig(420, 305, "Potential divider circuit. A 10 volt supply feeds a 350 ohm fixed resistor in series with a strain gauge that is 350 ohms when unstrained. The gauge is connected to 0 volts. The output voltage is taken from the junction between the fixed resistor and the strain gauge.", s);
  })();

  /* ---------- the bank ---------- */
  B.structures = {
    intro:
      "<p>Structures and materials, <strong>23 to 39 marks</strong> of the 110 on the real paper, and a quarter of them are written. Fourteen questions, about 90 marks: forces, moments and beam reactions; pin-jointed frames by the method of joints; free-body diagrams; the tensile test, stress, strain, factor of safety, strain energy and strain gauges; and choosing a material. About two thirds of the marks are calculations. <strong>Show the formula, the substitution and the unit</strong>, keep full calculator values until the last line, and give the <strong>nature</strong> (tension or compression) as well as the size of every frame member. The written answers need a <strong>property, evidence from the Data Booklet or the graph, and the consequence for the job</strong>.</p>",
    questions: [
      {
        id: "structures-01",
        style: "Section 1 · short answer · forces and equilibrium",
        stem: "<p>A tie-rod holds the canopy of a lifeboat station to the wall behind it. The rod is pulled at each end, and the fixings at the two ends are pinned joints.</p>",
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 2,
            q: "Which of these quantities is a vector?",
            opts: ["The mass of the canopy", "The length of the rod", "The force in the rod", "The temperature of the rod"],
            why: "A vector has a size <em>and</em> a direction. Force does: a 10 kN pull to the east is not the same as a 10 kN pull to the north. Mass, length and temperature have a size only.",
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 0,
            q: "The tie-rod is in <strong>tension</strong>. What does the rod do to the joint at each of its ends?",
            opts: ["It pulls the joint towards the middle of the rod", "It pushes the joint away from the middle of the rod", "It pushes the joint sideways, at right angles to the rod", "It exerts no force on the joint"],
            why: "A member in tension stretches, and pulls each end joint <em>towards</em> the member. A member in compression pushes each joint away. It is the force along the axis of the rod, so it is not sideways, and a loaded member certainly exerts a force.",
          },
          {
            label: "(c)", type: "num", marks: 2, a: 13, tol: 0.05, unit: "kN",
            q: "Two cables pull on a bollard at right angles to each other, one with a force of 12 kN and the other with 5 kN. Calculate the size of the resultant force on the bollard.",
            why: "Forces are vectors, so they are not added as plain numbers.<br>$R = \\sqrt{F_1^2 + F_2^2}$ (1)<br>$R = \\sqrt{12^2 + 5^2} = \\sqrt{169}$<br>$R = 13\\ \\text{kN}$ (1). Adding the numbers (17 kN) is the slip: that is the answer only when the forces point the same way.",
          },
        ],
      },
      {
        id: "structures-02",
        style: "Section 2 · context question · resultant and equilibrant",
        stem: "<p>A ring-bolt O on the deck of a pontoon is pulled by two ropes. The figure shows the forces, which both lie in the horizontal plane of the deck.</p>",
        figure: figForces,
        parts: [
          {
            label: "(a)", type: "num", marks: 3, a: 9.17, tol: 0.02, unit: "kN",
            q: "Calculate the size of the resultant of the two forces.",
            why: R`Resolve into east and north components, taking east as positive. (1)<br>$\Sigma F_h = 10 + 8\cos120^\circ = 10 - 4.00 = 6.00\ \text{kN}$<br>$\Sigma F_v = 8\sin120^\circ = 6.93\ \text{kN}$ (1)<br>$R = \sqrt{6.00^2 + 6.93^2} = 9.17\ \text{kN}$ (1). Using $\cos60^\circ$ with a plus sign gives 15.6 kN, which is the resultant if the second rope pointed 60° above east instead of 120°.`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 49.1, tol: 0.2, unit: "° above due east",
            q: "Calculate the angle the resultant makes with due east, in degrees.",
            why: R`$\tan\theta = \dfrac{\Sigma F_v}{\Sigma F_h}$ (1)<br>$\tan\theta = \dfrac{6.93}{6.00}$, so $\theta = 49.1^\circ$ above east (1). Check the calculator is in degree mode, and that both components are positive, so no quadrant correction is needed. Dividing the other way round gives 40.9°.`,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 3,
            q: "A third rope is now tied to O so that the ring-bolt stays in equilibrium. Which statement describes the force this rope must exert?",
            opts: [
              "9.17 kN, in the same direction as the resultant",
              "18 kN, the numerical sum of the two forces, in the direction of the 10 kN force",
              "0 kN, because the ring-bolt is not moving",
              "9.17 kN, in the direction opposite to the resultant",
            ],
            why: "The equilibrant is equal in size to the resultant and opposite in direction, so that the three forces add up to zero and close a triangle when drawn head to tail. A force in the same direction as the resultant would double the unbalanced force.",
          },
        ],
      },
      {
        id: "structures-03",
        style: "Section 2 · context question · equilibrium of a ring by components",
        stem: "<p>A 45 kN generator is lifted by a crane. At the top of the lift it hangs from a ring supported by two ropes, A and B, fixed to a rigid ceiling beam. Rope A makes 35° with the ceiling and rope B makes 60° with the ceiling, on the opposite side of the ring.</p>",
        figure: figRopes,
        parts: [
          {
            label: "(a)", type: "num", marks: 3, a: 22.6, tol: 0.06, unit: "kN",
            q: "Calculate the tension in rope A.",
            why: R`For the ring: $\Sigma F_h = 0$: $T_A\cos35^\circ = T_B\cos60^\circ$ (1)<br>$\Sigma F_v = 0$: $T_A\sin35^\circ + T_B\sin60^\circ = 45$ (1)<br>Substituting $T_B = T_A\cos35^\circ/\cos60^\circ = 1.638\,T_A$ gives $T_A(0.5736 + 1.4186) = 45$, so $T_A = 22.6\ \text{kN}$ (1). Keep every digit until the end: $T_B$ is 37.0 kN.`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 37.0, tol: 0.1, unit: "kN",
            q: "Calculate the tension in rope B.",
            why: R`From the equations in (a), $T_B = \dfrac{45}{\sin60^\circ + \cos60^\circ\tan35^\circ}$ (1)<br>$T_B = \dfrac{45}{0.8660 + 0.3501} = 37.0\ \text{kN}$ (1). Check: $22.59\sin35^\circ + 37.00\sin60^\circ = 12.96 + 32.04 = 45.0$ kN.`,
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 12,
            q: "A cadet says: &quot;Each rope holds half of the 45 kN, so each tension is 22.5 kN.&quot; Explain why the cadet's reasoning does not work for this ring.",
            points: [
              { desc: "Only the vertical component of each rope's pull supports the weight (the vertical components add up to 45 kN)",
                all: [R`\bvertical\b`, R`\b(?:components?|parts?|bits?|portions?|shares?)\b`, R`\b(?:holds?|holding|supports?|supporting|carr(?:y|ies|ying)|lift\w*|balanc\w*|resist\w*|tak(?:es?|ing)|add\w*|sum|total|equal\w*)\b`] },
              { desc: "Each rope also pulls sideways; these sideways pulls only balance each other and do no lifting", group: "side",
                all: [R`\b(?:sideways|horizontal\w*|across|outwards?|along the ceiling)\b`, R`\b(?:cancel\w*|balanc\w*|against|opposite|wast\w*|no use|useless|extra|lift\w*|pull\w*|force|component|equal)\b`] },
              { desc: "So each tension has to be larger than its share of the weight (more than half of 45 kN)", group: "side",
                any: [R`\b(?:more|greater|larger|bigger|higher|harder|stronger) than (?:just |only )?(?:half|a half|22[.]5|its share|their share|the share|the vertical)`, R`\b(?:pull|pulls|pulling|tension)\W+(?:\w+\W+){0,3}(?:harder|more)\b`] },
            ],
            sample: "The ropes are at an angle to the ceiling, so only the vertical component of each rope's pull is holding up the generator, and the two vertical components add up to 45 kN. Each rope also pulls sideways, and that sideways pull is wasted for lifting, because the two sideways pulls are only balancing each other, so each rope has to pull harder than its share.",
            model: "<ul><li>The ropes are inclined: only the vertical component of each tension supports the weight, and the two vertical components together equal 45 kN (1)</li><li>Each rope also has a horizontal (sideways) component that does no lifting. These balance each other, so the total tension in each rope is greater than the vertical share alone (1)</li></ul><p>Also acceptable: &quot;the steeper the rope, the smaller the tension&quot; with a reason; &quot;the half-and-half rule only works when both ropes are vertical&quot;. Do not accept &quot;the weight is bigger&quot; or &quot;the ropes are heavier&quot;.</p>",
          },
        ],
      },
      {
        id: "structures-04",
        style: "Section 2 · context question · reactions of a beam with a UDL",
        stem: "<p>A temporary footbridge across a mill lade is a beam 10 m long. It is hinged at A and rests on a roller at B. A queue of walkers is modelled as a uniformly distributed load of 5 kN/m covering 6 m of the bridge, and a loaded barrow is a 24 kN point load. The weight of the bridge itself can be ignored.</p>",
        figure: figUdl,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 30, tol: 0.01, unit: "kN",
            q: "Calculate the single point load that is equivalent to the uniformly distributed load.",
            why: "Intensity × length covered: $5 \\times 6 = 30\\ \\text{kN}$ (1), acting at the middle of the loaded part, 4 m from A. Using the whole 10 m would give 50 kN.",
          },
          {
            label: "(b)", type: "num", marks: 3, a: 31.2, tol: 0.06, unit: "kN",
            q: "Calculate the reaction at B.",
            why: R`Moments about A (the hinge force has no moment about A): $R_B \times 10 = 30\times4 + 24\times8$ (1)<br>$R_B \times 10 = 120 + 192 = 312$ (1)<br>$R_B = 31.2\ \text{kN}$ upwards (1).`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 22.8, tol: 0.06, unit: "kN",
            q: "Calculate the vertical reaction at A.",
            why: R`$\Sigma F_v = 0$: $R_A + R_B = 30 + 24 = 54$ (1)<br>$R_A = 54 - 31.2 = 22.8\ \text{kN}$ upwards (1). Check by moments about B: $22.8\times10 = 30\times6 + 24\times2 = 228$. ✔`,
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 1,
            q: "What is the horizontal reaction at the hinge A?",
            opts: ["24 kN, the same as the point load", "Zero, because there is no horizontal load and the roller gives none", "5 kN, the same as the UDL intensity", "31.2 kN, the same as the reaction at B"],
            why: "All the loads are vertical and the roller can only push at right angles to its level surface, so there is nothing for a horizontal reaction to balance: $\\Sigma F_h = 0$ gives $A_x = 0$.",
          },
        ],
      },
      {
        id: "structures-05",
        style: "Section 2 · context question · inclined load, magnitude and direction of a reaction",
        stem: "<p>A hoist beam AB in a boatyard is 8 m long. It is hinged at A and rests on a roller on a level surface at B. A cable pulls on the beam with a force of 40 kN, 3 m from A. The cable points downwards and towards B, at 30° to the vertical. The weight of the beam can be ignored.</p>",
        figure: figInclined,
        parts: [
          {
            label: "(a)", type: "num", marks: 3, a: 13.0, tol: 0.03, unit: "kN",
            q: "Calculate the reaction at B.",
            why: R`Resolve the load: vertical component $= 40\cos30^\circ = 34.64\ \text{kN}$, horizontal component $= 40\sin30^\circ = 20.0\ \text{kN}$ (1)<br>Moments about A (only the vertical component has a moment): $R_B\times8 = 34.64\times3$ (1)<br>$R_B = 13.0\ \text{kN}$ upwards (1). The angle is measured from the <em>vertical</em>, so the vertical component uses cosine; using $40\sin30^\circ$ gives 7.5 kN.`,
          },
          {
            label: "(b)", type: "num", marks: 3, a: 29.5, tol: 0.1, unit: "kN",
            q: "Calculate the magnitude of the reaction at A.",
            why: R`$A_y = 34.64 - 12.99 = 21.65\ \text{kN}$ upwards (1)<br>The roller gives no horizontal force, so $A_x = 20.0\ \text{kN}$, away from B (1)<br>$R_A = \sqrt{A_x^2 + A_y^2} = \sqrt{20.0^2 + 21.65^2} = 29.5\ \text{kN}$ (1).`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 47.3, tol: 0.2, unit: "° above the horizontal",
            q: "Calculate the angle the reaction at A makes with the horizontal.",
            why: R`$\tan\theta = \dfrac{A_y}{A_x}$ (1)<br>$\tan\theta = \dfrac{21.65}{20.0}$, so $\theta = 47.3^\circ$ above the horizontal (1), pointing up and away from B (the hinge pushes back against the load's pull towards B). Dividing the other way gives 42.7°.`,
          },
        ],
      },
      {
        id: "structures-06",
        style: "Section 2 · context question · method of joints",
        stem: "<p>A footbridge over a canal is a pin-jointed Warren truss ABCDE, shown in the figure. Every member is 3 m long, so the inclined members are at 60° to the bottom chord. The truss is hinged at A and rests on a roller at E. A 24 kN load acts at joint B. The weights of the members are ignored. Take <strong>tension</strong> as positive when you work out each joint.</p>",
        figure: figTruss,
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 6.0, tol: 0.02, unit: "kN",
            q: "Calculate the vertical reaction at the roller E.",
            why: R`Moments about A: $R_E\times6 = 24\times1.5$ (1)<br>$R_E = 6.0\ \text{kN}$ upwards (1). The load is only 1.5 m from A, so most of it goes into the hinge: $R_A = 18.0$ kN.`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 20.8, tol: 0.06, unit: "kN",
            q: "Joint A has the reaction $R_A = 18.0$ kN upwards acting on it. Calculate the size of the force in member AB.",
            why: R`Joint A, vertical forces: $18.0 + F_{AB}\sin60^\circ = 0$ (1)<br>$F_{AB} = -\dfrac{18.0}{\sin60^\circ} = -20.8\ \text{kN}$, so the size is $20.8\ \text{kN}$ (1). The negative sign means compression.`,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 2,
            q: "AB is in compression (20.8 kN). What is the nature of the force in the bottom member AC, found from the horizontal forces at joint A?",
            opts: ["Compression, 20.8 kN", "Compression, 10.4 kN", "Tension, 10.4 kN", "Tension, 20.8 kN"],
            why: "Compression in AB means it pushes on joint A, down and to the left, with a horizontal component $20.8\\cos60^\\circ = 10.4$ kN to the left. AC must pull A to the right with the same size to balance it, so AC is in <em>tension</em>, 10.4 kN. The size is the horizontal component, not the full 20.8 kN.",
          },
          {
            label: "(d)", type: "num", marks: 3, a: 6.93, tol: 0.02, unit: "kN",
            q: "Joint B has member AB (20.8 kN, in compression) and the 24 kN load acting on it. Calculate the size of the force in member BD.",
            why: R`AB is in compression, so it pushes on B up and to the right: components $20.78\cos60^\circ = 10.39$ kN horizontally and $20.78\sin60^\circ = 18.0$ kN vertically (1). Assume BC and BD are in tension.<br>$\Sigma F_v = 0$: $18.0 - 24 - F_{BC}\sin60^\circ = 0$, so $F_{BC} = -6.93$ kN (1)<br>$\Sigma F_h = 0$: $10.39 + F_{BC}\cos60^\circ + F_{BD} = 0$, so $F_{BD} = -10.39 + 3.46 = -6.93$ kN, a size of $6.93\ \text{kN}$ (1).`,
          },
          {
            label: "(e)", type: "mcq", marks: 1, a: 0,
            q: "What is the nature of the force in member BD?",
            opts: ["Compression", "Tension", "Zero: the member carries no force", "It cannot be found without joint D"],
            why: "The calculation gave $F_{BD} = -6.93$ kN. A negative answer means the assumed tension arrow was the wrong way round, so BD is in <em>compression</em>, like the other top-chord member. Joint B has only two unknowns, so joint D is not needed.",
          },
        ],
      },
      {
        id: "structures-07",
        style: "Section 2 · context question · free-body diagram and tie tension",
        stem: "<p>A wall-mounted jib crane lifts supplies on a quayside. The steel jib AB is 2.4 m long and horizontal. It is pinned to the wall at A, and a tie BC runs from its end B to the wall at C, at 35° to the jib. A hoist hangs from the jib 1.5 m from A with a load of 18 kN. The weight of the jib is ignored.</p>",
        figure: figJib,
        parts: [
          {
            label: "(a)", type: "multi", marks: 4,
            q: "A free-body diagram of the jib AB is drawn, with the wall and the tie cut away. Choose the <strong>four</strong> forces that must be shown acting on the jib. The weight of the jib is to be ignored.",
            opts: [
              "The horizontal reaction of the pin at A",
              "The weight of the wall",
              "The 18 kN load at 1.5 m from A",
              "The vertical reaction of the pin at A",
              "The tension in the tie, pulling on B along BC",
              "The force the jib exerts on the wall",
              "The weight of the jib",
              "The force the tie exerts on the wall at C",
            ],
            a: [0, 2, 3, 4],
            why: "A free-body diagram shows only forces acting <em>on</em> the jib: the load, the tie's pull, and the pin's reaction, which is drawn as two components because a pin can push in any direction. The weight of the wall, the force the jib exerts on the wall and the force the tie exerts on the wall act on the wall, not on the jib, and the weight of the jib is ignored.",
          },
          {
            label: "(b)", type: "num", marks: 3, a: 19.6, tol: 0.05, unit: "kN",
            q: "Calculate the tension in the tie BC.",
            why: R`Moments about A (the pin's reactions have no moment about A): $T\sin35^\circ\times2.4 = 18\times1.5$ (1)<br>The component of the tie at right angles to the jib is $T\sin35^\circ$ (1)<br>$T = \dfrac{27}{2.4\sin35^\circ} = 19.6\ \text{kN}$ (1). Using cosine gives 13.7 kN; forgetting the load's 1.5 m and using 2.4 m gives 25.9 kN.`,
          },
        ],
      },
      {
        id: "structures-08",
        style: "Section 1 · short answer · moments",
        stem: "<p>On HMS Ratchet's hull inspection day, two moment problems come up.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 81, tol: 0.1, unit: "N m",
            q: "A cadet pulls on the end of a 0.45 m torque wrench with a force of 180 N at right angles to the handle. Calculate the moment about the nut.",
            why: "$M = Fx = 180 \\times 0.45 = 81\\ \\text{N m}$ (1). Dividing the force by the length (400) is the slip: a moment is force <em>times</em> perpendicular distance.",
          },
          {
            label: "(b)", type: "num", marks: 2, a: 900, tol: 0.5, unit: "N",
            q: "A light plank is balanced on a pivot. Cadet Rahman, of weight 600 N, sits 1.8 m from the pivot. A crate on the other side of the pivot is 1.2 m from it and balances the plank. Calculate the weight of the crate.",
            why: "Principle of moments about the pivot: clockwise moment = anticlockwise moment. (1)<br>$600\\times1.8 = W\\times1.2$, so $W = \\dfrac{1080}{1.2} = 900\\ \\text{N}$ (1). The heavier load is closer to the pivot.",
          },
        ],
      },
      {
        id: "structures-09",
        style: "Section 2 · context question · the tensile test",
        stem: "<p>A specimen of a ductile metal is pulled in a tensile-testing machine. The graph shows the first part of the test, drawn to scale. At P the load is slowly removed and the stress falls to zero along the dashed line.</p>",
        figure: figCurve,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 300, tol: 8, unit: "N/mm²",
            q: "Read from the graph the stress at which the specimen yields.",
            why: "Yield is the point where the strain increases a lot with no extra stress, the level part of the curve. It is at $300\\ \\text{N/mm}^2$ (1).",
          },
          {
            label: "(b)", type: "num", marks: 2, a: 200, tol: 10, unit: "kN/mm²",
            q: "Use the straight part of the graph to calculate Young's modulus for the metal, in kN/mm².",
            why: R`$E = \dfrac{\sigma}{\varepsilon}$ (1), read as a point on the straight line, for example $300\ \text{N/mm}^2$ at a strain of $1.5\times10^{-3}$<br>$E = \dfrac{300}{1.5\times10^{-3}} = 200\,000\ \text{N/mm}^2 = 200\ \text{kN/mm}^2$ (1). Forgetting the $10^{-3}$ on the strain axis gives 0.2; forgetting to convert to kN gives 200 000.`,
          },
          {
            label: "(c)", type: "num", marks: 1, a: 1.4, tol: 0.12, unit: "× 10⁻³",
            q: "Read from the graph the strain that is left in the specimen when the load has been removed. Give your answer as a number of 10⁻³ (for example, 2.5 means $2.5\\times10^{-3}$).",
            why: "Where the dashed line reaches zero stress the strain is $1.4\\times10^{-3}$ (1). That strain is the permanent set.",
          },
          {
            label: "(d)", type: "text", marks: 4, rows: 7, minWords: 25,
            q: "Describe what the graph shows about how the specimen behaves from the start of the test to the end of the dashed line.",
            points: [
              { desc: "At the start the line is straight: stress is proportional to strain and the specimen is elastic (it springs back if unloaded)",
                any: [R`\bproportional\b`, R`\bhooke\w*`, R`\bstraight(?: |-)(?:line|part|section|portion|region)\b`, R`\blinear(?:ly)?\b`,
                  R`\bspr(?:ings?|ing) back\b`, R`\b(?:returns?|goes back|go back|regains?|recovers?)\W+(?:\w+\W+){0,3}(?:original|starting|normal|first)\W+(?:\w+\W+){0,1}(?:length|shape|size)`, R`\belastic\b(?!\W+limit\W+is\W+(?:passed|exceeded))`] },
              { desc: "It yields at about 300 N/mm²: the strain increases a lot with hardly any extra stress, so the graph levels off",
                any: [near(R`yield\w*`, R`level\w*|flat|plateau|horizontal|constant|same stress|stops? rising|no (?:extra|more|further|increase)|little|hardly|barely|almost|large|big|lot|sudden\w*|jump\w*|give\w*|stretch\w*|extends?|extension|strain`, 9),
                  near(R`stretch\w*|extends?|extension|elongat\w*|strain`, R`(?:without|with|while)\W+(?:\w+\W+){0,3}(?:increase\w*|extra|more|further|rise|rising|change)\W+(?:\w+\W+){0,2}(?:stress|force|load)`, 6)],
                not: [R`\byield\w*\W+(?:\w+\W+){0,5}(?:\bproportional\b|\bstraight line\b)`] },
              { desc: "Past yield the deformation is plastic (permanent); the stress rises again as the metal strain hardens", negOK: true,
                not: [R`\b(?:no|not|without|never|nothing)\W+(?:\w+\W+){0,1}(?:plastic\w*|permanent\w*|deform\w*)`, R`\b(?:fully|completely|entirely|totally)\W+elastic\W+(?:\w+\W+){0,4}(?:p\b|end|whole|all)`],
                any: [R`\bplastic\w*`, R`\bharden\w*`, R`\bwork[- ]harden\w*`, R`\bpermanent(?:ly)?\W+(?:\w+\W+){0,2}(?:deform\w*|stretch\w*|extend\w*|longer|chang\w*|elongat\w*|damag\w*|extension)`,
                  R`\b(?:stress|force|load)\W+(?:\w+\W+){0,2}(?:rises?|increases?|goes up|climbs?)\W+(?:\w+\W+){0,2}again`] },
              { desc: "When unloaded the graph falls along a line parallel to the original straight line and ends at a strain that is not zero: the specimen is left permanently stretched (permanent set)", negOK: true,
                not: [R`\b(?:not|isn't|never|no)\W+(?:\w+\W+){0,1}(?:parallel|permanent\w*)`, R`\b(?:returns?|goes|go|comes?|back)\W+(?:\w+\W+){0,2}(?:to|at) (?:the )?(?:origin|zero)\b(?!\W+(?:\w+\W+){0,12}(?:parallel|permanent|left|remain))`],
                any: [near(R`parallel`, R`elastic|original|initial|first|start|straight|loading|steep\w*|slope|gradient|line|same`, 8),
                  R`\bpermanent set\b`, R`\bleft (?:\w+\W+){0,3}(?:permanently|longer|stretched|extended)`,
                  R`\b(?:strain|extension|length)\W+(?:\w+\W+){0,4}(?:left|remains?|remaining|stays?|leftover|still)\b`] },
            ],
            sample: "At the start the graph is a straight line through the origin, so the stress is proportional to the strain and the specimen is elastic: it would spring back to its original length if the load were removed. At about 300 N/mm² the metal yields, and the strain increases a lot with hardly any extra stress, so the curve goes flat. After that the deformation is plastic, which is permanent, and the stress rises again as the metal strain hardens. When the load is removed from P, the graph falls along a line parallel to the original elastic line and ends at a strain of about 1.4 x 10^-3, so the specimen is left permanently stretched.",
            model: "<ul><li>Elastic region: the graph is a straight line from the origin, so stress is proportional to strain (Hooke's law). The specimen returns to its original length if unloaded in this region (1)</li><li>Yield: at about 300 N/mm² the strain increases a lot with little or no increase in stress (the graph is level) (1)</li><li>Beyond yield the deformation is plastic, i.e. permanent, and the stress rises again (strain hardening) (1)</li><li>On unloading the graph falls along a line parallel to the elastic line and reaches zero stress at a strain of about $1.4\\times10^{-3}$: the specimen is permanently longer (permanent set) (1)</li></ul><p>Also acceptable: any correct reading from the graph used as evidence (300 N/mm², 1.5 × 10⁻³). Do not accept &quot;it bends&quot; for &quot;it stretches plastically&quot;, or a description that gives only the values and no behaviour.</p>",
          },
        ],
      },
      {
        id: "structures-10",
        style: "Section 2 · context question · stress, strain and strain energy",
        stem: "<p>A mild steel stay wire holds a radio mast on the roof of a lifeboat station. The wire has a diameter of 8 mm and an unstretched length of 3.5 m. It carries a tension of 9.5 kN. The Young's modulus of mild steel is 196 kN/mm², and the wire stays within its elastic region.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 189.0, tol: 0.2, unit: "N/mm²",
            q: "Calculate the stress in the wire.",
            why: R`$\sigma = \dfrac{F}{A}$ with $A = \dfrac{\pi d^2}{4} = \dfrac{\pi\times8^2}{4} = 50.27\ \text{mm}^2$ (1)<br>$\sigma = \dfrac{9500}{50.27} = 189\ \text{N/mm}^2$ (1). Force in newtons and area in mm$^2$ give N/mm$^2$ directly. Using the diameter as the radius in $\pi r^2$ gives 47.2.`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 3.37, tol: 0.012, unit: "mm",
            q: "Calculate the extension of the wire under this load, in mm.",
            why: R`$\varepsilon = \dfrac{\sigma}{E}$ (1)<br>$\varepsilon = \dfrac{189.0}{196\,000} = 9.64\times10^{-4}$, and $\Delta l = \varepsilon\,l = 9.64\times10^{-4}\times3500 = 3.37\ \text{mm}$ (1). $E = 196\ \text{kN/mm}^2 = 196\,000\ \text{N/mm}^2$: using 196 gives 3375 mm, which should have looked absurd.`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 10.8, tol: 0.05, unit: "J",
            q: "A different steel cable stretches by 1.8 mm when the tension in it is 12 kN, within its elastic region. Calculate the elastic strain energy stored in the cable.",
            why: R`$E_s = \tfrac12 F x$ (1)<br>$E_s = \tfrac12\times12\,000\times1.8\times10^{-3} = 10.8\ \text{J}$ (1). The extension must be in metres to give joules: using 1.8 gives 10 800.`,
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 3,
            q: "The tension in the cable is doubled, still within its elastic region. How does the strain energy stored change?",
            opts: ["It doubles", "It halves", "It does not change", "It becomes four times as large"],
            why: "In the elastic region the extension is proportional to the force, so doubling the force doubles $x$ as well. $E_s = \\tfrac12Fx$ then rises by $2\\times2 = 4$. It is not doubled.",
          },
        ],
      },
      {
        id: "structures-11",
        style: "Section 2 · context question · factor of safety and sizing",
        stem: "<p>The Data Booklet gives these ultimate stresses. Aluminium alloy: 300 N/mm² in tension and compression. Mild steel: 430 N/mm² in tension and compression.</p><p>Two members are being designed for a new lifeboat davit.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 3, a: 28.8, tol: 0.07, unit: "mm",
            q: "An aluminium alloy tie-rod of circular cross-section must carry a tensile load of 56 kN with a factor of safety of 3.5. Calculate the minimum diameter of the rod.",
            why: R`Safe working stress $= \dfrac{\text{ultimate stress}}{\text{factor of safety}} = \dfrac{300}{3.5} = 85.7\ \text{N/mm}^2$ (1)<br>$A = \dfrac{F}{\sigma} = \dfrac{56\,000}{85.71} = 653.3\ \text{mm}^2$ (1)<br>$d = \sqrt{\dfrac{4A}{\pi}} = \sqrt{\dfrac{4\times653.3}{\pi}} = 28.8\ \text{mm}$ (1). Leaving out the 4 gives 14.4 mm, which is the radius, not the diameter.`,
          },
          {
            label: "(b)", type: "num", marks: 4, a: 2.92, tol: 0.02, unit: "mm",
            q: "A tubular mild steel strut has an outer diameter of 60 mm. It carries a compressive load of 90 kN with a factor of safety of 2.5. Calculate the minimum wall thickness of the tube.",
            why: R`Safe working stress $= \dfrac{430}{2.5} = 172\ \text{N/mm}^2$ (1)<br>$A = \dfrac{90\,000}{172} = 523.3\ \text{mm}^2$ (1)<br>$A = \dfrac{\pi}{4}(D^2 - d^2)$, so $D^2 - d^2 = 666.2$ and $d^2 = 3600 - 666.2 = 2933.8$, giving $d = 54.16\ \text{mm}$ (1)<br>$t = \dfrac{D - d}{2} = \dfrac{60 - 54.16}{2} = 2.92\ \text{mm}$ (1). Rounding $d$ early to 54 mm would give a wall of 3 mm.`,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 1,
            q: "A designer proposes a cast iron tie-rod for the same job as part (a), using the compressive ultimate stress of 600 to 900 N/mm² to size it. What is wrong with that?",
            opts: [
              "Nothing: the higher figure gives a safer, thinner rod",
              "A tie is in tension, so the tensile ultimate stress (120 to 160 N/mm²) must be used, which makes cast iron a poor choice",
              "Cast iron cannot be used for any member that carries a load",
              "The factor of safety is not needed for cast iron",
            ],
            why: "Cast iron is strong in compression and weak in tension. A tie is stretched, so the tensile figure (120–160 N/mm²) decides its size. Using the compressive value would give a rod far too thin, which would fail. A factor of safety is needed for every material.",
          },
        ],
      },
      {
        id: "structures-12",
        style: "Section 2 · context question · strain gauges",
        stem: "<p>A strain gauge is glued to a mild steel stay on a harbour crane. The gauge has a resistance of 350 Ω at rest and a gauge factor of 2.1. It forms a potential divider with a fixed 350 Ω resistor across a 10 V supply, as shown. When the stay is loaded, the gauge strain is $6.0\\times10^{-4}$. The Young's modulus of mild steel is 196 kN/mm².</p>",
        figure: figGauge,
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 0.441, tol: 0.002, unit: "Ω",
            q: "Calculate the change in resistance of the gauge.",
            why: R`$\dfrac{\Delta R}{R} = GF\times\varepsilon$ (1)<br>$\Delta R = 2.1\times6.0\times10^{-4}\times350 = 0.441\ \Omega$ (1). Stopping at $GF\times\varepsilon = 1.26\times10^{-3}$ is the fractional change, not the change in ohms.`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 3.15, tol: 0.015, unit: "mV",
            q: "The output voltage of the divider is 5.000 V when the stay is at rest. Calculate the <strong>change</strong> in the output voltage when the stay is loaded, in mV.",
            why: R`The gauge is the lower resistor: $V_{out} = 10\times\dfrac{350.441}{350 + 350.441}$ (1)<br>$V_{out} = 5.00315\ \text{V}$, so the change is $5.00315 - 5.000 = 3.15\ \text{mV}$ (1). The change is only a few millivolts, which is why the output is amplified. Quoting 5.003 V as the change loses the mark.`,
          },
          {
            label: "(c)", type: "num", marks: 1, a: 117.6, tol: 0.2, unit: "N/mm²",
            q: "Calculate the stress in the stay.",
            why: R`$\sigma = E\varepsilon = 196\,000\times6.0\times10^{-4} = 117.6\ \text{N/mm}^2$ (1), using $E = 196\ \text{kN/mm}^2 = 196\,000\ \text{N/mm}^2$.`,
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 4, minWords: 10,
            q: "In a better design, the fixed resistor is replaced by a dummy gauge. Explain why a dummy gauge is used.",
            points: [
              { desc: "The dummy gauge is identical but unstrained (not carrying the load, not stuck to the loaded stay)", negOK: true,
                any: [R`\bun-?(?:strained|loaded|stressed|stretched)\b`,
                  R`\b(?:not|never|without|no|isn't|doesn't)\W+(?:\w+\W+){0,4}(?:strain\w*|stretch\w*|compress\w*|stress\w*|load\w*|carry\w*|bear\w*|taking|attached|glued|stuck|fixed|mounted|connected|subject\w*)\b`,
                  R`\b(?:separate|different|nearby|adjacent|spare|other)\W+(?:\w+\W+){0,3}(?:piece|bit|part|bar|block|sample|metal|steel|material)\b`] },
              { desc: "It is at the same temperature, so its resistance changes by the same amount as the working gauge when it warms or cools, and the effect cancels, leaving only the change due to strain",
                all: [R`\b(?:temperature|thermal|heat\w*|warm\w*|hot|cool\w*|cold|expan\w*)\b`,
                  R`\b(?:cancel\w*|compensat\w*|eliminat\w*|remov\w*|offset\w*|ignor\w*|account\w*|same (?:change|effect|amount|way)|equal\w*|both|affects? (?:both|each)|only (?:the |due|because|from|caused|measures?|shows?|detects?)|just the strain|only strain|accurate|true)\b`] },
            ],
            sample: "The dummy gauge is an identical gauge fixed to an unloaded piece of the same steel, so it is unstrained. It is at the same temperature as the working gauge, so a change in temperature alters both resistances by the same amount, the effect cancels in the divider, and the output shows only the change caused by strain.",
            model: "<ul><li>The dummy gauge is identical to the active gauge but is unstrained: it is mounted on unloaded material (1)</li><li>It is at the same temperature, so the resistance change caused by temperature is the same in both gauges and cancels out. The output then shows only the change due to strain (1)</li></ul><p>Also acceptable: &quot;temperature compensation&quot; with the cancelling idea explained. Do not accept &quot;to make the circuit more accurate&quot; or &quot;to double the signal&quot; (a dummy gauge does not add to the signal).</p>",
          },
        ],
      },
      {
        id: "structures-13",
        style: "Section 2 · context question · properties and choosing a material",
        stem:
          "<p>A 30 kN lamp gantry is hung from the roof of a boat shed by a single vertical hanger. The hanger is in <strong>tension</strong>. The engineer must choose between mild steel and cast iron. Values from the Data Booklet are in the table.</p>" +
          "<div class=\"table-wrap\"><table><thead><tr><th>Material</th><th>E (kN/mm²)</th><th>Yield stress (N/mm²)</th><th>Ultimate tensile stress (N/mm²)</th><th>Ultimate compressive stress (N/mm²)</th></tr></thead><tbody>" +
          "<tr><td>Mild steel</td><td>196</td><td>220</td><td>430</td><td>430</td></tr>" +
          "<tr><td>Cast iron</td><td>120</td><td>–</td><td>120 to 160</td><td>600 to 900</td></tr></tbody></table></div>",
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: "Match each property to its meaning.",
            pairs: [
              ["Ductile", "Can be drawn out into a wire, with a large plastic extension before it breaks"],
              ["Brittle", "Breaks suddenly, with little or no plastic deformation first"],
              ["Malleable", "Can be hammered or rolled into thin sheets without cracking"],
              ["Stiff", "Changes length very little under load: a high Young's modulus"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 4, rows: 8, minWords: 25,
            q: "Using the table, justify the choice of mild steel rather than cast iron for the hanger.",
            points: [
              { desc: "Strength in tension with evidence: mild steel's ultimate tensile stress (430 N/mm²) is much higher than cast iron's (120 to 160 N/mm²)", group: "uts", negOK: true,
                all: [R`\b4\W?3\W?0\b`, R`\b1[26]0\b`, R`\b(?:higher|greater|more|larger|bigger|stronger|compared|against|whereas|versus|vs|times|only|nearly|almost|about|roughly|maximum|twice|double|triple)\b`],
                not: [R`\bcast(?: iron)?\W+(?:(?!but|whereas|while|however)\w+\W+){0,6}(?:higher|greater|stronger|better|more|larger|bigger)\W+(?:\w+\W+){0,3}than\W+(?:\w+\W+){0,1}(?:mild|steel)`, R`\b(?:mild|steel)\W+(?:(?!but|whereas|while|however)\w+\W+){0,6}(?:lower|weaker|less|smaller)\W+(?:\w+\W+){0,3}than\W+(?:\w+\W+){0,1}cast`] },
              { desc: "Strength in tension: mild steel is stronger in tension than cast iron (cast iron is weak in tension)", group: "uts", negOK: true,
                not: [R`\bcast(?: iron)?\W+(?:\w+\W+){0,3}(?:is|are|has|have)\W+(?:\w+\W+){0,3}(?:stronger|higher|greater|better)\W+(?:\w+\W+){0,4}(?:in )?tens\w*`, R`\b(?:steel|mild)\W+(?:\w+\W+){0,3}(?:is|are|has|have)\W+(?:\w+\W+){0,3}(?:weaker|lower|less|worse)\W+(?:\w+\W+){0,4}(?:in )?tens\w*`],
                any: [R`\b(?:two|three|four|2|3|4|double|twice|triple)\W+(?:times\W+)?(?:\w+\W+){0,5}cast`,
                  R`\b(?:steel|mild)\W+(?:\w+\W+){0,6}(?:stronger|higher|greater|better|more|larger|bigger)\W+(?:\w+\W+){0,5}(?:tens\w*|pull\w*|stretch\w*)`,
                  R`\b(?:steel|mild)\W+(?:\w+\W+){0,4}(?:ultimate|tens\w*|breaking)\W+(?:\w+\W+){0,4}(?:higher|greater|larger|bigger|stronger)\b`,
                  R`\bcast(?: iron)?\W+(?:\w+\W+){0,6}(?:weak\w*|lower|less|poor\w*|worse|smaller)\W+(?:\w+\W+){0,6}(?:tens\w*|pull\w*|stretch\w*)`,
                  R`\b(?:weak\w*|lower|less|poor\w*|worse)\W+(?:\w+\W+){0,3}(?:in )?(?:tens\w*)\W+(?:\w+\W+){0,6}cast`] },
              { desc: "Cast iron is brittle: it breaks suddenly with little or no warning (no plastic deformation, and no yield stress in the table)", negOK: true,
                not: [R`\bcast(?: iron)?\W+(?:(?!but|whereas|while|however|steel|mild)\w+\W+){0,6}(?:is|are)\W+(?:(?!but|whereas|while|however|steel|mild)\w+\W+){0,6}(?:not\W+(?:\w+\W+){0,1}brittle|ductile|tough)`, R`\b(?:steel|mild)\W+(?:\w+\W+){0,3}(?:is|are)\W+(?:\w+\W+){0,2}brittle`],
                any: [R`\bbrittle\w*`,
                  near(R`snap\w*|fractur\w*|break\w*|shatter\w*|crack\w*|fail\w*|burst\w*`, R`sudden\w*|abrupt\w*|instant\w*|without (?:any )?warning|no warning|no sign|snaps`, 4),
                  R`\b(?:without|no|little|zero|gives? no|with no)\W+(?:\w+\W+){0,1}(?:warning|plastic\w*|stretch\w*|yield\w*|deform\w*)`] },
              { desc: "Mild steel is ductile: it yields and stretches before it breaks, giving a warning, so failure is not sudden", negOK: true,
                not: [R`\b(?:steel|mild)\W+(?:\w+\W+){0,3}(?:is|are)\W+(?:\w+\W+){0,2}brittle`, R`\bcast(?: iron)?\W+(?:(?!but|whereas|while|however|steel|mild)\w+\W+){0,6}(?:is|are)\W+(?:(?!but|whereas|while|however|steel|mild)\w+\W+){0,6}ductile`],
                any: [near(R`steel|mild`, R`ductile|yield\w*|plastic\w*|stretch\w*|deform\w*|tough|warning|bend\w*|sag\w*`, 6),
                  near(R`ductile|yield\w*|plastic\w*|stretch\w*|warning`, R`before|first|then|gives?|gave|allow\w*`, 5)] },
              { desc: "Consequence for the job: with its higher strength, steel can carry the 30 kN load with a larger factor of safety or a smaller section; cast iron is strong in compression (600 to 900) but unsuitable for a tension member",
                not: [R`\bcast(?: iron)?\W+(?:(?!not|n't|but|than|column|struts?|compress|pier|pillar)\w+\W+){0,8}(?:best|better|good|suitable|ideal|right|should be used|use)\W+(?:(?!not|n't|but|than|column|compress)\w+\W+){0,4}(?:hanger|tension|gantry|choice|material)`],
                any: [near(R`factor of safety|safety factor|safely`, R`steel|mild|load|30|hanger|gantry|tens\w*|carry|hold|support`, 6),
                  near(R`smaller|thinner|slimmer|less material|lighter|cheaper`, R`steel|mild|section|area|diameter|hanger|rod|bar`, 6),
                  R`\bcast(?: iron)?\W+(?:\w+\W+){0,8}(?:compress\w*|squash\w*|squeez\w*|crush\w*|columns?|struts?|pillars?|piers?)\W+(?:\w+\W+){0,12}(?:weak\w*|poor\w*|tension|tensile|unsuitable|but|whereas|not|pull\w*)`, R`\bcast(?: iron)?\W+(?:\w+\W+){0,14}(?:weak\w*|poor\w*)\W+(?:\w+\W+){0,14}(?:compress\w*|squash\w*|squeez\w*|crush\w*)`, R`\b(?:weak\w*|poor\w*|tension|tensile|unsuitable|pull\w*)\W+(?:\w+\W+){0,8}cast(?: iron)?\W+(?:\w+\W+){0,8}(?:compress\w*|squash\w*|squeez\w*|crush\w*|columns?|struts?|pillars?|piers?)`,
                  R`\b(?:could|would|might|may|will|can)\W+(?:\w+\W+){0,3}(?:snap|break|fail|fracture)\W+(?:\w+\W+){0,6}(?:load|30|weight|gantry|lamp|hanger)`,
                  near(R`unsuitable|not suitable|unsafe|dangerous|risky|poor choice|wrong choice|inappropriate|not a good|bad choice`, R`cast|tension|tensile|hanger|pull`, 6)] },
            ],
            sample: "Mild steel has an ultimate tensile stress of 430 N/mm², much higher than the 120 to 160 N/mm² of cast iron, so it is stronger in tension and the hanger can carry the 30 kN load with a good factor of safety. Cast iron is brittle, so it would snap suddenly with no warning, whereas mild steel is ductile and stretches and yields first, which warns that the hanger is overloaded. Cast iron is strong in compression, so it suits a column, but it is a poor choice for a tension member.",
            model: "<ul><li>Strength in tension with evidence: the ultimate tensile stress of mild steel (430 N/mm²) is much greater than that of cast iron (120 to 160 N/mm²) (1)</li><li>Cast iron is brittle: it breaks suddenly with little or no plastic deformation (and has no yield stress in the table) (1)</li><li>Mild steel is ductile: it yields and stretches before it breaks, so there is a warning (1)</li><li>Consequence for the job: the steel hanger can carry the 30 kN with a higher factor of safety or a smaller section; cast iron's strength is in compression (600 to 900 N/mm²) and a tension member needs the tensile strength (1)</li></ul><p>Also acceptable: the comparison of yield stress and E where used correctly (mild steel yield 220, E 196 against 120); a working calculation of a safe stress. Do not accept &quot;steel is better&quot; or &quot;stronger&quot; with no evidence or direction of loading, and do not accept the compressive stress used to support cast iron in tension.</p>",
          },
        ],
      },
      {
        id: "structures-14",
        style: "Section 1 · short answer · frames and material behaviour",
        stem: "<p>A set of short questions on structures and materials.</p>",
        parts: [
          {
            label: "(a)", type: "text", marks: 2, rows: 4, minWords: 10,
            q: "A square frame ABCD has a smooth pin at each corner. A diagonal member AC is fitted. Explain why the diagonal is needed.",
            points: [
              { desc: "Without the diagonal a four-sided pin-jointed frame can change shape (fold flat, distort, collapse) under a sideways load", negOK: true,
                not: [R`\btriang\w*\W+(?:\w+\W+){0,6}(?:collaps\w*|fold\w*|weak\w*|flimsy|unstable)`],
                any: [R`\b(?:collaps\w*|fold\w*|deform\w*|distort\w*|rack\w*|flatten\w*|flop\w*|buckl\w*|wobbl\w*|swing\w*|sway\w*|parallelogram|unstable|flex\w*|lop-?sided)\b`] },
              { desc: "The diagonal makes two triangles, and a triangle cannot change shape unless a member changes length, so the frame is rigid", negOK: true, group: "tri",
                all: [R`\btriang\w*`, R`\b(?:rigid|stiff|stable|strong|keeps?|holds?|retains?|fixed|locks?|locked|solid|sound|cannot|can't)\b`],
                not: [R`\btriang\w*\W+(?:\w+\W+){0,4}(?:weak\w*|unstable|flimsy|collaps\w*|fold\w*)`, R`\b(?:triang\w*|diagonal|brace)\W+(?:\w+\W+){0,3}(?:is|are|isn't|aren't)\W+(?:not|never)\W+(?:\w+\W+){0,1}(?:rigid|stiff|stable|strong)`] },
              { desc: "The diagonal braces the frame so that it is rigid", negOK: true, group: "tri",
                all: [R`\b(?:diagonal|brace|bracing|braced|extra member|cross[- ]?member)\b`, R`\b(?:rigid|stiff|stable|stiffen\w*|stabili[sz]\w*)\b`],
                not: [R`\b(?:triang\w*|diagonal|brace)\W+(?:\w+\W+){0,3}(?:is|are|isn't|aren't)\W+(?:not|never)\W+(?:\w+\W+){0,1}(?:rigid|stiff|stable|strong)`] },
            ],
            sample: "Without a diagonal, a square frame with a pin at every corner is able to fold flat sideways into a parallelogram. The diagonal splits it into two triangles, and a triangle is rigid because no corner is able to move unless a member changes length.",
            model: "<ul><li>A four-sided frame with pinned joints is not rigid: it can fold, distort or collapse sideways (1)</li><li>The diagonal divides it into triangles, and a triangle cannot change shape without a member changing length, so the frame is rigid (1)</li></ul><p>Also acceptable: the diagonal carries the sideways load as a tie or strut. Do not accept &quot;it makes it stronger&quot; alone.</p>",
          },
          {
            label: "(b)", type: "multi", marks: 2, a: [1, 4],
            q: "Choose the <strong>two</strong> statements that are true of a <strong>brittle</strong> material such as cast iron.",
            opts: [
              "It stretches a long way and thins before it breaks",
              "It breaks suddenly with little or no plastic deformation",
              "It can easily be rolled into thin sheets",
              "Its stress-strain graph has a long plastic region",
              "It is often much stronger in compression than in tension",
            ],
            why: "Brittle materials give no warning: they snap with little plastic deformation, and cast iron is a good example of one that resists squeezing (600–900 N/mm²) far better than stretching (120–160 N/mm²). Stretching a long way, long plastic regions and rolling into sheets are the behaviour of ductile and malleable metals.",
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 1,
            q: "Two bars have the same dimensions: one is steel (E = 196 kN/mm²) and one is aluminium alloy (E = 70 kN/mm²). They carry the same tension, within the elastic region. Which statement is correct?",
            opts: [
              "The aluminium alloy bar stretches less, because it is lighter",
              "The aluminium alloy bar stretches more, because it has the lower Young's modulus",
              "Both stretch the same, because the force is the same",
              "The steel bar stretches more, because it has the higher Young's modulus",
            ],
            why: "The stress is the same for both bars, so strain = stress ÷ E is larger for the material with the smaller E. The aluminium alloy is less stiff and stretches nearly three times as much. Mass does not enter the calculation.",
          },
        ],
      },
    ],
  };
})();
