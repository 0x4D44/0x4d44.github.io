// hero.jsx — top section
const Hero = () => {
  const [pc, setPc] = React.useState(0x10000000);
  const [cyc, setCyc] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => {
      setPc((p) => 0x10000000 + ((p + 2) & 0xfff));
      setCyc((c) => c + Math.floor(Math.random() * 4) + 1);
    }, 70);
    return () => clearInterval(id);
  }, []);

  const hex = (n, w = 8) => "0x" + n.toString(16).toUpperCase().padStart(w, "0");

  return (
    <section className="hero">
      <div className="grid-bg"></div>
      <div className="container hero-inner">
        <div>
          <div className="eyebrow hero-eyebrow">cycle-accurate · arm · rust</div>
          <h1>
            <span className="accent">picoem</span><br/>
            Boot a Raspberry Pi RP2350 in software.
          </h1>
          <div className="hero-tag">
            A pair of cycle-accurate emulator libraries for the Raspberry Pi RP2354 / RP2350
            (dual Arm Cortex-M33 + Hazard3 RISC-V + PIO) and the RP2040 (dual Cortex-M0+ + PIO).
            Written in Rust. Boots the real Pi bootroms. Validated against QEMU and against
            silicon over SWD.
          </div>
          <div className="hero-meta">
            <span className="pill"><span className="dot"></span>2 chips · 3 ISAs</span>
            <span className="pill"><span className="dot"></span>~4,700 unit tests</span>
            <span className="pill"><span className="dot"></span>~100M QEMU diffs</span>
            <span className="pill warn"><span className="dot"></span>91% branch coverage</span>
            <span className="pill"><span className="dot"></span>MIT OR Apache-2.0</span>
          </div>
          <div className="hero-cta">
            <a className="btn primary" href="#chips">
              Explore the chips <span className="arr">→</span>
            </a>
            <a className="btn" href="#testing">How it's tested</a>
            <a className="btn" href="#using">Run it</a>
          </div>
        </div>

        <div className="scope">
          <div className="scope-header">
            <span className="scope-title">▮ EMU::TRACE</span>
            <span className="scope-led">
              <i className="on"></i><i className="on"></i><i className="on"></i><i></i>
            </span>
          </div>
          <div className="scope-row"><b>core0</b><span className="g">running · M33-S</span></div>
          <div className="scope-row"><b>core1</b><span className="g">running · M33-S</span></div>
          <div className="scope-row"><b>PC</b><span className="v">{hex(pc)}</span></div>
          <div className="scope-row"><b>cycles</b><span className="v">{cyc.toLocaleString()}</span></div>
          <div className="scope-row"><b>clk_sys</b><span>150.000 MHz · PLL_SYS</span></div>
          <div className="scope-row"><b>bus</b><span>AHB5 · 10 SRAM banks</span></div>
          <div className="scope-row"><b>nvic</b><span>0 pending · 0 active</span></div>
          <div className="scope-trace">
            <svg width="100%" height="100%" viewBox="0 0 320 60" preserveAspectRatio="none">
              <defs>
                <linearGradient id="phos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#7ed957" stopOpacity="0.6"/>
                  <stop offset="1" stopColor="#7ed957" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0 40 L20 40 L20 18 L60 18 L60 38 L80 38 L80 22 L120 22 L120 42 L160 42 L160 20 L200 20 L200 36 L240 36 L240 14 L280 14 L280 30 L320 30"
                stroke="#7ed957" strokeWidth="1.4" fill="none" />
              <path d="M0 40 L20 40 L20 18 L60 18 L60 38 L80 38 L80 22 L120 22 L120 42 L160 42 L160 20 L200 20 L200 36 L240 36 L240 14 L280 14 L280 30 L320 30 L320 60 L0 60 Z"
                fill="url(#phos)" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
};

window.Hero = Hero;
