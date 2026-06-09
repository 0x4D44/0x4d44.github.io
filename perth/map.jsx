// ============================================================
//  PERTH — THE ANIMATED SURVEY MAP
//  <PerthMap year focus/>  — the cartographic engine
//  <KeyMap/>               — small static hero map
//  <Atlas/>                — the full centrepiece (scrubber + panel)
// ============================================================
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const P = window.PERTH;

// ---- marker glyphs by type ----
function MarkerGlyph({ type }) {
  switch (type) {
    case "rail":
      return (<g>
        <circle r="7" fill="var(--paper)" stroke="var(--rail)" strokeWidth="2" />
        <circle r="2.4" fill="var(--rail)" />
      </g>);
    case "bridge":
      return (<g stroke="var(--ink)" strokeWidth="2" fill="none">
        <path d="M -7 3 A 7 7 0 0 1 7 3" />
        <line x1="-8" y1="3" x2="8" y2="3" />
      </g>);
    case "junction":
      return (<g>
        <circle r="6.5" fill="none" stroke="var(--motorway)" strokeWidth="2.4" />
        <circle r="1.6" fill="var(--motorway)" />
      </g>);
    case "retail":
      return (<g>
        <rect x="-5.5" y="-5.5" width="11" height="11" transform="rotate(45)" fill="var(--contour)" stroke="var(--paper)" strokeWidth="1.4" />
      </g>);
    case "civic":
    default:
      return (<rect x="-5" y="-5" width="10" height="10" fill="var(--signal)" stroke="var(--paper)" strokeWidth="1.4" />);
  }
}

