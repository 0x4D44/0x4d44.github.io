// Narrative + metadata for the Win16 sweep site.
// Grounded in the mddosem architecture (the win16 crate: NE loader,
// KERNEL/USER/GDI/MMSYSTEM/COMMDLG, the message loop, standard controls)
// and how the project works (differential testing vs Wine, ordinal
// verification, fuzz_win16_wine). Written as the team's own account.

window.WIN16_META = {
  title: "Win16, Repaired",
  kicker: "mddosem · the windows 3.1 compatibility sweep",
  blurb: "A field report from the corner of the emulator where DOS stops and Windows begins — thirty rounds with the NE loader, the cooperative scheduler, and the GDI object table.",
  fixCount: 30,
  parentUrl: "../mddosem/",
  catalogUrl: "../",
};

// Subsystem taxonomy — drives the colour system and the filters.
window.WIN16_SUBSYSTEMS = [
  { key: "loader",   label: "NE Loader",  hex: "#2D6BE0", blurb: "Getting the executable off the disk and into a state where it can run at all — segments, relocations, instance data." },
  { key: "kernel",   label: "Kernel",     hex: "#8A45D6", blurb: "Modules, ordinals, atoms, the long-jump primitives, and the magic selector-arithmetic symbols." },
  { key: "memory",   label: "Memory",     hex: "#1F9B59", blurb: "The global and local heaps, moveable handles, the LDT, and reading the machine through low-memory selectors." },
  { key: "user",     label: "USER",       hex: "#E8553B", blurb: "Windows, messages, the cooperative scheduler, painting, timers and subclassing — the live nerve of the GUI." },
  { key: "gdi",      label: "GDI",        hex: "#0E9BA6", blurb: "Drawing: object handles, palettes, raster ops, device-independent bitmaps and the font mapper." },
  { key: "resource", label: "Resources",  hex: "#D23F8C", blurb: "Everything bundled into the binary but not code — strings, bitmaps, icons, menus and accelerators." },
  { key: "control",  label: "Controls",   hex: "#E0871C", blurb: "The standard control classes — buttons, edits, list boxes — each its own little program." },
  { key: "dialog",   label: "Dialogs",    hex: "#C0395F", blurb: "Building windows from templates, the modal loop, keyboard navigation, and the common dialogs." },
];

// Opening narrative — the background, what the analysis revealed.
window.WIN16_INTRO = {
  lede: "The emulator could already boot a 1990s PC and run DOS — real ROMs, real DPMI extenders, real Sound Blaster mixers. Then we pointed it at Windows 3.1, and discovered that the box marked “Windows” contained, on closer inspection, a great many smaller boxes, most of them on fire.",
  paras: [
    {
      h: "DOS was the easy part. Nobody tell DOS.",
      p: "A DOS program is, broadly, a flat blob of code that talks to the hardware and the occasional INT 21h. A Windows program is a different animal entirely: a New Executable (NE) — relocatable segments, an import table, resources, and an expectation that an enormous operating system is standing just out of frame, ready to lend it windows, fonts, memory, and a turn at the CPU. Running DOS taught us the chips. Running Windows meant building the operating system those chips were holding up.",
    },
    {
      h: "What the analysis revealed.",
      p: "Win16 isn't one problem; it's a stack of contracts, and every layer assumes the one below it already works. The loader has to relocate segments and patch per-instance prologues before a single instruction runs. KERNEL has to hand out memory as moveable handles, intern strings as atoms, and expose pieces of selector arithmetic as if they were variables. USER has to run a cooperative scheduler with one message queue, where an app's worst habits are load-bearing. GDI has to track every pen and brush as a handle and realize palettes against twenty reserved colours. Pull any thread and the jumper above it comes loose.",
    },
    {
      h: "The applications were right and the manual was wrong.",
      p: "Again and again the documentation described one behaviour and a shipping program relied on another. Selectors that change on every lock. Timers that silently drop ticks. A prologue the operating system rewrites on the program's behalf. None of these are bugs to be designed around — they're the real behaviour of a real machine, and the software of the era was written against the machine, not the manual. So the rule held, the same rule that governs the DOS side: emulate the hardware and the platform faithfully, and compatibility falls out as a byproduct. When the manual and the application disagree, the application wins. It usually has the better lawyers.",
    },
  ],
};

