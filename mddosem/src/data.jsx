// Data for the mddosem site. All factual content sourced from the codebase
// (README.md, CLAUDE.md, Cargo.toml, docs/fuzzing.md).

const MDDOSEM = {
  version: "0.13.0",
  edition: "Rust 2021",
  license: "MIT",
  crates: 26,
  testsApprox: "2.4M",
  fuzzTargets: 24,
  fpuInstructions: 82,
  jitInstrCodes: 471,
  int21Funcs: 40,
  interpLOC: "~31k",
  win32LOC: "~33k",
  primaryTarget: "Geoff Crammond's F1 Grand Prix (1991)",
};

// Six "tenets" lifted from CLAUDE.md "Engineering Philosophy"
const TENETS = [
  {
    n: "01",
    title: "Emulate the hardware, not the game.",
    body: "When a game doesn't work, the answer is never a game-specific hack. The game is revealing that the emulation is wrong. Understand what real hardware does, fix the emulation, and the game works as a byproduct.",
  },
  {
    n: "02",
    title: "Dig until you understand.",
    body: "Don't patch around a bug. Investigate until you've found the root cause. Time spent understanding the machine is never wasted — it makes the emulator better and prevents future bugs.",
  },
  {
    n: "03",
    title: "Compatibility is ground truth.",
    body: "When documentation and game behavior disagree, games win. Real hardware had quirks that games relied on. Emulating those quirks isn't a hack — it's accurate emulation.",
  },
  {
    n: "04",
    title: "Do it properly.",
    body: "Incomplete implementations and messy code are unsatisfying. Research thoroughly before implementing. Write exhaustive tests. Minimize external dependencies.",
  },
  {
    n: "05",
    title: "DOSBox-X is the oracle.",
    body: "When uncertain how real hardware behaves, DOSBox-X source is the first place to look. It is also the differential testing target for DOS/DPMI/BIOS behavior. Discrepancies are bugs in mddosem until proven otherwise.",
  },
  {
    n: "06",
    title: "Performance is not optional.",
    body: "Emulators live or die by both correctness and performance. A correct-but-slow emulator is useless — games need to run at real-time speed. When clean code and a hot path collide, performance wins, and the reason is documented.",
  },
];

