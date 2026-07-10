import {
  CABIN_PLANS,
  COMPANY_NAMES,
  DIFFICULTIES,
  FEATURES,
  FOCUSES,
  HULLS,
  LEVELS,
  MARKETING_CHANNELS,
  MARKETS,
  SEGMENTS,
  SHIP_NAMES,
  SPEEDS,
  TIPS,
} from "./content.mjs";
import {
  advanceQuarter,
  assignRoute,
  availableCredit,
  borrow,
  calendarSeason,
  continueSandbox,
  creditLimit,
  createNewGame,
  enterpriseValue,
  forecastQuarter,
  levelForState,
  levelProgress,
  marketPressure,
  orderShip,
  quarterLabel,
  rankCompanies,
  refitShip,
  repairShip,
  repayDebt,
  rebrand,
  sellShip,
  setMarketing,
  setMarketPrice,
  setOperation,
  unlockedFeatureIds,
  unlockedHullIds,
  unlockedMarketIds,
  validateShipDesign,
  quoteShipDesign,
} from "./engine.mjs";
import { ADVISERS, TOUR_TABS, guidanceFor } from "./guidance.mjs";
import { clearGame, loadGame, loadPrefs, saveGame, savePrefs } from "./storage.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const e = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const number1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const compactNumber = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });

let state = null;
let savedState = loadGame();
let prefs = loadPrefs();
let audioContext = null;
let toastTimer = null;
let lastFocused = null;
let modalClosable = true;
let marketFilter = "all";
let shipyardDesign = null;

function money(value, signed = false) {
  const amount = Number(value) || 0;
  const sign = signed && amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}£${number1.format(Math.abs(amount))}m`;
}

function fareMoney(value) {
  return `£${number.format(Number(value) || 0)}`;
}

function integer(value, compact = false) {
  return (compact ? compactNumber : number).format(Math.round(Number(value) || 0));
}

function pct(value, digits = 0) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}

function score(value) {
  return `${Math.round(Number(value) || 0)}/100`;
}

function classForNumber(value) {
  if (value > 0.01) return "positive";
  if (value < -0.01) return "negative";
  return "neutral";
}

function conditionLabel(value) {
  if (value >= 90) return "Excellent";
  if (value >= 75) return "Good";
  if (value >= 60) return "Watch";
  return "Yard due";
}

function levelValue(value, requirement) {
  if (requirement.id === "value") return money(value);
  if (requirement.id === "passengers") return integer(value, true);
  return number1.format(value);
}

function beep(kind = "tap") {
  if (prefs.muted) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const frequencies = { tap: 420, success: 660, report: 320, error: 180 };
    oscillator.frequency.value = frequencies[kind] || frequencies.tap;
    oscillator.type = kind === "error" ? "sawtooth" : "sine";
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(kind === "report" ? 0.055 : 0.035, audioContext.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + (kind === "report" ? 0.32 : 0.14));
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + (kind === "report" ? 0.34 : 0.16));
  } catch {
    // Sound is optional; game play never depends on Web Audio.
  }
}

function toast(message, kind = "info", icon = null) {
  const region = $("#toast-region");
  region.innerHTML = `<div class="toast ${e(kind)}"><span>${icon || (kind === "error" ? "⚠️" : kind === "success" ? "✓" : "ℹ️")}</span><span>${e(message)}</span></div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { region.innerHTML = ""; }, 3600);
}

function persist() {
  if (!state) return;
  const saved = saveGame(state);
  const status = $("#save-status");
  if (status) {
    status.textContent = saved ? "● Saved locally" : "○ Save unavailable";
    status.classList.toggle("negative", !saved);
  }
}

function renderSetupOptions() {
  $("#focus-options").innerHTML = Object.values(FOCUSES).map((focus, index) => `
    <label class="focus-choice">
      <input type="radio" name="focusId" value="${e(focus.id)}" ${index === 1 ? "checked" : ""} />
      <span class="choice-card" style="--choice:${e(focus.colour)}">
        <span class="choice-icon">${focus.icon}</span><b>${e(focus.name)}</b><span>${e(focus.tagline)}</span>
      </span>
    </label>`).join("");
  $("#difficulty-options").innerHTML = Object.values(DIFFICULTIES).map((difficulty) => `
    <label class="difficulty-choice">
      <input type="radio" name="difficulty" value="${e(difficulty.id)}" ${difficulty.id === "standard" ? "checked" : ""} />
      <span class="choice-card"><span class="choice-icon">${difficulty.icon}</span><b>${e(difficulty.name)}</b><span>${e(difficulty.description)}</span></span>
    </label>`).join("");
}

function renderContinueButton() {
  const button = $("#continue-game");
  if (!savedState) {
    button.classList.add("hidden");
    return;
  }
  const level = levelForState(savedState);
  $("#continue-summary").textContent = `${savedState.company.name} · ${quarterLabel(savedState.quarter)} · ${level.name}`;
  button.classList.remove("hidden");
}

function openSetup() {
  $("#new-game-form").classList.remove("hidden");
  requestAnimationFrame(() => $("#company-name").focus());
}

function closeSetup() {
  $("#new-game-form").classList.add("hidden");
  $("#new-game").focus();
}

function randomCompanyName() {
  const current = $("#company-name").value;
  const choices = COMPANY_NAMES.filter((name) => name !== current);
  $("#company-name").value = choices[Math.floor(Math.random() * choices.length)] || COMPANY_NAMES[0];
  beep();
}

function initialiseShipyard() {
  if (!state) return;
  const firstHull = unlockedHullIds(state)[0] || "boutique";
  const focus = state.company.focusId;
  const starterFeatures = focus === "luxury" || focus === "premium" ? ["spa", "observation"]
    : focus === "adventure" ? ["observation", "theatre"] : ["theatre", "observation"];
  shipyardDesign = {
    name: `MV ${SHIP_NAMES[(state.idCounter + state.quarter + 3) % SHIP_NAMES.length]}`,
    hullId: firstHull,
    cabinPlanId: focus === "luxury" ? "suites" : focus === "premium" ? "balcony" : focus === "value" ? "dense" : "balanced",
    speedId: focus === "adventure" ? "economy" : "balanced",
    features: starterFeatures.filter((id) => unlockedFeatureIds(state, firstHull).includes(id)).slice(0, HULLS[firstHull].featureSlots),
    livery: FOCUSES[focus].colour,
    finance: "loan",
  };
}

function startGame(nextState, showIntroduction = false) {
  state = nextState;
  state.selectedTab = state.selectedTab || "bridge";
  marketFilter = "all";
  initialiseShipyard();
  $("#start-screen").classList.add("hidden");
  $("#game-shell").classList.remove("hidden");
  renderAll();
  persist();
  $("#main-content").focus({ preventScroll: true });
  if (showIntroduction && !prefs.guidanceTourComplete) requestAnimationFrame(openGuidanceIntroduction);
}

function renderAll() {
  if (!state) return;
  renderChrome();
  switchTab(state.selectedTab || "bridge", false);
}

function renderChrome() {
  const forecast = forecastQuarter(state);
  const progress = levelProgress(state);
  const focus = FOCUSES[state.company.focusId];
  $("#company-title").textContent = state.company.name;
  $("#company-focus").textContent = focus.name;
  $("#quarter-label").textContent = quarterLabel(state.quarter);
  $("#season-label").textContent = calendarSeason(state.quarter);
  $("#level-badge").textContent = progress.current.badge;
  $("#level-name").textContent = progress.current.name;
  $("#level-count").textContent = `Level ${progress.current.id} / ${LEVELS.length}`;
  $("#level-progress").style.width = `${Math.round(progress.overall * 100)}%`;
  $("#cash-stat").textContent = money(state.company.cash);
  const profitStat = $("#profit-stat");
  profitStat.textContent = money(forecast.operatingProfit, true);
  profitStat.className = classForNumber(forecast.operatingProfit);
  const advance = $("#advance-quarter");
  advance.disabled = state.status !== "planning";
  advance.querySelector("span").textContent = state.status === "planning" ? "Set sail" : "Campaign ended";
  $("#sound-toggle").textContent = prefs.muted ? "♩" : "♫";
  $("#sound-toggle").setAttribute("aria-label", prefs.muted ? "Turn sound on" : "Mute sound");
  $("#forecast-status").textContent = `Next-quarter forecast: ${money(forecast.operatingProfit, true)} · ${pct(forecast.averageOccupancy)} occupancy`;
  $$(".nav-tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === state.selectedTab));
  $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `panel-${state.selectedTab}`));
}

function switchTab(tab, focus = true) {
  const valid = ["bridge", "fleet", "markets", "brand", "shipyard", "finance"];
  if (!valid.includes(tab)) tab = "bridge";
  state.selectedTab = tab;
  renderChrome();
  renderPanel(tab);
  persist();
  if (focus) $("#main-content").focus({ preventScroll: true });
}

function renderPanel(tab) {
  if (tab === "bridge") renderBridge();
  if (tab === "fleet") renderFleet();
  if (tab === "markets") renderMarkets();
  if (tab === "brand") renderBrand();
  if (tab === "shipyard") renderShipyard();
  if (tab === "finance") renderFinance();
}

