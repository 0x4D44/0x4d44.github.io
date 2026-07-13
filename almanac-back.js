// ============================================================
// 0x4D44 — shared "back to the almanac" button
// ------------------------------------------------------------
// A tiny, self-contained nav aid included on every *document* page (not
// the almanac itself) via:
//
//     <script defer src="/almanac-back.js"></script>
//
// It injects one fixed "← Almanac" pill, top-left, that returns to the
// catalog at "/". The button lives in a shadow root so its styles are
// fully isolated from — and cannot leak into — the host page, whatever
// that page's own CSS or framework is. Change the look here, once, and
// every page updates.
// ============================================================
(function () {
  "use strict";

  // Never inject on the almanac index itself (it renders the catalog), or
  // twice on the same page.
  if (window.ESSAYS && document.getElementById("listing")) return;
  if (document.getElementById("almanac-back-host")) return;

  function mount() {
    // Re-check the almanac guard here too: a self-rebuilding page could, in
    // principle, add #listing later — but a document page won't.
    if (window.ESSAYS && document.getElementById("listing")) return;
    if (document.getElementById("almanac-back-host")) return;
    var host = document.createElement("div");
    host.id = "almanac-back-host";
    host.style.cssText =
      "position:fixed;top:0;left:0;z-index:2147483647;" +
      "padding:max(10px,env(safe-area-inset-top)) 0 0 max(10px,env(safe-area-inset-left));";

    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    root.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      'a{display:inline-flex;align-items:center;gap:7px;padding:7px 12px 7px 10px;' +
      'font:600 13px/1 ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;' +
      'letter-spacing:.04em;text-decoration:none;color:#f1e9d0;' +
      'background:rgba(20,17,9,.82);border:1px solid rgba(241,233,208,.35);' +
      'border-radius:7px;box-shadow:0 2px 12px rgba(0,0,0,.32);' +
      '-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);' +
      'cursor:pointer;transition:background .12s ease,border-color .12s ease}' +
      'a:hover{background:rgba(160,90,24,.94);border-color:transparent;color:#fff}' +
      'a:focus-visible{outline:2px solid #e8a63d;outline-offset:2px}' +
      '.x{font-size:15px;line-height:1}' +
      '@media print{a{display:none}}' +
      '@media (prefers-reduced-motion:reduce){a{transition:none}}' +
      '</style>' +
      '<a href="/" aria-label="Back to the 0x4D44 almanac" title="Back to the almanac">' +
      '<span class="x" aria-hidden="true">←</span>Almanac</a>';

    (document.body || document.documentElement).appendChild(host);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
  // Some documents bootstrap by replacing the whole <body> (or <html>) after
  // load, which discards the injected node. Listeners registered on window
  // survive that swap, so re-mount on load and whenever the document's top
  // level changes. Cheap childList observers (no subtree) — our own mount
  // appends inside <body>, so it never re-triggers these.
  window.addEventListener("load", mount);
  try {
    var remount = function () { if (!document.getElementById("almanac-back-host")) mount(); };
    new MutationObserver(remount).observe(document.documentElement, { childList: true });
    new MutationObserver(remount).observe(document, { childList: true });
  } catch (_) { /* no MutationObserver: the load/DOMContentLoaded mounts still cover most pages */ }
})();
