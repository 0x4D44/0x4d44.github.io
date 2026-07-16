// Chief Engineer — UI. All simulation mutations go through engine.applyAction /
// engine.tick; this file only renders state and dispatches actions.
// Rendering is reconciling: nodes are cached and mutated, never rebuilt per tick.

import {
  createVoyage, tick, applyAction, spinningReserve, totalDemandMw,
  burnRateTph, voyageSpendK, projectedFuelMargin, currentLeg, debrief,
  fmtClock, levelById, shipFor, ENGINE_SCHEMA,
} from "./engine.js";
import { SHIPS, LEVELS, EVENTS, MANUAL } from "./content.js";

const CAMPAIGN_KEY = "0x4d44.chief.campaign.v1";
const VOYAGE_KEY = "0x4d44.chief.voyage.v1";

const $app = document.getElementById("app");
const $live = document.getElementById("live");

// ------------------------------------------------------------- utilities --

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function setText(node, text) {
  if (node._t !== text) { node.textContent = text; node._t = text; }
}
function setClass(node, cls, on) {
  node.classList.toggle(cls, !!on);
}
function setAttr(node, attr, val) {
  const v = String(val);
  if (node.getAttribute(attr) !== v) node.setAttribute(attr, v);
}
// Keyed list reconciler: reuses nodes, keeps order, removes the departed.
function syncList(container, items, keyFn, createFn, updateFn) {
  const byKey = container._byKey ?? (container._byKey = new Map());
  const seen = new Set();
  let prev = null;
  let i = -1;
  for (const item of items) {
    i += 1;
    const k = String(keyFn(item, i));
    seen.add(k);
    let node = byKey.get(k);
    if (!node) { node = createFn(item); byKey.set(k, node); }
    updateFn(node, item);
    const want = prev ? prev.nextSibling : container.firstChild;
    if (want !== node) container.insertBefore(node, want);
    prev = node;
  }
  for (const [k, node] of byKey) {
    if (!seen.has(k)) { node.remove(); byKey.delete(k); }
  }
}

// -------------------------------------------------------------- storage ---

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* full/blocked */ }
}
function loadCampaign() {
  const c = loadJSON(CAMPAIGN_KEY);
  if (c && c.v === 1) return c;
  return { v: 1, unlocked: 1, stars: {}, muted: false };
}
function loadVoyageSnapshot() {
  const s = loadJSON(VOYAGE_KEY);
  if (s && s.v === ENGINE_SCHEMA && s.state && LEVELS.some((l) => l.id === s.state.levelId)) return s.state;
  localStorage.removeItem(VOYAGE_KEY);
  return null;
}

// ---------------------------------------------------------------- audio ---

let audioCtx = null;
function horn(severity) {
  if (campaign.muted) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t0 = audioCtx.currentTime;
    const beeps = severity === "red" ? [0, 0.22] : [0];
    for (const dt of beeps) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = severity === "red" ? 830 : 620;
      o.type = "square";
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.06, t0 + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.16);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 0.2);
    }
  } catch { /* no audio */ }
}

// ---------------------------------------------------------------- state ---

let campaign = loadCampaign();
let state = null;          // engine voyage state
let speed = 0;             // game-min per real second: 0 | 1 | 8 | 32
let acc = 0;
let lastFrame = 0;
let dirty = false;         // needs autosave
let lastSave = 0;
let ui = null;             // node registry for the voyage screen
let activeTab = "power";
let sheet = null;          // {kind:'dg', id} | {kind:'situation'} | null
let manualPage = null;
let toastQueue = [];
let toastShownAt = 0;
let lastLogLen = 0;
let lastAnnounce = 0;
let announceQueue = [];
let flashSpeedUntil = 0;

const TILE_MANUAL = { "bus-overload": "power", reserve: "reserve", blackout: "blackout", fuel: "fuel", eca: "eca", catfines: "purifiers", board: "blackout", dg: "generators" };
for (const ev of Object.values(EVENTS)) TILE_MANUAL[ev.tile] = ev.manual;

const levelOf = (st) => levelById(st.levelId);
const shipOf = (st) => shipFor(levelOf(st));

// =========================================================== menu screen ==

function showMenu() {
  state = null; ui = null; speed = 0;
  dismissToast(); toastQueue = [];
  closeOverlay();
  document.title = "Chief Engineer — Boreal Line";
  $app.replaceChildren();
  const scr = el("div", "screen");
  const head = el("div", "menu-head");
  head.append(el("div", "line", "BOREAL LINE · ENGINE DEPARTMENT"));
  head.append(el("h1", null, "CHIEF ENGINEER"));
  head.append(el("p", null,
    "Six ships, one watch that never ends. Run the generators, buy the fuel, keep the sewage moving, and answer the alarms — from a fjord runabout to a 96-megawatt city at sea."));
  scr.append(head);

  const snapshot = loadVoyageSnapshot();
  const fleet = el("div", "fleet");
  if (snapshot) {
    const lv = LEVELS.find((l) => l.id === snapshot.levelId);
    const card = el("button", "ship-card resume-card");
    card.append(el("div", "lvl", "RESUME WATCH"));
    card.append(el("h2", null, SHIPS[lv.ship].name));
    card.append(el("div", "meta", `${lv.name} — ${fmtClock(snapshot)}, ${snapshot.inPort ? "alongside" : "at sea"}, ${snapshot.alarms.filter((a) => a.active).length} active alarm(s)`));
    card.addEventListener("click", () => resumeVoyage(snapshot));
    fleet.append(card);
  }
  LEVELS.forEach((lv, i) => {
    const ship = SHIPS[lv.ship];
    const locked = i + 1 > campaign.unlocked;
    const card = el("button", "ship-card");
    card.dataset.locked = locked;
    card.disabled = locked;
    card.append(el("div", "lvl", `VOYAGE ${i + 1} — ${lv.name.toUpperCase()}`));
    card.append(el("h2", null, ship.name));
    card.append(silhouette(ship));
    card.append(el("div", "meta",
      `${ship.pax.toLocaleString()} passengers · ${ship.dgs.length}× DG, ${ship.dgs.reduce((s, d) => s + d.mw, 0).toFixed(0)} MW · ${lv.route[0].fromPort} → ${lv.route[lv.route.length - 1].toPort}`));
    const st = campaign.stars[lv.id];
    const stars3 = el("div", "stars");
    for (const key of ["safety", "service", "efficiency"]) {
      stars3.append(el("span", st?.[key] ? "" : "off", "★"));
    }
    stars3.append(el("span", "off", locked ? "  — complete the previous voyage" : st ? "" : "  — not yet sailed"));
    card.append(stars3);
    card.addEventListener("click", () => startLevel(lv.id));
    fleet.append(card);
  });
  scr.append(fleet);
  const foot = el("div", "menu-foot");
  const wipe = el("button", null, "Reset all progress");
  wipe.addEventListener("click", () => {
    if (confirm("Wipe campaign progress and any saved voyage?")) {
      localStorage.removeItem(CAMPAIGN_KEY); localStorage.removeItem(VOYAGE_KEY);
      campaign = loadCampaign(); showMenu();
    }
  });
  foot.append(el("div", null, "Progress lives in this browser only. Sound, saves and simulation are all local."), wipe);
  scr.append(foot);
  $app.append(scr);
}

