// The thirty. Each is a "case file" on a real Win16 (Windows 3.1 / NE)
// emulation problem the mddosem compatibility sweep worked through.
// Content is grounded in genuine Win16 internals — the NE loader,
// KERNEL/USER/GDI, the cooperative message queue, the global/local heaps,
// GDI handles and palettes. Written illustratively, in the team's voice.
//
// fields:
//   n        two-digit number
//   cat      subsystem key (see SUBSYSTEMS in data.jsx)
//   title    short headline
//   ord      the API / structure it lives nearest to (mono label)
//   spanners difficulty 1..5
//   symptom  what an app actually did wrong
//   cause    the real root cause in the machine
//   fix      what the emulator now does
//   unlocks  what started working
//   war      the war story / the dead end / the bit that hurt
//   toy      optional id of an interactive demo

window.WIN16_FIXES = [
  // ───────────────────────────── LOADER ─────────────────────────────
  {
    n: "01", cat: "loader", title: "The module that loads itself",
    ord: "NE flags · self-loader", spanners: 4,
    symptom: "A handful of applications — and several runtime DLLs — got as far as their splash and then sat there, doing an extremely convincing impression of a paperweight.",
    cause: "Their NE header had the self-loading bit set. Rather than letting the OS map their segments, these modules ship a bootstrap loader of their own and expect KERNEL to call it back through a documented entry point, handing over a table of callbacks. We were dutifully loading segments the module had every intention of loading itself.",
    fix: "Detect the self-load flag, leave the segments alone, populate the bootstrap's callback table, and jump to the module's own loader. From there it asks us for segments politely, one at a time.",
    unlocks: "Self-loading runtimes (the kind shipped with a lot of early Windows development tools) and the apps that depend on them.",
    war: "The give-away was that the module's first code segment was three bytes of nonsense. It was supposed to be three bytes of nonsense — the real entry point was in the header all along. A full day was lost to the theory that the executable was corrupt. It was not corrupt. It was just smug.",
  },
  {
    n: "02", cat: "loader", title: "The prologue that rewrites itself",
    ord: "1E 58 90 · push ds / pop ax / nop", spanners: 5,
    symptom: "Open one copy of an app: fine. Open a second copy: the two of them quietly corrupt each other's data, then one falls over and takes the other with it.",
    cause: "Every exported Win16 function begins with the prologue 1E 58 90 — push ds; pop ax; nop. For a DLL with a single shared data segment the loader rewrites it to MOV AX, DGROUP, forcing DS to that one segment on entry; for an application whose data is per-instance it rewrites the bytes to three NOPs and lets the correct instance's DGROUP arrive in AX from the MakeProcInstance thunk (the following MOV DS, AX then sets DS). We were applying one DGROUP to every instance. Two tasks, one data segment, predictable carnage.",
    fix: "Allocate a fresh automatic data segment per task instance and patch the entry prologues so each exported function binds DS to its own instance's data on the way in.",
    unlocks: "Running two copies of the same program at once — and the MDI applications that are effectively N copies wearing a trench coat.",
    war: "The prologue is self-modifying code written by the operating system, about itself, before the program has run a single instruction. Explaining that sentence to the differential fuzzer took longer than the fix.",
  },
  {
    n: "03", cat: "loader", title: "Relocations all the way down",
    ord: "NE per-segment relocation records", spanners: 4,
    symptom: "Programs jumped, with great confidence, directly into the middle of nowhere.",
    cause: "Each NE segment carries its own relocation table, and the records come in flavours: internal references, imported ordinals, imported names, and OSFIXUP. Worse, a single record can be the head of a relocation chain — the target field at the patch site isn't a value, it's the offset of the *next* site to patch, terminated by 0xFFFF. Miss the chaining and you fix up exactly one of the fifty places that needed it.",
    fix: "A relocation engine that handles all four record types and walks the relocation chains to the 0xFFFF terminator, resolving imports against the module reference table as it goes.",
    unlocks: "Essentially everything. A Win16 binary that isn't relocated correctly doesn't run; it auditions for a fault handler.",
    war: "The relocation chain is a linked list threaded through the code segment itself, using the bytes you're about to overwrite as the next pointer. It is a beautiful idea and we would like a word with whoever had it.",
  },
  {
    n: "04", cat: "loader", title: "A stack, a heap and a segment walk into DGROUP",
    ord: "automatic data segment · BSS", spanners: 3,
    symptom: "Apps that started cleanly ran out of memory almost immediately, or scribbled off the end of their own stack into their own statics.",
    cause: "The automatic data segment (DGROUP) isn't just the program's globals. The loader has to lay out, inside that one 64K segment, the initialised data, the BSS, the local heap, and the stack — using the minimum-heap and minimum-stack sizes from the NE header, and growing the segment to fit. We were mapping the data and forgetting it needed somewhere to *live*.",
    fix: "Compute the DGROUP layout from the header fields, reserve heap and stack, zero the BSS, and set SP and the local-heap base where the program expects to find them.",
    unlocks: "Stable startup for almost every Win16 program, and a local heap that LocalAlloc can actually allocate from (see 11).",
    war: "Win16's stack and near heap share one segment and grow toward each other. There is no guard page. There is only optimism.",
  },
  {
    n: "05", cat: "loader", title: "Throwing code overboard",
    ord: "MOVEABLE · DISCARDABLE segments", spanners: 3,
    symptom: "Larger applications ran for a while and then died reaching for code that, by all accounts, they had successfully loaded earlier.",
    cause: "Code segments marked MOVEABLE and DISCARDABLE can be thrown away under memory pressure and faulted back in on next use. A far call into a discarded segment traps, KERNEL reloads it from the executable, and execution resumes. We had loaded every segment once and assumed it would stay put. Real Windows makes no such promise.",
    fix: "A segment table that tracks present/discarded state, an LRU for what to evict, and a not-present fault path that reloads a segment from disk and re-applies its relocations before resuming the call.",
    unlocks: "Big applications on small memory — exactly the configuration Windows 3.1 was designed to survive.",
    war: "Re-applying relocations on reload — all of them, since a discarded segment comes back off disk in its raw, un-relocated state — is the kind of detail that doesn't show up until the one app that discards its most-relocated segment.",
  },

  // ───────────────────────────── KERNEL ─────────────────────────────
  {
    n: "06", cat: "kernel", title: "Counting on your fingers in run-length",
    ord: "GetProcAddress · entry table bundles", spanners: 3,
    symptom: "Imports resolved to the wrong function. A call to 'get the version' would land in 'free this memory', which is exciting precisely once.",
    cause: "The NE entry table isn't a flat array. It's a sequence of bundles, each declaring a run of N entries of a given type (unused, fixed, or moveable), and ordinals are counted *through* the bundles. Treat it as a flat table and every ordinal after the first unused-run is off by the size of that run.",
    fix: "Parse the entry table as the run-length bundle list it is, so GetProcAddress and the loader's own ordinal lookups land on the right entry.",
    unlocks: "Correct import resolution across KERNEL, USER, GDI and every third-party DLL — the foundation the other 29 stand on.",
    war: "Ordinal 1 of KERNEL is FatalExit. When your entry table is off by one, the very first thing many apps successfully call is the function that prints a fatal error and stops. It is almost considerate.",
  },
  {
    n: "07", cat: "kernel", title: "Catch, Throw, and the art of the long jump",
    ord: "KERNEL.55 / KERNEL.56", spanners: 3,
    symptom: "Dialogs that hit an error didn't show a message and back out — they unwound straight through the application and left it standing in a field, blinking.",
    cause: "Catch and Throw are Win16's setjmp/longjmp: Catch snapshots the registers (including SP, BP and the stack segment) into a buffer; Throw restores them, teleporting execution back up the stack across any number of frames. The dialog manager and a lot of error handling lean on it. We had stubs that caught nothing and threw nobody.",
    fix: "Implement the register snapshot and restore faithfully, stack segment and all, so a Throw lands exactly where its matching Catch was standing.",
    unlocks: "The dialog manager's error recovery, and the surprising number of apps that use Catch/Throw as a poor man's exception handler.",
    war: "It is a goto that survives function returns. Rust has opinions about this. We did not consult them.",
  },
  {
    n: "08", cat: "kernel", title: "The pointer that wraps the wrong way",
    ord: "__AHINCR · __AHSHIFT", spanners: 4,
    symptom: "Anything walking a buffer larger than 64K — a big bitmap, a long document — corrupted memory the instant it crossed a segment boundary.",
    cause: "A 'huge' pointer in Win16 spans multiple selectors. To step from offset 0xFFFF to the next 64K, you don't just add one — you add a magic value, __AHINCR, to the selector to reach the next tile in the LDT. That value isn't 1; in protected mode it's the selector stride. Apps import __AHINCR from KERNEL as if it were a variable and bake it into their pointer arithmetic. Ours was wrong, so their arithmetic was wrong.",
    fix: "Expose __AHINCR and __AHSHIFT with the values implied by our LDT layout, and tile multi-segment global allocations so that selector + __AHINCR genuinely lands on the next 64K.",
    unlocks: "Huge bitmaps, large documents, anything that does pointer math across the 64K wall — which in graphics software is constantly.",
    war: "These aren't functions. They're integers that the linker resolves as if they were addresses. The 'address' of __AHINCR *is* the number. Pointer arithmetic and the symbol table, holding hands. Lovely. Hated it.",
  },
  {
    n: "09", cat: "kernel", title: "A short word about atoms",
    ord: "AddAtom · RegisterClass", spanners: 2,
    symptom: "Registering a window class succeeded; creating a window of that class failed to find it. Two strings that were obviously equal compared as not-equal.",
    cause: "Win16 interns strings into atom tables — a local one per task and a global one shared across the system. RegisterClass stores the class name as an atom; CreateWindow looks it up by atom. Property lists, DDE and clipboard formats all do the same. Our atom table didn't case-fold the way Windows does, and didn't share the global table where it should, so equal strings minted unequal atoms.",
    fix: "Proper local and global atom tables with the documented case-insensitive hashing and reference counting, shared at the right scope.",
    unlocks: "Window class lookup, GetProp/SetProp, DDE conversations and registered clipboard formats.",
    war: "An atom is a 16-bit integer standing in for a string to save memory on a machine with not very much. We have gigabytes now and re-implemented the parsimony exactly, out of respect.",
  },

  // ───────────────────────────── MEMORY ─────────────────────────────
  {
    n: "10", cat: "memory", title: "Locking a handle that moves",
    ord: "GlobalAlloc · GlobalLock", spanners: 4,
    symptom: "Programs allocated memory, locked it, wrote to the pointer, and watched their data turn up somewhere else entirely — or nowhere.",
    cause: "GlobalAlloc returns a *handle*, not a pointer. The block can move (it's MOVEABLE) or vanish (DISCARDABLE) until you GlobalLock it, which pins it and hands back a far pointer built from a freshly allocated selector. We were treating the handle as a pointer, which works just often enough to be cruel.",
    fix: "A global heap that distinguishes handles from selectors, allocates a real LDT selector on lock with base and limit set to the block, tracks the lock count, and only allows a move or discard when the count hits zero.",
    unlocks: "Practically all inter-app data transfer — the clipboard, DDE, and the loading of resources, all of which traffic in global handles.",
    war: "GlobalLock returning a different selector each call is fine. One app cached the selector across an unlock/relock and was furious to find it invalid. The app was wrong. We emulated the app being wrong anyway, because compatibility is ground truth.",
  },
  {
    n: "11", cat: "memory", title: "The heap that lives in your data segment",
    ord: "LocalAlloc · LMEM_MOVEABLE", spanners: 3,
    symptom: "Controls with a lot of content — list boxes, edit fields — corrupted themselves as they grew, or simply refused to.",
    cause: "LocalAlloc allocates from the local heap, which lives *inside* the task's 64K DGROUP (the one from fix 04). Moveable local objects return a handle into a local handle table; LocalLock dereferences it to a near pointer. The heap compacts under pressure, shuffling moveable blocks. Get the handle-table indirection wrong and a compaction relocates the data out from under a stale pointer.",
    fix: "A real local heap arena inside DGROUP with the documented handle table, moveable/fixed blocks, and compaction that fixes up the handle table so LocalLock always resolves correctly.",
    unlocks: "The standard controls (27, 28), which keep their guts on the local heap, and any app that uses LocalAlloc directly.",
    war: "The local heap and the stack are roommates in the same 64K. We have already discussed how well that goes (04). It goes exactly that well here too.",
  },
  {
    n: "12", cat: "memory", title: "Hand-rolling the descriptor table",
    ord: "AllocSelector · SetSelectorBase/Limit", spanners: 4,
    symptom: "Apps doing their own segment tricks — aliasing memory through a second selector, or building a read/write view of their own code — read zeroes or faulted.",
    cause: "AllocSelector, FreeSelector, SetSelectorBase, SetSelectorLimit and ChangeSelector let a program manipulate LDT entries directly. They're how you alias one chunk of memory under two selectors with different rights. We had a selector model that assumed segments were fixed real-mode paragraphs, which is true right up until a program enters protected mode and starts editing the descriptor table by hand.",
    fix: "A proper LDT with base/limit/rights per selector, wired to AllocSelector and friends, so a program can mint and reshape descriptors and have them mean what protected mode says they mean.",
    unlocks: "Code that writes to its own code segment via an aliased data selector — common in anything that patches itself, including some copy-protection.",
    war: "Yes, copy-protection. Emulating the hardware faithfully means faithfully helping a 1993 program check whether it's been pirated. It always decides it hasn't. We find this oddly touching.",
  },
  {
    n: "13", cat: "memory", title: "Reading the clock through a magic selector",
    ord: "__0040H · BIOS data area", spanners: 2,
    symptom: "An app's internal clock ran fast, slow, or stood still. Timing-sensitive animation stuttered or sprinted.",
    cause: "Some programs skip the API and read the BIOS tick counter straight out of the BIOS data area at 0040:006C, using KERNEL's pre-made __0040H selector that maps low physical memory into protected mode. If that selector doesn't point where the BIOS data area actually is — and if the PIT isn't incrementing the counter at 18.2 Hz — the program's sense of time is fiction.",
    fix: "Provide the __0000H / __0040H / __ROMBIOS low-memory selectors with correct bases, and keep the BIOS tick at 0040:006C marching at the genuine 18.2 ticks per second driven by the emulated PIT.",
    unlocks: "Apps that time themselves off the BIOS tick rather than SetTimer — which is more of them than you'd hope.",
    war: "18.2 Hz is 1,193,182 ÷ 65,536. The .2 has ended more friendships than money. We carry the fraction.",
  },

  // ───────────────────────────── USER ─────────────────────────────
  {
    n: "14", cat: "user", title: "A gentleman's agreement about CPU time",
    ord: "GetMessage · PeekMessage · Yield", spanners: 5, toy: "queue",
    symptom: "One badly-behaved program would freeze the entire desktop. Every other window stopped repainting, stopped responding, stopped existing in any meaningful sense.",
    cause: "Windows 3.1 is cooperatively scheduled. There is one system message queue, and a task only yields the CPU when it calls GetMessage, WaitMessage, or PeekMessage *with* PM_NOYIELD absent. An app that PeekMessages in a tight loop without yielding holds the whole machine hostage — and that's not a bug we should fix, it's behaviour we must reproduce, because apps were written assuming exactly this scheduling.",
    fix: "A faithful cooperative scheduler: one queue, yields only at the documented yield points, and message delivery ordering (posted vs sent vs WM_PAINT vs WM_TIMER) exactly as Windows prioritised them.",
    unlocks: "Correct multitasking behaviour — including the correct *bad* behaviour that apps depend on, like spinning until a specific message arrives.",
    war: "We built a perfectly good pre-emptive scheduler first. It ran everything beautifully and broke every app that assumed it would never be interrupted mid-paint. We deleted it. Compatibility is ground truth; the ground truth here is 'do less'.",
  },
  {
    n: "15", cat: "user", title: "Posting a letter versus making a phone call",
    ord: "SendMessage · PostMessage", spanners: 4,
    symptom: "Inter-window communication either deadlocked or returned garbage where a result was expected.",
    cause: "PostMessage drops a message in the queue and returns immediately. SendMessage is synchronous — it calls the target window's procedure and doesn't return until it produces a result, even when the target belongs to another task. Across tasks that requires the cooperative scheduler to run the receiver's WndProc, capture its return value, and hand it back to the caller. We had PostMessage's fire-and-forget standing in for SendMessage's there-and-back.",
    fix: "Synchronous SendMessage that invokes the target WndProc inline for same-task windows, and marshals through the scheduler for cross-task sends, returning the real LRESULT.",
    unlocks: "Control notifications, WM_GETTEXT-style queries, and the enormous amount of code that treats SendMessage as a function call that happens to take a window.",
    war: "SendMessage to a window in a hung task hangs you too. We reproduce this faithfully, which means we have built a feature whose headline behaviour is 'shares the consequences of someone else's mistake'.",
  },
  {
    n: "16", cat: "user", title: "The frame around the window",
    ord: "DefWindowProc · WM_NCHITTEST", spanners: 3,
    symptom: "Windows drew their contents but had no title bar you could grab, no working close box, no resize, and a system menu that did nothing.",
    cause: "The non-client area — caption, borders, system menu, min/max boxes — is DefWindowProc's responsibility, not the application's. It hit-tests the cursor (WM_NCHITTEST) to decide whether you're on the caption or a border, runs the modal move/size loop on a click, paints the frame (WM_NCPAINT), and serves the system menu. We had passed unhandled messages to a DefWindowProc that mostly shrugged.",
    fix: "A DefWindowProc that does the real non-client work: hit-testing, caption drag, border resize, the system menu, and frame painting — so a window with no special code still behaves like a window.",
    unlocks: "Move, resize, minimise, maximise and close on every standard window, for free, exactly as the apps assume.",
    war: "The move loop is modal: it captures the mouse and runs its own little message pump until you let go. A modal loop inside the message handler of the cooperative scheduler is as much fun to reason about as that sentence implies.",
  },
  {
    n: "17", cat: "user", title: "The repaint that never ended",
    ord: "BeginPaint · the update region", spanners: 3,
    symptom: "Some windows pegged the CPU repainting forever; others never repainted at all and showed whatever garbage was behind them.",
    cause: "WM_PAINT isn't queued like other messages — it's generated whenever a window has a non-empty update region and the queue is otherwise empty. BeginPaint is what *clears* that region. Skip BeginPaint/EndPaint, or fail to validate the region, and the window is permanently dirty: WM_PAINT regenerates immediately, forever. Validate too eagerly and a genuinely dirty window never gets told.",
    fix: "Real update-region accounting — InvalidateRect adds, BeginPaint validates and hands back the clip region, WM_PAINT is synthesised only while the region is non-empty — matching the documented generate/validate dance.",
    unlocks: "Correct, efficient repainting everywhere, and an end to both the infinite-repaint spin and the never-repaint void.",
    war: "WM_PAINT is the message that exists because a flag is set, not because anyone sent it. Explaining 'this message has no sender' to a message-tracing tool that wants a sender produced a pleasing little stand-off.",
  },
  {
    n: "18", cat: "user", title: "Tick",
    ord: "SetTimer · WM_TIMER", spanners: 2,
    symptom: "Clocks, animations and timeouts ran at the wrong rate or fired in bursts after a stall.",
    cause: "SetTimer asks for a WM_TIMER every so-many milliseconds, but WM_TIMER is the lowest-priority message there is: it's only synthesised when the queue is empty and the timer's due, and it does *not* accumulate — fall behind and you get one WM_TIMER, not the twelve you missed. The period is quantised to the 55 ms system tick. We were treating timers as precise and cumulative; they are neither.",
    fix: "Timers driven off the same 18.2 Hz tick, coalesced (never queued more than one pending WM_TIMER per timer), and delivered at the documented low priority.",
    unlocks: "Clock, the cursor blink, marquee effects, and every modal timeout — at the right, slightly-wrong, period.",
    war: "An app that wanted smooth animation from a 55 ms timer was always going to be disappointed. We faithfully reproduce the disappointment. It's a period piece.",
  },
  {
    n: "19", cat: "user", title: "Wearing another window's procedure",
    ord: "SetWindowLong · GWL_WNDPROC", spanners: 3,
    symptom: "Apps that subclassed a control — slipping their own code in front of its window procedure — either lost their hook entirely or recursed into the floor.",
    cause: "Subclassing swaps a window's procedure via SetWindowLong(GWL_WNDPROC), keeping the old one to chain to with CallWindowProc. It also relies on per-window extra bytes (cbWndExtra) and per-class extra bytes (cbClsExtra) to stash state. CallWindowProc has to handle both real window procedures and the loader's instance thunks. We stored the procedure but mishandled the thunk and the extra-bytes, so the chain broke.",
    fix: "GWL_WNDPROC swap with correct storage, honest cbWndExtra/cbClsExtra allocation, and a CallWindowProc that calls through both plain procedures and instance thunks so the subclass chain holds.",
    unlocks: "Subclassed controls — custom edit fields, validated inputs, owner-tweaked buttons — which is a huge fraction of real-world UI code.",
    war: "Subclassing is monkey-patching with a 16-bit far pointer. The chain is only as strong as everyone agreeing to call the next link. One app forgot. We did not get to forget on its behalf.",
  },

  // ───────────────────────────── GDI ─────────────────────────────
  {
    n: "20", cat: "gdi", title: "Whose brush is it anyway",
    ord: "GetStockObject · SelectObject", spanners: 3,
    symptom: "Drawing came out in the wrong colours or vanished; occasionally an app deleted an object mid-use and pulled the rug from under its own DC.",
    cause: "GDI hands out objects (pens, brushes, fonts, bitmaps, palettes) as handles into a shared object table. SelectObject swaps one into a DC and returns the previous one, which you're obliged to restore. Stock objects are shared and must never be deleted; DeleteObject on a currently-selected object should fail. We had a handle table that didn't enforce any of these social rules.",
    fix: "A GDI object table with typed handles, stock objects that refuse deletion, SelectObject that returns the prior object, and a DeleteObject that declines to delete something currently in a DC.",
    unlocks: "Correct drawing state across every GDI app, and an end to the use-after-free that 'delete the brush I'm painting with' invites.",
    war: "The contract is 'select, use, select the old one back, then delete'. The number of programs that select, use, and wander off is a small monument to the patience of the original GDI.",
  },
  {
    n: "21", cat: "gdi", title: "The right colours in the wrong order",
    ord: "RealizePalette · system colours", spanners: 4, toy: "palette",
    symptom: "256-colour images came out looking like a fruit machine — recognisable, but every colour swapped for its neighbour, and the greys gone lurid.",
    cause: "In 8-bit colour, an app's logical palette has to be *realized* into the hardware palette, which already has 20 reserved system colours pinned at fixed slots (the first 10 and last 10). Pixels referencing palette entries via PALETTEINDEX must be mapped through the realized order; PALETTERGB must be matched to the nearest available. We were writing the logical palette straight to the hardware, trampling the reserved slots and ignoring the index translation.",
    fix: "Honest palette realization: reserve the 20 system colours, map logical entries into the free slots, and translate PALETTEINDEX / PALETTERGB references through the realized mapping. Foreground windows realize first.",
    unlocks: "Paintbrush, image viewers, and any 256-colour artwork — now in the colours the artist actually chose.",
    war: "We spent an afternoon certain the test image was just ugly. It was not ugly. It was a perfectly nice picture of a parrot being shown through a palette that had been to art college and rebelled.",
  },
  {
    n: "22", cat: "gdi", title: "Two hundred and fifty-six ways to combine two rectangles",
    ord: "BitBlt · ternary raster ops", spanners: 4, toy: "rop",
    symptom: "Sprites drew as opaque blocks with no transparency; XOR-based rubber-band selection boxes left smears; pattern fills came out solid.",
    cause: "BitBlt takes a raster-operation code — a ternary truth table combining source, destination and brush pattern. SRCCOPY is the easy one; the interesting work (transparency, inversion, rubber-banding) lives in SRCAND, SRCINVERT, PATCOPY, MERGEPAINT and the other 251. We implemented SRCCOPY and treated the rest as SRCCOPY with extra steps, i.e. wrongly.",
    fix: "A BitBlt that evaluates the full ternary ROP per pixel across source, destination and pattern, plus StretchBlt honouring the stretch mode for shrink-vs-grow.",
    unlocks: "Transparent sprites (the classic AND-mask then XOR-sprite two-step), rubber-band selection, pattern fills — the everyday vocabulary of GUI drawing.",
    war: "The two-blit transparency trick — AND the mask to punch a hole, XOR the sprite into it — is older than some of the team and twice as elegant. Watching it light up for the first time was the closest this project gets to a sunrise.",
  },
  {
    n: "23", cat: "gdi", title: "Which way is up",
    ord: "SetDIBitsToDevice · BI_RGB", spanners: 3,
    symptom: "Bitmaps loaded from disk appeared upside-down, or sheared diagonally as if the image were slowly falling over.",
    cause: "Device-independent bitmaps are stored bottom-up by default — the first row in the file is the bottom row on screen — unless the height is negative, which means top-down. And every scanline is padded to a 4-byte boundary, so a 3-byte-wide row occupies 4 bytes. Read it top-down when it's bottom-up and it flips; ignore the padding and every row drifts one byte, hence the diagonal shear.",
    fix: "DIB handling that respects sign-of-height for orientation and pads every scanline stride to four bytes, for both reading DIBs in and blitting device-dependent bitmaps out.",
    unlocks: "Correct bitmap loading everywhere — wallpaper, toolbar images, anything that ships a .BMP.",
    war: "The diagonal shear is the single most diagnostic bug in graphics. The moment you see a picture lean, you know — to the byte — what's wrong. It's almost nice to meet an old friend.",
  },
  {
    n: "24", cat: "gdi", title: "Choosing a face from a very short list",
    ord: "GetTextMetrics · the font mapper", spanners: 3,
    symptom: "Text was the wrong size, overran its buttons, or fell back to a single blocky face regardless of what the program asked for.",
    cause: "CreateFont describes an *ideal* font; the font mapper picks the closest one actually installed, scoring on height, weight, pitch and family. Windows 3.1's stock faces — System, Terminal, MS Sans Serif, Courier — are raster fonts at fixed sizes, and an app laying out a dialog measures text with GetTextMetrics and trusts the numbers. If our metrics lie, every layout built on them is wrong by exactly that lie.",
    fix: "A font mapper that scores logical fonts against the available faces and returns honest GetTextMetrics — character widths, ascent, descent, internal leading — so text measures and lays out correctly. SetTextAlign honoured for the drawing origin.",
    unlocks: "Dialogs and menus that fit their text, and any app that sizes itself from font metrics — which is all the careful ones.",
    war: "A program once centred a label by measuring it and splitting the difference. Our metrics were two pixels generous. The label was, with total confidence, two pixels off-centre. Pixels keep the receipts.",
  },

  // ───────────────────────────── RESOURCE ─────────────────────────────
  {
    n: "25", cat: "resource", title: "Everything the program forgot to compile in",
    ord: "LoadString · LoadBitmap · resource table", spanners: 3,
    symptom: "Menus came up blank, dialogs had no text, icons were missing, and string-table lookups returned nothing.",
    cause: "Strings, bitmaps, icons, cursors, menus, dialog templates and accelerators all live in the NE resource table, addressed by type and by name-or-ordinal, with offsets and lengths scaled by a per-file alignment shift count. Strings are bundled sixteen to a block. Miss the alignment shift and every resource offset is wrong by a power of two; miss the string bundling and LoadString(N) returns string N-mod-16 of the wrong block.",
    fix: "A resource table parser that applies the alignment shift, resolves named and ordinal resources, and unpacks the sixteen-strings-per-block layout so LoadString, LoadBitmap, LoadIcon and LoadCursor all return the real thing.",
    unlocks: "Every menu, every dialog caption, every toolbar icon, every error message — the entire visible surface of most apps.",
    war: "The alignment shift exists so a 16-bit offset field can address a file bigger than 64K × 1. It is thrift, encoded. The whole format is one long argument with the number 65,536, and the format mostly wins.",
  },
  {
    n: "26", cat: "resource", title: "The menu and the shortcut that drives it",
    ord: "LoadMenu · TranslateAccelerator", spanners: 2,
    symptom: "Menus opened but their items did nothing; keyboard shortcuts were dead; Alt didn't reach the menu bar.",
    cause: "A menu is a resource tree that turns clicks into WM_COMMAND messages with the item's ID. Accelerators are a separate resource table that the message loop must consult with TranslateAccelerator *before* DispatchMessage, converting a keystroke into the same WM_COMMAND. Skip the TranslateAccelerator step in the pump and every shortcut silently does nothing.",
    fix: "Menu resources that dispatch WM_COMMAND by item ID, the system menu wired up, and accelerator tables consulted at the right point in the message loop so keystrokes and clicks reach the same command path.",
    unlocks: "Working menus and keyboard shortcuts — Ctrl+S, Alt+F, the lot — across every app with a menu bar.",
    war: "The shortcut and the menu item produce the same WM_COMMAND, so once the menu worked the shortcuts were nearly free. 'Nearly' did three days in the message-loop ordering before it agreed to be free.",
  },

  // ───────────────────────────── CONTROL ─────────────────────────────
  {
    n: "27", cat: "control", title: "Six little programs you never wrote",
    ord: "BUTTON · EDIT · STATIC window classes", spanners: 4,
    symptom: "Dialogs appeared as empty boxes: no buttons, no text fields, no labels — just the frame and a faint sense of disappointment.",
    cause: "The standard controls aren't drawn by the dialog manager — each is a pre-registered window class (BUTTON, EDIT, STATIC, LISTBOX, COMBOBOX, SCROLLBAR) with its own window procedure that handles its own painting, input and notifications. No registered classes, no controls. The EDIT control alone is a small text editor: caret, selection, scrolling, clipboard.",
    fix: "Native implementations of the standard control classes registered at startup, including a genuine EDIT control with caret, selection, and Cut/Copy/Paste, so any dialog template that names them gets working controls.",
    unlocks: "Every dialog box in every app — which is to say, the parts of programs where the actual work happens.",
    war: "The EDIT control is where users type. Get its caret blink wrong and nobody can articulate why the app feels haunted, but they feel it. We chased the haunting to a single off-by-one in the selection anchor.",
  },
  {
    n: "28", cat: "control", title: "The box that tells you what you picked",
    ord: "LISTBOX · WM_COMMAND notifications", spanners: 3,
    symptom: "List boxes and combo boxes displayed items but never told their parent when the selection changed; owner-drawn lists came up blank.",
    cause: "Controls talk back to their parent through WM_COMMAND notification codes — LBN_SELCHANGE, CBN_SELCHANGE, BN_CLICKED and friends — packed with the control ID and the code. Owner-drawn controls instead send WM_DRAWITEM and WM_MEASUREITEM and expect the parent to paint each row. We delivered the items but swallowed the notifications, so the parent never knew anything had happened.",
    fix: "Full notification plumbing for the list-style controls, plus WM_MEASUREITEM/WM_DRAWITEM for owner-draw, so selection changes and custom rendering reach the parent window.",
    unlocks: "Interactive list boxes, drop-downs and owner-drawn lists — file pickers, font lists, anything you choose from.",
    war: "A control that won't tell you it changed is a beautiful, silent, useless thing. The fix was less code than the sentence describing why it was broken.",
  },

  // ───────────────────────────── DIALOG ─────────────────────────────
  {
    n: "29", cat: "dialog", title: "Building a window from a recipe",
    ord: "DialogBox · DLGTEMPLATE", spanners: 4,
    symptom: "Calling DialogBox produced nothing, or a window with controls piled in the top-left corner, and Tab didn't move between fields.",
    cause: "A dialog is built at runtime from a DLGTEMPLATE resource: a header (style, position, font) followed by a packed, variable-length DLGITEMTEMPLATE per control. DialogBox parses it, creates each control window, runs a *modal* message loop, and — crucially — calls IsDialogMessage to turn Tab, arrow keys and default-button Enter into navigation. We mis-parsed the variable-length items (so controls stacked at 0,0) and skipped IsDialogMessage (so keyboard nav died).",
    fix: "A DLGTEMPLATE/DLGITEMTEMPLATE parser that walks the packed variable-length items correctly, a modal loop with IsDialogMessage for Tab/arrow/Enter navigation, and DefDlgProc for default behaviour.",
    unlocks: "Every modal dialog: Open, Save, Print, Options, About — and the keyboard navigation that makes them usable without a mouse.",
    war: "The item records are variable-length and tightly packed, with the class and text fields being either an ordinal byte or a null-terminated string depending on a sentinel. Parse one field's length wrong and every control after it lands in a different postcode.",
  },
  {
    n: "30", cat: "dialog", title: "The dialogs that come in the box",
    ord: "COMMDLG · GetOpenFileName", spanners: 3,
    symptom: "File Open and Save dialogs failed to appear; Choose Colour and Choose Font calls returned with nothing chosen.",
    cause: "The common dialogs aren't built by each app — they live in COMMDLG.DLL and are summoned through GetOpenFileName, GetSaveFileName, ChooseColor, ChooseFont and PrintDlg, each driven by a big struct the caller fills in and reads back. They lean on everything else: dialog templates (29), the standard controls (27, 28), the font mapper (24), resources (25). They're the integration test wearing a tie.",
    fix: "COMMDLG implementations of the file, colour and font choosers that populate and read back their structs and reuse the now-working dialog, control, font and resource machinery underneath.",
    unlocks: "Open/Save/Colour/Font across every app that uses the standard dialogs instead of rolling its own — i.e. the well-behaved majority.",
    war: "The common dialogs are where all twenty-nine other fixes show up to be counted at once. The first time Open appeared, populated, navigable, with a working file list and a Cancel button that cancelled — that was the day Win16 stopped being a pile of parts and started being Windows.",
  },
];
