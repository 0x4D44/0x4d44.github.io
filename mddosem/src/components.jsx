// Reusable building blocks for the mddosem site.
const { useState, useEffect, useRef, useMemo } = React;

// ---------- Layout primitives ----------
const Container = ({ children, style }) => (
  <div className="container" style={style}>{children}</div>
);

const Eyebrow = ({ children }) => <div className="eyebrow">{children}</div>;

const SectionHeader = ({ kicker, title, lede, id }) => (
  <header id={id} style={{ marginBottom: 48 }}>
    <Eyebrow>{kicker}</Eyebrow>
    <h2 className="section-title">{title}</h2>
    {lede && <p className="section-lede">{lede}</p>}
  </header>
);

// ---------- Top nav ----------
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    ["purpose", "Purpose"],
    ["architecture", "Architecture"],
    ["hardware", "Hardware"],
    ["usage", "Use it"],
    ["testing", "Tests"],
    ["fuzzing", "Fuzzing"],
    ["community", "Ecosystem"],
  ];

  return (
    <nav
      style={{
        position: "sticky", top: 0, zIndex: 50,
        background: scrolled ? "oklch(0.155 0.015 250 / 0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(8px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(8px)" : "none",
        borderBottom: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
        transition: "all .2s ease",
      }}
    >
      <Container>
        <div className="nav-row" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 64,
        }}>
          <a href="#top" style={{
            display: "flex", alignItems: "center", gap: 10,
            color: "var(--text)", fontWeight: 700, letterSpacing: "-0.01em",
          }}>
            <LogoMark />
            <span style={{ fontFamily: "var(--mono)", fontSize: 15, letterSpacing: "0.04em" }}>mddosem</span>
            <span className="chip" style={{ marginLeft: 4 }}>v0.13.0</span>
          </a>
          <div className="nav-links" style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {links.map(([id, label]) => (
              <a key={id} href={`#${id}`} style={{
                color: "var(--text-dim)", fontSize: 13, padding: "8px 12px",
                fontFamily: "var(--mono)", letterSpacing: "0.02em",
              }}>{label}</a>
            ))}
            <a href="#" className="btn" style={{ marginLeft: 12 }} onClick={(e) => {
              e.preventDefault();
              navigator.clipboard && navigator.clipboard.writeText("git clone https://github.com/0x4D44/mddosem.git");
              const lbl = e.currentTarget.querySelector(".lbl");
              lbl.textContent = "copied ✓";
              setTimeout(() => { lbl.textContent = "$ git clone"; }, 1400);
            }}>
              <span className="lbl">$ git clone</span>
            </a>
          </div>
        </div>
      </Container>
    </nav>
  );
}

// Square logomark — abstract: a phosphor pixel cluster
function LogoMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="0" y="0" width="24" height="24" fill="none" stroke="var(--amber)" strokeWidth="1.4" />
      <rect x="4" y="4" width="4" height="4" fill="var(--amber)" />
      <rect x="10" y="4" width="4" height="4" fill="var(--amber)" opacity="0.5" />
      <rect x="16" y="4" width="4" height="4" fill="var(--amber)" opacity="0.25" />
      <rect x="4" y="10" width="4" height="4" fill="var(--amber)" opacity="0.5" />
      <rect x="10" y="10" width="4" height="4" fill="var(--cyan)" />
      <rect x="16" y="10" width="4" height="4" fill="var(--amber)" opacity="0.5" />
      <rect x="4" y="16" width="4" height="4" fill="var(--amber)" opacity="0.25" />
      <rect x="10" y="16" width="4" height="4" fill="var(--amber)" opacity="0.5" />
      <rect x="16" y="16" width="4" height="4" fill="var(--amber)" />
    </svg>
  );
}

