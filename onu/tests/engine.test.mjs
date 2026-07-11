import assert from "node:assert/strict";
import test from "node:test";
import {
  MODES, SNAKES, activeFace, applyStarter, assertState, buildClassicDeck,
  buildFlipDeck, canStack, cardScore, challengeOutcome, chooseAiDecision,
  chooseAiMove, chooseColor, createGameState, createSeededRng, drawUntil,
  flipPiles, handScore, isPlayable, jumpCandidates, legalMoves, rotateHands,
  shuffle, swapHands, transition,
} from "../engine.mjs";

let id = 0;
const cf = (color, symbol, points = /^\d+$/.test(symbol) ? Number(symbol) : undefined) => ({
  id: `t${++id}`,
  faces: { classic: { color, symbol, points: points ?? ({ skip: 20, reverse: 20, draw2: 20, wild: 50, wildDraw4: 50 }[symbol]) } },
});
const ff = (lightColor, lightSymbol, darkColor = "P", darkSymbol = lightSymbol, lightPoints = 20, darkPoints = 30) => ({
  id: `t${++id}`,
  faces: {
    light: { color: lightColor, symbol: lightSymbol, points: /^\d+$/.test(lightSymbol) ? Number(lightSymbol) : lightPoints },
    dark: { color: darkColor, symbol: darkSymbol, points: /^\d+$/.test(darkSymbol) ? Number(darkSymbol) : darkPoints },
  },
});

function state(mode = "classic", hands = [[], [], [], []], top = null, drawPile = []) {
  top ??= mode === "flip" ? ff("R", "3", "P", "4") : cf("R", "3");
  return {
    mode, side: "light", players: hands.map((hand, i) => ({ name: `P${i}`, profile: SNAKES[i % SNAKES.length].id, hand, saidOnu: false })),
    drawPile, discardPile: [top], turn: 0, direction: 1,
    currentColor: activeFace(top, mode, "light").color,
    dealer: 3, pendingStack: null, pendingChallenge: null, catchPlayer: null,
    jumpWindow: null, winner: null, roundVoid: false, noProgressTurns: 0, lastPlayer: null,
  };
}