function panelHeader(kicker, title, description, actions = "") {
  const advisers = `<button class="button button-small button-ghost" data-action="open-guidance">${prefs.guidanceEnabled === false ? "Ask the advisers" : "Board advisers"}</button>`;
  return `<header class="panel-head"><div><p class="section-kicker">${e(kicker)}</p><h1>${e(title)}</h1><p>${e(description)}</p></div><div class="panel-actions">${advisers}${actions}</div></header>`;
}

function guidanceCard(tab, forecast) {
  if (prefs.guidanceEnabled === false) return "";
  const guidance = guidanceFor({ state, forecast, tab });
  const touring = !prefs.guidanceTourComplete;
  const finalStep = touring && guidance.tourStep === TOUR_TABS.length;
  const action = finalStep
    ? `<button class="button button-small button-primary" data-action="complete-guidance">Finish induction</button>`
    : `<button class="button button-small button-primary" data-tab-target="${e(guidance.action.tab)}">${e(guidance.action.label)} →</button>`;
  return `<aside class="adviser-card" style="--adviser:${e(guidance.adviser.colour)}">
    <button class="adviser-dismiss" type="button" data-action="hide-guidance" aria-label="Hide board advisers">×</button>
    <div class="adviser-avatar" aria-hidden="true">${guidance.adviser.icon}</div>
    <div class="adviser-copy"><p class="adviser-kicker">${touring && guidance.tourStep > 0 ? `Board induction · ${guidance.tourStep} / ${TOUR_TABS.length}` : "Board adviser"}</p><h2>${e(guidance.title)}</h2><p>${e(guidance.body)}</p><small>${e(guidance.adviser.name)} · ${e(guidance.adviser.role)}</small></div>
    <div class="adviser-action">${action}</div>
  </aside>`;
}

function currentRisk(forecast) {
  const worstShip = [...state.company.fleet].sort((a, b) => a.condition - b.condition)[0];
  if (state.company.cash < 25) return { icon: "🏦", title: "Cash is tight", body: "A single incident could force emergency borrowing. Protect liquidity before committing another hull." };
  if (forecast.operatingProfit < -5) return { icon: "📉", title: "The plan loses money", body: "Review fares, route fit and discretionary spend before running the quarter." };
  if (worstShip?.condition < 65) return { icon: "🔧", title: `${worstShip.name} needs attention`, body: "Low condition weakens demand and increases the chance of expensive disruption." };
  if (forecast.averageOccupancy > .97 && forecast.satisfaction < 68) return { icon: "🧼", title: "Full, but under pressure", body: "Near-total occupancy can overwhelm service. Raise fares or invest in guests and crew." };
  if (state.company.debt > creditLimit(state) * .8) return { icon: "⚖️", title: "Little borrowing room remains", body: "Strong earnings or debt repayment will be needed before the next major newbuild." };
  return { icon: "🧭", title: "Board view", body: TIPS[(state.quarter + state.company.fleet.length) % TIPS.length] };
}

function routeMap() {
  const unlocked = new Set(unlockedMarketIds(state));
  const focusColour = FOCUSES[state.company.focusId].colour;
  const mapY = (raw) => Number((raw * .58 + 1).toFixed(1));
  const hubY = mapY(48);
  const routes = state.company.fleet.filter((ship) => ship.refitQuarters <= 0).map((ship, index) => {
    const market = MARKETS[ship.routeId];
    if (!market) return "";
    const destinationY = mapY(market.map.y);
    const curveY = Math.max(6, Math.min(hubY, destinationY) - 4 - index * .8);
    return `<path class="map-route" d="M48 ${hubY} Q${(48 + market.map.x) / 2} ${curveY} ${market.map.x} ${destinationY}" stroke="${e(ship.livery || focusColour)}" />
      <g class="map-ship" transform="translate(${market.map.x - 1.5} ${destinationY - 3})"><path d="M0 2h3l-.5 1H.6z" fill="${e(ship.livery || focusColour)}"/><path d="M.7 1h1.7v1H.7z" fill="#eef8ff"/></g>`;
  }).join("");
  const ports = Object.values(MARKETS).map((market) => {
    const y = mapY(market.map.y);
    return `
    <g class="map-port ${unlocked.has(market.id) ? "" : "locked"}" data-market-jump="${e(market.id)}" style="--port-colour:${unlocked.has(market.id) ? focusColour : "#70879b"}" transform="translate(${market.map.x} ${y})" role="button" tabindex="0" aria-label="${e(market.name)}${unlocked.has(market.id) ? "" : `, unlocks at level ${market.unlockLevel}`}">
      <circle class="map-hit" r="4.5"></circle><circle r="1.65"></circle><text y="3.8">${e(market.short)}</text>
    </g>`;
  }).join("");
  return `<div class="route-map">
    <svg viewBox="0 0 100 60" role="img" aria-label="World route map showing fleet deployment" preserveAspectRatio="xMidYMid meet">
      <g class="map-graticule"><path d="M0 15h100M0 30h100M0 45h100M25 0v60M50 0v60M75 0v60"/></g>
      <g class="map-land">
        <path d="M5 8l18-5 16 6-2 8-7 5-3 9-10 4-8-10 3-9z"/>
        <path d="M25 33l11 4 4 9-4 14-8-8-5-11z"/>
        <path d="M42 8l15-5 23 4 18 8-7 8-19 1-10 8-9-4-8-8z"/>
        <path d="M51 29l15 2 8 8-7 18-11-5-5-10z"/>
        <path d="M78 40l15-1 7 6-8 10-13-4z"/>
      </g>
      ${routes}${ports}
      <circle cx="48" cy="${hubY}" r="1.25" fill="${e(focusColour)}" stroke="#fff" stroke-width=".55" />
    </svg>
    <div class="map-legend"><span>● Fleet hub</span><span>Dashed lines: deployed ships</span><span>Tap a market for fares and competition</span></div>
  </div>`;
}

function renderLeaderboard(rankings) {
  return `<div class="leaderboard">${rankings.map((company) => `
    <div class="leader-row ${company.isPlayer ? "player" : ""}">
      <span class="leader-rank">${company.rank}</span>
      <div class="leader-company"><span class="leader-icon" style="--leader-colour:${e(company.colour)}">${company.icon}</span><div><strong>${e(company.name)}</strong><span>${company.fleet} ships · ${score(company.reputation)} reputation</span></div></div>
      <div class="leader-value"><strong>${money(company.value)}</strong><span>${pct(company.marketShare, 1)} share</span></div>
    </div>`).join("")}</div>`;
}

function renderMilestone(progress) {
  if (!progress.next) return `<div class="milestone-card"><div class="milestone-top"><span class="milestone-badge">🏆</span><div class="milestone-copy"><h3>Ocean icon achieved</h3><p>You have unlocked every market and ship technology. Lead the ranking to claim the campaign.</p></div></div></div>`;
  return `<div class="milestone-card">
    <div class="milestone-top"><span class="milestone-badge">${progress.next.badge}</span><div class="milestone-copy"><h3>Next: ${e(progress.next.name)}</h3><p>${e(progress.next.summary)}</p></div></div>
    <div class="requirements">${progress.requirements.map((requirement) => `
      <div class="requirement"><span>${e(requirement.label)}</span><strong class="${requirement.progress >= 1 ? "done" : ""}">${levelValue(requirement.value, requirement)} / ${levelValue(requirement.target, requirement)}</strong><div class="requirement-bar"><i style="width:${Math.round(requirement.progress * 100)}%"></i></div></div>`).join("")}</div>
    <div class="unlock-box"><strong>Unlocks:</strong> ${e(progress.next.unlockText)}</div>
  </div>`;
}

