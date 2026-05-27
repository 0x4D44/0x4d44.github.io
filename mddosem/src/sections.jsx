// Sections compose data + components into the page.
const D = window.MDDOSEM_DATA;

function Hero() {
  return (
    <section id="top" style={{ borderTop: "none", paddingTop: 56, paddingBottom: 56 }}>
      <Container>
        <div style={{
          display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)",
          gap: 56, alignItems: "center",
        }}>
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
              <span className="chip"><span className="dot" /> v{D.MDDOSEM.version}</span>
              <span className="chip">{D.MDDOSEM.edition}</span>
              <span className="chip">MIT license</span>
              <span className="chip">{D.MDDOSEM.crates}-crate workspace</span>
            </div>
            <h1 style={{
              fontSize: "clamp(48px, 6.4vw, 88px)",
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 0.98,
              margin: "0 0 24px",
            }}>
              A hardware-accurate
              <br />
              <span style={{ color: "var(--amber)" }}>PC of the 1990s,</span>
              <br />
              emulated in Rust.
            </h1>
            <p style={{
              fontSize: 19, color: "var(--text-dim)", lineHeight: 1.55, maxWidth: 56 + "ch",
              margin: "0 0 36px",
            }}>
              mddosem is a from-scratch native DOS, Windows 3.1, and early Win32 emulator. It boots real ROMs, runs real DPMI extenders, drives real SoundBlaster mixers, and JIT-compiles guest x86 to native x86-64 — all in pursuit of one thing: <span style={{ color: "var(--text)" }}>running classic software the way it actually worked.</span>
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <a href="#architecture" className="btn primary">Explore the stack →</a>
              <a href="#usage" className="btn">$ cargo run</a>
              <a href="#purpose" className="btn">Why it exists</a>
            </div>

            <div style={{
              marginTop: 48,
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
            }}>
              <StatTile value={D.MDDOSEM.testsApprox} label="test cases" accent="amber" />
              <StatTile value={D.MDDOSEM.fuzzTargets} label="fuzz targets" accent="cyan" />
              <StatTile value={D.MDDOSEM.fpuInstructions} label="x87 instructions" accent="amber" />
              <StatTile value={D.MDDOSEM.jitInstrCodes} label="JIT opcodes" accent="cyan" />
            </div>
          </div>

          <div>
            <BootTerminal />
            <div style={{
              marginTop: 14, display: "flex", justifyContent: "space-between",
              fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.08em",
              color: "var(--text-dimmer)",
            }}>
              <span>// primary target: {D.MDDOSEM.primaryTarget}</span>
              <span>MDDOSEM_BIOS // F000:0000</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function PurposeSection() {
  return (
    <section id="purpose">
      <Container>
        <SectionHeader
          kicker="01 · purpose"
          title="Why mddosem exists."
          lede="mddosem is an exploration of how far Rust + AI-assisted engineering can take a genuinely hard problem — and a love letter to the way x86 hardware and early PC software actually worked. The emulator is general-purpose by mandate: every fix targets correct hardware emulation, never an individual app's compatibility."
        />

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16, marginBottom: 56,
        }}>
          {D.TENETS.map((t) => (
            <div key={t.n} style={{
              padding: "22px 24px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              position: "relative",
            }}>
              <div style={{
                fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.16em",
                color: "var(--amber)", marginBottom: 12,
              }}>tenet {t.n}</div>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 10 }}>
                {t.title}
              </div>
              <div style={{ color: "var(--text-dim)", fontSize: 14.5, lineHeight: 1.6 }}>
                {t.body}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: "26px 28px",
          background: "linear-gradient(180deg, var(--bg-elev), var(--bg-card))",
          border: "1px solid var(--border)",
          borderLeft: "3px solid var(--amber)",
          borderRadius: 3,
        }}>
          <Eyebrow>What success looks like</Eyebrow>
          <p style={{ marginTop: 12, marginBottom: 12, fontSize: 16, color: "var(--text)" }}>
            Pentium-66 equivalent speed at minimum. Full DOS — DPMI and extenders included. Win16 (Windows 3.1) and Win32 (DirectX, COM). Sound Blaster, OPL3, MT-32, SC-55, MU50. Broad compatibility against the long tail: <strong style={{ color: "var(--amber)" }}>F1GP, DOOM, Colin McRae Rally, Word for Windows</strong>. 3D acceleration via DirectX and Glide. Eventual open-source release.
          </p>
        </div>
      </Container>
    </section>
  );
}