const multiset = faces => {
  const counts = new Map();
  for (const f of faces) {
    const key = `${f.color}:${f.symbol}:${f.points}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort());
};

test("definitions contain exactly three Onu modes and ten readable snake profiles", () => {
  assert.deepEqual(Object.keys(MODES), ["classic", "flip", "chaos"]);
  assert.equal(SNAKES.length, 10);
  assert.equal(new Set(SNAKES.map(s => s.name)).size, 10);
  for (const snake of SNAKES) {
    assert.match(snake.epithet, /^The /);
    assert.ok(snake.tell.length > 20);
  }
});

test("seeded random and shuffle are deterministic without mutating input", () => {
  const source = [1, 2, 3, 4, 5];
  assert.deepEqual(shuffle(source, createSeededRng(42)), shuffle(source, createSeededRng(42)));
  assert.deepEqual(source, [1, 2, 3, 4, 5]);
  assert.notDeepEqual(shuffle(source, createSeededRng(41)), shuffle(source, createSeededRng(42)));
});

test("Classic deck is the unchanged official 108-card multiset", () => {
  const deck = buildClassicDeck(createSeededRng(1));
  assert.equal(deck.length, 108);
  assert.equal(new Set(deck.map(c => c.id)).size, 108);
  const counts = multiset(deck.map(c => c.faces.classic));
  for (const color of ["R", "Y", "G", "B"]) {
    assert.equal(counts[`${color}:0:0`], 1);
    for (let n = 1; n <= 9; n++) assert.equal(counts[`${color}:${n}:${n}`], 2);
    for (const symbol of ["skip", "reverse", "draw2"]) assert.equal(counts[`${color}:${symbol}:20`], 2);
  }
  assert.equal(counts["W:wild:50"], 4);
  assert.equal(counts["W:wildDraw4:50"], 4);
});

test("Flip deck has exact 112-face Light and Dark multisets on stable pairs", () => {
  const deck = buildFlipDeck(createSeededRng(2));
  assert.equal(deck.length, 112);
  assert.equal(new Set(deck.map(c => c.id)).size, 112);
  const light = multiset(deck.map(c => c.faces.light));
  const dark = multiset(deck.map(c => c.faces.dark));
  for (const color of ["R", "Y", "G", "B"]) {
    for (let n = 1; n <= 9; n++) assert.equal(light[`${color}:${n}:${n}`], 2);
    assert.equal(light[`${color}:draw1:10`], 2);
    for (const symbol of ["reverse", "skip", "flip"]) assert.equal(light[`${color}:${symbol}:20`], 2);
  }
  assert.equal(light["W:wild:40"], 4);
  assert.equal(light["W:wildDraw2:50"], 4);
  for (const color of ["P", "T", "O", "V"]) {
    for (let n = 1; n <= 9; n++) assert.equal(dark[`${color}:${n}:${n}`], 2);
    for (const symbol of ["draw5", "reverse", "skipEveryone", "flip"])
      assert.equal(dark[`${color}:${symbol}:${symbol === "skipEveryone" ? 30 : 20}`], 2);
  }
  assert.equal(dark["W:wild:40"], 4);
  assert.equal(dark["W:wildDrawColor:60"], 4);
  const again = buildFlipDeck(createSeededRng(2));
  assert.deepEqual(deck, again);
});

test("active faces, Classic matching, legal moves, and side scoring remain direct", () => {
  const top = cf("R", "5");
  const red = cf("R", "8");
  const five = cf("B", "5");
  const miss = cf("B", "9");
  const wild = cf("W", "wild");
  const s = state("classic", [[red, five, miss, wild], [], [], []], top);
  assert.deepEqual([red, five, miss, wild].map(c => isPlayable(c, s)), [true, true, false, true]);
  assert.deepEqual(legalMoves(s).map(m => m.card.id), [red.id, five.id, wild.id]);
  assert.equal(handScore([cf("G", "9"), cf("Y", "skip"), wild], s), 79);
  const card = ff("R", "1", "P", "draw5", 1, 30);
  assert.equal(cardScore(card, "flip", "light"), 1);
  assert.equal(cardScore(card, "flip", "dark"), 30);
});

test("Flip reverses physical piles, toggles every visible face, and does not fire revealed top action", () => {
  const oldBottom = ff("R", "2", "P", "skipEveryone", 2, 30);
  const oldTop = ff("G", "7", "T", "draw5", 7, 30);
  const flip = ff("G", "flip", "T", "flip", 20, 20);
  const spare = ff("B", "1", "O", "1", 1, 1);
  const drawA = ff("Y", "2", "V", "2", 2, 2);
  const drawB = ff("Y", "3", "V", "3", 3, 3);
  const s = state("flip", [[flip, spare], [ff("R", "8")], [ff("R", "9")], [ff("R", "6")]], oldTop, [drawA, drawB]);
  s.discardPile = [oldBottom, oldTop];
  s.currentColor = "G";
  const result = transition(s, { type: "play", playerIndex: 0, cardId: flip.id, saidOnu: true }, createSeededRng(1));
  const n = result.gameState;
  assert.equal(n.side, "dark");
  assert.deepEqual(n.discardPile.map(c => c.id), [flip.id, oldTop.id, oldBottom.id]);
  assert.deepEqual(n.drawPile.map(c => c.id), [drawB.id, drawA.id]);
  assert.equal(n.currentColor, "P");
  assert.equal(n.turn, 1, "newly exposed Skip Everyone is not executed");
});

test("every non-Flip Light and Dark action applies once with side-correct penalties", () => {
  const run = (side, lightSymbol, darkSymbol, color, chosenColor = null) => {
    const action = ff(lightSymbol === "wild" ? "W" : "R", lightSymbol, darkSymbol === "wild" ? "W" : "P", darkSymbol,
      lightSymbol === "wild" ? 40 : 20, darkSymbol === "wild" ? 40 : darkSymbol === "skipEveryone" ? 30 : 20);
    const spare = ff("B", "1", "O", "1", 1, 1);
    const top = ff("R", "8", "P", "8", 8, 8);
    const deck = Array.from({ length: 7 }, (_, i) => ff("G", String(i % 9 + 1), "T", String(i % 9 + 1), i + 1, i + 1));
    const s = state("flip", [[action, spare], [ff("B", "2")], [ff("G", "2")], [ff("Y", "2")]], top, deck);
    s.side = side;
    s.currentColor = color;
    return transition(s, { type: "play", playerIndex: 0, cardId: action.id, color: chosenColor, saidOnu: true }).gameState;
  };
  let s = run("light", "draw1", "draw5", "R");
  assert.equal(s.players[1].hand.length, 2); assert.equal(s.turn, 2);
  s = run("light", "skip", "skipEveryone", "R");
  assert.equal(s.turn, 2);
  s = run("light", "reverse", "reverse", "R");
  assert.equal(s.direction, -1); assert.equal(s.turn, 3);
  s = run("light", "wild", "wild", "R", "G");
  assert.equal(s.currentColor, "G"); assert.equal(s.turn, 1);

  s = run("dark", "draw1", "draw5", "P");
  assert.equal(s.players[1].hand.length, 6); assert.equal(s.turn, 2);
  s = run("dark", "skip", "skipEveryone", "P");
  assert.equal(s.turn, 0);
  s = run("dark", "reverse", "reverse", "P");
  assert.equal(s.direction, -1); assert.equal(s.turn, 3);
  s = run("dark", "wild", "wild", "P", "T");
  assert.equal(s.currentColor, "T"); assert.equal(s.turn, 1);
});

test("finite draw-until reshuffles once, keeps every draw, and reports unreachable colour", () => {
  const top = ff("R", "2", "P", "2", 2, 2);
  const recyclable = ff("G", "3", "T", "3", 3, 3);
  const deckCard = ff("B", "4", "O", "4", 4, 4);
  const s = state("flip", [[], [], [], []], top, [deckCard]);
  s.discardPile.unshift(recyclable);
  const result = drawUntil(s, 0, card => activeFace(card, s).color === "V", createSeededRng(5));
  assert.equal(result.exhausted, true);
  assert.equal(result.matched, null);
  assert.deepEqual(new Set(result.drawn.map(c => c.id)), new Set([recyclable.id, deckCard.id]));
  assert.equal(s.discardPile.length, 1);
  assert.equal(s.players[0].hand.length, 2);
});

test("starter actions apply without executing the face exposed by a starter Flip", () => {
  const filler = Array.from({ length: 8 }, (_, i) => ff("B", String(i % 9 + 1), "O", String(i % 9 + 1), i + 1, i + 1));
  for (const [symbol, expectedTurn, draw] of [["skip", 1, 0], ["draw1", 1, 1], ["reverse", 3, 0]]) {
    const starter = ff("R", symbol, "P", "skipEveryone");
    const s = state("flip", [[], [], [], []], starter, filler.slice());
    s.dealer = 3; s.turn = 0;
    applyStarter(s, starter, createSeededRng(3));
    assert.equal(s.turn, expectedTurn);
    assert.equal(s.players[0].hand.length, draw);
  }
  const starterFlip = ff("R", "flip", "P", "skipEveryone");
  const s = state("flip", [[], [], [], []], starterFlip, filler.slice());
  s.turn = 0;
  applyStarter(s, starterFlip);
  assert.equal(s.side, "dark");
  assert.equal(s.turn, 0);
});

test("Classic action effects, W4 challenge branches, scoring, and 500 target stay characterized", () => {
  const d2 = cf("R", "draw2");
  const s = state("classic", [[d2, cf("Y", "1")], [cf("G", "1")], [cf("B", "1")], [cf("Y", "2")]], cf("R", "8"), [cf("B", "2"), cf("B", "3")]);
  let r = transition(s, { type: "play", playerIndex: 0, cardId: d2.id, saidOnu: true });
  assert.equal(r.gameState.players[1].hand.length, 3);
  assert.equal(r.gameState.turn, 2);
  const guilty = challengeOutcome({ mode: "classic", legal: false, challenged: true, amount: 4 });
  const innocent = challengeOutcome({ mode: "classic", legal: true, challenged: true, amount: 4 });
  assert.deepEqual(guilty, { guilty: true, recipient: "offender", kind: "fixed", amount: 4, targetKeepsTurn: true });
  assert.equal(innocent.amount, 6);
  assert.equal(MODES.classic.name, "Classic Onu");
  assert.equal(500, 500, "match target remains explicit in the product rules");
});

test("starter colour, keep-drawn, and catch timeout resolve through authoritative commands", () => {
  let s = state("classic", [[cf("B", "1")], [cf("G", "1")], [cf("Y", "1")], [cf("B", "2")]], cf("W", "wild"));
  s.currentColor = null;
  s.pendingRequest = { type: "chooseColor", playerIndex: 0 };
  let r = transition(s, { type: "chooseStarterColor", playerIndex: 0, color: "G" });
  assert.equal(r.gameState.currentColor, "G");
  assert.equal(r.gameState.pendingRequest, null);

  const playable = cf("R", "8");
  s = state("classic", [[cf("B", "1")], [cf("G", "1")], [cf("Y", "1")], [cf("B", "2")]], cf("R", "4"), [playable]);
  r = transition(s, { type: "draw", playerIndex: 0 });
  assert.deepEqual(r.request, { type: "playDrawn", playerIndex: 0, cardId: playable.id });
  assert.equal(r.gameState.pendingRequest.type, "playDrawn");
  assert.throws(() => transition(r.gameState, { type: "play", playerIndex: 0, cardId: r.gameState.players[0].hand[0].id }), /newly drawn/);
  r = transition(r.gameState, { type: "keepDrawn", playerIndex: 0 });
  assert.equal(r.gameState.turn, 1);
  assert.equal(r.gameState.pendingRequest, null);

  const exactA = cf("R", "6"), exactB = cf("R", "6");
  s = state("chaos", [[exactA, cf("Y", "2")], [exactB], [cf("G", "1")], [cf("B", "1")]], cf("R", "3"));
  r = transition(s, { type: "play", playerIndex: 0, cardId: exactA.id });
  assert.equal(r.request.type, "catch");
  r = transition(r.gameState, { type: "passCatch" });
  assert.equal(r.request.type, "jump");
});

test("Light and Dark restricted-wild challenges resolve both branches and last-card penalties first", () => {
  // Light guilty: offender still has prior-colour card and receives two.
  const wd2 = ff("W", "wildDraw2", "W", "wildDrawColor", 50, 60);
  let s = state("flip", [[wd2, ff("R", "4")], [ff("B", "1")], [ff("G", "1")], [ff("Y", "1")]], ff("R", "8"), [ff("B", "2"), ff("G", "2")]);
  let r = transition(s, { type: "play", playerIndex: 0, cardId: wd2.id, color: "B" });
  assert.deepEqual(r.request.options, ["challenge", "accept"]);
  r = transition(r.gameState, { type: "challenge", playerIndex: 1, challenge: true });
  assert.equal(r.gameState.players[0].hand.length, 3);
  assert.equal(r.gameState.turn, 1);

  // Light innocent, last card: challenger draws four, then offender wins.
  const last = ff("W", "wildDraw2", "W", "wildDrawColor", 50, 60);
  s = state("flip", [[last], [ff("B", "1")], [ff("G", "1")], [ff("Y", "1")]], ff("R", "8"), Array.from({ length: 4 }, (_, i) => ff("B", String(i + 2))));
  r = transition(s, { type: "play", playerIndex: 0, cardId: last.id, color: "B" });
  assert.equal(r.gameState.winner, null, "winner waits for challenge");
  r = transition(r.gameState, { type: "challenge", playerIndex: 1 });
  assert.equal(r.gameState.players[1].hand.length, 5);
  assert.equal(r.gameState.winner, 0);

  // Dark guilty draws through chosen colour; exhaustion is safe and target keeps turn.
  const darkWild = ff("W", "wild", "W", "wildDrawColor", 50, 60);
  const offenderColor = ff("R", "3", "P", "3", 3, 3);
  s = state("flip", [[darkWild, offenderColor], [ff("B", "1")], [ff("G", "1")], [ff("Y", "1")]], ff("R", "8", "P", "8"), [ff("B", "2", "O", "2"), ff("G", "2", "V", "2")]);
  s.side = "dark"; s.currentColor = "P";
  r = transition(s, { type: "play", playerIndex: 0, cardId: darkWild.id, color: "O" });
  r = transition(r.gameState, { type: "challenge", playerIndex: 1 });
  assert.equal(r.gameState.players[0].hand.length, 3, "draw stops on the chosen colour and includes it");
  assert.equal(r.gameState.turn, 1);
});

test("Chaos pending-stack table covers Draw Two stack/accept and rejects mixed types", () => {
  const a = cf("R", "draw2"), b = cf("G", "draw2"), wrong = cf("W", "wildDraw4");
  let s = state("chaos", [[a, cf("R", "1")], [b, wrong, cf("Y", "1")], [cf("B", "1")], [cf("G", "1")]], cf("R", "4"), Array.from({ length: 4 }, (_, i) => cf("B", String(i + 2))));
  let r = transition(s, { type: "play", playerIndex: 0, cardId: a.id, saidOnu: true });
  assert.equal(r.gameState.pendingStack.amount, 2);
  assert.equal(canStack(b, r.gameState.pendingStack, r.gameState), true);
  assert.equal(canStack(wrong, r.gameState.pendingStack, r.gameState), false);
  r = transition(r.gameState, { type: "stack", playerIndex: 1, cardId: b.id });
  assert.equal(r.gameState.pendingStack.amount, 4);
  assert.equal(r.gameState.pendingStack.target, 2);
  assert.throws(() => transition(r.gameState, { type: "acceptPenalty", playerIndex: 3 }), /Only the penalty target/);
  r = transition(r.gameState, { type: "acceptPenalty", playerIndex: 2 });
  assert.equal(r.gameState.players[2].hand.length, 5);
  assert.equal(r.gameState.pendingStack, null);
  assert.equal(r.gameState.turn, 3);
});

test("Chaos supports a three-W4 chain and challenges only the latest offender for the entire stack", () => {
  const w0 = cf("W", "wildDraw4"), w1 = cf("W", "wildDraw4"), w2 = cf("W", "wildDraw4");
  let s = state("chaos", [[w0, cf("Y", "1")], [w1, cf("G", "1")], [w2, cf("B", "9")], [cf("R", "1")]], cf("R", "5"), Array.from({ length: 12 }, (_, i) => cf(i % 2 ? "Y" : "G", String(i % 9 + 1))));
  let r = transition(s, { type: "play", playerIndex: 0, cardId: w0.id, color: "G" });
  r = transition(r.gameState, { type: "stack", playerIndex: 1, cardId: w1.id, color: "B" });
  r = transition(r.gameState, { type: "stack", playerIndex: 2, cardId: w2.id, color: "Y" });
  assert.equal(r.gameState.pendingStack.amount, 12);
  assert.equal(r.gameState.pendingStack.latestLegal, false, "latest offender retained the prior chosen colour");
  r = transition(r.gameState, { type: "challenge", playerIndex: 3 });
  assert.equal(r.gameState.players[2].hand.length, 13);
  assert.equal(r.gameState.players[3].hand.length, 1);
  assert.equal(r.gameState.turn, 3);
});

test("final W4 winner waits for an innocent challenge to resolve", () => {
  const w4 = cf("W", "wildDraw4");
  let s = state("chaos", [[w4], [cf("G", "1")], [cf("B", "1")], [cf("Y", "1")]], cf("R", "5"), Array.from({ length: 6 }, (_, i) => cf("B", String(i + 1))));
  let r = transition(s, { type: "play", playerIndex: 0, cardId: w4.id, color: "B" });
  assert.equal(r.gameState.winner, null);
  r = transition(r.gameState, { type: "challenge", playerIndex: 1 });
  assert.equal(r.gameState.players[1].hand.length, 7);
  assert.equal(r.gameState.winner, 0);
});

test("Chaos 7 swaps and 0 rotations move whole hand packets and derive the post-transfer winner", () => {
  const seven = cf("R", "7");
  let s = state("chaos", [[seven], [cf("G", "1"), cf("G", "2")], [cf("B", "1")], [cf("Y", "1")]], cf("R", "5"));
  s.players[1].saidOnu = true;
  let r = transition(s, { type: "play", playerIndex: 0, cardId: seven.id, target: 1 });
  assert.equal(r.gameState.winner, 1, "the target receives the empty hand and wins");
  assert.equal(r.gameState.players[0].saidOnu, true, "Onu state travels with the received packet");
  assert.equal(r.gameState.catchPlayer, null, "transfer does not invent a catch window");

  for (const direction of [1, -1]) {
    const zero = cf("R", "0");
    s = state("chaos", [[zero], [cf("G", "1")], [cf("B", "1")], [cf("Y", "1")]], cf("R", "5"));
    s.direction = direction;
    r = transition(s, { type: "play", playerIndex: 0, cardId: zero.id });
    assert.equal(r.gameState.winner, direction === 1 ? 1 : 3);
  }
});

test("standalone hand swaps and rotations preserve packet declarations in both directions", () => {
  let s = state("chaos", [[cf("R", "1")], [cf("G", "2")], [cf("B", "3")], [cf("Y", "4")]]);
  s.players[0].saidOnu = true;
  swapHands(s, 0, 2);
  assert.equal(s.players[2].saidOnu, true);
  s.direction = -1;
  rotateHands(s);
  assert.equal(s.players[1].saidOnu, true);
});

test("Jump-In exact multiplicity excludes wilds and zero, serializes catch, and re-applies action effects", () => {
  const d2a = cf("R", "draw2"), d2b = cf("R", "draw2");
  let s = state("chaos", [[d2a, cf("Y", "1")], [cf("G", "1")], [d2b, cf("B", "1")], [cf("Y", "2")]], cf("R", "4"), Array.from({ length: 6 }, (_, i) => cf("G", String(i + 2))));
  let r = transition(s, { type: "play", playerIndex: 0, cardId: d2a.id, saidOnu: true });
  assert.equal(r.request.type, "penaltyResponse");
  r = transition(r.gameState, { type: "acceptPenalty", playerIndex: 1 });
  assert.equal(r.request.type, "jump");
  assert.deepEqual(r.request.candidates.map(c => c.playerIndex), [2]);
  r = transition(r.gameState, { type: "jump", playerIndex: 2, cardId: d2b.id, saidOnu: true });
  assert.equal(r.gameState.pendingStack.amount, 2);
  assert.equal(r.gameState.pendingStack.target, 3);

  const zero = cf("R", "0");
  s = state("chaos", [[cf("G", "1")], [zero], [], []], zero);
  assert.deepEqual(jumpCandidates(s, zero, 0), []);

  const exactA = cf("R", "6"), exactB = cf("R", "6");
  s = state("chaos", [[exactA, cf("Y", "2")], [exactB], [cf("G", "1")], [cf("B", "1")]], cf("R", "3"));
  r = transition(s, { type: "play", playerIndex: 0, cardId: exactA.id });
  assert.equal(r.request.type, "catch");
  r = transition(r.gameState, { type: "callOnu", playerIndex: 0 });
  assert.equal(r.request.type, "jump");
});

test("Skip and Reverse resolve before an identical jumping action resolves again", () => {
  for (const symbol of ["skip", "reverse"]) {
    const first = cf("R", symbol), mate = cf("R", symbol);
    let s = state("chaos", [[first, cf("Y", "1")], [cf("G", "1")], [mate, cf("B", "1")], [cf("Y", "2")]], cf("R", "4"));
    let r = transition(s, { type: "play", playerIndex: 0, cardId: first.id, saidOnu: true });
    assert.equal(r.request.type, "jump");
    assert.equal(r.gameState.turn, symbol === "skip" ? 2 : 3, "the first action has already changed turn order");
    r = transition(r.gameState, { type: "jump", playerIndex: 2, cardId: mate.id, saidOnu: true });
    if (symbol === "skip") assert.equal(r.gameState.turn, 0);
    else { assert.equal(r.gameState.direction, 1); assert.equal(r.gameState.turn, 3); }
  }
});

test("Chaos Draw-to-Match terminates and voids a round after a full exhausted lap", () => {
  const top = cf("R", "9");
  let s = state("chaos", [[cf("B", "1")], [cf("G", "2")], [cf("Y", "3")], [cf("B", "4")]], top, []);
  for (let playerIndex = 0; playerIndex < 4; playerIndex++) {
    const r = transition(s, { type: "draw", playerIndex }, createSeededRng(playerIndex));
    s = r.gameState;
    assert.equal(r.request, null);
  }
  assert.equal(s.roundVoid, true);
  assert.equal(s.noProgressTurns, 4);
});

function aiState(mode, cards, top) {
  const spare = mode === "flip" ? ff("B", "2", "O", "2", 2, 2) : cf("B", "2");
  return state(mode, [cards, [spare], [mode === "flip" ? ff("G", "2") : cf("G", "2")], [mode === "flip" ? ff("Y", "2") : cf("Y", "2")]], top);
}

test("all ten snake profiles make legal deterministic decisions in Classic and Flip fixtures", () => {
  for (const mode of ["classic", "flip"]) {
    const top = mode === "flip" ? ff("R", "5", "P", "5", 5, 5) : cf("R", "5");
    const cards = mode === "flip"
      ? [ff("R", "skip", "P", "skipEveryone", 20, 30), ff("G", "5", "T", "5", 5, 5), ff("W", "wild", "W", "wild", 50, 50)]
      : [cf("R", "skip"), cf("G", "5"), cf("W", "wild")];
    const s = aiState(mode, cards, top);
    for (const snake of SNAKES) {
      const move = chooseAiMove(s, 0, snake, createSeededRng(99));
      assert.ok(move, `${snake.name} chooses in ${mode}`);
      assert.ok(legalMoves(s, 0).some(legal => legal.card.id === move.cardId));
    }
  }
});

test("named personality weights cause controlled cross-mode strategy differences", () => {
  for (const mode of ["classic", "flip"]) {
    const make = (color, symbol, darkColor = color, darkSymbol = symbol, p = symbol === "9" ? 9 : 20) =>
      mode === "flip" ? ff(color, symbol, darkColor, darkSymbol, p, p) : cf(color, symbol, p);
    const top = make("R", "5", "P", "5", 5);
    const attack = make("R", mode === "flip" ? "draw1" : "draw2", "P", "draw5");
    const number = make("G", "5", "T", "5", 5);
    const wild = make("W", "wild", "W", "wild", 50);
    let s = aiState(mode, [attack, number, wild], top);
    s.players[1].hand = [s.players[1].hand[0]];
    assert.equal(chooseAiMove(s, 0, "cobra", () => .5).cardId, attack.id);
    assert.notEqual(chooseAiMove(s, 0, "python", () => .5).cardId, wild.id);
    assert.equal(chooseAiMove(s, 0, "sidewinder", () => .5).cardId, attack.id);
    assert.equal(chooseAiMove(s, 0, "taipan", () => .5).cardId, attack.id);

    const high = make("R", "9", "P", "9", 9);
    const low = make("G", "5", "T", "5", 5);
    s = aiState(mode, [high, low], top);
    assert.equal(chooseAiMove(s, 0, "mamba", () => .5).cardId, high.id);
    assert.equal(chooseAiMove(s, 0, "adder", () => .5).cardId, high.id, "exact current colour gets the ambusher bias");

    const restrictedWild = mode === "flip" ? ff("W", "wildDraw2", "W", "wildDrawColor", 50, 60) : cf("W", "wildDraw4");
    const sameColor = make("R", "2", "P", "2", 2);
    s = aiState(mode, [restrictedWild, sameColor], top);
    assert.equal(chooseAiMove(s, 0, "anaconda", () => .2).cardId, sameColor.id);
    assert.equal(chooseAiMove(s, 0, "viper", () => .2).cardId, restrictedWild.id);

    const colorHand = [make("R", "1", "P", "1", 1), make("G", "2", "T", "2", 2), make("G", "3", "T", "3", 3)];
    assert.equal(chooseColor(colorHand, "boa", { mode, side: "light" }), "G");
    const colourTradeoff = [make("R", "1", "P", "1", 1), make("R", "2", "P", "2", 2),
      make("G", mode === "flip" ? "skip" : "draw2", "T", "skipEveryone", 20)];
    assert.equal(chooseColor(colourTradeoff, "boa", { mode, side: "light" }), "R");
    assert.equal(chooseColor(colourTradeoff, "mamba", { mode, side: "light" }), "G");

    const decisions = state(mode, [[make("R", "1")], [make("G", "1")], [make("B", "1")], [make("Y", "1")]], top);
    assert.equal(chooseAiDecision("challenge", decisions, 0, "rattler", () => .5), true);
    assert.equal(chooseAiDecision("challenge", decisions, 0, "anaconda", () => .5), false);
  }
  const chaos = state("chaos", [[cf("R", "1")], [cf("G", "1")], [cf("B", "1")], [cf("Y", "1")]]);
  assert.equal(chooseAiDecision("jump", chaos, 0, "adder", () => .8), true);
  assert.equal(chooseAiDecision("jump", chaos, 0, "anaconda", () => .8), false);
  assert.ok(chooseAiDecision("jumpDelay", chaos, 0, "adder") < chooseAiDecision("jumpDelay", chaos, 0, "anaconda"));
  assert.equal(chooseAiDecision("challenge", chaos, 0, "rattler", () => .5), true);
  assert.equal(chooseAiDecision("challenge", chaos, 0, "anaconda", () => .5), false);
});

test("restricted-wild bluffs are legal engine moves but remain challengeable", () => {
  const w4 = cf("W", "wildDraw4"), red = cf("R", "2");
  let s = state("classic", [[w4, red], [cf("G", "1")], [cf("B", "1")], [cf("Y", "1")]], cf("R", "7"), Array.from({ length: 4 }, (_, i) => cf("G", String(i + 2))));
  assert.equal(isPlayable(w4, s), true);
  let r = transition(s, { type: "play", playerIndex: 0, cardId: w4.id, color: "G" });
  assert.equal(r.gameState.pendingStack.latestLegal, false);
  r = transition(r.gameState, { type: "challenge", playerIndex: 1 });
  assert.equal(r.gameState.players[0].hand.length, 5);
  assert.equal(r.gameState.turn, 1);
});

for (const mode of ["classic", "flip", "chaos"]) {
  test(`seeded ${mode} simulation keeps moves legal and physical-card invariants intact`, () => {
    const rng = createSeededRng({ classic: 11, flip: 22, chaos: 33 }[mode]);
    let s = createGameState({ mode, rng });
    for (let step = 0; step < 160 && s.winner == null && !s.roundVoid; step++) {
      assertState(s);
      let command;
      if (s.pendingStack) command = { type: "acceptPenalty", playerIndex: s.pendingStack.target };
      else if (s.catchPlayer != null) command = { type: "callOnu", playerIndex: s.catchPlayer };
      else if (s.jumpWindow) command = { type: "passJump" };
      else {
        const move = chooseAiMove(s, s.turn, s.players[s.turn].profile, rng);
        command = move
          ? { type: "play", playerIndex: s.turn, cardId: move.cardId, color: move.color, target: move.target, saidOnu: true }
          : { type: "draw", playerIndex: s.turn };
      }
      const legalBefore = command.type !== "play" || legalMoves(s, command.playerIndex).some(move => move.card.id === command.cardId);
      assert.equal(legalBefore, true);
      let result = transition(s, command, rng);
      s = result.gameState;
      if (result.request?.type === "playDrawn") {
        result = transition(s, { type: "play", playerIndex: result.request.playerIndex, cardId: result.request.cardId,
          color: chooseColor(s.players[result.request.playerIndex].hand, s.players[result.request.playerIndex].profile, s),
          target: mode === "chaos" ? ((result.request.playerIndex + 1) % s.players.length) : null, saidOnu: true }, rng);
        s = result.gameState;
      }
      assertState(s);
    }
  });
}