function renderBridge() {
  const forecast = forecastQuarter(state);
  const rankings = rankCompanies(state);
  const progress = levelProgress(state);
  const risk = currentRisk(forecast);
  const last = state.company.history.at(-1);
  const content = $("#bridge-content");
  content.innerHTML = `${panelHeader("Executive bridge", "Your line at a glance", "Deploy the fleet, tune the proposition and run the next quarter when the plan is ready.")}
    ${guidanceCard("bridge", forecast)}
    <div class="kpi-grid">
      <div class="kpi" style="--kpi:var(--green)"><span class="kpi-label">Forecast profit</span><strong class="kpi-value ${classForNumber(forecast.operatingProfit)}">${money(forecast.operatingProfit, true)}</strong><span class="kpi-delta">after interest and central costs</span></div>
      <div class="kpi" style="--kpi:var(--cyan)"><span class="kpi-label">Company value</span><strong class="kpi-value">${money(enterpriseValue(state))}</strong><span class="kpi-delta">fleet, cash and brand less debt</span></div>
      <div class="kpi" style="--kpi:var(--violet)"><span class="kpi-label">Occupancy</span><strong class="kpi-value">${pct(forecast.averageOccupancy)}</strong><span class="kpi-delta">${integer(forecast.passengers, true)} guests forecast</span></div>
      <div class="kpi" style="--kpi:var(--gold)"><span class="kpi-label">Reputation</span><strong class="kpi-value">${score(state.company.reputation)}</strong><span class="kpi-delta">${last ? `${last.reputation >= state.company.reputation ? "steady" : "building"} after last quarter` : "a new name at sea"}</span></div>
      <div class="kpi" style="--kpi:var(--coral)"><span class="kpi-label">World share</span><strong class="kpi-value">${pct(forecast.marketShare, 1)}</strong><span class="kpi-delta">ranked #${rankings.find((item) => item.isPlayer)?.rank || 5} overall</span></div>
    </div>
    <div class="bridge-grid" style="margin-top:.85rem">
      <div class="bridge-main">
        <article class="card"><div class="card-head"><div><h2>Fleet deployment</h2><p>${state.company.fleet.length} ships · ${state.company.orders.length} in the yard</p></div><button class="card-link" data-tab-target="markets">Price markets →</button></div>${routeMap()}</article>
        <article class="card"><div class="card-head"><div><h2>Next-quarter economics</h2><p>Neutral-event board forecast; the sea may disagree.</p></div><button class="card-link" data-tab-target="brand">Adjust strategy →</button></div><div class="card-pad forecast-split">
          <div class="donut" style="--value:${Math.min(100, Math.round(forecast.averageOccupancy * 100))};--donut-colour:${forecast.averageOccupancy > .96 ? "var(--gold)" : "var(--green)"}"><div class="donut-value"><strong>${pct(forecast.averageOccupancy)}</strong><span>occupancy</span></div></div>
          <div class="breakdown-list">
            <div class="breakdown-row"><span>Ticket + onboard revenue</span><strong>${money(forecast.revenue)}</strong></div>
            <div class="breakdown-row"><span>Ships, ports, crew &amp; service</span><strong>−${money(forecast.shipCosts)}</strong></div>
            <div class="breakdown-row"><span>Marketing &amp; sustainability</span><strong>−${money(forecast.marketing + forecast.sustainability)}</strong></div>
            <div class="breakdown-row"><span>Interest &amp; corporate</span><strong>−${money(forecast.interest + forecast.corporate)}</strong></div>
            <div class="breakdown-row total"><span>Operating result</span><strong class="${classForNumber(forecast.operatingProfit)}">${money(forecast.operatingProfit, true)}</strong></div>
            <div><div class="range-head"><span>Guest satisfaction</span><strong>${score(forecast.satisfaction)}</strong></div><div class="meter"><span style="width:${forecast.satisfaction}%"></span></div></div>
          </div>
        </div></article>
      </div>
      <aside class="bridge-side">
        <article class="card">${renderMilestone(progress)}</article>
        <article class="card"><div class="card-head"><div><h2>Fleet table</h2><p>Value, reputation and share decide the rank.</p></div><button class="card-link" data-tab-target="finance">Full accounts →</button></div>${renderLeaderboard(rankings)}</article>
        <article class="card"><div class="card-head"><div><h2>${risk.icon} ${e(risk.title)}</h2><p>${e(risk.body)}</p></div></div><div class="news-list">${state.news.slice(0, 5).map((item) => `<div class="news-item"><span class="news-icon">${item.icon}</span><div><h4>${e(item.title)}</h4><p>${e(item.body)}</p></div></div>`).join("")}</div></article>
      </aside>
    </div>`;
}

function shipSvg(ship, className = "ship-silhouette") {
  const hull = HULLS[ship.hullId] || HULLS.boutique;
  const decks = { boutique: 2, mid: 3, resort: 4, expedition: 3, mega: 5 }[hull.id] || 3;
  const length = { boutique: 180, mid: 205, resort: 230, expedition: 165, mega: 248 }[hull.id] || 205;
  const start = (260 - length) / 2;
  const deckRows = Array.from({ length: decks }, (_, index) => {
    const width = length * (.72 - index * .055);
    const x = 130 - width / 2;
    const y = 78 - index * 12;
    return `<rect class="super" x="${x}" y="${y}" width="${width}" height="13" rx="3"/>`;
  }).join("");
  const windows = Array.from({ length: Math.max(7, Math.round(length / 19)) }, (_, index) => `<rect class="glass" x="${start + 16 + index * ((length - 34) / Math.max(1, Math.round(length / 19) - 1))}" y="84" width="8" height="4" rx="2"/>`).join("");
  return `<svg class="${className}" viewBox="0 0 260 130" aria-hidden="true" style="--ship-colour:${e(ship.livery)}"><path class="hull" d="M${start} 91H${start + length}L${start + length - 24} 116H${start + 25}Z"/>${deckRows}<rect class="accent" x="112" y="${42 - Math.max(0,decks-3)*8}" width="36" height="16" rx="5"/>${windows}<path d="M18 119c40-8 67 7 104 0s70 8 120-1" fill="none" stroke="rgba(224,248,255,.75)" stroke-width="5" stroke-linecap="round"/></svg>`;
}

function refitOptions(ship) {
  return unlockedFeatureIds(state, ship.hullId).filter((id) => !ship.features.includes(id));
}

function renderFleet() {
  const unlockedMarkets = new Set(unlockedMarketIds(state));
  const forecast = forecastQuarter(state);
  const results = Object.fromEntries(forecast.shipResults.map((result) => [result.shipId, result]));
  $("#fleet-content").innerHTML = `${panelHeader("Fleet operations", "Every ship is a strategy", "Deploy ships to unlocked markets, monitor condition and use refits to keep the product relevant.", `<button class="button button-small button-primary" data-tab-target="shipyard">Order a ship</button>`)}
    ${guidanceCard("fleet", forecast)}
    ${state.company.orders.length ? `<article class="card" style="margin-bottom:.85rem"><div class="card-head"><div><h2>Under construction</h2><p>Capacity arrives only when the yard counter reaches zero.</p></div></div><div class="card-pad order-list">${state.company.orders.map((order) => {
      const progress = 1 - order.quartersRemaining / Math.max(1, order.ship.buildQuarters);
      return `<div class="order-row"><span class="milestone-badge" style="width:42px;height:42px;font-size:1.2rem">${HULLS[order.ship.hullId].icon}</span><div><h4>${e(order.ship.name)}</h4><p>${e(HULLS[order.ship.hullId].name)} · ${integer(order.ship.pax)} guests · ${order.finance} finance</p><div class="meter order-progress"><span style="width:${Math.max(8,progress*100)}%"></span></div></div><strong>${order.quartersRemaining}Q left</strong></div>`;
    }).join("")}</div></article>` : ""}
    <div class="fleet-grid">${state.company.fleet.map((ship) => {
      const result = results[ship.id];
      const market = MARKETS[ship.routeId];
      const inYard = ship.refitQuarters > 0;
      return `<article class="card ship-card">
        <div class="ship-visual" style="--ship-colour:${e(ship.livery)}"><div class="ship-label"><h2>${e(ship.name)}</h2><p>${e(HULLS[ship.hullId].name)} · ${e(CABIN_PLANS[ship.cabinPlanId].name)}</p></div><span class="ship-condition ${ship.condition < 65 ? "negative" : ship.condition < 80 ? "neutral" : "positive"}">${conditionLabel(ship.condition)} · ${Math.round(ship.condition)}%</span>${shipSvg(ship)}</div>
        <div class="ship-body">
          <div class="ship-stat-grid">
            <div class="ship-stat"><span>Guests</span><strong>${integer(ship.pax)}</strong></div>
            <div class="ship-stat"><span>Forecast load</span><strong>${inYard ? "In yard" : pct(result?.occupancy || 0)}</strong></div>
            <div class="ship-stat"><span>Profit</span><strong class="${classForNumber(result?.profit || 0)}">${money(result?.profit || 0, true)}</strong></div>
            <div class="ship-stat"><span>Eco score</span><strong>${Math.round(ship.eco)}</strong></div>
          </div>
          <div class="ship-controls"><div class="select-row"><label for="route-${e(ship.id)}">Quarter route</label><select id="route-${e(ship.id)}" data-route-ship="${e(ship.id)}" ${inYard ? "disabled" : ""}>${Object.values(MARKETS).map((option) => `<option value="${e(option.id)}" ${ship.routeId === option.id ? "selected" : ""} ${unlockedMarkets.has(option.id) ? "" : "disabled"}>${option.icon} ${e(option.name)}${unlockedMarkets.has(option.id) ? "" : ` · L${option.unlockLevel}`}</option>`).join("")}</select></div></div>
          <div class="ship-features">${ship.features.map((id) => `<span class="feature-pill">${FEATURES[id].icon} ${e(FEATURES[id].name)}</span>`).join("")}${ship.features.length < ship.featureSlots ? `<span class="feature-pill">+${ship.featureSlots - ship.features.length} open ${ship.featureSlots - ship.features.length === 1 ? "slot" : "slots"}</span>` : ""}</div>
          <div class="ship-actions"><button class="button button-small button-ghost" data-action="refit-ship" data-ship="${e(ship.id)}" ${inYard || !refitOptions(ship).length || ship.features.length >= ship.featureSlots ? "disabled" : ""}>Add feature</button><button class="button button-small button-ghost" data-action="repair-ship" data-ship="${e(ship.id)}" ${inYard || ship.condition >= 97 ? "disabled" : ""}>Yard period</button><button class="button button-small button-danger" data-action="sell-ship" data-ship="${e(ship.id)}" ${state.company.fleet.length <= 1 ? "disabled" : ""}>Sell</button></div>
          ${inYard ? `<div class="warning-box" style="margin-top:.7rem">This ship is unavailable this quarter while the yard completes its work.</div>` : `<p class="card-note" style="margin:.7rem 0 0">${e(market.description)}</p>`}
        </div>
      </article>`;
    }).join("")}
      <article class="card order-card"><div><span>＋</span><h3>Commission the next ship</h3><p>Choose the hull, cabin density, propulsion tune, signature features and financing. A coherent ship can create its own market.</p><button class="button button-primary" data-tab-target="shipyard">Open the shipyard</button></div></article>
    </div>`;
}

