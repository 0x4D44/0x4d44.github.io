// using.jsx — CLI + TUI mock
const UsingSection = () => {
  const cmds = {
    blinky: {
      title: "RP2350 blinky in the TUI",
      lines: [
        { c: "$ ", t: "cargo run -p rp2350-emu-tui --release", k: "cmd" },
        { t: "    Compiling rp2350-emu v0.2.5 (...)", k: "out" },
        { t: "    Compiling rp2350-emu-tui v0.1.3 (...)", k: "out" },
        { t: "     Finished `release` profile [optimized] target(s) in 41.22s", k: "ok" },
        { t: "      Running `target/release/rp2350-emu-tui`", k: "out" },
        { t: "▮ loading roms/rp2350/bootrom-combined.bin (32 KB)", k: "ok" },
        { t: "▮ loading roms/rp2350/blinky.bin → XIP flash @ 0x10000000", k: "ok" },
        { t: "▮ core 0 reset · PC=0x000000A4 · clk_sys = 150.000 MHz", k: "ok" },
        { t: "▮ secure→non-secure transition · BXNS @ 0x7EA4", k: "ok" },
        { t: "▮ GPIO 25 toggle · cycle 58,969", k: "warn" },
        { t: "▮ TUI ready — q to quit · space to pause · . to step", k: "out" },
      ],
    },
    fuzz: {
      title: "Differential fuzz against QEMU (M33)",
      lines: [
        { c: "$ ", t: "cargo run -p picoem-harness --release --bin qemu_diff_m33 -- --fuzz 100000", k: "cmd" },
        { t: "[qemu] spawning qemu-system-arm -cpu cortex-m33 -gdb tcp::3333", k: "out" },
        { t: "[gdb]  attached · target reports cortex-m33", k: "ok" },
        { t: "[fuzz] seed=0xA1B2C3D4 · 100000 cases", k: "out" },
        { t: "[fuzz] ████████████████████░░░░░  82.4% · 658 tests/s · ETA 27s", k: "out" },
        { t: "[fuzz] 100000/100000 · 657.9 tests/s · 152.0s elapsed", k: "ok" },
        { t: "[diff] 0 mismatches across R0..R15 + xPSR (masked: APSR_GE)", k: "ok" },
        { t: "[done] PASS · seed reproducible: --seed 0xA1B2C3D4", k: "ok" },
      ],
    },
    silicon: {
      title: "Silicon orchestrator soak — 8h unattended",
      lines: [
        { c: "$ ", t: "cargo run -p picoem-harness --release --bin test_silicon -- --soak 8h", k: "cmd" },
        { t: "[probe] attached · VID:PID:SERIAL 2e8a:000c:E6634C779F7E1A35 (Pi Pico debug probe)", k: "ok" },
        { t: "[dut]   RP2354 detected · CPUID=0x410FD213 · DWT CYCCNT armed", k: "ok" },
        { t: "[soak]  shuffling 51 cases · Fisher-Yates seed=0x42", k: "out" },
        { t: "[oracl] probe_diff   PASS=10000  FAIL=0  SKIP=12", k: "ok" },
        { t: "[oracl] cycle        PASS=8/10   known-Δ=2 (within tolerance)", k: "ok" },
        { t: "[oracl] periph_diff  PASS=31/32  open: pwm_fractional_div (A.2.3)", k: "warn" },
        { t: "[oracl] isr_diff     PASS=7/9    cyccnt residuals · +6 cold pendsv", k: "warn" },
        { t: "[soak]  hourly heartbeat · uptime 7h 02m · iters 4,659 · 0 hard failures", k: "ok" },
      ],
    },
    test: {
      title: "Unit tests",
      lines: [
        { c: "$ ", t: "cargo test --release -p rp2350-emu", k: "cmd" },
        { t: "    Finished `release` profile [optimized] target(s) in 1.04s", k: "ok" },
        { t: "     Running unittests src/lib.rs (target/release/deps/rp2350_emu-9b3...)", k: "out" },
        { t: "running 2856 tests", k: "out" },
        { t: "test core::execute::thumb16::adds_r0_r1_r2_sets_n_flag ... ok", k: "ok" },
        { t: "test core::execute_thumb32::ldrd_pcr_aligned_load ... ok", k: "ok" },
        { t: "test bus::dma::dma_to_dma_write_during_tick_lands_on_live_dma ... ok", k: "ok" },
        { t: "test pio::side_set_pad_oe_respects_pindirs ... ok", k: "ok" },
        { t: "test result: ok. 2856 passed; 0 failed; 0 ignored; finished in 87.42s", k: "ok" },
      ],
    },
  };

  const [tab, setTab] = React.useState("blinky");
  const cur = cmds[tab];

  return (
    <section id="using">
      <div className="container">
        <div className="eyebrow">§07 · using it</div>
        <h2>Library first. Apps and harnesses are demos.</h2>
        <p className="lead">
          Pick a chip crate and depend on it. <code>rp2350-emu</code> and <code>rp2040-emu</code>
          {" "}are published to crates.io and version cleanly. The TUIs are reference apps; the
          harness binaries are how the project tests itself.
        </p>

        <div className="grid-2 mt-6">
          <div className="card">
            <h4>Add it to your project</h4>
            <div className="terminal">
              <div className="tbar"><span className="led red"></span><span className="led y"></span><span className="led g"></span><span className="title">Cargo.toml</span></div>
              <div className="body">
<div className="line out">[dependencies]</div>
<div className="line"><span className="ok">rp2350-emu</span> = "0.2"</div>
<div className="line"><span className="ok">rp2040-emu</span> = "0.1"</div>
              </div>
            </div>
            <div className="terminal mt-4">
              <div className="tbar"><span className="led red"></span><span className="led y"></span><span className="led g"></span><span className="title">src/main.rs</span></div>
              <div className="body">
<div className="line out">use rp2350_emu::EmulatorBuilder;</div>
<div className="line">&nbsp;</div>
<div className="line out">let mut emu = EmulatorBuilder::new()</div>
<div className="line out">{"    .step_quantum(64)"}</div>
<div className="line out">{"    .build()?;"}</div>
<div className="line out">emu.load_bootrom("roms/rp2350/bootrom-combined.bin")?;</div>
<div className="line out">emu.load_flash("my_firmware.bin")?;</div>
<div className="line out">emu.run(<span className="warn">1_000_000</span>);</div>
<div className="line">&nbsp;</div>
<div className="line out">println!(<span className="warn">"cycles: {`{}`}"</span>, emu.cycles());</div>
              </div>
            </div>
          </div>

          <div className="card">
            <h4>Drive the TUI · or run a harness</h4>
            <div className="cmd-tabs">
              {Object.entries(cmds).map(([k, v]) => (
                <button key={k} className={"cmd-tab " + (tab === k ? "active" : "")} onClick={() => setTab(k)}>
                  {v.title}
                </button>
              ))}
            </div>

            <div className="terminal">
              <div className="tbar">
                <span className="led red"></span><span className="led y"></span><span className="led g"></span>
                <span className="title">~/picoem · zsh</span>
              </div>
              <div className="body">
                {cur.lines.map((l, i) => (
                  <div key={i} className="line">
                    {l.c && <span className="prompt">{l.c}</span>}
                    <span className={l.k === "cmd" ? "cmd" : l.k}>{l.t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="card mt-8">
          <h4>What the TUI actually looks like</h4>
          <p className="muted text-sm mt-2">
            <code>rp2350-emu-tui</code> uses ratatui + crossterm. CPU registers on the left, GPIO
            and LCD-device emulator on the right, ISA trace and a live benchmark below. The RP2040
            TUI has the same shape minus the FPU / DCP / RCP / NS panels.
          </p>

          <div className="tui-mock">
            <pre>{`┌─ rp2350-emu ─ blinky.bin ─ clk_sys=150.000 MHz ─ cycles=00058969 ──────────────┐
│ ┌─ CORE 0 ───────────────────┐ ┌─ CORE 1 ───────────────────┐ ┌─ GPIO ────────┐│
│ │ PC   0x100001A4  state RUN │ │ PC   0x000000C8  state WFE │ │ 00..07 ▪▪▫▫▪▪▫▫││
│ │ SP   0x20081FF0            │ │ SP   0x20081000            │ │ 08..15 ▫▫▪▫▫▪▪▫││
│ │ LR   0xFFFFFFF9  ipsr  0   │ │ LR   0xFFFFFFFD  ipsr  0   │ │ 16..23 ▫▫▫▪▫▫▪▫││
│ │ R0   0x00000003            │ │ R0   0x12345678            │ │ 24..31 ▫▪▫▫▫▫▫▫││
│ │ R7   0x10000200            │ │ R7   0x20081000            │ │  25 ⚐ LED      ││
│ └────────────────────────────┘ └────────────────────────────┘ └────────────────┘│
│ ┌─ ISA / NEXT INSTRUCTIONS ────────────────────────────────────────────────────┐│
│ │ 0x100001A4 : 0xB510  PUSH {r4, lr}            cyc=3                          ││
│ │ 0x100001A6 : 0xF000F812  BL   delay           cyc=4                          ││
│ │ 0x100001AA : 0xBD10  POP  {r4, pc}            cyc=3                          ││
│ └──────────────────────────────────────────────────────────────────────────────┘│
│ ┌─ BENCH ──────────────────┐ ┌─ NVIC ──────────┐ ┌─ CLOCKS ───────────────────┐│
│ │ MIPS    87.4  paced      │ │ pending  0      │ │ ROSC      6.5 MHz          ││
│ │ paced %    99.7          │ │ active   0      │ │ XOSC     12.0 MHz          ││
│ │ quantum   64             │ │ basepri  0      │ │ PLL_SYS 150.0 MHz · LOCKED ││
│ └──────────────────────────┘ └─────────────────┘ └────────────────────────────┘│
└─ q quit · . step · space pause · 1..7 panel ─────────────────────────────────────┘`}</pre>
          </div>
        </div>
      </div>
    </section>
  );
};

window.UsingSection = UsingSection;
