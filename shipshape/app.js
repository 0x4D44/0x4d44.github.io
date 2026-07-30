import { EXERCISES, FORM_REMINDERS, MILESTONES, NUTRITION_NUDGES, PERIOD_LABELS } from "./content.js";
import {
  calculateStats,
  createInitialState,
  encouragement,
  ensurePlanForDate,
  findExercise,
  isoDate,
  logDuty,
  nagMessage,
  nextPendingDuty,
  readinessScore,
  serialiseState,
  setLowEnergyMode,
  switchLocationMode,
  validateImportData
} from "./engine.js";
import { createBrowserStorage } from "./storage.js";

const root = document.querySelector("#app");
const nowDate = () => isoDate(new Date());
const NAV = [
  ["bridge", "Bridge"],
  ["engine", "Engine"],
  ["log", "Log"],
  ["chart", "Chart"],
  ["settings", "Gear"]
];

let storage;
let state = createInitialState();
let view = "bridge";
let nagTick;
let timerTick;

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[c]);

const niceDate = (d) => new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric"
}).format(new Date(`${d}T12:00:00`));

boot();

async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  storage = await createBrowserStorage();
  state = ensurePlanForDate(await storage.load(), nowDate());
  theme();
  loopNag();
  render();
}

async function save(next = state) {
  state = await storage.save(next);
  theme();
  loopNag();
  render();
}

function theme() {
  document.documentElement.dataset.theme = state.settings?.theme || "system";
}

function render() {
  state = ensurePlanForDate(state, nowDate());
  root.innerHTML = state.initialized ? shell() : welcome();
  bind();
  if (view === "chart") requestAnimationFrame(drawCharts);
}

function shell() {
  return `
    <main class="app-stage">
      <section class="phone-frame" aria-label="Shipshape app">
        <div class="phone-screen">
          ${statusBar()}
          <div class="screen-scroll">
            ${activeView()}
          </div>
          ${bottomNav()}
          <dialog id="dutyDialog" class="dialog"></dialog>
        </div>
      </section>
    </main>`;
}

function activeView() {
  if (view === "engine") return engineRoom();
  if (view === "log") return shipsLog();
  if (view === "chart") return chartRoom();
  if (view === "settings") return settings();
  return bridge();
}

function welcome() {
  return `
    <main class="app-stage">
      <section class="phone-frame" aria-label="Shipshape onboarding">
        <div class="phone-screen">
          ${statusBar()}
          <div class="screen-scroll welcome-scroll">
            <section class="welcome-card">
              ${gauge(72, "Ready")}
              <p class="kicker">Ship's engineer report</p>
              <h1>Shipshape</h1>
              <p class="lede">A calm, private maintenance log for tiny upper-body and core duties spread across the day.</p>
              <div class="assurance-grid">
                <span>Private local logbook</span>
                <span>Offline after first load</span>
                <span>No accounts</span>
                <span>No weight or calorie tracking</span>
              </div>
              <form id="onboardForm">
                <fieldset>
                  <legend>Home equipment</legend>
                  <label><input type="checkbox" name="rings" checked> Ceiling rings are available</label>
                  <label><input type="checkbox" name="bands"> Resistance bands may be available</label>
                </fieldset>
                <fieldset>
                  <legend>Default watch station</legend>
                  <label><input type="radio" name="mode" value="home" checked> Home: rings and 2/4/5 kg weights</label>
                  <label><input type="radio" name="mode" value="hotel_gym"> Hotel gym when travelling</label>
                </fieldset>
                <fieldset>
                  <legend>Nag mode</legend>
                  <label><input type="checkbox" name="nag"> Gentle reminders where the browser allows them</label>
                  <p class="muted">Shipshape always shows in-app overdue prompts. Browser notifications are best-effort local reminders.</p>
                </fieldset>
                <button class="primary wide">Open the Bridge</button>
              </form>
            </section>
          </div>
        </div>
      </section>
    </main>`;
}

function statusBar() {
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  return `
    <div class="status-bar" aria-hidden="true">
      <span>${time}</span>
      <span class="camera-slot"></span>
      <span>LTE</span>
    </div>`;
}

