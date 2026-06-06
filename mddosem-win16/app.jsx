// Root app — composes the sections, owns the modal + easter-egg state.
function App() {
  const [fix, setFix] = useState(null);
  const [egg, setEgg] = useState(false);

  // konami → open the egg dialog
  useEffect(() => {
    const seq = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
    let pos = 0;
    const onKey = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = (k === seq[pos]) ? pos + 1 : (k === seq[0] ? 1 : 0);
      if (pos === seq.length) { setEgg(true); pos = 0; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <React.Fragment>
      <Hero />
      <Background />
      <Anatomy />
      <Approach />
      <Scoreboard />
      <Gallery onOpen={setFix} />
      <Closing onEgg={() => setEgg(true)} />
      <StatusBar />
      {fix ? <CaseModal fix={fix} onClose={() => setFix(null)} /> : null}
      {egg ? <EggDialog onClose={() => setEgg(false)} /> : null}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
