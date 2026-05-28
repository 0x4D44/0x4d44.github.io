// ============================================================
// 0x4D44 — interactive listing
// Vanilla JS. No framework. Handles filter/sort/layout state and
// renders the listing into #listing. State persists to localStorage.
// ============================================================

(function () {
  "use strict";

  const STATE_KEY = "0x4d44.listing.v1";
  const defaults = { filter: "all", sort: "recent", layout: "table" };

  function loadState() {
    try {
      return Object.assign({}, defaults, JSON.parse(localStorage.getItem(STATE_KEY) || "{}"));
    } catch (_) { return Object.assign({}, defaults); }
  }
  function saveState(s) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_) {}
  }

  const state = loadState();
  const essays = window.ESSAYS || [];
  // A page may carry one `tag` (string) or several via `tags` (array).
  const tagsOf = (e) => e.tags || (e.tag ? [e.tag] : []);

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (children) for (const c of [].concat(children)) {
      if (c == null) continue;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
  }

  function svgUse(symbolId) {
    const ns = "http://www.w3.org/2000/svg";
    const xlink = "http://www.w3.org/1999/xlink";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(ns, "use");
    use.setAttributeNS(xlink, "xlink:href", "#" + symbolId);
    use.setAttribute("href", "#" + symbolId);
    svg.appendChild(use);
    return svg;
  }

  // ---------- status bar ----------
  function buildStatusbar() {
    const tot = essays.length;
    const words = essays.reduce((s, e) => s + (e.words || 0), 0);
    const subjects = new Set(essays.flatMap(tagsOf)).size;
    const last = essays.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    document.getElementById("stat-tot").textContent =
      `tot=${tot}  words=${words.toLocaleString()}  subjects=${subjects}`;
    document.getElementById("stat-last").textContent =
      last ? `last=${window.fmtDate(last.date)}` : "";
    document.getElementById("build-date").textContent = window.fmtDate(new Date().toISOString().slice(0,10));
  }

  // ---------- controls ----------
  function buildControlRow(rowId, options, key) {
    const row = document.getElementById(rowId);
    row.innerHTML = "";
    options.forEach(([value, label]) => {
      const b = el("button", {
        type: "button",
        "aria-pressed": state[key] === value ? "true" : "false",
        onclick: () => {
          state[key] = value;
          saveState(state);
          render();
        },
      });
      b.textContent = label;
      row.appendChild(b);
    });
  }

  function buildControls() {
    buildControlRow(
      "filter-row",
      (window.TAGS || ["all"]).map(t => [t, "--" + t]),
      "filter"
    );
    buildControlRow(
      "sort-row",
      [
        ["recent", "date↓"],
        ["oldest", "date↑"],
        ["length", "len↓"],
        ["year", "yr↑"],
      ],
      "sort"
    );
    buildControlRow(
      "layout-row",
      [
        ["table", "--table"],
        ["grid",  "--grid"],
      ],
      "layout"
    );
  }

  // ---------- listing ----------
  function sortedFiltered() {
    let list = essays.slice();
    if (state.filter !== "all") list = list.filter(e => tagsOf(e).includes(state.filter));
    if (state.sort === "recent") list.sort((a, b) => b.date.localeCompare(a.date));
    if (state.sort === "oldest") list.sort((a, b) => a.date.localeCompare(b.date));
    if (state.sort === "length") list.sort((a, b) => (b.words || 0) - (a.words || 0));
    if (state.sort === "year")   list.sort((a, b) => a.year - b.year);
    return list;
  }

  function rowEl(essay, idx) {
    const wrapper = el("a", {
      class: "row",
      href: essay.url || "#",
      target: essay.url ? "_blank" : null,
      rel: essay.url ? "noopener" : null,
    });
    const fig = el("div", { class: "row-fig" }, [svgUse(essay.illustration || "ill-diesel")]);
    const titleBlock = el("div", { class: "row-title-block" }, [
      el("div", { class: "row-title" }, essay.title),
      el("div", { class: "row-tagline" }, essay.tagline),
      el("div", { class: "row-meta-mobile" }, [
        el("span", null, `${essay.readingMin}m`),
        el("span", null, `${(essay.words/1000).toFixed(1)}k w`),
        el("span", null, tagsOf(essay).join(" · ")),
        el("span", null, String(essay.year)),
        el("span", { class: essay.real ? "pub" : "drf" }, essay.real ? "[PUB]" : "[DRAFT]"),
      ]),
    ]);
    wrapper.appendChild(el("span", { class: "row-num" }, String(idx + 1).padStart(3, "0")));
    wrapper.appendChild(fig);
    wrapper.appendChild(titleBlock);
    wrapper.appendChild(el("span", { class: "row-tag" }, tagsOf(essay).join(" · ")));
    wrapper.appendChild(el("span", { class: "row-size" }, `${essay.readingMin}m · ${(essay.words/1000).toFixed(1)}k`));
    wrapper.appendChild(el("span", { class: "row-year" }, String(essay.year)));
    wrapper.appendChild(el("span", {
      class: "row-state " + (essay.real ? "published" : "draft")
    }, essay.real ? "[PUB]" : "[DRAFT]"));
    return wrapper;
  }

  function cardEl(essay, idx) {
    const wrapper = el("a", {
      class: "card",
      href: essay.url || "#",
      target: essay.url ? "_blank" : null,
      rel: essay.url ? "noopener" : null,
    });
    wrapper.appendChild(el("div", { class: "card-head" }, [
      el("span", null, String(idx + 1).padStart(3, "0")),
      el("span", null, tagsOf(essay).map(t => t.toUpperCase()).join(" · ")),
    ]));
    wrapper.appendChild(el("div", { class: "card-fig" }, [svgUse(essay.illustration || "ill-diesel")]));
    wrapper.appendChild(el("div", { class: "card-title" }, essay.title));
    wrapper.appendChild(el("div", { class: "card-tagline" }, essay.tagline));
    wrapper.appendChild(el("div", { class: "card-foot" }, [
      el("span", null, `${essay.readingMin}m · ${(essay.words/1000).toFixed(1)}k`),
      el("span", { class: essay.real ? "published" : "draft" }, essay.real ? "[PUB]" : "[DRAFT]"),
    ]));
    return wrapper;
  }

  function render() {
    // refresh pressed states
    document.querySelectorAll("#filter-row button, #sort-row button, #layout-row button")
      .forEach(b => b.setAttribute("aria-pressed", "false"));
    function setPressed(rowId, value) {
      document.querySelectorAll(`#${rowId} button`).forEach((b, i, all) => {
        // value-to-label mapping: we stored by index, so cross-check textContent prefix
      });
    }
    // simpler: re-stamp pressed by checking against current state via attribute on button
    [
      ["filter-row", state.filter, (window.TAGS||["all"]).map(t=>"--"+t)],
      ["sort-row", state.sort, ["date↓","date↑","len↓","yr↑"]],
      ["layout-row", state.layout, ["--table","--grid"]],
    ].forEach(([rowId, val, labels]) => {
      const map = {
        "filter-row": (window.TAGS||["all"]),
        "sort-row":   ["recent","oldest","length","year"],
        "layout-row": ["table","grid"],
      }[rowId];
      document.querySelectorAll(`#${rowId} button`).forEach((b, i) => {
        b.setAttribute("aria-pressed", map[i] === val ? "true" : "false");
      });
    });

    const listing = document.getElementById("listing");
    listing.innerHTML = "";
    const list = sortedFiltered();

    if (list.length === 0) {
      listing.appendChild(el("div", {
        class: "empty",
        style: "padding:40px 6px;color:var(--dim);font-size:12px;letter-spacing:1.5px;",
      }, `// no documents match --${state.filter}`));
      return;
    }

    if (state.layout === "table") {
      const head = el("div", { class: "table-head" }, [
        el("span", null, "№"),
        el("span", null, "FIG"),
        el("span", null, "TITLE"),
        el("span", null, "SUBJECT"),
        el("span", null, "SIZE"),
        el("span", null, "YEAR"),
        el("span", null, "STATE"),
      ]);
      listing.appendChild(head);
      list.forEach((e, i) => listing.appendChild(rowEl(e, i)));
    } else {
      const grid = el("div", { class: "grid" });
      list.forEach((e, i) => grid.appendChild(cardEl(e, i)));
      listing.appendChild(grid);
    }
  }

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", function () {
    buildStatusbar();
    buildControls();
    render();
  });
})();
