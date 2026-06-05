/* patterns.jsx — clickable pattern cards, use cases, do/don't, glossary. */
const { useState: useStateP } = React;

function PatternCard({ p }) {
  const [open, setOpen] = useStateP(false);
  return (
    <div className={"cw-pcard" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)} style={{ borderTopColor: p.color }}>
      <div className="top">
        <div className="badge" style={{ background: p.color }}>{p.name[0]}</div>
        <h3>{p.name}</h3>
        <div className="tag">{p.tagline}</div>
      </div>
      <div className="body">
        <div className="row"><span className="k">When to reach for it</span>{p.when}</div>
        <div className="row"><span className="k">How it runs</span>{p.how}</div>
        <div className="row"><span className="k">Example prompt</span><div className="ex">{p.example}</div></div>
        <div className="gag">“{p.gag}”</div>
      </div>
      <div className="more">{open ? "▴ less" : "▾ more"}</div>
    </div>
  );
}

function Patterns() {
  return (
    <section id="patterns" className="cw-section">
      <CWReveal>
        <span className="cw-eyebrow">§ typical patterns</span>
        <h2 className="cw-h2">Six shapes that <span style={{ color: "var(--cw-purple)" }}>keep showing up</span>.</h2>
        <p className="cw-lede">
          Workflows aren't magic — they're a handful of repeatable choreographies. Click any card to
          unfold when to use it, how it runs, and a prompt to copy. The trick is matching the shape to
          the job (the quiz below will test you).
        </p>
      </CWReveal>
      <CWReveal className="cw-cards">
        {window.PATTERNS.map((p) => <PatternCard key={p.id} p={p} />)}
      </CWReveal>
    </section>
  );
}

function UseCases() {
  return (
    <section id="use" className="cw-section">
      <CWReveal>
        <span className="cw-eyebrow">§ what they're for</span>
        <h2 className="cw-h2">Work you'd plan in <span style={{ color: "var(--cw-red)" }}>quarters</span> — done in days.</h2>
        <p className="cw-lede">
          Dynamic workflows are built for the big, parallel, long-running jobs a single pass struggles
          with — runs that can stretch into hours or days, on complex and legacy codebases alike.
        </p>
      </CWReveal>
      <CWReveal className="cw-usegrid">
        {window.USE_CASES.map((u, i) => (
          <div key={i} className="cw-use" style={{ borderTopColor: u.color }}>
            <h4>{u.title}</h4>
            <p>{u.body}</p>
          </div>
        ))}
      </CWReveal>

      <CWReveal className="cw-card tilt-l" style={{ marginTop: 26, padding: "20px 22px", borderTopWidth: 10, borderTopColor: "var(--cw-teal)" }}>
        <div className="cw-chip" style={{ borderColor: "var(--cw-teal)", marginBottom: 10 }}>★ the famous one</div>
        <h3 style={{ fontFamily: "var(--cw-display)", fontSize: 26, margin: "0 0 6px" }}>The Bun rewrite</h3>
        <p style={{ margin: 0, fontSize: 16 }}>
          Jarred Sumner used dynamic workflows to port Bun from <b>Zig to Rust</b>: ~750,000 lines, with
          <b> 99.8% of the existing test suite passing</b>, in <b>eleven days</b> from first commit to merge.
          One workflow mapped the right Rust lifetime for every struct field; the next wrote each
          behaviour-identical <code>.rs</code> file with hundreds of agents in parallel and two reviewers
          on each; a fix loop drove the build and tests green; an overnight workflow then tidied up
          unnecessary copies and opened a PR for each.
        </p>
        <p className="cw-serif-cap" style={{ marginBottom: 0 }}>It did not, at any point, require a shrubbery.</p>
      </CWReveal>
    </section>
  );
}

function Practice() {
  return (
    <section id="practice" className="cw-section">
      <CWReveal>
        <span className="cw-eyebrow">§ good practice & pitfalls</span>
        <h2 className="cw-h2">The <span style={{ color: "var(--cw-green)" }}>do</span>s and the <span style={{ color: "var(--cw-red)" }}>don't</span>s.</h2>
        <p className="cw-lede">
          A workflow is a power tool. Used well it finishes a quarter's work in days; used carelessly it's
          a very expensive way to rename a variable. The difference is mostly discipline.
        </p>
      </CWReveal>
      <CWReveal className="cw-dd-wrap">
        <div className="cw-dd-col dos">
          <div className="head">✓ Do</div>
          {window.DOS.map((x, i) => (
            <div key={i} className="cw-dd-item"><b>{x.t}</b><p>{x.d}</p></div>
          ))}
        </div>
        <div className="cw-dd-col donts">
          <div className="head">✕ Don't</div>
          {window.DONTS.map((x, i) => (
            <div key={i} className="cw-dd-item"><b>{x.t}</b><p>{x.d}</p></div>
          ))}
        </div>
      </CWReveal>

      <div className="cw-note" style={{ borderLeftColor: "var(--cw-orange)" }}>
        <b>Getting started, briefly:</b> on Max / Team / API it's on by default; on Enterprise an admin
        flips it on. Either ask Claude to <i>“create a workflow,”</i> or switch on <code>ultracode</code> in
        the effort menu (xhigh effort + automatic workflow orchestration). Want a safe first taste? Run the
        bundled <code>/deep-research</code> on a bounded question and watch the meter.
      </div>
    </section>
  );
}

function GlossTerm({ g }) {
  const [open, setOpen] = useStateP(false);
  return (
    <div className={"cw-gterm" + (open ? " open" : "")}>
      <button className="q" onClick={() => setOpen((o) => !o)}>
        <span>{g.term}</span><span className="pm">{open ? "–" : "+"}</span>
      </button>
      <div className="a">{g.def}</div>
    </div>
  );
}

function Glossary() {
  return (
    <section id="glossary" className="cw-section">
      <CWReveal>
        <span className="cw-eyebrow">§ glossary</span>
        <h2 className="cw-h2">Words, <span style={{ color: "var(--cw-blue)" }}>defined</span>.</h2>
        <p className="cw-lede">The vocabulary, minus the jargon fog. Tap a term to expand it.</p>
      </CWReveal>
      <CWReveal className="cw-gloss">
        {window.GLOSSARY.map((g, i) => <GlossTerm key={i} g={g} />)}
      </CWReveal>
    </section>
  );
}

Object.assign(window, { Patterns, UseCases, Practice, Glossary });
