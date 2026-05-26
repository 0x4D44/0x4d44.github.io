// workspace.jsx — the crate graph
const WorkspaceSection = () => {
  const crates = {
    "picoem-common": {
      kind: "lib",
      ver: "0.2.0",
      role: "Shared primitives",
      detail: "Memory, ClockTree math, Pacer, PIO building blocks (PioBlock / StateMachine), Divider, Fifo, and threading helpers (SpinBarrier, SpscQueue). Both chip crates depend on this.",
      files: ["memory.rs", "clocks.rs", "pacer.rs", "pio/", "threaded/"],
    },
    "picoem-devices": {
      kind: "lib",
      ver: "0.1.2",
      role: "Off-chip device models",
      detail: "Pluggable peripheral models that live outside the SoC: HyperRAM-style PSRAM (used by RP2040 for PicoGUS), an LCD device for the RP2350 demo TUI, and an I²S capture sink. Consumed by harnesses and apps.",
      files: ["psram.rs", "lcd.rs", "i2s_capture.rs"],
    },
    "rp2350-emu": {
      kind: "lib",
      ver: "0.2.5",
      role: "RP2350 / RP2354 emulator core",
      detail: "Dual Cortex-M33 (ARMv8-M Mainline) with FPU, DCP, RCP, lazy FP context save, TrustZone scaffolding. AHB5 bus, 520 KB SRAM across 10 banks, 32 KB bootrom, XIP flash, 16-channel DMA, full peripheral suite. A parallel RISC-V Hazard3 core shares the bus. Optional 6-thread runtime on x86_64 Windows.",
      files: ["core/", "core_riscv/", "bus/", "memory/", "sio/", "dma.rs", "peripherals/", "threaded/"],
    },
    "rp2040-emu": {
      kind: "lib",
      ver: "0.1.4",
      role: "RP2040 emulator core",
      detail: "Dual Cortex-M0+ (ARMv6-M). AHB-Lite bus with bank striping + contention model on the Serial path. 264 KB SRAM, 16 KB bootrom. No onboard flash — firmware loads into SRAM. Two PIO blocks. Optional 3-thread runtime on x86_64 Windows. Depends on picoem-devices for PSRAM.",
      files: ["core/", "bus/", "memory.rs", "pio_tests.rs", "threaded/"],
    },
    "rp2350-emu-tui": {
      kind: "app",
      ver: "0.1.3",
      role: "Interactive TUI",
      detail: "ratatui + crossterm front-end for rp2350-emu. Panels: CPU status, GPIO state, LCD device emulator, ISA trace, live benchmark. Loads bundled ROMs (blinky, lcd_demo, benchmark, dualcore) or your own .bin.",
      files: ["main.rs", "panels/", "app.rs"],
    },
    "rp2040-emu-tui": {
      kind: "app",
      ver: "0.1.3",
      role: "Interactive TUI",
      detail: "Same shape as rp2350-emu-tui minus the FPU/DCP/RCP/NS panels. The ISA panel carries M0+-specific cycle numbers (MULS=1, LDR=2, LDM N=1+N, etc).",
      files: ["main.rs", "panels/", "app.rs"],
    },
    "picoem-harness": {
      kind: "bin",
      ver: "internal",
      role: "Test binaries",
      detail: "Every differential and hardware-in-the-loop oracle in the project. QEMU diff (M33, M0+, RV32), softfloat diff, paced benchmark, silicon orchestrator, PicoGUS replay, OneROM oracles. Binaries are chip-suffixed: qemu_diff_m33 / qemu_diff_m0plus, probe_diff_rp2350 / probe_diff_rp2040. Not published — internal.",
      files: ["bin/qemu_diff_m33.rs", "bin/probe_diff_rp2350.rs", "bin/silicon_*.rs", "bin/picogus_diff_rp2040.rs", "bin/test_silicon.rs", "..."],
    },
    "picoem-debug": {
      kind: "lib",
      ver: "0.1.1",
      role: "GDB RSP scaffolding",
      detail: "Placeholder for the GDB Remote Serial Protocol server and trace tooling. Currently a stub — published to reserve the crate name.",
      files: ["lib.rs"],
    },
  };

  const layers = [
    { label: "Shared primitives",       items: ["picoem-common", "picoem-devices"] },
    { label: "Chip emulator cores",     items: ["rp2350-emu",    "rp2040-emu"] },
    { label: "Apps",                    items: ["rp2350-emu-tui","rp2040-emu-tui"] },
    { label: "Validation & tooling",    items: ["picoem-harness","picoem-debug"] },
  ];

  const [sel, setSel] = React.useState("rp2350-emu");
  const cur = crates[sel];

  return (
    <section id="workspace">
      <div className="container">
        <div className="eyebrow">§02 · workspace layout</div>
        <h2>Eight crates. Hot path in two of them.</h2>
        <p className="lead">
          Everything sits in one Cargo workspace under <code>crates/</code>. The shared primitives are
          the bottom of the stack; the two chip cores are the libraries you actually consume; the
          apps are demos; the harness is where the test binaries live. Click a crate to see what's
          inside.
        </p>

        <div className="ws-canvas">
          {layers.map((layer) => (
            <div key={layer.label} className="ws-layer">
              <div className="ws-layer-label">▸ {layer.label}</div>
              <div className="ws-row">
                {layer.items.map((name) => {
                  const c = crates[name];
                  return (
                    <div
                      key={name}
                      className={"crate kind-" + c.kind + (sel === name ? " active" : "")}
                      onClick={() => setSel(name)}
                    >
                      <div>
                        <span className="crate-name">{name}</span>
                        <span className="crate-ver">{c.ver}</span>
                      </div>
                      <div className="crate-role">{c.role}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="ws-detail">
            <h4>{sel}</h4>
            <p className="muted text-sm">{cur.detail}</p>
            <div className="files">
              {cur.files.map((f) => <span key={f} className="tag">{f}</span>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

window.WorkspaceSection = WorkspaceSection;
