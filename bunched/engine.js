/* Bunched - pure simulation engine.
 *
 * A ring road, N stops, n buses, passengers arriving at a steady (Poisson)
 * rate, and one honest piece of physics (Newell & Potts, 1964):
 *
 *     dwell time at a stop = d0 + k * (passengers boarding)
 *
 * A bus a little late finds a longer queue (the gap since the last bus is
 * bigger), so it dwells longer, so it is later still. The bus behind finds a
 * short queue and catches up. Nothing in here "scripts" a bunch: it emerges.
 *
 * Rules, documented because they matter:
 *  - Buses cannot overtake. A bus travels behind the one ahead (min gap
 *    minGap metres); a bunch therefore stays glued together.
 *  - A bus stops only if someone is waiting, someone wants to alight, or the
 *    dispatcher has put a hold on it. Otherwise it sails past.
 *  - A bus at crush load (cap) leaves people behind ("stranded").
 *  - If the bus ahead is already at a stop, the next bus joins it in the
 *    queue of buses ("double stopping") and serves the same queue.
 *  - Deterministic: fixed timestep, separate seeded RNG streams per stop,
 *    per bus and for incidents, so the demand is identical however you drive.
 *
 * Plain script (also loads under Node as an ES module without exports):
 * it publishes globalThis.Bunched.
 */
