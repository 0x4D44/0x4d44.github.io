/* cases.jsx — the famous documents */

function Cases() {
  const cases = window.CASES;
  const [active, setActive] = React.useState(0);
  const c = cases[active];

  return (
    <Section id="cases">
      <SectionHead
        num="§ 03 — The Casebook"
        title='The documents that <span class="serif">made history</span>'
        intro="Seven filings, four centuries. The prospectus is where ambition meets the sworn record — and the gap between the two is the whole story."
      />

      <div className="case-tabs">
        {cases.map((cc, i) => (
          <button
            key={cc.id}
            className={"case-tab" + (i === active ? " active" : "")}
            onClick={() => setActive(i)}
          >
            <span className="ct-yr">{cc.year}</span>
            <span>{cc.tab}</span>
          </button>
        ))}
      </div>

      <div className="case-card">
        <div className="case-top">
          <div className="case-main">
            <div className="case-verdict-tag" style={{ color: tierColor(c.tierClass) }}>
              ◉ {c.tier}
            </div>
            <h3 className="case-name">{c.name}</h3>
            <div className="case-sub">{c.sub}</div>
            <p className="case-blurb">{c.blurb}</p>
          </div>
          <div className="case-side">
            <div className="case-kv">
              {c.kv.map((kv, i) => (
                <div key={i}>
                  <div className="k">{kv.k}</div>
                  <div className={"v" + (kv.small ? " small" : "")}>{kv.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="case-foot">
          <div className="case-quote">
            "{c.quote}"
            <span className="src">— {c.src}</span>
          </div>
          <div className="case-takeaway" dangerouslySetInnerHTML={{ __html: "▸ " + c.takeaway }} />
        </div>
      </div>
    </Section>
  );
}

function tierColor(cls) {
  if (cls === "green") return "var(--green)";
  if (cls === "red") return "var(--ledger)";
  return "var(--amber)";
}

window.Cases = Cases;
