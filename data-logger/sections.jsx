// ---------------------------------------------------------------------------
// sections.jsx — all the smaller interactive sections
// ---------------------------------------------------------------------------

// ---------- Hardware ------------------------------------------------------
const Hardware = () => {
  const { hardware } = window.DLOG_DATA;
  const [sel, setSel] = React.useState(hardware[0].id);
  const hw = hardware.find((h) => h.id === sel);

  return (
    <div className="hw-grid">
      <div className="hw-tabs" role="tablist">
        {hardware.map((h) => (
          <button
            key={h.id}
            className={"hw-tab " + (h.id === sel ? "active" : "")}
            onClick={() => setSel(h.id)}
            role="tab"
            aria-selected={h.id === sel}>
            <span className="id">{h.id.toUpperCase()}</span>
            {h.family}
          </button>
        ))}
      </div>
      <div className="hw-card">
        <div className="row">
          <div className="k">Family</div>
          <div className="v" style={{ fontFamily:"Newsreader, serif", fontSize:24, lineHeight:1.2 }}>
            {hw.family}
          </div>
        </div>
        <div className="row">
          <div className="k">Role</div>
          <div className="v">{hw.role}</div>
        </div>
        <div className="row">
          <div className="k">Sensors</div>
          <div className="v sensors-pills">
            {hw.sensors.map((s) => <span key={s} className="pill">{s}</span>)}
          </div>
        </div>
        <div className="row">
          <div className="k">Capacity</div>
          <div className="v mono" style={{ fontSize: 14 }}>{hw.capacity}</div>
        </div>
        <div className="row">
          <div className="k">Detection</div>
          <div className="v mono" style={{ fontSize: 13, color: "var(--ink-2)" }}>{hw.detection}</div>
        </div>
        <div className="row">
          <div className="k">Notes</div>
          <div className="v" style={{ color: "var(--ink-2)" }}>{hw.notes}</div>
        </div>
      </div>
    </div>
  );
};

// ---------- Code patterns ------------------------------------------------
// Naive but stable highlighter — handles only what these snippets need.
const highlight = (code) => {
  // Match comments, strings, common keywords/macros.
  const tokens = [];
  let i = 0;
  const KEY  = /^(if|else|return|for|while|switch|case|break|default|continue|goto|sizeof|static|const|void)\b/;
  const TYP  = /^(MDINT|MDUINT|MDUINT32|MDUINT16|MDUINT8|MDUCHAR|MDCHAR|MDBOOL|MDFLOAT|MDDOUBLE|MDHFILE|MDVOID|PMDCHAR|PMDUCHAR|PMDINT|PMDUINT|PMDVOID|HANDLE|HWND|HDC|HRSRC|HINSTANCE|HBITMAP|HCURSOR|HMENU|PLONG|DWORD|BOOL|COLORREF|TRUE|FALSE|NULL|RECT|UINT)\b/;
  const MAC  = /^(MDG_[A-Z_]+|MD_[A-Z_]+|COM_[A-Z_]+|COMM_[A-Z_]+|TLG_[A-Z_]+|DAT_[A-Z_]+|TB|LB|InterlockedExchange|InvalidateRect)\b/;
  const NUM  = /^(0x[0-9a-fA-F]+|\d+)/;

  while (i < code.length) {
    const c = code[i];
    // line comment
    if (c === "/" && code[i+1] === "/") {
      let j = code.indexOf("\n", i);
      if (j < 0) j = code.length;
      tokens.push({ t: "com", v: code.slice(i, j) });
      i = j; continue;
    }
    // block comment
    if (c === "/" && code[i+1] === "*") {
      let j = code.indexOf("*/", i+2);
      if (j < 0) j = code.length; else j += 2;
      tokens.push({ t: "com", v: code.slice(i, j) });
      i = j; continue;
    }
    // string
    if (c === '"') {
      let j = i + 1;
      while (j < code.length && code[j] !== '"') {
        if (code[j] === "\\") j++;
        j++;
      }
      j = Math.min(code.length, j+1);
      tokens.push({ t: "str", v: code.slice(i, j) });
      i = j; continue;
    }
    // identifier / keyword
    if (/[A-Za-z_]/.test(c)) {
      const rest = code.slice(i);
      let m;
      if ((m = rest.match(MAC))) { tokens.push({ t: "mac", v: m[0] }); i += m[0].length; continue; }
      if ((m = rest.match(KEY))) { tokens.push({ t: "key", v: m[0] }); i += m[0].length; continue; }
      if ((m = rest.match(TYP))) { tokens.push({ t: "typ", v: m[0] }); i += m[0].length; continue; }
      const idMatch = rest.match(/^[A-Za-z_][A-Za-z_0-9]*/);
      tokens.push({ t: null, v: idMatch[0] });
      i += idMatch[0].length; continue;
    }
    // number
    if (/[0-9]/.test(c)) {
      const rest = code.slice(i);
      const m = rest.match(NUM);
      tokens.push({ t: "num", v: m[0] });
      i += m[0].length;
      continue;
    }
    // anything else — eat one char
    tokens.push({ t: null, v: c });
    i++;
  }

  return tokens.map((tk, k) =>
    tk.t ? <span key={k} className={"c-" + tk.t}>{tk.v}</span> : <React.Fragment key={k}>{tk.v}</React.Fragment>
  );
};