function bottomNav() {
  return `
    <nav class="bottom-nav" aria-label="Shipshape sections">
      ${NAV.map(([id, label]) => `
        <button class="nav-button ${view === id ? "active" : ""}" data-view="${id}" type="button">
          ${navIcon(id)}
          <span>${esc(label)}</span>
        </button>`).join("")}
    </nav>`;
}

function navIcon(id) {
  const icons = {
    bridge: '<path d="M3 17 A9 9 0 0 1 21 17"/><path d="M12 17 17 8"/><circle cx="12" cy="17" r="1.5"/>',
    engine: '<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    log: '<path d="M7 5h10M7 10h10M7 15h7"/><path d="M5 3h14v18H5z"/>',
    chart: '<path d="M4 19h16"/><path d="M7 16V9M12 16V5M17 16v-4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[id]}</svg>`;
}

function brandRow(label) {
  return `
    <header class="brand-row">
      <div>
        <a href="../" class="back">&larr; almanac</a>
        <span class="brand">Shipshape</span>
        <span class="date-label">${esc(niceDate(nowDate()))}</span>
      </div>
      ${label ? `<span class="condition-pill">${esc(label)}</span>` : ""}
    </header>`;
}

function bridge() {
  const d = nowDate();
  const plan = state.plans[d];
  const condition = readinessScore(state, d);
  const stats = calculateStats(state, d);
  const next = nextPendingDuty(plan);
  const touched = plan.duties.filter((duty) => duty.status === "done" || duty.status === "partial").length;
  const headline = plan.maintained ? encouragement(state, d) : nagMessage(state, d);
  const reminder = FORM_REMINDERS[(state.logs.length + d.length) % FORM_REMINDERS.length];

  return `
    <section class="view-stack bridge-view">
      ${brandRow(condition.label)}
      <article class="condition-card">
        <div class="condition-gauge">${gauge(condition.score, condition.label)}</div>
        <div>
          <p class="kicker">Ship condition</p>
          <h2>${esc(condition.label)}</h2>
          <p>${esc(condition.detail)}</p>
        </div>
        <p class="mentor">${esc(headline)}</p>
      </article>
      ${next ? nextDutyPanel(next) : completePanel()}
      <section class="watch-list" aria-label="Today's watch">
        <p class="section-kicker">Today's watch</p>
        ${plan.duties.map(dutyCard).join("")}
      </section>
      <div class="metric-strip">
        <span><b>${stats.currentStreak}</b> day streak</span>
        <span><b>${touched}</b> duties touched</span>
      </div>
      <div class="bridge-actions">
        <button class="secondary" data-low="${!plan.lowEnergyMode}">${plan.lowEnergyMode ? "Normal day" : "Low-energy day"}</button>
        <button class="secondary" data-loc="${plan.locationMode === "home" ? "hotel_gym" : "home"}" aria-label="${plan.locationMode === "home" ? "hotel gym today" : "home equipment"}">${plan.locationMode === "home" ? "Hotel gym today" : "Home equipment"}</button>
        <button class="primary" data-anything>20-second brace</button>
      </div>
      <p class="reminder">${esc(reminder)}</p>
    </section>`;
}

function nextDutyPanel(duty) {
  const exercise = findExercise(duty.exerciseId);
  return `
    <article class="next-duty">
      <p class="kicker">Next duty &middot; ${esc(PERIOD_LABELS[duty.period] || duty.period)}</p>
      <div class="next-duty-body">
        ${plateArt(exercise?.diagramType, "large")}
        <div>
          <h2>${esc(duty.title)}</h2>
          <p class="target">${esc(duty.targetDescription)}</p>
          <p>${esc(exercise?.purpose || "")}</p>
        </div>
      </div>
      <div class="next-actions">
        <button class="primary" data-open="${esc(duty.id)}">Log this duty</button>
        <button class="outline" data-fast="skipped" data-duty="${esc(duty.id)}">Skip</button>
      </div>
    </article>`;
}

function completePanel() {
  return `
    <article class="complete-panel">
      <h2>Watch complete</h2>
      <p>All duties are logged. Extra maintenance is welcome, never required.</p>
    </article>`;
}

function dutyCard(duty) {
  const exercise = findExercise(duty.exerciseId);
  return `
    <article class="duty-card ${esc(duty.status)}">
      ${plateArt(exercise?.diagramType, "thumb")}
      <div class="duty-copy">
        <p class="period">${esc(PERIOD_LABELS[duty.period] || duty.period)}</p>
        <h3>${esc(duty.title)}</h3>
        <p>${esc(duty.targetDescription)}</p>
      </div>
      <span class="status-dot ${esc(duty.status)}">${statusLabel(duty.status)}</span>
      <div class="duty-controls">
        <button data-open="${esc(duty.id)}" type="button">Log</button>
        <button data-fast="done" data-duty="${esc(duty.id)}" type="button">Done</button>
      </div>
    </article>`;
}

function statusLabel(status) {
  if (status === "done") return "Done";
  if (status === "partial") return "Part";
  if (status === "skipped") return "Skip";
  return "";
}

function engineRoom() {
  return `
    <section class="view-stack">
      ${viewHead("Engine Room", "Small vocabulary, high leverage", "Every duty carries a plate, a purpose and a gentle progression.")}
      ${["home", "hotel_gym"].map((mode) => `
        <section class="library-section">
          <h3>${mode === "home" ? "Home watch" : "Hotel gym watch"}</h3>
          <div class="exercise-grid">
            ${EXERCISES.filter((exercise) => exercise.locationModes.includes(mode) && exercise.category !== "nutrition").map(exerciseCard).join("")}
          </div>
        </section>`).join("")}
    </section>`;
}

function exerciseCard(exercise) {
  return `
    <article class="exercise-card">
      ${plateArt(exercise.diagramType, "medium")}
      <div>
        <p class="kicker">${esc(exercise.category)} &middot; ${esc(exercise.equipment.join(", "))}</p>
        <h3>${esc(exercise.name)}</h3>
        <p>${esc(exercise.longevityWhy)}</p>
        <details>
          <summary>Instructions and form</summary>
          ${details(exercise)}
        </details>
      </div>
    </article>`;
}

function details(exercise) {
  return `
    <h4>Steps</h4>
    <ol>${exercise.instructions.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
    <h4>Beginner version</h4>
    <p>${esc(exercise.beginnerVersion)}</p>
    <h4>Progression</h4>
    <p>${esc(exercise.progression)}</p>
    <h4>Common mistakes</h4>
    <ul>${exercise.commonMistakes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <h4>Safety notes</h4>
    <ul>${exercise.safetyNotes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
}

function shipsLog() {
  const stats = calculateStats(state, nowDate());
  const recent = [...state.logs].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 12);
  const seen = new Set(state.milestonesSeen || []);

  return `
    <section class="view-stack">
      ${viewHead("Ship's Log", "Consistency, not perfection", "Exercise maintenance only. No weight, calories, sleep, mood or medical tracking.")}
      <div class="stat-grid">
        <span><b>${stats.maintainedDays}</b> days maintained</span>
        <span><b>${stats.currentStreak}</b> current streak</span>
        <span><b>${stats.longestStreak}</b> longest streak</span>
        <span><b>${stats.totalDuties}</b> duties completed</span>
      </div>
      <section>
        <p class="section-kicker">Last 4 weeks</p>
        <div class="calendar">
          ${lastDays(28).map((day) => `<span class="day ${state.plans[day]?.maintained ? "kept" : ""}" title="${day}">${day.slice(8)}</span>`).join("")}
        </div>
      </section>
      <section>
        <h3>Milestone plates</h3>
        <div class="plates">${MILESTONES.map((m) => `<span class="plate ${seen.has(m.id) ? "earned" : ""}">${esc(m.text)}</span>`).join("")}</div>
      </section>
      <section>
        <h3>Recent log entries</h3>
        ${recent.length ? recent.map(logEntry).join("") : '<p class="empty">No entries yet. One tiny duty will start the logbook.</p>'}
      </section>
    </section>`;
}

function logEntry(entry) {
  return `
    <article class="entry">
      <b>${esc(findExercise(entry.exerciseId)?.name || entry.exerciseId)}</b>
      <span>${esc(entry.date)} &middot; ${esc(entry.status)}${entry.feedback ? ` &middot; ${esc(entry.feedback.replaceAll("_", " "))}` : ""}</span>
    </article>`;
}

function chartRoom() {
  const condition = readinessScore(state, nowDate());
  const progress = Object.values(state.progression).filter((p) => p.currentLevel || p.bestSeconds || p.bestReps || p.bestWeightKg);

  return `
    <section class="view-stack">
      ${viewHead("Chart Room", "Trends without judgement", "Condition reflects recent consistency and coverage, not moral worth.")}
      <article class="chart-card">
        <h3>Maintenance minutes</h3>
        <canvas id="minutesChart" width="720" height="260"></canvas>
      </article>
      <article class="chart-card">
        <h3>Duties completed</h3>
        <canvas id="dutiesChart" width="720" height="260"></canvas>
      </article>
      <article class="condition-card compact">
        <div class="condition-gauge">${gauge(condition.score, condition.label)}</div>
        <div>
          <h3>${esc(condition.label)}</h3>
          <p>${esc(condition.detail)}</p>
          <p>Seaworthy &middot; Needs light maintenance &middot; Back on watch &middot; Voyage resumed.</p>
        </div>
      </article>
      <section>
        <h3>Exercise progression</h3>
        <div class="progression-grid">
          ${progress.length ? progress.map(progressCard).join("") : '<p class="empty">Progression calibrates after a few logged duties. No formal fitness test required.</p>'}
        </div>
      </section>
    </section>`;
}

function progressCard(progress) {
  return `
    <article class="progress-card">
      <b>${esc(findExercise(progress.exerciseId)?.name || progress.exerciseId)}</b>
      <span>Level ${progress.currentLevel || 0}</span>
      <small>${progress.bestSeconds ? `Best ${progress.bestSeconds}s` : ""} ${progress.bestReps ? `Best ${progress.bestReps} reps` : ""} ${progress.bestWeightKg ? `Best ${progress.bestWeightKg} kg` : ""}</small>
    </article>`;
}

function settings() {
  const permission = typeof Notification === "undefined" ? "not supported" : Notification.permission;

  return `
    <section class="view-stack">
      ${viewHead("Settings", "Local engine-room controls", `All runtime data stays in this browser. Storage: ${storage.kind}.`)}
      <form id="settingsForm" class="settings-grid">
        <label>Theme
          <select name="theme">
            <option value="system" ${state.settings.theme === "system" ? "selected" : ""}>System</option>
            <option value="dark" ${state.settings.theme === "dark" ? "selected" : ""}>Dark</option>
            <option value="light" ${state.settings.theme === "light" ? "selected" : ""}>Light</option>
          </select>
        </label>
        <label><input type="checkbox" name="rings" ${state.settings.equipment.rings ? "checked" : ""}> Rings available at home</label>
        <label><input type="checkbox" name="bands" ${state.settings.equipment.resistanceBandsMaybe ? "checked" : ""}> Resistance bands may exist</label>
        <label><input type="checkbox" name="nag" ${state.settings.nagModeEnabled ? "checked" : ""}> Nag mode enabled</label>
        <button class="primary">Save settings</button>
      </form>
      <article class="notice">
        <h3>Install and offline</h3>
        <p>The manifest and service worker make Shipshape installable and cache the app shell after first load. Browser notification permission is currently: <b>${esc(permission)}</b>.</p>
        <button data-notify>Enable browser notifications</button>
      </article>
      <article class="notice">
        <h3>Backup and transfer</h3>
        <p>Export/import is readable JSON with storage version and validation before replacement.</p>
        <div class="bridge-actions">
          <button class="primary" data-export>Export JSON backup</button>
          <label class="file-button">Import JSON backup<input type="file" accept="application/json,.json" data-import hidden></label>
          <button class="danger" data-reset>Reset local data</button>
        </div>
      </article>
      <article class="notice">
        <h3>Nutrition nudges included</h3>
        <p>${NUTRITION_NUDGES.slice(0, 4).map(esc).join(" &middot; ")}.</p>
      </article>
    </section>`;
}

function viewHead(kicker, title, copy) {
  return `
    <header class="view-head">
      ${brandRow()}
      <p class="kicker">${esc(kicker)}</p>
      <h2>${esc(title)}</h2>
      <p>${esc(copy)}</p>
    </header>`;
}

function bind() {
  root.querySelector("#onboardForm")?.addEventListener("submit", onboard);
  root.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = () => {
      view = button.dataset.view;
      render();
    };
  });
  root.querySelectorAll("[data-open]").forEach((button) => {
    button.onclick = () => openDuty(button.dataset.open);
  });
  root.querySelectorAll("[data-fast]").forEach((button) => {
    button.onclick = () => quick(button.dataset.duty, button.dataset.fast);
  });
  root.querySelector("[data-low]")?.addEventListener("click", (event) => save(setLowEnergyMode(state, nowDate(), event.currentTarget.dataset.low === "true")));
  root.querySelector("[data-loc]")?.addEventListener("click", (event) => save(switchLocationMode(state, nowDate(), event.currentTarget.dataset.loc)));
  root.querySelector("[data-anything]")?.addEventListener("click", openAnything);
  root.querySelector("#settingsForm")?.addEventListener("submit", saveSettings);
  root.querySelector("[data-notify]")?.addEventListener("click", requestNotifications);
  root.querySelector("[data-export]")?.addEventListener("click", exportBackup);
  root.querySelector("[data-import]")?.addEventListener("change", importBackup);
  root.querySelector("[data-reset]")?.addEventListener("click", resetAll);
}

async function onboard(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const next = {
    ...state,
    initialized: true,
    settings: {
      ...state.settings,
      locationModeDefault: form.get("mode"),
      nagModeEnabled: form.has("nag"),
      equipment: {
        ...state.settings.equipment,
        rings: form.has("rings"),
        resistanceBandsMaybe: form.has("bands")
      }
    }
  };
  await save(ensurePlanForDate(next, nowDate()));
  if (form.has("nag")) requestNotifications();
}

async function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await save({
    ...state,
    settings: {
      ...state.settings,
      theme: form.get("theme"),
      nagModeEnabled: form.has("nag"),
      equipment: {
        ...state.settings.equipment,
        rings: form.has("rings"),
        resistanceBandsMaybe: form.has("bands")
      }
    }
  });
}

function dutyById(id) {
  return state.plans[nowDate()].duties.find((duty) => duty.id === id);
}

function openAnything() {
  const plan = state.plans[nowDate()];
  const duty = {
    id: `${nowDate()}-emergency-brace`,
    date: nowDate(),
    exerciseId: "standing-core-brace",
    title: "Emergency standing core brace",
    period: "anytime",
    targetDescription: "20 seconds; enough to maintain the voyage",
    targetSeconds: 20,
    targetSets: 1,
    status: "pending"
  };
  if (!plan.duties.some((item) => item.id === duty.id)) plan.duties.unshift(duty);
  openDialog(duty);
}

function openDuty(id) {
  openDialog(dutyById(id));
}

function openDialog(duty) {
  if (!duty) return;
  const exercise = findExercise(duty.exerciseId);
  if (!exercise) return;
  const dialog = root.querySelector("#dutyDialog");
  if (!dialog) return;
  if (dialog.open) dialog.close();

  dialog.innerHTML = `
    <form method="dialog" id="dutyForm" class="sheet-form">
      <button class="sheet-close" value="cancel" aria-label="Close">&times;</button>
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-head">
        ${plateArt(exercise.diagramType, "sheet")}
        <div>
          <p class="kicker">${esc(PERIOD_LABELS[duty.period] || duty.period)}</p>
          <h2>${esc(duty.title)}</h2>
          <p class="target">${esc(duty.targetDescription)}</p>
          <p>${esc(exercise.purpose)}</p>
        </div>
      </div>
      <div class="timer-box">
        <button type="button" data-timer>Start timer</button>
        <output id="timerOutput">${duty.targetSeconds || 30}s</output>
      </div>
      <fieldset class="feeling-grid">
        <legend>How did it feel?</legend>
        <label><input type="radio" name="feedback" value="too_easy"> Too easy</label>
        <label><input type="radio" name="feedback" value="about_right" checked> About right</label>
        <label><input type="radio" name="feedback" value="too_hard"> Too hard</label>
        <label><input type="radio" name="feedback" value="pain_or_discomfort"> Pain or discomfort</label>
      </fieldset>
      <menu class="sheet-actions">
        <button type="button" class="danger" data-status="skipped">Skip</button>
        <button type="button" class="outline" data-status="partial">Part done</button>
        <button type="button" class="primary" data-status="done">Done</button>
      </menu>
      <fieldset class="log-fields">
        <legend>What actually happened?</legend>
        <label>Seconds <input name="seconds" type="number" min="0" value="${duty.targetSeconds || ""}"></label>
        <label>Sets <input name="sets" type="number" min="0" value="${duty.targetSets || 1}"></label>
        <label>Reps <input name="reps" type="number" min="0" value="${duty.targetReps || ""}"></label>
        <label>Weight kg <input name="weight" type="number" min="0" step="0.5" value="${duty.targetWeightKg || ""}"></label>
      </fieldset>
    </form>`;

  dialog.querySelector("[data-timer]").onclick = () => startTimer(duty.targetSeconds || 30);
  dialog.querySelectorAll("[data-status]").forEach((button) => {
    button.onclick = () => submit(duty, button.dataset.status, dialog);
  });
  dialog.showModal();
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

async function submit(duty, status, dialog) {
  const form = new FormData(dialog.querySelector("#dutyForm"));
  const entry = { status, feedback: form.get("feedback") };
  if (status !== "skipped") {
    entry.actualSeconds = numeric(form.get("seconds"));
    entry.actualSets = numeric(form.get("sets"));
    entry.actualReps = numeric(form.get("reps"));
    entry.actualWeightKg = numeric(form.get("weight"));
  }
  clearInterval(timerTick);
  dialog.close();
  await save(logDuty(state, nowDate(), duty.id, entry, new Date()));
}

async function quick(id, status) {
  const duty = dutyById(id);
  if (!duty) return;
  const entry = { status, feedback: status === "skipped" ? "too_hard" : "about_right" };
  if (status !== "skipped") {
    entry.actualSeconds = duty.targetSeconds;
    entry.actualSets = duty.targetSets;
    entry.actualReps = duty.targetReps;
    entry.actualWeightKg = duty.targetWeightKg;
  }
  await save(logDuty(state, nowDate(), id, entry, new Date()));
}

function startTimer(seconds) {
  clearInterval(timerTick);
  let left = seconds;
  const output = root.querySelector("#timerOutput");
  if (!output) return;
  output.textContent = `${left}s`;
  timerTick = setInterval(() => {
    left -= 1;
    output.textContent = left > 0 ? `${left}s` : "Complete";
    if (left <= 0) clearInterval(timerTick);
  }, 1000);
}

async function requestNotifications() {
  const settings = { ...state.settings, nagModeEnabled: true, notificationPermissionAsked: true };
  if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
  await save({ ...state, settings });
}

function loopNag() {
  clearInterval(nagTick);
  if (!state.settings?.nagModeEnabled) return;
  nagTick = setInterval(() => {
    const date = nowDate();
    const plan = ensurePlanForDate(state, date).plans[date];
    if (!plan.maintained && document.hidden && "Notification" in window && Notification.permission === "granted") {
      new Notification("Shipshape", { body: nagMessage(state, date), tag: "shipshape-duty" });
    }
  }, 2700000);
}

function exportBackup() {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([serialiseState(state)], { type: "application/json" }));
  anchor.download = `shipshape-backup-${nowDate()}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const result = validateImportData(text);
  if (!result.ok) return alert(result.error);
  if (!confirm("Replace this browser's Shipshape logbook with the selected backup?")) return;
  const imported = await storage.importJson(text);
  if (!imported.ok) return alert(imported.error);
  state = imported.value;
  theme();
  render();
}

async function resetAll() {
  if (confirm("Reset all local Shipshape data in this browser? This cannot be undone unless you exported a backup.")) {
    state = await storage.reset();
    theme();
    render();
  }
}

function lastDays(count) {
  const out = [];
  const date = new Date(`${nowDate()}T12:00:00`);
  for (let i = count - 1; i >= 0; i -= 1) {
    const item = new Date(date);
    item.setDate(date.getDate() - i);
    out.push(isoDate(item));
  }
  return out;
}

function drawCharts() {
  const days = lastDays(14);
  drawBar("minutesChart", days.map((day) => state.logs.filter((log) => log.date === day && log.status !== "skipped").reduce((sum, log) => sum + (log.actualSeconds ? log.actualSeconds / 60 : 0.5), 0)));
  drawBar("dutiesChart", days.map((day) => state.logs.filter((log) => log.date === day && (log.status === "done" || log.status === "partial")).length));
}

function drawBar(id, values) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = 28;
  const max = Math.max(1, ...values);
  const barWidth = ((width - padding * 2) / values.length) * 0.7;
  const css = getComputedStyle(document.documentElement);
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = css.getPropertyValue("--line");
  ctx.fillStyle = css.getPropertyValue("--brass");
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();
  values.forEach((value, index) => {
    const x = padding + index * ((width - padding * 2) / values.length) + barWidth * 0.15;
    const barHeight = (height - padding * 2) * (value / max);
    ctx.fillRect(x, height - padding - barHeight, barWidth, barHeight);
  });
}

