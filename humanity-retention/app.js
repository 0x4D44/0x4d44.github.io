import { ACHIEVEMENTS, ACTIONS, CODEX, DIFFICULTIES } from "./content.js";
import { advanceTurn, applyAction, averagePressure, canApplyAction, completeRun, createRun, scoreRun, summary } from "./engine.js";
import { AudioManager } from "./audio.js";
import { autosave, exportProgress, importProgress, loadProgress, resetProgress, saveProgress } from "./storage.js";

const root = document.getElementById("app");
let progress = loadProgress();
let run = null;
let selectedRegion = null;
let screen = "menu";
let dev = new URLSearchParams(location.search).has("dev");
let typed = "";
const audio = new AudioManager(progress.settings);

const esc = (value) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
const pct = (value) => `<span class="meter"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></span><b>${Math.round(value)}</b>`;
const currentDifficulty = () => DIFFICULTIES[run?.difficulty || "standard"] || DIFFICULTIES.standard;

function persist() {
  progress.settings = { ...audio.settings };
  autosave(progress);
}

function startRun(mode) {
  const difficulty = mode === "tutorial" ? "tutorial" : mode === "crisis" ? "crisis" : "standard";
  const seed = document.getElementById("seed")?.value.trim() || `${mode}-${new Date().toISOString().slice(0, 10)}`;
  run = createRun({ mode, difficulty, seed });
  selectedRegion = run.regions[0].id;
  screen = "game";
  audio.blip("success");
  render();
}

function finishIfNeeded(previous, next) {
  if (!previous?.over && next.over) {
    progress = completeRun(progress, next);
    saveProgress(progress);
    audio.blip(next.ending?.id === "retained" ? "unlock" : "alert");
  }
}

function doAction(actionId) {
  if (!run) return;
  audio.start();
  const check = canApplyAction(run, actionId, selectedRegion);
  if (!check.ok) {
    audio.blip("fail");
    run.log.unshift(check.reason);
    render();
    return;
  }
  const result = applyAction(run, actionId, selectedRegion);
  run = result.state;
  audio.blip(result.ok ? "click" : "fail");
  render();
}

function nextTurn() {
  if (!run) return;
  audio.start();
  const before = run;
  run = advanceTurn(run);
  finishIfNeeded(before, run);
  audio.blip(run.over ? "success" : "ai");
  render();
}

function meterPanel() {
  const meters = run.meters;
  return `
    <section class="panel meters" aria-label="programme meters">
      ${Object.entries(meters).map(([key, value]) => `<div><span>${esc(key)}</span>${pct(value)}</div>`).join("")}
      <div><span>pressure</span>${pct(averagePressure(run))}</div>
    </section>`;
}

function regionPanel() {
  return `
    <section class="panel map" aria-label="regions">
      <header><h2>Regions</h2><small>${esc(currentDifficulty().label)} protocol</small></header>
      <div class="regions">
        ${run.regions.map((region) => `
          <button class="region ${region.id === selectedRegion ? "active" : ""}" data-command="select-region" data-region="${region.id}">
            <span><strong>${esc(region.name)}</strong><em>${esc(region.trait)}</em></span>
            <span class="mini danger" style="--v:${region.infection}"></span>
            <span class="grid-two"><b>pressure ${region.infection}</b><b>coop ${region.cooperation}</b><b>labs ${region.labs}</b><b>rumour ${region.misinformation}</b></span>
          </button>`).join("")}
      </div>
    </section>`;
}

function actionPanel() {
  return `
    <section class="panel actions" aria-label="actions">
      <header><h2>Actions</h2><small>${selectedRegion ? esc(run.regions.find((region) => region.id === selectedRegion)?.name) : "global"}</small></header>
      <div class="action-list">
        ${ACTIONS.map((action) => {
          const check = canApplyAction(run, action.id, selectedRegion);
          return `<button class="action" data-command="action" data-action="${action.id}" ${check.ok ? "" : "disabled"}>
            <strong>${esc(action.name)}</strong>
            <span>${esc(action.text)}</span>
            <small>${action.scope}${run.cooldowns[action.id] ? ` / cooldown ${run.cooldowns[action.id]}` : ""}${check.ok ? "" : ` / ${esc(check.reason)}`}</small>
          </button>`;
        }).join("")}
      </div>
    </section>`;
}

function logPanel() {
  return `
    <section class="panel log" aria-label="event log">
      <header><h2>History</h2><button data-command="next-turn" ${run.over ? "disabled" : ""}>Next Turn</button></header>
      <ol>${run.log.map((line) => `<li>${esc(line)}</li>`).join("")}</ol>
    </section>`;
}

function gameScreen() {
  const facts = summary(run);
  return `
    <main class="shell">
      <nav class="topbar">
        <button data-command="menu">Almanac</button>
        <button data-command="codex">Codex</button>
        <button data-command="achievements">Badges</button>
        <button data-command="options">Options</button>
      </nav>
      <section class="hero panel">
        <div>
          <small>Turn ${run.turn} / ${run.maxTurns} - seed ${esc(run.seed)}</small>
          <h1>${run.over ? esc(run.ending.title) : "Humanity Retention Programme"}</h1>
          <p>${run.over ? esc(run.ending.text) : `Worst region: ${esc(facts.worstRegion.name)}. Current score projection ${facts.score}.`}</p>
        </div>
        <div class="score"><span>${scoreRun(run)}</span><small>score</small></div>
      </section>
      ${meterPanel()}
      <div class="game-grid">
        ${regionPanel()}
        ${actionPanel()}
        ${logPanel()}
      </div>
      ${dev ? devPanel() : ""}
    </main>`;
}

