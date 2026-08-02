'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./stratego-core.js');

function started(seed = 1, options = {}) {
  let state = C.createState({ seed, options });
  state = C.deployFormation(state, 'red', 'fortress', seed * 13 + 1);
  state = C.deployFormation(state, 'blue', 'spearhead', seed * 13 + 2);
  return C.beginGame(state);
}

function scenario(placements, current = 'red', options = {}) {
  let state = C.createState({ seed: 98765, options: { threefoldDraw: false, ...options } });
  state.deployed.red = true;
  state.deployed.blue = true;
  state.phase = 'play';
  state.current = current;
  state.setupSide = null;
  state.board.fill(null);
  state.captured = { red: [], blue: [] };
  const used = new Set();
  for (const piece of Object.values(state.pieces)) {
    piece.alive = false;
    piece.row = null;
    piece.col = null;
    piece.revealed = false;
    piece.moved = false;
  }
  for (const entry of placements) {
    const piece = Object.values(state.pieces).find(candidate => candidate.color === entry.color && candidate.type === entry.type && !used.has(candidate.id));
    assert.ok(piece, `missing ${entry.color} ${entry.type}`);
    used.add(piece.id);
    piece.alive = true;
    piece.row = entry.row;
    piece.col = entry.col;
    piece.revealed = !!entry.revealed;
    piece.moved = !!entry.moved;
    state.board[C.boardIndex(entry.row, entry.col)] = piece.id;
    entry.id = piece.id;
  }
  for (const piece of Object.values(state.pieces)) if (!piece.alive) state.captured[piece.color].push(piece.type);
  state.positionCounts = { [C.positionKey(state)]: 1 };
  C.assertValidState(state);
  return state;
}

function flagOf(state, color) {
  return Object.values(state.pieces).find(piece => piece.color === color && piece.type === 'flag');
}

function findMove(state, pieceId, row, col) {
  return C.legalMovesForPiece(state, pieceId).find(move => move.to.row === row && move.to.col === col);
}

test('canonical army contains all 40 pieces in the classic counts', () => {
  assert.equal(C.MANIFEST.length, 40);
  for (const type of C.TYPE_ORDER) assert.equal(C.MANIFEST.filter(item => item === type).length, C.RANKS[type].count);
  assert.equal(C.RANKS.scout.count, 8);
  assert.equal(C.RANKS.bomb.count, 6);
});

test('printed rank marks follow the classic order, with 1 the strongest', () => {
  assert.deepEqual(C.TYPE_ORDER.map(type => C.RANKS[type].short), ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'S', 'B', 'F']);
  const numbered = C.TYPE_ORDER.filter(type => /^[0-9]+$/.test(C.RANKS[type].short));
  for (let i = 1; i < numbered.length; i += 1) {
    const stronger = C.RANKS[numbered[i - 1]];
    const weaker = C.RANKS[numbered[i]];
    assert.ok(Number(stronger.short) < Number(weaker.short), `${stronger.name} should print a lower number than ${weaker.name}`);
    assert.ok(stronger.strength > weaker.strength, `${stronger.name} should beat ${weaker.name}`);
  }
});

test('all embedded formations match the canonical manifest', () => {
  for (const formation of Object.values(C.FORMATIONS)) {
    assert.equal(formation.length, 40);
    assert.deepEqual(formation.slice().sort(), C.MANIFEST.slice().sort());
  }
});

test('deployment fills only the four home rows and both armies can begin', () => {
  const state = started(3);
  assert.equal(state.phase, 'play');
  assert.equal(Object.values(state.pieces).filter(piece => piece.color === 'red' && piece.row >= 6).length, 40);
  assert.equal(Object.values(state.pieces).filter(piece => piece.color === 'blue' && piece.row <= 3).length, 40);
});

test('random formations are deterministic for a seed and preserve counts', () => {
  let a = C.createState({ seed: 7 });
  let b = C.createState({ seed: 7 });
  a = C.deployFormation(a, 'red', 'random', 44);
  b = C.deployFormation(b, 'red', 'random', 44);
  const types = state => C.homeCells('red').map(({ row, col }) => state.pieces[state.board[C.boardIndex(row, col)]].type);
  assert.deepEqual(types(a), types(b));
  assert.deepEqual(types(a).slice().sort(), C.MANIFEST.slice().sort());
});

