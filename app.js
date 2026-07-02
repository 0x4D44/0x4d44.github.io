// ============================================================
// 0x4D44 — interactive listing
// Vanilla JS. No framework. Handles filter/sort/layout state and
// renders the listing into #listing. State persists to localStorage.
// Includes standalone almanac app entries that live outside data.js.
// ============================================================

(function () {
  "use strict";

  const STATE_KEY = "0x4d44.listing.v1";
  const defaults = { filter: "all", sort: "recent", layout: "table" };
  const injected = [
    {
      slug: "humanity-retention",
      title: "Humanity Retention Programme",
      tagline: "A satirical, mobile-first outbreak containment strategy game: retain humanity through fictional crises, crisis cards, regional traits, research, trust, economy, misinformation and suspicious AI Administrative Control. Installable offline PWA with local saves, campaign, quick play, codex, achievements, procedural audio and tests. Vanilla JS modules — no build step.",
      url: "https://0x4d44.github.io/humanity-retention/",
      illustration: "ill-population",
      date: "2026-07-02T19:10:00",
      year: 2026,
      tag: "software",
      real: true,
    }
  ];

  function loadState() {
    try {
      return Object.assign({}, defaults, JSON.parse(localStorage.getItem(STATE_KEY) || "{}"));
    } catch (_) { return Object.assign({}, defaults); }
  }
  function saveState(s) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_) {}
  }

  const state = loadState();
  const essays = (window.ESSAYS || []).slice();
  injected.forEach(entry => {
    if (!essays.some(e => e.slug === entry.slug)) essays.unshift(entry);
  });
  const tagsOf = (e) => e.tags || (e.tag ? [e.tag] : []);
  const sizeOf = e => e.readingMin && e.words ? `${e.readingMin}m · ${(e.words / 1000).toFixed(1)}k` : e.readingMin ? `${e.readingMin}m` : e.words ? `${(e.words / 1000).toFixed(1)}k w` : "app";

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const value = attrs[k];
      if (value == null || value === false) continue;
      if (k === "class") e.className = value;
      else if (k === "html") e.innerHTML = value;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), value);
      else e.setAttribute(k, value === true ? "" : String(value));
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
      }, label);
      row.appendChild(b);
    });
  }

  function buildControls() {
    buildControlRow("filter-row", (window.TAGS || ["all"]).map(t => [t, "--" + t]), "filter");
    buildControlRow("sort-row", [["recent", "date↓"], ["oldest", "date↑"], ["length", "len↓"], ["year", "yr↑"]], "sort");
    buildControlRow("layout-row", [["table", "--table"], ["grid", "--grid"]], "layout");
  }

  function sortedFiltered() {
    let list = essays.slice();
    if (state.filter !== "all") list = list.filter(e => tagsOf(e).includes(state.filter));
    if (state.sort === "recent") list.sort((a, b) => b.date.localeCompare(a.date));
    if (state.sort === "oldest") list.sort((a, b) => a.date.localeCompare(b.date));
    if (state.sort === "length") list.sort((a, b) => (b.words || 0) - (a.words || 0));
    if (state.sort === "year") list.sort((a, b) => a.year - b.year);
    return list;
  }

  function rowEl(essay, idx) {
    const wrapper = el("a", { class: "row", href: essay.url || "#", target: essay.url ? "_blank" : null, rel: essay.url ? "noopener" : null });
    const titleBlock = el("div", { class: "row-title-block" }, [
      el("div", { class: "row-title" }, essay.title),
      el("div", { class: "row-tagline" }, essay.tagline),
      el("div", { class: "row-meta-mobile" }, [
        el("span", null, sizeOf(essay)),
        el("span", null, tagsOf(essay).join(" · ")),
        el("span", null, String(essay.year)),
        el("span", { class: essay.real ? "pub" : "drf" }, essay.real ? "[PUB]" : "[DRAFT]"),
      ]),
    ]);
    wrapper.appendChild(el("span", { class: "row-num" }, String(idx + 1).padStart(3, "0")));
    wrapper.appendChild(el("div", { class: "row-fig" }, [svgUse(essay.illustration || "ill-diesel")]));
    wrapper.appendChild(titleBlock);
    wrapper.appendChild(el("span", { class: "row-tag" }, tagsOf(essay).join(" · ")));
    wrapper.appendChild(el("span", { class: "row-size" }, sizeOf(essay)));
    wrapper.appendChild(el("span", { class: "row-year" }, String(essay.year)));
    wrapper.appendChild(el("span", { class: "row-state " + (essay.real ? "published" : "draft") }, essay.real ? "[PUB]" : "[DRAFT]"));
    return wrapper;
  }

  function cardEl(essay, idx) {
    const wrapper = el("a", { class: "card", href: essay.url || "#", target: essay.url ? "_blank" : null, rel: essay.url ? "noopener" : null });
    wrapper.appendChild(el("div", { class: "card-head" }, [el("span", null, String(idx + 1).padStart(3, "0")), el("span", null, tagsOf(essay).map(t => t.toUpperCase()).join(" · "))]));
    wrapper.appendChild(el("div", { class: "card-fig" }, [svgUse(essay.illustration || "ill-diesel")]));
    wrapper.appendChild(el("div", { class: "card-title" }, essay.title));
    wrapper.appendChild(el("div", { class: "card-tagline" }, essay.tagline));
    wrapper.appendChild(el("div", { class: "card-foot" }, [el("span", null, sizeOf(essay)), el("span", { class: essay.real ? "published" : "draft" }, essay.real ? "[PUB]" : "[DRAFT]")]));
    return wrapper;
  }

  function syncControls() {
    const maps = { "filter-row": (window.TAGS || ["all"]), "sort-row": ["recent", "oldest", "length", "year"], "layout-row": ["table", "grid"] };
    const keys = { "filter-row": "filter", "sort-row": "sort", "layout-row": "layout" };
    Object.keys(maps).forEach(rowId => {
      document.querySelectorAll(`#${rowId} button`).forEach((b, i) => b.setAttribute("aria-pressed", maps[rowId][i] === state[keys[rowId]] ? "true" : "false"));
    });
  }

  function render() {
    syncControls();
    const listing = document.getElementById("listing");
    listing.innerHTML = "";
    const list = sortedFiltered();
    if (list.length === 0) {
      listing.appendChild(el("div", { class: "empty", style: "padding:40px 6px;color:var(--dim);font-size:12px;letter-spacing:1.5px;" }, `// no documents match --${state.filter}`));
      return;
    }
    if (state.layout === "table") {
      listing.appendChild(el("div", { class: "table-head" }, ["№", "FIG", "TITLE", "SUBJECT", "SIZE", "YEAR", "STATE"].map(x => el("span", null, x))));
      list.forEach((e, i) => listing.appendChild(rowEl(e, i)));
    } else {
      listing.appendChild(el("div", { class: "grid" }, list.map((e, i) => cardEl(e, i))));
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildStatusbar();
    buildControls();
    render();
  });
})();