// ---------- Boot screen / hero terminal ----------
function BootTerminal() {
  const lines = useMemo(() => [
    { t: "mddosem BIOS v0.13.0",                       cls: "amber" },
    { t: "Copyright (C) hardware-accurate PC emulation, MIT-licensed.", cls: "dim" },
    { t: "",                                          cls: "" },
    { t: "POST: CPU.....i386 + 80387 FPU       [ ok ]", cls: "" },
    { t: "POST: Memory..1024K + HMA · XMS · EMS [ ok ]", cls: "" },
    { t: "POST: Video...VGA / SVGA / VESA VBE   [ ok ]", cls: "" },
    { t: "POST: Audio...SB16 · OPL3 · GUS · MT-32 [ ok ]", cls: "" },
    { t: "POST: I/O.....PIC · PIT · DMA · UART  [ ok ]", cls: "" },
    { t: "POST: JIT.....x86-16/32 → x86-64      [ ok ]", cls: "" },
    { t: "",                                          cls: "" },
    { t: "Starting MS-DOS...",                        cls: "dim" },
    { t: "C:\\> _",                                   cls: "amber" },
  ], []);

  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= lines.length) return;
    const delay = shown === 0 ? 300 : shown < 3 ? 240 : 90;
    const t = setTimeout(() => setShown(s => s + 1), delay);
    return () => clearTimeout(t);
  }, [shown, lines.length]);

  return (
    <div style={{
      background: "oklch(0.10 0.018 250)",
      border: "1px solid var(--border-2)",
      borderRadius: 4,
      padding: "18px 22px",
      fontFamily: "var(--mono)",
      fontSize: 13,
      lineHeight: 1.7,
      minHeight: 320,
      boxShadow: "inset 0 0 80px oklch(0.10 0.05 75 / 0.18), 0 30px 80px oklch(0 0 0 / 0.4)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* CRT glow at top */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 30% 0%, oklch(0.82 0.155 75 / 0.10), transparent 60%)",
        pointerEvents: "none",
      }} />
      {/* Title bar */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        color: "var(--text-dimmer)", fontSize: 11, letterSpacing: "0.12em",
        marginBottom: 14, position: "relative",
      }}>
        <span>COM1 · 80×25 · vga</span>
        <span>mddosem /dev/console</span>
      </div>
      <div style={{ position: "relative" }}>
        {lines.slice(0, shown).map((l, i) => (
          <div key={i} style={{
            color: l.cls === "amber" ? "var(--amber)"
                 : l.cls === "dim"   ? "var(--text-dim)"
                 : "var(--text)",
            whiteSpace: "pre",
          }}>{l.t || "\u00a0"}</div>
        ))}
        {shown < lines.length && (
          <span style={{ display: "inline-block", width: 8, height: 14, background: "var(--amber)", verticalAlign: "middle", animation: "blink 1.1s steps(1) infinite" }} />
        )}
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}

// ---------- Stat tile ----------
function StatTile({ value, label, accent = "amber" }) {
  return (
    <div style={{
      padding: "20px 22px",
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: 3,
      borderLeft: `2px solid var(--${accent})`,
    }}>
      <div style={{
        fontFamily: "var(--mono)", fontSize: 30, fontWeight: 600,
        color: `var(--${accent})`, letterSpacing: "-0.01em", lineHeight: 1.05,
      }}>{value}</div>
      <div style={{
        marginTop: 6,
        fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.12em",
        color: "var(--text-dim)", textTransform: "uppercase",
      }}>{label}</div>
    </div>
  );
}

