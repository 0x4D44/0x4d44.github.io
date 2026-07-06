(function () {
  "use strict";
  const entry = {
    slug: "broadband-speed-checker",
    title: "Line Rate",
    tagline: "A private broadband speed checker: find a nearby M-Lab NDT7 server, measure WebSocket download and upload throughput, sample ping, request a GPS fix and keep every result in browser-local history. Vanilla JS with localStorage — no backend, no build step.",
    url: "https://0x4d44.github.io/broadband-speed-checker/",
    illustration: "ill-wave",
    date: "2026-07-06T12:00:00",
    year: 2026,
    tags: ["software", "engineering"],
    real: true,
  };
  window.ESSAYS = window.ESSAYS || [];
  if (!window.ESSAYS.some((item) => item && item.slug === entry.slug)) {
    window.ESSAYS.unshift(entry);
  }
})();
