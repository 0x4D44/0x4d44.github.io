// ============================================================
// 0x4D44 — interactive listing
// Vanilla JS. No framework. Handles search / filter / group / sort /
// layout state and renders the listing into #listing. State persists to
// localStorage (the live search query is deliberately not persisted).
// ============================================================

(function () {
  "use strict";

  const STATE_KEY = "0x4d44.listing.v1";
  const defaults = { filter: "all", group: "shelf", sort: "recent", layout: "table", folded: {} };

  function loadState() {
    try {
      const s = Object.assign({}, defaults, JSON.parse(localStorage.getItem(STATE_KEY) || "{}"));
      if (!s.folded || typeof s.folded !== "object") s.folded = {};
      return s;
    } catch (_) { return Object.assign({}, defaults, { folded: {} }); }
  }
  function saveState(s) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_) {}
  }

  const state = loadState();
  let query = "";                       // live search text — transient, never saved
  const essays = window.ESSAYS || [];
  const collections = window.COLLECTIONS || [];
  const bySlug = {};
  essays.forEach(e => { bySlug[e.slug] = e; });

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

  // ---------- status bar ----------
  function buildStatusbar() {
    const { total, words, subjects, last } = window.siteStats();
    document.getElementById("stat-tot").textContent =
      `tot=${total}  words=${words.toLocaleString()}  subjects=${subjects}`;
    document.getElementById("stat-last").textContent =
      last ? `last=${window.fmtDate(last.date)}` : "";
    const bd = document.getElementById("build-date");
    if (bd) bd.textContent = window.fmtDate(new Date().toISOString().slice(0, 10));
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
    // group:by is only offered when there are shelves to group into.
    const groupOpts = [["shelf", "--shelf"], ["subject", "--subject"], ["year", "--decade"], ["flat", "--flat"]];
    if (!collections.length) { state.group = "flat"; }
    buildControlRow("group-row", collections.length ? groupOpts : [["flat", "--flat"]], "group");
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

    const box = document.getElementById("search-input");
    if (box) {
      box.value = "";
      box.addEventListener("input", () => { query = box.value.trim(); render(); });
      box.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") { box.value = ""; query = ""; render(); }
      });
    }
  }

  // ---------- selection pipeline ----------
  const matchesQuery = (e, q) => {
    const hay = (e.title + " " + (e.tagline || "") + " " + tagsOf(e).join(" ") + " " +
      e.year + " " + e.slug).toLowerCase();
    return q.split(/\s+/).filter(Boolean).every(w => hay.includes(w));
  };

  // The base set: chip filter, then live search. (Not yet sorted/grouped.)
  function baseList() {
    let list = essays.slice();
    if (state.filter !== "all") list = list.filter(e => tagsOf(e).includes(state.filter));
    if (query) list = list.filter(e => matchesQuery(e, query.toLowerCase()));
    return list;
  }

  function sortList(list) {
    const l = list.slice();
    if (state.sort === "recent") l.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (state.sort === "oldest") l.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (state.sort === "length") l.sort((a, b) => (b.words || 0) - (a.words || 0));
    if (state.sort === "year")   l.sort((a, b) => (a.year || 0) - (b.year || 0));
    return l;
  }

  // Break the (already filtered) list into labelled sections per the group mode.
  // Returns null for flat mode. Each section: { id, label, blurb, items }.
  function sections(list) {
    const inList = new Set(list.map(e => e.slug));

    if (state.group === "shelf") {
      const secs = collections.map(c => ({
        id: c.id, label: c.name, blurb: c.blurb || "",
        items: sortList(c.slugs.map(s => bySlug[s]).filter(e => e && inList.has(e.slug))),
      })).filter(s => s.items.length);
      // Safety net: any document on no shelf still shows, so nothing vanishes.
      const shelved = new Set(collections.flatMap(c => c.slugs));
      const rest = sortList(list.filter(e => !shelved.has(e.slug)));
      if (rest.length) secs.push({ id: "_unshelved", label: "Unshelved", blurb: "Not yet filed on a shelf.", items: rest });
      return secs;
    }

    if (state.group === "subject") {
      const axis = (window.TAG_GROUPS || []).find(g => g.label === "subject");
      const tags = axis ? axis.tags : (window.TAGS || []).filter(t => t !== "all");
      const axisSet = new Set(tags);
      const secs = tags.map(t => ({
        id: "t-" + t, label: t, blurb: "",
        items: sortList(list.filter(e => tagsOf(e).includes(t))),
      })).filter(s => s.items.length);
      const none = sortList(list.filter(e => !tagsOf(e).some(t => axisSet.has(t))));
      if (none.length) secs.push({ id: "_notag", label: "other", blurb: "", items: none });
      return secs;
    }

    if (state.group === "year") {
      const buckets = {};
      list.forEach(e => {
        const d = Math.floor((e.year || 0) / 10) * 10;
        (buckets[d] = buckets[d] || []).push(e);
      });
      return Object.keys(buckets)
        .sort((a, b) => Number(a) - Number(b))
        .map(d => ({ id: "d-" + d, label: d + "s", blurb: "", items: sortList(buckets[d]) }));
    }

    return null;
  }

  // ---------- item renderers ----------
  function tableHead() {
    return el("div", { class: "table-head" }, [
      el("span", null, "№"),
      el("span", null, "FIG"),
      el("span", null, "TITLE"),
      el("span", null, "SUBJECT"),
      el("span", null, "SIZE"),
      el("span", null, "YEAR"),
      el("span", null, "STATE"),
    ]);
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

  function appendItems(container, items, startNum) {
    if (state.layout === "table") {
      container.appendChild(tableHead());
      items.forEach((e, i) => container.appendChild(rowEl(e, startNum + i)));
    } else {
      const grid = el("div", { class: "grid" });
      items.forEach((e, i) => grid.appendChild(cardEl(e, startNum + i)));
      container.appendChild(grid);
    }
  }

  // A foldable shelf/section header, styled as an ASCII rule.
  function shelfHead(sec) {
    const folded = !!state.folded[sec.id];
    const head = el("div", {
      class: "shelf-head",
      role: "button",
      tabindex: "0",
      "aria-expanded": folded ? "false" : "true",
      onclick: () => toggleFold(sec.id),
      onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggleFold(sec.id); } },
    });
    head.appendChild(el("span", { class: "shelf-caret" }, folded ? "▸" : "▾"));
    head.appendChild(el("span", { class: "shelf-name" }, sec.label));
    head.appendChild(el("span", { class: "shelf-count" }, "· " + sec.items.length));
    head.appendChild(el("span", { class: "shelf-rule" }));
    if (sec.blurb) head.appendChild(el("span", { class: "shelf-blurb" }, sec.blurb));
    return head;
  }

  function toggleFold(id) {
    state.folded[id] = !state.folded[id];
    saveState(state);
    render();
  }

  // ---------- controls: pressed state + search readout ----------
  function refreshPressed() {
    [["filter-row", "filter"], ["group-row", "group"], ["sort-row", "sort"], ["layout-row", "layout"]]
      .forEach(([rowId, key]) => {
        const row = document.getElementById(rowId);
        if (!row) return;
        row.querySelectorAll("button").forEach(b => {
          b.setAttribute("aria-pressed",
            b.getAttribute("data-value") === state[key] ? "true" : "false");
        });
      });
  }

  function updateReadout(shown) {
    const out = document.getElementById("search-count");
    if (!out) return;
    if (query) out.textContent = `${shown}/${essays.length} match`;
    else if (state.filter !== "all") out.textContent = `${shown}/${essays.length}`;
    else out.textContent = "";
  }

  // ---------- render ----------
  function render() {
    refreshPressed();

    const listing = document.getElementById("listing");
    listing.innerHTML = "";
    const list = baseList();
    updateReadout(list.length);

    if (list.length === 0) {
      const what = query ? `"${query}"` : `--${state.filter}`;
      listing.appendChild(el("div", {
        class: "empty",
        style: "padding:40px 6px;color:var(--dim);font-size:12px;letter-spacing:1.5px;",
      }, `// no documents match ${what}`));
      return;
    }

    // Flat mode: one list, exactly as before.
    if (state.group === "flat" || !collections.length) {
      appendItems(listing, sortList(list), 0);
      return;
    }

    // Grouped mode: labelled, foldable sections.
    const secs = sections(list) || [];
    let n = 0;
    secs.forEach(sec => {
      const wrap = el("div", { class: "shelf" + (state.folded[sec.id] ? " collapsed" : "") });
      wrap.appendChild(shelfHead(sec));
      const body = el("div", { class: "shelf-body" });
      appendItems(body, sec.items, n);
      wrap.appendChild(body);
      listing.appendChild(wrap);
      n += sec.items.length;
    });
  }

  // ---------- init ----------
  document.addEventListener("DOMContentLoaded", function () {
    // Warn (console only) if a document slipped off every shelf.
    if (collections.length) {
      const shelved = new Set(collections.flatMap(c => c.slugs));
      const orphans = essays.filter(e => !shelved.has(e.slug)).map(e => e.slug);
      if (orphans.length) console.warn("[0x4d44] documents on no shelf:", orphans);
    }
    buildStatusbar();
    buildControls();
    render();
  });
})();
