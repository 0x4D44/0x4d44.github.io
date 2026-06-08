/* anatomy.jsx — the parts of the S-1 + the working group */

function Anatomy() {
  const parts = window.ANATOMY;
  const [active, setActive] = React.useState(0);
  const p = parts[active];

  return (
    <Section id="anatomy">
      <SectionHead
        num="§ 02 — Anatomy"
        title='What is <span class="serif">inside</span> the document'
        intro="A modern S-1 runs 200–700 pages and follows a fixed skeleton. Walk the eleven parts — the order rarely changes, because the SEC and the market both know exactly where to look."
      />

      <div className="anatomy-grid">
        <div className="toc">
          <div className="toc-head">
            <span>Table of Contents</span>
            <span>FORM S-1</span>
          </div>
          {parts.map((part, i) => (
            <button
              key={part.n}
              className={"toc-item" + (i === active ? " active" : "")}
              onClick={() => setActive(i)}
            >
              <span className="ti-num">{part.n}</span>
              <span>
                <span className="ti-name">{part.name}</span>
                <span className="ti-len" style={{ display: "block" }}>{part.plain} · {part.len}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="anatomy-detail">
          <div className="ad-card">
            <div className="ad-tag">Part {p.n} · {p.len}</div>
            <h3 className="ad-title">{p.name}</h3>
            <div className="ad-plain">— {p.plain} —</div>
            <div className="ad-desc">
              {p.desc.map((d, i) => (
                <p key={i} dangerouslySetInnerHTML={{ __html: d }} />
              ))}
            </div>
            {p.quote && (
              <div className="ad-quote">"{p.quote}"</div>
            )}
          </div>
        </div>
      </div>

      {/* The working group */}
      <div style={{ marginTop: 56 }}>
        <SectionHead
          num="§ 02.5 — The Working Group"
          title='Who <span class="serif">builds</span> one'
          intro="A first-time filing is a four-to-six month grind that pulls in well over a hundred people across half a dozen firms. These are the seats around the drafting-session table."
        />
        <div className="crew">
          {window.WORKING_GROUP.map((c, i) => (
            <div className="crew-card" key={i}>
              <div className="crew-role">{c.role}</div>
              <div className="crew-who">{c.who}</div>
              <div className="crew-job">{c.job}</div>
            </div>
          ))}
        </div>
        <p className="note" style={{ marginTop: 16 }}>
          ▸ The drafting sessions — where every clause is read aloud and argued
          over — can run for days. The financial printer files the final document
          on EDGAR, often overnight, hours before the deal prices.
        </p>
      </div>
    </Section>
  );
}

window.Anatomy = Anatomy;