function ArchitectureSection() {
  return (
    <section id="architecture">
      <Container>
        <SectionHeader
          kicker="02 · architecture"
          title="A 1990s PC, layer by layer."
          lede="mddosem is sliced into seven layers, each independently testable. Hover or click any layer in the stack to drill in. Below: how those layers are split into Cargo crates, plus a tour of the guest's 1 MB address space."
        />

        <ArchitectureStack layers={D.STACK} />

        <hr className="divider" style={{ margin: "56px 0 36px" }} />

        <div style={{ marginBottom: 24 }}>
          <Eyebrow>Workspace · {D.CRATES.length} crates</Eyebrow>
          <h3 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "10px 0 6px" }}>
            How it's split.
          </h3>
          <p style={{ color: "var(--text-dim)", fontSize: 15, margin: 0, maxWidth: "70ch" }}>
            Crates layer bottom-up — <span className="mono" style={{ color: "var(--cyan)" }}>types</span> →
            {" "}<span className="mono" style={{ color: "var(--cyan)" }}>memory</span> →
            {" "}<span className="mono" style={{ color: "var(--cyan)" }}>cpu</span> →
            {" "}<span className="mono" style={{ color: "var(--cyan)" }}>interp / jit</span> →
            {" "}<span className="mono" style={{ color: "var(--cyan)" }}>hw</span> →
            {" "}<span className="mono" style={{ color: "var(--cyan)" }}>dos / bios</span> →
            {" "}<span className="mono" style={{ color: "var(--cyan)" }}>win16 / win32</span> → the root binary integrates everything.
            Each crate compiles and tests independently; some carry their own version numbers so a synth-ROM tweak doesn't force a workspace bump.
          </p>
        </div>
        <CrateMap crates={D.CRATES} />

        <hr className="divider" style={{ margin: "56px 0 36px" }} />

        <div style={{ marginBottom: 24 }}>
          <Eyebrow>Guest memory map</Eyebrow>
          <h3 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "10px 0 6px" }}>
            The 1 MB the guest sees.
          </h3>
          <p style={{ color: "var(--text-dim)", fontSize: 15, margin: 0, maxWidth: "72ch" }}>
            Conventional memory uses linked Memory Control Blocks starting at segment <span className="mono" style={{ color: "var(--amber)" }}>0x0100</span>; the high BIOS segment <span className="mono" style={{ color: "var(--amber)" }}>F000</span> is where HLE software-interrupt stubs live, intercepted by Rust handlers. Anything beyond 1 MB is reached through HMA / XMS / EMS.
          </p>
        </div>
        <MemoryMap />
      </Container>
    </section>
  );
}