function silhouette(ship) {
  const sil = el("div", "sil");
  sil.setAttribute("aria-hidden", "true");
  const decks = Math.max(1, Math.round(Math.log2(ship.pax / 80)));
  const w = Math.min(260, 90 + ship.pax / 40);
  const wrap = el("div");
  wrap.style.cssText = `display:grid;gap:0;width:${w}px`;
  for (let d = decks; d > 0; d--) {
    const deck = el("div", "deck");
    deck.style.cssText = `height:6px;width:${55 + (d / decks) * 40}%;margin-left:${8 - (d / decks) * 4}%`;
    wrap.append(deck);
  }
  const hull = el("div", "hull");
  hull.style.cssText = "height:12px;width:100%;clip-path:polygon(0 0,100% 0,94% 100%,3% 100%)";
  wrap.append(hull);
  sil.append(wrap);
  return sil;
}

// ========================================================= voyage screen ==

function startLevel(levelId) {
  const existing = loadVoyageSnapshot();
  if (existing && !confirm("Starting a new voyage discards your saved one. Continue?")) return;
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) | 0;
  state = createVoyage(levelId, seed);
  localStorage.removeItem(VOYAGE_KEY);
  enterVoyage(true);
}
function resumeVoyage(snapshot) {
  state = snapshot;
  enterVoyage(false);
  sheet = { kind: "situation" };
  render();
}
function enterVoyage(fresh) {
  speed = 0; acc = 0; sheet = null; manualPage = null; activeTab = "power";
  dismissToast();
  toastQueue = []; lastLogLen = fresh ? 0 : state.log.length;
  document.title = `${shipOf(state).name} — Chief Engineer`;
  buildVoyageDom();
  if (fresh) { speed = 1; }
  render();
}

function buildVoyageDom() {
  $app.replaceChildren();
  ui = {};
  const root = el("div", "voyage");

  // ---- header console
  const hdr = el("section", "console");
  const hrow = el("div", "hdr");
  ui.shipName = el("div", "ship");
  ui.shipSub = el("small");
  ui.shipName.append(ui.shipSub);
  const shipLabel = el("span", null, shipOf(state).name);
  ui.shipName.prepend(shipLabel);
  ui.clock = el("div", "clock mono");
  ui.speedctl = el("div", "speedctl");
  ui.speedBtns = {};
  for (const [label, val] of [["⏸", 0], ["1×", 1], ["8×", 8], ["32×", 32]]) {
    const b = el("button", null, label);
    b.setAttribute("aria-label", val === 0 ? "Pause" : `Speed ${label}`);
    b.addEventListener("click", () => setSpeed(val));
    ui.speedBtns[val] = b;
    ui.speedctl.append(b);
  }
  ui.mute = el("button", "small", campaign.muted ? "🔇" : "🔔");
  ui.mute.setAttribute("aria-label", "Toggle alarm sound");
  ui.mute.addEventListener("click", () => {
    campaign.muted = !campaign.muted;
    ui.mute.textContent = campaign.muted ? "🔇" : "🔔";
    saveJSON(CAMPAIGN_KEY, campaign);
  });
  ui.menuBtn = el("button", "small", "⟵ Fleet");
  ui.menuBtn.addEventListener("click", () => { saveVoyage(); showMenu(); });
  hrow.append(ui.menuBtn, ui.shipName, ui.clock, ui.speedctl, ui.mute);
  hdr.append(hrow);

  const kpis = el("div", "kpis");
  ui.kpi = {};
  for (const [id, label] of [["load", "BUS LOAD"], ["reserve", "RESERVE"], ["kn", "SPEED"],
    ["comfort", "COMFORT"], ["fuel", "FUEL MARGIN"], ["spend", "SPENT k€"], ["wx", "SEA"]]) {
    const k = el("div", "kpi");
    k.append(el("div", "k", label));
    ui.kpi[id] = el("div", "v");
    k.append(ui.kpi[id]);
    kpis.append(k);
  }
  hdr.append(kpis);
  ui.route = el("div", "route");
  ui.route.setAttribute("aria-hidden", "true");
  buildRoute();
  hdr.append(ui.route);
  root.append(hdr);

  // ---- objective banner
  ui.objbar = el("div", "objbar");
  ui.objbar.append(el("span", "tick", "OBJECTIVE"));
  ui.objText = el("span");
  ui.objbar.append(ui.objText);
  root.append(ui.objbar);

  // ---- annunciator
  const ann = el("section", "console");
  ann.append(el("h3", null, "Alarm annunciator"));
  ui.annun = el("div", "annun");
  buildAnnunciator();
  ann.append(ui.annun);
  const abar = el("div", "annun-bar");
  ui.ackAll = el("button", null, "ACKNOWLEDGE ALL");
  ui.ackAll.addEventListener("click", () => { act({ type: "alarm.ackAll" }); });
  ui.telegraph = el("button", "primary");
  ui.telegraph.addEventListener("click", () => act({ type: "telegraph.ack" }));
  abar.append(ui.ackAll, ui.telegraph, el("span", "spacer"));
  ui.emgen = el("span", "emgen", "EMCY GEN");
  abar.append(ui.emgen);
  ann.append(abar);
  root.append(ann);

  // ---- crisis event cards
  ui.events = el("div", "events");
  root.append(ui.events);

  // ---- main: tabs + rail
  const main = el("div", "main");
  const left = el("div");
  const tabs = el("div", "tabs");
  tabs.setAttribute("role", "tablist");
  ui.tabBtns = {};
  for (const [id, label] of [["power", "POWER"], ["fuel", "FUEL"], ["maint", "MAINT"], ["sys", "SYSTEMS"], ["manual", "MANUAL"]]) {
    const b = el("button", null, label);
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => { activeTab = id; render(); });
    ui.tabBtns[id] = b;
    tabs.append(b);
  }
  left.append(tabs);
  ui.tabPanel = el("section", "console tabpanel");
  left.append(ui.tabPanel);
  ui.panels = {
    power: buildPowerPanel(),
    fuel: buildFuelPanel(),
    maint: buildMaintPanel(),
    sys: buildSysPanel(),
    manual: buildManualPanel(),
  };
  main.append(left);

  const rail = el("div", "rail");
  const objC = el("section", "console");
  objC.append(el("h3", null, "Voyage objectives"));
  ui.objs = el("div", "objs");
  objC.append(ui.objs);
  const alC = el("section", "console");
  alC.append(el("h3", null, "Active alarms"));
  ui.alist = el("div", "alist");
  alC.append(ui.alist);
  const logC = el("section", "console");
  logC.append(el("h3", null, "Engine log"));
  ui.log = el("div", "log");
  logC.append(ui.log);
  rail.append(objC, alC, logC);
  main.append(rail);
  root.append(main);

  $app.append(root);
  ui.root = root;
}

function setSpeed(v) {
  speed = v;
  if (v > 0 && audioCtx?.state === "suspended") audioCtx.resume();
  render();
}

// ---- route strip -----------------------------------------------------------

function buildRoute() {
  const lv = levelOf(state);
  const total = lv.route.reduce((s, l) => s + l.distanceNm, 0);
  ui.route.replaceChildren();
  ui.routeSegs = [];
  const wxGlyph = { calm: "", moderate: "≈", rough: "≋", storm: "⚠" };
  lv.route.forEach((leg, i) => {
    const port = el("div", "port");
    port.append(el("span", "nm", leg.fromPort));
    ui.route.append(port);
    const seg = el("div", "seg" + (leg.eca ? " eca" : ""));
    seg.style.width = `${(leg.distanceNm / total) * 100}%`;
    seg.title = `${leg.fromPort} → ${leg.toPort} · ${leg.distanceNm} nm · ${leg.weather}${leg.eca ? " · ECA" : ""}`;
    seg.append(el("span", "wx", wxGlyph[leg.weather] ?? ""));
    ui.route.append(seg);
    ui.routeSegs.push(seg);
    if (i === lv.route.length - 1) {
      const dest = el("div", "port");
      dest.append(el("span", "nm", leg.toPort));
      ui.route.append(dest);
    }
  });
  ui.shipmark = el("div", "shipmark", "▼");
  ui.route.append(ui.shipmark);
}

