import {
  MODES,
  SNAKES,
  CLASSIC_COLORS,
  DARK_COLORS,
  activeFace,
  assertState,
  canStack,
  chooseAiDecision,
  chooseAiMove,
  chooseColor,
  createGameState,
  createSeededRng,
  handScore,
  isPlayable,
  legalMoves,
  shuffle,
  topCard,
  transition,
} from "./engine.mjs";

const $ = (id) => document.getElementById(id);
const COLORS = {
  R: ["Red", "var(--red)"], Y: ["Yellow", "var(--yellow)"],
  G: ["Green", "var(--green)"], B: ["Blue", "var(--blue)"],
  P: ["Pink", "#ff4fa3"], T: ["Teal", "#12c7c1"],
  O: ["Orange", "#ff8a1f"], V: ["Purple", "#9b5de5"],
};
const GLYPHS = {
  skip: "⊘", reverse: "⇄", draw1: "+1", draw2: "+2", draw5: "+5",
  skipEveryone: "⊘ALL", flip: "↯", wild: "✦", wildDraw2: "+2",
  wildDraw4: "+4", wildDrawColor: "🎨",
};
const HUES = { cobra: 315, python: 0, mamba: 200, viper: 60, boa: 250, adder: 160, anaconda: 30, sidewinder: 110, rattler: 340, taipan: 90 };

let selectedMode = "classic";
let game = null;
let playerTemplates = [];
let scores = [0, 0, 0, 0];
let round = 1;
let dealer = 3;
let generation = 0;
let phase = "splash";
let fast = false;
let rng = Math.random;
// Storage access can throw when the browser blocks it (all-cookies-blocked, sandboxed
// iframe). Guard it so the game still loads with sound simply defaulting on, rather than
// throwing at module top level and rendering a blank page.
function readStored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function writeStored(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ } }
let soundOn = readStored("onu.sound") !== "off";
let humanOnuIntent = false;
let uiResolve = null;
let reactionResolve = null;
let modalCancel = null;
let modalOpen = false;
let reactionOpen = false;
const sleepHandles = new Map();
const openTells = new Set();

function alive(g) { return g === generation; }
function duration(ms) { return fast ? Math.min(ms, 12) : ms; }

function sleep(ms, g = generation) {
  return new Promise((resolve) => {
    const handle = setTimeout(() => {
      sleepHandles.delete(handle);
      resolve(alive(g));
    }, duration(ms));
    sleepHandles.set(handle, resolve);
  });
}

function cancelSession() {
  generation += 1;
  for (const [handle, resolve] of sleepHandles) {
    clearTimeout(handle);
    resolve(false);
  }
  sleepHandles.clear();
  uiResolve?.({ type: "cancel" });
  uiResolve = null;
  reactionResolve?.("cancel");
  reactionResolve = null;
  modalCancel?.();
  modalCancel = null;
  reactionOpen = false;
  modalOpen = false;
  $("cop")?.classList.remove("show");
}

