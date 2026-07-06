// ============================================================
// 0x4D44 — interactive listing
// Vanilla JS. No framework. Handles filter/sort/layout state and
// renders the listing into #listing. State persists to localStorage.
// ============================================================

(function () {
  "use strict";

  const STATE_KEY = "0x4d44.listing.v1";
  const CATALOG_EXTENSIONS = ["broadband-speed-checker/catalog.js"];
  const defaults = { filter: "all", sort: "recent", layout: "table" };

  let state = Object.assign({}, defaults);
  let essays = [];

  function loadState() {
    try {
      return Object.assign({}, defaults, JSON.parse(localStorage.getItem(STATE_KEY) || "{}"));
    } catch (_) { return Object.assign({}, defaults); }
  }
  function saveState(s) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_) {}
  }

  // A page may carry one `tag` (string) or several via `tags` (array).
  const tagsOf = (e) => e.tags || (e.tag ? [e.tag] : []);
  const hasNumber = (v) => Number.isFinite(v);
  const readingText = (e) => hasNumber(e.readingMin) ? `${e.readingMin}m` : "";
  const wordsText = (e, suffix) => hasNumber(e.words) ? `${(e.words / 1000).toFixed(1)}k${suffix}` : "";
  const sizeMobileParts = (e) => [readingText(e), wordsText(e, " w")].filter(Boolean);
  const sizeText = (e) => [readingText(e), wordsText(e, "")].filter(Boolean).join(" · ");

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (attrs[k] == null) continue;
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

  function loadCatalogExtension(src) {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }

  function loadCatalogExtensions() {
    return Promise.all(CATALOG_EXTENSIONS.map(loadCatalogExtension));
  }

  // ---------- status bar ----------
  function buildStatusbar() {
    const { total, words, subjects, last } = window.siteStats();
    document.getElementById("stat-tot").textContent =
      `tot=${total}  words=${words.toLocaleString()}  subjects=${subjects}`;
    document.getElementById("stat-last").textContent =
      last ? `last=${window.fmtDate(last.date)}` : "";
    document.getElementById("build-date").textContent = window.fmtDate(new Date().toISOString().slice(0,10));
  }

  // ---------- controls ----------
  // How many documents carry a given tag ("all" = the whole catalog).
  function tagCount(tag) {
    if (tag === "all") return essays.length;
    return essays.reduce((n, e) => n + (tagsOf(e).includes(tag) ? 1 : 0), 0);
  }

  // One control button. `count` (optional) renders a dim tally beside the label.
  function makeButton(value, label, key, count) {
    const b = el("button", {
      type: "button",
      "data-value": value,
      "aria-pressed": state[key] === value ? "true" : "false",
      onclick: () => {
        state[key] = value;
        saveState(state);
        render();
      },
    });
    b.appendChild(document.createTextNode(label));
    if (count != null) b.appendChild(el("span", { class: "cnt" }, String(count)));
    return b;
  }

  function buildControlRow(rowId, options, key) {
    const row = document.getElementById(rowId);
    row.innerHTML = "";
    options.forEach(([value, label]) => row.appendChild(makeButton(value, label, key)));
  }

  // The filter is grouped by axis (form / subject) with a live per-tag count.
  // "all" leads the first group; falls back to one flat group if TAG_GROUPS
  // is absent.
  function buildFilter() {
    const container = document.getElementById("filter-row");
    container.innerHTML = "";
    const groups = window.TAG_GROUPS ||
      [{ label: "", tags: (window.TAGS || ["all"]).filter(t => t !== "all") }];
    groups.forEach((group, gi) => {
      const chips = el("div", { class: "btn-row" });
      const tags = gi === 0 ? ["all", ...group.tags] : group.tags;
      tags.forEach(t => chips.appendChild(makeButton(t, "--" + t, "filter", tagCount(t))));
      container.appendChild(el("div", { class: "filter-group" }, [
        el("div", { class: "filter-group-label" }, group.label || ""),
        chips,
      ]));
    });
  }

  function buildControls() {
    buildFilter();
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
    if (state.sort === "recent") list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (state.sort === "oldest") list.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (state.sort === "length") list.sort((a, b) => (b.words || 0) - (a.words || 0));
    if (state.sort === "year")   list.sort((a, b) => (a.year || 0) - (b.year || 0));
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
        ...sizeMobileParts(essay).map(text => el("span", null, text)),
        el("span", null, tagsOf(essay).join(" · ")),
        el("span", null, String(essay.year)),
        el("span", { class: essay.real ? "pub" : "drf" }, essay.real ? "[PUB]" : "[DRAFT]"),
      ]),
    ]);
    wrapper.appendChild(el("span", { class: "row-num" }, String(idx + 1).padStart(3, "0")));
    wrapper.appendChild(fig);
    wrapper.appendChild(titleBlock);
    wrapper.appendChild(el("span", { class: "row-tag" }, tagsOf(essay).join(" · ")));
    wrapper.appendChild(el("span", { class: "row-size" }, sizeText(essay)));
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
      el("span", null, sizeText(essay)),
      el("span", { class: essay.real ? "published" : "draft" }, essay.real ? "[PUB]" : "[DRAFT]"),
    ]));
    return wrapper;
  }

  // Stamp aria-pressed on every control button from current state, keyed by
  // each button's own data-value — robust to grouping and reordering.
  function refreshPressed() {
    [["filter-row", "filter"], ["sort-row", "sort"], ["layout-row", "layout"]]
      .forEach(([rowId, key]) => {
        document.querySelectorAll(`#${rowId} button`).forEach(b => {
          b.setAttribute("aria-pressed",
            b.getAttribute("data-value") === state[key] ? "true" : "false");
        });
      });
  }

  function render() {
    refreshPressed();

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

  function init() {
    state = loadState();
    essays = window.ESSAYS || [];
    buildStatusbar();
    buildControls();
    render();
  }

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", function () {
    loadCatalogExtensions().then(init);
  });
})();
