/* Chapter 6 — toolkit & practice. The quizzes are wired up by kit.js; this
   adds a running score. */
(function () {
  "use strict";
  const quizzes = [...document.querySelectorAll(".quiz")];
  const h = document.querySelector("section:nth-of-type(4) h2");
  if (!h || !quizzes.length) return;
  const score = document.createElement("span");
  score.className = "chip";
  score.style.cssText = "margin-left:12px;vertical-align:middle;display:inline-flex";
  score.innerHTML = '<small>First-try score</small><span id="score">0 / ' + quizzes.length + "</span>";
  h.appendChild(score);
  let right = 0;
  quizzes.forEach((qz) => {
    let first = true;
    qz.querySelectorAll(".opts button").forEach((b) => b.addEventListener("click", () => {
      if (!first) return;
      first = false;
      if (b.hasAttribute("data-ok")) right++;
      document.getElementById("score").textContent = right + " / " + quizzes.length;
    }));
  });
})();
