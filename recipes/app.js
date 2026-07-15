// ============================================================
// The Kitchen Almanac — app
// Vanilla JS, no build step. Reads window.RECIPES (recipes.js),
// renders a card index and per-recipe pages via hash routing:
//   #/          the shelf
//   #/r/<slug>  one recipe
// Ticked ingredients / completed steps / unit preference persist
// to localStorage so a cook can put the phone down mid-bake.
// ============================================================
(function () {
  "use strict";

  const app = document.getElementById("app");
  const RECIPES = window.RECIPES || [];
  const LS_KEY = "0x4d44.recipes.v1";

  // ---------- state ----------
  function loadState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch { return {}; }
  }
  function saveState(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
  }
  const state = loadState();
  state.units = state.units === "imperial" ? "imperial" : "metric";
  state.done = state.done || {};          // slug -> {ing:[keys], steps:[idx]}
  let query = "";                          // search text (not persisted)
  let course = "all";                      // active chip (not persisted)

  function doneFor(slug) {
    if (!state.done[slug]) state.done[slug] = { ing: [], steps: [] };
    return state.done[slug];
  }

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const art = (r, cls) => {
    const id = document.getElementById(r.art) ? r.art : "art-pot";
    return `<svg class="${cls}" role="img" aria-label=""><use href="#${id}"/></svg>`;
  };
  const mins = (n) => (n >= 60 ? `${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}m` : ""}` : `${n} min`);
  const qtyOf = (item) => (state.units === "imperial" ? item.imperial : item.metric) || item.metric || item.imperial || "";

  function courses() {
    const seen = [];
    for (const r of RECIPES) if (r.course && !seen.includes(r.course)) seen.push(r.course);
    return seen;
  }

  function matches(r) {
    if (course !== "all" && r.course !== course) return false;
    if (!query) return true;
    const hay = [
      r.title, r.course, r.intro, r.provenance,
      ...(r.ingredients || []).flatMap(g => g.items.map(i => i.name)),
    ].join(" ").toLowerCase();
    return query.toLowerCase().split(/\s+/).every(w => hay.includes(w));
  }

  // ---------- shelf (index) view ----------
  function renderIndex() {
    document.title = "The Kitchen Almanac — Family Recipes";
    const shown = RECIPES.filter(matches);

    app.innerHTML = `
      <p class="eyebrow">The Family Recipe Book</p>
      <header class="masthead">
        <h1>The Kitchen <em>Almanac</em></h1>
        <p class="sub">The recipes worth keeping — rescued from old emails and
        creased handwritten notes, and set down properly at last.</p>
      </header>
      <div class="rule-orn" aria-hidden="true"><span>❧</span></div>

      <div class="toolbar">
        <input class="search" type="search" placeholder="Search the tin…"
               value="${esc(query)}" aria-label="Search recipes">
        <div class="chips" role="group" aria-label="Filter by course">
          ${["all", ...courses()].map(c => {
            const n = c === "all" ? RECIPES.length : RECIPES.filter(r => r.course === c).length;
            return `<button class="chip${course === c ? " on" : ""}" data-course="${esc(c)}">
                      ${esc(c === "all" ? "Everything" : c)}<span class="n">${n}</span>
                    </button>`;
          }).join("")}
        </div>
      </div>

      ${shown.length ? `<div class="grid">${shown.map(cardHTML).join("")}</div>`
                     : `<p class="empty">Nothing in the tin matches — try another word.</p>`}
    `;

    const search = app.querySelector(".search");
    search.addEventListener("input", () => {
      query = search.value;
      // re-render only the grid so the search box keeps focus
      const grid = app.querySelector(".grid, .empty");
      const shownNow = RECIPES.filter(matches);
      const html = shownNow.length
        ? `<div class="grid">${shownNow.map(cardHTML).join("")}</div>`
        : `<p class="empty">Nothing in the tin matches — try another word.</p>`;
      grid.insertAdjacentHTML("beforebegin", html);
      grid.remove();
    });
    app.querySelectorAll(".chip").forEach(ch =>
      ch.addEventListener("click", () => { course = ch.dataset.course; renderIndex(); }));
  }

  function cardHTML(r) {
    return `
      <a class="card" href="#/r/${esc(r.slug)}" style="--r-accent:${esc(r.accent || "")}">
        ${art(r, "art")}
        <div class="course">${esc(r.course)}</div>
        <h2>${esc(r.title)}</h2>
        <p>${esc(r.intro)}</p>
        <div class="meta-row">
          <span class="m">${icon("ic-clock")} ${mins((r.prepMin || 0) + (r.cookMin || 0))}</span>
          ${r.oven ? `<span class="m">${icon("ic-oven")} ${esc(r.oven.split("/")[0].trim())}</span>` : ""}
          <span class="m">${icon("ic-serves")} serves ${esc(r.serves)}</span>
        </div>
      </a>`;
  }

  // ---------- recipe view ----------
  function renderRecipe(r) {
    document.title = `${r.title} — The Kitchen Almanac`;
    const d = doneFor(r.slug);

    const groups = (r.ingredients || []).map((g, gi) => `
      <div class="ing-group">
        ${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
        <ul class="ing">
          ${g.items.map((item, ii) => {
            const key = `${gi}.${ii}`;
            const on = d.ing.includes(key);
            return `
              <li>
                <label>
                  <input type="checkbox" data-key="${key}" ${on ? "checked" : ""}>
                  <span class="box" aria-hidden="true"></span>
                  <span class="qty">${esc(qtyOf(item))}</span>
                  <span class="what">${esc(item.name)}${item.prep ? `<small>${esc(item.prep)}</small>` : ""}</span>
                </label>
              </li>`;
          }).join("")}
        </ul>
      </div>`).join("");

    const steps = (r.method || []).map((s, i) => `
      <li data-i="${i}" class="${d.steps.includes(i) ? "done" : ""}" role="button" tabindex="0"
          aria-pressed="${d.steps.includes(i)}">
        <span class="num">${d.steps.includes(i) ? "✓" : i + 1}</span>
        <span class="txt">${esc(s)}</span>
      </li>`).join("");

    const total = (r.prepMin || 0) + (r.cookMin || 0);
    app.innerHTML = `
      <div style="--r-accent:${esc(r.accent || "")}">
        <a class="back" href="#/">← All recipes</a>
        <header class="r-head">
          <div class="course">${esc(r.course)}</div>
          <h1>${esc(r.title)}</h1>
          ${art(r, "art")}
          <p class="intro">${esc(r.intro)}</p>
          <p class="prov">${esc(r.provenance)}</p>
        </header>

        <div class="meta-strip">
          <div class="cell"><div class="k">Prep</div><div class="v">${mins(r.prepMin || 0)}</div></div>
          <div class="cell"><div class="k">Cook</div><div class="v">${mins(r.cookMin || 0)}</div></div>
          <div class="cell"><div class="k">Total</div><div class="v">${mins(total)}</div></div>
          ${r.oven ? `<div class="cell"><div class="k">Oven</div><div class="v">${esc(r.oven)}</div></div>` : ""}
          <div class="cell"><div class="k">Serves</div><div class="v">${esc(r.serves)}</div></div>
        </div>

        <div class="r-body">
          <section class="panel ing-panel" aria-label="Ingredients">
            <h2>Ingredients
              <span class="units" role="group" aria-label="Units">
                <button data-u="metric" class="${state.units === "metric" ? "on" : ""}">Metric</button>
                <button data-u="imperial" class="${state.units === "imperial" ? "on" : ""}">Imperial</button>
              </span>
            </h2>
            ${groups}
          </section>

          <section class="panel" aria-label="Method">
            <h2>Method</h2>
            <div class="progress" aria-hidden="true"><i></i></div>
            <ol class="steps">${steps}</ol>
            ${r.serveWith ? `<div class="serve"><b>To serve</b>${esc(r.serveWith)}</div>` : ""}
            ${r.tip ? `<div class="serve"><b>Cook’s note</b>${esc(r.tip)}</div>` : ""}
            <button class="reset">Start again — clear ticks for this recipe</button>
          </section>
        </div>
      </div>
    `;

    const bar = app.querySelector(".progress i");
    const setBar = () => {
      const n = (r.method || []).length;
      bar.style.width = n ? `${(doneFor(r.slug).steps.length / n) * 100}%` : "0";
    };
    setBar();

    app.querySelectorAll(".units button").forEach(b =>
      b.addEventListener("click", () => {
        if (state.units === b.dataset.u) return;
        state.units = b.dataset.u; saveState(state); renderRecipe(r);
      }));

    app.querySelectorAll('.ing input').forEach(cb =>
      cb.addEventListener("change", () => {
        const dd = doneFor(r.slug);
        dd.ing = cb.checked
          ? [...new Set([...dd.ing, cb.dataset.key])]
          : dd.ing.filter(k => k !== cb.dataset.key);
        saveState(state);
      }));

    app.querySelectorAll(".steps li").forEach(li => {
      const toggle = () => {
        const i = Number(li.dataset.i);
        const dd = doneFor(r.slug);
        const on = !dd.steps.includes(i);
        dd.steps = on ? [...dd.steps, i] : dd.steps.filter(x => x !== i);
        li.classList.toggle("done", on);
        li.setAttribute("aria-pressed", on);
        li.querySelector(".num").textContent = on ? "✓" : i + 1;
        saveState(state); setBar();
      };
      li.addEventListener("click", toggle);
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
    });

    app.querySelector(".reset").addEventListener("click", () => {
      state.done[r.slug] = { ing: [], steps: [] };
      saveState(state); renderRecipe(r);
    });
  }

  // ---------- router ----------
  function route() {
    const m = location.hash.match(/^#\/r\/([\w-]+)/);
    const r = m && RECIPES.find(x => x.slug === m[1]);
    if (r) renderRecipe(r);
    else renderIndex();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  route();
})();
