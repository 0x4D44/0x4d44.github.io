/* Pigeon Protocol UI. Engine does the sums; this does the feathers. */
(function () {
  'use strict';
  var E = window.PigeonEngine, C = window.PigeonContent;
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var SVGNS = 'http://www.w3.org/2000/svg', XLINK = 'http://www.w3.org/1999/xlink';

  /* ---------- persistence (never required) ---------- */
  var KEY = 'pigeon-protocol.v1';
  var prog = { stars: {}, fails: {}, helped: {}, flock: '', fast: false };
  try { var raw = localStorage.getItem(KEY); if (raw) { var o = JSON.parse(raw); if (o && typeof o === 'object') { prog.stars = o.stars || {}; prog.fails = o.fails || {}; prog.helped = o.helped || {}; prog.fast = !!o.fast; prog.flock = typeof o.flock === 'string' ? o.flock : ''; } } } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch (e) {} }

  /* ---------- state ---------- */
  var S = {
    level: null, run: null, attempt: {}, shown: 0, w: 1, phase: 'title', busy: false, auto: false, assisted: false, reno: null,
    sound: false, skipping: false, roll: [], sandbox: { C: 15, p: 0, rival: false }, timer: 0, finished: false, runId: 0
  };
  var SALT = Math.floor(Math.random() * 90000) + 1;   // so a reload is a new sky
  var LV = E.LEVELS;
  function levelById(id) { for (var i = 0; i < LV.length; i++) if (LV[i].id === id) return LV[i]; return null; }
  function flockName() { return (prog.flock || '').trim() || 'The Colinton Aerial Postal Service'; }
  function plural(n, a, b) { return n === 1 ? a : (b || a + 's'); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 3200); }

  /* ---------- sound (off by default) ---------- */
  var actx = null;
  function ensureAudio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
  function coo(kind) {
    if (!S.sound || !ensureAudio()) return;
    var t = actx.currentTime, g = actx.createGain(), o = actx.createOscillator();
    o.type = 'sine'; o.connect(g); g.connect(actx.destination);
    var f = kind === 'lost' ? [180, 90] : kind === 'ack' ? [520, 600] : [330, 260];
    o.frequency.setValueAtTime(f[0], t); o.frequency.exponentialRampToValueAtTime(f[1], t + 0.18);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.start(t); o.stop(t + 0.3);
    if (kind === 'release') { var o2 = actx.createOscillator(), g2 = actx.createGain(); o2.connect(g2); g2.connect(actx.destination); o2.frequency.setValueAtTime(360, t + 0.22); o2.frequency.exponentialRampToValueAtTime(280, t + 0.4); g2.gain.setValueAtTime(0.0001, t + 0.22); g2.gain.exponentialRampToValueAtTime(0.07, t + 0.25); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); o2.start(t + 0.22); o2.stop(t + 0.5); }
  }

  /* ---------- screens ---------- */
  function show(which) {
    $('screen-title').hidden = which !== 'title';
    $('screen-game').hidden = which !== 'game';
    S.phase = which === 'title' ? 'title' : S.phase;
  }
  function isUnlocked(id) {
    if (id === 1) return true;
    var prev = id === 6 ? 1 : id - 1;
    return (prog.stars[prev] || 0) > 0 || (prog.helped[prev] || 0) > 0 || (prog.fails[prev] || 0) >= 2;
  }
  function starsHtml(n) { var s = ''; for (var i = 1; i <= 3; i++) s += '<span class="' + (i <= n ? 'on' : 'off') + '">★</span>'; return s; }

  function renderLevels() {
    var ol = $('levels'); ol.innerHTML = '';
    LV.forEach(function (lv) {
      var li = el('li', 'lvl' + (isUnlocked(lv.id) ? '' : ' locked'));
      var c = C.LEVELS[lv.id];
      var h = el('h3', null, lv.id + '. ' + lv.name);
      var meta = el('div', 'meta', lv.sandbox ? 'Unscored. Set the weather, break things.' : lv.scrolls + ' scrolls in ' + lv.deadline + ' rounds. ' + c.doc);
      li.appendChild(h); li.appendChild(meta);
      var right = el('div', 'stars');
      if (!lv.sandbox) { right.innerHTML = starsHtml(prog.stars[lv.id] || 0); right.setAttribute('aria-label', (prog.stars[lv.id] || 0) + ' of 3 stars'); }
      li.appendChild(right);
      var b = el('button', 'btn ' + (isUnlocked(lv.id) ? 'btn-primary' : ''), isUnlocked(lv.id) ? ((prog.stars[lv.id] || 0) > 0 ? 'Fly again' : 'Fly') : 'Locked');
      b.type = 'button'; b.disabled = !isUnlocked(lv.id);
      if (!b.disabled) b.addEventListener('click', function () { commitFlock(); openLevel(lv.id); });
      if (!isUnlocked(lv.id)) b.setAttribute('aria-label', 'Level ' + lv.id + ' is locked. Complete the previous level, or fail it twice and the Ministry will take pity.');
      li.appendChild(b);
      li.style.gridTemplateColumns = 'minmax(0,1fr) auto';
      ol.appendChild(li);
    });
    var done = 0; for (var k in prog.stars) if (prog.stars[k] > 0) done++;
    $('progress-note').textContent = done ? 'Progress is kept in this browser only. The Ministry keeps nothing; it has filing problems of its own.' : 'Later levels unlock as you deliver. Fail one twice and the Ministry takes pity.';
  }
  function commitFlock() { var v = $('flock').value.trim(); prog.flock = v.slice(0, 28); save(); }

  /* ---------- level lifecycle ---------- */
  function sandboxLevel() {
    var base = levelById(6), lv = JSON.parse(JSON.stringify(base));
    lv.cap = [[1, S.sandbox.C]]; lv.p = S.sandbox.p / 100; lv.rival = S.sandbox.rival ? { start: 3 } : null;
    return lv;
  }
  function openLevel(id) {
    var lv = levelById(id);
    if (id === 6) { openSandboxDialog(); return; }
    beginBrief(lv);
  }
  function seedFor(lv) {
    var a = S.attempt[lv.id] || 0;
    return lv.seed + a * 7919 + SALT * 31;
  }
  function beginBrief(lv, opts) {
    opts = opts || {};
    clearTimeout(S.timer); S.runId++; S.skipping = true;
    S.level = lv; S.run = E.createRun(lv, seedFor(lv)); S.shown = 0; S.busy = false; S.auto = false; S.assisted = false; S.reno = null;
    S.roll = []; S.finished = false; S.skipping = false; S.w = 1; S.phase = 'brief';
    $('sky').innerHTML = ''; $('btn-skip').hidden = true;
    show('game');
    $('debrief').hidden = true;
    renderAll();
    renderBrief(lv, opts);
    window.scrollTo(0, 0);
  }

  function renoRecordText(lv, run) {
    var ref = E.renoReference(lv, run.seed);
    if (ref.inTime) return 'The Reno flies this in ' + ref.rounds + ' rounds and loses ' + ref.lost + ' ' + plural(ref.lost, 'bird') + '.';
    if (ref.won && ref.rounds > lv.deadline) return 'The Reno needs about ' + ref.rounds + ' rounds, which is past the deadline of ' + lv.deadline + '. He loses ' + ref.lost + ' ' + plural(ref.lost, 'bird') + ' on the way, and most of them to bad judgement.';
    return 'The Reno does not finish this one.';
  }

  function renderBrief(lv, opts) {
    var c = C.LEVELS[lv.id], d = $('debrief'); d.hidden = false; d.innerHTML = '';
    var h = el('h2', null, 'Level ' + (lv.sandbox ? '∞' : lv.id) + ': ' + lv.name); d.appendChild(h);
    d.appendChild(el('p', null, c.blurb));
    var memo = el('p', 'db-reno');
    memo.innerHTML = '<b>Consignment:</b> ' + esc(c.doc) + '<br><b>Addressed to:</b> ' + esc(c.to) + '<br><b>Scrolls:</b> ' + lv.scrolls + ' &middot; <b>Deadline:</b> ' + lv.deadline + ' rounds' + (lv.sandbox ? '' : ' &middot; <b>Loft reserve:</b> ' + lv.loft + ' birds (lose them all and the club folds)');
    d.appendChild(memo);
    if (!lv.sandbox) {
      var st = lv.stars, p = el('p', 'db-reno');
      p.innerHTML = '<b>Three stars:</b> done in ' + st.three.rounds + ' rounds or fewer, losing ' + st.three.lost + ' birds or fewer. <b>Two:</b> ' + st.two.rounds + ' and ' + st.two.lost + '. <b>One:</b> deliver all of it, in time.' + (lv.id > 1 || (prog.stars[1] || 0) > 0 ? '<br><i>' + esc(renoRecordText(lv, S.run)) + ' Beat the bird-brain.</i>' : '');
      d.appendChild(p);
    }
    var row = el('div', 'cta-row');
    var go = el('button', 'btn btn-primary', 'Begin the first flight'); go.type = 'button'; go.id = 'btn-begin';
    go.addEventListener('click', function () { S.phase = 'play'; d.hidden = true; renderAll(); focusGo(); });
    row.appendChild(go); d.appendChild(row);
    S.phase = 'brief'; $('controls').hidden = true;
    setTimeout(function () { go.focus({ preventScroll: true }); }, 0);
  }
  function focusGo() { try { $('btn-go').focus({ preventScroll: true }); } catch (e) {} }

  /* ---------- derived views (only ever what the player has already seen) ---------- */
  function seen() { return S.run.history.slice(0, S.shown); }
  function totals() {
    var h = seen(), t = { flown: 0, del: 0, lost: 0, crowd: 0, hawk: 0 };
    h.forEach(function (r) { t.flown += r.w; t.del += r.delivered; t.lost += r.lost; t.crowd += r.lostCrowd; t.hawk += r.lostHawk; });
    return t;
  }
  function pendingCount() { return S.level.scrolls - totals().del; }

  function renderAll() {
    var lv = S.level, run = S.run, t = totals(), h = seen();
    $('s-level').textContent = lv.id + '. ' + lv.name;
    $('s-doc').textContent = flockName();
    $('s-round').textContent = S.shown + '/' + lv.deadline;
    $('s-del').textContent = t.del + '/' + lv.scrolls;
    var lostEl = $('s-lost'); lostEl.textContent = lv.sandbox ? String(t.lost) : t.lost + '/' + lv.loft;
    lostEl.className = (!lv.sandbox && t.lost >= lv.loft * 0.6) ? 'danger' : '';
    $('doc-name').textContent = '(' + C.LEVELS[lv.id].doc + ')';
    $('rival-loft').setAttribute('visibility', lv.rival ? 'visible' : 'hidden');
    renderScrolls(); renderReport(); renderChart(); renderControls(); renderRoll();
    var over = S.finished;
    $('controls').hidden = over || S.phase === 'brief';
    var nextRound = Math.min(S.shown + 1, lv.deadline);
    if (!over && S.phase !== 'brief') {
      var evs = C.LEVELS[lv.id].events, tx = evs[nextRound - 1];
      if (!tx) tx = C.POOL_EVENTS[(nextRound * 7 + lv.id) % C.POOL_EVENTS.length];
      $('event').innerHTML = '<b>NOTAM ' + String(nextRound).padStart(2, '0') + '</b>' + esc(tx);
    } else if (over) { $('event').innerHTML = '<b>NOTAM</b>The Ministry is closed for the day.'; } else { $('event').innerHTML = '<b>NOTAM</b>Awaiting your instructions, and a pigeon.'; }
    // gap sign
    var reveal = capacityRevealed();
    var sign = $('gap-sign');
    if (reveal && h.length) { sign.setAttribute('visibility', 'visible'); $('gap-sign-t').textContent = 'Gap: ' + h[h.length - 1].cap; } else sign.setAttribute('visibility', 'hidden');
  }
  function capacityRevealed() {
    if (S.finished) return true;
    if (S.level.id === 1) return false;
    return S.shown >= 2;
  }

  function renderScrolls() {
    var run = S.run, n = S.level.scrolls, h = seen(), acked = {}, lastLost = {};
    h.forEach(function (r) { r.newlyAcked.forEach(function (s) { acked[s] = 1; }); });
    if (h.length) h[h.length - 1].birds.forEach(function (b) { if (b.owner === 'you' && b.fate !== 'ok') lastLost[b.scroll] = 1; });
    var g = $('scroll-grid'), html = '', ok = 0, re = 0;
    for (var i = 1; i <= n; i++) { var cls = acked[i] ? 'ok' : (lastLost[i] ? 're' : ''); if (acked[i]) ok++; if (lastLost[i] && !acked[i]) re++; html += '<i class="sc ' + cls + '"></i>'; }
    g.innerHTML = html;
    g.setAttribute('aria-label', ok + ' of ' + n + ' scrolls acknowledged, ' + re + ' awaiting a second attempt.');
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function renderReport() {
    var box = $('report'), h = seen(), lv = S.level;
    $('shared').hidden = !(lv.rival && h.length);
    if (!h.length) {
      box.innerHTML = '<p class="muted">No flights yet. The sky is still undecided.</p><p class="coach">' + esc(C.HINTS.start) + '</p>';
      return;
    }
    var r = h[h.length - 1], html = '';
    var head = 'Round ' + r.round + ': you released ' + r.w + ' ' + plural(r.w, 'bird') + '. ';
    if (r.lost === 0) head += 'All ' + r.w + ' arrived.'; else head += r.delivered + ' arrived, ' + r.lost + ' ' + plural(r.lost, 'was', 'were') + ' lost.';
    html += '<p class="rep-head ' + (r.lost ? 'rep-bad' : 'rep-good') + '">' + esc(head) + '</p>';
    if (r.requested > r.w) html += '<p class="muted">You asked for ' + r.requested + ' birds. Only ' + r.w + ' ' + plural(r.w, 'scroll was', 'scrolls were') + ' left to send. The rest stayed home with tea.</p>';
    if (r.retx) html += '<p>' + r.retx + ' of those ' + plural(r.retx, 'was a', 'were') + ' <span class="ribbon">second attempt</span> ' + (r.retx > 1 ? 'scrolls' : 'scroll') + ', retransmitted first.</p>';
    if (r.delivered) html += '<p class="ack">' + esc(C.ACKS[(r.round * 3 + r.delivered) % C.ACKS.length]) + ' (' + r.delivered + ' ACK ' + plural(r.delivered, 'pigeon') + ' home.)</p>';
    if (r.lost) html += '<p class="muted">' + r.lost + ' ' + plural(r.lost, 'scroll') + ' will be flown again next round. Obituaries below.</p>';
    html += '<p class="coach">' + esc(coachLine(h)) + '</p>';
    box.innerHTML = html;
    if (lv.rival) {
      var tot = r.cap, you = r.delivered, riv = r.rivalDelivered, over = r.offered > r.cap ? (r.offered - r.passes) : 0;
      var scale = Math.max(r.offered, r.cap);
      var bar = $('shared-bar'); bar.innerHTML = '';
      var mk = function (cls, n) { var i = document.createElement('i'); i.className = cls; i.style.width = (n / scale * 100) + '%'; return i; };
      bar.appendChild(mk('you', you)); bar.appendChild(mk('riv', riv)); if (over) bar.appendChild(mk('over', over));
      var m = el('span', 'capm'); m.style.left = 'calc(' + (r.cap / scale * 100) + '% - 1px)'; bar.appendChild(m);
      var lab = 'Gap capacity ' + r.cap + '. You flew ' + r.w + ' and ' + you + ' arrived. The rival flew ' + r.rivalW + ' and ' + riv + ' arrived. ' + over + ' birds were lost to crowding or jostling.';
      bar.setAttribute('aria-label', lab);
    }
  }
  function coachLine(h) {
    var r = h[h.length - 1], lv = S.level;
    if (lv.id === 1 && h.length === 1) return r.lost ? 'First flight, first losses. The Ministry notes you started big. Brave, or hasty.' : 'Everyone arrived. Nobody has told you what the limit is. The Ministry suggests asking the sky.';
    if (r.lost === 0 && r.delivered >= r.w) return h.length < 4 ? C.HINTS.afterClean : 'Smooth. The Gap may have more to give, or this may be exactly right. Only birds can tell you.';
    if (r.lost > 0 && h.length > 1) {
      var prev = h[h.length - 2];
      if (r.w > prev.w) return 'Losses after sending more than last time. This looks like the sky answering back.';
      if (r.w <= prev.w && prev.lost === 0) return lv.p > 0 ? 'Losses at a flock size that was fine last time. Odd. The sky may simply be hostile.' : 'Losses at a size that worked before. Something else is using the Gap.';
    }
    return C.HINTS.afterLoss;
  }

  function renderControls() {
    var pend = Math.max(1, pendingCount()), max = Math.min(E.MAX_W, pend), r = $('w-range');
    S.w = Math.max(1, Math.min(S.w, max));
    r.max = String(max); r.value = String(S.w);
    $('w-out').textContent = String(S.w);
    $('w-lab').textContent = plural(S.w, 'bird') + ' this round';
    var blocked = S.busy || S.auto || S.finished || S.phase !== 'play';
    $('btn-go').disabled = blocked;
    r.disabled = blocked; $('w-minus').disabled = blocked || S.w <= 1; $('w-plus').disabled = blocked || S.w >= max;
    $('btn-go').textContent = S.busy ? 'Birds in flight…' : S.auto ? 'The Reno is flying' : 'Release the flock';
    $('controls').classList.toggle('busy', S.busy || S.auto);
    var note = '';
    if (S.w >= max && pend < E.MAX_W) note = 'Only ' + pend + ' ' + plural(pend, 'scroll') + ' left to send.';
    else if (S.w >= E.MAX_W) note = 'The loft has only 24 perches. This is the maximum flock.';
    $('w-note').textContent = note;
    var reno = $('btn-reno'), unlocked = (prog.stars[1] || 0) > 0;
    reno.hidden = !unlocked; reno.disabled = S.finished || S.phase !== 'play' || (S.busy && !S.auto);
    reno.setAttribute('aria-pressed', S.auto ? 'true' : 'false');
    reno.textContent = S.auto ? 'Fire the Reno' : 'Hire a Reno';
    $('keys').hidden = false;
  }

  function renderRoll() {
    var ol = $('roll'); ol.innerHTML = '';
    if (!S.roll.length) { ol.innerHTML = '<li class="muted">Nobody yet. The Ministry is as surprised as you.</li>'; return; }
    S.roll.slice().reverse().slice(0, 60).forEach(function (o) {
      var li = document.createElement('li');
      li.innerHTML = '<b>' + esc(o.name) + '</b> <span class="tr">(' + esc(o.trait) + ', round ' + o.round + ')</span>. ' + esc(o.line) + ' <span class="tr">Carrying: &ldquo;' + esc(o.cargo) + '&rdquo;.</span>';
      ol.appendChild(li);
    });
  }
  function birdIdent(serial) {
    var n = C.NAMES.length, base = C.NAMES[serial % n], gen = Math.floor(serial / n);
    var rom = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII'];
    return { name: base + (rom[gen] !== undefined ? rom[gen] : ' the ' + (gen + 1) + 'th'), trait: C.TRAITS[(serial * 7 + 3) % C.TRAITS.length] };
  }
  function addObits(rec) {
    var sn = C.LEVELS[S.level.id].snippets;
    rec.birds.forEach(function (b) {
      if (b.owner !== 'you' || b.fate === 'ok') return;
      var id = birdIdent(b.serial), pool = b.fate === 'crowd' ? C.OBIT_CROWD : C.OBIT_HAWK;
      S.roll.push({ name: id.name, trait: id.trait, round: rec.round, line: pool[(b.serial * 5 + rec.round) % pool.length], cargo: 'Scroll ' + b.scroll + ': ' + sn[b.scroll % sn.length] });
    });
  }

  /* ---------- chart ---------- */
  function renderChart() {
    var wrap = $('chart-wrap'), h = seen(), lv = S.level;
    if (h.length < 2 && !S.finished) {
      wrap.innerHTML = '<div class="chart-empty">The chart appears after your second flight. It is the only honest thing in this document.</div>';
      $('tiles').innerHTML = tiles(h); $('logtbl').innerHTML = logTable(h); return;
    }
    var D = Math.max(lv.deadline, h.length), reveal = capacityRevealed();
    var maxY = 8;
    h.forEach(function (r) { maxY = Math.max(maxY, r.w, reveal ? r.cap : 0); });
    maxY = Math.ceil((maxY + 1) / 4) * 4;
    var W = 360, H = 210, ml = 30, mr = 10, mt = 26, mb = 30, pw = W - ml - mr, ph = H - mt - mb;
    var X = function (r) { return ml + (D === 1 ? 0 : (r - 1) / (D - 1)) * pw; }, Y = function (v) { return mt + ph - v / maxY * ph; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(chartLabel(h, reveal)) + '" font-family="Georgia, serif">';
    s += '<rect x="' + ml + '" y="' + mt + '" width="' + pw + '" height="' + ph + '" fill="#fbf4e3" stroke="#2b2118" stroke-width="1.2"/>';
    for (var v = 0; v <= maxY; v += 4) s += '<line x1="' + ml + '" x2="' + (ml + pw) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#cdb88f" stroke-width=".7"/><text x="' + (ml - 4) + '" y="' + (Y(v) + 3.5) + '" font-size="10" text-anchor="end" fill="#5a4a3a">' + v + '</text>';
    var step = D > 16 ? 5 : 2;
    for (var r = 1; r <= D; r++) if (r === 1 || r % step === 0) s += '<text x="' + X(r) + '" y="' + (H - mb + 13) + '" font-size="10" text-anchor="middle" fill="#5a4a3a">' + r + '</text>';
    s += '<text x="' + (ml + pw / 2) + '" y="' + (H - 4) + '" font-size="10" text-anchor="middle" fill="#5a4a3a">round (one flight each)</text>';
    // capacity (hindsight)
    if (reveal && h.length) {
      var cp = '';
      h.forEach(function (r, i) { var x1 = i === 0 ? X(r.round) - 4 : (X(h[i - 1].round) + X(r.round)) / 2, x2 = i === h.length - 1 ? X(r.round) + 4 : (X(r.round) + X(h[i + 1].round)) / 2; cp += (i === 0 ? 'M' : 'L') + x1 + ' ' + Y(r.cap) + ' L' + x2 + ' ' + Y(r.cap) + ' '; });
      s += '<path d="' + cp + '" fill="none" stroke="#b3202a" stroke-width="2.2" stroke-dasharray="6 4"/>';
    }
    var line = function (key, col) { var d = ''; h.forEach(function (r, i) { d += (i ? 'L' : 'M') + X(r.round) + ' ' + Y(r[key]) + ' '; }); return '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.2" stroke-linejoin="round"/>'; };
    s += line('delivered', '#2f6b3a'); s += line('w', '#2b2118');
    h.forEach(function (r) {
      s += '<circle cx="' + X(r.round) + '" cy="' + Y(r.delivered) + '" r="3" fill="#2f6b3a"/>';
      s += '<circle cx="' + X(r.round) + '" cy="' + Y(r.w) + '" r="' + (r.lost ? 4.2 : 3) + '" fill="' + (r.lost ? '#b3202a' : '#2b2118') + '" stroke="#fbf4e3" stroke-width="1"/>';
    });
    // legend
    var lx = ml;
    s += '<line x1="' + lx + '" x2="' + (lx + 16) + '" y1="11" y2="11" stroke="#2b2118" stroke-width="2.2"/><text x="' + (lx + 20) + '" y="14.5" font-size="10" fill="#2b2118">flown</text>';
    s += '<line x1="' + (lx + 62) + '" x2="' + (lx + 78) + '" y1="11" y2="11" stroke="#2f6b3a" stroke-width="2.2"/><text x="' + (lx + 82) + '" y="14.5" font-size="10" fill="#2b2118">arrived</text>';
    s += '<circle cx="' + (lx + 140) + '" cy="11" r="4" fill="#b3202a"/><text x="' + (lx + 148) + '" y="14.5" font-size="10" fill="#2b2118">losses</text>';
    if (reveal) s += '<line x1="' + (lx + 194) + '" x2="' + (lx + 210) + '" y1="11" y2="11" stroke="#b3202a" stroke-width="2.2" stroke-dasharray="4 3"/><text x="' + (lx + 214) + '" y="14.5" font-size="10" fill="#2b2118">the Gap</text>';
    s += '</svg>';
    wrap.innerHTML = s;
    $('tiles').innerHTML = tiles(h); $('logtbl').innerHTML = logTable(h);
  }
  function chartLabel(h, reveal) {
    var t = 'Chart of birds flown and scrolls delivered per round. ' + h.map(function (r) { return 'Round ' + r.round + ': flown ' + r.w + ', arrived ' + r.delivered + (reveal ? ', Gap ' + r.cap : ''); }).join('. ') + '.';
    return t;
  }
  function tiles(h) {
    var t = totals(), eff = t.flown ? Math.round(t.del / t.flown * 100) : 0, last = h.length ? h[h.length - 1] : null;
    var tile = function (b, l) { return '<div class="tile"><b>' + b + '</b><span>' + l + '</span></div>'; };
    return tile(t.flown, 'birds flown') + tile(t.del, 'scrolls delivered') + tile(t.flown ? eff + '%' : '-', 'goodput per bird' + (last ? ' (last: ' + (last.w ? Math.round(last.delivered / last.w * 100) : 0) + '%)' : ''));
  }
  function logTable(h) {
    if (!h.length) return '<p class="muted">Nothing to report. Fly something.</p>';
    var rows = h.map(function (r) { return '<tr><td>' + r.round + '</td><td>' + r.w + '</td><td>' + r.delivered + '</td><td>' + r.lost + '</td><td>' + (capacityRevealed() ? r.cap : '?') + '</td></tr>'; }).join('');
    return '<div class="tbl-scroll"><table><thead><tr><th>Round</th><th>Flown</th><th>Arrived</th><th>Lost</th><th>Gap</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------- flight animation ---------- */
  function sv(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  var GX = 185;
  function px(u) { return 58 + 240 * u; }
  function py(u, lane) { return 86 - 20 * Math.sin(Math.PI * u) + lane * 5; }

  function animateRound(rec) {
    return new Promise(function (resolve) {
      var sky = $('sky'); sky.innerHTML = '';
      if (reduceMotion || S.skipping) { resolve(); return; }
      var speed = S.auto ? 0.6 : 1, OUT = 2000 * speed, BACK = 1100 * speed, STAG = 700 * speed;
      var birds = [], puffs = [], hawks = [], i, n = rec.birds.length;
      var rr = E.mulberry32(rec.round * 977 + S.run.seed);
      for (i = 0; i < n; i++) {
        var b = rec.birds[i], isYou = b.owner === 'you';
        var u = sv('use', { width: isYou ? 26 : 22, height: isYou ? 19 : 16 });
        u.setAttributeNS(XLINK, 'href', '#pgA'); u.setAttribute('href', '#pgA');
        u.style.color = isYou ? '#8b97ad' : '#b59469';
        sky.appendChild(u);
        var lane = (i % 7) - 3, delay = (i / Math.max(1, n)) * STAG;
        var dieU = b.fate === 'crowd' ? 0.53 : b.fate === 'hawk' ? 0.62 + rr() * 0.25 : null;
        birds.push({ el: u, b: b, lane: isYou ? lane : lane * 0.8 + 3, delay: delay, dieU: dieU, dead: false, ack: null, size: isYou ? 26 : 22 });
      }
      var survivors = birds.filter(function (o) { return o.b.fate === 'ok' && o.b.owner === 'you'; });
      var crowdN = rec.birds.filter(function (b) { return b.fate === 'crowd'; }).length;
      var cloud = null, ackTextShown = false;
      if (crowdN) {
        cloud = sv('g', { opacity: 0 });
        [[-12, 4, 11], [0, -2, 14], [13, 4, 11], [-4, 10, 9], [8, 11, 9]].forEach(function (c) { cloud.appendChild(sv('circle', { cx: GX + c[0], cy: 80 + c[1], r: c[2], fill: '#fbf4e3', stroke: '#2b2118', 'stroke-width': 1.4 })); });
        var t = sv('text', { x: GX, y: 85, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 'bold', fill: '#b3202a', 'font-family': 'Georgia, serif' }); t.textContent = '!?#*'; cloud.appendChild(t);
        sky.appendChild(cloud);
      }
      var total = STAG + OUT + BACK + 250, start = performance.now(), done = false;
      coo('release');
      function puff(x, y, now, hawkish) {
        for (var k = 0; k < 7; k++) {
          var f = sv('ellipse', { rx: 3.2, ry: 1.3, fill: k % 2 ? '#fbf4e3' : '#aeb7c6', stroke: '#2b2118', 'stroke-width': .6 });
          sky.appendChild(f); puffs.push({ el: f, x: x, y: y, vx: (rr() - .5) * 60, vy: -20 - rr() * 30, rot: rr() * 360, vr: (rr() - .5) * 600, t0: now });
        }
        if (S.sound) coo('lost');
      }
      function frame(now) {
        if (done) return;
        var t = now - start, flap = Math.floor(t / 110) % 2 ? '#pgB' : '#pgA';
        birds.forEach(function (o) {
          var lt = t - o.delay, u = Math.max(0, Math.min(1, lt / OUT));
          if (o.dead) return;
          if (lt < 0) { o.el.setAttribute('x', 10); o.el.setAttribute('y', 100 + o.lane * 3); o.el.setAttribute('href', '#pgA'); return; }
          if (o.dieU !== null && u >= o.dieU) {
            o.dead = true; o.el.setAttribute('visibility', 'hidden');
            var x = px(o.dieU), y = py(o.dieU, o.lane);
            puff(x, y, now);
            if (o.b.fate === 'hawk') { var hw = sv('use', { width: 34, height: 20 }); hw.setAttribute('href', '#hawk'); sky.appendChild(hw); hawks.push({ el: hw, x: x, y: y, t0: now }); }
            return;
          }
          var x2 = px(u), y2 = py(u, o.lane);
          o.el.setAttribute('x', x2 - o.size / 2); o.el.setAttribute('y', y2 - 9); o.el.setAttribute('href', flap);
          if (o.b.fate === 'ok' && o.b.owner === 'you' && u >= 1 && !o.ack) {
            var a = sv('use', { width: 15, height: 11 }); a.setAttribute('href', '#pgA'); a.style.color = '#a9b4c8'; sky.appendChild(a);
            var sc = sv('rect', { width: 5, height: 3, rx: 1, fill: '#fbf4e3', stroke: '#b3202a', 'stroke-width': .8 }); sky.appendChild(sc);
            o.ack = { el: a, sc: sc, t0: now }; o.el.setAttribute('visibility', 'hidden'); coo('ack');
          }
        });
        // scrum cloud at the Gap
        if (cloud) {
          var first = STAG * 0.1 + OUT * 0.53, cl = t - first;
          cloud.setAttribute('opacity', cl > 0 && cl < OUT * 0.9 ? Math.min(1, cl / 200) * (1 - Math.max(0, (cl - OUT * 0.7) / (OUT * 0.2))) : 0);
          cloud.setAttribute('transform', 'translate(0 ' + (Math.sin(t / 60) * 1.2) + ')');
        }
        birds.forEach(function (o) {
          if (!o.ack) return;
          var au = Math.max(0, Math.min(1, (now - o.ack.t0) / BACK)), ax = 304 - au * 246, ay = 102 - 14 * Math.sin(Math.PI * au) + o.lane * 2;
          o.ack.el.setAttribute('x', ax - 7); o.ack.el.setAttribute('y', ay - 5); o.ack.el.setAttribute('href', Math.floor(now / 110) % 2 ? '#pgB' : '#pgA');
          o.ack.sc.setAttribute('x', ax - 3); o.ack.sc.setAttribute('y', ay + 4);
          if (au >= 1) { o.ack.el.setAttribute('visibility', 'hidden'); o.ack.sc.setAttribute('visibility', 'hidden'); }
        });
        hawks.forEach(function (hk) { var ht = (now - hk.t0) / 500, hx = hk.x + 30 - ht * 80, hy = hk.y - 30 + ht * 38; hk.el.setAttribute('x', hx - 17); hk.el.setAttribute('y', hy - 10); hk.el.setAttribute('transform', 'rotate(' + (-20) + ' ' + hx + ' ' + hy + ')'); hk.el.setAttribute('opacity', ht > 1 ? 0 : 1); });
        puffs.forEach(function (p) { var pt = (now - p.t0) / 1000; if (pt > 1) { p.el.setAttribute('opacity', 0); return; } var x = p.x + p.vx * pt, y = p.y + p.vy * pt + 60 * pt * pt; p.el.setAttribute('transform', 'translate(' + x + ' ' + y + ') rotate(' + (p.rot + p.vr * pt) + ')'); p.el.setAttribute('opacity', 1 - pt); });
        if (!ackTextShown && survivors.length && t > STAG + OUT) { ackTextShown = true; $('map-caption').style.display = 'block'; $('map-caption').textContent = C.ACKS[(rec.round * 3 + rec.delivered) % C.ACKS.length]; }
        if (S.skipping || t >= total) { finish(); return; }
        requestAnimationFrame(frame);
      }
      function finish() { done = true; sky.innerHTML = ''; $('map-caption').style.display = 'none'; resolve(); }
      requestAnimationFrame(frame);
    });
  }

  /* ---------- playing a round ---------- */
  function release() {
    if (S.busy || S.finished || S.phase !== 'play') return;
    S.busy = true; S.skipping = false;
    var rec = E.playRound(S.run, S.w);
    $('btn-skip').hidden = reduceMotion; renderControls();
    announce('Flock released: ' + rec.w + ' ' + plural(rec.w, 'bird') + '.');
    animateRound(rec).then(function () {
      S.busy = false; S.shown = S.run.round; $('btn-skip').hidden = true;
      addObits(rec); renderAll();
      if (S.run.done) { endRun(); return; }
      if (S.auto) { S.timer = setTimeout(autoStep, reduceMotion ? 300 : 500); } else focusGo();
    });
  }
  function announce(msg) { /* the report region is the live region; this nudges screen readers during flight */ var r = $('report'); if (S.busy) { var p = r.querySelector('.fly'); if (!p) { p = el('p', 'fly vh'); r.insertBefore(p, r.firstChild); } p.textContent = msg; } }

  function hireReno() {
    if (S.finished || S.phase !== 'play') return;
    if (S.auto) { S.auto = false; clearTimeout(S.timer); renderControls(); toast('The Reno has been dismissed. He is relieved, mostly.'); return; }
    S.assisted = true; S.auto = true;
    var h = S.run.history, r = E.createReno(S.w);
    if (h.length) {
      r.w = h[h.length - 1].w;
      var lastLoss = null; h.forEach(function (x) { if (x.lostCrowd > 0 || x.lost > 0) lastLoss = x; });
      if (lastLoss) r.ssthresh = Math.max(2, Math.floor(lastLoss.w / 2));
      r._fresh = false;
    } else r._fresh = true;
    S.reno = r;
    toast('Reno hired. Stars do not count while he flies. He does not mind.');
    renderControls();
    if (!S.busy) S.timer = setTimeout(autoStep, 350);
  }
  function autoStep() {
    if (!S.auto || S.busy || S.finished) return;
    var r = S.reno, h = S.run.history;
    if (r._fresh) r._fresh = false; else r.w = E.renoNext(r, h[h.length - 1].lost > 0);
    S.w = Math.min(r.w, Math.max(1, pendingCount()), E.MAX_W);
    renderControls(); release();
  }

  /* ---------- debrief ---------- */
  function endRun() {
    var run = S.run, lv = S.level; S.finished = true; S.auto = false; clearTimeout(S.timer);
    var stars = 0;
    if (run.won && !S.assisted && !lv.sandbox) { stars = E.starsFor(run); if (stars > (prog.stars[lv.id] || 0)) prog.stars[lv.id] = stars; save(); }
    else if (!run.won) { prog.fails[lv.id] = (prog.fails[lv.id] || 0) + 1; save(); }
    else if (run.won && S.assisted && !prog.stars[lv.id] && lv.id === 1) { /* assisted wins do not unlock */ }
    renderAll();
    var d = $('debrief'); d.hidden = false; d.innerHTML = '';
    var data = run.won ? C.DEBRIEF.win[lv.id] : C.DEBRIEF.fail[run.endReason === 'loft' ? 'loft' : 'deadline'];
    d.appendChild(el('h2', null, data.title));
    var t = totals(), verdict;
    if (run.won) verdict = 'Delivered: all ' + lv.scrolls + ' scrolls in ' + run.round + ' ' + plural(run.round, 'round') + ', losing ' + t.lost + ' ' + plural(t.lost, 'bird') + '.';
    else if (run.endReason === 'loft') verdict = 'The loft is empty. ' + t.lost + ' birds lost; ' + t.del + ' of ' + lv.scrolls + ' scrolls got through. ' + flockName() + ' has been dissolved.';
    else verdict = 'The deadline passed with ' + t.del + ' of ' + lv.scrolls + ' scrolls delivered. The council has already moved on.';
    var vp = el('p', 'db-verdict', verdict); d.appendChild(vp);
    if (run.won && !lv.sandbox) {
      var sp = el('div', 'db-stars'); sp.innerHTML = S.assisted ? '' : starsHtml(stars); d.appendChild(sp);
      if (S.assisted) d.appendChild(el('p', 'db-reno', 'The Reno flew some or all of this. He accepts no credit and the Ministry awards no stars.'));
      else sp.setAttribute('aria-label', stars + ' of 3 stars');
    }
    if (!lv.sandbox) {
      var ref = E.renoReference(lv, run.seed), rp = el('p', 'db-reno');
      rp.textContent = 'The Reno on this same sky: ' + (ref.inTime ? ref.rounds + ' rounds, ' + ref.lost + ' ' + plural(ref.lost, 'bird') + ' lost.' : ref.won ? 'about ' + ref.rounds + ' rounds, ' + ref.lost + ' birds lost, which is past the deadline.' : 'did not finish.');
      d.appendChild(rp);
    }
    // personalised observations
    var obs = observations(run, lv);
    obs.forEach(function (o) { d.appendChild(el('p', null, o)); });
    data.text.forEach(function (p) { d.appendChild(el('p', null, p)); });
    var f = el('p', 'db-fact'); f.innerHTML = '<b>Real-world fact.</b> ' + esc(data.fact); d.appendChild(f);
    if (!run.won) d.appendChild(el('p', 'muted', 'Retrying gives you a fresh sky: same Gap, different hawks.'));
    var row = el('div', 'cta-row');
    var btn = function (txt, cls, fn) { var b = el('button', 'btn ' + cls, txt); b.type = 'button'; b.addEventListener('click', fn); row.appendChild(b); return b; };
    var nextId = lv.id < 6 ? lv.id + 1 : null;
    if (run.won && nextId && isUnlocked(nextId)) btn(nextId === 6 ? 'On to the Open Sky' : 'Next: ' + levelById(nextId).name, 'btn-primary', function () { openLevel(nextId); });
    btn(run.won ? 'Fly it again' : 'Try again', run.won ? '' : 'btn-primary', function () { S.attempt[lv.id] = (S.attempt[lv.id] || 0) + 1; lv.sandbox ? sandboxRestart() : beginBrief(lv); });
    if ((prog.stars[1] || 0) > 0 || (run.won && lv.id === 1 && !S.assisted)) btn('Watch the Reno fly this', '', function () { S.attempt[lv.id] = (S.attempt[lv.id] || 0) + 1; var again = lv.sandbox ? sandboxLevel() : lv; beginBrief(again); S.phase = 'play'; $('debrief').hidden = true; renderAll(); hireReno(); });
    if (lv.sandbox) btn('Set the weather again', '', openSandboxDialog);
    btn('All levels', '', function () { goTitle(true); });
    d.appendChild(row);
    d.appendChild(el('p', 'smallprint', 'Signed, ' + flockName() + '. Request for Comments: please do not send comments by pigeon.'));
    if (run.won && lv.id === 1 && !S.assisted) toast('Unlocked: Hire a Reno, a bird-brained autopilot.');
    setTimeout(function () { d.focus({ preventScroll: true }); d.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }, 80);
  }

  function observations(run, lv) {
    var h = run.history, out = [], i;
    // collapse in miniature
    for (i = 0; i < h.length; i++) {
      var r = h[i];
      if (r.w >= r.cap * 1.5 && r.delivered <= r.cap * 0.6 && !lv.rival) { out.push('Round ' + r.round + ': you released ' + r.w + ' birds into a Gap that takes ' + r.cap + ', and only ' + r.delivered + ' arrived. More birds flown, fewer scrolls delivered. That is congestion collapse in miniature.'); break; }
    }
    if (lv.id === 2 || lv.id === 5) {
      var panics = 0, hawkOnly = 0;
      for (i = 0; i + 1 < h.length; i++) if (h[i].lostHawk > 0 && h[i].lostCrowd === 0) { hawkOnly++; if (h[i + 1].w <= Math.floor(h[i].w * 0.6)) panics++; }
      if (hawkOnly >= 2) out.push(panics ? 'On ' + panics + ' of the ' + hawkOnly + ' rounds where only hawks took birds, you cut the flock sharply. The Gap was not the problem there.' : 'On ' + hawkOnly + ' rounds hawks took birds and the Gap was fine. You kept your nerve each time, which is the whole trick.');
    }
    if (lv.rival && h.length) {
      var y = 0, v = 0; h.forEach(function (r) { y += r.delivered; v += r.rivalDelivered; });
      if (y + v) out.push('Across the flight you carried ' + Math.round(y / (y + v) * 100) + '% of the traffic through the Gap; the rival carried ' + Math.round(v / (y + v) * 100) + '%.');
    }
    if (lv.cap.length > 1 && h.length) { var first = null; for (i = 0; i < h.length; i++) if (h[i].cap !== h[0].cap) { first = h[i]; break; } if (first) out.push('The Gap changed size at round ' + first.round + ', from ' + h[0].cap + ' to ' + first.cap + '. The sender is never told. It can only notice.'); }
    return out;
  }

  /* ---------- sandbox ---------- */
  function openSandboxDialog() {
    var dlg = $('dlg-sandbox');
    $('sb-c').value = S.sandbox.C; $('sb-p').value = S.sandbox.p; $('sb-r').checked = S.sandbox.rival;
    $('sb-c-o').textContent = S.sandbox.C; $('sb-p-o').textContent = S.sandbox.p;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function sandboxRestart() { beginBrief(sandboxLevel()); }

  /* ---------- navigation ---------- */
  function goTitle(force) {
    if (!force && S.run && !S.finished && S.shown > 0 && !S.auto && !window.confirm('Abandon this flight? The birds will be told it was a drill.')) return;
    clearTimeout(S.timer); S.auto = false; S.busy = false; S.skipping = true;
    renderLevels(); show('title'); $('flock').value = prog.flock; window.scrollTo(0, 0);
  }

  /* ---------- wiring ---------- */
  function setW(v) { if (S.busy || S.auto || S.finished || S.phase !== 'play') return; S.w = Math.max(1, Math.min(v, +$('w-range').max)); renderControls(); }
  function init() {
    $('flock').value = prog.flock;
    $('flock').addEventListener('change', commitFlock);
    renderLevels();
    $('btn-start').addEventListener('click', function () { commitFlock(); var next = 1; for (var i = 1; i <= 5; i++) { if ((prog.stars[i] || 0) === 0 && isUnlocked(i)) { next = i; break; } if (i === 5) next = 5; } openLevel(next); });
    $('btn-levels').addEventListener('click', function () { goTitle(false); });
    $('btn-howto').addEventListener('click', function () { var d = $('dlg-howto'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); });
    $('btn-sound').addEventListener('click', function () { S.sound = !S.sound; this.setAttribute('aria-pressed', S.sound); this.textContent = 'Coos: ' + (S.sound ? 'on' : 'off'); if (S.sound) { ensureAudio(); coo('release'); } });
    $('w-minus').addEventListener('click', function () { setW(S.w - 1); });
    $('w-plus').addEventListener('click', function () { setW(S.w + 1); });
    $('w-range').addEventListener('input', function () { setW(+this.value); });
    $('btn-go').addEventListener('click', release);
    $('btn-reno').addEventListener('click', hireReno);
    $('btn-skip').addEventListener('click', function () { S.skipping = true; });
    $('mapwrap').addEventListener('click', function () { if (S.busy) S.skipping = true; });
    $('sb-c').addEventListener('input', function () { $('sb-c-o').textContent = this.value; });
    $('sb-p').addEventListener('input', function () { $('sb-p-o').textContent = this.value; });
    $('sb-form').addEventListener('submit', function () { S.sandbox.C = +$('sb-c').value; S.sandbox.p = +$('sb-p').value; S.sandbox.rival = $('sb-r').checked; setTimeout(sandboxRestart, 0); });
    $('egg').addEventListener('click', function () { var t = $('egg-text'), open = t.hidden; t.hidden = !open; t.textContent = open ? ' ' + C.FOOT_BERGEN : ''; this.setAttribute('aria-expanded', open); });
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'TEXTAREA' || (tag === 'INPUT' && e.target.type === 'text') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      if ($('screen-game').hidden) return;
      var k = e.key;
      if (k === '+' || k === '=') { setW(S.w + 1); e.preventDefault(); }
      else if (k === '-' || k === '_') { setW(S.w - 1); e.preventDefault(); }
      else if (k === 'r' || k === 'R') { if (tag !== 'BUTTON' || e.target.id === 'btn-go') { if (!e.repeat) release(); } }
      else if (k === 'h' || k === 'H') { if ((prog.stars[1] || 0) > 0 && !e.repeat) hireReno(); }
    });
    var onMq = function (e) { reduceMotion = e.matches; };
    try { var mq = window.matchMedia('(prefers-reduced-motion: reduce)'); mq.addEventListener ? mq.addEventListener('change', onMq) : mq.addListener(onMq); } catch (e) {}
    // title mascot
    var h1 = document.querySelector('#screen-title h1'); if (h1) h1.classList.add('wob');
    show('title');
  }
  init();
})();