// ---------- Architecture stack (interactive) ----------
function ArchitectureStack({ layers }) {
  const [activeId, setActiveId] = useState(layers[2].id); // default: DOS · BIOS
  const active = layers.find(l => l.id === activeId) || layers[0];

  return (
    <div className="two-col" style={{
      display: "grid", gridTemplateColumns: "minmax(320px, 1fr) minmax(0, 1.1fr)",
      gap: 36, alignItems: "stretch",
    }}>
      {/* Stack */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {layers.map((l) => {
          const isActive = l.id === activeId;
          return (
            <button
              key={l.id}
              onClick={() => setActiveId(l.id)}
              onMouseEnter={() => setActiveId(l.id)}
              style={{
                textAlign: "left",
                padding: "16px 18px",
                background: isActive ? "var(--bg-card-2)" : "var(--bg-card)",
                border: `1px solid ${isActive ? `var(--${l.color})` : "var(--border)"}`,
                borderLeft: `4px solid var(--${l.color})`,
                cursor: "pointer",
                transition: "background .12s ease, border-color .12s ease",
                color: "var(--text)",
                fontFamily: "inherit",
                borderRadius: 2,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>{l.label}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text-dim)", marginTop: 4, letterSpacing: "0.04em" }}>
                  {l.sub}
                </div>
              </div>
              <div style={{
                fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em",
                color: isActive ? `var(--${l.color})` : "var(--text-dimmer)",
              }}>{isActive ? "▶" : ""}</div>
            </button>
          );
        })}
      </div>

      {/* Detail */}
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 3,
        padding: "28px 32px",
        position: "relative", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `var(--${active.color})` }} />
        <Eyebrow>layer · {active.id}</Eyebrow>
        <h3 style={{
          margin: "10px 0 14px",
          fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em",
        }}>{active.label}</h3>
        <div style={{
          fontFamily: "var(--mono)", fontSize: 12, letterSpacing: "0.04em",
          color: `var(--${active.color})`, marginBottom: 20,
        }}>{active.sub}</div>
        <p style={{ color: "var(--text-dim)", fontSize: 15.5, lineHeight: 1.7, margin: 0 }}>
          {active.detail}
        </p>
      </div>
    </div>
  );
}