function updateRoute() {
  const lv = levelOf(state);
  const total = lv.route.reduce((s, l) => s + l.distanceNm, 0);
  let before = 0;
  for (let i = 0; i < state.legIndex && i < lv.route.length; i++) before += lv.route[i].distanceNm;
  const dist = Math.min(before + state.legDistNm, total);
  ui.shipmark.style.left = `${(dist / total) * 100}%`;
}

// ---- annunciator ------------------------------------------------------------

function annunTiles() {
  const ship = shipOf(state);
  const lv = levelOf(state);
  const tiles = [];
  for (const d of ship.dgs) tiles.push({ key: d.id, label: d.id });
  tiles.push({ key: "bus-overload", label: "BUS OVLD" }, { key: "reserve", label: "RESERVE" }, { key: "blackout", label: "DEAD SHIP" });
  if (ship.boards.length > 1) for (const b of ship.boards) tiles.push({ key: `board-${b.id}`, label: `${b.id} BOARD` });
  tiles.push({ key: "fuel", label: "FUEL" });
  if (lv.route.some((l) => l.eca)) tiles.push({ key: "eca", label: "ECA" });
  if (ship.systems.includes("purifier")) tiles.push({ key: "pur", label: "PURIFIER" }, { key: "catfines", label: "FUEL QUAL" });
  if (ship.systems.includes("boiler")) tiles.push({ key: "blr", label: "BOILER" });
  if (ship.systems.includes("chillers")) tiles.push({ key: "hvac", label: "CHILLERS" });
  if (ship.systems.includes("sewage")) tiles.push({ key: "sew", label: "SEWAGE" });
  if (ship.systems.includes("freshwater")) tiles.push({ key: "fw", label: "FRESH WTR" });
  if (ship.systems.includes("stabilizers")) tiles.push({ key: "stab", label: "STABS" });
  if (ship.scrubber) tiles.push({ key: "scr", label: "SCRUBBER" });
  tiles.push({ key: "str", label: "STEERING" });
  if (ship.boards.length > 1) tiles.push({ key: "fire", label: "FIRE" }, { key: "blg", label: "BILGE" }, { key: "mist", label: "OIL MIST" }, { key: "wave", label: "SEA STATE" });
  if (ship.systems.includes("purifier")) tiles.push({ key: "bnk", label: "BUNKER" });
  return tiles;
}

function buildAnnunciator() {
  ui.annun.replaceChildren();
  ui.tiles = new Map();
  for (const t of annunTiles()) {
    const tile = el("button", "tile", t.label);
    tile.title = "Click to acknowledge";
    tile.addEventListener("click", () => {
      for (const a of tileAlarms(t.key)) act({ type: "alarm.ack", id: a.id });
    });
    ui.tiles.set(t.key, tile);
    ui.annun.append(tile);
  }
}

function tileKeyForAlarm(a) {
  if (a.component && ui.tiles.has(a.component)) return a.component; // per-DG tiles
  if (a.tileId === "board") return `board-${a.component}`;
  return a.tileId;
}
function tileAlarms(key) {
  return state.alarms.filter((a) => a.active && tileKeyForAlarm(a) === key);
}

function updateAnnunciator() {
  const byTile = new Map();
  for (const a of state.alarms) {
    if (!a.active) continue;
    const k = tileKeyForAlarm(a);
    const cur = byTile.get(k) ?? { sev: null, unacked: false };
    if (a.severity === "red" || cur.sev === null) cur.sev = cur.sev === "red" ? "red" : a.severity;
    if (!a.acked) cur.unacked = true;
    byTile.set(k, cur);
  }
  for (const [key, tile] of ui.tiles) {
    const st = byTile.get(key);
    setClass(tile, "amber", st?.sev === "amber");
    setClass(tile, "red", st?.sev === "red");
    setClass(tile, "unacked", !!st?.unacked);
  }
}

// ---- power panel -------------------------------------------------------------

function buildPowerPanel() {
  const ship = shipOf(state);
  const panel = el("div");
  ui.boards = new Map();
  ship.boards.forEach((b, i) => {
    const bd = el("div", "board");
    const busrow = el("div", "busrow");
    busrow.append(el("span", "buslabel", ship.boards.length > 1 ? `${b.id} · 11 kV` : "MAIN BUS · 6.6 kV"));
    const bus = el("div", "busbar");
    const fill = el("i", "fill");
    bus.append(fill);
    const load = el("span", "busload mono");
    busrow.append(bus, load);
    bd.append(busrow);
    const dgrow = el("div", "dgrow");
    bd.append(dgrow);
    panel.append(bd);
    ui.boards.set(b.id, { bus, fill, load, dgrow, dgNodes: new Map() });
    if (i === 0 && ship.boards.length > 1) {
      ui.tieBtn = el("button", "tiebtn");
      ui.tieBtn.addEventListener("click", () => act({ type: state.tieClosed ? "tie.open" : "tie.close" }));
      panel.append(ui.tieBtn);
    }
  });
  // DG tiles
  for (const d of ship.dgs) {
    const node = el("button", "dg");
    const top = el("div", "top");
    top.append(el("span", "led"), el("span", "id", d.id), el("span", "mw", `${d.mw} MW`));
    node.append(top);
    const bar = el("div", "loadbar");
    node._fill = el("i");
    bar.append(node._fill);
    node.append(bar);
    node._sub = el("div", "sub");
    node.append(node._sub);
    node.addEventListener("click", () => { sheet = { kind: "dg", id: d.id }; render(); });
    ui.boards.get(d.board).dgNodes.set(d.id, node);
    ui.boards.get(d.board).dgrow.append(node);
  }
  // consumers
  const cons = el("div", "consumers");
  ui.propChip = chip("PROPULSION");
  ui.hotelChip = chip("HOTEL");
  ui.reserveChip = chip("SPINNING RESERVE");
  const shedRow = el("div", "row");
  ui.shedBtns = [];
  for (let s = 0; s <= 3; s++) {
    const b = el("button", "small", s === 0 ? "FULL" : `SHED ${s}`);
    b.addEventListener("click", () => act({ type: "shed.set", stage: s }));
    ui.shedBtns.push(b);
    shedRow.append(b);
  }
  ui.hotelChip.node.append(shedRow);
  const spdRow = el("div", "row");
  ui.spdDown = el("button", "small", "− kn");
  ui.spdUp = el("button", "small", "+ kn");
  ui.slowReq = el("button", "small", "Ask bridge: reduce");
  ui.spdDown.addEventListener("click", () => act({ type: "speed.set", kn: Math.max(0, Math.floor(state.commandedKn) - 1) }));
  ui.spdUp.addEventListener("click", () => act({ type: "speed.set", kn: Math.floor(state.commandedKn) + 1 }));
  ui.slowReq.addEventListener("click", () => act({ type: state.slowdownGranted ? "bridge.requestResume" : "bridge.requestSlowdown" }));
  spdRow.append(ui.spdDown, ui.spdUp, ui.slowReq);
  ui.propChip.node.append(spdRow);
  if (LEVELS.indexOf(levelOf(state)) >= 2) {
    ui.pmsBtn = el("button", "small");
    ui.pmsBtn.addEventListener("click", () => act({ type: "pms.auto", on: !state.pmsAuto }));
    ui.reserveChip.node.append(ui.pmsBtn);
  } else {
    ui.pmsBtn = null;
  }
  cons.append(ui.propChip.node, ui.hotelChip.node, ui.reserveChip.node);
  panel.append(cons);
  return panel;
}
function chip(title) {
  const node = el("div", "chip");
  node.append(el("div", "t", title));
  const v = el("div", "v");
  node.append(v);
  return { node, v };
}

