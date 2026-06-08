/* hero.jsx — masthead */

function Hero() {
  return (
    <header className="section" style={{ scrollMarginTop: 0 }}>
      <div className="wrap masthead">
        <div className="hero-rule">
          <span>0x4D44 :: ALMANAC</span>
          <span>FILE NO. 333-IPO · FORM S-1</span>
          <span className="online">● DECLARED EFFECTIVE</span>
        </div>

        <h1 className="title">
          Declared <span className="serif">Effective</span>
        </h1>

        <p className="subtitle">
          Four centuries of asking strangers for money — and the single document
          that has governed it. From the Dutch East India Company's 1602 charter
          to the modern S-1, a field guide to the prospectus: where it came from,
          what's inside it, who builds it, and the offerings that made (and
          unmade) fortunes.
        </p>

        <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Stamp variant="green">Disclosure, not merit</Stamp>
          <Stamp variant="blue" flat>Truth in Securities · 1933</Stamp>
          <a className="btn solid" href="#builder">Build your own IPO →</a>
        </div>

        <div className="statrow">
          {window.HERO_STATS.map((s, i) => (
            <div className="cell" key={i}>
              <div className="num">{s.num}</div>
              <div className="lab">{s.lab}</div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

window.Hero = Hero;
