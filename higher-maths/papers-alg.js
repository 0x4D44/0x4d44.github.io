/* Past-paper practice: Algebra & functions. Original questions in the style of recent Higher Maths papers (not copied). */
(function () {
  "use strict";
  const B = (window.HMP_BANK = window.HMP_BANK || {});

  /* ---- small SVG helpers (palette: ink, teal accent, paper) ---- */
  const INK = "#1d1a14", ACC = "#155457", PAPER = "#fffaf0";
  const svg = (label, body) =>
    `<svg viewBox="0 0 340 240" role="img" aria-label="${label}"><rect width="340" height="240" fill="${PAPER}"/>${body}</svg>`;
  const ln = (x1, y1, x2, y2, sw, col, dash) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col || INK}" stroke-width="${sw || 1.4}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  const txt = (x, y, s, anchor, col) =>
    `<text x="${x}" y="${y}" font-size="13" text-anchor="${anchor || "middle"}" fill="${col || INK}">${s}</text>`;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${ACC}" stroke="${INK}" stroke-width="1"/>`;
  const path = (fn, a, b, X, Y, n) => {
    let d = "";
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      d += (i ? "L" : "M") + X(x).toFixed(1) + " " + Y(fn(x)).toFixed(1);
    }
    return `<path d="${d}" fill="none" stroke="${ACC}" stroke-width="2.4"/>`;
  };
  const axes = (ox, oy, x1, x2, y1, y2, xl, yl) =>
    ln(x1, oy, x2, oy) + ln(ox, y1, ox, y2) +
    `<path d="M${x2} ${oy}l-7 -3.5v7z M${ox} ${y1}l-3.5 7h7z" fill="${INK}"/>` +
    txt(x2 - 2, oy + 17, xl, "end") + txt(ox + 8, y1 + 6, yl, "start");

  /* Q09: y = f(x), a parabola with zeros at 1 and 5 and maximum (3, 4) */
  const fig9 = (() => {
    const X = (x) => 75 + x * 35, Y = (y) => 155 - y * 22.5;
    return svg("Graph of y equals f of x: an upside-down parabola crossing the x-axis at (1, 0) and (5, 0), with a maximum turning point at (3, 4).",
      axes(75, 155, 35, 328, 14, 205, "x", "y") +
      path((x) => -(x - 1) * (x - 5), 0.6, 5.4, X, Y, 60) +
      dot(X(1), Y(0)) + dot(X(5), Y(0)) + dot(X(3), Y(4)) +
      txt(X(1) - 4, Y(0) + 18, "(1, 0)", "end") + txt(X(5) + 6, Y(0) + 18, "(5, 0)", "start") +
      txt(X(3), Y(4) - 9, "(3, 4)") + txt(X(5.4) + 4, Y(-1.6), "y = f(x)", "start", ACC));
  })();

  /* Q10: y = (x+2)^2 (x-3) */
  const fig10 = (() => {
    const X = (x) => 170 + x * 40, Y = (y) => 105 - y * 5;
    return svg("Graph of a cubic that touches the x-axis at (-2, 0), crosses it at (3, 0) and cuts the y-axis at (0, -12). It rises to the right and falls to the left.",
      axes(170, 105, 18, 328, 14, 212, "x", "y") +
      path((x) => (x + 2) * (x + 2) * (x - 3), -3.5, 3.55, X, Y, 90) +
      dot(X(-2), Y(0)) + dot(X(3), Y(0)) + dot(X(0), Y(-12)) +
      txt(X(-2), Y(0) - 10, "(-2, 0)") + txt(X(3), Y(0) + 20, "(3, 0)") +
      txt(X(0) + 9, Y(-12) + 4, "(0, -12)", "start"));
  })();

  /* Q13: log10 F against log10 v is a straight line through (0.2, 1.5) and (1.0, 2.7) */
  const fig13 = (() => {
    const X = (x) => 50 + x * 200, Y = (y) => 205 - y * 50;
    let ticks = "";
    [0.5, 1.0].forEach((v) => { ticks += ln(X(v), 205, X(v), 210, 1.2) + txt(X(v), 224, String(v)); });
    [1, 2, 3].forEach((v) => { ticks += ln(45, Y(v), 50, Y(v), 1.2) + txt(41, Y(v) + 4, String(v), "end"); });
    return svg("Straight line graph of log10 F against log10 v, passing through the points (0.2, 1.5) and (1.0, 2.7).",
      axes(50, 205, 50, 322, 22, 205, "log₁₀ v", "log₁₀ F") + ticks +
      ln(X(0), Y(1.2), X(1.2), Y(3.0), 2.4, ACC) +
      dot(X(0.2), Y(1.5)) + dot(X(1.0), Y(2.7)) +
      txt(X(0.2) + 8, Y(1.5) + 18, "(0.2, 1.5)", "start") + txt(X(1.0) - 8, Y(2.7) - 10, "(1.0, 2.7)", "end"));
  })();

  /* Q14: log10 N against t is a straight line through (0, 0.7) and (5, 2.2) */
  const fig14 = (() => {
    const X = (x) => 50 + x * 50, Y = (y) => 205 - y * 70;
    let ticks = "";
    [1, 2, 3, 4, 5].forEach((v) => { ticks += ln(X(v), 205, X(v), 210, 1.2) + txt(X(v), 224, String(v)); });
    [1, 2].forEach((v) => { ticks += ln(45, Y(v), 50, Y(v), 1.2) + txt(41, Y(v) + 4, String(v), "end"); });
    return svg("Straight line graph of log10 N against t, starting at (0, 0.7) on the vertical axis and passing through the point (5, 2.2).",
      axes(50, 205, 50, 322, 22, 205, "t", "log₁₀ N") + ticks +
      ln(X(0), Y(0.7), X(5.4), Y(0.7 + 0.3 * 5.4), 2.4, ACC) +
      dot(X(0), Y(0.7)) + dot(X(5), Y(2.2)) +
      txt(X(0) + 9, Y(0.7) + 18, "(0, 0.7)", "start") + txt(X(5) - 8, Y(2.2) - 10, "(5, 2.2)", "end"));
  })();

  const Q = [];

  /* ---------------- non-calculator ---------------- */

  Q.push({
    id: "alg-01", calc: false,
    style: "Paper 1 style · non-calculator · remainder theorem, an unknown coefficient",
    stem: String.raw`<p>The polynomial $f(x)=x^3+kx^2-5x+6$ leaves a remainder of $8$ when it is divided by $(x-2)$.</p>`,
    parts: [{
      q: String.raw`Find the value of $k$.`, type: "num", marks: 2, a: 1, show: "k=1", reject: ["-1", "2"],
      partial: [{ a: -1, marks: 1, note: "You set f(2)=0 (the factor theorem); a remainder of 8 means f(2)=8." }],
      why: String.raw`<p>&bull;1 apply the remainder theorem: $f(2)=8$, so $8+4k-10+6=8$</p><p>&bull;2 solve: $4k+4=8$, so $k=1$.</p><p>Commonly seen: setting $f(2)=0$, which gives $k=-1$.</p>`
    }]
  });

  Q.push({
    id: "alg-02", calc: false,
    style: "Paper 1 style · non-calculator · surds and indices",
    stem: String.raw`<p>Simplify each of the following, leaving exact answers.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`Express $\sqrt{48}-\sqrt{12}$ in the form $a\sqrt{3}$ and state the value of $a$.`, type: "num", marks: 2, a: 2, show: "a=2", reject: ["6", "36", "4"],
        why: String.raw`<p>&bull;1 simplify each surd: $\sqrt{48}=4\sqrt3$, $\sqrt{12}=2\sqrt3$</p><p>&bull;2 subtract: $4\sqrt3-2\sqrt3=2\sqrt3$, so $a=2$.</p>`
      },
      {
        label: "(b)", q: String.raw`Rationalise the denominator of $\dfrac{12}{3+\sqrt3}$ and give the answer as an exact value.`, type: "num", marks: 2, a: "6-2sqrt(3)", show: String.raw`6-2\sqrt3`,
        accept: ["6 - 2sqrt3"], reject: ["6+2sqrt(3)", "12(3-sqrt(3))"],
        why: String.raw`<p>&bull;1 multiply top and bottom by the conjugate: $\dfrac{12(3-\sqrt3)}{(3+\sqrt3)(3-\sqrt3)}=\dfrac{12(3-\sqrt3)}{6}$</p><p>&bull;2 simplify: $2(3-\sqrt3)=6-2\sqrt3$.</p>`
      },
      {
        label: "(c)", q: String.raw`Evaluate $27^{\frac23}\times4^{-\frac12}$.`, type: "num", marks: 2, a: "9/2", show: String.raw`\tfrac92`, accept: ["4.5"], reject: ["18", "9", "3/2"],
        why: String.raw`<p>&bull;1 evaluate each power: $27^{2/3}=(\sqrt[3]{27})^2=9$ and $4^{-1/2}=\tfrac1{\sqrt4}=\tfrac12$</p><p>&bull;2 multiply: $9\times\tfrac12=\tfrac92$.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-03", calc: false,
    style: "Paper 1 style · non-calculator · discriminant and nature of roots",
    stem: String.raw`<p>The equation $x^2+kx+(k+3)=0$, where $k$ is a constant, is being investigated.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`Write down an expression, in terms of $k$, for the discriminant of $x^2+kx+(k+3)$.`, type: "expr", vars: ["k"], marks: 1, a: "k^2-4k-12",
        show: String.raw`k^2-4k-12`, reject: ["k^2-4k+12", "k^2+4k+12", "k^2-k-3"],
        why: String.raw`<p>&bull;1 use $b^2-4ac$ with $a=1$, $b=k$, $c=k+3$: $k^2-4(k+3)=k^2-4k-12$.</p><p>Commonly seen: $+12$ after forgetting that $c$ is a bracket.</p>`
      },
      {
        label: "(b)", q: String.raw`The equation has equal roots. Find the two possible values of $k$.`, type: "set", marks: 2, a: [-2, 6], show: String.raw`k=-2,\ 6`, reject: ["6", "2, -6"],
        why: String.raw`<p>&bull;1 equal roots: discriminant $=0$, so $k^2-4k-12=0$, i.e. $(k-6)(k+2)=0$</p><p>&bull;2 $k=6$ or $k=-2$.</p>`
      },
      {
        label: "(c)", q: String.raw`When $k=0$ the equation is $x^2+3=0$. What is the nature of its roots?`, type: "mcq", marks: 1,
        opts: ["Two distinct real roots", "Equal real roots", "No real roots", "One real root and one non-real root"], a: 2,
        why: String.raw`<p>&bull;1 discriminant $=0-4(3)=-12\lt0$, so there are no real roots.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-04", calc: false,
    style: "Paper 1 style · non-calculator · composite and inverse functions",
    stem: String.raw`<p>Functions $f$ and $g$ are defined on the set of real numbers by $f(x)=2x-3$ and $g(x)=x^2+1$.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`Find an expression for $g(f(x))$.`, type: "expr", marks: 2, a: "4x^2-12x+10", show: String.raw`4x^2-12x+10`,
        reject: ["4x^2+10", "2x^2-1", "4x^2-9"],
        partial: [{ a: "4x^2+10", marks: 1, note: "Good substitution, but (2x-3)^2 is not 4x^2+9: the middle term is missing." }, { a: "2x^2-1", marks: 0, note: "That is f(g(x))." }],
        why: String.raw`<p>&bull;1 substitute: $g(f(x))=(2x-3)^2+1$</p><p>&bull;2 expand: $4x^2-12x+9+1=4x^2-12x+10$.</p>`
      },
      {
        label: "(b)", q: String.raw`Find the inverse function $f^{-1}(x)$.`, type: "expr", marks: 2, a: "(x+3)/2", show: String.raw`f^{-1}(x)=\dfrac{x+3}{2}`, accept: ["x/2+3/2"],
        reject: ["(x-3)/2", "1/(2x-3)", "2x+3"],
        why: String.raw`<p>&bull;1 write $y=2x-3$ and rearrange for $x$: $x=\dfrac{y+3}{2}$</p><p>&bull;2 swap the variable: $f^{-1}(x)=\dfrac{x+3}{2}$.</p>`
      },
      {
        label: "(c)", q: String.raw`Hence, or otherwise, solve $g(f(x))=5$.`, type: "set", marks: 2, a: ["1/2", "5/2"], show: String.raw`x=\tfrac12,\ \tfrac52`, reject: ["5/2", "-1/2, 5/2"],
        why: String.raw`<p>&bull;1 $(2x-3)^2+1=5$, so $(2x-3)^2=4$ and $2x-3=\pm2$ (or $4x^2-12x+5=0$, $(2x-1)(2x-5)=0$)</p><p>&bull;2 $x=\tfrac52$ or $x=\tfrac12$.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-05", calc: false,
    style: "Paper 1 style · non-calculator · logarithms",
    stem: String.raw`<p>Use the laws of logarithms in both parts.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`Evaluate $\log_5 75-\log_5 3$.`, type: "num", marks: 2, a: 2, show: "2", reject: ["72", "log5(72)", "1"],
        why: String.raw`<p>&bull;1 subtraction becomes division: $\log_5\dfrac{75}{3}=\log_5 25$</p><p>&bull;2 $25=5^2$, so the value is $2$.</p>`
      },
      {
        label: "(b)", q: String.raw`Solve $\log_3 x+\log_3(x-6)=3$.`, type: "num", marks: 3, a: 9, show: "x=9", reject: ["-3", "27"],
        partial: [{ a: -3, marks: 2, note: "x=-3 is a root of the quadratic but makes log(x-6) undefined; reject it." }],
        why: String.raw`<p>&bull;1 combine: $\log_3 x(x-6)=3$, so $x(x-6)=3^3=27$</p><p>&bull;2 $x^2-6x-27=0$, i.e. $(x-9)(x+3)=0$</p><p>&bull;3 $x-6\gt0$ is needed, so $x=9$ (reject $x=-3$).</p>`
      }
    ]
  });

  Q.push({
    id: "alg-06", calc: false,
    style: "Paper 1 style · non-calculator · recurrence relations, then a justification",
    stem: String.raw`<p>A sequence is defined by the recurrence relation $u_{n+1}=0.4u_n+12$ with $u_1=5$.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`Find the value of $u_3$.`, type: "num", marks: 1, a: 17.6, tol: 0.005, show: "17.6", reject: ["14", "12"],
        why: String.raw`<p>&bull;1 $u_2=0.4(5)+12=14$, then $u_3=0.4(14)+12=17.6$.</p>`
      },
      {
        label: "(b)", q: String.raw`This sequence has a limit as $n\to\infty$. Calculate the limit.`, type: "num", marks: 2, a: 20, show: "20", reject: ["30", "8.57", "12"],
        why: String.raw`<p>&bull;1 limit $L=\dfrac{b}{1-a}=\dfrac{12}{1-0.4}$ (or solve $L=0.4L+12$)</p><p>&bull;2 $L=\dfrac{12}{0.6}=20$.</p>`
      },
      {
        label: "(c)", q: String.raw`A second sequence is defined by $v_{n+1}=1.2v_n-3$. Explain why this sequence has no limit.`, type: "text", marks: 2, minWords: 3,
        points: [
          { desc: "the multiplier is 1.2, which is greater than 1 (outside -1 to 1)", any: [String.raw`1\.2[^.;]{0,50}(?:greater|bigger|larger|more|exceed|above|>)`, String.raw`(?:greater|bigger|larger|more|exceed|above|>)[^.;]{0,25}\b1\b`, String.raw`outside[^.;]{0,25}-?1`, String.raw`(?:not|isn't)[^.;]{0,25}between[^.;]{0,25}-?1`] },
          { desc: "so the terms diverge / grow without settling, hence no limit", any: [String.raw`diverg`, String.raw`grow`, String.raw`increas`, String.raw`(?:no|not|won't|doesn't)[^.;]{0,20}(?:limit|converge|settle|exist)`, String.raw`infin`] }
        ],
        sample: "The multiplier 1.2 is greater than 1 (not between -1 and 1), so the terms keep growing and diverge: there is no limit.",
        why: String.raw`<p>&bull;1 a limit exists only if $-1\lt a\lt1$ in $v_{n+1}=av_n+b$; here $a=1.2$, which is outside that range</p><p>&bull;2 so the terms diverge (they do not settle), hence there is no limit.</p><p>Commonly seen: &ldquo;it goes up&rdquo; with no mention of the multiplier.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-07", calc: false,
    style: "Paper 1 style · non-calculator · completing the square",
    stem: String.raw`<p>A quadratic function is given by $f(x)=2x^2-12x+10$.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`Express $f(x)$ in the form $a(x+p)^2+q$ and state the values of $a$, $p$ and $q$.`, type: "fields", marks: 3,
        fields: [
          { label: "$a$", type: "num", a: 2, marks: 1, show: "2", reject: ["1", "-2"] },
          { label: "$p$", type: "num", a: -3, marks: 1, show: "-3", reject: ["3", "-6"] },
          { label: "$q$", type: "num", a: -8, marks: 1, show: "-8", reject: ["-18", "8", "1"] }
        ],
        why: String.raw`<p>&bull;1 take out the common factor: $a=2$, $f(x)=2(x^2-6x)+10$</p><p>&bull;2 complete the square: $2\big[(x-3)^2-9\big]+10$, so $p=-3$</p><p>&bull;3 $f(x)=2(x-3)^2-8$, so $q=-8$.</p><p>Commonly seen: $q=-18$ (forgetting to multiply the $-9$ by $2$).</p>`
      },
      {
        label: "(b)", q: String.raw`Write down the coordinates of the turning point of the graph of $y=f(x)$.`, type: "vec", marks: 1, a: [3, -8], show: "(3,\\,-8)", reject: ["(-3,-8)", "(3,8)"],
        why: String.raw`<p>&bull;1 from $2(x-3)^2-8$ the minimum is at $(3,-8)$.</p>`
      },
      {
        label: "(c)", q: String.raw`Hence solve $f(x)=10$.`, type: "set", marks: 2, a: [0, 6], show: String.raw`x=0,\ 6`, reject: ["6", "3, 9"],
        why: String.raw`<p>&bull;1 $2(x-3)^2-8=10$, so $(x-3)^2=9$</p><p>&bull;2 $x-3=\pm3$, so $x=0$ or $x=6$.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-08", calc: false,
    style: "Paper 1 style · non-calculator · tangency condition for a line and a curve",
    stem: String.raw`<p>The line with equation $y=4x+c$ is a tangent to the curve with equation $y=x^2-2x+3$.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`Find the value of the constant $c$.`, type: "num", marks: 3, a: -6, show: "c=-6", reject: ["6", "-3", "3"],
        partial: [{ a: 6, marks: 2, note: "Right method: check the sign when solving 24 + 4c = 0." }],
        why: String.raw`<p>&bull;1 equate: $x^2-2x+3=4x+c$, giving $x^2-6x+(3-c)=0$</p><p>&bull;2 tangent means equal roots, so $b^2-4ac=0$: $36-4(3-c)=0$, i.e. $24+4c=0$</p><p>&bull;3 $c=-6$.</p>`
      },
      {
        label: "(b)", q: String.raw`Find the coordinates of the point of contact.`, type: "vec", marks: 2, a: [3, 6], show: "(3,\\,6)", reject: ["(3,-6)", "(6,3)"],
        why: String.raw`<p>&bull;1 with $c=-6$: $x^2-6x+9=0$, so $(x-3)^2=0$ and $x=3$</p><p>&bull;2 $y=4(3)-6=6$, so the point is $(3,6)$.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-09", calc: false,
    style: "Paper 1 style · non-calculator · transformations of a graph",
    stem: String.raw`<p>The diagram shows the graph of $y=f(x)$. It crosses the $x$-axis at $(1,0)$ and $(5,0)$ and has a maximum turning point at $(3,4)$.</p>`,
    figure: fig9,
    parts: [
      {
        label: "(a)", q: String.raw`Write down the coordinates of the maximum turning point of $y=f(x+2)$.`, type: "vec", marks: 1, a: [1, 4], show: "(1,\\,4)", reject: ["(5,4)", "(3,6)"],
        why: String.raw`<p>&bull;1 $f(x+2)$ moves the graph $2$ units to the left: $(3,4)\to(1,4)$.</p><p>Commonly seen: moving it right, $(5,4)$.</p>`
      },
      {
        label: "(b)", q: String.raw`The graph of $y=3-f(x)$ also has a turning point. State its coordinates.`, type: "fields", marks: 2,
        fields: [
          { label: "$x$-coordinate", type: "num", a: 3, marks: 1, show: "3", reject: ["1", "0"] },
          { label: "$y$-coordinate", type: "num", a: -1, marks: 1, show: "-1", reject: ["7", "1"] }
        ],
        why: String.raw`<p>&bull;1 $x$ is unchanged: $x=3$</p><p>&bull;2 $3-f(x)$ reflects in the $x$-axis then lifts by $3$: $y=3-4=-1$ (a minimum at $(3,-1)$).</p>`
      },
      {
        label: "(c)", q: String.raw`The graph of $y=f(2x)$ crosses the $x$-axis twice. Write down the larger of the two $x$-coordinates.`, type: "num", marks: 1, a: "5/2", accept: ["2.5"], show: String.raw`\tfrac52`, reject: ["10", "5", "3"],
        why: String.raw`<p>&bull;1 $f(2x)$ halves every $x$-coordinate: $5\to\tfrac52$.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-10", calc: false,
    style: "Paper 1 style · non-calculator · identifying a graph, then reasoning about it",
    stem: String.raw`<p>The diagram shows the graph of a cubic function $y=f(x)$. The graph touches the $x$-axis at $(-2,0)$, crosses it at $(3,0)$ and passes through $(0,-12)$.</p>`,
    figure: fig10,
    parts: [
      {
        label: "(a)", q: String.raw`Which of these is the equation of the graph?`, type: "mcq", marks: 1,
        opts: [String.raw`$y=(x+2)(x-3)^2$`, String.raw`$y=(x+2)^2(x-3)$`, String.raw`$y=-(x+2)^2(x-3)$`, String.raw`$y=(x-2)^2(x+3)$`], a: 1,
        why: String.raw`<p>&bull;1 a repeated factor $(x+2)^2$ gives the touching point at $x=-2$, and $(x-3)$ gives the crossing at $3$; at $x=0$: $(2)^2(-3)=-12$ &#10003;. The positive leading coefficient fits the graph rising to the right.</p>`
      },
      {
        label: "(b)", q: String.raw`Take $f(x)=(x+2)^2(x-3)$. Select <strong>all</strong> the statements that are true. (A wrong tick loses a mark.)`, type: "multi", marks: 3,
        opts: [String.raw`$(x-3)$ is a factor of $f(x)$`, String.raw`$f(0)=12$`, String.raw`$f(x)=0$ has three distinct real roots`, String.raw`The remainder when $f(x)$ is divided by $(x+2)$ is $0$`, String.raw`$f(-1)=-4$`, String.raw`$f(x)\to+\infty$ as $x\to-\infty$`],
        a: [0, 3, 4],
        why: String.raw`<p>&bull;1 true: $f(3)=0$, so $(x-3)$ is a factor</p><p>&bull;2 true: $f(-2)=0$, so the remainder on division by $(x+2)$ is $0$</p><p>&bull;3 true: $f(-1)=(1)^2(-4)=-4$.</p><p>False: $f(0)=-12$; only two distinct roots ($-2$ and $3$); the leading term is $+x^3$, so $f(x)\to-\infty$ as $x\to-\infty$.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-11", calc: false,
    style: "Paper 1 style · non-calculator · factor theorem, then a quartic",
    stem: String.raw`<p>The polynomial $f(x)=x^4+2x^3-7x^2-8x+12$ has $(x-1)$ as a factor.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`Divide $f(x)$ by $(x-1)$ and write down the cubic quotient $q(x)$, so that $f(x)=(x-1)\,q(x)$.`, type: "expr", marks: 3, a: "x^3+3x^2-4x-12", show: String.raw`x^3+3x^2-4x-12`,
        reject: ["x^3+x^2-8x-12", "x^3+3x^2-4x+12", "x^3+2x^2-5x-13"],
        partial: [{ a: "x^3+3x^2-4x+12", marks: 2, note: "Check the final line of the synthetic division: the last coefficient is -12, with a remainder of 0." }],
        why: String.raw`<p>Synthetic division with $1$ on $1,\ 2,\ -7,\ -8,\ 12$:</p><p>&bull;1 bring down $1$; then $2+1=3$</p><p>&bull;2 $-7+3=-4$; then $-8-4=-12$</p><p>&bull;3 $12-12=0$ (remainder $0$), so $q(x)=x^3+3x^2-4x-12$.</p>`
      },
      {
        label: "(b)", q: String.raw`Hence solve $f(x)=0$, giving all four roots.`, type: "set", marks: 4, a: [-3, -2, 1, 2], show: String.raw`x=-3,\ -2,\ 1,\ 2`, reject: ["1, 2, 3", "-3, 2, 1, 3"],
        why: String.raw`<p>&bull;1 $f(x)=0$ gives $x=1$ from the known factor</p><p>&bull;2 factorise the cubic by grouping (or test $x=2$): $x^2(x+3)-4(x+3)=(x+3)(x^2-4)$</p><p>&bull;3 $(x+3)(x-2)(x+2)$</p><p>&bull;4 roots: $x=-3,\ -2,\ 1,\ 2$.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-12", calc: false,
    style: "Paper 1 style · non-calculator · unknown coefficients, then solving a cubic",
    stem: String.raw`<p>A cubic polynomial is given by $f(x)=x^3+px^2+qx+6$, where $p$ and $q$ are constants. $(x+1)$ is a factor of $f(x)$, and when $f(x)$ is divided by $(x-1)$ the remainder is $4$.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`Find the values of $p$ and $q$.`, type: "fields", marks: 4,
        fields: [
          { label: "$p$", type: "num", a: -4, marks: 2, show: "-4", reject: ["4", "-5"] },
          { label: "$q$", type: "num", a: 1, marks: 2, show: "1", reject: ["-1", "-3"] }
        ],
        why: String.raw`<p>&bull;1 factor theorem: $f(-1)=0$, so $-1+p-q+6=0$, i.e. $p-q=-5$</p><p>&bull;2 remainder theorem: $f(1)=4$, so $1+p+q+6=4$, i.e. $p+q=-3$</p><p>&bull;3 add the equations: $2p=-8$, so $p=-4$</p><p>&bull;4 then $q=-3-(-4)=1$.</p>`
      },
      {
        label: "(b)", q: String.raw`Using these values, so that $f(x)=x^3-4x^2+x+6$, solve $f(x)=0$.`, type: "set", marks: 3, a: [-1, 2, 3], show: String.raw`x=-1,\ 2,\ 3`, reject: ["1, 2, 3", "-1, -2, -3"],
        why: String.raw`<p>&bull;1 divide by the known factor $(x+1)$: quotient $x^2-5x+6$</p><p>&bull;2 factorise: $(x-2)(x-3)$</p><p>&bull;3 $f(x)=(x+1)(x-2)(x-3)$, so $x=-1,\ 2,\ 3$.</p>`
      }
    ]
  });

  /* ---------------- calculator ---------------- */

  Q.push({
    id: "alg-13", calc: true,
    style: "Paper 2 style · calculator · modelling y = a x^n from a log-log graph",
    stem: String.raw`<p>The daily fuel use $F$ tonnes of a frigate is thought to depend on its speed $v$ knots by a law $F=av^n$. When $\log_{10}F$ is plotted against $\log_{10}v$, a straight line is obtained through the points $(0.2,\,1.5)$ and $(1.0,\,2.7)$, as shown.</p>`,
    figure: fig13,
    parts: [
      {
        label: "(a)", q: String.raw`Find the values of $n$ and $a$. Give $a$ correct to $3$ significant figures.`, type: "fields", marks: 4,
        fields: [
          { label: "$n$", type: "num", a: 1.5, tol: 1e-6, marks: 2, show: "1.5", reject: ["1.2", "0.8"] },
          { label: "$a$", type: "num", a: 15.8, tol: 0.05, marks: 2, show: "15.8", reject: ["1.2", "16.5", "1.5"] }
        ],
        why: String.raw`<p>&bull;1 $\log_{10}F=n\log_{10}v+\log_{10}a$, so $n$ is the gradient: $\dfrac{2.7-1.5}{1.0-0.2}=1.5$</p><p>&bull;2 intercept: $1.5=1.5(0.2)+c$, so $\log_{10}a=1.2$</p><p>&bull;3 $a=10^{1.2}$</p><p>&bull;4 $a=15.8$ (3 s.f.).</p><p>Commonly seen: giving the intercept $1.2$ as $a$ itself.</p>`
      },
      {
        label: "(b)", q: String.raw`Use the law to estimate the daily fuel use, in tonnes, at a speed of $12$ knots. Give your answer to the nearest tonne.`, type: "num", marks: 2, a: 659, alts: [657], tol: 0.5, show: "659", unit: "tonnes", reject: ["18", "1.2", "190"],
        why: String.raw`<p>&bull;1 $F=15.85\times12^{1.5}$ (using $a=10^{1.2}$ unrounded)</p><p>&bull;2 $F\approx659$ tonnes.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-14", calc: true,
    style: "Paper 2 style · calculator · modelling y = a b^x from a log-linear graph",
    stem: String.raw`<p>The number $N$ of bacteria in a culture is modelled by $N=ab^t$, where $t$ is the time in hours. When $\log_{10}N$ is plotted against $t$ a straight line is obtained, with the vertical intercept $0.7$ and passing through $(5,\,2.2)$.</p>`,
    figure: fig14,
    parts: [
      {
        label: "(a)", q: String.raw`Find the values of $a$ and $b$, each correct to $3$ significant figures.`, type: "fields", marks: 4,
        fields: [
          { label: "$a$", type: "num", a: 5.01, tol: 0.006, marks: 2, show: "5.01", reject: ["0.7", "2.2", "5.5"] },
          { label: "$b$", type: "num", a: 2.0, tol: 0.006, marks: 2, show: "2.00", reject: ["0.3", "1.5", "2.5"] }
        ],
        why: String.raw`<p>&bull;1 $\log_{10}N=t\log_{10}b+\log_{10}a$; the intercept is $\log_{10}a=0.7$</p><p>&bull;2 $a=10^{0.7}=5.01$</p><p>&bull;3 gradient $=\dfrac{2.2-0.7}{5}=0.3=\log_{10}b$</p><p>&bull;4 $b=10^{0.3}=2.00$ (3 s.f.).</p>`
      },
      {
        label: "(b)", q: String.raw`Predict the number of bacteria after $8$ hours, to the nearest $10$.`, type: "num", marks: 2, a: 1260, alts: [1280], tol: 1.5, show: "1260", reject: ["16", "256", "5.01"],
        partial: [{ a: 1283, marks: 1, note: "Close, but check your rounding of a and b earlier on; the unrounded model 10^(0.3t+0.7) gives 1260." }],
        why: String.raw`<p>&bull;1 $\log_{10}N=0.3(8)+0.7=3.1$, or $N=5.012\times1.995^8$</p><p>&bull;2 $N=10^{3.1}\approx1259$, which is $1260$ to the nearest $10$.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-15", calc: true,
    style: "Paper 2 style · calculator · exponential decay in context",
    stem: String.raw`<p>The mass $M$ grams of a radioactive sample after $t$ days is modelled by $M=M_0e^{-kt}$, where $M_0$ and $k$ are positive constants. A sample of mass $100$ grams decays to $80$ grams after $5$ days.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`Find the value of $k$, correct to $3$ significant figures.`, type: "num", marks: 3, a: 0.0446, tol: 0.00005, show: "k=0.0446", reject: ["0.223", "0.0446e", "-0.0446", "0.04"],
        partial: [{ a: 0.223, marks: 1, note: "You found ln(0.8) without dividing by 5." }],
        why: String.raw`<p>&bull;1 $80=100e^{-5k}$, so $e^{-5k}=0.8$</p><p>&bull;2 take natural logs: $-5k=\ln0.8$</p><p>&bull;3 $k=-\dfrac{\ln0.8}{5}=0.0446$ (3 s.f.).</p>`
      },
      {
        label: "(b)", q: String.raw`Calculate the half-life of the sample, in days, correct to $1$ decimal place.`, type: "num", marks: 2, a: 15.5, tol: 0.05, show: "15.5", unit: "days", reject: ["31.1", "0.1", "5"],
        why: String.raw`<p>&bull;1 half-life: $e^{-kt}=\tfrac12$, so $t=\dfrac{\ln2}{k}$</p><p>&bull;2 $t=\dfrac{0.6931}{0.04463}=15.5$ days.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-16", calc: true,
    style: "Paper 2 style · calculator · an exponential model with a constant term",
    stem: String.raw`<p>A mug of tea, initially at $80^\circ$C, cools in a room at $20^\circ$C. Its temperature after $t$ minutes is modelled by $T=20+60e^{-0.05t}$.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`Find the temperature of the tea after $10$ minutes, correct to $1$ decimal place.`, type: "num", marks: 2, a: 56.4, tol: 0.05, show: "56.4", unit: "°C", reject: ["36.4", "32.0", "20.6"],
        why: String.raw`<p>&bull;1 $T=20+60e^{-0.5}$</p><p>&bull;2 $T=56.4^\circ$C.</p>`
      },
      {
        label: "(b)", q: String.raw`The tea is drinkable once it falls to $30^\circ$C. How long does this take, in minutes correct to $1$ decimal place?`, type: "num", marks: 3, a: 35.8, tol: 0.05, show: "35.8", unit: "minutes", reject: ["13.9", "-35.8", "50"],
        partial: [{ a: 13.86, marks: 1, note: "You forgot to subtract the room temperature of 20 first: 60e^(-0.05t) = 10, not 30." }],
        why: String.raw`<p>&bull;1 $20+60e^{-0.05t}=30$, so $e^{-0.05t}=\dfrac{10}{60}=\tfrac16$</p><p>&bull;2 $-0.05t=\ln\tfrac16$</p><p>&bull;3 $t=\dfrac{\ln6}{0.05}=35.8$ minutes.</p>`
      }
    ]
  });

  Q.push({
    id: "alg-17", calc: true,
    style: "Paper 2 style · calculator · exponential and logarithmic equations",
    stem: String.raw`<p>Solve each equation, giving your answer correct to $2$ decimal places.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`$5^{2x-1}=40$`, type: "num", marks: 3, a: 1.65, tol: 0.005, show: "x=1.65", reject: ["1.15", "2.29", "3.29"],
        partial: [{ a: 1.146, marks: 2, note: "Right method: add 1 before you halve." }],
        why: String.raw`<p>&bull;1 take logs: $(2x-1)\ln5=\ln40$</p><p>&bull;2 $2x-1=\dfrac{\ln40}{\ln5}=2.292$</p><p>&bull;3 $x=\dfrac{3.292}{2}=1.65$.</p>`
      },
      {
        label: "(b)", q: String.raw`$2\ln x-\ln4=3$`, type: "num", marks: 3, a: 8.96, tol: 0.005, show: "x=8.96", reject: ["4.48", "17.94", "40.17"],
        why: String.raw`<p>&bull;1 combine: $\ln\dfrac{x^2}{4}=3$</p><p>&bull;2 exponentiate: $\dfrac{x^2}{4}=e^3$, so $x^2=4e^3$</p><p>&bull;3 $x=2e^{1.5}=8.96$ ($x\gt0$).</p>`
      }
    ]
  });

  Q.push({
    id: "alg-18", calc: true,
    style: "Paper 2 style · calculator · recurrence relation modelling a drug dose",
    stem: String.raw`<p>A patient takes a $200$ mg dose of a drug at the start of each morning. During each day the body removes $30\%$ of the drug present, before the next dose is taken. Let $u_n$ mg be the amount in the body just after the $n$th dose, so that $u_1=200$ and $u_{n+1}=0.7u_n+200$.</p>`,
    parts: [
      {
        label: "(a)", q: String.raw`Find the amount of the drug in the body just after the third dose.`, type: "num", marks: 2, a: 438, tol: 0.5, show: "438", unit: "mg", reject: ["340", "200", "560"],
        partial: [{ a: 340, marks: 1, note: "That is u_2: one more step is needed." }],
        why: String.raw`<p>&bull;1 $u_2=0.7(200)+200=340$</p><p>&bull;2 $u_3=0.7(340)+200=438$ mg.</p>`
      },
      {
        label: "(b)", q: String.raw`In the long run, the amount just after a dose settles at a limit. Find it, correct to $3$ significant figures.`, type: "num", marks: 2, a: 667, tol: 0.5, show: "667", unit: "mg", reject: ["286", "200", "1400"],
        why: String.raw`<p>&bull;1 $-1\lt0.7\lt1$, so a limit exists: $L=\dfrac{200}{1-0.7}$</p><p>&bull;2 $L=666.7\approx667$ mg.</p>`
      },
      {
        label: "(c)", q: String.raw`The patient is monitored once the amount just after a dose first exceeds $600$ mg. Find the number of the dose at which this first happens.`, type: "num", marks: 3, a: 7, show: "n=7", reject: ["6", "8", "9"],
        partial: [{ a: 6, marks: 2, note: "u_6 is about 588 mg, which is still below 600." }],
        why: String.raw`<p>&bull;1 continue the recurrence: $u_4=506.6$, $u_5=554.62$</p><p>&bull;2 $u_6=588.2\ (\lt600)$</p><p>&bull;3 $u_7=611.8\gt600$, so it first happens just after the $7$th dose.</p>`
      }
    ]
  });

  B.alg = {
    intro: String.raw`Polynomials, quadratics, indices and logs, functions and graphs, and sequences. Twelve questions are non-calculator (factor theorem, surds, completing the square, transformations) and six are calculator (log graphs, exponential models and a recurrence in context).`,
    questions: Q
  };
})();
