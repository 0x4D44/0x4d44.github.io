/* global React, ReactDOM, Ouroboros, ChOuroboros, ChFormalSystems, ChLiar, ChNumbering, ChReplication, ChSentence, ChSecond, ChMeaning, MascotKurt, MascotEsther, MascotCassini, MascotJove */
// ============================================================
// APP — hero, side navigation with scrollspy, assembly
// ============================================================
const { useState: useStateApp, useEffect: useEffectApp, useRef: useRefApp } = React;

const NAV = [
  { id: "ch-ouroboros", num: "00", label: "The Ouroboros" },
  { id: "ch-formal", num: "01", label: "Formal Systems" },
  { id: "ch-liar", num: "02", label: "The Liar's Paradox" },
  { id: "ch-numbering", num: "03", label: "Gödel Numbering" },
  { id: "ch-replication", num: "04", label: "Self-Replicating Life" },
  { id: "ch-sentence", num: "05", label: "Building Gödel's Sentence" },
  { id: "ch-second", num: "06", label: "The Second Theorem" },
  { id: "ch-meaning", num: "07", label: "What It All Means" },
];

function SideNav({ active, progress }) {
  return (
    <nav className="sidenav">
      <div className="nav-brand">Incompleteness</div>
      <div className="nav-brand-sub">The snake that ate its own tail</div>
      {NAV.map((n) => (
        <a key={n.id} href={"#" + n.id}
          className={"nav-link" + (active === n.id ? " active" : "")}>
          <span className="nav-num">{n.num}</span>
          <span>{n.label}</span>
        </a>
      ))}
      <div className="nav-progress">
        Reading progress
        <div className="nav-progress-bar">
          <div className="nav-progress-fill" style={{ width: progress + "%" }} />
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <header className="hero" id="top">
      <div className="hero-eyebrow">An interactive essay · Gödel's Incompleteness Theorems</div>
      <h1>The Snake That Ate <em>Its Own Tail</em></h1>
      <div className="hero-ouroboros"><Ouroboros size={172} /></div>
      <p className="hero-sub">
        How a single self-referential sentence proved that mathematics can never be finished — explained
        with snakes, self-copying microbes, two plushie planets, and the occasional honest piece of
        calculus.
      </p>
      <div className="hero-meta">
        <span><b>8</b> chapters</span>
        <span><b>6</b> interactives</span>
        <span><b>~45</b> min</span>
        <span>arrow keys ready · scroll to begin ↓</span>
      </div>
    </header>
  );
}

function App() {
  const [active, setActive] = useStateApp("ch-ouroboros");
  const [progress, setProgress] = useStateApp(0);

  useEffectApp(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) obs.observe(el);
    });
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(100, Math.round((h.scrollTop / max) * 100)) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { obs.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);

  // typeset prose once everything has mounted (await MathJax startup, not a fixed delay)
  useEffectApp(() => {
    let cancelled = false;
    const typeset = () => {
      if (!cancelled && window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise().catch(() => {});
      }
    };
    const whenReady = () => {
      if (cancelled) return;
      if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
        window.MathJax.startup.promise.then(typeset).catch(() => {});
      } else {
        setTimeout(whenReady, 50);
      }
    };
    whenReady();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="layout">
      <SideNav active={active} progress={progress} />
      <main>
        <div className="content">
          <Hero />
          <ChOuroboros />
          <ChFormalSystems />
          <ChLiar />
          <ChNumbering />
          <ChReplication />
          <ChSentence />
          <ChSecond />
          <ChMeaning />
          <footer className="site-footer">
            <div className="footer-plush">
              <MascotKurt size={46} />
              <MascotEsther size={46} />
              <MascotCassini size={46} />
              <MascotJove size={46} />
            </div>
            <p style={{ margin: 0 }}>
              Built for a young naturalist who likes snakes, microbes, and planets — and who is, clearly,
              ready for some calculus. Kurt Gödel published these results in 1931, at the age of 25, in a
              paper titled <em>“On Formally Undecidable Propositions of Principia Mathematica and Related
              Systems.”</em> The snake, the bacterium, and the planets are our own additions. The
              mathematics is his.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