(function (root) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var STOP_NAMES = [
    'The Terminus Pub', 'Colinton', 'Slateford', 'Murrayfield', 'Roseburn', 'Dean Village',
    'Stockbridge', 'Canonmills', 'Warriston', 'Bonnington', 'The Shore', 'Newhaven'
  ];

  var NAMES = [
    'Morag McAllister', 'Dougal Fraser', 'Mrs Henderson', 'Hamish Buchanan', 'Senga Robertson',
    'Archie Dunbar', 'Isla Cameron', 'Wullie Sinclair', 'Mhairi Gordon', 'Angus Lennox',
    'Agnes Pettigrew', 'Fergus Imrie', 'Elspeth Napier', 'Callum Rennie', 'Jean Kilgour',
    'Gregor Baxter', 'Nessa Strachan', 'Ewan Mitchell', 'Beathag Munro', 'Rab Calder',
    'Dr Ogilvy', 'Kirsty Lamont', 'Tam Whitelaw', 'Flora Drummond', 'Murdo Gilchrist',
    'Aileen Rankin', 'Bruce Elphinstone', 'Ishbel Crombie', 'Davie Tulloch', 'Lorna Haig',
    'Alasdair Wemyss', 'Cissie Muir', 'Hector Lindsay', 'Grizel Moffat', 'Struan Forbes',
    'Maisie Brodie', 'Ross Guthrie', 'Effie Cockburn', 'Lachlan Veitch', 'Nan Ballantyne'
  ];

  var INCIDENTS = [
    { id: 'pigeon', dur: 18 },
    { id: 'lollipop', dur: 24 },
    { id: 'haggis', dur: 40 },
    { id: 'photo', dur: 22 },
    { id: 'bagpipes', dur: 30 },
    { id: 'seagull', dur: 15 },
    { id: 'wheelie', dur: 20 }
  ];

  var DEFAULTS = {
    seed: 1, nBus: 6, nStops: 12, L: 6000, vFree: 6,
    k: 2.5, d0: 3, ka: 0.6, cap: 45, lambda: 0.03,
    demandMult: null, bursts: [], arrivals: 'poisson',
    speedNoise: 0, incidentRate: 0, incidents: [],
    slow: [], lights: [], holdMax: 150, dt: 0.5, duration: 6000,
    minGap: 14, reach: 80, phase: 0.35, patience: 1,
    auto: null, prefill: true, graceFrac: 0.25, hwFactor: 1.05, ttSpeed: 0.74, radioMax: 2, cooldown: 900
  };

  function createSim(userCfg) {
    var cfg = {}, key;
    for (key in DEFAULTS) cfg[key] = DEFAULTS[key];
    for (key in (userCfg || {})) if (userCfg[key] !== undefined) cfg[key] = userCfg[key];

    var N = cfg.nStops, n = cfg.nBus, L = cfg.L, spacing = L / N;
    var sim = {
      cfg: cfg, t: 0, N: N, n: n, L: L, spacing: spacing, cv: 0, maxConvoy: 1,
      stops: [], buses: [], events: [], hist: [], win: [],
      stats: {
        spawned: 0, boarded: 0, delivered: 0, sumWait: 0, complaints: 0, stranded: 0,
        heldPaxSec: 0, sumRide: 0, holds: 0, cvSum: 0, cvN: 0, maxConvoy: 1,
        sumH: 0, sumH2: 0, nH: 0, wasted: 0, denied: 0
      },
      Hest: (L / cfg.vFree) * 1.4 / n, lapEst: 0,
      nextId: 1, convoyShown: 1, auto: cfg.auto, bunched: []
    };
    var rngInc = mulberry32(cfg.seed * 104729 + 7);
    var i, j;

    function emit(ev) { ev.t = sim.t; sim.events.push(ev); }

    function nextArrival(st, from, first) {
      if (st.rate <= 0) return Infinity;
      if (cfg.arrivals === 'fixed') return from + (first ? (st.i + 0.5) / N : 1) / st.rate;
      return from - Math.log(1 - st.rng()) / st.rate;
    }
    function makePax(st, at) {
      var r = st.rng;
      var ride = 2 + Math.floor(r() * 6);
      return {
        id: sim.nextId++, t: at, from: st.i, dest: (st.i + ride) % N,
        name: NAMES[Math.floor(r() * NAMES.length)], look: Math.floor(r() * 7),
        coat: Math.floor(r() * 6),
        pat: (300 + r() * 300) * cfg.patience, patHold: 30 + r() * 55,
        complained: false, passed: false, held: 0, boardT: -1
      };
    }
    function spawn(st, at) {
      var p = makePax(st, at);
      st.queue.push(p); sim.stats.spawned++;
      return p;
    }

    // ---- stops ------------------------------------------------------
    for (i = 0; i < N; i++) {
      var mult = cfg.demandMult ? (cfg.demandMult[i] || 1) : 1;
      var st = {
        i: i, name: STOP_NAMES[i % STOP_NAMES.length], pos: i * spacing, queue: [],
        rate: cfg.lambda * mult, mult: mult, rng: mulberry32(cfg.seed * 31337 + i * 977 + 5),
        lastPass: -1, armedHold: false, nextArr: 0, passT: []
      };
      for (var q0 = 0; q0 < n; q0++) st.passT.push(-1);
      st.nextArr = nextArrival(st, 0, true);
      sim.stops.push(st);
    }

    // ---- buses ------------------------------------------------------
    for (i = 0; i < n; i++) {
      var pos = (i * L / n + cfg.phase * spacing) % L;
      sim.buses.push({
        id: i, pos: pos, dist: 0, dist0: 0, state: 'run', ns: Math.ceil(pos / spacing - 1e-9) % N, stop: -1,
        pax: [], hold: { armed: false, active: false, left: 0, mode: 'gap', target: 0, startT: 0 }, coolUntil: -1, lapStart: -1, stuck: 0,
        speedMult: 1, nextSpeedAt: 0, alightLeft: 0, openLeft: 0, boardAcc: 0,
        rng: mulberry32(cfg.seed * 65537 + i * 131 + 3), arrH: 0, laps: 0, dwellId: 0,
        lastStopT: -1, speed: 0, full: false, held: false, lastPs: -1, lastPt: 0
      });
    }

    // pre-fill queues and loads at roughly steady state, so the level starts
    // in a believable morning and not an empty ghost route
    if (cfg.prefill) {
      for (j = 0; j < N; j++) {
        var st2 = sim.stops[j], best = L;
        for (i = 0; i < n; i++) {
          var d = ((st2.pos - sim.buses[i].pos) % L + L) % L;
          if (d < best) best = d;
        }
        var age = best / cfg.vFree, cnt = Math.round(st2.rate * age);
        for (var c = 0; c < cnt; c++) spawn(st2, -age * (c + 0.5) / cnt);
      }
      for (i = 0; i < n; i++) {
        var b = sim.buses[i];
        for (var m = 1; m <= 6; m++) {
          var sIdx = ((b.ns - m) % N + N) % N, sp = sim.stops[sIdx];
          var cnt2 = Math.round(sp.rate * sim.Hest * (7 - m) / 6);
          for (var c2 = 0; c2 < cnt2 && b.pax.length < cfg.cap; c2++) {
            var pp = makePax(sp, -1); pp.boardT = 0;
            var D = m + 1 + Math.floor(sp.rng() * (7 - m) * 0.999);
            pp.dest = (((b.ns - m + D) % N) + N) % N;
            sim.stats.spawned++; sim.stats.boarded++;
            b.pax.push(pp);
          }
        }
      }
    }
    var bursts = (cfg.bursts || []).slice().sort(function (a, b) { return a.t - b.t; });
    var burstI = 0, warnI = 0;
    var incScripted = (cfg.incidents || []).slice().sort(function (a, b) { return a.t - b.t; });
    var incI = 0;
    var nextRandInc = cfg.incidentRate > 0 ? -Math.log(1 - rngInc()) / cfg.incidentRate : Infinity;

    // ---- helpers ----------------------------------------------------
    function leaderOf(id) { return sim.buses[(id + 1) % n]; }
    function gapAhead(id) {
      if (n < 2) return L;
      var b = sim.buses[id], ld = leaderOf(id);
      return ((ld.pos - b.pos) % L + L) % L;
    }
    function slowFactor(pos) {
      var f = 1, k2;
      for (k2 = 0; k2 < cfg.slow.length; k2++) {
        var s = cfg.slow[k2];
        if (pos >= s.from && pos < s.to) f = Math.min(f, s.factor);
      }
      return f;
    }
    function lightRed(l, t) { return ((t + (l.offset || 0)) % l.period) < l.red; }
    sim.lightRed = function (idx) { return lightRed(cfg.lights[idx], sim.t); };

    function bucket() {
      var k3 = Math.floor(sim.t / 60), w = sim.win, last = w[w.length - 1];
      if (!last || last.k !== k3) {
        last = { k: k3, sw: 0, nw: 0, sh: 0, sh2: 0, nh: 0 };
        w.push(last);
        while (w.length > 20) w.shift();
      }
      return last;
    }
    function complain(p, kind, stopIdx, busId) {
      if (p.complained) return;
      p.complained = true; sim.stats.complaints++;
      emit({ type: 'complaint', kind: kind, name: p.name, look: p.look, coat: p.coat, stop: stopIdx, bus: busId, pid: p.id, waited: sim.t - p.t, held: p.held });
    }
    function strand(p, stopIdx, busId, kind) {
      if (!p.passed) {
        p.passed = true; sim.stats.stranded++;
        complain(p, kind || 'passed', stopIdx, busId);
      }
    }
    function sampleHeadway(st, bus) {
      var h = 0;
      if (st.lastPass >= 0) {
        h = sim.t - st.lastPass;
        var bk = bucket(); bk.sh += h; bk.sh2 += h * h; bk.nh++;
        sim.stats.sumH += h; sim.stats.sumH2 += h * h; sim.stats.nH++;
      }
      bus.arrH = h; st.lastPass = sim.t; st.passT[bus.id] = sim.t; bus.lastPs = st.i; bus.lastPt = sim.t;
      return h;
    }

    function endHold(bus, why, auto) {
      bus.hold.active = false; bus.coolUntil = sim.t + cfg.cooldown;
      if (sim.t - bus.hold.startT < 15) sim.stats.wasted++;
      emit({ type: 'holdend', bus: bus.id, stop: bus.stop, auto: !!auto, why: why });
    }
    sim.radioBusy = function () { var c = 0, i8; for (i8 = 0; i8 < n; i8++) if (sim.buses[i8].hold.armed || sim.buses[i8].hold.active) c++; return c; };

    // ---- arrival ----------------------------------------------------
    function arrive(bus, si) {
      var st = sim.stops[si];
      bus.ns = (si + 1) % N;
      var h = sampleHeadway(st, bus);
      if (si === 0) {
        bus.laps++;
        if (bus.lapStart >= 0) { var lp = sim.t - bus.lapStart; sim.lapEst = sim.lapEst ? sim.lapEst + 0.2 * (lp - sim.lapEst) : lp; sim.Hest = sim.lapEst / n; }
        bus.lapStart = sim.t;
      }
      var alight = [], rest = [], k4;
      for (k4 = 0; k4 < bus.pax.length; k4++) (bus.pax[k4].dest === si ? alight : rest).push(bus.pax[k4]);

      var armed = bus.hold.armed;
      var full = bus.pax.length >= cfg.cap && alight.length === 0;
      if (full && !armed && st.queue.length) {
        for (k4 = 0; k4 < st.queue.length; k4++) strand(st.queue[k4], si, bus.id, 'passed');
        emit({ type: 'pass', kind: 'full', bus: bus.id, stop: si, waiting: st.queue.length, over: 0 });
        return false;
      }
      if (!armed && alight.length === 0 && st.queue.length === 0) {
        emit({ type: 'pass', kind: 'sail', bus: bus.id, stop: si, waiting: 0, over: 0 });
        return false;
      }
      // stop
      bus.pax = rest;
      for (k4 = 0; k4 < alight.length; k4++) {
        sim.stats.delivered++; sim.stats.sumRide += sim.t - alight[k4].boardT;
        if (alight[k4].passed) complain(alight[k4], 'over', si, bus.id);
      }
      bus.state = 'dwell'; bus.stop = si; bus.speed = 0;
      bus.alightLeft = alight.length * cfg.ka; bus.openLeft = cfg.d0;
      bus.boardAcc = 0; bus.dwellId++; bus.lastStopT = sim.t; bus.full = false;
      if (armed) {
        bus.hold.armed = false;
        bus.hold.active = true; bus.hold.startT = sim.t; bus.hold.left = cfg.holdMax; bus.hold.mode = bus.hold.armMode || 'gap'; bus.hold.target = sim.holdTarget(); bus.hold.armMode = null; sim.stats.holds++;
        emit({ type: 'holdstart', bus: bus.id, stop: si, auto: false });
      }
      emit({ type: 'arrive', bus: bus.id, stop: si, alight: alight.length, waiting: st.queue.length, h: h });
      if (sim.auto && AUTO[sim.auto]) AUTO[sim.auto](sim, bus, st, h);
      return true;
    }

    function depart(bus) {
      var st = sim.stops[bus.stop];
      if (st.queue.length && bus.pax.length >= cfg.cap) {
        for (var q = 0; q < st.queue.length; q++) strand(st.queue[q], st.i, bus.id, 'passed');
        emit({ type: 'leftbehind', bus: bus.id, stop: st.i, waiting: st.queue.length });
      }
      if (bus.pax.length >= cfg.cap) {
        var cand = bus.pax[Math.floor(bus.rng() * bus.pax.length)];
        if (cand && !cand.complained) complain(cand, 'crush', st.i, bus.id);
      }
      bus.state = 'run'; bus.stop = -1; bus.held = false;
      emit({ type: 'depart', bus: bus.id, stop: st.i });
    }

    function dwellStep(bus, dt) {
      var st = sim.stops[bus.stop], k5;
      var h = bus.hold;
      if (h.active) {
        h.left -= dt;
        var why = null;
        if (h.left <= 0) why = 'max';
        else if (h.mode === 'gap') {
          var pt = st.passT[sim.leader(bus.id)];
          if (pt < 0 || sim.t - pt >= h.target) why = 'target';
        } else if (h.mode === 'sched') {
          if (bus.dist - cfg.vFree * cfg.ttSpeed * sim.t <= 0) why = 'target';
        }
        if (why) endHold(bus, why, true);
      }
      if (bus.alightLeft > 0) bus.alightLeft -= dt;
      else if (bus.openLeft > 0) bus.openLeft -= dt;
      else {
        bus.boardAcc += dt;
        while (bus.boardAcc >= cfg.k && st.queue.length && bus.pax.length < cfg.cap) {
          var p = st.queue.shift();
          var w = sim.t - p.t; p.boardT = sim.t; p.wait = w;
          sim.stats.sumWait += w; sim.stats.boarded++;
          var bk = bucket(); bk.sw += w; bk.nw++;
          bus.pax.push(p); bus.boardAcc -= cfg.k;
          emit({ type: 'board', bus: bus.id, stop: st.i });
        }
        if (!st.queue.length || bus.pax.length >= cfg.cap) bus.boardAcc = Math.min(bus.boardAcc, cfg.k * 0.999);
      }
      var idle = bus.alightLeft <= 0 && bus.openLeft <= 0 && (!st.queue.length || bus.pax.length >= cfg.cap);
      // a delay (pigeon, haggis) starts counting once the bus has finished its own work: it genuinely adds to the dwell
      if (idle && bus.stuck > 0) bus.stuck -= dt;
      if (h.active && idle) {
        // the held bus sits there; the people on it do not enjoy it
        bus.held = true;
        sim.stats.heldPaxSec += bus.pax.length * dt;
        for (k5 = 0; k5 < bus.pax.length; k5++) {
          var px = bus.pax[k5]; px.held += dt;
          if (!px.complained && px.held > px.patHold) complain(px, 'held', st.i, bus.id);
        }
      }
      if (idle && !h.active && bus.stuck <= 0) depart(bus);
    }

    // ---- motion -----------------------------------------------------
    function runStep(bus, dt) {
      if (bus.stuck > 0) { bus.stuck -= dt; bus.speed = 0; return; }
      if (cfg.speedNoise > 0 && sim.t >= bus.nextSpeedAt) {
        bus.speedMult = 1 + cfg.speedNoise * (bus.rng() * 2 - 1);
        bus.nextSpeedAt = sim.t + 40 + bus.rng() * 40;
      }
      var vmax = cfg.vFree * slowFactor(bus.pos) * bus.speedMult;
      var step = vmax * dt, k6;
      var blocked = false;
      if (n > 1) {
        var lim = gapAhead(bus.id) - cfg.minGap;
        if (lim < step) { blocked = true; step = Math.max(0, lim); }
      }
      var ld = n > 1 ? leaderOf(bus.id) : null;
      for (k6 = 0; k6 < cfg.lights.length; k6++) {
        var lg = cfg.lights[k6];
        var dl = ((lg.pos - bus.pos) % L + L) % L;
        if (dl > L - 0.01) dl = 0;
        if (dl <= step + 1e-6 && lightRed(lg, sim.t)) step = Math.min(step, dl);
      }
      var dist = ((sim.stops[bus.ns].pos - bus.pos) % L + L) % L;
      if (dist > L - 0.01) dist = 0;
      var arrives = dist <= step + 1e-9;
      var joinQueue = !arrives && blocked && ld && ld.state === 'dwell' && ld.stop === bus.ns && dist <= cfg.reach;
      if (arrives) {
        bus.pos = sim.stops[bus.ns].pos; bus.dist += dist;
        bus.speed = dist / dt;
        arrive(bus, bus.ns);
        return;
      }
      if (joinQueue) { bus.speed = 0; arrive(bus, bus.ns); return; }
      bus.pos = (bus.pos + step) % L; bus.dist += step; bus.speed = step / dt;
    }

    // ---- the step ---------------------------------------------------
    sim.step = function (dtIn) {
      var dt = dtIn || cfg.dt, i2, j2, k7;
      var now = sim.t + dt;
      for (j2 = 0; j2 < N; j2++) {
        var st3 = sim.stops[j2];
        while (st3.nextArr <= now) {
          spawn(st3, st3.nextArr);
          st3.nextArr = nextArrival(st3, st3.nextArr, false);
        }
      }
      while (warnI < bursts.length && bursts[warnI].t - 90 <= now) { var bw = bursts[warnI++]; emit({ type: 'burstwarn', stop: bw.stop, n: bw.n, label: bw.label || '', inSec: 90 }); }
      while (burstI < bursts.length && bursts[burstI].t <= now) {
        var br = bursts[burstI++], bs = sim.stops[br.stop];
        for (k7 = 0; k7 < br.n; k7++) spawn(bs, br.t + k7 * 0.2);
        emit({ type: 'burst', stop: br.stop, n: br.n, label: br.label || '' });
      }
      while (incI < incScripted.length && incScripted[incI].t <= now) {
        var ic = incScripted[incI++], ib = sim.buses[ic.bus % n];
        ib.stuck += ic.dur; emit({ type: 'incident', bus: ib.id, dur: ic.dur, kind: ic.kind || 'pigeon' });
      }
      if (now >= nextRandInc) {
        var tpl = INCIDENTS[Math.floor(rngInc() * INCIDENTS.length)];
        var vb = sim.buses[Math.floor(rngInc() * n)];
        var idur = tpl.dur * (0.8 + rngInc() * 0.5);
        vb.stuck += idur;
        emit({ type: 'incident', bus: vb.id, dur: idur, kind: tpl.id });
        nextRandInc = now - Math.log(1 - rngInc()) / cfg.incidentRate;
      }
      for (j2 = 0; j2 < N; j2++) {
        var q = sim.stops[j2].queue;
        for (k7 = 0; k7 < q.length; k7++) {
          var p = q[k7];
          if (!p.complained && now - p.t > p.pat) complain(p, 'wait', j2, -1);
        }
      }
      for (i2 = 0; i2 < n; i2++) {
        var b = sim.buses[i2];
        if (b.state === 'dwell') dwellStep(b, dt); else runStep(b, dt);
      }
      sim.t = now;
      if (!sim.snap && sim.t >= cfg.duration * cfg.graceFrac) {
        sim.snap = { sumWait: sim.stats.sumWait, boarded: sim.stats.boarded, held: sim.stats.heldPaxSec };
      }
      analyse();
    };

    var lastSample = -1e9;
    function analyse() {
      var gaps = sim.gaps(), mean = L / n, s = 0, i3;
      var thr = 0.3 * mean, link = [];
      for (i3 = 0; i3 < n; i3++) { s += (gaps[i3] - mean) * (gaps[i3] - mean); link.push(gaps[i3] < thr); }
      sim.cv = n > 1 ? Math.sqrt(s / n) / mean : 0;
      sim.bunched = link;
      var maxC = 1, run = 1, start = -1, i4;
      for (i4 = 0; i4 < n; i4++) if (!link[i4]) { start = i4; break; }
      if (start >= 0) {
        for (i4 = 1; i4 <= n; i4++) {
          if (link[(start + i4) % n]) run++; else { if (run > maxC) maxC = run; run = 1; }
        }
      } else maxC = n;
      sim.maxConvoy = maxC;
      if (maxC > sim.stats.maxConvoy) sim.stats.maxConvoy = maxC;
      if (maxC > sim.convoyShown && maxC >= 2) { emit({ type: 'convoy', size: maxC }); sim.convoyShown = maxC; }
      else if (maxC < 2) sim.convoyShown = 1;
      else if (maxC < sim.convoyShown) sim.convoyShown = maxC;
      if (sim.t - lastSample >= 15) {
        lastSample = sim.t;
        sim.hist.push({ t: sim.t, g: sim.gapsTime(), cv: sim.cv });
        sim.stats.cvSum += sim.cv; sim.stats.cvN++;
      }
    }
    sim.gaps = function () {
      var g = [], i5;
      for (i5 = 0; i5 < n; i5++) g.push(n > 1 ? gapAhead(i5) : L);
      return g;
    };
    // gap to the bus ahead expressed as time (seconds of a typical lap)
    sim.gapsSec = function () {
      var g = sim.gaps(), sc = sim.Hest * n / L, out = [], i6;
      for (i6 = 0; i6 < n; i6++) out.push(g[i6] * sc);
      return out;
    };

    sim.holdTarget = function () { return sim.Hest * cfg.hwFactor; };
    // true time headway: when this bus passed its last stop, how long after the bus ahead had passed it
    sim.timeGap = function (id) {
      var b = sim.buses[id], ld = sim.buses[(id + 1) % n];
      if (n > 1 && b.lastPs >= 0) {
        var pl = sim.stops[b.lastPs].passT[ld.id];
        if (pl >= 0 && b.lastPt >= pl) return b.lastPt - pl;
      }
      return gapAhead(id) * sim.Hest * n / L;
    };
    sim.gapsTime = function () { var o = [], i9; for (i9 = 0; i9 < n; i9++) o.push(sim.timeGap(i9)); return o; };
    // seconds this bus is ahead of the printed timetable (positive: should wait)
    sim.aheadOfSchedule = function (id) { return (sim.buses[id].dist - cfg.vFree * cfg.ttSpeed * sim.t) / (cfg.vFree * cfg.ttSpeed); };
    sim.holdRemaining = function (b) {
      var h = b.hold; if (!h.active) return 0;
      var rem = h.left;
      if (h.mode === 'gap') { var pt = sim.stops[b.stop].passT[sim.leader(b.id)]; if (pt >= 0) rem = Math.min(rem, Math.max(0, h.target - (sim.t - pt))); }
      else if (h.mode === 'sched') rem = Math.min(rem, Math.max(0, sim.aheadOfSchedule(b.id)));
      return rem;
    };

    // ---- player levers ----------------------------------------------
    sim.toggleHold = function (id, mode) {
      var b = sim.buses[id];
      if (!b) return 'none';
      if (b.hold.active) { endHold(b, 'manual', false); return 'released'; }
      if (b.hold.armed) { b.hold.armed = false; b.hold.armMode = null; return 'disarmed'; }
      if (b.coolUntil > sim.t) { sim.stats.denied++; return 'cooling'; }
      if (sim.radioBusy() >= cfg.radioMax) { sim.stats.denied++; return 'busy'; }
      if (b.state === 'dwell') {
        b.hold.active = true; b.hold.startT = sim.t; b.hold.left = cfg.holdMax; b.hold.mode = mode || 'gap'; b.hold.target = sim.holdTarget(); sim.stats.holds++;
        emit({ type: 'holdstart', bus: id, stop: b.stop, auto: false }); return 'held';
      }
      b.hold.armed = true; b.hold.armMode = mode || 'gap';
      return 'armed';
    };
    sim.incident = function (id, dur, kind) {
      var b = sim.buses[id]; b.stuck += dur; emit({ type: 'incident', bus: id, dur: dur, kind: kind || 'pigeon' });
    };
    sim.leader = function (id) { return leaderOf(id).id; };
    sim.gapAhead = gapAhead;

    // ---- metrics ----------------------------------------------------
    sim.waitingNow = function () {
      var c = 0, s = 0, k8, j3;
      for (j3 = 0; j3 < N; j3++) {
        var q = sim.stops[j3].queue;
        c += q.length;
        for (k8 = 0; k8 < q.length; k8++) s += Math.max(0, sim.t - q[k8].t);
      }
      return { n: c, sum: s };
    };
    sim.onboard = function () { var c = 0; for (var i7 = 0; i7 < n; i7++) c += sim.buses[i7].pax.length; return c; };
    sim.metrics = function () {
      var S = sim.stats, w = sim.waitingNow(), i8;
      var sw = 0, nw = 0, sh = 0, sh2 = 0, nh = 0;
      for (i8 = 0; i8 < sim.win.length; i8++) {
        var q = sim.win[i8]; sw += q.sw; nw += q.nw; sh += q.sh; sh2 += q.sh2; nh += q.nh;
      }
      var meanWaitAll = (S.sumWait + w.sum) / Math.max(1, S.boarded + w.n);
      var wait = nw ? sw / nw : meanWaitAll;
      var meanH = nh ? sh / nh : sim.Hest;
      var formula = nh && sh > 0 ? sh2 / (2 * sh) : meanH / 2;
      var delay = (S.sumWait + w.sum + S.heldPaxSec) / Math.max(1, S.boarded + w.n);
      var z = sim.snap || { sumWait: 0, boarded: 0, held: 0 };
      var score = (S.sumWait - z.sumWait + w.sum + S.heldPaxSec - z.held ) / Math.max(1, S.boarded - z.boarded + w.n);
      return {
        score: score, t: sim.t, wait: meanWaitAll, waitWin: wait, evenWin: meanH / 2, formulaWin: formula, meanH: meanH,
        cv: sim.cv, cvAvg: S.cvN ? S.cvSum / S.cvN : 0, complaints: S.complaints, stranded: S.stranded,
        delivered: S.delivered, spawned: S.spawned, boarded: S.boarded, waiting: w.n, onboard: sim.onboard(),
        heldPaxSec: S.heldPaxSec, delay: delay, maxConvoy: S.maxConvoy, convoy: sim.maxConvoy,
        holds: S.holds, wasted: S.wasted, denied: S.denied
      };
    };
    sim.drain = function () { var e = sim.events; sim.events = []; return e; };
    sim.paxConserved = function () {
      return sim.stats.spawned === sim.waitingNow().n + sim.onboard() + sim.stats.delivered;
    };
    analyse();
    sim.hist.length = 0; sim.stats.cvSum = 0; sim.stats.cvN = 0; sim.stats.maxConvoy = sim.maxConvoy;
    sim.events.length = 0;
    return sim;
  }

  // ---- strategies: they use only the levers a player has -----------------
  function startAutoHold(sim, bus, st, mode, target, left) {
    bus.hold.active = true; bus.hold.startT = sim.t; bus.hold.mode = mode; bus.hold.target = target;
    bus.hold.left = Math.min(sim.cfg.holdMax, left || sim.cfg.holdMax); sim.stats.holds++;
    sim.events.push({ type: 'holdstart', bus: bus.id, stop: st.i, auto: true, t: sim.t });
  }
  function headwayRule(sim, bus, st, h, trigger, targetF) {
    var H = sim.Hest;
    if (h > 0 && h < H * trigger) startAutoHold(sim, bus, st, 'gap', H * targetF);
  }
  var AUTO = {
    // timetable holding: do not leave a stop ahead of a fixed printed schedule
    timetable: function (sim, bus, st) {
      if (sim.aheadOfSchedule(bus.id) > 4) startAutoHold(sim, bus, st, 'sched', 0);
    },
    // headway-based holding: do not leave until the bus ahead is a full headway away
    headway: function (sim, bus, st, h) { headwayRule(sim, bus, st, h, sim.cfg.hwFactor - 0.04, sim.cfg.hwFactor); },
    // half-hearted: only acts on near-collisions
    lazy: function (sim, bus, st, h) { headwayRule(sim, bus, st, h, 0.5, 0.75); },
    // naive: hold every bus for 20 s at every stop
    holdall: function (sim, bus, st) { startAutoHold(sim, bus, st, 'timed', 0, 20); }
  };
  // The Inspector: suggests holds. mode 'gap' (headway) or 'sched' (printed timetable).
  function suggest(sim, mode) {
    var out = [], H = sim.Hest, tg = sim.gapsTime();
    if (sim.radioBusy() >= sim.cfg.radioMax) return out;
    sim.buses.forEach(function (b) {
      if (b.hold.active || b.hold.armed || b.coolUntil > sim.t) return;
      var stopIdx = b.state === 'dwell' ? b.stop : b.ns;
      if (mode === 'sched') {
        var ah = sim.aheadOfSchedule(b.id);
        if (ah > 10) out.push({ bus: b.id, stop: stopIdx, gap: tg[b.id], ahead: ah, want: Math.min(sim.cfg.holdMax, ah), dwelling: b.state === 'dwell', mode: 'sched' });
      } else if (tg[b.id] < H * 0.62) {
        out.push({ bus: b.id, stop: stopIdx, gap: tg[b.id], want: Math.min(sim.cfg.holdMax, H * sim.cfg.hwFactor - tg[b.id]), dwelling: b.state === 'dwell', mode: 'gap' });
      }
    });
    out.sort(function (a, b) { return mode === 'sched' ? b.ahead - a.ahead : a.gap - b.gap; });
    // She is fallible: one suggestion in three she looks at the pair the wrong way round and
    // names the bus in FRONT (the one being chased) instead of the one doing the chasing.
    if (mode !== 'sched' && out.length && Math.floor(sim.t / 240) % 3 === 2) {
      var t = out[0], ld = sim.leader(t.bus), lb = sim.buses[ld];
      if (!lb.hold.active && !lb.hold.armed && lb.coolUntil <= sim.t) {
        out[0] = { bus: ld, stop: lb.state === 'dwell' ? lb.stop : lb.ns, gap: t.gap, chaser: t.bus, wrong: true, want: t.want, dwelling: lb.state === 'dwell', mode: 'gap' };
      }
    }
    return out;
  }

  // ---- levels -------------------------------------------------------------
  // stars: [1-star, 2-star, 3-star] lines on RATIO = your delay per passenger / the delay of doing nothing
  // on the very same shift (a hidden twin run). Calibrated over 40 replay seeds (tests/engine.test.mjs).
  var LEVELS = [
    {
      id: 0, name: 'Watch it happen', blurb: 'Six buses, perfectly spaced. One of them meets a pigeon.',
      watch: true, seed: 11, duration: 5400, speed: 8,
      cfg: { lambda: 0.024, incidents: [{ t: 2700, bus: 4, dur: 30, kind: 'haggis' }] }
    },
    {
      id: 1, name: 'Gentle Morning', blurb: 'Light demand, a few hiccups. Hold buses to restore even spacing.',
      seed: 21, duration: 5400, speed: 2, levers: ['hold'],
      cfg: { lambda: 0.02, speedNoise: 0.04, incidentRate: 1 / 700, incidents: [{ t: 30, bus: 1, dur: 60, kind: 'lollipop' }, { t: 400, bus: 4, dur: 40, kind: 'photo' }], bursts: [{ t: 2100, stop: 4, n: 16, label: 'School trip' }] }, stars: [0.9, 0.7, 0.5]
    },
    {
      id: 2, name: 'Rush Hour', blurb: 'More passengers, crush loads, and everything goes wrong faster.',
      seed: 32, duration: 5400, speed: 2, levers: ['hold'],
      cfg: { lambda: 0.028, speedNoise: 0.05, incidentRate: 1 / 600, incidents: [{ t: 30, bus: 1, dur: 60, kind: 'lollipop' }, { t: 300, bus: 4, dur: 45, kind: 'haggis' }], bursts: [{ t: 1900, stop: 8, n: 24, label: 'Football crowd' }, { t: 3600, stop: 2, n: 20, label: 'Concert lets out' }] }, stars: [0.88, 0.69, 0.52]
    },
    {
      id: 3, name: 'Festival Fortnight', blurb: 'Crowds at three stops. The rest of the route gets the leftovers.',
      seed: 43, duration: 6000, speed: 2, levers: ['hold'],
      cfg: {
        lambda: 0.018, speedNoise: 0.05, incidentRate: 1 / 700, incidents: [{ t: 30, bus: 2, dur: 60, kind: 'bagpipes' }],
        demandMult: [1, 1, 1, 3.2, 1, 1, 3.4, 1, 1, 1, 3, 1],
        bursts: [{ t: 900, stop: 6, n: 22, label: 'Fringe show lets out' }, { t: 2400, stop: 3, n: 26, label: 'Tattoo lets out' }, { t: 3900, stop: 10, n: 22, label: 'Comedy gig lets out' }]
      }, stars: [0.86, 0.67, 0.5]
    },
    {
      id: 4, name: 'Roadworks', blurb: 'Temporary lights and a crawl lane. Tram works, but for no tram.',
      seed: 54, duration: 6000, speed: 2, levers: ['hold'],
      cfg: {
        lambda: 0.024, speedNoise: 0.05, incidentRate: 1 / 800, incidents: [{ t: 30, bus: 1, dur: 60, kind: 'wheelie' }], bursts: [{ t: 2500, stop: 7, n: 20, label: 'Coach party' }],
        lights: [{ pos: 1250, period: 120, red: 50, offset: 0 }, { pos: 4250, period: 150, red: 70, offset: 40 }],
        slow: [{ from: 2700, to: 3700, factor: 0.4 }]
      }, stars: [0.84, 0.66, 0.5]
    },
    {
      id: 5, name: "The Dispatcher's Nightmare", blurb: 'All of it at once. Good luck. Mind the haggis.',
      seed: 65, duration: 7200, speed: 2, levers: ['hold'],
      cfg: {
        lambda: 0.02, speedNoise: 0.06, incidentRate: 1 / 420, incidents: [{ t: 30, bus: 1, dur: 60, kind: 'seagull' }, { t: 500, bus: 4, dur: 40, kind: 'haggis' }],
        demandMult: [1, 1, 1, 2.6, 1, 1, 2.8, 1, 1, 1, 2.4, 1],
        bursts: [{ t: 1200, stop: 6, n: 24, label: 'Fringe show lets out' }, { t: 3000, stop: 3, n: 28, label: 'Tattoo lets out' }, { t: 5000, stop: 10, n: 24, label: 'Comedy gig lets out' }],
        lights: [{ pos: 1250, period: 120, red: 50, offset: 0 }, { pos: 4250, period: 150, red: 70, offset: 40 }],
        slow: [{ from: 2700, to: 3700, factor: 0.45 }]
      }, stars: [0.82, 0.64, 0.49]
    }
  ];

  function levelConfig(level, over) {
    var c = {}, k9;
    for (k9 in level.cfg) c[k9] = level.cfg[k9];
    c.seed = level.seed; c.duration = level.duration;
    for (k9 in (over || {})) c[k9] = over[k9];
    return c;
  }

  function runHeadless(cfg, auto, seconds) {
    var c = {}, k10;
    for (k10 in cfg) c[k10] = cfg[k10];
    c.auto = auto || null;
    var sim = createSim(c), steps = Math.round((seconds || c.duration || 6000) / sim.cfg.dt), s;
    for (s = 0; s < steps; s++) sim.step();
    return sim;
  }

  // stars: [1-star line, 2-star line, 3-star line] on delay per passenger; doing nothing earns none
  function ratioOf(sim, base) { return sim.metrics().score / Math.max(1e-9, base.metrics().score); }
  function starsFor(level, ratio) {
    if (!level || !level.stars) return 1;
    var t = level.stars;
    if (ratio <= t[2]) return 3;
    if (ratio <= t[1]) return 2;
    if (ratio <= t[0]) return 1;
    return 0;
  }

  root.Bunched = {
    createSim: createSim, runHeadless: runHeadless, suggest: suggest, starsFor: starsFor, ratioOf: ratioOf,
    levelConfig: levelConfig, LEVELS: LEVELS, STOP_NAMES: STOP_NAMES, NAMES: NAMES, INCIDENTS: INCIDENTS,
    DEFAULTS: DEFAULTS, mulberry32: mulberry32, AUTO: AUTO
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