function HardwareSection() {
  return (
    <section id="hardware">
      <Container>
        <SectionHeader
          kicker="03 · hardware"
          title="Everything inside the box."
          lede="mddosem doesn't pick a virtual reference machine and stop there. It emulates the long tail of PC peripherals a DOS game might prod — sometimes by HLE'ing the API, sometimes (like with SC-55 and MU50) by running the actual synth firmware against a sampled wave ROM."
        />
        <HardwareGrid groups={D.HARDWARE} />

        <div style={{
          marginTop: 36,
          padding: "22px 26px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 3,
          display: "grid",
          gridTemplateColumns: "minmax(220px, 0.9fr) 1fr",
          gap: 24, alignItems: "center",
        }}>
          <div>
            <Eyebrow>JIT design</Eyebrow>
            <div style={{ marginTop: 8, fontSize: 17, fontWeight: 600 }}>x86-16/32 → x86-64, on demand.</div>
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 14.5, lineHeight: 1.65 }}>
            Hot basic blocks cross a <span className="mono" style={{ color: "var(--amber)" }}>50-execution</span> threshold and get compiled to native x86-64. {D.MDDOSEM.jitInstrCodes} instruction codes are supported across real and protected mode. Blocks chain through a shared prologue/epilogue; cold blocks get evicted; self-modifying code is detected and invalidates the cache. JIT is opt-in via <span className="mono" style={{ color: "var(--cyan)" }}>MDDOSEM_JIT=1</span>; packed executables run with JIT suspended until unpacking completes.
          </div>
        </div>

        <div style={{
          marginTop: 12,
          padding: "22px 26px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 3,
          display: "grid",
          gridTemplateColumns: "minmax(220px, 0.9fr) 1fr",
          gap: 24, alignItems: "center",
        }}>
          <div>
            <Eyebrow>FPU design</Eyebrow>
            <div style={{ marginTop: 8, fontSize: 17, fontWeight: 600 }}>80387 stored in f64, with caveats.</div>
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 14.5, lineHeight: 1.65 }}>
            All {D.MDDOSEM.fpuInstructions} x87 instructions implemented — transcendentals, BCD, environment save/restore. Registers held as f64 internally (like DOSBox), converted to 80-bit only for memory loads/stores. The host FPU is relied on for rounding and exceptions. Anything that depends on exact 80-bit extended precision is something to test against the legacy interp + Unicorn oracles.
          </div>
        </div>

        <div style={{
          marginTop: 12,
          padding: "22px 26px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 3,
          display: "grid",
          gridTemplateColumns: "minmax(220px, 0.9fr) 1fr",
          gap: 24, alignItems: "center",
        }}>
          <div>
            <Eyebrow>HLE interrupts</Eyebrow>
            <div style={{ marginTop: 8, fontSize: 17, fontWeight: 600 }}>F000 stubs that escape into Rust.</div>
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 14.5, lineHeight: 1.65 }}>
            Software interrupts jump to <span className="mono" style={{ color: "var(--amber)" }}>F000:xxxx</span> stubs; the emulator recognizes them and runs a Rust handler instead. This is how INT 21h, INT 10h, and DPMI's INT 31h get serviced quickly. With <span className="mono" style={{ color: "var(--cyan)" }}>--vga-bios</span>, that interception is selectively disabled and a real ROM image gets loaded at 0xC0000 to drive video the original way.
          </div>
        </div>
      </Container>
    </section>
  );
}

