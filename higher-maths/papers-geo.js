/* Past-paper practice: Coordinate geometry, circles & vectors. Original questions in the style of SQA Higher Mathematics papers (not copied). */
(function () {
  "use strict";
  const BANK = (window.HMP_BANK = window.HMP_BANK || {});
  const R = String.raw;

  /* ---- small SVG helpers (palette: ink, teal accent, paper) ---- */
  const INK = "#1d1a14", ACC = "#155457", PAPER = "#fffaf0";
  const svg = (label, body) =>
    `<svg viewBox="0 0 340 240" role="img" aria-label="${label}"><rect width="340" height="240" fill="${PAPER}"/>${body}</svg>`;
  const line = (a, b, o) => {
    o = o || {};
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${o.col || INK}" stroke-width="${o.w || 1.8}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;
  };
  const text = (x, y, s, o) => {
    o = o || {};
    return `<text x="${x}" y="${y}" font-size="13" text-anchor="${o.anchor || "middle"}" fill="${o.col || INK}"${o.it ? ' font-style="italic"' : ""}>${s}</text>`;
  };
  const dot = (p, col) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="${col || INK}"/>`;
  const poly = (pts, o) => {
    o = o || {};
    return `<polygon points="${pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}" fill="${o.fill || "none"}" stroke="${INK}" stroke-width="1.8"/>`;
  };
  /* right-angle marker at p between directions towards a and b */
  const rightAngle = (p, a, b, s) => {
    const u = [a[0] - p[0], a[1] - p[1]], v = [b[0] - p[0], b[1] - p[1]];
    const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]);
    const e = [u[0] / lu * s, u[1] / lu * s], f = [v[0] / lv * s, v[1] / lv * s];
    return `<polyline points="${(p[0] + e[0]).toFixed(1)},${(p[1] + e[1]).toFixed(1)} ${(p[0] + e[0] + f[0]).toFixed(1)},${(p[1] + e[1] + f[1]).toFixed(1)} ${(p[0] + f[0]).toFixed(1)},${(p[1] + f[1]).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1.2"/>`;
  };

  /* figure 1: triangle ABC, median AM, altitude BN */
  const figTriangle = (() => {
    const sx = (x) => 50 + 36 * x, sy = (y) => 215 - 28 * y;
    const A = [sx(0), sy(1)], B = [sx(2), sy(7)], C = [sx(6), sy(3)], M = [sx(4), sy(5)], N = [sx(3.6), sy(2.2)], P = [sx(3), sy(4)];
    return svg(
      "Triangle ABC with the median from A to the midpoint M of BC drawn as a solid line, and the altitude from B meeting AC at N at a right angle drawn dashed; the two lines cross at P.",
      poly([A, B, C]) + line(A, M, { col: ACC, w: 2.2 }) + line(B, N, { col: ACC, w: 2.2, dash: "6 4" }) + rightAngle(N, A, B, 9) +
      dot(A) + dot(B) + dot(C) + dot(M) + dot(N) + dot(P, ACC) +
      text(A[0] - 12, A[1] + 4, "A") + text(B[0], B[1] - 9, "B") + text(C[0] + 13, C[1] + 4, "C") +
      text(M[0] + 13, M[1] - 4, "M") + text(N[0] + 4, N[1] + 17, "N") + text(P[0] - 11, P[1] - 7, "P", { col: ACC })
    );
  })();

  /* figure 2: circle with centre C, point P and the tangent at P */
  const figCircleTangent = (() => {
    const px = (x) => 140 + 18 * (x - 3), py = (y) => 125 - 18 * (y + 2);
    const C = [px(3), py(-2)], P = [px(6), py(2)];
    const t0 = [px(6 - 3.2), py(2 + 2.4)], t1 = [px(6 + 4), py(2 - 3)];
    return svg(
      "A circle with centre C and a point P on its circumference; the radius CP is dashed and the tangent line T touches the circle at P, meeting the radius at a right angle.",
      `<circle cx="${C[0]}" cy="${C[1]}" r="90" fill="none" stroke="${INK}" stroke-width="1.8"/>` +
      line(t0, t1, { col: ACC, w: 2.2 }) + line(C, P, { dash: "6 4", w: 1.5 }) + rightAngle(P, C, t1, 9) +
      dot(C) + dot(P, ACC) +
      text(C[0] - 4, C[1] + 20, "C") + text(P[0] + 4, P[1] - 12, "P", { col: ACC }) + text(t1[0] - 6, t1[1] - 10, "T", { col: ACC, it: true }) +
      text(300, 220, "not to scale", { anchor: "end", col: INK })
    );
  })();

  /* oblique projection used by the two solid figures */
  const solid = (ox, oy, sx, sy, dx, dy) => (x, y, z) => [ox + sx * x + dx * y, oy - sy * z - dy * y];

  /* figure 3: cuboid OABCDEFG with P on AB and Q the midpoint of DG */
  const figCuboid = (() => {
    const p3 = solid(60, 190, 30, 14, 9, 6);
    const O = p3(0, 0, 0), A = p3(4, 0, 0), B = p3(4, 6, 0), C = p3(0, 6, 0), D = p3(0, 0, 8), E = p3(4, 0, 8), F = p3(4, 6, 8), G = p3(0, 6, 8);
    const P = p3(4, 2, 0), Q = p3(0, 3, 8);
    const hid = { dash: "5 4", w: 1.3 };
    return svg(
      "A cuboid OABCDEFG standing on the base OABC with D, E, F, G above O, A, B, C. Point P lies on edge AB and point Q is the midpoint of edge DG, joined by a dashed line PQ.",
      line(C, O, hid) + line(C, B, hid) + line(C, G, hid) +
      line(O, A) + line(A, B) + line(O, D) + line(A, E) + line(B, F) + line(D, E) + line(E, F) + line(D, G) + line(G, F) +
      line(P, Q, { col: ACC, w: 2.2, dash: "6 4" }) +
      dot(P, ACC) + dot(Q, ACC) +
      text(O[0] - 11, O[1] + 4, "O") + text(A[0] + 2, A[1] + 17, "A") + text(B[0] + 12, B[1] + 5, "B") + text(C[0] - 11, C[1] + 4, "C") +
      text(D[0] - 11, D[1] + 2, "D") + text(E[0] - 3, E[1] - 8, "E") + text(F[0] + 11, F[1] - 2, "F") + text(G[0] - 3, G[1] - 8, "G") +
      text(P[0] + 4, P[1] + 17, "P", { col: ACC }) + text(Q[0] + 12, Q[1] + 15, "Q", { col: ACC })
    );
  })();

  /* figure 4: square-based pyramid VABCD */
  const figPyramid = (() => {
    const p3 = solid(50, 205, 28, 14, 9, 6);
    const A = p3(0, 0, 0), B = p3(6, 0, 0), C = p3(6, 6, 0), D = p3(0, 6, 0), V = p3(3, 3, 8);
    const hid = { dash: "5 4", w: 1.3 };
    return svg(
      "A square-based pyramid VABCD with base ABCD and apex V directly above the centre of the base; the edges VA and VB are highlighted and the hidden edges DA, DC and DV are dashed.",
      line(D, A, hid) + line(D, C, hid) + line(D, V, hid) +
      line(A, B) + line(B, C) + line(V, C) +
      line(V, A, { col: ACC, w: 2.4 }) + line(V, B, { col: ACC, w: 2.4 }) +
      dot(V, ACC) +
      text(A[0] - 11, A[1] + 4, "A") + text(B[0] + 11, B[1] + 5, "B") + text(C[0] + 12, C[1] + 4, "C") + text(D[0] - 11, D[1] + 4, "D") +
      text(V[0], V[1] - 10, "V", { col: ACC })
    );
  })();

  BANK.geo = {
    intro: "Straight lines, circles and three-dimensional vectors, in the pattern of recent SQA papers. Twelve questions are non-calculator (exact values, surds and fractions) and six are calculator (angles and lengths to one decimal place).",
    questions: [
      /* ---------------------------------------------------------------- 01 */
      {
        id: "geo-01", calc: false,
        style: "Paper 1 style · non-calculator · gradient and angle of a line",
        stem: R`A straight line has equation $x - \sqrt{3}\,y + 4 = 0$.`,
        parts: [
          {
            label: "(a)", q: "Find the gradient of the line.", type: "num", marks: 1,
            a: "sqrt(3)/3", accept: ["1/sqrt(3)"], reject: ["-sqrt(3)/3", "sqrt(3)", "-1/sqrt(3)"],
            show: R`\dfrac{1}{\sqrt{3}}`,
            why: R`<p>&bull;1 rearrange to $y=\dfrac{1}{\sqrt3}x+\dfrac{4}{\sqrt3}$, so $m=\dfrac{1}{\sqrt3}=\dfrac{\sqrt3}{3}$.</p><p>Commonly seen: $m=\sqrt3$ (coefficients the wrong way round) or a sign slip from $-\sqrt3\,y$.</p>`
          },
          {
            label: "(b)", q: "Hence find the angle the line makes with the positive direction of the $x$-axis.", type: "num", marks: 1,
            a: 30, unit: "°", reject: ["60", "150"], show: R`30^\circ`,
            why: R`<p>&bull;1 $\tan\theta=\dfrac{1}{\sqrt3}$ (exact value from the table), so $\theta=30^\circ$.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 02 */
      {
        id: "geo-02", calc: false,
        style: "Paper 1 style · non-calculator · perpendicular bisector",
        stem: R`$\mathrm{P}(2,-3)$ and $\mathrm{Q}(8,1)$ are two points.`,
        parts: [
          {
            label: "(a)", q: "Find the midpoint of PQ.", type: "vec", marks: 1,
            a: [5, -1], reject: ["(3, 2)", "(10, -2)"], show: R`(5,\,-1)`,
            why: R`<p>&bull;1 $\left(\dfrac{2+8}{2},\dfrac{-3+1}{2}\right)=(5,-1)$.</p>`
          },
          {
            label: "(b)", q: "Find the gradient of the perpendicular bisector of PQ.", type: "num", marks: 1,
            a: "-3/2", accept: ["-1.5"], reject: ["3/2", "2/3"], show: R`-\dfrac{3}{2}`,
            why: R`<p>&bull;1 $m_{PQ}=\dfrac{1-(-3)}{8-2}=\dfrac23$, so the perpendicular gradient is $-\dfrac32$.</p><p>Commonly seen: forgetting to change the sign, or inverting without negating.</p>`
          },
          {
            label: "(c)", q: "Hence find the equation of the perpendicular bisector of PQ.", type: "eq", marks: 2,
            a: "3x+2y=13", accept: ["y=-3/2x+13/2", "y+1=-3/2(x-5)"], reject: ["3x+2y=-13", "3x-2y=13", "y+1=3/2(x-5)"],
            show: R`3x+2y=13`,
            why: R`<p>&bull;1 use the point $(5,-1)$ and $m=-\tfrac32$: $y-(-1)=-\tfrac32(x-5)$.</p><p>&bull;2 simplify: $2y+2=-3x+15$, so $3x+2y=13$.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 03 */
      {
        id: "geo-03", calc: false,
        style: "Paper 1 style · non-calculator · median and altitude of a triangle",
        stem: R`Triangle ABC has vertices $\mathrm{A}(0,1)$, $\mathrm{B}(2,7)$ and $\mathrm{C}(6,3)$. AM is the median from A, with M on BC, and BN is the altitude from B, with N on AC. The diagram is not to scale.`,
        figure: figTriangle,
        parts: [
          {
            label: "(a)", q: "Find the coordinates of M.", type: "vec", marks: 1,
            a: [4, 5], reject: ["(8, 10)", "(2, 2)"], show: R`(4,\,5)`,
            why: R`<p>&bull;1 midpoint of BC: $\left(\dfrac{2+6}{2},\dfrac{7+3}{2}\right)=(4,5)$.</p>`
          },
          {
            label: "(b)", q: "Find the equation of the median AM.", type: "eq", marks: 2,
            a: "y=x+1", accept: ["x-y+1=0"], reject: ["y=x-1", "y=x+4", "y=5x/4"],
            show: R`y=x+1`,
            why: R`<p>&bull;1 gradient of AM: $\dfrac{5-1}{4-0}=1$.</p><p>&bull;2 through $\mathrm{A}(0,1)$: $y=x+1$.</p>`
          },
          {
            label: "(c)", q: "Find the gradient of AC.", type: "num", marks: 1,
            a: "1/3", reject: ["3", "-3", "-1/3"], show: R`\dfrac13`,
            why: R`<p>&bull;1 $m_{AC}=\dfrac{3-1}{6-0}=\dfrac13$.</p>`
          },
          {
            label: "(d)", q: "Hence find the equation of the altitude BN.", type: "eq", marks: 2,
            a: "y=-3x+13", accept: ["3x+y=13"], reject: ["y=3x+13", "y=-3x-13", "y=-x/3+7"],
            show: R`y=-3x+13`,
            why: R`<p>&bull;1 perpendicular to AC: $m=-3$.</p><p>&bull;2 through $\mathrm{B}(2,7)$: $y-7=-3(x-2)$, so $y=-3x+13$.</p>`
          },
          {
            label: "(e)", q: "Find the coordinates of the point where AM and BN intersect.", type: "vec", marks: 2,
            a: [3, 4], reject: ["(3, 13)", "(4, 5)", "(-3, -2)"], show: R`(3,\,4)`,
            why: R`<p>&bull;1 equate: $x+1=-3x+13$, so $x=3$.</p><p>&bull;2 substitute: $y=3+1=4$. The lines meet at $(3,4)$.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 04 */
      {
        id: "geo-04", calc: false,
        style: "Paper 1 style · non-calculator · collinear points and ratio",
        stem: R`The points $\mathrm{P}(-3,5)$, $\mathrm{Q}(1,k)$ and $\mathrm{R}(9,-1)$ lie on the same straight line.`,
        parts: [
          {
            label: "(a)", q: "Find the gradient of PR.", type: "num", marks: 1,
            a: "-1/2", accept: ["-0.5"], reject: ["1/2", "-2", "2"], show: R`-\dfrac12`,
            why: R`<p>&bull;1 $m_{PR}=\dfrac{-1-5}{9-(-3)}=\dfrac{-6}{12}=-\dfrac12$.</p>`
          },
          {
            label: "(b)", q: "Find the value of $k$.", type: "num", marks: 2,
            a: 3, partial: [{ a: 7, marks: 1, note: "Sign slip: gradient PQ was set equal to +1/2, giving k = 7." }],
            reject: ["7", "5", "-3"], show: "3",
            why: R`<p>&bull;1 $m_{PQ}=m_{PR}$: $\dfrac{k-5}{1-(-3)}=-\dfrac12$.</p><p>&bull;2 $k-5=-2$, so $k=3$.</p>`
          },
          {
            label: "(c)", q: "Q divides PR in the ratio $1:n$, that is $\\mathrm{PQ}:\\mathrm{QR}=1:n$. Find $n$.", type: "num", marks: 1,
            a: 2, reject: ["1/2", "4", "8"], show: "2",
            why: R`<p>&bull;1 horizontal distances: P to Q is $1-(-3)=4$, Q to R is $9-1=8$, so $\mathrm{PQ}:\mathrm{QR}=4:8=1:2$ and $n=2$.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 05 */
      {
        id: "geo-05", calc: false,
        style: "Paper 1 style · non-calculator · centre, radius and tangent",
        stem: R`The circle $C$ has equation $x^2+y^2-6x+4y-12=0$. The point $\mathrm{P}(6,2)$ lies on $C$, and the line $T$ is the tangent to $C$ at P.`,
        figure: figCircleTangent,
        parts: [
          {
            label: "(a)", q: "State the centre and the radius of $C$.", type: "fields", marks: 2,
            fields: [
              { label: "centre", type: "vec", a: [3, -2], marks: 1, show: R`(3,\,-2)`, reject: ["(-3, 2)", "(6, -4)"] },
              { label: "radius", type: "num", a: 5, marks: 1, show: "5", reject: ["25", "12"] }
            ],
            why: R`<p>&bull;1 centre $(-g,-f)=(3,-2)$, from $2g=-6$ and $2f=4$.</p><p>&bull;2 $r=\sqrt{g^2+f^2-c}=\sqrt{9+4+12}=5$.</p><p>Commonly seen: centre with the signs not reversed, or the radius left as $25$.</p>`
          },
          {
            label: "(b)", q: "Find the gradient of the tangent $T$.", type: "num", marks: 2,
            a: "-3/4", accept: ["-0.75"],
            partial: [{ a: "4/3", marks: 1, note: "That is the gradient of the radius CP. The tangent is perpendicular to it." }],
            reject: ["4/3", "3/4", "-4/3"], show: R`-\dfrac34`,
            why: R`<p>&bull;1 gradient of the radius from $(3,-2)$ to $(6,2)$: $\dfrac{2-(-2)}{6-3}=\dfrac43$.</p><p>&bull;2 the tangent is perpendicular to the radius: $m_T=-\dfrac34$.</p>`
          },
          {
            label: "(c)", q: "Find the equation of $T$.", type: "eq", marks: 1,
            a: "3x+4y=26", accept: ["y=-3/4x+13/2", "y-2=-3/4(x-6)"], reject: ["3x+4y=-26", "4x-3y=26", "3x-4y=26"],
            show: R`3x+4y=26`,
            why: R`<p>&bull;1 $y-2=-\tfrac34(x-6)$, which gives $4y-8=-3x+18$, so $3x+4y=26$.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 06 */
      {
        id: "geo-06", calc: false,
        style: "Paper 1 style · non-calculator · equation of a circle from a diameter",
        stem: R`PQ is a diameter of the circle $C$, where $\mathrm{P}(-2,1)$ and $\mathrm{Q}(6,5)$.`,
        parts: [
          {
            label: "(a)", q: "Find the centre of $C$.", type: "vec", marks: 1,
            a: [2, 3], reject: ["(4, 6)", "(-2, -3)"], show: R`(2,\,3)`,
            why: R`<p>&bull;1 the centre is the midpoint of PQ: $\left(\dfrac{-2+6}{2},\dfrac{1+5}{2}\right)=(2,3)$.</p>`
          },
          {
            label: "(b)", q: "Find the equation of $C$.", type: "eq", marks: 2,
            a: "(x-2)^2+(y-3)^2=20", reject: ["(x-2)^2+(y-3)^2=80", "(x+2)^2+(y+3)^2=20", "(x-2)^2+(y-3)^2=10", "(x-2)^2+(y-3)^2=sqrt(20)"],
            show: R`(x-2)^2+(y-3)^2=20`,
            why: R`<p>&bull;1 $r^2=$ (distance from the centre to Q)$^2=(6-2)^2+(5-3)^2=20$.</p><p>&bull;2 $(x-2)^2+(y-3)^2=20$.</p><p>Commonly seen: writing $r$ instead of $r^2$ on the right-hand side.</p>`
          },
          {
            label: "(c)", q: R`The point $\mathrm{R}(5,6)$ is plotted on the same axes. Which statement is correct?`, type: "mcq", marks: 1,
            opts: ["R lies inside C", "R lies on C", "R lies outside C", "R is the centre of C"], a: 0,
            why: R`<p>&bull;1 the distance squared from the centre $(2,3)$ to R is $3^2+3^2=18$, which is less than $r^2=20$, so R is inside $C$.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 07 */
      {
        id: "geo-07", calc: false,
        style: "Paper 1 style · non-calculator · recognising circles",
        stem: R`Six equations are listed below. Some of them represent circles and some do not.`,
        parts: [
          {
            q: R`Select <strong>all</strong> of the equations that represent circles.`, type: "multi", marks: 3,
            opts: [
              R`$x^2+y^2=9$`,
              R`$x^2+y^2+4x-2y+9=0$`,
              R`$x^2+y^2-6x+2y+1=0$`,
              R`$2x^2+2y^2-8x+6=0$`,
              R`$x^2+2y^2=4$`,
              R`$(x-1)^2+(y+3)^2=0$`
            ],
            a: [0, 2, 3],
            why: R`<p>&bull;1 $x^2+y^2=9$ is a circle, centre $(0,0)$ and radius $3$.</p><p>&bull;2 $x^2+y^2-6x+2y+1=0$ has $r^2=9+1-1=9$, so it is a circle.</p><p>&bull;3 $2x^2+2y^2-8x+6=0$ becomes $x^2+y^2-4x+3=0$, with $r^2=4-3=1$: a circle.</p><p>The others fail: the second has $r^2=4+1-9=-4$; $x^2+2y^2=4$ has different coefficients of $x^2$ and $y^2$; and the last has radius zero, a single point.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 08 */
      {
        id: "geo-08", calc: false,
        style: "Paper 1 style · non-calculator · line and circle, discriminant",
        stem: R`The circle $x^2+y^2=8$ and the line $y=x+k$ are drawn on the same axes, where $k$ is a constant. Substituting $y=x+k$ into the equation of the circle gives $2x^2+2kx+k^2-8=0$.`,
        parts: [
          {
            label: "(a)", q: "Find an expression for the discriminant of this quadratic equation, in terms of $k$.", type: "expr", vars: ["k"], marks: 2,
            a: "64-4k^2", partial: [{ a: "4k^2-8k^2-64", marks: 1, note: "Sign slip when expanding -8(k^2 - 8)." }],
            reject: ["4k^2-8k^2-64", "-4k^2", "64+4k^2"], show: R`64-4k^2`,
            why: R`<p>&bull;1 $a=2$, $b=2k$, $c=k^2-8$: $b^2-4ac=(2k)^2-4\times2\times(k^2-8)$.</p><p>&bull;2 $=4k^2-8k^2+64=64-4k^2$.</p>`
          },
          {
            label: "(b)", q: "Hence find the values of $k$ for which the line is a tangent to the circle.", type: "set", marks: 2,
            a: [4, -4], reject: ["4", "16, -16"], show: R`k=4,\ k=-4`,
            why: R`<p>&bull;1 tangent means equal roots: $64-4k^2=0$.</p><p>&bull;2 $k^2=16$, so $k=4$ or $k=-4$.</p>`
          },
          {
            label: "(c)", q: "For $k=4$, find the coordinates of the point of contact.", type: "vec", marks: 1,
            a: [-2, 2], reject: ["(2, -2)", "(-2, -2)"], show: R`(-2,\,2)`,
            why: R`<p>&bull;1 with $k=4$: $2x^2+8x+8=0$, so $(x+2)^2=0$ and $x=-2$; then $y=-2+4=2$. The point is $(-2,2)$.</p>`
          },
          {
            label: "(d)", q: "How many points do the line and the circle have in common when $k=5$?", type: "mcq", marks: 1,
            opts: ["None", "One", "Two", "It cannot be decided"], a: 0,
            why: R`<p>&bull;1 for $k=5$ the discriminant is $64-100=-36<0$, so there are no real roots and the line misses the circle.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 09 */
      {
        id: "geo-09", calc: false,
        style: "Paper 1 style · non-calculator · two circles touching",
        stem: R`Circle $C_1$ has equation $x^2+y^2-4x-2y-4=0$. Circle $C_2$ has equation $x^2+y^2-12x-8y+k=0$ and its centre is $(6,4)$.`,
        parts: [
          {
            label: "(a)", q: "Find the centre and the radius of $C_1$.", type: "fields", marks: 2,
            fields: [
              { label: "centre", type: "vec", a: [2, 1], marks: 1, show: R`(2,\,1)`, reject: ["(-2, -1)", "(4, 2)"] },
              { label: "radius", type: "num", a: 3, marks: 1, show: "3", reject: ["9", "sqrt(5)"] }
            ],
            why: R`<p>&bull;1 centre $(-g,-f)=(2,1)$.</p><p>&bull;2 $r=\sqrt{4+1+4}=3$.</p>`
          },
          {
            label: "(b)", q: "Find the distance between the centres of $C_1$ and $C_2$.", type: "num", marks: 1,
            a: 5, reject: ["25", "7"], show: "5",
            why: R`<p>&bull;1 $d=\sqrt{(6-2)^2+(4-1)^2}=\sqrt{25}=5$.</p>`
          },
          {
            label: "(c)", q: "$C_2$ touches $C_1$ externally. Find the value of $k$.", type: "num", marks: 2,
            a: 48, partial: [{ a: -12, marks: 1, note: "That is the internal-contact case (d = r2 - r1), not external." }],
            reject: ["-12", "52", "2"], show: "48",
            why: R`<p>&bull;1 external contact: $d=r_1+r_2$, so $5=3+r_2$ and $r_2=2$.</p><p>&bull;2 for $C_2$, $r_2^2=36+16-k=52-k$, so $52-k=4$ and $k=48$.</p>`
          },
          {
            label: "(d)", q: "A different value of $k$ makes $C_2$ touch $C_1$ internally, with $C_2$ the larger circle and enclosing $C_1$. Find this value of $k$.", type: "num", marks: 2,
            a: -12, partial: [{ a: 48, marks: 1, note: "That is the external-contact value." }],
            reject: ["48", "-4", "64"], show: "-12",
            why: R`<p>&bull;1 internal contact: $d=r_2-r_1$, so $5=r_2-3$ and $r_2=8$.</p><p>&bull;2 $52-k=64$, so $k=-12$.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 10 */
      {
        id: "geo-10", calc: false,
        style: "Paper 1 style · non-calculator · magnitude, unit vector and scalar product",
        stem: R`Vectors $\mathbf{p}$, $\mathbf{q}$ and $\mathbf{r}$ are given by $\mathbf{p}=2\mathbf{i}+3\mathbf{j}-6\mathbf{k}$, $\mathbf{q}=3\mathbf{i}-2\mathbf{j}+6\mathbf{k}$ and $\mathbf{r}=t\mathbf{i}+4\mathbf{j}+\mathbf{k}$.`,
        parts: [
          {
            label: "(a)", q: R`Find $|\mathbf{p}|$.`, type: "num", marks: 1,
            a: 7, reject: ["49", "sqrt(7)", "5"], show: "7",
            why: R`<p>&bull;1 $|\mathbf p|=\sqrt{2^2+3^2+(-6)^2}=\sqrt{49}=7$.</p>`
          },
          {
            label: "(b)", q: R`Write down the unit vector in the direction of $\mathbf{p}$, using fractions.`, type: "vec", marks: 1,
            a: ["2/7", "3/7", "-6/7"], reject: ["(2, 3, -6)", "(2/49, 3/49, -6/49)", "(2/7, 3/7, 6/7)"], show: R`\left(\dfrac27,\ \dfrac37,\ -\dfrac67\right)`,
            why: R`<p>&bull;1 divide each component by $|\mathbf p|=7$: $\dfrac17(2,3,-6)$.</p>`
          },
          {
            label: "(c)", q: R`Calculate $\mathbf{p}\cdot\mathbf{q}$.`, type: "num", marks: 1,
            a: -36, reject: ["36", "-24"], show: "-36",
            why: R`<p>&bull;1 $\mathbf p\cdot\mathbf q=2\times3+3\times(-2)+(-6)\times6=6-6-36=-36$.</p>`
          },
          {
            label: "(d)", q: R`Find the exact value of the cosine of the angle between $\mathbf{p}$ and $\mathbf{q}$.`, type: "num", marks: 1,
            a: "-36/49", reject: ["-36/7", "36/49", "-36"], show: R`-\dfrac{36}{49}`,
            why: R`<p>&bull;1 $|\mathbf q|=\sqrt{9+4+36}=7$, so $\cos\theta=\dfrac{\mathbf p\cdot\mathbf q}{|\mathbf p||\mathbf q|}=\dfrac{-36}{49}$.</p>`
          },
          {
            label: "(e)", q: R`Given that $\mathbf{p}$ and $\mathbf{r}$ are perpendicular, find the value of $t$.`, type: "num", marks: 2,
            a: -3, partial: [{ a: 3, marks: 1, note: "Scalar product set to zero, but a sign slip in the solution." }],
            reject: ["3", "-6", "-3/2"], show: "-3",
            why: R`<p>&bull;1 perpendicular means $\mathbf p\cdot\mathbf r=0$: $2t+12-6=0$.</p><p>&bull;2 $2t=-6$, so $t=-3$.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 11 */
      {
        id: "geo-11", calc: false,
        style: "Paper 1 style · non-calculator · section formula and a parallelogram",
        stem: R`$\mathrm{A}(1,-2,4)$ and $\mathrm{B}(10,4,-2)$ are two points.`,
        parts: [
          {
            label: "(a)", q: R`Express $\overrightarrow{\mathrm{AB}}$ in component form.`, type: "vec", marks: 1,
            a: [9, 6, -6], reject: ["(-9, -6, 6)", "(11, 2, 2)"], show: R`\begin{pmatrix}9\\6\\-6\end{pmatrix}`,
            why: R`<p>&bull;1 $\overrightarrow{AB}=\mathbf b-\mathbf a=(10-1,\ 4-(-2),\ -2-4)=(9,6,-6)$.</p>`
          },
          {
            label: "(b)", q: R`The point P lies on AB such that $\mathrm{AP}:\mathrm{PB}=1:2$. Find the coordinates of P.`, type: "vec", marks: 2,
            a: [4, 0, 2], reject: ["(7, 2, 0)", "(5.5, 1, 1)", "(3, 2, -2)"], show: R`(4,\,0,\,2)`,
            why: R`<p>&bull;1 $\overrightarrow{AP}=\tfrac13\overrightarrow{AB}=(3,2,-2)$.</p><p>&bull;2 $\mathbf p=\mathbf a+\overrightarrow{AP}=(1+3,\ -2+2,\ 4-2)=(4,0,2)$.</p><p>Commonly seen: using $\tfrac23$ instead of $\tfrac13$.</p>`
          },
          {
            label: "(c)", q: R`ABCD is a parallelogram, where C is the point $(11,7,-3)$. Find the coordinates of D.`, type: "vec", marks: 2,
            a: [2, 1, 3], reject: ["(20, 13, -9)", "(0, -5, 5)"], show: R`(2,\,1,\,3)`,
            why: R`<p>&bull;1 in a parallelogram $\overrightarrow{AD}=\overrightarrow{BC}=(11-10,\ 7-4,\ -3-(-2))=(1,3,-1)$.</p><p>&bull;2 $\mathbf d=\mathbf a+\overrightarrow{AD}=(2,1,3)$.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 12 */
      {
        id: "geo-12", calc: false,
        style: "Paper 1 style · non-calculator · vector pathways in a cuboid",
        stem: R`The diagram shows a cuboid OABCDEFG, with D, E, F and G directly above O, A, B and C. Relative to the origin O, the points are $\mathrm{A}(4,0,0)$, $\mathrm{C}(0,6,0)$ and $\mathrm{D}(0,0,8)$. The point P lies on AB with $\mathrm{AP}:\mathrm{PB}=1:2$, and Q is the midpoint of DG.`,
        figure: figCuboid,
        parts: [
          {
            label: "(a)", q: "Write down the coordinates of P.", type: "vec", marks: 1,
            a: [4, 2, 0], reject: ["(4, 3, 0)", "(4, 4, 0)"], show: R`(4,\,2,\,0)`,
            why: R`<p>&bull;1 P is one third of the way from $\mathrm{A}(4,0,0)$ to $\mathrm{B}(4,6,0)$, so $\mathrm{P}=(4,2,0)$.</p>`
          },
          {
            label: "(b)", q: R`Find the components of $\overrightarrow{\mathrm{PQ}}$.`, type: "vec", marks: 2,
            a: [-4, 1, 8], reject: ["(4, -1, -8)", "(-4, 3, 8)"], show: R`\begin{pmatrix}-4\\1\\8\end{pmatrix}`,
            why: R`<p>&bull;1 $\mathrm{G}=(0,6,8)$, so the midpoint of DG is $\mathrm{Q}=(0,3,8)$.</p><p>&bull;2 $\overrightarrow{PQ}=\mathbf q-\mathbf p=(0-4,\ 3-2,\ 8-0)=(-4,1,8)$.</p>`
          },
          {
            label: "(c)", q: R`Calculate the length of PQ.`, type: "num", marks: 1,
            a: 9, reject: ["81", "sqrt(80)"], show: "9",
            why: R`<p>&bull;1 $|PQ|=\sqrt{16+1+64}=\sqrt{81}=9$.</p>`
          },
          {
            label: "(d)", q: R`Find the exact value of the cosine of the angle between $\overrightarrow{\mathrm{PQ}}$ and $\overrightarrow{\mathrm{OA}}$.`, type: "num", marks: 2,
            a: "-4/9", partial: [{ a: -16, marks: 1, note: "The scalar product is correct but it has not been divided by the two magnitudes." }],
            reject: ["4/9", "-16", "-4/3"], show: R`-\dfrac49`,
            why: R`<p>&bull;1 $\overrightarrow{OA}=(4,0,0)$, so $\overrightarrow{PQ}\cdot\overrightarrow{OA}=-16$ and $|OA|=4$.</p><p>&bull;2 $\cos\theta=\dfrac{-16}{9\times4}=-\dfrac49$.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 13 (calc) */
      {
        id: "geo-13", calc: true,
        style: "Paper 2 style · calculator · angle of a line and angle between two lines",
        stem: R`Line $L_1$ passes through $\mathrm{A}(-3,-1)$ and $\mathrm{B}(5,6)$. Line $L_2$ has equation $3x+2y=12$.`,
        parts: [
          {
            label: "(a)", q: "Find the gradient of $L_1$.", type: "num", marks: 1,
            a: "7/8", accept: ["0.875"], reject: ["8/7", "-7/8"], show: R`\dfrac78`,
            why: R`<p>&bull;1 $m=\dfrac{6-(-1)}{5-(-3)}=\dfrac78$.</p>`
          },
          {
            label: "(b)", q: "Find the angle $L_1$ makes with the positive direction of the $x$-axis. Give your answer to 1 decimal place.", type: "num", marks: 2,
            a: 41.2, tol: 0.05, unit: "°",
            partial: [{ a: 0.72, marks: 1, note: "Calculator in radian mode: set it to degrees." }],
            reject: ["0.72", "48.8"], show: R`41.2^\circ`,
            why: R`<p>&bull;1 $\tan\theta=\dfrac78$.</p><p>&bull;2 $\theta=\tan^{-1}(0.875)=41.2^\circ$ (calculator in degree mode).</p><p>Commonly seen: $48.8^\circ$ from $\tan^{-1}\tfrac87$.</p>`
          },
          {
            label: "(c)", q: "Find the angle $L_2$ makes with the positive direction of the $x$-axis. Give your answer to 1 decimal place.", type: "num", marks: 2,
            a: 123.7, tol: 0.05, unit: "°",
            partial: [{ a: 56.3, marks: 1, note: "Acute angle only: the gradient is negative so the angle is obtuse (180 - 56.3)." }],
            reject: ["56.3", "-56.3"], show: R`123.7^\circ`,
            why: R`<p>&bull;1 rearrange: $y=-\tfrac32x+6$, so $\tan\theta=-\dfrac32$.</p><p>&bull;2 the gradient is negative, so $\theta=180^\circ-\tan^{-1}(1.5)=180-56.3=123.7^\circ$.</p>`
          },
          {
            label: "(d)", q: "Hence find the acute angle between $L_1$ and $L_2$.", type: "num", marks: 1,
            a: 82.5, tol: 0.05, unit: "°", reject: ["97.5", "165"], show: R`82.5^\circ`,
            why: R`<p>&bull;1 difference of the two angles: $123.7-41.2=82.5^\circ$, which is acute.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 14 (calc) */
      {
        id: "geo-14", calc: true,
        style: "Paper 2 style · calculator · a frigate's course and a radar circle",
        stem: R`A coastguard radar station at $\mathrm{S}(4,3)$ on a map detects any ship within 10 km of S (distances in kilometres). The edge of the radar range is the circle $(x-4)^2+(y-3)^2=100$. A frigate sails along the straight course $y=0.5x-2$ at a steady 24 km/h.`,
        parts: [
          {
            label: "(a)", q: "Substituting for $y$ and simplifying gives $x^2+px+q=0$. Find $p$ and $q$.", type: "fields", marks: 2,
            fields: [
              { label: "$p$", type: "num", a: -10.4, marks: 1, accept: ["-52/5"], show: "-10.4", reject: ["-13", "-5.2"] },
              { label: "$q$", type: "num", a: -47.2, marks: 1, accept: ["-236/5"], show: "-47.2", reject: ["-59", "47.2"] }
            ],
            why: R`<p>&bull;1 $(x-4)^2+(0.5x-5)^2=100$ gives $1.25x^2-13x-59=0$.</p><p>&bull;2 divide by $1.25$: $x^2-10.4x-47.2=0$.</p>`
          },
          {
            label: "(b)", q: "Find the $x$-coordinates of the two points where the course crosses the edge of the radar range. Give both to 1 decimal place.", type: "set", marks: 2,
            a: [13.8, -3.4], tol: 0.05, reject: ["13.8", "-13.8, 3.4"], show: R`x=13.8,\ x=-3.4`,
            why: R`<p>&bull;1 quadratic formula: $x=\dfrac{10.4\pm\sqrt{10.4^2+4\times47.2}}{2}=\dfrac{10.4\pm\sqrt{296.96}}{2}$.</p><p>&bull;2 $x=13.8$ or $x=-3.4$.</p>`
          },
          {
            label: "(c)", q: "Calculate the length of the frigate's course inside the radar range. Give your answer to 1 decimal place, in kilometres.", type: "num", marks: 2,
            a: 19.3, tol: 0.05, unit: "km",
            partial: [{ a: 17.2, marks: 1, note: "Horizontal distance only: the course slopes, so multiply by sqrt(1.25)." }],
            reject: ["17.2", "296.96"], show: R`19.3\ \text{km}`,
            why: R`<p>&bull;1 the $x$-coordinates differ by $\sqrt{296.96}=17.23$, and $y$ changes by half of that along the course.</p><p>&bull;2 length $=\sqrt{17.23^2+8.62^2}=17.23\times\sqrt{1.25}=19.3$ km.</p>`
          },
          {
            label: "(d)", q: "For how many minutes is the frigate inside the radar range? Give your answer to the nearest minute.", type: "num", marks: 1,
            a: 48, tol: 0.5, unit: "minutes", reject: ["0.8", "80"], show: "48",
            why: R`<p>&bull;1 time $=\dfrac{19.27}{24}\ \text{h}=0.803\ \text{h}\approx48$ minutes.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 15 (calc) */
      {
        id: "geo-15", calc: true,
        style: "Paper 2 style · calculator · relationship between two circles",
        stem: R`Circle $C_1$ has equation $(x-1)^2+(y+2)^2=16$. Circle $C_2$ has equation $x^2+y^2-10x-6y+25=0$.`,
        parts: [
          {
            label: "(a)", q: "State the centre and radius of $C_2$ (the centre and radius of $C_1$ are $(1,-2)$ and $4$).", type: "fields", marks: 2,
            fields: [
              { label: "centre", type: "vec", a: [5, 3], marks: 1, show: R`(5,\,3)`, reject: ["(-5, -3)", "(10, 6)"] },
              { label: "radius", type: "num", a: 3, marks: 1, show: "3", reject: ["9", "sqrt(59)"] }
            ],
            why: R`<p>&bull;1 centre $(-g,-f)=(5,3)$.</p><p>&bull;2 $r=\sqrt{25+9-25}=\sqrt9=3$.</p>`
          },
          {
            label: "(b)", q: "Calculate the distance between the centres of the two circles. Give your answer to 2 decimal places.", type: "num", marks: 1,
            a: 6.4, tol: 0.005, reject: ["41", "5.83"], show: R`6.40`,
            why: R`<p>&bull;1 $d=\sqrt{(5-1)^2+(3-(-2))^2}=\sqrt{41}=6.40$.</p>`
          },
          {
            label: "(c)", q: "Which statement describes the two circles?", type: "mcq", marks: 1,
            opts: ["They touch externally", "They touch internally", "They intersect at two points", "They do not meet at all"], a: 2,
            why: R`<p>&bull;1 the radii give $r_1+r_2=7$ and $r_1-r_2=1$. Since $1<6.40<7$ the distance lies between the difference and the sum of the radii, so the circles cross at two points.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 16 (calc) */
      {
        id: "geo-16", calc: true,
        style: "Paper 2 style · calculator · angle in a triangle using vectors",
        stem: R`Relative to a fixed origin, the points $\mathrm{A}(2,-1,3)$, $\mathrm{B}(5,1,-2)$ and $\mathrm{C}(1,4,0)$ are the vertices of triangle ABC.`,
        parts: [
          {
            label: "(a)", q: R`Find the components of $\overrightarrow{\mathrm{BA}}$.`, type: "vec", marks: 1,
            a: [-3, -2, 5], reject: ["(3, 2, -5)", "(7, 0, 1)"], show: R`\begin{pmatrix}-3\\-2\\5\end{pmatrix}`,
            why: R`<p>&bull;1 $\overrightarrow{BA}=\mathbf a-\mathbf b=(2-5,\ -1-1,\ 3-(-2))=(-3,-2,5)$.</p>`
          },
          {
            label: "(b)", q: R`Find the components of $\overrightarrow{\mathrm{BC}}$.`, type: "vec", marks: 1,
            a: [-4, 3, 2], reject: ["(4, -3, -2)", "(6, 5, -2)"], show: R`\begin{pmatrix}-4\\3\\2\end{pmatrix}`,
            why: R`<p>&bull;1 $\overrightarrow{BC}=\mathbf c-\mathbf b=(1-5,\ 4-1,\ 0-(-2))=(-4,3,2)$.</p>`
          },
          {
            label: "(c)", q: "Calculate the size of angle ABC. Give your answer to 1 decimal place.", type: "num", marks: 3,
            a: 61.2, tol: 0.05, unit: "°",
            partial: [
              { a: 0.482, marks: 2, note: "Cosine of the angle found, but not the angle itself." },
              { a: 1.07, marks: 2, note: "Calculator in radian mode: set it to degrees." }
            ],
            reject: ["0.482", "118.8"], show: R`61.2^\circ`,
            why: R`<p>&bull;1 scalar product: $\overrightarrow{BA}\cdot\overrightarrow{BC}=12-6+10=16$.</p><p>&bull;2 magnitudes and cosine: $|BA|=\sqrt{38}$, $|BC|=\sqrt{29}$, so $\cos\mathrm{ABC}=\dfrac{16}{\sqrt{38}\sqrt{29}}=0.482$.</p><p>&bull;3 $\mathrm{ABC}=\cos^{-1}(0.482)=61.2^\circ$.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 17 (calc) */
      {
        id: "geo-17", calc: true,
        style: "Paper 2 style · calculator · a drone's flight path",
        stem: R`A drone flies in a straight line from $\mathrm{A}(-10,20,5)$ to $\mathrm{B}(14,8,23)$. Coordinates are in metres relative to the control point, and the third coordinate is the height above the ground.`,
        parts: [
          {
            label: "(a)", q: R`Find the components of $\overrightarrow{\mathrm{AB}}$.`, type: "vec", marks: 1,
            a: [24, -12, 18], reject: ["(-24, 12, -18)", "(4, 28, 28)"], show: R`\begin{pmatrix}24\\-12\\18\end{pmatrix}`,
            why: R`<p>&bull;1 $\overrightarrow{AB}=(14-(-10),\ 8-20,\ 23-5)=(24,-12,18)$.</p>`
          },
          {
            label: "(b)", q: "Calculate the distance the drone flies from A to B. Give your answer to 1 decimal place, in metres.", type: "num", marks: 1,
            a: 32.3, tol: 0.05, unit: "m", reject: ["1044", "30"], show: R`32.3\ \text{m}`,
            why: R`<p>&bull;1 $|AB|=\sqrt{24^2+(-12)^2+18^2}=\sqrt{1044}=32.3$ m.</p>`
          },
          {
            label: "(c)", q: R`A sensor is placed at the point S on AB where $\mathrm{AS}:\mathrm{SB}=3:1$. Find the coordinates of S.`, type: "vec", marks: 2,
            a: [8, 11, 18.5], reject: ["(-4, 17, 9.5)", "(2, 14, 14)"], show: R`(8,\,11,\,18.5)`,
            why: R`<p>&bull;1 $\overrightarrow{AS}=\tfrac34\overrightarrow{AB}=(18,-9,13.5)$.</p><p>&bull;2 $\mathbf s=\mathbf a+\overrightarrow{AS}=(-10+18,\ 20-9,\ 5+13.5)=(8,11,18.5)$.</p><p>Commonly seen: using $\tfrac14$ (the ratio the wrong way round).</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 18 (calc) */
      {
        id: "geo-18", calc: true,
        style: "Paper 2 style · calculator · vectors in a square-based pyramid",
        stem: R`The diagram shows a square-based pyramid VABCD. Relative to A as origin, $\mathrm{B}(6,0,0)$, $\mathrm{C}(6,6,0)$ and $\mathrm{D}(0,6,0)$, and the apex $\mathrm{V}(3,3,8)$ lies directly above the centre of the base. The point E lies on VD with $\mathrm{VE}:\mathrm{ED}=1:3$.`,
        figure: figPyramid,
        parts: [
          {
            label: "(a)", q: "Find the components of the two vectors below.", type: "fields", marks: 2,
            fields: [
              { label: R`$\overrightarrow{\mathrm{VA}}$`, type: "vec", a: [-3, -3, -8], marks: 1, show: R`\begin{pmatrix}-3\\-3\\-8\end{pmatrix}`, reject: ["(3, 3, 8)", "(-3, 3, -8)"] },
              { label: R`$\overrightarrow{\mathrm{VB}}$`, type: "vec", a: [3, -3, -8], marks: 1, show: R`\begin{pmatrix}3\\-3\\-8\end{pmatrix}`, reject: ["(-3, 3, 8)", "(3, 3, -8)"] }
            ],
            why: R`<p>&bull;1 $\overrightarrow{VA}=\mathbf a-\mathbf v=(0-3,\ 0-3,\ 0-8)=(-3,-3,-8)$.</p><p>&bull;2 $\overrightarrow{VB}=\mathbf b-\mathbf v=(6-3,\ 0-3,\ 0-8)=(3,-3,-8)$.</p>`
          },
          {
            label: "(b)", q: R`Calculate $\overrightarrow{\mathrm{VA}}\cdot\overrightarrow{\mathrm{VB}}$.`, type: "num", marks: 1,
            a: 64, reject: ["-64", "82"], show: "64",
            why: R`<p>&bull;1 $(-3)(3)+(-3)(-3)+(-8)(-8)=-9+9+64=64$.</p>`
          },
          {
            label: "(c)", q: "Calculate the size of angle AVB. Give your answer to 1 decimal place.", type: "num", marks: 3,
            a: 38.7, tol: 0.05, unit: "°",
            partial: [
              { a: 0.78, marks: 2, note: "Cosine of the angle found, but not the angle itself." },
              { a: 0.68, marks: 2, note: "Calculator in radian mode: set it to degrees." }
            ],
            reject: ["0.78", "0.68", "141.3"], show: R`38.7^\circ`,
            why: R`<p>&bull;1 magnitudes: $|VA|=|VB|=\sqrt{9+9+64}=\sqrt{82}$.</p><p>&bull;2 $\cos\mathrm{AVB}=\dfrac{64}{82}=0.780$.</p><p>&bull;3 $\mathrm{AVB}=\cos^{-1}(0.780)=38.7^\circ$.</p>`
          },
          {
            label: "(d)", q: "Find the coordinates of E.", type: "vec", marks: 2,
            a: [2.25, 3.75, 6], reject: ["(0.75, 5.25, 2)", "(1.5, 4.5, 4)"], show: R`\left(\dfrac94,\ \dfrac{15}{4},\ 6\right)`,
            why: R`<p>&bull;1 $\overrightarrow{VE}=\tfrac14\overrightarrow{VD}=\tfrac14(-3,3,-8)=\left(-\tfrac34,\tfrac34,-2\right)$.</p><p>&bull;2 $\mathbf e=\mathbf v+\overrightarrow{VE}=(2.25,\ 3.75,\ 6)$.</p><p>Commonly seen: using $\tfrac34$ (the ratio the wrong way round).</p>`
          }
        ]
      }
    ]
  };
})();
