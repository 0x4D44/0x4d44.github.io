(() => {
  "use strict";

  const generations = [
    {
      id: "8086",
      name: "8086",
      family: "The original contract",
      year: 1978,
      endYear: 1981,
      clock: "5–10 MHz",
      process: "3 µm HMOS",
      transistors: 29000,
      registerBits: 16,
      addressBits: 20,
      addressSpace: "1 MiB",
      cache: "None",
      frontEnd: "6-byte prefetch queue",
      issue: "One instruction stream",
      branch: "Taken control transfers discard the queue",
      headline: "Fetch and execute become two overlapping jobs.",
      summary: "The 8086 split itself into a Bus Interface Unit and an Execution Unit. While one instruction ran, the bus could pull later bytes into a six-byte queue. It was not yet a modern pipeline, but it introduced the central performance trick of the next twenty years: keep different parts of the machine busy at the same time.",
      architecture: [
        "Sixteen-bit general registers and arithmetic",
        "Segment:offset addressing forms a 20-bit physical address",
        "A variable-length byte stream with optional prefixes and ModR/M addressing",
        "A six-byte instruction queue decouples fetching from execution"
      ],
      isa: ["MOV / arithmetic / logic", "MUL & DIV", "REP string operations", "Near & far control flow", "BCD adjust instructions"],
      pressure: "The execution unit could drain the queue faster than memory refilled it, especially around branches and dense register-only code. The instruction set was compact and flexible; decoding and feeding it would become the permanent x86 problem.",
      stages: [
        { key: "fetch", label: "Bus fetch", detail: "Read instruction words whenever the external bus is free." },
        { key: "queue", label: "6-byte queue", detail: "Hold a short runway of future instruction bytes." },
        { key: "decode", label: "Decode", detail: "Interpret prefixes, opcode and operands." },
        { key: "execute", label: "Execute", detail: "Run microcoded or hardwired operations." }
      ],
      palette: "blue"
    },
    {
      id: "286",
      name: "80286",
      family: "Protection arrives",
      year: 1982,
      endYear: 1984,
      clock: "6–12 MHz family",
      process: "1.5 µm HMOS",
      transistors: 134000,
      registerBits: 16,
      addressBits: 24,
      addressSpace: "16 MiB",
      cache: "None on chip",
      frontEnd: "Prefetch + faster address machinery",
      issue: "In order",
      branch: "Queue refill remains visible",
      headline: "The processor learns that programs should not trust one another.",
      summary: "The 286 kept the 16-bit programming model but added protected mode: descriptor tables, privilege rings, bounds checks, task state and a 24-bit physical address. Its greatest change was not an ALU instruction. It was the idea that the processor could enforce an operating system's boundaries in hardware.",
      architecture: [
        "Protected mode descriptors replace raw segment arithmetic with checked objects",
        "Four privilege levels and hardware task-state structures",
        "A 24-bit physical address bus raises the ceiling to 16 MiB",
        "Faster instruction execution, address generation and bus sequencing"
      ],
      isa: ["LGDT / LIDT", "LMSW", "ARPL", "LAR / LSL", "BOUND", "ENTER / LEAVE"],
      pressure: "Protected mode was powerful but awkward to leave; software compatibility still pulled machines back toward the 8086 world. The 386 would keep protection while making 32-bit software and virtualised DOS practical.",
      stages: [
        { key: "fetch", label: "Prefetch", detail: "Keep instruction bytes arriving ahead of demand." },
        { key: "decode", label: "Decode", detail: "Recognise a larger instruction and systems vocabulary." },
        { key: "address", label: "Address + protect", detail: "Translate selectors and check bounds and privilege." },
        { key: "execute", label: "Execute", detail: "Run the instruction in program order." }
      ],
      palette: "teal"
    },
    {
      id: "386",
      name: "Intel386 DX",
      family: "The 32-bit machine",
      year: 1985,
      endYear: 1988,
      clock: "16–33 MHz family",
      process: "1.5–1.0 µm CHMOS",
      transistors: 275000,
      registerBits: 32,
      addressBits: 32,
      addressSpace: "4 GiB",
      cache: "External cache controller optional",
      frontEnd: "16/32-bit decode with prefixes, ModR/M and SIB",
      issue: "In order",
      branch: "No speculative execution",
      headline: "Registers, addresses and operating systems all become properly 32-bit.",
      summary: "The 386 widened the integer registers, offsets and physical address space to 32 bits while preserving 16-bit code. Paging added a second translation layer after segmentation, and virtual-8086 mode let protected operating systems run multiple DOS personalities. The encoding grew too: operand-size and address-size prefixes, two-byte opcodes and the SIB byte made old bytes describe new machines.",
      architecture: [
        "EAX–EDI and 32-bit arithmetic, offsets and stack operations",
        "Paging maps 4 KiB linear pages into a 4 GiB physical space",
        "Virtual-8086 mode executes real-mode applications under a protected monitor",
        "SIB addressing adds scaled index ×1/2/4/8 plus base and displacement"
      ],
      isa: ["BSF / BSR", "BT / BTS / BTR / BTC", "SHLD / SHRD", "SETcc", "MOVZX / MOVSX", "FS & GS"],
      pressure: "The architecture was now rich enough for Unix, Windows NT and modern virtual memory, but the core still waited on every dependency and every cacheless memory access. The next step was to overlap whole instructions in a real pipeline.",
      stages: [
        { key: "fetch", label: "Fetch", detail: "Prefetch a mixed 16/32-bit instruction stream." },
        { key: "decode", label: "Decode", detail: "Classify prefixes, opcode maps and addressing bytes." },
        { key: "address", label: "Address", detail: "Build effective, linear and optionally paged addresses." },
        { key: "execute", label: "Execute", detail: "Complete operations in program order." }
      ],
      palette: "violet"
    },
    {
      id: "486",
      name: "Intel486 DX",
      family: "The pipelined core",
      year: 1989,
      endYear: 1992,
      clock: "25–50 MHz DX family; faster DX2/DX4 later",
      process: "1.0 µm CHMOS",
      transistors: 1200000,
      registerBits: 32,
      addressBits: 32,
      addressSpace: "4 GiB",
      cache: "8 KiB unified on-chip L1",
      frontEnd: "Five-stage integer pipeline",
      issue: "Up to one simple instruction per clock",
      branch: "Pipeline bubbles on redirects",
      headline: "A simple instruction can start every clock.",
      summary: "The 486 pulled the floating-point unit and an 8 KiB cache onto the processor and organised the integer path as a five-stage pipeline. Fetch, two decode stages, execute and write-back could work on different instructions at once. The latency of one instruction did not disappear; the throughput of a stream changed dramatically.",
      architecture: [
        "Five overlapping integer stages target one simple instruction started per clock",
        "An 8 KiB on-chip unified cache hides many external bus accesses",
        "The 486DX integrates the x87 floating-point unit",
        "Burst transfers refill cache lines more efficiently"
      ],
      isa: ["BSWAP", "XADD", "CMPXCHG", "INVLPG", "WBINVD / INVD"],
      pressure: "One instruction per clock was a new ceiling. To go faster without merely raising frequency, Intel had to begin more than one instruction in a clock—and decide which neighbouring x86 instructions could safely travel together.",
      stages: [
        { key: "fetch", label: "Fetch", detail: "Read bytes from the on-chip cache." },
        { key: "d1", label: "Decode 1", detail: "Find instruction boundaries and primary opcode." },
        { key: "d2", label: "Decode 2", detail: "Complete addressing and control generation." },
        { key: "execute", label: "Execute", detail: "Run integer, memory or floating-point work." },
        { key: "write", label: "Write back", detail: "Commit the result to architectural state." }
      ],
      palette: "orange"
    },
    {
      id: "pentium",
      name: "Pentium",
      family: "Two lanes, one order",
      year: 1993,
      endYear: 1994,
      clock: "60–200 MHz family",
      process: "0.8 µm at launch",
      transistors: 3100000,
      registerBits: 32,
      addressBits: 32,
      addressSpace: "4 GiB",
      cache: "8 KiB instruction + 8 KiB data L1",
      frontEnd: "Dual U/V integer pipelines",
      issue: "Up to two paired instructions per clock, in order",
      branch: "Dynamic prediction with a branch target buffer",
      headline: "x86 becomes superscalar—but only when its neighbours get along.",
      summary: "The original Pentium could issue a suitable pair of integer instructions into its U and V pipelines. Both still arrived, executed and retired in program order, so a dependency or an unpairable instruction narrowed the machine back to one lane. Split instruction and data caches reduced contention, and dynamic branch prediction tried to keep both lanes supplied.",
      architecture: [
        "Two integer pipelines can issue a compatible U/V pair in one clock",
        "Separate 8 KiB instruction and 8 KiB data caches",
        "A branch target buffer predicts direction and destination",
        "A 64-bit external data bus moves two 32-bit words per transfer"
      ],
      isa: ["CPUID", "RDTSC", "CMPXCHG8B", "MMX in the 1997 family variant"],
      pressure: "Pairing rules exposed the limits of in-order superscalar design. One slow load or dependency could block younger independent work. The P6 team broke x86 instructions into simpler internal operations and let those operations execute when their inputs were ready.",
      stages: [
        { key: "fetch", label: "Fetch", detail: "Feed both lanes from the instruction cache." },
        { key: "d1", label: "Decode 1", detail: "Find as many as two instruction candidates." },
        { key: "d2", label: "Pair", detail: "Check U/V restrictions and dependencies." },
        { key: "u", label: "U pipe", detail: "The full-capability integer lane." },
        { key: "v", label: "V pipe", detail: "The restricted companion lane." },
        { key: "write", label: "Retire", detail: "Complete in original program order." }
      ],
      palette: "gold"
    },
    {
      id: "p6",
      name: "P6: Pentium Pro → II",
      family: "Dynamic execution",
      year: 1995,
      endYear: 1998,
      clock: "150–450 MHz across early P6 products",
      process: "0.6 µm at Pentium Pro launch",
      transistors: 5500000,
      registerBits: 32,
      addressBits: 36,
      addressSpace: "4 GiB linear; PAE extends physical addressing",
      cache: "Split L1; dedicated package or cartridge L2",
      frontEnd: "x86 decode → micro-operations",
      issue: "Out-of-order execution, in-order retirement",
      branch: "Speculative execution behind prediction",
      headline: "The visible program stays ordered while the engine underneath does not.",
      summary: "P6 decoded complex x86 instructions into smaller micro-operations, renamed registers to remove false dependencies, placed work in a reorderable pool and dispatched ready operations to several execution units. Results became architecturally real only when they retired in order. That single compromise—chaos inside, a precise ordered story outside—defined high-performance x86 for decades.",
      architecture: [
        "Three decoders translate x86 instructions into internal micro-operations",
        "Register renaming separates architectural names from physical values",
        "A scheduling window issues ready work out of order",
        "A reorder buffer retires results in program order for precise exceptions"
      ],
      isa: ["CMOVcc", "FCMOVcc", "PAE", "MMX with Pentium II"],
      pressure: "P6 made instruction-level parallelism much easier to exploit, but multimedia workloads still wanted wide operations on many values at once. Pentium III extended the same core with a new floating-point SIMD register file.",
      stages: [
        { key: "fetch", label: "Fetch", detail: "Predict a path and fetch x86 bytes." },
        { key: "decode", label: "Decode to µops", detail: "Translate instructions into simpler internal work." },
        { key: "rename", label: "Rename", detail: "Allocate fresh physical destinations and remove false hazards." },
        { key: "schedule", label: "Schedule", detail: "Wait until each operation's inputs and unit are ready." },
        { key: "execute", label: "Execute", detail: "Run independent operations out of order." },
        { key: "retire", label: "Retire", detail: "Commit completed work in original order." }
      ],
      palette: "green"
    },
    {
      id: "piii",
      name: "Pentium III",
      family: "Vectors enter the mainstream",
      year: 1999,
      endYear: 1999,
      clock: "450 MHz–1.4 GHz family",
      process: "0.25 µm at launch",
      transistors: 9500000,
      registerBits: 32,
      addressBits: 36,
      addressSpace: "4 GiB linear; PAE physical addressing",
      cache: "P6 split L1; Coppermine adds 256 KiB on-die L2",
      frontEnd: "P6 dynamic execution",
      issue: "Out-of-order µops + 128-bit SIMD",
      branch: "P6-family prediction and speculation",
      headline: "One instruction begins to describe four floating-point calculations.",
      summary: "Pentium III kept the P6 machinery and added Streaming SIMD Extensions: eight 128-bit XMM registers and 70 new instructions aimed at media, graphics and streaming data. Coppermine then moved a 256 KiB L2 cache on die and ran it at core speed, shrinking the distance to the next useful byte.",
      architecture: [
        "The P6 out-of-order engine remains the foundation",
        "SSE adds 128-bit packed single-precision floating-point operations",
        "Non-temporal stores and prefetch hints support streaming access",
        "Coppermine integrates a full-speed 256 KiB L2 cache"
      ],
      isa: ["SSE: 70 instructions", "XMM0–XMM7", "PREFETCHh", "MOVNTPS", "Packed single-precision arithmetic"],
      pressure: "P6 was balanced, but its frequency path was reaching practical limits. NetBurst made a different bet: much deeper pipelines, aggressive clocks and a front end that cached decoded micro-operations instead of repeatedly decoding x86 bytes.",
      stages: [
        { key: "fetch", label: "Fetch", detail: "Predict and fetch x86 instructions." },
        { key: "decode", label: "Decode to µops", detail: "Feed the established P6 engine." },
        { key: "rename", label: "Rename", detail: "Break false register dependencies." },
        { key: "schedule", label: "Schedule", detail: "Choose ready scalar or SIMD work." },
        { key: "execute", label: "Execute", detail: "Run integer, x87, MMX or SSE operations." },
        { key: "retire", label: "Retire", detail: "Preserve precise architectural order." }
      ],
      palette: "cyan"
    },
    {
      id: "p4",
      name: "Pentium 4",
      family: "The frequency machine",
      year: 2000,
      endYear: 2004,
      clock: "1.4–1.5 GHz at launch; much higher later",
      process: "0.18 µm at launch",
      transistors: 42000000,
      registerBits: 32,
      addressBits: 36,
      addressSpace: "4 GiB linear; extended physical addressing",
      cache: "~12K-µop trace cache + 8 KiB data L1 + 256 KiB L2 at launch",
      frontEnd: "NetBurst trace cache and deep pipeline",
      issue: "Out-of-order µops; fast integer ALUs",
      branch: "Prediction becomes critical to a 20-stage launch pipeline",
      headline: "Decode once, cache the µops, and stretch the clock path deep.",
      summary: "The first Pentium 4 used the NetBurst microarchitecture. Its launch pipeline was about twenty stages deep; a trace cache stored roughly twelve thousand already-decoded micro-operations; simple integer ALUs ran at twice the core frequency; and a quad-pumped 400 MHz system bus delivered 3.2 GB/s. The design reached spectacular clocks, but every wrong-path branch now wasted far more work.",
      architecture: [
        "A trace cache holds decoded µops in predicted execution order",
        "The launch design doubles pipeline depth to roughly twenty stages",
        "Simple integer ALUs run at twice core frequency in the Rapid Execution Engine",
        "A 400 MHz effective system bus supplies 3.2 GB/s at launch"
      ],
      isa: ["SSE2: 144 instructions", "128-bit packed integer", "Scalar & packed double precision", "Cache-control additions"],
      pressure: "NetBurst is the endpoint of this tour, not the endpoint of x86. Its costs made the lesson plain: frequency, pipeline depth, prediction accuracy, power and useful work per clock must be designed together.",
      stages: [
        { key: "predict", label: "Predict", detail: "Choose a path before the result is known." },
        { key: "trace", label: "Trace cache", detail: "Serve already-decoded µops when the trace hits." },
        { key: "queue", label: "µop queue", detail: "Buffer work across a deep front end." },
        { key: "rename", label: "Rename", detail: "Allocate internal destinations." },
        { key: "schedule", label: "Schedule", detail: "Select ready µops for execution." },
        { key: "execute", label: "Execute", detail: "Use fast ALUs, load/store and SIMD units." },
        { key: "retire", label: "Retire", detail: "Make speculative work architecturally real in order." }
      ],
      palette: "red"
    }
  ];

  const decodePresets = [
    {
      id: "mov16",
      label: "8086 · MOV AX,[BP+4]",
      mode: 16,
      bytes: "8B 46 04",
      minimum: "8086",
      explanation: "A one-byte opcode, ModR/M byte and signed 8-bit displacement. The BP-based address defaults to SS rather than DS.",
      expected: "MOV AX, word ptr [BP + 4]"
    },
    {
      id: "mov32sib",
      label: "386 · MOV EAX,[EBP+ECX×4+16]",
      mode: 32,
      bytes: "8B 44 8D 10",
      minimum: "386",
      explanation: "The ModR/M byte requests a SIB byte. SIB supplies scale ×4, index ECX and base EBP; the last byte is a signed displacement.",
      expected: "MOV EAX, dword ptr [EBP + ECX*4 + 0x10]"
    },
    {
      id: "imul32",
      label: "386 · two-byte IMUL",
      mode: 32,
      bytes: "0F AF C1",
      minimum: "386",
      explanation: "0F escapes into a second opcode map. ModR/M = C1 selects two registers: EAX as destination and ECX as source.",
      expected: "IMUL EAX, ECX"
    },
    {
      id: "jcc32",
      label: "386 · near conditional branch",
      mode: 32,
      bytes: "0F 84 78 56 34 12",
      minimum: "386",
      explanation: "The 0F 8x map added near conditional branches. The 32-bit relative displacement is little-endian: 0x12345678.",
      expected: "JE rel32 +0x12345678"
    },
    {
      id: "mmx",
      label: "Pentium MMX · packed move",
      mode: 32,
      bytes: "0F 6F C1",
      minimum: "Pentium MMX",
      explanation: "The familiar 0F map expands again. Here it names a packed 64-bit move between MMX registers.",
      expected: "MOVQ MM0, MM1"
    },
    {
      id: "sse",
      label: "Pentium III · scalar SSE move",
      mode: 32,
      bytes: "F3 0F 10 C1",
      minimum: "Pentium III",
      explanation: "A legacy REP prefix becomes a mandatory opcode selector in SSE space. The same byte now helps distinguish MOVSS from related vector moves.",
      expected: "MOVSS XMM0, XMM1"
    },
    {
      id: "sse2",
      label: "Pentium 4 · packed doubles",
      mode: 32,
      bytes: "66 0F 58 C1",
      minimum: "Pentium 4",
      explanation: "Operand-size prefix 66 becomes a mandatory SSE2 selector. 0F 58 is ADD; ModR/M C1 selects XMM0 and XMM1.",
      expected: "ADDPD XMM0, XMM1"
    }
  ];

  const pipelinePrograms = {
    straight: {
      label: "Independent arithmetic",
      instructions: [
        { text: "MOV EAX,[A]", kind: "load" },
        { text: "MOV EBX,[B]", kind: "load" },
        { text: "ADD ECX,EDX", kind: "alu" },
        { text: "XOR ESI,ESI", kind: "alu" },
        { text: "INC EDI", kind: "alu" },
        { text: "MOV [C],EAX", kind: "store" }
      ]
    },
    dependent: {
      label: "Dependency chain",
      instructions: [
        { text: "MOV EAX,[A]", kind: "load", writes: ["eax"] },
        { text: "ADD EAX,3", kind: "alu", reads: ["eax"], writes: ["eax"] },
        { text: "IMUL EAX,5", kind: "mul", reads: ["eax"], writes: ["eax"] },
        { text: "ADD EDX,EAX", kind: "alu", reads: ["eax"], writes: ["edx"] },
        { text: "MOV [C],EDX", kind: "store", reads: ["edx"] }
      ]
    },
    branch: {
      label: "Loop with a branch",
      instructions: [
        { text: "ADD EAX,[ESI]", kind: "load" },
        { text: "ADD ESI,4", kind: "alu" },
        { text: "DEC ECX", kind: "alu" },
        { text: "JNZ loop", kind: "branch", branch: true },
        { text: "MOV [SUM],EAX", kind: "store" }
      ]
    }
  };

  const schedulerPrograms = {
    independent: {
      label: "Four independent adds",
      description: "No instruction needs the result of another. Width, pairing rules and execution ports decide the finish.",
      instructions: [
        { id: "a", text: "ADD EAX,1", op: "alu", reads: ["eax"], writes: ["eax"], latency: 1, pair: true },
        { id: "b", text: "ADD EBX,2", op: "alu", reads: ["ebx"], writes: ["ebx"], latency: 1, pair: true },
        { id: "c", text: "ADD ECX,3", op: "alu", reads: ["ecx"], writes: ["ecx"], latency: 1, pair: true },
        { id: "d", text: "ADD EDX,4", op: "alu", reads: ["edx"], writes: ["edx"], latency: 1, pair: true }
      ]
    },
    mixed: {
      label: "Loads, multiply and useful work",
      description: "The multiply waits for EAX, but the EBX/EDX path is independent. An out-of-order engine can work around the blocked chain.",
      instructions: [
        { id: "a", text: "MOV EAX,[A]", op: "load", reads: [], writes: ["eax"], latency: 3, pair: true },
        { id: "b", text: "ADD EAX,3", op: "alu", reads: ["eax"], writes: ["eax"], latency: 1, pair: true },
        { id: "c", text: "IMUL ECX,EAX", op: "mul", reads: ["eax"], writes: ["ecx"], latency: 4, pair: false },
        { id: "d", text: "MOV EBX,[B]", op: "load", reads: [], writes: ["ebx"], latency: 3, pair: true },
        { id: "e", text: "ADD EDX,EBX", op: "alu", reads: ["ebx", "edx"], writes: ["edx"], latency: 1, pair: true },
        { id: "f", text: "XOR ESI,ESI", op: "alu", reads: [], writes: ["esi"], latency: 1, pair: true }
      ]
    },
    falseDeps: {
      label: "False name dependencies",
      description: "Architectural register names are reused. Renaming gives each write a fresh physical destination, removing WAR/WAW hazards while preserving true RAW dependencies.",
      instructions: [
        { id: "a", text: "MOV EAX,[A]", op: "load", reads: [], writes: ["eax"], latency: 3, pair: true },
        { id: "b", text: "ADD EBX,EAX", op: "alu", reads: ["eax", "ebx"], writes: ["ebx"], latency: 1, pair: true },
        { id: "c", text: "MOV EAX,[C]", op: "load", reads: [], writes: ["eax"], latency: 3, pair: true },
        { id: "d", text: "ADD EDX,EAX", op: "alu", reads: ["eax", "edx"], writes: ["edx"], latency: 1, pair: true },
        { id: "e", text: "MOV EAX,0", op: "alu", reads: [], writes: ["eax"], latency: 1, pair: true }
      ]
    }
  };

  const branchPatterns = {
    loop: { label: "Loop: T T T T N", sequence: [1, 1, 1, 1, 0] },
    alternating: { label: "Alternating: T N", sequence: [1, 0] },
    mostly: { label: "Mostly taken", sequence: [1, 1, 1, 0, 1, 1, 1, 1, 0, 1] },
    nested: { label: "Nested-loop texture", sequence: [1, 1, 0, 1, 1, 0, 1, 1, 0, 0] },
    random: { label: "Deterministic pseudo-random", sequence: [1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0] }
  };

  const branchCpuPresets = [
    { id: "8086", label: "8086 queue refill", penalty: 12, note: "Illustrative difference between a short untaken Jcc and a taken redirect that empties the queue." },
    { id: "486", label: "486 short pipeline", penalty: 3, note: "A compact teaching penalty for redirecting a short in-order pipeline." },
    { id: "pentium", label: "Pentium P5", penalty: 4, note: "Illustrative paired-pipeline redirect cost; exact timing depends on branch form and target state." },
    { id: "p6", label: "P6 speculative core", penalty: 11, note: "Representative teaching value for flushing speculative work; not a universal product constant." },
    { id: "p4", label: "Pentium 4 launch core", penalty: 20, note: "Illustrative teaching value aligned with the roughly twenty-stage launch pipeline; it is not a universal measured penalty." }
  ];

  const cycleFacts = [
    {
      cpu: "8086",
      source: "Intel 8086 Family User's Manual timing tables",
      facts: [
        { instruction: "MOV reg,reg", timing: "2 clocks", note: "Register-to-register form." },
        { instruction: "ADD reg,reg", timing: "3 clocks", note: "Register-to-register form." },
        { instruction: "Jcc", timing: "4 not taken / 16 taken", note: "Taken flow discards and refills the prefetch queue." },
        { instruction: "MUL r/m16", timing: "118–133 clocks", note: "Operand-dependent microcoded multiply." }
      ]
    },
    {
      cpu: "80286",
      source: "Intel 80286 programmer and hardware manuals",
      facts: [
        { instruction: "MOV reg,reg", timing: "2 clocks", note: "Prefetched, aligned, no wait states." },
        { instruction: "ADD reg,reg", timing: "2 clocks", note: "A useful view of the faster integer datapath." },
        { instruction: "Protected transfer", timing: "Variable", note: "Descriptor lookup, privilege checks and task state make system instructions context-sensitive." }
      ]
    },
    {
      cpu: "Intel386",
      source: "Intel 80386 Programmer's Reference Manual",
      facts: [
        { instruction: "MOV reg,reg", timing: "2 clocks", note: "The manual assumes bytes are prefetched and operands aligned." },
        { instruction: "ADD reg,reg", timing: "2 clocks", note: "Register form." },
        { instruction: "MUL r/m16", timing: "9–22 reg / 12–25 memory", note: "Early-out timing depends on the multiplier's significant bits." },
        { instruction: "MUL r/m32", timing: "9–38 reg / 12–41 memory", note: "Native 32-bit operation, still operand dependent." }
      ]
    },
    {
      cpu: "Intel486",
      source: "Intel486 manuals and optimisation references",
      facts: [
        { instruction: "Simple register ALU", timing: "1 clock throughput", note: "Once the five-stage pipeline is full." },
        { instruction: "MOV reg,reg", timing: "1 clock", note: "Representative simple pipelined operation." },
        { instruction: "Cache miss", timing: "Not one number", note: "Bus width, memory wait states, line fill and alignment dominate." }
      ]
    },
    {
      cpu: "Pentium and later",
      source: "Intel optimisation and microarchitecture manuals",
      facts: [
        { instruction: "Simple integer stream", timing: "Up to 2 instructions/clock on Pentium", note: "Only compatible U/V pairs; dependency and pairing rules matter." },
        { instruction: "P6 / NetBurst", timing: "Track latency, throughput and µops separately", note: "Out-of-order execution makes a single 'cycles per instruction' number misleading." },
        { instruction: "Branch", timing: "Prediction-dependent", note: "Correctly predicted work overlaps; a misprediction discards speculative work." }
      ]
    }
  ];

  const sources = [
    {
      era: "8086",
      title: "The 8086 Family User's Manual (Intel, October 1979)",
      href: "https://bitsavers.org/components/intel/8086/9800722-03_The_8086_Family_Users_Manual_Oct79.pdf",
      use: "Instruction format, six-byte queue, bus/execution split and documented clocks."
    },
    {
      era: "80286",
      title: "80286 and 80287 Programmer's Reference Manual (Intel, 1987)",
      href: "https://bitsavers.org/components/intel/80286/210498-005_80286_and_80287_Programmers_Reference_Manual_1987.pdf",
      use: "Protected mode, descriptors, privilege, tasks and instruction semantics."
    },
    {
      era: "Intel386",
      title: "80386 Programmer's Reference Manual (Intel, 1986)",
      href: "https://www.ardent-tool.com/CPU/docs/Intel/386/manuals/prref386/",
      use: "32-bit execution, paging, V86 mode, ModR/M + SIB format and instruction timing assumptions."
    },
    {
      era: "Intel486",
      title: "i486 Microprocessor Hardware Reference Manual (Intel, 1990)",
      href: "https://www.bitsavers.org/components/intel/80486/1990_i486_Microprocessor_Hardware_Reference_Manual.pdf",
      use: "Pipeline, on-chip cache, bus and integrated floating-point architecture."
    },
    {
      era: "Pentium",
      title: "Pentium Processor Family Developer's Manual, Vol. 1 (Intel, 1995)",
      href: "https://www.bitsavers.org/components/intel/pentium/241428-004_Pentium_Processor_Family_Developers_Manual_Volume_1_Jul95.pdf",
      use: "Dual pipelines, split caches, branch prediction and architectural overview."
    },
    {
      era: "P6",
      title: "Pentium Pro Family Developer’s Manual, Vol. 1 (Intel, 1996)",
      href: "https://www.bitsavers.org/components/intel/pentium-pro/242690-001_Pentium_Pro_Family_Developers_Manual_Volume_1_Jan96.pdf",
      use: "Three-way decode, micro-operations, register renaming, speculative out-of-order work and in-order retirement."
    },
    {
      era: "Pentium II",
      title: "Dual Independent Bus Architecture (Intel, 1997)",
      href: "https://www.intel.com/pressroom/archive/releases/1997/CN040997.HTM",
      use: "Dedicated L2 path and system-bus evolution in the P6 family."
    },
    {
      era: "Pentium III",
      title: "Pentium III Processor Launch (Intel, 1999)",
      href: "https://www.intel.com/pressroom/archive/releases/1999/dp022699.htm",
      use: "Seventy SSE instructions and launch positioning."
    },
    {
      era: "Pentium 4",
      title: "Intel Announces NetBurst Microarchitecture (Intel, 2000)",
      href: "https://www.intel.com/pressroom/archive/releases/2000/dp082200.htm",
      use: "Twenty-stage launch pipeline, trace cache, fast ALUs, system bus and SSE2."
    },
    {
      era: "Across the line",
      title: "Intel Microprocessor Quick Reference Guide",
      href: "https://www.intel.com/pressroom/kits/quickreffam.htm",
      use: "Introduction dates, transistor counts, process sizes, caches and headline product specifications."
    }
  ];

  window.X86_DATA = {
    generations,
    decodePresets,
    pipelinePrograms,
    schedulerPrograms,
    branchPatterns,
    branchCpuPresets,
    cycleFacts,
    sources
  };
})();