function seasonSignal(multiplier) {
  if (multiplier >= 1.2) return ["Peak", "positive"];
  if (multiplier >= .95) return ["Healthy", "neutral"];
  if (multiplier >= .7) return ["Shoulder", "neutral"];
  return ["Low", "negative"];
}

function renderMarkets() {
  const unlocked = new Set(unlockedMarketIds(state));
  const forecast = forecastQuarter(state);
  const resultByMarket = Object.fromEntries(forecast.marketResults.map((result) => [result.marketId, result]));
  const cards = Object.values(MARKETS).filter((market) => {
    if (marketFilter === "unlocked") return unlocked.has(market.id);
    if (marketFilter === "deployed") return state.company.fleet.some((ship) => ship.routeId === market.id && ship.refitQuarters <= 0);
    return true;
  });
  const actions = `<div class="segmented" aria-label="Filter markets"><button class="${marketFilter === "all" ? "active" : ""}" data-market-filter="all">All</button><button class="${marketFilter === "unlocked" ? "active" : ""}" data-market-filter="unlocked">Unlocked</button><button class="${marketFilter === "deployed" ? "active" : ""}" data-market-filter="deployed">Deployed</button></div>`;
  $("#markets-content").innerHTML = `${panelHeader("Revenue management", "Markets, fares and competition", "Seasonality changes every quarter. Your rivals have already filed their deployments and prices, so use the information.", actions)}
    ${guidanceCard("markets", forecast)}
    <div class="market-grid">${cards.map((market) => {
      const isUnlocked = unlocked.has(market.id);
      const result = resultByMarket[market.id];
      const seasonal = market.seasonality[state.quarter % 4];
      const [seasonText, seasonClass] = seasonSignal(seasonal);
      const pressure = marketPressure(state, market.id);
      const maxCapacity = Math.max(1, ...pressure.map((item) => item.capacity));
      const deployed = state.company.fleet.filter((ship) => ship.routeId === market.id && ship.refitQuarters <= 0).length;
      const fare = state.company.prices[market.id] || 1;
      return `<article class="card market-card ${isUnlocked ? "" : "locked"}">
        ${isUnlocked ? "" : `<div class="lock-overlay"><span>🔒 Unlocks at level ${market.unlockLevel}</span></div>`}
        <div class="market-top"><span class="market-icon">${market.icon}</span><div class="market-title"><h2>${e(market.name)}</h2><p>${e(market.description)}</p></div><div class="market-season"><strong class="${seasonClass}">${seasonText}</strong><span>${Math.round(seasonal * 100)}% seasonal demand</span></div></div>
        <div class="market-body">
          <div class="market-metrics"><div class="market-metric"><span>Demand</span><strong>${integer(result?.demand || 0, true)}</strong></div><div class="market-metric"><span>Your ships</span><strong>${deployed}</strong></div><div class="market-metric"><span>Forecast load</span><strong>${deployed ? pct(result?.playerOccupancy || 0) : "—"}</strong></div></div>
          <div class="fare-control"><div class="range-head"><label for="price-${e(market.id)}">Fare positioning</label><strong data-price-output="${e(market.id)}">${Math.round(fare * 100)}% · ${fareMoney(market.baseFare * fare)}</strong></div><input id="price-${e(market.id)}" type="range" min="70" max="145" step="1" value="${Math.round(fare * 100)}" data-price-market="${e(market.id)}" ${isUnlocked ? "" : "disabled"}/><div class="range-scale"><span>Volume</span><span>Market</span><span>Yield</span></div></div>
          <div class="competition"><div class="range-head"><span>Visible quarter capacity</span><strong>${integer(pressure.reduce((sum,item) => sum + item.capacity,0), true)}</strong></div>${pressure.map((item) => `<div class="competition-row"><span>${item.isPlayer ? "You" : e(item.name)}</span><div class="competition-bar"><i style="width:${item.capacity / maxCapacity * 100}%;--bar-colour:${e(item.colour)}"></i></div><strong>${integer(item.capacity, true)}</strong></div>`).join("")}</div>
          <p class="market-description">Typical fare £${integer(market.baseFare)} · onboard £${integer(market.onboard)} per guest · ${pct(result?.playerShare || 0,1)} forecast share.</p>
        </div>
      </article>`;
    }).join("")}</div>`;
}

