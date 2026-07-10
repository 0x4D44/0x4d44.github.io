'use strict';

const assert = require('node:assert/strict');
const E = require('./engine.js');

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`✓ ${name}\n`);
  } catch (error) {
    process.stderr.write(`✗ ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test('deck contains 52 unique cards', () => {
  const deck = E.makeDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((card) => card.id)).size, 52);
});

test('every tide track has one zero, one two, and balanced marks', () => {
  for (let n = 3; n <= 8; n += 1) {
    for (let seed = 0; seed < 100; seed += 1) {
      const tide = E.chooseTide(n, E.mulberry32(seed));
      const track = E.tideTrack(tide, n);
      assert.notEqual(tide.slack, tide.surge);
      assert.equal(track.filter((value) => value === 0).length, 1);
      assert.equal(track.filter((value) => value === 2).length, 1);
      assert.equal(track.reduce((sum, value) => sum + value, 0), n);
    }
  }
});

test('deals are deterministic and contain no duplicates', () => {
  const a = E.newMatch({ seed: 123456, dealer: 3 });
  const b = E.newMatch({ seed: 123456, dealer: 3 });
  assert.deepEqual(a.hands, b.hands);
  const ids = a.hands.flat().map((card) => card.id);
  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, ids.length);
});

test('dealer hook forbids total bids equalling available marks', () => {
  const state = E.newMatch({ seed: 7, dealer: 3 });
  E.placeBid(state, 0, 1);
  E.placeBid(state, 1, 0);
  E.placeBid(state, 2, 1);
  assert.equal(state.bidTurn, 3);
  assert.equal(E.forbiddenDealerBid(state, 3), 1);
  assert(!E.validBids(state, 3).includes(1));
  assert.throws(() => E.placeBid(state, 3, 1));
});

test('players must follow suit when able', () => {
  const hand = [
    { s: 'H', r: 9, id: 'H9' },
    { s: 'S', r: 14, id: 'S14' },
  ];
  const trick = [{ seat: 1, card: { s: 'H', r: 4, id: 'H4' } }];
  assert.deepEqual(E.legalCards(hand, trick).map((card) => card.id), ['H9']);
  assert(E.isLegalCard(hand, trick, 'H9'));
  assert(!E.isLegalCard(hand, trick, 'S14'));
});

test('trump beats a higher led-suit card', () => {
  const trick = [
    { seat: 0, card: { s: 'H', r: 14, id: 'H14' } },
    { seat: 1, card: { s: 'H', r: 13, id: 'H13' } },
    { seat: 2, card: { s: 'S', r: 2, id: 'S2' } },
    { seat: 3, card: { s: 'C', r: 14, id: 'C14' } },
  ];
  assert.equal(E.winningPlay(trick, 'S').seat, 2);
  assert.equal(E.winningPlay(trick, 'N').seat, 0);
});

test('round scoring rewards exact calls and crest bonus', () => {
  const state = E.newMatch({ seed: 2 });
  state.bids = [2, 1, 0, 0];
  state.marks = [2, 0, 1, 0];
  state.highTideWinner = 0;
  const results = E.scoreRound(state);
  assert.equal(results[0].delta, 19); // 12 + 4 + 3
  assert.equal(results[1].delta, -3);
  assert.equal(results[2].delta, -3);
  assert.equal(results[3].delta, 12);
});

function autoplay(seed, difficulty) {
  const state = E.newMatch({ seed, difficulty });
  let guard = 0;
  while (state.phase !== 'matchEnd' && guard < 10000) {
    guard += 1;
    if (state.phase === 'bid') {
      const seat = state.bidTurn;
      const choice = E.chooseBid(state, seat, { difficulty });
      E.placeBid(state, seat, choice.bid);
    } else if (state.phase === 'play') {
      if (state.trickComplete) E.collectTrick(state);
      else {
        const seat = state.turn;
        const choice = E.chooseAiCard(state, seat, { difficulty });
        E.playCard(state, seat, choice.card.id);
      }
    } else if (state.phase === 'roundEnd') {
      const round = state.roundResult;
      assert.equal(round.deltas.reduce((sum, result) => sum + result.marks, 0), round.handSize);
      assert(state.hands.every((hand) => hand.length === 0));
      E.advanceRound(state);
    } else {
      throw new Error(`Unknown phase: ${state.phase}`);
    }
  }
  assert(guard < 10000, 'autoplay guard exhausted');
  assert.equal(state.history.length, E.HAND_PATTERN.length);
  assert.equal(state.scores.length, 4);
  assert(E.validateState(state).ok, E.validateState(state).errors.join(', '));
  return state;
}

test('AI can finish complete matches without illegal moves', () => {
  for (const difficulty of ['drift', 'current', 'gale']) {
    for (let seed = 1; seed <= 50; seed += 1) autoplay(seed * 7919, difficulty);
  }
});

if (!process.exitCode) process.stdout.write('\nAll Tidecall engine tests passed.\n');
