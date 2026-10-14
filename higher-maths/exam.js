/* Exam drill — the Paper 1 gun drill. */
(function () {
  "use strict";
  const HM = window.HM;
  const box = document.getElementById("w-drill");
  if (!box) return;
  // [question, right answer, three tempting wrong answers, one-line reason]
  const BANK = [
    ["\\frac34 - \\frac56", "-\\frac{1}{12}", "\\frac{1}{12}", "-\\frac12", "-\\frac{2}{2}", "Common denominator 12: $\\frac{9}{12} - \\frac{10}{12}$."],
    ["\\frac23 \\div \\frac49", "\\frac32", "\\frac{8}{27}", "\\frac23", "\\frac{6}{27}", "Flip and multiply: $\\frac23 \\times \\frac94$."],
    ["\\frac12 + \\frac23", "\\frac76", "\\frac35", "\\frac36", "\\frac56", "$\\frac36 + \\frac46$."],
    ["\\left(\\frac35\\right)^2", "\\frac{9}{25}", "\\frac{6}{10}", "\\frac95", "\\frac{6}{25}", "Square top and bottom."],
    ["\\frac56 \\times \\frac{3}{10}", "\\frac14", "\\frac{8}{16}", "\\frac{15}{6}", "\\frac{25}{18}", "$\\frac{15}{60} = \\frac14$."],
    ["1 - \\frac{7}{12}", "\\frac{5}{12}", "\\frac{6}{12}", "-\\frac{6}{12}", "\\frac{7}{11}", "$\\frac{12}{12} - \\frac{7}{12}$."],
    ["\\sqrt{48}", "4\\sqrt3", "16\\sqrt3", "8\\sqrt3", "3\\sqrt4", "$\\sqrt{16 \\times 3} = 4\\sqrt3$."],
    ["\\sqrt{50} + \\sqrt{8}", "7\\sqrt2", "\\sqrt{58}", "10\\sqrt2", "7\\sqrt4", "$5\\sqrt2 + 2\\sqrt2$."],
    ["\\frac{6}{\\sqrt3}", "2\\sqrt3", "6\\sqrt3", "\\sqrt2", "3\\sqrt3", "Multiply top and bottom by $\\sqrt3$: $\\frac{6\\sqrt3}{3}$."],
    ["\\sqrt{12} \\times \\sqrt{3}", "6", "\\sqrt{15}", "36", "3\\sqrt2", "$\\sqrt{36} = 6$."],
    ["\\frac{10}{\\sqrt5}", "2\\sqrt5", "\\sqrt2", "5\\sqrt2", "10\\sqrt5", "$\\frac{10\\sqrt5}{5}$."],
    ["8^{\\frac23}", "4", "\\frac{16}{3}", "16", "2", "$(\\sqrt[3]8)^2 = 2^2$."],
    ["16^{-\\frac12}", "\\frac14", "-4", "-8", "\\frac18", "$\\frac{1}{\\sqrt{16}}$."],
    ["4^{\\frac32}", "8", "6", "16", "\\frac{3}{8}", "$(\\sqrt4)^3 = 2^3$."],
    ["9^{-\\frac32}", "\\frac{1}{27}", "-27", "\\frac{1}{18}", "-\\frac{27}{2}", "$\\frac{1}{(\\sqrt9)^3}$."],
    ["x^{\\frac12} \\times x^{\\frac32}", "x^2", "x^{\\frac34}", "x^3", "2x", "Add the powers: $\\frac12 + \\frac32 = 2$."],
    ["\\log_3 81", "4", "27", "3", "\\frac{1}{4}", "$3^4 = 81$."],
    ["\\log_2 \\tfrac18", "-3", "3", "\\frac13", "-\\frac13", "$2^{-3} = \\frac18$."],
    ["\\log_5 1", "0", "1", "5", "\\text{undefined}", "$5^0 = 1$."],
    ["\\log_4 2", "\\frac12", "2", "\\frac14", "-2", "$4^{\\frac12} = 2$."],
    ["2\\log_6 3 + \\log_6 4", "2", "\\log_6 10", "\\log_6 24", "1", "$\\log_6(9 \\times 4) = \\log_6 36 = 2$."],
    ["\\sin\\frac{5\\pi}{6}", "\\frac12", "-\\frac12", "\\frac{\\sqrt3}{2}", "-\\frac{\\sqrt3}{2}", "Second quadrant, sin positive, related angle $\\frac{\\pi}{6}$."],
    ["\\cos\\frac{4\\pi}{3}", "-\\frac12", "\\frac12", "-\\frac{\\sqrt3}{2}", "\\frac{\\sqrt3}{2}", "Third quadrant, cos negative, related angle $\\frac{\\pi}{3}$."],
    ["\\tan\\frac{3\\pi}{4}", "-1", "1", "-\\sqrt3", "\\frac{1}{\\sqrt2}", "Second quadrant, tan negative, related angle $\\frac{\\pi}{4}$."],
    ["\\cos 330°", "\\frac{\\sqrt3}{2}", "-\\frac{\\sqrt3}{2}", "\\frac12", "-\\frac12", "Fourth quadrant, cos positive, related angle $30°$."],
    ["\\sin 240°", "-\\frac{\\sqrt3}{2}", "\\frac{\\sqrt3}{2}", "-\\frac12", "\\frac12", "Third quadrant, sin negative, related angle $60°$."],
    ["\\cos\\frac{\\pi}{2}", "0", "1", "-1", "\\frac12", "The point at $90°$ on the unit circle is $(0, 1)$."],
    ["\\sin\\frac{7\\pi}{4}", "-\\frac{1}{\\sqrt2}", "\\frac{1}{\\sqrt2}", "-1", "-\\frac{\\sqrt3}{2}", "Fourth quadrant, sin negative, related angle $\\frac{\\pi}{4}$."],
    ["(-2)^3 - 3(-2)^2", "-20", "4", "-4", "28", "$-8 - 3 \\times 4$."],
    ["-3^2", "-9", "9", "-6", "6", "The power acts before the minus: $-(3^2)$."],
    ["(-3)^2 - 2(-3)", "15", "3", "-3", "-15", "$9 + 6$."],
    ["4 - (-5) \\times 2", "14", "-6", "18", "-2", "$4 + 10$."],
  ];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const stage = HM.el("div", { "aria-live": "polite" });
  const start = HM.el("button", { class: "btn small primary", type: "button" }, "▶ Start the drill");
  box.append(HM.el("div", { class: "btn-row" }, start), stage);
  let round = [], i = 0, right = 0, t0 = 0;
  start.addEventListener("click", () => { round = shuffle(BANK.slice()).slice(0, 10); i = 0; right = 0; t0 = Date.now(); start.textContent = "↺ New drill"; ask(); });
  function ask() {
    if (i >= round.length) {
      const s = Math.round((Date.now() - t0) / 1000);
      stage.innerHTML = `<p class="readout" style="font-family:var(--font-body)">${right} out of 10 in ${Math.floor(s / 60)} min ${s % 60} s. ${right === 10 ? "Flawless gunnery." : right >= 8 ? "A crack crew." : "Drill again: these must be automatic."}</p>`;
      return;
    }
    const [q, ans, ...rest] = round[i];
    const why = rest.pop();
    const opts = shuffle([ans, ...rest]);
    stage.innerHTML = "";
    const stem = HM.el("p", { class: "q-stem", html: `Round ${i + 1} of 10: what is $${q}$?` });
    const grid = HM.el("div", { class: "q-opts", role: "group", "aria-label": "Answers" });
    const fb = HM.el("div", { class: "q-feedback" });
    const next = HM.el("button", { class: "btn small primary", type: "button", hidden: true }, i < 9 ? "Next round →" : "See your score →");
    opts.forEach((o) => {
      const b = HM.el("button", { class: "q-opt", type: "button", html: `$${o}$` });
      b.addEventListener("click", () => {
        if (b.getAttribute("aria-disabled")) return;
        grid.querySelectorAll(".q-opt").forEach((x) => x.setAttribute("aria-disabled", "true"));
        const ok = o === ans;
        if (ok) right++;
        b.classList.add(ok ? "right" : "wrong");
        if (!ok) [...grid.children].find((x) => x.dataset.v === ans).classList.add("right");
        fb.innerHTML = (ok ? "<span class='ok'>Correct.</span> " : `<span class='bad'>Not this time:</span> it is <b>$${ans}$</b>: `) + why;
        HM.math(fb);
        next.hidden = false; next.focus();
      });
      b.dataset.v = o;
      grid.append(b);
    });
    next.addEventListener("click", () => { i++; ask(); });
    stage.append(stem, grid, fb, HM.el("div", { class: "btn-row" }, next));
    HM.math(stage);
    const f = grid.querySelector(".q-opt"); if (f && i) f.focus();
  }
})();
