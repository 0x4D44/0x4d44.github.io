/* Past-paper practice: Trigonometry. Original questions in the style of recent SQA Higher papers (not copied). */
(function () {
  "use strict";
  const B = (window.HMP_BANK = window.HMP_BANK || {});
  const R = String.raw;

  /* ---- small SVG helpers (palette: ink, teal accent, paper) ---- */
  const INK = "#1d1a14", ACC = "#155457", PAPER = "#fffaf0", GREY = "#cbbd9b";
  const svg = (label, body) =>
    `<svg viewBox="0 0 340 240" role="img" aria-label="${label}"><rect width="340" height="240" fill="${PAPER}"/>${body}</svg>`;
  const ln = (x1, y1, x2, y2, sw, dash, col) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col || INK}" stroke-width="${sw || 1.4}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  const txt = (x, y, s, anchor, col) =>
    `<text x="${x}" y="${y}" font-size="13" text-anchor="${anchor || "middle"}" fill="${col || INK}">${s}</text>`;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${ACC}" stroke="${INK}" stroke-width="1"/>`;
  const curve = (f, a, b, mx, my) => {
    let d = "";
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      d += (i ? "L" : "M") + mx(t).toFixed(1) + " " + my(f(t)).toFixed(1);
    }
    return `<path d="${d}" fill="none" stroke="${ACC}" stroke-width="2.4"/>`;
  };
  const tri = (pts) => `<polygon points="${pts}" fill="${PAPER}" stroke="${INK}" stroke-width="1.6"/>`;

  /* Q3: two right-angled triangles */
  const fig3 = svg(
    "Two right-angled triangles. Triangle ABC has right angle at B, AB equal to 4, BC equal to 3 and AC equal to 5, with angle p at A. Triangle DEF has right angle at E, DE equal to 12, EF equal to 5 and DF equal to 13, with angle q at D.",
    tri("20,190 140,190 140,100") + `<path d="M128 190L128 178L140 178" fill="none" stroke="${INK}" stroke-width="1.2"/>` +
    txt(80, 208, "4") + txt(152, 148, "3", "start") + txt(70, 132, "5", "end") +
    txt(14, 205, "A", "end") + txt(144, 207, "B", "start") + txt(144, 94, "C", "start") + txt(48, 184, "p") +
    tri("190,190 310,190 310,140") + `<path d="M298 190L298 178L310 178" fill="none" stroke="${INK}" stroke-width="1.2"/>` +
    txt(250, 208, "12") + txt(322, 168, "5", "start") + txt(240, 158, "13", "end") +
    txt(184, 205, "D", "end") + txt(314, 207, "E", "start") + txt(314, 136, "F", "start") + txt(218, 184, "q"));

  /* Q8: y = 2cos(2x) + 1 on [0, pi] */
  const gx8 = (t) => 60 + (t * 240) / Math.PI, gy8 = (v) => 140 - v * 30;
  const fig8 = svg(
    "Graph of y equals a cos bx plus c for x from 0 to pi. It starts at a maximum at the point (0, 3), falls to a minimum at the point (pi over 2, minus 1) and rises to the next maximum at the point (pi, 3).",
    ln(40, 140, 322, 140, 1.2) + ln(60, 28, 60, 196, 1.2) + ln(180, 140, 180, 170, 1, "4 3", GREY) + ln(300, 140, 300, 50, 1, "4 3", GREY) +
    curve((t) => 2 * Math.cos(2 * t) + 1, 0, Math.PI, gx8, gy8) +
    dot(60, 50) + dot(180, 170) + dot(300, 50) +
    txt(68, 42, "(0, 3)", "start") + txt(180, 190, "(π/2, −1)") + txt(300, 40, "(π, 3)", "end") +
    txt(54, 154, "O", "end") + txt(326, 156, "x", "end") + txt(70, 30, "y", "start"));

  /* Q15: y = 12cos x - 5 sin x on [0, 360] */
  const gx15 = (t) => 40 + t * 0.75, gy15 = (v) => 120 - v * 7;
  const f15 = (t) => 12 * Math.cos((t * Math.PI) / 180) - 5 * Math.sin((t * Math.PI) / 180);
  const fig15 = svg(
    "Graph of y equals 12 cos x degrees minus 5 sin x degrees for x from 0 to 360. It cuts the y axis at (0, 12), falls to a minimum point Q, rises through the x axis and reaches a maximum turning point P near the right-hand end of the interval.",
    ln(30, 120, 330, 120, 1.2) + ln(40, 20, 40, 220, 1.2) +
    curve(f15, 0, 360, gx15, gy15) +
    dot(40, 36) + dot(gx15(337.4), gy15(13)) + dot(gx15(157.4), gy15(-13)) +
    txt(48, 30, "(0, 12)", "start") + txt(gx15(337.4) - 4, gy15(13) - 8, "P") + txt(gx15(157.4), gy15(-13) + 18, "Q") +
    txt(34, 136, "O", "end") + txt(gx15(180), 136, "180") + txt(gx15(360) + 2, 136, "360") + txt(324, 112, "x", "end") + txt(48, 16, "y", "start"));

  B.trig = {
    intro: R`Trigonometry in radians and degrees: exact values, compound and double angle formulae, trigonometric equations, the wave function $a\cos x+b\sin x$ and graphs of trig functions. Questions 1 to 11 are non-calculator (Paper 1 style, 50 marks); questions 12 to 18 are calculator (Paper 2 style, 42 marks), where a model or an equation needs a calculator in the stated mode.`,
    questions: [
      /* ---------- 01 ---------- */
      {
        id: "trig-01", calc: false,
        style: "Paper 1 style · non-calculator · radians and exact values",
        stem: R`Angles are in radians unless a degree sign is shown.`,
        parts: [
          { label: "(a)", q: R`Express $\dfrac{7\pi}{12}$ radians in degrees.`, type: "num", marks: 1, a: 105, unit: "°", show: R`105^\circ`, reject: ["75", "210"],
            why: R`<p>&bull;1 multiply by $\dfrac{180}{\pi}$: $\dfrac{7\pi}{12}\times\dfrac{180}{\pi}=105^\circ$.</p><p>Commonly seen: $7\times 15=105$ done as $5\times15=75$.</p>` },
          { label: "(b)", q: R`Write down the exact value of $\sin\dfrac{7\pi}{6}$.`, type: "num", marks: 1, a: "-1/2", accept: ["-0.5"], show: R`-\tfrac12`, reject: ["1/2", "-sqrt(3)/2"],
            why: R`<p>&bull;1 $\dfrac{7\pi}{6}$ is $\dfrac{\pi}{6}$ past $\pi$, in the third quadrant where sine is negative: $\sin\dfrac{7\pi}{6}=-\sin\dfrac{\pi}{6}=-\dfrac12$.</p>` },
          { label: "(c)", q: R`Write down the exact value of $\cos\dfrac{5\pi}{4}$.`, type: "num", marks: 1, a: "-sqrt(2)/2", accept: ["-1/sqrt(2)"], show: R`-\dfrac{\sqrt2}{2}`, reject: ["sqrt(2)/2", "-1/2"],
            why: R`<p>&bull;1 $\dfrac{5\pi}{4}$ is $\dfrac{\pi}{4}$ past $\pi$ (third quadrant, cosine negative): $\cos\dfrac{5\pi}{4}=-\cos\dfrac{\pi}{4}=-\dfrac{1}{\sqrt2}=-\dfrac{\sqrt2}{2}$.</p>` }
        ]
      },
      /* ---------- 02 ---------- */
      {
        id: "trig-02", calc: false,
        style: "Paper 1 style · non-calculator · compound angle, then double angle",
        stem: R`Use $75^\circ=45^\circ+30^\circ$ in this question.`,
        parts: [
          { label: "(a)", q: R`Find the exact value of $\sin 75^\circ$.`, type: "num", marks: 3, a: "(sqrt(6)+sqrt(2))/4", show: R`\dfrac{\sqrt6+\sqrt2}{4}`,
            reject: ["(sqrt(6)-sqrt(2))/4", "sqrt(3)/2"],
            partial: [{ a: "(sqrt(6)-sqrt(2))/4", marks: 2, note: "the expansion was done with a minus sign (that is sin 15°)" }],
            why: R`<p>&bull;1 expand: $\sin(45^\circ+30^\circ)=\sin45^\circ\cos30^\circ+\cos45^\circ\sin30^\circ$</p><p>&bull;2 substitute exact values: $\dfrac{\sqrt2}{2}\cdot\dfrac{\sqrt3}{2}+\dfrac{\sqrt2}{2}\cdot\dfrac12$</p><p>&bull;3 combine: $\dfrac{\sqrt6+\sqrt2}{4}$.</p><p>Commonly seen: a minus sign between the two products.</p>` },
          { label: "(b)", q: R`Use a double angle formula to find the exact value of $\sin75^\circ\cos75^\circ$.`, type: "num", marks: 2, a: "1/4", accept: ["0.25"], show: R`\tfrac14`, reject: ["1/2", "sqrt(3)/4"],
            partial: [{ a: "1/2", marks: 1, note: "$\\sin 150^\\circ$ found but the factor $\\tfrac12$ was lost" }],
            why: R`<p>&bull;1 use $\sin2A=2\sin A\cos A$: $\sin75^\circ\cos75^\circ=\tfrac12\sin150^\circ$</p><p>&bull;2 $\sin150^\circ=\tfrac12$, so the value is $\tfrac14$.</p>` }
        ]
      },
      /* ---------- 03 ---------- */
      {
        id: "trig-03", calc: false,
        style: "Paper 1 style · non-calculator · double and compound angles from right-angled triangles",
        stem: R`In triangle $ABC$ the angle at $B$ is a right angle, $AB=4$, $BC=3$ and $AC=5$. Angle $BAC$ is $p$. In triangle $DEF$ the angle at $E$ is a right angle, $DE=12$, $EF=5$ and $DF=13$. Angle $EDF$ is $q$.`,
        figure: fig3,
        parts: [
          { label: "(a)", q: R`Find the exact values of $\sin 2p$ and $\cos 2p$.`, type: "fields", marks: 2,
            fields: [
              { label: R`$\sin2p$`, type: "num", a: "24/25", marks: 1, show: R`\dfrac{24}{25}`, accept: ["0.96"], reject: ["12/25", "6/5"] },
              { label: R`$\cos2p$`, type: "num", a: "7/25", marks: 1, show: R`\dfrac{7}{25}`, accept: ["0.28"], reject: ["-7/25", "16/25"] }
            ],
            why: R`<p>&bull;1 $\sin p=\dfrac35$, $\cos p=\dfrac45$, so $\sin2p=2\sin p\cos p=2\times\dfrac35\times\dfrac45=\dfrac{24}{25}$.</p><p>&bull;2 $\cos2p=\cos^2p-\sin^2p=\dfrac{16}{25}-\dfrac{9}{25}=\dfrac{7}{25}$.</p>` },
          { label: "(b)", q: R`Hence find the exact value of $\sin(2p+q)$.`, type: "num", marks: 3, a: "323/325", show: R`\dfrac{323}{325}`,
            reject: ["253/325", "7/13"],
            partial: [{ a: "253/325", marks: 2, note: "sign slip: $\\sin(2p-q)$ was found" }],
            why: R`<p>&bull;1 expand: $\sin(2p+q)=\sin2p\cos q+\cos2p\sin q$</p><p>&bull;2 from triangle $DEF$, $\cos q=\dfrac{12}{13}$ and $\sin q=\dfrac{5}{13}$</p><p>&bull;3 $\dfrac{24}{25}\times\dfrac{12}{13}+\dfrac{7}{25}\times\dfrac{5}{13}=\dfrac{288+35}{325}=\dfrac{323}{325}$.</p>` }
        ]
      },
      /* ---------- 04 ---------- */
      {
        id: "trig-04", calc: false,
        style: "Paper 1 style · non-calculator · double angle, then a quadratic in cos x (radians)",
        stem: R`Consider the equation $\cos2x+3\cos x+2=0$.`,
        parts: [
          { label: "(a)", q: R`The expression $\cos2x+3\cos x+2$ can be written as $a\cos^2x+3\cos x+c$. State the values of $a$ and $c$.`, type: "fields", marks: 2,
            fields: [
              { label: "$a$", type: "num", a: 2, marks: 1, show: "2", reject: ["1", "-2"] },
              { label: "$c$", type: "num", a: 1, marks: 1, show: "1", reject: ["2", "3"] }
            ],
            why: R`<p>&bull;1 use $\cos2x=2\cos^2x-1$.</p><p>&bull;2 $\cos2x+3\cos x+2=2\cos^2x+3\cos x+1$, so $a=2$ and $c=1$.</p><p>Commonly seen: $\cos2x=1-2\cos^2x$ (wrong way round).</p>` },
          { label: "(b)", q: R`Hence solve $\cos2x+3\cos x+2=0$ for $0\leq x\leq2\pi$. Give exact values.`, type: "set", marks: 3, a: ["2*pi/3", "pi", "4*pi/3"], show: R`x=\dfrac{2\pi}{3},\ \pi,\ \dfrac{4\pi}{3}`, tol: 1e-6,
            reject: ["pi/3, pi, 5pi/3", "2pi/3, 4pi/3"],
            why: R`<p>&bull;1 factorise: $2\cos^2x+3\cos x+1=(2\cos x+1)(\cos x+1)=0$</p><p>&bull;2 $\cos x=-\tfrac12$ gives $x=\dfrac{2\pi}{3},\dfrac{4\pi}{3}$</p><p>&bull;3 $\cos x=-1$ gives $x=\pi$.</p><p>Commonly seen: $\cos x=-1$ forgotten.</p>` }
        ]
      },
      /* ---------- 05 ---------- */
      {
        id: "trig-05", calc: false,
        style: "Paper 1 style · non-calculator · differentiating trig functions (calculus link)",
        stem: R`A function is defined by $f(x)=\sin2x+\cos x$, where $x$ is in radians.`,
        parts: [
          { label: "(a)", q: R`Find $f'(x)$.`, type: "expr", marks: 2, a: "2cos(2x)-sin(x)", show: R`2\cos2x-\sin x`,
            reject: ["cos(2x)-sin(x)", "-2cos(2x)-sin(x)"],
            partial: [{ a: "cos(2x)-sin(x)", marks: 1, note: "chain rule factor 2 missing" }],
            why: R`<p>&bull;1 $\dfrac{d}{dx}(\sin2x)=2\cos2x$ (chain rule)</p><p>&bull;2 $\dfrac{d}{dx}(\cos x)=-\sin x$, so $f'(x)=2\cos2x-\sin x$.</p>` },
          { label: "(b)", q: R`Find the exact value of $f'\!\left(\dfrac{\pi}{6}\right)$.`, type: "num", marks: 1, a: "1/2", accept: ["0.5"], show: R`\tfrac12`, reject: ["0", "-1/2"],
            why: R`<p>&bull;1 $f'\!\left(\dfrac{\pi}{6}\right)=2\cos\dfrac{\pi}{3}-\sin\dfrac{\pi}{6}=2\times\dfrac12-\dfrac12=\dfrac12$.</p>` }
        ]
      },
      /* ---------- 06 ---------- */
      {
        id: "trig-06", calc: false,
        style: "Paper 1 style · non-calculator · wave function with exact values (radians)",
        stem: R`The expression $\cos x+\sqrt3\sin x$ can be written in the form $k\cos(x-\alpha)$, where $k>0$ and $0\lt\alpha\lt\dfrac{\pi}{2}$.`,
        parts: [
          { label: "(a)", q: R`Find the values of $k$ and $\alpha$.`, type: "fields", marks: 3,
            fields: [
              { label: "$k$", type: "num", a: 2, marks: 1, show: "2", reject: ["4", "sqrt(2)"] },
              { label: R`$\alpha$ (radians)`, type: "num", a: "pi/3", marks: 2, show: R`\dfrac{\pi}{3}`, accept: ["1.0472"], tol: 1e-3, reject: ["pi/6", "60"] }
            ],
            why: R`<p>&bull;1 expand $k\cos(x-\alpha)=k\cos x\cos\alpha+k\sin x\sin\alpha$ and equate: $k\cos\alpha=1$, $k\sin\alpha=\sqrt3$; so $k=\sqrt{1+3}=2$</p><p>&bull;2 $\tan\alpha=\sqrt3$ (both $\cos\alpha$ and $\sin\alpha$ positive)</p><p>&bull;3 $\alpha=\dfrac{\pi}{3}$.</p><p>Commonly seen: $\tan\alpha=\dfrac{1}{\sqrt3}$ (ratio inverted) giving $\dfrac{\pi}{6}$.</p>` },
          { label: "(b)", q: R`Hence solve $\cos x+\sqrt3\sin x=\sqrt3$ for $0\leq x<2\pi$. Give exact values.`, type: "set", marks: 2, a: ["pi/6", "pi/2"], show: R`x=\dfrac{\pi}{6},\ \dfrac{\pi}{2}`,
            reject: ["pi/6, 5pi/6", "pi/3, 2pi/3"],
            why: R`<p>&bull;1 $2\cos\!\left(x-\dfrac{\pi}{3}\right)=\sqrt3$, so $\cos\!\left(x-\dfrac{\pi}{3}\right)=\dfrac{\sqrt3}{2}$, giving $x-\dfrac{\pi}{3}=\pm\dfrac{\pi}{6}$ (also $\dfrac{11\pi}{6}$)</p><p>&bull;2 $x=\dfrac{\pi}{3}+\dfrac{\pi}{6}=\dfrac{\pi}{2}$ and $x=\dfrac{\pi}{3}-\dfrac{\pi}{6}=\dfrac{\pi}{6}$ (the value $x=\dfrac{\pi}{3}+\dfrac{11\pi}{6}$ is outside the interval).</p>` },
          { label: "(c)", q: R`State the maximum value of $5+\cos x+\sqrt3\sin x$ and the value of $x$ in the interval $0\leq x<2\pi$ at which it occurs.`, type: "fields", marks: 2,
            fields: [
              { label: "maximum value", type: "num", a: 7, marks: 1, show: "7", reject: ["3", "5"] },
              { label: R`$x$ (radians)`, type: "num", a: "pi/3", marks: 1, show: R`\dfrac{\pi}{3}`, accept: ["1.0472"], tol: 1e-3, reject: ["0", "pi/6"] }
            ],
            why: R`<p>&bull;1 $5+2\cos\!\left(x-\dfrac{\pi}{3}\right)$ is largest when the cosine is $1$: maximum value $5+2=7$</p><p>&bull;2 this happens when $x-\dfrac{\pi}{3}=0$, so $x=\dfrac{\pi}{3}$.</p>` }
        ]
      },
      /* ---------- 07 ---------- */
      {
        id: "trig-07", calc: false,
        style: "Paper 1 style · non-calculator · quadratic in sin x using the double angle formula (degrees)",
        stem: R`Consider the equation $3\cos2x^\circ+5\sin x^\circ+1=0$ for $0\leq x<360$.`,
        parts: [
          { label: "(a)", q: R`The equation can be written as $a\sin^2x^\circ+b\sin x^\circ-4=0$, where $a>0$. State the values of $a$ and $b$.`, type: "fields", marks: 2,
            fields: [
              { label: "$a$", type: "num", a: 6, marks: 1, show: "6", reject: ["-6", "3"] },
              { label: "$b$", type: "num", a: -5, marks: 1, show: "-5", reject: ["5", "-3"] }
            ],
            why: R`<p>&bull;1 use $\cos2x=1-2\sin^2x$: $3(1-2\sin^2x)+5\sin x+1=0$, i.e. $-6\sin^2x+5\sin x+4=0$</p><p>&bull;2 multiply by $-1$: $6\sin^2x-5\sin x-4=0$, so $a=6$, $b=-5$.</p>` },
          { label: "(b)", q: R`Factorise $6s^2-5s-4$ and hence state the value of $\sin x^\circ$ that gives solutions of the equation.`, type: "num", marks: 1, a: "-1/2", accept: ["-0.5"], show: R`-\tfrac12`, reject: ["4/3", "1/2"],
            why: R`<p>&bull;1 $6s^2-5s-4=(2s+1)(3s-4)$, so $\sin x=-\tfrac12$ or $\sin x=\tfrac43$; since $\sin x\leq 1$ only $\sin x=-\tfrac12$ gives solutions.</p>` },
          { label: "(c)", q: R`Solve the equation for $0\leq x<360$.`, type: "set", marks: 2, a: [210, 330], show: R`x=210,\ 330`, reject: ["30, 150", "150, 210"],
            why: R`<p>&bull;1 $\sin x^\circ=-\tfrac12$ has solutions in the third and fourth quadrants with related angle $30^\circ$: $x=180+30=210$</p><p>&bull;2 $x=360-30=330$.</p>` }
        ]
      },
      /* ---------- 08 ---------- */
      {
        id: "trig-08", calc: false,
        style: "Paper 1 style · non-calculator · finding the equation of a trig graph, then using it (radians)",
        stem: R`The diagram shows part of the graph of $y=a\cos bx+c$ for $0\leq x\leq\pi$. The graph has a maximum at $(0,3)$, a minimum at $\left(\dfrac{\pi}{2},-1\right)$ and its next maximum at $(\pi,3)$.`,
        figure: fig8,
        parts: [
          { label: "(a)", q: R`State the values of $a$, $b$ and $c$, where $a$ and $b$ are positive.`, type: "fields", marks: 3,
            fields: [
              { label: "$a$", type: "num", a: 2, marks: 1, show: "2", reject: ["4", "-2"] },
              { label: "$b$", type: "num", a: 2, marks: 1, show: "2", reject: ["1", "pi"] },
              { label: "$c$", type: "num", a: 1, marks: 1, show: "1", reject: ["3", "-1"] }
            ],
            why: R`<p>&bull;1 amplitude $a=\dfrac{3-(-1)}{2}=2$</p><p>&bull;2 one full cycle takes $\pi$, so the period $\dfrac{2\pi}{b}=\pi$ and $b=2$</p><p>&bull;3 the midline is $y=\dfrac{3+(-1)}{2}=1$, so $c=1$.</p>` },
          { label: "(b)", q: R`Hence solve $a\cos bx+c=0$ for $0\leq x\leq\pi$. Give exact values.`, type: "set", marks: 2, a: ["pi/3", "2*pi/3"], show: R`x=\dfrac{\pi}{3},\ \dfrac{2\pi}{3}`, reject: ["pi/6, 5pi/6", "pi/3, 4pi/3"],
            why: R`<p>&bull;1 $2\cos2x+1=0$, so $\cos2x=-\tfrac12$ and $2x=\dfrac{2\pi}{3},\dfrac{4\pi}{3}$ (in $0\leq2x\leq2\pi$)</p><p>&bull;2 $x=\dfrac{\pi}{3},\dfrac{2\pi}{3}$.</p>` }
        ]
      },
      /* ---------- 09 ---------- */
      {
        id: "trig-09", calc: false,
        style: "Paper 1 style · non-calculator · transformations and turning points of a trig function",
        stem: R`The function $f$ is defined by $f(x)=2\cos\!\left(x+\dfrac{\pi}{3}\right)-1$ for $0\leq x<2\pi$.`,
        parts: [
          { label: "(a)", q: R`Which description takes the graph of $y=\cos x$ onto the graph of $y=f(x)$?`, type: "mcq", marks: 1, a: 2,
            opts: [
              R`vertical stretch of scale factor $2$, translation of $\frac{\pi}{3}$ units to the right, then $1$ unit down`,
              R`vertical stretch of scale factor $2$, translation of $\frac{\pi}{3}$ units to the left, then $1$ unit up`,
              R`vertical stretch of scale factor $2$, translation of $\frac{\pi}{3}$ units to the left, then $1$ unit down`,
              R`horizontal stretch of scale factor $2$, translation of $\frac{\pi}{3}$ units to the left, then $1$ unit down`
            ],
            why: R`<p>&bull;1 $x+\dfrac{\pi}{3}$ moves the graph left by $\dfrac{\pi}{3}$; the $2$ multiplies the output (vertical stretch); the $-1$ moves the graph down $1$ unit.</p>` },
          { label: "(b)", q: R`State the minimum value of $f(x)$.`, type: "num", marks: 1, a: -3, show: "-3", reject: ["-1", "-2"],
            why: R`<p>&bull;1 $\cos(\cdot)$ has minimum $-1$, so $f$ has minimum $2(-1)-1=-3$.</p>` },
          { label: "(c)", q: R`Find the coordinates of the maximum turning point of $f$.`, type: "fields", marks: 2,
            fields: [
              { label: R`$x$ (radians)`, type: "num", a: "5*pi/3", marks: 1, show: R`\dfrac{5\pi}{3}`, accept: ["5.236"], tol: 1e-3, reject: ["pi/3", "2pi/3"] },
              { label: "$y$", type: "num", a: 1, marks: 1, show: "1", reject: ["2", "3"] }
            ],
            why: R`<p>&bull;1 the maximum needs $\cos\!\left(x+\dfrac{\pi}{3}\right)=1$, so $x+\dfrac{\pi}{3}=2\pi$ and $x=\dfrac{5\pi}{3}$</p><p>&bull;2 $y=2(1)-1=1$; the point is $\left(\dfrac{5\pi}{3},1\right)$.</p>` }
        ]
      },
      /* ---------- 10 ---------- */
      {
        id: "trig-10", calc: false,
        style: "Paper 1 style · non-calculator · double angle formula, then integration (calculus link)",
        stem: R`In this question $x$ is in radians.`,
        parts: [
          { label: "(a)", q: R`Use $\cos2x=2\cos^2x-1$ to write $\cos^2x$ in terms of $\cos2x$.`, type: "expr", marks: 1, a: "(1+cos(2x))/2", show: R`\tfrac12(1+\cos2x)`,
            reject: ["(1-cos(2x))/2", "2cos(2x)+1"],
            why: R`<p>&bull;1 rearrange $2\cos^2x=1+\cos2x$, so $\cos^2x=\tfrac12(1+\cos2x)$.</p>` },
          { label: "(b)", q: R`Hence find the exact value of $\displaystyle\int_0^{\pi/6}\cos^2x\,dx$.`, type: "num", marks: 3, a: "pi/12+sqrt(3)/8", show: R`\dfrac{\pi}{12}+\dfrac{\sqrt3}{8}`,
            reject: ["pi/6+sqrt(3)/4", "pi/12+sqrt(3)/4"],
            partial: [{ a: "pi/12+sqrt(3)/4", marks: 2, note: "the integral of $\\cos2x$ was taken as $\\sin2x$ (the factor $\\tfrac12$ was missed)" }],
            why: R`<p>&bull;1 $\displaystyle\int_0^{\pi/6}\tfrac12(1+\cos2x)\,dx=\left[\tfrac12x+\tfrac14\sin2x\right]_0^{\pi/6}$</p><p>&bull;2 substitute the limits: $\dfrac{\pi}{12}+\tfrac14\sin\dfrac{\pi}{3}-0$</p><p>&bull;3 $\sin\dfrac{\pi}{3}=\dfrac{\sqrt3}{2}$, so the value is $\dfrac{\pi}{12}+\dfrac{\sqrt3}{8}$.</p>` }
        ]
      },
      /* ---------- 11 ---------- */
      {
        id: "trig-11", calc: false,
        style: "Paper 1 style · non-calculator · compound angle equation reduced to tan x (radians)",
        stem: R`Consider the equation $\sin\!\left(x+\dfrac{\pi}{6}\right)=\cos x$, where $0\leq x\leq2\pi$.`,
        parts: [
          { label: "(a)", q: R`Expand the left-hand side. The equation can then be written as $\tan x=k$. Find the exact value of $k$.`, type: "num", marks: 2, a: "sqrt(3)/3", accept: ["1/sqrt(3)"], show: R`\dfrac{1}{\sqrt3}`,
            reject: ["sqrt(3)", "-sqrt(3)/3"],
            partial: [{ a: "sqrt(3)", marks: 1, note: "the two sides were divided the wrong way round" }],
            why: R`<p>&bull;1 $\sin x\cos\dfrac{\pi}{6}+\cos x\sin\dfrac{\pi}{6}=\cos x$, i.e. $\dfrac{\sqrt3}{2}\sin x+\dfrac12\cos x=\cos x$, so $\dfrac{\sqrt3}{2}\sin x=\dfrac12\cos x$</p><p>&bull;2 divide by $\dfrac{\sqrt3}{2}\cos x$: $\tan x=\dfrac{1}{\sqrt3}$.</p>` },
          { label: "(b)", q: R`Hence solve the equation for $0\leq x\leq2\pi$. Give exact values.`, type: "set", marks: 2, a: ["pi/6", "7*pi/6"], show: R`x=\dfrac{\pi}{6},\ \dfrac{7\pi}{6}`, reject: ["pi/6, 5pi/6", "pi/3, 4pi/3"],
            why: R`<p>&bull;1 $\tan x=\dfrac{1}{\sqrt3}$ gives the first quadrant solution $x=\dfrac{\pi}{6}$</p><p>&bull;2 tangent has period $\pi$, so $x=\dfrac{\pi}{6}+\pi=\dfrac{7\pi}{6}$.</p>` }
        ]
      },
      /* ---------- 12 ---------- */
      {
        id: "trig-12", calc: true,
        style: "Paper 2 style · calculator · wave function in degrees, then solving",
        stem: R`The expression $7\sin x^\circ-3\cos x^\circ$ can be written in the form $k\sin(x-\alpha)^\circ$, where $k>0$ and $0\leq\alpha<90$.`,
        parts: [
          { label: "(a)", q: R`Calculate the values of $k$ and $\alpha$. Give $k$ and $\alpha$ correct to $1$ decimal place.`, type: "fields", marks: 3,
            fields: [
              { label: "$k$", type: "num", a: 7.6, tol: 0.05, marks: 1, show: R`7.6\ (=\sqrt{58})`, reject: ["58", "10"] },
              { label: R`$\alpha$`, type: "num", a: 23.2, tol: 0.05, marks: 2, show: R`23.2`, reject: ["66.8", "113.2"] }
            ],
            why: R`<p>&bull;1 expand $k\sin(x-\alpha)=k\sin x\cos\alpha-k\cos x\sin\alpha$ and compare: $k\cos\alpha=7$, $k\sin\alpha=3$; $k=\sqrt{7^2+3^2}=\sqrt{58}=7.6$</p><p>&bull;2 $\tan\alpha=\dfrac37$</p><p>&bull;3 $\alpha=23.2^\circ$.</p><p>Commonly seen: $\tan\alpha=\dfrac73$, giving $66.8^\circ$.</p>` },
          { label: "(b)", q: R`Hence solve $7\sin x^\circ-3\cos x^\circ=4$ for $0\leq x<360$. Give your answers correct to $1$ decimal place.`, type: "set", marks: 2, a: [54.9, 171.5], tol: 0.1, show: R`x=54.9,\ 171.5`, reject: ["54.9, 125.1", "31.7, 148.3"],
            why: R`<p>&bull;1 $\sqrt{58}\sin(x-23.2)^\circ=4$, so $\sin(x-23.2)^\circ=0.525\ldots$, giving $x-23.2=31.7$ or $148.3$</p><p>&bull;2 $x=54.9$ or $x=171.5$.</p>` }
        ]
      },
      /* ---------- 13 ---------- */
      {
        id: "trig-13", calc: true,
        style: "Paper 2 style · calculator · tide model using a wave function (degrees)",
        stem: R`The depth, $D$ metres, of water at a harbour entrance $t$ hours after midnight is modelled by $$D(t)=8+3\sin(30t)^\circ+4\cos(30t)^\circ,\qquad 0\leq t\leq12.$$`,
        parts: [
          { label: "(a)", q: R`Write $3\sin(30t)^\circ+4\cos(30t)^\circ$ in the form $k\sin(30t+\alpha)^\circ$, where $k>0$ and $0\leq\alpha<90$. Give $\alpha$ correct to $1$ decimal place.`, type: "fields", marks: 3,
            fields: [
              { label: "$k$", type: "num", a: 5, marks: 1, show: "5", reject: ["7", "25"] },
              { label: R`$\alpha$`, type: "num", a: 53.1, tol: 0.05, marks: 2, show: "53.1", reject: ["36.9", "0.93"] }
            ],
            why: R`<p>&bull;1 compare $k\sin(30t+\alpha)=k\sin30t\cos\alpha+k\cos30t\sin\alpha$: $k\cos\alpha=3$, $k\sin\alpha=4$; $k=\sqrt{9+16}=5$</p><p>&bull;2 $\tan\alpha=\dfrac43$</p><p>&bull;3 $\alpha=53.1^\circ$.</p><p>Commonly seen: $\tan\alpha=\dfrac34$, giving $36.9^\circ$.</p>` },
          { label: "(b)", q: R`Find the maximum depth of water and the first time after midnight at which it occurs. Give the time in hours correct to $1$ decimal place.`, type: "fields", marks: 2,
            fields: [
              { label: "maximum depth (m)", type: "num", a: 13, marks: 1, show: "13", reject: ["5", "11"] },
              { label: "time (hours)", type: "num", a: 1.2, tol: 0.05, marks: 1, show: "1.2", reject: ["3", "1.8"] }
            ],
            why: R`<p>&bull;1 $D=8+5\sin(30t+53.1)^\circ$ is greatest when the sine is $1$: $D_{\max}=8+5=13$ metres</p><p>&bull;2 $30t+53.1=90$, so $t=\dfrac{36.9}{30}=1.2$ hours.</p>` },
          { label: "(c)", q: R`Find the first time after midnight when the depth is exactly $10$ metres. Give your answer in hours correct to $1$ decimal place.`, type: "num", marks: 2, a: 3.4, tol: 0.05, unit: "hours", show: "3.4",
            reject: ["5.2", "-1"],
            why: R`<p>&bull;1 $8+5\sin(30t+53.1)^\circ=10$, so $\sin(30t+53.1)^\circ=0.4$, giving $30t+53.1=23.6$ or $156.4$; the first is below $53.1$ (it would be $t<0$) so use $156.4$</p><p>&bull;2 $t=\dfrac{156.4-53.1}{30}=3.4$ hours.</p>` }
        ]
      },
      /* ---------- 14 ---------- */
      {
        id: "trig-14", calc: true,
        style: "Paper 2 style · calculator · solving a trig equation in radians",
        stem: R`Angles in this question are in radians, so set your calculator to radian mode.`,
        parts: [
          { q: R`Solve $4\sin(2x-0.5)=3$ for $0\leq x\leq2\pi$. Give your answers correct to $2$ decimal places.`, type: "set", marks: 4, a: [0.67, 1.4, 3.82, 4.54], tol: 0.005,
            show: R`x=0.67,\ 1.40,\ 3.82,\ 4.54`, reject: ["0.67, 1.40", "13.4, 54.9"],
            why: R`<p>&bull;1 $\sin(2x-0.5)=0.75$; the calculator gives $2x-0.5=0.848$</p><p>&bull;2 the other angle in $[0,2\pi]$ is $\pi-0.848=2.293$; the range for $2x-0.5$ is $-0.5$ to $12.07$, so add $2\pi$ to both: $7.131$ and $8.577$</p><p>&bull;3 add $0.5$ and halve: $x=\dfrac{0.5+0.848}{2}=0.674$ and $x=\dfrac{0.5+2.293}{2}=1.397$</p><p>&bull;4 and from the second pair $x=3.816$ and $x=4.538$: $x=0.67,\ 1.40,\ 3.82,\ 4.54$.</p>` }
        ]
      },
      /* ---------- 15 ---------- */
      {
        id: "trig-15", calc: true,
        style: "Paper 2 style · calculator · reading a wave function graph and solving",
        stem: R`The diagram shows the graph of $y=12\cos x^\circ-5\sin x^\circ$ for $0\leq x\leq360$. The graph cuts the $y$-axis at $(0,12)$ and has a minimum turning point $Q$ and a maximum turning point $P$.`,
        figure: fig15,
        parts: [
          { label: "(a)", q: R`Express $12\cos x^\circ-5\sin x^\circ$ in the form $k\cos(x+\alpha)^\circ$, where $k>0$ and $0\leq\alpha<90$. Give $\alpha$ correct to $1$ decimal place.`, type: "fields", marks: 3,
            fields: [
              { label: "$k$", type: "num", a: 13, marks: 1, show: "13", reject: ["7", "17"] },
              { label: R`$\alpha$`, type: "num", a: 22.6, tol: 0.05, marks: 2, show: "22.6", reject: ["67.4", "24.6"] }
            ],
            why: R`<p>&bull;1 $k\cos(x+\alpha)=k\cos x\cos\alpha-k\sin x\sin\alpha$, so $k\cos\alpha=12$ and $k\sin\alpha=5$; $k=\sqrt{144+25}=13$</p><p>&bull;2 $\tan\alpha=\dfrac{5}{12}$</p><p>&bull;3 $\alpha=22.6^\circ$.</p><p>Commonly seen: $\tan\alpha=\dfrac{12}{5}$, giving $67.4^\circ$.</p>` },
          { label: "(b)", q: R`State the coordinates of the maximum turning point $P$. Give the $x$-coordinate correct to $1$ decimal place.`, type: "fields", marks: 2,
            fields: [
              { label: "$x$-coordinate of $P$", type: "num", a: 337.4, tol: 0.05, marks: 1, show: "337.4", reject: ["22.6", "157.4"] },
              { label: "$y$-coordinate of $P$", type: "num", a: 13, marks: 1, show: "13", reject: ["12", "-13"] }
            ],
            why: R`<p>&bull;1 $13\cos(x+22.6)^\circ$ is greatest when $x+22.6=360$, so $x=337.4$</p><p>&bull;2 the maximum value is $k=13$, so $P=(337.4,\ 13)$.</p>` },
          { label: "(c)", q: R`Solve $12\cos x^\circ-5\sin x^\circ=10$ for $0\leq x<360$. Give your answers correct to $1$ decimal place.`, type: "set", marks: 2, a: [17.1, 297.7], tol: 0.05, show: R`x=17.1,\ 297.7`, reject: ["17.1, 62.3", "62.3, 342.9"],
            why: R`<p>&bull;1 $13\cos(x+22.6)^\circ=10$, so $\cos(x+22.6)^\circ=0.769\ldots$, giving $x+22.6=39.7$ or $320.3$</p><p>&bull;2 $x=17.1$ or $x=297.7$.</p>` }
        ]
      },
      /* ---------- 16 ---------- */
      {
        id: "trig-16", calc: true,
        style: "Paper 2 style · calculator · a tidal depth model in radians",
        stem: R`The depth, $d$ metres, of water at a quay $t$ hours after the tide is at mid-level and rising is modelled by $$d(t)=7+3\sin\!\left(\dfrac{\pi t}{6}\right),\qquad 0\leq t\leq12,$$ where the angle is in radians. A cargo vessel can only unload when the depth exceeds $9.1$ metres.`,
        parts: [
          { label: "(a)", q: R`State the maximum depth, the minimum depth and the period of the tide (in hours).`, type: "fields", marks: 3,
            fields: [
              { label: "maximum depth (m)", type: "num", a: 10, marks: 1, show: "10", reject: ["3", "7"] },
              { label: "minimum depth (m)", type: "num", a: 4, marks: 1, show: "4", reject: ["3", "-3"] },
              { label: "period (hours)", type: "num", a: 12, marks: 1, show: "12", reject: ["6", "2"] }
            ],
            why: R`<p>&bull;1 maximum $7+3=10$ m</p><p>&bull;2 minimum $7-3=4$ m</p><p>&bull;3 period $\dfrac{2\pi}{\pi/6}=12$ hours.</p>` },
          { label: "(b)", q: R`Find the times in $0\leq t\leq12$ when the depth is exactly $9.1$ metres. Give your answers in hours correct to $2$ decimal places.`, type: "set", marks: 2, a: [1.48, 4.52], tol: 0.005, show: R`t=1.48,\ 4.52`, reject: ["1.48, 3.52", "0.47, 5.53"],
            why: R`<p>&bull;1 $\sin\!\left(\dfrac{\pi t}{6}\right)=0.7$, so $\dfrac{\pi t}{6}=0.775$ or $\pi-0.775=2.366$</p><p>&bull;2 $t=\dfrac{6}{\pi}(0.775)=1.48$ and $t=\dfrac{6}{\pi}(2.366)=4.52$.</p>` },
          { label: "(c)", q: R`For how long, in hours, is unloading possible during this period? Give your answer correct to $2$ decimal places.`, type: "num", marks: 1, a: 3.04, tol: 0.005, unit: "hours", show: "3.04", reject: ["4.52", "6.04"],
            why: R`<p>&bull;1 the depth exceeds $9.1$ between the two times: $4.52-1.48=3.04$ hours.</p>` }
        ]
      },
      /* ---------- 17 ---------- */
      {
        id: "trig-17", calc: true,
        style: "Paper 2 style · calculator · double angle, then a quadratic in cos x (degrees)",
        stem: R`Consider the equation $5\cos2x^\circ+4\cos x^\circ+3=0$ for $0\leq x<360$.`,
        parts: [
          { label: "(a)", q: R`Dividing through by $2$, the equation can be written in the form $5\cos^2x^\circ+b\cos x^\circ+c=0$. State the values of $b$ and $c$.`, type: "fields", marks: 2,
            fields: [
              { label: "$b$", type: "num", a: 2, marks: 1, show: "2", reject: ["4", "-2"] },
              { label: "$c$", type: "num", a: -1, marks: 1, show: "-1", reject: ["1", "-2"] }
            ],
            why: R`<p>&bull;1 use $\cos2x=2\cos^2x-1$: $10\cos^2x-5+4\cos x+3=0$, i.e. $10\cos^2x+4\cos x-2=0$</p><p>&bull;2 divide by $2$: $5\cos^2x+2\cos x-1=0$, so $b=2$, $c=-1$.</p>` },
          { label: "(b)", q: R`Hence solve the equation for $0\leq x<360$. Give your answers correct to $1$ decimal place.`, type: "set", marks: 4, a: [73.1, 133.6, 226.4, 286.9], tol: 0.05, show: R`x=73.1,\ 133.6,\ 226.4,\ 286.9`,
            reject: ["73.1, 286.9", "73.1, 133.6"],
            why: R`<p>&bull;1 quadratic formula: $\cos x=\dfrac{-2\pm\sqrt{24}}{10}$, so $\cos x=0.290$ or $\cos x=-0.690$</p><p>&bull;2 $\cos x=0.290$: $x=73.1$</p><p>&bull;3 $x=360-73.1=286.9$</p><p>&bull;4 $\cos x=-0.690$: $x=133.6$ and $x=360-133.6=226.4$.</p>` }
        ]
      },
      /* ---------- 18 ---------- */
      {
        id: "trig-18", calc: true,
        style: "Paper 2 style · calculator · an oscillation modelled by a wave function (radians)",
        stem: R`A mass hangs on a spring. Its displacement from the rest position is $x$ centimetres at time $t$ seconds, where $$x(t)=4\sin2t+3\cos2t,\qquad t\geq0,$$ and the angles are in radians.`,
        parts: [
          { label: "(a)", q: R`Write $x(t)$ in the form $k\sin(2t+\alpha)$, where $k>0$ and $0<\alpha<\dfrac{\pi}{2}$. Give $\alpha$ correct to $2$ decimal places.`, type: "fields", marks: 3,
            fields: [
              { label: "$k$", type: "num", a: 5, marks: 1, show: "5", reject: ["7", "25"] },
              { label: R`$\alpha$`, type: "num", a: 0.64, tol: 0.005, marks: 2, show: "0.64", reject: ["0.93", "36.87"] }
            ],
            why: R`<p>&bull;1 $k\cos\alpha=4$, $k\sin\alpha=3$, so $k=\sqrt{16+9}=5$</p><p>&bull;2 $\tan\alpha=\dfrac34$</p><p>&bull;3 $\alpha=0.64$ (radians).</p><p>Commonly seen: $\tan\alpha=\dfrac43$, giving $0.93$.</p>` },
          { label: "(b)", q: R`Find the first time at which the displacement is greatest. Give your answer in seconds correct to $2$ decimal places.`, type: "num", marks: 2, a: 0.46, alts: [0.47], tol: 0.005, unit: "s", show: "0.46", reject: ["0.93", "44.4"],
            partial: [{ a: 0.93, marks: 1, note: "$2t+\\alpha=\\tfrac{\\pi}{2}$ solved but $t$ was not halved" }],
            why: R`<p>&bull;1 the displacement is greatest when $\sin(2t+0.64)=1$, i.e. $2t+0.64=\dfrac{\pi}{2}$ (first occurrence)</p><p>&bull;2 $t=\dfrac{1.5708-0.6435}{2}=0.46$ seconds.</p>` },
          { label: "(c)", q: R`Find the first time at which the displacement is $2$ centimetres. Give your answer in seconds correct to $2$ decimal places.`, type: "num", marks: 2, a: 1.04, alts: [1.05], tol: 0.005, unit: "s", show: "1.04", reject: ["0.67", "-0.12"],
            why: R`<p>&bull;1 $5\sin(2t+0.6435)=2$, so $\sin(2t+0.6435)=0.4$; $2t+0.6435=0.411$ is too small ($t<0$), so use $\pi-0.411=2.730$</p><p>&bull;2 $t=\dfrac{2.730-0.6435}{2}=1.04$ seconds.</p>` }
        ]
      }
    ]
  };
})();
