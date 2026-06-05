/* hero.jsx — topbar, hero, marquee, and the "what it is" intro. */
const { useState: useStateH } = React;

function RainbowWord({ text, className = "" }) {
  return (
    <span className={"cw-rainbow " + className}>
      {text.split("").map((c, i) => (
        <span key={i}>{c === " " ? "\u00A0" : c}</span>
      ))}
    </span>
  );
}

function TopBar() {
  const links = [
    ["what", "What it is"],
    ["how", "How it works"],
    ["build", "Build one"],
    ["patterns", "Patterns"],
    ["use", "Uses"],
    ["practice", "Do / Don't"],
    ["quiz", "Quiz"],
    ["glossary", "Glossary"],
  ];
  return (
    <div className="cw-topbar">
      <a className="cw-back" href="../index.html">← $ cd ..</a>
      <nav className="cw-toc">
        {links.map(([id, lbl]) => (
          <a key={id} href={"#" + id}>{lbl}</a>
        ))}
      </nav>
    </div>
  );
}

function Hero() {
  const f = window.CW_FACTS;
  return (
    <header className="cw-hero">
      <span className="cw-hero-stamp">⚗ {f.status} · {f.released}</span>
      <h1>
        <span className="pop">Dynamic</span>{" "}
        <RainbowWord text="Workflows" /><br />
        <span style={{ fontSize: "0.5em" }}>in Claude Code</span>
      </h1>
      <p className="sub">A completely different deep-dive.</p>
      <p className="blurb">
        You give Claude one prompt. It quietly writes an orchestration script, flings the work across
        <b> tens to hundreds of parallel subagents</b>, checks its own homework, lets other agents
        try to tear it apart, and hands you a single tidy answer. All without clogging your chat.
        <span className="cw-serif-cap"> It is glorious, and only occasionally silly.</span>
      </p>

      <div className="cw-stats">
        <div className="cw-stat" style={{ borderColor: "var(--cw-ink)" }}>
          <b>{f.subagents}</b><span>subagents / run</span>
        </div>
        <div className="cw-stat">
          <b>{f.bunLines}</b><span>lines ported (Bun)</span>
        </div>
        <div className="cw-stat">
          <b>{f.bunTests}</b><span>tests passing</span>
        </div>
        <div className="cw-stat">
          <b>{f.bunDays} days</b><span>commit → merge</span>
        </div>
      </div>

      <div style={{ marginTop: 26, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <a className="cw-btn go" href="#how">▶ Watch one run</a>
        <a className="cw-btn ghost" href="#build">⋔ Build one yourself</a>
        <button className="cw-btn" onClick={() => window.cwFireEgg("foot")}>🦶 Do NOT press this</button>
      </div>
    </header>
  );
}

function Marquee() {
  const items = [
    "AND NOW FOR SOMETHING COMPLETELY PARALLEL",
    "10s–100s OF SUBAGENTS",
    "IT'S NOT IDLE — IT'S RESTING",
    "CHECKED TWICE, THEN CHECKED AGAIN",
    "NOBODY EXPECTS THE TOKEN BILL",
  ];
  const row = [...items, ...items];
  return (
    <div className="cw-marquee" aria-hidden="true">
      <div className="track">
        {row.map((t, i) => <span key={i}>{t}</span>)}
      </div>
    </div>
  );
}

function Intro() {
  return (
    <section id="what" className="cw-section">
      <CWReveal>
        <span className="cw-eyebrow">§ what on earth is it</span>
        <h2 className="cw-h2">Not a prompt. A whole <span style={{ color: "var(--cw-blue)" }}>production line</span>.</h2>
        <p className="cw-lede">
          A normal Claude Code chat decides what to do turn by turn, and every result has to squeeze
          back into the conversation. A <b>dynamic workflow</b> is different: Claude writes a little
          JavaScript orchestration script, and a separate runtime executes it in the background.
        </p>
      </CWReveal>

      <CWReveal className="cw-builder-grid" style={{ marginTop: 26, gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="cw-card tilt-l" style={{ padding: 18 }}>
          <div className="cw-tape"></div>
          <h3 style={{ fontFamily: "var(--cw-display)", fontSize: 22, margin: "6px 0 8px" }}>The script holds the plan</h3>
          <p style={{ margin: 0, fontSize: 15.5 }}>
            Loops, branches, budgets and retries live in the orchestration script — <i>outside</i> your
            chat. That one distinction is basically the whole feature. The conversation stays light and
            responsive no matter how enormous the job gets.
          </p>
        </div>
        <div className="cw-card tilt-r" style={{ padding: 18 }}>
          <div className="cw-tape" style={{ background: "rgba(216,65,143,0.4)" }}></div>
          <h3 style={{ fontFamily: "var(--cw-display)", fontSize: 22, margin: "6px 0 8px" }}>Subagents do the labour</h3>
          <p style={{ margin: 0, fontSize: 15.5 }}>
            The script fans work across many subagents, each with its own context window. It sits a level
            <i> above</i> subagents: a single subagent is one investigation; a workflow is the repeatable
            choreography of dozens of them, checking each other's work.
          </p>
        </div>
      </CWReveal>

      <div className="cw-note">
        <b>Mental model:</b> a normal chat is you cooking one dish while talking to a friend. A workflow is
        you handing the friend a recipe card, and them returning hours later with a finished banquet, the
        washing-up done, and a note saying which bits they had to make twice. <span className="cw-serif-cap">You were never asked to chop anything.</span>
      </div>
    </section>
  );
}

Object.assign(window, { RainbowWord, TopBar, Hero, Marquee, Intro });