function renderBrand() {
  const forecast = forecastQuarter(state);
  const focus = FOCUSES[state.company.focusId];
  const marketingTotal = Object.values(state.company.marketing).reduce((sum, value) => sum + value, 0);
  const averageEco = state.company.fleet.reduce((sum, ship) => sum + ship.eco, 0) / Math.max(1, state.company.fleet.length);
  const operations = [
    { id: "serviceSpend", label: "Guest service", description: "Food, cleaning, entertainment delivery and compensation headroom per guest.", min: 90, max: 245, step: 5, value: state.company.serviceSpend, format: (v) => `£${integer(v)} / guest`, note: "Direct variable cost" },
    { id: "maintenance", label: "Technical maintenance", description: "Planned work, spares and dry-dock discipline. Cutting it degrades condition faster.", min: .72, max: 1.35, step: .01, value: state.company.maintenance, format: (v) => `${Math.round(v * 100)}% plan`, note: "Condition & incidents" },
    { id: "crewPay", label: "Crew pay & retention", description: "Pay relative to the market. Strong retention supports service and reputation.", min: .82, max: 1.28, step: .01, value: state.company.crewPay, format: (v) => `${Math.round(v * 100)}% market`, note: "Service & crew events" },
    { id: "sustainabilitySpend", label: "Efficiency programme", description: "Procurement, itinerary and energy work that improves the long-run sustainability score.", min: 0, max: 18, step: .5, value: state.company.sustainabilitySpend, format: (v) => money(v), note: "Per quarter" },
  ];
  $("#brand-content").innerHTML = `${panelHeader("Commercial strategy", "What should your line stand for?", "A clear promise creates demand. Marketing finds guests; people and operations decide whether they come back.")}
    ${guidanceCard("brand", forecast)}
    <article class="card" style="margin-bottom:.85rem"><div class="card-head"><div><h2>Brand position</h2><p>Rebranding costs cash and two reputation points while customers relearn the promise.</p></div><span class="inline-badge" style="border-color:${e(focus.colour)}">${focus.icon} Current: ${e(focus.name)}</span></div><div class="card-pad"><div class="focus-grid">${Object.values(FOCUSES).map((option) => `<button class="focus-card ${option.id === state.company.focusId ? "active" : ""}" style="--focus:${e(option.colour)}" data-action="rebrand" data-focus="${e(option.id)}" ${option.id === state.company.focusId ? "disabled" : ""}><span class="focus-icon">${option.icon}</span><h3>${e(option.name)}</h3><p>${e(option.tagline)}</p><small>${option.id === state.company.focusId ? "Current proposition" : `Rebrand: ${money(14 + state.company.reputation * .18)}`}</small></button>`).join("")}</div></div></article>
    <div class="grid grid-2 brand-controls">
      <article class="card"><div class="card-head"><div><h2>Marketing mix</h2><p>Spend is £m per quarter. Different channels fit different audiences.</p></div><strong>${money(marketingTotal)}</strong></div><div class="control-list">${Object.values(MARKETING_CHANNELS).map((channel) => `<div class="control-row"><div class="control-copy"><h3>${channel.icon} ${e(channel.name)}</h3><p>${e(channel.description)}</p></div><input type="range" min="0" max="18" step=".5" value="${state.company.marketing[channel.id]}" data-marketing="${e(channel.id)}"/><div class="control-value"><strong data-marketing-output="${e(channel.id)}">${money(state.company.marketing[channel.id])}</strong><span>per quarter</span></div></div>`).join("")}</div></article>
      <article class="card"><div class="card-head"><div><h2>People &amp; operations</h2><p>Cost discipline matters, but neglected ships and guests remember.</p></div></div><div class="control-list">${operations.map((control) => `<div class="control-row"><div class="control-copy"><h3>${e(control.label)}</h3><p>${e(control.description)}</p></div><input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.value}" data-operation="${e(control.id)}"/><div class="control-value"><strong data-operation-output="${e(control.id)}">${e(control.format(control.value))}</strong><span>${e(control.note)}</span></div></div>`).join("")}</div></article>
    </div>
    <article class="card" style="margin-top:.85rem"><div class="card-head"><div><h2>Strategy readout</h2><p>The next quarter reflects every control above.</p></div></div><div class="card-pad strategy-summary"><div class="strategy-stat"><span>Forecast satisfaction</span><strong>${score(forecast.satisfaction)}</strong></div><div class="strategy-stat"><span>Reputation</span><strong>${score(state.company.reputation)}</strong></div><div class="strategy-stat"><span>Fleet eco score</span><strong>${Math.round(averageEco)}/100</strong></div><div class="strategy-stat"><span>Quarter result</span><strong class="${classForNumber(forecast.operatingProfit)}">${money(forecast.operatingProfit,true)}</strong></div></div></article>`;
}

function normaliseShipyard() {
  if (!shipyardDesign) initialiseShipyard();
  const unlockedHulls = unlockedHullIds(state);
  if (!unlockedHulls.includes(shipyardDesign.hullId)) shipyardDesign.hullId = unlockedHulls[0] || "boutique";
  const hull = HULLS[shipyardDesign.hullId];
  const allowed = new Set(unlockedFeatureIds(state, hull.id));
  shipyardDesign.features = [...new Set(shipyardDesign.features)].filter((id) => allowed.has(id)).slice(0, hull.featureSlots);
}

function financeSplit(cost, finance) {
  const debtShare = finance === "cash" ? 0 : finance === "balanced" ? .5 : .75;
  return { cash: cost * (1 - debtShare), debt: cost * debtShare };
}

function renderShipyard() {
  normaliseShipyard();
  const forecast = forecastQuarter(state);
  const level = levelForState(state).id;
  const quote = quoteShipDesign(shipyardDesign);
  const hull = HULLS[shipyardDesign.hullId];
  const errors = validateShipDesign(state, shipyardDesign);
  const split = financeSplit(quote.cost, shipyardDesign.finance);
  const canAfford = state.company.cash - split.cash >= -35 && split.debt <= availableCredit(state) + .01;
  const slotText = `${shipyardDesign.features.length} / ${hull.featureSlots} feature slots`;
  $("#shipyard-content").innerHTML = `${panelHeader("Newbuild programme", "Design the next competitive advantage", "Hull scale, cabin density, speed and features alter both the economics and which guests want to sail.", `<span class="inline-badge">Credit available ${money(availableCredit(state))}</span>`)}
    ${guidanceCard("shipyard", forecast)}
    <div class="shipyard-layout">
      <div class="card builder">
        <section class="builder-section"><h2>1 · Hull class</h2><p>Scale brings lower unit costs, but a larger fixed bet and fewer suitable markets.</p><div class="option-grid">${Object.values(HULLS).map((option) => `<label class="option-choice"><input type="radio" name="hull" value="${e(option.id)}" data-design-field="hullId" ${shipyardDesign.hullId === option.id ? "checked" : ""} ${option.unlockLevel <= level ? "" : "disabled"}/><span class="option-tile"><strong>${option.icon} ${e(option.name)}</strong><span>${e(option.description)}</span><small>${option.unlockLevel <= level ? `${money(option.cost)} base · ${integer(option.pax)} guests` : `Unlocks at level ${option.unlockLevel}`}</small></span></label>`).join("")}</div></section>
        <section class="builder-section"><h2>2 · Cabin plan</h2><p>Density changes capacity, fare potential and audience fit.</p><div class="option-grid">${Object.values(CABIN_PLANS).map((option) => `<label class="option-choice"><input type="radio" name="cabins" value="${e(option.id)}" data-design-field="cabinPlanId" ${shipyardDesign.cabinPlanId === option.id ? "checked" : ""}/><span class="option-tile"><strong>${e(option.name)}</strong><span>${e(option.description)}</span><small>${e(option.mix)}</small></span></label>`).join("")}</div></section>
        <section class="builder-section"><h2>3 · Propulsion tune</h2><p>Trade itinerary reach and departures against fuel exposure.</p><div class="option-grid">${Object.values(SPEEDS).map((option) => `<label class="option-choice"><input type="radio" name="speed" value="${e(option.id)}" data-design-field="speedId" ${shipyardDesign.speedId === option.id ? "checked" : ""}/><span class="option-tile"><strong>${e(option.name)}</strong><span>${e(option.description)}</span><small>${Math.round(option.fuel*100)}% fuel · ${Math.round(option.sailings*100)}% sailings</small></span></label>`).join("")}</div></section>
        <section class="builder-section"><h2>4 · Signature features <span class="inline-badge">${slotText}</span></h2><p>Features shape appeal and onboard spending. A slot is scarce deck space, not a shopping list.</p><div class="feature-grid">${Object.values(FEATURES).map((feature) => {
          const locked = feature.unlockLevel > level;
          const blocked = (feature.blockedHulls || []).includes(hull.id);
          const selected = shipyardDesign.features.includes(feature.id);
          const full = !selected && shipyardDesign.features.length >= hull.featureSlots;
          const disabled = locked || blocked || full;
          const why = locked ? `Unlocks at level ${feature.unlockLevel}` : blocked ? `Not available on ${hull.name}` : full ? "No slots remain" : feature.description;
          return `<label class="feature-choice"><input type="checkbox" value="${e(feature.id)}" data-design-feature ${selected ? "checked" : ""} ${disabled ? "disabled" : ""}/><span class="feature-tile"><span>${feature.icon}</span><span><strong>${e(feature.name)}</strong><small>${e(why)}</small></span><span class="feature-price">${money(feature.cost)}</span></span></label>`;
        }).join("")}</div></section>
        <section class="builder-section"><h2>5 · Identity</h2><div class="builder-form-row"><div><label class="field-label" for="design-name">Ship name</label><input id="design-name" class="text-input" maxlength="42" value="${e(shipyardDesign.name)}" data-design-name/></div><div><label class="field-label" for="design-colour">Livery</label><input id="design-colour" class="colour-input" type="color" value="${e(shipyardDesign.livery)}" data-design-colour/></div></div></section>
      </div>
      <aside class="card ship-preview-card">
        <div class="preview-sea" style="--ship-colour:${e(shipyardDesign.livery)}"><div class="preview-title"><h2 data-preview-name>${e(shipyardDesign.name)}</h2><p>${e(hull.name)} · delivery in ${quote.buildQuarters} ${quote.buildQuarters === 1 ? "quarter" : "quarters"}</p></div>${shipSvg(quote,"preview-ship")}</div>
        <div class="quote-grid"><div class="quote-stat"><span>Contract price</span><strong>${money(quote.cost)}</strong></div><div class="quote-stat"><span>Guests</span><strong>${integer(quote.pax)}</strong></div><div class="quote-stat"><span>Departures</span><strong>${number1.format(quote.sailings)}</strong></div><div class="quote-stat"><span>Fuel index</span><strong>${number1.format(quote.fuel)}</strong></div><div class="quote-stat"><span>Eco score</span><strong>${Math.round(quote.eco)}/100</strong></div><div class="quote-stat"><span>Onboard spend</span><strong>${Math.round(quote.onboardMultiplier*100)}%</strong></div></div>
        <div class="appeal-list">${SEGMENTS.map((segment) => `<div class="appeal-row"><span>${e(segment)}</span><div class="meter"><span style="width:${Math.min(100,quote.appeal[segment])}%"></span></div><strong>${Math.round(quote.appeal[segment])}</strong></div>`).join("")}</div>
        <div class="quote-actions"><div class="finance-choice"><label><input type="radio" name="finance" value="loan" data-design-finance ${shipyardDesign.finance === "loan" ? "checked" : ""}/><span>75% debt</span></label><label><input type="radio" name="finance" value="balanced" data-design-finance ${shipyardDesign.finance === "balanced" ? "checked" : ""}/><span>50 / 50</span></label><label><input type="radio" name="finance" value="cash" data-design-finance ${shipyardDesign.finance === "cash" ? "checked" : ""}/><span>Cash</span></label></div>
          <div class="breakdown-list"><div class="breakdown-row"><span>Cash on signing</span><strong>${money(split.cash)}</strong></div><div class="breakdown-row"><span>New debt</span><strong>${money(split.debt)}</strong></div><div class="breakdown-row"><span>Cash after signing</span><strong>${money(state.company.cash - split.cash)}</strong></div></div>
          ${errors.length ? `<div class="warning-box">${e(errors[0])}</div>` : !canAfford ? `<div class="warning-box">The board cannot fund this design with the selected financing.</div>` : `<div class="success-box">Funding is available. The first payment is taken when the order is signed.</div>`}
          <button class="button button-primary" data-action="order-design" ${errors.length || !canAfford ? "disabled" : ""}>Sign contract · ${money(quote.cost)}</button>
        </div>
      </aside>
    </div>`;
}

function chartSvg(history) {
  const points = history.length ? history : [{ label: "Opening", value: enterpriseValue(state) }];
  const values = points.map((item) => item.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const range = Math.max(1, max - min);
  const width = 720;
  const height = 250;
  const pad = { left: 48, right: 18, top: 20, bottom: 34 };
  const x = (index) => pad.left + (points.length === 1 ? 0 : index / (points.length - 1)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - (value - min) / range) * (height - pad.top - pad.bottom);
  const coords = points.map((item, index) => `${x(index)},${y(item.value)}`).join(" ");
  const area = `${pad.left},${height-pad.bottom} ${coords} ${x(points.length-1)},${height-pad.bottom}`;
  return `<svg class="value-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Company value by quarter">
    <defs><linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5bdef9" stop-opacity=".26"/><stop offset="1" stop-color="#5bdef9" stop-opacity="0"/></linearGradient></defs>
    <g class="chart-grid"><path d="M${pad.left} ${pad.top}H${width-pad.right}M${pad.left} ${(pad.top+height-pad.bottom)/2}H${width-pad.right}M${pad.left} ${height-pad.bottom}H${width-pad.right}"/></g>
    <text class="chart-label" x="4" y="${pad.top+4}">${e(money(max))}</text><text class="chart-label" x="4" y="${height-pad.bottom+4}">${e(money(min))}</text>
    <polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${coords}"/>
    ${points.map((item,index) => `<circle class="chart-dot" cx="${x(index)}" cy="${y(item.value)}" r="4"><title>${e(item.label || quarterLabel(item.quarter))}: ${e(money(item.value))}</title></circle>`).join("")}
    <text class="chart-label" x="${pad.left}" y="${height-9}">${e(points[0].label || "Opening")}</text><text class="chart-label" text-anchor="end" x="${width-pad.right}" y="${height-9}">${e(points.at(-1).label || quarterLabel(state.quarter))}</text>
  </svg>`;
}

function renderFinance() {
  const forecast = forecastQuarter(state);
  const rankings = rankCompanies(state);
  const value = enterpriseValue(state);
  const fleetAssets = state.company.fleet.reduce((sum, ship) => sum + ship.bookValue, 0);
  const orderAssets = state.company.orders.reduce((sum, order) => sum + order.ship.bookValue * .82, 0);
  const brandResidual = value - state.company.cash - fleetAssets - orderAssets + state.company.debt;
  const chartHistory = state.company.history.map((item) => ({ ...item, value: item.value }));
  if (!chartHistory.length || chartHistory.at(-1).quarter !== state.quarter) chartHistory.push({ label: quarterLabel(state.quarter), value });
  $("#finance-content").innerHTML = `${panelHeader("Capital & competition", "Finance the fleet without losing the company", "Company value combines cash, ships and brand strength, less debt. The final ranking also rewards reputation and market share.", `<span class="inline-badge">Borrowing room ${money(availableCredit(state))}</span>`)}
    ${guidanceCard("finance", forecast)}
    <div class="finance-grid">
      <div class="grid">
        <article class="card"><div class="card-head"><div><h2>Company value</h2><p>Quarter-end history; current plan shown at the right edge.</p></div><strong>${money(value)}</strong></div><div class="card-pad">${chartSvg(chartHistory)}</div></article>
        <article class="card"><div class="card-head"><div><h2>Quarter history</h2><p>Actual results, not forecasts.</p></div></div><div class="history-table-wrap"><table class="history-table"><thead><tr><th>Quarter</th><th>Revenue</th><th>Profit</th><th>Cash</th><th>Occupancy</th><th>Share</th><th>Value</th></tr></thead><tbody>${state.company.history.length ? [...state.company.history].reverse().map((item) => `<tr><td>${e(item.label)}</td><td>${money(item.revenue)}</td><td class="${classForNumber(item.profit)}">${money(item.profit,true)}</td><td>${money(item.cash)}</td><td>${pct(item.occupancy)}</td><td>${pct(item.marketShare,1)}</td><td>${money(item.value)}</td></tr>`).join("") : `<tr><td colspan="7" style="text-align:center;color:var(--muted)">Run the first quarter to begin the ledger.</td></tr>`}</tbody></table></div></article>
      </div>
      <aside class="grid">
        <article class="card"><div class="card-head"><div><h2>Balance-sheet view</h2><p>Management valuation, rounded.</p></div></div><div class="balance-list"><div class="balance-row"><span>Cash</span><strong>${money(state.company.cash)}</strong></div><div class="balance-row"><span>Ships afloat</span><strong>${money(fleetAssets)}</strong></div><div class="balance-row"><span>Ships under construction</span><strong>${money(orderAssets)}</strong></div><div class="balance-row"><span>Brand &amp; loyalty</span><strong>${money(brandResidual)}</strong></div><div class="balance-row"><span>Debt</span><strong class="negative">−${money(state.company.debt)}</strong></div><div class="balance-row total"><span>Company value</span><strong>${money(value)}</strong></div></div></article>
        <article class="card"><div class="card-head"><div><h2>Debt desk</h2><p>Credit limit ${money(creditLimit(state))}; forecast interest ${money(forecast.interest)}.</p></div></div><div class="finance-actions"><input id="debt-amount" type="number" min="10" max="250" step="10" value="50" aria-label="Debt transaction amount in millions"/><button class="button button-small button-ghost" data-action="borrow">Borrow</button><button class="button button-small button-ghost" data-action="repay">Repay</button></div><div class="card-pad" style="padding-top:0"><div class="meter"><span style="width:${Math.min(100,state.company.debt/creditLimit(state)*100)}%;background:${state.company.debt/creditLimit(state)>.8 ? "var(--red)" : "linear-gradient(90deg,var(--cyan),var(--violet))"}"></span></div><p class="card-note">Debt is useful while a productive ship is building. It is dangerous when it funds losses or leaves no room for incidents.</p></div></article>
        <article class="card"><div class="card-head"><div><h2>Competitive intelligence</h2><p>Rival plans evolve each quarter.</p></div></div><div class="card-pad rival-cards">${state.rivals.map((rival) => `<div class="rival-card"><div class="rival-head"><span style="--rival:${e(rival.colour)}">${rival.icon}</span><div><h3>${e(rival.name)}</h3><p>${e(rival.bio)}</p></div></div><div class="rival-stats"><div><span>Rank</span><strong>#${rankings.find((item)=>item.id===rival.id)?.rank || "—"}</strong></div><div><span>Fleet</span><strong>${rival.fleet.length}${rival.orders.length ? ` +${rival.orders.length}` : ""}</strong></div><div><span>Value</span><strong>${money(rankings.find((item)=>item.id===rival.id)?.value || 0)}</strong></div></div></div>`).join("")}</div></article>
      </aside>
    </div>`;
}

function openModal(html, options = {}) {
  lastFocused = document.activeElement;
  modalClosable = options.closable !== false;
  $("#modal-content").innerHTML = html;
  $("#modal-layer").classList.remove("hidden");
  $("#modal-close").classList.toggle("hidden", !modalClosable);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    const target = $("[data-autofocus]", $("#modal")) || $("button:not(.hidden), input, select", $("#modal"));
    target?.focus();
  });
}

function closeModal(force = false) {
  if (!modalClosable && !force) return;
  $("#modal-layer").classList.add("hidden");
  $("#modal-content").innerHTML = "";
  document.body.style.overflow = "";
  modalClosable = true;
  lastFocused?.focus?.();
}

function adviserRoster() {
  return `<div class="adviser-roster">${Object.values(ADVISERS).map((adviser) => `<div class="adviser-person" style="--adviser:${e(adviser.colour)}"><span>${adviser.icon}</span><div><b>${e(adviser.name)}</b><small>${e(adviser.role)}</small></div></div>`).join("")}</div>`;
}

function openHelp() {
  const guidanceAction = prefs.guidanceEnabled === false
    ? `<button class="button button-secondary" data-action="enable-guidance">Show advisers</button>`
    : `<button class="button button-ghost" data-action="hide-guidance">Hide advisers</button>`;
  openModal(`<div class="modal-inner"><p class="modal-kicker">How to play</p><h2 id="modal-title">One quarter at a time</h2><p class="modal-lede">Wake &amp; Fortune is a company game, not a clicker. The forecast is deterministic from your current plan; the random event arrives only when you press Set sail.</p>${adviserRoster()}<div class="help-steps"><div class="help-step"><b>1 · Read</b><p>Start on the Bridge. Profit, occupancy, satisfaction, value and share describe the plan before chance intervenes.</p></div><div class="help-step"><b>2 · Deploy</b><p>Match each ship to a market, then compare seasonality, rival capacity and fare positioning.</p></div><div class="help-step"><b>3 · Deliver</b><p>Fund service, crew and maintenance before using marketing to fill the remaining cabins.</p></div><div class="help-step"><b>4 · Finance</b><p>Newbuild cash and debt leave now; useful capacity arrives after the yard finishes.</p></div><div class="help-step"><b>5 · Advance</b><p>Return to the live forecast, make the trade-off deliberately, then Set sail.</p></div><div class="help-step"><b>6 · Win</b><p>Grow value, reputation, fleet and passengers across 24 quarters while outranking four rivals.</p></div></div><div class="info-box" style="margin-top:1rem">The adviser strip changes with the active department and warns when the current plan crosses a dangerous threshold.</div><div class="modal-actions">${guidanceAction}<button class="button button-ghost" data-action="replay-guidance">Replay board induction</button><button class="button button-ghost" data-action="reset-game">New company</button><button class="button button-primary" data-action="close-modal">Back to the company</button></div></div>`);
}

function openGuidanceIntroduction() {
  openModal(`<div class="modal-inner"><p class="modal-kicker">Mandatory board induction</p><h2 id="modal-title">Three advisers have been assigned to your experiment</h2><p class="modal-lede">They will explain the five-department decision loop, flag dangerous plans and occasionally object to the concept of uncontrolled buoyancy.</p>${adviserRoster()}<div class="info-box" style="margin-top:1rem">Follow the adviser strip from Bridge → Fleet → Markets → Brand → Finance. The numbers update before you commit the quarter.</div><div class="modal-actions"><button class="button button-ghost" data-action="hide-guidance">Skip the induction</button><button class="button button-primary" data-action="start-guided-tour" data-autofocus>Begin guided tour</button></div></div>`);
}

function openRefit(shipId) {
  const ship = state.company.fleet.find((item) => item.id === shipId);
  if (!ship) return;
  const options = refitOptions(ship);
  openModal(`<div class="modal-inner"><p class="modal-kicker">Fleet refit</p><h2 id="modal-title">Add a feature to ${e(ship.name)}</h2><p class="modal-lede">A refit takes the ship out of service for the next quarter. The quoted yard price is 22% above newbuild fit-out cost.</p><div class="feature-grid" style="margin-top:1rem">${options.map((id) => { const feature = FEATURES[id]; return `<button class="focus-card" data-action="choose-refit" data-ship="${e(ship.id)}" data-feature="${e(id)}"><span class="focus-icon">${feature.icon}</span><h3>${e(feature.name)}</h3><p>${e(feature.description)}</p><small>Yard quote ${money(feature.cost*1.22)}</small></button>`; }).join("") || `<div class="empty-state"><strong>No compatible feature remains</strong>This hull is full or all available features are already installed.</div>`}</div><div class="modal-actions"><button class="button button-ghost" data-action="close-modal">Cancel</button></div></div>`);
}

function confirmAction(title, body, confirmLabel, action, data = {}, danger = false) {
  const attrs = Object.entries(data).map(([key,value]) => `data-${e(key)}="${e(value)}"`).join(" ");
  openModal(`<div class="modal-inner"><p class="modal-kicker">Board approval</p><h2 id="modal-title">${e(title)}</h2><p class="modal-lede">${e(body)}</p><div class="modal-actions"><button class="button button-ghost" data-action="close-modal">Cancel</button><button class="button ${danger ? "button-danger" : "button-primary"}" data-action="${e(action)}" ${attrs} data-autofocus>${e(confirmLabel)}</button></div></div>`);
}

function reportModal(report) {
  const outcome = report.outcome;
  const ended = outcome.status !== "planning";
  const outcomeCopy = outcome.status === "won" ? "You have built the leading cruise company: valuable, recognised and capable of competing around the world."
    : outcome.status === "bankrupt" ? "Liquidity and lender confidence have run out. The fleet still exists, but it is no longer yours to command."
    : outcome.status === "finished" ? `The 24-quarter campaign is complete. You finish #${outcome.playerRank}; the fleet can continue in sandbox mode.` : "";
  const extras = [
    report.levelUp ? `<div class="success-box">${report.levelUp.badge} <strong>Advanced to ${e(report.levelUp.name)}.</strong> ${e(report.levelUp.unlockText)}</div>` : "",
    report.deliveries.length ? `<div class="success-box">🛳️ ${report.deliveries.map((item) => e(item.name)).join(", ")} ${report.deliveries.length === 1 ? "has" : "have"} joined the fleet.</div>` : "",
    report.companyEvent.id !== "quiet" ? `<div class="report-event"><span>${report.companyEvent.icon}</span><div><h3>${e(report.companyEvent.title)}</h3><p>${e(report.companyEvent.body)}</p></div></div>` : "",
  ].filter(Boolean).join("");
  openModal(`<div class="report-hero"><p class="modal-kicker">${e(report.quarterLabel)} results</p><h2 id="modal-title">${ended ? e(outcome.title) : `${report.operatingProfit >= 0 ? "A profitable" : "A difficult"} ${e(report.season.toLowerCase())} quarter`}</h2><p class="modal-lede">${ended ? e(outcomeCopy) : `The market event was “${e(report.event.title)}”. Here is what the fleet actually delivered.`}</p><div class="report-event"><span>${report.event.icon}</span><div><h3>${e(report.event.title)}</h3><p>${e(report.event.body)}</p></div></div></div>
    <div class="report-kpis"><div class="report-kpi"><span>Revenue</span><strong>${money(report.revenue)}</strong></div><div class="report-kpi"><span>Profit</span><strong class="${classForNumber(report.operatingProfit)}">${money(report.operatingProfit,true)}</strong></div><div class="report-kpi"><span>Guests</span><strong>${integer(report.passengers,true)}</strong></div><div class="report-kpi"><span>Occupancy</span><strong>${pct(report.averageOccupancy)}</strong></div><div class="report-kpi"><span>Ending value</span><strong>${money(report.endingValue)}</strong></div></div>
    <div class="report-body">${extras}<article class="card"><div class="card-head"><div><h3>Ship results</h3><p>Revenue less direct ship and itinerary costs.</p></div></div><div class="card-pad" style="display:grid;gap:.45rem">${report.shipResults.map((result) => `<div class="report-ship"><strong>${e(result.shipName)}</strong><span>${e(result.marketName)}</span><span>${result.capacity ? pct(result.occupancy) : "In yard"}</span><span>${integer(result.guests,true)} guests</span><span class="${classForNumber(result.profit)}">${money(result.profit,true)}</span></div>`).join("")}</div></article>
      <article class="card"><div class="card-head"><div><h3>Closing position</h3><p>Cash, debt and brand after events and deliveries.</p></div></div><div class="card-pad strategy-summary"><div class="strategy-stat"><span>Cash</span><strong>${money(report.endingCash)}</strong></div><div class="strategy-stat"><span>Debt</span><strong>${money(report.endingDebt)}</strong></div><div class="strategy-stat"><span>Reputation</span><strong>${score(report.endingReputation)}</strong></div><div class="strategy-stat"><span>Rank</span><strong>#${outcome.playerRank}</strong></div></div></article>
      <div class="modal-actions">${ended && ["won","finished"].includes(outcome.status) ? `<button class="button button-ghost" data-action="continue-sandbox">Continue in sandbox</button>` : ""}${ended ? `<button class="button button-primary" data-action="restart-game">Start a new line</button>` : `<button class="button button-primary" data-action="close-modal" data-autofocus>Plan ${e(quarterLabel(state.quarter))}</button>`}</div>
    </div>`, { closable: !ended });
}

