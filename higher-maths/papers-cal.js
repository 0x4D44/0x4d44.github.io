/* Past-paper practice: Calculus. Original questions in the pattern of recent SQA Higher Mathematics papers (not copied). */
(function () {
  "use strict";
  const B = (window.HMP_BANK = window.HMP_BANK || {});
  const R = String.raw;

  /* ---- small SVG helpers (palette: ink, teal accent, paper) ---- */
  const INK = "#1d1a14", ACC = "#155457", PAPER = "#fffaf0";
  const svg = (label, body) =>
    `<svg viewBox="0 0 340 240" role="img" aria-label="${label}"><rect width="340" height="240" fill="${PAPER}"/>${body}</svg>`;
  const line = (x1, y1, x2, y2, col, sw, dash) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col || INK}" stroke-width="${sw || 1.4}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  const text = (x, y, s, anchor, col) =>
    `<text x="${x}" y="${y}" font-size="13" text-anchor="${anchor || "middle"}" fill="${col || INK}" font-family="sans-serif">${s}</text>`;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${ACC}" stroke="${INK}" stroke-width="1"/>`;
  const frame = (xa, xb, ya, yb) => {
    const L = 28, Rr = 324, T = 14, Bt = 226;
    return {
      X: (x) => +(L + ((x - xa) * (Rr - L)) / (xb - xa)).toFixed(1),
      Y: (y) => +(Bt - ((y - ya) * (Bt - T)) / (yb - ya)).toFixed(1),
    };
  };
  const trace = (f, a, b, m, n) => {
    let d = "";
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      d += (i ? "L" : "M") + m.X(x) + " " + m.Y(f(x));
    }
    return d;
  };
  const axes = (m, xa, xb, ya, yb) =>
    line(m.X(xa), m.Y(0), m.X(xb), m.Y(0)) + line(m.X(0), m.Y(ya), m.X(0), m.Y(yb)) +
    text(m.X(xb) - 4, m.Y(0) + 16, "x") + text(m.X(0) + 12, m.Y(yb) + 12, "y");
  const curve = (d) => `<path d="${d}" fill="none" stroke="${ACC}" stroke-width="2.4"/>`;
  const shade = (f, a, b, m, n) =>
    `<path d="${trace(f, a, b, m, n)}L${m.X(b)} ${m.Y(0)}L${m.X(a)} ${m.Y(0)}Z" fill="${ACC}" fill-opacity="0.28" stroke="none"/>`;

  /* ---- Figure for the tangent question: y = x^3 - 3x^2 + 4 with the tangent at P(3, 4) ---- */
  const m8 = frame(-2, 4, -8, 9);
  const fig8 = svg(
    "Graph of the cubic y equals f of x, cutting the x-axis at minus 1 and touching it at 2, with a turning point at (0, 4). A straight line, the tangent at the point P(3, 4), touches the curve at P and slopes steeply upwards.",
    axes(m8, -2, 4, -8, 9) +
      curve(trace((x) => x * x * x - 3 * x * x + 4, -1.6, 3.35, m8, 90)) +
      line(m8.X(2.3), m8.Y(9 * 2.3 - 23), m8.X(3.5), m8.Y(9 * 3.5 - 23), INK, 1.6, "6 4") +
      dot(m8.X(3), m8.Y(4)) +
      text(m8.X(3) - 8, m8.Y(4) - 6, "P(3, 4)", "end") +
      text(m8.X(0.4), m8.Y(-6), "y = f(x)", "start", ACC) +
      text(m8.X(2.2), m8.Y(-2.6), "tangent", "end"));

  /* ---- Figure for the derivative question: y = f'(x) = (x + 1)(x - 3) ---- */
  const m9 = frame(-2, 4, -5, 6.5);
  const fig9 = svg(
    "Graph of y equals f dash of x, an upward parabola crossing the x-axis at x equals minus 1 and x equals 3 and the y-axis at minus 3, with its lowest point at (1, minus 4).",
    axes(m9, -2, 4, -5, 6.5) +
      curve(trace((x) => (x + 1) * (x - 3), -2, 4, m9, 80)) +
      dot(m9.X(-1), m9.Y(0)) + dot(m9.X(3), m9.Y(0)) +
      text(m9.X(-1) - 4, m9.Y(0) - 8, "&minus;1", "end") +
      text(m9.X(3) + 4, m9.Y(0) - 8, "3", "start") +
      text(m9.X(0) + 8, m9.Y(-3) + 14, "(0, &minus;3)", "start") +
      text(m9.X(1.05), m9.Y(-4) + 16, "(1, &minus;4)", "middle") +
      text(m9.X(3.1), m9.Y(4.2), "y = f&prime;(x)", "start", ACC));

  /* ---- Figure for the area question: y = x^3 - 4x, regions A (above) and B (below the axis) ---- */
  const m11 = frame(-2.7, 2.7, -4.5, 4.5);
  const f11 = (x) => x * x * x - 4 * x;
  const fig11 = svg(
    "Graph of y equals x cubed minus 4x, an S-shaped curve cutting the x-axis at minus 2, 0 and 2. Region A, between minus 2 and 0, lies above the x-axis and region B, between 0 and 2, lies below it. Both are shaded.",
    shade(f11, -2, 0, m11, 40) + shade(f11, 0, 2, m11, 40) +
      axes(m11, -2.7, 2.7, -4.5, 4.5) +
      curve(trace(f11, -2.4, 2.4, m11, 100)) +
      text(m11.X(-1), m11.Y(1.1), "A") + text(m11.X(1), m11.Y(-1.35), "B") +
      text(m11.X(-2), m11.Y(0) + 16, "&minus;2") + text(m11.X(2), m11.Y(0) - 8, "2") +
      text(m11.X(1.6), m11.Y(3.6), "y = x&sup3; &minus; 4x", "start", ACC));

  /* ---- Figure for the open box: a square sheet with a square of side x cut from each corner ---- */
  const fig17 = svg(
    "Net of an open box: a square sheet of card of side 18 centimetres, with a small square of side x cut from each of the four corners. The shaded corner squares are removed and the four flaps are folded up.",
    `<rect x="85" y="30" width="170" height="170" fill="none" stroke="${INK}" stroke-width="2"/>` +
      [[85, 30], [220, 30], [85, 165], [220, 165]].map((c) =>
        `<rect x="${c[0]}" y="${c[1]}" width="35" height="35" fill="${ACC}" fill-opacity="0.3" stroke="${INK}" stroke-width="1.4" stroke-dasharray="5 3"/>`).join("") +
      text(102, 26, "x") + text(238, 26, "x") + text(70, 52, "x", "end") + text(70, 187, "x", "end") +
      text(170, 218, "18 cm") + text(170, 120, "card") +
      line(85, 208, 255, 208, INK, 1) + line(85, 204, 85, 212, INK, 1) + line(255, 204, 255, 212, INK, 1));

  const intro = R`Differentiation, tangents and stationary points, optimisation, integration and areas, and motion in a straight line. Questions 1&ndash;12 are non-calculator (Paper 1 style, exact values); questions 13&ndash;18 are calculator (Paper 2 style: rounding, models, optimisation).`;

  const questions = [
    /* ---------------- 01 ---------------- */
    {
      id: "cal-01", calc: false,
      style: "Paper 1 style · non-calculator · differentiating with fractional and negative indices",
      stem: R`<p>A function is defined for $x\gt 0$ by $f(x)=8\sqrt{x}-\dfrac{3}{x^{2}}$.</p>`,
      parts: [{
        q: R`Find $f'(x)$.`,
        type: "expr", marks: 3, vars: ["x"], positive: true,
        a: "4x^(-1/2)+6x^(-3)",
        show: R`4x^{-\frac12}+6x^{-3}`,
        reject: ["4/sqrt(x)-6/x^3", "4x^(1/2)+6x^(-3)", "8x^(-1/2)+6x^(-3)"],
        partial: [{ a: "4x^(-1/2)-6x^(-3)", marks: 2, note: "a sign slip on the second term" }],
        why: R`<p>&bull;1 write in powers of $x$: $f(x)=8x^{\frac12}-3x^{-2}$</p><p>&bull;2 differentiate the first term: $8\times\tfrac12x^{-\frac12}=4x^{-\frac12}$</p><p>&bull;3 differentiate the second term: $-3\times(-2)x^{-3}=+6x^{-3}$</p><p>Answer $f'(x)=4x^{-\frac12}+6x^{-3}$. Commonly seen: $-6x^{-3}$ (the two minus signs should cancel).</p>`,
      }],
    },
    /* ---------------- 02 ---------------- */
    {
      id: "cal-02", calc: false,
      style: "Paper 1 style · non-calculator · chain rule, then an exact value",
      stem: R`<p>Use the chain rule in each part.</p>`,
      parts: [
        {
          label: "(a)", q: R`Differentiate $f(x)=(2x+5)^4$.`,
          type: "expr", marks: 2, vars: ["x"],
          a: "8(2x+5)^3", show: R`8(2x+5)^3`,
          reject: ["4(2x+5)^3", "(2x+5)^3", "8(2x+5)^4"],
          partial: [{ a: "4(2x+5)^3", marks: 1, note: "the inner derivative 2 is missing" }],
          why: R`<p>&bull;1 bring down the power and reduce it: $4(2x+5)^3$</p><p>&bull;2 multiply by the derivative of the bracket: $f'(x)=4(2x+5)^3\times 2=8(2x+5)^3$</p><p>Commonly seen: forgetting the factor $2$.</p>`,
        },
        {
          label: "(b)", q: R`The function $g$ is given by $g(x)=3\sin\left(2x+\dfrac{\pi}{6}\right)$. Find the exact value of $g'(0)$.`,
          type: "num", marks: 2,
          a: "3*sqrt(3)", show: R`3\sqrt{3}`,
          reject: ["3*sqrt(3)/2", "3", "-3*sqrt(3)"],
          partial: [{ a: "3*sqrt(3)/2", marks: 1, note: "the inner derivative 2 is missing" }],
          why: R`<p>&bull;1 differentiate: $g'(x)=3\cos\left(2x+\tfrac{\pi}{6}\right)\times 2=6\cos\left(2x+\tfrac{\pi}{6}\right)$</p><p>&bull;2 substitute $x=0$: $g'(0)=6\cos\tfrac{\pi}{6}=6\times\tfrac{\sqrt3}{2}=3\sqrt3$</p>`,
        },
      ],
    },
    /* ---------------- 03 ---------------- */
    {
      id: "cal-03", calc: false,
      style: "Paper 1 style · non-calculator · the graph of the derivative from the function",
      stem: R`<p>The function $f$ is given by $f(x)=x^3-12x$.</p>`,
      parts: [{
        q: R`Which of the following statements about the graph of $y=f'(x)$ are true? Select <b>all</b> that apply.`,
        type: "multi", marks: 3,
        opts: [
          "It is a parabola that opens upwards.",
          R`It crosses the $x$-axis at $x=-2$ and $x=2$.`,
          R`It crosses the $y$-axis at $(0,-12)$.`,
          "It passes through the origin.",
          "It is a straight line.",
          "It is positive for every value of x.",
        ],
        a: [0, 1, 2],
        why: R`<p>&bull;1 differentiate: $f'(x)=3x^2-12$, a parabola with positive $x^2$ coefficient, so it opens upwards.</p><p>&bull;2 $3x^2-12=3(x-2)(x+2)=0$ gives $x=\pm 2$.</p><p>&bull;3 $f'(0)=-12$, so it crosses the $y$-axis at $(0,-12)$, not at the origin. It is negative for $-2\lt x\lt 2$.</p>`,
      }],
    },
    /* ---------------- 04 ---------------- */
    {
      id: "cal-04", calc: false,
      style: "Paper 1 style · non-calculator · stationary points of a cubic and their nature",
      stem: R`<p>The function $f$ is given by $f(x)=2x^3-9x^2+12x$.</p>`,
      parts: [
        {
          label: "(a)", q: R`Find the $x$-coordinates of the stationary points of $f$. Give them separated by a comma.`,
          type: "set", marks: 2, a: [1, 2], show: R`x=1,\ 2`,
          reject: ["2", "-1, -2", "1, 3"],
          why: R`<p>&bull;1 differentiate and set to zero: $f'(x)=6x^2-18x+12=0$</p><p>&bull;2 factorise: $6(x-1)(x-2)=0$, so $x=1$ or $x=2$.</p>`,
        },
        {
          label: "(b)", q: R`Determine the coordinates of the local maximum, justifying that it is a maximum using a table of signs. Type the point as $(x,y)$.`,
          type: "vec", marks: 2, a: [1, 5], show: R`(1,5)`,
          reject: ["(2,4)", "(1,3)", "(5,1)"],
          why: R`<p>&bull;1 table of signs for $f'(x)=6(x-1)(x-2)$: $f'\gt0$ for $x\lt1$, $f'\lt0$ for $1\lt x\lt2$, $f'\gt0$ for $x\gt2$. Gradient goes $+\to 0\to-$ at $x=1$, so it is a local maximum.</p><p>&bull;2 $f(1)=2-9+12=5$, so the maximum is $(1,5)$. (At $x=2$: $f(2)=16-36+24=4$, a local minimum at $(2,4)$.)</p>`,
        },
        {
          label: "(c)", q: R`For which values of $x$ is $f$ strictly decreasing?`,
          type: "mcq", marks: 1,
          opts: [R`$x\lt 1$`, R`$1\lt x\lt 2$`, R`$x\gt 2$`, R`$x\lt 1$ or $x\gt 2$`, R`$-2\lt x\lt -1$`],
          a: 1,
          why: R`<p>&bull;1 $f'(x)\lt0$ between the two stationary points, so $f$ is strictly decreasing for $1\lt x\lt2$.</p>`,
        },
      ],
    },
    /* ---------------- 05 ---------------- */
    {
      id: "cal-05", calc: false,
      style: "Paper 1 style · non-calculator · equation of a normal",
      stem: R`<p>A curve has equation $y=6\sqrt{x}-x$, where $x\gt 0$. The point $P$ on the curve has $x$-coordinate $4$.</p>`,
      parts: [
        {
          label: "(a)", q: R`Find $\dfrac{dy}{dx}$.`,
          type: "expr", marks: 2, vars: ["x"], positive: true,
          a: "3x^(-1/2)-1", show: R`3x^{-\frac12}-1`,
          reject: ["6x^(-1/2)-1", "3x^(1/2)-1", "3x^(-1/2)+1"],
          partial: [{ a: "3x^(-1/2)", marks: 1, note: "the derivative of $-x$ is missing" }],
          why: R`<p>&bull;1 write $y=6x^{\frac12}-x$ and differentiate $6x^{\frac12}$: $3x^{-\frac12}$</p><p>&bull;2 differentiate $-x$: $-1$. So $\dfrac{dy}{dx}=3x^{-\frac12}-1$.</p>`,
        },
        {
          label: "(b)", q: R`Find the equation of the <b>normal</b> to the curve at $P$. Give your answer as an equation in $x$ and $y$.`,
          type: "eq", marks: 3, a: "y = -2x + 16", show: R`y=-2x+16`,
          accept: ["2x+y=16", "y-8=-2(x-4)"],
          reject: ["y = x/2 + 6", "y = -x/2 + 10", "y = 2x - 0"],
          why: R`<p>&bull;1 $y$-coordinate: $y=6\sqrt4-4=8$, so $P=(4,8)$</p><p>&bull;2 gradient of tangent $=3\times4^{-\frac12}-1=\tfrac12$, so gradient of normal $=-2$</p><p>&bull;3 $y-8=-2(x-4)$, i.e. $y=-2x+16$.</p><p>Commonly seen: giving the tangent $y=\tfrac12x+6$.</p>`,
        },
      ],
    },
    /* ---------------- 06 ---------------- */
    {
      id: "cal-06", calc: false,
      style: "Paper 1 style · non-calculator · indefinite integrals",
      stem: R`<p>Find each indefinite integral. Leave out the constant of integration if you like; it is not marked.</p>`,
      parts: [
        {
          label: "(a)", q: R`$\displaystyle\int\left(6\sqrt{x}-\dfrac{2}{x^{2}}\right)dx$, where $x\gt 0$.`,
          type: "expr", marks: 2, vars: ["x"], plusC: true, positive: true,
          a: "4x^(3/2)+2/x", show: R`4x^{\frac32}+\dfrac{2}{x}+c`,
          reject: ["4x^(3/2)-2/x", "9x^(3/2)+2/x", "3x^(-1/2)+4/x^3"],
          partial: [{ a: "4x^(3/2)-2/x", marks: 1, note: "a sign slip on the second term" }],
          why: R`<p>&bull;1 $\int6x^{\frac12}dx=6\times\dfrac{x^{3/2}}{3/2}=4x^{\frac32}$</p><p>&bull;2 $\int-2x^{-2}dx=-2\times\dfrac{x^{-1}}{-1}=2x^{-1}$. Answer $4x^{\frac32}+\dfrac2x+c$.</p>`,
        },
        {
          label: "(b)", q: R`$\displaystyle\int(3x+1)^4\,dx$`,
          type: "expr", marks: 2, vars: ["x"], plusC: true,
          a: "(3x+1)^5/15", show: R`\dfrac{(3x+1)^5}{15}+c`,
          reject: ["(3x+1)^5/5", "(3x+1)^5", "12(3x+1)^3"],
          partial: [{ a: "(3x+1)^5/5", marks: 1, note: "forgot to divide by the coefficient 3" }],
          why: R`<p>&bull;1 raise the power by one: $(3x+1)^5$ divided by the new power $5$</p><p>&bull;2 divide also by the derivative of the bracket, $3$: $\dfrac{(3x+1)^5}{15}+c$.</p>`,
        },
      ],
    },
    /* ---------------- 07 ---------------- */
    {
      id: "cal-07", calc: false,
      style: "Paper 1 style · non-calculator · integrating, then finding the constant from a point",
      stem: R`<p>A curve passes through the point $(4,3)$ and, for $x\gt 0$, its gradient function is $\dfrac{dy}{dx}=\dfrac{6}{\sqrt{x}}-2$.</p>`,
      parts: [{
        q: R`Express $y$ in terms of $x$.`,
        type: "expr", marks: 4, vars: ["x"], positive: true,
        a: "12sqrt(x)-2x-13", show: R`y=12\sqrt{x}-2x-13`,
        reject: ["12sqrt(x)-2x+13", "6sqrt(x)-2x-13", "12sqrt(x)-2x-5"],
        partial: [{ a: "12sqrt(x)-2x", marks: 2, note: "constant of integration left out" }],
        why: R`<p>&bull;1 write $\dfrac{dy}{dx}=6x^{-\frac12}-2$ and integrate the first term: $12x^{\frac12}$</p><p>&bull;2 integrate $-2$: $-2x$, so $y=12\sqrt x-2x+c$</p><p>&bull;3 substitute $(4,3)$: $3=12\times2-8+c=16+c$</p><p>&bull;4 $c=-13$, so $y=12\sqrt{x}-2x-13$.</p>`,
      }],
    },
    /* ---------------- 08 ---------------- */
    {
      id: "cal-08", calc: false,
      style: "Paper 1 style · non-calculator · tangent to a cubic, then where it meets the curve again",
      stem: R`<p>The diagram shows the graph of $y=f(x)$ where $f(x)=x^3-3x^2+4$. The point $P(3,4)$ lies on the curve and the broken line is the tangent to the curve at $P$.</p>`,
      figure: fig8,
      parts: [
        {
          label: "(a)", q: R`Find the gradient of the tangent at $P$.`,
          type: "num", marks: 2, a: 9, show: "9",
          reject: ["27", "3", "0"],
          why: R`<p>&bull;1 differentiate: $f'(x)=3x^2-6x$</p><p>&bull;2 substitute $x=3$: $f'(3)=27-18=9$.</p>`,
        },
        {
          label: "(b)", q: R`Hence find the equation of the tangent at $P$. Give your answer as an equation in $x$ and $y$.`,
          type: "eq", marks: 2, a: "y = 9x - 23", show: R`y=9x-23`,
          accept: ["y-4=9(x-3)", "9x-y=23"],
          reject: ["y = 9x - 4", "y = -x/9 + 13/3", "y = 9x + 4"],
          why: R`<p>&bull;1 use the point $(3,4)$ and gradient $9$: $y-4=9(x-3)$</p><p>&bull;2 simplify: $y=9x-23$.</p>`,
        },
        {
          label: "(c)", q: R`The tangent meets the curve again at the point $R$ (not shown in the diagram). Find the coordinates of $R$. Type the point as $(x,y)$.`,
          type: "vec", marks: 3, a: [-3, -50], show: R`(-3,-50)`,
          reject: ["(3,4)", "(-3,50)", "(-3,-5)"],
          why: R`<p>&bull;1 equate: $x^3-3x^2+4=9x-23$, so $x^3-3x^2-9x+27=0$</p><p>&bull;2 the line touches the curve at $x=3$, so $(x-3)^2$ is a factor: $(x-3)(x^2-9)=(x-3)^2(x+3)=0$, giving $x=-3$</p><p>&bull;3 $y=9(-3)-23=-50$, so $R=(-3,-50)$.</p>`,
        },
      ],
    },
    /* ---------------- 09 ---------------- */
    {
      id: "cal-09", calc: false,
      style: "Paper 1 style · non-calculator · working from the graph of f&prime;(x) to f(x)",
      stem: R`<p>The diagram shows the graph of $y=f'(x)$, the derivative of a function $f$. The graph is the parabola $y=(x+1)(x-3)$. It is also known that $f(0)=2$.</p>`,
      figure: fig9,
      parts: [
        {
          label: "(a)", q: R`State the $x$-coordinates of the stationary points of $f$. Give them separated by a comma.`,
          type: "set", marks: 2, a: [-1, 3], show: R`x=-1,\ 3`,
          reject: ["1, -3", "-1", "-1, 1"],
          why: R`<p>&bull;1 stationary points occur where $f'(x)=0$</p><p>&bull;2 the graph of $y=f'(x)$ cuts the $x$-axis at $x=-1$ and $x=3$.</p>`,
        },
        {
          label: "(b)", q: R`What is the nature of the stationary point of $f$ at $x=-1$?`,
          type: "mcq", marks: 1,
          opts: ["A local maximum", "A local minimum", "A rising point of inflexion", "A falling point of inflexion"],
          a: 0,
          why: R`<p>&bull;1 to the left of $x=-1$ the graph of $f'$ is above the axis ($f'\gt0$), to the right it is below ($f'\lt0$). The gradient of $f$ goes $+\to0\to-$: a local maximum.</p>`,
        },
        {
          label: "(c)", q: R`Find an expression for $f(x)$.`,
          type: "expr", marks: 3, vars: ["x"],
          a: "x^3/3-x^2-3x+2", show: R`f(x)=\dfrac{x^3}{3}-x^2-3x+2`,
          reject: ["x^3/3-x^2-3x", "x^3-x^2-3x+2", "x^3/3-x^2-3x-2"],
          partial: [{ a: "x^3/3-x^2-3x", marks: 2, note: "constant of integration left out" }],
          why: R`<p>&bull;1 expand: $f'(x)=x^2-2x-3$</p><p>&bull;2 integrate: $f(x)=\dfrac{x^3}{3}-x^2-3x+c$</p><p>&bull;3 $f(0)=2$ gives $c=2$, so $f(x)=\dfrac{x^3}{3}-x^2-3x+2$.</p>`,
        },
        {
          label: "(d)", q: R`Find the value of $f(x)$ at its local minimum.`,
          type: "num", marks: 1, a: -7, show: "-7",
          reject: ["7", "2", "-9"],
          why: R`<p>&bull;1 the local minimum is at $x=3$: $f(3)=9-9-9+2=-7$.</p>`,
        },
      ],
    },
    /* ---------------- 10 ---------------- */
    {
      id: "cal-10", calc: false,
      style: "Paper 1 style · non-calculator · differentiate, then &ldquo;hence&rdquo; integrate",
      stem: R`<p>Part (a) is a differentiation; part (b) is an integral that uses the result of part (a).</p>`,
      parts: [
        {
          label: "(a)", q: R`Differentiate $y=(x^2+4)^{\frac32}$ with respect to $x$.`,
          type: "expr", marks: 2, vars: ["x"],
          a: "3x(x^2+4)^(1/2)", show: R`3x\left(x^2+4\right)^{\frac12}`,
          reject: ["3(x^2+4)^(1/2)", "(3/2)(x^2+4)^(1/2)", "3x(x^2+4)^(-1/2)"],
          partial: [{ a: "(3/2)(x^2+4)^(1/2)", marks: 1, note: "the derivative of the inner function, 2x, is missing" }],
          why: R`<p>&bull;1 outer derivative: $\tfrac32(x^2+4)^{\frac12}$</p><p>&bull;2 multiply by the inner derivative $2x$: $\dfrac{dy}{dx}=3x(x^2+4)^{\frac12}$.</p>`,
        },
        {
          label: "(b)", q: R`Hence evaluate $\displaystyle\int_0^{\sqrt5}x\sqrt{x^2+4}\,dx$.`,
          type: "num", marks: 3, a: "19/3", show: R`\dfrac{19}{3}`,
          reject: ["19", "19/6", "11/3"],
          partial: [{ a: 19, marks: 2, note: "the factor $\\frac13$ from part (a) is missing" }],
          why: R`<p>&bull;1 from (a), $\displaystyle\int x\sqrt{x^2+4}\,dx=\tfrac13(x^2+4)^{\frac32}$</p><p>&bull;2 substitute the limits: $\tfrac13\left(9^{\frac32}-4^{\frac32}\right)$</p><p>&bull;3 $=\tfrac13(27-8)=\dfrac{19}{3}$.</p>`,
        },
      ],
    },
    /* ---------------- 11 ---------------- */
    {
      id: "cal-11", calc: false,
      style: "Paper 1 style · non-calculator · areas above and below the x-axis",
      stem: R`<p>The diagram shows the graph of $y=x^3-4x$. Region $A$ lies between the curve and the $x$-axis for $-2\le x\le0$ and region $B$ lies between the curve and the $x$-axis for $0\le x\le2$.</p>`,
      figure: fig11,
      parts: [
        {
          label: "(a)", q: R`Calculate the area of region $A$.`,
          type: "num", marks: 3, a: 4, show: "4",
          reject: ["-4", "0", "12"],
          partial: [{ a: -4, marks: 2, note: "limits subtracted the wrong way round" }],
          why: R`<p>&bull;1 integrate: $\displaystyle\int(x^3-4x)\,dx=\dfrac{x^4}{4}-2x^2$</p><p>&bull;2 substitute the limits $0$ and $-2$: $\left[\dfrac{x^4}{4}-2x^2\right]_{-2}^{0}=0-(4-8)$</p><p>&bull;3 area of $A$ is $4$ square units.</p>`,
        },
        {
          label: "(b)", q: R`Write down the value of $\displaystyle\int_{-2}^{2}(x^3-4x)\,dx$.`,
          type: "num", marks: 1, a: 0, show: "0",
          reject: ["8", "4", "-4"],
          why: R`<p>&bull;1 the graph is symmetrical about the origin, so the signed areas cancel: $\int_{-2}^{0}=4$ and $\int_0^2=-4$, total $0$.</p>`,
        },
        {
          label: "(c)", q: R`Find the total area of the two shaded regions.`,
          type: "num", marks: 2, a: 8, show: "8",
          reject: ["0", "4", "16"],
          partial: [{ a: 0, marks: 1, note: "integrated straight across the axis, so the signs cancel" }],
          why: R`<p>&bull;1 $\displaystyle\int_0^2(x^3-4x)\,dx=(4-8)-0=-4$, so region $B$ has area $4$ (it lies below the axis)</p><p>&bull;2 total area $=4+4=8$ square units.</p>`,
        },
      ],
    },
    /* ---------------- 12 ---------------- */
    {
      id: "cal-12", calc: false,
      style: "Paper 1 style · non-calculator · velocity, displacement and rest",
      stem: R`<p>A remote-controlled boat moves along a straight canal. At time $t$ seconds ($t\ge0$) its acceleration is $a=6t-12$ metres per second squared. At $t=0$ the boat is at the start line, $s=0$, with velocity $v=9$ metres per second.</p>`,
      parts: [
        {
          label: "(a)", q: R`Find an expression for the velocity $v$ of the boat at time $t$.`,
          type: "expr", marks: 2, vars: ["t"],
          a: "3t^2-12t+9", show: R`v=3t^2-12t+9`,
          reject: ["3t^2-12t", "6", "3t^2-12t-9"],
          partial: [{ a: "3t^2-12t", marks: 1, note: "constant of integration left out" }],
          why: R`<p>&bull;1 integrate the acceleration: $v=3t^2-12t+c$</p><p>&bull;2 $v=9$ at $t=0$ gives $c=9$, so $v=3t^2-12t+9$.</p>`,
        },
        {
          label: "(b)", q: R`Find the times at which the boat is momentarily at rest. Give them separated by a comma.`,
          type: "set", marks: 2, a: [1, 3], show: R`t=1,\ 3`,
          reject: ["3", "-1, -3", "1, 9"],
          why: R`<p>&bull;1 set $v=0$: $3t^2-12t+9=0$, i.e. $3(t-1)(t-3)=0$</p><p>&bull;2 $t=1$ and $t=3$ seconds.</p>`,
        },
        {
          label: "(c)", q: R`Find an expression for the displacement $s$ of the boat from the start line at time $t$.`,
          type: "expr", marks: 2, vars: ["t"],
          a: "t^3-6t^2+9t", show: R`s=t^3-6t^2+9t`,
          reject: ["t^3-6t^2+9t+9", "3t^2-12t+9", "t^3-12t^2+9t"],
          why: R`<p>&bull;1 integrate the velocity: $s=t^3-6t^2+9t+c$</p><p>&bull;2 $s=0$ at $t=0$ gives $c=0$, so $s=t^3-6t^2+9t$.</p>`,
        },
        {
          label: "(d)", q: R`How far is the boat from the start line the first time it is at rest?`,
          type: "num", marks: 1, a: 4, show: "4", unit: "m",
          reject: ["0", "3", "9"],
          why: R`<p>&bull;1 the first rest is at $t=1$: $s(1)=1-6+9=4$ metres. (At $t=3$, $s=27-54+27=0$: back at the start line.)</p>`,
        },
      ],
    },
    /* ---------------- 13 (calculator) ---------------- */
    {
      id: "cal-13", calc: true,
      style: "Paper 2 style · calculator · gradient and the angle a tangent makes with the x-axis",
      stem: R`<p>A curve has equation $y=x^3-2x^2+7$. At the point where $x=2$ the tangent makes an angle $\theta$ with the positive direction of the $x$-axis.</p>`,
      parts: [
        {
          label: "(a)", q: R`Find $\dfrac{dy}{dx}$.`,
          type: "expr", marks: 2, vars: ["x"],
          a: "3x^2-4x", show: R`3x^2-4x`,
          reject: ["3x^2-2x", "x^3-4x", "3x^2-4x+7"],
          why: R`<p>&bull;1 differentiate $x^3$: $3x^2$</p><p>&bull;2 differentiate $-2x^2$: $-4x$, and the constant $7$ gives $0$. So $\dfrac{dy}{dx}=3x^2-4x$.</p>`,
        },
        {
          label: "(b)", q: R`Find $\theta$, in degrees, correct to 1 decimal place.`,
          type: "num", marks: 2, a: 76, tol: 0.05, show: R`76.0^\circ`, unit: "°",
          reject: ["4", "1.3", "14.0"],
          partial: [{ a: 4, marks: 1, note: "gradient found but not converted to an angle" }],
          why: R`<p>&bull;1 gradient at $x=2$: $m=3(4)-4(2)=4$, and $\tan\theta=m=4$</p><p>&bull;2 $\theta=\tan^{-1}4=75.96\ldots\approx76.0^\circ$ (calculator in degree mode).</p><p>Commonly seen: $1.3$, from a calculator left in radian mode.</p>`,
        },
      ],
    },
    /* ---------------- 14 (calculator) ---------------- */
    {
      id: "cal-14", calc: true,
      style: "Paper 2 style · calculator · a trigonometric model and its rate of change",
      stem: R`<p>The depth of water, $d$ metres, at a harbour mouth is modelled by $d(t)=7+2.5\sin(0.5t)$, where $t$ is the time in hours after midnight and the angle is measured in radians.</p>`,
      parts: [
        {
          label: "(a)", q: R`Find an expression for $d'(t)$, the rate of change of depth.`,
          type: "expr", marks: 2, vars: ["t"],
          a: "1.25cos(0.5t)", show: R`d'(t)=1.25\cos(0.5t)`,
          reject: ["-1.25cos(0.5t)", "1.25sin(0.5t)", "2.5cos(0.5t)+7"],
          partial: [{ a: "2.5cos(0.5t)", marks: 1, note: "the inner derivative 0.5 is missing" }],
          why: R`<p>&bull;1 derivative of $\sin(0.5t)$ is $0.5\cos(0.5t)$ (chain rule)</p><p>&bull;2 multiply by $2.5$: $d'(t)=1.25\cos(0.5t)$.</p>`,
        },
        {
          label: "(b)", q: R`At what rate is the depth changing at 2 am? Answer in metres per hour, to 2 decimal places.`,
          type: "num", marks: 1, a: 0.68, tol: 0.005, show: R`0.68`, unit: "m/h",
          reject: ["1.25", "0.54", "0.02"],
          why: R`<p>&bull;1 $d'(2)=1.25\cos(1)=0.675\ldots\approx0.68$ metres per hour (calculator in radian mode). A degree-mode calculator gives $1.25$.</p>`,
        },
        {
          label: "(c)", q: R`The depth is greatest when $d'(t)=0$. Find the first time after midnight at which this happens, giving $t$ to 2 decimal places.`,
          type: "num", marks: 2, a: 3.14, tol: 0.005, show: R`t=3.14`,
          reject: ["1.57", "0", "6.28"],
          partial: [{ a: 1.57, marks: 1, note: "solved $\\cos u=0$ but did not double to find $t$" }],
          why: R`<p>&bull;1 $1.25\cos(0.5t)=0$ gives $0.5t=\dfrac{\pi}{2}$ (the first positive solution)</p><p>&bull;2 $t=\pi=3.14$ hours.</p>`,
        },
        {
          label: "(d)", q: R`State the maximum depth predicted by the model, in metres.`,
          type: "num", marks: 1, a: 9.5, tol: 0.005, show: R`9.5`, unit: "m",
          reject: ["7", "2.5", "10"],
          why: R`<p>&bull;1 at $t=\pi$, $\sin(0.5t)=\sin\tfrac{\pi}{2}=1$, so $d=7+2.5=9.5$ metres.</p>`,
        },
      ],
    },
    /* ---------------- 15 (calculator) ---------------- */
    {
      id: "cal-15", calc: true,
      style: "Paper 2 style · calculator · a cannonball's height and velocity",
      stem: R`<p>A cannon on a harbour wall fires a ball straight up. Its height above the sea, $h$ metres, $t$ seconds after firing is $h(t)=3+28t-7t^2$.</p>`,
      parts: [
        {
          label: "(a)", q: R`Find the velocity of the ball at $t=3$ seconds. Give the sign: negative means falling.`,
          type: "num", marks: 2, a: -14, show: "-14", unit: "m/s",
          reject: ["14", "28", "-42"],
          partial: [{ a: 14, marks: 1, note: "speed found but the direction (sign) is wrong" }],
          why: R`<p>&bull;1 $v=h'(t)=28-14t$</p><p>&bull;2 $v(3)=28-42=-14$ metres per second (the ball is falling).</p>`,
        },
        {
          label: "(b)", q: R`Find the greatest height reached by the ball.`,
          type: "num", marks: 3, a: 31, show: "31", unit: "m",
          reject: ["28", "34", "2"],
          partial: [{ a: 2, marks: 2, note: "found the time of maximum height, not the height itself" }],
          why: R`<p>&bull;1 maximum height where $h'(t)=28-14t=0$</p><p>&bull;2 $t=2$ (and $h''=-14\lt0$, so a maximum)</p><p>&bull;3 $h(2)=3+56-28=31$ metres.</p>`,
        },
        {
          label: "(c)", q: R`The ball falls into the sea when $h=0$. Find the time, in seconds, at which this happens, correct to 2 decimal places.`,
          type: "num", marks: 2, a: 4.1, tol: 0.005, show: R`t=4.10`,
          reject: ["-0.10", "2", "4.00"],
          partial: [{ a: -0.1, marks: 1, note: "took the negative root, which is before firing" }],
          why: R`<p>&bull;1 solve $7t^2-28t-3=0$ with the quadratic formula: $t=\dfrac{28\pm\sqrt{784+84}}{14}$</p><p>&bull;2 $t=4.10$ (the root $-0.10$ is rejected as $t\ge0$).</p>`,
        },
      ],
    },
    /* ---------------- 16 (calculator) ---------------- */
    {
      id: "cal-16", calc: true,
      style: "Paper 2 style · calculator · optimisation: two pens against a wall",
      stem: R`<p>Cadets are building two identical rectangular pens side by side against a long straight wall. There are 120 metres of fencing. Three fences, each of length $x$ metres, run at right angles to the wall (these form the outer ends and the divider) and one fence of length $y$ metres runs parallel to the wall, so $3x+y=120$. The wall needs no fence.</p>`,
      parts: [
        {
          label: "(a)", q: R`Find an expression for the total area $A$ of the two pens in terms of $x$ only.`,
          type: "expr", marks: 2, vars: ["x"],
          a: "x(120-3x)", show: R`A=x(120-3x)`,
          reject: ["x(120-2x)", "120-3x", "x(120-x)"],
          why: R`<p>&bull;1 $y=120-3x$</p><p>&bull;2 area $=xy$, so $A=x(120-3x)=120x-3x^2$.</p>`,
        },
        {
          label: "(b)", q: R`Find the value of $x$ that gives the greatest area.`,
          type: "num", marks: 3, a: 20, show: "20", unit: "m",
          reject: ["60", "1200", "10"],
          partial: [{ a: 40, marks: 2, note: "a slip when differentiating" }],
          why: R`<p>&bull;1 differentiate: $\dfrac{dA}{dx}=120-6x$</p><p>&bull;2 set equal to zero: $x=20$</p><p>&bull;3 justify a maximum: $\dfrac{d^2A}{dx^2}=-6\lt0$.</p>`,
        },
        {
          label: "(c)", q: R`Find the greatest area, in square metres.`,
          type: "num", marks: 1, a: 1200, show: "1200", unit: "m²",
          reject: ["2400", "60", "600"],
          why: R`<p>&bull;1 $A(20)=20\times(120-60)=1200$ square metres.</p>`,
        },
      ],
    },
    /* ---------------- 17 (calculator) ---------------- */
    {
      id: "cal-17", calc: true,
      style: "Paper 2 style · calculator · optimisation: an open box from a square sheet",
      stem: R`<p>An open box is made from a square sheet of card of side 18 cm. A square of side $x$ cm is cut from each corner, as shown in the net, and the sides are folded up. The volume of the box is $V$ cm$^3$.</p>`,
      figure: fig17,
      parts: [
        {
          label: "(a)", q: R`Write down an expression for $V$ in terms of $x$.`,
          type: "expr", marks: 2, vars: ["x"],
          a: "x(18-2x)^2", show: R`V=x(18-2x)^2`,
          reject: ["x(18-x)^2", "x(18-2x)", "(18-2x)^2"],
          why: R`<p>&bull;1 the base is a square of side $18-2x$ and the height is $x$</p><p>&bull;2 $V=x(18-2x)^2=4x^3-72x^2+324x$.</p>`,
        },
        {
          label: "(b)", q: R`Find $\dfrac{dV}{dx}$.`,
          type: "expr", marks: 2, vars: ["x"],
          a: "12x^2-144x+324", show: R`12x^2-144x+324`,
          reject: ["12x^2-144x", "4x^3-72x^2+324x", "12x^2-72x+324"],
          partial: [{ a: "12x^2-72x+324", marks: 1, note: "a slip when expanding the bracket" }],
          why: R`<p>&bull;1 expand: $V=4x^3-72x^2+324x$</p><p>&bull;2 differentiate: $\dfrac{dV}{dx}=12x^2-144x+324$.</p>`,
        },
        {
          label: "(c)", q: R`Find the value of $x$ for which the volume is a maximum, given $0\lt x\lt9$.`,
          type: "num", marks: 3, a: 3, show: "3", unit: "cm",
          reject: ["9", "432", "6"],
          partial: [{ a: 9, marks: 1, note: "found the other stationary point, where the volume is zero (a minimum)" }],
          why: R`<p>&bull;1 set $12x^2-144x+324=0$, i.e. $12(x-3)(x-9)=0$</p><p>&bull;2 $x=3$ or $x=9$; only $x=3$ is in range for a maximum</p><p>&bull;3 nature: $\dfrac{d^2V}{dx^2}=24x-144=-72\lt0$ at $x=3$, so a maximum.</p>`,
        },
        {
          label: "(d)", q: R`Find the maximum volume, in cubic centimetres.`,
          type: "num", marks: 1, a: 432, show: "432", unit: "cm³",
          reject: ["3", "324", "216"],
          why: R`<p>&bull;1 $V(3)=3\times12^2=432$ cm$^3$.</p>`,
        },
      ],
    },
    /* ---------------- 18 (calculator) ---------------- */
    {
      id: "cal-18", calc: true,
      style: "Paper 2 style · calculator · area between a line and a parabola",
      stem: R`<p>The curve $y=x^2-6x+10$ and the line $y=12-x$ intersect at two points. The line lies above the curve between them, and the region enclosed has area $A$.</p>`,
      parts: [
        {
          label: "(a)", q: R`Find the $x$-coordinates of the two points of intersection, correct to 2 decimal places. Give them separated by a comma.`,
          type: "set", marks: 2, a: ["(5-sqrt(33))/2", "(5+sqrt(33))/2"], tol: 0.005, show: R`x=-0.37,\ 5.37`,
          reject: ["0.37, 5.37", "-0.37", "2, 3"],
          why: R`<p>&bull;1 equate: $x^2-6x+10=12-x$, so $x^2-5x-2=0$</p><p>&bull;2 quadratic formula: $x=\dfrac{5\pm\sqrt{33}}{2}$, i.e. $x=-0.37$ and $x=5.37$.</p>`,
        },
        {
          label: "(b)", q: R`Calculate the area $A$, correct to 1 decimal place. (Use the exact or unrounded roots on your calculator.)`,
          type: "num", marks: 4, a: 31.6, tol: 0.05, show: R`31.6`, unit: "square units",
          reject: ["-31.6", "11.8", "63.2"],
          partial: [{ a: -31.6, marks: 3, note: "curve minus line, so the area comes out negative" }],
          why: R`<p>&bull;1 area $=\displaystyle\int(\text{line}-\text{curve})\,dx$, with $(12-x)-(x^2-6x+10)=2+5x-x^2$</p><p>&bull;2 integrate: $2x+\dfrac{5x^2}{2}-\dfrac{x^3}{3}$</p><p>&bull;3 limits $x=-0.372\ldots$ and $x=5.372\ldots$</p><p>&bull;4 $A=31.6$ square units.</p>`,
        },
      ],
    },
  ];

  B.cal = { intro, questions };
})();
