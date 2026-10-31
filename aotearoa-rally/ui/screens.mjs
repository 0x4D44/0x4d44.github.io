// Every menu screen. Plain DOM; each builder replaces the contents of #screens.
// The game passes data and callbacks; nothing here touches the simulation.

import { h, clear, fmtTime, fmtDelta, fmtMin, stars, glyphSvg, svgNode } from "./dom.mjs";
import { drawElevation, drawMinimap } from "./charts.mjs";
import { DIFFICULTY, DIFFICULTY_IDS, PARTS, PART_LABELS, REPAIR_COST, partDamage, TYRES, SETUP_RANGE, DEFAULT_OPTIONS } from "../core/career.mjs";
import { ACTIONS, ACTION_LABELS } from "../core/input.mjs";

// CSS custom-property urls resolve against the stylesheet (ui/ar.css), so hand CSS absolute urls.
const ART = (n) => new URL(`./assets/ui/${n}.webp`, document.baseURI).href;
const timeWord = (t) => (t < 5.5 ? "Night" : t < 9 ? "Dawn" : t < 11.5 ? "Morning" : t < 14.5 ? "Midday" : t < 17 ? "Afternoon" : t < 19 ? "Golden hour" : t < 21 ? "Dusk" : "Night");
const WEATHER = { clear: "Clear", cloud: "Overcast", mist: "Mist", rain: "Rain", snow: "Snow", storm: "Storm" };
const KEY_NAMES = { Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backquote: "`", Backslash: "\\", Space: "Space", Escape: "Esc", ShiftLeft: "L-Shift", ShiftRight: "R-Shift", ControlLeft: "L-Ctrl", ControlRight: "R-Ctrl", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Enter: "Enter", Backspace: "Backspace", Tab: "Tab" };
const niceKey = (c) => KEY_NAMES[c] || String(c).replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ");