test('each formation hides the flag in its own column, and orientation varies by seed', () => {
  const columns = {};
  for (const name of Object.keys(C.FORMATIONS)) {
    columns[name] = new Set();
    for (let seed = 1; seed <= 30; seed += 1) {
      let state = C.createState({ seed });
      state = C.deployFormation(state, 'red', name, seed);
      columns[name].add(flagOf(state, 'red').col);
    }
    // Both orientations must appear, or the layout would be fixed for a formation.
    assert.equal(columns[name].size, 2, `${name} is always laid down the same way round`);
  }
  const all = Object.values(columns).flatMap(set => [...set]);
  assert.equal(new Set(all).size, all.length, 'two formations can hide the flag in the same column');
});

test('armies drawn from different formations never share a flag column', () => {
  const names = Object.keys(C.FORMATIONS);
  for (let seed = 1; seed <= 20; seed += 1) {
    for (const red of names) {
      for (const blue of names) {
        if (red === blue) continue;
        let state = C.createState({ seed });
        state = C.deployFormation(state, 'red', red, seed ^ 0x1111);
        state = C.deployFormation(state, 'blue', blue, seed ^ 0x2222);
        assert.notEqual(flagOf(state, 'red').col, flagOf(state, 'blue').col, `${red} v ${blue} put both flags in one column`);
      }
    }
  }
});

test('a formation shared by both armies is not always a reflection', () => {
  const army = (state, color) => C.homeCells(color).map(({ row, col }) => state.pieces[state.board[C.boardIndex(row, col)]].type).join();
  let reflected = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    let state = C.createState({ seed });
    state = C.deployFormation(state, 'red', 'fortress', seed ^ 0x1111);
    state = C.deployFormation(state, 'blue', 'fortress', seed ^ 0x2222);
    // Read back row first in the same column order for both sides: matching
    // sequences mean one army is the other's mirror image across the lakes.
    if (army(state, 'red') === army(state, 'blue')) reflected += 1;
  }
  assert.ok(reflected > 0 && reflected < 40, `orientation should be drawn per army, got ${reflected}/40 reflected`);
});

test('setup pieces can be swapped without changing the manifest', () => {
  let state = C.createState({ seed: 8 });
  state = C.deployFormation(state, 'red', 'fortress', 9);
  const [a, b] = C.homeCells('red').slice(0, 2).map(({ row, col }) => state.board[C.boardIndex(row, col)]);
  const beforeA = { row: state.pieces[a].row, col: state.pieces[a].col };
  state = C.swapSetupPieces(state, 'red', a, b);
  assert.deepEqual({ row: state.pieces[b].row, col: state.pieces[b].col }, beforeA);
  C.assertValidState(state);
});

test('lakes are impassable and never offered as destinations', () => {
  const red = { color: 'red', type: 'scout', row: 6, col: 2 };
  const state = scenario([red, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'flag', row: 0, col: 9 }, { color: 'blue', type: 'sergeant', row: 0, col: 0 }]);
  assert.ok(!C.legalMovesForPiece(state, red.id).some(move => C.isLake(move.to.row, move.to.col)));
  assert.ok(!findMove(state, red.id, 3, 2), 'Scout may not cross a lake');
});

test('Scout travels any clear orthogonal distance and stops at the first piece', () => {
  const scout = { color: 'red', type: 'scout', row: 6, col: 0 };
  const enemy = { color: 'blue', type: 'sergeant', row: 2, col: 0 };
  const state = scenario([scout, enemy, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'flag', row: 0, col: 9 }, { color: 'blue', type: 'scout', row: 0, col: 1 }]);
  const moves = C.legalMovesForPiece(state, scout.id);
  assert.ok(moves.some(move => move.to.row === 2 && move.attack));
  assert.ok(!moves.some(move => move.to.row === 1 && move.to.col === 0));
});

test('Bombs and Flags never receive legal moves', () => {
  const flag = { color: 'red', type: 'flag', row: 9, col: 9 };
  const bomb = { color: 'red', type: 'bomb', row: 9, col: 8 };
  const state = scenario([flag, bomb, { color: 'red', type: 'scout', row: 6, col: 0 }, { color: 'blue', type: 'flag', row: 0, col: 9 }, { color: 'blue', type: 'scout', row: 0, col: 0 }]);
  assert.deepEqual(C.legalMovesForPiece(state, flag.id), []);
  assert.deepEqual(C.legalMovesForPiece(state, bomb.id), []);
});

test('ordinary ranks move exactly one orthogonal square', () => {
  const piece = { color: 'red', type: 'major', row: 6, col: 4 };
  const state = scenario([piece, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'flag', row: 0, col: 9 }, { color: 'blue', type: 'scout', row: 0, col: 0 }]);
  const moves = C.legalMovesForPiece(state, piece.id);
  assert.ok(moves.every(move => move.distance === 1));
  assert.equal(moves.length, 4);
});

