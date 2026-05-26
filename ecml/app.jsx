// Main ECML interactive page
const { useState, useEffect, useRef, useMemo } = React;
const { STATIONS, COMPANIES, OPERATORS, EVENTS, LOCOS, PEOPLE, FACTS } = window.ECML;
const MapView = window.MapView;

// ---------- Year scrubber + Map ----------

function YearScrubber() {
  const [year, setYear] = useState(1840);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState(null);
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setYear(y => {
        const next = y + dt * 6; // 6 years per second
        if (next >= 2026) { setPlaying(false); return 2026; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  // Events at or just before current year
  const recent = useMemo(() => {
    return EVENTS
      .filter(e => e.year <= year && e.year >= year - 4)
      .sort((a,b) => b.year - a.year)
      .slice(0, 4)
      .map((e, i) => ({ ...e, key: `${e.year}-${e.label.slice(0,10)}-${i}` }));
  }, [year]);

  const markers = recent.filter(e => e.loc);

  const yearInt = Math.floor(year);

  return (
    <section className="scrubber-section">
      <div className="scrubber-grid">
        <div className="scrubber-map">
          <MapView year={yearInt} focusStation={focus} onStationClick={setFocus} markers={markers} hoveredMarker={hoveredEvent}/>
        </div>
        <div className="scrubber-panel">
          <div className="scrubber-yeartag">YEAR</div>
          <div className="scrubber-year">{yearInt}</div>

          <div className="scrubber-controls">
            <button className="play-btn" onClick={() => { if (year >= 2026) setYear(1840); setPlaying(p => !p); }}>
              {playing ? '❚❚ PAUSE' : '▶ PLAY'}
            </button>
            <button className="reset-btn" onClick={() => { setPlaying(false); setYear(1840); }}>↺ RESET</button>
          </div>

          <input
            type="range"
            min={1825}
            max={2026}
            step={1}
            value={yearInt}
            onChange={e => { setPlaying(false); setYear(Number(e.target.value)); }}
            className="scrubber-range"
          />
          <div className="scrubber-axis">
            {[1825, 1850, 1900, 1923, 1948, 1991, 2026].map(y => (
              <button key={y} className={`axis-tick ${yearInt >= y ? 'on' : ''}`} onClick={() => { setPlaying(false); setYear(y); }}>
                {y}
              </button>
            ))}
          </div>

          <div className="scrubber-events">
            <div className="se-label">RECENT EVENTS · hover to locate on map</div>
            {recent.length === 0 && <div className="se-empty">— quiet on the line —</div>}
            {recent.map((e, i) => {
              const station = STATIONS.find(s => s.id === e.loc);
              return (
                <div
                  key={e.key}
                  className={`se-row tag-${e.tag} ${hoveredEvent === e.key ? 'hovered' : ''}`}
                  onMouseEnter={() => setHoveredEvent(e.key)}
                  onMouseLeave={() => setHoveredEvent(null)}
                >
                  <span className="se-year">{e.year}</span>
                  <span className="se-text">
                    {e.label}
                    {station && <span className="se-loc"> · {station.name.replace('London ','').replace(' Waverley','').replace(' North Gate','')}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Timeline (vertical, long) ----------

function Timeline() {
  const [filter, setFilter] = useState('all');
  const tags = useMemo(() => {
    const s = new Set(EVENTS.map(e => e.tag));
    return ['all', ...Array.from(s)];
  }, []);
  const filtered = filter === 'all' ? EVENTS : EVENTS.filter(e => e.tag === filter);

  return (
    <section className="timeline-section">
      <header className="section-head">
        <div className="sh-mark">II.</div>
        <h2>Two hundred years on the line</h2>
        <p className="sh-lede">From the Stockton & Darlington in 1825 to the bicentenary in 2025 — every signal-changing event on the East Coast Main Line.</p>
      </header>

      <div className="filter-row">
        {tags.map(t => (
          <button key={t} className={`chip ${filter === t ? 'on' : ''}`} onClick={() => setFilter(t)}>
            {t}
          </button>
        ))}
      </div>

      <ol className="timeline">
        {filtered.map((e, i) => (
          <li key={i} className={`tl-item tag-${e.tag}`}>
            <div className="tl-year">{e.year}</div>
            <div className="tl-dot"></div>
            <div className="tl-body">
              <div className={`tl-tag`}>{e.tag}</div>
              <p>{e.label}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------- Companies (the three builders) ----------

function Companies() {
  return (
    <section className="companies-section">
      <header className="section-head">
        <div className="sh-mark">III.</div>
        <h2>Three companies, one line</h2>
        <p className="sh-lede">The ECML was never planned. It was three independent railways that happened to point at each other.</p>
      </header>

      <div className="company-grid">
        {COMPANIES.map(c => (
          <article key={c.id} className="company-card" style={{ '--c': c.colour }}>
            <div className="cc-strip"></div>
            <div className="cc-head">
              <div className="cc-short">{c.short}</div>
              <div className="cc-period">{c.period}</div>
            </div>
            <h3>{c.name}</h3>
            <dl className="cc-meta">
              <dt>Stretch</dt><dd>{c.stretch}</dd>
              <dt>Mileage</dt><dd>{c.miles}</dd>
              <dt>Headquarters</dt><dd>{c.hq}</dd>
            </dl>
            <p className="cc-body">{c.body}</p>
          </article>
        ))}
      </div>

      {/* Joint stock + Grouping */}
      <div className="merge-callout">
        <div className="mc-left">
          <div className="mc-tag">1860</div>
          <h4>East Coast Joint Stock</h4>
          <p>To avoid swapping passengers between three liveries at Berwick and Shaftholme, the companies pooled their carriages. Britain’s first through-running joint fleet.</p>
        </div>
        <div className="mc-arrow">→</div>
        <div className="mc-right">
          <div className="mc-tag">1923</div>
          <h4>The Grouping</h4>
          <p>The Railways Act 1921 forced 120-odd companies into four. NBR + NER + GNR — plus 30 others — became the London &amp; North Eastern Railway. The ECML was its spine.</p>
        </div>
      </div>
    </section>
  );
}

// ---------- Operators since 1923 ----------

function OperatorsStrip() {
  const minY = 1860, maxY = 2030;
  const span = maxY - minY;
  const toPct = (y) => ((y - minY) / span) * 100;
  const ticks = [1860, 1900, 1923, 1948, 1996, 2009, 2018, 2030];

  return (
    <section className="operators-section">
      <header className="section-head">
        <div className="sh-mark">IV.</div>
        <h2>Who has been running the trains</h2>
        <p className="sh-lede">A century and a half of operators — from a Victorian joint-stock pool to the current public Operator of Last Resort.</p>
      </header>

      <div className="op-table">
        {/* Header row — axis */}
        <div className="op-row op-row-axis">
          <div className="op-cell op-label-cell"></div>
          <div className="op-cell op-bar-cell">
            <div className="op-axis-inner">
              {ticks.map(y => (
                <div key={y} className="op-tick" style={{ left: `${toPct(y)}%` }}>
                  <div className="op-tick-mark"></div>
                  <div className="op-tick-label">{y === 2030 ? 'now' : y}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {OPERATORS.map(op => {
          const x1 = toPct(op.start);
          const x2 = toPct(Math.min(op.end, maxY));
          return (
            <div key={op.id} className="op-row">
              <div className="op-cell op-label-cell">
                <div className="op-swatch" style={{ background: op.colour }}></div>
                <div className="op-label-text">
                  <div className="op-name">{op.name}</div>
                  <div className="op-years">{op.start}–{op.end > 2026 ? 'present' : op.end}</div>
                  <div className="op-note">{op.note}</div>
                </div>
              </div>
              <div className="op-cell op-bar-cell">
                <div
                  className="op-bar2"
                  style={{ left: `${x1}%`, width: `${Math.max(x2 - x1, 0.5)}%`, background: op.colour }}
                  title={`${op.start}–${op.end > 2026 ? 'present' : op.end}`}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Locomotive gallery ----------

function Locos() {
  const [active, setActive] = useState(LOCOS[0].id);
  const cur = LOCOS.find(l => l.id === active);

  return (
    <section className="locos-section">
      <header className="section-head">
        <div className="sh-mark">V.</div>
        <h2>The engines</h2>
        <p className="sh-lede">A line in two halves: the era when locomotives broke world records, and the era when they ran them to a schedule.</p>
      </header>

      <div className="loco-list">
        {LOCOS.map(l => (
          <button
            key={l.id}
            className={`loco-row ${active === l.id ? 'on' : ''}`}
            style={{ '--swatch': l.swatch }}
            onClick={() => setActive(l.id)}
          >
            <div className="lr-swatch"></div>
            <div className="lr-name">{l.name}</div>
            <div className="lr-years">{l.years}</div>
            <div className="lr-speed">{l.speed}</div>
          </button>
        ))}
      </div>

      <article className="loco-detail" style={{ '--swatch': cur.swatch }}>
        <div className="ld-bigtype">{cur.name}</div>
        <div className="ld-grid">
          <div><dt>Builder</dt><dd>{cur.builder}</dd></div>
          <div><dt>In service</dt><dd>{cur.years}</dd></div>
          <div><dt>Top speed</dt><dd>{cur.speed}</dd></div>
        </div>
        <p className="ld-blurb">{cur.blurb}</p>

        {/* Stylised loco silhouette */}
        <svg viewBox="0 0 600 120" className="loco-svg">
          {cur.id === 'stirling' && <StirlingSingle/>}
          {cur.id === 'ivatt'    && <Atlantic/>}
          {cur.id === 'a3'       && <PacificA3/>}
          {cur.id === 'a4'       && <PacificA4/>}
          {cur.id === 'a1p'      && <PacificA1/>}
          {cur.id === 'deltic'   && <Deltic/>}
          {cur.id === 'hst'      && <HST/>}
          {cur.id === 'ic225'    && <IC225/>}
          {cur.id === 'azuma'    && <Azuma/>}
        </svg>
      </article>
    </section>
  );
}

// ---------- Loco silhouettes (intentionally diagrammatic, not photorealistic) ----------

const Wheel = ({cx, cy, r=14, spokes=false}) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill="#1a1410" stroke="var(--swatch)" strokeWidth="1.5"/>
    <circle cx={cx} cy={cy} r={r*0.45} fill="var(--swatch)"/>
    {spokes && <g stroke="#efe6d3" strokeWidth="0.6">
      <line x1={cx-r*0.9} y1={cy} x2={cx+r*0.9} y2={cy}/>
      <line x1={cx} y1={cy-r*0.9} x2={cx} y2={cy+r*0.9}/>
      <line x1={cx-r*0.65} y1={cy-r*0.65} x2={cx+r*0.65} y2={cy+r*0.65}/>
      <line x1={cx-r*0.65} y1={cy+r*0.65} x2={cx+r*0.65} y2={cy-r*0.65}/>
    </g>}
  </g>
);

const SteamPlume = ({x=50, y=20}) => (
  <g opacity="0.5">
    <circle cx={x} cy={y} r="6" fill="#efe6d3"/>
    <circle cx={x+10} cy={y-6} r="9" fill="#efe6d3"/>
    <circle cx={x+22} cy={y-2} r="7" fill="#efe6d3"/>
    <circle cx={x+34} cy={y-10} r="11" fill="#efe6d3"/>
  </g>
);

function StirlingSingle() {
  return (
    <g>
      <SteamPlume x={70} y={30}/>
      {/* Tender */}
      <rect x="20" y="55" width="110" height="35" fill="var(--swatch)"/>
      <rect x="20" y="55" width="110" height="6" fill="#1a1410"/>
      {/* Cab */}
      <rect x="130" y="40" width="60" height="55" fill="var(--swatch)"/>
      <rect x="138" y="48" width="44" height="18" fill="#efe6d3"/>
      {/* Boiler */}
      <rect x="190" y="50" width="230" height="40" fill="var(--swatch)"/>
      {/* Dome */}
      <rect x="250" y="38" width="22" height="14" fill="var(--swatch)"/>
      {/* Funnel */}
      <rect x="370" y="28" width="14" height="24" fill="var(--swatch)"/>
      <rect x="368" y="28" width="18" height="4" fill="#1a1410"/>
      {/* Smokebox */}
      <rect x="420" y="48" width="30" height="44" fill="#1a1410"/>
      <circle cx="435" cy="70" r="8" fill="var(--swatch)"/>
      {/* Buffer plank */}
      <rect x="450" y="78" width="14" height="14" fill="var(--swatch)"/>
      {/* Wheels — small leading, ONE huge driver, small trailing */}
      <Wheel cx={50} cy={100} r={10}/>
      <Wheel cx={95} cy={100} r={10}/>
      <Wheel cx={170} cy={100} r={12}/>
      <Wheel cx={300} cy={100} r={35} spokes/>
      <Wheel cx={430} cy={100} r={12}/>
      {/* Connecting rod */}
      <rect x="195" y="98" width="220" height="3" fill="#1a1410"/>
    </g>
  );
}

function Atlantic() {
  return (
    <g>
      <SteamPlume x={350} y={28}/>
      <rect x="20" y="55" width="110" height="35" fill="var(--swatch)"/>
      <rect x="130" y="40" width="55" height="55" fill="var(--swatch)"/>
      <rect x="138" y="48" width="40" height="18" fill="#efe6d3"/>
      <rect x="185" y="50" width="240" height="42" fill="var(--swatch)"/>
      <rect x="250" y="38" width="22" height="14" fill="var(--swatch)"/>
      <rect x="370" y="30" width="14" height="22" fill="var(--swatch)"/>
      <rect x="425" y="48" width="30" height="44" fill="#1a1410"/>
      <Wheel cx={55} cy={100} r={10}/>
      <Wheel cx={100} cy={100} r={10}/>
      <Wheel cx={170} cy={100} r={11}/>
      <Wheel cx={230} cy={100} r={20} spokes/>
      <Wheel cx={290} cy={100} r={20} spokes/>
      <Wheel cx={400} cy={100} r={11}/>
      <rect x="195" y="98" width="220" height="3" fill="#1a1410"/>
    </g>
  );
}

function PacificA3() {
  return (
    <g>
      <SteamPlume x={350} y={26}/>
      <rect x="15" y="50" width="115" height="42" fill="var(--swatch)"/>
      <rect x="130" y="38" width="55" height="55" fill="var(--swatch)"/>
      <rect x="138" y="46" width="40" height="18" fill="#efe6d3"/>
      <rect x="185" y="46" width="240" height="46" fill="var(--swatch)"/>
      <rect x="250" y="34" width="22" height="14" fill="var(--swatch)"/>
      <rect x="370" y="28" width="14" height="20" fill="var(--swatch)"/>
      <rect x="425" y="44" width="32" height="48" fill="#1a1410"/>
      <circle cx="441" cy="68" r="9" fill="var(--swatch)"/>
      <Wheel cx={55} cy={100} r={10}/>
      <Wheel cx={100} cy={100} r={10}/>
      <Wheel cx={180} cy={100} r={12}/>
      <Wheel cx={235} cy={100} r={22} spokes/>
      <Wheel cx={295} cy={100} r={22} spokes/>
      <Wheel cx={355} cy={100} r={22} spokes/>
      <Wheel cx={420} cy={100} r={11}/>
      <rect x="195" y="98" width="230" height="3" fill="#1a1410"/>
      {/* Brass nameplate hint */}
      <rect x="225" y="62" width="80" height="9" fill="#cca33b"/>
    </g>
  );
}

function PacificA4() {
  return (
    <g>
      {/* Streamlined casing */}
      <path d="M 15 80 L 15 50 Q 60 30 130 28 L 425 28 Q 460 30 462 50 L 462 92 L 15 92 Z" fill="var(--swatch)"/>
      {/* Side stripe */}
      <rect x="15" y="62" width="447" height="4" fill="#1a1410"/>
      {/* Cab window */}
      <rect x="140" y="42" width="40" height="14" fill="#efe6d3"/>
      {/* Wedge nose */}
      <path d="M 462 28 Q 478 60 462 92 Z" fill="#1a1410"/>
      <Wheel cx={55} cy={100} r={10}/>
      <Wheel cx={100} cy={100} r={10}/>
      <Wheel cx={180} cy={100} r={12}/>
      <Wheel cx={235} cy={100} r={22} spokes/>
      <Wheel cx={295} cy={100} r={22} spokes/>
      <Wheel cx={355} cy={100} r={22} spokes/>
      <Wheel cx={420} cy={100} r={11}/>
      <rect x="195" y="98" width="230" height="3" fill="#1a1410"/>
    </g>
  );
}

function PacificA1() {
  return (
    <g>
      <SteamPlume x={350} y={26}/>
      <rect x="15" y="50" width="115" height="42" fill="var(--swatch)"/>
      <rect x="130" y="38" width="50" height="55" fill="var(--swatch)"/>
      <rect x="138" y="46" width="36" height="18" fill="#efe6d3"/>
      <rect x="180" y="46" width="245" height="46" fill="var(--swatch)"/>
      <rect x="245" y="34" width="22" height="14" fill="var(--swatch)"/>
      <rect x="365" y="28" width="14" height="20" fill="var(--swatch)"/>
      <rect x="425" y="44" width="32" height="48" fill="#1a1410"/>
      <Wheel cx={55} cy={100} r={10}/>
      <Wheel cx={100} cy={100} r={10}/>
      <Wheel cx={175} cy={100} r={12}/>
      <Wheel cx={230} cy={100} r={22} spokes/>
      <Wheel cx={290} cy={100} r={22} spokes/>
      <Wheel cx={350} cy={100} r={22} spokes/>
      <Wheel cx={415} cy={100} r={11}/>
      <rect x="190" y="98" width="230" height="3" fill="#1a1410"/>
    </g>
  );
}

function Deltic() {
  return (
    <g>
      {/* Hump diesel body */}
      <path d="M 20 92 L 20 60 Q 22 40 50 40 L 130 40 L 145 30 L 440 30 L 455 40 L 480 40 Q 482 60 482 92 Z" fill="var(--swatch)"/>
      <rect x="20" y="92" width="462" height="4" fill="#1a1410"/>
      {/* Cab windows */}
      <rect x="32" y="44" width="80" height="14" fill="#efe6d3"/>
      <rect x="395" y="44" width="80" height="14" fill="#efe6d3"/>
      {/* Body grilles */}
      {[160, 200, 240, 280, 320, 360].map(x => (
        <rect key={x} x={x} y="50" width="22" height="34" fill="#1a1410"/>
      ))}
      {/* Bogies */}
      <Wheel cx={70} cy={100} r={9}/>
      <Wheel cx={110} cy={100} r={9}/>
      <Wheel cx={150} cy={100} r={9}/>
      <Wheel cx={350} cy={100} r={9}/>
      <Wheel cx={390} cy={100} r={9}/>
      <Wheel cx={430} cy={100} r={9}/>
    </g>
  );
}

function HST() {
  return (
    <g>
      {/* Iconic raked nose */}
      <path d="M 20 92 L 20 56 L 60 38 L 460 38 Q 478 38 478 50 L 478 92 Z" fill="var(--swatch)"/>
      <rect x="20" y="76" width="458" height="6" fill="#efe6d3"/>
      {/* Cab window */}
      <path d="M 30 56 L 60 42 L 100 42 L 100 56 Z" fill="#1a1410"/>
      {/* Side windows */}
      {Array.from({length: 14}).map((_, i) => (
        <rect key={i} x={130 + i*23} y="50" width="14" height="14" fill="#1a1410"/>
      ))}
      <Wheel cx={70} cy={100} r={8}/>
      <Wheel cx={105} cy={100} r={8}/>
      <Wheel cx={395} cy={100} r={8}/>
      <Wheel cx={430} cy={100} r={8}/>
    </g>
  );
}

function IC225() {
  return (
    <g>
      {/* Class 91 angular nose */}
      <path d="M 20 92 L 20 50 L 80 36 L 470 36 L 478 48 L 478 92 Z" fill="var(--swatch)"/>
      <rect x="20" y="82" width="458" height="4" fill="#efe6d3"/>
      <path d="M 30 50 L 80 40 L 110 40 L 110 56 L 30 56 Z" fill="#1a1410"/>
      {Array.from({length: 13}).map((_, i) => (
        <rect key={i} x={140 + i*24} y="48" width="14" height="14" fill="#1a1410"/>
      ))}
      <Wheel cx={70} cy={100} r={8}/>
      <Wheel cx={110} cy={100} r={8}/>
      <Wheel cx={395} cy={100} r={8}/>
      <Wheel cx={430} cy={100} r={8}/>
    </g>
  );
}

function Azuma() {
  return (
    <g>
      <path d="M 20 92 L 20 56 Q 22 42 40 36 L 60 30 L 460 30 Q 480 36 480 56 L 480 92 Z" fill="var(--swatch)"/>
      <rect x="20" y="80" width="460" height="3" fill="#efe6d3"/>
      <path d="M 28 56 L 60 38 L 100 38 L 100 56 Z" fill="#1a1410"/>
      {Array.from({length: 12}).map((_, i) => (
        <rect key={i} x={140 + i*26} y="46" width="18" height="14" fill="#1a1410"/>
      ))}
      <Wheel cx={70} cy={100} r={8}/>
      <Wheel cx={105} cy={100} r={8}/>
      <Wheel cx={395} cy={100} r={8}/>
      <Wheel cx={430} cy={100} r={8}/>
    </g>
  );
}

// ---------- Accidents ----------

function Accidents() {
  const incidents = [
    {
      title: 'Abbots Ripton',
      date: '21 January 1876',
      location: 'Abbots Ripton, between Huntingdon and Peterborough',
      summary: 'In a heavy snowstorm, GNR signals froze in the "all clear" position. A coal train, an Edinburgh-bound express and a fast goods all met in the same block within minutes. Thirteen dead. Drove the industry away from "normally clear" signals towards the modern "normally at danger" rule.',
      casualties: '13 killed',
      tone: 'historic',
    },
    {
      title: 'Grantham Disaster',
      date: '19 September 1906',
      location: 'Grantham',
      summary: 'A GNR night express runs through Grantham at line speed instead of stopping, derails on a 15-mph crossover, and burns. Fourteen die. Cause never definitively established — the driver and fireman both perish.',
      casualties: '14 killed',
      tone: 'historic',
    },
    {
      title: 'Goswick',
      date: '26 October 1947',
      location: 'Goswick, between Berwick and Edinburgh',
      summary: 'The 10:00 King\u2019s Cross\u2013Edinburgh "Flying Scotsman" overran restrictive signals approaching a diversion at Goswick and took the 15 mph crossover at over 60 mph. Twenty-eight died. Direct contributor to the development of the BR Automatic Warning System.',
      casualties: '28 killed',
      tone: 'historic',
    },
    {
      title: 'Hatfield',
      date: '17 October 2000',
      location: 'Just south of Hatfield, Hertfordshire',
      summary: 'GNER 12:10 King’s Cross–Leeds derails at 115 mph. The rail had shattered along multiple "rolling-contact fatigue" cracks Railtrack knew about and had a replacement scheduled for. Four killed. Within days, 1,800 emergency speed restrictions are imposed across Britain. Railtrack goes into administration; Network Rail is born.',
      casualties: '4 killed, 70+ injured',
      tone: 'modern',
    },
    {
      title: 'Great Heck (Selby)',
      date: '28 February 2001',
      location: 'Great Heck, North Yorkshire (M62 overbridge)',
      summary: 'A Land Rover towing a trailer leaves the M62, comes to rest on the up line. The 04:45 Newcastle–King’s Cross hits it at ~125 mph, partially derails, drifts across into a 1,800-tonne Freightliner coal train. Closing speed 142 mph — the highest of any UK rail accident. Ten dead, including both drivers. New safety standards for road-over-rail bridges follow.',
      casualties: '10 killed, 82 injured',
      tone: 'modern',
    },
    {
      title: 'Potters Bar',
      date: '10 May 2002',
      location: 'Potters Bar, Hertfordshire',
      summary: 'WAGN 12:45 King’s Cross–King’s Lynn derails on faulty points at the north end of the station; the rear coach jackknifes onto the platform. Seven killed. Maintenance contractor Jarvis blamed.',
      casualties: '7 killed',
      tone: 'modern',
    },
  ];

  return (
    <section className="accidents-section">
      <header className="section-head">
        <div className="sh-mark">VI.</div>
        <h2>The dark register</h2>
        <p className="sh-lede">Every line of any age has a list of names. These are the events that shaped how Britain runs its railways today.</p>
      </header>

      <div className="acc-grid">
        {incidents.map((a, i) => (
          <article key={i} className={`acc-card tone-${a.tone}`}>
            <div className="acc-date">{a.date}</div>
            <h3>{a.title}</h3>
            <div className="acc-loc">{a.location}</div>
            <div className="acc-cas">{a.casualties}</div>
            <p>{a.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------- People ----------

function People() {
  return (
    <section className="people-section">
      <header className="section-head">
        <div className="sh-mark">VII.</div>
        <h2>The people who built it</h2>
        <p className="sh-lede">Engineers, financiers, schemers, fraudsters. The cast list is sprawling — these are the names you will keep meeting.</p>
      </header>

      <div className="people-grid">
        {PEOPLE.map((p, i) => (
          <article key={i} className="person-card">
            <div className="pc-num">{String(i+1).padStart(2,'0')}</div>
            <h4>{p.name}</h4>
            <div className="pc-role">{p.role}</div>
            <div className="pc-dates">{p.dates}</div>
            <p>{p.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------- Facts ----------

function Facts() {
  return (
    <section className="facts-section">
      <header className="section-head">
        <div className="sh-mark">VIII.</div>
        <h2>Things you can carry home</h2>
        <p className="sh-lede">A round-up of trivia, oddities and oft-quoted numbers.</p>
      </header>

      <div className="facts-grid">
        {FACTS.map((f, i) => (
          <div key={i} className="fact">
            <div className="fact-k">{f.k}</div>
            <div className="fact-v">{f.v}</div>
          </div>
        ))}
      </div>

      <div className="trivia">
        <h4>Other oddities</h4>
        <ul>
          <li>The boundary between GNR and NER metal was famously described by GNR chairman Edmund Denison as "a ploughed field four miles north of Doncaster" — that field is still the engineering boundary between Network Rail’s LNE and Eastern routes.</li>
          <li>Mallard’s 126-mph run on 3 July 1938 wasn’t a publicity stunt — it was a brake test. The world record was a by-product.</li>
          <li>The Class 91 locomotive that pulled the Hatfield train was, four months later, leading the Newcastle express that crashed at Great Heck. It was repaired both times and ran on for two more decades. Crews nicknamed it "Lucky".</li>
          <li>Until 1906, Newcastle-bound expresses had to reverse at Newcastle Central to continue north — the King Edward VII Bridge fixed that after fifty-six years of stopping and shuffling.</li>
          <li>Welwyn North tunnel is still only two tracks wide. Every plan to four-track it has been quietly shelved since the 1970s. It is the single biggest capacity bottleneck on the line.</li>
          <li>The Azuma trains that operate the line today are built at Newton Aycliffe, County Durham — a few miles from where the Stockton & Darlington Railway opened in 1825.</li>
        </ul>
      </div>
    </section>
  );
}

// ---------- Hero ----------

function Hero() {
  // Constrain to the construction period — the route is built between 1841 and 1852.
  // Linger at the finished state before looping.
  const START = 1840, END = 1854, HOLD_MS = 2200;
  const [heroYear, setHeroYear] = useState(START);
  useEffect(() => {
    let id;
    let y = START;
    let holdUntil = 0;
    let last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      if (now < holdUntil) {
        id = requestAnimationFrame(step);
        return;
      }
      y += dt * 2.2;          // ~2 years per second — slow enough to read
      if (y >= END) {
        y = END;
        holdUntil = now + HOLD_MS;
        setHeroYear(y);
        // After hold, snap back to start
        setTimeout(() => { y = START; setHeroYear(START); }, HOLD_MS);
      } else {
        setHeroYear(y);
      }
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <header className="hero">
      <div className="hero-left">
        <div className="kicker">An interactive history</div>
        <h1>The East Coast<br/>Main Line</h1>
        <div className="rule"></div>
        <p className="sub">393 miles of iron between London King’s Cross and Edinburgh Waverley. Two centuries of three competing railway companies, a world steam record, a privatisation soap opera and the longest construction site in the world. This is everything that’s happened on it.</p>
        <div className="hero-stats">
          <div><span>1825</span> First mile of track at Darlington</div>
          <div><span>1850</span> Through route physically continuous</div>
          <div><span>1991</span> Wires reach Edinburgh</div>
        </div>
        <div className="scroll-hint">Scroll down ↓</div>
      </div>
      <div className="hero-right">
        <MapView year={Math.floor(heroYear)} withCompanies={false}/>
        <div className="hero-yeartag">{Math.floor(heroYear)}</div>
      </div>
    </header>
  );
}

// ---------- Root ----------

function App() {
  return (
    <main className="root" data-screen-label="01 ECML History">
      <Hero/>

      <section className="scrubber-wrap">
        <header className="section-head">
          <div className="sh-mark">I.</div>
          <h2>How the line was built</h2>
          <p className="sh-lede">Drag the year. Watch the map fill in. The three colours — burgundy for the North British, bottle-green for the North Eastern, navy for the Great Northern — show where each company laid the metal.</p>
        </header>
        <YearScrubber/>
      </section>

      <Timeline/>
      <Companies/>
      <OperatorsStrip/>
      <Locos/>
      <Accidents/>
      <People/>
      <Facts/>

      <footer className="ecml-footer">
        <div>Compiled from Wikipedia (East Coast Main Line, individual incident articles, NBR / NER / GNR / LNER), the NBR Study Group, the Great Northern Railway Society, the Railway Safety and Standards Board, BBC News and Network Rail public engineering reports.</div>
        <div>An exhibition page — not affiliated with LNER, Network Rail or any rail operator.</div>
      </footer>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App/>);
