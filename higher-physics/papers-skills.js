/* Past-paper practice: experiments, uncertainties & open-ended. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HPP_BANK = window.HPP_BANK || {});

  /* near(a, b, n): regex source matching a and b in either order with at most n words between them,
     so a shuffled pile of the right words does not satisfy it. */
  const near = (a, b, n) => { const g = "\\W+(?:\\w+\\W+){0," + (n == null ? 3 : n) + "}"; return "\\b(?:" + a + ")\\b" + g + "\\b(?:" + b + ")\\b|\\b(?:" + b + ")\\b" + g + "\\b(?:" + a + ")\\b"; };
  /* Words meaning "gets bigger" / "gets smaller". */
  const UP = "increas\\w*|rises?|rising|larger|bigger|greater|higher|goes up|grows?|more";
  const DOWN = "decreas\\w*|lower\\w*|smaller|less|reduc\\w*|drops?|dropping|falls?|falling|dips?|fewer|diminish\\w*";
  /* negFor(words, n): "not"/"never"/n't followed within n words by one of `words`: vetoes a point whose claim has been turned round. */
  const negFor = (w, n) => "(?:\\bnot|\\bnever|n't|\\bno longer)\\W+(?:\\w+\\W+){0," + (n == null ? 1 : n) + "}(?:" + w + ")\\b";
  /* Units are written in lower case: the marker compares them with the lower-cased working. */

  /* ---- figures: one helper draws every graph, so the plotted crosses are exactly the numbers in the question ---- */
  const f2 = (v) => (Math.round(v * 100) / 100).toString();
  function graph(o) {
    const W = 520, H = o.h || 330, L = 70, R = 18, T = 16, Bm = 58;
    const px = (x) => L + ((x - o.x0) / (o.x1 - o.x0)) * (W - L - R);
    const py = (y) => H - Bm - ((y - o.y0) / (o.y1 - o.y0)) * (H - T - Bm);
    let s = '<svg role="img" aria-label="' + o.alt + '" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="12">';
    s += '<rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - Bm) + '" fill="#fffdf6" stroke="#222" stroke-width="1.2"/>';
    o.xt.forEach((t) => {
      s += '<line x1="' + f2(px(t[0])) + '" y1="' + T + '" x2="' + f2(px(t[0])) + '" y2="' + (H - Bm) + '" stroke="#d8cdb4" stroke-width="0.8"/>';
      s += '<line x1="' + f2(px(t[0])) + '" y1="' + (H - Bm) + '" x2="' + f2(px(t[0])) + '" y2="' + (H - Bm + 5) + '" stroke="#222"/>';
      s += '<text x="' + f2(px(t[0])) + '" y="' + (H - Bm + 19) + '" text-anchor="middle" fill="#222">' + t[1] + "</text>";
    });
    o.yt.forEach((t) => {
      s += '<line x1="' + L + '" y1="' + f2(py(t[0])) + '" x2="' + (W - R) + '" y2="' + f2(py(t[0])) + '" stroke="#d8cdb4" stroke-width="0.8"/>';
      s += '<line x1="' + (L - 5) + '" y1="' + f2(py(t[0])) + '" x2="' + L + '" y2="' + f2(py(t[0])) + '" stroke="#222"/>';
      s += '<text x="' + (L - 9) + '" y="' + f2(py(t[0]) + 4) + '" text-anchor="end" fill="#222">' + t[1] + "</text>";
    });
    s += '<text x="' + f2((L + W - R) / 2) + '" y="' + (H - 10) + '" text-anchor="middle" fill="#222" font-size="13">' + o.xl + "</text>";
    s += '<text transform="rotate(-90 16 ' + f2((T + H - Bm) / 2) + ')" x="16" y="' + f2((T + H - Bm) / 2) + '" text-anchor="middle" fill="#222" font-size="13">' + o.yl + "</text>";
    if (o.line) s += '<line x1="' + f2(px(o.line[0][0])) + '" y1="' + f2(py(o.line[0][1])) + '" x2="' + f2(px(o.line[1][0])) + '" y2="' + f2(py(o.line[1][1])) + '" stroke="#1c3b66" stroke-width="1.8"/>';
    o.pts.forEach((p) => {
      const x = px(p[0]), y = py(p[1]);
      s += '<path d="M' + f2(x - 5) + " " + f2(y - 5) + "L" + f2(x + 5) + " " + f2(y + 5) + "M" + f2(x - 5) + " " + f2(y + 5) + "L" + f2(x + 5) + " " + f2(y - 5) + '" stroke="#b3261e" stroke-width="1.8" fill="none"/>';
    });
    return s + "</svg>";
  }
  const ticks = (a, b, step, fmt) => { const out = []; for (let v = a; v <= b + step / 1e6; v += step) out.push([Number(v.toPrecision(10)), fmt(v)]); return out; };

  /* Q4: terminal p.d. against current, EMF 1.50 V and r = 0.60 ohm, with scatter that leaves the best-fit line unchanged */
  const vi = [[0.1, 1.45], [0.2, 1.37], [0.3, 1.32], [0.4, 1.25], [0.5, 1.21]];
  /* Q5: irradiance against 1/d^2 for k = 1.2 W */
  const dI = [[0.5, 4.8], [0.6, 3.3], [0.8, 1.9], [1.0, 1.2], [1.5, 0.53], [2.0, 0.30]];
  /* Q6: maximum kinetic energy against frequency, h = 6.63e-34 and f0 = 5.0e14 */
  const fE = [[6.0, 0.69], [7.0, 1.30], [8.0, 1.99], [9.0, 2.62], [10.0, 3.35]];
  /* Q7: height against t^2, gradient g/2 = 4.9 m s-2 and a 0.06 m offset */
  const ht = [[0.1, 0.58], [0.2, 1.01], [0.3, 1.53], [0.4, 1.99], [0.5, 2.54]];

  const figVI = graph({
    x0: 0, x1: 0.6, y0: 1.0, y1: 1.6, xl: "I / A", yl: "V / V",
    xt: ticks(0, 0.6, 0.1, (v) => v.toFixed(1)), yt: ticks(1.0, 1.6, 0.1, (v) => v.toFixed(1)),
    pts: vi.map((p) => [p[0], p[1]]), line: [[0, 1.5], [0.6, 1.14]],
    alt: "Graph of terminal potential difference V in volts against current I in amperes for a cell, with five plotted crosses and a straight line of best fit falling from 1.50 V at zero current to 1.14 V at 0.60 A. Crosses lie close to the line at currents of 0.1, 0.2, 0.3, 0.4 and 0.5 A.",
  });
  const figIS = graph({
    x0: 0, x1: 4.5, y0: 0, y1: 5.5, xl: "1/d² / m⁻²", yl: "I / W m⁻²",
    xt: ticks(0, 4.5, 0.5, (v) => v.toFixed(1)), yt: ticks(0, 5.5, 0.5, (v) => v.toFixed(1)),
    pts: dI.map((p) => [1 / (p[0] * p[0]), p[1]]), line: [[0, 0], [4.5, 5.4]],
    alt: "Graph of irradiance I in watts per square metre against one over d squared in per square metre, with six plotted crosses lying close to a straight line of best fit that passes through the origin and through the point 4.0 and 4.8.",
  });
  const figPE = graph({
    x0: 4, x1: 10.5, y0: 0, y1: 3.5, xl: "f / 10¹⁴ Hz", yl: "E<tspan font-size=\"9\" dy=\"3\">k</tspan><tspan dy=\"-3\"> (max) / 10⁻¹⁹ J</tspan>",
    xt: ticks(4, 10, 1, (v) => v.toFixed(1)), yt: ticks(0, 3.5, 0.5, (v) => v.toFixed(1)),
    pts: fE.map((p) => [p[0], p[1]]), line: [[5.0, 0], [10.0, 3.315]],
    alt: "Graph of maximum kinetic energy of photoelectrons in units of ten to the minus nineteen joules against frequency in units of ten to the fourteen hertz, with five plotted crosses close to a straight line of best fit that meets the frequency axis at 5.0 and rises to 3.3 at a frequency of 10.0.",
  });
  const figHT = graph({
    x0: 0, x1: 0.6, y0: 0, y1: 3.0, xl: "t² / s²", yl: "h / m",
    xt: ticks(0, 0.6, 0.1, (v) => v.toFixed(1)), yt: ticks(0, 3.0, 0.5, (v) => v.toFixed(1)),
    pts: ht.map((p) => [p[0], p[1]]), line: [[0, 0.06], [0.6, 3.0]],
    alt: "Graph of height h in metres against time squared in square seconds for a falling ball, with five plotted crosses close to a straight line of best fit. The line meets the height axis at 0.06 metres and passes through the point 0.50 seconds squared, 2.51 metres.",
  });
  const wf = [[0.5, 0.17], [0.625, 0.21], [1.0, 0.34], [1.25, 0.43], [2.0, 0.68], [2.5, 0.84]];
  const figWF = graph({
    x0: 0, x1: 3.0, y0: 0, y1: 1.0, xl: "1/f / 10⁻³ s", yl: "λ / m",
    xt: ticks(0, 3.0, 0.5, (v) => v.toFixed(1)), yt: ticks(0, 1.0, 0.1, (v) => v.toFixed(1)),
    pts: wf, line: [[0, 0], [3.0, 1.02]],
    alt: "Graph of wavelength lambda in metres against one over frequency in units of ten to the minus three seconds for sound in air, with six plotted crosses close to a straight line of best fit that passes through the origin and through the point 2.0, 0.68.",
  });
  const figGrating = '<svg role="img" aria-label="Plan view of a laser beam passing straight through a diffraction grating onto a screen 2.00 metres away. The central maximum lies straight ahead and the first-order maxima are on either side, each at angle theta to the straight-through direction." viewBox="0 0 520 230" width="520" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="12">' +
    '<defs><marker id="a" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="#222"/></marker></defs>' +
    '<rect x="14" y="98" width="52" height="34" rx="3" fill="#dfe6f2" stroke="#1c3b66" stroke-width="1.5"/><text x="40" y="119" text-anchor="middle" fill="#222">laser</text>' +
    '<line x1="66" y1="115" x2="400" y2="115" stroke="#b3261e" stroke-width="1.8"/>' +
    '<line x1="150" y1="70" x2="150" y2="160" stroke="#222" stroke-width="3"/><text x="150" y="64" text-anchor="middle" fill="#222">grating</text>' +
    '<line x1="150" y1="115" x2="400" y2="60" stroke="#b3261e" stroke-width="1.4"/><line x1="150" y1="115" x2="400" y2="170" stroke="#b3261e" stroke-width="1.4"/>' +
    '<line x1="400" y1="20" x2="400" y2="210" stroke="#222" stroke-width="3"/><text x="400" y="14" text-anchor="middle" fill="#222">screen</text>' +
    '<path d="M210 115 A60 60 0 0 0 208.7 102.2" fill="none" stroke="#222"/><text x="222" y="112" fill="#222">θ</text>' +
    '<text x="408" y="119" fill="#222">central maximum</text><text x="408" y="64" fill="#222">first order</text><text x="408" y="174" fill="#222">first order</text>' +
    '<line x1="150" y1="206" x2="400" y2="206" stroke="#222" marker-start="url(#a)" marker-end="url(#a)"/><text x="275" y="222" text-anchor="middle" fill="#222">2.00 m</text></svg>';

  const tbl = (head, rows) => '<div class="table-wrap"><table><thead><tr>' + head.map((h) => '<th class="num">' + h + "</th>").join("") + "</tr></thead><tbody>" +
    rows.map((r) => "<tr>" + r.map((c) => '<td class="num">' + c + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";

  B.skills = {
    intro:
      "Experiments, uncertainties and data analysis are worth <strong>a large share of every paper</strong>, and most of the marks are for method rather than recall: choosing the right measurements, finding a percentage uncertainty, drawing a gradient from a graph and reading what it means. Twelve questions, 86 marks, drawn from all three areas, including four 3-mark open-ended questions. Marks are earned by <strong>separate points</strong>: a relationship, a substitution, an answer <em>with its unit</em>; or a cause and then its effect.",
    questions: [
      /* ------------------------------------------------------------ 01 */
      {
        id: "skills-01",
        style: "Experiment question · light gates, improvement and an open-ended explanation",
        stem:
          "<p>A transport laboratory tests how well a crumple zone protects a passenger. A trolley carrying a crash-test dummy is released from rest at the top of a ramp. A card of length <strong>40 mm</strong> is fixed on top of the trolley. As the trolley runs down the ramp the card cuts the beams of two light gates in turn.</p>" +
          tbl(["Measurement", "Value"], [["time for the card to pass gate 1", "0.050 s"], ["time for the card to pass gate 2", "0.025 s"], ["time for the trolley to travel from gate 1 to gate 2", "0.80 s"]]),
        parts: [
          {
            label: "(a)", type: "calc", marks: 3,
            q: "Calculate the acceleration of the trolley between the two gates.",
            steps: [
              { desc: "Relationship: a = (v − u)/t (or v = u + at)", rel: ["a=\\(?v-u\\)?[/÷]t", "v=u\\+at", "a=\\(?(δ|∆)v\\)?[/÷]t", "a=\\(?v-u\\)?[/÷]\\(?t"] },
              { desc: "Both speeds found from the card length and the gate times (0.80 m s⁻¹ and 1.6 m s⁻¹)", nums: [[0.8, 800], [1.6, 1600]] },
              { desc: "Acceleration with unit: 1.0 m s⁻²", ans: 1.0, sf: 2, unit: ["m s-2", "m/s2"] },
            ],
            sample: "u = d/t = 0.040/0.050 = 0.80 m s⁻¹\nv = d/t = 0.040/0.025 = 1.6 m s⁻¹\na = (v − u)/t\na = (1.6 − 0.80)/0.80\na = 1.0 m s⁻²",
            model: "<ul><li>a = (v − u)/t (1)</li><li>u = 0.040/0.050 = 0.80 m s⁻¹ and v = 0.040/0.025 = 1.6 m s⁻¹ (the card length must be converted to metres) (1)</li><li>a = (1.6 − 0.80)/0.80 = 1.0 m s⁻² (1)</li></ul><p>The speed at each gate is the card length divided by the time the card takes to pass. Leaving the card in mm gives speeds 1000 times too big, so the answer would be wrong by a factor of 1000.</p>",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 3, minWords: 8,
            q: "The student takes only one set of readings. Describe one improvement to the procedure, and explain how it improves the result.",
            points: [
              { desc: "Repeat the run several times (and calculate a mean acceleration)", group: "a",
                any: ["\\brepeat\\w*", "\\b(?:several|many|multiple|a number of|lots of)\\W+(?:\\w+\\W+){0,2}(?:runs?|times|readings?|trials?|measurements?|attempts?|sets)\\b", "\\bmore than once\\b", "\\bagain and again\\b", "\\b(?:take|calculate|find|use)\\W+(?:\\w+\\W+){0,2}(?:mean|average)\\b"] },
              { desc: "Variations in the readings cancel out, so the mean is closer to the true value", group: "b",
                any: ["\\bcancel\\w*", "\\b(?:averag\\w*|even\\w*|smooth\\w*)\\W+out\\b", "\\bcloser to the (?:true|actual|accepted|real|correct)", "\\brandom\\W+(?:\\w+\\W+){0,6}(?:" + DOWN + "|cancel\\w*)", "\\b(?:" + DOWN + "|minimi[sz]\\w*)\\W+(?:\\w+\\W+){0,6}random\\b", "\\b(?:" + DOWN + ")\\W+(?:\\w+\\W+){0,4}(?:effect|impact|influence)s? of (?:\\w+\\W+){0,3}(?:variation|scatter|fluctuation|chance)", "\\bscatter\\W+(?:\\w+\\W+){0,6}(?:" + DOWN + ")"] },
            ],
            sample: "The student should repeat the run several times and calculate the mean acceleration. The small variations above and below the true value are cancelled out in the mean, so the mean is closer to the true value.",
            model: "<ul><li>Repeat the readings / the run several times and take the mean (1)</li><li>Random variations above and below the true value tend to cancel, so the mean is closer to the true value / the random uncertainty is smaller (1)</li></ul><p>Also accepted for the first mark: any sensible improvement (for example a data logger to record the gate times). A bare &quot;repeat it to make it more accurate&quot; earns the first mark only: say <em>why</em> repeating helps. Repeating does <strong>not</strong> reduce a systematic uncertainty.</p>",
          },
          {
            label: "(c)", type: "text", marks: 3, rows: 6, minWords: 12,
            q: "The trolley then hits a barrier. The front of the trolley is fitted with a crumple zone that collapses on impact. Using your knowledge of physics, explain why a crumple zone reduces the risk of injury to a passenger in a crash.",
            points: [
              { desc: "The crumple zone makes the collision last longer (increases the time over which the passenger stops)", group: "a",
                not: ["\\b(?:decreas\\w*|reduc\\w*|shorten\\w*|shorter|less)\\W+(?:\\w+\\W+){0,2}(?:time|duration)\\b", "\\b(?:time|duration)\\W+(?:(?:of|for|the|is|are|gets?|becomes?|being|was|collision|impact|crash|stop\\w*)\\W+){0,3}(?:shorter|decreased|reduced|smaller|less|lower|shortened)\\b", "\\b(?:shorter|quicker|faster)\\W+(?:\\w+\\W+){0,1}(?:time|duration|collision)\\b", negFor("long\\w*|increas\\w*|extend\\w*|greater|more|extra|lengthen\\w*")],
                any: [near("long\\w*|increas\\w*|extend\\w*|greater|more|extra|lengthen\\w*|slower", "time|duration|period", 8), near("longer", "stop\\w*|rest|slow\\w*|collision|crash|impact", 5)] },
              { desc: "The change in momentum is the same (with or without the crumple zone)", group: "b", negOK: true,
                not: [negFor("same|equal|constant|unchanged|identical|fixed|unaffected"), "\\bmomentum\\s+(?:\\w+\\s+){0,2}(?:is|gets|will be|are)\\s+(?:\\w+\\W+){0,1}(?:reduced|decreased|smaller|less|lower)"],
                any: [near("momentum|impulse|mv", "same|equal|constant|unchanged|identical|fixed|unaffected", 8), "\\bmomentum\\W+(?:\\w+\\W+){0,6}(?:does ?n'?t|do ?n'?t|will not|won'?t)\\W+(?:\\w+\\W+){0,1}change"] },
              { desc: "So (Ft = mv − mu) the average force on the passenger is smaller (the force must follow from the longer time or the same change in momentum)", group: "c", win: 220,
                not: ["\\b(?:time|duration)\\W+(?:(?:of|for|the|is|are|gets?|becomes?|being|was|collision|impact|crash|stop\\w*)\\W+){0,3}(?:shorter|decreased|reduced|smaller|less|lower|shortened)\\b", "\\b(?:shorter|quicker|faster)\\W+(?:\\w+\\W+){0,1}(?:time|duration|collision)\\b", "\\b(?:decreas\\w*|reduc\\w*|shorten\\w*|less)\\W+(?:\\w+\\W+){0,2}(?:time|duration)\\b", "\\bforces?\\W+(?:(?:is|are|will be|would be|be|gets?|becomes?|then|also|just|much|even|far|a lot)\\W+){0,3}(?:larger|bigger|greater|increas\\w*|more)\\b", "\\b(?:more|larger|bigger|greater|higher)\\W+(?:\\w+\\W+){0,1}forces?\\b", negFor("smaller|less|lower|reduc\\w*|decreas\\w*|minimi[sz]\\w*")],
                all: [near("forces?", "smaller|less|lower|reduc\\w*|decreas\\w*|minimi[sz]\\w*", 6), "\\b(?:time|duration|longer|slower|slowly|momentum|impulse|ft|mv|rate of change)\\b"] },
            ],
            sample: "The crumple zone collapses slowly, so the collision lasts longer and the time over which the dummy stops is increased. The change in momentum of the dummy is the same with or without the crumple zone, so by Ft = mv − mu the average force on the dummy is smaller, and there is less injury.",
            model: "<p>Open-ended: three separate points, 1 mark each.</p><ul><li>The crumple zone increases the time of the collision / the time taken to stop (1)</li><li>The change in momentum is the same, because the mass and the velocities are unchanged (1)</li><li>Ft = mv − mu, so for the same change in momentum a longer time gives a smaller average force on the passenger (1)</li></ul><p>A bare &quot;it absorbs the energy&quot; or &quot;it makes the force smaller&quot; with no mention of time or momentum earns at most the third mark. Saying the crumple zone <em>reduces</em> the change in momentum is wrong: the dummy still stops from the same speed.</p>",
          },
        ],
      },

      /* ------------------------------------------------------------ 02 */
      {
        id: "skills-02",
        style: "Uncertainty calculations · random and percentage uncertainty",
        stem:
          "<p>A student measures the time <em>t</em> for a steel ball to fall from rest through a height <em>h</em> = (2.00 ± 0.01) m. She repeats the timing five times.</p>" +
          tbl(["Reading", "1", "2", "3", "4", "5"], [["t / s", "0.62", "0.66", "0.64", "0.69", "0.64"]]),
        parts: [
          { label: "(a)", type: "num", marks: 1, a: 0.65, sf: 2, tol: 0, unit: "s", shown: "0.65", q: "Calculate the mean value of the time.", why: "(0.62 + 0.66 + 0.64 + 0.69 + 0.64) ÷ 5 = 3.25 ÷ 5 = <strong>0.65 s</strong>. The mean of repeated readings is the best estimate of the true value." },
          {
            label: "(b)", type: "calc", marks: 2,
            q: "Calculate the random uncertainty in the mean time.",
            steps: [
              { desc: "Relationship: (maximum − minimum) ÷ number of readings, with the values substituted", rel: ["(?:max|largest|highest|biggest)\\w*-(?:min|smallest|lowest)\\w*\\)?[/÷]\\(?(?:5|n|no|number|the number)", "0\\.69-0\\.62\\)?[/÷]\\(?5", "0\\.07[/÷]5", "range[/÷]\\(?(?:5|n|no|number)"] },
              { desc: "Random uncertainty with unit: 0.014 s", ans: 0.014, sf: 2, unit: "s" },
            ],
            sample: "random uncertainty = (max − min)/number of readings\n= (0.69 − 0.62)/5\n= 0.014 s",
            model: "<ul><li>random uncertainty = (max. value − min. value) ÷ number of values = (0.69 − 0.62) ÷ 5 (1)</li><li>= 0.014 s (1)</li></ul><p>Accept 0.01 s. Dividing by 2 or by 4 instead of the number of readings is the commonest slip.</p>",
          },
          {
            label: "(c)", type: "calc", marks: 2,
            q: "Calculate the percentage uncertainty in the mean time.",
            steps: [
              { desc: "Relationship: percentage uncertainty = (uncertainty ÷ mean value) × 100, with values", rel: ["\\(?0\\.01\\d*\\)?[/÷]0\\.65", "uncertainty[/÷]\\(?(?:mean|value|reading|measurement|time)", "[/÷]\\(?(?:mean|value|reading|0\\.65)\\)?x100"] },
              { desc: "Percentage uncertainty: 2.2 %", ans: 2.153846, sf: 2, unit: ["%", "percent", "per cent"] },
            ],
            sample: "percentage uncertainty = (uncertainty/mean value) × 100\n= (0.014/0.65) × 100\n= 2.2 %",
            model: "<ul><li>% uncertainty = (absolute uncertainty ÷ value) × 100 = (0.014 ÷ 0.65) × 100 (1)</li><li>= 2.2 % (1)</li></ul><p>(Follow-through from your answer to (b): 0.01 s gives 1.5 %.) The percentage sign is the unit.</p>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 4,
            q: "The percentage uncertainty in the height is 0.50 %. Which statement about the uncertainty in the value of <em>g</em> calculated from these readings is correct?",
            opts: [
              "The height dominates, because its uncertainty of 0.01 m is bigger than the 0.014 s uncertainty in the time.",
              "The two contribute equally, because both absolute uncertainties are only a few hundredths of a unit.",
              "Neither matters, because scale-reading uncertainties are always negligible compared with random ones.",
              "The uncertainty is 0.50 %, because the height is the quantity that is measured with a ruler.",
              "The time dominates: its percentage uncertainty (2.2 %) is much greater than the height's (0.50 %).",
            ],
            why: "Compare <em>percentage</em> uncertainties, never the absolute values in different units (m against s). The largest percentage uncertainty, 2.2 % in the time, is a good estimate of the percentage uncertainty in the final result: g = 2h/t² = 9.5 m s⁻² with an uncertainty of about 2.2 %, i.e. (9.5 ± 0.2) m s⁻². To improve the experiment, improve the timing (for example electronic timing with a light gate), not the height measurement.",
          },
        ],
      },

      /* ------------------------------------------------------------ 03 */
      {
        id: "skills-03",
        style: "Uncertainty calculations · scale readings and a final value",
        stem:
          "<p>A student measures the resistance of a filament lamp. The p.d. across the lamp is read from a digital voltmeter as <strong>5.84 V</strong> (uncertainty ± 1 in the last digit, i.e. ± 0.01 V). The current is read from an analogue ammeter whose smallest division is 0.01 A: the reading is <strong>0.250 A</strong>, with a scale-reading uncertainty of ± half a division, i.e. ± 0.005 A.</p>",
        parts: [
          { label: "(a)", type: "num", marks: 1, a: 0.171233, sf: 2, tol: 0, unit: "%", shown: "0.17", q: "Calculate the percentage uncertainty in the voltmeter reading.", why: "0.01 ÷ 5.84 × 100 = <strong>0.17 %</strong>." },
          { label: "(b)", type: "num", marks: 1, a: 2.0, sf: 2, tol: 0, unit: "%", shown: "2.0", q: "Calculate the percentage uncertainty in the ammeter reading.", why: "0.005 ÷ 0.250 × 100 = <strong>2.0 %</strong>. Half of the smallest division, 0.01 A, is 0.005 A." },
          {
            label: "(c)", type: "calc", marks: 3,
            q: "Calculate the resistance of the lamp.",
            steps: [
              { desc: "Relationship: V = IR (or R = V/I)", rel: ["v=ir", "r=v[/÷]i", "i=v[/÷]r", "r=5\\.84[/÷]0?\\.25", "5\\.84=0?\\.25x?r"] },
              { desc: "Correct substitution of 5.84 V and 0.250 A", nums: [5.84, 0.25] },
              { desc: "Resistance with unit: 23.4 Ω", ans: 23.36, sf: 3, unit: ["ω", "ohm", "ohms"] },
            ],
            sample: "V = IR\n5.84 = 0.250 × R\nR = 5.84/0.250\nR = 23.4 Ω",
            model: "<ul><li>V = IR (1)</li><li>5.84 = 0.250 × R (1)</li><li>R = 23.4 Ω (1)</li></ul><p>Accept 23, 23.36. The unit is required for the final mark.</p>",
          },
          { label: "(d)", type: "num", marks: 1, a: 0.4672, sf: 1, tol: 0, unit: "Ω", shown: "0.5", q: "The larger of the two percentage uncertainties is taken as the percentage uncertainty in the resistance. Calculate the uncertainty in the resistance, in ohms.", why: "2.0 % of 23.36 Ω = 0.02 × 23.36 = 0.47 Ω, which is <strong>0.5 Ω</strong> to one significant figure. The ammeter dominates: a more precise ammeter (for example a digital one) is the improvement that matters." },
          {
            label: "(e)", type: "mcq", marks: 1, a: 0,
            q: "Which of the following states the final result correctly?",
            opts: ["(23.4 ± 0.5) Ω", "(23.36 ± 0.47) Ω", "(23 ± 0.5) Ω", "(23.4 ± 0.467) Ω", "(23.4 ± 2.0) Ω"],
            why: "The uncertainty is given to one significant figure (0.5 Ω), and the value is rounded to the <em>same decimal place</em> as the uncertainty (23.4). (23.36 ± 0.47) quotes the value to a precision the uncertainty does not support; (23 ± 0.5) rounds the value too far; (23.4 ± 0.467) gives the uncertainty too many figures; and 2.0 is the percentage uncertainty, not the absolute uncertainty in ohms.",
          },
        ],
      },

      /* ------------------------------------------------------------ 04 */
      {
        id: "skills-04",
        style: "Graph question · EMF, internal resistance and an open-ended explanation",
        stem:
          "<p>A student investigates a cell. She varies the current <em>I</em> in a circuit containing the cell, a variable resistor and an ammeter, and records the terminal potential difference <em>V</em> with a voltmeter. Her results are plotted on the graph, with the line of best fit.</p>",
        figure: figVI,
        parts: [
          { label: "(a)", type: "num", marks: 1, a: 1.5, sf: 3, tol: 0.02, unit: "V", shown: "1.50", q: "Use the graph to find the EMF of the cell.", why: "The EMF is the terminal p.d. when no current flows, so it is the intercept on the V axis: <strong>1.50 V</strong>. (V = E − Ir, so the intercept is E.)" },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Use the graph to determine the internal resistance of the cell.",
            steps: [
              { desc: "Relationship: V = E − Ir, so r is minus the gradient (or gradient = ΔV/ΔI)", rel: ["v=e-ir", "e=v\\+ir", "r=-?\\(?(?:gradient|slope)", "-?(?:gradient|slope)=", "r=-?\\(?e-v\\)?[/÷]i", "(?:gradient|slope)=-?r", "rise[/÷]run", "\\(?y2-y1\\)?[/÷]\\(?x2-x1", "(?:δ|∆)v[/÷](?:δ|∆)i", "\\(?1\\.\\d+-1\\.\\d+\\)?[/÷]\\(?0?\\.\\d"] },
              { desc: "Two points on the line used (a V reading and a current reading from the line)", nums: [[1.5, 1.44, 1.38, 1.32, 1.26, 1.2, 1.14], [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]] },
              { desc: "Internal resistance with unit: 0.60 Ω", ans: 0.6, sf: 2, abs: 0.04, signed: true, unit: ["ω", "ohm", "ohms"] },
            ],
            sample: "gradient = (1.20 − 1.50)/(0.50 − 0)\ngradient = −0.60 V A⁻¹\nV = E − Ir, so r = −gradient\nr = 0.60 Ω",
            model: "<ul><li>V = E − Ir, so the gradient of the V–I graph is −r (1)</li><li>gradient = (1.20 − 1.50) ÷ (0.50 − 0) using two points <em>on the line</em>, far apart (1)</li><li>r = 0.60 Ω (1)</li></ul><p>Accept 0.56 to 0.64 Ω. A negative gradient does not mean a negative resistance: r is the size of the gradient. Using two data points instead of two points on the line loses the second mark.</p>",
          },
          {
            label: "(c)", type: "text", marks: 3, rows: 6, minWords: 14,
            q: "A car battery has a small internal resistance. A headlamp is connected across the battery. When a heater is connected in parallel with the lamp and switched on, the lamp becomes dimmer. Using your knowledge of physics, explain why.",
            points: [
              { desc: "The total resistance of the circuit falls, so the current from the battery increases", group: "a",
                not: [negFor(DOWN + "|" + UP)],
                any: [near("(?:total|overall|circuit|combined|effective)\\W+resistance", DOWN, 5), near("current", "increas\\w*|rises?|larger|bigger|greater|higher|goes up|more|grows?", 4)] },
              { desc: "More lost volts (Ir) across the internal resistance", group: "b",
                not: [negFor(UP)],
                any: [near("lost volts|\\bir\\b|internal resistance|p\\.?d\\.? across (?:the )?(?:internal|source|battery|cell)", UP, 7)] },
              { desc: "So the terminal p.d. (the p.d. across the lamp) falls and the lamp is dimmer", group: "c",
                not: [negFor(DOWN)],
                any: [near("terminal|t\\.?p\\.?d|(?:p\\.?d\\.?|voltage|potential difference) (?:across|of|at) (?:the )?(?:lamp|bulb|headlamp|light|battery|supply|source|cell|terminals)|(?:lamp|bulb|headlamp)'?s? (?:p\\.?d\\.?|voltage|potential difference)", DOWN, 6)] },
            ],
            sample: "The heater is in parallel with the lamp, so the total resistance of the circuit is lower and the current drawn from the battery is larger. The lost volts, Ir, across the internal resistance of the battery are therefore larger. By E = V + Ir the terminal p.d. is lower, so the p.d. across the lamp is lower and the lamp is dimmer.",
            model: "<p>Open-ended: three separate points, 1 mark each.</p><ul><li>Adding the heater in parallel decreases the total resistance, so the current drawn from the battery increases (1)</li><li>The lost volts, Ir, across the internal resistance increase (1)</li><li>E = V + Ir, so the terminal p.d., which is also the p.d. across the lamp, decreases and the lamp is dimmer (1)</li></ul><p>The EMF of the battery is constant; the internal resistance is constant. It is the lost volts that change. &quot;The heater takes some of the current from the lamp&quot; is not an explanation: in parallel the lamp keeps its own branch, and its current falls only because the p.d. across it falls.</p>",
          },
        ],
      },

      /* ------------------------------------------------------------ 05 */
      {
        id: "skills-05",
        style: "Experiment and graph question · inverse square law with a light meter",
        stem:
          "<p>A student investigates how the irradiance <em>I</em> of light from a small lamp depends on the distance <em>d</em> from it, using a light meter in a darkened room. Her results are shown. She plots a graph of <em>I</em> against 1/<em>d</em>², with the line of best fit.</p>" +
          tbl(["d / m", "0.50", "0.60", "0.80", "1.0", "1.5", "2.0"], [["I / W m⁻²", "4.8", "3.3", "1.9", "1.2", "0.53", "0.30"]]),
        figure: figIS,
        parts: [
          {
            label: "(a)", type: "multi", marks: 2, a: [0, 1],
            q: "Choose the <strong>two</strong> quantities that must be kept constant for a fair test.",
            opts: ["the power of the lamp", "the background light reaching the meter", "the distance from the lamp", "the reading on the meter", "the number of readings taken"],
            why: "The lamp must give out the same power throughout, and stray light must be the same (hence the darkened room), or the irradiance would change for reasons other than the distance. The distance is the quantity the student <em>changes</em> and the meter reading is the quantity she <em>measures</em>; neither can be constant.",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Determine the gradient of the line of best fit, with its unit.",
            steps: [
              { desc: "Relationship: gradient = rise ÷ run (or k = Id² from I = k/d²)", rel: ["gradient=", "slope=", "rise[/÷]run", "\\(?y2-y1\\)?[/÷]\\(?x2-x1", "(?:δ|∆)y[/÷](?:δ|∆)x", "k=id\\^?2", "i=k[/÷]d\\^?2", "(?:gradient|slope)=k"] },
              { desc: "Two points on the line used, far apart", nums: [[0.3, 0.53, 0.6, 0.9, 1.2, 1.8, 1.9, 2.4, 3.0, 3.3, 3.33, 3.6, 4.2, 4.8], [0.25, 0.44, 0.5, 1.0, 1.5, 1.56, 2.0, 2.5, 2.78, 3.0, 3.5, 4.0]] },
              { desc: "Gradient with unit: 1.2 W", ans: 1.2, sf: 2, abs: 0.1, unit: ["w", "w m-2 / m-2"] },
            ],
            sample: "gradient = rise/run\ngradient = (4.8 − 0)/(4.0 − 0)\ngradient = 1.2 W",
            model: "<ul><li>gradient = rise ÷ run (1)</li><li>= (4.8 − 0) ÷ (4.0 − 0) using two widely spaced points on the line (1)</li><li>= 1.2 W (the unit is (W m⁻²) ÷ (m⁻²) = W) (1)</li></ul><p>Accept 1.1 to 1.3 W (the ends of the range are included). The gradient is the constant <em>k</em> in I = k/d². Don't forget the unit: the powers of ten and units on the axes are a common place to lose a mark.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 3, minWords: 2,
            q: "The student concludes that her results support the inverse square law, I = k/d². Explain how the graph supports this conclusion.",
            points: [
              { desc: "The graph is a straight line", group: "a",
                not: ["\\b(?:is|are|forms?|makes?|shows?|gives?|has|looks? like)\\W+(?:an?\\W+)?(?:\\w+\\W+)?curv\\w*", "\\bnot\\W+(?:\\w+\\W+){0,2}(?:straight|linear)"],
                any: ["\\bstraight\\b", "\\blinear\\b"] },
              { desc: "which passes through the origin, so I is directly proportional to 1/d²", group: "b",
                not: ["\\b(?:is|are|forms?|makes?|shows?|gives?|has|looks? like)\\W+(?:an?\\W+)?(?:\\w+\\W+)?curv\\w*", "\\b(?:not|n't|never|without)\\W+(?:\\w+\\W+){0,3}(?:through|passes|pass|origin|proportional)"],
                any: ["\\b(?:through|passes|passing|goes|go|cuts|crosses|starts|starting|begins|intercepts?)\\W+(?:\\w+\\W+){0,3}(?:origin|zero|\\(?0 ?, ?0\\)?)", "\\bdirect(?:ly)?\\W+proportion\\w*\\W+(?:\\w+\\W+){0,4}(?:1 ?/ ?d|1 over d|one over d|inverse)", "(?<!inverse)(?<!inversely)\\bproportional\\W+to\\W+(?:\\w+\\W+){0,1}(?:1 ?/ ?d|one over d|the inverse)", "\\b(?:zero|0)\\W+(?:y-?)?intercept\\b", "\\bpasses? through 0\\b"] },
            ],
            sample: "The graph of I against 1/d² is a straight line, and the line goes through the origin, so the irradiance is directly proportional to 1/d², which is the inverse square law.",
            model: "<ul><li>The graph is a straight line (1)</li><li>that passes through the origin, so I is directly proportional to 1/d² (1)</li></ul><p>A straight line that did <em>not</em> pass through the origin would show a linear relationship but not direct proportionality. Do not force the line through the origin: a best-fit line is drawn to fit the points, and passing through the origin is a result to be observed, not a starting point. Saying the graph is a curve, or that I is inversely proportional to d, does not describe this graph.</p>",
          },
        ],
      },

      /* ------------------------------------------------------------ 06 */
      {
        id: "skills-06",
        style: "Data analysis · photoelectric effect graph and an open-ended explanation",
        stem:
          "<p>A student shines light of different frequencies on a clean metal surface in a vacuum tube and measures the maximum kinetic energy <em>E</em><sub>k</sub> of the electrons that are emitted. The graph shows her results and the line of best fit.</p>",
        figure: figPE,
        parts: [
          { label: "(a)", type: "num", marks: 1, a: 5.0e14, alts: [500], unitAlts: ["THz"], sf: 2, tol: 0, rel: 0.06, unit: "Hz", shown: "5.0 × 10¹⁴", q: "Use the graph to find the threshold frequency of the metal.", why: "No electrons are emitted when E<sub>k</sub> = 0, so the threshold frequency is where the line meets the frequency axis: <strong>5.0 × 10¹⁴ Hz</strong>. Remember the axis is in units of 10¹⁴ Hz. Accept 4.7 to 5.3 × 10¹⁴ Hz, or the same value in terahertz (500 THz): 1 THz = 10¹² Hz." },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Use the graph to determine a value for the Planck constant.",
            steps: [
              { desc: "Relationship: E_k = hf − hf₀, so h is the gradient (rise ÷ run)", rel: ["ek=hf-hf0", "gradient=", "slope=", "h=(?:gradient|slope)", "(?:gradient|slope)=h", "rise[/÷]run", "\\(?y2-y1\\)?[/÷]\\(?x2-x1", "h=\\(?e"] },
              { desc: "Two points on the line used, with the powers of ten", nums: [[0.663e-19, 1.326e-19, 1.989e-19, 2.652e-19, 3.315e-19, 0.663, 1.326, 1.989, 2.652, 3.315, 0.69e-19, 1.30e-19, 1.99e-19, 2.62e-19, 3.35e-19, 0.69, 1.30, 1.99, 2.62, 3.35], [6.0e14, 7.0e14, 8.0e14, 9.0e14, 10.0e14, 5.0e14, 6.0, 7.0, 8.0, 9.0, 10.0, 5.0]] },
              { desc: "h with unit: 6.6 × 10⁻³⁴ J s", ans: 6.63e-34, sf: 2, rel2: 0.045, unit: ["j s", "j hz-1", "j/hz", "kg m2 s-1"] },
            ],
            sample: "E_k = hf − hf₀, so the gradient of the graph is h\ngradient = (3.3 × 10⁻¹⁹ − 0)/(10.0 × 10¹⁴ − 5.0 × 10¹⁴)\nh = 6.6 × 10⁻³⁴ J s",
            model: "<ul><li>E<sub>k</sub> = hf − hf<sub>0</sub>, so h = gradient of the graph (1)</li><li>gradient = (3.3 × 10⁻¹⁹ − 0) ÷ (10.0 × 10¹⁴ − 5.0 × 10¹⁴), with the powers of ten included (1)</li><li>h = 6.6 × 10⁻³⁴ J s (1)</li></ul><p>Accept 6.4 to 6.9 × 10⁻³⁴. J Hz⁻¹ is the same unit as J s. Forgetting the 10⁻¹⁹ and 10¹⁴ on the axes gives 0.66, which is out by a factor of 10³³: always carry the powers of ten shown on the axis labels into the calculation.</p>",
          },
          { label: "(c)", type: "num", marks: 1, a: 3.315e-19, sf: 2, tol: 0, unit: "J", shown: "3.3 × 10⁻¹⁹", q: "Calculate the work function of the metal.", why: "The work function is hf<sub>0</sub> = 6.63 × 10⁻³⁴ × 5.0 × 10¹⁴ = <strong>3.3 × 10⁻¹⁹ J</strong>. (It is also minus the intercept of the line on the E<sub>k</sub> axis if the line is extended back.)" },
          {
            label: "(d)", type: "text", marks: 3, rows: 6, minWords: 14,
            q: "Light of frequency 4.0 × 10¹⁴ Hz is shone on the metal and no electrons are emitted, even when the beam is made very bright. Using your knowledge of physics, explain why.",
            points: [
              { desc: "Light arrives as packets (photons) and the energy of each is E = hf, set by the frequency", group: "a",
                any: ["\\be ?= ?hf\\b", "\\bhf\\b", "\\bphotons?\\W+(?:\\w+\\W+){0,6}energy\\W+(?:\\w+\\W+){0,8}frequency", "\\benergy\\W+(?:\\w+\\W+){0,6}photons?\\W+(?:\\w+\\W+){0,8}frequency", "\\bfrequency\\W+(?:\\w+\\W+){0,8}(?:determines?|decides?|sets?|gives?)\\W+(?:\\w+\\W+){0,4}energy", "\\bfrequency\\W+(?:\\w+\\W+){0,6}(?:below|less than|lower than|under)\\W+(?:\\w+\\W+){0,3}(?:threshold|f0)"] },
              { desc: "Each photon has less energy than the work function, so it cannot free an electron", group: "b", negOK: true,
                not: [negFor("less|lower|smaller|below|insufficient|too|lacks?|greater|larger|bigger|higher|more"), "\\b(?:do|does|can|will|would)\\s+(?:have|has|carry|carries|give|gives|provide)\\s+(?:\\w+\\s+)?(?:enough|sufficient)", "(?<!not )(?<!n't )\\b(?:has|have)\\s+(?:more|greater|enough|sufficient)\\s+(?:\\w+\\s+)?energy"],
                any: ["\\b(?:not|insufficient|inadequate|isn't|aren't|doesn't|don't)\\W+(?:\\w+\\W+){0,3}(?:enough|sufficient)\\W+(?:\\w+\\W+){0,2}energy", "\\benergy\\W+(?:\\w+\\W+){0,4}(?:not|isn't|insufficient)\\W+(?:\\w+\\W+){0,2}(?:enough|sufficient|great|large|big|high)", "\\b(?:photons?|energy|hf)\\W+(?:\\w+\\W+){0,12}(?:less|lower|smaller|below|insufficient|too (?:little|low|small)|lacks?)\\W+(?:\\w+\\W+){0,10}(?:work function|threshold|escape|leave|free|remov\\w*|emit\\w*|releas\\w*|overcome|hf0|surface)", "\\b(?:work function|threshold|hf0)\\W+(?:\\w+\\W+){0,12}(?:greater|larger|bigger|higher|more|exceeds?)\\W+(?:\\w+\\W+){0,6}(?:photon|energy)", "\\b(?:too little|insufficient|not enough|less than)\\W+(?:\\w+\\W+){0,3}energy\\W+(?:\\w+\\W+){0,12}(?:escape|leave|free|remov\\w*|work function|surface)"] },
              { desc: "A brighter beam gives more photons, not photons of greater energy", group: "c",
                not: ["\\b(?:number of photons|photons?)\\W+(?:\\w+\\W+){0,2}(?:is|are|do|does|will)\\W+not\\W+(?:\\w+\\W+){0,1}(?:increas\\w*|rise|chang\\w*|get more|more|produc\\w*)\\b", negFor("same|unchanged|constant|still|more|larger|greater|increas\\w*")],
                any: ["\\b(?:more|greater|larger|bigger|increased|increasing|extra|higher)\\W+(?:\\w+\\W+){0,2}photons\\b", "\\b(?:number|amount) of photons\\W+(?:\\w+\\W+){0,4}(?:" + UP + ")\\b", "\\b(?:each|every|individual|single) photon\\W+(?:\\w+\\W+){0,8}(?:same|unchanged|constant|still)", "\\b(?:same|unchanged|constant)\\W+(?:\\w+\\W+){0,3}(?:photon energy|energy of (?:each|the|every|a) photon)"],
                all: ["\\b(?:same|unchanged|constant|still|identical)\\W+(?:\\w+\\W+){0,3}energy|\\benergy\\W+(?:\\w+\\W+){0,5}(?:same|unchanged|constant|still|identical)|\\b(?:not|n't|no|never|nor)\\W+(?:\\w+\\W+){0,3}(?:greater|more|higher|larger|bigger|increas\\w*|extra)\\W+(?:\\w+\\W+){0,2}energy|(?:won't|wouldn't|doesn't|does not|do not|will not|cannot|can't|didn't|did not)\\W+(?:\\w+\\W+){0,2}(?:help|free|release|emit|eject|work|matter|change|make)"], win: 200 },
            ],
            sample: "Light is delivered in photons, and the energy of each photon is E = hf, so it depends only on the frequency. At 4.0 × 10¹⁴ Hz each photon has less energy than the work function, which is too little to free an electron from the surface. A brighter beam means that the number of photons arriving each second is larger, but the energy of each photon is the same, so no electrons are emitted.",
            model: "<p>Open-ended: three separate points, 1 mark each.</p><ul><li>Light consists of photons, each with energy E = hf (so the energy depends on frequency) (1)</li><li>At 4.0 × 10¹⁴ Hz (below the threshold frequency of 5.0 × 10¹⁴ Hz) the energy of a photon is less than the work function, so an electron cannot absorb enough energy to leave the surface (1)</li><li>Increasing the irradiance increases the <em>number</em> of photons per second, not the energy of each photon; one electron absorbs one photon, so the energy cannot be saved up (1)</li></ul><p>Don't say the electrons &quot;do not have enough energy&quot;: it is the <em>photons</em> that carry too little energy.</p>",
          },
        ],
      },

      /* ------------------------------------------------------------ 07 */
      {
        id: "skills-07",
        style: "Graph question · acceleration due to gravity, systematic uncertainty and an open-ended explanation",
        stem:
          "<p>A student measures the acceleration due to gravity, <em>g</em>. She releases a small ball from rest at different heights <em>h</em> above a trapdoor switch and records the time <em>t</em> for the ball to fall. She plots <em>h</em> against <em>t</em>², with the line of best fit.</p>" +
          tbl(["t² / s²", "0.10", "0.20", "0.30", "0.40", "0.50"], [["h / m", "0.58", "1.01", "1.53", "1.99", "2.54"]]),
        figure: figHT,
        parts: [
          {
            label: "(a)", type: "calc", marks: 3,
            q: "Use the graph to determine a value for <em>g</em>.",
            steps: [
              { desc: "Relationship: h = ½gt², so the gradient of h against t² is g/2 (g = 2 × gradient)", rel: ["h=(?:0\\.5|1/2|½)gt\\^?2", "s=ut\\+(?:0\\.5|1/2|½)at\\^?2", "(?:gradient|slope)=g[/÷]2", "g[/÷]2=(?:gradient|slope)", "g=2x\\(?(?:gradient|slope)", "g=2x\\(?m\\)?", "g=2x\\(?[0-9]", "2x(?:gradient|slope)"] },
              { desc: "Gradient from two points on the line", nums: [[0.06, 0.55, 1.04, 1.53, 2.02, 2.51, 3.0], [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]] },
              { desc: "g with unit: 9.8 m s⁻²", ans: 9.8, sf: 2, abs: 0.4, unit: ["m s-2", "m/s2", "n kg-1", "n/kg"] },
            ],
            sample: "s = ut + ½at² with u = 0, so h = ½gt² and the gradient is g/2\ngradient = (2.51 − 0.06)/(0.50 − 0)\ngradient = 4.9 m s⁻²\ng = 2 × 4.9\ng = 9.8 m s⁻²",
            model: "<ul><li>h = ½gt², so the gradient = g/2 (1)</li><li>gradient = (2.51 − 0.06) ÷ (0.50 − 0) = 4.9 m s⁻², from two widely spaced points on the line (1)</li><li>g = 2 × 4.9 = 9.8 m s⁻² (1)</li></ul><p>Accept 9.4 to 10.2 m s⁻². The most common slip is to quote the gradient as g, forgetting the factor 2.</p>",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 3, minWords: 8,
            q: "The line of best fit meets the h axis at 0.06 m, not at zero. State the type of uncertainty this indicates and suggest a possible cause.",
            points: [
              { desc: "A systematic uncertainty (error)", group: "a",
                not: ["\\b(?:not|isn'?t|is no|never)\\W+(?:a |an |the |any )?systematic", "\\b(?:is|it'?s|be|called)\\W+(?:an?\\W+)?random\\b"],
                any: ["\\bsystematic\\b", "\\bzero error\\b", "\\boffset\\b"] },
              { desc: "Every h reading is too large (or too small) by the same amount, e.g. h measured from the wrong point", group: "b",
                not: [negFor("too|larger|bigger|smaller|greater|higher|lower|wrong|offset|shifted|same|constant|out|measured|read|taken|incorrect"), "\\b(?:random)\\b\\W+(?:\\w+\\W+){0,3}(?:uncertainty|error)s?\\W+(?:\\w+\\W+){0,2}(?:caus|due|from)"],
                any: ["\\b(?:all|every|each)\\W+(?:\\w+\\W+){0,3}(?:readings?|measurements?|heights?|values?|h)\\W+(?:\\w+\\W+){0,8}(?:too (?:large|big|small|high|low|great|long|short)|larger|bigger|smaller|greater|higher|lower|wrong|offset|shifted|same amount|constant|out by)", "\\b(?:measured|measuring|starting|started|taken|read|measure)\\W+(?:\\w+\\W+){0,2}from the (?:wrong|top|bottom|centre|center|edge|base|middle|end)", "\\b(?:wrong|incorrect)\\W+(?:\\w+\\W+){0,1}(?:start|starting|release|zero|point|place|position|reference|height)", "\\b(?:h|height|distance|length)\\W+(?:was|is|were|has been|measured|had)\\W+(?:\\w+\\W+){0,5}(?:wrong|too (?:large|big|small|long|short|high|low)|always|constant|offset)", "\\bnot (?:been )?measured (?:from|to) the (?:right|correct)", "\\bswitch\\W+(?:\\w+\\W+){0,8}(?:below|above|lower|higher|further|closer|wrongly|misplaced)", "\\bzero (?:error|offset)\\b", "\\b(?:ruler|rule|scale|tape)\\W+(?:\\w+\\W+){0,6}(?:zero|start\\w*|begin\\w*|worn|chopped|not at)", "\\b(?:consistent|constant|fixed|same)\\W+(?:\\w+\\W+){0,3}(?:offset|error|amount|shift)"] },
            ],
            sample: "This is a systematic uncertainty. Every height reading is too large by the same 0.06 m, because the height is measured from the wrong point on the ball.",
            model: "<ul><li>Systematic uncertainty (1)</li><li>Every height is out by the same amount, e.g. h was measured from the bottom of the ball but the ball was released from its top, or the trapdoor was lower than the position the height was measured to; or the ball was not released exactly at the height that was measured (1)</li></ul><p>A timing delay is <em>not</em> a valid cause here: a delay adds a fixed time to every reading, which would change the shape of the h against t² graph rather than shift it up the h axis. Random uncertainties scatter the points about the line; they do not shift the whole line. The line has not been forced through the origin: it is drawn where the points lie, and the shift of 0.06 m is real evidence of a systematic effect.</p>",
          },
          {
            label: "(c)", type: "text", marks: 3, rows: 6, minWords: 14,
            q: "At the height of the International Space Station, g is 8.7 N kg⁻¹. Astronauts in the station nevertheless float. Using your knowledge of physics, explain why.",
            points: [
              { desc: "Gravity (the astronaut's weight) still acts on them, as strongly as at the surface", group: "a",
                not: [negFor("still|acting|acts?|strong\\w*|almost|nearly|close|present|exist\\w*|about")],
                any: ["\\b(?:gravity|gravitational|weight|pull of the earth|earth'?s pull)\\W+(?:\\w+\\W+){0,6}(?:still|acts?|exists?|present|strong|almost|nearly|close|about 9\\d|90)", "\\b(?:still|almost|nearly|about)\\W+(?:\\w+\\W+){0,4}(?:gravity|gravitational|weight)"] },
              { desc: "The astronauts and the station are in free fall, accelerating towards the Earth at the same rate (gravity gives the centripetal acceleration of the orbit)", group: "b",
                any: ["\\bfree[- ]?fall\\w*", "\\bfall(?:ing|s)?\\W+(?:\\w+\\W+){0,6}(?:together|same (?:rate|acceleration)|towards (?:the )?earth|around (?:the )?earth)", "\\baccelerat\\w+\\W+(?:\\w+\\W+){0,3}(?:towards|to|toward)\\W+(?:\\w+\\W+){0,2}(?:earth|centre|center)\\W+(?:\\w+\\W+){0,6}(?:together|same|both)", "\\b(?:together|both)\\W+(?:\\w+\\W+){0,6}accelerat\\w+\\W+(?:\\w+\\W+){0,3}(?:towards|toward|to) (?:the )?earth"] },
              { desc: "Nothing pushes up on them (no reaction/contact force from the floor), so they feel no weight", group: "c", negOK: true,
                not: ["\\b(?:nothing|no|zero)\\W+(?:\\w+\\W+){0,3}(?:is|are|does|do)\\s+not\\b"],
                any: ["\\b(?:no|nothing|zero)\\W+(?:\\w+\\W+){0,3}(?:reaction|contact force|normal force|push\\w*|support\\w*)", "\\b(?:reaction|contact|normal|supporting|support)\\W+(?:\\w+\\W+){0,2}force\\W+(?:\\w+\\W+){0,4}(?:zero|none|no|absent)", "\\bnothing (?:pushes|to push|supports|is pushing)", "\\b(?:feel|feels|feeling|experience|experiences)\\W+(?:\\w+\\W+){0,2}(?:no|zero) (?:weight|force|push)", "\\b(?:floor|station|surface)\\W+(?:\\w+\\W+){0,4}(?:pushes?|exerts?|provides?)\\W+(?:\\w+\\W+){0,3}(?:no|zero)"] },
            ],
            sample: "Gravity is still acting on the astronauts, and the pull is nearly as strong as at the surface. The astronauts and the station are in free fall together, accelerating towards the Earth at the same rate as they move around it. Nothing is pushing up on the astronauts from the floor, so they feel no weight and float.",
            model: "<p>Open-ended: three separate points, 1 mark each.</p><ul><li>Gravity (their weight) still acts: g is about 90 % of its value at the surface (1)</li><li>The astronauts and the station are in free fall, all accelerating towards the Earth at the same rate; gravity is the only force and provides the acceleration that keeps them in orbit (1)</li><li>No contact (reaction) force acts between the floor and the astronauts, so there is nothing pushing up on them and they feel weightless and float (1)</li></ul><p>&quot;There is no gravity in space&quot; is wrong: the weight is almost unchanged. They float because nothing supports them.</p>",
          },
        ],
      },

      /* ------------------------------------------------------------ 08 */
      {
        id: "skills-08",
        style: "Experiment question · wavelength of a laser with a diffraction grating",
        stem:
          "<p>A student determines the wavelength of a green laser. The beam passes through a diffraction grating with <strong>400 lines per millimetre</strong>, and a pattern of maxima is seen on a screen 2.00 m from the grating. She measures the angle θ between the central maximum and the first-order maximum as <strong>12.3°</strong>. The distance on the screen is measured with a metre rule that reads to ± 1 mm.</p>",
        figure: figGrating,
        parts: [
          {
            label: "(a)", type: "calc", marks: 3,
            q: "Calculate the wavelength of the laser light, in metres.",
            steps: [
              { desc: "Relationship: d sin θ = mλ", rel: ["dsin(?:\\(?θ\\)?|\\(?theta\\)?)=m?(?:λ|lambda)", "(?:λ|lambda)=dsin", "dsin\\w*=m?(?:λ|lambda|l)", "(?:λ|lambda)=(?:2\\.5(?:x10\\^-?6|e-?6)|0\\.0025|2\\.5)x?sin"] },
              { desc: "Grating spacing d = 1/400 000 = 2.5 × 10⁻⁶ m", nums: [[2.5e-6, 2.5, 0.0025]] },
              { desc: "Wavelength with unit: 5.33 × 10⁻⁷ m", ans: 5.325759e-7, sf: 3, unit: "m" },
            ],
            sample: "d = 1/400 000 = 2.5 × 10⁻⁶ m\nd sin θ = mλ\n2.5 × 10⁻⁶ × sin 12.3° = 1 × λ\nλ = 5.33 × 10⁻⁷ m",
            model: "<ul><li>d sin θ = mλ (1)</li><li>d = 1/400 000 = 2.5 × 10⁻⁶ m, then 2.5 × 10⁻⁶ × sin 12.3° = 1 × λ (1)</li><li>λ = 5.33 × 10⁻⁷ m (1)</li></ul><p>Accept 5.3 × 10⁻⁷ m (533 nm). For the first-order maximum m = 1. Using 400 mm⁻¹ as d without converting to a spacing is the commonest error.</p>",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4, minWords: 10,
            q: "Suggest one change to the arrangement that would reduce the uncertainty in θ. Explain why the change helps.",
            points: [
              { desc: "A change such as moving the screen further from the grating, measuring across both first orders, or using a higher order", group: "a",
                not: [negFor("move\\w*|further|farther|increas\\w*|longer|greater|larger|bigger|extend\\w*")],
                any: [near("distance|screen", "increas\\w*|longer|further|farther|greater|larger|bigger|move\\w*|away|extend\\w*", 6), "\\b(?:between|across)\\W+(?:the )?(?:\\w+\\W+){0,1}(?:first|1st|two|both)\\W+(?:\\w+\\W+){0,2}(?:orders?|maxima|spots|fringes|dots)", "\\bboth sides\\b|\\beither side\\b", "\\b(?:second|2nd|higher|third|3rd)\\W+(?:\\w+\\W+){0,1}order", "\\bmore lines\\b|\\bfiner grating\\b|\\bhigher number of lines\\b"] },
              { desc: "The measured length (or angle) is bigger, so the same ± 1 mm is a smaller percentage (fraction) of it", group: "b", win: 140,
                not: [negFor("smaller|less|lower|larger|bigger|greater|longer|increas\\w*")],
                all: ["\\b(?:percentage|%|per ?cent|fraction|proportion|relative|ratio|smaller part|smaller portion|same (?:absolute )?(?:uncertainty|error)|same 1 ?mm|1 ?mm)", "\\b(?:larger|bigger|greater|longer|increas\\w*|wider|further)\\W+(?:\\w+\\W+){0,6}(?:distance|separation|angle|reading|measurement|value|length|spacing|x)\\b|\\b(?:both|two|either)\\W+(?:\\w+\\W+){0,4}(?:orders?|maxima|sides?|spots)\\b|\\b(?:further|farther|more|wider|greater)\\W+apart\\b|\\bspread\\w*\\W+(?:out|further|wider)|\\b(?:distance|separation|angle|reading|measurement|value|length|spacing)\\W+(?:\\w+\\W+){0,6}(?:larger|bigger|greater|longer|increas\\w*|wider)\\b"] },
            ],
            sample: "The screen should be moved further from the grating. The distance on the screen between the maxima is then larger, so the same 1 mm reading uncertainty is a smaller percentage of the measured distance.",
            model: "<ul><li>Increase the distance from the grating to the screen (or measure the distance between the two first-order maxima and halve it, or use a higher order, or a grating with more lines per mm) (1)</li><li>The length measured on the screen is larger but the scale-reading uncertainty (± 1 mm) is the same, so it is a smaller percentage of the reading (1)</li></ul><p>&quot;Repeat and take a mean&quot; reduces random uncertainty but does not answer a question about the scale-reading uncertainty of the length measurement.</p>",
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 2,
            q: "Which of the following is the most important safety precaution when using the laser?",
            opts: ["Wear thin cotton gloves while handling the grating, so that it is not marked by fingerprints.", "Keep the room brightly lit, so that the beam from the laser is dimmer and easier to ignore.", "Make sure the beam can never reach anyone's eyes, directly or by reflection.", "Switch the laser on only when the screen has been removed, so that nothing reflects the beam.", "Hold the laser in the hand to keep it steady, standing close to the screen while readings are taken."],
            why: "A laser beam can damage the retina. The precautions are to never look into the beam and to stop it being reflected into anyone's eyes (remove shiny objects, and point it at the screen), and to use a low-power laser. Gloves, room lighting and holding the laser do not address the hazard; and a beam with no screen has nothing to stop it.",
          },
        ],
      },

      /* ------------------------------------------------------------ 09 */
      {
        id: "skills-09",
        style: "Experiment question · speed of sound with two microphones and a timer",
        stem:
          "<p>A student measures the speed of sound in air. Two microphones, M<sub>1</sub> and M<sub>2</sub>, are placed in a straight line with a small loudspeaker. A timer starts when a short pulse of sound reaches M<sub>1</sub> and stops when it reaches M<sub>2</sub>. The distance between the microphones is 1.50 m, measured with a tape reading to ± 1 mm. The timer reads <strong>4.4 ms</strong>, with a scale-reading uncertainty of ± 0.1 ms.</p>",
        parts: [
          {
            label: "(a)", type: "multi", marks: 2, a: [0, 1],
            q: "Which <strong>two</strong> measurements are needed to calculate the speed of sound?",
            opts: ["the distance between the microphones", "the time for the pulse to travel between the microphones", "the amplitude of the pulse", "the frequency of the pulse", "the mass of the loudspeaker"],
            why: "Speed = distance ÷ time, so only the separation of the microphones and the time the pulse takes to travel that distance are needed. The amplitude, frequency and mass do not change the speed of sound in air (the speed depends on the air, e.g. its temperature).",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Calculate the speed of sound from these measurements.",
            steps: [
              { desc: "Relationship: d = vt (or v = d/t)", rel: ["v=d[/÷]t", "d=v\\u0304?t", "t=d[/÷]v", "v=s[/÷]t", "s=v\\u0304?t"] },
              { desc: "Substitution with the time in seconds: 1.50 and 4.4 × 10⁻³", nums: [1.5, [4.4e-3, 0.0044, 4.4]], not: ["0\\.34\\d*m(?:s-1|/s|s\\^-1)\\.?$"] },
              { desc: "Speed with unit: 3.4 × 10² m s⁻¹", ans: 340.909, sf: 2, unit: ["m s-1", "m/s"] },
            ],
            sample: "d = vt\n1.50 = v × 4.4 × 10⁻³\nv = 1.50/(4.4 × 10⁻³)\nv = 3.4 × 10² m s⁻¹",
            model: "<ul><li>d = vt (1)</li><li>1.50 = v × 4.4 × 10⁻³ (the time converted from ms to s) (1)</li><li>v = 3.4 × 10² m s⁻¹ (341 m s⁻¹) (1)</li></ul><p>Leaving the time as 4.4 gives 0.34 m s⁻¹, which is out by a factor of 1000.</p>",
          },
          { label: "(c)", type: "num", marks: 1, a: 2.2727, sf: 2, tol: 0, unit: "%", shown: "2.3", q: "Calculate the percentage uncertainty in the time.", why: "0.1 ÷ 4.4 × 100 = <strong>2.3 %</strong>. For comparison the distance is uncertain by only 0.001 ÷ 1.50 × 100 = 0.07 %, so the timing dominates the uncertainty in the speed." },
          {
            label: "(d)", type: "mcq", marks: 1, a: 0,
            q: "Which change would reduce the percentage uncertainty in the calculated speed the most?",
            opts: ["Move the microphones further apart, so that the pulse takes longer to travel between them.", "Use a louder pulse of sound, so that the microphones are triggered more reliably each time.", "Use a lower-pitched pulse of sound, so that it travels more slowly between the microphones.", "Measure the distance to the nearest centimetre, so that the length is quicker to read.", "Move the microphones closer together, so that the time to be measured is much shorter."],
            why: "The timing is the largest percentage uncertainty. Moving the microphones further apart makes the time longer, while the ± 0.1 ms scale uncertainty stays the same, so it becomes a smaller percentage of the time. Loudness and pitch do not change the timer's reading uncertainty; a coarser distance measurement makes things worse; and moving the microphones closer makes the time shorter and the percentage uncertainty larger.",
          },
        ],
      },

      /* ------------------------------------------------------------ 10 */
      {
        id: "skills-10",
        style: "Data table · capacitance, prefixes and quantities",
        stem:
          "<p>A student charges a capacitor from a variable d.c. supply and measures the charge stored at several potential differences using a coulomb meter. Her results are shown.</p>" +
          tbl(["V / V", "2.0", "4.0", "6.0", "8.0", "10.0"], [["Q / µC", "9.7", "19.1", "28.8", "38.6", "48.3"]]),
        parts: [
          {
            label: "(a)", type: "calc", marks: 3,
            q: "Use the reading at 6.0 V to calculate the capacitance of the capacitor, in farads.",
            steps: [
              { desc: "Relationship: C = Q/V", rel: ["c=q[/÷]v", "q=cv", "v=q[/÷]c"] },
              { desc: "Substitution with the charge converted to coulombs: 28.8 × 10⁻⁶ C and 6.0 V", nums: [[2.88e-5, 28.8], 6.0] },
              { desc: "Capacitance with unit: 4.8 × 10⁻⁶ F (or 4.8 µF)", ans: 4.8e-6, sf: 2, unit: ["f", "farad", "farads"] },
            ],
            sample: "C = Q/V\nC = 28.8 × 10⁻⁶ / 6.0\nC = 4.8 × 10⁻⁶ F",
            model: "<ul><li>C = Q/V (1)</li><li>C = 28.8 × 10⁻⁶ ÷ 6.0 (the prefix µ means 10⁻⁶) (1)</li><li>C = 4.8 × 10⁻⁶ F (1)</li></ul><p>The answer is 4.8 µF. Forgetting that µ is 10⁻⁶ gives 4.8 F, a million times too big.</p>",
          },
          {
            label: "(b)", type: "multi", marks: 2, a: [0, 2],
            q: "Which <strong>two</strong> of the following are vector quantities?",
            opts: ["displacement", "speed", "momentum", "energy", "time"],
            why: "A vector has size <em>and</em> direction: displacement and momentum (momentum = mv has the direction of the velocity). Speed, energy and time have size only, so they are scalars.",
          },
          {
            label: "(c)", type: "match", marks: 3,
            q: "Match each prefix to the power of ten it stands for.",
            pairs: [["nano (n)", "10⁻⁹"], ["micro (µ)", "10⁻⁶"], ["giga (G)", "10⁹"]],
          },
        ],
      },

      /* ------------------------------------------------------------ 11 */
      {
        id: "skills-11",
        style: "Data analysis · charging a capacitor with a constant current",
        stem:
          "<p>A student charges an initially uncharged capacitor from a source that supplies 40 µA throughout the experiment. She reads the potential difference V across the capacitor every 10 s with a digital voltmeter. Her results lie on a straight line through the origin.</p>" +
          tbl(["t / s", "10", "20", "30", "40", "50"], [["V / V", "0.85", "1.70", "2.55", "3.40", "4.26"]]),
        parts: [
          { label: "(a)", type: "num", marks: 1, a: 0.0851, sf: 2, tol: 0.002, unit: "V s⁻¹", shown: "0.085", q: "Determine the gradient of the graph of V against t, in V s⁻¹.", why: "gradient = (4.26 − 0.85) ÷ (50 − 10) = <strong>0.085 V s⁻¹</strong>. Using the origin and the last point gives 4.26 ÷ 50 = 0.085 V s⁻¹ as well. Accept 0.083 to 0.087." },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "The gradient of the graph is equal to I/C. Use the gradient to calculate the capacitance of the capacitor.",
            steps: [
              { desc: "Relationship: C = I ÷ gradient (from V = Q/C and Q = It)", rel: ["c=i[/÷](?:gradient|slope|m)", "c=q[/÷]v", "q=it", "gradient=i[/÷]c", "slope=i[/÷]c", "c=it[/÷]v", "v=it[/÷]c", "i[/÷]c=(?:gradient|slope|0\\.08)", "c=4(?:0|x10\\^-?5|e-5)[/÷]"] },
              { desc: "Substitution: 40 µA (4.0 × 10⁻⁵ A) and the gradient 0.085 V s⁻¹", nums: [[4e-5, 40], [0.085, 0.0851, 0.0853, 0.0848, 0.85, 1.7, 2.55, 3.4, 4.26]], tol: 0.01, not: ["(?:gradient|slope)[/÷]i", "0\\.08\\d*[/÷]\\(?(?:4\\.?0?x10\\^-?5|4\\.?0?e-5|40x10\\^-?6|40e-6)"] },
              { desc: "Capacitance with unit: 4.7 × 10⁻⁴ F (470 µF)", ans: 4.706e-4, sf: 2, rel2: 0.03, unit: ["f", "farad", "farads"] },
            ],
            sample: "C = I/gradient\nC = 40 × 10⁻⁶ / 0.085\nC = 4.7 × 10⁻⁴ F",
            model: "<ul><li>gradient = I/C, so C = I ÷ gradient (1)</li><li>C = 40 × 10⁻⁶ ÷ 0.085 (the prefix µ is 10⁻⁶) (1)</li><li>C = 4.7 × 10⁻⁴ F (= 470 µF) (1)</li></ul><p>Accept 4.6 to 4.9 × 10⁻⁴ F, and the answer in microfarads. Forgetting the µ gives 470 F, a million times too big. The gradient comes from Q = It and V = Q/C: V = (I/C)t.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "Explain why the graph of V against t is a straight line.",
            points: [
              { desc: "The current is constant, so the charge stored increases at a steady rate (Q = It, charge proportional to time)",
                not: [negFor("constant|steady|proportional|same|fixed", 2)],
                any: [near("current", "constant|steady|fixed|same", 3), "\\b(?:charge|q)\\W+(?:\\w+\\W+){0,6}(?:proportional|steady|constant|same rate|uniform|linear)", "\\bq ?= ?it\\b"] },
              { desc: "The capacitance is constant, so the p.d. is directly proportional to the charge (V = Q/C) and so to the time",
                not: [negFor("constant|proportional|same|fixed", 2)],
                any: [near("capacitance|c", "constant|same|fixed|does not change|stays", 4), "\\bv ?= ?q ?/ ?c\\b", "\\b(?:p\\.?d\\.?|voltage|potential difference|v)\\W+(?:\\w+\\W+){0,5}proportional\\W+(?:\\w+\\W+){0,3}(?:charge|q)\\b"] },
            ],
            sample: "The current is constant, so the charge stored increases at a steady rate, because Q = It. The capacitance is constant, so the p.d. is directly proportional to the charge (V = Q/C), and therefore to the time.",
            model: "<ul><li>The current is constant, so the charge on the capacitor increases at a steady rate: Q = It, so Q is proportional to t (1)</li><li>The capacitance does not change, so V = Q/C means the p.d. is proportional to the charge, and so to the time (1)</li></ul><p>Both steps are needed: a constant current gives charge proportional to time, and a fixed capacitance links the p.d. to the charge.</p>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 4,
            q: "The experiment is repeated. Which change would give a graph with a <strong>greater</strong> gradient?",
            opts: ["Using a capacitor of larger capacitance", "Using a smaller constant current", "Reading the p.d. at shorter time intervals", "Charging the capacitor for a longer time", "Using a capacitor of smaller capacitance"],
            why: "The gradient is I/C, so it is increased by a larger current or a smaller capacitance (E). A larger capacitance (A) or a smaller current (B) reduces it. Shorter reading intervals (C) and a longer charging time (D) only change how many points are plotted along the same line.",
          },
        ],
      },

      /* ------------------------------------------------------------ 12 */
      {
        id: "skills-12",
        style: "Graph question · wavelength and frequency of sound in air",
        stem:
          "<p>A student measures the wavelength λ of sound waves in air for several frequencies <em>f</em> from a signal generator, using a loudspeaker, a microphone and an oscilloscope. She plots a graph of λ against 1/<em>f</em>, with the line of best fit.</p>" +
          tbl(["f / Hz", "2000", "1600", "1000", "800", "500", "400"], [["λ / m", "0.17", "0.21", "0.34", "0.43", "0.68", "0.84"]]),
        figure: figWF,
        parts: [
          {
            label: "(a)", type: "calc", marks: 3,
            q: "Use the graph to determine the speed of sound in air, in m s⁻¹.",
            steps: [
              { desc: "Relationship: v = fλ, so λ = v × (1/f) and the gradient is the speed v", rel: ["v=f(?:λ|lambda)", "(?:λ|lambda)=v[/÷]f", "f=v[/÷](?:λ|lambda)", "(?:gradient|slope)=v", "v=(?:gradient|slope)", "(?:λ|lambda)=v(?:x|\\*)?\\(?1[/÷]f", "(?:gradient|slope)=\\(?\\d"] },
              { desc: "Gradient from two widely spaced points on the line (units of 10⁻³ s converted)", nums: [[0.34, 0.68, 0.85, 1.02, 0.17, 0.425, 0.51, 0.21, 0.43, 0.84], [1.0, 2.0, 2.5, 3.0, 0.5, 1.25, 1.5, 0.001, 0.002, 0.0025, 0.003, 0.0005, 0.00125, 0.0015, 400, 500, 800, 1000, 1600, 2000]] },
              { desc: "Speed with unit: 3.4 × 10² m s⁻¹", ans: 340, sf: 2, abs: 15, unit: ["m s-1", "m/s"] },
            ],
            sample: "gradient = v\ngradient = (0.68 − 0)/(2.0 × 10⁻³ − 0)\nv = 3.4 × 10² m s⁻¹",
            model: "<ul><li>v = fλ, so λ = v × (1/f) and the gradient of the graph is the speed v (1)</li><li>gradient = (0.68 − 0) ÷ (2.0 × 10⁻³ − 0), with the x axis converted from units of 10⁻³ s (1)</li><li>v = 3.4 × 10² m s⁻¹ (1)</li></ul><p>Accept 3.3 to 3.5 × 10² m s⁻¹. Forgetting the 10⁻³ on the axis gives 0.34 m s⁻¹, which is out by a factor of 1000. The data sheet value is 3.40 × 10² m s⁻¹.</p>",
          },
          { label: "(b)", type: "num", marks: 1, a: 0.425, sf: 2, tol: 0.02, unit: "m", shown: "0.43", q: "Use the graph to find the wavelength of the sound when the frequency is 800 Hz.", why: "f = 800 Hz gives 1/f = 1.25 × 10⁻³ s. The line reads <strong>0.43 m</strong> at 1.25 on the horizontal axis (check: 340 ÷ 800 = 0.425 m). Accept 0.41 to 0.45." },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "Explain why the student plots λ against 1/f rather than λ against f.",
            points: [
              { desc: "λ is directly proportional to 1/f (λ = v/f), so the graph is a straight line",
                not: [negFor("straight|linear|proportional", 2), "(?:against|vs\\.?|versus|and)\\W+(?:the )?(?:frequency|f)\\W+(?:\\w+\\W+){0,4}(?:straight|linear)"],
                any: [near("straight|linear", "line|graph", 2) + "|\\bstraight\\b|\\blinear\\b", "\\bdirectly proportional\\b", "\\bλ ?= ?v ?/ ?f\\b", "\\blambda ?= ?v ?/ ?f\\b"] },
              { desc: "The gradient of the straight line is the speed of the sound",
                not: [negFor("gradient|slope|speed|velocity", 2)],
                any: [near("gradient|slope", "speed|velocity|v", 8)] },
            ],
            sample: "A graph of λ against 1/f is a straight line, because λ is directly proportional to 1/f. The gradient of the line is then equal to the speed of the sound.",
            model: "<ul><li>v = fλ, so λ = v/f: λ is directly proportional to 1/f, giving a straight line (through the origin), which is easy to draw and to judge by eye (1)</li><li>The gradient of the straight line is equal to the speed v (1)</li></ul><p>A graph of λ against f is a curve (a hyperbola): its gradient changes and does not give the speed directly.</p>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 3,
            q: "Which of the following would reduce the random uncertainty in the wavelength measured at one frequency?",
            opts: ["Using a louder sound, so the microphone signal looks larger on the oscilloscope", "Using a higher frequency, so that more waves fit along the bench", "Measuring the distance across one wavelength with a longer ruler", "Measuring the distance across ten wavelengths and dividing by ten", "Taking the readings in a larger room, where the sound is reflected less"],
            why: "Measuring across ten wavelengths and dividing by ten makes the fixed reading uncertainty a much smaller percentage of the distance measured. Loudness (A) and room size (E) do not change how well the distance is read, a higher frequency (B) gives shorter wavelengths and so a larger percentage uncertainty, and a longer ruler (C) does not help when only one wavelength is measured.",
          },
        ],
      },
    ],
  };
})();
