/* Pigeon Protocol engine. Pure, seeded, no DOM. UMD: browser global PigeonEngine, or require() in Node.
 *
 * Model, per round (one round = one round-trip time = one flight):
 *   - The sender releases w birds, carrying the lowest-numbered unacknowledged scrolls.
 *   - A rival flock (if any) releases its own birds at the same moment.
 *   - The Gap passes at most C birds. If more are offered, the excess is lost to crowding,
 *     AND the jostling takes a few more out of the sky (JAM), so the Gap passes LESS than C.
 *     That is what makes congestion collapse emerge rather than be scripted.
 *   - Every bird that got through the Gap is independently taken by hawks with probability p,
 *     whatever the load. That is loss which is NOT congestion.
 *   - Survivors deliver; their ACKs come home; the sender learns the result after the round.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PigeonEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var JAM = 0.75;         // in a crowd the scrum takes out MORE than the excess, so offering more can deliver less
  var JAM_RIVAL = 1.0;    // two flocks mixing in the Gap collide more than one flock does         // each bird beyond capacity also knocks this many others out of the sky
  var JAM_FLOOR = 0.35;   // the Gap never passes fewer than this fraction of C
  var MAX_W = 24;

  function hash(a, b) {
    var h = (a ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // "adapt" in a star bar means: you must, at least once, have flown fewer birds after losing some.
  // A flock that only ever grows or holds has not adapted to anything, however the numbers came out.
  // "jitter" is the per-attempt wobble of the weather (rounds early or late, birds wider or narrower).
  var LEVELS = [
    { id: 1, key: 'clear-skies', name: 'Clear Skies', scrolls: 84, deadline: 14, cap: [[1, 12]], jitter: { cap: 2 }, p: 0, rival: null, seed: 1149, loft: 45,
      stars: { three: { rounds: 11, lost: 20, adapt: true }, two: { rounds: 14, lost: 32, adapt: true } } },
    { id: 2, key: 'hawk-season', name: 'Hawk Season', scrolls: 150, deadline: 20, cap: [[1, 14], [3, 5], [6, 24]], jitter: { shift: 2, cap: 3 }, p: 0.1, rival: null, seed: 1990, loft: 45,
      stars: { three: { rounds: 18, lost: 30, adapt: true }, two: { rounds: 20, lost: 38, adapt: true } } },
    { id: 3, key: 'rival-loft', name: 'The Rival Loft', scrolls: 90, deadline: 20, cap: [[1, 18], [3, 7], [9, 20]], jitter: { shift: 1, cap: 2 }, p: 0, rival: { start: 3, from: 2, to: 9 }, seed: 2001, loft: 36,
      stars: { three: { rounds: 17, lost: 18, share: 0.6, minShare: 0.3, adapt: true }, two: { rounds: 20, lost: 30, share: 0.7, adapt: true } } },
    { id: 4, key: 'storm-front', name: 'Storm Front', scrolls: 120, deadline: 20, cap: [[1, 14], [3, 7], [8, 23], [11, 9], [13, 20]], jitter: { shift: 2, cap: 3 }, p: 0, rival: null, seed: 1701, loft: 45,
      stars: { three: { rounds: 17, lost: 32, adapt: true }, two: { rounds: 20, lost: 40, adapt: true } } },
    { id: 5, key: 'big-delivery', name: 'The Big Delivery', scrolls: 90, deadline: 20, cap: [[1, 15], [3, 6], [7, 24]], jitter: { shift: 2, cap: 3 }, p: 0.06, rival: { start: 3, from: 2, to: 10 }, seed: 1707, loft: 45,
      stars: { three: { rounds: 20, lost: 34, share: 0.65, minShare: 0.25, adapt: true }, two: { rounds: 20, lost: 40, share: 0.75, adapt: true } } },
    { id: 6, key: 'sandbox', name: 'The Open Sky', scrolls: 100, deadline: 30, cap: [[1, 15]], p: 0, rival: null, seed: 4242, sandbox: true, loft: 9999 }
  ];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function capAt(level, round) {
    var c = level.cap[0][1];
    for (var i = 0; i < level.cap.length; i++) if (level.cap[i][0] <= round) c = level.cap[i][1];
    return c;
  }

  // ---- Reno-style AIMD policy -------------------------------------------------------------
  // Double until first loss (slow start), then halve and +1 per round (congestion avoidance).
  function createReno(startW) {
    return { w: startW || 1, ssthresh: Infinity };
  }
  function renoNext(reno, lossSeen) {
    if (lossSeen) {
      reno.ssthresh = Math.max(2, Math.floor(reno.w / 2));
      reno.w = reno.ssthresh;
    } else if (reno.w < reno.ssthresh) {
      reno.w = Math.min(reno.w * 2, reno.ssthresh === Infinity ? MAX_W : reno.ssthresh);
    } else {
      reno.w = reno.w + 1;
    }
    reno.w = Math.max(1, Math.min(MAX_W, reno.w));
    return reno.w;
  }

  // ---- run ---------------------------------------------------------------------------------
  // Each attempt gets a slightly different sky: the weather arrives a round early or late, and the Gap is a
  // bird or two wider or narrower, so a remembered schedule does not win on a retry. The canonical level
  // schedule (level.cap) is what the tests and the brief describe; the jittered one is what is flown.
  function jitterSchedule(lv, seed) {
    var j = lv.jitter;
    if (!j) return lv.cap.map(function (c) { return [c[0], c[1]]; });
    var rng = mulberry32(hash(seed >>> 0, 4401)), out = [];
    lv.cap.forEach(function (c, i) {
      var shift = i === 0 || !j.shift ? 0 : Math.round((rng() * 2 - 1) * j.shift), d = j.cap ? Math.round((rng() * 2 - 1) * j.cap) : 0;
      out.push([Math.max(1, c[0] + shift), Math.max(3, c[1] + d)]);
    });
    out.sort(function (a, b) { return a[0] - b[0]; });
    return out;
  }

  function createRun(level, seed) {
    var lv = clone(level);
    var scrolls = [];
    for (var i = 1; i <= lv.scrolls; i++) scrolls.push({ id: i, acked: false, attempts: 0 });
    var run = {
      level: lv,
      seed: (seed === undefined ? lv.seed : seed) >>> 0,
      capSched: null,
      round: 0,
      scrolls: scrolls,
      delivered: 0,
      sent: 0,
      lost: 0,
      lostCrowd: 0,
      lostHawk: 0,
      rivalDelivered: 0,
      birdSerial: 0,
      rival: lv.rival ? createReno(lv.rival.start || 2) : null,
      history: [],
      done: false,
      won: false,
      endReason: null
    };
    run.capSched = jitterSchedule(lv, run.seed);
    return run;
  }

  function pendingIds(run) {
    var out = [];
    for (var i = 0; i < run.scrolls.length; i++) if (!run.scrolls[i].acked) out.push(i);
    return out;
  }

  function gapPasses(offered, C, jam) {
    if (offered <= C) return offered;
    var p = Math.round(C - (jam === undefined ? JAM : jam) * (offered - C));
    return Math.max(Math.ceil(JAM_FLOOR * C), p);
  }

  function playRound(run, w) {
    if (run.done) throw new Error('run is over');
    var lv = run.level, r = run.round + 1;
    var rng = mulberry32(hash(run.seed, r));
    var pend = pendingIds(run);
    var requested = Math.round(w);
    w = Math.max(1, Math.min(requested, MAX_W, pend.length));
    var C = capAt({ cap: run.capSched }, r);
    var rivalOn = !!run.rival && (lv.rival.from === undefined || r >= lv.rival.from) && (lv.rival.to === undefined || r <= lv.rival.to);
    if (rivalOn && lv.rival.from === r) run.rival = createReno(lv.rival.start || 2);   // a fresh flock turns up
    var rw = rivalOn ? run.rival.w : 0;

    var birds = [], i;
    for (i = 0; i < w; i++) {
      var sc = run.scrolls[pend[i]];
      birds.push({ owner: 'you', serial: run.birdSerial++, scroll: sc.id, attempt: sc.attempts, fate: 'ok' });
    }
    for (i = 0; i < rw; i++) birds.push({ owner: 'rival', serial: -1, scroll: 0, attempt: 0, fate: 'ok' });

    var offered = birds.length;
    var passes = gapPasses(offered, C, rivalOn ? JAM_RIVAL : JAM);
    var order = [];
    for (i = 0; i < offered; i++) order.push(i);
    for (i = offered - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (i = passes; i < offered; i++) birds[order[i]].fate = 'crowd';
    for (i = 0; i < offered; i++) {
      var roll = rng(); // always drawn, so the hawks do not depend on who got crowded out
      if (birds[i].fate === 'ok' && roll < lv.p) birds[i].fate = 'hawk';
    }

    var rec = {
      round: r, requested: requested, w: w, cap: C, p: lv.p, rivalW: rw, offered: offered, passes: passes,
      delivered: 0, lost: 0, lostCrowd: 0, lostHawk: 0, rivalLost: 0, rivalDelivered: 0, retx: 0,
      birds: birds, newlyAcked: []
    };
    for (i = 0; i < birds.length; i++) {
      var b = birds[i];
      if (b.owner === 'you') {
        var s = run.scrolls[b.scroll - 1];
        s.attempts++;
        if (b.attempt > 0) rec.retx++;
        if (b.fate === 'ok') { s.acked = true; rec.delivered++; rec.newlyAcked.push(b.scroll); }
        else { rec.lost++; if (b.fate === 'crowd') rec.lostCrowd++; else rec.lostHawk++; }
      } else {
        if (b.fate === 'ok') rec.rivalDelivered++; else rec.rivalLost++;
      }
    }
    rec.rivalDugIn = false; rec.rivalOn = rivalOn;
    if (rivalOn) {
      // The rival is a Reno: it halves when it loses birds. But a flock that keeps squeezing it gets
      // pushed back: after two losing rounds in a row it digs in and doubles instead of backing off.
      run.rival.streak = rec.rivalLost > 0 ? (run.rival.streak || 0) + 1 : 0;
      if (rec.rivalLost > 0 && run.rival.streak >= 2) { run.rival.w = Math.min(MAX_W, run.rival.w * 2); rec.rivalDugIn = true; }
      else renoNext(run.rival, rec.rivalLost > 0);
    }

    run.round = r;
    run.sent += w;
    run.delivered += rec.delivered;
    run.lost += rec.lost;
    run.lostCrowd += rec.lostCrowd;
    run.lostHawk += rec.lostHawk;
    run.rivalDelivered += rec.rivalDelivered;
    run.history.push(rec);
    if (run.delivered >= lv.scrolls) { run.done = true; run.won = true; run.endReason = 'delivered'; }
    else if (run.lost >= lv.loft) { run.done = true; run.won = false; run.endReason = 'loft'; }
    else if (r >= lv.deadline) { run.done = true; run.won = false; run.endReason = 'deadline'; }
    return rec;
  }

  // ---- policies / reference ---------------------------------------------------------------
  function runPolicy(level, seed, policy) {
    // policy(run, lastRec) -> w. Reno: use renoPolicy().
    var run = createRun(level, seed), last = null;
    while (!run.done) { last = playRound(run, policy(run, last)); }
    return run;
  }
  function renoPolicy(startW) {
    var reno = createReno(startW || 1), first = true;
    return function (run, last) {
      if (first) { first = false; return reno.w; }
      return renoNext(reno, last.lost > 0);
    };
  }
  function renoReference(level, seed) {
    // Reno is given plenty of time here, so we learn how long it WOULD take, not just whether it beat the clock.
    var lv = clone(level); lv.deadline = Math.max(60, lv.deadline); lv.loft = 9999;
    var run = runPolicy(lv, seed, renoPolicy(1));
    var inTime = run.won && run.round <= level.deadline && run.lost < level.loft;
    return { rounds: run.round, lost: run.lost, won: run.won, inTime: inTime, run: run };
  }

  // ---- stars -------------------------------------------------------------------------------
  // 1: delivered everything in time.  2: matched the bird-brain.  3: beat it.
  // Thresholds are per level (level.stars), derived from Reno's behaviour and checked in the tests.
  // Share of the traffic through the Gap that was yours, over the rounds the rival was actually flying
  // (1 when there was no rival).
  function shareOf(run) {
    var mine = 0, theirs = 0;
    run.history.forEach(function (h) { if (h.rivalOn) { mine += h.delivered; theirs += h.rivalDelivered; } });
    return mine + theirs ? mine / (mine + theirs) : 1;
  }
  // Did the sender ever respond to a loss by flying fewer birds next time? A flock that only ever grows
  // (or only ever holds) has not adapted to anything, however well the numbers worked out.
  function adaptedOf(run) {
    var h = run.history;
    for (var i = 0; i < h.length - 1; i++) if (h[i].lost >= 1 && h[i + 1].requested < h[i].requested) return true;
    return false;
  }
  function starsFor(run) {
    var st = run.level.stars;
    if (!run.won || !st) return run.won ? 1 : 0;
    var rounds = run.round, lost = run.lost, sh = shareOf(run), s = 1;
    function ok(t) { return rounds <= t.rounds && lost <= t.lost && (t.share === undefined || sh <= t.share) && (t.minShare === undefined || sh >= t.minShare) && (t.adapt === undefined || !t.adapt || adaptedOf(run)); }
    if (ok(st.two)) s = 2;
    if (ok(st.three)) s = 3;
    return s;
  }

  return {
    LEVELS: LEVELS, JAM: JAM, MAX_W: MAX_W,
    hash: hash, mulberry32: mulberry32, capAt: capAt, gapPasses: gapPasses,
    createRun: createRun, playRound: playRound, pendingIds: pendingIds,
    createReno: createReno, renoNext: renoNext, renoPolicy: renoPolicy,
    runPolicy: runPolicy, renoReference: renoReference, starsFor: starsFor, shareOf: shareOf, adaptedOf: adaptedOf
  };
});