function PerthMap({ year, focus, showLabels = true }) {
  const { VIEW } = P;
  const vis = (from) => year >= from;

  return (
    <svg className="perth-map" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.2"/></filter>
      </defs>

      {/* River Tay */}
      <path d={P.TAY} fill="none" stroke="var(--water)" strokeWidth="40" strokeLinejoin="round" strokeLinecap="round" opacity="0.5" />
      <path d={P.TAY} fill="none" stroke="var(--water-deep)" strokeWidth="1.5" strokeDasharray="2 5" opacity="0.7" />
      <text x="690" y="250" fill="var(--water-deep)" fontSize="15" fontStyle="italic" opacity="0.75" transform="rotate(78 690 250)" style={{fontFamily:"var(--display)"}}>River Tay</text>

      {/* Parkland — the Inches */}
      {P.INCHES.map((p) => (
        <g key={p.id} className="urban-poly" style={{ opacity: vis(p.from) ? 1 : 0 }}>
          <polygon points={p.points} fill="var(--wood)" opacity="0.28" stroke="var(--wood)" strokeWidth="1" strokeDasharray="3 3" />
          {showLabels && <text x={p.lx} y={p.ly} fill="var(--wood)" fontSize="10.5" letterSpacing="1.5" textAnchor="middle" opacity="0.9">{p.label}</text>}
        </g>
      ))}

      {/* Urban footprint */}
      {P.URBAN.map((u) => (
        <polygon key={u.id} className="urban-poly" points={u.points}
          fill="var(--urban)" opacity={vis(u.from) ? 0.42 : 0}
          stroke="var(--urban)" strokeWidth="1" />
      ))}

      {/* Old trunk route through the town (pre-bypass) */}
      <path d={P.OLD_A9} fill="none" stroke="var(--aroad)"
        strokeWidth={year >= 1979 ? 2 : 5}
        strokeDasharray={year >= 1979 ? "2 8" : "0"}
        opacity={year >= 1920 ? (year >= 1979 ? 0.3 : 0.85) : 0}
        className="rail-line" strokeLinecap="round" />

      {/* Roads / bypass */}
      {P.ROADS.map((r) => (
        <g key={r.id} className="rail-line" style={{ opacity: vis(r.opened) ? 1 : 0 }}>
          <path d={r.d} fill="none" stroke="var(--paper)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <path d={r.d} fill="none" stroke="var(--motorway)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          {r.bridge && <line x1={r.bridge[0]-12} y1={r.bridge[1]+12} x2={r.bridge[0]+12} y2={r.bridge[1]-12} stroke="var(--ink)" strokeWidth="2" />}
        </g>
      ))}

      {/* Railways (ghost when closed) */}
      {P.RAIL.map((r) => {
        if (!vis(r.opened)) return null;
        const shut = r.closed && year >= r.closed;
        return (
          <g key={r.id} className="rail-line">
            {/* sleeper ladder for open lines */}
            {!shut && <path d={r.d} fill="none" stroke="var(--rail)" strokeWidth="6" strokeLinecap="round" opacity="0.18" />}
            <path d={r.d} fill="none" stroke={shut ? "var(--ink-faint)" : "var(--rail)"}
              strokeWidth="2" strokeDasharray={shut ? "3 6" : "7 4"} opacity={shut ? 0.55 : 1} />
            {r.bridge && !shut && <line x1={r.bridge[0]-10} y1={r.bridge[1]+10} x2={r.bridge[0]+10} y2={r.bridge[1]-10} stroke="var(--ink)" strokeWidth="2" />}
          </g>
        );
      })}

      {/* Neighbourhood labels */}
      {showLabels && P.NEIGHBOURHOODS.map((n) => (
        <text key={n.name} className="nb-label" x={n.x} y={n.y}
          fill={n.big ? "var(--ink)" : "var(--ink-soft)"}
          fontSize={n.big ? 15 : 11.5}
          fontWeight={n.big ? 600 : 400}
          textAnchor="middle"
          letterSpacing={n.big ? 0.5 : 0.3}
          style={{ opacity: vis(n.from) ? 0.92 : 0, fontFamily: n.big ? "var(--display)" : "var(--mono)" }}>
          {n.name}
        </text>
      ))}

      {/* Landmark markers */}
      {P.MARKERS.map((m) => (
        <g key={m.id} className="map-marker" transform={`translate(${m.x} ${m.y})`}
          style={{ opacity: vis(m.from) ? 1 : 0 }}>
          <MarkerGlyph type={m.type} />
          {showLabels && <text x="10" y="4" fontSize="10" fill="var(--ink)" style={{paintOrder:"stroke", stroke:"var(--paper)", strokeWidth:"3px"}}>{m.name}</text>}
        </g>
      ))}

      {/* Focus pulse */}
      {focus && (
        <g transform={`translate(${focus.x} ${focus.y})`} key={`${focus.x}-${focus.y}`}>
          <circle r="4" fill="var(--signal)" />
          <circle r="4" fill="none" stroke="var(--signal)" strokeWidth="2">
            <animate attributeName="r" from="4" to="26" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.9" to="0" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {/* North arrow */}
      <g transform="translate(930 80)" opacity="0.8">
        <path d="M 0 -26 L 7 8 L 0 0 L -7 8 Z" fill="var(--ink)" />
        <text x="0" y="26" textAnchor="middle" fontSize="13" fill="var(--ink)" fontWeight="700">N</text>
      </g>
    </svg>
  );
}

function KeyMap() {
  return <PerthMap year={2025} focus={null} showLabels={true} />;
}

// ---- the centrepiece ----
const TICKS = [1124, 1560, 1771, 1848, 1900, 1948, 1979, 1994, 2012, 2025];
const Y_MIN = 1100, Y_MAX = 2025;

function Atlas() {
  const [year, setYear] = useState(() => {
    const s = parseInt(localStorage.getItem("perth.year"), 10);
    return Number.isFinite(s) ? s : 1840;
  });
  const [playing, setPlaying] = useState(false);
  const raf = useRef(null);

  useEffect(() => { localStorage.setItem("perth.year", String(year)); }, [year]);

  // play animation
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now) => {
      const dt = now - last; last = now;
      setYear((y) => {
        // accelerate through empty early centuries, slow in the busy modern era
        const speed = y < 1750 ? 70 : y < 1900 ? 22 : 12; // years per second
        const next = y + (speed * dt) / 1000;
        if (next >= Y_MAX) { setPlaying(false); return Y_MAX; }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const iYear = Math.round(year);

  const activeEvents = useMemo(() => {
    return P.MAP_EVENTS.filter((e) => e.year <= iYear).sort((a, b) => b.year - a.year);
  }, [iYear]);
  const focus = activeEvents.length ? activeEvents[0].focus : null;

  const play = () => {
    if (year >= Y_MAX) setYear(Y_MIN + 24);
    setPlaying((p) => !p);
  };
  const reset = () => { setPlaying(false); setYear(1840); };

  return (
    <div className="atlas">
      <div className="atlas-grid">
        <div className="atlas-map"><PerthMap year={iYear} focus={focus} /></div>

        <div className="atlas-panel">
          <div className="atlas-yearhead">
            <div className="label">Surveyed to the year</div>
            <div className="atlas-year">{iYear}</div>
            <div className="atlas-era">{P.eraFor(iYear)}</div>
          </div>

          <div className="atlas-controls">
            <input className="atlas-slider" type="range" min={Y_MIN} max={Y_MAX} step="1"
              value={iYear} onChange={(e) => { setPlaying(false); setYear(parseInt(e.target.value, 10)); }} />
            <div className="atlas-btns">
              <button className={playing ? "playing" : ""} onClick={play}>{playing ? "❚❚ Pause" : "▶ Play the growth"}</button>
              <button onClick={reset}>↺ Reset</button>
            </div>
            <div className="atlas-ticks">
              {TICKS.map((t) => (
                <button key={t} className={iYear >= t ? "on" : ""} onClick={() => { setPlaying(false); setYear(t); }}>{t}</button>
              ))}
            </div>
          </div>

          <div className="atlas-events">
            <div className="ev-label">Events to {iYear}</div>
            {activeEvents.length === 0 && <div className="ev-empty">Drag the slider, or press play, to grow the city from its medieval core.</div>}
            {activeEvents.slice(0, 6).map((e) => (
              <div className="ev-row" key={e.year}>
                <div className="ev-year">{e.year}</div>
                <div>
                  <p className="ev-title">{e.title}</p>
                  <p className="ev-text">{e.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="atlas-legend">
        <span className="lg"><span className="sw" style={{ background: "var(--urban)", opacity: 0.5 }}></span> Built-up area</span>
        <span className="lg"><span className="sw" style={{ background: "var(--wood)", opacity: 0.5 }}></span> Parkland (the Inches)</span>
        <span className="lg"><span className="sw" style={{ background: "var(--water)", opacity: 0.6 }}></span> River Tay</span>
        <span className="lg"><span className="sw line" style={{ borderColor: "var(--rail)" }}></span> Railway (open)</span>
        <span className="lg"><span className="sw line" style={{ borderTopStyle: "dashed", borderColor: "var(--ink-faint)" }}></span> Railway (closed)</span>
        <span className="lg"><span className="sw line" style={{ borderColor: "var(--motorway)" }}></span> Bypass / motorway</span>
      </div>
    </div>
  );
}

Object.assign(window, { PerthMap, KeyMap, Atlas });
