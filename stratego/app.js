(function () {
  'use strict';

  const C = window.StrategoCore;
  const AI = window.StrategoAI;
  if (!C || !AI) throw new Error('Stratego engine failed to load');

  const SAVE_KEY = '0x4d44.stratego.v1';
  const PREF_KEY = '0x4d44.stratego.prefs.v1';
  const $ = id => document.getElementById(id);
  const els = {
    board: $('board'), boardFrame: $('board-frame'), instruction: $('board-instruction'),
    coordsTop: $('coords-top'), coordsBottom: $('coords-bottom'), coordsLeft: $('coords-left'), coordsRight: $('coords-right'),
    turnStandard: $('turn-standard'), turnTitle: $('turn-title'), turnCopy: $('turn-copy'),
    newGame: $('new-game-button'), hint: $('hint-button'), manual: $('manual-button'), sound: $('sound-button'),
    setupDock: $('setup-dock'), setupHeading: $('setup-heading'), setupCopy: $('setup-copy'), formationTabs: $('formation-tabs'), ready: $('ready-button'),
    blueStatus: $('blue-army-status'), redStatus: $('red-army-status'), intel: $('intel-grid'),
    redLosses: $('red-losses'), blueLosses: $('blue-losses'), dispatch: $('dispatch-log'), moveCounter: $('move-counter'),
    rankCards: $('rank-cards'), rankStyle: $('rank-style-button'),
    privacy: $('privacy-shutter'), privacyTitle: $('privacy-title'), privacyCopy: $('privacy-copy'), privacyButton: $('privacy-button'),
    campaignDialog: $('campaign-dialog'), campaignForm: $('campaign-form'), campaignClose: $('campaign-close'),
    difficultyFieldset: $('difficulty-fieldset'), continueNotice: $('continue-notice'), continueButton: $('continue-button'),
    manualDialog: $('manual-dialog'), manualClose: $('manual-close'),
    combatDialog: $('combat-dialog'), combatAttacker: $('combat-attacker'), combatDefender: $('combat-defender'), combatResult: $('combat-result'), combatClose: $('combat-close'),
    gameoverDialog: $('gameover-dialog'), gameoverTitle: $('gameover-title'), gameoverCopy: $('gameover-copy'), gameoverStats: $('gameover-stats'), reviewBoard: $('review-board-button'), rematch: $('rematch-button'),
    toasts: $('toast-region'),
  };

  let state = null;
  let viewer = 'red';
  let selectedId = null;
  let legalMoves = [];
  let privacyLocked = false;
  let privacyPrompt = null;
  let pendingAfterCombat = null;
  let aiThinking = false;
  let dragPieceId = null;
  let formationName = 'fortress';
  let rankStyle = 'modern';
  let soundEnabled = true;
  let audioContext = null;
  let setupShuffle = 0;

  try {
    const prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    rankStyle = prefs.rankStyle === 'vintage' ? 'vintage' : 'modern';
    soundEnabled = prefs.soundEnabled !== false;
  } catch (_) { /* preferences are optional */ }

  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ rankStyle, soundEnabled })); } catch (_) { /* private browsing */ }
  }

  function showModal(dialog) {
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (!dialog.open) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function colourName(color) { return color === 'red' ? 'Red' : 'Blue'; }
  function rankMark(type) {
    if (!type) return '?';
    if (['flag', 'bomb', 'spy'].includes(type)) return C.RANKS[type].short;
    return rankStyle === 'vintage' ? String(11 - C.RANKS[type].strength) : String(C.RANKS[type].strength);
  }

  function squareName(row, col) { return `${String.fromCharCode(65 + col)}${10 - row}`; }

  function toast(message, duration = 2600) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    els.toasts.appendChild(node);
    window.setTimeout(() => node.remove(), duration);
  }

  function unlockAudio(event) {
    if (!event || !event.isTrusted || audioContext) return;
    try { audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { audioContext = null; }
  }

  function tone(frequency, length = .08, type = 'triangle') {
    if (!soundEnabled || !audioContext) return;
    try {
      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.07, now + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, now + length);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + length + .02);
    } catch (_) { /* sound must never interrupt play */ }
  }

  function saveGame() {
    if (!state) return;
    try { localStorage.setItem(SAVE_KEY, C.serialiseState(state)); } catch (_) { /* storage unavailable */ }
  }

  function storedGameExists() {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (!saved) return false;
      C.deserialiseState(saved);
      return true;
    } catch (_) {
      try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* ignore */ }
      return false;
    }
  }

  function restoreStoredGame() {
    try {
      state = C.deserialiseState(localStorage.getItem(SAVE_KEY));
    } catch (_) {
      try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* ignore */ }
      toast('The stored campaign was damaged and could not be reopened.');
      return false;
    }
    selectedId = null;
    legalMoves = [];
    aiThinking = false;
    if (state.mode === 'hotseat' && state.phase !== 'gameover') {
      viewer = state.phase === 'setup' ? state.setupSide : state.current;
      lockPrivacy(`${colourName(viewer)} commander`, 'Take the field map before the ranks are revealed.', false);
      render();
    } else {
      viewer = 'red';
      privacyLocked = false;
      render();
      if (state.phase === 'play' && state.current === 'blue') scheduleAiTurn();
    }
    closeDialog(els.campaignDialog);
    toast('Stored campaign reopened.');
    return true;
  }

  function openCampaignDialog() {
    const hasSave = storedGameExists();
    els.continueNotice.hidden = !hasSave;
    els.continueButton.hidden = !hasSave;
    showModal(els.campaignDialog);
  }

  function beginCampaign(formData) {
    const mode = formData.get('mode') === 'hotseat' ? 'hotseat' : 'solo';
    const difficulty = String(formData.get('difficulty') || 'colonel');
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    state = C.createState({
      seed,
      mode,
      difficulty,
      options: { aggressorWins: formData.has('aggressor'), threefoldDraw: formData.has('threefold'), repetitionLimit: 3 },
    });
    state = C.deployFormation(state, 'red', 'fortress', seed ^ 0x1111);
    state = C.deployFormation(state, 'blue', mode === 'solo' ? 'spearhead' : 'fortress', seed ^ 0x2222);
    state.setupSide = 'red';
    viewer = 'red';
    formationName = 'fortress';
    selectedId = null;
    legalMoves = [];
    privacyLocked = false;
    aiThinking = false;
    setupShuffle = 0;
    closeDialog(els.campaignDialog);
    saveGame();
    render();
    toast('Red command: deploy while Blue looks away.');
  }

  function lockPrivacy(title, copy, doRender = true) {
    privacyLocked = true;
    selectedId = null;
    legalMoves = [];
    privacyPrompt = { title, copy };
    if (doRender) render();
  }

  function revealPrivacy() {
    privacyLocked = false;
    privacyPrompt = null;
    viewer = state.phase === 'setup' ? state.setupSide : state.current;
    render();
    tone(520, .08);
  }

  function coordinateSequence() {
    const columns = viewer === 'blue' ? [9,8,7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7,8,9];
    const rows = viewer === 'blue' ? [9,8,7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7,8,9];
    return { columns, rows };
  }

  function renderCoordinates() {
    const { columns, rows } = coordinateSequence();
    const letters = columns.map(col => `<span>${String.fromCharCode(65 + col)}</span>`).join('');
    const numbers = rows.map(row => `<span>${10 - row}</span>`).join('');
    els.coordsTop.innerHTML = letters;
    els.coordsBottom.innerHTML = letters;
    els.coordsLeft.innerHTML = numbers;
    els.coordsRight.innerHTML = numbers;
  }

  function visibleType(piece) {
    if (!piece || privacyLocked) return null;
    return piece.color === viewer || piece.revealed ? piece.type : null;
  }

  function cellLabel(row, col, piece) {
    const square = squareName(row, col);
    if (C.isLake(row, col)) return `${square}, lake, impassable`;
    if (!piece) return `${square}, empty`;
    const type = visibleType(piece);
    if (!type) return `${square}, concealed ${colourName(piece.color)} piece${piece.moved ? ', has moved' : ''}`;
    return `${square}, ${colourName(piece.color)} ${C.RANKS[type].name}${piece.revealed && piece.color !== viewer ? ', revealed' : ''}`;
  }

  function renderPiece(piece) {
    const pieceNode = document.createElement('span');
    pieceNode.className = 'piece';
    pieceNode.dataset.color = piece.color;
    pieceNode.dataset.revealed = String(!!piece.revealed);
    const type = visibleType(piece);
    if (type) {
      const face = document.createElement('span');
      face.className = 'piece-face';
      face.textContent = rankMark(type);
      face.title = C.RANKS[type].name;
      pieceNode.appendChild(face);
    } else {
      const back = document.createElement('span');
      back.className = 'piece-back';
      back.textContent = '♜';
      back.setAttribute('aria-hidden', 'true');
      pieceNode.appendChild(back);
    }
    return pieceNode;
  }

  function renderBoard() {
    renderCoordinates();
    els.boardFrame.dataset.view = viewer;
    els.board.replaceChildren();
    const { columns, rows } = coordinateSequence();
    const legalBySquare = new Map(legalMoves.map(move => [`${move.to.row},${move.to.col}`, move]));
    let visualIndex = 0;
    for (const row of rows) {
      for (const col of columns) {
        const lake = C.isLake(row, col);
        const id = state ? state.board[C.boardIndex(row, col)] : null;
        const piece = id && state ? state.pieces[id] : null;
        const legal = legalBySquare.get(`${row},${col}`);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.dataset.lake = String(lake);
        cell.dataset.selected = String(!!piece && piece.id === selectedId);
        cell.dataset.legal = String(!!legal);
        cell.dataset.attack = String(!!legal && legal.attack);
        const own = !!piece && !privacyLocked && piece.color === viewer && state && ((state.phase === 'setup' && state.setupSide === viewer) || (state.phase === 'play' && state.current === viewer));
        cell.dataset.own = String(own);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-rowindex', String(Math.floor(visualIndex / 10) + 1));
        cell.setAttribute('aria-colindex', String(visualIndex % 10 + 1));
        cell.setAttribute('aria-label', cellLabel(row, col, piece));
        if (lake) cell.setAttribute('aria-disabled', 'true');
        cell.tabIndex = visualIndex === 0 ? 0 : -1;
        if (piece) cell.appendChild(renderPiece(piece));
        cell.addEventListener('click', () => handleCell(row, col));
        cell.addEventListener('keydown', onCellKeyDown);
        if (state && state.phase === 'setup' && own) {
          cell.draggable = true;
          cell.addEventListener('dragstart', event => {
            dragPieceId = piece.id;
            const node = cell.querySelector('.piece');
            if (node) node.dataset.dragging = 'true';
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', piece.id);
          });
          cell.addEventListener('dragend', () => {
            dragPieceId = null;
            const node = cell.querySelector('.piece');
            if (node) delete node.dataset.dragging;
          });
        }
        if (state && state.phase === 'setup' && piece && piece.color === viewer) {
          cell.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; });
          cell.addEventListener('drop', event => {
            event.preventDefault();
            const source = event.dataTransfer.getData('text/plain') || dragPieceId;
            if (source && source !== piece.id) swapSetup(source, piece.id);
          });
        }
        els.board.appendChild(cell);
        visualIndex += 1;
      }
    }
  }

  function onCellKeyDown(event) {
    const cells = Array.from(els.board.querySelectorAll('.cell'));
    const index = cells.indexOf(event.currentTarget);
    let next = index;
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (event.key === 'ArrowRight') next = Math.min(99, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - 10);
    else if (event.key === 'ArrowDown') next = Math.min(99, index + 10);
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.currentTarget.click();
      return;
    } else return;
    event.preventDefault();
    cells.forEach(cell => { cell.tabIndex = -1; });
    cells[next].tabIndex = 0;
    cells[next].focus();
  }

  function swapSetup(firstId, secondId) {
    if (!state || state.phase !== 'setup' || privacyLocked) return;
    try {
      state = C.swapSetupPieces(state, state.setupSide, firstId, secondId);
      selectedId = null;
      saveGame();
      render();
      tone(410, .05);
    } catch (error) { toast(error.message); }
  }

  function handleCell(row, col) {
    if (!state || privacyLocked || aiThinking || C.isLake(row, col)) return;
    const id = state.board[C.boardIndex(row, col)];
    const piece = id ? state.pieces[id] : null;

    if (state.phase === 'setup') {
      if (!piece || piece.color !== state.setupSide || viewer !== state.setupSide) return;
      if (!selectedId) {
        selectedId = piece.id;
      } else if (selectedId === piece.id) {
        selectedId = null;
      } else {
        swapSetup(selectedId, piece.id);
        return;
      }
      legalMoves = [];
      render();
      return;
    }

    if (state.phase !== 'play' || state.current !== viewer || (state.mode === 'solo' && viewer !== 'red')) return;
    const chosen = legalMoves.find(move => move.to.row === row && move.to.col === col);
    if (selectedId && chosen) {
      executeMove(chosen, 'human');
      return;
    }
    if (piece && piece.color === state.current && C.RANKS[piece.type].mobile) {
      selectedId = piece.id;
      legalMoves = C.legalMovesForPiece(state, piece.id);
      render();
      if (!legalMoves.length) toast('That piece has no legal route.');
    } else {
      selectedId = null;
      legalMoves = [];
      render();
    }
  }

  function renderCommand() {
    els.sound.setAttribute('aria-pressed', String(soundEnabled));
    els.sound.textContent = soundEnabled ? '♪' : '×';
    if (!state) {
      els.turnStandard.dataset.side = 'red';
      els.turnTitle.textContent = 'WAR ROOM';
      els.turnCopy.textContent = 'Choose a campaign to begin';
      els.instruction.textContent = 'Open a new campaign to deploy your army.';
      els.hint.disabled = true;
      return;
    }
    const side = state.phase === 'setup' ? state.setupSide : state.current;
    els.turnStandard.dataset.side = side || 'red';
    if (state.phase === 'setup') {
      els.turnTitle.textContent = `${colourName(state.setupSide).toUpperCase()} DEPLOYMENT`;
      els.turnCopy.textContent = state.mode === 'hotseat' ? 'shared command · ranks are private' : `${state.difficulty} opponent`;
      els.instruction.textContent = `${colourName(state.setupSide)} command: select or drag two pieces to swap them. Choose a prepared formation or arrange all forty yourself.`;
    } else if (state.phase === 'play') {
      els.turnTitle.textContent = `${colourName(state.current).toUpperCase()} TO MOVE`;
      els.turnCopy.textContent = `Move ${state.moveNumber + 1} · ${state.mode === 'hotseat' ? 'shared command' : `${state.difficulty} opponent`}${aiThinking ? ' · considering orders' : ''}`;
      if (selectedId) {
        const piece = state.pieces[selectedId];
        els.instruction.textContent = `${C.RANKS[piece.type].name} selected at ${squareName(piece.row, piece.col)}. Choose a highlighted destination.`;
      } else {
        els.instruction.textContent = `${colourName(state.current)} command: select a movable piece. Capture the enemy Flag or leave no legal move.`;
      }
    } else {
      els.turnTitle.textContent = state.winner ? `${colourName(state.winner).toUpperCase()} VICTORY` : 'DRAWN FIELD';
      els.turnCopy.textContent = `${state.moveNumber} moves · campaign complete`;
      els.instruction.textContent = state.reason === 'flag' ? 'The enemy standard has fallen.' : state.reason === 'immobilised' ? 'The opposing army can no longer move.' : 'The position repeated three times.';
    }
    els.hint.disabled = privacyLocked || state.phase !== 'play' || aiThinking || (state.mode === 'solo' && state.current === 'blue');
  }

  function armyStats(color) {
    if (!state) return { field: 40, mobile: 33, identified: 0 };
    const army = Object.values(state.pieces).filter(piece => piece.color === color && piece.alive);
    return {
      field: army.length,
      mobile: army.filter(piece => C.RANKS[piece.type].mobile).length,
      identified: army.filter(piece => piece.revealed).length,
    };
  }

  function renderStatus(container, color) {
    const stats = armyStats(color);
    container.innerHTML = [
      ['field', stats.field], ['mobile', stats.mobile], ['identified', stats.identified],
    ].map(([label, value]) => `<div class="status-box"><b>${value}</b><small>${label}</small></div>`).join('');
  }

  function renderIntel() {
    const enemy = 'blue';
    const identified = {};
    if (state) {
      for (const piece of Object.values(state.pieces)) {
        if (piece.color === enemy && piece.revealed) identified[piece.type] = (identified[piece.type] || 0) + 1;
      }
      for (const type of state.captured[enemy]) identified[type] = Math.max(identified[type] || 0, state.captured[enemy].filter(item => item === type).length);
    }
    els.intel.innerHTML = C.TYPE_ORDER.map(type => {
      const rank = C.RANKS[type];
      return `<div class="intel-chip"><span class="intel-rank">${rankMark(type)}</span><span>${rank.name} · ${identified[type] || 0}/${rank.count}</span></div>`;
    }).join('');
  }

  function renderCaptured(container, color) {
    const losses = state ? state.captured[color] : [];
    if (!losses.length) {
      container.innerHTML = '<span class="empty-note">No confirmed losses</span>';
      return;
    }
    container.innerHTML = losses.map(type => `<span class="capture-token" title="${C.RANKS[type].name}">${rankMark(type)}</span>`).join('');
  }

  function dispatchText(item) {
    const who = colourName(item.color);
    const from = squareName(item.from.row, item.from.col);
    const to = squareName(item.to.row, item.to.col);
    if (item.outcome === 'move') return `<b>${who}</b> ${item.attackerType ? C.RANKS[item.attackerType].name : 'unit'} moved ${from} → ${to}.`;
    if (item.outcome === 'flag') return `<b>${who}</b> captured the Flag at ${to}.`;
    const attacker = item.attackerType ? C.RANKS[item.attackerType].name : 'unit';
    const defender = item.defenderType ? C.RANKS[item.defenderType].name : 'enemy';
    const ending = item.outcome === 'attacker' ? `${attacker} held the square.` : item.outcome === 'defender' ? `${defender} repelled the attack.` : 'Both pieces were removed.';
    return `<b>${who}</b> ${attacker} engaged ${defender} at ${to}. ${ending}`;
  }

  function renderDispatches() {
    els.moveCounter.textContent = `${state ? state.moveNumber : 0} moves`;
    if (!state || !state.history.length) {
      els.dispatch.innerHTML = '<li class="empty-note">No dispatches yet. The field is quiet.</li>';
      return;
    }
    els.dispatch.innerHTML = state.history.slice(-12).reverse().map(item => `<li>${dispatchText(item)}</li>`).join('');
  }

  function renderPanels() {
    renderStatus(els.blueStatus, 'blue');
    renderStatus(els.redStatus, 'red');
    renderIntel();
    renderCaptured(els.redLosses, 'red');
    renderCaptured(els.blueLosses, 'blue');
    renderDispatches();
  }

  function renderSetup() {
    const active = !!state && state.phase === 'setup' && !privacyLocked;
    els.setupDock.hidden = !active;
    if (!active) return;
    els.setupHeading.textContent = `Arrange ${colourName(state.setupSide)}’s army`;
    els.setupCopy.textContent = 'Select or drag two pieces to exchange positions. All forty pieces stay within the four home rows.';
    els.ready.textContent = state.mode === 'hotseat' && state.setupSide === 'red' ? 'Seal Red deployment' : 'Begin battle';
    for (const button of els.formationTabs.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.formation === formationName));
    }
  }

  function renderRanks() {
    els.rankStyle.textContent = rankStyle === 'modern' ? 'Modern ranks: 10 is strongest' : 'Vintage ranks: 1 is strongest';
    els.rankCards.innerHTML = C.TYPE_ORDER.map(type => {
      const rank = C.RANKS[type];
      return `<div class="rank-card"><span class="rank-card__mark">${rankMark(type)}</span><span><b>${rank.name}</b><small>${rank.count} in each army</small></span></div>`;
    }).join('');
  }

  function renderPrivacy() {
    els.privacy.hidden = !privacyLocked;
    if (!privacyLocked) return;
    els.privacyTitle.textContent = privacyPrompt ? privacyPrompt.title : 'Pass the field map';
    els.privacyCopy.textContent = privacyPrompt ? privacyPrompt.copy : 'The next commander should take control before the ranks are shown.';
    els.privacyButton.textContent = `Reveal ${colourName(state.phase === 'setup' ? state.setupSide : state.current)} command`;
  }

  function render() {
    renderCommand();
    renderBoard();
    renderPanels();
    renderSetup();
    renderRanks();
    renderPrivacy();
  }

  function readyDeployment() {
    if (!state || state.phase !== 'setup' || privacyLocked) return;
    selectedId = null;
    if (state.mode === 'hotseat' && state.setupSide === 'red') {
      state.setupSide = 'blue';
      viewer = 'blue';
      formationName = 'fortress';
      saveGame();
      lockPrivacy('Blue commander', 'Red deployment is sealed. Take the field map and arrange the Northern Army.');
      return;
    }
    state = C.beginGame(state);
    viewer = 'red';
    saveGame();
    if (state.mode === 'hotseat') lockPrivacy('Red commander', 'Both deployments are sealed. Red has the first move.');
    else {
      render();
      toast('Red has the first move.');
      tone(630, .12);
    }
  }

  function executeMove(move, actor) {
    const previousMoveNumber = state.moveNumber;
    try { state = C.applyMove(state, move); }
    catch (error) { toast(error.message); return; }
    selectedId = null;
    legalMoves = [];
    saveGame();
    if (state.lastCombat && state.lastCombat.attackerColor === (actor === 'ai' ? 'blue' : viewer)) {
      tone(state.lastCombat.outcome === 'attacker' || state.lastCombat.outcome === 'flag' ? 720 : 210, .16, 'square');
    } else tone(390, .05);
    render();
    const after = () => afterTurn(actor, previousMoveNumber);
    if (state.lastCombat && state.moveNumber > previousMoveNumber) {
      pendingAfterCombat = after;
      showCombat(state.lastCombat);
    } else after();
  }

  function afterTurn() {
    if (!state) return;
    if (state.phase === 'gameover') {
      render();
      showGameover();
      return;
    }
    if (state.mode === 'hotseat') {
      viewer = state.current;
      saveGame();
      lockPrivacy(`${colourName(state.current)} commander`, 'The previous commander has finished. Take control before revealing your ranks.');
      return;
    }
    viewer = 'red';
    render();
    if (state.current === 'blue') scheduleAiTurn();
  }

  function scheduleAiTurn() {
    if (!state || state.phase !== 'play' || state.current !== 'blue' || state.mode !== 'solo' || aiThinking) return;
    aiThinking = true;
    render();
    window.setTimeout(() => {
      const choice = AI.chooseMove(state, 'blue', state.difficulty);
      aiThinking = false;
      if (!choice) {
        render();
        return;
      }
      executeMove(choice.move, 'ai');
    }, 360);
  }

  function showCombat(combat) {
    const renderCombatant = (container, color, type) => {
      container.dataset.color = color;
      container.innerHTML = `<div><span class="battle-rank">${rankMark(type)}</span><b>${colourName(color)} ${C.RANKS[type].name}</b></div>`;
    };
    renderCombatant(els.combatAttacker, combat.attackerColor, combat.attackerType);
    renderCombatant(els.combatDefender, combat.defenderColor, combat.defenderType);
    const attacker = C.RANKS[combat.attackerType].name;
    const defender = C.RANKS[combat.defenderType].name;
    if (combat.outcome === 'flag') els.combatResult.textContent = `${attacker} captured the enemy Flag.`;
    else if (combat.outcome === 'attacker') els.combatResult.textContent = `${attacker} defeated ${defender} and took the square.`;
    else if (combat.outcome === 'defender') els.combatResult.textContent = `${defender} repelled the attacking ${attacker}.`;
    else els.combatResult.textContent = `${attacker} and ${defender} were evenly matched; both were removed.`;
    showModal(els.combatDialog);
  }

  function closeCombat() {
    closeDialog(els.combatDialog);
    const next = pendingAfterCombat;
    pendingAfterCombat = null;
    if (next) next();
  }

  function showGameover() {
    if (!state || state.phase !== 'gameover') return;
    els.gameoverTitle.textContent = state.winner ? `${colourName(state.winner)} command victorious` : 'The field is drawn';
    els.gameoverCopy.textContent = state.reason === 'flag'
      ? `${colourName(state.winner)} captured the opposing standard.`
      : state.reason === 'immobilised'
        ? `${colourName(state.winner)} left the enemy without a legal move.`
        : 'The same complete position appeared three times.';
    els.gameoverStats.innerHTML = `<span><b>${state.moveNumber}</b><small>moves</small></span><span><b>${state.captured.red.length + state.captured.blue.length}</b><small>losses</small></span><span><b>${Math.max(state.captured.red.length, state.captured.blue.length)}</b><small>largest toll</small></span>`;
    showModal(els.gameoverDialog);
    tone(state.winner ? 820 : 320, .3, 'sine');
  }

  function askAdjutant() {
    if (!state || state.phase !== 'play' || privacyLocked || aiThinking) return;
    const choice = AI.chooseMove(state, state.current, 'marshal');
    if (!choice) { toast('No legal orders are available.'); return; }
    selectedId = choice.move.pieceId;
    legalMoves = C.legalMovesForPiece(state, selectedId);
    render();
    const piece = state.pieces[selectedId];
    toast(`Adjutant: consider the ${C.RANKS[piece.type].name} at ${squareName(piece.row, piece.col)} → ${squareName(choice.move.to.row, choice.move.to.col)}.` , 4200);
  }

  function setModeFields() {
    const mode = new FormData(els.campaignForm).get('mode');
    els.difficultyFieldset.disabled = mode === 'hotseat';
  }

  function startDemo() {
    const seed = 0x4d44;
    state = C.createState({ seed, mode: 'solo', difficulty: 'colonel', options: { threefoldDraw: true } });
    state = C.deployFormation(state, 'red', 'fortress', seed ^ 0x1111);
    state = C.deployFormation(state, 'blue', 'spearhead', seed ^ 0x2222);
    state = C.beginGame(state);
    viewer = 'red';
    privacyLocked = false;
    selectedId = null;
    legalMoves = [];
    render();
  }

  els.newGame.addEventListener('click', openCampaignDialog);
  els.campaignClose.addEventListener('click', () => closeDialog(els.campaignDialog));
  els.campaignForm.addEventListener('change', setModeFields);
  els.campaignForm.addEventListener('submit', event => {
    event.preventDefault();
    beginCampaign(new FormData(els.campaignForm));
  });
  els.continueButton.addEventListener('click', restoreStoredGame);
  els.manual.addEventListener('click', () => showModal(els.manualDialog));
  els.manualClose.addEventListener('click', () => closeDialog(els.manualDialog));
  els.hint.addEventListener('click', askAdjutant);
  els.sound.addEventListener('click', () => { soundEnabled = !soundEnabled; savePrefs(); renderCommand(); if (soundEnabled) tone(620, .08); });
  els.rankStyle.addEventListener('click', () => { rankStyle = rankStyle === 'modern' ? 'vintage' : 'modern'; savePrefs(); render(); toast(rankStyle === 'modern' ? 'Modern rank printing: Marshal is marked 10.' : 'Vintage rank printing: Marshal is marked 1.'); });
  els.privacyButton.addEventListener('click', revealPrivacy);
  els.ready.addEventListener('click', readyDeployment);
  els.formationTabs.addEventListener('click', event => {
    const button = event.target.closest('button[data-formation]');
    if (!button || !state || state.phase !== 'setup' || privacyLocked) return;
    formationName = button.dataset.formation;
    setupShuffle += 1;
    state = C.deployFormation(state, state.setupSide, formationName, state.seed ^ (setupShuffle * 0x45d9f3b));
    selectedId = null;
    saveGame();
    render();
    toast(`${colourName(state.setupSide)} formation: ${button.textContent}.`);
  });
  els.combatClose.addEventListener('click', closeCombat);
  els.reviewBoard.addEventListener('click', () => closeDialog(els.gameoverDialog));
  els.rematch.addEventListener('click', () => { closeDialog(els.gameoverDialog); openCampaignDialog(); });
  window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || window.__STRATEGO_TEST__ === true;
  const publicApi = {
    publicState: () => state ? C.publicSnapshot(state, viewer) : null,
    viewer: () => viewer,
    privacyLocked: () => privacyLocked,
  };
  if (loopback) {
    publicApi.getState = () => state ? C.cloneState(state) : null;
    publicApi.setState = next => {
      state = C.deserialiseState(next);
      viewer = state.mode === 'hotseat' ? (state.phase === 'setup' ? state.setupSide : state.current) : 'red';
      privacyLocked = false;
      selectedId = null;
      legalMoves = [];
      render();
    };
    publicApi.startDemo = startDemo;
    publicApi.clickCell = (row, col) => handleCell(row, col);
    publicApi.revealPrivacy = revealPrivacy;
  }
  window.StrategoApp = Object.freeze(publicApi);

  renderRanks();
  setModeFields();
  if (new URLSearchParams(location.search).has('demo') || window.__STRATEGO_TEST_DEMO__ === true) startDemo();
  else {
    state = null;
    render();
    window.setTimeout(openCampaignDialog, 120);
  }
})();
