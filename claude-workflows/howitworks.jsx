/* howitworks.jsx — the animated lifecycle player.
   A dark "stage" where the orchestrator fans out subagents, checks,
   gets attacked, converges, and delivers — driven by LIFECYCLE. */
const { useState: useStateW, useEffect: useEffectW, useRef: useRefW } = React;

const CW_PALETTE = [
  "var(--cw-red)", "var(--cw-blue)", "var(--cw-green)", "var(--cw-yellow)",
  "var(--cw-orange)", "var(--cw-purple)", "var(--cw-magenta)", "var(--cw-teal)",
];

const N_AGENTS = 14;

// position/appearance of agent i during a given phase key
function agentStyle(phase, i) {
  const n = N_AGENTS;
  const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
  const rx = 40, ry = 30; // % radii
  const cx = 50, cy = 50;
  const onRing = { left: cx + Math.cos(ang) * rx + "%", top: cy + Math.sin(ang) * ry + "%" };
  const center = { left: cx + "%", top: cy + "%" };
  const base = {
    width: 30, height: 30, marginLeft: -15, marginTop: -15,
    transition: "left .7s cubic-bezier(.3,.9,.3,1), top .7s cubic-bezier(.3,.9,.3,1), opacity .5s, transform .5s, background .4s, border-color .4s",
    background: CW_PALETTE[i % CW_PALETTE.length],
    fontSize: 12,
  };
  const adversary = i % 3 === 0;
  switch (phase) {
    case "plan":
      return { ...base, ...center, opacity: 0, transform: "scale(.3)" };
    case "fanout":
      return { ...base, ...onRing, opacity: 1, transform: "scale(1)" };
    case "check":
      return { ...base, ...onRing, opacity: 1, transform: "scale(1)", borderColor: "var(--cw-green)", boxShadow: "0 0 0 4px rgba(47,161,90,.5)" };
    case "refute":
      return {
        ...base, ...onRing, opacity: adversary ? 1 : 0.85,
        background: adversary ? "var(--cw-red)" : base.background,
        transform: adversary ? "scale(1.15)" : "scale(.92)",
        animation: adversary ? "cw-shake .5s ease-in-out infinite" : "none",
      };
    case "converge":
      return { ...base, left: cx + Math.cos(ang) * 9 + "%", top: cy + Math.sin(ang) * 7 + "%", opacity: 0.5, transform: "scale(.55)" };
    case "deliver":
      return { ...base, ...center, opacity: 0, transform: "scale(.2)" };
    default:
      return { ...base, ...center, opacity: 0 };
  }
}