// How the team approached it.
window.WIN16_APPROACH = [
  {
    t: "Emulate the contract, not the app.",
    d: "Every fix targets the documented (or observed) behaviour of a Win16 API or structure — never a special case for one program. If F1GP and Write both break, they're both telling you the same thing about the machine. Fix the machine.",
  },
  {
    t: "Wine is the oracle for the API surface.",
    d: "The shape of the Win16 API — which ordinal is which function, in which DLL — is checked against Wine's .spec files by an ordinal verifier. Implement KERNEL.55 and it had better be Catch, because Wine says so and Wine has read everything.",
  },
  {
    t: "Fuzz the loaders and the call surface.",
    d: "fuzz_ne_loader and fuzz_mz_loader stress the executable parsers with malformed input; fuzz_win16_wine generates calls into KERNEL/USER/GDI and compares against Wine. The loaders are the front door — they get fuzzed like the front door.",
  },
  {
    t: "Dig until you understand.",
    d: "No patching around a symptom. The diagonal-shear bitmap, the off-centre label, the parrot in the wrong palette — each got chased to its exact byte. Time spent understanding the machine is never wasted; it's the only thing that stops the next ten bugs.",
  },
];

// Compatibility scoreboard — Windows 3.1 era software, with a status tier.
// tier: 3 = runs well, 2 = runs with rough edges, 1 = boots / partial.
window.WIN16_SCOREBOARD = [
  { app: "Notepad",            tier: 3, note: "Edits, opens, saves, prints. The hello-world of being a window." },
  { app: "Write",             tier: 3, note: "The word processor that shipped in the box. Fonts, formatting, the lot." },
  { app: "Paintbrush",        tier: 3, note: "256-colour, correct palette, transparent brushes — once 21, 22 and 23 landed." },
  { app: "Cardfile",          tier: 3, note: "A database for people who trust index cards. Works a treat." },
  { app: "Calculator",        tier: 3, note: "Both views. The scientific one even gets the floating point right." },
  { app: "Clock",             tier: 3, note: "Analogue and digital. Keeps time off the genuine 18.2 Hz tick (13)." },
  { app: "Solitaire",         tier: 3, note: "Cards drag, the deck cascades. The single most important compatibility target in computing." },
  { app: "Minesweeper",       tier: 3, note: "Boots, plays, judges you. Owner-drawn smiley intact." },
  { app: "Reversi",           tier: 2, note: "Plays a full game; the AI thinks at period-accurate speed, i.e. instantly, on 2026 silicon." },
  { app: "File Manager",      tier: 2, note: "Browses, copies, drag-and-drops. A few exotic drive operations still under the knife." },
  { app: "Program Manager",   tier: 2, note: "Groups, icons, double-click-to-launch. The shell, shelling." },
  { app: "Media Player",      tier: 2, note: "MCI plumbing in progress; plays what MMSYSTEM can currently feed it." },
  { app: "Terminal",          tier: 2, note: "Talks to the emulated UART and Hayes modem. Dials things that no longer answer." },
  { app: "Word for Windows",  tier: 1, note: "Loads and runs; the long tail of its custom UI is an active front." },
  { app: "Excel 3.0",         tier: 1, note: "Boots into the grid. Recalculation works; some chart paths pending." },
];

// Headline progress figures (qualitative — counts the work, not invented metrics).
window.WIN16_PROGRESS = [
  { k: "case files closed",       v: "30",  sub: "the ones in this report" },
  { k: "subsystems touched",      v: "8",   sub: "loader → dialogs" },
  { k: "apps running",            v: "13",  sub: "of the 15 on the board" },
  { k: "oracle for the API",      v: "Wine", sub: "ordinal-verified" },
];
