/* Pre-flight check question bank for Chart, Compass & Calculus.
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking scheme (HTML, •1 •2 … like the official
   marking instructions), self-marked.
   Maths is written in KaTeX between $…$; String.raw keeps the backslashes. */
(function () {
  const R = String.raw;
  const mi = (...pts) => "<ol class=\"step-list\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HM_QUIZ = {
    /* =========================== ALGEBRA =========================== */
    "alg-poly": {
      title: "Polynomials",
      questions: [
        { q: R`What is the remainder when $f(x) = x^3 - 2x^2 + 3x - 5$ is divided by $(x - 2)$?`, opts: [R`$-1$`, R`$0$`, R`$1$`, R`$11$`], a: 2, why: R`By the remainder theorem the remainder is $f(2) = 8 - 8 + 6 - 5 = 1$. Synthetic division with 2 gives the same: $1,\ 0,\ 3,\ 1$.` },
        { q: R`Which of these is a factor of $x^3 - 7x + 6$?`, opts: [R`$(x + 1)$`, R`$(x - 3)$`, R`$(x + 2)$`, R`$(x + 3)$`], a: 3, why: R`$f(-3) = -27 + 21 + 6 = 0$, so $(x+3)$ is a factor. The others give $f(-1) = f(3) = f(-2) = 12$. (Remember the 0 coefficient for the missing $x^2$ term.)` },
        { q: R`Synthetic division of $x^3 + 2x^2 - 5x - 6$ by $(x + 1)$ uses the trial root $-1$. What is the bottom row?`, opts: [R`$1,\ 3,\ -2,\ -8$`, R`$1,\ 1,\ -6,\ 0$`, R`$1,\ 1,\ -4,\ -2$`, R`$1,\ -1,\ -3,\ 3$`], a: 1, why: R`Bring down 1. $1 \times (-1) = -1$, $2 - 1 = 1$. $1 \times (-1) = -1$, $-5 - 1 = -6$. $-6 \times (-1) = 6$, $-6 + 6 = 0$. The first option is what you get by wrongly using $+1$.` },
        { q: R`$(x + 2)$ is a factor of $2x^3 + px^2 - 5x - 6$. What is $p$?`, opts: [R`$-3$`, R`$1$`, R`$3$`, R`$12$`], a: 2, why: R`$f(-2) = -16 + 4p + 10 - 6 = 4p - 12 = 0$, so $p = 3$.` },
        { type: "open", q: R`$f(x) = 2x^3 + 3x^2 - 5x - 6$. Show that $(x + 2)$ is a factor of $f(x)$, and hence solve $f(x) = 0$.`, marks: 5, model: mi(
          R`•1 know to use $x = -2$: synthetic division with $-2$, or evaluate $f(-2)$`,
          R`•2 complete the working, get remainder $0$ (or $f(-2) = 0$), and <b>communicate</b>: "remainder is 0, so $(x + 2)$ is a factor"`,
          R`•3 find the quadratic factor $2x^2 - x - 3$`,
          R`•4 factorise fully: $(x + 2)(2x - 3)(x + 1)$`,
          R`•5 state the solutions: $x = -2,\ -1,\ \tfrac32$`) },
        { q: R`$x^3 + x^2 + 4x + 4 = (x + 1)(x^2 + 4)$. How many real roots does $x^3 + x^2 + 4x + 4 = 0$ have?`, opts: [R`one`, R`two`, R`three`, R`none`], a: 0, why: R`$x = -1$ is a root. For $x^2 + 4$, $b^2 - 4ac = 0 - 16 \lt 0$, so it adds no real roots.` },
      ],
    },
    "alg-quad": {
      title: "Quadratics",
      questions: [
        { q: R`Write $3x^2 - 12x + 7$ in the form $a(x+p)^2 + q$.`, opts: [R`$3(x-2)^2 + 3$`, R`$3(x+2)^2 - 5$`, R`$3(x-2)^2 - 5$`, R`$3(x-6)^2 - 101$`], a: 2, why: R`$3(x^2 - 4x) + 7 = 3[(x-2)^2 - 4] + 7 = 3(x-2)^2 - 12 + 7 = 3(x-2)^2 - 5$. The first option forgot to multiply the $-4$ by 3.` },
        { q: R`What are the turning point and its nature for $y = -2(x - 1)^2 + 8$?`, opts: [R`$(1,\ 8)$, maximum`, R`$(-1,\ 8)$, maximum`, R`$(1,\ 8)$, minimum`, R`$(1,\ -8)$, maximum`], a: 0, why: R`$(x-1)^2$ is zero when $x = 1$, giving $y = 8$. The coefficient $-2$ is negative, so the parabola is $\cap$-shaped: a maximum.` },
        { q: R`The roots of $4x^2 - 12x + 9 = 0$ are…`, opts: [R`real and distinct`, R`real and equal`, R`not real`, R`one positive, one negative`], a: 1, why: R`$b^2 - 4ac = 144 - 144 = 0$: equal roots. (It is $(2x - 3)^2 = 0$.)` },
        { q: R`For which values of $k$ does $x^2 + kx + 9 = 0$ have real roots?`, opts: [R`$-6 \le k \le 6$`, R`$k \ge 6$ only`, R`$k \le -6$ or $k \ge 6$`, R`$k \gt 6$ or $k \lt -6$`], a: 2, why: R`Real roots: $b^2 - 4ac \ge 0$, so $k^2 - 36 \ge 0$. The parabola $k^2 - 36$ is on or above zero outside its roots $\pm 6$, and "real" includes equal roots, so the inequalities are not strict.` },
        { q: R`Solve $x^2 + x - 12 \lt 0$.`, opts: [R`$x \lt -4$ or $x \gt 3$`, R`$-4 \lt x \lt 3$`, R`$-3 \lt x \lt 4$`, R`$x \lt -3$ or $x \gt 4$`], a: 1, why: R`$(x+4)(x-3) \lt 0$. The $\cup$-shaped parabola is below the axis between its roots $-4$ and $3$.` },
        { type: "open", q: R`Show that the roots of $(k - 2)x^2 - (3k - 2)x + 2k = 0$ are real for all values of $k$.`, marks: 4, model: mi(
          R`•1 use the discriminant: $b^2 - 4ac$`,
          R`•2 substitute correctly: $(3k-2)^2 - 4(k-2)(2k)$`,
          R`•3 simplify: $9k^2 - 12k + 4 - 8k^2 + 16k = k^2 + 4k + 4$`,
          R`•4 $= (k + 2)^2 \ge 0$ for all $k$, so the roots are always real`) },
      ],
    },
    "alg-meet": {
      title: "Intersections and tangents",
      questions: [
        { q: R`Where does the line $y = 2x + 3$ meet the curve $y = x^2$?`, opts: [R`$(3,\ 9)$ and $(-1,\ 1)$`, R`$(-3,\ 9)$ and $(1,\ 1)$`, R`$(3,\ 9)$ only`, R`They do not meet.`], a: 0, why: R`$x^2 = 2x + 3 \Rightarrow x^2 - 2x - 3 = 0 \Rightarrow (x-3)(x+1) = 0$. Then $y = 2x + 3$ gives $9$ and $1$.` },
        { q: R`Equating a line and a parabola gives a quadratic whose discriminant is negative. The line…`, opts: [R`is a tangent`, R`cuts the curve twice`, R`does not meet the curve`, R`is parallel to the axis of symmetry`], a: 2, why: R`A negative discriminant means no real solutions, so no points of intersection.` },
        { q: R`For which values of $m$ is $y = mx + 1$ a tangent to $y = x^2 + 2$?`, opts: [R`$m = 2$ only`, R`$m = \pm 2$`, R`$m = \pm 4$`, R`$m = \pm 1$`], a: 1, why: R`$x^2 + 2 = mx + 1 \Rightarrow x^2 - mx + 1 = 0$. Tangent: $m^2 - 4 = 0$, so $m = \pm 2$.` },
        { q: R`Where do $y = x^2 + 1$ and $y = 9 - x^2$ meet?`, opts: [R`$(2,\ 5)$ only`, R`$(-2,\ 5)$ and $(2,\ 5)$`, R`$(\pm 2,\ 9)$`, R`$(\pm 4,\ 17)$`], a: 1, why: R`$x^2 + 1 = 9 - x^2 \Rightarrow 2x^2 = 8 \Rightarrow x = \pm 2$, and $y = 4 + 1 = 5$ for both.` },
        { type: "open", q: R`Find the value of $k$ for which the line $y = 3x + k$ is a tangent to the curve $y = x^2 - x + 2$, and find the point of contact.`, marks: 5, model: mi(
          R`•1 equate: $x^2 - x + 2 = 3x + k$`,
          R`•2 arrange in standard form: $x^2 - 4x + (2 - k) = 0$`,
          R`•3 use the tangency condition: $(-4)^2 - 4(1)(2 - k) = 0$`,
          R`•4 solve: $16 - 8 + 4k = 0 \Rightarrow k = -2$`,
          R`•5 point of contact: $x^2 - 4x + 4 = 0 \Rightarrow x = 2$, $y = 4$, so $(2,\ 4)$`) },
      ],
    },
    "alg-func": {
      title: "Functions",
      questions: [
        { q: R`$f(x) = x + 3$ and $g(x) = 2x^2$. What is $g(f(x))$?`, opts: [R`$2x^2 + 3$`, R`$2(x + 3)^2$`, R`$(2x + 3)^2$`, R`$4x^2 + 3$`], a: 1, why: R`$f$ is inside, so it acts first: $g(x + 3) = 2(x+3)^2$. The first option is $f(g(x))$.` },
        { q: R`What is a suitable domain for $f(x) = \dfrac{1}{x^2 - 9}$?`, opts: [R`$x \ne 9$`, R`$x \gt 3$`, R`$x \ne \pm 3$`, R`$x \ne 0$`], a: 2, why: R`The denominator is zero when $x^2 = 9$, that is $x = 3$ or $x = -3$.` },
        { q: R`What is a suitable domain for $f(x) = \sqrt{x - 2}$?`, opts: [R`$x \ge 2$`, R`$x \gt 2$`, R`$x \ge 0$`, R`$x \ne 2$`], a: 0, why: R`You cannot square-root a negative, so $x - 2 \ge 0$. $\sqrt{0} = 0$ is fine, so 2 is allowed.` },
        { q: R`$f(x) = \dfrac{x - 4}{3}$. What is $f^{-1}(x)$?`, opts: [R`$3x - 4$`, R`$\dfrac{x + 4}{3}$`, R`$\dfrac{3}{x - 4}$`, R`$3x + 4$`], a: 3, why: R`$y = \frac{x-4}{3} \Rightarrow 3y = x - 4 \Rightarrow x = 3y + 4$, so $f^{-1}(x) = 3x + 4$. Check: $f(10) = 2$ and $f^{-1}(2) = 10$.` },
        { q: R`$g(x) = x^2 + 5$, $x \in \mathbb{R}$. Which number is <b>not</b> in the range of $g$?`, opts: [R`$3$`, R`$5$`, R`$6$`, R`$105$`], a: 0, why: R`$x^2 \ge 0$, so $g(x) \ge 5$. The range is $g(x) \ge 5$, so 3 can never come out.` },
        { q: R`The graph of $y = f^{-1}(x)$ is the reflection of $y = f(x)$ in…`, opts: [R`the $x$-axis`, R`the $y$-axis`, R`the line $y = x$`, R`the origin`], a: 2, why: R`An inverse swaps inputs and outputs, so every point $(a, b)$ becomes $(b, a)$: a reflection in $y = x$.` },
        { type: "open", q: R`$f(x) = 3 + 2^x$. Find an expression for $f^{-1}(x)$.`, marks: 3, model: mi(
          R`•1 start to rearrange: $y = 3 + 2^x \Rightarrow 2^x = y - 3$`,
          R`•2 use logs: $x = \log_2(y - 3)$`,
          R`•3 state the inverse in terms of $x$: $f^{-1}(x) = \log_2(x - 3)$`) + R`<p>Its domain is $x \gt 3$, which is the range of $f$.</p>` },
      ],
    },
    "alg-transform": {
      title: "Graph transformations",
      questions: [
        { q: R`$y = f(x)$ has a maximum turning point at $(2,\ 5)$. Where is the maximum on $y = f(x + 3)$?`, opts: [R`$(5,\ 5)$`, R`$(-1,\ 5)$`, R`$(2,\ 8)$`, R`$(2,\ 2)$`], a: 1, why: R`$+3$ inside the bracket moves the graph 3 to the <b>left</b>: $(2 - 3,\ 5) = (-1,\ 5)$.` },
        { q: R`$y = f(x)$ has a maximum turning point at $(2,\ 5)$. On $y = -f(x)$ this point becomes…`, opts: [R`a maximum at $(-2,\ 5)$`, R`a minimum at $(2,\ -5)$`, R`a maximum at $(2,\ -5)$`, R`a minimum at $(-2,\ -5)$`], a: 1, why: R`$-f(x)$ reflects in the $x$-axis, so $(x, y) \to (x, -y)$, and a maximum turns into a minimum.` },
        { q: R`$y = f(x)$ has a maximum at $(2,\ 5)$. Where is it on $y = f(2x)$?`, opts: [R`$(4,\ 5)$`, R`$(1,\ 5)$`, R`$(2,\ 10)$`, R`$(1,\ 10)$`], a: 1, why: R`$f(2x)$ is a horizontal squash by scale factor $\tfrac12$: $(x, y) \to (\tfrac{x}{2}, y)$.` },
        { q: R`$y = f(x)$ has a maximum at $(2,\ 5)$. Where is it on $y = 3f(x) - 1$?`, opts: [R`$(2,\ 14)$`, R`$(2,\ 12)$`, R`$(6,\ 4)$`, R`$(2,\ 16)$`], a: 0, why: R`Multiply $y$ by 3 first, then subtract 1: $3 \times 5 - 1 = 14$. Changes outside the bracket do not touch $x$.` },
        { q: R`The graph of $y = f(x)$ is moved 4 units right and 2 units down. Its equation is…`, opts: [R`$y = f(x + 4) - 2$`, R`$y = f(x - 4) + 2$`, R`$y = f(x - 4) - 2$`, R`$y = f(x - 2) - 4$`], a: 2, why: R`Right 4 is $f(x - 4)$ (inside does the opposite). Down 2 is $-2$ outside.` },
        { type: "open", q: R`$y = f(x)$ has a minimum turning point at $(-2,\ -4)$ and crosses the $x$-axis at $(1,\ 0)$. State the coordinates of the images of these two points on the graph of $y = 1 - f(x)$, and the nature of the turning point.`, marks: 3, model: mi(
          R`•1 image of the turning point: $(-2,\ -4) \to (-2,\ 5)$ (reflect in the $x$-axis, then up 1)`,
          R`•2 its nature: now a <b>maximum</b> turning point`,
          R`•3 $(1,\ 0) \to (1,\ 1)$`) },
      ],
    },
    "alg-explog": {
      title: "Exponentials and logarithms",
      questions: [
        { q: R`A pupil solves $\log_2 x + \log_2(x - 2) = 3$: "$\log_2\big(x(x - 2)\big) = 3$, so $x^2 - 2x = 8$, $(x - 4)(x + 2) = 0$, so $x = 4$ or $x = -2$." What is wrong?`, opts: [R`Nothing: both answers are correct`, R`The law of logs is used wrongly in the first line`, R`$x = -2$ must be rejected: $\log_2(-2)$ is undefined`, R`It should be $x^2 - 2x = 9$`], a: 2, why: R`The working is right up to the last step, but you can only take the log of a positive number. $x = -2$ makes both logs undefined, so the only solution is $x = 4$. State the rejection.` },
        { q: R`Evaluate $\log_4 64$.`, opts: [R`$3$`, R`$16$`, R`$4$`, R`$\tfrac13$`], a: 0, why: R`$4^3 = 64$, so $\log_4 64 = 3$.` },
        { q: R`Simplify $\log_3 54 - \log_3 2$.`, opts: [R`$\log_3 52$`, R`$27$`, R`$3$`, R`$\log_3 108$`], a: 2, why: R`$\log_3 \frac{54}{2} = \log_3 27 = 3$, since $3^3 = 27$.` },
        { q: R`Which expression equals $2\log x + \log 5$?`, opts: [R`$\log(10x)$`, R`$\log(5x^2)$`, R`$\log(x^2 + 5)$`, R`$\log(25x^2)$`], a: 1, why: R`Move the 2 up as a power, then add logs by multiplying: $\log x^2 + \log 5 = \log(5x^2)$.` },
        { q: R`Solve $2^x = 11$, correct to 3 significant figures.`, opts: [R`$5.50$`, R`$3.46$`, R`$1.04$`, R`$0.289$`], a: 1, why: R`$x \ln 2 = \ln 11 \Rightarrow x = \frac{\ln 11}{\ln 2} = 3.459…$. Check: $2^3 = 8$ and $2^4 = 16$, so the answer is between 3 and 4.` },
        { q: R`The graph of $y = \log_3 x$ passes through…`, opts: [R`$(0,\ 1)$ and $(1,\ 3)$`, R`$(1,\ 0)$ and $(3,\ 1)$`, R`$(0,\ 0)$ and $(3,\ 1)$`, R`$(1,\ 3)$ and $(3,\ 27)$`], a: 1, why: R`$\log_3 1 = 0$ and $\log_3 3 = 1$. (The first option is $y = 3^x$.)` },
        { type: "open", q: R`Solve $\log_2(x + 1) - \log_2 x = 3$, where $x \gt 0$.`, marks: 3, model: mi(
          R`•1 use a log law: $\log_2 \dfrac{x+1}{x} = 3$`,
          R`•2 convert to exponential form: $\dfrac{x+1}{x} = 2^3 = 8$`,
          R`•3 solve: $x + 1 = 8x \Rightarrow x = \tfrac17$`) },
        { type: "open", q: R`The number of weevils in the ship's biscuit store is modelled by $P = 200e^{0.03t}$, where $t$ is the time in days. How long does the population take to double?`, marks: 3, model: mi(
          R`•1 set up: $200e^{0.03t} = 400$, so $e^{0.03t} = 2$`,
          R`•2 take logs: $0.03t = \ln 2$`,
          R`•3 $t = \dfrac{\ln 2}{0.03} = 23.1$ days`) },
      ],
    },
    "alg-loggraph": {
      title: "Log graphs",
      questions: [
        { q: R`Data are thought to fit $y = ab^x$. Which graph should be a straight line?`, opts: [R`$y$ against $x$`, R`$\log y$ against $\log x$`, R`$\log y$ against $x$`, R`$y$ against $\log x$`], a: 2, why: R`$\log y = (\log b)x + \log a$: linear in $x$, with $\log y$ on the vertical axis.` },
        { q: R`$\log_{10} y = 2\log_{10} x + 1$. Which is $y$?`, opts: [R`$y = x^2 + 10$`, R`$y = 10x^2$`, R`$y = 2x + 10$`, R`$y = 10^{2x}$`], a: 1, why: R`$1 = \log_{10} 10$, so $\log_{10} y = \log_{10} x^2 + \log_{10} 10 = \log_{10}(10x^2)$.` },
        { q: R`For $y = ax^b$, the graph of $\log y$ against $\log x$ is a straight line. Its gradient is…`, opts: [R`$a$`, R`$\log a$`, R`$b$`, R`$\log b$`], a: 2, why: R`$\log y = b\log x + \log a$. The gradient is the power $b$; the intercept is $\log a$.` },
        { q: R`$\ln y = 0.5x + 2$. In the form $y = ab^x$, what are $a$ and $b$ (to 3 s.f.)?`, opts: [R`$a = 2,\ b = 0.5$`, R`$a = 7.39,\ b = 1.65$`, R`$a = 1.65,\ b = 7.39$`, R`$a = 0.693,\ b = 1.65$`], a: 1, why: R`Compare with $\ln y = x\ln b + \ln a$: $\ln a = 2$ so $a = e^2 = 7.39$; $\ln b = 0.5$ so $b = e^{0.5} = 1.65$.` },
        { type: "open", q: R`The graph of $\log_5 y$ against $\log_5 x$ is a straight line through $(0,\ 2)$ and $(1,\ 5)$. Find $y$ in terms of $x$.`, marks: 3, model: mi(
          R`•1 gradient $3$, so $\log_5 y = 3\log_5 x + 2$`,
          R`•2 write 2 as $\log_5 25$ and use log laws: $\log_5 y = \log_5(25x^3)$ (or $a = 5^2$, $b = 3$)`,
          R`•3 $y = 25x^3$`) },
        { type: "open", q: R`The curve $y = ax^b$ passes through the points $(2,\ 12)$ and $(4,\ 48)$. Find $a$ and $b$.`, marks: 4, model: mi(
          R`•1 substitute both points: $12 = a \times 2^b$ and $48 = a \times 4^b$`,
          R`•2 divide (or take logs and subtract): $\dfrac{48}{12} = \dfrac{4^b}{2^b} \Rightarrow 4 = 2^b$`,
          R`•3 $b = 2$`,
          R`•4 $12 = a \times 4 \Rightarrow a = 3$`) },
      ],
    },
    "alg-recur": {
      title: "Recurrence relations",
      questions: [
        { q: R`$u_{n+1} = 0.4u_n + 18$. What is the limit?`, opts: [R`$12$`, R`$30$`, R`$45$`, R`$7.2$`], a: 1, why: R`A limit exists because $-1 \lt 0.4 \lt 1$. $L = \frac{18}{1 - 0.4} = \frac{18}{0.6} = 30$.` },
        { q: R`Which recurrence relation has a limit?`, opts: [R`$u_{n+1} = 1.1u_n - 3$`, R`$u_{n+1} = -1.5u_n$`, R`$u_{n+1} = -0.9u_n + 5$`, R`$u_{n+1} = 2u_n + 1$`], a: 2, why: R`A limit needs $-1 \lt a \lt 1$. Only $a = -0.9$ qualifies. Its terms zig-zag towards $L = \frac{5}{1.9}$.` },
        { q: R`A water butt loses 20% of its contents each day; then 30 litres of rain is added. Which recurrence relation models it?`, opts: [R`$u_{n+1} = 0.2u_n + 30$`, R`$u_{n+1} = 0.8u_n + 30$`, R`$u_{n+1} = 1.2u_n - 30$`, R`$u_{n+1} = 0.8u_n - 30$`], a: 1, why: R`Losing 20% keeps 80%, so multiply by 0.8. Then add 30.` },
        { q: R`$u_{n+1} = 0.5u_n + 4$ and $u_0 = 20$. What is $u_2$?`, opts: [R`$14$`, R`$11$`, R`$9.5$`, R`$8$`], a: 1, why: R`$u_1 = 10 + 4 = 14$, then $u_2 = 7 + 4 = 11$.` },
        { type: "open", q: R`A sequence satisfies $u_{n+1} = au_n + b$ with $u_1 = 8$, $u_2 = 10$ and $u_3 = 11$. Find $a$ and $b$, explain why the sequence has a limit, and find it.`, marks: 4, model: mi(
          R`•1 form two equations: $10 = 8a + b$ and $11 = 10a + b$`,
          R`•2 solve: $a = \tfrac12$, $b = 6$`,
          R`•3 a limit exists because $-1 \lt \tfrac12 \lt 1$`,
          R`•4 $L = \dfrac{6}{1 - \tfrac12} = 12$`) },
      ],
    },

    /* =========================== GEOMETRY =========================== */
    "geo-line": {
      title: "The straight line",
      questions: [
        { q: R`What is the gradient of the line $2x + 3y = 6$?`, opts: [R`$2$`, R`$-\tfrac23$`, R`$\tfrac23$`, R`$-\tfrac32$`], a: 1, why: R`Rearrange: $3y = -2x + 6$, so $y = -\tfrac23x + 2$.` },
        { q: R`A line has gradient $\tfrac34$. What is the gradient of a line perpendicular to it?`, opts: [R`$\tfrac43$`, R`$-\tfrac34$`, R`$-\tfrac43$`, R`$\tfrac34$`], a: 2, why: R`Negative reciprocal: $\tfrac34 \times \left(-\tfrac43\right) = -1$.` },
        { q: R`A line has gradient $-1$. What angle does it make with the positive direction of the $x$-axis?`, opts: [R`$-45°$`, R`$45°$`, R`$135°$`, R`$225°$`], a: 2, why: R`$\tan\theta = -1$. $\tan 45° = 1$, and a negative gradient means an obtuse angle: $180° - 45° = 135°$.` },
        { q: R`$A(1, 2)$, $B(3, 6)$ and $C(6, 12)$. Which statement is correct?`, opts: [R`$m_{AB} = m_{BC} = 2$ and $B$ is common, so $A$, $B$, $C$ are collinear`, R`$m_{AB} = 2$ and $m_{BC} = 3$, so they are not collinear`, R`$AB$ and $BC$ are perpendicular`, R`$A$, $B$, $C$ are parallel`], a: 0, why: R`$m_{AB} = \frac{4}{2} = 2$ and $m_{BC} = \frac{6}{3} = 2$. Equal gradients and a shared point $B$ mean collinear. (Points cannot be "parallel".)` },
        { q: R`In triangle $ABC$, the altitude from $A$ is the line…`, opts: [R`through $A$ and the midpoint of $BC$`, R`through $A$, perpendicular to $BC$`, R`through the midpoint of $BC$, perpendicular to $BC$`, R`through $A$, parallel to $BC$`], a: 1, why: R`An altitude is a height: from a vertex, at right angles to the opposite side. The first option is the median; the third is the perpendicular bisector.` },
        { type: "open", q: R`Find the equation of the perpendicular bisector of the line joining $P(-2, 5)$ and $Q(4, 1)$.`, marks: 4, model: mi(
          R`•1 midpoint $(1,\ 3)$`,
          R`•2 $m_{PQ} = \dfrac{1 - 5}{4 - (-2)} = -\tfrac23$`,
          R`•3 perpendicular gradient $\tfrac32$`,
          R`•4 $y - 3 = \tfrac32(x - 1)$, i.e. $3x - 2y + 3 = 0$`) },
      ],
    },
    "geo-circle": {
      title: "The circle",
      questions: [
        { q: R`Which line of working correctly shows that $y = 2x + 10$ is a tangent to $x^2 + y^2 = 20$?`, opts: [R`"$(-4, 2)$ is on both the line and the circle, so the line is a tangent."`, R`"Substituting gives $x^2 + 8x + 16 = 0$; $b^2 - 4ac = 64 - 64 = 0$, so there is only one point of contact and the line is a tangent."`, R`"Substituting gives a quadratic, so the line meets the circle, so it is a tangent."`, R`"The gradient of the line is 2, which is the gradient of the circle there."`], a: 1, why: R`Meeting the circle is not enough: a line through two points of the circle meets it too. Tangency needs exactly one point of contact, shown by a zero discriminant and stated in words.` },
        { q: R`What are the centre and radius of $x^2 + y^2 + 8x - 10y + 5 = 0$?`, opts: [R`centre $(4, -5)$, radius $6$`, R`centre $(-4, 5)$, radius $6$`, R`centre $(-8, 10)$, radius $\sqrt{159}$`, R`centre $(-4, 5)$, radius $\sqrt{46}$`], a: 1, why: R`$g = 4$, $f = -5$, $c = 5$. Centre $(-g, -f) = (-4, 5)$; $r = \sqrt{16 + 25 - 5} = \sqrt{36} = 6$.` },
        { q: R`Which is the equation of the circle with centre $(2, -3)$ and radius 4?`, opts: [R`$(x + 2)^2 + (y - 3)^2 = 16$`, R`$(x - 2)^2 + (y + 3)^2 = 4$`, R`$(x - 2)^2 + (y + 3)^2 = 16$`, R`$(x - 2)^2 - (y + 3)^2 = 16$`], a: 2, why: R`$(x - a)^2 + (y - b)^2 = r^2$ with $a = 2$, $b = -3$, $r^2 = 16$.` },
        { q: R`For which values of $k$ does $x^2 + y^2 - 4x + 6y + k = 0$ represent a circle?`, opts: [R`$k \lt 13$`, R`$k \gt 13$`, R`$k \lt 5$`, R`all $k$`], a: 0, why: R`$g = -2$, $f = 3$: we need $g^2 + f^2 - c \gt 0$, so $4 + 9 - k \gt 0$, giving $k \lt 13$.` },
        { q: R`Two circles have radii 2 and 3, and their centres are 5 units apart. The circles…`, opts: [R`intersect at two points`, R`touch internally`, R`touch externally`, R`do not meet`], a: 2, why: R`$d = 5 = 2 + 3 = r_1 + r_2$: they touch externally.` },
        { q: R`Where is the point $(5, 1)$ relative to the circle $(x - 2)^2 + (y - 1)^2 = 16$?`, opts: [R`inside`, R`on the circle`, R`outside`, R`at the centre`], a: 0, why: R`$(5 - 2)^2 + (1 - 1)^2 = 9 \lt 16$, so its distance from the centre is $3 \lt 4$: inside.` },
        { type: "open", q: R`The point $P(4, 6)$ lies on the circle $x^2 + y^2 - 2x - 4y - 20 = 0$. Find the equation of the tangent at $P$.`, marks: 4, model: mi(
          R`•1 centre $(1,\ 2)$`,
          R`•2 gradient of radius $= \dfrac{6 - 2}{4 - 1} = \tfrac43$`,
          R`•3 gradient of tangent $= -\tfrac34$`,
          R`•4 $y - 6 = -\tfrac34(x - 4)$, i.e. $3x + 4y - 36 = 0$`) },
      ],
    },
    "geo-vec": {
      title: "Vectors in 3D",
      questions: [
        { q: R`The magnitude of $\mathbf{a} = \mathbf{i} + 3\mathbf{j} + k\mathbf{k}$ is…`, opts: [R`$\sqrt{10 + k^2}$`, R`$\sqrt{10} + k$`, R`$10 + k^2$`, R`$\sqrt{4 + k}$`], a: 0, why: R`$|\mathbf{a}| = \sqrt{1 + 9 + k^2}$. A square root does not split over a sum: $\sqrt{10 + k^2} \ne \sqrt{10} + k$.` },
        { q: R`$A$ is $(1, -2, 3)$ and $B$ is $(4, 2, 3)$. What is $|\overrightarrow{AB}|$?`, opts: [R`$5$`, R`$7$`, R`$\sqrt{7}$`, R`$25$`], a: 0, why: R`$\overrightarrow{AB} = (3, 4, 0)$ and $\sqrt{9 + 16 + 0} = 5$.` },
        { q: R`Which is a unit vector parallel to $2\mathbf{i} - \mathbf{j} + 2\mathbf{k}$?`, opts: [R`$\tfrac12\mathbf{i} - \mathbf{j} + \tfrac12\mathbf{k}$`, R`$\tfrac23\mathbf{i} - \tfrac13\mathbf{j} + \tfrac23\mathbf{k}$`, R`$\tfrac29\mathbf{i} - \tfrac19\mathbf{j} + \tfrac29\mathbf{k}$`, R`$\mathbf{i} - \mathbf{j} + \mathbf{k}$`], a: 1, why: R`Its magnitude is $\sqrt{4 + 1 + 4} = 3$. Divide each component by 3.` },
        { q: R`In the block-built cuboid, $\overrightarrow{OA} = 6\mathbf{i}$, $\overrightarrow{OC} = 4\mathbf{j}$ and $\overrightarrow{OD} = 3\mathbf{k}$, and $G$ is above $C$. What is $\overrightarrow{OG}$?`, opts: [R`$6\mathbf{i} + 4\mathbf{j} + 3\mathbf{k}$`, R`$4\mathbf{j} + 3\mathbf{k}$`, R`$6\mathbf{i} + 3\mathbf{k}$`, R`$4\mathbf{j} - 3\mathbf{k}$`], a: 1, why: R`$\overrightarrow{OG} = \overrightarrow{OC} + \overrightarrow{CG} = 4\mathbf{j} + 3\mathbf{k}$.` },
        { q: R`$A$ is the origin and $B$ is $(8, 4, -4)$. $P$ divides $AB$ in the ratio $1 : 3$. What are the coordinates of $P$?`, opts: [R`$(2, 1, -1)$`, R`$(6, 3, -3)$`, R`$(\tfrac83, \tfrac43, -\tfrac43)$`, R`$(4, 2, -2)$`], a: 0, why: R`$P$ is $\tfrac14$ of the way from $A$ to $B$: $\tfrac14(8, 4, -4) = (2, 1, -1)$.` },
        { q: R`$\overrightarrow{AB} = 3\overrightarrow{BC}$. Which conclusion is correctly communicated?`, opts: [R`The points $A$, $B$, $C$ are parallel.`, R`$AB$ is parallel to $BC$, and $B$ is a common point, so $A$, $B$ and $C$ are collinear.`, R`The lines $AB$ and $BC$ are collinear.`, R`The gradient of $\overrightarrow{AB}$ is 3.`], a: 1, why: R`Vectors (line segments) are parallel; points are collinear. You also need the common point. These are exactly the slips the 2026 course report lists.` },
        { type: "open", q: R`Show that the points $P(-1, 3, 2)$, $Q(1, 4, 5)$ and $R(5, 6, 11)$ are collinear.`, marks: 3, model: mi(
          R`•1 $\overrightarrow{PQ} = \begin{pmatrix}2\\1\\3\end{pmatrix}$`,
          R`•2 $\overrightarrow{QR} = \begin{pmatrix}4\\2\\6\end{pmatrix}$, so $\overrightarrow{QR} = 2\overrightarrow{PQ}$`,
          R`•3 $PQ$ and $QR$ are parallel, $Q$ is a common point, so $P$, $Q$ and $R$ are collinear (all three statements needed for this mark)`) },
      ],
    },
    "geo-dot": {
      title: "The scalar product",
      questions: [
        { q: R`Evaluate $\begin{pmatrix}1\\2\\-3\end{pmatrix}\cdot\begin{pmatrix}4\\-1\\2\end{pmatrix}$.`, opts: [R`$-4$`, R`$\begin{pmatrix}4\\-2\\-6\end{pmatrix}$`, R`$12$`, R`$-8$`], a: 0, why: R`$1(4) + 2(-1) + (-3)(2) = 4 - 2 - 6 = -4$. The scalar product is a number, never a vector.` },
        { q: R`$|\mathbf{a}| = 4$, $|\mathbf{b}| = 5$, and the angle between them is $60°$. What is $\mathbf{a}\cdot\mathbf{b}$?`, opts: [R`$20$`, R`$10\sqrt3$`, R`$10$`, R`$9$`], a: 2, why: R`$\mathbf{a}\cdot\mathbf{b} = |\mathbf{a}||\mathbf{b}|\cos 60° = 20 \times \tfrac12 = 10$.` },
        { q: R`For which value of $t$ are $\begin{pmatrix}t\\2\\1\end{pmatrix}$ and $\begin{pmatrix}3\\t\\-4\end{pmatrix}$ perpendicular?`, opts: [R`$t = \tfrac45$`, R`$t = 4$`, R`$t = -\tfrac45$`, R`$t = 2$`], a: 0, why: R`Perpendicular: scalar product zero. $3t + 2t - 4 = 0$, so $5t = 4$ and $t = \tfrac45$.` },
        { q: R`To find the size of angle $PQR$ with the scalar product, which two vectors should you use?`, opts: [R`$\overrightarrow{PQ}$ and $\overrightarrow{QR}$`, R`$\overrightarrow{QP}$ and $\overrightarrow{QR}$`, R`$\overrightarrow{PR}$ and $\overrightarrow{QR}$`, R`$\overrightarrow{OP}$ and $\overrightarrow{OR}$`], a: 1, why: R`Both vectors must start at the vertex $Q$. $\overrightarrow{PQ}$ and $\overrightarrow{QR}$ would give $180°$ minus the angle.` },
        { q: R`$\mathbf{a}\cdot\mathbf{a}$ is equal to…`, opts: [R`$0$`, R`$1$`, R`$|\mathbf{a}|^2$`, R`$2|\mathbf{a}|$`], a: 2, why: R`The angle between $\mathbf{a}$ and itself is $0°$, and $\cos 0° = 1$, so $\mathbf{a}\cdot\mathbf{a} = |\mathbf{a}||\mathbf{a}|$.` },
        { type: "open", q: R`Calculate the angle between $\mathbf{u} = \mathbf{i} + 2\mathbf{j} + 2\mathbf{k}$ and $\mathbf{v} = 3\mathbf{i} + 4\mathbf{k}$.`, marks: 5, model: mi(
          R`•1 $\mathbf{u}\cdot\mathbf{v} = 1(3) + 2(0) + 2(4) = 11$`,
          R`•2 $|\mathbf{u}| = \sqrt{1 + 4 + 4} = 3$`,
          R`•3 $|\mathbf{v}| = \sqrt{9 + 0 + 16} = 5$`,
          R`•4 $\cos\theta = \dfrac{11}{3 \times 5} = \dfrac{11}{15}$`,
          R`•5 $\theta = 42.8°$ (or $0.748$ radians)`) },
      ],
    },

    /* ========================= TRIGONOMETRY ========================= */
    "trig-rad": {
      title: "Radians and exact values",
      questions: [
        { q: R`What is $225°$ in radians?`, opts: [R`$\tfrac{5\pi}{4}$`, R`$\tfrac{3\pi}{4}$`, R`$\tfrac{4\pi}{5}$`, R`$\tfrac{9\pi}{4}$`], a: 0, why: R`$225 \times \frac{\pi}{180} = \frac{225\pi}{180} = \frac{5\pi}{4}$.` },
        { q: R`What is the exact value of $\sin\frac{2\pi}{3}$?`, opts: [R`$-\tfrac{\sqrt3}{2}$`, R`$\tfrac12$`, R`$\tfrac{\sqrt3}{2}$`, R`$-\tfrac12$`], a: 2, why: R`$\frac{2\pi}{3} = \pi - \frac{\pi}{3}$ is in the second quadrant, where sin is positive, so it equals $\sin\frac{\pi}{3} = \frac{\sqrt3}{2}$.` },
        { q: R`What is the exact value of $\tan 300°$?`, opts: [R`$\sqrt3$`, R`$-\sqrt3$`, R`$-\tfrac{1}{\sqrt3}$`, R`$\tfrac{1}{\sqrt3}$`], a: 1, why: R`$300° = 360° - 60°$, fourth quadrant, where tan is negative: $-\tan 60° = -\sqrt3$.` },
        { q: R`In which quadrant is $\sin\theta$ negative but $\cos\theta$ positive?`, opts: [R`first`, R`second`, R`third`, R`fourth`], a: 3, why: R`CAST: only cos is positive in the fourth quadrant ($270°$ to $360°$).` },
        { q: R`What is the exact value of $\cos\frac{\pi}{4}$?`, opts: [R`$\tfrac12$`, R`$\tfrac{1}{\sqrt2}$`, R`$\tfrac{\sqrt3}{2}$`, R`$1$`], a: 1, why: R`Half a square with sides 1: hypotenuse $\sqrt2$, so $\cos 45° = \frac{1}{\sqrt2}$ (or $\frac{\sqrt2}{2}$).` },
        { type: "open", q: R`Find the exact value of $\cos\frac{5\pi}{6} + \sin\frac{7\pi}{6}$.`, marks: 2, model: mi(
          R`•1 one correct value: $\cos\frac{5\pi}{6} = -\frac{\sqrt3}{2}$ or $\sin\frac{7\pi}{6} = -\frac12$`,
          R`•2 both, and combine: $-\dfrac{\sqrt3 + 1}{2}$`) },
      ],
    },
    "trig-graph": {
      title: "Trig graphs",
      questions: [
        { q: R`What is the period of $y = 4\sin 3x°$?`, opts: [R`$4°$`, R`$120°$`, R`$1080°$`, R`$90°$`], a: 1, why: R`Period $= \frac{360°}{3} = 120°$. The 4 is the amplitude.` },
        { q: R`What are the maximum and minimum values of $y = 2\cos x - 3$?`, opts: [R`$2$ and $-2$`, R`$5$ and $1$`, R`$-1$ and $-5$`, R`$-3$ and $-5$`], a: 2, why: R`$\cos x$ runs from $-1$ to $1$, so $2\cos x$ runs from $-2$ to $2$, and subtracting 3 gives $-5$ to $-1$.` },
        { q: R`Where is the first maximum of $y = \sin(x - 60)°$ for $x \ge 0$?`, opts: [R`$x = 30$`, R`$x = 90$`, R`$x = 150$`, R`$x = 60$`], a: 2, why: R`$\sin\theta$ peaks when $\theta = 90°$, so $x - 60 = 90$ and $x = 150$. The graph has moved 60 to the right.` },
        { q: R`What is the amplitude of $y = -5\cos 2x$?`, opts: [R`$-5$`, R`$5$`, R`$10$`, R`$2$`], a: 1, why: R`Amplitude is a height, so it is positive: $|-5| = 5$. The minus sign flips the graph.` },
        { type: "open", q: R`The graph of $y = a\sin bx° + c$ has a maximum value of 7 and a minimum value of 1, and it completes two full waves between $x = 0$ and $x = 360$. Find $a$, $b$ and $c$ (with $a \gt 0$).`, marks: 3, model: mi(
          R`•1 $c = \frac{7 + 1}{2} = 4$`,
          R`•2 $a = 7 - 4 = 3$`,
          R`•3 $b = 2$`) },
      ],
    },
    "trig-eq": {
      title: "Trig equations",
      questions: [
        { q: R`Solve $\sin x° = -\tfrac12$ for $0 \le x \lt 360$.`, opts: [R`$x = 30,\ 150$`, R`$x = 210,\ 330$`, R`$x = 150,\ 210$`, R`$x = 240,\ 300$`], a: 1, why: R`Acute angle $30°$. Sin is negative in the third and fourth quadrants: $180 + 30 = 210$ and $360 - 30 = 330$.` },
        { q: R`Solve $\tan x = \sqrt3$ for $0 \le x \lt 2\pi$.`, opts: [R`$\tfrac{\pi}{3},\ \tfrac{2\pi}{3}$`, R`$\tfrac{\pi}{6},\ \tfrac{7\pi}{6}$`, R`$\tfrac{\pi}{3},\ \tfrac{4\pi}{3}$`, R`$\tfrac{\pi}{3}$ only`], a: 2, why: R`$\tan\frac{\pi}{3} = \sqrt3$. Tan is positive in the first and third quadrants: $\frac{\pi}{3}$ and $\pi + \frac{\pi}{3} = \frac{4\pi}{3}$.` },
        { q: R`How many solutions does $\sin 3x° = 0.4$ have for $0 \le x \lt 360$?`, opts: [R`$2$`, R`$3$`, R`$4$`, R`$6$`], a: 3, why: R`$3x$ runs through three full turns ($0$ to $1080°$), and there are two solutions in each turn.` },
        { q: R`What is the first step in solving $2\sin^2 x - \sin x = 0$?`, opts: [R`Divide both sides by $\sin x$.`, R`Factorise: $\sin x(2\sin x - 1) = 0$.`, R`Use the quadratic formula with $c = 1$.`, R`Replace $\sin^2 x$ with $\sin 2x$.`], a: 1, why: R`Take out the common factor. Dividing by $\sin x$ would throw away the solutions of $\sin x = 0$.` },
        { q: R`Factorising a trig equation gives $(\cos x + 2)(2\cos x - 1) = 0$. What follows from the first factor?`, opts: [R`$x = 120°$`, R`$\cos x = -2$ has no solutions`, R`$x = 180°$`, R`$x = -2$`], a: 1, why: R`Cosine is always between $-1$ and $1$, so $\cos x = -2$ is impossible. Say so in your answer, then solve $\cos x = \tfrac12$.` },
        { type: "open", q: R`Solve $3\cos 2x° + \cos x° + 2 = 0$ for $0 \le x \lt 360$.`, marks: 5, model: mi(
          R`•1 substitute $\cos 2x° = 2\cos^2 x° - 1$`,
          R`•2 standard quadratic form: $6\cos^2 x° + \cos x° - 1 = 0$`,
          R`•3 factorise: $(3\cos x° - 1)(2\cos x° + 1) = 0$`,
          R`•4 $\cos x° = \tfrac13 \Rightarrow x = 70.5,\ 289.5$`,
          R`•5 $\cos x° = -\tfrac12 \Rightarrow x = 120,\ 240$`) },
      ],
    },
    "trig-formulae": {
      title: "Addition and double angle formulae",
      questions: [
        { q: R`A pupil solves $\cos 2x° + \cos x° = 0$ for $0 \le x \lt 360$. Which line contains the error? (A) $2\cos^2 x° + \cos x° - 1 = 0$ (B) $(2\cos x° - 1)(\cos x° + 1) = 0$ (C) $\cos x° = \tfrac12$ or $\cos x° = -1$ (D) $x = 60,\ 300$`, opts: [R`(A)`, R`(B)`, R`(C)`, R`(D)`], a: 3, why: R`Lines A to C are right. But $\cos x° = -1$ also has a solution, $x = 180$, which (D) has lost. The full answer is $x = 60,\ 180,\ 300$.` },
        { q: R`Expand $\cos(x + 60°)$.`, opts: [R`$\tfrac12\cos x + \tfrac{\sqrt3}{2}\sin x$`, R`$\tfrac12\cos x - \tfrac{\sqrt3}{2}\sin x$`, R`$\cos x + \tfrac12$`, R`$\tfrac{\sqrt3}{2}\cos x - \tfrac12\sin x$`], a: 1, why: R`$\cos(A + B) = \cos A\cos B - \sin A\sin B$, with $\cos 60° = \tfrac12$ and $\sin 60° = \tfrac{\sqrt3}{2}$. Note the minus sign for $\cos$ of a sum.` },
        { q: R`$A$ is acute and $\sin A = \tfrac{5}{13}$. What is $\sin 2A$?`, opts: [R`$\tfrac{10}{13}$`, R`$\tfrac{60}{169}$`, R`$\tfrac{120}{169}$`, R`$\tfrac{119}{169}$`], a: 2, why: R`$\cos A = \tfrac{12}{13}$ (5–12–13 triangle), so $\sin 2A = 2 \times \tfrac{5}{13} \times \tfrac{12}{13} = \tfrac{120}{169}$.` },
        { q: R`$\cos^2 x - \sin^2 x$ is equal to…`, opts: [R`$1$`, R`$\cos 2x$`, R`$\sin 2x$`, R`$-1$`], a: 1, why: R`It is one of the three forms of $\cos 2x$. (It is $\cos^2 x + \sin^2 x$ that equals 1.)` },
        { q: R`Simplify $\sin 3x\cos x - \cos 3x\sin x$.`, opts: [R`$\sin 4x$`, R`$\sin 2x$`, R`$\cos 2x$`, R`$\sin 3x$`], a: 1, why: R`This is $\sin(A - B)$ with $A = 3x$, $B = x$: $\sin(3x - x) = \sin 2x$. Spotting a formula in reverse is a common exam step.` },
        { q: R`What is the exact value of $\cos 15°$?`, opts: [R`$\tfrac{\sqrt6 - \sqrt2}{4}$`, R`$\tfrac{\sqrt6 + \sqrt2}{4}$`, R`$\tfrac{\sqrt3 - 1}{2}$`, R`$\tfrac{1}{4}$`], a: 1, why: R`$\cos(45° - 30°) = \cos 45°\cos 30° + \sin 45°\sin 30° = \tfrac{1}{\sqrt2}\cdot\tfrac{\sqrt3}{2} + \tfrac{1}{\sqrt2}\cdot\tfrac12 = \tfrac{\sqrt3 + 1}{2\sqrt2} = \tfrac{\sqrt6 + \sqrt2}{4}$.` },
        { type: "open", q: R`Show that $(\sin x + \cos x)^2 = 1 + \sin 2x$.`, marks: 3, model: mi(
          R`•1 expand: $\sin^2 x + 2\sin x\cos x + \cos^2 x$`,
          R`•2 use $\sin^2 x + \cos^2 x = 1$`,
          R`•3 use $2\sin x\cos x = \sin 2x$ to reach $1 + \sin 2x$`) },
      ],
    },
    "trig-wave": {
      title: "The wave function",
      questions: [
        { q: R`$2\cos x + 2\sin x = k\cos(x - \alpha)$. What is $k$?`, opts: [R`$4$`, R`$2$`, R`$2\sqrt2$`, R`$8$`], a: 2, why: R`$k = \sqrt{2^2 + 2^2} = \sqrt8 = 2\sqrt2$.` },
        { q: R`$k\cos\alpha = -3$ and $k\sin\alpha = 4$, with $0° \le \alpha \lt 360°$. What is $\alpha$?`, opts: [R`$53.1°$`, R`$126.9°$`, R`$233.1°$`, R`$306.9°$`], a: 1, why: R`$\sin\alpha$ positive, $\cos\alpha$ negative: second quadrant. $\tan^{-1}\tfrac43 = 53.1°$, so $\alpha = 180° - 53.1° = 126.9°$.` },
        { q: R`What is the maximum value of $5\sin x - 12\cos x$?`, opts: [R`$5$`, R`$12$`, R`$13$`, R`$17$`], a: 2, why: R`It can be written as $13\sin(x - \alpha)$ with $13 = \sqrt{25 + 144}$, and the maximum of a wave of amplitude 13 is 13.` },
        { q: R`$\sqrt3\sin x + \cos x = 2\sin(x + \alpha)$. What is $\alpha$?`, opts: [R`$30°$`, R`$60°$`, R`$45°$`, R`$120°$`], a: 0, why: R`$2\sin(x + \alpha) = 2\sin x\cos\alpha + 2\cos x\sin\alpha$, so $2\cos\alpha = \sqrt3$ and $2\sin\alpha = 1$: $\alpha = 30°$.` },
        { type: "open", q: R`Express $3\cos x° + 4\sin x°$ in the form $k\cos(x - \alpha)°$, where $k \gt 0$ and $0 \le \alpha \lt 360$. Hence state its maximum value and the value of $x$, $0 \le x \lt 360$, at which it occurs.`, marks: 5, model: mi(
          R`•1 expand: $k\cos x°\cos\alpha° + k\sin x°\sin\alpha°$`,
          R`•2 compare coefficients: $k\cos\alpha° = 3$, $k\sin\alpha° = 4$`,
          R`•3 $k = 5$`,
          R`•4 $\tan\alpha° = \tfrac43$, first quadrant, $\alpha = 53.1$`,
          R`•5 maximum $5$ when $x = 53.1$`) },
      ],
    },

    /* =========================== CALCULUS =========================== */
    "calc-diff": {
      title: "Differentiation",
      questions: [
        { q: R`Differentiate $6x^4 - 3x + 7$.`, opts: [R`$24x^3 - 3$`, R`$24x^3 - 3 + 7$`, R`$6x^3 - 3$`, R`$24x^4 - 3x$`], a: 0, why: R`$6 \times 4x^3 = 24x^3$; $-3x \to -3$; the constant 7 differentiates to 0.` },
        { q: R`$f(x) = \dfrac{4}{x^2}$. What is $f'(x)$?`, opts: [R`$\dfrac{8}{x}$`, R`$-\dfrac{8}{x^3}$`, R`$\dfrac{4}{2x}$`, R`$-\dfrac{4}{x^3}$`], a: 1, why: R`$f(x) = 4x^{-2}$, so $f'(x) = -8x^{-3} = -\frac{8}{x^3}$.` },
        { q: R`What is the derivative of $\sqrt{x}$?`, opts: [R`$\tfrac12\sqrt{x}$`, R`$\dfrac{1}{2\sqrt{x}}$`, R`$\dfrac{2}{\sqrt{x}}$`, R`$\tfrac32x^{\frac32}$`], a: 1, why: R`$x^{\frac12} \to \tfrac12x^{-\frac12} = \frac{1}{2\sqrt{x}}$.` },
        { q: R`What is $\dfrac{d}{dx}(3\cos x)$?`, opts: [R`$3\sin x$`, R`$-3\sin x$`, R`$-3\cos x$`, R`$3\cos x$`], a: 1, why: R`$\frac{d}{dx}\cos x = -\sin x$, so $3\cos x \to -3\sin x$.` },
        { q: R`$f(x) = (x + 3)^2$. What is $f'(1)$?`, opts: [R`$16$`, R`$8$`, R`$2$`, R`$4$`], a: 1, why: R`$f(x) = x^2 + 6x + 9$, so $f'(x) = 2x + 6$ and $f'(1) = 8$. (The chain rule gives $2(x + 3)$, the same.)` },
        { type: "open", q: R`Differentiate $y = \dfrac{x^2 - 4}{\sqrt{x}}$, $x \gt 0$.`, marks: 3, model: mi(
          R`•1 write as powers: $x^{\frac32} - 4x^{-\frac12}$`,
          R`•2 differentiate one term correctly`,
          R`•3 $\dfrac{dy}{dx} = \tfrac32x^{\frac12} + 2x^{-\frac32}$`) },
      ],
    },
    "calc-chain": {
      title: "The chain rule",
      questions: [
        { q: R`Differentiate $(2x + 5)^4$.`, opts: [R`$4(2x + 5)^3$`, R`$8(2x + 5)^3$`, R`$8x(2x + 5)^3$`, R`$(2x + 5)^3$`], a: 1, why: R`Outside: $4(2x + 5)^3$. Inside: $2x + 5$ differentiates to 2. Multiply: $8(2x + 5)^3$.` },
        { q: R`What is $\dfrac{d}{dx}\sin 4x$?`, opts: [R`$\cos 4x$`, R`$4\cos 4x$`, R`$-4\cos 4x$`, R`$\tfrac14\cos 4x$`], a: 1, why: R`$\frac{d}{dx}\sin ax = a\cos ax$ (on the formulae list).` },
        { q: R`Differentiate $\sqrt{1 - 3x}$.`, opts: [R`$\dfrac{1}{2\sqrt{1 - 3x}}$`, R`$-\dfrac{3}{2\sqrt{1 - 3x}}$`, R`$-\dfrac{3}{\sqrt{1 - 3x}}$`, R`$\tfrac12(1 - 3x)^{-\frac12}$`], a: 1, why: R`$(1 - 3x)^{\frac12} \to \tfrac12(1 - 3x)^{-\frac12} \times (-3)$.` },
        { q: R`What is $\dfrac{d}{dx}\sin^2 x$?`, opts: [R`$2\sin x$`, R`$\cos^2 x$`, R`$2\sin x\cos x$`, R`$2\cos x$`], a: 2, why: R`$(\sin x)^2 \to 2\sin x \times \cos x$. (This also equals $\sin 2x$.)` },
        { type: "open", q: R`$f(x) = \dfrac{1}{(3x - 2)^2}$. Find $f'(1)$.`, marks: 3, model: mi(
          R`•1 write as $(3x - 2)^{-2}$ and start to differentiate: $-2(3x - 2)^{-3}$`,
          R`•2 multiply by the inside derivative: $\times 3$, so $f'(x) = -6(3x - 2)^{-3}$`,
          R`•3 $f'(1) = -6$`) },
      ],
    },
    "calc-tangent": {
      title: "Tangents and increasing functions",
      questions: [
        { q: R`What is the gradient of the tangent to $y = x^3$ at $x = -2$?`, opts: [R`$-8$`, R`$12$`, R`$-12$`, R`$-6$`], a: 1, why: R`$\frac{dy}{dx} = 3x^2 = 3 \times 4 = 12$. The square makes it positive.` },
        { q: R`What is the equation of the tangent to $y = 2x^2 - 5$ at $(1, -3)$?`, opts: [R`$y = 4x - 7$`, R`$y = 4x - 3$`, R`$y = 2x - 5$`, R`$y = 4x + 1$`], a: 0, why: R`$\frac{dy}{dx} = 4x$, so $m = 4$. $y + 3 = 4(x - 1)$ gives $y = 4x - 7$.` },
        { q: R`A function is strictly increasing where…`, opts: [R`$f(x) \gt 0$`, R`$f'(x) = 0$`, R`$f'(x) \gt 0$`, R`$f'(x) \lt 0$`], a: 2, why: R`Increasing means a positive gradient. ($f(x) \gt 0$ only says the graph is above the axis.)` },
        { q: R`For which $x$ is $f(x) = x^2 - 6x$ strictly increasing?`, opts: [R`$x \gt 3$`, R`$x \lt 3$`, R`$x \gt 6$`, R`$0 \lt x \lt 6$`], a: 0, why: R`$f'(x) = 2x - 6 \gt 0$ when $x \gt 3$.` },
        { type: "open", q: R`Find the equation of the tangent to $y = 3x^3 - 2x + 1$ at the point where $x = -1$.`, marks: 4, model: mi(
          R`•1 $y = -3 + 2 + 1 = 0$, so the point is $(-1, 0)$`,
          R`•2 $\dfrac{dy}{dx} = 9x^2 - 2$`,
          R`•3 $m = 9 - 2 = 7$`,
          R`•4 $y - 0 = 7(x + 1)$, i.e. $y = 7x + 7$`) },
        { type: "open", q: R`Find the values of $x$ for which $f(x) = x^3 - 6x^2 + 9x$ is strictly decreasing.`, marks: 3, model: mi(
          R`•1 $f'(x) = 3x^2 - 12x + 9$ and state $f'(x) \lt 0$`,
          R`•2 factorise: $3(x - 1)(x - 3) \lt 0$`,
          R`•3 $1 \lt x \lt 3$`) },
      ],
    },
    "calc-stat": {
      title: "Stationary points and sketching",
      questions: [
        { q: R`Stationary points of $y = f(x)$ occur where…`, opts: [R`$f(x) = 0$`, R`$f'(x) = 0$`, R`$x = 0$`, R`$f'(x) \gt 0$`], a: 1, why: R`Stationary means zero gradient. $f(x) = 0$ gives the roots instead.` },
        { q: R`In a nature table the signs of $\frac{dy}{dx}$ are $+\ 0\ -$. The stationary point is…`, opts: [R`a minimum turning point`, R`a maximum turning point`, R`a rising point of inflection`, R`a falling point of inflection`], a: 1, why: R`Rising, flat, then falling: the top of a hill.` },
        { q: R`At which values of $x$ does $y = x^3 - 12x$ have stationary points?`, opts: [R`$x = 0$ and $x = 12$`, R`$x = \pm 2$`, R`$x = \pm 2\sqrt3$`, R`$x = 4$ only`], a: 1, why: R`$3x^2 - 12 = 0 \Rightarrow x^2 = 4 \Rightarrow x = \pm 2$. ($\pm 2\sqrt3$ are the roots of $y$ itself.)` },
        { q: R`A cubic $y = f(x)$ with a positive $x^3$ coefficient has a maximum at $x = -1$ and a minimum at $x = 2$. The graph of $y = f'(x)$ is…`, opts: [R`a cubic through $-1$ and $2$`, R`a $\cup$-shaped parabola crossing the $x$-axis at $-1$ and $2$`, R`a $\cap$-shaped parabola crossing the $x$-axis at $-1$ and $2$`, R`a straight line through $-1$ and $2$`], a: 1, why: R`$f'$ is zero at the stationary points, positive before $-1$ and after $2$, negative between: a $\cup$-shaped parabola.` },
        { q: R`As $x \to -\infty$, what happens to $y = 2x^3 - x^4$?`, opts: [R`$y \to +\infty$`, R`$y \to -\infty$`, R`$y \to 0$`, R`$y \to 2$`], a: 1, why: R`The highest power, $-x^4$, dominates, and $-x^4$ is large and negative for large $|x|$.` },
        { type: "open", q: R`Find the stationary points of $y = 2x^3 - 3x^2 - 12x + 4$ and determine their nature.`, marks: 6, model: mi(
          R`•1 $\dfrac{dy}{dx} = 6x^2 - 6x - 12$`,
          R`•2 set $\dfrac{dy}{dx} = 0$`,
          R`•3 $6(x - 2)(x + 1) = 0 \Rightarrow x = -1,\ 2$`,
          R`•4 $y = 11$ and $y = -16$`,
          R`•5 nature table with the signs of $\dfrac{dy}{dx}$ either side`,
          R`•6 $(-1, 11)$ maximum turning point; $(2, -16)$ minimum turning point`) },
      ],
    },
    "calc-optim": {
      title: "Closed intervals and optimisation",
      questions: [
        { q: R`On a closed interval, the greatest value of a function can occur…`, opts: [R`only at a stationary point`, R`only at an endpoint`, R`at a stationary point or at an endpoint`, R`where $f(x) = 0$`], a: 2, why: R`Always check both endpoints as well as the stationary points inside the interval.` },
        { q: R`What is the greatest value of $f(x) = x^2 - 4x$ on $0 \le x \le 5$?`, opts: [R`$-4$`, R`$0$`, R`$5$`, R`$45$`], a: 2, why: R`The only stationary point is the minimum $f(2) = -4$. The endpoints give $f(0) = 0$ and $f(5) = 5$. Greatest: 5.` },
        { q: R`In the copper-box problem, $V'(x) = 0$ at $x = 3$ and $x = 10$. Why is $x = 10$ rejected?`, opts: [R`It gives a minimum.`, R`The sheet is only 15 cm wide, so $15 - 2x$ would be negative.`, R`$V(10)$ is too large.`, R`The nature table is $-\ 0\ +$.`], a: 1, why: R`Context rules first: a corner square of 10 cm cannot be cut from a 15 cm sheet. The domain is $0 \lt x \lt 7.5$.` },
        { q: R`A rectangle has perimeter 20 m, so its area is $A = x(10 - x)$. Which $x$ gives the greatest area?`, opts: [R`$x = 10$`, R`$x = 2.5$`, R`$x = 5$`, R`$x = 20$`], a: 2, why: R`$A' = 10 - 2x = 0$ when $x = 5$, and $A'$ goes $+\ 0\ -$: a maximum. The best rectangle is a square.` },
        { type: "open", q: R`The cost, in pounds, of running HMS Lodestone's dispatch boat on a voyage at speed $v$ knots is $C(v) = 200v + \dfrac{80000}{v}$, $v \gt 0$. Find the speed that minimises the cost, justify that it is a minimum, and find the least cost.`, marks: 5, model: mi(
          R`•1 $C'(v) = 200 - 80000v^{-2}$`,
          R`•2 set $C'(v) = 0$`,
          R`•3 $v^2 = 400 \Rightarrow v = 20$ knots`,
          R`•4 nature table: $v$: $\to 20^-$, $20$, $\to 20^+$; $C'(v)$: $-$, $0$, $+$; slope ↘ → ↗; so a <b>minimum</b>`,
          R`•5 $C(20) = 4000 + 4000 = £8000$`) },
      ],
    },
    "calc-int": {
      title: "Integration",
      questions: [
        { q: R`Find $\displaystyle\int 3x^2\,dx$.`, opts: [R`$6x + C$`, R`$x^3 + C$`, R`$3x^3 + C$`, R`$x^3$`], a: 1, why: R`Add one to the power and divide by it: $\frac{3x^3}{3} = x^3$. Don't forget $+\,C$.` },
        { q: R`Find $\displaystyle\int x^{-2}\,dx$.`, opts: [R`$-x^{-1} + C$`, R`$-2x^{-3} + C$`, R`$\tfrac{x^{-1}}{1} + C$`, R`$\ln x^2 + C$`], a: 0, why: R`$\frac{x^{-1}}{-1} = -x^{-1} = -\frac1x$.` },
        { q: R`Find $\displaystyle\int \cos 3x\,dx$.`, opts: [R`$3\sin 3x + C$`, R`$\tfrac13\sin 3x + C$`, R`$-\tfrac13\sin 3x + C$`, R`$\sin 3x + C$`], a: 1, why: R`$\int\cos ax\,dx = \frac1a\sin ax + C$ (formulae list).` },
        { q: R`Find $\displaystyle\int (4x - 1)^3\,dx$.`, opts: [R`$\dfrac{(4x - 1)^4}{4} + C$`, R`$\dfrac{(4x - 1)^4}{16} + C$`, R`$12(4x - 1)^2 + C$`, R`$(4x - 1)^4 + C$`], a: 1, why: R`Divide by the new power 4 and by the 4 in front of $x$: $\frac{(4x - 1)^4}{16}$.` },
        { q: R`$\dfrac{dy}{dx} = 4x^3$ and the curve passes through $(1, 3)$. What is $y$?`, opts: [R`$y = x^4 + 3$`, R`$y = x^4 + 2$`, R`$y = 12x^2 - 9$`, R`$y = 4x^4 - 1$`], a: 1, why: R`$y = x^4 + C$, and $3 = 1 + C$ gives $C = 2$.` },
        { type: "open", q: R`Find $\displaystyle\int \frac{x^3 + 2}{x^2}\,dx$, $x \ne 0$.`, marks: 3, model: mi(
          R`•1 split and write as powers: $\displaystyle\int (x + 2x^{-2})\,dx$`,
          R`•2 integrate one term correctly`,
          R`•3 $\tfrac12x^2 - 2x^{-1} + C$`) },
      ],
    },
    "calc-area": {
      title: "Definite integrals and area",
      questions: [
        { q: R`A pupil writes: "Area $= \displaystyle\int_0^5 (x^2 - 4x)\,dx = -\tfrac{25}{3}$, so the area is $\tfrac{25}{3}$." What is wrong?`, opts: [R`Nothing: drop the minus sign and say why`, R`The curve crosses the $x$-axis at $x = 4$, so the integral must be split there. The area is $\tfrac{32}{3} + \tfrac73 = 13$`, R`The answer needs $+\,C$`, R`The limits should be $0$ and $4$ only`], a: 1, why: R`Between 0 and 4 the curve is below the axis (integral $-\tfrac{32}{3}$); between 4 and 5 it is above ($+\tfrac73$). One integral lets them cancel. Split at the root and add the sizes.` },
        { q: R`Evaluate $\displaystyle\int_0^2 3x^2\,dx$.`, opts: [R`$6$`, R`$8$`, R`$12$`, R`$24$`], a: 1, why: R`$\Big[x^3\Big]_0^2 = 8 - 0 = 8$.` },
        { q: R`Evaluate $\displaystyle\int_0^{\pi} \sin x\,dx$.`, opts: [R`$0$`, R`$1$`, R`$2$`, R`$-2$`], a: 2, why: R`$\Big[-\cos x\Big]_0^{\pi} = -\cos\pi - (-\cos 0) = 1 + 1 = 2$.` },
        { q: R`For a region entirely below the $x$-axis, a definite integral gives $-6$. What is the area?`, opts: [R`$-6$ square units`, R`$6$ square units`, R`$36$ square units`, R`It cannot be found.`], a: 1, why: R`Integrals count area below the axis as negative. Areas are positive: 6 square units, and say why.` },
        { q: R`The area between an upper curve $y = f(x)$ and a lower curve $y = g(x)$ from $a$ to $b$ is…`, opts: [R`$\displaystyle\int_a^b (g(x) - f(x))\,dx$`, R`$\displaystyle\int_a^b (f(x) - g(x))\,dx$`, R`$\displaystyle\int_a^b f(x)\,dx \times \int_a^b g(x)\,dx$`, R`$\displaystyle\int_a^b (f(x) + g(x))\,dx$`], a: 1, why: R`Upper minus lower, between the limits.` },
        { q: R`Evaluate $\displaystyle\int_1^4 x^{-\frac12}\,dx$.`, opts: [R`$1$`, R`$2$`, R`$4$`, R`$\tfrac12$`], a: 1, why: R`$\Big[2x^{\frac12}\Big]_1^4 = 2 \times 2 - 2 \times 1 = 2$.` },
        { type: "open", q: R`Calculate the area enclosed by the curve $y = 4x - x^2$ and the line $y = x$.`, marks: 4, model: mi(
          R`•1 limits: $4x - x^2 = x \Rightarrow x^2 - 3x = 0 \Rightarrow x = 0,\ 3$`,
          R`•2 upper minus lower: $\displaystyle\int_0^3 (3x - x^2)\,dx$`,
          R`•3 integrate: $\Big[\tfrac32x^2 - \tfrac13x^3\Big]_0^3$`,
          R`•4 $= \tfrac{27}{2} - 9 = \tfrac92$ square units`) },
      ],
    },

    /* =========================== EXAM DRILL =========================== */
    "exam-p1": {
      title: "Mini Paper 1 (non-calculator)",
      questions: [
        { type: "open", q: R`Find the equation of the line through $(2, -1)$ perpendicular to the line $3x + 2y = 7$.`, marks: 3, model: mi(
          R`•1 gradient of given line: $-\tfrac32$`,
          R`•2 perpendicular gradient: $\tfrac23$`,
          R`•3 $y + 1 = \tfrac23(x - 2)$, i.e. $2x - 3y - 7 = 0$`) },
        { type: "open", q: R`Express $2x^2 - 8x + 3$ in the form $a(x + p)^2 + q$.`, marks: 3, model: mi(
          R`•1 $a = 2$: $2(x^2 - 4x) + 3$`,
          R`•2 $p = -2$: $2[(x - 2)^2 - 4] + 3$`,
          R`•3 $q = -5$: $2(x - 2)^2 - 5$`) },
        { type: "open", q: R`$y = \sqrt{4x - 3}$. Find the value of $\dfrac{dy}{dx}$ when $x = 3$.`, marks: 3, model: mi(
          R`•1 write as $(4x - 3)^{\frac12}$ and start: $\tfrac12(4x - 3)^{-\frac12}$`,
          R`•2 chain rule: $\times 4$, so $\dfrac{dy}{dx} = 2(4x - 3)^{-\frac12}$`,
          R`•3 at $x = 3$: $\dfrac{2}{\sqrt9} = \dfrac23$`) },
        { type: "open", q: R`Evaluate $\displaystyle\int_1^2 \left(x^2 + \frac{2}{x^2}\right)dx$.`, marks: 4, model: mi(
          R`•1 write as $x^2 + 2x^{-2}$`,
          R`•2 integrate one term: $\tfrac13x^3$ or $-2x^{-1}$`,
          R`•3 complete: $\Big[\tfrac13x^3 - 2x^{-1}\Big]_1^2$`,
          R`•4 $\left(\tfrac83 - 1\right) - \left(\tfrac13 - 2\right) = \tfrac53 + \tfrac53 = \tfrac{10}{3}$`) },
        { type: "open", q: R`Solve $\log_2 x + \log_2(x - 2) = 3$, where $x \gt 2$.`, marks: 4, model: mi(
          R`•1 combine: $\log_2\big(x(x - 2)\big) = 3$`,
          R`•2 exponential form: $x(x - 2) = 8$`,
          R`•3 $x^2 - 2x - 8 = 0 \Rightarrow (x - 4)(x + 2) = 0$`,
          R`•4 $x = 4$ (reject $-2$, since $x \gt 2$)`) },
        { type: "open", q: R`The point $P(5, 1)$ lies on the circle $x^2 + y^2 - 4x + 6y - 12 = 0$. Find the equation of the tangent at $P$.`, marks: 4, model: mi(
          R`•1 centre $(2, -3)$`,
          R`•2 gradient of radius $\tfrac{1 - (-3)}{5 - 2} = \tfrac43$`,
          R`•3 gradient of tangent $-\tfrac34$`,
          R`•4 $y - 1 = -\tfrac34(x - 5)$, i.e. $3x + 4y - 19 = 0$`) },
        { type: "open", q: R`Solve $2\sin^2 x - \sin x - 1 = 0$ for $0 \le x \lt 2\pi$.`, marks: 4, model: mi(
          R`•1 factorise: $(2\sin x + 1)(\sin x - 1) = 0$`,
          R`•2 $\sin x = -\tfrac12$ or $\sin x = 1$`,
          R`•3 $\sin x = -\tfrac12$: $x = \tfrac{7\pi}{6},\ \tfrac{11\pi}{6}$`,
          R`•4 $\sin x = 1$: $x = \tfrac{\pi}{2}$`) },
        { type: "open", q: R`A sequence is defined by $u_{n+1} = \tfrac13u_n + 10$. (a) Explain why the sequence has a limit. (b) Find the limit.`, marks: 3, model: mi(
          R`•1 a limit exists because $-1 \lt \tfrac13 \lt 1$`,
          R`•2 $L = \tfrac13L + 10$ or $L = \dfrac{10}{1 - \frac13}$`,
          R`•3 $L = 15$`) },
        { type: "open", q: R`Show that the points $A(1, 3, -2)$, $B(2, 0, 1)$ and $C(5, -9, 10)$ are collinear.`, marks: 3, model: mi(
          R`•1 $\overrightarrow{AB} = \begin{pmatrix}1\\-3\\3\end{pmatrix}$`,
          R`•2 $\overrightarrow{BC} = \begin{pmatrix}3\\-9\\9\end{pmatrix}$, so $\overrightarrow{BC} = 3\overrightarrow{AB}$`,
          R`•3 $AB$ and $BC$ are parallel, $B$ is a common point, so $A$, $B$ and $C$ are collinear (all three statements needed for this mark)`) },
      ],
    },
    "exam-p2": {
      title: "Mini Paper 2 (calculator)",
      questions: [
        { type: "open", q: R`Express $2\cos x° - 5\sin x°$ in the form $k\cos(x - \alpha)°$, where $k \gt 0$ and $0 \le \alpha \lt 360$.`, marks: 4, model: mi(
          R`•1 expand: $k\cos x°\cos\alpha° + k\sin x°\sin\alpha°$`,
          R`•2 compare: $k\cos\alpha° = 2$, $k\sin\alpha° = -5$`,
          R`•3 $k = \sqrt{29}$`,
          R`•4 $\tan\alpha° = -\tfrac52$, fourth quadrant: $\alpha = 291.8$`) },
        { type: "open", q: R`Calculate the angle between $\mathbf{a} = \mathbf{i} - 2\mathbf{j} + 2\mathbf{k}$ and $\mathbf{b} = 4\mathbf{i} + 3\mathbf{k}$.`, marks: 5, model: mi(
          R`•1 $\mathbf{a}\cdot\mathbf{b} = 4 + 0 + 6 = 10$`,
          R`•2 $|\mathbf{a}| = \sqrt{1 + 4 + 4} = 3$`,
          R`•3 $|\mathbf{b}| = \sqrt{16 + 0 + 9} = 5$`,
          R`•4 $\cos\theta = \dfrac{10}{15}$`,
          R`•5 $\theta = 48.2°$`) },
        { type: "open", q: R`Find the values of $k$ for which $x^2 + (k - 3)x + k = 0$ has equal roots.`, marks: 4, model: mi(
          R`•1 use $b^2 - 4ac = 0$`,
          R`•2 $(k - 3)^2 - 4k = 0$`,
          R`•3 $k^2 - 10k + 9 = 0$`,
          R`•4 $(k - 1)(k - 9) = 0 \Rightarrow k = 1$ or $k = 9$`) },
        { type: "open", q: R`The value of a ship's chronometer is modelled by $V = 5000e^{-0.08t}$ pounds, $t$ years after purchase. After how many complete years is it first worth less than £2000?`, marks: 3, model: mi(
          R`•1 $5000e^{-0.08t} = 2000 \Rightarrow e^{-0.08t} = 0.4$`,
          R`•2 $-0.08t = \ln 0.4$`,
          R`•3 $t = \dfrac{\ln 0.4}{-0.08} = 11.45\ldots$, so after <b>12</b> complete years`) },
        { type: "open", q: R`Calculate the area enclosed by the curve $y = x^2 - 4x + 5$ and the line $y = x + 1$.`, marks: 5, model: mi(
          R`•1 equate: $x^2 - 4x + 5 = x + 1 \Rightarrow x^2 - 5x + 4 = 0$`,
          R`•2 limits $x = 1$ and $x = 4$`,
          R`•3 upper minus lower: $\displaystyle\int_1^4 (-x^2 + 5x - 4)\,dx$`,
          R`•4 integrate: $\Big[-\tfrac13x^3 + \tfrac52x^2 - 4x\Big]_1^4$`,
          R`•5 $= \tfrac92$ square units`) },
        { type: "open", q: R`Find the greatest and least values of $f(x) = x^3 - 6x^2 + 9x + 1$ on the interval $0 \le x \le 5$.`, marks: 5, model: mi(
          R`•1 $f'(x) = 3x^2 - 12x + 9$`,
          R`•2 set $f'(x) = 0$`,
          R`•3 $3(x - 1)(x - 3) = 0 \Rightarrow x = 1,\ 3$`,
          R`•4 evaluate at the stationary points and the endpoints: $f(1) = 5$, $f(3) = 1$, $f(0) = 1$, $f(5) = 21$`,
          R`•5 greatest $21$, least $1$`) },
        { type: "open", q: R`The graph of $\ln y$ against $\ln x$ is a straight line through $(1,\ 2.5)$ and $(3,\ 6.5)$. Find $a$ and $b$ such that $y = ax^b$.`, marks: 4, model: mi(
          R`•1 gradient $= \dfrac{6.5 - 2.5}{3 - 1} = 2$`,
          R`•2 intercept: $2.5 = 2(1) + c \Rightarrow c = 0.5$`,
          R`•3 $\ln y = 2\ln x + 0.5$; compare with $\ln y = b\ln x + \ln a$: $b = 2$`,
          R`•4 $\ln a = 0.5 \Rightarrow a = e^{0.5} = 1.65$`) },
      ],
    },
  };
})();
