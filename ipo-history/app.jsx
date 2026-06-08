/* app.jsx — root assembly, nav, footer */

const NAV = [
  { id: "origins", label: "Provenance" },
  { id: "anatomy", label: "Anatomy" },
  { id: "cases", label: "Casebook" },
  { id: "builder", label: "Build an IPO" },
];

function TopNav() {
  const [active, setActive] = React.useState("origins");
  React.useEffect(() => {
    const ids = NAV.map((n) => n.id);
    const onScroll = () => {
      let cur = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) cur = id;
      }
      setActive(cur);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="topnav">
      <a href="#top" className="brand"><span className="amber">$</span> declared --effective</a>
      <nav>
        {NAV.map((n) => (
          <a key={n.id} href={"#" + n.id} className={active === n.id ? "active" : ""}>{n.label}</a>
        ))}
      </nav>
    </div>
  );
}

function App() {
  return (
    <div id="top">
      <TopNav />
      <Hero />
      <Origins />
      <Anatomy />
      <Cases />
      <Builder />
      <footer className="section">
        <div className="wrap">
          <div className="page-footer">
            <span>$ end-of-filing</span>
            <span>// disclosure, not merit · 1602 → today</span>
            <span className="cursor">_</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
