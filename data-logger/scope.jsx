// ---------------------------------------------------------------------------
// scope.jsx — animated oscilloscope canvas for the hero
// ---------------------------------------------------------------------------
// Draws three rolling sensor traces (two temperature, one current) using a
// canvas so it stays cheap. The signal shapes are pure JS — no real data — but
// they're seeded to look plausibly like 24h of a fridge + ambient + a current
// draw, which is what the actual app graphs.
// ---------------------------------------------------------------------------

const Scope = () => {
  const ref = React.useRef(null);
  const timeRef = React.useRef(0);

  React.useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let raf = 0;
    let alive = true;

    const setSize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setSize();
    window.addEventListener("resize", setSize);

    // Three traces: red (chan A temp), amber (chan B temp), blue (current).
    const traces = [
      { color: "#e0833b", label: "CH1·LM19",     phase: 0.0, base: 0.45, amp: 0.10, freq: 0.45, jitter: 0.012, dash: [] },
      { color: "#d6c046", label: "CH2·MAX6608",  phase: 1.7, base: 0.55, amp: 0.07, freq: 0.62, jitter: 0.010, dash: [] },
      { color: "#5db4d8", label: "CH3·SC100L",   phase: 3.1, base: 0.70, amp: 0.18, freq: 1.10, jitter: 0.020, dash: [4,4] }
    ];

    const draw = () => {
      if (!alive) return;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // grid
      ctx.strokeStyle = "rgba(110,140,170,.18)";
      ctx.lineWidth = 1;
      const gridX = 12, gridY = 6;
      for (let i = 0; i <= gridX; i++) {
        const x = (i / gridX) * w;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let i = 0; i <= gridY; i++) {
        const y = (i / gridY) * h;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // centre line
      ctx.strokeStyle = "rgba(160,180,200,.22)";
      ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();

      const t = timeRef.current;
      const samples = Math.max(120, Math.floor(w / 4));

      traces.forEach((tr) => {
        ctx.strokeStyle = tr.color;
        ctx.lineWidth = 1.4;
        ctx.shadowColor = tr.color;
        ctx.shadowBlur = 6;
        if (tr.dash.length) ctx.setLineDash(tr.dash); else ctx.setLineDash([]);
        ctx.beginPath();
        for (let i = 0; i <= samples; i++) {
          const u = i / samples;
          const x = u * w;
          // layered sines + a tiny pseudo-random jitter (deterministic by i+t)
          const a = Math.sin((u * 6.28 * tr.freq) + tr.phase + t * 0.6);
          const b = Math.sin((u * 6.28 * tr.freq * 2.7) + tr.phase * 1.3 + t * 0.9) * 0.4;
          const j = (Math.sin(i * 12.9898 + t * 78.233) * 43758.5453) % 1;
          const y = h * (tr.base - (a + b) * tr.amp - j * tr.jitter);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);
      });

      // sweeping cursor
      const cursorX = ((Math.sin(t * 0.35) * 0.5 + 0.5)) * w;
      ctx.strokeStyle = "rgba(255,210,140,.45)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cursorX, 0); ctx.lineTo(cursorX, h); ctx.stroke();

      timeRef.current += 0.016;
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", setSize);
    };
  }, []);

  return (
    <div className="scope-frame">
      <div className="scope-head">
        <div className="group">
          <span className="lamp"></span>
          <span>DS1616 · COM3 · 9600 8N1</span>
        </div>
        <div className="group">
          <span style={{color:"#e0833b"}}>● CH1·LM19</span>
          <span style={{color:"#d6c046"}}>● CH2·MAX6608</span>
          <span style={{color:"#5db4d8"}}>● CH3·SC100L</span>
        </div>
        <div className="group">
          <span>15-MIN INT · 6Y BUFFER</span>
        </div>
      </div>
      <canvas className="scope" ref={ref} />
    </div>
  );
};

window.Scope = Scope;
