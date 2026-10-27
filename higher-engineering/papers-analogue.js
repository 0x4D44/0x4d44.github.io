/* Past-paper practice: Analogue electronics. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HEP_BANK = window.HEP_BANK || {});
  const R = String.raw;

  /* ---- circuit-diagram helpers (palette: ink, blue annotations, cream paper) ---- */
  const INK = "#1d1a14", BLUE = "#1f4e79", PAPER = "#fffaf0", GRID = "#e4d9bd";
  const f1 = (n) => Math.round(n * 10) / 10;
  const svg = (w, h, label, body) =>
    `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif"><rect width="${w}" height="${h}" fill="${PAPER}"/>${body}</svg>`;
  const wire = (...pts) => `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const line = (x1, y1, x2, y2, sw, col, dash) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col || INK}" stroke-width="${sw || 2}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linecap="round"/>`;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${INK}"/>`;
  const open = (x, y) => `<circle cx="${x}" cy="${y}" r="3.8" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`;
  const txt = (x, y, s, o) => {
    o = o || {};
    return `<text x="${x}" y="${y}" font-size="${o.size || 13}" text-anchor="${o.anchor || "middle"}" fill="${o.col || INK}"${o.bold ? ' font-weight="700"' : ""}${o.italic ? ' font-style="italic"' : ""}>${s}</text>`;
  };
  /* a small solid arrowhead whose tip is at (x, y), pointing in direction d (r, l, u, d) */
  const head = (x, y, d, col) => {
    const L = 9, W = 3.6, m = { r: [-L, -W, -L, W], l: [L, -W, L, W], d: [-W, -L, W, -L], u: [-W, L, W, L] }[d];
    return `<path d="M${x} ${y}L${x + m[0]} ${y + m[1]}L${x + m[2]} ${y + m[3]}Z" fill="${col || BLUE}"/>`;
  };
  /* a current arrow: a short line with a head, centred on (x, y) */
  const cur = (x, y, d, label, lx, ly) => {
    const v = { r: [1, 0], l: [-1, 0], u: [0, -1], d: [0, 1] }[d];
    const x1 = x - v[0] * 13, y1 = y - v[1] * 13, x2 = x + v[0] * 13, y2 = y + v[1] * 13;
    return line(x1, y1, x2, y2, 1.8, BLUE) + head(x2, y2, d) + (label ? txt(lx, ly, label, { col: BLUE, anchor: "middle" }) : "");
  };
  /* resistor (rectangle, UK style). Horizontal between x1 and x2 at y, or vertical between y1 and y2 at x. */
  const rH = (x1, x2, y) => {
    const c = (x1 + x2) / 2;
    return line(x1, y, c - 20, y) + line(c + 20, y, x2, y) + `<rect x="${c - 20}" y="${y - 8}" width="40" height="16" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`;
  };
  const rV = (x, y1, y2) => {
    const c = (y1 + y2) / 2;
    return line(x, y1, x, c - 20) + line(x, c + 20, x, y2) + `<rect x="${x - 8}" y="${c - 20}" width="16" height="40" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`;
  };
  /* thermistor: resistor with the diagonal "-theta" line through it */
  const thermV = (x, y1, y2) => {
    const c = (y1 + y2) / 2;
    return rV(x, y1, y2) + `<path d="M${x - 22} ${c + 24}H${x - 13}L${x + 13} ${c - 24}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
  };
  /* cell / battery: positive plate (long) at the top */
  const cell = (x, y1, y2) => {
    const c = (y1 + y2) / 2;
    return line(x, y1, x, c - 5) + line(x, c + 5, x, y2) + line(x - 16, c - 5, x + 16, c - 5, 2.6) + line(x - 9, c + 5, x + 9, c + 5, 4.2);
  };
  /* diode drawn vertically; cathode (bar) at the TOP, so conventional current is allowed to flow upwards */
  const diodeUp = (x, y1, y2) => {
    const c = (y1 + y2) / 2;
    return line(x, y1, x, c - 9) + line(x, c + 9, x, y2) +
      `<path d="M${x - 9} ${c + 9}L${x + 9} ${c + 9}L${x} ${c - 9}Z" fill="${PAPER}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` + line(x - 10, c - 9, x + 10, c - 9, 2.6);
  };
  /* relay coil / solenoid: a tall box */
  const coilV = (x, y1, y2) => {
    const c = (y1 + y2) / 2;
    return line(x, y1, x, c - 24) + line(x, c + 24, x, y2) + `<rect x="${x - 12}" y="${c - 24}" width="24" height="48" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`;
  };
  /* lamp: circle with a cross */
  const lampV = (x, y1, y2) => {
    const c = (y1 + y2) / 2, k = 10.6;
    return line(x, y1, x, c - 15) + line(x, c + 15, x, y2) + `<circle cx="${x}" cy="${c}" r="15" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
      line(x - k, c - k, x + k, c + k, 1.8) + line(x - k, c + k, x + k, c - k, 1.8);
  };
  /* npn transistor in a circle. Base lead ends at (cx-40, cy); collector at (cx+12, cy-40); emitter at (cx+12, cy+40). */
  const npn = (cx, cy) => {
    const ex = cx + 12, ey = cy + 24, sx = cx - 10, sy = cy + 8, t = 0.8, tx = sx + (ex - sx) * t, ty = sy + (ey - sy) * t;
    const a = Math.atan2(ey - sy, ex - sx), L = 10, W = 4.2;
    const bx = tx - Math.cos(a) * L, by = ty - Math.sin(a) * L, nx = -Math.sin(a) * W, ny = Math.cos(a) * W;
    return `<circle cx="${cx}" cy="${cy}" r="30" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` +
      line(cx - 40, cy, cx - 10, cy) + line(cx - 10, cy - 17, cx - 10, cy + 17, 3.4) +
      wire([cx - 10, cy - 8], [cx + 12, cy - 24], [cx + 12, cy - 40]) + wire([sx, sy], [ex, ey], [ex, cy + 40]) +
      `<path d="M${f1(tx)} ${f1(ty)}L${f1(bx + nx)} ${f1(by + ny)}L${f1(bx - nx)} ${f1(by - ny)}Z" fill="${INK}"/>`;
  };
  /* n-channel enhancement MOSFET. Gate lead ends at (cx-40, cy); drain at (cx+14, cy-40); source at (cx+14, cy+40). */
  const nmos = (cx, cy) =>
    line(cx - 40, cy, cx - 16, cy) + line(cx - 16, cy - 20, cx - 16, cy + 20, 3) +
    line(cx - 6, cy - 21, cx - 6, cy - 9, 3) + line(cx - 6, cy - 6, cx - 6, cy + 6, 3) + line(cx - 6, cy + 9, cx - 6, cy + 21, 3) +
    wire([cx - 6, cy - 15], [cx + 14, cy - 15], [cx + 14, cy - 40]) + wire([cx - 6, cy + 15], [cx + 14, cy + 15], [cx + 14, cy + 40]) +
    line(cx - 6, cy, cx + 14, cy) + line(cx + 14, cy, cx + 14, cy + 15) + head(cx - 6, cy, "l", INK);
  /* op-amp triangle. Inputs at (cx-40, cy-20) and (cx-40, cy+20); output at (cx+40, cy); supply pins at x = cx.
     invTop: the inverting (-) input is the upper one. */
  const opamp = (cx, cy, invTop) =>
    `<path d="M${cx - 40} ${cy - 40}L${cx - 40} ${cy + 40}L${cx + 40} ${cy}Z" fill="${PAPER}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
    txt(cx - 30, cy - 15, invTop ? "−" : "+", { size: 17, bold: true }) + txt(cx - 30, cy + 25, invTop ? "+" : "−", { size: 17, bold: true });
  const rail = (x1, x2, y, label, lx) => line(x1, y, x2, y, 2.4) + txt(lx == null ? x1 : lx, y - 8, label, { anchor: "start", bold: true });
  const lab = (x, y, s, anchor) => txt(x, y, s, { anchor: anchor || "middle" });

  const FIG = {};

  /* ---- fig 1: series-parallel ---- */
  FIG.series = svg(440, 230, "Circuit diagram: a 9.6 volt cell feeds a 1.2 kilohm resistor R1 in series with two parallel branches, R2 of 3.0 kilohms and R3 of 6.0 kilohms. The supply current I flows through R1 and the current I3 flows down R3.",
    wire([60, 50], [105, 50]) + rH(105, 205, 50) + wire([205, 50], [340, 50]) +
    cell(60, 50, 180) + wire([60, 180], [340, 180]) +
    wire([270, 50], [270, 74]) + rV(270, 74, 156) + wire([270, 156], [270, 180]) + dot(270, 50) + dot(270, 180) +
    wire([340, 50], [340, 74]) + rV(340, 74, 156) + wire([340, 156], [340, 180]) + dot(340, 50) + dot(340, 180) +
    lab(155, 34, "R<tspan font-size=\"10\" dy=\"3\">1</tspan><tspan dy=\"-3\"> = 1.2 kΩ</tspan>") +
    lab(250, 120, "R<tspan font-size=\"10\" dy=\"3\">2</tspan>", "end") + lab(250, 136, "3.0 kΩ", "end") +
    lab(360, 120, "R<tspan font-size=\"10\" dy=\"3\">3</tspan>", "start") + lab(360, 136, "6.0 kΩ", "start") +
    lab(44, 124, "9.6 V", "end") + txt(75, 44, "+", { size: 15, bold: true }) +
    cur(82, 50, "r", null) + lab(82, 38, "I") + cur(316, 118, "d", null) + lab(304, 122, "I<tspan font-size=\"10\" dy=\"3\">3</tspan>", "end"));

  /* ---- fig 3: thermistor divider ---- */
  FIG.thermDivider = svg(330, 270, "Circuit diagram: a 6.0 volt supply across a series pair. The thermistor is the upper resistor and the fixed resistor R is the lower resistor. The output voltage Vout is taken from the junction between them, so it is the voltage across R.",
    rail(60, 190, 28, "+6.0 V") + wire([110, 28], [110, 56]) + thermV(110, 56, 120) + wire([110, 120], [110, 140]) + dot(110, 140) +
    wire([110, 140], [110, 150]) + rV(110, 150, 220) + wire([110, 220], [110, 244]) + rail(60, 190, 244, "0 V") + lab(190, 258, "") +
    wire([110, 140], [200, 140]) + open(200, 140) + lab(214, 145, "V<tspan font-size=\"10\" dy=\"3\">out</tspan>", "start") +
    lab(88, 98, "thermistor", "end") + txt(150, 90, "−θ", { col: INK, size: 14, italic: true }) +
    lab(88, 190, "R", "end"));

  /* ---- fig 4: relay driver with flyback diode D1 ---- */
  FIG.relay = svg(400, 300, "Circuit diagram: a 6.0 volt relay driver. The relay coil is between the positive rail and the collector of an npn transistor, with diode D1 connected across the coil. A base resistor joins the input to the base and the emitter goes to 0 volts.",
    rail(40, 340, 28, "+6.0 V") + dot(250, 28) + wire([250, 28], [250, 50]) + dot(250, 50) + coilV(250, 50, 140) + wire([250, 140], [250, 160]) + dot(250, 140) +
    wire([250, 50], [320, 50]) + diodeUp(320, 50, 140) + wire([320, 140], [250, 140]) +
    npn(238, 200) + wire([250, 240], [250, 268]) + rail(40, 340, 268, "0 V") +
    open(34, 200) + wire([40, 200], [64, 200]) + rH(64, 170, 200) + wire([170, 200], [198, 200]) +
    lab(30, 188, "V<tspan font-size=\"10\" dy=\"3\">in</tspan>", "start") + lab(117, 182, "R<tspan font-size=\"10\" dy=\"3\">B</tspan>") +
    lab(232, 98, "relay coil", "end") + lab(338, 98, "D<tspan font-size=\"10\" dy=\"3\">1</tspan>", "start"));

  /* ---- fig 5: lamp driver ---- */
  FIG.lamp = svg(400, 290, "Circuit diagram: a 12 volt lamp driver. A 3.6 watt lamp is in the collector circuit of an npn transistor. A control input of 5.0 volts is connected to the base through base resistor RB. The collector current IC and base current IB are marked.",
    rail(40, 340, 28, "+12 V") + wire([250, 28], [250, 44]) + lampV(250, 44, 124) + wire([250, 124], [250, 160]) +
    npn(238, 200) + wire([250, 240], [250, 260]) + rail(40, 340, 260, "0 V") +
    open(34, 200) + wire([40, 200], [64, 200]) + rH(64, 170, 200) + wire([170, 200], [198, 200]) +
    lab(30, 186, "V<tspan font-size=\"10\" dy=\"3\">in</tspan> = 5.0 V", "start") + lab(117, 182, "R<tspan font-size=\"10\" dy=\"3\">B</tspan>") +
    lab(228, 90, "lamp", "end") + lab(228, 106, "3.6 W", "end") +
    cur(280, 142, "d", null) + lab(298, 146, "I<tspan font-size=\"10\" dy=\"3\">C</tspan>", "start") +
    cur(184, 218, "r", null) + lab(184, 240, "I<tspan font-size=\"10\" dy=\"3\">B</tspan>"));

  /* ---- fig 7: MOSFET circuit (left) and transfer characteristic (right) ---- */
  const gx = (v) => 340 + v * 40, gy = (i) => 262 - i * 56;
  let grid = "";
  for (let v = 0; v <= 5; v += 0.5) grid += line(gx(v), gy(0), gx(v), gy(4), v % 1 === 0 ? 1 : 0.6, GRID);
  for (let i = 0; i <= 4; i += 0.5) grid += line(gx(0), gy(i), gx(5), gy(i), i % 1 === 0 ? 1 : 0.6, GRID);
  let ticks = "";
  for (let v = 0; v <= 5; v++) ticks += txt(gx(v), gy(0) + 17, String(v));
  for (let i = 0; i <= 4; i++) ticks += txt(gx(0) - 8, gy(i) + 4, String(i), { anchor: "end" });
  let curve = `M${gx(0)} ${gy(0)}L${gx(2)} ${gy(0)}`;
  for (let v = 2.05; v <= 5.0001; v += 0.05) curve += `L${f1(gx(v))} ${f1(gy(0.4 * (v - 2) * (v - 2)))}`;
  FIG.mosfet = svg(560, 310, "Left: a 12 volt supply feeds a 10 ohm solenoid, with a diode across it, in series with the drain of an n-channel MOSFET whose source is at 0 volts. Right: a graph of drain current ID in amps against gate-source voltage VGS in volts. ID is zero up to 2 volts then rises in a curve through 0.4 amps at 3 volts, 0.9 amps at 3.5 volts and 1.6 amps at 4 volts.",
    rail(24, 224, 28, "+12 V") + wire([134, 28], [134, 50]) + dot(134, 50) + coilV(134, 50, 132) + wire([134, 132], [134, 150]) + dot(134, 132) +
    wire([134, 50], [200, 50]) + diodeUp(200, 50, 132) + wire([200, 132], [134, 132]) +
    nmos(120, 190) + wire([134, 230], [134, 266]) + rail(24, 224, 266, "0 V") +
    open(18, 190) + wire([24, 190], [80, 190]) + lab(18, 176, "V<tspan font-size=\"10\" dy=\"3\">in</tspan>", "start") +
    lab(116, 87, "solenoid", "end") + lab(116, 103, "10 Ω", "end") +
    grid + line(gx(0), gy(4), gx(0), gy(0), 2) + line(gx(0), gy(0), gx(5), gy(0), 2) + ticks +
    `<path d="${curve}" fill="none" stroke="#b3261e" stroke-width="2.6" stroke-linejoin="round"/>` +
    lab(gx(2.5), gy(0) + 36, "gate–source voltage V<tspan font-size=\"10\" dy=\"3\">GS</tspan> (V)") +
    `<text transform="translate(${gx(0) - 30} ${gy(2)}) rotate(-90)" font-size="13" text-anchor="middle" fill="${INK}">drain current I<tspan font-size="10" dy="3">D</tspan> (A)</text>`);

  /* ---- fig 9: inverting amplifier ---- */
  FIG.inverting = svg(440, 240, "Circuit diagram: an op-amp with its inverting input fed from the input voltage Vi through a 4.7 kilohm resistor Ri. A 33 kilohm feedback resistor Rf joins the output back to the inverting input. The non-inverting input is connected to 0 volts. The supplies are plus and minus 12 volts.",
    opamp(250, 130, true) +
    open(30, 110) + wire([36, 110], [70, 110]) + rH(70, 160, 110) + wire([160, 110], [210, 110]) + dot(180, 110) +
    wire([180, 110], [180, 40], [250, 40]) + rH(180, 340, 40) +
    wire([340, 40], [340, 130], [290, 130]) + dot(340, 130) + wire([340, 130], [400, 130]) + open(406, 130) +
    wire([210, 150], [186, 150], [186, 188]) + wire([172, 188], [200, 188]) + wire([178, 194], [194, 194]) + wire([184, 200], [188, 200]) +
    wire([250, 110], [250, 76]) + wire([250, 150], [250, 184]) +
    lab(30, 96, "V<tspan font-size=\"10\" dy=\"3\">i</tspan>", "start") + lab(115, 94, "R<tspan font-size=\"10\" dy=\"3\">i</tspan> = 4.7 kΩ") +
    lab(260, 24, "R<tspan font-size=\"10\" dy=\"3\">f</tspan> = 33 kΩ") + lab(420, 118, "V<tspan font-size=\"10\" dy=\"3\">o</tspan>", "middle") +
    lab(258, 84, "+12 V", "start") + lab(258, 200, "−12 V", "start") + lab(200, 218, "0 V", "end"));
  /* the Rf box above was drawn by rH over a wire; tidy: nothing else needed */

  /* ---- fig 11: frost-protection controller ---- */
  FIG.controller = svg(560, 340, "Circuit diagram of a heater controller powered from 9.0 volts. A thermistor above a fixed resistor R forms the sensor divider whose output Vi goes to the inverting input of an op-amp comparator. A divider of R3, 20 kilohms, over R4, 10 kilohms, gives the reference voltage Vref to the non-inverting input. The comparator output goes through base resistor RB to an npn transistor that drives a relay coil, which has a diode across it.",
    rail(24, 540, 30, "+9.0 V") + rail(24, 540, 316, "0 V") +
    /* sensor divider */
    wire([54, 30], [54, 66]) + thermV(54, 66, 130) + wire([54, 130], [54, 146]) + dot(54, 146) + wire([54, 146], [54, 170]) + rV(54, 170, 250) + wire([54, 250], [54, 316]) +
    /* reference divider */
    wire([150, 30], [150, 56]) + rV(150, 56, 120) + wire([150, 120], [150, 186]) + dot(150, 186) + wire([150, 186], [150, 200]) + rV(150, 200, 270) + wire([150, 270], [150, 316]) +
    /* comparator */
    opamp(290, 166, true) +
    `<path d="M54 146H142a8 8 0 0 1 16 0H250" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    wire([150, 186], [250, 186]) +
    wire([290, 146], [290, 30]) + dot(290, 30) + wire([290, 186], [290, 316]) + dot(290, 316) +
    /* output stage */
    wire([330, 166], [352, 166]) + rH(352, 420, 166) + wire([420, 166], [440, 166], [440, 216], [446, 216]) +
    npn(486, 216) +
    wire([498, 176], [498, 150]) + coilV(498, 50, 150) + wire([498, 30], [498, 50]) + dot(498, 62) + dot(498, 138) +
    wire([498, 62], [536, 62]) + diodeUp(536, 62, 138) +
    wire([536, 138], [498, 138]) + wire([498, 256], [498, 316]) + dot(498, 316) + dot(54, 316) + dot(150, 316) +
    /* labels */
    lab(72, 104, "thermistor", "start") + lab(34, 214, "R", "end") +
    lab(166, 84, "R<tspan font-size=\"10\" dy=\"3\">3</tspan>", "start") + lab(166, 100, "20 kΩ", "start") +
    lab(166, 232, "R<tspan font-size=\"10\" dy=\"3\">4</tspan>", "start") + lab(166, 248, "10 kΩ", "start") +
    lab(70, 140, "V<tspan font-size=\"10\" dy=\"3\">i</tspan>", "start") + lab(204, 178, "V<tspan font-size=\"10\" dy=\"3\">ref</tspan>", "middle") +
    lab(386, 150, "R<tspan font-size=\"10\" dy=\"3\">B</tspan>") + lab(480, 96, "relay coil", "end") + lab(536, 50, "D", "middle"));



  /* ---- marker helpers: clause-bounded (tempered) regex source strings, built with String.raw ---- */
  const C = (stop, n) => R`(?:(?!${stop})[^.;]){0,${n}}`;   /* up to n characters of one clause that never run into `stop` */
  const NEG = R`\bnot\b|n't|\bnever\b|\bno\b|\bcannot\b`;
  const UP = R`(?:ris(?:es|e|ing|en)|increas\w*|goes? up|going up|went up|climb\w*|grow\w*|higher|bigger|larger|greater)`;
  const DOWN = R`(?:fall\w*|drop\w*|decreas\w*|lower\w*|reduc\w*|smaller|less\b|dip\w*|declin\w*|goes? down|going down|went down|diminish\w*)`;
  const UPSTOP = R`ris(?:es|e|ing)|increas|goes? up|higher|bigger|larger|greater|climb|grow`;
  const DOWNSTOP = R`fall|drop|decreas|lower|reduc|smaller|\bless\b|goes? down`;
  const VS = R`whereas|while|\bbut\b|unlike|\bthan\b|compared|however|rather`;

  B.analogue = {
    intro:
      "<p>Analogue electronics is the heaviest and hardest block of the paper, <strong>20 to 35 of the 110 marks</strong>, and the course reports say candidates lose marks on rearranging the divider formula, on the voltage across the base resistor and the solenoid, and on written descriptions that name no quantity and no direction. Fifteen questions, 79 marks: dividers and sensors, diodes and relays, the BJT and the MOSFET, op-amps, and a whole-system controller. About half the marks are calculations (keep full calculator values, use the units asked for); the written answers want a <strong>cause, a direction and a physical result</strong>.</p>",
    questions: [
      /* ================= 01 series and parallel ================= */
      {
        id: "analogue-01",
        style: "Section 1 · short answer · series and parallel resistors",
        stem: R`<p>The circuit in the figure is connected to a 9.6 V supply. $R_1 = 1.2\ \text{k}\Omega$ is in series with the parallel pair $R_2 = 3.0\ \text{k}\Omega$ and $R_3 = 6.0\ \text{k}\Omega$.</p>`,
        figure: FIG.series,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 3.2, tol: 0.01, unit: "kΩ",
            q: R`Calculate the total resistance of the circuit, in $\text{k}\Omega$.`,
            why: R`<p>Parallel pair: $R_{23} = \dfrac{R_2R_3}{R_2+R_3} = \dfrac{3.0 \times 6.0}{3.0 + 6.0} = 2.0\ \text{k}\Omega$.</p><p>Series: $R_t = R_1 + R_{23} = 1.2 + 2.0 = 3.2\ \text{k}\Omega$ (1).</p><p>Slip: adding all three, $1.2 + 3.0 + 6.0 = 10.2\ \text{k}\Omega$, forgets that $R_2$ and $R_3$ are in parallel.</p>`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 3.0, tol: 0.02, unit: "mA",
            q: R`Calculate the current $I$ drawn from the supply, in mA. (Use $R_t = 3.2\ \text{k}\Omega$ if you did not find it.)`,
            why: R`<p>$I = \dfrac{V}{R_t} = \dfrac{9.6}{3200} = 0.0030\ \text{A} = 3.0\ \text{mA}$ (1).</p><p>With the resistance in $\text{k}\Omega$ the answer comes out directly in mA: $9.6 \div 3.2 = 3.0$.</p>`,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 1,
            q: R`What is the current $I_3$ in $R_3$?`,
            opts: [R`$0.50\ \text{mA}$`, R`$1.0\ \text{mA}$`, R`$1.6\ \text{mA}$`, R`$3.0\ \text{mA}$`],
            why: R`<p>The voltage across $R_1$ is $3.0\ \text{mA} \times 1.2\ \text{k}\Omega = 3.6$ V, so the parallel pair has $9.6 - 3.6 = 6.0$ V across it (Kirchhoff 2). Then $I_3 = \dfrac{6.0}{6.0} = 1.0$ mA.</p><p>$1.6$ mA is $9.6 \div 6.0$: it puts the whole supply across $R_3$. $3.0$ mA is the total current, not the share in one branch. $0.50$ mA has no basis in the circuit.</p>`,
          },
        ],
      },

      /* ================= 02 dividers: rearranging, sensor placement, potentiometer ================= */
      {
        id: "analogue-02",
        style: "Section 1 · short answer · voltage dividers",
        stem: R`<p>Voltage dividers turn a change of resistance into a change of voltage. A divider is made from two resistors in series across a supply, with the output taken across the lower resistor $R_2$.</p>`,
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 8.1, tol: 0.02, unit: "kΩ",
            q: R`The supply is 12 V and $R_2 = 2.7\ \text{k}\Omega$. The output voltage across $R_2$ is to be 3.0 V. Calculate the resistance of the upper resistor $R_1$, in $\text{k}\Omega$.`,
            why: R`<p>$V_1 = V_s - V_2 = 12 - 3.0 = 9.0$ V (1).</p><p>$\dfrac{V_1}{V_2} = \dfrac{R_1}{R_2}$, so $R_1 = R_2 \times \dfrac{V_1}{V_2} = 2.7 \times \dfrac{9.0}{3.0} = 8.1\ \text{k}\Omega$ (1).</p><p>Check: $R_1$ is three times $R_2$ and has three times the voltage. Slip: using 12 V as $V_1$ gives $10.8\ \text{k}\Omega$.</p>`,
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 2,
            q: R`An NTC thermistor and a fixed resistor form a divider. The output voltage must <strong>fall</strong> as the temperature rises. Which arrangement does this?`,
            opts: [
              "The thermistor is the upper resistor and the output is taken across the fixed resistor",
              "The thermistor and the fixed resistor are in parallel across the supply",
              "The thermistor is the lower resistor and the output is taken across the thermistor",
              "The thermistor alone is connected across the supply and the output is taken across it",
            ],
            why: R`<p>When it is hotter the NTC thermistor's resistance falls, so it takes a smaller share of the supply. If the output is across the thermistor, the output falls. The first option is the reverse (the output across the fixed resistor rises). In parallel there is no sharing of voltage. A lone thermistor has the full supply across it whatever its resistance, so its voltage never changes.</p>`,
          },
          {
            label: "(c)", type: "num", marks: 1, a: 4.0, tol: 0.02, unit: "kΩ",
            q: R`A $10\ \text{k}\Omega$ potentiometer is connected across a 9.0 V supply. The wiper is set so that the output is 3.6 V above 0 V. Calculate the resistance between the wiper and the 0 V end, in $\text{k}\Omega$.`,
            why: R`<p>The pot is a divider: the output fraction is $\dfrac{3.6}{9.0} = 0.40$, so the lower section is $0.40 \times 10 = 4.0\ \text{k}\Omega$ (1).</p><p>$6.0\ \text{k}\Omega$ is the other section, between the wiper and the supply.</p>`,
          },
        ],
      },

      /* ================= 03 thermistor divider design ================= */
      {
        id: "analogue-03",
        style: "Section 2 · context question · design a sensor divider and explain",
        stem: R`<p>A model greenhouse monitor uses an NTC thermistor and a fixed resistor $R$ as a voltage divider across a 6.0 V supply, as shown. The output $V_{out}$ is taken across $R$. Thermistor resistance: 20 °C 12.5 kΩ; 30 °C 8.1 kΩ; 40 °C 5.3 kΩ; 50 °C 3.6 kΩ; 60 °C 2.5 kΩ.</p>`,
        figure: FIG.thermDivider,
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 5.4, tol: 0.02, unit: "kΩ",
            q: R`$V_{out}$ must be 2.4 V when the temperature is 30 °C. Calculate the value of $R$, in $\text{k}\Omega$.`,
            why: R`<p>At 30 °C the thermistor is $8.1\ \text{k}\Omega$. Its voltage is $6.0 - 2.4 = 3.6$ V (1).</p><p>$\dfrac{V_R}{V_{th}} = \dfrac{R}{R_{th}}$, so $R = 8.1 \times \dfrac{2.4}{3.6} = 5.4\ \text{k}\Omega$ (1).</p><p>Slip: $8.1 \times \dfrac{3.6}{2.4} = 12.2\ \text{k}\Omega$ turns the ratio upside down; the smaller voltage belongs to the smaller resistor.</p>`,
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: R`Explain what happens to $V_{out}$ as the temperature rises above 30 °C.`,
            points: [
              { desc: "The thermistor's resistance falls as the temperature rises",
                not: [R`resistance${C(R`falls?|drop|decreas|lower|reduc|smaller|\bless\b|\bas\b|when|if|\bso\b|goes? down`, 30)}(?:ris(?:es|e|ing)|increas\w*|higher|bigger|larger|greater|goes up|climb\w*|grow\w*)`],
                any: [R`resistance${C(UPSTOP + R`|\bas\b|when|if|` + NEG, 45)}${DOWN}`, R`${DOWN}${C(R`resistor`, 14)}resistance`, R`(?:less|lower|smaller|reduced)\W+(?:\w+\W+){0,1}resistance`] },
              { desc: "So the thermistor takes a smaller share of the supply and the voltage across R (Vout) rises", negOK: true,
                not: [R`(?:\bv ?out\b|output(?: voltage)?)\W+(?:\w+\W+){0,3}${DOWN}`],
                any: [
                  R`(?:\bv ?_?out\b|output(?: voltage)?|voltage (?:across|over|at|on) (?:the )?(?:fixed )?(?:resistor|r\b)|voltage (?:across|over|at) (?:the )?output)${C(R`temperature|hotter|heat|warm|\bas\b|when|if|` + NEG, 60)}${UP}`,
                  R`(?:fixed )?resistor${C(NEG + R`|thermistor`, 40)}${UP}\W+(?:\w+\W+){0,2}(?:share|proportion|voltage|part|fraction)`,
                  R`thermistor${C(NEG, 40)}(?:smaller|less|lower|reduced)\W+(?:\w+\W+){0,2}(?:share|proportion|voltage|part|fraction)`,
                ] },
            ],
            sample: "As the temperature rises the resistance of the thermistor falls, so it takes a smaller share of the 6.0 V supply. The fixed resistor takes a bigger share, so the output voltage across it rises.",
            model: R`<ul><li>The resistance of the (NTC) thermistor falls as the temperature rises (1)</li><li>so the thermistor takes a smaller share of the supply and $V_{out}$, the voltage across $R$, <strong>rises</strong> (1)</li></ul><p>Also acceptable: the voltage across the thermistor falls, so (supply voltage constant) the voltage across $R$ rises. Do not accept $V_{out}$ falls, or "the voltage changes" with no direction.</p>`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 4.10, tol: 0.01, unit: "V",
            q: R`Using $R = 5.4\ \text{k}\Omega$, calculate $V_{out}$ when the temperature is 60 °C.`,
            why: R`<p>At 60 °C, $R_{th} = 2.5\ \text{k}\Omega$. Use the divider with the output across $R$:</p><p>$V_{out} = V_s \times \dfrac{R}{R_{th} + R} = 6.0 \times \dfrac{5.4}{2.5 + 5.4}$ (1)</p><p>$V_{out} = 6.0 \times 0.6835 = 4.10$ V (1). This is higher than 2.4 V at 30 °C, as part (b) predicts.</p><p>Slip: $6.0 \times \dfrac{2.5}{7.9} = 1.90$ V is the thermistor's voltage, not $V_{out}$.</p>`,
          },
        ],
      },

      /* ================= 04 diode, relay, flyback ================= */
      {
        id: "analogue-04",
        style: "Section 1 · short answer · relay driver and protection diode",
        stem: R`<p>A 6.0 V relay has a coil resistance of $80\ \Omega$. The coil is switched by an npn transistor as shown. Diode D<sub>1</sub> is connected across the coil.</p>`,
        figure: FIG.relay,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 75, tol: 0.5, unit: "mA",
            q: R`Calculate the current in the relay coil when the relay is operating, in mA.`,
            why: R`<p>$I = \dfrac{V}{R} = \dfrac{6.0}{80} = 0.075\ \text{A} = 75\ \text{mA}$ (1).</p>`,
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: R`Explain why diode D<sub>1</sub> is connected across the relay coil.`,
            points: [
              { desc: "The coil is inductive: when the current is switched off the collapsing magnetic field produces a large voltage spike",
                all: [R`(?:spike\w*|surge\w*|(?:large|high|big|huge|sudden|reverse|back|induced|extra|excess\w*)\W+(?:\w+\W+){0,2}(?:voltage|emf|e\.m\.f\.?)|back.?emf|voltage (?:peak|pulse)|overvoltage)`, R`(?:coil|inductive|inductor|inductance|magnetic|field|relay|solenoid|motor|winding)`] },
              { desc: "The diode conducts / gives the current a path (loop) so the spike is limited",
                any: [
                  R`diode${C(NEG, 50)}(?:conduct\w*|absorb\w*|carr(?:y|ies|ied)|short\w*|clamp\w*|dissipat\w*|bypass\w*|provid\w*|giv\w*|allow\w*|let\w*|pass\w*|rout\w*|divert\w*|dump\w*|shunt\w*|circulat\w*|offer\w*)${C(NEG, 50)}(?:path|route|loop|current|spike|surge|voltage|energy|circuit|way|field)`,
                  R`(?:current|spike|surge|voltage|energy)${C(NEG, 40)}(?:flows?|goes?|passes?|circulat\w*|travels?|is carried|is conducted|is absorbed)${C(NEG, 30)}(?:through|round|via|into|in) (?:the )?diode`,
                ] },
              { desc: "This protects the transistor from damage",
                any: [
                  R`protect\w*${C(NEG, 60)}(?:transistor|circuit|component|electronics|switch|chip|driver|device)`,
                  R`(?:transistor|circuit|component|electronics|switch|chip)${C(NEG, 60)}(?:protected|safe|saved|shielded|undamaged)`,
                  R`(?:stop\w*|prevent\w*|avoid\w*|save\w*)${C(NEG, 40)}(?:damag\w*|destroy\w*|blow\w*|burn\w*|harm\w*)`,
                  R`(?:damag\w*|destroy\w*|blow\w*|burn\w*|fail\w*)${C(NEG, 50)}transistor`,
                ] },
            ],
            sample: "The relay coil is inductive, so when the transistor switches off the collapsing magnetic field produces a large voltage spike. The diode conducts this current round the coil, so the transistor is protected from damage.",
            model: R`<ul><li>The relay coil is inductive: when the current is switched off, the collapsing magnetic field produces a large voltage spike (1)</li><li>the diode conducts that current / provides a path for it, limiting the spike, so the transistor is protected from damage (1)</li></ul><p>Any two of the three ideas (coil, spike, diode conducts so the transistor is protected). Do not accept "it stops current flowing backwards" with no reason; it does not explain why a coil needs it.</p>`,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 2,
            q: R`Which statement describes D<sub>1</sub> while the transistor is <strong>conducting</strong> and the relay is operating?`,
            opts: [
              "It is forward biased, so it short-circuits the relay coil",
              "It is forward biased and drops about 0.7 V, so the coil gets less than 6.0 V",
              "It is reverse biased, so it carries no significant current",
              "It is reverse biased and carries the full coil current",
            ],
            why: R`<p>The cathode (bar) is joined to the positive rail, so the diode is <em>reverse biased</em> while the coil is energised and acts as if it is not there. It only conducts for a moment at switch-off. Forward bias would short out the coil and the relay would never operate; a reverse-biased diode cannot carry the full coil current.</p>`,
          },
        ],
      },

      /* ================= 05 BJT lamp driver ================= */
      {
        id: "analogue-05",
        style: "Section 2 · context question · design a transistor switch",
        stem: R`<p>A 12 V, 3.6 W lamp is switched by an npn transistor with $h_{FE} = 120$, as shown. The base resistor $R_B$ is connected to a 5.0 V control signal. Take $V_{BE} = 0.7$ V.</p>`,
        figure: FIG.lamp,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 300, tol: 1, unit: "mA",
            q: R`Calculate the current in the lamp when it is lit normally, in mA.`,
            why: R`<p>$P = VI$, so $I = \dfrac{P}{V} = \dfrac{3.6}{12} = 0.30\ \text{A} = 300\ \text{mA}$ (1).</p>`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 2.5, tol: 0.02, unit: "mA",
            q: R`Calculate the base current needed to give this collector current of 300 mA, in mA.`,
            why: R`<p>$h_{FE} = \dfrac{I_C}{I_B}$, so $I_B = \dfrac{I_C}{h_{FE}} = \dfrac{300}{120} = 2.5\ \text{mA}$ (1).</p>`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 1720, tol: 5, unit: "Ω",
            q: R`Calculate the <strong>largest</strong> value of base resistor $R_B$ that will light the lamp fully. Give your answer in $\Omega$. (Use $I_B = 2.5\ \text{mA}$ if you did not find it.)`,
            why: R`<p>The base resistor is in series with the base-emitter junction, which has 0.7 V across it: $V_{RB} = V_{in} - V_{BE} = 5.0 - 0.7 = 4.3$ V (1).</p><p>$R_B = \dfrac{V_{RB}}{I_B} = \dfrac{4.3}{2.5 \times 10^{-3}} = 1720\ \Omega$ (1).</p><p>Slip: $\dfrac{5.0}{2.5 \times 10^{-3}} = 2000\ \Omega$ forgets the 0.7 V. A smaller standard value such as $1.5\ \text{k}\Omega$ would be chosen in practice.</p>`,
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: R`A $1.0\ \text{k}\Omega$ base resistor is fitted instead. This gives $h_{FE}I_B = 516\ \text{mA}$. Explain why the lamp current stays at 300 mA however large the base current becomes.`,
            points: [
              { desc: "The lamp (load) and supply limit the collector current to V/R; it cannot rise above 300 mA", negOK: true,
                any: [
                  R`(?:lamp|load|bulb|resistance of the lamp)${C(NEG, 60)}(?:limit\w*|restrict\w*|set\w*|determin\w*|maximum|\bmax\b|control\w*|cap\w*|fix\w*|only (?:pass|allow|let|draw|take)\w*)`,
                  R`(?:supply|12 ?v)${C(NEG, 60)}(?:limit\w*|restrict\w*|set\w*|determin\w*|maximum|\bmax\b|cap\w*)${C(NEG, 40)}current`,
                  R`current${C(NEG, 50)}(?:limit\w*|restrict\w*|capped|set|determined|fixed|governed)${C(NEG, 30)}(?:by|to)${C(NEG, 30)}(?:lamp|load|bulb|supply|12 ?v|resistance)`,
                  R`(?:lamp|bulb)${C(NEG, 40)}(?:only|just)${C(NEG, 20)}(?:take\w*|draw\w*|pass\w*|need\w*|let\w*|allow\w*|use\w*)`,
                  R`(?:cannot|can't|can not|unable to|won't|will not|never|no more|no further)\W+(?:\w+\W+){0,3}(?:rise|increase|exceed|go (?:higher|above|up|beyond)|get (?:any )?(?:higher|bigger|larger)|pass|draw|flow)\W+(?:\w+\W+){0,4}(?:above|more|any|further|higher|than|300)`,
                ] },
              { desc: "The transistor is saturated (fully on, V_CE small); the extra base current is wasted",
                any: [R`(?:transistor|\bbjt\b|\bit\b|this)${C(NEG, 40)}saturat\w*`, R`saturat\w*${C(NEG, 30)}transistor`, R`\bsaturat(?:ed|ion)\b`, R`fully (?:switched |turned )?on`, R`(?:fully|completely) (?:open|conducting|switched)`, R`\bv ?ce\b${C(NEG, 40)}(?:small|low|zero|almost|nearly|0\b|few tenths|tiny)`, R`extra (?:base )?current${C(NEG, 40)}(?:wasted|no (?:effect|difference))`, R`(?:closed|on) switch`] },
            ],
            sample: "The lamp and the 12 V supply limit the collector current to 300 mA, so any extra base current has no further effect. The transistor is saturated: it is fully on, with only a small voltage across it.",
            model: R`<ul><li>The collector current is limited by the lamp and supply ($V_s/R_L$ = 300 mA); $h_{FE}I_B$ is only the <em>potential</em> current, so it cannot rise any further (1)</li><li>the transistor is saturated (fully on, closed switch, $V_{CE}$ very small) and the extra base current is wasted (1)</li></ul><p>Do not accept "the transistor is broken" or "the lamp would blow"; a bare "it is saturated" with no reason earns one mark.</p>`,
          },
          {
            label: "(e)", type: "num", marks: 1, a: 0.06, tol: 0.0005, unit: "W",
            q: R`In saturation $V_{CE} = 0.20$ V. Calculate the power dissipated between the collector and emitter, in W.`,
            why: R`<p>Power in the transistor = voltage <em>across it</em> times the current <em>through it</em>: $P = V_{CE}I_C = 0.20 \times 0.30 = 0.060\ \text{W}$ (1).</p><p>Slip: $12 \times 0.30 = 3.6$ W is the power in the lamp, not the transistor. This is why switching circuits are designed to be fully on or fully off: little heat is made in the transistor.</p>`,
          },
        ],
      },

      /* ================= 06 BJT active region ================= */
      {
        id: "analogue-06",
        style: "Section 2 · calculation · transistor in its active region",
        stem: R`<p>A heating element of resistance $68\ \Omega$ in a model greenhouse is in the collector circuit of an npn transistor with $h_{FE} = 150$. The supply is 9.0 V. A $39\ \text{k}\Omega$ base resistor is connected directly to the 9.0 V supply. Take $V_{BE} = 0.7$ V. The transistor is in its active region (not saturated). Keep full calculator values until the end.</p>`,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 213, tol: 0.5, unit: "µA",
            q: R`Calculate the base current, in $\mu\text{A}$.`,
            why: R`<p>$V_{RB} = 9.0 - 0.7 = 8.3$ V, so $I_B = \dfrac{8.3}{39\,000} = 2.13 \times 10^{-4}\ \text{A} = 213\ \mu\text{A}$ (1).</p><p>Slip: $\dfrac{9.0}{39\,000} = 231\ \mu\text{A}$ forgets the 0.7 V.</p>`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 31.9, tol: 0.1, unit: "mA",
            q: R`Calculate the collector current, in mA.`,
            why: R`<p>$I_C = h_{FE}I_B = 150 \times 2.128 \times 10^{-4} = 0.0319\ \text{A} = 31.9\ \text{mA}$ (1).</p><p>The most the element could pass is $9.0/68 = 132$ mA, so 31.9 mA is allowed and the transistor really is in its active region.</p>`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 6.83, tol: 0.01, unit: "V",
            q: R`Calculate the voltage $V_{CE}$ across the transistor.`,
            why: R`<p>Voltage across the element: $I_CR_L = 0.03192 \times 68 = 2.17$ V (1).</p><p>Kirchhoff 2: $V_{CE} = 9.0 - 2.17 = 6.83$ V (1).</p><p>Slip: stopping at 2.17 V gives the voltage across the element, not the transistor.</p>`,
          },
          {
            label: "(d)", type: "num", marks: 2, a: 0.218, tol: 0.0005, unit: "W",
            q: R`Calculate the power dissipated between the collector and emitter of the transistor, in W.`,
            why: R`<p>$P = V_{CE} \times I_C$ (1)</p><p>$P = 6.83 \times 0.03192 = 0.218\ \text{W}$ (1).</p><p>The report warns that few candidates got this: use the voltage <em>across the transistor</em>, not the 9.0 V supply ($9.0 \times 0.0319 = 0.287$ W is the wrong answer). The accurate 3 s.f. value is 0.218 W whether or not you round $V_{CE}$ first.</p>`,
          },
        ],
      },

      /* ================= 07 MOSFET ================= */
      {
        id: "analogue-07",
        style: "Section 2 · context question · MOSFET switching and transconductance",
        stem: R`<p>A 12 V supply operates a $10\ \Omega$ solenoid through an n-channel enhancement MOSFET, as shown. The transfer characteristic of the MOSFET is also shown. When the solenoid is operating, the voltage across the MOSFET, $V_{DS}$, is 3.0 V.</p>`,
        figure: FIG.mosfet,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 9.0, tol: 0.02, unit: "V",
            q: R`Calculate the voltage across the solenoid.`,
            why: R`<p>Kirchhoff 2: $V_{sol} = V_s - V_{DS} = 12 - 3.0 = 9.0$ V (1). This is the step many candidates skipped.</p>`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 0.9, tol: 0.005, unit: "A",
            q: R`Calculate the drain current $I_D$, in amps.`,
            why: R`<p>The solenoid and MOSFET are in series, so $I_D = \dfrac{V_{sol}}{R} = \dfrac{9.0}{10} = 0.90\ \text{A}$ (1).</p><p>Slip: $12/10 = 1.2$ A ignores the voltage across the MOSFET.</p>`,
          },
          {
            label: "(c)", type: "num", marks: 1, a: 3.5, tol: 0.12, unit: "V",
            q: R`Use the transfer characteristic to find the gate-source voltage $V_{GS}$ needed, in volts. (Use $I_D = 0.90\ \text{A}$ if you did not find it.)`,
            why: R`<p>Read across from $I_D = 0.90$ A to the curve, then down to the horizontal axis: $V_{GS} = 3.5$ V (1). Any reading from 3.4 V to 3.6 V is accepted.</p>`,
          },
          {
            label: "(d)", type: "num", marks: 2, a: 2.7, tol: 0.01, unit: "W",
            q: R`Calculate the power dissipated in the MOSFET, in W.`,
            why: R`<p>$P = V_{DS}I_D$ (1)</p><p>$P = 3.0 \times 0.90 = 2.7\ \text{W}$ (1).</p><p>Slips: $12 \times 0.90 = 10.8$ W uses the supply voltage; $9.0 \times 0.90 = 8.1$ W is the power in the solenoid.</p>`,
          },
          {
            label: "(e)", type: "num", marks: 2, a: 1.2, tol: 0.1, unit: "S",
            q: R`Use the transfer characteristic to calculate the transconductance $g_m$ of the MOSFET between $V_{GS} = 3.0$ V and $V_{GS} = 4.0$ V. Give the answer in siemens (A V$^{-1}$).`,
            why: R`<p>Read $I_D = 0.40$ A at 3.0 V and $I_D = 1.6$ A at 4.0 V (1).</p><p>$g_m = \dfrac{\Delta I_D}{\Delta V_{GS}} = \dfrac{1.6 - 0.40}{4.0 - 3.0} = 1.2\ \text{S}$ (1).</p><p>It is the gradient of the characteristic. Slip: $1.6/4.0 = 0.40$ divides one current by one voltage instead of using the changes.</p>`,
          },
          {
            label: "(f)", type: "text", marks: 1, rows: 3, minWords: 4,
            q: R`State what is meant by the threshold voltage of an n-channel enhancement MOSFET.`,
            points: [
              { desc: "The minimum gate-source voltage at which the MOSFET begins to conduct",
                not: [R`(?:fully|completely|maximum|full)\W+(?:\w+\W+){0,2}(?:on\b|conduct\w*|switched|turned)|(?:on\b|conduct\w*|switch\w*|turn\w*)\W+(?:fully|completely)`],
                any: [R`(?:minimum|lowest|least|smallest|at least|just enough|point at which|value at which|level at which|voltage (?:at|where|when) which|voltage (?:at|where|when))${C(R`maximum|fully|full|completely`, 70)}(?:conduct\w*|turn\w* on|switch\w* on|begin\w*|start\w*|open\w*|form\w*|channel|current)`] },
            ],
            sample: "The threshold voltage is the minimum gate-source voltage at which the MOSFET starts to conduct.",
            model: R`<ul><li>The minimum / lowest gate-source voltage ($V_{GS}$) at which the MOSFET just begins to conduct (the channel forms and a drain current starts to flow) (1)</li></ul><p>Do not accept "the voltage at which it is fully on": at the threshold the MOSFET is only starting to conduct.</p>`,
          },
        ],
      },

      /* ================= 08 BJT v MOSFET (extended, 4 marks) ================= */
      {
        id: "analogue-08",
        style: "Section 2 · extended response · compare and justify",
        stem: R`<p>A garden-lighting controller uses an LDR and a $330\ \text{k}\Omega$ fixed resistor as a voltage divider. The divider output must switch on a solenoid valve that takes 1.2 A. The resistors are high in value so that the controller wastes almost no power while waiting. The designer can use either an npn bipolar junction transistor (BJT) or an n-channel enhancement MOSFET to switch the solenoid.</p>`,
        parts: [
          {
            label: "(a)", type: "text", marks: 4, rows: 8, minWords: 20,
            q: R`Justify the choice of the MOSFET rather than the BJT for this circuit, by comparing how each device is controlled.`,
            points: [
              { desc: "The MOSFET is voltage-operated: its gate takes (almost) no current / it has a very high input resistance", negOK: true,
                any: [
                  R`(?:mosfets?|fets?|gate)${C(R`bjt|bipolar|base|` + VS + R`|\bnot\b|n't|never`, 70)}(?:very |extremely |much |really )?(?:high|large|huge|infinite)\W+(?:input\W+)?(?:resistance|impedance)`,
                  R`(?:very |extremely |really )?(?:high|large|huge|infinite)\W+input\W+(?:resistance|impedance)${C(R`bjt|bipolar|base|` + VS, 50)}(?:mosfet|gate|fet)`,
                  R`(?:mosfets?|fets?|gate)${C(R`bjt|bipolar|base|` + VS + R`|\bnot\b|n't|never|\bno\b`, 60)}(?:draw\w*|take\w*|need\w*|require\w*|use\w*|has|have|carr\w*|pass\w*|pull\w*)${C(R`bjt|bipolar|` + VS, 12)}(?:negligible|hardly any|almost no|virtually no|practically no|very little|tiny|barely any|zero|next to no|\bno\b)${C(R`bjt|bipolar|` + VS, 12)}current`,
                  R`(?:negligible|hardly any|almost no|virtually no|practically no|very little|tiny|barely any|\bno\b)\W+(?:\w+\W+){0,2}current\W+(?:\w+\W+){0,5}(?:flow\w*|needed|required|drawn|taken)\W+(?:\w+\W+){0,4}(?:gate|mosfet)`,
                  R`(?:mosfets?|fets?|gate)${C(R`bjt|bipolar|base|` + VS + R`|\bnot\b|n't`, 60)}voltage.?(?:operated|controlled|driven)`,
                  R`voltage.?(?:operated|controlled|driven)${C(R`bjt|bipolar|base|` + VS, 40)}(?:mosfet|gate|fet)`,
                ] },
              { desc: "So it does not load the divider: the sensor voltage is not pulled down / is unaffected", negOK: true,
                not: [R`(?:bjt|bipolar|base)${C(R`mosfet|` + VS, 60)}(?:\bnot\b|n't|never|\bno\b)\W+(?:\w+\W+){0,3}(?:load\w*|draw\w*|tak\w*|affect\w*|alter\w*)`],
                any: [
                  R`(?:not|n't|never|no|without|avoid\w*|prevent\w*|stop\w*)\W+(?:\w+\W+){0,3}(?:load\w*|draw\w*|tak\w*|pull\w*|drain\w*|affect\w*|alter\w*|chang\w*|reduc\w*|lower\w*|upset\w*|disturb\w*|interfer\w*|drag\w*)\W+(?:\w+\W+){0,6}(?:divider|sensor|ldr|input|voltage|signal|circuit|resistor|source)`,
                  R`(?:divider|sensor|ldr|input voltage|sensor voltage|voltage)${C(R`bjt|bipolar|base`, 50)}(?:unaffected|unchanged|undisturbed|(?:stay|stays|remain|remains|remained|kept|keeps|keep|stayed)\W+(?:\w+\W+){0,3}(?:same|constant|steady|correct|accurate|unchanged|designed|intended|stable))`,
                  R`(?:divider|sensor|voltage|signal|input)${C(R`bjt|bipolar|base`, 40)}(?:is|are|will be|would be|gets?|being|was)\W+(?:not|never)\W+(?:\w+\W+){0,1}(?:reduc\w*|lower\w*|affect\w*|chang\w*|alter\w*|load\w*|pull\w*|drop\w*|disturb\w*)`,
                ] },
              { desc: "The BJT is current-operated: it needs a (continuous) base current / a base resistor",
                any: [
                  R`current.?(?:operated|controlled|driven)`,
                  R`(?:bjt|bipolar)${C(R`mosfet|` + VS, 60)}(?:needs?|requires?|draws?|takes?|uses?|requiring|has)\W+(?:\w+\W+){0,3}(?:base )?(?:current)`,
                  R`\bbase current\b`,
                  R`(?:bjt|bipolar)${C(R`mosfet|` + VS, 60)}base resistor`,
                  R`(?:bjt|bipolar|base)${C(R`mosfet|` + VS, 50)}(?:low|small)\W+(?:input\W+)?(?:resistance|impedance)`,
                ] },
              { desc: "The base current drawn from the high-value divider would pull its voltage down (or be too small to switch 1.2 A); or the MOSFET wastes less power when on", group: "d", negOK: true,
                any: [
                  R`(?:base current|bjt|bipolar)${C(NEG + R`|mosfet|` + VS, 70)}(?:load\w*|pull\w*|draw\w*|tak\w*|drain\w*|reduc\w*|lower\w*|affect\w*|alter\w*|chang\w*|drop\w*|sag\w*|steal\w*|wast\w*)${C(NEG + R`|mosfet`, 50)}(?:divider|sensor|ldr|voltage|signal|input|resistor)`,
                  R`(?:drawn|taken|pulled|drained|stolen|sucked)${C(NEG + R`|mosfet`, 30)}(?:from|out of|off|through)${C(NEG + R`|mosfet`, 30)}(?:divider|sensor|ldr)`,
                  R`(?:not enough|insufficient|too (?:little|small|low|weak)|only (?:a )?(?:tiny|small|few|very small))${C(NEG + R`|mosfet`, 30)}current${C(NEG + R`|mosfet`, 70)}(?:switch|drive|operate|turn|solenoid|base|transistor|bjt)`,
                  R`(?:mosfets?|fets?)${C(R`bjt|bipolar|` + VS, 60)}(?:less|lower|little|low|small|smaller|reduced|minimal)\W+(?:\w+\W+){0,2}(?:power|heat|energy|resistance|loss|losses)`,
                  R`(?:mosfets?|fets?)${C(R`bjt|bipolar|` + VS, 60)}(?:wastes?|loses?|dissipates?|generates?|produces?)\W+(?:\w+\W+){0,2}less`,
                  R`(?:mosfets?|fets?)${C(R`bjt|bipolar|` + VS, 60)}(?:runs?|stays?|remains?)\W+(?:\w+\W+){0,1}cooler`,
                ] },
            ],
            sample: "The MOSFET is voltage-operated, so its gate draws almost no current and it has a very high input resistance. This means it does not load the LDR divider, which keeps the voltage the designer intended. A BJT is current-operated and needs a base current, which would be drawn from the high-value divider and pull its output voltage down, so the MOSFET is the better choice.",
            model: R`<p>Four marks, each a separate link in the argument:</p><ul><li>The MOSFET is voltage-operated: its gate takes practically no current (very high input resistance) (1)</li><li>so it does not load the sensor divider; the divider's output voltage is unaffected (1)</li><li>The BJT is current-operated: it needs a base current (and a base resistor) (1)</li><li>which would be drawn from the high-value divider, reducing the voltage there (or too small a current is available to switch 1.2 A) (1)</li></ul><p>Also acceptable for the last mark: a MOSFET wastes less power / makes less heat when fully on. Do not accept "it is better", "it is newer" or "it is cheaper" without a property tied to this circuit. Static damage to a MOSFET gate is not an advantage.</p>`,
          },
        ],
      },

      /* ================= 09 inverting amplifier ================= */
      {
        id: "analogue-09",
        style: "Section 2 · context question · inverting amplifier and saturation",
        stem: R`<p>An op-amp circuit amplifies the signal from a pressure sensor. The circuit is supplied with $+12$ V and $-12$ V. The resistors are $R_i = 4.7\ \text{k}\Omega$ and $R_f = 33\ \text{k}\Omega$. Take the op-amp as ideal.</p>`,
        figure: FIG.inverting,
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 3,
            q: R`Name the op-amp circuit configuration shown.`,
            opts: ["Non-inverting amplifier", "Voltage follower", "Comparator", "Inverting amplifier"],
            why: R`<p>The input goes through $R_i$ to the <em>inverting</em> (&minus;) input, the + input is at 0 V and a feedback resistor $R_f$ joins the output to the inverting input: an inverting amplifier. A non-inverting amplifier has the signal on the + input; a follower has the output wired straight to the &minus; input; a comparator has no feedback resistor.</p>`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: -7.02, tol: 0.01, unit: "",
            q: R`Calculate the voltage gain $A_v$ of the amplifier. Include the sign.`,
            why: R`<p>$A_v = -\dfrac{R_f}{R_i} = -\dfrac{33}{4.7} = -7.02$ (1).</p><p>The minus sign matters: the output is upside down. The kΩ units cancel in a ratio.</p>`,
          },
          {
            label: "(c)", type: "num", marks: 1, a: -8.43, tol: 0.01, unit: "V",
            q: R`The input voltage is $+1.2$ V. Calculate the output voltage $V_o$.`,
            why: R`<p>$V_o = A_vV_i = -7.02 \times 1.2 = -8.43$ V (1). This lies between the supply rails, so it is the real output.</p><p>Slip: using $1 + R_f/R_i = 8.02$ (the non-inverting formula) gives $+9.6$ V.</p>`,
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: R`When the input is $+2.0$ V the formula predicts $V_o = -14.0$ V. Explain why this is not the actual output, and state the actual output voltage.`,
            points: [
              { desc: "The output cannot go beyond the supply rails; it is limited by the supply voltage", negOK: true,
                any: [
                  R`(?:cannot|can't|can not|unable to|won't|will not|never|not able to|doesn't|does not)\W+(?:\w+\W+){0,5}(?:beyond|past|above|below|exceed\w*|outside|more negative than|lower than|greater than|larger than|bigger than|further than|go (?:beyond|past)|swing)\W+(?:\w+\W+){0,4}(?:supply|rails?|vcc|12)`,
                  R`(?:limit\w*|restrict\w*|clip\w*|capped|held|set|constrain\w*|determin\w*)${C(NEG, 40)}(?:by|to|at)${C(NEG, 30)}(?:supply|rails?|vcc|12|power)`,
                  R`(?:supply|rails?|vcc|12 ?v|power supply)${C(NEG, 40)}(?:limit\w*|restrict\w*|set\w*|determin\w*|maximum|\bmax\b|cap\w*)`,
                  R`(?:output|it)${C(R`\bnot\b`, 40)}(?:cannot|can't|can not|unable|won't|never)\W+(?:\w+\W+){0,5}(?:more|further|greater|larger|bigger|higher|lower|exceed|negative)\W+(?:\w+\W+){0,6}(?:supply|rails?|vcc|12)`,
                  R`(?:more negative|lower|below|beyond|past|outside)\W+(?:\w+\W+){0,3}(?:the )?(?:supply|rails?|vcc|-12|−12)`,
                ] },
              { desc: "The output saturates (clips) at -12 V",
                all: [R`(?:[-−]\s?12(?:\.0)?\b|minus 12|negative 12|12(?:\.0)? ?(?:v|volts?) negative|12(?:\.0)? ?(?:v|volts?) below)`, R`(?:saturat\w*|clip\w*|stuck|stops?|reach\w*|lowest|most negative|as far as|flat\w*)`] },
            ],
            sample: "The output voltage is limited by the supply, so it cannot go beyond the rails. The amplifier saturates and the output clips at -12 V.",
            model: R`<ul><li>The output of an op-amp cannot go beyond the supply rails ($\pm 12$ V); the formula only says what it <em>would</em> be with an unlimited supply (1)</li><li>the output saturates (clips) at $-12$ V (1)</li></ul><p>The sign is required for the second mark: $12$ V alone, or $+12$ V, is not accepted.</p>`,
          },
          {
            label: "(e)", type: "num", marks: 1, a: 1.71, tol: 0.01, unit: "V",
            q: R`Calculate the largest positive input voltage that this amplifier can handle before its output saturates.`,
            why: R`<p>The output saturates when $|V_o| = 12$ V, so $V_i = \dfrac{12}{|A_v|} = \dfrac{12}{7.02} = 1.71$ V (1).</p>`,
          },
        ],
      },

      /* ================= 10 op-amp design ================= */
      {
        id: "analogue-10",
        style: "Section 2 · calculation · three op-amp circuits",
        stem: R`<p>The following op-amp circuits are all supplied with $\pm 9$ V. Take each op-amp as ideal, and use the formulae in the Data Booklet.</p>`,
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 16.5, tol: 0.05, unit: "kΩ",
            q: R`A non-inverting amplifier has $R_i = 1.5\ \text{k}\Omega$. It must change a sensor voltage of 0.35 V into 4.2 V. Calculate $R_f$, in $\text{k}\Omega$.`,
            why: R`<p>Gain needed: $A_v = \dfrac{4.2}{0.35} = 12$ (1).</p><p>$A_v = 1 + \dfrac{R_f}{R_i}$, so $\dfrac{R_f}{R_i} = 11$ and $R_f = 11 \times 1.5 = 16.5\ \text{k}\Omega$ (1).</p><p>Slip: forgetting the "1 +" gives $12 \times 1.5 = 18\ \text{k}\Omega$, which would make the gain 13.</p>`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: -3.30, tol: 0.01, unit: "V",
            q: R`A summing amplifier has $R_1 = 10\ \text{k}\Omega$, $R_2 = 15\ \text{k}\Omega$ and $R_f = 33\ \text{k}\Omega$. The inputs are $V_1 = 0.50$ V and $V_2 = 0.75$ V. Calculate $V_o$.`,
            why: R`<p>$V_o = -R_f\left(\dfrac{V_1}{R_1} + \dfrac{V_2}{R_2}\right) = -33\left(\dfrac{0.50}{10} + \dfrac{0.75}{15}\right)$ (1)</p><p>$V_o = -33 \times (0.050 + 0.050) = -3.30$ V (1). Within the $\pm 9$ V rails.</p>`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 1.70, tol: 0.01, unit: "V",
            q: R`A difference amplifier has $R_i = 10\ \text{k}\Omega$ and $R_f = 68\ \text{k}\Omega$. $V_1 = 1.85$ V is applied to the inverting side and $V_2 = 2.10$ V to the non-inverting side. Calculate $V_o$.`,
            why: R`<p>$V_o = \dfrac{R_f}{R_i}(V_2 - V_1) = 6.8 \times (2.10 - 1.85)$ (1)</p><p>$V_o = 6.8 \times 0.25 = +1.70$ V (1).</p><p>Slip: $V_1 - V_2$ gives $-1.70$ V. In the Data Booklet $V_2$ is the input on the + side.</p>`,
          },
        ],
      },

      /* ================= 11 whole-system controller ================= */
      {
        id: "analogue-11",
        style: "Section 2 · whole-system question · calculate, state and describe",
        stem: R`<p>A frost-protection controller switches a greenhouse heater on when the temperature falls to 10 °C. It is powered from 9.0 V. An NTC thermistor and a fixed resistor $R$ form the sensor divider, with the voltage $V_i$ across $R$. A second divider ($R_3$ and $R_4$) sets the reference voltage $V_{ref}$. The op-amp comparator is supplied from 9.0 V and 0 V, so its output is 9.0 V or 0 V.</p><p>Thermistor resistance: 0 °C 33 kΩ; 10 °C 20 kΩ. The output stage drives a relay coil of resistance $90\ \Omega$ from 9.0 V through an npn transistor with $h_{FE} = 80$ and $V_{BE} = 0.7$ V. Diode D protects the output stage. The relay contacts (not drawn) control the heater.</p>`,
        figure: FIG.controller,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 3.0, tol: 0.02, unit: "V",
            q: R`Calculate $V_{ref}$.`,
            why: R`<p>$V_{ref} = V_s \times \dfrac{R_4}{R_3 + R_4} = 9.0 \times \dfrac{10}{20 + 10} = 3.0$ V (1).</p>`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 10, tol: 0.05, unit: "kΩ",
            q: R`The comparator must switch when the temperature is 10 °C. Calculate the value of $R$, in $\text{k}\Omega$.`,
            why: R`<p>At 10 °C, $V_i = V_{ref} = 3.0$ V across $R$, so the thermistor has $9.0 - 3.0 = 6.0$ V and is $20\ \text{k}\Omega$ (1).</p><p>$R = R_{th} \times \dfrac{V_R}{V_{th}} = 20 \times \dfrac{3.0}{6.0} = 10\ \text{k}\Omega$ (1).</p>`,
          },
          {
            label: "(c)", type: "num", marks: 1, a: 2.09, tol: 0.01, unit: "V",
            q: R`Calculate $V_i$ when the temperature is 0 °C. Use $R = 10\ \text{k}\Omega$.`,
            why: R`<p>At 0 °C the thermistor is $33\ \text{k}\Omega$: $V_i = 9.0 \times \dfrac{10}{33 + 10} = 2.09$ V (1).</p>`,
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 1,
            q: R`At 0 °C, $V_i = 2.09$ V. What is the comparator output? ($V_i$ is on the inverting input and $V_{ref}$ on the non-inverting input.)`,
            opts: [
              R`$0\ \text{V}$, because $V_i$ is below $V_{ref}$`,
              R`$+9.0\ \text{V}$, because $V_i$ is below $V_{ref}$`,
              R`$+9.0\ \text{V}$, because $V_i$ is above $V_{ref}$`,
              R`$0\ \text{V}$, because $V_i$ is above $V_{ref}$`,
            ],
            why: R`<p>The Data Booklet rule: if $V_i \lt V_{ref}$ the output saturates <em>positively</em> (here +9.0 V). Here $2.09 \lt 3.0$, so the output is +9.0 V and the heater is switched on. The two options with "above" have the comparison the wrong way round, and 0 V would be the output only when $V_i \gt V_{ref}$.</p>`,
          },
          {
            label: "(e)", type: "num", marks: 2, a: 6.64, tol: 0.02, unit: "kΩ",
            q: R`Calculate the largest base resistor $R_B$ that will operate the relay. The comparator output is 9.0 V. Give your answer in $\text{k}\Omega$.`,
            why: R`<p>Coil current $I_C = \dfrac{9.0}{90} = 0.100\ \text{A}$, so $I_B = \dfrac{0.100}{80} = 1.25\ \text{mA}$ (1).</p><p>$R_B = \dfrac{V_{out} - V_{BE}}{I_B} = \dfrac{9.0 - 0.7}{1.25 \times 10^{-3}} = 6640\ \Omega = 6.64\ \text{k}\Omega$ (1).</p><p>Slip: $\dfrac{9.0}{1.25\ \text{mA}} = 7.2\ \text{k}\Omega$ forgets the 0.7 V.</p>`,
          },
          {
            label: "(f)", type: "text", marks: 4, rows: 8, minWords: 20,
            q: R`Describe how the system operates as the temperature falls below 10 °C.`,
            points: [
              { desc: "The thermistor's resistance increases as the temperature falls",
                not: [R`resistance${C(UPSTOP + R`|\bas\b|when|if`, 25)}${DOWN}`],
                any: [R`resistance${C(DOWNSTOP + R`|\bas\b|when|if|` + NEG, 60)}(?:ris(?:es|e|ing)|increas\w*|higher|bigger|larger|greater|goes up|climb\w*|grow\w*)`, R`(?:increase|rise|growth)\W+(?:in|of)\W+(?:the\W+)?(?:thermistor\W+)?resistance`, R`(?:higher|bigger|larger|greater)\W+resistance`] },
              { desc: "So V_i (the voltage across R / at the inverting input) falls",
                any: [
                  R`(?:\bv_?i\b)${C(UPSTOP + R`|` + NEG, 40)}${DOWN}`,
                  R`inverting${C(UPSTOP + R`|` + NEG, 50)}${DOWN}`,
                  R`(?:input|divider|sensor)\W+(?:\w+\W+){0,2}voltage${C(UPSTOP + R`|` + NEG, 40)}${DOWN}`,
                  R`voltage${C(R`thermistor|` + UPSTOP + R`|` + NEG + R`|\bbut\b`, 40)}(?:across|over)${C(R`thermistor|` + UPSTOP, 25)}(?:\br\b|(?:the )?(?:fixed )?resistor)${C(UPSTOP + R`|` + NEG, 40)}${DOWN}`,
                  R`thermistor${C(NEG, 40)}(?:bigger|larger|greater|more)\W+(?:\w+\W+){0,2}(?:share|proportion|voltage|part|fraction)`,
                ] },
              { desc: "When V_i falls below V_ref the comparator output goes positive (high, +9 V)",
                not: [R`(?:above|greater than|higher than|more than|exceeds?)\W+(?:\w+\W+){0,3}(?:\bv_?ref\b|reference)${C(R`\.`, 50)}(?:positive|high\b|switch\w* on|9 ?v)`],
                all: [R`(?:comparator|op.?amp|output)`, R`(?:(?:below|less than|lower than|under|smaller than)\W+(?:\w+\W+){0,4}(?:\bv_?ref\b|reference|3(?:\.0)? ?v)|(?:\bv_?i\b|input)\W+(?:\w+\W+){0,6}(?:less|lower|smaller|below|under))`, R`(?:positive|high\b|9(?:\.0)? ?v|\+ ?9|saturat\w*)`] },
              { desc: "The transistor switches on (base current), the relay operates and the heater is switched on",
                all: [R`(?:transistor|base current)${C(R`\bnot\b|n't|never`, 70)}(?:switch\w*|turn\w*|\bon\b|conduct\w*|saturat\w*|start\w*|current)`, R`(?:relay|coil|contacts?|heater)${C(R`\bnot\b|n't|never`, 70)}(?:\bon\b|operat\w*|clos\w*|energi[sz]\w*|switch\w*|turn\w*|work\w*|run\w*|start\w*|activat\w*|heat\w*|warm\w*|pull\w*)`] },
            ],
            sample: "As the temperature falls the resistance of the thermistor increases, so it takes a bigger share of the supply and the voltage Vi across R falls. When Vi drops below Vref the comparator output goes positive, to 9 V. A base current then flows, the transistor switches on, the relay operates and the heater is switched on.",
            model: R`<p>A cause-and-effect chain, one device at a time, with directions:</p><ul><li>The (NTC) thermistor's resistance increases as the temperature falls (1)</li><li>so $V_i$, the voltage across $R$ at the inverting input, falls (1)</li><li>when $V_i$ falls below $V_{ref}$ (3.0 V, at 10 °C) the comparator output goes positive / saturates at +9.0 V (1)</li><li>a base current flows, the transistor switches on, the relay coil is energised and the contacts close, so the heater comes on (1)</li></ul><p>Do not accept "the voltage changes" or "it compares the voltages" with no direction. The comparator rule is the Data Booklet's: $V_i \lt V_{ref}$ gives a positive output.</p>`,
          },
        ],
      },

      /* ================= 12 match ================= */
      {
        id: "analogue-12",
        style: "Section 1 · match the component to its job",
        stem: R`<p>Analogue circuits are built from a small set of components, each with a clear job. Match each component or circuit to what it does.</p>`,
        parts: [
          {
            label: "(a)", type: "match", marks: 5,
            q: "Match each component to its job.",
            pairs: [
              ["Thermistor", "A sensor whose resistance changes with temperature"],
              ["Flyback diode", "Protects a transistor from the voltage spike when a coil is switched off"],
              ["Voltage follower", "An op-amp circuit with a gain of exactly one that draws almost no current from its source"],
              ["Relay", "A coil-operated switch that lets a small current control a separate, larger load"],
              ["Comparator", "An op-amp with no feedback whose output saturates positive or negative depending on which input is larger"],
            ],
          },
        ],
      },

      /* ================= 13 MOSFET statements (multi) ================= */
      {
        id: "analogue-13",
        style: "Section 1 · multiple choice · MOSFET",
        stem: R`<p>An n-channel enhancement-mode MOSFET is used as a voltage-operated switch.</p>`,
        parts: [
          {
            label: "(a)", type: "multi", marks: 3,
            q: R`Choose the <strong>three</strong> correct statements.`,
            opts: [
              R`The gate needs a voltage, but takes almost no current`,
              R`It conducts when $V_{GS}$ is below the threshold voltage`,
              R`With $V_{GS} = 0\ \text{V}$ there is no channel, so it is off`,
              R`The load is normally connected between the gate and the source`,
              R`The drain current increases as $V_{GS}$ rises above the threshold voltage`,
              R`Its gate has a low input resistance, so a series resistor is needed to limit the gate current`,
            ],
            a: [0, 2, 4],
            why: R`<p>Right: the insulated gate takes practically no current (it is voltage-operated); "enhancement mode" means no channel until a positive $V_{GS}$ forms one; above the threshold the channel grows and $I_D$ rises along the transfer characteristic.</p><p>Wrong: below the threshold there is no conduction; the load goes in the <em>drain</em> circuit (between the supply and the drain); the gate has a very <em>high</em> input resistance.</p>`,
          },
        ],
      },

      /* ================= 14 BJT short ================= */
      {
        id: "analogue-14",
        style: "Section 1 · short answer · the bipolar transistor",
        stem: R`<p>An npn silicon transistor passes a collector current $I_C = 45\ \text{mA}$ when the base current is $I_B = 0.30\ \text{mA}$.</p>`,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 150, tol: 0.5, unit: "",
            q: R`Calculate the current gain $h_{FE}$ of the transistor.`,
            why: R`<p>$h_{FE} = \dfrac{I_C}{I_B} = \dfrac{45}{0.30} = 150$ (1). It is a ratio of two currents, so it has no unit.</p>`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 45.3, tol: 0.02, unit: "mA",
            q: R`Calculate the emitter current $I_E$, in mA.`,
            why: R`<p>The base and collector currents both leave through the emitter: $I_E = I_C + I_B = 45 + 0.30 = 45.3\ \text{mA}$ (1).</p>`,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 0,
            q: R`In another circuit the base-emitter voltage of the transistor is only $0.4\ \text{V}$. In which region is the transistor operating?`,
            opts: ["Cut-off (off)", "Active (amplifying)", "Saturation (fully on)", "Reverse breakdown"],
            why: R`<p>Below about 0.7 V no base current flows, so no collector current flows: the transistor is in cut-off and acts as an open switch. In the active region $V_{BE} \approx 0.7$ V and $I_C = h_{FE}I_B$; in saturation the load limits $I_C$.</p>`,
          },
        ],
      },

      /* ================= 15 voltage follower ================= */
      {
        id: "analogue-15",
        style: "Section 1 · short answer · voltage follower",
        stem: R`<p>A sensor divider made from two $100\ \text{k}\Omega$ resistors gives an output of 2.7 V. This is connected to the input of a voltage follower. The output of the follower feeds a motor-driver stage that draws a much larger current than the divider could supply.</p>`,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 2.7, tol: 0.01, unit: "V",
            q: R`State the output voltage of the voltage follower.`,
            why: R`<p>A voltage follower has a gain of exactly 1: $V_o = V_i = 2.7$ V (1).</p>`,
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: R`Explain why a voltage follower is placed between the divider and the motor-driver stage.`,
            points: [
              { desc: "The follower has a very high input resistance / draws almost no current from the divider", negOK: true,
                any: [
                  R`(?:very |extremely |really )?(?:high|large|infinite|huge)\W+input\W+(?:resistance|impedance)`,
                  R`(?:draw\w*|tak\w*|need\w*|requir\w*|us\w*|pull\w*)\W+(?:\w+\W+){0,2}(?:(?:almost|virtually|practically|hardly|next to) (?:no|any)|negligible|very little|tiny|no)\W+(?:\w+\W+){0,1}current`,
                  R`(?:no|negligible|almost no|hardly any|very little|tiny|virtually no|practically no)\W+current\W+(?:\w+\W+){0,3}(?:is |being |gets )?(?:drawn|taken|pulled|flows?|needed)`,
                ] },
              { desc: "So the divider is not loaded: its output voltage is unaffected",
                negOK: true,
                any: [
                  R`(?:not|n't|never|no|without|avoid\w*|prevent\w*|stop\w*)\W+(?:\w+\W+){0,3}(?:load\w*|affect\w*|alter\w*|chang\w*|reduc\w*|lower\w*|pull\w*|disturb\w*|drag\w*|sag\w*|upset\w*)\W+(?:\w+\W+){0,6}(?:divider|sensor|ldr|voltage|signal|input|source)`,
                  R`(?:divider|sensor|voltage|signal|input)${C(NEG, 50)}(?:unaffected|unchanged|undisturbed|stays?\W+(?:\w+\W+){0,2}(?:same|constant|steady|correct|accurate)|remains?\W+(?:\w+\W+){0,2}(?:same|constant|steady|correct|accurate))`,
                  R`(?:divider|sensor)\W+(?:\w+\W+){0,2}(?:is|are)\W+not\W+(?:\w+\W+){0,1}(?:loaded|affected|pulled|overloaded|disturbed)`,
                  R`(?:buffer\w*|isolat\w*)${C(NEG, 50)}(?:divider|sensor|load|circuit|source)`,
                ] },
              { desc: "The follower's output can supply the larger current needed by the motor-driver stage",
                any: [
                  R`(?:output|follower|op.?amp|buffer)${C(NEG, 60)}(?:supplies|supply|provides?|provide|deliver\w*|drive\w*|give\w*|sourc\w*)\W+(?:\w+\W+){0,4}(?:current|load|motor|driver|power)`,
                  R`(?:low|small)\W+output\W+(?:resistance|impedance)`,
                ] },
            ],
            sample: "The follower has a very high input resistance, so it draws almost no current from the divider and the divider's output voltage is unaffected. Its output can then supply the larger current needed by the motor-driver stage.",
            model: R`<ul><li>The follower has a very high input resistance, so it draws (almost) no current from the divider (1)</li><li>so the divider is not loaded and its output voltage stays as designed (1)</li><li>the follower's output can supply the larger current the motor-driver stage needs (1)</li></ul><p>Any two of these three ideas earn the two marks. Do not accept "it amplifies the voltage": the gain is exactly 1.</p>`,
          },
        ],
      },
    ],
  };
})();
