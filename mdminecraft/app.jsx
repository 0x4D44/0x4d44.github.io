// mdminecraft landing site — root composition

function Nav() {
  const items = [
    ["#demo",        "Demo"],
    ["#arch",        "Architecture"],
    ["#determinism", "Determinism"],
    ["#performance", "Performance"],
    ["#net",         "Networking"],
    ["#biomes",      "Biomes"],
    ["#testing",     "Testing"],
    ["#tools",       "Tools"],
    ["#roadmap",     "Roadmap"],
  ];
  return (
    <header className="nav">
      <div className="container nav-inner">
        <div className="nav-brand">
          <BrandGlyph size={22} />
          <span>md<span style={{color:"var(--ember)"}}>minecraft</span></span>
        </div>
        <nav className="nav-links">
          {items.map(([h, l]) => <a key={h} href={h}>{l}</a>)}
        </nav>
        <div className="nav-cta">
          <a className="pill" href="https://github.com/0x4D44/mdminecraft" target="_blank" rel="noreferrer">README</a>
          <a className="pill accent" href="https://github.com/0x4D44/mdminecraft" target="_blank" rel="noreferrer">github ↗</a>
        </div>
      </div>
    </header>
  );
}

function App() {
  return (
    <>
      <Nav />
      <Hero />
      <WorldPreview />
      <Architecture />
      <Determinism />
      <Performance />
      <Networking />
      <Biomes />
      <Testing />
      <DevTools />
      <Harness />
      <Roadmap />
      <StatusStrip />
      <Footer />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
