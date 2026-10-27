/* Past-paper practice: systems, energy and the engineer's world. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HEP_BANK = window.HEP_BANK || {});
  const R = String.raw;
  /* "...but this is not necessary", "does not matter", "do not have to cope with wind": a claim that the thing is unneeded */
  const UNNEEDED = [
    R`\b(?:not|never|no|\w+n't)\s+(?:\w+\s+){0,3}(?:necessar\w*|matter\w*|important|relevant|needed|a\s+factor|bother\w*|(?:need|have|has)\s+to\s+(?:\w+\s+){0,2}(?:survey\w*|check\w*|investigat\w*|design\w*|calculat\w*|plan\w*|resist\w*|withstand\w*|cope|carry|support\w*|survive|bear|worry|consider\w*|stand))\b`,
    R`\b(?:unnecessary|irrelevant|pointless)\b|\bno\s+(?:\w+\s+)?need\b`,
  ];
  /* "...but nothing goes wrong if they do not": a claim that skipping the thing is harmless */
  const HARMLESS = UNNEEDED.concat([
    R`\bnothing\b[^.;]{0,30}\b(?:wrong|bad|happen\w*|goes|go|serious)\b`,
    R`\b(?:fine|okay|ok|safe|no\s+(?:\w+\s+)?(?:problems?|harm|issues?|difference))\b[^.;]{0,30}\bif\s+(?:they|the|there|it|we)\s+(?:\w+\s+){0,2}(?:do\s+not|don'?t|doesn'?t|does\s+not|never|fail|forget|did\s+not|didn'?t)`,
    R`\bif\s+(?:they|the|there|it|we)\s+(?:\w+\s+){0,2}(?:do\s+not|don'?t|doesn'?t|does\s+not|never|fail|forget|did\s+not|didn'?t)\b[^.;]{0,50}\b(?:fine|okay|nothing|no\s+(?:\w+\s+)?(?:problems?|harm|issues?|difference))`,
    R`\bnothing\s+(?:is\s+)?(?:wrong|bad)\b`,
  ]);

  const BEN_ENV = [R`\b(?:no|zero|without|less|fewer|lower|reduc\w*|cut\w*|eliminat\w*|remov\w*|avoid\w*|cleaner)\b[^.;]{0,25}\b(?:exhaust\w*|emission\w*|fumes?|carbon|co2|pollut\w*|nitrogen|nox|particulate\w*|greenhouse|air)`, R`\bair\s+(?:quality|pollution)\b[^.;]{0,25}\b(?:better|improv\w*|cleaner)`, R`\b(?:exhaust|tail-?pipe)\s+(?:emissions?|fumes?)\s+(?:are|is)\s+(?:zero|removed|cut|lower|reduced)`];
  const BEN_SOC = [R`\bquiet\w*`, R`\b(?:less|lower|reduc\w*)\s+(?:\w+\s+){0,2}(?:noise|vibration|smell)`, R`\bnoise\b[^.;]{0,20}\b(?:reduc\w*|lower|less|down)`, R`\b(?:health\w*|asthma|breath\w*|respirat\w*|pleasant\w*)\b`];
  const BEN_ECO = [R`\b(?:running|fuel|operating|servicing|maintenance|energy)\s+(?:costs?|bills?)\b[^.;]{0,25}\b(?:lower|less|cheaper|reduc\w*|fall\w*|drop\w*|saving|smaller|cut)`, R`\b(?:lower|less|cheaper|reduc\w*|cut|sav\w*)\s+(?:\w+\s+){0,2}(?:running|fuel|operating|servicing|maintenance|energy)\s+(?:costs?|bills?)`, R`\bcheaper\s+to\s+(?:run|operate|maintain|service|fuel)`, R`\bfewer\s+moving\s+parts`, R`\b(?:less|cheaper|lower)\s+(?:\w+\s+){0,1}(?:maintenance|servicing)\b`];
  const DRAW_ECO = [R`\b(?:high|expensive|large|big|huge|great|costly|steep)\s+(?:\w+\s+){0,2}(?:costs?|price|purchase|investment|capital|up-?front|initial)`, R`(?<!lower )(?<!less )(?<!cheaper )(?<!running )(?<!fuel )(?<!servicing )(?<!maintenance )(?<!operating )(?<!energy )(?<!reduced )(?<!reduces )(?<!reduce )(?<!cut )(?<!saves )(?<!saving )(?<!save )\b(?:costs?|expensive|prices?|pricey)\b[^.;]{0,30}\b(?:high\w*|expensive|greater|steep|extra|buy|purchase|install\w*|buses|charg\w*|infrastructure)`, R`\bcharg\w*\s+(?:points?|stations?|infrastructure|equipment|depots?)\b[^.;]{0,40}\b(?:high\w*|expens\w*|invest\w*|costly|cost\s+(?:a\s+lot|more|too|millions?)|costs\s+(?:a\s+lot|more|too|millions?))`, R`(?<!lower )(?<!less )(?<!cheaper )(?<!running )(?<!fuel )(?<!servicing )(?<!maintenance )(?<!operating )(?<!energy )(?<!reduced )(?<!reduces )(?<!reduce )(?<!cut )(?<!saves )(?<!saving )(?<!save )(?<!reduced )(?<!reduces )(?<!reduce )(?<!cut )(?<!saves )(?<!saving )(?<!save )\b(?:cost\w*|expensive|invest\w*)\b[^.;]{0,40}\bcharg\w*`, R`\bup-?front\b`];
  const DRAW_ENV = [R`\bbatter\w*\b[^.;]{0,60}\b(?:mining|mined|mine|extract\w*|lithium|cobalt|raw\s+materials?|rare|manufactur\w*|energy\s+to\s+make|recycl\w*|dispos\w*|landfill|waste|end\s+of\s+(?:its\s+|their\s+)?life|toxic|pollut\w*)`, R`\b(?:mining|mined|lithium|cobalt|recycl\w*|dispos\w*|landfill)\b[^.;]{0,60}\bbatter\w*`, R`\b(?:electricity|grid|power)\b[^.;]{0,60}\b(?:fossil|coal|gas|non-?renewable|burn\w*|power\s+stations?)`];
  const DRAW_SOC = [R`\brange\b[^.;]{0,40}\b(?:limit\w*|short\w*|less|lower|reduc\w*|restrict\w*|problem|issue)`, R`\b(?:limit\w*|short\w*|restrict\w*)\s+(?:\w+\s+){0,2}range\b`, R`\bcharg\w*\b[^.;]{0,40}\b(?:takes?|long|hours|slow|delay\w*|disrupt\w*|out\s+of\s+service|off\s+the\s+road)`, R`\b(?:jobs?|drivers?|mechanics?|workers?)\b[^.;]{0,40}\b(?:lost|loss|los[et]|redundan\w*|retrain\w*|at\s+risk|threat\w*)`, R`\b(?:break\s?downs?|run\s+out\s+of|flat\s+batter\w*)\b`];
  /* Impacts: benefits and drawbacks are marked as two separate pools of up to two marks each, so a one-sided answer
     cannot score more than 2/4. Mark 1 of a side is any one creditable point; mark 2 is two different ones. */
  /* the pair test bypasses the engine's negation check, so each half refuses a match that follows "not", "never" or "n't" */
  const alt = (arr) => "(?<!(?:\\bnot|\\bnever|n't|\\bno\\s+longer)\\s+(?:\\w+\\s+){0,3})(?:" + arr.join("|") + ")";
  const pairOf = (sets) => {
    const out = [];
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) out.push("^(?=[\\s\\S]*?" + alt(sets[i]) + ")(?=[\\s\\S]*?" + alt(sets[j]) + ")");
    return out;
  };
  const sidePoints = () => {
    const ben = [BEN_ENV, BEN_SOC, BEN_ECO], drw = [DRAW_ECO, DRAW_ENV, DRAW_SOC];
    return [
      { desc: "Benefit 1 (environmental, social or economic): e.g. no exhaust and cleaner air, quieter streets, or lower running and maintenance costs", any: [].concat(...ben) },
      { desc: "Benefit 2: a second, different benefit of the three kinds", any: pairOf(ben) },
      { desc: "Drawback 1 (economic, environmental or social): e.g. high purchase cost, battery materials and the grid electricity, or limited range and charging time", any: [].concat(...drw) },
      { desc: "Drawback 2: a second, different drawback of the three kinds", any: pairOf(drw) },
    ];
  };

  /* ---- figure helpers ---- */
  const INK = "#1d1a14", PAPER = "#fffaf0", GREY = "#cbbd9b", BLUE = "#3b5f8a", RED = "#b3402d", GREEN = "#4f7d3a", OCHRE = "#c98a2b";
  const svg = (w, h, label, body) =>
    `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" font-family="sans-serif" font-size="13"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${INK}"/></marker></defs><rect width="${w}" height="${h}" fill="${PAPER}"/>${body}</svg>`;
  const line = (x1, y1, x2, y2, arrow, extra) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="2"${arrow ? ' marker-end="url(#ar)"' : ""}${extra || ""}/>`;
  const poly = (pts, arrow) => `<polyline points="${pts}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"${arrow ? ' marker-end="url(#ar)"' : ""}/>`;
  const box = (x, y, w, h, label, fill) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill || "#fff"}" stroke="${INK}" stroke-width="2"/><text x="${x + w / 2}" y="${y + h / 2 + 6}" text-anchor="middle" font-size="17" font-weight="700" fill="${INK}">${label}</text>`;
  const text = (x, y, s, anchor, extra) => `<text x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ""}${extra && /fill=/.test(extra) ? "" : ` fill="${INK}"`}${extra || ""}>${s}</text>`;

  /* closed-loop greenhouse temperature controller: five lettered blocks, functions to be identified */
  const loopFig = () =>
    svg(560, 200, "Closed loop block diagram of a greenhouse heating controller. An input arrow enters a circular summing block A with a plus and a minus sign. Arrows run in turn to block B, block C and block D, then to the output. A cold draught disturbance arrow enters block D from above. A feedback path from the output returns through block E to the minus sign of block A.",
      text(6, 60, "input") + line(6, 70, 90, 70, true) +
      `<circle cx="108" cy="70" r="18" fill="#fff" stroke="${INK}" stroke-width="2"/><text x="108" y="76" text-anchor="middle" font-size="17" font-weight="700" fill="${INK}">A</text>` +
      text(80, 54, "+", "middle", ' font-size="16" font-weight="700"') + text(122, 110, "−", "middle", ' font-size="18" font-weight="700"') +
      line(126, 70, 176, 70, true) + box(176, 48, 80, 44, "B") + line(256, 70, 300, 70, true) +
      box(300, 48, 80, 44, "C") + line(380, 70, 430, 70, true) + box(430, 48, 80, 44, "D") +
      line(510, 70, 554, 70, true) + text(556, 58, "output", "end") +
      line(470, 14, 470, 46, true) + text(462, 26, "disturbance (cold draught)", "end") +
      `<circle cx="530" cy="70" r="3.5" fill="${INK}"/>` + poly("530,70 530,160 382,160", true) +
      box(282, 138, 100, 44, "E") + poly("282,160 108,160 108,90", true));

  /* open-loop garden watering: timer, valve, bed, with disturbances */
  const openFig = () =>
    svg(560, 170, "Open loop block diagram of a garden watering system. A timer sets the watering time, then a valve, then the garden bed. Rain and hot sun act on the garden bed as disturbances. There is no path from the garden bed back to the timer.",
      text(6, 62, "5 min set", null, "") + line(6, 74, 70, 74, true) +
      box(70, 50, 110, 48, "Timer", "#e8efe0") + line(180, 74, 240, 74, true) +
      box(240, 50, 110, 48, "Valve", "#e8efe0") + line(350, 74, 410, 74, true) +
      box(410, 50, 120, 48, "Garden bed", "#e8efe0") + line(530, 74, 556, 74, true) +
      line(470, 12, 470, 48, true) + text(462, 24, "rain, hot sun", "end"));

  /* the hunting trace of a two-state thermostat (smooth path through the points) */
  const huntFig = () => {
    const X = (t) => 60 + t * 8, Y = (T) => 210 - (T - 16) * 23.75;
    const pts = [[0, 18], [3, 17.2], [12, 22], [15, 22.8], [30, 18], [33, 17.2], [42, 22], [45, 22.8], [60, 18]];
    let d = `M${X(pts[0][0])},${Y(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${X(c1[0]).toFixed(1)},${Y(c1[1]).toFixed(1)} ${X(c2[0]).toFixed(1)},${Y(c2[1]).toFixed(1)} ${X(p2[0])},${Y(p2[1])}`;
    }
    let g = "";
    for (let T = 16; T <= 24; T++) g += `<line x1="60" y1="${Y(T)}" x2="540" y2="${Y(T)}" stroke="${GREY}" stroke-width="1"/>` + text(52, Y(T) + 4, T, "end");
    for (let t = 0; t <= 60; t += 10) g += `<line x1="${X(t)}" y1="20" x2="${X(t)}" y2="210" stroke="${GREY}" stroke-width="1"/>` + text(X(t), 228, t, "middle");
    const dots = [[0, 18, "ON"], [12, 22, "OFF"], [30, 18, "ON"], [42, 22, "OFF"], [60, 18, "ON"]];
    const marks = dots.map(([t, T, s]) => `<circle cx="${X(t)}" cy="${Y(T)}" r="4.5" fill="${s === "ON" ? RED : BLUE}" stroke="${INK}" stroke-width="1"/>` +
      text(t === 60 ? X(t) - 6 : X(t) + 6, s === "ON" ? (t === 60 ? Y(T) + 20 : Y(T) - 10) : Y(T) + 20, s, t === 60 ? "end" : null, ' font-weight="700"')).join("");
    return svg(560, 262, "Graph of cabin temperature in degrees Celsius against time in minutes for a thermostat controlled heater. The temperature rises and falls in a repeating wave. Red dots marked ON are at 0, 30 and 60 minutes where the temperature is 18 degrees and blue dots marked OFF are at 12 and 42 minutes where the temperature is 22 degrees. The temperature carries on rising after each OFF point and falling after each ON point.",
      g + `<rect x="60" y="20" width="480" height="190" fill="none" stroke="${INK}" stroke-width="2"/>` +
      `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.5"/>` + marks +
      text(300, 252, "time / min", "middle") + `<text transform="translate(16,115) rotate(-90)" text-anchor="middle" fill="${INK}">temperature / °C</text>`);
  };

  /* Sankey-style energy flow for a motor: bands drawn to scale (0.04 px per watt) */
  const sankeyFig = () => {
    const band = (x0, ya, yb, x1, yc, yd, fill) => {
      const xm = (x0 + x1) / 2;
      return `<path d="M${x0},${ya} C${xm},${ya} ${xm},${yc} ${x1},${yc} L${x1},${yd} C${xm},${yd} ${xm},${yb} ${x0},${yb} Z" fill="${fill}" stroke="${INK}" stroke-width="1.5"/>`;
    };
    return svg(640, 200, "Sankey style energy flow diagram for an electric motor drawn to scale. A wide band on the left is the 2500 watt electrical input. Two narrow bands curve upwards and away, one labelled friction 300 watts and one labelled heating of the windings 450 watts. The remaining wide band continues to the right as the useful mechanical output, marked with a question mark.",
      `<rect x="30" y="70" width="120" height="100" fill="${BLUE}" stroke="${INK}" stroke-width="1.5"/>` +
      band(150, 70, 82, 440, 22, 34, OCHRE) + band(150, 82, 100, 440, 60, 78, OCHRE) +
      `<rect x="150" y="100" width="290" height="70" fill="${GREEN}" stroke="${INK}" stroke-width="1.5"/>` +
      text(90, 125, "2500 W", "middle", ' fill="#fff" font-weight="700" font-size="15"') +
      text(90, 143, "input", "middle", ' fill="#fff"') +
      text(446, 32, "friction 300 W") + text(446, 74, "heating of windings 450 W") +
      text(295, 140, "useful output = ?", "middle", ' font-weight="700" fill="#fff"') +
      text(30, 192, "band widths are drawn to scale"));
  };

  B.systems = {
    intro:
      "<p>Sixteen questions, 79 marks, covering the engineer's role, the systems approach and control diagrams, open and closed loop, two-state and proportional control, energy, power and efficiency, units and rounding, and the impact of engineering. Roughly half the marks are calculations; the rest are choose-and-match items and written answers, including two 4-mark extended responses and a balanced impact evaluation. In the real paper this theme is worth about 8 to 24 of the 110 marks, so treat this as a full revision set for the area. Write each written answer as a cause and an effect in the situation named, and set out every calculation as relationship, substitution, answer with unit.</p>",
    questions: [
      {
        id: "systems-01",
        style: "Section 1 · short answer · match",
        stem: "<p>A new road bridge over the Forth has a lifting span so that tall ships can pass under it. The design team includes engineers from several disciplines.</p>",
        parts: [
          {
            label: "(a)", type: "match", marks: 3,
            q: "Match each engineer to the job they do on this project.",
            pairs: [
              ["Civil engineer", "Calculates whether the piers and deck can carry the traffic loads"],
              ["Mechanical engineer", "Chooses the gears, shafts and motor that raise the lifting span"],
              ["Software engineer", "Writes the program that decides when the span lifts and lowers"],
            ],
          },
        ],
      },
      {
        id: "systems-02",
        style: "Section 1 · short answer · units and prefixes",
        stem: "<p>A temperature sensor in a greenhouse draws a current of 350 µA from a 5.0 V supply.</p>",
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 2,
            q: "Which of these is the same as 350 µA?",
            opts: [R`$350$ mA`, R`$3.5\times10^{-3}$ A`, R`$0.35$ mA`, R`$350\times10^{-9}$ A`],
            why: R`Micro means $10^{-6}$, so $350\ \mu\text{A} = 350\times10^{-6}$ A $= 3.5\times10^{-4}$ A $= 0.35$ mA. 350 mA is 1000 times too big, $3.5\times10^{-3}$ A is 10 times too big, and $350\times10^{-9}$ A is 350 nA, 1000 times too small.`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 1.75, tol: 0.005, unit: "mW",
            q: R`Calculate the power taken by the sensor, in mW. Use $P = VI$.`,
            why: R`$P = VI$ (1) $= 5.0\times 350\times10^{-6} = 1.75\times10^{-3}$ W $= \mathbf{1.75\ mW}$. Forgetting to convert µA to A gives 1750, which is 1000 times too big for an answer in mW.`,
          },
        ],
      },
      {
        id: "systems-03",
        style: "Section 2 · control diagram · identify blocks",
        stem: "<p>The diagram shows the control system for the heating in a greenhouse. The grower sets the temperature wanted, a heater warms the air, and a thermistor circuit reports the air temperature back to the controller. Opening the door lets in a cold draught.</p>",
        figure: loopFig(),
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: "Match each lettered block to its job.",
            pairs: [
              ["Block A", "Subtracts the measured temperature from the wanted temperature to give the error"],
              ["Block B", "Decides how much heating is needed from the size of the error"],
              ["Block C", "Turns the controller's signal into heat (the actuator)"],
              ["Block E", "Measures the air temperature and feeds it back (the sensor)"],
            ],
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 1,
            q: "The minus sign at block A shows that this system uses…",
            opts: [
              "positive feedback, because the measured value is added to the wanted value",
              "negative feedback, because the measured value is subtracted from the wanted value",
              "open loop control, because there is a heater",
              "two-state control, because there are two inputs to block A",
            ],
            why: "Feedback is negative when the measured output is <em>subtracted</em> from the wanted value, so a rise in the output reduces the drive that caused it. Adding it would be positive feedback (runaway). Open loop means there is no feedback path at all, and the number of inputs to the comparator says nothing about two-state control.",
          },
        ],
      },
      {
        id: "systems-04",
        style: "Section 2 · context question · proportional control",
        stem: "<p>A greenhouse heater has a proportional controller. The heater power, as a percentage of its maximum, is given by</p><p>heater power (%) = gain × error, with a gain of 12 % per °C,</p><p>where the error is the wanted temperature minus the measured temperature. The grower sets a wanted temperature of 21.0 °C.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 3.5, tol: 0.05, unit: "°C",
            q: "The air temperature is 17.5 °C. Calculate the error, in °C.",
            why: R`error = wanted $-$ measured (1) $= 21.0 - 17.5 = \mathbf{3.5\ ^\circ C}$. Taking measured minus wanted gives $-3.5$, which would wrongly switch the heating down.`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 42, tol: 0.5, unit: "%",
            q: "Calculate the heater power, as a percentage of maximum, when the error is 3.5 °C.",
            why: R`heater power = gain $\times$ error (1) $= 12 \times 3.5 = \mathbf{42\ \%}$ of maximum (1).`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 2.5, tol: 0.03, unit: "°C",
            q: "On a cold night the greenhouse loses heat so quickly that the heater must run at 30 % power to hold a steady temperature. Calculate the steady error, in °C, that remains.",
            why: R`The controller only gives power when there is an error, so error = power $\div$ gain (1) $= 30 \div 12 = \mathbf{2.5\ ^\circ C}$ (1). The greenhouse settles 2.5 °C below the wanted 21.0 °C: this is the steady-state offset.`,
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "The grower doubles the gain to 24 % per °C. State the effect on the steady error and give one disadvantage of the higher gain.",
            points: [
              { desc: "The steady error becomes smaller (it is halved)", group: "e",
                any: [R`\b(?:error|offset)\b[^.;,]{0,32}\b(?:halv\w*|half|smaller|lower|less|reduc\w*|decreas\w*|shrink\w*|fall\w*|drops?|improv\w*)`, R`\b(?:halv\w*|half|smaller|lower|less|reduc\w*|decreas\w*|shrink\w*)\b[^.;,]{0,25}\b(?:error|offset)\b`, R`\b(?:error|offset)\b[^.;,]{0,25}\b(?:is|are|becomes?|gets?|goes|go)\b[^.;,]{0,10}\b(?:1\.25|1 ?\.25)`],
                not: [R`\b(?:not|never|n't)\s+(?:\w+\s+){0,2}(?:smaller|halv\w*|lower|less|reduc\w*|decreas\w*)\b`, R`\b(?:error|offset)\b[^.;,]{0,30}\b(?:doubl\w*|bigger|larger|greater|increas\w*|grow\w*|rises?|higher|worse|unchanged|same)`, R`\b(?:error|offset)\b[^.;,]{0,12}\b(?:more)\b`] },
              { desc: "Disadvantage: the output overshoots, oscillates or becomes unstable",
                any: [R`\b(?:overshoot\w*|oscillat\w*|hunt\w*|unstable|instab\w*|over-?react\w*|over-?correct\w*|over-?compensat\w*|swing\w*|wobbl\w*|fluctuat\w*|cycl\w*)`] },
            ],
            sample: "The steady error is halved, because the heater now responds more strongly to each degree of error. A disadvantage is that the temperature may overshoot the wanted value and then oscillate about it.",
            model: "<ul><li>The steady error gets smaller: it is halved, from 2.5 °C to 1.25 °C (1)</li><li>Disadvantage: the higher gain makes the system over-react, so the temperature overshoots and may oscillate or become unstable (1)</li></ul><p>Also acceptable: the heater switches on and off more violently; wear on the actuator. &quot;The error is zero&quot; or &quot;the error doubles&quot; earns nothing: a proportional controller always leaves some offset.</p>",
          },
        ],
      },
      {
        id: "systems-05",
        style: "Section 2 · context question · two-state control and the graph",
        stem: "<p>A cabin heater is controlled by a thermostat. It is switched on when the temperature falls to the lower limit and switched off when it rises to the upper limit. The graph shows the cabin temperature over one hour; the red dots mark where the heater switches on and the blue dots where it switches off.</p>",
        figure: huntFig(),
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 30, tol: 0.5, unit: "min",
            q: "Use the graph to find the time for one complete cycle of switching, in minutes.",
            why: "One cycle is the time between one switch-on and the next: the heater switches on at 0 min and again at <strong>30 min</strong> (1). Reading to 60 min would give two cycles.",
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 2,
            q: "Which pair gives the temperatures at which the thermostat switches the heater on and off?",
            opts: [R`$17\ ^\circ$C on and $23\ ^\circ$C off`, R`$22\ ^\circ$C on and $18\ ^\circ$C off`, R`$18\ ^\circ$C on and $22\ ^\circ$C off`, R`$16\ ^\circ$C on and $24\ ^\circ$C off`],
            why: "The red ON dots are at 18 °C and the blue OFF dots at 22 °C. Reading the curve, the temperature dips to about 17 °C and peaks at about 23 °C (just over 23.1 °C at the top and 17.0 °C at the bottom of the first cycle); these are where the temperature turns round after the overshoot, not the switching points. Swapping on and off would heat the cabin when it is already warm.",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "Explain why the temperature carries on rising for a few minutes after the heater has switched off.",
            points: [
              { desc: "The heater and its surroundings are still hot, so heat continues to flow into the air",
                not: [R`\b(?:not|no\s+longer|never|isn'?t|aren'?t)\s+(?:\w+\s+){0,2}(?:hot|warm|giving|releasing)\b`],
                any: [R`\b(?:heater|element|radiator|pipes?|bars?|fire|stove)\b[^.;]{0,30}\b(?:(?:is|are|stays?|remains?|keeps?|was)\s+(?:\w+\s+){0,2}(?:hot|warm|heat\w*)|still\s+(?:\w+\s+){0,2}(?:hot|warm|heat\w*|giv\w*|releas\w*|emit\w*|radiat\w*))`, R`\b(?:still|continues? to|keeps?|carries on|goes on)\s+(?:\w+\s+){0,2}(?:giv\w*|releas\w*|transfer\w*|emit\w*|radiat\w*|warm\w*|heat\w*|pass\w*|put\w*|send\w*)\b[^.;]{0,25}\b(?:heat|energy|warmth|out|air|room|cabin)`, R`\b(?:stored|remaining|left-?over|residual|latent)\s+(?:heat|thermal|energy)`, R`\bheat\b[^.;]{0,25}\b(?:stored|left)\b`, R`\bthermal\s+(?:mass|inertia|lag)`] },
              { desc: "There is a delay (time lag) before the air and sensor respond, so the controller reacts late",
                not: [R`\b(?:no|without|zero)\s+(?:\w+\s+){0,1}(?:delay\w*|lag)\b`],
                any: [R`\b(?:delay\w*|lag\w*|inertia)\b`, R`\b(?:takes?|taking|needs?)\s+(?:a\s+)?(?:some\s+|a little\s+|a\s+)?(?:time|while|longer|minutes)\b[^.;]{0,40}\b(?:temperature|air|sensor|warm|heat|respond|react|change|cool|spread|circulat\w*|reach\w*)`, R`\b(?:slow\w*|gradual\w*)\b[^.;]{0,20}\b(?:respon\w*|react\w*|change\w*|warm\w*|spread\w*)`, R`\b(?:not|isn'?t|doesn'?t|does not)\s+(?:\w+\s+){0,2}(?:instant\w*|immediate\w*|at once)`] },
            ],
            sample: "The heater element is still hot when it switches off, so it carries on giving out heat to the air. The air and the sensor also take time to respond, so there is a delay before the temperature starts to fall.",
            model: "<ul><li>The heater (element, pipes) is still hot after it switches off, so it keeps transferring heat to the cabin air (1)</li><li>There is a time lag or delay: it takes time for heat to spread and for the sensor to respond, so the controller reacts late and the temperature overshoots the upper limit (1)</li></ul><p>Do not accept &quot;the thermostat is broken&quot; or a repeat of the question (&quot;it overshoots&quot;) with no reason.</p>",
          },
          {
            label: "(d)", type: "text", marks: 1, rows: 2, minWords: 3,
            q: "State one advantage of this type of control.",
            points: [
              { desc: "It is simple, cheap or robust",
                any: [R`\b(?:simpl\w*|cheap\w*|inexpensive|low[- ]cost|easy|easier|straightforward|robust|reliable|basic|uncomplicated)\b`, R`\bfew(?:er)?\s+(?:parts|components)\b`] },
            ],
            sample: "It is simple and cheap, because the controller only has to switch the heater on and off.",
            model: "<ul><li>Simple / cheap / easy to set up / robust, because the controller only switches fully on or fully off (1)</li></ul>",
          },
        ],
      },
      {
        id: "systems-06",
        style: "Section 2 · open loop and closed loop · extended answer",
        stem: "<p>A garden has an automatic watering system. A timer opens a valve for 5 minutes each morning, whatever the weather. In a wet week the plants are flooded, and in a hot dry week they are left thirsty. The block diagram shows the system.</p>",
        figure: openFig(),
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 3,
            q: "Why is this an open loop system?",
            opts: [
              "It has no energy supply",
              "It uses a timer rather than a computer",
              "The valve is either fully open or fully closed",
              "The state of the garden bed is not measured and fed back to the timer",
            ],
            why: "Open loop means there is no path from the output back to the input, so the controller never learns what happened. Whether a timer or a computer does the job, and whether the valve is two-state, say nothing about feedback. Every system needs an energy supply.",
          },
          {
            label: "(b)", type: "text", marks: 4, rows: 7, minWords: 25,
            q: "Explain how the system could be changed to closed loop, and why the changed system would work better.",
            points: [
              { desc: "A sensor (such as a soil moisture sensor) measures the actual wetness, the output",
                any: [R`\b(?:moisture|humidity|wetness|water|damp\w*|wet|soil)\s+(?:sensor|probe|detector|transducer|meter|gauge)s?\b`, R`\bsensors?\b[^.;]{0,60}\b(?:measur\w*|detect\w*|monitor\w*|senses?|read\w*|check\w*|tell\w*|report\w*|sens\w*)\b[^.;]{0,40}\b(?:moisture|wet\w*|damp\w*|dry\w*|water|soil|output|level)`, R`\b(?:measur\w*|detect\w*|monitor\w*|sens\w*|check\w*)\b[^.;]{0,35}\b(?:moisture|wetness|dampness|dryness|how (?:wet|dry|moist)|soil|output)`] },
              { desc: "The measured value is fed back to the controller / comparator",
                any: [R`\bfeed\w*[ -]?back\b`, R`\bfeeds?\s+(?:it\s+|this\s+|that\s+|the\s+\w+\s+|its\s+\w+\s+)?back\b`, R`\bfed\s+(?:it\s+|this\s+|that\s+|the\s+\w+\s+)?back\b`, R`\b(?:sent|sends|send|passed|passes|returned|returns|goes|go)\s+(?:it\s+|this\s+|the\s+\w+\s+|its\s+\w+\s+)?back\b`, R`\bback\s+to\s+(?:the\s+)?(?:controller|input|comparator|timer|start|beginning)\b`, R`\b(?:feedback|return)\s+(?:path|loop|signal|line)\b`] },
              { desc: "A comparator subtracts the measured value from the desired value to give an error",
                any: [R`\bcompar\w*`, R`\berror\b`, R`\bsubtract\w*`, R`\bdifference\s+between\b`] },
              { desc: "So the valve opens only when needed: the system corrects for rain and hot weather and avoids flooding or drying",
                any: [R`\b(?:only|just)\b[^.;]{0,30}\b(?:water\w*|turn\w*\s+on|switch\w*\s+on|open\w*|come\w*\s+on|runs?)\b[^.;]{0,30}\b(?:when|if)\b`, R`\b(?:correct\w*|compensat\w*|adjust\w*|respond\w*|react\w*|adapt\w*|cop\w*|allow\w*\s+for|account\w*\s+for)\b[^.;]{0,60}\b(?:rain\w*|weather|disturbanc\w*|hot|sun\w*|conditions|changes?|drought|dry\s+spells?)`, R`\b(?:stop\w*|turn\w*\s+off|switch\w*\s+off|shut\w*|close\w*)\b[^.;]{0,35}\b(?:when|once|if|enough|wet|moist|damp)\b`, R`\b(?:right|correct|exact|enough|required|needed|suitable)\s+(?:amount|level|quantity)\s+of\s+water`, R`\b(?:water\w*|turn\w*\s+on|switch\w*\s+on|open\w*|runs?)\s+(?:\w+\s+){0,2}only\s+(?:when|if)\b`, R`\b(?:no|less|avoid\w*|prevent\w*|stop\w*|reduc\w*)\s+(?:\w+\s+){0,2}(?:wast\w*|flood\w*|waterlog\w*)`, R`\bif\b[^.;]{0,40}\b(?:dry|wet)\b[^.;]{0,40}\b(?:open\w*|water\w*|turn\w*\s+on|switch\w*\s+on)`, R`\bno\s+(?:more\s+)?(?:flood\w*|waterlog\w*|dry\w*)`] },
            ],
            sample: "A moisture sensor is added to the garden bed to measure how wet the soil is, and its signal is fed back to the controller. A comparator subtracts the measured moisture from the desired moisture to give an error. The valve is then opened only when the soil is too dry and closed when it is wet enough, so the system corrects for rain and hot weather instead of watering the same amount every day.",
            model: "<ul><li>A sensor (for example a soil moisture sensor) measures the actual output, the wetness of the soil (1)</li><li>Its signal is fed back to the controller / comparator, forming a closed loop (1)</li><li>A comparator subtracts the measured value from the desired value to give an error that the controller acts on (1)</li><li>The valve opens only when the soil is too dry and closes when wet enough, so the system corrects for rain and hot weather (disturbances) and avoids flooding or drying (1)</li></ul><p>Do not accept &quot;use a better timer&quot; (still open loop) or &quot;a sensor&quot; with no output named. &quot;It uses less water&quot; without the reason is worth nothing on its own.</p>",
          },
        ],
      },
      {
        id: "systems-07",
        style: "Section 2 · energy audit and efficiency · Sankey diagram",
        stem: "<p>The Sankey diagram shows the energy flow in an electric motor that drives a conveyor. The electrical input power is 2500 W. Some of the input power is wasted inside the motor.</p>",
        figure: sankeyFig(),
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 1750, tol: 1, unit: "W",
            q: "Calculate the useful output power of the motor, in W.",
            why: R`The bands balance: $P_{in} = P_{useful} + P_{wasted}$, so $P_{useful} = 2500 - 300 - 450 = \mathbf{1750\ W}$ (1).`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 0.7, tol: 0.005, unit: "(no unit)",
            q: R`Calculate the efficiency of the motor. Give your answer as a decimal, not a percentage.`,
            why: R`$\eta = \dfrac{P_{out}}{P_{in}}$ (1) $= \dfrac{1750}{2500} = \mathbf{0.70}$ (1). Efficiency has no unit. If you worked in percent, 70 % is the same answer.`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 360, tol: 0.5, unit: "kJ",
            q: "The motor runs for 8.0 minutes. Calculate the energy wasted in that time, in kJ.",
            why: R`wasted power $= 300 + 450 = 750$ W. $E = Pt$ (1) $= 750 \times (8.0\times 60) = 750\times 480 = 360\,000\ \text{J} = \mathbf{360\ kJ}$ (1). Using 8.0 for the time in seconds gives 6 kJ, and using the useful power gives 840 kJ.`,
          },
          {
            label: "(d)", type: "text", marks: 1, rows: 3, minWords: 4,
            q: "State what happens to the wasted energy.",
            points: [
              { desc: "It is transferred to the surroundings as heat (thermal energy), where it is no longer useful", negOK: true,
                not: [R`\b(?:not|isn'?t|never)\s+(?:\w+\s+){0,2}(?:as\s+|into\s+|to\s+)?(?:heat|thermal)\b`],
                any: [R`\b(?:heat\w*|thermal|warm\w*|hot)\b`] },
            ],
            sample: "The wasted energy is transferred to the surroundings as heat, so it is no longer useful.",
            model: "<ul><li>It becomes heat (thermal energy) in the motor and its surroundings, so it can no longer be used (1)</li></ul><p>Also acceptable: heat and a little sound. Do not accept &quot;it is destroyed&quot; or &quot;it disappears&quot;: energy is conserved.</p>",
          },
        ],
      },
      {
        id: "systems-08",
        style: "Section 2 · context question · gravitational energy, power and efficiency",
        stem: "<p>A pumped-storage hydro scheme in the Highlands stores surplus electricity from wind farms by pumping water uphill, and returns it later by letting water fall back through turbines. In one hour of generating, <strong>4.0 × 10<sup>6</sup> kg</strong> of water falls through a vertical height of <strong>120 m</strong>.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 4.704, tol: 0.006, unit: "GJ",
            q: R`Calculate the loss of gravitational potential energy of the water, in GJ ($1\ \text{GJ} = 10^9$ J).`,
            why: R`$E_p = mgh$ (1) $= 4.0\times10^6\times 9.8\times 120 = 4.704\times10^9\ \text{J} = \mathbf{4.70\ GJ}$.`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 1.3067, tol: 0.005, rtol: 0.011, unit: "MW",
            q: "Calculate the average power given up by the falling water, in MW. The time is 1.0 hour.",
            why: R`$P = \dfrac{E}{t}$ (1) $= \dfrac{4.704\times10^9}{3600} = 1.307\times10^6\ \text{W} = \mathbf{1.31\ MW}$ (1). The time must be 3600 s, not 1.0 or 60.`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 0.8036, tol: 0.005, unit: "(no unit)",
            q: R`The generators deliver an average electrical output of $1.05$ MW. Calculate the efficiency of the conversion from the falling water to electricity, as a decimal.`,
            why: R`$\eta = \dfrac{P_{out}}{P_{in}}$ (1) $= \dfrac{1.05\times10^6}{1.307\times10^6} = \mathbf{0.804}$ (1) (80.4 %). The input is the power of the falling water, not the electrical output.`,
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 0,
            q: "Why is pumped storage useful on a grid with many wind farms?",
            opts: [
              "It stores surplus electricity as gravitational potential energy when demand is low and returns it when demand is high",
              "It makes the wind blow harder when demand is high",
              "It creates energy, so the grid needs fewer power stations",
              "It converts all of the stored energy back into electricity with no losses",
            ],
            why: "Wind output does not follow demand, so surplus electricity pumps water uphill and the stored $E_p$ is turned back into electricity later. It cannot change the wind, cannot create energy (energy is conserved) and always has losses: here the efficiency of generation alone is only about 0.80.",
          },
        ],
      },
      {
        id: "systems-09",
        style: "Section 2 · braking · kinetic energy and heat energy",
        stem: "<p>A car of mass 1200 kg travelling at 25 m s<sup>−1</sup> brakes to rest. The brake discs and pads have a total mass of 6.0 kg of steel, with specific heat capacity 450 J kg<sup>−1</sup> K<sup>−1</sup>. The discs and pads absorb 90 % of the kinetic energy of the car.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 375, tol: 0.5, unit: "kJ",
            q: "Calculate the kinetic energy of the car before braking, in kJ.",
            why: R`$E_k = \tfrac{1}{2}mv^2$ (1) $= 0.5\times1200\times25^2 = 375\,000\ \text{J} = \mathbf{375\ kJ}$. Forgetting to square the speed gives 15 kJ.`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 337.5, tol: 0.5, rtol: 0.011, unit: "kJ",
            q: "Calculate the energy absorbed by the discs and pads, in kJ.",
            why: R`$0.90\times375 = \mathbf{337.5\ kJ}$ (1) (about 338 kJ).`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 125, tol: 0.6, unit: "K",
            q: "Calculate the temperature rise of the discs and pads, in K.",
            why: R`$E_h = cm\Delta T$, so $\Delta T = \dfrac{E_h}{cm}$ (1) $= \dfrac{337\,500}{450\times6.0} = \mathbf{125\ K}$ (1). Using the 1200 kg of the car instead of the 6.0 kg of steel gives 0.63 K.`,
          },
          {
            label: "(d)", type: "text", marks: 1, rows: 3, minWords: 4,
            q: "State what happens to the other 10 % of the kinetic energy.",
            points: [
              { desc: "It becomes heat or sound in the tyres, road, air and other surroundings", negOK: true,
                not: [R`\b(?:not|isn'?t|never)\s+(?:\w+\s+){0,2}(?:as\s+|into\s+|to\s+)?(?:heat|thermal|sound|noise)\b`],
                any: [R`\b(?:becomes?|turn(?:ed|s)?|chang(?:ed|es)|convert(?:ed|s)|transfer(?:red|s)?|goes|go|lost|wasted|releas(?:ed|es)|giv(?:en|es)|dissipat(?:ed|es)|escap(?:es?|ed)|ends?\s+up|spread|shared|dumped|emitted)\b[^.;]{0,40}\b(?:heat\w*|thermal|warm\w*|sound|noise|surroundings|environment|tyres?|road|air|atmosphere)\b`, R`\b(?:heat|thermal|sound|noise)\s+(?:energy\s+)?(?:in|to|from|into)\b[^.;]{0,25}\b(?:tyres?|road|air|surroundings|environment)\b`, R`\b(?:heats?|heating|warms?|warming)\b[^.;]{0,20}\b(?:tyres?|road|air|surroundings)\b`, R`\b(?:as|into)\s+(?:\w+\s+){0,1}(?:heat|sound|noise)\b`] },
            ],
            sample: "The other 10 % is transferred to the surroundings, as heat in the tyres, road and air and as sound.",
            model: "<ul><li>It is transferred to the surroundings: heat in the tyres, road and air, and sound (1)</li></ul><p>Do not accept &quot;it is lost&quot; or &quot;it is destroyed&quot; with no form of energy.</p>",
          },
        ],
      },
      {
        id: "systems-10",
        style: "Section 2 · role of the engineer · phases, roles and communication",
        stem: "<p>A company is to build an offshore wind farm of 40 turbines in the Firth of Forth. The project runs through five phases: identify the need and analyse, design, develop and build, test, and evaluate and maintain. Civil, electrical, mechanical and software engineers all work on it.</p>",
        parts: [
          {
            label: "(a)", type: "match", marks: 3,
            q: "Match each phase of the project to a task done in it.",
            pairs: [
              ["Design", "Calculating the loads on a turbine foundation and choosing its materials"],
              ["Test", "Measuring the output of a finished turbine and comparing it with the specification"],
              ["Evaluate and maintain", "Inspecting the blades and servicing the gearboxes after a year of operation"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 4, rows: 8, minWords: 25,
            q: "Describe <strong>two</strong> roles of a civil engineer in the design phase of this project. For each role say how, or why, it is done.",
            points: [
              { desc: "Role 1: designs or sizes the foundations or support structure of each turbine",
                not: [R`\b(?:not|never|no\s+longer|\w+n't)\s+(?:\w+\s+){0,2}(?:design\w*|calculat\w*|siz\w*)\b[^.;]{0,40}\b(?:foundations?|towers?|piles?|supports?)`].concat(UNNEEDED),
                any: [R`\b(?:design\w*|calculat\w*|siz\w*|specif\w*|choos\w*|select\w*|plan\w*|determin\w*|work\w*\s+out)\b[^.;]{0,50}\b(?:foundations?|towers?|piles?|monopiles?|jackets?|supports?|support\s+structures?|tower\s+structures?|moorings?|anchor\w*)`, R`\b(?:foundations?|towers?|piles?|monopiles?|jackets?|tower\s+supports?|support\s+structures?)\b[^.;]{0,40}\b(?:design\w*|siz\w*|calculat\w*|specif\w*|plan\w*)`] },
              { desc: "How or why for that role: the foundation must resist the wind, wave and turbine loads so it does not fall over or fail",
                all: [R`\b(?:loads?|forces?|wind|waves?|storms?|weight|stress\w*|currents?|tides?|pressure)\b`, R`\b(?:strong|stable|stability|topple\w*|collaps\w*|fall\w*|withstand\w*|resist\w*|support\w*|carry|carries|safe\w*|hold\w*|survive\w*|cope\w*|bear\w*|tip\w*|fail\w*|overturn\w*|sink\w*|snap\w*)`], win: 100, negOK: true, not: [R`\b(?:not|never|n't)\s+(?:\w+\s+){0,1}(?:strong|stable|safe)\b`].concat(UNNEEDED) },
              { desc: "Role 2: surveys the seabed or ground, or designs the cable route or access",
                not: UNNEEDED,
                any: [R`\b(?:survey\w*|investigat\w*|test\w*|sampl\w*|assess\w*|analys\w*|check\w*|map\w*|examin\w*|stud(?:y|ies|ying)|inspect\w*|explor\w*)\b[^.;]{0,40}\b(?:sea-?bed|sea\s?floor|ground|soil|rock|sand|clay|geolog\w*|site|sediment\w*)`, R`\b(?:design\w*|plan\w*|choos\w*|select\w*|decid\w*|rout\w*)\b[^.;]{0,40}\b(?:cables?|cable\s+routes?|trench\w*|access|platforms?|ladders?|boat\s+landings?|harbours?|ports?|roads?|jett\w*|installation)\b`, R`\b(?:plan\w*|design\w*|decid\w*)\b[^.;]{0,30}\b(?:how|where)\b[^.;]{0,40}\b(?:install\w*|lift\w*|transport\w*|build\w*|construct\w*|position\w*|locat\w*|place\w*)`, R`\b(?:decid\w*|choos\w*|select\w*|find\w*)\b[^.;]{0,30}\b(?:positions?|locations?|where)\b[^.;]{0,40}\b(?:turbines?|towers?)`] },
              { desc: "How or why for that role: e.g. the seabed type decides the foundation, or the cable route avoids damage",
                all: [R`\b(?:sea-?bed|sea\s?floor|ground|soil|rock|sand|clay|geolog\w*|cables?|routes?|access|platforms?|install\w*|lift\w*)\b`, R`\b(?:so\s+that|so\s+the|so\s+they|so\s+it|because|to\s+(?:choose|decide|select|find|determine|check|make\s+sure|ensure|avoid|see|know|identify|protect|prevent|stop|keep)|in\s+order\s+to|which\s+(?:shows|tells|decides|determines|means|lets|allows|helps)|ensur\w*|determin\w*|decid\w*|avoid\w*|protect\w*|prevent\w*|depend\w*|suitable|right\s+type|damag\w*)`], win: 80, negOK: true, not: UNNEEDED },
            ],
            sample: "A civil engineer designs the foundations that support each turbine tower. They calculate the wind and wave forces on the structure so that the foundation is strong enough to stop the turbine falling over in a storm. A second role is to survey the seabed where the turbines will stand. This shows whether the ground is rock or sand, so that the engineer can choose the right type of foundation for each position.",
            model: "<ul><li>Role 1: designs / sizes the foundations or tower structure for each turbine (1)</li><li>How / why: calculates the wind, wave and weight loads so that the foundation is strong and stable and does not topple or fail (1)</li><li>Role 2: surveys the seabed (ground investigation), or designs the cable route, access platform or installation method (1)</li><li>How / why: the seabed type decides which foundation is suitable, or the route is chosen to protect the cables and allow safe access (1)</li></ul><p>Two means two different roles: the same role in different words earns one role mark at most. A bare job title (&quot;designs the structure&quot;) earns nothing: the foundations or tower, or the seabed survey, cable route or access, must be named. A role the answer says is unnecessary earns nothing. Do not accept tasks from other phases such as building or testing.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 10,
            q: "Explain why good communication between the civil engineers and the electrical engineers is important on this project.",
            points: [
              { desc: "They must share information that the other discipline needs, such as cable positions, weights or changes",
                not: HARMLESS,
                any: [R`\b(?:tell\w*|told|inform\w*|shar\w*|pass\w*|agree\w*|discuss\w*|explain\w*|notify\w*|updat\w*|talk\w*|ask\w*|know\w*)\b[^.;]{0,70}\b(?:cable\w*|duct\w*|weights?|sizes?|loads?|positions?|locations?|changes?|requirements?|drawings?|specification\w*|details?|plans?|where|what)\b`, R`\b(?:cable\w*|duct\w*|weights?|sizes?|loads?|positions?|locations?|changes?|requirements?|details?)\b[^.;]{0,50}\b(?:tell\w*|told|inform\w*|shar\w*|pass\w*|agree\w*|discuss\w*|notif\w*|updat\w*|known|communicat\w*)`, R`\bcommunicat\w*\b[^.;]{0,40}\b(?:other|another|each\s+other)\b`] },
              { desc: "Otherwise mistakes happen: parts do not fit, work is redone, causing delay, cost or an unsafe structure",
                not: HARMLESS,
                any: [R`\b(?:mistakes?|errors?|clash\w*|redo\w*|re-?work\w*|re-?built|re-?design\w*|delay\w*|extra\s+cost|costly|cost\w*|expensive|wasted?|unsafe|danger\w*|fail\w*|collaps\w*|not\s+fit|won'?t\s+fit|wrong|misalign\w*|don'?t\s+match|do\s+not\s+match|not\s+match|incompatible|problems?|overrun\w*)`] },
            ],
            sample: "The electrical engineers need to tell the civil engineers where the cables enter each foundation, so that ducts can be built in the right place. If they do not share this information there will be mistakes, parts will not fit and the work has to be redone, which causes delay and extra cost.",
            model: "<ul><li>Each discipline depends on information from the other (for example where the cables enter a foundation, or the weight of equipment), so it must be shared and agreed (1)</li><li>Without it there are mistakes, parts that do not fit, redesign or rework, causing delay, extra cost or an unsafe structure (1)</li></ul><p>&quot;Communication is important&quot; with no example and no consequence earns nothing.</p>",
          },
        ],
      },
      {
        id: "systems-11",
        style: "Section 2 · impacts of engineering · evaluate",
        stem: "<p>A city council plans to replace its fleet of diesel buses with battery-electric buses. The buses will be charged overnight at the depot from the national grid.</p>",
        parts: [
          {
            label: "(a)", type: "multi", marks: 2,
            q: "Choose the <strong>two</strong> statements that describe <em>economic</em> impacts of the change.",
            opts: [
              "Quieter streets for residents",
              "Lower fuel and servicing costs for the bus company",
              "Less carbon dioxide emitted in the city",
              "A high purchase price for the buses and the charging points",
              "Mining of the metals used in the batteries",
            ],
            a: [1, 3],
            why: "Economic impacts concern money: running costs and purchase costs. Quieter streets are a social impact, reduced carbon dioxide and the mining of battery metals are environmental impacts.",
          },
          {
            label: "(b)", type: "text", marks: 4, rows: 9, minWords: 30,
            q: "Discuss the impacts of making this change. Your answer should include benefits and drawbacks; up to two marks are available for each side.",
            points: sidePoints(),
            sample: "The electric buses have no exhaust, so there are fewer emissions and the air in the city is cleaner. They are also much quieter for residents. The running costs are lower because electricity is cheaper than diesel and there are fewer moving parts to service. However, the buses and the charging points are very expensive to buy, and the batteries need mined materials and have to be recycled at the end of their life.",
            model: "<ul><li>Environmental benefit: no exhaust emissions in the city, so cleaner air and less carbon dioxide (1)</li><li>Social benefit: quieter streets and healthier air for residents (1)</li><li>Economic benefit: lower fuel and servicing costs, with fewer moving parts (1)</li><li>Economic drawback: high purchase cost of buses and charging equipment (1)</li><li>Environmental drawback: batteries need mined materials and energy to make, must be recycled, and the grid electricity may come from fossil fuels (1)</li><li>Social drawback: limited range, charging time, or loss of engine-related jobs (1)</li></ul><p>Up to <strong>two</strong> marks for benefits and up to <strong>two</strong> for drawbacks, so an answer with benefits only (or drawbacks only) scores at most 2 out of 4: the marker needs at least one of each side for more than 2 marks. Two different kinds of benefit (environmental, social, economic) earn both benefit marks; likewise for drawbacks. Each point needs a reason, not a slogan such as &quot;it is greener&quot;.</p>",
          },
        ],
      },
      {
        id: "systems-12",
        style: "Section 2 · combining formulae · power, force and speed",
        stem: "<p>An electric hoist lifts a load of mass 240 kg vertically at a constant speed of 0.35 m s<sup>−1</sup>. The hoist is connected to a 230 V supply and has an overall efficiency of 62 %.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 2352, tol: 2.5, unit: "N",
            q: "Calculate the force needed to lift the load at a constant speed, in N.",
            why: R`At a constant speed the lifting force equals the weight, $F = mg$ (1) $= 240\times9.8 = \mathbf{2352\ N}$ (about 2350 N). The mass in kg is not a force.`,
          },
          {
            label: "(b)", type: "num", marks: 1, a: 823.2, alts: [824.04], tol: 0.7, rtol: 0.011, unit: "W",
            q: "Calculate the useful output power of the hoist, in W.",
            why: R`$P = Fv$ (1) $= 2352\times0.35 = \mathbf{823\ W}$ (824 W if $g = 9.81$ N kg$^{-1}$ is used, which is also accepted). Using the mass instead of the force gives 84.`,
          },
          {
            label: "(c)", type: "num", marks: 2, a: 1327.7, tol: 3, unit: "W",
            q: "Calculate the input power to the hoist, in W.",
            why: R`$\eta = \dfrac{P_{out}}{P_{in}}$, so $P_{in} = \dfrac{P_{out}}{\eta}$ (1) $= \dfrac{823.2}{0.62} = \mathbf{1330\ W}$ (1) (1328 W before rounding). Multiplying by 0.62 instead of dividing gives 510 W, less than the output, which is impossible.`,
          },
          {
            label: "(d)", type: "num", marks: 2, a: 5.773, tol: 0.012, rtol: 0.011, unit: "A",
            q: "Calculate the current taken from the 230 V supply, in A.",
            why: R`$P = VI$, so $I = \dfrac{P}{V}$ (1) $= \dfrac{1327.7}{230} = \mathbf{5.77\ A}$ (1). The input power, not the output power, is the power drawn from the supply.`,
          },
        ],
      },
      {
        id: "systems-13",
        style: "Section 1 · short answer · efficiency and energy conversion",
        stem: "<p>Engineers audit the energy use of machines so that they can reduce waste.</p>",
        parts: [
          {
            label: "(a)", type: "multi", marks: 2,
            q: "Choose the <strong>two</strong> correct statements about efficiency.",
            opts: [
              "Efficiency is measured in joules",
              "Efficiency is the useful output energy divided by the input energy",
              "An efficiency of 1.2 means the machine is working very well",
              "Efficiency has no unit",
              "The wasted energy is destroyed by friction",
            ],
            a: [1, 3],
            why: "Efficiency is a ratio of two energies (or two powers), so the units cancel and it has no unit; it can never be above 1 (100 %). Wasted energy is not destroyed: it is transferred to the surroundings, usually as heat.",
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 3,
            q: "A battery-powered drone climbs steadily. Which is the main <em>useful</em> energy change?",
            opts: [
              "Electrical energy to heat energy",
              "Gravitational potential energy to kinetic energy",
              "Kinetic energy to electrical energy",
              "Electrical energy to gravitational potential energy",
            ],
            why: "The drone gains height, so useful energy ends up as gravitational potential energy, supplied by the battery's electrical energy. Heat in the motors is the wasted energy. Potential to kinetic would describe falling, and kinetic to electrical is regenerative braking.",
          },
        ],
      },
      {
        id: "systems-14",
        style: "Section 1 · short answer · calculation craft",
        stem: "<p>A motor delivers a steady output power of 0.75 kW for 15 minutes.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 675, tol: 0.5, rtol: 0.011, unit: "kJ",
            q: "Calculate the energy delivered, in kJ.",
            why: R`$E = Pt$ (1) $= 750\times(15\times60) = 750\times900 = 675\,000\ \text{J} = \mathbf{675\ kJ}$ (1). Convert both the kilowatts and the minutes first.`,
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 2,
            q: "A calculation gives 0.0047362. Round this to <strong>3 significant figures</strong>.",
            opts: ["0.005", "0.00473", "0.00474", "0.0474"],
            why: "The leading zeros do not count, so the first significant figure is 4 and the three figures are 4, 7 and 3. The next digit is 6, so round up to 0.00474. 0.00473 cuts off instead of rounding, 0.005 is 1 s.f., and 0.0474 has the wrong power of ten.",
          },
        ],
      },
      {
        id: "systems-15",
        style: "Section 2 · conservation of energy",
        stem: "<p>A delivery drone releases a parcel of mass 0.50 kg from a height of 45 m. Ignore air resistance.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 220.5, tol: 0.6, unit: "J",
            q: "Calculate the loss of gravitational potential energy of the parcel as it falls to the ground, in J.",
            why: R`$E_p = mgh$ (1) $= 0.50\times9.8\times45 = \mathbf{220.5\ J}$ (about 221 J).`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 29.7, tol: 0.06, rtol: 0.011, unit: "m s⁻¹",
            q: "Calculate the speed of the parcel as it reaches the ground, in m s⁻¹.",
            why: R`All the lost $E_p$ becomes $E_k$ (1): $\tfrac12mv^2 = 220.5$, so $v = \sqrt{\dfrac{2\times220.5}{0.50}} = \mathbf{29.7\ m\,s^{-1}}$ (1). Leaving out the square root gives 882, and leaving out the half gives 21.0.`,
          },
        ],
      },
      {
        id: "systems-16",
        style: "Section 2 · heat energy and efficiency · multi-step",
        stem: "<p>An immersion heater of power 8.0 kW is switched on for 1.0 hour to heat 120 kg of water in a tank from 12 °C to 60 °C. The specific heat capacity of water is 4180 J kg<sup>−1</sup> K<sup>−1</sup>. The heater is connected to a 230 V supply.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 2, a: 24.08, tol: 0.04, rtol: 0.011, unit: "MJ",
            q: R`Calculate the heat energy gained by the water, in MJ ($1\ \text{MJ} = 10^6$ J).`,
            why: R`$\Delta T = 60 - 12 = 48$ K. $E_h = cm\Delta T$ (1) $= 4180\times120\times48 = 2.408\times10^7\ \text{J} = \mathbf{24.1\ MJ}$ (1). Using 60 instead of the temperature <em>change</em> gives 30.1 MJ.`,
          },
          {
            label: "(b)", type: "num", marks: 2, a: 0.836, tol: 0.004, unit: "(no unit)",
            q: "Calculate the efficiency of the heating, as a decimal.",
            why: R`electrical energy supplied $E = Pt = 8000\times3600 = 2.88\times10^7$ J (1). $\eta = \dfrac{E_{out}}{E_{in}} = \dfrac{2.408\times10^7}{2.88\times10^7} = \mathbf{0.836}$ (1). The energy in kWh or MJ must be in the same unit for both.`,
          },
          {
            label: "(c)", type: "num", marks: 1, a: 34.8, tol: 0.05, rtol: 0.011, unit: "A",
            q: "Calculate the current taken by the heater, in A.",
            why: R`$P = VI$, so $I = \dfrac{P}{V} = \dfrac{8000}{230} = \mathbf{34.8\ A}$ (1).`,
          },
        ],
      },
    ],
  };
})();
