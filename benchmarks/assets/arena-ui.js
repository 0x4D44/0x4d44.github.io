// FABLE ARENA — shared UI: nav, footer, typing, count-up helpers
window.ArenaUI = (() => {
  const PAGES = [
    { file: "index.html",               num: "00", title: "INDEX" },
    { file: "01 The Photo Finish.html", num: "01", title: "THE PHOTO FINISH" },
    { file: "02 The Token Economy.html", num: "02", title: "THE TOKEN ECONOMY" },
    { file: "03 The Rollercoaster.html", num: "03", title: "THE ROLLERCOASTER" },
    { file: "04 The Meaning.html",      num: "04", title: "THE MEANING" }
  ];

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function mountChrome(currentNum) {
    // overlays
    const sl = document.createElement("div"); sl.className = "scanlines";
    const vg = document.createElement("div"); vg.className = "vignette";
    document.body.appendChild(sl); document.body.appendChild(vg);

    // nav
    const nav = document.createElement("nav");
    nav.className = "arena-nav";
    let html = '<a class="brand" href="index.html">FABLE ARENA</a>';
    for (const p of PAGES) {
      const cur = p.num === currentNum ? " current" : "";
      html += '<a class="chap' + cur + '" href="' + p.file + '">' + p.num + " " + p.title + "</a>";
    }
    nav.innerHTML = html;

    // phosphor toggle (green <-> amber), persisted in localStorage
    const themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.className = "theme-toggle";
    const curTheme = () => (document.documentElement.dataset.theme === "amber" ? "amber" : "green");
    function paintThemeBtn() {
      themeBtn.textContent = "PHOSPHOR: " + curTheme().toUpperCase();
      themeBtn.setAttribute("aria-label", "Toggle phosphor colour (currently " + curTheme() + ")");
    }
    themeBtn.addEventListener("click", () => {
      const next = curTheme() === "amber" ? "green" : "amber";
      if (next === "amber") document.documentElement.dataset.theme = "amber";
      else delete document.documentElement.dataset.theme;
      try { localStorage.setItem("arena.theme", next); } catch (e) { /* ignore */ }
      paintThemeBtn();
    });
    paintThemeBtn();
    nav.appendChild(themeBtn);

    const wrap = document.querySelector(".wrap");
    wrap.insertBefore(nav, wrap.firstChild);

    // footer
    const idx = PAGES.findIndex((p) => p.num === currentNum);
    const prev = PAGES[idx - 1], next = PAGES[idx + 1];
    const foot = document.createElement("div");
    foot.className = "footer-nav";
    foot.innerHTML =
      (prev ? '<a href="' + prev.file + '">&#8592; ' + prev.num + " " + prev.title + "</a>" : "<span></span>") +
      '<span class="colophon">FABLE ARENA &middot; 1,761 graded runs &middot; graded mechanically, audited adversarially &middot; 2026-06-10</span>' +
      (next ? '<a href="' + next.file + '">' + next.num + " " + next.title + " &#8594;</a>" : "<span></span>");
    wrap.appendChild(foot);
  }

  // Type lines of text into a <pre>-like element, one character cluster at a time
  function typeLines(el, lines, opts, doneCb) {
    opts = opts || {};
    const charDelay = opts.charDelay || 6;
    const lineDelay = opts.lineDelay || 110;
    if (reduced) {
      el.textContent = lines.join("\n");
      if (doneCb) doneCb();
      return;
    }
    el.textContent = "";
    let li = 0;
    function nextLine() {
      if (li >= lines.length) { if (doneCb) doneCb(); return; }
      const line = lines[li++];
      let ci = 0;
      function tick() {
        // type 2 chars per tick for speed
        ci = Math.min(line.length, ci + 2);
        el.textContent = el.textContent.replace(/\u2588$/, "") + line.slice(Math.max(0, ci - 2), ci) + "\u2588";
        if (ci < line.length) { setTimeout(tick, charDelay); }
        else {
          el.textContent = el.textContent.replace(/\u2588$/, "") + "\n";
          setTimeout(nextLine, lineDelay);
        }
      }
      tick();
    }
    nextLine();
  }

  // Animate a number counting up inside el
  function countUp(el, target, opts) {
    opts = opts || {};
    const dur = opts.dur || 1400;
    const dec = opts.dec || 0;
    const fmt = (v) => v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (reduced) { el.textContent = (opts.prefix || "") + fmt(target) + (opts.suffix || ""); return; }
    const t0 = performance.now();
    function frame(t) {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = (opts.prefix || "") + fmt(target * eased) + (opts.suffix || "");
      if (k < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // Run callback when element first scrolls into view
  function onVisible(el, cb) {
    if (!("IntersectionObserver" in window)) { cb(); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { io.disconnect(); cb(); }
      }
    }, { threshold: 0.25 });
    io.observe(el);
  }

  return { mountChrome, typeLines, countUp, onVisible, reduced, PAGES };
})();