function UsageSection() {
  return (
    <section id="usage">
      <Container>
        <SectionHeader
          kicker="04 · how you use it"
          title="From clone to playing F1GP."
          lede="mddosem is a Cargo workspace. Build it, point it at a binary, and a window pops up running a 1992 game. Click through the scenarios on the left to watch each command type itself — and read what it actually does."
        />

        <CliPlayground scenarios={D.CLI_SCENARIOS} />

        <hr className="divider" style={{ margin: "56px 0 28px" }} />

        <div style={{
          display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 36,
        }}>
          <div>
            <Eyebrow>Tracing targets</Eyebrow>
            <h3 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "10px 0 8px" }}>
              Debug exactly the subsystem you care about.
            </h3>
            <p style={{ color: "var(--text-dim)", fontSize: 15, margin: "0 0 18px", maxWidth: "60ch" }}>
              Everything emits via the <span className="mono" style={{ color: "var(--amber)" }}>tracing</span> crate. Set <span className="mono" style={{ color: "var(--cyan)" }}>RUST_LOG</span> to narrow output to one (or many) subsystems. File logging streams to <span className="mono">tmp/mddosem.log</span> by default.
            </p>
            <TraceTargetList targets={D.TRACE_TARGETS} />
          </div>
          <div>
            <Eyebrow>Timing model</Eyebrow>
            <h3 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "10px 0 8px" }}>
              One cycle per instruction.
            </h3>
            <p style={{ color: "var(--text-dim)", fontSize: 15, margin: "0 0 18px" }}>
              Modeled after DOSBox-X. Guest rate is set by <span className="mono" style={{ color: "var(--amber)" }}>cycles_per_ms</span> (the equivalent of DOSBox-X's <span className="mono">CPU_CycleMax</span>). Three pieces decide what your game feels like:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                ["--speed-policy", "fixed · auto · turbo — how aggressively the scheduler adapts."],
                ["--speed",        "xt · at · 386 · 486 · pentium · fast — the cycle-rate preset."],
                ["--cpu",          "8086 · 286 · 386 · 486 · pentium — what CPUID claims to be."],
              ].map(([flag, desc]) => (
                <div key={flag} style={{
                  background: "var(--bg-card)", border: "1px solid var(--border)",
                  padding: "12px 14px", borderRadius: 2,
                }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--amber)" }}>{flag}</div>
                  <div style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 4 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function TestingSection() {
  return (
    <section id="testing">
      <Container>
        <SectionHeader
          kicker="05 · testing"
          title="Roughly 2.4 million tests stand between you and a regression."
          lede="An emulator without tests is folklore. mddosem stacks unit tests, integration suites, conformance matrices, and replay-based regressions — plus a per-crate orchestrator that streams everything to disk so a killed run still produces triage data."
        />

        <TestingPanel suites={D.TEST_SUITES} />

        <hr className="divider" style={{ margin: "44px 0 28px" }} />

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}>
          <InfoCard
            kicker="full_test"
            title="The orchestrator."
            body="Runs cargo fmt check, clippy, the interpreter suite, ordinal verification, and optionally coverage and benchmarks. The default --per-crate path tests each crate in its own cargo invocation, so a stuck cargo is one crate instead of the whole workspace. Phases stream to tests/results/in-flight/ live."
          />
          <InfoCard
            kicker="verify_ordinals"
            title="Win16 against Wine."
            body="mddosem fetches Wine's .spec files for KERNEL, USER, GDI, MMSYSTEM, COMMDLG, and checks every implemented Win16 ordinal against them. --strict makes any mismatch a CI failure."
          />
          <InfoCard
            kicker="Conformance"
            title="2.4M opcode cases."
            body="cpu_logic_tests + cpu_386_conformance form the bulk: every implemented opcode is run against an encoding × flags × operand-size matrix, with the legacy iced-x86 interpreter sitting on the side as a differential oracle."
          />
          <InfoCard
            kicker="pmbench"
            title="In-guest perf benchmarks."
            body="A protected-mode conformance benchmark built with Open Watcom (installed at tools/watcom/) runs inside the emulator. It is the canonical perf gate for DPMI work, distinct from host-side criterion micro-benchmarks."
          />
          <InfoCard
            kicker="Coverage"
            title="cargo llvm-cov."
            body="Line and branch coverage via llvm-cov. Hot path crates (mddosem-interp, mddosem-cpu, mddosem-memory) carry per-crate dev opt-level overrides so coverage runs are usable instead of glacial."
          />
          <InfoCard
            kicker="Differential testing"
            title="DOSBox-X, Unicorn, Wine."
            body="Discrepancies with DOSBox-X are treated as bugs in mddosem until proven otherwise. Unicorn (QEMU's CPU core) supplies x86 ground truth for both real-mode and 32-bit protected mode with paging. Wine grounds the Win16 ordinal surface."
          />
        </div>
      </Container>
    </section>
  );
}

function InfoCard({ kicker, title, body }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      padding: "20px 22px", borderRadius: 3,
    }}>
      <Eyebrow>{kicker}</Eyebrow>
      <div style={{ fontSize: 17, fontWeight: 600, margin: "10px 0 8px", letterSpacing: "-0.01em" }}>{title}</div>
      <div style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function FuzzingSection() {
  return (
    <section id="fuzzing">
      <Container>
        <SectionHeader
          kicker="06 · fuzzing"
          title="An adaptive orchestrator hunts bugs all night."
          lede="cargo-fuzz drives 24 targets covering CPU, DOS, DPMI, BIOS, hardware, audio, and Win16. A single adaptive budget tool decides where to spend your hours — weighted by priority, recent crash effectiveness, and time-since-last-fuzz."
        />

        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border)",
          padding: "22px 26px", borderRadius: 3, marginBottom: 28,
        }}>
          <Eyebrow>Priority formula</Eyebrow>
          <pre style={{
            margin: "12px 0 0", fontFamily: "var(--mono)", fontSize: 13.5,
            color: "var(--text)", whiteSpace: "pre-wrap",
            background: "transparent",
          }}>
{`Score = Base Priority × (1.0 + Effectiveness Bonus) × Recency Bonus

  Effectiveness Bonus = min(crashes_per_hour × 0.5, 1.0)
  Recency Bonus       = 1.0 + min(days_since_last_fuzz / 30, 0.5)
`}
          </pre>
          <div style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 12 }}>
            History persists across sessions in <span className="mono" style={{ color: "var(--amber)" }}>tests/fuzz/fuzz_history.json</span>. Never-fuzzed targets get a 2× recency bonus so coverage holes close fast.
          </div>
        </div>

        <FuzzGrid targets={D.FUZZERS} />

        <hr className="divider" style={{ margin: "44px 0 24px" }} />

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}>
          <InfoCard
            kicker="Strategy 1"
            title="JIT vs Interpreter."
            body="Generate valid x86-16 instruction sequences with iced-x86's CodeAssembler, run them through both engines, and compare final registers, flags, and memory. This is the catch-net for codegen, register allocation, and flag-computation bugs."
          />
          <InfoCard
            kicker="Strategy 2"
            title="Interpreter vs Unicorn."
            body="Unicorn (QEMU's CPU core) is ground truth. Two fuzzers run it — one in 16-bit real mode, one in 32-bit protected mode with paging — to catch interp-level instruction bugs the JIT can never see."
          />
          <InfoCard
            kicker="Strategy 3"
            title="DOS vs DOSBox-X."
            body="fuzz_dos_dosbox cross-checks DOS, DPMI, and BIOS surfaces against DOSBox-X. Anywhere the two emulators disagree, mddosem investigates — DOSBox-X is the oracle."
          />
          <InfoCard
            kicker="Strategy 4"
            title="Audio vs reference cores."
            body="OPL3 against Nuked OPL3 (die-shot accurate). MT-32 against MUNT. GUS against PicoGUS / DOSBox-X. SB16 against a spec-based oracle. Audio bugs hide where ear can't catch them — fuzzing differentials surface them."
          />
          <InfoCard
            kicker="Strategy 5"
            title="Win16 vs Wine."
            body="fuzz_win16_wine generates calls into the Win16 KERNEL / USER / GDI surface and compares behavior against Wine. fuzz_ne_loader and fuzz_mz_loader stress the executable loaders that get the binaries running in the first place."
          />
          <InfoCard
            kicker="Triage"
            title="fuzz_triage + fuzz_budget."
            body="When something crashes, fuzz_triage clusters and minimizes corpus entries. fuzz_budget --status reports per-target effectiveness — crashes per hour, last-fuzz timestamp, total runtime — so future budgets get smarter."
          />
        </div>
      </Container>
    </section>
  );
}

