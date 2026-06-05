/* app.jsx — compose every section and mount. Loaded last. */

function Footer() {
  return (
    <footer className="cw-footer">
      <div className="src">
        <b style={{ fontFamily: "var(--cw-display)", color: "var(--cw-ink)" }}>Sources, honestly.</b><br />
        Facts drawn from Anthropic's “Introducing dynamic workflows in Claude Code” (28 May 2026) and the
        Claude Code documentation. Jokes drawn from Monty Python and one beleaguered Torquay hotelier.
        This page is an independent explainer, not an official Anthropic publication.
      </div>
      <div style={{ textAlign: "right" }}>
        <span className="cursorless">$ end-of-stream</span><br />
        <a href="../index.html">← back to the almanac</a>
      </div>
    </footer>
  );
}

function App() {
  return (
    <React.Fragment>
      <TopBar />
      <Hero />
      <Marquee />
      <main className="cw-wrap">
        <Intro />
        <HowItWorks />
        <Builder />
        <Patterns />
        <UseCases />
        <Practice />
        <Quiz />
        <Glossary />
      </main>
      <Footer />
      <EasterEggs />
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
