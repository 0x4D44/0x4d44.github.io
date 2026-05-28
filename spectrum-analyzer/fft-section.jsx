/* ============================================================
   FFT teaching section — Fourier → cost → integers → aliasing → windowing
   Loaded BEFORE app.jsx. Exports its public components to window.
   ============================================================ */

const { useState: useStateF, useEffect: useEffectF, useRef: useRefF, useMemo: useMemoF } = React;

/* ---------- radix-2 in-place FFT ---------- */
function fft(re, im) {
  const n = re.length;
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    let m = n >> 1;
    while (m >= 1 && j >= m) { j -= m; m >>= 1; }
    j += m;
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = -2 * Math.PI / len;
    const wpr = Math.cos(ang), wpi = Math.sin(ang);
    for (let s = 0; s < n; s += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < half; k++) {
        const tr = wr * re[s + k + half] - wi * im[s + k + half];
        const ti = wr * im[s + k + half] + wi * re[s + k + half];
        re[s + k + half] = re[s + k] - tr;
        im[s + k + half] = im[s + k] - ti;
        re[s + k] += tr;
        im[s + k] += ti;
        const nwr = wr * wpr - wi * wpi;
        wi = wr * wpi + wi * wpr;
        wr = nwr;
      }
    }
  }
}

/* ---------- Window functions ---------- */
const WINDOWS = {
  none:           (i, N) => 1,
  hamming:        (i, N) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1)),
  hanning:        (i, N) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1))),
  blackmanharris: (i, N) => {
    const c = (2 * Math.PI * i) / (N - 1);
    return 0.35875 - 0.48829 * Math.cos(c) + 0.14128 * Math.cos(2 * c) - 0.01168 * Math.cos(3 * c);
  },
};

/* ---------- SubHead ---------- */
function SubHead({ n, title }) {
  return (
    <div className="sub-head">
      <div className="sn">§ {n}</div>
      <h3>{title}</h3>
    </div>
  );
}

/* ============================================================
   3.1 — FOURIER BUILDER
   ============================================================ */
