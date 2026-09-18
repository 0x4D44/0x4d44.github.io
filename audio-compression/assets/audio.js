/* ============================================================
   THROWING SOUND AWAY — the sound kit.

   Every sound on this site is synthesised in the browser from nothing: there
   is not one audio file in the repository, which is the only honest way to
   write about compression and also the only way to keep the page offline.

   window.AUD gives you
     AUD.ctx()                   the shared AudioContext (created on gesture)
     AUD.play(x, opts)           play a Float array, returns a handle with .stop()
     AUD.stopAll()
     AUD.src.<name>(dur, opts)   procedural sources: tone, noise, castanets,
                                 pluck, bell, music, vowel, speech, applause…
     AUD.quantize(x, bits, dither)
     AUD.resample(x, from, to)
     AUD.codec(x, opts)          a small but genuine perceptual MDCT codec:
                                 Bark bands, a masking threshold, a global
                                 offset bisected to hit a bit budget, a
                                 power-law quantiser and an entropy estimate.
                                 It really does produce pre-echo and birdies.
     AUD.abx(a, b)               a three-button ABX harness

   Nothing here touches the network.
   ============================================================ */
(function () {
  "use strict";

  var D = window.DSP;
  var ctx = null, playing = [];

  function audioCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  // Any gesture is enough to let a context start; browsers block it otherwise.
  ["pointerdown", "keydown"].forEach(function (e) {
    window.addEventListener(e, function () { if (ctx && ctx.state === "suspended") ctx.resume(); }, { passive: true });
  });

  function rate() { var c = audioCtx(); return c ? c.sampleRate : 48000; }

  function toBuffer(x, sr) {
    var c = audioCtx();
    if (!c) return null;
    var n = x.length;
    var b = c.createBuffer(1, n, sr || c.sampleRate);
    var d = b.getChannelData(0), i;
    for (i = 0; i < n; i++) d[i] = Math.max(-1, Math.min(1, x[i]));
    return b;
  }

  // play(x, {gain, loop, sr, onended}) -> {stop(), node}
  function play(x, o) {
    o = o || {};
    var c = audioCtx();
    if (!c) return { stop: function () {} };
    var buf = x instanceof AudioBuffer ? x : toBuffer(x, o.sr);
    if (!buf) return { stop: function () {} };
    var s = c.createBufferSource();
    s.buffer = buf;
    s.loop = !!o.loop;
    var g = c.createGain();
    g.gain.value = o.gain == null ? 0.85 : o.gain;
    s.connect(g); g.connect(c.destination);
    var handle = {
      node: s, gain: g,
      stop: function () {
        try { s.stop(); } catch (e) { /* already stopped */ }
        var i = playing.indexOf(handle);
        if (i >= 0) playing.splice(i, 1);
      },
    };
    s.onended = function () {
      var i = playing.indexOf(handle);
      if (i >= 0) playing.splice(i, 1);
      if (o.onended) o.onended();
    };
    playing.push(handle);
    s.start();
    return handle;
  }
  function stopAll() { playing.slice().forEach(function (h) { h.stop(); }); }

  // Two channels, for the stereo-image demonstrations. Same handle contract.
  function playStereo(l, r, o) {
    o = o || {};
    var c = audioCtx();
    if (!c) return { stop: function () {} };
    var n = Math.min(l.length, r.length);
    var buf = c.createBuffer(2, n, o.sr || c.sampleRate);
    var L = buf.getChannelData(0), R = buf.getChannelData(1), i;
    for (i = 0; i < n; i++) {
      L[i] = Math.max(-1, Math.min(1, l[i]));
      R[i] = Math.max(-1, Math.min(1, r[i]));
    }
    return play(buf, o);
  }

  // A play/stop button that owns exactly one voice and keeps its own label.
  // wire(btn, makeSignal, opts) — makeSignal() returns a Float array.
  function wire(btn, makeSignal, o) {
    o = o || {};
    var h = null;
    if (!btn) return { stop: function () {} };
    btn.addEventListener("click", function () {
      if (h) { h.stop(); h = null; btn.classList.remove("on"); return; }
      stopAll();
      document.querySelectorAll(".btn.play.on").forEach(function (b) { b.classList.remove("on"); });
      var sig = makeSignal();
      if (!sig || !sig.length) return;
      btn.classList.add("on");
      h = play(sig, Object.assign({}, o, {
        onended: function () { h = null; btn.classList.remove("on"); if (o.onended) o.onended(); },
      }));
    });
    return { stop: function () { if (h) { h.stop(); h = null; btn.classList.remove("on"); } } };
  }

  // ---------------------------------------------------------- envelopes
  function adsr(n, sr, a, d, s, r) {
    var env = new Float64Array(n), i;
    var na = a * sr, nd = d * sr, nr = r * sr, ns = Math.max(0, n - na - nd - nr);
    for (i = 0; i < n; i++) {
      if (i < na) env[i] = i / Math.max(na, 1);
      else if (i < na + nd) env[i] = 1 + (s - 1) * (i - na) / Math.max(nd, 1);
      else if (i < na + nd + ns) env[i] = s;
      else env[i] = s * Math.max(0, 1 - (i - na - nd - ns) / Math.max(nr, 1));
    }
    return env;
  }
  function fadeEdges(x, sr, ms) {
    var n = Math.round((ms == null ? 8 : ms) * sr / 1000), i;
    for (i = 0; i < n && i < x.length; i++) {
      var g = i / n;
      x[i] *= g; x[x.length - 1 - i] *= g;
    }
    return x;
  }
  // A deterministic white-noise source: figures must look the same on reload.
  function prng(seed) {
    var s = seed || 12345;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296 * 2 - 1;
    };
  }

  // ---------------------------------------------------------- sources
  var src = {
    silence: function (dur, o) { return new Float64Array(Math.round((o && o.sr || rate()) * dur)); },

    tone: function (dur, o) {
      o = o || {}; var sr = o.sr || rate(), n = Math.round(sr * dur);
      var x = new Float64Array(n), f = o.f || 1000, a = o.amp == null ? 0.6 : o.amp, i;
      for (i = 0; i < n; i++) x[i] = a * Math.sin(2 * Math.PI * f * i / sr + (o.phase || 0));
      return fadeEdges(x, sr, o.fade == null ? 12 : o.fade);
    },

    // Sum of harmonics with 1/k^tilt amplitudes — a cheap "instrument".
    harmonics: function (dur, o) {
      o = o || {}; var sr = o.sr || rate(), n = Math.round(sr * dur);
      var x = new Float64Array(n), f = o.f || 220, k, i, K = o.n || 12, tilt = o.tilt == null ? 1 : o.tilt;
      for (k = 1; k <= K; k++) {
        if (f * k > sr / 2 * 0.95) break;
        var a = Math.pow(k, -tilt);
        for (i = 0; i < n; i++) x[i] += a * Math.sin(2 * Math.PI * f * k * i / sr);
      }
      D.normalize(x, o.amp == null ? 0.6 : o.amp);
      return fadeEdges(x, sr, 10);
    },

    sweep: function (dur, o) {
      o = o || {}; var sr = o.sr || rate(), n = Math.round(sr * dur);
      var x = new Float64Array(n), f0 = o.f0 || 50, f1 = o.f1 || 18000, i, ph = 0;
      var logs = o.log !== false;
      for (i = 0; i < n; i++) {
        var t = i / n;
        var f = logs ? f0 * Math.pow(f1 / f0, t) : f0 + (f1 - f0) * t;
        ph += 2 * Math.PI * f / sr;
        x[i] = (o.amp == null ? 0.5 : o.amp) * Math.sin(ph);
      }
      return fadeEdges(x, sr, 20);
    },

    // White, or band-limited by a simple 2-pole resonant band-pass cascade.
    noise: function (dur, o) {
      o = o || {}; var sr = o.sr || rate(), n = Math.round(sr * dur);
      var r = prng(o.seed), x = new Float64Array(n), i;
      for (i = 0; i < n; i++) x[i] = r();
      if (o.band) x = bandpass(x, sr, o.band[0], o.band[1], o.order || 4);
      D.normalize(x, o.amp == null ? 0.5 : o.amp);
      return fadeEdges(x, sr, o.fade == null ? 10 : o.fade);
    },

    // Very short, very sharp clicks over silence — the classic pre-echo probe.
    castanets: function (dur, o) {
      o = o || {}; var sr = o.sr || rate(), n = Math.round(sr * dur);
      var x = new Float64Array(n), r = prng(o.seed || 7);
      var hits = o.hits || [0.30, 0.46, 0.53, 0.78];
      hits.forEach(function (t) {
        var start = Math.round(t * n), len = Math.round(sr * (o.len || 0.018)), i;
        for (i = 0; i < len && start + i < n; i++) {
          var e = Math.exp(-i / (sr * 0.0035));
          // two woody resonances plus noise: dry, bright, near-instant attack
          x[start + i] += e * (0.6 * Math.sin(2 * Math.PI * 2600 * i / sr)
            + 0.4 * Math.sin(2 * Math.PI * 5400 * i / sr) + 0.55 * r());
        }
      });
      D.normalize(x, o.amp == null ? 0.82 : o.amp);
      return x;
    },

    // Karplus-Strong: a plucked string, cheap and convincingly musical.
    pluck: function (dur, o) {
      o = o || {}; var sr = o.sr || rate(), n = Math.round(sr * dur), f = o.f || 220;
      var L = Math.max(2, Math.round(sr / f)), buf = new Float64Array(L), r = prng(o.seed || 3), i;
      for (i = 0; i < L; i++) buf[i] = r();
      var x = new Float64Array(n), p = 0, damp = o.damp == null ? 0.996 : o.damp;
      for (i = 0; i < n; i++) {
        var nxt = (p + 1) % L;
        var v = damp * 0.5 * (buf[p] + buf[nxt]);
        x[i] = buf[p];
        buf[p] = v;
        p = nxt;
      }
      D.normalize(x, o.amp == null ? 0.6 : o.amp);
      return fadeEdges(x, sr, 6);
    },

    // Struck metal: inharmonic partials with long, unequal decays.
    bell: function (dur, o) {
      o = o || {}; var sr = o.sr || rate(), n = Math.round(sr * dur), f = o.f || 520;
      var ratios = [0.56, 0.92, 1.19, 1.71, 2, 2.74, 3, 3.76, 4.07];
      var x = new Float64Array(n), j, i;
      for (j = 0; j < ratios.length; j++) {
        var fr = f * ratios[j];
        if (fr > sr / 2 * 0.95) continue;
        var tau = (o.decay || 1.4) / (1 + j * 0.5);
        for (i = 0; i < n; i++) x[i] += Math.exp(-i / (sr * tau)) * Math.sin(2 * Math.PI * fr * i / sr) / (1 + j);
      }
      D.normalize(x, o.amp == null ? 0.7 : o.amp);
      return fadeEdges(x, sr, 5);
    },

    // A short musical phrase with a bright transient on every beat: plucked
    // notes, a bell, and a hi-hat. Wideband and percussive, i.e. the kind of
    // material that shows a codec up.
    music: function (dur, o) {
      o = o || {}; var sr = o.sr || rate(), n = Math.round(sr * (dur || 2.4));
      var x = new Float64Array(n);
      var notes = o.notes || [220, 277.18, 329.63, 440, 329.63, 277.18, 440, 554.37];
      var step = n / notes.length, i, k;
      notes.forEach(function (f, idx) {
        var p = src.pluck(Math.min(0.9, (dur || 2.4) / notes.length * 2.2), { f: f, sr: sr, seed: 3 + idx });
        var start = Math.round(idx * step);
        for (i = 0; i < p.length && start + i < n; i++) x[start + i] += p[i] * 0.55;
      });
      var b = src.bell(Math.min(1.8, dur || 2.4), { f: 880, sr: sr, decay: 0.9 });
      for (i = 0; i < b.length && i < n; i++) x[i] += b[i] * 0.22;
      // hi-hat: 8 kHz+ noise bursts, which is exactly where birdies live
      var r = prng(11);
      for (k = 0; k < notes.length * 2; k++) {
        var s0 = Math.round(k * step / 2), len = Math.round(sr * 0.05);
        for (i = 0; i < len && s0 + i < n; i++) {
          x[s0 + i] += 0.3 * Math.exp(-i / (sr * 0.008)) * r() * (k % 2 ? 0.5 : 1);
        }
      }
      D.normalize(x, o.amp == null ? 0.8 : o.amp);
      return fadeEdges(x, sr, 15);
    },

    // Source-filter speech, built additively so the formant structure is exact
    // and checkable rather than whatever a cascade of biquads happens to do.
    // Each harmonic of f0 is given the glottal source's -6 dB/octave slope (the
    // -12 dB/oct of the source plus the +6 dB/oct of lip radiation) and then
    // the magnitude of the vocal tract's poles evaluated at that frequency, so
    // a spectrum plot really does show the formants where they were asked for
    // and linear prediction really does recover them.
    // formants: [[f, bw], ...]. Defaults are a neutral /a/.
    vowel: function (dur, o) {
      o = o || {}; var sr = o.sr || rate(), n = Math.round(sr * dur);
      var f0 = o.f0 || 120, F = o.formants || [[730, 90], [1090, 110], [2440, 140], [3400, 200]];
      var i, k, j;

      // |1/A_j(e^jw)| for one pole pair, UNnormalised. Normalising each
      // resonance to its own peak would be wrong: in a cascade the skirts
      // multiply, and per-resonance normalisation buries F3 and F4 eighty
      // decibels down instead of the twenty or thirty a real tract gives. The
      // whole product is normalised once, at the end.
      function poleMag(f, fc, bw) {
        var r = Math.exp(-Math.PI * bw / sr), th = 2 * Math.PI * fc / sr;
        var a1 = -2 * r * Math.cos(th), a2 = r * r;
        var wq = 2 * Math.PI * f / sr;
        var re = 1 + a1 * Math.cos(wq) + a2 * Math.cos(2 * wq);
        var im = -(a1 * Math.sin(wq) + a2 * Math.sin(2 * wq));
        return 1 / Math.max(Math.hypot(re, im), 1e-12);
      }

      if (o.whisper) {
        var r2 = prng(5), noise = new Float64Array(n), wout = new Float64Array(n);
        for (i = 0; i < n; i++) noise[i] = r2();
        F.forEach(function (fb, kk) {
          var y = resonator(noise, sr, fb[0], fb[1]);
          for (i = 0; i < n; i++) wout[i] += y[i] * Math.pow(0.72, kk);
        });
        D.normalize(wout, o.amp == null ? 0.7 : o.amp);
        return fadeEdges(wout, sr, 15);
      }

      var nH = Math.max(1, Math.floor(sr / 2 * 0.92 / f0));
      var amp = new Float64Array(nH + 1), ph = new Float64Array(nH + 1), amax = 0;
      for (k = 1; k <= nH; k++) {
        var f = k * f0, a = 1 / k;                      // net -6 dB/octave source
        for (j = 0; j < F.length; j++) a *= poleMag(f, F[j][0], F[j][1]);
        amp[k] = a;
        if (a > amax) amax = a;
        // Schroeder phases: periodic, but without the crest factor of an
        // all-cosine pulse train, which would normalise down to nothing.
        ph[k] = -Math.PI * k * k / nH;
      }
      for (k = 1; k <= nH; k++) amp[k] /= (amax || 1);
      var out = new Float64Array(n), vib = o.vibrato || 0, glide = o.glide || 0;
      var acc = 0;
      for (i = 0; i < n; i++) {
        var fi = f0 * (1 + vib * Math.sin(2 * Math.PI * 5 * i / sr)) * (1 + glide * i / n);
        acc += 2 * Math.PI * fi / sr;
        var sVal = 0;
        for (k = 1; k <= nH; k++) {
          if (amp[k] < 1e-5) continue;                  // inaudible harmonic
          sVal += amp[k] * Math.sin(k * acc + ph[k]);
        }
        out[i] = sVal;
      }
      // A little aspiration, shaped by the same tract. Real voicing is never
      // noiseless, and without it an order-16 predictor fits a sum of a dozen
      // sinusoids exactly and reports an infinite prediction gain.
      var rn = prng(o.seed || 17), nz = new Float64Array(n), shaped = new Float64Array(n);
      for (i = 0; i < n; i++) nz[i] = rn();
      F.forEach(function (fb, kk) {
        var y = resonator(nz, sr, fb[0], fb[1]);
        for (i = 0; i < n; i++) shaped[i] += y[i] * Math.pow(0.8, kk);
      });
      // Keep the aspiration below about 6 kHz. Left broadband it dominates the
      // top of the spectrum, where the harmonics have died away, and an
      // order-16 predictor then spends its poles on the noise instead of on the
      // formants — visibly, in the Opus chapter's figure.
      shaped = lowpassFFT(shaped, sr, 6000).subarray(0, n);
      var gs = D.rms(out) * (o.aspiration == null ? 0.005 : o.aspiration) / Math.max(D.rms(shaped), 1e-12);
      for (i = 0; i < n; i++) out[i] += shaped[i] * gs;
      D.normalize(out, o.amp == null ? 0.7 : o.amp);
      return fadeEdges(out, sr, 15);
    },

    // A short "sentence": vowels joined by fricatives. Nonsense, but it has the
    // spectral and temporal statistics speech coders are tuned for.
    speech: function (dur, o) {
      o = o || {}; var sr = o.sr || rate(); dur = dur || 2.0;
      var seq = [
        { t: "v", d: 0.20, f: [[660, 90], [1720, 110], [2410, 140], [3300, 200]] },  // /ae/
        { t: "f", d: 0.07, band: [3500, 8000] },                                     // /s/
        { t: "v", d: 0.16, f: [[300, 70], [870, 100], [2240, 130], [3300, 200]] },   // /u/
        { t: "s", d: 0.05 },
        { t: "v", d: 0.22, f: [[530, 80], [1840, 110], [2480, 140], [3400, 200]] },  // /e/
        { t: "f", d: 0.06, band: [2000, 6000] },                                     // /sh/
        { t: "v", d: 0.24, f: [[730, 90], [1090, 110], [2440, 140], [3400, 200]] },  // /a/
      ];
      var total = seq.reduce(function (s, p) { return s + p.d; }, 0);
      var scale = dur / total, out = [], f0 = o.f0 || 118;
      seq.forEach(function (p, i) {
        var d = p.d * scale;
        if (p.t === "v") out.push(src.vowel(d, { sr: sr, f0: f0 * (1 - i * 0.02), formants: p.f, glide: -0.08 }));
        else if (p.t === "f") out.push(src.noise(d, { sr: sr, band: p.band, amp: 0.22, seed: 9 + i, fade: 4 }));
        else out.push(new Float64Array(Math.round(sr * d)));
      });
      var n = out.reduce(function (s, a) { return s + a.length; }, 0);
      var x = new Float64Array(n), at = 0;
      out.forEach(function (a) { x.set(a, at); at += a.length; });
      D.normalize(x, o.amp == null ? 0.75 : o.amp);
      return fadeEdges(x, sr, 12);
    },

    // A deliberately wide stereo pair: the same phrase in both channels, plus a
    // decorrelated diffuse component made from two different comb-filtered noise
    // seeds. Collapsing the side channel is then plainly audible.
    stereoPair: function (dur, o) {
      o = o || {}; var sr = o.sr || rate();
      var mono = src.music(dur || 2.2, { sr: sr, amp: 0.62 });
      var n = mono.length, L = new Float64Array(n), R = new Float64Array(n), i, k;
      var ra = prng(31), rb = prng(97);
      var da = new Float64Array(n), db = new Float64Array(n);
      for (i = 0; i < n; i++) { da[i] = ra(); db[i] = rb(); }
      // two different short comb delays give each ear a different room
      var taps = [[Math.round(sr * 0.011), 0.5], [Math.round(sr * 0.019), 0.36], [Math.round(sr * 0.029), 0.24]];
      var tapsB = [[Math.round(sr * 0.013), 0.5], [Math.round(sr * 0.023), 0.36], [Math.round(sr * 0.037), 0.24]];
      for (i = 0; i < n; i++) {
        var a = 0, b = 0;
        for (k = 0; k < taps.length; k++) {
          var ia = i - taps[k][0], ib = i - tapsB[k][0];
          if (ia >= 0) a += mono[ia] * taps[k][1] * da[i] * 0.9;
          if (ib >= 0) b += mono[ib] * tapsB[k][1] * db[i] * 0.9;
        }
        L[i] = mono[i] * 0.72 + a * 1.35;
        R[i] = mono[i] * 0.72 + b * 1.35;
      }
      var g = 0.8 / Math.max(D.peak(L), D.peak(R), 1e-9);
      for (i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
      return { l: fadeEdges(L, sr, 15), r: fadeEdges(R, sr, 15) };
    },

    // Dense, uncorrelated transients — the material that breaks codecs.
    applause: function (dur, o) {
      o = o || {}; var sr = o.sr || rate(), n = Math.round(sr * (dur || 2));
      var x = new Float64Array(n), r = prng(o.seed || 21), i, k;
      var claps = o.claps || Math.round(n / sr * 90);
      for (k = 0; k < claps; k++) {
        var s0 = Math.round((r() * 0.5 + 0.5) * (n - 1));
        var len = Math.round(sr * 0.012), amp = 0.35 + 0.65 * (r() * 0.5 + 0.5);
        for (i = 0; i < len && s0 + i < n; i++) x[s0 + i] += amp * Math.exp(-i / (sr * 0.0022)) * r();
      }
      x = bandpass(x, sr, 700, 9000, 2);
      D.normalize(x, o.amp == null ? 0.7 : o.amp);
      return fadeEdges(x, sr, 20);
    },
  };

  // ---------------------------------------------------------- tiny filters
  function resonator(x, sr, f, bw) {
    var n = x.length, y = new Float64Array(n), i;
    var r = Math.exp(-Math.PI * bw / sr), th = 2 * Math.PI * f / sr;
    var a1 = 2 * r * Math.cos(th), a2 = -r * r;
    var g = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * th) + r * r);
    for (i = 0; i < n; i++) {
      y[i] = g * x[i] + a1 * (i >= 1 ? y[i - 1] : 0) + a2 * (i >= 2 ? y[i - 2] : 0);
    }
    return y;
  }
  function onePole(x, sr, fc, high) {
    var n = x.length, y = new Float64Array(n), i;
    var a = Math.exp(-2 * Math.PI * fc / sr), prev = 0;
    for (i = 0; i < n; i++) { prev = (1 - a) * x[i] + a * prev; y[i] = high ? x[i] - prev : prev; }
    return y;
  }
  function bandpass(x, sr, lo, hi, order) {
    var y = x, k;
    for (k = 0; k < (order || 2); k++) {
      y = onePole(y, sr, lo, true);
      y = onePole(y, sr, hi, false);
    }
    return y;
  }
  // A steep-ish brickwall for band-limiting demos: FFT, zero, inverse.
  function lowpassFFT(x, sr, fc) {
    var N = D.nextPow2(x.length), re = new Float64Array(N), im = new Float64Array(N), i;
    for (i = 0; i < x.length; i++) re[i] = x[i];
    D.fft(re, im, false);
    var cut = Math.round(fc / sr * N);
    for (i = cut; i < N - cut; i++) { re[i] = 0; im[i] = 0; }
    D.fft(re, im, true);
    var out = new Float64Array(x.length);
    for (i = 0; i < x.length; i++) out[i] = re[i];
    return out;
  }

  // ---------------------------------------------------------- PCM operations
  // Uniform mid-tread quantisation to `bits`, optionally with TPDF dither
  // (two independent rectangular sources, 2 LSB peak-to-peak) and optionally
  // a first-order noise-shaping error feedback.
  function quantize(x, bits, o) {
    o = o || {};
    var lev = Math.pow(2, bits - 1), q = 1 / lev;
    var out = new Float64Array(x.length), r = prng(o.seed || 99), i, e = 0;
    for (i = 0; i < x.length; i++) {
      var v = x[i] + (o.shape ? e : 0);
      var d = o.dither ? (r() + r()) * 0.5 * q : 0;   // TPDF, +-1 LSB peak
      var y = Math.round((v + d) * lev) / lev;
      y = Math.max(-1, Math.min(1 - q, y));
      e = v - y;
      out[i] = y;
    }
    return out;
  }
  function resample(x, from, to) {
    if (from === to) return Float64Array.from(x);
    var n = Math.round(x.length * to / from), out = new Float64Array(n), i;
    for (i = 0; i < n; i++) {
      var t = i * from / to, j = Math.floor(t), f = t - j;
      out[i] = (x[j] || 0) * (1 - f) + (x[j + 1] || 0) * f;
    }
    return out;
  }
  // Decimate without an anti-alias filter, so aliasing is audible; or with one.
  function downUp(x, sr, target, antialias) {
    var y = antialias === false ? x : lowpassFFT(x, sr, target / 2 * 0.95);
    return resample(resample(y, sr, target), target, sr);
  }

  // ---------------------------------------------------------- the toy codec
  // Small, but not a mock-up: MDCT -> Bark-band energies -> a spread masking
  // threshold -> a global offset bisected until the entropy estimate matches
  // the requested bitrate -> quantise to that noise target -> IMDCT/overlap-add.
  //
  // opts: {N, bitrate (kbit/s), masking (bool), bandLimit (Hz), sr,
  //        blocks ("long"|"short"), sfbOverheadBits}
  // returns {out, bits, kbps, bands, blocks, noiseDb, snrDb, lambda}
  //
  // The analysis is the expensive half, so it is separable: hand a previous
  // result's `.analysis` back in through opts and a bitrate slider only pays
  // for the rate loop and the resynthesis.
  function analyze(x, o) {
    o = o || {};
    var sr = o.sr || rate();
    var N = o.N || 512;                       // MDCT lines per block
    var win = D.WIN[o.window || "sine"](2 * N);
    var nBlocks = Math.ceil(x.length / N) + 1;
    var lines = N, i, b, k, z;

    // Bark band edges expressed in MDCT line indices. Zwicker's table stops at
    // 15.5 kHz; the remainder is split into three so the top of the spectrum is
    // not judged as one enormous band.
    var edges = [0];
    for (z = 1; z <= 24; z++) {
      var idx = Math.min(lines, Math.round(D.BARK_EDGES[z] / (sr / 2) * lines));
      if (idx > edges[edges.length - 1]) edges.push(idx);
    }
    var tail = edges[edges.length - 1];
    if (tail < lines) {
      for (z = 1; z <= 3; z++) {
        var e = Math.round(tail + (lines - tail) * z / 3);
        if (e > edges[edges.length - 1]) edges.push(e);
      }
      if (edges[edges.length - 1] < lines) edges.push(lines);
    }
    var nb = edges.length - 1;

    var coeffs = [], thresh = [], energies = [];
    var buf = new Float64Array(2 * N);
    var cut = o.bandLimit ? Math.round(o.bandLimit / (sr / 2) * lines) : lines;
    var peak = 1e-12;
    for (b = 0; b < nBlocks; b++) {
      for (i = 0; i < 2 * N; i++) {
        var si = b * N - N + i;
        buf[i] = (si >= 0 && si < x.length ? x[si] : 0) * win[i];
      }
      var X = D.mdct(buf);
      for (i = cut; i < lines; i++) X[i] = 0;
      coeffs.push(X);
      var E = new Float64Array(nb);
      for (k = 0; k < nb; k++) {
        var s = 0;
        for (i = edges[k]; i < edges[k + 1]; i++) { s += X[i] * X[i]; if (Math.abs(X[i]) > peak) peak = Math.abs(X[i]); }
        E[k] = s / Math.max(1, edges[k + 1] - edges[k]);
      }
      energies.push(E);
    }
    // The absolute threshold needs an anchor, and the page cannot know where
    // the reader's volume knob is. Take the loudest spectral line in the whole
    // excerpt to be 96 dB SPL — the usual studio convention for full scale.
    for (b = 0; b < nBlocks; b++) {
      thresh.push(bandThreshold(energies[b], edges, lines, sr, o.masking !== false, coeffs[b], peak * peak));
    }
    return { sr: sr, N: N, win: win, edges: edges, bands: nb, blocks: nBlocks,
      coeffs: coeffs, thresh: thresh, energies: energies, length: x.length,
      peak: peak, masking: o.masking !== false };
  }

  function codec(x, o) {
    o = o || {};
    var a = o.analysis || analyze(x, o);
    var N = a.N, edges = a.edges, nb = a.bands, i, b, k;

    // --- rate loop: bisect a global offset until the estimate hits the budget
    var budget = o.bitrate ? o.bitrate * 1000 * (a.length / a.sr) : Infinity;
    var lo = -140, hi = 120, lambda = hi, est;
    if (isFinite(budget)) {
      for (var it = 0; it < 20; it++) {
        lambda = (lo + hi) / 2;
        if (estimateBits(a.coeffs, a.thresh, edges, lambda, o) > budget) lo = lambda;
        else hi = lambda;
      }
      lambda = hi;
    }
    est = estimateBits(a.coeffs, a.thresh, edges, lambda, o);

    // --- quantise / dequantise and resynthesise
    var out = new Float64Array((a.blocks + 1) * N);
    var noisePow = 0, sigPow = 0, zeroed = 0, totalLines = 0;
    var Xq = new Float64Array(N);
    for (b = 0; b < a.blocks; b++) {
      var Xc = a.coeffs[b], T = a.thresh[b];
      for (k = 0; k < nb; k++) {
        var target = Math.max(T[k] * Math.pow(10, lambda / 10), 1e-20);
        var step = Math.sqrt(12 * target);
        for (i = edges[k]; i < edges[k + 1]; i++) {
          var q = Math.round(Xc[i] / step);
          if (q === 0) zeroed++;
          totalLines++;
          Xq[i] = q * step;
          var e = Xq[i] - Xc[i];
          noisePow += e * e;
          sigPow += Xc[i] * Xc[i];
        }
      }
      var y = D.imdct(Xq);
      for (i = 0; i < 2 * N; i++) {
        var oi = b * N - N + i;
        if (oi >= 0 && oi < out.length) out[oi] += y[i] * a.win[i];
      }
    }
    var seconds = a.length / a.sr;
    return {
      out: out.subarray(0, a.length),
      analysis: a,
      bits: est,
      kbps: est / seconds / 1000,
      blocks: a.blocks,
      bands: nb,
      edges: edges,
      lambda: lambda,
      zeroFraction: totalLines ? zeroed / totalLines : 0,
      noiseDb: D.dbp(noisePow / Math.max(1, a.length)),
      snrDb: D.dbp(sigPow / Math.max(noisePow, 1e-30)),
      coeffs: a.coeffs,
      thresh: a.thresh,
      energies: a.energies,
    };
  }

  // Per-band masking threshold (power per line) from per-band energies.
  // With masking off this collapses to a flat threshold, i.e. equal SNR in
  // every band — which is exactly what makes the A/B with it on so stark.
  // The masking index — how far below a masker its own shadow starts — is not
  // one number. MPEG's model 1 uses 14.5 + z dB for a tonal masker and a flat
  // 5.5 dB for a noise one; model 2 interpolates between them on a tonality
  // index derived from spectral flatness. This does the latter, per band.
  function bandThreshold(E, edges, lines, sr, useMasking, X, fsPower) {
    var nb = E.length, T = new Float64Array(nb), k, j, i;
    var zc = new Float64Array(nb), offset = new Float64Array(nb);
    for (k = 0; k < nb; k++) {
      var fc = (edges[k] + edges[k + 1]) / 2 / lines * (sr / 2);
      zc[k] = D.hzToBarkT(Math.max(fc, 20));
      var alpha = 0.5;
      if (X) {
        // widen narrow low-frequency bands so the flatness measure has
        // something to measure
        var lo = edges[k], hi = edges[k + 1];
        while (hi - lo < 8 && (lo > 0 || hi < lines)) {
          if (lo > 0) lo--;
          if (hi < lines) hi++;
        }
        var pw = new Float64Array(hi - lo);
        for (i = lo; i < hi; i++) pw[i - lo] = X[i] * X[i];
        alpha = D.tonalityFromSfm(D.sfm(pw));
      }
      offset[k] = alpha * (14.5 + zc[k]) + (1 - alpha) * 5.5;
    }
    var totalE = 0;
    for (k = 0; k < nb; k++) totalE += E[k];
    var refl = Math.max(totalE / nb, 1e-14);
    // fsPower is the power of the loudest line in the excerpt, taken as
    // 96 dB SPL. The threshold is read at whichever end of the band the ear is
    // best at, so a wide top band is not condemned by its 20 kHz edge, and the
    // curve is capped at 80 dB SPL: the Terhardt approximation's quartic term
    // runs away above about 18 kHz, and a codec that believed it would throw
    // away the whole top octave of a loud recording.
    if (!fsPower) fsPower = lines * lines / 8;
    for (k = 0; k < nb; k++) {
      if (!useMasking) { T[k] = refl; continue; }
      var p = 0;
      for (j = 0; j < nb; j++) {
        if (E[j] <= 0) continue;
        var dz = zc[k] - zc[j];
        if (dz < -4 || dz > 10) continue;
        p += D.undbp(D.dbp(E[j]) + D.spreadSchroeder(dz) - offset[j]);
      }
      var fLo = Math.max(edges[k] / lines * (sr / 2), 20);
      var fHi = Math.max(edges[k + 1] / lines * (sr / 2), 20);
      var athDb = Math.min(80, Math.min(D.ath(fLo), D.ath(fHi)));
      T[k] = Math.max(p, D.undbp(athDb - 96) * fsPower);
    }
    return T;
  }

  // Bits are estimated as the zero-order entropy of the quantised integers,
  // plus a small per-band overhead for the scalefactor — the same accounting a
  // real encoder's rate loop does, minus the Huffman table lookup.
  // Values inside +-ESC get a real histogram; anything larger is treated the
  // way MP3 treats one, as an escape whose magnitude costs extra bits
  // (linbits). Without that, huge coefficients would all collapse into one
  // histogram bin and the estimate would stop rising as the step shrinks.
  var ESC = 255, HIST = new Int32Array(2 * ESC + 3), TOUCHED = new Int32Array(2 * ESC + 3);
  function estimateBits(coeffs, thresh, edges, lambda, o) {
    var nb = edges.length - 1, total = 0, b, k, i, t;
    var over = o && o.sfbOverheadBits != null ? o.sfbOverheadBits : 8;
    var gain = Math.pow(10, lambda / 10);
    var escBin = 2 * ESC + 1;
    for (b = 0; b < coeffs.length; b++) {
      var X = coeffs[b], T = thresh[b];
      for (k = 0; k < nb; k++) {
        var step = Math.sqrt(12 * Math.max(T[k] * gain, 1e-20));
        var n = 0, anyNonZero = false, nT = 0, escBits = 0;
        for (i = edges[k]; i < edges[k + 1]; i++) {
          var q = Math.round(X[i] / step);
          if (q !== 0) anyNonZero = true;
          var h;
          if (q < -ESC || q > ESC) { h = escBin; escBits += 2 + Math.log2(Math.abs(q)); }
          else h = q + ESC;
          if (HIST[h] === 0) TOUCHED[nT++] = h;
          HIST[h]++; n++;
        }
        if (!n) continue;
        var ent = 0;
        for (t = 0; t < nT; t++) {
          var p = HIST[TOUCHED[t]] / n;
          ent -= p * Math.log2(p);
          HIST[TOUCHED[t]] = 0;
        }
        total += n * ent + escBits + (anyNonZero ? over : 1);
      }
    }
    return total;
  }

  // ---------------------------------------------------------- ABX
  // Returns a controller for an ABX panel: X is randomly A or B each trial.
  function abx(getA, getB) {
    var state = { trial: 0, correct: 0, x: 0, answered: false };
    var handles = [];
    function stop() { handles.forEach(function (h) { h.stop(); }); handles = []; stopAll(); }
    function newTrial() {
      // Math.random is fine here: this is a listening test, not a figure.
      state.x = Math.random() < 0.5 ? 0 : 1;
      state.answered = false;
      return state.x;
    }
    newTrial();
    return {
      state: state,
      playA: function () { stop(); handles.push(play(getA())); },
      playB: function () { stop(); handles.push(play(getB())); },
      playX: function () { stop(); handles.push(play(state.x ? getB() : getA())); },
      stop: stop,
      guess: function (isB) {
        if (state.answered) return null;
        state.answered = true;
        state.trial++;
        var right = (isB ? 1 : 0) === state.x;
        if (right) state.correct++;
        var was = state.x;
        newTrial();
        return { right: right, was: was ? "B" : "A", trial: state.trial, correct: state.correct };
      },
      reset: function () { state.trial = 0; state.correct = 0; newTrial(); },
      // One-sided binomial p: the chance of doing this well or better by luck.
      pValue: function () {
        var n = state.trial, c = state.correct, i, p = 0;
        for (i = c; i <= n; i++) p += choose(n, i) * Math.pow(0.5, n);
        return n ? p : 1;
      },
    };
  }
  function choose(n, k) {
    var r = 1, i;
    for (i = 1; i <= k; i++) r = r * (n - k + i) / i;
    return r;
  }

  window.AUD = {
    ctx: audioCtx, rate: rate, play: play, playStereo: playStereo, stopAll: stopAll, wire: wire, toBuffer: toBuffer,
    src: src, adsr: adsr, fadeEdges: fadeEdges, prng: prng,
    resonator: resonator, onePole: onePole, bandpass: bandpass, lowpassFFT: lowpassFFT,
    quantize: quantize, resample: resample, downUp: downUp,
    codec: codec, analyze: analyze, bandThreshold: bandThreshold, estimateBits: estimateBits,
    abx: abx, choose: choose,
  };
})();