function updatePowerPanel() {
  const ship = shipOf(state);
  for (const b of state.boards) {
    const nodes = ui.boards.get(b.id);
    const dgsOn = state.dgs.filter((d) => d.board === b.id && d.state === "online");
    const loadPct = dgsOn.length ? Math.round(dgsOn[0].loadPct) : 0;
    nodes.fill.style.width = `${b.online ? Math.min(100, loadPct) : 0}%`;
    setClass(nodes.bus, "hot", loadPct > 90);
    setClass(nodes.bus, "dead", !b.online);
    setText(nodes.load, b.online ? `${loadPct}%` : "DEAD");
  }
  if (ui.tieBtn) {
    setText(ui.tieBtn, state.tieClosed ? "◄ BUS TIE CLOSED ►" : "◄ BUS TIE OPEN ►");
    setAttr(ui.tieBtn, "data-closed", state.tieClosed);
  }
  for (const d of state.dgs) {
    const node = ui.boards.get(d.board).dgNodes.get(d.id);
    setAttr(node, "data-state", d.state);
    node._fill.style.width = `${Math.min(100, d.loadPct)}%`;
    const sub = d.state === "online" ? `${d.loadPct.toFixed(0)} %  ·  ${d.fuel}`
      : d.state === "starting" ? "STARTING…"
      : d.state === "ready" ? "READY — CLOSE BKR"
      : d.state === "repair" ? "UNDER REPAIR"
      : d.state.toUpperCase();
    setText(node._sub, sub);
  }
  const leg = currentLeg(state);
  setText(ui.propChip.v, state.inPort ? "ALONGSIDE" : `${state.actualKn.toFixed(1)} kn  →  ${state.commandedKn.toFixed(0)} kn ord ${state.orderedKn.toFixed(0)}`);
  setText(ui.slowReq, state.slowdownGranted ? "Ask bridge: resume" : "Ask bridge: reduce");
  const stage = Math.max(...state.boards.map((b) => b.shedStage));
  setText(ui.hotelChip.v, `${totalDemandMw(state).toFixed(1)} MW total · shed ${stage}`);
  ui.shedBtns.forEach((b, i) => setClass(b, "primary", i === stage));
  const res = spinningReserve(state);
  setText(ui.reserveChip.v, `${res.toFixed(1)} MW ${res >= 0 ? "(N+1 held)" : "(NO RESERVE)"}`);
  ui.reserveChip.v.style.color = res >= 0 ? "" : "var(--amber)";
  if (ui.pmsBtn) {
    setText(ui.pmsBtn, state.pmsAuto ? "PMS ASSIST: AUTO (safe, thirsty)" : "PMS ASSIST: MANUAL");
    setClass(ui.pmsBtn, "primary", state.pmsAuto);
  }
}

// ---- fuel panel ---------------------------------------------------------------

function buildFuelPanel() {
  const panel = el("div", "panel-grid");
  ui.fuelMeters = {};
  const tanksBox = el("div");
  tanksBox.append(el("h3", null, "TANKS"));
  for (const g of ["HFO", "MGO"]) {
    if (shipOf(state).tankCap[g] <= 0) continue;
    const m = meter(`${g}`, "t");
    ui.fuelMeters[g] = m;
    tanksBox.append(m.node);
  }
  ui.burnLine = el("div", "mono");
  ui.marginLine = el("div", "mono");
  tanksBox.append(ui.burnLine, ui.marginLine);
  panel.append(tanksBox);

  const gradeBox = el("div");
  gradeBox.append(el("h3", null, "GRADE & COMPLIANCE"));
  ui.gradeLine = el("div", "mono");
  gradeBox.append(ui.gradeLine);
  ui.switchBtns = {};
  for (const g of ["HFO", "MGO"]) {
    if (shipOf(state).tankCap[g] <= 0) continue;
    const b = el("button", null, `Switch over to ${g}`);
    b.addEventListener("click", () => act({ type: "fuel.switchover", grade: g }));
    ui.switchBtns[g] = b;
    gradeBox.append(b);
  }
  if (shipOf(state).scrubber) {
    ui.scrubBtn = el("button");
    ui.scrubBtn.addEventListener("click", () => act({ type: state.scrubberOn ? "scrubber.stop" : "scrubber.start" }));
    gradeBox.append(ui.scrubBtn);
  }
  ui.ecaLine = el("div");
  gradeBox.append(ui.ecaLine);
  panel.append(gradeBox);

  if (shipOf(state).systems.includes("purifier")) {
    const treatBox = el("div");
    treatBox.append(el("h3", null, "FUEL TREATMENT"));
    ui.purLine = el("div");
    ui.catMeter = meter("CAT FINES EXPOSURE", "%");
    treatBox.append(ui.purLine, ui.catMeter.node);
    panel.append(treatBox);
  }

  ui.bunkerBox = el("div", "bunker");
  ui.bunkerBox.append(el("h3", null, "BUNKERING"));
  ui.bunkerBody = el("div");
  ui.bunkerBox.append(ui.bunkerBody);
  panel.append(ui.bunkerBox);
  return panel;
}
function meter(label, unit) {
  const node = el("div", "meter");
  const lab = el("div", "lab");
  const name = el("span", null, label);
  const val = el("span", "mono");
  lab.append(name, val);
  const bar = el("div", "bar");
  const fill = el("i");
  bar.append(fill);
  node.append(lab, bar);
  return { node, val, fill, unit };
}
function setMeter(m, frac, text, level) {
  m.fill.style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
  setText(m.val, text);
  setClass(m.node, "warn", level === "warn");
  setClass(m.node, "bad", level === "bad");
}