// ---------- Hardware accordion grid ----------
function HardwareGrid({ groups }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
      gap: 16,
    }}>
      {groups.map((g) => (
        <div key={g.group} style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          padding: "20px 22px",
          borderRadius: 3,
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingBottom: 12, marginBottom: 14,
            borderBottom: "1px dashed var(--border)",
          }}>
            <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" }}>{g.group}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
              {String(g.items.length).padStart(2, "0")}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {g.items.map(([name, note], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 13.5, color: "var(--text)" }}>{name}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text-dim)", textAlign: "right", flexShrink: 0 }}>{note}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- CLI playground ----------
function CliPlayground({ scenarios }) {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  const s = scenarios[idx];

  useEffect(() => {
    setTyped(""); setDone(false);
    const full = s.cmd;
    let i = 0;
    const tick = () => {
      i += 1;
      setTyped(full.slice(0, i));
      if (i < full.length) {
        timer = setTimeout(tick, 14 + Math.random() * 22);
      } else {
        setDone(true);
      }
    };
    let timer = setTimeout(tick, 80);
    return () => clearTimeout(timer);
  }, [idx, s.cmd]);

  return (
    <div className="two-col" style={{
      display: "grid", gridTemplateColumns: "minmax(260px, 320px) 1fr", gap: 24,
    }}>
      {/* Scenario list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {scenarios.map((sc, i) => {
          const active = i === idx;
          return (
            <button key={i} onClick={() => setIdx(i)} style={{
              textAlign: "left",
              padding: "10px 12px",
              background: active ? "var(--bg-card-2)" : "transparent",
              border: "1px solid",
              borderColor: active ? "var(--border-2)" : "transparent",
              borderLeft: `3px solid ${active ? "var(--amber)" : "transparent"}`,
              color: active ? "var(--text)" : "var(--text-dim)",
              fontFamily: "inherit", fontSize: 13.5,
              cursor: "pointer", borderRadius: 2,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: active ? "var(--amber)" : "var(--text-dimmer)", width: 18 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{sc.title}</span>
            </button>
          );
        })}
      </div>

      {/* Terminal */}
      <div style={{
        background: "oklch(0.10 0.018 250)",
        border: "1px solid var(--border-2)",
        borderRadius: 4,
        overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{
          padding: "10px 14px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "oklch(0.13 0.018 250)",
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 50, background: "oklch(0.55 0.15 30)" }} />
            <span style={{ width: 10, height: 10, borderRadius: 50, background: "oklch(0.75 0.16 90)" }} />
            <span style={{ width: 10, height: 10, borderRadius: 50, background: "oklch(0.68 0.16 145)" }} />
          </div>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
            ~/projects/mddosem — bash
          </span>
          <span style={{ width: 36 }} />
        </div>
        <div style={{ padding: "20px 22px", minHeight: 230, fontFamily: "var(--mono)", fontSize: 13.5 }}>
          <div style={{ color: "var(--text-dim)" }}>
            <span style={{ color: "var(--cyan)" }}>mddosem@host</span>
            <span style={{ color: "var(--text-dimmer)" }}>:</span>
            <span style={{ color: "var(--amber)" }}>~/mddosem</span>
            <span style={{ color: "var(--text-dimmer)" }}>$ </span>
            <span style={{ color: "var(--text)" }}>{typed}</span>
            {!done && <span style={{ display: "inline-block", width: 8, height: 14, background: "var(--text)", verticalAlign: "middle", animation: "blink 1.1s steps(1) infinite" }} />}
          </div>
          <p style={{
            color: "var(--text-dim)", marginTop: 22, fontFamily: "var(--sans)", fontSize: 14.5, lineHeight: 1.65,
          }}>{s.explain}</p>
        </div>
      </div>
    </div>
  );
}

// ---------- Testing panel ----------
function TestingPanel({ suites }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      gap: 12,
    }}>
      {suites.map((s, i) => (
        <div key={s.name} style={{
          background: "var(--bg-card)", border: "1px solid var(--border)",
          padding: "16px 18px", borderRadius: 3,
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 13.5, color: "var(--text)" }}>{s.name}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--amber)", letterSpacing: "0.05em" }}>{s.scale}</span>
          </div>
          <div style={{ color: "var(--text-dim)", fontSize: 13 }}>{s.note}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Fuzz target grid ----------
function FuzzGrid({ targets }) {
  // sort by priority desc
  const sorted = [...targets].sort((a, b) => b[2] - a[2]);
  const maxPri = Math.max(...sorted.map(t => t[2]));
  const catColor = (c) => ({
    JIT: "var(--magenta)", CPU: "var(--amber)", DOS: "var(--cyan)",
    DPMI: "var(--cyan)", Win16: "var(--magenta)", Hardware: "var(--amber)",
    BIOS: "var(--cyan)", Audio: "var(--magenta)",
  }[c] || "var(--text)");
  return (
    <div className="tablewrap" style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 3, overflow: "hidden",
    }}>
      <div className="row5" style={{
        display: "grid", gridTemplateColumns: "auto 1fr auto 1.4fr auto",
        gap: 14, padding: "10px 18px",
        background: "var(--bg-elev)", borderBottom: "1px solid var(--border)",
        fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.12em",
        color: "var(--text-dim)", textTransform: "uppercase",
      }}>
        <span>#</span>
        <span>Target</span>
        <span>Category</span>
        <span>What it catches</span>
        <span style={{ width: 110, textAlign: "right" }}>Priority</span>
      </div>
      {sorted.map(([name, cat, pri, desc], i) => (
        <div key={name} className="row5" style={{
          display: "grid", gridTemplateColumns: "auto 1fr auto 1.4fr auto",
          gap: 14, padding: "10px 18px",
          borderBottom: i === sorted.length - 1 ? "none" : "1px solid var(--border)",
          alignItems: "center",
        }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dimmer)", width: 22 }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text)" }}>{name}</span>
          <span style={{
            fontFamily: "var(--mono)", fontSize: 11, color: catColor(cat),
            border: `1px solid ${catColor(cat)}`, padding: "2px 8px", borderRadius: 2, letterSpacing: "0.06em",
          }}>{cat}</span>
          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{desc}</span>
          <span style={{
            width: 110, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
          }}>
            <span style={{
              flex: 1, height: 4, background: "var(--bg-elev)", borderRadius: 2, position: "relative", overflow: "hidden",
            }}>
              <span style={{
                position: "absolute", inset: 0,
                width: `${(pri / maxPri) * 100}%`,
                background: "var(--amber)",
              }} />
            </span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--amber)", width: 28, textAlign: "right" }}>{pri.toFixed(1)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- Crate map ----------
function CrateMap({ crates }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: 8,
    }}>
      {crates.map((c) => (
        <div key={c.name} style={{
          background: "var(--bg-card)", border: "1px solid var(--border)",
          padding: "12px 14px", borderRadius: 2,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--cyan)" }}>{c.name}</span>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{c.role}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Trace target list ----------
function TraceTargetList({ targets }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      gap: 4,
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      padding: 18,
      borderRadius: 3,
    }}>
      {targets.map(([t, d]) => (
        <div key={t} style={{
          display: "flex", justifyContent: "space-between", gap: 12,
          padding: "8px 8px", borderRadius: 2,
        }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--text)" }}>{t}</span>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{d}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Memory map illustration ----------
function MemoryMap() {
  const regions = [
    { from: "0x00000", to: "0x9FFFF", size: "640 K", name: "Conventional",     note: "Programs + DOS itself", c: "amber" },
    { from: "0xA0000", to: "0xAFFFF", size: " 64 K",  name: "VGA framebuffer",  note: "Mode 13h / planar",      c: "cyan" },
    { from: "0xB0000", to: "0xB7FFF", size: " 32 K",  name: "MDA text",         note: "monochrome legacy",      c: "cyan" },
    { from: "0xB8000", to: "0xBFFFF", size: " 32 K",  name: "CGA / VGA text",   note: "80×25 attribute pairs",  c: "cyan" },
    { from: "0xC0000", to: "0xC7FFF", size: " 32 K",  name: "Video BIOS",       note: "HLE — or SeaVGABIOS",    c: "amber" },
    { from: "0xF0000", to: "0xFFFFF", size: " 64 K",  name: "System BIOS",      note: "F000:xxxx HLE stubs",    c: "amber" },
    { from: "0x100000", to: "...",    size: "  + ∞",  name: "HMA · XMS · EMS",  note: "extended memory",        c: "cyan" },
  ];
  return (
    <div className="tablewrap" style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 3, overflow: "hidden",
    }}>
      <div className="row5" style={{
        display: "grid", gridTemplateColumns: "auto auto auto 1fr 1.5fr",
        gap: 14, padding: "10px 18px",
        background: "var(--bg-elev)", borderBottom: "1px solid var(--border)",
        fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.12em", color: "var(--text-dim)", textTransform: "uppercase",
      }}>
        <span>From</span><span>To</span><span>Size</span><span>Region</span><span>Notes</span>
      </div>
      {regions.map((r, i) => (
        <div key={i} className="row5" style={{
          display: "grid", gridTemplateColumns: "auto auto auto 1fr 1.5fr",
          gap: 14, padding: "11px 18px",
          borderBottom: i === regions.length - 1 ? "none" : "1px solid var(--border)",
          alignItems: "center",
        }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: `var(--${r.c})` }}>{r.from}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: `var(--${r.c})` }}>{r.to}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-dim)" }}>{r.size}</span>
          <span style={{ fontSize: 13.5, color: "var(--text)" }}>{r.name}</span>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{r.note}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  Container, Eyebrow, SectionHeader, Nav, LogoMark,
  BootTerminal, StatTile,
  ArchitectureStack, HardwareGrid, CliPlayground, TestingPanel, FuzzGrid,
  CrateMap, TraceTargetList, MemoryMap,
});
