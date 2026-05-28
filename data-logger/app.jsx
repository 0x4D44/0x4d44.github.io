// ---------------------------------------------------------------------------
// app.jsx — root composition
// ---------------------------------------------------------------------------

const App = () => {
  const D = window.DLOG_DATA;
  return (
    <>
      {/* sticky top stripe ---------------------------------------------- */}
      <div className="topstripe">
        <div><span className="dot" />DATA LOGGER · /SRC</div>
        <div>{D.stats.cFiles} FILES · {D.stats.cLines.toLocaleString()} LOC · C · WIN32</div>
      </div>

      {/* HERO ----------------------------------------------------------- */}
      <header className="page hero">
        <div className="meta-row">
          <span>A CODE TOUR</span>
          <span className="pipe">/</span>
          <span>{D.stats.copyrightSpan}</span>
          <span className="pipe">/</span>
          <span>by MD · SoftHaggis</span>
        </div>

        <h1>
          Data Logger:<br/>
          nine years of a one-person Windows app,<br/>
          read <span className="ampcolor">page-by-page</span>.
        </h1>

        <p className="lede narrow" style={{ marginTop: 28 }}>
          A Win32 desktop application written in C, with its own foundation
          library, its own serial protocol, its own log compressor, its own
          email transport — and an Altium schematic for the current-monitor
          PCB it talks to. This is what a single engineer's nine-year
          codebase looks like when nothing is thrown away.
        </p>

        <Scope />

        {/* stats strip --------------------------------------------------- */}
        <div className="statstrip">
          <div className="cell">
            <div className="val"><Counter to={D.stats.cLines} /></div>
            <div className="lab">Lines of C in /SRC</div>
          </div>
          <div className="cell">
            <div className="val"><Counter to={D.stats.cFiles} /></div>
            <div className="lab">Source files</div>
          </div>
          <div className="cell">
            <div className="val"><Counter to={9} /></div>
            <div className="lab">Years of copyright</div>
          </div>
          <div className="cell">
            <div className="val"><Counter to={4} /></div>
            <div className="lab">Build configurations</div>
          </div>
          <div className="cell">
            <div className="val">1</div>
            <div className="lab">Author · "MD"</div>
          </div>
        </div>
      </header>

      {/* WHAT IT DOES --------------------------------------------------- */}
      <section className="page">
        <div className="sec-head">
          <div className="lead">
            <div className="eyebrow">§ 01 · What it does</div>
            <h2>It watches temperature and current for a very long time.</h2>
          </div>
          <div className="side">
            The app keeps up to four Maxim/Dallas 1-Wire data loggers
            connected over RS-232, drains their on-chip sample buffers every
            minute, autodetects the chip family and sensor type, and renders
            the result as up to six years of history at 15-minute resolution.
          </div>
        </div>

        <div className="narrow" style={{ fontSize: 17.5, lineHeight: 1.65, color: "var(--ink-2)" }}>
          <p>
            The hardware story is the easy part. A user plugs a 1-Wire DS1615
            or DS1616 button-cell logger into a tiny interface board, the board
            steals power from the serial-port handshake lines, and the
            application opens <span className="mono">CreateFile("\\\\.\\COM3", …)</span>
            against a Windows COM port at 9600 baud. From there it speaks the
            chip's page-oriented memory protocol directly — there is no vendor
            SDK in the tree, just the byte layouts and a 16-bit CRC
            implementation in <span className="mono">wtlgcom.c</span>.
          </p>
          <p>
            Once the data is on disk it's the application's. The graph
            window is hand-painted with GDI, the property sheets are direct
            Win32 dialog templates, the operations log uses a RichEdit control
            with a streamed callback, and the tray icon is repainted live
            with the most recent reading. There is no MFC, no .NET, no
            third-party widgets — only the Common Controls library and
            whatever <span className="mono">windows.h</span> provides.
          </p>
        </div>
      </section>

      {/* HARDWARE ------------------------------------------------------- */}
      <section className="page">
        <div className="sec-head">
          <div className="lead">
            <div className="eyebrow">§ 02 · The hardware it speaks to</div>
            <h2>Three chip variants, four sensor types, one protocol.</h2>
          </div>
          <div className="side">
            Each logger reveals its type through a 64-bit ROM ID on the 1-Wire
            bus. <span className="mono">DAT_GetDS161xLoggerAndSensorType</span>
            inspects the family code and then the specific ID prefix to choose
            which conversion formula to apply.
          </div>
        </div>
        <Hardware />
      </section>

      {/* ARCHITECTURE --------------------------------------------------- */}
      <section className="page">
        <div className="sec-head">
          <div className="lead">
            <div className="eyebrow">§ 03 · How it's put together</div>
            <h2>Two stacks, sharing one rule book.</h2>
          </div>
          <div className="side">
            A foundation library (WMDG*) that long predates this app, and an
            application layer (WTLG*) that wires it to the loggers. Hover a
            module to see its dependencies; click to pin the detail panel.
          </div>
        </div>
        <ArchDiagram />
      </section>

      {/* CODE DNA ------------------------------------------------------- */}
      <section className="page">
        <div className="sec-head">
          <div className="lead">
            <div className="eyebrow">§ 04 · Code DNA</div>
            <h2>Five conventions repeated, faithfully, 26&nbsp;000 lines deep.</h2>
          </div>
          <div className="side">
            Every file in the tree looks like every other file. That sounds
            obvious until you spend ten minutes searching for the entry point
            of a function — it's always at the top, always after a 78-column
            block header, always between two specific macros.
          </div>
        </div>
        <CodePatterns />
      </section>

      {/* TIMELINE ------------------------------------------------------- */}
      <section className="page">
        <div className="sec-head">
          <div className="lead">
            <div className="eyebrow">§ 05 · Evolution</div>
            <h2>From spectrum analyser, to rail control, to fridge thermometer.</h2>
          </div>
          <div className="side">
            The clues are in the file headers and an old vpj project file
            that still lists every C source from the previous app. Click a year
            to read what changed.
          </div>
        </div>
        <Timeline />
      </section>

      {/* FILE EXPLORER -------------------------------------------------- */}
      <section className="page">
        <div className="sec-head">
          <div className="lead">
            <div className="eyebrow">§ 06 · Every file, briefly</div>
            <h2>The source tree in one panel.</h2>
          </div>
          <div className="side">
            Twenty source files, grouped by layer. Line counts are real;
            descriptions come straight from reading each file.
          </div>
        </div>
        <FileExplorer />
      </section>

      {/* STRENGTHS / EDGES ---------------------------------------------- */}
      <section className="page">
        <div className="sec-head">
          <div className="lead">
            <div className="eyebrow">§ 07 · A fair appraisal</div>
            <h2>What still impresses, and what creaks.</h2>
          </div>
          <div className="side">
            Read as a 2025 codebase, parts of this are exemplary and parts
            you'd reach for a refactor on the first day.
          </div>
        </div>
        <Strengths />
      </section>

      {/* QUIRKS --------------------------------------------------------- */}
      <section className="page">
        <div className="sec-head">
          <div className="lead">
            <div className="eyebrow">§ 08 · The interesting bits</div>
            <h2>Six things you'd only find by reading the source.</h2>
          </div>
          <div className="side">
            None of these are bugs. They're decisions — quiet ones — that say
            something about when and how this code was written.
          </div>
        </div>
        <Quirks />
      </section>

      <footer className="page">
        <div>End of tour · {D.stats.cFiles} files · {D.stats.cLines.toLocaleString()} lines · author <span style={{color:"var(--amber-deep)"}}>MD</span></div>
      </footer>
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
