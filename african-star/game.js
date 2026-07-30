(() => {
  "use strict";

  const Core = window.AfricanStarCore;
  if (!Core) throw new Error("AfricanStarCore did not load");
  const SVG_NS = "http://www.w3.org/2000/svg";
  const SAVE_KEY = "0x4d44.african-star.game.v3";
  const PREF_KEY = "0x4d44.african-star.prefs.v2";
  const SEEN_MAP_HINT = "0x4d44.african-star.map-hint.v1";
  const SAVE_VERSION = 3;
  const MAX_LOG = 60;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const el = (name, attrs = {}, text = null) => {
    const node = document.createElement(name);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key.startsWith("data-")) node.setAttribute(key, value);
      else node[key] = value;
    }
    if (text !== null) node.textContent = text;
    return node;
  };
  const svgEl = (name, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  };
  const escapeHTML = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[char]));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const cityName = (id) => Core.GRAPH.cities[id]?.name || "the route";
  const playerById = (id) => state?.players.find((player) => player.id === id) || null;
  const currentPlayer = () => state?.players[state.currentIndex] || null;
  const currentNode = () => Core.GRAPH.nodes[currentPlayer()?.node];
  const isHumanTurn = () => !!state && !currentPlayer()?.isAI;

  const refs = {
    app: $("#app"),
    board: $("#board"),
    mapViewport: $("#mapViewport"),
    routeLayer: $("#routeLayer"),
    flightLayer: $("#flightLayer"),
    cityLayer: $("#cityLayer"),
    tokenLayer: $("#tokenLayer"),
    choiceLayer: $("#choiceLayer"),
    playerLayer: $("#playerLayer"),
    mapHint: $("#mapHint"),
    zoomOut: $("#zoomOutButton"),
    zoomIn: $("#zoomInButton"),
    zoomReset: $("#zoomResetButton"),
    zoomLabel: $("#zoomLabel"),
    toastRegion: $("#toastRegion"),
    soundButton: $("#soundButton"),
    rulesButton: $("#rulesButton"),
    newGameButton: $("#newGameButton"),
    brandButton: $("#brandButton"),
    raceBanner: $("#raceBanner"),
    raceBannerText: $("#raceBannerText"),
    objectiveText: $("#objectiveText"),
    turnPiece: $("#turnPiece"),
    turnKicker: $("#turnKicker"),
    turnPlayerName: $("#turnPlayerName"),
    turnMoney: $("#turnMoney"),
    turnStatus: $("#turnStatus"),
    cargoRow: $("#cargoRow"),
    actionArea: $("#actionArea"),
    playersRail: $("#playersRail"),
    roundLabel: $("#roundLabel"),
    journalList: $("#journalList"),
    setupDialog: $("#setupDialog"),
    setupForm: $("#setupForm"),
    setupPlayers: $("#setupPlayers"),
    addPlayerButton: $("#addPlayerButton"),
    seedInput: $("#seedInput"),
    randomSeedButton: $("#randomSeedButton"),
    startButton: $("#startButton"),
    resumeButton: $("#resumeButton"),
    setupClose: $(".setup-close"),
    rulesDialog: $("#rulesDialog"),
    revealDialog: $("#revealDialog"),
    revealScene: $("#revealScene"),
    bigDisk: $("#bigDisk"),
    bigDiskIcon: $("#bigDiskIcon"),
    revealKicker: $("#revealKicker"),
    revealTitle: $("#revealTitle"),
    revealMessage: $("#revealMessage"),
    revealContinue: $("#revealContinueButton"),
    handoffDialog: $("#handoffDialog"),
    handoffPiece: $("#handoffPiece"),
    handoffTitle: $("#handoffTitle"),
    handoffText: $("#handoffText"),
    handoffButton: $("#handoffButton"),
    winnerDialog: $("#winnerDialog"),
    winnerTitle: $("#winnerTitle"),
    winnerText: $("#winnerText"),
    winnerStats: $("#winnerStats"),
    winnerNew: $("#winnerNewButton"),
    winnerClose: $("#winnerCloseButton"),
    aboutDialog: $("#aboutDialog"),
    confettiLayer: $("#confettiLayer"),
    screenReaderStatus: $("#screenReaderStatus"),
  };

  let state = null;
  let prefs = loadJSON(PREF_KEY, { sound: true, zoom: 1 });
  prefs.sound = prefs.sound !== false;
  prefs.zoom = clamp(Number(prefs.zoom) || 1, 0.72, 2.05);
  let setupPlayers = [];
  let uiBusy = false;
  let aiTimer = null;
  let gameEpoch = 0;
  let audioContext = null;
  let dragState = null;
  let mapBaseWidth = 900;
  let newlyRevealedCity = null;

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be disabled */ }
  }
  function removeSavedGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignored */ }
  }
  function validSavedGame(candidate) {
    const validStages = new Set([
      "handoff", "turnStart", "choose", "arrival", "trapped",
      "awaitMove", "awaitAir", "revealRolling", "revealResult", "turnComplete", "skipped",
    ]);
    if (!candidate || candidate.saveVersion !== SAVE_VERSION || candidate.coreVersion !== Core.VERSION) return false;
    if (!Array.isArray(candidate.players) || candidate.players.length < 2 || candidate.players.length > 6) return false;
    if (!candidate.tokens || Object.keys(candidate.tokens).length !== 30) return false;
    if (!Number.isInteger(candidate.currentIndex) || !candidate.players[candidate.currentIndex]) return false;
    if (!validStages.has(candidate.stage)) return false;
    if (!candidate.players.every((player) => Core.GRAPH.nodes[player.node] && Number.isFinite(player.money))) return false;
    return Object.entries(candidate.tokens).every(([cityId, token]) => Core.GRAPH.cities[cityId]?.token && Core.TOKEN_META[token?.kind]);
  }
  function persist() {
    if (!state || state.stage === "ended") {
      if (state?.stage === "ended") removeSavedGame();
      return;
    }
    state.savedAt = Date.now();
    saveJSON(SAVE_KEY, state);
  }
  function savePrefs() {
    saveJSON(PREF_KEY, prefs);
  }

  /* ------------------------------------------------------------
     Sound — deliberately tiny synthesized cues, no external assets.
     ------------------------------------------------------------ */
  function ensureAudio() {
    if (!prefs.sound) return null;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      audioContext = new AudioCtx();
    }
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }
  function tone(frequency, duration = .08, type = "sine", gain = .045, when = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    const start = ctx.currentTime + when;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    volume.gain.setValueAtTime(.0001, start);
    volume.gain.exponentialRampToValueAtTime(gain, start + .012);
    volume.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(volume).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .03);
  }
  function sound(name) {
    if (!prefs.sound) return;
    if (name === "click") tone(310, .045, "triangle", .025);
    if (name === "die") { tone(190, .06, "square", .025); tone(245, .055, "square", .022, .07); tone(330, .07, "square", .02, .14); }
    if (name === "move") tone(235, .055, "triangle", .018);
    if (name === "ship") { tone(105, .18, "sine", .04); tone(151, .21, "sine", .024, .05); }
    if (name === "flight") { tone(320, .13, "sawtooth", .018); tone(510, .18, "sawtooth", .018, .06); tone(760, .18, "sine", .023, .12); }
    if (name === "blank") tone(170, .15, "triangle", .025);
    if (name === "gem") { tone(523, .13, "sine", .038); tone(659, .13, "sine", .035, .09); tone(784, .2, "sine", .04, .18); }
    if (name === "bad") { tone(220, .13, "sawtooth", .035); tone(147, .28, "sawtooth", .035, .1); }
    if (name === "horse") { tone(392, .11, "triangle", .032); tone(523, .15, "triangle", .036, .1); }
    if (name === "star") { [392,523,659,784,1046].forEach((f, i) => tone(f, .24, "sine", .045, i * .09)); }
    if (name === "win") { [523,659,784,1046,1318].forEach((f, i) => tone(f, .32, i < 3 ? "triangle" : "sine", .05, i * .11)); }
  }
  function vibrate(pattern) {
    if (!navigator.vibrate) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(pattern);
  }

  /* ------------------------------------------------------------
     Static board construction.
     ------------------------------------------------------------ */
  function buildBoard() {
    refs.routeLayer.replaceChildren();
    refs.flightLayer.replaceChildren();
    refs.cityLayer.replaceChildren();

    for (const route of Core.GRAPH.routePaths) {
      const a = Core.GRAPH.nodes[route.a];
      const b = Core.GRAPH.nodes[route.b];
      const path = svgEl("path", {
        id: `route-${route.routeIndex}`,
        class: `route-path ${route.type}`,
        d: `M ${a.x} ${a.y} Q ${route.control.x} ${route.control.y} ${b.x} ${b.y}`,
        "data-route-index": route.routeIndex,
      });
      refs.routeLayer.append(path);
      for (const nodeId of route.sequence.slice(1, -1)) {
        const node = Core.GRAPH.nodes[nodeId];
        if (node.trap) {
          refs.routeLayer.append(svgEl("circle", { class: "trap-ring", cx: node.x, cy: node.y, r: 14 }));
          refs.routeLayer.append(svgEl("circle", { class: "trap-ring-inner", cx: node.x, cy: node.y, r: 7 }));
        } else {
          refs.routeLayer.append(svgEl("circle", { class: `route-dot ${route.type}`, cx: node.x, cy: node.y, r: route.type === "sea" ? 5.2 : 5.7 }));
        }
      }
    }

    const drawnFlights = new Set();
    for (const [aId, destinations] of Object.entries(Core.GRAPH.flights)) {
      for (const bId of destinations) {
        const key = [aId, bId].sort().join("|");
        if (drawnFlights.has(key)) continue;
        drawnFlights.add(key);
        const a = Core.GRAPH.nodes[aId];
        const b = Core.GRAPH.nodes[bId];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const bow = clamp(Math.hypot(dx, dy) * .13, 25, 70);
        const length = Math.hypot(dx, dy) || 1;
        const cx = (a.x + b.x) / 2 + (-dy / length) * bow;
        const cy = (a.y + b.y) / 2 + (dx / length) * bow;
        refs.flightLayer.append(svgEl("path", {
          class: "flight-path",
          d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`,
          "data-flight": key,
        }));
      }
    }

    for (const city of Core.CITIES) {
      const group = svgEl("g", { class: "city-group", transform: `translate(${city.x} ${city.y})`, "data-city": city.id });
      const nodeClass = ["city-node", city.start ? "start" : "", city.special ? "special" : ""].filter(Boolean).join(" ");
      group.append(svgEl("circle", { class: nodeClass, r: city.start ? 13 : 10 }));
      group.append(svgEl("circle", { class: "city-core", r: city.start ? 4.5 : 3.5 }));
      const label = svgEl("text", {
        class: `city-label${city.start ? " start" : ""}`,
        x: city.labelDx || 0,
        y: city.labelDy || -24,
      });
      label.textContent = city.name;
      group.append(label);
      if (city.special === "capeTown") {
        const sub = svgEl("text", { class: "city-sub-label", x: city.labelDx || 0, y: (city.labelDy || 32) + 12 });
        sub.textContent = "FIRST ARRIVAL £500";
        group.append(sub);
      }
      if (city.special === "goldCoast") {
        const sub = svgEl("text", { class: "city-sub-label", x: city.labelDx || 0, y: (city.labelDy || 32) + 12 });
        sub.textContent = "GEMS PAY DOUBLE";
        group.append(sub);
      }
      group.addEventListener("click", () => inspectCity(city.id));
      refs.cityLayer.append(group);
    }
  }

  function inspectCity(cityId) {
    const city = Core.GRAPH.cities[cityId];
    const token = state?.tokens?.[cityId];
    if (!city) return;
    if (token?.revealed) {
      const meta = Core.TOKEN_META[token.kind];
      toast(`${city.name}: ${meta.label} was found here.`, token.kind === "leopard" ? "bad" : "");
    } else if (token && currentPlayer()?.node === cityId && isHumanTurn() && ["choose", "arrival"].includes(state.stage)) {
      refs.actionArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
      toast(`You can turn the disk at ${city.name}.`);
    } else if (token) {
      toast(`${city.name}: an expedition disk is still face-down.`);
    } else {
      toast(city.start ? `${city.name}: bring the Star or a racing horseshoe here to win.` : city.name);
    }
  }

  /* ------------------------------------------------------------
     Setup and state creation.
     ------------------------------------------------------------ */
  function presetPlayers(name) {
    const personalities = Core.AI_PERSONALITIES;
    const base = [];
    if (name === "duo") {
      base.push(
        { name: "Explorer 1", isAI: false, start: "tangier" },
        { name: "Explorer 2", isAI: false, start: "cairo" },
        { name: personalities[0].name, isAI: true, start: "tangier", personality: personalities[0].id },
        { name: personalities[1].name, isAI: true, start: "cairo", personality: personalities[1].id },
      );
    } else if (name === "family") {
      base.push(
        { name: "Explorer 1", isAI: false, start: "tangier" },
        { name: "Explorer 2", isAI: false, start: "cairo" },
        { name: "Explorer 3", isAI: false, start: "tangier" },
        { name: "Explorer 4", isAI: false, start: "cairo" },
      );
    } else {
      base.push(
        { name: "You", isAI: false, start: "tangier" },
        { name: personalities[0].name, isAI: true, start: "cairo", personality: personalities[0].id },
        { name: personalities[1].name, isAI: true, start: "tangier", personality: personalities[1].id },
        { name: personalities[2].name, isAI: true, start: "cairo", personality: personalities[2].id },
      );
    }
    return base;
  }

  function setPreset(name) {
    $$(".preset").forEach((button) => button.classList.toggle("active", button.dataset.preset === name));
    setupPlayers = presetPlayers(name);
    renderSetupPlayers();
  }

  function renderSetupPlayers() {
    refs.setupPlayers.replaceChildren();
    setupPlayers.forEach((config, index) => {
      const colour = Core.PLAYER_COLOURS[index];
      const row = el("div", { class: "setup-player-row" });
      row.style.setProperty("--player", colour.value);
      row.innerHTML = `
        <span class="colour-dot" aria-hidden="true"></span>
        <input type="text" maxlength="22" aria-label="Expedition ${index + 1} name" value="${escapeHTML(config.name)}" />
        <select aria-label="Expedition ${index + 1} controller">
          <option value="human"${config.isAI ? "" : " selected"}>Human</option>
          <option value="ai"${config.isAI ? " selected" : ""}>AI rival</option>
        </select>
        <select aria-label="Expedition ${index + 1} starting city">
          <option value="tangier"${config.start === "tangier" ? " selected" : ""}>Tangier</option>
          <option value="cairo"${config.start === "cairo" ? " selected" : ""}>Cairo</option>
        </select>
        <button class="remove-player" type="button" aria-label="Remove expedition ${index + 1}"${setupPlayers.length <= 2 ? " disabled" : ""}>×</button>
      `;
      const [nameInput, typeSelect, startSelect] = row.querySelectorAll("input,select");
      nameInput.addEventListener("input", () => { config.name = nameInput.value; });
      typeSelect.addEventListener("change", () => {
        config.isAI = typeSelect.value === "ai";
        if (config.isAI && /^Explorer \d+$|^You$/.test(config.name)) {
          const used = new Set(setupPlayers.map((player) => player.personality));
          const personality = Core.AI_PERSONALITIES.find((item) => !used.has(item.id)) || Core.AI_PERSONALITIES[index % Core.AI_PERSONALITIES.length];
          config.personality = personality.id;
          config.name = personality.name;
          nameInput.value = config.name;
        }
      });
      startSelect.addEventListener("change", () => { config.start = startSelect.value; });
      row.querySelector(".remove-player").addEventListener("click", () => {
        if (setupPlayers.length <= 2) return;
        setupPlayers.splice(index, 1);
        renderSetupPlayers();
      });
      refs.setupPlayers.append(row);
    });
    refs.addPlayerButton.hidden = setupPlayers.length >= 6;
  }

  function normalizeSeed(raw) {
    const digits = String(raw || "").replace(/\D/g, "").slice(0, 10);
    const parsed = Number.parseInt(digits, 10);
    return Number.isFinite(parsed) ? (parsed >>> 0) : 1951;
  }

  function createGame(config) {
    clearTimeout(aiTimer);
    aiTimer = null;
    gameEpoch++;
    uiBusy = false;
    clearRouteHighlights();
    closeDialog(refs.revealDialog);
    closeDialog(refs.handoffDialog);
    closeDialog(refs.winnerDialog);
    newlyRevealedCity = null;
    const randomState = { seed: config.seed >>> 0, rngCounter: 0 };
    const tokens = Core.createTokenLayout(randomState);
    const entrants = config.players.map((input, index) => {
      const personality = Core.AI_PERSONALITIES.find((item) => item.id === input.personality) || Core.AI_PERSONALITIES[index % Core.AI_PERSONALITIES.length];
      return {
        id: `p${index + 1}`,
        name: String(input.name || (input.isAI ? personality.name : `Explorer ${index + 1}`)).trim().slice(0, 22) || `Explorer ${index + 1}`,
        isAI: !!input.isAI,
        personality: personality.id,
        colour: Core.PLAYER_COLOURS[index].id,
        start: input.start === "cairo" ? "cairo" : "tangier",
        node: input.start === "cairo" ? "cairo" : "tangier",
        money: Core.MONEY.start,
        hasStar: false,
        hasHorseshoe: false,
        skipTurns: 0,
        moves: 0,
        disks: 0,
        gems: 0,
        earnings: 0,
        turns: 0,
      };
    });
    const opening = Core.resolveOpeningOrder(entrants, randomState);
    const players = opening.order;
    const starter = players[0];
    state = {
      saveVersion: SAVE_VERSION,
      coreVersion: Core.VERSION,
      seed: randomState.seed,
      rngCounter: randomState.rngCounter,
      players,
      tokens,
      currentIndex: 0,
      round: 1,
      turnSerial: 1,
      stage: "handoff",
      coastDelay: config.coastDelay,
      pendingOptions: [],
      transport: null,
      lastRoll: null,
      freePassage: false,
      lastReveal: null,
      starFound: false,
      starFoundBy: null,
      capeTownClaimed: null,
      winner: null,
      log: [],
      startedAt: Date.now(),
      turnsCompleted: 0,
    };
    opening.ties.forEach((tie) => addLog(`${tie.playerNames.join(", ")} tie at ${tie.roll} and re-roll for their places.`, "system"));
    addLog(`Opening order: ${opening.entries.map((entry) => `${entry.player.name} (${entry.rolls.join("→")})`).join(", ")}.`, "system");
    addLog(`${starter.name} opens the expedition.`, "system");
    addLog(`Thirty expedition disks are shuffled for map ${state.seed}.`, "system");
    persist();
    renderAll();
    closeDialog(refs.setupDialog);
    if (starter.isAI) {
      state.stage = "turnStart";
      persist();
      schedule(beginTurn, 650);
    } else {
      showHandoff(starter, true);
    }
  }

  function resumeGame(saved) {
    if (!validSavedGame(saved)) return false;
    clearTimeout(aiTimer);
    aiTimer = null;
    gameEpoch++;
    uiBusy = false;
    clearRouteHighlights();
    closeDialog(refs.revealDialog);
    closeDialog(refs.handoffDialog);
    state = saved;
    state.pendingOptions ||= [];
    state.log ||= [];
    state.freePassage = !!state.freePassage;
    state.coastDelay = Number.isFinite(state.coastDelay) ? state.coastDelay : 3;
    closeDialog(refs.setupDialog);
    renderAll();
    if (state.stage === "revealResult" && state.lastReveal) showRevealDialog(state.lastReveal, true);
    else if (state.stage === "revealRolling") schedule(revealCurrentToken, 220);
    else if (state.stage === "handoff" && isHumanTurn()) showHandoff(currentPlayer(), false);
    else if (currentPlayer()?.isAI) schedule(resumeAIStage, 550);
    else if (state.stage === "turnStart") beginTurn();
    centerOnNode(currentPlayer().node, false);
    return true;
  }

  function openSetup() {
    const saved = loadJSON(SAVE_KEY, null);
    refs.resumeButton.hidden = !validSavedGame(saved);
    refs.setupClose.hidden = !state;
    if (!setupPlayers.length) setPreset("solo");
    refs.seedInput.value = String(state?.seed || 1951);
    showDialog(refs.setupDialog);
  }

  /* ------------------------------------------------------------
     Turn state machine.
     ------------------------------------------------------------ */
  function schedule(fn, ms) {
    clearTimeout(aiTimer);
    aiTimer = setTimeout(() => {
      aiTimer = null;
      if (state) fn();
    }, ms);
  }

  function beginTurn() {
    if (!state || state.stage === "ended") return;
    const player = currentPlayer();
    state.stage = "turnStart";
    state.pendingOptions = [];
    state.transport = null;
    state.lastRoll = null;
    state.freePassage = false;
    player.turns = (player.turns || 0) + 1;
    addLog(`${player.name}'s turn begins at ${describeNode(player.node)}.`, "turn");

    if ((player.skipTurns || 0) > 0) {
      player.skipTurns--;
      state.stage = "skipped";
      addLog(`${player.name} loses this turn to the coast delay${player.skipTurns ? ` (${player.skipTurns} remaining)` : ""}.`, "bad");
      persist();
      renderAll();
      if (player.isAI) schedule(endTurn, 950);
      return;
    }

    const node = Core.GRAPH.nodes[player.node];
    if (node?.trap) {
      state.stage = "trapped";
      persist();
      renderAll();
      if (player.isAI) schedule(rollTrapEscape, 900);
      return;
    }

    state.stage = "choose";
    persist();
    renderAll();
    announce(`${player.name}'s turn. ${statusForPlayer(player)}`);
    centerOnNode(player.node, true);
    if (player.isAI) schedule(aiChooseAction, 820);
  }

  function endTurn() {
    if (!state || uiBusy || !["turnComplete", "skipped"].includes(state.stage)) return;
    clearTimeout(aiTimer);
    aiTimer = null;
    closeDialog(refs.revealDialog);
    const previous = currentPlayer();
    state.turnsCompleted++;
    const nextIndex = (state.currentIndex + 1) % state.players.length;
    if (nextIndex <= state.currentIndex) state.round++;
    state.currentIndex = nextIndex;
    state.turnSerial++;
    state.stage = "handoff";
    state.pendingOptions = [];
    state.transport = null;
    state.lastRoll = null;
    state.freePassage = false;
    state.lastReveal = null;
    persist();
    renderAll();
    const next = currentPlayer();
    if (next.isAI) {
      schedule(() => {
        state.stage = "turnStart";
        persist();
        beginTurn();
      }, previous?.isAI ? 450 : 650);
    } else {
      showHandoff(next, false);
    }
  }

  function showHandoff(player, opening) {
    if (!player || player.isAI) return;
    const colour = colourFor(player);
    refs.handoffPiece.style.setProperty("--piece", colour.value);
    refs.handoffTitle.textContent = opening ? `${player.name} opens the map` : `${player.name}, the map is yours`;
    refs.handoffText.textContent = opening ? `You are first in the opening order. Begin in ${cityName(player.start)} with ${Core.formatMoney(player.money)}.` : `Pass the device to ${player.name}. Their position and choices are hidden until the turn begins.`;
    refs.handoffButton.textContent = opening ? "Begin the expedition" : "Begin turn";
    showDialog(refs.handoffDialog);
  }

  function statusForPlayer(player) {
    if (player.hasStar) return `Carry the Star to Tangier or Cairo.`;
    if (player.hasHorseshoe) return `Race the horseshoe to Tangier or Cairo.`;
    if (state.starFound) return `Find a remaining horseshoe and beat the Star home.`;
    return `Search the face-down expedition disks.`;
  }

  function availableTravelModes(player) {
    const node = Core.GRAPH.nodes[player.node];
    if (!node) return [];
    if (node.kind === "route") return [node.transport];
    const modes = [];
    if ((Core.GRAPH.adjacency[player.node] || []).some((edge) => edge.type === "land")) modes.push("land");
    if ((Core.GRAPH.adjacency[player.node] || []).some((edge) => edge.type === "sea")) modes.push("sea");
    if ((Core.GRAPH.flights[player.node] || []).length && player.money >= Core.MONEY.air) modes.push("air");
    return modes;
  }

  function chooseTravel(transport) {
    if (!state || uiBusy || state.stage !== "choose" || !isHumanTurn()) return;
    if (!availableTravelModes(currentPlayer()).includes(transport)) return;
    sound("click");
    if (transport === "air") prepareAirTravel();
    else rollTravel(transport);
  }

  function rollTravel(transport) {
    if (!state || uiBusy || state.stage !== "choose") return;
    const player = currentPlayer();
    const startNode = Core.GRAPH.nodes[player.node];
    if (!startNode) return;
    let freePassage = false;
    if (transport === "sea" && startNode.kind === "city") {
      if (player.money >= Core.MONEY.sea) {
        player.money -= Core.MONEY.sea;
        addLog(`${player.name} pays £100 to board a ship.`, "money");
      } else {
        freePassage = true;
        addLog(`${player.name} works passage and moves ${Core.FREE_PASSAGE_STEPS} sea spaces without rolling.`, "system");
      }
    }
    const rolled = freePassage ? null : Core.rollDie(state);
    const movement = freePassage ? Core.FREE_PASSAGE_STEPS : rolled;
    state.lastRoll = rolled;
    state.freePassage = freePassage;
    state.transport = transport;
    state.pendingOptions = Core.findMovementOptions(player.node, transport, movement).map((option, index) => ({ ...option, number: index + 1 }));
    state.stage = "awaitMove";
    if (rolled !== null) addLog(`${player.name} rolls ${rolled}.`, "roll");
    sound(transport === "sea" ? "ship" : "die");
    if (rolled !== null) vibrate(18);
    persist();
    renderAll();
    if (!state.pendingOptions.length) {
      addLog(`${player.name} has nowhere to move.`, "bad");
      state.stage = "turnComplete";
      persist();
      renderAll();
      if (player.isAI) schedule(endTurn, 650);
    } else if (player.isAI) {
      schedule(aiSelectMovement, 650);
    }
  }

  function prepareAirTravel() {
    const player = currentPlayer();
    if (!player || player.money < Core.MONEY.air) return;
    const destinations = Core.GRAPH.flights[player.node] || [];
    state.transport = "air";
    state.lastRoll = null;
    state.pendingOptions = destinations.map((end, index) => ({ end, path: [end], exact: true, distance: 1, number: index + 1 }));
    state.stage = "awaitAir";
    persist();
    renderAll();
    if (player.isAI) schedule(aiSelectMovement, 520);
  }

  async function selectMovement(index) {
    if (!state || uiBusy || !["awaitMove", "awaitAir"].includes(state.stage)) return;
    const game = state;
    const epoch = gameEpoch;
    const option = game.pendingOptions[index];
    if (!option) return;
    const player = game.players[game.currentIndex];
    const transport = game.transport;
    const stillCurrent = () => state === game && gameEpoch === epoch && game.players[game.currentIndex] === player;
    if (transport === "air") {
      if (player.money < Core.MONEY.air) return;
      player.money -= Core.MONEY.air;
      addLog(`${player.name} buys a £300 flight to ${cityName(option.end)}.`, "money");
      sound("flight");
    }
    uiBusy = true;
    renderAll();
    highlightOption(option);
    const stepDelay = transport === "air" ? 520 : player.isAI ? 105 : 145;
    if (transport === "air") {
      await delay(180);
      if (!stillCurrent()) return;
      player.node = option.end;
      renderPlayers();
      await delay(stepDelay);
      if (!stillCurrent()) return;
    } else {
      for (const nodeId of option.path) {
        if (!stillCurrent()) return;
        player.node = nodeId;
        player.moves = (player.moves || 0) + 1;
        renderPlayers();
        sound("move");
        await delay(stepDelay);
      }
      if (!stillCurrent()) return;
    }
    clearRouteHighlights();
    uiBusy = false;
    game.pendingOptions = [];
    game.transport = null;
    game.lastRoll = null;
    game.freePassage = false;
    await handleArrival();
  }

  async function handleArrival() {
    const player = currentPlayer();
    const node = Core.GRAPH.nodes[player.node];
    if (!node) return;
    addLog(`${player.name} arrives at ${describeNode(player.node)}.`, "move");

    const winning = Core.winnerAtStart(player);
    if (winning) {
      finishGame(winning);
      return;
    }

    if (node.kind === "route") {
      state.stage = "turnComplete";
      if (node.trap) addLog(`${player.name} lands on the ${node.trap === "sahara" ? "Sahara" : "Saint Helena"} trap. A 1 or 2 will be needed next turn.`, "bad");
      persist();
      renderAll();
      if (player.isAI) schedule(endTurn, node.trap ? 1100 : 480);
      return;
    }

    const city = Core.GRAPH.cities[node.id];
    if (city?.special === "capeTown") {
      const award = Core.claimCapeTown(player, state);
      if (award) {
        player.earnings += award;
        addLog(`${player.name} is first to Cape Town and receives £500.`, "money");
        toast(`${player.name} claims Cape Town's £500 arrival award!`, "good");
        sound("gem");
      }
    }

    const token = state.tokens[node.id];
    if (token && !token.revealed) {
      state.stage = "arrival";
      persist();
      renderAll();
      if (player.isAI) schedule(aiChooseAction, 620);
      return;
    }

    state.stage = "turnComplete";
    persist();
    renderAll();
    if (player.isAI) schedule(endTurn, 450);
  }

  function rollTrapEscape() {
    if (!state || state.stage !== "trapped" || uiBusy) return;
    const player = currentPlayer();
    const node = Core.GRAPH.nodes[player.node];
    const rolled = Core.rollDie(state);
    state.lastRoll = rolled;
    addLog(`${player.name} rolls ${rolled} to escape the ${node.trap === "sahara" ? "Sahara" : "pirates"}.`, "roll");
    sound("die");
    vibrate(rolled <= 2 ? [20,40,20] : 25);
    if (rolled <= 2) {
      toast(`${rolled}! ${player.name} breaks free. Travel resumes next turn.`, "good");
      addLog(`${player.name} breaks free; the escape roll uses this turn.`, "system");
      state.stage = "turnComplete";
      persist();
      renderAll();
      if (player.isAI) schedule(endTurn, 750);
    } else {
      toast(`${rolled}. A 1 or 2 was needed.`, "bad");
      state.stage = "turnComplete";
      persist();
      renderAll();
      if (player.isAI) schedule(endTurn, 750);
    }
  }


  function waitAtToken() {
    if (!state || uiBusy || !isHumanTurn() || state.stage !== "arrival") return;
    const player = currentPlayer();
    const token = state.tokens[player.node];
    if (!token || token.revealed) return;
    addLog(`${player.name} waits at ${cityName(player.node)} and may try a free 4–6 roll next turn.`, "system");
    state.stage = "turnComplete";
    persist();
    endTurn();
  }

  function payToReveal() {
    if (!state || uiBusy || !isHumanTurn() || !["choose", "arrival"].includes(state.stage)) return;
    const player = currentPlayer();
    const token = state.tokens[player.node];
    if (!token || token.revealed || player.money < Core.MONEY.reveal) return;
    player.money -= Core.MONEY.reveal;
    addLog(`${player.name} pays £100 to turn the disk at ${cityName(player.node)}.`, "money");
    sound("click");
    revealCurrentToken();
  }

  function rollToReveal() {
    if (!state || uiBusy || state.stage !== "choose") return;
    const player = currentPlayer();
    const token = state.tokens[player.node];
    if (!token || token.revealed) return;
    const rolled = Core.rollDie(state);
    state.lastRoll = rolled;
    addLog(`${player.name} rolls ${rolled} to turn the disk.`, "roll");
    sound("die");
    vibrate(18);
    if (rolled >= 4) {
      state.stage = "revealRolling";
      persist();
      renderAll();
      schedule(revealCurrentToken, player.isAI ? 420 : 360);
    } else {
      state.stage = "turnComplete";
      addLog(`The disk stays face-down; ${player.name} needed 4–6.`, "system");
      persist();
      renderAll();
      if (player.isAI) schedule(endTurn, 800);
    }
  }

  function revealCurrentToken() {
    if (!state || uiBusy) return;
    const player = currentPlayer();
    const city = Core.GRAPH.cities[player.node];
    const token = state.tokens[player.node];
    if (!city || !token || token.revealed) return;
    token.revealed = true;
    token.revealedBy = player.id;
    player.disks = (player.disks || 0) + 1;
    const result = Core.applyToken(player, token.kind, {
      city,
      starAlreadyFound: state.starFound,
      coastDelay: state.coastDelay,
    });
    if (["topaz", "emerald", "ruby"].includes(token.kind)) {
      player.gems = (player.gems || 0) + 1;
      player.earnings = (player.earnings || 0) + result.moneyDelta;
    }
    if (result.starFound) {
      state.starFound = true;
      state.starFoundBy = player.id;
    }
    newlyRevealedCity = city.id;
    const meta = Core.TOKEN_META[token.kind];
    const title = revealTitleFor(token.kind, result, state.starFoundBy === player.id);
    state.lastReveal = {
      playerId: player.id,
      cityId: city.id,
      kind: token.kind,
      title,
      message: result.message,
      at: Date.now(),
    };
    state.stage = "revealResult";
    addLog(`${player.name} turns ${city.name}: ${meta.label}. ${result.message}`, token.kind === "leopard" ? "bad" : token.kind === "blank" ? "system" : "good");
    persist();
    renderAll();
    showRevealDialog(state.lastReveal, false);
  }

  function revealTitleFor(kind, result) {
    if (kind === "star") return "The African Star!";
    if (kind === "horseshoe") return result.message.startsWith("A horseshoe!") ? "A racing horseshoe!" : "A horseshoe";
    if (kind === "leopard") return "A leopard!";
    if (kind === "blank") return result.skipTurns ? "An empty disk — and a delay" : "An empty disk";
    return Core.TOKEN_META[kind].label;
  }

  function showRevealDialog(reveal, resumed) {
    const player = playerById(reveal.playerId);
    const meta = Core.TOKEN_META[reveal.kind];
    refs.revealScene.className = `reveal-scene${reveal.kind === "star" ? " star-scene" : reveal.kind === "leopard" ? " bad-scene" : ""}`;
    refs.bigDisk.className = `big-disk token-${reveal.kind}`;
    refs.bigDiskIcon.textContent = ({ star: "★", ruby: "◆", emerald: "◆", topaz: "◆", leopard: "●", horseshoe: "∩", blank: "·" })[reveal.kind] || meta.icon;
    refs.revealKicker.textContent = `${player?.name || "THE EXPEDITION"} · ${cityName(reveal.cityId)}`;
    refs.revealTitle.textContent = reveal.title;
    refs.revealMessage.textContent = reveal.message;
    refs.revealContinue.textContent = player?.isAI ? "Watching the rival…" : "Continue";
    refs.revealContinue.disabled = !!player?.isAI;
    showDialog(refs.revealDialog);
    requestAnimationFrame(() => requestAnimationFrame(() => refs.bigDisk.classList.add("flipped")));
    const cue = reveal.kind === "star" ? "star" : ["ruby", "emerald", "topaz"].includes(reveal.kind) ? "gem" : reveal.kind === "leopard" ? "bad" : reveal.kind === "horseshoe" ? "horse" : "blank";
    if (!resumed) sound(cue);
    if (reveal.kind === "star") {
      burstConfetti(55);
      vibrate([30,45,30,45,80]);
    }
    if (player?.isAI) schedule(continueAfterReveal, reveal.kind === "star" ? 2600 : 1500);
  }

  function continueAfterReveal() {
    if (!state || state.stage !== "revealResult") return;
    closeDialog(refs.revealDialog);
    state.lastReveal = null;
    state.stage = "turnComplete";
    persist();
    renderAll();
    const player = currentPlayer();
    if (player.isAI) schedule(endTurn, 380);
  }

  function finishGame(win) {
    if (!state || state.stage === "ended") return;
    const winner = playerById(win.playerId);
    state.winner = { ...win, at: Date.now(), round: state.round };
    state.stage = "ended";
    removeSavedGame();
    renderAll();
    refs.winnerTitle.textContent = win.type === "star" ? `${winner.name} brings home the Star!` : `${winner.name}'s horseshoe wins the race!`;
    const destination = cityName(winner.node);
    refs.winnerText.textContent = win.type === "star" ? `The great diamond reaches ${destination} after ${state.round} rounds.` : `The horseshoe reaches ${destination} before the expedition carrying the Star.`;
    const minutes = Math.max(1, Math.round((Date.now() - state.startedAt) / 60000));
    refs.winnerStats.innerHTML = `
      <div class="winner-stat"><strong>${state.round}</strong><span>rounds</span></div>
      <div class="winner-stat"><strong>${winner.disks || 0}</strong><span>disks turned</span></div>
      <div class="winner-stat"><strong>${Core.formatMoney(winner.money)}</strong><span>cash left</span></div>
      <div class="winner-stat"><strong>${minutes}m</strong><span>table time</span></div>
    `;
    showDialog(refs.winnerDialog);
    sound("win");
    burstConfetti(110);
    vibrate([50,40,50,40,120]);
    announce(`${winner.name} wins The African Star at ${destination}.`);
  }

  /* ------------------------------------------------------------
     AI — transparent heuristic play, deterministic via game RNG.
     ------------------------------------------------------------ */
  function personalityFor(player) {
    return Core.AI_PERSONALITIES.find((item) => item.id === player.personality) || Core.AI_PERSONALITIES[0];
  }

  function goalFor(player) {
    if (player.hasStar || player.hasHorseshoe) return Core.nearestStart(player.node).start;
    const candidates = Object.values(state.tokens).filter((token) => !token.revealed).map((token) => token.cityId);
    if (!candidates.length) return Core.nearestStart(player.node).start;
    let best = candidates[0];
    let bestScore = Infinity;
    for (const cityId of candidates) {
      const distance = Core.shortestDistance(player.node, cityId, ["land", "sea"]);
      const city = Core.GRAPH.cities[cityId];
      let score = distance;
      if (city.special === "goldCoast") score -= .6;
      if (city.special === "capeTown" && !state.capeTownClaimed) score -= .45;
      const crowd = state.players.filter((other) => other.id !== player.id && other.node === cityId).length;
      score += crowd * .8;
      score += Core.nextRandom(state) * .22;
      if (score < bestScore) { bestScore = score; best = cityId; }
    }
    return best;
  }

  function aiChooseAction() {
    if (!state || uiBusy || !currentPlayer()?.isAI || !["choose", "arrival"].includes(state.stage)) return;
    const player = currentPlayer();
    const token = state.tokens[player.node];
    if (token && !token.revealed) {
      const personality = personalityFor(player);
      const shouldPay = player.money >= Core.MONEY.reveal && (player.money > personality.revealReserve || state.starFound || Core.nextRandom(state) > .42);
      if (shouldPay) {
        player.money -= Core.MONEY.reveal;
        state.stage = "revealRolling";
        addLog(`${player.name} pays £100 to turn the disk at ${cityName(player.node)}.`, "money");
        persist();
        renderAll();
        schedule(revealCurrentToken, 430);
      } else if (state.stage === "arrival") {
        state.stage = "turnComplete";
        addLog(`${player.name} waits at ${cityName(player.node)} and may try a free 4–6 roll next turn.`, "system");
        persist();
        renderAll();
        schedule(endTurn, 700);
      } else {
        rollToReveal();
      }
      return;
    }

    const node = Core.GRAPH.nodes[player.node];
    if (node.kind === "route") {
      rollTravel(node.transport);
      return;
    }
    const goal = goalFor(player);
    player.aiGoal = goal;
    const personality = personalityFor(player);
    const flightOptions = (Core.GRAPH.flights[player.node] || []).map((cityId) => ({
      cityId,
      distance: Core.shortestDistance(cityId, goal, ["land", "sea"]),
    })).sort((a, b) => a.distance - b.distance);
    const currentDistance = Core.shortestDistance(player.node, goal, ["land", "sea"]);
    const bestFlight = flightOptions[0];
    const racing = player.hasStar || player.hasHorseshoe;
    if (player.money >= Core.MONEY.air && bestFlight && bestFlight.distance < currentDistance && (racing || currentDistance - bestFlight.distance >= 3 || Core.nextRandom(state) < personality.airBias)) {
      prepareAirTravel();
      return;
    }

    const path = Core.shortestPath(player.node, goal, ["land", "sea"]);
    let transport = path.edgeTypes[0];
    const modes = availableTravelModes(player);
    if (!modes.includes(transport)) transport = modes[0];
    if (!transport) {
      state.stage = "turnComplete";
      persist();
      renderAll();
      schedule(endTurn, 500);
      return;
    }
    rollTravel(transport);
  }

  function aiSelectMovement() {
    if (!state || uiBusy || !currentPlayer()?.isAI || !["awaitMove", "awaitAir"].includes(state.stage)) return;
    const player = currentPlayer();
    const goal = player.aiGoal || goalFor(player);
    let bestIndex = 0;
    let bestScore = Infinity;
    state.pendingOptions.forEach((option, index) => {
      let score = Core.shortestDistance(option.end, goal, ["land", "sea"]);
      if (option.end === goal) score -= 6;
      if (Core.GRAPH.nodes[option.end].kind === "city") score -= .18;
      if (player.hasStar || player.hasHorseshoe) {
        if (Core.STARTS.includes(option.end)) score -= 100;
      }
      score += Core.nextRandom(state) * .08;
      if (score < bestScore) { bestScore = score; bestIndex = index; }
    });
    selectMovement(bestIndex);
  }

  function resumeAIStage() {
    if (!state || !currentPlayer()?.isAI) return;
    if (state.stage === "turnStart" || state.stage === "handoff") beginTurn();
    else if (["choose", "arrival"].includes(state.stage)) aiChooseAction();
    else if (state.stage === "trapped") rollTrapEscape();
    else if (["awaitMove", "awaitAir"].includes(state.stage)) aiSelectMovement();
    else if (["skipped", "turnComplete"].includes(state.stage)) endTurn();
    else if (state.stage === "revealRolling") revealCurrentToken();
    else if (state.stage === "revealResult" && state.lastReveal) showRevealDialog(state.lastReveal, true);
  }

  /* ------------------------------------------------------------
     Rendering.
     ------------------------------------------------------------ */
  function renderAll() {
    renderTokens();
    renderChoices();
    renderPlayers();
    renderPanel();
    renderRaceBanner();
    refs.app.dataset.phase = state?.stage || "boot";
    refs.app.dataset.transport = state?.transport || "";
  }

  function renderTokens() {
    refs.tokenLayer.replaceChildren();
    if (!state) return;
    for (const [cityId, token] of Object.entries(state.tokens)) {
      const city = Core.GRAPH.cities[cityId];
      if (!city) continue;
      const group = svgEl("g", {
        class: `token-group${token.revealed ? ` revealed token-${token.kind}` : ""}${newlyRevealedCity === cityId ? " newly-revealed" : ""}`,
        transform: `translate(${city.x} ${city.y})`,
        "data-city": cityId,
        role: "button",
        tabindex: token.revealed ? "-1" : "0",
        "aria-label": token.revealed ? `${city.name}: ${Core.TOKEN_META[token.kind].label}` : `Face-down expedition disk at ${city.name}`,
      });
      const face = svgEl("g", { class: "token-face" });
      face.append(svgEl("ellipse", { class: "token-shadow", cx: 2, cy: 7, rx: 18, ry: 8 }));
      face.append(svgEl("circle", { class: "token-rim", r: 17 }));
      face.append(svgEl("circle", { class: "token-inner", r: 12.5 }));
      const mark = svgEl("text", { class: "token-mark", y: 1 });
      mark.textContent = token.revealed ? Core.TOKEN_META[token.kind].icon : "?";
      face.append(mark);
      group.append(face);
      group.addEventListener("click", (event) => { event.stopPropagation(); inspectCity(cityId); });
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inspectCity(cityId); }
      });
      refs.tokenLayer.append(group);
    }
    newlyRevealedCity = null;
  }

  function colourFor(player) {
    return Core.PLAYER_COLOURS.find((colour) => colour.id === player.colour) || Core.PLAYER_COLOURS[0];
  }

  function renderPlayers() {
    refs.playerLayer.replaceChildren();
    if (!state) return;
    const groups = new Map();
    for (const player of state.players) {
      if (!groups.has(player.node)) groups.set(player.node, []);
      groups.get(player.node).push(player);
    }
    for (const [nodeId, players] of groups) {
      const node = Core.GRAPH.nodes[nodeId];
      players.forEach((player, index) => {
        const count = players.length;
        const angle = count === 1 ? -Math.PI / 2 : (Math.PI * 2 * index / count) - Math.PI / 2;
        const radius = count === 1 ? 0 : 18 + Math.min(8, count * 1.5);
        const x = node.x + Math.cos(angle) * radius;
        const y = node.y + Math.sin(angle) * radius - 22;
        const colour = colourFor(player);
        const group = svgEl("g", {
          class: `player-piece${player.id === currentPlayer()?.id ? " current" : ""}${uiBusy && player.id === currentPlayer()?.id ? " moving" : ""}`,
          transform: `translate(${x} ${y})`,
          "aria-label": `${player.name} at ${describeNode(player.node)}`,
          role: "img",
        });
        const bob = svgEl("g", { class: "player-piece-bob" });
        bob.append(svgEl("ellipse", { class: "piece-base", cx: 0, cy: 25, rx: 16, ry: 6, fill: colour.dark }));
        bob.append(svgEl("path", { class: "piece-body", d: "M-10 20 C-8 8 -7 -2 -4 -8 C-13 -18 -8 -30 0 -30 C8 -30 13 -18 4 -8 C7 -2 8 8 10 20Z", fill: colour.value }));
        bob.append(svgEl("path", { class: "piece-flag", d: "M3 -21 V-48 L25 -40 L3 -31Z", fill: colour.value }));
        const initial = svgEl("text", { class: "piece-initial", x: 0, y: 8 });
        initial.textContent = player.name.trim().charAt(0).toUpperCase() || "?";
        bob.append(initial);
        if (player.hasStar || player.hasHorseshoe) {
          const cargo = svgEl("text", { class: "piece-cargo-star", x: 15, y: -29, "font-size": 15 });
          cargo.textContent = player.hasStar ? "★" : "∩";
          bob.append(cargo);
        }
        group.append(bob);
        refs.playerLayer.append(group);
      });
    }
  }

  function renderChoices() {
    refs.choiceLayer.replaceChildren();
    clearRouteHighlights();
    if (!state || !["awaitMove", "awaitAir"].includes(state.stage)) return;
    state.pendingOptions.forEach((option, index) => {
      const node = Core.GRAPH.nodes[option.end];
      if (!node) return;
      const group = svgEl("g", {
        class: "choice-group",
        transform: `translate(${node.x} ${node.y})`,
        role: "button",
        tabindex: "0",
        "aria-label": `Destination ${index + 1}: ${describeOption(option)}`,
      });
      group.append(svgEl("circle", { class: "choice-halo", r: 24 }));
      group.append(svgEl("circle", { class: "choice-core", r: 12 }));
      const number = svgEl("text", { class: "choice-number", y: 1 });
      number.textContent = index + 1;
      group.append(number);
      group.addEventListener("mouseenter", () => highlightOption(option));
      group.addEventListener("mouseleave", clearRouteHighlights);
      group.addEventListener("focus", () => highlightOption(option));
      group.addEventListener("blur", clearRouteHighlights);
      group.addEventListener("click", (event) => { event.stopPropagation(); if (isHumanTurn()) selectMovement(index); });
      group.addEventListener("keydown", (event) => {
        if ((event.key === "Enter" || event.key === " ") && isHumanTurn()) { event.preventDefault(); selectMovement(index); }
      });
      refs.choiceLayer.append(group);
    });
  }

  function optionRouteIndexes(option) {
    const indexes = new Set();
    for (const nodeId of option.path || []) {
      const node = Core.GRAPH.nodes[nodeId];
      if (Number.isInteger(node?.routeIndex)) indexes.add(node.routeIndex);
    }
    return indexes;
  }
  function highlightOption(option) {
    clearRouteHighlights();
    for (const routeIndex of optionRouteIndexes(option)) $(`#route-${routeIndex}`)?.classList.add("active-route");
  }
  function clearRouteHighlights() { $$(".route-path.active-route").forEach((path) => path.classList.remove("active-route")); }

  function renderPanel() {
    if (!state) return;
    const player = currentPlayer();
    const colour = colourFor(player);
    refs.turnPiece.style.setProperty("--piece", colour.value);
    refs.turnPlayerName.textContent = player.name;
    refs.turnKicker.textContent = player.isAI ? `AI EXPEDITION · ${personalityFor(player).epithet}` : "CURRENT EXPEDITION";
    refs.turnMoney.textContent = Core.formatMoney(player.money);
    refs.turnStatus.textContent = turnStatusText();
    refs.roundLabel.textContent = `Round ${state.round}`;
    refs.cargoRow.replaceChildren();
    if (player.hasStar) refs.cargoRow.append(cargoChip("★", "Carrying the Star", "star"));
    if (player.hasHorseshoe) refs.cargoRow.append(cargoChip("∩", "Racing horseshoe", "horseshoe"));
    if (player.skipTurns) refs.cargoRow.append(cargoChip("⌛", `${player.skipTurns} delayed turn${player.skipTurns === 1 ? "" : "s"}`, ""));
    refs.actionArea.innerHTML = actionMarkup();
    wireActionArea();
    renderScoreboard();
    renderJournal();
  }

  function cargoChip(icon, label, className) {
    const chip = el("span", { class: `cargo-chip ${className}` });
    chip.innerHTML = `<span aria-hidden="true">${icon}</span>${escapeHTML(label)}`;
    return chip;
  }

  function turnStatusText() {
    const player = currentPlayer();
    if (state.stage === "handoff") return `Waiting for ${player.name} to take the map.`;
    if (state.stage === "skipped") return `The coast delay costs this turn${player.skipTurns ? `; ${player.skipTurns} still to miss` : ""}.`;
    if (state.stage === "trapped") return `Trapped near ${describeNode(player.node)}. Roll 1 or 2 to break free; travel resumes next turn.`;
    if (state.stage === "awaitMove" && state.freePassage) return `Working passage moves exactly ${Core.FREE_PASSAGE_STEPS} sea spaces, stopping sooner at the first port.`;
    if (state.stage === "awaitMove") return `Rolled ${state.lastRoll}. Choose one of the highlighted ${state.transport === "sea" ? "sea" : "road"} destinations.`;
    if (state.stage === "awaitAir") return `Choose the next flight city. The ticket is paid on departure.`;
    if (state.stage === "arrival") return `A face-down expedition disk waits at ${cityName(player.node)}.`;
    if (state.stage === "revealRolling") return `The die opens the disk…`;
    if (state.stage === "revealResult") return `The disk at ${cityName(player.node)} has been turned.`;
    if (state.stage === "turnComplete") return statusForPlayer(player);
    if (state.stage === "ended") return `The expedition is complete.`;
    const node = Core.GRAPH.nodes[player.node];
    if (node.kind === "route") return `Continue along the ${node.transport === "sea" ? "shipping lane" : "road"}.`;
    return `${statusForPlayer(player)} You are in ${cityName(player.node)}.`;
  }

  function actionMarkup() {
    if (uiBusy) return `<div class="ai-thinking"><div class="ai-route"><i></i><i></i><i></i><i></i></div><strong>${currentPlayer().isAI ? `${escapeHTML(currentPlayer().name)} is travelling` : "Moving the expedition"}</strong><span>Following the route across the map…</span></div>`;
    const player = currentPlayer();
    if (player.isAI && !["turnComplete", "skipped"].includes(state.stage)) {
      return `<div class="ai-thinking"><div class="ai-route"><i></i><i></i><i></i><i></i></div><strong>${escapeHTML(player.name)} is planning</strong><span>${escapeHTML(aiThinkingText())}</span></div>`;
    }
    if (state.stage === "handoff") return `<div class="boot-card"><div class="boot-star">✦</div><strong>Pass the map to ${escapeHTML(player.name)}</strong></div>`;
    if (state.stage === "skipped") return `
      <div class="action-heading"><h3>This turn is lost</h3><small>Coast delay</small></div>
      <p class="action-copy">The expedition waits. ${player.skipTurns ? `${player.skipTurns} delayed turn${player.skipTurns === 1 ? " remains" : "s remain"}.` : "This is the last missed turn."}</p>
      <button class="end-turn-button" data-action="end-turn">Continue to the next expedition</button>`;
    if (state.stage === "trapped") {
      const trap = Core.GRAPH.nodes[player.node].trap;
      return `<div class="trap-card"><div class="trap-icon">${trap === "sahara" ? "☀" : "⚓"}</div><h3>${trap === "sahara" ? "Held in the Sahara" : "Pirates off Saint Helena"}</h3><p>Roll a 1 or 2 to break free. The escape roll uses this turn; travel resumes next turn.</p><button class="primary-button" data-action="trap-roll">Roll to escape</button></div>`;
    }
    if (["awaitMove", "awaitAir"].includes(state.stage)) {
      const transport = state.transport;
      const die = state.lastRoll ? dieMarkup(state.lastRoll) : "";
      const travelBrief = transport === "air"
        ? `<p class="action-copy">Each linked flight costs £300 and lands directly in the next city.</p>`
        : state.freePassage
          ? `<div class="die-stage passage-stage"><div class="passage-mark">⚓</div><div class="die-copy"><strong>Working passage</strong><span>Move ${Core.FREE_PASSAGE_STEPS} sea spaces without rolling; the first port still ends the voyage.</span></div></div>`
          : `<div class="die-stage">${die}<div class="die-copy"><strong>You rolled ${state.lastRoll}</strong><span>${transport === "sea" ? "The ship must stop at the first port." : "You may stop early at a city, or use the full roll."}</span></div></div>`;
      return `
        <div class="action-heading"><h3>${transport === "air" ? "Choose a flight" : "Choose your destination"}</h3><small>${state.pendingOptions.length} route${state.pendingOptions.length === 1 ? "" : "s"}</small></div>
        ${travelBrief}
        <div class="destination-list">${state.pendingOptions.map((option, index) => destinationMarkup(option, index)).join("")}</div>`;
    }
    if (state.stage === "revealRolling") return `<div class="die-stage">${dieMarkup(state.lastRoll)}<div class="die-copy"><strong>${state.lastRoll} turns the disk</strong><span>The expedition brushes away the dust…</span></div></div>`;
    if (state.stage === "revealResult") return `<div class="boot-card"><div class="boot-star">✦</div><strong>The disk is being examined…</strong></div>`;
    if (state.stage === "turnComplete") return `
      <div class="action-heading"><h3>Turn complete</h3><small>${escapeHTML(describeNode(player.node))}</small></div>
      <p class="action-copy">${escapeHTML(statusForPlayer(player))}</p>
      <button class="end-turn-button" data-action="end-turn">End ${escapeHTML(player.name)}'s turn</button>`;
    if (state.stage === "ended") return `<div class="boot-card"><div class="boot-star">★</div><strong>The great race is over.</strong></div>`;

    const node = Core.GRAPH.nodes[player.node];
    const token = state.tokens[player.node];
    const hasToken = node.kind === "city" && token && !token.revealed;
    const arrival = state.stage === "arrival";
    const modes = availableTravelModes(player);
    if (node.kind === "route") {
      return `
        <div class="action-heading"><h3>Continue ${node.transport === "sea" ? "by ship" : "by road"}</h3><small>${escapeHTML(describeNode(player.node))}</small></div>
        <p class="action-copy">A route marker is not a stopping city, so this expedition continues by the same mode.</p>
        <button class="action-button ${node.transport}" data-action="travel" data-transport="${node.transport}"><span class="action-icon">${node.transport === "sea" ? "⚓" : "●"}</span><strong>Roll the die</strong><small>${node.transport === "sea" ? "Already aboard" : "Road is free"}</small></button>`;
    }
    let markup = `<div class="action-heading"><h3>${arrival ? `At ${escapeHTML(cityName(player.node))}` : "Choose an action"}</h3><small>${escapeHTML(statusForPlayer(player))}</small></div>`;
    if (hasToken) {
      if (arrival) {
        markup += `<p class="action-copy">On arrival you may pay £100 to turn this disk now. Otherwise wait here; the free 4–6 attempt begins on your next turn.</p><div class="action-grid disk-actions arrival-actions">
          <button class="action-button reveal" data-action="pay-reveal"${player.money < Core.MONEY.reveal ? " disabled" : ""}><span class="action-icon">?</span><strong>Pay £100</strong><small>${player.money < Core.MONEY.reveal ? "Not enough cash" : "Turn it now"}</small></button>
          <button class="action-button end" data-action="wait-token"><span class="action-icon">⌛</span><strong>Wait here</strong><small>Try 4–6 next turn</small></button>
        </div>`;
        return markup;
      }
      markup += `<p class="action-copy">A face-down expedition disk waits here. Pay to turn it, try a free 4–6 roll, or travel on.</p><div class="action-grid disk-actions">
        <button class="action-button reveal" data-action="pay-reveal"${player.money < Core.MONEY.reveal ? " disabled" : ""}><span class="action-icon">?</span><strong>Pay £100</strong><small>${player.money < Core.MONEY.reveal ? "Not enough cash" : "Turn it now"}</small></button>
        <button class="action-button roll" data-action="roll-reveal"><span class="action-icon">⚂</span><strong>Roll 4–6</strong><small>Try for free</small></button>
      </div>`;
    }
    markup += `<div class="action-grid travel-actions">
      <button class="action-button land" data-action="travel" data-transport="land"${modes.includes("land") ? "" : " disabled"}><span class="action-icon">●</span><strong>Road</strong><small>Free · roll</small></button>
      <button class="action-button sea" data-action="travel" data-transport="sea"${modes.includes("sea") ? "" : " disabled"}><span class="action-icon">⚓</span><strong>Ship</strong><small>${player.money >= Core.MONEY.sea ? "£100 · roll" : `Free · ${Core.FREE_PASSAGE_STEPS} spaces`}</small></button>
      <button class="action-button air" data-action="travel" data-transport="air"${modes.includes("air") ? "" : " disabled"}><span class="action-icon">✈</span><strong>Flight</strong><small>£300 · direct</small></button>
    </div>`;
    return markup;
  }

  function aiThinkingText() {
    const player = currentPlayer();
    if (state.stage === "arrival") return "Deciding whether to turn the disk…";
    if (state.stage === "trapped") return "Preparing an escape roll…";
    if (state.stage === "awaitAir") return "Studying the flight chart…";
    if (state.stage === "awaitMove") return "Choosing between the highlighted routes…";
    if (player.hasStar || player.hasHorseshoe) return "Tracing the fastest way home…";
    return "Looking for an untouched part of the map…";
  }

  function dieMarkup(value) {
    return `<div class="die rolling" data-value="${value}" aria-label="Die shows ${value}">${Array.from({ length: 9 }, (_, index) => `<i class="pip p${index + 1}"></i>`).join("")}</div>`;
  }

  function destinationMarkup(option, index) {
    const detail = state.transport === "air"
      ? "Direct flight · £300"
      : `${state.freePassage ? "Working passage · " : ""}${option.distance} space${option.distance === 1 ? "" : "s"}${option.exact ? "" : state.transport === "sea" ? " · first port" : " · early city stop"}`;
    return `<button class="destination-button" data-action="destination" data-index="${index}">
      <span class="destination-index">${index + 1}</span>
      <span><strong>${escapeHTML(describeOption(option))}</strong><small>${detail}</small></span>
      <span class="destination-arrow">→</span>
    </button>`;
  }

  function wireActionArea() {
    refs.actionArea.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        if (action === "travel") chooseTravel(button.dataset.transport);
        if (action === "pay-reveal") payToReveal();
        if (action === "roll-reveal") rollToReveal();
        if (action === "wait-token") waitAtToken();
        if (action === "trap-roll") rollTrapEscape();
        if (action === "destination") selectMovement(Number(button.dataset.index));
        if (action === "end-turn") endTurn();
      });
      if (button.dataset.action === "destination") {
        const option = state.pendingOptions[Number(button.dataset.index)];
        button.addEventListener("mouseenter", () => highlightOption(option));
        button.addEventListener("mouseleave", clearRouteHighlights);
        button.addEventListener("focus", () => highlightOption(option));
        button.addEventListener("blur", clearRouteHighlights);
      }
    });
  }

  function renderScoreboard() {
    refs.playersRail.innerHTML = state.players.map((player) => {
      const colour = colourFor(player);
      const cargo = player.hasStar ? "★ Star" : player.hasHorseshoe ? "∩ Horseshoe" : player.skipTurns ? `⌛ ${player.skipTurns}` : "";
      return `<div class="player-row${player.id === currentPlayer().id ? " current" : ""}${player.skipTurns ? " skipping" : ""}" style="--player:${colour.value}">
        <span class="player-colour" aria-hidden="true"></span>
        <span class="player-copy"><span class="player-name-line"><strong>${escapeHTML(player.name)}</strong>${player.isAI ? `<span class="ai-tag">AI</span>` : ""}</span><span class="player-location">${escapeHTML(describeNode(player.node))}${cargo ? ` · <span class="player-cargo-mini">${escapeHTML(cargo)}</span>` : ""}</span></span>
        <span class="player-money">${Core.formatMoney(player.money)}</span>
      </div>`;
    }).join("");
  }

  function renderJournal() {
    const entries = state.log.slice(-10).reverse();
    refs.journalList.innerHTML = entries.map((entry) => `<li><strong>${escapeHTML(entry.round ? `R${entry.round}` : "")}</strong> ${escapeHTML(entry.message)}</li>`).join("");
  }

  function renderRaceBanner() {
    if (!state) return;
    refs.raceBanner.hidden = !state.starFound;
    if (state.starFound) {
      const carrier = playerById(state.starFoundBy);
      const horses = state.players.filter((player) => player.hasHorseshoe);
      refs.raceBannerText.textContent = horses.length ? `${carrier?.name || "The Star"} vs ${horses.map((player) => player.name).join(" & ")}` : `${carrier?.name || "The finder"} carries the Star home`;
      refs.objectiveText.textContent = horses.length ? "The Star and the horseshoes are racing for Tangier or Cairo." : "The Star has been found. Turn a later horseshoe to join the race home.";
    } else {
      refs.objectiveText.textContent = "Turn the thirty disks, manage your £300, and bring the Star back to Tangier or Cairo.";
    }
  }

  function describeNode(nodeId) {
    const node = Core.GRAPH.nodes[nodeId];
    if (!node) return "the map";
    if (node.kind === "city") return node.name;
    if (node.trap === "sahara") return "the Sahara trap";
    if (node.trap === "pirates") return "the waters off Saint Helena";
    const route = Core.GRAPH.routePaths[node.routeIndex];
    const a = cityName(route.a), b = cityName(route.b);
    return `${node.transport === "sea" ? "at sea" : "on the road"} between ${a} and ${b}`;
  }

  function describeOption(option) {
    const node = Core.GRAPH.nodes[option.end];
    if (node?.kind === "city") return node.name;
    return describeNode(option.end);
  }

  function addLog(message, kind = "system") {
    if (!state) return;
    state.log.push({ message, kind, round: state.round, turnSerial: state.turnSerial, at: Date.now() });
    if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
  }

  function toast(message, kind = "") {
    const node = el("div", { class: `toast ${kind}` }, message);
    refs.toastRegion.append(node);
    setTimeout(() => node.remove(), 3800);
  }
  function announce(message) {
    refs.screenReaderStatus.textContent = "";
    requestAnimationFrame(() => { refs.screenReaderStatus.textContent = message; });
  }

  /* ------------------------------------------------------------
     Map zoom and drag.
     ------------------------------------------------------------ */
  function setZoom(value, preserveCenter = true) {
    const viewport = refs.mapViewport;
    const previousWidth = refs.board.getBoundingClientRect().width || mapBaseWidth;
    const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
    const centerY = viewport.scrollTop + viewport.clientHeight / 2;
    const ratioX = previousWidth ? centerX / previousWidth : .5;
    const previousHeight = previousWidth * 1.2;
    const ratioY = previousHeight ? centerY / previousHeight : .5;
    prefs.zoom = clamp(value, .72, 2.05);
    mapBaseWidth = Math.max(viewport.clientWidth, window.innerWidth <= 820 ? 750 : 760);
    const width = Math.round(mapBaseWidth * prefs.zoom);
    refs.board.style.width = `${width}px`;
    refs.board.style.minWidth = "0";
    refs.zoomLabel.textContent = `${Math.round(prefs.zoom * 100)}%`;
    savePrefs();
    if (preserveCenter) requestAnimationFrame(() => {
      viewport.scrollLeft = ratioX * width - viewport.clientWidth / 2;
      viewport.scrollTop = ratioY * width * 1.2 - viewport.clientHeight / 2;
    });
  }

  function centerOnNode(nodeId, smooth = true) {
    const node = Core.GRAPH.nodes[nodeId];
    if (!node) return;
    const viewport = refs.mapViewport;
    const width = refs.board.getBoundingClientRect().width || mapBaseWidth * prefs.zoom;
    const scale = width / 1000;
    viewport.scrollTo({
      left: node.x * scale - viewport.clientWidth / 2,
      top: node.y * scale - viewport.clientHeight / 2,
      behavior: smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto",
    });
  }

  function initMapInteraction() {
    refs.zoomIn.addEventListener("click", () => setZoom(prefs.zoom + .15));
    refs.zoomOut.addEventListener("click", () => setZoom(prefs.zoom - .15));
    refs.zoomReset.addEventListener("click", () => { setZoom(1, false); requestAnimationFrame(() => state && centerOnNode(currentPlayer().node, true)); });
    refs.mapViewport.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(prefs.zoom + (event.deltaY < 0 ? .1 : -.1));
    }, { passive: false });
    refs.mapViewport.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest?.(".choice-group,.token-group")) return;
      dragState = { id: event.pointerId, x: event.clientX, y: event.clientY, left: refs.mapViewport.scrollLeft, top: refs.mapViewport.scrollTop };
      refs.mapViewport.setPointerCapture(event.pointerId);
      refs.mapViewport.classList.add("dragging");
    });
    refs.mapViewport.addEventListener("pointermove", (event) => {
      if (!dragState || dragState.id !== event.pointerId) return;
      refs.mapViewport.scrollLeft = dragState.left - (event.clientX - dragState.x);
      refs.mapViewport.scrollTop = dragState.top - (event.clientY - dragState.y);
    });
    const endDrag = (event) => {
      if (!dragState || (event.pointerId !== undefined && dragState.id !== event.pointerId)) return;
      dragState = null;
      refs.mapViewport.classList.remove("dragging");
    };
    refs.mapViewport.addEventListener("pointerup", endDrag);
    refs.mapViewport.addEventListener("pointercancel", endDrag);
    window.addEventListener("resize", () => setZoom(prefs.zoom, false));
  }

  /* ------------------------------------------------------------
     Dialogs, tabs, confetti and global controls.
     ------------------------------------------------------------ */
  function showDialog(dialog) {
    if (!dialog || dialog.open) return;
    try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
  }
  function closeDialog(dialog) {
    if (!dialog?.open) return;
    try { dialog.close(); } catch { dialog.removeAttribute("open"); }
  }

  function burstConfetti(count) {
    const colours = ["#ffe377", "#d24a35", "#5bb294", "#efc35a", "#f6edc6", "#5a82be"];
    for (let i = 0; i < count; i++) {
      const piece = el("i", { class: "confetti" });
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colours[i % colours.length];
      piece.style.setProperty("--fall", `${2.2 + (i % 11) * .13}s`);
      piece.style.setProperty("--drift", `${-100 + (i * 47 % 200)}px`);
      piece.style.animationDelay = `${(i % 17) * .035}s`;
      piece.style.transform = `rotate(${i * 31}deg)`;
      refs.confettiLayer.append(piece);
      setTimeout(() => piece.remove(), 5200);
    }
  }

  function initRuleTabs() {
    const tabs = $$('[data-rule-tab]');
    const panels = $$('[data-rule-panel]');

    const activate = (tab, focus = false) => {
      const name = tab.dataset.ruleTab;
      tabs.forEach((button) => {
        const selected = button === tab;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      panels.forEach((panel) => { panel.hidden = panel.dataset.rulePanel !== name; });
      if (focus) tab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", (event) => {
        let next = index;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault();
        activate(tabs[next], true);
      });
    });
  }

  function initControls() {
    refs.soundButton.setAttribute("aria-pressed", String(prefs.sound));
    refs.soundButton.title = prefs.sound ? "Sound on" : "Sound off";
    refs.soundButton.addEventListener("click", () => {
      prefs.sound = !prefs.sound;
      refs.soundButton.setAttribute("aria-pressed", String(prefs.sound));
      refs.soundButton.title = prefs.sound ? "Sound on" : "Sound off";
      savePrefs();
      if (prefs.sound) sound("gem");
    });
    refs.rulesButton.addEventListener("click", () => { sound("click"); showDialog(refs.rulesDialog); });
    refs.brandButton.addEventListener("click", () => { sound("click"); showDialog(refs.aboutDialog); });
    refs.newGameButton.addEventListener("click", () => { sound("click"); openSetup(); });
    refs.revealContinue.addEventListener("click", continueAfterReveal);
    refs.handoffButton.addEventListener("click", () => {
      sound("click");
      closeDialog(refs.handoffDialog);
      state.stage = "turnStart";
      persist();
      beginTurn();
    });
    refs.winnerNew.addEventListener("click", () => { closeDialog(refs.winnerDialog); state = null; setPreset("solo"); openSetup(); });
    refs.winnerClose.addEventListener("click", () => closeDialog(refs.winnerDialog));

    $$(".preset").forEach((button) => button.addEventListener("click", () => setPreset(button.dataset.preset)));
    refs.addPlayerButton.addEventListener("click", () => {
      if (setupPlayers.length >= 6) return;
      const index = setupPlayers.length;
      const personality = Core.AI_PERSONALITIES.find((item) => !setupPlayers.some((player) => player.personality === item.id)) || Core.AI_PERSONALITIES[index % Core.AI_PERSONALITIES.length];
      setupPlayers.push({ name: personality.name, isAI: true, personality: personality.id, start: index % 2 ? "cairo" : "tangier" });
      renderSetupPlayers();
    });
    refs.randomSeedButton.addEventListener("click", () => {
      const random = (crypto.getRandomValues?.(new Uint32Array(1))[0] || Date.now()) >>> 0;
      refs.seedInput.value = String(random);
      sound("die");
    });
    refs.setupForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (setupPlayers.length < 2) return;
      const names = new Set();
      const players = setupPlayers.map((player, index) => {
        let name = String(player.name || "").trim() || (player.isAI ? Core.AI_PERSONALITIES[index % Core.AI_PERSONALITIES.length].name : `Explorer ${index + 1}`);
        const base = name;
        let suffix = 2;
        while (names.has(name.toLowerCase())) name = `${base} ${suffix++}`;
        names.add(name.toLowerCase());
        return { ...player, name };
      });
      const coastRule = new FormData(refs.setupForm).get("coastRule");
      ensureAudio();
      createGame({ players, seed: normalizeSeed(refs.seedInput.value), coastDelay: coastRule === "modern" ? 1 : 3 });
    });
    refs.resumeButton.addEventListener("click", () => {
      const saved = loadJSON(SAVE_KEY, null);
      if (!resumeGame(saved)) toast("That saved expedition could not be restored.", "bad");
    });
    refs.setupClose.addEventListener("click", () => closeDialog(refs.setupDialog));
    refs.revealDialog.addEventListener("cancel", (event) => event.preventDefault());
    refs.handoffDialog.addEventListener("cancel", (event) => event.preventDefault());
    refs.setupDialog.addEventListener("cancel", (event) => {
      if (!state) event.preventDefault();
    });
  }

  /* ------------------------------------------------------------
     Self-test hooks used by the repository's browser smoke test.
     ------------------------------------------------------------ */
  window.AfricanStarGame = Object.freeze({
    getState: () => state ? JSON.parse(JSON.stringify(state)) : null,
    startTestGame(config = {}) {
      const players = config.players || [
        { name: "Test Human", isAI: false, start: "tangier" },
        { name: "Test AI", isAI: true, start: "cairo", personality: "navigator" },
      ];
      createGame({ players, seed: config.seed || 1951, coastDelay: config.coastDelay ?? 3 });
      clearTimeout(aiTimer);
      aiTimer = null;
      closeDialog(refs.handoffDialog);
      state.stage = "turnStart";
      beginTurn();
      return this.getState();
    },
    validate: () => Core.validateData(),
    inspect: { goalFor, availableTravelModes, describeNode },
  });

  function boot() {
    buildBoard();
    initMapInteraction();
    initRuleTabs();
    initControls();
    setPreset("solo");
    setZoom(prefs.zoom, false);
    if (!loadJSON(SEEN_MAP_HINT, false) && window.innerWidth <= 900) {
      refs.mapHint.hidden = false;
      saveJSON(SEEN_MAP_HINT, true);
      setTimeout(() => { refs.mapHint.hidden = true; }, 4700);
    }
    const saved = loadJSON(SAVE_KEY, null);
    refs.resumeButton.hidden = !validSavedGame(saved);
    refs.app.dataset.phase = "ready";
    openSetup();
  }

  boot();
})();
