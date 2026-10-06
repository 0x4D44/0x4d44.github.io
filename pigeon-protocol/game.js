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
  var prog = E.sanitizeProgress(null);
  try { var raw = localStorage.getItem(KEY); if (raw) prog = E.sanitizeProgress(JSON.parse(raw)); } catch (e) {}
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
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 2600); }
  function pct(x) { return Math.round(x * 100) + '%'; }

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
    if (which === 'title') S.phase = 'title';
  }
  // A level opens when the one before it was won AND the player showed it can respond to loss (2+ stars imply
  // that), or the Reno flew it, or the player failed it twice. A blind win does not open the next level.
  function isUnlocked(id) {
    if (id === 1) return true;
    var prev = id === 6 ? 1 : id - 1;
    return ((prog.stars[prev] || 0) >= 2) || (prog.adapted[prev] || 0) > 0 || (prog.helped[prev] || 0) > 0 || (prog.fails[prev] || 0) >= 2;
  }
  function renoUnlocked() { return (prog.stars[1] || 0) > 0 || (prog.helped[1] || 0) > 0; }
  function starsHtml(n) { var s = ''; for (var i = 1; i <= 3; i++) s += '<span class="' + (i <= n ? 'on' : 'off') + '">★</span>'; return s; }

  function renderLevels() {
    var ol = $('levels'); ol.innerHTML = '';
    LV.forEach(function (lv) {
      var li = el('li', 'lvl' + (isUnlocked(lv.id) ? '' : ' locked'));
      var c = C.LEVELS[lv.id];
      li.appendChild(el('h3', null, lv.id + '. ' + lv.name));
      li.appendChild(el('div', 'meta', lv.sandbox ? 'Unscored. Set the weather, break things.' : lv.scrolls + ' scrolls in ' + lv.deadline + ' rounds. ' + c.doc));
      var right = el('div', 'stars');
      if (!lv.sandbox) { right.innerHTML = starsHtml(prog.stars[lv.id] || 0); right.setAttribute('aria-label', (prog.stars[lv.id] || 0) + ' of 3 stars'); }
      li.appendChild(right);
      var b = el('button', 'btn ' + (isUnlocked(lv.id) ? 'btn-primary' : ''), isUnlocked(lv.id) ? ((prog.stars[lv.id] || 0) > 0 ? 'Fly again' : 'Fly') : 'Locked');
      b.type = 'button'; b.disabled = !isUnlocked(lv.id);
      if (!b.disabled) b.addEventListener('click', function () { commitFlock(); openLevel(lv.id); });
      else b.setAttribute('aria-label', 'Level ' + lv.id + ' is locked. Complete the previous level, or fail it twice and the Ministry will take pity.');
      li.appendChild(b);
      ol.appendChild(li);
    });
    var done = 0; for (var k in prog.stars) if (prog.stars[k] > 0) done++;
    $('progress-note').textContent = done ? 'Progress is kept in this browser only. The Ministry keeps nothing; it has filing problems of its own.' : 'Later levels unlock as you deliver. Fail one twice and the Ministry takes pity.';
  }
  function commitFlock() { var v = $('flock').value.trim(); prog.flock = v.slice(0, 28); save(); }

  /* ---------- level lifecycle ---------- */
  function sandboxLevel() {
    var lv = JSON.parse(JSON.stringify(levelById(6)));
    lv.cap = [[1, S.sandbox.C]]; lv.p = S.sandbox.p / 100; lv.rival = S.sandbox.rival ? { start: 3 } : null;
    return lv;
  }
  function openLevel(id) { if (id === 6) { openSandboxDialog(); return; } beginBrief(levelById(id)); }
  function seedFor(lv) { return lv.seed + (S.attempt[lv.id] || 0) * 7919 + SALT * 31; }

  function beginBrief(lv) {
    clearTimeout(S.timer); S.runId++;
    S.level = lv; S.run = E.createRun(lv, seedFor(lv)); S.shown = 0; S.busy = false; S.auto = false; S.assisted = false; S.reno = null;
    S.roll = []; S.finished = false; S.skipping = false; S.w = 1; S.phase = 'brief'; S.hiredAt = 0; S._reactRound = null;
    $('sky').innerHTML = ''; $('btn-skip').hidden = true; $('mapwrap').classList.remove('shake');
    show('game'); $('debrief').hidden = true;
    renderAll(); renderBrief(lv);
    window.scrollTo(0, 0);
  }

  function renoRecordText(lv, run) {
    var ref = E.renoReference(lv, run.seed);
    if (ref.inTime) return 'The Reno flies this sky in ' + ref.rounds + ' rounds and loses ' + ref.lost + ' ' + plural(ref.lost, 'bird') + '.';
    if (ref.won) return 'The Reno needs about ' + ref.rounds + ' rounds on this sky, which is past the deadline of ' + lv.deadline + '.';
    return 'The Reno does not finish this one.';
  }
  function starsKey(lv) {
    var st = lv.stars; if (!st) return '';
    var sh = function (t) { return (t.share !== undefined ? ', no more than ' + Math.round(t.share * 100) + '% of the Gap while the rival is flying' : '') + (t.minShare !== undefined ? ', and at least ' + Math.round(t.minShare * 100) + '%' : ''); };
    return '<b>Three stars:</b> in ' + st.three.rounds + ' rounds or fewer, losing ' + st.three.lost + ' birds or fewer' + sh(st.three) + '.<br><b>Two:</b> ' + st.two.rounds + ' rounds, ' + st.two.lost + ' birds' + (st.two.share !== undefined ? ', no more than ' + Math.round(st.two.share * 100) + '% of the Gap' : '') + '. <b>One:</b> deliver all of it, in time, with birds left.<br><b>Two and three also need</b> you to have flown fewer birds at least once after losing some: a flock that only grows, or only holds, has not adapted to anything.';
  }
  function renderBrief(lv) {
    var c = C.LEVELS[lv.id], d = $('debrief'); d.hidden = false; d.innerHTML = '';
    d.appendChild(el('h2', null, 'Level ' + (lv.sandbox ? '∞' : lv.id) + ': ' + lv.name));
    d.appendChild(el('p', null, c.blurb));
    var memo = el('p', 'db-reno');
    memo.innerHTML = '<b>Consignment:</b> ' + esc(c.doc) + '<br><b>Addressed to:</b> ' + esc(c.to) + '<br><b>Scrolls:</b> ' + lv.scrolls + ' &middot; <b>Deadline:</b> ' + lv.deadline + ' rounds' + (lv.sandbox ? '' : ' &middot; <b>Loft reserve:</b> ' + lv.loft + ' birds (lose them all and the club folds)');
    d.appendChild(memo);
    if (!lv.sandbox) {
      var p = el('div', 'db-reno stars-key');
      p.innerHTML = '<b>3 stars:</b> quick and tidy, and you must have responded to losses. <details class="star-d"><summary>Star rules in full</summary><p>' + starsKey(lv) + '</p></details>' + (renoUnlocked() || lv.id > 1 ? '<i>' + esc(renoRecordText(lv, S.run)) + '</i>' : '');
      d.appendChild(p);
      if ((prog.fails[lv.id] || 0) > 0) {
        var lab = el('label', 'prefill'); var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!S.prefill; cb.id = 'prefill';
        cb.addEventListener('change', function () { S.prefill = cb.checked; });
        lab.appendChild(cb); lab.appendChild(document.createTextNode(' Pre-fill my first three flocks (2, 4, 8). I will still press the button.')); d.appendChild(lab);
      }
    }
    var row = el('div', 'cta-row brief-cta');
    var go = el('button', 'btn btn-primary', 'Begin the first flight'); go.type = 'button'; go.id = 'btn-begin';
    go.addEventListener('click', function () { S.phase = 'play'; d.hidden = true; renderAll(); showStatus(); focusGo(); });
    row.appendChild(go); d.appendChild(row);
    S.phase = 'brief'; $('controls').hidden = true;
    setTimeout(function () { go.focus({ preventScroll: true }); if (window.innerWidth < 980) window.scrollTo({ top: Math.max(0, window.scrollY + d.getBoundingClientRect().top - 60), behavior: reduceMotion ? 'auto' : 'smooth' }); }, 30);
  }
  function focusGo() { try { $('btn-go').focus({ preventScroll: true }); } catch (e) {} }
  function showStatus() {
    var st = $('status'), r = st.getBoundingClientRect();
    if (r.top < 0 || r.top > 90) window.scrollTo({ top: window.scrollY + r.top - 56, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  /* ---------- derived views (only ever what the player has already seen) ---------- */
  function seen() { return S.run.history.slice(0, S.shown); }
  function totals() {
    var t = { flown: 0, del: 0, lost: 0 };
    seen().forEach(function (r) { t.flown += r.w; t.del += r.delivered; t.lost += r.lost; });
    return t;
  }
  function pendingCount() { return S.level.scrolls - totals().del; }

  // Own-trace only: compares what the last two flights delivered with what the remaining rounds must average.
  function paceHint(lv) {
    var h = seen(), n = h.length;
    if (lv.sandbox || S.finished || n < 2) return '';
    var left = lv.deadline - n, pend = pendingCount();
    if (pend <= 0) return '';
    if (left <= 0) return 'pace: out of time';
    var rate = (h[n - 1].delivered + h[n - 2].delivered) / 2, need = pend / left;
    return 'pace: ' + (rate >= need * 1.15 ? 'ahead of the deadline' : rate >= need * 0.85 ? 'on the deadline' : 'behind the deadline');
  }
  function renderAll() {
    var lv = S.level, t = totals();
    $('s-level').textContent = lv.id + '. ' + lv.name;
    $('s-doc').textContent = flockName();
    $('s-round').textContent = S.shown + '/' + lv.deadline;
    $('s-clock').textContent = paceHint(lv);
    $('s-pace').textContent = lv.stars ? '3\u2605 \u2264 r' + lv.stars.three.rounds : '';
    if (S.prefill && S.phase === 'play' && !S.busy && !S.finished && S.shown < 3) S.w = [2, 4, 8][S.shown];
    $('s-del').textContent = t.del + '/' + lv.scrolls;
    var lostEl = $('s-lost'); lostEl.textContent = lv.sandbox ? String(t.lost) : Math.min(t.lost, lv.loft) + '/' + lv.loft;
    lostEl.className = (!lv.sandbox && t.lost >= lv.loft * 0.6) ? 'danger' : '';
    $('doc-name').textContent = '(' + C.LEVELS[lv.id].doc + ')';
    $('rival-loft').setAttribute('visibility', lv.rival ? 'visible' : 'hidden');
    renderScrolls(); renderReport(); renderChart(); renderControls(); renderRoll(); renderSpark();
    $('controls').hidden = S.finished || S.phase === 'brief';
    $('event').innerHTML = eventLine();
  }
  var reactIdx = {}, usedLines = {}, evCache = {};
  function weatherLine(lv, done) {
    var W = C.WEATHER[lv.id], sched = S.run.capSched;
    if (!W) return null;
    var k = 0, i;
    for (i = 0; i < sched.length; i++) if (sched[i][0] <= done) k = i;
    if (lv.rival && lv.rival.from === done && W.rivalIn) return W.rivalIn;
    if (lv.rival && lv.rival.to + 1 === done && W.rivalOut) return W.rivalOut;
    if (k > 0 && sched[k][0] === done && W.shifts[k - 1]) return W.shifts[k - 1];
    var dip = k > 0 && sched[k][1] < sched[k - 1][1], pool = dip ? W.dip : W.clear;
    return pool[(done * 3 + lv.id + k) % pool.length];
  }
  // The bulletin is filed AFTER the flight it describes, and describes the sky that was actually flown.
  function eventLine() {
    var lv = S.level, h = seen();
    if (S.finished) return '<b>NOTAM</b>The Ministry is closed for the day.';
    if (S.phase === 'brief' || !h.length) return '<b>NOTAM</b>Awaiting your instructions, and a pigeon. Weather bulletins are filed after each flight, never before.';
    var done = h.length, tx = lv.id === 1 ? C.LEVELS[1].events[done - 1] : weatherLine(lv, done);
    var ck = S.runId + ':' + done;
    if (evCache[ck] !== undefined) tx = evCache[ck];
    else {
      if (!tx || usedLines[tx]) {                    // a line already told this session (any level) is swapped for a fresh one
        var pl = C.POOL_EVENTS, j, base = (done * 7 + lv.id) % pl.length;
        for (j = 0; j < pl.length; j++) { var cand = pl[(base + j) % pl.length]; if (!usedLines[cand]) { tx = cand; break; } }
      }
      usedLines[tx] = 1; evCache[ck] = tx;
    }
    var out = '<b>NOTAM, FILED LATE, ROUND ' + String(done).padStart(2, '0') + '</b>' + esc(tx);
    var r = h[h.length - 1], prev = h.length > 1 ? h[h.length - 2] : null, kind;
    if (r.lost === 0) kind = prev && r.w > prev.w ? 'grow' : prev && r.w === prev.w ? 'same' : 'clean';
    else if (r.lost / r.w >= 0.4) kind = 'heavy'; else kind = prev && r.w < prev.w ? 'shrink' : 'some';
    var pool = C.REACT[kind] || C.REACT.some, i = reactIdx[kind] || 0;
    if (S._reactRound !== done + ':' + S.runId) { reactIdx[kind] = i + 1; S._reactRound = done + ':' + S.runId; S._reactPick = pool[i % pool.length]; }
    return out + '<br><span class="react">' + esc(S._reactPick) + '</span>';
  }

  function renderScrolls() {
    var n = S.level.scrolls, h = seen(), acked = {}, lastLost = {};
    h.forEach(function (r) { r.newlyAcked.forEach(function (s) { acked[s] = 1; }); });
    if (h.length) h[h.length - 1].birds.forEach(function (b) { if (b.owner === 'you' && b.fate !== 'ok') lastLost[b.scroll] = 1; });
    var html = '', ok = 0, re = 0;
    for (var i = 1; i <= n; i++) { var cls = acked[i] ? 'ok' : (lastLost[i] ? 're' : ''); if (acked[i]) ok++; if (lastLost[i] && !acked[i]) re++; html += '<i class="sc ' + cls + '"></i>'; }
    var g = $('scroll-grid'); g.innerHTML = html;
    g.setAttribute('aria-label', ok + ' of ' + n + ' scrolls acknowledged, ' + re + ' awaiting a second attempt.');
  }

  function renderReport() {
    var box = $('report'), h = seen();
    if (!h.length) { box.innerHTML = '<p class="muted">No flights yet. The sky is still undecided.</p><p class="coach">' + esc(C.HINTS.start) + '</p>'; return; }
    var r = h[h.length - 1], html = '';
    var head = 'Round ' + r.round + ': you released ' + r.w + ' ' + plural(r.w, 'bird') + '. ';
    head += r.lost === 0 ? 'All ' + r.w + ' arrived.' : r.delivered + ' arrived, ' + r.lost + ' ' + plural(r.lost, 'was', 'were') + ' lost.';
    html += '<p class="rep-head ' + (r.lost ? 'rep-bad' : 'rep-good') + '">' + esc(head) + '</p>';
    if (r.requested > r.w) html += '<p class="muted">You asked for ' + r.requested + ' birds. Only ' + r.w + ' ' + plural(r.w, 'scroll was', 'scrolls were') + ' left to send. The rest stayed home with tea.</p>';
    if (r.retx) html += '<p>' + r.retx + ' of those ' + plural(r.retx, 'was a', 'were') + ' <span class="ribbon">second attempt</span> ' + (r.retx > 1 ? 'scrolls' : 'scroll') + ', retransmitted first.</p>';
    if (r.delivered) html += '<p class="ack">' + esc(C.ACKS[(r.round * 3 + r.delivered) % C.ACKS.length]) + ' (' + r.delivered + ' ACK ' + plural(r.delivered, 'pigeon') + ' home.)</p>';
    if (r.lost) html += '<p class="muted">' + r.lost + ' ' + plural(r.lost, 'scroll') + ' will be flown again next round. Obituaries below. They are not informative.</p>';
    html += '<p class="coach">' + esc(coachLine(h)) + '</p>';
    box.innerHTML = html;
  }
  // Coaching reads only the player's own trace: what they sent and what came back.
  function coachLine(h) {
    var r = h[h.length - 1], i, maxClean = 0, prevLossAtOrBelow = false;
    for (i = 0; i < h.length - 1; i++) { if (h[i].lost === 0) maxClean = Math.max(maxClean, h[i].w); if (h[i].lost > 0 && h[i].w >= r.w) prevLossAtOrBelow = true; }
    if (h.length === 1) return r.lost ? 'First flight, first losses. The Ministry notes you started big. Brave, or hasty.' : 'Everyone arrived. Nobody has told you what the limit is. The Ministry suggests asking the sky.';
    if (r.lost === 0) {
      var streak = 0, peak = 0, j;
      for (j = h.length - 1; j >= 0 && h[j].lost === 0; j--) streak++;
      for (j = 0; j < h.length; j++) peak = Math.max(peak, h[j].w);
      if (streak >= 3 && r.w <= 0.75 * peak && r.requested === r.w) return 'Everyone is home. The sky is bigger than your nerve.';
      return h.length < 4 ? C.HINTS.afterClean : C.CLEAN_STREAK[Math.min(streak - 1, C.CLEAN_STREAK.length - 1)];
    }
    if (r.w <= 3) return C.HINTS.tinyLoss;
    if (r.lost / r.w > 0.25) return C.HINTS.bigLoss;
    if (r.w <= maxClean && S.level.p > 0 && r.lost / r.w <= 0.25) return C.HINTS.hawkish[h.length % C.HINTS.hawkish.length];
    if (r.w <= maxClean) return C.HINTS.repeatLoss;
    return C.HINTS.afterLoss;
  }

  function renderControls() {
    if (!S.level || !S.run) { var fb = $('btn-fast'); fb.setAttribute('aria-pressed', prog.fast ? 'true' : 'false'); fb.textContent = 'Fast flights: ' + (prog.fast ? 'on' : 'off'); return; }
    var pend = Math.max(1, pendingCount()), max = Math.min(E.MAX_W, pend), r = $('w-range');
    S.w = Math.max(1, Math.min(S.w, max));
    r.max = String(max); r.value = String(S.w);
    $('w-out').textContent = String(S.w);
    $('w-lab').textContent = plural(S.w, 'bird') + ' this round';
    var blocked = S.busy || S.auto || S.finished || S.phase !== 'play';
    $('btn-go').disabled = blocked; r.disabled = blocked; $('w-minus').disabled = blocked || S.w <= 1; $('w-plus').disabled = blocked || S.w >= max;
    $('btn-go').textContent = S.busy ? 'Birds in flight…' : S.auto ? 'The Reno is flying' : 'Release the flock';
    $('controls').classList.toggle('busy', S.busy || S.auto);
    var note = '';
    if (S.w >= max && pend < E.MAX_W) note = 'Only ' + pend + ' ' + plural(pend, 'scroll') + ' left to send.';
    else if (S.w >= E.MAX_W) note = 'The loft has only 24 perches. This is the maximum flock.';
    $('w-note').textContent = note;
    var reno = $('btn-reno'), unlocked = renoUnlocked();
    reno.hidden = !unlocked; reno.disabled = S.finished || S.phase !== 'play' || (S.busy && !S.auto);
    reno.setAttribute('aria-pressed', S.auto ? 'true' : 'false');
    reno.textContent = S.auto ? 'Fire the Reno' : 'Hire a Reno';
    $('keys').innerHTML = 'Keys: <kbd>+</kbd> <kbd>&minus;</kbd> change the flock, <kbd>R</kbd> releases it' + (unlocked ? ', <kbd>H</kbd> hires the Reno.' : '.');
    var f = $('btn-fast'); f.setAttribute('aria-pressed', prog.fast ? 'true' : 'false'); f.textContent = 'Fast flights: ' + (prog.fast ? 'on' : 'off');
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
    var n = C.NAMES.length, rom = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII'], gen = Math.floor(serial / n);
    return { name: C.NAMES[serial % n] + (rom[gen] !== undefined ? rom[gen] : ' the ' + (gen + 1) + 'th'), trait: C.TRAITS[(serial * 7 + 3) % C.TRAITS.length] };
  }
  function addObits(rec) {
    var sn = C.LEVELS[S.level.id].snippets;
    rec.birds.forEach(function (b) {
      if (b.owner !== 'you' || b.fate === 'ok') return;
      var id = birdIdent(b.serial);
      S.roll.push({ name: id.name, trait: id.trait, round: rec.round, line: C.OBITS[(b.serial * 5 + rec.round) % C.OBITS.length], cargo: 'Scroll ' + b.scroll + ': ' + sn[b.scroll % sn.length] });
    });
  }

  /* ---------- sparkline (status area) ---------- */
  function renderSpark() {
    var h = seen(), svg = $('spark');
    if (h.length < 4) { svg.classList.remove('on'); svg.innerHTML = ''; return; }
    svg.classList.add('on');
    var mx = 6; h.forEach(function (r) { mx = Math.max(mx, r.w); });
    var X = function (i) { return 4 + i / Math.max(1, h.length - 1) * 112; }, Y = function (v) { return 32 - v / mx * 28; };
    var d1 = '', d2 = '';
    h.forEach(function (r, i) { d1 += (i ? 'L' : 'M') + X(i) + ' ' + Y(r.w) + ' '; d2 += (i ? 'L' : 'M') + X(i) + ' ' + Y(r.delivered) + ' '; });
    svg.innerHTML = '<path d="' + d1 + '" fill="none" stroke="#f3e7cf" stroke-width="2"/><path d="' + d2 + '" fill="none" stroke="#8fd19e" stroke-width="2" stroke-dasharray="3 2"/>';
    svg.setAttribute('aria-label', 'Sparkline: ' + h.map(function (r) { return r.w + ' sent, ' + r.delivered + ' arrived'; }).join('; '));
  }

  /* ---------- chart ---------- */
  function renderChart() {
    var wrap = $('chart-wrap'), h = seen(), lv = S.level, over = S.finished;
    $('tiles').innerHTML = tiles(h); $('logtbl').innerHTML = logTable(h);
    if (h.length < 2 && !over) { wrap.innerHTML = '<div class="chart-empty">The chart appears after your second flight. It is the only honest thing in this document.</div>'; return; }
    var D = Math.max(lv.deadline, h.length), maxY = 8;
    h.forEach(function (r) { maxY = Math.max(maxY, r.w, over ? r.cap : 0); });
    maxY = Math.ceil((maxY + 1) / 4) * 4;
    var W = 360, H = 210, ml = 30, mr = 10, mt = 26, mb = 30, pw = W - ml - mr, ph = H - mt - mb;
    var X = function (r) { return ml + (D === 1 ? 0 : (r - 1) / (D - 1)) * pw; }, Y = function (v) { return mt + ph - v / maxY * ph; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(chartLabel(h, over)) + '" font-family="Georgia, serif">';
    s += '<rect x="' + ml + '" y="' + mt + '" width="' + pw + '" height="' + ph + '" fill="#fbf4e3" stroke="#2b2118" stroke-width="1.2"/>';
    for (var v = 0; v <= maxY; v += 4) s += '<line x1="' + ml + '" x2="' + (ml + pw) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#cdb88f" stroke-width=".7"/><text x="' + (ml - 4) + '" y="' + (Y(v) + 3.5) + '" font-size="10" text-anchor="end" fill="#5a4a3a">' + v + '</text>';
    var step = D > 16 ? 3 : 2;
    for (var r = 1; r <= D; r++) if (r === 1 || r % step === 0) s += '<text x="' + X(r) + '" y="' + (H - mb + 13) + '" font-size="10" text-anchor="middle" fill="#5a4a3a">' + r + '</text>';
    s += '<text x="' + (ml + pw / 2) + '" y="' + (H - 4) + '" font-size="10" text-anchor="middle" fill="#5a4a3a">round (one flight each)</text>';
    if (over && h.length) {
      var cp = '';
      h.forEach(function (r, i) { var x1 = i === 0 ? X(r.round) - 4 : (X(h[i - 1].round) + X(r.round)) / 2, x2 = i === h.length - 1 ? X(r.round) + 4 : (X(r.round) + X(h[i + 1].round)) / 2; cp += (i === 0 ? 'M' : 'L') + x1 + ' ' + Y(r.cap) + ' L' + x2 + ' ' + Y(r.cap) + ' '; });
      s += '<path d="' + cp + '" fill="none" stroke="#b3202a" stroke-width="2.4" stroke-dasharray="6 4" opacity=".85"/>';
    }
    var line = function (key, col, dash) { var d = ''; h.forEach(function (r, i) { d += (i ? 'L' : 'M') + X(r.round) + ' ' + Y(r[key]) + ' '; }); return '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.4" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>'; };
    s += line('w', '#2b2118'); s += line('delivered', '#2f6b3a', '6 3');
    h.forEach(function (r) {
      s += '<circle cx="' + X(r.round) + '" cy="' + Y(r.w) + '" r="' + (r.lost ? 4.4 : 3) + '" fill="' + (r.lost ? '#b3202a' : '#2b2118') + '" stroke="#fbf4e3" stroke-width="1"/>';
      s += '<circle cx="' + X(r.round) + '" cy="' + Y(r.delivered) + '" r="5.4" fill="none" stroke="#2f6b3a" stroke-width="1.8"/>';
    });
    var lx = ml;
    s += '<line x1="' + lx + '" x2="' + (lx + 16) + '" y1="11" y2="11" stroke="#2b2118" stroke-width="2.4"/><text x="' + (lx + 20) + '" y="14.5" font-size="10" fill="#2b2118">flown</text>';
    s += '<line x1="' + (lx + 62) + '" x2="' + (lx + 78) + '" y1="11" y2="11" stroke="#2f6b3a" stroke-width="2.4" stroke-dasharray="5 3"/><text x="' + (lx + 82) + '" y="14.5" font-size="10" fill="#2b2118">arrived</text>';
    s += '<circle cx="' + (lx + 140) + '" cy="11" r="4" fill="#b3202a"/><text x="' + (lx + 148) + '" y="14.5" font-size="10" fill="#2b2118">losses</text>';
    if (over) s += '<line x1="' + (lx + 194) + '" x2="' + (lx + 210) + '" y1="11" y2="11" stroke="#b3202a" stroke-width="2.4" stroke-dasharray="4 3"/><text x="' + (lx + 214) + '" y="14.5" font-size="10" fill="#2b2118">the Gap (hindsight)</text>';
    wrap.innerHTML = s + '</svg>';
  }
  function chartLabel(h, over) {
    return 'Chart of birds flown and scrolls delivered per round. ' + h.map(function (r) { return 'Round ' + r.round + ': flown ' + r.w + ', arrived ' + r.delivered + (over ? ', Gap ' + r.cap : ''); }).join('. ') + '.';
  }
  function tiles(h) {
    var t = totals(), eff = t.flown ? Math.round(t.del / t.flown * 100) : 0, last = h.length ? h[h.length - 1] : null;
    var tile = function (b, l) { return '<div class="tile"><b>' + b + '</b><span>' + l + '</span></div>'; };
    return tile(t.flown, 'birds flown') + tile(t.del, 'scrolls delivered') + tile(t.flown ? eff + '%' : '-', 'delivered per bird' + (last ? ' (last round: ' + last.delivered + ' of ' + last.w + ')' : ''));
  }
  function logTable(h) {
    if (!h.length) return '<p class="muted">Nothing to report. Fly something.</p>';
    var rows = h.map(function (r) { return '<tr><td>' + r.round + '</td><td>' + r.w + '</td><td>' + r.delivered + '</td><td>' + r.lost + '</td>' + (S.finished ? '<td>' + r.cap + '</td>' : '') + '</tr>'; }).join('');
    return '<div class="tbl-scroll"><table><thead><tr><th>Round</th><th>Flown</th><th>Arrived</th><th>Lost</th>' + (S.finished ? '<th>Gap</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------- flight animation ---------- */
  function sv(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function px(u) { return 58 + 240 * u; }
  function py(u, lane) { return 98 - 36 * Math.sin(Math.PI * u) + lane * 4; }

  function animateRound(rec, runId) {
    return new Promise(function (resolve) {
      var sky = $('sky'); sky.innerHTML = '';
      if (reduceMotion || S.skipping) { var cp0 = $('map-caption'); if (reduceMotion) { cp0.style.display = 'block'; cp0.textContent = 'Round ' + rec.round + ': ' + rec.w + ' released, ' + rec.delivered + ' arrived.'; } resolve(); return; }
      var n = rec.birds.length, sp = (prog.fast ? 0.2 : S.level.id > 1 ? 0.7 : 1) * (rec.round > 3 ? 0.75 : 1) * (S.auto ? 0.8 : 1);
      var OUT = Math.min(2300, 1000 + 50 * n) * sp, BACK = 750 * sp, STAG = (250 + 14 * n) * sp;
      var birds = [], puffs = [], pops = [], i;
      var rr = E.mulberry32(rec.round * 977 + S.run.seed);
      for (i = 0; i < n; i++) {
        var b = rec.birds[i], isYou = b.owner === 'you';
        var u = sv('use', { width: isYou ? 28 : 23, height: isYou ? 20 : 16 });
        u.style.color = isYou ? '#8b97ad' : '#b59469'; u.setAttribute('href', '#pgA');
        sky.appendChild(u);
        // every loss looks the same from the ground: a poof of feathers somewhere between Colinton and Glasgow
        var dieU = b.fate === 'ok' ? null : 0.35 + rr() * 0.5;
        birds.push({ el: u, b: b, lane: isYou ? (i % 7) - 3 : ((i % 5) - 2) * 0.8 + 3, delay: (i / Math.max(1, n)) * STAG, dieU: dieU, dead: false, ack: null, size: isYou ? 28 : 23, ph: rr() * 6 });
      }
      var heavy = rec.lost >= Math.max(4, rec.w * 0.4);
      var total = STAG + OUT + BACK + 250 * Math.min(1, sp * 1.5), start = performance.now(), done = false, captioned = false;
      coo('release');
      function puff(x, y, now) {
        for (var k = 0; k < 8; k++) {
          var f = sv('ellipse', { rx: 3.4, ry: 1.4, fill: k % 2 ? '#fbf4e3' : '#aeb7c6', stroke: '#2b2118', 'stroke-width': .6 });
          sky.appendChild(f); puffs.push({ el: f, x: x, y: y, vx: (rr() - .5) * 70, vy: -25 - rr() * 35, rot: rr() * 360, vr: (rr() - .5) * 700, t0: now });
        }
        var t = sv('text', { 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 'bold', fill: '#b3202a', 'font-family': 'Georgia, serif', stroke: '#fbf4e3', 'stroke-width': 3, 'paint-order': 'stroke' }); t.textContent = ['?!', '!?', '*#!', 'ack?'][Math.floor(rr() * 4)];
        sky.appendChild(t); pops.push({ el: t, x: x, y: y - 8, t0: now });
        coo('lost');
      }
      function finish() { done = true; sky.innerHTML = ''; $('map-caption').style.display = 'none'; if (heavy && S.runId === runId) { var mw = $('mapwrap'); mw.classList.remove('shake'); void mw.offsetWidth; mw.classList.add('shake'); } resolve(); }
      function frame(now) {
        if (done) return;
        if (S.runId !== runId) { done = true; sky.innerHTML = ''; resolve(); return; }
        var t = now - start, flap = Math.floor(t / 100) % 2 ? '#pgB' : '#pgA';
        birds.forEach(function (o) {
          var lt = t - o.delay, u = Math.max(0, Math.min(1, lt / OUT));
          if (o.dead) return;
          if (lt < 0) { o.el.setAttribute('x', 12); o.el.setAttribute('y', 118 + o.lane * 2.5); o.el.setAttribute('href', '#pgA'); return; }
          if (o.dieU !== null && u >= o.dieU) { o.dead = true; o.el.setAttribute('visibility', 'hidden'); puff(px(o.dieU), py(o.dieU, o.lane), now); return; }
          var x2 = px(u), y2 = py(u, o.lane), wob = Math.sin(t / 85 + o.ph) * 9;
          o.el.setAttribute('x', x2 - o.size / 2); o.el.setAttribute('y', y2 - 10); o.el.setAttribute('href', flap);
          o.el.setAttribute('transform', 'rotate(' + wob + ' ' + x2 + ' ' + y2 + ')');
          if (o.b.fate === 'ok' && o.b.owner === 'you' && u >= 1 && !o.ack) {
            var a = sv('use', { width: 16, height: 11 }); a.setAttribute('href', '#pgA'); a.style.color = '#a9b4c8'; sky.appendChild(a);
            var sc = sv('rect', { width: 5, height: 3, rx: 1, fill: '#fbf4e3', stroke: '#b3202a', 'stroke-width': .8 }); sky.appendChild(sc);
            o.ack = { el: a, sc: sc, t0: now }; o.el.setAttribute('visibility', 'hidden'); coo('ack');
          }
        });
        birds.forEach(function (o) {
          if (!o.ack) return;
          var au = Math.max(0, Math.min(1, (now - o.ack.t0) / BACK)), ax = 304 - au * 246, ay = 112 - 16 * Math.sin(Math.PI * au) + o.lane * 2;
          o.ack.el.setAttribute('x', ax - 8); o.ack.el.setAttribute('y', ay - 5); o.ack.el.setAttribute('href', Math.floor(now / 100) % 2 ? '#pgB' : '#pgA');
          o.ack.sc.setAttribute('x', ax - 3); o.ack.sc.setAttribute('y', ay + 4);
          if (au >= 1) { o.ack.el.setAttribute('visibility', 'hidden'); o.ack.sc.setAttribute('visibility', 'hidden'); }
        });
        puffs.forEach(function (p) { var pt = (now - p.t0) / 1000; if (pt > 1) { p.el.setAttribute('opacity', 0); return; } p.el.setAttribute('transform', 'translate(' + (p.x + p.vx * pt) + ' ' + (p.y + p.vy * pt + 60 * pt * pt) + ') rotate(' + (p.rot + p.vr * pt) + ')'); p.el.setAttribute('opacity', 1 - pt); });
        pops.forEach(function (p) { var pt = (now - p.t0) / 900; if (pt > 1) { p.el.setAttribute('opacity', 0); return; } p.el.setAttribute('x', p.x); p.el.setAttribute('y', p.y - pt * 14); p.el.setAttribute('opacity', 1 - pt * pt); });
        if (!captioned && rec.delivered && t > STAG + OUT) { captioned = true; var cp = $('map-caption'); cp.style.display = 'block'; cp.textContent = C.ACKS[(rec.round * 3 + rec.delivered) % C.ACKS.length]; }
        if (S.skipping || t >= total) { finish(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  /* ---------- playing a round ---------- */
  function release() {
    if (S.busy) { S.skipping = true; return; }
    if (S.finished || S.phase !== 'play') return;
    var id = S.runId;
    S.busy = true; S.skipping = false;
    var rec = E.playRound(S.run, S.w);
    $('btn-skip').hidden = reduceMotion; renderControls(); showStatus();
    var r = $('report'), p = r.querySelector('.fly'); if (!p) { p = el('p', 'fly vh'); r.insertBefore(p, r.firstChild); } p.textContent = 'Flock released: ' + rec.w + ' ' + plural(rec.w, 'bird') + '.';
    animateRound(rec, id).then(function () {
      if (S.runId !== id) return;                       // abandoned mid-flight: nothing is awarded, nothing is failed
      S.busy = false; S.shown = S.run.round; $('btn-skip').hidden = true;
      addObits(rec); renderAll();
      if (S.run.done) { endRun(); return; }
      if (S.auto) { S.timer = setTimeout(autoStep, reduceMotion ? 300 : 400); } else focusGo();
    });
  }

  function hireReno() {
    if (S.finished || S.phase !== 'play') return;
    if (S.auto) { S.auto = false; clearTimeout(S.timer); renderControls(); toast('The Reno has been dismissed. He is relieved, mostly.'); return; }
    S.assisted = true; S.auto = true; S.hiredAt = S.shown + 1;
    var h = S.run.history.slice(0, S.shown), r = E.createReno(S.w);
    if (h.length) {
      r.w = h[h.length - 1].w;
      var lastLoss = null; h.forEach(function (x) { if (x.lost > 0) lastLoss = x; });
      if (lastLoss) r.ssthresh = Math.max(2, Math.floor(lastLoss.w / 2));
      r._fresh = false;
    } else r._fresh = true;
    S.reno = r;
    toast('Reno hired. Stars do not count while he flies.');
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

  /* ---------- debrief: reads what the player actually did ---------- */
  function analyze(run) {
    var h = run.history, n = h.length, i;
    var f = { rounds: n, doubled: 0, steady: false, backoffs: 0, ignoredBig: 0, panic: 0, nerve: 0, probes: 0, smallLoss: 0 };
    var lost = 0, crowd = 0, hawk = 0, sumW = 0, sumRoom = 0, cnt = 0, streak = 0;
    for (i = 0; i < n; i++) {
      var r = h[i], nx = h[i + 1], frac = r.lost / r.w;
      lost += r.lost; crowd += r.lostCrowd; hawk += r.lostHawk;
      if (i >= 2) { sumW += r.w; sumRoom += Math.max(1, r.cap - r.rivalW); cnt++; }
      if (r.lost > 0 && r.w <= 6) f.smallLoss++;
      // every comparison is on what the player ASKED for, so a short final round (few scrolls left) is never a "cut"
      if (i < 4 && nx) { if (r.lost <= 1 && nx.requested >= 1.8 * r.requested) { streak++; f.doubled = Math.max(f.doubled, streak); } else streak = 0; }
      if (nx) {
        if (r.lost >= 2 && frac > 0.3) { if (nx.requested >= r.requested) f.ignoredBig++; }
        else if (r.lost >= 1 && frac <= 0.3) { if (nx.requested <= r.requested * 0.6) f.panic++; else f.nerve++; }
        if (i >= 2 && h[i - 1].lost === 0 && h[i - 2].lost === 0 && r.lost === 0 && nx.requested > r.requested) f.probes++;
      }
    }
    var up = 0, early = Math.min(4, n - 1);
    for (i = 0; i < early; i++) if (h[i + 1].requested > h[i].requested && h[i + 1].requested < 1.8 * h[i].requested) up++;
    f.steady = f.doubled < 2 && early >= 3 && up >= early - 1;
    var body = h.map(function (r) { return r.requested; });
    if (n > 1 && h[n - 1].requested > h[n - 1].w) body.pop();      // a short final round says nothing about the rule
    var tail = body.slice(2); if (!tail.length) tail = body;
    var mx = Math.max.apply(null, tail), mn = Math.min.apply(null, tail);
    var sorted = body.slice().sort(function (a, b) { return a - b; }), med = sorted[sorted.length >> 1];
    f.median = med; f.flat = body.length >= 5 && (mx - mn) <= Math.max(2, 0.25 * med);
    f.lost = lost; f.hawkLost = hawk; f.crowdShare = lost ? crowd / lost : 0; f.hawkShare = lost ? hawk / lost : 0;
    f.fill = cnt ? sumW / sumRoom : 1;
    f.peak = Math.max.apply(null, body.concat([1]));
    var rst = E.responseStats(run);
    f.backoffs = rst.responded; f.weakCuts = rst.weak; f.events = rst.events;      // ONE definition of 'responded', shared with the stars
    f.responsive = E.adaptedOf(run, 1);
    return f;
  }

  function thirdStarNote(run, lv) {
    var st = lv.stars; if (!st) return null;
    var miss = [], t = st.three;
    if (run.round > t.rounds) miss.push('finish in ' + t.rounds + ' rounds or fewer (you took ' + run.round + ')');
    if (run.lost > t.lost) miss.push('lose ' + t.lost + ' birds or fewer (you lost ' + run.lost + ')');
    if (!E.adaptedOf(run, t.minEvents)) { var rs3 = E.responseStats(run); miss.push(rs3.events && rs3.weak ? 'cut the flock properly after a bad round (your cuts were under 30%, too small to count)' : rs3.events ? 'cut the flock after a bad round (you never did)' : 'meet a bad round and cut the flock in answer (none happened this time, so there was nothing to answer)'); }
    var sh = lv.rival ? E.shareOf(run) : null;
    if (t.share !== undefined && sh !== null && sh > t.share) miss.push('take no more than ' + pct(t.share) + ' of the shared Gap (you took ' + pct(sh) + ')');
    if (t.minShare !== undefined && sh !== null && sh < t.minShare) miss.push('carry at least ' + pct(t.minShare) + ' of the shared Gap (you carried ' + pct(sh) + ')');
    return miss.length ? 'For the third star you would also have needed to ' + miss.join('; and to ') + '.' : null;
  }

  function assistedDebrief(run, lv, f, share) {
    var out = { title: 'The Reno flew this.', mine: [], concept: [], fact: C.FACTS[lv.id] }, win = run.won;
    out.mine.push((S.hiredAt > 1 ? 'You handed over the flock at round ' + S.hiredAt + '. ' : 'You hired the Reno before the first flight. ') + 'He doubles until the first loss, halves on any loss, and otherwise adds one bird a round. He did not need your help and did not ask for it.');
    if (lv.p > 0) out.concept.push((win ? 'He got through, but this' : 'This') + ' sky has hawks, and the Reno treats every missing bird as a crowded Gap, so he halves the flock for nothing. ' + (f.hawkLost ? 'Hawks took ' + f.hawkLost + ' of the birds he lost. ' : '') + 'A sender that held its nerve on isolated losses would have been much quicker.');
    else if (win) out.concept.push('He won because the Gap left enough slack for slow growth. One extra bird a round is cautious: it keeps losses low, and it recovers slowly when the Gap widens.');
    else out.concept.push('He is cautious by design. One extra bird per round recovers slowly after a storm and cannot make up time once the deadline is close, and halving at every loss is expensive when the Gap keeps changing.');
    if (lv.rival && share !== null) out.concept.push('While the rival flew he carried ' + pct(share) + ' of the traffic.');
    return out;
  }

  function buildDebrief(run, lv, f, share) {
    if (S.assisted) return assistedDebrief(run, lv, f, share);
    var out = { title: '', mine: [], concept: [], fact: C.FACTS[lv.id] };
    var win = run.won, id = lv.id, med = f.median, moves = lv.cap.length > 1, gap0 = run.capSched[0][1];
    var minShare = lv.stars && lv.stars.three && lv.stars.three.minShare;
    // what the player did
    var guessed = f.flat && lv.cap.length === 1 && Math.abs(med - gap0) <= 2;
    if (f.flat) {
      out.mine.push('You held a steady flock of about ' + med + ' birds for most of the flight.' + (win
        ? (!moves ? ' This sky’s Gap was ' + gap0 + (guessed ? ', so you guessed it, which is a fine way to win and a poor way to learn. Slow start would have found it by doubling; AIMD would then have crept upwards and backed off at the first real losses.' : ', so a flock of ' + med + ' held steady either wasted room or lost a few birds.')
          : ' That worked, but a steady flock cannot follow a Gap that moves, and cannot tell you when it has.')
        : (moves ? ' A steady flock cannot follow a Gap that changes, and cannot notice that it has.' : ' The Gap did not move; the size you chose just was not the right one.')));
    } else {
      if (f.doubled >= 2) out.mine.push('You roughly doubled the flock each flight while every bird arrived. That is slow start: exponential growth until the first losses say stop.');
      else if (f.steady) out.mine.push('You grew the flock steadily, a few birds a round, rather than doubling. That is additive increase on its own: safe, but it takes a long time to find a Gap you have not measured.');
      else if (f.doubled === 0 && f.rounds > 4) out.mine.push('Your early flocks did not double or climb in any pattern, so the first rounds went on underusing a Gap you had not yet measured.');
      if (f.backoffs) out.mine.push('After heavy losses you cut the flock ' + f.backoffs + ' ' + plural(f.backoffs, 'time') + '. That is multiplicative decrease: when the Gap says no, back off hard and quickly.');
      if (f.weakCuts && !f.responsive) out.mine.push('After heavy losses you trimmed the flock ' + f.weakCuts + ' ' + plural(f.weakCuts, 'time') + ', but your cuts were under 30%, too small to count as backing off. Multiplicative decrease means a real cut, roughly halving.');
      if (f.ignoredBig) out.mine.push('On ' + f.ignoredBig + ' ' + plural(f.ignoredBig, 'round') + ' you flew on, or bigger, after heavy losses. In this game’s Gap that makes things worse: the scrum takes out more than the birds that did not fit.');
      if (f.probes) out.mine.push('After calm rounds you edged the flock upwards (' + f.probes + ' ' + plural(f.probes, 'time') + '). That is probing: testing whether the Gap has widened.');
      if (f.panic) out.mine.push('On ' + f.panic + ' ' + plural(f.panic, 'round') + ', one or two missing birds made you cut the flock sharply. An isolated loss is not a verdict from the Gap; the Reno does this too, and it is why he is slow.');
      else if (f.nerve >= 2) out.mine.push('A bird or two went missing on ' + f.nerve + ' rounds and you kept your nerve instead of halving the flock. Losses that do not grow with the flock are not about the flock.');
      if (!out.mine.length) out.mine.push('Your flock sizes wandered without a clear rule. That is allowed. Next time try choosing a rule in advance: grow while everyone returns, back off when many do not.');
    }
    var rivalNote = function () {
      var dug = run.history.filter(function (r) { return r.rivalDugIn; }).length, bits = [];
      bits.push('This rival is a Reno with a stubborn streak: it backs off when it loses birds, but digs in if you squeeze it twice running. So the lesson here is not "be nice"; it is do not squeeze, and do not get squeezed. The real-world cousin is Chiu and Jain’s result that additive increase with multiplicative decrease converges towards fair shares.');
      if (share !== null) {
        if (share < 0.3) bits.push('While the rival was flying you carried only ' + pct(share) + ' of the traffic. That was not courtesy: the rival simply took the room' + (f.responsive ? '.' : ', and your flock never really responded to it.') + (minShare ? ' The third star needs at least ' + pct(minShare) + '.' : ''));
        else if (share <= 0.45) bits.push('While the rival was flying you carried ' + pct(share) + ' of the traffic: giving way more than you had to. Roughly half is what well-behaved senders drift towards.');
        else if (share <= 0.6) bits.push('While the rival was flying you carried ' + pct(share) + ' of the traffic: close to an even split, which is what well-behaved senders drift towards.');
        else bits.push('While the rival was flying you carried ' + pct(share) + ' of the traffic, more than a fair half. A sender that pushes on regardless of loss takes bandwidth from polite flows, which is why “TCP-friendliness” is a phrase people put in standards documents.');
      }
      if (dug) bits.push('The rival dug in ' + dug + ' ' + plural(dug, 'time') + ' after being squeezed twice running, and the Gap jammed for both of you.');
      return bits;
    };
    // outcome, keyed on cause
    if (!win) {
      if (run.endReason === 'loft') {
        if (f.crowdShare >= 0.6) { out.title = 'Congestion collapse.'; out.concept.push('Most of the birds you lost were lost to crowding. In this game’s Gap, once more birds are offered than it can pass, the scrum takes out more than the ones that did not fit, and every lost scroll must be flown again. Offering more delivers less. That is congestion collapse, and you caused it with enthusiasm.', 'This game exaggerates the mechanism. The real 1986 collapse came mostly from senders retransmitting data that was already queued or in flight, not from birds knocking each other out of the sky. The cure is the same: treat loss as a signal, and send fewer, not more.'); out.fact = C.FACTS[1]; }
        else { out.title = 'The hawks, mostly.'; out.concept.push('This was not mainly a collapse: more of the birds you lost went to hawks than to crowding. Bigger flocks into hawk country simply feed the hawks more birds, and loss that does not rise with load is not the Gap speaking.', 'Keep the flock near what actually arrives, and do not mistake a hungry sky for a crowded one.'); out.fact = C.FACTS[2]; }
        if (lv.rival && share !== null && share > 0.6) rivalNote().forEach(function (x) { out.concept.push(x); });
      } else if (lv.p > 0 && f.hawkShare >= 0.4 && f.fill < 0.85 && (f.panic >= 1 || f.backoffs >= 2)) {
        out.title = 'Hawk loss, mistaken for congestion.';
        out.concept.push('You cut the flock after losses that were largely hawks, not crowding. Each cut left the Gap emptier and the deadline nearer. Hawks take about the same share of a big flock as a small one, so shrinking the flock does not save birds, it only delivers fewer.', 'The Reno does exactly this, which is why he rarely finishes on a sky like this.');
        out.fact = C.FACTS[2];
      } else if (f.fill < 0.65) {
        out.title = 'Too timid.'; out.concept.push('You flew, on average, under two thirds of the room the Gap had left, so the deadline arrived with scrolls still in the loft. Not delivering is as much a failure as crowding. Slow start exists so a sender can find the ceiling quickly, and probing exists so it can keep finding it.'); out.fact = 'A sender that never grows its window wastes the link. That is why TCP keeps increasing until it is told to stop.';
        if (lv.rival && share !== null && share < 0.45) rivalNote().forEach(function (x) { out.concept.push(x); });
      } else {
        out.title = 'So close, and too slow.'; out.concept.push('You used most of the room, but the rounds ran out. Time went on backing off, hunting for the limit again, or flying scrolls a second time. Every loss costs a round trip to repair, so the aim is to find the limit once, early, and stay just under it.');
        if (lv.rival && share !== null && share > 0.6) rivalNote().forEach(function (x) { out.concept.push(x); });
      }
      return out;
    }
    // wins, per level, conditional on what actually happened
    if (id === 1) {
      out.title = guessed ? 'You guessed the Gap.' : f.flat ? 'You held steady.' : f.lost === 0 ? 'Not a feather out of place.' : f.doubled >= 2 ? 'You have invented slow start.' : f.responsive ? 'You have found the limit.' : 'You got there.';
      if (f.doubled >= 2) out.concept.push('The Gap passes only so many birds a flight, and the first sign of that is birds not coming home. Doubling until that moment is slow start; backing off and then creeping up is additive increase, multiplicative decrease, the heart of TCP congestion control.');
      else if (f.responsive) out.concept.push('You found the Gap’s limit by feel and backed off when it said no. Doubling early, which you did not need to, is slow start; backing off hard and then creeping up is additive increase, multiplicative decrease, the heart of TCP congestion control.');
      else out.concept.push('The Gap passes only so many birds a flight, and the first sign of that is birds not coming home. The real skill is what you do next: back off hard when it happens (multiplicative decrease), then creep up again (additive increase). That is the heart of TCP congestion control.');
      if (f.lost === 0) out.concept.push('You never lost a bird, which means a very polite ramp, a lucky guess, or a flock that never reached the limit. There is no shame in that, but the sawtooth only appears once you have gone over the edge and come back.');
    } else if (id === 2) {
      out.title = 'Loss is not always congestion.';
      if (f.hawkLost >= 3) out.concept.push('Hawks took ' + f.hawkLost + ' of your birds' + (f.smallLoss ? ', some of them even when the flock was small' : '') + '. Loss that does not grow with the flock is not the Gap speaking; treating every missing bird as congestion, as the Reno does, throttles you for nothing.');
      else out.concept.push('The hawks were kind this time: only ' + f.hawkLost + ' ' + plural(f.hawkLost, 'bird') + ' went to them. They take about the same share of any flock, so loss that does not grow with the flock is not the Gap speaking, and a sender that halves at every missing bird throttles itself for nothing.');
      out.concept.push('Telling the two apart, by checking whether losses rise when the flock does, is the problem real senders face on Wi-Fi, satellite and mobile links.');
    } else if (id === 3) {
      out.title = share === null ? 'You flew alone.' : share > 0.6 ? 'You won the Gap. Politely? Less so.' : share < 0.3 ? (f.responsive ? 'You were crowded out.' : 'You were sat on.') : share <= 0.45 ? 'You gave way.' : 'You shared the Gap.';
      rivalNote().forEach(function (x) { out.concept.push(x); });
    } else if (id === 4) {
      var heavy = f.ignoredBig >= 2 || run.lost > lv.stars.three.lost;
      out.title = f.probes && f.responsive ? 'You have been probing.' : f.responsive ? 'You rode out the storms.' : 'You flew through the storms.';
      if (f.probes && f.responsive && !heavy) out.concept.push('The Gap changed size without telling you, so the only way to find out is to keep testing: add some birds, see what happens. Losses tell you when it has shrunk; a run of calm rounds is the only hint it has widened.', 'Growing by a bird a round, as the Reno does, is safe but slow at reclaiming room; probing faster when the coast is clear got more scrolls through. Newer algorithms such as BBR and CUBIC probe more boldly for exactly this reason.');
      else if (f.responsive) out.concept.push('The Gap changed size without telling you, and you responded when losses said it had shrunk. Reclaiming room afterwards is the other half: a bird a round is safe but slow, which is why newer algorithms such as BBR and CUBIC probe more boldly.');
      else out.concept.push('The Gap changed size without telling you, and your flock did not much respond to what came back. The Gap shrank and widened regardless; a flock that responds to losses, and probes after calm, rides that far better.');
    } else if (id === 5) {
      out.title = 'Everything, all at once.';
      out.concept.push('Hawk losses, a rival flock and a moving ceiling together need all of it: slow start to find the room, backing off for crowding but not for stray losses, sharing with someone else, and probing again when the weather moves.', 'No single rule does it. The sawtooth is just what balancing those jobs looks like.');
      rivalNote().forEach(function (x) { out.concept.push(x); });
    } else {
      out.title = 'Free flight.';
      out.concept.push('Nothing here is scored, so use it to ask questions. What if the hawks are at 20 per cent? If the Gap is huge? If the rival is a bully? Every setting is a real network parameter: capacity, random loss, competing traffic.');
    }
    return out;
  }

  function victoryScene(stars, lv) {
    var d = el('div', 'victory');
    var medal = stars === 3 ? '<g class="medal-bob"><path d="M50 52 L46 70 L54 66 L58 70 L54 52Z" fill="#b3202a" stroke="#2b2118"/><circle cx="52" cy="72" r="7" fill="#e0b23a" stroke="#2b2118" stroke-width="1.5"/><text x="52" y="75.5" text-anchor="middle" font-size="9" font-family="Georgia, serif" fill="#2b2118">1</text></g>' : '';
    d.innerHTML = '<svg viewBox="0 0 96 84" aria-hidden="true"><g class="scroll-un"><rect x="6" y="4" width="46" height="30" rx="3" fill="#fbf4e3" stroke="#2b2118" stroke-width="1.5"/><path d="M12 12h34M12 18h28M12 24h32" stroke="#8d7a5a" stroke-width="1.5"/><circle cx="48" cy="28" r="4" fill="#b3202a"/></g><use href="#pgA" x="30" y="40" width="62" height="45" style="color:#8b97ad"/>' + medal + '</svg>';
    var q = el('q', null, stars === 3 ? C.WINS[lv.id] : (C.WINS2[lv.id] || C.WIN_LESSER));
    var box = el('div'); box.appendChild(el('b', null, stars === 3 ? 'A pigeon has been decorated.' : 'The scrolls arrived.')); box.appendChild(q); d.appendChild(box);
    return d;
  }
  function shareBar(run) {
    var mine = 0, theirs = 0, rounds = 0; run.history.forEach(function (h) { if (h.rivalOn) { mine += h.delivered; theirs += h.rivalDelivered; rounds++; } });
    if (!rounds) return null;
    var wrap = el('div'), tot = mine + theirs || 1;
    wrap.innerHTML = '<div class="shared-lab">Who got through the Gap while the rival was flying (' + rounds + ' rounds)</div><div class="share-bar" role="img" aria-label="You ' + pct(mine / tot) + ', rival ' + pct(theirs / tot) + '"><i class="you" style="width:' + (mine / tot * 100) + '%"></i><i class="riv" style="width:' + (theirs / tot * 100) + '%"></i><span class="capm" style="left:calc(50% - 1px)" title="an even split"></span></div><div class="shared-leg"><span class="k you">You ' + pct(mine / tot) + '</span><span class="k riv">Rival ' + pct(theirs / tot) + '</span><span class="k cap">even split</span></div>';
    return wrap;
  }

  function endRun() {
    var run = S.run, lv = S.level; S.finished = true; S.auto = false; clearTimeout(S.timer);
    var stars = 0;
    var adaptedNow = false;
    if (run.won && !S.assisted && !lv.sandbox) { stars = E.starsFor(run); adaptedNow = E.adaptedOf(run, lv.stars.two.minEvents); if (stars > (prog.stars[lv.id] || 0)) prog.stars[lv.id] = stars; if (adaptedNow) prog.adapted[lv.id] = 1; save(); }
    else if (run.won && S.assisted) { prog.helped[lv.id] = 1; save(); }
    else if (!run.won && !S.assisted) { prog.fails[lv.id] = (prog.fails[lv.id] || 0) + 1; save(); }
    renderAll();
    var f = analyze(run), share = lv.rival ? (run.history.some(function (h) { return h.rivalOn; }) ? E.shareOf(run) : null) : null;
    var data = buildDebrief(run, lv, f, share);
    var d = $('debrief'); d.hidden = false; d.innerHTML = '';
    S.lastEnd = run.endReason;
    d.appendChild(el('h2', null, data.title));
    var t = totals(), verdict;
    if (run.won) verdict = 'Delivered: all ' + lv.scrolls + ' scrolls in ' + run.round + ' ' + plural(run.round, 'round') + ', losing ' + t.lost + ' ' + plural(t.lost, 'bird') + '.';
    else if (run.endReason === 'loft') verdict = 'The loft is empty. ' + Math.min(t.lost, lv.loft) + ' birds lost; ' + t.del + ' of ' + lv.scrolls + ' scrolls got through. ' + flockName() + ' has been dissolved.';
    else verdict = 'The deadline passed with ' + t.del + ' of ' + lv.scrolls + ' scrolls delivered. The council has already moved on.';
    d.appendChild(el('p', 'db-verdict', verdict));
    if (run.won && !lv.sandbox) {
      var sp = el('div', 'db-stars'); sp.innerHTML = S.assisted ? '' : starsHtml(stars); if (!S.assisted) sp.setAttribute('aria-label', stars + ' of 3 stars'); d.appendChild(sp);
      if (S.assisted) d.appendChild(el('p', 'db-reno', 'The Reno flew some or all of this. He accepts no credit and the Ministry awards no stars. The next level is open anyway.'));
      else d.appendChild(victoryScene(stars, lv));
      var key = el('p', 'db-reno stars-key');
      key.innerHTML = '<b>Your run:</b> ' + run.round + ' rounds, ' + run.lost + ' birds lost' + (share !== null ? ', ' + pct(share) + ' of the shared Gap' : '') + '.<br>' + starsKey(lv);
      d.appendChild(key);
    } else if (!lv.sandbox && !S.assisted) {
      var k2 = el('p', 'db-reno stars-key'); k2.innerHTML = '<b>What the stars wanted:</b><br>' + starsKey(lv); d.appendChild(k2);
    }
    if (!lv.sandbox) {
      var ref = E.renoReference(lv, run.seed), rp = el('p', 'db-reno');
      rp.textContent = 'For comparison, the Reno on this same sky: ' + (ref.inTime ? ref.rounds + ' rounds, ' + ref.lost + ' ' + plural(ref.lost, 'bird') + ' lost.' : ref.won ? 'about ' + ref.rounds + ' rounds, ' + ref.lost + ' birds lost, which is past the deadline.' : 'did not finish.');
      d.appendChild(rp);
    }
    var nextLocked = run.won && !S.assisted && !lv.sandbox && lv.id < 5 && !isUnlocked(lv.id + 1);
    if (run.won && !S.assisted && !lv.sandbox && !adaptedNow) d.appendChild(el('p', 'db-blind', 'You flew (partly) blind: this flock did not consistently change in response to what came back, so the Gap taught it less than it might' + (nextLocked ? '. The Ministry will not open the next level until you have shown you can respond to a loss, or the Reno has flown this one.' : '.')));
    if (run.won && lv.id === 1 && !S.assisted && renoUnlocked()) d.appendChild(el('p', 'db-unlock', 'Unlocked: Hire a Reno, a bird-brained autopilot. Find the button beside Release the flock.'));
    var note3 = run.won && !S.assisted && !lv.sandbox && stars < 3 ? thirdStarNote(run, lv) : null;
    if (note3) d.appendChild(el('p', 'db-reno', note3));
    d.appendChild(el('h3', 'db-sub', S.assisted ? 'What happened' : 'What you did'));
    data.mine.forEach(function (x) { d.appendChild(el('p', null, x)); });
    d.appendChild(el('h3', 'db-sub', 'What it was'));
    data.concept.forEach(function (x) { d.appendChild(el('p', null, x)); });
    if (lv.rival) { var sb = shareBar(run); if (sb) d.appendChild(sb); }
    var fct = el('p', 'db-fact'); fct.innerHTML = '<b>Real-world fact.</b> ' + esc(data.fact); d.appendChild(fct);
    d.appendChild(el('p', 'smallprint', 'Model note: the Ministry simplifies. Congestion collapse here is modelled by a penalty (birds over the Gap’s limit knock out others), not derived from real queues; ACKs never go astray; and every round is one lockstep round trip.'));
    if (!run.won) d.appendChild(el('p', 'muted', 'Retrying gives you a fresh sky: ' + (lv.p > 0 ? 'same Gap, different hawks.' : lv.rival ? 'same Gap, a rival in a different mood.' : 'same Gap, a different scatter of luck.')));
    var row = el('div', 'cta-row');
    var btn = function (txt, cls, fn) { var b = el('button', 'btn ' + cls, txt); b.type = 'button'; b.addEventListener('click', fn); row.appendChild(b); return b; };
    var nextId = lv.id < 6 ? lv.id + 1 : null;
    var pity = !run.won && !S.assisted && !lv.sandbox && nextId && (prog.fails[lv.id] || 0) >= 2;
    if (pity) {
      d.appendChild(el('p', 'db-unlock', 'Level ' + nextId + ' is open: the Ministry takes pity. Two honest failures here have been noted, with sympathy, in a drawer.'));
    }
    var canNext = run.won && nextId && isUnlocked(nextId);
    if (pity) btn(nextId === 6 ? 'Level 6 is open: the Ministry takes pity' : 'Level ' + nextId + ' is open: the Ministry takes pity', 'btn-primary', function () { openLevel(nextId); });
    if (canNext) btn(nextId === 6 ? 'On to the Open Sky' : 'Next: ' + levelById(nextId).name, 'btn-primary', function () { openLevel(nextId); });
    if (run.won && S.assisted && !lv.sandbox) btn('Now fly it yourself', canNext ? '' : 'btn-primary', function () { S.attempt[lv.id] = (S.attempt[lv.id] || 0) + 1; beginBrief(lv); });
    else btn(run.won ? 'Fly it again' : 'Try again', run.won && canNext ? '' : 'btn-primary', function () { S.attempt[lv.id] = (S.attempt[lv.id] || 0) + 1; lv.sandbox ? sandboxRestart() : beginBrief(lv); });
    if (renoUnlocked()) btn('Watch the Reno fly this', '', function () { S.attempt[lv.id] = (S.attempt[lv.id] || 0) + 1; var again = lv.sandbox ? sandboxLevel() : lv; beginBrief(again); S.phase = 'play'; $('debrief').hidden = true; renderAll(); hireReno(); });
    if (lv.sandbox) btn('Set the weather again', '', openSandboxDialog);
    btn('All levels', '', function () { goTitle(true); });
    d.appendChild(row);
    d.appendChild(el('p', 'smallprint', 'Signed, ' + flockName() + '. Request for Comments: please do not send comments by pigeon.'));
    setTimeout(function () { d.focus({ preventScroll: true }); d.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }, 80);
  }

  /* ---------- sandbox ---------- */
  function sbMessage() {
    var c = +$('sb-c').value, p = +$('sb-p').value, r = $('sb-r').checked, m = '';
    if (r && c < 8) m = 'With a Gap this narrow two flocks will mostly meet each other. Educational. Unpleasant.';
    else if (p >= 30) m = 'At this hawk density the Ministry advises against naming the birds.';
    else if (c < 6) m = 'A Gap this narrow rewards patience, and a very small flock.';
    $('sb-msg').textContent = m;
  }
  function openSandboxDialog() {
    var dlg = $('dlg-sandbox');
    $('sb-c').value = S.sandbox.C; $('sb-p').value = S.sandbox.p; $('sb-r').checked = S.sandbox.rival;
    $('sb-c-o').textContent = S.sandbox.C; $('sb-p-o').textContent = S.sandbox.p; sbMessage();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function sandboxRestart() { beginBrief(sandboxLevel()); }

  /* ---------- navigation ---------- */
  function midFlight() { return S.run && !S.finished && S.phase === 'play' && (S.shown > 0 || S.busy); }
  function goTitle(force) {
    if (!force && midFlight() && !S.auto) { var d = $('dlg-leave'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); return; }
    clearTimeout(S.timer); S.runId++; S.auto = false; S.busy = false; S.skipping = true; S.finished = true;
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
    $('btn-fast').addEventListener('click', function () { prog.fast = !prog.fast; save(); renderControls(); });
    $('dlg-leave').addEventListener('close', function () { if (this.returnValue === 'leave') goTitle(true); this.returnValue = ''; });
    $('w-minus').addEventListener('click', function () { setW(S.w - 1); });
    $('w-plus').addEventListener('click', function () { setW(S.w + 1); });
    $('w-range').addEventListener('input', function () { setW(+this.value); });
    $('btn-go').addEventListener('click', release);
    $('btn-reno').addEventListener('click', hireReno);
    $('btn-skip').addEventListener('click', function () { S.skipping = true; });
    $('mapwrap').addEventListener('click', function () { if (S.busy) S.skipping = true; });
    ['sb-c', 'sb-p', 'sb-r'].forEach(function (id) { $(id).addEventListener('input', function () { $('sb-c-o').textContent = $('sb-c').value; $('sb-p-o').textContent = $('sb-p').value; sbMessage(); }); });
    $('sb-form').addEventListener('submit', function () { S.sandbox.C = +$('sb-c').value; S.sandbox.p = +$('sb-p').value; S.sandbox.rival = $('sb-r').checked; setTimeout(sandboxRestart, 0); });
    $('egg').addEventListener('click', function () { var t = $('egg-text'), open = t.hidden; t.hidden = !open; t.textContent = open ? ' ' + C.FOOT_BERGEN : ''; this.setAttribute('aria-expanded', open); });
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'TEXTAREA' || (tag === 'INPUT' && e.target.type === 'text') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('dialog[open]') || $('screen-game').hidden) return;
      var k = e.key;
      if (k === '+' || k === '=') { setW(S.w + 1); e.preventDefault(); }
      else if (k === '-' || k === '_') { setW(S.w - 1); e.preventDefault(); }
      else if (k === 'r' || k === 'R') { if ((tag !== 'BUTTON' || e.target.id === 'btn-go') && !e.repeat) release(); }
      else if (k === 'h' || k === 'H') { if (renoUnlocked() && !e.repeat) hireReno(); }
    });
    var onMq = function (e) { reduceMotion = e.matches; };
    try { var mq = window.matchMedia('(prefers-reduced-motion: reduce)'); mq.addEventListener ? mq.addEventListener('change', onMq) : mq.addListener(onMq); } catch (e) {}
    var dm = $('deskmenu'), mqW = window.matchMedia ? window.matchMedia('(min-width: 640px)') : null;
    var syncMenu = function () { if (mqW && mqW.matches) dm.open = true; };
    syncMenu(); if (mqW) { try { mqW.addEventListener('change', function () { dm.open = mqW.matches; }); } catch (e) {} }
    dm.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { if (!(mqW && mqW.matches)) dm.open = false; }); });
    var hd = $('howto-d'); if (hd && window.innerWidth >= 900) hd.open = true;
    var h1 = document.querySelector('#screen-title h1'); if (h1 && !reduceMotion) h1.classList.add('wob');
    show('title');
  }
  init();
})();