// Architecture layers — top of stack on top.
const STACK = [
  {
    id: "guest",
    label: "Guest software",
    sub: "DOS programs · Win16 NE · Win32 PE",
    color: "amber",
    detail:
      "What the user actually runs. COM and EXE (MZ) binaries are auto-unpacked from EXEPACK / LZEXE / PKLITE. Windows 3.x applications load as NE executables; Win32 programs load as PE executables and may pull in DirectX, DirectDraw, Direct3D, DirectInput, or the OLE32/COM runtime.",
  },
  {
    id: "win",
    label: "Win16 · Win32",
    sub: "kernel · user · gdi · mmsystem · directx",
    color: "cyan",
    detail:
      "Two sibling crates layer Windows on top of the DOS+hardware base. Win16 brings an NE loader, KERNEL/USER/GDI/MMSYSTEM/COMMDLG, the message loop, and the standard controls. Win32 brings a PE loader, DirectDraw/D3D/DirectInput, OLE32/COM, structured exception handling, and WinMM.",
  },
  {
    id: "dos",
    label: "DOS · BIOS",
    sub: "int 21h · int 10h · dpmi · mcb chain",
    color: "amber",
    detail:
      "INT 21h serves ~40 functions: file I/O, memory management via the MCB chain starting at segment 0x0100, EXEC, find-file, and friends. BIOS (INT 10h/13h/16h/1Ah) is provided by HLE Rust handlers by default; pass --vga-bios and a real ROM (e.g. SeaVGABIOS) to swap the video BIOS for actual ROM code running on emulated hardware. DPMI (INT 31h) covers protected-mode DOS extenders.",
  },
  {
    id: "hw",
    label: "Hardware",
    sub: "vga · sound · pic · pit · dma · uart",
    color: "cyan",
    detail:
      "All the chips a 1990s PC presented to software. VGA/SVGA (text modes, Mode 13h, Mode X, CGA/EGA, VESA VBE up to 1024×768), Sound Blaster DSP, OPL3 FM, Gravis Ultrasound, Roland MT-32, Yamaha SC-55/MU50, PC Speaker, MPU-401 MIDI, the 8259 PIC, 8253/8254 PIT, the DMA controller, 8250/16550 UARTs with Hayes modem support, and the keyboard controller.",
  },
  {
    id: "engine",
    label: "Execution engine",
    sub: "interpreter · JIT (x86 → x86-64)",
    color: "amber",
    detail:
      "A fast opcode-switch interpreter is the production execution path (~31k lines), with TLB-accelerated paging fast paths. A JIT compiler targets x86-64 from both 16-bit and 32-bit guest code; it supports 471 instruction codes, block chaining with shared prologue/epilogue, cold-block eviction, and self-modifying code detection. JIT is opt-in via MDDOSEM_JIT=1.",
  },
  {
    id: "cpu",
    label: "CPU + FPU + Memory",
    sub: "i386 · 80387 · 1 MB + HMA · A20 · XMS · EMS",
    color: "amber",
    detail:
      "Intel 386 instruction decode (via iced-x86) covers real-mode x86-16 and partial protected mode for DPMI, including paging. The 80387 FPU implements the full x87 set (82 instructions) — transcendentals, BCD, environment save/restore — storing registers as f64 internally and converting to 80-bit only for memory I/O. Memory provides the 1 MB conventional space plus HMA, A20 gate, XMS, and EMS.",
  },
  {
    id: "host",
    label: "Host runtime",
    sub: "Rust · winit · wgpu · cpal",
    color: "cyan",
    detail:
      "Rust 1.70+ on Windows, Linux, and macOS. winit + wgpu drive the host windows (Win16 apps use one host window per guest window with 1:1 pixel mapping). cpal handles cross-platform audio out. Logging goes through tracing with per-subsystem targets.",
  },
];

// Crate map.
const CRATES = [
  { name: "mddosem-types",       role: "shared types · traits · config" },
  { name: "mddosem-memory",      role: "1 MB + HMA · A20 · XMS · EMS" },
  { name: "mddosem-cpu",         role: "i386 decode / execute / flags" },
  { name: "mddosem-interp",      role: "fast opcode-switch interpreter (~31k LOC)" },
  { name: "mddosem-cpu-legacy",  role: "legacy iced-x86 interp (diff oracle)" },
  { name: "mddosem-jit",         role: "x86-16/32 → x86-64 JIT (471 opcodes)" },
  { name: "mddosem-hw",          role: "VGA · sound · PIC · PIT · DMA · UART" },
  { name: "mddosem-audio",       role: "host-side mixing (optional)" },
  { name: "mddosem-dos",         role: "INT 21h · files · MCB · DPMI" },
  { name: "mddosem-bios",        role: "INT 10h / 13h / 16h / 1Ah HLE" },
  { name: "mddosem-host",        role: "host-window trait + winit/wgpu impl" },
  { name: "mddosem-win16",       role: "NE loader · KERNEL / USER / GDI" },
  { name: "mddosem-win32",       role: "PE · DirectX · COM (~33k LOC)" },
  { name: "mddosem-3dfx",        role: "Glide 2.x HLE → software rasterizer" },
  { name: "mddosem-verite",      role: "Rendition Verité acceleration" },
  { name: "mddosem-sc55",        role: "Roland SC-55 MCU + wave ROM" },
  { name: "mddosem-mu50",        role: "Yamaha MU50 / MU80 MCU + sample ROM" },
  { name: "mddosem-syxg50",      role: "Yamaha S-YXG50 via VST2 helper" },
  { name: "mddosem-modem",       role: "Hayes-compatible modem on UART" },
  { name: "mddosem-capture",     role: "deterministic capture / replay" },
  { name: "mddosem-teams-bridge",role: "Teams video bridge for capture" },
  { name: "mddosem-onerom-bios", role: "OneROM glue across workspaces" },
  { name: "mddosem-assets",      role: "asset directory resolver" },
  { name: "mddosem-fatfs",       role: "vendored fatfs fork for FreeDOS HDDs" },
  { name: "mddosem-buildinfo",   role: "compile timestamp / git hash" },
  { name: "mddosem-compat",      role: "compatibility shims + adapters" },
];