function HowItWorks() {
  const steps = window.LIFECYCLE;
  const [idx, setIdx] = useStateW(0);
  const [playing, setPlaying] = useStateW(true);
  const timer = useRefW(null);
  const cur = steps[idx];

  useEffectW(() => {
    if (!playing) return;
    timer.current = setTimeout(() => setIdx((i) => (i + 1) % steps.length), 3400);
    return () => clearTimeout(timer.current);
  }, [idx, playing, steps.length]);

  const phase = cur.key;
  const orchScale = phase === "deliver" ? 1.9 : phase === "plan" ? 1.15 : 1;
  const orchBg = phase === "deliver" ? "var(--cw-yellow)" : "var(--cw-coral)";
  const orchGlyph = phase === "deliver" ? "★" : phase === "plan" ? "⌬" : "JS";

  return (
    <section id="how" className="cw-section">
      <CWReveal>
        <span className="cw-eyebrow">§ how it works</span>
        <h2 className="cw-h2">One prompt in. <span style={{ color: "var(--cw-magenta)" }}>One answer out.</span> Chaos in the middle.</h2>
        <p className="cw-lede">
          Press play and watch a workflow's life cycle. The orchestrator plans, fans the work out across
          subagents, checks every result, lets adversaries attack, and keeps iterating until the answers
          converge — then delivers one coordinated reply.
        </p>
      </CWReveal>

      <CWReveal className="cw-stage" style={{ marginTop: 24 }}>
        <div className="cw-stage-screen">
          {/* faint orbit ring */}
          <div aria-hidden="true" style={{
            position: "absolute", left: "50%", top: "50%", width: "80%", height: "60%",
            transform: "translate(-50%,-50%)", border: "1px dashed rgba(255,255,255,.14)", borderRadius: "50%",
          }}></div>

          {/* connector lines from orchestrator to agents (only while fanned out) */}
          <svg aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {["fanout", "check", "refute"].includes(phase) &&
              Array.from({ length: N_AGENTS }).map((_, i) => {
                const ang = (i / N_AGENTS) * Math.PI * 2 - Math.PI / 2;
                const x2 = 50 + Math.cos(ang) * 40;
                const y2 = 50 + Math.sin(ang) * 30;
                return <line key={i} x1="50%" y1="50%" x2={x2 + "%"} y2={y2 + "%"} stroke="rgba(255,255,255,.18)" strokeWidth="2" strokeDasharray="3 4" />;
              })}
          </svg>

          {/* the subagents */}
          {Array.from({ length: N_AGENTS }).map((_, i) => (
            <div key={i} className="cw-node" style={agentStyle(phase, i)}>
              {phase === "check" ? "✓" : phase === "refute" && i % 3 === 0 ? "⚔" : ""}
            </div>
          ))}

          {/* orchestrator */}
          <div className="cw-node" style={{
            left: "50%", top: "50%", width: 58, height: 58, marginLeft: -29, marginTop: -29,
            background: orchBg, color: "#1b1410", fontFamily: "var(--cw-display)", fontWeight: 700, fontSize: 18,
            transform: `scale(${orchScale})`,
            transition: "transform .6s cubic-bezier(.3,1.4,.4,1), background .5s",
            zIndex: 5, border: "3px solid #fff",
          }}>{orchGlyph}</div>

          {/* phase label, top-left */}
          <div style={{
            position: "absolute", top: 10, left: 12, fontFamily: "var(--cw-mono)", fontSize: 12,
            color: "#ffd98a", letterSpacing: 1, textTransform: "uppercase",
          }}>
            ▸ phase {idx + 1}/{steps.length}: {cur.label}
          </div>
        </div>

        {/* step pips */}
        <div className="cw-steptrack">
          {steps.map((s, i) => (
            <button
              key={s.key}
              className={"pip" + (i === idx ? " active" : "")}
              style={i === idx ? { background: s.color, borderColor: s.color } : null}
              onClick={() => { setIdx(i); setPlaying(false); }}
            >{s.label}</button>
          ))}
        </div>

        {/* controls */}
        <div className="cw-controls">
          <button className={"cw-btn " + (playing ? "" : "go")} onClick={() => setPlaying((p) => !p)}>
            {playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          <button className="cw-btn ghost" onClick={() => { setIdx((i) => (i + 1) % steps.length); setPlaying(false); }}>
            Step ▸
          </button>
          <span className="cw-chip" style={{ borderColor: cur.color }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: cur.color, display: "inline-block" }}></span>
            {cur.verb}
          </span>
        </div>

        {/* caption */}
        <div className="cw-caption">
          <div className="verb" style={{ color: cur.color }}>step {idx + 1} · {cur.label}</div>
          <h4>{cur.verb}</h4>
          <p style={{ margin: 0 }}>{cur.blurb}</p>
          <div className="gag">“{cur.gag}”</div>
        </div>
      </CWReveal>

      <div className="cw-note" style={{ borderLeftColor: "var(--cw-blue)" }}>
        <b>Why it beats one big pass:</b> agents attack the problem from independent angles, others try to
        refute what they found, and the run iterates until they agree. Progress is saved as it goes, so an
        interrupted job resumes instead of starting over. <span className="cw-serif-cap">It is not dead. It is resting.</span>
      </div>
    </section>
  );
}

Object.assign(window, { HowItWorks });
