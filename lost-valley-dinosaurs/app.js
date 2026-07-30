(() => {
  "use strict";

  const E = window.LostValleyEngine;
  if (!E) throw new Error("Lost Valley engine did not load");

  const SAVE_KEY = "0x4d44.lost-valley.save.v1";
  const SETTINGS_KEY = "0x4d44.lost-valley.settings.v1";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const HEX_SIZE = 32.5;
  const HEX_W = Math.sqrt(3) * HEX_SIZE;
  const BOARD_OFFSET_X = 82;
  const BOARD_OFFSET_Y = 94;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const el = (tag, attrs = {}, html = "") => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key.startsWith("data-")) node.setAttribute(key, value);
      else if (key === "disabled") node.disabled = Boolean(value);
      else node.setAttribute(key, value);
    }
    if (html) node.innerHTML = html;
    return node;
  };
  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);

  let game = null;
  let setupPlayerCount = 2;
  let settings = { sound: false, hints: true, fastAI: false };
  let aiTimer = null;
  let assistRunning = false;
  let cardMemory = null;
  let lastDice = [];
  let lastRenderedSerial = -1;
  let gameOverShown = false;
  let boardBuilt = false;
  let hintTimer = null;
  let lastHintKey = "";
  let saveTimer = null;
  let audio = null;
  let camera = { x: 0, y: 0, w: 1000, h: 760 };
  let pointer = null;
  let suppressBoardClick = false;

  const setupScreen = $("#setup-screen");
  const gameView = $("#game-view");
  const board = $("#board");
  const boardStatic = $("#board-static");
  const boardHighlights = $("#board-highlights");
  const boardTokens = $("#board-tokens");
  const boardEffects = $("#board-effects");
  const actionGrid = $("#action-grid");
  const passScreen = $("#pass-screen");

  function loadSettings() {
    try { settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch (_) { /* ignore */ }
    $("#setting-sound").checked = settings.sound;
    $("#setting-hints").checked = settings.hints;
    $("#setting-fast-ai").checked = settings.fastAI;
    $("#sound-toggle").setAttribute("aria-pressed", String(settings.sound));
  }

  function storeSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    $("#sound-toggle").setAttribute("aria-pressed", String(settings.sound));
  }

  function hasSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data && data.version === E.VERSION && data.phase !== "game-over";
    } catch (_) { return false; }
  }

  function saveGame() {
    if (!game) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.toJSON())); }
      catch (error) { toast(`Could not save locally: ${error.message}`); }
    }, 20);
  }

  function renderSeatSetup() {
    const list = $("#seat-list");
    const oldValues = $$(".seat-row", list).map((row) => ({
      name: $("input", row)?.value,
      type: $("select", row)?.value,
    }));
    list.innerHTML = "";
    for (let i = 0; i < 4; i += 1) {
      const style = E.PLAYER_STYLES[i];
      const active = i < setupPlayerCount;
      const row = el("div", { class: "seat-row", "aria-disabled": String(!active), "data-seat": i });
      const symbol = el("span", { class: "seat-symbol" }, style.symbol);
      symbol.style.background = style.colour;
      const input = el("input", { "aria-label": `Name for ${style.name} expedition`, maxlength: 28, value: oldValues[i]?.name || `${style.name} Expedition` });
      input.value = oldValues[i]?.name || `${style.name} Expedition`;
      const select = el("select", { "aria-label": `Controller for ${style.name} expedition` });
      select.innerHTML = `<option value="human">Human</option><option value="ai">AI guide</option>`;
      select.value = oldValues[i]?.type || (i === 0 ? "human" : "ai");
      input.disabled = !active;
      select.disabled = !active;
      row.append(symbol, input, select);
      list.append(row);
    }
  }

  function setPlayerCount(count) {
    setupPlayerCount = count;
    $$("#player-count button").forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.count) === count)));
    renderSeatSetup();
  }

  function startNewGame() {
    const players = $$(".seat-row", $("#seat-list")).slice(0, setupPlayerCount).map((row) => ({
      name: $("input", row).value.trim() || `Expedition ${Number(row.dataset.seat) + 1}`,
      human: $("select", row).value === "human",
    }));
    if (!players.some((p) => p.human)) players[0].human = true;
    const seed = Number.parseInt($("#seed-input").value, 10) || Math.floor(Math.random() * 0xffffffff);
    const targetCoins = Number($("input[name='length']:checked").value);
    game = new E.Game({ playerCount: setupPlayerCount, players, targetCoins, hints: settings.hints }, seed);
    game.start();
    cardMemory = null;
    lastDice = [];
    gameOverShown = false;
    lastHintKey = "";
    localStorage.removeItem(SAVE_KEY);
    showGame();
    playSound("start");
  }

  function resumeGame() {
    try {
      game = E.Game.fromJSON(localStorage.getItem(SAVE_KEY));
      cardMemory = game.state.currentCard || null;
      gameOverShown = false;
      lastHintKey = "";
      showGame();
      toast("Saved expedition restored.");
    } catch (error) {
      localStorage.removeItem(SAVE_KEY);
      $("#resume-game").hidden = true;
      toast(`The save could not be restored: ${error.message}`);
    }
  }

  function showGame() {
    setupScreen.hidden = true;
    gameView.hidden = false;
    if (!boardBuilt) buildBoard();
    fitBoard();
    render(true);
  }

  function showSetup() {
    clearTimeout(aiTimer);
    assistRunning = false;
    gameView.hidden = true;
    passScreen.hidden = true;
    setupScreen.hidden = false;
    $("#resume-game").hidden = !hasSave();
  }

  function doAction(fn, options = {}) {
    try {
      const before = game ? game.state.actionSerial : 0;
      const result = fn();
      if (options.card && result) cardMemory = result;
      if (options.dice && result?.rolls) lastDice = result.rolls;
      if (options.sound) playSound(options.sound);
      if (options.swoop) swoop();
      if (options.shake) shakeBoard();
      if (game && game.state.actionSerial !== before) saveGame();
      render();
      return result;
    } catch (error) {
      console.error(error);
      toast(error.message || "That move is not legal.");
      playSound("error");
      return null;
    }
  }

  function buildBoard() {
    boardBuilt = true;
    boardStatic.innerHTML = "";

    const paper = svg("rect", { x: 8, y: 8, width: 984, height: 744, rx: 27, class: "board-paper" });
    boardStatic.append(paper);

    const borderPath = svg("path", { d: "M35 70 Q110 22 202 55 Q275 20 357 48 Q449 17 543 52 Q643 18 731 52 Q838 24 966 88 L967 679 Q880 735 778 706 Q687 744 582 711 Q481 745 391 708 Q283 743 197 705 Q105 733 34 674 Z", class: "board-rim" });
    const inner = svg("path", { d: "M45 79 Q112 35 202 67 Q277 34 357 60 Q449 30 543 64 Q645 31 730 64 Q839 38 954 96 L955 669 Q876 720 778 692 Q687 730 582 697 Q482 730 391 694 Q283 728 197 691 Q108 718 46 665 Z", class: "board-inner-rim" });
    boardStatic.append(borderPath, inner);

    // Three-dimensional-looking mountains frame the printed map.
    const mountainTop = svg("path", { class: "mountain-wall", d: "M33 106 L94 46 L168 84 L227 34 L302 85 L351 43 L428 83 L508 33 L579 78 L645 38 L726 84 L804 46 L875 91 L956 57 L980 139 L938 170 L861 141 L783 169 L708 140 L634 171 L557 137 L478 168 L399 139 L327 171 L246 141 L171 169 L98 143 L45 170Z" });
    const mountainLeft = svg("path", { class: "mountain-wall", d: "M31 107 L87 151 L63 214 L91 276 L56 339 L84 406 L51 469 L78 540 L43 606 L72 681 L28 704Z" });
    const mountainRight = svg("path", { class: "mountain-wall", d: "M969 107 L914 157 L943 220 L912 282 L947 347 L916 414 L950 477 L918 548 L954 615 L926 680 L972 703Z" });
    boardStatic.append(mountainTop, mountainLeft, mountainRight);
    ["M80 97 L124 69 L170 103", "M234 88 L274 54 L319 96", "M472 88 L513 53 L558 96", "M702 91 L746 59 L789 103", "M851 99 L900 72 L943 111"].forEach((d) => boardStatic.append(svg("path", { d, class: "mountain-ridge" })));

    // Volcano built into the north-west mountain.
    const volcano = svg("g", { "aria-label": "Volcano" });
    volcano.append(
      svg("path", { d: "M176 155 L230 56 L291 157Z", class: "volcano-cone" }),
      svg("ellipse", { cx: 230, cy: 63, rx: 34, ry: 14, class: "volcano-crater" }),
      svg("ellipse", { cx: 214, cy: 25, rx: 22, ry: 13, class: "volcano-smoke" }),
      svg("ellipse", { cx: 244, cy: 18, rx: 29, ry: 17, class: "volcano-smoke" }),
      svg("ellipse", { cx: 272, cy: 31, rx: 18, ry: 11, class: "volcano-smoke" })
    );
    boardStatic.append(volcano);

    // Temple on the opposite wall.
    const temple = svg("g", { transform: "translate(704 35)", "aria-label": "Temple" });
    temple.append(
      svg("path", { d: "M0 105 L18 26 L96 26 L115 105Z", class: "temple-body" }),
      svg("path", { d: "M9 45 H105 L96 26 H18Z", class: "temple-highlight" }),
      svg("rect", { x: 44, y: 60, width: 28, height: 45, rx: 2, fill: "#39261c", stroke: "#542d1e", "stroke-width": 3 }),
      svg("path", { d: "M14 105 H102 M25 43 V103 M88 43 V103", fill: "none", stroke: "#6c3d28", "stroke-width": 4 })
    );
    boardStatic.append(temple);

    // Printed hex field.
    const cellLayer = svg("g", { id: "cell-layer" });
    for (const cell of Object.values(E.BOARD)) {
      const { x, y } = cellCenter(cell.id);
      const points = hexPoints(x, y, HEX_SIZE - .7);
      const g = svg("g", { "data-cell-group": cell.id });
      g.append(svg("polygon", { points, class: `hex-cell terrain-${cell.terrain}` }));
      const hit = svg("polygon", { points, class: "cell-hit", tabindex: "0", role: "button", "data-cell": cell.id, "aria-label": cellAria(cell.id) });
      g.append(hit, svg("polygon", { points, class: "hex-focus-ring" }));
      cellLayer.append(g);
    }
    boardStatic.append(cellLayer);

    // River current accents and bridges.
    const riverPaths = [
      ["10,1", "9,2", "9,3", "8,4", "8,5", "7,6", "6,7", "6,8", "5,9", "5,10"],
      ["7,5", "6,5", "5,5", "4,6", "3,6", "2,7", "1,7", "0,8"],
      ["8,5", "9,5", "10,6", "11,6", "12,7", "13,7", "14,8"],
    ];
    for (const path of riverPaths) boardStatic.append(svg("path", { d: smoothPath(path.map(cellCenter)), class: "river-line" }));
    for (const id of ["9,3", "4,6", "11,6"]) {
      const { x, y } = cellCenter(id);
      for (let k = -2; k <= 2; k += 1) boardStatic.append(svg("line", { x1: x - 24, y1: y + k * 6, x2: x + 24, y2: y + k * 6, class: "bridge-plank" }));
    }

    // The printed swamp is a miniature board inside the board: eleven
    // clockwise grey-arrow spaces, four separate inner pteranodon spaces and
    // two blue exits. Keeping that topology visible makes its peril legible.
    const swamp = svg("g", { "aria-label": "Swamp route: eleven arrow spaces, four inner spaces and two exits" });
    swamp.append(
      svg("ellipse", { cx: 505, cy: 392, rx: 131, ry: 105, class: "swamp-pool swamp-visual" }),
      svg("ellipse", { cx: 505, cy: 392, rx: 111, ry: 85, class: "swamp-ring swamp-visual" })
    );
    [[399,347],[604,376],[596,439],[523,505],[405,442],[469,292]].forEach(([cx,cy],i) => {
      swamp.append(svg("circle", { cx, cy, r: 5 + (i%2), class: "swamp-flower swamp-visual" }));
      swamp.append(svg("circle", { cx, cy, r: 1.7, fill: "#f2d457", class: "swamp-visual" }));
    });
    E.SWAMP_LOOP.forEach((_, index) => {
      const pos = swampPathPosition(index);
      const exit = E.SWAMP_EXIT_INDICES.includes(index);
      swamp.append(svg("polygon", {
        points: hexPoints(pos.x, pos.y, 27),
        class: `swamp-path-space${exit ? " is-exit" : ""} swamp-visual`,
      }));
      const next = swampPathPosition((index + 1) % E.SWAMP_LOOP.length);
      const angle = Math.atan2(next.y - pos.y, next.x - pos.x) * 180 / Math.PI;
      const arrow = svg("g", { transform: `translate(${pos.x} ${pos.y}) rotate(${angle})`, class: "swamp-visual" });
      arrow.append(
        svg("line", { x1: -10, y1: 0, x2: 9, y2: 0, class: exit ? "swamp-path-arrow is-exit" : "swamp-path-arrow" }),
        svg("path", { d: "M3 -5 L10 0 L3 5", class: exit ? "swamp-path-arrow is-exit" : "swamp-path-arrow" })
      );
      swamp.append(arrow);
      if (exit) {
        const right = pos.x > 500;
        const dir = right ? 1 : -1;
        const exitArrow = svg("g", { transform: `translate(${pos.x + dir * 28} ${pos.y + 10})`, class: "swamp-visual" });
        exitArrow.append(
          svg("line", { x1: 0, y1: 0, x2: dir * 29, y2: 0, class: "swamp-exit-arrow" }),
          svg("path", { d: right ? "M21 -6 L31 0 L21 6" : "M-21 -6 L-31 0 L-21 6", class: "swamp-exit-arrow" })
        );
        swamp.append(exitArrow);
        const label = svg("text", { x: pos.x + dir * 49, y: pos.y + 28, class: "swamp-exit-label swamp-visual" });
        label.textContent = "EXIT";
        swamp.append(label);
      }
    });
    E.PTERANODON_SWAMP_INDICES.forEach((_, routeId) => {
      const pos = swampInnerPosition(routeId);
      swamp.append(svg("polygon", { points: hexPoints(pos.x, pos.y, 26), class: "swamp-inner-space swamp-visual" }));
    });
    boardStatic.append(swamp);

    // Board symbols and labels.
    for (const id of E.ENTRY_CELLS) drawEntryArrow(id, boardStatic);
    for (const id of E.LAIR_CELLS) { drawLair(id, boardStatic); drawLairFootprints(id, boardStatic); }
    for (const id of E.CAVE_CELLS) drawCave(id, boardStatic);
    for (const id of E.AMMO_CELLS) drawAmmoDump(id, boardStatic);
    drawNest(boardStatic);

    board.addEventListener("click", onBoardClick);
    board.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-cell],[data-explorer],[data-dino],[data-lava],[data-swamp-dest],[data-swamp-index]")) {
        event.preventDefault();
        event.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
    installBoardCamera();
  }

  function cellCenter(id) {
    const { q, r } = E.parseCell(id);
    return {
      x: BOARD_OFFSET_X + HEX_W * (q + .5 * (r & 1)),
      y: BOARD_OFFSET_Y + HEX_SIZE * 1.5 * r,
    };
  }

  function hexPoints(x, y, size) {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return `${(x + size * Math.cos(a)).toFixed(2)},${(y + size * Math.sin(a)).toFixed(2)}`;
    }).join(" ");
  }

  function smoothPath(points) {
    if (!points.length) return "";
    let d = `M${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1], cur = points[i];
      const mx = (prev.x + cur.x) / 2, my = (prev.y + cur.y) / 2;
      d += ` Q${prev.x} ${prev.y} ${mx} ${my}`;
    }
    const last = points[points.length - 1];
    return `${d} T${last.x} ${last.y}`;
  }

  function cellAria(id) {
    const t = E.terrain(id);
    const labels = { plain: "valley floor", jungle: "flowering jungle", water: "river", bridge: "bridge", "swamp-edge": "swamp rim", entry: `valley entrance ${E.ENTRY_CELLS.indexOf(id) + 1}`, lair: `dinosaur lair ${E.LAIR_CELLS.indexOf(id) + 1}`, cave: "cave entrance", ammo: "ammunition dump", temple: "temple" };
    return `${labels[t] || t}, hex ${id}`;
  }

  function drawEntryArrow(id, layer) {
    const { x, y } = cellCenter(id);
    const index = E.ENTRY_CELLS.indexOf(id);
    const rotations = [-115, 180, 115, 0];
    const g = svg("g", { transform: `translate(${x} ${y}) rotate(${rotations[index]})`, "aria-hidden": "true" });
    g.append(svg("path", { d: "M-16 -7 H8 V-15 L25 0 L8 15 V7 H-16Z", class: "board-arrow" }));
    layer.append(g);
    const label = svg("text", { x, y: y + 27, class: "hex-label entry-label" }); label.textContent = "EXIT"; layer.append(label);
  }

  function drawLair(id, layer) {
    const { x, y } = cellCenter(id);
    const g = svg("g", { transform: `translate(${x} ${y})`, "aria-hidden": "true" });
    g.append(
      svg("path", { d: "M-24 16 Q-20 -18 0 -24 Q20 -18 24 16Z", fill: "#3b271e", stroke: "#211713", "stroke-width": 3 }),
      svg("ellipse", { cx: 0, cy: 9, rx: 13, ry: 18, fill: "#171311" }),
      svg("path", { d: "M-19 21 Q0 12 19 21", fill: "none", stroke: "#b78352", "stroke-width": 2 })
    );
    layer.append(g);
  }

  function drawLairFootprints(lairId, layer) {
    const from = cellCenter(lairId);
    for (const id of E.LAIR_EXIT_CELLS[lairId] || []) {
      const to = cellCenter(id);
      const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
      const g = svg("g", { transform: `translate(${to.x} ${to.y}) rotate(${angle})`, class: "lair-footprints", "aria-hidden": "true" });
      [-8, 8].forEach((x, i) => {
        const step = svg("g", { transform: `translate(${x} ${i ? 4 : -4}) scale(.82)` });
        step.append(
          svg("ellipse", { cx: 0, cy: 2, rx: 4.8, ry: 6.8 }),
          svg("circle", { cx: -5, cy: -5, r: 2.1 }),
          svg("circle", { cx: 0, cy: -7, r: 2.2 }),
          svg("circle", { cx: 5, cy: -5, r: 2.1 })
        );
        g.append(step);
      });
      layer.append(g);
    }
  }

  function drawCave(id, layer) {
    const { x, y } = cellCenter(id);
    const g = svg("g", { transform: `translate(${x} ${y})`, "aria-hidden": "true" });
    g.append(svg("path", { d: "M-21 18 Q-19 -17 0 -23 Q19 -17 21 18Z", fill: "#75513b", stroke: "#38271f", "stroke-width": 2.5 }));
    g.append(svg("path", { d: "M-11 18 Q-10 -6 0 -10 Q10 -6 11 18Z", fill: "#201716" }));
    const label = svg("text", { x: 0, y: 29, class: "hex-label" }); label.textContent = "CAVE"; g.append(label);
    layer.append(g);
  }

  function drawAmmoDump(id, layer) {
    const { x, y } = cellCenter(id);
    const g = svg("g", { transform: `translate(${x} ${y})`, "aria-hidden": "true" });
    for (let i = 0; i < 4; i += 1) g.append(svg("rect", { x: -16 + i * 9, y: -13, width: 6, height: 25, rx: 2, fill: "#c8a83e", stroke: "#5f481a", "stroke-width": 1.4 }));
    const label = svg("text", { x: 0, y: 27, class: "hex-label" }); label.textContent = "AMMO"; g.append(label);
    layer.append(g);
  }

  function drawNest(layer) {
    const g = svg("g", { transform: "translate(624 128)", "aria-hidden": "true" });
    g.append(svg("ellipse", { cx: 0, cy: 0, rx: 32, ry: 18, class: "nest" }));
    [-17,-8,2,12].forEach((x,i) => g.append(svg("ellipse", { cx:x, cy:-2+(i%2)*3, rx:6, ry:9, fill:"#eee2b8", stroke:"#806941", "stroke-width":1.3 })));
    const label = svg("text", { x:0, y:30, class:"hex-label" }); label.textContent="NEST"; g.append(label);
    layer.append(g);
  }

  // Coordinates follow the 15-space diagram in the original rule sheet.
  // Path indices run clockwise; inner indices are the four pteranodon drops.
  const SWAMP_PATH_POINTS = [
    {x:490,y:306}, {x:540,y:306}, {x:540,y:348}, {x:590,y:348},
    {x:565,y:390}, {x:540,y:432}, {x:515,y:474}, {x:465,y:474},
    {x:440,y:432}, {x:415,y:390}, {x:440,y:348},
  ];
  const SWAMP_INNER_POINTS = [
    {x:490,y:348}, {x:465,y:390}, {x:515,y:390}, {x:490,y:432},
  ];
  function swampPathPosition(index) {
    return SWAMP_PATH_POINTS[((Number(index) % SWAMP_PATH_POINTS.length) + SWAMP_PATH_POINTS.length) % SWAMP_PATH_POINTS.length];
  }
  function swampInnerPosition(index) {
    return SWAMP_INNER_POINTS[Math.max(0, Math.min(SWAMP_INNER_POINTS.length - 1, Number(index) || 0))];
  }

  function render(force = false) {
    if (!game || gameView.hidden) return;
    if (force || lastRenderedSerial !== game.state.actionSerial) {
      renderBoard();
      renderPanel();
      renderPassScreen();
      lastRenderedSerial = game.state.actionSerial;
      maybeShowFirstGameHint();
    }
    saveGame();
    scheduleAI();
    if (game.state.phase === "game-over" && !gameOverShown) showGameOver();
  }

  function renderBoard() {
    renderHighlights();
    boardTokens.innerHTML = "";
    boardEffects.innerHTML = "";

    // Volcano track pieces.
    const track = [[229,70],[224,86],[218,102],[211,119],[204,136],[197,151]];
    for (let i = 0; i < game.state.lavaTrack; i += 1) drawLavaToken(track[i][0], track[i][1], `track-${i}`, boardTokens, false);

    // Board lava.
    game.state.lavaCells.forEach((id) => {
      const pos = cellCenter(id);
      drawLavaToken(pos.x, pos.y, id, boardTokens, true);
    });

    // Loose treasure.
    for (const [id, count] of Object.entries(game.state.looseTreasure)) {
      const pos = cellCenter(id);
      drawCoin(pos.x + 9, pos.y - 8, count, boardTokens, "Loose treasure");
    }

    // Temple treasure stack.
    if (game.state.templeTreasure) drawCoin(760, 98, game.state.templeTreasure, boardTokens, "Treasure remaining at temple");

    // Ammo supplies.
    for (const id of E.AMMO_CELLS) {
      const pos = cellCenter(id);
      const count = game.state.ammo[id];
      if (count) drawCountBadge(pos.x + 19, pos.y - 17, count, boardTokens, "#5a4217");
    }

    // Monster follows the eleven printed grey-arrow spaces inside the swamp.
    const monsterPos = swampPathPosition(game.state.monsterIndex);
    drawMonster(monsterPos.x, monsterPos.y, boardTokens);

    // Dinosaurs.
    for (const dino of game.state.dinosaurs) {
      const pos = piecePositionForDino(dino);
      drawDinosaur(dino, pos.x, pos.y, boardTokens);
    }

    // Explorers, grouped by location for offsets.
    const locationGroups = new Map();
    for (const explorer of game.state.explorers) {
      if (explorer.status === "dead") continue;
      const key = explorerLocationKey(explorer);
      if (!locationGroups.has(key)) locationGroups.set(key, []);
      locationGroups.get(key).push(explorer);
    }
    for (const explorers of locationGroups.values()) {
      explorers.forEach((explorer, index) => {
        const pos = piecePositionForExplorer(explorer, index, explorers.length);
        drawExplorer(explorer, pos.x, pos.y, boardTokens);
      });
    }

    renderSwampInteractions();

    $("#seed-display").textContent = `SEED ${game.state.seed}`;
  }

  function renderSwampInteractions() {
    const s = game.state, p = s.pending;
    const makeTarget = (pos, attrs, kind, label, inner = false) => {
      const target = svg("polygon", {
        points: hexPoints(pos.x, pos.y, inner ? 25 : 27),
        class: `highlight-cell ${kind || ""} swamp-interaction`,
        tabindex: "0",
        role: "button",
        "aria-label": label,
        ...attrs,
      });
      boardEffects.append(target);
    };

    if (s.phase === "event" && p?.type === "pteranodon" && p.stage === "place") {
      const selected = game.explorer(p.explorer);
      if (selected && selected.player !== s.currentPlayer) {
        E.PTERANODON_SWAMP_INDICES.forEach((_, routeId) => {
          makeTarget(swampInnerPosition(routeId), { "data-swamp-dest": routeId }, "danger", `Drop explorer into inner swamp space ${routeId + 1}`, true);
        });
      }
    }
    if (s.phase === "event" && p?.type === "swamp-fall" && p.stage === "select-space") {
      game.legalSwampPlacements().forEach((index) => {
        const distance = game.swampClockwiseDistance(s.monsterIndex, index);
        makeTarget(swampPathPosition(index), { "data-swamp-index": index }, distance < 3 ? "danger" : "", `Place explorer ${distance} grey arrows ahead of the monster`);
      });
    }
    if (s.phase === "moving" && s.movement) {
      const explorer = game.explorer(s.movement.explorer);
      if (explorer?.status === "swamp") {
        game.legalExplorerSteps().filter((d) => d.kind === "swamp").forEach((d) => {
          makeTarget(swampPathPosition(d.id), { "data-swamp-index": d.id }, "safe", "Follow the next grey arrow");
        });
      }
    }
  }

  function renderHighlights() {
    boardHighlights.innerHTML = "";
    const highlights = getBoardHighlights();
    for (const item of highlights) {
      if (!E.BOARD[item.id]) continue;
      const { x, y } = cellCenter(item.id);
      const poly = svg("polygon", {
        points: hexPoints(x, y, HEX_SIZE - 1),
        class: `highlight-cell ${item.kind || ""}`,
        "data-highlight-cell": item.id,
      });
      boardHighlights.append(poly);
    }
  }

  function getBoardHighlights() {
    if (!game) return [];
    const s = game.state, p = s.pending;
    if (s.phase === "event" && p) {
      if (p.type === "lava") {
        const ids = p.mode === "remove" ? game.removableLavaCells() : game.legalLavaPlacements();
        return ids.map((id) => ({ id, kind: p.mode === "remove" ? "danger" : "" }));
      }
      if (p.type === "pteranodon" && p.stage === "place") {
        const explorer = game.explorer(p.explorer);
        return game.legalPteranodonDestinations(explorer.id).filter((d) => d.kind === "board").map((d) => ({ id:d.id, kind: explorer.player === s.currentPlayer ? "safe" : "danger" }));
      }
      if (p.type === "water" && ["select-water", "select-failure"].includes(p.stage)) return p.targets.map((t) => ({ id:t.cell, kind:p.stage === "select-water" ? "safe" : "danger" }));
      if (p.type === "swamp-escape" && p.stage === "select-destination") return p.targets.map((id) => ({ id, kind:"safe" }));
      if (p.type === "fight" && p.stage === "select-destination") return p.targets.map((id) => ({ id, kind:"safe" }));
      if (p.type === "dinosaur") {
        if (p.capture) return game.availableCaptureLairs().map((id) => ({ id, kind:"danger" }));
        if (p.selected) return game.legalDinosaurSteps(p.selected).map((id) => ({ id, kind:"danger" }));
      }
    }
    if (s.phase === "moving") return game.legalExplorerSteps().filter((d) => d.kind === "board").map((d) => ({ id:d.id, kind:"safe" }));
    if (s.phase === "bullet" && p?.stage === "move") return game.legalBulletDestinations(p.dinosaur).map((id) => ({ id, kind:"danger" }));
    if (s.phase === "bullet" && p?.stage === "capture") return game.availableBulletCaptureLairs().map((id) => ({ id, kind:"danger" }));
    return [];
  }

  function piecePositionForDino(dino) {
    const pos = cellCenter(dino.cell);
    return { x:pos.x, y:pos.y - 4 };
  }

  function explorerLocationKey(e) {
    if (e.status === "board" || e.status === "temple") return `${e.status}:${e.cell}`;
    if (e.status === "lair") return `lair:${e.lair}`;
    if (e.status === "swamp") return e.swampRoute == null ? `swamp-path:${e.swampStep}` : `swamp-inner:${e.swampRoute}`;
    return `outside:${e.player}`;
  }

  function piecePositionForExplorer(e, index, total) {
    let base;
    if (e.status === "board" || e.status === "temple") base = cellCenter(e.cell);
    else if (e.status === "lair") base = cellCenter(e.lair);
    else if (e.status === "swamp") {
      base = e.swampRoute == null ? swampPathPosition(e.swampStep) : swampInnerPosition(e.swampRoute);
    } else {
      const entry = cellCenter(game.player(e.player).homeEntry);
      const directions = [{x:-45,y:32},{x:-15,y:49},{x:44,y:31},{x:47,y:-8}];
      base = { x:entry.x + directions[e.player].x, y:entry.y + directions[e.player].y };
    }
    const offsets = [[0,0],[-10,-6],[11,-6],[-8,9],[9,9],[-16,6],[16,6]];
    const off = offsets[index % offsets.length];
    return { x:base.x + off[0], y:base.y + off[1] - (total > 4 ? index * 1.4 : 0) };
  }

  function drawExplorer(explorer, x, y, layer) {
    const player = game.player(explorer.player);
    const selectable = isExplorerSelectable(explorer);
    const selected = game.state.selectedExplorer === explorer.id || game.state.pending?.explorer === explorer.id;
    const g = svg("g", { transform:`translate(${x} ${y})`, class:`explorer-piece${selectable ? " is-selectable" : " is-passive"}`, ...(selectable ? {"data-explorer":explorer.id, tabindex:"0", role:"button"} : {role:"img"}), "aria-label":explorerAria(explorer) });
    if (selected) g.append(svg("circle", { cx:0, cy:0, r:19, fill:"none", stroke:"#fff07d", "stroke-width":4, "stroke-dasharray":"5 3" }));
    g.append(
      svg("ellipse", { cx:0, cy:-12, rx:10, ry:4, fill:player.style.colour, class:"explorer-body" }),
      svg("path", { d:"M-7 -12 Q0 -24 7 -12Z", fill:player.style.colour, class:"explorer-body" }),
      svg("circle", { cx:0, cy:-6, r:5, fill:"#d7aa75", class:"explorer-body" }),
      svg("path", { d:"M-8 0 Q0 -5 8 0 L10 17 L-10 17Z", fill:player.style.colour, class:"explorer-body" }),
      svg("line", { x1:-5,y1:17,x2:-8,y2:25,stroke:"#282116","stroke-width":3,"stroke-linecap":"round" }),
      svg("line", { x1:5,y1:17,x2:8,y2:25,stroke:"#282116","stroke-width":3,"stroke-linecap":"round" })
    );
    const mark = svg("text", { x:0,y:11,class:"explorer-symbol" }); mark.textContent=player.style.symbol; g.append(mark);
    if (explorer.treasure) {
      g.append(svg("circle", { cx:11,cy:-15,r:7,fill:"url(#coinFill)",stroke:"#6f4913","stroke-width":1.3 }));
      g.append(svg("path", { d:"M8 -15 h6 M11 -18 v6", stroke:"#865b18","stroke-width":1,fill:"none" }));
    }
    layer.append(g);
  }

  function drawDinosaur(dino, x, y, layer) {
    const selectable = isDinoSelectable(dino);
    const selected = game.state.selectedDinosaur === dino.id || game.state.pending?.dinosaur === dino.id;
    const g = svg("g", { transform:`translate(${x} ${y})`, class:`dino-piece${selectable ? " is-selectable" : " is-passive"}`, ...(selectable ? {"data-dino":dino.id, tabindex:"0", role:"button"} : {role:"img"}), "aria-label":`${game.dinosaurName(dino)} at ${game.describeCell(dino.cell)}` });
    if (selected) g.append(svg("circle", { cx:0,cy:0,r:28,fill:"none",stroke:"#fff079","stroke-width":4,"stroke-dasharray":"6 4" }));
    g.append(
      svg("path", { d:"M-19 9 C-31 4 -37 -4 -41 -12 C-27 -9 -19 -11 -13 -18 C-4 -29 14 -26 19 -14 C31 -18 43 -12 45 -1 C47 10 37 17 25 18 L12 17 C15 24 15 31 10 34 L1 31 L-1 17 L-12 29 L-22 27 L-15 12Z", class:"dino-body" }),
      svg("path", { d:"M-8 -12 Q4 -22 17 -13 Q9 -5 -3 -4Z", class:"dino-belly" }),
      svg("circle", { cx:30,cy:-7,r:3.4,class:"dino-eye" }),
      svg("circle", { cx:31,cy:-7,r:1.2,fill:"#152018" }),
      svg("path", { d:"M37 2 L45 -1 L39 7 L46 7 L37 12", class:"dino-tooth" }),
      svg("path", { d:"M2 2 l-15 9 l-8 -2 M12 3 l-10 10 l-8 0", fill:"none",stroke:"#193a25","stroke-width":4,"stroke-linecap":"round" })
    );
    layer.append(g);
  }

  function drawMonster(x, y, layer) {
    const g = svg("g", { transform:`translate(${x} ${y})`, class:"monster-piece", "aria-label":"Swamp monster" });
    g.append(svg("path", { d:"M-17 17 C-31 4 -25 -17 -8 -15 C9 -13 3 7 16 7 C27 7 30 -7 24 -16", class:"monster-body" }));
    g.append(svg("path", { d:"M-16 15 C-26 5 -22 -10 -10 -10 C1 -10 -1 8 14 11", class:"monster-belly" }));
    g.append(svg("path", { d:"M20 -18 Q29 -26 37 -17 Q31 -6 23 -9Z", fill:"#276a48",stroke:"#173b29","stroke-width":2 }));
    g.append(svg("circle", { cx:31,cy:-18,r:2.4,class:"monster-eye" }));
    layer.append(g);
  }

  function drawLavaToken(x, y, id, layer, interactive) {
    const removable = interactive && game.state.phase === "event" && game.state.pending?.type === "lava" && game.state.pending.mode === "remove" && game.removableLavaCells().includes(id);
    const g = svg("g", { transform:`translate(${x} ${y})`, class:`lava-piece${removable?" is-selectable":" is-passive"}`, ...(removable ? {"data-lava":id, tabindex:"0", role:"button"} : {role:"img"}), "aria-label":interactive?`Lava counter at ${game.describeCell(id)}`:"Lava counter on volcano" });
    g.append(svg("circle", { cx:0,cy:0,r:17 }));
    g.append(svg("path", { d:"M-10 -4 Q-3 -12 5 -6 Q11 0 7 10 M-12 7 Q-4 2 3 9", class:"lava-ridge" }));
    layer.append(g);
  }

  function drawCoin(x, y, count, layer, label) {
    const g = svg("g", { transform:`translate(${x} ${y})`, class:"coin-piece", "aria-label":`${label}: ${count}` });
    g.append(svg("circle", { cx:0,cy:0,r:14 }));
    g.append(svg("circle", { cx:0,cy:0,r:8,class:"coin-mark" }));
    g.append(svg("path", { d:"M-5 1 Q0 -7 5 1 Q0 7 -5 1Z", class:"coin-mark" }));
    if (count > 1) drawCountBadge(11,-11,count,g,"#654311");
    layer.append(g);
  }

  function drawCountBadge(x, y, count, layer, fill) {
    const g = svg("g", { transform:`translate(${x} ${y})` });
    g.append(svg("circle", { cx:0,cy:0,r:10,fill,stroke:"#f8e8ac","stroke-width":1.5 }));
    const text=svg("text",{x:0,y:3.5,class:"piece-count"});text.textContent=count;g.append(text);layer.append(g);
  }

  function isExplorerSelectable(explorer) {
    const s=game.state,p=s.pending;
    if (s.phase==="movement") return explorer.player===s.currentPlayer && game.canMoveExplorer(explorer);
    if (s.phase==="event"&&p) {
      if (p.type==="pteranodon"&&p.stage==="select-explorer") return explorer.status!=="dead";
      if (p.type==="swamp-fall"&&p.stage==="select-explorer") return explorer.player===s.currentPlayer&&!['dead','lair','swamp'].includes(explorer.status);
      if (p.type==="swamp-escape"&&p.stage==="select-explorer") return explorer.player===s.currentPlayer&&explorer.status==="swamp";
      if (p.type==="water"&&p.stage==="select-explorer") return explorer.player===s.currentPlayer&&!['dead','lair','swamp'].includes(explorer.status);
      if (p.type==="fight"&&p.stage==="select-explorer") return p.eligible.includes(explorer.id);
    }
    return false;
  }

  function isDinoSelectable(dino) {
    const s=game.state,p=s.pending;
    if (s.phase==="event"&&p?.type==="dinosaur"&&!p.selected&&!p.capture) return game.availableDinosaurs().some((d)=>d.id===dino.id);
    if (s.phase==="bullet"&&p?.stage==="select-dinosaur") return game.legalBulletDestinations(dino.id).length>0;
    return false;
  }

  function explorerAria(e) {
    const player=game.player(e.player);
    const place=e.status==="board"?game.describeCell(e.cell):e.status==="lair"?game.describeCell(e.lair):e.status==="swamp"?"inside the swamp":e.status;
    return `${player.name}, explorer ${e.index+1}, ${place}${e.treasure?", carrying treasure":""}`;
  }

  function onBoardClick(event) {
    if (suppressBoardClick) { suppressBoardClick=false; return; }
    if (!game || isAITurn()) return;
    const target=event.target.closest("[data-cell],[data-explorer],[data-dino],[data-lava],[data-swamp-dest],[data-swamp-index]");
    if (!target) return;
    if (target.dataset.explorer) return handleExplorerChoice(target.dataset.explorer);
    if (target.dataset.dino) return handleDinoChoice(target.dataset.dino);
    if (target.dataset.lava) return handleLavaChoice(target.dataset.lava);
    if (target.dataset.swampDest!=null) return handleSwampDestination(Number(target.dataset.swampDest));
    if (target.dataset.swampIndex!=null) return handleSwampPathChoice(Number(target.dataset.swampIndex));
    if (target.dataset.cell) return handleCellChoice(target.dataset.cell);
  }

  function handleExplorerChoice(id) {
    const s=game.state,p=s.pending;
    if (s.phase==="movement") return doAction(()=>game.selectExplorer(id));
    if (s.phase==="event"&&p) {
      if (p.type==="pteranodon"&&p.stage==="select-explorer") return doAction(()=>game.selectPteranodonExplorer(id),{sound:"swoop"});
      if (p.type==="swamp-fall"&&p.stage==="select-explorer") return doAction(()=>game.selectSwampVictim(id),{sound:"splash"});
      if (p.type==="swamp-escape"&&p.stage==="select-explorer") return doAction(()=>game.selectSwampEscape(id),{sound:"splash"});
      if (p.type==="water"&&p.stage==="select-explorer") return doAction(()=>game.selectWaterExplorer(id));
      if (p.type==="fight"&&p.stage==="select-explorer") return doAction(()=>game.selectFightExplorer(id),{sound:"roar"});
    }
  }

  function handleDinoChoice(id) {
    const s=game.state,p=s.pending;
    if (s.phase==="event"&&p?.type==="dinosaur"&&!p.selected) return doAction(()=>game.selectDinosaur(id),{sound:"roar"});
    if (s.phase==="bullet"&&p?.stage==="select-dinosaur") return doAction(()=>game.selectBulletDinosaur(id));
  }

  function handleLavaChoice(id) {
    const p=game.state.pending;
    if (game.state.phase==="event"&&p?.type==="lava"&&p.mode==="remove") doAction(()=>game.removeLava(id),{sound:"lava"});
  }

  function handleSwampDestination(index) {
    const p=game.state.pending;
    if (game.state.phase==="event"&&p?.type==="pteranodon"&&p.stage==="place") doAction(()=>game.placePteranodon({kind:"swamp",id:index}),{sound:"swoop",swoop:true});
  }

  function handleSwampPathChoice(index) {
    const s=game.state,p=s.pending;
    if (s.phase==="event"&&p?.type==="swamp-fall"&&p.stage==="select-space") return doAction(()=>game.placeSwampVictim(index),{sound:"splash"});
    if (s.phase==="moving") return doAction(()=>game.moveExplorerStep({kind:"swamp",id:index}),{sound:"splash"});
  }

  function handleCellChoice(id) {
    const s=game.state,p=s.pending;
    if (s.phase==="event"&&p) {
      if (p.type==="lava"&&p.mode!=="remove") return doAction(()=>game.placeLava(id),{sound:"lava",shake:true});
      if (p.type==="pteranodon"&&p.stage==="place") return doAction(()=>game.placePteranodon({kind:"board",id}),{sound:"swoop",swoop:true});
      if (p.type==="water"&&p.stage==="select-water") return doAction(()=>game.placeWaterExplorer(id),{sound:"splash"});
      if (p.type==="water"&&p.stage==="select-failure") return doAction(()=>game.placeWaterFailure(id),{sound:"error"});
      if (p.type==="swamp-escape"&&p.stage==="select-destination") return doAction(()=>game.placeSwampEscape(id),{sound:"splash"});
      if (p.type==="fight"&&p.stage==="select-destination") return doAction(()=>game.placeFightEscape(id),{sound:"step"});
      if (p.type==="dinosaur"&&p.capture) return doAction(()=>game.selectCaptureLair(id),{sound:"roar"});
      if (p.type==="dinosaur"&&p.selected) return doAction(()=>game.moveDinosaurStep(id),{sound:"step"});
    }
    if (s.phase==="moving") return doAction(()=>game.moveExplorerStep({kind:"board",id}),{sound:E.isWater(id)?"splash":"step"});
    if (s.phase==="bullet"&&p?.stage==="move") return doAction(()=>game.moveBulletDinosaur(id),{sound:"shot"});
    if (s.phase==="bullet"&&p?.stage==="capture") return doAction(()=>game.selectBulletCaptureLair(id),{sound:"roar"});
  }

  function renderPanel() {
    const s=game.state,player=game.currentPlayer();
    $("#turn-symbol").textContent=player.style.symbol;
    $("#turn-symbol").style.background=player.style.colour;
    $("#turn-kicker").textContent=`TURN ${s.turn} · ${player.name.toUpperCase()}`;
    $("#turn-title").textContent=turnTitle();
    $("#deck-count").textContent=s.deck.length;

    renderCard();
    renderPrompt();
    renderPlayers();
    renderLog();
  }

  function turnTitle() {
    const s=game.state,p=s.pending;
    if (s.phase==="draw") return "Draw an Adventure card";
    if (s.phase==="event") {
      if (p?.type==="dinosaur") return "Direct the dinosaurs";
      if (p?.type==="lava") return "Shape the lava flow";
      if (p?.type==="pteranodon") return "Command the pteranodon";
      return "Resolve the Adventure card";
    }
    if (s.phase==="movement"||s.phase==="await-roll"||s.phase==="moving") return "Move one explorer";
    if (s.phase==="post-move") return "Finish the turn";
    if (s.phase==="bullet") return "Frighten a dinosaur";
    if (s.phase==="pass") return "Pass the map";
    if (s.phase==="game-over") return "The expedition is over";
    return "The valley waits";
  }

  function renderCard() {
    const cardEl=$("#adventure-card");
    const card=game.state.currentCard||cardMemory;
    if (!card || game.state.phase==="draw" || game.state.phase==="pass") {
      cardEl.classList.add("is-back");
      return;
    }
    cardEl.classList.remove("is-back");
    $("#card-title").textContent=card.title;
    $("#card-strap").textContent=card.strap;
    $("#card-illustration").innerHTML=cardArt(card.type);
  }

  function cardArt(type) {
    const common=`viewBox="0 0 100 150" aria-hidden="true"`;
    const arts={
      volcano:`<svg ${common}><path d="M8 126 L45 33 L91 126Z" fill="#5d3929" stroke="#263224" stroke-width="4"/><ellipse cx="48" cy="39" rx="20" ry="9" fill="#261716" stroke="#915034" stroke-width="4"/><path d="M45 47 C35 72 50 83 38 104 C33 114 27 123 21 139" fill="none" stroke="#e34722" stroke-width="10" stroke-linecap="round"/><circle cx="43" cy="62" r="5" fill="#ffcb3b"/><path d="M37 20 q12 -18 24 0 q16 -12 25 6" fill="none" stroke="#d8d1b9" stroke-width="9" opacity=".55"/></svg>`,
      pteranodon:`<svg ${common}><path d="M11 69 Q35 36 51 59 Q64 33 91 66 L62 58 L85 103 L55 72 L45 111 L40 70 L11 95 L31 59Z" fill="#315944" stroke="#182d24" stroke-width="4"/><circle cx="54" cy="57" r="3" fill="#f1cf3f"/><path d="M52 64 q7 6 14 0" fill="none" stroke="#16241c" stroke-width="3"/></svg>`,
      monster:`<svg ${common}><path d="M24 119 C5 94 17 58 42 65 C64 72 42 104 65 105 C82 106 86 82 72 66" fill="none" stroke="#2e734f" stroke-width="17" stroke-linecap="round"/><path d="M23 116 C9 94 20 68 39 72 C55 76 44 99 62 102" fill="none" stroke="#79ac67" stroke-width="6" stroke-linecap="round"/><path d="M68 60 Q82 40 93 58 Q84 73 71 69Z" fill="#2e734f" stroke="#1c3c2c" stroke-width="3"/><circle cx="84" cy="57" r="3" fill="#f2d541"/></svg>`,
      "swamp-fall":`<svg ${common}><ellipse cx="50" cy="93" rx="41" ry="29" fill="#385c3a" stroke="#1e3a29" stroke-width="4"/><path d="M17 93 q12 -9 23 0 t23 0 t23 0" fill="none" stroke="#88a765" stroke-width="4"/><circle cx="51" cy="75" r="8" fill="#d4a06b" stroke="#312318" stroke-width="3"/><path d="M40 84 L28 112 M61 84 L73 112 M44 70 L34 49 M58 70 L67 49" stroke="#e1d0a4" stroke-width="7" stroke-linecap="round"/><path d="M31 43 l8 -5 M70 43 l-8 -5" stroke="#33251b" stroke-width="3"/></svg>`,
      "swamp-escape":`<svg ${common}><ellipse cx="45" cy="104" rx="36" ry="24" fill="#385c3a"/><path d="M48 94 L48 49 M48 49 L30 70 M48 49 L67 68" stroke="#e7d5a7" stroke-width="8" stroke-linecap="round"/><circle cx="48" cy="35" r="9" fill="#d4a06b" stroke="#322418" stroke-width="3"/><path d="M20 111 q12 -8 24 0 t24 0" fill="none" stroke="#8aac6b" stroke-width="4"/></svg>`,
      water:`<svg ${common}><path d="M8 109 q15 -16 30 0 t30 0 t30 0 V142 H8Z" fill="#377f87"/><path d="M8 113 q15 -16 30 0 t30 0 t30 0" fill="none" stroke="#a9ddd3" stroke-width="4"/><path d="M51 19 C35 43 25 55 25 76 A26 26 0 1 0 77 76 C77 56 66 42 51 19Z" fill="#6fc0ba" stroke="#225760" stroke-width="4"/></svg>`,
      fight:`<svg ${common}><g transform="translate(2 27)"><path d="M7 87 C8 51 28 28 48 42 C55 19 84 20 94 43 C101 60 86 75 69 73 L58 101 L43 94 L47 71 L28 100 L13 94Z" fill="#4f8b45" stroke="#1c3b28" stroke-width="4"/><path d="M72 40 L95 35 L76 48 L98 52 L73 59" fill="#f1e9c9"/><circle cx="79" cy="37" r="3" fill="#f0d342"/></g><path d="M26 36 L40 48 M40 36 L26 48 M60 23 L72 36 M72 23 L60 36" stroke="#b43d29" stroke-width="5"/></svg>`,
      secret:`<svg ${common}><path d="M15 131 Q16 55 49 42 Q82 55 84 131Z" fill="#76543d" stroke="#34261f" stroke-width="4"/><path d="M31 131 Q31 76 49 70 Q67 76 68 131Z" fill="#181414"/><path d="M49 23 L49 83" stroke="#e1c44c" stroke-width="5"/><path d="M39 34 L49 23 L59 34" fill="none" stroke="#e1c44c" stroke-width="5"/></svg>`,
      gun:`<svg ${common}><path d="M12 87 L69 65 L84 79 L48 94 L31 125 L17 117 L27 91Z" fill="#594233" stroke="#251d19" stroke-width="4"/><path d="M58 68 L85 51 L93 62 L73 78Z" fill="#9b8a6b" stroke="#29241c" stroke-width="4"/><g fill="#d1ad3b" stroke="#67501b" stroke-width="2"><rect x="58" y="103" width="8" height="27" rx="3"/><rect x="72" y="99" width="8" height="31" rx="3"/></g></svg>`,
      danger:`${dinoCardArt(6)}`,
      grazing:`${dinoCardArt(3)}`,
      undergrowth:`${dinoCardArt(6)}`,
      restless:`${dinoCardArt(3)}`,
      attack:`${dinoCardArt(4,true)}`,
    };
    return arts[type]||arts.danger;
  }

  function dinoCardArt(count,attack=false){
    const dinos=Array.from({length:count},(_,i)=>{const col=i%3,row=Math.floor(i/3);return `<g transform="translate(${10+col*30} ${38+row*45}) scale(.52)"><path d="M0 39 C2 13 22 0 40 12 C49 -4 72 1 77 19 C81 34 66 42 52 40 L43 60 L31 57 L33 39 L19 59 L7 55 L13 37Z" fill="${attack&&i===0?'#873429':'#4e8c45'}" stroke="#193a28" stroke-width="4"/><path d="M61 15 L84 12 L64 23 L86 27 L61 31" fill="#f1e8c9"/><circle cx="68" cy="13" r="3" fill="#eed03e"/></g>`}).join("");
    return `<svg viewBox="0 0 100 150" aria-hidden="true">${dinos}<path d="M12 126 H88" stroke="#5b6a3d" stroke-width="5" stroke-dasharray="4 5"/></svg>`;
  }

  function renderPrompt() {
    const prompt=promptModel();
    $("#prompt-eyebrow").textContent=prompt.eyebrow;
    $("#prompt-title").textContent=prompt.title;
    $("#prompt-copy").textContent=prompt.copy;
    renderDice(prompt.dice||[]);
    actionGrid.innerHTML="";
    for(const action of prompt.actions||[]) addAction(action);
    const assist=$("#assist-button");
    assist.hidden=!prompt.assist;
    assist.disabled=assistRunning;
  }

  function promptModel() {
    const s=game.state,p=s.pending,player=game.currentPlayer();
    if(s.phase==="draw") return {eyebrow:"PART ONE · ADVENTURE",title:"Turn an Adventure card",copy:"The card must be resolved before any explorer moves.",actions:[{label:"Draw from the valley",meta:`${s.deck.length} cards remain`,primary:true,onClick:()=>doAction(()=>game.drawCard(),{card:true,sound:"card"})}]};
    if(s.phase==="event"&&p) return eventPrompt(p);
    if(s.phase==="movement") {
      const actions=[];
      for(const e of game.explorersFor(s.currentPlayer).filter((x)=>x.status!=="dead")){
        const movable=game.canMoveExplorer(e);
        const reason=e.status==="lair"&&game.dinosaurAt(e.lair)?"guarded in lair":movable?explorerStatusLabel(e):"no legal route";
        actions.push({label:`${player.style.symbol} Explorer ${e.index+1}`,meta:reason,disabled:!movable,onClick:()=>doAction(()=>game.selectExplorer(e.id))});
      }
      actions.push(...secretPathActions());
      if(player.bullets>0&&player.gunCards.length) actions.push({label:"Use a bullet before moving",meta:`${player.bullets} left`,onClick:()=>doAction(()=>game.startBullet(),{sound:"cock"})});
      if(!game.hasMovableExplorer(s.currentPlayer)) actions.push({label:"No explorer can move — end turn",primary:true,onClick:()=>doAction(()=>game.endTurn())});
      return {eyebrow:"PART TWO · EXPLORER",title:"Choose one explorer",copy:"Land rolls one die; treasure rolls two. River, swamp and water-exit moves are one space.",actions};
    }
    if(s.phase==="await-roll") {
      const e=game.explorer(s.movement.explorer),count=e.treasure?2:1;
      return {eyebrow:"MOVEMENT ROLL",title:`Roll ${count===1?"one die":"two dice"}`,copy:e.treasure?"Treasure is heavy with luck: carriers use two dice.":"The chosen explorer is on dry land.",actions:[{label:`Roll ${count===1?"the die":"both dice"}`,meta:e.treasure?"2d6":"1d6",primary:true,onClick:()=>doAction(()=>game.rollMovement(),{dice:true,sound:"dice"})}]};
    }
    if(s.phase==="moving") {
      const e=game.explorer(s.movement.explorer),steps=game.legalExplorerSteps();
      const actions=steps.map((d)=>({label:d.kind==="swamp"?"Follow the next grey arrow":`Move to ${game.describeCell(d.id)}`,meta:`${s.movement.remaining} step${s.movement.remaining===1?"":"s"} left`,onClick:()=>doAction(()=>game.moveExplorerStep(d),{sound:d.kind==="board"&&E.isWater(d.id)?"splash":"step"})}));
      if(game.canEscapeValley()) actions.unshift({label:e.treasure?"Carry the treasure out!":"Leave the valley",meta:"no exact count",primary:Boolean(e.treasure),onClick:()=>doAction(()=>game.escapeValley(),{sound:e.treasure?"coin":"step"})});
      return {eyebrow:"MOVING",title:`${s.movement.remaining} movement ${s.movement.remaining===1?"point":"points"} remaining`,copy:"Choose the next adjacent space. You may not enter a space twice during this move.",dice:s.movement.rolls,actions};
    }
    if(s.phase==="post-move") {
      const actions=secretPathActions();
      if(player.bullets>0&&player.gunCards.length) actions.push({label:"Use a bullet",meta:`${player.bullets} left`,onClick:()=>doAction(()=>game.startBullet(),{sound:"cock"})});
      actions.push({label:"End turn",meta:"pass the map",primary:true,onClick:()=>doAction(()=>game.endTurn())});
      return {eyebrow:"EXPEDITION COMPLETE",title:"Anything before you pass?",copy:"A bullet or secret path may be used after explorer movement. Otherwise end the turn.",actions};
    }
    if(s.phase==="bullet") {
      if(p.stage==="select-dinosaur") {
        const targets=game.state.dinosaurs.filter((d)=>game.legalBulletDestinations(d.id).length);
        return {eyebrow:"FOUND A GUN",title:"Choose a dinosaur",copy:"Each bullet frightens one dinosaur exactly one space. You may fire more bullets before or after the explorer move.",actions:targets.map((d)=>({label:game.dinosaurName(d),meta:game.describeCell(d.cell),onClick:()=>doAction(()=>game.selectBulletDinosaur(d.id))})).concat([{label:"Put the gun away",onClick:()=>doAction(()=>game.cancelBullet())}])};
      }
      if(p.stage==="capture") return {eyebrow:"GUNSHOT CAPTURE",title:"Choose an unoccupied lair",copy:"The frightened dinosaur carries every explorer it was driven onto to a lair without another dinosaur or lava.",actions:game.availableBulletCaptureLairs().map((id)=>({label:`Use ${game.describeCell(id)}`,danger:true,onClick:()=>doAction(()=>game.selectBulletCaptureLair(id),{sound:"roar"})}))};
      return {eyebrow:"FOUND A GUN",title:"Frighten it one space",copy:"Choose any legal adjacent space. Driving a dinosaur onto explorers captures them; the shot cannot then be cancelled.",actions:game.legalBulletDestinations(p.dinosaur).map((id)=>({label:`Drive it to ${game.describeCell(id)}`,danger:Boolean(game.explorersAt(id).length),meta:game.explorersAt(id).length?`${game.explorersAt(id).length} explorer${game.explorersAt(id).length===1?"":"s"}`:"",onClick:()=>doAction(()=>game.moveBulletDinosaur(id),{sound:"shot"})})).concat([{label:"Cancel shot",onClick:()=>doAction(()=>game.cancelBullet())}])};
    }
    if(s.phase==="pass") return {eyebrow:"PASS THE MAP",title:`Next: ${player.name}`,copy:"Hand the device to the next expedition.",actions:[]};
    if(s.phase==="game-over") {const winners=winningPlayers();return {eyebrow:"THE VALLEY HAS SPOKEN",title:winners.length>1?`${winners.map((p)=>p.name).join(" & ")} share victory`:`${winners[0].name} wins`,copy:s.endReason,actions:[]};}
    return {eyebrow:"THE VALLEY",title:"Wait…",copy:"The expedition is preparing the next action.",actions:[]};
  }

  function eventPrompt(p) {
    const s=game.state;
    if(p.type==="lava") {
      if(p.mode==="remove") return {eyebrow:"VOLCANO ERUPTS",title:`Relocate ${p.remaining} lava counter${p.remaining===1?"":"s"}`,copy:"Lift a counter that does not split the flow. Then place it on an empty adjacent space.",actions:choiceActions(game.removableLavaCells(),(id)=>`Lift lava from ${game.describeCell(id)}`,(id)=>doAction(()=>game.removeLava(id),{sound:"lava"})),assist:true};
      const legal=game.legalLavaPlacements();
      return {eyebrow:"VOLCANO ERUPTS",title:`Place ${p.remaining} lava counter${p.remaining===1?"":"s"}`,copy:p.mode==="relocate-place"?"Place the lifted counter beside the remaining coherent flow.":"Lava must touch the existing flow. Explorers beneath it are lost.",actions:choiceActions(legal,(id)=>`Lava onto ${game.describeCell(id)}`,(id)=>doAction(()=>game.placeLava(id),{sound:"lava",shake:true})),assist:true};
    }
    if(p.type==="pteranodon") {
      if(p.stage==="select-explorer") return {eyebrow:"PTERANODON SWOOPS",title:"Choose its passenger",copy:"Rescue one of yours from almost anywhere—or carry an opponent somewhere dangerous.",actions:game.pteranodonEligibleExplorers().map((e)=>({label:`${game.player(e.player).style.symbol} Explorer ${e.index+1}`,meta:`${game.player(e.player).name} · ${explorerStatusLabel(e)}`,onClick:()=>doAction(()=>game.selectPteranodonExplorer(e.id),{sound:"swoop"})})).concat([{label:"Let it return to the nest",onClick:()=>doAction(()=>game.skipPteranodon())}]),assist:true};
      const e=game.explorer(p.explorer),dest=game.legalPteranodonDestinations(e.id);
      return {eyebrow:"PTERANODON SWOOPS",title:e.player===s.currentPlayer?"Choose a safe landing":"Choose a dangerous landing",copy:e.player===s.currentPlayer?"The landing must be empty and free of immediate hazards.":"Use the board—or an empty inner-swamp space.",actions:choiceActions(dest.filter((d)=>d.kind==="board").map((d)=>d.id),(id)=>`Land at ${game.describeCell(id)}`,(id)=>doAction(()=>game.placePteranodon({kind:"board",id}),{sound:"swoop",swoop:true}),12).concat(dest.filter((d)=>d.kind==="swamp").map((d)=>({label:`Drop into inner swamp ${Number(d.id)+1}`,danger:true,onClick:()=>doAction(()=>game.placePteranodon(d),{sound:"swoop",swoop:true})}))),assist:true};
    }
    if(p.type==="swamp-fall") {
      if(p.stage==="select-explorer") return {eyebrow:"FALLS INTO THE SWAMP",title:"Choose one of your expedition",copy:"They abandon any treasure. On later turns they move exactly one grey arrow, clockwise, until dry land beyond a blue exit.",actions:game.explorersFor(s.currentPlayer).filter((e)=>!['dead','lair','swamp'].includes(e.status)).map((e)=>({label:`Explorer ${e.index+1}`,meta:explorerStatusLabel(e),danger:true,onClick:()=>doAction(()=>game.selectSwampVictim(e.id),{sound:"splash"})})),assist:true};
      const choices=game.legalSwampPlacements();
      return {eyebrow:"FALLS INTO THE SWAMP",title:"Choose a grey-arrow space",copy:"Any grey arrow except the monster’s is legal; explorers may share. Fewer than three arrows ahead is permitted—but is a deliberate risk.",actions:choices.map((index)=>{const danger=game.swampClockwiseDistance(s.monsterIndex,index);const exit=game.swampClockwiseDistance(index,game.nearestSwampExit(index));return{label:`Arrow space ${index+1}`,meta:`${danger} ahead of monster · ${exit} to exit`,danger:danger<3,onClick:()=>doAction(()=>game.placeSwampVictim(index),{sound:"splash"})}}),assist:true};
    }
    if(p.type==="swamp-escape") {
      if(p.stage==="select-explorer") return {eyebrow:"ESCAPE FROM THE SWAMP",title:"Choose a trapped explorer",copy:"The card places one explorer on any legal dry space beyond their nearest blue exit.",actions:game.explorersFor(s.currentPlayer).filter((e)=>e.status==="swamp").map((e)=>({label:`Explorer ${e.index+1}`,meta:explorerStatusLabel(e),onClick:()=>doAction(()=>game.selectSwampEscape(e.id),{sound:"splash"})})),assist:true};
      return {eyebrow:"ESCAPE FROM THE SWAMP",title:"Choose dry ground",copy:"Select any highlighted dry space immediately beyond that explorer’s nearest blue exit.",actions:p.targets.map((id)=>({label:`Climb onto ${game.describeCell(id)}`,onClick:()=>doAction(()=>game.placeSwampEscape(id),{sound:"splash"})})),assist:true};
    }
    if(p.type==="water") {
      if(p.stage==="select-explorer") return {eyebrow:"SHORT OF WATER",title:"Choose who searches for water",copy:"After you choose, that explorer rolls two dice and must reach a river within the total—or die at the furthest legal endpoint of the attempt.",actions:game.explorersFor(s.currentPlayer).filter((e)=>!['dead','lair','swamp'].includes(e.status)).map((e)=>{const targets=game.waterTargets(e,12);return{label:`Explorer ${e.index+1}`,meta:targets.length?`nearest river ${targets[0].distance} spaces away`:"no route to a river",danger:!targets.length,onClick:()=>doAction(()=>game.selectWaterExplorer(e.id),{dice:true,sound:"dice"})}}),assist:true};
      if(p.stage==="select-failure") return {eyebrow:"SHORT OF WATER",title:`No river within ${p.dice.total}`,copy:"Choose where the unsuccessful move ends. The explorer dies there, leaving any treasure on that final space.",dice:p.dice.rolls,actions:p.targets.map((t)=>({label:`Last steps to ${game.describeCell(t.cell)}`,meta:`${t.distance} spaces`,danger:true,onClick:()=>doAction(()=>game.placeWaterFailure(t.cell),{sound:"error"})})),assist:true};
      return {eyebrow:"SHORT OF WATER",title:`Reach a river within ${p.dice.total}`,copy:"Exact count is not required. Movement stops at the first river reached along the chosen legal route.",dice:p.dice.rolls,actions:p.targets.map((t)=>({label:`Reach ${game.describeCell(t.cell)}`,meta:`${t.distance} spaces`,onClick:()=>doAction(()=>game.placeWaterExplorer(t.cell),{sound:"splash"})})),assist:true};
    }
    if(p.type==="fight") {
      if(p.stage==="select-destination") {
        const captive=game.explorer(p.explorer);
        return {eyebrow:"DINOSAURS FIGHT",title:"Choose the escape footprint",copy:"Move the selected captive to one legal dry space immediately outside its lair.",actions:p.targets.map((id)=>({label:`Escape ${footprintDirection(captive.lair,id)} · ${game.describeCell(id)}`,onClick:()=>doAction(()=>game.placeFightEscape(id),{sound:"step"})})),assist:true};
      }
      const own=p.eligible.some((id)=>game.explorer(id).player===s.currentPlayer);
      return {eyebrow:"DINOSAURS FIGHT",title:"A captive can escape",copy:own?"Choose one of your own captives, then choose a footprint immediately outside its lair.":"None of yours are captive, so the printed rules make you free an opponent.",actions:game.fightEligible().map((e)=>{const exits=game.fightExitDestinations(e.id);return{label:`${game.player(e.player).style.symbol} Explorer ${e.index+1}`,meta:exits.length?`${game.describeCell(e.lair)} · ${exits.length} exit${exits.length===1?"":"s"}`:`${game.describeCell(e.lair)} · sealed by lava`,danger:!exits.length,disabled:!exits.length,onClick:()=>doAction(()=>game.selectFightExplorer(e.id),{sound:"roar"})}}),assist:true};
    }
    if(p.type==="dinosaur") {
      if(p.capture) return {eyebrow:"DINOSAUR CAPTURE",title:"Choose an empty lair",copy:p.attack?"This is the Attack card: every captive in the chosen lair will be eaten.":"The dinosaur and every explorer it caught go straight to any lair without another dinosaur.",actions:game.availableCaptureLairs().map((id)=>({label:`Use ${game.describeCell(id)}`,danger:p.attack,onClick:()=>doAction(()=>game.selectCaptureLair(id),{sound:"roar"})})),assist:true};
      if(!p.selected){const distance=p.tasks[p.taskIndex],available=game.availableDinosaurs();return{eyebrow:"DINOSAURS MOVE",title:`Choose a dinosaur to move ${distance}`,copy:`Order ${p.taskIndex+1} of ${p.tasks.length}. Each dinosaur may be chosen only once for this card.`,actions:available.length?available.map((d)=>({label:game.dinosaurName(d),meta:game.describeCell(d.cell),danger:true,onClick:()=>doAction(()=>game.selectDinosaur(d.id),{sound:"roar"})})):[{label:`No unused dinosaur can move ${distance} — skip this order`,meta:"continue to the next printed order",primary:true,onClick:()=>doAction(()=>game.skipDinosaurTask())}],assist:true};}
      return {eyebrow:"DINOSAURS MOVE",title:`${p.stepsLeft} space${p.stepsLeft===1?"":"s"} remaining`,copy:"Choose the next adjacent space. Every explorer entered is captured immediately.",actions:game.legalDinosaurSteps(p.selected).map((id)=>({label:`Stomp to ${game.describeCell(id)}`,danger:Boolean(game.explorersAt(id).length),meta:game.explorersAt(id).length?`${game.explorersAt(id).length} explorer${game.explorersAt(id).length===1?"":"s"}`:"",onClick:()=>doAction(()=>game.moveDinosaurStep(id),{sound:"step"})})),assist:true};
    }
    return {eyebrow:"ADVENTURE",title:"Resolve the card",copy:"Follow the highlighted choices.",actions:[],assist:true};
  }

  function footprintDirection(fromCell,toCell){
    const from=cellCenter(fromCell),to=cellCenter(toCell);
    const degrees=Math.atan2(to.y-from.y,to.x-from.x)*180/Math.PI;
    const sector=((Math.round(degrees/60)%6)+6)%6;
    return ["east","south-east","south-west","west","north-west","north-east"][sector];
  }

  function choiceActions(ids,label,handler,visibleLimit=18){
    if(ids.length<=visibleLimit)return ids.map((id)=>({label:label(id),onClick:()=>handler(id)}));
    const suggested=ids.slice(0,Math.min(7,ids.length)).map((id)=>({label:label(id),onClick:()=>handler(id)}));
    suggested.push({type:"select",label:"All legal board spaces",options:ids.map((id)=>({value:id,label:label(id)})),onSelect:handler});
    return suggested;
  }

  function addAction(action){
    if(action.type==="select"){
      const wrap=el("div",{class:"choice-select-wrap"});
      const select=el("select",{class:"action-select","aria-label":action.label});
      action.options.forEach((o)=>select.append(el("option",{value:o.value},escapeHtml(o.label))));
      const button=el("button",{class:"action-button",type:"button"},`<span>${escapeHtml(action.label)}</span><span class="action-meta">Choose →</span>`);
      button.addEventListener("click",()=>action.onSelect(select.value));
      wrap.append(select,button);actionGrid.append(wrap);return;
    }
    const button=el("button",{class:`action-button${action.primary?" primary":""}${action.danger?" danger":""}`,type:"button",disabled:action.disabled||false});
    const label=el("span",{},escapeHtml(action.label));button.append(label);
    if(action.meta)button.append(el("span",{class:"action-meta"},escapeHtml(action.meta)));
    button.addEventListener("click",action.onClick);actionGrid.append(button);
  }

  function secretPathActions(){
    const player=game.currentPlayer();
    if(!player.secretCards.length)return [];
    const actions=[];
    for(const explorer of game.explorersFor(game.state.currentPlayer).filter((e)=>game.canUseSecret(e))){
      for(const destination of game.secretDestinations(explorer.id)){
        const fromTemple=explorer.status==="temple";
        const caveNumber=E.CAVE_CELLS.indexOf(destination)+1;
        actions.push({
          label:fromTemple?`Secret path — explorer ${explorer.index+1} to cave ${caveNumber}`:`Secret path — explorer ${explorer.index+1} to temple`,
          meta:`${player.secretCards.length} card${player.secretCards.length===1?"":"s"} held`,
          onClick:()=>doAction(()=>game.useSecretPath(explorer.id,destination),{sound:"secret"}),
        });
      }
    }
    return actions;
  }

  function explorerStatusLabel(e){
    if(e.status==="board")return `${game.describeCell(e.cell)}${e.treasure?" · treasure":""}`;
    if(e.status==="temple")return `inside temple${e.treasure?" · treasure":""}`;
    if(e.status==="outside")return "outside valley";
    if(e.status==="lair")return `captive in ${game.describeCell(e.lair)}`;
    if(e.status==="swamp"){
      if(e.swampRoute!=null)return `inner swamp ${e.swampRoute+1}`;
      const exit=game.nearestSwampExit(e.swampStep);
      return `swamp arrow ${e.swampStep+1} · ${game.swampClockwiseDistance(e.swampStep,exit)} to exit`;
    }
    return e.status;
  }

  function renderDice(rolls){
    const tray=$("#dice-tray");tray.innerHTML="";
    rolls.forEach((value)=>tray.append(makeDie(value)));
  }

  function makeDie(value){
    const die=el("span",{class:"die rolling","aria-label":`Die shows ${value}`});
    const positions={1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
    positions[value].forEach((pos)=>{const pip=el("i",{class:"pip"});pip.style.gridArea=`${Math.ceil(pos/3)} / ${((pos-1)%3)+1}`;die.append(pip)});
    setTimeout(()=>die.classList.remove("rolling"),600);return die;
  }

  function renderPlayers(){
    const tray=$("#expedition-tray");tray.innerHTML="";
    for(const player of game.state.players){
      const living=game.livingExplorers(player.id).length;
      const status=el("div",{class:`player-status${player.id===game.state.currentPlayer?" active":""}`});
      status.style.setProperty("--player-colour",player.style.colour);
      const symbol=el("span",{class:"player-status-symbol"},player.style.symbol);symbol.style.background=player.style.colour;
      const copy=el("div",{},`<b>${escapeHtml(player.name)}</b><small>${living}/4 explorers · ${player.human?"human":"AI guide"}${player.gunCards.length?" · gun":""}${player.secretCards.length?` · ${player.secretCards.length} path`:""}</small>`);
      const loot=el("div",{class:"player-loot"},`<span class="loot-coin">${player.banked}</span><span class="loot-bullet">${player.bullets}</span>`);
      status.append(symbol,copy,loot);tray.append(status);
    }
  }

  function renderLog(){
    const list=$("#log-list");list.innerHTML="";
    game.state.log.slice(0,40).forEach((item)=>{const li=el("li",{"data-turn":`T${item.turn}`,"data-kind":item.kind},escapeHtml(item.message));list.append(li)});
    $("#log-count").textContent=game.state.log.length;
  }

  function renderPassScreen(){
    if(!game)return;
    const show=game.state.phase==="pass"&&game.currentPlayer().human;
    passScreen.hidden=!show;
    if(show){const p=game.currentPlayer();$("#pass-title").textContent=p.name;$("#pass-symbol").textContent=p.style.symbol;$("#pass-symbol").style.setProperty("--pass-colour",p.style.colour);}
  }

  function isAITurn(){return game&&!game.currentPlayer().human;}
  function scheduleAI(){
    clearTimeout(aiTimer);
    if(!game||game.state.phase==="game-over"||!isAITurn()||assistRunning)return;
    const delay=settings.fastAI?65:(game.state.phase==="draw"?520:280);
    aiTimer=setTimeout(()=>{
      const before=game.state.actionSerial;
      const phase=game.state.phase;
      try{
        if(phase==="draw") cardMemory=game.drawCard();
        else game.autoStep();
        if(game.state.actionSerial!==before){if(phase==="draw")playSound("card");else if(phase==="await-roll")playSound("dice");else if(game.state.pending?.type==="lava")playSound("lava");saveGame();}
        render();
      }
      catch(error){console.error("AI step failed",error,game.state);toast(`AI paused: ${error.message}`);}
    },delay);
  }

  async function assistEvent(){
    if(!game||game.state.phase!=="event"||assistRunning)return;
    assistRunning=true;renderPrompt();
    let guard=0;
    while(game&&game.state.phase==="event"&&guard<80){
      await sleep(settings.fastAI?35:120);
      try{game.autoStep();saveGame();renderBoard();renderPanel();}catch(error){toast(error.message);break;}
      guard+=1;
    }
    assistRunning=false;render();
  }

  function sleep(ms){return new Promise((resolve)=>setTimeout(resolve,ms));}

  function winningPlayers(){
    const ids=Array.isArray(game?.state?.winners)&&game.state.winners.length?game.state.winners:[game.state.winner];
    return ids.map((id)=>game.player(id)).filter(Boolean);
  }

  function showGameOver(){
    gameOverShown=true;
    localStorage.removeItem(SAVE_KEY);
    const winners=winningPlayers(),winner=winners[0];
    $("#victory-symbol").textContent=winners.length>1?winners.map((p)=>p.style.symbol).join(""):winner.style.symbol;
    $("#victory-symbol").style.setProperty("--victory-colour",winner.style.colour);
    $("#victory-title").textContent=winners.length>1?`${winners.map((p)=>p.name).join(" & ")} share victory`:`${winner.name} wins`;
    $("#victory-reason").textContent=game.state.endReason;
    const stats=$("#victory-stats");stats.innerHTML="";
    const values=[
      [game.state.turn,"rounds"],
      [winner.banked,"leading coins"],
      [game.livingExplorers(winner.id).length,"leading survivors"],
      [30-game.state.lavaPool,"lava counters moved"],
    ];
    values.forEach(([v,l])=>stats.append(el("div",{class:"victory-stat"},`<b>${v}</b><small>${l}</small>`)));
    playSound("win");
    $("#gameover-modal").showModal();
  }

  function toast(message){
    const node=el("div",{class:"toast"},escapeHtml(message));$("#toast-region").append(node);setTimeout(()=>node.remove(),3200);
  }

  function hintForState(){
    if(!game||game.state.turn>2)return null;
    const s=game.state,p=s.pending;
    if(s.phase==="draw")return "Adventure first: resolve the card before moving an explorer.";
    if(s.phase==="movement")return "Choose one explorer only. Dry land rolls 1d6; treasure carriers roll 2d6.";
    if(s.phase==="await-roll")return "The roll belongs to the explorer you selected.";
    if(s.phase==="moving")return "Move footprint by footprint; a space cannot be visited twice on one roll.";
    if(s.phase==="post-move")return "You may use a held secret path or bullet now, then end the turn.";
    if(s.phase!=="event"||!p)return null;
    const messages={
      lava:"Lava must remain one connected flow. After all 30 counters are down, relocate three without splitting it.",
      pteranodon:"Your explorer must land safely; an opponent may be dropped into danger or one of four inner swamp spaces.",
      monster:"The monster advances exactly one grey arrow clockwise and eats everyone on its new space.",
      "swamp-fall":"Any grey arrow except the monster’s is legal—even dangerously close; explorers may share.",
      "swamp-escape":"The Escape card reaches dry ground beyond the nearest blue exit.",
      water:"Choose the explorer first, then roll two dice to reach any river within the total.",
      fight:"Choose the captive and then the actual footprint immediately outside the lair.",
      dinosaur:"A dinosaur route must complete the full printed distance unless it captures en route."
    };
    return messages[p.type]||null;
  }

  function maybeShowFirstGameHint(){
    if(!settings.hints||!game||!game.currentPlayer().human||game.state.phase==="pass"||game.state.phase==="game-over")return;
    const p=game.state.pending;
    const key=[game.state.turn,game.state.currentPlayer,game.state.phase,p?.type||"",p?.stage||p?.mode||"",game.state.selectedExplorer||""].join(":");
    if(key===lastHintKey)return;
    const message=hintForState();
    if(!message)return;
    lastHintKey=key;
    setTimeout(()=>showBoardHint(message),80);
  }

  function showBoardHint(message){
    const node=$("#board-hint");node.textContent=message;node.classList.add("show");clearTimeout(hintTimer);hintTimer=setTimeout(()=>node.classList.remove("show"),2200);
  }

  function swoop(){const layer=$("#swoop-layer");layer.classList.remove("active");void layer.offsetWidth;layer.classList.add("active");setTimeout(()=>layer.classList.remove("active"),1300);}
  function shakeBoard(){const bezel=$(".board-bezel");bezel.animate([{transform:"translate(0,0)"},{transform:"translate(-3px,2px)"},{transform:"translate(4px,-2px)"},{transform:"translate(0,0)"}],{duration:360,easing:"ease-out"});}

  function ensureAudio(){
    if(!settings.sound)return null;
    if(!audio){const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;audio=new Ctx();}
    if(audio.state==="suspended")audio.resume();return audio;
  }

  function playSound(kind){
    const ctx=ensureAudio();if(!ctx)return;
    const now=ctx.currentTime;
    const tone=(freq,duration,type="sine",gain=.055,offset=0)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,now+offset);g.gain.setValueAtTime(.0001,now+offset);g.gain.exponentialRampToValueAtTime(gain,now+offset+.012);g.gain.exponentialRampToValueAtTime(.0001,now+offset+duration);o.connect(g).connect(ctx.destination);o.start(now+offset);o.stop(now+offset+duration+.02);};
    const noise=(duration,gain=.035,offset=0)=>{const buffer=ctx.createBuffer(1,ctx.sampleRate*duration,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);const src=ctx.createBufferSource(),g=ctx.createGain(),f=ctx.createBiquadFilter();src.buffer=buffer;f.type="lowpass";f.frequency.value=900;g.gain.value=gain;src.connect(f).connect(g).connect(ctx.destination);src.start(now+offset);};
    if(kind==="card"){noise(.09,.025);tone(560,.08,"triangle",.03,.03);}
    else if(kind==="dice"){for(let i=0;i<6;i++)noise(.035,.025,i*.045);tone(180,.12,"square",.018,.18);}
    else if(kind==="roar"){tone(92,.55,"sawtooth",.06);tone(74,.65,"square",.025,.08);}
    else if(kind==="lava"){noise(.55,.045);tone(58,.48,"sawtooth",.025);}
    else if(kind==="splash"){noise(.25,.045);tone(240,.13,"sine",.025,.06);}
    else if(kind==="swoop"){tone(650,.32,"sine",.035);tone(430,.38,"triangle",.025,.1);}
    else if(kind==="coin"){tone(880,.14,"sine",.05);tone(1320,.22,"sine",.04,.09);}
    else if(kind==="shot"){noise(.1,.1);tone(80,.16,"square",.06);}
    else if(kind==="cock"){tone(420,.04,"square",.03);tone(300,.04,"square",.025,.06);}
    else if(kind==="secret"){tone(392,.22,"sine",.035);tone(523,.25,"sine",.03,.12);}
    else if(kind==="step"){tone(110,.045,"triangle",.018);}
    else if(kind==="win"){[523,659,784,1047].forEach((f,i)=>tone(f,.45,"triangle",.045,i*.12));}
    else if(kind==="start"){[196,247,294].forEach((f,i)=>tone(f,.35,"triangle",.035,i*.08));}
    else if(kind==="error"){tone(130,.13,"square",.035);tone(105,.18,"square",.03,.1);}
  }

  function installBoardCamera(){
    const update=()=>board.setAttribute("viewBox",`${camera.x} ${camera.y} ${camera.w} ${camera.h}`);
    board.addEventListener("wheel",(event)=>{event.preventDefault();const rect=board.getBoundingClientRect();const px=(event.clientX-rect.left)/rect.width,py=(event.clientY-rect.top)/rect.height;const factor=event.deltaY>0?1.12:.89;zoomCamera(factor,px,py);},{passive:false});
    board.addEventListener("pointerdown",(event)=>{if(event.button!==0)return;pointer={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,camera:{...camera},dragged:false};board.setPointerCapture(event.pointerId);});
    board.addEventListener("pointermove",(event)=>{if(!pointer||event.pointerId!==pointer.id)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;if(Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY)>6)pointer.dragged=true;if(pointer.dragged){const rect=board.getBoundingClientRect();camera.x-=dx/rect.width*camera.w;camera.y-=dy/rect.height*camera.h;clampCamera();update();board.classList.add("is-dragging");pointer.x=event.clientX;pointer.y=event.clientY;}});
    board.addEventListener("pointerup",(event)=>{if(!pointer||event.pointerId!==pointer.id)return;suppressBoardClick=pointer.dragged;pointer=null;board.classList.remove("is-dragging");});
    board.addEventListener("pointercancel",()=>{pointer=null;board.classList.remove("is-dragging")});
    window.__LV_CAMERA_UPDATE__=update;
  }

  function zoomCamera(factor,px=.5,py=.5){
    const oldW=camera.w,oldH=camera.h;const newW=Math.max(360,Math.min(1200,oldW*factor)),newH=newW*.76;camera.x+=px*(oldW-newW);camera.y+=py*(oldH-newH);camera.w=newW;camera.h=newH;clampCamera();window.__LV_CAMERA_UPDATE__?.();
  }
  function clampCamera(){camera.x=Math.max(-70,Math.min(1070-camera.w,camera.x));camera.y=Math.max(-40,Math.min(800-camera.h,camera.y));}
  function fitBoard(){camera={x:0,y:0,w:1000,h:760};window.__LV_CAMERA_UPDATE__?.();}

  function bindUI(){
    $$("#player-count button").forEach((button)=>button.addEventListener("click",()=>setPlayerCount(Number(button.dataset.count))));
    $("#random-seed").addEventListener("click",()=>{$("#seed-input").value=String(Math.floor(Math.random()*900000)+100000);playSound("dice")});
    $("#start-game").addEventListener("click",startNewGame);
    $("#resume-game").addEventListener("click",resumeGame);
    $("#brand-home").addEventListener("click",()=>{if(game&&!gameView.hidden){if(confirm("Return to setup? Your expedition is saved locally."))showSetup();}else showSetup();});
    $("#rules-open").addEventListener("click",()=>$("#rules-modal").showModal());
    $("#settings-open").addEventListener("click",()=>$("#settings-modal").showModal());
    $("#fit-board").addEventListener("click",fitBoard);$("#zoom-in").addEventListener("click",()=>zoomCamera(.82));$("#zoom-out").addEventListener("click",()=>zoomCamera(1.2));
    $("#sound-toggle").addEventListener("click",()=>{settings.sound=!settings.sound;$("#setting-sound").checked=settings.sound;storeSettings();if(settings.sound)playSound("coin")});
    $("#setting-sound").addEventListener("change",(e)=>{settings.sound=e.target.checked;storeSettings();if(settings.sound)playSound("coin")});
    $("#setting-hints").addEventListener("change",(e)=>{settings.hints=e.target.checked;if(game)game.state.config.hints=settings.hints;if(!settings.hints)$("#board-hint").classList.remove("show");else{lastHintKey="";maybeShowFirstGameHint();}storeSettings()});
    $("#setting-fast-ai").addEventListener("change",(e)=>{settings.fastAI=e.target.checked;storeSettings();scheduleAI()});
    $("#assist-button").addEventListener("click",assistEvent);
    $("#pass-ready").addEventListener("click",()=>doAction(()=>game.readyNextTurn(),{sound:"card"}));
    $("#abandon-game").addEventListener("click",()=>{if(confirm("Abandon this saved expedition?")){localStorage.removeItem(SAVE_KEY);game=null;$("#settings-modal").close();showSetup();}});
    $("#new-expedition").addEventListener("click",()=>{$("#gameover-modal").close();game=null;showSetup()});
    $("#view-final-board").addEventListener("click",()=>$("#gameover-modal").close());
    $$("[data-rule-tab]").forEach((tab)=>tab.addEventListener("click",()=>{
      $$("[data-rule-tab]").forEach((t)=>t.setAttribute("aria-selected",String(t===tab)));
      $$("[data-rule-page]").forEach((page)=>page.hidden=page.dataset.rulePage!==tab.dataset.ruleTab);
    }));
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)scheduleAI()});
    window.addEventListener("beforeunload",()=>{if(game)localStorage.setItem(SAVE_KEY,JSON.stringify(game.toJSON()))});
  }

  function installPWA(){
    if("serviceWorker" in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("sw.js").catch((error)=>console.warn("Service worker",error));
  }

  function init(){
    loadSettings();
    renderSeatSetup();
    $("#resume-game").hidden=!hasSave();
    bindUI();
    installPWA();
    window.__LV_APP__={startNewGame,resumeGame,render,fitBoard,get game(){return game;},autoStep(){if(game){game.autoStep();render();}},save(){saveGame();}};
  }

  init();
})();
