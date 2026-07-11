/**
 * Pure rules and snake AI for Onu. There are no DOM, timer, or storage calls here.
 * All rule-state mutation goes through transition(); the smaller exported helpers
 * exist so the browser can render choices and the tests can name rules directly.
 */

export const MODES = Object.freeze({
  classic: Object.freeze({ id: "classic", name: "Classic Onu", deck: "classic", targetScore: 500, drawToMatch: false }),
  flip: Object.freeze({ id: "flip", name: "Onu Flip", deck: "flip", targetScore: 500, drawToMatch: false }),
  chaos: Object.freeze({ id: "chaos", name: "Onu Chaos", deck: "classic", targetScore: 500, drawToMatch: true }),
});

const profile = (id, name, epithet, tell, weights) => Object.freeze({
  id, name, epithet, tell,
  weights: Object.freeze({
    attack: 0, wildHoard: 0, highShed: 0, bluff: .12, challenge: .28,
    colorControl: 0, exact: 0, conservative: 0, redirect: 0, variance: .15,
    tactical: 0, onu: .85, jump: .45, jumpDelay: 1300, drawPlay: .95, ...weights,
  }),
});

export const SNAKES = Object.freeze([
  profile("cobra", "Cobra", "The Striker", "Strikes hardest when the next player is nearly out.", { attack: 12, jump: .62, jumpDelay: 850 }),
  profile("python", "Python", "The Squeezer", "Keeps wilds coiled away and squeezes one long colour.", { wildHoard: 13, colorControl: 5 }),
  profile("mamba", "Mamba", "The Closer", "Sheds expensive cards and lunges for a finishing line.", { highShed: 1.1, drawPlay: .99 }),
  profile("viper", "Viper", "The Bluffer", "Bluffs restricted wilds and calls other snakes' bluffs.", { bluff: .55, challenge: .72 }),
  profile("boa", "Boa", "The Colourist", "Chooses the colour that leaves the longest follow-up run.", { colorControl: 11 }),
  profile("adder", "Adder", "The Ambusher", "Likes exact matches and pounces fastest in Chaos.", { exact: 10, jump: .92, jumpDelay: 420 }),
  profile("anaconda", "Anaconda", "The Accountant", "Makes legal, low-risk plays and protects the score sheet.", { conservative: 12, bluff: .02, challenge: .16, jumpDelay: 1750 }),
  profile("sidewinder", "Sidewinder", "The Dodger", "Redirects danger with skips and reverses.", { redirect: 13 }),
  profile("rattler", "Rattler", "The Gambler", "Rattles into high-variance choices and bold challenges.", { variance: 5, challenge: .58, bluff: .32 }),
  profile("taipan", "Taipan", "The Tactician", "Tracks hand sizes and turn order before committing.", { tactical: 14, onu: .97 }),
]);

export const CLASSIC_COLORS = Object.freeze(["R", "Y", "G", "B"]);
export const LIGHT_COLORS = Object.freeze(["R", "Y", "G", "B"]);
export const DARK_COLORS = Object.freeze(["P", "T", "O", "V"]);

const points = Object.freeze({
  skip: 20, reverse: 20, draw2: 20, wild: 50, wildDraw4: 50,
  draw1: 10, flip: 20, wildDraw2: 50,
  draw5: 30, skipEveryone: 30, wildDrawColor: 60,
});

const face = (color, symbol, pointOverride) => ({
  color,
  symbol,
  points: pointOverride ?? (/^\d+$/.test(symbol) ? Number(symbol) : points[symbol]),
});

const flipPoints = Object.freeze({
  draw1: 10, draw5: 20, reverse: 20, skip: 20, skipEveryone: 30,
  flip: 20, wild: 40, wildDraw2: 50, wildDrawColor: 60,
});