// Hardware emulated, grouped.
const HARDWARE = [
  {
    group: "CPU",
    items: [
      ["8086 / 286 / 386 / 486 / Pentium identity", "user-selectable via --cpu"],
      ["Real-mode x86-16 instruction set", "full"],
      ["Protected mode + paging", "partial — covers DPMI"],
      ["80387 FPU", "full 82-instruction x87 set"],
      ["Lazy flags", "deferred evaluation"],
    ],
  },
  {
    group: "Video",
    items: [
      ["VGA text modes", "all standard"],
      ["Mode 13h", "320×200×256"],
      ["Mode X", "planar 256-color"],
      ["CGA / EGA 16-color modes", "full"],
      ["VESA VBE", "up to 1024×768"],
      ["Real VGA BIOS", "SeaVGABIOS via --vga-bios"],
    ],
  },
  {
    group: "Sound",
    items: [
      ["Sound Blaster DSP", "8-bit PCM + DMA"],
      ["OPL3 FM synthesis", "AdLib-compatible"],
      ["Gravis Ultrasound", "wavetable"],
      ["Roland MT-32", "LA synthesis"],
      ["Roland SC-55mkII", "MCU + wave ROM"],
      ["Yamaha MU50 / MU80", "MCU + sample ROM"],
      ["Yamaha S-YXG50", "via VST2 helper process"],
      ["PC Speaker", "tone generator"],
      ["MPU-401 MIDI", "intelligent + UART modes"],
    ],
  },
  {
    group: "Platform",
    items: [
      ["8259 PIC", "interrupt controller"],
      ["8253 / 8254 PIT", "timer chip"],
      ["DMA controller", "8237-style"],
      ["8250 / 16550 UART", "with Hayes modem"],
      ["Keyboard controller", "scancode + ASCII translation"],
      ["IPX networking", "via host sockets"],
      ["Gamepad", "via gilrs"],
    ],
  },
  {
    group: "Software stacks",
    items: [
      ["DOS INT 21h", "~40 functions"],
      ["DPMI INT 31h", "protected-mode services"],
      ["EXEPACK / LZEXE / PKLITE", "auto-unpack on load"],
      ["Win16 (Windows 3.x)", "NE loader · KERNEL / USER / GDI"],
      ["Win32", "PE · DirectX · COM · WinMM"],
      ["3dfx Glide 2.x", "HLE → software rasterizer"],
    ],
  },
];

// Test suites breakdown.
const TEST_SUITES = [
  { name: "cpu_logic_tests",         note: "Per-opcode arithmetic, flags, edge cases", scale: "~1.2M" },
  { name: "cpu_386_conformance",     note: "Encoding × flags × operand-size matrix",   scale: "~1.0M" },
  { name: "cpu_suite",               note: "Instruction-level integration",            scale: "thousands" },
  { name: "dos_suite",               note: "INT 21h end-to-end behavior",              scale: "hundreds" },
  { name: "hw_suite",                note: "VGA / PIT / PIC / DMA / UART",             scale: "hundreds" },
  { name: "refactor_equiv_b1b8",     note: "Dispatcher-reachability regression",       scale: "gated" },
  { name: "gremlin_parallel_replay", note: "Deterministic-replay invariants",          scale: "scenarios" },
  { name: "pmbench (DPMI)",          note: "Open Watcom guest binary, runs in-guest",  scale: "perf gate" },
];