const CodePatterns = () => {
  const { patterns } = window.DLOG_DATA;
  const [sel, setSel] = React.useState(patterns[0].id);
  const pat = patterns.find((p) => p.id === sel);

  return (
    <div className="code-row">
      <div className="code-tabs" role="tablist">
        {patterns.map((p) => (
          <button
            key={p.id}
            className={"code-tab " + (p.id === sel ? "active" : "")}
            onClick={() => setSel(p.id)}
            role="tab"
            aria-selected={p.id === sel}>
            {p.title}
          </button>
        ))}
      </div>
      <div className="code-card">
        <div className="head">
          <h3>{pat.title}</h3>
          <p>{pat.gloss}</p>
        </div>
        <pre>{highlight(pat.code)}</pre>
      </div>
    </div>
  );
};

// ---------- Timeline ------------------------------------------------------
const Timeline = () => {
  const { timeline } = window.DLOG_DATA;
  const [sel, setSel] = React.useState(timeline.length - 1);
  const e = timeline[sel];
  return (
    <div className="tl-wrap">
      <div className="tl-rail">
        {timeline.map((t, i) => (
          <button
            key={t.year}
            className={"tl-pin " + (i === sel ? "active" : "")}
            onClick={() => setSel(i)}>
            <span className="dot" />
            <span className="yr">{t.year}</span>
          </button>
        ))}
      </div>
      <div className="tl-card">
        <div className="yr">{e.year}</div>
        <h3>{e.title}</h3>
        <p>{e.detail}</p>
      </div>
    </div>
  );
};

// ---------- File explorer -------------------------------------------------
const FileExplorer = () => {
  const { modules } = window.DLOG_DATA;
  const [sel, setSel] = React.useState("wtlgmain");
  const groups = [
    { id: 2, name: "Application — WTLG*" },
    { id: 1, name: "Foundation — WMDG*" },
    { id: 3, name: "Vendored" }
  ];
  const m = modules.find((x) => x.id === sel);

  return (
    <div className="fx">
      <div className="fx-tree">
        {groups.map((g) => (
          <div key={g.id}>
            <div className="fx-group">{g.name}</div>
            {modules.filter((x) => x.layer === g.id).map((x) => (
              <button
                key={x.id}
                className={"fx-row " + (x.id === sel ? "active" : "")}
                onClick={() => setSel(x.id)}>
                <span>{x.label}</span>
                <span className="ln">{x.lines.toLocaleString()} L</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="fx-detail">
        <div className="role">{m.role}</div>
        <h3>{m.label}</h3>
        <p>{m.blurb}</p>
        <div className="meta">
          <span><b>{m.lines.toLocaleString()}</b> lines</span>
          <span>Layer <b>{m.layer}</b></span>
          <span>ID <b className="mono">{m.id}</b></span>
        </div>
      </div>
    </div>
  );
};

// ---------- Strengths + Rough edges --------------------------------------
const Strengths = () => {
  const { strengths, roughEdges } = window.DLOG_DATA;
  return (
    <div className="split">
      <div className="split-col good">
        <h3>What ages well</h3>
        {strengths.map((s) => (
          <div className="item" key={s.title}>
            <h4>{s.title}</h4>
            <p>{s.detail}</p>
          </div>
        ))}
      </div>
      <div className="split-col bad">
        <h3>Where it shows its age</h3>
        {roughEdges.map((s) => (
          <div className="item" key={s.title}>
            <h4>{s.title}</h4>
            <p>{s.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- Quirks --------------------------------------------------------
const Quirks = () => {
  const { quirks } = window.DLOG_DATA;
  return (
    <div className="quirks">
      {quirks.map((q) => (
        <div className="quirk" key={q.label}>
          <div className="lab">{q.label}</div>
          <p>{q.text}</p>
        </div>
      ))}
    </div>
  );
};

// ---------- Animated counter ---------------------------------------------
const Counter = ({ to, suffix = "", decimals = 0 }) => {
  const [v, setV] = React.useState(0);
  const ref = React.useRef(null);
  React.useEffect(() => {
    let raf, start;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        const dur = 1200;
        const tick = (t) => {
          if (!start) start = t;
          const k = Math.min(1, (t - start) / dur);
          // easeOutCubic
          const e = 1 - Math.pow(1 - k, 3);
          setV(to * e);
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        io.disconnect();
      }
    });
    if (ref.current) io.observe(ref.current);
    return () => { if (raf) cancelAnimationFrame(raf); io.disconnect(); };
  }, [to]);
  const formatted = v.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return <span ref={ref}>{formatted}{suffix}</span>;
};

Object.assign(window, {
  Hardware, CodePatterns, Timeline, FileExplorer, Strengths, Quirks, Counter
});