test('stronger rank wins ordinary combat', () => {
  const attacker = { color: 'red', type: 'captain', row: 6, col: 0 };
  const defender = { color: 'blue', type: 'sergeant', row: 5, col: 0 };
  let state = scenario([attacker, defender, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'flag', row: 0, col: 9 }, { color: 'blue', type: 'scout', row: 0, col: 0 }]);
  state = C.applyMove(state, findMove(state, attacker.id, 5, 0));
  assert.equal(state.pieces[attacker.id].alive, true);
  assert.equal(state.pieces[defender.id].alive, false);
  assert.equal(state.lastCombat.outcome, 'attacker');
});

test('equal ranks remove both under the base rule', () => {
  const attacker = { color: 'red', type: 'major', row: 6, col: 0 };
  const defender = { color: 'blue', type: 'major', row: 5, col: 0 };
  let state = scenario([attacker, defender, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'flag', row: 0, col: 9 }, { color: 'blue', type: 'scout', row: 0, col: 0 }]);
  state = C.applyMove(state, findMove(state, attacker.id, 5, 0));
  assert.equal(state.pieces[attacker.id].alive, false);
  assert.equal(state.pieces[defender.id].alive, false);
  assert.equal(state.lastCombat.outcome, 'both');
});

test('aggressor variation lets the attacker survive equal ranks', () => {
  const attacker = { color: 'red', type: 'major', row: 6, col: 0 };
  const defender = { color: 'blue', type: 'major', row: 5, col: 0 };
  let state = scenario([attacker, defender, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'flag', row: 0, col: 9 }, { color: 'blue', type: 'scout', row: 0, col: 0 }], 'red', { aggressorWins: true });
  state = C.applyMove(state, findMove(state, attacker.id, 5, 0));
  assert.equal(state.pieces[attacker.id].alive, true);
  assert.equal(state.pieces[defender.id].alive, false);
});

test('Miner defuses a Bomb while another rank is destroyed by it', () => {
  const miner = { color: 'red', type: 'miner', row: 6, col: 0 };
  const bomb = { color: 'blue', type: 'bomb', row: 5, col: 0 };
  let state = scenario([miner, bomb, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'flag', row: 0, col: 9 }, { color: 'blue', type: 'scout', row: 0, col: 0 }]);
  state = C.applyMove(state, findMove(state, miner.id, 5, 0));
  assert.equal(state.pieces[miner.id].alive, true);
  assert.equal(state.pieces[bomb.id].alive, false);

  const captain = { color: 'red', type: 'captain', row: 6, col: 0 };
  const secondBomb = { color: 'blue', type: 'bomb', row: 5, col: 0 };
  state = scenario([captain, secondBomb, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'flag', row: 0, col: 9 }, { color: 'blue', type: 'scout', row: 0, col: 0 }]);
  state = C.applyMove(state, findMove(state, captain.id, 5, 0));
  assert.equal(state.pieces[captain.id].alive, false);
  assert.equal(state.pieces[secondBomb.id].alive, true);
});

test('Spy defeats Marshal only when Spy attacks first', () => {
  const spy = { color: 'red', type: 'spy', row: 6, col: 0 };
  const marshal = { color: 'blue', type: 'marshal', row: 5, col: 0 };
  let state = scenario([spy, marshal, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'flag', row: 0, col: 9 }, { color: 'blue', type: 'scout', row: 0, col: 0 }]);
  state = C.applyMove(state, findMove(state, spy.id, 5, 0));
  assert.equal(state.pieces[spy.id].alive, true);
  assert.equal(state.pieces[marshal.id].alive, false);

  const redMarshal = { color: 'red', type: 'marshal', row: 6, col: 0 };
  const blueSpy = { color: 'blue', type: 'spy', row: 5, col: 0 };
  state = scenario([redMarshal, blueSpy, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'flag', row: 0, col: 9 }, { color: 'blue', type: 'scout', row: 0, col: 0 }]);
  state = C.applyMove(state, findMove(state, redMarshal.id, 5, 0));
  assert.equal(state.pieces[redMarshal.id].alive, true);
  assert.equal(state.pieces[blueSpy.id].alive, false);
});

