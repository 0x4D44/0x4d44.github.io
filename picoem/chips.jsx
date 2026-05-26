// chips.jsx — comparator for RP2350 vs RP2040
const ChipsSection = () => {
  const chips = {
    rp2350: {
      title: "RP2350 / RP2354",
      sub: "Pi Pico 2 — dual Cortex-M33 · 150 MHz",
      die: [
        { id: "m33-0", label: "Cortex-M33 #0", note: "ARMv8-M Mainline · FPU · TZ", kind:"cpu", row: 1, col: 1, span: 1, rowspan:1 },
        { id: "m33-1", label: "Cortex-M33 #1", note: "ARMv8-M Mainline · FPU · TZ", kind:"cpu", row: 1, col: 2, span: 1, rowspan:1 },
        { id: "haz0",  label: "Hazard3 #0",  note: "RV32IMAC · Zicsr", kind:"cpu", row: 1, col: 3, span: 1, rowspan:1 },
        { id: "haz1",  label: "Hazard3 #1",  note: "RV32IMAC · Zicsr", kind:"cpu", row: 1, col: 4, span: 1, rowspan:1 },
        { id: "sram",  label: "SRAM",        note: "520 KB · 10 banks", row: 2, col: 1, span: 2, rowspan:1 },
        { id: "rom",   label: "BootROM",     note: "32 KB",              row: 2, col: 3, span: 1, rowspan:1 },
        { id: "xip",   label: "XIP Flash",   note: "external",            row: 2, col: 4, span: 1, rowspan:1 },
        { id: "pio",   label: "PIO 0/1/2",   note: "12 state machines",  row: 3, col: 1, span: 2, rowspan:1 },
        { id: "dma",   label: "DMA",         note: "16 channels",        row: 3, col: 3, span: 1, rowspan:1 },
        { id: "sio",   label: "SIO",         note: "FIFO · spinlocks",   row: 3, col: 4, span: 1, rowspan:1 },
        { id: "tim",   label: "TIMER0/1",    note: "64-bit + alarms",    row: 4, col: 1, span: 1, rowspan:1 },
        { id: "ser",   label: "UART · SPI · I²C", note: "2× each", row: 4, col: 2, span: 2, rowspan:1 },
        { id: "an",    label: "ADC · PWM",   note: "12-bit · 24-ch",     row: 4, col: 4, span: 1, rowspan:1 },
      ],
      coverage: [
        ["CPU core ISA", "Cortex-M33 (ARMv8-M Mainline)", "working"],
        ["FPU (VFPv5 SP)", "Lazy context save · 23 ops", "working"],
        ["Coprocessors", "GPIO/CP0 · DCP · RCP", "working"],
        ["Dual-core + SIO", "Spinlocks · FIFOs · interpolators", "working"],
        ["Bus fabric (AHB5)", "Atomic aliases · APB latency", "working"],
        ["Clock tree", "ROSC · XOSC · PLL · dividers", "working"],
        ["NVIC / faults", "Exceptions · tail-chain · lazy FP", "working"],
        ["Memory", "32 KB ROM · 520 KB SRAM · XIP flash", "working"],
        ["PIO 0/1/2", "12 SMs · GPIOBASE high bank", "working"],
        ["DMA", "16 ch · CHAIN_TO · DREQ matrix", "working"],
        ["Peripherals", "TIMER · UART · SPI · I²C · PWM · ADC · OTP · TRNG · SHA-256", "working"],
        ["RISC-V Hazard3", "Parallel core · same bus", "working"],
        ["Pacer (wall-clock)", "x86_64 only", "working"],
        ["TrustZone (SAU/ACCESSCTRL)", "Design seams · v1 all-Secure", "partial"],
        ["GDB RSP debug server", "Scaffolding only", "stub"],
      ],
    },
    rp2040: {
      title: "RP2040",
      sub: "Pi Pico V1 — dual Cortex-M0+ · 133 MHz",
      die: [
        { id: "m0-0",  label: "Cortex-M0+ #0", note: "ARMv6-M",      kind:"cpu", row: 1, col: 1, span: 2, rowspan: 1 },
        { id: "m0-1",  label: "Cortex-M0+ #1", note: "ARMv6-M",      kind:"cpu", row: 1, col: 3, span: 2, rowspan: 1 },
        { id: "sram",  label: "SRAM",          note: "264 KB · striped + scratch", row: 2, col: 1, span: 3, rowspan: 1 },
        { id: "rom",   label: "BootROM",       note: "16 KB",        row: 2, col: 4, span: 1, rowspan: 1 },
        { id: "pio",   label: "PIO 0/1",       note: "8 state machines", row: 3, col: 1, span: 2, rowspan: 1 },
        { id: "sio",   label: "SIO",           note: "FIFO · 32 spinlocks · HW divider", row: 3, col: 3, span: 2, rowspan: 1 },
        { id: "tim",   label: "TIMER",         note: "alarms",       row: 4, col: 1, span: 1, rowspan: 1 },
        { id: "ser",   label: "UART · SPI · I²C", note: "2× each", row: 4, col: 2, span: 2, rowspan: 1 },
        { id: "an",    label: "ADC · PWM",     note: "12-bit · 16-ch", row: 4, col: 4, span: 1, rowspan: 1 },
      ],
      coverage: [
        ["CPU core ISA", "Cortex-M0+ (ARMv6-M)", "working"],
        ["FPU", "None on this chip", "na"],
        ["Coprocessors", "None on this chip", "na"],
        ["Dual-core + SIO", "FIFO · spinlocks · hardware divider", "working"],
        ["Bus fabric (AHB-Lite)", "Bank striping · contention model (Serial)", "working"],
        ["Clock tree", "ROSC · XOSC · PLL · dividers", "working"],
        ["NVIC / faults", "Exceptions · banked MSP/PSP", "working"],
        ["Memory", "16 KB ROM · 264 KB SRAM · no onboard flash", "working"],
        ["PIO 0/1", "8 SMs · PSRAM via picoem-devices", "working"],
        ["DMA", "Stubs", "stub"],
        ["Peripherals", "Phase-1 coverage · IRQ plumbing in progress", "partial"],
        ["Pacer (wall-clock)", "Cadence not yet quantum-based", "partial"],
        ["TrustZone", "Not applicable to M0+", "na"],
        ["GDB RSP debug server", "Scaffolding only", "stub"],
        ["PicoGUS replay rig", "Real GUS firmware → I²S → WAV", "working"],
      ],
    },
  };

  const [active, setActive] = React.useState("rp2350");
  const [hover, setHover] = React.useState(null);
  const chip = chips[active];
  const focus = chip.die.find((d) => d.id === hover) || null;

  return (
    <section id="chips">
      <div className="container">
        <div className="eyebrow">§01 · target hardware</div>
        <h2>Two chips. Three instruction sets. One workspace.</h2>
        <p className="lead">
          picoem models the two Raspberry Pi silicon families as independent library crates that share
          a small set of primitives. Toggle between them — click a block on the die to see what's
          covered.
        </p>

        <div className="chips-tab-row">
          {Object.keys(chips).map((k) => (
            <button key={k} className={"chips-tab " + (active === k ? "active" : "")} onClick={() => { setActive(k); setHover(null); }}>
              <span>{chips[k].title}</span>
              <span className="spec">— {chips[k].sub}</span>
            </button>
          ))}
        </div>

        <div className="chip-layout">
          <div>
            <div className="chip-die">
              <div className="chip-die-grid">
                {chip.die.map((b) => (
                  <div
                    key={b.id}
                    className={"die-block " + (b.kind || "") + (hover === b.id ? " active" : "")}
                    style={{ gridColumn: `${b.col} / span ${b.span}`, gridRow: `${b.row} / span ${b.rowspan}` }}
                    onMouseEnter={() => setHover(b.id)}
                    onClick={() => setHover(b.id)}
                  >
                    <div className="lbl">{b.label}</div>
                    <div className="sz">{b.note}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-xs muted mt-2 text-mono">
              {focus ? <>▸ <b style={{color:"var(--amber)"}}>{focus.label}</b> — {focus.note}</> : "▸ hover the die"}
            </div>
          </div>

          <div className="chip-detail">
            <div className="chip-status-bar">
              <span className="status working"><span className="dot"></span>working</span>
              <span className="status partial"><span className="dot"></span>partial</span>
              <span className="status stub"><span className="dot"></span>stub</span>
              <span className="status na"><span className="dot"></span>not applicable</span>
            </div>
            <h3 style={{marginBottom:"4px"}}>{chip.title}</h3>
            <div className="muted text-mono text-xs mb-4">feature coverage as of the published versions</div>
            <table className="cov-table">
              <thead>
                <tr><th>Subsystem</th><th>Detail</th><th>Status</th></tr>
              </thead>
              <tbody>
                {chip.coverage.map(([k,v,s]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="muted">{v}</td>
                    <td>
                      <span className={"status " + s}>
                        <span className="dot"></span>{s}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};

window.ChipsSection = ChipsSection;