function menuScreen() {
  return `
    <main class="shell menu-shell">
      <section class="hero panel">
        <div>
          <small>0x4D44 Almanac / offline static app</small>
          <h1>Humanity Retention Programme</h1>
          <p>Run a suspicious civic dashboard through fictional crises. Keep trust, research, economy, ethics and AI stability intact without turning people into variables.</p>
        </div>
        <div class="score"><span>${progress.bestScore}</span><small>best</small></div>
      </section>
      <section class="panel launch">
        <label>Seed <input id="seed" value="arthur-retains-2026" autocomplete="off"></label>
        <div class="button-row">
          <button data-command="start" data-mode="tutorial">Tutorial</button>
          <button data-command="start" data-mode="quick">Quick Play</button>
          <button data-command="start" data-mode="campaign">Campaign</button>
          <button data-command="start" data-mode="crisis">Crisis</button>
        </div>
        <div class="button-row secondary">
          <button data-command="codex">Codex</button>
          <button data-command="achievements">Achievements</button>
          <button data-command="options">Options</button>
        </div>
      </section>
    </main>`;
}

function codexScreen() {
  progress.codexRead = [...new Set([...progress.codexRead, ...CODEX.map((item) => item.id)])];
  persist();
  return `
    <main class="shell">
      <nav class="topbar"><button data-command="menu">Back</button></nav>
      <section class="panel"><h1>Codex</h1><div class="cards">${CODEX.map((item) => `<article><h2>${esc(item.title)}</h2><p>${esc(item.body)}</p></article>`).join("")}</div></section>
    </main>`;
}

function achievementsScreen() {
  const owned = new Set(progress.achievements);
  return `
    <main class="shell">
      <nav class="topbar"><button data-command="menu">Back</button></nav>
      <section class="panel"><h1>Achievements</h1><div class="cards">${ACHIEVEMENTS.map((item) => `<article class="${owned.has(item.id) ? "owned" : "locked"}"><h2>${esc(item.name)}</h2><p>${esc(item.text)}</p></article>`).join("")}</div></section>
    </main>`;
}

function optionsScreen() {
  return `
    <main class="shell">
      <nav class="topbar"><button data-command="menu">Back</button></nav>
      <section class="panel options">
        <h1>Options</h1>
        <label><input type="checkbox" data-setting="mute" ${progress.settings.mute ? "checked" : ""}> Mute</label>
        <label><input type="checkbox" data-setting="music" ${progress.settings.music ? "checked" : ""}> Music</label>
        <label><input type="checkbox" data-setting="sfx" ${progress.settings.sfx ? "checked" : ""}> Effects</label>
        <label>Volume <input type="range" min="0" max="100" value="${Math.round(progress.settings.volume * 100)}" data-setting="volume"></label>
        <textarea id="savebox" rows="6" spellcheck="false">${esc(exportProgress(progress))}</textarea>
        <div class="button-row"><button data-command="import-save">Import</button><button data-command="reset-save">Reset</button></div>
      </section>
    </main>`;
}

function devPanel() {
  return `<section class="panel dev"><h2>Dev panel</h2><div class="button-row"><button data-command="dev-win">Complete Run</button><button data-command="dev-pressure">Spawn Pressure</button><button data-command="dev-unlock">Unlock Badges</button></div></section>`;
}

function render() {
  if (screen === "game" && run) root.innerHTML = gameScreen();
  else if (screen === "codex") root.innerHTML = codexScreen();
  else if (screen === "achievements") root.innerHTML = achievementsScreen();
  else if (screen === "options") root.innerHTML = optionsScreen();
  else root.innerHTML = menuScreen();
}

root.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const { command } = button.dataset;
  audio.start();
  if (command === "start") startRun(button.dataset.mode);
  if (command === "menu") { screen = "menu"; render(); }
  if (command === "codex") { screen = "codex"; render(); }
  if (command === "achievements") { screen = "achievements"; render(); }
  if (command === "options") { screen = "options"; render(); }
  if (command === "select-region") { selectedRegion = button.dataset.region; audio.blip("click"); render(); }
  if (command === "action") doAction(button.dataset.action);
  if (command === "next-turn") nextTurn();
  if (command === "import-save") {
    const imported = importProgress(document.getElementById("savebox")?.value || "");
    if (imported.ok) { progress = imported.value; saveProgress(progress); audio.blip("success"); } else audio.blip("fail");
    render();
  }
  if (command === "reset-save") { progress = resetProgress(); audio.blip("alert"); render(); }
  if (command === "dev-win" && run) { run.turn = run.maxTurns; run.meters.trust = 85; run.meters.ethics = 88; run.regions.forEach((region) => { region.infection = 12; region.misinformation = 10; }); nextTurn(); }
  if (command === "dev-pressure" && run) { run.regions.forEach((region) => { region.infection = Math.min(100, region.infection + 18); }); render(); }
  if (command === "dev-unlock") { progress.achievements = ACHIEVEMENTS.map((item) => item.id); saveProgress(progress); audio.blip("unlock"); render(); }
});

root.addEventListener("change", (event) => {
  const setting = event.target.dataset.setting;
  if (!setting) return;
  if (setting === "volume") progress.settings.volume = Number(event.target.value) / 100;
  else progress.settings[setting] = event.target.checked;
  audio.update(progress.settings);
  saveProgress(progress);
});

window.addEventListener("keydown", (event) => {
  typed = (typed + event.key.toLowerCase()).slice(-6);
  if (typed === "retain") { dev = true; audio.blip("unlock"); render(); }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

render();