// ---------- sound -----------------------------------------------------------
let audioContext = null;
function audio() {
  if (!audioContext) {
    try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function tone(frequency, seconds = .08, type = "triangle", gain = .07, delay = 0) {
  const context = audio();
  if (!context || !soundOn) return;
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  const at = context.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  volume.gain.setValueAtTime(.0001, at);
  volume.gain.exponentialRampToValueAtTime(gain, at + .015);
  volume.gain.exponentialRampToValueAtTime(.0001, at + seconds);
  oscillator.connect(volume); volume.connect(context.destination);
  oscillator.start(at); oscillator.stop(at + seconds + .03);
}

function sound(name) {
  if (name === "play") { tone(700); tone(1100, .05, "triangle", .05, .03); }
  else if (name === "draw") tone(280, .1, "triangle", .08);
  else if (name === "onu") { tone(660, .12, "square", .08); tone(990, .14, "square", .08, .1); }
  else if (name === "penalty") { tone(210, .16, "sawtooth", .08); tone(150, .2, "sawtooth", .08, .14); }
  else if (name === "win") [523, 659, 784, 1047].forEach((f, i) => tone(f, .2, "triangle", .1, i * .12));
  else tone(520, .07, "square", .05);
}

// ---------- cards and rendering --------------------------------------------
function colorName(color) { return COLORS[color]?.[0] ?? "Wild"; }
function glyph(face) { return GLYPHS[face.symbol] ?? face.symbol; }
function faceName(face) {
  const names = {
    skip: "Skip", reverse: "Reverse", draw1: "Draw One", draw2: "Draw Two",
    draw5: "Draw Five", skipEveryone: "Skip Everyone", flip: "Flip",
    wild: "Wild", wildDraw2: "Wild Draw Two", wildDraw4: "Wild Draw Four",
    wildDrawColor: "Wild Draw Colour",
  };
  return `${face.color === "W" ? "" : `${colorName(face.color)} `}${names[face.symbol] ?? face.symbol}`.trim();
}

function cardElement(card, { back = false, interactive = false } = {}) {
  const element = interactive ? document.createElement("button") : document.createElement("div");
  element.className = "card";
  if (interactive) element.type = "button";
  if (back) {
    element.classList.add("back");
    element.setAttribute("aria-label", "Face-down card");
    element.innerHTML = '<div class="bg"><div class="oval"></div></div><div class="val">!</div>';
    return element;
  }
  const face = activeFace(card, game);
  const mark = glyph(face);
  element.classList.add(`c${face.color}`);
  if ([...mark].length >= 3) element.classList.add("wideMark");
  if (face.color === "W" && game?.mode === "flip" && game.side === "dark") element.classList.add("wDark");
  element.dataset.cardId = card.id;
  element.setAttribute("aria-label", faceName(face));
  element.innerHTML = `<div class="bg"><div class="oval"></div></div><div class="val">${mark}</div><span class="idx tl">${mark}</span><span class="idx br">${mark}</span>`;
  return element;
}

function snakeFor(player) { return SNAKES.find((snake) => snake.id === player.profile); }
function avatar(player) {
  if (player.human) return "🙂";
  return `<span style="filter:hue-rotate(${HUES[player.profile] ?? 0}deg)">🐍</span>`;
}

function renderScores() {
  if (!game) { $("scores").replaceChildren(); return; }
  $("scores").innerHTML = game.players.map((player, index) =>
    `<span class="scorechip">${avatar(player)} ${player.name} <b>${scores[index]}</b></span>`).join("");
}

function renderOpponents() {
  const row = $("oppRow");
  row.replaceChildren();
  if (!game) return;
  for (let index = 1; index < game.players.length; index += 1) {
    const player = game.players[index];
    const snake = snakeFor(player);
    const seat = document.createElement("section");
    seat.className = `opp${game.turn === index && game.winner == null ? " active" : ""}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "personalityBtn";
    button.setAttribute("aria-expanded", openTells.has(index) ? "true" : "false");
    button.setAttribute("aria-label", `${player.name}, ${snake.epithet}. ${openTells.has(index) ? "Hide" : "Show"} playing style`);
    button.disabled = reactionOpen;
    button.innerHTML = `<span class="avatar" style="filter:hue-rotate(${HUES[player.profile] ?? 0}deg)">🐍</span><span class="nm">${player.name}</span><span class="epithet">${snake.epithet}</span>`;
    button.addEventListener("click", () => {
      openTells.has(index) ? openTells.delete(index) : openTells.add(index);
      renderOpponents();
    });
    seat.appendChild(button);
    if (openTells.has(index)) {
      const tell = document.createElement("div");
      tell.className = "tell";
      tell.textContent = snake.tell;
      seat.appendChild(tell);
    }
    const fan = document.createElement("div");
    fan.className = "fan";
    for (let n = 0; n < Math.min(player.hand.length, 9); n += 1) {
      const mini = document.createElement("span"); mini.className = "mini"; fan.appendChild(mini);
    }
    seat.appendChild(fan);
    const count = document.createElement("div");
    count.className = "cnt"; count.textContent = `${player.hand.length} ${player.hand.length === 1 ? "card" : "cards"}`;
    seat.appendChild(count);
    if (player.hand.length === 1 && player.saidOnu) {
      const flag = document.createElement("div"); flag.className = "unoflag"; flag.textContent = "ONU!"; seat.appendChild(flag);
    }
    row.appendChild(seat);
  }
}

function renderPiles() {
  const draw = $("drawPile");
  draw.replaceChildren();
  for (let n = 0; n < 3; n += 1) {
    const layer = document.createElement("span"); layer.className = "layer";
    layer.appendChild(cardElement(null, { back: true })); draw.appendChild(layer);
  }
  draw.classList.toggle("canDraw", phase === "human");
  draw.disabled = phase !== "human";
  $("deckCnt").textContent = game ? `${game.drawPile.length} in deck` : "";
  const discard = $("discard");
  discard.querySelectorAll(".card").forEach((node) => node.remove());
  if (!game) return;
  game.discardPile.slice(-5).forEach((card, index) => {
    const element = cardElement(card);
    element.style.transform = `rotate(${(index - 2) * 3}deg)`;
    discard.insertBefore(element, $("colorHalo"));
  });
  const color = COLORS[game.currentColor]?.[1];
  $("colorHalo").style.boxShadow = color ? `0 0 26px 8px ${color}, inset 0 0 18px ${color}` : "none";
  $("dirChip").textContent = game.direction === 1 ? "⟳" : "⟲";
  const side = game.mode === "flip" ? ` · ${game.side.toUpperCase()} SIDE` : "";
  $("tableInfo").textContent = `${MODES[game.mode].name.toUpperCase()}${side} · ${game.currentColor ? colorName(game.currentColor).toUpperCase() : "CHOOSE COLOUR"} · ROUND ${round}`;
}

function renderHand() {
  const hand = $("hand");
  hand.replaceChildren();
  if (!game) return;
  game.players[0].hand.forEach((card) => {
    const element = cardElement(card, { interactive: true });
    const playable = isPlayable(card, game);
    if (phase === "human" && playable) element.classList.add("playable");
    else if (phase === "human") element.classList.add("dull");
    if (card.id === game.drawnCardId) element.classList.add("justDrawn");
    element.disabled = phase !== "human";
    element.addEventListener("click", () => {
      if (phase !== "human") return;
      if (!playable) { element.classList.add("wiggle"); sound("penalty"); say("Match the colour or symbol."); return; }
      humanAction({ type: "play", playerIndex: 0, cardId: card.id, saidOnu: humanOnuIntent });
    });
    hand.appendChild(element);
  });
}

function renderActions() {
  if (!game) return;
  const canCall = (phase === "human" || phase === "drawn") && game.players[0].hand.length === 2 && !humanOnuIntent;
  $("onuBtn").classList.toggle("hidden", !canCall);
  $("drawnBar").classList.toggle("hidden", phase !== "drawn");
  if (!reactionOpen) {
    $("gotchaBtn").classList.add("hidden");
    $("jumpBtn").classList.add("hidden");
  }
}

function render() {
  renderScores(); renderOpponents(); renderPiles(); renderHand(); renderActions();
}

function say(text, css = "") {
  $("status").textContent = text;
  $("status").className = css;
}

function copSay(text) {
  $("copMsg").textContent = text;
  $("cop").classList.add("show");
  const g = generation;
  sleep(8000, g).then((valid) => { if (valid) $("cop").classList.remove("show"); });
}

function announceReaction(text) {
  const node = document.createElement("div");
  node.className = "visuallyHidden";
  node.setAttribute("role", "alert");
  node.textContent = text;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 1000);
}

// ---------- dialogs ---------------------------------------------------------
function askDialog({ title, body = "", buttons, safe = 0 }) {
  const previous = document.activeElement;
  modalOpen = true;
  $("newBtn").disabled = true;
  $("rulesBtn").disabled = true;
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.id = "modalWrap";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "modalTitle");
    const modal = document.createElement("div"); modal.className = "modal";
    const heading = document.createElement("h2"); heading.id = "modalTitle"; heading.textContent = title;
    const content = document.createElement("div"); content.innerHTML = body;
    const row = document.createElement("div"); row.className = "btnrow";
    modal.append(heading, content, row); wrap.appendChild(modal); document.body.appendChild(wrap);
    const finish = (value) => {
      wrap.remove(); modalOpen = false; modalCancel = null;
      $("newBtn").disabled = reactionOpen;
      $("rulesBtn").disabled = reactionOpen;
      previous?.focus?.(); resolve(value);
    };
    modalCancel = () => finish(null);
    buttons.forEach((choice, index) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "bigbtn"; button.textContent = choice.label;
      button.style.background = choice.kind === "danger" ? "linear-gradient(160deg,var(--red),var(--red2))" :
        choice.kind === "quiet" ? "linear-gradient(160deg,#666,#333)" : "linear-gradient(160deg,var(--green),var(--green2))";
      button.addEventListener("click", () => finish(choice.value)); row.appendChild(button);
      if (index === safe) queueMicrotask(() => button.focus());
    });
    wrap.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const controls = [...row.querySelectorAll("button")];
      if (!controls.length) return;
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  });
}

async function pickColor(playerIndex) {
  const colors = game.mode === "flip" && game.side === "dark" ? DARK_COLORS : CLASSIC_COLORS;
  if (playerIndex !== 0) return chooseColor(game.players[playerIndex].hand, game.players[playerIndex].profile, game);
  return askDialog({
    title: "Pick a colour",
    body: '<p>Choose the colour that continues play.</p><div class="colorpick" id="colorChoices"></div>',
    buttons: colors.map((color) => ({ label: colorName(color), value: color })),
  });
}

async function pickTarget(request) {
  if (request.playerIndex !== 0) return request.targets.reduce((best, index) => game.players[index].hand.length < game.players[best].hand.length ? index : best, request.targets[0]);
  return askDialog({
    title: "Swap hands with whom?",
    body: "<p>The whole hand—and its Onu declaration—moves.</p>",
    buttons: request.targets.map((index) => ({ label: `${game.players[index].name} (${game.players[index].hand.length})`, value: index })),
  });
}

function rulesBody() {
  const common = "<li>Match colour or symbol. Draw if you do not play.</li><li>Call <b>ONU</b> when your play leaves one card; getting caught costs two.</li><li>The first player to 500 points wins.</li>";
  if (game?.mode === "flip") return `<ul>${common}<li>Flip cards reverse both piles and reveal the other face.</li><li>Light: Draw One and restricted Wild Draw Two. Dark: Draw Five, Skip Everyone and restricted Wild Draw Colour.</li><li>Restricted wild draws may be challenged.</li></ul>`;
  if (game?.mode === "chaos") return `<ul>${common}<li><b>House rules:</b> same-type draw stacking, 7 hand swaps, 0 hand rotation, exact-card Jump-In and Draw-to-Match.</li><li>Wild draws remain restricted and challengeable. Effects resolve before Jump-In.</li></ul>`;
  return `<ul>${common}<li>Skip, Reverse and Draw Two resolve immediately. No stacking.</li><li>Wild Draw Four is legal only without the current colour and may be challenged.</li></ul>`;
}

// ---------- authoritative commands -----------------------------------------
async function applyCommand(command, g = generation) {
  if (!alive(g)) return;
  let result;
  try { result = transition(game, command, rng); }
  catch (error) { say(error.message); sound("penalty"); return; }
  game = result.gameState;
  assertState(game);
  render();
  for (const event of result.events) {
    if (!alive(g)) return;
    if (["play", "jump", "stack"].includes(event.type)) sound("play");
    if (["draw", "drawColor", "caught"].includes(event.type)) sound(event.type === "caught" ? "penalty" : "draw");
    if (event.type === "caught") {
      const message = `${game.players[event.playerIndex].name} was caught and draws two!`;
      say(message); copSay(`${message} Procedure matters, citizens.`);
    }
    else if (event.type === "drawColor") say(`${game.players[event.playerIndex].name} draws ${event.count}${event.exhausted ? " — that colour is exhausted" : ""}.`);
    else if (event.type === "draw") say(`${game.players[event.playerIndex].name} draws ${event.count}.`);
    await sleep(180, g);
  }
  if (!alive(g)) return;
  if (result.request) {
    if (!(await waitForModal(g))) return;
    await handleRequest(result.request, command, g);
  }
}

async function handleRequest(request, sourceCommand, g) {
  if (!alive(g)) return;
  if (request.type === "chooseColor") {
    const color = await pickColor(request.playerIndex);
    if (color && alive(g)) await applyCommand({ ...sourceCommand, color }, g);
  } else if (request.type === "chooseTarget") {
    const target = await pickTarget(request);
    if (target != null && alive(g)) await applyCommand({ ...sourceCommand, target }, g);
  } else if (request.type === "playDrawn") await handleDrawn(request, g);
  else if (request.type === "penaltyResponse") await handlePenalty(request, g);
  else if (request.type === "catch") await handleCatch(request, g);
  else if (request.type === "jump") await handleJump(request, g);
}

async function handleDrawn(request, g) {
  const player = game.players[request.playerIndex];
  let play;
  if (player.human) {
    phase = "drawn"; render(); say("Play the drawn card, or keep it?");
    const action = await waitForHuman();
    play = action?.type === "playDrawn";
  } else play = chooseAiDecision("playDrawn", game, request.playerIndex, player.profile, rng);
  if (!alive(g)) return;
  if (play) await applyCommand({
    type: "play", playerIndex: request.playerIndex, cardId: request.cardId,
    saidOnu: player.hand.length === 2 && (player.human ? humanOnuIntent : chooseAiDecision("callOnu", game, request.playerIndex, player.profile, rng)),
  }, g);
  else await applyCommand({ type: "keepDrawn", playerIndex: request.playerIndex }, g);
}

async function handlePenalty(request, g) {
  const player = game.players[request.playerIndex];
  let choice;
  if (player.human) {
    const labels = { challenge: "Challenge", stack: "Stack it", accept: `Draw ${request.amount}` };
    choice = await askDialog({
      title: `Penalty: ${request.amount} cards`,
      body: `<p>${request.options.includes("challenge") ? "Challenge the latest restricted wild, " : ""}${request.options.includes("stack") ? "stack the same draw type, " : ""}or accept the penalty.</p>`,
      buttons: request.options.map((value) => ({ label: labels[value], value, kind: value === "accept" ? "quiet" : "" })),
      safe: request.options.indexOf("accept"),
    });
  } else {
    if (request.options.includes("challenge") && chooseAiDecision("challenge", game, request.playerIndex, player.profile, rng)) choice = "challenge";
    else if (request.options.includes("stack") && rng() < .7) choice = "stack";
    else choice = "accept";
  }
  if (!alive(g)) return;
  if (choice === "challenge") await applyCommand({ type: "challenge", playerIndex: request.playerIndex, challenge: true }, g);
  else if (choice === "stack") {
    const eligible = player.hand.filter((card) => canStack(card, game.pendingStack, game));
    let card = eligible[0];
    if (player.human && eligible.length > 1) {
      const id = await askDialog({ title: "Choose a card to stack", buttons: eligible.map((item) => ({ label: faceName(activeFace(item, game)), value: item.id })) });
      card = eligible.find((item) => item.id === id);
    }
    let saidOnu = false;
    if (card && player.hand.length === 2) {
      saidOnu = player.human
        ? await askDialog({
          title: "Call Onu with the stack?",
          body: "<p>Your stack leaves one card. Call Onu now or risk being caught after the penalty resolves.</p>",
          buttons: [{ label: "Call ONU", value: true }, { label: "Stack silently", value: false, kind: "quiet" }],
        })
        : chooseAiDecision("callOnu", game, request.playerIndex, player.profile, rng);
    }
    if (!alive(g)) return;
    if (card) await applyCommand({ type: "stack", playerIndex: request.playerIndex, cardId: card.id, saidOnu }, g);
    else await applyCommand({ type: "acceptPenalty", playerIndex: request.playerIndex }, g);
  } else await applyCommand({ type: "acceptPenalty", playerIndex: request.playerIndex }, g);
}

function waitForReaction(kind, milliseconds, g) {
  reactionOpen = true;
  $("newBtn").disabled = true;
  $("rulesBtn").disabled = true;
  renderOpponents();
  announceReaction(kind === "jump" ? "Jump-In window open" : "Onu catch window open");
  return new Promise((resolve) => {
    let remaining = fast ? 30 : milliseconds;
    let previous = performance.now();
    const interval = setInterval(() => {
      if (!alive(g)) return finish("cancel");
      const now = performance.now();
      if (!document.hidden && !modalOpen) remaining -= now - previous;
      previous = now;
      if (kind === "jump") $("jumpTime").textContent = `${Math.max(0, remaining / 1000).toFixed(1)}s`;
      if (remaining <= 0) finish("timeout");
    }, fast ? 5 : 50);
    const finish = (value) => {
      clearInterval(interval);
      reactionResolve = null; reactionOpen = false; $("newBtn").disabled = modalOpen;
      $("rulesBtn").disabled = modalOpen;
      $("gotchaBtn").classList.add("hidden"); $("jumpBtn").classList.add("hidden"); $("onuBtn").classList.add("hidden");
      announceReaction(kind === "jump" ? "Jump-In window closed" : "Onu catch window closed");
      renderOpponents(); resolve(value);
    };
    reactionResolve = finish;
  });
}

async function handleCatch(request, g) {
  const offender = request.playerIndex;
  if (offender === 0) {
    $("onuBtn").classList.remove("hidden");
    say("Call ONU before a snake catches you!");
    const outcome = await waitForReaction("catch", 2300, g);
    if (!alive(g)) return;
    await applyCommand({ type: outcome === "call" ? "callOnu" : "catch", playerIndex: offender }, g);
  } else {
    $("gotchaBtn").classList.remove("hidden");
    say(`${game.players[offender].name} forgot ONU — catch them!`);
    const selfCalls = chooseAiDecision("callOnu", game, offender, game.players[offender].profile, rng);
    const outcome = await waitForReaction("catch", selfCalls ? 1300 : 2500, g);
    if (!alive(g)) return;
    if (outcome === "catch") await applyCommand({ type: "catch", playerIndex: offender }, g);
    else if (selfCalls) await applyCommand({ type: "callOnu", playerIndex: offender }, g);
    else await applyCommand({ type: "passCatch", playerIndex: offender }, g);
  }
}

async function handleJump(request, g) {
  const candidate = request.candidates[0];
  if (!candidate) { await applyCommand({ type: "passJump" }, g); return; }
  const player = game.players[candidate.playerIndex];
  if (player.human) {
    $("jumpBtn").classList.remove("hidden");
    say(`Exact match! Press J or JUMP IN with ${faceName(activeFace(player.hand[candidate.cardIndex], game))}.`);
    const outcome = await waitForReaction("jump", 2600, g);
    if (!alive(g)) return;
    if (outcome === "jump") await applyCommand({ type: "jump", playerIndex: candidate.playerIndex, cardId: candidate.cardId, saidOnu: player.hand.length === 2 && humanOnuIntent }, g);
    else await applyCommand({ type: "passJump" }, g);
  } else {
    const jumps = chooseAiDecision("jump", game, candidate.playerIndex, player.profile, rng);
    if (jumps) {
      say(`${player.name} is poised to Jump-In…`);
      const outcome = await waitForReaction("jump", chooseAiDecision("jumpDelay", game, candidate.playerIndex, player.profile, rng), g);
      if (alive(g) && outcome === "timeout") await applyCommand({ type: "jump", playerIndex: candidate.playerIndex, cardId: candidate.cardId, saidOnu: player.hand.length === 2 && chooseAiDecision("callOnu", game, candidate.playerIndex, player.profile, rng) }, g);
    } else await applyCommand({ type: "passJump" }, g);
  }
}

// ---------- turn and match loops --------------------------------------------
function humanAction(action) {
  if (!uiResolve) return;
  const resolve = uiResolve; uiResolve = null; resolve(action);
}
function waitForHuman() { return new Promise((resolve) => { uiResolve = resolve; }); }

async function waitForModal(g) {
  while (modalOpen && alive(g)) await sleep(50, g);
  return alive(g);
}

async function runRound(g) {
  while (alive(g)) {
    if (game.roundVoid) { await voidRound(g); return; }
    if (game.winner != null) { await finishRound(g); return; }
    if (!(await waitForModal(g))) return;
    const player = game.players[game.turn];
    if (player.human) {
      phase = "human"; humanOnuIntent = false; render();
      say("YOUR TURN — play a glowing card, or draw", "turn");
      const action = await waitForHuman();
      if (!alive(g) || action?.type === "cancel") return;
      phase = "busy"; render();
      await applyCommand(action, g);
    } else {
      phase = "busy"; render(); say(`${player.name} is considering ${snakeFor(player).epithet.toLowerCase()} tactics…`);
      if (!(await sleep(700 + rng() * 700, g)) || !(await waitForModal(g))) return;
      const move = chooseAiMove(game, game.turn, player.profile, rng);
      if (move) await applyCommand({ type: "play", playerIndex: game.turn, cardId: move.cardId, color: move.color, target: move.target, saidOnu: player.hand.length === 2 && chooseAiDecision("callOnu", game, game.turn, player.profile, rng) }, g);
      else await applyCommand({ type: "draw", playerIndex: game.turn }, g);
    }
  }
}

function newPlayers() {
  const pit = shuffle(SNAKES, rng).slice(0, 3);
  return [{ name: "You", human: true }, ...pit.map((snake) => ({ name: snake.name, profile: snake.id, human: false }))];
}

async function startRound() {
  const g = generation;
  game = createGameState({ mode: selectedMode, players: playerTemplates, dealer, rng });
  if (game.pendingRequest?.type === "chooseColor") {
    const playerIndex = game.pendingRequest.playerIndex;
    const color = await pickColor(playerIndex);
    if (!alive(g) || !color) return;
    const result = transition(game, { type: "chooseStarterColor", playerIndex, color }, rng);
    game = result.gameState;
  }
  phase = "busy"; render(); say(`Round ${round} — ${MODES[selectedMode].name}`);
  if (round === 1) copSay(selectedMode === "chaos" ? "Authorised anarchy is now in force. Four house rules, one orderly queue for reactions." : selectedMode === "flip" ? "Light side first. When a Flip lands, both piles turn over and the Dark rules take charge." : "Classic rules are in force. No stacking, and restricted wild draws remain challengeable.");
  await sleep(250, g);
  if (alive(g)) runRound(g);
}

async function startMatch(mode = selectedMode, seed) {
  cancelSession();
  selectedMode = mode;
  rng = seed == null ? Math.random : createSeededRng(seed);
  scores = [0, 0, 0, 0]; round = 1; dealer = 3; playerTemplates = newPlayers();
  $("splash").classList.add("hidden");
  await startRound();
}

async function finishRound(g) {
  phase = "idle"; render();
  const winner = game.winner;
  const points = game.players.reduce((total, player, index) => index === winner ? total : total + handScore(player.hand, game), 0);
  scores[winner] += points; renderScores();
  if (winner === 0) sound("win"); else sound("penalty");
  const matchOver = scores[winner] >= 500;
  const body = `<p><b>${game.players[winner].name}</b> scores <b>${points}</b> points.</p><p>Match total: <b>${scores[winner]}</b> / 500.</p>`;
  await askDialog({ title: matchOver ? `${game.players[winner].name} wins the match!` : `${game.players[winner].name} wins round ${round}`, body, buttons: [{ label: matchOver ? "New match" : "Next round", value: true }] });
  if (!alive(g)) return;
  if (matchOver) await startMatch(selectedMode);
  else { round += 1; dealer = (dealer + 1) % 4; await startRound(); }
}

async function voidRound(g) {
  phase = "idle"; render();
  await askDialog({ title: "Round void", body: "<p>A full lap passed with no playable or drawable card. No points: reshuffle and redeal.</p>", buttons: [{ label: "Redeal", value: true }] });
  if (alive(g)) { dealer = (dealer + 1) % 4; await startRound(); }
}

function showChooser() {
  cancelSession(); game = null; phase = "splash"; render();
  $("splash").classList.remove("hidden");
}

// ---------- controls --------------------------------------------------------
document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
  selectedMode = button.dataset.mode;
  document.querySelectorAll("[data-mode]").forEach((item) => item.setAttribute("aria-pressed", item === button ? "true" : "false"));
}));
$("startBtn").addEventListener("click", () => { audio(); startMatch(selectedMode); });
$("drawPile").addEventListener("click", () => { if (phase === "human") { humanOnuIntent = false; humanAction({ type: "draw", playerIndex: 0 }); } });
$("onuBtn").addEventListener("click", () => {
  if (reactionOpen && game?.catchPlayer === 0) reactionResolve?.("call");
  else if ((phase === "human" || phase === "drawn") && game?.players[0].hand.length === 2) { humanOnuIntent = true; sound("onu"); say("ONU armed — now play your card!", "turn"); renderActions(); }
});
$("gotchaBtn").addEventListener("click", () => reactionResolve?.("catch"));
$("jumpBtn").addEventListener("click", () => reactionResolve?.("jump"));
$("playDrawnBtn").addEventListener("click", () => humanAction({ type: "playDrawn" }));
$("keepBtn").addEventListener("click", () => humanAction({ type: "keepDrawn" }));
$("rulesBtn").addEventListener("click", () => askDialog({ title: `${game ? MODES[game.mode].name : "Onu"} rules`, body: rulesBody(), buttons: [{ label: "Understood", value: true }] }));
$("sndBtn").addEventListener("click", () => {
  soundOn = !soundOn; writeStored("onu.sound", soundOn ? "on" : "off");
  $("sndBtn").textContent = soundOn ? "🔊" : "🔇"; if (soundOn) sound("pop");
});
$("newBtn").addEventListener("click", async () => {
  if (reactionOpen || modalOpen) return;
  const choice = await askDialog({
    title: "New match?",
    body: `<p>Current table: <b>${game ? MODES[game.mode].name : MODES[selectedMode].name}</b>. Scores reset only after confirmation.</p>`,
    buttons: [
      { label: "Keep playing", value: "keep", kind: "quiet" },
      { label: "Rematch", value: "rematch" },
      { label: "Change mode", value: "mode", kind: "danger" },
    ],
    safe: 0,
  });
  if (choice === "rematch") startMatch(selectedMode);
  else if (choice === "mode") showChooser();
});
$("copDismiss").addEventListener("click", () => $("cop").classList.remove("show"));
document.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && document.activeElement?.matches("button")) {
    event.preventDefault();
    document.activeElement.click();
    return;
  }
  if ((event.key === "j" || event.key === "J") && reactionOpen && !$("jumpBtn").classList.contains("hidden")) reactionResolve?.("jump");
});

$("sndBtn").textContent = soundOn ? "🔊" : "🔇";
render();

window.__onu = {
  get state() { return game; },
  get phase() { return phase; },
  get mode() { return selectedMode; },
  get scores() { return scores.slice(); },
  startMode(mode, seed = 1) { return startMatch(mode, seed); },
  command(command) { return applyCommand(command, generation); },
  cancel() { cancelSession(); },
  fast(value = true) { fast = value; },
  snapshot() { return game ? structuredClone(game) : null; },
  _loadFixture(nextGame, { request = null, seed = 1 } = {}) {
    cancelSession();
    game = structuredClone(nextGame);
    assertState(game);
    selectedMode = game.mode;
    rng = createSeededRng(seed);
    scores = [0, 0, 0, 0]; round = 1; dealer = game.dealer;
    playerTemplates = game.players.map(({ name, human, profile }) => ({ name, human, profile }));
    phase = "busy";
    $("splash").classList.add("hidden");
    render();
    const g = generation;
    queueMicrotask(() => request ? handleRequest(request, {}, g) : runRound(g));
  },
};
