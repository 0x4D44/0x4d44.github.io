// numbers.jsx — stats grid
const NumbersSection = () => {
  const stats = [
    { n: "538", u: "commits", l: "Across 14 days of construction" },
    { n: "189", u: "k LOC Rust", l: "Production + test code combined" },
    { n: "1.4", u: ":1", l: "Test code to production code ratio" },
    { n: "91", u: "%", l: "In-scope branch coverage (cargo-llvm-cov)" },
    { n: "4,694", u: "tests", l: "Unit tests across the workspace" },
    { n: "~185M", u: "trials", l: "Cumulative QEMU differential trials" },
    { n: "3.6M", u: "iters", l: "FPU + DCP softfloat differential" },
    { n: "~250k", u: "iters", l: "Silicon ISA differential against live RP2354" },
    { n: "12", u: "PIO SMs", l: "Three PIO blocks × four state machines (RP2350)" },
    { n: "520", u: "KB SRAM", l: "Across 10 banks · 8 striped + 2 scratch (RP2350)" },
    { n: "150", u: "MHz", l: "Default clk_sys; pacer maps to wall-clock real-time" },
    { n: "16", u: "DMA ch", l: "Full DREQ matrix · chained triggering · ring buffers" },
    { n: "210", u: "HLDs", l: "High/low-level design docs under wrk_docs/" },
    { n: "152", u: "journals", l: "Per-session notes under wrk_journals/" },
    { n: "60", u: "s watchdog", l: "Per-case timeout in test_silicon orchestrator" },
    { n: "9", u: "bugs caught", l: "Attributable to specific oracle findings" },
  ];

  return (
    <section id="numbers">
      <div className="container">
        <div className="eyebrow">§06 · by the numbers</div>
        <h2>What 14 days of supervised AI-agent work looks like.</h2>
        <p className="lead">
          Picoem is a personal research project, written end-to-end with one engineer
          coordinating teams of AI agents through dated HLDs, code-review passes, devil's-advocate
          reviews, and overnight fuzz campaigns. The numbers reflect that working style.
        </p>

        <div className="stats-grid">
          {stats.map((s, i) => (
            <div key={i} className="stat">
              <div><span className="n">{s.n}</span><span className="u">{s.u}</span></div>
              <div className="l">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

window.NumbersSection = NumbersSection;