export function createSeededRng(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let n = value;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export function shuffle(cards, rng = Math.random) {
  const result = cards.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function classicFaces() {
  const faces = [];
  for (const color of CLASSIC_COLORS) {
    faces.push(face(color, "0"));
    for (const symbol of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"])
      faces.push(face(color, symbol), face(color, symbol));
  }
  for (let i = 0; i < 4; i++) faces.push(face("W", "wild"), face("W", "wildDraw4"));
  return faces;
}

function flipFaces(colors, actionSymbols, wildSymbol) {
  const faces = [];
  for (const color of colors) {
    for (let n = 1; n <= 9; n++) faces.push(face(color, String(n)), face(color, String(n)));
    for (const symbol of actionSymbols) faces.push(face(color, symbol, flipPoints[symbol]), face(color, symbol, flipPoints[symbol]));
  }
  for (let i = 0; i < 4; i++) faces.push(face("W", "wild", flipPoints.wild), face("W", wildSymbol, flipPoints[wildSymbol]));
  return faces;
}

/** Return a shuffled 108-card Classic/Chaos deck. */
export function buildClassicDeck(rng = Math.random) {
  return shuffle(classicFaces().map((classic, i) => ({ id: `c${i + 1}`, faces: { classic } })), rng);
}

/** Return 112 stable physical pairs, shuffled without separating their faces. */
export function buildFlipDeck(rng = Math.random) {
  const light = flipFaces(LIGHT_COLORS, ["draw1", "reverse", "skip", "flip"], "wildDraw2");
  const dark = flipFaces(DARK_COLORS, ["draw5", "reverse", "skipEveryone", "flip"], "wildDrawColor");
  return shuffle(light.map((lightFace, i) => ({ id: `f${i + 1}`, faces: { light: lightFace, dark: dark[i] } })), rng);
}

export function activeFace(card, modeOrState = "classic", side) {
  if (!card) return null;
  const mode = typeof modeOrState === "string" ? modeOrState : modeOrState.mode;
  const activeSide = side ?? (typeof modeOrState === "object" ? modeOrState.side : "light");
  return mode === "flip" ? card.faces[activeSide] : card.faces.classic;
}

export function cardScore(card, stateOrMode = "classic", side) {
  return activeFace(card, stateOrMode, side)?.points ?? 0;
}

export function handScore(hand, stateOrMode = "classic", side) {
  return hand.reduce((total, card) => total + cardScore(card, stateOrMode, side), 0);
}

export function topCard(state) { return state.discardPile.at(-1) ?? null; }

export function isPlayable(card, state) {
  const candidate = activeFace(card, state);
  const top = activeFace(topCard(state), state);
  if (!candidate || !top) return false;
  return candidate.color === "W" || candidate.color === state.currentColor ||
    (top.color !== "W" && candidate.symbol === top.symbol);
}

export function legalMoves(state, playerIndex = state.turn) {
  return state.players[playerIndex].hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => isPlayable(card, state));
}

export function nextSeat(state, seat, steps = 1) {
  const count = state.players.length;
  return (seat + state.direction * steps % count + count) % count;
}

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function handPacket(player) {
  return { hand: player.hand, saidOnu: !!player.saidOnu, transferImmune: !!player.transferImmune };
}

function putPacket(player, packet, transferred = true) {
  player.hand = packet.hand;
  player.saidOnu = packet.saidOnu;
  player.transferImmune = transferred || packet.transferImmune;
}

/** Swap entire hands, including the declaration state attached to each hand. */
export function swapHands(state, first, second) {
  const a = handPacket(state.players[first]);
  const b = handPacket(state.players[second]);
  putPacket(state.players[first], b);
  putPacket(state.players[second], a);
  return state;
}

/** Rotate each hand packet one seat in the current direction. */
export function rotateHands(state) {
  const packets = state.players.map(handPacket);
  for (let from = 0; from < state.players.length; from++)
    putPacket(state.players[nextSeat(state, from)], packets[from]);
  return state;
}

/** Reverse both piles and toggle the visible face. The just-played Flip ends at discard bottom. */
export function flipPiles(state) {
  state.discardPile.reverse();
  state.drawPile.reverse();
  state.side = state.side === "dark" ? "light" : "dark";
  const top = activeFace(topCard(state), state);
  state.currentColor = top?.color === "W" ? null : top?.color ?? null;
  return state;
}

function takeCard(state, rng = Math.random) {
  if (!state.drawPile.length && state.discardPile.length > 1) {
    const top = state.discardPile.pop();
    state.drawPile = shuffle(state.discardPile.splice(0), rng);
    state.discardPile.push(top);
  }
  return state.drawPile.pop() ?? null;
}

/** Draw finitely, including the matching card, until predicate matches or all recyclable cards are exhausted. */
export function drawUntil(state, playerIndex, predicate, rng = Math.random) {
  const drawn = [];
  const finiteLimit = state.drawPile.length + Math.max(0, state.discardPile.length - 1);
  for (let i = 0; i < finiteLimit; i++) {
    const card = takeCard(state, rng);
    if (!card) break;
    state.players[playerIndex].hand.push(card);
    state.players[playerIndex].saidOnu = false;
    drawn.push(card);
    if (predicate(card, state)) return { drawn, matched: card, exhausted: false };
  }
  return { drawn, matched: null, exhausted: true };
}

// drawUntil intentionally can consume the whole deck. Fixed draws need a bounded separate loop.
function drawFixed(state, playerIndex, amount, rng = Math.random) {
  const drawn = [];
  for (let i = 0; i < amount; i++) {
    const card = takeCard(state, rng);
    if (!card) break;
    state.players[playerIndex].hand.push(card);
    state.players[playerIndex].saidOnu = false;
    drawn.push(card);
  }
  return drawn;
}

export function canStack(card, pending, state) {
  if (!pending || state.mode !== "chaos") return false;
  const symbol = activeFace(card, state)?.symbol;
  return (pending.kind === "draw2" && symbol === "draw2") ||
    (pending.kind === "wildDraw4" && symbol === "wildDraw4");
}

/** Describe the deterministic penalty branch without mutating state. */
export function challengeOutcome({ mode = "classic", side = "light", legal, challenged = true, amount }) {
  if (!challenged) return { guilty: false, recipient: "target", kind: mode === "flip" && side === "dark" ? "drawColor" : "fixed", amount };
  if (!legal) return {
    guilty: true, recipient: "offender",
    kind: mode === "flip" && side === "dark" ? "drawColor" : "fixed",
    amount: mode === "flip" && side === "light" ? 2 : amount,
    targetKeepsTurn: true,
  };
  return {
    guilty: false, recipient: "target",
    kind: mode === "flip" && side === "dark" ? "drawColorPlus" : "fixed",
    amount: mode === "flip" && side === "light" ? 4 : amount + 2,
    targetKeepsTurn: false,
  };
}

export function jumpCandidates(state, playedCard = topCard(state), excludePlayer = state.lastPlayer) {
  if (state.mode !== "chaos" || state.pendingStack || state.winner != null || state.catchPlayer != null) return [];
  const played = activeFace(playedCard, state);
  if (!played || played.color === "W" || played.symbol === "0") return [];
  const candidates = [];
  state.players.forEach((player, playerIndex) => {
    if (playerIndex === excludePlayer) return;
    player.hand.forEach((card, cardIndex) => {
      const candidate = activeFace(card, state);
      if (candidate.color === played.color && candidate.symbol === played.symbol)
        candidates.push({ playerIndex, cardIndex, cardId: card.id });
    });
  });
  return candidates;
}

export function jumpEligibility(state, playerIndex, card) {
  return jumpCandidates(state).some(candidate => candidate.playerIndex === playerIndex && candidate.cardId === card.id);
}

function snakeProfile(profileOrId) {
  if (typeof profileOrId === "object") return profileOrId;
  return SNAKES.find(snake => snake.id === profileOrId || snake.name === profileOrId) ?? SNAKES[0];
}

export function chooseColor(hand, profileOrId = "cobra", stateOrMode = "classic") {
  const snake = snakeProfile(profileOrId);
  const colors = (typeof stateOrMode === "object" ? stateOrMode.mode : stateOrMode) === "flip" &&
    (typeof stateOrMode === "object" ? stateOrMode.side : "light") === "dark" ? DARK_COLORS : CLASSIC_COLORS;
  let best = colors[0];
  let bestScore = -Infinity;
  for (const color of colors) {
    const same = hand.filter(card => activeFace(card, stateOrMode)?.color === color);
    const score = same.length * (2 + snake.weights.colorControl) +
      handScore(same, stateOrMode) * (.04 + snake.weights.highShed * .1);
    if (score > bestScore) { best = color; bestScore = score; }
  }
  return best;
}

export function chooseSwapTarget(state, playerIndex, profileOrId = "cobra") {
  const snake = snakeProfile(profileOrId);
  const opponents = state.players.map((player, index) => ({ index, count: player.hand.length }))
    .filter(player => player.index !== playerIndex);
  opponents.sort((a, b) => {
    if (snake.weights.variance > 1) return b.count - a.count || a.index - b.index;
    return a.count - b.count || a.index - b.index;
  });
  return opponents[0]?.index ?? null;
}

function moveScore(state, playerIndex, move, snake, rng) {
  const player = state.players[playerIndex];
  const next = state.players[nextSeat(state, playerIndex)];
  const f = activeFace(move.card, state);
  let score = 20 + f.points * snake.weights.highShed;
  const attacks = ["skip", "skipEveryone", "draw1", "draw2", "draw5", "wildDraw2", "wildDraw4", "wildDrawColor"];
  if (attacks.includes(f.symbol)) score += snake.weights.attack * Math.max(1, 4 - next.hand.length);
  if (["skip", "skipEveryone", "reverse"].includes(f.symbol)) score += snake.weights.redirect * Math.max(1, 5 - next.hand.length);
  if (f.color === "W") score -= snake.weights.wildHoard * Math.max(1, player.hand.length - 2);
  if (f.color === state.currentColor && f.color !== "W") score += snake.weights.exact;
  const followColor = f.color === "W" ? chooseColor(player.hand.filter(card => card.id !== move.card.id), snake, state) : f.color;
  score += player.hand.filter(card => activeFace(card, state)?.color === followColor).length * snake.weights.colorControl;
  if (snake.weights.conservative && f.color === "W") score -= snake.weights.conservative;
  if (snake.weights.tactical && attacks.includes(f.symbol)) score += snake.weights.tactical * (1 / Math.max(1, next.hand.length));
  if (player.hand.length === 1) score += 100 + snake.weights.highShed * 10;
  score += (rng() - .5) * snake.weights.variance;
  return score;
}

/** Choose only among legal cards. A restricted-wild bluff is a permitted strategic decision. */
export function chooseAiMove(state, playerIndex = state.turn, profileOrId, rng = Math.random) {
  const snake = snakeProfile(profileOrId ?? state.players[playerIndex].profile ?? "cobra");
  const moves = legalMoves(state, playerIndex);
  if (!moves.length) return null;
  const priorColor = state.currentColor;
  const scored = moves.map(move => {
    const f = activeFace(move.card, state);
    const restricted = ["wildDraw4", "wildDraw2", "wildDrawColor"].includes(f.symbol);
    const illegalWild = restricted && state.players[playerIndex].hand.some(card => card.id !== move.card.id && activeFace(card, state)?.color === priorColor);
    let score = moveScore(state, playerIndex, move, snake, rng);
    if (illegalWild && rng() >= snake.weights.bluff) score -= 1000;
    return { ...move, score, illegalWild };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = scored[0];
  const f = activeFace(selected.card, state);
  return {
    cardId: selected.card.id,
    cardIndex: selected.index,
    color: f.color === "W" ? chooseColor(state.players[playerIndex].hand.filter(card => card.id !== selected.card.id), snake, state) : null,
    target: state.mode === "chaos" && f.symbol === "7" ? chooseSwapTarget(state, playerIndex, snake) : null,
    bluff: selected.illegalWild,
  };
}

export function chooseAiDecision(kind, state, playerIndex = state.turn, profileOrId, rng = Math.random) {
  const snake = snakeProfile(profileOrId ?? state.players[playerIndex].profile ?? "cobra");
  if (kind === "challenge") return rng() < snake.weights.challenge;
  if (kind === "callOnu") return rng() < snake.weights.onu;
  if (kind === "jump") return rng() < snake.weights.jump;
  if (kind === "jumpDelay") return snake.weights.jumpDelay;
  if (kind === "playDrawn") return rng() < snake.weights.drawPlay;
  if (kind === "move") return chooseAiMove(state, playerIndex, snake, rng);
  throw new Error(`Unknown AI decision: ${kind}`);
}

function defaultPlayers() {
  return [
    { name: "You", human: true, hand: [], saidOnu: false },
    ...SNAKES.slice(0, 3).map(snake => ({ name: snake.name, profile: snake.id, hand: [], saidOnu: false })),
  ];
}

/** Create and deal a round; starter restricted wilds are replaced. */
export function createGameState({ mode = "classic", players = defaultPlayers(), dealer = 3, rng = Math.random } = {}) {
  if (!MODES[mode]) throw new Error(`Unknown mode: ${mode}`);
  const state = {
    mode, side: "light", players: clone(players), drawPile: mode === "flip" ? buildFlipDeck(rng) : buildClassicDeck(rng),
    discardPile: [], turn: 0, direction: 1, currentColor: null, dealer,
    pendingStack: null, pendingChallenge: null, catchPlayer: null, jumpWindow: null,
    winner: null, roundVoid: false, noProgressTurns: 0, lastPlayer: null,
  };
  state.players.forEach(player => { player.hand ??= []; player.saidOnu ??= false; });
  for (let n = 0; n < 7; n++) for (const player of state.players) player.hand.push(state.drawPile.pop());
  let starter = state.drawPile.pop();
  while (starter && ["wildDraw4", "wildDraw2", "wildDrawColor"].includes(activeFace(starter, state).symbol)) {
    state.drawPile.unshift(starter);
    starter = state.drawPile.pop();
  }
  state.discardPile.push(starter);
  state.turn = nextSeat(state, dealer);
  applyStarter(state, starter, rng);
  assertState(state);
  return state;
}

/** Apply only the documented starter effect. A revealed opposite face never fires. */
export function applyStarter(state, starter = topCard(state), rng = Math.random) {
  const f = activeFace(starter, state);
  state.currentColor = f.color === "W" ? null : f.color;
  const first = state.turn;
  if (f.symbol === "skip") state.turn = nextSeat(state, first);
  else if (f.symbol === "reverse") {
    state.direction *= -1;
    state.turn = state.mode === "flip" ? state.dealer : nextSeat(state, state.dealer);
  }
  else if (f.symbol === "draw1") { drawFixed(state, first, 1, rng); state.turn = nextSeat(state, first); }
  else if (f.symbol === "draw2") { drawFixed(state, first, 2, rng); state.turn = nextSeat(state, first); }
  else if (f.symbol === "draw5") { drawFixed(state, first, 5, rng); state.turn = nextSeat(state, first); }
  else if (f.symbol === "skipEveryone") state.turn = state.dealer;
  else if (f.symbol === "flip") flipPiles(state);
  else if (f.symbol === "wild") state.pendingRequest = { type: "chooseColor", playerIndex: first };
  return state;
}

function findCard(player, command) {
  const index = command.cardIndex ?? player.hand.findIndex(card => card.id === command.cardId);
  return { index, card: player.hand[index] };
}

function restricted(symbol) { return ["wildDraw4", "wildDraw2", "wildDrawColor"].includes(symbol); }

function requestForPending(state) {
  if (!state.pendingStack) return null;
  const pending = state.pendingStack;
  const canStackAny = state.players[pending.target].hand.some(card => canStack(card, pending, state));
  return {
    type: "penaltyResponse", playerIndex: pending.target, amount: pending.amount,
    options: pending.kind !== "draw2" ? ["challenge", ...(canStackAny ? ["stack"] : []), "accept"] : [...(canStackAny ? ["stack"] : []), "accept"],
  };
}

function determineWinner(state) {
  const empty = state.players.findIndex(player => player.hand.length === 0);
  state.winner = empty < 0 ? null : empty;
  if (state.winner != null) { state.catchPlayer = null; state.jumpWindow = null; }
}

function finishResolvedPlay(state, playedCard) {
  determineWinner(state);
  if (state.winner != null || state.pendingStack) return null;
  if (state.catchPlayer != null) return { type: "catch", playerIndex: state.catchPlayer };
  const candidates = jumpCandidates(state, playedCard, state.lastPlayer);
  state.jumpWindow = candidates.length ? { cardId: playedCard.id, candidates } : null;
  return state.jumpWindow ? { type: "jump", candidates } : null;
}

function resolvePlay(state, command, rng, events, jumping = false) {
  const playerIndex = command.playerIndex ?? state.turn;
  if (!jumping && playerIndex !== state.turn) throw new Error("Not that player's turn");
  const player = state.players[playerIndex];
  const { index, card } = findCard(player, command);
  if (!card) throw new Error("Card is not in hand");
  if (!jumping && state.pendingRequest?.type === "playDrawn" && card.id !== state.pendingRequest.cardId)
    throw new Error("Only the newly drawn card may be played");
  if (jumping ? !jumpEligibility(state, playerIndex, card) : !isPlayable(card, state)) throw new Error("Card is not playable");
  const f = activeFace(card, state);
  if (f.color === "W" && !command.color) return { request: { type: "chooseColor", playerIndex, cardId: card.id } };
  if (state.mode === "chaos" && f.symbol === "7" && command.target == null)
    return { request: { type: "chooseTarget", playerIndex, cardId: card.id, targets: state.players.map((_, i) => i).filter(i => i !== playerIndex) } };

  const priorColor = state.currentColor;
  const wasLegal = !restricted(f.symbol) || !player.hand.some(other => other.id !== card.id && activeFace(other, state)?.color === priorColor);
  player.hand.splice(index, 1);
  const playedPacketHand = player.hand;
  if (state.drawnCardId === card.id) state.drawnCardId = null;
  player.transferImmune = false;
  player.saidOnu = player.hand.length === 1 ? !!(command.saidOnu || player.saidOnu) : false;
  state.discardPile.push(card);
  state.currentColor = f.color === "W" ? command.color : f.color;
  state.lastPlayer = playerIndex;
  state.noProgressTurns = 0;
  state.jumpWindow = null;
  events.push({ type: jumping ? "jump" : "play", playerIndex, cardId: card.id, face: f });

  if (f.symbol === "reverse") state.direction *= -1;
  if (state.mode === "chaos" && f.symbol === "7") swapHands(state, playerIndex, command.target);
  if (state.mode === "chaos" && f.symbol === "0") rotateHands(state);

  if (f.symbol === "flip") {
    flipPiles(state);
    state.turn = nextSeat(state, playerIndex);
  } else if (f.symbol === "skip") state.turn = nextSeat(state, playerIndex, 2);
  else if (f.symbol === "skipEveryone") state.turn = playerIndex;
  else if (["draw1", "draw5"].includes(f.symbol)) {
    const target = nextSeat(state, playerIndex);
    drawFixed(state, target, f.symbol === "draw1" ? 1 : 5, rng);
    state.turn = nextSeat(state, target);
  } else if (f.symbol === "draw2") {
    const target = nextSeat(state, playerIndex);
    if (state.mode === "chaos") {
      state.pendingStack = { kind: "draw2", amount: 2, target, latestOffender: playerIndex, latestCardId: card.id };
      state.turn = target;
    } else {
      drawFixed(state, target, 2, rng);
      state.turn = nextSeat(state, target);
    }
  } else if (restricted(f.symbol)) {
    const target = nextSeat(state, playerIndex);
    const amount = f.symbol === "wildDraw4" ? 4 : 2;
    state.pendingStack = {
      kind: f.symbol === "wildDraw4" ? "wildDraw4" : f.symbol,
      amount, target, latestOffender: playerIndex, latestCardId: card.id,
      latestLegal: wasLegal, chosenColor: command.color, priorColor,
    };
    state.pendingChallenge = clone(state.pendingStack);
    state.turn = target;
  } else state.turn = nextSeat(state, playerIndex);

  const holder = state.players.findIndex(p => p.hand === playedPacketHand);
  const playedPacket = holder < 0 ? null : state.players[holder];
  if (playedPacket?.hand.length === 1 && !playedPacket.saidOnu && !playedPacket.transferImmune) state.catchPlayer = holder;
  if (state.pendingStack) return { request: requestForPending(state) };
  return { request: finishResolvedPlay(state, card) };
}

function resolvePenalty(state, challenged, rng, events) {
  const pending = state.pendingStack;
  if (!pending) throw new Error("No pending penalty");
  const target = pending.target;
  const side = state.side;
  const outcome = challengeOutcome({ mode: state.mode, side, legal: pending.latestLegal, challenged, amount: pending.amount });
  if (outcome.kind === "drawColor" || outcome.kind === "drawColorPlus") {
    const recipient = outcome.recipient === "offender" ? pending.latestOffender : target;
    const result = drawUntil(state, recipient, card => activeFace(card, state)?.color === pending.chosenColor, rng);
    if (outcome.kind === "drawColorPlus") drawFixed(state, recipient, 2, rng);
    events.push({ type: "drawColor", playerIndex: recipient, count: result.drawn.length + (outcome.kind === "drawColorPlus" ? 2 : 0), exhausted: result.exhausted });
  } else {
    const recipient = outcome.recipient === "offender" ? pending.latestOffender : target;
    const cards = drawFixed(state, recipient, outcome.amount, rng);
    events.push({ type: "draw", playerIndex: recipient, count: cards.length });
  }
  state.turn = outcome.targetKeepsTurn ? target : nextSeat(state, target);
  state.pendingStack = null;
  state.pendingChallenge = null;
  return finishResolvedPlay(state, topCard(state));
}

/**
 * Apply one rule command and return a fresh authoritative state.
 * Commands: play, draw, keepDrawn, stack, acceptPenalty, challenge, jump,
 * chooseStarterColor, callOnu, catch, passCatch, and passJump.
 */
export function transition(gameState, command, rng = Math.random) {
  const state = clone(gameState);
  const events = [];
  let request = null;
  if (!command?.type) throw new Error("A command type is required");
  const pendingType = state.pendingRequest?.type;
  const allowed = {
    chooseColor: state.pendingRequest?.cardId ? [state.pendingRequest.action === "stack" ? "stack" : "play"] : ["chooseStarterColor"],
    chooseTarget: ["play"], playDrawn: ["play", "keepDrawn"],
    penaltyResponse: ["stack", "accept", "acceptPenalty", "challenge"],
    catch: ["callOnu", "catch", "passCatch"], jump: ["jump", "passJump"],
  };
  if (pendingType && allowed[pendingType] && !allowed[pendingType].includes(command.type))
    throw new Error(`Resolve ${pendingType} before ${command.type}`);

  if (command.type === "play") request = resolvePlay(state, command, rng, events).request;
  else if (command.type === "jump") {
    const result = resolvePlay(state, command, rng, events, true);
    request = result.request;
  } else if (command.type === "draw") {
    if (state.pendingStack) throw new Error("Resolve the pending penalty first");
    const playerIndex = command.playerIndex ?? state.turn;
    if (playerIndex !== state.turn) throw new Error("Not that player's turn");
    const before = state.players[playerIndex].hand.length;
    let result;
    if (state.mode === "chaos" && !legalMoves(state, playerIndex).length)
      result = drawUntil(state, playerIndex, card => isPlayable(card, state), rng);
    else {
      const card = takeCard(state, rng);
      if (card) state.players[playerIndex].hand.push(card);
      result = { drawn: card ? [card] : [], matched: card && isPlayable(card, state) ? card : null, exhausted: !card };
    }
    state.players[playerIndex].saidOnu = false;
    events.push({ type: "draw", playerIndex, count: result.drawn.length });
    if (result.matched) {
      state.drawnCardId = result.matched.id;
      request = { type: "playDrawn", playerIndex, cardId: result.matched.id };
    }
    else {
      state.turn = nextSeat(state, playerIndex);
      state.noProgressTurns = result.drawn.length ? 0 : state.noProgressTurns + 1;
      if (state.noProgressTurns >= state.players.length) state.roundVoid = true;
    }
    if (state.players[playerIndex].hand.length === before && !result.matched) events.push({ type: "exhausted", playerIndex });
  } else if (command.type === "keepDrawn") {
    const pending = state.pendingRequest;
    if (pending?.type !== "playDrawn") throw new Error("No playable drawn card is waiting");
    const playerIndex = command.playerIndex ?? pending.playerIndex;
    if (playerIndex !== pending.playerIndex) throw new Error("Only the drawing player may keep it");
    state.drawnCardId = null;
    state.turn = nextSeat(state, playerIndex);
    state.noProgressTurns = 0;
  } else if (command.type === "chooseStarterColor") {
    if (state.pendingRequest?.type !== "chooseColor") throw new Error("The starter is not waiting for a colour");
    const colors = state.mode === "flip" && state.side === "dark" ? DARK_COLORS : CLASSIC_COLORS;
    if (!colors.includes(command.color)) throw new Error("Invalid active colour");
    state.currentColor = command.color;
  } else if (command.type === "stack") {
    const pending = state.pendingStack;
    if (!pending) throw new Error("No pending stack");
    const playerIndex = command.playerIndex ?? pending.target;
    if (playerIndex !== pending.target) throw new Error("Only the target may stack");
    const { index, card } = findCard(state.players[playerIndex], command);
    if (!card || !canStack(card, pending, state)) throw new Error("That card cannot stack");
    const f = activeFace(card, state);
    if (f.color === "W" && !command.color) {
      request = { type: "chooseColor", playerIndex, cardId: card.id, action: "stack" };
      state.pendingRequest = request;
      assertState(state);
      return { gameState: state, events, request };
    }
    const priorColor = state.currentColor;
    const legal = !state.players[playerIndex].hand.some(other => other.id !== card.id && activeFace(other, state)?.color === priorColor);
    state.players[playerIndex].hand.splice(index, 1);
    state.discardPile.push(card);
    state.currentColor = f.color === "W" ? command.color : f.color;
    pending.amount += pending.kind === "draw2" ? 2 : 4;
    pending.latestOffender = playerIndex;
    pending.latestCardId = card.id;
    pending.latestLegal = legal;
    pending.priorColor = priorColor;
    pending.chosenColor = command.color ?? null;
    pending.target = nextSeat(state, playerIndex);
    state.pendingChallenge = pending.kind === "wildDraw4" ? clone(pending) : null;
    state.turn = pending.target;
    state.lastPlayer = playerIndex;
    events.push({ type: "stack", playerIndex, amount: pending.amount });
    request = requestForPending(state);
  } else if (command.type === "accept" || command.type === "acceptPenalty" || (command.type === "challenge" && command.challenge === false)) {
    if (command.playerIndex != null && command.playerIndex !== state.pendingStack?.target) throw new Error("Only the penalty target may respond");
    request = resolvePenalty(state, false, rng, events);
  } else if (command.type === "challenge") {
    if (command.playerIndex != null && command.playerIndex !== state.pendingStack?.target) throw new Error("Only the penalty target may respond");
    request = resolvePenalty(state, true, rng, events);
  }
  else if (command.type === "callOnu") {
    const playerIndex = command.playerIndex ?? state.turn;
    const wasCatch = state.catchPlayer === playerIndex;
    state.players[playerIndex].saidOnu = true;
    if (wasCatch) {
      state.catchPlayer = null;
      request = finishResolvedPlay(state, topCard(state));
    }
  } else if (command.type === "catch") {
    if (state.catchPlayer == null) throw new Error("Nobody can be caught");
    drawFixed(state, state.catchPlayer, 2, rng);
    events.push({ type: "caught", playerIndex: state.catchPlayer });
    state.catchPlayer = null;
    request = finishResolvedPlay(state, topCard(state));
  } else if (command.type === "passCatch") {
    if (state.catchPlayer == null) throw new Error("No catch window is open");
    state.catchPlayer = null;
    request = finishResolvedPlay(state, topCard(state));
  } else if (command.type === "passJump") {
    state.jumpWindow = null;
  } else throw new Error(`Unknown command: ${command.type}`);

  if (!state.pendingStack) determineWinner(state);
  state.pendingRequest = request;
  assertState(state);
  return { gameState: state, events, request };
}

/** Throw when a simulation crosses a structural rule invariant. */
export function assertState(state) {
  if (!MODES[state.mode]) throw new Error("Invalid mode");
  if (![1, -1].includes(state.direction)) throw new Error("Invalid direction");
  if (state.mode === "flip" && !["light", "dark"].includes(state.side)) throw new Error("Invalid side");
  if (!Number.isInteger(state.turn) || state.turn < 0 || state.turn >= state.players.length) throw new Error("Invalid turn");
  const cards = [...state.drawPile, ...state.discardPile, ...state.players.flatMap(player => player.hand)];
  const ids = cards.map(card => card.id);
  if (new Set(ids).size !== ids.length) throw new Error("A physical card appears twice");
  for (const card of cards) {
    if (!activeFace(card, state)) throw new Error(`Card ${card.id} has no active face`);
    if (state.mode === "flip" && (!card.faces.light || !card.faces.dark)) throw new Error(`Flip card ${card.id} is not paired`);
  }
  if (state.pendingStack && state.turn !== state.pendingStack.target) throw new Error("Pending target does not own the turn");
  if (state.winner != null && state.players[state.winner].hand.length !== 0) throw new Error("Winner still has cards");
  return true;
}
