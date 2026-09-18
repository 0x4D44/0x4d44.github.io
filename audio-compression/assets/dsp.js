/* ============================================================
   THROWING SOUND AWAY — the shared DSP and psychoacoustics kit.

   Everything the figures need to be *real* rather than drawn: a radix-2 FFT,
   the window family, an exact MDCT/IMDCT pair (so time-domain alias
   cancellation can be demonstrated numerically rather than asserted), the
   Bark/ERB/Greenwood maps, the absolute threshold of hearing, spreading
   functions and a masking model, Levinson-Durbin LPC, Huffman and Rice
   coders, and the PVQ combinatorics.

   Exposed as window.DSP. No dependencies, no network, no build step.
   ============================================================ */
(function () {
  "use strict";

  var TAU = Math.PI * 2;

  // ---------------------------------------------------------- basics
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function db(x, floor) { return 20 * Math.log10(Math.max(Math.abs(x), floor == null ? 1e-12 : floor)); }
  function dbp(p, floor) { return 10 * Math.log10(Math.max(p, floor == null ? 1e-24 : floor)); }
  function undb(d) { return Math.pow(10, d / 20); }
  function undbp(d) { return Math.pow(10, d / 10); }
  function linspace(a, b, n) {
    var o = new Float64Array(n);
    for (var i = 0; i < n; i++) o[i] = n === 1 ? a : a + (b - a) * i / (n - 1);
    return o;
  }
  function rms(x) { var s = 0, i; for (i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); }
  function peak(x) { var m = 0, i; for (i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; }
  function normalize(x, target) {
    var p = peak(x) || 1, g = (target == null ? 0.9 : target) / p, i;
    for (i = 0; i < x.length; i++) x[i] *= g;
    return x;
  }

  // ---------------------------------------------------------- FFT
  // In-place iterative radix-2. `n` must be a power of two.
  function fft(re, im, inverse) {
    var n = re.length, i, j, k, m, t, wr, wi, ur, ui, ang;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (m = 2; m <= n; m <<= 1) {
      ang = (inverse ? TAU : -TAU) / m;
      var swr = Math.cos(ang), swi = Math.sin(ang);
      for (i = 0; i < n; i += m) {
        wr = 1; wi = 0;
        for (k = 0; k < m / 2; k++) {
          var ar = re[i + k], ai = im[i + k];
          var br = re[i + k + m / 2] * wr - im[i + k + m / 2] * wi;
          var bi = re[i + k + m / 2] * wi + im[i + k + m / 2] * wr;
          re[i + k] = ar + br; im[i + k] = ai + bi;
          re[i + k + m / 2] = ar - br; im[i + k + m / 2] = ai - bi;
          ur = wr; ui = wi;
          wr = ur * swr - ui * swi; wi = ur * swi + ui * swr;
        }
      }
    }
    if (inverse) for (i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
    return re;
  }

  // Magnitude spectrum in dB (relative to full scale) of the first n samples.
  // opts: {n, window ("hann"|"rect"|...), zeroPad, floor}
  function spectrumDb(x, opts) {
    opts = opts || {};
    var n = opts.n || nextPow2(x.length);
    var w = WIN[opts.window || "hann"](n);
    var pad = opts.zeroPad || 1;
    var N = nextPow2(n * pad);
    var re = new Float64Array(N), im = new Float64Array(N), i;
    var cg = 0;
    for (i = 0; i < n; i++) { re[i] = (x[i] || 0) * w[i]; cg += w[i]; }
    cg = cg / n;                               // coherent gain of the window
    fft(re, im, false);
    var half = N / 2, out = new Float64Array(half);
    for (i = 0; i < half; i++) {
      var mag = Math.hypot(re[i], im[i]) / (n * cg / 2);
      out[i] = db(i === 0 ? mag / 2 : mag, opts.floor == null ? 1e-9 : opts.floor);
    }
    return out;
  }
  function nextPow2(n) { var p = 1; while (p < n) p <<= 1; return p; }

  // ---------------------------------------------------------- windows
  function bessel0(x) {                        // modified Bessel I0, series form
    var s = 1, t = 1, i;
    for (i = 1; i < 60; i++) { t *= (x / 2) * (x / 2) / (i * i); s += t; if (t < 1e-16 * s) break; }
    return s;
  }
  var WIN = {
    rect: function (N) { var w = new Float64Array(N); w.fill(1); return w; },
    hann: function (N) {
      var w = new Float64Array(N), i;
      for (i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(TAU * i / N);
      return w;
    },
    hamming: function (N) {
      var w = new Float64Array(N), i;
      for (i = 0; i < N; i++) w[i] = 0.54 - 0.46 * Math.cos(TAU * i / N);
      return w;
    },
    blackman: function (N) {
      var w = new Float64Array(N), i;
      for (i = 0; i < N; i++) w[i] = 0.42 - 0.5 * Math.cos(TAU * i / N) + 0.08 * Math.cos(2 * TAU * i / N);
      return w;
    },
    blackmanHarris: function (N) {
      var w = new Float64Array(N), i, a = [0.35875, 0.48829, 0.14128, 0.01168];
      for (i = 0; i < N; i++) w[i] = a[0] - a[1] * Math.cos(TAU * i / N) + a[2] * Math.cos(2 * TAU * i / N) - a[3] * Math.cos(3 * TAU * i / N);
      return w;
    },
    // The MDCT sine window: w[n] = sin(pi/N (n + 1/2)), N = window length.
    sine: function (N) {
      var w = new Float64Array(N), i;
      for (i = 0; i < N; i++) w[i] = Math.sin(Math.PI / N * (i + 0.5));
      return w;
    },
    // Kaiser-Bessel-derived, as used by AAC. alpha 4 (long) / 6 (short).
    kbd: function (N, alpha) {
      alpha = alpha == null ? 4 : alpha;
      var M = N / 2, k = new Float64Array(M + 1), i, sum = 0;
      for (i = 0; i <= M; i++) {
        var r = 2 * i / M - 1;
        k[i] = bessel0(Math.PI * alpha * Math.sqrt(Math.max(0, 1 - r * r)));
      }
      var cum = new Float64Array(M + 1);
      for (i = 0; i <= M; i++) { sum += k[i]; cum[i] = sum; }
      var w = new Float64Array(N);
      for (i = 0; i < M; i++) {
        w[i] = Math.sqrt(cum[i] / sum);
        w[N - 1 - i] = w[i];
      }
      return w;
    },
  };

  // Measured window figures: coherent gain, equivalent noise bandwidth (bins),
  // -3 dB main-lobe width (bins) and the highest sidelobe (dB).
  function windowStats(w) {
    var N = w.length, i, s1 = 0, s2 = 0;
    for (i = 0; i < N; i++) { s1 += w[i]; s2 += w[i] * w[i]; }
    var cg = s1 / N, enbw = N * s2 / (s1 * s1);
    var Z = 32, M = N * Z;                      // heavy zero-pad for the response
    var re = new Float64Array(M), im = new Float64Array(M);
    for (i = 0; i < N; i++) re[i] = w[i];
    fft(re, im, false);
    var mag = new Float64Array(M / 2);
    for (i = 0; i < M / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
    var m0 = mag[0];
    // first null then the tallest lobe beyond it
    var k = 1;
    while (k < M / 2 - 1 && mag[k + 1] < mag[k]) k++;
    var side = 0;
    for (i = k; i < M / 2; i++) side = Math.max(side, mag[i]);
    // -3 dB half-width in bins
    var h = 0;
    while (h < M / 2 && mag[h] > m0 * Math.SQRT1_2) h++;
    return {
      coherentGain: cg,
      enbw: enbw,
      bw3dB: 2 * h / Z,
      sidelobeDb: 20 * Math.log10(Math.max(side, 1e-20) / m0),
      firstNullBin: k / Z,
    };
  }

  // ---------------------------------------------------------- DCT-IV / MDCT
  // DCT-IV: X[k] = sum x[n] cos(pi/N (n + 1/2)(k + 1/2)).  It is its own
  // inverse up to a factor of 2/N, which is what makes the MDCT fold/unfold
  // below so short. The kernel is cached per size: exact, and fast enough for
  // a couple of seconds of audio at N <= 1024.
  var DCT_CACHE = {};
  function dct4Table(N) {
    if (DCT_CACHE[N]) return DCT_CACHE[N];
    if (N > 2048) throw new Error("dct4: N too large for the cached kernel");
    // Float64 while the kernel is small enough to be cheap (N <= 256 is 512 kB
    // and is where the TDAC figure lives, so its cancellation reads as exact);
    // Float32 above, where 1024^2 doubles would be 8 MB on a phone.
    var t = N <= 256 ? new Float64Array(N * N) : new Float32Array(N * N), n, k;
    for (k = 0; k < N; k++) {
      for (n = 0; n < N; n++) t[k * N + n] = Math.cos(Math.PI / N * (n + 0.5) * (k + 0.5));
    }
    DCT_CACHE[N] = t;
    return t;
  }
  function dct4(x, out) {
    var N = x.length, t = dct4Table(N), k, n, s, row;
    out = out || new Float64Array(N);
    for (k = 0; k < N; k++) {
      s = 0; row = k * N;
      for (n = 0; n < N; n++) s += x[n] * t[row + n];
      out[k] = s;
    }
    return out;
  }

  // MDCT of 2N windowed samples -> N coefficients, via the standard fold
  //   MDCT(a,b,c,d) = DCT-IV( -c_R - d , a - b_R )
  // with a,b,c,d the four quarters and _R meaning reversed.
  function mdct(x) {
    var N2 = x.length, N = N2 >> 1, H = N >> 1, u = new Float64Array(N), i;
    for (i = 0; i < H; i++) {
      u[i]     = -x[3 * H - 1 - i] - x[3 * H + i];   // -c_R - d
      u[H + i] =  x[i]            - x[2 * H - 1 - i]; //  a - b_R
    }
    return dct4(u);
  }
  // IMDCT: N coefficients -> 2N samples carrying the time-domain alias.
  // Overlap-adding two consecutive blocks cancels it exactly (TDAC), provided
  // the analysis/synthesis window satisfies w[n]^2 + w[n+N]^2 = 1.
  function imdct(X) {
    var N = X.length, H = N >> 1, v = dct4(X), y = new Float64Array(2 * N), i, s = 2 / N;
    for (i = 0; i < H; i++) {
      y[i]             =  v[H + i] * s;
      y[H + i]         = -v[N - 1 - i] * s;
      y[N + i]         = -v[H - 1 - i] * s;
      y[N + H + i]     = -v[i] * s;
    }
    return y;
  }

  // Analyse a signal into MDCT blocks (hop = N) and resynthesise by
  // overlap-add. `transform(coeffs, blockIndex)` may modify the coefficients
  // in place — that is where a codec lives.
  function mdctRoundTrip(x, N, transform, windowName) {
    var w = WIN[windowName || "sine"](2 * N);
    var nBlocks = Math.ceil(x.length / N) + 1;
    var out = new Float64Array((nBlocks + 1) * N);
    var buf = new Float64Array(2 * N), b, i, idx;
    for (b = 0; b < nBlocks; b++) {
      for (i = 0; i < 2 * N; i++) {
        idx = b * N - N + i;
        buf[i] = (idx >= 0 && idx < x.length ? x[idx] : 0) * w[i];
      }
      var X = mdct(buf);
      if (transform) transform(X, b);
      var y = imdct(X);
      for (i = 0; i < 2 * N; i++) {
        idx = b * N - N + i;
        if (idx >= 0 && idx < out.length) out[idx] += y[i] * w[i];
      }
    }
    return out.subarray(0, x.length);
  }

  // ---------------------------------------------------------- frequency maps
  // Zwicker & Terhardt (1980) — the form used by the MPEG psychoacoustic models.
  function hzToBark(f) {
    var k = f / 1000;
    return 13 * Math.atan(0.76 * k) + 3.5 * Math.atan(k * k / (7.5 * 7.5));
  }
  // Traunmuller (1990) — analytic and invertible, so it is what the figures use
  // when they need to go both ways.
  function hzToBarkT(f) {
    var z = 26.81 * f / (1960 + f) - 0.53;
    if (z < 2) z += 0.15 * (2 - z);
    if (z > 20.1) z += 0.22 * (z - 20.1);
    return z;
  }
  function barkToHz(z) {
    if (z < 2) z = (z - 0.3) / 0.85;
    if (z > 20.1) z = (z + 4.422) / 1.22;
    return 1960 * (z + 0.53) / (26.28 - z);
  }
  // Zwicker's 24 critical bands: the 25 band edges in Hz.
  var BARK_EDGES = [0, 100, 200, 300, 400, 510, 630, 770, 920, 1080, 1270, 1480,
    1720, 2000, 2320, 2700, 3150, 3700, 4400, 5300, 6400, 7700, 9500, 12000, 15500];
  var BARK_CENTERS = [50, 150, 250, 350, 450, 570, 700, 840, 1000, 1170, 1370,
    1600, 1850, 2150, 2500, 2900, 3400, 4000, 4800, 5800, 7000, 8500, 10500, 13500];

  // Glasberg & Moore (1990): ERB in Hz, and the ERB-rate (Cams) scale.
  function erb(f) { return 24.7 * (4.37 * f / 1000 + 1); }
  function erbRate(f) { return 21.4 * Math.log10(4.37 * f / 1000 + 1); }
  function erbRateToHz(e) { return (Math.pow(10, e / 21.4) - 1) * 1000 / 4.37; }

  // Greenwood (1990) place-frequency map for the human cochlea:
  //   f = A (10^(a x) - k),  x the fraction of distance from the apex.
  var GREENWOOD = { A: 165.4, a: 2.1, k: 0.88, lengthMm: 35 };
  function greenwood(x) { return GREENWOOD.A * (Math.pow(10, GREENWOOD.a * x) - GREENWOOD.k); }
  function greenwoodInv(f) {
    return Math.log10(f / GREENWOOD.A + GREENWOOD.k) / GREENWOOD.a;
  }

  // Absolute threshold of hearing, dB SPL. Terhardt's approximation as used in
  // Painter & Spanias; valid roughly 20 Hz - 20 kHz for a young listener.
  function ath(f) {
    var k = Math.max(f, 20) / 1000;
    return 3.64 * Math.pow(k, -0.8)
      - 6.5 * Math.exp(-0.6 * Math.pow(k - 3.3, 2))
      + 1e-3 * Math.pow(k, 4);
  }

  // ---------------------------------------------------------- masking
  // Schroeder's spreading function, dB, as a function of Bark distance.
  function spreadSchroeder(dz) {
    return 15.81 + 7.5 * (dz + 0.474) - 17.5 * Math.sqrt(1 + Math.pow(dz + 0.474, 2));
  }
  // The classic two-slope pattern: +27 dB/Bark below the masker, and a shallower
  // upper slope that flattens as the masker gets louder (Terhardt).
  //   dz  = z_probe - z_masker  (negative = below the masker)
  //   L   = masker level, dB SPL;  fkHz = masker frequency in kHz
  function spreadTwoSlope(dz, L, fkHz) {
    if (dz < 0) return 27 * dz;
    var upper = -24 - 0.23 / Math.max(fkHz, 0.05) + 0.2 * L;
    return upper * dz;
  }
  // Spectral flatness measure (dB) of a power spectrum: 0 dB = flat (noise-like),
  // very negative = tonal. MPEG model 2 turns this into a tonality index.
  function sfm(power) {
    var n = 0, logSum = 0, arith = 0, i;
    for (i = 0; i < power.length; i++) {
      var p = Math.max(power[i], 1e-20);
      logSum += Math.log(p); arith += p; n++;
    }
    if (!n) return 0;
    return 10 * Math.log10(Math.exp(logSum / n) / (arith / n));
  }
  function tonalityFromSfm(sfmDb) { return Math.min(sfmDb / -60, 1); }

  // Build a global masking threshold (dB SPL) on a Bark grid.
  //   maskers: [{f, level, tonal}]      z: the Bark grid to evaluate on
  // Individual thresholds are spread, offset by the tone/noise asymmetry, then
  // power-summed with each other and with the absolute threshold.
  function maskingThreshold(maskers, zGrid, opts) {
    opts = opts || {};
    var out = new Float64Array(zGrid.length), i, j;
    for (i = 0; i < zGrid.length; i++) {
      var f = barkToHz(zGrid[i]);
      var p = opts.noAth ? 0 : undbp(ath(f));
      for (j = 0; j < maskers.length; j++) {
        var m = maskers[j];
        var zm = hzToBarkT(m.f);
        var dz = zGrid[i] - zm;
        if (dz < -3.5 || dz > 9) continue;             // outside the useful span
        // MPEG model 1 masking indices: 14.5 + z dB for a tonal masker,
        // a flat 5.5 dB for a noise masker.
        var offset = m.tonal ? (14.5 + zm) : 5.5;
        var lvl = m.level + spreadTwoSlope(dz, m.level, m.f / 1000) - offset;
        p += undbp(lvl);
      }
      out[i] = dbp(p);
    }
    return out;
  }

  // ---------------------------------------------------------- LPC
  function autocorr(x, order) {
    var r = new Float64Array(order + 1), k, n;
    for (k = 0; k <= order; k++) {
      var s = 0;
      for (n = k; n < x.length; n++) s += x[n] * x[n - k];
      r[k] = s;
    }
    return r;
  }
  // Levinson-Durbin. Returns {a, err, k} with a[0] = 1 and the prediction
  // filter A(z) = 1 + a1 z^-1 + ... (so the residual is x[n] + sum a_i x[n-i]).
  function levinson(r, order) {
    var a = new Float64Array(order + 1), tmp = new Float64Array(order + 1);
    var refl = new Float64Array(order + 1);
    var e = r[0], i, j;
    a[0] = 1;
    if (e <= 0) return { a: a, err: 0, k: refl };
    for (i = 1; i <= order; i++) {
      var acc = r[i];
      for (j = 1; j < i; j++) acc += a[j] * r[i - j];
      var k = -acc / e;
      refl[i] = k;
      for (j = 0; j <= i; j++) tmp[j] = a[j];
      for (j = 1; j < i; j++) a[j] = tmp[j] + k * tmp[i - j];
      a[i] = k;
      e *= (1 - k * k);
      if (e <= 0) { e = 0; break; }
    }
    return { a: a, err: e, k: refl };
  }
  function lpc(x, order) { return levinson(autocorr(x, order), order); }
  // |1/A(e^jw)|, the all-pole envelope, at n points from 0 to fs/2.
  function lpcSpectrum(a, gain, n) {
    var out = new Float64Array(n), i, j;
    for (i = 0; i < n; i++) {
      var w = Math.PI * i / (n - 1), re = 0, im = 0;
      for (j = 0; j < a.length; j++) { re += a[j] * Math.cos(w * j); im -= a[j] * Math.sin(w * j); }
      out[i] = db((gain == null ? 1 : gain) / Math.max(Math.hypot(re, im), 1e-9));
    }
    return out;
  }
  function lpcResidual(x, a) {
    var out = new Float64Array(x.length), n, j;
    for (n = 0; n < x.length; n++) {
      var s = 0;
      for (j = 0; j < a.length; j++) s += a[j] * (n - j >= 0 ? x[n - j] : 0);
      out[n] = s;
    }
    return out;
  }
  // The fixed predictors of Shorten/FLAC, orders 0-4: residual = x - prediction.
  var FIXED_PREDICTORS = [
    function () { return 0; },
    function (x, n) { return x[n - 1]; },
    function (x, n) { return 2 * x[n - 1] - x[n - 2]; },
    function (x, n) { return 3 * x[n - 1] - 3 * x[n - 2] + x[n - 3]; },
    function (x, n) { return 4 * x[n - 1] - 6 * x[n - 2] + 4 * x[n - 3] - x[n - 4]; },
  ];
  function fixedResidual(x, order) {
    var out = new Int32Array(x.length), n;
    for (n = 0; n < x.length; n++) {
      out[n] = n < order ? x[n] : Math.round(x[n] - FIXED_PREDICTORS[order](x, n));
    }
    return out;
  }

  // ---------------------------------------------------------- entropy coding
  function entropy(counts) {
    var total = 0, i, h = 0;
    for (i = 0; i < counts.length; i++) total += counts[i];
    if (!total) return 0;
    for (i = 0; i < counts.length; i++) {
      if (!counts[i]) continue;
      var p = counts[i] / total;
      h -= p * Math.log2(p);
    }
    return h;
  }
  // Huffman over [{sym, w}]. Returns {codes:{sym:"0110"}, lengths, avg, tree, entropy}.
  function huffman(items) {
    if (!items.length) return { codes: {}, lengths: {}, avg: 0, tree: null, entropy: 0 };
    if (items.length === 1) {
      var only = {}; only[items[0].sym] = "0";
      return { codes: only, lengths: { [items[0].sym]: 1 }, avg: 1, entropy: 0,
        tree: { leaf: items[0].sym, w: items[0].w } };
    }
    var nodes = items.map(function (it, i) { return { leaf: it.sym, w: it.w, ord: i }; });
    var next = nodes.length;
    while (nodes.length > 1) {
      nodes.sort(function (a, b) { return a.w - b.w || a.ord - b.ord; });
      var l = nodes.shift(), r = nodes.shift();
      nodes.push({ l: l, r: r, w: l.w + r.w, ord: next++ });
    }
    var tree = nodes[0], codes = {}, lengths = {};
    (function walk(n, pre) {
      if (n.leaf !== undefined) { codes[n.leaf] = pre || "0"; lengths[n.leaf] = (pre || "0").length; return; }
      walk(n.l, pre + "0"); walk(n.r, pre + "1");
    })(tree, "");
    var total = items.reduce(function (s, it) { return s + it.w; }, 0);
    var avg = items.reduce(function (s, it) { return s + it.w / total * lengths[it.sym]; }, 0);
    return { codes: codes, lengths: lengths, avg: avg, tree: tree,
      entropy: entropy(items.map(function (it) { return it.w; })) };
  }
  // Canonical code lengths -> canonical codes, the form real decoders store.
  function canonical(lengths) {
    var syms = Object.keys(lengths).sort(function (a, b) {
      return lengths[a] - lengths[b] || (a < b ? -1 : a > b ? 1 : 0);
    });
    var code = 0, prev = 0, out = {};
    syms.forEach(function (s) {
      code <<= (lengths[s] - prev); prev = lengths[s];
      out[s] = code.toString(2).padStart(lengths[s], "0");
      code++;
    });
    return out;
  }
  // Rice/Golomb: total bits to code a signed residual array with parameter k
  // (zig-zag folded to unsigned first, as FLAC does).
  function riceBits(residual, k) {
    var bits = 0, i;
    for (i = 0; i < residual.length; i++) {
      var u = residual[i] >= 0 ? 2 * residual[i] : -2 * residual[i] - 1;
      bits += (u >> k) + 1 + k;
    }
    return bits;
  }
  function bestRiceK(residual, maxK) {
    var best = 0, bestBits = Infinity, k;
    for (k = 0; k <= (maxK == null ? 30 : maxK); k++) {
      var b = riceBits(residual, k);
      if (b < bestBits) { bestBits = b; best = k; }
    }
    return { k: best, bits: bestBits };
  }

  // ---------------------------------------------------------- PVQ (CELT)
  // V(N,K): the number of N-dimensional integer vectors with sum|y_i| = K —
  // the size of the pyramid codebook, and therefore log2(V) bits to index one.
  var PVQ_CACHE = {};
  function pvqV(N, K) {
    if (N === 0) return K === 0 ? 1 : 0;
    if (K === 0) return 1;
    var key = N + ":" + K;
    if (PVQ_CACHE[key] !== undefined) return PVQ_CACHE[key];
    var v = pvqV(N - 1, K) + pvqV(N, K - 1) + pvqV(N - 1, K - 1);
    PVQ_CACHE[key] = v;
    return v;
  }
  function pvqBits(N, K) { return Math.log2(Math.max(pvqV(N, K), 1)); }
  // Project x onto the pyramid sum|y| = K. Seeded by the usual L1 projection,
  // then pulses are added one at a time where each most improves the cosine
  // similarity between y and x — the same greedy criterion libopus uses.
  function pvqSearch(x, K) {
    var N = x.length, y = new Int32Array(N), i, sum = 0, xy = 0, yy = 0, norm = 0;
    for (i = 0; i < N; i++) norm += Math.abs(x[i]);
    if (norm > 0) {
      for (i = 0; i < N; i++) {
        y[i] = Math.trunc(K * x[i] / norm);
        sum += Math.abs(y[i]); xy += x[i] * y[i]; yy += y[i] * y[i];
      }
    }
    while (sum < K) {
      var bi = 0, bg = -Infinity;
      for (i = 0; i < N; i++) {
        var s = x[i] >= 0 ? 1 : -1;
        // adding one pulse at i: xy -> xy + s*x[i],  yy -> yy + 2*s*y[i] + 1
        var g = (xy + s * x[i]) / Math.sqrt(yy + 2 * s * y[i] + 1);
        if (g > bg) { bg = g; bi = i; }
      }
      var sb = x[bi] >= 0 ? 1 : -1;
      xy += sb * x[bi]; yy += 2 * sb * y[bi] + 1;
      y[bi] += sb; sum++;
    }
    return y;
  }

  // ---------------------------------------------------------- quantisers
  // The MP3/AAC power-law quantiser, in the standard's own form:
  //
  //     is = nint( (|xr| / 2^((global_gain - 210)/4))^(3/4) - 0.0946 )
  //
  // The step division happens BEFORE the 3/4 power, not after. Getting that
  // order wrong still looks plausible — it is only wrong by a constant factor
  // 2^((210-gain)/12), which is exactly 1 at gain = 210 — but it makes the pair
  // below stop being inverses everywhere else. (MP3's rounding offset is
  // 0.0946; AAC's is 0.4054.)
  function quantPow(x, gain, offset) {
    var s = x < 0 ? -1 : 1;
    var step = Math.pow(2, (gain - 210) / 4);
    var q = Math.pow(Math.abs(x) / step, 0.75);
    return s * Math.max(0, Math.round(q - (offset == null ? 0.0946 : offset)));
  }
  function dequantPow(q, gain) {
    var s = q < 0 ? -1 : 1;
    return s * Math.pow(Math.abs(q), 4 / 3) * Math.pow(2, (gain - 210) / 4);
  }
  // Uniform mid-tread quantiser with `bits` bits over [-1, 1].
  function quantUniform(x, bits) {
    var levels = Math.pow(2, bits - 1);
    return clamp(Math.round(x * levels), -levels, levels - 1) / levels;
  }
  // Ideal SNR of a uniform quantiser: 6.02 N + 1.76 dB for a full-scale sine.
  function quantSnrDb(bits) { return 6.02 * bits + 1.76; }

  window.DSP = {
    TAU: TAU, clamp: clamp, lerp: lerp, db: db, dbp: dbp, undb: undb, undbp: undbp,
    linspace: linspace, rms: rms, peak: peak, normalize: normalize, nextPow2: nextPow2,
    fft: fft, spectrumDb: spectrumDb, WIN: WIN, windowStats: windowStats, bessel0: bessel0,
    dct4: dct4, mdct: mdct, imdct: imdct, mdctRoundTrip: mdctRoundTrip,
    hzToBark: hzToBark, hzToBarkT: hzToBarkT, barkToHz: barkToHz,
    BARK_EDGES: BARK_EDGES, BARK_CENTERS: BARK_CENTERS,
    erb: erb, erbRate: erbRate, erbRateToHz: erbRateToHz,
    greenwood: greenwood, greenwoodInv: greenwoodInv, GREENWOOD: GREENWOOD,
    ath: ath, spreadSchroeder: spreadSchroeder, spreadTwoSlope: spreadTwoSlope,
    sfm: sfm, tonalityFromSfm: tonalityFromSfm, maskingThreshold: maskingThreshold,
    autocorr: autocorr, levinson: levinson, lpc: lpc, lpcSpectrum: lpcSpectrum,
    lpcResidual: lpcResidual, fixedResidual: fixedResidual, FIXED_PREDICTORS: FIXED_PREDICTORS,
    entropy: entropy, huffman: huffman, canonical: canonical,
    riceBits: riceBits, bestRiceK: bestRiceK,
    pvqV: pvqV, pvqBits: pvqBits, pvqSearch: pvqSearch,
    quantPow: quantPow, dequantPow: dequantPow, quantUniform: quantUniform, quantSnrDb: quantSnrDb,
  };
})();