function updateFuelPanel() {
  const ship = shipOf(state);
  for (const g of ["HFO", "MGO"]) {
    const m = ui.fuelMeters[g];
    if (!m) continue;
    const frac = state.tanks[g] / (ship.tankCap[g] || 1);
    setMeter(m, frac, `${state.tanks[g].toFixed(0)} / ${ship.tankCap[g]} t`, frac < 0.12 ? "bad" : frac < 0.25 ? "warn" : "");
  }
  setText(ui.burnLine, `Burning ≈ ${burnRateTph(state).toFixed(1)} t/h ${state.fleetFuel}`);
  const margin = projectedFuelMargin(state);
  setText(ui.marginLine, `Projected ${state.fleetFuel} at destination: ${margin >= 0 ? "+" : ""}${margin.toFixed(0)} t`);
  ui.marginLine.style.color = margin < 0 ? "var(--red)" : margin < 100 ? "var(--amber)" : "";
  setText(ui.gradeLine, state.switchover
    ? `Switchover to ${state.switchover.target} — ${state.switchover.ticksLeft} min remaining`
    : `Plant is burning ${state.fleetFuel}`);
  for (const [g, b] of Object.entries(ui.switchBtns)) {
    b.disabled = !!state.switchover || state.fleetFuel === g || (state.tanks[g] ?? 0) <= 0;
  }
  if (ui.scrubBtn) {
    setText(ui.scrubBtn, state.scrubberFault ? "Scrubber FAULT — see MAINT" : state.scrubberOn ? "Scrubber running — stop" : "Start scrubber");
    ui.scrubBtn.disabled = state.scrubberFault;
  }
  const leg = currentLeg(state);
  const compliant = !leg?.eca || state.inPort || state.fleetFuel === "MGO" || (state.scrubberOn && !state.scrubberFault);
  setText(ui.ecaLine, leg?.eca ? (compliant ? "Inside ECA — compliant." : "Inside ECA — NON-COMPLIANT (fines accruing)") : "Outside ECA.");
  ui.ecaLine.style.color = leg?.eca && !compliant ? "var(--red)" : "var(--dim)";
  if (ui.purLine) {
    setText(ui.purLine, `Purifier: ${state.systems.purifier.toUpperCase()}`);
    ui.purLine.style.color = state.systems.purifier === "ok" ? "var(--dim)" : "var(--red)";
    setMeter(ui.catMeter, state.catFinesExposure / 100, `${state.catFinesExposure.toFixed(0)} %`,
      state.catFinesExposure > 70 ? "bad" : state.catFinesExposure > 40 ? "warn" : "");
  }
  // bunkering
  const lv = levelOf(state);
  const port = lv.route[state.legIndex];
  const canBunker = state.inPort && port?.bunkerPrices;
  if (canBunker && !ui.bunkerBody._built) {
    ui.bunkerBody._built = true;
    ui.bunkerBody.replaceChildren();
    ui.bunkerBody.append(el("div", null, `Barge alongside — HFO €${port.bunkerPrices.HFO}/t · MGO €${port.bunkerPrices.MGO}/t (owner's account)`));
    const row = el("div", "row");
    const inputs = {};
    for (const g of ["HFO", "MGO"]) {
      if (shipOf(state).tankCap[g] <= 0) continue;
      const lab = el("label", null, `${g} t `);
      const inp = document.createElement("input");
      inp.type = "number"; inp.min = 0; inp.step = 50; inp.value = 0;
      inp.max = shipOf(state).tankCap[g] - Math.floor(state.tanks[g]);
      lab.append(inp);
      inputs[g] = inp;
      row.append(lab);
    }
    const go = el("button", "primary", "Take bunkers");
    go.addEventListener("click", () => {
      act({ type: "bunker.plan", hfo: Number(inputs.HFO?.value ?? 0), mgo: Number(inputs.MGO?.value ?? 0) });
      if (inputs.HFO) inputs.HFO.value = 0;
      if (inputs.MGO) inputs.MGO.value = 0;
    });
    row.append(go);
    ui.bunkerBody.append(row);
  } else if (!canBunker && ui.bunkerBody._built !== false) {
    ui.bunkerBody._built = false;
    ui.bunkerBody.replaceChildren(el("div", null, "No bunker barge here — plan tonnage at the next priced port."));
  }
}

// ---- maintenance panel ----------------------------------------------------------

function buildMaintPanel() {
  const panel = el("div");
  ui.teamsLine = el("div", null);
  panel.append(ui.teamsLine);
  ui.jobs = el("div", "jobs");
  panel.append(ui.jobs);
  return panel;
}
function updateMaintPanel() {
  setText(ui.teamsLine, `Repair teams: ${state.teams - state.teamsBusy} of ${state.teams} free`);
  const jobs = [...state.jobs].sort((a, b) => rank(b) - rank(a));
  function rank(j) {
    if (j.status === "running") return 90;
    if (j.status === "open") return (j.critical ? 50 : 20) + (state.tick > (j.dueTick ?? Infinity) ? 25 : 0);
    return 0;
  }
  syncList(ui.jobs, jobs, (j) => j.id, (j) => {
    const node = el("div", "job");
    node.append(el("div", "t", j.title));
    const row = el("div", "row");
    row.append(el("span", "status"), el("span", "dur"), el("span", "due"));
    const btn = el("button", "small");
    btn.addEventListener("click", () => {
      const cur = state.jobs.find((x) => x.id === j.id);
      act({ type: cur.status === "running" ? "job.cancel" : "job.start", jobId: j.id });
    });
    row.append(btn);
    node.append(row);
    return node;
  }, (node, j) => {
    setAttr(node, "data-status", j.status);
    setText(node.querySelector(".status"), j.status === "running" ? "IN HAND" : j.status.toUpperCase());
    setText(node.querySelector(".dur"), j.status === "running" ? `${Math.ceil(j.ticksLeft / 60)}h left` : `~${Math.ceil(j.durationMin / 60)}h · ${j.partsCost ?? 0}k€`);
    setText(node.querySelector(".due"), j.status === "open" && state.tick > (j.dueTick ?? Infinity) ? "OVERDUE" : "");
    const btn = node.querySelector("button");
    if (j.status === "done") { btn.hidden = true; }
    else {
      btn.hidden = false;
      setText(btn, j.status === "running" ? "Recall team" : "Send team");
      btn.disabled = j.status === "open" && state.teamsBusy >= state.teams;
    }
  });
}

// ---- systems panel -----------------------------------------------------------------

function buildSysPanel() {
  const panel = el("div");
  ui.sysList = el("div", "jobs");
  panel.append(ui.sysList);
  const wxRow = el("div", "row");
  ui.secureBtn = el("button", null, "Secure for heavy weather");
  ui.secureBtn.addEventListener("click", () => act({ type: "weather.secure" }));
  ui.stabBtn = el("button");
  ui.stabBtn.addEventListener("click", () => act({ type: "stabilizers.set", out: !state.stabilizersOut }));
  wxRow.append(ui.secureBtn);
  if (shipOf(state).systems.includes("stabilizers")) wxRow.append(ui.stabBtn);
  panel.append(el("h3", null, "HEAVY WEATHER"), wxRow);
  return panel;
}
const SYS_LABEL = {
  steering: "Steering gear", sewage: "Vacuum sewage", purifier: "Fuel purifiers",
  boiler: "Aux boilers", freshwater: "Fresh water plant", stabilizers: "Fin stabilizers", chillers: "A/C chillers",
};
function updateSysPanel() {
  const entries = Object.entries(state.systems);
  syncList(ui.sysList, entries, ([id]) => id, ([id]) => {
    const node = el("div", "sys");
    node.append(el("span", "led"), el("span", "nm", SYS_LABEL[id] ?? id), el("span", "st mono"));
    return node;
  }, (node, [id, st]) => {
    setAttr(node, "data-st", st);
    setText(node.querySelector(".st"), st.toUpperCase());
  });
  ui.secureBtn.disabled = state.securedForWeather;
  setText(ui.secureBtn, state.securedForWeather ? "Secured for heavy weather ✓" : "Secure for heavy weather");
  if (shipOf(state).systems.includes("stabilizers")) {
    setText(ui.stabBtn, state.stabilizersOut ? "House stabilizer fins" : "Deploy stabilizer fins");
    ui.stabBtn.disabled = state.systems.stabilizers === "down";
  }
}

// ---- manual panel ------------------------------------------------------------------

