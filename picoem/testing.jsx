// testing.jsx — five tiers + differential demo
const TestingSection = () => {
  const tiers = [
    {
      n: "T1",
      name: "Unit tests",
      num: "~4,700 tests",
      body: (
        <>
          <p>
            Every <code>#[test]</code> across the workspace. Instruction semantics, decode edge cases,
            exception mechanics, PIO behaviour, clock-tree config, peripheral register-side-effects.
            Runs in <code>cargo test --release</code> in about 90 seconds. The largest single file is{" "}
            <code>crates/rp2350-emu/src/tests.rs</code> at 22,240 lines.
          </p>
          <div className="kv"><div className="k">rp2350-emu</div><div className="v">2,856 tests</div></div>
          <div className="kv"><div className="k">rp2040-emu</div><div className="v">967 tests</div></div>
          <div className="kv"><div className="k">picoem-harness</div><div className="v">568 tests</div></div>
          <div className="kv"><div className="k">picoem-common</div><div className="v">236 tests</div></div>
          <div className="kv"><div className="k">picoem-devices</div><div className="v">35 tests</div></div>
        </>
      ),
    },
    {
      n: "T2",
      name: "QEMU differential fuzzing",
      num: "~185M cumulative trials",
      body: (
        <>
          <p>
            Three QEMU-backed oracles, one per ISA. Each spawns a QEMU reference CPU over GDB and
            single-steps the same instruction in both QEMU and our emulator, diffing R0–R15 + xPSR
            with masking for architecturally unpredictable flag fields.
          </p>
          <div className="kv"><div className="k">qemu_diff_m33</div><div className="v">Cortex-M33 · GDB:3333 · ~660 tests/s solo</div></div>
          <div className="kv"><div className="k">qemu_diff_m0plus</div><div className="v">Cortex-M0 ref · GDB:3334 · ~250 tests/s solo</div></div>
          <div className="kv"><div className="k">qemu_diff_riscv32</div><div className="v">RV32IMC · spike + QEMU virt · DRAM at 0x8000_0000</div></div>
          <p className="muted text-xs mt-2">
            Failures are deterministic. The harness prints the seed; you reproduce with{" "}
            <code>--seed &lt;S&gt;</code>, fix, then re-run the same seed.
          </p>
        </>
      ),
    },
    {
      n: "T3",
      name: "Softfloat differential (FPU + DCP)",
      num: "3.6M iterations",
      body: (
        <>
          <p>
            A purpose-built reference oracle in pure Rust — six FPSCR exception flags
            (IOC/DZC/OFC/UFC/IXC/IDC) plus FTZ and DN modes are narrow enough to encode in ~414
            lines without a softfloat-sys C dependency. Runs through the VFPv5 single-precision
            subset and the DCP (CP4/5) operations under all four FPSCR mode permutations.
          </p>
          <div className="kv"><div className="k">arithmetic ops</div><div className="v">23 covered</div></div>
          <div className="kv"><div className="k">found</div><div className="v">flag-update gaps — values were correct</div></div>
        </>
      ),
    },
    {
      n: "T4",
      name: "Real-silicon oracles (over SWD)",
      num: "5 oracles · 1 orchestrator",
      body: (
        <>
          <p>
            The only honest tier. Drives a real RP2354 (Pi Pico 2) or RP2040 (Pico V1) board over
            SWD via a Pi Pico debug probe. Catches the bugs unit tests and QEMU don't —
            pipeline effects, peripheral timing, PLL lock, PIO pad_oe.
          </p>
          <div className="kv"><div className="k">probe_diff_rp2350</div><div className="v">M33 ISA diff against live silicon</div></div>
          <div className="kv"><div className="k">silicon_cycle_oracle_rp2350</div><div className="v">K-delta cycle catalogue · 10 cases</div></div>
          <div className="kv"><div className="k">silicon_periph_diff_rp2350</div><div className="v">32 scenarios · PIO · PLL · DMA · UART/SPI/I²C</div></div>
          <div className="kv"><div className="k">silicon_isr_diff_rp2350</div><div className="v">9 scenarios · lazy FP · tail-chain</div></div>
          <div className="kv"><div className="k">silicon_dualcore_diff_rp2350</div><div className="v">Cross-core bank-thrash / spinlock / FIFO contention</div></div>
          <div className="kv"><div className="k">test_silicon</div><div className="v">Orchestrator · 60s watchdog · multi-day soak</div></div>
        </>
      ),
    },
    {
      n: "T5",
      name: "Overnight unattended soak campaigns",
      num: "~90 hours cumulative",
      body: (
        <>
          <p>
            Once the harness infrastructure was solid, the project ran nine overnight campaigns
            with random seeds per batch, monitor tools firing notifications on{" "}
            <code>[FAIL]</code> / <code>panicked</code> lines, and a triage agent waiting to
            investigate failures. By morning: a journal entry summarising what ran, what found,
            what's now in <code>tech_debt.md</code>.
          </p>
          <div className="kv"><div className="k">M33 QEMU diff</div><div className="v">~100 million instruction trials</div></div>
          <div className="kv"><div className="k">M0+ QEMU diff</div><div className="v">~80 million instruction trials</div></div>
          <div className="kv"><div className="k">Silicon ISA diff</div><div className="v">~250 k iterations against a live DUT</div></div>
          <div className="kv"><div className="k">Silicon orchestrator</div><div className="v">~5 k full-catalogue passes</div></div>
        </>
      ),
    },
  ];

  const [open, setOpen] = React.useState(3); // start with the silicon tier open

  // differential demo
  const [scenario, setScenario] = React.useState("good");
  const scenarios = {
    good: {
      label: "ADDS r0, r1, r2 — pass",
      ours: { r0:0x00000007, r1:0x00000003, r2:0x00000004, xpsr:"0x01000000  N=0 Z=0 C=0 V=0", cyc:1 },
      ref:  { r0:0x00000007, r1:0x00000003, r2:0x00000004, xpsr:"0x01000000  N=0 Z=0 C=0 V=0", cyc:1 },
      verdict: "pass",
      note: "PASS · all observables match",
    },
    pll: {
      label: "PLL LOCK timing — caught only by silicon",
      ours: { lock:"1  ← always-1 bug", elapsed:"0 sysclks", cs:"0x80000000", note:"forced unconditionally" },
      ref:  { lock:"1  ← after polling", elapsed:"~1133 sysclks", cs:"0x80000000", note:"poll-then-lock on silicon" },
      verdict: "fail",
      note: "FAIL · pll_sys_lock_timing scenario · silicon periph diff",
    },
    pio: {
      label: "PIO side-set pad_oe — caught only by silicon",
      ours: { gpio0:"output  ← bug", gpio1:"output  ← bug", pindirs:"0x00000003", sysclk:"83" },
      ref:  { gpio0:"input  ← per PINDIRS", gpio1:"input  ← per PINDIRS", pindirs:"0x00000003", sysclk:"83" },
      verdict: "fail",
      note: "FAIL · pio0_side_set_toggle scenario · pin-state divergence",
    },
    cps: {
      label: "CPS bit-swap (M0+) — found by devils-advocate",
      ours: { primask:"0  ← bit 0 read as F", faultmask:"n/a", note:"I/F bits swapped vs ARM ARM" },
      ref:  { primask:"1  ← bit 1 is I", faultmask:"n/a", note:"matches A6.7.38" },
      verdict: "fail",
      note: "FAIL · CPS I-flag inverted · QEMU + silicon both diverge",
    },
  };
  const s = scenarios[scenario];

  const renderRows = (obj) => Object.entries(obj).map(([k,v]) => (
    <div key={k} className="diff-row"><span className="k">{k}</span><span className="v">{v}</span></div>
  ));

  return (
    <section id="testing">
      <div className="container">
        <div className="eyebrow">§05 · validation</div>
        <h2>Five tiers of test. Real silicon is the only honest oracle.</h2>
        <p className="lead">
          A test you wrote yourself only proves the code does what you thought when you wrote it.
          A differential oracle proves the code does what something else thinks is correct. Real
          silicon is the highest-authority <i>something else</i> you can have.
        </p>

        <div className="tiers">
          {tiers.map((t, i) => (
            <div key={t.n} className={"tier " + (open === i ? "open" : "")} onClick={() => setOpen(open === i ? -1 : i)}>
              <div className="tier-head">
                <span className="tier-n">{t.n}</span>
                <span className="tier-name">{t.name}</span>
                <span className="tier-num">{t.num}</span>
                <span className="tier-chev">▸</span>
              </div>
              <div className="tier-body">{t.body}</div>
            </div>
          ))}
        </div>

        <div className="diff-demo">
          <h4>Differential oracle · step-by-step</h4>
          <p className="muted text-sm mt-2">
            One instruction, two implementations, one diff. Pick a scenario:
          </p>
          <div className="cmd-tabs">
            {Object.keys(scenarios).map((k) => (
              <button key={k} className={"cmd-tab " + (scenario === k ? "active" : "")} onClick={() => setScenario(k)}>
                {scenarios[k].label}
              </button>
            ))}
          </div>

          <div className="diff-grid mt-6">
            <div className="diff-panel left">
              <h4>▮ picoem · OUR EMULATOR</h4>
              {renderRows(s.ours)}
            </div>
            <div className="diff-arrow">⟷</div>
            <div className="diff-panel right">
              <h4>▮ {scenario === "good" ? "QEMU REFERENCE" : "REAL SILICON (RP2354 over SWD)"}</h4>
              {renderRows(s.ref)}
            </div>
          </div>

          <div className={"diff-verdict " + (s.verdict === "pass" ? "pass" : "fail")}>
            <span style={{fontFamily:"'IBM Plex Mono'", fontWeight:600}}>
              {s.verdict === "pass" ? "✓" : "✗"}
            </span>
            <span>{s.note}</span>
          </div>
        </div>

        <div className="callout mt-8">
          <div className="q">
            "Without the silicon tier, both the PLL and PIO bugs would have shipped to V1.
            Without the devil's-advocate review, the M0+ CPS bit-swap would have stayed wrong
            for a long time, because every test agreed with itself."
          </div>
          <div className="a">— from <span className="text-mono">wrk_docs/2026.04.26 - Article - 14 Days of Building an RP2350 Emulator.md</span></div>
        </div>
      </div>
    </section>
  );
};

window.TestingSection = TestingSection;