function FourierBuilder() {
  const [shape, setShape] = useStateF("square");
  const [harm, setHarm]   = useStateF(1);

  const N = 512;

  // build sum of first K harmonics, plus the target (infinite) version
  const { sum, target, bars } = useMemoF(() => {
    const sum    = new Float32Array(N);
    const target = new Float32Array(N);
    const bars   = []; // {k, amp, used}

    let maxK;
    let coeff;
    if (shape === "square")   { maxK = 49; coeff = (k) => (k % 2 === 1) ? (4 / Math.PI) / k : 0; }
    if (shape === "saw")      { maxK = 30; coeff = (k) => (2 / Math.PI) * (k % 2 === 1 ? 1 : -1) / k; }
    if (shape === "triangle") { maxK = 49; coeff = (k) => (k % 2 === 1) ? (8 / (Math.PI * Math.PI)) * Math.pow(-1, (k - 1) / 2) / (k * k) : 0; }

    for (let k = 1; k <= maxK; k++) {
      const a = coeff(k);
      if (a === 0) continue;
      bars.push({ k, amp: Math.abs(a), used: k <= harm * 2 + 1 && (shape !== "saw" ? k % 2 === 1 || false : true) });
    }
    // bars filtered to first `harm` non-zero coefficients
    const usedKs = [];
    let count = 0;
    for (let k = 1; k <= maxK && count < harm; k++) {
      const a = coeff(k);
      if (a !== 0) { usedKs.push(k); count++; }
    }
    bars.length = 0;
    for (let k = 1; k <= maxK; k++) {
      const a = coeff(k);
      if (a === 0) continue;
      bars.push({ k, amp: Math.abs(a), used: usedKs.includes(k) });
    }

    for (let i = 0; i < N; i++) {
      const t = (i / N) * 2 * Math.PI;
      // target (use lots of terms)
      let v = 0;
      for (let k = 1; k <= maxK; k++) {
        const a = coeff(k);
        if (a !== 0) v += a * Math.sin(k * t);
      }
      target[i] = v;
      // partial sum
      let p = 0;
      for (const k of usedKs) p += coeff(k) * Math.sin(k * t);
      sum[i] = p;
    }
    return { sum, target, bars };
  }, [shape, harm]);

  const waveRef = useRefF(null);
  const harmRef = useRefF(null);

  useEffectF(() => {
    const c = waveRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = "rgba(94,243,154,0.07)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath(); ctx.moveTo(0, (H * i) / 6); ctx.lineTo(W, (H * i) / 6); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(94,243,154,0.22)";
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

    const scale = (v) => H / 2 - v * (H / 2 - 8) * 0.65;

    // target (dim amber, dashed)
    ctx.strokeStyle = "rgba(255,184,77,0.55)";
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * W;
      const y = scale(target[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // sum (bright phos)
    ctx.strokeStyle = "#5ef39a";
    ctx.lineWidth = 1.8 * dpr;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * W;
      const y = scale(sum[i]);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [sum, target]);

  useEffectF(() => {
    const c = harmRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    const max = bars.length ? bars[0].amp : 1;
    const slotW = W / 50;
    for (const b of bars) {
      const x = (b.k - 1) * slotW;
      const h = (b.amp / max) * (H - 22 * dpr);
      ctx.fillStyle = b.used ? "#5ef39a" : "rgba(154,167,163,0.18)";
      ctx.fillRect(x + 1, H - h - 14 * dpr, slotW - 2, h);
      if (b.k === 1 || b.k % 4 === 1) {
        ctx.fillStyle = b.used ? "rgba(94,243,154,0.7)" : "rgba(154,167,163,0.4)";
        ctx.font = `${9 * dpr}px Geist Mono, monospace`;
        ctx.fillText(String(b.k), x + 2 * dpr, H - 2 * dpr);
      }
    }
  }, [bars]);

  return (
    <div className="subsection">
      <SubHead n="3.1" title="Every waveform is a sum of sines." />

      <div className="sub-body">
        <p>
          The Fourier theorem says any periodic signal can be reconstructed as a sum of pure sine
          waves at integer multiples of a fundamental frequency. A square wave is just{" "}
          <code>sin(t)/1 + sin(3t)/3 + sin(5t)/5 + …</code> Add enough terms and the wiggly sum
          stiffens into right angles. The <em className="serif">Fourier transform</em> goes the
          other way: given a chunk of audio, it returns the amplitude of each sine that was
          needed to build it.
        </p>
        <p>
          That&apos;s the whole job of a spectrum analyser. The transform takes 256 samples of
          time-domain audio and hands back 256 numbers describing how much energy is at each
          frequency. The first half is everything below the Nyquist limit. The other half is
          a mirror image — symmetry of real-valued input.
        </p>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "260px 1fr", gap: 24, marginTop: 28
      }}>
        <div className="fft-controls">
          <div className="ctl-section">
            <h4>Target shape</h4>
            <div className="seg" style={{gridTemplateColumns: "repeat(3, 1fr)"}}>
              <button className={shape === "square" ? "on" : ""}   onClick={() => setShape("square")}>Square</button>
              <button className={shape === "saw" ? "on" : ""}      onClick={() => setShape("saw")}>Saw</button>
              <button className={shape === "triangle" ? "on" : ""} onClick={() => setShape("triangle")}>Tri</button>
            </div>
          </div>
          <div className="ctl-section">
            <h4>Harmonics summed</h4>
            <div className="slider-row">
              <div className="lbl"><span className="name">count</span><span className="val">{harm}</span></div>
              <input type="range" min="1" max="20" step="1" value={harm} onChange={e => setHarm(+e.target.value)} />
            </div>
            <p style={{fontSize: 12.5, color: "var(--ink-mute)", marginTop: 12, lineHeight: 1.5}}>
              Drag from 1 upward and watch a single sine wave grow corners. The phantom
              amber outline is the target shape — what infinite harmonics would give you.
            </p>
          </div>
        </div>

        <div style={{display: "grid", gridTemplateRows: "1fr 1fr", gap: 16}}>
          <div className="plot-frame">
            <div className="ptitle">
              <span>TIME DOMAIN · sum of {harm} harmonic{harm === 1 ? "" : "s"}</span>
              <span><b style={{color: "var(--amber)"}}>┄┄</b>&nbsp;target &nbsp; <b>━━</b>&nbsp;sum</span>
            </div>
            <canvas ref={waveRef} style={{height: 170}}></canvas>
          </div>
          <div className="plot-frame">
            <div className="ptitle">
              <span>FREQUENCY DOMAIN · harmonic amplitudes</span>
              <span><b>━━</b>&nbsp;used &nbsp; <b style={{color: "var(--ink-mute)"}}>━━</b>&nbsp;available</span>
            </div>
            <canvas ref={harmRef} style={{height: 140}}></canvas>
          </div>
        </div>
      </div>

      <div className="callout">
        <b>The reverse direction.</b> If a square wave decomposes into harmonics, then a chunk of
        microphone audio decomposes into something messier — hundreds of tiny sines, each at a
        different amplitude, all summing into the waveform that hit your eardrum. The FFT&apos;s
        job is to <em className="serif">unmix</em> them. The bottom row of Spectrum Analyser is
        a continuous, live unmixing.
      </div>
    </div>
  );
}

/* ============================================================
   3.2 — COST: N² vs N·log N
   ============================================================ */
function CostSection() {
  const chartRef = useRefF(null);

  useEffectF(() => {
    const c = chartRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    const padL = 50 * dpr, padR = 12 * dpr, padT = 14 * dpr, padB = 30 * dpr;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    // log-log
    const Ns = [];
    for (let i = 8; i <= 4096; i *= 2) Ns.push(i);
    const xMin = Math.log2(8), xMax = Math.log2(4096);
    const yMin = Math.log10(50);
    const yMax = Math.log10(18_000_000);
    const X = (n) => padL + ((Math.log2(n) - xMin) / (xMax - xMin)) * plotW;
    const Y = (v) => padT + plotH - ((Math.log10(v) - yMin) / (yMax - yMin)) * plotH;

    // grid + axis labels
    ctx.strokeStyle = "rgba(94,243,154,0.07)";
    ctx.fillStyle = "rgba(154,167,163,0.7)";
    ctx.font = `${10 * dpr}px Geist Mono, monospace`;
    ctx.lineWidth = 1;
    for (const n of [8, 32, 128, 512, 2048]) {
      const x = X(n);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
      ctx.fillText(`N=${n}`, x - 14 * dpr, padT + plotH + 16 * dpr);
    }
    for (const yv of [1e2, 1e4, 1e6]) {
      const y = Y(yv);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      const lbl = yv >= 1e6 ? `10⁶` : yv >= 1e4 ? `10⁴` : yv >= 1e2 ? `10²` : String(yv);
      ctx.fillText(lbl, padL - 36 * dpr, y + 3 * dpr);
    }

    // N² curve (red)
    ctx.strokeStyle = "#ff6b6b";
    ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath();
    for (let i = 0; i < Ns.length; i++) {
      const n = Ns[i], v = n * n;
      i === 0 ? ctx.moveTo(X(n), Y(v)) : ctx.lineTo(X(n), Y(v));
    }
    ctx.stroke();
    // dots
    for (const n of Ns) {
      const v = n * n;
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath(); ctx.arc(X(n), Y(v), 3 * dpr, 0, Math.PI * 2); ctx.fill();
    }

    // N log2 N curve (phos)
    ctx.strokeStyle = "#5ef39a";
    ctx.lineWidth = 1.8 * dpr;
    ctx.beginPath();
    for (let i = 0; i < Ns.length; i++) {
      const n = Ns[i], v = n * Math.log2(n);
      i === 0 ? ctx.moveTo(X(n), Y(v)) : ctx.lineTo(X(n), Y(v));
    }
    ctx.stroke();
    for (const n of Ns) {
      const v = n * Math.log2(n);
      ctx.fillStyle = "#5ef39a";
      ctx.beginPath(); ctx.arc(X(n), Y(v), 3 * dpr, 0, Math.PI * 2); ctx.fill();
    }

    // Highlight N=256 vertical line
    ctx.strokeStyle = "rgba(255,184,77,0.5)";
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath(); ctx.moveTo(X(256), padT); ctx.lineTo(X(256), padT + plotH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffb84d";
    ctx.fillText("Spectrum's choice", X(256) - 70 * dpr, padT + 12 * dpr);
  }, []);

  const rows = [
    { n: 32,   p: "1,024",       f: "160",     s: "6×" },
    { n: 128,  p: "16,384",      f: "896",     s: "18×" },
    { n: 256,  p: "65,536",      f: "2,048",   s: "32×" },
    { n: 1024, p: "1,048,576",   f: "10,240",  s: "102×" },
    { n: 4096, p: "16,777,216",  f: "49,152",  s: "341×" },
  ];

  return (
    <div className="subsection">
      <SubHead n="3.2" title={<>Why it&rsquo;s called <em className="serif">fast</em>.</>} />

      <div className="sub-body">
        <p>
          The naïve discrete Fourier transform multiplies every input sample by every output
          frequency. The cost is <code>N²</code>. For N=256 that&apos;s 65,536 complex multiplies
          per frame. At 23 ms per frame on a 486, that&apos;s already a lot.
        </p>
        <p>
          The Fast Fourier Transform, discovered by Cooley and Tukey in 1965, exploits the
          symmetry of the twiddle factors to fold the computation in half, then in half again,
          recursively. The cost collapses to <code>N · log₂ N</code>. For N=256 that&apos;s
          2,048 multiplies — a <b>32× speedup</b> for the same result. The bigger the N,
          the bigger the win.
        </p>
        <p>
          Spectrum Analyser&apos;s implementation is the classic <em className="serif">Danielson-Lanczos</em>{" "}
          radix-2 butterfly: do a bit-reversal permutation of the input, then in <code>log₂ N</code> passes,
          combine adjacent pairs into larger pairs, accumulating the twiddle phase as you go. You can
          find this loop in <code>CALCTHRD.CPP</code> — it&apos;s the section labelled
          &ldquo;The Danielson-Lanczos section of the routine begins here.&rdquo;
        </p>
      </div>

      <div className="cost-grid">
        <div className="cost-chart">
          <canvas ref={chartRef}></canvas>
          <div className="legend">
            <span><span className="sw" style={{background:"#ff6b6b"}}></span>DFT · N²</span>
            <span><span className="sw" style={{background:"#5ef39a"}}></span>FFT · N·log₂N</span>
          </div>
        </div>
        <div className="cost-table">
          <table>
            <thead>
              <tr><th>N</th><th>DFT</th><th>FFT</th><th>Speedup</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.n}{r.n === 256 ? <span className="dim"> ←</span> : null}</td>
                  <td className="dim">{r.p}</td>
                  <td>{r.f}</td>
                  <td className="phos">{r.s}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{fontSize: 12, color: "var(--ink-mute)", marginTop: 14, lineHeight: 1.55, fontFamily: "var(--sans)"}}>
            From Davidson&apos;s own help file: &ldquo;a buffer of 256 samples → 65,535
            calculations for the DFT, but 128·8 = 1,024 for the FFT.&rdquo;
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   3.3 — INTEGERS, FIXED-POINT, 486
   ============================================================ */
function IntegerSection() {
  return (
    <div className="subsection">
      <SubHead n="3.3" title="Why integers. Why fixed-point." />

      <div className="sub-body">
        <p>
          A 1996 textbook FFT would use double-precision floats. Spectrum Analyser deliberately
          does not. Every sample, every twiddle factor, every accumulator is a 32-bit signed
          integer. The reason is in the target hardware.
        </p>
        <p>
          The minimum system that ran this code was an <b>Intel 486DX2-66</b> — a chip that
          billed itself as having an on-die floating-point unit, but in practice that FPU was{" "}
          <em className="serif">slow</em>. A 32-bit integer multiply on the 486 took about
          16 clock cycles; an FMUL took 16 too, but FADD took 8–20 and pipelined poorly. Worse,
          context-switching the FPU state across an interrupt — and a sound-card callback IS
          an interrupt — meant saving the entire 80-byte FPU register file. Integer code didn&apos;t
          pay that tax.
        </p>
      </div>

      <div className="budget-grid">
        <div className="budget-card">
          <div className="head">Target — minimum spec</div>
          <div className="big">486DX2-66</div>
          <div className="small">~54 MIPS · 25 MFLOPS theoretical</div>
          <ul>
            <li><b>8 KB</b> on-die L1 unified cache. The FFT&apos;s 1 KB raw-data buffer fits — but the twiddle table doesn&apos;t, so it&apos;s recomputed inline.</li>
            <li>FPU present but <b>4× slower</b> per FMUL than the Pentium that would follow it a year later.</li>
            <li><b>16 MB RAM</b> typical. The whole app&apos;s working set stays under 1 MB.</li>
          </ul>
        </div>
        <div className="budget-card">
          <div className="head">Frame budget — 11 kHz</div>
          <div className="big">23.2 ms</div>
          <div className="small">256 samples ÷ 11,025 Hz</div>
          <ul>
            <li>~<b>1.25 M</b> instructions per frame at 54 MIPS — and the FFT alone wants ~30K cycles.</li>
            <li>GDI <code>Polyline</code> and <code>FillRect</code> for four scopes eat at least as much again.</li>
            <li>That&apos;s why drawing happens <em className="serif">in the calc thread</em>, not posted back to the UI: every PostMessage hop was a luxury the budget couldn&apos;t afford.</li>
          </ul>
        </div>
      </div>

      <p className="sub-body" style={{marginTop: 28}}>
        The trick that makes all-integer DSP work is{" "}
        <em className="serif">fixed-point arithmetic</em>. Every &ldquo;real&rdquo; number is
        multiplied by a constant (here, <code>4096 = 2¹²</code>) and stored as an integer. Multiplications
        then come back scaled by <code>2²⁴</code>, so you shift right by 12 to bring them home. The
        decimal point isn&apos;t really there — it&apos;s implied by where you choose to shift.
      </p>

      <div className="fp-split">
        <div className="fp-card">
          <div className="h">If it were floating point</div>
<pre>{
`/* the "natural" version */
double theta = 2.0 * M_PI / mmax;
double wpr   = cos(theta);
double wpi   = sin(theta);
double wr    = 1.0, wi = 0.0;

tempr = wr * data[j]
      - wi * data[j+1];
tempi = wr * data[j+1]
      + wi * data[j];`
}</pre>
        </div>
        <div className="fp-card">
          <div className="h">What CALCTHRD.CPP actually does</div>
<pre dangerouslySetInnerHTML={{ __html:
`<span class="c">/* 4096 = 2&sup1;&sup2; is the implied "1.0" */</span>
theta = <span class="n">6.2831</span>/mmax;
wpr   = <span class="hl">long(4096.0 * sin(0.5*theta))</span>;
wpr   = (-2*wpr*wpr) <span class="hl">&gt;&gt; 12</span>;
wpi   = long(4096.0 * sin(theta));
wr    = <span class="n">4096</span>; wi = <span class="n">0</span>;

tempr = ((wr * data[j])   <span class="hl">&gt;&gt; 12</span>)
      - ((wi * data[j+1]) <span class="hl">&gt;&gt; 12</span>);
tempi = ((wr * data[j+1]) <span class="hl">&gt;&gt; 12</span>)
      + ((wi * data[j])   <span class="hl">&gt;&gt; 12</span>);`
        }} />
        </div>
      </div>

      <div className="callout">
        <b>The cost.</b> Every shift loses precision. After 8 stages of butterflies the
        magnitude can grow by up to 8 bits — which is why the code finally does
        <code> rawData[m] &gt;&gt; (18 − 8) </code>at the end, normalising the result back into
        an 8-bit display range. Engineers used to call this kind of code{" "}
        <em className="serif">block floating-point</em>: you carry an exponent for the whole
        buffer instead of per sample.
      </div>
    </div>
  );
}

/* ============================================================
   3.4 — ALIASING / NYQUIST
   ============================================================ */
function AliasingSection() {
  const [freq, setFreq] = useStateF(2200);
  const sr = 11025;
  const nyq = sr / 2;

  // alias frequency
  const aliasOf = (f) => {
    const r = ((f / sr) % 1 + 1) % 1;
    return r > 0.5 ? (1 - r) * sr : r * sr;
  };
  const aliased = freq > nyq;
  const perceived = aliasOf(freq);

  const cRef = useRefF(null);

  useEffectF(() => {
    const c = cRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);

    // grid + zero line
    ctx.strokeStyle = "rgba(94,243,154,0.07)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(0, (H * i) / 5); ctx.lineTo(W, (H * i) / 5); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(94,243,154,0.22)";
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

    // window: 4ms
    const winSec = 0.004;
    const npx = 1000;
    // continuous input — amber dashed
    ctx.strokeStyle = "rgba(255,184,77,0.55)";
    ctx.lineWidth = 1.2 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath();
    for (let i = 0; i <= npx; i++) {
      const t = (i / npx) * winSec;
      const v = Math.sin(2 * Math.PI * freq * t);
      const x = (i / npx) * W;
      const y = H / 2 - v * (H / 2 - 14);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // sampled dots
    const Ns = Math.ceil(winSec * sr);
    ctx.fillStyle = "#5ef39a";
    for (let n = 0; n <= Ns; n++) {
      const t = n / sr;
      if (t > winSec) break;
      const v = Math.sin(2 * Math.PI * freq * t);
      const x = (t / winSec) * W;
      const y = H / 2 - v * (H / 2 - 14);
      ctx.beginPath(); ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2); ctx.fill();
    }

    // perceived alias — bright phos solid
    if (aliased) {
      ctx.strokeStyle = "#5ef39a";
      ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath();
      // perceived sine has frequency `perceived`, but the *sign* of the
      // alias depends on which side of Nyquist the fold lands. For visualization,
      // sweep through the same sample dots: this is the unique band-limited reconstruction.
      // Easiest: plot sin(2π · alias_freq · t) with phase matched to fit dots.
      // We'll find phase by matching first dot.
      const firstSampleVal = Math.sin(2 * Math.PI * freq * 0);
      // phase φ such that sin(φ) = firstSampleVal → φ = asin(...)
      // Then plot sin(2π·perceived·t + φ).
      const phi = Math.asin(firstSampleVal);
      // determine sign by checking second sample
      const t1 = 1 / sr;
      const expected = Math.sin(2 * Math.PI * freq * t1);
      const cand1 = Math.sin(2 * Math.PI * perceived * t1 + phi);
      const cand2 = Math.sin(2 * Math.PI * perceived * t1 + (Math.PI - phi));
      const useFlip = Math.abs(cand2 - expected) < Math.abs(cand1 - expected);
      const phase = useFlip ? (Math.PI - phi) : phi;
      for (let i = 0; i <= npx; i++) {
        const t = (i / npx) * winSec;
        const v = Math.sin(2 * Math.PI * perceived * t + phase);
        const x = (i / npx) * W;
        const y = H / 2 - v * (H / 2 - 14);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [freq, perceived, aliased]);

  return (
    <div className="subsection">
      <SubHead n="3.4" title="Aliasing — what the sampling rate steals." />

      <div className="sub-body">
        <p>
          Sampling a continuous signal at a finite rate puts a hard ceiling on the frequencies
          you can ever see. The <em className="serif">Nyquist–Shannon</em> theorem says the
          ceiling is half the sampling rate. At Spectrum Analyser&apos;s default of 11.025 kHz,
          that ceiling is <b>5,512 Hz</b>. Anything above it doesn&apos;t simply vanish — it{" "}
          <em className="serif">folds back</em> into a phantom frequency below the ceiling, identical
          to a real signal at that lower pitch. This is aliasing.
        </p>
        <p>
          A real spectrum analyser would put an anti-aliasing low-pass filter in hardware before
          the ADC. Davidson&apos;s app trusts the sound card&apos;s analog filter to do that, then
          discards the upper half of the FFT anyway. Move the slider above the dashed Nyquist line
          and watch the perceived frequency walk back down.
        </p>
      </div>

      <div className="alias-grid">
        <div className="alias-controls">
          <h4 style={{fontFamily:"var(--mono)",fontSize:10,letterSpacing:"0.18em",color:"var(--ink-mute)",textTransform:"uppercase",fontWeight:500,margin:"0 0 14px 0"}}>Input frequency</h4>
          <div className="slider-row">
            <div className="lbl"><span className="name">f</span><span className="val" style={{color: aliased ? "var(--red)" : "var(--phos)"}}>{freq.toLocaleString()} Hz</span></div>
            <input type="range" min="100" max="22000" step="50" value={freq} onChange={e => setFreq(+e.target.value)} />
          </div>
          <div style={{
            position: "relative", marginTop: 20,
            height: 6, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 3,
          }}>
            <div style={{
              position: "absolute", left: `${(nyq/22000)*100}%`, top: -6, bottom: -6,
              width: 1, background: "var(--amber)",
            }}></div>
            <div style={{
              position: "absolute", left: `${(freq/22000)*100}%`, top: -3, bottom: -3,
              width: 2, background: aliased ? "var(--red)" : "var(--phos)",
              boxShadow: aliased ? "0 0 8px var(--red)" : "0 0 8px var(--phos)",
            }}></div>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-mute)", marginTop: 6,
            letterSpacing: "0.12em",
          }}>
            <span>0</span>
            <span style={{color: "var(--amber)"}}>nyq · 5.5k</span>
            <span>22k</span>
          </div>

          <p style={{fontSize: 12.5, color: "var(--ink-mute)", marginTop: 18, lineHeight: 1.5}}>
            The amber dashes are the true input wave. Green dots are what the ADC sampled.
            When you cross the amber Nyquist line, a bright green sine appears — that&apos;s
            the alias the FFT will report.
          </p>
        </div>

        <div className="alias-plot">
          <canvas ref={cRef}></canvas>
          <div className="alias-readout">
            <div>Input&nbsp;·&nbsp; <b>{freq.toLocaleString()} Hz</b></div>
            <div>Sample rate&nbsp;·&nbsp; <b style={{color: "var(--ink)"}}>{sr.toLocaleString()} Hz</b></div>
            <div>Nyquist&nbsp;·&nbsp; <b style={{color: "var(--amber)"}}>{nyq.toLocaleString()} Hz</b></div>
            <div className={aliased ? "aliased" : ""}>FFT sees&nbsp;·&nbsp; <b>{Math.round(perceived).toLocaleString()} Hz</b>{aliased ? " ← alias" : ""}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   3.5 — WINDOW GALLERY
   ============================================================ */
function WindowCard({ name, key2, sub, sideLobe }) {
  const shapeRef = useRefF(null);
  const fRespRef = useRefF(null);
  const wf = WINDOWS[key2];

  useEffectF(() => {
    // shape
    {
      const c = shapeRef.current; if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const r = c.getBoundingClientRect();
      c.width = r.width * dpr; c.height = r.height * dpr;
      const ctx = c.getContext("2d");
      const W = c.width, H = c.height;
      ctx.clearRect(0, 0, W, H);
      // baseline
      ctx.strokeStyle = "rgba(94,243,154,0.12)";
      ctx.beginPath(); ctx.moveTo(0, H - 1); ctx.lineTo(W, H - 1); ctx.stroke();
      const N = 256;
      ctx.strokeStyle = "#5ef39a";
      ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const v = wf(i, N);
        const x = (i / (N - 1)) * W;
        const y = H - 4 * dpr - v * (H - 8 * dpr);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // freq response (FFT of zero-padded window)
    {
      const c = fRespRef.current; if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const r = c.getBoundingClientRect();
      c.width = r.width * dpr; c.height = r.height * dpr;
      const ctx = c.getContext("2d");
      const W = c.width, H = c.height;
      ctx.clearRect(0, 0, W, H);
      // compute
      const Nw = 64;
      const Nf = 2048;
      const re = new Float32Array(Nf), im = new Float32Array(Nf);
      for (let i = 0; i < Nw; i++) re[i + (Nf - Nw) / 2] = wf(i, Nw);
      fft(re, im);
      // shift & log
      const mag = new Float32Array(Nf);
      for (let i = 0; i < Nf; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      let peak = 0;
      for (let i = 0; i < Nf; i++) peak = Math.max(peak, mag[i]);
      // plot dB, only show ±32 bins around DC (which is at index 0)
      // because of FFT layout DC is at 0 and Nyquist at Nf/2, so the response is symmetric
      // around 0. Plot bins [-32 ... +32].
      const span = 80;
      const minDb = -90;
      // axis grid
      ctx.strokeStyle = "rgba(94,243,154,0.08)";
      ctx.fillStyle = "rgba(154,167,163,0.7)";
      ctx.font = `${9 * dpr}px Geist Mono, monospace`;
      for (const db of [-20, -40, -60, -80]) {
        const y = ((db - 0) / minDb) * H;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.fillText(`${db}`, 2 * dpr, y - 2 * dpr);
      }
      // plot
      ctx.strokeStyle = "#5ef39a";
      ctx.lineWidth = 1.4 * dpr;
      ctx.beginPath();
      for (let k = -span; k <= span; k++) {
        const idx = (k + Nf) % Nf;
        const m = mag[idx] / peak;
        const db = Math.max(minDb, 20 * Math.log10(m + 1e-12));
        const x = ((k + span) / (2 * span)) * W;
        const y = (db / minDb) * H;
        (k === -span) ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [key2]);

  return (
    <div className="win-card">
      <div className="nm">{name}</div>
      <div className="sub">{sub}</div>
      <canvas ref={shapeRef} className="ws"></canvas>
      <canvas ref={fRespRef} className="wf"></canvas>
      <div className="meta">
        <span>side-lobe</span>
        <span><b>{sideLobe}</b></span>
      </div>
    </div>
  );
}

function WindowSection({ children }) {
  return (
    <div className="subsection">
      <SubHead n="3.5" title="Windows — taming the leak." />

      <div className="sub-body">
        <p>
          The FFT assumes the 256-sample chunk you hand it is one period of a perfectly
          periodic signal. Real audio almost never is. The two ends of the buffer don&apos;t
          line up, and that discontinuity smears every sharp frequency peak into a sticky
          mess of false neighbours. The technical name is{" "}
          <em className="serif">spectral leakage</em>.
        </p>
        <p>
          The fix is to multiply the buffer, before the FFT, by an envelope that smoothly
          tapers both ends to zero. That envelope is called a window function. Different
          windows make different trade-offs between how narrow the main peak stays and how
          quickly the side-lobes fall away. The four below are the four Spectrum Analyser
          ships — and the four it never actually applies (<em className="serif">see §08·02</em>).
        </p>
      </div>

      <div className="win-grid">
        <WindowCard name="Rectangle" key2="none"           sub="No window"     sideLobe="-13 dB" />
        <WindowCard name="Hamming"   key2="hamming"        sub="0.54 - 0.46·cos" sideLobe="-43 dB" />
        <WindowCard name="Hanning"   key2="hanning"        sub="½(1 - cos)"    sideLobe="-32 dB" />
        <WindowCard name="Blackman-H" key2="blackmanharris" sub="3-term cos"   sideLobe="-92 dB" />
      </div>

      <div className="callout" style={{borderLeftColor: "var(--amber)"}}>
        <b>Reading the cards.</b> The top trace is the window in time — the envelope that
        gets multiplied with your audio buffer. The bottom trace is the same window&apos;s
        own spectrum, on a dB scale. The flatter the side-lobes (the curves to the left and
        right of the central spike), the less leakage. Blackman-Harris is the cleanest, at
        the cost of a wider main peak — a worse pitch resolution.
      </div>

      {/* the live 3-sine demo */}
      {children}
    </div>
  );
}

/* ============================================================
   3.6 — LIVE FFT (existing 3-sine demo)
   ============================================================ */
function LiveFftDemo() {
  const [f1, setF1] = useStateF(440);
  const [a1, setA1] = useStateF(0.8);
  const [f2, setF2] = useStateF(1320);
  const [a2, setA2] = useStateF(0.35);
  const [f3, setF3] = useStateF(2100);
  const [a3, setA3] = useStateF(0.15);
  const [noise, setNoise] = useStateF(0.05);
  const [win, setWin] = useStateF("none");

  const N = 512;
  const sampleRate = 11025;

  const { samples, mag, windowed } = useMemoF(() => {
    const samples = new Float32Array(N);
    const wf = WINDOWS[win];
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    const windowed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = i / sampleRate;
      let s = a1 * Math.sin(2 * Math.PI * f1 * t)
            + a2 * Math.sin(2 * Math.PI * f2 * t)
            + a3 * Math.sin(2 * Math.PI * f3 * t)
            + (Math.random() * 2 - 1) * noise;
      samples[i] = s;
      const w = wf(i, N);
      windowed[i] = s * w;
      re[i] = s * w;
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float32Array(N / 2);
    for (let i = 0; i < N / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    return { samples, mag, windowed };
  }, [f1, a1, f2, a2, f3, a3, noise, win]);

  const tdRef = useRefF(null);
  const fdRef = useRefF(null);

  useEffectF(() => {
    const c = tdRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(94,243,154,0.08)";
    for (let i = 1; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(0, (H * i) / 8); ctx.lineTo(W, (H * i) / 8); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(94,243,154,0.22)";
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,184,77,0.35)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * W;
      const y = H / 2 - samples[i] * (H / 2 - 6);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = "#5ef39a";
    ctx.lineWidth = 1.4 * dpr;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * W;
      const y = H / 2 - windowed[i] * (H / 2 - 6);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [samples, windowed]);

  useEffectF(() => {
    const c = fdRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(94,243,154,0.08)";
    for (let i = 1; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(0, (H * i) / 5); ctx.lineTo(W, (H * i) / 5); ctx.stroke();
    }
    const bins = N / 2;
    let maxMag = 1;
    for (let i = 1; i < bins; i++) maxMag = Math.max(maxMag, mag[i]);
    const bw = W / bins;
    for (let i = 1; i < bins; i++) {
      const v = mag[i] / maxMag;
      const h = v * (H - 10);
      const x = i * bw;
      ctx.fillStyle = `rgba(94,243,154,${Math.min(1, 0.4 + v * 0.8)})`;
      ctx.fillRect(x, H - h, bw * 0.85, h);
    }
    ctx.fillStyle = "rgba(154,167,163,0.7)";
    ctx.font = `${10 * dpr}px Geist Mono, monospace`;
    for (let f = 0; f <= sampleRate / 2; f += 1000) {
      const i = (f / (sampleRate / 2)) * bins;
      const x = i * bw;
      if (x > W - 30 * dpr) continue;
      ctx.fillRect(x, H - 4, 1, 4);
      ctx.fillText(`${f / 1000}k`, x + 3 * dpr, H - 6 * dpr);
    }
  }, [mag]);

  const Slider = ({ name, v, set, min, max, step, unit }) => (
    <div className="slider-row">
      <div className="lbl"><span className="name">{name}</span><span className="val">{v.toFixed(step < 1 ? 2 : 0)}{unit}</span></div>
      <input type="range" min={min} max={max} step={step} value={v} onChange={e => set(+e.target.value)} />
    </div>
  );
  const WinBtn = ({ id, label }) => (
    <button className={win === id ? "on" : ""} onClick={() => setWin(id)}>{label}</button>
  );

  return (
    <div className="subsection">
      <SubHead n="3.6" title="Play the whole thing live." />

      <div className="sub-body">
        <p>
          Three sines, optional noise, the four windows. The plot below is the same
          dataflow the worker thread runs at 46 Hz on the 486 — just transposed to a
          modern browser. Try two close frequencies (e.g. 1000 Hz and 1100 Hz) with one
          tiny: <em className="serif">Rectangle</em> drowns the small peak in leakage;{" "}
          <em className="serif">Blackman-Harris</em> reveals it.
        </p>
      </div>

      <div className="fft-demo" style={{marginTop: 24}}>
        <div className="fft-controls">
          <div className="ctl-section">
            <h4>Source · 3 sines + noise</h4>
            <Slider name="f₁ freq"    v={f1} set={setF1} min={20}  max={5000} step={10}   unit=" Hz" />
            <Slider name="f₁ amp"     v={a1} set={setA1} min={0}   max={1}    step={0.01} unit="" />
            <Slider name="f₂ freq"    v={f2} set={setF2} min={20}  max={5000} step={10}   unit=" Hz" />
            <Slider name="f₂ amp"     v={a2} set={setA2} min={0}   max={1}    step={0.01} unit="" />
            <Slider name="f₃ freq"    v={f3} set={setF3} min={20}  max={5000} step={10}   unit=" Hz" />
            <Slider name="f₃ amp"     v={a3} set={setA3} min={0}   max={1}    step={0.01} unit="" />
            <Slider name="noise"      v={noise} set={setNoise} min={0} max={0.5} step={0.01} unit="" />
          </div>
          <div className="ctl-section">
            <h4>Window function</h4>
            <div className="seg">
              <WinBtn id="none" label="None" />
              <WinBtn id="hamming" label="Hamm." />
              <WinBtn id="hanning" label="Hann." />
              <WinBtn id="blackmanharris" label="B-H" />
            </div>
          </div>
        </div>

        <div className="fft-plots">
          <div className="plot-frame">
            <div className="ptitle">
              <span>SCOPE A · TIME DOMAIN · 512 pt @ 11.025 kHz</span>
              <span><b style={{color: "var(--amber)"}}>━━</b>&nbsp;raw &nbsp; <b>━━</b>&nbsp;windowed</span>
            </div>
            <canvas ref={tdRef} style={{height: 180}}></canvas>
          </div>
          <div className="plot-frame">
            <div className="ptitle">
              <span>SCOPE B · FREQUENCY DOMAIN · |X[k]|</span>
              <span><b>{win.toUpperCase()}</b> window</span>
            </div>
            <canvas ref={fdRef} style={{height: 180}}></canvas>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   FFT SECTION — composes all six subsections
   ============================================================ */
function FftSection() {
  return (
    <section id="fft">
      <div className="wrap">
        <div className="section-head">
          <div className="num"><b>03</b> / 09 — Inside the FFT</div>
          <div>
            <h2>Inside the FFT.</h2>
            <p className="lede" style={{marginTop: 18}}>
              Everything the worker thread does in 23 milliseconds, taken apart. Why the
              transform exists at all, why it&apos;s called <em className="serif">fast</em>, why
              this version is written entirely in integers, what the sampling rate gives up,
              and what windowing does to clean up the residue.
            </p>
          </div>
        </div>

        <FourierBuilder />
        <CostSection />
        <IntegerSection />
        <AliasingSection />
        <WindowSection>
          <LiveFftDemo />
        </WindowSection>
      </div>
    </section>
  );
}

/* expose */
Object.assign(window, {
  FftSection,
  fft,
  WINDOWS,
});
