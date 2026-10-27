/* Past-paper practice: Digital & programmable electronics. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HEP_BANK = window.HEP_BANK || {});
  const R = String.raw;

  /* ---------- helpers for the marking patterns ---------- */
  /* near(a, b, n): regex source matching a and b in either order with at most n words between them. */
  const near = (a, b, n) => { const g = "\\W+(?:\\w+\\W+){0," + (n == null ? 3 : n) + "}"; return "\\b(?:" + a + ")\\b" + g + "\\b(?:" + b + ")\\b|\\b(?:" + b + ")\\b" + g + "\\b(?:" + a + ")\\b"; };

  /* ---------- helpers for the figures: logic gates, wires, labels ---------- */
  const INK = "#1d1a14", PAPER = "#fffaf0", RED = "#b3261e", GREY = "#cbbd9b";
  const svg = (w, h, label, body) =>
    `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" font-family="sans-serif"><rect width="${w}" height="${h}" fill="${PAPER}"/>${body}</svg>`;
  const tx = (x, y, s, a, extra) => `<text x="${x}" y="${y}" text-anchor="${a || "middle"}" font-size="14" fill="${INK}" ${extra || ""}>${s}</text>`;
  const wire = (pts, extra) => `<path d="M${pts.map((p) => p.join(" ")).join(" L")}" fill="none" stroke="${INK}" stroke-width="2" ${extra || ""}/>`;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="3.5" fill="${INK}"/>`;
  const arrowR = (x, y) => `<polygon points="${x},${y} ${x - 8},${y - 4} ${x - 8},${y + 4}" fill="${INK}"/>`;
  const arrowD = (x, y) => `<polygon points="${x},${y} ${x - 4},${y - 8} ${x + 4},${y - 8}" fill="${INK}"/>`;
  const arrowU = (x, y) => `<polygon points="${x},${y} ${x - 4},${y + 8} ${x + 4},${y + 8}" fill="${INK}"/>`;
  const style = `stroke="${INK}" stroke-width="2" fill="${PAPER}"`;
  /* gate(type, x, y): symbol with its top-left at (x, y), 40 high. Returns the markup, the input pins and the output pin. */
  const gate = (t, x, y) => {
    const AND = `M${x} ${y} H${x + 25} A20 20 0 0 1 ${x + 25} ${y + 40} H${x} Z`;
    const OR = `M${x} ${y} Q${x + 32} ${y} ${x + 50} ${y + 20} Q${x + 32} ${y + 40} ${x} ${y + 40} Q${x + 14} ${y + 20} ${x} ${y} Z`;
    const bub = (cx) => `<circle cx="${cx}" cy="${y + 20}" r="4" ${style}/>`;
    switch (t) {
      case "AND": return { s: `<path d="${AND}" ${style}/>`, ins: [[x, y + 10], [x, y + 30]], out: [x + 45, y + 20] };
      case "NAND": return { s: `<path d="${AND}" ${style}/>` + bub(x + 49), ins: [[x, y + 10], [x, y + 30]], out: [x + 53, y + 20] };
      case "OR": return { s: `<path d="${OR}" ${style}/>`, ins: [[x + 5, y + 10], [x + 5, y + 30]], out: [x + 50, y + 20] };
      case "NOR": return { s: `<path d="${OR}" ${style}/>` + bub(x + 54), ins: [[x + 5, y + 10], [x + 5, y + 30]], out: [x + 58, y + 20] };
      case "EOR": return { s: `<path d="${OR}" ${style}/><path d="M${x - 7} ${y} Q${x + 7} ${y + 20} ${x - 7} ${y + 40}" fill="none" stroke="${INK}" stroke-width="2"/>`, ins: [[x - 2, y + 10], [x - 2, y + 30]], out: [x + 50, y + 20] };
      case "NOT": return { s: `<path d="M${x} ${y + 5} L${x + 35} ${y + 20} L${x} ${y + 35} Z" ${style}/>` + bub(x + 39), ins: [[x, y + 20]], out: [x + 43, y + 20] };
      default: throw new Error("gate " + t);
    }
  };

  /* ---------- Figure: four gate symbols (dig-02) ---------- */
  const figSymbols = (() => {
    const g = [["EOR", 45, "P"], ["NAND", 165, "Q"], ["NOT", 290, "R"], ["NOR", 395, "S"]];
    let b = "";
    g.forEach(([t, x, lab]) => {
      const s = gate(t, x, 24);
      s.ins.forEach((p) => { b += wire([[p[0] - 22, p[1]], p]); });
      b += wire([s.out, [s.out[0] + 22, s.out[1]]]);
      b += s.s + tx(x + 25, 96, lab, "middle", 'font-weight="bold" font-size="16"');
    });
    return svg(480, 112, "Four logic gate symbols labelled P, Q, R and S. P is a two-input gate with a curved back and an extra curved line behind it. Q is a flat-backed two-input gate with a small circle on its output. R is a triangle with a small circle on its output and a single input. S is a curved-back two-input gate with a small circle on its output.", b);
  })();

  /* ---------- Figure: NOR + AND into an OR (dig-03) ---------- */
  const figCircuit = (() => {
    const nor = gate("NOR", 100, 20), and = gate("AND", 100, 110), or = gate("OR", 280, 62);
    let b = "";
    const lab = (y, s) => tx(26, y + 5, s, "end", 'font-weight="bold"');
    b += lab(30, "A") + wire([[34, 30], nor.ins[0]]) + lab(50, "B") + wire([[34, 50], nor.ins[1]]);
    b += lab(120, "C") + wire([[34, 120], and.ins[0]]) + lab(140, "D") + wire([[34, 140], and.ins[1]]);
    b += wire([nor.out, [230, nor.out[1]], [230, or.ins[0][1]], or.ins[0]]);
    b += wire([and.out, [230, and.out[1]], [230, or.ins[1][1]], or.ins[1]]);
    b += wire([or.out, [400, or.out[1]]]) + tx(412, or.out[1] + 5, "Q", "start", 'font-weight="bold" font-size="16"');
    b += nor.s + and.s + or.s;
    return svg(470, 170, "Logic diagram with four inputs A, B, C and D and one output Q. A and B feed a NOR gate. C and D feed an AND gate. The outputs of the NOR gate and the AND gate feed a two-input OR gate whose output is Q.", b);
  })();

  /* ---------- Figure: four-NAND exclusive OR (dig-06) ---------- */
  const figEor = (() => {
    const g1 = gate("NAND", 100, 80), g2 = gate("NAND", 230, 20), g3 = gate("NAND", 230, 140), g4 = gate("NAND", 370, 80);
    let b = "";
    b += tx(26, 35, "A", "end", 'font-weight="bold"') + tx(26, 175, "B", "end", 'font-weight="bold"');
    b += wire([[34, 30], g2.ins[0]]) + wire([[56, 30], [56, g1.ins[0][1]], g1.ins[0]]) + dot(56, 30);
    b += wire([[34, 170], g3.ins[1]]) + wire([[70, 170], [70, g1.ins[1][1]], g1.ins[1]]) + dot(70, 170);
    b += wire([g1.out, [190, g1.out[1]], [190, g2.ins[1][1]], g2.ins[1]]) + wire([[190, g1.out[1]], [190, g3.ins[0][1]], g3.ins[0]]) + dot(190, g1.out[1]);
    b += wire([g2.out, [340, g2.out[1]], [340, g4.ins[0][1]], g4.ins[0]]);
    b += wire([g3.out, [340, g3.out[1]], [340, g4.ins[1][1]], g4.ins[1]]);
    b += wire([g4.out, [455, g4.out[1]]]) + tx(466, g4.out[1] + 5, "Q", "start", 'font-weight="bold" font-size="16"');
    b += tx(172, 93, "X", "end", 'font-weight="bold"') + tx(312, 36, "P", "middle", 'font-weight="bold"') + tx(312, 156, "R", "middle", 'font-weight="bold"');
    b += g1.s + g2.s + g3.s + g4.s;
    b += tx(126, 134, "G1", "middle", 'font-size="12"') + tx(256, 74, "G2", "middle", 'font-size="12"') + tx(256, 194, "G3", "middle", 'font-size="12"') + tx(396, 134, "G4", "middle", 'font-size="12"');
    return svg(490, 204, "Logic diagram of four two-input NAND gates G1 to G4 with inputs A and B and output Q. G1 takes A and B and gives X. G2 takes A and X and gives P. G3 takes X and B and gives R. G4 takes P and R and gives Q.", b);
  })();

  /* ---------- flowchart shapes ---------- */
  const term = (cx, cy, s) => `<rect x="${cx - 40}" y="${cy - 14}" width="80" height="28" rx="14" ${style}/>` + tx(cx, cy + 5, s);
  const io = (cx, cy, w, s) => `<polygon points="${cx - w / 2 + 9},${cy - 15} ${cx + w / 2},${cy - 15} ${cx + w / 2 - 9},${cy + 15} ${cx - w / 2},${cy + 15}" ${style}/>` + tx(cx, cy + 5, s);
  const dec = (cx, cy, hw, hh, s) => `<polygon points="${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}" ${style}/>` + tx(cx, cy + 5, s);

  /* ---------- Figure: fan flowchart (dig-08) ---------- */
  const figFan = (() => {
    let b = "";
    // main spine at x = 170
    b += wire([[170, 44], [170, 66]]) + arrowD(170, 70);
    b += wire([[170, 100], [170, 118]]) + arrowD(170, 124);
    b += wire([[245, 164], [292, 164]]) + arrowR(296, 164) + tx(270, 156, "Yes", "middle", 'font-size="13"');
    b += wire([[170, 196], [170, 232]]) + arrowD(170, 238) + tx(186, 214, "No", "start", 'font-size="13"');
    b += wire([[170, 268], [170, 306]]);
    b += wire([[366, 179], [366, 306], [170, 306]]) + dot(170, 306);
    b += wire([[170, 306], [40, 306], [40, 85], [100, 85]]) + arrowR(104, 85);
    b += term(170, 30, "START") + io(170, 85, 130, "Read an1") + dec(170, 164, 75, 32, "an1 &gt; 153 ?") + io(366, 164, 130, "out1 = 1") + io(170, 253, 130, "out1 = 0");
    return svg(440, 330, "Flowchart of a fan controller. After START the program reads analogue input an1. A decision asks whether an1 is greater than 153. If Yes, output 1 is set to 1. If No, output 1 is set to 0. Both paths join and an arrow returns to the box that reads an1.", b);
  })();

  /* ---------- Figure: PWM waveform (dig-10) ---------- */
  const figPwm = (() => {
    const x0 = 70, px = 40, yH = 40, yL = 140;
    let b = "";
    for (let t = 0; t <= 9; t++) b += `<path d="M${x0 + t * px} ${yH - 8} V${yL}" stroke="${GREY}" stroke-width="1"/>` + tx(x0 + t * px, yL + 20, t);
    b += wire([[x0, yH - 20], [x0, yL], [x0 + 9 * px + 14, yL]]);
    b += tx(x0 - 8, yH + 5, "12 V", "end") + tx(x0 - 8, yL + 5, "0 V", "end");
    b += tx(x0 + 4.5 * px, yL + 42, "time t / ms");
    b += wire([[x0, yH], [x0 + 3 * px, yH], [x0 + 3 * px, yL], [x0 + 4 * px, yL], [x0 + 4 * px, yH], [x0 + 7 * px, yH], [x0 + 7 * px, yL], [x0 + 8 * px, yL], [x0 + 8 * px, yH], [x0 + 9 * px, yH]], `stroke="${RED}" stroke-width="3"`);
    b += tx(x0 - 8, yH - 22, "Motor voltage", "start", 'font-size="13"');
    return svg(470, 196, "Graph of a PWM signal. Motor voltage is plotted against time in milliseconds from 0 to 9. The voltage is 12 volts from 0 to 3 milliseconds, 0 volts from 3 to 4, 12 volts from 4 to 7, 0 volts from 7 to 8, and 12 volts again from 8 to 9 milliseconds.", b);
  })();

  /* ---------- Figure: greenhouse vent block diagram (dig-12) ---------- */
  const figVent = (() => {
    const nor = gate("NOR", 118, 30);
    let b = "";
    b += tx(26, 45, "R", "end", 'font-weight="bold"') + wire([[34, 40], nor.ins[0]]);
    b += tx(26, 65, "W", "end", 'font-weight="bold"') + wire([[34, 60], nor.ins[1]]);
    b += wire([nor.out, [210, nor.out[1]], [210, 60], [250, 60]]) + arrowR(254, 60);
    b += wire([[170, 150], [212, 150], [212, 140], [250, 140]]) + arrowR(254, 140);
    b += wire([[386, 100], [418, 100]]) + arrowR(422, 100);
    b += nor.s;
    b += `<rect x="254" y="30" width="132" height="140" ${style}/>` + tx(320, 132, "Micro-") + tx(320, 150, "controller");
    b += tx(262, 64, "in1", "start", 'font-size="13"') + tx(262, 144, "an1", "start", 'font-size="13"') + tx(378, 104, "out1", "end", 'font-size="13"');
    b += `<rect x="50" y="128" width="120" height="44" ${style}/>` + tx(110, 148, "Temperature") + tx(110, 164, "sensor");
    b += `<rect x="426" y="78" width="60" height="44" ${style}/>` + tx(456, 97, "Vent") + tx(456, 113, "motor");
    return svg(494, 190, "Block diagram of a greenhouse vent controller. Rain sensor R and wind sensor W feed a NOR gate whose output goes to input in1 of a microcontroller. A temperature sensor feeds analogue input an1. Output out1 of the microcontroller drives the vent motor.", b);
  })();

  /* digital-01(b): the wrong claim that a digital signal suffers more from noise */
  const DIG_WORSE = "\\bdigital(?:(?!\\banalogue\\b|\\bless\\b|\\bwhereas\\b|\\bwhile\\b|\\bbut\\b|\\bunlike\\b|\\bnot\\b|n't)[^.;]){0,100}?(?:\\b(?:more|worse|badly|bigger|greater)\\W+(?:\\w+\\W+){0,2}(?:affected|distorted|noisy|corrupted|changed|problem)|\\baffected\\W+(?:more|worse|badly)\\b)";

  /* digital-10(f): the wrong claim that the average voltage rises when the duty cycle is cut */
  const AV_RISES = "\\b(?:average|mean|effective)\\W+(?:\\w+\\W+){0,2}(?:voltage|volts?|power)\\W+(?:\\w+\\W+){0,2}(?:rise\\w*|increas\\w*|goes up|go up|gets? (?:higher|bigger|larger))\\W+(?:\\w+\\W+){0,4}(?:when|as|because|if|since)\\W+(?:\\w+\\W+){0,4}(?:duty|pulse|on.?time)\\W+(?:\\w+\\W+){0,4}(?:reduc\\w*|lower\\w*|fall\\w*|decreas\\w*|smaller|less|cut)";

  /* digital-11(c): the wrong claim that PWM (the transistor) is the one that wastes the power */
  const PWM_WASTES = "\\b(?:pwm|transistor|switching)\\W+(?:(?:(?!\\b(?:not|never|little|less|no|hardly|almost|barely|fewer|minimal|negligible|tiny|small|only|very|lower|than)\\b|n't)\\w+\\W+)){0,4}(?:wastes?|loses|dissipates|gets hot|heats(?: up)?|uses more)\\b";

  /* digital-12(d): the reversed claim that in1 = 1 closes the vent */
  const IN1_REV = "\\b(?:in1|input 1|input one)\\W+(?:is |= ?|equals |has |gets )?(?:1|high)\\b\\W+(?:\\w+\\W+){0,4}?(?:closed?|shut|closes)\\b";

  /* digital-06(c): building blocks for the per-gate trace patterns */
  const NAND_G1 = "\\b(?:g1|gate 1|gate one|first|1st|left|top left|first nand|first gate)\\b";
  const GATE4 = "(?:g4|gate 4|gate four|last|final|4th|fourth|right(?:-hand)?|output gate)";
  const OUTV = "(?:output|outputs|give|gives|go|goes|become|becomes|are|is|=|make|makes|produce|produces)";
  const FILL = "(?:both|each|also|then|now|all|of|them|they|it|will|be|a|an|the|output|outputs|go|goes|are|is|become|becomes|to|equal|equals)";
  const P1 = "\\bp\\W+(?:(?:is|are|=|equals|goes|becomes|gives|will be|now|also|then)\\W+){0,2}(?:1|high|one)\\b";
  const R1 = "\\br\\W+(?:(?:is|are|=|equals|goes|becomes|gives|will be|now|also|then)\\W+){0,2}(?:1|high|one)\\b";

  /* ---------- text-answer building blocks ---------- */
  const NEGW = "not|never|does ?n'?t|do ?n'?t|isn'?t|aren'?t|won'?t|wasn'?t|didn'?t|wouldn'?t";

  B.digital = {
    intro:
      "Digital and programmable electronics is worth <strong>15 to 25 marks</strong> of the paper (the course range is 15 to 30), and the marks are there to be taken: truth tables, expressions and flowcharts reward a tidy method. Fourteen questions, 80 marks: analogue against digital, the six gates and the route from specification to circuit, NAND-only equivalents and counting chips, the ADC, reading and fixing programs, PWM and why it beats a series resistor, and a combined logic-plus-microcontroller system. Written answers need a <strong>cause and an effect</strong> with the direction of every change, and a count of <em>chips</em> is not a count of <em>gates</em>.",
    questions: [
      /* ------------------------------------------------------------------ */
      {
        id: "digital-01",
        style: "Section 1 · short answer · analogue and digital signals",
        stem:
          "<p>A boiler-room monitoring system sends two kinds of signal to the control room. One is the output of a temperature sensor, whose voltage rises smoothly as the water warms. The other is the output of a door switch, which is either open or closed.</p>",
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 1,
            q: "Which of these is an <strong>analogue</strong> signal?",
            opts: [
              "The door switch output, which is 0 V when open and 5 V when closed",
              "The sensor voltage, which can take any value from 0 V to 5 V",
              "A lamp indicator that is either lit or dark, never in between",
              "The output of a logic gate, which is always either high or low",
            ],
            why: "An analogue signal can take any value in a range, like the smoothly changing sensor voltage. The other three each have only two possible states, so they are digital.",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Explain why a digital signal is less affected by electrical noise than an analogue signal.",
            minWords: 10,
            points: [
              { desc: "A digital signal has only two levels, so the receiver only has to decide high or low and a small amount of noise leaves that decision unchanged", group: "d",
                not: ["\\bdigital\\W+(?:\\w+\\W+){0,6}(?:more|worse|badly)\\W+(?:\\w+\\W+){0,2}(?:affected|distorted|noisy|corrupted)", DIG_WORSE, "\\banalogue\\W+(?:\\w+\\W+){0,4}(?:only|just)\\W+(?:\\w+\\W+){0,2}(?:two|2)\\W+(?:\\w+\\W+){0,1}(?:levels?|values?|states?)", "\\bdigital\\W+(?:\\w+\\W+){0,4}(?:any|every|all|infinite|continuous\\w*)\\W+(?:\\w+\\W+){0,2}(?:values?|levels?|voltages?)"],
                any: [
                  "\\b(?:only|just)\\W+(?:\\w+\\W+){0,2}(?:two|2|binary)\\W+(?:\\w+\\W+){0,2}(?:levels?|values?|states?|voltages?)",
                  "\\b(?:two|2)\\W+(?:\\w+\\W+){0,1}(?:levels?|values?|states?|voltages?)\\b",
                  "\\b(?:decide|decides|decision|distinguish\\w*|tell|judge|choose|chooses|determine|recogni[sz]e|detect|detects)\\W+(?:\\w+\\W+){0,8}(?:high|low|on|off|0|1|zero|one|nearer)\\b",
                  "\\b(?:noise|interference|wobbles?|distortion|errors?)\\W+(?:\\w+\\W+){0,6}(?:ignored|rejected|removed|cleaned|filtered|tolerated|does ?n'?t matter|does not matter|makes no difference|ignore)",
                  "\\b(?:still|easily|clearly)\\W+(?:\\w+\\W+){0,2}(?:recogni[sz]\\w*|read|detect\\w*|identif\\w*|understood)",
                  "\\b(?:either|always|only)\\W+(?:\\w+\\W+){0,3}(?:on|high|1)\\W+or\\W+(?:\\w+\\W+){0,2}(?:off|low|0)\\b",
                ] },
              { desc: "Noise added to an analogue signal changes its value (which carries the information), so the message is distorted", group: "a",
                not: [DIG_WORSE],
                any: [
                  "\\banalogue\\W+(?:\\w+\\W+){0,12}(?:distort\\w*|corrupt\\w*|chang\\w*|alter\\w*|degrad\\w*|inaccura\\w*|errors?|wrong|incorrect|noisy|wobbl\\w*|fuzz\\w*|interfer\\w*|picks? up|pick\\w* up|inherit\\w*)",
                  "\\b(?:noise|interference)\\W+(?:\\w+\\W+){0,8}(?:changes?|alters?|distort\\w*|corrupt\\w*|adds?|added|becomes?|part of|mixed|errors?|wrong|picked|permanent\\w*)\\W+(?:\\w+\\W+){0,6}(?:analogue|signal|voltage|value|information|message|reading)",
                  "\\b(?:analogue|signal|voltage|value|information|message|reading)\\W+(?:\\w+\\W+){0,6}(?:changes?|altered|distorted|corrupted|damaged|errors?)\\W+(?:\\w+\\W+){0,6}(?:noise|interference)",
                ] },
            ],
            sample: "A digital signal has only two levels, so the receiver only has to decide whether it is high or low, and a small amount of noise leaves that decision unchanged. Noise added to an analogue signal changes its voltage, which carries the information, so the message is distorted.",
            model: "<ul><li>A digital signal has only two levels (high and low), so the receiver only has to decide which one it is and small noise does not change that decision (1)</li><li>Noise added to an analogue signal alters the voltage, which is the information itself, and it cannot be separated from the signal again, so the signal is distorted (1)</li></ul><p>Also acceptable: noise can be removed or ignored in a digital signal but not in an analogue one. Do not accept &quot;digital is faster&quot; or &quot;digital uses less power&quot;; a bare &quot;digital is more accurate&quot; earns nothing.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-02",
        style: "Section 1 · short answer · gate symbols and truth tables",
        stem:
          "<p>Figure 1 shows four logic gate symbols from the control board of a dockside conveyor.</p>",
        figure: figSymbols,
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: "Match each symbol to the name of its gate.",
            pairs: [
              ["Symbol P", "EOR (exclusive OR)"],
              ["Symbol Q", "NAND"],
              ["Symbol R", "NOT"],
              ["Symbol S", "NOR"],
            ],
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 2,
            q: "A four-input NOR gate has a truth table with 16 rows. In how many of those rows is the output 1?",
            opts: ["16", "8", "1", "15"],
            why: "A NOR is an OR followed by a NOT. Its output is 1 only when every input is 0, which is one row out of the 16 (0000). The other 15 rows have at least one input at 1 and give 0.",
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-03",
        style: "Section 2 · context question · read a logic diagram",
        stem:
          "<p>A warning lamp <strong>Q</strong> on a cargo hoist is controlled by four switches A, B, C and D (1 means the switch is pressed). The logic circuit is shown in Figure 2.</p>",
        figure: figCircuit,
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 0,
            q: "Which Boolean expression describes the output $Q$?",
            opts: [R`$Q = \overline{A + B} + C \cdot D$`, R`$Q = \overline{A \cdot B} + C \cdot D$`, R`$Q = \overline{A + B} \cdot C \cdot D$`, R`$Q = \overline{A + B + C \cdot D}$`],
            why: R`The NOR gives $\overline{A + B}$, the AND gives $C \cdot D$, and the last gate is an OR that adds them. The second option has a NAND where the diagram has a NOR. The third ANDs the two results instead of ORing them. The fourth inverts the whole sum, which would need a NOR as the last gate.`,
          },
          {
            label: "(b)", type: "multi", marks: 3,
            q: "Choose the <strong>three</strong> input combinations that make $Q = 1$.",
            opts: ["A = 1, B = 0, C = 1, D = 0", "A = 0, B = 0, C = 1, D = 0", "A = 1, B = 1, C = 1, D = 1", "A = 0, B = 1, C = 0, D = 1", "A = 1, B = 1, C = 1, D = 0", "A = 1, B = 0, C = 1, D = 1"],
            a: [1, 2, 5],
            why: R`Test each: option 2 (0010) has $A = B = 0$, so the NOR gives 1 and $Q = 1$. Option 3 (1111) has $C = D = 1$, so the AND gives 1. Option 6 (1011) also has $C = D = 1$. Options 1, 4 and 5 have a 1 on A or B, so the NOR gives 0, and the AND has a 0 input (C and D are not both 1), so $Q = 0$.`,
          },
          {
            label: "(c)", type: "num", marks: 1, a: 7, tol: 0, unit: "rows",
            q: "The full truth table has 16 rows. In how many rows is $Q = 1$?",
            why: R`The NOR gives 1 when $A = B = 0$: 4 rows (any C, D). The AND gives 1 when $C = D = 1$: 4 rows (any A, B). The row 0011 is in both lists, so it is counted once: $4 + 4 - 1 = 7$ rows (1).`,
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-04",
        style: "Section 2 · context question · truth table to expression",
        stem:
          "<p>The engine-room fire alarm on HMS Ratchet has three smoke detectors A, B and C (1 means the detector sees smoke). The alarm <strong>Q</strong> must sound when <strong>at least two</strong> of the three detectors see smoke, so that one faulty detector cannot cause a false alarm. The truth table is:</p>" +
          `<div class="table-wrap"><table style="max-width:20em"><thead><tr><th>A</th><th>B</th><th>C</th><th>Q</th></tr></thead><tbody><tr><td>0</td><td>0</td><td>0</td><td>0</td></tr><tr><td>0</td><td>0</td><td>1</td><td>0</td></tr><tr><td>0</td><td>1</td><td>0</td><td>0</td></tr><tr><td>0</td><td>1</td><td>1</td><td>1</td></tr><tr><td>1</td><td>0</td><td>0</td><td>0</td></tr><tr><td>1</td><td>0</td><td>1</td><td>1</td></tr><tr><td>1</td><td>1</td><td>0</td><td>1</td></tr><tr><td>1</td><td>1</td><td>1</td><td>1</td></tr></tbody></table></div>`,
        parts: [
          {
            label: "(a)", type: "match", marks: 3,
            q: "In the sum of products, each row with $Q = 1$ gets one AND term. Match each term to the row that switches it on.",
            pairs: [
              ["NOT A AND B AND C", "A = 0, B = 1, C = 1"],
              ["A AND NOT B AND C", "A = 1, B = 0, C = 1"],
              ["A AND B AND NOT C", "A = 1, B = 1, C = 0"],
            ],
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 2,
            q: "Which expression is the complete sum of products for $Q$?",
            opts: [
              R`$Q = \overline{A}\cdot\overline{B}\cdot\overline{C} + \overline{A}\cdot\overline{B}\cdot C + \overline{A}\cdot B\cdot\overline{C} + A\cdot\overline{B}\cdot\overline{C}$`,
              R`$Q = A + B + C$`,
              R`$Q = \overline{A}\cdot B\cdot C + A\cdot\overline{B}\cdot C + A\cdot B\cdot\overline{C} + A\cdot B\cdot C$`,
              R`$Q = A\cdot B\cdot C$`,
            ],
            why: R`There is one AND term for each of the four rows with $Q = 1$ (011, 101, 110 and 111), with a bar wherever the row has a 0. The first option is built from the rows where $Q = 0$. $A + B + C$ would sound the alarm for a single detector, and $A\cdot B\cdot C$ only when all three see smoke.`,
          },
          {
            label: "(c)", type: "num", marks: 1, a: 2, tol: 0, unit: "ICs",
            q: R`The expression simplifies to $Q = A\cdot B + A\cdot C + B\cdot C$. Built from NAND gates only, this needs three 2-input NAND gates feeding one 3-input NAND gate. The 74HC00 is a quad 2-input NAND and the 74HC10 is a triple 3-input NAND. How many integrated circuits are needed?`,
            why: R`Three 2-input NANDs fit on one 74HC00 (it holds four) (1). The single 3-input NAND needs one 74HC10. Total: <strong>2 ICs</strong>. The answer is not 4: that counts gates, not chips.`,
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 3,
            q: "Give <strong>two</strong> reasons why the simplified expression is preferred when the alarm circuit is built.",
            minWords: 6,
            points: [
              { desc: "It needs fewer gates or fewer integrated circuits", group: "f",
                not: ["\\b(?:more|extra|additional)\\W+(?:\\w+\\W+){0,2}(?:gates?|ics?|chips?|components?)"],
                any: ["\\b(?:fewer|less|smaller number of|reduced number of|lower number of|minimum|least|minimi[sz]\\w*)\\W+(?:\\w+\\W+){0,3}(?:gates?|ics?|chips?|components?|nand|parts)", "\\b(?:gates?|ics?|chips?|components?)\\W+(?:\\w+\\W+){0,3}(?:fewer|reduced|saved|less)", "\\bneeds? (?:less|fewer)\\b", "\\bsimpler\\W+(?:\\w+\\W+){0,2}circuit"] },
              { desc: "Lower cost", group: "c",
                not: ["\\b(?:more|most)\\W+(?:\\w+\\W+){0,2}(?:expensive|costly)", "\\bcost\\w*\\W+(?:\\w+\\W+){0,1}(?:more|higher|extra|increas\\w*)", "\\b(?:higher|more|extra|increased)\\W+(?:\\w+\\W+){0,1}cost"],
                any: ["\\b(?:cheaper|cheap|cost\\w*|price|inexpensive|economical|saves?\\W+(?:\\w+\\W+){0,1}money|less expensive)\\b"] },
              { desc: "Smaller board, less power, fewer connections or easier to build", group: "s",
                any: ["\\b(?:smaller|less|reduced|compact|saves?)\\W+(?:\\w+\\W+){0,2}(?:board|space|power|area|size|wiring|connections|joints|energy|room)", "\\b(?:quicker|faster|easier|simpler)\\W+(?:\\w+\\W+){0,3}(?:build|built|make|made|manufactur\\w*|assembl\\w*|solder\\w*|design\\w*|test\\w*|wire\\w*)", "\\b(?:board|space|size|area|circuit|chip)\\W+(?:\\w+\\W+){0,3}(?:smaller|compact|reduced)\\b", "\\bfewer\\W+(?:\\w+\\W+){0,2}(?:joints|connections|wires|faults|errors|solder\\w*)", "\\b(?:less|fewer) (?:to go wrong|chance of)"] },
            ],
            sample: "It needs fewer gates, so fewer integrated circuits are used and the circuit is cheaper to make. The board is also smaller and uses less power.",
            model: "<ul><li>Fewer gates, so fewer ICs (1)</li><li>A second consequence: lower cost, a smaller board, less power, fewer soldered joints, or quicker or easier manufacture (1)</li></ul><p>The two marks must be two different reasons. Do not accept &quot;it is easier to understand&quot; or &quot;it is faster to write down&quot;.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-05",
        style: "Section 2 · context question · NAND equivalents and counting ICs",
        stem:
          "<p>The control board of an Orkney ferry loading ramp has been converted to NAND gates only. The converted circuit needs <strong>7</strong> two-input NAND gates, <strong>2</strong> three-input NAND gates and <strong>1</strong> four-input NAND gate. The chips available, with their price each, are:</p>" +
          `<div class="table-wrap"><table style="max-width:32em"><thead><tr><th>Chip</th><th>Contains</th><th>Price</th></tr></thead><tbody><tr><td>74HC00</td><td>four 2-input NAND gates</td><td>£0.42</td></tr><tr><td>74HC10</td><td>three 3-input NAND gates</td><td>£0.38</td></tr><tr><td>74HC20</td><td>two 4-input NAND gates</td><td>£0.40</td></tr></tbody></table></div>`,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 4, tol: 0, unit: "ICs",
            q: "How many integrated circuits are needed to build the converted circuit?",
            why: R`2-input gates: $7 \div 4 = 1.75$, so two 74HC00 chips (1). 3-input gates: $2 \div 3$, so one 74HC10. 4-input gate: $1 \div 2$, so one 74HC20. Total $2 + 1 + 1 = $ <strong>4 ICs</strong>. Chips are bought whole, so each size is rounded up separately. Ten gates divided by four per chip is the wrong method.`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 1.62, tol: 0.004, unit: "£",
            q: "Calculate the total cost of the chips, in pounds (£).",
            why: R`Cost $= 2 \times 0.42 + 0.38 + 0.40$ (1) $= 0.84 + 0.78$ = <strong>£1.62</strong> (1). The two 74HC00 chips are both paid for in full, even though the second is only partly used.`,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 1,
            q: "One of the three gates on the 74HC10 is spare. The designer wants to use it as a NOT gate. What should be done?",
            opts: [
              "Leave two of its inputs unconnected and use the third",
              "Join all three inputs together and use them as one input",
              "Connect two of its inputs to 0 V and use the third as the input",
              "A 3-input gate can never be used as a NOT gate whatever is done",
            ],
            why: R`With all inputs joined, a NAND gives $\overline{A \cdot A \cdot A} = \overline{A}$, which is a NOT. Unconnected inputs float and give unreliable behaviour. Inputs held at 0 V make the output 1 whatever the third input does.`,
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-06",
        style: "Section 2 · context question · NAND-only circuit",
        stem:
          "<p>A designer builds a circuit from four 2-input NAND gates, as shown in Figure 3. It has inputs A and B and output Q.</p>",
        figure: figEor,
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 3,
            q: "Which <strong>single</strong> logic gate does this circuit behave as?",
            opts: ["AND", "OR", "NOR", "EOR"],
            why: R`Test the rows. A = 0, B = 0 gives X = 1, P = 1, R = 1 and Q = 0. A = 1, B = 0 gives X = 1, P = 0, R = 1 and Q = 1. A = 0, B = 1 gives Q = 1 in the same way. A = 1, B = 1 gives X = 0, P = R = 1 and Q = 0. Q = 1 only when the inputs differ, which is an EOR.`,
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 0,
            q: "All four gates are 2-input NANDs. How many 74HC00 chips (quad 2-input NAND) does the circuit need?",
            opts: ["1", "2", "4", "8"],
            why: "A 74HC00 holds four 2-input NAND gates, and this circuit has exactly four, so one chip is enough.",
          },
          {
            label: "(c)", type: "text", marks: 3, rows: 6,
            q: "Explain, gate by gate, why the output $Q$ is 0 when $A$ and $B$ are both 1.",
            minWords: 14,
            points: [
              { desc: "G1 has both inputs at 1, so its output X is 0",
                not: ["\\bx\\W+(?:(?:is|=|equals|goes|becomes|gives|now)\\W+){0,2}(?:high|1|one)\\b", NAND_G1 + "[^.;]{0,50}?\\b(?:gives?|outputs?)\\W+(?:(?:a|an|the)\\W+)?(?:1|high|one)\\b"],
                any: [
                  "\\bx\\b[^.;]{0,24}?\\b(?:0|zero|low)\\b",
                  NAND_G1 + "[^.;]{0,60}?\\b(?:0|zero|low)\\b",
                  NAND_G1 + "[^.;]{0,50}?\\b(?:both|two)\\W+(?:\\w+\\W+){0,3}(?:1|high|one|1s|ones)\\b",
                ] },
              { desc: "G2 and G3 each have an input at 0 (from X), so both outputs P and R are 1",
                any: [
                  P1 + "[\\s\\S]{0,100}?" + R1,
                  R1 + "[\\s\\S]{0,100}?" + P1,
                  "\\b(?:p|g2|gate 2|gate two)\\W+(?:and|&)\\W+(?:r|g3|gate 3|gate three)\\b[^.;]{0,60}?\\b" + OUTV + "\\b(?:\\W+" + FILL + "){0,6}\\W+(?:1|high|one)\\b",
                  "\\b(?:top and bottom|upper and lower|second and third|2nd and 3rd|middle|other two|remaining two|two middle|both of the others)\\W+(?:\\w+\\W+){0,4}?(?:gates?|nands?)?\\b[^.;]{0,40}?\\b" + OUTV + "\\b(?:\\W+" + FILL + "){0,6}\\W+(?:1|high|one)\\b",
                  "\\b(?:g2|gate 2|gate two)\\W+(?:(?:output|outputs|gives?|is|=|goes|will output|now|also|then)\\W+){1,2}(?:1|high|one)\\b[\\s\\S]{0,100}?\\b(?:g3|gate 3|gate three)\\W+(?:(?:output|outputs|gives?|is|=|goes|will output|now|also|then)\\W+){1,2}(?:1|high|one)\\b",
                  "\\b(?:one input|an input|input)\\W+(?:\\w+\\W+){0,4}(?:0|low|zero)\\W+(?:\\w+\\W+){0,6}(?:output|outputs|gives|so)\\W+(?:\\w+\\W+){0,2}(?:1|high|one)\\b",
                ] },
              { desc: "G4 has both inputs at 1, so Q is 0",
                not: ["\\bq\\W+(?:(?:is|=|equals|goes|becomes|gives|will be|now|also|then)\\W+){0,2}(?:1|high|one)\\b"],
                any: [
                  "\\b" + GATE4 + "\\b[^.;]{0,50}?\\b(?:both|two)\\W+(?:\\w+\\W+){0,3}(?:1|high|one|1s|ones)\\b",
                  "\\b" + GATE4 + "\\b[^.;]{0,50}?\\b(?:output|outputs|gives?|giving|q)\\b\\W+(?:(?:is|=|equals|goes|becomes|will be|now|also|then|a)\\W+){0,2}(?:0|zero|low)\\b",
                  "\\bp\\W+(?:and|&)\\W+r\\W+(?:\\w+\\W+){0,6}(?:both|1|high)\\W+(?:\\w+\\W+){0,10}(?:q|output)\\W+(?:\\w+\\W+){0,3}(?:0|zero|low)\\b",
                  "\\bq\\W+(?:\\w+\\W+){0,3}(?:0|zero|low)\\W+(?:\\w+\\W+){0,3}(?:because|since|as)\\W+(?:\\w+\\W+){0,8}(?:both|p|r)\\W+(?:\\w+\\W+){0,8}(?:1|high|one)\\b",
                ] },
            ],
            sample: "G1 has both of its inputs at 1, so its output X is 0. G2 and G3 each have X at 0 as one input, so their outputs P and R are both 1. G4 then has both inputs at 1, so its output Q is 0.",
            model: "<ul><li>G1 has both inputs at 1, so X is 0 (1)</li><li>G2 and G3 each have X (0) as an input, so P and R are both 1 (1)</li><li>G4 has both inputs at 1, so Q is 0 (1)</li></ul><p>A NAND gives 0 only when all inputs are 1, and 1 if any input is 0. Also acceptable: a full row of the working shown as a table with columns A, B, X, P, R, Q. Stating only &quot;it is an EOR&quot; earns nothing.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-07",
        style: "Section 2 · context question · calculate · analogue-to-digital converter",
        stem:
          "<p>A greenhouse on Orkney is controlled by a microcontroller. A thermistor circuit gives a voltage from 0 V to 5 V, which is connected to analogue input an1. The microcontroller uses an <strong>8-bit</strong> ADC: 0 V gives a reading of 0 and 5 V gives a reading of 255.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 256, tol: 0, unit: "values",
            q: "How many different readings can the 8-bit ADC give (counting 0)?",
            why: R`An 8-bit number has $2^8 = $ <strong>256</strong> possible values, from 0 to 255.`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 153, tol: 0, unit: "",
            q: "The sensor voltage is 3.00 V. Calculate the ADC reading.",
            why: R`$\text{reading} = \dfrac{3.00}{5.00} \times 255$ (1) $= 0.6 \times 255 = $ <strong>153</strong> (1).`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 2.0, tol: 0.004, unit: "V",
            q: "The ADC reading is 102. Calculate the sensor voltage, in volts.",
            why: R`$V = \dfrac{102}{255} \times 5.00$ (1) $= 0.4 \times 5.00 = $ <strong>2.00 V</strong> (1).`,
          },
          {
            label: "(d)", type: "num", marks: 2, a: 19.6078, tol: 0.06, alts: [20], unit: "mV",
            q: "What is the smallest change in the sensor voltage that can change the reading by one step? Give your answer in millivolts (mV).",
            why: R`One step $= \dfrac{5.00\ \text{V}}{255}$ (1) $= 0.0196\ \text{V} = $ <strong>19.6 mV</strong> (1). Dividing by 256 is a slip: the 255 steps span the full 5 V.`,
          },
          {
            label: "(e)", type: "mcq", marks: 1, a: 0,
            q: "The 8-bit ADC is replaced by a 10-bit ADC on the same 0 V to 5 V range. What is the effect?",
            opts: [
              "Each step is smaller, so the voltage is measured more precisely",
              "The ADC can now measure voltages as high as 10 V instead of only 5 V",
              "The readings now run from 0 up to 511 instead of 0 to 255",
              "The ADC now converts a number from the program into a voltage",
            ],
            why: R`A 10-bit ADC has $2^{10} = 1024$ readings (0 to 1023) over the same 5 V, so each step is about 4.9 mV instead of 19.6 mV. The voltage range is set by the supply, not the bits, and an ADC always converts a voltage to a number.`,
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-08",
        style: "Section 2 · context question · flowchart and scaling",
        stem:
          "<p>A polytunnel fan is controlled by a microcontroller. A temperature sensor is connected to analogue input an1, which gives 0 to 255 for 0 °C to 100 °C. The fan is connected to output 1. The control program is shown as a flowchart in Figure 4.</p>",
        figure: figFan,
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 60, tol: 0.05, unit: "°C",
            q: "Calculate the temperature, in °C, at which the fan switches on.",
            why: R`$\text{temp} = 153 \times 100 \div 255$ (1) $= $ <strong>60 °C</strong> (1). The fan switches on once the reading is above 153, so just above 60 °C.`,
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Describe what the program in Figure 4 does.",
            minWords: 10,
            points: [
              { desc: "It keeps repeating: reads or checks the sensor over and over in a loop",
                all: ["\\b(?:repeat\\w*|continu\\w*|loop\\w*|over and over|again and again|keeps? (?:on )?(?:checking|reading|monitoring|testing|going)|constantly|all the time|forever|for ever|always (?:checking|reading|monitoring|testing)|goes? back|going back|returns? to|returning to|back to (?:read|the start|the top|the beginning)|reads?\\W+(?:\\w+\\W+){0,2}again)\\b", "\\b(?:read\\w*|check\\w*|monitor\\w*|test\\w*|measur\\w*|compar\\w*|look\\w*|scan\\w*|poll\\w*)\\b"] },
              { desc: "The fan is switched on (out1 = 1) when an1 is above 153 (the temperature is above 60 °C)",
                not: ["\\b(?:not|n't|never|no)\\W+(?:\\w+\\W+){0,2}(?:on|start\\w*|run\\w*|switch\\w* on|turn\\w* on|work\\w*)\\b", "\\b(?:off|stops?|0)\\W+(?:when|if|once|as soon as)\\W+(?:\\w+\\W+){0,3}(?:above|over|greater|higher|hotter|>)", "(?:above|over|greater|more than|higher|hotter|>)(?:(?!\\b(?:on|runs?|starts?|otherwise|else|below|under|lower)\\b)[^.;]){0,40}\\b(?:off|stops?|switch\\w* off|turn\\w* off)\\b"],
                negOK: true, all: ["\\bfan\\b"], any: [
                  "(?:above|over|greater|more than|higher|exceeds?|hotter|>|too hot|too high|rises? (?:above|over|past))[^.;!?]{0,60}(?:on|(?:out1|output 1)\\W+(?:\\w+\\W+){0,2}1|start\\w*|run\\w*|switch\\w* on|turn\\w* on)\\b",
                  "\\b(?:on|(?:out1|output 1)\\W+(?:\\w+\\W+){0,2}1|starts?|runs?|switch\\w* on|switched on|turn\\w* on|turned on)[^.;!?]{0,60}(?:above|over|greater|more than|higher|exceeds?|hotter|>|too hot|too high)",
                ] },
              { desc: "The fan is switched off (out1 = 0) when an1 is not above 153 (the temperature is lower)",
                not: ["(?:above|over|greater|more than|higher|exceeds?|hotter|>|too hot|too high)(?:(?!\\b(?:otherwise|else|if not|but|whereas|while|not|on|runs?|starts?|below|under|less|lower|cooler|colder)\\b|n't|<)[^.;]){0,60}\\b(?:off|stops?|switch\\w* off|turn\\w* off|(?:out1|output 1)\\W+(?:\\w+\\W+){0,2}0)\\b", "\\b(?:not|n't|never|no)\\W+(?:\\w+\\W+){0,2}(?:off|stop\\w*|switch\\w* off|turn\\w* off)\\b", "\\b(?:on|runs?|starts?)\\W+(?:when|if|once|as soon as)\\W+(?:\\w+\\W+){0,3}(?:below|under|less|lower|cooler|colder|<)", "(?:below|under|less|lower|cooler|colder|<)(?:(?!\\b(?:off|stops?|otherwise|else|above|over|greater)\\b)[^.;]){0,40}\\b(?:on|runs?|starts?|switch\\w* on|turn\\w* on)\\b"],
                negOK: true, all: ["\\bfan\\b"], any: [
                  "(?:otherwise|else|if not|below|less|lower|under|cooler|colder|<|153 or less|not (?:above|over|greater|hot))[^.;!?]{0,60}(?:off|(?:out1|output 1)\\W+(?:\\w+\\W+){0,2}0|stop\\w*|switch\\w* off|turn\\w* off)\\b",
                  "\\b(?:off|(?:out1|output 1)\\W+(?:\\w+\\W+){0,2}0|stops?|switch\\w* off|switched off|turn\\w* off|turned off)[^.;!?]{0,60}(?:otherwise|else|if not|below|less|lower|under|cooler|colder)",
                ] },
            ],
            sample: "The program loops continuously, reading the sensor on an1 each time round. When an1 is greater than 153 the fan is switched on, with out1 set to 1. When an1 is 153 or less the fan is switched off, with out1 set to 0.",
            model: "<ul><li>The program loops continuously, reading (or checking) the sensor on an1 each time round (1)</li><li>If an1 is greater than 153 (above 60 °C) the fan is switched on, out1 = 1; otherwise (153 or below) the fan is switched off, out1 = 0 (1)</li></ul><p>Both branches are needed for the second mark. Do not accept &quot;it turns the fan on&quot; with no condition.</p>",
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 2,
            q: "The arrow that returns to the box <em>Read an1</em> is removed from the flowchart. What would the program then do?",
            opts: [
              "Keep the fan switched on for ever, whatever the temperature reads",
              "Run the loop twice and then stop with the fan in its last state",
              "Read the sensor once, set the fan and stop, ignoring changes",
              "Switch the fan off for good, whatever the temperature reads",
            ],
            why: "Without the return arrow the flow reaches the end of the chart and the program stops. The fan would stay in whatever state it was set to, however the temperature changed afterwards. A control program needs its loop to go on watching the inputs.",
          },
          {
            label: "(d)", type: "num", marks: 2, a: 78.4314, tol: 0.06, unit: "°C",
            q: "The ADC reads 200. Calculate the temperature, in °C, to one decimal place.",
            why: R`$\text{temp} = 200 \times 100 \div 255$ (1) $= $ <strong>78.4 °C</strong> (1). Multiply first and divide last, and round only at the end.`,
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-09",
        style: "Section 2 · context question · reading a program, fault finding",
        stem:
          "<p>The signal lamp on output 1 of a cadet training boat must flash <strong>four</strong> times, each flash being 0.5 s on and 0.5 s off, and then stay off. A cadet writes this program:</p>" +
          `<pre style="max-width:100%;overflow-x:auto;margin:.5em 0">n = 0\nmain:\n  out1 = 1\n  wait 0.5 s\n  out1 = 0\n  wait 0.5 s\n  n = n + 1\n  if n &lt;= 4 then goto main\nend</pre>`,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 5, tol: 0, unit: "flashes",
            q: "How many times does the lamp flash when the program runs as written?",
            why: R`After pass 1, $n = 1$; the test $n \le 4$ is true, so it loops. The loop continues while $n \le 4$, so it still loops after pass 4 ($n = 4$) and the fifth pass makes $n = 5$, which fails the test. The lamp flashes <strong>5 times</strong>.`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 5, tol: 0, unit: "s",
            q: "How long, in seconds, does the program take to run as written?",
            why: R`Each pass takes $0.5 + 0.5 = 1.0$ s, and there are 5 passes, so the program takes $5 \times 1.0 = $ <strong>5 s</strong>.`,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 1,
            q: "Which change makes the program meet the specification?",
            opts: [
              "Change the first wait to 0.4 s and the second wait to 0.6 s",
              "Change the test <code>n &lt;= 4</code> to <code>n &lt; 4</code>",
              "Change <code>goto main</code> to <code>goto end</code> in the last line",
              "Move <code>n = 0</code> to just after the label <code>main:</code>",
            ],
            why: R`With $n < 4$ the test fails after pass 4 ($n = 4$), so there are exactly four flashes. Changing a delay does not change the count. Jumping to <code>end</code> would stop after one flash. Moving <code>n = 0</code> into the loop resets the counter every pass, so the program never stops.`,
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 4,
            q: "Describe how the amended program could be shown to meet the specification.",
            minWords: 8,
            points: [
              { desc: "Run the amended program (on the microcontroller or a simulator) and watch the lamp",
                all: ["\\b(?:run|runs|running|simulat\\w*|upload\\w*|download\\w*|load\\w*|execut\\w*|try|trial|switch\\w* (?:it )?on|power\\w*|start\\w*|operat\\w*)\\b", "\\b(?:watch\\w*|observ\\w*|see|saw|seeing|look\\w*|count\\w*|record\\w*|monitor\\w*|check\\w*|time\\w*|video\\w*|note)\\b"] },
              { desc: "Expected result: four flashes of 0.5 s on and 0.5 s off, then the lamp stays off, and the observed result matches",
                win: 200,
                all: ["\\b(?:count\\w*|expect\\w*|observ\\w*|see|saw|seeing|watch\\w*|check\\w*|record\\w*|find\\w*|should|exactly|match\\w*)\\b", "\\b(?:4|four)\\b", "\\b(?:flash\\w*|blink\\w*|times|pulses?|on)\\b"] },
            ],
            sample: "Run the amended program on the microcontroller and watch the lamp. Count the flashes: there should be exactly four, and then the lamp should stay off.",
            model: "<ul><li>Run the amended program (on the board or in a simulator) and watch the lamp (1)</li><li>State the expected result and compare: four flashes, each 0.5 s on and 0.5 s off, then the lamp stays off; the observed result must match (1)</li></ul><p>&quot;It worked&quot; with no input, expected output and observed output earns nothing. Also acceptable: timing the run with a stopwatch and expecting 4 s.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-10",
        style: "Section 2 · context question · calculate and describe · PWM",
        stem:
          "<p>A model winch motor on HMS Ratchet is driven by a transistor which is switched on and off by a PWM signal from a microcontroller. Figure 5 shows the voltage across the motor. The supply is 12 V.</p>",
        figure: figPwm,
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 250, tol: 0.5, unit: "Hz",
            q: "Use Figure 5 to calculate the frequency of the PWM signal, in hertz.",
            why: R`The pattern repeats every 4 ms, so $T = 4\ \text{ms}$. $f = \dfrac{1}{T} = \dfrac{1}{0.004} = $ <strong>250 Hz</strong>. Using 4 without converting milliseconds gives a wrong power of ten.`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 75, tol: 0.5, unit: "%",
            q: "Calculate the duty cycle of the signal, as a percentage.",
            why: R`The signal is on for 3 ms of every 4 ms: $D = \dfrac{t_{on}}{T} = \dfrac{3}{4} = $ <strong>75 %</strong>.`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 9.0, tol: 0.01, unit: "V",
            q: "Calculate the average voltage across the motor, in volts.",
            why: R`$V_{avg} = D \times V_s$ (1) $= 0.75 \times 12 = $ <strong>9.0 V</strong> (1).`,
          },
          {
            label: "(d)", type: "num", marks: 2, a: 2.0, tol: 0.005, unit: "ms",
            q: "The frequency stays the same but the duty cycle is changed so that the average voltage is 6.0 V. Calculate the new on-time, in milliseconds.",
            why: R`$D = \dfrac{V_{avg}}{V_s} = \dfrac{6.0}{12} = 0.50$ (1). $t_{on} = D \times T = 0.50 \times 4 = $ <strong>2.0 ms</strong> (1).`,
          },
          {
            label: "(e)", type: "mcq", marks: 1, a: 3,
            q: "The frequency is raised to 20 kHz with the duty cycle left at 75 %. What happens to the average voltage across the motor?",
            opts: [
              "It rises, because there are more pulses every second",
              "It falls, because each pulse is now much shorter than before",
              "It becomes 12 V, because the pulses merge into one steady level",
              "It stays at 9.0 V, as the duty cycle is unchanged",
            ],
            why: R`The average voltage depends on the duty cycle and the supply, $V_{avg} = D \times V_s$, not on the frequency. Each pulse is shorter but there are proportionally more of them, so the fraction of time on is still 75 %.`,
          },
          {
            label: "(f)", type: "text", marks: 2, rows: 4,
            q: "The duty cycle is now reduced. Describe the effect on the speed of the motor.",
            minWords: 10,
            points: [
              { desc: "The average voltage across the motor falls (as the duty cycle falls)",
                not: ["\\b(?:not|n't|never|no)\\W+(?:\\w+\\W+){0,2}(?:fall\\w*|drop\\w*|decreas\\w*|reduc\\w*|lower\\w*|go down|slow\\w*|chang\\w*)", AV_RISES],
                any: ["\\b(?:lowers?|reduces?|decreases?|cuts?|drops?|lessens?)\\W+(?:\\w+\\W+){0,1}(?:average|mean|effective)\\W+(?:\\w+\\W+){0,2}(?:voltage|volts?|power)", "\\b(?:less|lower|reduced|smaller)\\W+(?:\\w+\\W+){0,2}(?:voltage|volts?|power|energy)\\W+(?:\\w+\\W+){0,3}(?:on average|on the average|averaged)", "\\b(?:average|mean|effective)\\W+(?:\\w+\\W+){0,3}(?:voltage|volts?|power|current)\\W+(?:\\w+\\W+){0,4}(?:fall\\w*|drop\\w*|decreas\\w*|reduc\\w*|lower\\w*|smaller|less|goes down|gets lower)", "\\b(?:voltage|volts?)\\W+(?:\\w+\\W+){0,5}(?:fall\\w*|drop\\w*|decreas\\w*|reduc\\w*|lower\\w*|smaller|less|goes down)\\W+(?:\\w+\\W+){0,6}(?:average|motor)", "\\b(?:less|lower|smaller|reduced)\\W+(?:\\w+\\W+){0,2}(?:average|mean)\\W+(?:\\w+\\W+){0,2}(?:voltage|volts?)"] },
              { desc: "So less current and torque flow, and the motor slows down",
                not: [AV_RISES, "\\bmotor\\W+(?:\\w+\\W+){0,4}(?:speeds? up|faster|accelerat\\w*|increas\\w*)"],
                any: ["\\b(?:slows?|slower|slowing|decelerat\\w*|speed\\W+(?:\\w+\\W+){0,3}(?:falls?|drops?|decreases?|reduces?|lower\\w*|goes down)|spins? (?:more )?slowly|turns? (?:more )?slowly|runs? (?:more )?slowly)\\b", "\\b(?:less|lower|reduced|smaller)\\W+(?:\\w+\\W+){0,2}(?:speed|rpm|revs)"] },
            ],
            sample: "A lower duty cycle makes the average voltage across the motor fall. Less current flows and less torque is produced, so the motor slows down.",
            model: "<ul><li>As the duty cycle falls the average voltage across the motor falls (1)</li><li>so less current and torque, and the motor slows down (1)</li></ul><p>Link the quantities in order: duty cycle, average voltage, then speed. &quot;It goes slower&quot; on its own is non-descriptive and earns nothing. Also acceptable: at a very low duty cycle the torque cannot overcome friction and the motor stops.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-11",
        style: "Section 2 · context question · calculate and explain · PWM against a series resistor",
        stem:
          "<p>The propeller motor of a model tug draws a steady <strong>0.80 A</strong> at <strong>6.0 V</strong>. It is powered from a <strong>9.0 V</strong> battery. A cadet slows the motor by putting a resistor in series with it, so that the motor has 6.0 V across it. Her friend says it would be better to use a transistor switched by PWM from a microcontroller.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 2.4, tol: 0.005, unit: "W",
            q: "Calculate the power dissipated in the series resistor.",
            why: R`The resistor has $9.0 - 6.0 = 3.0$ V across it (1). $P = VI = 3.0 \times 0.80 = $ <strong>2.4 W</strong> (1).`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 66.6667, tol: 0.08, alts: [67], unit: "%",
            q: "Calculate the percentage of the power taken from the battery that reaches the motor in the cadet's circuit.",
            why: R`Power from the battery $= 9.0 \times 0.80 = 7.2$ W. Power in the motor $= 6.0 \times 0.80 = 4.8$ W (1). $\text{efficiency} = \dfrac{4.8}{7.2} \times 100 = $ <strong>66.7 %</strong> (1).`,
          },
          {
            label: "(c)", type: "text", marks: 4, rows: 7,
            q: "Explain why PWM is a better method than a series resistor for controlling the speed of this motor.",
            minWords: 20,
            points: [
              { desc: "The series resistor wastes power as heat, because the voltage the motor does not use is dropped across it",
                not: ["\\b(?:resistors?|series)\\W+(?:\\w+\\W+){0,6}(?:either|fully|completely)\\W+(?:\\w+\\W+){0,2}(?:on|off)\\b", PWM_WASTES, "\\bresistors?\\W+(?:\\w+\\W+){0,3}(?:more|very|highly|so)\\W+(?:\\w+\\W+){0,2}efficient", "\\bresistors?\\W+(?:\\w+\\W+){0,4}(?:waste\\w*|loses?|dissipat\\w*|heats?)\\W+(?:\\w+\\W+){0,1}(?:less|little|no|nothing|fewer)", "\\bresistors?\\W+(?:\\w+\\W+){0,3}(?:not|n't|never)\\W+(?:\\w+\\W+){0,2}(?:waste\\w*|hot|heat\\w*)"],
                any: ["\\b(?:resistors?|series)\\W+(?:\\w+\\W+){0,10}(?:waste\\w*|heats?|heating|hot|dissipat\\w*|lost|loses|loss|burns?)", "\\b(?:waste\\w*|heats?|heating|dissipat\\w*|wasted|lost|loss)\\W+(?:\\w+\\W+){0,10}(?:resistors?|series)", "\\bresistors?\\W+(?:\\w+\\W+){0,6}(?:takes?|drops?|uses?|absorbs?)\\W+(?:\\w+\\W+){0,6}(?:voltage|volts?|power|energy)"] },
              { desc: "With PWM the transistor is either fully on or fully off, so very little power is lost in it",
                not: ["\\b(?:resistors?|series)\\W+(?:\\w+\\W+){0,6}(?:either|fully|completely)\\W+(?:\\w+\\W+){0,2}(?:on|off)\\b", PWM_WASTES],
                any: ["\\b(?:fully|completely|either)\\W+(?:\\w+\\W+){0,2}(?:on|off)\\b", "\\b(?:on|off)\\W+(?:or|and)\\W+(?:\\w+\\W+){0,2}(?:fully\\W+)?(?:off|on)\\b", "\\b(?:switch\\w*|transistor)\\W+(?:\\w+\\W+){0,6}(?:little|almost no|hardly any|very little|minimal|negligible|small)\\W+(?:\\w+\\W+){0,3}(?:power|heat|energy|loss|voltage)", "\\b(?:little|almost no|hardly any|very little|minimal|negligible)\\W+(?:\\w+\\W+){0,3}(?:power|heat|energy)\\W+(?:\\w+\\W+){0,5}(?:transistor|switch\\w*|pwm)"] },
              { desc: "The duty cycle is changed to vary the average voltage across the motor, which sets its speed",
                any: ["\\b(?:duty|pulse width|on ?time|mark)\\W+(?:\\w+\\W+){0,8}(?:average|mean|effective)\\W+(?:\\w+\\W+){0,2}(?:voltage|volts?|power)", "\\b(?:average|mean|effective)\\W+(?:\\w+\\W+){0,2}(?:voltage|volts?)\\W+(?:\\w+\\W+){0,8}(?:duty|pulse|on ?time|speed|change[sd]?|varied|controlled|set)", "\\b(?:changing|varying|altering|adjusting|increasing|reducing|raising|lowering)\\W+(?:\\w+\\W+){0,2}(?:the )?(?:duty|pulse width|on ?time)\\W+(?:\\w+\\W+){0,8}(?:speed|voltage|slower|faster)"] },
              { desc: "So most of the battery power reaches the motor: more efficient, less heat and a longer battery life",
                not: ["\\bresistors?\\W+(?:\\w+\\W+){0,3}(?:more|very|highly)\\W+(?:\\w+\\W+){0,2}efficient", "\\b(?:resistors?|series)\\W+(?:\\w+\\W+){0,6}(?:better|best|less|least|fewer)", "\\bresistors?\\W+(?:\\w+\\W+){0,6}(?:power|energy|heat|loss)\\W+(?:\\w+\\W+){0,2}(?:less|lower)"],
                any: ["\\b(?:pwm|it|this|transistor|switching|method)\\W+(?:\\w+\\W+){0,6}(?:more|very|highly|much more)\\W+(?:\\w+\\W+){0,2}efficient", "\\bmore efficient", "\\b(?:efficiency)\\W+(?:\\w+\\W+){0,4}(?:higher|better|greater|improved|increased)", "\\b(?:battery|cell|batteries)\\W+(?:\\w+\\W+){0,5}(?:lasts?|last longer|longer)", "\\b(?:longer)\\W+(?:\\w+\\W+){0,2}battery", "\\b(?:most|more|all|nearly all|almost all)\\W+(?:\\w+\\W+){0,4}(?:power|energy)\\W+(?:\\w+\\W+){0,6}(?:reaches|goes to|delivered to|used by|used in|is used|to the motor|in the motor)", "\\b(?:less|little|fewer)\\W+(?:\\w+\\W+){0,3}(?:power|energy)\\W+(?:\\w+\\W+){0,3}(?:wasted|lost)", "\\b(?:cooler|runs? cool|stays? cool|less heat|doesn'?t get hot)", "\\b(?:runs?|lasts?|working|operat\\w*)\\W+(?:\\w+\\W+){0,2}longer\\b", "\\bused\\W+(?:\\w+\\W+){0,1}(?:better|more (?:efficiently|effectively)|efficiently)", "\\bbetter use\\b"] },
            ],
            sample: "The series resistor wastes power as heat, because the extra voltage is dropped across it. With PWM the transistor is either fully on or fully off, so very little power is lost in it. The duty cycle is changed to vary the average voltage across the motor, which sets its speed, so most of the battery power reaches the motor and the battery lasts longer.",
            model: "<ul><li>A series resistor wastes power as heat: the unused voltage is dropped across it and $P = VI$ is lost (1)</li><li>With PWM the transistor is fully on or fully off, so very little power is lost in it (1)</li><li>The duty cycle is varied to change the average voltage across the motor, and so its speed (1)</li><li>So most of the power reaches the motor: PWM is more efficient, cooler and the battery lasts longer (1)</li></ul><p>Four different points are needed. Do not accept &quot;PWM is more efficient&quot; with no reason as more than the last mark; &quot;PWM is cheaper&quot; or &quot;faster&quot; earns nothing.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-12",
        style: "Section 2 · context question · logic and microcontroller together",
        stem:
          "<p>The roof vent of a greenhouse is opened by a motor connected to output 1 of a microcontroller. A logic gate combines the rain sensor R and the wind sensor W (1 means rain, or strong wind). Its output is connected to input 1, and must be 1 when the vent is <strong>allowed</strong> to open. A temperature sensor connected to an1 gives 0 to 255 for 0 °C to 40 °C. The system is shown in Figure 6.</p>" +
          `<p>The program is:</p><pre style="max-width:100%;overflow-x:auto;margin:.5em 0">main:\n  if in1 = 0 then goto closed\n  if an1 &gt; 153 then goto open\nclosed:\n  out1 = 0\n  goto main\nopen:\n  out1 = 1\n  goto main</pre>`,
        figure: figVent,
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 3,
            q: "The vent may open only when there is no rain and no strong wind. Which logic gate should combine R and W?",
            opts: ["AND", "OR", "NAND", "NOR"],
            why: R`The output must be 1 only when $R = 0$ and $W = 0$. That is the NOR gate: $\overline{R + W}$. An OR gives 1 when it rains or blows, the opposite of what is needed. A NAND is 1 unless both are 1, so it would allow the vent to open in rain alone.`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 24, tol: 0.05, unit: "°C",
            q: "Calculate the temperature, in °C, at which the program opens the vent (assuming in1 = 1).",
            why: R`$\text{temp} = 153 \times 40 \div 255$ (1) $= $ <strong>24 °C</strong> (1). The vent opens when the reading is above 153, so just above 24 °C.`,
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 1,
            q: "It is raining, so in1 = 0, and the temperature is high, with an1 = 200. What is the state of out1?",
            opts: [
              "out1 = 1, because an1 = 200 is above 153 so the temperature decides",
              "out1 = 0, because in1 = 0 sends the program to <code>closed</code>",
              "out1 flashes on and off every time the program goes round the loop",
              "The program stops at the first test, so out1 does not change at all",
            ],
            why: "The first test is on in1. With in1 = 0 the program jumps to <code>closed</code> and sets out1 = 0, whatever the temperature. The logic gate has the final say, which is how the rain and wind sensors stop the vent opening. The program loops back to <code>main</code>, so it never stops.",
          },
          {
            label: "(d)", type: "text", marks: 4, rows: 8,
            q: "Describe how the program controls the vent.",
            minWords: 20,
            points: [
              { desc: "It repeats continuously, going back to main each time",
                any: ["\\b(?:repeat\\w*|continu\\w*|loop\\w*|over and over|again and again|keeps? (?:on )?(?:checking|reading|monitoring|testing|going)|constantly|all the time|forever|for ever|always (?:checking|reading|monitoring|testing)|round and round|goes? back (?:to )?(?:main|the start|the top|the beginning)|returns? to (?:main|the start|the top|the beginning)|back to (?:main|the start|the top))\\b"] },
              { desc: "If in1 = 0 (rain or wind) the vent is closed (out1 = 0) whatever the temperature",
                win: 200, negOK: true,
                not: ["\\b(?:not|n't|never)\\W+(?:\\w+\\W+){0,1}(?:closed?|shut|close)\\b", "\\bin1\\W+(?:is |= ?|equals )?1\\b\\W+(?:\\w+\\W+){0,6}(?:closed?|shut)\\W+(?:\\w+\\W+){0,4}(?:whatever|regardless|no matter)"],
                all: [
                  "\\b(?:in1|input 1|input one|logic|gate|nor|enable\\w*|first test|first)\\W+(?:\\w+\\W+){0,3}(?:0|low|off|zero|false)\\b|\\b(?:rain\\w*|wind\\w*|raining|windy|not allowed)\\b",
                  "\\b(?:closed?|shut|closes|out1 (?:is )?(?:set )?(?:to |= ?)?0)\\b",
                  "\\b(?:whatever|regardless|whichever|no matter|even if|even when|any temperature|ignores?|before|override\\w*|priority|however|never opens?)\\b",
                ] },
              { desc: "If in1 = 1 and an1 is above 153 (above 24 °C) the vent opens, out1 = 1",
                not: [IN1_REV, "(?:below|under|less than|lower|cooler|colder|<)(?:(?!\\b(?:clos\\w*|shut|not|otherwise|else|above|over)\\b)[^.;]){0,40}\\b(?:opens?|opened)\\b"],
                any: [
                  "(?:above|over|greater|more than|higher|exceeds?|hotter|>|too hot|too high|warm\\w*)[^.;]{0,60}\\b(?:opens?|opened|raises?)\\b",
                  "(?:above|over|greater|more than|higher|exceeds?|hotter|>|too hot|too high|warm\\w*)[^.;]{0,60}\\bout1\\W+(?:is |= ?|equals |to |set to )?1\\b",
                  "\\b(?:opens?|opened|raises?)\\b[^.;]{0,60}(?:above|over|greater|more than|higher|exceeds?|hotter|>|too hot|too high|warm\\w*)",
                  "\\bout1\\W+(?:is |= ?|equals |to |set to )?1\\b[^.;]{0,60}(?:above|over|greater|more than|higher|exceeds?|hotter|>|too hot|too high)",
                ] },
              { desc: "Otherwise (not above 153) the vent stays closed, out1 = 0",
                win: 200,
                not: [IN1_REV],
                any: ["\\b(?:otherwise|else|if not|below|less than|lower|under|cooler|colder|153 or (?:less|below|under|lower)|not (?:above|over|greater|hot))\\W+(?:\\w+\\W+){0,10}(?:closed?|shut|0|off)\\b", "\\b(?:closed?|shut|out1 (?:is )?(?:set )?(?:to |= ?)?0)\\W+(?:\\w+\\W+){0,10}(?:otherwise|else|if not|below|less than|lower|under|cooler|colder)"] },
            ],
            sample: "The program loops continuously, going back to main each time. If in1 is 0 because of rain or wind, the vent is closed with out1 equal to 0 whatever the temperature is. If in1 is 1 and the temperature is above 24 degrees, because an1 is greater than 153, the vent opens by setting out1 to 1. Otherwise, if it is cooler than that, the vent is closed.",
            model: "<ul><li>The program repeats continuously (a loop back to main) (1)</li><li>If in1 = 0 (rain or strong wind) the vent is closed, out1 = 0, whatever the temperature (1)</li><li>If in1 = 1 and an1 &gt; 153 (above 24 °C) the vent opens, out1 = 1 (1)</li><li>Otherwise (in1 = 1 but the temperature is 24 °C or below) the vent is closed, out1 = 0 (1)</li></ul><p>Use of pin names and the values 153 or 24 °C is expected for full marks. Do not accept an answer that says the temperature is tested first.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-13",
        style: "Section 1 · short answer · flowcharts and the ADC",
        stem:
          "<p>A technician is learning to read control programs written as flowcharts for a microcontroller with analogue and digital pins.</p>",
        parts: [
          {
            label: "(a)", type: "multi", marks: 2,
            q: "Choose <strong>two</strong> correct statements about flowcharts.",
            opts: [
              "A diamond is used for a decision and has two exits labelled Yes and No",
              "A delay does not need a unit, because seconds are always assumed",
              "A parallelogram is used for a decision",
              "An arrow that returns to an earlier box makes the program repeat",
              "A flowchart for a control system should always stop after one pass",
            ],
            a: [0, 3],
            why: "A diamond holds a decision with a Yes and a No exit, and an arrow back to an earlier box makes a loop. A delay must carry a unit (such as 0.5 s). A parallelogram is for an input or an output. A control system must go on watching its inputs, so it does not stop after one pass.",
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 2,
            q: "What does the analogue-to-digital converter (ADC) of a microcontroller do?",
            opts: [
              "It turns a number from the program into an output voltage",
              "It amplifies a weak signal from a sensor so it can be read",
              "It turns a sensor voltage into a number for the program",
              "It stores the program so that it is kept when the power is off",
            ],
            why: "The ADC converts an input voltage into a number (for example 0 to 255 for 0 V to 5 V). Turning a number into a voltage is a digital-to-analogue converter, and amplifying is the job of an amplifier.",
          },
        ],
      },
      /* ------------------------------------------------------------------ */
      {
        id: "digital-14",
        style: "Section 1 · short answer · NAND equivalents",
        stem:
          "<p>A lamp circuit has the output $Q = A \\cdot B + C \\cdot D$, built from two AND gates and an OR gate. The circuit is to be rebuilt using <strong>NAND gates only</strong>, with the least possible number of gates. All the gates in the rebuilt circuit have two inputs. The 74HC00 is a quad 2-input NAND chip.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 3, tol: 0, unit: "gates",
            q: "How many NAND gates are needed?",
            why: R`Swapping each gate gives NANDs followed by NOTs, and an OR becomes a NAND with a NOT on each input. The NOT after each AND and the NOT before the OR sit in series on one wire, so each pair cancels (double inversion). What is left is $\overline{\overline{A\cdot B}\cdot\overline{C\cdot D}} = A\cdot B + C\cdot D$: <strong>3 gates</strong>. Five or six gates is the answer before the double inversions are cancelled.`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 1, tol: 0, unit: "IC",
            q: "How many 74HC00 chips are needed?",
            why: "Three 2-input NAND gates fit on one 74HC00, which holds four. One chip.",
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 0,
            q: "Which statement describes the double-inversion trick?",
            opts: [
              "Two NOT gates in series cancel each other, so both can be removed",
              "Every gate is duplicated so that the circuit still works if one fails",
              "The output is inverted twice to make it stronger",
              "A NAND with its inputs joined is replaced by an AND",
            ],
            why: "A NOT of a NOT gives back the original signal, so a pair of NOTs directly in series can be taken out without changing the function. That is where most of the gate saving comes from.",
          },
        ],
      },
    ],
  };
})();