function buildManualPanel() {
  const panel = el("div");
  ui.manualList = el("div", "manual-list");
  for (const p of MANUAL) {
    const b = el("button", null, p.title);
    b.addEventListener("click", () => { manualPage = p.id; render(); });
    ui.manualList.append(b);
  }
  ui.manualArticle = el("div", "manual-page");
  panel.append(ui.manualList, ui.manualArticle);
  return panel;
}
function updateManualPanel() {
  const page = MANUAL.find((p) => p.id === manualPage);
  if (!page) { ui.manualArticle.replaceChildren(el("p", null, "The Boreal Line engineering manual. Pick a chapter — every alarm links here too.")); return; }
  if (ui.manualArticle._page !== page.id) {
    ui.manualArticle._page = page.id;
    ui.manualArticle.replaceChildren(el("h4", null, page.title.toUpperCase()));
    for (const para of page.body) ui.manualArticle.append(el("p", null, para));
    // procedures for events pointing at this page
    for (const [eid, ev] of Object.entries(EVENTS)) {
      if (ev.manual !== page.id) continue;
      const steps = ev.phases.flatMap((ph) => ph.interventions ?? []);
      if (!steps.length) continue;
      ui.manualArticle.append(el("p", null, `Procedure — ${ev.title}: ${steps.map((s, i) => `(${i + 1}) ${s.label}`).join("  ")}`));
    }
  }
}

// ---- events (crisis cards) -----------------------------------------------------------

function updateEvents() {
  syncList(ui.events, state.events, (inst) => inst.id, (inst) => {
    const ev = EVENTS[inst.eventId];
    const card = el("div", "event-card");
    const h = el("h4");
    card.append(h);
    card.append(el("div", "phase"));
    card.append(el("div", "cd mono"));
    card.append(el("div", "ivs"));
    const help = el("button", "small", "? Manual");
    help.addEventListener("click", () => { activeTab = "manual"; manualPage = ev.manual; render(); });
    card.append(help);
    return card;
  }, (card, inst) => {
    const ev = EVENTS[inst.eventId];
    const ph = ev.phases[inst.phaseIndex];
    setClass(card, "amber", ph.severity !== "red");
    setText(card.querySelector("h4"), `${ev.title.toUpperCase()}${inst.componentId ? ` — ${inst.componentId}` : ""}`);
    setText(card.querySelector(".phase"), (ph.text ?? "").replaceAll("{c}", inst.componentId ?? ""));
    const nextPh = ev.phases[inst.phaseIndex + 1];
    setText(card.querySelector(".cd"),
      ph.terminal ? "" : `${inst.ticksLeft} min before ${nextPh ? "this escalates" : "this closes"}`);
    const ivBox = card.querySelector(".ivs");
    syncList(ivBox, (ph.interventions ?? []).map((iv) => ({ iv, inst })), (x) => x.iv.id, (x) => {
      const row = el("div", "iv");
      const mark = el("span", "done");
      const btn = el("button", "small");
      btn.addEventListener("click", () => act({ type: "event.intervene", instanceId: x.inst.id, interventionId: x.iv.id }));
      row.append(mark, btn);
      return row;
    }, (row, x) => {
      const done = x.inst.doneInterventions.includes(x.iv.id);
      const ready = (x.iv.requires ?? []).every((r) => x.inst.doneInterventions.includes(r));
      setText(row.querySelector(".done"), done ? "✓" : ready ? "▸" : "·");
      const btn = row.querySelector("button");
      setText(btn, x.iv.label);
      btn.disabled = done;
    });
  });
}

// ---- rail: objectives, alarms, log ------------------------------------------------------

function updateRail() {
  syncList(ui.objs, state.objectives, (o) => o.id, () => {
    const node = el("div", "obj");
    node.append(el("span", "box"), el("span", "tx"));
    return node;
  }, (node, o) => {
    setClass(node, "done", o.done);
    setText(node.querySelector(".box"), o.done ? "[✓]" : "[ ]");
    setText(node.querySelector(".tx"), o.text);
  });
  const firstPending = state.objectives.find((o) => !o.done);
  setText(ui.objText, firstPending ? firstPending.text : "All objectives complete — bring her in.");

  const active = state.alarms.filter((a) => a.active);
  syncList(ui.alist, active, (a) => a.id, (a) => {
    const node = el("div", "alarm");
    node._tx = el("span", "tx");
    node._when = el("span", "when mono");
    node._ack = el("button", "small", "ACK");
    node.append(el("span", "sev"), node._tx, node._when);
    const ack = node._ack;
    ack.addEventListener("click", () => act({ type: "alarm.ack", id: a.id }));
    const help = el("button", "small", "?");
    help.setAttribute("aria-label", "Open manual page for this alarm");
    help.addEventListener("click", () => {
      activeTab = "manual";
      manualPage = TILE_MANUAL[a.tileId] ?? "alarms";
      render();
    });
    node.append(ack, help);
    return node;
  }, (node, a) => {
    setAttr(node, "data-sev", a.severity);
    setText(node._tx, a.text);
    setText(node._when, `t+${state.tick - a.tick}m`);
    node._ack.hidden = a.acked;
  });
  // log: windowed to the last 200 lines; full log stays in state
  const lines = state.log.slice(-200);
  const baseIdx = state.log.length - lines.length;
  const stickBottom = ui.log.scrollTop + ui.log.clientHeight >= ui.log.scrollHeight - 8;
  syncList(ui.log, lines,
    (l, i) => baseIdx + i, () => {
      const node = el("div", "logline");
      node._when = el("span", "when");
      node._tx = el("span", "tx");
      node.append(node._when, node._tx);
      return node;
    }, (node, l) => {
      node.className = `logline ${l.kind}`;
      setText(node._when, l.clock);
      setText(node._tx, l.kind === "mentor" ? `VOSS — ${l.text.replace(/^Voss: /, "")}` : l.text);
    });
  if (stickBottom) ui.log.scrollTop = ui.log.scrollHeight;
}

// ---- toasts & announcements ----------------------------------------------------------

function pumpNarration() {
  // new log entries → mentor toasts + aria-live announcements + horn
  for (let i = lastLogLen; i < state.log.length; i++) {
    const line = state.log[i];
    if (line.kind === "mentor") toastQueue.push(line.text.replace(/^Voss: /, ""));
    if (line.kind === "alarm") { announceQueue.push(`Alarm: ${line.text}`); horn("red"); }
    else if (line.kind === "warn" && line.text.startsWith("WARN")) { announceQueue.push(line.text); horn("amber"); }
  }
  lastLogLen = state.log.length;

  const now = performance.now();
  if (announceQueue.length && now - lastAnnounce > 2000) {
    $live.textContent = announceQueue.splice(0, 2).join(". ");
    if (announceQueue.length > 4) announceQueue.length = 0;
    lastAnnounce = now;
  }
  updateToast(now);
}
let toastNode = null;
function updateToast(now) {
  if (!toastNode && toastQueue.length) {
    const text = toastQueue.shift();
    toastNode = el("div", "toast");
    const body = el("div");
    body.append(el("div", "who", "STAFF CHIEF VOSS"));
    body.append(el("div", null, text));
    const ok = el("button", "small", "Aye");
    ok.addEventListener("click", dismissToast);
    toastNode.append(body, ok);
    document.body.append(toastNode);
    toastShownAt = now;
  } else if (toastNode && now - toastShownAt > 16000 && toastQueue.length) {
    dismissToast(); // rotate when more are waiting
  }
}
function dismissToast() {
  toastNode?.remove();
  toastNode = null;
}

// ---- sheets ---------------------------------------------------------------------------