export function createScreens(root, ctx) {
  const { career, input, cars, carIds, stageDefs, stageIds } = ctx;
  let current = null;
  let cleanup = null;
  let modal = null;

  function mount(name, cls, kids, art) {
    if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
    modal = null;
    clear(root);
    const s = h("section", { class: `screen ${cls || "plain"}`, "data-screen": name, "aria-label": name }, kids);
    if (art) s.style.setProperty("--art", `url(${ART(art)})`);
    root.append(s);
    current = name;
    ctx.onMount && ctx.onMount(name, s);
    return s;
  }
  const btn = (label, onClick, cls = "", extra) => h("button", { class: "btn " + cls, type: "button", onclick: (e) => { ctx.sfx && ctx.sfx(cls.includes("back") ? "back" : "click"); onClick(e); }, ...(extra || {}) }, label);
  const backBtn = (fn, label = "Back") => btn(label, fn, "ghost back", { "data-back": "1" });
  const head = (kicker, title, right) => h("div", { class: "screen-head" }, h("div", null, kicker && h("div", { class: "kicker" }, kicker), h("h1", { class: "h1" }, title)), right);

  const api = {
    get current() { return current; },
    /** True while a confirmation dialog is open (the game stops driving keys then so Escape reaches the dialog). */
    get modal() { return !!modal; },
    clear() { if (modal) api.closeConfirm(); if (cleanup) cleanup(); cleanup = null; clear(root); current = null; },

    /**
     * A confirmation dialog laid over the current screen (which is made inert underneath).
     * Escape / Backspace / pad B / the Cancel button all cancel it. Returns nothing.
     */
    confirm({ title, body, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, onConfirm, onCancel }) {
      if (modal) api.closeConfirm();
      const under = [...root.children];
      const opener = document.activeElement;
      for (const u of under) u.setAttribute("inert", "");
      const done = (fn) => () => { api.closeConfirm(); fn && fn(); };
      const node = h("section", { class: "screen dim confirm", "data-screen": "confirm", role: "alertdialog", "aria-modal": "true", "aria-label": title },
        h("div", { class: "modal" }, h("div", { class: "kicker" }, danger ? "Are you sure?" : "Please confirm"), h("h1", { class: "h1", style: { marginBottom: "8px" } }, title),
          body ? h("p", { class: "muted", style: { margin: "0 0 10px" } }, body) : null,
          btn(cancelLabel, done(onCancel), "primary", { "data-focus": "1", "data-back": "1" }),
          btn(confirmLabel, done(onConfirm), danger ? "danger" : "")));
      root.append(node);
      modal = { node, under, opener };
      ctx.onMount && ctx.onMount("confirm", node);
    },
    closeConfirm() {
      if (!modal) return;
      const m = modal;
      modal = null;
      m.node.remove();
      for (const u of m.under) u.removeAttribute("inert");
      if (current && ctx.onMount) ctx.onMount(current, null); // the screen underneath is the current one again
      if (m.opener && m.opener.isConnected && m.opener.focus) m.opener.focus({ preventScroll: true });
    },

    // ---------------------------------------------------------------- title
    title({ onStart, version }) {
      const go = () => { ctx.sfx && ctx.sfx("confirm"); onStart(); };
      const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse) and (hover: none)").matches;
      const s = mount("title", "art clear", [
        h("div", { class: "title-wrap" },
          h("div", { class: "kicker" }, "Six stages · One championship · Aotearoa New Zealand"),
          h("div", { class: "wordmark" }, h("span", null, "Aotearoa"), h("b", null, "Rally")),
          h("p", { class: "tagline" }, "Gravel, pumice, snow and rain from Waikato to Fiordland. Read the notes, trust the car, beat seven rivals."),
          h("button", { class: "press btn primary", type: "button", "data-focus": "1", onclick: go, style: { alignSelf: "flex-start" } }, coarse ? "Tap to start" : "Press any key to start")),
        h("div", { class: "foot-note" }, `v${version} · ${coarse ? "touch, tilt & gamepad" : "keyboard, gamepad & touch"}`),
      ], "keyart");
      s.style.pointerEvents = "auto";
      const onKey = (e) => { if (e.code === "Tab" || e.key === "Shift" || e.key === "Control" || e.key === "Alt") return; window.removeEventListener("keydown", onKey); go(); };
      const onPad = () => { for (const p of (navigator.getGamepads ? navigator.getGamepads() : [])) if (p && p.buttons.some((b) => b.pressed)) { clearInterval(iv); window.removeEventListener("keydown", onKey); go(); return; } };
      const iv = setInterval(onPad, 120);
      setTimeout(() => window.addEventListener("keydown", onKey), 250);
      cleanup = () => { clearInterval(iv); window.removeEventListener("keydown", onKey); };
    },

    // ---------------------------------------------------------------- main menu
    mainMenu(o) {
      // a save that names a car we do not have is treated as no championship (the career also drops it on load)
      const champ = career.championship && cars[career.championship.carId] ? career.championship : null;
      const items = [];
      if (champ && !career.finished) items.push(btn(h("span", null, "Continue championship"), o.onContinue, "primary", { "data-focus": "1" }), );
      items.push(btn(h("span", null, champ && !career.finished ? "New championship" : "Championship"), o.onNewChamp, champ && !career.finished ? "" : "primary", champ && !career.finished ? {} : { "data-focus": "1" }));
      items.push(btn("Single stage", o.onSingle), btn("Time trial", o.onTrial));
      if (o.hasReplay) items.push(btn("Watch last run", o.onReplay));
      items.push(btn("Options", o.onOptions), btn("Garage", o.onGarage), btn("How to play", o.onHow), btn("Credits", o.onCredits));
      const status = champ ? h("p", { class: "muted" }, career.finished ? "Championship complete" : `Championship in progress: stage ${champ.stageIndex + 1} of ${stageIds.length} · ${DIFFICULTY[champ.difficulty].label} · ${cars[champ.carId].name}`) : null;
      mount("menu", "art", [
        h("div", { class: "screen-head" }, h("div", { class: "wordmark sm" }, h("span", null, "Aotearoa"), h("b", null, "Rally"))),
        h("div", { class: "kicker" }, "Main menu"),
        status,
        h("div", { class: "menu-list" }, items),
        h("div", { class: "screen-foot" }, h("span", { class: "muted kbd-hint", style: { fontSize: "12px", letterSpacing: ".12em" } }, "↑↓ select · Enter confirm · Esc back")),
      ], "keyart");
    },

    // ---------------------------------------------------------------- difficulty
    difficulty({ selected = "pro", onPick, onBack, title = "Championship" }) {
      const cards = DIFFICULTY_IDS.map((id) => {
        const d = DIFFICULTY[id];
        return h("button", { type: "button", class: "panel stage-card", style: { minHeight: "170px", "--img": "none", background: id === "expert" ? "linear-gradient(160deg,#3a1a14,#10201a)" : id === "pro" ? "linear-gradient(160deg,#3a3210,#10201a)" : "linear-gradient(160deg,#143a26,#10201a)" }, "data-focus": id === selected ? "1" : null, onclick: () => { ctx.sfx && ctx.sfx("confirm"); onPick(id); } },
          h("div", { class: "sc-body", style: { gap: "8px" } },
            h("h3", null, d.label), h("p", { class: "muted", style: { margin: 0 } }, d.blurb),
            h("div", { class: "chips" }, h("span", { class: "chip" }, `Service ${d.repairMinutes} min`), h("span", { class: "chip" }, `Penalty +${d.respawnPenalty} s`), h("span", { class: "chip" }, `Damage ×${d.damageScale}`))));
      });
      mount("difficulty", "plain", [head(title, "Choose difficulty"), h("div", { class: "stage-grid" }, cards), h("div", { class: "screen-foot" }, backBtn(onBack))]);
    },

    // ---------------------------------------------------------------- car select / garage
    carSelect({ carId, livery = 0, title = "Choose your car", confirmLabel = "Confirm", backLabel = "Back", onConfirm, onBack }) {
      let idx = Math.max(0, carIds.indexOf(carId));
      let lv = Math.max(0, Math.min(9, Math.round(+livery) || 0));
      const canvas = h("canvas", { "aria-label": "3D car showroom" });
      const showroom = h("div", { class: "showroom" }, canvas);
      const info = h("div", { class: "car-info" });
      let sr = null;
      const spec = () => cars[carIds[idx]];
      const redraw = () => {
        const c = spec();
        if (lv >= (c.liveries || []).length) lv = 0;
        sr && sr.setCar(c, lv);
        clear(info);
        info.append(
          h("div", null, h("div", { class: "kicker" }, `${c.class || "Rally"} · ${c.drivetrain}`), h("h2", { class: "h1", style: { fontSize: "clamp(28px,4vw,46px)" } }, c.name), h("p", { class: "muted" }, c.tagline || "")),
          ...["power", "grip", "handling", "acceleration", "toughness"].map((k) => h("div", { class: "stat-row" }, k, h("div", { class: "bar" }, h("i", { style: { width: (c.stats[k] || 0) * 10 + "%" } })), h("b", null, String(c.stats[k] || 0)))),
          h("div", { class: "chips" }, h("span", { class: "chip" }, `${Math.round(c.mass)} kg`), h("span", { class: "chip" }, `${c.drivetrain}`), h("span", { class: "chip" }, `${c.engine ? Math.round(c.engine.redline) : "-"} rpm`)),
          h("div", { class: "kicker", style: { marginTop: "6px" } }, "Livery"),
          h("div", { class: "swatches" }, (c.liveries || []).map((l, i) => h("button", { type: "button", class: "swatch", "aria-pressed": String(i === lv), "aria-label": l.name, title: l.name, style: { "--c1": "#" + (l.body >>> 0).toString(16).padStart(6, "0"), "--c2": "#" + (l.accent >>> 0).toString(16).padStart(6, "0") }, onclick: () => { lv = i; redraw(); } }))),
          h("div", { class: "livery-name" }, (c.liveries && c.liveries[lv] ? c.liveries[lv].name + " · " + (c.liveries[lv].sponsor || "") : "")),
        );
      };
      const step = (d) => { idx = (idx + d + carIds.length) % carIds.length; lv = 0; ctx.sfx && ctx.sfx("click"); redraw(); };
      showroom.append(h("button", { class: "arrow l btn", type: "button", "aria-label": "Previous car", onclick: () => step(-1) }, "◀"), h("button", { class: "arrow r btn", type: "button", "aria-label": "Next car", onclick: () => step(1) }, "▶"));
      mount("car", "plain", [
        head(title === "Garage" ? "Pick a car and a livery" : title, "Garage"),
        h("div", { class: "car-layout" }, showroom, info),
        h("div", { class: "screen-foot" }, backBtn(onBack, backLabel), h("span", { class: "spacer" }), btn(confirmLabel, () => onConfirm(carIds[idx], lv), "primary", { "data-focus": "1" })),
      ]);
      redraw();
      // Paint the garage chrome first, then build the renderer and the car in separate tasks so no single task
      // runs long; the showroom fades its canvas in once its own compileAsync has resolved.
      let dead = false;
      setTimeout(() => {
        if (dead) return;
        sr = ctx.createShowroom ? ctx.createShowroom(canvas) : null;
        if (!sr) { showroom.append(h("p", { class: "muted", style: { position: "absolute", inset: "auto 12px 12px" } }, "3D preview unavailable")); return; }
        sr.start();
        setTimeout(() => { if (!dead && sr) sr.setCar(spec(), lv); }, 0);
      }, 0);
      const onKey = (e) => { if (e.key === "[" ) step(-1); if (e.key === "]") step(1); };
      window.addEventListener("keydown", onKey);
      cleanup = () => { dead = true; window.removeEventListener("keydown", onKey); sr && sr.dispose(); };
    },

    // ---------------------------------------------------------------- stage select
    stageSelect({ title = "Select a stage", carId, onPick, onBack, locked = [] }) {
      const cards = stageIds.map((id) => {
        const d = stageDefs[id];
        const best = career.bestTime(id, carId);
        const lock = locked.includes(id);
        return h("button", { type: "button", class: "stage-card" + (lock ? " locked" : ""), style: { "--img": `url(${ART("card-" + id)})` }, "data-focus": id === stageIds[0] ? "1" : null, onclick: () => { ctx.sfx && ctx.sfx("confirm"); onPick(id); } },
          h("span", { class: "sc-no" }, String(d.number)),
          h("div", { class: "sc-body" }, h("h3", null, d.name), h("div", { class: "sc-meta" }, h("span", null, d.region), h("span", null, `${(d.lengthTarget / 1000).toFixed(1)} km`), stars(d.difficulty)),
            h("div", { class: "sc-meta" }, h("span", null, WEATHER[d.environment.weather.type] || "Clear"), h("span", null, timeWord(d.environment.timeOfDay)), h("span", { class: "gain" }, best ? "Best " + fmtTime(best) : "No time set"))));
      });
      mount("stages", "plain", [head(title, "Special stages"), h("div", { class: "stage-grid" }, cards), h("div", { class: "screen-foot" }, backBtn(onBack))]);
    },

    // ---------------------------------------------------------------- briefing
    briefing({ def, stage, mode = "single", carId, best, bench, benchFor = null, par = null, tyre, onTyre, difficulty = null, onDifficulty, onStart, onBack, championship }) {
      const cEl = h("canvas", { height: "110", style: { height: "110px" } });
      const mEl = h("canvas", { height: "200", style: { height: "200px" } });
      const notes = stage ? (stage.pacenotes || []).filter((n) => n.kind !== "start").slice(0, 4) : [];
      const env = def.environment;
      const trial = mode === "trial";
      const benchEl = h("b", null, bench ? fmtTime(bench) : "-");
      const facts = h("div", { class: "facts" },
        h("div", { class: "fact" }, h("b", null, (def.lengthTarget / 1000).toFixed(2) + " km"), h("span", null, "Distance")),
        h("div", { class: "fact" }, h("b", null, par ? fmtTime(par, true) : "-"), h("span", null, "Par time")),
        h("div", { class: "fact" }, h("b", { class: best ? "gain" : "" }, best ? fmtTime(best) : "None"), h("span", null, trial ? "Ghost to beat" : "Best time")),
        trial ? h("div", { class: "fact" }, h("b", null, "None"), h("span", null, "Rivals")) : h("div", { class: "fact" }, benchEl, h("span", null, "Rival to beat")));
      const diffSeg = difficulty && !championship && !trial ? h("div", { class: "row-inline" }, h("span", { class: "kicker" }, "Rivals"), h("div", { class: "seg", role: "group", "aria-label": "Rival difficulty" }, DIFFICULTY_IDS.map((id) => h("button", { type: "button", "aria-pressed": String(id === difficulty), onclick: (e) => { onDifficulty && onDifficulty(id); if (benchFor) { const bt = benchFor(id); benchEl.textContent = bt ? fmtTime(bt) : "-"; } for (const b of e.currentTarget.parentNode.children) b.setAttribute("aria-pressed", String(b === e.currentTarget)); } }, DIFFICULTY[id].label)))) : null;
      const tyreSeg = h("div", { class: "seg", role: "group", "aria-label": "Tyres" }, TYRES.map((t) => h("button", { type: "button", "aria-pressed": String(t === tyre), onclick: (e) => { onTyre && onTyre(t); for (const b of e.currentTarget.parentNode.children) b.setAttribute("aria-pressed", String(b === e.currentTarget)); } }, t)));
      mount("briefing", "art", [
        head(`Stage ${def.number} of ${stageIds.length}${championship ? " · Championship" : ""}`, def.name, h("div", { class: "chips" }, h("span", { class: "chip" }, `${def.region} · ${def.island} Island`), stars(def.difficulty))),
        h("div", { class: "brief" },
          h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
            h("p", { style: { fontSize: "clamp(15px,1.7vw,18px)", maxWidth: "60ch" } }, def.blurb),
            h("div", { class: "chips" },
              h("span", { class: "chip hot" }, WEATHER[env.weather.type] || "Clear"), h("span", { class: "chip" }, timeWord(env.timeOfDay)),
              h("span", { class: "chip" }, def.biome), env.headlights ? h("span", { class: "chip" }, "Lights on") : null,
              ...(def.landmarks || []).slice(0, 2).map((l) => h("span", { class: "chip" }, l))),
            facts,
            h("div", { class: "panel" }, h("div", { class: "kicker" }, "Co-driver sample"),
              h("div", { class: "notes-sample" }, notes.length ? notes.map((n) => h("div", null, svgNode(glyphSvg(n.icon)), h("span", { class: "muted" }, Math.round(n.s) + " m"), h("span", null, n.text))) : h("span", { class: "muted" }, "Notes are read live from the road ahead."))),
            h("div", { class: "row-inline" }, h("span", { class: "kicker" }, "Tyres"), tyreSeg),
            diffSeg),
          h("div", { class: "charts" },
            h("div", { class: "kicker" }, "Route"), mEl, h("div", { class: "kicker" }, "Elevation & surface"), cEl)),
        h("div", { class: "screen-foot sticky" }, backBtn(onBack), h("span", { class: "spacer" }), btn(trial ? "Start time trial" : "Start stage", onStart, "primary", { "data-focus": "1" })),
      ], "card-" + def.id);
      if (stage) requestAnimationFrame(() => { drawMinimap(mEl, stage, { pad: 14 }); drawElevation(cEl, stage); });
      void carId;
    },

    // ---------------------------------------------------------------- pause
    /**
     * Back (Esc / Backspace / pad B) always means Resume. Leaving the stage needs a confirmation.
     * championship: no free restart; "Retire" is a DNF.  recoverPenalty: seconds a checkpoint return costs.
     */
    pause({ mode = "single", recoverPenalty = 10, onResume, onRestart, onOptions, onQuit, onRetire, onRecover }) {
      const champ = mode === "championship";
      const items = [
        btn("Resume", onResume, "primary", { "data-focus": "1", "data-back": "1" }),
        btn(h("span", null, "Respawn on road ", h("span", { class: "hint" }, `(+${recoverPenalty} s)`)), onRecover),
      ];
      if (!champ && onRestart) items.push(btn(mode === "trial" ? "Restart trial" : "Restart stage", onRestart));
      items.push(btn("Options", onOptions));
      if (champ) items.push(btn(h("span", null, "Retire stage ", h("span", { class: "hint" }, "(DNF, 0 points)")), () => api.confirm({
        title: "Retire from this stage?", body: "You score no points and the stage counts as a DNF. There is no restart in a championship.", confirmLabel: "Retire (DNF)", cancelLabel: "Keep driving", danger: true, onConfirm: onRetire,
      }), "ghost"));
      else items.push(btn("Quit to menu", () => api.confirm({
        title: "Quit to the menu?", body: "This run will be lost.", confirmLabel: "Quit to menu", cancelLabel: "Keep driving", danger: true, onConfirm: onQuit,
      }), "ghost"));
      mount("pause", "dim", [h("div", { class: "modal" }, h("div", { class: "kicker" }, champ ? "Championship · paused" : mode === "trial" ? "Time trial · paused" : "Paused"), h("h1", { class: "h1", style: { marginBottom: "8px" } }, "Take a breath"), items,
        h("p", { class: "muted hint-foot" }, "Esc resumes"))]);
    },

    // ---------------------------------------------------------------- results
    results({ def, result, sheet, isBest, previousBest, bestSplits, mode, onContinue, continueLabel = "Continue", onRetry, onReplay, onMenu, dnf }) {
      const me = sheet && sheet.find((r) => r.player);
      const splitEls = (result.splits || []).filter((s) => s.index < (result.splits.length)).map((s, i) => {
        const b = bestSplits && bestSplits[s.index];
        const delta = b != null && !result.assisted ? s.time - b : null;
        if (result.assisted) return h("div", null, h("span", { class: "muted" }, s.name || `Split ${i + 1}`), h("span", { class: "num muted" }, "-"));
        return h("div", null, h("span", { class: "muted" }, s.name || `Split ${i + 1}`), h("span", { class: "num" }, fmtTime(s.time, true), delta != null ? h("span", { class: delta <= 0 ? " gain" : " loss" }, " " + fmtDelta(delta)) : null));
      });
      const trial = mode === "trial";
      const rows = (sheet || []).map((r) => h("tr", { class: (r.player ? "me " : "") + (r.dnf ? "dnf" : "") }, h("td", { class: "pos" }, String(r.position)), h("td", null, r.name), h("td", { class: "r num mono" }, r.dnf ? "DNF" : fmtTime(r.time)),
        // gap to the stage winner (the winner's own row reads "Leader")
        h("td", { class: "r num mono muted" }, r.dnf ? "" : r.gap > 0 ? fmtDelta(r.gap) : "Leader"), mode === "championship" ? h("td", { class: "r" }, r.points ? "+" + r.points : "") : null));
      const won = me && !dnf && me.position === 1;
      const podium = me && !dnf && me.position <= 3;
      const REASON = { timeout: "Out of time", damage: "Car destroyed", retired: "Retired" };
      const heading = dnf ? (REASON[result.dnfReason] || "Did not finish") : trial ? (isBest ? "New best lap" : "Time trial complete") : won ? "Stage winner" : podium ? "Podium finish" : "Stage complete";
      const vsBest = trial && previousBest != null && !dnf ? result.total - previousBest : null;
      mount("results", "plain" + (won ? " win" : podium ? " podium-ish" : ""), [
        head(`${def.name} · stage ${def.number}${trial ? " · time trial" : ""}`, heading, won || podium ? h("div", { class: "medal " + (won ? "gold" : "bronze"), "aria-hidden": "true" }, svgNode(`<svg viewBox="0 0 48 48" width="56" height="56"><path d="M14 4h20l-4 14H18z" fill="currentColor" opacity=".55"/><circle cx="24" cy="30" r="13" fill="currentColor"/><text x="24" y="36" text-anchor="middle" font-size="16" font-weight="800" fill="#10201a">${me.position}</text></svg>`)) : null),
        h("div", { class: "res-hero" },
          h("div", null, h("div", { class: "kicker" }, dnf ? "Result" : "Stage time"), h("div", { class: "big-time" }, dnf ? "DNF" : fmtTime(result.total)),
            h("div", { class: "chips", style: { marginTop: "8px" } },
              isBest && !result.assisted ? h("span", { class: "badge" }, "New personal best") : null,
              result.assisted ? h("span", { class: "chip" }, "Assisted run: no record") : null,
              vsBest != null && !isBest ? h("span", { class: "chip" }, `${fmtDelta(vsBest)} to your best`) : null,
              result.penaltyTotal ? h("span", { class: "chip" }, `Includes +${result.penaltyTotal.toFixed(0)} s penalties`) : null,
              me && !trial ? h("span", { class: "chip hot" }, `Position ${me.position} of ${sheet.length}`) : null,
              previousBest && !isBest ? h("span", { class: "chip" }, `Best ${fmtTime(previousBest)}`) : null))),
        h("div", { class: "brief", style: { alignItems: "start" } },
          trial || !rows.length ? null : h("div", { class: "table-wrap" }, h("table", { class: "sheet" }, h("thead", null, h("tr", null, h("th", null, "Pos"), h("th", null, "Driver"), h("th", { class: "r" }, "Time"), h("th", { class: "r" }, "Gap"), mode === "championship" ? h("th", { class: "r" }, "Pts") : null)), h("tbody", null, rows))),
          h("div", { class: "panel" }, h("div", { class: "kicker" }, trial ? "Splits vs your ghost" : "Splits vs your best"), h("div", { class: "split-list" }, splitEls.length ? splitEls : h("span", { class: "muted" }, "No splits recorded")),
            result.penalties && result.penalties.length ? h("div", { style: { marginTop: "12px" } }, h("div", { class: "kicker" }, "Penalties"), result.penalties.map((p) => h("div", { class: "loss", style: { fontSize: "14px" } }, `+${p.seconds} s ${p.kind.replace("_", " ")}`))) : null)),
        h("div", { class: "screen-foot" }, onMenu ? backBtn(onMenu, "Menu") : null, onReplay ? btn("Watch replay", onReplay) : null, onRetry ? btn("Retry stage", onRetry) : null, h("span", { class: "spacer" }), btn(continueLabel, onContinue, "primary", { "data-focus": "1" })),
      ]);
    },

    // ---------------------------------------------------------------- standings
    standings({ title = "Championship standings", rows, timeRows = null, stageIndex, onContinue, continueLabel = "Continue to service", last }) {
      const body = rows.map((r) => h("tr", { class: r.player ? "me" : "" }, h("td", { class: "pos" }, String(r.position)), h("td", null, r.name), h("td", { class: "r" }, String(r.wins)), h("td", { class: "r num mono" }, fmtTime(r.total, false)), h("td", { class: "r", style: { fontWeight: 900 } }, String(r.points))));
      const tbody = (timeRows || []).map((r) => h("tr", { class: r.player ? "me" : "" }, h("td", { class: "pos" }, String(r.timePosition)), h("td", null, r.name), h("td", { class: "r num mono" }, fmtTime(r.total, false)), h("td", { class: "r num mono muted" }, r.timeGap > 0 ? fmtDelta(r.timeGap) : "Leader")));
      mount("standings", "plain", [
        head(last ? "Final" : `After stage ${stageIndex} of ${stageIds.length}`, title),
        h("div", { class: "brief two-tables" },
          h("div", { class: "table-wrap", "aria-label": "Points classification" }, h("div", { class: "kicker tbl-cap" }, "Points"), h("table", { class: "sheet" }, h("thead", null, h("tr", null, h("th", null, "Pos"), h("th", null, "Driver"), h("th", { class: "r" }, "Wins"), h("th", { class: "r" }, "Time"), h("th", { class: "r" }, "Pts"))), h("tbody", null, body))),
          tbody.length ? h("div", { class: "table-wrap", "aria-label": "Overall time classification" }, h("div", { class: "kicker tbl-cap" }, "Overall time"), h("table", { class: "sheet" }, h("thead", null, h("tr", null, h("th", null, "Pos"), h("th", null, "Driver"), h("th", { class: "r" }, "Total"), h("th", { class: "r" }, "Gap"))), h("tbody", null, tbody))) : null),
        h("div", { class: "screen-foot sticky" }, h("span", { class: "spacer" }), btn(continueLabel, onContinue, "primary", { "data-focus": "1" })),
      ]);
    },

    // ---------------------------------------------------------------- service area
    service({ nextDef, spec, onDone, onSave }) {
      const champ = career.championship;
      const wrap = h("div", { class: "service" });
      const cue = h("button", { type: "button", class: "scroll-cue", "aria-label": "Scroll down for more rows: bodywork, suspension, brake bias", tabindex: "-1", onclick: () => wrap.scrollBy({ top: Math.max(120, wrap.clientHeight * 0.7), behavior: "smooth" }) }, "More below ▾");
      const budgetEl = h("div", { class: "budget" });
      const partsEl = h("div");
      const setupEl = h("div");
      const sil = svgNode(`<svg class="sil" viewBox="0 0 60 110"><rect id="z-engine" x="18" y="6" width="24" height="22" rx="4"/><rect id="z-front" x="14" y="2" width="32" height="10" rx="4"/><rect id="z-left" x="10" y="14" width="9" height="80" rx="3"/><rect id="z-right" x="41" y="14" width="9" height="80" rx="3"/><rect x="20" y="34" width="20" height="40" rx="6" fill="rgba(255,255,255,.14)"/><rect id="z-rear" x="14" y="98" width="32" height="10" rx="4"/><rect id="w0" x="2" y="14" width="9" height="18" rx="3"/><rect id="w1" x="49" y="14" width="9" height="18" rx="3"/><rect id="w2" x="2" y="76" width="9" height="18" rx="3"/><rect id="w3" x="49" y="76" width="9" height="18" rx="3"/></svg>`);
      const col = (v) => `hsl(${125 - Math.min(1, v) * 125} 78% 50%)`;
      const refresh = () => {
        const d = champ.damage;
        const pd = partDamage(d);
        const plan = champ.service.plan;
        const after = (p) => pd[p] * (1 - (plan[p] || 0));
        budgetEl.replaceChildren(h("span", null, fmtMin(career.serviceLeft())), h("small", null, ` of ${fmtMin(champ.service.budget)} left`));
        sil.querySelector("#z-engine").setAttribute("fill", col(after("engine")));
        for (const z of ["front", "rear", "left", "right"]) sil.querySelector("#z-" + z).setAttribute("fill", col(after("body")));
        for (let i = 0; i < 4; i++) sil.querySelector("#w" + i).setAttribute("fill", col(Math.max(after("tyres"), after("suspension") * 0.8)));
      };
      const rowFor = (p) => {
        const dmg = partDamage(champ.damage)[p];
        const val = h("span", { class: "mono" }, "");
        const bar = h("i", { style: { width: Math.max(2, 100 - dmg * 100) + "%", background: col(dmg) } });
        const slider = h("input", { type: "range", min: "0", max: "100", step: "5", value: String(Math.round((champ.service.plan[p] || 0) * 100)), "aria-label": `Repair ${PART_LABELS[p]}`, disabled: dmg < 0.02,
          oninput: (e) => { const f = career.setRepair(p, +e.target.value / 100); e.target.value = String(Math.round(f * 100)); upd(); refresh(); } });
        const upd = () => { const f = champ.service.plan[p] || 0; val.textContent = dmg < 0.02 ? "OK" : fmtMin(career.repairCost(p, f > 0 ? f : 1)); val.title = f > 0 ? "Repair time chosen" : "Time to repair fully"; bar.style.width = Math.max(2, 100 - dmg * (1 - f) * 100) + "%"; bar.style.background = col(dmg * (1 - f)); };
        upd();
        return h("div", { class: "part-row" }, h("div", null, PART_LABELS[p], h("div", { class: "meta" }, `Full repair ${REPAIR_COST[p]} min`)), h("div", null, h("div", { class: "dmg" }, bar), slider), val);
      };
      for (const p of PARTS) partsEl.append(rowFor(p));
      // setup
      const s = champ.setup;
      const mkSlider = (label, key, [lo, hi], step, fmt, hintL, hintR) => {
        const out = h("span", { class: "val" }, fmt(s[key]));
        return h("div", { class: "opt" }, h("label", null, label, h("small", null, `${hintL} ↔ ${hintR}`)), h("div", null, h("input", { type: "range", min: String(lo), max: String(hi), step: String(step), value: String(s[key]), "aria-label": label, oninput: (e) => { career.setSetup({ [key]: +e.target.value }); out.textContent = fmt(champ.setup[key]); } }), out));
      };
      setupEl.append(
        h("div", { class: "opt" }, h("label", null, "Tyres", h("small", null, "Match the surface")), h("div", { class: "seg", role: "group" }, TYRES.map((t) => h("button", { type: "button", "aria-pressed": String(t === s.tyre), onclick: (e) => { career.setSetup({ tyre: t }); for (const b of e.currentTarget.parentNode.children) b.setAttribute("aria-pressed", String(b === e.currentTarget)); } }, t)))),
        mkSlider("Gear ratio", "gear", SETUP_RANGE.gear, 0.1, (v) => (v > 0 ? "Short +" : v < 0 ? "Long " : "Std ") + v.toFixed(1), "Top speed", "Acceleration"),
        mkSlider("Suspension", "susp", SETUP_RANGE.susp, 0.1, (v) => (v > 0 ? "Stiff +" : v < 0 ? "Soft " : "Std ") + v.toFixed(1), "Soft & grippy", "Stiff & sharp"),
        mkSlider("Brake bias", "brake", SETUP_RANGE.brake, 0.01, (v) => (v >= 0 ? "Front +" : "Rear ") + Math.abs(v * 100).toFixed(0) + "%", "Rear", "Front"));
      wrap.append(
        h("div", { class: "panel" }, h("div", { class: "kicker" }, "Repair budget"), budgetEl, h("p", { class: "muted", style: { fontSize: "13px" } }, "Mechanics have limited minutes. Spend them where the car is hurt most; unspent time is lost."), partsEl),
        h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } }, h("div", { class: "panel", style: { textAlign: "center" } }, h("div", { class: "kicker" }, spec ? spec.name : "Car"), sil), h("div", { class: "panel" }, h("div", { class: "kicker" }, "Setup"), setupEl)));
      mount("service", "plain", [head("Service area", `Next: ${nextDef ? nextDef.name : ""}`, nextDef ? h("div", { class: "chips" }, h("span", { class: "chip hot" }, WEATHER[nextDef.environment.weather.type]), h("span", { class: "chip" }, timeWord(nextDef.environment.timeOfDay)), h("span", { class: "chip" }, `Suggested tyres: ${ctx.recommendedTyre ? ctx.recommendedTyre(nextDef) : "gravel"}`)) : null), wrap,
        cue,
        h("div", { class: "screen-foot" }, btn("Save & quit", onSave, "ghost", { "data-back": "1" }), h("span", { class: "spacer" }), btn("Go to the start line", onDone, "primary", { "data-focus": "1" }))]);
      refresh();
      // the repair and setup rows scroll inside .service: show a cue while rows are hidden below the fold, and hide it at the end
      const syncCue = () => { cue.hidden = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight <= 4; };
      wrap.addEventListener("scroll", syncCue, { passive: true });
      window.addEventListener("resize", syncCue);
      requestAnimationFrame(syncCue); setTimeout(syncCue, 450);
    },

    // ---------------------------------------------------------------- podium
    podium({ rows, timeRows = null, onContinue }) {
      const top = rows.slice(0, 3);
      const me = rows.find((r) => r.player);
      const timeLead = timeRows && timeRows[0];
      const step = (r, cls) => r && h("div", { class: "step " + cls }, h("b", null, String(r.position)), h("div", { class: "nm" }, r.name), h("div", { class: "pts" }, `${r.points} pts`), h("div", { class: "muted tm" }, fmtTime(r.total, false)));
      mount("podium", "art", [
        head("Championship complete", me && me.position === 1 ? "Champion of Aotearoa" : `You finished ${me ? "P" + me.position : ""}`,
          timeLead ? h("div", { class: "chips" }, h("span", { class: "chip hot" }, `Fastest overall: ${timeLead.name} ${fmtTime(timeLead.total, false)}`)) : null),
        h("div", { class: "podium" }, step(top[1], "p2"), step(top[0], "p1"), step(top[2], "p3")),
        h("div", { class: "table-wrap" }, h("table", { class: "sheet" }, h("thead", null, h("tr", null, h("th", null, "Pos"), h("th", null, "Driver"), h("th", { class: "r" }, "Points"), h("th", { class: "r" }, "Total time"))), h("tbody", null, rows.map((r) => h("tr", { class: r.player ? "me" : "" }, h("td", { class: "pos" }, String(r.position)), h("td", null, r.name), h("td", { class: "r" }, `${r.points} pts`), h("td", { class: "r mono" }, fmtTime(r.total, false))))))),
        h("div", { class: "screen-foot sticky" }, h("span", { class: "spacer" }), btn("Back to menu", onContinue, "primary", { "data-focus": "1" })),
      ], "keyart");
    },

    // ---------------------------------------------------------------- options
    options({ onBack, onChange, tab = "controls" }) {
      const o = career.options;
      let paintPreview = () => {}, voiceListener = null;
      { const prev = cleanup; cleanup = () => { try { if (voiceListener) speechSynthesis.removeEventListener("voiceschanged", voiceListener); } catch { /* ignore */ } if (prev) prev(); }; }
      const set = (k, v) => {
        career.setOption(k, v); onChange && onChange(k, career.options[k]); paintPreview();
        if (["master", "engine", "effects", "voice", "ambience"].includes(k)) { clearTimeout(set._t); set._t = setTimeout(() => ctx.sfx && ctx.sfx("click"), 120); } // audible feedback for volume sliders
      };
      const mkPreview = () => {
        const speed = h("b", { class: "pv-speed" }), unit = h("small", null), wedge = svgNode(`<svg class="pv-fov" viewBox="0 0 120 70" aria-hidden="true"><path d="M60 66 L10 6 A80 80 0 0 1 110 6 Z" fill="currentColor" opacity=".25"/><path d="M60 66 L60 6" stroke="currentColor" opacity=".5"/></svg>`);
        const good = h("i", { class: "pv-sw good" }), bad = h("i", { class: "pv-sw bad" });
        const box = h("div", { class: "opt-preview", "aria-hidden": "true" },
          h("div", { class: "pv-hud" }, speed, unit, h("span", { class: "pv-sws" }, good, bad)),
          h("div", { class: "pv-fovwrap" }, wedge, h("small", null, "")));
        paintPreview = () => {
          const op = career.options, mph = op.units === "mph";
          speed.textContent = String(Math.round(112 * (mph ? 0.621371 : 1)));
          unit.textContent = mph ? " mph" : " km/h";
          box.style.setProperty("--hud-scale", String(op.hudScale));
          box.classList.toggle("colour-safe", !!op.colourSafe);
          const half = (op.fov / 2) * Math.PI / 180, r = 70;
          wedge.querySelector("path").setAttribute("d", `M60 68 L${(60 - Math.sin(half) * r * 1.4).toFixed(1)} ${(68 - Math.cos(half) * r).toFixed(1)} L${(60 + Math.sin(half) * r * 1.4).toFixed(1)} ${(68 - Math.cos(half) * r).toFixed(1)} Z`);
          box.querySelector(".pv-fovwrap small").textContent = `${Math.round(op.fov)}° field of view`;
        };
        paintPreview();
        return box;
      };
      const panels = { controls: () => controlsTab(), driving: () => drivingTab(), display: () => displayTab(), audio: () => audioTab(), data: () => dataTab() };
      const body = h("div", { class: "opt-list" });
      const tabs = h("div", { class: "tabs", role: "tablist" });
      const sw = (k) => h("button", { type: "button", class: "switch", role: "switch", "aria-checked": String(!!career.options[k]), "aria-label": k, onclick: (e) => { const v = !career.options[k]; set(k, v); e.currentTarget.setAttribute("aria-checked", String(v)); } });
      const sel = (k, opts) => h("select", { "aria-label": k, onchange: (e) => set(k, e.target.value) }, opts.map(([v, l]) => h("option", { value: v, selected: String(career.options[k]) === String(v) ? "" : null }, l)));
      const range = (k, min, max, step, fmt = (v) => String(v)) => { const out = h("span", { class: "val" }, fmt(o[k])); return h("div", null, h("input", { type: "range", min, max, step, value: String(career.options[k]), "aria-label": k, oninput: (e) => { set(k, +e.target.value); out.textContent = fmt(career.options[k]); } }), out); };
      const row = (label, ctl, small) => {
        // every control is named by its row label (not the raw option key)
        const target = ctl && ctl.matches && ctl.matches("input,select,button.switch") ? ctl : ctl && ctl.querySelector ? ctl.querySelector("input,select,button.switch") : null;
        if (target) target.setAttribute("aria-label", label);
        return h("div", { class: "opt" }, h("label", null, label, small && h("small", null, small)), ctl);
      };
      function controlsTab() {
        const out = [];
        out.push(h("p", { class: "muted" }, "Click a key, then press the new one. Up to four keys per action; clicking again clears extra keys."));
        for (const a of ACTIONS) {
          const cell = h("div");
          const render = () => { clear(cell); input.bindings[a].forEach((code, i) => cell.append(h("button", { type: "button", class: "bind", title: "Rebind", onclick: async (e) => { const b = e.currentTarget; b.classList.add("listening"); b.textContent = "press a key..."; const c = await input.captureKey(); const nb = { ...input.bindings, [a]: input.bindings[a].map((x, j) => (j === i ? c : x)) }; for (const other of ACTIONS) if (other !== a) nb[other] = nb[other].filter((x) => x !== c); input.setBindings(nb); renderAll(); } }, niceKey(code)))); cell.append(h("button", { type: "button", class: "bind", title: "Add key", onclick: async (e) => { const b = e.currentTarget; b.classList.add("listening"); b.textContent = "press a key..."; const c = await input.captureKey(); const nb = { ...input.bindings }; for (const other of ACTIONS) nb[other] = nb[other].filter((x) => x !== c); nb[a] = [...nb[a], c].slice(0, 4); input.setBindings(nb); renderAll(); } }, "+")); };
          render();
          cell._render = render;
          out.push(row(ACTION_LABELS[a], cell));
        }
        out.push(row("Reset keys", btn("Restore defaults", () => { input.resetBindings(); renderAll(); }, "small")));
        out.push(row("Gamepad", h("span", { class: "muted" }, input.gamepadConnected ? "Connected: triggers = pedals, stick = steer, bumpers = gears, B = handbrake" : "Not detected. Connect a pad and press a button.")));
        out.push(row("On-screen controls", sel("touch", [["auto", "Auto (touch devices)"], ["on", "Always on"], ["off", "Off"]])));
        out.push(row("Tilt steering", sw("tilt"), "Phones and tablets with motion sensors"));
        return out;
      }
      const drivingTab = () => [
        row("Gearbox", sel("gearbox", [["auto", "Automatic"], ["manual", "Manual (Shift/Ctrl, Q/E)"]])),
        row("Steering assist", range("steerAssist", 0, 1, 0.05, (v) => Math.round(v * 100) + "%"), "Reduces steering lock at high speed"),
        row("Default camera", sel("camera", [["chase", "Chase"], ["far", "Far chase"], ["bumper", "Bumper"], ["bonnet", "Bonnet"]])),
      ];
      const displayTab = () => [
        mkPreview(),
        row("Units", sel("units", [["kmh", "km/h"], ["mph", "mph"]])),
        row("Graphics quality", sel("quality", [["auto", "Auto (governor)"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["ultra", "Ultra"]])),
        row("Field of view", range("fov", 55, 110, 1, (v) => v + "°")),
        row("HUD size", range("hudScale", 0.7, 1.4, 0.05, (v) => Math.round(v * 100) + "%")),
        row("FPS counter", sw("fps")), row("Reduced motion", sw("reducedMotion"), "Fewer animations and less camera shake"),
        row("Colour-safe HUD", sw("colourSafe"), "Blue/orange instead of green/red"),
      ];
      const audioTab = () => {
        const readVoices = () => {
          try { const l = ctx.listVoices ? ctx.listVoices() : []; if (l && l.length) return l; } catch { /* ignore */ }
          try { return typeof speechSynthesis !== "undefined" ? speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)).map((v) => ({ name: v.name, lang: v.lang })) : []; } catch { return []; }
        };
        const vsel = h("select", { "aria-label": "Co-driver voice", onchange: (e) => set("voiceName", e.target.value) });
        const fillVoices = () => {
          const list = readVoices(), cur = career.options.voiceName;
          clear(vsel);
          vsel.append(h("option", { value: "" }, "Auto (best available)"));
          for (const v of list) vsel.append(h("option", { value: v.name }, `${v.name} (${v.lang})`));
          vsel.value = list.some((v) => v.name === cur) ? cur : ""; // a saved voice that is gone shows Auto
        };
        fillVoices();
        try { // speechSynthesis loads its voices late; refill when they arrive
          if (typeof speechSynthesis !== "undefined" && speechSynthesis.addEventListener) {
            if (voiceListener) speechSynthesis.removeEventListener("voiceschanged", voiceListener);
            voiceListener = fillVoices; speechSynthesis.addEventListener("voiceschanged", fillVoices);
          }
        } catch { /* ignore */ }
        return [row("Mute all", sw("mute")), row("Master", range("master", 0, 1, 0.05, (v) => Math.round(v * 100))), row("Engine", range("engine", 0, 1, 0.05, (v) => Math.round(v * 100))), row("Effects", range("effects", 0, 1, 0.05, (v) => Math.round(v * 100))), row("Ambience", range("ambience", 0, 1, 0.05, (v) => Math.round(v * 100))), row("Co-driver volume", range("voice", 0, 1, 0.05, (v) => Math.round(v * 100))), row("Co-driver", sw("codriver"), "Spoken pace notes"), row("Co-driver voice", vsel)];
      };
      const dataTab = () => [
        row("Stages finished", h("span", { class: "mono" }, String(career.profile.stats.stagesFinished))),
        row("Championships", h("span", { class: "mono" }, String(career.profile.stats.championships))),
        row("Erase save data", btn("Erase everything", () => api.confirm({
          title: "Erase all save data?", body: "This deletes the championship, best times, ghosts and settings. It cannot be undone.", confirmLabel: "Erase everything", cancelLabel: "Keep my data", danger: true,
          onConfirm: () => { ctx.onWipe && ctx.onWipe(); renderTab("data"); },
        }), "small danger"), "Fixes a stuck or broken save"),
      ];
      let renderAll = () => {};
      function renderTab(t) {
        tab = t;
        clear(tabs);
        for (const k of Object.keys(panels)) tabs.append(h("button", { type: "button", role: "tab", "aria-selected": String(k === t), onclick: () => renderTab(k) }, k));
        clear(body);
        body.append(...panels[t]());
        renderAll = () => renderTab(t);
      }
      mount("options", "plain", [head("Settings", "Options"), tabs, body, h("div", { class: "screen-foot" }, backBtn(onBack))]);
      renderTab(tab);
    },

    // ---------------------------------------------------------------- how to play / credits
    howto({ onBack }) {
      const kb = (a) => (input.bindings[a] || []).map((c) => h("kbd", null, niceKey(c)));
      mount("howto", "plain", [head("Rally school", "How to play"),
        h("div", { class: "howto" },
          h("div", { class: "panel" }, h("h2", { class: "h2" }, "Driving"), h("div", { class: "keys" }, ...[[kb("throttle"), "Accelerate"], [kb("brake"), "Brake, then reverse when stopped"], [[...kb("steerLeft"), ...kb("steerRight")], "Steer left / right"], [kb("handbrake"), "Handbrake (pitch the tail in hairpins)"], [[...kb("gearUp"), ...kb("gearDown")], "Gears (manual box)"], [kb("camera"), "Camera"], [kb("reset"), "Back to the last checkpoint (time penalty)"], [kb("restart"), "Restart (single stage and time trial only)"], [kb("pause"), "Pause"], [kb("hud"), "Hide HUD"]].flatMap(([a, b]) => [h("span", null, a), h("span", null, b)]))),
          h("div", { class: "panel" }, h("h2", { class: "h2" }, "Pace notes"), h("p", null, "Your co-driver calls the road ahead. “Left three” is a medium left; one is a hairpin, six is nearly flat. Notes appear down the left of the screen with distances."), h("div", { class: "notes-sample" }, ["L2", "R4", "crest", "jump", "ford"].map((i) => h("div", null, svgNode(glyphSvg(i)), h("span", null), h("span", { class: "muted" }, i))))),
          h("div", { class: "panel" }, h("h2", { class: "h2" }, "The championship"), h("p", null, "Six stages in order against seven rivals. Fastest stage time scores 10 points, then 8-6-5-4-3-2-1. Penalties are added to your time."), h("p", null, "Between stages the service area gives you limited repair minutes and setup choices. Total damage of 100 % ends your stage."), h("p", null, "Stuck, rolled or lost? Press R to be put back at the last checkpoint for a penalty; the game also does this if you make no progress for 25 s. There is no restart in a championship: retire (DNF) or finish. Moving at the start before GO costs 5 s.")),
          h("div", { class: "panel" }, h("h2", { class: "h2" }, "Touch & pad"), h("p", null, "On touch screens, drag the wheel strip to steer and use the pedals on the right, or switch on tilt steering in Options. On a gamepad use the triggers for throttle and brake, the stick to steer, bumpers for gears and B for the handbrake."))),
        h("div", { class: "screen-foot" }, backBtn(onBack))]);
    },
    credits({ onBack, version }) {
      mount("credits", "plain", [head("Made in Aotearoa", "Credits"),
        h("div", { class: "howto" },
          h("div", { class: "panel" }, h("h2", { class: "h2" }, "Game"), h("p", null, `Aotearoa Rally ${version}. Six New Zealand stages, four fictional cars and the whole soundtrack are made in code: the roads, terrain, car models, engine and surface audio, and the driving physics are procedural geometry, audio synthesis and simulation running in your browser. The textures, the key art and the stage and loading pictures were generated with an AI image generator and then processed for this game. No real car makes or rally brands are used; every car carries one sponsor, 0x4d44 software, the author of this almanac.`)),
          h("div", { class: "panel" }, h("h2", { class: "h2" }, "Licences"), h("p", null, "Three.js r186, MIT licence, © three.js authors (vendor/THREE-LICENSE.txt). Image prompts and the processing steps are logged in tools/ui-art/PROMPTS.md."), h("p", { class: "muted" }, "Fonts: your system's own condensed sans-serif; nothing is downloaded at runtime.")),
          h("div", { class: "panel" }, h("h2", { class: "h2" }, "Te reo"), h("p", null, "Names such as Huia, Kea, Takahē and Pīwakawaka are native birds of Aotearoa. Stage names are real places; the courses are fictional.")),
        ),
        h("div", { class: "screen-foot" }, backBtn(onBack))]);
    },

    // ---------------------------------------------------------------- replay bar
    replayBar({ duration, result = null, onToggle, onSeek, onSpeed, onShot, onExit }) {
      let bar = document.getElementById("replay-bar");
      bar && bar.remove();
      clear(root);
      current = "replay";
      const mss = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, "0")}`; };
      const play = h("button", { class: "btn small", type: "button", "aria-label": "Play or pause", onclick: () => onToggle() }, "\u275A\u275A");
      const seek = h("input", { type: "range", min: "0", max: String(Math.ceil(duration * 10)), value: "0", "aria-label": "Seek replay", oninput: (e) => onSeek(+e.target.value / 10) });
      const time = h("span", { class: "mono rb-time" }, "0:00.0");
      const total = h("span", { class: "mono muted rb-total" }, "/ " + mss(duration));
      const speed = h("button", { class: "btn small", type: "button", "aria-label": "Playback speed", onclick: () => onSpeed() }, "1x");
      const shot = h("button", { class: "btn small", type: "button", "aria-label": "Change replay camera", onclick: () => onShot() }, "Broadcast");
      const title = h("div", { class: "rb-title" }, h("span", { class: "kicker" }, "Replay"), result && Number.isFinite(result.total) ? h("b", { class: "mono" }, fmtTime(result.total)) : null);
      bar = h("div", { class: "replay-bar", id: "replay-bar", role: "group", "aria-label": "Replay controls" }, title, play, seek, h("span", { class: "rb-clock" }, time, total), speed, shot, h("button", { class: "btn small primary", type: "button", "data-back": "1", onclick: () => onExit() }, "Back"));
      root.append(h("section", { class: "screen clear", "data-screen": "replay" }, bar));
      ctx.onMount && ctx.onMount("replay", bar);
      return { play, seek, time, speed, shot, setPos(t, playing) { seek.value = String(Math.round(t * 10)); time.textContent = mss(t); play.textContent = playing ? "\u275A\u275A" : "\u25B6"; } };
    },
    notice(text) { return h("p", null, text); },
  };
  void DEFAULT_OPTIONS;
  return api;
}
