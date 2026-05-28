// ---------------------------------------------------------------------------
// data.js — structured facts pulled from the Data Logger codebase
// ---------------------------------------------------------------------------
// Everything in this file came out of reading the source directly. No prose
// is invented; if a number, name, or date appears below it was found in the
// repo (see comment after each block where useful).
// ---------------------------------------------------------------------------

window.DLOG_DATA = (function () {
  // -- Top-line stats --------------------------------------------------------
  const stats = {
    cLines: 26380,        // sum of .c/.h LOC in SRC/  (see local_grep totals)
    cFiles: 39,
    zlibLines: 17000,     // approx, zlib 1.1.4
    copyrightSpan: "1996 – 2005",
    author: "MD",         // every file header signed "MD"
    company: "SoftHaggis",// registry path: Software\SoftHaggis\...
    maxLoggers: 4,
    maxChannels: 4,
    historyYears: 6,      // pHisData sized for ~6 years @ 15-min intervals
    sampleIntervalMin: 15,
    targetOS: "Windows NT 4.0+",
    compiler: "MSVC (nmake + win32.mak)",
    language: "C (ANSI, /W4 /WX)",
    buildConfigs: ["Debug", "Release", "WST", "CAP"]
  };

  // -- Supported hardware ----------------------------------------------------
  // Pulled from wtlgdata.h, wtlgcom.c, wtlgcmn.h.
  const hardware = [
    {
      id: "ds1615",
      family: "Maxim/Dallas DS1615",
      role: "Single-channel temperature logger",
      sensors: ["Onboard NTC"],
      capacity: "2048 samples",
      detection: "Family code 21 hex on 1-Wire bus",
      notes:
        "The original chip the app was built around. One temperature " +
        "channel, internal RTC, fits on a button-cell-powered fob."
    },
    {
      id: "ds1616-dual",
      family: "Maxim/Dallas DS1616 (Dual-Temp)",
      role: "Dual-channel temperature logger",
      sensors: ["LM19", "MAX6608"],
      capacity: "1024 samples / channel",
      detection: "Family code 19 hex; sensor inferred from device ID prefix",
      notes:
        "Onboard temp plus one external sensor. wtlgdata.c hardcodes the " +
        "serial-number patterns that map an individual chip to LM19 vs MAX6608."
    },
    {
      id: "ds1616-quad",
      family: "Maxim/Dallas DS1616 (Quad-Current)",
      role: "Four-channel current logger",
      sensors: ["SC100L", "HOB3X150"],
      capacity: "1024 samples / channel",
      detection: "Family code 19 hex + ID prefix 1F-02 (SC100L)",
      notes:
        "Same silicon as the dual-temp model, but the external sensors are " +
        "Hall-effect current probes. This is the hardware the in-tree " +
        '"Current Monitor" Altium project was built for.'
    }
  ];

  // -- Module map ------------------------------------------------------------
  // Layer 1 = MDG foundation, Layer 2 = WTLG application, Layer 3 = vendored.
  const modules = [
    // Layer 1 — MDG foundation library
    { id: "wmdgapi",  layer: 1, label: "WMDGAPI",  lines: 6924+1034, role: "Foundation API",          blurb: "The biggest single file: registry, time/date, file I/O, RLE + ZLIB compress, string utils, base64 + raw-SMTP email, MAPI fallback, BCD↔hex, DNS MX lookup. Reused across MD's projects since 1996." },
    { id: "wmdgint",  layer: 1, label: "WMDGINT",  lines: 2274+454,  role: "Foundation internals",    blurb: "Trace/log mutex plumbing, registry helpers, system-color bitmap remapping, stack-walking via dbghelp.dll for crash dumps." },
    { id: "wmdgcac",  layer: 1, label: "WMDGCAC",  lines: 475+118,   role: "In-memory cache",         blurb: "A generic key/value cache used by the foundation library." },
    { id: "wmdgmru",  layer: 1, label: "WMDGMRU",  lines: 513+105,   role: "MRU file list",           blurb: "\"Most recently used\" file handling for the File menu." },
    { id: "wmdgtyp",  layer: 1, label: "WMDGTYP",  lines: 378,       role: "Type system",             blurb: "MDINT, MDUINT16, MDFLOAT, MD_DATE, MD_TIME … the entire portable-types layer that wraps Win32. Carries the comment \"Modified for use with Spectrum Analyser 1.5.0\" from 1996." },
    { id: "wmdgtrg",  layer: 1, label: "WMDGTRG",  lines: 36,        role: "Trace groups",            blurb: "Defines eight trace channels (MDGEN, SCOMS, GRAPH, DATA, UI, SYL …) so debug output can be filtered per subsystem." },
    { id: "wmdgdbg",  layer: 1, label: "WMDGDBG",  lines: 23,        role: "Debug dialog IDs",        blurb: "Resource IDs for the runtime trace-level slider dialog." },
    { id: "wmdgdata", layer: 1, label: "WMDGDATA", lines: 115,       role: "Foundation globals",      blurb: "Holds every MDG global, gated by MDG_INCLUDE_DATA. The one place state lives." },

    // Layer 2 — WTLG application
    { id: "wtlgmain", layer: 2, label: "WTLGMAIN", lines: 3983+249,  role: "Main window + lifecycle", blurb: "WinMain, message loop, tab control, status bar, tray icon, sample→graph rendering pipeline. The seam everything else hangs off." },
    { id: "wtlgcom",  layer: 2, label: "WTLGCOM",  lines: 1533+67,   role: "Serial / sensor maths",   blurb: "Opens the COM port at 9600 baud, runs a background reader thread, walks DS161x pages with CRC, and converts raw bytes to °C / amps for each sensor (LM19, MAX6608, SC100L, HOB3X150)." },
    { id: "wtlgdata", layer: 2, label: "WTLGDATA", lines: 878+72,    role: "Data acquisition flow",   blurb: "High-level \"go read all loggers\" thread. Detects logger model from the family code, syncs the on-chip clock, drains data pages, writes them to disk." },
    { id: "wtlgdis",  layer: 2, label: "WTLGDIS",  lines: 2886+161,  role: "Graph / display",         blurb: "Custom-painted plotter with min/max/avg/diff overlays, an intelligent-spike filter, 50 levels of zoom, and per-channel color." },
    { id: "wtlgset",  layer: 2, label: "WTLGSET",  lines: 2145+130,  role: "Setup property sheets",   blurb: "All the multi-tab \"Logger Options\" dialogs — sample rate, alarms, delayed-start, NVRAM/data-retention toggles." },
    { id: "wtlgcfg",  layer: 2, label: "WTLGCFG",  lines: 226+214,   role: "Config persistence",      blurb: "Single TLG_CONFIG struct serialised to the registry under HKCU\\Software\\SoftHaggis\\Temp logger\\Settings." },
    { id: "wtlgcmd",  layer: 2, label: "WTLGCMD",  lines: 1698+41,   role: "Menu command handlers",   blurb: "One giant WM_COMMAND switch — every menu item and toolbar button dispatches here." },
    { id: "wtlglog",  layer: 2, label: "WTLGLOG",  lines: 539+43,    role: "Operations log viewer",   blurb: "RichEdit window that streams oplog.txt with colored severities. Uses an EDITSTREAM callback so the file is read in chunks." },
    { id: "wtlgsyl",  layer: 2, label: "WTLGSYL",  lines: 559+57,    role: "BSD Syslog UDP listener", blurb: "Binds UDP/514 and parses MotherBoard-Monitor-style packets (\"MBM[sensor]:\") from networked machines into the same channel store as the serial loggers." },
    { id: "wtlgabt",  layer: 2, label: "WTLGABT",  lines: 181+19,    role: "About box",               blurb: "Hardcoded release date of 1 October 2005, reports the MDG library version and live physical-memory count." },
    { id: "wtlgdat",  layer: 2, label: "WTLGDAT",  lines: 154,       role: "App globals",             blurb: "Mirror of WMDGDATA at the app layer. Included via MDG_INCLUDE_DATA so every other .c file sees the same globals without re-declaring them." },

    // Layer 3 — vendored
    { id: "zlib",     layer: 3, label: "zlib 1.1.4", lines: 17000,    role: "Vendored compressor",     blurb: "Dropped in verbatim, copyright 1995-2002 Gailly & Adler. The foundation library wraps it to gzip the trace files and emailed log archives." }
  ];

  // Adjacency — who depends on whom (for the architecture viz).
  // direction: src → dst means src #includes / calls into dst.
  const edges = [
    ["wtlgmain","wtlgcom"],["wtlgmain","wtlgdata"],["wtlgmain","wtlgdis"],
    ["wtlgmain","wtlgset"], ["wtlgmain","wtlgcfg"],["wtlgmain","wtlglog"],
    ["wtlgmain","wtlgsyl"], ["wtlgmain","wtlgabt"],["wtlgmain","wtlgcmd"],
    ["wtlgmain","wtlgdat"],
    ["wtlgcmd","wtlgset"],  ["wtlgcmd","wtlgcfg"], ["wtlgcmd","wtlgdis"],
    ["wtlgdata","wtlgcom"], ["wtlgdata","wtlgcfg"],
    ["wtlgdis","wtlgcfg"],  ["wtlgdis","wtlgdata"],
    ["wtlgset","wtlgcom"],  ["wtlgset","wtlgcfg"], ["wtlgset","wtlgdata"],
    ["wtlglog","wtlgcfg"],
    ["wtlgsyl","wtlgcfg"],
    ["wtlgabt","wmdgapi"],
    // every wtlg* file pulls in wmdgbase.h which fans out:
    ["wtlgmain","wmdgapi"], ["wtlgcom","wmdgapi"], ["wtlgdata","wmdgapi"],
    ["wtlgdis","wmdgapi"],  ["wtlgset","wmdgapi"], ["wtlgcfg","wmdgapi"],
    ["wtlgcmd","wmdgapi"],  ["wtlglog","wmdgapi"], ["wtlgsyl","wmdgapi"],
    // foundation internals:
    ["wmdgapi","wmdgint"],  ["wmdgapi","wmdgcac"], ["wmdgapi","wmdgmru"],
    ["wmdgapi","wmdgtyp"],  ["wmdgapi","wmdgtrg"], ["wmdgapi","wmdgdata"],
    ["wmdgint","zlib"],     ["wmdgapi","zlib"]
  ];

  // -- Timeline --------------------------------------------------------------
  // Years drawn from copyright headers and the WMDGTYP.H modification log.
  const timeline = [
    {
      year: "1996",
      title: "Spectrum Analyser 1.5.0",
      detail:
        "The type system in WMDGTYP.H still carries the note \"10-Mar-96 — Modified " +
        "for use with Spectrum Analyser 1.5.0.\" That codebase is the genetic " +
        "ancestor of everything you see here."
    },
    {
      year: "1998",
      title: "MDG library 3.0.0",
      detail:
        "MD rewrites the personal foundation library. Headers change to declare " +
        "themselves \"Version 3.0.0.\" Files are split into API / INT pairs for the " +
        "first time."
    },
    {
      year: "1999",
      title: "Cache, MRU, debug dialog",
      detail:
        "MRU file list and the generic cache module land. The trace-level " +
        "runtime slider dialog (WMDGDBG) gets its IDs."
    },
    {
      year: "2000",
      title: "Compression + email",
      detail:
        "File compression (initially a hand-rolled RLE, later ZLIB) and the " +
        "MAPI-or-raw-SMTP email pipeline appear in the WMDGAPI changelog."
    },
    {
      year: "2001",
      title: "WRCS → WTLG fork",
      detail:
        "datalog.vpj still lists every file from the abandoned WRCS project " +
        "(SRC\\old\\WRCS*.C — Rail Control System). At the same time the first " +
        "WTLG files start appearing: this is the project pivoting to temperature logging."
    },
    {
      year: "2002",
      title: "Logging + Syslog + RichEdit viewer",
      detail:
        "Generic logging facility added to MDG. WTLGLOG (RichEdit ops viewer) and " +
        "WTLGSYL (BSD Syslog listener for networked MotherBoard-Monitor sensors) " +
        "added to the app."
    },
    {
      year: "2003",
      title: "DS1616 dual-temp support",
      detail:
        "Family-code 19 added to the autodetector; LM19 and MAX6608 conversion " +
        "math lands in WTLGCOM."
    },
    {
      year: "2005",
      title: "Current Monitor hardware",
      detail:
        "Altium schematic project \"Current Monitor.PrjPCB\" added to the repo; " +
        "DS1616 quad-current mode with SC100L and HOB3X150 Hall-effect probes " +
        "wired in software. About box pins the release at 1 October 2005."
    }
  ];

  // -- Code DNA / recurring patterns -----------------------------------------
  const patterns = [
    {
      id: "begin_fn",
      title: "Every function announces itself",
      gloss:
        "MDG_BEGIN_FN / MDG_END_FN bracket every function body. In debug builds " +
        "they push the function name onto a per-thread indent stack and emit " +
        "\"{ FuncName\" / \"FuncName rc:N }\" trace lines — so the log file is a " +
        "human-readable call-stack tree.",
      code:
`MDINT COM_InitComm(PMDCHAR xiportstr, MDINT xibaudrate, MDINT xidtr)
{
    MDINT rc = 0;
    MDG_BEGIN_FN("COM_InitComm");

    /* … body … */

MD_EXIT_POINT:
    MDG_END_FN(rc);
    return(rc);
}`
    },
    {
      id: "md_quit",
      title: "Single-exit error handling",
      gloss:
        "MD_QUIT is literally \"goto MD_EXIT_POINT\". Every function has exactly " +
        "one return, every error path jumps there. It's old-school but it " +
        "guarantees the END_FN trace fires and gives you one place to free things.",
      code:
`if (ghCommPort == INVALID_HANDLE_VALUE)
{
    MDG_ALT((TB, "Failed to open the COM port"));
    InterlockedExchange((PLONG)&gCommInUse, (LONG)FALSE);
    rc = COMM_FAILED_TO_OPEN_COMM_PORT;
    MD_QUIT;                       /* → goto MD_EXIT_POINT */
}`
    },
    {
      id: "hungarian",
      title: "Hungarian, applied with conviction",
      gloss:
        "xi = input param, xo = output, xio = in/out, p = pointer, l = local, " +
        "g = global, h = handle, fn = function pointer. Combine freely. " +
        "PMDCHAR xiportstr reads as \"pointer-to-string, input parameter.\"",
      code:
`MDINT COM_ReadPage(MDINT xipage, PMDUCHAR pxobuffer);
HANDLE       ghCommPort;            /* g + h + name      */
unsigned int lthreadid    = 0;      /* l + name          */
PMDCHAR      pxiportstr;            /* p + xi + name     */
MDBOOL       lbrc         = FALSE;  /* l + b + rc        */`
    },
    {
      id: "include_data",
      title: "Globals live in one file — and only one",
      gloss:
        "wtlgdat.c declares every global. Every other .c file #includes it, but " +
        "only one (wtlgmain.c) defines MDG_INCLUDE_DATA first — so only one " +
        "translation unit actually emits the storage. Header-only globals, no " +
        "extern lists to keep in sync.",
      code:
`/* in wtlgmain.c — exactly one site */
#define MDG_INCLUDE_DATA
#include "wtlgdat.c"

/* in every other .c file */
#include "wtlgdat.c"   /* sees the same declarations, no storage */`
    },
    {
      id: "trace_groups",
      title: "Filterable trace channels",
      gloss:
        "Every source file declares which trace group it belongs to. At runtime " +
        "you can flip MDGEN / SCOMS / GRAPH / DATA / UI / SYL on or off " +
        "independently from a slider dialog, then dump the live trace buffer to " +
        "a gzipped file.",
      code:
`/* top of wtlgcom.c */
#ifdef MDG_TRACEGROUP
  #undef MDG_TRACEGROUP
#endif
#define MDG_TRACEGROUP   MDG_TRG_SCOMS_FLAG

MDG_NRM((TB, "Opened COM port OK (%s)", xiportstr));`
    }
  ];

  // -- Strengths / rough edges ----------------------------------------------
  const strengths = [
    {
      title: "Disciplined house style",
      detail: "Every file has the same 78-column block header, the same section " +
              "banners, the same naming. You can move between modules without " +
              "re-learning anything."
    },
    {
      title: "Observability baked in from day one",
      detail: "Function-level entry/exit traces, eight filterable trace groups, " +
              "a separate \"ops log\" with stable numeric IDs, and gzipped " +
              "log archives email themselves out on demand."
    },
    {
      title: "One author, one library, many products",
      detail: "The MDG foundation under /SRC has been carried — and trimmed — " +
              "across at least three apps (Spectrum Analyser → Rail Control " +
              "System → Data Logger) over nine years."
    },
    {
      title: "Hardware and software in the same tree",
      detail: "The Altium schematic project for the current-monitor PCB sits " +
              "alongside the C sources. There is no firmware/software wall."
    }
  ];
  const roughEdges = [
    {
      title: "Globals everywhere",
      detail: "All app state lives in wtlgdat.c. Convenient at the time, but it " +
              "means every module touches every other, and there's no obvious " +
              "way to unit-test a piece in isolation."
    },
    {
      title: "Win32-only, ANSI strings",
      detail: "Everything routes through lstrcpy / lstrlen — no Unicode build, " +
              "no path forward off Windows, and the type system tops out at " +
              "year 2038 (MDG_TIME_MAXYEAR = 138)."
    },
    {
      title: "Hand-rolled everything",
      detail: "Custom string library, custom cache, custom MRU list, custom " +
              "base64, custom DNS query. Each works fine — but in 2025 each is " +
              "100 lines you'd rather not own."
    },
    {
      title: "Sensor models hardcoded by serial-number prefix",
      detail: "DAT_GetDS161xLoggerAndSensorType matches on literal byte " +
              "patterns like \"19-EF-5D\" to decide whether a chip is an LM19 " +
              "or a MAX6608. Adding a new sensor means editing C, recompiling, " +
              "reshipping."
    },
    {
      title: "No automated tests, no CI",
      detail: "There is exactly one .bat that runs the build (TREL.BAT) and " +
              "one (TIDY.BAT) that deletes intermediates. Verification was " +
              "presumably \"run it on your bench and see.\""
    }
  ];

  // -- Notable quirks --------------------------------------------------------
  const quirks = [
    {
      label: "Powered by signal lines",
      text: "The 1-Wire interface board draws its power from the RS-232 DTR/RTS " +
            "pins. WTLGCOM literally sleeps for 1 second after raising them " +
            "(TLG_DS161x_STABILIZEDELAY) to let the board's caps charge."
    },
    {
      label: "MotherBoard Monitor as a sensor",
      text: "WTLGSYL parses the exact text format that the late-'90s Windows " +
            "freeware tool MBM5 emits over syslog: " +
            "\"MBM[sensor]: C=… LA=… HA=… L=… H=… A=…\". A networked Windows box " +
            "with MBM installed effectively becomes another logger."
    },
    {
      label: "Profile-guided code layout",
      text: "The Release link line includes /ORDER:@src\\datalog.prf, an " +
            "explicit function-order file. There's a WST (Working Set Tuner) " +
            "build configuration whose only purpose is to regenerate that file."
    },
    {
      label: "Six years of history, in 8 bits per sample",
      text: "Each channel keeps six years of 15-minute samples (210,241 values) " +
            "in a single MDUCHAR array. Temperatures are folded into 0–255 " +
            "via COM_TempToCompact / COM_CompactToTemp."
    },
    {
      label: "The y2k bit",
      text: "The DS1616 stores year in BCD with one extra \"Y2K\" status bit. " +
            "The code ORs it back in by hand whenever the on-chip clock is " +
            "written: \"If this is a DS1616 then OR in the Y2K flag.\""
    },
    {
      label: "Email via raw SMTP, with its own MX lookup",
      text: "MDG_SendEmailRaw opens its own TCP socket to port 25, base64-" +
            "encodes attachments inline (carefully sized to 1026 bytes so the " +
            "encoded line fits one TCP/IP PDU), and falls back to a DNS MX " +
            "lookup if the user didn't configure a relay."
    }
  ];

  return { stats, hardware, modules, edges, timeline, patterns, strengths, roughEdges, quirks };
})();
