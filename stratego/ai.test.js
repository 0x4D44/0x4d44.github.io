'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./stratego-core.js');
const A = require('./stratego-ai.js');

function started(seed = 1, redFormation = 'fortress', blueFormation = 'spearhead') {
  let state = C.createState({ seed, options: { threefoldDraw: true } });
  state = C.deployFormation(state, 'red', redFormation, seed * 7 + 1);
  state = C.deployFormation(state, 'blue', blueFormation, seed * 7 + 2);
  return C.beginGame(state);
}

function normaliseMoves(moves) {
  return moves.map(move => `${move.pieceId}:${move.from.row},${move.from.col}>${move.to.row},${move.to.col}:${move.attack ? 1 : 0}`).sort();
}

test('public move generation exactly matches the authoritative rules engine', () => {
  for (let game = 1; game <= 10; game += 1) {
    let state = started(game, 'random', 'random');
    const rng = C.makeRng(game * 113);
    for (let ply = 0; ply < 100 && state.phase === 'play'; ply += 1) {
      const side = state.current;
      const view = C.publicSnapshot(state, side);
      assert.deepEqual(normaliseMoves(A.publicLegalMoves(view, side)), normaliseMoves(C.allLegalMoves(state, side)));
      const legal = C.allLegalMoves(state);
      state = C.applyMove(state, legal[Math.floor(rng() * legal.length)]);
    }
  }
});

test('back-rank depth is symmetric for Red and Blue', () => {
  assert.equal(A.enemyBackDepth('blue', 0), 0);
  assert.equal(A.enemyBackDepth('blue', 9), 9);
  assert.equal(A.enemyBackDepth('red', 9), 0);
  assert.equal(A.enemyBackDepth('red', 0), 9);
});

test('same public position always produces the same decision', () => {
  let state = started(10);
  state = C.applyMove(state, C.allLegalMoves(state)[0]);
  assert.deepEqual(A.chooseMove(state, 'blue', 'marshal'), A.chooseMove(state, 'blue', 'marshal'));
});

test('swapping two hidden enemy ranks cannot change the AI decision', () => {
  let original = started(22, 'fortress', 'feint');
  original = C.applyMove(original, C.allLegalMoves(original)[0]);
  const altered = C.cloneState(original);
  const hidden = Object.values(altered.pieces).filter(piece => piece.color === 'red' && piece.alive && !piece.revealed && piece.type !== 'flag' && piece.type !== 'bomb');
  const marshal = hidden.find(piece => piece.type === 'marshal');
  const scout = hidden.find(piece => piece.type === 'scout');
  assert.ok(marshal && scout);
  [marshal.type, scout.type] = [scout.type, marshal.type];
  assert.deepEqual(C.publicSnapshot(altered, 'blue'), C.publicSnapshot(original, 'blue'));
  assert.deepEqual(A.chooseMove(altered, 'blue', 'marshal'), A.chooseMove(original, 'blue', 'marshal'));
});

test('a moved hidden piece can no longer be inferred as Bomb or Flag', () => {
  let state = started(31);
  const move = C.allLegalMoves(state)[0];
  const movedId = move.pieceId;
  state = C.applyMove(state, move);
  const view = C.publicSnapshot(state, 'blue');
  const moved = view.pieces[movedId];
  assert.equal(moved.type, null);
  assert.equal(moved.moved, true);
  const candidates = A.candidatesForHidden(moved, A.remainingTypeBag(view, 'red'));
  assert.ok(!candidates.includes('flag'));
  assert.ok(!candidates.includes('bomb'));
});

test('all difficulty levels return legal moves', () => {
  let state = started(41);
  state = C.applyMove(state, C.allLegalMoves(state)[0]);
  const legal = normaliseMoves(C.allLegalMoves(state));
  for (const level of ['cadet', 'colonel', 'marshal']) {
    const choice = A.chooseMove(state, 'blue', level);
    assert.ok(choice);
    assert.ok(legal.includes(normaliseMoves([choice.move])[0]), level);
  }
});

test('public signatures represent concealed enemies without rank names', () => {
  let state = started(55);
  state = C.applyMove(state, C.allLegalMoves(state)[0]);
  const view = C.publicSnapshot(state, 'blue');
  const signature = A.publicSignature(view, 'blue');
  assert.match(signature, /r:\?:/);
  for (const type of C.TYPE_ORDER) {
    const hiddenOfType = Object.values(state.pieces).some(piece => piece.color === 'red' && piece.type === type && !piece.revealed);
    if (hiddenOfType && type !== 'red') assert.ok(!signature.includes(`r:${type}:`), `leaked ${type}`);
  }
});

test('AI-versus-AI stress games never attempt an illegal move', () => {
  for (let game = 1; game <= 12; game += 1) {
    let state = started(100 + game, 'random', 'random');
    for (let ply = 0; ply < 700 && state.phase === 'play'; ply += 1) {
      const level = game % 3 === 0 ? 'marshal' : game % 2 ? 'colonel' : 'cadet';
      const choice = A.chooseMove(state, state.current, level);
      assert.ok(choice, `game ${game} ply ${ply}`);
      const legal = normaliseMoves(C.allLegalMoves(state));
      assert.ok(legal.includes(normaliseMoves([choice.move])[0]));
      state = C.applyMove(state, choice.move);
      C.assertValidState(state);
    }
    assert.ok(['play', 'gameover'].includes(state.phase));
  }
});

test('deterministic AI campaigns reach a valid terminal outcome', () => {
  const results = [];
  for (const seed of [703, 911, 1447]) {
    let state = started(seed, 'random', 'random');
    while (state.phase === 'play' && state.moveNumber < 3000) {
      const level = state.current === 'red' ? 'colonel' : 'marshal';
      const choice = A.chooseMove(state, state.current, level);
      assert.ok(choice);
      state = C.applyMove(state, choice.move);
    }
    assert.equal(state.phase, 'gameover', `seed ${seed} did not terminate`);
    assert.ok(['flag', 'immobilised', 'repetition'].includes(state.reason));
    results.push(state.moveNumber);
  }
  assert.ok(results.every(moves => moves > 0));
});