function CommunitySection() {
  return (
    <section id="community">
      <Container>
        <SectionHeader
          kicker="07 · the ecosystem"
          title="mddosem doesn't stand alone."
          lede="A faithful PC emulator depends on decades of community work: emulators to cross-check against, reverse-engineered firmware, public specs, and the libraries that make a cross-platform Rust binary possible at all."
        />

        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: 3, overflow: "hidden", marginBottom: 24,
        }}>
          {D.ORACLES.map(([name, desc], i) => (
            <div key={name} style={{
              display: "grid", gridTemplateColumns: "minmax(180px, 220px) 1fr",
              gap: 16, padding: "14px 22px",
              borderBottom: i === D.ORACLES.length - 1 ? "none" : "1px solid var(--border)",
              alignItems: "center",
            }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 14, color: "var(--amber)" }}>{name}</span>
              <span style={{ fontSize: 14.5, color: "var(--text-dim)" }}>{desc}</span>
            </div>
          ))}
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}>
          <InfoCard
            kicker="Multi-agent dev"
            title="Several AIs co-edit the repo."
            body="AI_Coordination.md is the registry — anyone touching the code (human or model) leaves a note describing what they're working on. The repo is mirrored across machines, so the rule is: always merge, never rebase. Atomic commits, no force-push to shared branches."
          />
          <InfoCard
            kicker="Test corpus"
            title="Licensed software lives offsite."
            body="Real-world test material (NetMeeting installers, Tomb Raider, Sam & Max, Day of the Tentacle, …) lives in a sibling private repo at ../mddosem-corpus/. Tests reference corpus paths via relative imports. The public repo ships only license-clean fixtures."
          />
          <InfoCard
            kicker="Assets directory"
            title="Bring your own ROMs."
            body="There is no embed-assets build mode. The binary resolves synth ROMs, system BIOS, and Win16 stock fonts via MDDOSEM_ROMS and a roms/ directory next to the binary. End users populate it from their own legally-obtained dumps. Missing assets fail cleanly at startup."
          />
          <InfoCard
            kicker="Contributing"
            title="Fork · branch · test · PR."
            body="The contribution loop is conventional: fork, branch, cargo test, run the relevant fuzzers for any component you touched, open a PR. The version bump goes in the same commit as the change — Cargo.lock will be regenerated automatically."
          />
          <InfoCard
            kicker="Subagents"
            title="Parallel research via Gemini CLI."
            body="Engineers (and AI agents working inside the repo) can fan out research to the Gemini CLI in parallel — stateless one-shot queries, code review, doc drafting. Output is captured from stdout and merged back into the main flow."
          />
          <InfoCard
            kicker="Endgame"
            title="Eventual public release."
            body="mddosem is private for now while it stabilizes — Pentium-66-equivalent performance, broad Win32/DirectX coverage, and 3D acceleration are the bar. The license is already MIT; the goal is an open release once correctness and compatibility are where the philosophy demands."
          />
        </div>
      </Container>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--border)", padding: "44px 0 60px" }}>
      <Container>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <LogoMark />
              <span style={{ fontFamily: "var(--mono)", fontSize: 15, letterSpacing: "0.06em" }}>mddosem</span>
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 13.5, maxWidth: "52ch" }}>
              A hardware-accurate PC emulator written in Rust. Targets DOS, Windows 3.1, Win32, and early-90s 3D graphics. MIT-licensed. Built in the open, eventually.
            </div>
          </div>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dimmer)",
            letterSpacing: "0.12em", textAlign: "right",
          }}>
            <div>MDDOSEM // v{D.MDDOSEM.version}</div>
            <div>{D.MDDOSEM.crates} crates · {D.MDDOSEM.testsApprox} tests · {D.MDDOSEM.fuzzTargets} fuzz targets</div>
            <div style={{ marginTop: 8 }}>// no ROMs included. byo.</div>
          </div>
        </div>
      </Container>
    </footer>
  );
}

Object.assign(window, {
  Hero, PurposeSection, ArchitectureSection, HardwareSection,
  UsageSection, TestingSection, FuzzingSection, CommunitySection, Footer,
  InfoCard,
});