// Fuzz targets — from docs/fuzzing.md, with priority.
const FUZZERS = [
  ["fuzz_jit_diff",              "JIT",      3.5, "JIT vs interpreter differential"],
  ["fuzz_unicorn_diff",          "CPU",      3.0, "Interpreter vs Unicorn (QEMU) real-mode"],
  ["fuzz_unicorn_diff_pm32",     "CPU",      3.0, "Interpreter vs Unicorn protected-mode + paging"],
  ["fuzz_pm_paging",             "CPU",      2.5, "TLB · page walks · page faults"],
  ["fuzz_cpu_instructions",      "CPU",      2.0, "Raw instruction byte fuzzing"],
  ["fuzz_dos_int21",             "DOS",      2.0, "DOS INT 21h services"],
  ["fuzz_dos_dosbox",            "DOS",      2.5, "DOS / DPMI / BIOS diff vs DOSBox-X"],
  ["fuzz_dpmi_int31",            "DPMI",     1.8, "DPMI INT 31h protected-mode services"],
  ["fuzz_descriptor_operations", "DPMI",     1.5, "GDT / LDT descriptor ops"],
  ["fuzz_memory_operations",     "DPMI",     1.5, "DPMI memory allocation"],
  ["fuzz_translation_struct",    "DPMI",     1.0, "Real-mode call marshaling"],
  ["fuzz_mcb_chain",             "DOS",      1.5, "MCB allocator integrity"],
  ["fuzz_mz_loader",             "DOS",      1.5, "MZ executable loader"],
  ["fuzz_ne_loader",             "Win16",    1.5, "NE executable loader"],
  ["fuzz_win16_wine",            "Win16",    2.5, "Win16 API diff vs Wine"],
  ["fuzz_win16_diff",            "Win16",    2.0, "Win16 API vs Rust reference"],
  ["fuzz_vga_memory",            "Hardware", 1.8, "VGA planar memory ops"],
  ["fuzz_vga_registers",         "Hardware", 1.5, "VGA register I/O"],
  ["fuzz_pic_pit",               "Hardware", 1.5, "PIC + PIT state machines"],
  ["fuzz_bios_interrupts",       "BIOS",     1.5, "INT 10h/13h/15h/16h/1Ah"],
  ["fuzz_opl3_diff",             "Audio",    2.5, "OPL3 vs Nuked OPL3 (die-shot)"],
  ["fuzz_mt32_diff",             "Audio",    2.5, "MT-32 vs MUNT"],
  ["fuzz_gus_diff",              "Audio",    2.0, "GUS vs PicoGUS / DOSBox-X"],
  ["fuzz_sb_diff",               "Audio",    2.0, "SB16 DSP vs spec oracle"],
];