let overlayNode = null;
function closeOverlay() {
  sheet = null;
  overlayNode?.remove();
  overlayNode = null;
}
function updateSheet() {
  const want = sheet ? JSON.stringify(sheet) : null;
  if (overlayNode?._key === want) { if (sheet?.kind === "dg") fillDgSheet(overlayNode._sheet, sheet.id); return; }
  overlayNode?.remove(); overlayNode = null;
  if (!sheet) return;
  const ov = el("div", "overlay");
  ov.addEventListener("click", (e) => { if (e.target === ov) { sheet = null; render(); } });
  const sh = el("div", "sheet");
  sh.setAttribute("role", "dialog");
  sh.setAttribute("aria-modal", "true");
  ov.append(sh);
  ov._key = want; ov._sheet = sh;
  if (sheet.kind === "dg") buildDgSheet(sh, sheet.id);
  if (sheet.kind === "situation") buildSituationSheet(sh);
  document.body.append(ov);
  overlayNode = ov;
  sh.querySelector("button")?.focus();
}

function buildDgSheet(sh, id) {
  sh.replaceChildren();
  sh.append(el("h3", null, `DIESEL GENERATOR ${id}`));
  const kv = el("div", "kv");
  sh._fields = {};
  for (const [k, label] of [["state", "State"], ["load", "Load"], ["hours", "Running hours"], ["cond", "Condition"], ["sump", "LO sump"], ["fuel", "Fuel"]]) {
    const box = el("div");
    const lab = el("div", null, label);
    lab.style.cssText = "font-size:11px;color:var(--faint);letter-spacing:.15em;text-transform:uppercase";
    const val = el("div", "mono");
    box.replaceChildren(lab, val);
    sh._fields[k] = val;
    kv.append(box);
  }
  sh.append(kv);
  const actions = el("div", "actions");
  sh._btns = {};
  for (const [key, label, action] of [
    ["start", "START", { type: "dg.start", id }],
    ["stop", "STOP", { type: "dg.stop", id }],
    ["close", "CLOSE BREAKER", { type: "breaker.close", id }],
    ["open", "OPEN BREAKER", { type: "breaker.open", id }],
  ]) {
    const b = el("button", null, label);
    b.addEventListener("click", () => act(action));
    sh._btns[key] = b;
    actions.append(b);
  }
  const done = el("button", "primary", "Close panel");
  done.addEventListener("click", () => { sheet = null; render(); });
  actions.append(done);
  sh.append(actions);
  sh.append(el("p", null, "Engines start in about three minutes; close the breaker when READY. A breaker closed onto a dead board energizes it — that is the black-start move."));
  fillDgSheet(sh, id);
}
function fillDgSheet(sh, id) {
  const d = state.dgs.find((x) => x.id === id);
  if (!d) return;
  setText(sh._fields.state, d.state.toUpperCase());
  setText(sh._fields.load, d.state === "online" ? `${d.loadPct.toFixed(0)} % of ${d.mw} MW` : "—");
  setText(sh._fields.hours, `${Math.round(d.hours).toLocaleString()} h`);
  setText(sh._fields.cond, `${d.condition.toFixed(0)} %`);
  sh._fields.cond.style.color = d.condition < 50 ? "var(--red)" : d.condition < 75 ? "var(--amber)" : "";
  setText(sh._fields.sump, `${d.sumpPct.toFixed(0)} %`);
  sh._fields.sump.style.color = d.sumpPct < 50 ? "var(--amber)" : "";
  setText(sh._fields.fuel, d.fuel);
  sh._btns.start.disabled = !(d.state === "stopped" || d.state === "tripped");
  sh._btns.stop.disabled = !(d.state === "online" || d.state === "starting" || d.state === "ready");
  sh._btns.close.disabled = d.state !== "ready";
  sh._btns.open.disabled = d.state !== "online";
}

function buildSituationSheet(sh) {
  sh.replaceChildren();
  const lv = levelOf(state);
  sh.append(el("h3", null, "RESUMING THE WATCH"));
  const leg = currentLeg(state);
  const active = state.alarms.filter((a) => a.active);
  sh.append(el("p", null, `${shipOf(state).name}, ${lv.name}. ${fmtClock(state)} — ${state.inPort ? `alongside ${leg?.fromPort ?? ""}` : `at sea, ${leg?.fromPort} → ${leg?.toPort}, ${state.actualKn.toFixed(1)} kn`}.`));
  sh.append(el("p", null, `${state.dgs.filter((d) => d.state === "online").length} generator(s) on load · ${active.length} active alarm(s) · comfort ${state.comfort.toFixed(0)}%.`));
  const go = el("button", "primary", "Resume watch (paused)");
  go.addEventListener("click", () => { sheet = null; render(); });
  sh.append(go);
}

// ---- debrief ---------------------------------------------------------------------------

function showDebrief() {
  dismissToast(); toastQueue = [];
  closeOverlay(); // a sheet left open would sit over the debrief forever
  saveJSON(CAMPAIGN_KEY, campaign);
  localStorage.removeItem(VOYAGE_KEY);
  const d = debrief(state);
  const lv = levelOf(state);
  const idx = LEVELS.indexOf(lv);
  const won = d.phase === "complete";
  if (won) {
    campaign.unlocked = Math.max(campaign.unlocked, Math.min(LEVELS.length, idx + 2));
    const prev = campaign.stars[lv.id] ?? {};
    campaign.stars[lv.id] = {
      safety: prev.safety || d.stars.safety,
      service: prev.service || d.stars.service,
      efficiency: prev.efficiency || d.stars.efficiency,
    };
    saveJSON(CAMPAIGN_KEY, campaign);
  }
  $app.replaceChildren();
  const scr = el("div", "debrief");
  scr.append(el("h1", null, won ? "CHIEF'S REPORT" : "INCIDENT REPORT"));
  const verdict = el("p", `verdict${won ? "" : " lost"}`,
    won ? `${shipOf(state).name} — voyage complete. ${d.lateMin > 0 ? `${Math.round(d.lateMin / 60)}h late.` : "On schedule."}`
        : `VOYAGE LOST — ${d.failReason}`);
  scr.append(verdict);
  if (won) {
    const row = el("div", "starrow");
    for (const [key, label, detail] of [
      ["safety", "SAFETY", d.stars.safety ? "No blackouts, no casualties" : "Casualty or blackout on your watch"],
      ["service", "SERVICE", `Comfort avg ${d.stars.comfortAvg.toFixed(0)}% · ${d.lateMin > 0 ? `${Math.round(d.lateMin / 60)}h late` : "on time"}`],
      ["efficiency", "EFFICIENCY", `${d.stars.spent.toFixed(0)}k€ of ${levelOf(state).budget}k€ · fines €${d.finesEUR.toLocaleString()}`],
    ]) {
      const s = el("div", `star${d.stars[key] ? " won" : ""}`);
      s.append(el("div", "g", "★"), el("div", "t", label), el("div", "t", detail));
      row.append(s);
    }
    scr.append(row);
  }
  if (d.chains.length) {
    const box = el("section", "console");
    box.append(el("h3", null, "Causal chains"));
    const chains = el("div", "chains");
    for (const c of d.chains) chains.append(el("div", "chain", c));
    box.append(chains);
    scr.append(box);
  }
  const tl = el("section", "console");
  tl.append(el("h3", null, "Voyage timeline"));
  const tlist = el("div", "timeline");
  for (const t of d.timeline) tlist.append(el("div", null, `${t.clock}  ${t.text}`));
  tl.append(tlist);
  scr.append(tl);
  const actions = el("div", "actions");
  const retry = el("button", null, won ? "Sail it again" : "Retry voyage");
  retry.addEventListener("click", () => startLevel(lv.id));
  actions.append(retry);
  if (won && idx + 1 < LEVELS.length) {
    const next = el("button", "primary", `Next ship: ${SHIPS[LEVELS[idx + 1].ship].name}`);
    next.addEventListener("click", () => startLevel(LEVELS[idx + 1].id));
    actions.append(next);
  }
  if (won && idx + 1 === LEVELS.length) {
    scr.append(el("p", "verdict", "Voss signs the handover: “The watch is yours, Chief. All of it.” — You have run the largest ship in the fleet. Thank you for playing."));
  }
  const menu = el("button", null, "Fleet list");
  menu.addEventListener("click", showMenu);
  actions.append(menu);
  scr.append(actions);
  $app.append(scr);
  state = null;
}

