/* Past-paper practice: Our Dynamic Universe. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HPP_BANK = window.HPP_BANK || {});
  /* near(a, b, n): regex source matching a and b in either order with at most n words between them,
     so a shuffled pile of the right words does not satisfy it. */
  const near = (a, b, n) => { const g = "\\W+(?:\\w+\\W+){0," + (n == null ? 3 : n) + "}"; return "\\b(?:" + a + ")\\b" + g + "\\b(?:" + b + ")\\b|\\b(?:" + b + ")\\b" + g + "\\b(?:" + a + ")\\b"; };

  /* Frequently used relationship patterns (tested against the working with whitespace removed, lower-case). */
  const FMA = ["f\\w{0,12}=mx?a", "a=f\\w{0,12}/m", "m=f\\w{0,12}/a", "\\w{0,3}=mx?a\\b"];
  const EK = ["(?:e_?k|ke|e_?kinetic)=(?:1/2|0?\\.5|½|\\(1/2\\))x?\\(?m", "(?:e_?k|ke)=m?\\(?v\\)?\\^?2x?(?:1/2|0\\.5)", "(?:e_?k|ke)=mv\\^?2/2"];
  const EP = ["(?:e_?p|pe|e_?pot|e_?gp)=mgh", "mgh"];
  const DVT = ["[ds]=v\\u0304?x?t", "[ds]=u\\w{0,2}x?t", "v\\u0304?=[ds]/t", "t=[ds]/v", "[ds]=vx?t"];
  const SUVAT_S = ["s=ut\\+(?:1/2|0?\\.5|½)x?a?x?t", "s=ut\\+\\(1/2\\)", "s=(?:1/2|0?\\.5|½)x?a?x?t\\^?2", "s=(?:1/2|0?\\.5|½)\\(u\\+v\\)t", "v\\^2=u\\^2\\+2as"];
  const VUAT = ["v=u\\+at", "a=\\(?v-u\\)?/t", "t=\\(?v-u\\)?/a", "v-u=at", "t=v/g", "t=u/g"];

  /* ---- figure helpers ---- */
  const T = (x, y, s, o) => '<text x="' + x + '" y="' + y + '"' + (o ? " " + o : "") + ">" + s + "</text>";
  const open = (w, h, label) => '<svg role="img" aria-label="' + label + '" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="12" fill="#222"><rect width="' + w + '" height="' + h + '" fill="#fff"/>';
  const fmtn = (v, d) => { const s = (+v.toFixed(d == null ? 4 : d)).toString(); return s.replace("-", "−"); };
  /* A Cartesian graph with gridlines, tick labels and polylines. */
  function chart(o) {
    const w = o.w || 520, h = o.h || 280, L = 62, R = 18, Tp = 16, Bt = 48;
    const px = (x) => L + ((x - o.x0) / (o.x1 - o.x0)) * (w - L - R), py = (y) => Tp + ((o.y1 - y) / (o.y1 - o.y0)) * (h - Tp - Bt);
    let s = open(w, h, o.label);
    const nx = Math.round((o.x1 - o.x0) / o.xs), ny = Math.round((o.y1 - o.y0) / o.ys);
    for (let i = 0; i <= nx; i++) { const x = o.x0 + i * o.xs; s += '<line x1="' + px(x) + '" y1="' + Tp + '" x2="' + px(x) + '" y2="' + (h - Bt) + '" stroke="#dde1e6"/>' + T(px(x), h - Bt + 16, fmtn(x, o.xd), 'text-anchor="middle"'); }
    for (let i = 0; i <= ny; i++) { const y = o.y0 + i * o.ys; s += '<line x1="' + L + '" y1="' + py(y) + '" x2="' + (w - R) + '" y2="' + py(y) + '" stroke="#dde1e6"/>' + T(L - 8, py(y) + 4, fmtn(y, o.yd), 'text-anchor="end"'); }
    s += '<rect x="' + L + '" y="' + Tp + '" width="' + (w - L - R) + '" height="' + (h - Tp - Bt) + '" fill="none" stroke="#222"/>';
    if (o.y0 < 0 && o.y1 > 0) s += '<line x1="' + L + '" y1="' + py(0) + '" x2="' + (w - R) + '" y2="' + py(0) + '" stroke="#222" stroke-width="1.6"/>';
    (o.lines || []).forEach((l) => { s += '<polyline fill="none" stroke="' + (l.stroke || "#1c3b66") + '" stroke-width="2.2"' + (l.dash ? ' stroke-dasharray="5 4"' : "") + ' stroke-linejoin="round" points="' + l.pts.map((p) => px(p[0]).toFixed(1) + "," + py(p[1]).toFixed(1)).join(" ") + '"/>'; });
    if (o.fill) s += '<polygon fill="' + o.fill.color + '" fill-opacity="0.18" stroke="none" points="' + o.fill.pts.map((p) => px(p[0]).toFixed(1) + "," + py(p[1]).toFixed(1)).join(" ") + '"/>';
    s += T(L + (w - L - R) / 2, h - 8, o.xl, 'text-anchor="middle"');
    s += T(14, Tp + (h - Tp - Bt) / 2, o.yl, 'text-anchor="middle" transform="rotate(-90 14 ' + (Tp + (h - Tp - Bt) / 2) + ')"');
    if (o.extra) s += o.extra(px, py);
    return s + "</svg>";
  }
  const arrow = (x1, y1, x2, y2, col, w) => {
    const a = Math.atan2(y2 - y1, x2 - x1), hx = 8, c = col || "#b3261e";
    const p1 = [x2 - hx * Math.cos(a - 0.45), y2 - hx * Math.sin(a - 0.45)], p2 = [x2 - hx * Math.cos(a + 0.45), y2 - hx * Math.sin(a + 0.45)];
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + c + '" stroke-width="' + (w || 2.4) + '"/><polygon fill="' + c + '" points="' + x2 + "," + y2 + " " + p1[0].toFixed(1) + "," + p1[1].toFixed(1) + " " + p2[0].toFixed(1) + "," + p2[1].toFixed(1) + '"/>';
  };

  /* Q01 figure: tram v-t graph */
  const figTram = chart({
    label: "Velocity against time graph for a tram. The velocity rises in a straight line from 0 at 0 s to 12 metres per second at 8 s, stays constant at 12 metres per second until 20 s, then falls in a straight line to 0 at 26 s.",
    x0: 0, x1: 26, xs: 2, y0: 0, y1: 14, ys: 2, xl: "t / s", yl: "v / m s⁻¹",
    lines: [{ pts: [[0, 0], [8, 12], [20, 12], [26, 0]] }],
  });

  /* Q02 figure: bouncing ball v-t graph (up positive) */
  const figBall = chart({
    label: "Velocity against time graph for a ball dropped on to a floor, up taken as positive. The velocity falls in a straight line from 0 at 0 s to minus 5.9 metres per second at 0.60 s, jumps to plus 4.9 metres per second, falls in a straight line through zero at 1.10 s to minus 4.9 at 1.60 s, then jumps to plus 3.9 and falls to zero at 2.0 s.",
    x0: 0, x1: 2, xs: 0.2, xd: 1, y0: -6, y1: 6, ys: 2, xl: "t / s", yl: "v / m s⁻¹",
    lines: [{ pts: [[0, 0], [0.6, -5.88], [0.6, 4.9], [1.6, -4.9], [1.6, 3.92], [2.0, 0]] }],
    extra: (px, py) => T(px(0.63), py(-5.88) + 4, "−5.9", 'fill="#1c3b66"') + T(px(0.63), py(4.9) + 4, "+4.9", 'fill="#1c3b66"') + T(px(1.1) + 6, py(0) - 6, "1.10 s", 'fill="#1c3b66"'),
  });

  /* Q08 figure: force-time graph, triangle base 8.0 ms, peak 900 N at 3.0 ms */
  const figKick = chart({
    label: "Force against time graph for a hockey stick striking a ball. The force rises in a straight line from 0 at 0 ms to a peak of 900 newtons at 3.0 ms, then falls in a straight line to 0 at 8.0 ms.",
    x0: 0, x1: 8, xs: 1, xd: 0, y0: 0, y1: 1000, ys: 200, yd: 0, xl: "t / ms", yl: "F / N",
    lines: [{ pts: [[0, 0], [3, 900], [8, 0]] }],
    fill: { color: "#1c3b66", pts: [[0, 0], [3, 900], [8, 0]] },
  });

  /* Q14 figure: two black-body curves (relative intensity), planck shape */
  const planck = (lam, Tk) => { const l = lam * 1e-9; return 1 / (Math.pow(l, 5) * (Math.exp(1.4388e-2 / (l * Tk)) - 1)); };
  const curveHot = [], curveCool = [];
  let norm = 0;
  for (let l = 200; l <= 2000; l += 20) norm = Math.max(norm, planck(l, 6000));
  for (let l = 200; l <= 2000; l += 20) { curveHot.push([l, planck(l, 6000) / norm]); curveCool.push([l, planck(l, 4000) / norm]); }
  const figStars = chart({
    label: "Graph of intensity of radiation against wavelength for two stars, P and Q. Both curves rise to a single peak and then fall. Curve Q is higher than curve P at every wavelength and peaks at about 480 nanometres. Curve P peaks at a longer wavelength, about 720 nanometres.",
    x0: 200, x1: 2000, xs: 200, xd: 0, y0: 0, y1: 1.2, ys: 0.2, yd: 1, xl: "wavelength / nm", yl: "intensity (relative units)",
    lines: [{ pts: curveHot, stroke: "#b3261e" }, { pts: curveCool, stroke: "#1c3b66" }],
    extra: (px, py) => T(px(560), py(1.0) - 4, "Q", 'fill="#b3261e" font-weight="bold"') + T(px(820), py(0.5) - 6, "P", 'fill="#1c3b66" font-weight="bold"'),
  });

  /* Q03 figure: horizontal launch off a ramp */
  const figJump = (() => {
    const w = 520, h = 250, x0 = 70, y0 = 60, sc = 15, H = 12 * sc, D = 23.47 * sc;
    let s = open(w, h, "Diagram of a motorcyclist leaving the end of a horizontal ramp at 15 metres per second. The end of the ramp is 12 metres above the surface of a lake. A dashed curved path falls from the ramp end to the water, a horizontal distance marked d, which is unknown.");
    s += '<rect x="10" y="' + y0 + '" width="' + (x0 - 10) + '" height="' + H + '" fill="#e8dcc6" stroke="#222"/>';
    s += '<rect x="' + x0 + '" y="' + (y0 + H) + '" width="' + (w - x0 - 10) + '" height="' + (h - y0 - H - 8) + '" fill="#cfe3f3" stroke="#222"/>';
    s += T(w - 70, y0 + H + 24, "lake", 'fill="#1c3b66"');
    const pts = []; for (let i = 0; i <= 30; i++) { const x = (D * i) / 30; pts.push((x0 + x).toFixed(1) + "," + (y0 + H * Math.pow(x / D, 2)).toFixed(1)); }
    s += '<polyline fill="none" stroke="#1c3b66" stroke-width="2" stroke-dasharray="6 4" points="' + pts.join(" ") + '"/>';
    s += arrow(x0 + 4, y0 - 14, x0 + 64, y0 - 14, "#b3261e") + T(x0 + 70, y0 - 10, "15 m s⁻¹", 'fill="#b3261e"');
    s += '<circle cx="' + x0 + '" cy="' + y0 + '" r="5" fill="#222"/>';
    s += '<line x1="30" y1="' + y0 + '" x2="30" y2="' + (y0 + H) + '" stroke="#222"/>' + arrow(30, y0, 30, y0 + 1, "#222", 1) + T(36, y0 + H / 2 + 4, "12 m");
    s += '<line x1="' + x0 + '" y1="' + (y0 + H + 14) + '" x2="' + (x0 + D) + '" y2="' + (y0 + H + 14) + '" stroke="#222" stroke-dasharray="3 3"/>' + T(x0 + D / 2, y0 + H + 30, "d = ?", 'text-anchor="middle"');
    return s + "</svg>";
  })();

  /* Q05 figure: car towing a caravan, horizontal forces */
  const figTow = (() => {
    const w = 520, h = 190;
    let s = open(w, h, "Diagram of a car pulling a caravan along a level road, travelling to the right. The engine force on the car is 3500 newtons to the right. Friction on the car is 400 newtons to the left and friction on the caravan is 300 newtons to the left. A tow bar connects the car to the caravan. The mass of the car is 1200 kilograms and of the caravan 800 kilograms.");
    s += '<line x1="10" y1="140" x2="510" y2="140" stroke="#222" stroke-width="2"/>';
    s += '<rect x="40" y="80" width="150" height="52" rx="6" fill="#e6edf7" stroke="#222"/><circle cx="70" cy="136" r="9" fill="#fff" stroke="#222"/><circle cx="165" cy="136" r="9" fill="#fff" stroke="#222"/>' + T(115, 111, "caravan", 'text-anchor="middle"') + T(115, 126, "800 kg", 'text-anchor="middle"');
    s += '<line x1="190" y1="112" x2="225" y2="112" stroke="#222" stroke-width="3"/>' + T(207, 100, "tow bar", 'text-anchor="middle" font-size="11"');
    s += '<rect x="225" y="80" width="150" height="52" rx="6" fill="#f3e6e4" stroke="#222"/><circle cx="255" cy="136" r="9" fill="#fff" stroke="#222"/><circle cx="350" cy="136" r="9" fill="#fff" stroke="#222"/>' + T(300, 111, "car", 'text-anchor="middle"') + T(300, 126, "1200 kg", 'text-anchor="middle"');
    s += arrow(375, 100, 470, 100, "#b3261e") + T(472, 96, "3500 N", 'fill="#b3261e"');
    s += arrow(225, 60, 160, 60, "#1c3b66") + T(150, 52, "400 N", 'fill="#1c3b66" text-anchor="end"');
    s += arrow(40, 60, 5, 60, "#1c3b66") + T(8, 52, "300 N", 'fill="#1c3b66"');
    return s + "</svg>";
  })();

  /* Q07 figure: two trolleys before the collision */
  const figTrolleys = (() => {
    const w = 520, h = 150;
    let s = open(w, h, "Diagram of two trolleys on a straight horizontal track before they collide. Trolley A of mass 0.60 kilograms moves to the right at 2.0 metres per second. Trolley B of mass 0.45 kilograms moves to the left at 1.0 metre per second towards trolley A.");
    s += '<line x1="10" y1="110" x2="510" y2="110" stroke="#222" stroke-width="2"/>';
    s += '<rect x="70" y="70" width="90" height="34" rx="4" fill="#e6edf7" stroke="#222"/><circle cx="90" cy="108" r="6" fill="#fff" stroke="#222"/><circle cx="140" cy="108" r="6" fill="#fff" stroke="#222"/>' + T(115, 92, "A  0.60 kg", 'text-anchor="middle"');
    s += arrow(110, 50, 190, 50, "#b3261e") + T(115, 40, "2.0 m s⁻¹", 'fill="#b3261e"');
    s += '<rect x="340" y="70" width="90" height="34" rx="4" fill="#f3e6e4" stroke="#222"/><circle cx="360" cy="108" r="6" fill="#fff" stroke="#222"/><circle cx="410" cy="108" r="6" fill="#fff" stroke="#222"/>' + T(385, 92, "B  0.45 kg", 'text-anchor="middle"');
    s += arrow(400, 50, 340, 50, "#b3261e") + T(345, 40, "1.0 m s⁻¹", 'fill="#b3261e"');
    return s + "</svg>";
  })();

  /* Q12 figure: wavefronts from a moving source */
  const figDoppler = (() => {
    const w = 520, h = 230, cy = 115, vT = 30, sT = 12, nowx = 330;
    let s = open(w, h, "Diagram of circular wavefronts emitted at equal time intervals by an ambulance siren moving to the right. The circles are bunched close together in front of the ambulance, on the right, and spread further apart behind it, on the left. Observer X stands ahead of the ambulance and observer Y stands behind it.");
    for (let k = 1; k <= 5; k++) s += '<circle cx="' + (nowx - k * sT) + '" cy="' + cy + '" r="' + k * vT + '" fill="none" stroke="#1c3b66" stroke-width="1.6"/>';
    s += '<rect x="' + (nowx - 14) + '" y="' + (cy - 9) + '" width="28" height="18" rx="3" fill="#b3261e"/>' + arrow(nowx + 16, cy, nowx + 52, cy, "#b3261e") + T(nowx + 14, cy + 32, "ambulance", 'fill="#b3261e"');
    s += '<circle cx="' + (nowx + 160) + '" cy="' + cy + '" r="5" fill="#222"/>' + T(nowx + 160, cy - 12, "X", 'text-anchor="middle" font-weight="bold"');
    s += '<circle cx="28" cy="' + cy + '" r="5" fill="#222"/>' + T(28, cy - 12, "Y", 'text-anchor="middle" font-weight="bold"');
    return s + "</svg>";
  })();

  /* Q13 figure: hydrogen spectra, laboratory and galaxy */
  const figSpectra = (() => {
    const w = 520, h = 180, x0 = 40, x1 = 500, l0 = 400, l1 = 700, px = (l) => x0 + ((l - l0) / (l1 - l0)) * (x1 - x0);
    let s = open(w, h, "Two strips showing dark absorption lines in the hydrogen spectrum on a wavelength scale from 400 to 700 nanometres. The laboratory strip has lines at 410, 434, 486 and 656 nanometres. The strip for the galaxy has the same four lines shifted to longer wavelengths, with the red line at 686 nanometres.");
    const strip = (y, name, ls) => {
      let t = '<rect x="' + x0 + '" y="' + y + '" width="' + (x1 - x0) + '" height="38" fill="#f4efe3" stroke="#222"/>';
      ls.forEach((l) => { t += '<line x1="' + px(l).toFixed(1) + '" y1="' + y + '" x2="' + px(l).toFixed(1) + '" y2="' + (y + 38) + '" stroke="#222" stroke-width="2.4"/>'; });
      return t + T(x0, y - 6, name, 'font-size="12"');
    };
    s += strip(28, "hydrogen in the laboratory", [410, 434, 486, 656]);
    s += strip(92, "hydrogen in light from the galaxy", [428.75, 453.85, 508.2, 686]);
    s += '<line x1="' + x0 + '" y1="140" x2="' + x1 + '" y2="140" stroke="#222"/>';
    for (let l = 400; l <= 700; l += 50) s += '<line x1="' + px(l) + '" y1="140" x2="' + px(l) + '" y2="146" stroke="#222"/>' + T(px(l), 160, l, 'text-anchor="middle"');
    s += T(x1, 176, "wavelength / nm", 'text-anchor="end"');
    return s + "</svg>";
  })();

  B.odu = {
    intro:
      "Our Dynamic Universe is the biggest area of the course and every part of the 110-mark Section 2 draws on it: motion and forces, momentum and impulse, energy, gravitation, special relativity and the expanding Universe. Fourteen questions, " +
      "mixing 3 and 4 mark calculations, short written explanations, 3-mark open-ended questions and a few multiple-choice parts. The marks are earned in steps: the <strong>relationship</strong>, the <strong>substitution</strong> (with the right sign for each vector) and the <strong>answer with its unit</strong>. For written answers, give a cause <em>and</em> its effect, and use the physics words.",
    questions: [
      /* ---------------------------------------------------------------- 01 */
      {
        id: "odu-01",
        style: "Context question · v–t graph and equations of motion",
        figure: figTram,
        stem:
          "<p>A tram runs on a straight, level track through a city centre. The graph shows how its velocity changes during a journey between two stops. The mass of the tram, with passengers, is 1.8 × 10<sup>4</sup> kg.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 1.5, tol: 0, sf: 2, unit: "m s⁻²",
            q: "Calculate the acceleration of the tram during the first 8 s.",
            why: "The gradient of a velocity–time graph is the acceleration: a = (v − u)/t = (12 − 0)/8 = <strong>1.5 m s⁻²</strong>.",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Calculate the total displacement of the tram during the 26 s journey.",
            steps: [
              { desc: "Displacement is the area under the v–t graph (or a correct equation, e.g. s = v̄t)", rel: ["area", "[ds]=v\\u0304?x?t", "½x", "1/2x", "0\\.5x", "½\\(", "1/2\\("] },
              { desc: "Correct areas or lengths: 48 m, 144 m and 36 m (or a trapezium with parallel sides 26 s and 12 s)", nums: [[48, 38, 19]] },
              { desc: "Final answer 228 m with unit", ans: 228, sf: 2, unit: "m" },
            ],
            sample: "displacement = area under the v-t graph\narea = ½ × 8 × 12 + 12 × 12 + ½ × 6 × 12\n= 48 + 144 + 36\ns = 228 m",
            model:
              "<ul><li>Displacement = area under the v–t graph, or s = v̄t used on sections (1)</li><li>Substitution, e.g. ½ × 8 × 12 + (12 × 12) + ½ × 6 × 12, or ½ × (26 + 12) × 12 for the trapezium (1)</li><li>228 m (1)</li></ul><p>Accept 230 m. Using the whole 26 s as a rectangle (26 × 12 = 312 m) forgets the speeding-up and slowing-down sections: 0 for the substitution mark.</p>",
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 2,
            q: "Which row describes the acceleration–time graph for this journey?",
            opts: [
              "+1.5 m s⁻² for 8 s, then 0 for 12 s, then +2.0 m s⁻² for 6 s",
              "+12 m s⁻² for 8 s, then 0 for 12 s, then −12 m s⁻² for 6 s",
              "+1.5 m s⁻² for 8 s, then 0 for 12 s, then −2.0 m s⁻² for 6 s",
              "A line sloping up, then a horizontal line, then a line sloping down (the same shape as the v–t graph)",
              "+1.5 m s⁻² for 8 s, then +12 m s⁻² for 12 s, then −2.0 m s⁻² for 6 s",
            ],
            why: "Each straight section of the v–t graph has a constant gradient, so the a–t graph is three horizontal lines: +12/8 = +1.5 m s⁻², then 0 (constant velocity), then (0 − 12)/6 = −2.0 m s⁻². The tram is slowing down, so the last value is negative. Option 3 is the common mistake: reading the shape of the v–t graph instead of its gradient (the 2025 report noted this slip).",
          },
          {
            label: "(d)", type: "num", marks: 1, a: 21.2132, tol: 0, sf: 2, unit: "m s⁻¹",
            q: "Later, the tram starts from rest and accelerates uniformly at 1.5 m s⁻² over a straight 150 m section. Calculate its speed at the end of this section.",
            why: "No time is given, so use v² = u² + 2as = 0 + 2 × 1.5 × 150 = 450, so v = <strong>21 m s⁻¹</strong> (unrounded 21.2).",
          },
          {
            label: "(e)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "A passenger standing in the tram leans forward as the tram brakes at the end of the journey. Explain, in terms of Newton's laws, why this happens.",
            points: [
              { desc: "The passenger's body has no unbalanced force on it (Newton's first law / inertia), so it keeps moving at the same velocity", all: ["\\b(?:first law|inertia|no (?:unbalanced |resultant |net |horizontal )?force|keeps? (?:on )?moving|continues? (?:to |on )?(?:move|moving|travel)|constant velocity|same velocity|same speed|tends? to keep)\\b"], not: ["\\bno (?:force|forces) (?:on|acts?|acting)\\W+(?:\\w+\\W+){0,3}(?:tram|train)\\b"] },
              { desc: "The tram (floor, feet) slows down, so the passenger moves forward relative to it", any: [near("feet|floor|shoes|legs|friction|lower|tram|vehicle|train", "slows?|slowed|slowing|decelerat\\w*", 6)] },
            ],
            sample: "By Newton's first law the passenger's body keeps moving forwards at the same velocity because there is no unbalanced force acting on it. The floor and the tram slow down, so the passenger moves forward relative to the tram and appears to lean forward.",
            model: "<ul><li>The upper body has no (unbalanced) force acting on it, so by Newton's first law (inertia) it continues at the same velocity (1)</li><li>The tram and the passenger's feet slow down (by friction), so the passenger moves/leans forward relative to the tram (1)</li></ul><p>&ldquo;A force pushes the passenger forward&rdquo; is wrong: there is no forward force, only the lack of a backward one on the body.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 02 */
      {
        id: "odu-02",
        style: "Graph interpretation · a bouncing ball (v–t)",
        figure: figBall,
        stem:
          "<p>A ball of mass 0.058 kg is dropped from rest on to a hard floor. A motion sensor records its velocity. The graph shows the velocity against time for the first two bounces, taking <strong>upwards as positive</strong>. The ball hits the floor at 0.60 s and reaches the top of its first rebound at 1.10 s.</p>",
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 3,
            q: "The three sloping lines on the graph are parallel. Which statement explains this?",
            opts: [
              "The ball has the same mass throughout",
              "The ball has the same kinetic energy at the start of each flight",
              "The ball has the same speed at the start of each flight",
              "The ball has the same acceleration, because only gravity acts on it between the bounces",
              "The ball has the same displacement in each flight",
            ],
            why: "The gradient of a v–t graph is the acceleration. While the ball is in the air the only force on it is its weight, so the acceleration is −9.8 m s⁻² every time, and the lines have the same gradient. The starting speeds of the flights are different (5.9, 4.9 and 3.9 m s⁻¹ in magnitude), so options 1 and 2 are wrong.",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Use the graph to calculate the maximum height reached by the ball after the first bounce, measured from the floor.",
            steps: [
              { desc: "Height = area under the graph between 0.60 s and 1.10 s (or a correct equation of motion)", rel: ["area", "[ds]=v\\u0304?x?t", "½x", "1/2x", "0\\.5x", "v\\^2=u\\^2\\+2as", "s=ut\\+", "s=½\\(", "s=1/2\\("] },
              { desc: "Substitution: 4.9 m s⁻¹ with 0.50 s (or with a = −9.8 m s⁻²)", nums: [4.9, [0.5, 9.8, 19.6]] },
              { desc: "Final answer 1.2 m with unit", ans: 1.225, sf: 2, unit: "m" },
            ],
            sample: "height = area under the v-t graph (triangle)\nh = ½ × 0.50 × 4.9\nh = 1.2 m",
            model: "<ul><li>Height = area of the triangle above the axis between 0.60 s and 1.10 s (1)</li><li>½ × 0.50 × 4.9 (1)</li><li>1.2 m (1)</li></ul><p>Equally acceptable: v² = u² + 2as with 0 = 4.9² + 2(−9.8)s, giving s = 1.2 m. The area <em>below</em> the axis (after the top) is the fall back to the floor, and the time base is 0.50 s, not 1.10 s.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "The ball hits the floor at 5.9 m s⁻¹ but leaves it at only 4.9 m s⁻¹. Explain why the speed of the ball is smaller after the bounce.",
            points: [
              { desc: "Some kinetic energy is transferred to heat / sound (or deformation) in the bounce, so energy is lost from the ball", all: [near("energy|ke|e_?k|kinetic", "lost|transferred|transformed|converted|changed|dissipated|wasted|turned|becomes?|given|gets|goes", 8), "heat|sound|thermal|deform|internal|noise"], win: 200 },
              { desc: "So the ball has less kinetic energy after the bounce and leaves with a lower speed", all: [near("less|lower|smaller|reduced|decreased|fewer", "kinetic|speed|velocity|ke\\b|e_?k\\b", 3), "bounce|after|rebound|leaves|leaving|floor|afterwards"], win: 120 },
            ],
            sample: "During the bounce some of the ball's kinetic energy is transferred into heat and sound, so energy is lost from the ball. It therefore has less kinetic energy after the bounce and leaves the floor with a lower speed.",
            model: "<ul><li>Some kinetic energy is changed to heat and sound (or the ball and floor are deformed) in the collision, so energy is lost (1)</li><li>The ball is left with less kinetic energy, so it moves off with a smaller speed (1)</li></ul><p>A bare &ldquo;the ball loses energy&rdquo; earns the first mark only if it says where the energy goes.</p>",
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "Describe the acceleration of the ball (i) while it is in the air and (ii) during the bounce, as shown by the graph.",
            points: [
              { desc: "In the air: constant acceleration of 9.8 m s⁻² downwards (gradient −9.8)", any: [near("acceleration|gradient", "9\\.8|constant|same|uniform|steady", 6), "free fall"] },
              { desc: "During the bounce: a very large acceleration upwards, for a very short time (near-vertical line)", any: [near("bounce|floor|impact|contact|hits|collision|vertical", "large|big|huge|high|spike|upward|up\\b|greater|bigger|sharp|steep|very", 8)] },
            ],
            sample: "While the ball is in the air its acceleration is constant at 9.8 m s⁻² downwards, because the graph has a constant negative gradient. During the bounce the line is almost vertical, so the ball has a very large acceleration upwards for a very short time.",
            model: "<ul><li>In the air: constant acceleration of 9.8 m s⁻² downwards (negative gradient, up positive) (1)</li><li>At the bounce: the velocity changes by a large amount in a very short time, so a very large acceleration (upwards) (1)</li></ul><p>The acceleration is not zero at the top of the rebound (1.10 s): the gradient is still −9.8 m s⁻².</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 03 */
      {
        id: "odu-03",
        style: "Context question · projectile launched horizontally",
        figure: figJump,
        stem:
          "<p>A stunt rider leaves the end of a horizontal ramp at 15 m s<sup>−1</sup>. The end of the ramp is 12 m above the surface of a lake, as shown. Ignore air resistance.</p>",
        parts: [
          {
            label: "(a)", type: "calc", marks: 3,
            q: "Calculate the time taken for the rider to reach the water.",
            steps: [
              { desc: "Uses s = ut + ½at² (or v² = u² + 2as) for the vertical motion", rel: SUVAT_S },
              { desc: "Substitution: s = 12 m, u = 0, a = 9.8 m s⁻²", nums: [12, 9.8] },
              { desc: "Final answer 1.6 s with unit", ans: 1.5649, sf: 2, unit: "s" },
            ],
            sample: "Vertical motion: u = 0, a = 9.8 m s-2, s = 12 m\ns = ut + 1/2 at^2\n12 = 0 + 1/2 x 9.8 x t^2\nt^2 = 2.449\nt = 1.56 s",
            model: "<ul><li>s = ut + ½at² (1)</li><li>12 = 0 + ½ × 9.8 × t² (1)</li><li>t = 1.6 s (1)</li></ul><p>The 15 m s⁻¹ has no part in the vertical motion: the initial <em>vertical</em> velocity is zero. Using v² = u² + 2as to find v = 15.3 m s⁻¹ and then v = u + at is also full marks.</p>",
          },
          {
            label: "(b)", type: "num", marks: 1, a: 23.4738, tol: 0, sf: 2, alts: [24], unit: "m",
            q: "Calculate the horizontal distance d from the end of the ramp to the point where the rider lands.",
            why: "The horizontal velocity is constant at 15 m s⁻¹, so d = v̄t = 15 × 1.565 = <strong>23 m</strong> (using the rounded 1.6 s gives 24 m, also accepted).",
          },
          {
            label: "(c)", type: "num", marks: 1, a: 15.3362, tol: 0, sf: 2, unit: "m s⁻¹",
            q: "Calculate the vertical component of the rider's velocity just before he enters the water.",
            why: "v = u + at = 0 + 9.8 × 1.565 = <strong>15 m s⁻¹</strong> downwards. (Notice it is almost the same as the horizontal component: the rider hits the water at about 46° below the horizontal.)",
          },
          {
            label: "(d)", type: "text", marks: 3, rows: 8, minWords: 15,
            q: "A second rider, whose mass is twice as large, leaves the same ramp horizontally at 20 m s⁻¹. Use your knowledge of physics to comment on the flight of the second rider compared with the first.",
            points: [
              { desc: "The vertical and horizontal motions are independent, so the time in the air is the same (about 1.6 s)", any: [near("same|equal|identical|unchanged", "time|flight|long|duration", 5), near("independent|separate|unaffected|no effect|doesn'?t affect|does not affect", "vertical|horizontal|motion|time|fall", 8)] },
              { desc: "The acceleration due to gravity is the same for any mass, so the heavier rider falls the 12 m in the same time (mass makes no difference)", any: [near("mass|heav\\w*|weight", "same|no (?:difference|effect)|independent|doesn'?t (?:matter|affect|change)|does not (?:matter|affect|change)|irrelevant|unaffected", 3), near("acceleration|\\bg\\b|9\\.8", "same|independent|constant|all (?:masses|objects)|any mass", 8)] },
              { desc: "He travels further horizontally, because d = vt with a larger horizontal speed (about 31 m)", any: [near("further|farther|greater (?:distance|range)|larger (?:distance|range)|more distance|longer (?:distance|range)", "horizontal\\w*|speed|velocity|20|faster|d ?= ?v|31", 10), near("20", "31", 12)] },
            ],
            sample: "The horizontal and vertical motions are independent, so the second rider is in the air for the same time as the first, about 1.6 s. Gravity gives the same acceleration of 9.8 m s⁻² to any mass, so the extra mass makes no difference to the fall of 12 m. His horizontal velocity is constant but larger, so using d = vt he lands further away, at about 31 m.",
            model: "<p>Any three of (1 each):</p><ul><li>Vertical and horizontal motions are independent: the vertical motion (u = 0, s = 12 m) is unchanged, so the time in the air is the same, 1.6 s</li><li>The acceleration due to gravity does not depend on mass (F = mg and F = ma, so a = g), so the mass of the rider is irrelevant to the time of fall</li><li>The horizontal velocity is constant (no horizontal force) and larger, so he travels further: d = vt = 20 × 1.565 = 31 m</li></ul><p>A heavier rider does <em>not</em> fall faster. Without air resistance mass has no effect on the flight.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 04 */
      {
        id: "odu-04",
        style: "Context question · projectile launched at an angle",
        stem:
          "<p>At a youth football tournament a goalkeeper kicks a ball from the ground. The ball leaves the ground at 21 m s<sup>−1</sup> at an angle of 32° above the horizontal. The ground is level and air resistance may be ignored.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 17.809, tol: 0, sf: 2, unit: "m s⁻¹",
            q: "Calculate the horizontal component of the initial velocity of the ball.",
            why: "u<sub>h</sub> = u cos θ = 21 cos 32° = <strong>18 m s⁻¹</strong> (17.8). The vertical component is 21 sin 32° = 11.1 m s⁻¹.",
          },
          {
            label: "(b)", type: "calc", marks: 4,
            q: "Calculate the horizontal distance travelled by the ball before it lands.",
            steps: [
              { desc: "Uses an equation of motion for the vertical motion to find the time (e.g. v = u + at with v = 0 at the top)", rel: [...VUAT, ...SUVAT_S] },
              { desc: "Total time of flight 2.27 s (twice the time to the top, 1.14 s)", nums: [[2.27, 2.3, 2.271, 2.28]] },
              { desc: "Uses d = vt for the horizontal motion, with the horizontal speed 17.8 m s⁻¹", rel: DVT, nums: [[17.8, 17.81, 18]] },
              { desc: "Final answer 40 m with unit", ans: 40.4457, sf: 2, alts: [41], unit: "m" },
            ],
            sample: "Vertical: u_v = 21 sin 32° = 11.13 m s⁻¹, v = 0 at the top\nv = u + at\n0 = 11.13 − 9.8t\nt = 1.14 s to the top\ntotal time = 2 × 1.14 = 2.27 s\nHorizontal: u_h = 21 cos 32° = 17.81 m s⁻¹\nd = vt = 17.81 × 2.27\nd = 40 m",
            model: "<ul><li>v = u + at (or s = ut + ½at²) applied to the vertical motion (1)</li><li>Time to the top 1.14 s, so total time 2.27 s (the ball lands at the launch height) (1)</li><li>d = v̄t = 17.8 × 2.27 (1)</li><li>40 m (1)</li></ul><p>Accept 41 m if the time is rounded to 2.3 s part-way through. A very common error is to use 21 m s⁻¹ as the horizontal speed or to forget to double the time.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 5, minWords: 10,
            q: "Describe how the horizontal and the vertical components of the ball's velocity change from the moment it is kicked until just before it lands.",
            points: [
              { desc: "The horizontal component is constant (no horizontal force)", any: [near("horizontal", "constant|same|unchanged|stays|remains|uniform|doesn'?t change|does not change|not change", 6)] },
              { desc: "The vertical component decreases to zero at the top, then increases downwards (constant acceleration of 9.8 m s⁻² downwards)", all: [near("vertical", "decreas\\w*|reduc\\w*|slow\\w*|smaller|less|falls?|lower", 10), "zero|\\b0\\b|top|highest|maximum|stops"], win: 220 },
            ],
            sample: "The horizontal component stays constant throughout the flight because there is no horizontal force. The vertical component decreases steadily as the ball rises, is zero at the highest point, and then increases in the downward direction as the ball falls.",
            model: "<ul><li>Horizontal component constant (1)</li><li>Vertical component decreases uniformly to zero at the top, then increases in the opposite (downward) direction, because of the constant acceleration of 9.8 m s⁻² downwards (1)</li></ul>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 1,
            q: "Which row gives the velocity and acceleration of the ball at the highest point of its flight?",
            opts: [
              "Velocity zero; acceleration 9.8 m s⁻² downwards",
              "Velocity 17.8 m s⁻¹ horizontally; acceleration 9.8 m s⁻² downwards",
              "Velocity 17.8 m s⁻¹ horizontally; acceleration zero",
              "Velocity zero; acceleration zero",
              "Velocity 21 m s⁻¹ at 32°; acceleration 9.8 m s⁻² downwards",
            ],
            why: "At the top only the <em>vertical</em> component is zero; the horizontal component is still 17.8 m s⁻¹. Gravity still acts, so the acceleration is 9.8 m s⁻² downwards. Options 0 and 3 treat the whole velocity as zero; option 2 says gravity switches off.",
          },
        ],
      },
      /* ---------------------------------------------------------------- 05 */
      {
        id: "odu-05",
        style: "Context question · resultant force, Newton's laws",
        figure: figTow,
        stem:
          "<p>A car of mass 1200 kg pulls a caravan of mass 800 kg along a straight, level road. The engine produces a forward force of 3500 N on the car. The friction forces are 400 N on the car and 300 N on the caravan. The forces on the vehicles are shown.</p>",
        parts: [
          {
            label: "(a)", type: "calc", marks: 3,
            q: "Calculate the acceleration of the car and caravan.",
            steps: [
              { desc: "Uses F = ma with the unbalanced (resultant) force", rel: FMA },
              { desc: "Substitution: unbalanced force 2800 N (3500 − 400 − 300) and total mass 2000 kg", nums: [2800, 2000] },
              { desc: "Final answer 1.4 m s⁻² with unit", ans: 1.4, sf: 2, unit: "m s-2" },
            ],
            sample: "unbalanced force = 3500 − 400 − 300 = 2800 N\nF = ma\n2800 = 2000 × a\na = 1.4 m s⁻²",
            model: "<ul><li>F = ma (1)</li><li>(3500 − 400 − 300) = (1200 + 800) × a, or 2800 = 2000a (1)</li><li>a = 1.4 m s⁻² (1)</li></ul><p>The force in F = ma is the <em>unbalanced</em> force. Using 3500 N on its own gives 1.75 m s⁻²: 0 for the substitution mark.</p>",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Calculate the tension in the tow bar.",
            steps: [
              { desc: "Uses F = ma on the caravan alone (or the car alone)", rel: FMA },
              { desc: "Substitution: T − 300 = 800 × 1.4 (or 3500 − 400 − T = 1200 × 1.4)", nums: [[800, 1200], [300, 400]] },
              { desc: "Final answer 1.4 × 10³ N (1420 N) with unit", ans: 1420, sf: 2, unit: "n" },
            ],
            sample: "Consider the caravan: F = ma\nT − 300 = 800 × 1.4\nT = 1120 + 300\nT = 1420 N",
            model: "<ul><li>F = ma applied to one vehicle (1)</li><li>T − 300 = 800 × 1.4 (or 3500 − 400 − T = 1200 × 1.4) (1)</li><li>T = 1.4 × 10³ N (1420 N) (1)</li></ul><p>Check with the car: 3500 − 400 − 1420 = 1680 N = 1200 × 1.4. The tension is the same on both because it is a Newton's third law pair.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "The tow bar pulls the caravan forwards with the tension force. State the size and direction of the force that forms a Newton's third law pair with this force, and say what object it acts on.",
            points: [
              { desc: "The pair force has the same size, 1420 N (about 1.4 × 10³ N)", any: ["\\b14[0-9]0 ?n\\b", "1\\.4(?:2)? ?x ?10\\^3"] },
              { desc: "It acts backwards (opposite direction) on the car", all: ["\\b(?:backwards?|rearwards?|opposite|towards the (?:rear|back)|to the left|against the motion|behind)\\b", "\\b(?:car|vehicle|tow ?bar|front)\\b"], win: 120 },
            ],
            sample: "The pair is a force of 1420 N, the same size as the tension, acting backwards on the car. It is equal in size and opposite in direction.",
            model: "<ul><li>Equal in size: 1420 N (about 1.4 × 10³ N) (1)</li><li>Opposite direction (backwards), acting on the car / tow bar (1)</li></ul><p>A third-law pair acts on <em>different</em> objects. It is not the friction force on the caravan: that is a different force on the same object.</p>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 1,
            q: "Later the car and caravan travel along the level road at a constant speed of 25 m s⁻¹. Which statement is correct?",
            opts: [
              "The engine force is greater than the total friction force",
              "The engine force is equal to the total friction force, so the resultant force is zero",
              "There is no friction acting, because the speed is constant",
              "The resultant force is forwards and constant",
              "The tension in the tow bar is zero",
            ],
            why: "Constant velocity means zero acceleration, so by Newton's first law the forces are balanced: engine force = total friction (including air resistance). Friction does not vanish at constant speed (option 2), and the tow bar still has to balance the caravan's friction (option 4).",
          },
        ],
      },
      /* ---------------------------------------------------------------- 06 */
      {
        id: "odu-06",
        style: "Context question · forces on a slope and tension",
        stem:
          "<p>In a warehouse a 40 kg crate is pulled up a rough ramp by a rope parallel to the ramp. The ramp is at 25° to the horizontal. The friction force on the crate is 60 N. The crate accelerates up the ramp at 0.50 m s<sup>−2</sup>.</p>",
        parts: [
          {
            label: "(a)", type: "multi", marks: 4,
            q: "Which <strong>four</strong> of the following are forces acting on the crate as it is pulled up the ramp?",
            opts: [
              "The tension in the rope, directed up the slope",
              "The weight of the crate, directed vertically downwards",
              "The normal reaction of the ramp, at right angles to the surface of the ramp",
              "The friction force, directed down the slope",
              "A force directed up the slope, because the crate is moving up the slope",
              "A separate force of mg cos 25° pressing into the ramp, in addition to the weight",
              "The force of the crate on the ramp, directed into the ramp",
              "The unbalanced force of 20 N (ma), directed up the slope, as an extra force on the crate",
            ],
            a: [0, 1, 2, 3],
            why: "Four forces act on the crate: tension, weight, normal reaction and friction (opposing the motion, so down the slope). There is no &ldquo;force of motion&rdquo;: an object moving up the slope does not need a force in that direction to keep moving. The components mg sin θ and mg cos θ are parts of the weight, not extra forces.",
          },
          {
            label: "(b)", type: "calc", marks: 4,
            q: "Calculate the tension in the rope.",
            steps: [
              { desc: "Uses F = ma with the unbalanced force along the slope", rel: FMA },
              { desc: "Component of the weight down the slope: mg sin 25° = 166 N", nums: [[166, 165.7, 170]] },
              { desc: "Substitution: T − 166 − 60 = 40 × 0.50", nums: [60, 0.5, 40] },
              { desc: "Final answer 2.5 × 10² N (246 N) with unit", ans: 245.67, sf: 2, unit: "n" },
            ],
            sample: "component of weight down the slope = mg sin θ = 40 × 9.8 × sin 25° = 166 N\nF = ma\nT − 166 − 60 = 40 × 0.50\nT = 20 + 166 + 60\nT = 246 N",
            model: "<ul><li>F = ma along the slope (1)</li><li>mg sin 25° = 40 × 9.8 × sin 25° = 166 N (1)</li><li>T − 166 − 60 = 40 × 0.50 (1)</li><li>T = 2.5 × 10² N (246 N) (1)</li></ul><p>Both friction and the weight component act down the slope when the crate moves <em>up</em>, so they add. Subtracting the friction (T = 126 N) is the error the 2025 report picked out.</p>",
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 2,
            q: "The rope snaps while the crate is still moving up the ramp. What is the acceleration of the crate immediately afterwards?",
            opts: [
              "2.6 m s⁻² down the slope",
              "4.1 m s⁻² down the slope",
              "5.6 m s⁻² down the slope",
              "5.6 m s⁻² up the slope",
              "9.8 m s⁻² down the slope",
            ],
            why: "The crate is still moving up, so friction still acts <em>down</em> the slope along with mg sin θ: F = 166 + 60 = 226 N, and a = 226/40 = 5.6 m s⁻² down the slope (the crate is slowing). Option 0 subtracts the friction; option 1 ignores it; option 3 gives the wrong direction (acceleration is in the direction of the resultant force); option 4 forgets the slope.",
          },
        ],
      },
      /* ---------------------------------------------------------------- 07 */
      {
        id: "odu-07",
        style: "Experiment context · momentum, collisions and explosions",
        figure: figTrolleys,
        stem:
          "<p>Two trolleys, A and B, run towards each other along a straight, level track in a laboratory. Trolley A has mass 0.60 kg and moves right at 2.0 m s<sup>−1</sup>. Trolley B has mass 0.45 kg and moves left at 1.0 m s<sup>−1</sup>. When they meet, the trolleys stick together. Friction can be ignored.</p>",
        parts: [
          {
            label: "(a)", type: "text", marks: 2, rows: 4, minWords: 10,
            q: "State the law of conservation of linear momentum.",
            points: [
              { desc: "The total momentum before a collision (or explosion) is equal to the total momentum after it", all: ["total\\W+(?:\\w+\\W+){0,2}momentum|momentum\\W+(?:\\w+\\W+){0,4}(?:of|in) the (?:system|colliding|whole|objects|two)|sum of (?:the )?momenta|sum of (?:the )?momentum", "before|initial", "after|final", "equal|same|constant|conserved|unchanged|equals"], win: 220 },
              { desc: "…in the absence of external forces (provided no unbalanced / external force acts)", any: [near("no|without|absence|absent|unless|isolated|closed|zero|free from|free of", "external|outside|unbalanced|resultant|net", 5)] },
            ],
            sample: "The total momentum before a collision is equal to the total momentum after the collision, as long as there are no external forces acting on the system.",
            model: "<ul><li>The total momentum before a collision/explosion equals the total momentum after it (1)</li><li>in the absence of external forces (1)</li></ul><p>The 2025 report: many candidates omitted <em>total</em> or the absence of external forces. Both are needed.</p>",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Calculate the velocity of the trolleys immediately after they stick together.",
            steps: [
              { desc: "Conservation of momentum: total momentum before = total momentum after", rel: ["momentum(?:before)?=(?:total)?momentum", "pbefore=pafter", "m\\w{0,2}u\\w{0,2}\\+m\\w{0,2}u\\w{0,2}=", "m\\w{0,2}v\\w{0,2}\\+m\\w{0,2}v\\w{0,2}=", "mu\\+mu=\\(?m\\+m\\)?v"] },
              { desc: "Substitution with a correct sign for B: 0.60 × 2.0 + 0.45 × (−1.0) = 1.05 v", nums: [0.6, 0.45, 2] },
              { desc: "Final answer 0.71 m s⁻¹ with unit (to the right)", ans: 0.714286, sf: 2, unit: "m s-1" },
            ],
            sample: "Take right as positive.\ntotal momentum before = total momentum after\nm_A u_A + m_B u_B = (m_A + m_B)v\n(0.60 × 2.0) + (0.45 × −1.0) = 1.05 × v\n0.75 = 1.05v\nv = 0.71 m s⁻¹",
            model: "<ul><li>m<sub>A</sub>u<sub>A</sub> + m<sub>B</sub>u<sub>B</sub> = (m<sub>A</sub> + m<sub>B</sub>)v (1)</li><li>(0.60 × 2.0) + (0.45 × −1.0) = 1.05v (1)</li><li>v = 0.71 m s⁻¹ (to the right) (1)</li></ul><p>Forgetting that B's velocity is negative gives 1.9 m s⁻¹. State the direction: right.</p>",
          },
          {
            label: "(c)", type: "calc", marks: 3,
            q: "Calculate the total kinetic energy lost in the collision. (This shows that the collision is inelastic.)",
            steps: [
              { desc: "Uses E_k = ½mv²", rel: EK },
              { desc: "Total E_k before 1.4 J (1.425 J) and after 0.27 J (0.268 J)", nums: [[1.425, 1.43, 1.4], [0.268, 0.27, 0.265, 0.2679]] },
              { desc: "Final answer 1.2 J (1.16 J lost) with unit", ans: 1.157, sf: 2, unit: "j" },
            ],
            sample: "E_k = ½mv²\nE_k before = ½ × 0.60 × 2.0² + ½ × 0.45 × 1.0² = 1.425 J\nE_k after = ½ × 1.05 × 0.714² = 0.268 J\nenergy lost = 1.425 − 0.268 = 1.2 J",
            model: "<ul><li>E<sub>k</sub> = ½mv² (1)</li><li>E<sub>k</sub> before = 1.425 J; E<sub>k</sub> after = 0.268 J (1)</li><li>Energy lost = 1.2 J (1.16 J) (1)</li></ul><p>The total kinetic energy has decreased (it is converted to heat and sound), so the collision is <strong>inelastic</strong>. In an elastic collision the total kinetic energy would be unchanged. Momentum is conserved in both cases.</p>",
          },
          {
            label: "(d)", type: "multi", marks: 2,
            q: "The two trolleys are now separate and at rest, touching, with a compressed spring between them. The spring is released, pushing the trolleys apart (an explosion). Select the <strong>two</strong> correct statements.",
            opts: [
              "The total momentum of the trolleys after the explosion is zero",
              "The total kinetic energy of the trolleys increases, because energy stored in the spring is transferred to kinetic energy",
              "The total kinetic energy of the trolleys after the explosion is zero",
              "The trolley with the smaller mass moves off more slowly",
              "Momentum is not conserved, because the spring exerts an external force on the trolleys",
            ],
            a: [0, 1],
            why: "Before the explosion the total momentum is zero, so it is zero afterwards: the trolleys have equal and opposite momenta. The kinetic energy rises from zero as stored energy is released. The lighter trolley needs the larger speed for the same size of momentum, and the spring is <em>inside</em> the system, so it is an internal force.",
          },
        ],
      },
      /* ---------------------------------------------------------------- 08 */
      {
        id: "odu-08",
        style: "Context question · impulse and a force–time graph",
        figure: figKick,
        stem:
          "<p>A hockey player strikes a stationary ball of mass 0.18 kg. The graph shows how the force of the stick on the ball varies with time during the contact, which lasts for 8.0 ms.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 3.6, tol: 0, sf: 2, unit: "N s",
            q: "Calculate the impulse on the ball.",
            why: "Impulse = area under the force–time graph = ½ × base × height = ½ × 0.0080 s × 900 N = <strong>3.6 N s</strong>. (Convert ms to s: 8.0 ms = 0.0080 s.)",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Calculate the speed of the ball as it leaves the stick.",
            steps: [
              { desc: "Uses Ft = mv − mu (impulse = change in momentum)", rel: ["ft=mv-mu", "ft=mv\\b", "mv-mu", "impulse=mv", "impulse=change", "δp=", "impulse=δ"] },
              { desc: "Substitution: 3.6 = 0.18 × v − 0", nums: [3.6, 0.18] },
              { desc: "Final answer 20 m s⁻¹ with unit", ans: 20, sf: 2, unit: "m s-1" },
            ],
            sample: "Ft = mv − mu\n3.6 = 0.18 × v − 0\nv = 3.6 ÷ 0.18\nv = 20 m s⁻¹",
            model: "<ul><li>Ft = mv − mu (1)</li><li>3.6 = 0.18v − 0 (1)</li><li>v = 20 m s⁻¹ (1)</li></ul><p>The ball starts at rest, so u = 0. Using the peak force (900 N) in Ft = mv − mu would be wrong: the impulse is the <em>area</em>.</p>",
          },
          {
            label: "(c)", type: "text", marks: 3, rows: 7, minWords: 15,
            q: "In another game a fielder catches a hard ball by moving her hands in the direction of the ball as it arrives, rather than holding them still. Use your knowledge of physics to explain why this lowers the chance of injury to her hands.",
            points: [
              { desc: "The ball has the same change in momentum (impulse) whichever way she catches it", any: [near("same|equal|fixed|constant|unchanged", "momentum|impulse", 6)] },
              { desc: "Moving her hands with the ball increases the time over which the ball is brought to rest", any: [near("increas\\w*|longer|extend\\w*|greater|lengthen\\w*|more|extra", "(?:stopping |contact |collision |catching )?(?:time|duration)", 4), "takes? longer"] },
              { desc: "Since Ft = mv − mu, the same impulse over a longer time means a smaller average force on her hands", any: [near("force", "smaller|less|reduc\\w*|lower|decreas\\w*|minimi[sz]\\w*|weaker", 6)] },
            ],
            sample: "The ball has the same change in momentum, and so the same impulse, however she catches it. By moving her hands with the ball she increases the time it takes to stop. Since Ft = mv − mu, the same impulse over a longer time gives a smaller average force on her hands, so she is less likely to be hurt.",
            model: "<p>Any three of (1 each):</p><ul><li>The change in momentum (impulse) of the ball is the same</li><li>Her hands moving back increases the stopping/contact time</li><li>Ft = mv − mu, so for the same Ft a longer t gives a smaller average force F</li><li>Smaller force on her hands, so less chance of injury</li></ul><p>The same idea explains airbags, crumple zones and soft landing mats. The impulse is not reduced, only the force.</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 09 */
      {
        id: "odu-09",
        style: "Context question · work done, energy and power",
        stem:
          "<p>On a fairground rollercoaster, a carriage and its passengers have a total mass of 1200 kg. The carriage is released from rest at the top of a hill, 28 m above the lowest point of the track. The track from the top to the lowest point is 160 m long. At the lowest point the carriage has a speed of 20 m s<sup>−1</sup>.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 23.4265, tol: 0, sf: 2, unit: "m s⁻¹",
            q: "Calculate the speed the carriage would have at the lowest point if there were no friction.",
            why: "With no friction, mgh = ½mv², so v = √(2gh) = √(2 × 9.8 × 28) = <strong>23 m s⁻¹</strong>. The mass cancels.",
          },
          {
            label: "(b)", type: "calc", marks: 4,
            q: "Calculate the average friction force acting on the carriage as it travels from the top to the lowest point.",
            steps: [
              { desc: "Uses E_p = mgh and E_k = ½mv² (energy lost = E_p lost − E_k gained)", rel: [...EP, ...EK] },
              { desc: "Energy lost to friction 8.9 × 10⁴ J (89280 J)", nums: [[89280, 89300, 89000, 8.9e4, 9e4]] },
              { desc: "Uses E_w = Fd with d = 160 m", rel: ["e_?w=fd", "w=fd", "e=fd", "f=e_?w?/d", "f=w/d", "d=e/f", "f=\\d+\\.?\\d*/160"], nums: [160] },
              { desc: "Final answer 5.6 × 10² N (558 N) with unit", ans: 558, sf: 2, unit: "n" },
            ],
            sample: "E_p = mgh = 1200 × 9.8 × 28 = 329280 J\nE_k = ½mv² = ½ × 1200 × 20² = 240000 J\nenergy lost = 329280 − 240000 = 89280 J\nE_w = Fd\n89280 = F × 160\nF = 558 N",
            model: "<ul><li>E<sub>p</sub> = mgh and E<sub>k</sub> = ½mv² used (1)</li><li>Energy lost to friction = 329280 − 240000 = 8.9 × 10⁴ J (1)</li><li>E<sub>w</sub> = Fd: 89280 = F × 160 (1)</li><li>F = 5.6 × 10² N (558 N) (1)</li></ul><p>The energy lost is the work done against friction, which becomes heat (and sound). Conservation of energy: E<sub>p</sub> at the top = E<sub>k</sub> at the bottom + work against friction.</p>",
          },
          {
            label: "(c)", type: "num", marks: 1, a: 8232, tol: 0, sf: 2, unit: "W",
            q: "A motor pulls the carriage back to the top of the hill at a steady speed in 40 s. Calculate the useful power output of the motor. (Ignore friction on the way up.)",
            why: "At a steady speed the motor's work equals the gain in gravitational potential energy: E = mgh = 329280 J. P = E/t = 329280 ÷ 40 = 8232 W, so <strong>8.2 × 10³ W</strong>.",
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "Describe the energy changes as the carriage moves from the top of the hill to the lowest point.",
            points: [
              { desc: "Gravitational potential energy is transferred to kinetic energy", any: [near("potential|e_?p\\b|gpe|gravitational", "kinetic|e_?k\\b|ke\\b|movement|motion", 8)] },
              { desc: "Some energy is transferred to heat (and sound) by friction / air resistance", any: [near("friction|air resistance|drag|resistance", "heat|thermal|sound|internal|wasted|lost", 10), near("heat|thermal|sound", "friction|air resistance|drag|resistance", 10)] },
            ],
            sample: "Gravitational potential energy at the top is transferred into kinetic energy as the carriage speeds up. Some of the energy is transferred to heat and sound by friction and air resistance, so the carriage has less kinetic energy than it would without friction.",
            model: "<ul><li>Gravitational potential energy → kinetic energy (1)</li><li>Some energy is transferred to heat (and sound) because of friction / air resistance (1)</li></ul>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 10 */
      {
        id: "odu-10",
        style: "Context question · gravitation and satellites",
        stem:
          "<p>A weather satellite of mass 850 kg is in a circular orbit 8.0 × 10<sup>5</sup> m above the surface of the Earth. The mass of the Earth is 6.0 × 10<sup>24</sup> kg and the radius of the Earth is 6.4 × 10<sup>6</sup> m.</p>",
        parts: [
          {
            label: "(a)", type: "calc", marks: 4,
            q: "Calculate the gravitational force between the Earth and the satellite.",
            steps: [
              { desc: "Uses F = Gm₁m₂/r²", rel: ["f=g(?:x)?m[\\w₁₂]{0,2}x?m[\\w₁₂]{0,2}\\)?/\\(?r\\^?2", "f=g\\(?m", "f=g(?:x)?\\(?m"] },
              { desc: "Distance between centres: r = 6.4 × 10⁶ + 8.0 × 10⁵ = 7.2 × 10⁶ m", nums: [[7.2e6, 7200000, 7.2e3]] },
              { desc: "Substitution of G, the two masses (and r)", nums: [6.67e-11, 6.0e24, 850] },
              { desc: "Final answer 6.6 × 10³ N with unit", ans: 6561.92, sf: 2, unit: "n" },
            ],
            sample: "r = 6.4 × 10⁶ + 8.0 × 10⁵ = 7.2 × 10⁶ m\nF = Gm₁m₂/r²\nF = 6.67 × 10⁻¹¹ × 6.0 × 10²⁴ × 850 / (7.2 × 10⁶)²\nF = 6.6 × 10³ N",
            model: "<ul><li>F = Gm₁m₂/r² (1)</li><li>r = 6.4 × 10⁶ + 8.0 × 10⁵ = 7.2 × 10⁶ m: the distance is between the <em>centres</em> (1)</li><li>F = 6.67 × 10⁻¹¹ × 6.0 × 10²⁴ × 850 / (7.2 × 10⁶)² (1)</li><li>F = 6.6 × 10³ N (1)</li></ul><p>Using 8.0 × 10⁵ m (the height) or 6.4 × 10⁶ m (the radius) for r is the usual error.</p>",
          },
          {
            label: "(b)", type: "num", marks: 1, a: 1640.48, tol: 0, sf: 2, unit: "N",
            q: "The satellite is moved to an orbit with <strong>twice</strong> the orbital radius. Calculate the gravitational force on it in the new orbit.",
            why: "Gravity follows an inverse square law: doubling r divides F by 2² = 4. F = 6562 ÷ 4 = <strong>1.6 × 10³ N</strong>.",
          },
          {
            label: "(c)", type: "text", marks: 3, rows: 8, minWords: 15,
            q: "A news website says: &ldquo;Astronauts in orbit float because there is no gravity in space.&rdquo; Use your knowledge of physics to comment on this statement.",
            points: [
              { desc: "Gravity still acts at orbital height: the pull is only a little weaker (F = Gm₁m₂/r²)", any: [near("still|continues?|remains?|nearly|almost|slightly|only a little|reduced|weaker|a bit", "gravity|gravitational|weight|force of gravity|pull|attraction", 6)], not: ["\\bno gravity\\b", "\\bzero gravity\\b", "\\bgravity (?:is|has) (?:zero|gone)", "\\b(?:out of|escape[sd]?) (?:the |earth'?s )?gravity", "\\bwithout gravity", "\\bgravity (?:does ?n'?t|does not|isn'?t|is not) (?:act|exist|work|affect)"] },
              { desc: "The astronaut and the craft are both in free fall, falling with the same acceleration, so there is no contact force between them (apparent weightlessness)", any: [near("free[- ]?fall|falling|fall\\w*", "together|same|craft|station|satellite|spacecraft|orbit", 8), "same acceleration", near("no|zero|nothing", "contact force|reaction force|normal force|force from the floor|pushing", 6)] },
              { desc: "They are moving sideways so fast that they keep missing the Earth: they fall around it (an orbit)", any: [near("sideways|horizontal\\w*|tangential|orbital|forward|speed|velocity", "round|around|miss\\w*|curve\\w*|never (?:land|hit)|keeps? (?:on )?falling", 10), "falls? (?:around|round)", "orbit\\w* (?:is|means|are)\\W+(?:\\w+\\W+){0,3}(?:fall\\w*|free ?fall)"] },
            ],
            sample: "The statement is wrong because gravity still acts on the astronauts at that height: the force is only a little weaker than at the surface, as F = Gm₁m₂/r² falls only slightly when r increases a bit. The astronauts and the spacecraft are both in free fall, falling with the same acceleration, so the floor exerts no push on them and they appear weightless. They have a large sideways speed, so as they fall they keep missing the Earth and go around it in an orbit.",
            model: "<p>Any three of (1 each):</p><ul><li>Gravity still acts: at 8.0 × 10⁵ m up the pull is about 79% of its value at the surface (F ∝ 1/r²)</li><li>Gravity is the only force: the astronaut and the spacecraft fall with the same acceleration (free fall), so there is no contact force between them and the astronaut feels weightless</li><li>The satellite has a large velocity at right angles to the pull of gravity, so it keeps falling around the Earth without ever reaching it: that is an orbit</li></ul><p>&ldquo;No gravity in space&rdquo; is a misconception; 0 for a response built on it.</p>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 1,
            q: "What is the force exerted by the satellite on the Earth?",
            opts: [
              "Zero, because the Earth's mass is so much larger",
              "6.6 × 10³ N, directed towards the satellite",
              "6.6 × 10³ N, directed away from the satellite",
              "Much smaller than 6.6 × 10³ N, because the satellite's mass is small",
              "Much larger than 6.6 × 10³ N, because the Earth's mass is large",
            ],
            why: "Newton's third law: the two gravitational forces are equal in size and opposite in direction. The Earth pulls the satellite with 6.6 kN towards the Earth, and the satellite pulls the Earth with 6.6 kN towards the satellite. The Earth accelerates by a tiny amount only because its mass is so large (a = F/m).",
          },
        ],
      },
      /* ---------------------------------------------------------------- 11 */
      {
        id: "odu-11",
        style: "Context question · special relativity",
        stem:
          "<p>A survey spacecraft passes the Earth at a constant speed of 0.90<em>c</em> in a straight line. The pilot measures the time between passing two beacons to be 3.0 hours. When the spacecraft is at rest, its length is 80 m.</p>",
        parts: [
          {
            label: "(a)", type: "multi", marks: 2,
            q: "Select the <strong>two</strong> correct statements about measurements made by observers on the Earth.",
            opts: [
              "The time between the beacons is longer than 3.0 hours",
              "The length of the spacecraft, along its direction of travel, is less than 80 m",
              "The width of the spacecraft is less than when it is at rest",
              "The speed of light from the spacecraft's headlights is 1.9c",
              "The pilot's clock runs faster than the clocks on Earth",
            ],
            a: [0, 1],
            why: "For the Earth observers the spacecraft is moving. Time dilation: the moving pilot's clock runs slowly, so Earth measures a <em>longer</em> time for the trip (t′ &gt; t). Length contraction: only the length along the direction of motion is shorter. The speed of light is c for every observer, so no 1.9c, and the width does not change.",
          },
          {
            label: "(b)", type: "calc", marks: 3,
            q: "Calculate the time between passing the beacons as measured by an observer on the Earth.",
            steps: [
              { desc: "Uses t′ = t / √(1 − (v/c)²)", rel: ["t.{0,2}=\\(?t\\)?/\\(?sqrt\\(?1-", "t.{0,2}=\\(?t\\)?/\\(?sqrt", "t.{0,2}=t/\\(?sqrt", "t.{0,2}=tx?\\(?1-"] },
              { desc: "Substitution: 3.0 and v = 0.90c (v/c = 0.90, or 2.7 × 10⁸ with 3.00 × 10⁸)", nums: [3, [0.9, 2.7e8]] },
              { desc: "Final answer 6.9 hours with unit", ans: 6.88247, sf: 2, unit: ["h", "hours", "hour", "hr", "hrs"] },
            ],
            sample: "t′ = t / √(1 − (v/c)²)\nt′ = 3.0 / √(1 − 0.90²)\nt′ = 3.0 / 0.436\nt′ = 6.9 hours",
            model: "<ul><li>t′ = t/√(1 − (v/c)²) (1)</li><li>t′ = 3.0/√(1 − 0.90²) (1)</li><li>t′ = 6.9 hours (1)</li></ul><p>The 3.0 h is the time on the pilot's clock, which is <em>at rest</em> relative to the beacon passages, so it is t. The Earth observer measures the longer time t′. Any unit of time is fine if consistent. Multiplying by 0.436 (6.9 → 1.3 h) is the swapped-t error.</p>",
          },
          {
            label: "(c)", type: "num", marks: 1, a: 34.8712, tol: 0, sf: 2, unit: "m",
            q: "Calculate the length of the spacecraft as measured by an observer on the Earth.",
            why: "l′ = l√(1 − (v/c)²) = 80 × √(1 − 0.90²) = 80 × 0.436 = <strong>35 m</strong>. The length measured by the observer for whom the spacecraft is moving is shorter than its length at rest.",
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 5, minWords: 12,
            q: "Muons created high in the atmosphere have a lifetime of 2.2 µs in their own frame of reference. They travel at 0.995c towards the ground, yet many survive to be detected at ground level. Explain this observation, from the point of view of an observer on the Earth.",
            points: [
              { desc: "For the Earth observer the muon's lifetime is longer than 2.2 µs because of time dilation (moving clocks run slowly)", any: [near("time|lifetime|life|clock", "longer|dilat\\w*|stretch\\w*|extended|slower|slow|increas\\w*", 8)] },
              { desc: "…so the muons travel further/for longer before decaying and a large fraction reach the ground", any: [near("further|farther|more distance|greater distance|enough time|longer distance|long enough", "ground|earth|surface|detect\\w*|reach\\w*|surviv\\w*|arriv\\w*", 8)] },
            ],
            sample: "Because the muons are moving at almost the speed of light, time dilation means that the Earth observer measures their lifetime to be much longer than 2.2 µs. This gives them enough time to travel much further before decaying, so many of them reach the ground.",
            model: "<ul><li>Time dilation: the moving muon's clock runs slowly, so the lifetime measured on Earth is longer than 2.2 µs (1)</li><li>The muons therefore travel further before decaying, so a large number reach the ground (1)</li></ul><p>Alternative from the muon's frame: the distance to the ground is length-contracted, so the journey takes less than the muon lifetime (1 + 1).</p>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 12 */
      {
        id: "odu-12",
        style: "Context question · the Doppler effect",
        figure: figDoppler,
        stem:
          "<p>An ambulance siren emits a note of constant frequency 700 Hz. The ambulance travels at a constant 25 m s<sup>−1</sup> along a straight road. The diagram shows wavefronts from the siren emitted at equal time intervals. The speed of sound in air is as given on the data sheet.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 755.556, tol: 0, sf: 2, alts: [756], unit: "Hz",
            q: "Calculate the frequency heard by a stationary observer X, in front of the ambulance, as it approaches.",
            why: "f<sub>o</sub> = f<sub>s</sub> × v/(v − v<sub>s</sub>) = 700 × 340/(340 − 25) = 700 × 340/315 = 755.6 Hz, so <strong>7.6 × 10² Hz</strong> (the observer ahead hears a higher frequency).",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 5, minWords: 12,
            q: "Use the diagram to explain, in terms of wavefronts, why observer X hears a note of higher frequency than the siren emits.",
            points: [
              { desc: "Between emitting one wavefront and the next the ambulance moves towards X, so the wavefronts in front are closer together (shorter wavelength)", any: [near("wavefronts?|waves", "closer|bunched|squashed|compressed|squeezed|together|shorter", 8), near("wavelength", "shorter|smaller|less|reduced|decreas\\w*", 5)] },
              { desc: "The speed of sound is unchanged, so more wavefronts arrive each second: the frequency heard is higher", group: "p2", all: [near("frequency|pitch", "higher|greater|increas\\w*|larger|bigger", 5), near("speed|velocity", "same|constant|unchanged|fixed|doesn'?t change|does not change", 6)], win: 220 },
              { desc: "More wavefronts arrive at X each second, so the frequency is higher", group: "p2", any: ["(?:more|greater number of)\\W+(?:\\w+\\W+){0,3}(?:waves?|wavefronts?|crests?)\\W+(?:\\w+\\W+){0,6}(?:per|each|every|in)\\W+(?:\\w+\\W+){0,2}second"] },
            ],
            sample: "Between emitting one wavefront and the next, the ambulance moves towards X, so the wavefronts in front of it are bunched closer together and the wavelength is shorter. The speed of sound is the same, so more wavefronts reach X every second and the frequency heard is higher.",
            model: "<ul><li>The source moves towards X between emitting wavefronts, so the wavefronts are closer together in front of it: the wavelength is shorter (1)</li><li>The wave speed is unchanged (v = fλ), so a shorter wavelength means a higher frequency: more wavefronts per second reach X (1)</li></ul><p>The 2025 report: a labelled diagram made answers clearer. The sound waves do not travel faster; it is the source that moves.</p>",
          },
          {
            label: "(c)", type: "calc", marks: 4,
            q: "A police car emits a note of frequency 900 Hz. A stationary observer, ahead of the police car, hears a note of frequency 960 Hz as the police car approaches. Calculate the speed of the police car.",
            steps: [
              { desc: "Uses f_o = f_s × v/(v ± v_s), choosing v − v_s for an approaching source", rel: ["f.{0,3}o.{0,2}=f.{0,3}s.{0,2}x?\\(?v/", "f.{0,3}o.{0,2}=f.{0,3}s", "f.{0,3}o.{0,2}=\\(?f.{0,3}s", "fo=fs"] },
              { desc: "Substitution: 960 = 900 × 340/(340 − v_s)", nums: [960, 900, 340] },
              { desc: "Rearranges: 340 − v_s = 318.75 (or equivalent, e.g. 960(340 − v_s) = 306 000)", nums: [[318.75, 318.8, 319, 306000, 20400, 326400]] },
              { desc: "Final answer 21 m s⁻¹ with unit", ans: 21.25, sf: 2, unit: "m s-1" },
            ],
            sample: "f_o = f_s × v/(v − v_s) (approaching)\n960 = 900 × 340/(340 − v_s)\n340 − v_s = 900 × 340/960 = 318.75\nv_s = 340 − 318.75\nv_s = 21 m s⁻¹",
            model: "<ul><li>f<sub>o</sub> = f<sub>s</sub>(v/(v − v<sub>s</sub>)) (1)</li><li>960 = 900 × 340/(340 − v<sub>s</sub>) (1)</li><li>340 − v<sub>s</sub> = 318.75 (1)</li><li>v<sub>s</sub> = 21 m s⁻¹ (1)</li></ul><p>Using v + v<sub>s</sub> (the receding formula) gives a negative speed; check that the observed frequency is higher, so the source is approaching and the denominator is smaller.</p>",
          },
          {
            label: "(d)", type: "mcq", marks: 1, a: 1,
            q: "The ambulance passes observer X and moves away from him. Which row describes the sound he hears as the ambulance moves away?",
            opts: [
              "Lower frequency and shorter wavelength",
              "Lower frequency and longer wavelength",
              "The same frequency and a longer wavelength",
              "Lower frequency and a lower speed of sound",
              "Higher frequency and longer wavelength",
            ],
            why: "Behind the source the wavefronts are spread out, so the wavelength is longer. The speed of sound in air is unchanged, so v = fλ gives a lower frequency. The pitch drops as the ambulance goes past.",
          },
        ],
      },
      /* ---------------------------------------------------------------- 13 */
      {
        id: "odu-13",
        style: "Data question · redshift, Hubble's law and the age of the Universe",
        figure: figSpectra,
        stem:
          "<p>The diagram shows the dark absorption lines of hydrogen, first in a laboratory and then in the light from a distant galaxy. The red line, at 656 nm in the laboratory, is at 686 nm in the light from the galaxy.</p>",
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 0,
            q: "What can be concluded from the diagram?",
            opts: [
              "The galaxy is moving away from us, because the lines are shifted to longer wavelengths",
              "The galaxy is moving towards us, because the lines are shifted to longer wavelengths",
              "The galaxy is moving away from us, because the lines are shifted to shorter wavelengths",
              "The galaxy is not moving relative to us, because the same lines are present",
              "The galaxy is hotter than the laboratory source, because its lines are further to the right",
            ],
            why: "The same pattern of lines is present (so the galaxy contains hydrogen) but all are shifted to longer wavelengths, towards the red end: <strong>redshift</strong>. A redshift means the source is moving away. The shift tells us about motion, not temperature.",
          },
          {
            label: "(b)", type: "num", marks: 1, a: 0.0457317, tol: 0, sf: 2, unit: "",
            q: "Calculate the redshift of the galaxy.",
            why: "z = (λ<sub>observed</sub> − λ<sub>rest</sub>)/λ<sub>rest</sub> = (686 − 656)/656 = <strong>0.046</strong> (0.0457). It is a ratio, so it has no unit.",
          },
          {
            label: "(c)", type: "calc", marks: 4,
            q: "Calculate the distance to the galaxy.",
            steps: [
              { desc: "Uses z = v/c (or v = zc) to find the recessional velocity", rel: ["z=v/c", "v=zx?c", "v=cx?z"] },
              { desc: "Recessional velocity 1.4 × 10⁷ m s⁻¹ (1.37 × 10⁷)", nums: [[1.372e7, 1.37e7, 1.4e7, 1.38e7, 1.371e7]] },
              { desc: "Uses v = H₀d", rel: ["v=h[_₀0]?x?d", "d=v/h[_₀0]?", "d=v/h", "v=hd"] },
              { desc: "Final answer 6.0 × 10²⁴ m with unit", ans: 5.965e24, sf: 2, unit: "m" },
            ],
            sample: "z = v/c\n0.0457 = v / 3.00 × 10⁸\nv = 1.37 × 10⁷ m s⁻¹\nv = H₀d\n1.37 × 10⁷ = 2.3 × 10⁻¹⁸ × d\nd = 6.0 × 10²⁴ m",
            model: "<ul><li>z = v/c (1)</li><li>v = 0.0457 × 3.00 × 10⁸ = 1.4 × 10⁷ m s⁻¹ (1)</li><li>v = H₀d (1)</li><li>d = 1.37 × 10⁷ ÷ 2.3 × 10⁻¹⁸ = 6.0 × 10²⁴ m (1)</li></ul><p>Carry the unrounded z. H₀ is on the data sheet, 2.3 × 10⁻¹⁸ s⁻¹; with this unit d comes out in metres, with v in m s⁻¹.</p>",
          },
          {
            label: "(d)", type: "num", marks: 1, a: 4.34783e17, tol: 0, sf: 2, unit: "s",
            q: "Use the Hubble constant H₀ = 2.3 × 10⁻¹⁸ s⁻¹ to estimate the age of the Universe, in seconds.",
            shown: "4.3 × 10¹⁷",
            why: "Running the expansion backwards, t = 1/H₀ = 1/(2.3 × 10⁻¹⁸) = <strong>4.3 × 10¹⁷ s</strong> (about 14 billion years).",
          },
          {
            label: "(e)", type: "text", marks: 2, rows: 5, minWords: 12,
            q: "A student says: &ldquo;Nearly all galaxies are moving away from us, so the Earth must be at the centre of the Universe.&rdquo; Use your knowledge of physics to comment on this statement.",
            points: [
              { desc: "Space itself is expanding, carrying the galaxies apart (all galaxies move away from each other)", any: [near("space|universe", "expand\\w*|stretch\\w*|growing", 6), near("galax\\w*", "apart|away from each other|away from one another|away from every|moving away from all", 8)] },
              { desc: "An observer in any galaxy would see the others receding in the same way, so there is no centre and the Earth is not special", any: [near("any|every|each", "galaxy|galaxies|observer|point|place|position|planet", 6), "no (?:centre|center)|no (?:special|central|preferred) (?:place|point|position)|nowhere is the (?:centre|center)|not (?:at )?the (?:centre|center)|not special"], win: 220 },
            ],
            sample: "The whole of space is expanding, so the galaxies are carried away from each other. An observer in any other galaxy would see the other galaxies moving away from them in just the same way, so there is no centre and the Earth is in no special place.",
            model: "<ul><li>The Universe/space itself is expanding, so all galaxies are moving away from each other (1)</li><li>Every observer, in any galaxy, would see the same pattern (speed proportional to distance, v = H₀d), so there is no centre, and the Earth's position is not special (1)</li></ul>",
          },
        ],
      },
      /* ---------------------------------------------------------------- 14 */
      {
        id: "odu-14",
        style: "Short answers · stars, evidence for the Big Bang, dark matter",
        figure: figStars,
        stem:
          "<p>The graph shows how the intensity of the radiation emitted by two stars, P and Q, varies with wavelength.</p>",
        parts: [
          {
            label: "(a)", type: "multi", marks: 2,
            q: "Select the <strong>two</strong> correct statements about the stars.",
            opts: [
              "Star Q has a higher surface temperature than star P",
              "At every wavelength shown, star Q emits more radiation per second per unit area than star P",
              "Star P has a higher surface temperature than star Q, because its peak wavelength is longer",
              "Star P appears bluer than star Q",
              "Star Q is moving away from us faster than star P",
              "The two stars have the same temperature because both curves have one peak",
            ],
            a: [0, 1],
            why: "A hotter star has a shorter peak wavelength and emits more radiation per unit area at every wavelength: curve Q is above curve P everywhere and peaks at 480 nm. Star Q (blue-white) is the hotter, star P (orange-red) the cooler. Colour tells us the temperature, not how fast a star is receding.",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4, minWords: 8,
            q: "State <strong>two</strong> pieces of evidence for the Big Bang theory, other than the redshift of galaxies.",
            points: [
              { desc: "The cosmic microwave background radiation", any: ["cosmic microwave|\\bcmbr?\\b|microwave background|microwave radiation|background radiation"] },
              { desc: "The abundance of hydrogen and helium (about 75% and 25%) matches the predictions", any: [near("abundance|proportion|amount|percentage|ratio|quantity|amounts|relative|makes? up|mostly|75|25", "hydrogen|helium", 8), near("hydrogen", "helium", 6)] },
              { desc: "The darkness of the night sky (Olbers' paradox)", any: [near("(?:night )?sky|night", "dark|black|dim", 5), "olbers"] },
            ],
            sample: "One piece of evidence is the cosmic microwave background radiation. Another is the abundance of hydrogen and helium in the Universe.",
            model: "<p>Any two of (1 each):</p><ul><li>The cosmic microwave background (faint microwaves from all directions, about 2.7 K)</li><li>The abundance of hydrogen (about three-quarters) and helium (about one-quarter) matches the Big Bang prediction</li><li>The darkness of the night sky (a finite age and expanding Universe)</li></ul>",
          },
          {
            label: "(c)", type: "match", marks: 3,
            q: "Match each term to its description.",
            pairs: [
              ["Dark matter", "Unseen matter, needed to explain why stars in galaxies orbit faster than the visible mass allows"],
              ["Dark energy", "The unknown cause of the accelerating expansion of the Universe"],
              ["Cosmic microwave background", "Faint microwave radiation arriving from all directions: the cooled glow of the early Universe"],
            ],
          },
          {
            label: "(d)", type: "text", marks: 3, rows: 8, minWords: 15,
            q: "Astronomers measure the orbital speeds of stars in a spiral galaxy. The speeds do not fall as expected for stars far from the centre of the galaxy but stay high. Use your knowledge of physics to comment on what this suggests about the matter in the galaxy.",
            points: [
              { desc: "Gravity from the visible matter alone would give lower orbital speeds at large distances: the stars orbit faster than expected", any: [near("faster|higher|greater|quicker", "expected|predicted|than|visible|calculated", 8), near("visible|stars|luminous", "not enough|insufficient|too little|less", 8)] },
              { desc: "More gravitational force (more mass) is needed to hold the stars in orbit, so the galaxy contains more mass than we can see", any: [near("more|extra|additional|greater|unseen|hidden|invisible|missing|undetected", "mass|matter|gravity|gravitational", 5)] },
              { desc: "This unseen matter is dark matter: it exerts gravity but does not emit (or absorb) light we can detect", any: ["dark matter"] },
            ],
            sample: "If only the visible matter provided the gravitational pull, the stars far from the centre would orbit more slowly, so they are orbiting faster than expected. A greater gravitational force is needed to keep them in orbit, so the galaxy must contain more mass than we can see. This unseen mass is called dark matter, which exerts gravity but gives out no light we can detect.",
            model: "<p>Any three of (1 each):</p><ul><li>With only the visible mass, orbital speeds should fall with distance from the centre; observed speeds are higher than expected</li><li>More gravitational force/mass is needed to hold the stars in their orbits than the visible matter provides</li><li>So the galaxy contains a large amount of unseen mass: dark matter (several times the visible mass), which exerts gravity but cannot be seen</li></ul><p>Dark energy is a different idea: it is linked to the <em>accelerating expansion</em>, not galaxy rotation.</p>",
          },
        ],
      },
    ],
  };
})();
