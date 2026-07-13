// ============================================================
// 0x4D44 — interactive listing
// Vanilla JS. No framework. Handles search / filter / group / sort /
// layout state and renders the listing into #listing. State persists to
// localStorage (the live search query and the open-shelf drill-in are
// deliberately transient — reload lands on the shelf tiles).
// ============================================================

(function () {
  "use strict";

  const STATE_KEY = "0x4d44.listing.v1";
  const defaults = { filter: "all", group: "shelf", sort: "recent", layout: "table", folded: {}, optionsOpen: false };

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
  let query = "";            // live search text — transient, never saved
  let openShelf = null;      // drilled-into shelf id (shelf view) — transient
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
  const toTop = () => { try { window.scrollTo({ top: 0, behavior: "auto" }); } catch (_) { window.scrollTo(0, 0); } };

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

  // ---------- stats popover ----------
  function buildStats() {
    const { total, words, subjects, last } = window.siteStats();
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const today = window.fmtDate(new Date().toISOString().slice(0, 10));
    set("pop-tot", String(total));
    set("pop-words", words.toLocaleString());
    set("pop-subj", String(subjects));
    set("pop-last", last ? window.fmtDate(last.date) : "—");
    set("pop-built", today);
    set("build-date", today);
  }

  // The stats popover (top-right): open/close, dismiss on Esc or outside click.
  function wireStats() {
    const btn = document.getElementById("btn-stats");
    const pop = document.getElementById("stats-pop");
    if (!btn || !pop) return;
    const setOpen = (open) => {
      pop.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    };
    btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(pop.hidden); });
    document.addEventListener("click", (e) => {
      if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) setOpen(false);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  }

  // "recent" button: jump to a flat, newest-first list; click again to return
  // to the shelves. Reuses the group/sort state so it stays in sync.
  function wireRecent() {
    const btn = document.getElementById("btn-recent");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const active = state.group === "flat" && state.sort === "recent";
      if (active) { state.group = "shelf"; }
      else { state.group = "flat"; state.sort = "recent"; }
      openShelf = null;
      saveState(state);
      render();
    });
  }

  function updateActionButtons() {
    const btn = document.getElementById("btn-recent");
    if (!btn) return;
    const active = state.group === "flat" && state.sort === "recent";
    btn.textContent = active ? "$ shelves" : "$ recent";
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }

  // ---------- controls ----------
  // How many documents carry a given tag ("all" = the whole catalog).
  function tagCount(tag) {
    if (tag === "all") return essays.length;
    return essays.reduce((n, e) => n + (tagsOf(e).includes(tag) ? 1 : 0), 0);
  }

  // One control button. `count` (optional) renders a dim tally beside the label.
  // Changing the group or filter resets any shelf drill-in (back to a clean view).
  function makeButton(value, label, key, count) {
    const b = el("button", {
      type: "button",
      "data-value": value,
      "aria-pressed": state[key] === value ? "true" : "false",
      onclick: () => {
        state[key] = value;
        if (key === "group" || key === "filter") openShelf = null;
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

    // Collapsible options: the filter/group/sort/layout block is hidden behind
    // this toggle on every width (tiles + search are the primary navigation).
    // The open/closed state is remembered across visits.
    const toggle = document.getElementById("options-toggle");
    const opts = document.getElementById("options");
    if (toggle && opts) {
      const apply = (open) => {
        opts.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      };
      apply(!!state.optionsOpen);
      toggle.addEventListener("click", () => {
        state.optionsOpen = !opts.classList.contains("open");
        saveState(state);
        apply(state.optionsOpen);
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

  // The documents on one shelf that survive the current filter/search.
  function shelfItems(c, inList) {
    return sortList(c.slugs.map(s => bySlug[s]).filter(e => e && inList.has(e.slug)));
  }

  // Break the (already filtered) list into labelled sections per the group
  // mode. Used by subject/decade, and by shelf view when searching.
  // Returns null for flat mode. Each section: { id, label, blurb, items }.
  function sections(list) {
    const inList = new Set(list.map(e => e.slug));

    if (state.group === "shelf") {
      const secs = collections.map(c => ({
        id: c.id, label: c.name, blurb: c.blurb || "", items: shelfItems(c, inList),
      })).filter(s => s.items.length);
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

  // A foldable section header (subject / decade / search results), an ASCII rule.
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

  // ---------- shelf view: tiles + drill-in ----------
  // The tile landing: one card per shelf, tap to open it.
  function renderTiles(listing, list) {
    const inList = new Set(list.map(e => e.slug));
    listing.appendChild(el("div", { class: "tiles-hint" },
      collections.length + " shelves · tap one to open, or search above"));
    const grid = el("div", { class: "tiles" });
    collections.forEach(c => {
      const count = shelfItems(c, inList).length;
      if (!count) return;
      const tile = el("button", {
        class: "tile", type: "button",
        onclick: () => { openShelf = c.id; render(); toTop(); },
      });
      tile.appendChild(el("div", { class: "tile-fig" }, [svgUse(c.icon || "ill-diesel")]));
      tile.appendChild(el("div", { class: "tile-body" }, [
        el("div", { class: "tile-name" }, c.name),
        el("div", { class: "tile-count" }, count + (count === 1 ? " doc" : " docs")),
        el("div", { class: "tile-blurb" }, c.blurb || ""),
      ]));
      grid.appendChild(tile);
    });
    listing.appendChild(grid);
  }

  // A single shelf, drilled into from a tile, with a back link.
  function renderSingleShelf(listing, list) {
    const c = collections.find(x => x.id === openShelf);
    if (!c) { openShelf = null; return renderTiles(listing, list); }
    const items = shelfItems(c, new Set(list.map(e => e.slug)));

    const back = el("button", {
      class: "shelf-back", type: "button",
      onclick: () => { openShelf = null; render(); toTop(); },
    }, "‹ all shelves");
    listing.appendChild(el("div", { class: "shelf-bar" }, [
      back,
      el("span", { class: "shelf-bar-name" }, c.name),
      el("span", { class: "shelf-bar-count" }, "· " + items.length),
    ]));
    if (c.blurb) listing.appendChild(el("div", { class: "shelf-bar-blurb" }, c.blurb));

    if (!items.length) {
      listing.appendChild(el("div", { class: "empty",
        style: "padding:28px 6px;color:var(--dim);font-size:12px;letter-spacing:1.5px;" },
        `// nothing on this shelf matches --${state.filter}`));
      return;
    }
    appendItems(listing, items, 0);
  }

  // ---------- controls: pressed state + readouts ----------
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

  function updateOptionsSummary() {
    const out = document.getElementById("options-summary");
    if (!out) return;
    const grp = state.group === "year" ? "decade" : state.group;
    out.textContent = `${grp} · ${state.filter} · ${state.sort === "recent" ? "date↓" : state.sort}`;
  }

  // ---------- render ----------
  function render() {
    refreshPressed();
    updateOptionsSummary();
    updateActionButtons();

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

    const grouped = state.group !== "flat" && collections.length;
    if (!grouped) { appendItems(listing, sortList(list), 0); return; }

    // Shelf view: tiles → drill-in, but a live search jumps straight to
    // matching results (grouped by shelf) rather than the tile landing.
    if (state.group === "shelf" && !query) {
      if (openShelf) renderSingleShelf(listing, list);
      else renderTiles(listing, list);
      return;
    }

    // Grouped sections (shelf+search, subject, decade).
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
    if (collections.length) {
      const shelved = new Set(collections.flatMap(c => c.slugs));
      const orphans = essays.filter(e => !shelved.has(e.slug)).map(e => e.slug);
      if (orphans.length) console.warn("[0x4d44] documents on no shelf:", orphans);
    }
    buildStats();
    buildControls();
    wireStats();
    wireRecent();
    render();
  });
})();