// ---- action dispatch & persistence -------------------------------------------------------

function act(action) {
  if (!state) return;
  applyAction(state, action);
  dirty = true;
  render();
}

function saveVoyage() {
  if (!state || state.phase !== "voyage") return;
  saveJSON(VOYAGE_KEY, { v: ENGINE_SCHEMA, state });
  dirty = false;
  lastSave = performance.now();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { saveVoyage(); saveJSON(CAMPAIGN_KEY, campaign); }
});

// ---- keyboard ------------------------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  if (!state || e.target.tagName === "INPUT") return;
  if (e.key === " ") { e.preventDefault(); setSpeed(speed === 0 ? 1 : 0); }
  else if (e.key === "1") setSpeed(1);
  else if (e.key === "2") setSpeed(8);
  else if (e.key === "3") setSpeed(32);
  else if (e.key === "Escape") {
    if (sheet) { sheet = null; render(); }
    else if (toastNode) dismissToast();
  }
});

// ---- main loop -------------------------------------------------------------------------------

function frame(now) {
  requestAnimationFrame(frame);
  if (!state || !ui) return;
  const dt = Math.min(250, now - (lastFrame || now));
  lastFrame = now;
  let ranTicks = false;
  if (state.phase === "voyage" && speed > 0) {
    acc += (dt / 1000) * speed;
    let steps = Math.min(64, Math.floor(acc));
    acc -= steps;
    let hadBlackout = !!state.blackout;
    while (steps-- > 0 && state.phase === "voyage") {
      tick(state);
      ranTicks = true;
      dirty = true;
      if (state.newAlarmThisTick) {
        // any new alarm: abort the batch and drop to 1× (HLD §2.7)
        if (speed > 1) { speed = 1; flashSpeedUntil = now + 3000; }
        acc = 0;
        break;
      }
    }
    if (!hadBlackout && state.blackout) saveVoyage(); // crisis-start save
  }
  if (state) {
    if (state.phase !== "voyage") { showDebrief(); return; }
    pumpNarration(); // toast rotation keeps running while paused
    // render only when the sim advanced; UI interactions call render() directly
    if (ranTicks) {
      render();
      if (dirty && now - lastSave > 30000) saveVoyage();
    }
  }
}

// ---- render ----------------------------------------------------------------------------------

function render() {
  if (!state || !ui) return;
  const lv = levelOf(state);
  setText(ui.shipSub, `${lv.name.toUpperCase()} · VOYAGE ${LEVELS.indexOf(lv) + 1} OF ${LEVELS.length}`);
  setText(ui.clock, fmtClock(state));
  for (const [val, btn] of Object.entries(ui.speedBtns)) {
    setAttr(btn, "aria-pressed", Number(val) === speed);
  }
  setClass(ui.speedctl, "flash", performance.now() < flashSpeedUntil);

  // KPIs — bus load is the WORST island's load (islands carry different loads
  // with the tie open or a board down)
  const online = state.dgs.filter((d) => d.state === "online");
  const loadPct = online.length ? Math.round(Math.max(...online.map((d) => d.loadPct))) : 0;
  setText(ui.kpi.load, state.blackout ? "DEAD" : `${loadPct}%`);
  setClass(ui.kpi.load, "bad", state.blackout || loadPct > 97);
  setClass(ui.kpi.load, "warn", !state.blackout && loadPct > 88 && loadPct <= 97);
  const res = spinningReserve(state);
  setText(ui.kpi.reserve, `${res.toFixed(1)}MW`);
  setClass(ui.kpi.reserve, "warn", res < 0 && !state.inPort);
  setText(ui.kpi.kn, state.inPort ? "PORT" : `${state.actualKn.toFixed(1)}kn`);
  setText(ui.kpi.comfort, `${state.comfort.toFixed(0)}%`);
  setClass(ui.kpi.comfort, "warn", state.comfort < 70);
  setClass(ui.kpi.comfort, "bad", state.comfort < 40);
  const margin = projectedFuelMargin(state);
  setText(ui.kpi.fuel, `${margin >= 0 ? "+" : ""}${margin.toFixed(0)}t`);
  setClass(ui.kpi.fuel, "warn", margin < 100 && margin >= 0);
  setClass(ui.kpi.fuel, "bad", margin < 0);
  const spent = voyageSpendK(state);
  setText(ui.kpi.spend, `${spent.toFixed(0)}/${lv.budget}`);
  setClass(ui.kpi.spend, "warn", spent > lv.budget * 0.9);
  setClass(ui.kpi.spend, "bad", spent > lv.budget);
  const leg = currentLeg(state);
  setText(ui.kpi.wx, state.inPort ? "—" : (leg?.weather ?? "—").toUpperCase());
  setClass(ui.kpi.wx, "warn", leg?.weather === "rough");
  setClass(ui.kpi.wx, "bad", leg?.weather === "storm");

  updateRoute();
  updateAnnunciator();
  ui.telegraph.hidden = state.telegraphAcked;
  if (!state.telegraphAcked) setText(ui.telegraph, `ANSWER TELEGRAPH — ${state.orderedKn} KN`);
  setClass(ui.emgen, "on", state.emergencyGenOnline);
  setText(ui.emgen, state.emergencyGenOnline ? "EMCY GEN ON LOAD" : "EMCY GEN STBY");

  updateEvents();

  // tabs
  for (const [id, btn] of Object.entries(ui.tabBtns)) {
    setAttr(btn, "aria-selected", id === activeTab);
  }
  const panel = ui.panels[activeTab];
  if (ui.tabPanel.firstChild !== panel) ui.tabPanel.replaceChildren(panel);
  if (activeTab === "power") updatePowerPanel();
  else if (activeTab === "fuel") updateFuelPanel();
  else if (activeTab === "maint") updateMaintPanel();
  else if (activeTab === "sys") updateSysPanel();
  else if (activeTab === "manual") updateManualPanel();

  updateRail();
  updateSheet();
}

// ---- boot ------------------------------------------------------------------------------------

// Minimal hook for the browser test harness (drives real clicks; this only
// exposes read access + the same entry points the UI itself uses).
window.__chief = {
  get state() { return state; },
  get speed() { return speed; },
  setSpeed, act, startLevel, showMenu,
  // deterministic stepping for harnesses (headless rAF is throttled): runs the
  // same per-tick logic as the frame loop, including the drop-to-1× rule.
  step(n) {
    for (let i = 0; i < n && state && state.phase === "voyage"; i++) {
      tick(state);
      dirty = true;
      if (state.newAlarmThisTick && speed > 1) { speed = 1; break; }
    }
    if (state && ui) {
      if (state.phase !== "voyage") { showDebrief(); return; }
      pumpNarration();
      render();
    }
  },
};

showMenu();
requestAnimationFrame(frame);