test('capturing the Flag ends the game immediately', () => {
  const attacker = { color: 'red', type: 'sergeant', row: 1, col: 0 };
  const flag = { color: 'blue', type: 'flag', row: 0, col: 0 };
  let state = scenario([attacker, flag, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'scout', row: 0, col: 2 }]);
  state = C.applyMove(state, findMove(state, attacker.id, 0, 0));
  assert.equal(state.phase, 'gameover');
  assert.equal(state.winner, 'red');
  assert.equal(state.reason, 'flag');
});

test('the fourth consecutive crossing of the same two squares is barred', () => {
  const red = { color: 'red', type: 'sergeant', row: 6, col: 0 };
  const blue = { color: 'blue', type: 'sergeant', row: 0, col: 0 };
  let state = scenario([red, blue, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'flag', row: 0, col: 9 }]);
  state = C.applyMove(state, findMove(state, red.id, 5, 0));
  state = C.applyMove(state, findMove(state, blue.id, 1, 0));
  state = C.applyMove(state, findMove(state, red.id, 6, 0));
  state = C.applyMove(state, findMove(state, blue.id, 0, 0));
  state = C.applyMove(state, findMove(state, red.id, 5, 0));
  state = C.applyMove(state, findMove(state, blue.id, 1, 0));
  assert.equal(findMove(state, red.id, 6, 0), undefined);
});

test('moving another piece resets that side’s two-square sequence', () => {
  const redA = { color: 'red', type: 'sergeant', row: 6, col: 0 };
  const redB = { color: 'red', type: 'lieutenant', row: 6, col: 2 };
  const blue = { color: 'blue', type: 'sergeant', row: 0, col: 0 };
  const blueB = { color: 'blue', type: 'lieutenant', row: 0, col: 2 };
  let state = scenario([redA, redB, blue, blueB, { color: 'red', type: 'flag', row: 9, col: 9 }, { color: 'blue', type: 'flag', row: 0, col: 9 }]);
  state = C.applyMove(state, findMove(state, redA.id, 5, 0));
  state = C.applyMove(state, findMove(state, blue.id, 1, 0));
  state = C.applyMove(state, findMove(state, redA.id, 6, 0));
  state = C.applyMove(state, findMove(state, blue.id, 0, 0));
  state = C.applyMove(state, findMove(state, redB.id, 6, 3));
  state = C.applyMove(state, findMove(state, blueB.id, 1, 2));
  state = C.applyMove(state, findMove(state, redA.id, 5, 0));
  state = C.applyMove(state, findMove(state, blue.id, 1, 0));
  state = C.applyMove(state, findMove(state, redA.id, 6, 0));
  state = C.applyMove(state, findMove(state, blue.id, 0, 0));
  assert.ok(findMove(state, redA.id, 5, 0));
});

test('public snapshot hides every unrevealed enemy rank', () => {
  const state = started(17);
  const redView = C.publicSnapshot(state, 'red');
  assert.ok(Object.values(redView.pieces).filter(piece => piece.color === 'blue').every(piece => piece.type === null));
  assert.ok(Object.values(redView.pieces).filter(piece => piece.color === 'red').every(piece => piece.type));
  assert.deepEqual(Object.keys(redView.oscillation), ['red']);
});

test('state serialisation round-trips a live game', () => {
  let state = started(21);
  state = C.applyMove(state, C.allLegalMoves(state)[0]);
  const restored = C.deserialiseState(C.serialiseState(state));
  assert.deepEqual(restored, state);
  C.assertValidState(restored);
});

test('corrupt manifests and board references are rejected', () => {
  const state = started(23);
  const broken = C.cloneState(state);
  const id = Object.keys(broken.pieces)[0];
  broken.pieces[id].type = 'marshal';
  assert.throws(() => C.assertValidState(broken), /manifest mismatch/);
  const brokenBoard = C.cloneState(state);
  brokenBoard.board[50] = 'not-a-piece';
  assert.throws(() => C.assertValidState(brokenBoard), /unknown piece/);
});

test('random legal playouts preserve all board and ledger invariants', () => {
  for (let game = 1; game <= 8; game += 1) {
    let state = C.createState({ seed: game, options: { threefoldDraw: true } });
    state = C.deployFormation(state, 'red', 'random', game * 101);
    state = C.deployFormation(state, 'blue', 'random', game * 103);
    state = C.beginGame(state);
    const rng = C.makeRng(game * 997);
    for (let ply = 0; ply < 300 && state.phase === 'play'; ply += 1) {
      const moves = C.allLegalMoves(state);
      assert.ok(moves.length > 0);
      state = C.applyMove(state, moves[Math.floor(rng() * moves.length)]);
      C.assertValidState(state);
    }
    assert.ok(['play', 'gameover'].includes(state.phase));
  }
});
