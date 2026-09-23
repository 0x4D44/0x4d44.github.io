/* Inside Formula One Grand Prix — shared navigation.
   Builds the contents rail, the in-page section list, the prev/next pager and the
   theme toggle from one chapter list, so every page stays in step. */
(function () {
  "use strict";
  var PARTS = [
    { name: "Part I — The original", chapters: [
      ["01-machine.html", "01", "The machine"],
      ["02-tracks.html", "02", "Circuits in a file"],
      ["03-field.html", "03", "Twenty-six cars"],
      ["04-race-control.html", "04", "Race control"],
      ["05-rendering.html", "05", "Drawing the world"],
      ["06-sound.html", "06", "Sound"],
      ["07-menus-files.html", "07", "Menus, files and saves"],
      ["08-link.html", "08", "Two machines, one race"]
    ]},
    { name: "Part II — The port", chapters: [
      ["09-story.html", "09", "Twenty-four days"],
      ["10-method.html", "10", "The oracle"],
      ["11-field-notes.html", "11", "Field notes"],
      ["12-big-race.html", "12", "What Big Race adds"]
    ]}
  ];
  var flat = [["index.html", "00", "Cover"]];
  PARTS.forEach(function (p) { p.chapters.forEach(function (c) { flat.push(c); }); });

  var here = location.pathname.split("/").pop() || "index.html";
  var idx = flat.findIndex(function (c) { return c[0] === here; });

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }

  // Anchors on h2/h3 that carry an id.
  var main = document.querySelector("main.chapter");
  var heads = main ? main.querySelectorAll("h2[id], h3[id]") : [];
  heads.forEach(function (h) {
    var a = el("a", { class: "anchor", href: "#" + h.id, "aria-label": "Link to this section" }, "#");
    h.appendChild(a);
  });

  // Contents rail.
  var navEl = document.querySelector("nav.toc");
  var toc = null;
  if (navEl) {
    // A collapsible panel on narrow screens; always open beside the text on wide ones.
    var details = el("details");
    details.appendChild(el("summary", null, "Contents"));
    toc = el("div");
    details.appendChild(toc);
    navEl.appendChild(details);
    var wide = matchMedia("(min-width: 901px)");
    var sync = function () { details.open = wide.matches || here === "index.html"; };
    sync();
    if (wide.addEventListener) wide.addEventListener("change", sync);
  }
  if (toc) {
    var cover = el("ol");
    var cli = el("li"); var ca = el("a", { href: "index.html" });
    ca.appendChild(el("span", { class: "num" }, "00")); ca.appendChild(el("span", null, "Cover and contents"));
    if (here === "index.html") ca.setAttribute("aria-current", "page");
    cli.appendChild(ca); cover.appendChild(cli); toc.appendChild(cover);
    PARTS.forEach(function (p) {
      toc.appendChild(el("h2", null, p.name));
      var ol = el("ol");
      p.chapters.forEach(function (c) {
        var li = el("li"); var a = el("a", { href: c[0] });
        a.appendChild(el("span", { class: "num" }, c[1])); a.appendChild(el("span", null, c[2]));
        if (c[0] === here) {
          a.setAttribute("aria-current", "page");
          var h2s = main ? main.querySelectorAll("h2[id]") : [];
          if (h2s.length) {
            var sub = el("ol", { class: "sections" });
            h2s.forEach(function (h) {
              var sli = el("li");
              sli.appendChild(el("a", { href: "#" + h.id }, h.firstChild ? h.firstChild.textContent : h.id));
              sub.appendChild(sli);
            });
            li.appendChild(a); li.appendChild(sub); ol.appendChild(li); return;
          }
        }
        li.appendChild(a); ol.appendChild(li);
      });
      toc.appendChild(ol);
    });
  }

  // Prev / next pager.
  if (main && idx >= 0) {
    var pager = el("nav", { class: "pager", "aria-label": "Chapters" });
    if (idx > 0) {
      var p = flat[idx - 1]; var pa = el("a", { href: p[0], class: "prev" });
      pa.appendChild(el("small", null, "Previous")); pa.appendChild(document.createTextNode((p[1] === "00" ? "" : p[1] + " · ") + p[2]));
      pager.appendChild(pa);
    }
    if (idx < flat.length - 1) {
      var n = flat[idx + 1]; var na = el("a", { href: n[0], class: "next" });
      na.appendChild(el("small", null, "Next")); na.appendChild(document.createTextNode(n[1] + " · " + n[2]));
      pager.appendChild(na);
    }
    main.appendChild(pager);
  }

  // Theme toggle (remembered per browser; the page works without storage).
  var btn = document.querySelector("[data-theme-toggle]");
  function stored() { try { return localStorage.getItem("f1gp-internals.theme"); } catch (e) { return null; } }
  function apply(t) { if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme"); }
  apply(stored());
  if (btn) {
    btn.addEventListener("click", function () {
      var dark = document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
      var next = dark ? "light" : "dark";
      apply(next);
      try { localStorage.setItem("f1gp-internals.theme", next); } catch (e) { /* storage unavailable */ }
    });
  }
})();