function gauge(score, label) {
  const angle = -90 + (Math.max(0, Math.min(100, score)) / 100) * 180;
  return `
    <svg class="gauge" viewBox="0 0 200 132" role="img" aria-label="Ship condition ${esc(label)}">
      <path class="gauge-arc" d="M22 96 A78 78 0 0 1 178 96" />
      <path class="gauge-calm" d="M22 96 A78 78 0 0 1 100 18" />
      <path class="gauge-ready" d="M100 18 A78 78 0 0 1 178 96" />
      <g style="transform:rotate(${angle}deg);transform-origin:100px 96px">
        <line class="needle" x1="100" y1="96" x2="100" y2="48" />
      </g>
      <circle class="needle-hub" cx="100" cy="96" r="6" />
      <text x="100" y="126" text-anchor="middle">${Math.round(score)}</text>
    </svg>`;
}

function plateArt(type, size = "") {
  return `<div class="plate-art ${size}" aria-hidden="true">${diagram(type)}</div>`;
}

function diagram(type) {
  const floor = '<line class="floor" x1="14" y1="120" x2="104" y2="120" />';
  const joint = (x, y) => `<circle class="joint" cx="${x}" cy="${y}" r="1.9" />`;
  const svg = (inner) => `<svg class="diagram" viewBox="0 0 118 128">${inner}</svg>`;
  const figures = {
    hang: `${floor}
      <line class="room" x1="30" y1="12" x2="88" y2="12" />
      <line class="kit" x1="45" y1="12" x2="45" y2="29" />
      <line class="kit" x1="73" y1="12" x2="73" y2="29" />
      <circle class="kit" cx="45" cy="34" r="6" />
      <circle class="kit" cx="73" cy="34" r="6" />
      <g class="body sway" style="transform-origin:59px 40px">
        <path d="M45 40 L53 60" /><path d="M73 40 L65 60" />
        <circle class="head" cx="59" cy="55" r="7" />
        <path d="M59 62 L59 92" /><path d="M59 92 L51 116" /><path d="M59 92 L67 116" />
        ${joint(53, 60)}${joint(65, 60)}${joint(59, 92)}
      </g>`,
    row: `${floor}
      <line class="kit" x1="72" y1="12" x2="72" y2="27" />
      <circle class="kit" cx="72" cy="33" r="6" />
      <g class="body swayx" style="transform-origin:50px 90px">
        <path d="M32 116 L64 62" />
        <circle class="head" cx="70" cy="56" r="6.5" />
        <path d="M64 62 L74 51 L72 39" />
        <path d="M40 104 L34 116" />
        ${joint(64, 62)}${joint(74, 51)}
      </g>`,
    support: `${floor}
      <line class="kit" x1="42" y1="12" x2="42" y2="60" />
      <line class="kit" x1="76" y1="12" x2="76" y2="60" />
      <circle class="kit" cx="42" cy="66" r="6" />
      <circle class="kit" cx="76" cy="66" r="6" />
      <g class="body breathe" style="transform-origin:59px 90px">
        <circle class="head" cx="59" cy="42" r="7" />
        <path d="M59 49 L59 88" />
        <path d="M53 53 L42 66" /><path d="M65 53 L76 66" />
        <path d="M59 88 L51 116" /><path d="M59 88 L67 116" />
        ${joint(53, 53)}${joint(65, 53)}${joint(59, 88)}
      </g>`,
    press: `${floor}
      <g class="body breathe" style="transform-origin:59px 88px">
        <circle class="head" cx="59" cy="46" r="7" />
        <path d="M59 53 L59 88" />
        <path d="M59 60 L48 43" /><path d="M59 60 L70 43" />
        <path d="M59 88 L51 116" /><path d="M59 88 L67 116" />
        ${joint(59, 60)}${joint(51, 52)}${joint(67, 52)}${joint(59, 88)}
      </g>
      <g class="kit">
        <line x1="41" y1="39" x2="77" y2="39" />
        <rect x="38" y="33" width="5" height="12" rx="1.5" />
        <rect x="75" y="33" width="5" height="12" rx="1.5" />
      </g>
      <path class="kit hint" d="M89 58 L89 40 M85 45 L89 39 L93 45" />`,
    brace: `${floor}
      <g class="body breathe" style="transform-origin:59px 90px">
        <circle class="head" cx="59" cy="43" r="7" />
        <path d="M59 50 L59 90" />
        <path d="M59 60 L48 74" /><path d="M59 60 L70 74" />
        <path d="M59 90 L51 116" /><path d="M59 90 L67 116" />
        ${joint(59, 60)}${joint(59, 90)}
      </g>
      <path class="kit dash" d="M44 70 q-6 8 0 16" />
      <path class="kit dash" d="M74 70 q6 8 0 16" />`,
    carry: `${floor}
      <g class="body breathe" style="transform-origin:55px 90px">
        <circle class="head" cx="55" cy="43" r="7" />
        <path d="M55 50 L55 90" />
        <path d="M55 58 L46 80" /><path d="M55 58 L66 82" />
        <path d="M55 90 L48 116" /><path d="M55 90 L63 116" />
        ${joint(55, 58)}${joint(55, 90)}
      </g>
      <rect class="kit" x="61" y="83" width="12" height="18" rx="2.5" />
      <line class="kit" x1="67" y1="82" x2="67" y2="84" />`,
    pushup: `${floor}
      <line class="room" x1="98" y1="22" x2="98" y2="118" />
      <g class="body swayx" style="transform-origin:60px 90px">
        <path d="M28 116 L80 66" />
        <circle class="head" cx="86" cy="62" r="6.5" />
        <path d="M80 66 L94 60" />
        ${joint(80, 66)}
      </g>`,
    pallof: `${floor}
      <line class="room" x1="18" y1="22" x2="18" y2="118" />
      <line class="kit dash" x1="18" y1="64" x2="56" y2="66" />
      <rect class="kit-fill" x="15" y="61" width="4" height="6" />
      <g class="body breathe" style="transform-origin:74px 90px">
        <circle class="head" cx="74" cy="44" r="7" />
        <path d="M74 51 L74 90" />
        <path d="M74 58 L57 66" />
        <path d="M74 90 L66 116" /><path d="M74 90 L82 116" />
        ${joint(74, 58)}${joint(74, 90)}
      </g>`,
    pulldown: `${floor}
      <path class="room" d="M28 16 H90 V36" />
      <line class="kit lift" x1="43" y1="52" x2="75" y2="52" />
      <line class="kit" x1="59" y1="36" x2="59" y2="52" />
      <g class="body">
        <circle class="head" cx="59" cy="67" r="7" />
        <path d="M59 74 L59 104" />
        <path d="M43 54 L53 78" /><path d="M75 54 L65 78" />
        <path d="M59 104 L48 120" /><path d="M59 104 L70 120" />
        ${joint(53, 78)}${joint(65, 78)}${joint(59, 104)}
      </g>`,
    facepull: `${floor}
      <line class="room" x1="24" y1="22" x2="24" y2="118" />
      <line class="kit dash swayx" x1="24" y1="54" x2="72" y2="64" />
      <g class="body">
        <circle class="head" cx="78" cy="56" r="7" />
        <path d="M78 63 L78 96" />
        <path d="M72 64 L56 58" /><path d="M84 66 L98 74" />
        <path d="M78 96 L68 120" /><path d="M78 96 L88 120" />
        ${joint(72, 64)}${joint(84, 66)}${joint(78, 96)}
      </g>`,
    nutrition: `${floor}
      <circle class="kit" cx="59" cy="74" r="28" />
      <path class="body breathe" d="M48 73 q16-28 38-8 q-21 3-38 8" />
      <path class="room" d="M35 102 h48" />`
  };
  return svg(figures[type] || figures.brace);
}