function mutate(result, successMessage = null, rerender = true) {
  if (!result?.ok) {
    beep("error");
    toast(result?.error || "The board could not complete that action.", "error");
    return false;
  }
  beep("success");
  if (successMessage) toast(successMessage, "success");
  persist();
  renderChrome();
  if (rerender) renderPanel(state.selectedTab);
  return true;
}

function handleButton(button) {
  const tab = button.dataset.tab || button.dataset.tabTarget;
  if (tab) { beep(); switchTab(tab); return; }
  if (button.dataset.marketJump) { marketFilter = "all"; switchTab("markets"); requestAnimationFrame(() => $(`#price-${CSS.escape(button.dataset.marketJump)}`)?.focus()); return; }
  if (button.dataset.marketFilter) { marketFilter = button.dataset.marketFilter; beep(); renderMarkets(); return; }
  const action = button.dataset.action;
  if (!action) return;
  if (action === "close-modal") { closeModal(); return; }
  if (action === "open-help" || action === "open-guidance") { openHelp(); return; }
  if (action === "start-guided-tour" || action === "replay-guidance") {
    prefs.guidanceEnabled = true;
    prefs.guidanceTourComplete = false;
    savePrefs(prefs);
    closeModal();
    switchTab("bridge");
    return;
  }
  if (action === "complete-guidance") {
    prefs.guidanceEnabled = true;
    prefs.guidanceTourComplete = true;
    savePrefs(prefs);
    switchTab("bridge");
    toast("Board induction complete. The advisers will keep watching each department.", "success", "✓");
    return;
  }
  if (action === "hide-guidance") {
    prefs.guidanceEnabled = false;
    prefs.guidanceTourComplete = true;
    savePrefs(prefs);
    if (!$("#modal-layer").classList.contains("hidden")) closeModal();
    if (state) renderPanel(state.selectedTab);
    return;
  }
  if (action === "enable-guidance") {
    prefs.guidanceEnabled = true;
    savePrefs(prefs);
    closeModal();
    if (state) renderPanel(state.selectedTab);
    return;
  }
  if (action === "reset-game") { closeModal(); resetGamePrompt(); return; }
  if (action === "refit-ship") { openRefit(button.dataset.ship); return; }
  if (action === "choose-refit") {
    const ship = state.company.fleet.find((item) => item.id === button.dataset.ship);
    const feature = FEATURES[button.dataset.feature];
    const result = refitShip(state, button.dataset.ship, button.dataset.feature);
    if (mutate(result, `${ship?.name || "Ship"} enters the yard for ${feature?.name || "a refit"}.`, false)) { closeModal(); renderFleet(); }
    return;
  }
  if (action === "repair-ship") {
    const ship = state.company.fleet.find((item) => item.id === button.dataset.ship);
    if (!ship) return;
    const quote = 5 + (100 - ship.condition) * .42 + ship.cost * .018;
    confirmAction(`Book ${ship.name} into the yard?`, `A one-quarter yard period will restore roughly 24 condition points and costs about ${money(quote)}. The ship earns no revenue while unavailable.`, `Approve ${money(quote)}`, "confirm-repair", { ship: ship.id });
    return;
  }
  if (action === "confirm-repair") {
    const ship = state.company.fleet.find((item) => item.id === button.dataset.ship);
    const result = repairShip(state, button.dataset.ship);
    if (mutate(result, `${ship?.name || "Ship"} is booked into the yard.`, false)) { closeModal(); renderFleet(); }
    return;
  }
  if (action === "sell-ship") {
    const ship = state.company.fleet.find((item) => item.id === button.dataset.ship);
    if (!ship) return;
    confirmAction(`Sell ${ship.name}?`, "The ship leaves immediately, taking its capacity and features with it. Sale proceeds are added to cash; this cannot be undone.", "Sell the ship", "confirm-sell", { ship: ship.id }, true);
    return;
  }
  if (action === "confirm-sell") {
    const result = sellShip(state, button.dataset.ship);
    if (mutate(result, result.ok ? `${result.ship.name} sold for ${money(result.proceeds)}.` : null, false)) { closeModal(); renderFleet(); }
    return;
  }
  if (action === "rebrand") {
    const focus = FOCUSES[button.dataset.focus];
    if (!focus) return;
    const cost = 14 + state.company.reputation * .18;
    confirmAction(`Reposition as ${focus.name}?`, `The campaign costs about ${money(cost)} and temporarily costs two reputation points. Ship designs stay unchanged, so make sure the fleet can deliver the promise.`, `Launch rebrand`, "confirm-rebrand", { focus: focus.id });
    return;
  }
  if (action === "confirm-rebrand") {
    const focus = FOCUSES[button.dataset.focus];
    const result = rebrand(state, button.dataset.focus);
    if (mutate(result, result.ok ? `The line is now positioned around ${focus.name.toLowerCase()}.` : null, false)) { closeModal(); renderBrand(); }
    return;
  }
  if (action === "order-design") {
    const result = orderShip(state, shipyardDesign, shipyardDesign.finance);
    if (mutate(result, result.ok ? `${shipyardDesign.name} ordered for delivery in ${result.quote.buildQuarters} quarter${result.quote.buildQuarters === 1 ? "" : "s"}.` : null, false)) {
      initialiseShipyard();
      switchTab("fleet");
    }
    return;
  }
  if (action === "borrow" || action === "repay") {
    const amount = Number($("#debt-amount")?.value || 50);
    const result = action === "borrow" ? borrow(state, amount) : repayDebt(state, amount);
    mutate(result, result.ok ? `${action === "borrow" ? "Borrowed" : "Repaid"} ${money(result.amount)}.` : null);
    return;
  }
  if (action === "continue-sandbox") {
    const result = continueSandbox(state);
    if (mutate(result, "Sandbox mode: the company can keep sailing without a campaign deadline.", false)) { closeModal(true); renderAll(); }
    return;
  }
  if (action === "restart-game") {
    closeModal(true);
    clearGame();
    savedState = null;
    state = null;
    $("#game-shell").classList.add("hidden");
    $("#start-screen").classList.remove("hidden");
    renderContinueButton();
    openSetup();
  }
}

