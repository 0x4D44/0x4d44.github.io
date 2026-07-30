/* Tidecall game engine — pure, dependency-free, browser + Node compatible. */
(function attachTidecallEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TidecallEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildEngine() {
  'use strict';

  const VERSION = 1;
  const SUITS = ['S', 'H', 'D', 'C'];
  const SUIT_META = {
    S: { glyph: '♠', name: 'Spades', colour: 'black' },
    H: { glyph: '♥', name: 'Hearts', colour: 'red' },
    D: { glyph: '♦', name: 'Diamonds', colour: 'red' },
    C: { glyph: '♣', name: 'Clubs', colour: 'black' },
    N: { glyph: '◎', name: 'No Trump', colour: 'black' },
  };
  const HAND_PATTERN = [3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3];
  const TRUMP_PATTERN = ['S', 'H', 'D', 'C', 'N', 'H', 'S', 'C', 'D', 'N', 'S'];
  const SEAT_NAMES = ['You', 'Mara', 'Brine', 'Nix'];
  const PERSONAS = [
    { key: 'human', label: 'the navigator', bias: 0, risk: 0.5, skill: 1 },
    { key: 'surveyor', label: 'charts every current', bias: -0.05, risk: 0.42, skill: 0.9 },
    { key: 'raider', label: 'hunts the high tide', bias: 0.22, risk: 0.72, skill: 0.78 },
    { key: 'keeper', label: 'waits for the safe light', bias: -0.18, risk: 0.28, skill: 0.84 },
  ];

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const mod = (n, m) => ((n % m) + m) % m;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const values = new Uint32Array(1);
        crypto.getRandomValues(values);
        return values[0] >>> 0;
      }
    } catch (_) {}
    return ((Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0);
  }

  function roundSeed(matchSeed, roundIndex) {
    let x = (matchSeed + Math.imul(roundIndex + 1, 0x9E3779B9)) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7FEB352D) >>> 0;
    x ^= x >>> 15;
    x = Math.imul(x, 0x846CA68B) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
  }

  function cardId(card) {
    return `${card.s}${card.r}`;
  }

  function rankLabel(rank) {
    return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[rank] || String(rank);
  }

  function cardLabel(card) {
    const meta = SUIT_META[card.s];
    return `${rankLabel(card.r)}${meta.glyph}`;
  }

  function makeDeck() {
    const deck = [];
    for (const s of SUITS) {
      for (let r = 2; r <= 14; r += 1) deck.push({ s, r, id: `${s}${r}` });
    }
    return deck;
  }

  function shuffle(array, rng) {
    const out = array.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function sortHand(hand) {
    const order = { S: 0, H: 1, D: 2, C: 3 };
    return hand.slice().sort((a, b) => order[a.s] - order[b.s] || b.r - a.r);
  }

  function cardsForRound(roundIndex) {
    return HAND_PATTERN[roundIndex];
  }

  function trumpForRound(roundIndex) {
    return TRUMP_PATTERN[roundIndex];
  }

  function trickValue(tide, trickIndex) {
    if (trickIndex === tide.slack) return 0;
    if (trickIndex === tide.surge) return 2;
    return 1;
  }

  function tideTrack(tide, handSize) {
    return Array.from({ length: handSize }, (_, index) => trickValue(tide, index));
  }

  function chooseTide(handSize, rng) {
    const centreBias = Array.from({ length: handSize }, (_, i) => {
      const edge = Math.min(i, handSize - 1 - i);
      return 1 + edge * 0.32;
    });
    function weightedPick(exclude) {
      const total = centreBias.reduce((sum, weight, index) => sum + (index === exclude ? 0 : weight), 0);
      let needle = rng() * total;
      for (let i = 0; i < handSize; i += 1) {
        if (i === exclude) continue;
        needle -= centreBias[i];
        if (needle <= 0) return i;
      }
      return mod((exclude || 0) + 1, handSize);
    }
    const surge = weightedPick(-1);
    const slack = weightedPick(surge);
    return { slack, surge };
  }

  function createRound(roundIndex, dealer, matchSeed) {
    const handSize = cardsForRound(roundIndex);
    const rng = mulberry32(roundSeed(matchSeed, roundIndex));
    const deck = shuffle(makeDeck(), rng);
    const hands = [0, 1, 2, 3].map((seat) => sortHand(deck.slice(seat * handSize, (seat + 1) * handSize)));
    const first = mod(dealer + 1, 4);
    const tide = chooseTide(handSize, rng);
    return {
      phase: 'bid',
      handSize,
      trump: trumpForRound(roundIndex),
      tide,
      hands,
      bids: [null, null, null, null],
      marks: [0, 0, 0, 0],
      physicalTricks: [0, 0, 0, 0],
      highTideWinner: null,
      bidTurn: first,
      leader: first,
      turn: first,
      trickIndex: 0,
      trick: [],
      trickComplete: false,
      pendingWinner: null,
      trickHistory: [],
      played: [],
      voids: [{}, {}, {}, {}],
      roundResult: null,
    };
  }

  function newMatch(options) {
    const opts = options || {};
    const seed = Number.isInteger(opts.seed) ? opts.seed >>> 0 : randomSeed();
    const dealer = Number.isInteger(opts.dealer) ? mod(opts.dealer, 4) : 3;
    const base = {
      version: VERSION,
      seed,
      difficulty: ['drift', 'current', 'gale'].includes(opts.difficulty) ? opts.difficulty : 'current',
      roundIndex: 0,
      dealer,
      scores: [0, 0, 0, 0],
      history: [],
      startedAt: Date.now(),
      completedAt: null,
      winnerSeats: [],
    };
    return Object.assign(base, createRound(0, dealer, seed));
  }

  function forbiddenDealerBid(state, seat) {
    if (seat !== state.dealer) return null;
    const others = state.bids.reduce((sum, bid, index) => sum + (index === seat || bid == null ? 0 : bid), 0);
    const forbidden = state.handSize - others;
    return forbidden >= 0 && forbidden <= state.handSize ? forbidden : null;
  }

  function validBids(state, seat) {
    if (state.phase !== 'bid' || state.bidTurn !== seat) return [];
    const forbidden = forbiddenDealerBid(state, seat);
    return Array.from({ length: state.handSize + 1 }, (_, bid) => bid).filter((bid) => bid !== forbidden);
  }

  function placeBid(state, seat, bid) {
    if (state.phase !== 'bid') throw new Error('Bids are closed.');
    if (state.bidTurn !== seat) throw new Error('It is not that player’s turn to bid.');
    if (!Number.isInteger(bid) || !validBids(state, seat).includes(bid)) throw new Error('That bid is not legal.');
    state.bids[seat] = bid;
    let next = mod(seat + 1, 4);
    if (state.bids.every((value) => value != null)) {
      state.phase = 'play';
      state.turn = state.leader;
      state.bidTurn = null;
    } else {
      while (state.bids[next] != null) next = mod(next + 1, 4);
      state.bidTurn = next;
    }
    return state;
  }

  function legalCards(hand, trick) {
    if (!trick || trick.length === 0) return hand.slice();
    const leadSuit = trick[0].card.s;
    const followers = hand.filter((card) => card.s === leadSuit);
    return followers.length ? followers : hand.slice();
  }

  function isLegalCard(hand, trick, id) {
    return legalCards(hand, trick).some((card) => card.id === id);
  }

  function beats(challenger, incumbent, leadSuit, trump) {
    const trumpActive = trump && trump !== 'N';
    const challengerTrump = trumpActive && challenger.s === trump;
    const incumbentTrump = trumpActive && incumbent.s === trump;
    if (challengerTrump !== incumbentTrump) return challengerTrump;
    if (challenger.s === incumbent.s) return challenger.r > incumbent.r;
    if (challengerTrump && incumbentTrump) return challenger.r > incumbent.r;
    if (challenger.s === leadSuit && incumbent.s !== leadSuit) return true;
    return false;
  }

  function winningPlay(trick, trump) {
    if (!Array.isArray(trick) || trick.length === 0) return null;
    const leadSuit = trick[0].card.s;
    let winner = trick[0];
    for (let i = 1; i < trick.length; i += 1) {
      if (beats(trick[i].card, winner.card, leadSuit, trump)) winner = trick[i];
    }
    return winner;
  }

  function playCard(state, seat, id) {
    if (state.phase !== 'play') throw new Error('Cards cannot be played right now.');
    if (state.trickComplete) throw new Error('The trick is already complete.');
    if (state.turn !== seat) throw new Error('It is not that player’s turn.');
    const hand = state.hands[seat];
    const index = hand.findIndex((card) => card.id === id);
    if (index < 0) throw new Error('That card is not in the hand.');
    const card = hand[index];
    if (!isLegalCard(hand, state.trick, id)) throw new Error('You must follow the led suit.');

    if (state.trick.length > 0) {
      const leadSuit = state.trick[0].card.s;
      if (card.s !== leadSuit) state.voids[seat][leadSuit] = true;
    }

    hand.splice(index, 1);
    state.trick.push({ seat, card });
    state.played.push(card);
    if (state.trick.length === 4) {
      const winner = winningPlay(state.trick, state.trump);
      state.pendingWinner = winner.seat;
      state.trickComplete = true;
      state.turn = null;
    } else {
      state.turn = mod(seat + 1, 4);
    }
    return state;
  }

  function scoreRound(state) {
    const deltas = state.bids.map((bid, seat) => {
      const exact = state.marks[seat] === bid;
      const distance = Math.abs(state.marks[seat] - bid);
      const base = exact ? 12 + bid * 2 : -distance * 3;
      const crest = exact && state.highTideWinner === seat ? 3 : 0;
      return { seat, bid, marks: state.marks[seat], exact, distance, base, crest, delta: base + crest };
    });
    deltas.forEach((result) => { state.scores[result.seat] += result.delta; });
    return deltas;
  }

  function collectTrick(state) {
    if (state.phase !== 'play' || !state.trickComplete || state.pendingWinner == null) {
      throw new Error('There is no completed trick to collect.');
    }
    const winner = state.pendingWinner;
    const value = trickValue(state.tide, state.trickIndex);
    state.marks[winner] += value;
    state.physicalTricks[winner] += 1;
    if (state.trickIndex === state.tide.surge) state.highTideWinner = winner;
    state.trickHistory.push({
      index: state.trickIndex,
      value,
      winner,
      plays: state.trick.map((play) => ({ seat: play.seat, card: Object.assign({}, play.card) })),
    });
    state.trickIndex += 1;
    state.leader = winner;
    state.turn = winner;
    state.trick = [];
    state.trickComplete = false;
    state.pendingWinner = null;

    if (state.trickIndex >= state.handSize) {
      const deltas = scoreRound(state);
      state.phase = 'roundEnd';
      state.turn = null;
      state.roundResult = {
        roundIndex: state.roundIndex,
        handSize: state.handSize,
        trump: state.trump,
        tide: Object.assign({}, state.tide),
        highTideWinner: state.highTideWinner,
        deltas,
      };
      state.history.push(JSON.parse(JSON.stringify(state.roundResult)));
    }
    return state;
  }

  function advanceRound(state) {
    if (state.phase !== 'roundEnd') throw new Error('The round is not over.');
    if (state.roundIndex >= HAND_PATTERN.length - 1) {
      state.phase = 'matchEnd';
      state.completedAt = Date.now();
      const high = Math.max(...state.scores);
      state.winnerSeats = state.scores.map((score, seat) => score === high ? seat : -1).filter((seat) => seat >= 0);
      return state;
    }
    state.roundIndex += 1;
    state.dealer = mod(state.dealer + 1, 4);
    const next = createRound(state.roundIndex, state.dealer, state.seed);
    Object.assign(state, next);
    return state;
  }

  function rankPressure(rank) {
    if (rank === 14) return 0.94;
    if (rank === 13) return 0.72;
    if (rank === 12) return 0.52;
    if (rank === 11) return 0.37;
    if (rank === 10) return 0.27;
    return clamp((rank - 2) / 42, 0.03, 0.24);
  }

  function estimateHand(hand, trump, persona) {
    const bySuit = Object.fromEntries(SUITS.map((suit) => [suit, []]));
    hand.forEach((card) => bySuit[card.s].push(card));
    const trumps = trump && trump !== 'N' ? bySuit[trump].length : 0;
    let estimate = 0;

    for (const suit of SUITS) {
      const cards = bySuit[suit].slice().sort((a, b) => b.r - a.r);
      const isTrump = trump !== 'N' && suit === trump;
      cards.forEach((card, index) => {
        let value = rankPressure(card.r);
        if (isTrump) {
          value = 0.12 + value * 0.88;
          if (index >= 2) value += 0.06;
        } else {
          if (index > 0 && card.r < 13) value *= 0.76;
          if (cards.length >= 4 && card.r <= 11) value *= 0.82;
        }
        estimate += value;
      });
    }

    if (trumps > 0) {
      const shortSuits = SUITS.filter((suit) => suit !== trump && bySuit[suit].length <= 1).length;
      estimate += Math.min(trumps, shortSuits) * 0.16;
      estimate += Math.max(0, trumps - 3) * 0.12;
    }

    if (trump === 'N') {
      const aces = hand.filter((card) => card.r === 14).length;
      const protectedKings = SUITS.filter((suit) => bySuit[suit].some((card) => card.r === 13) && bySuit[suit].length <= 3).length;
      estimate += aces * 0.08 + protectedKings * 0.05;
    }

    const p = persona || PERSONAS[1];
    estimate += p.bias || 0;
    return clamp(estimate, 0, hand.length);
  }

  function bidNoise(difficulty, rng) {
    const spread = difficulty === 'gale' ? 0.12 : difficulty === 'drift' ? 0.62 : 0.32;
    return (rng() + rng() - 1) * spread;
  }

  function nearestLegalBid(estimate, legal, risk) {
    return legal.slice().sort((a, b) => {
      const da = Math.abs(a - estimate);
      const db = Math.abs(b - estimate);
      if (Math.abs(da - db) > 1e-8) return da - db;
      return risk >= 0.5 ? b - a : a - b;
    })[0];
  }

  function chooseBid(state, seat, options) {
    const opts = options || {};
    const legal = validBids(state, seat);
    if (!legal.length) throw new Error('No legal bid is available.');
    const persona = PERSONAS[seat] || PERSONAS[1];
    const seed = ((state.seed ^ Math.imul(state.roundIndex + 17, 2654435761) ^ Math.imul(seat + 3, 2246822519) ^ (state.history.length << 9)) >>> 0);
    const rng = opts.rng || mulberry32(seed);
    let estimate = estimateHand(state.hands[seat], state.trump, persona);
    estimate += bidNoise(opts.difficulty || state.difficulty, rng);

    // On short rounds, a single top trump matters more than raw linear estimates suggest.
    if (state.handSize <= 4 && state.trump !== 'N' && state.hands[seat].some((card) => card.s === state.trump && card.r >= 13)) estimate += 0.18;
    const bid = nearestLegalBid(estimate, legal, persona.risk);
    return { bid, estimate, legal };
  }

  function cardResource(card, hand, trump) {
    const rank = (card.r - 2) / 12;
    const trumpBoost = trump !== 'N' && card.s === trump ? 0.48 : 0;
    const suitLength = hand.filter((other) => other.s === card.s).length;
    const scarcity = suitLength <= 1 ? 0.12 : 0;
    return rank + trumpBoost + scarcity;
  }

  function winChanceForPlay(state, seat, card) {
    const trick = state.trick;
    const remainingPlayers = 3 - trick.length;
    if (trick.length === 3) {
      const candidate = trick.concat({ seat, card });
      return winningPlay(candidate, state.trump).seat === seat ? 1 : 0;
    }

    const leadSuit = trick.length ? trick[0].card.s : card.s;
    const candidate = trick.concat({ seat, card });
    const currentlyWinning = winningPlay(candidate, state.trump).seat === seat;
    if (!currentlyWinning) return 0;

    const isTrump = state.trump !== 'N' && card.s === state.trump;
    let percentile = clamp((card.r - 1.5) / 13, 0.05, 0.98);
    if (isTrump) percentile = clamp(0.22 + percentile * 0.78, 0.1, 0.995);
    else if (card.s !== leadSuit) percentile *= 0.15;

    let chance = Math.pow(percentile, Math.max(1, remainingPlayers * 0.82));
    if (!isTrump && state.trump !== 'N') {
      let ruffRisk = 0;
      for (let offset = 1; offset <= remainingPlayers; offset += 1) {
        const futureSeat = mod(seat + offset, 4);
        if (state.voids[futureSeat] && state.voids[futureSeat][leadSuit]) ruffRisk += 0.24;
        else ruffRisk += 0.08;
      }
      chance *= clamp(1 - ruffRisk, 0.18, 1);
    }
    return clamp(chance, 0, 1);
  }

  function remainingMarkValue(state, includeCurrent) {
    let sum = 0;
    const start = includeCurrent ? state.trickIndex : state.trickIndex + 1;
    for (let index = start; index < state.handSize; index += 1) sum += trickValue(state.tide, index);
    return sum;
  }

  function desiredWinLevel(state, seat) {
    const bid = state.bids[seat] || 0;
    const need = bid - state.marks[seat];
    const current = trickValue(state.tide, state.trickIndex);
    const future = remainingMarkValue(state, false);
    if (need <= 0) return 0.03;
    if (need > future) return 0.98;
    if (current === 0) {
      const nextIsSurge = state.trickIndex + 1 === state.tide.surge;
      return nextIsSurge && need >= 2 ? 0.26 : 0.06;
    }
    let desire = need / Math.max(1, current + future);
    if (current === 2) {
      if (need >= 2) desire += 0.34;
      else if (need === 1) desire += 0.08;
      else desire -= 0.25;
    }
    if (need === current && future <= 2) desire += 0.18;
    return clamp(desire, 0.02, 0.99);
  }

  function chooseAiCard(state, seat, options) {
    const opts = options || {};
    if (state.phase !== 'play' || state.turn !== seat) throw new Error('AI cannot play now.');
    const hand = state.hands[seat];
    const legal = legalCards(hand, state.trick);
    const desire = desiredWinLevel(state, seat);
    const currentValue = trickValue(state.tide, state.trickIndex);
    const persona = PERSONAS[seat] || PERSONAS[1];
    const difficulty = opts.difficulty || state.difficulty;
    const seed = ((state.seed ^ Math.imul(state.roundIndex + 41, 1597334677) ^ Math.imul(state.trickIndex + 7, 3812015801) ^ Math.imul(seat + 5, 958689161) ^ state.played.length) >>> 0);
    const rng = opts.rng || mulberry32(seed);

    const scored = legal.map((card) => {
      const winChance = winChanceForPlay(state, seat, card);
      const resource = cardResource(card, hand, state.trump);
      let score = (desire * winChance + (1 - desire) * (1 - winChance)) * 100;

      // Keep powerful cards for later unless this is High Tide or we urgently need the current marks.
      const conservation = currentValue === 2 ? 0.12 : currentValue === 0 ? 0.82 : 0.42;
      score -= resource * conservation * 22;

      // Slack Water is a good place to bury a dangerous winner, provided it will not take the trick.
      if (currentValue === 0 && winChance < 0.28) score += resource * 20;

      // When trying to win, prefer the cheapest likely winner; when ducking, prefer the safest loser.
      if (desire > 0.58 && winChance > 0.55) score -= resource * 7;
      if (desire < 0.42 && winChance < 0.2) score += resource * 4;

      // Brine stretches for the crest; Nix protects exact contracts.
      if (currentValue === 2) score += (persona.risk - 0.5) * winChance * 18;

      const noiseScale = difficulty === 'gale' ? 1.5 : difficulty === 'drift' ? 10 : 4.5;
      score += (rng() - 0.5) * noiseScale;
      return { card, score, winChance, resource };
    });

    scored.sort((a, b) => b.score - a.score || a.resource - b.resource || a.card.r - b.card.r);
    return { card: scored[0].card, desire, choices: scored };
  }

  function standings(state) {
    return state.scores
      .map((score, seat) => ({ seat, name: SEAT_NAMES[seat], score }))
      .sort((a, b) => b.score - a.score || a.seat - b.seat);
  }

  function validateState(state) {
    const errors = [];
    if (!state || state.version !== VERSION) errors.push('Unsupported save version.');
    if (!Number.isInteger(state.roundIndex) || state.roundIndex < 0 || state.roundIndex >= HAND_PATTERN.length) errors.push('Invalid round.');
    if (!Array.isArray(state.scores) || state.scores.length !== 4) errors.push('Invalid scores.');
    if (!Array.isArray(state.hands) || state.hands.length !== 4) errors.push('Invalid hands.');
    if (!state.tide || state.tide.slack === state.tide.surge) errors.push('Invalid tide positions.');
    if (state.handSize && tideTrack(state.tide, state.handSize).reduce((a, b) => a + b, 0) !== state.handSize) errors.push('Tide marks do not balance.');
    const ids = [];
    if (Array.isArray(state.hands)) state.hands.flat().forEach((card) => ids.push(card.id || cardId(card)));
    // `played` already includes cards in the live trick, so do not count `trick` twice.
    if (Array.isArray(state.played)) state.played.forEach((card) => ids.push(card.id || cardId(card)));
    if (new Set(ids).size !== ids.length) errors.push('Duplicate cards in state.');
    return { ok: errors.length === 0, errors };
  }

  return {
    VERSION,
    SUITS,
    SUIT_META,
    HAND_PATTERN,
    TRUMP_PATTERN,
    SEAT_NAMES,
    PERSONAS,
    clamp,
    mod,
    mulberry32,
    randomSeed,
    cardId,
    rankLabel,
    cardLabel,
    makeDeck,
    shuffle,
    sortHand,
    cardsForRound,
    trumpForRound,
    trickValue,
    tideTrack,
    chooseTide,
    createRound,
    newMatch,
    forbiddenDealerBid,
    validBids,
    placeBid,
    legalCards,
    isLegalCard,
    beats,
    winningPlay,
    playCard,
    collectTrick,
    scoreRound,
    advanceRound,
    estimateHand,
    chooseBid,
    winChanceForPlay,
    desiredWinLevel,
    chooseAiCard,
    standings,
    validateState,
  };
});
