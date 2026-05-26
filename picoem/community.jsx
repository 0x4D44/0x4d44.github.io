// community.jsx — how it fits + licensing + honesty
const CommunitySection = () => {
  return (
    <section id="community">
      <div className="container">
        <div className="eyebrow">§08 · community & honesty</div>
        <h2>What picoem is — and what it isn't.</h2>

        <div className="comm-grid">
          <div>
            <h3 className="mb-4">Where it fits in the Pi ecosystem</h3>
            <p className="muted">
              picoem sits next to QEMU's Cortex-M models, the official{" "}
              <code>pico-sdk</code> simulators, and probe-rs. It complements rather than
              replaces them — QEMU gives you fast ISA-level emulation across many architectures,
              probe-rs gives you debug access to real silicon, and picoem gives you a
              cycle-accurate model of these specific SoCs that you can embed as a library and
              drive from your own Rust code.
            </p>
            <p className="muted mt-4">
              The OneROM card, PicoGUS replay rig, and mddosem (DOS emulator running on top of
              an emulated OneROM firmware on the RP2350) all depend on picoem as a library.
              That dependency stack is the project's main user-visible interface.
            </p>

            <h3 className="mt-8 mb-2">Use it as a library</h3>
            <div className="grid-2">
              <div className="card" style={{padding:"16px 18px"}}>
                <div className="text-mono text-sm" style={{color:"var(--amber)"}}>rp2350-emu</div>
                <div className="text-xs muted mt-2">Embed a RP2350 / RP2354 inside your Rust project. Cycle counter, dual cores, peripherals, DMA, PIO, FPU. Boots the real bootrom.</div>
              </div>
              <div className="card" style={{padding:"16px 18px"}}>
                <div className="text-mono text-sm" style={{color:"var(--amber)"}}>rp2040-emu</div>
                <div className="text-xs muted mt-2">Same shape for the RP2040. Used by the PicoGUS audio-replay harness with real GUS firmware → emulated I²S → WAV.</div>
              </div>
              <div className="card" style={{padding:"16px 18px"}}>
                <div className="text-mono text-sm" style={{color:"var(--phosphor)"}}>picoem-common</div>
                <div className="text-xs muted mt-2">Shared building blocks. Pull from here if you're writing a sibling emulator that wants the same primitives — clocks, pacer, PIO state machines.</div>
              </div>
              <div className="card" style={{padding:"16px 18px"}}>
                <div className="text-mono text-sm" style={{color:"var(--phosphor)"}}>picoem-devices</div>
                <div className="text-xs muted mt-2">Off-chip device models for harnesses and apps — PSRAM, LCD, I²S capture. Reusable independently of the chip cores.</div>
              </div>
            </div>
          </div>

          <div>
            <div className="card">
              <h4>Status</h4>
              <p className="muted text-sm mt-2">
                A personal research project, published in case it's useful to others. No SLAs on
                bugs, no promises about PR review, no commitment to ongoing feature work. If you
                need certainty around a fix or feature, fork freely.
              </p>
            </div>

            <div className="card mt-4">
              <h4>License</h4>
              <div className="licenses">
                <span className="lic alt">MIT</span>
                <span className="lic alt">Apache-2.0</span>
                <span className="lic">at your option</span>
              </div>
              <p className="muted text-xs mt-4">
                Redistributes the Raspberry Pi RP2350 / RP2040 bootroms (BSD-3-Clause), the PicoGUS
                firmware (GPL-2.0-or-later), and a vendored probe-rs fork (MIT OR Apache-2.0). See
                <code> NOTICE</code> for the full list.
              </p>
            </div>

            <div className="card mt-4">
              <h4>What's NOT in v1</h4>
              <ul className="muted text-sm" style={{paddingLeft:"18px",margin:"6px 0 0",lineHeight:"1.7"}}>
                <li>UART / SPI / I²C / DMA / timers on RP2040 — peripheral coverage in progress</li>
                <li>TrustZone (SAU / ACCESSCTRL) — design seams only; everything is Secure</li>
                <li>GDB RSP debug server — scaffolding only</li>
                <li>RP2350 SRAM bank-contention timing — characterised on silicon, not modelled</li>
                <li>QEMU oracle for M0+ Thumb-32 subset — silicon-only</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="callout">
          <div className="q">
            "A test you wrote yourself only proves the code does what you thought when you wrote it.
            A differential oracle proves the code does what something else thinks is correct.
            Real silicon is the highest-authority something else you can have."
          </div>
          <div className="a">— project working principle, codified across 152 session journals</div>
        </div>

        <div className="grid-3 mt-8">
          <div className="card">
            <h4>Trademarks</h4>
            <p className="muted text-xs mt-2">
              Raspberry Pi, RP2350, RP2354, RP2040, Pico are trademarks of Raspberry Pi Ltd. Arm
              and Cortex-M are trademarks of Arm Limited. Used here for identification only;
              picoem is not affiliated with, endorsed by, or sponsored by either.
            </p>
          </div>
          <div className="card">
            <h4>Contributions</h4>
            <p className="muted text-xs mt-2">
              Dual-licensed MIT OR Apache-2.0 unless you state otherwise. Issues and PRs welcome;
              no triage SLA. If you need certainty around a merge, fork — the license places no
              obligations on you.
            </p>
          </div>
          <div className="card">
            <h4>Acknowledgements</h4>
            <p className="muted text-xs mt-2">
              Raspberry Pi Ltd for the bootroms. The probe-rs project (vendored fork carries a
              DPv1 cache-upgrade workaround for upstream issue #3872). The Rust embedded
              ecosystem — rp235x-hal, rp2040-hal, the Cortex-M tooling crates that informed our
              naming and API choices.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

window.CommunitySection = CommunitySection;
