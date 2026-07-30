(function () {
  "use strict";

  const E = window.DraculaEngine;
  const NS = "http://www.w3.org/2000/svg";
  const SAVE_KEY = "0x4d44.game-of-dracula.save.v1";
  const SETTINGS_KEY = "0x4d44.game-of-dracula.settings.v1";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const dom = {
    setup: $("#setup-screen"), gameScreen: $("#game-screen"), playerCount: $("#player-count"), seatList: $("#seat-list"),
    seed: $("#seed-input"), randomSeed: $("#random-seed"), start: $("#start-game"), resume: $("#resume-game"), setupRules: $("#setup-rules"),
    brand: $("#brand-button"), round: $("#round-value"), board: $("#board"), boardStatic: $("#board-static"), boardChoices: $("#board-choices"), boardPieces: $("#board-pieces"), boardViewport: $("#board-viewport"), boardLocation: $("#board-location"),
    fit: $("#fit-board"), zoomOut: $("#zoom-out"), zoomIn: $("#zoom-in"), soundToggle: $("#sound-toggle"), rulesOpen: $("#rules-open"), settingsOpen: $("#settings-open"),
    playerRibbon: $("#player-ribbon"), turnCard: $("#turn-card"), turnPiece: $("#turn-piece"), turnName: $("#turn-name"), turnRole: $("#turn-role"),
    spinnerButton: $("#spinner-button"), spinnerArt: $("#spinner-art"), spinnerPointer: $("#spinner-pointer"), spinnerReadout: $("#spinner-readout"), spinnerCta: $("#spinner-cta"),
    outcomeCard: $("#outcome-card"), outcomeIcon: $("#outcome-icon"), outcomeTitle: $("#outcome-title"), outcomeCopy: $("#outcome-copy"),
    commandPanel: $("#command-panel"), actionKicker: $("#action-kicker"), actionTitle: $("#action-title"), actionCopy: $("#action-copy"), primary: $("#primary-action"), destinationList: $("#destination-list"), resolve: $("#resolve-for-me"),
    logList: $("#log-list"), logCount: $("#log-count"),
    rules: $("#rules-modal"), settings: $("#settings-modal"), victory: $("#victory-modal"),
    settingSound: $("#setting-sound"), settingHints: $("#setting-hints"), settingFastAI: $("#setting-fast-ai"), settingContrast: $("#setting-contrast"), abandon: $("#abandon-game"),
    victoryPiece: $("#victory-piece"), victoryTitle: $("#victory-title"), victoryCopy: $("#victory-copy"), victoryStats: $("#victory-stats"), newGame: $("#new-game"),
    handoff: $("#handoff-overlay"), handoffTitle: $("#handoff-title"), handoffCopy: $("#handoff-copy"), handoffReady: $("#handoff-ready"),
    curse: $("#curse-overlay"), curseKicker: $("#curse-kicker"), curseTitle: $("#curse-title"), curseCopy: $("#curse-copy"),
    toasts: $("#toast-region"),
  };

  const ROOM_SHAPES = {
    north: "M45 40H955V145H720L685 166H620L590 145H410L380 166H315L280 145H45Z",
    west: "M45 140H350V345H288L250 368H165L125 345H45Z",
    hall: "M345 140H655V395L620 438H380L345 395Z",
    east: "M650 140H955V345H875L835 368H750L712 345H650Z",
    rose: "M50 340H382V600H330L296 625H150L115 600H50Z",
    gallery: "M618 340H950V600H885L850 625H704L670 600H618Z",
    court: "M372 390H628V610L595 650H405L372 610Z",
    vault: "M35 592H318V780H35Z",
    chapel: "M295 592H705V780H295Z",
    gate: "M682 592H965V780H682Z",
  };

  const ROOM_LABELS = {
    north: [500, 118], west: [195, 190], hall: [500, 208], east: [805, 190], rose: [225, 455], gallery: [775, 455], court: [500, 520], vault: [165, 650], chapel: [500, 735], gate: [835, 650],
  };

  const settings = Object.assign({ sound: true, hints: true, fastAI: false, contrast: false }, loadJSON(SETTINGS_KEY, {}));
  let playerCount = 2;
  let seatConfig = E.DEFAULT_NAMES.map((name, id) => ({ name, human: id === 0 }));
  let game = null;
  let busy = false;
  let spinRotation = 0;
  let presentedHuman = null;
  let handoffResolve = null;
  let aiTimer = null;
  let view = { x: 0, y: 0, w: 1000, h: 800 };
  let drag = null;
  let audio = null;

  class CastleAudio {
    constructor() { this.context = null; this.enabled = settings.sound; }
    ensure() {
      if (!this.enabled) return null;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      try {
        if (!this.context) this.context = new AudioContextClass();
        if (this.context.state === "suspended") this.context.resume().catch(() => {});
        return this.context;
      } catch (_) {
        return null;
      }
    }
    tone(freq, duration, type = "sine", gain = .035, delay = 0) {
      const ctx = this.ensure(); if (!ctx) return;
      const osc = ctx.createOscillator(); const vol = ctx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      vol.gain.setValueAtTime(.0001, ctx.currentTime + delay);
      vol.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + delay + .01);
      vol.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + delay + duration);
      osc.connect(vol).connect(ctx.destination); osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + duration + .02);
    }
    spin() { for (let i = 0; i < 14; i += 1) this.tone(820 - i * 27, .025, "square", .012, i * .055); }
    step(low = false) { this.tone(low ? 92 : 180, .08, "triangle", .035); this.tone(low ? 63 : 240, .11, "sine", .018, .025); }
    wings() { for (let i = 0; i < 5; i += 1) this.tone(270 + i * 60, .055, "sawtooth", .012, i * .045); }
    bite() { this.tone(72, .75, "sawtooth", .055); this.tone(108, .58, "square", .022, .08); this.tone(54, .9, "sine", .045, .12); }
    curse() { [196, 233, 277, 330].forEach((f, i) => this.tone(f, .9, "sawtooth", .025, i * .1)); }
    win() { [262, 330, 392, 523].forEach((f, i) => this.tone(f, .65, "triangle", .035, i * .12)); }
  }

  function loadJSON(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
  }

  function storageGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
  function storageRemove(key) { try { localStorage.removeItem(key); } catch (_) { /* storage can be unavailable */ } }

  function randomUint32() {
    try {
      if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
        const values = new Uint32Array(1);
        globalThis.crypto.getRandomValues(values);
        return values[0] || 1977;
      }
    } catch (_) { /* fall through to a non-cryptographic game seed */ }
    return ((Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0) || 1977;
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function confirmAction(message) {
    try { return typeof window.confirm === "function" ? window.confirm(message) : true; }
    catch (_) { return true; }
  }

  function prefersReducedMotion() {
    try { return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (_) { return false; }
  }

  function saveSettings() {
    storageSet(SETTINGS_KEY, JSON.stringify(settings));
    applySettings();
  }

  function applySettings() {
    dom.settingSound.checked = settings.sound;
    dom.settingHints.checked = settings.hints;
    dom.settingFastAI.checked = settings.fastAI;
    dom.settingContrast.checked = settings.contrast;
    dom.soundToggle.setAttribute("aria-pressed", String(settings.sound));
    document.body.classList.toggle("high-contrast", settings.contrast);
    if (audio) audio.enabled = settings.sound;
  }

  function saveGame() {
    if (!game || game.state.winner != null) return;
    if (storageSet(SAVE_KEY, game.serialize())) dom.resume.hidden = false;
  }

  function clearSave() {
    storageRemove(SAVE_KEY);
    dom.resume.hidden = true;
  }

  function svg(tag, attrs, content) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (key === "className") node.setAttribute("class", value);
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    }
    if (content) node.innerHTML = content;
    return node;
  }

  function hashNumber(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  }

  function polar(cx, cy, radius, angle) {
    const radians = angle * Math.PI / 180;
    return [cx + Math.cos(radians) * radius, cy + Math.sin(radians) * radius];
  }

  function wedgePath(cx, cy, outer, inner, start, end) {
    const [x1, y1] = polar(cx, cy, outer, start); const [x2, y2] = polar(cx, cy, outer, end);
    const [x3, y3] = polar(cx, cy, inner, end); const [x4, y4] = polar(cx, cy, inner, start);
    const large = end - start > 180 ? 1 : 0;
    return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${outer} ${outer} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}L${x3.toFixed(2)} ${y3.toFixed(2)}A${inner} ${inner} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z`;
  }

  function renderSetupSeats() {
    dom.seatList.innerHTML = "";
    for (let id = 0; id < playerCount; id += 1) {
      const style = E.PLAYER_STYLES[id];
      const row = document.createElement("div"); row.className = "seat-row";
      row.innerHTML = `<span class="seat-swatch" style="background:${style.colour}">${style.symbol}</span>
        <label><span class="sr-only">Player ${id + 1} name</span><input type="text" maxlength="28" value="${escapeHTML(seatConfig[id].name)}"></label>
        <div class="ai-toggle" role="group" aria-label="${escapeHTML(style.name)} player type">
          <button type="button" data-human="true" aria-pressed="${seatConfig[id].human}">HUMAN</button>
          <button type="button" data-human="false" aria-pressed="${!seatConfig[id].human}">AUTO</button>
        </div>`;
      const input = $("input", row);
      input.addEventListener("input", () => { seatConfig[id].name = input.value; });
      $$(".ai-toggle button", row).forEach((button) => button.addEventListener("click", () => {
        seatConfig[id].human = button.dataset.human === "true";
        $$(".ai-toggle button", row).forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
      }));
      dom.seatList.append(row);
    }
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function buildSpinner() {
    dom.spinnerArt.innerHTML = "";
    dom.spinnerArt.append(svg("rect", { x: 8, y: 8, width: 304, height: 304, rx: 24, class: "spinner-card-bg" }));
    E.SPINNER.forEach((sector) => {
      dom.spinnerArt.append(svg("path", { d: wedgePath(160, 160, 135, 95, sector.angle - 10, sector.angle + 10), class: `spinner-sector ${sector.colour}` }));
      const [tx, ty] = polar(160, 160, 115, sector.angle);
      let rotate = sector.angle;
      if (rotate > 90 && rotate < 270) rotate += 180;
      dom.spinnerArt.append(svg("text", { x: tx, y: ty, class: "spinner-number", transform: `rotate(${rotate} ${tx} ${ty})`, text: sector.outer }));
    });
    const innerGroups = [
      { start: 0, end: 60, kind: "white", label: "VAMPIRE", angle: 30 },
      { start: 60, end: 120, kind: "yellow", label: "3", angle: 90 },
      { start: 120, end: 180, kind: "yellow", label: "4", angle: 150 },
      { start: 180, end: 240, kind: "white", label: "VAMPIRE", angle: 210 },
      { start: 240, end: 300, kind: "yellow", label: "3", angle: 270 },
      { start: 300, end: 360, kind: "yellow", label: "4", angle: 330 },
    ];
    innerGroups.forEach((group) => {
      dom.spinnerArt.append(svg("path", { d: wedgePath(160, 160, 94, 30, group.start, group.end), class: group.kind === "white" ? "spinner-inner-white" : "spinner-inner-yellow" }));
      const [tx, ty] = polar(160, 160, 65, group.angle);
      if (group.kind === "white") {
        dom.spinnerArt.append(svg("path", { d: batPath(tx, ty - 4, .28), class: "spinner-bat" }));
        dom.spinnerArt.append(svg("text", { x: tx, y: ty + 22, class: "spinner-vampire-text", text: "VAMPIRE" }));
      } else {
        dom.spinnerArt.append(svg("text", { x: tx, y: ty, class: "spinner-inner-number", text: group.label }));
      }
    });
    [[40, 40], [280, 40], [40, 280], [280, 280]].forEach(([x, y], index) => {
      const scale = index % 2 ? -.32 : .32;
      dom.spinnerArt.append(svg("path", { d: batPath(x, y, scale), class: "spinner-bat" }));
      dom.spinnerArt.append(svg("circle", { cx: x - (index % 2 ? -3 : 3), cy: y, r: 1.8, class: "spinner-bat-eye" }));
    });
    dom.spinnerArt.append(svg("circle", { cx: 160, cy: 160, r: 29, fill: "#f7edce", stroke: "#171425", "stroke-width": 5 }));
  }

  function batPath(cx, cy, scale) {
    const s = scale || 1;
    const points = [[0,0],[-28,-18],[-51,-12],[-43,5],[-60,14],[-31,18],[-24,36],[0,19],[24,36],[31,18],[60,14],[43,5],[51,-12],[28,-18]];
    return points.map(([x,y], i) => `${i ? "L" : "M"}${(cx+x*s).toFixed(1)} ${(cy+y*Math.abs(s)).toFixed(1)}`).join("") + "Z";
  }

  function buildBoard() {
    dom.boardStatic.innerHTML = "";
    dom.boardStatic.append(svg("rect", { width: 1000, height: 800, fill: "#55bed4" }));
    dom.boardStatic.append(svg("rect", { width: 1000, height: 800, fill: "url(#boardSpeckle)", opacity: .4 }));

    // Outer castle silhouette and towers.
    dom.boardStatic.append(svg("path", { d: "M35 55Q35 28 62 28H938Q965 28 965 55V760Q965 786 938 786H62Q35 786 35 760Z", fill: "#181426", opacity: .94 }));
    [[68,60],[932,60],[68,740],[932,740]].forEach(([x,y]) => {
      dom.boardStatic.append(svg("circle", { cx:x, cy:y, r:44, fill:"#ebe2c6", stroke:"#171425", "stroke-width":12 }));
      dom.boardStatic.append(svg("circle", { cx:x, cy:y, r:24, fill:"#f0d936", stroke:"#171425", "stroke-width":5 }));
    });

    for (const room of E.ROOMS) {
      const shape = ROOM_SHAPES[room.id]; if (!shape) continue;
      dom.boardStatic.append(svg("path", { d: shape, fill: room.fill, class: "room-shape" }));
      dom.boardStatic.append(svg("path", { d: shape, class: "room-inner" }));
      const [x,y] = ROOM_LABELS[room.id];
      dom.boardStatic.append(svg("text", { x, y, class: "room-label", text: room.short }));
    }

    // Paper cracks and masonry marks.
    const crackGroup = svg("g", { fill: "none", stroke: "#342a3e", "stroke-width": 2, opacity: .22 });
    [
      "M76 175l13-7 8 9 16-5", "M272 390l14-8 10 10 19-6", "M680 181l12 7 13-10 18 8",
      "M748 470l13-9 12 11 18-5", "M430 455l14-8 8 11 15-5", "M360 700l15-8 12 10 18-6",
      "M875 660l14-7 11 9 17-5", "M187 535l11-7 10 9 16-5",
    ].forEach((d) => crackGroup.append(svg("path", { d })));
    dom.boardStatic.append(crackGroup);

    // Yellow path connections.
    const pathUnder = svg("g", { class: "path-connections" });
    for (const [a,b] of E.EDGE_LIST) {
      const na = E.NODES[a], nb = E.NODES[b];
      pathUnder.append(svg("line", { x1:na.x, y1:na.y, x2:nb.x, y2:nb.y, class:"path-under" }));
      pathUnder.append(svg("line", { x1:na.x, y1:na.y, x2:nb.x, y2:nb.y, class:"path-over" }));
    }
    dom.boardStatic.append(pathUnder);

    // Dracula's independent trail.
    const points = E.DRACULA_TRACK.map((p) => `${p.x},${p.y}`).join(" ");
    dom.boardStatic.append(svg("polyline", { points, class:"blood-line-under" }));
    dom.boardStatic.append(svg("polyline", { points, class:"blood-line" }));
    // close the circuit
    const first = E.DRACULA_TRACK[0], last = E.DRACULA_TRACK[E.DRACULA_TRACK.length-1];
    dom.boardStatic.append(svg("line", { x1:last.x, y1:last.y, x2:first.x, y2:first.y, class:"blood-line-under" }));
    dom.boardStatic.append(svg("line", { x1:last.x, y1:last.y, x2:first.x, y2:first.y, class:"blood-line" }));
    E.DRACULA_TRACK.forEach((pool, index) => dom.boardStatic.append(svg("circle", { id:`blood-pool-${index}`, cx:pool.x, cy:pool.y, r:index===0?12:9, class:"blood-pool" })));

    // Stone slabs and special markings.
    for (const entry of E.NODE_LIST) {
      const group = svg("g", { class: "board-node", "data-node": entry.id });
      const angle = ((hashNumber(entry.id) % 13) - 6);
      const width = entry.home ? 72 : entry.kind === "start" ? 58 : 46;
      const height = entry.home ? 44 : entry.kind === "start" ? 37 : 29;
      group.append(svg("rect", { x:entry.x-width/2, y:entry.y-height/2, width, height, rx:entry.home?9:7, transform:`rotate(${angle} ${entry.x} ${entry.y})`, class:`stone ${entry.kind}` }));
      if (entry.kind === "start") {
        const style = E.PLAYER_STYLES[entry.start];
        group.append(svg("rect", { x:entry.x-width/2+5, y:entry.y-height/2+5, width:width-10, height:height-10, rx:5, fill:style.colour, stroke:"#171425", "stroke-width":3, transform:`rotate(${angle} ${entry.x} ${entry.y})` }));
        group.append(svg("text", { x:entry.x, y:entry.y, class:"stone-label start-label", text:"START" }));
      } else if (entry.home) {
        group.append(svg("text", { x:entry.x, y:entry.y, class:"stone-label home-label", text:"HOME" }));
      }
      if (entry.hide) {
        group.append(svg("circle", { cx:entry.x+17, cy:entry.y-17, r:12, class:"hide-marker" }));
        group.append(svg("text", { x:entry.x+17, y:entry.y-16, class:"hide-symbol", text:"♜" }));
      }
      if (entry.perch) {
        const colour = entry.perch <= 4 ? "green" : "blue";
        group.append(svg("path", { d:`M${entry.x-18} ${entry.y-34}h36l6 24-24 15-24-15Z`, class:`perch-badge ${colour}` }));
        group.append(svg("text", { x:entry.x, y:entry.y-18, class:"perch-number", text:entry.perch }));
      }
      dom.boardStatic.append(group);
    }

    // Candle barriers at the forbidden Green Vampire doorways.
    for (const key of E.CANDLE_EDGES) {
      const [a,b] = key.split("|"); const na = E.NODES[a], nb = E.NODES[b];
      const x=(na.x+nb.x)/2, y=(na.y+nb.y)/2;
      const candle = svg("g", { class:"candle", transform:`translate(${x} ${y})` });
      candle.innerHTML = `<path class="candle-base" d="M-17 11h34v7h-34zM-11 11V-5h8v16M3 11V-9h8v20"/><path class="candle-flame" d="M-7-7q-7-8 0-15 7 7 0 15Zm10-4q-7-8 0-15 8 8 0 15Z"/>`;
      dom.boardStatic.append(candle);
    }

    // Coffin and playful 1970s ornaments.
    const coffin = svg("g", { transform:"translate(75 690) rotate(-18)" });
    coffin.innerHTML = `<path class="coffin" d="M0-48 28-32 36 25 18 50h-36l-18-25 8-57Z"/><path class="coffin-lid" d="M0-38 20-26 26 21 13 39h-26L-26 21l6-47Z"/><path class="coffin-cross" d="M0-20v39M-12-4h24"/>`;
    dom.boardStatic.append(coffin);
    [[455,188,.55],[735,520,.42],[250,680,.36],[880,310,.33]].forEach(([x,y,s]) => dom.boardStatic.append(svg("path", { d:batPath(x,y,s), class:"board-bat" })));
    dom.boardStatic.append(svg("text", { x:500, y:36, fill:"#fff3bf", stroke:"#171425", "stroke-width":7, "paint-order":"stroke fill", "font-family":"Impact, sans-serif", "font-size":30, "text-anchor":"middle", "letter-spacing":"5", text:"CASTLE DRACULA" }));
    dom.boardStatic.append(svg("text", { x:500, y:790, fill:"#171425", "font-size":9, "text-anchor":"middle", "font-weight":900, "letter-spacing":"2", text:"AN ORIGINAL VECTOR RESTORATION · NO SCANS" }));
  }

  function renderAll() {
    if (!game) return;
    renderPieces();
    renderChoices();
    renderRibbon();
    renderControls();
    renderLog();
    dom.round.textContent = game.state.round;
    $$(".blood-pool", dom.boardStatic).forEach((pool) => pool.classList.remove("current"));
    const currentPool = $(`#blood-pool-${game.state.draculaIndex}`, dom.boardStatic);
    if (currentPool) currentPool.classList.add("current");
  }

  function renderPieces() {
    dom.boardPieces.innerHTML = "";
    const occupancy = new Map();
    for (const player of game.state.players) {
      if (player.status !== "human" || player.escaped) continue;
      const list = occupancy.get(player.node) || []; list.push(player); occupancy.set(player.node, list);
    }
    for (const [nodeId, players] of occupancy) {
      const at = E.NODES[nodeId];
      players.forEach((player, index) => {
        const offset = pieceOffset(index, players.length);
        dom.boardPieces.append(playerPiece(player, at.x + offset.x, at.y + offset.y));
      });
    }
    const drac = E.DRACULA_TRACK[game.state.draculaIndex];
    dom.boardPieces.append(draculaPiece(drac.x, drac.y));
    const blueAt = E.NODES[game.state.blue.node];
    dom.boardPieces.append(vampirePiece("blue", blueAt.x + 1, blueAt.y - 1, null));
    const greenAt = E.NODES[game.state.green.node];
    const holder = game.state.green.holder == null ? null : game.state.players[game.state.green.holder];
    dom.boardPieces.append(vampirePiece("green", greenAt.x - 1, greenAt.y - 2, holder));
  }

  function pieceOffset(index, total) {
    if (total === 1) return {x:0,y:0};
    const angle = -Math.PI/2 + index * (Math.PI*2/total);
    return { x:Math.cos(angle)*14, y:Math.sin(angle)*12 };
  }

  function playerPiece(player, x, y) {
    const group = svg("g", { id:`player-piece-${player.id}`, class:"player-piece", transform:`translate(${x} ${y-20})`, "aria-label":player.name });
    group.innerHTML = `<path class="pawn-body" fill="${player.style.colour}" d="M-19 22h38l-5-12q-3-7 2-13 5-7 5-15 0-16-21-16t-21 16q0 8 5 15 5 6 2 13Z"/><ellipse class="pawn-highlight" cx="-7" cy="-20" rx="5" ry="8"/><text class="pawn-symbol" x="0" y="8">${player.style.symbol}</text>`;
    return group;
  }

  function draculaPiece(x, y) {
    const group = svg("g", { id:"dracula-piece", class:"menace-piece", transform:`translate(${x} ${y-27})` });
    group.innerHTML = `<path class="dracula-cloak" d="M-38 33q6-34 24-47l-16-8 25-11L0-48l5 15 25 11-16 8q18 13 24 47L17 21 9 43H-9l-8-22Z"/><ellipse class="dracula-face" cx="0" cy="-14" rx="18" ry="22"/><path class="dracula-hair" d="M-19-18Q-13-45 0-31q13-14 19 13-9-10-19-4-10-6-19 4Z"/><ellipse class="dracula-eye" cx="-7" cy="-13" rx="5" ry="4"/><ellipse class="dracula-eye" cx="7" cy="-13" rx="5" ry="4"/><circle class="dracula-pupil" cx="-6" cy="-13" r="2"/><circle class="dracula-pupil" cx="6" cy="-13" r="2"/><path d="M-9-1q9 8 18 0" fill="#47131d" stroke="#171425" stroke-width="3"/><path class="dracula-fang" d="m-6 1 4 11 4-11m3 0 3 9 3-10"/>`;
    return group;
  }

  function vampirePiece(colour, x, y, holder) {
    const dormant = colour === "green" && !holder;
    const group = svg("g", { id:`${colour}-vampire-piece`, class:"menace-piece", transform:`translate(${x} ${y-22})`, opacity:dormant?.72:1 });
    const pawn = holder ? `<circle cx="0" cy="19" r="11" fill="${holder.style.colour}" stroke="#171425" stroke-width="4"/><text class="pawn-symbol" x="0" y="20">${holder.style.symbol}</text><circle class="piece-role-ring" cx="0" cy="1" r="39"/>` : "";
    group.innerHTML = `<path class="vampire-wing ${colour}" d="M-12 1-55-28l12 31-24 8 35 15 20-9Zm24 0 55-29-12 31 24 8-35 15-20-9Z"/><path class="vampire-head ${colour}" d="M-28-6-22-35-7-18Q0-24 7-18l15-17 6 29q0 39-28 46-28-7-28-46Z"/><path class="vampire-eye" d="m-20-5 14 2-11 10Zm40 0L6-3 17 7Z"/><path d="M-14 17q14 12 28 0" fill="#171425"/><path class="vampire-fang" d="m-8 18 5 15 5-14m5-1 4 13 4-15"/>${pawn}`;
    return group;
  }

  function renderChoices() {
    dom.boardChoices.innerHTML = "";
    if (!game || game.state.phase !== "await-move" || busy) return;
    game.state.pending.options.forEach((option, index) => {
      const at = E.NODES[option.destination];
      const group = svg("g", { class:"choice-target", role:"button", tabindex:"0", "data-destination":option.destination, "aria-label":choiceLabel(option.destination, index+1) });
      group.append(svg("circle", { cx:at.x, cy:at.y, r:27, class:"choice-ring" }));
      group.append(svg("circle", { cx:at.x, cy:at.y, r:14, fill:"#f5dc43", stroke:"#171425", "stroke-width":4 }));
      group.append(svg("text", { x:at.x, y:at.y+1, class:"choice-index", text:index+1 }));
      group.addEventListener("click", () => handleMove(option.destination));
      group.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleMove(option.destination); } });
      group.addEventListener("mouseenter", () => { dom.boardLocation.textContent = choiceLabel(option.destination, index+1); });
      group.addEventListener("mouseleave", () => { dom.boardLocation.textContent = "Castle Dracula"; });
      dom.boardChoices.append(group);
    });
  }

  function choiceLabel(nodeId, index) {
    const at = E.NODES[nodeId];
    const suffix = at.home ? " · HOME" : at.hide ? " · hidey-hole" : "";
    return `${index}. ${E.roomName(at.room)}${suffix}`;
  }

  function renderRibbon() {
    dom.playerRibbon.innerHTML = "";
    game.state.players.forEach((player) => {
      const chip = document.createElement("div");
      chip.className = `player-chip${player.id === game.state.currentPlayer ? " active" : ""}${player.status === "green-vampire" ? " cursed" : ""}`;
      const room = player.escaped ? "Escaped" : player.status === "green-vampire" ? "Wearing the mask" : E.roomName(E.NODES[player.node].room);
      chip.innerHTML = `<span class="chip-piece" style="background:${player.style.colour}">${player.style.symbol}</span><span class="chip-copy"><b>${escapeHTML(player.name)}</b><small>${escapeHTML(room)}</small></span><span class="chip-status">${player.status === "green-vampire" ? "MASK" : player.bites + player.blueBites ? `${player.bites + player.blueBites}×` : ""}</span>`;
      dom.playerRibbon.append(chip);
    });
  }

  function displayedActor() {
    if (game.state.phase === "await-victim" && game.state.pending) return game.state.players[game.state.pending.chooser];
    if (game.state.phase === "await-move" && game.state.pending) return game.state.players[game.state.pending.playerId];
    return game.currentPlayer();
  }

  function renderControls() {
    const player = displayedActor();
    dom.turnCard.style.setProperty("--turn-colour", player.style.colour);
    dom.turnCard.style.setProperty("--turn-dark", player.style.dark);
    dom.turnPiece.style.setProperty("--turn-colour", player.style.colour);
    dom.turnPiece.style.setProperty("--turn-dark", player.style.dark);
    dom.turnPiece.style.background = player.style.colour;
    dom.turnPiece.textContent = player.status === "green-vampire" ? "☾" : player.style.symbol;
    dom.turnName.textContent = player.name;
    dom.turnRole.textContent = player.status === "green-vampire" ? "Green Vampire · catch a guest and pass the mask" : "Human guest · reach either HOME doorway";

    const humanTurn = player.human;
    dom.spinnerButton.disabled = busy || game.state.phase !== "await-spin" || !humanTurn;
    dom.primary.disabled = busy || !humanTurn;
    dom.destinationList.innerHTML = "";
    dom.resolve.hidden = true;

    if (game.state.phase === "await-spin") {
      dom.actionKicker.textContent = humanTurn ? "YOUR TURN" : "AUTOMATON THINKING";
      dom.actionTitle.textContent = "Spin the night";
      dom.actionCopy.textContent = settings.hints ? "The red ring moves Dracula. The yellow centre moves you. A coloured sector flies a vampire instead." : "Turn the pointer and face the result.";
      dom.primary.hidden = false; dom.primary.innerHTML = "<span>Spin the night</span><b aria-hidden=\"true\">↻</b>";
      dom.spinnerCta.textContent = humanTurn ? "SPIN" : "WAIT";
    } else if (game.state.phase === "await-move") {
      const steps = game.state.pending.steps;
      dom.actionKicker.textContent = game.state.pending.green ? "THE MASK MOVES" : "YELLOW STONES";
      dom.actionTitle.textContent = `Choose a ${steps}-stone route`;
      dom.actionCopy.textContent = game.state.pending.green ? "Candlesticks close some doorways to you. End in an occupied room to pass the curse." : "Every numbered glow is a legal exact destination. A white rook marks safety.";
      dom.primary.hidden = true;
      game.state.pending.options.forEach((option, index) => {
        const at = E.NODES[option.destination];
        const button = document.createElement("button"); button.type = "button"; button.className = "destination-button";
        button.innerHTML = `<span>${index+1}</span><div><b>${escapeHTML(E.roomName(at.room))}</b><small>${at.home ? "Escape through HOME" : at.hide ? "Protected hidey-hole" : "Open castle stone"}</small></div>`;
        button.addEventListener("click", () => handleMove(option.destination));
        dom.destinationList.append(button);
      });
      dom.resolve.hidden = !humanTurn;
      dom.resolve.textContent = game.state.pending.green ? "Hunt for me" : "Choose a safe route for me";
    } else if (game.state.phase === "await-victim") {
      dom.actionKicker.textContent = "THE CURSE MUST PASS";
      dom.actionTitle.textContent = "Choose the next Green Vampire";
      dom.actionCopy.textContent = "Only exposed guests in this room can be engulfed. Hidey-holes remain safe.";
      dom.primary.hidden = true;
      game.state.pending.victims.forEach((victimId, index) => {
        const victim = game.state.players[victimId];
        const button = document.createElement("button"); button.type = "button"; button.className = "destination-button";
        button.innerHTML = `<span style="background:${victim.style.colour}">${victim.style.symbol}</span><div><b>${escapeHTML(victim.name)}</b><small>Pass the mask</small></div>`;
        button.addEventListener("click", () => handleVictim(victimId));
        dom.destinationList.append(button);
      });
      dom.resolve.hidden = !humanTurn;
      dom.resolve.textContent = "Choose the nearest escapee";
    } else if (game.state.phase === "gameover") {
      dom.actionKicker.textContent = "THE NIGHT IS OVER"; dom.actionTitle.textContent = "A doorway stands open"; dom.actionCopy.textContent = game.state.endReason || "A guest escaped."; dom.primary.hidden = true;
    } else {
      dom.actionKicker.textContent = "THE CASTLE MOVES"; dom.actionTitle.textContent = "Resolving the spin"; dom.actionCopy.textContent = "Listen for footsteps on the blood trail."; dom.primary.hidden = true;
    }
  }

  function renderLog() {
    dom.logList.innerHTML = "";
    game.state.log.slice(0, 20).forEach((entry) => {
      const li = document.createElement("li"); li.textContent = `T${entry.turn} · ${entry.text}`; dom.logList.append(li);
    });
    const n = game.state.log.length; dom.logCount.textContent = `${n} ${n === 1 ? "entry" : "entries"}`;
  }

  function updateOutcome(outcome) {
    dom.outcomeCard.className = "outcome-card";
    if (!outcome) {
      dom.spinnerReadout.textContent = "Ready"; dom.outcomeIcon.textContent = "✦"; dom.outcomeTitle.textContent = "The castle is listening"; dom.outcomeCopy.textContent = "Red moves Dracula. Yellow moves your piece. A coloured result summons a vampire instead."; return;
    }
    dom.outcomeCard.classList.add(outcome.colour);
    if (outcome.type === "red") {
      dom.spinnerReadout.textContent = `${outcome.outer} / ${outcome.inner}`; dom.outcomeIcon.textContent = "DR"; dom.outcomeTitle.textContent = `Dracula ${outcome.outer} · guest ${outcome.inner}`; dom.outcomeCopy.textContent = "The Count prowls first. Then the active guest—or the Green Vampire—moves the yellow number.";
    } else {
      dom.spinnerReadout.textContent = `${outcome.colour} ${outcome.outer}`; dom.outcomeIcon.textContent = outcome.colour === "green" ? "GV" : "BV"; dom.outcomeTitle.textContent = `${outcome.colour === "green" ? "Green" : "Blue"} Vampire to perch ${outcome.outer}`; dom.outcomeCopy.textContent = "No guest movement this turn. The bat flies straight to the numbered perch and hunts that room.";
    }
  }

  async function handlePrimary() {
    if (!game || busy) return;
    if (game.state.phase === "await-spin") await handleSpin();
  }

  async function handleSpin() {
    if (busy || game.state.phase !== "await-spin") return;
    const actor = game.currentPlayer();
    if (actor.human) audio.ensure();
    busy = true; renderControls();
    const beforeIndex = game.state.draculaIndex;
    const result = game.spin();
    saveGame();
    updateOutcome(result.outcome);
    const target = result.outcome.angle;
    spinRotation += 1080 + ((target - (spinRotation % 360) + 360) % 360);
    dom.spinnerPointer.style.transform = `rotate(${spinRotation}deg)`;
    audio.spin();
    await sleep(settings.fastAI ? 380 : 930);
    renderAll();
    const dracEvent = result.events.find((event) => event.type === "dracula-move");
    if (dracEvent) await animateDracula(beforeIndex, dracEvent.path);
    await playEvents(result.events);
    busy = false; renderAll(); saveGame();
    await maybeContinue();
  }

  async function handleMove(destination) {
    if (busy || game.state.phase !== "await-move") return;
    const pending = game.state.pending;
    const option = pending.options.find((entry) => entry.destination === destination); if (!option) return;
    const actor = game.state.players[pending.playerId];
    busy = true; renderControls();
    const result = game.chooseMove(destination); saveGame(); renderAll();
    await animateMove(option.path, actor, pending.green);
    await playEvents(result.events);
    busy = false; renderAll(); saveGame();
    await maybeContinue();
  }

  async function handleVictim(victimId) {
    if (busy || game.state.phase !== "await-victim") return;
    busy = true; renderControls();
    const result = game.chooseVictim(victimId); saveGame(); renderAll();
    await playEvents(result.events);
    busy = false; renderAll(); saveGame();
    await maybeContinue();
  }

  async function animateMove(path, actor, green) {
    if (!path || path.length < 2 || prefersReducedMotion()) { audio.step(); return; }
    const targetId = green ? "green-vampire-piece" : `player-piece-${actor.id}`;
    const target = document.getElementById(targetId); if (target) target.style.opacity = "0";
    const token = green ? vampirePiece("green", 0, 0, actor) : playerPiece(actor, 0, 20);
    token.removeAttribute("id"); token.classList.add("motion-token"); token.setAttribute("transform", "translate(0 0)");
    dom.boardPieces.append(token);
    for (let i = 0; i < path.length - 1; i += 1) {
      const from = E.NODES[path[i]], to = E.NODES[path[i+1]];
      const yOffset = green ? -22 : -20;
      const animation = token.animate([
        { transform:`translate(${from.x}px, ${from.y + yOffset}px)` },
        { transform:`translate(${to.x}px, ${to.y + yOffset}px)` },
      ], { duration:settings.fastAI?70:150, easing:"ease-in-out", fill:"forwards" });
      audio.step(green); await animation.finished.catch(() => {});
    }
    token.remove(); if (target) target.style.opacity = "1";
  }

  async function animateDracula(beforeIndex, path) {
    if (!path || !path.length || prefersReducedMotion()) { audio.step(true); return; }
    const target = document.getElementById("dracula-piece"); if (target) target.style.opacity = "0";
    const token = draculaPiece(0, 27); token.removeAttribute("id"); token.setAttribute("transform", "translate(0 0)"); dom.boardPieces.append(token);
    let from = E.DRACULA_TRACK[beforeIndex];
    for (const index of path) {
      const to = E.DRACULA_TRACK[index];
      const animation = token.animate([{transform:`translate(${from.x}px, ${from.y-27}px)`},{transform:`translate(${to.x}px, ${to.y-27}px)`}], {duration:settings.fastAI?60:115,easing:"ease-in-out",fill:"forwards"});
      audio.step(true); await animation.finished.catch(() => {}); from = to;
    }
    token.remove(); if (target) target.style.opacity = "1";
  }

  async function playEvents(events) {
    for (const event of events) {
      if (event.type === "vampire-flight") { audio.wings(); pulsePiece(`${event.menace}-vampire-piece`); await sleep(settings.fastAI?90:230); }
      if (event.type === "first-bite") { audio.bite(); await showCurse(event.playerId, true); }
      if (event.type === "dracula-bite") { audio.bite(); toast(`${game.state.players[event.playerId].name} is carried back to the vault.`); pulsePiece("dracula-piece"); await sleep(settings.fastAI?120:360); }
      if (event.type === "blue-bite") { audio.bite(); toast(`The Blue Vampire catches ${game.state.players[event.playerId].name}.`); pulsePiece("blue-vampire-piece"); await sleep(settings.fastAI?120:360); }
      if (event.type === "curse-pass") { audio.curse(); await showCurse(event.to, false, event.from); }
      if (event.type === "escape") { audio.win(); await sleep(250); showVictory(); }
    }
  }

  function pulsePiece(id) {
    const piece = document.getElementById(id);
    if (!piece || prefersReducedMotion() || typeof piece.animate !== "function") return;
    piece.animate([{filter:"brightness(1)"},{filter:"brightness(1.8) drop-shadow(0 0 12px #fff36a)",transform:"scale(1.18)"},{filter:"brightness(1)"}], {duration:520,easing:"ease-out"});
  }

  async function showCurse(playerId, first, fromId) {
    const player = game.state.players[playerId];
    dom.curseKicker.textContent = first ? "THE FIRST BITE" : "THE CURSE CHANGES HANDS";
    dom.curseTitle.textContent = `${player.name} wears the mask.`;
    dom.curseCopy.textContent = first ? "Dracula has made the first Green Vampire." : `${fromId == null ? "The former vampire" : game.state.players[fromId].name} is human again—and dives for cover.`;
    dom.curse.classList.remove("fade"); dom.curse.hidden = false;
    const reduced = prefersReducedMotion();
    await sleep(reduced ? 90 : settings.fastAI ? 520 : 1700);
    dom.curse.classList.add("fade"); await sleep(reduced ? 10 : 430); dom.curse.hidden = true; dom.curse.classList.remove("fade");
  }

  function showVictory() {
    if (game.state.winner == null || dom.victory.open) return;
    const winner = game.state.players[game.state.winner];
    clearSave();
    dom.victoryPiece.style.background = winner.style.colour; dom.victoryPiece.textContent = winner.style.symbol;
    dom.victoryTitle.textContent = `${winner.name} escapes`;
    dom.victoryCopy.textContent = game.state.endReason;
    dom.victoryStats.innerHTML = `<div><b>${game.state.round}</b><span>rounds</span></div><div><b>${game.state.stats.bites}</b><span>Dracula bites</span></div><div><b>${game.state.stats.cursePasses}</b><span>mask passes</span></div>`;
    openDialog(dom.victory);
  }

  async function maybeContinue() {
    clearTimeout(aiTimer);
    if (!game || busy || game.state.winner != null) { if (game && game.state.winner != null) showVictory(); return; }
    renderAll();
    let actor;
    if (game.state.phase === "await-victim") actor = game.state.players[game.state.pending.chooser];
    else if (game.state.phase === "await-move") actor = game.state.players[game.state.pending.playerId];
    else actor = game.currentPlayer();

    if (actor.human) {
      const humanCount = game.state.players.filter((entry) => entry.human).length;
      if (humanCount > 1 && presentedHuman !== actor.id) {
        const special = game.state.phase === "await-victim";
        await showHandoff(actor, special ? "The Green Vampire must choose who receives the mask." : actor.status === "green-vampire" ? "The mask is yours. Hunt before you escape." : "Keep your route secret until the card opens.");
      }
      presentedHuman = actor.id;
      renderAll();
      return;
    }
    const delay = settings.fastAI ? 90 : 520;
    aiTimer = setTimeout(async () => {
      if (!game || busy) return;
      if (game.state.phase === "await-spin") await handleSpin();
      else if (game.state.phase === "await-move") await handleMove(game.chooseBestMove(game.state.pending.playerId));
      else if (game.state.phase === "await-victim") await handleVictim(game.chooseBestVictim());
    }, delay);
  }

  function setHandoffOpen(open) {
    dom.handoff.hidden = !open;
    if ("inert" in dom.gameScreen) dom.gameScreen.inert = open;
    if (open) dom.gameScreen.setAttribute("aria-hidden", "true");
    else dom.gameScreen.removeAttribute("aria-hidden");
    if (open) requestAnimationFrame(() => dom.handoffReady.focus({ preventScroll: true }));
  }

  function showHandoff(actor, copy) {
    dom.handoffTitle.textContent = `${actor.name}, the castle awaits`;
    dom.handoffCopy.textContent = copy;
    $$("dialog[open]").forEach(closeDialog);
    setHandoffOpen(true);
    return new Promise((resolve) => { handoffResolve = resolve; });
  }

  function finishHandoff() {
    setHandoffOpen(false);
    if (handoffResolve) {
      const resolve = handoffResolve;
      handoffResolve = null;
      resolve();
    }
    requestAnimationFrame(() => dom.commandPanel?.focus?.({ preventScroll: true }));
  }

  function toast(message) {
    const item = document.createElement("div"); item.className = "toast"; item.textContent = message; dom.toasts.append(item);
    setTimeout(() => { item.classList.add("out"); setTimeout(() => item.remove(), 280); }, 2600);
  }

  function startGame(config, seed) {
    game = new E.Game(config, seed); presentedHuman = null;
    dom.setup.hidden = true; dom.gameScreen.hidden = false; fitBoard(); updateOutcome(null); renderAll(); saveGame();
    requestAnimationFrame(() => dom.commandPanel && dom.commandPanel.focus && dom.commandPanel.focus({preventScroll:true}));
    maybeContinue();
  }

  function resumeGame() {
    const raw = storageGet(SAVE_KEY); if (!raw) return;
    try {
      game = E.Game.restore(raw); playerCount = game.state.players.length; presentedHuman = null;
      dom.setup.hidden = true; dom.gameScreen.hidden = false; fitBoard(); updateOutcome(game.state.spinner); renderAll(); maybeContinue();
    } catch (error) { clearSave(); toast("That saved night could not be opened."); console.error(error); }
  }

  function returnToSetup(force) {
    if (!force && game && game.state.winner == null && !confirmAction("Leave this castle? Your current night remains saved.")) return;
    clearTimeout(aiTimer);
    setHandoffOpen(false);
    handoffResolve = null;
    game = null; busy = false; dom.gameScreen.hidden = true; dom.setup.hidden = false; closeDialog(dom.victory); renderSetupSeats();
    if (typeof window.scrollTo === "function") window.scrollTo({top:0,behavior:prefersReducedMotion()?"auto":"smooth"});
  }

  function fitBoard() { view = {x:0,y:0,w:1000,h:800}; applyView(); }
  function applyView() { view.x=Math.max(0,Math.min(1000-view.w,view.x)); view.y=Math.max(0,Math.min(800-view.h,view.y)); dom.board.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`); }
  function zoom(factor, clientX, clientY) {
    const oldW=view.w, oldH=view.h; const newW=Math.max(360,Math.min(1000,oldW*factor)); const newH=newW*.8;
    const rect=dom.boardViewport.getBoundingClientRect(); const rx = clientX == null ? .5 : (clientX - rect.left) / rect.width; const ry = clientY == null ? .5 : (clientY - rect.top) / rect.height;
    view.x += (oldW-newW)*rx; view.y += (oldH-newH)*ry; view.w=newW; view.h=newH; applyView();
  }

  function setupPanZoom() {
    dom.boardViewport.addEventListener("pointerdown", (event) => { if (event.target.closest?.(".choice-target")) return; drag={id:event.pointerId,x:event.clientX,y:event.clientY,viewX:view.x,viewY:view.y,moved:false}; dom.boardViewport.setPointerCapture(event.pointerId); dom.boardViewport.classList.add("dragging"); });
    dom.boardViewport.addEventListener("pointermove", (event) => { if (!drag || drag.id!==event.pointerId) return; const rect=dom.boardViewport.getBoundingClientRect(); const dx=(event.clientX-drag.x)*view.w/rect.width, dy=(event.clientY-drag.y)*view.h/rect.height; if(Math.abs(dx)+Math.abs(dy)>3) drag.moved=true; view.x=drag.viewX-dx; view.y=drag.viewY-dy; applyView(); });
    const end=(event)=>{ if(!drag||drag.id!==event.pointerId)return; drag=null; dom.boardViewport.classList.remove("dragging"); };
    dom.boardViewport.addEventListener("pointerup",end); dom.boardViewport.addEventListener("pointercancel",end);
    dom.boardViewport.addEventListener("wheel",(event)=>{event.preventDefault();zoom(event.deltaY>0?1.12:.88,event.clientX,event.clientY);},{passive:false});
  }

  function bindEvents() {
    $$("button[data-count]", dom.playerCount).forEach((button) => button.addEventListener("click", () => {
      playerCount = Number(button.dataset.count); $$("button[data-count]", dom.playerCount).forEach((other)=>other.setAttribute("aria-pressed",String(other===button))); renderSetupSeats();
    }));
    dom.randomSeed.addEventListener("click", () => { dom.seed.value = String(randomUint32()); });
    dom.start.addEventListener("click", () => {
      audio.ensure();
      const players=seatConfig.slice(0,playerCount).map((entry,id)=>({name:entry.name.trim()||E.DEFAULT_NAMES[id],human:entry.human}));
      startGame({playerCount,players,hints:settings.hints}, Number(dom.seed.value)||1977);
    });
    dom.resume.addEventListener("click",()=>{audio.ensure();resumeGame();});
    dom.setupRules.addEventListener("click",()=>openDialog(dom.rules)); dom.rulesOpen.addEventListener("click",()=>openDialog(dom.rules)); dom.settingsOpen.addEventListener("click",()=>openDialog(dom.settings));
    dom.brand.addEventListener("click",()=>returnToSetup(false));
    dom.primary.addEventListener("click",handlePrimary); dom.spinnerButton.addEventListener("click",handlePrimary);
    dom.resolve.addEventListener("click", async () => {
      if (!game || busy) return;
      if (game.state.phase === "await-move") await handleMove(game.chooseBestMove(game.state.pending.playerId));
      else if (game.state.phase === "await-victim") await handleVictim(game.chooseBestVictim());
    });
    dom.fit.addEventListener("click",fitBoard); dom.zoomIn.addEventListener("click",()=>zoom(.8)); dom.zoomOut.addEventListener("click",()=>zoom(1.25));
    dom.soundToggle.addEventListener("click",()=>{settings.sound=!settings.sound;saveSettings();if(settings.sound)audio.ensure();});
    dom.settingSound.addEventListener("change",()=>{settings.sound=dom.settingSound.checked;saveSettings();}); dom.settingHints.addEventListener("change",()=>{settings.hints=dom.settingHints.checked;saveSettings();renderControls();}); dom.settingFastAI.addEventListener("change",()=>{settings.fastAI=dom.settingFastAI.checked;saveSettings();}); dom.settingContrast.addEventListener("change",()=>{settings.contrast=dom.settingContrast.checked;saveSettings();});
    dom.abandon.addEventListener("click",()=>{if(confirmAction("Abandon this night and erase its save?")){clearSave();closeDialog(dom.settings);returnToSetup(true);}});
    dom.newGame.addEventListener("click",()=>{closeDialog(dom.victory);clearSave();returnToSetup(true);});
    dom.handoffReady.addEventListener("click", finishHandoff);
    const ruleTabs = $$("[data-rule]", dom.rules);
    const activateRuleTab = (tab, focus = false) => {
      ruleTabs.forEach((other) => {
        const active = other === tab;
        other.setAttribute("aria-selected", String(active));
        other.tabIndex = active ? 0 : -1;
      });
      $$("[data-rule-page]", dom.rules).forEach((page) => { page.hidden = page.dataset.rulePage !== tab.dataset.rule; });
      if (focus) tab.focus();
    };
    ruleTabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateRuleTab(tab));
      tab.addEventListener("keydown", (event) => {
        let target = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") target = ruleTabs[(index + 1) % ruleTabs.length];
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") target = ruleTabs[(index - 1 + ruleTabs.length) % ruleTabs.length];
        if (event.key === "Home") target = ruleTabs[0];
        if (event.key === "End") target = ruleTabs[ruleTabs.length - 1];
        if (target) { event.preventDefault(); activateRuleTab(target, true); }
      });
    });
    activateRuleTab(ruleTabs[0]);
    document.addEventListener("keydown",(event)=>{
      if (dom.handoff.hidden === false) {
        if ($("dialog[open]")) return;
        if (event.key === "Tab") { event.preventDefault(); dom.handoffReady.focus({ preventScroll: true }); }
        if (event.key === "Escape" || event.key.toLowerCase() === "r") event.preventDefault();
        return;
      }
      if(event.key.toLowerCase()==="r"&&!event.metaKey&&!event.ctrlKey&&game&&game.state.phase==="await-spin"&&!busy&&displayedActor().human){event.preventDefault();handleSpin();}
    });
    setupPanZoom();
  }

  function init() {
    audio = new CastleAudio();
    renderSetupSeats(); buildSpinner(); buildBoard(); bindEvents(); applySettings();
    dom.resume.hidden = !storageGet(SAVE_KEY);
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  init();
})();