function updateControlOutput(input) {
  if (input.dataset.priceMarket) {
    const market = MARKETS[input.dataset.priceMarket];
    const value = Number(input.value) / 100;
    const output = $(`[data-price-output="${input.dataset.priceMarket}"]`);
    if (output) output.textContent = `${Math.round(value * 100)}% · ${fareMoney(market.baseFare * value)}`;
  }
  if (input.dataset.marketing) {
    const output = $(`[data-marketing-output="${input.dataset.marketing}"]`);
    if (output) output.textContent = money(Number(input.value));
  }
  if (input.dataset.operation) {
    const id = input.dataset.operation;
    const value = Number(input.value);
    const output = $(`[data-operation-output="${id}"]`);
    if (!output) return;
    if (id === "serviceSpend") output.textContent = `£${integer(value)} / guest`;
    if (id === "maintenance") output.textContent = `${Math.round(value * 100)}% plan`;
    if (id === "crewPay") output.textContent = `${Math.round(value * 100)}% market`;
    if (id === "sustainabilitySpend") output.textContent = money(value);
  }
}

function handleInput(input) {
  if (!state) return;
  if (input.dataset.priceMarket) {
    setMarketPrice(state, input.dataset.priceMarket, Number(input.value) / 100);
    updateControlOutput(input);
    renderChrome();
    persist();
  }
  if (input.dataset.marketing) {
    setMarketing(state, input.dataset.marketing, Number(input.value));
    updateControlOutput(input);
    renderChrome();
    persist();
  }
  if (input.dataset.operation) {
    setOperation(state, input.dataset.operation, Number(input.value));
    updateControlOutput(input);
    renderChrome();
    persist();
  }
  if (input.matches("[data-design-name]")) {
    shipyardDesign.name = input.value.slice(0,42);
    const preview = $("[data-preview-name]");
    if (preview) preview.textContent = shipyardDesign.name || "Unnamed ship";
  }
  if (input.matches("[data-design-colour]")) {
    shipyardDesign.livery = input.value;
    const preview = $(".preview-sea");
    if (preview) preview.style.setProperty("--ship-colour", input.value);
    const svg = $(".preview-ship");
    if (svg) svg.style.setProperty("--ship-colour", input.value);
  }
}

