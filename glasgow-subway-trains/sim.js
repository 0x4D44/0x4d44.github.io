/* Stadler METRO lap model for the outer circle. Everything here is a MODEL (confidence L):
   inputs from the Stadler datasheet (130 kN to 23 km/h, 820 kW max at wheel, 1.3 m/s2 gross),
   the OSM-derived loop (GEO) with a modelled vertical profile, and stated assumptions. */
(function (root) {
  'use strict';
  var G = 9.81;
  var DEFAULTS = {
    tare: 67,        // t, derived from 12 axles x 7.5 t = 90 t crush minus 310 passengers x 75 kg
    pax: 100,        // passengers on board
    paxKg: 75,
    rot: 1.08,       // rotating-mass allowance
    teMax: 130e3,    // N, starting tractive effort (datasheet)
    pMax: 820e3,     // W at wheel, max (datasheet)
    aCap: 1.3,       // m/s2 (datasheet, gross starting acceleration)
    decel: 1.0,      // m/s2 service braking (ESTIMATE)
    eta: 0.86,       // wheel-to-rail efficiency, motoring (ESTIMATE)
    etaR: 0.80,      // rail-from-wheel efficiency, regenerating (ESTIMATE)
    recv: 0.5,       // fraction of regenerated energy that another train or load can absorb (ASSUMPTION)
    aux: 25,         // kW per train: HVAC, lighting, compressors, control (ESTIMATE)
    cdA: 8,          // m2 effective drag area in a ~70%-blockage tunnel (ESTIMATE)
    roll: 0.0025,    // rolling resistance coefficient (ESTIMATE)
    dwell: 25,       // s, from the Explorer data
    vcap: 58         // km/h, train maximum
  };

  function mass(p) { return (p.tare + p.pax * p.paxKg / 1000) * 1000; } // kg
  function resist(p, v) { var m = mass(p); return m * G * p.roll + 0.5 * 1.2 * p.cdA * v * v; }
  function teCurve(p, v) { return v < 0.1 ? p.teMax : Math.min(p.teMax, p.pMax / v); }

  function interp(arr, step, s) {
    var f = s / step, i = Math.floor(f);
    if (i < 0) return arr[0];
    if (i >= arr.length - 1) return arr[arr.length - 1];
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  }
  function makeProfile(geo) {
    var L = geo.len, n = geo.prof.length, step = geo.profStep;
    // loop: wrap
    function y(s) { s = ((s % L) + L) % L; if (s > (n - 1) * step) { var t = (s - (n - 1) * step) / (L - (n - 1) * step); return geo.prof[n - 1] + (geo.prof[0] - geo.prof[n - 1]) * t; } return interp(geo.prof, step, s); }
    function grade(s) { var h = 15; return (y(s + h) - y(s - h)) / (2 * h); }
    return { y: y, grade: grade };
  }
  function limitAt(geo, s) {
    s = ((s % geo.len) + geo.len) % geo.len;
    var L = geo.limits;
    for (var i = 0; i < L.length; i++) if (s >= L[i][0] && s < L[i][1]) return L[i][2];
    return 25;
  }

  /* simulate one inter-station run from s0 to s1 (s1 may exceed len for the last leg) */
  function run(geo, prof, p, s0, s1, ds) {
    ds = ds || 2;
    var n = Math.max(2, Math.round((s1 - s0) / ds)); ds = (s1 - s0) / n;
    var m = mass(p), me = m * p.rot, vcap = p.vcap / 3.6;
    var lim = new Array(n + 1), gr = new Array(n + 1), i;
    for (i = 0; i <= n; i++) {
      var s = s0 + i * ds;
      lim[i] = Math.min(vcap, limitAt(geo, s) / 3.6);
      gr[i] = prof.grade(s);
    }
    lim[0] = 0; lim[n] = 0;
    var vf = new Array(n + 1), vb = new Array(n + 1);
    vf[0] = 0;
    for (i = 0; i < n; i++) {
      var v = vf[i], F = teCurve(p, Math.max(v, 0.3)) - resist(p, v) - m * G * gr[i];
      var a = Math.min(p.aCap, F / me);
      var v2 = v * v + 2 * Math.max(a, 0) * ds;
      if (i === 0 && v2 < 1e-6) v2 = 2 * p.aCap * ds;
      vf[i + 1] = Math.min(Math.sqrt(v2), lim[i + 1]);
    }
    vb[n] = 0;
    for (i = n; i > 0; i--) vb[i - 1] = Math.min(lim[i - 1], Math.sqrt(vb[i] * vb[i] + 2 * p.decel * ds));
    var out = { s: [], v: [], t: [], P: [], lim: [], grade: [], n: n };
    var t = 0, v_ = [], Eplus = 0, Eneg = 0, Eaux = 0;
    for (i = 0; i <= n; i++) v_[i] = Math.min(vf[i], vb[i], lim[i]);
    var Ptr = [];
    for (i = 0; i <= n; i++) {
      var vi = v_[i];
      out.s.push(s0 + i * ds); out.v.push(vi * 3.6); out.t.push(t); out.lim.push(lim[i] * 3.6); out.grade.push(gr[i] * 100);
      if (i < n) {
        var vn = v_[i + 1], vm = (vi + vn) / 2;
        var dt = (vi + vn) > 0 ? 2 * ds / (vi + vn) : 0;
        var acc = (vn * vn - vi * vi) / (2 * ds);
        var Fw = me * acc + m * G * gr[i] + resist(p, vm);
        var Pw = Fw * vm; // W at wheel
        var Pel;
        if (Pw >= 0) Pel = Pw / p.eta + p.aux * 1000;
        else {
          var fade = Math.max(0, Math.min(1, (vm - 1.0) / 2.0)); // electric brake fades below ~11 km/h
          Pel = Pw * p.etaR * fade + p.aux * 1000;
        }
        Ptr.push(Pel);
        t += dt;
        var dE = Pel * dt;
        if (Pel - p.aux * 1000 >= 0) Eplus += (Pel - p.aux * 1000) * dt; else Eneg += (Pel - p.aux * 1000) * dt;
        Eaux += p.aux * 1000 * dt;
      } else Ptr.push(Ptr[Ptr.length - 1] || 0);
    }
    out.P = Ptr.map(function (x) { return x / 1000; }); // kW
    out.time = t; out.Eplus = Eplus; out.Eneg = Eneg; out.Eaux = Eaux; // J
    return out;
  }

  /* whole outer circle: 15 runs + dwells */
  function lap(geo, p) {
    p = Object.assign({}, DEFAULTS, p || {});
    var prof = makeProfile(geo), st = geo.stations, runs = [], i, N = st.length;
    var Ptot = { s: [], v: [], t: [], P: [], lim: [], grade: [] };
    var t0 = 0, Eplus = 0, Eneg = 0, Eaux = 0, dwellE = 0;
    for (i = 0; i < N; i++) {
      var a = st[i].sOuter, b = st[(i + 1) % N].sOuter + (i === N - 1 ? geo.len : 0);
      var r = run(geo, prof, p, a, b, 2);
      r.from = i; r.to = (i + 1) % N;
      runs.push(r);
      for (var k = 0; k < r.s.length; k++) {
        Ptot.s.push(r.s[k]); Ptot.v.push(r.v[k]); Ptot.t.push(t0 + r.t[k]); Ptot.P.push(r.P[k]); Ptot.lim.push(r.lim[k]); Ptot.grade.push(r.grade[k]);
      }
      t0 += r.time + p.dwell;
      Eplus += r.Eplus; Eneg += r.Eneg; Eaux += r.Eaux; dwellE += p.aux * 1000 * p.dwell;
    }
    var Eauxall = Eaux + dwellE;
    var used = -Eneg * p.recv;
    var net = Eplus + Eauxall - used;
    var run_t = runs.reduce(function (s, r) { return s + r.time; }, 0);
    return {
      p: p, runs: runs, trace: Ptot, lapTime: t0, runTime: run_t, dwellTime: p.dwell * N,
      tractionKWh: Eplus / 3.6e6, regenOfferedKWh: -Eneg / 3.6e6, regenUsedKWh: used / 3.6e6, auxKWh: Eauxall / 3.6e6,
      netKWh: net / 3.6e6, grossKWh: (Eplus + Eauxall) / 3.6e6,
      km: geo.len / 1000, mass: mass(p) / 1000
    };
  }

  root.SIM = { DEFAULTS: DEFAULTS, lap: lap, run: run, makeProfile: makeProfile, teCurve: teCurve, resist: resist, mass: mass, limitAt: limitAt };
})(typeof window !== 'undefined' ? window : globalThis);
