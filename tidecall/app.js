(function bootTidecall() {
  'use strict';

  const E = window.TidecallEngine;
  if (!E) throw new Error('Tidecall engine failed to load.');

  const SAVE_KEY = 'tidecall.save.v1';
  const SETTINGS_KEY = 'tidecall.settings.v1';
  const STATS_KEY = 'tidecall.stats.v1';
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const seatName = (seat) => E.SEAT_NAMES[seat];
  const suitMeta = (suit) => E.SUIT_META[suit];
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const ordinal = (position) => ({ 1: '1ST', 2: '2ND', 3: '3RD', 4: '4TH' })[position] || `${position}TH`;

  const dom = {
    body: document.body,
    home: $('#home-screen'),
    game: $('#game-screen'),
    readout: $('#voyage-readout'),
    roundReadout: $('#round-readout'),
    trumpReadout: $('#trump-readout'),
    scoreButton: $('#score-button'),
    rulesButton: $('#rules-button'),
    soundButton: $('#sound-button'),
    newButton: $('#new-game-button'),
    continueButton: $('#continue-button'),
    homeRulesButton: $('#home-rules-button'),
    newMatchButton: $('#new-match-button'),
    railRound: $('#rail-round'),
    railTrump: $('#rail-trump'),
    railDealer: $('#rail-dealer'),
    youScore: $('#you-score'),
    youPlace: $('#you-place'),
    scoreProgress: $('#score-progress'),
    youContract: $('#you-contract'),
    youProgress: $('#you-progress'),
    tideTrack: $('#tide-track'),
    currentTideLabel: $('#current-tide-label'),
    cardTable: $('#card-table'),
    trumpWatermark: $('#trump-watermark'),
    tableKicker: $('#table-kicker'),
    tableValue: $('#table-value'),
    tableMessage: $('#table-message'),
    statusLine: $('#status-line'),
    hand: $('#hand'),
    youMarks: $('#you-marks'),
    youBidMini: $('#you-bid-mini'),
    playerState: $('#player-state'),
    hintButton: $('#hint-button'),
    standings: $('#standings-list'),
    matchProgressBar: $('#match-progress-bar'),
    matchProgressLabel: $('#match-progress-label'),
    bidSheet: $('#bid-sheet'),
    bidDescription: $('#bid-description'),
    bidGlimpse: $('#bid-hand-glimpse'),
    bidOptions: $('#bid-options'),
    bidOrderNote: $('#bid-order-note'),
    bidHintButton: $('#bid-hint-button'),
    modalLayer: $('#modal-layer'),
    modalContent: $('#modal-content'),
    toast: $('#toast'),
    cardTemplate: $('#card-template'),
    seaCanvas: $('#sea-canvas'),
    celebrationCanvas: $('#celebration-canvas'),
  };

  let game = null;
  let savedGame = null;
  let actionTimer = 0;
  let actionToken = 0;
  let toastTimer = 0;
  let statusTimer = 0;
  let focusBeforeModal = null;

  const ui = {
    screen: 'home',
    modal: null,
    bidHint: null,
    cardHint: null,
    raisedCard: null,
    statusOverride: '',
    collecting: false,
  };

  // Rendering is reconciled, not rebuilt: a card node lives for as long as the card
  // is in the hand, so an opponent's bid or card cannot restart its deal-in animation.
  // `view` remembers what is already on screen; a key change means a genuine re-deal.
  const view = {
    handKey: '',
    handNodes: new Map(),
    tideKey: '',
    standingsKey: '',
  };

  function resetView() {
    view.handKey = '';
    view.handNodes = new Map();
    view.tideKey = '';
    view.standingsKey = '';
  }

  function readJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  const settings = Object.assign({ sound: true, difficulty: 'current' }, readJSON(SETTINGS_KEY, {}));
  if (!['drift', 'current', 'gale'].includes(settings.difficulty)) settings.difficulty = 'current';
  const stats = Object.assign({ voyages: 0, wins: 0, exactRounds: 0, best: null }, readJSON(STATS_KEY, {}));

  function saveSettings() {
    writeJSON(SETTINGS_KEY, settings);
    dom.body.classList.toggle('sound-muted', !settings.sound);
    dom.soundButton.setAttribute('aria-label', settings.sound ? 'Mute sound' : 'Unmute sound');
    dom.soundButton.title = settings.sound ? 'Sound on' : 'Sound off';
  }

  function hydrateSavedGame() {
    const payload = readJSON(SAVE_KEY, null);
    if (!payload || payload.version !== E.VERSION || !payload.game) return null;
    const validation = E.validateState(payload.game);
    if (!validation.ok) return null;
    return payload.game;
  }

  function saveGame() {
    if (!game) return;
    writeJSON(SAVE_KEY, { version: E.VERSION, savedAt: Date.now(), game });
    savedGame = game;
  }

  function clearSavedGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
    savedGame = null;
  }

  class Soundscape {
    constructor() {
      this.ctx = null;
      this.master = null;
    }

    ensure() {
      if (!settings.sound) return null;
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.18;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }

    tone(freq, duration, options) {
      const ctx = this.ensure();
      if (!ctx) return;
      const opts = options || {};
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + (opts.delay || 0);
      oscillator.type = opts.type || 'sine';
      oscillator.frequency.setValueAtTime(freq, start);
      if (opts.endFreq) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(opts.gain || 0.25, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }

    noise(duration, gainValue) {
      const ctx = this.ensure();
      if (!ctx) return;
      const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = 'highpass';
      filter.frequency.value = 900;
      gain.gain.value = gainValue || 0.08;
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start();
    }

    play(kind) {
      if (!settings.sound) return;
      if (kind === 'card') {
        this.noise(0.08, 0.06);
        this.tone(210, 0.07, { type: 'triangle', gain: 0.08, endFreq: 150 });
      } else if (kind === 'bid') {
        this.tone(420, 0.12, { type: 'sine', gain: 0.12, endFreq: 520 });
      } else if (kind === 'trick') {
        this.tone(300, 0.17, { type: 'triangle', gain: 0.12, endFreq: 210 });
      } else if (kind === 'surge') {
        this.tone(520, 0.55, { type: 'sine', gain: 0.17 });
        this.tone(780, 0.45, { type: 'sine', gain: 0.12, delay: 0.05 });
        this.tone(1040, 0.38, { type: 'sine', gain: 0.08, delay: 0.1 });
      } else if (kind === 'slack') {
        this.tone(180, 0.42, { type: 'sine', gain: 0.1, endFreq: 90 });
      } else if (kind === 'exact') {
        [392, 494, 587, 784].forEach((freq, index) => this.tone(freq, 0.65, { type: 'sine', gain: 0.1, delay: index * 0.055 }));
      } else if (kind === 'miss') {
        this.tone(240, 0.38, { type: 'triangle', gain: 0.1, endFreq: 130 });
      } else if (kind === 'click') {
        this.tone(560, 0.055, { type: 'sine', gain: 0.06, endFreq: 510 });
      }
    }
  }

  const sound = new Soundscape();

  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
  }

  function setScreen(name) {
    ui.screen = name;
    const home = name === 'home';
    dom.home.hidden = !home;
    dom.game.hidden = home;
    dom.readout.hidden = home;
    dom.scoreButton.hidden = home;
    dom.body.classList.toggle('in-game', !home);
  }

  function setStatus(message, milliseconds) {
    ui.statusOverride = message;
    clearTimeout(statusTimer);
    if (milliseconds) {
      statusTimer = window.setTimeout(() => {
        ui.statusOverride = '';
        renderStatus();
      }, milliseconds);
    }
    renderStatus();
  }

  function showToast(message, milliseconds) {
    clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    toastTimer = window.setTimeout(() => dom.toast.classList.remove('show'), milliseconds || 2200);
  }

  function schedule(fn, delay) {
    clearTimeout(actionTimer);
    const token = ++actionToken;
    actionTimer = window.setTimeout(() => {
      if (token !== actionToken || ui.modal) return;
      fn();
    }, delay);
  }

  function cancelScheduledAction() {
    clearTimeout(actionTimer);
    actionToken += 1;
  }

  function selectedDifficulty() {
    const checked = $('input[name="difficulty"]:checked');
    return checked ? checked.value : settings.difficulty;
  }

  function beginNewGame() {
    settings.difficulty = selectedDifficulty();
    saveSettings();
    stats.voyages += 1;
    writeJSON(STATS_KEY, stats);
    game = E.newMatch({ difficulty: settings.difficulty });
    ui.bidHint = null;
    ui.cardHint = null;
    ui.statusOverride = '';
    resetView();
    clearSavedGame();
    saveGame();
    setScreen('game');
    sound.play('click');
    render();
    drive();
  }

  function continueGame() {
    const restored = hydrateSavedGame();
    if (!restored) {
      showToast('That voyage could not be restored. A fresh chart is ready.');
      dom.continueButton.hidden = true;
      return;
    }
    game = restored;
    settings.difficulty = game.difficulty || settings.difficulty;
    saveSettings();
    resetView();
    setScreen('game');
    sound.play('click');
    render();
    drive();
  }

  function returnHome() {
    cancelScheduledAction();
    closeModal(false);
    hideBidSheet();
    setScreen('home');
    savedGame = hydrateSavedGame();
    renderHome();
  }

  function renderHome() {
    const hasSave = !!savedGame;
    dom.continueButton.hidden = !hasSave;
    if (hasSave) {
      const round = Math.min(E.HAND_PATTERN.length, savedGame.roundIndex + 1);
      dom.continueButton.textContent = savedGame.phase === 'matchEnd' ? 'VIEW LAST VOYAGE' : `CONTINUE · ROUND ${round}`;
    }
    $$('input[name="difficulty"]').forEach((input) => { input.checked = input.value === settings.difficulty; });
  }

  function createCardElement(card, options) {
    const opts = options || {};
    const node = dom.cardTemplate.content.firstElementChild.cloneNode(true);
    const meta = suitMeta(card.s);
    node.dataset.cardId = card.id;
    node.classList.toggle('red', meta.colour === 'red');
    node.classList.toggle('face-card', card.r >= 11);
    // The watermark is drawn by `.card-art::before { content: attr(data-face) }`, and
    // attr() resolves against the pseudo-element's own element — so data-face must live
    // on .card-art, not the card button, or the J/Q/K/A ghost never renders.
    if (card.r >= 11) $('.card-art', node).dataset.face = E.rankLabel(card.r);
    const rank = E.rankLabel(card.r);
    $$('.card-corner b', node).forEach((el) => { el.textContent = rank; });
    $$('.card-corner i', node).forEach((el) => { el.textContent = meta.glyph; });
    $('.pip-main', node).textContent = meta.glyph;
    node.setAttribute('aria-label', `${rank} of ${meta.name}`);
    if (opts.static) {
      node.tabIndex = -1;
      node.setAttribute('aria-hidden', 'true');
      node.type = 'button';
    }
    return node;
  }

  function renderTideTrack() {
    const current = Math.min(game.trickIndex, game.handSize - 1);
    // The tide table is fixed for the round; only "past" and "current" move within it.
    const tideKey = `${game.roundIndex}:${game.tide.slack}:${game.tide.surge}`;
    if (view.tideKey !== tideKey) {
      view.tideKey = tideKey;
      dom.tideTrack.replaceChildren();
      for (let index = 0; index < game.handSize; index += 1) {
        const value = E.trickValue(game.tide, index);
        const node = document.createElement('div');
        node.className = 'tide-node';
        if (value === 0) node.classList.add('slack');
        if (value === 2) node.classList.add('surge');
        node.innerHTML = `<small>${index + 1}</small><b>${value}</b>`;
        node.title = value === 0 ? `Trick ${index + 1}: Slack Water, zero marks` : value === 2 ? `Trick ${index + 1}: High Tide, two marks` : `Trick ${index + 1}: one mark`;
        dom.tideTrack.appendChild(node);
      }
    }
    const done = game.phase === 'roundEnd' || game.phase === 'matchEnd';
    Array.from(dom.tideTrack.children).forEach((node, index) => {
      node.classList.toggle('past', index < game.trickIndex || done);
      node.classList.toggle('current', index === current && game.phase === 'play');
    });
    const value = E.trickValue(game.tide, current);
    dom.currentTideLabel.textContent = game.phase === 'roundEnd' || game.phase === 'matchEnd'
      ? 'ROUND COMPLETE'
      : `TRICK ${current + 1} · ${value} ${value === 1 ? 'MARK' : 'MARKS'}`;
  }

  function renderOpponents() {
    $$('.opponent').forEach((panel) => {
      const seat = Number(panel.dataset.seat);
      const active = (game.phase === 'bid' && game.bidTurn === seat) || (game.phase === 'play' && game.turn === seat);
      panel.classList.toggle('active', active);
      panel.classList.toggle('dealer', game.dealer === seat);
      const call = $('.opponent-call', panel);
      if (game.bids[seat] == null) call.textContent = active && game.phase === 'bid' ? 'READING…' : 'CALL —';
      else call.textContent = `CALL ${game.bids[seat]} · ${game.marks[seat]}/${game.bids[seat]}`;
      const miniHand = $('.mini-hand', panel);
      const visibleBacks = Math.min(4, game.hands[seat].length);
      if (miniHand.childElementCount !== visibleBacks) {
        miniHand.replaceChildren();
        for (let i = 0; i < visibleBacks; i += 1) {
          const back = document.createElement('i');
          back.className = 'mini-card';
          miniHand.appendChild(back);
        }
      }
      panel.setAttribute('aria-label', `${seatName(seat)}, ${game.scores[seat]} points${active ? ', taking a turn' : ''}`);
    });
  }

  function renderTrick() {
    // Keep the cards already on the table: only the newly played one should fly in.
    const bySeat = new Map(game.trick.map((play) => [play.seat, play]));
    $$('.trick-slot').forEach((slot) => {
      const play = bySeat.get(Number(slot.dataset.seat));
      const current = slot.firstElementChild;
      if (!play) {
        if (current) slot.replaceChildren();
        return;
      }
      if (current && current.dataset.cardId === play.card.id) return;
      const card = createCardElement(play.card, { static: true });
      card.style.setProperty('--rot', `${[-1, -7, 2, 7][play.seat]}deg`);
      slot.replaceChildren(card);
    });

    const index = Math.min(game.trickIndex, game.handSize - 1);
    const value = E.trickValue(game.tide, index);
    const kind = value === 0 ? 'slack' : value === 2 ? 'surge' : 'normal';
    dom.cardTable.dataset.tide = kind;
    dom.trumpWatermark.textContent = suitMeta(game.trump).glyph;
    dom.tableValue.textContent = String(value);
    dom.tableKicker.textContent = value === 0 ? 'SLACK WATER' : value === 2 ? 'HIGH TIDE' : 'THE CURRENT';

    if (game.trickComplete) {
      const winner = game.pendingWinner;
      dom.tableMessage.textContent = `${seatName(winner)} has it`;
    } else if (game.phase === 'play') {
      dom.tableMessage.textContent = game.trick.length ? `${seatName(game.turn)} to follow` : `${seatName(game.leader)} leads`;
    } else if (game.phase === 'bid') {
      dom.tableMessage.textContent = 'Calls before cards';
    } else {
      dom.tableMessage.textContent = 'Round complete';
    }
  }

  function renderHand() {
    const hand = game.hands[0] || [];
    // Card ids repeat across rounds (`S14` is the ace of spades every deal), so the
    // round is part of the key: a new deal builds fresh nodes and deals them in, while
    // everything inside a round reuses the nodes already on the table.
    const handKey = `${game.roundIndex}`;
    if (view.handKey !== handKey) {
      view.handKey = handKey;
      view.handNodes = new Map();
      dom.hand.replaceChildren();
    }

    const legalIds = game.phase === 'play' && game.turn === 0 && !game.trickComplete
      ? new Set(E.legalCards(hand, game.trick).map((card) => card.id))
      : new Set();
    const live = new Set(hand.map((card) => card.id));
    view.handNodes.forEach((node, id) => {
      if (live.has(id)) return;
      node.remove();
      view.handNodes.delete(id);
    });

    const yourTurn = game.phase === 'play' && game.turn === 0;
    // A raised card is only meaningful during your own play turn; drop it otherwise so a
    // stale raise can't be second-tapped into a play once the turn has moved on.
    if (!yourTurn) ui.raisedCard = null;
    const centre = (hand.length - 1) / 2;
    hand.forEach((card, index) => {
      let node = view.handNodes.get(card.id);
      if (!node) {
        node = createCardElement(card);
        node.style.setProperty('--index', index);
        view.handNodes.set(card.id, node);
        dom.hand.appendChild(node);
      }
      const rotation = (index - centre) * Math.min(4.2, 18 / Math.max(1, hand.length - 1));
      node.style.setProperty('--rot', `${rotation.toFixed(2)}deg`);
      node.style.zIndex = String(index + 1);
      const playable = legalIds.has(card.id);
      node.classList.toggle('playable', playable);
      node.classList.toggle('illegal', yourTurn && !playable);
      node.classList.toggle('suggested', ui.cardHint === card.id);
      node.classList.toggle('raised', playable && ui.raisedCard === card.id);
      if (playable) node.removeAttribute('aria-disabled');
      else node.setAttribute('aria-disabled', 'true');
    });
    // The cards size themselves to the hand: fewer cards, bigger cards (see styles.css).
    dom.hand.style.setProperty('--hand-count', String(hand.length));
  }

  function renderStandings() {
    const standings = E.standings(game);
    // Scores only move at a round boundary; leave the list alone the rest of the time.
    const standingsKey = standings.map((entry) => `${entry.seat}:${entry.score}`).join('|');
    if (view.standingsKey !== standingsKey) {
      view.standingsKey = standingsKey;
      dom.standings.replaceChildren();
      standings.forEach((entry) => {
        const li = document.createElement('li');
        if (entry.seat === 0) li.classList.add('you');
        const persona = E.PERSONAS[entry.seat].label;
        li.innerHTML = `<span>${escapeHtml(entry.name)}<small>${escapeHtml(persona)}</small></span><b>${entry.score}</b>`;
        dom.standings.appendChild(li);
      });
    }
    const position = standings.findIndex((entry) => entry.seat === 0) + 1;
    dom.youPlace.textContent = ordinal(position);
    const scoreRatio = E.clamp((game.scores[0] + 25) / 245, 0, 1);
    dom.scoreProgress.style.strokeDashoffset = String(308 - scoreRatio * 308);
  }

  function renderContract() {
    dom.youScore.textContent = String(game.scores[0]);
    dom.youMarks.textContent = String(game.marks[0]);
    const bid = game.bids[0];
    dom.youBidMini.textContent = bid == null ? '—' : String(bid);
    dom.youContract.textContent = bid == null ? '—' : `${game.marks[0]} / ${bid}`;
    if (bid == null) dom.youProgress.textContent = 'Awaiting your call';
    else {
      const delta = bid - game.marks[0];
      if (game.phase === 'roundEnd' || game.phase === 'matchEnd') dom.youProgress.textContent = delta === 0 ? 'Exact sounding' : `${Math.abs(delta)} mark${Math.abs(delta) === 1 ? '' : 's'} ${delta > 0 ? 'short' : 'over'}`;
      else if (delta === 0) dom.youProgress.textContent = 'On your number — duck the rest';
      else if (delta > 0) dom.youProgress.textContent = `${delta} mark${delta === 1 ? '' : 's'} still needed`;
      else dom.youProgress.textContent = `${Math.abs(delta)} over the call`;
    }
  }

  function renderChrome() {
    const roundNumber = game.roundIndex + 1;
    const meta = suitMeta(game.trump);
    dom.roundReadout.textContent = `ROUND ${roundNumber} / ${E.HAND_PATTERN.length}`;
    dom.trumpReadout.textContent = `${game.trump === 'N' ? 'NO WIND' : 'WIND'} ${meta.glyph}`;
    dom.railRound.textContent = String(roundNumber).padStart(2, '0');
    dom.railTrump.textContent = meta.glyph;
    dom.railTrump.title = meta.name;
    dom.railDealer.textContent = seatName(game.dealer).toUpperCase();
    dom.matchProgressBar.style.width = `${((roundNumber) / E.HAND_PATTERN.length) * 100}%`;
    dom.matchProgressLabel.textContent = `${roundNumber} / ${E.HAND_PATTERN.length}`;
    dom.playerState.textContent = game.dealer === 0 ? 'DEALER · NAVIGATOR' : 'NAVIGATOR';
  }

  function defaultStatus() {
    if (!game) return '';
    if (game.phase === 'bid') {
      return game.bidTurn === 0
        ? 'Set an exact call for this tide table.'
        : `${seatName(game.bidTurn)} is sounding the hand…`;
    }
    if (game.phase === 'play') {
      if (game.trickComplete) {
        const value = E.trickValue(game.tide, game.trickIndex);
        return `${seatName(game.pendingWinner)} wins ${value === 0 ? 'Slack Water' : value === 2 ? 'High Tide' : 'the trick'}${value === 1 ? ' for 1 mark' : ` for ${value} marks`}.`;
      }
      const value = E.trickValue(game.tide, game.trickIndex);
      if (game.turn === 0) {
        if (!game.trick.length) return `Your lead. This trick is worth ${value} ${value === 1 ? 'mark' : 'marks'}.`;
        const lead = suitMeta(game.trick[0].card.s).name;
        return `Your card. Follow ${lead} if you can.`;
      }
      return `${seatName(game.turn)} is choosing a card…`;
    }
    if (game.phase === 'roundEnd') return 'The round is charted. Compare every call.';
    if (game.phase === 'matchEnd') return 'The voyage is complete.';
    return '';
  }

  function renderStatus() {
    if (!game || ui.screen !== 'game') return;
    dom.statusLine.textContent = ui.statusOverride || defaultStatus();
  }

  function render() {
    if (!game || ui.screen !== 'game') return;
    renderChrome();
    renderTideTrack();
    renderOpponents();
    renderTrick();
    renderHand();
    renderStandings();
    renderContract();
    renderStatus();
    dom.hintButton.disabled = !(game.phase === 'play' && game.turn === 0 && !game.trickComplete);
    if (game.phase === 'bid' && game.bidTurn === 0 && !ui.modal) showBidSheet();
    else hideBidSheet();
  }

  function renderBidSheet() {
    const legal = new Set(E.validBids(game, 0));
    const forbidden = E.forbiddenDealerBid(game, 0);
    dom.bidOptions.replaceChildren();
    for (let bid = 0; bid <= game.handSize; bid += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bid-option';
      const isLegal = legal.has(bid);
      if (!isLegal) button.classList.add('forbidden');
      if (ui.bidHint === bid) button.classList.add('suggested');
      button.disabled = !isLegal;
      const label = bid === 0 ? 'DUCK' : bid === game.handSize ? 'SWEEP' : `${bid} MARK${bid === 1 ? '' : 'S'}`;
      const sub = !isLegal ? 'HOOKED' : ui.bidHint === bid ? 'SOUNDING' : label;
      button.innerHTML = `<b>${bid}</b><small>${sub}</small>`;
      if (isLegal) button.addEventListener('click', () => humanBid(bid));
      dom.bidOptions.appendChild(button);
    }

    dom.bidGlimpse.replaceChildren();
    dom.bidGlimpse.style.setProperty('--glimpse-count', String(game.handSize));
    game.hands[0].forEach((card, index) => {
      const micro = document.createElement('span');
      micro.className = `micro-card${suitMeta(card.s).colour === 'red' ? ' red' : ''}`;
      micro.style.setProperty('--rot', `${(index - (game.handSize - 1) / 2) * 3}deg`);
      micro.textContent = E.cardLabel(card);
      dom.bidGlimpse.appendChild(micro);
    });

    const track = E.tideTrack(game.tide, game.handSize);
    dom.bidDescription.textContent = `Trick ${game.tide.slack + 1} is Slack Water (0). Trick ${game.tide.surge + 1} is High Tide (2). The ${game.handSize} tricks still carry ${track.reduce((a, b) => a + b, 0)} marks in total.`;
    if (game.dealer === 0 && forbidden != null) dom.bidOrderNote.textContent = `Dealer’s hook: ${forbidden} is barred, so the table cannot balance exactly.`;
    else dom.bidOrderNote.textContent = `${game.bids.filter((bid) => bid != null).length} of 4 calls are on the chart.`;
  }

  function showBidSheet() {
    if (dom.bidSheet.hidden) {
      dom.bidSheet.hidden = false;
      requestAnimationFrame(() => {
        const first = $('.bid-option:not(:disabled)', dom.bidSheet);
        if (first) first.focus({ preventScroll: true });
      });
    }
    renderBidSheet();
  }

  function hideBidSheet() {
    dom.bidSheet.hidden = true;
  }

  function humanBid(bid) {
    if (!game || game.phase !== 'bid' || game.bidTurn !== 0) return;
    try {
      sound.play('bid');
      vibrate(12);
      E.placeBid(game, 0, bid);
      ui.bidHint = null;
      hideBidSheet();
      setStatus(`You call ${bid}.`, 1250);
      saveGame();
      render();
      drive();
    } catch (error) {
      showToast(error.message);
    }
  }

  function humanPlay(cardId) {
    if (!game || game.phase !== 'play' || game.turn !== 0 || game.trickComplete) return;
    try {
      E.playCard(game, 0, cardId);
      ui.cardHint = null;
      ui.raisedCard = null;
      sound.play('card');
      vibrate(9);
      saveGame();
      render();
      drive();
    } catch (error) {
      showToast(error.message);
    }
  }

  function takeBidSounding() {
    if (!game || game.phase !== 'bid' || game.bidTurn !== 0) return;
    const choice = E.chooseBid(game, 0, { difficulty: 'gale' });
    ui.bidHint = choice.bid;
    renderBidSheet();
    sound.play('click');
    showToast(`Sounding: about ${choice.estimate.toFixed(1)} marks. Call ${choice.bid}.`, 2800);
  }

  function takeCardSounding() {
    if (!game || game.phase !== 'play' || game.turn !== 0 || game.trickComplete) {
      showToast('A card sounding is available when it is your turn.');
      return;
    }
    const choice = E.chooseAiCard(game, 0, { difficulty: 'gale' });
    ui.cardHint = choice.card.id;
    renderHand();
    sound.play('click');
    const aim = choice.desire > 0.58 ? 'press for this trick' : choice.desire < 0.28 ? 'try to duck it' : 'keep the contract flexible';
    showToast(`Sounding: ${E.cardLabel(choice.card)} — ${aim}.`, 3000);
  }

  function aiBid() {
    if (!game || game.phase !== 'bid' || game.bidTurn === 0 || ui.modal) return;
    const seat = game.bidTurn;
    const choice = E.chooseBid(game, seat, { difficulty: settings.difficulty });
    E.placeBid(game, seat, choice.bid);
    sound.play('bid');
    setStatus(`${seatName(seat)} calls ${choice.bid}.`, 900);
    saveGame();
    render();
    drive();
  }

  function aiPlay() {
    if (!game || game.phase !== 'play' || game.turn === 0 || game.trickComplete || ui.modal) return;
    const seat = game.turn;
    const choice = E.chooseAiCard(game, seat, { difficulty: settings.difficulty });
    E.playCard(game, seat, choice.card.id);
    sound.play('card');
    saveGame();
    render();
    drive();
  }

  function collectCurrentTrick() {
    if (!game || game.phase !== 'play' || !game.trickComplete) return;
    const winner = game.pendingWinner;
    const value = E.trickValue(game.tide, game.trickIndex);
    E.collectTrick(game);
    if (value === 2) {
      sound.play('surge');
      vibrate(winner === 0 ? [20, 30, 40] : [12, 25, 12]);
    } else if (value === 0) sound.play('slack');
    else sound.play('trick');
    saveGame();
    render();
    if (game.phase === 'roundEnd') {
      const human = game.roundResult.deltas[0];
      if (human.exact) {
        stats.exactRounds += 1;
        writeJSON(STATS_KEY, stats);
        sound.play('exact');
        celebrate(human.crest ? 90 : 55);
      } else sound.play('miss');
      openRoundRecap();
    } else drive();
  }

  function drive() {
    cancelScheduledAction();
    if (!game || ui.screen !== 'game' || ui.modal) return;
    if (game.phase === 'bid') {
      if (game.bidTurn === 0) showBidSheet();
      else schedule(aiBid, 500 + Math.random() * 380);
      return;
    }
    hideBidSheet();
    if (game.phase === 'play') {
      if (game.trickComplete) schedule(collectCurrentTrick, E.trickValue(game.tide, game.trickIndex) === 2 ? 1250 : 900);
      else if (game.turn !== 0) schedule(aiPlay, 470 + Math.random() * 370);
      return;
    }
    if (game.phase === 'roundEnd') openRoundRecap();
    else if (game.phase === 'matchEnd') openMatchEnd();
  }

  function openModal(type, html, options) {
    cancelScheduledAction();
    focusBeforeModal = document.activeElement;
    ui.modal = type;
    hideBidSheet();
    dom.modalContent.innerHTML = html;
    dom.modalLayer.hidden = false;
    const opts = options || {};
    if (opts.wide) $('#modal', dom.modalLayer).classList.add('wide');
    else $('#modal', dom.modalLayer).classList.remove('wide');
    // Round-recap and match-end must be advanced via their own buttons, so drop the ✕
    // rather than leave a control that does nothing.
    $('.modal-close', dom.modalLayer).hidden = type === 'round' || type === 'match';
    requestAnimationFrame(() => {
      const focusable = $('button:not([disabled]), [href], input:not([disabled])', dom.modalLayer);
      if (focusable) focusable.focus({ preventScroll: true });
    });
  }

  function closeModal(resume) {
    if (!ui.modal) return;
    ui.modal = null;
    dom.modalLayer.hidden = true;
    dom.modalContent.replaceChildren();
    if (focusBeforeModal && typeof focusBeforeModal.focus === 'function') focusBeforeModal.focus({ preventScroll: true });
    focusBeforeModal = null;
    if (resume !== false) {
      render();
      drive();
    }
  }

  function rulesHtml() {
    return `
      <p class="eyebrow">HOW TO PLAY</p>
      <h2 id="modal-title">Win at the right moment.</h2>
      <p>Tidecall is estimation whist with a moving value map. You still follow suit, a trump suit still beats the led suit, and the highest eligible card wins—but not every trick is worth the same.</p>
      <div class="modal-rule-grid">
        <div><b style="color:var(--slack)">0</b><span>SLACK WATER</span><p>The winner controls the next lead but earns no marks.</p></div>
        <div><b style="color:var(--gold)">1</b><span>THE CURRENT</span><p>Every ordinary trick is worth one mark.</p></div>
        <div><b style="color:var(--surge)">2</b><span>HIGH TIDE</span><p>One announced trick is worth two marks.</p></div>
      </div>
      <h3>THE VOYAGE</h3>
      <ol>
        <li>Eleven rounds rise from 3 cards to 8, then fall back to 3.</li>
        <li>Before each round, the tide table marks one zero-value trick and one double-value trick. Their values still add up to the number of cards.</li>
        <li>Call the exact number of <em>marks</em> you expect to take—not merely physical tricks.</li>
        <li>Follow the led suit when you can. Otherwise discard or play trump. No-trump rounds are marked ◎.</li>
        <li>The dealer cannot make all four calls add exactly to the available marks. That forbidden number is the hook.</li>
      </ol>
      <h3>SCORING</h3>
      <p>An exact call scores <strong>12 + twice your call</strong>. Miss and lose 3 points for every mark away. Make an exact call while also winning High Tide and the chart awards a 3-point <strong>Crest bonus</strong>.</p>
      <p><strong>Small example:</strong> call 2, win Slack Water and High Tide, and you finish on exactly 2 marks—even though you won two physical tricks.</p>
      <div class="modal-actions"><button class="modal-primary" type="button" data-close-modal>BACK TO THE TABLE</button></div>`;
  }

  function openRules() {
    openModal('rules', rulesHtml());
  }

  function scorecardHtml() {
    const standings = E.standings(game);
    const historyRows = game.history.map((round, index) => {
      const human = round.deltas[0];
      const wind = suitMeta(round.trump).glyph;
      return `<tr><td>${index + 1} · ${wind}</td><td>${human.bid}</td><td>${human.marks}</td><td class="${human.exact ? 'exact' : 'miss'}">${human.delta > 0 ? '+' : ''}${human.delta}</td></tr>`;
    }).join('') || '<tr><td colspan="4">No completed rounds yet.</td></tr>';
    return `
      <p class="eyebrow">VOYAGE LOG</p>
      <h2 id="modal-title">Scorecard</h2>
      <div class="result-list">
        ${standings.map((entry, index) => `<div class="result-row ${entry.seat === 0 ? 'exact' : ''}"><b>${index + 1}. ${escapeHtml(entry.name)}</b><span>${escapeHtml(E.PERSONAS[entry.seat].label)}</span><strong>${entry.score}</strong></div>`).join('')}
      </div>
      <h3>YOUR ROUNDS</h3>
      <table class="score-table"><thead><tr><th>ROUND · WIND</th><th>CALL</th><th>MARKS</th><th>POINTS</th></tr></thead><tbody>${historyRows}</tbody></table>
      <div class="modal-actions"><button type="button" data-close-modal>CLOSE</button></div>`;
  }

  function openScorecard() {
    if (!game) return;
    openModal('scores', scorecardHtml());
  }

  function openRoundRecap() {
    if (!game || game.phase !== 'roundEnd' || ui.modal === 'round') return;
    const result = game.roundResult;
    const highWinner = seatName(result.highTideWinner);
    const human = result.deltas[0];
    const title = human.exact ? (human.crest ? 'Exact—and crowned by the tide.' : 'An exact sounding.') : `${human.distance} mark${human.distance === 1 ? '' : 's'} off the chart.`;
    const rows = result.deltas.map((entry) => `
      <div class="result-row ${entry.exact ? 'exact' : 'miss'}">
        <b>${escapeHtml(seatName(entry.seat))}</b>
        <span>called ${entry.bid} · took ${entry.marks}${entry.crest ? ' · Crest +3' : ''}</span>
        <strong>${entry.delta > 0 ? '+' : ''}${entry.delta}</strong>
      </div>`).join('');
    const finalRound = game.roundIndex === E.HAND_PATTERN.length - 1;
    openModal('round', `
      <p class="eyebrow">ROUND ${game.roundIndex + 1} · ${suitMeta(game.trump).name.toUpperCase()}</p>
      <h2 id="modal-title">${escapeHtml(title)}</h2>
      <p>${escapeHtml(highWinner)} won High Tide. The tide table carried ${game.handSize} marks across ${game.handSize} tricks.</p>
      <div class="result-list">${rows}</div>
      <div class="modal-actions"><button class="modal-primary" type="button" data-continue-round>${finalRound ? 'FINAL STANDINGS' : 'CHART NEXT ROUND'}</button></div>`);
  }

  function continueAfterRound() {
    if (!game || game.phase !== 'roundEnd') return;
    closeModal(false);
    E.advanceRound(game);
    ui.bidHint = null;
    ui.cardHint = null;
    ui.statusOverride = '';
    saveGame();
    render();
    if (game.phase === 'matchEnd') finishStatsAndShowEnd();
    else {
      sound.play('click');
      drive();
    }
  }

  function finishStatsAndShowEnd() {
    if (!game || game.phase !== 'matchEnd') return;
    if (!game.statsRecorded) {
      if (game.winnerSeats.includes(0)) stats.wins += 1;
      stats.best = stats.best == null ? game.scores[0] : Math.max(stats.best, game.scores[0]);
      game.statsRecorded = true;
      writeJSON(STATS_KEY, stats);
      saveGame();
    }
    openMatchEnd();
  }

  function openMatchEnd() {
    if (!game || game.phase !== 'matchEnd' || ui.modal === 'match') return;
    const standings = E.standings(game);
    const humanWon = game.winnerSeats.includes(0);
    if (humanWon) {
      sound.play('exact');
      celebrate(150);
    }
    openModal('match', `
      <p class="eyebrow">VOYAGE COMPLETE</p>
      <div class="winner-seal"><span>${humanWon ? 'YOUR PLACE' : 'WINNER'}</span><b>${humanWon ? ordinal(standings.findIndex((entry) => entry.seat === 0) + 1) : escapeHtml(standings[0].name)}</b></div>
      <h2 id="modal-title" style="text-align:center">${humanWon ? 'You read the sea.' : `${escapeHtml(standings[0].name)} takes the chart.`}</h2>
      <p style="text-align:center">Eleven rounds, ${E.HAND_PATTERN.reduce((sum, n) => sum + n, 0)} cards in your hands, and a tide that never held still.</p>
      <div class="result-list">${standings.map((entry, index) => `<div class="result-row ${entry.seat === 0 ? 'exact' : ''}"><b>${index + 1}. ${escapeHtml(entry.name)}</b><span>${escapeHtml(E.PERSONAS[entry.seat].label)}</span><strong>${entry.score}</strong></div>`).join('')}</div>
      <div class="modal-actions"><button type="button" data-home>HOME</button><button class="modal-primary" type="button" data-new-voyage>SAIL AGAIN</button></div>`);
  }

  function confirmNewVoyage() {
    if (!game) return beginNewGame();
    openModal('confirm', `
      <p class="eyebrow">FOLD THE CURRENT CHART?</p>
      <h2 id="modal-title">Begin a new voyage?</h2>
      <p>Your present round is saved until you confirm. Starting again will replace it with a fresh deal and a newly placed tide.</p>
      <div class="modal-actions"><button type="button" data-close-modal>KEEP PLAYING</button><button class="modal-primary" type="button" data-confirm-new>NEW VOYAGE</button></div>`);
  }

  let celebrateRaf = 0;
  function celebrate(count) {
    // One shared canvas, so one owner: cancel any live burst before starting a new one.
    // Two overlapping loops would each clearRect the other's particles every frame,
    // erasing the earlier burst and leaving a zombie loop running.
    if (celebrateRaf) cancelAnimationFrame(celebrateRaf);
    const canvas = dom.celebrationCanvas;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colours = ['#77f2dd', '#f1c879', '#aa9ee9', '#eef7f4'];
    const particles = Array.from({ length: count || 70 }, () => ({
      x: window.innerWidth * (0.25 + Math.random() * 0.5),
      y: window.innerHeight * (0.18 + Math.random() * 0.15),
      vx: (Math.random() - 0.5) * 8,
      vy: -2 - Math.random() * 6,
      g: 0.12 + Math.random() * 0.12,
      size: 2 + Math.random() * 5,
      spin: Math.random() * Math.PI,
      colour: colours[Math.floor(Math.random() * colours.length)],
      life: 0.85 + Math.random() * 0.7,
    }));
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(2, (now - last) / 16.67);
      last = now;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      let alive = false;
      particles.forEach((p) => {
        if (p.life <= 0) return;
        alive = true;
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.spin += 0.12 * dt;
        p.life -= 0.012 * dt;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      });
      if (alive) celebrateRaf = requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); celebrateRaf = 0; }
    }
    celebrateRaf = requestAnimationFrame(frame);
  }

  function startSeaCanvas() {
    const canvas = dom.seaCanvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let pointerX = 0.5;
    let pointerY = 0.5;
    let particles = [];

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.floor((width * height) / 22000));
      particles = Array.from({ length: count }, () => ({ x: Math.random() * width, y: Math.random() * height, r: 0.4 + Math.random() * 1.5, v: 0.08 + Math.random() * 0.24, phase: Math.random() * Math.PI * 2 }));
    }

    function draw(now) {
      const time = now * 0.00022;
      ctx.clearRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(width * pointerX, height * pointerY, 0, width * pointerX, height * pointerY, Math.max(width, height) * 0.55);
      glow.addColorStop(0, 'rgba(68, 205, 190, 0.075)');
      glow.addColorStop(1, 'rgba(68, 205, 190, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.lineWidth = 1;
      for (let line = 0; line < 7; line += 1) {
        const baseY = height * (0.38 + line * 0.095);
        ctx.beginPath();
        for (let x = -20; x <= width + 20; x += 16) {
          const y = baseY + Math.sin(x * 0.011 + time * (1.1 + line * 0.06) + line) * (7 + line * 1.8) + Math.sin(x * 0.003 - time * 0.7) * 5;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(119, 242, 221, ${0.018 + line * 0.006})`;
        ctx.stroke();
      }

      particles.forEach((p) => {
        p.y -= p.v;
        p.x += Math.sin(time * 3 + p.phase) * 0.05;
        if (p.y < -4) { p.y = height + 4; p.x = Math.random() * width; }
        const alpha = 0.08 + (Math.sin(time * 5 + p.phase) + 1) * 0.045;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(171, 249, 232, ${alpha})`;
        ctx.fill();
      });
      if (!reduced) requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', (event) => {
      pointerX = event.clientX / Math.max(1, width);
      pointerY = event.clientY / Math.max(1, height);
    }, { passive: true });
    resize();
    draw(performance.now());
  }

  function handleModalClick(event) {
    const target = event.target.closest('button, [data-close-modal]');
    if (!target) return;
    if (target.matches('[data-close-modal]')) {
      // Round-recap and match-end are required decisions: closing them would just let
      // drive() re-open the same modal (the phase is still at its boundary), so the ✕
      // and scrim ignore them — matching the Escape handler. Advance via their buttons.
      if (ui.modal === 'round' || ui.modal === 'match') return;
      closeModal(true);
    }
    else if (target.matches('[data-continue-round]')) continueAfterRound();
    else if (target.matches('[data-confirm-new]')) {
      closeModal(false);
      beginNewGame();
    } else if (target.matches('[data-new-voyage]')) {
      closeModal(false);
      beginNewGame();
    } else if (target.matches('[data-home]')) {
      closeModal(false);
      returnHome();
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      if (ui.modal && !['round', 'match'].includes(ui.modal)) closeModal(true);
      return;
    }
    if (ui.modal) {
      if (event.key === 'Tab') {
        const focusable = $$('button:not([disabled]), [href], input:not([disabled])', dom.modalLayer).filter((el) => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (!dom.bidSheet.hidden && /^[0-9]$/.test(event.key)) {
      const bid = Number(event.key);
      if (E.validBids(game, 0).includes(bid)) humanBid(bid);
      return;
    }
    if (event.key === '?' || (event.key === '/' && event.shiftKey)) openRules();
    if (event.key.toLowerCase() === 'm') toggleSound();
  }

  function toggleSound() {
    settings.sound = !settings.sound;
    saveSettings();
    if (settings.sound) sound.play('click');
    showToast(settings.sound ? 'Sound on.' : 'Sound muted.');
  }

  function handleHandClick(event) {
    const node = event.target.closest('.playing-card');
    if (!node || !node.classList.contains('playable')) return;
    const cardId = node.dataset.cardId;
    // Touch has no hover to preview the overlapped fan (cards expose only a ~40px sliver),
    // so the first tap on a playable card raises it and a second tap on the raised card
    // plays it; tapping a different card moves the raise. Mouse/keyboard keep instant play —
    // their :hover / :focus-visible lift is already the preview, and an Enter/Space
    // activation (a native click) still plays on the first press.
    if (window.matchMedia('(hover: none)').matches && ui.raisedCard !== cardId) {
      ui.raisedCard = cardId;
      renderHand();
      return;
    }
    humanPlay(cardId);
  }

  function bindEvents() {
    // Delegated: card nodes outlive a render now, so per-node listeners would stack up.
    dom.hand.addEventListener('click', handleHandClick);
    dom.newButton.addEventListener('click', beginNewGame);
    dom.continueButton.addEventListener('click', continueGame);
    dom.homeRulesButton.addEventListener('click', openRules);
    dom.rulesButton.addEventListener('click', openRules);
    dom.scoreButton.addEventListener('click', openScorecard);
    dom.soundButton.addEventListener('click', toggleSound);
    dom.newMatchButton.addEventListener('click', confirmNewVoyage);
    dom.hintButton.addEventListener('click', takeCardSounding);
    dom.bidHintButton.addEventListener('click', takeBidSounding);
    dom.modalLayer.addEventListener('click', handleModalClick);
    // The static ✕ and scrim already bubble to handleModalClick above; a second direct
    // listener here only duplicated the close and bypassed its round/match guard.
    $$('input[name="difficulty"]').forEach((input) => input.addEventListener('change', () => {
      settings.difficulty = input.value;
      saveSettings();
    }));
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('pagehide', saveGame);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
    document.addEventListener('pointerdown', () => sound.ensure(), { once: true, passive: true });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  function init() {
    savedGame = hydrateSavedGame();
    saveSettings();
    bindEvents();
    renderHome();
    setScreen('home');
    startSeaCanvas();
    registerServiceWorker();
  }

  init();
})();