function handleChange(input) {
  if (!state) return;
  if (input.dataset.routeShip) {
    mutate(assignRoute(state, input.dataset.routeShip, input.value), `Route assigned to ${MARKETS[input.value]?.name || "market"}.`);
    return;
  }
  if (input.dataset.priceMarket || input.dataset.marketing || input.dataset.operation) {
    renderPanel(state.selectedTab);
    return;
  }
  if (input.dataset.designField) {
    shipyardDesign[input.dataset.designField] = input.value;
    normaliseShipyard();
    beep();
    renderShipyard();
    return;
  }
  if (input.matches("[data-design-feature]")) {
    if (input.checked) shipyardDesign.features.push(input.value);
    else shipyardDesign.features = shipyardDesign.features.filter((id) => id !== input.value);
    normaliseShipyard();
    beep();
    renderShipyard();
    return;
  }
  if (input.matches("[data-design-finance]")) {
    shipyardDesign.finance = input.value;
    beep();
    renderShipyard();
    return;
  }
  if (input.matches("[data-design-name], [data-design-colour]")) renderShipyard();
}

function runQuarter() {
  if (!state || state.status !== "planning") return;
  const button = $("#advance-quarter");
  button.disabled = true;
  button.querySelector("span").textContent = "At sea…";
  beep("report");
  const result = advanceQuarter(state);
  if (!result.ok) {
    button.disabled = false;
    toast(result.error, "error");
    return;
  }
  persist();
  renderAll();
  reportModal(result.report);
}

function resetGamePrompt() {
  confirmAction("Start a different company?", "The current local save will be replaced when the new line launches. There is no cloud copy.", "Open company formation", "restart-game", {}, true);
}

function bindEvents() {
  $("#new-game").addEventListener("click", openSetup);
  $("#close-setup").addEventListener("click", closeSetup);
  $("#random-name").addEventListener("click", randomCompanyName);
  $("#continue-game").addEventListener("click", () => { if (savedState) startGame(savedState); });
  $("#new-game-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const companyName = String(data.get("companyName") || "North Star Cruises").trim();
    const nextState = createNewGame({ companyName, focusId: data.get("focusId"), difficulty: data.get("difficulty"), seed: `${companyName}-${data.get("focusId")}-${Date.now()}` });
    beep("success");
    startGame(nextState, true);
  });
  $("#brand-home").addEventListener("click", () => switchTab("bridge"));
  $("#advance-quarter").addEventListener("click", runQuarter);
  $("#sound-toggle").addEventListener("click", () => {
    prefs.muted = !prefs.muted;
    savePrefs(prefs);
    renderChrome();
    if (!prefs.muted) beep("success");
  });
  $("#help-button").addEventListener("click", openHelp);
  $("#reset-button").addEventListener("click", resetGamePrompt);
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-backdrop").addEventListener("click", closeModal);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button, [data-market-jump]");
    if (!button || button.disabled) return;
    if (button.closest("#new-game-form") || ["new-game","close-setup","random-name","continue-game","brand-home","advance-quarter","sound-toggle","help-button","reset-button","modal-close"].includes(button.id)) return;
    handleButton(button);
  });
  document.addEventListener("input", (event) => { if (event.target.matches("input")) handleInput(event.target); });
  document.addEventListener("change", (event) => { if (event.target.matches("input, select")) handleChange(event.target); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#modal-layer").classList.contains("hidden")) closeModal();
    if (event.key === "Enter" && event.target.matches("[data-market-jump]")) handleButton(event.target);
    if (event.key.toLowerCase() === "q" && state && $("#modal-layer").classList.contains("hidden") && !event.target.matches("input,select,textarea")) runQuarter();
  });
}

function init() {
  renderSetupOptions();
  renderContinueButton();
  bindEvents();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

init();