// CLI scenarios — what to do as a user.
const CLI_SCENARIOS = [
  {
    title: "Run a DOS game",
    cmd: "cargo run --release -- F1GP.EXE",
    explain:
      "The simplest path. Builds the release binary if needed and launches the program in a 2× scaled window at the Pentium speed preset.",
  },
  {
    title: "Run with the JIT on",
    cmd: "MDDOSEM_JIT=1 cargo run --release -- F1GP.EXE",
    explain:
      "Enables the JIT, which compiles hot basic blocks to native x86-64 once they cross the 50-execution threshold. Speed-policy auto raises the scheduler floor to 25,000 cycles/ms when JIT is on.",
  },
  {
    title: "Choose a CPU speed preset",
    cmd: "cargo run --release -- DOOM.EXE --speed 486 --cpu 486",
    explain:
      "Each instruction costs one guest cycle (modeled after DOSBox-X). --speed picks the cycles-per-second preset (xt / at / 386 / 486 / pentium / fast); --cpu picks the identity that CPUID and friends report.",
  },
  {
    title: "Use a real VGA BIOS ROM",
    cmd: "cargo run --release -- DEMO.EXE --vga-bios roms/bios/vgabios-stdvga.bin",
    explain:
      "Replaces the built-in INT 10h HLE handler with actual ROM code running on the emulated VGA. SeaVGABIOS (LGPL, ships with QEMU as vgabios-stdvga.bin) is the recommended ROM.",
  },
  {
    title: "Full real-BIOS boot",
    cmd: "cargo run --release -- --real-boot --boot-hd freedos.hdd",
    explain:
      "Boots a complete PC through SeaBIOS + SeaVGABIOS instead of direct-executing a DOS binary. Loads from a raw HDD or 1.44 MB floppy image.",
  },
  {
    title: "Debug a guest with traces",
    cmd: "RUST_LOG=mddosem::dos=debug,mddosem::jit=trace cargo run -- game.exe --log-file",
    explain:
      "Structured logging via the tracing crate. Pick subsystems by target — dos, dpmi, cpu, fpu, jit, hw::vga, hw::io, win16, win32 — and tee everything to tmp/mddosem.log.",
  },
  {
    title: "Headless benchmark",
    cmd: "cargo run --release -- game.exe --headless --benchmark 100000 --perf-stats",
    explain:
      "Runs N steps with no window and prints a performance report. Combined with --max-frames and --screenshot-interval, this is how the CI tracks regressions.",
  },
  {
    title: "Run the full test suite",
    cmd: "cargo run --release --bin full_test -- --per-crate",
    explain:
      "Per-crate test execution path. Runs cargo fmt check, clippy, the interpreter suite, ordinal verification, and (optionally) coverage and benchmarks — streaming each phase to tests/results/in-flight/ so a killed run still triages.",
  },
  {
    title: "Fuzz for two hours",
    cmd: "cargo run --release --bin fuzz_budget -- 2h --jobs 4",
    explain:
      "The adaptive fuzzing orchestrator. Allocates the budget across all targets weighted by priority, recent crash effectiveness, and time-since-last-fuzz. State persists in tests/fuzz/fuzz_history.json.",
  },
];

// Subsystems for the trace-target panel.
const TRACE_TARGETS = [
  ["mddosem::dos",      "DOS INT 21h calls"],
  ["mddosem::dos::dpmi","DPMI INT 31h calls"],
  ["mddosem::cpu",      "CPU execution"],
  ["mddosem::cpu::fpu", "FPU operations"],
  ["mddosem::jit",      "JIT compiler"],
  ["mddosem::hw::vga",  "VGA rendering"],
  ["mddosem::hw::io",   "I/O port access"],
  ["mddosem::hw::serial","Serial · UART · modem"],
  ["mddosem::win16",    "Win16 subsystem"],
  ["mddosem::win32",    "Win32 subsystem"],
];

// External oracles and community context.
const ORACLES = [
  ["DOSBox-X",      "Primary oracle for DOS / DPMI / BIOS timing and behavior."],
  ["Unicorn (QEMU)","Ground-truth CPU oracle for 16-bit real-mode and 32-bit pmode + paging."],
  ["Wine",          "Win16 ordinal source of truth (via verify_ordinals)."],
  ["Nuked OPL3",    "Die-shot-accurate OPL3 reference for audio differentials."],
  ["MUNT",          "Canonical MT-32 emulator for LA-synth differentials."],
  ["PicoGUS",       "GUS reference for wavetable differentials."],
  ["SeaBIOS / SeaVGABIOS","LGPL system + video ROMs for real-BIOS boot."],
  ["iced-x86",      "x86 instruction decoder."],
  ["cpal",          "Cross-platform audio."],
  ["winit + wgpu",  "Cross-platform window + GPU."],
];

window.MDDOSEM_DATA = {
  MDDOSEM, TENETS, STACK, CRATES, HARDWARE,
  TEST_SUITES, FUZZERS, CLI_SCENARIOS, TRACE_TARGETS, ORACLES,
};
