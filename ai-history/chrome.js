/* Shared page chrome for the AI History almanac.
   - Scroll-reveal for .reveal elements
   - Build-date stamp for [data-build]
   - Footer year
   Pure vanilla, no dependencies. */
(function () {
  "use strict";

  // Scroll reveal
  function initReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (e) { e.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (e) { io.observe(e); });
  }

  // Stamp dates
  function stamp() {
    var d = new Date();
    var y = d.getFullYear();
    document.querySelectorAll("[data-year]").forEach(function (e) { e.textContent = y; });
    document.querySelectorAll("[data-build]").forEach(function (e) {
      e.textContent = y + "." + String(d.getMonth() + 1).padStart(2, "0");
    });
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    initReveal();
    stamp();
  });

  // Small shared helper namespace for widgets
  window.ALM = {
    // map value to a phosphor color between dim and bright amber
    lerp: function (a, b, t) { return a + (b - a) * t; },
    clamp: function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
    // crisp canvas sizing for hi-dpi
    fitCanvas: function (canvas, w, h) {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    }
  };
})();
