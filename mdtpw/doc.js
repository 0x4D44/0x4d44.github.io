/* mdtpw architecture deep-dive — interactivity
   - scroll-spy side nav
   - interactive compile pipeline (click stage -> detail panel)
   - DDVT dispatch stepper
   - reveal-on-scroll */

(function () {
  "use strict";

  /* ---------- Scroll-spy side nav ---------- */
  const navLinks = Array.from(document.querySelectorAll(".sidenav a[data-spy]"));
  const sections = navLinks
    .map((a) => document.getElementById(a.getAttribute("data-spy")))
    .filter(Boolean);

  function onScroll() {
    const y = window.scrollY + 120;
    let current = sections[0];
    for (const s of sections) {
      if (s.offsetTop <= y) current = s;
    }
    navLinks.forEach((a) =>
      a.classList.toggle("active", a.getAttribute("data-spy") === (current && current.id))
    );
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Interactive compile pipeline ---------- */
  const PIPE = [
    {
      n: "01", t: "Lex", f: "lexer.rs · 1,139 LOC",
      badge: "FRONT-END",
      title: "Lexer",
      file: "src/lexer.rs → Vec<Token>",
      desc: "Turns raw .PAS bytes into a token stream. Turbo Pascal is case-insensitive, so keywords are just identifiers the parser matches without regard to case.",
      pts: [
        "<b>CP1252-tolerant</b> reader: legacy .PAS files were authored in the Windows ANSI codepage, so non-UTF-8 bytes (the © sign, smart quotes) are transcoded rather than rejected.",
        "Resolves <code>{$I file.inc}</code> includes inline and records each includee's source so a later diagnostic points at the right file.",
        "Collects directive events — <code>{$R+/-}</code> range-check, <code>{$R name.res}</code> resource files, <code>{$IFDEF}</code> with <code>VER15</code> predefined.",
      ],
    },
    {
      n: "02", t: "Parse", f: "parser.rs · 2,359 LOC",
      badge: "FRONT-END",
      title: "Recursive-descent parser",
      file: "src/parser.rs → ast::Program",
      desc: "A hand-written recursive-descent parser builds the typed AST: units with interface/implementation, objects, records, sets, variant records, typed constants, nested procedures, and TP operator precedence.",
      pts: [
        "Produces one <code>Program</code> per compilation unit; <code>uses</code> clauses preserve interface-vs-implementation split for init ordering.",
        "<b>backfill_method_params</b> inherits a forward method's signature when a body omits its parameter list (<code>procedure TWindow.Paint;</code>).",
        "BP7 split-OWL <code>uses</code> names (Objects / OWindows / ODialogs) are canonicalised to the TPW 1.5 monolithic <code>WObjects</code> — unless a local unit shadows them.",
      ],
    },
    {
      n: "03", t: "Resolve", f: "resolve.rs · 348 LOC",
      badge: "FRONT-END",
      title: "Name & scope resolution",
      file: "src/resolve.rs (shared by sema + emit)",
      desc: "The single source of truth for routine signatures and lexical scope chains — so semantic analysis and code emission never duplicate type logic and can never disagree.",
      pts: [
        "Builds the nested-routine scope chain that the static-link ABI depends on (research A §5.6).",
        "Enforces TP's one-namespace-per-scope rule: a top-level routine and a global var/const can't collide (case-insensitive).",
        "Loaded once, consulted by both downstream planes — a deliberate anti-drift seam.",
      ],
    },
    {
      n: "04", t: "Sema", f: "sema.rs · 2,839 LOC",
      badge: "FRONT-END",
      title: "Semantic analysis + layout engine",
      file: "src/sema.rs · types.rs · consteval.rs",
      desc: "The analytical heart. Builds the structured TypeEnv (the layout engine), const-evaluates typed constants, resolves with-blocks, and type-checks every statement and expression. Produces the single Analysis the emitter consumes.",
      pts: [
        "<b>Layout engine</b> (<code>types.rs</code>, 1,325 LOC) owns record offsets, byte-packing, variant overlay, <code>SizeOf</code> and <code>absolute</code> — the load-bearing module.",
        "<b>Const-evaluator</b> (<code>consteval.rs</code>) lowers typed-constant initializers to LLVM constant text; in TP, typed constants are initialised mutable globals.",
        "Accumulates every error and renders them all at once, each mapped back to its true source unit.",
      ],
    },
    {
      n: "05", t: "Emit", f: "emit.rs · 6,743 LOC",
      badge: "FRONT-END",
      title: "AST → textual LLVM IR",
      file: "src/emit.rs → <out>.ll",
      desc: "The largest module. Lowers the typed AST directly to textual LLVM IR — no custom middle IR (decision D1: LLVM is the typed IR). Emits VMT and DMT globals, unit-init order, and the static-link frame structs for nested procedures.",
      pts: [
        "Nested routines get a <b>frame struct</b> <code>%fr.&lt;name&gt;</code>; children take a hidden <code>%up</code> pointer and walk the link chain.",
        "Emits the per-object <b>Dynamic Method Table</b> <code>@dmt.o{id}</code> consumed at runtime by <code>__tpw_ddvt_lookup</code>.",
        "Optionally emits DWARF/CodeView debug metadata when <code>--debug</code> is set.",
      ],
    },
    {
      n: "06", t: "Codegen", f: "link.rs · clang",
      badge: "LLVM BACKEND",
      title: "clang — IR to object",
      file: "src/link.rs → clang.exe → .obj",
      desc: "The textual .ll is handed to a bundled clang.exe (LLVM 21.1.8) which runs the optimizer and the x86 or x86-64 backend to produce a COFF object. No inkwell, no llvm-sys — we shell out to cached tools.",
      pts: [
        "Optimisation level <code>-O0…-O3</code> threads through from the immutable <code>Target</code> record (default <code>-O0</code> for byte-deterministic oracles).",
        "Tools are <b>embedded in mdtpw.exe</b> and extracted to <code>%LOCALAPPDATA%\\mdtpw\\backend\\&lt;hash&gt;\\</code> on first use.",
        "A fresh Windows host needs no installed LLVM, MSVC, or Windows SDK.",
      ],
    },
    {
      n: "07", t: "Link", f: "link.rs · lld-link",
      badge: "LLVM BACKEND",
      title: "lld-link — PE32 / PE32+",
      file: "src/link.rs → lld-link.exe → .exe",
      desc: "lld-link binds the object against the mdtpw_rt native floor, generated Win32 import libraries, and compiled .rsrc resources to produce a flat native PE image the modern loader treats like any other EXE.",
      pts: [
        "Win32 import libs are generated on the fly from the actual imports with <code>llvm-dlltool.exe</code>; resources compiled with <code>llvm-rc.exe</code>.",
        "<code>library</code> sources link as a <code>.dll</code> with an exports table; programs link as <code>.exe</code>.",
        "Subsystem is <code>/subsystem:windows</code> for OWL GUI apps, <code>console</code> for WinCrt programs.",
      ],
    },
    {
      n: "08", t: "Floor", f: "mdtpw_rt · 3,269 LOC",
      badge: "RUNTIME",
      title: "mdtpw_rt — the native floor",
      file: "mdtpw_rt/ · i686 + x86_64 staticlibs",
      desc: "A tiny #![no_std] Rust crate providing only the symbols clang/lld cannot synthesise: the freestanding entry point, WinAPI callback bridges, the __tpw_* helper surface, and the DDVT walker. Everything else is Pascal.",
      pts: [
        "Owns PE startup (<code>__mdtpw_start</code> for EXEs, <code>DllMain</code> for DLLs) — no MSVC CRT.",
        "Hosts the OWL <code>StdWndProc</code> trampoline, HWND→object table, and Win16⇄Win32 <code>TMessage</code> repack.",
        "Exposes <code>__tpw_ddvt_lookup</code> — the exact same code the compiler's <code>ddvt_walk.rs</code> unit-tests against.",
      ],
    },
  ];

  const track = document.getElementById("pipeTrack");
  const detail = document.getElementById("pipeDetail");

  function renderPipe(i) {
    const s = PIPE[i];
    Array.from(track.children).forEach((c, j) => c.classList.toggle("on", j === i));
    detail.innerHTML =
      '<div class="pdhead"><span class="badge">' + s.badge + "</span>" +
      "<h4>" + s.title + "</h4></div>" +
      '<div class="pdfile">' + s.file + "</div>" +
      "<p>" + s.desc + "</p>" +
      "<ul>" + s.pts.map((p) => "<li>" + p + "</li>").join("") + "</ul>";
  }

  PIPE.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "pstage";
    b.innerHTML =
      '<div class="pn">' + s.n + "</div>" +
      '<div class="pt">' + s.t + "</div>" +
      '<div class="pf">' + s.f.split(" · ")[0] + "</div>";
    b.addEventListener("click", () => renderPipe(i));
    b.addEventListener("mouseenter", () => renderPipe(i));
    track.appendChild(b);
  });
  renderPipe(0);

  /* ---------- DDVT dispatch stepper ---------- */
  const steps = Array.from(document.querySelectorAll(".ddvt-step"));
  const rows = Array.from(document.querySelectorAll(".ddvt-row"));
  const prog = document.getElementById("ddvtProg");
  const nextBtn = document.getElementById("ddvtNext");
  const resetBtn = document.getElementById("ddvtReset");
  let stepIdx = 0;

  // which table row to light at each step (-1 = none)
  const ROW_FOR_STEP = [-1, -1, -1, 1, 1, -1];

  function renderDDVT() {
    steps.forEach((s, i) => s.classList.toggle("lit", i <= stepIdx));
    rows.forEach((r, i) => r.classList.toggle("hot", i === ROW_FOR_STEP[stepIdx]));
    prog.textContent = "step " + (stepIdx + 1) + " / " + steps.length;
    nextBtn.textContent = stepIdx >= steps.length - 1 ? "Replay ⟳" : "Next ›";
  }
  nextBtn.addEventListener("click", () => {
    stepIdx = stepIdx >= steps.length - 1 ? 0 : stepIdx + 1;
    renderDDVT();
  });
  resetBtn.addEventListener("click", () => {
    stepIdx = 0;
    renderDDVT();
  });
  renderDDVT();

  /* ---------- Reveal on scroll ---------- */
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.08 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
})();
