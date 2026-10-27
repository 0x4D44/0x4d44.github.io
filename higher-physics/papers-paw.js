/* Past-paper practice: Particles and Waves. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HPP_BANK = window.HPP_BANK || {});
  /* near(a, b, n): regex source matching a and b in either order with at most n words between them,
     so a shuffled pile of the right words does not satisfy it. */
  const near = (a, b, n) => { const g = "\\W+(?:\\w+\\W+){0," + (n == null ? 3 : n) + "}"; return "\\b(?:" + a + ")\\b" + g + "\\b(?:" + b + ")\\b|\\b(?:" + b + ")\\b" + g + "\\b(?:" + a + ")\\b"; };
  /* NOT(x): a negator shortly before x ("not enough", "no longer increases"), for `not` vetoes. */
  const NOT = (x) => "\\b(?:not|never|no|n't|cannot|without)\\W+(?:\\w+\\W+){0,3}(?:" + x + ")";
  const LAM = "(?:λ|lambda)";
  const X = "[x*]?";
  /* ---- regex families for calc relationships (matched against the compacted, lower-case working) ---- */
  const HALF = "\\(?(?:½|1/2|0\\.5)\\)?";
  const REL_EK = ["ek=" + HALF + X + "\\(?m\\)?" + X + "\\(?v\\)?\\^?2", HALF + X + "\\(?m\\)?" + X + "\\(?v\\)?\\^?2", HALF + X + "\\(?1\\.67\\d*(?:e-27|x10\\^?-27)\\)?" + X + "\\(?v\\)?\\^?2", "mv\\^?2/2", "2ek/m", "v=sqrt", "v\\^?2=2"];
  const REL_VFL = ["[vc]=f" + LAM, "f=[vc]/" + LAM, LAM + "=[vc]/f", "f=3(?:\\.0+)?x10\\^?8/", "f=\\(?3"];
  const REL_EHF = ["e=hf", "=hf\\b", "f=e/h", "hf=e"];
  /* paw-08(a): the middle mark for either route, f = E/h or the values put into hc/E */
  const E14 = "4\\.6\\d{0,2}(?:x10\\^?14|e14)", EH = "\\(?3\\.09" + "(?:x10\\^?-19|e-19)\\)?/\\(?6\\.63(?:x10\\^?-34|e-34)";
  const HCE = "\\(?6\\.63(?:x10\\^?-34|e-34)x3(?:\\.0+)?(?:x10\\^?8|e8)\\)?/\\(?3\\.09(?:x10\\^?-19|e-19)", HC = "1\\.9\\d*(?:x10\\^?-25|e-25)";
  const SUBHC = "3\\.09(?:x10\\^?-19|e-19)=\\(?6\\.63(?:x10\\^?-34|e-34)x3(?:\\.0+)?(?:x10\\^?8|e8)\\)?/" + LAM;
  const REL_DSIN = ["dsin\\(?(?:θ|theta)\\)?=m" + LAM, "dsin\\(?(?:θ|theta)\\)?=(?:\\d|\\()", "sin\\(?(?:θ|theta)\\)?=m" + LAM + "/d", "m" + LAM + "=dsin", "(?:θ|theta)=sin\\^?-1", "sin\\^?-1\\(?m"];

  /* ---------------------------------------------------------------- figures ---------------------------------------------------------------- */
  const INK = "#222", BLUE = "#1c3b66", RED = "#b3261e", FILL = "#e8eef7", PINK = "#f6d5d2";
  const ah = (x1, y1, x2, y2, col, s) => {
    s = s || 8; const a = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(a), sn = Math.sin(a);
    const p = (d, w) => (x2 - d * c - w * sn).toFixed(1) + "," + (y2 - d * sn + w * c).toFixed(1);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.8"/><polygon points="${x2},${y2} ${p(s, s / 2.4)} ${p(s, -s / 2.4)}" fill="${col}"/>`;
  };
  const tx = (x, y, s, o) => `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${(o && o.size) || 13}" fill="${(o && o.fill) || INK}" text-anchor="${(o && o.anchor) || "start"}"${o && o.bold ? ' font-weight="bold"' : ""}${o && o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : ""}>${s}</text>`;
  const ln = (x1, y1, x2, y2, col, w, dash) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col || INK}" stroke-width="${w || 1.5}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  const svg = (w, h, label, body) => `<svg role="img" aria-label="${label}" viewBox="0 0 ${w} ${h}" width="${w}" style="max-width:100%;height:auto">${body}</svg>`;

  /* q01: proton moving across a magnetic field directed into the page */
  const fig01 = (() => {
    let b = `<rect x="6" y="6" width="368" height="178" fill="#fff" stroke="${BLUE}" stroke-width="1.2"/>`;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) b += tx(34 + i * 60, 40 + j * 38, "×", { size: 20, fill: BLUE, anchor: "middle" });
    b += `<circle cx="60" cy="97" r="11" fill="${PINK}" stroke="${RED}" stroke-width="1.6"/>` + tx(60, 102, "+", { anchor: "middle", bold: true, fill: RED });
    b += ah(74, 97, 150, 97, INK) + tx(112, 90, "v", { anchor: "middle" }) + tx(36, 129, "proton", { size: 12 });
    b += tx(190, 174, "Magnetic field directed into the page (×)", { size: 12, fill: BLUE, anchor: "middle" });
    return svg(380, 190, "A proton, shown as a circle with a plus sign, moves to the right across the page at velocity v. The region is filled with crosses showing a uniform magnetic field directed into the page.", b);
  })();

  /* q03: a decay series with some mass and atomic numbers missing */
  const fig03 = (() => {
    const boxes = [["U", "A = 238", "Z = 92"], ["Th", "A = ?", "Z = 90"], ["Pa", "A = ?", "Z = ?"], ["U", "A = ?", "Z = 92"]];
    const arrows = ["alpha", "beta", "beta"];
    let b = "";
    boxes.forEach((bx, i) => {
      const x = 10 + i * 140;
      b += `<rect x="${x}" y="30" width="105" height="64" rx="5" fill="${FILL}" stroke="${BLUE}" stroke-width="1.4"/>`;
      b += tx(x + 52, 52, bx[0], { anchor: "middle", bold: true, size: 16 }) + tx(x + 52, 70, bx[1], { anchor: "middle", size: 12 }) + tx(x + 52, 86, bx[2], { anchor: "middle", size: 12 });
      if (i < 3) b += ah(x + 108, 62, x + 138, 62, INK) + tx(x + 123, 54, ["α", "β", "β"][i], { anchor: "middle", fill: RED, bold: true });
    });
    return svg(545, 120, "A decay series drawn as four boxes joined by arrows. Uranium with mass number 238 and atomic number 92 emits an alpha particle to become thorium with atomic number 90, which emits a beta particle to become protactinium, which emits a second beta particle to become uranium with atomic number 92. The other mass numbers and the atomic number of protactinium are shown as question marks.", b);
  })();

  /* q06: maximum kinetic energy against frequency for a metal; threshold 4.6e14 Hz, gradient h */
  const fig06 = (() => {
    const X0 = 70, XS = 34, Y0 = 270, YS = 48, gx = (f) => X0 + f * XS, gy = (e) => Y0 - e * YS; // f in 1e14 Hz, E in 1e-19 J
    let b = ln(X0, Y0, X0 + 12 * XS + 6, Y0) + ln(X0, Y0, X0, 22);
    for (let f = 0; f <= 12; f += 2) b += ln(gx(f), Y0, gx(f), Y0 + 5) + tx(gx(f), Y0 + 19, String(f), { anchor: "middle", size: 12 });
    for (let e = 0; e <= 5; e++) b += ln(X0 - 5, gy(e), X0, gy(e)) + tx(X0 - 9, gy(e) + 4, String(e), { anchor: "end", size: 12 });
    for (let f = 2; f <= 12; f += 2) b += ln(gx(f), Y0, gx(f), 22, "#ddd", 0.7);
    for (let e = 1; e <= 5; e++) b += ln(X0, gy(e), X0 + 12 * XS, gy(e), "#ddd", 0.7);
    const E = (f) => (f - 4.6) * 0.663;
    b += ln(gx(4.6), gy(0), gx(11.5), gy(E(11.5)), BLUE, 2.2);
    [5.5, 7, 8.5, 10].forEach((f) => { b += `<circle cx="${gx(f).toFixed(1)}" cy="${gy(E(f)).toFixed(1)}" r="3.6" fill="${RED}"/>`; });
    b += tx(X0 + 6 * XS, Y0 + 40, "frequency of the light / 10¹⁴ Hz", { anchor: "middle" });
    b += tx(16, 146, "maximum kinetic energy / 10⁻¹⁹ J", { anchor: "middle", rot: -90, size: 12 });
    return svg(520, 320, "A graph of the maximum kinetic energy of the photoelectrons, in units of 10 to the minus 19 joules from 0 to 5, against the frequency of the light, in units of 10 to the 14 hertz from 0 to 12. A straight line starts on the frequency axis at 4.6 and rises to about 4.6 at a frequency of 11.5. Four measured points lie on the line.", b);
  })();

  /* q08: energy levels of an atom; transitions P, Q, R, S, W */
  const fig08 = (() => {
    const levels = [[0, "0"], [-1.2, "−1.20"], [-3.06, "−3.06"], [-4.11, "−4.11"], [-7.2, "−7.20"]];
    const Y = (e) => 30 + (-e) * 33.3;
    let b = tx(20, 18, "Energy / 10⁻¹⁹ J", { size: 12 });
    levels.forEach(([e, l]) => { b += ln(80, Y(e), 440, Y(e), BLUE, 2.2) + tx(72, Y(e) + 4, l, { anchor: "end", size: 12 }); });
    b += tx(446, Y(0) + 4, "ionisation level", { size: 11 }) + tx(446, Y(-7.2) + 4, "ground state", { size: 11 });
    [["P", 120, -1.2, -4.11], ["Q", 200, -3.06, -7.2], ["R", 280, -3.06, -4.11], ["S", 340, -1.2, -3.06], ["W", 400, -4.11, -7.2]].forEach(([n, x, a, c]) => {
      b += ah(x, Y(a), x, Y(c), RED) + tx(x + 8, Y(a) + 14, n, { bold: true, fill: RED });
    });
    return svg(540, 295, "An energy level diagram for an atom with five levels at 0, minus 1.20, minus 3.06, minus 4.11 and minus 7.20 times 10 to the minus 19 joules; 0 is the ionisation level and minus 7.20 is the ground state. Five downward arrows show transitions: P from minus 1.20 to minus 4.11, Q from minus 3.06 to minus 7.20, R from minus 3.06 to minus 4.11, S from minus 1.20 to minus 3.06 and W from minus 4.11 to minus 7.20.", b);
  })();

  /* q10: two loudspeakers and a point P */
  const fig10 = (() => {
    let b = `<rect x="6" y="84" width="78" height="46" rx="4" fill="${FILL}" stroke="${BLUE}" stroke-width="1.4"/>` + tx(45, 104, "signal", { anchor: "middle", size: 12 }) + tx(45, 120, "generator", { anchor: "middle", size: 12 });
    b += ln(84, 100, 120, 70) + ln(84, 114, 120, 160);
    [[120, 70, "S₁"], [120, 160, "S₂"]].forEach(([x, y, n]) => { b += `<polygon points="${x},${y - 12} ${x + 18},${y - 22} ${x + 18},${y + 22} ${x},${y + 12}" fill="${FILL}" stroke="${BLUE}" stroke-width="1.4"/>` + tx(x + 4, y + 36, n, { bold: true }); });
    b += ln(138, 70, 450, 60, INK, 1.4) + ln(138, 160, 450, 60, INK, 1.4);
    b += `<circle cx="450" cy="60" r="5" fill="${RED}"/>` + tx(458, 64, "P", { bold: true, fill: RED });
    b += tx(290, 52, "5.40 m", { anchor: "middle" }) + tx(330, 120, "6.15 m", { anchor: "middle" });
    b += tx(300, 195, "not to scale", { anchor: "middle", size: 11, fill: "#555" });
    return svg(500, 205, "Two loudspeakers S1 and S2 are connected to one signal generator. A straight line runs from S1 to a point P and is labelled 5.40 metres. A second straight line from S2 to the same point P is labelled 6.15 metres. The diagram is not to scale.", b);
  })();

  /* q11: grating geometry */
  const fig11 = (() => {
    const th = (25 * Math.PI) / 180, u = [Math.cos(th), -Math.sin(th)];
    const U = [150, 200], L = [150, 240], len = 230;
    const foot = [L[0] + 40 * Math.sin(th) * u[0], L[1] + 40 * Math.sin(th) * u[1]];
    let b = ln(150, 20, 150, 190, INK, 4) + ln(150, 210, 150, 230, INK, 4) + ln(150, 250, 150, 290, INK, 4);
    b += ah(30, 200, 140, 200, "#555") + ah(30, 240, 140, 240, "#555") + tx(30, 190, "incident light", { size: 12 });
    b += ln(L[0], L[1], 460, L[1], "#888", 1, "5 4");
    b += ah(U[0] + 5, U[1], U[0] + u[0] * len, U[1] + u[1] * len, BLUE) + ah(L[0] + 5, L[1], L[0] + u[0] * len, L[1] + u[1] * len, BLUE);
    b += ln(U[0], U[1], foot[0], foot[1], RED, 1.3, "3 3");
    b += ln(L[0], L[1], foot[0], foot[1], RED, 3);
    b += ln(128, 200, 128, 240, INK, 1.2) + tx(120, 224, "d", { anchor: "end", bold: true });
    b += tx(190, 266, "d sin θ", { fill: RED, bold: true });
    b += `<path d="M ${L[0] + 70} ${L[1]} A 70 70 0 0 0 ${(L[0] + 70 * Math.cos(th)).toFixed(1)} ${(L[1] - 70 * Math.sin(th)).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1.2"/>` + tx(L[0] + 78, L[1] - 14, "θ", { bold: true });
    b += tx(400, 230, "first-order maximum", { size: 11, anchor: "end" }) + tx(458, 232, "", {});
    return svg(480, 305, "Light from the left falls on a grating drawn as a vertical barrier with two neighbouring slits a distance d apart. Two parallel rays leave the slits at an angle theta above the straight-through direction, which is a dashed horizontal line. A short right-angled construction shows that the extra distance travelled by the ray from the lower slit is d sin theta.", b);
  })();

  /* q12: I against 1/d^2, k = 0.52 W */
  const fig12 = (() => {
    const X0 = 70, XS = 14.5, Y0 = 250, YS = 14, gx = (v) => X0 + v * XS, gy = (v) => Y0 - v * YS;
    let b = ln(X0, Y0, X0 + 30 * XS + 6, Y0) + ln(X0, Y0, X0, 20);
    for (let v = 0; v <= 30; v += 5) b += ln(gx(v), Y0, gx(v), Y0 + 5) + tx(gx(v), Y0 + 19, String(v), { anchor: "middle", size: 12 });
    for (let v = 0; v <= 16; v += 2) b += ln(X0 - 5, gy(v), X0, gy(v)) + tx(X0 - 9, gy(v) + 4, String(v), { anchor: "end", size: 12 });
    for (let v = 5; v <= 30; v += 5) b += ln(gx(v), Y0, gx(v), 20, "#ddd", 0.7);
    for (let v = 2; v <= 16; v += 2) b += ln(X0, gy(v), X0 + 30 * XS, gy(v), "#ddd", 0.7);
    b += ln(gx(0), gy(0), gx(30), gy(15.6), BLUE, 2.2);
    [0.6, 0.5, 0.4, 0.3, 0.2].forEach((d) => { b += `<circle cx="${gx(1 / (d * d)).toFixed(1)}" cy="${gy(0.52 / (d * d)).toFixed(1)}" r="3.8" fill="${RED}"/>`; });
    b += tx(X0 + 15 * XS, Y0 + 38, "1/d² / m⁻²", { anchor: "middle" });
    b += tx(16, 135, "irradiance I / W m⁻²", { anchor: "middle", rot: -90, size: 12 });
    return svg(520, 300, "A graph of irradiance in watts per square metre, from 0 to 16, against one over distance squared in reciprocal square metres, from 0 to 30. Five plotted points, at about 2.8, 4.0, 6.3, 11.1 and 25.0 on the horizontal axis, lie on a straight line that passes through the origin and rises to about 15.6 at 30.", b);
  })();

  /* q13: ray into a glass block; the marked angle is with the SURFACE */
  const fig13 = (() => {
    const O = [250, 140], a1 = (35 * Math.PI) / 180, a2 = (33 * Math.PI) / 180;
    let b = `<rect x="40" y="140" width="420" height="120" fill="#dbe7f5" stroke="${BLUE}" stroke-width="1.4"/>` + tx(60, 248, "glass", { size: 12 });
    b += tx(60, 130, "air", { size: 12 });
    b += ln(250, 30, 250, 250, "#777", 1.2, "5 4") + tx(256, 44, "normal", { size: 11, fill: "#555" });
    const s1 = [O[0] - 130 * Math.cos(a1), O[1] - 130 * Math.sin(a1)];
    b += ah(s1[0], s1[1], O[0], O[1], RED, 8);
    b += ah(O[0], O[1], O[0] + 110 * Math.sin(a2), O[1] + 110 * Math.cos(a2), RED, 8);
    b += `<path d="M ${O[0] - 60} ${O[1]} A 60 60 0 0 1 ${(O[0] - 60 * Math.cos(a1)).toFixed(1)} ${(O[1] - 60 * Math.sin(a1)).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1.2"/>` + tx(O[0] - 98, O[1] - 16, "35°", { bold: true });
    b += `<path d="M ${O[0]} ${O[1] + 55} A 55 55 0 0 0 ${(O[0] + 55 * Math.sin(a2)).toFixed(1)} ${(O[1] + 55 * Math.cos(a2)).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1.2"/>` + tx(O[0] + 6, O[1] + 74, "33°", { bold: true });
    return svg(500, 270, "A ray of light travels through air and strikes the flat top surface of a glass block. The angle between the incident ray and the glass surface is marked as 35 degrees. A dashed normal is drawn at the point of incidence. Inside the glass the refracted ray is bent towards the normal, and the angle between the refracted ray and the normal is marked as 33 degrees.", b);
  })();

  /* ---------------------------------------------------------------- bank ---------------------------------------------------------------- */
  B.paw = {
    intro:
      "Particles and Waves is worth roughly <strong>45 of the 110 marks</strong> in Section 2, and it is the most calculation-heavy area of the paper. Fourteen questions here: accelerators and the Standard Model, fission and fusion with <em>E = mc²</em>, the photoelectric effect, line spectra and energy levels, interference and gratings, refraction and total internal reflection, and irradiance with the inverse square law. A calculation is marked as <strong>relationship, substitution, answer with its unit</strong>, so show every line; an angle needs its degree sign. In the written answers, a mark goes to one physics idea stated with its reason (&quot;photon energy is less than the work function, so&hellip;&quot;), never to a bare key word.",
    questions: [
      /* ------------------------------------------------------------------ paw-01 ------------------------------------------------------------------ */
      {
        id: "paw-01",
        style: "Context question · accelerators, charged particles and fields",
        stem:
          "<p>A hospital proton-therapy centre treats tumours with a beam of protons. The protons start at rest in an ion source and are first accelerated through a potential difference of <strong>1.5 × 10⁴ V</strong> in a vacuum. Later, powerful magnets steer the beam in a circle round a ring.</p>",
        figure: fig01,
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 0,
            q: "In the diagram a proton moves to the right through a magnetic field directed into the page. In which direction is the force on the proton at this instant?",
            opts: ["Up the page", "Down the page", "To the right", "Into the page", "Out of the page"],
            why: "A positive charge uses the <strong>left hand</strong>: first finger along the field (into the page), second finger along the motion of the positive charge (to the right), and the thumb gives the force, <strong>up the page</strong>. Down the page is the answer for an electron, which is negative and so needs the right hand. The force on a moving charge is always at right angles to both the field and its velocity, so &quot;to the right&quot;, &quot;into&quot; and &quot;out of&quot; the page are impossible.",
          },
          {
            label: "(b)", type: "calc", marks: 4, rows: 6,
            q: "Calculate the speed of a proton as it leaves the accelerating region. Ignore relativistic effects.",
            steps: [
              { desc: "Work done by the field: W = QV (or E<sub>k</sub> = QV)", rel: ["qv", "vq"] },
              { desc: "Kinetic energy gained = 2.4 × 10⁻¹⁵ J", nums: [2.4e-15] },
              { desc: "E<sub>k</sub> = ½mv² with the proton mass 1.673 × 10⁻²⁷ kg", rel: REL_EK, nums: [1.673e-27] },
              { desc: "v = 1.7 × 10⁶ m s⁻¹", ans: 1693841.03, sf: 2, unit: "m s-1" },
            ],
            sample: "W = QV\nEk = 1.60 × 10⁻¹⁹ × 1.5 × 10⁴ = 2.4 × 10⁻¹⁵ J\nEk = ½mv²\n2.4 × 10⁻¹⁵ = ½ × 1.673 × 10⁻²⁷ × v²\nv = 1.7 × 10⁶ m s⁻¹",
            model: "<ul><li>W = QV (or E<sub>k</sub> = QV) (1)</li><li>1.60 × 10⁻¹⁹ × 1.5 × 10⁴ = 2.4 × 10⁻¹⁵ J (1)</li><li>E<sub>k</sub> = ½mv², with 2.4 × 10⁻¹⁵ = ½ × 1.673 × 10⁻²⁷ × v² (1)</li><li>v = 1.7 × 10⁶ m s⁻¹ (1)</li></ul><p>The proton mass 1.673 × 10⁻²⁷ kg is on the data sheet; the electron mass is a common wrong choice. Accept QV = ½mv² written in one line.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "Describe the job done by the electric field and the job done by the magnetic field in a ring accelerator like this one.",
            points: [
              { desc: "The electric field accelerates the protons (increases their speed or kinetic energy)",
                not: ["(?:magnetic|\\bb)(?:\\W+fields?)?\\W+(?:\\w+\\W+){0,1}(?:accelerat|speed|energi)", "(?:electric|\\be)(?:\\W+fields?)?\\W+(?:\\w+\\W+){0,1}(?:bend|steer|deflect|curv|circle|turn)"],
                any: [near("electric(?:\\W+fields?)?|\\be[- ]fields?", "accelerat\\w*|speed\\w*|energi[sz]\\w*|energy|faster|work|kinetic", 6)] },
              { desc: "The magnetic field bends (steers or deflects) the beam into a circular path",
                not: ["(?:electric|\\be)(?:\\W+fields?)?\\W+(?:\\w+\\W+){0,1}(?:bend|steer|deflect|curv|circle|turn)", "(?:magnetic|\\bb)(?:\\W+fields?)?\\W+(?:\\w+\\W+){0,1}(?:accelerat|speed)"],
                any: [near("magnetic(?:\\W+fields?)?|\\bb[- ]fields?", "bend\\w*|steer\\w*|deflect\\w*|curv\\w*|circular|circle|turn\\w*|focus\\w*|guid\\w*|direction|path", 14)] },
            ],
            sample: "The electric field accelerates the protons, giving them speed and kinetic energy each time they cross it. The magnetic field exerts a force at right angles to their motion, which bends the beam into a circular path round the ring.",
            model: "<ul><li>The electric field accelerates the charged particles (increases speed / kinetic energy) (1)</li><li>The magnetic field bends / steers / deflects the beam into a circular path (1)</li></ul><p>Do not award the mark if the jobs are swapped (a magnetic field cannot change the speed of a charge, because the force is always at right angles to its motion). As the protons gain energy the magnetic field has to be made stronger to hold the same path.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-02 ------------------------------------------------------------------ */
      {
        id: "paw-02",
        style: "Short answers · the Standard Model",
        stem:
          "<p>The Standard Model describes the fundamental particles and the forces between them. Quarks, leptons and force-carrying particles are all part of it.</p>",
        parts: [
          {
            label: "(a)", type: "match", marks: 5,
            q: "Match each term to its meaning.",
            pairs: [
              ["Quark", "A fundamental fermion that carries a fractional charge"],
              ["Lepton", "A fundamental fermion such as the electron, a muon or a neutrino"],
              ["Baryon", "A hadron made of three quarks"],
              ["Meson", "A hadron made of a quark and an antiquark"],
              ["Boson", "A force-mediating particle such as the photon or the gluon"],
            ],
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 2,
            q: "A meson has a charge of −1. Which of these could it be made from? (Up quark +⅔, down quark −⅓, strange quark −⅓.)",
            opts: ["An up quark and an anti-up quark", "An up quark and an anti-down quark", "A down quark and an anti-up quark", "A down quark, a down quark and a strange quark", "An up quark, an up quark and a down quark"],
            why: "A meson is a quark plus an antiquark. A down quark (−⅓) with an anti-up quark (−⅔) gives <strong>−1</strong>. Up with anti-up gives 0, and up with anti-down gives +⅔ + ⅓ = +1. Down, down, strange also adds to −1, but it is three quarks, so it is a baryon not a meson. Up, up, down is the proton (+1).",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "In the early twentieth century physicists measured the energies of the beta particles emitted in beta decay. Describe what the measurements showed, and state the conclusion that was drawn from them.",
            points: [
              { desc: "The beta particles (electrons) were emitted with a range of energies, not one fixed energy, so some energy seemed to be missing",
                not: ["\\b(?:all|every|each)\\W+(?:\\w+\\W+){0,4}(?:same|equal|identical|fixed|single)\\W+(?:\\w+\\W+){0,1}energ"],
                any: [near("range|spread|variety|continuous|different|varying|variable|various|all sorts", "energi\\w*", 6)] },
              { desc: "Conclusion: a further, almost undetectable, neutral particle (the neutrino) is emitted and carries away the missing energy",
                any: [near("neutrinos?|anti-?neutrinos?|third|another|new|extra|undetected|undetectable", "particles?|neutrinos?|exists?|proposed|predict\\w*|evidence", 8)] ,
                all: ["neutrinos?|anti-?neutrinos?|(?:new|another|third|extra|undetect\\w*|neutral) particle"] },
            ],
            sample: "The beta electrons came out with a range of energies instead of one fixed energy, so energy seemed to be missing from each decay. This was the first evidence for the neutrino, a neutral particle that is emitted as well and carries away the missing energy.",
            model: "<ul><li>Beta particles are emitted with a (continuous) range of energies, so energy appears to be missing (1)</li><li>Conclusion: another particle (the neutrino / antineutrino) is emitted with them, carrying away the missing energy; beta decay was the first evidence for the neutrino (1)</li></ul><p>Say what the evidence was and what it showed: &quot;the neutrino exists&quot; with no mention of the missing energy earns one mark at most.</p>",
          },
          {
            label: "(d)", type: "text", marks: 1, rows: 3, minWords: 6,
            q: "State one piece of evidence from particle accelerators that protons and neutrons contain quarks.",
            points: [
              { desc: "High-energy electrons fired at protons or neutrons (nucleons) are scattered through large angles, as if they hit small hard objects inside",
                all: [near("electrons?", "scatter\\w*|deflect\\w*|bounce\\w*|rebound\\w*|bouncing|large angles?", 8), "protons?|neutrons?|nucleons?|nuclei|nucleus|hadrons?"] },
            ],
            sample: "When high-energy electrons are fired at protons and neutrons, some are scattered through large angles, as if they had bounced off small hard objects inside the nucleons.",
            model: "<ul><li>Electrons collided with nucleons at high energy, and some bounced off at large angles, as though they had hit small hard objects (quarks) inside (1)</li></ul>",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-03 ------------------------------------------------------------------ */
      {
        id: "paw-03",
        style: "Short answers · nuclear equations and beta decay",
        stem:
          "<p>Uranium-238 decays through a series of nuclei. Part of the series is shown. The letters A and Z stand for the mass number and the atomic number.</p>",
        figure: fig03,
        parts: [
          { label: "(a)(i)", type: "num", marks: 1, a: 234, tol: 0, sf: 3, unit: "", q: "State the mass number of the thorium nucleus.", why: "An alpha particle is ⁴₂He, so the mass number falls by 4 and the atomic number by 2: 238 − 4 = <strong>234</strong>, and 92 − 2 = 90, which matches the diagram." },
          { label: "(ii)", type: "num", marks: 1, a: 91, tol: 0, sf: 2, unit: "", q: "State the atomic number of the protactinium nucleus.", why: "In beta decay a neutron changes into a proton, so the atomic number rises by 1 and the mass number is unchanged: 90 + 1 = <strong>91</strong>." },
          { label: "(iii)", type: "num", marks: 1, a: 142, tol: 0, sf: 3, unit: "neutrons", q: "The final uranium nucleus has a mass number of 234. How many neutrons does it contain?", why: "Neutrons = mass number − atomic number = 234 − 92 = <strong>142</strong>." },
          {
            label: "(b)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "Describe what happens inside the thorium nucleus when it undergoes beta decay.",
            points: [
              { desc: "A neutron changes (decays) into a proton",
                not: ["proton\\W+(?:\\w+\\W+){0,5}(?:turn|becom|chang|decay|convert|transform)\\w*\\W+(?:\\w+\\W+){0,3}neutron"],
                any: ["neutrons?\\W+(?:\\w+\\W+){0,5}(?:turn|becom|chang|decay|convert|transform)\\w*\\W+(?:\\w+\\W+){0,3}protons?", "neutron\\W*(?:->|→|to)\\W*proton"] },
              { desc: "An electron (the beta particle) and an antineutrino are emitted",
                all: ["electron|beta (?:particle|minus)|β", "anti-?\\s?neutrino|ν̄"], win: 120 },
            ],
            sample: "A neutron in the nucleus changes into a proton. An electron, which is the beta particle, and an antineutrino are emitted from the nucleus.",
            model: "<ul><li>A neutron turns into a proton (so the atomic number goes up by one) (1)</li><li>An electron (the beta particle) and an antineutrino are emitted (1)</li></ul><p>A proton changing into a neutron is beta-plus decay, which is not in this course. An orbiting electron is not the beta particle: it comes from the nucleus.</p>",
          },
          {
            label: "(c)", type: "multi", marks: 2,
            q: "Which <strong>two</strong> of these quantities have the same total before and after every nuclear decay?",
            opts: ["The total of the mass numbers", "The total of the atomic numbers (charge)", "The number of neutrons", "The number of protons", "The total rest mass of the nuclei"],
            a: [0, 1],
            why: "Nucleon number (mass number) and charge (atomic number) are conserved in every nuclear equation. The number of neutrons and protons separately changes in beta decay (a neutron becomes a proton). Mass is not conserved: the products have slightly less mass, the difference being the source of the energy released.",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-04 ------------------------------------------------------------------ */
      {
        id: "paw-04",
        style: "Context question · nuclear fission and E = mc²",
        stem:
          "<p>A nuclear power station generates electricity from the induced fission of uranium-235. One fission reaction is</p><p style=\"text-align:center\">²³⁵₉₂U + ¹₀n → ¹⁴¹₅₆Ba + ⁹²₃₆Kr + <em>x</em> ¹₀n</p><table class=\"pp-table\"><tbody><tr><th>Particle</th><th>Mass / kg</th></tr><tr><td>uranium-235 nucleus</td><td>3.9030 × 10⁻²⁵</td></tr><tr><td>neutron</td><td>1.675 × 10⁻²⁷</td></tr><tr><td>barium-141 nucleus</td><td>2.3398 × 10⁻²⁵</td></tr><tr><td>krypton-92 nucleus</td><td>1.5265 × 10⁻²⁵</td></tr></tbody></table>",
        parts: [
          { label: "(a)", type: "num", marks: 1, a: 3, tol: 0, sf: 1, unit: "", q: "Determine the value of <em>x</em>.", why: "Mass numbers must balance: 235 + 1 = 141 + 92 + <em>x</em>, so 236 = 233 + <em>x</em> and <em>x</em> = <strong>3</strong>. The atomic numbers check: 92 = 56 + 36." },
          {
            label: "(b)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "Explain how a chain reaction is sustained in the reactor.",
            points: [
              { desc: "Each fission releases (more than one) neutrons",
                any: [near("neutrons?", "releas\\w*|emit\\w*|given (?:off|out)|comes? out|ejected|spare|extra|several|more than one", 6)] },
              { desc: "These neutrons are absorbed by other uranium nuclei and cause further fissions",
                all: [near("neutrons?", "absorb\\w*|hit\\w*|strik\\w*|collid\\w*|trigger\\w*|caus\\w*|induc\\w*|split\\w*|captur\\w*|bombard\\w*|start\\w*|lead\\w*", 7), near("another|other|further|more|next|new|nearby|surrounding|neighbouring|additional|subsequent|again", "nucle\\w*|fission\\w*|atoms?|uranium|u-?235|reactions?", 5)] },
            ],
            sample: "Each fission releases neutrons. These neutrons are absorbed by other uranium-235 nuclei and make them split too, so the reaction goes on by itself.",
            model: "<ul><li>Each fission releases neutrons (more than one) (1)</li><li>These neutrons are absorbed by other uranium-235 nuclei, causing further fissions, so the reaction sustains itself (1)</li></ul>",
          },
          {
            label: "(c)", type: "calc", marks: 4, rows: 7,
            q: "Calculate the energy released in this fission reaction.",
            steps: [
              { desc: "Mass lost = 3.20 × 10⁻²⁸ kg (mass before − mass after, including all three neutrons)", nums: [3.2e-28] },
              { desc: "E = mc²", rel: ["e=mc\\^?2", "e=m" + X + "\\(?c\\)?\\^?2", "e=m" + X + "\\(?3"] },
              { desc: "Substitution: 3.20 × 10⁻²⁸ × (3.00 × 10⁸)²", nums: [3.2e-28, 3e8] },
              { desc: "E = 2.88 × 10⁻¹¹ J", ans: 2.88e-11, sf: 3, unit: ["j", "joules", "joule"] },
            ],
            sample: "Mass before = 3.9030 × 10⁻²⁵ + 1.675 × 10⁻²⁷ = 3.91975 × 10⁻²⁵ kg\nMass after = 2.3398 × 10⁻²⁵ + 1.5265 × 10⁻²⁵ + 3 × 1.675 × 10⁻²⁷ = 3.91655 × 10⁻²⁵ kg\nMass lost = 3.20 × 10⁻²⁸ kg\nE = mc²\nE = 3.20 × 10⁻²⁸ × (3.00 × 10⁸)²\nE = 2.88 × 10⁻¹¹ J",
            model: "<ul><li>Mass of reactants − mass of products = 3.20 × 10⁻²⁸ kg (1) (the incoming neutron counts on the left and all <em>three</em> neutrons on the right)</li><li>E = mc² (1)</li><li>E = 3.20 × 10⁻²⁸ × (3.00 × 10⁸)² (1)</li><li>E = 2.88 × 10⁻¹¹ J (1)</li></ul><p>Forgetting the three product neutrons gives a mass &quot;lost&quot; of 3.1 × 10⁻²⁷ kg, ten times too large. Do not round the masses before subtracting.</p>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 1,
            q: "Which statement explains why energy is released in the fission?",
            opts: ["The products have more mass than the reactants, and the extra mass is destroyed", "The products have less total mass than the reactants, and the lost mass is converted to energy", "The neutrons are created from energy supplied by the reactor", "Nucleons are destroyed and their charge becomes energy", "The number of neutrons decreases during the reaction"],
            why: "The total mass of the products is slightly <strong>less</strong> than the mass of the reactants, and the mass lost appears as energy, E = mc². The number of nucleons is unchanged (236 before and after), and the number of neutrons actually increases from 1 to 3.",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-05 ------------------------------------------------------------------ */
      {
        id: "paw-05",
        style: "Context question · nuclear fusion, plasma and power",
        stem:
          "<p>Fusion research aims to build a reactor in which light nuclei join together. One possible reaction is</p><p style=\"text-align:center\">²₁H + ³₂He → ⁴₂He + ¹₁p</p><p>The masses are: deuterium nucleus 3.344 × 10⁻²⁷ kg, helium-3 nucleus 5.008 × 10⁻²⁷ kg, helium-4 nucleus 6.645 × 10⁻²⁷ kg, proton 1.673 × 10⁻²⁷ kg.</p>",
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 1,
            q: "Which statement describes nuclear fusion?",
            opts: ["A heavy nucleus splits into two smaller nuclei and releases neutrons", "Two light nuclei join to form a heavier nucleus and release energy", "A nucleus emits an alpha particle and becomes a different element", "A neutron in a nucleus changes into a proton", "A particle and its antiparticle destroy each other"],
            why: "Fusion is two <strong>light nuclei joining</strong> to make a heavier one, with a loss of mass that appears as energy. Splitting a heavy nucleus is fission, emitting an alpha particle is alpha decay, a neutron becoming a proton is beta decay, and a particle and antiparticle meeting is annihilation.",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "The fuel for a fusion reactor is a plasma at a temperature of over 100 million kelvin. Explain why the plasma has to be held in place by magnetic fields rather than a solid container.",
            points: [
              { desc: "Any solid container would melt (or vaporise), because the plasma is far hotter than any material can withstand",
                any: [near("melt\\w*|vapori[sz]\\w*|destroy\\w*|burn\\w*|evaporat\\w*|damag\\w*|disintegrat\\w*", "container|walls?|vessel|material|solid|metal|reactor", 8), near("hotter|temperature|hot", "any|every|all|melting point|boiling point|material|container", 8)] },
              { desc: "The plasma is made of charged particles, which magnetic fields push on (force at right angles), so the plasma is kept away from the walls",
                all: [near("charged|charges?|ions?|nuclei|electrons", "particles?|plasma|moving|nuclei|electrons|ions", 4), near("magnetic", "forces?|push\\w*|deflect\\w*|bend\\w*|confin\\w*|contain\\w*|hold\\w*|trap\\w*|steer\\w*|guid\\w*|away|keep\\w*|curv\\w*", 8)] },
            ],
            sample: "A plasma at over a hundred million kelvin is so hot that it would melt any solid container. The plasma is made of charged particles, so a magnetic field exerts a force on them and holds the plasma away from the walls.",
            model: "<ul><li>The plasma is hotter than the melting point of any material, so a solid container would melt or vaporise (1)</li><li>The plasma consists of charged particles (nuclei and electrons), and a magnetic field exerts a force on moving charges, so it can confine the plasma away from the walls (1)</li></ul><p>To fuse, nuclei must have enough kinetic energy to overcome the repulsion between their positive charges. That is why the temperature has to be so high.</p>",
          },
          {
            label: "(c)", type: "calc", marks: 3, rows: 6,
            q: "Show that the energy released in one fusion reaction is about 3.1 × 10⁻¹² J.",
            steps: [
              { desc: "Mass lost = 3.4 × 10⁻²⁹ kg (8.352 × 10⁻²⁷ − 8.318 × 10⁻²⁷)", nums: [3.4e-29] },
              { desc: "E = mc², with c = 3.00 × 10⁸ m s⁻¹", rel: ["e=mc\\^?2", "e=m" + X + "\\(?c\\)?\\^?2", "e=m" + X + "\\(?3"], nums: [3e8] },
              { desc: "E = 3.06 × 10⁻¹² J, which rounds to 3.1 × 10⁻¹² J", ans: 3.06e-12, sf: 2, unit: ["j", "joules", "joule"] },
            ],
            sample: "Mass before = 3.344 × 10⁻²⁷ + 5.008 × 10⁻²⁷ = 8.352 × 10⁻²⁷ kg\nMass after = 6.645 × 10⁻²⁷ + 1.673 × 10⁻²⁷ = 8.318 × 10⁻²⁷ kg\nMass lost = 3.4 × 10⁻²⁹ kg\nE = mc² = 3.4 × 10⁻²⁹ × (3.00 × 10⁸)²\nE = 3.06 × 10⁻¹² J = 3.1 × 10⁻¹² J",
            model: "<ul><li>Mass lost = 8.352 × 10⁻²⁷ − 8.318 × 10⁻²⁷ = 3.4 × 10⁻²⁹ kg (1)</li><li>E = mc² = 3.4 × 10⁻²⁹ × (3.00 × 10⁸)² (1)</li><li>E = 3.06 × 10⁻¹² J, so about 3.1 × 10⁻¹² J (1)</li></ul><p>In a &quot;show that&quot; the unrounded value (3.06 × 10⁻¹² J) or more significant figures than the given answer must appear.</p>",
          },
          {
            label: "(d)", type: "calc", marks: 3, rows: 5,
            q: "In a proposed power plant there are 1.2 × 10²⁰ of these fusion reactions every second. Calculate the power released.",
            steps: [
              { desc: "P = E/t", rel: ["p=e/t", "e=pt", "p=\\(?e\\)?/\\(?t"] },
              { desc: "Energy released in one second = 1.2 × 10²⁰ × 3.06 × 10⁻¹² = 3.67 × 10⁸ J", nums: [[3.672e8, 3.72e8]] },
              { desc: "P = 3.7 × 10⁸ W", ans: 3.672e8, alts: [3.72e8], sf: 2, unit: ["w", "watts", "watt", "j s-1"] },
            ],
            sample: "P = E/t\nE = 1.2 × 10²⁰ × 3.06 × 10⁻¹² = 3.67 × 10⁸ J in 1 s\nP = 3.67 × 10⁸ / 1 = 3.7 × 10⁸ W",
            model: "<ul><li>P = E/t (1)</li><li>Energy per second = 1.2 × 10²⁰ × 3.06 × 10⁻¹² = 3.67 × 10⁸ J (1)</li><li>P = 3.7 × 10⁸ W (1)</li></ul><p>Use the energy per reaction found in (c); 3.1 × 10⁻¹² J gives 3.7 × 10⁸ W as well.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-06 ------------------------------------------------------------------ */
      {
        id: "paw-06",
        style: "Experiment and graph · the photoelectric effect",
        stem:
          "<p>A student measures the maximum kinetic energy of the photoelectrons emitted from a clean metal plate for light of different frequencies. The results are plotted on the graph.</p>",
        figure: fig06,
        parts: [
          { label: "(a)", type: "num", marks: 1, a: 4.6e14, tol: 1e13, sf: 2, unit: "Hz", shown: "4.6 × 10¹⁴", q: "Use the graph to find the threshold frequency of the metal.", why: "The threshold frequency is where the line meets the frequency axis, the lowest frequency that produces any photoelectrons: <strong>4.6 × 10¹⁴ Hz</strong>. Remember the axis is in units of 10¹⁴ Hz." },
          {
            label: "(b)", type: "calc", marks: 3, rows: 5,
            q: "Calculate the work function of the metal.",
            steps: [
              { desc: "Work function = hf₀ (E = hf)", rel: ["=hf", "hf0", "hf₀"] },
              { desc: "Substitution: 6.63 × 10⁻³⁴ × 4.6 × 10¹⁴", nums: [6.63e-34, 4.6e14] },
              { desc: "Work function = 3.0 × 10⁻¹⁹ J", ans: 3.0498e-19, sf: 2, unit: ["j", "joules", "joule"] },
            ],
            sample: "work function = hf₀\nW = 6.63 × 10⁻³⁴ × 4.6 × 10¹⁴\nW = 3.0 × 10⁻¹⁹ J",
            model: "<ul><li>Work function = hf₀ (1)</li><li>6.63 × 10⁻³⁴ × 4.6 × 10¹⁴ (1)</li><li>3.0 × 10⁻¹⁹ J (1)</li></ul><p>The work function is the minimum energy a photon needs to cause photoemission, so it is the photon energy at the threshold frequency.</p>",
          },
          {
            label: "(c)", type: "calc", marks: 4, rows: 7,
            q: "Light of wavelength 250 nm is shone on the plate. Calculate the maximum kinetic energy of a photoelectron.",
            steps: [
              { desc: "v = fλ (or f = v/λ) with v = 3.00 × 10⁸ m s⁻¹ and λ = 2.50 × 10⁻⁷ m", rel: REL_VFL, nums: [2.5e-7] },
              { desc: "f = 1.2 × 10¹⁵ Hz", nums: [1.2e15] },
              { desc: "E<sub>k</sub> = hf − hf₀", rel: ["ek=hf-", "ek=e-w", "hf-hf0", "hf-w", "ek=hf-hf"] },
              { desc: "E<sub>k</sub> = 4.9 × 10⁻¹⁹ J (5.0 × 10⁻¹⁹ J if the rounded work function from (b) is used)", ans: 4.9062e-19, alts: [4.956e-19], sf: 2, unit: ["j", "joules", "joule"] },
            ],
            sample: "v = fλ\n3.00 × 10⁸ = f × 250 × 10⁻⁹\nf = 1.2 × 10¹⁵ Hz\nEk = hf − hf₀ = 6.63 × 10⁻³⁴ × 1.2 × 10¹⁵ − 3.0 × 10⁻¹⁹\nEk = 5.0 × 10⁻¹⁹ J",
            model: "<ul><li>v = fλ with the wavelength converted to metres (1)</li><li>f = 1.2 × 10¹⁵ Hz (1)</li><li>E<sub>k</sub> = hf − hf₀ (1)</li><li>E<sub>k</sub> = 5.0 × 10⁻¹⁹ J (1)</li></ul><p>Photon energy 7.956 × 10⁻¹⁹ J minus the work function. With the rounded 3.0 × 10⁻¹⁹ J from (b) the answer is 4.96 × 10⁻¹⁹, which is 5.0 × 10⁻¹⁹ J; with the unrounded 3.05 × 10⁻¹⁹ J it is 4.9 × 10⁻¹⁹ J. Both are accepted.</p>",
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "The irradiance of the 250 nm light on the plate is now doubled. State what happens to (i) the number of photoelectrons emitted per second and (ii) the maximum kinetic energy of each photoelectron. Give a reason for each.",
            points: [
              { desc: "(i) More photoelectrons per second, because there are more photons per second (each photon frees one electron)",
                not: [NOT("(?:more|increas\\w*|greater|doubl\\w*)\\W+(?:\\w+\\W+){0,3}(?:photo)?electrons?"), "(?:photo)?electrons?\\W+(?:\\w+\\W+){0,6}(?:faster|more kinetic|more energy|greater energy|higher energy)", "electrons?\\W+(?:\\w+\\W+){0,2}(?:not|never)\\b"],
                any: ["(?:more|greater|larger|extra|twice|double[ds]?|increased?)\\W+(?:\\w+\\W+){0,2}(?:photo)?electrons?\\W+(?:\\w+\\W+){0,4}(?:emit\\w*|releas\\w*|freed|per|each|every|ejected|leav\\w*)", "(?:number|amount|rate)\\W+of\\W+(?:photo)?electrons?\\W+(?:\\w+\\W+){0,5}(?:increas\\w*|doubl\\w*|rises?|greater|higher|goes up)", "(?:photo)?electrons?\\W+(?:\\w+\\W+){0,6}(?:per|each|every)\\W+second\\W+(?:\\w+\\W+){0,3}(?:increas\\w*|doubl\\w*|rises?|goes up)", "(?:more|extra|greater|twice as many)\\W+(?:photo)?electrons"] },
              { desc: "(ii) The maximum kinetic energy is unchanged, because each photon still has the same energy hf", negOK: true,
                not: ["\\b(?:not|never|n't|isn't|won't)\\W+(?:\\w+\\W+){0,1}(?:stay|remain|same|constant|unchanged|equal)", "(?:kinetic energy|energy|\\bke\\b|e_?k)\\W+(?:\\w+\\W+){0,1}(?:doubl\\w*|increas\\w*|rises?|risen|greater|higher|twice|halv\\w*|decreas\\w*|reduc\\w*|goes up|go up)"],
                any: ["(?:kinetic energy|energy|\\bke\\b|e_?k)\\W+(?:\\w+\\W+){0,5}(?:unchanged|same|constant|no change|not change\\w*|doesn'?t change|stays?|remains?|independent|unaffected)", "(?:unchanged|same|constant|no change|unaffected)\\W+(?:\\w+\\W+){0,1}(?:maximum |max )?(?:kinetic energy|energy|\\bke\\b)", "(?:kinetic energy|energy|\\bke\\b)\\W+(?:\\w+\\W+){0,2}(?:not|n't)\\W+(?:\\w+\\W+){0,1}(?:increas\\w*|chang\\w*|rise|vary|alter\\w*|affect\\w*|depend\\w*)"] },
            ],
            sample: "More photoelectrons are emitted each second, because doubling the irradiance means there are twice as many photons per second and each photon frees one electron. The maximum kinetic energy stays the same, because each photon still has the energy hf, which depends only on the frequency.",
            model: "<ul><li>(i) The number of photoelectrons per second increases (doubles), because more photons arrive per second (1)</li><li>(ii) The maximum kinetic energy is unchanged, because the energy of each photon (hf) depends only on frequency, which has not changed (1)</li></ul><p>Brighter light gives more photons, not bigger ones. To increase the maximum kinetic energy, increase the frequency.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-07 ------------------------------------------------------------------ */
      {
        id: "paw-07",
        style: "Open-ended explanation · wave–particle duality",
        stem:
          "<p>A light-operated switch contains a clean zinc plate in a vacuum tube. When a bright red lamp shines on the plate, the switch does nothing at all, however bright the lamp is made. When a weak ultraviolet lamp shines on the plate, a current flows immediately.</p>",
        parts: [
          {
            label: "(a)", type: "text", marks: 3, rows: 7, minWords: 12,
            q: "Explain these observations in terms of the particle model of light.",
            points: [
              { desc: "Light is a stream of photons; the energy of each photon, E = hf, depends only on the frequency",
                not: ["(?:not|n't)\\W+(?:\\w+\\W+){0,3}(?:photons?|quanta|packets?)", "(?:not|n't)\\W+(?:\\w+\\W+){0,2}(?:hf|h ?x ?f)"],
                all: [near("photons?|quanta|quantum|packets?", "hf|h ?x ?f|frequency|frequencies", 8)] },
              { desc: "Each red photon has too little energy: it is below the work function (frequency below the threshold), so no electrons are released however many photons arrive",
                any: [near("less|lower|smaller|below|insufficient|too little|not enough|too low|isn'?t enough|too small|doesn'?t have", "work function|threshold|hf0|hf₀|enough energy|free|release|remove|emit\\w*|knock", 9)],
                not: ["(?:not|n't)\\W+(?:\\w+\\W+){0,1}(?:less|lower|smaller|below|insufficient)"] },
              { desc: "Each ultraviolet photon has a higher frequency, so its energy is greater than the work function, and it can release an electron",
                not: ["(?:not|n't)\\W+(?:\\w+\\W+){0,2}(?:greater|higher|more|enough|exceed\\w*|sufficient|above|bigger|larger)"],
                any: [near("photon|energy|energies|frequency", "(?:greater|more|higher|exceed\\w*|above|at least|equal|larger|bigger)\\W+(?:\\w+\\W+){0,4}(?:work function|threshold|needed|required|minimum|hf0|hf₀)", 6), "(?:uv|ultraviolet)\\W+(?:\\w+\\W+){0,4}(?:enough|sufficient|more|greater|higher|exceed\\w*)\\W+(?:\\w+\\W+){0,1}(?:energy|frequency|work function|threshold)"] },
            ],
            sample: "Light is made of photons, and the energy of each photon is E = hf, so it depends only on the frequency. Each red photon has less energy than the work function of zinc, so it cannot release an electron, and a brighter lamp just sends more photons that each still have too little energy. An ultraviolet photon has a higher frequency, so its energy is greater than the work function and it releases an electron at once.",
            model: "<ul><li>Light arrives in photons (packets), each with energy E = hf; the energy depends on the frequency (1)</li><li>Red photons have less energy than the work function (the frequency is below the threshold), so no photoelectrons, however many photons (irradiance) (1)</li><li>Ultraviolet photons have a higher frequency, so each has energy greater than the work function and releases an electron; the excess is kinetic energy (1)</li></ul><p>Each photon gives its energy to <em>one</em> electron, so photons cannot combine their energy. A wave model would predict that a bright enough red lamp should work, which is why this is evidence for the particle model.</p>",
          },
          {
            label: "(b)", type: "multi", marks: 2,
            q: "Which <strong>two</strong> changes would increase the maximum kinetic energy of the photoelectrons?",
            opts: ["Using light of a higher frequency", "Increasing the irradiance of the light", "Replacing the plate with a metal of smaller work function", "Moving the lamp closer to the plate", "Using a plate with a bigger area"],
            a: [0, 2],
            why: "E<sub>k</sub> = hf − hf₀, so E<sub>k</sub> rises if f increases or if the work function hf₀ falls. Irradiance, lamp distance and plate area only change how many photons arrive each second, so they change the number of photoelectrons but not the energy of each.",
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 3,
            q: "A graph of maximum kinetic energy of the photoelectrons against frequency of the light is a straight line. What does the gradient of this line represent?",
            opts: ["The work function of the metal", "The threshold frequency", "The speed of light", "Planck's constant", "The mass of an electron"],
            why: "E<sub>k</sub> = hf − hf₀ has the form y = mx + c, with E<sub>k</sub> on the y-axis and f on the x-axis. The gradient is <strong>h</strong>, Planck's constant. The intercept on the frequency axis is the threshold frequency and the intercept on the E<sub>k</sub> axis is −hf₀.",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-08 ------------------------------------------------------------------ */
      {
        id: "paw-08",
        style: "Context question · energy levels and line spectra",
        stem:
          "<p>The energy levels of an atom of an unknown element in a spectral lamp are shown. Electrons make the transitions P, Q, R, S and W when the lamp is operating.</p>",
        figure: fig08,
        parts: [
          {
            label: "(a)", type: "calc", marks: 4, rows: 7,
            q: "Calculate the wavelength of the radiation emitted in transition W.",
            steps: [
              { desc: "E₂ − E₁ = hf (and v = fλ), or λ = hc/E", rel: ["e[₂2]-e[₁1]=hf", "e=hf", "=hf\\b", "f=e/h", "hf=", LAM + "=hc/e", "e=hc/" + LAM, "hc/e", "e=h" + X + "c/" + LAM, LAM + "=h" + X + "c/"] },
              { desc: "Photon energy = 3.09 × 10⁻¹⁹ J", nums: [3.09e-19] },
              { desc: "f = E/h = 4.66 × 10¹⁴ Hz (or, by the other route, hc/E with the values substituted)", rel: [E14, EH, HCE, HC, SUBHC] },
              { desc: "λ = v/f = 6.44 × 10⁻⁷ m (644 nm)", ans: 6.4369e-7, alts: [643.69], sf: 3, unit: ["m", "nm", "metres", "metre", "nanometres"] },
            ],
            sample: "E₂ − E₁ = hf\n−4.11 × 10⁻¹⁹ − (−7.20 × 10⁻¹⁹) = 3.09 × 10⁻¹⁹ J\nf = E/h = 3.09 × 10⁻¹⁹ / 6.63 × 10⁻³⁴ = 4.66 × 10¹⁴ Hz\nv = fλ so λ = 3.00 × 10⁸ / 4.66 × 10¹⁴\nλ = 6.44 × 10⁻⁷ m",
            model: "<ul><li>E₂ − E₁ = hf (1)</li><li>(−4.11 − (−7.20)) × 10⁻¹⁹ = 3.09 × 10⁻¹⁹ J (1)</li><li>f = 3.09 × 10⁻¹⁹ ÷ 6.63 × 10⁻³⁴ = 4.66 × 10¹⁴ Hz (1)</li><li>λ = c/f = 6.44 × 10⁻⁷ m (644 nm) (1)</li></ul><p>The energies are negative, so always subtract the lower level from the higher; a negative answer is a sign error. Accept 644 nm.</p>",
          },
          {
            label: "(b)", type: "text", marks: 1, rows: 2, minWords: 1,
            q: "Use the data sheet to name the element.",
            points: [{ desc: "Cadmium (its red line has a wavelength of 644 nm)", any: ["\\bcadmium\\b", "\\bcd\\b"], not: ["\\b(?:hydrogen|sodium)\\b"] }],
            sample: "Cadmium",
            model: "<p>Cadmium (1): its red line has a wavelength of 644 nm. Hydrogen's red line is 656 nm and sodium's only line is yellow, 589 nm.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "The lamp gives out light of only a few separate wavelengths. Explain how the atoms produce this line spectrum.",
            points: [
              { desc: "Electrons fall from a higher energy level to a lower one, and each fall emits a photon",
                all: ["(?:fall\\w*|drop\\w*|jump\\w*|mov\\w*|go(?:es)? down|return\\w*|transition\\w*|de-?excit\\w*)", "(?:lower|ground)", "emit\\w*|releas\\w*|give\\w* (?:out|off)|photons?"], win: 120 },
              { desc: "The photon energy equals the difference between the two levels (E₂ − E₁ = hf), and only certain differences exist, so only certain frequencies are emitted",
                all: [near("difference|gap|equal\\w*|e2|e₂|between (?:two|the) (?:\\w+ )?levels", "photon|energy|energies|frequenc\\w*|wavelength\\w*", 8), "only|certain|specific|particular|fixed|discrete|set|allowed|definite|exact|unique"], win: 200 },
            ],
            sample: "Electrons in the excited atoms fall from a higher energy level to a lower one, and each fall emits a photon. The energy of the photon equals the difference between the two levels, E₂ − E₁ = hf, and only certain differences exist, so only certain frequencies and wavelengths are emitted.",
            model: "<ul><li>Electrons fall (transition down) from a higher energy level to a lower level, emitting a photon (1)</li><li>The photon energy equals the difference between the two levels, E₂ − E₁ = hf; the levels are fixed, so only certain frequencies (wavelengths) are possible, giving separate lines (1)</li></ul><p>Name the direction: emission is a fall. An electron cannot sit between levels.</p>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 1,
            q: "Which transition emits the photon of highest frequency?",
            opts: ["P", "Q", "R", "S", "W"],
            why: "The photon energy is the difference between the levels and E = hf, so the biggest energy gap gives the highest frequency. Q is 4.14 × 10⁻¹⁹ J, W is 3.09, P is 2.91, S is 1.86 and R is only 1.05 × 10⁻¹⁹ J. The arrow does not need to start from the highest level.",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-09 ------------------------------------------------------------------ */
      {
        id: "paw-09",
        style: "Open-ended explanation · absorption spectra of a star",
        stem:
          "<p>An astronomer uses a spectrometer to study light from a star. The spectrum is continuous but crossed by dark lines at the wavelengths below.</p><table class=\"pp-table\"><tbody><tr><th>Dark line</th><th>1</th><th>2</th><th>3</th><th>4</th></tr><tr><td>Wavelength / nm</td><td>434</td><td>486</td><td>589</td><td>656</td></tr></tbody></table>",
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 1,
            q: "Use the spectral lines on the data sheet to decide which elements are present in the star's atmosphere.",
            opts: ["Hydrogen only", "Hydrogen and sodium", "Sodium and cadmium", "Hydrogen and cadmium", "Hydrogen, sodium and cadmium"],
            why: "656, 486 and 434 nm are all hydrogen lines and 589 nm is the sodium line, so hydrogen and sodium are present. Cadmium's lines are at 644, 509 and 480 nm, none of which is in the star's spectrum (480 is close to 486 but they are different lines).",
          },
          {
            label: "(b)", type: "text", marks: 3, rows: 7, minWords: 12,
            q: "Explain how the dark lines in the star's spectrum are produced, and how they let the astronomer identify the elements.",
            points: [
              { desc: "Light from the hot inner star gives a continuous spectrum, which passes through cooler gas in the star's outer layers (atmosphere)",
                any: [near("cooler|cool|outer|upper|surrounding", "gas|gases|layers?|atmosphere|atoms|region", 3)] },
              { desc: "Electrons in the atoms of the gas absorb photons with energy equal to the gap between energy levels and jump up, so only those frequencies are removed",
                all: [near("absorb\\w*", "photons?|light|frequenc\\w*|wavelength\\w*|energy|energies|radiation", 8), "levels?|jump\\w*|excit\\w*|higher|promot\\w*|transition|difference|gaps?"] },
              { desc: "Each element has its own pattern of lines, so the positions of the dark lines are matched with known spectra to identify the elements",
                all: [near("match\\w*|compar\\w*|same|identical|unique|fingerprint|pattern|corresponds?|line up|its own|different", "lines?|wavelengths?|spectr\\w*|emission|elements?|frequenc\\w*", 8), "elements?|atoms?|gas\\w*|hydrogen|sodium|each|known|data sheet|lab"] },
            ],
            sample: "The hot inner part of the star gives a continuous spectrum, and this light passes through the cooler gas in the outer layers. Electrons in the atoms of the gas absorb photons with exactly the energy of the gap between two energy levels and jump up, so those frequencies are removed and leave dark lines. Each element has its own pattern of lines, so the astronomer compares the positions of the dark lines with the known spectra of elements to identify them.",
            model: "<ul><li>Continuous spectrum from the hot interior passes through cooler gas in the outer layers (1)</li><li>Electrons in the gas absorb photons whose energy equals the difference between two energy levels (E₂ − E₁ = hf), jumping up; these frequencies are missing from the light, giving dark lines (1)</li><li>Each element has a unique set of lines; the dark lines are compared/matched with the known emission lines of elements to identify them (1)</li></ul><p>A common error is to describe an emission spectrum (electrons <em>falling</em>). The re-emitted photons go off in all directions, so the line is dark on the observer's line of sight.</p>",
          },
          {
            label: "(c)", type: "calc", marks: 3, rows: 5,
            q: "Calculate the energy of a photon absorbed to produce dark line 2, of wavelength 486 nm.",
            steps: [
              { desc: "E = hf", rel: REL_EHF },
              { desc: "f = v/λ = 6.17 × 10¹⁴ Hz", nums: [6.17e14] },
              { desc: "E = 4.09 × 10⁻¹⁹ J", ans: 4.0926e-19, sf: 3, unit: ["j", "joules", "joule"] },
            ],
            sample: "v = fλ so f = 3.00 × 10⁸ / 486 × 10⁻⁹ = 6.17 × 10¹⁴ Hz\nE = hf\nE = 6.63 × 10⁻³⁴ × 6.17 × 10¹⁴\nE = 4.09 × 10⁻¹⁹ J",
            model: "<ul><li>E = hf (1)</li><li>f = 3.00 × 10⁸ ÷ 486 × 10⁻⁹ = 6.17 × 10¹⁴ Hz (1)</li><li>E = 6.63 × 10⁻³⁴ × 6.17 × 10¹⁴ = 4.09 × 10⁻¹⁹ J (1)</li></ul><p>Convert nm to m: 486 nm = 486 × 10⁻⁹ m.</p>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 1,
            q: "A sodium lamp is viewed through a diffraction grating. What is seen?",
            opts: ["A continuous spectrum of all the colours", "A bright yellow line on a dark background", "A dark line crossing a continuous spectrum", "Bright red, green and blue lines", "Several bright lines in the ultraviolet only"],
            why: "A hot, low-pressure sodium gas emits a <strong>line emission</strong> spectrum: a bright yellow line (589 nm) on a dark background. A continuous spectrum comes from a hot solid and a dark line on a continuous background is an absorption spectrum. Red, green and blue lines would be cadmium.",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-10 ------------------------------------------------------------------ */
      {
        id: "paw-10",
        style: "Context question · interference of sound waves",
        stem:
          "<p>In a school hall, two identical loudspeakers S<sub>1</sub> and S<sub>2</sub> are connected to the same signal generator. A pupil walks along a line in front of them. As she moves, the sound repeatedly gets louder and quieter. At a point P the sound is at its <strong>second minimum</strong> counting from the central maximum. P is 5.40 m from S<sub>1</sub> and 6.15 m from S<sub>2</sub>.</p>",
        figure: fig10,
        parts: [
          {
            label: "(a)", type: "text", marks: 1, rows: 2, minWords: 4,
            q: "State what is meant by <em>coherent</em> sources.",
            points: [{ desc: "Sources with a constant phase relationship (same frequency and a fixed phase difference)",
              any: [near("constant|fixed|steady|same|unchanging|does(?:n't| not) change|doesn'?t vary", "phase|frequency", 6)], not: ["\\bphase\\W+(?:\\w+\\W+){0,3}(?:changes?|varies|vary)"] }],
            sample: "Coherent sources have the same frequency and a constant phase relationship with each other.",
            model: "<p>Waves with a constant phase difference (and so the same frequency) (1). Only coherent sources give a steady interference pattern.</p>",
          },
          {
            label: "(b)", type: "calc", marks: 5, rows: 8,
            q: "Calculate the frequency of the sound from the loudspeakers. The speed of sound is on the data sheet.",
            steps: [
              { desc: "Path difference = (m + ½)λ, with m = 1 for the second minimum (1.5λ)", rel: ["pathdifference=\\(?m\\+(?:½|1/2|0\\.5)\\)?" + LAM, "\\(m\\+(?:½|1/2|0\\.5)\\)" + LAM, "\\(?1\\+(?:½|1/2|0\\.5)\\)?\\(?" + LAM, "1\\.5" + X + LAM, "\\(?m\\+(?:½|1/2|0\\.5)\\)?" + X + LAM] },
              { desc: "Path difference = 6.15 − 5.40 = 0.75 m, so 0.75 = 1.5λ", nums: [0.75] },
              { desc: "λ = 0.50 m", nums: [0.5] },
              { desc: "v = fλ (or f = v/λ) with v = 3.40 × 10² m s⁻¹", rel: REL_VFL.slice(0, 5).concat(["f=340/", "f=3\\.4"]), nums: [340] },
              { desc: "f = 6.8 × 10² Hz", ans: 680, sf: 2, unit: ["hz", "hertz", "s-1"] },
            ],
            sample: "path difference = (m + ½)λ, m = 1\n6.15 − 5.40 = 0.75 m = 1.5λ\nλ = 0.50 m\nv = fλ\n340 = f × 0.50\nf = 6.8 × 10² Hz",
            model: "<ul><li>Path difference = (m + ½)λ (1)</li><li>6.15 − 5.40 = 0.75 m and 0.75 = 1.5λ (1)</li><li>λ = 0.50 m (1)</li><li>v = fλ, with 3.40 × 10² = f × 0.50 (1)</li><li>f = 6.8 × 10² Hz (1)</li></ul><p>The first minimum has m = 0 (half a wavelength), so the <em>second</em> has m = 1. Using m = 2 gives 1130 Hz, which loses the intermediate and answer marks (path difference 0.75 = 2.5λ is only valid for the third minimum).</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 5, minWords: 10,
            q: "Explain why the pupil hears the sound alternately loud and quiet as she walks along the line in front of the speakers.",
            points: [
              { desc: "Loud where the waves from the two speakers arrive in phase (path difference a whole number of wavelengths): constructive interference",
                any: [near("in phase|constructive|crest\\W+(?:\\w+\\W+){0,3}crest|whole number|mλ|maximum|maxima|reinforc\\w*|add\\w*|combine\\w*", "loud\\w*|path difference|wavelengths?|waves?|sound", 8)],
                not: ["out of phase\\W+(?:\\w+\\W+){0,6}loud", "(?:destructive|trough|cancel\\w*)\\W+(?:\\w+\\W+){0,6}loud"] },
              { desc: "Quiet where the waves arrive out of phase (path difference an odd number of half wavelengths): destructive interference",
                any: [near("out of phase|destructive|crest\\W+(?:\\w+\\W+){0,3}trough|trough\\W+(?:\\w+\\W+){0,3}crest|cancel\\w*|half|m ?\\+ ?½|odd", "quiet|minim\\w*|path difference|wavelengths?|waves?|sound|silen\\w*|soft\\w*", 8)],
                not: ["in phase\\W+(?:\\w+\\W+){0,6}quiet", "constructive\\W+(?:\\w+\\W+){0,6}quiet"] },
            ],
            sample: "Where the path difference is a whole number of wavelengths the waves from the two speakers arrive in phase and interfere constructively, so the sound is loud. Where the path difference is an odd number of half wavelengths the waves arrive out of phase and interfere destructively, so the sound is quiet.",
            model: "<ul><li>Maxima (loud): waves arrive in phase; path difference = mλ; constructive interference (1)</li><li>Minima (quiet): waves arrive out of phase (crest meets trough); path difference = (m + ½)λ; destructive interference (1)</li></ul><p>Walking along the line changes the path difference, so the pupil passes alternately through maxima and minima.</p>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 1,
            q: "The frequency from the signal generator is now doubled. What does the pupil hear at P?",
            opts: ["A minimum, because the path difference is now 3λ", "A maximum, because the path difference is now 3λ", "A minimum, because the wavelength has halved", "A maximum, because the speed of sound has doubled", "The same minimum as before, because the path difference has not changed"],
            why: "Doubling f halves λ to 0.25 m. The path difference is still 0.75 m, which is now 3λ, a whole number of wavelengths, so the waves arrive in phase: a <strong>maximum</strong>. The speed of sound does not change. The path difference does not change, but its size in wavelengths does.",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-11 ------------------------------------------------------------------ */
      {
        id: "paw-11",
        style: "Context question · diffraction grating",
        stem:
          "<p>A teacher shines the red light from a cadmium lamp on a diffraction grating that has <strong>400 lines per millimetre</strong>. The maxima are viewed on a screen.</p>",
        figure: fig11,
        parts: [
          {
            label: "(a)", type: "calc", marks: 4, rows: 7,
            q: "Use the data sheet to find the wavelength of the red light, then calculate the angle between the central maximum and the second-order maximum.",
            steps: [
              { desc: "d sin θ = mλ", rel: REL_DSIN },
              { desc: "Grating spacing d = 1/400 000 = 2.5 × 10⁻⁶ m", nums: [2.5e-6] },
              { desc: "Substitution with λ = 644 nm = 6.44 × 10⁻⁷ m (and m = 2)", nums: [6.44e-7] },
              { desc: "θ = 31°", ans: 31.0108, abs: 0.2, sf: 3, unit: ["°", "degrees", "deg"] },
            ],
            sample: "d = 1 / 400 000 = 2.5 × 10⁻⁶ m\nd sin θ = mλ\n2.5 × 10⁻⁶ × sin θ = 2 × 6.44 × 10⁻⁷\nsin θ = 0.515\nθ = 31°",
            model: "<ul><li>d sin θ = mλ (1)</li><li>d = 1 ÷ (400 × 10³) = 2.5 × 10⁻⁶ m (1)</li><li>2.5 × 10⁻⁶ sin θ = 2 × 6.44 × 10⁻⁷ (1)</li><li>θ = 31° (1)</li></ul><p>The red cadmium line is 644 nm on the data sheet. The most common error is d = 1/400 = 2.5 × 10⁻³ m, which forgets that 400 lines <em>per millimetre</em> is 400 000 per metre.</p>",
          },
          { label: "(b)", type: "num", marks: 1, a: 3, tol: 0, sf: 1, unit: "", shown: "3", q: "What is the highest order of maximum that can be seen with this grating and this light?", why: "sin θ cannot exceed 1, so m must be less than d/λ = 2.5 × 10⁻⁶ ÷ 6.44 × 10⁻⁷ = 3.88. The highest whole-number order is <strong>3</strong> (m = 4 would need sin θ = 1.03)." },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "The grating is replaced by one with 200 lines per millimetre. State what happens to the spacing of the maxima on the screen, and explain your answer.",
            points: [
              { desc: "The maxima move closer together (the angles are smaller)",
                not: ["(?:further|farther|wider|more spread|spread\\w* out|apart)\\W+(?:\\w+\\W+){0,3}(?:maxima|orders|angles?|spots)", "(?:maxima|orders|angles?|spots)\\W+(?:\\w+\\W+){0,4}(?:further|farther|wider|bigger|larger|increas\\w*|apart)"],
                any: ["(?:maxima|orders?|spots?|fringes?|lines|pattern|spectra)\\W+(?:\\w+\\W+){0,4}(?:closer|nearer|squashed|compressed|narrower|squeezed)", "(?:angles?|θ|spacing|separation|distances?)\\W+(?:\\w+\\W+){0,4}(?:smaller|decreas\\w*|reduc\\w*|less|shorter)", "(?:closer|nearer)\\W+(?:together|to)"] },
              { desc: "Because the grating spacing d is larger, so sin θ = mλ/d is smaller",
                any: ["\\bd\\b\\W+(?:\\w+\\W+){0,6}(?:larger|bigger|greater|increas\\w*|doubl\\w*|twice)", "(?:larger|bigger|greater|increas\\w*|doubl\\w*|twice)\\W+(?:\\w+\\W+){0,3}(?:slit |grating )?(?:spacing|separation|d\\b|distance between)", "(?:slits?|lines)\\W+(?:\\w+\\W+){0,5}(?:further|farther|apart|wider|bigger spacing)", "(?:spacing|separation|\\bd)\\W+(?:\\w+\\W+){0,2}(?:larger|bigger|greater|increas\\w*|doubl\\w*|twice)"] },
            ],
            sample: "The maxima move closer together, because the grating with fewer lines per millimetre has a larger slit spacing d, so sin θ = mλ/d is smaller for each order and the angles are smaller.",
            model: "<ul><li>The maxima are closer together / angles are smaller (1)</li><li>The slit spacing d is larger (twice as large: 5.0 × 10⁻⁶ m), so θ is smaller for the same order, since sin θ = mλ/d (1)</li></ul><p>A common error is to say that fewer lines per millimetre means the lines are closer together. It is the opposite: the lines are further apart.</p>",
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "The red lamp is replaced by a lamp giving white light. Explain why the central maximum is white.",
            points: [
              { desc: "At the central maximum the path difference is zero for every wavelength (colour)",
                all: [near("path difference", "zero|0|nothing|no difference|none|the same", 5), near("colou?rs?|wavelengths?|frequenc\\w*|every|all", "path difference|zero|same", 12)] },
              { desc: "So all the colours arrive in phase and interfere constructively, combining to make white",
                any: [near("colou?rs?|wavelengths?|waves?|frequenc\\w*|light", "in phase|constructive\\w*|reinforc\\w*|add\\w*|combin\\w*|overlap\\w*|superimpos\\w*", 6)] },
            ],
            sample: "At the central maximum the path difference is zero for every wavelength. All the colours therefore arrive in phase and interfere constructively, and they combine to give white light.",
            model: "<ul><li>Path difference is zero for all wavelengths (1)</li><li>All colours arrive in phase (constructive interference) and combine to make white (1)</li></ul><p>In the higher orders, sin θ = mλ/d, so each colour has a different angle and the light is spread into a spectrum, with red deviated more than violet.</p>",
          },
          {
            label: "(e)", type: "text", marks: 1, rows: 3, minWords: 1,
            q: "The original 400 lines per millimetre grating is used again, but with violet light of shorter wavelength than the red. State what happens to the angle of the first-order maximum.",
            points: [{ desc: "The angle is smaller (the maximum is nearer the centre), because sin θ = mλ/d and λ is smaller", negOK: true,
              not: ["(?<!\\bnot )(?<!n't )(?<!\\bno )(?:larger|bigger|greater|increas\\w*|further|wider|same|unchanged)", "(?:not|n't)\\W+(?:\\w+\\W+){0,1}(?:smaller|decreas\\w*|reduc\\w*|less|nearer|closer|lower)"],
              any: ["(?:smaller|decreas\\w*|reduc\\w*|less|nearer|closer|lower)"] }],
            sample: "The angle is smaller, so the maximum is closer to the centre.",
            model: "<p>The angle is smaller (1), since sin θ = mλ/d and λ is smaller. Red light is deviated more than violet, the opposite of a prism.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-12 ------------------------------------------------------------------ */
      {
        id: "paw-12",
        style: "Experiment question · irradiance and the inverse square law",
        stem:
          "<p>A pupil investigates how the irradiance of light from a small lamp depends on the distance from it. A light meter is moved along a metre stick, starting at the lamp, in a darkened room. The pupil takes one reading at each distance and plots a graph.</p><table class=\"pp-table\"><tbody><tr><th>Distance <em>d</em> / m</th><td>0.20</td><td>0.30</td><td>0.40</td><td>0.50</td><td>0.60</td></tr><tr><th>Irradiance <em>I</em> / W m⁻²</th><td>13.0</td><td>5.78</td><td>3.25</td><td>2.08</td><td>1.44</td></tr></tbody></table>",
        figure: fig12,
        parts: [
          {
            label: "(a)", type: "calc", marks: 3, rows: 5,
            q: "The sensor of the light meter has an area of 1.5 cm². Calculate the power of the light that enters the sensor when the meter is 0.40 m from the lamp.",
            steps: [
              { desc: "I = P/A", rel: ["i=p/a", "p=ia", "p=i" + X + "a", "p=a" + X + "i"] },
              { desc: "Substitution: P = 3.25 × 1.5 × 10⁻⁴ (area converted to m²)", nums: [3.25, 1.5e-4] },
              { desc: "P = 4.9 × 10⁻⁴ W", ans: 4.875e-4, sf: 2, unit: ["w", "watts", "watt", "j s-1"] },
            ],
            sample: "I = P/A\nP = IA = 3.25 × 1.5 × 10⁻⁴\nP = 4.9 × 10⁻⁴ W",
            model: "<ul><li>I = P/A (1)</li><li>P = 3.25 × 1.5 × 10⁻⁴ (1): 1.5 cm² = 1.5 × 10⁻⁴ m², not 1.5 × 10⁻² m²</li><li>P = 4.9 × 10⁻⁴ W (1)</li></ul>",
          },
          {
            label: "(b)", type: "calc", marks: 3, rows: 6,
            q: "Use the reading at 0.40 m to calculate the irradiance at a distance of 0.90 m from the lamp.",
            steps: [
              { desc: "I₁d₁² = I₂d₂² (or I = k/d²)", rel: ["i[₁1]d[₁1]\\^?2=i[₂2]d[₂2]\\^?2", "i=k/d\\^?2", "i[₂2]=i[₁1]d[₁1]\\^?2/d[₂2]\\^?2", "i[₁1]/i[₂2]=\\(?d[₂2]/d[₁1]\\)?\\^?2", "k=id\\^?2", "i[₂2]=\\(?i[₁1]"] },
              { desc: "Substitution: 3.25 × 0.40² = I₂ × 0.90²", nums: [3.25, 0.4, 0.9] },
              { desc: "I₂ = 0.64 W m⁻²", ans: 0.642, sf: 2, unit: ["w m-2", "w/m2", "watts per square metre"] },
            ],
            sample: "I₁d₁² = I₂d₂²\n3.25 × 0.40² = I₂ × 0.90²\nI₂ = 0.64 W m⁻²",
            model: "<ul><li>I₁d₁² = I₂d₂² (1)</li><li>3.25 × 0.40² = I₂ × 0.90² (1)</li><li>I₂ = 0.64 W m⁻² (1)</li></ul><p>Moving 2.25 times as far away cuts the irradiance by 2.25² = 5.06. Check: 3.25 ÷ 5.06 = 0.64.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "The graph of <em>I</em> against 1/<em>d</em>² is shown. State what the graph shows about the relationship between <em>I</em> and <em>d</em>.",
            points: [
              { desc: "The graph is a straight line through the origin",
                not: ["curv\\w*"],
                any: [near("straight|linear", "origin|zero|\\(0 ?, ?0\\)|0 ?, ?0", 8)] },
              { desc: "So the irradiance is inversely proportional to the square of the distance (I ∝ 1/d²)",
                any: ["(?:irradiance|\\bi\\b)\\W+(?:\\w+\\W+){0,4}(?:directly )?proportional\\W+(?:\\w+\\W+){0,3}1/d", "inversely proportional\\W+(?:\\w+\\W+){0,6}(?:square|d\\^?2)", "(?:irradiance|\\bi\\b)\\W*(?:∝|α|~)\\W*1/d", "\\bi\\W*(?:x|\\*)?\\W*d\\^?2\\W+(?:\\w+\\W+){0,4}constant", "inverse square", "proportional\\W+(?:\\w+\\W+){0,3}(?:1/d|1 over d)"] },
            ],
            sample: "The graph is a straight line through the origin. This shows that the irradiance is inversely proportional to the square of the distance, so I is proportional to 1/d².",
            model: "<ul><li>The graph is a straight line that passes through the origin (1)</li><li>So I is directly proportional to 1/d², that is, I ∝ 1/d² (inverse square law) (1)</li></ul><p>Finish the argument with the relationship stated. The gradient of the line is k, from I = k/d² (about 0.52 W).</p>",
          },
          {
            label: "(d)", type: "text", marks: 1, rows: 3, minWords: 4,
            q: "Suggest one change to the method that would make the results more reliable.",
            points: [
              { desc: "Repeat each reading (and take an average), or take readings at more distances",
                not: ["darken\\w*", "dark room"],
                any: [near("repeat\\w*|more|extra|several|multiple|three|average\\w*|mean|again", "readings?|measurements?|results?|trials?|distances?|data|average|times", 5)] },
            ],
            sample: "Repeat each reading and take an average of them.",
            model: "<p>Repeat the readings at each distance and take an average (1). Accept readings at more distances, or measuring from the lamp filament. The room is already darkened, so &quot;darken the room&quot; earns nothing.</p>",
          },
          {
            label: "(e)", type: "text", marks: 1, rows: 3, minWords: 6,
            q: "The lamp is replaced by a laser. Explain why the inverse square law does not apply to the light from a laser.",
            points: [
              { desc: "The laser beam is (almost) parallel and hardly spreads out, so the area it covers stays the same (it is not a point source)",
                not: ["(?:not|n't)\\W+(?:\\w+\\W+){0,2}(?:parallel|narrow|collimated)"],
                any: ["(?:laser|beam)\\W+(?:\\w+\\W+){0,6}(?:parallel|narrow|collimated|hardly spreads?|little spread|barely spreads?|doesn'?t spread|does not spread|not spread\\w*|doesn'?t diverge|does not diverge|not diverg\\w*|same (?:area|width|size))", "(?:parallel|collimated|doesn'?t spread|does not spread|not spread out|little spread|hardly spreads?|barely spreads?|no spreading)", "not a point source"] },
            ],
            sample: "A laser beam is almost parallel and hardly spreads out, so the power is not spread over a larger area as the distance increases.",
            model: "<p>The beam is parallel (does not spread out), so the area it covers does not increase with distance and the irradiance stays almost constant; it is not a point source (1).</p>",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-13 ------------------------------------------------------------------ */
      {
        id: "paw-13",
        style: "Context question · refraction in glass",
        stem:
          "<p>A designer is testing a sample of glass for a lighthouse lens. A narrow ray of red light is directed at the flat surface of a rectangular glass block, as shown. The angle between the incident ray and the surface of the glass is 35°. The wavelength of the light in air is 650 nm.</p>",
        figure: fig13,
        parts: [
          {
            label: "(a)", type: "calc", marks: 4, rows: 8,
            q: "Calculate the speed of the light in the glass.",
            steps: [
              { desc: "n = sin θ₁/sin θ₂ (angles measured from the normal)", rel: ["n=sin(?:θ|theta)[₁1i]/sin(?:θ|theta)[₂2r]", "n=sin\\(?\\d+°?\\)?/sin", "sin(?:θ|theta)[₁1i]/sin(?:θ|theta)[₂2r]=n", "n=sini/sinr", "n=sin[₁1]/sin[₂2]"] },
              { desc: "Substitution using θ₁ = 55° (not 35°) and θ₂ = 33°", nums: [[55, 0.819], [33, 0.545]] },
              { desc: "n = c/v (refractive index 1.50 found)", rel: ["n=c/v", "v=c/n", "n=3(?:\\.0+)?x10\\^?8/v", "v=3(?:\\.0+)?x10\\^?8/", "v=3e8/"] },
              { desc: "v = 2.0 × 10⁸ m s⁻¹", ans: 1.99464e8, alts: [2.0e8], sf: 2, unit: "m s-1" },
            ],
            sample: "θ₁ = 90 − 35 = 55°\nn = sin θ₁ / sin θ₂ = sin 55° / sin 33° = 0.819 / 0.545 = 1.50\nn = c / v\nv = 3.00 × 10⁸ / 1.50\nv = 2.0 × 10⁸ m s⁻¹",
            model: "<ul><li>n = sin θ₁ / sin θ₂ (1)</li><li>= sin 55° / sin 33° (1): the angle of incidence is measured from the <em>normal</em>, so it is 90° − 35° = 55°, not 35°</li><li>n = c/v, so v = 3.00 × 10⁸ / 1.50 (1)</li><li>v = 2.0 × 10⁸ m s⁻¹ (1)</li></ul><p>Using 35° gives n = 1.05 and v = 2.9 × 10⁸ m s⁻¹, a speed barely below the speed in air, which should have flagged the mistake. Accept n = 1.5.</p>",
          },
          {
            label: "(b)", type: "calc", marks: 3, rows: 6,
            q: "Calculate the wavelength of the light in the glass. Take the refractive index of the glass as 1.50.",
            steps: [
              { desc: "n = λ₁/λ₂ (sin θ₁/sin θ₂ = λ₁/λ₂)", rel: ["n=" + LAM + "[₁1]/" + LAM + "[₂2]", LAM + "[₁1]/" + LAM + "[₂2]=n", LAM + "[₂2]=" + LAM + "[₁1]/n", "n=" + LAM + "air/", "n=650/", "1\\.5=650"] },
              { desc: "Substitution: 1.50 = 650 / λ₂", nums: [1.5, 650] },
              { desc: "λ₂ = 433 nm", ans: 433.33, alts: [4.3333e-7], sf: 3, unit: ["nm", "m", "nanometres", "metres", "metre"] },
            ],
            sample: "n = λ₁ / λ₂\n1.50 = 650 / λ₂\nλ₂ = 433 nm",
            model: "<ul><li>n = λ₁/λ₂ (1)</li><li>1.50 = 650 / λ₂ (1)</li><li>λ₂ = 433 nm (4.33 × 10⁻⁷ m) (1)</li></ul><p>The wavelength falls because the light slows down.</p>",
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 2,
            q: "What happens to the frequency of the light as it enters the glass?",
            opts: ["It increases", "It decreases in proportion to the speed", "It stays the same", "It falls to zero", "It halves"],
            why: "The frequency is fixed by the source and the same number of waves per second leave the air as enter the glass, so the frequency is <strong>unchanged</strong>. Since v = fλ, the speed and the wavelength fall together.",
          },
        ],
      },
      /* ------------------------------------------------------------------ paw-14 ------------------------------------------------------------------ */
      {
        id: "paw-14",
        style: "Open-ended explanation · critical angle and total internal reflection",
        stem:
          "<p>A jeweller examines a diamond. Later, in a telecommunications lab, a technician works with a glass optical fibre. Both depend on light travelling from glass or diamond into air at large angles of incidence.</p>",
        parts: [
          {
            label: "(a)", type: "calc", marks: 3, rows: 5,
            q: "Calculate the critical angle for a diamond-to-air boundary. The refractive index of diamond is on the data sheet.",
            steps: [
              { desc: "sin θc = 1/n", rel: ["sin(?:θc|thetac|θ_c|c)=1/n", "sin(?:θc|thetac|θ_c)=1/2\\.42", "n=1/sin", "sin(?:θc|thetac)=1/", "sinc=1/n"] },
              { desc: "Substitution: sin θc = 1/2.42", nums: [2.42] },
              { desc: "θc = 24.4°", ans: 24.4075, abs: 0.2, sf: 3, unit: ["°", "degrees", "deg"] },
            ],
            sample: "sin θc = 1/n\nsin θc = 1/2.42 = 0.413\nθc = 24.4°",
            model: "<ul><li>sin θc = 1/n (1)</li><li>sin θc = 1/2.42 (1)</li><li>θc = 24.4° (1)</li></ul><p>The critical angle is the angle of incidence that gives an angle of refraction of 90°. The refractive index 2.42 for diamond is on the data sheet. Accept 24°.</p>",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 5, minWords: 10,
            q: "Use your answer to (a) to explain why a cut diamond sparkles.",
            points: [
              { desc: "The critical angle of diamond is small (24°), so light inside meets the surfaces at angles greater than it and is totally internally reflected",
                all: [near("critical angle|24", "small|low|smaller|lower|only|less", 6), "reflect\\w*|tir"], win: 220 },
              { desc: "So the light is reflected inside many times before it emerges, giving bright flashes of light from the faces",
                all: [near("many|multiple|several|repeated\\w*|again and again|bounce\\w*|back and forth|lots of|more than once", "times|reflections?|reflect\\w*|bounc\\w*", 4), "diamond|inside|within|internal|sparkle\\w*|emerg\\w*|escape|leav\\w*|out"], win: 200 },
            ],
            sample: "The critical angle of diamond is only 24°, which is small, so most of the light inside meets the faces at an angle of incidence greater than this and is totally internally reflected. The light is therefore reflected many times inside before it emerges, which gives the bright sparkle.",
            model: "<ul><li>Diamond has a small critical angle (24°), so most light inside has an angle of incidence greater than it and undergoes total internal reflection (1)</li><li>The light is reflected many times inside before it can leave, so it comes out of the faces in bright flashes (the sparkle) (1)</li></ul>",
          },
          {
            label: "(c)", type: "text", marks: 3, rows: 7, minWords: 12,
            q: "Explain how light travels along a glass optical fibre from one end to the other.",
            points: [
              { desc: "Light entering the end of the fibre strikes the boundary of the glass (and air or cladding) at an angle of incidence greater than the critical angle",
                any: [near("greater|larger|bigger|more|above|exceed\\w*|beyond", "critical angle", 6)] },
              { desc: "So total internal reflection occurs: all of the light is reflected back into the glass and none escapes",
                all: ["total(?:ly)? internal\\w*|tir"], win: 200 },
              { desc: "The light is reflected repeatedly from side to side, so it follows the fibre (even round bends) to the far end",
                any: [near("repeated\\w*|many times|again and again|multiple times|several times|bounc\\w*|back and forth|side to side|zig-?zag", "reflect\\w*|bounc\\w*|times|fibre|far end|other end|reach\\w*", 6)] },
            ],
            sample: "Light enters the end of the fibre and hits the boundary between the glass and the outside at an angle of incidence greater than the critical angle. Total internal reflection then occurs, so all of the light is reflected back into the glass and none escapes. The light is reflected again and again from side to side along the fibre until it reaches the far end.",
            model: "<ul><li>The light meets the glass boundary at an angle of incidence greater than the critical angle (1)</li><li>Total internal reflection: all the light is reflected back into the fibre, and none leaves (1)</li><li>This is repeated many times along the fibre, so the light travels to the other end (1)</li></ul><p>TIR can only happen when light travels from a more dense to a less dense medium (glass to air or cladding), never the other way.</p>",
          },
          {
            label: "(d)", type: "multi", marks: 2,
            q: "Which <strong>two</strong> conditions must both be met for total internal reflection at a boundary?",
            opts: ["The light travels from a more dense to a less dense medium", "The angle of incidence is greater than the critical angle", "The light travels from a less dense to a more dense medium", "The angle of incidence is less than the critical angle", "The light is of a single frequency"],
            a: [0, 1],
            why: "Total internal reflection needs light in the <strong>more dense</strong> medium meeting the boundary with the less dense one, at an angle of incidence <strong>greater than the critical angle</strong>. Going into a denser medium bends the ray towards the normal, so there is no critical angle. Below the critical angle some light is refracted out. A single frequency is not needed.",
          },
        ],
      },
    ],
  };
})();
